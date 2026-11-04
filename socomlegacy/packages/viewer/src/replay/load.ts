import { decodeRecords, readReplayHeader, REPLAY_FORMATS, REPLAY_PROTOCOLS, type ReplayHeader, type ReplayRecord } from '../../../match/src/replay/format';
import { isPinnedReplayDoor, replayDoorShaped, type PinnedReplayDoor } from '../connectHost';
import { universeServiceBase } from '../universeHost';
import type { ReplayLoadKind } from './refusalKind';

/**
 * A recorded segment read in the page (web sprint 35 PT-18; W35.R1, W35.R2; research 244 §2). REPLAY_ADAPTATION: a
 * browser adaptation with no original -- nothing of the game is read or changed here (PT.R3).
 *
 * `loadSegment(url)` fetches the file; a closed segment is gzip (`gzipReplay`, research 240 §1), known by its first two
 * bytes `1f 8b`, and is inflated by the platform's own `DecompressionStream('gzip')` (W35.R1: no dependency, and the
 * format's `gunzipReplay` is Node's); a live segment's flushed prefix is plain and read as it is. Then `decodeRecords`
 * (default protocols: every one this build keeps a decoder for, `REPLAY_PROTOCOLS`, PT.R10). Every refusal becomes a
 * `ReplayLoadError` whose message is a sentence for the player -- what the file is and what this build plays -- so the
 * page says why and never shows an empty room; MU2-14: and whose `kind` (`./refusalKind`) says the same as data.
 *
 * The address (W35.R2): an http(s) URL on `localhost` or `127.0.0.1` only -- the session service's
 * `/segments/<n>.s2r` -- never a path: a page has no file system, and a path on the dev server would mean copying
 * evidence into the tree.
 *
 * PT-27 (W36.R5; research 245 §5): one more address -- a hosted replay on the page's own configured match server
 * (`./mount` `replayServer`: `online.ts`'s `resolveOnline`, as the page joins it), exactly `/replays/<16 lower-case hex>`
 * on that server's origin (its ws(s) target read as http(s) by `universeServiceBase`'s rule), no query, no hash, no
 * user. Only that fetch carries the page's login ticket, as `Authorization: Bearer`, when the page holds one; it refuses
 * a redirect (`redirect: 'error'`, and an answer from another address is not read) and sends no cookie. Its 404 is one
 * sentence for "not found" and "not yours" alike (W36.R2: a hidden replay is not told apart).
 *
 * SA-9b (`../connectHost` `REPLAY_DOOR_ADAPTATION`; SA.R21 (d), SA.R24): a third -- a hosted replay at its host's door,
 * fetched only with the door central's grant named, pinned (`LoadSegmentDeps.door`), the grant its bearer and never the
 * ticket. The door's refusals carry no CORS, so a 404 and a throw both read `missing`; its 503 `unavailable`. Its body
 * is read through `REPLAY_DOOR_BODY_MAX_BYTES_ADAPTATION` while it streams and its gzip inflated through
 * `REPLAY_DOOR_INFLATED_MAX_BYTES_ADAPTATION`, each stopped the moment it passes (a host is not trusted with the page's
 * memory), and its records counted on their framing before any is decoded (`REPLAY_DOOR_RECORDS_MAX_ADAPTATION`); past
 * any, or a body that does not decode, `missing` (a recording of another version stays `version`, in fixed words).
 * An address on a door's host (`replayDoorShaped`) without its pinned door is never fetched, and `checkReplayUrl` -- the
 * development `?replay=` mode's -- never takes one.
 */

export interface LoadedSegment {
  header: ReplayHeader; records: ReplayRecord[]; truncated: boolean;
  /** The file was gzip: a closed segment (research 240 §5), which no later fetch changes; a plain one is a live prefix. */
  closed?: boolean;
}

/**
 * A segment the page cannot play, and why, in words -- and, MU2-14, as data: `kind` (`./refusalKind`), set where each
 * sentence is built, so a reader (the modern Replays viewer) never parses the words. Made with no kind, it is
 * `unavailable` (anything else).
 */
