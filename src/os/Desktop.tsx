import { useEffect, useState } from 'react';
import { useWM, wm } from './wm';
import { WindowFrame } from './Window';
import { Taskbar } from './Taskbar';
import { MenuLayer } from './menu';
import { FileView } from './FileView';
import type { OpenFile } from './FileView';
import { FolderIcon } from './FileIcons';
import { openFolder } from './FolderWindow';
import { DESKTOP_DIR, DOCUMENTS_DIR } from './vfs';
import { Lang } from '../lang/lang';

export interface DesktopApp {
  id: string;
  name: string;
  icon: string;
  launch: () => void;
}

const apps: DesktopApp[] = [];
export function registerApp(app: DesktopApp) {
  if (!apps.find((a) => a.id === app.id)) apps.push(app);
}

export function Desktop({ onOpenFile }: { onOpenFile: OpenFile }) {
  const m = useWM();
  const [, setTick] = useState(0);

  useEffect(() => {
    const onResize = () => setTick((t) => t + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => Lang.subscribe(() => setTick((t) => t + 1)), []);

  // Route keyboard input to the active window
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const w = wm.get(wm.activeId);
      w?.onKeyDown?.(e);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <div className="desktop" onContextMenu={(e) => e.preventDefault()}>
      <div className="desktop-area">
        <FileView
          directory={DESKTOP_DIR}
          desktop
          onActivate={() => wm.deactivate()}
          onOpenFile={onOpenFile}
          onOpenFolder={(path) => openFolder(path, onOpenFile)}
          shortcuts={[
            ...apps.map((a) => ({ id: 'app:' + a.id, name: a.name, icon: <img src={a.icon} alt="" draggable={false} />, open: a.launch })),
            { id: 'documents', name: Lang.isChinese ? '文档' : 'Documents', icon: <FolderIcon size={48} />, open: () => openFolder(DOCUMENTS_DIR, onOpenFile) },
          ]}
        />
        {m.windows.map((w) => (
          <WindowFrame key={w.id} win={w} active={m.activeId === w.id} />
        ))}
      </div>
      <Taskbar apps={apps} />
      <MenuLayer />
    </div>
  );
}
