import dfm from '../../generated/forms/ToolFrm.json';
import editDef from '../../generated/forms/ToolEditFrm.json';
import { showForm } from '../../vcl/VclForm';
import type { DfmNode } from '../../vcl/FormCtl';
import { settings, saveSettings } from '../config';
import type { ToolItem } from '../config';
import { localize } from './formUtils';
import { showFileDialog, browseForFolder } from '../../os/FileDialog';
import { parseMacros } from '../macros';
import { ide } from '../ide';

async function editTool(tool: ToolItem) {
  const fields = { edTitle: 'Title', edProgram: 'Exec', edWorkDir: 'WorkDir', edParams: 'Params' } as const;
  const macros = ['<DEFAULT>', '<DEVCPP>', '<DEVCPPVERSION>', '<EXENAME>', '<PROJECTNAME>', '<PROJECTFILE>', '<PROJECTPATH>', '<SOURCENAME>', '<SOURCEPATH>', '<WORDXY>', '<DATE>', '<DATETIME>'];
  const dialog = showForm(editDef as DfmNode, (c) => {
    localize(c, 'ToolEditFrm');
    for (const [field, key] of Object.entries(fields)) c.text(field, tool[key]);
    c.items('lstMacro', macros);
    let field = 'edParams';
    for (const name of ['edProgram', 'edWorkDir', 'edParams']) c.handlers[`${name}.KeyPress`] = () => { field = name; };
    c.handlers.EditEnter = (name) => { field = name; };
    c.handlers.btnInsertClick = () => c.text(field, c.text(field) + (macros[c.itemIndex('lstMacro')] ?? ''));
    c.handlers.lstMacroClick = () => c.lines('lblDesc', [parseMacros(macros[c.itemIndex('lstMacro')] ?? '')]);
    c.handlers.btnProgClick = async () => { const file = await showFileDialog({ mode: 'open', filter: 'Programs|*.exe;*.wasm|All files|*.*' }); if (file) c.text('edProgram', file.files[0]); };
    c.handlers.btnWorkDirClick = async () => { const dir = await browseForFolder('', c.text('edWorkDir')); if (dir) c.text('edWorkDir', dir); };
  });
  if (await dialog !== 1) return null;
  const result = { ...tool }; for (const [field, key] of Object.entries(fields)) result[key] = dialog.ctl.text(field);
  return result.Title.trim() && result.Exec.trim() ? result : null;
}
export async function showConfigTools() {
  const tools = structuredClone(settings.tools);
  await showForm(dfm as DfmNode, (c) => {
    localize(c, 'ToolFrm');
    const update = (i = c.itemIndex('ListBox')) => { c.set('ListBox', { items: tools.map((t) => t.Title), itemIndex: Math.min(i, tools.length - 1) }); c.enabled('btnEdit', tools.length > 0); c.enabled('btnDelete', tools.length > 0); };
    c.handlers.btnAddClick = async () => { const tool = await editTool({ Title: '', Exec: '', WorkDir: '<SOURCEPATH>', Params: '' }); if (tool) { tools.push(tool); update(tools.length - 1); } };
    c.handlers.btnEditClick = async () => { const i = c.itemIndex('ListBox'); if (i >= 0) { const tool = await editTool(tools[i]); if (tool) { tools[i] = tool; update(); } } };
    c.handlers.btnDeleteClick = () => { const i = c.itemIndex('ListBox'); if (i >= 0) tools.splice(i, 1); update(); };
    c.handlers.PosbtnClick = (sender) => { const i = c.itemIndex('ListBox'), next = i + (sender === 'btnUp' ? -1 : 1); if (i >= 0 && next >= 0 && next < tools.length) { [tools[i], tools[next]] = [tools[next], tools[i]]; update(next); } };
    update(0);
  });
  settings.tools = tools; saveSettings(); ide.changed();
}
