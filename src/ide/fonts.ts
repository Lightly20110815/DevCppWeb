// Screen.Fonts: offer available fonts and load user-owned fonts into this browser.
import { vfs, DEVCPP_DIR, joinPath } from '../os/vfs';

export const BUNDLED_EDITOR_FONT = 'Consolas';
export const FALLBACK_EDITOR_FONT = 'Cascadia Mono';
const FONT_DIR = joinPath(DEVCPP_DIR, 'Fonts');
const importedFonts = new Set<string>();
const loadedBundledFonts = new Set<string>();
const CANDIDATES = [
  'Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Cambria', 'Cambria Math', 'Candara', 'Comic Sans MS', 'Consolas',
  'Constantia', 'Corbel', 'Courier', 'Courier New', 'Ebrima', 'Fixedsys', 'Franklin Gothic Medium', 'Gabriola', 'Gadugi',
  'Georgia', 'Impact', 'Ink Free', 'Javanese Text', 'Leelawadee UI', 'Lucida Console', 'Lucida Sans Unicode',
  'Malgun Gothic', 'Marlett', 'Microsoft Himalaya', 'Microsoft JhengHei', 'Microsoft New Tai Lue', 'Microsoft PhagsPa',
  'Microsoft Sans Serif', 'Microsoft Tai Le', 'Microsoft YaHei', 'Microsoft YaHei UI', 'Microsoft Yi Baiti', 'MingLiU-ExtB',
  'Mongolian Baiti', 'MS Gothic', 'MS Sans Serif', 'MS Serif', 'MV Boli', 'Myanmar Text', 'Nirmala UI', 'NSimSun',
  'Palatino Linotype', 'Segoe MDL2 Assets', 'Segoe Print', 'Segoe Script', 'Segoe UI', 'Segoe UI Emoji', 'Segoe UI Symbol',
  'SimHei', 'SimSun', 'SimSun-ExtB', 'Sitka Text', 'Sylfaen', 'Symbol', 'Tahoma', 'Terminal', 'Times New Roman',
  'Trebuchet MS', 'Verdana', 'Webdings', 'Wingdings', 'Yu Gothic', 'KaiTi', 'FangSong', 'DengXian', 'Source Code Pro',
  'Fira Code', 'JetBrains Mono', 'Cascadia Code', 'Cascadia Mono', 'DejaVu Sans Mono', 'Liberation Mono', 'Menlo',
  'Monaco', 'SF Mono', 'Ubuntu Mono', 'Noto Sans Mono', 'Hack', 'Inconsolata', 'PingFang SC', 'Hiragino Sans GB',
  'Helvetica', 'Helvetica Neue', 'Andale Mono', 'Osaka', 'Roboto Mono',
];

let cache: string[] | null = null;

export function screenFonts(): string[] {
  if (cache) return cache;
  const c = document.createElement('canvas').getContext('2d')!;
  const sample = 'mmmmmmmmmmlli1WQ@#';
  const base = ['monospace', 'serif', 'sans-serif'].map((b) => {
    c.font = `72px ${b}`;
    return c.measureText(sample).width;
  });
  const found: string[] = [];
  for (const f of CANDIDATES) {
    let ok = false;
    ['monospace', 'serif', 'sans-serif'].forEach((b, i) => {
      c.font = `72px "${f}", ${b}`;
      if (Math.abs(c.measureText(sample).width - base[i]) > 0.5) ok = true;
    });
    if (ok) found.push(f);
  }
  cache = [...new Set([...found, FALLBACK_EDITOR_FONT, ...loadedBundledFonts, ...importedFonts])].sort((a, b) => a.localeCompare(b));
  return cache;
}

export function defaultEditorFont() {
  const f = screenFonts();
  if (f.includes('Consolas')) return 'Consolas';
  return FALLBACK_EDITOR_FONT;
}

export function fontAvailable(name: string) {
  return screenFonts().some((font) => font.toLowerCase() === name.toLowerCase());
}

