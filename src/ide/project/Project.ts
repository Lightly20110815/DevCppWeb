// Port of Project.pas / ProjectTypes.pas: .dev project files, units and folders.
import { IniFile, parseDelimited } from '../ini';
import { vfs, basename, dirname, changeExt, joinPath, normalize, relativePath, expandFileTo } from '../../os/vfs';
import { ide } from '../ide';
import { lang, format } from '../../lang/lang';
import * as L from '../../generated/langIds';
import { settings, devData } from '../config';
import { getFileTyp, DEV_MAKE_FILE, LIB_EXT, DLL_EXT, EXE_EXT, OBJ_EXT, DEVCPP_VERSION } from '../version';
import type { Editor } from '../editor/Editor';
import { MessageDlg, MessageBox, MB_ICONERROR } from '../../os/messagebox';
import type { Template } from './templates';

export type ProjType = 'gui' | 'console' | 'static' | 'dll';
export const PROJ_TYPES: ProjType[] = ['gui', 'console', 'static', 'dll'];

export interface VersionInfo {
  major: number;
  minor: number;
  release: number;
  build: number;
  languageID: number;
  charsetID: number;
  companyName: string;
  fileVersion: string;
  fileDescription: string;
  internalName: string;
  legalCopyright: string;
  legalTrademarks: string;
  originalFilename: string;
  productName: string;
  productVersion: string;
  autoIncBuildNr: boolean;
  syncProduct: boolean;
}

export interface ProjOptions {
  type: ProjType;
  ver: number;
  objFiles: string[];
  compilerCmd: string;
  cppCompilerCmd: string;
  linkerCmd: string;
  includes: string[];
  libs: string[];
  privateResource: string;
  resourceIncludes: string[];
  makeIncludes: string[];
  useGPP: boolean;
  icon: string;
  exeOutput: string;
  objectOutput: string;
  logOutput: string;
  logOutputEnabled: boolean;
  useCustomMakefile: boolean;
  customMakefile: string;
  overrideOutput: boolean;
  overridenOutput: string;
  hostApplication: string;
  includeVersionInfo: boolean;
  supportXPThemes: boolean;
  compilerSet: number;
  compilerOptions: string;
  versionInfo: VersionInfo;
  cmdLineArgs: string;
}

export function defaultProjOptions(): ProjOptions {
  return {
    type: 'gui',
    ver: 2,
    objFiles: [],
    compilerCmd: '',
    cppCompilerCmd: '',
    linkerCmd: '',
    includes: [],
    libs: [],
    privateResource: '',
    resourceIncludes: [],
    makeIncludes: [],
    useGPP: false,
    icon: '',
    exeOutput: '',
    objectOutput: '',
    logOutput: '',
    logOutputEnabled: false,
    useCustomMakefile: false,
    customMakefile: '',
    overrideOutput: false,
    overridenOutput: '',
    hostApplication: '',
    includeVersionInfo: false,
    supportXPThemes: false,
    compilerSet: settings.compilerSetIndex,
    compilerOptions: settings.compilerSets[settings.compilerSetIndex]?.options ?? '',
    versionInfo: {
      major: 1, minor: 0, release: 0, build: 0, languageID: 0x0409, charsetID: 0x04e4, companyName: '', fileVersion: '',
      fileDescription: 'Developed using the Dev-C++ IDE', internalName: '', legalCopyright: '', legalTrademarks: '',
      originalFilename: '', productName: '', productVersion: '', autoIncBuildNr: false, syncProduct: true,
    },
    cmdLineArgs: '',
  };
}

export class ProjUnit {
  fileName = '';
  editor: Editor | null = null;
  isNew = false;
  folder = '';
  compile = true;
  compileCpp = true;
  link = true;
  priority = 1000;
  overrideBuildCmd = false;
  buildCmd = '';
  private _modified = false;

  get modified() {
    return this.editor ? this.editor.modified : this._modified;
  }
  set modified(v: boolean) {
    if (this.editor) this.editor.setModified(v);
    else this._modified = v;
  }

