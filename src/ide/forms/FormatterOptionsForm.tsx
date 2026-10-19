import dfm from '../../generated/forms/FormatterOptionsFrm.json';
import { showForm } from '../../vcl/VclForm';
import type { DfmNode } from '../../vcl/FormCtl';
import { settings, saveSettings } from '../config';
import { bindChecks, localize } from './formUtils';
import { formatCode, formatterCommand } from '../formatter';

export async function showFormatterOptions() {
  const options = structuredClone(settings.formatter);
  let revision = 0;
  const dialog = showForm(dfm as DfmNode, (c) => {
    localize(c, 'FormatterOptionsFrm');
    const saveChecks = bindChecks(c, options, { chkClasses: 'IndentClasses', chkSwitches: 'IndentSwitches', chkNamespace: 'IndentNamespaces', chkCases: 'IndentCases', chkLabels: 'IndentLabels', chkPreprocessor: 'IndentPreprocessor', chkMaxLineLength: 'ModifyMaxLineLength' });
    c.itemIndex('cmbBracketStyle', options.BracketStyle); c.itemIndex('cmbIndentStyle', options.IndentStyle);
    c.value('spinTabWidth', options.TabWidth); c.value('spinMaxLineLength', options.MaxLineLength);
    c.lines('memFullCommand', [options.CustomCommand || formatterCommand(options)]);
    const example = c.lines('synExample').join('\n');
    c.set('synExample', { readOnly: true });
    const preview = async () => {
      const version = ++revision;
      try { const text = await formatCode(example, c.lines('memFullCommand').join(' ')); if (version === revision) c.lines('synExample', text.split('\n')); }
      catch (error) { if (version === revision) c.lines('synExample', [String((error as Error).message)]); }
    };
    const read = () => { saveChecks(); options.BracketStyle = c.itemIndex('cmbBracketStyle'); options.IndentStyle = c.itemIndex('cmbIndentStyle'); options.TabWidth = c.value('spinTabWidth'); options.MaxLineLength = c.value('spinMaxLineLength'); };
    c.handlers.OptionChange = () => { read(); c.lines('memFullCommand', [formatterCommand(options)]); void preview(); };
    c.handlers.CommandChange = () => void preview();
    c.handlers.btnOkClick = () => { read(); options.CustomCommand = c.lines('memFullCommand').join(' '); };
    void preview();
  });
  if (await dialog === 1) { Object.assign(settings.formatter, options); saveSettings(); }
  revision++;
}
