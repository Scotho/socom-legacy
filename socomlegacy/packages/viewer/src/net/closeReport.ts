import { devSwitches } from '../source';
import { CLOSE_REPORT_BODY_MAX_BYTES, CLOSE_REPORT_PATH } from '../../../match/src/reportBounds';

/**
 * LATER 62 (NU-17, research 315 §12: the owner's three-seat game of 2026-10-15, where the late joiner's page closed its
 * own match socket mid-round and no page path, as the code reads, does): the page's half of the close report.
 *
 * **A browser adaptation with no original -- a development and playtest instrument** (`CLOSE_REPORT_ADAPTATION`): the
 * console had no such post, and it changes nothing the game does. When a lobby match ends any way but its own end
 * (`LobbyMatch`'s returns but `match-over`), the page posts one fixed-shape body -- its seat id, the return's `why`, the
 * call site that decided it, its socket's state and close code as they stood before the return closed it, the phase, the
 * late flag and the time since the level showed -- to `/dev/close-report` on the server or door its socket named. No name,
 * account or ticket. Made only under a literal `import.meta.env.DEV` (`frontEnd.ts`), which a production build folds away
 * with this module (the nightly, built with `NODE_ENV=development` (OT.R47), carries it, its server and doors leaving
 * `CLOSE_REPORT` unset: a `?devmode` page's post there is a 404), and only with `?devmode` (`pageCloseReport`); the
 * server takes it only with `CLOSE_REPORT=1` (match `server.ts`), a placed game's door forwards it only with the host's
 * (`host/src/door.ts`). The post waits `CLOSE_REPORT_POST_DELAY_MS`, so a return made while the socket was still open
 * reaches the server after it heard that socket's close (the review's F4).
 */
export const CLOSE_REPORT_ADAPTATION = "the page's match close posted to the match server: a development and playtest instrument with no original; a development build's with ?devmode only, the server's and the door's with CLOSE_REPORT=1" as const;

/** The wait before the post, ms: the socket the return closes is heard closed by the server first (the review's F4). */
export const CLOSE_REPORT_POST_DELAY_MS = 1000;

/** The body's own marker (`kind`), so the server never reads another body as one. */
export const CLOSE_REPORT_MARKER = 's2u-dev-close-report';

/** The route and the bound, match's (`match/src/reportBounds.ts`): the door's and the server's one source. */
export { CLOSE_REPORT_BODY_MAX_BYTES, CLOSE_REPORT_PATH } from '../../../match/src/reportBounds';

/** The returns a report names (`LobbyMatchReturn['why']` but the match's own end). */
const WHYS = ['abandoned', 'kicked', 'aborted', 'net-error', 'timeout', 'late-return', 'stopped'] as const;
/** The client's states (`NetClient['state']`) and the match's phases (`LobbyMatchPhase`), and none. */
const STATES = ['connecting', 'open', 'closed', 'refused', 'none'] as const;
const PHASES = ['idle', 'loading', 'match', 'ended'] as const;
/** A call site's name: a short word of the page's own (`LobbyMatch`), never free text. */
const PATH_FORM = /^[a-z][a-z-]{0,63}$/;

/** What the page reports. */
export interface CloseReportPage {
  /** The page's seat id in the room (the welcome's). */
  id: number;
  why: typeof WHYS[number];
  /** The `LobbyMatch` call site that decided the return. */
  path: string;
  state: typeof STATES[number];
  /** The socket's close code as the page heard it, or null (not closed, or none given). */
  code: number | null;
  phase: typeof PHASES[number];
  late: boolean;
  /** Ms since the level showed (`LobbyMatch.shownAt`), or null before it. */
  sinceMatchMs: number | null;
}

/** The body as the server reads it. */
export type CloseReport = { kind: typeof CLOSE_REPORT_MARKER } & CloseReportPage;

/**
 * The route on the server a page's socket URL names (`ws://host:port/ws?...` -> `http://host:port/dev/close-report`; a
 * door's `wss://host/g/<id>` -> `https://host/g/<id>/dev/close-report`), by the voice report's rule; null
 * for a URL of another scheme or none.
 */
