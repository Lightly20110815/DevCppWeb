// Builds the main menu and popup menus from main.dfm, including the dynamic items
// (reopen history, bookmarks, code inserts, window list, tools).
import { actions, actionCaption, isEnabled, execute, shortcutText, mainForm } from './actions';
import type { DfmNode } from '../vcl/FormCtl';
import type { MenuItem } from '../os/menu';
import { lang, format } from '../lang/lang';
import * as L from '../generated/langIds';
import { ide } from './ide';
import { devData, settings, saveSettings } from './config';
import { getFileTyp } from './version';
import { vfs } from '../os/vfs';
import { MessageDlg } from '../os/messagebox';
import { parseMacros } from './macros';

const ITEM_IDS: Record<string, number> = {
  FileMenu: L.ID_MNU_FILE, EditMenu: L.ID_MNU_EDIT, SearchMenu: L.ID_MNU_SEARCH, ViewMenu: L.ID_MNU_VIEW,
  ProjectMenu: L.ID_MNU_PROJECT, ExecuteMenu: L.ID_MNU_EXECUTE, ToolsMenu: L.ID_MNU_TOOLS, WindowMenu: L.ID_MNU_WINDOW,
  HelpMenu: L.ID_MNU_HELP, mnuNew: L.ID_SUB_NEW, ImportItem: L.ID_SUB_IMPORT, ExportItem: L.ID_SUB_EXPORT,
  DateTimeMenuItem: L.ID_ITEM_DATETIME, CommentheaderMenuItem: L.ID_ITEM_COMMENTHEADER, ToolbarsItem: L.ID_SUB_TOOLBARS,
  ToolMainItem: L.ID_TOOLMAIN, ToolEditItem: L.ID_TOOLEDIT, ToolSearchItem: L.ID_TOOLSEARCH,
  ToolCompileandRunItem: L.ID_TOOLCOMPRUN, ToolProjectItem: L.ID_TOOLPROJECT, ToolSpecialsItem: L.ID_TOOLSPECIAL,
  ToolClassesItem: L.ID_LP_CLASSES, ToolCompilersItem: L.ID_TOOLCOMPILERS, FloatingPojectManagerItem: L.ID_ITEM_FLOATWINDOW,
  FloatingReportwindowItem: L.ID_ITEM_FLOATREPORT, ListItem: L.ID_ITEM_LIST, mnuOpenWith: L.ID_POP_OPENWITH,
  mnuBrowserViewMode: L.ID_POP_VIEWMODE, ClearallWatchPop: L.ID_ITEM_CLEARALL, NewunitinprojectPopItem: L.ID_ITEM_NEWFILE,
};

const TOOLBAR_ITEMS: Record<string, string> = {
  ToolMainItem: 'tbMain', ToolEditItem: 'tbEdit', ToolSearchItem: 'tbSearch', ToolProjectItem: 'tbProject',
  ToolCompileandRunItem: 'tbCompile', ToolCompilersItem: 'tbCompilers', ToolSpecialsItem: 'tbSpecials', ToolClassesItem: 'tbClasses',
};

