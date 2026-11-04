/**
 * The launch settings' addresses (web sprint 37 PTT-9, W37.R6; research 243 §9). LAUNCH_SETTINGS_ADAPTATION: a browser
 * adaptation on a development build only -- it builds the page's own address from the parameter table (`./params`) and
 * never reads or changes a game value.
 *
 * - `/testroom`'s sheet: `testRoomAddress` writes the fields in the table's order, a flag bare (`&fly`, as
 *   `../shareUrl` `writeShare` keeps one), a value `k=v` encoded as `URLSearchParams` writes it, an empty field absent.
 *   Nothing set is `?launch=off`: the test room with no parameter, past the sheet (`../pageEntry` `wantsLaunchSheet`).
 * - `/playtest`'s sheet: `cliCommand` is the session's start, in the playtest skill's form
 *   (`.agents/skills/playtest/SKILL.md` §2: `start [--target ...] [--map ...] [--online] [--opt k=v ...]`, run from
 *   `socomlegacy/` as `packages/playtest/src/cli.ts`'s header says), for a NEW session; `probeService` reads a running
 *   session's record, whose `launch.url` -- the address the CLI printed -- is where the sheet joins an online session as
 *   it is (the merge controller's ruling on PTT-9's review); `playtestAddress` is the test room on this page with no
 *   session in it, for when there is none to join.
 */
import { LAUNCH_PARAMS, type LaunchParam } from './params';

/** A sheet's fields: a key present is set; a flag's value is `''`. */
export type LaunchValues = Readonly<Record<string, string>>;

/** `launch=off`: the test room with no parameter of its own, past the sheet. */
export const LAUNCH_OFF = 'off';

/** The lane's session service (W33.R4; `packages/playtest/src/cli.ts` `SERVICE_PORT`), asked at `GET /status`. */
export const PLAYTEST_SERVICE_PORT = 5303;

/** A session's id as the service writes it (`packages/playtest/src/session.ts` `newSessionId`: `YYYYMMDD-<4 hex>`). */
export const SESSION_ID = /^\d{8}-[0-9a-f]{4}$/;

/**
 * How long the sheet waits for the service's answer before it reads as none: a chosen value of this adaptation (no
 * original), short so the sheet's line settles at once; the sheet is never held by it.
 */
export const SERVICE_PROBE_MS_PLACEHOLDER = 1500;

/** The `/testroom` sheet's fields: the table's rows marked `sheet`, in its order. */
export function sheetRows(): LaunchParam[] {
  return LAUNCH_PARAMS.filter((p) => p.sheet);
}

/** The `/playtest` sheet's options: the rows an `--opt k=v` may set (`urlState.ts` `URL_KEYS` less the session's). */
export function playtestOptionRows(): LaunchParam[] {
  return LAUNCH_PARAMS.filter((p) => p.cli === 'option');
}

const part = (k: string, v: string): string => (v === '' ? encodeURIComponent(k) : new URLSearchParams([[k, v]]).toString());
const slash = (base: string): string => (base.endsWith('/') ? base : `${base}/`);

/** The search of `values` over `rows`, in the table's order; flags bare, an empty value absent; `''` when none. */
function searchOf(values: LaunchValues, rows: readonly LaunchParam[]): string {
  const parts: string[] = [];
  for (const p of rows) {
    const v = values[p.key];
    if (v === undefined) continue;
    if (p.kind === 'flag') parts.push(encodeURIComponent(p.key));
    else if (v !== '') parts.push(part(p.key, v));
  }
  return parts.join('&');
}

/** The test room's search from the sheet: its fields, or `?launch=off` when nothing is set. */
export function testRoomSearch(values: LaunchValues): string {
  const s = searchOf(values, sheetRows());
  return s === '' ? `?launch=${LAUNCH_OFF}` : `?${s}`;
}

/** The test room's address from the sheet, under the page's base (`/` in development, `/socomlegacy/` on the site). */
export function testRoomAddress(base: string, values: LaunchValues): string {
  return `${slash(base)}testroom${testRoomSearch(values)}`;
}

/** The sheet's fields an address already names (`?launch&map=MP2`): each `rows` key present; a flag as `''`. */
export function valuesOfSearch(search: string, rows: readonly LaunchParam[] = sheetRows()): Record<string, string> {
  const out: Record<string, string> = {};
  let q: URLSearchParams;
  try { q = new URLSearchParams(search); } catch { return out; }
  for (const p of rows) if (q.has(p.key)) out[p.key] = p.kind === 'flag' ? '' : q.get(p.key) ?? '';
  return out;
}

/** What `/playtest` asks of a session: the CLI's target, map, online, and its options. */
export interface PlaytestChoice {
  target: string;
  map: string;
  online: boolean;
  options: Readonly<Record<string, string>>;
}

/** The CLI's defaults (`packages/playtest/src/cli.ts` `parse`: target `current`, map `MP2`, offline). */
export const PLAYTEST_DEFAULTS: Readonly<PlaytestChoice> = { target: 'current', map: 'MP2', online: false, options: {} };

/** The choice as a preset's fields (`target`, `map`, `online` as `''` when on, the options by key). */
export function valuesOfChoice(c: PlaytestChoice): Record<string, string> {
  return { target: c.target, map: c.map, ...(c.online ? { online: '' } : {}), ...c.options };
}

