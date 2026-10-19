// Entry points for every dialog / command implemented outside the action table.
import { ide } from '../ide';
import { lang, format } from '../../lang/lang';
import * as L from '../../generated/langIds';
import { devData, settings, saveSettings } from '../config';
import type { ToolItem } from '../config';
import { MessageDlg, MessageBox, InputQuery, MB_ICONERROR, MB_OK } from '../../os/messagebox';
import { wm } from '../../os/wm';
import { vfs, basename, dirname, joinPath, changeExt } from '../../os/vfs';
import { parseMacros } from '../macros';
import * as run from '../run';

let findShowing = false;
export const findFormShowing = () => findShowing;
export const setFindShowing = (v: boolean) => {
  findShowing = v;
  ide.changed();
};

// ---------------------------------------------------------------- file
export async function newProject() {
  (await import('./NewProjectForm')).showNewProject();
}
export async function newTemplate() {
  (await import('./NewTemplateForm')).showNewTemplate();
}
export async function newClass() {
  (await import('./ClassForms')).showNewClass();
}
export async function newMember() {
  (await import('./ClassForms')).showNewFunction();
}
export async function newVar() {
  (await import('./ClassForms')).showNewVar();
}
export async function saveProjectAs() {
  (await import('./projectOps')).saveProjectAs();
}
export async function exportFile(kind: 'html' | 'rtf' | 'tex') {
  (await import('./exporters')).exportEditor(kind);
}
export async function exportProjectHTML() {
  (await import('./exporters')).exportProject();
}
export async function print() {
  (await import('./PrintForm')).showPrint();
}
export async function printerSetup() {
  (await import('./PrintForm')).showPrinterSetup();
}
export async function exitApp() {
  if (ide.windowId) await wm.requestClose(ide.windowId);
}
export async function fileProperties() {
  (await import('./FilePropertiesForm')).showFileProperties();
}
export async function importMSVC() {
  (await import('./ImportMSVCForm')).showImportMSVC();
}
export async function openContainingFolder() {
  const e = ide.getEditor();
  if (!e) return;
  const { showFileDialog } = await import('../../os/FileDialog');
  const r = await showFileDialog({ mode: 'open', title: dirname(e.fileName), filter: 'All files (*.*)|*.*', initialDir: dirname(e.fileName), multiSelect: true });
  if (r) await ide.openFileList(r.files);
}

// ---------------------------------------------------------------- edit / search
export async function addToDo() {
  (await import('./ToDoForms')).showAddToDo();
}
export async function viewToDo() {
  (await import('./ToDoForms')).showViewToDo();
}
export async function find(tab: number) {
  (await import('./FindForm')).showFind(tab);
}
export async function searchAgain(backwards: boolean) {
  (await import('./FindForm')).searchAgain(backwards);
}
export async function incremental() {
  (await import('./IncrementalForm')).showIncremental();
}
export async function gotoFunction() {
  (await import('./FunctionSearchForm')).showFunctionSearch();
}
export async function gotoLine() {
  (await import('./GotoLineForm')).showGotoLine();
}

// ---------------------------------------------------------------- project
export async function projectNewUnit() {
  (await import('./projectOps')).projectNewUnit();
}
export async function projectAddFile() {
  (await import('./projectOps')).projectAddFile();
}
export async function projectRemoveFile() {
  (await import('./projectOps')).projectRemoveFile();
}
export async function projectOptions() {
  (await import('./ProjectOptionsForm')).showProjectOptions();
}
export async function editMakefile() {
  (await import('./projectOps')).editMakefile();
}
export async function projectNewFolder() {
  (await import('./projectOps')).newFolder();
}
export async function projectRemoveFolder() {
  (await import('./projectOps')).removeFolder();
}
export async function projectRenameFolder() {
  (await import('./projectOps')).renameFolder();
}
export async function unitRemove() {
  (await import('./projectOps')).unitRemove();
}
export async function unitRename() {
  (await import('./projectOps')).unitRename();
}
export async function unitOpen() {
  (await import('./projectOps')).unitOpen();
}
export async function unitClose() {
  (await import('./projectOps')).unitClose();
}

