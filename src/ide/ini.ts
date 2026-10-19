// TMemIniFile equivalent (order preserving, case-insensitive sections/keys).

export class IniFile {
  private sections: { name: string; keys: { k: string; v: string }[] }[] = [];

  constructor(text = '') {
    let cur: { name: string; keys: { k: string; v: string }[] } | null = null;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith(';')) continue;
      const m = /^\[(.*)\]$/.exec(line);
      if (m) {
        cur = this.section(m[1], true)!;
        continue;
      }
      const i = raw.indexOf('=');
      if (i < 0 || !cur) continue;
      cur.keys.push({ k: raw.slice(0, i).trim(), v: raw.slice(i + 1) });
    }
  }

  private section(name: string, create = false) {
    let s = this.sections.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!s && create) {
      s = { name, keys: [] };
      this.sections.push(s);
    }
    return s;
  }

  readString(sec: string, key: string, def = ''): string {
    const s = this.section(sec);
    const e = s?.keys.find((x) => x.k.toLowerCase() === key.toLowerCase());
    return e ? e.v : def;
  }

  readInteger(sec: string, key: string, def = 0): number {
    const v = this.readString(sec, key, '');
    if (v === '') return def;
    const n = v.startsWith('$') ? parseInt(v.slice(1), 16) : parseInt(v, 10);
    return Number.isNaN(n) ? def : n;
  }

  readBool(sec: string, key: string, def = false): boolean {
    const v = this.readString(sec, key, '');
    if (v === '') return def;
    return v !== '0' && v.toLowerCase() !== 'false';
  }

  writeString(sec: string, key: string, v: string) {
    const s = this.section(sec, true)!;
    const e = s.keys.find((x) => x.k.toLowerCase() === key.toLowerCase());
    if (e) e.v = v;
    else s.keys.push({ k: key, v });
  }

  writeInteger(sec: string, key: string, v: number) {
    this.writeString(sec, key, String(Math.trunc(v)));
  }

  writeBool(sec: string, key: string, v: boolean) {
    this.writeString(sec, key, v ? '1' : '0');
  }

  deleteKey(sec: string, key: string) {
    const s = this.section(sec);
    if (s) s.keys = s.keys.filter((x) => x.k.toLowerCase() !== key.toLowerCase());
  }

  eraseSection(sec: string) {
    this.sections = this.sections.filter((x) => x.name.toLowerCase() !== sec.toLowerCase());
  }

  sectionExists(sec: string) {
    return !!this.section(sec);
  }

  sectionNames() {
    return this.sections.map((s) => s.name);
  }

  keys(sec: string) {
    return this.section(sec)?.keys.map((k) => k.k) ?? [];
  }

  toString() {
    return this.sections.map((s) => `[${s.name}]\r\n` + s.keys.map((k) => `${k.k}=${k.v}`).join('\r\n')).join('\r\n\r\n') + '\r\n';
  }
}

/** TStrings.CommaText / DelimitedText style list parsing (quotes allowed) */
export function parseDelimited(s: string, delim = ';'): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (const c of s) {
    if (c === '"') q = !q;
    else if (c === delim && !q) {
      if (cur.trim() !== '') out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  if (cur.trim() !== '') out.push(cur.trim());
  return out;
}

export function delimited(list: string[], delim = ';') {
  return list.map((s) => (s.includes(delim) || s.includes(' ') ? `"${s}"` : s)).join(delim);
}
