// A console window process: runs a program in a worker, emulates conhost input/output and
// ConsolePauser ("Process exited after ... seconds with return value ...").
import { Screen, charWidth, formatG4, beep } from './screen';
import { CTL, CTL_INTS, KEYSTATE_OFFSET, DATA_OFFSET, DATA_SIZE, SAB_SIZE, STATUS_CONTROL_C_EXIT } from '../compiler/protocol';
import { Lang } from '../lang/lang';
import { MessageBox } from '../os/messagebox';
import RunnerWorker from '../compiler/runner.worker.ts?worker';

export interface KeyEvt {
  key: string; // KeyboardEvent.key or a single character
  code?: number; // getch code
  ext?: number; // extended scan code (arrow keys etc.)
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
}

type Pending =
  | { op: 'read'; max: number }
  | { op: 'getch'; echo: boolean }
  | { op: 'pause'; then: () => void }
  | null;

export interface RunOptions {
  wasm: Uint8Array;
  exePath: string;
  args: string[];
  files: Record<string, Uint8Array>;
  pause: boolean;
  onExit?: (code: number, files: Record<string, Uint8Array>, deleted?: string[]) => void;
  onClose?: () => void;
}

const EXT_KEYS: Record<string, [number, number]> = {
  ArrowUp: [224, 72], ArrowDown: [224, 80], ArrowLeft: [224, 75], ArrowRight: [224, 77],
  Home: [224, 71], End: [224, 79], PageUp: [224, 73], PageDown: [224, 81], Insert: [224, 82], Delete: [224, 83],
  F1: [0, 59], F2: [0, 60], F3: [0, 61], F4: [0, 62], F5: [0, 63], F6: [0, 64], F7: [0, 65], F8: [0, 66],
  F9: [0, 67], F10: [0, 68], F11: [224, 133], F12: [224, 134],
};

const VK: Record<string, number> = {
  Backspace: 8, Tab: 9, Enter: 13, Shift: 16, Control: 17, Alt: 18, Pause: 19, CapsLock: 20, Escape: 27, ' ': 32,
  PageUp: 33, PageDown: 34, End: 35, Home: 36, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
  Insert: 45, Delete: 46,
};

export function vkOf(e: KeyboardEvent): number {
  if (VK[e.key] !== undefined) return VK[e.key];
  if (/^F\d+$/.test(e.key)) return 0x6f + parseInt(e.key.slice(1), 10);
  if (/^Key[A-Z]$/.test(e.code)) return e.code.charCodeAt(3);
  if (/^Digit\d$/.test(e.code)) return e.code.charCodeAt(5);
  if (/^Numpad\d$/.test(e.code)) return 0x60 + parseInt(e.code.slice(6), 10);
  return 0;
}

export function pauseText() {
  if (/^chinese_tc/i.test(Lang.file)) return '請按任意鍵繼續 . . . ';
  if (Lang.isChinese) return '请按任意键继续. . .';
  return 'Press any key to continue . . . ';
}

export class ConsoleSession {
  screen = new Screen(120, 30);
  title: string;
  worker: Worker | null = null;
  sab = new SharedArrayBuffer(SAB_SIZE);
  ctl = new Int32Array(this.sab, 0, CTL_INTS);
  keyState = new Uint8Array(this.sab, KEYSTATE_OFFSET, 256);
  data = new Uint8Array(this.sab, DATA_OFFSET, DATA_SIZE);
  queue: KeyEvt[] = [];
  pending: Pending = null;
  state: 'running' | 'paused' | 'done' = 'running';
  exitCode = 0;
  history: string[] = [];
  private histIdx = -1;
  // cooked mode line editing
  private line: string[] = [];
  private linePos = 0;
  private lineX = 0;
  private lineY = 0;
  private lineDrawn = 0;
  private listeners = new Set<() => void>();
  private ungot: number[] = [];
  opts: RunOptions;
  windowId = 0;

  constructor(opts: RunOptions) {
    this.opts = opts;
    this.title = opts.exePath;
  }

  subscribe(l: () => void) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  changed() {
    for (const l of this.listeners) l();
  }

  start() {
    const w = new RunnerWorker();
    this.worker = w;
    w.onmessage = (ev) => this.onWorker(ev.data);
    w.onerror = (ev) => {
      this.screen.writeText(`\n${ev.message}\n`);
      this.finish(3, {});
    };
    w.postMessage({
      type: 'run',
      wasm: this.opts.wasm,
      args: [this.opts.exePath, ...this.opts.args],
      env: [],
      files: this.opts.files,
      sab: this.sab,
      exePath: this.opts.exePath,
      title: this.title,
    });
  }

