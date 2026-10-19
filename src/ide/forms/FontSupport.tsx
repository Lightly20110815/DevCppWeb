import { useRef, useState } from 'react';
import { useFormCtl } from '../../vcl/FormCtl';
import type { FormCtl } from '../../vcl/FormCtl';
import { Button } from '../../vcl/controls';
import { Lang } from '../../lang/lang';
import { BUNDLED_EDITOR_FONT, FALLBACK_EDITOR_FONT, editorFontStack, fontAvailable, importEditorFont, screenFonts } from '../fonts';
import { ide } from '../ide';

export function FontSupport({ ctl }: { ctl: FormCtl }) {
  useFormCtl(ctl);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const name = ctl.text('cboEditorFont');
  const missing = !fontAvailable(name);
  const fallback = fontAvailable(BUNDLED_EDITOR_FONT) ? BUNDLED_EDITOR_FONT : FALLBACK_EDITOR_FONT;
  const importFonts = async (files: File[]) => {
    setBusy(true); setError('');
    try {
      let family = '';
      for (const file of files) family = await importEditorFont(file);
      if (family) {
        const fonts = screenFonts();
        ctl.set('cboEditorFont', { items: fonts, text: family, itemIndex: fonts.indexOf(family) });
        ctl.set('cboGutterFont', { items: fonts });
        ctl.fire('cboEditorFont', 'Change');
        for (const editor of ide.allEditors) { editor.applySettings(); editor.view.requestMeasure(); }
      }
    } catch (error) { setError(String((error as Error).message ?? error)); }
    finally { setBusy(false); }
  };
  const message = missing
    ? Lang.isChinese ? `${name} 不可用，当前使用 ${fallback}。可导入本地字体。` : `${name} is unavailable. Using ${fallback}. You can import a local font.`
    : 'AaBb 0123456789 {} [] ()';
  return <div className="font-support">
    <span role="status" title={error || message} style={{ color: error || missing ? '#8b4513' : undefined, fontFamily: error || missing ? undefined : editorFontStack(name) }}>{error || message}</span>
    <Button caption={busy ? Lang.isChinese ? '正在导入…' : 'Importing…' : Lang.isChinese ? '导入字体…' : 'Import font…'} disabled={busy} onClick={() => input.current?.click()} />
    <input ref={input} type="file" accept=".ttf,.otf" multiple hidden aria-label={Lang.isChinese ? '选择本地字体文件' : 'Choose local font files'} onChange={(event) => {
      const files = Array.from(event.target.files ?? []); event.target.value = '';
      if (files.length) void importFonts(files);
    }} />
  </div>;
}
