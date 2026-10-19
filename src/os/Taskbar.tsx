import { useEffect, useState } from 'react';
import { useWM, wm } from './wm';
import type { DesktopApp } from './Desktop';
import { Lang } from '../lang/lang';

function WinLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M0 2.2l6.5-.9v6.3H0zM7.3 1.2L16 0v7.6H7.3zM0 8.4h6.5v6.3L0 13.8zM7.3 8.4H16V16l-8.7-1.2z" />
    </svg>
  );
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const zh = Lang.isChinese;
  const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
  const date = zh
    ? `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`
    : `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
  return (
    <div className="tb-clock" title={now.toLocaleDateString(zh ? 'zh-CN' : 'en-US', { dateStyle: 'full' })}>
      <div>{time}</div>
      <div>{date}</div>
    </div>
  );
}

export function Taskbar({ apps }: { apps: DesktopApp[] }) {
  const m = useWM();
  const [, setV] = useState(0);
  useEffect(() => Lang.subscribe(() => setV((v) => v + 1)), []);
  const [startOpen, setStartOpen] = useState(false);
  const roots = m.windows.filter((w) => w.taskbar);

  useEffect(() => {
    if (!startOpen) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.start-menu, .tb-start')) setStartOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [startOpen]);

  return (
    <>
      {startOpen && (
        <div className="start-menu">
          <div className="start-left">
            <div className="start-side-item" title="Power" onClick={() => location.reload()}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M8 1v7M4.5 3.5a6 6 0 1 0 7 0" /></svg>
            </div>
          </div>
          <div className="start-list">
            <div className="start-group">D</div>
            {apps.map((a) => (
              <div
                key={a.id}
                className="start-item"
                onClick={() => {
                  setStartOpen(false);
                  a.launch();
                }}
              >
                <img src={a.icon} alt="" />
                <span>{a.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="taskbar">
        <div className={'tb-start' + (startOpen ? ' open' : '')} onClick={() => setStartOpen((v) => !v)}>
          <WinLogo />
        </div>
        <div className="tb-search">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="9.5" cy="6.5" r="5" /><path d="M6 10L1 15" /></svg>
          <span>{Lang.isChinese ? '在这里输入你要搜索的内容' : 'Type here to search'}</span>
        </div>
        <div className="tb-apps">
          {apps
            .filter((a) => !roots.some((w) => w.appId === a.id))
            .map((a) => (
              <div key={a.id} className="tb-app pinned" title={a.name} onClick={() => a.launch()}>
                <img src={a.icon} alt="" />
              </div>
            ))}
          {roots.map((w) => {
            const active = m.isActiveTree(w.id) && w.state !== 'minimized';
            return (
              <div
                key={w.id}
                className={'tb-app running' + (active ? ' active' : '')}
                title={w.title}
                onClick={() => {
                  if (active) wm.minimize(w.id);
                  else wm.focus(w.id);
                }}
              >
                <img src={w.icon} alt="" />
              </div>
            );
          })}
        </div>
        <div className="tb-tray">
          <div className="tb-tray-icon">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"><path d="M2 8l4-4 4 4" /></svg>
          </div>
          <div className="tb-tray-icon" title="Network">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"><rect x="1.5" y="3.5" width="13" height="8" /><path d="M5 14.5h6M8 11.5v3" /></svg>
          </div>
          <div className="tb-tray-icon" title="Volume">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="M2 6h3l4-3v10l-4-3H2z" /><path d="M11 5.5a3.5 3.5 0 0 1 0 5" /></svg>
          </div>
          <div className="tb-ime">{Lang.isChinese ? '中' : 'ENG'}</div>
          <Clock />
          <div className="tb-notify">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="M1.5 2.5h13v9h-7l-3 3v-3h-3z" /></svg>
          </div>
          <div
            className="tb-showdesktop"
            onClick={() => {
              for (const w of wm.windows) if (w.taskbar) wm.minimize(w.id);
            }}
          />
        </div>
      </div>
    </>
  );
}
