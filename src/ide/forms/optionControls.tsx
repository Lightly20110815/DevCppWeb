import type { FormCtl } from '../../vcl/FormCtl';
import { COMPILER_OPTIONS, VALUE_TO_CHAR, charToValue } from '../config';
import { lang, Lang } from '../../lang/lang';
import { browseForFolder as browseFolder } from '../../os/FileDialog';
import { vfs } from '../../os/vfs';

export function compilerOptionControls(c: FormCtl, get: () => string, set: (value: string) => void) {
  const groups = [...new Set(COMPILER_OPTIONS.map((o) => o.section))];
  c.set('tabs', { tabs: groups.map(lang), tabIndex: 0 });
  c.set('vle', { left: 4, top: 26, height: Number(c.node('vle')?.props.Height ?? 200) - 26, render: () => <div className="compiler-options-list">
    {COMPILER_OPTIONS.map((option, index) => option.section !== groups[c.get('tabs').tabIndex ?? 0] ? null : <label key={option.setting} className="compiler-option-row">
      <span title={option.setting}>{lang(option.name)}</span>
      <select aria-label={lang(option.name)} value={charToValue(get()[index] ?? '0')} onChange={(e) => {
        const values = get().padEnd(COMPILER_OPTIONS.length, '0').split('');
        values[index] = VALUE_TO_CHAR[Number(e.target.value)] ?? '0'; set(values.join('')); c.changed();
      }}>
        {(option.choices ?? [[Lang.isChinese ? '否' : 'No', ''], [Lang.isChinese ? '是' : 'Yes', '1']]).map(([name], i) => <option key={i} value={i}>{name || (Lang.isChinese ? '默认' : 'Default')}</option>)}
      </select>
    </label>)}
  </div> });
}

interface DirectoryControls {
  tabs: string; list: string; edit: string; browse: string; add: string; replace: string; remove: string; invalid: string; up: string; down: string;
}
export function directoryControls(c: FormCtl, names: DirectoryControls, titles: string[], values: string[][]) {
  let index = 0;
  c.set(names.tabs, { tabs: titles, tabIndex: 0 });
  const refresh = (selected = -1) => c.set(names.list, { items: [...values[index]], itemIndex: selected });
  const button = (name: string, action: () => void | Promise<void>) => { c.handlers[`${name}.Click`] = action; };
  c.handlers[`${names.tabs}.Change`] = () => { index = c.get(names.tabs).tabIndex ?? 0; refresh(); c.text(names.edit, ''); };
  c.handlers[`${names.list}.Click`] = () => c.text(names.edit, values[index][c.itemIndex(names.list)] ?? '');
  button(names.add, () => { const entry = c.text(names.edit).trim(); if (entry && !values[index].includes(entry)) { values[index].push(entry); refresh(values[index].length - 1); } });
  button(names.replace, () => { const i = c.itemIndex(names.list), entry = c.text(names.edit).trim(); if (i >= 0 && entry) { values[index][i] = entry; refresh(i); } });
  button(names.remove, () => { const i = c.itemIndex(names.list); if (i >= 0) { values[index].splice(i, 1); refresh(Math.min(i, values[index].length - 1)); } });
  button(names.invalid, () => { values[index].splice(0, values[index].length, ...values[index].filter((d) => vfs.dirExists(d))); refresh(); });
  button(names.browse, async () => { const dir = await browseFolder('', c.text(names.edit)); if (dir) c.text(names.edit, dir); });
  for (const [name, delta] of [[names.up, -1], [names.down, 1]] as const) button(name, () => {
    const i = c.itemIndex(names.list), to = i + delta, entries = values[index];
    if (i >= 0 && to >= 0 && to < entries.length) { [entries[i], entries[to]] = [entries[to], entries[i]]; refresh(to); }
  });
  refresh();
}
