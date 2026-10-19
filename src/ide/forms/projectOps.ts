// Project menu / project tree commands (main.pas: OpenProject, actCloseProject, actProjectAdd, ...).
import { ide } from '../ide';
import { Project } from '../project/Project';
import { lang, format } from '../../lang/lang';
import * as L from '../../generated/langIds';
import { devData, saveSettings } from '../config';
import { MessageDlg, InputQuery } from '../../os/messagebox';
import { mrYes, mrNo, mrCancel } from '../../vcl/FormCtl';
import { showFileDialog } from '../../os/FileDialog';
import { buildFilter, FLT_CS, FLT_CPPS, FLT_HEADS, FLT_RES, FLT_PROJECTS } from '../version';
import { vfs, basename, dirname, joinPath, normalize } from '../../os/vfs';
import { parser } from '../parser/service';
import { stopExecute, compiler } from '../run';

export async function openProject(fileName: string) {
  if (ide.project) {
    const s = ide.project.name || ide.project.fileName;
    if ((await MessageDlg(format(lang(L.ID_MSG_CLOSEPROJECTPROMPT), [s]), 'mtConfirmation', ['mbYes', 'mbNo'])) !== mrYes) return;
    await closeProject();
    if (ide.project) return;
  }
  const p = new Project(vfs.realPath(fileName), null);
  ide.project = p;
  ide.removeFromHistory(fileName);
  if (!devData.ShowLeftPages) {
    devData.ShowLeftPages = true;
    saveSettings();
  }
  p.openEditors();
  ide.updateAppTitle();
  parser.scanProject();
  ide.changed();
}

export async function closeProject() {
  const p = ide.project;
  if (!p) return;
  stopExecute();
  if (p.modified) {
    const s = p.name || p.fileName;
    const r = await MessageDlg(format(lang(L.ID_MSG_SAVEPROJECT), [s]), 'mtConfirmation', ['mbYes', 'mbNo', 'mbCancel']);
    if (r === mrYes) { if (!(await p.saveAll())) return; }
    else if (r === mrNo) {
      p.modified = false;
      p.saveLayout();
    } else {
      p.saveLayout();
      return;
    }
  } else p.saveLayout();
  ide.addToHistory(p.fileName);
  // close project editors without asking again
  for (const u of p.units) {
    if (u.editor) {
      const e = u.editor;
      u.editor = null;
      ide.forceCloseEditor(e);
    }
  }
  ide.project = null;
  ide.clearMessageControl();
  parser.reset();
  ide.updateAppTitle();
  ide.editorPageChanged();
  ide.changed();
}

ide.openProject = openProject;
ide.closeProject = closeProject;

export async function saveProjectAs() {
  const p = ide.project;
  if (!p) return;
  const r = await showFileDialog({ mode: 'save', filter: FLT_PROJECTS, defaultExt: 'dev', fileName: basename(p.fileName), initialDir: p.directory, overwritePrompt: true });
  if (!r) return;
  p.fileName = r.files[0];
  p.modified = true;
  await p.saveAll();
  ide.updateAppTitle();
  ide.changed();
}

function selectedFolder(): string {
  const s = ide.projectSelection;
  if (s?.folder !== undefined) return s.folder;
  if (s?.unit !== undefined && ide.project) return ide.project.units[s.unit]?.folder ?? '';
  return '';
}

/** actProjectNewExecute */
export async function projectNewUnit() {
  const p = ide.project;
  if (!p) return;
  const idx = p.newUnit(selectedFolder());
  const u = p.units[idx];
  const e = ide.newEditor(u.fileName, true, true);
  u.editor = e;
  ide.activate(e);
  ide.changed();
}

/** actProjectAddExecute */
export async function projectAddFile() {
  const p = ide.project;
  if (!p) return;
  const r = await showFileDialog({ mode: 'open', title: lang(L.ID_NV_OPENADD), filter: buildFilter([FLT_CS, FLT_CPPS, FLT_HEADS, FLT_RES]), initialDir: p.directory, multiSelect: true });
  if (!r) return;
  for (const f of r.files) {
    await p.addUnit(f, selectedFolder());
    parser.parse(f, true, false);
  }
  ide.changed();
}

