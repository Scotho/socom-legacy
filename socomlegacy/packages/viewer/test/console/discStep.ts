import type { ConsolePage } from '../../src/console/app';
import { deployChecks, HOME_CATEGORY, LAUNCH_DISC_ROW } from '../../src/console/state';

/**
 * LR-23 (LR.R22, the owner: "The entire right side overlay for the selected category - gone"): the Disc step is no Home
 * list item and no check of Play's panel (both gone) but the legend's disc mark (LR-24; LR-23's status chip), which carries the step's line for a
 * reader (`.cx-mark__line`, visually hidden, was `.cx-chip__line`; `../../src/console/render/legend`). The tests that read
 * the Disc step read it here: its line is the mark's, its title and state word (READY, NEEDED, READING, CHECK DISC) the step's own
 * (`deployChecks`' first item). Was (LR-13): the disc check of Play's "Before you deploy" panel, its drawn hint.
 */
export function discStep(page: ConsolePage): { title: string; sub: string; state: string } {
  const d = deployChecks(page.ctl.S, page.ctl.A)[0]!;
  const line = document.querySelector('#legend .cx-mark[data-mark="disc"] .cx-mark__line');   // LR-24 (was LR-23: `.cx-chip .cx-chip__line`)
  return { title: d.title, sub: line?.textContent ?? '', state: d.state?.[0] ?? '' };
}

/**
 * The drawn disc control on Home (null where the legend draws no cluster: over a game, under a keyboard): LR-24's disc
 * mark (LR.R23 (b); was LR-23's chip, was LR-13's disc check).
 */
export const discCheck = (): HTMLElement | null => document.querySelector<HTMLElement>('#legend .cx-mark[data-mark="disc"]');

/**
 * The LR-36 fold (LR.R30 amended): Play's "Before you deploy" panel open on its disc row, where Cross is the Disc action
 * (the active source's chooser, for a gesture). Play's Cross with the disc out opens it so (`../../src/console/grammar`
 * `play`, `openCheck`); here it is opened and its cursor put on the disc row, whatever the disc. Was (LR-23): the pad's
 * focus on Home's Play, whose Cross was the Disc action while the disc was out; was LR-13: Play's panel on its disc check.
 * With the disc in and a pad, Play's Cross launches: a test that changes a ready disc presses the disc mark and an
 * option of its menu (LR-24; was: the chip, `discCheck()!.click()`).
 */
export function onDiscCheck(page: ConsolePage): void {
  page.ctl.S.screen = 'home';
  page.ctl.S.cat = HOME_CATEGORY;
  page.ctl.S.item[HOME_CATEGORY] = 0;
  page.ctl.openCheck();
  page.ctl.S.chk.row = LAUNCH_DISC_ROW;
  page.ctl.S.chk.auto = true;                                       // the cursor kept here, a ready launch or not
  page.render();
}
