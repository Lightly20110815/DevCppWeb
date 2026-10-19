// Version.pas
export const DEVCPP = 'Dev-C++';
export const DEVCPP_VERSION = '5.11';

export const DEV_MAKE_FILE = 'Makefile.win';

export const LIB_EXT = '.a';
export const OBJ_EXT = '.o';
export const DLL_EXT = '.dll';
export const EXE_EXT = '.exe';
export const DEV_EXT = '.dev';
export const HTML_EXT = '.html';
export const RTF_EXT = '.rtf';
export const TEX_EXT = '.tex';
export const TEMPLATE_EXT = '.template';
export const C_EXT = '.c';
export const CPP_EXT = '.cpp';
export const H_EXT = '.h';
export const HPP_EXT = '.hpp';
export const RC_EXT = '.rc';
export const RES_EXT = '.res';
export const GCH_EXT = '.gch';

export const MAKE_PROGRAM = 'mingw32-make.exe';
export const GCC_PROGRAM = 'gcc.exe';
export const GPP_PROGRAM = 'g++.exe';
export const CLEAN_PROGRAM = 'rm.exe';

export const FLT_ALLFILES = 'All files (*.*)|*.*|';
export const FLT_TEXTS = 'Text files (*.txt)|*.txt';
export const FLT_LIBRARIES = 'Libraries (*.lib;*.a)|*.lib;*.a';
export const FLT_PROJECTS = 'Dev-C++ project (*.dev)|*.dev';
export const FLT_HEADS = 'Header files (*.h;*.hpp;*.rh;*.hh)|*.h;*.hpp;*.rh;*.hh';
export const FLT_CS = 'C source files (*.c)|*.c';
export const FLT_CPPS = 'C++ source files (*.cpp;*.cc;*.cxx;*.c++;*.cp)|*.cpp;*.cc;*.cxx;*.c++;*.cp';
export const FLT_RES = 'Resource scripts (*.rc)|*.rc';
export const FLT_MSVCPROJECTS = 'MS Visual C++ projects (*.dsp)|*.dsp';
export const FLT_CBPROJECTS = 'Code::Blocks projects (*.cbp)|*.cbp';

/** Utils.BuildFilter */
export function buildFilter(filters: string[]) {
  let result = FLT_ALLFILES;
  for (const f of filters) {
    if (!result.endsWith('|')) result += '|';
    result += f;
  }
  return result;
}

export type UnitType = 'cSrc' | 'cppSrc' | 'cHead' | 'cppHead' | 'resSrc' | 'resComp' | 'prj' | 'other';

/** Utils.GetFileTyp */
export function getFileTyp(fileName: string): UnitType {
  const m = /\.[^.\\/]*$/.exec(fileName);
  const ext = (m ? m[0] : '').toLowerCase();
  if (ext === '.dev') return 'prj';
  if (ext === '.c') return 'cSrc';
  if (['.cpp', '.cc', '.cxx', '.c++', '.cp'].includes(ext)) return 'cppSrc';
  if (ext === '.h') return 'cHead';
  if (['.hpp', '.rh', '.hh', '.hxx', '.inl'].includes(ext)) return 'cppHead';
  if (ext === '.res' || ext === '.rc') return 'resSrc';
  return 'other';
}
