import dfm from '../../generated/forms/EnviroFrm.json';
import { showForm } from '../../vcl/VclForm';
import type { DfmNode } from '../../vcl/FormCtl';
import { settings, devData, saveSettings, resetSettings } from '../config';
import { bindChecks, localize } from './formUtils';
import { Lang } from '../../lang/lang';
import { setIconTheme } from '../../os/images';
import { ide } from '../ide';
import { browseForFolder as browseFolder, showFileDialog } from '../../os/FileDialog';
import { InputQuery } from '../../os/messagebox';

export async function showEnvironmentOptions() {
  const data = structuredClone(devData);
  const dirs = structuredClone(settings.dirs);
  const associations = ['AssociateC', 'AssociateCpp', 'AssociateCxx', 'AssociateH', 'AssociateHpp', 'AssociateHxx', 'AssociateDev', 'AssociateRc', 'AssociateTemplate'] as const;
  const pathFields = { edUserDir: 'Default', edTemplatesDir: 'Templates', edIcoLib: 'Icons', edLang: 'Lang', edOptionsDir: 'Config' } as const;
  const languages = Lang.langList;
  const dialog = showForm(dfm as DfmNode, (c) => {
    localize(c, 'EnviroFrm');
    const saveChecks = bindChecks(c, data, { cbBackups: 'Backups', cbMinOnRun: 'MinOnRun', cbDefCpp: 'DefCpp', cbShowBars: 'ShowBars', cbMultiLineTab: 'MultiLineTab', cbWatchHint: 'WatchHint', cbShowProgress: 'ShowProgress', cbAutoCloseProgress: 'AutoCloseProgress', cbPauseConsole: 'ConsolePause', cbCheckAssocs: 'CheckAssocs' });
    c.value('seMRUMax', data.MRUMax); c.itemIndex('rgbAutoOpen', data.AutoOpen); c.itemIndex('cboTabsTop', data.MsgTabs);
    c.set('cboLang', { items: languages.map((l) => l.name), itemIndex: languages.findIndex((l) => l.file === data.Language) });
    c.set('cboTheme', { items: ['New Look', 'Gnome', 'Blue'], itemIndex: ['New Look', 'Gnome', 'Blue'].indexOf(data.Theme) });
    c.set('cbUIfont', { items: ['Segoe UI', 'Tahoma', 'Arial', 'SimSun', 'Microsoft YaHei'], text: data.InterfaceFont }); c.text('cbUIfontsize', String(data.InterfaceFontSize));
    for (const [field, key] of Object.entries(pathFields)) c.text(field, dirs[key]);
    c.text('edSplash', data.Splash);
    c.set('lstAssocFileTypes', { items: ['.c', '.cpp', '.cxx', '.h', '.hpp', '.hxx', '.dev', '.rc', '.template'], checkedItems: associations.map((key) => data[key]) });
    c.set('vleExternal', { grid: [['Extension', 'Program'], ...settings.externalPrograms.map((p) => [p.ext, p.program])], data: { editable: (r: number) => r > 0, colWidths: [100, 320] } });
    c.handlers.btnExtAddClick = async () => { const extension = await InputQuery('External program', 'Extension:', '.txt'); if (extension) c.set('vleExternal', { grid: [...c.get('vleExternal').grid!, [extension, '']] }); };
    c.handlers.btnExtDelClick = () => { const index = c.get('vleExternal').selIndex ?? -1; if (index > 0) c.set('vleExternal', { grid: c.get('vleExternal').grid!.filter((_, i) => i !== index) }); };
    const browse: Record<string, string> = { btnDefBrws: 'edUserDir', btnOutputbrws: 'edTemplatesDir', btnBrwIcon: 'edIcoLib', btnBrwLang: 'edLang' };
    c.handlers.BrowseClick = async (name) => { const field = browse[name]; const path = name === 'btnBrwSplash' ? (await showFileDialog({ mode: 'open', filter: 'Images|*.png;*.jpg;*.bmp' }))?.files[0] : await browseFolder('', c.text(field)); if (path) c.text(field ?? 'edSplash', path); };
    c.handlers.btnResetDevClick = async () => { if (await ide.canClose()) { resetSettings(); c.close(3); } };
    c.handlers.btnOkClick = () => {
      saveChecks(); data.MRUMax = c.value('seMRUMax'); data.AutoOpen = c.itemIndex('rgbAutoOpen'); data.MsgTabs = c.itemIndex('cboTabsTop');
      data.Language = languages[c.itemIndex('cboLang')]?.file ?? data.Language; data.Theme = c.text('cboTheme') || data.Theme;
      data.InterfaceFont = c.text('cbUIfont'); data.InterfaceFontSize = Math.max(6, Math.min(30, Number(c.text('cbUIfontsize')) || 9)); data.Splash = c.text('edSplash');
      for (const [field, key] of Object.entries(pathFields)) dirs[key] = c.text(field);
      associations.forEach((key, i) => data[key] = c.get('lstAssocFileTypes').checkedItems?.[i] ?? false);
    };
  });
  const result = await dialog;
  if (result === 1) {
    Object.assign(devData, data); Object.assign(settings.dirs, dirs);
    settings.externalPrograms = (dialog.ctl.get('vleExternal').grid ?? []).slice(1).map(([ext, program]) => ({ ext, program }));
    await Lang.open(data.Language); setIconTheme(data.Theme); saveSettings(); ide.changed();
  } else if (result === 3) { location.reload(); }
}
