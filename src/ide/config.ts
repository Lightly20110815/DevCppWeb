// Port of devCFG.pas: all persistent settings with the same defaults as Dev-C++ 5.11.
import * as L from '../generated/langIds';
import themes from '../generated/colorThemes.json';
import { DEVCPP_DIR, DOCUMENTS_DIR, MINGW_DIR } from '../os/vfs';

const STORAGE_KEY = 'devcpp.ini';

export interface DevData {
  First: boolean;
  Language: string;
  Theme: string; // icon theme: "New Look" | "Gnome" | "Blue"
  ThemeChange: boolean;
  FindCols: string;
  CompCols: string;
  MsgTabs: number; // 0 top, 1 bottom, 2 left, 3 right
  MRUMax: number;
  MinOnRun: boolean;
  Backups: boolean;
  AutoOpen: number; // 0 all project files, 1 only first, 2 reopen, 3 none
  ShowLeftPages: boolean;
  LeftActivePage: number;
  ProjectWidth: number;
  OutputHeight: number;
  Statusbar: boolean;
  ShowBars: boolean;
  MultiLineTab: boolean;
  DefCpp: boolean;
  DblFiles: boolean;
  ConsolePause: boolean;
  ShortenCompPaths: boolean;
  Splash: string;
  InterfaceFont: string;
  InterfaceFontSize: number;
  ShowTipsOnStart: boolean;
  LastTip: number;
  ShowProgress: boolean;
  AutoCloseProgress: boolean;
  PrintColors: boolean;
  PrintHighlight: boolean;
  PrintWordWrap: boolean;
  PrintLineNumbers: boolean;
  PrintLineNumbersMargins: boolean;
  WatchHint: boolean;
  UseATTSyntax: boolean;
  ShowCPUSignal: boolean;
  CaseSensitive: boolean;
  Wholewords: boolean;
  PromptReplace: boolean;
  ScopeIsSelected: boolean;
  OriginEntireScope: boolean;
  SearchWhere: number;
  DirBackward: boolean;
  MessageFloat: boolean;
  ProjectFloat: boolean;
  CheckAssocs: boolean;
  AssociateC: boolean;
  AssociateCpp: boolean;
  AssociateCxx: boolean;
  AssociateH: boolean;
  AssociateHpp: boolean;
  AssociateHxx: boolean;
  AssociateDev: boolean;
  AssociateRc: boolean;
  AssociateTemplate: boolean;
  FullScreen: boolean;
  Toolbars: Record<string, { visible: boolean; x: number; y: number }>;
  History: string[];
  WindowMaximized: boolean;
  WindowRect: { x: number; y: number; w: number; h: number } | null;
}

export interface DevEditor {
  AutoIndent: boolean;
  AddIndent: boolean;
  InsertMode: boolean;
  UseTabs: boolean;
  SmartTabs: boolean;
  GroupUndo: boolean;
  InsDropFiles: boolean;
  SpecialChar: boolean;
  EHomeKey: boolean;
  PastEOF: boolean;
  PastEOL: boolean;
  FindText: boolean;
  ShowScrollbars: boolean;
  HalfPage: boolean;
  ShowScrollHint: boolean;
  ParserHints: boolean;
  ShowFunctionTip: boolean;
  TrimTrailingSpaces: boolean;
  InsertCaret: number;
  OverwriteCaret: number;
  Match: boolean;
  MarginVis: boolean;
  MarginSize: number;
  MarginColor: string;
  UseSyntax: boolean;
  SyntaxExt: string;
  HighCurrLine: boolean;
  HighColor: string; // Delphi color string
  TabSize: number;
  FontName: string;
  FontSize: number;
  ShowGutter: boolean;
  GutterAuto: boolean;
  CustomGutter: boolean;
  LineNumbers: boolean;
  FirstIsZero: boolean;
  LeadZero: boolean;
  GutterFontName: string;
  GutterFontSize: number;
  GutterSize: number;
  EnableAutoSave: boolean;
  Interval: number;
  AutoSaveFilter: number;
  AutoSaveMode: number;
  CompleteSymbols: boolean;
  BraceComplete: boolean;
  ParentheseComplete: boolean;
  IncludeComplete: boolean;
  ArrayComplete: boolean;
  CommentComplete: boolean;
  SingleQuoteComplete: boolean;
  DoubleQuoteComplete: boolean;
  DeleteSymbolPairs: boolean;
  DefaultCode: boolean;
  DefaultCodeText: string;
  /** "Attribute name" -> "fg, bg, bold, italic, underline" (or "fg, bg" for specials) */
  Syntax: Record<string, string>;
  ColorPreset: string;
}

