// The Dev-C++ main form logic (main.pas / EditorList.pas) without UI rendering.
import { useSyncExternalStore } from 'react';
import { Editor } from './editor/Editor';
import type { EditorHost } from './editor/Editor';
import { settings, devData, devEditor, saveSettings, currentCompilerSet } from './config';
import { Lang, lang, format } from '../lang/lang';
import * as L from '../generated/langIds';
import { vfs, basename, dirname, extname, normalize, joinPath, DOCUMENTS_DIR } from '../os/vfs';
import { MessageDlg, MessageBox, MB_ICONERROR, MB_OK } from '../os/messagebox';
import { mrYes, mrNo, mrCancel } from '../vcl/FormCtl';
import { showFileDialog } from '../os/FileDialog';
import { DEVCPP, DEVCPP_VERSION, buildFilter, FLT_CS, FLT_CPPS, FLT_HEADS, FLT_RES, FLT_PROJECTS, getFileTyp } from './version';
import { wm } from '../os/wm';
import { setIconTheme } from '../os/images';

export interface MsgItem {
  line: string;
  col: string;
  unit: string;
  msg: string;
}

export interface FindItem extends MsgItem {
  keyword: string;
  /** zero-based start of the keyword inside msg for highlighting */
}

export type MessagePage = 'comp' | 'res' | 'log' | 'debug' | 'find' | null;
export type LeftPage = 0 | 1 | 2;

type Listener = () => void;

class Emitter {
  version = 0;
  private ls = new Set<Listener>();
  subscribe = (l: Listener) => {
    this.ls.add(l);
    return () => {
      this.ls.delete(l);
    };
  };
  get = () => this.version;
  emit() {
    this.version++;
    for (const l of this.ls) l();
  }
}

export class Ide {
  ui = new Emitter(); // menus, toolbars, layout
  status = new Emitter(); // status bar only
  msgs = new Emitter(); // message control contents
  tabs = new Emitter(); // editor tabs

  windowId = 0;
  editors: Editor[] = [];
  left: Editor[] = [];
  right: Editor[] = [];
  activeLeft: Editor | null = null;
  activeRight: Editor | null = null;
  focusedPane: 'left' | 'right' = 'left';
  history = new Map<Editor, Editor[]>(); // previous editors (for close focus)

  // message control
  compilerOutput: MsgItem[] = [];
  resourceOutput: MsgItem[] = [];
  findOutput: FindItem[] = [];
  logLines: string[] = [];
  logRaw: string[] = [];
  debugOutput: string[] = [];
  compSel = -1;
  resSel = -1;
  findSel = -1;
  messagePage: MessagePage = null; // null = closed
  lastMessagePage: Exclude<MessagePage, null> = 'debug';
  messageHeight = devData.OutputHeight;
  progress = { pos: 0, max: 1 };

  leftPage: LeftPage = (devData.LeftActivePage as LeftPage) ?? 0;
  leftWidth = devData.ProjectWidth;

  statusText: [string, string, string] = ['', '', ''];
  untitledCount = 0;
  projectCount = 0;
  altMode = false;

  // class browser / project tree selection
  browserSelected: import('./parser/CppParser').Statement | null = null;
  projectSelection: { unit?: number; folder?: string; project?: boolean } | null = null;

  // Executor (running program) state
  running = false;
  compiling = false;

  constructor() {
    Lang.subscribe(() => {
      this.ui.emit();
      this.tabs.emit();
      this.msgs.emit();
      this.updateStatus();
    });
  }

  changed() {
    this.ui.emit();
  }

  // ---------------------------------------------------------------- editor list

  get pageCount() {
    return this.left.length + this.right.length;
  }

  get allEditors() {
    return [...this.left, ...this.right];
  }

  get layout(): 'none' | 'left' | 'right' | 'both' {
    if (this.left.length && this.right.length) return 'both';
    if (this.left.length) return 'left';
    if (this.right.length) return 'right';
    return 'none';
  }

  /** TEditorList.GetEditor with no params: active editor of the focused page control */
  getEditor(): Editor | null {
    switch (this.layout) {
      case 'left':
        return this.activeLeft;
      case 'right':
        return this.activeRight;
      case 'both':
        return this.focusedPane === 'right' ? this.activeRight : this.activeLeft;
      default:
        return null;
    }
  }

