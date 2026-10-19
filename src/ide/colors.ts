// Delphi TColor helpers. Delphi stores colors as $00BBGGRR or as named constants.

const NAMED: Record<string, string> = {
  clblack: '#000000', clmaroon: '#800000', clgreen: '#008000', clolive: '#808000',
  clnavy: '#000080', clpurple: '#800080', clteal: '#008080', clgray: '#808080',
  clsilver: '#c0c0c0', clred: '#ff0000', cllime: '#00ff00', clyellow: '#ffff00',
  clblue: '#0000ff', clfuchsia: '#ff00ff', claqua: '#00ffff', clwhite: '#ffffff',
  clltgray: '#c0c0c0', cldkgray: '#808080', clmoneygreen: '#c0dcc0', clskyblue: '#a6caf0',
  clcream: '#fffbf0', clmedgray: '#a4a0a0',
  // Windows 10 system colors
  clhighlight: '#0078d7', clhighlighttext: '#ffffff', clbtnface: '#f0f0f0', clwindow: '#ffffff',
  clwindowtext: '#000000', clgraytext: '#6d6d6d', clbtnshadow: '#a0a0a0', clbtnhighlight: '#ffffff',
  cl3dlight: '#e3e3e3', cl3ddkshadow: '#696969', clinfobk: '#ffffe1', clinfotext: '#000000',
  clmenu: '#f0f0f0', clmenutext: '#000000', clactivecaption: '#99b4d1', clinactivecaption: '#bfcddb',
  clappworkspace: '#ababab', clscrollbar: '#c8c8c8', clbackground: '#000000', clcaptiontext: '#000000',
  clwindowframe: '#646464', clhotlight: '#0066cc', clgradientactivecaption: '#b9d1ea',
  clgradientinactivecaption: '#d7e4f2', clmenuhighlight: '#3399ff', clmenubar: '#f0f0f0',
};

export const NAMED_ORDER = [
  'clBlack', 'clMaroon', 'clGreen', 'clOlive', 'clNavy', 'clPurple', 'clTeal', 'clGray', 'clSilver',
  'clRed', 'clLime', 'clYellow', 'clBlue', 'clFuchsia', 'clAqua', 'clWhite', 'clMoneyGreen',
  'clSkyBlue', 'clCream', 'clMedGray',
];

/** Converts a Delphi color string ("clRed", "$00FF6633", "16777215", "clNone") to CSS, or null for clNone/clDefault */
export function delphiColor(s: string | undefined | null): string | null {
  if (!s) return null;
  const v = s.trim();
  const low = v.toLowerCase();
  if (low === 'clnone' || low === 'cldefault') return null;
  if (NAMED[low]) return NAMED[low];
  let n: number;
  if (v.startsWith('$')) n = parseInt(v.slice(1), 16);
  else if (/^-?\d+$/.test(v)) n = parseInt(v, 10);
  else return null;
  if (n < 0) return null;
  if (n === 0x1fffffff || n === 0x20000000) return null;
  n &= 0xffffff; // drop palette flags
  const r = n & 0xff;
  const g = (n >> 8) & 0xff;
  const b = (n >> 16) & 0xff;
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** CSS #rrggbb -> Delphi color string (named when possible) */
export function toDelphiColor(css: string | null): string {
  if (!css) return 'clNone';
  const c = css.toLowerCase();
  for (const name of NAMED_ORDER) if (NAMED[name.toLowerCase()] === c) return name;
  const r = parseInt(c.slice(1, 3), 16);
  const g = parseInt(c.slice(3, 5), 16);
  const b = parseInt(c.slice(5, 7), 16);
  return '$00' + [b, g, r].map((x) => x.toString(16).toUpperCase().padStart(2, '0')).join('');
}

export function namedColorCss(name: string) {
  return NAMED[name.toLowerCase()] ?? '#000000';
}