function find(n: DfmNode, name: string): DfmNode | undefined {
  if (n.name === name) return n;
  for (const c of n.children) {
    const r = find(c, name);
    if (r) return r;
  }
  return undefined;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function dateTimeText() {
  const d = new Date();
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function buildInsertMenu(): MenuItem[] {
  const e = () => ide.getEditor();
  const items: MenuItem[] = [
    { caption: lang(L.ID_ITEM_DATETIME), onClick: () => e()?.insertString(dateTimeText(), true) },
    {
      caption: lang(L.ID_ITEM_COMMENTHEADER),
      onClick: () =>
        e()?.insertString(`/*\r\n\tName: \r\n\tCopyright: \r\n\tAuthor: \r\n\tDate: ${dateTimeText()}\r\n\tDescription: \r\n*/\r\n`, true),
    },
  ];
  let sep = 0;
  settings.codeInserts.forEach((ci, idx) => {
    if (idx === 0 || ci.sep > sep) {
      items.push({ caption: '-' });
      sep = ci.sep;
    }
    items.push({ caption: ci.caption, onClick: () => e()?.insertString(parseMacros(ci.code), true) });
  });
  return items;
}

export function buildBookmarkMenu(toggle: boolean): MenuItem[] {
  const e = ide.getEditor();
  const out: MenuItem[] = [];
  for (let i = 1; i <= 9; i++) {
    const has = !!e?.bookmarks.has(i);
    out.push({
      caption: format('%s &%d', [lang(L.ID_MARKTEXT), i]),
      shortcut: toggle ? `Ctrl+${i}` : `Alt+${i}`,
      checked: has,
      onClick: () => (toggle ? toggleBookmark(i) : gotoBookmark(i)),
    });
  }
  return out;
}

export function toggleBookmark(i: number) {
  const e = ide.getEditor();
  if (!e) return;
  if (e.bookmarks.has(i) && e.bookmarks.get(i) === e.caretLine) e.bookmarks.delete(i);
  else e.bookmarks.set(i, e.caretLine);
  ide.changed();
}

export function gotoBookmark(i: number) {
  const e = ide.getEditor();
  const line = e?.bookmarks.get(i);
  if (e && line) e.setCaretPosAndActivate(line, 1);
}

function mruItems(): { projects: MenuItem[]; files: MenuItem[] } {
  const projects: MenuItem[] = [];
  const files: MenuItem[] = [];
  let count = 0;
  const hist = devData.History.filter((f) => vfs.fileExists(f)).slice(0, devData.MRUMax);
  const click = (f: string) => async () => {
    if (vfs.fileExists(f)) {
      if (getFileTyp(f) === 'prj') await ide.openProject(f);
      else await ide.openFile(f);
    } else await MessageDlg(format(lang(L.ID_ERR_RENAMEDDELETED), [f]), 'mtInformation', ['mbOK']);
  };
  for (const f of hist) if (getFileTyp(f) === 'prj') projects.push({ caption: `&${(count++).toString(16).toUpperCase()} ${f}`, onClick: click(f) });
  for (const f of hist) if (getFileTyp(f) !== 'prj' && count < devData.MRUMax) files.push({ caption: `&${(count++).toString(16).toUpperCase()} ${f}`, onClick: click(f) });
  return { projects, files };
}

function windowListItems(): MenuItem[] {
  return ide.allEditors.slice(0, 10).map((e, i) => ({
    caption: `&${i} ${e.fileName}${e.modified ? ' *' : ''}`,
    onClick: () => ide.activate(e),
  }));
}

function toolItems(): MenuItem[] {
  if (!settings.tools.length) return [];
  return [
    { caption: '-' },
    ...settings.tools.map((t) => ({
      caption: t.Title,
      onClick: async () => {
        const f = await import('./forms');
        f.runTool(t);
      },
    })),
  ];
}

/** Converts a TMenuItem node (and children) into MenuItems */
export function convertMenu(node: DfmNode, imageListActions = true): MenuItem[] {
  const out: MenuItem[] = [];
  for (const c of node.children) {
    if (c.class !== 'TMenuItem') continue;
    const p = c.props;
    if (p.Visible === 'False') continue;
    if (p.Caption === '-') {
      out.push({ caption: '-', key: c.name });
      continue;
    }
    // dynamic parts
    if (c.name === 'ClearhistoryItem') {
      const { projects, files } = mruItems();
      // N21 (top separator) is already in out; projects, N76, files, N11
      out.push(...projects);
      if (projects.length && files.length) out.push({ caption: '-' });
      out.push(...files);
      if (projects.length || files.length) {
        out.push({ caption: '-' });
        out.push(actionItem('actHistoryClear', c.name));
      }
      continue;
    }
    if (c.name === 'ListItem') {
      out.push(...windowListItems());
    }
    if (c.name === 'InsertItem' || c.name === 'InsertPopItem') {
      const a = actions.get('actInsert')!;
      out.push({ caption: actionCaption(a), image: a.imageIndex, enabled: isEnabled(a), items: () => buildInsertMenu(), key: c.name });
      continue;
    }
    if (c.name === 'ToggleBookmarksItem' || c.name === 'TogglebookmarksPopItem') {
      const a = actions.get('actToggle')!;
      out.push({ caption: actionCaption(a), image: a.imageIndex, enabled: isEnabled(a), items: () => buildBookmarkMenu(true), key: c.name });
      continue;
    }
    if (c.name === 'GotoBookmarksItem' || c.name === 'GotobookmarksPopItem') {
      const a = actions.get('actGoto')!;
      out.push({ caption: actionCaption(a), image: a.imageIndex, enabled: isEnabled(a), items: () => buildBookmarkMenu(false), key: c.name });
      continue;
    }
    if (p.Action) {
      const item = actionItem(p.Action, c.name);
      if (c.name === 'NewunitinprojectPopItem' && p.Caption) item.caption = lang(L.ID_ITEM_NEWFILE);
      if (c.children.length) item.items = () => convertMenu(c);
      if (p.RadioItem === 'True') item.radio = true;
      out.push(item);
      if (c.name === 'PackageManagerItem') out.push(...toolItems());
      continue;
    }
    const caption = ITEM_IDS[c.name] ? lang(ITEM_IDS[c.name]) : p.Caption ?? c.name;
    const item: MenuItem = { caption, key: c.name, image: p.ImageIndex !== undefined ? Number(p.ImageIndex) : undefined };
    if (TOOLBAR_ITEMS[c.name]) {
      const tb = TOOLBAR_ITEMS[c.name];
      item.checked = devData.Toolbars[tb]?.visible !== false;
      item.onClick = () => {
        devData.Toolbars[tb] = { ...devData.Toolbars[tb], visible: !(devData.Toolbars[tb]?.visible !== false) };
        saveSettings();
        ide.changed();
      };
    } else if (c.name === 'FloatingPojectManagerItem' || c.name === 'FloatingReportwindowItem') {
      item.checked = c.name === 'FloatingPojectManagerItem' ? devData.ProjectFloat : devData.MessageFloat;
      item.onClick = async () => {
        const f = await import('./forms');
        f.toggleFloating(c.name === 'FloatingPojectManagerItem' ? 'project' : 'report');
      };
    } else if (c.name === 'ListItem') {
      item.onClick = async () => (await import('./forms')).windowList();
    } else if (c.name === 'ClearallWatchPop') {
      item.onClick = () => {};
    } else if (c.name === 'mnuOpenWith') {
      item.enabled = false;
    } else if (c.name === 'DateTimeMenuItem' || c.name === 'CommentheaderMenuItem') {
      const ins = buildInsertMenu();
      item.onClick = ins[c.name === 'DateTimeMenuItem' ? 0 : 1].onClick;
    }
    if (c.children.length) item.items = () => convertMenu(c);
    out.push(item);
  }
  void imageListActions;
  return out;
}

function actionItem(name: string, key: string): MenuItem {
  const a = actions.get(name);
  if (!a) return { caption: name, key };
  return {
    key,
    caption: actionCaption(a),
    shortcut: shortcutText(a),
    image: a.imageIndex,
    enabled: !!a.execute && isEnabled(a),
    checked: a.checked?.(),
    onClick: () => void execute(name),
  };
}

export function mainMenu(): MenuItem[] {
  const mm = find(mainForm, 'MainMenu')!;
  return mm.children
    .filter((c) => c.class === 'TMenuItem')
    .map((c) => ({
      caption: ITEM_IDS[c.name] ? lang(ITEM_IDS[c.name]) : c.props.Caption,
      key: c.name,
      items: () => convertMenu(c),
    }));
}

export function popupMenu(name: 'EditorPopup' | 'UnitPopup' | 'ProjectPopup' | 'MessagePopup' | 'BrowserPopup' | 'DebugPopup' | 'FolderPopup'): MenuItem[] {
  return convertMenu(find(mainForm, name)!);
}

export function toolbarsMenu(): MenuItem[] {
  return convertMenu(find(mainForm, 'ToolbarsItem')!);
}
