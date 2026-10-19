import { ide } from '../ide';
import { devEditor } from '../config';
import { tokenizeLine } from '../editor/synCpp';
import { delphiColor } from '../colors';
import { vfs, basename, changeExt, dirname } from '../../os/vfs';
import { showFileDialog } from '../../os/FileDialog';

export const escapeHTML = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function highlightedHTML(text: string, colors = true) {
  let range: Parameters<typeof tokenizeLine>[1];
  return text.split('\n').map((line) => {
    const parsed = tokenizeLine(line, range); range = parsed.range;
    return parsed.tokens.map((token) => {
      if (!colors) return escapeHTML(token.text);
      const attr = (devEditor.Syntax[token.kind] ?? '').split(',').map((v) => v.trim());
      const style = [`color:${delphiColor(attr[0]) ?? '#000000'}`, attr[2] === '1' ? 'font-weight:bold' : '', attr[3] === '1' ? 'font-style:italic' : '', attr[4] === '1' ? 'text-decoration:underline' : ''].filter(Boolean).join(';');
      return `<span style="${style}">${escapeHTML(token.text)}</span>`;
    }).join('');
  }).join('\n');
}

function htmlDocument(title: string, body: string) {
  return `<!doctype html>\n<html><head><meta charset="UTF-8"><title>${escapeHTML(title)}</title><style>body{margin:2rem;font-family:system-ui}pre{font:14px/1.5 Consolas,monospace;tab-size:${devEditor.TabSize};white-space:pre-wrap}nav a{margin-right:1em}</style></head><body>${body}</body></html>\n`;
}
function rtf(text: string) {
  let result = '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Courier New;}}\\f0\\fs20\n';
  for (let i = 0; i < text.length; i++) {
    const char = text[i], code = text.charCodeAt(i);
    if (char === '\n') result += '\\par\n'; else if (char === '\r') continue; else if (char === '\t') result += '\\tab '; else if ('\\{}'.includes(char)) result += '\\' + char; else if (code > 127) result += `\\u${code > 32767 ? code - 65536 : code}?`; else result += char;
  }
  return result + '}';
}
export async function exportEditor(kind: 'html' | 'rtf' | 'tex') {
  const editor = ide.getEditor(); if (!editor) return;
  const result = await showFileDialog({ mode: 'save', filter: `${kind.toUpperCase()} files|*.${kind}`, fileName: changeExt(basename(editor.fileName), '.' + kind), defaultExt: kind, initialDir: dirname(editor.fileName), overwritePrompt: true });
  if (!result) return;
  const text = editor.selAvail ? editor.selText : editor.text;
  const content = kind === 'html' ? htmlDocument(basename(editor.fileName), `<h1>${escapeHTML(basename(editor.fileName))}</h1><pre>${highlightedHTML(text)}</pre>`) : kind === 'rtf' ? rtf(text) : `\\documentclass{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage{listings}\n\\lstset{language=C++,basicstyle=\\ttfamily\\small,breaklines=true,tabsize=${devEditor.TabSize}}\n\\begin{document}\n\\begin{lstlisting}\n${text}\n\\end{lstlisting}\n\\end{document}\n`;
  vfs.write(result.files[0], content);
}
export async function exportProject() {
  const project = ide.project; if (!project) return;
  const result = await showFileDialog({ mode: 'save', filter: 'HTML files|*.html', fileName: project.name + '.html', defaultExt: 'html', initialDir: project.directory, overwritePrompt: true });
  if (!result) return;
  const sections = project.units.filter((u) => /\.(c|cc|cpp|cxx|h|hpp|hh)$/i.test(u.fileName)).map((u, i) => {
    const text = u.editor?.text ?? (vfs.fileExists(u.fileName) ? vfs.readText(u.fileName) : '');
    return `<section id="file-${i}"><h2>${escapeHTML(basename(u.fileName))}</h2><pre>${highlightedHTML(text)}</pre></section>`;
  });
  vfs.write(result.files[0], htmlDocument(project.name, `<h1>${escapeHTML(project.name)}</h1>${sections.join('\n')}`));
}
