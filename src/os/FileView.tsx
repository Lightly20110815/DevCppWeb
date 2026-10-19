import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Lang } from '../lang/lang';
import { basename, dirname, joinPath, normalize, vfs, DESKTOP_DIR, DEVCPP_DIR, DOCUMENTS_DIR } from './vfs';
import { ItemIcon } from './FileIcons';
import { menusOpen, openPopup, popupKey } from './menu';
import { MessageBox, IDYES, MB_ICONWARNING, MB_YESNO } from './messagebox';

export type OpenFile = (path: string) => void | Promise<void>;

export interface FileShortcut {
  id: string;
  name: string;
  icon: ReactNode;
  open: () => void;
}

interface FileViewProps {
  directory: string;
  desktop?: boolean;
  shortcuts?: FileShortcut[];
  onOpenFile: OpenFile;
  onOpenFolder: (path: string) => void;
  onActivate?: () => void;
  toolbar?: (newFolder: () => void) => ReactNode;
  /** Window that owns confirmation dialogs; the desktop has none */
  owner?: number;
}

const fileKey = (path: string) => 'file:' + normalize(path).toLowerCase();
const T = (zh: string, en: string) => Lang.isChinese ? zh : en;

// The desktop, the default save folder and the IDE install folder, plus every folder above them, cannot be deleted
const PROTECTED = [DESKTOP_DIR, DOCUMENTS_DIR, DEVCPP_DIR].map((p) => normalize(p).toLowerCase());
const canDelete = (path: string) => {
  const k = normalize(path).toLowerCase();
  return !!path && !PROTECTED.some((p) => p === k || p.startsWith(k.replace(/\\$/, '') + '\\'));
};

