import { routeCanonicalStack, routeSegments } from '@s2u/ui';
import type { Settings } from '@s2u/card';
import { pageSettings } from '../pageStore';
import { routeUrl } from '../menuRoutes';
import { gamePath } from './adapters/gamePath';

/**
 * SKIP-MENU (LR.R33, the owner, 2026-10-31: "in the before you deploy UI, please add a "skip menu" checkbox in the theme
 * of it just above controller settings. When turned on, players go straight to the log in page for online."): the launch
 * check's "Skip menu" toggle (`./render/home`), saved in this browser beside the launcher's own settings
 * (`s2u.console.v1.*`, through `pageSettings`), off by default. On, the hand-over (`./adapters/launch` `gamePage`) leaves
 * the address at LOGIN TO SOCOM II ONLINE's route instead of the base, and the front end's own menu router
 * (`../menuRoutes`, ROUTE-01, OT.R10) replays the stack the original builds to it -- the boot's two cinematics, `dlgMenu`,
 * the pass-through `dlgMPswitch` (ONLINE's `do_multi_or_medius`, research 138 R138.3 and R138.9) -- and builds only
 * `dlgNetLogin`, whose own ONSTART runs as through the menus (research 144 §1); its TRIANGLE (`exit_net_login`) goes to
 * `dlgMenu` as always (R144.4). The route is the one a link to `/main/online` or an invite (LINK-2) already enters.
 *
 * **A browser adaptation** with no original: the launcher only picks the place the router enters; every screen shown is
 * the original's, and nothing of the game's behaviour changes.
 */
export const SKIP_MENU_KEY = 's2u.console.v1.skipMenu';

/** The row's words (`./render/home`): the owner's name for it, and a short line of what it does. */
export const SKIP_MENU_LABEL = 'Skip menu';
export const SKIP_MENU_HINT = 'Go straight to the online log-in';

/** LOGIN's route segments (`main/online`), from the route table itself: the canonical stack to `dlgNetLogin`. */
export const SKIP_MENU_SEGMENTS: readonly string[] = routeSegments(routeCanonicalStack('dlgNetLogin.rdr') ?? []);

/** Whether "Skip menu" is on in this browser (off unless saved on). */
export const skipMenuOn = (settings: Settings = pageSettings): boolean => settings.get(SKIP_MENU_KEY) === '1';

/** Saves "Skip menu" on or off in this browser. */
export function setSkipMenu(on: boolean, settings: Settings = pageSettings): void {
  settings.set(SKIP_MENU_KEY, on ? '1' : '0');
}

/**
 * The owner's Finding 1 answer (a), relayed by 5d, 2026-10-31: the same toggle in Settings > Launcher > App
 * (`./adapters/options`), its row id; one key, so both places show one state.
 */
export const SKIP_MENU_ROW = 'skip-menu';

/**
 * The path the hand-over leaves for the front end's router (`./adapters/launch` `gamePage`): a kept menu path (a link, an
 * invite: `./adapters/gamePath`) wins; else, with "Skip menu" on, LOGIN's route; else the base.
 */
export function skipMenuEntry(pathname: string, base: string, on: boolean): string {
  const root = base.endsWith('/') ? base : `${base}/`;
  const kept = gamePath(pathname, root);
  return on && kept === root ? routeUrl(root, SKIP_MENU_SEGMENTS, '', '') : kept;
}

/**
 * Where the game opens after the hand-over, for the launch screen's note (`./render/overlay`): the title screen (the base),
 * LOGIN (LOGIN's route), or the place a kept link names.
 */
export function skipMenuOpens(pathname: string, base: string, on: boolean): 'title' | 'login' | 'link' {
  const root = base.endsWith('/') ? base : `${base}/`;
  const path = skipMenuEntry(pathname, root, on);
  if (path === root) return 'title';
  return path === routeUrl(root, SKIP_MENU_SEGMENTS, '', '') ? 'login' : 'link';
}
