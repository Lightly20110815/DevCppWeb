// TEditor: one open source file (Editor.pas), backed by a CodeMirror view.
import { EditorState, Compartment, EditorSelection, Prec } from '@codemirror/state';
import type { Extension, Transaction } from '@codemirror/state';
import { EditorView, keymap, drawSelection, highlightActiveLine, dropCursor, scrollPastEnd, highlightSpecialChars } from '@codemirror/view';
import { history, defaultKeymap, historyKeymap, indentLess, indentMore, undo, redo, cursorLineBoundaryBackward, selectLineBoundaryBackward } from '@codemirror/commands';
import { indentUnit, codeFolding, foldKeymap, indentOnInput } from '@codemirror/language';
import { synCppLanguage, tokenizeLine } from './synCpp';
import {
  highlightExtension, themeExtension, resolveColors, lineMarksField, setLineMarks, specialLineDecorations, specialLineTheme,
  braceFolding, foldGutterExt, lineNumberGutter, bracketHighlighter, bracketTheme, selectionTextColor, overwriteMode,
  overwriteInput, rightMargin, showSpecialChars, foldAll, unfoldAll, computeFolds,
} from './extensions';
import type { LineMarks } from './extensions';
import { devEditor, settings } from '../config';
import { delphiColor } from '../colors';
import { basename, extname } from '../../os/vfs';
import { completionExtension } from './completion';

export type EditorHost = {
  onStatusChange(e: Editor, what: { modified?: boolean; selection?: boolean; insertMode?: boolean }): void;
  onKeyChar?(e: Editor, ch: string): void;
  onContextMenu?(e: Editor, ev: MouseEvent): void;
  onGutterClick?(e: Editor, line: number): void;
  onCtrlClick?(e: Editor, pos: number): void;
  onMouseHover?(e: Editor, pos: number, ev: MouseEvent): void;
  onFocus?(e: Editor): void;
  onDropFiles?(e: Editor, files: FileList): void;
};

let untitledCounter = 0;
export function nextUntitledNumber() {
  return ++untitledCounter;
}

function usesHighlighter(fileName: string, untitledPrefix: string) {
  if (!devEditor.UseSyntax) return false;
  if (!fileName || basename(fileName).startsWith(untitledPrefix)) return true;
  const ext = extname(fileName).toLowerCase();
  if (ext === '.rc') return true;
  const list = devEditor.SyntaxExt.split(';');
  const e = ext.replace(/^\./, '');
  return list.some((x) => x.toLowerCase() === e);
}

export class Editor {
  fileName: string;
  inProject: boolean;
  isNew: boolean;
  view: EditorView;
  host: EditorHost;
  pane: 'left' | 'right' = 'left';
  private savedDoc: EditorState['doc'];
  private _modified = false;
  insertMode = true;
  readOnly = false;
  errorLine = -1;
  activeLine = -1;
  breakpoints = new Set<number>();
  bookmarks = new Map<number, number>(); // 1..9 -> line
  highlighted: boolean;
  untitledPrefix: string;

  private cHighlight = new Compartment();
  private cTheme = new Compartment();
  private cLang = new Compartment();
  private cOptions = new Compartment();
  private cGutter = new Compartment();
  private cReadOnly = new Compartment();
  private ignoreCaretChange = false;
  /** symbol completion states (TSymbolCompletionState) */
  parenState: 'none' | 'inserted' | 'finished' | 'skipped' = 'none';
  arrayState: 'none' | 'inserted' | 'finished' | 'skipped' = 'none';
  braceState: 'none' | 'inserted' | 'finished' | 'skipped' = 'none';

