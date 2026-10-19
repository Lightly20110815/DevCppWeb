import add from '../../generated/forms/AddToDoFrm.json';
import view from '../../generated/forms/ViewToDoFrm.json';
import { showForm } from '../../vcl/VclForm';
import type { DfmNode } from '../../vcl/FormCtl';
import { ide } from '../ide';
import { vfs, USER_NAME, basename } from '../../os/vfs';
import { tokenizeLine } from '../editor/synCpp';
import { localize } from './formUtils';

export async function showAddToDo() {
  const editor = ide.getEditor();
  if (!editor) return;
  await showForm(add as DfmNode, (c) => {
    localize(c, 'AddToDoFrm'); c.text('txtUser', USER_NAME); c.value('spnPri', 0);
    c.handlers.btnOKClick = () => {
      const text = c.lines('memDescr').join('\n').trim().replace(/\*\//g, '* /');
      if (!text || editor.readOnly) return false;
      const line = editor.view.state.doc.lineAt(editor.view.state.selection.main.head);
      const indent = /^\s*/.exec(line.text)?.[0] ?? '';
      const prefix = `/* TODO (${c.text('txtUser').replace(/[\r\n]/g, '')}#${c.value('spnPri')}#): `;
      const comment = indent + prefix + text.split('\n').join('\n' + indent + ' '.repeat(prefix.length)) + ' */\n';
      editor.view.dispatch({ changes: { from: line.from, insert: comment }, userEvent: 'input' });
      c.close(1);
    };
  }, { focus: 'memDescr' });
}

interface Todo { file: string; line: number; from: number; done: boolean; description: string; priority: string; user: string }
export async function showViewToDo() {
  const def = structuredClone(view) as DfmNode;
  const find = (node: DfmNode): DfmNode | undefined => node.name === 'lv' ? node : node.children.map(find).find(Boolean);
  find(def)!.props.Checkboxes = 'True';
  let entries: Todo[] = [];
  await showForm(def, (c) => {
    localize(c, 'ViewToDoFrm');
    c.set('cmbFilter', { items: ['Current file', 'Open files', 'Project files'], itemIndex: ide.project ? 2 : 1 });
    const update = () => {
      const filter = c.itemIndex('cmbFilter');
      const names = filter === 0 ? [ide.getEditor()?.fileName].filter(Boolean) as string[] : filter === 2 ? ide.project?.units.map((u) => u.fileName) ?? [] : ide.allEditors.map((e) => e.fileName);
      entries = [];
      for (const file of new Set(names)) {
        const text = ide.fileIsOpen(file)?.text ?? (vfs.fileExists(file) ? vfs.readText(file) : '');
        let from = 0, range: Parameters<typeof tokenizeLine>[1];
        text.split('\n').forEach((line, index) => {
          const result = tokenizeLine(line, range); range = result.range;
          let column = 0;
          for (const token of result.tokens) {
            if (token.kind === 'Comment') for (const m of token.text.matchAll(/\b(TODO|DONE)\b\s*(?:\(([^#)]*)#(\d+)#\))?\s*:?\s*(.*?)(?:\*\/)?$/gi)) {
              const done = m[1].toUpperCase() === 'DONE';
              if (!done || !c.checked('chkNoDone')) entries.push({ file, line: index + 1, from: from + column + m.index!, done, user: m[2] ?? '', priority: m[3] ?? '', description: m[4].replace(/\s*\*\/$/, '').trim() });
            }
            column += token.text.length;
          }
          from += line.length + 1;
        });
      }
      c.set('lv', { columns: [{ caption: 'Description', width: 275 }, { caption: 'Priority', width: 55 }, { caption: 'User', width: 90 }, { caption: 'File', width: 130 }, { caption: 'Line', width: 45 }], lvItems: entries.map((t) => ({ caption: t.description, checked: t.done, subItems: [t.priority, t.user, basename(t.file), String(t.line)] })) });
    };
    c.handlers.cmbFilterChange = update; c.handlers.chkNoDoneClick = update;
    c.handlers['lv.ItemChecked'] = (_n, index: number, checked: boolean) => {
      const entry = entries[index]; if (!entry) return;
      const e = ide.fileIsOpen(entry.file), original = e?.text ?? vfs.readText(entry.file);
      const old = original.slice(entry.from, entry.from + 4);
      if (!/^(TODO|DONE)$/i.test(old)) { update(); return; }
      const value = checked ? 'DONE' : 'TODO';
      if (e) { if (e.readOnly) return; e.view.dispatch({ changes: { from: entry.from, to: entry.from + 4, insert: value }, userEvent: 'input' }); }
      else vfs.write(entry.file, original.slice(0, entry.from) + value + original.slice(entry.from + 4));
      update();
    };
    c.handlers.lvDblClick = async () => { const entry = entries[c.get('lv').selIndex ?? -1]; if (entry) { await ide.openFile(entry.file); ide.fileIsOpen(entry.file)?.setCaretPosAndActivate(entry.line, 1); c.close(1); } };
    c.handlers.btnCloseClick = () => c.close(1); update();
  });
}
