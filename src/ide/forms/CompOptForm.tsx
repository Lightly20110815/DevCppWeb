import dfm from '../../generated/forms/CompOptionsFrm.json';
import { showForm } from '../../vcl/VclForm';
import type { DfmNode } from '../../vcl/FormCtl';
import { settings, saveSettings, defaultCompilerSets } from '../config';
import { compilerOptionControls, directoryControls } from './optionControls';
import { localize } from './formUtils';
import { showFileDialog } from '../../os/FileDialog';
import { InputQuery } from '../../os/messagebox';
import { ide } from '../ide';

export async function showCompilerOptions() {
  const sets = structuredClone(settings.compilerSets);
  let index = settings.compilerSetIndex;
  const programFields = { GccEdit: 'gccName', GppEdit: 'gppName', MakeEdit: 'makeName', GdbEdit: 'gdbName', WindresEdit: 'windresName', GprofEdit: 'gprofName' } as const;
  const dialog = showForm(dfm as DfmNode, (c) => {
    localize(c, 'CompOptionsFrm');
    const save = () => {
      const set = sets[index];
      set.compAdd = c.checked('cbCompAdd'); set.linkAdd = c.checked('cbLinkerAdd');
      set.compOpt = c.lines('Commands').join(' '); set.linkOpt = c.lines('Linker').join(' ');
      for (const [field, key] of Object.entries(programFields)) set[key] = c.text(field);
    };
    const load = () => {
      const set = sets[index];
      c.set('cmbCompilerSetComp', { items: sets.map((s) => s.name), itemIndex: index, text: set.name });
      c.checked('cbCompAdd', set.compAdd); c.checked('cbLinkerAdd', set.linkAdd);
      c.lines('Commands', [set.compOpt]); c.lines('Linker', [set.linkOpt]);
      for (const [field, key] of Object.entries(programFields)) c.text(field, set[key]);
      compilerOptionControls(c, () => set.options, (value) => set.options = value);
      directoryControls(c, { tabs: 'DirTabs', list: 'lstDirs', edit: 'edEntry', browse: 'btnBrowse', add: 'btnAdd', replace: 'btnReplace', remove: 'btnDelete', invalid: 'btnDelInval', up: 'btnUp', down: 'btnDown' }, ['Binaries', 'Libraries', 'C Includes', 'C++ Includes'], [set.binDirs, set.libDirs, set.cDirs, set.cppDirs]);
      c.enabled('Commands', set.compAdd); c.enabled('Linker', set.linkAdd);
    };
    c.handlers.cmbCompilerSetCompChange = () => { save(); index = c.itemIndex('cmbCompilerSetComp'); load(); };
    c.handlers.cbCompAddClick = () => c.enabled('Commands', c.checked('cbCompAdd'));
    c.handlers.cbLinkerAddClick = () => c.enabled('Linker', c.checked('cbLinkerAdd'));
    c.handlers.btnOkClick = save;
    c.handlers.btnAddBlankCompilerSetClick = async () => { const name = await InputQuery('Compiler set', 'Name:', 'New compiler'); if (name) { save(); sets.push({ ...structuredClone(defaultCompilerSets()[0]), name, compOpt: '', linkOpt: '', options: '' }); index = sets.length - 1; load(); } };
    c.handlers.btnAddFilledCompilerSetClick = async () => { const name = await InputQuery('Compiler set', 'Name:', sets[index].name + ' (copy)'); if (name) { save(); sets.push({ ...structuredClone(sets[index]), name }); index = sets.length - 1; load(); } };
    c.handlers.btnDelCompilerSetClick = () => { if (sets.length > 1) { sets.splice(index, 1); index = Math.min(index, sets.length - 1); load(); } };
    c.handlers.btnRenameCompilerSetClick = async () => { const name = await InputQuery('Compiler set', 'Name:', sets[index].name); if (name) { sets[index].name = name; load(); } };
    c.handlers.btnFindCompilersClick = () => { save(); for (const set of defaultCompilerSets()) if (!sets.some((s) => s.name === set.name)) sets.push(set); load(); };
    const browseMap: Record<string, keyof typeof programFields> = { btnBrowse2: 'GccEdit', btnBrowse3: 'GppEdit', btnBrowse4: 'MakeEdit', btnBrowse5: 'GdbEdit', btnBrowse6: 'WindresEdit', btnBrowse8: 'GprofEdit' };
    c.handlers.btnBrws1Click = async (sender) => { const result = await showFileDialog({ mode: 'open', filter: 'Programs (*.exe)|*.exe|All files (*.*)|*.*' }); if (result) c.text(browseMap[sender], result.files[0]); };
    load();
  });
  if (await dialog === 1) { settings.compilerSets = sets; settings.compilerSetIndex = index; saveSettings(); ide.changed(); }
}