  /** TProjUnit.Save */
  async save(): Promise<boolean> {
    if (!this.editor && !vfs.fileExists(this.fileName)) {
      vfs.write(this.fileName, '');
      return true;
    }
    if (this.editor && this.modified) return ide.saveEditor(this.editor);
    return true;
  }
}

export class Project {
  fileName: string;
  name = '';
  options: ProjOptions = defaultProjOptions();
  units: ProjUnit[] = [];
  folders: string[] = [];
  ini: IniFile;
  private _modified = false;
  /** folder nodes that are expanded in the project view */
  expanded = new Set<string>(['']);

  constructor(fileName: string, name: string | null) {
    this.fileName = fileName;
    this.ini = new IniFile(vfs.fileExists(fileName) ? vfs.readText(fileName) : '');
    if (name === null) this.open();
    else {
      this.name = name;
      this.ini.writeString('Project', 'filename', fileName);
      this.ini.writeString('Project', 'name', name);
    }
  }

  get directory() {
    return dirname(this.fileName);
  }

  get makeFileName() {
    return this.options.useCustomMakefile ? this.options.customMakefile : joinPath(this.directory, DEV_MAKE_FILE);
  }

  get executable() {
    let exe: string;
    if (this.options.overrideOutput && this.options.overridenOutput) exe = this.options.overridenOutput;
    else if (this.options.type === 'static') exe = changeExt(basename(this.fileName), LIB_EXT);
    else if (this.options.type === 'dll') exe = changeExt(basename(this.fileName), DLL_EXT);
    else exe = changeExt(basename(this.fileName), EXE_EXT);
    const path = this.options.exeOutput ? expandFileTo(this.options.exeOutput, this.directory) : this.directory;
    return joinPath(path, exe);
  }

  get modified() {
    return this._modified || this.units.some((u) => u.modified);
  }
  set modified(v: boolean) {
    this._modified = v;
    ide.changed();
  }

  changed() {
    ide.changed();
  }

  // ---------------------------------------------------------------- options

