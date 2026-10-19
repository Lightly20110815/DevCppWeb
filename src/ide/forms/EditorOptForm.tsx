import dfm from '../../generated/forms/EditorOptFrm.json';
import { showForm } from '../../vcl/VclForm';
import type { DfmNode } from '../../vcl/FormCtl';
import { devEditor, settings, COLOR_PRESETS, SYN_ATTRS, SPECIAL_ATTRS, presetSyntax, presetHighColor, saveSettings } from '../config';
import { bindChecks, localize } from './formUtils';
import { delphiColor, toDelphiColor } from '../colors';
import { ide } from '../ide';
import { InputQuery } from '../../os/messagebox';
import { configureAutosave } from '../editorHooks';
import { screenFonts, editorFontStack, fontSizePixels } from '../fonts';
import { FontSupport } from './FontSupport';

export async function showEditorOptions() {
  const editor = structuredClone(devEditor), completion = structuredClone(settings.codeCompletion), inserts = structuredClone(settings.codeInserts);
  const fonts = screenFonts();
  const dialog = showForm(dfm as DfmNode, (c) => {
    localize(c, 'EditorOptFrm');
    // Leave a separate column for the tab-size controls. The Chinese Smart Tabs
    // caption needs two lines instead of the original English single-line box.
    c.set('cbUseTabs', { width: 155 });
    c.set('cbSmartTabs', { width: 155, height: 36, wordWrap: true });
    c.set('lblTabSize', { top: 20 });
    c.set('seTabSize', { top: 46 });
    const saveChecks = bindChecks(c, editor, { cbAutoIndent: 'AutoIndent', cbAddIndent: 'AddIndent', cbInsertMode: 'InsertMode', cbUseTabs: 'UseTabs', cbSmartTabs: 'SmartTabs', cbGroupUndo: 'GroupUndo', cbDropFiles: 'InsDropFiles', cbSpecialChars: 'SpecialChar', cbEHomeKey: 'EHomeKey', cbPastEOF: 'PastEOF', cbPastEOL: 'PastEOL', cbFindText: 'FindText', cbHalfPage: 'HalfPage', cbScrollHint: 'ShowScrollHint', cbParserHints: 'ParserHints', cbFunctionHint: 'ShowFunctionTip', cbTrimTrailingSpaces: 'TrimTrailingSpaces', cbMatch: 'Match', cbMarginVis: 'MarginVis', cbSyntaxHighlight: 'UseSyntax', cbHighCurrLine: 'HighCurrLine', cbGutterVis: 'ShowGutter', cbGutterAuto: 'GutterAuto', cbGutterFnt: 'CustomGutter', cbLineNum: 'LineNumbers', cbFirstZero: 'FirstIsZero', cbLeadZero: 'LeadZero', cbAutoSave: 'EnableAutoSave', cbSymbolComplete: 'CompleteSymbols', cbBraces: 'BraceComplete', cbParenth: 'ParentheseComplete', cbInclude: 'IncludeComplete', cbArray: 'ArrayComplete', cbComments: 'CommentComplete', cbSingleQuotes: 'SingleQuoteComplete', cbDoubleQuotes: 'DoubleQuoteComplete', cbDeleteCompleted: 'DeleteSymbolPairs', cbDefaultCode: 'DefaultCode' });
    const saveCompletion = bindChecks(c, completion, { chkEnableCompletion: 'Enabled', chkCBParseLocalH: 'ParseLocalHeaders', chkCBParseGlobalH: 'ParseGlobalHeaders' });
    const numeric = { edMarginWidth: 'MarginSize', seTabSize: 'TabSize', edEditorSize: 'FontSize', edGutterSize: 'GutterFontSize', edGutterWidth: 'GutterSize' } as const;
    for (const [field, key] of Object.entries(numeric)) c.value(field, editor[key]);
    c.set('cboEditorFont', { items: fonts, text: editor.FontName, itemIndex: fonts.indexOf(editor.FontName) }); c.set('cboGutterFont', { items: fonts, text: editor.GutterFontName, itemIndex: fonts.indexOf(editor.GutterFontName) });
    c.extra.grpEditorFont = <FontSupport ctl={c} />;
    const previewFont = () => {
      for (const control of ['CppEdit', 'CodeIns', 'seDefault']) c.set(control, { fontName: editorFontStack(c.text('cboEditorFont')), fontSize: fontSizePixels(c.value('edEditorSize')) });
    };
    c.handlers.cboEditorFontChange = () => {
      if (!c.checked('cbGutterFnt')) c.text('cboGutterFont', c.text('cboEditorFont'));
      previewFont();
    };
    c.handlers.edEditorSizeChange = () => {
      if (!c.checked('cbGutterFnt')) c.value('edGutterSize', c.value('edEditorSize'));
      previewFont();
    };
    c.itemIndex('cboInsertCaret', editor.InsertCaret); c.itemIndex('cboOverwriteCaret', editor.OverwriteCaret);
    c.set('cboQuickColor', { items: COLOR_PRESETS, itemIndex: COLOR_PRESETS.indexOf(editor.ColorPreset) });
    c.text('edSyntaxExt', editor.SyntaxExt);
    c.set('cpMarginColor', { colorValue: delphiColor(editor.MarginColor) ?? undefined }); c.set('cpHighColor', { colorValue: delphiColor(editor.HighColor) ?? undefined });
    c.set('cpCompletionBackground', { colorValue: delphiColor(completion.BackColor) ?? undefined });
    c.set('tbCompletionDelay', { position: completion.Delay }); c.set('MinutesDelay', { position: editor.Interval });
    c.itemIndex('FileOptions', editor.AutoSaveFilter); c.itemIndex('NameOptions', editor.AutoSaveMode);
    c.lines('seDefault', editor.DefaultCodeText.split('\n'));
    const attributes = [...SYN_ATTRS, ...SPECIAL_ATTRS.map(([name]) => name)];
    c.set('ElementList', { items: attributes, itemIndex: 0 });
    const loadColor = () => {
      const value = (editor.Syntax[attributes[c.itemIndex('ElementList')]] ?? 'clBlack, clNone, 0, 0, 0').split(',').map((v) => v.trim());
      c.set('cpForeground', { colorValue: delphiColor(value[0]) ?? undefined }); c.set('cpBackground', { colorValue: delphiColor(value[1]) ?? undefined });
      c.checked('cbBold', value[2] === '1'); c.checked('cbItalic', value[3] === '1'); c.checked('cbUnderlined', value[4] === '1');
    };
    c.handlers.ElementListClick = loadColor;
    c.handlers.StyleChange = () => { editor.Syntax[attributes[c.itemIndex('ElementList')]] = [toDelphiColor(c.get('cpForeground').colorValue ?? null), toDelphiColor(c.get('cpBackground').colorValue ?? null), +c.checked('cbBold'), +c.checked('cbItalic'), +c.checked('cbUnderlined')].join(', '); };
    c.handlers.cboQuickColorSelect = () => { const index = c.itemIndex('cboQuickColor'); editor.Syntax = presetSyntax(index); editor.ColorPreset = COLOR_PRESETS[index]; c.set('cpHighColor', { colorValue: delphiColor(presetHighColor(editor.ColorPreset)) ?? undefined }); loadColor(); };
    let insertIndex = 0;
    const storeInsert = () => { if (inserts[insertIndex]) inserts[insertIndex].code = c.lines('CodeIns').join('\n'); };
    const updateInserts = () => { c.set('lvCodeIns', { grid: [['Name', 'Description'], ...inserts.map((s) => [s.caption, s.desc])], selIndex: insertIndex + 1, data: { editable: (r: number) => r > 0, colWidths: [160, 300] } }); c.lines('CodeIns', (inserts[insertIndex]?.code ?? '').split('\n')); };
    c.handlers.lvCodeInsSelectCell = (_n, row: number) => { storeInsert(); insertIndex = row - 1; c.lines('CodeIns', (inserts[insertIndex]?.code ?? '').split('\n')); };
    c.handlers.btnAddClick = async () => { const name = await InputQuery('Code insertion', 'Name:', ''); if (name) { storeInsert(); inserts.push({ caption: name, desc: name, sep: 0, code: '' }); insertIndex = inserts.length - 1; updateInserts(); } };
    c.handlers.btnRemoveClick = () => { inserts.splice(insertIndex, 1); insertIndex = Math.max(0, insertIndex - 1); updateInserts(); };
    const enable = () => {
      c.enabled('OptionsGroup', c.checked('cbAutoSave')); c.enabled('grpSpecific', c.checked('cbSymbolComplete'));
      c.enabled('cpHighColor', c.checked('cbHighCurrLine')); c.enabled('cboGutterFont', c.checked('cbGutterFnt'));
    };
    for (const name of ['cbAutoSaveClick', 'cbSymbolCompleteClick', 'cbHighCurrLineClick', 'cbGutterFntClick']) c.handlers[name] = enable;
    c.handlers.btnOkClick = () => {
      saveChecks(); saveCompletion(); storeInsert();
      const rows = c.get('lvCodeIns').grid ?? [];
      inserts.forEach((s, i) => { s.caption = rows[i + 1]?.[0] ?? s.caption; s.desc = rows[i + 1]?.[1] ?? s.desc; });
      for (const [field, key] of Object.entries(numeric)) editor[key] = Math.max(1, c.value(field));
      editor.FontName = c.text('cboEditorFont'); editor.GutterFontName = c.text('cboGutterFont');
      editor.InsertCaret = c.itemIndex('cboInsertCaret'); editor.OverwriteCaret = c.itemIndex('cboOverwriteCaret'); editor.SyntaxExt = c.text('edSyntaxExt');
      editor.MarginColor = toDelphiColor(c.get('cpMarginColor').colorValue ?? null); editor.HighColor = toDelphiColor(c.get('cpHighColor').colorValue ?? null);
      completion.BackColor = toDelphiColor(c.get('cpCompletionBackground').colorValue ?? null); completion.Delay = c.get('tbCompletionDelay').position ?? 180;
      editor.Interval = c.get('MinutesDelay').position ?? 10; editor.AutoSaveFilter = c.itemIndex('FileOptions'); editor.AutoSaveMode = c.itemIndex('NameOptions');
      editor.DefaultCodeText = c.lines('seDefault').join('\n');
    };
    c.set('CppEdit', { readOnly: true }); loadColor(); updateInserts(); enable(); previewFont();
  });
  if (await dialog === 1) {
    Object.assign(devEditor, editor); Object.assign(settings.codeCompletion, completion); settings.codeInserts = inserts;
    saveSettings(); for (const e of ide.allEditors) e.applySettings(); configureAutosave(); ide.changed();
  }
}
