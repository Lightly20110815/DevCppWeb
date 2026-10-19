// Win32-style menus: a menu bar component and a global popup layer.
import { Fragment, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { ImgIdx } from './images';

export interface MenuItem {
  key?: string;
  caption: string; // '-' = separator, '&' marks accelerators
  shortcut?: string;
  image?: number; // index into the menu image list
  enabled?: boolean;
  checked?: boolean;
  radio?: boolean;
  visible?: boolean;
  isDefault?: boolean;
  items?: MenuItem[] | (() => MenuItem[]);
  onClick?: () => void;
}

/** Renders a caption with its '&' accelerator underlined */
export function Accel({ text, show = true }: { text: string; show?: boolean }) {
  const parts: ReactNode[] = [];
  let i = 0;
  let buf = '';
  while (i < text.length) {
    const c = text[i];
    if (c === '&') {
      if (text[i + 1] === '&') {
        buf += '&';
        i += 2;
        continue;
      }
      if (i + 1 < text.length) {
        if (buf) parts.push(buf);
        buf = '';
        parts.push(show ? <u key={i}>{text[i + 1]}</u> : text[i + 1]);
        i += 2;
        continue;
      }
    }
    buf += c;
    i++;
  }
  if (buf) parts.push(buf);
  return <>{parts.map((p, k) => <Fragment key={k}>{p}</Fragment>)}</>;
}

export function accelKey(text: string): string | null {
  const m = /&([^&])/.exec(text.replace(/&&/g, ''));
  return m ? m[1].toLowerCase() : null;
}

function resolveItems(items: MenuItem['items']): MenuItem[] {
  if (!items) return [];
  return (typeof items === 'function' ? items() : items).filter((i) => i.visible !== false);
}

/** Hides separators that would appear twice, first or last (like Windows does with invisible items) */
function cleanSeparators(items: MenuItem[]) {
  const out: MenuItem[] = [];
  for (const it of items) {
    if (it.caption === '-' && (out.length === 0 || out[out.length - 1].caption === '-')) continue;
    out.push(it);
  }
  while (out.length && out[out.length - 1].caption === '-') out.pop();
  return out;
}

// ------------------------------------------------------------------ popup layer

interface PopupLevel {
  items: MenuItem[];
  x: number;
  y: number;
  /** alternative position if the menu doesn't fit (e.g. left of the parent item) */
  altX?: number;
  imageList?: string;
  minWidth?: number;
}

interface PopupState {
  levels: PopupLevel[];
  onClose?: () => void;
  keyboard: boolean;
  hot: number[]; // hot index per level
}

let state: PopupState | null = null;
let version = 0;
const listeners = new Set<() => void>();
function emit() {
  version++;
  for (const l of listeners) l();
}

export function openPopup(items: MenuItem[], x: number, y: number, opts: { onClose?: () => void; keyboard?: boolean; imageList?: string; minWidth?: number; altY?: number } = {}) {
  closeMenus();
  state = {
    levels: [{ items: cleanSeparators(items.filter((i) => i.visible !== false)), x, y, imageList: opts.imageList, minWidth: opts.minWidth }],
    onClose: opts.onClose,
    keyboard: !!opts.keyboard,
    hot: [opts.keyboard ? firstEnabled(items) : -1],
  };
  emit();
}

function firstEnabled(items: MenuItem[]) {
  return items.findIndex((i) => i.caption !== '-' && i.visible !== false);
}

export function closeMenus() {
  if (!state) return;
  const cb = state.onClose;
  state = null;
  emit();
  cb?.();
}

export function menusOpen() {
  return !!state;
}

function openSub(level: number, index: number, rect: DOMRect) {
  if (!state) return;
  const it = state.levels[level].items[index];
  state.levels = state.levels.slice(0, level + 1);
  state.hot = state.hot.slice(0, level + 1);
  state.hot[level] = index;
  if (it?.items && it.enabled !== false) {
    state.levels.push({ items: cleanSeparators(resolveItems(it.items)), x: rect.right - 3, y: rect.top - 3, altX: rect.left + 3, imageList: state.levels[level].imageList });
    state.hot.push(-1);
  }
  emit();
}

function activate(it: MenuItem) {
  if (it.enabled === false || it.caption === '-' || it.items) return;
  closeMenus();
  it.onClick?.();
}

/** keyboard navigation inside open popups; returns true when handled */
export function popupKey(e: KeyboardEvent, bar?: { prev: () => void; next: () => void }): boolean {
  if (!state) return false;
  const lvl = state.levels.length - 1;
  const items = state.levels[lvl].items;
  const move = (dir: number) => {
    if (!state) return;
    let i = state.hot[lvl];
    for (let n = 0; n < items.length; n++) {
      i = (i + dir + items.length) % items.length;
      if (items[i].caption !== '-') break;
    }
    state.hot[lvl] = i;
    state.keyboard = true;
    emit();
  };
  switch (e.key) {
    case 'ArrowDown':
      move(1);
      break;
    case 'ArrowUp':
      move(-1);
      break;
    case 'ArrowRight': {
      const it = items[state.hot[lvl]];
      if (it?.items) {
        const el = document.querySelector(`.menu-popup[data-level="${lvl}"] .mi[data-index="${state.hot[lvl]}"]`);
        if (el) {
          openSub(lvl, state.hot[lvl], el.getBoundingClientRect());
          if (state) state.hot[lvl + 1] = firstEnabled(state.levels[lvl + 1]?.items ?? []);
          emit();
        }
      } else if (bar) bar.next();
      break;
    }
    case 'ArrowLeft':
      if (lvl > 0) {
        state.levels.pop();
        state.hot.pop();
        emit();
      } else if (bar) bar.prev();
      break;
    case 'Enter': {
      const it = items[state.hot[lvl]];
      if (it) {
        if (it.items) {
          const el = document.querySelector(`.menu-popup[data-level="${lvl}"] .mi[data-index="${state.hot[lvl]}"]`);
          if (el) openSub(lvl, state.hot[lvl], el.getBoundingClientRect());
        } else activate(it);
      }
      break;
    }
    case 'Escape':
      if (lvl > 0) {
        state.levels.pop();
        state.hot.pop();
        emit();
      } else closeMenus();
      break;
    default: {
      if (e.key.length === 1) {
        const k = e.key.toLowerCase();
        const idx = items.findIndex((i) => i.enabled !== false && accelKey(i.caption) === k);
        if (idx >= 0) {
          const it = items[idx];
          if (it.items) {
            const el = document.querySelector(`.menu-popup[data-level="${lvl}"] .mi[data-index="${idx}"]`);
            if (el) openSub(lvl, idx, el.getBoundingClientRect());
          } else activate(it);
        }
        break;
      }
      return false;
    }
  }
  e.preventDefault();
  e.stopPropagation();
  return true;
}

function Popup({ level, data, hot, keyboard }: { level: number; data: PopupLevel; hot: number; keyboard: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: data.x, y: data.y });
  const timer = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let x = data.x;
    let y = data.y;
    if (x + r.width > window.innerWidth) x = data.altX !== undefined ? data.altX - r.width : window.innerWidth - r.width;
    if (y + r.height > window.innerHeight - 40) y = Math.max(0, window.innerHeight - 40 - r.height);
    setPos({ x: Math.max(0, x), y });
  }, [data]);

  const hasImages = true;
  return (
    <div
      ref={ref}
      className="menu-popup"
      data-level={level}
      style={{ left: pos.x, top: pos.y, minWidth: data.minWidth }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {data.items.map((it, i) => {
        if (it.caption === '-') return <div key={i} className="mi-sep" />;
        const disabled = it.enabled === false;
        return (
          <div
            key={i}
            data-index={i}
            className={'mi' + (i === hot ? ' hot' : '') + (disabled ? ' disabled' : '') + (it.isDefault ? ' default' : '')}
            onPointerEnter={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              window.clearTimeout(timer.current);
              if (state) {
                state.hot[level] = i;
                state.keyboard = false;
                // close deeper levels / open submenu after a short delay like Windows
                if (state.levels.length > level + 1 && !it.items) {
                  state.levels = state.levels.slice(0, level + 1);
                  state.hot = state.hot.slice(0, level + 1);
                }
                emit();
              }
              if (it.items) timer.current = window.setTimeout(() => openSub(level, i, rect), 200);
            }}
            onClick={(e) => {
              if (it.items) openSub(level, i, (e.currentTarget as HTMLElement).getBoundingClientRect());
              else activate(it);
            }}
          >
            <span className="mi-icon">
              {it.checked ? (
                <span className={'mi-check' + (it.radio ? ' radio' : '')}>
                  {it.radio ? (
                    <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="3" fill="currentColor" /></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16"><path d="M4 8.5l2.5 2.5L12 5" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
                  )}
                </span>
              ) : hasImages && it.image !== undefined && it.image >= 0 ? (
                <ImgIdx list={data.imageList ?? 'menu'} index={it.image} disabled={disabled} />
              ) : null}
            </span>
            <span className="mi-text">
              <Accel text={it.caption} show={keyboard} />
            </span>
            <span className="mi-shortcut">{it.shortcut}</span>
            <span className="mi-arrow">
              {it.items && (
                <svg width="8" height="8" viewBox="0 0 8 8"><path d="M2 0l4 4-4 4z" fill="currentColor" /></svg>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function MenuLayer() {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  useEffect(() => {
    if (!state) return;
    const down = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.menu-popup, .menubar-item')) closeMenus();
    };
    const blur = () => closeMenus();
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('blur', blur);
    };
  });
  if (!state) return null;
  return (
    <div className="menu-layer">
      {state.levels.map((lv, i) => (
        <Popup key={i + ':' + lv.x + ':' + lv.y} level={i} data={lv} hot={state!.hot[i] ?? -1} keyboard={state!.keyboard} />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ menu bar

export interface MenuBarHandle {
  openIndex: (i: number, keyboard: boolean) => void;
}

export function MenuBar({ menus, active, altMode, onAltModeEnd, imageList }: {
  menus: MenuItem[];
  active: boolean;
  altMode: boolean;
  onAltModeEnd?: () => void;
  imageList?: string;
}) {
  const [open, setOpen] = useState(-1);
  const [hotIdx, setHotIdx] = useState(-1);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const visible = menus.filter((m) => m.visible !== false);

  const openAt = (i: number, keyboard: boolean) => {
    const el = refs.current[i];
    if (!el) return;
    const r = el.getBoundingClientRect();
    const items = resolveItems(visible[i].items);
    setOpen(i);
    openPopup(items, r.left, r.bottom, {
      keyboard,
      imageList,
      onClose: () => setOpen((cur) => (cur === i ? -1 : cur)),
    });
  };

  useEffect(() => {
    if (open < 0) return;
    const onKey = (e: KeyboardEvent) => {
      popupKey(e, {
        prev: () => openAt((open - 1 + visible.length) % visible.length, true),
        next: () => openAt((open + 1) % visible.length, true),
      });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // keyboard handling when Alt was pressed (menu bar has focus but no popup)
  useEffect(() => {
    if (!altMode || open >= 0) return;
    if (hotIdx < 0) setHotIdx(0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setHotIdx((h) => (h + 1) % visible.length);
      else if (e.key === 'ArrowLeft') setHotIdx((h) => (h - 1 + visible.length) % visible.length);
      else if (e.key === 'Enter' || e.key === 'ArrowDown') openAt(Math.max(0, hotIdx), true);
      else if (e.key === 'Escape') onAltModeEnd?.();
      else if (e.key.length === 1) {
        const idx = visible.findIndex((m) => accelKey(m.caption) === e.key.toLowerCase());
        if (idx >= 0) openAt(idx, true);
        else return;
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  useEffect(() => {
    if (!altMode) setHotIdx(-1);
  }, [altMode]);

  useEffect(() => {
    if (open < 0 && altMode) onAltModeEnd?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className={'menubar' + (active ? '' : ' inactive')}>
      {visible.map((m, i) => (
        <div
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className={'menubar-item' + (open === i ? ' open' : '') + (altMode && hotIdx === i && open < 0 ? ' hot' : '')}
          onPointerDown={(e) => {
            e.preventDefault();
            if (open === i) closeMenus();
            else openAt(i, false);
          }}
          onPointerEnter={() => {
            if (open >= 0 && open !== i) openAt(i, false);
          }}
        >
          <Accel text={m.caption} show={altMode} />
        </div>
      ))}
    </div>
  );
}

/** Opens a menu by accelerator from the owner window (Alt+F) */
export function findAccelIndex(menus: MenuItem[], key: string) {
  return menus.filter((m) => m.visible !== false).findIndex((m) => accelKey(m.caption) === key.toLowerCase());
}
