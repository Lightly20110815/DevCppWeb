// TMainForm.ActionList: every action with caption (LoadText), shortcut, image and handlers.
import mainDfm from '../generated/forms/main.json';
import * as L from '../generated/langIds';
import { lang } from '../lang/lang';
import { ide } from './ide';
import { devData, devEditor, settings, saveSettings } from './config';
import { shortCutToText, textToShortCut } from './shortcuts';
import * as run from './run';
import * as ed from './editor/commands';
import * as forms from './forms';
import type { DfmNode } from '../vcl/FormCtl';
import { MessageDlg } from '../os/messagebox';
import { openPopup } from '../os/menu';
import { buildBookmarkMenu, buildInsertMenu } from './menus';

export interface Action {
  name: string;
  captionId?: number;
  defaultCaption: string;
  shortcut: number;
  defaultShortcut: number;
  imageIndex: number;
  category: string;
  execute?: () => unknown;
  enabled?: () => boolean;
  checked?: () => boolean;
  hint?: string;
}

const CAPTION_IDS: Record<string, number> = {
  actNewSource: L.ID_ITEM_NEWSOURCE, actNewProject: L.ID_ITEM_NEWPROJECT, actNewTemplate: L.ID_ITEM_NEWTEMPLATE,
  actNewClass: L.ID_ITEM_NEWCLASS, actOpen: L.ID_ITEM_OPEN, actSave: L.ID_ITEM_SAVEFILE, actSaveAs: L.ID_ITEM_SAVEAS,
  actSaveProjectAs: L.ID_ITEM_SAVEASPROJECT, actSaveAll: L.ID_ITEM_SAVEALL, actClose: L.ID_ITEM_CLOSEFILE,
  actCloseProject: L.ID_ITEM_CLOSEPROJECT, actCloseAll: L.ID_ITEM_CLOSEALL, actFileProperties: L.ID_ITEM_PROPERTIES,
  actImportMSVC: L.ID_MSVC_MENUITEM, actExportHTML: L.ID_ITEM_EXPORTHTML, actExportRTF: L.ID_ITEM_EXPORTRTF,
  actExportTex: L.ID_ITEM_EXPORTTEX, actExportProject: L.ID_ITEM_EXPORTPROJECT, actPrint: L.ID_ITEM_PRINT,
  actPrintSU: L.ID_ITEM_PRINTSETUP, actHistoryClear: L.ID_ITEM_CLEARHISTORY, actExit: L.ID_ITEM_EXIT,
  actMsgCut: L.ID_ITEM_CUT, actMsgCopy: L.ID_ITEM_COPY, actMsgCopyAll: L.ID_ITEM_COPYALL, actMsgPaste: L.ID_ITEM_PASTE,
  actMsgSelAll: L.ID_ITEM_SELECTALL, actMsgSaveAll: L.ID_ITEM_SAVEALL, actMsgClear: L.ID_ITEM_CLEAR,
  actUndo: L.ID_ITEM_UNDO, actRedo: L.ID_ITEM_REDO, actCut: L.ID_ITEM_CUT, actCopy: L.ID_ITEM_COPY,
  actPaste: L.ID_ITEM_PASTE, actSelectAll: L.ID_ITEM_SELECTALL, actInsert: L.ID_TB_INSERT, actToggle: L.ID_TB_TOGGLE,
  actGoto: L.ID_TB_GOTO, actComment: L.ID_ITEM_COMMENTSELECTION, actUncomment: L.ID_ITEM_UNCOMMENTSELECTION,
  actToggleComment: L.ID_ITEM_TOGGLECOMMENT, actToggleCommentInline: L.ID_ITEM_TOGGLECOMMENTINLINE,
  actIndent: L.ID_ITEM_INDENTSELECTION, actUnindent: L.ID_ITEM_UNINDENTSELECTION, actCollapse: L.ID_ITEM_COLLAPSEALL,
  actUnCollapse: L.ID_ITEM_UNCOLLAPSEALL, actDuplicateLine: L.ID_ITEM_DUPLICATELINE, actDeleteLine: L.ID_ITEM_DELETELINE,
  actMoveSelUp: L.ID_ITEM_MOVESELUP, actMoveSelDown: L.ID_ITEM_MOVESELDOWN, actFind: L.ID_ITEM_FIND,
  actFindAll: L.ID_ITEM_FINDINALL, actReplace: L.ID_ITEM_REPLACE, actReplaceAll: L.ID_ITEM_REPLACEFILES,
  actSearchAgain: L.ID_ITEM_FINDNEXT, actRevSearchAgain: L.ID_ITEM_FINDPREV, actIncremental: L.ID_ITEM_INCREMENTAL,
  actGotoFunction: L.ID_ITEM_GOTOFUNCTION, actGotoLine: L.ID_ITEM_GOTO, actProjectManager: L.ID_ITEM_PROJECTVIEW,
  actStatusbar: L.ID_ITEM_STATUSBAR, actSwapHeaderSource: L.ID_ITEM_SWAPHEADERSOURCE, actSwapEditor: L.ID_ITEM_SWAPEDITOR,
  actViewToDoList: L.ID_VIEWTODO_MENUITEM, actProjectNew: L.ID_ITEM_NEWFILE, actProjectAdd: L.ID_ITEM_ADDFILE,
  actProjectRemove: L.ID_ITEM_REMOVEFILE, actProjectOptions: L.ID_ITEM_PROJECTOPTIONS, actProjectMakeFile: L.ID_ITEM_EDITMAKE,
  actCompile: L.ID_ITEM_COMP, actRun: L.ID_ITEM_RUN, actCompRun: L.ID_ITEM_COMPRUN, actRebuild: L.ID_ITEM_REBUILD,
  actExecParams: L.ID_ITEM_EXECPARAMS, actSyntaxCheck: L.ID_ITEM_SYNTAXCHECK, actSyntaxCheckFile: L.ID_ITEM_SYNTAXCHECKFILE,
  actClean: L.ID_ITEM_CLEAN, actProfile: L.ID_ITEM_PROFILE, actDebug: L.ID_ITEM_DEBUG, actGotoBreakPoint: L.ID_ITEM_GOTOBREAKPOINT,
  actBreakPoint: L.ID_ITEM_TOGGLEBREAK, actDeleteProfile: L.ID_ITEM_DELPROFINFORMATION, actAbortCompilation: L.ID_ITEM_ABORTCOMP,
  actCompOptions: L.ID_ITEM_COMPOPTIONS, actEnviroOptions: L.ID_ITEM_ENVIROOPTIONS, actEditorOptions: L.ID_ITEM_EDITOROPTIONS,
  actConfigTools: L.ID_ITEM_TOOLCONFIG, actConfigdevShortcuts: L.ID_ITEM_SHORTCUTSCONFIG, actPackageCheck: L.ID_ITEM_UPDATECHECK,
  actPackageManager: L.ID_ITEM_PACKMAN, actFormatCurrentFile: L.ID_FORMATTER_FORMATCURFILE, actFormatOptions: L.ID_FORMATTER_MENU,
  actNext: L.ID_ITEM_NEXT, actPrev: L.ID_ITEM_PREV, actHelp: L.ID_ITEM_HELPDEVCPP, actAbout: L.ID_ITEM_ABOUT,
  actShowTips: L.ID_ITEM_TIP, actDonate: L.ID_ITEM_DONATE, actAddWatch: L.ID_ITEM_WATCHADD, actEditWatch: L.ID_ITEM_WATCHEDIT,
  actModifyWatch: L.ID_ITEM_MODIFYVALUE, actRemoveWatch: L.ID_ITEM_WATCHREMOVE, actNextLine: L.ID_ITEM_STEPNEXT,
  actStepLine: L.ID_ITEM_STEPINTO, actStepOver: L.ID_ITEM_STEPOVER, actWatchItem: L.ID_ITEM_WATCHITEMS,
  actStopExecute: L.ID_ITEM_STOPEXECUTION, actViewCPU: L.ID_ITEM_CPUWINDOW, actNextIns: L.ID_ITEM_NEXTINS,
  actStepIns: L.ID_ITEM_STEPINS, actSkipFunction: L.ID_ITEM_SKIPFUNCTION, actUnitRemove: L.ID_POP_REMOVE,
  actUnitRename: L.ID_POP_RENAME, actUnitOpen: L.ID_POP_OPEN, actUnitClose: L.ID_POP_CLOSE,
  actProjectNewFolder: L.ID_POP_ADDFOLDER, actProjectRemoveFolder: L.ID_POP_REMOVEFOLDER, actProjectRenameFolder: L.ID_POP_RENAMEFOLDER,
  actGotoDeclEditor: L.ID_POP_GOTODECL, actGotoImplEditor: L.ID_POP_GOTOIMPL, actCloseAllButThis: L.ID_POP_CLOSEALLBUTTHIS,
  actOpenFolder: L.ID_POP_OPENCONTAINING, actAddToDo: L.ID_POP_ADDTODOITEM, actBrowserGotoDeclaration: L.ID_POP_GOTODECL,
  actBrowserGotoDefinition: L.ID_POP_GOTOIMPL, actBrowserNewClass: L.ID_POP_NEWCLASS, actBrowserNewMember: L.ID_POP_NEWMEMBER,
  actBrowserNewVar: L.ID_POP_NEWVAR, actBrowserViewAll: L.ID_POP_VIEWALLFILES, actBrowserViewProject: L.ID_POP_VIEWPROJECT,
  actBrowserViewCurrent: L.ID_POP_VIEWCURRENT, actBrowserAddFolder: L.ID_POP_ADDFOLDER, actBrowserRemoveFolder: L.ID_POP_REMOVEFOLDER,
  actBrowserRenameFolder: L.ID_POP_RENAMEFOLDER, actBrowserShowInherited: L.ID_POP_SHOWINHERITED,
};

