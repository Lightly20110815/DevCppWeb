// WindowListFrm.pas + TMainForm.ListItemClick
import dfm from '../../generated/forms/WindowListFrm.json';
import { showForm } from '../../vcl/VclForm';
import type { DfmNode, FormCtl } from '../../vcl/FormCtl';
import { mrOk } from '../../vcl/FormCtl';
import { lang } from '../../lang/lang';
import * as L from '../../generated/langIds';
import { ide } from '../ide';
import { basename, dirname } from '../../os/vfs';

export async function showWindowList() {
  const eds = ide.allEditors;
  let ctl: FormCtl | null = null;
  const r = await showForm(
    dfm as unknown as DfmNode,
    (c) => {
      ctl = c;
      c.caption('OkBtn', lang(L.ID_BTN_OK));
      c.caption('CancelBtn', lang(L.ID_BTN_CANCEL));
      c.set('UnitList', {
        lvItems: eds.map((e) => ({ caption: basename(e.fileName), subItems: [dirname(e.fileName)] })),
        selIndex: eds.indexOf(ide.getEditor()!),
      });
      c.handlers['UnitList.DblClick'] = () => {
        if ((c.get('UnitList').selIndex ?? -1) >= 0) c.close(mrOk);
      };
    },
    { title: lang(L.ID_WL), focus: 'UnitList' },
  );
  const i = (ctl as FormCtl | null)?.get('UnitList').selIndex ?? -1;
  if (r === mrOk && i >= 0 && eds[i]) ide.activate(eds[i]);
}
