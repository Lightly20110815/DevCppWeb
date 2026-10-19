import dfm from '../../generated/forms/ImportMSVCFrm.json';
import { showForm } from '../../vcl/VclForm';
import type { DfmNode } from '../../vcl/FormCtl';
import { showFileDialog } from '../../os/FileDialog';
import { vfs, basename, dirname, changeExt, expandFileTo } from '../../os/vfs';
import { ide } from '../ide';
import { Project } from '../project/Project';
import { parser } from '../parser/service';
import { localize } from './formUtils';
import { splitArgs } from '../../compiler/Compiler';

export async function showImportMSVC() {
  await showForm(dfm as DfmNode, (c) => {
    localize(c, 'ImportMSVCFrm'); c.text('txtVC', ''); c.text('txtDev', '');
    c.handlers.btnBrowseClick = async () => {
      const result = await showFileDialog({ mode: 'open', filter: 'Visual C++ projects|*.dsp;*.vcxproj;*.vcproj|All files|*.*' }); if (!result) return;
      const path = result.files[0], text = vfs.readText(path);
      c.text('txtVC', path); c.text('txtDev', changeExt(path, '.dev'));
      const configs = /\.dsp$/i.test(path) ? [...text.matchAll(/^# Name "([^"]+)"/gm)].map((m) => m[1]) : [...new DOMParser().parseFromString(text, 'text/xml').querySelectorAll('ProjectConfiguration')].map((n) => n.getAttribute('Include') ?? '');
      c.set('cmbConf', { items: configs.length ? configs : ['Default'], itemIndex: 0 }); c.enabled('btnImport', true);
    };
    c.handlers.btnBrowseDevClick = async () => { const result = await showFileDialog({ mode: 'save', filter: 'Dev-C++ projects|*.dev', fileName: c.text('txtDev'), defaultExt: 'dev', overwritePrompt: true }); if (result) c.text('txtDev', result.files[0]); };
    c.handlers.btnImportClick = async () => {
      const path = c.text('txtVC'), target = c.text('txtDev'); if (!vfs.fileExists(path) || !target) return false;
      if (ide.project) { await ide.closeProject(); if (ide.project) return false; }
      const text = vfs.readText(path), dir = dirname(path), project = new Project(target, changeExt(basename(path), ''));
      const files: string[] = []; project.options.type = 'console'; project.options.useGPP = true;
      const expand = (s: string) => expandFileTo(s.replace(/\$\(ProjectDir\)/g, dir + '\\').replace(/\$\(Configuration\)/g, c.text('cmbConf').split('|')[0]), dir);
      if (/\.dsp$/i.test(path)) {
        let active = true;
        const chosen = c.text('cmbConf');
        for (const line of text.split(/\r?\n/)) {
          const condition = /^!(?:IF|ELSEIF)\s+"\$\(CFG\)"\s*==\s*"([^"]+)"/.exec(line);
          if (condition) { active = condition[1] === chosen; continue; }
          if (/^!ENDIF/.test(line)) active = true;
          const source = /^SOURCE=(.+)/.exec(line); if (source) files.push(expand(source[1].trim().replace(/^"|"$/g, '')));
          if (!active) continue;
          if (/# ADD CPP/.test(line)) {
            const flags = splitArgs(line.replace(/^# ADD CPP\s*/, ''));
            flags.forEach((flag, i) => { if (flag === '/I' && flags[i + 1]) project.options.includes.push(expand(flags[i + 1])); if (flag === '/D' && flags[i + 1]) project.options.cppCompilerCmd += ' -D' + flags[i + 1]; });
          }
          if (/subsystem:windows/i.test(line)) project.options.type = 'gui';
        }
      } else {
        const xml = new DOMParser().parseFromString(text, 'text/xml');
        if (xml.querySelector('parsererror')) throw new Error('Invalid Visual C++ project XML');
        for (const node of xml.querySelectorAll('ClCompile, ClInclude, ResourceCompile, File')) {
          const file = node.getAttribute('Include') ?? node.getAttribute('RelativePath'); if (file) files.push(expand(file));
        }
        const cfg = c.text('cmbConf');
        const groups = [...xml.querySelectorAll('ItemDefinitionGroup')].filter((g) => !g.getAttribute('Condition') || g.getAttribute('Condition')!.includes(cfg));
        for (const group of groups) {
          for (const inc of group.querySelectorAll('AdditionalIncludeDirectories')) project.options.includes.push(...inc.textContent!.split(';').filter((s) => s && !s.startsWith('%(')).map(expand));
          for (const def of group.querySelectorAll('PreprocessorDefinitions')) project.options.cppCompilerCmd += def.textContent!.split(';').filter((s) => s && !s.startsWith('%(')).map((s) => ' -D' + s).join('');
          if ([...group.querySelectorAll('SubSystem')].some((n) => /Windows/.test(n.textContent ?? ''))) project.options.type = 'gui';
        }
      }
      ide.project = project;
      for (const file of new Set(files)) await project.addUnit(file, '');
      project.saveOptions(); project.modified = false; parser.scanProject(); ide.updateAppTitle(); ide.changed(); c.close(1);
    };
    c.enabled('btnImport', false);
  });
}