export class ReplayLoadError extends Error {
  override name = 'ReplayLoadError';
  constructor(message: string, readonly kind: ReplayLoadKind = 'unavailable') {
    super(message);
  }
}

/** "10 and 11", "10, 11 and 12". */
function listed(ns: readonly number[]): string {
  return ns.length < 2 ? ns.join('') : `${ns.slice(0, -1).join(', ')} and ${ns.at(-1)}`;
}

/** The page's configured match server, for the replay address and the bearer (`./mount` `replayServer`). */
export interface ReplayServerOptions {
  /** The server the page joins (`OnlineTarget.url`: a ws(s) URL), or null / absent for none. */
  server?: string | null;
}

/** A hosted replay's path on the match server (PT-26's route; the id's form is research 245 §2's: 16 lower-case hex). */
const HOSTED_REPLAY_PATH = /^\/replays\/[0-9a-f]{16}$/;

/** The 404 of a hosted replay (W36.R2): a replay hidden from this caller and one that is not there read the same. */
export const REPLAY_NOT_FOUND_OR_NOT_YOURS = 'This recording was not found on the match server, or it is not yours to watch.';

/**
 * The configured server's HTTP origin, or null for none: its ws(s) URL read as http(s) at the same host by
 * `universeServiceBase`'s rule (the page's other services on the match server); anything it cannot read is none,
 * never the page's own origin.
 */
function serverOrigin(server: string | null | undefined): string | null {
  if (!server) return null;
  const base = universeServiceBase(`?server=${encodeURIComponent(server)}`, { protocol: '', host: '', origin: '' });
  try { return base === '' ? null : new URL(base).origin; } catch { return null; }
}

/** Whether `raw` is a hosted replay on the configured server: its origin exactly, `/replays/<id>`, nothing more. */
function isHostedReplay(raw: string, server: string | null | undefined): boolean {
  const origin = serverOrigin(server);
  if (origin === null || raw.includes('?') || raw.includes('#')) return false;
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  return url.origin === origin && url.username === '' && url.password === '' && HOSTED_REPLAY_PATH.test(url.pathname);
}

/**
 * The replay address checked (W35.R2, W36.R5): an absolute http(s) URL on localhost or 127.0.0.1 (unchanged), or a
 * hosted replay on the page's configured match server (`isHostedReplay`); else a ReplayLoadError.
 */
export function checkReplayUrl(raw: string, opts: ReplayServerOptions = {}): URL {
  if (replayDoorShaped(raw)) throw new ReplayLoadError(REPLAY_DOOR_NOT_HERE, 'unavailable');      // SA.R24
  let url: URL | null = null;
  try { url = new URL(raw); } catch { url = null; }
  if (url && (url.protocol === 'http:' || url.protocol === 'https:') && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) return url;
  if (url && isHostedReplay(raw, opts.server)) return url;
  const origin = serverOrigin(opts.server);
  throw new ReplayLoadError(origin === null
    ? 'The replay address must be a web address on this computer (localhost or 127.0.0.1).'
    : `The replay address must be a web address on this computer (localhost or 127.0.0.1), or a replay on this page's match server (${origin}/replays/ and its id).`, 'unavailable');
}

/**
 * SA-9b: the most of a door's body the page reads, 64 MiB. Measured (the review's F2 pass): a recorded five-minute
 * MP2 classic match (the PT-28 run, 2026-10-09, 300.5 s) is 2,069,910 bytes gzipped, 6.9 KB/s -- so about 2.7 hours
 * of such a match.
 */
export const REPLAY_DOOR_BODY_MAX_BYTES_ADAPTATION = 64 * 2 ** 20;
/**
 * SA-9b: the most a door's gzip may inflate to, 256 MiB; past it the inflation stops (a gzip bomb). The same match is
 * 8,505,086 bytes inflated, 28.3 KB/s -- about 2.6 hours of it.
 *
 * **The bounds' cost** (the lane's word, 2026-10-18): a genuine hosted recording longer than about 2.6 hours of such a
 * match reads `missing`. Accepted over letting a host make the tab hold half a gigabyte.
 */