  private respond(v: number) {
    Atomics.store(this.ctl, CTL.RESULT, v);
    Atomics.store(this.ctl, CTL.FLAG, 1);
    Atomics.notify(this.ctl, CTL.FLAG);
  }

  private syncKeys() {
    Atomics.store(this.ctl, CTL.KEYS, this.queue.length + this.ungot.length);
  }

  private onWorker(m: any) {
    switch (m.type) {
      case 'out':
        this.screen.writeBytes(m.data);
        this.changed();
        break;
      case 'req':
        this.onRequest(m);
        break;
      case 'error':
        this.screen.writeText(`\n${m.message}\n`);
        this.finish(3, {});
        break;
      case 'exit':
        this.exitCode = m.code;
        this.elapsed = m.elapsed;
        this.finish(m.code, m.files ?? {}, m.deleted ?? []);
        break;
    }
  }

  elapsed = 0;

  private onRequest(m: any) {
    const s = this.screen;
    switch (m.op) {
      case 'read':
        this.pending = { op: 'read', max: m.max };
        this.beginLine();
        this.processQueue();
        break;
      case 'getch':
        this.pending = { op: 'getch', echo: m.echo };
        this.processQueue();
        break;
      case 'ungetch':
        this.ungot.push(m.c);
        this.syncKeys();
        this.respond(0);
        break;
      case 'system':
        this.runSystem(String(m.cmd));
        break;
      case 'attr':
        s.attr = m.attr & 0xff;
        break;
      case 'getattr':
        this.respond(s.attr);
        break;
      case 'gotoxy':
        s.gotoXY(m.x, m.y);
        this.changed();
        break;
      case 'getcursor':
        this.respond((s.cx & 0xffff) | ((s.cy & 0xffff) << 16));
        break;
      case 'screensize':
        this.respond((s.cols & 0xffff) | ((s.rows & 0xffff) << 16));
        break;
      case 'messagebox':
        void MessageBox(m.text, m.caption, m.mbType).then((r) => this.respond(r));
        break;
      case 'title':
        this.title = m.title;
        this.onTitle?.(m.title);
        break;
      case 'cursor':
        s.cursorVisible = m.visible;
        if (m.size > 0) s.cursorSize = Math.max(1, Math.min(100, m.size));
        this.changed();
        break;
      case 'cursorinfo':
        this.respond((s.cursorVisible ? 1 : 0) | (s.cursorSize << 1));
        break;
      case 'beep':
        beep(m.freq, m.dur);
        break;
      case 'fill':
        s.fill(String.fromCharCode(m.ch), m.attr & 0xff, m.count, m.x, m.y, m.mode);
        this.changed();
        break;
    }
  }

  onTitle?: (t: string) => void;

  // ---------------------------------------------------------------- cmd.exe commands used through system()

  private runSystem(cmdline: string) {
    const s = this.screen;
    const cmd = cmdline.trim();
    const lower = cmd.toLowerCase();
    const verb = lower.split(/\s+/)[0] ?? '';
    const arg = cmd.slice(verb.length).trim();
    const done = (code = 0) => {
      this.changed();
      this.respond(code);
    };
    switch (verb) {
      case 'pause':
        s.writeText(pauseText());
        this.changed();
        this.pending = { op: 'pause', then: () => done(0) };
        this.processQueue();
        return;
      case 'cls':
        s.clear();
        return done();
      case 'color': {
        const m = /^([0-9a-f]{1,2})$/i.exec(arg);
        if (!arg) s.setColor(0x07);
        else if (m) {
          const v = parseInt(m[1], 16);
          const bg = m[1].length === 2 ? v >> 4 : 0;
          const fg = v & 0xf;
          if (bg === fg) return done(1);
          s.setColor((bg << 4) | fg);
        }
        return done();
      }
      case 'title':
        this.title = arg;
        this.onTitle?.(arg);
        return done();
      case 'echo':
        if (/^off|on$/i.test(arg)) return done();
        s.writeText((arg === '' || arg === '.' ? '' : arg) + '\r\n');
        return done();
      case 'cd':
      case 'chdir':
        s.writeText(this.opts.exePath.replace(/\\[^\\]*$/, '') + '\r\n');
        return done();
      case 'ver':
        s.writeText('\r\nMicrosoft Windows [Version 10.0.19045.3803]\r\n');
        return done();
      case 'date':
        s.writeText(new Date().toLocaleDateString() + '\r\n');
        return done();
      case 'time':
        s.writeText(new Date().toLocaleTimeString() + '\r\n');
        return done();
      case 'mode':
        return done();
      case 'shutdown':
        return done();
      case 'exit':
        return done();
      case 'chcp':
        s.writeText((Lang.isChinese ? '活动代码页: ' : 'Active code page: ') + (/\d+/.exec(arg)?.[0] ?? '936') + '\r\n');
        return done();
      default: {
        const name = cmd.split(/\s+/)[0];
        if (!name) return done();
        s.writeText(
          Lang.isChinese
            ? `'${name}' 不是内部或外部命令，也不是可运行的程序\r\n或批处理文件。\r\n`
            : `'${name}' is not recognized as an internal or external command,\r\noperable program or batch file.\r\n`,
        );
        return done(1);
      }
    }
  }

