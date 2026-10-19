// MessageControl: Compiler / Resource / Compile log / Debugging / Find results / Close.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useIde, ide } from '../ide';
import type { MessagePage, MsgItem } from '../ide';
import { TabStrip, ListView, CheckBox, ProgressBar } from '../../vcl/controls';
import type { LvColumn } from '../../vcl/controls';
import { lang } from '../../lang/lang';
import * as L from '../../generated/langIds';
import { actions, actionCaption, isEnabled, execute, mainForm } from '../actions';
import { ImgIdx } from '../../os/images';
import { devData } from '../config';
import { openPopup } from '../../os/menu';
import { popupMenu } from '../menus';
import { gotoMessage } from '../run';
import { FormCtl } from '../../vcl/FormCtl';
import type { DfmNode } from '../../vcl/FormCtl';
import { VclForm, setActionResolver } from '../../vcl/VclForm';

const PAGES: { key: Exclude<MessagePage, null> | 'close'; id: number; img: number }[] = [
  { key: 'comp', id: L.ID_SHEET_COMP, img: 28 },
  { key: 'res', id: L.ID_SHEET_RES, img: 2 },
  { key: 'log', id: L.ID_SHEET_COMPLOG, img: 43 },
  { key: 'debug', id: L.ID_SHEET_DEBUG, img: 32 },
  { key: 'find', id: L.ID_SHEET_FIND, img: 21 },
  { key: 'close', id: L.ID_SHEET_CLOSE, img: 9 },
];

setActionResolver((name) => {
  const a = actions.get(name);
  if (!a) return null;
  return { caption: actionCaption(a), enabled: isEnabled(a) && !!a.execute, execute: () => void execute(name), imageIndex: a.imageIndex };
});

function msgColor(it: { subItems?: string[] }) {
  const m = it.subItems?.[2] ?? '';
  if (m.startsWith('[Warning] ')) return '#ff6600';
  if (m.startsWith('[Error] ')) return '#ff0000';
  if (m.startsWith('[Hint] ')) return '#ffff00';
  return undefined;
}

function OutputList({ items, sel, onSel }: { items: MsgItem[]; sel: number; onSel: (i: number) => void }) {
  const columns: LvColumn[] = useMemo(
    () => [
      { caption: lang(L.ID_COL_LINE), width: 40 },
      { caption: lang(L.ID_COL_COL), width: 40 },
      { caption: lang(L.ID_COL_FILE), width: 320 },
      { caption: lang(L.ID_COL_MSG), width: 400, autoSize: true },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang(L.ID_COL_LINE)],
  );
  const lvItems = items.map((m) => ({ caption: m.line, subItems: [m.col, m.unit, m.msg] }));
  return (
    <ListView
      className="msglist"
      columns={columns}
      items={lvItems}
      sel={sel}
      gridLines
      rowColor={(it) => msgColor(it)}
      renderCell={(it, col) => {
        const t = col === 0 ? it.caption : it.subItems?.[col - 1] ?? '';
        if (col === 3) {
          const low = t.trim().toLowerCase();
          if (low.startsWith('in ') || low.startsWith('at ')) return <b>{t}</b>;
        }
        return t;
      }}
      onSel={onSel}
      onDblClick={(i) => gotoMessage(items[i])}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && sel >= 0) gotoMessage(items[sel]);
      }}
      onContextMenu={(e) => openPopup(popupMenu('MessagePopup'), e.clientX, e.clientY, { imageList: 'menu' })}
    />
  );
}

function FindList() {
  useIde('msgs');
  const items = ide.findOutput;
  const columns: LvColumn[] = [
    { caption: '', width: 15 },
    { caption: lang(L.ID_COL_LINE), width: 40 },
    { caption: lang(L.ID_COL_COL), width: 40 },
    { caption: lang(L.ID_COL_FILE), width: 320 },
    { caption: lang(L.ID_COL_MSG), width: 400, autoSize: true },
  ];
  const lv = items.map((m, i) => ({ caption: i === ide.findSel ? '>' : '', subItems: [m.line, m.col, m.unit, m.msg], data: m }));
  const open = (i: number) => {
    const m = items[i];
    if (!m || !m.line) return;
    void import('../forms/FindForm').then((f) => f.openFindResult(m));
  };
  return (
    <ListView
      className="msglist"
      columns={columns}
      items={lv}
      sel={ide.findSel}
      gridLines
      renderCell={(it, col) => {
        const m = it.data as (typeof items)[number];
        if (col !== 4 || !m) return col === 0 ? it.caption : it.subItems?.[col - 1] ?? '';
        const start = (parseInt(m.col, 10) || 1) - 1;
        const len = m.keyword.length;
        return (
          <>
            {m.msg.slice(0, start)}
            <b>{m.msg.slice(start, start + len)}</b>
            {m.msg.slice(start + len)}
          </>
        );
      }}
      onSel={(i) => {
        ide.findSel = i;
        ide.msgs.emit();
      }}
      onDblClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter') open(ide.findSel);
      }}
      onContextMenu={(e) => openPopup(popupMenu('MessagePopup'), e.clientX, e.clientY, { imageList: 'menu' })}
    />
  );
}

