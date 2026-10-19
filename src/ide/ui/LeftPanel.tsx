// LeftPageControl: Project / Classes / Debug sheets.
import { useState } from 'react';
import { useIde, ide } from '../ide';
import type { LeftPage } from '../ide';
import { TabStrip, TreeView } from '../../vcl/controls';
import type { TreeNode } from '../../vcl/FormCtl';
import { lang } from '../../lang/lang';
import * as L from '../../generated/langIds';
import { settings, devData, saveSettings } from '../config';
import { parser } from '../parser/service';
import type { Statement } from '../parser/CppParser';
import { statementKindStr } from '../parser/CppParser';
import { openPopup } from '../../os/menu';
import { popupMenu } from '../menus';
import { basename } from '../../os/vfs';

const KIND_ORDER = ['class', 'function', 'constructor', 'destructor', 'variable', 'typedef', 'enum', 'preprocessor', 'unknown'];

function statementImage(s: Statement) {
  switch (s.kind) {
    case 'class':
      return 1;
    case 'variable':
    case 'enum':
    case 'typedef':
      return s.classScope === 'private' ? 2 : s.classScope === 'protected' ? 3 : 4;
    case 'function':
    case 'constructor':
    case 'destructor':
      return s.classScope === 'private' ? 5 : s.classScope === 'protected' ? 6 : 7;
    default:
      return 4;
  }
}

function sortNodes(nodes: TreeNode[]) {
  nodes.sort((a, b) => {
    const sa = a.data as Statement;
    const sb = b.data as Statement;
    const k = KIND_ORDER.indexOf(sa.kind) - KIND_ORDER.indexOf(sb.kind);
    return k !== 0 ? k : a.text.toLowerCase().localeCompare(b.text.toLowerCase());
  });
  return nodes;
}

const browserExpanded = new Set<string>();

function ClassBrowserView() {
  useIde('ui');
  const stmts = parser.browserStatements();
  const build = (parent: Statement | null): TreeNode[] =>
    sortNodes(
      stmts
        .filter((s) => s.parent === parent)
        .map((s) => {
          const key = `${s.fileName}:${s.type}:${s.command}:${s.args}`;
          const n: TreeNode = { text: s.command, imageIndex: statementImage(s), selectedIndex: statementImage(s), data: s, expanded: browserExpanded.has(key) };
          if (s.kind === 'class') n.children = build(s);
          return n;
        }),
    );
  const nodes = parser.currentFile || settings.classBrowsing.ShowFilter !== 2 ? build(null) : [];
  const find = (list: TreeNode[]): TreeNode | null => {
    for (const n of list) {
      if (n.data === ide.browserSelected) return n;
      const r = n.children ? find(n.children) : null;
      if (r) return r;
    }
    return null;
  };
  return (
    <TreeView
      className="classbrowser"
      nodes={nodes}
      selected={find(nodes)}
      imageList="class"
      showLines
      onToggle={(n) => {
        const s = n.data as Statement;
        const key = `${s.fileName}:${s.type}:${s.command}:${s.args}`;
        if (n.expanded) browserExpanded.add(key);
        else browserExpanded.delete(key);
      }}
      onSelect={(n) => {
        ide.browserSelected = n.data as Statement;
        const s = n.data as Statement;
        const file = s.hasDefinition ? s.definitionFileName : s.fileName;
        const line = s.hasDefinition ? s.definitionLine : s.line;
        const e = ide.getEditorFromFileName(file);
        if (e) {
          e.setCaretPosAndActivate(line, 1);
          ide.activate(e);
        }
        ide.changed();
      }}
      onContextMenu={(e) => openPopup(popupMenu('BrowserPopup'), e.clientX, e.clientY, { imageList: 'menu' })}
      renderText={(n) => {
        const s = n.data as Statement;
        return (
          <>
            <b>{s.command}</b>
            {s.args && <span className="cb-args">{s.args}</span>}
            <span className="cb-type"> : {s.type || statementKindStr(s.kind)}</span>
          </>
        );
      }}
    />
  );
}

