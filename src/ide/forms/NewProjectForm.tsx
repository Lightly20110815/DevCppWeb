import dfm from '../../generated/forms/NewProjectFrm.json';
import { showForm } from '../../vcl/VclForm';
import type { DfmNode } from '../../vcl/FormCtl';
import { mrOk } from '../../vcl/FormCtl';
import { templates, templateIconUrl, loadUserTemplates } from '../project/templates';
import { Project } from '../project/Project';
import { ide } from '../ide';
import { devData, settings, saveSettings } from '../config';
import { showFileDialog } from '../../os/FileDialog';
import { FLT_PROJECTS } from '../version';
import { vfs } from '../../os/vfs';
import { parser } from '../parser/service';
import { lang, format } from '../../lang/lang';
import * as L from '../../generated/langIds';
import { localize } from './formUtils';

export async function showNewProject() {
  loadUserTemplates();
  const list = [...templates];
  const categories = [...new Set(list.map((t) => t.category || lang(L.ID_NP_PRJSHEET)))];
  let filtered = list;
  let selected = list[0];
  const dialog = showForm(dfm as DfmNode, (c) => {
    localize(c, 'NewProjectFrm');
    c.text('edProjectName', format(lang(L.ID_NEWPROJECT), [++ide.projectCount]));
    c.checked('rbCpp', devData.DefCpp); c.checked('rbC', !devData.DefCpp);
    c.set('TabsMain', { tabs: categories, tabIndex: 0 });
    const choose = () => {
      selected = filtered[c.get('ProjView').selIndex ?? 0];
      c.caption('TemplateLabel', selected?.description ?? '');
      c.enabled('btnOk', !!selected && !!c.text('edProjectName').trim());
      c.enabled('rbC', !selected?.options.useGPP);
      if (selected?.options.useGPP) { c.checked('rbCpp', true); c.checked('rbC', false); }
    };
    const update = () => {
      const category = categories[c.get('TabsMain').tabIndex ?? 0];
      filtered = list.filter((t) => (t.category || lang(L.ID_NP_PRJSHEET)) === category);
      c.set('ProjView', { lvItems: filtered.map((t) => ({ caption: t.name, data: t.icon })), selIndex: 0, data: { largeIcon: (item: { data?: string }) => <img src={templateIconUrl(item.data ?? '')} width="32" height="32" alt="" /> } });
      choose();
    };
    c.handlers.TabsMainChange = update; c.handlers.ProjViewChange = choose; c.handlers.edProjectNameChange = choose;
    c.handlers.ProjViewDblClick = () => { if (c.enabled('btnOk')) c.click('btnOk'); };
    update();
  }, { focus: 'edProjectName' });
  if (await dialog !== mrOk || !selected) return;
  const c = dialog.ctl;
  const name = c.text('edProjectName').trim();
  const file = await showFileDialog({ mode: 'save', filter: FLT_PROJECTS, defaultExt: 'dev', initialDir: settings.dirs.Default, fileName: name + '.dev', overwritePrompt: true });
  if (!file) return;
  if (ide.project) { await ide.closeProject(); if (ide.project) return; }
  const p = new Project(file.files[0], name);
  ide.project = p;
  const template = { ...selected, options: { ...selected.options, useGPP: c.checked('rbCpp') } };
  if (!p.assignTemplate(p.fileName, template)) { ide.project = null; return; }
  p.name = name;
  for (const u of p.units) {
    if (u.editor) { vfs.write(u.fileName, u.editor.text); u.editor.isNew = false; u.editor.setModified(false); }
    u.isNew = false;
  }
  p.saveOptions(); p.saveLayout(); p.modified = false;
  if (c.checked('cbDefault')) { devData.DefCpp = c.checked('rbCpp'); saveSettings(); }
  devData.ShowLeftPages = true; ide.leftPage = 0;
  parser.scanProject(); ide.updateAppTitle(); ide.changed();
}
