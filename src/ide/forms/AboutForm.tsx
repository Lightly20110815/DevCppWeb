// AboutFrm.pas
import dfm from '../../generated/forms/AboutFrm.json';
import { showForm } from '../../vcl/VclForm';
import type { DfmNode } from '../../vcl/FormCtl';
import { lang } from '../../lang/lang';
import * as L from '../../generated/langIds';
import { MessageDlg } from '../../os/messagebox';
import { DEVCPP_VERSION } from '../version';

const URL_LABELS = ['lblBloodURL', 'lblMinGWURL', 'lblDiscussionURL', 'lblMailingURL', 'lblResourcesURL', 'lblBlogURL', 'lblSubredditURL', 'lblRepositoryURL', 'lblTDMURL'];

export async function showAbout() {
  let fishTimer = 0;
  await showForm(
    dfm as unknown as DfmNode,
    (c) => {
      c.caption('grpLicense', lang(L.ID_AB_LICENSE));
      c.caption('grpLinks', lang(L.ID_AB_WEBCAP));
      c.caption('lblPost4992', lang(L.ID_AB_POST4992));
      c.caption('lblRepository', lang(L.ID_AB_REPOSITORY));
      c.caption('lblSubreddit', lang(L.ID_AB_SUBREDDIT));
      c.caption('lblBlog', lang(L.ID_AB_BLOGNAME));
      c.caption('lblCompilers', lang(L.ID_AB_COMPILERS));
      c.caption('lblMinGW', lang(L.ID_AB_LBLMINGWSITE));
      c.caption('lblTDM', lang(L.ID_AB_TDMGCC));
      c.caption('lblPre4992', lang(L.ID_AB_PRE4992));
      c.caption('lblBlood', lang(L.ID_AB_LBLBLOODSITE));
      c.caption('lblDiscussion', lang(L.ID_AB_LBLFORUM));
      c.caption('lblMailing', lang(L.ID_AB_LBLMAIL));
      c.caption('lblResources', lang(L.ID_AB_LBLEMAIL));
      c.caption('btnOk', lang(L.ID_BTN_OK));
      c.caption('btnUpdateCheck', lang(L.ID_AB_UPDATE));
      c.caption('btnAuthors', lang(L.ID_BTN_AUTHOR));
      c.caption('lblVersion', c.caption('lblVersion') + DEVCPP_VERSION + '\r\nBuild time: 27/04/2015 12:24');
      for (const u of URL_LABELS) c.set(u, { fontColor: '#0000ff', data: { link: () => window.open(c.caption(u), '_blank') } });
      c.set('imgDonate', { data: {} });
      c.handlers.imgDonateClick = () => window.open('https://sourceforge.net/projects/orwelldevcpp/', '_blank');
      c.handlers.btnUpdateCheckClick = () => window.open('https://sourceforge.net/projects/orwelldevcpp/', '_blank');
      c.handlers.btnAuthorsClick = () => {
        void MessageDlg(
          'Authors:\r\n\r\n- Post-4.9.9.2 development: Johan Mes\r\n- Development: Colin Laplace, Mike Berg, Hongli Lai, Yiannis Mandravellos\r\n- Contributors: Peter Schraut, Marek Januszewski, Anonymous\r\n- MinGW compiler system: Mumit Khan, J.J. van der Heijden, Colin Hendrix and GNU developers\r\n- Splash screen and association icons: Matthijs Crielaard\r\n- New Look theme: Gerard Caulfield\r\n- Gnome icons: Gnome designers\r\n- Blue theme: Thomas Thron',
          'mtInformation',
          ['mbOK'],
        );
        // the fish swims by when you drop something on "Authors"... we let it swim on click
        let dir = 1;
        c.set('pnlFish', { left: -57, top: Math.floor(Math.random() * 500) });
        c.handlers.FishImageClick = () => {
          dir = -dir;
        };
        window.clearInterval(fishTimer);
        fishTimer = window.setInterval(() => {
          const s = c.get('pnlFish');
          const left = (s.left ?? -100) + 5 * dir;
          c.set('pnlFish', { left, top: (s.top ?? 40) + 1 });
          if (left > 430 || left < -70) window.clearInterval(fishTimer);
        }, 30);
      };
    },
    { title: lang(L.ID_AB_CAPTION) },
  );
  window.clearInterval(fishTimer);
}
