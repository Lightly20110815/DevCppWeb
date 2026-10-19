// Window manager for the emulated Windows desktop.
import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';

export type WinShowState = 'normal' | 'maximized' | 'minimized';

export interface WinOptions {
  title: string;
  icon?: string;
  x?: number;
  y?: number;
  /** outer size including the frame; or use clientW/clientH */
  w?: number;
  h?: number;
  clientW?: number;
  clientH?: number;
  minW?: number;
  minH?: number;
  state?: WinShowState;
  resizable?: boolean;
  /** dialog frame: no minimize/maximize buttons */
  dialog?: boolean;
  /** tool window frame (small caption) */
  toolWindow?: boolean;
  showClose?: boolean;
  showHelp?: boolean;
  owner?: number;
  modal?: boolean;
  taskbar?: boolean;
  /** center on owner (default for modal dialogs) */
  center?: 'owner' | 'screen' | 'none';
  render: (id: number) => ReactNode;
  /** return false to keep the window open */
  onCloseRequest?: () => boolean | void | Promise<boolean | void>;
  onClosed?: () => void;
  onKeyDown?: (e: KeyboardEvent) => void;
  className?: string;
  /** background of the client area */
  clientBg?: string;
  /** console windows use a different frame */
  kind?: 'app' | 'console';
  /** groups windows on the taskbar */
  appId?: string;
}

export interface Win extends WinOptions {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  state: WinShowState;
  prevState: WinShowState;
  z: number;
  flash: number;
}

export const TITLE_H = 31;
export const FRAME = 1;
export const TOOL_TITLE_H = 23;
export const TASKBAR_H = 40;

let nextId = 1;
let zTop = 10;

class WindowManager {
  windows: Win[] = [];
  activeId: number | null = null;
  private version = 0;
  private listeners = new Set<() => void>();

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  getVersion = () => this.version;

  private changed() {
    this.version++;
    for (const l of this.listeners) l();
  }

  get desktopW() {
    return window.innerWidth;
  }
  get desktopH() {
    return window.innerHeight - TASKBAR_H;
  }

  frameSize(o: { dialog?: boolean; toolWindow?: boolean; kind?: string }) {
    const th = o.toolWindow ? TOOL_TITLE_H : TITLE_H;
    return { dw: FRAME * 2, dh: th + FRAME * 2 - 1 };
  }

  open(o: WinOptions): number {
    const id = nextId++;
    const { dw, dh } = this.frameSize(o);
    let w = o.w ?? (o.clientW !== undefined ? o.clientW + dw : 640);
    let h = o.h ?? (o.clientH !== undefined ? o.clientH + dh : 480);
    w = Math.min(w, this.desktopW);
    h = Math.min(h, this.desktopH);
    let x = o.x;
    let y = o.y;
    const center = o.center ?? (o.owner ? 'owner' : 'screen');
    if (x === undefined || y === undefined) {
      const owner = o.owner ? this.get(o.owner) : undefined;
      if (center === 'owner' && owner) {
        const ob = this.bounds(owner);
        x = ob.x + Math.round((ob.w - w) / 2);
        y = ob.y + Math.round((ob.h - h) / 2);
      } else if (center === 'none') {
        const n = this.windows.length % 8;
        x = 40 + n * 26;
        y = 30 + n * 26;
      } else {
        x = Math.round((this.desktopW - w) / 2);
        y = Math.round((this.desktopH - h) / 2);
      }
    }
    x = Math.max(0, Math.min(x, this.desktopW - 60));
    y = Math.max(0, Math.min(y, this.desktopH - 40));
    const win: Win = {
      taskbar: !o.owner,
      showClose: true,
      resizable: !o.dialog,
      ...o,
      id,
      x,
      y,
      w,
      h,
      state: o.state ?? 'normal',
      prevState: 'normal',
      z: ++zTop,
      flash: 0,
    };
    this.windows.push(win);
    this.activeId = id;
    this.changed();
    return id;
  }

  get(id: number | null | undefined) {
    return this.windows.find((w) => w.id === id);
  }

  bounds(w: Win) {
    if (w.state === 'maximized') return { x: 0, y: 0, w: this.desktopW, h: this.desktopH };
    return { x: w.x, y: w.y, w: w.w, h: w.h };
  }

  update(id: number, patch: Partial<Win>) {
    const w = this.get(id);
    if (!w) return;
    Object.assign(w, patch);
    this.changed();
  }

