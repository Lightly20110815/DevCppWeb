// PageControlPanel: left/right editor page controls (EditorList).
import { useLayoutEffect, useRef } from 'react';
import { useIde, ide } from '../ide';
import type { Editor } from '../editor/Editor';
import { TabStrip } from '../../vcl/controls';
import { openPopup } from '../../os/menu';
import { popupMenu } from '../menus';
import { devData } from '../config';
import { basename } from '../../os/vfs';

function EditorHost({ editor }: { editor: Editor | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    while (host.firstChild) host.removeChild(host.firstChild);
    if (editor) {
      host.appendChild(editor.view.dom);
      editor.view.requestMeasure();
    }
  }, [editor]);
  return <div ref={ref} className="editor-host" />;
}

function Pane({ list, active, side }: { list: Editor[]; active: Editor | null; side: 'left' | 'right' }) {
  const pos = devData.MsgTabs; // 0 top, 1 bottom, 2 left, 3 right
  const tabs = (
    <TabStrip
      className={'editor-tabs' + (devData.MultiLineTab ? ' multiline' : '')}
      bottom={pos === 1}
      tabs={list.map((e) => (e.modified ? '[*] ' : '') + basename(e.fileName).replace(/&/g, '&&'))}
      index={active ? list.indexOf(active) : -1}
      hint={(i) => list[i]?.fileName}
      onChange={(i) => ide.activate(list[i])}
      onMiddle={(i) => void ide.closeEditor(list[i])}
      onContextMenu={(e, i) => {
        ide.activate(list[i], false);
        openPopup(popupMenu('EditorPopup'), e.clientX, e.clientY, { imageList: 'menu' });
      }}
    />
  );
  return (
    <div
      className={'editor-pane pos' + pos}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault();
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          ide.dropFiles(e.dataTransfer.files);
        }
      }}
      data-side={side}
    >
      {pos !== 1 && tabs}
      <div className="editor-sheet">
        <EditorHost editor={active} />
      </div>
      {pos === 1 && tabs}
    </div>
  );
}

export function EditorArea() {
  useIde('tabs');
  useIde('ui');
  const both = ide.left.length > 0 && ide.right.length > 0;
  return (
    <div
      className="editor-area"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault();
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          ide.dropFiles(e.dataTransfer.files);
        }
      }}
    >
      {ide.left.length > 0 && <Pane list={ide.left} active={ide.activeLeft} side="left" />}
      {both && <div className="splitter-v" />}
      {ide.right.length > 0 && <Pane list={ide.right} active={ide.activeRight} side="right" />}
    </div>
  );
}
