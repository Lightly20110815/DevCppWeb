import dfm from '../../generated/forms/PrintFrm.json';
import { showForm } from '../../vcl/VclForm';
import type { DfmNode } from '../../vcl/FormCtl';
import { devData, saveSettings } from '../config';
import { ide } from '../ide';
import { escapeHTML, highlightedHTML } from './exporters';
import { basename } from '../../os/vfs';
import { localize } from './formUtils';

export async function showPrint() {
  const editor = ide.getEditor(); if (!editor) return;
  const dialog = showForm(dfm as DfmNode, (c) => {
    localize(c, 'PrintFrm');
    c.checked('cbColors', devData.PrintColors); c.checked('cbHighlight', devData.PrintHighlight); c.checked('cbWordWrap', devData.PrintWordWrap);
    c.checked('rbLN', devData.PrintLineNumbers && !devData.PrintLineNumbersMargins); c.checked('rbLNMargin', devData.PrintLineNumbersMargins); c.checked('rbNoLN', !devData.PrintLineNumbers);
    c.value('seCopies', 1); c.enabled('cbSelection', editor.selAvail);
    c.handlers['btnOk.Click'] = () => {
      // Request the native print dialog in the button's user-activation event.
      devData.PrintColors = c.checked('cbColors'); devData.PrintHighlight = c.checked('cbHighlight'); devData.PrintWordWrap = c.checked('cbWordWrap');
      devData.PrintLineNumbers = !c.checked('rbNoLN'); devData.PrintLineNumbersMargins = c.checked('rbLNMargin'); saveSettings();
      const text = c.checked('cbSelection') ? editor.selText : editor.text;
      const title = basename(editor.fileName);
      const frame = document.createElement('iframe'); frame.style.cssText = 'position:fixed;width:0;height:0;border:0';
      document.body.appendChild(frame);
      const doc = frame.contentDocument!;
      const lines = (devData.PrintHighlight ? highlightedHTML(text, devData.PrintColors) : escapeHTML(text)).split('\n');
      const body = lines.map((line, i) => `<div class="line">${devData.PrintLineNumbers ? `<span class="number">${i + 1}</span>` : ''}<span>${line || ' '}</span></div>`).join('');
      const copies = Math.max(1, Math.min(99, c.value('seCopies')));
      doc.open(); doc.write(`<!doctype html><html><head><title>${escapeHTML(title)}</title><style>@page{margin:15mm}body{font:10pt/1.4 Consolas,monospace}.copy+.copy{break-before:page}.line{display:flex;white-space:${devData.PrintWordWrap ? 'pre-wrap' : 'pre'}}.line>span:last-child{min-width:0;overflow-wrap:anywhere}.number{display:inline-block;min-width:3em;flex-shrink:0;color:#777;user-select:none}h1{font:12pt sans-serif}</style></head><body>${Array.from({ length: copies }, () => `<section class="copy"><h1>${escapeHTML(title)}</h1>${body}</section>`).join('')}</body></html>`); doc.close();
      const cleanup = () => frame.remove(); frame.contentWindow!.addEventListener('afterprint', cleanup, { once: true });
      setTimeout(() => { frame.contentWindow?.focus(); frame.contentWindow?.print(); }, 0);
      setTimeout(cleanup, 120_000);
    };
  });
  await dialog;
}
export function showPrinterSetup() { return showPrint(); }
