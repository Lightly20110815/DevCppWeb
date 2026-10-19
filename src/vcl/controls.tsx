// Windows 10 looking common controls, usable on their own or from the DFM renderer.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as RKeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Accel } from '../os/menu';
import { ImgIdx } from '../os/images';
import type { LvItem, TreeNode } from './FormCtl';

export function Button({ caption, onClick, disabled, isDefault, style, glyph, className, title, children, flat, down }: {
  caption?: string;
  onClick?: () => void;
  disabled?: boolean;
  isDefault?: boolean;
  style?: CSSProperties;
  glyph?: ReactNode;
  className?: string;
  title?: string;
  children?: ReactNode;
  flat?: boolean;
  down?: boolean;
}) {
  return (
    <button
      type="button"
      className={'vbtn' + (isDefault ? ' default' : '') + (flat ? ' flat' : '') + (down ? ' down' : '') + (className ? ' ' + className : '')}
      disabled={disabled}
      style={style}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {glyph}
      {caption !== undefined && caption !== '' && (
        <span className="vbtn-cap">
          <Accel text={caption} />
        </span>
      )}
      {children}
    </button>
  );
}

export function CheckBox({ caption, checked, onChange, disabled, style, className, wordWrap }: {
  caption: string;
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  style?: CSSProperties;
  className?: string;
  wordWrap?: boolean;
}) {
  return (
    <label
      className={'vcheck' + (disabled ? ' disabled' : '') + (wordWrap ? ' wrap' : '') + (className ? ' ' + className : '')}
      title={caption.replace(/&/g, '')}
      style={style}
      onClick={(e) => {
        e.preventDefault();
        if (!disabled) onChange?.(!checked);
      }}
    >
      <span className={'vcheck-box' + (checked ? ' on' : '')}>
        {checked && (
          <svg width="11" height="11" viewBox="0 0 11 11"><path d="M1.5 5.5l2.8 2.8L9.6 2.6" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
        )}
      </span>
      <span className="vcheck-cap">
        <Accel text={caption} />
      </span>
    </label>
  );
}

export function Radio({ caption, checked, onChange, disabled, style, wordWrap }: {
  caption: string;
  checked: boolean;
  onChange?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
  wordWrap?: boolean;
}) {
  return (
    <label
      className={'vradio' + (disabled ? ' disabled' : '') + (wordWrap ? ' wrap' : '')}
      title={caption.replace(/&/g, '')}
      style={style}
      onClick={(e) => {
        e.preventDefault();
        if (!disabled && !checked) onChange?.();
      }}
    >
      <span className={'vradio-box' + (checked ? ' on' : '')} />
      <span className="vcheck-cap">
        <Accel text={caption} />
      </span>
    </label>
  );
}

export function Edit({ value, onChange, disabled, readOnly, style, password, onKeyDown, autoFocus, className, onBlur, onFocus, selectAll, placeholder }: {
  value: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  style?: CSSProperties;
  password?: boolean;
  onKeyDown?: (e: RKeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
  className?: string;
  onBlur?: () => void;
  onFocus?: () => void;
  selectAll?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      if (selectAll) ref.current.select();
    }
  }, [autoFocus, selectAll]);
  return (
    <input
      ref={ref}
      className={'vedit' + (className ? ' ' + className : '')}
      type={password ? 'password' : 'text'}
      value={value}
      disabled={disabled}
      readOnly={readOnly}
      style={style}
      spellCheck={false}
      placeholder={placeholder}
      onChange={(e) => onChange?.(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      onFocus={onFocus}
    />
  );
}

export function Memo({ value, onChange, disabled, readOnly, style, wrap, mono, scroll }: {
  value: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  style?: CSSProperties;
  wrap?: boolean;
  mono?: boolean;
  scroll?: string;
}) {
  return (
    <textarea
      className={'vmemo' + (mono ? ' mono' : '')}
      value={value}
      disabled={disabled}
      readOnly={readOnly}
      wrap={wrap === false ? 'off' : 'soft'}
      spellCheck={false}
      style={{ ...style, overflowY: scroll === 'ssNone' || scroll === 'ssHorizontal' ? 'hidden' : 'auto' }}
      onChange={(e) => onChange?.(e.target.value)}
    />
  );
}

/** Popup list rendered in a portal (used by combo boxes) */
export function DropList({ anchor, items, index, onPick, onClose, renderItem, itemHeight = 17, maxItems = 8, minWidth }: {
  anchor: HTMLElement;
  items: string[];
  index: number;
  onPick: (i: number) => void;
  onClose: () => void;
  renderItem?: (i: number, selected: boolean) => ReactNode;
  itemHeight?: number;
  maxItems?: number;
  minWidth?: number;
}) {
  const r = anchor.getBoundingClientRect();
  const [hot, setHot] = useState(index);
  const ref = useRef<HTMLDivElement>(null);
  const h = Math.min(items.length, maxItems) * itemHeight + 2;
  const below = r.bottom + h < window.innerHeight - 40;
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowDown') setHot((x) => Math.min(items.length - 1, x + 1));
      else if (e.key === 'ArrowUp') setHot((x) => Math.max(0, x - 1));
      else if (e.key === 'Enter') {
        if (hot >= 0) onPick(hot);
        onClose();
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
    };
  });
  useLayoutEffect(() => {
    const el = ref.current?.querySelector('.dl-item.hot') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [hot]);
  return createPortal(
    <div
      ref={ref}
      className="droplist"
      style={{
        left: r.left,
        top: below ? r.bottom : r.top - h,
        width: Math.max(r.width, minWidth ?? 0),
        maxHeight: h,
      }}
    >
      {items.map((it, i) => (
        <div
          key={i}
          className={'dl-item' + (i === hot ? ' hot' : '')}
          style={{ height: itemHeight }}
          onPointerEnter={() => setHot(i)}
          onClick={() => {
            onPick(i);
            onClose();
          }}
        >
          {renderItem ? renderItem(i, i === hot) : it}
        </div>
      ))}
    </div>,
    document.body,
  );
}

