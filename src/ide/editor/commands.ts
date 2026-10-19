// SynEdit commands used by Dev-C++ actions (ecComment, ecDuplicateLine, ecMoveSelUp, ...).
import { EditorSelection } from '@codemirror/state';
import { undoDepth, redoDepth, indentMore, indentLess } from '@codemirror/commands';
import type { Editor } from './Editor';
import { ide } from '../ide';
import { lang } from '../../lang/lang';
import * as L from '../../generated/langIds';
import { settings } from '../config';
import { vfs, changeExt, extname } from '../../os/vfs';

function selectedLines(e: Editor) {
  const s = e.view.state;
  const sel = s.selection.main;
  const first = s.doc.lineAt(sel.from).number;
  let last = s.doc.lineAt(sel.to).number;
  if (last > first && sel.to === s.doc.line(last).from) last--;
  return { first, last };
}

export function canUndo(e: Editor) {
  return undoDepth(e.view.state) > 0;
}
export function canRedo(e: Editor) {
  return redoDepth(e.view.state) > 0;
}

export function comment(e: Editor) {
  const { first, last } = selectedLines(e);
  const doc = e.view.state.doc;
  const changes = [];
  for (let l = first; l <= last; l++) changes.push({ from: doc.line(l).from, insert: '//' });
  e.view.dispatch({ changes, userEvent: 'input' });
}

export function uncomment(e: Editor) {
  const { first, last } = selectedLines(e);
  const doc = e.view.state.doc;
  const changes = [];
  for (let l = first; l <= last; l++) {
    const line = doc.line(l);
    const m = /^(\s*)\/\//.exec(line.text);
    if (m) changes.push({ from: line.from + m[1].length, to: line.from + m[1].length + 2 });
  }
  if (changes.length) e.view.dispatch({ changes, userEvent: 'delete' });
}

export function toggleComment(e: Editor) {
  const { first, last } = selectedLines(e);
  const doc = e.view.state.doc;
  let all = true;
  for (let l = first; l <= last; l++) {
    if (!/^\s*\/\//.test(doc.line(l).text)) {
      all = false;
      break;
    }
  }
  if (all) uncomment(e);
  else comment(e);
}

export function toggleCommentInline(e: Editor) {
  const s = e.view.state;
  const sel = s.selection.main;
  const text = s.sliceDoc(sel.from, sel.to);
  if (text.startsWith('/*') && text.endsWith('*/')) {
    e.view.dispatch({ changes: { from: sel.from, to: sel.to, insert: text.slice(2, -2) }, selection: { anchor: sel.from, head: sel.to - 4 } });
  } else {
    e.view.dispatch({ changes: { from: sel.from, to: sel.to, insert: '/*' + text + '*/' }, selection: { anchor: sel.from, head: sel.to + 4 } });
  }
}

export function indent(e: Editor) {
  const { first, last } = selectedLines(e);
  if (first !== last) indentMore(e.view);
  else e.view.dispatch(e.view.state.replaceSelection(settings.editor.UseTabs ? '\t' : ' '.repeat(settings.editor.TabSize)));
}

export function unindent(e: Editor) {
  indentLess(e.view);
}

export function duplicateLine(e: Editor) {
  const s = e.view.state;
  const line = s.doc.lineAt(s.selection.main.head);
  e.view.dispatch({ changes: { from: line.to, insert: '\n' + line.text }, userEvent: 'input' });
}

export function deleteLine(e: Editor) {
  const s = e.view.state;
  const line = s.doc.lineAt(s.selection.main.head);
  const from = line.number < s.doc.lines ? line.from : Math.max(0, line.from - 1);
  const to = line.number < s.doc.lines ? line.to + 1 : line.to;
  const col = s.selection.main.head - line.from;
  e.view.dispatch({ changes: { from, to }, userEvent: 'delete' });
  const ns = e.view.state;
  const nl = ns.doc.lineAt(Math.min(from, ns.doc.length));
  e.view.dispatch({ selection: { anchor: Math.min(nl.to, nl.from + col) } });
}

export function moveSel(e: Editor, dir: -1 | 1) {
  const s = e.view.state;
  const { first, last } = selectedLines(e);
  if ((dir < 0 && first === 1) || (dir > 0 && last === s.doc.lines)) return;
  const a = s.doc.line(first);
  const b = s.doc.line(last);
  const block = s.sliceDoc(a.from, b.to);
  const sel = s.selection.main;
  if (dir < 0) {
    const prev = s.doc.line(first - 1);
    e.view.dispatch({
      changes: { from: prev.from, to: b.to, insert: block + '\n' + prev.text },
      selection: EditorSelection.range(sel.anchor - prev.length - 1, sel.head - prev.length - 1),
      userEvent: 'move.line',
      scrollIntoView: true,
    });
  } else {
    const next = s.doc.line(last + 1);
    e.view.dispatch({
      changes: { from: a.from, to: next.to, insert: next.text + '\n' + block },
      selection: EditorSelection.range(sel.anchor + next.length + 1, sel.head + next.length + 1),
      userEvent: 'move.line',
      scrollIntoView: true,
    });
  }
}

/** actNewSourceExecute */
export async function newSource() {
  if (ide.project) {
    const { MessageDlg } = await import('../../os/messagebox');
    const { mrYes } = await import('../../vcl/FormCtl');
    if ((await MessageDlg(lang(L.ID_MSG_NEWFILE), 'mtConfirmation', ['mbYes', 'mbNo'])) === mrYes) {
      const f = await import('../forms');
      await f.projectNewUnit();
      return;
    }
  }
  const e = ide.newEditor('', false, true);
  if (settings.editor.DefaultCode && settings.editor.DefaultCodeText) {
    const { parseMacros } = await import('../macros');
    e.insertString(parseMacros(settings.editor.DefaultCodeText), false);
    e.markSaved();
    e.setModified(false);
  }
  ide.activate(e);
}

/** actSwapHeaderSourceExecute */
export function swapHeaderSource() {
  const from = ide.getEditor();
  if (!from) return;
  const ext = extname(from.fileName).toLowerCase();
  const isC = ['.c', '.cpp', '.cc', '.cxx', '.c++', '.cp'].includes(ext);
  const isH = ['.h', '.hpp', '.rh', '.hh', '.hxx', '.inl'].includes(ext);
  if (!isC && !isH) return;
  const candidates = isC ? ['.h', '.hpp', '.rh', '.hh', '.hxx'] : ['.c', '.cpp', '.cc', '.cxx', '.c++', '.cp'];
  let target = '';
  for (const c of candidates) {
    const f = changeExt(from.fileName, c);
    if (ide.fileIsOpen(f) || vfs.fileExists(f) || (ide.project && ide.project.unitFromString(f) >= 0)) {
      target = f;
      break;
    }
  }
  const open = target ? ide.fileIsOpen(target) : null;
  if (open) return ide.activate(open);
  const e = target ? ide.getEditorFromFileName(target) : null;
  if (e) ide.activate(e);
  else ide.setStatusbarMessage(lang(isC ? L.ID_MSG_CORRESPONDINGHEADER : L.ID_MSG_CORRESPONDINGSOURCE));
}
