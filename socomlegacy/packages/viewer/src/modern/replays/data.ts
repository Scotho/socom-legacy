/**
 * The Replays section's data (MU-10 of `docs/plans/2026-10-09-modern-ui-parallel.md`; MU.R9; the dialogue's D2.8). A
 * browser adaptation (MU.R1): SOCOM II keeps no match and lists none (REPLAY_ADAPTATION, `packages/match/src/replay/
 * format.ts`), so nothing here is a game value.
 *
 * **The route is the match server's own, read as it is** (web sprint 36 PT-26; `packages/central/src/replay/http.ts`;
 * spec 4.9; research 245 §4): `GET /replays?mine=1` answers `{ replays: [{ id, room, map, rules, startedAt, seconds,
 * players: [{ name, team }] }] }`, newest first, only the replays whose record names the bearer's account
 * (REPLAYS-MINE, the owner 2026-11-12: "Your Replays should show Your Accounts Replays"; without `mine` central's
 * listing is every replay since MS-6, MS.R2, which this list does not ask; no bearer, or a ticket the server does not
 * know, gets an empty list -- never a 401; a central from before `mine` ignores it and answers its whole listing). No
 * route is added: this reads that one, with the session's ticket (`../session`, memory only) as `Authorization: Bearer`, at the
 * account requests' base (`accountServiceBase`, `../../connectHost`: the page's own origin, `server=` only under the
 * developer's `?devmode` on a development build), so the live bearer goes nowhere the session's own requests do not.
 * No cookie (`credentials: 'omit'`), no redirect followed (`redirect: 'error'`, as `../../replay/load`'s hosted fetch).
 *
 * **What a row shows is what the record holds**: the map's stem, the rules, the start, the length (`seconds`, the server's
 * `ticks / TICK_HZ` rounded), the players by name and team, and -- RV-4 (web sprint 39; research 245 §8, 276 §3) -- the
 * `result` when the record holds one: the last `roundOver` the room broadcast, its four fields as the server's sidecar
 * keeps them (`packages/match/src/replay/sidecar.ts` `ReplayResult`). An older record carries none, and none is drawn.
 *
 * **Paging** (RV-4; W39.R2, additive): an answer with more after it carries `next`, an opaque cursor the page never reads
 * but passes back as `before=` (`more`). `replaysOf` keeps an answer's cursor with the list it made (`nextCursor`), so a
 * list handed through a wrapper that returns it as it came (Home's `shareReplaySource`) still says where it ends.
 *
 * The answer is checked field by field; another shape is a refusal. An `id` that is not the route's 16 lower-case hex
 * (`REPLAY_ID_PATTERN`, `packages/match/src/replay/sidecar.ts`) is another shape too, so no address is ever built from
 * a malformed one (`replayAddress`).
 *
 * **SA-9b: replays kept by a host** (the server split, SA.R21 (d), SA.R24; `../../connectHost` `REPLAY_DOOR_ADAPTATION`).
 * Central's listing carries, on a replay a host keeps, `host` -- its hostId, 43 base64url characters -- and two hosts may
 * keep equal ids, so a row is known by `replayKey`, `<host>/<id>` (a local one by its id alone, which holds no `/`).
 * Such a replay is not at `<base>/replays/<id>`: Watch asks central for a grant (`askReplayGrant`, `POST
 * <base>/replays/grant` with the login's bearer) and fetches the door its answer names with the grant
 * (`../../replay/load`), the grant in memory for that Watch only.
 *
 * **LCM-RP (RB-6, RB-11): the public replay** (a browser adaptation, OT.R53). The replay page reads central's public
 * entry (`fetchPublicReplayEntry`, `/api/stats/replay/<id>`) and, with no sign-in, Watch fetches it through central's
 * public route with the match named (`publicReplayAddress`), followed to its door (`../../replay/load` `loadPublicSegment`).
 */

import { pinnedReplayDoor, type PinnedReplayDoor } from '../../connectHost';

/** The listing's path on the match server (`REPLAYS_ROUTES`, `packages/central/src/replay/http.ts`). */
export const MU_REPLAYS_PATH = '/replays';

/** A replay's id: the route's form (research 245 §2; `load.ts`'s `HOSTED_REPLAY_PATH`). */
const ID = /^[0-9a-f]{16}$/;

export interface ReplayPlayerEntry { name: string; team: string | null }
/**
 * RV-4: a match's result as the room said it at its last round's end (the sidecar's `result`): `winner` that round's side
 * (null a draw), `wins` the rounds each side won, `matchOver` whether the room ended the match there (false: cut short).
 */