export interface CodeCompletionOpts {
  Width: number;
  Height: number;
  Delay: number;
  BackColor: string;
  Enabled: boolean;
  ParseLocalHeaders: boolean;
  ParseGlobalHeaders: boolean;
  CacheFiles: string[];
}

export interface ClassBrowsingOpts {
  Enabled: boolean;
  ShowFilter: number; // 0 all, 1 project, 2 current, 3 system headers
  ShowInheritedMembers: boolean;
}

export interface FormatterOpts {
  BracketStyle: number;
  IndentStyle: number;
  TabWidth: number;
  ModifyMaxLineLength: boolean;
  MaxLineLength: number;
  IndentClasses: boolean;
  IndentSwitches: boolean;
  IndentCases: boolean;
  IndentNamespaces: boolean;
  IndentLabels: boolean;
  IndentPreprocessor: boolean;
  CustomCommand: string;
}

export interface ExternalProgram {
  ext: string;
  program: string;
}

export interface ToolItem {
  Title: string;
  Exec: string;
  WorkDir: string;
  Params: string;
}

export interface CompilerOption {
  name: number; // lang id
  section: number; // lang id
  isC: boolean;
  isCpp: boolean;
  isLinker: boolean;
  setting: string;
  choices: [string, string][] | null; // [display, value]
}

export interface CompilerSet {
  name: string;
  version: string;
  type: string;
  dumpMachine: string;
  folder: string;
  gccName: string;
  gppName: string;
  makeName: string;
  gdbName: string;
  windresName: string;
  gprofName: string;
  binDirs: string[];
  cDirs: string[];
  cppDirs: string[];
  libDirs: string[];
  compAdd: boolean;
  linkAdd: boolean;
  compOpt: string;
  linkOpt: string;
  /** one char per option, see VALUE_TO_CHAR */
  options: string;
}

export const VALUE_TO_CHAR = '01abcdefghijklmnopqrstuvwxyz';
export const charToValue = (c: string) => Math.max(0, VALUE_TO_CHAR.indexOf(c));

const CPU = [
  '', 'This CPU=native', 'i386=i386', 'i486=i486', 'i586=i586', 'i686=i686', 'Pentium=pentium',
  'Pentium MMX=pentium-mmx', 'Pentium Pro=pentiumpro', 'Pentium 2=pentium2', 'Pentium 3=pentium3',
  'Pentium 4=pentium4', 'Conroe=core2', 'Nehalem=corei7', 'Sandy=corei7-avx', 'K6=k6', 'K6-2=k6-2',
  'K6-3=k6-3', 'Athlon=athlon', 'Athlon Tbird=athlon-tbird', 'Athlon 4=athlon-4', 'Athlon XP=athlon-xp',
  'Athlon MP=athlon-mp', 'K8=k8', 'K8 Rev.E=k8-sse3', 'K10=barcelona', 'Bulldozer=bdver1',
];
const split = (list: string[]): [string, string][] =>
  list.map((s) => {
    const i = s.indexOf('=');
    return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)];
  });

