// Native debugger/profiler commands report the runtime limitation explicitly.
import { ide } from '../ide';
import { lang, Lang } from '../../lang/lang';
import * as L from '../../generated/langIds';
import { MessageDlg, InputQuery } from '../../os/messagebox';
import { vfs, joinPath, dirname } from '../../os/vfs';

export async function debug() {
  ide.setMessagePage('debug');
  ide.openCloseMessageSheet(true);
  ide.debugOutput = [
    Lang.isChinese ? '浏览器运行时尚未接入 GDB，不能执行断点、单步或变量求值。' : 'GDB is not connected to the browser runtime. Breakpoints, stepping and variable evaluation are unavailable.',
  ];
  ide.msgs.emit();
  await MessageDlg(ide.debugOutput[0], 'mtInformation', ['mbOK']);
}

export async function profile() {
  await MessageDlg(Lang.isChinese ? '浏览器运行时尚未接入 gprof，不能生成原版性能分析报告。' : 'gprof is not connected to the browser runtime. Native profiling reports are unavailable.', 'mtInformation', ['mbOK']);
}

export async function deleteProfile() {
  const e = ide.getEditor();
  const dir = ide.project ? ide.project.directory : e ? dirname(e.fileName) : '';
  const gmon = joinPath(dir, 'gmon.out');
  if (vfs.fileExists(gmon)) vfs.remove(gmon);
}

export async function addWatch() {
  const e = ide.getEditor();
  const word = e ? e.wordAt(e.view.state.selection.main.head, 'evaluation') : '';
  const s = await InputQuery(lang(L.ID_NV_ADDWATCH), lang(L.ID_NV_ENTERVAR), word);
  if (s === null) return;
  ide.debugOutput.push(`display ${s}`);
  ide.msgs.emit();
}
