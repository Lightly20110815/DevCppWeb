// A small Windows-like virtual file system ("drive C:") that lives in memory and is
// persisted to IndexedDB. Paths use backslashes and are case-insensitive, like Windows.

export interface VNode {
  path: string; // canonical display path, e.g. C:\Users\Administrator\Desktop\a.cpp
  dir: boolean;
  data?: string | Uint8Array;
  mtime: number;
}

export const USER_NAME = 'Administrator';
export const USER_DIR = `C:\\Users\\${USER_NAME}`;
export const DESKTOP_DIR = `${USER_DIR}\\Desktop`;
export const DOCUMENTS_DIR = `${USER_DIR}\\Documents`;
export const DEVCPP_DIR = 'C:\\Program Files (x86)\\Dev-Cpp';
export const MINGW_DIR = `${DEVCPP_DIR}\\MinGW64`;

type Listener = (path: string) => void;

const DB_NAME = 'devcpp-vfs';
const STORE = 'files';

class VFS {
  private nodes = new Map<string, VNode>();
  private children = new Map<string, Map<string, VNode>>();
  private db: IDBDatabase | null = null;
  private listeners = new Set<Listener>();

  static key(p: string) {
    return normalize(p).toLowerCase();
  }

  async init() {
    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const all = await new Promise<VNode[]>((resolve, reject) => {
        const tx = this.db!.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result as VNode[]);
        req.onerror = () => reject(req.error);
      });
      for (const n of all) this.putRaw(n, false);
    } catch (e) {
      console.warn('IndexedDB unavailable, files will not persist', e);
    }
    this.seed();
  }

  private seed() {
    const dirs = [
      'C:\\', 'C:\\Users', USER_DIR, DESKTOP_DIR, DOCUMENTS_DIR, `${USER_DIR}\\Downloads`,
      `${USER_DIR}\\Pictures`, `${USER_DIR}\\Music`, `${USER_DIR}\\Videos`,
      'C:\\Program Files', 'C:\\Program Files (x86)', DEVCPP_DIR, `${DEVCPP_DIR}\\Templates`,
      `${DEVCPP_DIR}\\Lang`, `${DEVCPP_DIR}\\Help`, `${DEVCPP_DIR}\\Icons`, `${DEVCPP_DIR}\\AStyle`,
      MINGW_DIR, `${MINGW_DIR}\\bin`, `${MINGW_DIR}\\include`, `${MINGW_DIR}\\lib`,
      `${MINGW_DIR}\\x86_64-w64-mingw32`, `${MINGW_DIR}\\x86_64-w64-mingw32\\include`,
      `${MINGW_DIR}\\x86_64-w64-mingw32\\lib`, `${MINGW_DIR}\\lib\\gcc`,
      `${MINGW_DIR}\\lib\\gcc\\x86_64-w64-mingw32`, `${MINGW_DIR}\\lib\\gcc\\x86_64-w64-mingw32\\4.9.2`,
      `${MINGW_DIR}\\lib\\gcc\\x86_64-w64-mingw32\\4.9.2\\include`,
      `${MINGW_DIR}\\lib\\gcc\\x86_64-w64-mingw32\\4.9.2\\include\\c++`,
      'C:\\Windows', 'C:\\Windows\\System32',
    ];
    for (const d of dirs) if (!this.nodes.has(VFS.key(d))) this.mkdirRaw(d, false);
    const fakeBins = ['devcpp.exe', 'ConsolePauser.exe', 'packman.exe', 'devcpp.exe.manifest'];
    for (const b of fakeBins) {
      const p = `${DEVCPP_DIR}\\${b}`;
      if (!this.nodes.has(VFS.key(p))) this.putRaw({ path: p, dir: false, data: new Uint8Array(0), mtime: Date.parse('2015-04-27') }, false);
    }
    for (const b of ['gcc.exe', 'g++.exe', 'gdb.exe', 'gdb32.exe', 'mingw32-make.exe', 'windres.exe', 'gprof.exe', 'cpp.exe']) {
      const p = `${MINGW_DIR}\\bin\\${b}`;
      if (!this.nodes.has(VFS.key(p))) this.putRaw({ path: p, dir: false, data: new Uint8Array(0), mtime: Date.parse('2014-11-01') }, false);
    }
  }

  onChange(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private emit(path: string) {
    for (const l of this.listeners) l(path);
  }

  private persist(node: VNode | null, key: string) {
    if (!this.db) return;
    try {
      const tx = this.db.transaction(STORE, 'readwrite');
      if (node) tx.objectStore(STORE).put(node, key);
      else tx.objectStore(STORE).delete(key);
    } catch (e) {
      console.warn('persist failed', e);
    }
  }

  private putRaw(node: VNode, persist = true) {
    const k = VFS.key(node.path);
    this.nodes.set(k, node);
    const parent = VFS.key(dirname(node.path));
    let children = this.children.get(parent);
    if (!children) { children = new Map(); this.children.set(parent, children); }
    children.set(k, node);
    if (persist) this.persist(node, k);
  }

  private deleteRaw(key: string) {
    const node = this.nodes.get(key);
    if (!node) return;
    const parent = VFS.key(dirname(node.path));
    const children = this.children.get(parent);
    children?.delete(key);
    if (children?.size === 0) this.children.delete(parent);
    this.nodes.delete(key);
    this.persist(null, key);
  }

  private mkdirRaw(path: string, persist = true) {
    this.putRaw({ path: normalize(path), dir: true, mtime: Date.now() }, persist);
  }

  get(path: string): VNode | undefined {
    return this.nodes.get(VFS.key(path));
  }

  exists(path: string) {
    return this.nodes.has(VFS.key(path));
  }

  fileExists(path: string) {
    const n = this.get(path);
    return !!n && !n.dir;
  }

  dirExists(path: string) {
    const n = this.get(path);
    return !!n && n.dir;
  }

  /** Display path with the original casing, or the input when it does not exist. */
  realPath(path: string) {
    return this.get(path)?.path ?? normalize(path);
  }

  mkdirs(path: string) {
    const parts = normalize(path).split('\\');
    let cur = parts[0] + '\\';
    if (!this.exists(cur)) this.mkdirRaw(cur);
    for (let i = 1; i < parts.length; i++) {
      if (!parts[i]) continue;
      cur = joinPath(cur, parts[i]);
      const n = this.get(cur);
      if (!n) this.mkdirRaw(cur);
      else if (!n.dir) throw new Error(`${cur} is a file`);
    }
    this.emit(path);
  }

  readText(path: string): string {
    const n = this.get(path);
    if (!n || n.dir) throw new Error(`File not found: ${path}`);
    if (typeof n.data === 'string') return n.data;
    return decodeText(n.data ?? new Uint8Array(0));
  }

  readBinary(path: string): Uint8Array {
    const n = this.get(path);
    if (!n || n.dir) throw new Error(`File not found: ${path}`);
    if (typeof n.data === 'string') return new TextEncoder().encode(n.data);
    return n.data ?? new Uint8Array(0);
  }

  write(path: string, data: string | Uint8Array) {
    const p = normalize(path);
    const parent = dirname(p);
    if (parent && !this.dirExists(parent)) this.mkdirs(parent);
    const existing = this.get(p);
    if (existing?.dir) throw new Error(`${p} is a directory`);
    this.putRaw({ path: existing?.path ?? p, dir: false, data, mtime: Date.now() });
    this.emit(p);
  }

  size(path: string) {
    const n = this.get(path);
    if (!n || n.dir || n.data === undefined) return 0;
    return typeof n.data === 'string' ? new TextEncoder().encode(n.data).length : n.data.length;
  }

  mtime(path: string) {
    return this.get(path)?.mtime ?? 0;
  }

  list(dir: string): VNode[] {
    const key = VFS.key(dir);
    if (!key) return [];
    const out = [...(this.children.get(key)?.values() ?? [])];
    return out.sort((a, b) => (a.dir === b.dir ? basename(a.path).localeCompare(basename(b.path)) : a.dir ? -1 : 1));
  }

  remove(path: string) {
    const k = VFS.key(path);
    const n = this.nodes.get(k);
    if (!n) return;
    if (n.dir) {
      const prefix = k.replace(/\\$/, '') + '\\';
      for (const key of [...this.nodes.keys()]) {
        if (key.startsWith(prefix)) {
          this.deleteRaw(key);
        }
      }
    }
    this.deleteRaw(k);
    this.emit(path);
  }

  rename(from: string, to: string) {
    const n = this.get(from);
    if (!n) throw new Error(`File not found: ${from}`);
    const src = normalize(n.path);
    const dst = normalize(to);
    if (n.dir) {
      const prefix = VFS.key(src) + '\\';
      for (const [key, child] of [...this.nodes]) {
        if (key.startsWith(prefix)) {
          this.deleteRaw(key);
          this.putRaw({ ...child, path: dst + child.path.slice(src.length) });
        }
      }
    }
    this.deleteRaw(VFS.key(src));
    this.putRaw({ ...n, path: dst });
    this.emit(dst);
  }
}