export function closeReportUrl(socketUrl: string): string | null {
  let u: URL;
  try { u = new URL(socketUrl); } catch { return null; }
  if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return null;
  const game = /^\/g\/[1-9][0-9]{0,15}$/.test(u.pathname) ? u.pathname : '';
  return `${u.protocol === 'wss:' ? 'https:' : 'http:'}//${u.host}${game}${CLOSE_REPORT_PATH}`;
}

/** The body: the fixed shape, its fields in one order. */
export function closeReportBody(p: CloseReportPage): string {
  const r: CloseReport = { kind: CLOSE_REPORT_MARKER, id: p.id, why: p.why, path: p.path, state: p.state, code: p.code, phase: p.phase, late: p.late, sinceMatchMs: p.sinceMatchMs };
  return JSON.stringify(r);
}

const isCount = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
const oneOf = <T extends string>(v: unknown, list: readonly T[]): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);
const KEYS = ['kind', 'id', 'why', 'path', 'state', 'code', 'phase', 'late', 'sinceMatchMs'];

/** The server's reading: the fixed shape at most `CLOSE_REPORT_BODY_MAX_BYTES`, every field in bounds, no other key; else null. */
export function parseCloseReport(raw: string): CloseReport | null {
  if (raw.length === 0 || raw.length > CLOSE_REPORT_BODY_MAX_BYTES) return null;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (Object.keys(o).length !== KEYS.length || !KEYS.every((k) => k in o)) return null;
  if (o['kind'] !== CLOSE_REPORT_MARKER || !isCount(o['id'], 255) || !oneOf(o['why'], WHYS)) return null;
  if (typeof o['path'] !== 'string' || !PATH_FORM.test(o['path']) || !oneOf(o['state'], STATES) || !oneOf(o['phase'], PHASES)) return null;
  if (!(o['code'] === null || isCount(o['code'], 4999)) || typeof o['late'] !== 'boolean') return null;
  if (!(o['sinceMatchMs'] === null || isCount(o['sinceMatchMs'], 24 * 60 * 60 * 1000))) return null;
  return { kind: CLOSE_REPORT_MARKER, id: o['id'], why: o['why'], path: o['path'], state: o['state'], code: o['code'] as number | null, phase: o['phase'], late: o['late'], sinceMatchMs: o['sinceMatchMs'] as number | null };
}

/** The page's ports: its document (for `?devmode`), the post and the wait (a test's fakes). */
export interface CloseReportPorts {
  doc?: Document | null;
  post?: (url: string, body: string) => void;
  after?: (run: () => void, ms: number) => void;
}

/** The post: one fire-and-forget request, no credentials; a failed post is nothing (an instrument). */
function pagePost(url: string, body: string): void {
  try {
    void globalThis.fetch?.(url, { method: 'POST', body, mode: 'no-cors', keepalive: true, credentials: 'omit' }).catch(() => undefined);
  } catch { /* an instrument: a failed post is nothing */ }
}

/**
 * The page's reporter (`LobbyMatchPorts.closeReport`): null without `?devmode` (`devSwitches`' tools); with it, a
 * function posting one report to the route the socket's URL names (nothing for a URL with none).
 */
export function pageCloseReport(ports: CloseReportPorts = {}): ((socketUrl: string, page: CloseReportPage) => void) | null {
  const doc = 'doc' in ports ? ports.doc : globalThis.document;
  if (!doc || !devSwitches(doc.defaultView?.location?.search ?? '').tools) return null;
  const post = ports.post ?? pagePost;
  const after = ports.after ?? ((run: () => void, ms: number): void => { setTimeout(run, ms); });
  return (socketUrl, page) => {
    const url = closeReportUrl(socketUrl);
    if (!url) return;
    const body = closeReportBody(page);                           // the fields as they stood at the return
    after(() => { post(url, body); }, CLOSE_REPORT_POST_DELAY_MS);
  };
}