export interface ReplayResult { round: number; winner: 'seal' | 'terrorist' | null; wins: { seal: number; terrorist: number }; matchOver: boolean }
export interface ReplayEntry {
  id: string;
  /** The room's key (`MP2/classic`, `game/MP2/7`). */
  room: string;
  /** The map's stem (`MP2`); its name and picture are the disc's (MU.R3). */
  map: string;
  rules: string;
  /** ISO 8601, the recording's wall-clock start. */
  startedAt: string;
  /** The recording's length in whole seconds. */
  seconds: number;
  players: ReplayPlayerEntry[];
  /** RV-4: the record's result; absent when it holds none (an older record, or a match with no round's end). */
  result?: ReplayResult;
  /** SA-9b: the hostId of the host that keeps it; absent, central keeps it (fetched at `<base>/replays/<id>`). */
  host?: string;
  /**
   * RB-32 (the replay batch, `docs/plans/2026-11-08-replay-batch.md`): the match's mode as the listing names it, when it
   * names one (the viewer's head draws it as a chip, the S2 Launcher v2 export's `D:256`); absent -- today's listing, or
   * an empty string -- no chip. Additive: no route writes it yet. A browser adaptation's field (OT.R53).
   */
  mode?: string;
  /**
   * LCM-RP (RB-6, RB-11): the ended match central's public entry names for it (`/api/stats/replay/<id>?match=`'s
   * `matchId`), sent back on the signed-out fetch (`publicReplayAddress`); absent -- the listing's entries, or none named.
   */
  matchId?: string;
}

/** Why the list failed: no answer, no replays kept on this server (404: `REPLAYS_DIR` unset), or another refusal. */
export type ReplayListFailure = 'unreachable' | 'not-kept' | 'refused';

export class ReplayListError extends Error {
  constructor(readonly kind: ReplayListFailure) {
    super(`replays: ${kind}`);
    this.name = 'ReplayListError';
  }
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const obj = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('replays: not the shape');
  return v as Record<string, unknown>;
};

/** SA-9b: a hostId's form (central's `HOST_ID`, RFC 7638's thumbprint): 43 base64url characters. */
const HOST_ID = /^[A-Za-z0-9_-]{43}$/;
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/** RV-4: an entry's `result`, field by field (nothing else of it kept); another shape throws. */
function resultOf(raw: unknown): ReplayResult {
  const r = obj(raw);
  const w = obj(r['wins']);
  const round = r['round'], winner = r['winner'], seal = w['seal'], terrorist = w['terrorist'], matchOver = r['matchOver'];
  if (!isCount(round) || !(winner === null || winner === 'seal' || winner === 'terrorist') || !isCount(seal) || !isCount(terrorist)
    || typeof matchOver !== 'boolean') throw new Error('replays: not the shape');
  return { round, winner, wins: { seal, terrorist }, matchOver };
}

function entryOf(raw: unknown): ReplayEntry {
  const e = obj(raw);
  const { id, room, map, rules, startedAt, seconds, players, result, host, mode } = e;
  if (host !== undefined && !(isStr(host) && HOST_ID.test(host))) throw new Error('replays: not the shape');
  if (mode !== undefined && !isStr(mode)) throw new Error('replays: not the shape');   // RB-32: a string or absent
  if (!isStr(id) || !ID.test(id) || !isStr(room) || !isStr(map) || !isStr(rules) || !isStr(startedAt)) throw new Error('replays: not the shape');
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) throw new Error('replays: not the shape');
  if (!Array.isArray(players)) throw new Error('replays: not the shape');
  return {
    id, room, map, rules, startedAt, seconds,
    players: players.map((p) => {
      const q = obj(p);
      if (!isStr(q['name']) || !(q['team'] === null || q['team'] === undefined || isStr(q['team']))) throw new Error('replays: not the shape');
      return { name: q['name'], team: (q['team'] as string | null | undefined) ?? null };
    }),
    ...(result === undefined ? {} : { result: resultOf(result) }),
    ...(host === undefined ? {} : { host }),
    ...(isStr(mode) && mode !== '' ? { mode } : {}),
  };
}

/** SA-9b: a row's key -- `<host>/<id>` for a replay a host keeps, the id for central's own (the module's doc). */
export function replayKey(entry: Pick<ReplayEntry, 'id' | 'host'>): string {
  return entry.host === undefined ? entry.id : `${entry.host}/${entry.id}`;
}

/** RV-4: the cursor's form as the page accepts it -- base64url, what the route writes (`replaysCursor`); else a refusal. */
const CURSOR = /^[A-Za-z0-9_-]+$/;
/** RV-4: each list `replaysOf` made from an answer with a `next`, and that cursor. */
const NEXT = new WeakMap<readonly ReplayEntry[], string>();