  private host: EditorHost = {
    onStatusChange: (e, what) => {
      if (what.modified) {
        this.tabs.emit();
        this.changed();
        this.updateAppTitle();
      }
      if (what.selection || what.insertMode) {
        if (e === this.getEditor()) this.updateStatus();
        if (what.selection) this.onCaretMoved?.(e);
      }
    },
    onKeyChar: (e, ch) => this.onEditorKeyChar?.(e, ch),
    onContextMenu: (e, ev) => this.onEditorContextMenu?.(e, ev),
    onGutterClick: (e, line) => {
      e.toggleBreakpoint(line);
    },
    onCtrlClick: (e, pos) => this.onEditorCtrlClick?.(e, pos),
    onMouseHover: (e, pos, ev) => this.onEditorHover?.(e, pos, ev),
    onFocus: (e) => {
      const pane = this.right.includes(e) ? 'right' : 'left';
      if (pane !== this.focusedPane) {
        this.focusedPane = pane;
        this.changed();
        this.updateStatus();
        this.updateAppTitle();
      }
    },
    onDropFiles: (_e, files) => this.dropFiles(files),
  };

  // hooks set by other modules
  onCaretMoved?: (e: Editor) => void;
  onEditorKeyChar?: (e: Editor, ch: string) => void;
  onEditorContextMenu?: (e: Editor, ev: MouseEvent) => void;
  onEditorCtrlClick?: (e: Editor, pos: number) => void;
  onEditorHover?: (e: Editor, pos: number, ev: MouseEvent) => void;
  onEditorOpened?: (e: Editor) => void;
  onEditorClosed?: (e: Editor) => void;
  onActiveEditorChanged?: (e: Editor | null) => void;

  newEditor(fileName: string, inProject: boolean, newFile: boolean, pane?: 'left' | 'right'): Editor {
    let text = '';
    let name = fileName;
    if (!name) name = lang(L.ID_UNTITLED) + ++this.untitledCount;
    else if (!newFile && vfs.fileExists(fileName)) {
      text = vfs.readText(fileName).replace(/\r\n?/g, '\n');
      name = vfs.realPath(fileName);
      if (devData.Backups) {
        const s = '.' + Math.floor(Date.now() / 1000) + extname(name);
        vfs.write(name.slice(0, name.length - extname(name).length) + s, text);
      }
    }
    const e = new Editor({ fileName: name, text, inProject, isNew: newFile || !vfs.fileExists(name), host: this.host, untitledPrefix: lang(L.ID_UNTITLED) });
    const target = pane ?? this.newEditorPane();
    e.pane = target;
    const list = target === 'left' ? this.left : this.right;
    const prevActive = target === 'left' ? this.activeLeft : this.activeRight;
    this.history.set(e, prevActive ? [...(this.history.get(prevActive) ?? []), prevActive] : []);
    list.push(e);
    this.editors.push(e);
    if (target === 'left') this.activeLeft = this.activeLeft ?? e;
    else this.activeRight = this.activeRight ?? e;
    this.tabs.emit();
    this.changed();
    this.onEditorOpened?.(e);
    return e;
  }

  private newEditorPane(): 'left' | 'right' {
    switch (this.layout) {
      case 'right':
        return 'right';
      case 'both':
        return this.focusedPane;
      default:
        return 'left';
    }
  }

  /** TEditor.Activate */
  activate(e: Editor, focus = true) {
    if (this.right.includes(e)) {
      this.activeRight = e;
      this.focusedPane = 'right';
    } else {
      this.activeLeft = e;
      this.focusedPane = 'left';
    }
    this.tabs.emit();
    this.changed();
    this.updateAppTitle();
    this.updateStatus();
    this.onActiveEditorChanged?.(e);
    if (focus) requestAnimationFrame(() => e.focus());
  }

  fileIsOpen(fileName: string, projectOnly = false): Editor | null {
    const key = normalize(fileName).toLowerCase();
    for (const e of this.allEditors) {
      if (normalize(e.fileName).toLowerCase() === key && (!projectOnly || e.inProject)) return e;
    }
    return null;
  }

  private previousEditor(e: Editor): Editor | null {
    const list = this.right.includes(e) ? this.right : this.left;
    const active = list === this.right ? this.activeRight : this.activeLeft;
    if (active === e) {
      const hist = this.history.get(e) ?? [];
      for (let i = hist.length - 1; i >= 0; i--) if (this.editors.includes(hist[i]) && hist[i] !== e) return hist[i];
      const idx = list.indexOf(e);
      const next = list[idx - 1] ?? list[idx + 1];
      if (next) return next;
      if (this.layout === 'both') return list === this.left ? this.activeRight : this.activeLeft;
      return null;
    }
    return active;
  }

