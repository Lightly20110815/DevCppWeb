// TControlBar with the Main/Edit/Search/Project/Compile/Compilers/Specials/Classes toolbars.
import { useRef } from 'react';
import type { ReactNode } from 'react';
import { useIde, ide } from '../ide';
import { actions, actionHint, isEnabled, execute, mainForm } from '../actions';
import { ImgIdx } from '../../os/images';
import { devData, settings, saveSettings } from '../config';
import { lang } from '../../lang/lang';
import * as L from '../../generated/langIds';
import { openPopup } from '../../os/menu';
import { toolbarsMenu, convertMenu } from '../menus';
import { ComboBox } from '../../vcl/controls';
import type { DfmNode } from '../../vcl/FormCtl';
import { ClassesToolbar } from './ClassesToolbar';
import { MessageDlg } from '../../os/messagebox';
import { mrNo } from '../../vcl/FormCtl';
import { getCompileTarget } from '../run';

const ROW = 28;
const GRIP = 11;

function findNode(n: DfmNode, name: string): DfmNode | undefined {
  if (n.name === name) return n;
  for (const c of n.children) {
    const r = findNode(c, name);
    if (r) return r;
  }
  return undefined;
}

const dock = findNode(mainForm, 'ToolbarDock')!;

function ToolButton({ node }: { node: DfmNode }) {
  const p = node.props;
  if (p.Width === '8' || p.Style === 'tbsSeparator') return <span className="tb-sep" />;
  const a = p.Action ? actions.get(p.Action) : undefined;
  if (node.name === 'NewFileBtn') {
    // "New" button shows the File > New submenu
    return (
      <span
        className="tb-btn"
        title={lang(L.ID_HINT_NEW)}
        onPointerDown={(e) => {
          e.preventDefault();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const mm = findNode(mainForm, 'mnuNew')!;
          openPopup(convertMenu(mm), r.left, r.bottom, { imageList: 'menu' });
        }}
      >
        <ImgIdx list="menu" index={Number(p.ImageIndex ?? 1)} />
      </span>
    );
  }
  if (!a) return null;
  const enabled = isEnabled(a) && !!a.execute;
  return (
    <span
      data-tb-btn={node.name}
      className={'tb-btn' + (enabled ? '' : ' disabled')}
      title={actionHint(a)}
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => enabled && void execute(a.name)}
    >
      <ImgIdx list="menu" index={a.imageIndex} disabled={!enabled} />
    </span>
  );
}

function CompilersToolbar() {
  const sets = settings.compilerSets;
  const idx = ide.project && getCompileTarget() === 'project' ? ide.project.options.compilerSet : settings.compilerSetIndex;
  return (
    <ComboBox
      className="tb-combo"
      items={sets.map((s) => s.name)}
      index={idx}
      style={{ width: 250, height: 22 }}
      onChange={async (i) => {
        if (i === idx) return;
        const t = getCompileTarget();
        if (ide.project && t === 'project') {
          if ((await MessageDlg(lang(L.ID_POPT_DISCARDCUSTOM), 'mtConfirmation', ['mbYes', 'mbNo'])) === mrNo) return;
          ide.project.options.compilerSet = i;
          ide.project.options.compilerOptions = sets[i].options;
          ide.project.modified = true;
        } else {
          settings.compilerSetIndex = i;
          saveSettings();
        }
        ide.changed();
      }}
    />
  );
}

interface Band {
  name: string;
  x: number;
  row: number;
  width: number;
  content: ReactNode;
}

export function ToolbarDock() {
  useIde('ui');
  const ref = useRef<HTMLDivElement>(null);
  const bands: Band[] = [];
  for (const tb of dock.children) {
    if (tb.class !== 'TToolBar') continue;
    const st = devData.Toolbars[tb.name] ?? { visible: true, x: Number(tb.props.Left), y: Number(tb.props.Top) };
    if (!st.visible) continue;
    let content: ReactNode;
    let width = Number(tb.props.Width);
    if (tb.name === 'tbClasses') content = <ClassesToolbar />;
    else if (tb.name === 'tbCompilers') content = <CompilersToolbar />;
    else {
      content = tb.children.filter((b) => b.class === 'TToolButton').map((b) => <ToolButton key={b.name} node={b} />);
      width = tb.children.filter((b) => b.class === 'TToolButton').reduce((a, b) => a + (b.props.Width === '8' ? 8 : 23), 0);
    }
    bands.push({ name: tb.name, x: st.x, row: Math.max(0, Math.round((st.y - 2) / ROW)), width, content });
  }
  // arrange bands on rows like TControlBar (no overlaps)
  const rows = new Map<number, Band[]>();
  for (const b of bands) {
    if (!rows.has(b.row)) rows.set(b.row, []);
    rows.get(b.row)!.push(b);
  }
  const rowKeys = [...rows.keys()].sort((a, b) => a - b);
  const placed: { b: Band; left: number; top: number }[] = [];
  rowKeys.forEach((rk, ri) => {
    const list = rows.get(rk)!.sort((a, b) => a.x - b.x);
    let next = 0;
    for (const b of list) {
      const left = Math.max(b.x - GRIP, next);
      placed.push({ b, left, top: ri * ROW });
      next = left + b.width + GRIP + 4;
    }
  });
  const height = Math.max(1, rowKeys.length) * ROW;

  const startDrag = (band: Band, left: number, top: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const move = (ev: PointerEvent) => {
      const nx = Math.max(GRIP, left + GRIP + ev.clientX - sx);
      const nrow = Math.max(0, Math.round((top + ev.clientY - sy) / ROW));
      devData.Toolbars[band.name] = { ...devData.Toolbars[band.name], visible: true, x: nx, y: 2 + Math.min(nrow, rowKeys.length) * ROW };
      ide.changed();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      saveSettings();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  if (devData.FullScreen && !devData.ShowBars) return null;
  return (
    <div
      ref={ref}
      className="controlbar"
      style={{ height }}
      onContextMenu={(e) => {
        e.preventDefault();
        openPopup(toolbarsMenu(), e.clientX, e.clientY, { imageList: 'menu' });
      }}
    >
      {placed.map(({ b, left, top }) => (
        <div key={b.name} className="cb-band" style={{ left, top: top + 2, width: b.width + GRIP + 2 }}>
          <div className="cb-grip" onPointerDown={startDrag(b, left, top)} />
          <div className="cb-content">{b.content}</div>
        </div>
      ))}
    </div>
  );
}
