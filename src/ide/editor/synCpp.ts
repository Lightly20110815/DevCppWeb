// Port of SynEdit's TSynCppSyn tokenizer (SynHighlighterCpp.pas) as a CodeMirror stream language,
// so tokens are classified exactly like Dev-C++ does (whole-line preprocessor, symbol colors, ...).
import { StreamLanguage } from '@codemirror/language';
import type { StringStream } from '@codemirror/language';
import { Tag } from '@lezer/highlight';

export const synTags = {
  Assembler: Tag.define(),
  Character: Tag.define(),
  Comment: Tag.define(),
  Float: Tag.define(),
  Hexadecimal: Tag.define(),
  Identifier: Tag.define(),
  'Illegal Char': Tag.define(),
  Number: Tag.define(),
  Octal: Tag.define(),
  Preprocessor: Tag.define(),
  'Reserved Word': Tag.define(),
  Space: Tag.define(),
  String: Tag.define(),
  Symbol: Tag.define(),
};

export const CPP_KEYWORDS = new Set(
  ('alignas alignof and and_eq asm auto bitand bitor bool break case catch char char16_t char32_t class compl const ' +
    'const_cast constexpr continue decltype default delete do double dynamic_cast else enum explicit export extern false ' +
    'float for friend goto if inline int long mutable namespace new noexcept not not_eq nullptr operator or or_eq private ' +
    'protected public register reinterpret_cast return short signed sizeof static static_assert static_cast struct switch ' +
    'template this thread_local throw true try typedef typeid typename union unsigned using virtual void volatile wchar_t ' +
    'while xor xor_eq').split(' '),
);

type Range = 'unknown' | 'ansiC' | 'cppComment' | 'multiLineDirective' | 'directiveComment' | 'multilineString';

interface SynState {
  range: Range;
}

const isIdent = (c: string | undefined) => !!c && /[_0-9a-zA-Z]/.test(c);
const isDigit = (c: string | undefined) => !!c && c >= '0' && c <= '9';

