// Renders a Delphi form (parsed DFM) with absolute positioning and VCL alignment rules.
import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { FormCtl, useFormCtl, mrCancel } from './FormCtl';
import type { DfmNode } from './FormCtl';
import {
  Button, CheckBox, Radio, Edit, Memo, ComboBox, SpinEdit, GroupBox, ListBox, ListView, TreeView,
  TabStrip, TrackBar, ProgressBar, Bevel,
} from './controls';
import { Accel } from '../os/menu';
import { ImgIdx, iconUrl } from '../os/images';
import { delphiColor, NAMED_ORDER, namedColorCss } from '../ide/colors';
import { showModal, wm } from '../os/wm';
import type { WinOptions } from '../os/wm';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const NON_VISUAL = new Set([
  'TImageList', 'TOpenDialog', 'TSaveDialog', 'TOpenPictureDialog', 'TTimer', 'TPopupMenu', 'TMenuItem',
  'TMainMenu', 'TActionList', 'TAction', 'TSynCppSyn', 'TSynRCSyn', 'TFontDialog', 'TColorDialog',
  'TPrintDialog', 'TPrinterSetupDialog', 'TFindDialog', 'TCppParser', 'TCppTokenizer', 'TCppPreprocessor',
  'TdevShortcuts', 'TDdeServerConv', 'TdevFileMonitor', 'TCodeCompletion', 'TApplicationEvents',
]);

const TAB_H = 24;
export const SHEET_INSET = { x: 4, y: TAB_H + 2, w: 8, h: TAB_H + 6 };

function num(v: unknown, d = 0) {
  return v === undefined || v === null || v === '' ? d : Number(v);
}

/** Computes child rectangles following VCL's alignment order */
export function layoutChildren(ctl: FormCtl, children: DfmNode[], W: number, H: number, designW: number, designH: number, contentTop = 0): Map<string, Rect> {
  const out = new Map<string, Rect>();
  const client = { l: 0, t: contentTop, r: W, b: H };
  const visible = children.filter((c) => !NON_VISUAL.has(c.class) && c.class !== 'TTabSheet' && ctl.get(c.name).visible !== false);
  const rectOf = (c: DfmNode): Rect => {
    const s = ctl.get(c.name);
    const p = c.props;
    return {
      x: s.left ?? num(p.Left),
      y: s.top ?? num(p.Top),
      w: s.width ?? num(p.Width, 100),
      h: s.height ?? num(p.Height, 20),
    };
  };
  const by = (a: string) => visible.filter((c) => c.props.Align === a);
  for (const c of by('alTop').sort((a, b) => rectOf(a).y - rectOf(b).y)) {
    const r = rectOf(c);
    out.set(c.name, { x: client.l, y: client.t, w: client.r - client.l, h: r.h });
    client.t += r.h;
  }
  for (const c of by('alBottom').sort((a, b) => rectOf(b).y - rectOf(a).y)) {
    const r = rectOf(c);
    out.set(c.name, { x: client.l, y: client.b - r.h, w: client.r - client.l, h: r.h });
    client.b -= r.h;
  }
  for (const c of by('alLeft').sort((a, b) => rectOf(a).x - rectOf(b).x)) {
    const r = rectOf(c);
    out.set(c.name, { x: client.l, y: client.t, w: r.w, h: client.b - client.t });
    client.l += r.w;
  }
  for (const c of by('alRight').sort((a, b) => rectOf(b).x - rectOf(a).x)) {
    const r = rectOf(c);
    out.set(c.name, { x: client.r - r.w, y: client.t, w: r.w, h: client.b - client.t });
    client.r -= r.w;
  }
  for (const c of by('alClient')) out.set(c.name, { x: client.l, y: client.t, w: client.r - client.l, h: client.b - client.t });
  const dw = W - designW;
  const dh = H - designH;
  for (const c of visible) {
    if (out.has(c.name)) continue;
    const r = rectOf(c);
    const anchors = String(c.props.Anchors ?? '[akLeft, akTop]');
    const aL = anchors.includes('akLeft');
    const aR = anchors.includes('akRight');
    const aT = anchors.includes('akTop');
    const aB = anchors.includes('akBottom');
    if (aR && aL) r.w += dw;
    else if (aR) r.x += dw;
    if (aB && aT) r.h += dh;
    else if (aB) r.y += dh;
    out.set(c.name, r);
  }
  return out;
}

