// Keeps the parse results of open / project files (TCppParser.Statements) and the class browser state.
import { parseFile } from './CppParser';
import type { Statement, ParseResult } from './CppParser';
import { ide } from '../ide';
import { lang, format } from '../../lang/lang';
import * as L from '../../generated/langIds';
import { vfs, normalize, dirname, joinPath } from '../../os/vfs';
import { settings } from '../config';

interface FileEntry extends ParseResult {
  fileName: string;
  inProject: boolean;
  version: number;
}

class ParserService {
  files = new Map<string, FileEntry>();
  version = 0;
  currentFile = '';

  private key(f: string) {
    return normalize(f).toLowerCase();
  }

  private textOf(fileName: string): string | null {
    const e = ide.fileIsOpen(fileName);
    if (e) return e.text;
    if (vfs.fileExists(fileName)) return vfs.readText(fileName);
    return null;
  }

  /** TCppParser.ParseFile (plus local includes) */
  parse(fileName: string, inProject: boolean, report = true, text?: string) {
    const t0 = performance.now();
    const n = this.parseOne(fileName, inProject, text);
    if (report) this.finished(n, t0);
  }

  private parseOne(fileName: string, inProject: boolean, text?: string, seen = new Set<string>()): number {
    const k = this.key(fileName);
    if (seen.has(k)) return 0;
    seen.add(k);
    const src = text ?? this.textOf(fileName);
    if (src === null) return 0;
    const r = parseFile(src, fileName, inProject);
    this.files.set(k, { ...r, fileName, inProject, version: ++this.version });
    let count = 1;
    if (settings.codeCompletion.ParseLocalHeaders) {
      for (const inc of r.includes) {
        if (inc.system) continue;
        const f = joinPath(dirname(fileName), inc.file.replace(/\//g, '\\'));
        if (vfs.fileExists(f) || ide.fileIsOpen(f)) count += this.parseOne(f, inProject || !!ide.project?.fileAlreadyExists(f), undefined, seen);
      }
    }
    return count;
  }

  private finished(total: number, t0: number) {
    const t = (performance.now() - t0) / 1000;
    if (total > 1) ide.setStatusbarMessage(format(lang(L.ID_DONEPARSINGINCOUNT), [total, Number(t.toPrecision(4)), t > 0 ? total / t : 999]));
    else ide.setStatusbarMessage(format(lang(L.ID_DONEPARSINGIN), [Number(t.toPrecision(4))]));
    ide.changed();
  }

  invalidate(fileName: string) {
    this.files.delete(this.key(fileName));
    ide.changed();
  }

  reset() {
    this.files.clear();
    this.version++;
    ide.changed();
  }

  scanProject() {
    const p = ide.project;
    if (!p) return;
    const t0 = performance.now();
    let n = 0;
    for (const u of p.units) {
      if (/\.(c|cc|cpp|cxx|c\+\+|cp|h|hpp|hh|hxx|inl)$/i.test(u.fileName)) {
        this.parseOne(u.fileName, true);
        n++;
      }
    }
    this.finished(Math.max(1, n), t0);
  }

  /** all statements */
  get statements(): Statement[] {
    const out: Statement[] = [];
    for (const f of this.files.values()) out.push(...f.statements);
    return out;
  }

  entry(fileName: string) {
    return this.files.get(this.key(fileName));
  }

  /** files included (directly or indirectly) by a file, itself included */
  includedFiles(fileName: string): Set<string> {
    const out = new Set<string>();
    const walk = (f: string) => {
      const k = this.key(f);
      if (out.has(k)) return;
      out.add(k);
      const e = this.files.get(k);
      if (!e) return;
      for (const inc of e.includes) if (!inc.system) walk(joinPath(dirname(f), inc.file.replace(/\//g, '\\')));
    };
    walk(fileName);
    return out;
  }

  /** statements for the class browser according to the show filter */
  browserStatements(): Statement[] {
    const filter = settings.classBrowsing.ShowFilter;
    const all = this.statements.filter((s) => s.visible);
    if (filter === 3) return [];
    if (filter === 1) return all.filter((s) => s.inProject);
    if (filter === 2) {
      if (!this.currentFile) return [];
      const inc = this.includedFiles(this.currentFile);
      return all.filter((s) => inc.has(this.key(s.fileName)));
    }
    return all;
  }

  findBody(fileName: string, line: number) {
    const e = this.entry(fileName);
    if (!e) return null;
    let best: (typeof e.bodies)[number] | null = null;
    for (const b of e.bodies) if (b.fromLine <= line && b.toLine >= line && (!best || b.fromLine > best.fromLine)) best = b;
    return best;
  }
}

export const parser = new ParserService();
