// CodeMirror extensions that reproduce SynEdit's look and Dev-C++'s editor behaviour.
import { EditorState, StateEffect, StateField, RangeSetBuilder, Compartment, Prec } from '@codemirror/state';
import type { Extension, Text } from '@codemirror/state';
import { EditorView, Decoration, ViewPlugin, GutterMarker, gutter, keymap, WidgetType } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting, foldService, foldEffect, unfoldEffect, foldedRanges, syntaxTree } from '@codemirror/language';
import { synTags, tokenizeLine } from './synCpp';
import { delphiColor } from '../colors';
import { SYN_ATTRS, cBP, cErr, cABP, cGut, cSel, cFld } from '../config';
import type { DevEditor } from '../config';
import { listUrl } from '../../os/images';
import { editorFontStack, fontSizePixels } from '../fonts';

// ------------------------------------------------------------------ colors

export interface ResolvedColors {
  attrs: Record<string, { fg: string | null; bg: string | null; bold: boolean; italic: boolean; underline: boolean }>;
  special: Record<string, { fg: string | null; bg: string | null }>;
  bg: string;
  fg: string;
}

export function resolveColors(ed: DevEditor): ResolvedColors {
  const attrs: ResolvedColors['attrs'] = {};
  for (const a of SYN_ATTRS) {
    const parts = (ed.Syntax[a] ?? 'clBlack, clNone, 0, 0, 0').split(',').map((s) => s.trim());
    attrs[a] = { fg: delphiColor(parts[0]), bg: delphiColor(parts[1]), bold: parts[2] === '1', italic: parts[3] === '1', underline: parts[4] === '1' };
  }
  const special: ResolvedColors['special'] = {};
  for (const a of [cBP, cErr, cABP, cGut, cSel, cFld]) {
    const parts = (ed.Syntax[a] ?? 'clBlack, clNone').split(',').map((s) => s.trim());
    special[a] = { fg: delphiColor(parts[0]), bg: delphiColor(parts[1]) };
  }
  const bg = attrs.Space.bg ?? '#ffffff';
  const fg = attrs.Space.fg ?? attrs.Identifier.fg ?? '#000000';
  return { attrs, special, bg, fg };
}

const ptToPx = fontSizePixels;

export function fontStack(name: string) {
  return editorFontStack(name);
}

export function highlightExtension(ed: DevEditor): Extension {
  const c = resolveColors(ed);
  const specs = SYN_ATTRS.filter((a) => a !== 'Space').map((a) => {
    const at = c.attrs[a];
    return {
      tag: synTags[a as keyof typeof synTags],
      color: at.fg ?? undefined,
      backgroundColor: at.bg ?? undefined,
      fontWeight: at.bold ? 'bold' : undefined,
      fontStyle: at.italic ? 'italic' : undefined,
      textDecoration: at.underline ? 'underline' : undefined,
    };
  });
  return syntaxHighlighting(HighlightStyle.define(specs));
}

export function themeExtension(ed: DevEditor, highlighted: boolean): Extension {
  const c = resolveColors(ed);
  const gut = highlighted ? c.special[cGut] : { fg: '#000000', bg: '#f0f0f0' };
  const sel = highlighted ? c.special[cSel] : { fg: '#ffffff', bg: '#000080' };
  const fold = c.special[cFld];
  const high = ed.HighCurrLine && highlighted ? delphiColor(ed.HighColor) : null;
  const font = fontStack(ed.FontName);
  const size = ptToPx(ed.FontSize);
  const gsize = ptToPx(ed.GutterFontSize);
  return EditorView.theme({
    '&': {
      backgroundColor: highlighted ? c.bg : '#ffffff',
      color: highlighted ? c.fg : '#000000',
      height: '100%',
      fontSize: size + 'px',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: font, fontVariantLigatures: 'none', lineHeight: Math.round(size * 1.125) + 'px', overflow: ed.ShowScrollbars ? 'auto' : 'scroll' },
    '.cm-line': { padding: '0 0 0 2px', lineHeight: Math.round(size * 1.125) + 'px' },
    '.cm-content': { padding: '0', caretColor: 'transparent' },
    '.cm-gutters': {
      backgroundColor: gut.bg ?? '#f0f0f0',
      color: gut.fg ?? '#000000',
      border: 'none',
      fontFamily: fontStack(ed.GutterFontName),
      fontSize: gsize + 'px',
    },
    '.cm-activeLine': { backgroundColor: high ?? 'transparent' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: (sel.bg ?? '#000080') + ' !important',
    },
    // drawSelection owns the layer order and hides the native selection. Raising
    // its opaque background to z-index 0 paints over the text on macOS as well.
    '.cm-activeLine:has(.cm-sel-text)': { backgroundColor: 'transparent' },
    '.cm-line .cm-sel-text, .cm-line .cm-sel-text *': { color: (sel.fg ?? '#ffffff') + ' !important' },
    '.dev-fold-line': { borderColor: fold.fg ?? '#000000' },
    '.dev-fold-box': { borderColor: fold.fg ?? '#000000', color: fold.fg ?? '#000000', backgroundColor: gut.bg ?? '#f0f0f0' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: highlighted ? c.fg : '#000' },
  });
}