/**
 * `/replays`' answer checked field by field and ordered newest first by `startedAt`; else throws. RV-4: replays that
 * started in the same millisecond keep the order the server sent them in -- its own tie order, newest `endedAt` then the
 * id (`packages/central/src/replay/http.ts` `newestFirst`), which an entry cannot be re-sorted by since it carries no
 * `endedAt` -- so pages joined end to end are the server's order across their edges (a stable sort). Its `next`, when
 * present, is kept with the list returned (`nextCursor`).
 */
export function replaysOf(raw: unknown): ReplayEntry[] {
  const answer = obj(raw);
  const list = answer['replays'];
  if (!Array.isArray(list)) throw new Error('replays: not the shape');
  const next = answer['next'];
  if (next !== undefined && !(typeof next === 'string' && CURSOR.test(next))) throw new Error('replays: not the shape');
  const out = list.map(entryOf).sort((a, b) => b.startedAt.localeCompare(a.startedAt));   // stable: a tie keeps the server's order
  if (next !== undefined) NEXT.set(out, next);
  return out;
}

/** RV-4: the cursor of the page after `list` (the answer's `next`), or null: the list's answer was the last page. */
export function nextCursor(list: readonly ReplayEntry[]): string | null {
  return NEXT.get(list) ?? null;
}

/** Where the list comes from: the match server's route, or a fixture (the tests; a later source plugs in here). */
export interface ReplayListSource {
  /** The signed-in account's recorded matches, newest first; rejects with a `ReplayListError`. Its cursor: `nextCursor`. */
  list(ticket: string): Promise<ReplayEntry[]>;
  /**
   * RV-4: the page after `cursor` (a `nextCursor`), the same way; absent, the Replays page asks the route itself at its
   * base (`httpReplaySource`), as a wrapper such as Home's `shareReplaySource` carries only `list`.
   */
  more?(ticket: string, cursor: string): Promise<ReplayEntry[]>;
}

/** `GET <base>/replays?mine=1` with the ticket as bearer (the module's doc); RV-4: `more` adds `&before=<cursor>`. */
export function httpReplaySource(base: string, fetchFn?: typeof fetch): ReplayListSource {
  const get = fetchFn ?? globalThis.fetch.bind(globalThis);
  const read = async (url: string, ticket: string): Promise<ReplayEntry[]> => {
    let res: Response;
    try {
      res = await get(url, {
        method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error', headers: { authorization: `Bearer ${ticket}` },
      });
    } catch {
      throw new ReplayListError('unreachable');
    }
    if (res.status === 404) throw new ReplayListError('not-kept');
    if (!res.ok) throw new ReplayListError('refused');
    try { return replaysOf(await res.json()); } catch { throw new ReplayListError('refused'); }
  };
  return {
    // REPLAYS-MINE: the bearer's own replays (`packages/central/src/replay/http.ts` `mine=1`), never the public whole
    list: (ticket) => read(`${base}${MU_REPLAYS_PATH}?mine=1`, ticket),
    more: (ticket, cursor) => read(`${base}${MU_REPLAYS_PATH}?mine=1&before=${encodeURIComponent(cursor)}`, ticket),
  };
}

/** A source over a fixed listing in the route's shape (checked by `replaysOf`, as the route's answer is). */
export function fixtureReplaySource(listing: unknown): ReplayListSource {
  return { list: async () => replaysOf(listing) };
}

/** A replay's file on the match server (`GET /replays/<id>`); throws for an id not of the route's form. */
export function replayAddress(base: string, id: string): string {
  if (!ID.test(id)) throw new Error('replays: not an id');
  return `${base}${MU_REPLAYS_PATH}/${id}`;
}

/**
 * LCM-RP (RB-11): the signed-out fetch's address (`../../replay/load` `loadPublicSegment`) -- `replayAddress` with the
 * ended match named (`?match=`, the entry's `matchId`), which central's public fetch reads to find the replay's host.
 */
export function publicReplayAddress(base: string, id: string, matchId: string | null): string {
  const at = replayAddress(base, id);
  return matchId ? `${at}?match=${encodeURIComponent(matchId)}` : at;
}

/** LCM-RP (RB-6): central's public replay entry (`packages/central/src/statsApiHttp.ts` `STATS_REPLAY_ENTRY_ADAPTATION`). */
export const STATS_REPLAY_ENTRY_PATH = '/api/stats/replay/';

/**
 * LCM-RP (RB-6): central's public entry checked as a listing's entry is (`entryOf`), with its `matchId` -- a non-empty
 * string kept, null or absent none; else throws.
 */