  loadOptions() {
    const f = this.ini;
    const o = this.options;
    this.name = f.readString('Project', 'name', '');
    o.icon = f.readString('Project', 'icon', '');
    o.ver = f.readInteger('Project', 'Ver', 0);
    if (o.ver > 0) {
      o.ver = Math.max(o.ver, 2);
      o.type = PROJ_TYPES[f.readInteger('Project', 'type', 0)] ?? 'gui';
      o.compilerCmd = f.readString('Project', 'Compiler', '');
      o.cppCompilerCmd = f.readString('Project', 'CppCompiler', '');
      o.linkerCmd = f.readString('Project', 'Linker', '');
      o.objFiles = parseDelimited(f.readString('Project', 'ObjFiles', ''));
      o.libs = parseDelimited(f.readString('Project', 'Libs', ''));
      o.includes = parseDelimited(f.readString('Project', 'Includes', ''));
      o.privateResource = f.readString('Project', 'PrivateResource', '');
      o.resourceIncludes = parseDelimited(f.readString('Project', 'ResourceIncludes', ''));
      o.makeIncludes = parseDelimited(f.readString('Project', 'MakeIncludes', ''));
      o.useGPP = f.readBool('Project', 'IsCpp', false);
      o.exeOutput = f.readString('Project', 'ExeOutput', '');
      o.objectOutput = f.readString('Project', 'ObjectOutput', '');
      o.logOutput = f.readString('Project', 'LogOutput', '');
      o.logOutputEnabled = f.readBool('Project', 'LogOutputEnabled', false);
      o.overrideOutput = f.readBool('Project', 'OverrideOutput', false);
      o.overridenOutput = f.readString('Project', 'OverrideOutputName', '');
      o.hostApplication = f.readString('Project', 'HostApplication', '');
      o.useCustomMakefile = f.readBool('Project', 'UseCustomMakefile', false);
      o.customMakefile = f.readString('Project', 'CustomMakefile', '');
      o.cmdLineArgs = f.readString('Project', 'CommandLine', '');
      this.folders = parseDelimited(f.readString('Project', 'Folders', ''), ',').sort();
      o.includeVersionInfo = f.readBool('Project', 'IncludeVersionInfo', false);
      o.supportXPThemes = f.readBool('Project', 'SupportXPThemes', false);
      o.compilerSet = f.readInteger('Project', 'CompilerSet', settings.compilerSetIndex);
      if (o.compilerSet >= settings.compilerSets.length) o.compilerSet = settings.compilerSetIndex;
      o.compilerOptions = f.readString('Project', 'CompilerSettings', '');
      const v = o.versionInfo;
      v.major = f.readInteger('VersionInfo', 'Major', 0);
      v.minor = f.readInteger('VersionInfo', 'Minor', 1);
      v.release = f.readInteger('VersionInfo', 'Release', 1);
      v.build = f.readInteger('VersionInfo', 'Build', 1);
      v.languageID = f.readInteger('VersionInfo', 'LanguageID', 0x0409);
      v.charsetID = f.readInteger('VersionInfo', 'CharsetID', 0x04e4);
      v.companyName = f.readString('VersionInfo', 'CompanyName', '');
      v.fileVersion = f.readString('VersionInfo', 'FileVersion', '0.1');
      v.fileDescription = f.readString('VersionInfo', 'FileDescription', 'Developed using the Dev-C++ IDE');
      v.internalName = f.readString('VersionInfo', 'InternalName', '');
      v.legalCopyright = f.readString('VersionInfo', 'LegalCopyright', '');
      v.legalTrademarks = f.readString('VersionInfo', 'LegalTrademarks', '');
      v.originalFilename = f.readString('VersionInfo', 'OriginalFilename', basename(this.executable));
      v.productName = f.readString('VersionInfo', 'ProductName', this.name);
      v.productVersion = f.readString('VersionInfo', 'ProductVersion', '0.1.1.1');
      v.autoIncBuildNr = f.readBool('VersionInfo', 'AutoIncBuildNr', false);
      v.syncProduct = f.readBool('VersionInfo', 'SyncProduct', false);
    } else {
      o.ver = -1;
      if (!f.readBool('Project', 'NoConsole', true)) o.type = 'console';
      else if (f.readBool('Project', 'IsDLL', false)) o.type = 'dll';
      else o.type = 'gui';
      o.compilerCmd = f.readString('Project', 'CompilerOptions', '');
      o.useGPP = f.readBool('Project', 'Use_GPP', false);
    }
  }

