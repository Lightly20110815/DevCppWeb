// Finds the function enclosing a line and formats it like GCC ("In function 'int main()'").
import { tokenizeLine } from '../ide/editor/synCpp';

interface T {
  text: string;
  kind: string;
  line: number;
}

function tokens(src: string): T[] {
  const out: T[] = [];
  let range: Parameters<typeof tokenizeLine>[1] = 'unknown';
  src.split('\n').forEach((l, i) => {
    const r = tokenizeLine(l.replace(/\r$/, ''), range);
    range = r.range;
    for (const t of r.tokens) if (t.kind !== 'Space' && t.kind !== 'Comment' && t.kind !== 'Preprocessor') out.push({ ...t, line: i + 1 });
  });
  return out;
}

const cache = new Map<string, { toks: T[]; blocks: { open: number; close: number }[] }>();

function analyse(src: string) {
  let c = cache.get(src);
  if (c) return c;
  const toks = tokens(src);
  const blocks: { open: number; close: number }[] = [];
  const stack: number[] = [];
  toks.forEach((t, i) => {
    if (t.kind !== 'Symbol') return;
    if (t.text === '{') stack.push(i);
    else if (t.text === '}' && stack.length) blocks.push({ open: stack.pop()!, close: i });
  });
  // unterminated blocks run to the end
  while (stack.length) blocks.push({ open: stack.pop()!, close: toks.length });
  c = { toks, blocks };
  if (cache.size > 20) cache.clear();
  cache.set(src, c);
  return c;
}

/** GCC style parameter list: types only */
function paramTypes(params: T[], isC: boolean): string {
  if (!params.length) return isC ? '' : '';
  const groups: T[][] = [[]];
  let depth = 0;
  for (const t of params) {
    if (t.text === '(' || t.text === '<' || t.text === '[') depth++;
    if (t.text === ')' || t.text === '>' || t.text === ']') depth--;
    if (t.text === ',' && depth === 0) groups.push([]);
    else groups[groups.length - 1].push(t);
  }
  return groups
    .map((g) => {
      // drop default value
      const eq = g.findIndex((t) => t.text === '=');
      let ts = eq >= 0 ? g.slice(0, eq) : g;
      // array parameter -> pointer
      let arr = '';
      const br = ts.findIndex((t) => t.text === '[');
      if (br >= 0) {
        ts = ts.slice(0, br);
        arr = '*';
      }
      // drop the parameter name (last identifier that is not a type keyword)
      const last = ts[ts.length - 1];
      if (ts.length > 1 && last && last.kind === 'Identifier' && !['int', 'char'].includes(last.text)) ts = ts.slice(0, -1);
      let s = '';
      for (const t of ts) {
        if (t.text === '*' || t.text === '&' || t.text === '&&') s += t.text;
        else if (t.text === '::' || t.text === '<' || t.text === '>' || t.text === ',') s += t.text;
        else s += (s && !s.endsWith('::') && !s.endsWith('<') ? ' ' : '') + t.text;
      }
      s = s.replace(/\blong long\b/g, 'long long int').replace(/\bunsigned\b(?! (int|char|short|long))/g, 'unsigned int');
      if (s === 'void') return '';
      return s + arr;
    })
    .filter(Boolean)
    .join(', ');
}

export function functionAt(src: string, line: number, isC: boolean): string {
  const { toks, blocks } = analyse(src);
  // innermost top-level-ish block whose header looks like a function
  const containing = blocks.filter((b) => toks[b.open]?.line <= line && (toks[b.close]?.line ?? Infinity) >= line).sort((a, b) => a.open - b.open);
  for (const b of containing) {
    const open = b.open;
    // header tokens back to the previous ; { } (or start)
    let i = open - 1;
    // skip constructor initializer list / const / noexcept / trailing return
    let close = -1;
    let depth = 0;
    for (let k = i; k >= 0; k--) {
      const t = toks[k];
      if (t.text === ')') {
        if (depth === 0 && close < 0) close = k;
        depth++;
      } else if (t.text === '(') depth--;
      if (depth === 0 && (t.text === ';' || t.text === '{' || t.text === '}')) {
        i = k;
        break;
      }
      if (k === 0) i = -1;
    }
    if (close < 0) continue;
    // find matching '(' of close
    let d = 0;
    let openParen = -1;
    for (let k = close; k > i; k--) {
      if (toks[k].text === ')') d++;
      else if (toks[k].text === '(') {
        d--;
        if (d === 0) {
          openParen = k;
          break;
        }
      }
    }
    if (openParen <= i + 0) continue;
    // a constructor initializer list: "A::A() : x(1) {" -> find the first ')' after the name
    const header = toks.slice(i + 1, open);
    const colonIdx = header.findIndex((t, k) => t.text === ':' && header[k - 1]?.text === ')');
    let nameEnd = openParen;
    let pOpen = openParen;
    let pClose = close;
    if (colonIdx >= 0) {
      pClose = i + 1 + colonIdx - 1;
      let dd = 0;
      for (let k = pClose; k > i; k--) {
        if (toks[k].text === ')') dd++;
        else if (toks[k].text === '(') {
          dd--;
          if (dd === 0) {
            pOpen = k;
            break;
          }
        }
      }
      nameEnd = pOpen;
    }
    const nameToks = toks.slice(i + 1, nameEnd);
    if (!nameToks.length) continue;
    const kw = nameToks[nameToks.length - 1].text;
    if (['if', 'for', 'while', 'switch', 'catch', 'return', 'sizeof', 'decltype'].includes(kw)) continue;
    if (nameToks.some((t) => t.text === '=' )) continue;
    // name: identifier possibly qualified (A::f, operator+)
    let k = nameToks.length - 1;
    let name = nameToks[k].text;
    if (nameToks[k - 1]?.text === 'operator') {
      name = 'operator' + name;
      k--;
    }
    while (k >= 2 && nameToks[k - 1].text === '::') {
      name = nameToks[k - 2].text + '::' + name;
      k -= 2;
    }
    if (k >= 1 && nameToks[k - 1].text === '~') {
      name = '~' + name;
      k--;
    }
    const ret = nameToks
      .slice(0, k)
      .filter((t) => !['static', 'inline', 'extern', 'virtual', 'explicit', 'friend', 'constexpr'].includes(t.text))
      .map((t) => t.text)
      .join(' ')
      .replace(/ ([*&])/g, '$1')
      .replace(/\blong long\b/g, 'long long int');
    const params = paramTypes(toks.slice(pOpen + 1, pClose), isC);
    if (isC) return `In function '${name}'`;
    const member = name.includes('::');
    const cls = member ? name.split('::').slice(-2, -1)[0] : '';
    const fn = name.split('::').pop()!;
    if (member && (fn === cls || fn === '~' + cls)) return `In ${fn.startsWith('~') ? 'destructor' : 'constructor'} '${name}(${params})'`;
    const sig = `${ret ? ret + ' ' : ''}${name}(${params})`;
    return member ? `In member function '${sig}'` : `In function '${sig}'`;
  }
  return '';
}
