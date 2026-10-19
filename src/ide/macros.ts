// Macros.pas: <DEFAULT>, <DEVCPP>, <PROJECTNAME>, <DATE> ... used by tools and default code.
import { ide } from './ide';
import { devDirs } from './config';
import { DEVCPP_VERSION } from './version';
import { basename, dirname, changeExt } from '../os/vfs';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function parseMacros(s: string): string {
  const now = new Date();
  const e = ide.getEditor();
  const p = ide.project;
  const map: Record<string, string> = {
    '<DEFAULT>': devDirs.Default,
    '<DEVCPP>': devDirs.Exec.replace(/\\$/, ''),
    '<DEVCPPVERSION>': DEVCPP_VERSION,
    '<EXECPATH>': devDirs.Exec,
    '<DATE>': `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${String(now.getFullYear()).slice(2)}`,
    '<DATETIME>': `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${String(now.getFullYear()).slice(2)} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    '<INCLUDE>': '',
    '<LIB>': '',
    '<EXENAME>': p ? p.executable : e ? changeExt(e.fileName, '.exe') : '',
    '<PROJECTNAME>': p ? p.name : '',
    '<PROJECTFILE>': p ? p.fileName : '',
    '<PROJECTFILENAME>': p ? basename(p.fileName) : '',
    '<PROJECTPATH>': p ? p.directory + '\\' : '',
    '<SOURCENAME>': e ? e.fileName : '',
    '<SOURCESPCLIST>': p ? p.units.map((u) => `"${u.fileName}"`).join(' ') : '',
    '<SOURCEPATH>': e ? dirname(e.fileName) + '\\' : '',
    '<WORDXY>': e ? e.identifierAt(e.view.state.selection.main.head).word : '',
  };
  return s.replace(/<[A-Z]+>/g, (m) => (m in map ? map[m] : m));
}