/** TdevCompilerSet.SetOptions */
export const COMPILER_OPTIONS: CompilerOption[] = [
  { name: L.ID_COPT_ANSIC, section: L.ID_COPT_GRP_C, isC: true, isCpp: true, isLinker: false, setting: '-ansi', choices: null },
  { name: L.ID_COPT_NOASM, section: L.ID_COPT_GRP_C, isC: true, isCpp: true, isLinker: false, setting: '-fno-asm', choices: null },
  { name: L.ID_COPT_TRADITIONAL, section: L.ID_COPT_GRP_C, isC: true, isCpp: true, isLinker: false, setting: '-traditional-cpp', choices: null },
  { name: L.ID_COPT_ARCH, section: L.ID_COPT_GRP_CODEGEN, isC: true, isCpp: true, isLinker: false, setting: '-march=', choices: split(CPU) },
  { name: L.ID_COPT_TUNE, section: L.ID_COPT_GRP_CODEGEN, isC: true, isCpp: true, isLinker: false, setting: '-mtune=', choices: split(CPU) },
  {
    name: L.ID_COPT_BUILTINPROC, section: L.ID_COPT_GRP_CODEGEN, isC: true, isCpp: true, isLinker: false, setting: '-m',
    choices: split(['', 'MMX=mmx', '3D Now=3dnow', 'SSE=sse', 'SSE2=sse2', 'SSE3=sse3', 'SSSE3=ssse3', 'SSE4=sse4', 'SSE4A=sse4a', 'SSE4.1=sse4.1', 'SSE4.2=sse4.2', 'AVX=avx', 'FMA4=fma4', 'XOP=xop', 'AES=aes']),
  },
  {
    name: L.ID_COPT_OPTIMIZE, section: L.ID_COPT_GRP_CODEGEN, isC: true, isCpp: true, isLinker: false, setting: '-O',
    choices: split(['', 'Low=1', 'Med=2', 'High=3', 'Highest (fast)=fast', 'Size (s)=s', 'Debug (g)=g']),
  },
  { name: L.ID_COPT_PTRWIDTH, section: L.ID_COPT_GRP_CODEGEN, isC: true, isCpp: true, isLinker: true, setting: '-', choices: split(['', '32bit=m32', '64bit=m64']) },
  {
    name: L.ID_COPT_STD, section: L.ID_COPT_GRP_CODEGEN, isC: true, isCpp: true, isLinker: false, setting: '-std=',
    choices: split(['', 'ISO C90=c90', 'ISO C99=c99', 'ISO C++=c++98', 'ISO C++11=c++11', 'GNU C90=gnu90', 'GNU C99=gnu99', 'GNU C++=gnu++98', 'GNU C++11=gnu++11']),
  },
  { name: L.ID_COPT_WARNING, section: L.ID_COPT_GRP_WARN, isC: true, isCpp: true, isLinker: false, setting: '-w', choices: null },
  { name: L.ID_COPT_WARNINGPLUS, section: L.ID_COPT_GRP_WARN, isC: true, isCpp: true, isLinker: false, setting: '-Wall', choices: null },
  { name: L.ID_COPT_WARNINGEX, section: L.ID_COPT_GRP_WARN, isC: true, isCpp: true, isLinker: false, setting: '-Wextra', choices: null },
  { name: L.ID_COPT_ISOCONFORM, section: L.ID_COPT_GRP_WARN, isC: true, isCpp: true, isLinker: false, setting: '-pedantic', choices: null },
  { name: L.ID_COPT_SYNTAXONLY, section: L.ID_COPT_GRP_WARN, isC: true, isCpp: true, isLinker: false, setting: '-fsyntax-only', choices: null },
  { name: L.ID_COPT_TREATASERROR, section: L.ID_COPT_GRP_WARN, isC: true, isCpp: true, isLinker: false, setting: '-Werror', choices: null },
  { name: L.ID_COPT_FAILONFIRST, section: L.ID_COPT_GRP_WARN, isC: true, isCpp: true, isLinker: false, setting: '-Wfatal-errors', choices: null },
  { name: L.ID_COPT_PROFILE, section: L.ID_COPT_PROFILING, isC: true, isCpp: true, isLinker: true, setting: '-pg', choices: null },
  { name: L.ID_COPT_OBJC, section: L.ID_COPT_LINKERTAB, isC: false, isCpp: false, isLinker: true, setting: '-lobjc', choices: null },
  { name: L.ID_COPT_DEBUG, section: L.ID_COPT_LINKERTAB, isC: true, isCpp: true, isLinker: true, setting: '-g3', choices: null },
  { name: L.ID_COPT_NOLIBS, section: L.ID_COPT_LINKERTAB, isC: true, isCpp: true, isLinker: true, setting: '-nostdlib', choices: null },
  { name: L.ID_COPT_WIN32, section: L.ID_COPT_LINKERTAB, isC: true, isCpp: true, isLinker: true, setting: '-mwindows', choices: null },
  { name: L.ID_COPT_STRIP, section: L.ID_COPT_LINKERTAB, isC: false, isCpp: false, isLinker: true, setting: '-s', choices: null },
  { name: L.ID_COPT_MEM, section: L.ID_COPT_GRP_OUTPUT, isC: true, isCpp: true, isLinker: false, setting: '-fverbose-asm', choices: null },
  { name: L.ID_COPT_ASSEMBLY, section: L.ID_COPT_GRP_OUTPUT, isC: true, isCpp: true, isLinker: false, setting: '-S', choices: null },
  { name: L.ID_COPT_PIPES, section: L.ID_COPT_GRP_OUTPUT, isC: true, isCpp: true, isLinker: false, setting: '-pipe', choices: null },
];

