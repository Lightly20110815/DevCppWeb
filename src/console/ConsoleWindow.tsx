// Canvas renderer for the console window (looks like Windows 10 conhost).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CAMPBELL, charWidth } from './screen';
import type { ConsoleSession } from './ConsoleSession';
import { wm } from '../os/wm';
import { Lang } from '../lang/lang';
import { iconUrl } from '../os/images';

export const CONSOLE_FONT_PX = 16;
export const CONSOLE_FONT = `${CONSOLE_FONT_PX}px Consolas, "Lucida Console", "NSimSun", "SimSun", "Courier New", monospace`;
export const CONSOLE_CJK_FONT = `${CONSOLE_FONT_PX}px "NSimSun", "SimSun", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif`;

let metrics: { cw: number; ch: number } | null = null;
export function consoleMetrics() {
  if (metrics) return metrics;
  const c = document.createElement('canvas').getContext('2d')!;
  c.font = CONSOLE_FONT;
  const cw = Math.max(7, Math.round(c.measureText('M').width));
  metrics = { cw, ch: 16 };
  return metrics;
}

export const CONSOLE_ICON = iconUrl('icons/console_16.png');

export function ConsoleView({ session }: { session: ConsoleSession }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [, setTick] = useState(0);
  const [blink, setBlink] = useState(true);
  const sel = useRef<{ x1: number; y1: number; x2: number; y2: number; active: boolean } | null>(null);
  const followRef = useRef(true);
  const composing = useRef(false);
  const { cw, ch } = consoleMetrics();
  const scr = session.screen;

  useEffect(() => session.subscribe(() => setTick((t) => t + 1)), [session]);
  useEffect(() => {
    const t = setInterval(() => setBlink((b) => !b), 530);
    return () => clearInterval(t);
  }, []);

  // keep the view on the cursor when output arrives
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = scr.winTop * ch;
    if (followRef.current && Math.abs(el.scrollTop - target) > 1) el.scrollTop = target;
  });

  // draw
  useLayoutEffect(() => {
    const cv = canvasRef.current;
    const el = scrollRef.current;
    if (!cv || !el) return;
    const dpr = window.devicePixelRatio || 1;
    const W = scr.cols * cw;
    const H = scr.rows * ch;
    if (cv.width !== W * dpr || cv.height !== H * dpr) {
      cv.width = W * dpr;
      cv.height = H * dpr;
      cv.style.width = W + 'px';
      cv.style.height = H + 'px';
    }
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.textBaseline = 'top';
    const top = Math.floor(el.scrollTop / ch);
    const s = sel.current;
    const inSel = (x: number, y: number) => {
      if (!s) return false;
      const ax = Math.min(s.x1, s.x2);
      const bx = Math.max(s.x1, s.x2);
      const ay = Math.min(s.y1, s.y2);
      const by = Math.max(s.y1, s.y2);
      return x >= ax && x <= bx && y >= ay && y <= by;
    };
    // Paint every background before any text. A wide glyph spans two cells;
    // painting its trailing cell afterward would erase the glyph's right half.
    for (let r = 0; r < scr.rows; r++) {
      const y = top + r;
      const line = scr.lines[y];
      for (let x = 0; x < scr.cols; x++) {
        const at = line ? line.at[x] : scr.defaultAttr;
        g.fillStyle = CAMPBELL[inSel(x, y) ? at & 0xf : (at >> 4) & 0xf];
        g.fillRect(x * cw, r * ch, cw, ch);
      }
    }
    for (let r = 0; r < scr.rows; r++) {
      const y = top + r;
      const line = scr.lines[y];
      if (!line) continue;
      for (let x = 0; x < scr.cols; x++) {
        const c = line.ch[x];
        if (!c || c === ' ') continue;
        const at = line.at[x];
        g.fillStyle = CAMPBELL[inSel(x, y) ? (at >> 4) & 0xf : at & 0xf];
        const wide = charWidth(c) === 2;
        const cellWidth = (wide ? 2 : 1) * cw;
        g.font = wide ? CONSOLE_CJK_FONT : CONSOLE_FONT;
        const w = g.measureText(c).width;
        g.fillText(c, x * cw + Math.max(0, (cellWidth - w) / 2), r * ch + 1, cellWidth);
      }
    }
    // cursor
    const focused = wm.isActive(session.windowId);
    if (scr.cursorVisible && blink && focused && session.state !== 'done' || (scr.cursorVisible && blink && session.state === 'done' && focused)) {
      const cy = scr.cy - top;
      if (cy >= 0 && cy < scr.rows) {
        const hpx = Math.max(1, Math.round((ch * scr.cursorSize) / 100));
        const at = scr.lines[scr.cy]?.at[scr.cx] ?? scr.attr;
        g.fillStyle = CAMPBELL[at & 0xf];
        g.fillRect(scr.cx * cw, cy * ch + ch - hpx, cw, hpx);
      }
    }
  });

  const cellAt = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const top = Math.floor((scrollRef.current?.scrollTop ?? 0) / ch);
    return { x: Math.max(0, Math.min(scr.cols - 1, Math.floor((e.clientX - r.left) / cw))), y: top + Math.max(0, Math.min(scr.rows - 1, Math.floor((e.clientY - r.top) / ch))) };
  };

  const copySelection = () => {
    const s = sel.current;
    if (!s) return false;
    const ax = Math.min(s.x1, s.x2);
    const bx = Math.max(s.x1, s.x2);
    const ay = Math.min(s.y1, s.y2);
    const by = Math.max(s.y1, s.y2);
    const lines: string[] = [];
    for (let y = ay; y <= by; y++) {
      const l = scr.lines[y];
      lines.push(l ? l.ch.slice(ax, bx + 1).join('').replace(/\s+$/, '') : '');
    }
    void navigator.clipboard?.writeText(lines.join('\r\n'));
    sel.current = null;
    setTick((t) => t + 1);
    return true;
  };

  useEffect(() => {
    const w = wm.get(session.windowId);
    if (!w) return;
    w.onKeyDown = (e) => {
      if (composing.current) return;
      if (sel.current && (e.key === 'Enter' || (e.ctrlKey && e.key === 'c'))) {
        e.preventDefault();
        copySelection();
        return;
      }
      if (sel.current && e.key === 'Escape') {
        sel.current = null;
        setTick((t) => t + 1);
        return;
      }
      if (e.ctrlKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        void navigator.clipboard?.readText().then((t) => session.paste(t));
        return;
      }
      followRef.current = true;
      // printable characters are delivered by the textarea input event
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) return;
      if (e.key === 'Process' || e.key === 'Unidentified') return;
      e.preventDefault();
      session.keyDown(e);
    };
    const up = (e: KeyboardEvent) => {
      if (wm.isActive(session.windowId)) session.keyUp(e);
    };
    window.addEventListener('keyup', up);
    return () => window.removeEventListener('keyup', up);
  }, [session]);

  // keep focus in the hidden textarea while the window is active
  useEffect(() => {
    const t = setInterval(() => {
      if (wm.isActive(session.windowId) && document.activeElement !== inputRef.current && !document.querySelector('.menu-popup')) inputRef.current?.focus({ preventScroll: true });
    }, 200);
    return () => clearInterval(t);
  }, [session]);

  const totalH = Math.max(scr.usedLines, scr.rows) * ch;
  return (
    <div className="console-client" style={{ width: scr.cols * cw + 17, height: scr.rows * ch }}>
      <div
        ref={scrollRef}
        className="console-scroll"
        onScroll={(e) => {
          const el = e.currentTarget;
          followRef.current = Math.abs(el.scrollTop - scr.winTop * ch) < ch;
          setTick((t) => t + 1);
        }}
        onWheel={() => {
          followRef.current = false;
        }}
      >
        <div style={{ height: totalH, position: 'relative' }}>
          <canvas
            ref={canvasRef}
            className="console-canvas"
            style={{ top: scrollRef.current?.scrollTop ?? 0 }}
            onPointerDown={(e) => {
              inputRef.current?.focus({ preventScroll: true });
              if (e.button === 2) {
                e.preventDefault();
                if (!copySelection()) void navigator.clipboard?.readText().then((t) => session.paste(t));
                return;
              }
              const c = cellAt(e);
              sel.current = { x1: c.x, y1: c.y, x2: c.x, y2: c.y, active: true };
              const move = (ev: PointerEvent) => {
                const cc = cellAt(ev as unknown as React.PointerEvent);
                if (sel.current) {
                  sel.current.x2 = cc.x;
                  sel.current.y2 = cc.y;
                  setTick((t) => t + 1);
                }
              };
              const up = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                const s = sel.current;
                if (s && s.x1 === s.x2 && s.y1 === s.y2) sel.current = null;
                setTick((t) => t + 1);
              };
              window.addEventListener('pointermove', move);
              window.addEventListener('pointerup', up);
            }}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
      </div>
      <textarea
        ref={inputRef}
        className="console-input"
        autoFocus
        spellCheck={false}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={(e) => {
          composing.current = false;
          const t = e.currentTarget;
          if (t.value) session.textInput(t.value);
          t.value = '';
        }}
        onInput={(e) => {
          const t = e.currentTarget;
          if (composing.current) return;
          if (t.value) session.textInput(t.value);
          t.value = '';
        }}
      />
    </div>
  );
}

export function consoleWindowSize(cols = 120, rows = 30) {
  const { cw, ch } = consoleMetrics();
  return { clientW: cols * cw + 17, clientH: rows * ch };
}

export const isChineseConsole = () => Lang.isChinese;
