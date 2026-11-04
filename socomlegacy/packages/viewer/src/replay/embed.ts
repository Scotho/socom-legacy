import { devSwitches } from '../source';
import type { TimelineListing } from './timeline';

/**
 * The replay embedded in the session's report (web sprint 35 PT-20; spec 4.8, "Embedded in the report"; the plan's
 * review focus 5; research 244 §4). REPLAY_ADAPTATION: a browser adaptation with no original -- nothing of the game is
 * read or changed here (PT.R3) -- and, like the replay mode it belongs to, on a development build with `?devmode` only.
 *
 * The report (`packages/playtest/src/report/page.ts`) embeds `/testroom?devmode&replay=<service>/segments/<n>.s2r
 * &embedder=<report origin>` in an iframe, and each card's button posts `{ type: 's2u-replay-seek', segment, tick }` to
 * it. Here:
 * - `embedderOrigin`: the `embedder=` value is taken only when it is an http(s) origin on `localhost` or `127.0.0.1`,
 *   written as an origin exactly (no path, no user); anything else means no listener at all;
 * - `mountEmbed`: a `message` listener that takes a seek only from that exact origin (`MessageEvent.origin`), and only
 *   a well-formed one (`seekOf`: segment and tick non-negative whole numbers) -- every other message is ignored;
 * - `replaySeeker`: the seek itself, shared with the timeline (`./timeline`): the segment playing is sought in place
 *   (once it is open); another segment -- `/segments/<n>.s2r` on the same service's origin as the one playing -- is
 *   loaded by reopening the page on its address with `tick=` (`seekAddress`), every other parameter kept, since the
 *   segment may be of another map and the page's room is built for one (`./mount`'s map rule); a seek with no
 *   segment (null: the timeline on a file that is no session segment, the sprint 35 close review) is in place.
 *   RE-6 (W38.R1, additive; research 249 §2): the reopen names the target segment's map (`map=`) when the service's
 *   listing names one (`GET /segments`, read once for the timeline and handed here), so a seek across a map change
 *   loads that map once -- not the address's old map, refused by the map rule, then the right one; without a listing,
 *   or a map for that segment, the address's own `map=` is kept and the map rule corrects it on open, as before;
 * - `seekOnOpen`: the page opened with `tick=` seeks there once the segment is open.
 */

export const REPLAY_SEEK_MESSAGE = 's2u-replay-seek';

/**
 * RE-6's review (research 249 §2.1): how long a seek into another segment waits for the service's listing (to name the
 * segment's map) before it reopens the page without it, as with no listing -- so a `/segments` that hangs costs the old
 * two loads, never the seek. 1.5 s, the same order as the launch sheet's local probe (`SERVICE_PROBE_MS_PLACEHOLDER`,
 * `../launchSettings/address.ts`): the listing is a loopback read of a small JSON. A chosen instrument limit with no
 * original (REPLAY_ADAPTATION); never a game value.
 */
export const REPLAY_LISTING_WAIT_MS_PLACEHOLDER = 1500;

/** The page's `embedder=`, checked: an http(s) origin on localhost or 127.0.0.1, exactly; else null. */
export function embedderOrigin(search: string): string | null {
  let raw: string | null;
  try { raw = new URLSearchParams(search).get('embedder'); } catch { return null; }
  if (!raw) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return null;
  return url.origin === raw ? raw : null;
}

const whole = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/** A seek message's segment and tick, or null for any other message or a malformed one. */
export function seekOf(data: unknown): { segment: number; tick: number } | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as { type?: unknown; segment?: unknown; tick?: unknown };
  if (d.type !== REPLAY_SEEK_MESSAGE || !whole(d.segment) || !whole(d.tick)) return null;
  return { segment: d.segment, tick: d.tick };
}