export function FileView({ directory, desktop = false, shortcuts = [], onOpenFile, onOpenFolder, onActivate, toolbar, owner }: FileViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [, refresh] = useState(0);

  useEffect(() => {
    const offFiles = vfs.onChange(() => refresh((n) => n + 1));
    const offLang = Lang.subscribe(() => refresh((n) => n + 1));
    return () => { offFiles(); offLang(); };
  }, []);

  const entries = vfs.list(directory);
  const items = [
    ...shortcuts.map((s) => ({ ...s, path: '', dir: false })),
    ...entries.map((n) => ({
      id: fileKey(n.path), name: basename(n.path), path: n.path, dir: n.dir,
      icon: <ItemIcon name={n.path} dir={n.dir} size={48} />,
      open: () => n.dir ? onOpenFolder(n.path) : void onOpenFile(n.path),
    })),
  ];

  const newFolder = () => {
    if (!vfs.dirExists(directory)) return;
    const base = T('新建文件夹', 'New folder');
    let name = base;
    let i = 2;
    while (vfs.exists(joinPath(directory, name))) name = `${base} (${i++})`;
    const path = joinPath(directory, name);
    vfs.mkdirs(path);
    setSelected(fileKey(path));
    setRenaming(path);
  };

  const deleteItem = async (path: string) => {
    if (!canDelete(path) || !vfs.exists(path)) return;
    const name = basename(vfs.realPath(path));
    const dir = vfs.dirExists(path);
    const text = !dir ? T(`确实要永久删除“${name}”吗？`, `Are you sure you want to permanently delete "${name}"?`)
      : vfs.list(path).length ? T(`确实要永久删除文件夹“${name}”及其中的所有内容吗？`, `Are you sure you want to permanently delete the folder "${name}" and everything in it?`)
      : T(`确实要永久删除文件夹“${name}”吗？`, `Are you sure you want to permanently delete the folder "${name}"?`);
    const answer = await MessageBox(text, dir ? T('删除文件夹', 'Delete Folder') : T('删除文件', 'Delete File'), MB_YESNO | MB_ICONWARNING, owner ?? 0);
    if (answer === IDYES && vfs.exists(path)) {
      vfs.remove(path);
      setSelected((s) => s === fileKey(path) ? null : s);
    }
    gridRef.current?.focus({ preventScroll: true });
  };

  const backgroundMenu = (x: number, y: number) => openPopup([
    { caption: T('新建(&W)', 'Ne&w'), items: [
      { caption: T('文件夹(&F)', '&Folder'), enabled: vfs.dirExists(directory), onClick: newFolder },
    ] },
    { caption: '-' },
    { caption: T('刷新(&E)', 'R&efresh'), onClick: () => refresh((n) => n + 1) },
  ], x, y);

  return (
    <div
      ref={ref}
      className={'file-view' + (desktop ? ' desktop-files' : '')}
      onFocus={onActivate}
      onPointerDown={(e) => {
        onActivate?.();
        const target = e.target as HTMLElement;
        if (target.closest('input, button, .folder-toolbar')) return;
        gridRef.current?.focus({ preventScroll: true });
        if (!target.closest('.file-item')) setSelected(null);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if ((e.target as HTMLElement).closest('input, .folder-toolbar')) return;
        backgroundMenu(e.clientX, e.clientY);
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || (e.target as HTMLElement).closest('input')) return;
        if (menusOpen()) { popupKey(e.nativeEvent); return; }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
          e.preventDefault(); newFolder();
        } else if (e.key === 'Enter') {
          e.preventDefault(); items.find((item) => item.id === selected)?.open();
        } else if (e.key === 'Delete' || (e.metaKey && e.key === 'Backspace')) {
          const path = items.find((item) => item.id === selected)?.path;
          if (path) { e.preventDefault(); void deleteItem(path); }
        } else if (e.key === 'Escape') setSelected(null);
        else if (['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Home', 'End'].includes(e.key) && items.length) {
          e.preventDefault();
          const i = items.findIndex((item) => item.id === selected);
          const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
            : Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1)));
          setSelected(items[next].id);
          ref.current?.querySelectorAll<HTMLElement>('.file-item')[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      }}
    >
      {toolbar?.(newFolder)}
      <div
        ref={gridRef}
        tabIndex={0}
        className={'file-grid' + (desktop ? ' desktop-icons' : '')}
        role="listbox"
        aria-label={desktop ? T('桌面', 'Desktop') : directory}
        aria-activedescendant={selected && items.some((item) => item.id === selected) ? `${listId}-${items.findIndex((item) => item.id === selected)}` : undefined}
      >
        {items.map((item, index) => (
          <div
            key={item.id}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={selected === item.id}
            className={'file-item' + (desktop ? ' desktop-icon' : '') + (selected === item.id ? ' selected' : '')}
            title={item.path || item.name}
            onPointerDown={() => setSelected(item.id)}
            onDoubleClick={(e) => {
              if (!(e.target as HTMLElement).closest('input') && renaming !== item.path) item.open();
            }}
            onContextMenu={(e) => {
              if ((e.target as HTMLElement).closest('input')) return;
              e.preventDefault(); e.stopPropagation();
              setSelected(item.id);
              openPopup([
                { caption: T('打开(&O)', '&Open'), isDefault: true, onClick: item.open },
                ...(item.path ? [
                  { caption: '-' },
                  { caption: T('删除(&D)', '&Delete'), enabled: canDelete(item.path), onClick: () => void deleteItem(item.path) },
                ] : []),
              ], e.clientX, e.clientY);
            }}
          >
            {item.icon}
            {renaming === item.path ? (
              <FolderNameEditor path={item.path} onDone={(path, focus) => {
                setRenaming(null); setSelected(fileKey(path));
                if (focus) gridRef.current?.focus({ preventScroll: true });
              }} />
            ) : <span className="file-label">{item.name}</span>}
          </div>
        ))}
        {!desktop && !items.length && <div className="folder-empty">{T('此文件夹为空。', 'This folder is empty.')}</div>}
      </div>
      {!desktop && <div className="folder-status">{entries.length} {T('个项目', entries.length === 1 ? 'item' : 'items')}</div>}
    </div>
  );
}

function FolderNameEditor({ path, onDone }: { path: string; onDone: (path: string, focus: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  const [error, setError] = useState('');
  const finish = (cancel: boolean, focus: boolean) => {
    if (finished.current) return;
    if (cancel) { finished.current = true; onDone(path, focus); return; }
    const name = ref.current?.value.trim() ?? '';
    if (!name || /[\\/:*?"<>|\u0000-\u001f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
      setError(T('文件夹名称无效。', 'Invalid folder name.')); return;
    }
    const target = joinPath(dirname(path), name);
    if (target.toLowerCase() !== path.toLowerCase() && vfs.exists(target)) {
      setError(T('同名文件或文件夹已存在。', 'A file or folder with this name already exists.')); return;
    }
    try {
      if (target !== path) vfs.rename(path, target);
      finished.current = true; onDone(target, focus);
    } catch {
      setError(T('无法重命名文件夹。', 'Unable to rename the folder.'));
    }
  };
  return (
    <div className="file-rename">
      <input
        ref={ref}
        autoFocus
        defaultValue={basename(path)}
        aria-label={T('文件夹名称', 'Folder name')}
        aria-invalid={!!error}
        spellCheck={false}
        onFocus={(e) => { e.target.select(); e.target.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }}
        onChange={() => setError('')}
        onBlur={() => finish(false, false)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault(); finish(e.key === 'Escape', true);
          }
        }}
      />
      {error && <span className="file-rename-error" role="alert">{error}</span>}
    </div>
  );
}