export function publicReplayEntryOf(raw: unknown): ReplayEntry {
  const e = entryOf(raw);
  const matchId = obj(raw)['matchId'];
  if (matchId !== undefined && matchId !== null && !(isStr(matchId) && matchId !== '')) throw new Error('replays: not the shape');
  return isStr(matchId) ? { ...e, matchId } : e;
}

/** LCM-RP: the public entry's answer -- the entry, `missing` (central's 404: unknown, not public, a match not naming it), or `unavailable`. */
export type PublicReplayAnswer = { kind: 'ok'; entry: ReplayEntry } | { kind: 'missing' } | { kind: 'unavailable' };

/**
 * LCM-RP (RB-6, RB-12): `GET <base>/api/stats/replay/<id>[?match=<matchId>]`, no bearer, no cookie, no redirect followed;
 * the answer checked (`publicReplayEntryOf`). Never throws; an id not of the route's form is asked nothing (`missing`).
 */
export async function fetchPublicReplayEntry(base: string, id: string, matchId: string | null, fetchFn?: typeof fetch): Promise<PublicReplayAnswer> {
  if (!ID.test(id)) return { kind: 'missing' };
  const get = fetchFn ?? globalThis.fetch.bind(globalThis);
  let res: Response;
  try {
    res = await get(`${base}${STATS_REPLAY_ENTRY_PATH}${id}${matchId ? `?match=${encodeURIComponent(matchId)}` : ''}`, {
      method: 'GET', credentials: 'omit', redirect: 'error', headers: { accept: 'application/json' },
    });
  } catch {
    return { kind: 'unavailable' };
  }
  if (res.status === 404) return { kind: 'missing' };
  if (!res.ok) return { kind: 'unavailable' };
  try { return { kind: 'ok', entry: publicReplayEntryOf(await res.json()) }; } catch { return { kind: 'unavailable' }; }
}

/** SA-9b: central's grant route (`packages/central/src/replays.ts` `REPLAY_GRANT_PATH`). */
export const REPLAY_GRANT_PATH = '/replays/grant';

/**
 * SA-9b: central's answer to a Watch of a replay a host keeps -- `local` (fetch it at `<base>/replays/<id>` as today),
 * `door` (its door pinned, the grant, its `expiresAt` as central wrote it), or a refusal: `signed-out` (no ticket, or
 * central's 401), `missing` (404: not listed, not yours, or its host gone) or `unavailable` (503, any other answer).
 */
export type ReplayGrant =
  | { kind: 'local' }
  | { kind: 'door'; door: PinnedReplayDoor; grant: string; expiresAt: number }
  | { kind: 'signed-out' } | { kind: 'missing' } | { kind: 'unavailable' };

/**
 * SA-9b: `POST <base>/replays/grant` for `entry` with the ticket as bearer, `{ host, id }` as JSON, no cookie, no
 * redirect; the answer checked field by field (`url` and `grant` both or neither, the url a door `pinnedReplayDoor`
 * takes for this id under `devDoors`). Never throws.
 */
export async function askReplayGrant(base: string, ticket: string | null, entry: Pick<ReplayEntry, 'id' | 'host'>, devDoors: boolean,
  fetchFn?: typeof fetch): Promise<ReplayGrant> {
  if (!ticket) return { kind: 'signed-out' };
  const get = fetchFn ?? globalThis.fetch.bind(globalThis);
  let res: Response;
  try {
    res = await get(`${base}${REPLAY_GRANT_PATH}`, {
      method: 'POST', cache: 'no-store', credentials: 'omit', redirect: 'error',
      headers: { authorization: `Bearer ${ticket}`, 'content-type': 'application/json' },
      body: JSON.stringify(entry.host === undefined ? { id: entry.id } : { host: entry.host, id: entry.id }),
    });
  } catch {
    return { kind: 'unavailable' };
  }
  if (res.status === 401) return { kind: 'signed-out' };
  if (res.status === 404) return { kind: 'missing' };
  if (res.status !== 200) return { kind: 'unavailable' };
  let a: Record<string, unknown>;
  try { a = obj(await res.json()); } catch { return { kind: 'unavailable' }; }
  if (a['status'] !== 0) return { kind: 'unavailable' };
  const { url, grant, expiresAt } = a;
  if (url === undefined && grant === undefined) return { kind: 'local' };
  if (!isStr(grant) || grant === '' || typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return { kind: 'unavailable' };
  const door = pinnedReplayDoor(url, entry.id, devDoors);
  return door === null ? { kind: 'unavailable' } : { kind: 'door', door, grant, expiresAt };
}

/** Whole seconds as `m:ss`, or `h:mm:ss` from an hour. */
export function durationText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
}
