// Turns clang diagnostics into the GCC 4.9.2 style Dev-C++ users are used to.
import { tokenizeLine } from '../ide/editor/synCpp';

export interface SourceProvider {
  /** returns the text of a file given the path as printed by clang */
  (clangPath: string): string | null;
}

interface Tok {
  text: string;
  kind: string;
  line: number; // 1-based
  col: number; // 1-based
}

/** next significant token at/after (line, col) */
function nextToken(src: string, line: number, col: number): Tok | null {
  const lines = src.split('\n');
  let range: Parameters<typeof tokenizeLine>[1] = 'unknown';
  for (let l = 0; l < lines.length; l++) {
    const r = tokenizeLine(lines[l].replace(/\r$/, ''), range);
    range = r.range;
    if (l + 1 < line) continue;
    let c = 1;
    for (const t of r.tokens) {
      if ((l + 1 > line || c >= col) && t.kind !== 'Space' && t.kind !== 'Comment') return { text: t.text, kind: t.kind, line: l + 1, col: c };
      c += t.text.length;
    }
  }
  return null;
}

function tokenDesc(t: Tok | null): string {
  if (!t) return 'end of input';
  if (t.kind === 'Identifier' || t.kind === 'Reserved Word') return `'${t.text}'`;
  if (t.kind === 'Number' || t.kind === 'Float' || t.kind === 'Hexadecimal' || t.kind === 'Octal') return 'numeric constant';
  if (t.kind === 'String') return 'string constant';
  if (t.kind === 'Character') return 'character constant';
  return `'${t.text}' token`;
}

function gccType(t: string) {
  return t
    .replace(/\blong long\b/g, 'long long int')
    .replace(/\bunsigned long long\b/g, 'long long unsigned int')
    .replace(/\bunsigned int\b/g, 'unsigned int')
    .replace(/\bstd::__1::/g, 'std::')
    .replace(/\s+\*/g, '*');
}

export interface Diag {
  file: string;
  line: number;
  col: number;
  kind: 'error' | 'fatal error' | 'warning' | 'note';
  msg: string;
}

