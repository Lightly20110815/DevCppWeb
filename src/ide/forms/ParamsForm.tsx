// ParamsFrm.pas + TMainForm.actExecParamsExecute
import dfm from '../../generated/forms/ParamsFrm.json';
import { showForm } from '../../vcl/VclForm';
import type { DfmNode } from '../../vcl/FormCtl';
import { mrOk } from '../../vcl/FormCtl';
import { lang } from '../../lang/lang';
import * as L from '../../generated/langIds';
import { ide } from '../ide';
import { compiler, getCompileTarget } from '../run';
import { showFileDialog } from '../../os/FileDialog';

export async function showParams() {
  const target = getCompileTarget();
  const p = ide.project;
  const dialog = showForm(
    dfm as unknown as DfmNode,
    (c) => {
      c.caption('grpParameters', lang(L.ID_PARAM_PARAMS));
      c.caption('grpHost', lang(L.ID_PARAM_HOST));
      c.caption('OkBtn', lang(L.ID_BTN_OK));
      c.caption('CancelBtn', lang(L.ID_BTN_CANCEL));
      if (target === 'project' && p) {
        c.text('HostEdit', p.options.hostApplication);
        c.text('ParamEdit', p.options.cmdLineArgs);
      } else c.text('ParamEdit', compiler.runParams);
      if (!p || p.options.type !== 'dll') {
        c.enabled('HostEdit', false);
        c.enabled('LoadBtn', false);
      }
      c.handlers.LoadBtnClick = async () => {
        const f = await showFileDialog({ mode: 'open', filter: 'All files (*.*)|*.*' });
        if (f) c.text('HostEdit', f.files[0]);
      };
    },
    { title: lang(L.ID_PARAM_CAPTION), focus: 'ParamEdit' },
  );
  if (await dialog === mrOk) {
    const c = dialog.ctl;
    if (target === 'project' && p) {
      if (c.enabled('HostEdit')) p.options.hostApplication = c.text('HostEdit');
      p.options.cmdLineArgs = c.text('ParamEdit');
      p.modified = true;
    } else compiler.runParams = c.text('ParamEdit');
  }
}
