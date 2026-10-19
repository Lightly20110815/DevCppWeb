import dfm from '../../generated/forms/FindFrm.json';
import { showForm } from '../../vcl/VclForm';
import type { DfmNode } from '../../vcl/FormCtl';
import { mrYes, mrCancel } from '../../vcl/FormCtl';
import { ide } from '../ide';
import type { FindItem } from '../ide';
import type { Editor } from '../editor/Editor';
import { devData, saveSettings } from '../config';
import { lang, Lang } from '../../lang/lang';
import * as L from '../../generated/langIds';
import { MessageDlg } from '../../os/messagebox';
import { vfs } from '../../os/vfs';
import { setFindShowing, findFormShowing } from './index';
import { localize } from './formUtils';

let needle = '';
let replacement = '';
const history: string[] = [];
const replaceHistory: string[] = [];

export function matches(text: string, word = needle, matchCase = devData.CaseSensitive, whole = devData.Wholewords) {
  if (!word) return [];
  const source = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(source, matchCase ? 'gu' : 'giu');
  const out: { from: number; to: number }[] = [];
  for (const m of text.matchAll(re)) {
    const from = m.index!;
    const to = from + m[0].length;
    if (whole && (/[\p{L}\p{N}_]/u.test(text[from - 1] ?? '') || /[\p{L}\p{N}_]/u.test(text[to] ?? ''))) continue;
    out.push({ from, to });
  }
  return out;
}

function select(e: Editor, match: { from: number; to: number }) {
  ide.activate(e);
  e.view.dispatch({ selection: { anchor: match.from, head: match.to }, scrollIntoView: true });
  e.view.focus();
}

export function searchAgain(back: boolean, word = needle, start?: number) {
  const e = ide.getEditor();
  if (!e || !word) return false;
  needle = word;
  const found = matches(e.text);
  const sel = e.view.state.selection.main;
  const pos = start ?? (back ? sel.from : sel.to);
  const hit = back ? found.findLast((m) => m.to <= pos) ?? found.at(-1) : found.find((m) => m.from >= pos) ?? found[0];
  if (!hit) { ide.setStatusbarMessage(Lang.isChinese ? `找不到“${word}”` : `Text not found: ${word}`); return false; }
  select(e, hit);
  return true;
}

export async function openFindResult(m: FindItem) {
  await ide.openFile(m.unit);
  const e = ide.fileIsOpen(m.unit);
  if (!e) return;
  e.setCaretPosAndActivate(+m.line || 1, +m.col || 1);
  const from = e.view.state.selection.main.head;
  select(e, { from, to: Math.min(e.documentLength, from + m.keyword.length) });
}

