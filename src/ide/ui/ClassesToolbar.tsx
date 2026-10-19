// tbClasses: (globals)/class selector and member selector (RebuildClassesToolbar).
import { useState } from 'react';
import { useIde, ide } from '../ide';
import { parser } from '../parser/service';
import { statementKindStr } from '../parser/CppParser';
import type { Statement } from '../parser/CppParser';
import { ComboBox } from '../../vcl/controls';

export function ClassesToolbar() {
  useIde('ui');
  const [cls, setCls] = useState('(globals)');
  const all = parser.statements;
  const classes = all.filter((s) => s.inProject && s.kind === 'class').sort((a, b) => a.command.localeCompare(b.command));
  const classItems = ['(globals)', ...classes.map((c) => c.command)];
  const ci = Math.max(0, classItems.indexOf(cls));
  const parent: Statement | null = ci > 0 ? classes[ci - 1] : null;
  const members: Statement[] = [];
  for (const kind of ['constructor', 'destructor', 'function'] as const)
    for (const s of all) if (s.parent === parent && s.inProject && s.kind === kind) members.push(s);
  const memberItems = members.map((s) => `${statementKindStr(s.kind)} ${s.command}${s.args} : ${s.type}`);
  return (
    <>
      <ComboBox className="tb-combo mono" items={classItems} index={ci} style={{ width: 350, height: 22 }} maxItems={16} onChange={(i) => setCls(classItems[i])} />
      <ComboBox
        className="tb-combo mono"
        items={memberItems}
        index={-1}
        style={{ width: 350, height: 22 }}
        maxItems={16}
        onChange={(i) => {
          const st = members[i];
          if (!st) return;
          const file = st.definitionFileName || st.fileName;
          const line = st.definitionLine || st.line;
          const e = ide.getEditorFromFileName(file);
          if (e) {
            e.setCaretPosAndActivate(line, 1);
            ide.activate(e);
          }
        }}
      />
    </>
  );
}