export const REPLAY_DOOR_INFLATED_MAX_BYTES_ADAPTATION = 256 * 2 ** 20;
/**
 * SA-9b (the review's F2): the most records a door's segment may hold, 750,000, counted on the framing before any is
 * decoded (256 MiB of minimal records would be tens of millions of objects). Measured: the same match holds 12,355
 * records in 300.5 s, 41.1 a second (9,014 snaps at 30 a second, 3,292 events, 47 rosters) -- 148,000 an hour; the
 * bound is about five times that.
 */
export const REPLAY_DOOR_RECORDS_MAX_ADAPTATION = 750_000;
/** SA-9b (the review's F1): a door's recording of another version, in fixed words -- never the header's values. */
export const REPLAY_DOOR_OTHER_VERSION = 'This recording was made by another version of the game server than this page plays.';

/** SA-9b: a door's refusal -- its 404 or a throw (no CORS on a refusal), the two read alike. */
export const REPLAY_DOOR_REFUSED = 'This recording could not be fetched from the server that kept it: it is gone, it is not yours to watch, or that server did not answer.';
/** SA-9b: a body past a bound, or one that does not decode. */
const REPLAY_DOOR_UNREADABLE = 'The recording the server that kept it sent could not be read.';
/** SA-9b: an address on a door's host without the grant central gave for it. */
const REPLAY_DOOR_NOT_HERE = "A replay kept by another server opens only from the Replays list, which asks for it there.";

/** A bound passed: the read stops there. */
class PastBound extends Error {}

/** What the loader measures as it goes (the tests' window on the bounds). */
export type ReplayMeter = (what: 'read' | 'inflated' | 'records', total: number) => void;

/**
 * SA-9b (F2): the records `bytes` frames, counted on their prefixes alone (a tag byte and a little-endian u32 length,
 * `packages/match/src/replay/format.ts`'s `PREFIX`, mirrored), no payload decoded; past `max` it stops.
 */
const RECORD_PREFIX = 5;
function countRecordsAtMost(bytes: Uint8Array, max: number, meter?: ReplayMeter): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0, n = 0;
  while (at + RECORD_PREFIX <= bytes.byteLength) {
    n++;
    if (n > max) { meter?.('records', n); throw new PastBound(); }
    at += RECORD_PREFIX + view.getUint32(at + 1, true);
  }
  meter?.('records', n);
}

/** Reads `stream` whole, or stops (cancelled) the moment it passes `max` bytes. */
async function readAtMost(stream: ReadableStream<Uint8Array>, max: number, what: 'read' | 'inflated', meter?: ReplayMeter): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    meter?.(what, total);
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw new PastBound();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out;
}