// ------------------------------------------------------------------ special lines (error / breakpoints)

export interface LineMarks {
  errorLine: number;
  activeLine: number;
  breakpoints: Set<number>;
}

export const setLineMarks = StateEffect.define<LineMarks>();

export const lineMarksField = StateField.define<LineMarks>({
  create: () => ({ errorLine: -1, activeLine: -1, breakpoints: new Set() }),
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setLineMarks)) v = e.value;
    if (tr.docChanged && v.breakpoints.size) {
      // keep breakpoints on their lines when text is inserted above
      const bps = new Set<number>();
      for (const l of v.breakpoints) {
        if (l > tr.startState.doc.lines) continue;
        const pos = tr.changes.mapPos(tr.startState.doc.line(l).from, 1);
        bps.add(tr.state.doc.lineAt(pos).number);
      }
      v = { ...v, breakpoints: bps };
    }
    return v;
  },
});

function specialLineDecorations(colors: ResolvedColors) {
  return EditorView.decorations.compute([lineMarksField, 'doc'], (state) => {
    const m = state.field(lineMarksField);
    const b = new RangeSetBuilder<Decoration>();
    const lines: [number, string][] = [];
    const add = (line: number, cls: string) => {
      if (line >= 1 && line <= state.doc.lines && !lines.some((x) => x[0] === line)) lines.push([line, cls]);
    };
    add(m.activeLine, 'dev-abp');
    for (const l of m.breakpoints) add(l, 'dev-bp');
    add(m.errorLine, 'dev-err');
    lines.sort((a, b2) => a[0] - b2[0]);
    for (const [l, cls] of lines) b.add(state.doc.line(l).from, state.doc.line(l).from, Decoration.line({ class: cls }));
    return b.finish();
  });
}

export function specialLineTheme(colors: ResolvedColors) {
  const s = colors.special;
  const rule = (k: string) => ({
    backgroundColor: (s[k].bg ?? 'transparent') + ' !important',
    color: (s[k].fg ?? 'inherit') + ' !important',
  });
  const inner = (k: string) => ({ color: (s[k].fg ?? 'inherit') + ' !important' });
  return EditorView.theme({
    '.dev-err': rule(cErr),
    '.dev-err *': inner(cErr),
    '.dev-bp': rule(cBP),
    '.dev-bp *': inner(cBP),
    '.dev-abp': rule(cABP),
    '.dev-abp *': inner(cABP),
  });
}

export { specialLineDecorations };

// ------------------------------------------------------------------ fold ranges ({ } pairs)

interface FoldInfo {
  /** line -> end line for regions starting on that line */
  starts: Map<number, { from: number; to: number; endLine: number }>;
  /** per line: depth of open regions spanning it (for drawing the vertical bar) */
  inside: Uint16Array;
  ends: Set<number>;
}

const foldCache = new WeakMap<Text, FoldInfo>();

export function computeFolds(doc: Text): FoldInfo {
  const cached = foldCache.get(doc);
  if (cached) return cached;
  const starts = new Map<number, { from: number; to: number; endLine: number }>();
  const inside = new Uint16Array(doc.lines + 2);
  const ends = new Set<number>();
  const stack: { line: number; pos: number }[] = [];
  let range: Parameters<typeof tokenizeLine>[1] = 'unknown';
  for (let ln = 1; ln <= doc.lines; ln++) {
    const line = doc.line(ln);
    const r = tokenizeLine(line.text, range);
    range = r.range;
    let col = 0;
    for (const t of r.tokens) {
      if (t.kind === 'Symbol' && (t.text === '{' || t.text === '}')) {
        if (t.text === '{') stack.push({ line: ln, pos: line.from + col });
        else {
          const open = stack.pop();
          if (open && open.line < ln && !starts.has(open.line)) {
            starts.set(open.line, { from: open.pos + 1, to: line.from + col, endLine: ln });
            ends.add(ln);
            for (let k = open.line + 1; k < ln; k++) inside[k]++;
          }
        }
      }
      col += t.text.length;
    }
  }
  const info = { starts, inside, ends };
  foldCache.set(doc, info);
  return info;
}

