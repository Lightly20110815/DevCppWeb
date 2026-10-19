import { createRoot } from 'react-dom/client';
import './styles/win.css';
import './styles/devcpp.css';
import { vfs } from './os/vfs';
import { Desktop, registerApp } from './os/Desktop';
import { iconUrl } from './os/images';
import { launchDevCpp } from './ide/app';
import { Lang } from './lang/lang';
import { devData } from './ide/config';
import { ensureIsolation } from './isolation';
import { initializeFonts } from './ide/fonts';
import { MessageBox, MB_ICONERROR } from './os/messagebox';
import { toolchain } from './compiler/clang';

async function openDesktopFile(path: string) {
  try {
    await launchDevCpp();
    if (/\.(exe|wasm)$/i.test(path)) {
      const { runExternal } = await import('./ide/run');
      await runExternal(path, '');
    } else {
      const { ide } = await import('./ide/ide');
      await ide.openFileList([path]);
    }
  } catch (error) {
    await MessageBox(`${path}\n\n${error instanceof Error ? error.message : String(error)}`, Lang.isChinese ? '无法打开文件' : 'Unable to open file', MB_ICONERROR);
  }
}

async function boot() {
  await ensureIsolation();
  await vfs.init();
  await initializeFonts();
  if (!devData.First && devData.Language) await Lang.open(devData.Language);
  registerApp({ id: 'devcpp', name: 'Dev-C++', icon: iconUrl('icons/devcpp_48.png'), launch: () => void launchDevCpp() });
  createRoot(document.getElementById('root')!).render(<Desktop onOpenFile={openDesktopFile} />);
  // Download and initialize in parallel with the startup wizard and editor work.
  void toolchain.preload().catch(() => {});
  // Dev-C++ starts right away, like double clicking devcpp.exe
  setTimeout(() => void launchDevCpp(), 300);
}

void boot();
