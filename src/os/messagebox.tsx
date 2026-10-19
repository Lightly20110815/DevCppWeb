// MessageDlg (VCL message form) and MessageBox (native Windows 10 dialog) look-alikes.
import { useEffect, useRef } from 'react';
import { showModal } from './wm';
import { Button } from '../vcl/controls';
import { Lang } from '../lang/lang';
import { mainWindowId } from '../vcl/VclForm';
import { mrOk, mrCancel, mrYes, mrNo, mrAbort, mrRetry, mrIgnore, mrAll, mrNoToAll, mrYesToAll } from '../vcl/FormCtl';

export type MsgDlgType = 'mtWarning' | 'mtError' | 'mtInformation' | 'mtConfirmation' | 'mtCustom';
export type MsgDlgBtn = 'mbYes' | 'mbNo' | 'mbOK' | 'mbCancel' | 'mbAbort' | 'mbRetry' | 'mbIgnore' | 'mbAll' | 'mbNoToAll' | 'mbYesToAll' | 'mbHelp';

export function SysIcon({ type, size = 32 }: { type: 'error' | 'warning' | 'info' | 'question'; size?: number }) {
  switch (type) {
    case 'error':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="15" fill="#e81123" />
          <path d="M10.5 10.5l11 11M21.5 10.5l-11 11" stroke="#fff" strokeWidth="2.2" />
        </svg>
      );
    case 'warning':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32">
          <path d="M16 2L31 29H1z" fill="#ffc83d" stroke="#d29200" strokeWidth="1" strokeLinejoin="round" />
          <path d="M16 10v10" stroke="#000" strokeWidth="2.6" />
          <circle cx="16" cy="24.5" r="1.7" fill="#000" />
        </svg>
      );
    case 'question':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="15" fill="#2b77d6" />
          <text x="16" y="23" textAnchor="middle" fontSize="20" fontWeight="bold" fill="#fff" fontFamily="Segoe UI, Arial">?</text>
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="15" fill="#2b77d6" />
          <rect x="14.5" y="13" width="3" height="11" fill="#fff" />
          <circle cx="16" cy="9" r="1.8" fill="#fff" />
        </svg>
      );
  }
}

const DLG_CAPTION: Record<MsgDlgType, string> = {
  mtWarning: 'Warning',
  mtError: 'Error',
  mtInformation: 'Information',
  mtConfirmation: 'Confirm',
  mtCustom: 'Dev-C++',
};

const BTN: Record<MsgDlgBtn, [string, number]> = {
  mbYes: ['&Yes', mrYes],
  mbNo: ['&No', mrNo],
  mbOK: ['OK', mrOk],
  mbCancel: ['Cancel', mrCancel],
  mbAbort: ['&Abort', mrAbort],
  mbRetry: ['&Retry', mrRetry],
  mbIgnore: ['&Ignore', mrIgnore],
  mbAll: ['&All', mrAll],
  mbNoToAll: ['N&o to All', mrNoToAll],
  mbYesToAll: ['Yes to &All', mrYesToAll],
  mbHelp: ['&Help', 0],
};

function measure(text: string) {
  const c = document.createElement('canvas').getContext('2d')!;
  c.font = '12px "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';
  const lines = text.split(/\r?\n/);
  let w = 0;
  const wrapped: string[] = [];
  const maxW = Math.round(window.innerWidth * 0.6);
  for (const l of lines) {
    if (c.measureText(l).width <= maxW) {
      wrapped.push(l);
      w = Math.max(w, c.measureText(l).width);
      continue;
    }
    // naive word wrap
    let cur = '';
    for (const ch of l.split(/(\s+)/)) {
      if (c.measureText(cur + ch).width > maxW && cur) {
        wrapped.push(cur);
        w = Math.max(w, c.measureText(cur).width);
        cur = ch.trimStart();
      } else cur += ch;
    }
    wrapped.push(cur);
    w = Math.max(w, c.measureText(cur).width);
  }
  return { w: Math.ceil(w), h: wrapped.length * 15, lines: wrapped };
}