/** The page's `tick=`: a non-negative whole number written as one, else null. */
export function startTick(search: string): number | null {
  let raw: string | null;
  try { raw = new URLSearchParams(search).get('tick'); } catch { return null; }
  if (raw === null || !/^(0|[1-9][0-9]*)$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

/** The segment index a session segment's address names (`/segments/<n>.s2r`, the route's exact form), else null. */
export function segmentIndex(replay: string): number | null {
  let path: string;
  try { path = new URL(replay).pathname; } catch { return null; }
  const m = /^\/segments\/(0|[1-9][0-9]*)\.s2r$/.exec(path);
  const n = m ? Number(m[1]) : NaN;
  return Number.isSafeInteger(n) ? n : null;
}

/** The address of segment `n` on the service that serves `replay` (its origin's `/segments/<n>.s2r`). */
export function segmentAddress(replay: string, n: number): string {
  return new URL(`/segments/${n}.s2r`, new URL(replay).origin).href;
}

/**
 * The page's search with `replay=` set to `url` and `tick=` to `tick` -- each in place, else appended; the rest as written.
 * RE-6 (W38.R1: an optional argument, the call without it unchanged): `map`, when given, sets `map=` the same way, in
 * upper case as `./mount` `replayMapAddress` writes it.
 */
export function seekAddress(search: string, url: string, tick: number, map?: string | null): string {
  const parts = search.replace(/^\?/, '').split('&').filter(Boolean);
  const key = (p: string): string => { try { return decodeURIComponent(p.split('=')[0]!); } catch { return p; } };
  const set = (k: string, v: string): void => {
    const i = parts.findIndex((p) => key(p) === k);
    if (i >= 0) parts[i] = `${k}=${v}`; else parts.push(`${k}=${v}`);
  };
  set('replay', encodeURIComponent(url));
  set('tick', String(tick));
  if (map) set('map', encodeURIComponent(map.toUpperCase()));
  return `?${parts.join('&')}`;
}

/** What a seek needs of the replay: `ReplayClient`'s. */
export interface SeekTarget { readonly state: string; readonly ready: Promise<void>; seek(tick: number): number }

/**
 * The seek to `segment` and `tick`: in place when that segment is the one playing, or when `segment` is null (the file
 * playing, whatever its address), once it is open; else the page reopened on the segment's address at the tick -- with
 * RE-6's `listing` (optional, W38.R1), once it has settled, on the map it names for that segment; past
 * `REPLAY_LISTING_WAIT_MS_PLACEHOLDER` without it, on the address's own map. The latest seek wins: a seek made while a
 * reopen still waits on the listing cancels that reopen. Nothing when the page has no replay address.
 */
export function replaySeeker(o: {
  search: string; client: SeekTarget; location: Pick<Location, 'pathname' | 'hash' | 'replace'>;
  listing?: Promise<TimelineListing | null> | null;
}): (segment: number | null, tick: number) => void {
  let playing: string | null = null;
  try { playing = new URL(new URLSearchParams(o.search).get('replay') ?? '').href; } catch { playing = null; }
  let latest = 0;                                       // the seeks made: only the latest's pending reopen goes on
  return (segment, tick) => {
    if (playing === null || (segment !== null && !whole(segment)) || !whole(tick)) return;
    const mine = ++latest;
    const target = segment === null ? playing : segmentAddress(playing, segment);
    if (target === playing) {
      void o.client.ready.then(() => { if (o.client.state === 'open') o.client.seek(tick); });
      return;
    }
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reopen = (map: string | null): void => {
      if (done || mine !== latest) return;
      done = true;
      if (timer !== undefined) clearTimeout(timer);
      o.location.replace(`${o.location.pathname}${seekAddress(o.search, target, tick, map)}${o.location.hash}`);
    };
    if (!o.listing) { reopen(null); return; }
    timer = setTimeout(() => { reopen(null); }, REPLAY_LISTING_WAIT_MS_PLACEHOLDER);
    void o.listing.then(
      (l) => { reopen(l?.segments.find((x) => x.index === segment)?.map ?? null); },
      () => { reopen(null); },
    );
  };
}

/** The page opened with `tick=`: once the segment is open, seek there. */
export function seekOnOpen(search: string, client: SeekTarget): void {
  const tick = startTick(search);
  if (tick === null) return;
  void client.ready.then(() => { if (client.state === 'open') client.seek(tick); });
}

/**
 * The `message` listener: a seek from the embedder's exact origin, well formed, is handed to `seek`; every other
 * message is ignored. Null (no listener) off a development build, without `?devmode`, or without a good `embedder=`.
 */
export function mountEmbed(o: {
  window: Pick<Window, 'addEventListener' | 'removeEventListener'>; search: string; seek: (segment: number, tick: number) => void; dev?: boolean;
}): { dispose(): void } | null {
  const dev = o.dev ?? import.meta.env.DEV;
  if (!dev || !devSwitches(o.search, dev).tools) return null;
  const from = embedderOrigin(o.search);
  if (from === null) return null;
  const onMessage = (e: MessageEvent): void => {
    if (e.origin !== from) return;
    const s = seekOf(e.data);
    if (s) o.seek(s.segment, s.tick);
  };
  o.window.addEventListener('message', onMessage);
  return { dispose: () => { o.window.removeEventListener('message', onMessage); } };
}