export function findOptionIndex(setting: string) {
  return COMPILER_OPTIONS.findIndex((o) => o.setting === setting);
}

function setOption(set: CompilerSet, setting: string, value: string) {
  const i = findOptionIndex(setting);
  if (i < 0) return;
  const chars = set.options.padEnd(COMPILER_OPTIONS.length, '0').split('');
  chars[i] = value;
  set.options = chars.join('');
}

/** TdevCompilerSets.FindSets for the bundled TDM-GCC 4.9.2 */
export function defaultCompilerSets(): CompilerSet[] {
  const version = '4.9.2';
  const dump = 'x86_64-w64-mingw32';
  const base: CompilerSet = {
    name: 'TDM-GCC 4.9.2 64-bit Release',
    version,
    type: 'tdm64-1',
    dumpMachine: dump,
    folder: MINGW_DIR,
    gccName: 'gcc.exe',
    gppName: 'g++.exe',
    makeName: 'mingw32-make.exe',
    gdbName: 'gdb.exe',
    windresName: 'windres.exe',
    gprofName: 'gprof.exe',
    binDirs: [`${MINGW_DIR}\\bin`],
    libDirs: [`${MINGW_DIR}\\lib`, `${MINGW_DIR}\\${dump}\\lib`],
    cDirs: [`${MINGW_DIR}\\include`, `${MINGW_DIR}\\${dump}\\include`, `${MINGW_DIR}\\lib\\gcc\\${dump}\\${version}\\include`],
    cppDirs: [
      `${MINGW_DIR}\\include`, `${MINGW_DIR}\\${dump}\\include`, `${MINGW_DIR}\\lib\\gcc\\${dump}\\${version}\\include`,
      `${MINGW_DIR}\\lib\\gcc\\${dump}\\${version}\\include\\c++`,
    ],
    compAdd: false,
    linkAdd: true,
    compOpt: '',
    linkOpt: '-static-libgcc',
    options: '0'.repeat(COMPILER_OPTIONS.length),
  };
  const clone = (s: CompilerSet, name: string): CompilerSet => ({
    ...s, name, binDirs: [...s.binDirs], libDirs: [...s.libDirs], cDirs: [...s.cDirs], cppDirs: [...s.cppDirs],
  });
  const sets: CompilerSet[] = [base];
  const dbg = clone(base, 'TDM-GCC 4.9.2 64-bit Debug');
  setOption(dbg, '-g3', '1');
  const prof = clone(base, 'TDM-GCC 4.9.2 64-bit Profiling');
  setOption(prof, '-pg', '1');
  const r32 = clone(base, 'TDM-GCC 4.9.2 32-bit Release');
  setOption(r32, '-', '1');
  r32.gdbName = 'gdb32.exe';
  r32.libDirs = r32.libDirs.map((d) => d + '32');
  const d32 = clone(r32, 'TDM-GCC 4.9.2 32-bit Debug');
  setOption(d32, '-g3', '1');
  const p32 = clone(r32, 'TDM-GCC 4.9.2 32-bit Profiling');
  setOption(p32, '-pg', '1');
  sets.push(dbg, prof, r32, d32, p32);
  return sets;
}

// ---------------------------------------------------------------- syntax colors

