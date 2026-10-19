// Compile / run orchestration (PrepareForCompile, actCompRunExecute, TCompiler.Run, devExecutor).
import { ide } from './ide';
import { Compiler, exeCache, askCompile, splitArgs } from '../compiler/Compiler';
import type { Target } from '../compiler/Compiler';
import { currentCompilerSet, devData, settings, saveSettings } from './config';
import { lang, format } from '../lang/lang';
import * as L from '../generated/langIds';
import { MessageDlg } from '../os/messagebox';
import { mrYes } from '../vcl/FormCtl';
import { vfs, basename, dirname, joinPath } from '../os/vfs';
import { wm } from '../os/wm';
import { ConsoleSession } from '../console/ConsoleSession';
import { ConsoleView, consoleWindowSize, CONSOLE_ICON } from '../console/ConsoleWindow';
import { createElement } from 'react';

export const compiler = new Compiler();
let compSuccessAction: 'none' | 'run' | 'debug' | 'profile' = 'none';
export let session: ConsoleSession | null = null;

compiler.onCompEnd = compEndProc;
compiler.onCompSuccess = () => {
  const a = compSuccessAction;
  compSuccessAction = 'none';
  if (a === 'run' || a === 'debug' || a === 'profile') void run();
};

export function getCompileTarget(): Target {
  const e = ide.getEditor();
  if (e) {
    if (ide.project && (e.inProject || ide.project.makeFileName.toLowerCase() === e.fileName.toLowerCase())) return 'project';
    return 'file';
  }
  if (ide.project) return 'project';
  return 'none';
}

function compilationSet() {
  if (ide.project && getCompileTarget() === 'project') return settings.compilerSets[ide.project.options.compilerSet] ?? currentCompilerSet();
  return currentCompilerSet();
}

function prepareForRun(): boolean {
  compiler.project = null;
  compiler.sourceFile = '';
  compiler.compilerSet = compilationSet();
  compiler.target = getCompileTarget();
  if (compiler.target === 'none' || compiler.target === 'invalid') return false;
  if (compiler.target === 'file') compiler.sourceFile = ide.getEditor()!.fileName;
  else compiler.project = ide.project;
  return true;
}

async function prepareForCompile(): Promise<boolean> {
  ide.clearCompileMessages();
  if (devData.ShowProgress) {
    ide.openCloseMessageSheet(true);
    ide.setMessagePage('log');
  }
  const set = compilationSet();
  if (!set.binDirs.length) {
    ide.logEntry(format(lang(L.ID_LOG_NOBINDIRABORT), [set.name]));
    return false;
  }
  compiler.project = null;
  compiler.sourceFile = '';
  compiler.compilerSet = set;
  compiler.target = getCompileTarget();
  switch (compiler.target) {
    case 'none':
      ide.logEntry(lang(L.ID_LOG_NOTHINGABORT));
      return false;
    case 'file': {
      const e = ide.getEditor()!;
      if (!(await ide.saveEditor(e))) return false;
      compiler.sourceFile = e.fileName;
      break;
    }
    case 'project': {
      compiler.project = ide.project;
      const p = ide.project!;
      if (!(await p.saveUnits())) return false;
      p.saveOptions();
      ide.updateAppTitle();
      for (const e of ide.allEditors) if (e.inProject && e.modified) return false;
      if (p.options.versionInfo.autoIncBuildNr) p.incrementBuildNumber();
      break;
    }
    default:
      return false;
  }
  return true;
}

async function alreadyCompiling() {
  if (compiler.compiling) {
    await MessageDlg(lang(L.ID_MSG_ALREADYCOMP), 'mtInformation', ['mbOK']);
    return true;
  }
  return false;
}

export async function actCompile() {
  stopExecute();
  if (await alreadyCompiling()) return;
  if (!(await prepareForCompile())) return;
  compiler.checkSyntax = false;
  await compiler.compile();
}

export async function actRun() {
  stopExecute();
  if (await alreadyCompiling()) return;
  if (!prepareForRun()) return;
  await run();
}

