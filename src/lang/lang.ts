// Port of MultiLangSupport.pas: language strings by numeric ID with English fallback.
import english from '../generated/lang/English.json';
import langIndex from '../generated/langIndex.json';

interface LangFile {
  file: string;
  name: string;
  strings: Record<string, string>;
}

const loaders = import.meta.glob<{ default: LangFile }>('../generated/lang/*.json');
const tipLoaders = import.meta.glob<{ default: string[] }>('../generated/tips/*.json');

type Listener = () => void;

class MultiLangSupport {
  private strings: Record<string, string> = {};
  private def: Record<string, string> = (english as LangFile).strings;
  private listeners = new Set<Listener>();
  file = 'English.lng';
  name = (english as LangFile).name;
  version = 0;

  /** List of [file, description] sorted like Delphi's TStringList.Sort on the file names */
  get langList(): { file: string; name: string }[] {
    return (langIndex as { file: string; name: string }[]).slice();
  }

  get(id: number): string {
    let r = this.strings[id];
    if (r === undefined || r === '') r = this.def[id];
    if (r === undefined || r === '') return `<ID ${id} translation missing>`;
    return r.replace(/<CR>/g, '\r\n');
  }

  async open(file: string) {
    const base = file.replace(/\.lng$/i, '');
    const key = Object.keys(loaders).find((k) => k.toLowerCase().endsWith(`/${base.toLowerCase()}.json`));
    if (!key) {
      this.strings = {};
      this.file = 'English.lng';
      this.name = (english as LangFile).name;
    } else {
      const mod = await loaders[key]();
      this.strings = mod.default.strings;
      this.file = mod.default.file;
      this.name = mod.default.name || base;
    }
    this.version++;
    for (const l of this.listeners) l();
  }

  async tips(): Promise<string[]> {
    const base = this.file.replace(/\.lng$/i, '').toLowerCase();
    let key = Object.keys(tipLoaders).find((k) => k.toLowerCase().endsWith(`/${base}.json`));
    if (!key) key = Object.keys(tipLoaders).find((k) => k.toLowerCase().endsWith('/english.json'));
    return key ? (await tipLoaders[key]()).default : [];
  }

  fileFromDescription(desc: string) {
    return this.langList.find((l) => l.name.toLowerCase() === desc.toLowerCase())?.file ?? desc;
  }

  /** True for languages whose Windows console uses a CJK code page */
  get isChinese() {
    return /^chinese/i.test(this.file);
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
}

export const Lang = new MultiLangSupport();
export const lang = (id: number) => Lang.get(id);

/** Delphi SysUtils.Format subset: %s %d %x %u %f %g %e %n with width/precision and %% */
export function format(fmt: string, args: unknown[]): string {
  let ai = 0;
  return fmt.replace(/%(-)?(\d+|\*)?(?:\.(\d+|\*))?([sdxXufgenm%])/g, (m, left, width, prec, conv) => {
    if (conv === '%') return '%';
    let w = width === '*' ? Number(args[ai++]) : width ? parseInt(width, 10) : 0;
    let p = prec === '*' ? Number(args[ai++]) : prec !== undefined ? parseInt(prec, 10) : undefined;
    const a = args[ai++];
    let s: string;
    switch (conv) {
      case 's':
        s = String(a ?? '');
        if (p !== undefined) s = s.slice(0, p);
        break;
      case 'd':
      case 'u':
        s = String(Math.trunc(Number(a)));
        if (p !== undefined) s = s.padStart(p, '0');
        break;
      case 'x':
      case 'X':
        s = (Number(a) >>> 0).toString(16);
        if (conv === 'X') s = s.toUpperCase();
        else s = s.toUpperCase(); // Delphi always prints uppercase hex
        if (p !== undefined) s = s.padStart(p, '0');
        break;
      case 'f':
        s = Number(a).toFixed(p ?? 2);
        break;
      case 'n':
        s = Number(a).toLocaleString('en-US', { minimumFractionDigits: p ?? 2, maximumFractionDigits: p ?? 2 });
        break;
      case 'e':
        s = Number(a).toExponential(p ?? 15);
        break;
      case 'g': {
        const n = Number(a);
        s = p !== undefined ? String(Number(n.toPrecision(Math.max(1, p)))) : String(n);
        break;
      }
      default:
        s = String(a);
    }
    if (w && s.length < w) s = left ? s.padEnd(w) : s.padStart(w);
    return s;
  });
}

/** Strip the '&' accelerator markers used by VCL captions */
export function stripAmp(s: string) {
  return s.replace(/&&/g, '\u0000').replace(/&/g, '').replace(/\u0000/g, '&');
}
