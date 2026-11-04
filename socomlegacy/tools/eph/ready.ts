import { stanceOfRoot, type RootStance } from './record';

/**
 * The two readiness checks before a run's script (or a live session) starts (EPH-2). Product track (OT.R53): a
 * validation instrument, an adaptation, never in a build and never changing the game's behaviour.
 *
 * The first complete live run (2026-10-31, run 20261031T010239Z) showed both missing: the page sat under the test room's
 * loading screen -- Frostfire's map briefing, "TO RETURN TO THE LOBBY" -- while `ephFrame().walking` was already true, so
 * the script's Triangles fell on the briefing and page.csv read `stand` throughout; and PCSX2's saved state was prone
 * (root y 2.168, stance request 2 for the first 405 rows) while the page stood.
 *
 * 1. The page is in play when its input is live: the walk on, the loading screen's hold released and the ARMORY shut --
 *    the gates the viewer's pad frame takes input behind (packages/viewer/src/main.ts `padFrame`: it returns early while
 *    `loadingJoin.blocked`; the ARMORY takes the keys while open). All three are read through the hook as it stands
 *    (`__viewer.ephFrame()`, `__viewer.loading().blocked`, `__viewer.armory().open`); the viewer is not changed.
 * 2. Both sides start in one stance. PCSX2's is read off the skeleton root's y at rest by the bands of
 *    desktop@be5578311:tools_py/parity/seal_speed_fit.py:62-66 and :95-102 (`./record` stanceOfRoot): readable on both
 *    builds. The stance request byte (actor+0x374, seal_speed_probe.py:40-41: "the wished stance byte", r0001 only) is
 *    recorded beside it, not decided on: no desktop source gives its values (STANCE_REQUEST_SEEN). The page's is
 *    `ephFrame().stance`. The script grammar (./script) has no header directive, so the two sides are compared with each
 *    other, not with a stance the script declares.
 */

/** The page-ready wait's condition (a string: no bundler helper rides into the page). */
export const PAGE_READY_EXPRESSION = 'window.__viewer && window.__viewer.ephFrame() && window.__viewer.ephFrame().walking'
  + ' && !window.__viewer.loading().blocked && !window.__viewer.armory().open';

/** The same facts read once, for the line a timeout fails with. */
export const PAGE_STATE_EXPRESSION = '(() => { const v = window.__viewer; if (!v) return { viewer: false, walking: false, loadingBlocked: false, armoryOpen: false };'
  + ' const f = v.ephFrame(); return { viewer: true, walking: !!(f && f.walking), loadingBlocked: !!v.loading().blocked, armoryOpen: !!v.armory().open }; })()';

export interface PageState {
  readonly viewer: boolean;
  readonly walking: boolean;
  readonly loadingBlocked: boolean;
  readonly armoryOpen: boolean;
}

/** The timeout's line: what still holds the page, or that its state could not be read. */
export function pageNotReadyMessage(state: PageState | null, timeoutMs: number): string {
  const head = `EPH run: the page was not in play within ${timeoutMs / 1000} s: `;
  if (state === null) return `${head}its state could not be read (__viewer)`;
  if (!state.viewer) return `${head}no __viewer on the page (is it the test room, in devmode?)`;
  const why: string[] = [];
  if (!state.walking) why.push('the walk is off (ephFrame() null or not walking: is the page in devmode, in Play?)');
  if (state.loadingBlocked) why.push('the loading screen still holds the input (__viewer.loading().blocked); the script would land on the map briefing');
  if (state.armoryOpen) why.push('the ARMORY is open (__viewer.armory().open)');
  return head + (why.length ? why.join('; ') : 'it read ready only after the wait ended');
}

/**
 * The stance request byte's values as seen in run 20261031T010239Z's pcsx2.csv (r0001), against the root bands: 2 with
 * the root at rest at 2.168 (prone: under PRONE_BELOW) for rows 0-404; 0 from the first Triangle (guest 61.413 s), the
 * root then rising to 11.484 (the standing band) by row 2084; 2 again from the second Triangle (guest 64.383 s), the root
 * falling through the crouch band. Observed, not read from code: seal_speed_probe.py:40-44 names the byte "the wished
 * stance byte" and what a firm Triangle wishes (PRONE from stand or crouch, STAND from prone), not its encoding. 1 (and
 * any other value) was not seen; it is printed as unknown.
 */
export const STANCE_REQUEST_SEEN: Readonly<Record<number, RootStance>> = { 0: 'stand', 2: 'prone' };

export interface StartStances {
  readonly pcsx2: { readonly stance: RootStance; readonly rootY: number; readonly stanceRequest: number | null; readonly by: string };
  readonly page: { readonly stance: string; readonly by: string };
  readonly match: boolean;
}

const BY_ROOT = 'the skeleton root y at rest, seal_speed_fit.py stance_of bands (stand 11.484, crouch 5.504, each +-0.5; prone under 5.004)';

/** Both sides' stances from the last PCSX2 row and the last page frame before the script. */
export function startStancesOf(pcsx2: { rootY: number; stanceRequest: number | null }, page: { stance: string }): StartStances {
  const stance = stanceOfRoot(pcsx2.rootY);
  return {
    pcsx2: {
      stance, rootY: pcsx2.rootY, stanceRequest: pcsx2.stanceRequest,
      by: pcsx2.stanceRequest === null ? `${BY_ROOT}; the stance request not read on this build` : BY_ROOT,
    },
    page: { stance: page.stance, by: 'ephFrame().stance' },
    match: stance !== 'unknown' && stance === page.stance,
  };
}

const round3 = (v: number): string => String(Number(v.toFixed(3)));

/** Null when both sides start in one stance; else the refusal naming both. */
export function startStanceMismatch(s: StartStances): string | null {
  if (s.match) return null;
  const p = s.pcsx2;
  const req = p.stanceRequest === null ? 'stance request not read on this build'
    : `stance request ${p.stanceRequest} = ${STANCE_REQUEST_SEEN[p.stanceRequest] ?? 'unknown'} as seen`;
  const root = p.stance === 'unknown' ? `root y ${round3(p.rootY)}, in no band: between stances or not at rest` : `root y ${round3(p.rootY)}, by the root bands`;
  return `EPH run: the two sides start in different stances: PCSX2 ${p.stance} (${root}; ${req}) and the page ${s.page.stance} `
    + '(ephFrame().stance); save a state in the page\'s stance, or set the page\'s, then run again';
}
