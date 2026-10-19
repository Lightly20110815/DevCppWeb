// The classic (Delphi 7 hooked) GetOpenFileName / GetSaveFileName dialog with the places bar.
import { useEffect, useMemo, useRef, useState } from 'react';
import { showModal } from './wm';
import { vfs, normalize, joinPath, dirname, basename, extname, DESKTOP_DIR, DOCUMENTS_DIR, USER_DIR } from './vfs';
import { Button, ComboBox } from '../vcl/controls';
import { Lang } from '../lang/lang';
import { mainWindowId } from '../vcl/VclForm';
import { MessageBox, MB_YESNO, MB_ICONWARNING, MB_OK, MB_ICONERROR, IDYES } from './messagebox';
import { FolderIcon, ItemIcon } from './FileIcons';
import { openPopup } from './menu';

export { fileIcon, FolderIcon, GenericFileIcon } from './FileIcons';

export interface FileDialogOptions {
  mode: 'open' | 'save';
  title?: string;
  filter: string;
  filterIndex?: number;
  initialDir?: string;
  fileName?: string;
  defaultExt?: string;
  multiSelect?: boolean;
  overwritePrompt?: boolean;
  owner?: number;
}

export interface FileDialogResult {
  files: string[];
  filterIndex: number;
}

let lastDir = DOCUMENTS_DIR;
const recent: string[] = [];

function parseFilter(f: string): { desc: string; masks: string[] }[] {
  const parts = f.split('|');
  const out: { desc: string; masks: string[] }[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) out.push({ desc: parts[i], masks: parts[i + 1].split(';').map((m) => m.trim()).filter(Boolean) });
  if (!out.length) out.push({ desc: 'All files (*.*)', masks: ['*.*'] });
  return out;
}

function maskToRegex(mask: string) {
  if (mask === '*.*' || mask === '*') return /.*/;
  const re = mask.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp('^' + re + '$', 'i');
}

function PlaceIcon({ kind }: { kind: string }) {
  switch (kind) {
    case 'recent':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32"><path d="M3 8h10l3 3h13v16H3z" fill="#e8b84a" /><circle cx="22" cy="21" r="8" fill="#fff" stroke="#2b77d6" strokeWidth="2" /><path d="M22 16v5h4" stroke="#2b77d6" strokeWidth="2" fill="none" /></svg>
      );
    case 'desktop':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32"><rect x="2" y="5" width="28" height="18" fill="#2a86d8" stroke="#1b5ea0" /><rect x="11" y="25" width="10" height="2" fill="#666" /><rect x="8" y="27" width="16" height="2" fill="#888" /></svg>
      );
    case 'libraries':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32"><rect x="4" y="6" width="7" height="22" fill="#d8a83a" /><rect x="12" y="4" width="7" height="24" fill="#4a86c8" /><rect x="20" y="8" width="8" height="20" fill="#5aa84a" /></svg>
      );
    case 'computer':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32"><rect x="3" y="4" width="26" height="18" rx="1" fill="#3a4a5a" /><rect x="5" y="6" width="22" height="14" fill="#7ac0f0" /><rect x="10" y="24" width="12" height="4" fill="#9aa" /></svg>
      );
    default:
      return (
        <svg width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#5aa0e8" /><path d="M4 16h24M16 4v24M8 8c5 4 11 4 16 0M8 24c5-4 11-4 16 0" stroke="#fff" fill="none" /></svg>
      );
  }
}

function T(zh: string, en: string) {
  return Lang.isChinese ? zh : en;
}

export function showFileDialog(o: FileDialogOptions): Promise<FileDialogResult | null> {
  const title = o.title ?? (o.mode === 'open' ? T('打开', 'Open') : T('另存为', 'Save As'));
  return showModal<FileDialogResult | null>(
    {
      title,
      owner: o.owner ?? mainWindowId(),
      clientW: 563,
      clientH: 386,
      dialog: true,
      showHelp: false,
      render: (close) => <FileDialogBody o={o} close={close} />,
    },
    null,
  );
}

