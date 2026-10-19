// Runs Clang/LLD (compiled to WebAssembly by YoWASP) off the main thread.
/// <reference lib="webworker" />
import { inputFingerprint } from './buildInputs';
import type { ClangJob } from './clang';

type Tree = { [name: string]: Tree | Uint8Array | string };

interface ClangModule {
  runClang: (args: string[], files: Tree, opts: Record<string, unknown>) => Promise<Tree>;
  runLLVM: (args: string[], files: Tree, opts: Record<string, unknown>) => Promise<Tree>;
}

let clang: Promise<ClangModule> | null = null;
let runtime: Promise<Tree> | null = null;
let base = '/';
let queue = Promise.resolve();
let workspace: { id: number; files: Tree; fingerprint: Promise<string | null> } | null = null;

interface CompileRequest {
  id: number;
  jobs: ClangJob[];
  files?: Tree;
  workspace: number;
  outputs: string[];
  force?: boolean;
}

interface CachedResult {
  text: string;
  outputs: Record<string, Uint8Array>;
  bytes: number;
}

const RESULT_CACHE_BYTES = 32 * 1024 * 1024;
const RESULT_CACHE_ENTRIES = 64;
const results = new Map<string, CachedResult>();
let resultBytes = 0;

function remember(key: string, text: string, outputs: Record<string, Uint8Array>) {
  const bytes = new TextEncoder().encode(text).byteLength + Object.values(outputs).reduce((total, data) => total + data.byteLength, 0);
  if (bytes > RESULT_CACHE_BYTES) return;
  const previous = results.get(key);
  if (previous) { resultBytes -= previous.bytes; results.delete(key); }
  while (results.size && (results.size >= RESULT_CACHE_ENTRIES || resultBytes + bytes > RESULT_CACHE_BYTES)) {
    const oldest = results.keys().next().value!;
    resultBytes -= results.get(oldest)!.bytes;
    results.delete(oldest);
  }
  results.set(key, { text, outputs, bytes });
  resultBytes += bytes;
}

function finish(id: number, code: number, text: string, outputs: Record<string, Uint8Array>, cacheHit = false) {
  // Only transfer copies; cached artifacts must remain usable on the worker.
  const copies: Record<string, Uint8Array> = {};
  const transfer: Transferable[] = [];
  for (const [path, data] of Object.entries(outputs)) {
    const copy = data.slice(); copies[path] = copy; transfer.push(copy.buffer);
  }
  if (text) post({ type: 'output', id, text });
  post({ type: 'done', id, code, text, outputs: copies, cacheHit }, transfer);
}

function post(msg: unknown, transfer: Transferable[] = []) {
  (self as unknown as Worker).postMessage(msg, transfer);
}

async function loadRuntime(): Promise<Tree> {
  const response = await fetch(base + 'runtime/manifest.json');
  if (!response.ok) throw new Error(`Runtime manifest: HTTP ${response.status}`);
  const manifest = await response.json();
  const t: Tree = {};
  await Promise.all(
    (manifest.files as string[]).map(async (f) => {
      const response = await fetch(base + 'runtime/' + f + '?v=' + manifest.version);
      if (!response.ok) throw new Error(`Runtime ${f}: HTTP ${response.status}`);
      const data = new Uint8Array(await response.arrayBuffer());
      const parts = f.split('/');
      let dir = t;
      for (const p of parts.slice(0, -1)) dir = (dir[p] ??= {}) as Tree;
      dir[parts[parts.length - 1]] = data;
    }),
  );
  return t;
}

function compilerBundleUrl(): string {
  // VITE_COMPILER_BASE lets a static host serve the ~100 MiB toolchain from a CDN
  // instead of bundling it (see DEPLOY.md).
  const remote = import.meta.env.VITE_COMPILER_BASE as string | undefined;
  return remote ? remote.replace(/\/?$/, '/') + 'bundle.js' : base + 'compiler/bundle.js';
}