  /** modal children that block this window */
  modalChildOf(id: number): Win | undefined {
    const kids = this.windows.filter((w) => w.owner === id && w.modal);
    if (!kids.length) return undefined;
    const top = kids.reduce((a, b) => (a.z > b.z ? a : b));
    return this.modalChildOf(top.id) ?? top;
  }

  focus(id: number) {
    const w = this.get(id);
    if (!w) return;
    const blocker = this.modalChildOf(id);
    if (blocker) {
      this.raise(blocker.id);
      blocker.flash++;
      this.activeId = blocker.id;
      this.changed();
      return;
    }
    if (w.state === 'minimized') w.state = w.prevState === 'maximized' ? 'maximized' : 'normal';
    this.raise(id);
    this.activeId = id;
    this.changed();
  }

  deactivate() {
    if (this.activeId === null) return;
    this.activeId = null;
    this.changed();
  }

  private raise(id: number) {
    const w = this.get(id);
    if (!w) return;
    // owned windows stay above their owner
    w.z = ++zTop;
    for (const c of this.windows.filter((x) => x.owner === id)) this.raise(c.id);
  }

  minimize(id: number) {
    const w = this.get(id);
    if (!w) return;
    w.prevState = w.state;
    w.state = 'minimized';
    // minimize owned windows with it
    for (const c of this.windows.filter((x) => x.owner === id)) c.state = 'minimized';
    if (this.activeId === id) {
      const next = this.topVisible(id);
      this.activeId = next?.id ?? null;
    }
    this.changed();
  }

  restoreOwned(id: number) {
    for (const c of this.windows.filter((x) => x.owner === id && x.state === 'minimized')) c.state = 'normal';
  }

  toggleMaximize(id: number) {
    const w = this.get(id);
    if (!w || !w.resizable) return;
    w.state = w.state === 'maximized' ? 'normal' : 'maximized';
    this.changed();
  }

  setState(id: number, state: WinShowState) {
    const w = this.get(id);
    if (!w) return;
    if (state === 'minimized') return this.minimize(id);
    w.state = state;
    this.restoreOwned(id);
    this.changed();
  }

  topVisible(except?: number) {
    const vis = this.windows.filter((w) => w.id !== except && w.state !== 'minimized');
    if (!vis.length) return undefined;
    return vis.reduce((a, b) => (a.z > b.z ? a : b));
  }

  async requestClose(id: number) {
    const w = this.get(id);
    if (!w) return;
    if (this.modalChildOf(id)) {
      this.focus(id);
      return;
    }
    if (w.onCloseRequest) {
      const r = await w.onCloseRequest();
      if (r === false) return;
    }
    this.close(id);
  }

  close(id: number) {
    const w = this.get(id);
    if (!w) return;
    // close owned windows first
    for (const c of this.windows.filter((x) => x.owner === id)) this.close(c.id);
    this.windows = this.windows.filter((x) => x.id !== id);
    if (this.activeId === id) {
      const owner = w.owner ? this.get(w.owner) : undefined;
      const next = owner && owner.state !== 'minimized' ? owner : this.topVisible();
      this.activeId = next?.id ?? null;
      if (next) this.raise(next.id);
    }
    this.changed();
    w.onClosed?.();
  }

  isActive(id: number) {
    return this.activeId === id;
  }

  /** Returns true when the window (or one of its modal children) is the active one */
  isActiveTree(id: number) {
    let a = this.get(this.activeId);
    while (a) {
      if (a.id === id) return true;
      a = this.get(a.owner);
    }
    return false;
  }
}

export const wm = new WindowManager();

export function useWM() {
  useSyncExternalStore(wm.subscribe, wm.getVersion);
  return wm;
}

/** Opens a modal window and resolves when it closes */
export function showModal<T>(
  opts: Omit<WinOptions, 'render' | 'modal'> & { render: (close: (r: T) => void, id: number) => ReactNode },
  cancelValue: T,
): Promise<T> {
  return new Promise<T>((resolve) => {
    let done = false;
    let id = 0;
    const finish = (r: T) => {
      if (done) return;
      done = true;
      resolve(r);
      wm.close(id);
    };
    id = wm.open({
      ...opts,
      modal: true,
      dialog: opts.dialog ?? true,
      render: (wid) => opts.render(finish, wid),
      onCloseRequest: async () => {
        if (opts.onCloseRequest) {
          const r = await opts.onCloseRequest();
          if (r === false) return false;
        }
        if (!done) {
          done = true;
          resolve(cancelValue);
        }
      },
      onClosed: () => {
        if (!done) {
          done = true;
          resolve(cancelValue);
        }
        opts.onClosed?.();
      },
    });
  });
}