/** Order of TSynCppSyn attributes (resource strings 1..14) */
export const SYN_ATTRS = [
  'Assembler', 'Character', 'Comment', 'Float', 'Hexadecimal', 'Identifier', 'Illegal Char', 'Number',
  'Octal', 'Preprocessor', 'Reserved Word', 'Space', 'String', 'Symbol',
];
export const cBP = 'Breakpoints';
export const cErr = 'Error line';
export const cABP = 'Active breakpoints';
export const cGut = 'Gutter';
export const cSel = 'Selected text';
export const cFld = 'Folding lines';
export const SPECIAL_ATTRS: [string, number][] = [[cBP, 17], [cErr, 18], [cABP, 19], [cGut, 20], [cSel, 21], [cFld, 22]];

type ThemeData = { order: string[]; themes: Record<string, Record<string, string[]>> };
export const COLOR_PRESETS = (themes as ThemeData).order.filter((n) => (themes as ThemeData).themes[n]);

/** TdmMain.InitHighlighterFirstTime */
export function presetSyntax(index: number): Record<string, string> {
  const name = COLOR_PRESETS[index] ?? 'Classic Plus';
  const t = (themes as ThemeData).themes[name];
  const syn: Record<string, string> = {};
  SYN_ATTRS.forEach((a, i) => {
    syn[a] = (t[i + 1] ?? ['clBlack', 'clNone', '0', '0', '0']).join(', ');
  });
  for (const [a, n] of SPECIAL_ATTRS) syn[a] = (t[n] ?? ['clBlack', 'clNone']).join(', ');
  return syn;
}

/** highlight color chosen by TLangForm.ColorChange */
export function presetHighColor(name: string) {
  if (['Obsidian', 'GSS Hacker', 'Obvilion', 'PlasticCodeWrap'].includes(name)) return 'clBlack';
  if (['Twilight', 'Borland', 'Matrix'].includes(name)) return '$202020';
  return '$FFFFCC';
}

// ---------------------------------------------------------------- defaults

export function defaultDevData(): DevData {
  return {
    First: true,
    Language: 'English.lng',
    Theme: 'New Look',
    ThemeChange: false,
    FindCols: '75, 75, 120, 150',
    CompCols: '75, 75, 120, 150',
    MsgTabs: 0,
    MRUMax: 15,
    MinOnRun: false,
    Backups: false,
    AutoOpen: 2,
    ShowLeftPages: true,
    LeftActivePage: 0,
    ProjectWidth: 161,
    OutputHeight: 183,
    Statusbar: true,
    ShowBars: false,
    MultiLineTab: true,
    DefCpp: true,
    DblFiles: false,
    ConsolePause: true,
    ShortenCompPaths: false,
    Splash: '',
    InterfaceFont: 'Segoe UI',
    InterfaceFontSize: 9,
    ShowTipsOnStart: false,
    LastTip: 0,
    ShowProgress: true,
    AutoCloseProgress: false,
    PrintColors: true,
    PrintHighlight: true,
    PrintWordWrap: false,
    PrintLineNumbers: true,
    PrintLineNumbersMargins: false,
    WatchHint: false,
    UseATTSyntax: true,
    ShowCPUSignal: true,
    CaseSensitive: false,
    Wholewords: false,
    PromptReplace: false,
    ScopeIsSelected: false,
    OriginEntireScope: false,
    SearchWhere: 1,
    DirBackward: false,
    MessageFloat: false,
    ProjectFloat: false,
    CheckAssocs: false,
    AssociateC: true,
    AssociateCpp: true,
    AssociateCxx: true,
    AssociateH: true,
    AssociateHpp: true,
    AssociateHxx: true,
    AssociateDev: true,
    AssociateRc: true,
    AssociateTemplate: true,
    FullScreen: false,
    Toolbars: {
      tbMain: { visible: true, x: 11, y: 2 },
      tbEdit: { visible: true, x: 196, y: 2 },
      tbCompile: { visible: true, x: 464, y: 2 },
      tbProject: { visible: true, x: 373, y: 2 },
      tbSpecials: { visible: true, x: 11, y: 30 },
      tbSearch: { visible: true, x: 233, y: 2 },
      tbClasses: { visible: true, x: 95, y: 30 },
      tbCompilers: { visible: true, x: 686, y: 2 },
    },
    History: [],
    WindowMaximized: true,
    WindowRect: null,
  };
}