function fontStyle(n: DfmNode, ctl: FormCtl): CSSProperties {
  const p = n.props;
  const s = ctl.get(n.name);
  const st: CSSProperties = {};
  if (p.ParentFont === 'False' || p['Font.Style'] || p['Font.Color'] || s.fontColor || s.fontBold) {
    const style = String(p['Font.Style'] ?? '');
    if (style.includes('fsBold') || s.fontBold) st.fontWeight = 'bold';
    if (style.includes('fsItalic')) st.fontStyle = 'italic';
    if (style.includes('fsUnderline')) st.textDecoration = 'underline';
    const c = s.fontColor ?? delphiColor(p['Font.Color']);
    if (c && p['Font.Color'] !== 'clWindowText' && p['Font.Color'] !== 'clBtnText') st.color = c;
    else if (s.fontColor) st.color = s.fontColor;
    if (p['Font.Name'] && /courier|consolas|fixedsys/i.test(p['Font.Name'])) st.fontFamily = 'Consolas, "Courier New", monospace';
    if (p['Font.Height'] && p.ParentFont === 'False') {
      const fh = Math.abs(num(p['Font.Height']));
      if (fh && fh !== 11 && fh !== 12) st.fontSize = fh;
    }
  }
  if (s.fontName) st.fontFamily = s.fontName;
  if (s.fontSize) st.fontSize = s.fontSize;
  return st;
}

function Glyph({ n }: { n: DfmNode }) {
  const g = n.props['Glyph.Data'];
  const kind = n.props.Kind as string | undefined;
  if (g && g.$img) {
    const numGlyphs = num(n.props.NumGlyphs, 1);
    const w = Math.round(g.w / numGlyphs);
    return <span className="vglyph" style={{ width: w, height: g.h, backgroundImage: `url("${iconUrl(g.$img)}")`, backgroundSize: `${g.w}px ${g.h}px` }} />;
  }
  if (kind) return <KindGlyph kind={kind} />;
  return null;
}

export function KindGlyph({ kind }: { kind: string }) {
  switch (kind) {
    case 'bkOK':
    case 'bkYes':
      return (
        <svg className="vglyph" width="16" height="16" viewBox="0 0 16 16"><path d="M2.5 8.5l3.5 3.5 7.5-8" fill="none" stroke="#1a9b1a" strokeWidth="2.2" /></svg>
      );
    case 'bkCancel':
    case 'bkNo':
    case 'bkAbort':
      return (
        <svg className="vglyph" width="16" height="16" viewBox="0 0 16 16"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="#d01818" strokeWidth="2.2" /></svg>
      );
    case 'bkHelp':
      return (
        <svg className="vglyph" width="16" height="16" viewBox="0 0 16 16"><text x="3.5" y="13.5" fontSize="14" fontWeight="bold" fill="#1d4fbf">?</text></svg>
      );
    case 'bkClose':
      return (
        <svg className="vglyph" width="16" height="16" viewBox="0 0 16 16"><path d="M3 2h7v12H3z" fill="#c8a060" stroke="#6b4a1c" /><path d="M10 8h5M13 6l2 2-2 2" stroke="#000" fill="none" /></svg>
      );
    default:
      return null;
  }
}

function TColorBoxCtl({ n, ctl, style, disabled }: { n: DfmNode; ctl: FormCtl; style: CSSProperties; disabled: boolean }) {
  const s = ctl.get(n.name);
  const names = [...NAMED_ORDER, 'clNone', 'Custom...'];
  const cur = s.colorValue ?? null;
  let idx = names.findIndex((nm) => (nm === 'clNone' ? cur === null : namedColorCss(nm) === cur));
  if (idx < 0) idx = names.length - 1;
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <ComboBox
        items={names.map((nm) => (nm === 'Custom...' && cur ? cur.toUpperCase() : nm))}
        index={idx}
        disabled={disabled}
        style={style}
        itemHeight={16}
        maxItems={12}
        renderItem={(i) => (
          <span className="colorbox-item">
            <span className="colorbox-swatch" style={{ background: names[i] === 'Custom...' ? cur ?? '#fff' : names[i] === 'clNone' ? 'transparent' : namedColorCss(names[i]) }} />
            {names[i] === 'Custom...' ? (idx === i && cur ? cur.toUpperCase() : 'Custom...') : names[i]}
          </span>
        )}
        onChange={(i) => {
          if (names[i] === 'Custom...') {
            inputRef.current?.click();
            return;
          }
          ctl.set(n.name, { colorValue: names[i] === 'clNone' ? undefined : namedColorCss(names[i]) });
          if (names[i] === 'clNone') ctl.set(n.name, { colorValue: undefined });
          ctl.fire(n.name, 'Change');
        }}
      />
      <input
        ref={inputRef}
        type="color"
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', left: style.left, top: style.top, width: 1, height: 1 }}
        value={cur ?? '#000000'}
        onChange={(e) => {
          ctl.set(n.name, { colorValue: e.target.value });
          ctl.fire(n.name, 'Change');
        }}
      />
    </>
  );
}

