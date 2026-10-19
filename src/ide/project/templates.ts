// Templates.pas: project templates shipped in Dev-Cpp\Templates.
import data from '../../generated/templates.json';
import { PROJ_TYPES } from './Project';
import type { ProjOptions } from './Project';
import { parseDelimited, IniFile } from '../ini';
import { vfs, joinPath, basename } from '../../os/vfs';
import { settings } from '../config';

interface RawTemplate {
  file: string;
  ini: Record<string, Record<string, string>>;
}

export interface TemplateUnit {
  cName: string;
  cppName: string;
  cText: string;
  cppText: string;
}

export interface Template {
  file: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  version: number;
  options: Partial<ProjOptions>;
  units: TemplateUnit[];
}

const files = (data as unknown as { files: Record<string, string> }).files;

function get(ini: RawTemplate['ini'], sec: string, key: string, def = '') {
  const s = Object.entries(ini).find(([k]) => k.toLowerCase() === sec.toLowerCase())?.[1];
  if (!s) return def;
  const e = Object.entries(s).find(([k]) => k.toLowerCase() === key.toLowerCase());
  return e ? e[1] : def;
}

function text(ref: string) {
  if (!ref) return '';
  return files[ref.toLowerCase()] ?? '';
}

export const templates: Template[] = (data as unknown as { templates: RawTemplate[] }).templates.map((t) => {
  const ini = t.ini;
  const unitCount = parseInt(get(ini, 'Project', 'UnitCount', '0'), 10) || 0;
  const units: TemplateUnit[] = [];
  for (let i = 0; i < unitCount; i++) {
    const sec = 'Unit' + i;
    units.push({
      cName: get(ini, sec, 'CName'),
      cppName: get(ini, sec, 'CppName'),
      cText: text(get(ini, sec, 'C')),
      cppText: text(get(ini, sec, 'Cpp')),
    });
  }
  return {
    file: t.file,
    name: get(ini, 'Template', 'Name'),
    description: get(ini, 'Template', 'Description'),
    icon: get(ini, 'Template', 'Icon'),
    category: get(ini, 'Template', 'Category') || get(ini, 'Template', 'Catagory'),
    version: parseInt(get(ini, 'Template', 'Ver', '2'), 10),
    options: {
      icon: get(ini, 'Project', 'Icon'),
      type: PROJ_TYPES[parseInt(get(ini, 'Project', 'Type', '0'), 10) || 0] ?? 'gui',
      objFiles: parseDelimited(get(ini, 'Project', 'ObjFiles')),
      includes: parseDelimited(get(ini, 'Project', 'Includes')),
      libs: parseDelimited(get(ini, 'Project', 'Libs')),
      resourceIncludes: parseDelimited(get(ini, 'Project', 'ResourceIncludes')),
      compilerCmd: get(ini, 'Project', 'Compiler'),
      cppCompilerCmd: get(ini, 'Project', 'CppCompiler'),
      linkerCmd: get(ini, 'Project', 'Linker'),
      useGPP: get(ini, 'Project', 'IsCpp', '0') === '1',
      includeVersionInfo: get(ini, 'Project', 'IncludeVersionInfo', '0') === '1',
      supportXPThemes: get(ini, 'Project', 'SupportXPThemes', '0') === '1',
      exeOutput: get(ini, 'Project', 'ExeOutput'),
      objectOutput: get(ini, 'Project', 'ObjectOutput'),
      logOutput: get(ini, 'Project', 'LogOutput'),
    },
    units,
  };
});

export function templateIconUrl(icon: string) {
  if (!icon) return import.meta.env.BASE_URL + 'devcpp/icons/devcpp_32.png';
  const base = icon.replace(/\.ico$/i, '');
  return import.meta.env.BASE_URL + `devcpp/templates/${base}_32.png`;
}

const builtinCount = templates.length;
export function loadUserTemplates() {
  templates.splice(builtinCount);
  for (const node of vfs.list(settings.dirs.Templates)) {
    if (node.dir || !/\.template$/i.test(node.path)) continue;
    const ini = new IniFile(vfs.readText(node.path));
    const read = (section: string, key: string, fallback = '') => ini.readString(section, key, fallback);
    const source = (reference: string) => { const file = joinPath(settings.dirs.Templates, reference); return reference && vfs.fileExists(file) ? vfs.readText(file) : ''; };
    const units = Array.from({ length: Math.min(1000, ini.readInteger('Project', 'UnitCount', 0)) }, (_, i) => ({ cName: read('Unit' + i, 'CName'), cppName: read('Unit' + i, 'CppName'), cText: source(read('Unit' + i, 'C')), cppText: source(read('Unit' + i, 'Cpp')) }));
    templates.push({ file: basename(node.path), name: read('Template', 'Name'), description: read('Template', 'Description'), icon: read('Template', 'Icon'), category: read('Template', 'Category', 'User'), version: 2, units, options: { type: PROJ_TYPES[ini.readInteger('Project', 'Type', 1)] ?? 'console', useGPP: ini.readBool('Project', 'IsCpp'), compilerCmd: read('Project', 'Compiler'), cppCompilerCmd: read('Project', 'CppCompiler'), linkerCmd: read('Project', 'Linker'), includes: parseDelimited(read('Project', 'Includes')), libs: parseDelimited(read('Project', 'Libs')), resourceIncludes: parseDelimited(read('Project', 'ResourceIncludes')) } });
  }
}
