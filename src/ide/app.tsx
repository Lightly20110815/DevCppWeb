// devcpp.dpr + TMainForm.FormCreate/FormShow: start-up sequence of Dev-C++.
import { wm } from '../os/wm';
import { ide } from './ide';
import { devData, saveSettings } from './config';
import { Lang } from '../lang/lang';
import { setIconTheme, DEVCPP_ICON } from '../os/images';
import { MainWindow, handleMainKeyDown } from './ui/MainWindow';
import { setMainWindowId } from '../vcl/VclForm';
import { parser } from './parser/service';
import './forms/projectOps';
import { installEditorHooks } from './editorHooks';

let starting = false;

if (import.meta.env.DEV) (window as unknown as { devcpp: unknown }).devcpp = { ide, wm, devData };

export async function launchDevCpp() {
  if (ide.windowId && wm.get(ide.windowId)) {
    wm.focus(ide.windowId);
    return;
  }
  if (starting) return;
  starting = true;
  try {
    setIconTheme(devData.Theme);
    if (devData.First || !devData.Language) {
      const { showLangForm } = await import('./forms/LangForm');
      await showLangForm();
    } else await Lang.open(devData.Language);
    installEditorHooks();
    const id = wm.open({
      title: ide.appTitle,
      icon: DEVCPP_ICON,
      appId: 'devcpp',
      w: Math.min(1015, window.innerWidth),
      h: Math.min(719, window.innerHeight - 40),
      minW: 400,
      minH: 300,
      state: devData.WindowMaximized ? 'maximized' : 'normal',
      resizable: true,
      center: 'none',
      x: devData.WindowRect?.x,
      y: devData.WindowRect?.y,
      render: (wid) => <MainWindow windowId={wid} />,
      onKeyDown: handleMainKeyDown,
      onCloseRequest: async () => {
        const w = wm.get(ide.windowId);
        if (w) {
          devData.WindowMaximized = w.state === 'maximized';
          devData.WindowRect = { x: w.x, y: w.y, w: w.w, h: w.h };
        }
        const ok = await ide.canClose();
        if (!ok) return false;
        saveSettings();
      },
      onClosed: () => {
        ide.windowId = 0;
        document.title = 'Dev-C++ 5.11';
      },
    });
    ide.windowId = id;
    setMainWindowId(id);
    ide.updateAppTitle();
    ide.updateStatus();
    // OpenCloseMessageSheet(False) in FormShow
    ide.openCloseMessageSheet(false);
    // Tips on start
    if (devData.ShowTipsOnStart) void import('./forms').then((f) => f.tips());
    void parser;
  } finally {
    starting = false;
  }
}

window.addEventListener('beforeunload', (e) => {
  if (ide.allEditors.some((ed) => ed.modified) || ide.project?.modified) {
    e.preventDefault();
    e.returnValue = '';
  }
  const w = wm.get(ide.windowId);
  if (w) {
    devData.WindowMaximized = w.state === 'maximized';
    devData.WindowRect = { x: w.x, y: w.y, w: w.w, h: w.h };
  }
  saveSettings();
});