  constructor(opts: { fileName: string; text: string; inProject: boolean; isNew: boolean; host: EditorHost; untitledPrefix: string }) {
    this.fileName = opts.fileName;
    this.inProject = opts.inProject;
    this.isNew = opts.isNew;
    this.host = opts.host;
    this.untitledPrefix = opts.untitledPrefix;
    this.highlighted = usesHighlighter(this.fileName, this.untitledPrefix);
    const state = EditorState.create({ doc: opts.text, extensions: this.buildExtensions() });
    this.savedDoc = state.doc;
    this.view = new EditorView({ state });
    this.view.dom.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      // right mouse moves cursor (eoRightMouseMovesCursor)
      const pos = this.view.posAtCoords({ x: ev.clientX, y: ev.clientY });
      if (pos !== null) {
        const sel = this.view.state.selection.main;
        if (pos < sel.from || pos > sel.to) this.view.dispatch({ selection: { anchor: pos } });
      }
      this.host.onContextMenu?.(this, ev);
    });
    this.view.dom.addEventListener('mousedown', (ev) => {
      if (ev.ctrlKey && ev.button === 0) {
        const pos = this.view.posAtCoords({ x: ev.clientX, y: ev.clientY });
        if (pos !== null) {
          ev.preventDefault();
          this.host.onCtrlClick?.(this, pos);
        }
      }
    });
    this.view.dom.addEventListener('dragover', (ev) => {
      if (ev.dataTransfer?.types.includes('Files')) ev.preventDefault();
    });
    this.view.dom.addEventListener('drop', (ev) => {
      if (ev.dataTransfer?.files.length) {
        ev.preventDefault();
        ev.stopPropagation();
        this.host.onDropFiles?.(this, ev.dataTransfer.files);
      }
    });
    let hoverTimer = 0;
    this.view.dom.addEventListener('mousemove', (ev) => {
      window.clearTimeout(hoverTimer);
      this.view.dom.classList.toggle('ctrl-hover', ev.ctrlKey);
      hoverTimer = window.setTimeout(() => {
        const pos = this.view.posAtCoords({ x: ev.clientX, y: ev.clientY }, false);
        if (pos !== null) this.host.onMouseHover?.(this, pos, ev);
      }, 500);
    });
    this.view.dom.addEventListener('mouseleave', () => window.clearTimeout(hoverTimer));
    this.view.contentDOM.addEventListener('focus', () => this.host.onFocus?.(this));
  }

  private buildExtensions(): Extension[] {
    const ed = devEditor;
    return [
      this.cLang.of(this.highlighted ? synCppLanguage : []),
      this.cHighlight.of(this.highlighted ? highlightExtension(ed) : []),
      this.cTheme.of(this.themeExt()),
      this.cGutter.of(this.gutterExt()),
      this.cOptions.of(this.optionsExt()),
      this.cReadOnly.of(EditorState.readOnly.of(false)),
      overwriteMode.of([]),
      lineMarksField,
      history({ newGroupDelay: ed.GroupUndo ? 500 : 0 }),
      drawSelection({ cursorBlinkRate: 530 }),
      dropCursor(),
      highlightSpecialChars(),
      codeFolding({ placeholderText: '...' }),
      braceFolding,
      selectionTextColor,
      bracketHighlighter(() => devEditor.Match && this.highlighted),
      indentOnInput(),
      Prec.high(keymap.of(this.editorKeys())),
      keymap.of([...defaultKeymap.filter((k) => !['Mod-d', 'Mod-[', 'Mod-]', 'Mod-i', 'Alt-ArrowUp', 'Alt-ArrowDown', 'Shift-Alt-ArrowUp', 'Shift-Alt-ArrowDown', 'Mod-Enter', 'Mod-Alt-\\', 'Shift-Mod-k', 'Mod-/', 'Alt-A', 'Shift-Mod-\\', 'Mod-u'].includes(k.key ?? '')), ...historyKeymap, ...foldKeymap]),
      EditorState.transactionFilter.of((tr) => this.filterTransaction(tr)),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) {
          const m = !u.state.doc.eq(this.savedDoc);
          if (m !== this._modified) {
            this._modified = m;
            this.host.onStatusChange(this, { modified: true });
          }
          if (this.errorLine !== -1 && !this.ignoreCaretChange) {
            // keep error highlight until the caret moves
          }
        }
        if (u.selectionSet || u.docChanged) {
          if (u.selectionSet && !this.ignoreCaretChange && this.errorLine !== -1 && u.transactions.some((t) => t.isUserEvent('select') || t.isUserEvent('input') || t.isUserEvent('delete') || t.isUserEvent('move'))) {
            this.errorLine = -1;
            this.pushMarks();
          }
          this.ignoreCaretChange = false;
          if (this.parenState === 'inserted') this.parenState = 'finished';
          if (this.arrayState === 'inserted') this.arrayState = 'finished';
          if (this.braceState === 'inserted') this.braceState = 'finished';
          this.host.onStatusChange(this, { selection: true });
        }
      }),
    ];
  }

  private themeExt(): Extension {
    const colors = resolveColors(devEditor);
    return [themeExtension(devEditor, this.highlighted), specialLineTheme(colors), bracketTheme(colors), specialLineDecorations(colors)];
  }

  private gutterExt(): Extension {
    const ed = devEditor;
    if (!ed.ShowGutter) return [];
    return [
      lineNumberGutter({
        lineNumbers: ed.LineNumbers,
        leadZero: ed.LeadZero,
        firstIsZero: ed.FirstIsZero,
        digits: ed.GutterAuto ? 1 : ed.GutterSize,
        onClick: (line) => this.host.onGutterClick?.(this, line),
      }),
      this.highlighted ? foldGutterExt() : [],
    ];
  }

  private optionsExt(): Extension {
    const ed = devEditor;
    const ext: Extension[] = [
      EditorState.tabSize.of(ed.TabSize),
      indentUnit.of(ed.UseTabs ? '\t' : ' '.repeat(ed.TabSize)),
      completionExtension(this.fileName),
    ];
    if (ed.HighCurrLine && this.highlighted) ext.push(highlightActiveLine());
    if (ed.PastEOF) ext.push(scrollPastEnd());
    if (ed.MarginVis) ext.push(rightMargin(ed.MarginSize, delphiColor(ed.MarginColor) ?? '#e3e3e3'));
    if (ed.SpecialChar) ext.push(showSpecialChars);
    ext.push(EditorView.editorAttributes.of({ class: `caret-ins-${ed.InsertCaret} caret-ovr-${ed.OverwriteCaret}` }));
    return ext;
  }

  /** Re-applies devEditor settings (TdevEditor.AssignEditor) */
  applySettings() {
    this.highlighted = usesHighlighter(this.fileName, this.untitledPrefix);
    this.view.dispatch({
      effects: [
        this.cLang.reconfigure(this.highlighted ? synCppLanguage : []),
        this.cHighlight.reconfigure(this.highlighted ? highlightExtension(devEditor) : []),
        this.cTheme.reconfigure(this.themeExt()),
        this.cGutter.reconfigure(this.gutterExt()),
        this.cOptions.reconfigure(this.optionsExt()),
      ],
    });
  }

  private editorKeys() {
    return [
      { key: 'Tab', run: (v: EditorView) => this.tabKey(v, false) },
      { key: 'Shift-Tab', run: (v: EditorView) => this.tabKey(v, true) },
      { key: 'Insert', run: () => this.toggleInsertMode() },
      { key: 'Home', run: (v: EditorView) => this.homeKey(v, false), shift: (v: EditorView) => this.homeKey(v, true) },
      { key: 'Backspace', run: () => this.deletePair(true) },
      { key: 'Delete', run: () => this.deletePair(false) },
      { key: 'Enter', run: (v: EditorView) => this.enterKey(v) },
    ];
  }

  private enterKey(v: EditorView) {
    if (!devEditor.AutoIndent) {
      v.dispatch(v.state.replaceSelection(v.state.lineBreak), { userEvent: 'input', scrollIntoView: true });
      return true;
    }
    // SynEdit eoAutoIndent: copy the leading whitespace of the current line
    const sel = v.state.selection.main;
    const line = v.state.doc.lineAt(sel.head);
    const indent = /^[ \t]*/.exec(line.text)![0];
    const before = line.text.slice(0, sel.head - line.from);
    let extra = '';
    // eoAddIndent: add indent after an opening brace
    if (devEditor.AddIndent && /\{\s*$/.test(before)) extra = devEditor.UseTabs ? '\t' : ' '.repeat(devEditor.TabSize);
    const after = line.text.slice(sel.head - line.from);
    // "{|}" -> put the closing brace on its own line
    if (extra && /^\s*\}/.test(after)) {
      const ins = '\n' + indent + extra + '\n' + indent;
      v.dispatch({ changes: { from: sel.from, to: sel.to, insert: ins }, selection: { anchor: sel.from + 1 + indent.length + extra.length }, userEvent: 'input', scrollIntoView: true });
      return true;
    }
    const ins = '\n' + (indent.length <= before.length ? indent : before.match(/^[ \t]*/)![0]) + extra;
    v.dispatch({ changes: { from: sel.from, to: sel.to, insert: ins }, selection: { anchor: sel.from + ins.length }, userEvent: 'input', scrollIntoView: true });
    return true;
  }

  private tabKey(v: EditorView, shift: boolean) {
    const sel = v.state.selection.main;
    if (shift) return indentLess(v);
    if (!sel.empty && v.state.doc.lineAt(sel.from).number !== v.state.doc.lineAt(sel.to).number) return indentMore(v);
    const ins = devEditor.UseTabs ? '\t' : ' '.repeat(devEditor.TabSize - ((sel.from - v.state.doc.lineAt(sel.from).from) % devEditor.TabSize));
    v.dispatch(v.state.replaceSelection(ins), { userEvent: 'input', scrollIntoView: true });
    return true;
  }

  private homeKey(v: EditorView, extend: boolean) {
    if (!devEditor.EHomeKey) return extend ? selectLineBoundaryBackward(v) : cursorLineBoundaryBackward(v);
    // eoEnhanceHomeKey: toggle between first non blank char and column 1
    const sel = v.state.selection.main;
    const line = v.state.doc.lineAt(sel.head);
    const first = line.from + (/^[ \t]*/.exec(line.text)![0].length);
    const target = sel.head === first ? line.from : first;
    v.dispatch({ selection: extend ? EditorSelection.range(sel.anchor, target) : EditorSelection.cursor(target), scrollIntoView: true, userEvent: 'select' });
    return true;
  }

  private deletePair(back: boolean) {
    if (!devEditor.DeleteSymbolPairs || !this.highlighted) return false;
    const v = this.view;
    const sel = v.state.selection.main;
    if (!sel.empty) return false;
    const line = v.state.doc.lineAt(sel.head);
    const col = sel.head - line.from;
    const s = line.text;
    const del = back ? s[col - 1] : s[col];
    const next = back ? s[col] : s[col + 1];
    const ed = devEditor;
    const pair =
      (ed.ArrayComplete && del === '[' && next === ']') ||
      (ed.ParentheseComplete && del === '(' && next === ')') ||
      (ed.BraceComplete && del === '{' && next === '}') ||
      (ed.SingleQuoteComplete && del === "'" && next === "'") ||
      (ed.DoubleQuoteComplete && del === '"' && next === '"');
    if (!pair || (back && col < 1)) return false;
    const from = back ? sel.head - 1 : sel.head;
    v.dispatch({ changes: { from, to: from + 2 }, selection: { anchor: from }, userEvent: 'delete' });
    return true;
  }

  toggleInsertMode() {
    this.insertMode = !this.insertMode;
    this.view.dispatch({ effects: overwriteMode.reconfigure(this.insertMode ? [] : overwriteInput()) });
    this.view.dom.classList.toggle('overwrite', !this.insertMode);
    this.host.onStatusChange(this, { insertMode: true });
    return true;
  }

  // ---------------------------------------------------------------- symbol completion (HandleSymbolCompletion)

  private filterTransaction(tr: Transaction): Transaction | readonly Transaction[] {
    if (!tr.isUserEvent('input.type') || !tr.docChanged || !this.highlighted) return tr;
    let typed = '';
    let at = -1;
    let count = 0;
    tr.changes.iterChanges((fromA, toA, _fromB, _toB, ins) => {
      count++;
      if (fromA === toA) {
        typed = ins.toString();
        at = fromA;
      }
    });
    if (count !== 1 || typed.length !== 1 || at < 0) return tr;
    const startState = tr.startState;
    if (!startState.selection.main.empty) return tr;
    const r = this.symbolCompletion(startState, at, typed);
    if (r) return r;
    this.host.onKeyChar?.(this, typed);
    return tr;
  }

  private symbolCompletion(state: EditorState, pos: number, key: string): Transaction | readonly Transaction[] | null {
    const ed = devEditor;
    const reset = () => {
      if (!'()[]{}*<\'"'.includes(key)) {
        this.parenState = 'skipped';
        this.arrayState = 'skipped';
        this.braceState = 'skipped';
      }
    };
    if (!ed.CompleteSymbols) return null;
    // find end of first non blank line above (or this line up to caret)
    const doc = state.doc;
    const line = doc.lineAt(pos);
    let ln = line.number;
    let checkPos = pos;
    if (pos === line.from) {
      ln--;
      while (ln > 0 && doc.line(ln).length === 0) ln--;
      checkPos = ln > 0 ? doc.line(ln).to : -1;
    }
    if (checkPos > 0) {
      const kind = this.kindAt(state, checkPos - 1);
      if (kind === 'String' || kind === 'Comment' || kind === 'Character') {
        reset();
        return null;
      }
    }
    const lineText = line.text;
    const col = pos - line.from;
    const before = lineText.slice(0, col);
    const mk = (insert: string, cursorOffset: number) =>
      state.update({ changes: { from: pos, insert }, selection: { anchor: pos + cursorOffset }, userEvent: 'input.type', scrollIntoView: true });
    const skip = () => state.update({ selection: { anchor: pos + 1 }, userEvent: 'select', scrollIntoView: true });
    switch (key) {
      case '(':
        if (ed.ParentheseComplete) {
          this.parenState = 'inserted';
          this.host.onKeyChar?.(this, '(');
          return mk('()', 1);
        }
        break;
      case ')':
        if (ed.ParentheseComplete && this.parenState === 'finished' && lineText[col] === ')') {
          this.parenState = 'skipped';
          return skip();
        }
        break;
      case '[':
        if (ed.ArrayComplete) {
          this.arrayState = 'inserted';
          return mk('[]', 1);
        }
        break;
      case ']':
        if (ed.ParentheseComplete && this.arrayState === 'finished' && lineText[col] === ']') {
          this.arrayState = 'skipped';
          return skip();
        }
        break;
      case '*':
        if (ed.CommentComplete && col > 0 && lineText[col - 1] === '/') return mk('**/', 1);
        break;
      case '{':
        if (ed.BraceComplete) {
          const trimmed = before.trim();
          const indent = /^[ \t]*/.exec(lineText)![0];
          const tab = state.facet(EditorState.tabSize);
          const indentCount = [...indent].reduce((a, c) => (c === '\t' ? a + tab - (a % tab) : a + 1), 0);
          const ind = ed.UseTabs ? '\t'.repeat(Math.floor(indentCount / tab)) + ' '.repeat(indentCount % tab) : ' '.repeat(indentCount);
          if (/^case/.test(trimmed) || /^default/.test(trimmed)) {
            const more = ed.UseTabs ? '\t'.repeat(Math.floor((indentCount + tab) / tab)) : ' '.repeat(indentCount + tab);
            return mk('{\n' + more + 'break;\n' + ind + '}', 1);
          }
          if (/\)$/.test(trimmed) || trimmed === '' || /else$/.test(trimmed) || /try$/.test(trimmed) || /catch$/.test(trimmed) || /^namespace/.test(trimmed) || /do$/.test(trimmed))
            return mk('{\n' + ind + '}', 1);
          if (/^(struct|union|class|enum|typedef )/.test(trimmed)) return mk('{\n' + ind + '};', 1);
          this.braceState = 'inserted';
          return mk('{}', 1);
        }
        break;
      case '}':
        if (ed.BraceComplete && this.braceState === 'finished' && lineText[col] === '}') {
          this.braceState = 'skipped';
          return skip();
        }
        break;
      case '<':
        if (ed.IncludeComplete && /^#include/.test(lineText)) return mk('<>', 1);
        break;
      case "'":
        if (ed.SingleQuoteComplete) return mk("''", 1);
        break;
      case '"':
        if (ed.IncludeComplete && /^#include/.test(lineText)) return mk('""', 1);
        if (ed.DoubleQuoteComplete) return mk('""', 1);
        break;
    }
    reset();
    return null;
  }

  /** highlighter attribute name at a position */
  kindAt(state: EditorState, pos: number): string | null {
    const doc = state.doc;
    if (pos < 0 || pos >= doc.length) return null;
    const line = doc.lineAt(pos);
    const from = Math.max(1, line.number - 300);
    let range: Parameters<typeof tokenizeLine>[1] = 'unknown';
    for (let l = from; l < line.number; l++) range = tokenizeLine(doc.line(l).text, range).range;
    const r = tokenizeLine(line.text, range);
    let col = 0;
    for (const t of r.tokens) {
      if (pos - line.from < col + t.text.length) return t.kind;
      col += t.text.length;
    }
    return null;
  }

  // ---------------------------------------------------------------- basic properties

  get text() {
    return this.view.state.doc.toString();
  }

  set text(v: string) {
    this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: v } });
  }

  get modified() {
    return this._modified;
  }

  markSaved() {
    this.savedDoc = this.view.state.doc;
    this._modified = false;
    this.host.onStatusChange(this, { modified: true });
  }

  setModified(v: boolean) {
    if (v) {
      this._modified = true;
      this.savedDoc = EditorState.create({ doc: '\u0000' }).doc;
    } else this.savedDoc = this.view.state.doc;
    this._modified = v;
    this.host.onStatusChange(this, { modified: true });
  }

  get caretLine() {
    const s = this.view.state;
    return s.doc.lineAt(s.selection.main.head).number;
  }

  /** SynEdit DisplayX (1-based, tabs expanded) */
  get caretCol() {
    const s = this.view.state;
    const head = s.selection.main.head;
    const line = s.doc.lineAt(head);
    const tab = s.facet(EditorState.tabSize);
    let x = 0;
    for (const ch of line.text.slice(0, head - line.from)) x = ch === '\t' ? x + tab - (x % tab) : x + 1;
    return x + 1;
  }

  get caretChar() {
    const s = this.view.state;
    const head = s.selection.main.head;
    return head - s.doc.lineAt(head).from + 1;
  }

  get selLength() {
    const m = this.view.state.selection.main;
    return m.to - m.from;
  }

  get selText() {
    const m = this.view.state.selection.main;
    return this.view.state.sliceDoc(m.from, m.to);
  }

  get selAvail() {
    return !this.view.state.selection.main.empty;
  }

  get lineCount() {
    return this.view.state.doc.lines;
  }

  /** Offsets for CodeMirror transactions; line breaks count as one character. */
  get documentLength() {
    return this.view.state.doc.length;
  }

  /** Windows CRLF length, used only for the Dev-C++ status bar. */
  get textLength() {
    // Lines.GetTextLength counts CR+LF line breaks
    return this.view.state.doc.length + (this.view.state.doc.lines - 1);
  }

  lineText(n: number) {
    return n >= 1 && n <= this.lineCount ? this.view.state.doc.line(n).text : '';
  }

  focus() {
    this.view.focus();
  }

  setReadOnly(v: boolean) {
    this.readOnly = v;
    this.view.dispatch({ effects: this.cReadOnly.reconfigure(EditorState.readOnly.of(v)) });
  }

  // ---------------------------------------------------------------- caret / marks

  setCaretPosAndActivate(line: number, col: number) {
    const doc = this.view.state.doc;
    const l = doc.line(Math.max(1, Math.min(line, doc.lines)));
    const pos = Math.min(l.from + Math.max(0, col - 1), l.to);
    this.view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
    this.view.focus();
  }

  setErrorFocus(col: number, line: number) {
    this.ignoreCaretChange = true;
    this.errorLine = line;
    this.pushMarks();
    this.ignoreCaretChange = true;
    this.setCaretPosAndActivate(line, col);
  }

  setActiveBreakpointFocus(line: number) {
    this.activeLine = line;
    this.pushMarks();
    this.setCaretPosAndActivate(line, 1);
  }

  removeBreakpointFocus() {
    if (this.activeLine !== -1) {
      this.activeLine = -1;
      this.pushMarks();
    }
  }

  toggleBreakpoint(line: number) {
    if (this.breakpoints.has(line)) this.breakpoints.delete(line);
    else this.breakpoints.add(line);
    this.pushMarks();
  }

  pushMarks() {
    const m: LineMarks = { errorLine: this.errorLine, activeLine: this.activeLine, breakpoints: new Set(this.breakpoints) };
    this.view.dispatch({ effects: setLineMarks.of(m) });
  }

  syncBreakpointsFromState() {
    this.breakpoints = new Set(this.view.state.field(lineMarksField).breakpoints);
  }

  // ---------------------------------------------------------------- editing helpers

  /** TEditor.InsertString: '*|*' marks the new caret position */
  insertString(value: string, moveCursor: boolean) {
    const v = this.view;
    const sel = v.state.selection.main;
    let text = value.replace(/\r\n/g, '\n');
    let caret = sel.from;
    const marker = text.indexOf('*|*');
    if (moveCursor && marker >= 0) {
      text = text.slice(0, marker) + text.slice(marker + 3);
      caret = sel.from + marker;
    }
    v.dispatch({ changes: { from: sel.from, to: sel.to, insert: text }, selection: { anchor: caret }, userEvent: 'input', scrollIntoView: true });
  }

  selectAll() {
    this.view.dispatch({ selection: { anchor: 0, head: this.view.state.doc.length } });
  }

  undo() {
    return undo(this.view);
  }

  redo() {
    return redo(this.view);
  }

  foldAll() {
    foldAll(this.view);
  }

  unfoldAll() {
    unfoldAll(this.view);
  }

  canUndo() {
    return (this.view.state.field(historyField, false) as any)?.done?.length > 0;
  }

  /** Word / expression at a position (GetWordAtPosition) */
  wordAt(pos: number, purpose: 'completion' | 'evaluation' | 'information' | 'normal'): string {
    const doc = this.view.state.doc;
    const line = doc.lineAt(pos);
    const s = line.text;
    const isId = (c: string | undefined) => !!c && /[A-Za-z0-9_]/.test(c);
    let wb = pos - line.from; // index after which word starts (0-based exclusive)
    let we = pos - line.from;
    if (purpose === 'evaluation' || purpose === 'information') {
      while (we < s.length) {
        if (purpose === 'evaluation' && s[we] === '[') {
          const close = findComplement(s, '[', ']', we, 1);
          if (close < 0) break;
          we = close + 1;
        } else if (isId(s[we])) we++;
        else break;
      }
    }
    if (purpose !== 'normal') {
      while (wb > 0) {
        const c = s[wb - 1];
        if (c === ']') {
          const open = findComplement(s, ']', '[', wb - 1, -1);
          if (open < 0) break;
          wb = open;
        } else if (isId(c)) wb--;
        else if (c === '.' || c === ':' || c === '~') wb--;
        else if (c === '>' && wb > 1 && s[wb - 2] === '-') wb -= 2;
        else if (c === ')' && wb > 1) {
          const open = findComplement(s, ')', '(', wb - 1, -1);
          if (open < 0) break;
          wb = open;
        } else break;
      }
    }
    let result = s.slice(wb, we);
    // strip function parameters and array indices
    for (;;) {
      const pb = result.indexOf('(');
      if (pb < 0) break;
      const pe = findComplement(result, '(', ')', pb, 1);
      if (pe < 0) break;
      result = result.slice(0, pb) + result.slice(pe + 1);
    }
    if (purpose !== 'evaluation') {
      for (;;) {
        const pb = result.indexOf('[');
        if (pb < 0) break;
        const pe = findComplement(result, '[', ']', pb, 1);
        if (pe < 0) break;
        result = result.slice(0, pb) + result.slice(pe + 1);
      }
    }
    return result;
  }

  /** identifier under a position */
  identifierAt(pos: number): { word: string; from: number; to: number } {
    const doc = this.view.state.doc;
    const line = doc.lineAt(pos);
    const s = line.text;
    let a = pos - line.from;
    let b = a;
    while (a > 0 && /[A-Za-z0-9_]/.test(s[a - 1])) a--;
    while (b < s.length && /[A-Za-z0-9_]/.test(s[b])) b++;
    return { word: s.slice(a, b), from: line.from + a, to: line.from + b };
  }

  /** fold info for collapse all */
  folds() {
    return computeFolds(this.view.state.doc);
  }

  destroy() {
    this.view.destroy();
  }

  setFileName(name: string) {
    this.fileName = name;
    this.applySettings();
  }
}

import { historyField } from '@codemirror/commands';

/** Utils.FindComplement on a string; returns index of the matching token or -1 */
export function findComplement(s: string, from: string, to: string, cur: number, inc: number) {
  let level = 0;
  let i = cur;
  while (i >= 0 && i < s.length) {
    if (s[i] === from) level++;
    else if (s[i] === to) {
      level--;
      if (level === 0) return i;
    }
    i += inc;
  }
  return -1;
}

export const editorSettingsVersion = { v: 0 };
export { settings };
