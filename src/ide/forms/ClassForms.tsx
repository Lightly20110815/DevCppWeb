import cls from '../../generated/forms/NewClassFrm.json';
import fn from '../../generated/forms/NewFunctionFrm.json';
import vr from '../../generated/forms/NewVarFrm.json';
import { showForm } from '../../vcl/VclForm';
import type { DfmNode } from '../../vcl/FormCtl';
import { mrYes } from '../../vcl/FormCtl';
import { ide } from '../ide';
import { parser } from '../parser/service';
import { vfs, basename, dirname, joinPath, changeExt } from '../../os/vfs';
import { settings } from '../config';
import { showFileDialog } from '../../os/FileDialog';
import { MessageDlg } from '../../os/messagebox';
import { tokenizeLine } from '../editor/synCpp';
import { localize } from './formUtils';
import type { Statement } from '../parser/CppParser';
import type { Editor } from '../editor/Editor';

const identifier = /^[A-Za-z_]\w*$/;
function classStatements() {
  for (const e of ide.allEditors) parser.parse(e.fileName, e.inProject, false, e.text);
  return parser.statements.filter((s) => s.kind === 'class' && s.hasDefinition);
}

export async function showNewClass() {
  const classes = classStatements();
  await showForm(cls as DfmNode, (c) => {
    localize(c, 'NewClassFrm');
    c.set('cmbClass', { items: classes.map((s) => s.command), itemIndex: 0 });
    c.set('cmbScope', { items: ['public', 'protected', 'private'], itemIndex: 0 });
    c.enabled('chkAddToProject', !!ide.project); c.checked('chkAddToProject', !!ide.project);
    c.handlers.txtNameChange = () => {
      const name = c.text('txtName'); const dir = ide.project?.directory ?? settings.dirs.Default;
      c.text('txtCppFile', joinPath(dir, name + '.cpp')); c.text('txtHFile', joinPath(dir, name + '.h')); c.enabled('btnCreate', identifier.test(name));
    };
    c.handlers.cmbClassChange = () => c.text('txtIncFile', basename(classes[c.itemIndex('cmbClass')]?.fileName ?? ''));
    c.handlers.btnBrowseCppClick = async (sender) => { const field = sender === 'btnBrowseH' ? 'txtHFile' : 'txtCppFile'; const result = await showFileDialog({ mode: 'save', filter: 'C/C++ files|*.cpp;*.h|All files|*.*', fileName: c.text(field) }); if (result) c.text(field, result.files[0]); };
    c.handlers.btnCreateClick = async () => {
      const name = c.text('txtName').trim(), header = c.text('txtHFile').trim(), source = c.text('txtCppFile').trim();
      if (!identifier.test(name) || !header || !source || header.toLowerCase() === source.toLowerCase()) return false;
      for (const file of [header, source]) if (vfs.fileExists(file) && await MessageDlg(`${file}\nOverwrite this file?`, 'mtConfirmation', ['mbYes', 'mbNo']) !== mrYes) return false;
      const guard = name.toUpperCase() + '_H';
      const inherits = c.checked('chkInherit') && c.text('cmbClass') ? ` : ${c.text('cmbScope')} ${c.text('cmbClass')}` : '';
      const declarations = [c.checked('chkConstruct') ? `\t${name}(${c.text('txtArgs')});` : '', c.checked('chkDestruct') ? `\t~${name}();` : ''].filter(Boolean).join('\n');
      const headerText = `#ifndef ${guard}\n#define ${guard}\n\n${inherits && c.text('txtIncFile') ? `#include "${c.text('txtIncFile')}"\n\n` : ''}class ${name}${inherits}\n{\npublic:\n${declarations}\n\nprivate:\n\n};\n\n#endif\n`;
      const implementation = `#include "${basename(header)}"\n\n` + (c.checked('chkConstruct') ? `${name}::${name}(${c.text('txtArgs')})\n{\n}\n\n` : '') + (c.checked('chkDestruct') ? `${name}::~${name}()\n{\n}\n` : '');
      for (const [file, text] of [[header, headerText], [source, implementation]]) {
        vfs.write(file, text);
        const existing = ide.fileIsOpen(file); if (existing) { existing.text = text; existing.setModified(false); }
        if (c.checked('chkAddToProject') && ide.project && !ide.project.fileAlreadyExists(file)) await ide.project.addUnit(file, '');
        await ide.openFile(file);
      }
      parser.scanProject(); ide.changed();
    };
    c.enabled('btnCreate', false);
  }, { focus: 'txtName' });
}