function ProjectView() {
  useIde('ui');
  const [sel, setSel] = useState<string | null>(null);
  const p = ide.project;
  if (!p) return <div className="vtree" style={{ position: 'absolute', inset: 0, border: 'none' }} />;
  const folderNode = (path: string): TreeNode => ({
    text: path.split('/').pop()!,
    imageIndex: 4,
    selectedIndex: 4,
    expanded: p.expanded.has(path),
    data: { folder: path },
    children: [
      ...p.folders.filter((f) => f.startsWith(path + '/') && !f.slice(path.length + 1).includes('/')).sort().map(folderNode),
      ...p.units
        .map((u, i) => ({ u, i }))
        .filter(({ u }) => u.folder === path)
        .sort((a, b) => basename(a.u.fileName).localeCompare(basename(b.u.fileName)))
        .map(({ u, i }) => ({ text: basename(u.fileName), imageIndex: 1, selectedIndex: 1, data: { unit: i } })),
    ],
  });
  const root: TreeNode = {
    text: p.name,
    imageIndex: 0,
    selectedIndex: 0,
    expanded: p.expanded.has(''),
    data: { project: true },
    children: [
      ...p.folders.filter((f) => !f.includes('/')).sort().map(folderNode),
      ...p.units
        .map((u, i) => ({ u, i }))
        .filter(({ u }) => !u.folder)
        .sort((a, b) => basename(a.u.fileName).localeCompare(basename(b.u.fileName)))
        .map(({ u, i }) => ({ text: basename(u.fileName), imageIndex: 1, selectedIndex: 1, data: { unit: i } })),
    ],
  };
  const keyOf = (n: TreeNode) => JSON.stringify(n.data);
  const findSel = (n: TreeNode): TreeNode | null => (keyOf(n) === sel ? n : (n.children ?? []).map(findSel).find(Boolean) ?? null);
  return (
    <TreeView
      className="projectview"
      nodes={[root]}
      selected={findSel(root)}
      imageList="project"
      onToggle={(n) => {
        const d = n.data as { folder?: string; project?: boolean };
        const path = d.project ? '' : d.folder;
        if (path === undefined) return;
        if (n.expanded) p.expanded.add(path);
        else p.expanded.delete(path);
      }}
      onSelect={(n) => {
        setSel(keyOf(n));
        ide.projectSelection = n.data;
        const d = n.data as { unit?: number };
        if (d.unit !== undefined) {
          const u = p.units[d.unit];
          let e = ide.fileIsOpen(u.fileName, true);
          if (!e) e = p.openUnit(d.unit);
          if (e) ide.activate(e);
        }
      }}
      onContextMenu={(e, n) => {
        if (!n || devData.FullScreen) return;
        const d = n.data as { unit?: number; folder?: string; project?: boolean };
        ide.projectSelection = d;
        setSel(keyOf(n));
        const menu = d.project ? 'ProjectPopup' : d.unit !== undefined ? 'UnitPopup' : 'FolderPopup';
        openPopup(popupMenu(menu), e.clientX, e.clientY, { imageList: 'menu' });
      }}
      onKeyDown={(e) => {
        if (e.key === 'Delete') void import('../forms').then((f) => f.unitRemove());
        if (e.key === 'F2') void import('../forms').then((f) => f.unitRename());
      }}
    />
  );
}

function DebugView() {
  return <div className="vtree" style={{ position: 'absolute', inset: 0, border: 'none' }} />;
}

export function LeftPanel() {
  useIde('ui');
  const showClasses = settings.classBrowsing.Enabled;
  const tabs = [lang(L.ID_LP_PROJECT), ...(showClasses ? [lang(L.ID_LP_CLASSES)] : []), lang(L.ID_SHEET_DEBUG)];
  const pages: LeftPage[] = showClasses ? [0, 1, 2] : [0, 2];
  const idx = Math.max(0, pages.indexOf(ide.leftPage));
  return (
    <div className="leftpanel" style={{ width: '100%' }}>
      <TabStrip
        tabs={tabs}
        index={idx}
        onChange={(i) => {
          ide.leftPage = pages[i];
          devData.LeftActivePage = pages[i];
          saveSettings();
          ide.changed();
        }}
      />
      <div className="leftpanel-page">
        {pages[idx] === 0 && <ProjectView />}
        {pages[idx] === 1 && <ClassBrowserView />}
        {pages[idx] === 2 && <DebugView />}
      </div>
    </div>
  );
}