  saveOptions() {
    this.ini.writeInteger('Project', 'UnitCount', this.units.length);
    this.units.forEach((unit, index) => {
      const section = 'Unit' + (index + 1);
      this.ini.writeString(section, 'FileName', relativePath(this.fileName, unit.fileName));
      this.ini.writeString(section, 'Folder', unit.folder);
      this.ini.writeBool(section, 'Compile', unit.compile);
      this.ini.writeBool(section, 'CompileCpp', unit.compileCpp);
      this.ini.writeBool(section, 'Link', unit.link);
      this.ini.writeInteger(section, 'Priority', unit.priority);
      this.ini.writeBool(section, 'OverrideBuildCmd', unit.overrideBuildCmd);
      this.ini.writeString(section, 'BuildCmd', unit.buildCmd);
    });
    const f = this.ini;
    const o = this.options;
    f.writeString('Project', 'FileName', relativePath(this.fileName, this.fileName));
    f.writeString('Project', 'Name', this.name);
    f.writeInteger('Project', 'Type', PROJ_TYPES.indexOf(o.type));
    f.writeInteger('Project', 'Ver', 2);
    f.writeString('Project', 'ObjFiles', o.objFiles.join(';'));
    f.writeString('Project', 'Includes', o.includes.join(';'));
    f.writeString('Project', 'Libs', o.libs.join(';'));
    f.writeString('Project', 'PrivateResource', o.privateResource);
    f.writeString('Project', 'ResourceIncludes', o.resourceIncludes.join(';'));
    f.writeString('Project', 'MakeIncludes', o.makeIncludes.join(';'));
    f.writeString('Project', 'Compiler', o.compilerCmd);
    f.writeString('Project', 'CppCompiler', o.cppCompilerCmd);
    f.writeString('Project', 'Linker', o.linkerCmd);
    f.writeBool('Project', 'IsCpp', o.useGPP);
    f.writeString('Project', 'Icon', o.icon ? relativePath(this.fileName, o.icon) : '');
    f.writeString('Project', 'ExeOutput', o.exeOutput);
    f.writeString('Project', 'ObjectOutput', o.objectOutput);
    f.writeString('Project', 'LogOutput', o.logOutput);
    f.writeBool('Project', 'LogOutputEnabled', o.logOutputEnabled);
    f.writeBool('Project', 'OverrideOutput', o.overrideOutput);
    f.writeString('Project', 'OverrideOutputName', o.overridenOutput);
    f.writeString('Project', 'HostApplication', o.hostApplication);
    f.writeBool('Project', 'UseCustomMakefile', o.useCustomMakefile);
    f.writeString('Project', 'CustomMakefile', o.customMakefile);
    f.writeString('Project', 'CommandLine', o.cmdLineArgs);
    f.writeString('Project', 'Folders', this.folders.join(','));
    f.writeBool('Project', 'IncludeVersionInfo', o.includeVersionInfo);
    f.writeBool('Project', 'SupportXPThemes', o.supportXPThemes);
    f.writeInteger('Project', 'CompilerSet', o.compilerSet);
    f.writeString('Project', 'CompilerSettings', o.compilerOptions);
    const v = o.versionInfo;
    f.writeInteger('VersionInfo', 'Major', v.major);
    f.writeInteger('VersionInfo', 'Minor', v.minor);
    f.writeInteger('VersionInfo', 'Release', v.release);
    f.writeInteger('VersionInfo', 'Build', v.build);
    f.writeInteger('VersionInfo', 'LanguageID', v.languageID);
    f.writeInteger('VersionInfo', 'CharsetID', v.charsetID);
    f.writeString('VersionInfo', 'CompanyName', v.companyName);
    f.writeString('VersionInfo', 'FileVersion', v.fileVersion);
    f.writeString('VersionInfo', 'FileDescription', v.fileDescription);
    f.writeString('VersionInfo', 'InternalName', v.internalName);
    f.writeString('VersionInfo', 'LegalCopyright', v.legalCopyright);
    f.writeString('VersionInfo', 'LegalTrademarks', v.legalTrademarks);
    f.writeString('VersionInfo', 'OriginalFilename', v.originalFilename);
    f.writeString('VersionInfo', 'ProductName', v.productName);
    f.writeString('VersionInfo', 'ProductVersion', v.productVersion);
    f.writeBool('VersionInfo', 'AutoIncBuildNr', v.autoIncBuildNr);
    f.writeBool('VersionInfo', 'SyncProduct', v.syncProduct);
    vfs.write(this.fileName, this.ini.toString());
  }

  async saveUnits(): Promise<boolean> {
    let count = 0;
    for (let idx = 0; idx < this.units.length; idx++) {
      const u = this.units[idx];
      if (!(await u.save())) return false;
      if (u.editor && !u.editor.isNew) {
        u.fileName = u.editor.fileName;
        u.isNew = false;
      }
      const sec = 'Unit' + (idx + 1);
      if (!(u.isNew && u.modified)) {
        this.ini.writeString('Unit' + (count + 1), 'FileName', relativePath(this.fileName, u.fileName));
        count++;
      }
      const typ = getFileTyp(u.fileName);
      if (['cHead', 'cppHead', 'cSrc', 'cppSrc'].includes(typ)) this.ini.writeBool(sec, 'CompileCpp', u.compileCpp);
      else if (typ === 'resSrc' && !u.folder) u.folder = 'Resources';
      this.ini.writeString(sec, 'Folder', u.folder);
      this.ini.writeBool(sec, 'Compile', u.compile);
      this.ini.writeBool(sec, 'Link', u.link);
      this.ini.writeInteger(sec, 'Priority', u.priority);
      this.ini.writeBool(sec, 'OverrideBuildCmd', u.overrideBuildCmd);
      this.ini.writeString(sec, 'BuildCmd', u.buildCmd);
    }
    this.ini.writeInteger('Project', 'UnitCount', count);
    return true;
  }