/** actProjectRemoveExecute: RemoveUnitFrm */
export async function projectRemoveFile() {
  const p = ide.project;
  if (!p) return;
  (await import('./RemoveUnitForm')).showRemoveUnit();
}

export async function editMakefile() {
  const p = ide.project;
  if (!p) return;
  ide.clearCompileMessages();
  compiler.target = 'project';
  compiler.project = p;
  compiler.getCompileParams();
  compiler.getLibrariesParams();
  compiler.getIncludesParams();
  compiler.buildMakeFile();
  await ide.openFile(p.makeFileName);
}

export async function newFolder() {
  const p = ide.project;
  if (!p) return;
  const s = await InputQuery(lang(L.ID_POP_ADDFOLDER).replace(/&/g, ''), lang(L.ID_MSG_ADDBROWSERFOLDER), '');
  if (!s) return;
  const parent = selectedFolder();
  p.addFolder(parent ? `${parent}/${s}` : s);
  ide.changed();
}

export async function removeFolder() {
  const p = ide.project;
  const f = ide.projectSelection?.folder;
  if (!p || f === undefined) return;
  if ((await MessageDlg(lang(L.ID_MSG_REMOVEBROWSERFOLDER), 'mtConfirmation', ['mbYes', 'mbNo'])) !== mrYes) return;
  // remove units in the folder from the project
  for (let i = p.units.length - 1; i >= 0; i--) {
    const u = p.units[i];
    if (u.folder === f || u.folder.startsWith(f + '/')) if (!(await p.removeEditor(i, true))) return;
  }
  p.removeFolder(f);
  ide.changed();
}

export async function renameFolder() {
  const p = ide.project;
  const f = ide.projectSelection?.folder;
  if (!p || f === undefined) return;
  const s = await InputQuery(lang(L.ID_POP_RENAMEFOLDER).replace(/&/g, ''), lang(L.ID_MSG_RENAMEBROWSERFOLDER), f.split('/').pop()!);
  if (!s) return;
  p.renameFolder(f, s);
  ide.projectSelection = { folder: (f.includes('/') ? f.slice(0, f.lastIndexOf('/') + 1) : '') + s };
  ide.changed();
}

function selectedUnit() {
  const p = ide.project;
  const i = ide.projectSelection?.unit;
  if (!p || i === undefined) return null;
  return { p, i, u: p.units[i] };
}

export async function unitRemove() {
  const s = selectedUnit();
  if (!s) return;
  await s.p.removeEditor(s.i, true);
  ide.projectSelection = null;
  ide.changed();
}

export async function unitRename() {
  const s = selectedUnit();
  if (!s) return;
  const old = s.u.fileName;
  const name = await InputQuery(lang(L.ID_RENAME), lang(L.ID_MSG_FILERENAME), basename(old));
  if (!name || name === basename(old)) return;
  const target = joinPath(dirname(old), name);
  if (vfs.exists(target) && normalize(target).toLowerCase() !== normalize(old).toLowerCase()) {
    await MessageDlg(lang(L.ID_MSG_FILEEXISTS), 'mtWarning', ['mbOK']);
    return;
  }
  if (vfs.fileExists(old)) vfs.rename(old, target);
  s.p.saveUnitAs(s.i, target);
  if (s.u.editor) s.u.editor.setFileName(target);
  ide.tabs.emit();
  ide.changed();
}

export async function unitOpen() {
  const s = selectedUnit();
  if (!s) return;
  const e = ide.fileIsOpen(s.u.fileName, true) ?? s.p.openUnit(s.i);
  if (e) ide.activate(e);
}

export async function unitClose() {
  const s = selectedUnit();
  if (!s?.u.editor) return;
  await ide.closeEditor(s.u.editor);
}

export { mrCancel };
