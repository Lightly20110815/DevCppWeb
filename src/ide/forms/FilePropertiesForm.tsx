import dfm from '../../generated/forms/FilePropertiesFrm.json';
import { showForm } from '../../vcl/VclForm';
import type { DfmNode } from '../../vcl/FormCtl';
import { ide } from '../ide';
import { vfs, relativePath, basename } from '../../os/vfs';
import { tokenizeLine } from '../editor/synCpp';
import { formatFileSize } from '../../compiler/Compiler';
import { localize } from './formUtils';

export async function showFileProperties() {
  const names = [...new Set([...ide.allEditors.map((e) => e.fileName), ...ide.project?.units.map((u) => u.fileName) ?? []])];
  if (!names.length) return;
  await showForm(dfm as DfmNode, (c) => {
    localize(c, 'FilePropertiesFrm');
    c.set('cmbFiles', { items: names.map(basename), itemIndex: Math.max(0, names.indexOf(ide.getEditor()?.fileName ?? '')) });
    const update = () => {
      const file = names[c.itemIndex('cmbFiles')];
      const editor = ide.fileIsOpen(file);
      const text = editor?.text ?? vfs.readText(file);
      const lines = text.split('\n');
      let code = 0, comments = 0, empty = 0;
      let range: Parameters<typeof tokenizeLine>[1];
      for (const line of lines) {
        const tokens = tokenizeLine(line, range); range = tokens.range;
        if (!line.trim()) empty++;
        else { if (tokens.tokens.some((t) => t.kind === 'Comment')) comments++; if (tokens.tokens.some((t) => !['Comment', 'Space', 'WhiteSpace'].includes(t.kind) && t.text.trim())) code++; }
      }
      const fields = { edFileSize: formatFileSize(new TextEncoder().encode(text).length), edTotalLines: String(lines.length), edCodeLines: String(code), edCommentLines: String(comments), edEmptyLines: String(empty), edIncludes: String((text.match(/^\s*#\s*include\b/gm) ?? []).length), edTimestamp: vfs.mtime(file) ? new Date(vfs.mtime(file)).toLocaleString() : '', edProject: ide.project?.fileAlreadyExists(file) ? ide.project.name : '', edAbsolute: file, edRelative: ide.project ? relativePath(ide.project.fileName, file) : basename(file) };
      for (const [name, value] of Object.entries(fields)) c.set(name, { text: value, readOnly: true });
    };
    c.handlers.cmbFilesClick = update; c.handlers['cmbFiles.Change'] = update; c.handlers.btnOKClick = () => c.close(1);
    update();
  });
}