function findNode(n: DfmNode, name: string): DfmNode | undefined {
  if (n.name === name) return n;
  for (const c of n.children) {
    const r = findNode(c, name);
    if (r) return r;
  }
  return undefined;
}

export const mainForm = mainDfm as unknown as DfmNode;

const editor = () => ide.getEditor();
const hasEditor = () => ide.pageCount > 0;
const nonEmptyEditor = () => {
  const e = editor();
  return !!e && e.view.state.doc.length > 0;
};
const hasProject = () => !!ide.project;
const findFormShowing = () => forms.findFormShowing();
const compileUpdate = () => !run.compiler.compiling && run.getCompileTarget() !== 'none';
const compileRunUpdate = () => {
  if (ide.project && ide.project.options.type === 'static' && run.getCompileTarget() === 'project') return false;
  return !run.compiler.compiling && run.getCompileTarget() !== 'none';
};
const runUpdate = () => {
  if (ide.project && run.getCompileTarget() === 'project') return ide.project.options.type !== 'static' && !run.compiler.compiling;
  return run.getCompileTarget() !== 'none' && !run.compiler.compiling;
};
const debuggerRunning = () => false;

async function clipboardPaste() {
  const e = editor();
  if (!e) return;
  try {
    const t = await navigator.clipboard.readText();
    e.insertString(t, false);
  } catch {
    document.execCommand('paste');
  }
}