  /** destroys an editor without asking anything */
  forceCloseEditor(e: Editor) {
    const prev = this.previousEditor(e);
    this.left = this.left.filter((x) => x !== e);
    this.right = this.right.filter((x) => x !== e);
    this.editors = this.editors.filter((x) => x !== e);
    if (this.activeLeft === e) this.activeLeft = this.left.includes(prev!) ? prev : this.left[0] ?? null;
    if (this.activeRight === e) this.activeRight = this.right.includes(prev!) ? prev : this.right[0] ?? null;
    if (this.layout === 'left') this.focusedPane = 'left';
    if (this.layout === 'right') this.focusedPane = 'right';
    e.destroy();
    this.onEditorClosed?.(e);
    this.tabs.emit();
    this.changed();
    if (prev && this.editors.includes(prev)) this.activate(prev);
    else this.editorPageChanged();
  }

  async closeEditor(e: Editor | null): Promise<boolean> {
    if (!e) return false;
    if (e.modified && e.text.length > 0) {
      this.activate(e);
      const r = await MessageDlg(format(lang(L.ID_MSG_ASKSAVECLOSE), [e.fileName]), 'mtConfirmation', ['mbYes', 'mbNo', 'mbCancel']);
      if (r === mrYes) {
        if (!(await this.saveEditor(e))) return false;
      } else if (r === mrCancel) return false;
    }
    if (e.inProject && this.project) {
      const idx = this.project.unitIndexOfEditor(e);
      if (idx !== -1) {
        this.project.closeUnit(idx);
        return true;
      }
    }
    this.addToHistory(e.fileName);
    this.forceCloseEditor(e);
    return true;
  }

  async closeAll(): Promise<boolean> {
    while (this.left.length) if (!(await this.closeEditor(this.left[0]))) return false;
    while (this.right.length) if (!(await this.closeEditor(this.right[0]))) return false;
    return true;
  }

  async closeAllButThis(): Promise<boolean> {
    for (const list of [this.left, this.right]) {
      const active = list === this.left ? this.activeLeft : this.activeRight;
      for (const e of [...list].reverse()) if (e !== active && !(await this.closeEditor(e))) return false;
    }
    return true;
  }

  /** EditorPageControlChange when no editor is left */
  editorPageChanged() {
    const e = this.getEditor();
    if (e) {
      requestAnimationFrame(() => e.focus());
    } else {
      this.updateAppTitle();
      this.updateStatus();
    }
    this.onActiveEditorChanged?.(e);
  }

  swapEditor(e: Editor | null) {
    if (!e) return;
    const fromLeft = this.left.includes(e);
    if (fromLeft) {
      this.left = this.left.filter((x) => x !== e);
      this.right.push(e);
      if (this.activeLeft === e) this.activeLeft = this.left[this.left.length - 1] ?? null;
      this.activeRight = e;
      e.pane = 'right';
      this.focusedPane = 'right';
    } else {
      this.right = this.right.filter((x) => x !== e);
      this.left.push(e);
      if (this.activeRight === e) this.activeRight = this.right[this.right.length - 1] ?? null;
      this.activeLeft = e;
      e.pane = 'left';
      this.focusedPane = 'left';
    }
    this.tabs.emit();
    this.changed();
    this.activate(e);
  }

  selectNextPage(dir: 1 | -1) {
    const list = this.focusedPane === 'right' && this.right.length ? this.right : this.left;
    const active = list === this.right ? this.activeRight : this.activeLeft;
    if (!list.length || !active) return;
    const i = (list.indexOf(active) + dir + list.length) % list.length;
    this.activate(list[i]);
  }

  /** TEditorList.GetEditorFromFileName */
  getEditorFromFileName(fileName: string): Editor | null {
    const e = this.fileIsOpen(fileName);
    if (e) return e;
    if (this.project) {
      const i = this.project.unitFromString(fileName);
      if (i !== -1) return this.project.openUnit(i);
    }
    if (vfs.fileExists(fileName)) return this.newEditor(fileName, false, false);
    return null;
  }

  // ---------------------------------------------------------------- files

  async openFile(fileName: string) {
    const open = this.fileIsOpen(fileName);
    if (open) {
      this.activate(open);
      return;
    }
    if (!vfs.fileExists(fileName)) {
      await MessageBox(format(lang(L.ID_ERR_FILENOTFOUND), [fileName]), lang(L.ID_ERROR), MB_ICONERROR);
      return;
    }
    const unitIndex = this.project?.unitIndexOfFile(fileName) ?? -1;
    const e = unitIndex >= 0 ? this.project!.openUnit(unitIndex)! : this.newEditor(fileName, false, false);
    if (this.project) {
      if (normalize(this.project.fileName).toLowerCase() !== normalize(fileName).toLowerCase() && this.project.unitFromString(fileName) === -1)
        this.removeFromHistory(fileName);
    } else this.removeFromHistory(fileName);
    this.activate(e);
    this.onFileParsed?.(e);
  }