export const braceFolding = foldService.of((state, lineStart) => {
  const info = computeFolds(state.doc);
  const line = state.doc.lineAt(lineStart);
  const r = info.starts.get(line.number);
  if (!r) return null;
  return { from: r.from, to: r.to };
});

class FoldMarker extends GutterMarker {
  constructor(readonly kind: 'open' | 'closed' | 'line' | 'end' | 'none', readonly line: number) {
    super();
  }
  eq(o: FoldMarker) {
    return o.kind === this.kind;
  }
  toDOM() {
    const el = document.createElement('div');
    el.className = 'dev-fold dev-fold-' + this.kind;
    if (this.kind === 'open' || this.kind === 'closed') {
      const box = document.createElement('div');
      box.className = 'dev-fold-box';
      box.textContent = this.kind === 'open' ? '−' : '+';
      el.appendChild(box);
      if (this.kind === 'open') {
        const ln = document.createElement('div');
        ln.className = 'dev-fold-line dev-fold-down';
        el.appendChild(ln);
      }
    } else if (this.kind === 'line' || this.kind === 'end') {
      const ln = document.createElement('div');
      ln.className = 'dev-fold-line ' + (this.kind === 'end' ? 'dev-fold-endline' : 'dev-fold-vert');
      el.appendChild(ln);
    }
    return el;
  }
}

export function foldGutterExt(): Extension {
  return gutter({
    class: 'dev-fold-gutter',
    lineMarker(view, line) {
      const info = computeFolds(view.state.doc);
      const ln = view.state.doc.lineAt(line.from).number;
      const st = info.starts.get(ln);
      if (st) {
        let folded = false;
        foldedRanges(view.state).between(st.from, st.to, (from, to) => {
          if (from === st.from && to === st.to) folded = true;
        });
        return new FoldMarker(folded ? 'closed' : 'open', ln);
      }
      if (info.ends.has(ln)) return new FoldMarker('end', ln);
      if (info.inside[ln] > 0) return new FoldMarker('line', ln);
      return null;
    },
    initialSpacer: () => new FoldMarker('none', 0),
    domEventHandlers: {
      mousedown(view, line) {
        const info = computeFolds(view.state.doc);
        const ln = view.state.doc.lineAt(line.from).number;
        const st = info.starts.get(ln);
        if (!st) return false;
        let folded = false;
        foldedRanges(view.state).between(st.from, st.to, (from, to) => {
          if (from === st.from && to === st.to) folded = true;
        });
        view.dispatch({ effects: folded ? unfoldEffect.of({ from: st.from, to: st.to }) : foldEffect.of({ from: st.from, to: st.to }) });
        return true;
      },
    },
    updateSpacer: () => new FoldMarker('none', 0),
  });
}

export function foldAll(view: EditorView) {
  const info = computeFolds(view.state.doc);
  const effects = [...info.starts.values()].map((r) => foldEffect.of({ from: r.from, to: r.to }));
  view.dispatch({ effects });
}

export function unfoldAll(view: EditorView) {
  const effects: StateEffect<unknown>[] = [];
  foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
    effects.push(unfoldEffect.of({ from, to }));
  });
  view.dispatch({ effects });
}

// ------------------------------------------------------------------ line number gutter with debug marks

class NumberMarker extends GutterMarker {
  constructor(readonly text: string, readonly mark: number) {
    super();
  }
  eq(o: NumberMarker) {
    return o.text === this.text && o.mark === this.mark;
  }
  toDOM() {
    const el = document.createElement('div');
    el.className = 'dev-ln';
    const t = document.createElement('span');
    t.textContent = this.text;
    el.appendChild(t);
    if (this.mark >= 0) {
      const img = document.createElement('span');
      img.className = 'dev-gutter-mark';
      img.style.backgroundImage = `url("${listUrl('gutter')}")`;
      img.style.backgroundPosition = `${-this.mark * 11}px 0`;
      el.appendChild(img);
    }
    return el;
  }
}

export interface GutterOpts {
  lineNumbers: boolean;
  leadZero: boolean;
  firstIsZero: boolean;
  digits: number;
  onClick?: (line: number) => void;
}

