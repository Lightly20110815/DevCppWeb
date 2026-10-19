// Executes a compiled program (wasm32-wasip1) and connects it to the console window.
// Keyboard input is passed through a SharedArrayBuffer so the program can block on it.
/// <reference lib="webworker" />
import { WASI, WASIProcExit, Fd, File, Directory, PreopenDirectory, wasi } from '@bjorn3/browser_wasi_shim';
import type { Inode } from '@bjorn3/browser_wasi_shim';
import { CTL, CTL_INTS, KEYSTATE_OFFSET, DATA_OFFSET, DATA_SIZE, trapToExitCode } from './protocol';
import type { RunRequest } from './protocol';

let ctl: Int32Array;
let keyState: Uint8Array;
let data: Uint8Array;
let memory: WebAssembly.Memory;
let outBuf: Uint8Array[] = [];
let outLen = 0;
let lastFlush = 0;
let pendingScan = -1;
let startTime = 0;

class ExitSignal {
  constructor(readonly code: number) {}
}

function post(msg: unknown, transfer: Transferable[] = []) {
  (self as unknown as Worker).postMessage(msg, transfer);
}

function flush() {
  if (!outLen) return;
  const all = new Uint8Array(outLen);
  let o = 0;
  for (const b of outBuf) {
    all.set(b, o);
    o += b.length;
  }
  outBuf = [];
  outLen = 0;
  lastFlush = performance.now();
  post({ type: 'out', data: all }, [all.buffer]);
}

function write(bytes: Uint8Array) {
  outBuf.push(bytes.slice());
  outLen += bytes.length;
  if (outLen > 8192 || performance.now() - lastFlush > 25) flush();
}

/** Sends a request to the console and blocks until it answers. Returns ctl[RESULT]. */
function request(msg: Record<string, unknown>): number {
  flush();
  Atomics.store(ctl, CTL.FLAG, 0);
  post({ type: 'req', ...msg });
  while (Atomics.load(ctl, CTL.FLAG) === 0) Atomics.wait(ctl, CTL.FLAG, 0, 1000);
  Atomics.store(ctl, CTL.FLAG, 0);
  return Atomics.load(ctl, CTL.RESULT);
}

class Stdin extends Fd {
  private buf = new Uint8Array(0);
  private eof = false;
  fd_fdstat_get() {
    const st = new wasi.Fdstat(wasi.FILETYPE_CHARACTER_DEVICE, 0);
    st.fs_rights_base = BigInt(wasi.RIGHTS_FD_READ);
    return { ret: 0, fdstat: st };
  }
  fd_read(size: number) {
    if (!this.buf.length) {
      if (this.eof) {
        this.eof = false;
        return { ret: 0, data: new Uint8Array(0) };
      }
      const n = request({ op: 'read', max: Math.min(size, DATA_SIZE) });
      if (n <= 0) return { ret: 0, data: new Uint8Array(0) };
      this.buf = data.slice(0, n);
    }
    const take = this.buf.slice(0, size);
    this.buf = this.buf.slice(take.length);
    return { ret: 0, data: take };
  }
}

class ConsoleOut extends Fd {
  constructor(readonly fdNo: number) {
    super();
  }
  fd_fdstat_get() {
    const st = new wasi.Fdstat(wasi.FILETYPE_CHARACTER_DEVICE, 0);
    st.fs_rights_base = BigInt(wasi.RIGHTS_FD_WRITE);
    return { ret: 0, fdstat: st };
  }
  fd_write(d: Uint8Array) {
    write(d);
    return { ret: 0, nwritten: d.length };
  }
}

function readStr(ptr: number, len: number) {
  return new TextDecoder().decode(new Uint8Array(memory.buffer, ptr, len));
}

function writeStr(ptr: number, size: number, s: string) {
  const bytes = new TextEncoder().encode(s);
  const n = Math.min(bytes.length, Math.max(0, size - 1));
  new Uint8Array(memory.buffer, ptr, n).set(bytes.subarray(0, n));
  if (size > 0) new Uint8Array(memory.buffer)[ptr + n] = 0;
  return n;
}