/** Rewrites one clang diagnostic. May move the position like GCC does. */
export function translate(d: Diag, src: string | null, isC: boolean): Diag {
  let m: RegExpExecArray | null;
  const out = { ...d };
  let msg = d.msg.replace(/std::__1::/g, 'std::');
  const at = (t: Tok | null) => {
    if (t) {
      out.line = t.line;
      out.col = t.col;
    }
  };
  if ((m = /^use of undeclared identifier '([^']+)'(; did you mean .*)?$/.exec(msg))) {
    msg = isC ? `'${m[1]}' undeclared (first use in this function)` : `'${m[1]}' was not declared in this scope`;
  } else if ((m = /^unknown type name '([^']+)'(; did you mean .*)?$/.exec(msg))) {
    msg = `'${m[1]}' does not name a type`;
  } else if ((m = /^expected '([^']+)' (after expression|after return statement|after break statement|after continue statement|after do\/while statement|after goto statement|at end of declaration|after class|after struct|after union|after enum|after top level declarator|at end of declaration list|in 'for' statement specifier|after alias declaration|after static_assert|after field)$/.exec(msg))) {
    if (src) {
      const t = nextToken(src, d.line, d.col);
      msg = t ? `expected '${m[1]}' before ${tokenDesc(t)}` : `expected '${m[1]}' at end of input`;
      at(t);
    } else msg = `expected '${m[1]}'`;
  } else if ((m = /^expected '([^']+)'$/.exec(msg))) {
    if (src) {
      const t = nextToken(src, d.line, d.col);
      msg = t ? `expected '${m[1]}' before ${tokenDesc(t)}` : `expected '${m[1]}' at end of input`;
      at(t);
    }
  } else if (msg === 'expected expression') {
    if (src) {
      const t = nextToken(src, d.line, d.col);
      msg = `expected primary-expression before ${tokenDesc(t)}`;
      at(t);
    } else msg = 'expected primary-expression';
  } else if (msg === 'expected unqualified-id') {
    if (src) {
      const t = nextToken(src, d.line, d.col);
      msg = `expected unqualified-id before ${tokenDesc(t)}`;
      at(t);
    }
  } else if (msg === "expected '}'" || msg === "expected '}' at end of input") {
    msg = "expected '}' at end of input";
  } else if ((m = /^'([^']+)' file not found$/.exec(msg))) {
    msg = `${m[1]}: No such file or directory`;
  } else if ((m = /^no member named '([^']+)' in '([^']+)'$/.exec(msg))) {
    msg = `'${gccType(m[2])}' has no member named '${m[1]}'`;
  } else if ((m = /^no member named '([^']+)' in namespace '([^']+)'(; did you mean .*)?$/.exec(msg))) {
    msg = `'${m[1]}' is not a member of '${m[2]}'`;
  } else if ((m = /^redefinition of '([^']+)'( with a different type.*)?$/.exec(msg))) {
    msg = `redefinition of '${m[1]}'`;
  } else if (msg === 'previous definition is here') {
    msg = 'previously defined here';
  } else if ((m = /^non-void function does not return a value( in all control paths)?$/.exec(msg))) {
    msg = 'control reaches end of non-void function';
  } else if ((m = /^variable '([^']+)' is uninitialized when used here$/.exec(msg))) {
    msg = `'${m[1]}' is used uninitialized in this function`;
  } else if ((m = /^comparison of integers of different signs: .*$/.exec(msg))) {
    msg = 'comparison between signed and unsigned integer expressions';
  } else if (msg === "'main' must return 'int'") {
    msg = "'::main' must return 'int'";
  } else if ((m = /^cannot initialize a variable of type '([^']+)' with an (?:rvalue|lvalue) of type '([^']+)'$/.exec(msg))) {
    msg = `invalid conversion from '${gccType(m[2])}' to '${gccType(m[1])}'`;
  } else if ((m = /^array type '[^']+' is not assignable$/.exec(msg))) {
    msg = 'invalid array assignment';
  } else if ((m = /^extraneous closing brace \('\}'\)$/.exec(msg))) {
    msg = "expected declaration before '}' token";
  } else if ((m = /^missing terminating '(.)' character$/.exec(msg))) {
    msg = `missing terminating ${m[1]} character`;
  } else if ((m = /^call to undeclared function '([^']+)'.*$/.exec(msg))) {
    msg = `implicit declaration of function '${m[1]}'`;
  } else if ((m = /^too few arguments to function call, .*$/.exec(msg))) {
    msg = 'too few arguments to function';
  } else if ((m = /^too many arguments to function call, .*$/.exec(msg))) {
    msg = 'too many arguments to function';
  } else if ((m = /^no matching function for call to '([^']+)'$/.exec(msg))) {
    msg = `no matching function for call to '${m[1]}'`;
  } else if ((m = /^invalid operands to binary expression \('([^']+)' and '([^']+)'\)$/.exec(msg))) {
    msg = `no match for operator (operand types are '${gccType(m[1])}' and '${gccType(m[2])}')`;
  } else if ((m = /^'([^']+)' was not declared in this scope$/.exec(msg))) {
    // already gcc style
  } else if (/^ISO C\+\+11 does not allow conversion from string literal to '([^']+)'$/.test(msg)) {
    msg = "deprecated conversion from string constant to 'char*'";
  } else if ((m = /^unused variable '([^']+)'$/.exec(msg))) {
    msg = `unused variable '${m[1]}'`;
  } else if ((m = /^format specifies type '([^']+)' but the argument has type '([^']+)'$/.exec(msg))) {
    msg = `format expects argument of type '${gccType(m[1])}', but argument has type '${gccType(m[2])}'`;
  } else if (msg === 'division by zero is undefined') {
    msg = 'division by zero';
  } else if ((m = /^implicit conversion from '([^']+)' to '([^']+)' changes value from (.+) to (.+)$/.exec(msg))) {
    msg = `overflow in implicit constant conversion`;
  }
  out.msg = msg;
  return out;
}

/** clang flag suffix "[-Wfoo]" -> gcc names */
export function translateFlag(flag: string) {
  const map: Record<string, string> = {
    '-Wreturn-type': '-Wreturn-type',
    '-Wsign-compare': '-Wsign-compare',
    '-Wwritable-strings': '-Wwrite-strings',
    '-Wc++11-compat-deprecated-writable-strings': '-Wwrite-strings',
    '-Wformat': '-Wformat=',
    '-Wdivision-by-zero': '-Wdiv-by-zero',
    '-Wconstant-conversion': '-Woverflow',
    '-Wimplicit-function-declaration': '-Wimplicit-function-declaration',
    '-Wunused-variable': '-Wunused-variable',
    '-Wuninitialized': '-Wuninitialized',
    '-Wsometimes-uninitialized': '-Wmaybe-uninitialized',
    '-Wparentheses': '-Wparentheses',
    '-Wmain-return-type': '-Wmain',
  };
  return map[flag] ?? flag;
}