/** A preset's (or an address's) fields as a choice: the defaults where it says nothing; options the CLI takes only. */
export function choiceOfValues(v: LaunchValues): PlaytestChoice {
  const options: Record<string, string> = {};
  for (const p of playtestOptionRows()) if (v[p.key] !== undefined) options[p.key] = p.kind === 'flag' ? '' : v[p.key]!;
  return { target: v['target'] || PLAYTEST_DEFAULTS.target, map: v['map'] || PLAYTEST_DEFAULTS.map, online: v['online'] !== undefined && v['online'] !== 'off', options };
}

/** The options in the table's order, an empty value of a non-flag dropped. */
function orderedOptions(c: PlaytestChoice): [string, string][] {
  const out: [string, string][] = [];
  for (const p of playtestOptionRows()) {
    const v = c.options[p.key];
    if (v === undefined) continue;
    if (p.kind === 'flag') out.push([p.key, '']);
    else if (v !== '') out.push([p.key, v]);
  }
  return out;
}

/** A word for a POSIX shell: as it is when it is safe, else single-quoted. */
function shellWord(w: string): string {
  return /^[A-Za-z0-9_.,:/=@%+-]+$/.test(w) ? w : `'${w.replace(/'/g, `'\\''`)}'`;
}

/** The session's start, exact, run from `socomlegacy/`: `npx tsx packages/playtest/src/cli.ts start --target --map ...`. */
export function cliCommand(c: PlaytestChoice): string {
  const words = ['npx', 'tsx', 'packages/playtest/src/cli.ts', 'start', '--target', shellWord(c.target), '--map', shellWord(c.map)];
  if (c.online) words.push('--online');
  for (const [k, v] of orderedOptions(c)) words.push('--opt', shellWord(`${k}=${v}`));
  return words.join(' ');
}

/**
 * The test room for a playtest with no session to join: `?devmode&mode=play&map=<map>&<options>` under this page's
 * `base`, offline -- no server can be named for a session that is not running, and the sheet never builds a running
 * session's address (it joins at the record's own `launch.url`, `probeService`).
 */
export function playtestAddress(base: string, c: PlaytestChoice): string {
  const parts = ['devmode', 'mode=play', part('map', c.map), ...orderedOptions(c).map(([k, v]) => part(k, v))];
  return `${slash(base)}testroom?${parts.join('&')}`;
}

/** What a running session's record says (`GET /status`): its id, whether it is online, and its page, if usable. */
export interface SessionStatus {
  id: string;
  /** `launch.online`: the session runs its own match server (`start --online`). */
  online: boolean;
  /**
   * `launch.url`, the address the CLI printed (`launchUrl.ts` `pageUrl`): taken only as this host's test room -- `http:`
   * on `127.0.0.1` or `localhost`, path `/testroom` -- else null (never a page elsewhere to join).
   */
  url: string | null;
}

/** A record's page address when it is this host's test room, else null. */
function localTestRoom(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  let u: URL;
  try { u = new URL(v); } catch { return null; }
  return u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost') && u.pathname === '/testroom' ? v : null;
}

/** The service's own read route (`packages/playtest/src/service.ts`: `GET /status`). */
export function serviceStatusUrl(port: number): string {
  return `http://127.0.0.1:${port}/status`;
}

/**
 * The running session whose service answers on `port`, or null: `GET /status` with CORS (the service names this host's
 * pages in `Access-Control-Allow-Origin` on that route, `packages/playtest/src/service.ts`; review F4), read within
 * `ms`, and taken only when it answers 2xx with a JSON record whose `id` has a session's form (`SESSION_ID`); then its
 * `launch.online` and its `launch.url` (`SessionStatus`). Any other server on the port, a refused connection, an older
 * service without the header (the browser refuses the read), a throw, no answer in time or no `fetch` is none; never
 * throws.
 */
export async function probeService(fetchFn: typeof fetch | null | undefined, port: number = PLAYTEST_SERVICE_PORT, ms: number = SERVICE_PROBE_MS_PLACEHOLDER): Promise<SessionStatus | null> {
  if (typeof fetchFn !== 'function') return null;
  const abort = typeof AbortController === 'function' ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<SessionStatus | null>((done) => { timer = setTimeout(() => { abort?.abort(); done(null); }, ms); });
  const asked = (async (): Promise<SessionStatus | null> => {
    try {
      const res = await fetchFn(serviceStatusUrl(port), { mode: 'cors', cache: 'no-store', ...(abort ? { signal: abort.signal } : {}) });
      if (!res.ok) return null;
      const body = (await res.json()) as unknown;
      if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
      const r = body as { id?: unknown; launch?: { online?: unknown; url?: unknown } | null };
      if (typeof r.id !== 'string' || !SESSION_ID.test(r.id)) return null;
      const launch = typeof r.launch === 'object' && r.launch !== null ? r.launch : {};
      return { id: r.id, online: launch.online === true, url: localTestRoom(launch.url) };
    } catch {
      return null;
    }
  })();
  try { return await Promise.race([asked, late]); } finally { clearTimeout(timer); }
}
