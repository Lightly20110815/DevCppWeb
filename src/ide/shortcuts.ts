// Delphi TShortCut <-> text / keyboard events.

const KEY_NAMES: Record<number, string> = {
  8: 'BkSp', 9: 'Tab', 13: 'Enter', 27: 'Esc', 32: 'Space', 33: 'PgUp', 34: 'PgDn', 35: 'End', 36: 'Home',
  37: 'Left', 38: 'Up', 39: 'Right', 40: 'Down', 45: 'Ins', 46: 'Del', 186: ';', 187: '=', 188: ',', 189: '-',
  190: '.', 191: '/', 192: '`', 219: '[', 220: '\\', 221: ']', 222: "'",
};

export const scShift = 0x2000;
export const scCtrl = 0x4000;
export const scAlt = 0x8000;

export function keyName(vk: number): string {
  if (vk >= 112 && vk <= 135) return 'F' + (vk - 111);
  if ((vk >= 48 && vk <= 57) || (vk >= 65 && vk <= 90)) return String.fromCharCode(vk);
  if (vk >= 96 && vk <= 105) return 'Num ' + (vk - 96);
  return KEY_NAMES[vk] ?? '';
}

export function shortCutToText(sc: number | undefined): string {
  if (!sc) return '';
  const vk = sc & 0xff;
  const name = keyName(vk);
  if (!name) return '';
  return (sc & scShift ? 'Shift+' : '') + (sc & scCtrl ? 'Ctrl+' : '') + (sc & scAlt ? 'Alt+' : '') + name;
}

export function textToShortCut(t: string): number {
  if (!t) return 0;
  let sc = 0;
  let rest = t;
  for (;;) {
    const m = /^(Shift|Ctrl|Alt)\+/i.exec(rest);
    if (!m) break;
    const k = m[1].toLowerCase();
    if (k === 'shift') sc |= scShift;
    else if (k === 'ctrl') sc |= scCtrl;
    else sc |= scAlt;
    rest = rest.slice(m[0].length);
  }
  for (let vk = 1; vk < 256; vk++) if (keyName(vk).toLowerCase() === rest.toLowerCase()) return sc | vk;
  return 0;
}

const KEY_TO_VK: Record<string, number> = {
  Backspace: 8, Tab: 9, Enter: 13, Escape: 27, ' ': 32, PageUp: 33, PageDown: 34, End: 35, Home: 36,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Insert: 45, Delete: 46, ';': 186, '=': 187, ',': 188,
  '-': 189, '.': 190, '/': 191, '`': 192, '[': 219, '\\': 220, ']': 221, "'": 222,
};

export function eventVk(e: KeyboardEvent): number {
  if (e.keyCode) return e.keyCode;
  const m = /^F(\d+)$/.exec(e.key);
  if (m) return 111 + parseInt(m[1], 10);
  if (/^Key[A-Z]$/.test(e.code)) return e.code.charCodeAt(3);
  if (/^Digit\d$/.test(e.code)) return e.code.charCodeAt(5);
  return KEY_TO_VK[e.key] ?? 0;
}

export function eventToShortCut(e: KeyboardEvent): number {
  let vk = eventVk(e);
  if (!vk) return 0;
  if (vk === 16 || vk === 17 || vk === 18 || vk === 91 || vk === 93) return 0;
  if (vk === 173) vk = 189; // Firefox '-'
  if (vk === 59) vk = 186; // Firefox ';'
  if (vk === 61) vk = 187; // Firefox '='
  return vk | (e.shiftKey ? scShift : 0) | (e.ctrlKey || e.metaKey ? scCtrl : 0) | (e.altKey ? scAlt : 0);
}