/** Returns the token class for a single token starting at stream.pos */
function token(stream: StringStream, st: SynState): string | null {
  const line = stream.string;
  const at = (i: number) => (i < line.length ? line[i] : '\0');

  switch (st.range) {
    case 'ansiC':
    case 'directiveComment': {
      // AnsiCProc
      while (!stream.eol()) {
        if (stream.peek() === '*' && at(stream.pos + 1) === '/') {
          stream.pos += 2;
          if (st.range === 'directiveComment' && !stream.eol()) st.range = 'multiLineDirective';
          else st.range = 'unknown';
          return 'Comment';
        }
        stream.pos++;
      }
      return 'Comment';
    }
    case 'cppComment':
      st.range = 'unknown';
      stream.skipToEnd();
      if (line.endsWith('\\')) st.range = 'cppComment';
      return 'Comment';
    case 'multiLineDirective': {
      // DirectiveEndProc
      st.range = 'unknown';
      while (!stream.eol()) {
        const c = stream.peek();
        if (c === '/') {
          const n = at(stream.pos + 1);
          if (n === '/') {
            st.range = 'unknown';
            return 'Preprocessor';
          }
          if (n === '*') {
            st.range = 'directiveComment';
            return 'Preprocessor';
          }
        }
        if (c === '\\' && stream.pos + 1 === line.length) {
          stream.pos++;
          st.range = 'multiLineDirective';
          return 'Preprocessor';
        }
        stream.pos++;
      }
      return 'Preprocessor';
    }
    case 'multilineString': {
      st.range = 'unknown';
      while (!stream.eol()) {
        const c = stream.peek();
        if (c === '\\') {
          const n = at(stream.pos + 1);
          if (n === '"' || n === '\\') stream.pos++;
          else if (stream.pos + 1 === line.length) {
            stream.pos++;
            st.range = 'multilineString';
            return 'String';
          }
        } else if (c === '"') break;
        stream.pos++;
      }
      if (stream.peek() === '"') stream.pos++;
      return 'String';
    }
  }

  const c = stream.next()!;
  const start = stream.pos - 1;
  switch (c) {
    case ' ':
    case '\t':
      while (!stream.eol() && /[\x01-\x20]/.test(stream.peek()!)) stream.pos++;
      return 'Space';
    case '&':
    case '|':
      if (stream.peek() === '=' || stream.peek() === c) stream.pos++;
      return 'Symbol';
    case "'": {
      // AsciiCharProc
      stream.pos = start;
      do {
        if (at(stream.pos) === '\\' && (at(stream.pos + 1) === "'" || at(stream.pos + 1) === '\\')) stream.pos++;
        stream.pos++;
      } while (stream.pos < line.length && at(stream.pos) !== "'");
      if (at(stream.pos) === "'") stream.pos++;
      return 'Character';
    }
    case '@':
      return 'Illegal Char';
    case '{':
    case '}':
    case '(':
    case ')':
    case '[':
    case ']':
    case ',':
    case ';':
    case '?':
    case '~':
      return 'Symbol';
    case ':':
      if (stream.peek() === ':') stream.pos++;
      return 'Symbol';
    case '#': {
      // DirectiveProc: '#' must be the first non blank char
      if (line.trim()[0] !== '#') return 'Illegal Char';
      stream.pos = start;
      do {
        if (at(stream.pos) === '/') {
          if (at(stream.pos + 1) === '/') {
            st.range = 'unknown';
            return 'Preprocessor';
          }
          if (at(stream.pos + 1) === '*') {
            st.range = 'directiveComment';
            return 'Preprocessor';
          }
        }
        if (at(stream.pos) === '\\' && stream.pos + 1 === line.length) {
          stream.pos++;
          st.range = 'multiLineDirective';
          return 'Preprocessor';
        }
        stream.pos++;
      } while (stream.pos < line.length);
      return 'Preprocessor';
    }
    case '=':
    case '!':
    case '%':
    case '^':
    case '*':
      if (stream.peek() === '=') stream.pos++;
      return 'Symbol';
    case '>':
      if (stream.peek() === '=') stream.pos++;
      else if (stream.peek() === '>') {
        stream.pos++;
        if (stream.peek() === '=') stream.pos++;
      }
      return 'Symbol';
    case '<':
      if (stream.peek() === '=') stream.pos++;
      else if (stream.peek() === '<') {
        stream.pos++;
        if (stream.peek() === '=') stream.pos++;
      }
      return 'Symbol';
    case '-':
      if (stream.peek() === '=' || stream.peek() === '-') stream.pos++;
      else if (stream.peek() === '>') {
        stream.pos++;
        if (stream.peek() === '*') stream.pos++;
      }
      return 'Symbol';
    case '+':
      if (stream.peek() === '=' || stream.peek() === '+') stream.pos++;
      return 'Symbol';
    case '.':
      if (isDigit(stream.peek() ?? undefined)) {
        stream.pos = start;
        return numberProc(stream, line);
      }
      if (stream.peek() === '.' && at(stream.pos + 1) === '.') stream.pos += 2;
      else if (stream.peek() === '*') stream.pos++;
      return 'Symbol';
    case '/':
      if (stream.peek() === '/') {
        stream.skipToEnd();
        if (line.endsWith('\\')) st.range = 'cppComment';
        return 'Comment';
      }
      if (stream.peek() === '*') {
        stream.pos++;
        st.range = 'ansiC';
        while (!stream.eol()) {
          if (stream.peek() === '*' && at(stream.pos + 1) === '/') {
            stream.pos += 2;
            st.range = 'unknown';
            break;
          }
          stream.pos++;
        }
        return 'Comment';
      }
      if (stream.peek() === '=') stream.pos++;
      return 'Symbol';
    case '"': {
      // StringProc
      stream.pos = start;
      do {
        if (at(stream.pos) === '\\') {
          const n = at(stream.pos + 1);
          if (n === '"' || n === '\\') stream.pos++;
          else if (stream.pos + 1 === line.length) {
            stream.pos++;
            st.range = 'multilineString';
            return 'String';
          }
        }
        stream.pos++;
      } while (stream.pos < line.length && at(stream.pos) !== '"');
      if (at(stream.pos) === '"') stream.pos++;
      return 'String';
    }
    default:
      if (/[A-Za-z_]/.test(c)) {
        while (isIdent(stream.peek() ?? undefined)) stream.pos++;
        const word = line.slice(start, stream.pos);
        return CPP_KEYWORDS.has(word) ? 'Reserved Word' : 'Identifier';
      }
      if (isDigit(c)) {
        stream.pos = start;
        return numberProc(stream, line);
      }
      return 'Illegal Char';
  }
}

