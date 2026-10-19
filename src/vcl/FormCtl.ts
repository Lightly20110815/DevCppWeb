// State container for a Delphi form rendered from its DFM: every control is addressed by
// its component name, initial values come from the DFM, controllers override them at runtime.
import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

export interface DfmNode {
  name: string;
  class: string;
  props: Record<string, any>;
  children: DfmNode[];
}

export interface LvItem {
  caption: string;
  subItems?: string[];
  imageIndex?: number;
  checked?: boolean;
  data?: any;
  color?: string;
  bold?: boolean;
}

export interface TreeNode {
  text: string;
  imageIndex?: number;
  selectedIndex?: number;
  expanded?: boolean;
  children?: TreeNode[];
  data?: any;
  bold?: boolean;
  color?: string;
}

export interface CtlState {
  caption?: string;
  text?: string;
  checked?: boolean;
  enabled?: boolean;
  visible?: boolean;
  items?: string[];
  itemIndex?: number;
  value?: number;
  minValue?: number;
  maxValue?: number;
  lines?: string[];
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  color?: string | null;
  fontColor?: string | null;
  fontBold?: boolean;
  fontName?: string;
  fontSize?: number;
  hint?: string;
  wordWrap?: boolean;
  activePage?: string;
  tabIndex?: number;
  tabs?: string[];
  lvItems?: LvItem[];
  columns?: { caption: string; width: number }[];
  selIndex?: number;
  selSet?: number[];
  nodes?: TreeNode[];
  selNode?: TreeNode | null;
  checkedItems?: boolean[];
  grid?: string[][];
  readOnly?: boolean;
  imgSrc?: string;
  position?: number;
  render?: () => ReactNode;
  passwordChar?: boolean;
  tabVisible?: boolean;
  colorValue?: string; // TColorBox selected color (css)
  data?: any;
}

type Handler = (sender: string, ...args: any[]) => any;

export const mrNone = 0;
export const mrOk = 1;
export const mrCancel = 2;
export const mrAbort = 3;
export const mrRetry = 4;
export const mrIgnore = 5;
export const mrYes = 6;
export const mrNo = 7;
export const mrAll = 8;
export const mrNoToAll = 9;
export const mrYesToAll = 10;

export const MODAL_RESULTS: Record<string, number> = {
  mrNone, mrOk, mrCancel, mrAbort, mrRetry, mrIgnore, mrYes, mrNo, mrAll, mrNoToAll, mrYesToAll,
};

const truthy = (v: unknown) => v === 'True' || v === true;
const num = (v: unknown, d = 0) => (v === undefined || v === null || v === '' ? d : Number(v));

export class FormCtl {
  def: DfmNode;
  nodes = new Map<string, DfmNode>();
  parents = new Map<string, string>();
  private state = new Map<string, CtlState>();
  handlers: Record<string, Handler> = {};
  private version = 0;
  private listeners = new Set<() => void>();
  closeWith: ((r: number) => void) | null = null;
  modalResult = mrNone;
  focused: string | null = null;
  windowId = 0;
  /** dynamic children added at runtime (e.g. compiler options property list rows) */
  extra: Record<string, ReactNode> = {};