const VIRTUAL_COMPUTER = '::computer';

function FileDialogBody({ o, close }: { o: FileDialogOptions; close: (r: FileDialogResult | null) => void }) {
  const filters = useMemo(() => parseFilter(o.filter), [o.filter]);
  const [filterIdx, setFilterIdx] = useState(Math.max(0, Math.min(filters.length - 1, (o.filterIndex ?? 1) - 1)));
  const startDir = o.initialDir && vfs.dirExists(o.initialDir) ? o.initialDir : lastDir && vfs.dirExists(lastDir) ? lastDir : DOCUMENTS_DIR;
  const [dir, setDir] = useState(vfs.realPath(startDir));
  const [history, setHistory] = useState<string[]>([]);
  const [name, setName] = useState(o.fileName ? basename(o.fileName) : '');
  const [sel, setSel] = useState<string[]>([]);
  const [, setTick] = useState(0);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'details'>('list');
  const nameRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const folderImportRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const off = vfs.onChange(() => setTick((t) => t + 1));
    return () => {
      off();
    };
  }, []);
  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  const masks = filters[filterIdx]?.masks.map(maskToRegex) ?? [/.*/];
  const entries =
    dir === VIRTUAL_COMPUTER
      ? [{ path: 'C:\\', dir: true, mtime: 0 }]
      : dir === '::recent'
        ? recent.filter((r) => vfs.exists(r)).map((r) => vfs.get(r)!)
        : vfs.list(dir).filter((n) => n.dir || masks.some((m) => m.test(basename(n.path))));

  const navigate = (d: string) => {
    setHistory((h) => [...h, dir]);
    setDir(d);
    setSel([]);
  };

  const accept = async () => {
    let n = name.trim().replace(/^"|"$/g, '');
    if (!n && sel.length) n = basename(sel[0]);
    if (!n) return;
    // multiple quoted names
    let names: string[] = [n];
    if (o.multiSelect && /"\s+"/.test(name)) names = name.match(/"([^"]+)"/g)!.map((s) => s.slice(1, -1));
    const base = dir === VIRTUAL_COMPUTER || dir.startsWith('::') ? USER_DIR : dir;
    const full = names.map((x) => (/^[a-zA-Z]:/.test(x) ? normalize(x) : joinPath(base, x)));
    if (full.length === 1 && vfs.dirExists(full[0])) {
      navigate(vfs.realPath(full[0]));
      setName('');
      return;
    }
    // wildcard typed -> apply as filter
    if (full.length === 1 && /[*?]/.test(basename(full[0]))) return;
    if (o.mode === 'open') {
      for (const f of full) {
        if (!vfs.fileExists(f)) {
          await MessageBox(`${basename(f)}\n${T('找不到文件。\n请检查文件名是否正确，然后重试。', 'File not found.\nCheck the file name and try again.')}`, o.title ?? T('打开', 'Open'), MB_OK | MB_ICONWARNING);
          return;
        }
      }
    } else {
      let f = full[0];
      if (!extname(f) && o.defaultExt) {
        const flt = filters[filterIdx]?.masks[0];
        const ext = flt && flt !== '*.*' && flt.startsWith('*.') ? flt.slice(1) : '.' + o.defaultExt.replace(/^\./, '');
        f += ext;
      }
      if (!vfs.dirExists(dirname(f))) {
        await MessageBox(T('路径不存在。\n请检查路径是否正确。', 'The path does not exist.\nCheck the path and try again.'), title(), MB_OK | MB_ICONERROR);
        return;
      }
      if (vfs.fileExists(f) && o.overwritePrompt !== false) {
        const r = await MessageBox(`${basename(f)} ${T('已存在。\n要替换它吗?', 'already exists.\nDo you want to replace it?')}`, T('确认另存为', 'Confirm Save As'), MB_YESNO | MB_ICONWARNING);
        if (r !== IDYES) return;
      }
      full[0] = f;
    }
    lastDir = dirname(full[0]);
    for (const f of full) if (!recent.includes(f)) recent.unshift(f);
    recent.splice(20);
    close({ files: full.map((f) => vfs.realPath(f)), filterIndex: filterIdx + 1 });
  };

  const title = () => o.title ?? (o.mode === 'open' ? T('打开', 'Open') : T('另存为', 'Save As'));

  // Look in: chain from Desktop to the current directory
  const chain: { label: string; path: string; depth: number; icon: 'desktop' | 'folder' | 'computer' | 'drive' }[] = [];
  chain.push({ label: T('桌面', 'Desktop'), path: DESKTOP_DIR, depth: 0, icon: 'desktop' });
  chain.push({ label: T('此电脑', 'This PC'), path: VIRTUAL_COMPUTER, depth: 1, icon: 'computer' });
  chain.push({ label: T('本地磁盘 (C:)', 'Local Disk (C:)'), path: 'C:\\', depth: 2, icon: 'drive' });
  if (!dir.startsWith('::') && normalize(dir) !== 'C:\\') {
    const parts = normalize(dir).split('\\').slice(1).filter(Boolean);
    let cur = 'C:\\';
    parts.forEach((p, i) => {
      cur = joinPath(cur, p);
      chain.push({ label: p, path: vfs.realPath(cur), depth: 3 + i, icon: 'folder' });
    });
  }
  const curIdx = chain.findIndex((c) => normalize(c.path).toLowerCase() === normalize(dir).toLowerCase()) ;
  const dirLabel = dir === '::recent' ? T('最近访问的位置', 'Recent Places') : chain[curIdx >= 0 ? curIdx : chain.length - 1]?.label;

  const up = () => {
    if (dir === VIRTUAL_COMPUTER || dir.startsWith('::')) return navigate(DESKTOP_DIR);
    if (normalize(dir) === 'C:\\') return navigate(VIRTUAL_COMPUTER);
    navigate(dirname(dir));
  };

  const newFolder = () => {
    if (dir.startsWith('::')) return;
    let n = T('新建文件夹', 'New folder');
    let i = 2;
    while (vfs.exists(joinPath(dir, n))) n = `${T('新建文件夹', 'New folder')} (${i++})`;
    vfs.mkdirs(joinPath(dir, n));
    setSel([joinPath(dir, n)]);
    setRenaming(joinPath(dir, n));
  };

  const itemLabel = (path: string) => (path === 'C:\\' ? T('本地磁盘 (C:)', 'Local Disk (C:)') : basename(path));

  const onItemClick = (path: string, isDir: boolean, e: React.PointerEvent) => {
    if (o.multiSelect && (e.ctrlKey || e.shiftKey)) {
      const next = sel.includes(path) ? sel.filter((s) => s !== path) : [...sel, path];
      setSel(next);
      const files = next.filter((p) => !vfs.dirExists(p));
      setName(files.length > 1 ? files.map((p) => `"${basename(p)}"`).join(' ') : files[0] ? basename(files[0]) : name);
      return;
    }
    setSel([path]);
    if (!isDir) setName(basename(path));
  };

  const importFiles = async (files: FileList | null) => {
    if (!files) return;
    if (dir.startsWith('::')) return;
    const imported = [];
    for (const f of Array.from(files)) {
      const buf = new Uint8Array(await f.arrayBuffer());
      const relative = (f.webkitRelativePath || f.name).split('/').filter((part) => part && part !== '.' && part !== '..').join('\\');
      const path = joinPath(dir, relative);
      vfs.write(path, buf); imported.push(path);
    }
    setSel(imported.filter((p) => dirname(p).toLowerCase() === dir.toLowerCase()));
    if (imported.length === 1) setName(basename(imported[0]));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    void importFiles(e.dataTransfer.files);
  };

  const download = () => {
    const file = sel.find((path) => vfs.fileExists(path));
    if (!file) return;
    const url = URL.createObjectURL(new Blob([vfs.readBinary(file).slice().buffer as ArrayBuffer]));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = basename(file);
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="filedlg" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <input type="file" multiple hidden ref={importRef} onChange={(e) => { void importFiles(e.target.files); e.target.value = ''; }} />
      <input type="file" multiple hidden {...{ webkitdirectory: '' }} ref={folderImportRef} onChange={(e) => { void importFiles(e.target.files); e.target.value = ''; }} />
      <div className="fd-top">
        <span className="fd-label">{o.mode === 'open' ? T('查找范围(I):', 'Look in:') : T('保存在(I):', 'Save in:')}</span>
        <ComboBox
          className="fd-lookin"
          items={chain.map((c) => c.label)}
          index={curIdx}
          text={dirLabel}
          maxItems={14}
          itemHeight={18}
          renderItem={(i, s) => (
            <span className="fd-chain" style={{ paddingLeft: s === false && i === curIdx ? 0 : chain[i].depth * 10 }}>
              {chain[i].icon === 'folder' ? <FolderIcon open={i === curIdx} /> : chain[i].icon === 'desktop' ? (
                <svg width="16" height="16" viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="9" fill="#2a86d8" /><rect x="5" y="12" width="6" height="2" fill="#777" /></svg>
              ) : chain[i].icon === 'computer' ? (
                <svg width="16" height="16" viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="9" fill="#3a4a5a" /><rect x="2" y="3" width="12" height="7" fill="#7ac0f0" /><rect x="5" y="12" width="6" height="2" fill="#999" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16"><rect x="1" y="5" width="14" height="7" rx="1" fill="#c8c8c8" stroke="#888" /><rect x="11" y="9" width="2" height="1" fill="#3c3" /></svg>
              )}
              <span>{chain[i].label}</span>
            </span>
          )}
          onChange={(i) => navigate(chain[i].path)}
        />
        <div className="fd-tool" title={T('转到访问的上一个文件夹', 'Go to last folder visited')} onClick={() => {
          const prev = history[history.length - 1];
          if (prev) {
            setHistory((h) => h.slice(0, -1));
            setDir(prev);
          }
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill={history.length ? '#2c8a2c' : '#aaa'} /><path d="M9 4.5L5.5 8 9 11.5M5.5 8h6" stroke="#fff" strokeWidth="1.5" fill="none" /></svg>
        </div>
        <div className="fd-tool" title={T('向上一级', 'Up One Level')} onClick={up}>
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M1 4.5h5l1.5 1.5H15v8H1z" fill="#e8b84a" /><path d="M8 13V7M5.5 9.5L8 7l2.5 2.5" stroke="#1d6f1d" strokeWidth="1.6" fill="none" /></svg>
        </div>
        <div className="fd-tool" title={T('创建新文件夹', 'Create New Folder')} onClick={newFolder}>
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M1 4.5h5l1.5 1.5H15v8H1z" fill="#e8b84a" /><path d="M12 1v5M9.5 3.5h5" stroke="#d4a000" strokeWidth="1.4" /></svg>
        </div>
        <div className="fd-tool" title={T('"查看"菜单', 'View Menu')} onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          openPopup([
            { caption: T('列表(&L)', '&List'), checked: view === 'list', radio: true, onClick: () => setView('list') },
            { caption: T('详细信息(&D)', '&Details'), checked: view === 'details', radio: true, onClick: () => setView('details') },
            { caption: '-' },
            { caption: T('从电脑导入文件…', 'Import files from computer…'), enabled: !dir.startsWith('::'), onClick: () => importRef.current?.click() },
            { caption: T('从电脑导入文件夹…', 'Import folder from computer…'), enabled: !dir.startsWith('::'), onClick: () => folderImportRef.current?.click() },
            { caption: T('下载选中文件', 'Download selected file'), enabled: sel.some((path) => vfs.fileExists(path)), onClick: download },
          ], r.left, r.bottom);
        }}>
          <svg width="22" height="16" viewBox="0 0 22 16"><rect x="1" y="2" width="5" height="4" fill="#4a86c8" /><rect x="7" y="3" width="8" height="2" fill="#666" /><rect x="1" y="9" width="5" height="4" fill="#4a86c8" /><rect x="7" y="10" width="8" height="2" fill="#666" /><path d="M17 7l2 2 2-2" stroke="#333" fill="none" /></svg>
        </div>
      </div>
      <div className="fd-places">
        {[
          ['recent', T('最近访问的位置', 'Recent Places'), '::recent'],
          ['desktop', T('桌面', 'Desktop'), DESKTOP_DIR],
          ['libraries', T('库', 'Libraries'), DOCUMENTS_DIR],
          ['computer', T('此电脑', 'This PC'), VIRTUAL_COMPUTER],
          ['network', T('网络', 'Network'), '::network'],
        ].map(([k, label, path]) => (
          <div key={k} className={'fd-place' + (dir === path ? ' sel' : '')} onClick={() => path !== '::network' && navigate(path)}>
            <PlaceIcon kind={k} />
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div
        className={'fd-files ' + view}
        tabIndex={0}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) setSel([]);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            const s = sel[0];
            if (s && vfs.dirExists(s)) navigate(vfs.realPath(s));
            else void accept();
          } else if (e.key === 'Backspace') up();
          else if (e.key === 'Delete' && sel.length && !dir.startsWith('::')) {
            for (const s of sel) vfs.remove(s);
            setSel([]);
          } else if (e.key === 'F2' && sel[0]) setRenaming(sel[0]);
        }}
      >
        {view === 'details' && (
          <div className="fd-dhead">
            <span style={{ width: 210 }}>{T('名称', 'Name')}</span>
            <span style={{ width: 130 }}>{T('修改日期', 'Date modified')}</span>
            <span style={{ width: 80 }}>{T('大小', 'Size')}</span>
          </div>
        )}
        {entries.map((n) => {
          const isSel = sel.some((s) => s.toLowerCase() === n.path.toLowerCase());
          return (
            <div
              key={n.path}
              className={'fd-item' + (isSel ? ' sel' : '')}
              onPointerDown={(e) => onItemClick(n.path, n.dir, e)}
              onDoubleClick={() => {
                if (n.dir) navigate(vfs.realPath(n.path));
                else {
                  setName(basename(n.path));
                  setTimeout(() => (document.querySelector('.fd-ok') as HTMLButtonElement)?.click());
                }
              }}
            >
              {n.path === 'C:\\' ? (
                <svg width="16" height="16" viewBox="0 0 16 16"><rect x="1" y="5" width="14" height="7" rx="1" fill="#c8c8c8" stroke="#888" /><rect x="11" y="9" width="2" height="1" fill="#3c3" /></svg>
              ) : (
                <ItemIcon name={n.path} dir={n.dir} />
              )}
              {renaming === n.path ? (
                <input
                  className="fd-rename"
                  autoFocus
                  defaultValue={basename(n.path)}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
                  }}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== basename(n.path) && !/[\\/:*?"<>|]/.test(v)) {
                      try {
                        vfs.rename(n.path, joinPath(dirname(n.path), v));
                      } catch {
                        /* ignore */
                      }
                    }
                    setRenaming(null);
                  }}
                />
              ) : (
                <span className="fd-name">{itemLabel(n.path)}</span>
              )}
              {view === 'details' && (
                <>
                  <span className="fd-date">{n.mtime ? new Date(n.mtime).toLocaleString(Lang.isChinese ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                  <span className="fd-size">{n.dir ? '' : `${Math.max(1, Math.ceil(vfs.size(n.path) / 1024))} KB`}</span>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="fd-bottom">
        <span className="fd-label2">{T('文件名(N):', 'File name:')}</span>
        <div className="vcombo editable fd-name-combo">
          <input
            ref={nameRef}
            className="vcombo-input"
            value={name}
            spellCheck={false}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                void accept();
              }
            }}
          />
          <div className="vcombo-btn">
            <svg width="8" height="5" viewBox="0 0 8 5"><path d="M0.5 0.5L4 4 7.5 0.5" fill="none" stroke="currentColor" /></svg>
          </div>
        </div>
        <Button className="fd-ok" caption={o.mode === 'open' ? T('打开(&O)', '&Open') : T('保存(&S)', '&Save')} isDefault style={{ width: 75, height: 23 }} onClick={() => void accept()} />
        <span className="fd-label3">{o.mode === 'open' ? T('文件类型(T):', 'Files of type:') : T('保存类型(T):', 'Save as type:')}</span>
        <ComboBox className="fd-type" items={filters.map((f) => f.desc)} index={filterIdx} onChange={setFilterIdx} />
        <Button className="fd-cancel" caption={T('取消', 'Cancel')} style={{ width: 75, height: 23 }} onClick={() => close(null)} />
      </div>
    </div>
  );
}

