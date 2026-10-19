import dfm from '../../generated/forms/NewTemplateFrm.json';
import { showForm } from '../../vcl/VclForm';
import type { DfmNode } from '../../vcl/FormCtl';
import { mrYes } from '../../vcl/FormCtl';
import { ide } from '../ide';
import { settings } from '../config';
import { templates, loadUserTemplates } from '../project/templates';
import { PROJ_TYPES } from '../project/Project';
import { IniFile } from '../ini';
import { vfs, basename, joinPath } from '../../os/vfs';
import { MessageDlg } from '../../os/messagebox';
import { localize } from './formUtils';

export async function showNewTemplate() {
  const project = ide.project; if (!project) return;
  await showForm(dfm as DfmNode, (c) => {
    localize(c, 'NewTemplateFrm');
    c.set('cmbName', { items: templates.map((t) => t.name), text: project.name });
    c.set('cmbCateg', { items: [...new Set(templates.map((t) => t.category))], text: 'User' }); c.text('txtDescr', '');
    c.set('lstFiles', { items: project.units.map((u) => basename(u.fileName)), checkedItems: project.units.map(() => true) });
    c.lines('memCompiler', [project.options.compilerCmd]); c.lines('memCppCompiler', [project.options.cppCompilerCmd]); c.lines('memLinker', [project.options.linkerCmd]);
    c.handlers.btnCreateClick = async () => {
      const name = c.text('cmbName').trim(); if (!name) return false;
      const stem = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_'); const path = joinPath(settings.dirs.Templates, stem + '.template');
      if (vfs.fileExists(path) && await MessageDlg(`${path}\nOverwrite this template?`, 'mtConfirmation', ['mbYes', 'mbNo']) !== mrYes) return false;
      const ini = new IniFile();
      for (const [key, value] of Object.entries({ Name: name, Description: c.text('txtDescr'), Category: c.text('cmbCateg') || 'User', Ver: '2' })) ini.writeString('Template', key, value);
      ini.writeInteger('Project', 'Type', PROJ_TYPES.indexOf(project.options.type)); ini.writeBool('Project', 'IsCpp', project.options.useGPP);
      ini.writeString('Project', 'Compiler', c.lines('memCompiler').join(' ')); ini.writeString('Project', 'CppCompiler', c.lines('memCppCompiler').join(' ')); ini.writeString('Project', 'Linker', c.lines('memLinker').join(' '));
      for (const [field, key] of [['cbInclude', 'includes'], ['cbLibrary', 'libs'], ['cbResource', 'resourceIncludes']] as const) if (c.checked(field)) ini.writeString('Project', key, project.options[key].join(';'));
      let count = 0;
      project.units.forEach((u, i) => {
        if (!c.get('lstFiles').checkedItems?.[i]) return;
        const reference = `${stem}_unit${count}.txt`, section = 'Unit' + count++;
        vfs.write(joinPath(settings.dirs.Templates, reference), u.editor?.text ?? (vfs.fileExists(u.fileName) ? vfs.readText(u.fileName) : ''));
        for (const prefix of ['C', 'Cpp']) { ini.writeString(section, prefix, reference); ini.writeString(section, prefix + 'Name', basename(u.fileName)); }
      });
      ini.writeInteger('Project', 'UnitCount', count); vfs.write(path, ini.toString()); loadUserTemplates(); c.close(1);
    };
  }, { focus: 'cmbName' });
}