export function defaultDevEditor(): DevEditor {
  return {
    AutoIndent: true,
    AddIndent: true,
    InsertMode: true,
    UseTabs: true,
    SmartTabs: false,
    GroupUndo: true,
    InsDropFiles: false,
    SpecialChar: false,
    EHomeKey: true,
    PastEOF: false,
    PastEOL: false,
    FindText: true,
    ShowScrollbars: true,
    HalfPage: false,
    ShowScrollHint: true,
    ParserHints: true,
    ShowFunctionTip: true,
    TrimTrailingSpaces: false,
    InsertCaret: 0,
    OverwriteCaret: 3,
    Match: true,
    MarginVis: false,
    MarginSize: 80,
    MarginColor: 'cl3DLight',
    UseSyntax: true,
    SyntaxExt: 'c;cpp;h;hpp;cc;cxx;cp;hp;rh;fx;inl;tcc;win;;',
    HighCurrLine: true,
    HighColor: '$FFFFCC',
    TabSize: 4,
    FontName: 'Consolas',
    FontSize: 10,
    ShowGutter: true,
    GutterAuto: true,
    CustomGutter: false,
    LineNumbers: true,
    FirstIsZero: false,
    LeadZero: false,
    GutterFontName: 'Consolas',
    GutterFontSize: 10,
    GutterSize: 1,
    EnableAutoSave: false,
    Interval: 10,
    AutoSaveFilter: 0,
    AutoSaveMode: 0,
    CompleteSymbols: true,
    BraceComplete: true,
    ParentheseComplete: true,
    IncludeComplete: true,
    ArrayComplete: true,
    CommentComplete: false,
    SingleQuoteComplete: true,
    DoubleQuoteComplete: true,
    DeleteSymbolPairs: true,
    DefaultCode: false,
    DefaultCodeText: '',
    Syntax: presetSyntax(1),
    ColorPreset: 'Classic Plus',
  };
}

export function defaultCodeCompletion(): CodeCompletionOpts {
  return {
    Width: 320, Height: 240, Delay: 180, BackColor: 'clWindow', Enabled: true,
    ParseLocalHeaders: true, ParseGlobalHeaders: true, CacheFiles: [],
  };
}

export function defaultClassBrowsing(): ClassBrowsingOpts {
  return { Enabled: true, ShowFilter: 2, ShowInheritedMembers: false };
}

export function defaultFormatter(): FormatterOpts {
  return {
    BracketStyle: 2, IndentStyle: 2, TabWidth: 4, ModifyMaxLineLength: false, MaxLineLength: 80,
    IndentClasses: true, IndentSwitches: true, IndentCases: false, IndentNamespaces: true,
    IndentLabels: false, IndentPreprocessor: true, CustomCommand: '',
  };
}

export interface DevDirs {
  Exec: string;
  Config: string;
  Default: string;
  Help: string;
  Icons: string;
  Lang: string;
  Templates: string;
}

export function defaultDirs(): DevDirs {
  return {
    Exec: DEVCPP_DIR + '\\',
    Config: DEVCPP_DIR + '\\',
    Default: DOCUMENTS_DIR,
    Help: DEVCPP_DIR + '\\Help\\',
    Icons: DEVCPP_DIR + '\\Icons\\',
    Lang: DEVCPP_DIR + '\\Lang\\',
    Templates: DEVCPP_DIR + '\\Templates\\',
  };
}

export interface Settings {
  data: DevData;
  editor: DevEditor;
  codeCompletion: CodeCompletionOpts;
  classBrowsing: ClassBrowsingOpts;
  formatter: FormatterOpts;
  dirs: DevDirs;
  compilerSets: CompilerSet[];
  compilerSetIndex: number;
  externalPrograms: ExternalProgram[];
  tools: ToolItem[];
  shortcuts: Record<string, string>; // action name -> shortcut text
  codeInserts: { caption: string; sep: number; desc: string; code: string }[];
}

