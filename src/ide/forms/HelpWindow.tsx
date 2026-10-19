// actHelpExecute: opens the Dev-C++ help pages (Help\index.htm).
import { wm } from '../../os/wm';
import { iconUrl } from '../../os/images';

let helpWin = 0;

export function showHelp(page = 'index.htm') {
  if (helpWin && wm.get(helpWin)) {
    wm.focus(helpWin);
    return;
  }
  helpWin = wm.open({
    title: 'Dev-C++ Help',
    icon: iconUrl('icons/devcpp_16.png'),
    w: Math.min(980, window.innerWidth - 60),
    h: Math.min(700, window.innerHeight - 100),
    resizable: true,
    clientBg: '#fff',
    render: () => <iframe title="help" src={import.meta.env.BASE_URL + 'help/' + page} style={{ border: 'none', width: '100%', height: '100%', display: 'block', background: '#fff' }} />,
    onClosed: () => {
      helpWin = 0;
    },
  });
}
