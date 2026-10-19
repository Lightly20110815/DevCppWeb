// GotoLineFrm.pas
import dfm from '../../generated/forms/GotoLineFrm.json';
import { showForm } from '../../vcl/VclForm';
import type { DfmNode } from '../../vcl/FormCtl';
import { mrOk } from '../../vcl/FormCtl';
import { lang } from '../../lang/lang';
import * as L from '../../generated/langIds';
import { ide } from '../ide';

export async function showGotoLine() {
  const e = ide.getEditor();
  if (!e) return;
  let line = 1;
  const r = await showForm(
    dfm as unknown as DfmNode,
    (c) => {
      c.caption((dfm as DfmNode).name, lang(L.ID_GOTO_CAPTION));
      c.caption('GotoLabel', lang(L.ID_GOTO_TEXT));
      c.caption('BtnOk', lang(L.ID_BTN_OK));
      c.caption('BtnCancel', lang(L.ID_BTN_CANCEL));
      c.set('Line', { value: e.caretLine, minValue: 1, maxValue: e.lineCount });
      c.handlers['Line.Change'] = () => {
        line = c.value('Line');
      };
      line = e.caretLine;
    },
    { title: lang(L.ID_GOTO_CAPTION), focus: 'Line' },
  );
  if (r === mrOk) {
    e.setCaretPosAndActivate(line, 1);
    ide.activate(e);
  }
}