/** Delphi Dialogs.MessageDlg */
export function MessageDlg(msg: string, type: MsgDlgType, buttons: MsgDlgBtn[], opts: { title?: string; owner?: number } = {}): Promise<number> {
  const m = measure(msg);
  const icon = type === 'mtWarning' ? 'warning' : type === 'mtError' ? 'error' : type === 'mtInformation' ? 'info' : type === 'mtConfirmation' ? 'question' : null;
  const btnW = 75;
  const gap = 8;
  const btnsW = buttons.length * btnW + (buttons.length - 1) * gap;
  const textX = icon ? 8 + 32 + 16 : 8;
  const clientW = Math.max(btnsW + 16, textX + m.w + 12, 150);
  const textH = Math.max(m.h, icon ? 32 : 0);
  const clientH = 8 + textH + 16 + 25 + 8;
  const defIdx = Math.max(0, buttons.findIndex((b) => b === 'mbOK' || b === 'mbYes'));
  const cancelBtn = buttons.find((b) => b === 'mbCancel') ?? buttons.find((b) => b === 'mbNo') ?? (buttons.length === 1 ? buttons[0] : undefined);
  return showModal<number>(
    {
      title: opts.title ?? DLG_CAPTION[type],
      owner: opts.owner ?? mainWindowId(),
      clientW,
      clientH,
      dialog: true,
      onKeyDown: (e) => {
        if (e.key === 'Escape' && cancelBtn) {
          e.preventDefault();
          (document.querySelector(`.msgdlg [data-btn="${cancelBtn}"]`) as HTMLButtonElement)?.click();
        } else if (e.key.length === 1 && !e.ctrlKey) {
          // accelerator keys like &Yes / &No
          const b = buttons.find((x) => BTN[x][0].toLowerCase().includes('&' + e.key.toLowerCase()));
          if (b) {
            e.preventDefault();
            (document.querySelector(`.msgdlg [data-btn="${b}"]`) as HTMLButtonElement)?.click();
          }
        }
      },
      render: (close) => <MsgDlgBody msg={m.lines} icon={icon} buttons={buttons} defIdx={defIdx} close={close} textX={textX} textH={textH} btnsW={btnsW} />,
    },
    cancelBtn ? BTN[cancelBtn][1] : mrCancel,
  );
}

