/**
 * The pure half of `./reportClips.spec.ts` (RV-11b, web sprint 39; research 276 §10): the run's ports, and the reading
 * of the report page's network log -- which request is a mark's clip (`/evidence/<observation>/clip.webm`, the report's
 * route, `../../playtest/src/report/http.ts`), which a replay segment (`/segments/<n>.s2r`,
 * `../../playtest/src/segmentsHttp.ts` `SEGMENT`), and which clip read was ranged and answered 206 (RV-11, 276 §4). No
 * browser and no Playwright here: `../test/reportClips.test.ts` holds it in Node. The playtest report is the project's
 * own instrument (PLAYTEST_INSTRUMENT_ADAPTATION, research 243): nothing here reads or changes a game value.
 */
import { e2ePort } from './ports';

/**
 * `port` when it is a port of the run's own, else an error naming the setting (`name`): `./ports` `e2ePort`'s rule --
 * never the developer's servers' ports (`FORBIDDEN_PORTS`), never what is not a port. Until 2026-11-11 this held the
 * sprint-39 lane's 5303-5308 only (a shared dev host's rule, research 276 §10), which refused the gate's own Local port,
 * 8811 (the v0.4.19 browser view): the run's ports are the rule now, a test harness's, no game value.
 */
export function lanePort(name: string, port: number): number {
  return e2ePort(name, String(port), port);
}

/** A URL's path, or null when it is not a URL. */
function pathOf(url: string): string | null {
  try { return new URL(url).pathname; } catch { return null; }
}

/** The observation whose clip `url` asks (`/evidence/<observation>/clip.webm`, decoded), or null for any other URL. */
export function clipObservation(url: string): string | null {
  const m = /^\/evidence\/([^/]+)\/clip\.webm$/.exec(pathOf(url) ?? '');
  if (!m) return null;
  try { return decodeURIComponent(m[1]!); } catch { return null; }
}

/** The segment index `url` reads (`/segments/<n>.s2r`, an exact non-negative index as the route takes it), or null. */
export function segmentIndex(url: string): number | null {
  const m = /^\/segments\/(0|[1-9][0-9]*)\.s2r$/.exec(pathOf(url) ?? '');
  return m ? Number(m[1]) : null;
}

/**
 * One request the report page (or its replay frame) made, as the spec logs it: its URL, when the request was seen
 * (`at`, the spec's `Date.now()` at the `request` event), its `Range` header, the answer's status, when the answer was
 * seen (`answeredAt`, at the `response` event) and its `Content-Range`, and the failure's text when it failed (an
 * aborted media read included). Null where not (yet) known.
 */
export interface NetEntry {
  url: string;
  at: number;
  range: string | null;
  status: number | null;
  answeredAt: number | null;
  contentRange: string | null;
  failed: string | null;
}

/** Every clip request in the log, or those seen before `before` when given. */
export function clipAsks(net: readonly NetEntry[], before?: number): NetEntry[] {
  return net.filter((e) => clipObservation(e.url) !== null && (before === undefined || e.at < before));
}

/** The first read of `observation`'s clip with a `bytes=` range that the route answered 206, or null. */
export function rangedAnswer(net: readonly NetEntry[], observation: string): NetEntry | null {
  return net.find((e) => clipObservation(e.url) === observation && /^bytes=/i.test(e.range ?? '') && e.status === 206) ?? null;
}

/** The segment reads (`/segments/<n>.s2r`) that were answered, in the order seen. */
export function segmentAnswers(net: readonly NetEntry[]): NetEntry[] {
  return net.filter((e) => segmentIndex(e.url) !== null && e.status !== null);
}