/** Inflates gzip bytes through the platform's `DecompressionStream`; SA-9b: with `max`, stopped past it. */
async function gunzip(bytes: Uint8Array, max?: number, meter?: ReplayMeter): Promise<Uint8Array> {
  try {
    const stream = new Response(bytes as BodyInit).body!.pipeThrough(new DecompressionStream('gzip'));
    if (max !== undefined) return await readAtMost(stream, max, 'inflated', meter);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (e) {
    if (e instanceof PastBound) throw e;
    throw new ReplayLoadError('The recording is not a readable gzip file.', 'corrupt');
  }
}

/** `decodeRecords`' refusal, said as a sentence (the header read first, without its checks: `readReplayHeader`). */
function refusal(bytes: Uint8Array, e: unknown, door = false): ReplayLoadError {
  let h: ReplayHeader | null = null;
  try { h = readReplayHeader(bytes); } catch { h = null; }
  if (!h) return new ReplayLoadError('This file is not a replay recording (it has no header).', 'corrupt');
  // SA-9b (F1): a door's header is a host's words -- another version only when both are whole numbers, said in fixed
  // words; anything else is a body that does not decode
  if (door) {
    if (!Number.isSafeInteger(h.format) || !Number.isSafeInteger(h.protocol)) return new ReplayLoadError('This recording is damaged and cannot be played.', 'corrupt');
    if (!REPLAY_FORMATS.includes(h.format) || !REPLAY_PROTOCOLS.includes(h.protocol)) return new ReplayLoadError(REPLAY_DOOR_OTHER_VERSION, 'version');
    return new ReplayLoadError('This recording is damaged and cannot be played.', 'corrupt');
  }
  // RE-2 (W38.R2): format 1 (no hostages) and 2 are read; another is refused in words.
  if (!REPLAY_FORMATS.includes(h.format)) {
    return new ReplayLoadError(`This recording's file format is version ${String(h.format)}; this build reads ${REPLAY_FORMATS.length < 2 ? 'version' : 'versions'} ${listed(REPLAY_FORMATS)}.`, 'version');
  }
  if (!REPLAY_PROTOCOLS.includes(h.protocol)) {
    return new ReplayLoadError(`This recording was made with network protocol ${String(h.protocol)}; this build plays protocols ${listed(REPLAY_PROTOCOLS)}.`, 'version');
  }
  return new ReplayLoadError(`This recording is damaged and cannot be played (${e instanceof Error ? e.message : String(e)}).`, 'corrupt');
}

/**
 * The bytes of a segment file, decoded (gzip or plain); SA-9b: `inflated`, the most its gzip may inflate to; `records`,
 * the most records it may frame (counted before decoding); `door`, a host's file (its refusals in fixed words).
 */
export async function decodeSegment(raw: Uint8Array, opts: { inflated?: number; records?: number; door?: boolean; meter?: ReplayMeter } = {}): Promise<LoadedSegment> {
  if (raw.byteLength === 0) throw new ReplayLoadError('The recording is empty.', 'corrupt');
  const bytes = raw[0] === 0x1f && raw[1] === 0x8b ? await gunzip(raw, opts.inflated, opts.meter) : raw;
  if (opts.records !== undefined) countRecordsAtMost(bytes, opts.records, opts.meter);
  let out: { records: ReplayRecord[]; truncated: boolean };
  try { out = decodeRecords(bytes); } catch (e) { throw refusal(bytes, e, opts.door === true); }
  const first = out.records[0];
  if (!first) throw new ReplayLoadError(bytes.byteLength === 0 ? 'The recording is empty.' : 'The recording holds no whole record yet.', 'corrupt');
  if (first.kind !== 'header') throw new ReplayLoadError('This file is not a replay recording (it has no header).', 'corrupt');
  return { header: first.header, records: out.records, truncated: out.truncated, closed: bytes !== raw };
}

export interface LoadSegmentDeps extends ReplayServerOptions {
  fetch?: typeof fetch;
  /** The page's login ticket, or null / '' / absent when it holds none: the bearer of a hosted replay's fetch only. */
  ticket?: () => string | null;
  /** SA-9b: the door central's grant named for this replay, pinned, and the grant -- the only way a door is fetched. */
  door?: { door: PinnedReplayDoor; grant: string };
  /** SA-9b: the tests' smaller bounds; absent, the three adaptations (a bound left out is its adaptation). */
  bounds?: { body: number; inflated: number; records?: number };
  /** SA-9b: the bytes read and inflated as they go (the tests'). */
  meter?: ReplayMeter;
}

/** SA-9b: a door's segment (the module's doc): the grant its bearer, the bounds while it streams. */
async function loadFromDoor(url: string, door: { door: PinnedReplayDoor; grant: string }, deps: LoadSegmentDeps): Promise<LoadedSegment> {
  const get = deps.fetch ?? globalThis.fetch.bind(globalThis);
  const bounds = deps.bounds ?? { body: REPLAY_DOOR_BODY_MAX_BYTES_ADAPTATION, inflated: REPLAY_DOOR_INFLATED_MAX_BYTES_ADAPTATION };
  const records = bounds.records ?? REPLAY_DOOR_RECORDS_MAX_ADAPTATION;
  let res: Response;
  try {
    res = await get(url, { cache: 'no-store', redirect: 'error', credentials: 'omit', headers: { authorization: `Bearer ${door.grant}` } });
  } catch {
    throw new ReplayLoadError(REPLAY_DOOR_REFUSED, 'missing');
  }
  if (res.redirected || (res.url !== '' && res.url !== new URL(url).href)) {
    await res.body?.cancel().catch(() => undefined);
    throw new ReplayLoadError('The server that kept the recording answered with a redirect, which the replay mode does not follow.', 'unavailable');
  }
  if (res.status === 404) throw new ReplayLoadError(REPLAY_DOOR_REFUSED, 'missing');
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new ReplayLoadError(res.status === 503
      ? 'The server that kept the recording is busy; try again in a moment.'
      : `The recording could not be fetched from the server that kept it (HTTP ${res.status}).`, 'unavailable');
  }
  const declared = res.headers.get('content-length');
  try {
    if (declared !== null && /^[0-9]+$/.test(declared) && Number(declared) > bounds.body) {
      await res.body?.cancel().catch(() => undefined);
      throw new PastBound();
    }
    const raw = res.body ? await readAtMost(res.body, bounds.body, 'read', deps.meter) : new Uint8Array(0);
    return await decodeSegment(raw, { inflated: bounds.inflated, records, door: true, ...(deps.meter ? { meter: deps.meter } : {}) });
  } catch (e) {
    if (e instanceof ReplayLoadError && e.kind === 'version') throw e;              // a real recording of another protocol
    throw new ReplayLoadError(REPLAY_DOOR_UNREADABLE, 'missing');                    // F5: past a bound, or not one
  }
}