function numberProc(stream: StringStream, line: string): string {
  const at = (i: number) => (i < line.length ? line[i] : '\0');
  const idx1 = stream.pos;
  let run = idx1 + 1;
  let kind = 'Number';
  const done = (k: string) => {
    stream.pos = run;
    return k;
  };
  while (/[0-9A-Fa-f.uUlLxX+-]/.test(at(run))) {
    const ch = at(run);
    if (ch === '.') {
      if (at(run + 1) === '.') break;
      if (kind !== 'Hexadecimal') kind = 'Float';
      else {
        return done('Illegal Char');
      }
    } else if (ch === '-' || ch === '+') {
      if (kind !== 'Float') return done(kind);
      if (!/[eE]/.test(at(run - 1))) return done(kind);
      if (!/[0-9+-]/.test(at(run + 1))) {
        run++;
        return done('Illegal Char');
      }
    } else if (ch >= '0' && ch <= '7') {
      if (run === idx1 + 1 && at(idx1) === '0') kind = 'Octal';
    } else if (ch === '8' || ch === '9') {
      if (at(idx1) === '0' && kind !== 'Hexadecimal' && kind !== 'Float') kind = 'Illegal Char';
    } else if (/[a-dA-D]/.test(ch)) {
      if (kind !== 'Hexadecimal') break;
    } else if (/[eE]/.test(ch)) {
      if (kind !== 'Hexadecimal') {
        if (isDigit(at(run - 1))) {
          for (let i = idx1; i < run; i++)
            if (/[eE]/.test(at(i))) return done('Illegal Char');
          if (!/[0-9+-]/.test(at(run + 1))) break;
          kind = 'Float';
        } else break;
      }
    } else if (/[fF]/.test(ch)) {
      if (kind !== 'Hexadecimal') {
        for (let i = idx1; i < run; i++) if (/[fF]/.test(at(i))) return done('Illegal Char');
        if (kind === 'Float') {
          if (/[lL]/.test(at(run - 1))) break;
        } else kind = 'Float';
      }
    } else if (/[lL]/.test(ch)) {
      for (let i = idx1; i < run - 1; i++) if (/[lL]/.test(at(i))) return done('Illegal Char');
      if (kind === 'Float' && /[fF]/.test(at(run - 1))) break;
    } else if (/[uU]/.test(ch)) {
      if (kind === 'Float') break;
      for (let i = idx1; i < run; i++) if (/[uU]/.test(at(i))) return done('Illegal Char');
    } else if (/[xX]/.test(ch)) {
      if (run === idx1 + 1 && at(idx1) === '0' && /[0-9a-fA-F]/.test(at(run + 1))) kind = 'Hexadecimal';
      else {
        if (!isIdent(at(run + 1)) && /[xX]/.test(at(idx1 + 1))) {
          run++;
          kind = 'Illegal Char';
        }
        break;
      }
    }
    run++;
  }
  if (/[A-Za-z_]/.test(at(run))) kind = 'Illegal Char';
  return done(kind);
}

export const synCppLanguage = StreamLanguage.define<SynState>({
  name: 'devcpp-cpp',
  startState: () => ({ range: 'unknown' }),
  copyState: (s) => ({ range: s.range }),
  token: (stream, st) => token(stream, st)?.replace(/ /g, '') ?? null,
  blankLine: (st) => {
    // a line continuation followed by an empty line ends directives/comments/strings
    if (st.range === 'multiLineDirective' || st.range === 'cppComment' || st.range === 'multilineString') st.range = 'unknown';
  },
  tokenTable: Object.fromEntries(Object.entries(synTags).map(([k, v]) => [k.replace(/ /g, ''), v])),
  languageData: {
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
    closeBrackets: { brackets: ['(', '[', '{', "'", '"'] },
  },
});

/** Plain tokenizer for other uses (class browser, completion context, HTML export) */
export function tokenizeLine(line: string, range: Range = 'unknown'): { tokens: { text: string; kind: string }[]; range: Range } {
  const st: SynState = { range };
  const out: { text: string; kind: string }[] = [];
  // minimal StringStream implementation
  const stream: { string: string; pos: number; start: number; [k: string]: unknown } = {
    string: line,
    pos: 0,
    start: 0,
    eol() {
      return this.pos >= this.string.length;
    },
    peek() {
      return this.pos < this.string.length ? this.string[this.pos] : undefined;
    },
    next() {
      return this.pos < this.string.length ? this.string[this.pos++] : undefined;
    },
    skipToEnd() {
      this.pos = this.string.length;
    },
  };
  const ss = stream as unknown as StringStream;
  while (stream.pos < line.length) {
    const s = stream.pos;
    const k = token(ss, st) ?? 'Identifier';
    if (stream.pos === s) stream.pos++;
    out.push({ text: line.slice(s, stream.pos), kind: k });
  }
  if (line.length === 0 && (st.range === 'multiLineDirective' || st.range === 'cppComment' || st.range === 'multilineString')) st.range = 'unknown';
  return { tokens: out, range: st.range };
}
