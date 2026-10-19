// TipOfTheDayFrm.pas
import dfm from '../../generated/forms/TipOfTheDayFrm.json';
import { showForm } from '../../vcl/VclForm';
import type { DfmNode } from '../../vcl/FormCtl';
import { Lang, lang } from '../../lang/lang';
import * as L from '../../generated/langIds';
import { devData, saveSettings } from '../config';

export async function showTips() {
  const tips = await Lang.tips();
  let counter = devData.LastTip;
  if (counter < 0 || counter >= tips.length) counter = 0;
  let url = '';
  let ctl: import('../../vcl/FormCtl').FormCtl | null = null;
  const convert = (s: string) => {
    let r = s.replace(/<CR>/g, '\n');
    const i = r.indexOf('<URL>');
    if (i >= 0) {
      let u = r.slice(i + 5);
      r = r.slice(0, i);
      let desc = '';
      const j = u.indexOf('<UDESC>');
      if (j >= 0) {
        desc = u.slice(j + 7);
        u = u.slice(0, j);
      }
      url = u;
      ctl?.set('lblUrl', { caption: desc || u, visible: true });
    } else ctl?.set('lblUrl', { visible: false });
    return r;
  };
  await showForm(
    dfm as unknown as DfmNode,
    (c) => {
      ctl = c;
      c.caption('lblTitle', lang(L.ID_TIPS_DIDYOUKNOW));
      c.set('lblTitle', { fontBold: true, fontSize: 19 });
      c.caption('lblTip', lang(L.ID_TIPS_NOTIPSTODISPLAY));
      c.caption('chkNotAgain', lang(L.ID_TIPS_DONTSHOWTIPS));
      c.caption('btnNext', lang(L.ID_TIPS_NEXTTIP));
      c.caption('btnPrev', lang(L.ID_TIPS_PREVIOUSTIP));
      c.caption('btnClose', lang(L.ID_BTN_CLOSE));
      c.caption('btnRandom', lang(L.ID_TIPS_RANDOMTIP));
      c.checked('chkNotAgain', !devData.ShowTipsOnStart);
      c.set('lblUrl', { visible: false, fontColor: '#0000ff', data: { link: () => url && window.open(url, '_blank') } });
      if (tips.length) c.caption('lblTip', convert(tips[counter]));
      else {
        c.enabled('btnNext', false);
        c.enabled('btnPrev', false);
        c.enabled('btnRandom', false);
      }
      c.handlers.btnNextClick = () => {
        counter = counter < tips.length - 1 ? counter + 1 : 0;
        c.caption('lblTip', convert(tips[counter]));
      };
      c.handlers.btnPrevClick = () => {
        counter = counter > 0 ? counter - 1 : tips.length - 1;
        c.caption('lblTip', convert(tips[counter]));
      };
      c.handlers.btnRandomClick = () => {
        let n = counter;
        while (n === counter && tips.length > 1) n = Math.floor(Math.random() * (tips.length - 1));
        counter = n;
        c.caption('lblTip', convert(tips[counter]));
      };
      c.handlers.btnCloseClick = () => c.close(2);
    },
    { title: lang(L.ID_TIPS_CAPTION) },
  );
  devData.LastTip = counter + 1;
  devData.ShowTipsOnStart = !(ctl as import('../../vcl/FormCtl').FormCtl | null)?.checked('chkNotAgain');
  saveSettings();
}
