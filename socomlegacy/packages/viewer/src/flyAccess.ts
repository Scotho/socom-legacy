import { devSwitches } from './source';

/**
 * Who may reach the free (fly) camera (owner, 2026-09-29: "Block the fly automatically and disable it while in play
 * mode"). **Explore is the free camera.** In **Play** a player is on foot: the page offers no Fly / Walk switch, `G` and
 * the pad's Start do not toggle, a `fly` in the address is ignored and taken out of it, the debug hook's
 * `setMode('fly')` is refused, and its `setCamera` at a point with no floor stands the SEAL again rather than leaving the
 * walk. The developer's fly switch (`./source` `flyok` on a development build only, and `?devmode` which includes it)
 * keeps all of that -- the e2e specs and the measuring tools open Play with `&fly&devmode` and enter the walk themselves.
 *
 * The game still moves the camera itself where the game does: a dead player's classic spectating, a watcher's view,
 * the moments before the map's floor is ready. None of those is a player's input.
 */
export interface FlyAccess {
  /** The developer's walk / fly toggle in Play: the Fly / Walk switch, `G`, the pad's Start and the hook's `setMode('fly')`. */
  toggle: boolean;
  /** Play opens in the fly camera rather than on foot (`&fly`, with `?devmode` only). */
  startInFly: boolean;
  /** The address carries a `fly` the page ignores, to be taken out of it. */
  dropFly: boolean;
}

/** The URL parameter that opens Play in the fly camera, with the fly switch (`flyok` or `?devmode`). */
export const FLY_PARAM = 'fly';

export function flyAccess(search: string): FlyAccess {
  const dev = devSwitches(search).flyToggle;
  let fly = false;
  try { fly = new URLSearchParams(search).has(FLY_PARAM); } catch { /* a malformed query asks for nothing */ }
  return { toggle: dev, startInFly: dev && fly, dropFly: fly && !dev };
}

/**
 * Whether a switch to `mode` is allowed by the page's rules (the hook's `setMode`, the pad's Start, `G`): walking needs
 * Play; flying from Play needs the developer's toggle; flying in Explore is where the page already is.
 */
export function mayEnter(mode: 'walk' | 'fly', play: boolean, access: Pick<FlyAccess, 'toggle'>): boolean {
  if (mode === 'walk') return play;
  return !play || access.toggle;
}

/** The URL parameter that keeps reCOM mode's offline match off: the free walk of before. */
export const NO_MATCH_PARAM = 'nomatch';

/**
 * Whether reCOM mode plays the offline match (`./net/loopback`): yes, unless the address carries `&nomatch`, or `&fly`
 * together with the fly switch (Play then opens in the fly camera, `startInFly`). A player's bare `&fly` is ignored and
 * dropped (`dropFly`), so it keeps the match. The e2e specs other than soloMatch.spec.ts open with one of the two
 * (flyAccess.test.ts scans them).
 */
export function soloMatchOn(search: string): boolean {
  let nomatch = false;
  try { nomatch = new URLSearchParams(search).has(NO_MATCH_PARAM); } catch { /* a malformed query asks for nothing */ }
  return !nomatch && !flyAccess(search).startInFly;
}
