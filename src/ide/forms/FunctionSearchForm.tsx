import dfm from '../../generated/forms/FunctionSearchFrm.json';
import { showForm } from '../../vcl/VclForm';
import type { DfmNode } from '../../vcl/FormCtl';
import { ide } from '../ide';
import { parseFile, prettyStatement } from '../parser/CppParser';
import { localize } from './formUtils';

export async function showFunctionSearch() {
  const editor = ide.getEditor();
  if (!editor) return;
  const functions = parseFile(editor.text, editor.fileName, editor.inProject).statements.filter((s) => ['function', 'constructor', 'destructor'].includes(s.kind));
  let filtered = functions;
  await showForm(dfm as DfmNode, (c) => {
    localize(c, 'FunctionSearchFrm');
    const update = () => {
      const query = c.text('txtSearch').toLowerCase();
      filtered = functions.filter((s) => prettyStatement(s).toLowerCase().includes(query));
      c.set('lvEntries', { lvItems: filtered.map((s) => ({ caption: prettyStatement(s), subItems: [String(s.line)] })), selIndex: filtered.length ? 0 : -1 });
    };
    const go = () => { const s = filtered[c.get('lvEntries').selIndex ?? -1]; if (s) { editor.setCaretPosAndActivate(s.line, 1); ide.activate(editor); c.close(1); } };
    c.handlers.txtSearchChange = update; c.handlers.lvEntriesDblClick = go;
    c.handlers.txtSearchKeyPress = (_n, e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); go(); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); c.set('lvEntries', { selIndex: Math.max(0, Math.min(filtered.length - 1, (c.get('lvEntries').selIndex ?? 0) + (e.key === 'ArrowDown' ? 1 : -1))) }); }
    };
    update();
  }, { focus: 'txtSearch' });
}