  async saveAll() {
    if (!(await this.saveUnits())) return false;
    this.saveOptions();
    this.saveLayout();
    this.modified = false;
    return true;
  }

  // ---------------------------------------------------------------- open

  open() {
    this.loadOptions();
    const uCount = this.ini.readInteger('Project', 'UnitCount', 0);
    for (let i = 0; i < uCount; i++) {
      const sec = 'Unit' + (i + 1);
      const u = new ProjUnit();
      u.fileName = expandFileTo(this.ini.readString(sec, 'FileName', ''), this.directory);
      if (!vfs.fileExists(u.fileName)) {
        void MessageBox(format(lang(L.ID_ERR_FILENOTFOUND), [u.fileName]), 'Error', MB_ICONERROR);
        this._modified = true;
        continue;
      }
      u.fileName = vfs.realPath(u.fileName);
      u.folder = this.ini.readString(sec, 'Folder', '');
      u.compile = this.ini.readBool(sec, 'Compile', true);
      u.compileCpp = this.ini.readString(sec, 'CompileCpp', '2') === '2' ? this.options.useGPP : this.ini.readBool(sec, 'CompileCpp', false);
      u.link = this.ini.readBool(sec, 'Link', true);
      u.priority = this.ini.readInteger(sec, 'Priority', 1000);
      u.overrideBuildCmd = this.ini.readBool(sec, 'OverrideBuildCmd', false);
      u.buildCmd = this.ini.readString(sec, 'BuildCmd', '');
      u.isNew = false;
      this.units.push(u);
    }
    for (const f of this.folders) this.expanded.add(f);
  }

  /** opens editors according to the "AutoOpen" preference */
  openEditors() {
    switch (devData.AutoOpen) {
      case 0:
        this.units.forEach((_, i) => this.openUnit(i));
        if (this.units[0]?.editor) ide.activate(this.units[0].editor);
        break;
      case 1:
        if (this.units.length) {
          const e = this.openUnit(0);
          if (e) ide.activate(e);
        }
        break;
      case 2:
        this.loadLayout();
        break;
    }
  }

  private layoutFile() {
    return changeExt(this.fileName, '.layout');
  }

  loadLayout() {
    const f = vfs.fileExists(this.layoutFile()) ? new IniFile(vfs.readText(this.layoutFile())) : new IniFile();
    const focused = f.readInteger('Editors', 'Focused', -1);
    const order = parseDelimited(f.readString('Editors', 'Order', ''), ',').map((s) => parseInt(s, 10));
    for (const i of order) if (!Number.isNaN(i)) this.openUnit(i);
    if (focused >= 0 && focused < this.units.length && this.units[focused].editor) ide.activate(this.units[focused].editor!);
  }

  loadUnitLayout(e: Editor, index: number) {
    if (!vfs.fileExists(this.layoutFile())) return;
    const f = new IniFile(vfs.readText(this.layoutFile()));
    const row = f.readInteger('Editor_' + index, 'CursorRow', 1);
    const col = f.readInteger('Editor_' + index, 'CursorCol', 1);
    const doc = e.view.state.doc;
    const l = doc.line(Math.max(1, Math.min(row, doc.lines)));
    e.view.dispatch({ selection: { anchor: Math.min(l.to, l.from + col - 1) }, scrollIntoView: true });
  }