/** Shell "Browse For Folder" (SelectDirectory) */
export function browseForFolder(caption: string, initial?: string): Promise<string | null> {
  return showModal<string | null>(
    {
      title: T('浏览文件夹', 'Browse For Folder'),
      owner: mainWindowId(),
      clientW: 318,
      clientH: 380,
      dialog: true,
      render: (close) => <BrowseFolderBody caption={caption} initial={initial} close={close} />,
    },
    null,
  );
}

function BrowseFolderBody({ caption, initial, close }: { caption: string; initial?: string; close: (r: string | null) => void }) {
  const [sel, setSel] = useState(initial && vfs.dirExists(initial) ? vfs.realPath(initial) : DOCUMENTS_DIR);
  const [open, setOpen] = useState<Set<string>>(() => {
    const s = new Set<string>(['c:\\']);
    let cur = sel;
    while (cur && cur.length > 3) {
      s.add(cur.toLowerCase());
      cur = dirname(cur);
    }
    return s;
  });
  const [, setTick] = useState(0);
  useEffect(() => {
    const off = vfs.onChange(() => setTick((t) => t + 1));
    return () => {
      off();
    };
  }, []);
  const render = (path: string, depth: number): React.ReactNode => {
    const kids = vfs.list(path).filter((n) => n.dir);
    const isOpen = open.has(path.toLowerCase());
    return (
      <div key={path}>
        <div className={'bf-row' + (sel.toLowerCase() === path.toLowerCase() ? ' sel' : '')} style={{ paddingLeft: depth * 16 }} onPointerDown={() => setSel(path)} onDoubleClick={() => {
          const s = new Set(open);
          if (isOpen) s.delete(path.toLowerCase());
          else s.add(path.toLowerCase());
          setOpen(s);
        }}>
          <span className="bf-exp" onPointerDown={(e) => {
            e.stopPropagation();
            const s = new Set(open);
            if (isOpen) s.delete(path.toLowerCase());
            else s.add(path.toLowerCase());
            setOpen(s);
          }}>{kids.length ? (isOpen ? '▾' : '▸') : ''}</span>
          <FolderIcon open={isOpen} />
          <span>{path === 'C:\\' ? T('本地磁盘 (C:)', 'Local Disk (C:)') : basename(path)}</span>
        </div>
        {isOpen && kids.map((k) => render(k.path, depth + 1))}
      </div>
    );
  };
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div style={{ position: 'absolute', left: 12, top: 10, right: 12 }}>{caption}</div>
      <div className="bf-tree">{render('C:\\', 0)}</div>
      <Button caption={T('新建文件夹(&M)', '&Make New Folder')} style={{ position: 'absolute', left: 12, bottom: 12, width: 110, height: 23 }} onClick={() => {
        let n = T('新建文件夹', 'New folder');
        let i = 2;
        while (vfs.exists(joinPath(sel, n))) n = `${T('新建文件夹', 'New folder')} (${i++})`;
        vfs.mkdirs(joinPath(sel, n));
        setOpen(new Set([...open, sel.toLowerCase()]));
      }} />
      <Button caption={T('确定', 'OK')} isDefault style={{ position: 'absolute', right: 93, bottom: 12, width: 75, height: 23 }} onClick={() => close(sel)} />
      <Button caption={T('取消', 'Cancel')} style={{ position: 'absolute', right: 12, bottom: 12, width: 75, height: 23 }} onClick={() => close(null)} />
    </div>
  );
}