function clipboardCopy(cut: boolean) {
  const e = editor();
  if (!e || !e.selAvail) return;
  void navigator.clipboard?.writeText(e.selText.replace(/\n/g, '\r\n'));
  if (cut) e.insertString('', false);
}

function toolbarPopup(menu: 'insert' | 'toggle' | 'goto', btn: string) {
  const el = document.querySelector(`[data-tb-btn="${btn}"]`) as HTMLElement | null;
  const r = el?.getBoundingClientRect();
  const items = menu === 'insert' ? buildInsertMenu() : buildBookmarkMenu(menu === 'toggle');
  openPopup(items, r?.left ?? 100, r?.bottom ?? 100, { imageList: 'menu' });
}

const handlers: Record<string, Pick<Action, 'execute' | 'enabled' | 'checked'>> = {
  // File
  actNewSource: { execute: () => ed.newSource() },
  actNewProject: { execute: () => forms.newProject() },
  actNewTemplate: { execute: () => forms.newTemplate(), enabled: hasProject },
  actNewClass: { execute: () => forms.newClass(), enabled: hasProject },
  actOpen: { execute: () => ide.openDialog() },
  actHistoryClear: { execute: () => ide.clearHistory() },
  actSave: { execute: () => editor() && ide.saveEditor(editor()!), enabled: () => !!editor() && (editor()!.modified || editor()!.isNew) },
  actSaveAs: { execute: () => editor() && ide.saveEditorAs(editor()!), enabled: () => !!editor() },
  actSaveProjectAs: { execute: () => forms.saveProjectAs(), enabled: hasProject },
  actSaveAll: { execute: () => ide.saveAll(), enabled: () => ide.allEditors.some((e) => e.modified || e.isNew) || !!ide.project?.modified },
  actClose: { execute: () => ide.closeEditor(editor()), enabled: hasEditor },
  actCloseAll: { execute: () => ide.closeAll(), enabled: hasEditor },
  actCloseProject: { execute: () => ide.closeProject(), enabled: hasProject },
  actExportHTML: { execute: () => forms.exportFile('html'), enabled: nonEmptyEditor },
  actExportRTF: { execute: () => forms.exportFile('rtf'), enabled: nonEmptyEditor },
  actExportTex: { execute: () => forms.exportFile('tex'), enabled: nonEmptyEditor },
  actExportProject: { execute: () => forms.exportProjectHTML(), enabled: hasProject },
  actPrint: { execute: () => forms.print(), enabled: nonEmptyEditor },
  actPrintSU: { execute: () => forms.printerSetup() },
  actExit: { execute: () => forms.exitApp() },
  actFileProperties: { execute: () => forms.fileProperties(), enabled: hasEditor },
  actImportMSVC: { execute: () => forms.importMSVC() },
  actCloseAllButThis: { execute: () => ide.closeAllButThis() },
  actOpenFolder: { execute: () => forms.openContainingFolder(), enabled: hasEditor },
  // Edit
  actUndo: { execute: () => editor()?.undo(), enabled: () => !!editor() && ed.canUndo(editor()!) },
  actRedo: { execute: () => editor()?.redo(), enabled: () => !!editor() && ed.canRedo(editor()!) },
  actCut: { execute: () => clipboardCopy(true), enabled: () => !!editor()?.selAvail },
  actCopy: { execute: () => clipboardCopy(false), enabled: () => !!editor()?.selAvail },
  actPaste: { execute: () => clipboardPaste(), enabled: () => !!editor() },
  actSelectAll: { execute: () => editor()?.selectAll(), enabled: nonEmptyEditor },
  actInsert: { execute: () => toolbarPopup('insert', 'InsertBtn'), enabled: hasEditor },
  actToggle: { execute: () => toolbarPopup('toggle', 'ToggleBtn'), enabled: hasEditor },
  actGoto: { execute: () => toolbarPopup('goto', 'GotoBtn'), enabled: hasEditor },
  actComment: { execute: () => editor() && ed.comment(editor()!), enabled: nonEmptyEditor },
  actUncomment: { execute: () => editor() && ed.uncomment(editor()!), enabled: nonEmptyEditor },
  actToggleComment: { execute: () => editor() && ed.toggleComment(editor()!), enabled: nonEmptyEditor },
  actToggleCommentInline: { execute: () => editor() && ed.toggleCommentInline(editor()!), enabled: () => !!editor()?.selAvail },
  actIndent: { execute: () => editor() && ed.indent(editor()!), enabled: () => hasEditor() && !findFormShowing() },
  actUnindent: { execute: () => editor() && ed.unindent(editor()!), enabled: () => hasEditor() && !findFormShowing() },
  actCollapse: { execute: () => editor()?.foldAll(), enabled: nonEmptyEditor },
  actUnCollapse: { execute: () => editor()?.unfoldAll(), enabled: nonEmptyEditor },
  actDuplicateLine: { execute: () => editor() && ed.duplicateLine(editor()!), enabled: nonEmptyEditor },
  actDeleteLine: { execute: () => editor() && ed.deleteLine(editor()!), enabled: nonEmptyEditor },
  actMoveSelUp: { execute: () => editor() && ed.moveSel(editor()!, -1), enabled: nonEmptyEditor },
  actMoveSelDown: { execute: () => editor() && ed.moveSel(editor()!, 1), enabled: nonEmptyEditor },
  actAddToDo: { execute: () => forms.addToDo(), enabled: () => hasProject() || hasEditor() },
  actSwapHeaderSource: { execute: () => ed.swapHeaderSource(), enabled: hasEditor },
  // Search
  actFind: { execute: () => forms.find(0), enabled: () => !!editor() && !findFormShowing() },
  actFindAll: { execute: () => forms.find(1), enabled: () => !!editor() && !findFormShowing() },
  actReplace: { execute: () => forms.find(2), enabled: () => !!editor() && !findFormShowing() },
  actReplaceAll: { execute: () => forms.find(3), enabled: () => !!editor() && !findFormShowing() },
  actSearchAgain: { execute: () => forms.searchAgain(false), enabled: () => !!editor() && !findFormShowing() },
  actRevSearchAgain: { execute: () => forms.searchAgain(true), enabled: () => !!editor() && !findFormShowing() },
  actIncremental: { execute: () => forms.incremental(), enabled: nonEmptyEditor },
  actGotoFunction: { execute: () => forms.gotoFunction(), enabled: nonEmptyEditor },
  actGotoLine: { execute: () => forms.gotoLine(), enabled: nonEmptyEditor },
  // View
  actProjectManager: {
    execute: () => {
      devData.ShowLeftPages = !devData.ShowLeftPages;
      saveSettings();
      ide.changed();
    },
    checked: () => devData.ShowLeftPages,
  },
  actStatusbar: {
    execute: () => {
      devData.Statusbar = !devData.Statusbar;
      saveSettings();
      ide.changed();
    },
    checked: () => devData.Statusbar,
  },
  actViewToDoList: { execute: () => forms.viewToDo(), enabled: () => hasProject() || hasEditor() },
  actSwapEditor: { execute: () => ide.swapEditor(editor()), enabled: () => ide.pageCount > 1 },
  actShowBars: {
    execute: () => {
      if (devData.FullScreen) {
        devData.ShowBars = !devData.ShowBars;
        ide.changed();
      }
    },
  },
  // Project
  actProjectNew: { execute: () => forms.projectNewUnit(), enabled: hasProject },
  actProjectAdd: { execute: () => forms.projectAddFile(), enabled: hasProject },
  actProjectRemove: { execute: () => forms.projectRemoveFile(), enabled: hasProject },
  actProjectOptions: { execute: () => forms.projectOptions(), enabled: hasProject },
  actProjectMakeFile: { execute: () => forms.editMakefile(), enabled: () => hasProject() && compileUpdate() },
  actProjectSource: { enabled: hasProject },
  actProjectNewFolder: { execute: () => forms.projectNewFolder(), enabled: hasProject },
  actProjectRemoveFolder: { execute: () => forms.projectRemoveFolder(), enabled: hasProject },
  actProjectRenameFolder: { execute: () => forms.projectRenameFolder(), enabled: hasProject },
  actUnitRemove: { execute: () => forms.unitRemove(), enabled: hasProject },
  actUnitRename: { execute: () => forms.unitRename(), enabled: hasProject },
  actUnitOpen: { execute: () => forms.unitOpen(), enabled: hasProject },
  actUnitClose: { execute: () => forms.unitClose(), enabled: hasProject },
  actUnitHeader: { enabled: hasProject },
  // Execute
  actCompile: { execute: () => run.actCompile(), enabled: compileUpdate },
  actRun: { execute: () => run.actRun(), enabled: runUpdate },
  actCompRun: { execute: () => run.actCompRun(), enabled: compileRunUpdate },
  actRebuild: { execute: () => run.actRebuild(), enabled: compileUpdate },
  actClean: { execute: () => run.actClean(), enabled: compileUpdate },
  actSyntaxCheck: { execute: () => run.actSyntaxCheck(false), enabled: compileUpdate },
  actSyntaxCheckFile: { execute: () => run.actSyntaxCheck(true), enabled: compileUpdate },
  actExecParams: { execute: () => forms.execParams() },
  actProfile: { execute: () => forms.profile(), enabled: compileRunUpdate },
  actDeleteProfile: { execute: () => forms.deleteProfile(), enabled: runUpdate },
  actAbortCompilation: { execute: () => run.abortCompilation(), enabled: () => run.compiler.compiling },
  actShortenCompPaths: {
    execute: () => {
      devData.ShortenCompPaths = !devData.ShortenCompPaths;
      ide.logLines = ide.logRaw.map((l) => (devData.ShortenCompPaths ? ide.shortenLogOutput(l) : l));
      saveSettings();
      ide.msgs.emit();
      ide.changed();
    },
    checked: () => devData.ShortenCompPaths,
  },
  // Debug
  actDebug: { execute: () => forms.debug(), enabled: compileUpdate },
  actBreakPoint: { execute: () => editor() && editor()!.toggleBreakpoint(editor()!.caretLine), enabled: nonEmptyEditor },
  actAddWatch: { execute: () => forms.addWatch(), enabled: hasEditor },
  actEditWatch: {},
  actModifyWatch: { enabled: () => false },
  actRemoveWatch: { enabled: () => false },
  actStepOver: { enabled: debuggerRunning },
  actNextLine: { enabled: debuggerRunning },
  actStepLine: { enabled: debuggerRunning },
  actNextIns: { enabled: debuggerRunning },
  actStepIns: { enabled: debuggerRunning },
  actSkipFunction: { enabled: debuggerRunning },
  actGotoBreakPoint: { enabled: debuggerRunning },
  actViewCPU: { enabled: debuggerRunning },
  actWatchItem: { enabled: () => hasProject() || hasEditor() },
  actAttachProcess: { enabled: () => false },
  actStopExecute: { execute: () => run.stopExecute(), enabled: () => ide.running },
  // Tools
  actCompOptions: { execute: () => forms.compilerOptions() },
  actEnviroOptions: { execute: () => forms.environmentOptions() },
  actEditorOptions: { execute: () => forms.editorOptions() },
  actConfigTools: { execute: () => forms.configTools() },
  actConfigdevShortcuts: { execute: () => forms.configShortcuts() },
  actPackageManager: { execute: () => forms.packageManager() },
  actFormatCurrentFile: { execute: () => forms.formatCurrentFile(), enabled: nonEmptyEditor },
  actFormatOptions: { execute: () => forms.formatterOptions() },
  // Window
  actFullScreen: { execute: () => forms.toggleFullScreen(), checked: () => devData.FullScreen },
  actNext: { execute: () => ide.selectNextPage(1), enabled: hasEditor },
  actPrev: { execute: () => ide.selectNextPage(-1), enabled: hasEditor },
  // Help
  actHelp: { execute: () => forms.help() },
  actAbout: { execute: () => forms.about() },
  actShowTips: { execute: () => forms.tips() },
  actDonate: { execute: () => window.open('https://sourceforge.net/projects/orwelldevcpp/', '_blank') },
  // Class browser
  actBrowserGotoDeclaration: { execute: () => forms.browserGoto(false), enabled: () => forms.browserHasSelection() },
  actBrowserGotoDefinition: { execute: () => forms.browserGoto(true), enabled: () => forms.browserHasSelection() },
  actBrowserNewClass: { execute: () => forms.newClass(), enabled: hasProject },
  actBrowserNewMember: { execute: () => forms.newMember(), enabled: () => forms.browserSelectionIsClass() },
  actBrowserNewVar: { execute: () => forms.newVar(), enabled: () => forms.browserSelectionIsClass() },
  actBrowserViewAll: { execute: () => forms.setBrowserFilter(0), checked: () => settings.classBrowsing.ShowFilter === 0 },
  actBrowserViewProject: { execute: () => forms.setBrowserFilter(1), checked: () => settings.classBrowsing.ShowFilter === 1 },
  actBrowserViewCurrent: { execute: () => forms.setBrowserFilter(2), checked: () => settings.classBrowsing.ShowFilter === 2 },
  actBrowserViewIncludes: { execute: () => forms.setBrowserFilter(3), checked: () => settings.classBrowsing.ShowFilter === 3 },
  actBrowserShowInherited: {
    execute: () => {
      settings.classBrowsing.ShowInheritedMembers = !settings.classBrowsing.ShowInheritedMembers;
      saveSettings();
      ide.changed();
    },
    checked: () => settings.classBrowsing.ShowInheritedMembers,
  },
  actGotoDeclEditor: { execute: () => forms.gotoDeclEditor(false) },
  actGotoImplEditor: { execute: () => forms.gotoDeclEditor(true) },
  actCodeCompletion: { execute: () => forms.showCompletion(), enabled: () => !!editor() && editor()!.view.hasFocus },
  // Messages
  actMsgCut: { execute: () => forms.msgCopy(true) },
  actMsgCopy: { execute: () => forms.msgCopy(false) },
  actMsgCopyAll: { execute: () => forms.msgCopyAll() },
  actMsgPaste: { execute: () => forms.msgPaste() },
  actMsgSelAll: { execute: () => forms.msgSelectAll() },
  actMsgSaveAll: { execute: () => forms.msgSaveAll() },
  actMsgClear: { execute: () => forms.msgClear() },
  actRunTests: {},
};

