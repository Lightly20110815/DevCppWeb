// Port of Compiler.pas. The log shows exactly what Dev-C++ would run (g++.exe with MinGW paths);
// the real work is done by clang compiled to WebAssembly.
import { ide } from '../ide/ide';
import { Lang, lang, format } from '../lang/lang';
import * as L from '../generated/langIds';
import { COMPILER_OPTIONS, currentCompilerSet, devData, optionValue, charToValue } from '../ide/config';
import type { CompilerSet } from '../ide/config';
import { vfs, basename, dirname, changeExt, normalize, joinPath, expandFileTo, MINGW_DIR } from '../os/vfs';
import { getFileTyp, EXE_EXT, OBJ_EXT, GCH_EXT, CLEAN_PROGRAM } from '../ide/version';
import { toolchain } from './clang';
import type { Tree, ClangJob } from './clang';
import { dependencyPaths, inputTopology, matchesInputs, snapshotInputs } from './buildInputs';
import type { InputSnapshot } from './buildInputs';
import type { VNode } from '../os/vfs';
import { translate, translateFlag } from './diagnostics';
import type { Diag } from './diagnostics';
import { functionAt } from './funcAt';
import { MessageDlg } from '../os/messagebox';

export type Target = 'none' | 'file' | 'project' | 'invalid';

type ProjectLike = import('../ide/project/Project').Project;

const SRC_DIR = 'src';

