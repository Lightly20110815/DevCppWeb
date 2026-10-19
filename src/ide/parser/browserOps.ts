import type { Editor } from '../editor/Editor';
import { ide } from '../ide';
import { parser } from './service';
import type { Statement } from './CppParser';
import { normalize, dirname, joinPath } from '../../os/vfs';

export function symbolAt(e: Editor, pos: number): Statement | undefined {
  parser.parse(e.fileName, e.inProject, false, e.text);
  const word = e.identifierAt(pos).word;
  const line = e.view.state.doc.lineAt(pos).number;
  return parser.statements.filter((s) => s.command === word).sort((a, b) => Number(b.fileName === e.fileName && b.line <= line) - Number(a.fileName === e.fileName && a.line <= line))[0];
}

async function go(statement: Statement | null | undefined, definition: boolean) {
  if (!statement) return;
  const file = definition && statement.hasDefinition ? statement.definitionFileName || statement.fileName : statement.fileName;
  const line = definition && statement.hasDefinition ? statement.definitionLine || statement.line : statement.line;
  await ide.openFile(file);
  const e = ide.fileIsOpen(file);
  if (e) { e.setCaretPosAndActivate(line, 1); ide.activate(e); }
}

export function browserGoto(definition: boolean) { return go(ide.browserSelected, definition); }
export function gotoDeclEditor(impl: boolean) { const e = ide.getEditor(); if (e) return go(symbolAt(e, e.view.state.selection.main.head), impl); }
export async function gotoDeclarationAt(e: Editor, pos: number) {
  const line = e.view.state.doc.lineAt(pos).text;
  const inc = /^\s*#\s*include\s*"([^"]+)"/.exec(line);
  if (inc) { await ide.openFile(normalize(joinPath(dirname(e.fileName), inc[1]))); return; }
  return go(symbolAt(e, pos), false);
}
