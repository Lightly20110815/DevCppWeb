// A light-weight version of Dev-C++'s TCppParser: extracts classes, functions, variables,
// typedefs, enums and #defines for the class browser, completion and "Goto function".
import { tokenizeLine } from '../editor/synCpp';

export type StatementKind = 'class' | 'function' | 'constructor' | 'destructor' | 'variable' | 'typedef' | 'enum' | 'preprocessor' | 'unknown';
export type ClassScope = 'public' | 'private' | 'protected' | 'none';

export interface Statement {
  id: number;
  parent: Statement | null;
  type: string;
  command: string;
  args: string;
  kind: StatementKind;
  scope: 'global' | 'local' | 'classLocal';
  classScope: ClassScope;
  hasDefinition: boolean;
  line: number;
  definitionLine: number;
  fileName: string;
  definitionFileName: string;
  inProject: boolean;
  inSystemHeader: boolean;
  inherits: string[];
  visible: boolean;
  /** for locals: block range */
  blockFrom?: number;
  blockTo?: number;
}

interface Tok {
  t: string;
  k: string; // highlighter kind
  line: number;
}

let nextId = 1;

export function statementKindStr(k: StatementKind) {
  switch (k) {
    case 'class':
      return 'class';
    case 'function':
      return 'function';
    case 'constructor':
      return 'constructor';
    case 'destructor':
      return 'destructor';
    case 'variable':
      return 'var';
    case 'typedef':
      return 'typedef';
    case 'enum':
      return 'enum';
    case 'preprocessor':
      return 'define';
    default:
      return 'unknown';
  }
}

function tokenize(src: string): { toks: Tok[]; defines: Statement[]; includes: { file: string; system: boolean; line: number }[] } {
  const toks: Tok[] = [];
  const defines: Statement[] = [];
  const includes: { file: string; system: boolean; line: number }[] = [];
  let range: Parameters<typeof tokenizeLine>[1] = 'unknown';
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].replace(/\r$/, '');
    const r = tokenizeLine(text, range);
    range = r.range;
    for (const t of r.tokens) {
      if (t.kind === 'Space' || t.kind === 'Comment') continue;
      if (t.kind === 'Preprocessor') {
        const m = /^\s*#\s*define\s+([A-Za-z_]\w*)(\([^)]*\))?\s*(.*)$/.exec(t.text);
        if (m) defines.push(mk({ command: m[1], args: m[2] ?? '', type: m[3]?.trim() ?? '', kind: 'preprocessor', line: i + 1 }));
        const inc = /^\s*#\s*include\s*([<"])([^>"]+)[>"]/.exec(t.text);
        if (inc) includes.push({ file: inc[2], system: inc[1] === '<', line: i + 1 });
        continue;
      }
      // split symbol tokens into single characters except multi-char operators we care about
      if (t.kind === 'Symbol' && t.text.length > 1 && !['::', '->', '...', '<<', '>>', '==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '->*'].includes(t.text)) {
        for (const ch of t.text) toks.push({ t: ch, k: 'Symbol', line: i + 1 });
      } else toks.push({ t: t.text, k: t.kind, line: i + 1 });
    }
  }
  return { toks, defines, includes };
}

function mk(p: Partial<Statement>): Statement {
  return {
    id: nextId++,
    parent: null,
    type: '',
    command: '',
    args: '',
    kind: 'unknown',
    scope: 'global',
    classScope: 'none',
    hasDefinition: false,
    line: 0,
    definitionLine: 0,
    fileName: '',
    definitionFileName: '',
    inProject: false,
    inSystemHeader: false,
    inherits: [],
    visible: true,
    ...p,
  };
}