export function editorFontStack(name: string) {
  const requested = name.trim() || defaultEditorFont();
  return [...new Set([requested, BUNDLED_EDITOR_FONT, FALLBACK_EDITOR_FONT, 'Menlo', 'Monaco', 'Courier New'])].map((font) => JSON.stringify(font)).join(', ') + ', monospace';
}

export const fontSizePixels = (points: number) => Math.round(points * 96 / 72 * 100) / 100;

/** Read the actual family/style from a TTF/OTF, including Consolas' consola*.ttf files. */
function fontMetadata(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 12 || ![0x00010000, 0x4f54544f, 0x74727565].includes(view.getUint32(0))) throw new Error('Please select a TTF or OTF font file.');
  const tables = new Map<string, { offset: number; length: number }>();
  const count = view.getUint16(4);
  if (12 + count * 16 > bytes.length) throw new Error('Invalid font table directory.');
  for (let i = 0; i < count; i++) {
    const record = 12 + i * 16;
    const name = String.fromCharCode(...bytes.subarray(record, record + 4));
    const offset = view.getUint32(record + 8), length = view.getUint32(record + 12);
    if (offset + length > bytes.length) throw new Error('Invalid font table.');
    tables.set(name, { offset, length });
  }
  const names = tables.get('name');
  if (!names || names.length < 6) throw new Error('This font has no family name.');
  const start = names.offset, records = view.getUint16(start + 2), strings = start + view.getUint16(start + 4);
  if (6 + records * 12 > names.length) throw new Error('Invalid font names.');
  const values = new Map<number, { text: string; score: number }>();
  for (let i = 0; i < records; i++) {
    const record = start + 6 + i * 12;
    const platform = view.getUint16(record), language = view.getUint16(record + 4), id = view.getUint16(record + 6);
    if (![1, 2, 16, 17].includes(id) || ![0, 1, 3].includes(platform)) continue;
    const length = view.getUint16(record + 8), offset = strings + view.getUint16(record + 10);
    if (offset + length > start + names.length) continue;
    const text = new TextDecoder(platform === 1 ? 'macintosh' : 'utf-16be').decode(bytes.subarray(offset, offset + length)).replace(/[\x00-\x1f]/g, '').trim();
    const score = (platform === 3 ? 2 : 1) + (language === 0x409 ? 2 : 0);
    if (text && score > (values.get(id)?.score ?? -1)) values.set(id, { text, score });
  }
  const family = (values.get(16) ?? values.get(1))?.text;
  if (!family) throw new Error('This font has no family name.');
  const style = (values.get(17) ?? values.get(2))?.text ?? '';
  const os2 = tables.get('OS/2');
  const weight = os2 && os2.length >= 6 ? view.getUint16(os2.offset + 4) : /bold/i.test(style) ? 700 : 400;
  return { family, style: /italic|oblique/i.test(style) ? 'italic' : 'normal', weight: String(Math.max(1, Math.min(1000, weight))) };
}

async function loadFont(bytes: Uint8Array) {
  const { family, style, weight } = fontMetadata(bytes);
  const face = await new FontFace(JSON.stringify(family), bytes.slice().buffer as ArrayBuffer, { style, weight }).load();
  document.fonts.add(face); importedFonts.add(family); cache = null;
  return family;
}

export async function importEditorFont(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const family = await loadFont(bytes);
  vfs.write(joinPath(FONT_DIR, file.name), bytes);
  return family;
}

export async function initializeFonts() {
  await Promise.allSettled([
    // Load each real face before CodeMirror measures character widths. This also
    // makes Consolas available on machines without a system installation.
    ...['400', '700', 'italic 400', 'italic 700'].map((style) => document.fonts.load(`${style} 12px "${BUNDLED_EDITOR_FONT}"`).then((faces) => {
      if (faces.length) loadedBundledFonts.add(BUNDLED_EDITOR_FONT);
    })),
    document.fonts.load(`12px "${FALLBACK_EDITOR_FONT}"`),
    ...vfs.list(FONT_DIR).filter((node) => !node.dir && /\.(ttf|otf)$/i.test(node.path)).map((node) => loadFont(vfs.readBinary(node.path))),
  ]);
  cache = null;
}
