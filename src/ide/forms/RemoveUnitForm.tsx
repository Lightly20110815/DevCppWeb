// RemoveUnitFrm.pas
import dfm from '../../generated/forms/RemoveUnitFrm.json';
import { showForm } from '../../vcl/VclForm';
import type { DfmNode } from '../../vcl/FormCtl';
import { lang } from '../../lang/lang';
import * as L from '../../generated/langIds';
import { ide } from '../ide';
import { basename } from '../../os/vfs';

export async function showRemoveUnit() {
  const p = ide.project;
  if (!p) return;
  await showForm(
    dfm as unknown as DfmNode,
    (c) => {
      c.caption('DelBtn', lang(L.ID_ITEM_DELETE));
      const refresh = () => c.set('UnitList', { items: p.units.map((u) => basename(u.fileName)), selSet: [], itemIndex: -1 });
      refresh();
      c.handlers.DelBtnClick = async () => {
        const sel = [...(c.get('UnitList').selSet ?? [])];
        const idx = c.get('UnitList').itemIndex ?? -1;
        if (!sel.length && idx >= 0) sel.push(idx);
        sel.sort((a, b) => b - a);
        for (const i of sel) await p.removeEditor(i, true);
        refresh();
        ide.changed();
      };
      c.handlers['UnitList.KeyDown'] = (_s: string, e: KeyboardEvent) => {
        if (e.key === 'Delete') void c.handlers.DelBtnClick('DelBtn');
      };
    },
    { title: lang(L.ID_RU) },
  );
}