  saveLayout() {
    const f = vfs.fileExists(this.layoutFile()) ? new IniFile(vfs.readText(this.layoutFile())) : new IniFile();
    const order: number[] = [];
    for (const e of ide.allEditors) if (e.inProject) order.push(this.unitIndexOfEditor(e));
    f.writeString('Editors', 'Order', order.join(','));
    const active = ide.activeLeft;
    if (active) f.writeInteger('Editors', 'Focused', this.unitIndexOfEditor(active));
    this.units.forEach((u, i) => {
      if (u.editor) {
        f.writeInteger('Editor_' + i, 'CursorCol', u.editor.caretChar);
        f.writeInteger('Editor_' + i, 'CursorRow', u.editor.caretLine);
        f.writeInteger('Editor_' + i, 'TopLine', 1);
        f.writeInteger('Editor_' + i, 'LeftChar', 1);
      }
    });
    try {
      vfs.write(this.layoutFile(), f.toString());
    } catch {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------- units

  unitIndexOfEditor(e: Editor) {
    return this.units.findIndex((u) => u.editor === e);
  }

  unitIndexOfFile(f: string) {
    const k = normalize(f).toLowerCase();
    return this.units.findIndex((u) => normalize(u.fileName).toLowerCase() === k);
  }

  unitFromString(s: string) {
    return this.unitIndexOfFile(expandFileTo(s, this.directory));
  }

  fileAlreadyExists(s: string) {
    return this.unitIndexOfFile(s) > -1;
  }

  openUnit(index: number): Editor | null {
    const u = this.units[index];
    if (!u || !u.fileName) return null;
    if (u.editor) return u.editor;
    const e = ide.newEditor(u.fileName, true, u.isNew);
    u.editor = e;
    this.loadUnitLayout(e, index);
    return e;
  }

  closeUnit(index: number) {
    const u = this.units[index];
    if (u?.editor) {
      const e = u.editor;
      u.editor = null;
      ide.forceCloseEditor(e);
    }
  }

  newUnit(folder: string, customFileName = ''): number {
    const u = new ProjUnit();
    let s: string;
    if (!customFileName) {
      do s = joinPath(this.directory, lang(L.ID_UNTITLED) + ++ide.untitledCount);
      while (this.fileAlreadyExists(s));
    } else s = /[\\/]/.test(customFileName) ? customFileName : joinPath(this.directory, customFileName);
    u.fileName = s;
    u.isNew = true;
    u.folder = folder;
    u.compile = true;
    u.compileCpp = /\.(cpp|cc|cxx|c\+\+|cp)$/i.test(s) || this.options.useGPP;
    u.link = true;
    u.modified = true;
    this.units.push(u);
    this.modified = true;
    return this.units.length - 1;
  }

  async addUnit(fileName: string, folder: string): Promise<ProjUnit | null> {
    if (this.fileAlreadyExists(fileName)) {
      await MessageDlg(format(lang(L.ID_MSG_FILEINPROJECT), [fileName, this.fileName]) + '\r\n' + lang(L.ID_SPECIFY), 'mtError', ['mbOK']);
      return null;
    }
    const u = new ProjUnit();
    u.fileName = vfs.realPath(fileName);
    u.isNew = false;
    u.folder = folder;
    const typ = getFileTyp(fileName);
    if (['cSrc', 'cppSrc', 'cHead', 'cppHead'].includes(typ)) {
      u.compile = true;
      u.compileCpp = this.options.useGPP;
      u.link = true;
    } else if (typ === 'resSrc') {
      u.compile = true;
      u.compileCpp = this.options.useGPP;
      u.link = false;
    } else {
      u.compile = false;
      u.compileCpp = false;
      u.link = false;
    }
    // an already opened editor becomes a project editor
    const open = ide.fileIsOpen(fileName);
    if (open) {
      open.inProject = true;
      u.editor = open;
    }
    this.units.push(u);
    this.modified = true;
    return u;
  }

  async removeEditor(index: number, doClose: boolean): Promise<boolean> {
    const u = this.units[index];
    if (!u) return false;
    if (doClose && u.editor) {
      if (!(await ide.closeEditor(u.editor))) return false;
    } else if (u.editor) u.editor.inProject = false;
    this.ini.eraseSection('Unit' + (index + 1));
    this.units.splice(index, 1);
    this.modified = true;
    return true;
  }

  saveUnitAs(i: number, newName: string) {
    const u = this.units[i];
    if (!u) return;
    u.fileName = newName;
    u.isNew = false;
    this.ini.writeString('Unit' + (i + 1), 'FileName', relativePath(this.fileName, newName));
    this.modified = true;
  }

  // ---------------------------------------------------------------- folders

  addFolder(s: string) {
    if (!this.folders.includes(s)) {
      this.folders.push(s);
      this.folders.sort((a, b) => a.localeCompare(b));
      this.expanded.add(s);
      this.modified = true;
    }
  }

  removeFolder(path: string) {
    this.folders = this.folders.filter((f) => f !== path && !f.startsWith(path + '/'));
    for (const u of this.units) if (u.folder === path || u.folder.startsWith(path + '/')) u.folder = '';
    this.modified = true;
  }

  renameFolder(path: string, newName: string) {
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
    const np = parent + newName;
    this.folders = this.folders.map((f) => (f === path ? np : f.startsWith(path + '/') ? np + f.slice(path.length) : f));
    for (const u of this.units) {
      if (u.folder === path) u.folder = np;
      else if (u.folder.startsWith(path + '/')) u.folder = np + u.folder.slice(path.length);
    }
    this.modified = true;
  }

  // ---------------------------------------------------------------- templates

  /** TProject.AssignTemplate */
  assignTemplate(fileName: string, tpl: Template): boolean {
    try {
      if (tpl.version === -1) {
        this.name = format(lang(L.ID_NEWPROJECT), [++ide.projectCount]);
        this.newUnit('');
        const u = this.units[this.units.length - 1];
        u.editor = ide.newEditor(u.fileName, true, true);
        ide.activate(u.editor);
        return true;
      }
      this.name = tpl.name;
      this.options = { ...defaultProjOptions(), ...tpl.options, versionInfo: { ...defaultProjOptions().versionInfo } };
      if (this.options.icon) {
        const dest = changeExt(this.fileName, '.ico');
        this.options.icon = dest;
      }
      tpl.units.forEach((tu) => {
        const text = this.options.useGPP ? tu.cppText : tu.cText;
        const name = this.options.useGPP ? tu.cppName : tu.cName;
        this.newUnit('', name);
        const u = this.units[this.units.length - 1];
        const e = ide.newEditor(u.fileName, true, true);
        u.editor = e;
        if (text) e.text = text.replace(/\r\n/g, '\n').replace(/#13#10/g, '\n');
        e.setModified(true);
        ide.activate(e, false);
      });
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  // ---------------------------------------------------------------- makefile

  makefileText(c: import('../../compiler/Compiler').Compiler): string {
    const o = this.options;
    const lines: string[] = [];
    const rel = (f: string) => relativePath(this.fileName, f).replace(/\\/g, '/');
    lines.push('# Project: ' + this.name);
    lines.push('# Makefile created by Dev-C++ ' + DEVCPP_VERSION);
    lines.push('');
    if (c.checkSyntax) {
      lines.push('# This Makefile is written for syntax check!');
      lines.push('# Regenerate it if you want to use this Makefile to build.');
      lines.push('');
    }
    const objs: string[] = [];
    const linkObjs: string[] = [];
    for (const u of this.units) {
      if (!u.compile && !u.link) continue;
      const typ = getFileTyp(u.fileName);
      if (['cHead', 'cppHead', 'resSrc'].includes(typ)) continue;
      const obj = o.objectOutput ? rel(joinPath(joinPath(this.directory, o.objectOutput), changeExt(basename(u.fileName), OBJ_EXT))) : rel(changeExt(u.fileName, OBJ_EXT));
      objs.push(obj);
      if (u.link) linkObjs.push(obj);
    }
    const g3 = / -g3|^-g3/.test(c.compileParams);
    const set = c.compilerSet;
    lines.push(`CPP      = ${set.gppName}${g3 ? ' -D__DEBUG__' : ''}`);
    lines.push(`CC       = ${set.gccName}${g3 ? ' -D__DEBUG__' : ''}`);
    lines.push(`WINDRES  = ${set.windresName}`);
    lines.push(`OBJ      = ${objs.join(' ')}`);
    lines.push(`LINKOBJ  = ${linkObjs.join(' ')}`);
    lines.push(`LIBS     = ${c.librariesParams.replace(/\\/g, '/')}`);
    lines.push(`INCS     = ${c.includesParams.replace(/\\/g, '/')}`);
    lines.push(`CXXINCS  = ${c.cppIncludesParams.replace(/\\/g, '/')}`);
    lines.push(`BIN      = ${rel(this.executable).replace(/ /g, '\\ ')}`);
    lines.push(`CXXFLAGS = $(CXXINCS) ${c.cppCompileParams}`);
    lines.push(`CFLAGS   = $(INCS) ${c.compileParams}`);
    lines.push('RM       = rm.exe -f');
    lines.push('');
    lines.push(c.checkSyntax ? '.PHONY: all all-before all-after clean clean-custom $(OBJ) $(BIN)' : '.PHONY: all all-before all-after clean clean-custom');
    lines.push('');
    lines.push('all: all-before $(BIN) all-after');
    lines.push('');
    for (const i of o.makeIncludes) lines.push('include ' + i);
    if (o.makeIncludes.length) lines.push('');
    lines.push('clean: clean-custom');
    lines.push('\t${RM} $(OBJ) $(BIN)');
    lines.push('');
    if (o.type === 'static') {
      lines.push('$(BIN): $(LINKOBJ)');
      if (!c.checkSyntax) {
        lines.push('\tar r $(BIN) $(LINKOBJ)');
        lines.push('\tranlib $(BIN)');
      }
    } else {
      lines.push('$(BIN): $(OBJ)');
      if (!c.checkSyntax) lines.push(`\t${o.useGPP ? '$(CPP)' : '$(CC)'} $(LINKOBJ) -o $(BIN) $(LIBS)`);
    }
    for (const u of this.units) {
      if (!u.compile) continue;
      const typ = getFileTyp(u.fileName);
      if (!['cSrc', 'cppSrc'].includes(typ)) continue;
      const short = rel(u.fileName);
      const obj = o.objectOutput ? rel(joinPath(joinPath(this.directory, o.objectOutput), changeExt(basename(u.fileName), OBJ_EXT))) : rel(changeExt(u.fileName, OBJ_EXT));
      lines.push('');
      lines.push(`${obj}: ${short}`);
      if (u.overrideBuildCmd && u.buildCmd) lines.push('\t' + u.buildCmd.replace(/<CRTAB>/g, '\n\t'));
      else if (c.checkSyntax) lines.push(`\t${u.compileCpp ? '$(CPP)' : '$(CC)'} -c ${short} ${u.compileCpp ? '$(CXXFLAGS)' : '$(CFLAGS)'}`);
      else lines.push(`\t${u.compileCpp ? '$(CPP)' : '$(CC)'} -c ${short} -o ${obj} ${u.compileCpp ? '$(CXXFLAGS)' : '$(CFLAGS)'}`);
    }
    return lines.join('\n') + '\n';
  }

  saveToLog() {
    if (!this.options.logOutputEnabled || !this.options.logOutput) return;
    try {
      vfs.write(expandFileTo(this.options.logOutput, this.directory), ide.logRaw.join('\r\n'));
    } catch {
      /* ignore */
    }
  }

  incrementBuildNumber() {
    const v = this.options.versionInfo;
    v.build++;
    v.fileVersion = `${v.major}.${v.minor}.${v.release}.${v.build}`;
    if (v.syncProduct) v.productVersion = v.fileVersion;
    this.modified = true;
  }

  buildPrivateResource() {
    /* resources are not compiled in the browser */
  }
}
