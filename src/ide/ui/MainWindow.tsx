// TMainForm layout and keyboard handling.
import { useEffect, useState } from 'react';
import { useIde, ide } from '../ide';
import { MenuBar, closeMenus, menusOpen, findAccelIndex } from '../../os/menu';
import { mainMenu, toggleBookmark, gotoBookmark } from '../menus';
import { ToolbarDock } from './Toolbars';
import { LeftPanel } from './LeftPanel';
import { EditorArea } from './EditorArea';
import { MessagePanel, StatusBar } from './MessagePanel';
import { actions, execute, isEnabled } from '../actions';
import { eventToShortCut, eventVk } from '../shortcuts';
import { devData, saveSettings } from '../config';
import { wm } from '../../os/wm';

const EDITING_KEYS = new Set(['actCut', 'actCopy', 'actPaste', 'actSelectAll', 'actUndo', 'actRedo', 'actIndent', 'actUnindent', 'actMsgCut', 'actMsgCopy', 'actMsgPaste', 'actMsgSelAll', 'actMsgCopyAll', 'actMsgSaveAll']);
// keys CodeMirror handles natively (so clipboard and IME keep working)
const NATIVE_IN_EDITOR = new Set(['actCut', 'actCopy', 'actPaste', 'actSelectAll', 'actUndo', 'actRedo', 'actIndent', 'actUnindent']);

let altMode = false;
let setAltModeRef: ((v: boolean) => void) | null = null;

export function handleMainKeyDown(e: KeyboardEvent) {
  if (menusOpen()) return; // handled by the menu
  const target = e.target as HTMLElement | null;
  const inEditor = !!target?.closest?.('.cm-editor');
  const inInput = !inEditor && !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

  // Alt + letter opens the main menu
  if (e.altKey && !e.ctrlKey && e.key.length === 1 && /[a-z]/i.test(e.key)) {
    const idx = findAccelIndex(mainMenu(), e.key);
    if (idx >= 0) {
      e.preventDefault();
      e.stopPropagation();
      setAltModeRef?.(true);
      requestAnimationFrame(() => {
        const items = document.querySelectorAll('.mainwin .menubar-item');
        (items[idx] as HTMLElement | undefined)?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      });
      return;
    }
  }
  const sc = eventToShortCut(e);
  if (!sc) return;
  // bookmarks: Ctrl+1..9 toggle, Alt+1..9 goto
  if ((e.ctrlKey || e.altKey) && !e.shiftKey && eventVk(e) >= 49 && eventVk(e) <= 57 && ide.getEditor()) {
    e.preventDefault();
    e.stopPropagation();
    if (e.ctrlKey) toggleBookmark(eventVk(e) - 48);
    else gotoBookmark(eventVk(e) - 48);
    return;
  }
  for (const a of actions.values()) {
    if (a.shortcut !== sc || !a.execute) continue;
    if (a.category === 'Messages') continue;
    if (inInput && EDITING_KEYS.has(a.name)) return;
    if (inEditor && NATIVE_IN_EDITOR.has(a.name)) return;
    if (a.name === 'actIndent' || a.name === 'actUnindent') return;
    if (!isEnabled(a)) {
      // still swallow function keys so the browser doesn't act on them
      if (eventVk(e) >= 112 && eventVk(e) <= 123) e.preventDefault();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    void execute(a.name);
    return;
  }
  // keep the browser from opening its own dialogs for F-keys
  if (eventVk(e) >= 112 && eventVk(e) <= 123) e.preventDefault();
}

function Splitter({ dir, onDrag }: { dir: 'h' | 'v'; onDrag: (delta: number, done: boolean) => void }) {
  return (
    <div
      className={'splitter-' + dir}
      onPointerDown={(e) => {
        e.preventDefault();
        const s = dir === 'v' ? e.clientX : e.clientY;
        const move = (ev: PointerEvent) => onDrag((dir === 'v' ? ev.clientX : ev.clientY) - s, false);
        const up = (ev: PointerEvent) => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          onDrag((dir === 'v' ? ev.clientX : ev.clientY) - s, true);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
    />
  );
}

export function MainWindow({ windowId }: { windowId: number }) {
  useIde('ui');
  const [alt, setAlt] = useState(false);
  const active = wm.isActiveTree(windowId);
  useEffect(() => {
    setAltModeRef = (v) => {
      altMode = v;
      setAlt(v);
    };
    // plain Alt press toggles the menu bar keyboard mode, like Windows
    let altDown = false;
    const down = (e: KeyboardEvent) => {
      if (!wm.isActive(windowId)) return;
      altDown = e.key === 'Alt' && !e.ctrlKey && !e.shiftKey;
      if (e.key === 'F10' && e.shiftKey) altDown = false;
    };
    const up = (e: KeyboardEvent) => {
      if (!wm.isActive(windowId)) return;
      if (e.key === 'Alt' && altDown) {
        e.preventDefault();
        if (menusOpen()) closeMenus();
        setAltModeRef?.(!altMode);
      }
      altDown = false;
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, [windowId]);

  const [leftDrag, setLeftDrag] = useState(0);
  const [bottomDrag, setBottomDrag] = useState(0);
  const full = devData.FullScreen;

  return (
    <div className={'mainwin' + (full ? ' fullscreen' : '')} onContextMenu={(e) => e.preventDefault()}>
      {!full && <MenuBar menus={mainMenu()} active={active} altMode={alt} onAltModeEnd={() => setAltModeRef?.(false)} imageList="menu" />}
      <ToolbarDock />
      <div className="main-middle">
        {devData.ShowLeftPages && !devData.ProjectFloat && (
          <>
            <div style={{ display: 'flex', width: Math.max(45, ide.leftWidth + leftDrag) }}>
              <LeftPanelSized width={Math.max(45, ide.leftWidth + leftDrag)} />
            </div>
            <Splitter
              dir="v"
              onDrag={(d, done) => {
                if (done) {
                  ide.leftWidth = Math.max(45, ide.leftWidth + d);
                  devData.ProjectWidth = ide.leftWidth;
                  saveSettings();
                  setLeftDrag(0);
                } else setLeftDrag(d);
              }}
            />
          </>
        )}
        <EditorArea />
      </div>
      {ide.messagePage !== null && !devData.MessageFloat && (
        <Splitter
          dir="h"
          onDrag={(d, done) => {
            if (done) {
              ide.messageHeight = Math.max(80, ide.messageHeight - d);
              devData.OutputHeight = ide.messageHeight;
              saveSettings();
              setBottomDrag(0);
              ide.msgs.emit();
            } else setBottomDrag(d);
          }}
        />
      )}
      {!devData.MessageFloat && <MessagePanelSized drag={bottomDrag} />}
      {devData.Statusbar && <StatusBar />}
    </div>
  );
}

function LeftPanelSized({ width }: { width: number }) {
  void width;
  return <LeftPanel />;
}

function MessagePanelSized({ drag }: { drag: number }) {
  return <MessagePanel height={Math.max(80, ide.messageHeight - drag)} />;
}