export async function actCompRun() {
  stopExecute();
  if (await alreadyCompiling()) return;
  if (!(await prepareForCompile())) return;
  compSuccessAction = 'run';
  compiler.checkSyntax = false;
  await compiler.compile();
}

export async function actRebuild() {
  stopExecute();
  if (await alreadyCompiling()) return;
  if (!(await prepareForCompile())) return;
  compiler.checkSyntax = false;
  await compiler.rebuildAll();
}

export async function actClean() {
  stopExecute();
  if (await alreadyCompiling()) return;
  ide.clearCompileMessages();
  if (devData.ShowProgress) {
    ide.openCloseMessageSheet(true);
    ide.setMessagePage('log');
  }
  if (!prepareForRun()) {
    ide.logEntry(lang(L.ID_LOG_NOTHINGABORT));
    return;
  }
  await compiler.clean();
}

export async function actSyntaxCheck(currentFileOnly: boolean) {
  stopExecute();
  if (await alreadyCompiling()) return;
  if (!(await prepareForCompile())) return;
  if (currentFileOnly && compiler.target === 'project') {
    compiler.target = 'file';
    compiler.project = null;
    compiler.sourceFile = ide.getEditor()?.fileName ?? '';
  }
  compiler.checkSyntax = true;
  await compiler.compile();
  compiler.checkSyntax = false;
}

/** CompEndProc: show messages and jump to the first error */
function compEndProc(success: boolean) {
  if (!success) compSuccessAction = 'none';
  const out = ide.compilerOutput;
  if (out.length === 0 && ide.resourceOutput.length === 0 && devData.AutoCloseProgress) ide.openCloseMessageSheet(false);
  else {
    if (out.length > 0) ide.setMessagePage('comp');
    else if (ide.resourceOutput.length > 0) ide.setMessagePage('res');
    ide.openCloseMessageSheet(true);
  }
  if (compiler.errCount > 0) {
    const pick = out.findIndex((i) => i.line !== '' && i.msg.startsWith('[Error]'));
    const warn = out.findIndex((i) => i.line !== '' && i.msg.startsWith('[Warning]'));
    const any = out.findIndex((i) => i.line !== '');
    const idx = pick >= 0 ? pick : warn >= 0 ? warn : any;
    if (idx >= 0) {
      ide.compSel = idx;
      gotoMessage(out[idx]);
    }
  }
  ide.msgs.emit();
}

export function gotoMessage(item: { line: string; col: string; unit: string }) {
  const line = parseInt(item.line, 10) || 1;
  const col = parseInt(item.col, 10) || 1;
  if (!item.unit) return;
  const e = ide.getEditorFromFileName(item.unit);
  if (e) {
    e.setErrorFocus(col, line);
    ide.activate(e);
  }
}

// ---------------------------------------------------------------- run (TCompiler.Run)

export async function run() {
  const target = compiler.target;
  if (target === 'none' || target === 'invalid') return;
  const prj = compiler.project;
  let fileToRun = compiler.exeToRun();
  let params = compiler.runParams;
  if (target === 'project' && prj) {
    if (prj.options.type === 'static') {
      await MessageDlg(lang(L.ID_ERR_NOTEXECUTABLE), 'mtError', ['mbOK']);
      return;
    }
    if (prj.options.type === 'dll') {
      await MessageDlg(lang(prj.options.hostApplication ? L.ID_ERR_HOSTNOTEXIST : L.ID_ERR_HOSTMISSING), 'mtWarning', ['mbOK']);
      return;
    }
    params = prj.options.cmdLineArgs;
  }
  if (!fileToRun) return;
  if (!vfs.fileExists(fileToRun) || vfs.size(fileToRun) === 0) {
    if (canCompileRun()) {
      if ((await askCompile(target === 'project')) === mrYes) await actCompRun();
    } else await MessageDlg(lang(L.ID_ERR_SRCNOTCOMPILED), 'mtWarning', ['mbOK']);
    return;
  }
  fileToRun = vfs.realPath(fileToRun);
  const bytes = vfs.readBinary(fileToRun);
  if (bytes.length < 8 || bytes[0] !== 0 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) {
    await MessageDlg(`${fileToRun}\r\n\r\nThis app can't run on your PC.`, 'mtError', ['mbOK']);
    return;
  }
  const dir = dirname(fileToRun);
  startConsole(fileToRun, bytes, params, workingFiles(dir), dir);
}