/**
 * Fetches and decodes the segment at `url` (the page checks the address with `checkReplayUrl` first: `./mount`). A
 * hosted replay on the configured server (`isHostedReplay`, re-read here) is fetched with the ticket as its bearer when
 * one is held, `redirect: 'error'` and no cookie; any other address exactly as before, with no header.
 */
export async function loadSegment(url: string, deps: LoadSegmentDeps = {}): Promise<LoadedSegment> {
  // SA-9b: a door only with its pinned door, for that very address; any other address on a door's host never
  if (deps.door && isPinnedReplayDoor(deps.door.door) && deps.door.door.url === url) return loadFromDoor(url, deps.door, deps);
  if (replayDoorShaped(url)) throw new ReplayLoadError(REPLAY_DOOR_NOT_HERE, 'unavailable');
  const get = deps.fetch ?? globalThis.fetch.bind(globalThis);
  const hosted = isHostedReplay(url, deps.server);
  const ticket = hosted ? deps.ticket?.() ?? null : null;
  const init: RequestInit = !hosted ? { cache: 'no-store' } : {
    cache: 'no-store', redirect: 'error', credentials: 'omit',
    ...(typeof ticket === 'string' && ticket !== '' ? { headers: { authorization: `Bearer ${ticket}` } } : {}),
  };
  let res: Response;
  // A hosted fetch the platform rejects is one of three the page cannot tell apart (a TypeError each): no answer, a
  // redirect (`redirect: 'error'`), or the server's 403 to an origin not in its ALLOWED_ORIGINS, which carries no CORS
  // header (research 245 §4, "CORS") -- the sentence names all three (the sprint 36 close, review B).
  try { res = await get(url, init); } catch {
    throw new ReplayLoadError(hosted
      ? "The recording could not be fetched (the match server did not answer, answered with a redirect, or this page's address is not among the server's allowed origins)."
      : 'The recording could not be fetched (the session service did not answer).', 'unavailable');
  }
  if (hosted && (res.redirected || (res.url !== '' && res.url !== new URL(url).href))) {
    throw new ReplayLoadError('The match server answered with a redirect, which the replay mode does not follow.', 'unavailable');
  }
  if (hosted && res.status === 404) throw new ReplayLoadError(REPLAY_NOT_FOUND_OR_NOT_YOURS, 'missing');
  if (!res.ok) throw new ReplayLoadError(`The recording could not be fetched (HTTP ${res.status}).`, 'unavailable');
  return decodeSegment(new Uint8Array(await res.arrayBuffer()));
}
