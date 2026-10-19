import { useEffect, useState } from 'react';
import { Lang } from '../lang/lang';
import { FileView } from './FileView';
import type { OpenFile } from './FileView';
import { FOLDER_ICON, FolderIcon } from './FileIcons';
import { basename, dirname, normalize, vfs, DESKTOP_DIR, DOCUMENTS_DIR } from './vfs';
import { MessageBox, MB_ICONWARNING } from './messagebox';
import { wm } from './wm';

const folders = new Map<number, string>();
const T = (zh: string, en: string) => Lang.isChinese ? zh : en;
const folderTitle = (path: string) => normalize(path).toLowerCase() === DESKTOP_DIR.toLowerCase() ? T('桌面', 'Desktop')
  : normalize(path).toLowerCase() === DOCUMENTS_DIR.toLowerCase() ? T('文档', 'Documents') : basename(path);

export function openFolder(path: string, onOpenFile: OpenFile) {
  if (!vfs.dirExists(path)) return;
  const real = vfs.realPath(path);
  for (const [id, current] of folders) {
    if (current.toLowerCase() === real.toLowerCase() && wm.get(id)) { wm.focus(id); return; }
  }
  const id = wm.open({
    title: folderTitle(real), icon: FOLDER_ICON, appId: 'files',
    clientW: 720, clientH: 460, minW: 360, minH: 240, center: 'none', clientBg: '#fff',
    render: (windowId) => <FolderWindow windowId={windowId} initial={real} onOpenFile={onOpenFile} />,
    onClosed: () => { folders.delete(id); },
  });
  folders.set(id, real);
}

function FolderWindow({ windowId, initial, onOpenFile }: { windowId: number; initial: string; onOpenFile: OpenFile }) {
  const [directory, setDirectory] = useState(initial);
  const [history, setHistory] = useState<string[]>([]);
  const [, refresh] = useState(0);
  useEffect(() => Lang.subscribe(() => refresh((n) => n + 1)), []);
  useEffect(() => {
    folders.set(windowId, directory);
    wm.update(windowId, { title: folderTitle(directory) });
  }, [directory, windowId, Lang.version]);
  // When the open folder is deleted, show the nearest folder above it that still exists
  useEffect(() => {
    const check = () => {
      if (vfs.dirExists(directory)) return;
      let parent = dirname(directory);
      while (parent && !vfs.dirExists(parent)) parent = dirname(parent);
      if (parent) setDirectory(vfs.realPath(parent));
    };
    check();
    const off = vfs.onChange(check);
    return () => { off(); };
  }, [directory]);

  const navigate = (path: string) => {
    if (!vfs.dirExists(path)) {
      void MessageBox(T('找不到该文件夹。请检查路径。', 'The folder was not found. Check the path.'), folderTitle(directory), MB_ICONWARNING, windowId);
      return;
    }
    const real = vfs.realPath(path);
    if (real.toLowerCase() === directory.toLowerCase()) return;
    setHistory((prev) => [...prev, directory]); setDirectory(real);
  };

  return (
    <FileView
      key={directory}
      directory={directory}
      owner={windowId}
      onOpenFile={onOpenFile}
      onOpenFolder={navigate}
      toolbar={(newFolder) => (
        <div className="folder-toolbar">
          <div className="folder-navigation">
            <button type="button" disabled={!history.length} title={T('后退', 'Back')} aria-label={T('后退', 'Back')} onClick={() => {
              const prev = history[history.length - 1];
              if (prev) { setHistory((items) => items.slice(0, -1)); setDirectory(prev); }
            }}>←</button>
            <button type="button" disabled={!dirname(directory)} title={T('向上一级', 'Up one level')} aria-label={T('向上一级', 'Up one level')} onClick={() => navigate(dirname(directory))}>↑</button>
            <input
              key={directory}
              className="folder-address"
              defaultValue={directory}
              aria-label={T('地址', 'Address')}
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter') { e.preventDefault(); navigate(e.currentTarget.value); }
                else if (e.key === 'Escape') e.currentTarget.value = directory;
              }}
            />
          </div>
          <div className="folder-actions">
            <button type="button" onClick={newFolder}><FolderIcon />{T('新建文件夹', 'New folder')}</button>
            <button type="button" onClick={() => navigate(DESKTOP_DIR)}>{T('桌面', 'Desktop')}</button>
            <button type="button" onClick={() => navigate(DOCUMENTS_DIR)}>{T('文档', 'Documents')}</button>
          </div>
        </div>
      )}
    />
  );
}
