import type { Editor } from './Editor';
import { autocompletion, startCompletion, completionKeymap } from '@codemirror/autocomplete';
import type { Completion, CompletionContext } from '@codemirror/autocomplete';
import { keymap } from '@codemirror/view';
import { ide } from '../ide';
import { parser } from '../parser/service';
import { scanLocals } from '../parser/CppParser';
import { CPP_KEYWORDS } from './synCpp';
import { settings } from '../config';

export function completionExtension(fileName: string) {
  return [autocompletion({
    activateOnTyping: settings.codeCompletion.Enabled,
    activateOnTypingDelay: settings.codeCompletion.Delay,
    override: [(context: CompletionContext) => {
      const word = context.matchBefore(/[A-Za-z_]\w*/);
      if (!word && !context.explicit) return null;
      const editor = ide.fileIsOpen(fileName);
      if (editor) parser.parse(fileName, editor.inProject, false, context.state.doc.toString());
      const options = new Map<string, Completion>();
      for (const keyword of CPP_KEYWORDS) options.set(keyword, { label: keyword, type: 'keyword' });
      const body = parser.findBody(fileName, context.state.doc.lineAt(context.pos).number);
      const statements = [...parser.statements, ...(body ? scanLocals(context.state.doc.toString(), body, context.state.doc.lineAt(context.pos).number) : [])];
      for (const s of statements) options.set(s.command, { label: s.command, detail: [s.type, s.args].filter(Boolean).join(' '), type: s.kind === 'class' ? 'class' : ['function', 'constructor', 'destructor'].includes(s.kind) ? 'function' : 'variable' });
      for (const name of context.state.doc.toString().match(/[A-Za-z_]\w{2,}/g) ?? []) if (!options.has(name)) options.set(name, { label: name, type: 'text' });
      return { from: word?.from ?? context.pos, options: [...options.values()], validFor: /^\w*$/ };
    }],
  }), keymap.of(completionKeymap)];
}

export function showCompletionNow() { const e = ide.getEditor(); if (e) { e.view.focus(); startCompletion(e.view); } }
export function onKeyChar(_e: Editor, _ch: string) { /* CodeMirror schedules completion after the input transaction. */ }
export function onCaretMoved(_e: Editor) { /* CodeMirror maps the completion range to the current selection. */ }
