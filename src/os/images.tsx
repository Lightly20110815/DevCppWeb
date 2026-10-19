// Image lists extracted from DataFrm.dfm (TImageList), rendered as CSS sprites.
import { useSyncExternalStore } from 'react';

const BASE = import.meta.env.BASE_URL + 'devcpp/images/';

type ListName = 'menu' | 'project' | 'class' | 'gutter' | string;

let theme = 'New Look';
let version = 0;
const listeners = new Set<() => void>();

export const ICON_THEMES = ['New Look', 'Gnome', 'Blue'];

export function setIconTheme(t: string) {
  theme = ICON_THEMES.includes(t) ? t : 'New Look';
  version++;
  for (const l of listeners) l();
}

export function iconTheme() {
  return theme;
}

function themeSuffix(t = theme) {
  return t === 'Gnome' ? 'Gnome' : t === 'Blue' ? 'Blue' : 'NewLook';
}

export function listUrl(list: ListName, t?: string) {
  switch (list) {
    case 'menu':
      return BASE + `MenuImages_${themeSuffix(t)}.png`;
    case 'project':
      return BASE + `ProjectImage_${themeSuffix(t)}.png`;
    case 'class':
      return BASE + 'ClassImages.png';
    case 'gutter':
      return BASE + 'GutterImages.png';
    default:
      // a DFM reference such as "dmMain.MenuImages_NewLook"
      if (list.startsWith('dmMain.MenuImages')) return listUrl('menu', t);
      if (list.startsWith('dmMain.ProjectImage')) return listUrl('project', t);
      if (list === 'dmMain.ClassImages') return listUrl('class', t);
      return BASE + list.replace(/^dmMain\./, '') + '.png';
  }
}

export function useIconTheme() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
}

export function ImgIdx({ list, index, disabled, size = 16, h, forceTheme, className }: {
  list: ListName;
  index: number;
  disabled?: boolean;
  size?: number;
  h?: number;
  forceTheme?: string;
  className?: string;
}) {
  useIconTheme();
  if (index < 0) return <span className="imgidx" style={{ width: size, height: h ?? size }} />;
  const w = list === 'gutter' ? 11 : size;
  const hh = list === 'gutter' ? 14 : h ?? size;
  return (
    <span
      className={'imgidx' + (disabled ? ' disabled' : '') + (className ? ' ' + className : '')}
      style={{
        width: w,
        height: hh,
        backgroundImage: `url("${listUrl(list, forceTheme)}")`,
        backgroundPosition: `${-index * w}px 0`,
      }}
    />
  );
}

export const iconUrl = (name: string) => import.meta.env.BASE_URL + 'devcpp/' + name;
export const DEVCPP_ICON = iconUrl('icons/devcpp_16.png');
export const DEVCPP_ICON_32 = iconUrl('icons/devcpp_32.png');