export const actions = new Map<string, Action>();

(() => {
  const list = findNode(mainForm, 'ActionList')!;
  for (const a of list.children) {
    const p = a.props;
    const sc = p.ShortCut ? Number(p.ShortCut) : 0;
    const h = handlers[a.name] ?? {};
    actions.set(a.name, {
      name: a.name,
      captionId: CAPTION_IDS[a.name],
      defaultCaption: p.Caption ?? a.name,
      shortcut: sc,
      defaultShortcut: sc,
      imageIndex: p.ImageIndex !== undefined ? Number(p.ImageIndex) : -1,
      category: p.Category ?? '',
      ...h,
    });
  }
  // the action list has "&Package Manager" without its own translation id
  // apply user defined shortcuts (devShortcuts)
  for (const [name, text] of Object.entries(settings.shortcuts)) {
    const a = actions.get(name);
    if (a) a.shortcut = textToShortCut(text);
  }
})();

export function actionCaption(a: Action): string {
  if (a.name === 'actFullScreen') return lang(devData.FullScreen ? L.ID_ITEM_FULLSCRBACK : L.ID_ITEM_FULLSCRMODE);
  if (a.captionId) return lang(a.captionId);
  return a.defaultCaption;
}

export function actionHint(a: Action) {
  return actionCaption(a).replace(/\(&.\)/, '').replace(/&/g, '').replace(/\.\.\.$/, '');
}

export function isEnabled(a: Action) {
  if (!a.execute) return false;
  try {
    return a.enabled ? a.enabled() : true;
  } catch {
    return false;
  }
}

export async function execute(name: string) {
  const a = actions.get(name);
  if (!a || !a.execute) return;
  if (!isEnabled(a)) return;
  try {
    await a.execute();
  } catch (e) {
    console.error(e);
    await MessageDlg(String((e as Error)?.message ?? e), 'mtError', ['mbOK']);
  }
}

export function shortcutText(a: Action) {
  return shortCutToText(a.shortcut);
}

export { devEditor };