export function lineNumberGutter(o: GutterOpts): Extension {
  const fmt = (n: number, total: number) => {
    const v = o.firstIsZero ? n - 1 : n;
    let s = String(v);
    const width = Math.max(o.digits, String(total).length);
    if (o.leadZero) s = s.padStart(width, '0');
    return s;
  };
  return gutter({
    class: 'dev-ln-gutter',
    lineMarker(view, line) {
      const ln = view.state.doc.lineAt(line.from).number;
      const m = view.state.field(lineMarksField);
      const mark = m.activeLine === ln ? 1 : m.breakpoints.has(ln) ? 0 : m.errorLine === ln ? 2 : -1;
      return new NumberMarker(o.lineNumbers ? fmt(ln, view.state.doc.lines) : '', mark);
    },
    lineMarkerChange: (u) => u.docChanged || u.startState.field(lineMarksField) !== u.state.field(lineMarksField) || u.viewportChanged,
    initialSpacer: (view) => new NumberMarker(o.lineNumbers ? fmt(view.state.doc.lines, view.state.doc.lines).replace(/./g, '9') : '', -1),
    updateSpacer: (_s, u) => new NumberMarker(o.lineNumbers ? fmt(u.state.doc.lines, u.state.doc.lines).replace(/./g, '9') : '', -1),
    domEventHandlers: {
      mousedown(view, line) {
        o.onClick?.(view.state.doc.lineAt(line.from).number);
        return true;
      },
    },
  });
}

// ------------------------------------------------------------------ matching bracket painting (EditorPaintTransient)

const BRACKETS = '{[(}])';

function findMatch(doc: Text, pos: number): number | null {
  const ch = doc.sliceString(pos, pos + 1);
  const i = BRACKETS.indexOf(ch);
  if (i < 0) return null;
  const open = i < 3;
  const partner = open ? BRACKETS[i + 3] : BRACKETS[i - 3];
  // scan with the tokenizer so brackets inside strings/comments are ignored
  const startLine = doc.lineAt(pos);
  let depth = 0;
  if (open) {
    let range: Parameters<typeof tokenizeLine>[1] = 'unknown';
    // compute range state at the start line (cheap approximation: rescan from top for small docs)
    if (doc.lines < 20000) {
      for (let l = 1; l < startLine.number; l++) range = tokenizeLine(doc.line(l).text, range).range;
    }
    for (let l = startLine.number; l <= doc.lines; l++) {
      const line = doc.line(l);
      const r = tokenizeLine(line.text, range);
      range = r.range;
      let col = 0;
      for (const t of r.tokens) {
        const abs = line.from + col;
        if (t.kind === 'Symbol' && t.text.length === 1 && abs >= pos) {
          if (t.text === ch) depth++;
          else if (t.text === partner) {
            depth--;
            if (depth === 0) return abs;
          }
        }
        col += t.text.length;
      }
    }
  } else {
    const symbolsBefore: number[][] = [];
    let range: Parameters<typeof tokenizeLine>[1] = 'unknown';
    for (let l = 1; l <= startLine.number; l++) {
      const line = doc.line(l);
      const r = tokenizeLine(line.text, range);
      range = r.range;
      let col = 0;
      const arr: number[] = [];
      for (const t of r.tokens) {
        const abs = line.from + col;
        if (t.kind === 'Symbol' && t.text.length === 1 && (t.text === ch || t.text === partner) && abs <= pos) arr.push(abs);
        col += t.text.length;
      }
      symbolsBefore.push(arr);
    }
    for (let l = symbolsBefore.length - 1; l >= 0; l--) {
      const arr = symbolsBefore[l];
      for (let k = arr.length - 1; k >= 0; k--) {
        const c = doc.sliceString(arr[k], arr[k] + 1);
        if (c === ch) depth++;
        else {
          depth--;
          if (depth === 0) return arr[k];
        }
      }
    }
  }
  return null;
}

function isSymbolAt(doc: Text, pos: number) {
  const line = doc.lineAt(pos);
  // determine range state from the top (bounded)
  let range: Parameters<typeof tokenizeLine>[1] = 'unknown';
  const from = Math.max(1, line.number - 400);
  for (let l = from; l < line.number; l++) range = tokenizeLine(doc.line(l).text, range).range;
  const r = tokenizeLine(line.text, range);
  let col = 0;
  for (const t of r.tokens) {
    if (line.from + col === pos) return t.kind === 'Symbol';
    if (line.from + col > pos) return false;
    col += t.text.length;
  }
  return false;
}

