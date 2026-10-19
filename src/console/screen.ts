// Screen buffer of the emulated Windows console (conhost).

export const CAMPBELL = [
  '#0c0c0c', '#0037da', '#13a10e', '#3a96dd', '#c50f1f', '#881798', '#c19c00', '#cccccc',
  '#767676', '#3b78ff', '#16c60c', '#61d6d6', '#e74856', '#b4009e', '#f9f1a5', '#f2f2f2',
];

export const BUFFER_LINES = 9001;

export interface Line {
  ch: string[]; // '' for the right half of a wide character
  at: Uint8Array;
}

/** East Asian wide characters take two console cells */
export function charWidth(c: string): number {
  const cp = c.codePointAt(0) ?? 0;
  if (cp < 0x1100) return 1;
  if (
    (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0x303e) || (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) || (cp >= 0x20000 && cp <= 0x3fffd)
  )
    return 2;
  return 1;
}

export class Screen {
  cols: number;
  rows: number;
  lines: Line[] = [];
  cx = 0;
  cy = 0;
  attr = 0x07;
  defaultAttr = 0x07;
  winTop = 0;
  cursorVisible = true;
  cursorSize = 25;
  version = 0;
  private decoder = new TextDecoder('utf-8');

  constructor(cols = 120, rows = 30) {
    this.cols = cols;
    this.rows = rows;
  }

  private newLine(): Line {
    return { ch: new Array(this.cols).fill(' '), at: new Uint8Array(this.cols).fill(this.attr) };
  }

  line(y: number): Line {
    while (this.lines.length <= y) this.lines.push(this.newLine());
    return this.lines[y];
  }

  /** number of lines in use (for the scroll range) */
  get usedLines() {
    return Math.max(this.lines.length, this.winTop + this.rows);
  }

  private follow() {
    if (this.cy >= this.winTop + this.rows) this.winTop = this.cy - this.rows + 1;
    else if (this.cy < this.winTop) this.winTop = this.cy;
  }

  private lineFeed() {
    this.cx = 0;
    this.cy++;
    if (this.cy >= BUFFER_LINES) {
      this.lines.shift();
      this.cy = BUFFER_LINES - 1;
    }
    this.line(this.cy);
    this.follow();
  }

  putChar(c: string) {
    switch (c) {
      case '\n':
        this.lineFeed();
        return;
      case '\r':
        this.cx = 0;
        return;
      case '\b':
        if (this.cx > 0) this.cx--;
        else if (this.cy > 0) {
          // conhost moves to the end of the previous line
          this.cy--;
          this.cx = this.cols - 1;
          this.follow();
        }
        return;
      case '\t': {
        const next = Math.min(this.cols, (Math.floor(this.cx / 8) + 1) * 8);
        while (this.cx < next) this.putChar(' ');
        return;
      }
      case '\x07':
        beep();
        return;
      case '\0':
        return;
    }
    const w = charWidth(c);
    if (this.cx + w > this.cols) this.lineFeed();
    const ln = this.line(this.cy);
    // overwriting half of a wide char clears the other half
    if (ln.ch[this.cx] === '' && this.cx > 0) ln.ch[this.cx - 1] = ' ';
    ln.ch[this.cx] = c;
    ln.at[this.cx] = this.attr;
    if (w === 2) {
      ln.ch[this.cx + 1] = '';
      ln.at[this.cx + 1] = this.attr;
    } else if (ln.ch[this.cx + 1] === '' ) ln.ch[this.cx + 1] = ' ';
    this.cx += w;
    if (this.cx >= this.cols) {
      // wrap at end of line
      this.lineFeed();
    }
    this.follow();
  }

  writeBytes(b: Uint8Array) {
    this.writeText(this.decoder.decode(b, { stream: true }));
  }

  writeText(s: string) {
    for (const c of s) this.putChar(c);
    this.version++;
  }

  clear() {
    this.lines = [];
    this.cx = 0;
    this.cy = 0;
    this.winTop = 0;
    this.version++;
  }

  /** "color XY": recolors the whole screen */
  setColor(attr: number) {
    this.defaultAttr = attr;
    this.attr = attr;
    for (const l of this.lines) l.at.fill(attr);
    this.version++;
  }

  gotoXY(x: number, y: number) {
    this.cx = Math.max(0, Math.min(this.cols - 1, x));
    this.cy = Math.max(0, Math.min(BUFFER_LINES - 1, y));
    this.line(this.cy);
    this.follow();
    this.version++;
  }

  fill(ch: string, attr: number, count: number, x: number, y: number, mode: number) {
    let cx = x;
    let cy = y;
    for (let i = 0; i < count; i++) {
      const ln = this.line(cy);
      if (mode === 1) ln.ch[cx] = ch;
      else ln.at[cx] = attr;
      cx++;
      if (cx >= this.cols) {
        cx = 0;
        cy++;
        if (cy >= BUFFER_LINES) break;
      }
    }
    this.version++;
  }

  /** erase n cells going back from the cursor (used by line editing) */
  textOfRange(y1: number, x1: number, y2: number, x2: number) {
    let out = '';
    for (let y = y1; y <= y2; y++) {
      const l = this.lines[y];
      if (!l) {
        out += '\r\n';
        continue;
      }
      const a = y === y1 ? x1 : 0;
      const b = y === y2 ? x2 : this.cols - 1;
      let s = '';
      for (let x = a; x <= b; x++) s += l.ch[x];
      out += y < y2 ? s.replace(/\s+$/, '') + '\r\n' : s;
    }
    return out;
  }
}

let audio: AudioContext | null = null;
export function beep(freq = 800, dur = 200) {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = Math.max(37, Math.min(32767, freq));
    g.gain.value = 0.08;
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + dur / 1000);
  } catch {
    /* ignore */
  }
}

/** C printf("%.4g") as printed by MSVCRT (3 digit exponent) */
export function formatG4(v: number) {
  if (v === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(v)));
  if (exp < -5 || exp >= 4) {
    let m = v / Math.pow(10, exp);
    let e = exp;
    let ms = m.toPrecision(4);
    if (Math.abs(parseFloat(ms)) >= 10) {
      e++;
      m = v / Math.pow(10, e);
      ms = m.toPrecision(4);
    }
    ms = ms.includes('.') ? ms.replace(/0+$/, '').replace(/\.$/, '') : ms;
    return `${ms}e${e < 0 ? '-' : '+'}${String(Math.abs(e)).padStart(3, '0')}`;
  }
  let s = v.toPrecision(4);
  if (s.includes('e')) s = String(Number(s));
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}