  onFileParsed?: (e: Editor) => void;

  async openFileList(files: string[]) {
    if (!files.length) return;
    const prj = files.find((f) => getFileTyp(f) === 'prj');
    if (prj) {
      await this.openProject(prj);
      return;
    }
    for (const f of files) await this.openFile(f);
  }

  async saveEditor(e: Editor): Promise<boolean> {
    if (!e.isNew && e.modified) {
      try {
        vfs.write(e.fileName, this.prepareText(e));
        e.markSaved();
      } catch {
        await MessageDlg(format(lang(L.ID_ERR_SAVEFILE), [e.fileName]), 'mtError', ['mbOK']);
        return false;
      }
      this.onFileSaved?.(e);
      return true;
    } else if (e.isNew) return this.saveEditorAs(e);
    return true;
  }

  onFileSaved?: (e: Editor) => void;

  private prepareText(e: Editor) {
    let t = e.text;
    if (devEditor.TrimTrailingSpaces) t = t.replace(/[ \t]+$/gm, '');
    return t.replace(/\n/g, '\r\n');
  }

  async saveEditorAs(e: Editor): Promise<boolean> {
    const typ = getFileTyp(e.fileName);
    let filterIndex = 3;
    let defaultExt = 'cpp';
    if (typ === 'cHead' || typ === 'cppHead') {
      filterIndex = 4;
      defaultExt = 'h';
    } else if (this.project && e.inProject && !this.project.options.useGPP) {
      filterIndex = 2;
      defaultExt = 'c';
    }
    const initialDir = e.isNew ? (this.project ? this.project.directory : undefined) : dirname(e.fileName);
    const r = await showFileDialog({
      mode: 'save',
      title: lang(L.ID_NV_SAVEAS),
      filter: buildFilter([FLT_CS, FLT_CPPS, FLT_HEADS, FLT_RES]),
      filterIndex,
      defaultExt,
      fileName: e.fileName,
      initialDir,
      overwritePrompt: true,
    });
    if (!r) return false;
    const newName = r.files[0];
    const oldName = e.fileName;
    try {
      vfs.write(newName, this.prepareText(e));
      e.isNew = false;
      e.markSaved();
    } catch {
      await MessageDlg(lang(L.ID_ERR_SAVEFILE) + '"' + newName + '"', 'mtError', ['mbOK']);
      return false;
    }
    if (this.project && e.inProject) {
      const idx = this.project.unitIndexOfFile(oldName);
      if (idx !== -1) this.project.saveUnitAs(idx, newName);
    }
    e.setFileName(newName);
    this.tabs.emit();
    this.updateAppTitle();
    this.onFileSaved?.(e);
    return true;
  }

  async saveAll() {
    if (this.project) {
      await this.project.saveAll();
      this.updateAppTitle();
    }
    for (const e of this.allEditors) {
      if (e.modified && !e.inProject) if (!(await this.saveEditor(e))) break;
    }
  }

  dropFiles(files: FileList) {
    void (async () => {
      const names: string[] = [];
      for (const f of Array.from(files)) {
        const target = joinPath(DOCUMENTS_DIR, f.name);
        const buf = new Uint8Array(await f.arrayBuffer());
        vfs.write(target, buf);
        names.push(target);
      }
      await this.openFileList(names);
    })();
  }

  // ---------------------------------------------------------------- MRU (DataFrm)

  get mru() {
    return devData.History;
  }

  addToHistory(s: string) {
    if (!s || !vfs.fileExists(s)) return;
    const h = devData.History;
    if (h.some((x) => x.toLowerCase() === s.toLowerCase())) return;
    if (getFileTyp(s) === 'prj') h.unshift(s);
    else {
      let i = 0;
      while (i < h.length && getFileTyp(h[i]) === 'prj') i++;
      h.splice(i, 0, s);
    }
    this.rebuildMRU();
  }

  removeFromHistory(s: string) {
    const h = devData.History;
    const i = h.findIndex((x) => x.toLowerCase() === s.toLowerCase());
    if (i >= 0) {
      h.splice(i, 1);
      this.rebuildMRU();
    }
  }

  clearHistory() {
    devData.History = [];
    this.rebuildMRU();
  }

  rebuildMRU() {
    devData.History = devData.History.filter((f) => vfs.fileExists(f)).slice(0, devData.MRUMax);
    saveSettings();
    this.changed();
  }