function MsgDlgBody({ msg, icon, buttons, defIdx, close, textX, textH, btnsW }: {
  msg: string[];
  icon: 'error' | 'warning' | 'info' | 'question' | null;
  buttons: MsgDlgBtn[];
  defIdx: number;
  close: (r: number) => void;
  textX: number;
  textH: number;
  btnsW: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    (ref.current?.querySelector('button.default') as HTMLButtonElement | null)?.focus();
  }, []);
  return (
    <div ref={ref} className="msgdlg" style={{ position: 'relative', width: '100%', height: '100%' }}>
      {icon && (
        <div style={{ position: 'absolute', left: 8, top: 8 }}>
          <SysIcon type={icon} />
        </div>
      )}
      <div className="msgdlg-text" style={{ position: 'absolute', left: textX, top: 8 + (icon && msg.length * 15 < 32 ? (32 - msg.length * 15) / 2 : 0) }}>
        {msg.map((l, i) => (
          <div key={i}>{l || ' '}</div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 8 + textH + 16, display: 'flex', justifyContent: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, width: btnsW }}>
          {buttons.map((b, i) => (
            <span key={b} data-btn={b}>
              <Button caption={BTN[b][0]} isDefault={i === defIdx} style={{ width: 75, height: 25 }} onClick={() => close(BTN[b][1])} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export const MB_OK = 0;
export const MB_OKCANCEL = 1;
export const MB_ABORTRETRYIGNORE = 2;
export const MB_YESNOCANCEL = 3;
export const MB_YESNO = 4;
export const MB_RETRYCANCEL = 5;
export const MB_ICONERROR = 0x10;
export const MB_ICONQUESTION = 0x20;
export const MB_ICONWARNING = 0x30;
export const MB_ICONINFORMATION = 0x40;
export const IDOK = 1;
export const IDCANCEL = 2;
export const IDABORT = 3;
export const IDRETRY = 4;
export const IDIGNORE = 5;
export const IDYES = 6;
export const IDNO = 7;

function sysButtons(type: number): [string, number][] {
  const zh = Lang.isChinese;
  const ok: [string, number] = [zh ? '确定' : 'OK', IDOK];
  const cancel: [string, number] = [zh ? '取消' : 'Cancel', IDCANCEL];
  const yes: [string, number] = [zh ? '是(&Y)' : '&Yes', IDYES];
  const no: [string, number] = [zh ? '否(&N)' : '&No', IDNO];
  const abort: [string, number] = [zh ? '中止(&A)' : '&Abort', IDABORT];
  const retry: [string, number] = [zh ? '重试(&R)' : '&Retry', IDRETRY];
  const ignore: [string, number] = [zh ? '忽略(&I)' : '&Ignore', IDIGNORE];
  switch (type & 0xf) {
    case MB_OKCANCEL:
      return [ok, cancel];
    case MB_ABORTRETRYIGNORE:
      return [abort, retry, ignore];
    case MB_YESNOCANCEL:
      return [yes, no, cancel];
    case MB_YESNO:
      return [yes, no];
    case MB_RETRYCANCEL:
      return [retry, cancel];
    default:
      return [ok];
  }
}

/** Win32 MessageBox */
export function MessageBox(text: string, caption: string, type = MB_OK, owner?: number): Promise<number> {
  const m = measure(text);
  const iconBits = type & 0xf0;
  const icon = iconBits === MB_ICONERROR ? 'error' : iconBits === MB_ICONQUESTION ? 'question' : iconBits === MB_ICONWARNING ? 'warning' : iconBits === MB_ICONINFORMATION ? 'info' : null;
  const btns = sysButtons(type);
  const textX = icon ? 25 + 32 + 10 : 25;
  const btnsW = btns.length * 88 + 10;
  const clientW = Math.min(window.innerWidth - 40, Math.max(textX + m.w + 32, btnsW + 20, 160));
  const bodyH = Math.max(m.h, icon ? 32 : 0) + 52;
  const clientH = bodyH + 42;
  const hasCancel = btns.some((b) => b[1] === IDCANCEL) || btns.length === 1;
  return showModal<number>(
    {
      title: caption,
      owner: owner ?? mainWindowId(),
      clientW,
      clientH,
      dialog: true,
      showClose: true,
      onKeyDown: (e) => {
        if (e.key === 'Escape' && hasCancel) {
          e.preventDefault();
          (document.querySelectorAll('.sysmsg-footer button')[btns.length - 1] as HTMLButtonElement)?.click();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          (document.querySelector('.sysmsg-footer button.default') as HTMLButtonElement)?.click();
        }
      },
      render: (close) => (
        <div className="sysmsg">
          <div className="sysmsg-body" style={{ height: bodyH }}>
            {icon && (
              <div style={{ position: 'absolute', left: 25, top: 26 }}>
                <SysIcon type={icon} />
              </div>
            )}
            <div className="sysmsg-text" style={{ left: textX, top: 26 + (icon && m.h < 32 ? (32 - m.h) / 2 : 0) }}>
              {m.lines.map((l, i) => (
                <div key={i}>{l || ' '}</div>
              ))}
            </div>
          </div>
          <div className="sysmsg-footer">
            {btns.map(([cap, id], i) => (
              <Button key={id} caption={cap} isDefault={i === 0} style={{ width: 75, height: 23 }} onClick={() => close(id)} />
            ))}
          </div>
        </div>
      ),
    },
    hasCancel ? (btns.length === 1 ? btns[0][1] : IDCANCEL) : IDCANCEL,
  );
}

/** Delphi ShowMessage */
export function ShowMessage(msg: string) {
  return MessageDlg(msg, 'mtCustom', ['mbOK'], { title: 'Dev-C++' });
}

/** Dialogs.InputQuery */
export function InputQuery(caption: string, prompt: string, value: string): Promise<string | null> {
  const m = measure(prompt);
  const w = Math.max(260, m.w + 24);
  return showModal<string | null>(
    {
      title: caption,
      owner: mainWindowId(),
      clientW: w,
      clientH: 100 + m.h - 15,
      dialog: true,
      render: (close) => <InputQueryBody prompt={m.lines} value={value} close={close} w={w} />,
    },
    null,
  );
}

function InputQueryBody({ prompt, value, close, w }: { prompt: string[]; value: string; close: (r: string | null) => void; w: number }) {
  const ref = useRef<HTMLInputElement>(null);
  const val = useRef(value);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const ph = prompt.length * 15;
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div style={{ position: 'absolute', left: 8, top: 8 }}>
        {prompt.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
      <input
        ref={ref}
        className="vedit"
        defaultValue={value}
        style={{ position: 'absolute', left: 8, top: 12 + ph, width: w - 16, height: 23 }}
        onChange={(e) => (val.current = e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            close(val.current);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close(null);
          }
        }}
      />
      <div style={{ position: 'absolute', top: 46 + ph, right: 8, display: 'flex', gap: 8 }}>
        <Button caption="OK" isDefault style={{ width: 75, height: 25 }} onClick={() => close(val.current)} />
        <Button caption="Cancel" style={{ width: 75, height: 25 }} onClick={() => close(null)} />
      </div>
    </div>
  );
}