function workingFiles(directory: string) {
  const files: Record<string, Uint8Array> = {};
  const add = (dir: string, prefix: string, depth: number) => {
    for (const node of vfs.list(dir)) {
      const path = prefix + basename(node.path);
      if (node.dir) { if (depth < 16) add(node.path, path + '/', depth + 1); }
      else if (vfs.size(node.path) <= 16 * 1024 * 1024 && !/\.(exe|o|a|dll|wasm)$/i.test(node.path)) files[path] = vfs.readBinary(node.path);
    }
  };
  add(directory, '', 0); return files;
}

export async function runExternal(exe: string, params: string, workingDirectory?: string) {
  stopExecute();
  if (!vfs.fileExists(exe)) { await MessageDlg(`${exe}\nFile not found.`, 'mtError', ['mbOK']); return; }
  const bytes = vfs.readBinary(exe);
  if (bytes.length < 8 || bytes[0] !== 0 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) { await MessageDlg(`${exe}\nOnly programs compiled for this browser runtime can run here.`, 'mtError', ['mbOK']); return; }
  const dir = workingDirectory && vfs.dirExists(workingDirectory) ? workingDirectory : dirname(exe);
  startConsole(exe, bytes, params, workingFiles(dir), dir);
}

function canCompileRun() {
  const t = getCompileTarget();
  if (ide.project && t === 'project' && ide.project.options.type === 'static') return false;
  return !compiler.compiling && t !== 'none';
}

function startConsole(exe: string, wasm: Uint8Array, params: string, files: Record<string, Uint8Array>, dir: string) {
  if (!crossOriginIsolated) {
    void MessageDlg('This page is not cross-origin isolated, so programs cannot read keyboard input.\r\nReload the page (the service worker enables it on first load).', 'mtError', ['mbOK']);
    return;
  }
  const s = new ConsoleSession({
    wasm,
    exePath: exe,
    args: splitArgs(params),
    files,
    pause: devData.ConsolePause,
    onExit: (_code, changed, deleted = []) => {
      ide.running = false;
      for (const name of deleted) vfs.remove(joinPath(dir, name.replace(/\//g, '\\')));
      for (const [name, data] of Object.entries(changed)) {
        try {
          const target = joinPath(dir, name.replace(/\//g, '\\'));
          vfs.write(target, data);
        } catch {
          /* ignore */
        }
      }
      ide.updateAppTitle();
      ide.changed();
    },
    onClose: () => {
      if (session === s) session = null;
      wm.close(s.windowId);
      if (devData.MinOnRun && ide.windowId) wm.setState(ide.windowId, 'normal');
      ide.changed();
    },
  });
  session = s;
  const size = consoleWindowSize();
  const n = wm.windows.filter((w) => w.kind === 'console').length;
  s.windowId = wm.open({
    title: exe,
    icon: CONSOLE_ICON,
    clientW: size.clientW,
    clientH: size.clientH,
    x: 60 + n * 26,
    y: 40 + n * 26,
    resizable: false,
    kind: 'console',
    clientBg: '#0c0c0c',
    render: () => createElement(ConsoleView, { session: s }),
    onCloseRequest: () => {
      s.kill();
      return false;
    },
  });
  s.onTitle = (t) => wm.update(s.windowId, { title: t });
  ide.running = true;
  ide.updateAppTitle();
  ide.changed();
  if (devData.MinOnRun && ide.windowId) wm.minimize(ide.windowId);
  s.start();
  void exeCache;
}

export function stopExecute() {
  if (session) {
    session.kill();
    session = null;
  }
}

export function isRunning() {
  return !!session && session.state === 'running';
}

export function abortCompilation() {
  compiler.abort();
}

export function setRunParams(p: string) {
  compiler.runParams = p;
}

export { saveSettings };