export function ComboBox({ items, index, text, onChange, onTextChange, editable, disabled, style, renderItem, itemHeight, onDropDown, onKeyDown, autoFocus, className, maxItems }: {
  items: string[];
  index: number;
  text?: string;
  onChange?: (i: number) => void;
  onTextChange?: (t: string) => void;
  editable?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
  renderItem?: (i: number, selected: boolean) => ReactNode;
  itemHeight?: number;
  onDropDown?: () => void;
  onKeyDown?: (e: RKeyboardEvent<HTMLElement>) => void;
  autoFocus?: boolean;
  className?: string;
  maxItems?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) {
      if (editable) {
        inputRef.current?.focus();
        inputRef.current?.select();
      } else ref.current?.focus();
    }
  }, [autoFocus, editable]);
  const display = editable ? text ?? '' : index >= 0 && index < items.length ? items[index] : text ?? '';
  const toggle = () => {
    if (disabled) return;
    if (!open) onDropDown?.();
    setOpen((v) => !v);
  };
  return (
    <div
      ref={ref}
      tabIndex={editable ? -1 : 0}
      className={'vcombo' + (editable ? ' editable' : ' list') + (disabled ? ' disabled' : '') + (open ? ' open' : '') + (className ? ' ' + className : '')}
      style={style}
      onPointerDown={(e) => {
        if (!editable) {
          e.preventDefault();
          ref.current?.focus();
          toggle();
        }
      }}
      onKeyDown={(e) => {
        if (!editable && !open) {
          if (e.key === 'ArrowDown' && index < items.length - 1) {
            onChange?.(index + 1);
            e.preventDefault();
          } else if (e.key === 'ArrowUp' && index > 0) {
            onChange?.(index - 1);
            e.preventDefault();
          } else if (e.key === 'F4' || (e.altKey && e.key === 'ArrowDown')) toggle();
        }
        onKeyDown?.(e);
      }}
    >
      {editable ? (
        <input
          ref={inputRef}
          className="vcombo-input"
          value={display}
          disabled={disabled}
          spellCheck={false}
          onChange={(e) => onTextChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.altKey && e.key === 'ArrowDown') toggle();
          }}
        />
      ) : (
        <div className="vcombo-text">{renderItem && index >= 0 ? renderItem(index, false) : display}</div>
      )}
      <div
        className="vcombo-btn"
        onPointerDown={(e) => {
          if (editable) {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <svg width="8" height="5" viewBox="0 0 8 5"><path d="M0.5 0.5L4 4 7.5 0.5" fill="none" stroke="currentColor" /></svg>
      </div>
      {open && ref.current && (
        <DropList
          anchor={ref.current}
          items={items}
          index={index}
          itemHeight={itemHeight}
          renderItem={renderItem}
          maxItems={maxItems}
          onPick={(i) => {
            onChange?.(i);
            if (editable) onTextChange?.(items[i]);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

export function SpinEdit({ value, onChange, min, max, disabled, style }: {
  value: number;
  onChange?: (v: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => setTxt(String(value)), [value]);
  const clamp = (v: number) => {
    let r = v;
    if (max !== undefined && (min ?? 0) < max) r = Math.min(max, r);
    if (min !== undefined && (min < (max ?? 0) || max === 0 || max === undefined)) r = Math.max(min, r);
    return r;
  };
  const commit = (v: number) => {
    const c = clamp(v);
    setTxt(String(c));
    onChange?.(c);
  };
  return (
    <div className={'vspin' + (disabled ? ' disabled' : '')} style={style}>
      <input
        className="vspin-input"
        value={txt}
        disabled={disabled}
        onChange={(e) => {
          setTxt(e.target.value);
          const n = parseInt(e.target.value, 10);
          if (!Number.isNaN(n)) onChange?.(clamp(n));
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') commit(value + 1);
          else if (e.key === 'ArrowDown') commit(value - 1);
        }}
        onBlur={() => commit(parseInt(txt, 10) || 0)}
      />
      <div className="vspin-btns">
        <div className="vspin-up" onPointerDown={(e) => { e.preventDefault(); if (!disabled) commit(value + 1); }}>
          <svg width="7" height="4" viewBox="0 0 7 4"><path d="M0 4L3.5 0.5 7 4z" fill="currentColor" /></svg>
        </div>
        <div className="vspin-down" onPointerDown={(e) => { e.preventDefault(); if (!disabled) commit(value - 1); }}>
          <svg width="7" height="4" viewBox="0 0 7 4"><path d="M0 0L3.5 3.5 7 0z" fill="currentColor" /></svg>
        </div>
      </div>
    </div>
  );
}

export function GroupBox({ caption, style, children }: { caption: string; style?: CSSProperties; children?: ReactNode }) {
  return (
    <div className="vgroup" style={style}>
      <div className="vgroup-frame" />
      {caption && (
        <div className="vgroup-cap">
          <Accel text={caption} />
        </div>
      )}
      {children}
    </div>
  );
}

export function ListBox({ items, index, onChange, onDblClick, style, multi, selSet, onSelSet, renderItem, itemHeight = 15, checks, onCheck, disabled, onKeyDown }: {
  items: string[];
  index: number;
  onChange?: (i: number) => void;
  onDblClick?: (i: number) => void;
  style?: CSSProperties;
  multi?: boolean;
  selSet?: number[];
  onSelSet?: (s: number[]) => void;
  renderItem?: (i: number, selected: boolean) => ReactNode;
  itemHeight?: number;
  checks?: boolean[];
  onCheck?: (i: number, v: boolean) => void;
  disabled?: boolean;
  onKeyDown?: (e: RKeyboardEvent) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector('.lb-item.sel') as HTMLElement | null;
    if (el && ref.current) {
      const top = el.offsetTop;
      const c = ref.current;
      if (top < c.scrollTop) c.scrollTop = top;
      else if (top + el.offsetHeight > c.scrollTop + c.clientHeight) c.scrollTop = top + el.offsetHeight - c.clientHeight;
    }
  }, [index]);
  return (
    <div
      ref={ref}
      tabIndex={0}
      className={'vlist' + (focus ? ' focused' : '') + (disabled ? ' disabled' : '')}
      style={style}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' && index < items.length - 1) onChange?.(index + 1);
        else if (e.key === 'ArrowUp' && index > 0) onChange?.(index - 1);
        else if (e.key === 'Home' && items.length) onChange?.(0);
        else if (e.key === 'End' && items.length) onChange?.(items.length - 1);
        else if (e.key === ' ' && checks && index >= 0) onCheck?.(index, !checks[index]);
        else {
          onKeyDown?.(e);
          return;
        }
        e.preventDefault();
      }}
    >
      {items.map((it, i) => {
        const sel = multi ? !!selSet?.includes(i) : i === index;
        return (
          <div
            key={i}
            className={'lb-item' + (sel ? ' sel' : '') + (i === index ? ' cur' : '')}
            style={{ height: itemHeight, lineHeight: itemHeight + 'px' }}
            onPointerDown={(e) => {
              if (disabled) return;
              if (multi) {
                if (e.ctrlKey) onSelSet?.(sel ? selSet!.filter((x) => x !== i) : [...(selSet ?? []), i]);
                else if (e.shiftKey && index >= 0) {
                  const a = Math.min(index, i);
                  const b = Math.max(index, i);
                  onSelSet?.(Array.from({ length: b - a + 1 }, (_, k) => a + k));
                } else onSelSet?.([i]);
              }
              onChange?.(i);
            }}
            onDoubleClick={() => onDblClick?.(i)}
          >
            {checks && (
              <span
                className={'vcheck-box small' + (checks[i] ? ' on' : '')}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onCheck?.(i, !checks[i]);
                }}
              >
                {checks[i] && (
                  <svg width="11" height="11" viewBox="0 0 11 11"><path d="M1.5 5.5l2.8 2.8L9.6 2.6" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
                )}
              </span>
            )}
            {renderItem ? renderItem(i, sel) : it}
          </div>
        );
      })}
    </div>
  );
}

export interface LvColumn {
  caption: string;
  width: number;
  autoSize?: boolean;
  align?: 'left' | 'right' | 'center';
}

export function ListView({ columns, items, sel, onSel, onDblClick, style, gridLines, imageList, viewStyle = 'vsReport', checkboxes, onCheck, onKeyDown, onContextMenu, rowColor, showHeader = true, largeIcon, onColumnResize, renderCell, className, hideSelection }: {
  columns?: LvColumn[];
  items: LvItem[];
  sel: number;
  onSel?: (i: number) => void;
  onDblClick?: (i: number) => void;
  style?: CSSProperties;
  gridLines?: boolean;
  imageList?: string;
  viewStyle?: string;
  checkboxes?: boolean;
  onCheck?: (i: number, v: boolean) => void;
  onKeyDown?: (e: RKeyboardEvent) => void;
  onContextMenu?: (e: React.MouseEvent, i: number) => void;
  rowColor?: (it: LvItem, i: number) => string | undefined;
  showHeader?: boolean;
  largeIcon?: (it: LvItem) => ReactNode;
  onColumnResize?: (i: number, w: number) => void;
  renderCell?: (it: LvItem, col: number) => ReactNode;
  className?: string;
  hideSelection?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState(false);
  const [widths, setWidths] = useState<number[]>(() => (columns ?? []).map((c) => c.width));
  useEffect(() => setWidths((columns ?? []).map((c) => c.width)), [columns]);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector('.lv-row.sel, .lv-icon.sel') as HTMLElement | null;
    if (el && ref.current) {
      const c = ref.current;
      const top = el.offsetTop - (showHeader && viewStyle === 'vsReport' ? 24 : 0);
      if (top < c.scrollTop) c.scrollTop = top;
      else if (el.offsetTop + el.offsetHeight > c.scrollTop + c.clientHeight) c.scrollTop = el.offsetTop + el.offsetHeight - c.clientHeight;
    }
  }, [sel]);
  const keyNav = (e: RKeyboardEvent) => {
    if (e.key === 'ArrowDown' && sel < items.length - 1) onSel?.(sel + 1);
    else if (e.key === 'ArrowUp' && sel > 0) onSel?.(sel - 1);
    else if (e.key === 'ArrowRight' && viewStyle === 'vsIcon' && sel < items.length - 1) onSel?.(sel + 1);
    else if (e.key === 'ArrowLeft' && viewStyle === 'vsIcon' && sel > 0) onSel?.(sel - 1);
    else if (e.key === 'Enter' && sel >= 0) onDblClick?.(sel);
    else {
      onKeyDown?.(e);
      return;
    }
    e.preventDefault();
  };
  if (viewStyle === 'vsIcon') {
    return (
      <div
        ref={ref}
        tabIndex={0}
        className={'vlistview icons' + (focus ? ' focused' : '') + (className ? ' ' + className : '')}
        style={style}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onKeyDown={keyNav}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onSel?.(-1);
        }}
      >
        {items.map((it, i) => (
          <div
            key={i}
            className={'lv-icon' + (i === sel ? ' sel' : '')}
            onPointerDown={() => onSel?.(i)}
            onDoubleClick={() => onDblClick?.(i)}
          >
            <div className="lv-icon-img">{largeIcon?.(it)}</div>
            <div className="lv-icon-cap">{it.caption}</div>
          </div>
        ))}
      </div>
    );
  }
  const cols = columns ?? [{ caption: '', width: 200 }];
  const fixed = widths.reduce((a, w, i) => a + (cols[i]?.autoSize ? 0 : w), 0);
  return (
    <div
      ref={ref}
      tabIndex={0}
      className={'vlistview report' + (focus ? ' focused' : '') + (gridLines ? ' grid' : '') + (className ? ' ' + className : '')}
      style={style}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      onKeyDown={keyNav}
    >
      <div className="lv-table" style={{ minWidth: fixed + 20 }}>
        {showHeader && (
          <div className="lv-header">
            {cols.map((c, i) => (
              <div key={i} className="lv-hcell" style={c.autoSize ? { flex: 1, minWidth: 60 } : { width: widths[i] }}>
                <span>{c.caption}</span>
                <div
                  className="lv-hsize"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    const sx = e.clientX;
                    const ow = widths[i];
                    const move = (ev: PointerEvent) => {
                      const nw = Math.max(8, ow + ev.clientX - sx);
                      setWidths((ws) => ws.map((w, k) => (k === i ? nw : w)));
                      onColumnResize?.(i, nw);
                    };
                    const up = () => {
                      window.removeEventListener('pointermove', move);
                      window.removeEventListener('pointerup', up);
                    };
                    window.addEventListener('pointermove', move);
                    window.addEventListener('pointerup', up);
                  }}
                />
              </div>
            ))}
            <div className="lv-hcell filler" />
          </div>
        )}
        {items.map((it, i) => {
          const color = rowColor?.(it, i) ?? it.color;
          return (
            <div
              key={i}
              className={'lv-row' + (i === sel && !(hideSelection && !focus) ? ' sel' : '')}
              style={color ? { color } : undefined}
              onPointerDown={() => onSel?.(i)}
              onDoubleClick={() => onDblClick?.(i)}
              onContextMenu={(e) => {
                e.preventDefault();
                onSel?.(i);
                onContextMenu?.(e, i);
              }}
            >
              {cols.map((c, ci) => (
                <div key={ci} className="lv-cell" style={c.autoSize ? { flex: 1, minWidth: 60 } : { width: widths[ci], textAlign: c.align }}>
                  {ci === 0 && checkboxes && (
                    <span
                      className={'vcheck-box small' + (it.checked ? ' on' : '')}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onCheck?.(i, !it.checked);
                      }}
                    >
                      {it.checked && (
                        <svg width="11" height="11" viewBox="0 0 11 11"><path d="M1.5 5.5l2.8 2.8L9.6 2.6" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
                      )}
                    </span>
                  )}
                  {ci === 0 && imageList && it.imageIndex !== undefined && it.imageIndex >= 0 && <ImgIdx list={imageList} index={it.imageIndex} />}
                  <span className="lv-text">{renderCell ? renderCell(it, ci) : ci === 0 ? it.caption : it.subItems?.[ci - 1] ?? ''}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TreeView({ nodes, selected, onSelect, onDblClick, imageList, style, onContextMenu, onToggle, onKeyDown, showLines = true, className, renderText }: {
  nodes: TreeNode[];
  selected: TreeNode | null;
  onSelect?: (n: TreeNode) => void;
  onDblClick?: (n: TreeNode) => void;
  imageList?: string;
  style?: CSSProperties;
  onContextMenu?: (e: React.MouseEvent, n: TreeNode | null) => void;
  onToggle?: (n: TreeNode) => void;
  onKeyDown?: (e: RKeyboardEvent) => void;
  showLines?: boolean;
  className?: string;
  renderText?: (n: TreeNode) => ReactNode;
}) {
  const [focus, setFocus] = useState(false);
  const [, force] = useState(0);
  const flat: TreeNode[] = [];
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      flat.push(n);
      if (n.expanded && n.children) walk(n.children);
    }
  };
  walk(nodes);
  const toggle = (n: TreeNode) => {
    n.expanded = !n.expanded;
    onToggle?.(n);
    force((x) => x + 1);
  };
  const render = (list: TreeNode[], depth: number, lastFlags: boolean[]): ReactNode =>
    list.map((n, i) => {
      const last = i === list.length - 1;
      const hasKids = !!n.children && n.children.length > 0;
      return (
        <div key={i} className="tv-node">
          <div
            className={'tv-row' + (n === selected ? ' sel' : '')}
            onPointerDown={(e) => {
              if (e.button === 0 || e.button === 2) onSelect?.(n);
            }}
            onDoubleClick={() => {
              if (onDblClick) onDblClick(n);
              if (hasKids) toggle(n);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect?.(n);
              onContextMenu?.(e, n);
            }}
          >
            {lastFlags.map((l, k) => (
              <span key={k} className={'tv-indent' + (showLines && !l ? ' line' : '')} />
            ))}
            <span className={'tv-exp' + (showLines ? (last ? ' last' : ' mid') : '')}>
              {hasKids && (
                <span
                  className="tv-box"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    toggle(n);
                  }}
                >
                  {n.expanded ? '−' : '+'}
                </span>
              )}
            </span>
            {imageList && n.imageIndex !== undefined && n.imageIndex >= 0 && (
              <ImgIdx list={imageList} index={n === selected && n.selectedIndex !== undefined ? n.selectedIndex : n.imageIndex} />
            )}
            <span className="tv-text" style={{ fontWeight: n.bold ? 'bold' : undefined, color: n.color }}>
              {renderText ? renderText(n) : n.text}
            </span>
          </div>
          {n.expanded && hasKids && <div className="tv-kids">{render(n.children!, depth + 1, [...lastFlags, last])}</div>}
        </div>
      );
    });
  return (
    <div
      tabIndex={0}
      className={'vtree' + (focus ? ' focused' : '') + (className ? ' ' + className : '')}
      style={style}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(e, null);
      }}
      onKeyDown={(e) => {
        const idx = selected ? flat.indexOf(selected) : -1;
        if (e.key === 'ArrowDown' && idx < flat.length - 1) onSelect?.(flat[idx + 1]);
        else if (e.key === 'ArrowUp' && idx > 0) onSelect?.(flat[idx - 1]);
        else if (e.key === 'ArrowRight' && selected?.children?.length && !selected.expanded) toggle(selected);
        else if (e.key === 'ArrowLeft' && selected?.expanded) toggle(selected);
        else if (e.key === 'Enter' && selected) onDblClick?.(selected);
        else {
          onKeyDown?.(e);
          return;
        }
        e.preventDefault();
      }}
    >
      {render(nodes, 0, [])}
    </div>
  );
}

