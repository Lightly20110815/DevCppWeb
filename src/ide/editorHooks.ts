// Glue between editors and the rest of the IDE (popup menu, parser, completion, hints).
import { ide } from './ide';
import { openPopup } from '../os/menu';
import { popupMenu } from './menus';
import { parser } from './parser/service';
import { settings, devEditor } from './config';
import { vfs, changeExt } from '../os/vfs';

let installed = false;

export function installEditorHooks() {
  if (installed) return;
  installed = true;
  configureAutosave();
  ide.onEditorContextMenu = (_e, ev) => {
    openPopup(popupMenu('EditorPopup'), ev.clientX, ev.clientY, { imageList: 'menu' });
  };
  ide.onFileParsed = (e) => {
    if (!ide.project) parser.parse(e.fileName, e.inProject);
  };
  ide.onFileSaved = (e) => {
    parser.parse(e.fileName, e.inProject);
  };
  ide.onActiveEditorChanged = (e) => {
    parser.currentFile = e ? e.fileName : '';
    if (e && !parser.entry(e.fileName)) parser.parse(e.fileName, e.inProject, false, e.text);
    ide.changed();
  };
  ide.onEditorOpened = () => {};
  ide.onEditorKeyChar = (e, ch) => {
    if (!settings.codeCompletion.Enabled) return;
    void import('./editor/completion').then((m) => m.onKeyChar(e, ch));
  };
  ide.onEditorCtrlClick = (e, pos) => {
    void import('./parser/browserOps').then((m) => m.gotoDeclarationAt(e, pos));
  };
  ide.onEditorHover = (e, pos, ev) => {
    if (!settings.editor.ParserHints) return;
    void import('./editor/hints').then((m) => m.showHint(e, pos, ev));
  };
  ide.onCaretMoved = (e) => {
    void import('./editor/completion').then((m) => m.onCaretMoved(e));
  };
}

let autosave: ReturnType<typeof setInterval> | undefined;
export function configureAutosave() {
  if (autosave) clearInterval(autosave);
  autosave = undefined;
  if (!devEditor.EnableAutoSave) return;
  autosave = setInterval(async () => {
    if (ide.compiling) return;
    const editors = devEditor.AutoSaveFilter === 0 ? [ide.getEditor()].filter((e) => !!e) : ide.allEditors.filter((e) => devEditor.AutoSaveFilter !== 2 || e.inProject);
    for (const editor of editors) {
      if (!editor || editor.isNew || !editor.modified || editor.readOnly) continue;
      if (devEditor.AutoSaveMode === 0) await ide.saveEditor(editor);
      else {
        const now = new Date();
        const stamp = devEditor.AutoSaveMode === 1 ? Math.floor(now.getTime() / 1000) : now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '');
        const path = changeExt(editor.fileName, '') + '.' + stamp + editor.fileName.slice(changeExt(editor.fileName, '').length);
        vfs.write(path, editor.text);
      }
    }
  }, Math.max(1, devEditor.Interval) * 60_000);
}