function defaults(): Settings {
  return {
    data: defaultDevData(),
    editor: defaultDevEditor(),
    codeCompletion: defaultCodeCompletion(),
    classBrowsing: defaultClassBrowsing(),
    formatter: defaultFormatter(),
    dirs: defaultDirs(),
    compilerSets: defaultCompilerSets(),
    compilerSetIndex: 0,
    externalPrograms: [],
    tools: [],
    shortcuts: {},
    codeInserts: defaultCodeInserts(),
  };
}

/** devcpp's default codeinsertion list (CodeInsList.pas) */
function defaultCodeInserts() {
  return [
    { caption: 'MessageBox', sep: 0, desc: 'MessageBox', code: 'MessageBox(*|*, "", "", MB_OK);' },
    { caption: 'TRY/CATCH block', sep: 1, desc: 'C++ try/catch', code: 'try {\n\t*|*\n} catch (...) {\n\t\n}' },
    { caption: 'FOR loop', sep: 2, desc: 'for loop', code: 'for (*|*; ; ) {\n\t\n}' },
    { caption: 'FOR i loop', sep: 2, desc: 'for i loop', code: 'for (int i = 0; i < *|*; i++) {\n\t\n}' },
    { caption: 'WHILE loop', sep: 2, desc: 'while loop', code: 'while (*|*) {\n\t\n}' },
    { caption: 'DO-WHILE loop', sep: 2, desc: 'do while loop', code: 'do {\n\t*|*\n} while ();' },
    { caption: 'IF', sep: 3, desc: 'if statement', code: 'if (*|*) {\n\t\n}' },
    { caption: 'IF ELSE', sep: 3, desc: 'if else statement', code: 'if (*|*) {\n\t\n} else {\n\t\n}' },
    { caption: 'IF ELSE IF', sep: 3, desc: 'if else if statement', code: 'if (*|*) {\n\t\n} else if () {\n\t\n}' },
    { caption: 'SWITCH', sep: 3, desc: 'switch statement', code: 'switch (*|*) {\n\tcase :\n\t\tbreak;\n\tdefault:\n\t\tbreak;\n}' },
  ];
}

function merge<T extends object>(def: T, val: unknown): T {
  if (!val || typeof val !== 'object') return def;
  const out = { ...def } as Record<string, unknown>;
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    if (!(k in out)) continue;
    const d = out[k];
    if (d && typeof d === 'object' && !Array.isArray(d) && v && typeof v === 'object' && !Array.isArray(v)) out[k] = merge(d as object, v);
    else if (v !== undefined && (typeof v === typeof d || d === null)) out[k] = v;
  }
  return out as T;
}

function load(): Settings {
  const def = defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return def;
    const v = JSON.parse(raw);
    const s = merge(def, v);
    if (Array.isArray(v.compilerSets) && v.compilerSets.length) s.compilerSets = v.compilerSets;
    for (const set of s.compilerSets) set.options = (set.options ?? '').padEnd(COMPILER_OPTIONS.length, '0');
    return s;
  } catch {
    return def;
  }
}

export const settings: Settings = load();
export const devData = settings.data;
export const devEditor = settings.editor;
export const devDirs = settings.dirs;

export function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('could not save settings', e);
  }
}

export function resetSettings() {
  Object.assign(settings.data, defaultDevData());
  Object.assign(settings.editor, defaultDevEditor());
  Object.assign(settings.codeCompletion, defaultCodeCompletion());
  Object.assign(settings.classBrowsing, defaultClassBrowsing());
  Object.assign(settings.formatter, defaultFormatter());
  Object.assign(settings.dirs, defaultDirs());
  settings.compilerSets = defaultCompilerSets(); settings.compilerSetIndex = 0;
  settings.tools = []; settings.shortcuts = {}; settings.externalPrograms = []; settings.codeInserts = defaultCodeInserts();
  localStorage.removeItem(STORAGE_KEY);
}

export function currentCompilerSet(): CompilerSet {
  return settings.compilerSets[settings.compilerSetIndex] ?? settings.compilerSets[0] ?? defaultCompilerSets()[0];
}

/** `devCompilerSets.CompilationSet.Options[I].Value` */
export function optionValue(set: CompilerSet, index: number) {
  return charToValue(set.options[index] ?? '0');
}