export interface ResolvedAction {
  caption: string;
  enabled: boolean;
  execute: () => void;
  imageIndex: number;
}
let actionResolver: ((name: string) => ResolvedAction | null) | null = null;
export function setActionResolver(r: (name: string) => ResolvedAction | null) {
  actionResolver = r;
}

function Control({ n, ctl, rect, designW, designH }: { n: DfmNode; ctl: FormCtl; rect: Rect; designW?: number; designH?: number }) {
  const s = ctl.get(n.name);
  const act = n.props.Action && actionResolver ? actionResolver(n.props.Action) : null;
  if (act && (n.class === 'TButton' || n.class === 'TSpeedButton' || n.class === 'TBitBtn')) {
    const style: CSSProperties = { position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h };
    return (
      <Button
        caption={act.caption}
        glyph={n.props['Glyph.Data'] ? <Glyph n={n} /> : undefined}
        disabled={!act.enabled}
        style={style}
        className={n.class === 'TSpeedButton' ? 'speed' : ''}
        onClick={act.execute}
      />
    );
  }
  const p = n.props;
  const disabled = s.enabled === false || isParentDisabled(ctl, n.name);
  const style: CSSProperties = { position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, ...fontStyle(n, ctl) };
  const custom = s.render;
  if (custom) return <div className="vcustom" style={style}>{custom()}</div>;
  const children = (W: number, H: number, dW = num(p.Width, W), dH = num(p.Height, H)) => <Children ctl={ctl} parent={n} W={W} H={H} designW={dW} designH={dH} />;

  switch (n.class) {
    case 'TLabel':
    case 'TStaticText': {
      const autoSize = p.AutoSize !== 'False';
      const wrap = p.WordWrap === 'True';
      const align = p.Alignment === 'taCenter' ? 'center' : p.Alignment === 'taRightJustify' ? 'right' : 'left';
      const ls: CSSProperties = { ...style, textAlign: align };
      if (autoSize && !wrap) {
        ls.width = 'auto';
        ls.height = 'auto';
        if (align === 'right') {
          ls.left = undefined;
          ls.right = undefined;
        }
      }
      const link = s.data?.link as (() => void) | undefined;
      const color = delphiColor(p.Color);
      if (p.Transparent === 'False' && color && p.Color !== 'clBtnFace') ls.background = color;
      if (p.Layout === 'tlCenter') {
        ls.display = 'flex';
        ls.alignItems = 'center';
        ls.justifyContent = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
      }
      return (
        <div
          className={'vlabel' + (wrap ? ' wrap' : '') + (disabled ? ' disabled' : '') + (link ? ' link' : '')}
          style={ls}
          onClick={() => {
            link?.();
            ctl.fire(n.name, 'Click');
          }}
          onDoubleClick={() => ctl.fire(n.name, 'DblClick')}
        >
          <Accel text={s.caption ?? ''} />
        </div>
      );
    }
    case 'TButton':
    case 'TBitBtn':
    case 'TSpeedButton': {
      const isDefault = p.Default === 'True' || (n.class === 'TBitBtn' && p.Kind === 'bkOK' && p.Default !== 'False');
      const flat = n.class === 'TSpeedButton' && p.Flat === 'True';
      let caption = s.caption ?? '';
      if (n.class === 'TBitBtn' && s.caption === undefined) {
        const k = p.Kind;
        caption = k === 'bkOK' ? 'OK' : k === 'bkCancel' ? 'Cancel' : k === 'bkHelp' ? '&Help' : k === 'bkClose' ? '&Close' : k === 'bkYes' ? '&Yes' : k === 'bkNo' ? '&No' : '';
      }
      return (
        <Button
          caption={caption}
          glyph={<Glyph n={n} />}
          isDefault={isDefault}
          disabled={disabled}
          flat={flat}
          down={n.class === 'TSpeedButton' && s.checked}
          style={style}
          title={p.ShowHint === 'True' ? s.hint : undefined}
          className={n.class === 'TSpeedButton' ? 'speed' : ''}
          onClick={() => ctl.click(n.name)}
        />
      );
    }
    case 'TCheckBox':
      return (
        <CheckBox
          caption={s.caption ?? ''}
          checked={!!s.checked}
          disabled={disabled}
          wordWrap={s.wordWrap ?? p.WordWrap === 'True'}
          style={style}
          onChange={(v) => {
            ctl.set(n.name, { checked: v });
            ctl.fire(n.name, 'Click');
          }}
        />
      );
    case 'TRadioButton':
      return (
        <Radio
          caption={s.caption ?? ''}
          checked={!!s.checked}
          disabled={disabled}
          wordWrap={s.wordWrap ?? p.WordWrap === 'True'}
          style={style}
          onChange={() => {
            // uncheck siblings
            const parent = ctl.parents.get(n.name);
            const sibs = parent ? ctl.node(parent)!.children : [];
            for (const sb of sibs) if (sb.class === 'TRadioButton' && sb.name !== n.name) ctl.get(sb.name).checked = false;
            ctl.set(n.name, { checked: true });
            ctl.fire(n.name, 'Click');
          }}
        />
      );
    case 'TEdit':
    case 'TMaskEdit':
    case 'TLabeledEdit':
      return (
        <Edit
          value={s.text ?? ''}
          disabled={disabled}
          readOnly={s.readOnly}
          password={!!p.PasswordChar && p.PasswordChar !== '#0'}
          style={style}
          onChange={(v) => {
            ctl.set(n.name, { text: v });
            ctl.fire(n.name, 'Change');
          }}
          onKeyDown={(e) => ctl.fire(n.name, 'KeyPress', e)}
          onFocus={() => ctl.fire(n.name, 'Enter')}
        />
      );
    case 'TMemo':
    case 'TRichEdit':
      return (
        <Memo
          value={s.lines ? s.lines.join('\n') : s.text ?? ''}
          disabled={disabled}
          readOnly={s.readOnly}
          wrap={p.WordWrap !== 'False'}
          mono={/courier|consolas/i.test(String(p['Font.Name'] ?? ''))}
          scroll={p.ScrollBars}
          style={style}
          onChange={(v) => {
            ctl.set(n.name, { lines: v.split('\n'), text: v });
            ctl.fire(n.name, 'Change');
          }}
        />
      );
    case 'TComboBox': {
      const editable = p.Style !== 'csDropDownList' && p.Style !== 'csOwnerDrawFixed' && p.Style !== 'csOwnerDrawVariable';
      const items = s.items ?? [];
      return (
        <ComboBox
          items={items}
          index={s.itemIndex ?? -1}
          text={s.text}
          editable={editable}
          disabled={disabled}
          style={{ ...style, height: undefined }}
          renderItem={s.data?.renderItem}
          itemHeight={s.data?.itemHeight}
          maxItems={num(p.DropDownCount, 8)}
          onDropDown={() => ctl.fire(n.name, 'DropDown')}
          onChange={(i) => {
            ctl.set(n.name, { itemIndex: i, text: items[i] });
            ctl.fire(n.name, 'Change');
            ctl.fire(n.name, 'Select');
          }}
          onTextChange={(t) => {
            ctl.set(n.name, { text: t, itemIndex: items.indexOf(t) });
            ctl.fire(n.name, 'Change');
          }}
          onKeyDown={(e) => ctl.fire(n.name, 'KeyPress', e)}
        />
      );
    }
    case 'TColorBox':
      return <TColorBoxCtl n={n} ctl={ctl} style={style} disabled={disabled} />;
    case 'TSpinEdit':
      return (
        <SpinEdit
          value={s.value ?? 0}
          min={s.minValue}
          max={s.maxValue}
          disabled={disabled}
          style={style}
          onChange={(v) => {
            ctl.set(n.name, { value: v });
            ctl.fire(n.name, 'Change');
          }}
        />
      );
    case 'TGroupBox':
      return (
        <div style={style} className={disabled ? 'vdisabled-tree' : ''}>
          <GroupBox caption={s.caption ?? ''} style={{ position: 'absolute', inset: 0 }} />
          {children(rect.w, rect.h)}
        </div>
      );
    case 'TRadioGroup': {
      const items = s.items ?? [];
      const cols = Math.max(1, num(p.Columns, 1));
      const rows = Math.ceil(items.length / cols);
      const top = 16;
      const ih = rows ? (rect.h - top - 4) / rows : 0;
      const cw = (rect.w - 16) / cols;
      return (
        <div style={style} className={disabled ? 'vdisabled-tree' : ''}>
          <GroupBox caption={s.caption ?? ''} style={{ position: 'absolute', inset: 0 }} />
          {items.map((it, i) => (
            <Radio
              key={i}
              caption={it}
              checked={s.itemIndex === i}
              disabled={disabled}
              style={{ position: 'absolute', left: 8 + Math.floor(i / rows) * cw, top: top + (i % rows) * ih + Math.max(0, (ih - 17) / 2), width: cw - 4, height: 17 }}
              onChange={() => {
                ctl.set(n.name, { itemIndex: i });
                ctl.fire(n.name, 'Click');
              }}
            />
          ))}
        </div>
      );
    }
    case 'TPanel': {
      const color = s.color ?? delphiColor(p.Color);
      const bevel = p.BevelOuter === 'bvNone' ? '' : p.BevelOuter === 'bvLowered' ? ' lowered' : ' raised';
      return (
        <div className={'vpanel' + bevel} style={{ ...style, background: color && p.Color !== 'clBtnFace' ? color : undefined }}>
          {s.caption && p.ShowCaption !== 'False' && n.children.length === 0 && <div className="vpanel-cap">{s.caption}</div>}
          {children(rect.w, rect.h)}
        </div>
      );
    }
    case 'TBevel':
      return <Bevel shape={p.Shape} style={style} />;
    case 'TShape':
      return <div style={{ ...style, background: delphiColor(p['Brush.Color']) ?? '#fff', border: '1px solid ' + (delphiColor(p['Pen.Color']) ?? '#000') }} />;
    case 'TImage': {
      const pic = p['Picture.Data'];
      const src = s.imgSrc ?? (pic?.$img ? iconUrl(pic.$img) : undefined);
      if (!src) return <div style={style} />;
      const stretch = p.Stretch === 'True';
      const center = p.Center === 'True';
      return (
        <div style={{ ...style, overflow: 'hidden', display: center ? 'flex' : undefined, alignItems: 'center', justifyContent: 'center' }} onClick={() => ctl.fire(n.name, 'Click')}>
          <img src={src} alt="" draggable={false} style={stretch ? { width: '100%', height: '100%', objectFit: p.Proportional === 'True' ? 'contain' : 'fill' } : undefined} />
        </div>
      );
    }
    case 'TListBox':
    case 'TCheckListBox':
      return (
        <ListBox
          items={s.items ?? []}
          index={s.itemIndex ?? -1}
          disabled={disabled}
          multi={p.MultiSelect === 'True'}
          selSet={s.selSet}
          onSelSet={(v) => ctl.set(n.name, { selSet: v })}
          checks={n.class === 'TCheckListBox' ? s.checkedItems ?? (s.items ?? []).map(() => false) : undefined}
          onCheck={(i, v) => {
            const arr = [...(s.checkedItems ?? (s.items ?? []).map(() => false))];
            arr[i] = v;
            ctl.set(n.name, { checkedItems: arr });
            ctl.fire(n.name, 'ClickCheck', i);
          }}
          itemHeight={num(p.ItemHeight, 15) || 15}
          renderItem={s.data?.renderItem}
          style={style}
          onChange={(i) => {
            ctl.set(n.name, { itemIndex: i });
            ctl.fire(n.name, 'Click');
          }}
          onDblClick={() => ctl.fire(n.name, 'DblClick')}
          onKeyDown={(e) => ctl.fire(n.name, 'KeyDown', e)}
        />
      );
    case 'TListView': {
      const cols = s.columns ?? (Array.isArray(p.Columns) ? p.Columns.map((c: any) => ({ caption: c?.Caption ?? '', width: num(c?.Width, 50), autoSize: c?.AutoSize === 'True' })) : undefined);
      return (
        <ListView
          columns={cols}
          items={s.lvItems ?? []}
          sel={s.selIndex ?? -1}
          gridLines={p.GridLines === 'True'}
          viewStyle={p.ViewStyle ?? 'vsIcon'}
          checkboxes={p.Checkboxes === 'True'}
          showHeader={p.ShowColumnHeaders !== 'False'}
          imageList={s.data?.imageList}
          largeIcon={s.data?.largeIcon}
          renderCell={s.data?.renderCell}
          rowColor={s.data?.rowColor}
          style={style}
          onSel={(i) => {
            ctl.set(n.name, { selIndex: i });
            ctl.fire(n.name, 'SelectItem', i);
            ctl.fire(n.name, 'Change', i);
            ctl.fire(n.name, 'Click', i);
          }}
          onCheck={(i, v) => {
            const items = [...(s.lvItems ?? [])];
            items[i] = { ...items[i], checked: v };
            ctl.set(n.name, { lvItems: items });
            ctl.fire(n.name, 'ItemChecked', i, v);
          }}
          onDblClick={(i) => ctl.fire(n.name, 'DblClick', i)}
          onKeyDown={(e) => ctl.fire(n.name, 'KeyDown', e)}
        />
      );
    }
    case 'TTreeView':
      return (
        <TreeView
          nodes={s.nodes ?? []}
          selected={s.selNode ?? null}
          imageList={s.data?.imageList}
          style={style}
          showLines={p.ShowLines !== 'False'}
          onSelect={(nd) => {
            ctl.set(n.name, { selNode: nd });
            ctl.fire(n.name, 'Change', nd);
          }}
          onDblClick={(nd) => ctl.fire(n.name, 'DblClick', nd)}
        />
      );
    case 'TPageControl': {
      const sheets = n.children.filter((c) => c.class === 'TTabSheet' && ctl.get(c.name).tabVisible !== false);
      const active = ctl.activePageOf(n.name);
      const ai = sheets.findIndex((c) => c.name === active);
      const sheetW = rect.w - SHEET_INSET.w;
      const sheetH = rect.h - SHEET_INSET.h;
      const designSheetW = num(p.Width, rect.w) - SHEET_INSET.w;
      const designSheetH = num(p.Height, rect.h) - SHEET_INSET.h;
      return (
        <div className="vpagecontrol" style={style}>
          <TabStrip
            tabs={sheets.map((c) => ctl.get(c.name).caption ?? '')}
            index={ai}
            images={sheets.map((c) => (p.Images ? num(c.props.ImageIndex, -1) : undefined))}
            imageList={p.Images}
            onChange={(i) => {
              ctl.setActivePage(n.name, sheets[i].name);
            }}
          />
          <div className="vpage" style={{ left: 0, top: TAB_H - 1, width: rect.w, height: rect.h - TAB_H + 1 }}>
            {sheets.map((sh) => (
              <div key={sh.name} className="vsheet" style={{ display: sh.name === active ? 'block' : 'none', left: SHEET_INSET.x, top: SHEET_INSET.y - TAB_H + 1, width: sheetW, height: sheetH }}>
                <Children ctl={ctl} parent={sh} W={sheetW} H={sheetH} designW={designSheetW} designH={designSheetH} />
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'TTabControl': {
      const tabs = s.tabs ?? [];
      return (
        <div className="vpagecontrol" style={style}>
          <TabStrip
            tabs={tabs}
            index={s.tabIndex ?? 0}
            onChange={(i) => {
              ctl.set(n.name, { tabIndex: i });
              ctl.fire(n.name, 'Change', i);
            }}
          />
          <div className="vpage" style={{ left: 0, top: TAB_H - 1, width: rect.w, height: rect.h - TAB_H + 1 }} />
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <div style={{ pointerEvents: 'auto' }}><Children ctl={ctl} parent={n} W={rect.w} H={rect.h} designW={num(p.Width, rect.w)} designH={num(p.Height, rect.h)} contentTop={TAB_H + 2} /></div>
          </div>
        </div>
      );
    }
    case 'TTrackBar':
      return (
        <TrackBar
          value={s.position ?? 0}
          min={s.minValue ?? 0}
          max={s.maxValue ?? 10}
          disabled={disabled}
          style={style}
          onChange={(v) => {
            ctl.set(n.name, { position: v });
            ctl.fire(n.name, 'Change');
          }}
        />
      );
    case 'TProgressBar':
      return <ProgressBar position={s.position ?? 0} min={s.minValue ?? 0} max={s.maxValue ?? 100} style={style} />;
    case 'TStringGrid':
    case 'TValueListEditor':
      return <GridCtl n={n} ctl={ctl} style={style} />;
    case 'TToolBar':
      return (
        <div className="vtoolbar" style={{ ...style, padding: num(p.BorderWidth) }}>
          {n.children
            .filter((c) => c.class === 'TToolButton')
            .map((b) => {
              const bs = ctl.get(b.name);
              if (b.props.Style === 'tbsSeparator' || b.props.Style === 'tbsDivider' || num(b.props.Width, 23) === 8)
                return <span key={b.name} className="tb-sep" />;
              return (
                <span key={b.name} style={{ display: 'contents' }}>
                  <span className="tb-btn" title={bs.hint}>
                    <ImgIdx list={s.data?.imageList ?? p.Images ?? 'menu'} index={num(b.props.ImageIndex, -1)} />
                  </span>
                  {b.props.Wrap === 'True' && <span style={{ flexBasis: '100%', height: 0 }} />}
                </span>
              );
            })}
        </div>
      );
    case 'TUpDown':
      return <div style={style} />;
    case 'TTabSheet':
      return null;
    case 'TSynEdit':
      return <Memo value={s.lines?.join('\n') ?? s.text ?? ''} mono wrap={false} readOnly={s.readOnly} disabled={disabled} style={style} onChange={(value) => { ctl.set(n.name, { text: value, lines: value.split('\n') }); ctl.fire(n.name, 'Change'); }} />;
    default:
      if (NON_VISUAL.has(n.class)) return null;
      // unknown container: render children
      return (
        <div style={style} title={n.class}>
          {children(rect.w, rect.h)}
        </div>
      );
  }
}

function isParentDisabled(ctl: FormCtl, name: string) {
  let cur = ctl.parents.get(name);
  while (cur) {
    const nd = ctl.node(cur);
    if (nd && (nd.class === 'TGroupBox' || nd.class === 'TPanel' || nd.class === 'TRadioGroup') && ctl.get(cur).enabled === false) return true;
    cur = ctl.parents.get(cur);
  }
  return false;
}

function GridCtl({ n, ctl, style }: { n: DfmNode; ctl: FormCtl; style: CSSProperties }) {
  const s = ctl.get(n.name);
  const grid = s.grid ?? [];
  const p = n.props;
  const fixedRows = num(p.FixedRows, 1);
  const colW: number[] = s.data?.colWidths ?? [];
  const defW = num(p.DefaultColWidth, 64);
  const rowH = num(p.DefaultRowHeight, 18);
  const sel = s.selIndex ?? fixedRows;
  return (
    <div className="vgrid" style={style} tabIndex={0}>
      {grid.map((row, r) => (
        <div key={r} className={'vgrid-row' + (r < fixedRows ? ' fixed' : '') + (r === sel ? ' sel' : '')} style={{ height: rowH }} onPointerDown={() => { if (r >= fixedRows) { ctl.set(n.name, { selIndex: r }); ctl.fire(n.name, 'SelectCell', r); } }}>
          {row.map((cell, c) => (
            <div key={c} className={'vgrid-cell' + (c === 0 && n.class === 'TValueListEditor' ? ' key' : '')} style={{ width: colW[c] ?? (n.class === 'TValueListEditor' && c === 1 ? undefined : defW), flex: n.class === 'TValueListEditor' && c === 1 ? 1 : undefined }}>
              {r >= fixedRows && s.data?.editable?.(r, c) ? (
                <input
                  className="vgrid-input"
                  value={cell}
                  onChange={(e) => {
                    const g = grid.map((x) => [...x]);
                    g[r][c] = e.target.value;
                    ctl.set(n.name, { grid: g });
                    ctl.fire(n.name, 'Change', r, c);
                  }}
                />
              ) : (
                cell
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Children({ ctl, parent, W, H, designW, designH, contentTop = 0 }: { ctl: FormCtl; parent: DfmNode; W: number; H: number; designW: number; designH: number; contentTop?: number }) {
  const rects = layoutChildren(ctl, parent.children, W, H, designW, designH, contentTop);
  const extra = ctl.extra[parent.name];
  return (
    <>
      {parent.children.map((c) => {
        const r = rects.get(c.name);
        if (!r) return null;
        return (
          <div key={c.name} data-ctl={c.name} style={{ display: 'contents' }}>
            <Control n={c} ctl={ctl} rect={r} />
          </div>
        );
      })}
      {extra}
    </>
  );
}

export function VclForm({ ctl, width, height }: { ctl: FormCtl; width: number; height: number }) {
  useFormCtl(ctl);
  const p = ctl.def.props;
  const dW = num(p.ClientWidth, width);
  const dH = num(p.ClientHeight, height);
  const color = delphiColor(p.Color);
  return (
    <div className="vform" style={{ width: '100%', height: '100%', background: color && p.Color !== 'clBtnFace' ? color : undefined }}>
      <Children ctl={ctl} parent={ctl.def} W={width} H={height} designW={dW} designH={dH} />
    </div>
  );
}

/** Measures the client area so resizable forms can re-layout with anchors */
function SizedForm({ ctl }: { ctl: FormCtl }) {
  const ref = useRef<HTMLDivElement>(null);
  useFormCtl(ctl);
  const p = ctl.def.props;
  const dW = num(p.ClientWidth, 400);
  const dH = num(p.ClientHeight, 300);
  const sizeRef = useRef({ w: dW, h: dH });
  const [, setTick] = useStateTick();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w !== sizeRef.current.w || h !== sizeRef.current.h) {
        sizeRef.current = { w, h };
        setTick();
        ctl.fire(ctl.def.name, 'Resize');
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ctl]);
  return (
    <div ref={ref} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <VclForm ctl={ctl} width={sizeRef.current.w} height={sizeRef.current.h} />
    </div>
  );
}

import { useReducer } from 'react';
function useStateTick(): [number, () => void] {
  const [t, inc] = useReducer((x: number) => x + 1, 0);
  return [t, inc as () => void];
}

export interface ShowFormOptions {
  owner?: number;
  title?: string;
  /** override handlers by DFM handler name */
  handlers?: FormCtl['handlers'];
  onShow?: (ctl: FormCtl) => void;
  /** return false to prevent closing (OnCloseQuery) */
  onCloseQuery?: (ctl: FormCtl, result: number) => boolean | Promise<boolean>;
  extraKeys?: (e: KeyboardEvent, ctl: FormCtl) => void;
  icon?: string;
  modal?: boolean;
  resizable?: boolean;
  clientW?: number;
  clientH?: number;
  appId?: string;
  /** control to focus when shown (ActiveControl) */
  focus?: string;
}

export function focusControl(name: string, select = true) {
  requestAnimationFrame(() => {
    const host = document.querySelectorAll(`[data-ctl="${name}"]`);
    const el = host[host.length - 1]?.querySelector('input, textarea, [tabindex], button') as HTMLElement | null;
    el?.focus();
    if (select && el instanceof HTMLInputElement) el.select();
  });
}

/** ShowModal for a DFM based form */
export function showForm(def: DfmNode, setup: (ctl: FormCtl) => void, opts: ShowFormOptions = {}): Promise<number> & { ctl: FormCtl } {
  const ctl = new FormCtl(def);
  if (opts.handlers) Object.assign(ctl.handlers, opts.handlers);
  setup(ctl);
  const p = def.props;
  const border = String(p.BorderStyle ?? 'bsSizeable');
  const icons = String(p.BorderIcons ?? '[biSystemMenu, biMinimize, biMaximize]');
  const resizable = opts.resizable ?? (border === 'bsSizeable' || border === 'bsSizeToolWin');
  const dialog = border === 'bsDialog' || border === 'bsSingle' || border === 'bsToolWindow' || !icons.includes('biMaximize');
  const promise = showModal<number>(
    {
      title: opts.title ?? ctl.caption(def.name) ?? '',
      owner: opts.owner ?? mainWindowId(),
      clientW: opts.clientW ?? num(p.ClientWidth, num(p.Width, 400)),
      clientH: opts.clientH ?? num(p.ClientHeight, num(p.Height, 300)),
      dialog,
      resizable,
      toolWindow: border === 'bsToolWindow' || border === 'bsSizeToolWin',
      showClose: p.BorderIcons !== undefined ? icons.includes('biSystemMenu') : true,
      showHelp: icons.includes('biHelp'),
      icon: opts.icon,
      appId: opts.appId,
      center: p.Position === 'poDesigned' || p.Position === 'poDefault' ? 'owner' : p.Position === 'poScreenCenter' || p.Position === 'poDesktopCenter' ? 'screen' : 'owner',
      onKeyDown: (e) => {
        if (e.defaultPrevented) return;
        if (opts.extraKeys) {
          opts.extraKeys(e, ctl);
          if (e.defaultPrevented) return;
        }
        ctl.fire(def.name, 'KeyDown', e);
        if (e.defaultPrevented) return;
        const target = e.target as HTMLElement;
        if (e.key === 'Enter' && !(target instanceof HTMLTextAreaElement) && !target.closest?.('.droplist')) {
          const b = ctl.defaultButton();
          if (b) {
            e.preventDefault();
            ctl.click(b);
          }
        } else if (e.key === 'Escape') {
          if (document.querySelector('.droplist')) return;
          const b = ctl.cancelButton();
          e.preventDefault();
          if (b) ctl.click(b);
          else ctl.close(mrCancel);
        }
      },
      onCloseRequest: async () => {
        if (opts.onCloseQuery) return await opts.onCloseQuery(ctl, mrCancel);
        const r = ctl.fire(def.name, 'CloseQuery');
        if (r === false) return false;
      },
      render: (close, id) => {
        ctl.windowId = id;
        ctl.closeWith = async (r) => {
          if (opts.onCloseQuery) {
            const ok = await opts.onCloseQuery(ctl, r);
            if (!ok) {
              ctl.modalResult = 0;
              return;
            }
          }
          ctl.fire(def.name, 'Close', r);
          close(r);
        };
        return <SizedForm ctl={ctl} />;
      },
    },
    mrCancel,
  ) as Promise<number> & { ctl: FormCtl };
  promise.ctl = ctl;
  queueMicrotask(() => {
    ctl.fire(def.name, 'Show');
    opts.onShow?.(ctl);
    const active = opts.focus ?? (def.props.ActiveControl as string | undefined);
    if (active) focusControl(active);
  });
  return promise;
}

let mainWin = 0;
export function setMainWindowId(id: number) {
  mainWin = id;
}
export function mainWindowId() {
  return mainWin || wm.activeId || undefined;
}

export type { WinOptions, ReactNode };
