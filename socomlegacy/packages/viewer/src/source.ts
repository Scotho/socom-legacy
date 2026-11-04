import type { SourceRequest } from './worker';

/**
 * Where the page reads the game from (owner, 2026-09-29). By default **only the visitor's own disc image**: the page opens
 * on the setup page (OT.R28; its element is still `index.html` `#disc-page`), and the `.iso` dropped on the window or picked with the file button is
 * read in the browser by the worker (`@s2u/archive`'s `IsoAssetSource`, by range) -- no request is made for the served,
 * extracted tree (`maps/`) at all.
 *
 * Three developer switches, each on its own, and `DEV_PARAM` which turns on all three (a developer switch, deliberately
 * not listed anywhere a visitor reads: only here, in the README's developer section and the tests). The e2e specs and
 * the measuring tools add `DEV_PARAM` to their URLs, so a bare `?devmode` is the served tree, the fly toggle and the
 * dev tools together, as it was when one flag did all three jobs. Every switch, the bare `?devmode` included, works only
 * on a development build (`devSwitches`; OT.R94, the owner 2026-10-31, answering H152: no `?devmode` in release builds).
 * -`SERVED_PARAM`: the served tree from `socomlegacy/public/maps/`, if `maps/index.json` answers, else the setup page.
 * - `FLY_OK_PARAM`: the fly toggle is allowed in Play (`./flyAccess`). The disc is still the visitor's.
 * - `DEVTOOLS_PARAM`: the taunt editor, kit, noarmory, the teleport, the playtest instruments and the replay.
 */

/** The URL parameter that turns on all three dev switches. Its presence is enough. */
export const DEV_PARAM = 'devmode';

/** The URL parameter for the served, extracted tree (the visitor's disc is not asked for). */
export const SERVED_PARAM = 'served';

/** The URL parameter that allows the fly toggle in Play. */
export const FLY_OK_PARAM = 'flyok';

/** The URL parameter for the developer's tools (the taunt editor and the rest). */
export const DEVTOOLS_PARAM = 'devtools';

/**
 * The URL parameter that leaves a due tracer at the hit (`Effects.holdTracers`). A dev flag: it counts with
 * `DEV_PARAM` in every build, or with `DEVTOOLS_PARAM` on a development build. Absent, a tracer flies and retires
 * at the hit as the original's pool does.
 */
export const TRACER_HOLD_PARAM = 'tracerhold';

/**
 * Whether `TRACER_HOLD_PARAM` is on for this query. It does nothing unless this is a development build with
 * `DEV_PARAM` or `DEVTOOLS_PARAM` (OT.R94).
 */
export function tracerHold(search: string, devBuild: boolean = import.meta.env.DEV): boolean {
  try {
    const q = new URLSearchParams(search);
    if (!q.has(TRACER_HOLD_PARAM)) return false;
    return devBuild && (q.has(DEV_PARAM) || q.has(DEVTOOLS_PARAM));
  } catch {
    return false;
  }
}

/** Whether the bare `DEV_PARAM` flag is in the query (with or without its leading `?`) on a development build (OT.R94). */
export function devMode(search: string, devBuild: boolean = import.meta.env.DEV): boolean {
  try {
    return devBuild && new URLSearchParams(search).has(DEV_PARAM);
  } catch {
    return false;
  }
}

/** The three dev switches. `DEV_PARAM` turns each one on; each flag also turns on its own. */
export interface DevSwitches {
  /** At least one of the three is on. */
  any: boolean;
  /** Served extracted maps, skipping the visitor's disc. */
  served: boolean;
  /** The fly toggle is allowed in Play. */
  flyToggle: boolean;
  /** The taunt editor, kit, noarmory, the teleport, the playtest instruments and the replay. */
  tools: boolean;
}

/**
 * The three dev switches for a query string (with or without its leading `?`). The three single words (`SERVED_PARAM`,
 * `FLY_OK_PARAM`, `DEVTOOLS_PARAM`) count only on a development build (`devBuild`, Vite's `import.meta.env.DEV` by
 * default: the dev server and the e2e specs); a production build reads none of them, and since OT.R94 (the owner
 * 2026-10-31, answering H152) not the bare `DEV_PARAM` either: the public site's release build has no developer switch.
 */
export function devSwitches(search: string, devBuild: boolean = import.meta.env.DEV): DevSwitches {
  let all = false;
  let served = false;
  let flyToggle = false;
  let tools = false;
  try {
    const q = new URLSearchParams(search);
    if (devBuild) {
      all = q.has(DEV_PARAM);
      served = q.has(SERVED_PARAM);
      flyToggle = q.has(FLY_OK_PARAM);
      tools = q.has(DEVTOOLS_PARAM);
    }
  } catch { /* a malformed query asks for nothing */ }
  const servedOn = all || served;
  const flyOn = all || flyToggle;
  const toolsOn = all || tools;
  return { any: servedOn || flyOn || toolsOn, served: servedOn, flyToggle: flyOn, tools: toolsOn };
}

/**
 * The words for the test room's DEV badge, or null when no dev switch is on (the badge is not shown).
 * `maps` is the served tree, `fly` the Play toggle, `tools` the developer's tools.
 */
export function devBadgeLabel(switches: DevSwitches): string | null {
  if (!switches.any) return null;
  const parts: string[] = [];
  if (switches.served) parts.push('maps');
  if (switches.flyToggle) parts.push('fly');
  if (switches.tools) parts.push('tools');
  return `DEV · ${parts.join(' · ')}`;
}

/**
 * The source the page asks for its map list first: the served tree at `mapsUrl` when the served switch is on
 * (`SERVED_PARAM`, or `DEV_PARAM` which includes it), else none -- the page waits on the visitor's disc (null).
 */
export function startSource(search: string, mapsUrl: string): SourceRequest | null {
  return devSwitches(search).served ? { kind: 'http', baseUrl: mapsUrl } : null;
}
