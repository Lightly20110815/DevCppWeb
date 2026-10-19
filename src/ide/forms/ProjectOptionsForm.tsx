import dfm from '../../generated/forms/ProjectOptionsFrm.json';
import { showForm } from '../../vcl/VclForm';
import type { DfmNode } from '../../vcl/FormCtl';
import { ide } from '../ide';
import { PROJ_TYPES } from '../project/Project';
import { settings } from '../config';
import { compilerOptionControls, directoryControls } from './optionControls';
import { bindChecks, localize } from './formUtils';
import { basename } from '../../os/vfs';
import { browseForFolder as browseFolder, showFileDialog } from '../../os/FileDialog';

export async function showProjectOptions() {
  const project = ide.project;
  if (!project) return;
  const options = structuredClone(project.options);
  const units = project.units.map((u) => ({ compile: u.compile, compileCpp: u.compileCpp, link: u.link, priority: u.priority, overrideBuildCmd: u.overrideBuildCmd, buildCmd: u.buildCmd }));
  const dialog = showForm(dfm as DfmNode, (c) => {
    localize(c, 'ProjectOptionsFrm');
    c.text('edProjectName', project.name); c.caption('lblPrjFname', project.fileName); c.caption('lblPrjUnits', String(project.units.length)); c.caption('lblPrjOutputFname', project.executable);
    c.itemIndex('lstType', PROJ_TYPES.indexOf(options.type));
    const saveChecks = bindChecks(c, options, { chkSupportXP: 'supportXPThemes', chkDefCpp: 'useGPP', chkOverrideOutput: 'overrideOutput', chkLogOutput: 'logOutputEnabled', cbUseCustomMakefile: 'useCustomMakefile', chkVersionInfo: 'includeVersionInfo' });
    const fields = { edCompiler: 'compilerCmd', edCppCompiler: 'cppCompilerCmd', edLinker: 'linkerCmd', edExeOutput: 'exeOutput', edObjOutput: 'objectOutput', edLogOutput: 'logOutput', edOverridenOutput: 'overridenOutput', edCustomMakefile: 'customMakefile' } as const;
    for (const [field, key] of Object.entries(fields)) c.lines(field, options[key].replace(/_@@_/g, ' ').split('\n'));
    c.set('cmbCompiler', { items: settings.compilerSets.map((s) => s.name), itemIndex: options.compilerSet });
    compilerOptionControls(c, () => options.compilerOptions, (value) => options.compilerOptions = value);
    c.handlers.cmbCompilerChange = () => { options.compilerSet = c.itemIndex('cmbCompiler'); options.compilerOptions = settings.compilerSets[options.compilerSet]?.options ?? ''; c.changed(); };
    directoryControls(c, { tabs: 'SubTabs', list: 'lstDirList', edit: 'edDirEntry', browse: 'btnBrowse', add: 'btnDirAdd', replace: 'btnDirReplace', remove: 'btnDirDelete', invalid: 'btnDirDelInval', up: 'btnDirUp', down: 'btnDirDown' }, ['Libraries', 'Includes', 'Resources'], [options.libs, options.includes, options.resourceIncludes]);
    c.set('lvFiles', { nodes: project.units.map((u, i) => ({ text: basename(u.fileName), data: i })) });
    let unitIndex = -1;
    const saveUnit = () => { const u = units[unitIndex]; if (!u) return; u.compile = c.checked('chkCompile'); u.compileCpp = c.checked('chkCompileCpp'); u.link = c.checked('chkLink'); u.overrideBuildCmd = c.checked('chkOverrideBuildCmd'); u.buildCmd = c.lines('txtOverrideBuildCmd').join('\n'); u.priority = c.value('spnPriority'); };
    c.handlers.lvFilesChange = () => {
      saveUnit(); unitIndex = c.get('lvFiles').selNode?.data ?? -1;
      const u = units[unitIndex]; c.enabled('grpUnitOptions', !!u);
      if (u) { c.checked('chkCompile', u.compile); c.checked('chkCompileCpp', u.compileCpp); c.checked('chkLink', u.link); c.checked('chkOverrideBuildCmd', u.overrideBuildCmd); c.lines('txtOverrideBuildCmd', u.buildCmd.split('\n')); c.value('spnPriority', u.priority); }
    };
    c.enabled('grpUnitOptions', false);
    const version = options.versionInfo;
    for (const [field, key] of Object.entries({ spnMajor: 'major', spnMinor: 'minor', spnRelease: 'release', spnBuild: 'build' } as const)) c.value(field, version[key]);
    c.checked('chkAutoIncBuild', version.autoIncBuildNr); c.checked('chkSyncProduct', version.syncProduct);
    const verFields = ['companyName', 'fileVersion', 'fileDescription', 'internalName', 'legalCopyright', 'legalTrademarks', 'originalFilename', 'productName', 'productVersion'] as const;
    c.set('vleVersion', { grid: [['Name', 'Value'], ...verFields.map((key) => [key, version[key]])], data: { editable: (r: number, col: number) => r > 0 && col === 1, colWidths: [150, 250] } });
    c.set('cmbLangID', { items: ['1033 (English)', '2052 (Chinese)', '1028 (Chinese Traditional)', '1041 (Japanese)'], text: String(version.languageID) });
    c.items('lbMakeIncludes', options.makeIncludes);
    c.handlers.lbMakeIncludesClick = () => c.text('edMakeInclude', c.items('lbMakeIncludes')[c.itemIndex('lbMakeIncludes')] ?? '');
    c.handlers.MakButtonClick = (sender) => {
      const entries = c.items('lbMakeIncludes').slice(), index = c.itemIndex('lbMakeIncludes'), text = c.text('edMakeInclude').trim();
      if (sender === 'btnMakAdd' && text) entries.push(text);
      else if (sender === 'btnMakDelete' && index >= 0) entries.splice(index, 1);
      else if (sender === 'btnMakReplace' && index >= 0 && text) entries[index] = text;
      c.items('lbMakeIncludes', entries);
    };
    c.handlers.btnAddLibClick = async () => { const result = await showFileDialog({ mode: 'open', filter: 'Libraries and objects|*.a;*.o;*.lib;*.obj|All files|*.*', multiSelect: true }); if (result) c.lines('edLinker', [c.lines('edLinker').join(' ') + ' ' + result.files.map((p) => `"${p}"`).join(' ')]); };
    const folderButtons: Record<string, string> = { btnExeOutDir: 'edExeOutput', btnObjOutDir: 'edObjOutput' };
    for (const [button, field] of Object.entries(folderButtons)) c.handlers[`${button}.Click`] = async () => { const result = await browseFolder('', c.text(field) || project.directory); if (result) c.text(field, result); };
    const fileButtons: Record<string, string> = { btnCustomMakeBrowse: 'edCustomMakefile', btnMakeBrowse: 'edMakeInclude', btnLogOutputDir: 'edLogOutput' };
    for (const [button, field] of Object.entries(fileButtons)) c.handlers[`${button}.Click`] = async () => { const result = await showFileDialog({ mode: field === 'edLogOutput' ? 'save' : 'open', filter: 'All files|*.*', initialDir: project.directory }); if (result) c.text(field, result.files[0]); };
    c.handlers.btnIconBrowseClick = async () => { const result = await showFileDialog({ mode: 'open', filter: 'Icons|*.ico;*.png' }); if (result) options.icon = result.files[0]; };
    c.handlers.btnRemoveIconClick = () => options.icon = '';
    c.handlers.btnOkClick = () => {
      saveChecks(); saveUnit(); options.type = PROJ_TYPES[c.itemIndex('lstType')];
      for (const [field, key] of Object.entries(fields)) options[key] = c.lines(field).join(' ');
      options.makeIncludes = c.items('lbMakeIncludes');
      for (const [field, key] of Object.entries({ spnMajor: 'major', spnMinor: 'minor', spnRelease: 'release', spnBuild: 'build' } as const)) version[key] = c.value(field);
      version.languageID = parseInt(c.text('cmbLangID'), 10) || 1033; version.autoIncBuildNr = c.checked('chkAutoIncBuild'); version.syncProduct = c.checked('chkSyncProduct');
      verFields.forEach((key, i) => version[key] = c.get('vleVersion').grid?.[i + 1]?.[1] ?? '');
      if (version.syncProduct) version.productVersion = version.fileVersion;
    };
  });
  if (await dialog === 1 && ide.project === project) {
    project.name = dialog.ctl.text('edProjectName').trim() || project.name; project.options = options;
    project.units.forEach((u, i) => Object.assign(u, units[i])); project.modified = true; project.saveOptions(); ide.updateAppTitle(); ide.changed();
  }
}
