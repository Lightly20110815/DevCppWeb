// Tool windows that host the left page control or the message control when "floating".
import { wm } from '../../os/wm';
import { devData, saveSettings } from '../config';
import { ide } from '../ide';
import { lang } from '../../lang/lang';
import * as L from '../../generated/langIds';
import { LeftPanel } from '../ui/LeftPanel';
import { MessagePanel } from '../ui/MessagePanel';

let projWin = 0;
let reportWin = 0;

export function syncFloating() {
  if (devData.ProjectFloat && !wm.get(projWin)) {
    projWin = wm.open({
      title: lang(L.ID_LP_PROJECT).replace(/&/g, ''),
      owner: ide.windowId,
      toolWindow: true,
      resizable: true,
      w: 220,
      h: 480,
      center: 'none',
      render: () => <div style={{ position: 'absolute', inset: 0, display: 'flex' }}><LeftPanel /></div>,
      onClosed: () => {
        devData.ProjectFloat = false;
        saveSettings();
        ide.changed();
      },
    });
  } else if (!devData.ProjectFloat && wm.get(projWin)) wm.close(projWin);
  if (devData.MessageFloat && !wm.get(reportWin)) {
    if (!ide.messagePage) ide.openCloseMessageSheet(true);
    reportWin = wm.open({
      title: lang(L.ID_ITEM_FLOATREPORT).replace(/&/g, ''),
      owner: ide.windowId,
      toolWindow: true,
      resizable: true,
      w: 700,
      h: 240,
      center: 'none',
      render: () => <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}><MessagePanel height={10000} /></div>,
      onClosed: () => {
        devData.MessageFloat = false;
        saveSettings();
        ide.changed();
      },
    });
  } else if (!devData.MessageFloat && wm.get(reportWin)) wm.close(reportWin);
}
