import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import { wm, TITLE_H, TOOL_TITLE_H, TASKBAR_H } from './wm';
import type { Win } from './wm';

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export function WindowFrame({ win, active }: { win: Win; active: boolean }) {
  const b = wm.bounds(win);
  const ref = useRef<HTMLDivElement>(null);
  const [flashOn, setFlashOn] = useState(false);
  const maximized = win.state === 'maximized';
  const titleH = win.toolWindow ? TOOL_TITLE_H : TITLE_H;

  useEffect(() => {
    if (!win.flash) return;
    let n = 0;
    const t = setInterval(() => {
      setFlashOn((v) => !v);
      if (++n >= 6) {
        clearInterval(t);
        setFlashOn(false);
      }
    }, 70);
    return () => clearInterval(t);
  }, [win.flash]);

  const startDrag = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.wbtn')) return;
    wm.focus(win.id);
    const sx = e.clientX;
    const sy = e.clientY;
    let ox = win.x;
    let oy = win.y;
    let restored = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (maximized && !restored) {
        if (Math.abs(dx) + Math.abs(dy) < 5) return;
        // restore and keep the cursor at the same relative position
        restored = true;
        const ratio = (sx - b.x) / b.w;
        ox = Math.round(sx - win.w * ratio);
        oy = 0;
        wm.update(win.id, { state: 'normal', x: ox, y: oy });
        return;
      }
      const ny = Math.max(0, Math.min(oy + dy, wm.desktopH - 20));
      wm.update(win.id, { x: ox + dx, y: ny });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      // aero snap to top -> maximize
      if (win.resizable && ev.clientY <= 0) wm.update(win.id, { state: 'maximized' });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const startResize = (edge: Edge) => (e: RPointerEvent) => {
    if (e.button !== 0 || maximized) return;
    e.stopPropagation();
    e.preventDefault();
    wm.focus(win.id);
    const sx = e.clientX;
    const sy = e.clientY;
    const o = { x: win.x, y: win.y, w: win.w, h: win.h };
    const minW = win.minW ?? 160;
    const minH = win.minH ?? 60;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      let { x, y, w, h } = o;
      if (edge.includes('e')) w = Math.max(minW, o.w + dx);
      if (edge.includes('s')) h = Math.max(minH, o.h + dy);
      if (edge.includes('w')) {
        w = Math.max(minW, o.w - dx);
        x = o.x + o.w - w;
      }
      if (edge.includes('n')) {
        h = Math.max(minH, o.h - dy);
        y = Math.max(0, o.y + o.h - h);
        h = o.y + o.h - y;
      }
      wm.update(win.id, { x, y, w, h });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  if (win.state === 'minimized') return null;
  const showMinMax = !win.dialog && !win.toolWindow;
  const cls = ['win', active ? 'active' : 'inactive', maximized ? 'maximized' : '', win.dialog ? 'dialog' : '', win.toolWindow ? 'toolwin' : '', win.kind === 'console' ? 'console-win' : '', flashOn ? 'flash' : '', win.className ?? ''].join(' ');

  return (
    <div
      ref={ref}
      className={cls}
      style={{ left: b.x, top: b.y, width: b.w, height: b.h, zIndex: win.z }}
      onPointerDownCapture={() => {
        if (!wm.isActive(win.id)) wm.focus(win.id);
      }}
    >
      <div
        className="win-title"
        style={{ height: titleH }}
        onPointerDown={startDrag}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest('.wbtn')) return;
          if (win.resizable && showMinMax) wm.toggleMaximize(win.id);
        }}
      >
        {win.icon && !win.dialog && <img className="win-icon" src={win.icon} alt="" draggable={false} />}
        <div className="win-caption">{win.title}</div>
        <div className="win-buttons">
          {win.showHelp && (
            <div className="wbtn help" title="Help">
              <svg width="10" height="10" viewBox="0 0 10 10"><text x="2" y="9" fontSize="10" fill="currentColor">?</text></svg>
            </div>
          )}
          {showMinMax && (
            <div className="wbtn" onClick={() => wm.minimize(win.id)}>
              <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5.5h10" stroke="currentColor" strokeWidth="1" /></svg>
            </div>
          )}
          {showMinMax && (
            <div className={'wbtn' + (win.resizable ? '' : ' disabled')} onClick={() => wm.toggleMaximize(win.id)}>
              {maximized ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
                  <path d="M2.5 2.5V0.5h7v7h-2" />
                  <rect x="0.5" y="2.5" width="7" height="7" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
              )}
            </div>
          )}
          {win.showClose !== false && (
            <div className="wbtn close" onClick={() => wm.requestClose(win.id)}>
              <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0L10 10M10 0L0 10" stroke="currentColor" strokeWidth="1.1" /></svg>
            </div>
          )}
        </div>
      </div>
      <div className="win-client" style={{ background: win.clientBg }}>
        {win.render(win.id)}
      </div>
      {win.resizable && !maximized &&
        (['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as Edge[]).map((edge) => (
          <div key={edge} className={'win-resize ' + edge} onPointerDown={startResize(edge)} />
        ))}
    </div>
  );
}

export { TASKBAR_H };
