// LangFrm.pas: "Dev-C++ first time configuration".
import dfm from '../../generated/forms/LangFrm.json';
import { showForm } from '../../vcl/VclForm';
import type { DfmNode } from '../../vcl/FormCtl';
import { FormCtl, mrOk } from '../../vcl/FormCtl';
import { Lang, lang } from '../../lang/lang';
import * as L from '../../generated/langIds';
import { devData, devEditor, presetSyntax, presetHighColor, COLOR_PRESETS, saveSettings } from '../config';
import { ICON_THEMES, setIconTheme } from '../../os/images';
import { screenFonts, defaultEditorFont, editorFontStack } from '../fonts';
import { EditorMount, previewEditor } from './EditorMount';
import { iconUrl } from '../../os/images';

export async function showLangForm(): Promise<void> {
  const def = dfm as unknown as DfmNode;
  const example = previewEditor(['#include <iostream>', '', 'int main(int argc, char** argv) {', '\tstd::cout << "Hello world!\\n";', '\treturn 0;', '}'].join('\n'));
  let step = 0;
  const fonts = screenFonts();
  const applyEditor = () => example.applySettings();

  const loadText = (c: FormCtl) => {
    c.caption('grpThemes', lang(L.ID_LANGFORM_SELECTTHEME));
    c.caption('lblFont', lang(L.ID_LANGFORM_FONT));
    c.caption('lblColor', lang(L.ID_LANGFORM_COLOR));
    c.caption('lblIcons', lang(L.ID_LANGFORM_ICONS));
    c.caption('lblEditInfo', lang(L.ID_LANGFORM_THEMCHANGEHINT));
    c.caption('Finish1', lang(L.ID_LANGFORM_FINISH1));
    c.caption('Finish2', lang(L.ID_LANGFORM_FINISH2));
    c.caption('Finish3', lang(L.ID_LANGFORM_FINISH3));
    c.caption('OkBtn', lang(L.ID_LANGFORM_NEXT));
  };

  const p = showForm(
    def,
    (c) => {
      c.set('synExample', { render: () => <EditorMount editor={example} className="synexample" /> });
      // languages
      const list = Lang.langList;
      c.items('lbLanguages', list.map((l) => l.name));
      c.set('lbLanguages', { itemIndex: Math.max(0, list.findIndex((l) => /^english/i.test(l.name))) });
      // themes
      c.items('cmbIcons', ICON_THEMES);
      c.itemIndex('cmbIcons', 0);
      c.items('cmbColors', COLOR_PRESETS.slice(0, 10));
      c.itemIndex('cmbColors', 1);
      c.items('cmbFont', fonts);
      c.itemIndex('cmbFont', Math.max(0, fonts.indexOf(defaultEditorFont())));
      c.set('cmbFont', {
        data: {
          itemHeight: 30,
          renderItem: (i: number) => (
            <span style={{ fontFamily: editorFontStack(fonts[i]), fontSize: 13, display: 'block', width: '100%', textAlign: 'center', lineHeight: '28px' }}>{fonts[i]}</span>
          ),
        },
      });
      c.set('tbExample', { data: { imageList: 'menu' } });
      // initial editor style: Classic Plus
      devEditor.Syntax = presetSyntax(1);
      devEditor.ColorPreset = 'Classic Plus';
      devEditor.HighColor = '$FFFFCC';
      devEditor.FontName = fonts[c.itemIndex('cmbFont')];
      devEditor.GutterFontName = devEditor.FontName;
      applyEditor();
      setTimeout(() => {
        // caret like synExample.CaretXY := BufferCoord(11, 5)
        example.setCaretPosAndActivate(5, 11);
        example.view.contentDOM.blur();
      }, 0);
      c.handlers = {
        ...c.handlers,
        OkBtnClick: async () => {
          if (step === 0) {
            step = 1;
            c.visible('LangPanel', false);
            const i = c.itemIndex('lbLanguages');
            const file = i >= 0 ? list[i].file : 'English.lng';
            await Lang.open(file);
            devData.Language = file;
            loadText(c);
            c.visible('EditPanel', true);
            return false;
          } else if (step === 1) {
            step = 2;
            c.visible('EditPanel', false);
            c.visible('FinishPanel', true);
            devData.ThemeChange = true;
            devData.Theme = ICON_THEMES[c.itemIndex('cmbIcons')] ?? 'New Look';
            // OkBtn.Kind := bkOK
            c.set('OkBtn', { caption: 'OK', data: { modalResult: mrOk } });
            const node = c.node('OkBtn')!;
            node.props = { ...node.props, Kind: 'bkOK', 'Glyph.Data': undefined };
            return false;
          }
        },
        ColorChange: () => {
          const name = COLOR_PRESETS[c.itemIndex('cmbColors')];
          devEditor.Syntax = presetSyntax(c.itemIndex('cmbColors'));
          devEditor.ColorPreset = name;
          devEditor.HighColor = presetHighColor(name);
          applyEditor();
        },
        FontChange: () => {
          devEditor.FontName = fonts[c.itemIndex('cmbFont')];
          devEditor.GutterFontName = devEditor.FontName;
          applyEditor();
        },
        cmbIconsChange: () => {
          setIconTheme(ICON_THEMES[c.itemIndex('cmbIcons')]);
        },
      };
    },
    { icon: iconUrl('icons/devcpp_16.png'), owner: undefined, appId: 'devcpp', focus: 'lbLanguages' },
  );
  // the dialog has no close button (BorderIcons = [])
  await p;
  devData.First = false;
  setIconTheme(devData.Theme);
  saveSettings();
  example.destroy();
}