export function bracketHighlighter(enabled: () => boolean): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;
      constructor(view: EditorView) {
        this.decorations = this.compute(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.selectionSet || u.focusChanged) this.decorations = this.compute(u.view);
      }
      compute(view: EditorView): DecorationSet {
        if (!enabled()) return Decoration.none;
        const sel = view.state.selection.main;
        if (!sel.empty) return Decoration.none;
        const doc = view.state.doc;
        const pos = sel.head;
        let at = -1;
        if (pos > 0 && BRACKETS.includes(doc.sliceString(pos - 1, pos))) at = pos - 1;
        else if (pos < doc.length && BRACKETS.includes(doc.sliceString(pos, pos + 1))) at = pos;
        if (at < 0 || doc.lineAt(at).number !== doc.lineAt(pos).number) return Decoration.none;
        if (!isSymbolAt(doc, at)) return Decoration.none;
        const m = findMatch(doc, at);
        if (m === null) return Decoration.none;
        const mark = Decoration.mark({ class: 'dev-bracket' });
        const a = Math.min(at, m);
        const b = Math.max(at, m);
        return Decoration.set([mark.range(a, a + 1), mark.range(b, b + 1)]);
      }
    },
    { decorations: (v) => v.decorations },
  );
}

export function bracketTheme(colors: ResolvedColors) {
  const sym = colors.attrs.Symbol;
  return EditorView.theme({
    '.dev-bracket': {
      backgroundColor: (sym.fg ?? '#ff0000') + ' !important',
      color: colors.bg + ' !important',
      fontWeight: sym.bold ? 'bold' : 'normal',
    },
    '.dev-bracket *': { color: colors.bg + ' !important' },
  });
}

// ------------------------------------------------------------------ selection text color

/** SynEdit paints selected text with the selection foreground; emulate it with a mark decoration */
export const selectionTextColor = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet = Decoration.none;
    constructor(view: EditorView) {
      this.decorations = this.compute(view);
    }
    update(u: ViewUpdate) {
      if (u.selectionSet || u.docChanged || u.viewportChanged) this.decorations = this.compute(u.view);
    }
    compute(view: EditorView) {
      const ranges = view.state.selection.ranges.filter((r) => !r.empty).map((r) => Decoration.mark({ class: 'cm-sel-text' }).range(r.from, r.to));
      return Decoration.set(ranges, true);
    }
  },
  { decorations: (v) => v.decorations },
);

// ------------------------------------------------------------------ overwrite mode

export const overwriteMode = new Compartment();

export function overwriteInput(): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (from !== to || text.length !== 1 || text === '\n') return false;
    const line = view.state.doc.lineAt(from);
    if (from >= line.to) return false;
    view.dispatch({ changes: { from, to: from + 1, insert: text }, selection: { anchor: from + 1 }, userEvent: 'input.type' });
    return true;
  });
}

// ------------------------------------------------------------------ right margin

export function rightMargin(column: number, color: string): Extension {
  return ViewPlugin.fromClass(
    class {
      el: HTMLDivElement;
      constructor(readonly view: EditorView) {
        this.el = document.createElement('div');
        this.el.className = 'dev-right-edge';
        this.el.style.borderLeft = `1px solid ${color}`;
        view.scrollDOM.appendChild(this.el);
        this.position();
      }
      position() {
        const cw = this.view.defaultCharacterWidth;
        const gutterW = (this.view.dom.querySelector('.cm-gutters') as HTMLElement | null)?.offsetWidth ?? 0;
        this.el.style.left = gutterW + 2 + cw * column + 'px';
      }
      update(u: ViewUpdate) {
        if (u.geometryChanged || u.viewportChanged) this.position();
      }
      destroy() {
        this.el.remove();
      }
    },
  );
}

// ------------------------------------------------------------------ special chars (eoShowSpecialChars)

class EolWidget extends WidgetType {
  toDOM() {
    const s = document.createElement('span');
    s.className = 'dev-eol';
    s.textContent = '¶';
    return s;
  }
}

export const showSpecialChars = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.compute(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = this.compute(u.view);
    }
    compute(view: EditorView) {
      const b = new RangeSetBuilder<Decoration>();
      for (const { from, to } of view.visibleRanges) {
        let pos = from;
        while (pos <= to) {
          const line = view.state.doc.lineAt(pos);
          const text = line.text;
          for (let i = 0; i < text.length; i++) {
            if (text[i] === ' ') b.add(line.from + i, line.from + i + 1, Decoration.mark({ class: 'dev-space' }));
            else if (text[i] === '\t') b.add(line.from + i, line.from + i + 1, Decoration.mark({ class: 'dev-tab' }));
          }
          if (line.number < view.state.doc.lines) b.add(line.to, line.to, Decoration.widget({ widget: new EolWidget(), side: 1 }));
          pos = line.to + 1;
        }
      }
      return b.finish();
    }
  },
  { decorations: (v) => v.decorations },
);

export { Prec, keymap, EditorState, syntaxTree };