function snapshot(dir: Directory, prefix: string, out: Record<string, Uint8Array>, original: Map<string, Uint8Array>, seen: Set<string>) {
  for (const [name, node] of dir.contents) {
    const path = prefix ? prefix + '/' + name : name;
    if (node instanceof Directory) snapshot(node, path, out, original, seen);
    else if (node instanceof File) {
      seen.add(path);
      const orig = original.get(path);
      if (!orig || orig.length !== node.data.length || node.data.some((byte, index) => byte !== orig[index])) out[path] = node.data;
    }
  }
}

self.onmessage = async (ev: MessageEvent) => {
  const req = ev.data as RunRequest;
  if (req.type !== 'run') return;
  ctl = new Int32Array(req.sab, 0, CTL_INTS);
  keyState = new Uint8Array(req.sab, KEYSTATE_OFFSET, 256);
  data = new Uint8Array(req.sab, DATA_OFFSET, DATA_SIZE);
  lastFlush = performance.now();

  // working directory of the program (files next to the .exe)
  const original = new Map<string, Uint8Array>();
  const build = (files: Record<string, Uint8Array>) => {
    const root = new Map<string, Inode>();
    for (const [path, content] of Object.entries(files)) {
      const parts = path.split('/');
      let dir = root;
      for (const p of parts.slice(0, -1)) {
        let d = dir.get(p);
        if (!(d instanceof Directory)) {
          d = new Directory(new Map());
          dir.set(p, d);
        }
        dir = (d as Directory).contents;
      }
      const f = new File(content);
      original.set(path, content.slice());
      dir.set(parts[parts.length - 1], f);
    }
    return root;
  };
  const rootDir = new PreopenDirectory('/', build(req.files));
  const fds: Fd[] = [new Stdin(), new ConsoleOut(1), new ConsoleOut(2), rootDir];
  const w = new WASI(req.args, req.env, fds, { debug: false });

  const imp = w.wasiImport as Record<string, (...a: any[]) => any>;
  // real sleeping instead of busy waiting (nanosleep, std::this_thread::sleep_for, ...)
  imp.poll_oneoff = (inPtr: number, outPtr: number, n: number, neventsPtr: number) => {
    const view = new DataView(memory.buffer);
    let best = -1;
    let bestMs = Infinity;
    for (let i = 0; i < n; i++) {
      const sub = inPtr + i * 48;
      if (view.getUint8(sub + 8) !== wasi.EVENTTYPE_CLOCK) continue;
      const timeout = view.getBigUint64(sub + 24, true);
      const flags = view.getUint16(sub + 40, true);
      let ms = Number(timeout) / 1e6;
      if (flags & 1) ms = Math.max(0, ms - Date.now());
      if (ms < bestMs) {
        bestMs = ms;
        best = i;
      }
    }
    if (best < 0) return wasi.ERRNO_NOTSUP;
    flush();
    if (bestMs > 0) Atomics.wait(ctl, CTL.SLEEP, 0, bestMs);
    const v = new DataView(memory.buffer);
    const sub = inPtr + best * 48;
    v.setBigUint64(outPtr, v.getBigUint64(sub, true), true);
    v.setUint16(outPtr + 8, 0, true);
    v.setUint8(outPtr + 10, wasi.EVENTTYPE_CLOCK);
    v.setUint32(neventsPtr, 1, true);
    return 0;
  };
  imp.proc_exit = (code: number) => {
    throw new ExitSignal(code);
  };
  imp.sched_yield = () => 0;

  const devcpp: Record<string, (...a: any[]) => any> = {
    system: (p: number, l: number) => request({ op: 'system', cmd: readStr(p, l) }),
    sleep: (ms: number) => {
      flush();
      if (ms > 0) Atomics.wait(ctl, CTL.SLEEP, 0, ms >>> 0);
    },
    getch: (echo: number) => {
      if (pendingScan >= 0) {
        const s = pendingScan;
        pendingScan = -1;
        return s;
      }
      const v = request({ op: 'getch', echo: !!echo });
      // extended keys come back as 0xE0 << 8 | scan
      if (v > 0xff) {
        pendingScan = v & 0xff;
        return (v >> 8) & 0xff;
      }
      return v;
    },
    kbhit: () => {
      flush();
      return pendingScan >= 0 || Atomics.load(ctl, CTL.KEYS) > 0 ? 1 : 0;
    },
    ungetch: (c: number) => {
      request({ op: 'ungetch', c });
    },
    set_attr: (a: number) => {
      flush();
      post({ type: 'req', op: 'attr', attr: a, async: true });
    },
    get_attr: () => request({ op: 'getattr' }),
    gotoxy: (x: number, y: number) => {
      flush();
      post({ type: 'req', op: 'gotoxy', x, y, async: true });
    },
    get_cursor: () => request({ op: 'getcursor' }),
    screen_size: () => request({ op: 'screensize' }),
    messagebox: (tp: number, tl: number, cp: number, cl: number, type: number) =>
      request({ op: 'messagebox', text: readStr(tp, tl), caption: readStr(cp, cl), mbType: type }),
    set_title: (p: number, l: number) => {
      post({ type: 'req', op: 'title', title: readStr(p, l), async: true });
    },
    get_title: (p: number, size: number) => writeStr(p, size, req.title),
    keystate: (vk: number) => (keyState[vk & 0xff] ? -32767 : 0),
    cursor_visible: (v: number, size: number) => {
      flush();
      post({ type: 'req', op: 'cursor', visible: !!v, size, async: true });
    },
    cursor_info: () => request({ op: 'cursorinfo' }),
    beep: (f: number, d: number) => {
      post({ type: 'req', op: 'beep', freq: f, dur: d, async: true });
      if (d > 0) Atomics.wait(ctl, CTL.SLEEP, 0, d);
    },
    fill: (ch: number, attr: number, count: number, x: number, y: number, mode: number) => {
      flush();
      post({ type: 'req', op: 'fill', ch, attr, count, x, y, mode, async: true });
    },
    exe_path: (p: number, size: number) => writeStr(p, size, req.exePath),
    now_ms: () => Date.now(),
    perf_now: () => performance.now(),
    local_offset: () => new Date().getTimezoneOffset(),
    abort: (code: number) => {
      throw new ExitSignal(code);
    },
  };

  let code = 0;
  try {
    const mod = req.module ?? (await WebAssembly.compile(req.wasm! as Uint8Array<ArrayBuffer>));
    // Some modules import functions we don't know (e.g. from unusual headers); stub them
    const imports: WebAssembly.Imports = { wasi_snapshot_preview1: imp, devcpp };
    for (const i of WebAssembly.Module.imports(mod)) {
      if (i.kind !== 'function') continue;
      const ns = (imports[i.module] ??= {}) as Record<string, unknown>;
      if (!(i.name in ns)) {
        ns[i.name] = () => {
          write(new TextEncoder().encode(`\nUnsupported function: ${i.module}.${i.name}\n`));
          throw new ExitSignal(3);
        };
      }
    }
    const inst = await WebAssembly.instantiate(mod, imports);
    memory = inst.exports.memory as WebAssembly.Memory;
    startTime = performance.now();
    post({ type: 'started' });
    try {
      w.start(inst as unknown as { exports: { memory: WebAssembly.Memory; _start: () => unknown } });
      code = 0;
    } catch (e) {
      if (e instanceof ExitSignal) code = e.code;
      else if (e instanceof WASIProcExit) code = e.code;
      else code = trapToExitCode(e);
    }
  } catch (e) {
    flush();
    post({ type: 'error', message: String((e as Error)?.message ?? e) });
    return;
  }
  const elapsed = (performance.now() - startTime) / 1000;
  flush();
  const changed: Record<string, Uint8Array> = {};
  const seen = new Set<string>();
  let deleted: string[] = [];
  try {
    snapshot(rootDir.dir, '', changed, original, seen);
    deleted = [...original.keys()].filter((path) => !seen.has(path));
  } catch {
    /* ignore */
  }
  post({ type: 'exit', code: code >>> 0, elapsed, files: changed, deleted });
};