  // ---------------------------------------------------------------- title & status

  appTitle = `${DEVCPP} ${DEVCPP_VERSION}`;

  updateAppTitle() {
    let caption: string;
    const state = this.running ? ' - [Executing]' : this.compiling ? ' - [Compiling]' : '';
    if (this.project) {
      caption = `${this.project.name} - [${basename(this.project.fileName)}]${state} - ${DEVCPP} ${DEVCPP_VERSION}`;
    } else {
      const e = this.getEditor();
      caption = e ? `${e.fileName}${state} - ${DEVCPP} ${DEVCPP_VERSION}` : `${DEVCPP} ${DEVCPP_VERSION}`;
    }
    if (caption !== this.appTitle) {
      this.appTitle = caption;
      if (this.windowId) wm.update(this.windowId, { title: caption });
      document.title = caption;
    }
  }

  updateStatus() {
    const e = this.getEditor();
    if (e) {
      this.statusText[0] = format(lang(L.ID_STATUSBARPLUS), [e.caretLine, e.caretCol, e.selLength, e.lineCount, e.textLength]);
      this.statusText[1] = e.readOnly ? lang(L.ID_READONLY) : e.insertMode ? lang(L.ID_INSERT) : lang(L.ID_OVERWRITE);
    } else {
      this.statusText = ['', '', ''];
    }
    this.status.emit();
  }

  setStatusbarMessage(msg: string) {
    this.statusText[2] = msg;
    this.status.emit();
  }

  // ---------------------------------------------------------------- message control

  openCloseMessageSheet(open: boolean) {
    if (open) {
      if (!this.messagePage) this.messagePage = this.lastMessagePage;
    } else {
      if (this.messagePage) this.lastMessagePage = this.messagePage;
      this.messagePage = null;
    }
    this.msgs.emit();
    this.changed();
  }

  setMessagePage(p: Exclude<MessagePage, null> | 'close') {
    if (p === 'close') {
      this.openCloseMessageSheet(false);
      return;
    }
    this.messagePage = p;
    this.lastMessagePage = p;
    this.msgs.emit();
    this.changed();
  }

  clearCompileMessages() {
    this.compilerOutput = [];
    this.resourceOutput = [];
    this.logLines = [];
    this.logRaw = [];
    this.compSel = -1;
    this.resSel = -1;
    this.msgs.emit();
  }

  clearMessageControl() {
    this.clearCompileMessages();
    this.findOutput = [];
    this.debugOutput = [];
    this.msgs.emit();
  }

  /** LogEntryProc */
  logEntry(msg: string) {
    const back = msg.replace(/\//g, '\\');
    this.logRaw.push(back);
    this.logLines.push(devData.ShortenCompPaths ? this.shortenLogOutput(back) : msg);
    this.msgs.emit();
  }

  shortenLogOutput(s: string) {
    const set = currentCompilerSet();
    let r = s;
    if (set.folder) r = r.split(set.folder).join('%path%');
    return r;
  }

  // ---------------------------------------------------------------- project placeholder (set by project module)
  project: import('./project/Project').Project | null = null;
  openProject: (fileName: string) => Promise<void> = async () => {};

  // ---------------------------------------------------------------- misc

  setIconTheme(t: string) {
    devData.Theme = t;
    setIconTheme(t);
    this.changed();
  }

  async openDialog() {
    const r = await showFileDialog({
      mode: 'open',
      title: lang(L.ID_NV_OPENFILE),
      filter: buildFilter([FLT_PROJECTS, FLT_CS, FLT_CPPS, FLT_RES, FLT_HEADS]),
      multiSelect: true,
    });
    if (r) await this.openFileList(r.files);
  }

  /** ask to save and close everything, used by "exit" */
  async canClose(): Promise<boolean> {
    if (this.project) {
      await this.closeProject();
      if (this.project) return false;
    }
    if (!(await this.closeAll())) return false;
    devData.LeftActivePage = this.leftPage;
    devData.ProjectWidth = this.leftWidth;
    devData.OutputHeight = this.messageHeight;
    saveSettings();
    return true;
  }

  closeProject: () => Promise<void> = async () => {};
}

export const ide = new Ide();

export function useIde(which: keyof Pick<Ide, 'ui' | 'status' | 'msgs' | 'tabs'> = 'ui') {
  const em = ide[which];
  useSyncExternalStore(em.subscribe, em.get);
  return ide;
}

export async function errorBox(msg: string) {
  await MessageBox(msg, lang(L.ID_ERROR), MB_OK | MB_ICONERROR);
}

export { mrYes, mrNo, mrCancel };