function closingBrace(e: Editor, statement: Statement) {
  let depth = 0, opened = false, range: Parameters<typeof tokenizeLine>[1];
  for (let line = Math.max(1, statement.line); line <= e.lineCount; line++) {
    const text = e.view.state.doc.line(line); const result = tokenizeLine(text.text, range); range = result.range;
    let offset = text.from;
    for (const token of result.tokens) {
      if (token.kind === 'Symbol') {
        if (token.text === '{') { depth++; opened = true; }
        if (token.text === '}' && opened && --depth === 0) return offset;
      }
      offset += token.text.length;
    }
  }
  return -1;
}

async function showMember(variable: boolean) {
  const classes = classStatements();
  await showForm((variable ? vr : fn) as DfmNode, (c) => {
    localize(c, variable ? 'NewVarFrm' : 'NewFunctionFrm');
    c.set('cmbClass', { items: classes.map((s) => s.command), itemIndex: Math.max(0, classes.findIndex((s) => s === ide.browserSelected)) });
    c.items('rgScope', ['private', 'protected', 'public']); c.text('txtType', variable ? 'int' : 'void');
    c.handlers.txtTypeChange = () => c.enabled('btnCreate', identifier.test(c.text('txtName')) && !!c.text('txtType').trim() && !!classes.length);
    c.handlers.chkReadFuncClick = () => { c.enabled('grpReadFunc', c.checked('chkReadFunc')); if (!c.text('txtReadFunc')) c.text('txtReadFunc', 'get' + c.text('txtName')); };
    c.handlers.chkWriteFuncClick = () => { c.enabled('grpWriteFunc', c.checked('chkWriteFunc')); if (!c.text('txtWriteFunc')) c.text('txtWriteFunc', 'set' + c.text('txtName')); };
    c.handlers.chkStaticClick = (sender) => { if (sender === 'chkStatic' && c.checked(sender)) { c.checked('chkVirtual', false); c.checked('chkPure', false); } if (c.checked('chkPure')) { c.checked('chkVirtual', true); c.checked('chkStatic', false); } };
    c.handlers.btnCreateClick = async () => {
      const name = c.text('txtName').trim(), type = c.text('txtType').trim(), statement = classes[c.itemIndex('cmbClass')];
      if (!identifier.test(name) || !type || !statement) return false;
      await ide.openFile(statement.fileName); const editor = ide.fileIsOpen(statement.fileName);
      if (!editor || editor.readOnly) return false;
      const end = closingBrace(editor, statement); if (end < 0) return false;
      let code = `\n${c.items('rgScope')[c.itemIndex('rgScope')] || 'public'}:\n\t`;
      if (variable) {
        code += `${type} ${name};\n`;
        if (c.checked('chkReadFunc')) { const read = c.text('txtReadFunc'); if (!identifier.test(read)) return false; code += `\t${type} ${read}() const { return ${name}; }\n`; }
        if (c.checked('chkWriteFunc')) { const write = c.text('txtWriteFunc'); if (!identifier.test(write)) return false; code += `\tvoid ${write}(${type} value) { this->${name} = value; }\n`; }
      } else {
        const args = c.text('txtArguments');
        const pure = c.checked('chkPure'), inline = c.checked('chkInline');
        code += `${c.checked('chkStatic') ? 'static ' : c.checked('chkVirtual') ? 'virtual ' : ''}${type} ${name}(${args})`;
        code += pure ? ' = 0;\n' : inline ? `\n\t{\n${c.checked('chkToDo') ? `\t\t/* TODO (#1#): Define ${name} */\n` : ''}\t}\n` : ';\n';
        if (!pure && !inline) {
          const path = changeExt(statement.fileName, '.cpp');
          const destination = vfs.fileExists(path) || ide.fileIsOpen(path) ? path : statement.fileName;
          await ide.openFile(destination); const impl = ide.fileIsOpen(destination);
          if (!impl || impl.readOnly) return false;
          const text = `\n${destination === statement.fileName ? 'inline ' : ''}${type} ${statement.command}::${name}(${args})\n{\n${c.checked('chkToDo') ? '\t/* TODO (#1#): Implement this function */\n' : ''}}\n`;
          impl.view.dispatch({ changes: { from: impl.documentLength, insert: text }, userEvent: 'input' });
        }
      }
      editor.view.dispatch({ changes: { from: end, insert: code }, userEvent: 'input' });
      parser.parse(editor.fileName, editor.inProject, false, editor.text); ide.activate(editor); ide.changed();
    };
    c.enabled('btnCreate', false);
  }, { focus: 'txtName' });
}
export function showNewFunction() { return showMember(false); }
export function showNewVar() { return showMember(true); }