// ---------------------------------------------------------------- execute / debug
export async function execParams() {
  (await import('./ParamsForm')).showParams();
}
export async function profile() {
  (await import('./debugOps')).profile();
}
export async function deleteProfile() {
  (await import('./debugOps')).deleteProfile();
}
export async function debug() {
  (await import('./debugOps')).debug();
}
export async function addWatch() {
  (await import('./debugOps')).addWatch();
}

// ---------------------------------------------------------------- tools
export async function compilerOptions() {
  (await import('./CompOptForm')).showCompilerOptions();
}
export async function environmentOptions() {
  (await import('./EnviroForm')).showEnvironmentOptions();
}
export async function editorOptions() {
  (await import('./EditorOptForm')).showEditorOptions();
}
export async function configTools() {
  (await import('./ToolForms')).showConfigTools();
}
export async function configShortcuts() {
  (await import('./ShortcutsForm')).showShortcuts();
}
export async function packageManager() {
  await MessageBox(
    format(lang(L.ID_ERR_FILENOTFOUND), [settings.dirs.Exec + 'packman.exe']),
    lang(L.ID_ERROR),
    MB_OK | MB_ICONERROR,
  );
}
export async function formatCurrentFile() {
  (await import('../formatter')).formatCurrentFile();
}
export async function formatterOptions() {
  (await import('./FormatterOptionsForm')).showFormatterOptions();
}
export function runTool(t: ToolItem) {
  const exec = parseMacros(t.Exec);
  return run.runExternal(exec.replace(/^"|"$/g, ''), parseMacros(t.Params), parseMacros(t.WorkDir));
}

// ---------------------------------------------------------------- window / help
export function toggleFullScreen() {
  devData.FullScreen = !devData.FullScreen;
  if (ide.windowId) {
    const w = wm.get(ide.windowId);
    if (w) wm.update(ide.windowId, { className: devData.FullScreen ? 'fullscreen' : '' });
  }
  if (devData.FullScreen) {
    ide.setStatusbarMessage(format(lang(L.ID_FULLSCREEN_MSGNEW), ['Ctrl+F11', 'Ctrl+F12']));
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  ide.changed();
}
export async function windowList() {
  (await import('./WindowListForm')).showWindowList();
}
export async function help() {
  (await import('./HelpWindow')).showHelp();
}
export async function about() {
  (await import('./AboutForm')).showAbout();
}
export async function tips() {
  (await import('./TipOfTheDayForm')).showTips();
}
export async function toggleFloating(which: 'project' | 'report') {
  (await import('./floating')).toggleFloating(which);
}

// ---------------------------------------------------------------- class browser
export function browserHasSelection() {
  return !!ide.browserSelected;
}
export function browserSelectionIsClass() {
  return ide.browserSelected?.kind === 'class';
}
export async function browserGoto(definition: boolean) {
  (await import('../parser/browserOps')).browserGoto(definition);
}
export function setBrowserFilter(f: number) {
  settings.classBrowsing.ShowFilter = f;
  saveSettings();
  ide.changed();
}
export async function gotoDeclEditor(impl: boolean) {
  (await import('../parser/browserOps')).gotoDeclEditor(impl);
}
export async function showCompletion() {
  (await import('../editor/completion')).showCompletionNow();
}

// ---------------------------------------------------------------- messages popup
export async function msgCopy(cut: boolean) {
  (await import('./messageOps')).msgCopy(cut);
}
export async function msgCopyAll() {
  (await import('./messageOps')).msgCopyAll();
}
export async function msgPaste() {
  (await import('./messageOps')).msgPaste();
}
export async function msgSelectAll() {
  (await import('./messageOps')).msgSelectAll();
}
export async function msgSaveAll() {
  (await import('./messageOps')).msgSaveAll();
}
export async function msgClear() {
  (await import('./messageOps')).msgClear();
}

export { MessageDlg, InputQuery, vfs, basename, joinPath, changeExt, run };