const TYPE_SKIP = new Set(['static', 'inline', 'extern', 'virtual', 'explicit', 'friend', 'constexpr', 'register', 'mutable', 'volatile', 'thread_local', 'typename', '__inline', '__forceinline']);
const NOT_DECL = new Set(['return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'goto', 'break', 'continue', 'throw', 'delete', 'new', 'using', 'sizeof', 'default', 'try', 'catch', 'operator']);

function joinToks(ts: Tok[]): string {
  let s = '';
  for (const t of ts) {
    const word = /^[A-Za-z_0-9]/.test(t.t);
    const prevWord = /[A-Za-z_0-9]$/.test(s);
    if (word && prevWord) s += ' ';
    else if (t.t === ',' ) {
      s += ', ';
      continue;
    }
    s += t.t;
  }
  return s.replace(/\s+/g, ' ').trim();
}

export interface ParseResult {
  statements: Statement[];
  includes: { file: string; system: boolean; line: number }[];
  /** function bodies: statement -> token range, used for local scanning */
  bodies: { st: Statement; fromLine: number; toLine: number }[];
}

/** Parses one file */
export function parseFile(src: string, fileName: string, inProject: boolean): ParseResult {
  const { toks, defines, includes } = tokenize(src);
  const statements: Statement[] = [];
  const bodies: ParseResult['bodies'] = [];
  for (const d of defines) {
    d.fileName = fileName;
    d.inProject = inProject;
    d.visible = false;
    statements.push(d);
  }
  const n = toks.length;

  const skipBalanced = (i: number, open: string, close: string): number => {
    let depth = 0;
    for (let k = i; k < n; k++) {
      if (toks[k].t === open) depth++;
      else if (toks[k].t === close) {
        depth--;
        if (depth === 0) return k + 1;
      }
    }
    return n;
  };

  const skipTemplateArgs = (i: number): number => {
    // i at '<'
    let depth = 0;
    for (let k = i; k < n; k++) {
      const t = toks[k].t;
      if (t === '<') depth++;
      else if (t === '>') {
        depth--;
        if (depth === 0) return k + 1;
      } else if (t === '>>') {
        depth -= 2;
        if (depth <= 0) return k + 1;
      } else if (t === ';' || t === '{') return k;
    }
    return n;
  };

  const classes: Statement[] = [];

  /** parse declarations between [i, end) with the given parent */
  const parseScope = (start: number, end: number, parent: Statement | null, defaultAccess: ClassScope) => {
    let i = start;
    let access: ClassScope = defaultAccess;
    while (i < end) {
      const t = toks[i];
      if (t.t === ';' || t.t === '}' ) {
        i++;
        continue;
      }
      if (parent && (t.t === 'public' || t.t === 'private' || t.t === 'protected') && toks[i + 1]?.t === ':') {
        access = t.t as ClassScope;
        i += 2;
        continue;
      }
      if (t.t === 'template' && toks[i + 1]?.t === '<') {
        i = skipTemplateArgs(i + 1);
        continue;
      }
      if (t.t === 'namespace') {
        // namespace X { ... }
        let k = i + 1;
        while (k < end && toks[k].t !== '{' && toks[k].t !== ';') k++;
        if (toks[k]?.t === '{') {
          const close = skipBalanced(k, '{', '}');
          parseScope(k + 1, close - 1, parent, access);
          i = close;
        } else i = k + 1;
        continue;
      }
      if (t.t === 'using') {
        while (i < end && toks[i].t !== ';') i++;
        i++;
        continue;
      }
      if (t.t === 'extern' && toks[i + 1]?.k === 'String' && toks[i + 2]?.t === '{') {
        const close = skipBalanced(i + 2, '{', '}');
        parseScope(i + 3, close - 1, parent, access);
        i = close;
        continue;
      }
      if (t.t === 'class' || t.t === 'struct' || t.t === 'union' || t.t === 'enum' || t.t === 'typedef') {
        i = parseTypeDecl(i, end, parent, access);
        continue;
      }
      i = parseDeclaration(i, end, parent, access);
    }
  };

  const parseTypeDecl = (i: number, end: number, parent: Statement | null, access: ClassScope): number => {
    const isTypedef = toks[i].t === 'typedef';
    let k = isTypedef ? i + 1 : i;
    const kw = toks[k].t;
    if (kw === 'enum') {
      // enum [class] Name [: type] { A, B=1 } [vars];
      k++;
      if (toks[k]?.t === 'class' || toks[k]?.t === 'struct') k++;
      let name = '';
      if (toks[k]?.k === 'Identifier') name = toks[k++].t;
      while (k < end && toks[k].t !== '{' && toks[k].t !== ';') k++;
      if (toks[k]?.t === '{') {
        const close = skipBalanced(k, '{', '}');
        let expect = true;
        for (let m = k + 1; m < close - 1; m++) {
          if (expect && toks[m].k === 'Identifier') {
            statements.push(mk({ command: toks[m].t, type: name || 'enum', kind: 'enum', line: toks[m].line, parent, fileName, inProject, classScope: parent ? access : 'none', scope: parent ? 'classLocal' : 'global' }));
            expect = false;
          }
          if (toks[m].t === ',') expect = true;
          if (toks[m].t === '(' || toks[m].t === '{') m = skipBalanced(m, toks[m].t, toks[m].t === '(' ? ')' : '}') - 1;
        }
        k = close;
      }
      if (isTypedef && toks[k]?.k === 'Identifier') {
        statements.push(mk({ command: toks[k].t, type: 'enum ' + name, kind: 'typedef', line: toks[k].line, parent, fileName, inProject }));
      }
      while (k < end && toks[k].t !== ';') k++;
      return k + 1;
    }
    if (kw === 'class' || kw === 'struct' || kw === 'union') {
      k++;
      while (toks[k]?.t === '__declspec' || toks[k]?.t === 'alignas') k = skipBalanced(k + 1, '(', ')');
      let name = '';
      if (toks[k]?.k === 'Identifier') name = toks[k++].t;
      if (toks[k]?.t === '<') k = skipTemplateArgs(k);
      if (toks[k]?.t === 'final') k++;
      const inherits: string[] = [];
      if (toks[k]?.t === ':') {
        k++;
        while (k < end && toks[k].t !== '{' && toks[k].t !== ';') {
          if (toks[k].k === 'Identifier' && !['public', 'private', 'protected', 'virtual'].includes(toks[k].t)) inherits.push(toks[k].t);
          if (toks[k].t === '<') k = skipTemplateArgs(k);
          else k++;
        }
      }
      if (toks[k]?.t === '{') {
        const st = mk({ command: name || '{anonymous}', type: kw, kind: 'class', line: toks[i].line, parent, fileName, inProject, inherits, classScope: parent ? access : 'none', scope: parent ? 'classLocal' : 'global', hasDefinition: true, definitionLine: toks[i].line, definitionFileName: fileName });
        if (!name) st.visible = false;
        statements.push(st);
        classes.push(st);
        const close = skipBalanced(k, '{', '}');
        parseScope(k + 1, close - 1, st, kw === 'class' ? 'private' : 'public');
        k = close;
        // variables declared after the class body
        while (k < end && toks[k].t !== ';') {
          if (toks[k].k === 'Identifier' && (toks[k + 1]?.t === ';' || toks[k + 1]?.t === ',' || toks[k + 1]?.t === '[' || toks[k + 1]?.t === '=')) {
            statements.push(mk({ command: toks[k].t, type: isTypedef ? kw + ' ' + name : name || kw, kind: isTypedef ? 'typedef' : 'variable', line: toks[k].line, parent, fileName, inProject, classScope: parent ? access : 'none' }));
          }
          k++;
        }
        return k + 1;
      }
      // forward declaration or variable of struct type: treat as declaration
      if (!isTypedef) return parseDeclaration(i, end, parent, access);
    }
    // typedef <type> name;
    let m = k;
    while (m < end && toks[m].t !== ';') {
      if (toks[m].t === '{') m = skipBalanced(m, '{', '}');
      else m++;
    }
    // last identifier before ';' (or inside (*name)(...) for function pointers)
    const decl = toks.slice(k, m);
    let nameTok: Tok | undefined;
    const fp = decl.findIndex((t, idx) => t.t === '(' && decl[idx + 1]?.t === '*');
    if (fp >= 0) nameTok = decl.slice(fp).find((t) => t.k === 'Identifier');
    else nameTok = [...decl].reverse().find((t) => t.k === 'Identifier');
    if (nameTok) statements.push(mk({ command: nameTok.t, type: joinToks(decl.filter((t) => t !== nameTok)), kind: 'typedef', line: nameTok.line, parent, fileName, inProject, classScope: parent ? access : 'none' }));
    return m + 1;
  };

  const parseDeclaration = (i: number, end: number, parent: Statement | null, access: ClassScope): number => {
    // collect up to ; or { (balanced parentheses)
    let k = i;
    let parenOpen = -1;
    let parenClose = -1;
    while (k < end) {
      const t = toks[k].t;
      if (t === '(') {
        const close = skipBalanced(k, '(', ')');
        if (parenOpen < 0) {
          parenOpen = k;
          parenClose = close - 1;
        }
        k = close;
        continue;
      }
      if (t === '<' && toks[k - 1]?.k === 'Identifier' && /^[A-Z_a-z]/.test(toks[k - 1].t) && parenOpen < 0) {
        const after = skipTemplateArgs(k);
        if (after < end && toks[after - 1]?.t.startsWith('>')) {
          k = after;
          continue;
        }
      }
      if (t === ';' || t === '{' || t === '}') break;
      if (t === '=' && parenOpen < 0) {
        // initializer: skip to ; at depth 0
        let d = 0;
        while (k < end) {
          const tt = toks[k].t;
          if (tt === '(' || tt === '{' || tt === '[') d++;
          else if (tt === ')' || tt === '}' || tt === ']') d--;
          else if ((tt === ';' || tt === ',') && d === 0) break;
          k++;
        }
        if (toks[k]?.t === ',') {
          k++;
          continue;
        }
        break;
      }
      k++;
    }
    const decl = toks.slice(i, k);
    const term = toks[k]?.t;
    const first = decl[0];
    if (!first || NOT_DECL.has(first.t) || first.k === 'Number' || first.k === 'String') {
      // skip statements we don't understand
      if (term === '{') return skipBalanced(k, '{', '}');
      return k + 1;
    }
    if (parenOpen >= 0 && parenOpen < k) {
      // function (declaration or definition) unless it looks like a variable with constructor args
      const nameEnd = parenOpen - i; // index in decl
      const nameParts = decl.slice(0, nameEnd);
      // operator overloading
      let opIdx = nameParts.findIndex((t) => t.t === 'operator');
      let nameTokIdx = nameParts.length - 1;
      let command = nameParts[nameTokIdx]?.t ?? '';
      if (opIdx >= 0) {
        command = 'operator' + nameParts.slice(opIdx + 1).map((t) => t.t).join('');
        nameTokIdx = opIdx;
      }
      // qualified name: A::f
      let owner = '';
      let q = nameTokIdx;
      while (q >= 2 && nameParts[q - 1]?.t === '::') {
        owner = nameParts[q - 2].t + (owner ? '::' + owner : '');
        q -= 2;
      }
      let destructor = false;
      if (nameParts[q - 1]?.t === '~') {
        destructor = true;
        q--;
        command = '~' + command;
      }
      const typeToks = nameParts.slice(0, q).filter((t) => !TYPE_SKIP.has(t.t));
      const type = joinToks(typeToks);
      const args = '(' + joinToks(toks.slice(parenOpen + 1, parenClose)) + ')';
      const line = nameParts[nameTokIdx]?.line ?? first.line;
      const parentCls = owner ? classes.find((c) => c.command === owner.split('::').pop()) ?? null : parent;
      const isCtor = !!parentCls && (command === parentCls.command || command === '~' + parentCls.command);
      const looksLikeVar = !type && !isCtor && !owner;
      if (!command || /^[^A-Za-z_~o]/.test(command) || (looksLikeVar && !parent)) {
        // probably a macro call like MAIN() or an expression
        if (term === '{') return skipBalanced(k, '{', '}');
        return k + 1;
      }
      const kind: StatementKind = isCtor ? (destructor ? 'destructor' : 'constructor') : 'function';
      // is there a declaration already (inside the class)?
      const existing = statements.find((s) => s.command === command && s.parent === parentCls && (s.kind === kind) && s.args.replace(/\s+/g, '') === args.replace(/\s+/g, ''))
        ?? (owner ? statements.find((s) => s.command === command && s.parent === parentCls && s.kind === kind) : undefined);
      let st: Statement;
      if (existing && term === '{') {
        st = existing;
        st.hasDefinition = true;
        st.definitionLine = line;
        st.definitionFileName = fileName;
      } else if (existing && term !== '{') {
        st = existing;
      } else {
        st = mk({
          command, type, args, kind, line, parent: parentCls, fileName, inProject,
          classScope: parentCls ? (owner ? 'public' : access) : 'none',
          scope: parentCls ? 'classLocal' : 'global',
          hasDefinition: term === '{',
          definitionLine: term === '{' ? line : 0,
          definitionFileName: term === '{' ? fileName : '',
        });
        statements.push(st);
      }
      if (term === '{') {
        const close = skipBalanced(k, '{', '}');
        bodies.push({ st, fromLine: toks[k].line, toLine: toks[close - 1]?.line ?? toks[k].line });
        return close;
      }
      // ctor initializer list / const / override etc. before body
      if (term === ';') return k + 1;
      return k + 1;
    }
    // variables: type a, *b = 1, c[10];
    const parts: Tok[][] = [[]];
    let depth = 0;
    for (const t of decl) {
      if (t.t === '<' || t.t === '(' || t.t === '[' || t.t === '{') depth++;
      if (t.t === '>' || t.t === ')' || t.t === ']' || t.t === '}') depth--;
      if (t.t === ',' && depth === 0) parts.push([]);
      else parts[parts.length - 1].push(t);
    }
    const firstPart = parts[0];
    const eq = firstPart.findIndex((t) => t.t === '=' || t.t === '[');
    const head = eq >= 0 ? firstPart.slice(0, eq) : firstPart;
    const nameTok = [...head].reverse().find((t) => t.k === 'Identifier');
    if (nameTok && head.length >= 2) {
      const typeToks = head.slice(0, head.lastIndexOf(nameTok)).filter((t) => !TYPE_SKIP.has(t.t) && t.t !== '*' && t.t !== '&');
      const type = joinToks(typeToks);
      if (type) {
        statements.push(mk({ command: nameTok.t, type, kind: 'variable', line: nameTok.line, parent, fileName, inProject, classScope: parent ? access : 'none', scope: parent ? 'classLocal' : 'global' }));
        for (const p of parts.slice(1)) {
          const e2 = p.findIndex((t) => t.t === '=' || t.t === '[');
          const h = e2 >= 0 ? p.slice(0, e2) : p;
          const nt = [...h].reverse().find((t) => t.k === 'Identifier');
          if (nt) statements.push(mk({ command: nt.t, type, kind: 'variable', line: nt.line, parent, fileName, inProject, classScope: parent ? access : 'none', scope: parent ? 'classLocal' : 'global' }));
        }
      }
    }
    if (term === '{') return skipBalanced(k, '{', '}');
    return k + 1;
  };

  parseScope(0, n, null, 'none');
  return { statements, includes, bodies };
}

/** local variables and parameters visible at a line inside a function body */
export function scanLocals(src: string, body: { st: Statement; fromLine: number; toLine: number }, line: number): Statement[] {
  const out: Statement[] = [];
  // parameters
  const args = body.st.args.replace(/^\(|\)$/g, '');
  for (const p of args.split(',')) {
    const m = /([A-Za-z_]\w*)\s*(\[[^\]]*\])*\s*(=.*)?$/.exec(p.trim());
    if (m && p.trim().split(/\s+/).length > 1) out.push(mk({ command: m[1], type: p.trim().slice(0, p.trim().lastIndexOf(m[1])).trim(), kind: 'variable', scope: 'local', line: body.fromLine }));
  }
  const lines = src.split('\n').slice(body.fromLine - 1, Math.min(line, body.toLine));
  const text = lines.join('\n');
  const declRe = /(?:^|[;{(]\s*)((?:const\s+|unsigned\s+|signed\s+|long\s+|short\s+|static\s+)*(?:std::)?[A-Za-z_]\w*(?:\s*<[^;{}()]*>)?(?:\s*::\s*\w+)*)\s*[*&]*\s+([A-Za-z_]\w*)\s*(?=[=;,\[(:)])/gm;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(text))) {
    const type = m[1].trim();
    if (['return', 'else', 'case', 'goto', 'delete', 'new', 'throw', 'using', 'typedef'].includes(type.split(/\s+/)[0])) continue;
    out.push(mk({ command: m[2], type, kind: 'variable', scope: 'local', line: body.fromLine + text.slice(0, m.index).split('\n').length - 1 }));
  }
  return out;
}

export function prettyStatement(st: Statement): string {
  switch (st.kind) {
    case 'function':
    case 'constructor':
    case 'destructor':
      return `${st.type ? st.type + ' ' : ''}${st.parent ? st.parent.command + '::' : ''}${st.command}${st.args}`;
    case 'variable':
      return `${st.type} ${st.parent ? st.parent.command + '::' : ''}${st.command}`;
    case 'class':
      return `${st.type} ${st.command}`;
    case 'typedef':
      return `typedef ${st.type} ${st.command}`;
    case 'preprocessor':
      return `#define ${st.command}${st.args} ${st.type}`;
    case 'enum':
      return `enum ${st.type ? st.type + '::' : ''}${st.command}`;
    default:
      return st.command;
  }
}