/** Delphi FloatToStr: up to 15 significant digits */
export function floatToStr(v: number) {
  let s = v.toPrecision(15);
  if (s.includes('e')) return String(v);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

export function formatFileSize(size: number) {
  if (size === 0) return '0';
  if (size < 1024) return `${size} ${lang(L.ID_BYTES)}`;
  if (size < 1024 * 1024) return floatToStr(size / 1024) + ' KiB';
  if (size < 1024 * 1024 * 1024) return floatToStr(size / 1024 / 1024) + ' MiB';
  return floatToStr(size / 1024 / 1024 / 1024) + ' GiB';
}

const formatList = (list: string[], fmt: string) => list.reduce((acc, d) => fmt.replace('%s', acc).replace('%s', d), '');

/** Splits a command line the way the Windows shell does (quotes group) */
export function splitArgs(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  let has = false;
  for (const c of s) {
    if (c === '"') {
      q = !q;
      has = true;
    } else if (/\s/.test(c) && !q) {
      if (has) out.push(cur);
      cur = '';
      has = false;
    } else {
      cur += c;
      has = true;
    }
  }
  if (has) out.push(cur);
  return out;
}

const WIN_LIBS = /^-l(gdi32|user32|kernel32|winmm|comdlg32|ws2_32|wsock32|opengl32|glu32|glut32|freeglut|mingw32|comctl32|ole32|oleaut32|uuid|shell32|advapi32|imm32|version|msimg32|psapi|iphlpapi|setupapi|d3d9|d3dx9|ddraw|dinput8|dxguid|winspool|gdiplus|stdc\+\+|m|pthread|bgi|graphics|easyx|shlwapi|dbghelp|ntdll|crypt32|secur32|mswsock|rpcrt4|userenv|odbc32)$/;

/** Maps a gcc/MinGW command line flag to clang flags (or drops it) */
function mapFlag(f: string, isC: boolean): string[] {
  if (!f) return [];
  if (/^-m(32|64|windows|console|tune=.*|arch=.*|fpmath=.*|sse.*|avx.*|mmx|3dnow|aes|fma4|xop|sse4a|no-.*)$/.test(f)) return [];
  if (/^-m[a-z0-9.]+$/.test(f)) return [];
  if (/^-static/.test(f) || f === '-shared' || f === '-pipe' || f === '-pg' || f === '-fno-asm' || f === '-fverbose-asm') return [];
  if (/^-Wl,--(subsystem|out-implib|output-def|add-stdcall-alias|enable-auto-import|stack|large-address-aware)/.test(f)) return [];
  if (WIN_LIBS.test(f)) return [];
  if (f === '-g3' || f === '-g' || f === '-ggdb' || f === '-ggdb3') return ['-g'];
  if (f === '-s') return ['-Wl,--strip-all'];
  if (f === '-lobjc') return [];
  if (f === '-Ofast') return ['-O3', '-ffast-math'];
  if (f.startsWith('-std=') && isC && /c\+\+/.test(f)) return [];
  if (f.startsWith('-std=') && !isC && !/c\+\+/.test(f)) return [];
  if (/^-L/.test(f)) return [];
  if (/^-I/.test(f)) return [];
  if (/^-fexec-charset|^-finput-charset|^-fextended-identifiers|^-fno-keep-inline-dllexport|^-fpermissive$/.test(f)) return [];
  return [f];
}

/** clang paths -> paths a MinGW install would show */
export function toWindowsPath(p: string, srcDir: string) {
  let s = p;
  if (s.startsWith(SRC_DIR + '/')) return joinPath(srcDir, s.slice(SRC_DIR.length + 1).replace(/\//g, '\\'));
  if (s.startsWith('./' + SRC_DIR + '/')) return joinPath(srcDir, s.slice(SRC_DIR.length + 3).replace(/\//g, '\\'));
  s = s.replace(/^\/usr\/include\/c\+\+\/v1\//, `${MINGW_DIR}\\lib\\gcc\\x86_64-w64-mingw32\\4.9.2\\include\\c++\\`);
  s = s.replace(/^\/usr\/lib\/clang\/\d+\/include\//, `${MINGW_DIR}\\lib\\gcc\\x86_64-w64-mingw32\\4.9.2\\include\\`);
  s = s.replace(/^\/usr\/include\/(wasm32-wasip1\/)?/, `${MINGW_DIR}\\x86_64-w64-mingw32\\include\\`);
  s = s.replace(/^devcpp\/include\//, `${MINGW_DIR}\\x86_64-w64-mingw32\\include\\`);
  return s.replace(/\//g, '\\');
}

export class Compiler {
  target: Target = 'none';
  sourceFile = '';
  project: ProjectLike | null = null;
  compilerSet: CompilerSet = currentCompilerSet();
  runParams = '';
  checkSyntax = false;

  compileParams = '';
  cppCompileParams = '';
  librariesParams = '';
  includesParams = '';
  cppIncludesParams = '';

  errCount = 0;
  warnCount = 0;
  private startTime = 0;
  private aborted = false;
  private showOutputInfo = true;
  compiling = false;
  private makeFileName = '';
  private objectBuilds = new Map<string, { signature: string; inputs: InputSnapshot; artifact: VNode }>();

  onCompEnd?: (success: boolean) => void;
  onCompSuccess?: () => void;

  // ---------------------------------------------------------------- parameters (exact Dev-C++ strings)

  getCompileParams() {
    const set = this.compilerSet;
    let c = this.checkSyntax ? '-fsyntax-only' : '';
    let cpp = this.checkSyntax ? '-fsyntax-only' : '';
    const prj = this.project;
    COMPILER_OPTIONS.forEach((option, i) => {
      const projVal = prj && i < prj.options.compilerOptions.length ? prj.options.compilerOptions[i] : undefined;
      const val = prj ? (projVal !== undefined ? charToValue(projVal) : 0) : optionValue(set, i);
      if ((prj && projVal !== undefined) || (!prj && val > 0)) {
        const add = (cur: string) => {
          if (option.choices) {
            if (val > 0 && val < option.choices.length) return cur + ' ' + option.setting + option.choices[val][1];
            return cur;
          }
          if ((prj && val === 1) || !prj) return cur + ' ' + option.setting;
          return cur;
        };
        if (option.isC) c = add(c);
        if (option.isCpp) cpp = add(cpp);
      }
    });
    if (set.compOpt && set.compAdd) {
      c += ' ' + set.compOpt;
      cpp += ' ' + set.compOpt;
    }
    if (prj && this.target === 'project') {
      if (prj.options.compilerCmd) c += ' ' + prj.options.compilerCmd.replace(/_@@_/g, ' ').trim();
      if (prj.options.cppCompilerCmd) cpp += ' ' + prj.options.cppCompilerCmd.replace(/_@@_/g, ' ').trim();
    }
    this.compileParams = c.trim();
    this.cppCompileParams = cpp.trim();
  }

  getLibrariesParams() {
    const set = this.compilerSet;
    let s = formatList(set.libDirs, '%s -L"%s"');
    if (set.linkAdd && set.linkOpt) s += ' ' + set.linkOpt;
    const prj = this.project;
    if (this.target === 'project' && prj) {
      for (const l of prj.options.libs) s = `${s} -L"${l}"`;
      if (prj.options.type === 'gui') s += ' -mwindows';
      if (prj.options.linkerCmd) s += ' ' + prj.options.linkerCmd.replace(/_@@_/g, ' ');
      for (const file of prj.options.objFiles) s += ` "${file}"`;
    }
    s = s.trim();
    COMPILER_OPTIONS.forEach((option, i) => {
      if (!option.isLinker) return;
      const projVal = prj && i < prj.options.compilerOptions.length ? prj.options.compilerOptions[i] : undefined;
      const val = prj ? (projVal !== undefined ? charToValue(projVal) : 0) : optionValue(set, i);
      if ((prj && projVal !== undefined) || (!prj && val > 0)) {
        if (option.choices) {
          if (val > 0 && val < option.choices.length) s += ' ' + option.setting + option.choices[val][1];
        } else if ((prj && val === 1) || !prj) s += ' ' + option.setting;
      }
    });
    this.librariesParams = s.trim();
  }

  getIncludesParams() {
    const set = this.compilerSet;
    let c = formatList(set.cDirs, '%s -I"%s"');
    let cpp = formatList(set.cppDirs, '%s -I"%s"');
    if (this.target === 'project' && this.project) {
      for (const d of this.project.options.includes) {
        if (vfs.dirExists(expandFileTo(d, this.project.directory))) {
          c = `${c} -I"${d}"`;
          cpp = `${cpp} -I"${d}"`;
        }
      }
    }
    this.includesParams = c.trim();
    this.cppIncludesParams = cpp.trim();
  }

  // ---------------------------------------------------------------- log helpers

  private log(s: string) {
    ide.logEntry(s);
  }

  private initProgress() {
    if (this.project) {
      const n = this.project.units.filter((u) => ['cSrc', 'cppSrc'].includes(getFileTyp(u.fileName))).length;
      ide.progress = { pos: 0, max: n + 3 };
    } else ide.progress = { pos: 0, max: 1 };
    this.startTime = performance.now();
    this.errCount = 0;
    this.warnCount = 0;
    this.aborted = false;
    this.showOutputInfo = !this.checkSyntax;
    ide.msgs.emit();
  }

  private stepProgress() {
    ide.progress = { ...ide.progress, pos: Math.min(ide.progress.max, ide.progress.pos + 1) };
    ide.msgs.emit();
  }

  /** TCompiler.ProcessOutput */
  processOutput(line: string) {
    const set = this.compilerSet;
    let oLine = '';
    let oCol = '';
    let oFile = '';
    let oMsg = line.trim();
    if (line.startsWith(set.gccName + ' ') || line.startsWith(set.gppName + ' ') || line.startsWith(set.makeName) || line.startsWith(set.windresName + ' ') || line.startsWith(CLEAN_PROGRAM + ' ')) return;
    const getFileName = () => {
      oMsg = oMsg.trim();
      let delim: number;
      if (oMsg.length > 2 && oMsg[1] === ':') delim = oMsg.indexOf(':', 2);
      else delim = oMsg.indexOf(':');
      if (delim >= 0) {
        oFile = oMsg.slice(0, delim);
        oMsg = oMsg.slice(delim + 1);
      }
    };
    const getNumber = (): string => {
      oMsg = oMsg.trim();
      let delim = oMsg.indexOf(':');
      if (delim < 0) delim = oMsg.indexOf(',');
      if (delim >= 0) {
        const v = oMsg.slice(0, delim);
        if (/^-?\d+$/.test(v)) {
          oMsg = oMsg.slice(delim + 1);
          return v;
        }
      }
      return '';
    };
    const getMessageType = () => {
      oMsg = oMsg.trim();
      const delim = oMsg.indexOf(':');
      if (delim >= 0) {
        const s = oMsg.slice(0, delim);
        const rest = oMsg.slice(delim + 2).trim();
        if (s === 'error' || s === 'fatal error') {
          this.errCount++;
          oMsg = '[Error] ' + rest;
        } else if (s === 'warning') {
          this.warnCount++;
          oMsg = '[Warning] ' + rest;
        } else if (s === 'info') oMsg = '[Info] ' + rest;
        else if (s === 'note') oMsg = '[Note] ' + rest;
      }
    };
    if (oMsg.startsWith('In file included from ')) {
      oMsg = oMsg.slice('In file included from '.length);
      getFileName();
      oLine = getNumber();
      oCol = getNumber();
      ide.compilerOutput.push({ line: oLine, col: oCol, unit: oFile, msg: 'In file included from ' + oFile });
      this.outputChanged();
      return;
    } else if (oMsg.startsWith('from ')) {
      oMsg = oMsg.slice('from '.length);
      getFileName();
      oLine = getNumber();
      oCol = getNumber();
      ide.compilerOutput.push({ line: oLine, col: oCol, unit: oFile, msg: '                 from ' + oFile });
      this.outputChanged();
      return;
    }
    if (line.length > 0 && line[0] === ' ') return;
    getFileName();
    if (oFile === 'windres.exe') {
      getFileName();
      oLine = getNumber();
      this.errCount++;
      ide.resourceOutput.push({ line: oLine, col: '', unit: oFile, msg: oMsg });
      this.outputChanged();
      return;
    }
    oLine = getNumber();
    oCol = getNumber();
    getMessageType();
    ide.compilerOutput.push({ line: oLine, col: oCol, unit: oFile, msg: oMsg });
    this.outputChanged();
  }

  private outputChanged() {
    ide.msgs.emit();
  }

  /** feeds compiler output: log + parse (TCompiler.OnLineOutput) */
  private lineOutput(text: string) {
    for (const l of text.split(/\r?\n/)) {
      if (l === '' && text.endsWith('\n')) continue;
      this.log(l);
      this.processOutput(l);
    }
  }

  // ---------------------------------------------------------------- clang command lines

  private clangFlags(isC: boolean, userParams: string, forLink: boolean, hasCpp: boolean): string[] {
    const flags: string[] = [
      '-fno-color-diagnostics', '-fno-diagnostics-show-line-numbers', '-fno-caret-diagnostics',
      '-fwasm-exceptions', '-mllvm', '-wasm-enable-sjlj',
      '-D_WASI_EMULATED_SIGNAL', '-D_WASI_EMULATED_PROCESS_CLOCKS', '-D_WASI_EMULATED_GETPID', '-D_WASI_EMULATED_MMAN',
      '-Idevcpp/include', '-include', 'devcpp/include/devcpp_compat.h',
      // GCC 4.9 does not warn about these without -Wall
      '-Wno-unused-result', '-Wno-return-type', '-Wno-format', '-Wno-unused-value', '-Wno-parentheses',
      '-Wno-dangling-else', '-Wno-tautological-compare', '-Wno-self-assign', '-Wno-unused-comparison',
      '-Wno-empty-body', '-Wno-for-loop-analysis', '-Wno-switch', '-Wno-char-subscripts', '-Wno-uninitialized',
      '-Wno-sometimes-uninitialized', '-Wno-deprecated-declarations', '-Wno-string-plus-int', '-Wno-array-bounds',
      '-Wno-unused-variable', '-Wno-unused-but-set-variable', '-Wno-logical-not-parentheses', '-Wno-misleading-indentation',
      '-Wno-implicit-const-int-float-conversion', '-Wno-deprecated', '-Wno-c++11-narrowing-const-reference',
      '-Wno-error=c++11-narrowing', '-Wno-error=reserved-user-defined-literal', '-Wno-vla-cxx-extension',
      '-ferror-limit=0',
    ];
    if (isC) flags.push('-Wno-implicit-function-declaration', '-Wno-implicit-int', '-Wno-error=int-conversion', '-Wno-error=incompatible-pointer-types', '-Wno-error=incompatible-function-pointer-types', '-Wno-error=return-type');
    const user = this.mapUserFlags(userParams, isC);
    void forLink;
    void hasCpp;
    return [...flags, ...user];
  }

  private linkFlags(userLibs: string): string[] {
    return [
      'devcpp/devcpp_crt.o', 'devcpp/libdevcpp_eh.a', '-lwasi-emulated-signal', '-lwasi-emulated-process-clocks',
      '-lwasi-emulated-getpid', '-lwasi-emulated-mman', '-lsetjmp', '-lc-printscan-long-double',
      '-Wl,-z,stack-size=8388608', '-Wl,--max-memory=4294967296',
      ...this.mapUserFlags(userLibs, false).filter((f) => !f.startsWith('-I')),
    ];
  }

  /** files next to the source (headers, other sources) so #include "x.h" works */
  private sourceTree(dir: string): Tree {
    const t: Tree = {};
    const add = (d: string, into: Tree, depth: number) => {
      for (const n of vfs.list(d)) {
        const name = basename(n.path);
        if (n.dir) {
          if (depth < 16) {
            const sub: Tree = {};
            into[name] = sub;
            add(n.path, sub, depth + 1);
          }
        } else if (/\.(o|a|obj)$/i.test(name) && vfs.size(n.path) < 16 * 1024 * 1024) {
          into[name] = vfs.readBinary(n.path);
        } else if (/\.(c|cc|cpp|cxx|c\+\+|cp|h|hh|hpp|hxx|inl|tcc|txt|in|inc|def|ipp|tpp)$/i.test(name) && vfs.size(n.path) < 4 * 1024 * 1024) {
          into[name] = vfs.readText(n.path);
        }
      }
    };
    add(dir, t, 0);
    // unsaved editor contents win over disk contents
    for (const e of ide.allEditors) {
      if (!e.isNew && normalize(dirname(e.fileName)).toLowerCase() === normalize(dir).toLowerCase()) t[basename(e.fileName)] = e.text;
    }
    return t;
  }

  private mounts: { virtual: string; windows: string }[] = [];
  private inputFiles(dir: string): Tree {
    this.mounts = [{ virtual: SRC_DIR, windows: normalize(dir) }];
    const files: Tree = { [SRC_DIR]: this.sourceTree(dir) };
    const params = splitArgs([this.includesParams, this.cppIncludesParams, this.librariesParams, this.compileParams, this.cppCompileParams].join(' '));
    const directories: string[] = [];
    for (let i = 0; i < params.length; i++) {
      const flag = params[i];
      if (flag === '-I' || flag === '-L' || flag === '-isystem' || flag === '-iquote') directories.push(params[++i] ?? '');
      else if (/^-[IL].+/.test(flag)) directories.push(flag.slice(2));
      else if (/\.(a|o|obj)$/i.test(flag)) directories.push(dirname(expandFileTo(flag, dir)));
    }
    for (const entry of directories) {
      const windows = expandFileTo(entry, dir);
      if (!entry || !vfs.dirExists(windows) || this.mounts.some((m) => windows.toLowerCase() === m.windows.toLowerCase() || windows.toLowerCase().startsWith(m.windows.toLowerCase() + '\\'))) continue;
      const virtual = `mount${this.mounts.length}`;
      this.mounts.push({ virtual, windows }); files[virtual] = this.sourceTree(windows);
    }
    return files;
  }

  private virtualPath(path: string): string | null {
    const absolute = expandFileTo(path, this.mounts[0]?.windows ?? 'C:\\');
    const mount = this.mounts.find((m) => absolute.toLowerCase() === m.windows.toLowerCase() || absolute.toLowerCase().startsWith(m.windows.toLowerCase() + '\\'));
    return mount ? mount.virtual + absolute.slice(mount.windows.length).replace(/\\/g, '/') : null;
  }

  private mapUserFlags(params: string, isC: boolean) {
    const args = splitArgs(params), flags: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const flag = args[i];
      if (flag === '-I' || flag === '-L' || flag === '-isystem' || flag === '-iquote' || flag === '-include') {
        const path = this.virtualPath(args[++i] ?? ''); if (path) flags.push(flag, path);
      } else if (/^-[IL].+/.test(flag)) { const path = this.virtualPath(flag.slice(2)); if (path) flags.push(flag.slice(0, 2) + path); }
      else if (/\.(o|a|obj)$/i.test(flag)) { const path = this.virtualPath(flag); if (path) flags.push(path); }
      else flags.push(...mapFlag(flag, isC));
    }
    return flags;
  }

  private windowsPath(path: string, srcDir: string) {
    const mount = this.mounts.find((m) => path.startsWith(m.virtual + '/'));
    return mount ? joinPath(mount.windows, path.slice(mount.virtual.length + 1).replace(/\//g, '\\')) : toWindowsPath(path, srcDir);
  }

  /** converts clang's output into GCC style lines */
  private gccify(text: string, srcDir: string, isC: boolean): string {
    const out: string[] = [];
    const sources = new Map<string, string | null>();
    const getSrc = (clangPath: string) => {
      if (!sources.has(clangPath)) {
        const win = this.windowsPath(clangPath, srcDir);
        const ed = ide.fileIsOpen(win);
        sources.set(clangPath, ed ? ed.text : vfs.fileExists(win) ? vfs.readText(win) : null);
      }
      return sources.get(clangPath)!;
    };
    let lastFunc = '';
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l) continue;
      if (/^\d+ (errors?|warnings?)( and \d+ (errors?|warnings?))? generated\.$/.test(l)) continue;
      let m = /^In file included from (.+?):(\d+):$/.exec(l);
      if (m) {
        out.push(`In file included from ${this.windowsPath(m[1], srcDir)}:${m[2]}:0:`);
        continue;
      }
      m = /^(.+?):(\d+):(\d+): (error|fatal error|warning|note): (.*?)(?: \[(-W[^\]]+)\])?$/.exec(l);
      if (m) {
        const d: Diag = { file: m[1], line: +m[2], col: +m[3], kind: m[4] as Diag['kind'], msg: m[5] };
        const t = translate(d, getSrc(d.file), isC);
        const win = this.windowsPath(d.file, srcDir);
        // GCC prints the enclosing function before the first diagnostic inside it
        if (t.kind !== 'note') {
          const src = getSrc(d.file);
          const f = src ? functionAt(src, t.line, isC) : '';
          const key = win + '|' + f;
          if (f && key !== lastFunc) out.push(`${win}: ${f}:`);
          if (!f) lastFunc = '';
          else lastFunc = key;
        }
        const flag = m[6] ? ` [${translateFlag(m[6].split(',')[0])}]` : '';
        out.push(`${win}:${t.line}:${t.col}: ${t.kind}: ${t.msg}${flag}`);
        // source snippet like GCC 4.9
        const src = getSrc(d.file);
        if (src) {
          const sl = src.split('\n')[t.line - 1];
          if (sl !== undefined) {
            const expanded = sl.replace(/\r$/, '');
            out.push(' ' + expanded);
            out.push(' ' + expanded.slice(0, t.col - 1).replace(/[^\t]/g, ' ') + '^');
          }
        }
        if (d.kind === 'fatal error') out.push('compilation terminated.');
        continue;
      }
      // linker
      m = /^wasm-ld: error: (?:(.+?): )?undefined symbol: (.+)$/.exec(l);
      if (m) {
        const sym = m[2];
        if (sym === 'main' || sym === '__main_argc_argv' || sym === '__original_main')
          out.push(`${MINGW_DIR}\\x86_64-w64-mingw32\\lib\\libmingw32.a(lib64_libmingw32_a-crt0_c.o):crt0_c.c:(.text.startup+0x2e): undefined reference to \`WinMain'`);
        else out.push(`${this.tempObj(m[1])}:(.text+0x${(Math.abs(hash(sym)) % 0x400).toString(16)}): undefined reference to \`${sym}'`);
        continue;
      }
      m = /^wasm-ld: error: duplicate symbol: (.+)$/.exec(l);
      if (m) {
        out.push(`${this.tempObj(undefined)}:(.text+0x0): multiple definition of \`${m[1]}'`);
        continue;
      }
      if (/^wasm-ld: error: /.test(l)) {
        out.push(l.replace(/^wasm-ld: error: /, 'ld.exe: '));
        continue;
      }
      if (/^>>> /.test(l)) continue;
      if (/^clang(\+\+)?: error: linker command failed/.test(l)) {
        out.push('collect2.exe: error: ld returned 1 exit status');
        continue;
      }
      if (/^clang(\+\+)?: (error|warning): /.test(l)) {
        out.push(l.replace(/^clang(\+\+)?: /, (this.compilerSet.gppName || 'g++.exe') + ': '));
        continue;
      }
      out.push(l);
    }
    return out.join('\n');
  }

  private tempObj(clangPath?: string) {
    const name = clangPath ? basename(clangPath.replace(/-[0-9a-f]+\.o$/, '.o')) : 'cc.o';
    const src = name.replace(/\.o$/, '');
    return `C:\\Users\\Administrator\\AppData\\Local\\Temp\\cc${(Math.abs(hash(name)) % 0xffffff).toString(36).padStart(6, 'x').slice(0, 6)}.o:${src}.cpp`;
  }

  // ---------------------------------------------------------------- compile

  async compile(): Promise<void> {
    try {
      if (this.target === 'file') await this.compileFile();
      else if (this.target === 'project') await this.compileProject(false);
    } catch (error) {
      this.lineOutput(`compiler: error: ${String((error as Error).message ?? error)}`);
      this.compilationTerminated(null);
    }
  }

  private async compileFile(rebuild = false) {
    const set = this.compilerSet;
    const src = this.sourceFile;
    this.initProgress();
    this.log(lang(L.ID_LOG_COMPILINGFILE));
    this.log('--------');
    this.log(format(lang(L.ID_LOG_SOURCEFILE), [src]));
    this.log(format(lang(L.ID_LOG_COMPILERNAME), [set.name]));
    this.log('');
    this.getCompileParams();
    this.getLibrariesParams();
    this.getIncludesParams();
    const typ = getFileTyp(src);
    const exe = changeExt(src, EXE_EXT);
    const bin = (set.binDirs[0] ?? '') + '\\';
    let cmdline: string;
    let isC = false;
    let output: string | null = null;
    if (typ === 'resSrc') {
      cmdline = `${set.windresName} --input-format=rc -i ${src} -o ${this.checkSyntax ? 'nul' : changeExt(src, OBJ_EXT)}`;
      this.log(lang(L.ID_LOG_PROCESSINGRES));
      this.log('--------');
      this.log(format(lang(L.ID_LOG_WINDRESNAME), [bin + set.windresName]));
      this.log(format(lang(L.ID_LOG_COMMAND), [cmdline]));
    } else if (typ === 'cSrc') {
      isC = true;
      cmdline = this.checkSyntax
        ? `${set.gccName} "${src}" ${this.compileParams} ${this.includesParams} ${this.librariesParams}`
        : `${set.gccName} "${src}" -o "${exe}" ${this.compileParams} ${this.includesParams} ${this.librariesParams}`;
      output = this.checkSyntax ? null : exe;
      this.log(lang(L.ID_LOG_PROCESSINGCSRC));
      this.log('--------');
      this.log(format(lang(L.ID_LOG_GCCNAME), [bin + set.gccName]));
      this.log(format(lang(L.ID_LOG_COMMAND), [cmdline]));
    } else if (typ === 'cppSrc') {
      cmdline = this.checkSyntax
        ? `${set.gppName} "${src}" ${this.cppCompileParams} ${this.cppIncludesParams} ${this.librariesParams}`
        : `${set.gppName} "${src}" -o "${exe}" ${this.cppCompileParams} ${this.cppIncludesParams} ${this.librariesParams}`;
      output = this.checkSyntax ? null : exe;
      this.log(lang(L.ID_LOG_PROCESSINGCPPSRC));
      this.log('--------');
      this.log(format(lang(L.ID_LOG_GPPNAME), [bin + set.gppName]));
      this.log(format(lang(L.ID_LOG_COMMAND), [cmdline]));
    } else {
      cmdline = this.checkSyntax
        ? `${set.gppName} "${src}" ${this.cppCompileParams} ${this.cppIncludesParams} ${this.librariesParams}`
        : `${set.gppName} "${src}" ${this.compileParams} ${this.includesParams} ${this.librariesParams}`;
      this.log(lang(typ === 'cHead' || typ === 'cppHead' ? L.ID_LOG_PROCESSINGHEADER : L.ID_LOG_PROCESSINGUNKNOWN));
      this.log('--------');
      this.log(format(lang(L.ID_LOG_GCCNAME), [bin + set.gppName]));
      this.log(format(lang(L.ID_LOG_COMMAND), [cmdline]));
    }
    this.compiling = true;
    ide.compiling = true;
    ide.updateAppTitle();
    ide.changed();

    const srcDir = dirname(src);
    const name = basename(src);
    const files = this.inputFiles(srcDir);
    (files[SRC_DIR] as Tree)[name] = ide.fileIsOpen(src)?.text ?? vfs.readText(src);
    let jobs: ClangJob[] = [];
    const drv = isC ? 'clang' : 'clang++';
    const params = isC ? this.compileParams : this.cppCompileParams;
    const userFlags = [...this.clangFlags(isC || typ === 'cHead', params, true, !isC), ...this.mapUserFlags(isC ? this.includesParams : this.cppIncludesParams, isC)];
    const macroMap = [`-ffile-prefix-map=${SRC_DIR}/=${srcDir.replace(/\\?$/, '\\')}`];
    const wantsAsm = splitArgs(params).includes('-S');
    if (typ === 'resSrc') {
      this.lineOutput('windres.exe: error: Native Windows resources cannot be compiled by the WebAssembly runtime.');
      this.compilationTerminated(null);
      return;
    }
    else if (output) {
      if (wantsAsm) jobs = [{ tool: 'clang', args: [drv, ...userFlags, ...macroMap, `${SRC_DIR}/${name}`, '-o', 'out.wasm'] }];
      else
        jobs = [{ tool: 'clang', args: [drv, ...userFlags, ...macroMap, `${SRC_DIR}/${name}`, '-o', 'out.wasm', ...(isC ? [] : ['devcpp/devcpp_cxxrt.o']), ...this.linkFlags(this.librariesParams)] }];
    } else {
      jobs = [{ tool: 'clang', args: [typ === 'cHead' || typ === 'cSrc' ? 'clang' : 'clang++', '-fsyntax-only', ...(typ === 'cHead' || typ === 'cppHead' ? ['-x', typ === 'cHead' ? 'c-header' : 'c++-header'] : []), ...userFlags, `${SRC_DIR}/${name}`] }];
    }
    let code = 0;
    let produced: Uint8Array | undefined;
    if (jobs.length) {
      let raw = '';
      const r = await toolchain.run(jobs, files, ['out.wasm'], (t) => {
        raw += t;
      }, { force: rebuild });
      if (r.cacheHit) this.log(Lang.isChinese ? '已复用编译缓存。' : 'Reusing cached compilation.');
      if (r.code === -2) this.aborted = true;
      code = r.code;
      const gcc = this.gccify(raw || r.text, srcDir, isC);
      if (gcc) this.lineOutput(gcc);
      produced = r.outputs['out.wasm'];
      if (code !== 0 && this.errCount === 0 && !this.aborted) {
        // make sure a failed build is never reported as success
        this.errCount = 1;
      }
    }
    this.stepProgress();
    if (produced && output && code === 0) {
      vfs.write(output, produced);
      exeCache.delete(output.toLowerCase());
    }
    this.compilationTerminated(output && code === 0 ? output : null);
  }

  /** OnCompilationTerminated */
  private compilationTerminated(outputFile: string | null) {
    this.compiling = false;
    ide.compiling = false;
    this.onCompEnd?.(this.errCount === 0 && !this.aborted);
    ide.updateAppTitle();
    this.endProgress(outputFile);
    ide.changed();
    if (this.errCount === 0 && !this.aborted) this.onCompSuccess?.();
  }

  private endProgress(outputFile: string | null) {
    ide.progress = { ...ide.progress, pos: 0 };
    const t = (performance.now() - this.startTime) / 1000;
    this.log('');
    this.log(lang(L.ID_LOG_COMPILERESULTS));
    this.log('--------');
    this.log(format(lang(L.ID_LOG_ERRORS), [this.errCount]));
    this.log(format(lang(L.ID_LOG_WARNINGS), [this.warnCount]));
    let fileName: string;
    if (this.project) fileName = this.project.executable;
    else {
      const typ = getFileTyp(this.sourceFile);
      fileName =
        typ === 'resSrc' ? changeExt(this.sourceFile, OBJ_EXT) : typ === 'cSrc' || typ === 'cppSrc' ? changeExt(this.sourceFile, EXE_EXT) : typ === 'cHead' || typ === 'cppHead' ? this.sourceFile + GCH_EXT : this.sourceFile;
    }
    if (this.showOutputInfo && vfs.fileExists(fileName) && (outputFile || this.project)) {
      this.log(format(lang(L.ID_LOG_OUTPUTFILE), [fileName]));
      this.log(format(lang(L.ID_LOG_OUTPUTSIZE), [formatFileSize(vfs.size(fileName))]));
    }
    this.log(format(lang(L.ID_LOG_COMPILETIME), [t]));
    this.project?.saveToLog?.();
  }

  abort() {
    if (!this.compiling) return;
    this.aborted = true;
    toolchain.abort();
  }

  // ---------------------------------------------------------------- projects (make emulation)

  async compileProject(rebuild: boolean) {
    const prj = this.project!;
    const set = this.compilerSet;
    this.initProgress();
    this.log(lang(rebuild ? L.ID_LOG_REBUILDINGPROJECT : L.ID_LOG_PROJECTCOMPILE));
    this.log('--------');
    this.log(format(lang(L.ID_LOG_PROJECTFILE), [prj.fileName]));
    this.log(format(lang(L.ID_LOG_COMPILERNAME), [set.name]));
    this.log('');
    if (prj.options.useCustomMakefile || prj.units.some((u) => u.compile && u.overrideBuildCmd)) {
      this.lineOutput('make.exe: error: Custom Makefiles and custom build commands require a native build environment.');
      this.compilationTerminated(null);
      return;
    }
    this.getCompileParams();
    this.getLibrariesParams();
    this.getIncludesParams();
    this.buildMakeFile();
    const cmd = rebuild ? `${set.makeName} -f "${this.makeFileName}" clean all` : `${set.makeName} -f "${this.makeFileName}" all`;
    this.log(lang(L.ID_LOG_PROCESSINGMAKE));
    this.log('--------');
    this.log(format(lang(L.ID_LOG_MAKEFILEPROC), [(set.binDirs[0] ?? '') + '\\' + set.makeName]));
    this.log(format(lang(L.ID_LOG_COMMAND), [cmd]));
    this.log('');
    this.compiling = true;
    ide.compiling = true;
    ide.updateAppTitle();
    ide.changed();

    const dir = prj.directory;
    const exe = prj.executable;
    const units = prj.units.filter((u) => u.compile && ['cSrc', 'cppSrc'].includes(getFileTyp(u.fileName))).sort((a, b) => b.priority - a.priority);
    const rel = (f: string) => {
      const r = normalize(f).toLowerCase().startsWith(normalize(dir).toLowerCase() + '\\') ? normalize(f).slice(normalize(dir).length + 1) : basename(f);
      return r;
    };
    const objOf = (f: string) => {
      const objDir = prj.options.objectOutput ? joinPath(dir, prj.options.objectOutput) : '';
      return objDir ? joinPath(objDir, changeExt(basename(f), OBJ_EXT)) : changeExt(normalize(f), OBJ_EXT);
    };
    if (rebuild) {
      const objs = units.map((u) => rel(objOf(u.fileName)).replace(/\\/g, '/'));
      this.log(`${CLEAN_PROGRAM} -f ${objs.join(' ')} ${rel(exe).replace(/\\/g, '/')}`);
      for (const u of units) if (vfs.fileExists(objOf(u.fileName))) vfs.remove(objOf(u.fileName));
      if (vfs.fileExists(exe)) vfs.remove(exe);
      this.stepProgress();
    }
    const files = this.inputFiles(dir);
    const generatedObjects = new Set(units.map((u) => this.virtualPath(objOf(u.fileName))).filter((p): p is string => p !== null));
    const topology = inputTopology(files, generatedObjects);
    // include directories of the project
    const anyCpp = prj.options.useGPP;
    let failed = false;
    const objPaths: string[] = [];
    const objTree: Tree = {};
    for (const [index, unit] of prj.units.entries()) {
      if (!unit.link || unit.compile) continue;
      const path = ['cSrc', 'cppSrc'].includes(getFileTyp(unit.fileName)) ? objOf(unit.fileName) : unit.fileName;
      if (vfs.fileExists(path) && /\.(o|obj|a)$/i.test(path)) { objPaths.push(path); objTree[`linked${index}.o`] = vfs.readBinary(path); }
    }
    for (const [unitIndex, u] of units.entries()) {
      const o = objOf(u.fileName);
      const virtualObject = `unit${unitIndex}.o`;
      if (u.link) objPaths.push(o);
      const isCpp = u.compileCpp || getFileTyp(u.fileName) === 'cppSrc';
      const r = rel(u.fileName).replace(/\\/g, '/');
      const ro = rel(o).replace(/\\/g, '/');
      const userFlags = this.clangFlags(!isCpp, isCpp ? this.cppCompileParams : this.compileParams, false, isCpp);
      const projIncludes = this.mapUserFlags(isCpp ? this.cppIncludesParams : this.includesParams, !isCpp);
      const args = [isCpp ? 'clang++' : 'clang', ...(isCpp ? [] : ['-x', 'c']), ...userFlags, ...projIncludes, `-ffile-prefix-map=${SRC_DIR}/=${dir}\\`, '-c', `${SRC_DIR}/${r}`,
        ...(this.checkSyntax ? ['-fsyntax-only'] : ['-MD', '-MF', 'out.d', '-MT', 'out.o', '-o', 'out.o'])];
      const signature = JSON.stringify(args);
      const objectKey = normalize(o).toLowerCase();
      const previous = this.objectBuilds.get(objectKey);
      const upToDate = !rebuild && !this.checkSyntax && previous?.signature === signature
        && vfs.get(o) === previous.artifact && matchesInputs(files, previous.inputs, topology);
      if (upToDate) {
        if (u.link) objTree[virtualObject] = vfs.readBinary(o);
        continue;
      }
      const line = this.checkSyntax
        ? `${isCpp ? set.gppName : set.gccName} -c ${r} ${isCpp ? '$(CXXFLAGS)' : '$(CFLAGS)'}`.replace('$(CXXFLAGS)', this.cppIncludesParams.replace(/\\/g, '/') + ' ' + this.cppCompileParams).replace('$(CFLAGS)', this.includesParams.replace(/\\/g, '/') + ' ' + this.compileParams)
        : `${isCpp ? set.gppName : set.gccName} -c ${r} -o ${ro} ${isCpp ? this.cppIncludesParams.replace(/\\/g, '/') + ' ' + this.cppCompileParams : this.includesParams.replace(/\\/g, '/') + ' ' + this.compileParams}`;
      this.log(line);
      this.stepProgress();
      let raw = '';
      const res = await toolchain.run([{ tool: 'clang', args }], files, this.checkSyntax ? [] : ['out.o', 'out.d'], (t) => (raw += t), { force: rebuild });
      if (res.code === -2) {
        this.aborted = true;
        failed = true;
        break;
      }
      const gcc = this.gccify(raw || res.text, dir, !isCpp);
      if (gcc) this.lineOutput(gcc);
      if (res.code !== 0) {
        failed = true;
        this.log(`${set.makeName}: *** [${ro}] Error 1`);
        if (this.errCount === 0) this.errCount = 1;
        break;
      }
      if (res.outputs['out.o']) {
        vfs.write(o, res.outputs['out.o']);
        this.objectBuilds.delete(objectKey);
        const deps = res.outputs['out.d'] ? dependencyPaths(new TextDecoder().decode(res.outputs['out.d'])) : [];
        const inputs = deps.includes(`${SRC_DIR}/${r}`) ? snapshotInputs(files, deps, topology) : null;
        if (inputs) {
          if (this.objectBuilds.size >= 256) this.objectBuilds.delete(this.objectBuilds.keys().next().value!);
          this.objectBuilds.set(objectKey, { signature, inputs, artifact: vfs.get(o)! });
        }
        if (u.link) objTree[virtualObject] = res.outputs['out.o'];
      }
    }
    let produced = false;
    if (!failed && !this.checkSyntax && !this.aborted) {
      if (prj.options.type === 'static') {
        this.log(`ar r ${rel(exe).replace(/\\/g, '/')} ${objPaths.map((o) => rel(o).replace(/\\/g, '/')).join(' ')}`);
        this.log(`ranlib ${rel(exe).replace(/\\/g, '/')}`);
        const res = await toolchain.run([{ tool: 'llvm', args: ['ar', 'rcs', 'out.a', ...Object.keys(objTree).map((k) => 'objs/' + k)] }], { ...files, objs: objTree }, ['out.a'], undefined, { force: rebuild });
        if (res.cacheHit) this.log(`${set.makeName}: Nothing to be done for 'all'.`);
        if (res.code === 0 && res.outputs['out.a']) {
          vfs.write(exe, res.outputs['out.a']);
          produced = true;
        } else { this.errCount++; this.lineOutput(res.text || 'ar: error: Failed to create archive'); }
      } else {
        const linker = prj.options.useGPP ? set.gppName : set.gccName;
        this.log(`${linker} ${objPaths.map((o) => rel(o).replace(/\\/g, '/')).join(' ')} -o ${rel(exe).replace(/\\/g, '/')} ${this.librariesParams.replace(/\\/g, '/')}`);
        this.stepProgress();
        let raw = '';
        const args = [prj.options.useGPP ? 'clang++' : 'clang', '-fwasm-exceptions', ...Object.keys(objTree).map((k) => 'objs/' + k), '-o', 'out.wasm', ...(prj.options.useGPP ? ['devcpp/devcpp_cxxrt.o'] : []), ...this.linkFlags(this.librariesParams)];
        const res = await toolchain.run([{ tool: 'clang', args }], { ...files, objs: objTree }, ['out.wasm'], (t) => (raw += t), { force: rebuild });
        if (res.cacheHit) this.log(`${set.makeName}: Nothing to be done for 'all'.`);
        const gcc = this.gccify(raw || res.text, dir, false);
        if (gcc) this.lineOutput(gcc);
        if (res.code === 0 && res.outputs['out.wasm']) {
          vfs.write(exe, res.outputs['out.wasm']);
          exeCache.delete(exe.toLowerCase());
          produced = true;
        } else {
          this.log(`${set.makeName}: *** [${rel(exe).replace(/\\/g, '/')}] Error 1`);
          if (this.errCount === 0) this.errCount = 1;
        }
      }
    }
    this.stepProgress();
    this.compilationTerminated(produced ? exe : null);
  }

  /** writes Makefile.win the way Dev-C++ does */
  buildMakeFile() {
    const prj = this.project!;
    if (prj.options.useCustomMakefile && prj.options.customMakefile) {
      this.makeFileName = prj.options.customMakefile;
      return;
    }
    this.makeFileName = prj.makeFileName;
    this.log(lang(L.ID_LOG_BUILDINGMAKEFILE));
    this.log('--------');
    this.log(format(lang(L.ID_LOG_MAKEFILENAME), [this.makeFileName]));
    this.log('');
    vfs.write(this.makeFileName, prj.makefileText(this).replace(/\n/g, '\r\n'));
  }

  async clean() {
    this.objectBuilds.clear();
    toolchain.clearCache();
    this.initProgress();
    if (this.target === 'file') {
      this.log(lang(L.ID_LOG_CLEANINGFILE));
      this.log('--------');
      this.log(format(lang(L.ID_LOG_SOURCEFILE), [this.sourceFile]));
      this.log(format(lang(L.ID_LOG_COMPILERNAME), [this.compilerSet.name]));
      this.log('');
      const typ = getFileTyp(this.sourceFile);
      const f = typ === 'resSrc' ? changeExt(this.sourceFile, OBJ_EXT) : typ === 'cSrc' || typ === 'cppSrc' ? changeExt(this.sourceFile, EXE_EXT) : this.sourceFile + GCH_EXT;
      if (vfs.fileExists(f)) {
        this.log(format(lang(L.ID_LOG_CLEANEDFILE), [f]));
        vfs.remove(f);
      } else this.log(lang(L.ID_LOG_NOCLEANFILE));
      this.compilationTerminated(null);
      return;
    }
    const prj = this.project!;
    this.log(lang(L.ID_LOG_CLEANINGPROJECT));
    this.log('--------');
    this.log(format(lang(L.ID_LOG_PROJECTFILE), [prj.fileName]));
    this.log(format(lang(L.ID_LOG_COMPILERNAME), [this.compilerSet.name]));
    this.log('');
    this.getCompileParams();
    this.getLibrariesParams();
    this.getIncludesParams();
    this.buildMakeFile();
    const set = this.compilerSet;
    const cmd = `${set.makeName} clean -f "${this.makeFileName}"`;
    this.log(lang(L.ID_LOG_PROCESSINGMAKE));
    this.log('--------');
    this.log(format(lang(L.ID_LOG_MAKEFILEPROC), [(set.binDirs[0] ?? '') + '\\' + set.makeName]));
    this.log(format(lang(L.ID_LOG_COMMAND), [cmd]));
    this.log('');
    const objs: string[] = [];
    for (const u of prj.units) {
      if (!['cSrc', 'cppSrc'].includes(getFileTyp(u.fileName))) continue;
      const o = prj.options.objectOutput ? joinPath(joinPath(prj.directory, prj.options.objectOutput), changeExt(basename(u.fileName), OBJ_EXT)) : changeExt(u.fileName, OBJ_EXT);
      objs.push(o);
      if (vfs.fileExists(o)) vfs.remove(o);
    }
    this.log(`${CLEAN_PROGRAM} -f ${objs.map((o) => basename(o)).join(' ')} ${basename(prj.executable)}`);
    if (vfs.fileExists(prj.executable)) vfs.remove(prj.executable);
    this.compilationTerminated(null);
  }

  async rebuildAll() {
    try {
      if (this.target === 'file') await this.compileFile(true);
      else await this.compileProject(true);
    } catch (error) {
      this.lineOutput(`compiler: error: ${String((error as Error).message ?? error)}`);
      this.compilationTerminated(null);
    }
  }

  // ---------------------------------------------------------------- run

  exeToRun(): string | null {
    if (this.target === 'file') {
      const typ = getFileTyp(this.sourceFile);
      if (typ === 'cSrc' || typ === 'cppSrc') return changeExt(this.sourceFile, EXE_EXT);
      return null;
    }
    if (this.target === 'project') return this.project!.executable;
    return null;
  }
}

/** compiled WebAssembly modules of executables, so F10 starts instantly */
export const exeCache = new Map<string, { mtime: number; module: WebAssembly.Module }>();

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export async function askCompile(project: boolean) {
  return MessageDlg(lang(project ? L.ID_ERR_PROJECTNOTCOMPILEDSUGGEST : L.ID_ERR_SRCNOTCOMPILEDSUGGEST), 'mtConfirmation', ['mbYes', 'mbNo']);
}

export { devData };