export function normalize(p: string): string {
  let s = p.replace(/\//g, '\\').trim();
  if (/^[a-zA-Z]:$/.test(s)) s += '\\';
  s = s.replace(/^([a-z]):/, (_, d: string) => d.toUpperCase() + ':');
  // collapse duplicate separators (but keep the root backslash)
  s = s.replace(/\\{2,}/g, '\\');
  // resolve . and ..
  const parts = s.split('\\');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '.' || (part === '' && out.length > 0)) continue;
    if (part === '..') {
      if (out.length > 1) out.pop();
      continue;
    }
    out.push(part);
  }
  let r = out.join('\\');
  if (/^[A-Z]:$/.test(r)) r += '\\';
  return r;
}

export function joinPath(dir: string, name: string) {
  if (!dir) return name;
  return normalize(dir.endsWith('\\') ? dir + name : `${dir}\\${name}`);
}

export function dirname(p: string) {
  const s = normalize(p);
  const i = s.lastIndexOf('\\');
  if (i < 0) return '';
  if (i === 2 && /^[A-Z]:/.test(s)) return s.length > 3 ? s.slice(0, 3) : '';
  return s.slice(0, i);
}

export function basename(p: string) {
  const s = p.replace(/[\\/]+$/, '');
  const i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/'));
  return i < 0 ? s : s.slice(i + 1);
}

export function extname(p: string) {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i <= 0 ? '' : b.slice(i);
}

export function changeExt(p: string, ext: string) {
  const e = extname(p);
  return (e ? p.slice(0, -e.length) : p) + ext;
}

/** Delphi ExtractRelativePath semantics: relative path of `target` as seen from the directory of `base`. */
export function relativePath(baseFile: string, target: string) {
  const baseDir = normalize(dirname(baseFile)).split('\\').filter(Boolean);
  const t = normalize(target).split('\\').filter(Boolean);
  let i = 0;
  while (i < baseDir.length && i < t.length && baseDir[i].toLowerCase() === t[i].toLowerCase()) i++;
  if (i === 0) return normalize(target);
  return [...Array(baseDir.length - i).fill('..'), ...t.slice(i)].join('\\');
}

export function expandFileTo(rel: string, dir: string) {
  if (/^[a-zA-Z]:/.test(rel)) return normalize(rel);
  return joinPath(dir, rel);
}

export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Files written by Windows Dev-C++ are usually in the ANSI code page (GBK in China)
    try {
      return new TextDecoder('gbk').decode(bytes);
    } catch {
      return new TextDecoder('windows-1252').decode(bytes);
    }
  }
}

export const vfs = new VFS();