export async function showFind(tab: number) {
  if (findFormShowing()) return;
  setFindShowing(true);
  const original = ide.getEditor();
  const initialSelection = original?.view.state.selection.main;
  try {
    await showForm(dfm as DfmNode, (c) => {
      localize(c, 'FindFrm');
      c.set('FindTabs', { tabs: [lang(L.ID_FIND_FINDTAB), lang(L.ID_FIND_FINDALLTAB), lang(L.ID_FIND_REPLACE), lang(L.ID_FIND_REPLACEFILES)], tabIndex: tab });
      c.set('cboFindText', { items: history, text: original?.selText && !original.selText.includes('\n') ? original.selText : needle });
      c.set('cboReplaceText', { items: replaceHistory, text: replacement });
      for (const [ctl, value] of Object.entries({ cbMatchCase: devData.CaseSensitive, cbWholeWord: devData.Wholewords, cbPrompt: devData.PromptReplace, rbBackward: devData.DirBackward, rbForward: !devData.DirBackward, rbSelectedOnly: devData.ScopeIsSelected, rbGlobal: !devData.ScopeIsSelected, rbEntireScope: devData.OriginEntireScope, rbFromCursor: !devData.OriginEntireScope })) c.checked(ctl, value);
      const update = () => {
        const t = c.get('FindTabs').tabIndex ?? 0;
        c.visible('lblReplace', t >= 2); c.visible('cboReplaceText', t >= 2);
        c.visible('cbPrompt', t >= 2); c.visible('grpWhere', t % 2 === 1);
        c.visible('grpOrigin', t % 2 === 0); c.visible('grpDirection', t % 2 === 0);
        c.caption('btnExecute', t >= 2 ? lang(L.ID_FIND_REPLACE) : lang(L.ID_FIND_FINDTAB));
        c.enabled('rbProjectFiles', !!ide.project); c.enabled('rbSelectedOnly', !!original?.selAvail);
        if (!ide.project && c.checked('rbProjectFiles')) { c.checked('rbProjectFiles', false); c.checked('rbOpenFiles', true); }
        c.enabled('btnExecute', !!c.text('cboFindText'));
      };
      c.handlers.FindTabsChange = update;
      c.handlers['cboFindText.Change'] = update;
      c.handlers.btnExecuteClick = async () => {
        needle = c.text('cboFindText'); replacement = c.text('cboReplaceText');
        if (!needle) return false;
        history.splice(0, history.length, needle, ...history.filter((s) => s !== needle).slice(0, 19));
        replaceHistory.splice(0, replaceHistory.length, replacement, ...replaceHistory.filter((s) => s !== replacement).slice(0, 19));
        devData.CaseSensitive = c.checked('cbMatchCase'); devData.Wholewords = c.checked('cbWholeWord');
        devData.PromptReplace = c.checked('cbPrompt'); devData.DirBackward = c.checked('rbBackward');
        devData.ScopeIsSelected = c.checked('rbSelectedOnly'); devData.OriginEntireScope = c.checked('rbEntireScope');
        saveSettings();
        const t = c.get('FindTabs').tabIndex ?? 0;
        if (t % 2 === 0) {
          if (!original) return false;
          let found = matches(original.text);
          if (devData.ScopeIsSelected && initialSelection && !initialSelection.empty) found = found.filter((m) => m.from >= initialSelection.from && m.to <= initialSelection.to);
          const sel = original.view.state.selection.main;
          const hit = devData.OriginEntireScope ? (devData.DirBackward ? found.at(-1) : found[0]) : devData.DirBackward ? found.findLast((m) => m.to <= sel.from) ?? found.at(-1) : found.find((m) => m.from >= sel.to) ?? found[0];
          if (!hit) { await MessageDlg(Lang.isChinese ? `找不到“${needle}”` : `Text not found: ${needle}`, 'mtInformation', ['mbOK']); return false; }
          select(original, hit);
          if (t === 2) {
            if (!devData.PromptReplace || await MessageDlg(Lang.isChinese ? '替换这处匹配？' : 'Replace this occurrence?', 'mtConfirmation', ['mbYes', 'mbNo']) === mrYes) {
              original.view.dispatch({ changes: { ...hit, insert: replacement }, selection: { anchor: hit.from + replacement.length }, userEvent: 'input.replace' });
              searchAgain(devData.DirBackward);
            }
            return false;
          }
        } else {
          const names = c.checked('rbProjectFiles') ? ide.project?.units.map((u) => u.fileName) ?? [] : c.checked('rbCurFile') ? original ? [original.fileName] : [] : ide.allEditors.map((e) => e.fileName);
          ide.findOutput = [];
          let cancelled = false;
          for (const name of new Set(names)) {
            const editor = ide.fileIsOpen(name);
            const text = editor?.text ?? (vfs.fileExists(name) ? vfs.readText(name) : '');
            const changes = [];
            for (const hit of matches(text)) {
              const line = text.slice(0, hit.from).split('\n').length;
              const start = text.lastIndexOf('\n', hit.from - 1) + 1;
              ide.findOutput.push({ line: String(line), col: String(hit.from - start + 1), unit: name, keyword: needle, msg: text.slice(start, text.indexOf('\n', hit.from) < 0 ? undefined : text.indexOf('\n', hit.from)) });
              if (t === 3) {
                const answer = devData.PromptReplace ? await MessageDlg(`${name}:${line}\n${text.slice(hit.from, hit.to)}`, 'mtConfirmation', ['mbYes', 'mbNo', 'mbCancel']) : mrYes;
                if (answer === mrCancel) { cancelled = true; break; }
                if (answer === mrYes) changes.push({ ...hit, insert: replacement });
              }
            }
            if (changes.length) {
              if (editor) editor.view.dispatch({ changes, userEvent: 'input.replace.all' });
              else { let next = text; for (const change of changes.reverse()) next = next.slice(0, change.from) + change.insert + next.slice(change.to); vfs.write(name, next); }
            }
            if (cancelled) break;
          }
          ide.findSel = -1; ide.setMessagePage('find'); ide.openCloseMessageSheet(true); ide.msgs.emit();
        }
        c.close(1);
        return false;
      };
      update();
    }, { focus: 'cboFindText' });
  } finally { setFindShowing(false); }
}