export function TabStrip({ tabs, index, onChange, images, imageList, style, className, onClose, onContextMenu, onMiddle, hint, bottom }: {
  tabs: string[];
  index: number;
  onChange: (i: number) => void;
  images?: (number | undefined)[];
  imageList?: string;
  style?: CSSProperties;
  className?: string;
  onClose?: (i: number) => void;
  onContextMenu?: (e: React.MouseEvent, i: number) => void;
  onMiddle?: (i: number) => void;
  hint?: (i: number) => string | undefined;
  bottom?: boolean;
}) {
  return (
    <div className={'vtabs' + (bottom ? ' bottom' : '') + (className ? ' ' + className : '')} style={style}>
      {tabs.map((t, i) => (
        <div
          key={i}
          className={'vtab' + (i === index ? ' active' : '')}
          title={hint?.(i)}
          onPointerDown={(e) => {
            if (e.button === 0) onChange(i);
            if (e.button === 1) {
              e.preventDefault();
              onMiddle?.(i);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            onContextMenu?.(e, i);
          }}
        >
          {images && images[i] !== undefined && images[i]! >= 0 && imageList && <ImgIdx list={imageList} index={images[i]!} />}
          <span className="vtab-cap">
            <Accel text={t} />
          </span>
          {onClose && <span className="vtab-x" onPointerDown={(e) => { e.stopPropagation(); onClose(i); }}>×</span>}
        </div>
      ))}
    </div>
  );
}

export function TrackBar({ value, min, max, onChange, style, disabled }: {
  value: number;
  min: number;
  max: number;
  onChange?: (v: number) => void;
  style?: CSSProperties;
  disabled?: boolean;
}) {
  return (
    <input
      type="range"
      className="vtrack"
      min={min}
      max={max}
      value={value}
      disabled={disabled}
      style={style}
      onChange={(e) => onChange?.(Number(e.target.value))}
    />
  );
}

export function ProgressBar({ min = 0, max = 100, position, style }: { min?: number; max?: number; position: number; style?: CSSProperties }) {
  const pct = max > min ? ((position - min) / (max - min)) * 100 : 0;
  return (
    <div className="vprogress" style={style}>
      <div className="vprogress-bar" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

export function Bevel({ shape, style }: { shape?: string; style?: CSSProperties }) {
  return <div className={'vbevel ' + (shape ?? 'bsBox')} style={style} />;
}