  // ---------------------------------------------------------------- keyboard

  keyDown(e: KeyboardEvent) {
    const vk = vkOf(e);
    if (vk) this.keyState[vk] = 1;
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C') && !e.altKey) {
      if (this.state === 'running') {
        this.screen.writeText('^C');
        this.kill(STATUS_CONTROL_C_EXIT);
      }
      return;
    }
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta' || e.key === 'CapsLock') return;
    const ext = EXT_KEYS[e.key];
    let evt: KeyEvt;
    if (ext) evt = { key: e.key, code: ext[0], ext: ext[1] };
    else if (e.key === 'Enter') evt = { key: 'Enter', code: 13 };
    else if (e.key === 'Backspace') evt = { key: 'Backspace', code: 8 };
    else if (e.key === 'Escape') evt = { key: 'Escape', code: 27 };
    else if (e.key === 'Tab') evt = { key: 'Tab', code: 9 };
    else if (e.ctrlKey && /^[a-z]$/i.test(e.key)) evt = { key: e.key, code: e.key.toUpperCase().charCodeAt(0) - 64, ctrl: true };
    else return; // printable characters arrive through text input
    this.enqueue(evt);
  }

  keyUp(e: KeyboardEvent) {
    const vk = vkOf(e);
    if (vk) this.keyState[vk] = 0;
  }

  textInput(text: string) {
    for (const ch of text) {
      if (ch === '\n' || ch === '\r') this.enqueue({ key: 'Enter', code: 13 });
      else this.enqueue({ key: ch, code: ch.codePointAt(0)! });
    }
  }

  private enqueue(k: KeyEvt) {
    if (this.state === 'done') {
      // any key closes the finished console (second pause of ConsolePauser)
      if (this.pending?.op === 'pause') {
        const p = this.pending;
        this.pending = null;
        p.then();
      }
      return;
    }
    this.queue.push(k);
    this.syncKeys();
    this.processQueue();
  }

  private processQueue() {
    while (this.pending) {
      if (this.pending.op === 'getch' && this.ungot.length) {
        const c = this.ungot.shift()!;
        this.pending = null;
        this.syncKeys();
        this.respond(c);
        return;
      }
      const k = this.queue.shift();
      this.syncKeys();
      if (!k) return;
      const p = this.pending;
      if (p.op === 'pause') {
        this.pending = null;
        this.screen.writeText('\r\n');
        this.changed();
        p.then();
        return;
      }
      if (p.op === 'getch') {
        this.pending = null;
        let code = k.code ?? 0;
        if (k.ext !== undefined) {
          this.respond((code << 8) | k.ext);
          return;
        }
        if (code > 0x7f) {
          // non ASCII: hand out the UTF-8 bytes one by one
          const bytes = new TextEncoder().encode(k.key);
          code = bytes[0];
          for (let i = bytes.length - 1; i >= 1; i--) this.ungot.unshift(bytes[i]);
          this.syncKeys();
        }
        if (p.echo && code >= 32) {
          this.screen.writeText(k.key);
          this.changed();
        }
        this.respond(code);
        return;
      }
      if (p.op === 'read') this.editLine(k);
    }
  }

  private beginLine() {
    this.line = [];
    this.linePos = 0;
    this.lineX = this.screen.cx;
    this.lineY = this.screen.cy;
    this.lineDrawn = 0;
    this.histIdx = this.history.length;
  }

  private redrawLine() {
    const s = this.screen;
    s.gotoXY(this.lineX, this.lineY);
    const text = this.line.join('');
    s.writeText(text);
    // erase leftovers of a longer previous line
    const width = this.line.reduce((a, c) => a + charWidth(c), 0);
    if (this.lineDrawn > width) s.writeText(' '.repeat(this.lineDrawn - width));
    this.lineDrawn = width;
    // place the cursor at linePos
    s.gotoXY(this.lineX, this.lineY);
    let x = this.lineX;
    let y = this.lineY;
    for (const c of this.line.slice(0, this.linePos)) {
      const w = charWidth(c);
      if (x + w > s.cols) {
        x = 0;
        y++;
      }
      x += w;
      if (x >= s.cols) {
        x -= s.cols;
        y++;
      }
    }
    s.gotoXY(x, y);
    // the line may have scrolled the buffer
    if (s.cy < this.lineY) this.lineY = s.cy;
    this.changed();
  }

  private editLine(k: KeyEvt) {
    switch (k.key) {
      case 'Enter': {
        const text = this.line.join('');
        this.linePos = this.line.length;
        this.redrawLine();
        this.screen.writeText('\r\n');
        this.changed();
        if (text) this.history.push(text);
        this.pending = null;
        // Ctrl+Z at the start of a line means end of file
        let payload = text + '\n';
        const z = text.indexOf('\x1a');
        if (z >= 0) payload = text.slice(0, z);
        const bytes = new TextEncoder().encode(payload);
        const n = Math.min(bytes.length, this.data.length);
        this.data.set(bytes.subarray(0, n));
        this.respond(n);
        return;
      }
      case 'Backspace':
        if (this.linePos > 0) {
          this.line.splice(this.linePos - 1, 1);
          this.linePos--;
          this.redrawLine();
        }
        return;
      case 'Delete':
        if (this.linePos < this.line.length) {
          this.line.splice(this.linePos, 1);
          this.redrawLine();
        }
        return;
      case 'ArrowLeft':
        if (this.linePos > 0) this.linePos--;
        this.redrawLine();
        return;
      case 'ArrowRight':
        if (this.linePos < this.line.length) this.linePos++;
        this.redrawLine();
        return;
      case 'Home':
        this.linePos = 0;
        this.redrawLine();
        return;
      case 'End':
        this.linePos = this.line.length;
        this.redrawLine();
        return;
      case 'Escape':
        this.line = [];
        this.linePos = 0;
        this.redrawLine();
        return;
      case 'ArrowUp':
      case 'ArrowDown':
      case 'F3':
      case 'F8': {
        if (!this.history.length) return;
        if (k.key === 'ArrowUp' || k.key === 'F8') this.histIdx = Math.max(0, this.histIdx - 1);
        else if (k.key === 'F3') this.histIdx = this.history.length - 1;
        else this.histIdx = Math.min(this.history.length - 1, this.histIdx + 1);
        this.line = [...this.history[this.histIdx]];
        this.linePos = this.line.length;
        this.redrawLine();
        return;
      }
      case 'Tab':
        this.insertChars('\t');
        return;
      default:
        if (k.ctrl) {
          if (k.code === 26) this.insertChars('\x1a');
          return;
        }
        if (k.ext !== undefined || (k.code !== undefined && k.code < 32)) return;
        this.insertChars(k.key);
    }
  }

  private insertChars(s: string) {
    for (const c of s) {
      this.line.splice(this.linePos, 0, c === '\x1a' ? '\x1a' : c);
      this.linePos++;
    }
    // display ^Z like conhost
    const disp = this.line.map((c) => (c === '\x1a' ? '^Z' : c));
    const save = this.line;
    this.line = disp.flatMap((c) => (c === '^Z' ? ['^', 'Z'] : [c]));
    const pos = this.linePos;
    this.linePos = disp.slice(0, pos).join('').length;
    this.redrawLine();
    this.line = save;
    this.linePos = pos;
  }

  paste(text: string) {
    this.textInput(text.replace(/\r\n/g, '\n'));
  }

  // ---------------------------------------------------------------- lifetime

  /** Ctrl+C or "Stop execution": ConsolePauser dies with the program, so the window closes */
  kill(code = STATUS_CONTROL_C_EXIT) {
    if (this.state !== 'running') {
      this.close();
      return;
    }
    this.worker?.terminate();
    this.worker = null;
    this.state = 'done';
    this.exitCode = code >>> 0;
    this.pending = null;
    this.opts.onExit?.(this.exitCode, {});
    this.close();
  }

  private finish(code: number, files: Record<string, Uint8Array>, deleted: string[] = []) {
    if (this.state !== 'running') return;
    this.worker?.terminate();
    this.worker = null;
    this.state = 'done';
    this.exitCode = code >>> 0;
    this.pending = null;
    this.opts.onExit?.(this.exitCode, files, deleted);
    if (this.opts.pause) {
      const s = this.screen;
      s.attr = s.defaultAttr;
      s.writeText('\n--------------------------------');
      s.writeText(`\nProcess exited after ${formatG4(this.elapsed)} seconds with return value ${this.exitCode}\n`);
      s.writeText(pauseText());
      this.changed();
      this.pending = { op: 'pause', then: () => this.close() };
    } else this.close();
    this.changed();
  }

  onCloseWindow?: () => void;

  close() {
    this.worker?.terminate();
    this.worker = null;
    if (this.state === 'running') {
      this.state = 'done';
      this.opts.onExit?.(STATUS_CONTROL_C_EXIT, {});
    }
    this.onCloseWindow?.();
    this.opts.onClose?.();
  }
}
