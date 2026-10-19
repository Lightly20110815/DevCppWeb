import type { Tree } from './clang';

type InputFile = string | Uint8Array;

export function inputAt(tree: Tree, path: string): InputFile | undefined {
  let current: Tree | InputFile | undefined = tree;
  for (const part of path.replace(/^\/+/, '').split('/').filter((p) => p && p !== '.')) {
    if (!current || typeof current === 'string' || current instanceof Uint8Array) return undefined;
    current = current[part];
  }
  return typeof current === 'string' || current instanceof Uint8Array ? current : undefined;
}

function visitInputs(tree: Tree, visit: (path: string, data: InputFile) => void, prefix = '') {
  for (const name of Object.keys(tree).sort()) {
    const path = prefix + name;
    const data = tree[name];
    if (typeof data === 'string' || data instanceof Uint8Array) visit(path, data);
    else visitInputs(data, visit, path + '/');
  }
}

/** Includes names and lengths as well as bytes, so renames and deletions invalidate a build. */
export async function inputFingerprint(tree: Tree): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  try {
    const parts: BlobPart[] = [];
    const encoder = new TextEncoder();
    visitInputs(tree, (path, data) => {
      const bytes = typeof data === 'string' ? encoder.encode(data) : data;
      parts.push(JSON.stringify([path, bytes.byteLength]) + '\n', bytes as Uint8Array<ArrayBuffer>);
    });
    const digest = await crypto.subtle.digest('SHA-256', await new Blob(parts).arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    // Caching is optional; an unavailable hashing API must not prevent compilation.
    return null;
  }
}

/** New include candidates may shadow an old dependency even when that old file is unchanged. */
export function inputTopology(tree: Tree, generated = new Set<string>()): string {
  const paths: string[] = [];
  visitInputs(tree, (path) => { if (!generated.has(path)) paths.push(path); });
  return JSON.stringify(paths);
}

export function dependencyPaths(makefile: string): string[] {
  const text = makefile.replace(/\\\r?\n/g, ' ');
  const colon = text.indexOf(':');
  if (colon < 0) return [];
  const paths: string[] = [];
  let token = '';
  let escaped = false;
  for (const c of text.slice(colon + 1)) {
    if (escaped) { token += c; escaped = false; }
    else if (c === '\\') escaped = true;
    else if (/\s/.test(c)) { if (token) paths.push(token.replace(/\$\$/g, '$')); token = ''; }
    else token += c;
  }
  if (token) paths.push(token.replace(/\$\$/g, '$'));
  return [...new Set(paths.map((p) => p.replace(/^\.?\//, '')))];
}

export interface InputSnapshot {
  topology: string;
  dependencies: Map<string, InputFile>;
}

export function snapshotInputs(tree: Tree, paths: string[], topology: string): InputSnapshot | null {
  if (!paths.length) return null;
  const dependencies = new Map<string, InputFile>();
  for (const path of paths) {
    // These built-in files remain fixed for the lifetime of the compiler worker.
    if (path.startsWith('devcpp/') || path.startsWith('usr/')) continue;
    const data = inputAt(tree, path);
    if (data === undefined) return null;
    dependencies.set(path, typeof data === 'string' ? data : data.slice());
  }
  return dependencies.size ? { topology, dependencies } : null;
}

export function matchesInputs(tree: Tree, snapshot: InputSnapshot, topology: string): boolean {
  if (topology !== snapshot.topology) return false;
  for (const [path, before] of snapshot.dependencies) {
    const now = inputAt(tree, path);
    if (typeof before === 'string') { if (now !== before) return false; }
    else {
      if (!(now instanceof Uint8Array) || now.length !== before.length) return false;
      for (let i = 0; i < before.length; i++) if (now[i] !== before[i]) return false;
    }
  }
  return true;
}
