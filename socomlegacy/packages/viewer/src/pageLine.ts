import { pageInMatch } from './pwa/matchSignals';
import { UPDATE_NOTICE_GAME_FADE_ADAPTATION } from './pwa/update';

/**
 * LATER 67 (a browser adaptation; the merge controller's call, product track): the page's one-line notice, in the update
 * notice's form (`./pwa/update` `showUpdateNotice`) -- a role=status toast centred above the legend, stacked over the
 * front end's canvas and the loading screen -- hidden while a match runs, and gone after LATER 187's fade on the game
 * page (`UPDATE_NOTICE_GAME_FADE_ADAPTATION`). One at a time: a second line replaces the first. The review's F3: with the
 * update notice showing (`[data-pwa-update]`, the same slot) when the line appears, the line sits 3.5rem higher. Known
 * edges (the re-check's notes, low): the gap is in rem against the notice's fixed pixels, so under a root of about 12px
 * (a phone at Interface size 100%) the line still covers the top few pixels of Restart and Later; and a notice shown
 * after the line (or shown again) is placed under or over it for the line's few seconds -- the buttons stay usable.
 */
export function showPageLine(doc: Document, text: string): void {
  const win = doc.defaultView;
  if (!doc.body || !win) return;
  doc.querySelector('[data-page-line]')?.remove();
  const bar = doc.createElement('div');
  bar.setAttribute('data-page-line', '');
  bar.setAttribute('role', 'status');
  const notice = doc.querySelector<HTMLElement>('[data-pwa-update]');
  const bottom = notice && !notice.hidden ? '13rem' : '9.5rem';
  bar.style.cssText = `position:fixed;z-index:20000;left:50%;bottom:${bottom};transform:translateX(-50%);width:max-content;max-width:min(24rem,calc(100vw - 32px));padding:10px 12px;background:#000e11;color:#e7eef2;border:1px solid #c4a04a;font:14px/1.3 system-ui,sans-serif`;
  bar.textContent = text;
  const sync = (): void => { bar.hidden = pageInMatch(win); };
  sync();
  doc.body.append(bar);
  const timer = win.setInterval(sync, 1000);
  win.setTimeout(() => { win.clearInterval(timer); bar.remove(); }, UPDATE_NOTICE_GAME_FADE_ADAPTATION * 1000);
}