function LogSheet() {
  useIde('msgs');
  useIde('ui');
  const ref = useRef<HTMLTextAreaElement>(null);
  const abort = actions.get('actAbortCompilation')!;
  const text = ide.logLines.join('\n');
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text]);
  return (
    <div className="logsheet">
      <div className="log-info">
        <button className="vbtn flat speed abortbtn" disabled={!isEnabled(abort)} onClick={() => void execute('actAbortCompilation')}>
          <ImgIdx list="menu" index={abort.imageIndex} />
          <span>{actionCaption(abort)}</span>
        </button>
        <ProgressBar position={ide.progress.pos} max={ide.progress.max} style={{ position: 'absolute', left: 4, top: 40, width: 144, height: 24 }} />
        <CheckBox
          caption={actions.get('actShortenCompPaths')!.defaultCaption}
          checked={devData.ShortenCompPaths}
          style={{ position: 'absolute', left: 4, top: 69, width: 148, height: 17 }}
          onChange={() => void execute('actShortenCompPaths')}
        />
      </div>
      <textarea
        ref={ref}
        className="logoutput"
        readOnly
        wrap="off"
        value={text}
        spellCheck={false}
        onContextMenu={(e) => {
          e.preventDefault();
          openPopup(popupMenu('MessagePopup'), e.clientX, e.clientY, { imageList: 'menu' });
        }}
      />
    </div>
  );
}

function findNode(n: DfmNode, name: string): DfmNode | undefined {
  if (n.name === name) return n;
  for (const c of n.children) {
    const r = findNode(c, name);
    if (r) return r;
  }
  return undefined;
}

let debugCtl: FormCtl | null = null;
function DebugSheet() {
  useIde('ui');
  useIde('msgs');
  const ref = useRef<HTMLDivElement>(null);
  if (!debugCtl) {
    const sheet = findNode(mainForm, 'DebugSheet')!;
    debugCtl = new FormCtl({ ...sheet, props: { ...sheet.props, ClientWidth: '991', ClientHeight: '155' } });
  }
  const c = debugCtl;
  c.caption('lblSendCommandGdb', lang(L.ID_DEB_SENDGDBCOMMAND));
  c.caption('lblEvaluate', lang(L.ID_DEB_EVALUATE));
  c.set('DebugOutput', { lines: ide.debugOutput, readOnly: true });
  const len = (s: string) => s.length * 6 + 10;
  c.set('edGdbCommand', { left: len(lang(L.ID_DEB_SENDGDBCOMMAND)), width: 395 - len(lang(L.ID_DEB_SENDGDBCOMMAND)) + 4 });
  c.set('EvaluateInput', { left: len(lang(L.ID_DEB_EVALUATE)), width: 578 - len(lang(L.ID_DEB_EVALUATE)) + 4 });
  const [w, h] = useSize(ref);
  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0 }}>
      <VclForm ctl={c} width={w || 991} height={h || 155} />
    </div>
  );
}

function useSize(ref: React.RefObject<HTMLDivElement | null>): [number, number] {
  const size = useRef<[number, number]>([0, 0]);
  const [, force] = useForce();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      size.current = [el.clientWidth, el.clientHeight];
      force();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size.current;
}

import { useReducer } from 'react';
function useForce(): [number, () => void] {
  const [n, f] = useReducer((x: number) => x + 1, 0);
  return [n, f as () => void];
}

export function MessagePanel({ height }: { height?: number }) {
  useIde('msgs');
  useIde('ui');
  const open = ide.messagePage !== null;
  const captions = PAGES.map((p) => {
    let c = lang(p.id);
    if (p.key === 'comp' && ide.compilerOutput.length) c += ` (${ide.compilerOutput.length})`;
    if (p.key === 'res' && ide.resourceOutput.length) c += ` (${ide.resourceOutput.length})`;
    return c;
  });
  const visiblePages = open ? PAGES : PAGES.filter((p) => p.key !== 'close');
  const idx = open ? PAGES.findIndex((p) => p.key === ide.messagePage) : -1;
  return (
    <div className={'msgpanel' + (open ? ' open' : ' closed')} style={open ? { height: height ?? ide.messageHeight } : undefined}>
      <TabStrip
        className="msg-tabs"
        tabs={visiblePages.map((p) => captions[PAGES.indexOf(p)])}
        images={visiblePages.map((p) => p.img)}
        imageList="menu"
        index={idx}
        onChange={(i) => ide.setMessagePage(visiblePages[i].key)}
        onContextMenu={(e) => openPopup(popupMenu('MessagePopup'), e.clientX, e.clientY, { imageList: 'menu' })}
      />
      {open && (
        <div className="msg-sheet">
          {ide.messagePage === 'comp' && (
            <OutputList
              items={ide.compilerOutput}
              sel={ide.compSel}
              onSel={(i) => {
                ide.compSel = i;
                ide.msgs.emit();
              }}
            />
          )}
          {ide.messagePage === 'res' && (
            <OutputList
              items={ide.resourceOutput}
              sel={ide.resSel}
              onSel={(i) => {
                ide.resSel = i;
                ide.msgs.emit();
              }}
            />
          )}
          {ide.messagePage === 'log' && <LogSheet />}
          {ide.messagePage === 'debug' && <DebugSheet />}
          {ide.messagePage === 'find' && <FindList />}
        </div>
      )}
    </div>
  );
}

export function StatusBar() {
  useIde('status');
  const [a, b, c] = ide.statusText;
  return (
    <div className="statusbar">
      <div className="sb-panel" style={{ width: 480 }}>
        {a}
      </div>
      <div className="sb-panel" style={{ width: 80 }}>
        {b}
      </div>
      <div className="sb-panel last">{c}</div>
      <div className="sb-grip" />
    </div>
  );
}
