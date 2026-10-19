import { useState } from 'react';
import { showModal } from '../../os/wm';
import { mainWindowId } from '../../vcl/VclForm';
import { actions, actionCaption } from '../actions';
import { eventToShortCut, shortCutToText } from '../shortcuts';
import { settings, saveSettings } from '../config';
import { ide } from '../ide';
import { Button } from '../../vcl/controls';
import { Lang } from '../../lang/lang';

const T = (zh: string, en: string) => Lang.isChinese ? zh : en;
function ShortcutEditor({ close }: { close: (value: Record<string, number> | null) => void }) {
  const list = [...actions.values()].filter((a) => a.execute);
  const [values, setValues] = useState<Record<string, number>>(() => Object.fromEntries(list.map((a) => [a.name, a.shortcut])));
  const [selected, setSelected] = useState(list[0].name);
  const [filter, setFilter] = useState('');
  const rows = list.filter((a) => actionCaption(a).toLowerCase().includes(filter.toLowerCase()));
  const assign = (value: number) => setValues((old) => {
    const next = { ...old };
    if (value) for (const key of Object.keys(next)) if (next[key] === value) next[key] = 0;
    next[selected] = value; return next;
  });
  return <div style={{ padding: 12, height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
    <label>{T('筛选命令：', 'Filter commands:')} <input className="vedit" value={filter} onChange={(e) => setFilter(e.target.value)} /></label>
    <div className="vlistview" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      {rows.map((action) => <button key={action.name} type="button" aria-pressed={selected === action.name} onClick={() => setSelected(action.name)} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', border: 0, padding: '4px 8px', background: selected === action.name ? '#0078d7' : '#fff', color: selected === action.name ? '#fff' : '#000', textAlign: 'left', font: 'inherit' }}><span>{actionCaption(action).replace(/&/g, '')}</span><span>{shortCutToText(values[action.name])}</span></button>)}
    </div>
    <label>{T('按下新的快捷键：', 'Press the new shortcut:')} <input className="vedit" readOnly value={shortCutToText(values[selected])} onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Tab') return; e.preventDefault(); e.stopPropagation(); const value = eventToShortCut(e.nativeEvent); if (e.key === 'Backspace' || e.key === 'Delete') assign(0); else if (value) assign(value); }} /></label>
    <div style={{ display: 'flex', gap: 8 }}>
      <Button caption={T('清除', 'Clear')} onClick={() => assign(0)} />
      <Button caption={T('恢复默认', 'Restore defaults')} onClick={() => setValues(Object.fromEntries(list.map((a) => [a.name, a.defaultShortcut])))} />
      <span style={{ flex: 1 }} /><Button caption={T('确定', 'OK')} isDefault onClick={() => close(values)} /><Button caption={T('取消', 'Cancel')} onClick={() => close(null)} />
    </div>
  </div>;
}
export async function showShortcuts() {
  const result = await showModal<Record<string, number> | null>({ title: T('快捷键设置', 'Configure shortcuts'), owner: mainWindowId(), clientW: 550, clientH: 450, dialog: true, render: (close) => <ShortcutEditor close={close} /> }, null);
  if (!result) return;
  for (const [name, shortcut] of Object.entries(result)) { const action = actions.get(name); if (action) { action.shortcut = shortcut; settings.shortcuts[name] = shortCutToText(shortcut); } }
  saveSettings(); ide.changed();
}
