import dfm from '../../generated/forms/IncrementalFrm.json';
import { showForm } from '../../vcl/VclForm';
import type { DfmNode } from '../../vcl/FormCtl';
import { ide } from '../ide';
import { matches } from './FindForm';
import { localize } from './formUtils';

export async function showIncremental() {
  const editor = ide.getEditor();
  if (!editor) return;
  const origin = editor.view.state.selection.main.head;
  await showForm(dfm as DfmNode, (c) => {
    localize(c, 'IncrementalFrm');
    const find = (back = false, fresh = false) => {
      const word = c.text('Edit');
      const hits = matches(editor.text, word);
      const selection = editor.view.state.selection.main;
      const pos = fresh ? origin : back ? selection.from : selection.to;
      const hit = back ? hits.findLast((m) => m.to <= pos) ?? hits.at(-1) : hits.find((m) => m.from >= pos) ?? hits[0];
      if (hit) editor.view.dispatch({ selection: { anchor: hit.from, head: hit.to }, scrollIntoView: true });
      c.set('Edit', { fontColor: hits.length || !word ? '#000000' : '#cc0000' });
    };
    c.handlers.EditChange = () => find(false, true);
    c.handlers.btnNextClick = () => find(); c.handlers.btnPrevClick = () => find(true);
    c.handlers.EditKeyPress = (_n, e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); find(e.shiftKey); } };
  }, { focus: 'Edit' });
  ide.activate(editor);
}
