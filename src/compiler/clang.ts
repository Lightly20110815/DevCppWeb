// Main-thread side of the in-browser toolchain.
import CompilerWorker from './compiler.worker.ts?worker';

type Tree = { [name: string]: Tree | Uint8Array | string };

export interface ClangJob {
  tool: 'clang' | 'llvm';
  args: string[];
}

export interface ClangResult {
  code: number;
  text: string;
  outputs: Record<string, Uint8Array>;
  cacheHit?: boolean;
}

export interface ClangRunOptions {
  force?: boolean;
}

type State = 'idle' | 'loading' | 'ready' | 'error';

class Toolchain {
  private worker: Worker | null = null;
  state: State = 'idle';
  progress = { done: 0, total: 0 };
  error = '';
  private ready: Promise<void> | null = null;
  private rejectLoad: ((error: Error) => void) | null = null;
  private nextId = 1;
  private workspace: { files: Tree; id: number } | null = null;
  private jobs = new Map<number, { resolve: (r: ClangResult) => void; onText?: (s: string) => void }>();
  private listeners = new Set<() => void>();

  subscribe(l: () => void) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  private emit() {
    for (const l of this.listeners) l();
  }

  /** Starts downloading/compiling the toolchain in the background */
  preload(): Promise<void> {
    if (this.ready) return this.ready;
    this.state = 'loading';
    this.emit();
    this.ready = new Promise<void>((resolve, reject) => {
      this.rejectLoad = reject;
      const w = new CompilerWorker();
      this.worker = w;
      this.workspace = null;
      w.onmessage = (ev) => {
        const m = ev.data;
        switch (m.type) {
          case 'progress':
            this.progress = { done: m.done, total: m.total };
            this.emit();
            break;
          case 'ready':
            this.rejectLoad = null;
            this.state = 'ready';
            this.emit();
            resolve();
            break;
          case 'loadError':
            this.state = 'error';
            this.error = m.message;
            this.ready = null;
            this.emit();
            w.terminate();
            this.worker = null;
            this.rejectLoad = null;
            reject(new Error(m.message));
            break;
          case 'output':
            this.jobs.get(m.id)?.onText?.(m.text);
            break;
          case 'done': {
            const j = this.jobs.get(m.id);
            this.jobs.delete(m.id);
            j?.resolve({ code: m.code, text: m.text, outputs: m.outputs, cacheHit: m.cacheHit });
            break;
          }
        }
      };
      w.onerror = (e) => {
        this.state = 'error';
        this.error = e.message;
        this.ready = null;
        w.terminate();
        this.worker = null;
        this.rejectLoad = null;
        for (const [, j] of this.jobs) j.resolve({ code: -1, text: e.message, outputs: {} });
        this.jobs.clear();
        this.emit();
        reject(new Error(e.message));
      };
      w.postMessage({ type: 'init', base: new URL(import.meta.env.BASE_URL, location.href).href });
    });
    return this.ready;
  }

  async run(jobs: ClangJob[], files: Tree, outputs: string[], onText?: (s: string) => void, options: ClangRunOptions = {}): Promise<ClangResult> {
    try {
      await this.preload();
    } catch (error) {
      return { code: this.state === 'idle' ? -2 : -1, text: String((error as Error).message ?? error), outputs: {} };
    }
    const id = this.nextId++;
    return new Promise<ClangResult>((resolve) => {
      this.jobs.set(id, { resolve, onText });
      try {
        // A project's input tree is immutable throughout its translation units.
        // Send it once instead of cloning the same headers for every source file.
        const previous = this.workspace?.files === files ? this.workspace : null;
        const workspace = previous?.id ?? id;
        this.worker!.postMessage({ type: 'compile', id, jobs, files: previous ? undefined : files, workspace, outputs, force: options.force });
        if (!previous) this.workspace = { files, id: workspace };
      }
      catch (error) { this.jobs.delete(id); resolve({ code: -1, text: String((error as Error).message ?? error), outputs: {} }); }
    });
  }

  clearCache() {
    this.worker?.postMessage({ type: 'clearCache' });
    this.workspace = null;
  }

  /** Abort compilation: kill the worker (the toolchain will be reloaded from cache) */
  abort() {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
    this.workspace = null;
    this.ready = null;
    this.state = 'idle';
    this.rejectLoad?.(new Error('Compilation aborted'));
    this.rejectLoad = null;
    for (const [, j] of this.jobs) j.resolve({ code: -2, text: '', outputs: {} });
    this.jobs.clear();
    this.emit();
  }
}

export const toolchain = new Toolchain();
export type { Tree };
