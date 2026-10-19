// Hosts an Editor (CodeMirror view) inside a dialog, e.g. for TSynEdit previews.
import { useLayoutEffect, useRef } from 'react';
import { Editor } from '../editor/Editor';
import type { EditorHost } from '../editor/Editor';

export function EditorMount({ editor, className }: { editor: Editor; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.appendChild(editor.view.dom);
    editor.view.requestMeasure();
    return () => {
      if (editor.view.dom.parentElement === el) el.removeChild(editor.view.dom);
    };
  }, [editor]);
  return <div ref={ref} className={'editor-mount ' + (className ?? '')} />;
}

const quietHost: EditorHost = { onStatusChange: () => {} };

export function previewEditor(text: string, fileName = 'main.cpp', readOnly = false) {
  const e = new Editor({ fileName, text, inProject: false, isNew: false, host: quietHost, untitledPrefix: '\u0000' });
  if (readOnly) e.setReadOnly(true);
  return e;
}
