import { extname } from './vfs';
import { iconUrl } from './images';

export const FOLDER_ICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1 3.5h5l1.5 1.5H15v8.5H1z" fill="#e8b84a" stroke="#c8962a" stroke-width=".8"/><path d="M1 6h14v7.5H1z" fill="#ffd769" stroke="#d6a43a" stroke-width=".6"/></svg>');

export function fileIcon(name: string, dir: boolean, big = false, size = big ? 32 : 16): string | null {
  if (dir) return null;
  const e = extname(name).toLowerCase().slice(1);
  const map: Record<string, string> = {
    c: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', 'c++': 'cpp', h: 'h', hpp: 'hpp', hh: 'hpp', rc: 'rc', dev: 'dev',
    template: 'template', o: 'o', obj: 'obj', devpak: 'devpak',
  };
  const iconSize = e === 'o' && size === 48 ? 32 : size;
  return map[e] ? iconUrl(`icons/${map[e]}_${iconSize}.png`) : null;
}

export function FolderIcon({ size = 16, open = false }: { size?: number; open?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1 3.5h5l1.5 1.5H15v8.5H1z" fill="#e8b84a" stroke="#c8962a" strokeWidth=".8" />
      <path d={open ? 'M1 13.5l2-6h13l-2 6z' : 'M1 6h14v7.5H1z'} fill="#ffd769" stroke="#d6a43a" strokeWidth=".6" />
    </svg>
  );
}

export function GenericFileIcon({ size = 16, exe = false }: { size?: number; exe?: boolean }) {
  if (exe) return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" fill="#fff" stroke="#6b7c93" />
      <rect x="1.5" y="2.5" width="13" height="2.5" fill="#3b78d8" />
      <rect x="3.5" y="7" width="5" height="1.2" fill="#9aa" />
      <rect x="3.5" y="9.5" width="7" height="1.2" fill="#9aa" />
    </svg>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 1.5h6l3 3v10h-9z" fill="#fff" stroke="#8a8a8a" />
      <path d="M9.5 1.5v3h3" fill="none" stroke="#8a8a8a" />
    </svg>
  );
}

export function ItemIcon({ name, dir, big, size = big ? 32 : 16 }: { name: string; dir: boolean; big?: boolean; size?: 16 | 32 | 48 }) {
  if (dir) return <FolderIcon size={size} />;
  const u = fileIcon(name, dir, size > 16, size);
  if (u) return <img src={u} width={size} height={size} alt="" draggable={false} />;
  return <GenericFileIcon size={size} exe={/\.(exe|wasm)$/i.test(name)} />;
}
