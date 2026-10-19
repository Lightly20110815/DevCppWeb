// actMsgCut/Copy/CopyAll/Paste/SelAll/SaveAll/Clear for the message control.
import { ide } from '../ide';
import type { MsgItem } from '../ide';
import { showFileDialog } from '../../os/FileDialog';
import { vfs } from '../../os/vfs';
import { FLT_TEXTS } from '../version';

function rows(): { items: MsgItem[]; sel: number } | null {
  switch (ide.messagePage) {
    case 'comp':
      return { items: ide.compilerOutput, sel: ide.compSel };
    case 'res':
      return { items: ide.resourceOutput, sel: ide.resSel };
    case 'find':
      return { items: ide.findOutput, sel: ide.findSel };
    default:
      return null;
  }
}

const rowText = (m: MsgItem) => `${m.line}\t${m.col}\t${m.unit}\t${m.msg}`;

function selectedLogText() {
  const ta = document.querySelector('.logoutput') as HTMLTextAreaElement | null;
  if (!ta) return '';
  return ta.value.slice(ta.selectionStart, ta.selectionEnd);
}

export function msgCopy(cut: boolean) {
  if (ide.messagePage === 'log') {
    void navigator.clipboard?.writeText(selectedLogText().replace(/\n/g, '\r\n'));
    return;
  }
  const r = rows();
  if (!r || r.sel < 0) return;
  void navigator.clipboard?.writeText(rowText(r.items[r.sel]));
  if (cut) {
    r.items.splice(r.sel, 1);
    ide.msgs.emit();
  }
}

export function msgCopyAll() {
  if (ide.messagePage === 'log') {
    void navigator.clipboard?.writeText(ide.logLines.join('\r\n'));
    return;
  }
  const r = rows();
  if (!r) return;
  void navigator.clipboard?.writeText(r.items.map(rowText).join('\r\n'));
}

export function msgPaste() {
  /* the message lists are read-only */
}

export function msgSelectAll() {
  if (ide.messagePage === 'log') {
    const ta = document.querySelector('.logoutput') as HTMLTextAreaElement | null;
    ta?.focus();
    ta?.select();
  }
}

export async function msgSaveAll() {
  const text = ide.messagePage === 'log' ? ide.logLines.join('\r\n') : rows()?.items.map(rowText).join('\r\n') ?? '';
  const r = await showFileDialog({ mode: 'save', filter: FLT_TEXTS, defaultExt: 'txt', overwritePrompt: true });
  if (r) vfs.write(r.files[0], text);
}

export function msgClear() {
  switch (ide.messagePage) {
    case 'comp':
      ide.compilerOutput = [];
      break;
    case 'res':
      ide.resourceOutput = [];
      break;
    case 'find':
      ide.findOutput = [];
      break;
    case 'log':
      ide.logLines = [];
      ide.logRaw = [];
      break;
    case 'debug':
      ide.debugOutput = [];
      break;
  }
  ide.msgs.emit();
}