function loadClang(): Promise<ClangModule> {
  if (!clang) {
    clang = (async () => {
      const mod = (await import(/* @vite-ignore */ compilerBundleUrl())) as ClangModule;
      // Warm up: forces download + compilation of the toolchain
      let last = 0;
      await mod.runClang(['clang', '--version'], {}, {
        stdout: null,
        fetchProgress: (e: { totalLength: number; doneLength: number }) => {
          const now = performance.now();
          if (now - last > 100 || e.doneLength === e.totalLength) {
            last = now;
            post({ type: 'progress', done: e.doneLength, total: e.totalLength });
          }
        },
      });
      return mod;
    })();
    clang.catch(() => {
      clang = null;
    });
  }
  return clang;
}

function pick(tree: Tree, path: string): Uint8Array | undefined {
  let cur: Tree | Uint8Array | string | undefined = tree;
  for (const p of path.split('/')) {
    if (!cur || typeof cur === 'string' || cur instanceof Uint8Array) return undefined;
    cur = cur[p];
  }
  if (typeof cur === 'string') return new TextEncoder().encode(cur);
  return cur instanceof Uint8Array ? cur : undefined;
}

async function compile(m: CompileRequest) {
  const { id, jobs, outputs } = m;
  const dec = new TextDecoder();
  let text = '';
  const sink = (b: Uint8Array | null) => {
    if (b) {
      const s = dec.decode(b, { stream: true });
      text += s;
    }
  };
  try {
    if (m.files) workspace = { id: m.workspace, files: m.files, fingerprint: inputFingerprint(m.files) };
    if (!workspace || workspace.id !== m.workspace) throw new Error('Compiler workspace is unavailable');
    const files = workspace.files;
    const fingerprint = await workspace.fingerprint;
    const key = fingerprint ? JSON.stringify([fingerprint, jobs, outputs]) : null;
    const cached = !m.force && key ? results.get(key) : undefined;
    if (cached && key) {
      results.delete(key); results.set(key, cached);
      finish(id, 0, cached.text, cached.outputs, true);
      return;
    }
    const mod = await loadClang();
    const rt = await (runtime ??= loadRuntime());
    let tree: Tree = { ...files, devcpp: rt };
    let code = 0;
    for (const job of jobs) {
      try {
        const run = job.tool === 'llvm' ? mod.runLLVM : mod.runClang;
        tree = await run(job.args, tree, { stdout: sink, stderr: sink, decodeASCII: false });
      } catch (e) {
        const ex = e as { code?: number; files?: Tree; message?: string };
        code = typeof ex.code === 'number' ? ex.code : 1;
        if (typeof ex.code !== 'number') sink(new TextEncoder().encode(String(ex.message ?? e) + '\n'));
        break;
      }
    }
    text += dec.decode();
    const out: Record<string, Uint8Array> = {};
    if (code === 0) {
      for (const o of outputs) {
        const d = pick(tree, o);
        if (d) {
          out[o] = d;
        }
      }
    }
    if (key && code === 0 && outputs.every((path) => out[path])) remember(key, text, out);
    finish(id, code, text, out);
  } catch (e) {
    finish(id, -1, text + String((e as Error)?.message ?? e), {});
  }
}

self.onmessage = (ev: MessageEvent) => {
  const m = ev.data;
  if (m.type === 'init') {
    base = m.base;
    runtime ??= loadRuntime();
    void Promise.all([loadClang(), runtime]).then(
      () => post({ type: 'ready' }),
      (e) => post({ type: 'loadError', message: String((e as Error)?.message ?? e) }),
    );
  } else if (m.type === 'compile') {
    // Requests share one workspace and must complete in submission order.
    queue = queue.then(() => compile(m));
  } else if (m.type === 'clearCache') {
    queue = queue.then(() => { results.clear(); resultBytes = 0; workspace = null; });
  }
};
