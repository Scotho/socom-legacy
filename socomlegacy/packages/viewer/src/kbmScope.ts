/**
 * A browser adaptation (product track, OT.R53; OT.R114, the replay batch's RB.R4): where the keyboard and the mouse
 * are an input in every build. The original has no keyboard or mouse; this changes nothing the
 * game does, only which pages read them.
 *
 * OT.R114 allows them in the test room and the Forge; "not covered: an online match". So the one predicate is true for
 * those two pages while no online room is joined -- the match client absent, the private loopback (`'loopback:'`, as
 * `matchMount.ts` tests it for its input port) or a recording (`'replay:'`) -- and false for any server URL, and for
 * every other page (the launcher, a lobby or front-end match), which stays controller-only (OT.R29, OT.R48). A page asks
 * it at each event, never once at its start, so a test room that joins an online room goes deaf at once (RB.R4).
 */

/** The pages that may ask; only `KBM_PAGES` can be answered true. */
export type KbmPage = 'testroom' | 'forge' | 'launcher' | 'match';

/** OT.R114's two pages. */
export const KBM_PAGES: readonly KbmPage[] = ['testroom', 'forge'];

/** The match client URLs that join no online room: the private loopback and a recording. */
const OFFLINE_CLIENT_URLS: ReadonlySet<string> = new Set(['loopback:', 'replay:']);

/**
 * RPM-2: the page the test room asks as. Framed as the launcher's Replays world (`?replayview`, MU-11,
 * `./modern/replays/worldHost`), the test room's frame is the launcher's page, controller-only (OT.R29, OT.R48), not
 * OT.R114's test room: its recording's `'replay:'` client is offline, but the frame belongs to the launcher, whose camera
 * buttons and pad drive the spectator view (`ReplayWorldSpectator.key`, `spectatorPad`), never the keys or the mouse.
 * The original has no replay viewer; a browser adaptation, as the rest of this file.
 */
export function testroomKbmPage(replayWorld: boolean): KbmPage {
  return replayWorld ? 'launcher' : 'testroom';
}

/**
 * True when `page` may read the keyboard and the mouse with its match client at `clientUrl` (null or undefined: no
 * client). An empty string is not an absent client, and only the exact `'loopback:'` and `'replay:'` count as offline.
 */
export function kbmAllowed(page: KbmPage, clientUrl: string | null | undefined): boolean {
  if (!KBM_PAGES.includes(page)) return false;
  return clientUrl === null || clientUrl === undefined || OFFLINE_CLIENT_URLS.has(clientUrl);
}