  constructor(def: DfmNode) {
    this.def = def;
    const walk = (n: DfmNode, parent: string | null) => {
      this.nodes.set(n.name, n);
      if (parent) this.parents.set(n.name, parent);
      for (const c of n.children) walk(c, n.name);
    };
    walk(def, null);
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  getVersion = () => this.version;
  changed() {
    this.version++;
    for (const l of this.listeners) l();
  }

  node(name: string) {
    return this.nodes.get(name);
  }

  /** Initial state from DFM properties */
  private initial(name: string): CtlState {
    const n = this.nodes.get(name);
    const p = n?.props ?? {};
    const s: CtlState = {
      caption: p.Caption,
      text: p.Text,
      checked: truthy(p.Checked),
      enabled: p.Enabled !== 'False',
      visible: p.Visible !== 'False',
      items: p['Items.Strings'] ? [...p['Items.Strings']] : undefined,
      itemIndex: num(p.ItemIndex, -1),
      lines: p['Lines.Strings'] ? [...p['Lines.Strings']] : undefined,
      readOnly: truthy(p.ReadOnly),
      hint: p.Hint,
      tabVisible: p.TabVisible !== 'False',
    };
    if (n?.class === 'TSpinEdit' || n?.class === 'TUpDown') {
      s.value = num(p.Value);
      s.minValue = num(p.MinValue);
      s.maxValue = num(p.MaxValue, 0);
    }
    if (n?.class === 'TTrackBar') {
      s.position = num(p.Position);
      s.minValue = num(p.Min);
      s.maxValue = num(p.Max, 10);
    }
    if (n?.class === 'TPageControl') s.activePage = p.ActivePage;
    if (n?.class === 'TTabControl') {
      s.tabs = p['Tabs.Strings'] ? [...p['Tabs.Strings']] : [];
      s.tabIndex = num(p.TabIndex, 0);
    }
    if (n?.class === 'TRadioGroup') s.itemIndex = num(p.ItemIndex, -1);
    if (n?.class === 'TListView' && Array.isArray(p.Columns)) {
      s.columns = p.Columns.map((c: any) => ({ caption: c?.Caption ?? '', width: num(c?.Width, 50) }));
    }
    if (n?.class === 'TComboBox' && s.text === undefined && s.items && s.itemIndex! >= 0) s.text = s.items[s.itemIndex!];
    return s;
  }

  get(name: string): CtlState {
    let s = this.state.get(name);
    if (!s) {
      s = this.initial(name);
      this.state.set(name, s);
    }
    return s;
  }

  set(name: string, patch: CtlState) {
    const s = this.get(name);
    if (patch.text !== undefined && patch.lines === undefined && s.lines !== undefined) s.lines = patch.text.split(/\r?\n/);
    Object.assign(s, patch);
    this.changed();
  }

  // convenience accessors in Delphi style
  caption(name: string, v?: string) {
    if (v !== undefined) this.set(name, { caption: v });
    return this.get(name).caption ?? '';
  }
  text(name: string, v?: string) {
    if (v !== undefined) this.set(name, { text: v });
    return this.get(name).text ?? '';
  }
  checked(name: string, v?: boolean) {
    if (v !== undefined) this.set(name, { checked: v });
    return !!this.get(name).checked;
  }
  enabled(name: string, v?: boolean) {
    if (v !== undefined) this.set(name, { enabled: v });
    return this.get(name).enabled !== false;
  }
  visible(name: string, v?: boolean) {
    if (v !== undefined) this.set(name, { visible: v });
    return this.get(name).visible !== false;
  }
  itemIndex(name: string, v?: number) {
    if (v !== undefined) {
      const items = this.get(name).items ?? [];
      this.set(name, { itemIndex: v, text: v >= 0 && v < items.length ? items[v] : this.get(name).text });
    }
    return this.get(name).itemIndex ?? -1;
  }
  items(name: string, v?: string[]) {
    if (v !== undefined) this.set(name, { items: v });
    return this.get(name).items ?? [];
  }
  value(name: string, v?: number) {
    if (v !== undefined) this.set(name, { value: v });
    return this.get(name).value ?? 0;
  }
  lines(name: string, v?: string[]) {
    if (v !== undefined) this.set(name, { lines: v, text: v.join('\r\n') });
    const s = this.get(name);
    return s.lines ?? (s.text ? s.text.split(/\r?\n/) : []);
  }

  /** Fires the DFM event handler (e.g. OnClick="OkBtnClick") and/or a handler named "<name>.<Event>" */
  fire(name: string, event: string, ...args: any[]) {
    const n = this.nodes.get(name);
    const hname = n?.props['On' + event];
    let r: any;
    if (hname && this.handlers[hname]) r = this.handlers[hname](name, ...args);
    const direct = this.handlers[`${name}.${event}`];
    if (direct) r = direct(name, ...args);
    return r;
  }

  close(result: number) {
    this.modalResult = result;
    this.closeWith?.(result);
  }

  /** Clicking a button like TButton.Click: the form's ModalResult is taken from the button
   *  before OnClick runs; OnClick may return false (or set abortClose) to keep the form open. */
  abortClose = false;
  click(name: string) {
    const n = this.nodes.get(name);
    if (!n || !this.enabled(name)) return;
    const p = n.props;
    let mr = MODAL_RESULTS[p.ModalResult as string] ?? (Number(p.ModalResult) || mrNone);
    if (!mr && n.class === 'TBitBtn') {
      const kind = p.Kind as string | undefined;
      if (kind === 'bkOK') mr = mrOk;
      else if (kind === 'bkCancel') mr = mrCancel;
      else if (kind === 'bkYes') mr = mrYes;
      else if (kind === 'bkNo') mr = mrNo;
      else if (kind === 'bkAbort') mr = mrAbort;
      else if (kind === 'bkRetry') mr = mrRetry;
      else if (kind === 'bkIgnore') mr = mrIgnore;
      else if (kind === 'bkAll') mr = mrAll;
    }
    const override = this.get(name).data?.modalResult;
    if (override !== undefined) mr = override;
    this.abortClose = false;
    const reportError = (error: unknown) => {
      void import('../os/messagebox').then(({ MessageDlg }) => MessageDlg(String((error as Error)?.message ?? error), 'mtError', ['mbOK']));
    };
    let res: unknown;
    try { res = this.fire(name, 'Click'); } catch (error) { reportError(error); return; }
    const finish = (r: unknown) => {
      if (r === false || this.abortClose) return;
      if (p.Kind === 'bkClose') this.close(mrNone);
      else if (mr) this.close(mr);
    };
    if (res && typeof (res as Promise<unknown>).then === 'function') void (res as Promise<unknown>).then(finish, reportError);
    else finish(res);
  }

  defaultButton(): string | null {
    for (const [name, n] of this.nodes) {
      if ((n.class === 'TButton' || n.class === 'TBitBtn') && (n.props.Default === 'True' || (n.class === 'TBitBtn' && (n.props.Kind === 'bkOK' || n.props.Kind === 'bkYes') && n.props.Default !== 'False')) && this.isShowing(name) && this.enabled(name)) return name;
    }
    return null;
  }

  cancelButton(): string | null {
    for (const [name, n] of this.nodes) {
      if ((n.class === 'TButton' || n.class === 'TBitBtn') && (n.props.Cancel === 'True' || n.props.Kind === 'bkCancel' || n.props.ModalResult === 'mrCancel' || Number(n.props.ModalResult) === mrCancel) && this.isShowing(name)) return name;
    }
    return null;
  }

  /** visible including all parents and active tab pages */
  isShowing(name: string): boolean {
    let cur: string | undefined = name;
    while (cur) {
      const st = this.get(cur);
      if (st.visible === false) return false;
      const parent = this.parents.get(cur);
      if (parent && this.nodes.get(parent)?.class === 'TPageControl') {
        if (this.activePageOf(parent) !== cur) return false;
      }
      cur = parent;
    }
    return true;
  }

  activePageOf(pc: string) {
    const st = this.get(pc);
    const sheets = this.nodes.get(pc)!.children.filter((c) => c.class === 'TTabSheet' && this.get(c.name).tabVisible !== false);
    if (st.activePage && sheets.some((s) => s.name === st.activePage)) return st.activePage;
    return sheets[0]?.name;
  }

  setActivePage(pc: string, sheet: string) {
    const old = this.activePageOf(pc);
    if (old === sheet) return;
    this.set(pc, { activePage: sheet });
    this.fire(pc, 'Change');
  }
}

export function useFormCtl(ctl: FormCtl) {
  useSyncExternalStore(ctl.subscribe, ctl.getVersion);
  return ctl;
}
