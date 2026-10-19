import type { Editor } from './Editor';
import { symbolAt } from '../parser/browserOps';
import { prettyStatement } from '../parser/CppParser';

let clear: (() => void) | undefined;
export function showHint(e: Editor, pos: number, ev: MouseEvent) {
  clear?.();
  const statement = symbolAt(e, pos);
  if (!statement) return;
  const hint = document.createElement('div');
  hint.className = 'parser-tooltip';
  hint.textContent = `${prettyStatement(statement)}\n${statement.fileName}:${statement.line}`;
  Object.assign(hint.style, { position: 'fixed', left: `${Math.min(ev.clientX + 12, window.innerWidth - 320)}px`, top: `${Math.min(ev.clientY + 20, window.innerHeight - 70)}px`, maxWidth: 'min(600px, 90vw)', whiteSpace: 'pre-wrap', background: '#ffffe1', color: '#000', border: '1px solid #767676', padding: '4px 7px', pointerEvents: 'none', zIndex: '2147483647', font: '12px Consolas, monospace' });
  document.body.appendChild(hint);
  const controller = new AbortController();
  clear = () => { hint.remove(); controller.abort(); clear = undefined; };
  for (const event of ['mousemove', 'keydown', 'pointerdown', 'scroll']) document.addEventListener(event, () => clear?.(), { once: true, capture: true, signal: controller.signal });
}
