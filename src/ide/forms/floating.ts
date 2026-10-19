// Floating project manager / report window (View menu).
import { devData, saveSettings } from '../config';
import { ide } from '../ide';

export function toggleFloating(which: 'project' | 'report') {
  if (which === 'project') devData.ProjectFloat = !devData.ProjectFloat;
  else devData.MessageFloat = !devData.MessageFloat;
  saveSettings();
  void import('./floatingWindows').then((m) => m.syncFloating());
  ide.changed();
}
