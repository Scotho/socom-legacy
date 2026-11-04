import type { ArmoryData } from '../armoryData';
import type { ArmoryExit } from '../armoryState';
import { seatWelcome, type GameLobbyHandOff } from '../gameLobbyHost';
import { NetClient, type NetWalk, type WebSocketLike } from '../net/client';
import type { ClientEvent, ServerEvent } from '../net/protocol';
import type { ForgeLobbyChatLine, ForgeLobbyDeps, ForgeLobbyRequest, GameLobbyEvent } from './lobby/deps';
export { LOBBY_PASSWORD_MAX, lobbyPasswordOk } from './lobby/deps';
import { parseAssetId, parseLayout, type Layout, type LayoutSettings } from './layout';

/**
 * FORGE (FG-26; FG.R19-R21; the owner, 2026-10-14: "A new create lobby button should be added that creates a match with
 * the current map"): the forge's client of the match server's forge lobbies -- a browser adaptation with no original;
 * nothing of the game's behaviour is changed by it. It speaks the server's own routes and hello as FG-25 defines them
 * (`packages/central/src/forgeLobbyHttp.ts`'s table, `server.ts` `joinForge`) and feeds the lobby popup (`./lobby`, its
 * seam `./lobby/deps` `ForgeLobbyDeps`) as `../gameLobbyHost` `GameSocketHost` feeds the game lobby's rows.
 *
 * - **Where**: the page's own origin -- `../connectHost` `accountServiceBase` for the routes and `pinnedMatchSocket`
 *   for the socket (the page passes them in) -- since a request may carry the login's bearer and the hello the host
 *   ticket (HARD-SEAT, research 169 measure 7: `server=` only under a development build's `?devtools`, which `?devmode` sets).
 * - **The hello**: `NetClient`'s own forge options (`../net/client` `NetOptions.forge`, `forgeAccount`; FG-34, the
 *   online lane's): the hello takes `forge: { id, ticket? }` (the HOST ticket, the creator's page only) and the account's
 *   login ticket as its own `ticket` (a signed-in seat's name), and names no game.
 * - **A placed lobby** (LATER 275, SA-7i's page half; a product-track adaptation of the transport): a lobby central
 *   placed on a host is joined at that host's door, not the page's `/ws` -- the creator with the `{ door, token }` its
 *   create answered, a joiner with its own from `askForgeSeat` (`POST /lobby/forge/lobby/<id>/token`, asked just before
 *   the hello: the token lives 60 s); the page pins the door (`../connectHost` `pinnedForgeDoor`) and the hello carries
 *   `forge: { id }` with the token alone. A lobby central runs itself keeps the page's `/ws` (the token route's 409).
 * - **A guest** (FG-38; OT.R55, FG-28's account-backed guest; a product-track adaptation): a page with no sign-in is
 *   given a guest's pass by the server -- its ticket and name (`GuestPass`), in a guest host's create answer and, for a
 *   joiner, at `askGuest` (`POST /lobby/forge/lobby/<id>/guest`) -- and its hello carries that ticket as its own
 *   `ticket` (a joiner's hello no `forge.ticket`). FG-28 ends a pass no socket has held for 60 s, so the page asks a
 *   joiner's just before its hello and says so when one lapsed (`lobbyEndWords`). A server without accounts (local
 *   development) gives none, and the hello carries no ticket (FG.R21's lobby seat).
 * - **Nothing of a guest is stored** (the owner's word, 2026-10-14, FG.R21, OT.R55 clause 2): the host ticket and the
 *   guest's pass live in this module's objects only -- never the browser's storage, a cookie, the address (it names the
 *   lobby's id alone, `addressWithLobby`), the page's session (`../modern/session`), the persona or the memory card, the
 *   match name (W3.R12's field, which the card's persona reads), or any frame but the hello; the ARMORY's choice goes
 *   to the room only, as its `loadout` (`loadoutOf`), never the memory card, the persona, the ARMORY profile store or
 *   `PUT /lobby/loadout`.
 */

/** The server's routes (`forgeLobbyHttp.ts` `FORGE_LOBBY_PATH`, `FORGE_HOST_HEADER`). */
export const FORGE_LOBBY_ROUTE = '/lobby/forge/lobby';
export const FORGE_HOST_HEADER = 'X-Forge-Host';
/**
 * The page's address parameter naming a lobby to join: the old form (`/forge?lobby=<id>`), still read for a release. The
 * link is the path `/forge/lobby/<id>` (the lobby links plan, the merge controller's scope (ii), 2026-10-23;
 * `@s2u/ui` `FORGE_LINK_SEGMENTS`), which the forge's join writes back in place (`addressWithLobby`).
 */
export const FORGE_LOBBY_PARAM = 'lobby';
/** The link's path under the page's base: `forge/lobby/<id>` (an optional slash after it). */
const LOBBY_PATH = /^(.*\/forge)(?:\/lobby\/([^/?#]*))?\/?$/;
/** A lobby's id as the server makes and accepts it (`forgeLobbyHttp.ts` `ID`). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
/** The events kept after the launch for the match's replay (as `../lobbyMatch` `LOBBY_MATCH_EVENTS_ADAPTATION` bounds its own; a page policy). */
const AFTER_LAUNCH_KEPT = 1024;

/** A lobby as the server lists it (`forgeLobby.ts` `ForgeLobbySummary`). */
export interface ForgeLobbySummary {
  id: string; name: string; base: string; players: number; max: number; settings: Partial<LayoutSettings>; created: number;
  /** FG-45: whether `GET /lobby/forge/lobbies` names it (the modern UI's Custom matches); its match under way. */
  listed: boolean; inMatch: boolean;
  /** FG-48a: whether it asks a password (absent from a server before FG-48: open). */
  locked?: boolean;
}
/** A lobby as `GET /lobby/forge/lobby/<id>` answers it, its layout read by `parseLayout`. */
export interface ForgeLobbyDetail extends ForgeLobbySummary {
  layout: Layout;
  missing: number;
  state: { seats: { id: number; name: string; team: 'seal' | 'terrorist' | null; ready: boolean; host: boolean }[]; countdown: number | null; launched: boolean };
}

/** FG-38: a guest's pass, as the server gives it (FG-28's ticket and name): memory only, the hello's `ticket` alone. */
export interface GuestPass { ticket: string; name: string }

/**
 * LATER 275 (SA-7i's page half): a placed lobby's seat as central answers it -- the host's door (pinned by the page,
 * `../connectHost` `pinnedForgeDoor`) and a forge token for it (60 s, one per entry): memory only, the hello's `token` alone.
 */
export interface ForgeSeat { door: string; token: string }

export type CreateAnswer =
  | {
    ok: true; id: string; hostTicket: string; lobby: ForgeLobbySummary; /** No account: a guest host (FG.R21). */ guest: boolean; /** The bearer was a dead session's, dropped. */ stale: boolean;
    /** FG-38: the guest host's pass (its hello's `ticket`), or null -- a signed-in host, or a server without accounts. */
    pass: GuestPass | null;
    /** LATER 275: a lobby central placed on a host -- the host's door and this seat's forge token; null when run on central. */
    seat: ForgeSeat | null;
  }
  | { ok: false; status: number; words: string };
export type FetchAnswer = { ok: true; lobby: ForgeLobbyDetail } | { ok: false; status: number; words: string };
/** FG-38: a joiner's pass (`askGuest`): null from a server without accounts (FG.R21's lobby seat, no ticket). */
export type GuestPassAnswer = { ok: true; pass: GuestPass | null } | { ok: false; status: number; words: string };

/**
 * FG-38 (R4 of FG-28's review): a guest's seat refused because its pass lapsed -- FG-28 ends a guest no socket has held
 * for 60 s from its issue -- said in words of its own.
 */
export const GUEST_PASS_LAPSED = 'Your guest pass ended before you were seated (a guest pass lasts 60 s until its seat): join again';

/** The table's statuses in words (`forgeLobbyHttp.ts`), and the network's (0). */
const WORDS: Record<number, string> = {
  0: 'the server did not answer',
  400: 'the server refused the layout or its name, or does not hold its base map',
  401: 'the sign-in has ended',
  403: 'the server refused this page',
  404: 'no such lobby: it may have closed',
  409: 'you already host a lobby',
  413: 'the layout is too large for a lobby',
  429: 'too many lobbies asked from here: wait a minute',
  503: 'the server\'s lobbies are full',
};
/** FG-38: FG-28's refusals of a guest (`forgeLobbyHttp.ts`'s `refused`), each in its own words. */
const GUEST_WORDS: Record<string, string> = {
  limited: 'too many guest passes asked from here: wait a few minutes, or sign in',
  full: 'the server holds all the guests it can: try again later, or sign in',
  names: 'the server could not name a guest: try again',
  address: 'the server could not tell where this page is from: sign in to play',
};
/**
 * The owner's refusal of 2026-10-15 (a campaign map's lobby on a server whose disc lacked it): a create refused for its
 * base (`forgeLobbyHttp.ts`'s 400 `{ refused: 'base', map }`) names the map this server cannot open.
 */
export const FORGE_BASE_MISSING_WORDS = (map: string): string => `the server does not hold the map ${map}, so it cannot make this lobby's room`;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** An archive stem as the server names one (`MP72`, `M51`): anything else is never shown. */
const STEM = /^[A-Z0-9_]{1,16}$/i;
/** The status in words -- a guest's refusal (FG-38) or a base the server lacks by the body's `refused`, else the table's. */
const wordsOf = (status: number, body: unknown = null): string => {
  if (status === 400 && isObj(body) && body['refused'] === 'base' && typeof body['map'] === 'string' && STEM.test(body['map'])) return FORGE_BASE_MISSING_WORDS(body['map']);
  const guest = isObj(body) && typeof body['refused'] === 'string' ? GUEST_WORDS[body['refused']] : undefined;
  return guest ?? WORDS[status] ?? `the server answered ${status}`;
};
/** A pass as the server answers it, or null (none, or not of the shape). */
const passOf = (v: unknown): GuestPass | null =>
  isObj(v) && typeof v['ticket'] === 'string' && v['ticket'] !== '' && typeof v['name'] === 'string' ? { ticket: v['ticket'], name: v['name'] } : null;

/**
 * `POST /lobby/forge/lobby` once, with or without the bearer; FG-45: `listed` always said (false unless asked); FG-48a:
 * `password` only when one is given (absent: an open lobby).
 */
async function postCreate(
  base: string, name: string, layout: Layout, ticket: string | null, listed: boolean, password: string | null, fetchFn: typeof fetch,
): Promise<{ status: number; body: unknown }> {
  const res = await fetchFn(`${base}${FORGE_LOBBY_ROUTE}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(ticket ? { authorization: `Bearer ${ticket}` } : {}) },
    body: JSON.stringify({ name, layout, listed, ...(password !== null ? { password } : {}) }),
  });
  let body: unknown = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

/**
 * A lobby made from `layout` (the page's layout JSON, FG.R19): signed in with `ticket` (the launcher's session, FG.R11)
 * or as a guest (null, FG.R21). A bearer the server no longer knows is 401, never a guest (`forgeLobbyHttp.ts`), so it
 * is dropped and the create asked again as a guest, said by `stale`. FG-38: a guest's create carries its pass (`pass`).
 * FG-45 (FG.R24): `o.listed`, whether the lobby shows in the modern UI's Custom matches -- false unless asked. FG-48a:
 * `o.password`, the lobby's password (absent or null: an open lobby); the server checks its bounds (400 else).
 */
export async function createLobby(
  base: string, name: string, layout: Layout, ticket: string | null = null, fetchFn: typeof fetch = (...a) => fetch(...a),
  o: { listed?: boolean; password?: string | null } = {},
): Promise<CreateAnswer> {
  const listed = o.listed === true;
  const password = o.password ?? null;
  try {
    let stale = false;
    let r = await postCreate(base, name, layout, ticket, listed, password, fetchFn);
    if (r.status === 401 && ticket) { stale = true; r = await postCreate(base, name, layout, null, listed, password, fetchFn); }
    const b = r.body;
    if (r.status !== 201 || !isObj(b) || typeof b['id'] !== 'string' || typeof b['hostTicket'] !== 'string' || !isObj(b['lobby'])) {
      return { ok: false, status: r.status, words: wordsOf(r.status, b) };
    }
    const guest = !ticket || stale;
    const seat = seatOf(b);
    if (seat === false) {
      // LATER 306: a seat present but not of its form -- never "none" (the page's own /ws, refused for a placed lobby) and
      // never the ticket hello at a door: not ok, the lobby just made closed by its host ticket alone, a failed close said.
      const closed = await closeLobby(base, b['id'], b['hostTicket'], null, fetchFn);
      return { ok: false, status: r.status, words: closed ? SEAT_ODD_CLOSED : SEAT_ODD_OPEN };
    }
    return { ok: true, id: b['id'], hostTicket: b['hostTicket'], lobby: b['lobby'] as unknown as ForgeLobbySummary, guest, stale, pass: guest ? passOf(b['guest']) : null, seat };
  } catch {
    return { ok: false, status: 0, words: wordsOf(0) };
  }
}

/**
 * FG-38: a joiner's guest pass for the lobby `id` (`POST /lobby/forge/lobby/<id>/guest`, no bearer, no body) -- asked
 * just before the hello, so its 60 s (FG-28's idle bound) runs from there. `pass` null: the server has no accounts.
 */
export async function askGuest(base: string, id: string, fetchFn: typeof fetch = (...a) => fetch(...a)): Promise<GuestPassAnswer> {
  if (!ID.test(id)) return { ok: false, status: 404, words: wordsOf(404) };
  try {
    const res = await fetchFn(`${base}${FORGE_LOBBY_ROUTE}/${id}/guest`, { method: 'POST' });
    let b: unknown = null;
    try { b = await res.json(); } catch { b = null; }
    if (res.status !== 200 || !isObj(b)) return { ok: false, status: res.status, words: wordsOf(res.status, b) };
    return { ok: true, pass: passOf(b['guest']) };
  } catch {
    return { ok: false, status: 0, words: wordsOf(0) };
  }
}

/**
 * LATER 306: the longest forge token the page takes, in characters -- the game token's (`../connectHost`
 * `GAME_TOKEN_CHARS_MAX`, the match server's `TOKEN_MAX_LENGTH`), mirrored: this client imports no connection host (FG-38
 * R6's guard, `test/forge/lobbyClient.test.ts`). An adaptation, as the token is.
 */
const FORGE_TOKEN_CHARS_MAX = 16_384;
const FORGE_TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * LATER 306: whether `v` has a forge token's form. Central signs it in the game token's envelope (`central/src/tickets.ts`
 * `signForgeToken`: three base64url parts and their dots), so the rule is `../connectHost` `isGameToken`'s, mirrored (a
 * test holds the two alike).
 */
export function isForgeToken(v: unknown): v is string {
  return typeof v === 'string' && v.length <= FORGE_TOKEN_CHARS_MAX && FORGE_TOKEN.test(v);
}

/**
 * LATER 275, LATER 306: a seat as central answers it. Neither `door` nor `token` there: none (null, a lobby central runs
 * itself -- the page's own `/ws`). A door a non-empty string and a token of a forge token's form (`isForgeToken`): the
 * seat. Anything else -- half a seat, an empty or malformed token -- is not of the shape (false), never "none": none
 * would send a placed lobby's seat to the page's `/ws` (central refuses it), and an empty token once fell back to the
 * ticket hello at the door (a login bearer at a door, against SA.R5).
 */
const seatOf = (v: Record<string, unknown>): ForgeSeat | null | false => {
  const door = v['door'];
  const token = v['token'];
  if (door === undefined && token === undefined) return null;
  return typeof door === 'string' && door !== '' && isForgeToken(token) ? { door, token } : false;
};
/** LATER 306: the create's words for a seat not of its shape -- its lobby closed, or the close refused or unanswered. */
const SEAT_ODD_CLOSED = 'the server\'s answer was not understood (the lobby\'s server or its seat): the lobby was closed';
const SEAT_ODD_OPEN = 'the server\'s answer was not understood (the lobby\'s server or its seat), and the lobby could not be closed: it ends on its own once idle';

/**
 * LATER 275: how often a joiner asks its seat again while central answers 503 `not yet` (a placed lobby whose host has
 * not yet confirmed it, or its lock: `forgeLobby.ts` `token`), and how far apart -- a page policy, an adaptation with no
 * original: a few tries a second apart, then the words.
 */
export const FORGE_SEAT_RETRY_ADAPTATION = { tries: 3, apartMs: 1000 } as const;

/** LATER 275: the seat's answer -- a placed lobby's seat, none (a lobby central runs: its own `/ws`), or the refusal in words. */
export type ForgeSeatAnswer = { ok: true; seat: ForgeSeat | null } | { ok: false; status: number; words: string };

/** LATER 275: the token route's 403 refusals (`forgeLobbyHttp.ts` `TOKEN_STATUS`), each in its own words (`barred`: the kick's, `LOBBY_KICKED_WORDS`). */
const SEAT_REFUSED: Record<string, string> = {
  elsewhere: 'your guest pass is another lobby\'s: join again',
  password: 'the lobby asks a password you have not entered: join again',
  'not the host': 'the server did not take this page as the lobby\'s host',
};
/** LATER 275: the words once `FORGE_SEAT_RETRY_ADAPTATION`'s tries are spent on `not yet`. */
const SEAT_NOT_YET = 'the lobby\'s server is not ready for you yet: try again in a moment';

/**
 * LATER 275 (SA-7i's page half; product track, the transport -- a browser adaptation with no original): a joiner's seat
 * in a placed lobby, `POST /lobby/forge/lobby/<id>/token` with `{}` and the seat's bearer (the login's ticket, or FG-28's
 * guest pass). 200 `{ door, token }` the seat; 409 a lobby central runs itself -- no seat, the page's own socket as
 * before; 503 `not yet` asked again (`FORGE_SEAT_RETRY_ADAPTATION`); 403's refusals, 401 and 404 in words. Asked just
 * before the hello: the token lives 60 s.
 */
export async function askForgeSeat(
  base: string, id: string, ticket: string, fetchFn: typeof fetch = (...a) => fetch(...a),
  o: { wait?: (ms: number) => Promise<void> } = {},
): Promise<ForgeSeatAnswer> {
  if (!ID.test(id)) return { ok: false, status: 404, words: wordsOf(404) };
  if (!ticket) return { ok: false, status: 401, words: wordsOf(401) };
  const wait = o.wait ?? ((ms: number) => new Promise<void>((r) => { setTimeout(r, ms); }));
  try {
    for (let tried = 1; ; tried++) {
      const res = await fetchFn(`${base}${FORGE_LOBBY_ROUTE}/${id}/token`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ticket}` }, body: '{}',
      });
      let b: unknown = null;
      try { b = await res.json(); } catch { b = null; }
      const refused = isObj(b) && typeof b['refused'] === 'string' ? b['refused'] : null;
      if (res.status === 200) {
        // LATER 306: a 200 carries a seat of its form; none, or one not of it (`seatOf` false), is not understood.
        const seat = isObj(b) ? seatOf(b) : false;
        return seat ? { ok: true, seat } : { ok: false, status: 200, words: 'the server\'s answer was not understood' };
      }
      if (res.status === 409) return { ok: true, seat: null };
      if (res.status === 503 && refused === 'not yet') {
        if (tried < FORGE_SEAT_RETRY_ADAPTATION.tries) { await wait(FORGE_SEAT_RETRY_ADAPTATION.apartMs); continue; }
        return { ok: false, status: 503, words: SEAT_NOT_YET };
      }
      const words = (res.status !== 403 || refused === null ? undefined : refused === 'barred' ? LOBBY_KICKED_WORDS : SEAT_REFUSED[refused]) ?? wordsOf(res.status);
      return { ok: false, status: res.status, words };
    }
  } catch {
    return { ok: false, status: 0, words: wordsOf(0) };
  }
}

/** FG-38 (R4): the words a seat's end shows -- a guest's lapsed pass (`not logged in`) in its own, else the room's. */
export function lobbyEndWords(reason: string | null, guest: boolean): string | null {
  return guest && reason === 'not logged in' ? GUEST_PASS_LAPSED : reason;
}

/** `GET /lobby/forge/lobby/<id>`: the lobby, its layout read by `parseLayout` (a layout it refuses is no lobby). */
export async function fetchLobby(base: string, id: string, fetchFn: typeof fetch = (...a) => fetch(...a)): Promise<FetchAnswer> {
  if (!ID.test(id)) return { ok: false, status: 404, words: wordsOf(404) };
  try {
    const res = await fetchFn(`${base}${FORGE_LOBBY_ROUTE}/${id}`, { method: 'GET' });
    if (res.status !== 200) return { ok: false, status: res.status, words: wordsOf(res.status) };
    const b: unknown = await res.json();
    if (!isObj(b) || !isObj(b['state'])) return { ok: false, status: 200, words: 'the lobby\'s answer was not understood' };
    let layout: Layout;
    try { layout = parseLayout(JSON.stringify(b['layout'])); } catch (e) { return { ok: false, status: 200, words: e instanceof Error ? e.message : 'not a forge layout' }; }
    return { ok: true, lobby: { ...(b as unknown as ForgeLobbyDetail), layout, missing: typeof b['missing'] === 'number' ? b['missing'] : 0 } };
  } catch {
    return { ok: false, status: 0, words: wordsOf(0) };
  }
}

/**
 * FG-45's review F3: a host's request (the close, the visibility's change) carrying the host ticket and, when signed in,
 * the bearer. A bearer naming no live session is answered 401 before the host ticket is read (`forgeLobbyHttp.ts`'s
 * `who`), and the ticket alone proves the host -- so a 401 with a bearer is asked once more without it (never again).
 * FG-48: with no host ticket (a host by its seat's bearer alone) there is nothing to ask again with.
 */
async function hostAsk(ticket: string | null, hostTicket: string | null, ask: (bearer: string | null) => Promise<Response>): Promise<Response> {
  const res = await ask(ticket);
  return res.status === 401 && ticket && hostTicket ? ask(null) : res;
}

/** The host's proof as headers: the host ticket in `X-Forge-Host` when held, the bearer when given. */
function hostHeaders(hostTicket: string | null, bearer: string | null): Record<string, string> {
  return { ...(hostTicket ? { [FORGE_HOST_HEADER]: hostTicket } : {}), ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) };
}

/**
 * `DELETE /lobby/forge/lobby/<id>`, the host's ("Close the lobby", FG-48c: for everyone): the creator's host ticket in
 * `X-Forge-Host` and its bearer when signed in (a stale one's 401 asked once more with the ticket alone, F3), or FG-48c a
 * successor's bearer alone (`hostTicket` null).
 */
export async function closeLobby(base: string, id: string, hostTicket: string | null, ticket: string | null = null, fetchFn: typeof fetch = (...a) => fetch(...a)): Promise<boolean> {
  if (!ID.test(id)) return false;
  try {
    const res = await hostAsk(ticket, hostTicket, (bearer) => fetchFn(`${base}${FORGE_LOBBY_ROUTE}/${id}`, {
      method: 'DELETE', headers: hostHeaders(hostTicket, bearer),
    }));
    return res.status === 204;
  } catch {
    return false;
  }
}

/** FG-45: the visibility change's answer -- the server's summary and the state it now holds, or the refusal in words. */
export type ListedAnswer = { ok: true; listed: boolean; lobby: ForgeLobbySummary } | { ok: false; status: number; words: string };

/** FG-45: the PATCH's refusals in words of their own (the create's words name a layout). */
const LISTED_WORDS: Record<number, string> = {
  400: 'the server refused the change',
  403: 'only the lobby\'s host may change its visibility',
  413: 'the server refused the change',
};

/**
 * FG-45 (FG.R24; a product-track adaptation, no original): `PATCH /lobby/forge/lobby/<id>` `{ listed }` -- the lobby
 * shown in the modern UI's Custom matches (true) or joined by its link alone (false). The host's proof as the close's:
 * its host ticket in `X-Forge-Host`, and its bearer when signed in (never a guest's pass, as `closeLobby`); a stale
 * bearer's 401 is asked once more with the ticket alone (`hostAsk`, F3).
 */
export async function setListed(
  base: string, id: string, listed: boolean, hostTicket: string | null, ticket: string | null = null, fetchFn: typeof fetch = (...a) => fetch(...a),
): Promise<ListedAnswer> {
  if (!ID.test(id)) return { ok: false, status: 404, words: wordsOf(404) };
  try {
    const res = await hostAsk(ticket, hostTicket, (bearer) => fetchFn(`${base}${FORGE_LOBBY_ROUTE}/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...hostHeaders(hostTicket, bearer) },
      body: JSON.stringify({ listed }),
    }));
    let b: unknown = null;
    try { b = await res.json(); } catch { b = null; }
    if (res.status !== 200) return { ok: false, status: res.status, words: LISTED_WORDS[res.status] ?? wordsOf(res.status) };
    if (!isObj(b) || typeof b['id'] !== 'string' || typeof b['listed'] !== 'boolean') return { ok: false, status: 200, words: 'the server\'s answer was not understood' };
    return { ok: true, listed: b['listed'], lobby: b as unknown as ForgeLobbySummary };
  } catch {
    return { ok: false, status: 0, words: wordsOf(0) };
  }
}

/** FG-48a: the password change's answer -- whether the lobby is locked now, or the refusal in words. */
export type PasswordAnswer = { ok: true; locked: boolean; lobby: ForgeLobbySummary } | { ok: false; status: number; words: string };

/** FG-48a: the password change's refusals (the PATCH's statuses) in words of their own. */
const PASSWORD_WORDS: Record<number, string> = {
  400: 'the server refused that password (1 to 32 letters, digits, spaces or signs)',
  403: 'only the lobby\'s host may change its password',
  413: 'the server refused the change',
};

/**
 * FG-48a (FG.R24; a product-track adaptation, no original): `PATCH /lobby/forge/lobby/<id>` `{ password }` -- the lobby
 * locked with a password (a string) or opened (null), proved as `setListed` proves the host.
 */
export async function setPassword(
  base: string, id: string, password: string | null, hostTicket: string | null, ticket: string | null = null, fetchFn: typeof fetch = (...a) => fetch(...a),
): Promise<PasswordAnswer> {
  if (!ID.test(id)) return { ok: false, status: 404, words: wordsOf(404) };
  try {
    const res = await hostAsk(ticket, hostTicket, (bearer) => fetchFn(`${base}${FORGE_LOBBY_ROUTE}/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...hostHeaders(hostTicket, bearer) },
      body: JSON.stringify({ password }),
    }));
    let b: unknown = null;
    try { b = await res.json(); } catch { b = null; }
    if (res.status !== 200) return { ok: false, status: res.status, words: PASSWORD_WORDS[res.status] ?? wordsOf(res.status) };
    if (!isObj(b) || typeof b['id'] !== 'string' || typeof b['locked'] !== 'boolean') return { ok: false, status: 200, words: 'the server\'s answer was not understood' };
    return { ok: true, locked: b['locked'], lobby: b as unknown as ForgeLobbySummary };
  } catch {
    return { ok: false, status: 0, words: wordsOf(0) };
  }
}

/** FG-48a: the entry's answer -- admitted, or the refusal in words (`wrong`: the password was not the lobby's). */
export type EnterAnswer = { ok: true } | { ok: false; status: number; words: string; wrong: boolean };

/** FG-48a: the entry's refusals in words of their own. */
const ENTER_WORDS: Record<number, string> = {
  401: 'a locked lobby admits a signed-in player or a guest with its pass: sign in, or join again',
  403: 'the server refused this page',
  429: 'too many wrong passwords from here: wait a minute and try again',
};
/** The 403's `refused` in words (`forgeLobbyHttp.ts`). */
const ENTER_REFUSED: Record<string, string> = {
  password: 'that is not the lobby\'s password',
  elsewhere: 'your guest pass is another lobby\'s: join again',
  barred: 'the host removed you from this lobby',                // FG-48b: kicked, for the lobby's life
};

/**
 * FG-48a (FG.R24; a product-track adaptation, no original): `POST /lobby/forge/lobby/<id>/enter` `{ password }` with the
 * seat's bearer -- the account's login ticket, or FG-28's guest pass (the pass is the seat's account here, as in the
 * hello) -- so the server admits the seat to the locked lobby before its hello. No bearer, nothing to admit: not asked.
 */
export async function enterLocked(base: string, id: string, password: string, bearer: string | null, fetchFn: typeof fetch = (...a) => fetch(...a)): Promise<EnterAnswer> {
  if (!ID.test(id)) return { ok: false, status: 404, words: wordsOf(404), wrong: false };
  if (!bearer) return { ok: false, status: 401, words: ENTER_WORDS[401]!, wrong: false };
  try {
    const res = await fetchFn(`${base}${FORGE_LOBBY_ROUTE}/${id}/enter`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` }, body: JSON.stringify({ password }),
    });
    if (res.status === 204) return { ok: true };
    let b: unknown = null;
    try { b = await res.json(); } catch { b = null; }
    const refused = isObj(b) && typeof b['refused'] === 'string' ? b['refused'] : null;
    const words = (refused !== null ? ENTER_REFUSED[refused] : undefined) ?? ENTER_WORDS[res.status] ?? wordsOf(res.status);
    return { ok: false, status: res.status, words, wrong: res.status === 403 && refused === 'password' };
  } catch {
    return { ok: false, status: 0, words: wordsOf(0), wrong: false };
  }
}

/** FG-48b: the kick's answer -- done, or the refusal in words. */
export type KickAnswer = { ok: true } | { ok: false; status: number; words: string };

/** FG-48b: the kick's refusals (`forgeLobbyHttp.ts`'s statuses) in words of their own. */
const KICK_WORDS: Record<number, string> = {
  400: 'the host cannot remove its own seat',
  403: 'only the lobby\'s host may remove a player',
  413: 'the server refused the request',
};

/**
 * FG-48b (FG.R24; a product-track adaptation, no original): `POST /lobby/forge/lobby/<id>/kick` `{ seat }` -- the seat
 * the room names `seat` removed from the lobby and its account barred for the lobby's life, proved as `setListed` proves
 * the host (its host ticket, and its bearer when signed in; a stale bearer's 401 asked once more with the ticket alone).
 */
export async function kickSeat(
  base: string, id: string, seat: number, hostTicket: string | null, ticket: string | null = null, fetchFn: typeof fetch = (...a) => fetch(...a),
): Promise<KickAnswer> {
  if (!ID.test(id)) return { ok: false, status: 404, words: wordsOf(404) };
  try {
    const res = await hostAsk(ticket, hostTicket, (bearer) => fetchFn(`${base}${FORGE_LOBBY_ROUTE}/${id}/kick`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...hostHeaders(hostTicket, bearer) },
      body: JSON.stringify({ seat }),
    }));
    if (res.status === 204) return { ok: true };
    let b: unknown = null;
    try { b = await res.json(); } catch { b = null; }
    if (res.status === 404 && isObj(b) && b['refused'] === 'seat') return { ok: false, status: 404, words: 'that player has left the lobby' };
    return { ok: false, status: res.status, words: KICK_WORDS[res.status] ?? wordsOf(res.status) };
  } catch {
    return { ok: false, status: 0, words: wordsOf(0) };
  }
}

/** FG-48c: the host's LEAVE's answer -- the lobby handed on (`handedOn`) or closed with none to take it, or the refusal. */
export type HandOnAnswer = { ok: true; handedOn: boolean } | { ok: false; status: number; words: string };

/** FG-48c: the LEAVE's refusals in words of their own. */
const LEAVE_WORDS: Record<number, string> = {
  403: 'only the lobby\'s host may hand it on',
};

/**
 * FG-48c (FG.R24; a product-track adaptation, no original): `POST /lobby/forge/lobby/<id>/leave` (no body) -- the host's
 * LEAVE: the lobby handed to the next player with an account (`handedOn` true) or, with none, closed. Proved as
 * `setListed` proves the host: the creator's host ticket and its bearer when signed in, or a successor's bearer alone
 * (`hostTicket` null: the login's ticket, or FG-28's guest pass); a stale bearer's 401 asked once more with the host
 * ticket alone when there is one.
 */
export async function handOnLobby(
  base: string, id: string, hostTicket: string | null, ticket: string | null = null, fetchFn: typeof fetch = (...a) => fetch(...a),
): Promise<HandOnAnswer> {
  if (!ID.test(id)) return { ok: false, status: 404, words: wordsOf(404) };
  try {
    const res = await hostAsk(ticket, hostTicket, (bearer) => fetchFn(`${base}${FORGE_LOBBY_ROUTE}/${id}/leave`, {
      method: 'POST', headers: hostHeaders(hostTicket, bearer),
    }));
    let b: unknown = null;
    try { b = await res.json(); } catch { b = null; }
    if (res.status !== 200) return { ok: false, status: res.status, words: LEAVE_WORDS[res.status] ?? wordsOf(res.status) };
    if (!isObj(b) || typeof b['handedOn'] !== 'boolean') return { ok: false, status: 200, words: 'the server\'s answer was not understood' };
    return { ok: true, handedOn: b['handedOn'] };
  } catch {
    return { ok: false, status: 0, words: wordsOf(0) };
  }
}

/**
 * FG-48b: the close of a seat its host kicked (`central/src/forgeLobby.ts` `FORGE_LOBBY_KICKED`, the forge's own code),
 * and the words the window says for it.
 */
export const FORGE_LOBBY_KICKED_CODE = 4030;
export const LOBBY_KICKED_WORDS = 'The host removed you from this lobby';

/** The lobby's walk-less client stand-in (`../gameLobbyHost`'s `idleWalk`): the match rebinds its walk at the hand-off. */
const IDLE_WALK: NetWalk = { setNetTap: () => {}, respawn: () => false, nudge: () => {}, setLocked: () => {}, grounded: () => false };   // LATER 498: no ground, so its refusal holds no spawn

export interface LobbySocketOptions {
  /** The pinned match socket's URL (`../connectHost` `pinnedMatchSocket`). */
  url: string;
  /** The lobby's id. */
  id: string;
  /** The create's host ticket (the creator's page only), memory only. */
  hostTicket?: string | null;
  /**
   * The hello's own ticket: the account's login ticket when signed in (`../modern/session` `ticket()`), a guest's pass
   * (FG-38, FG-28's), or none (a server without accounts: FG.R21's lobby seat).
   */
  ticket?: string | null;
  /** The hello's name (the room seats the account's or a guest's own: not read). */
  name: string;
  /**
   * LATER 275: a placed lobby's forge token (`ForgeSeat`, `url` then its door): the hello carries it with the lobby's id
   * alone -- no host ticket, no login ticket (`NetOptions.forge`'s token form). Absent or null: the hello above. LATER 306:
   * any string given, even an empty or malformed one, is the token form -- a door is never sent a ticket; it refuses a
   * token it did not sign (`seatOf` keeps such a seat from the page in the first place).
   */
  token?: string | null;
  /** A socket for the tests; absent, the page's `WebSocket`. */
  socket?: (url: string) => WebSocketLike;
}

/** The lobby's socket: a `NetClient` whose hello names the forge lobby (FG.R20); LATER 275, with a token at its door. */
export function openLobbySocket(o: LobbySocketOptions): NetClient {
  const forge = typeof o.token === 'string' ? { id: o.id, token: o.token } : { id: o.id, ...(o.hostTicket ? { ticket: o.hostTicket } : {}) };
  return new NetClient({ url: o.url, map: '', name: o.name, forge, forgeAccount: o.ticket ?? null, ...(o.socket ? { socket: o.socket } : {}) }, IDLE_WALK);
}

/** The ARMORY's exit as the room's request (protocol 7's picks, protocol 9's `char`): the waiting room's loadout path (FG.R20). */
export function loadoutOf(exit: ArmoryExit): Extract<ClientEvent, { type: 'loadout' }> {
  return { type: 'loadout', picks: exit.picks.map((p) => ({ slot: p.slot, id: p.id })), char: exit.type };
}

/** Every archive the layout draws from (its base's or library's, then its pieces') that `held` lacks (FG.R12), in order. */
export function missingArchives(layout: Layout, held: ReadonlySet<string>): string[] {
  const want = [layout.base.kind === 'map' ? layout.base.archive : layout.base.library];
  for (const p of layout.pieces) { const a = parseAssetId(p.asset)?.archive; if (a) want.push(a); }
  return [...new Set(want)].filter((a) => !held.has(a));
}

/** The lobby the address names -- its path (`/forge/lobby/<id>`), else the old query (`?lobby=<id>`) -- or null. */
export function lobbyIdOf(search: string, pathname = ''): string | null {
  const inPath = LOBBY_PATH.exec(pathname)?.[2];
  if (inPath !== undefined && inPath !== '') return ID.test(inPath) && inPath !== '.' && inPath !== '..' ? inPath : null;
  const id = new URLSearchParams(search).get(FORGE_LOBBY_PARAM);
  return id !== null && ID.test(id) ? id : null;
}

/**
 * `href` naming the lobby `id` (null: none), the rest of the address as it was (a bare flag stays bare). On the forge's
 * path the id is the path's (`.../forge/lobby/<id>`) and an old `lobby=` query leaves; elsewhere it is the query's.
 */
export function addressWithLobby(href: string, id: string | null): string {
  const hashAt = href.indexOf('#');
  const hash = hashAt >= 0 ? href.slice(hashAt) : '';
  const rest = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const q = rest.indexOf('?');
  const path = q >= 0 ? rest.slice(0, q) : rest;
  const parts = (q >= 0 ? rest.slice(q + 1) : '').split('&').filter((p) => p !== '' && p.split('=')[0] !== FORGE_LOBBY_PARAM);
  const forge = LOBBY_PATH.exec(path);
  if (forge) {
    const at = id === null ? forge[1]! : `${forge[1]}/lobby/${encodeURIComponent(id)}`;
    return `${at}${parts.length ? `?${parts.join('&')}` : ''}${hash}`;
  }
  if (id !== null) parts.push(`${FORGE_LOBBY_PARAM}=${encodeURIComponent(id)}`);
  return `${path}${parts.length ? `?${parts.join('&')}` : ''}${hash}`;
}

/** What the match takes at the hand-off (`./match` `startForgeLobbyMatch`). */
export interface ForgeLobbyHandOff {
  client: NetClient;
  /** The welcome on the seat's side now (`../gameLobbyHost` `seatWelcome` over the room's last view). */
  welcome: GameLobbyHandOff['welcome'];
  roundStart: GameLobbyHandOff['roundStart'];
  /** The room's events for the match's replay: the welcome first, then those since the launch. */
  events: ServerEvent[];
}

export interface ForgeLobbySessionOptions {
  /** The lobby's name, the map's stem and the layout's player cap (the popup's header). */
  title(): { name: string; map: string; players: number };
  /** The map's ARMORY data (`armoryFromDisc` with its world), or null when it cannot be read. */
  armoryData?(): Promise<ArmoryData> | null;
}

/**
 * The lobby's socket, routed (`../gameLobbyHost` `GameSocketHost.event`'s pattern): `welcome`, `gameLobby`, `chat`,
 * `refused` and `roundStart` kept and handed on; `voiceFloor` and the voice frames are the popup's own (`./lobby/lobbyVoice`
 * listens on the client). The launch (`gameLobby.launched`, or a `roundStart`) is told once; `handOff` then gives the
 * client to the match. A close or a refusal ends the session once (`poll`, each frame).
 */
export class ForgeLobbySession {
  private welcome: GameLobbyHandOff['welcome'] = null;
  private view: GameLobbyEvent | null = null;
  private roundStarted: GameLobbyHandOff['roundStart'] = null;
  private refusal: string | null = null;
  private launched = false;
  private after: ServerEvent[] = [];
  private held: NetClient | null;
  private off: (() => void) | null;
  private ended = false;
  private readonly lobbyCbs = new Set<(ev: GameLobbyEvent) => void>();
  private readonly chatCbs = new Set<(line: ForgeLobbyChatLine) => void>();
  private readonly launchCbs = new Set<() => void>();
  private readonly endCbs = new Set<(code: number | null, reason: string | null) => void>();

  constructor(readonly client: NetClient, private readonly o: ForgeLobbySessionOptions) {
    this.held = client;
    this.off = client.on((ev) => this.event(ev));
  }

  private event(ev: ServerEvent): void {
    if (this.launched && this.after.length < AFTER_LAUNCH_KEPT && ev.type !== 'welcome') this.after.push(ev);
    switch (ev.type) {
      case 'welcome': this.welcome = ev; break;
      case 'gameLobby':
        this.view = ev;
        for (const cb of [...this.lobbyCbs]) cb(ev);
        if (ev.launched) this.launch();
        break;
      case 'chat': for (const cb of [...this.chatCbs]) cb({ from: ev.name, text: ev.text, team: ev.team === true }); break;
      case 'refused': this.refusal = ev.reason; break;
      case 'roundStart':
        this.roundStarted = ev;
        if (!this.launched) { this.after.push(ev); this.launch(); }
        break;
      default: break;
    }
  }

  private launch(): void {
    if (this.launched) return;
    this.launched = true;
    for (const cb of [...this.launchCbs]) cb();
  }

  /** The room started the match (told once). */
  onLaunch(cb: () => void): () => void { this.launchCbs.add(cb); return () => { this.launchCbs.delete(cb); }; }
  /** FG-48c: each `gameLobby` view, `me()` already reading it (the page learns its seat now carries the host's flag). */
  onLobby(cb: (ev: GameLobbyEvent) => void): () => void { this.lobbyCbs.add(cb); return () => { this.lobbyCbs.delete(cb); }; }
  /** The seat ended (a close, a refusal): its code and the words to show; told once. */
  onEnd(cb: (code: number | null, reason: string | null) => void): () => void { this.endCbs.add(cb); return () => { this.endCbs.delete(cb); }; }
  isLaunched(): boolean { return this.launched; }
  /** The client while the lobby holds it (none after the hand-off or the end). */
  net(): NetClient | null { return this.held; }
  me(): { id: number; host: boolean } | null {
    if (!this.welcome || !this.held) return null;
    const id = this.welcome.id;
    return { id, host: this.view?.seats.find((s) => s.id === id)?.host ?? false };
  }

  /** Once a frame: a socket closed or refused ends the session (told once). */
  poll(): void {
    const c = this.held;
    if (this.ended || !c || c.state === 'open' || c.state === 'connecting') return;
    this.ended = true;
    const code = c.closeCode;
    const reason = c.state === 'refused' || this.refusal !== null ? this.refusal
      : code === 4007 ? 'The lobby closed' : code === FORGE_LOBBY_KICKED_CODE ? LOBBY_KICKED_WORDS : 'The connection to the lobby was lost';
    this.detach();
    this.held = null;
    for (const cb of [...this.endCbs]) cb(code, reason);
  }

  /** The match starts: the client handed on open, this session no longer its listener. Null once handed or ended. */
  handOff(): ForgeLobbyHandOff | null {
    const client = this.held;
    if (!client || this.ended) return null;
    this.detach();
    this.held = null;
    const seats = this.view?.seats.map((s) => ({ id: s.id, name: s.name, team: s.team })) ?? null;
    const welcome = seatWelcome(this.welcome, client.team, seats);
    return { client, welcome, roundStart: this.roundStarted, events: [...(welcome ? [welcome] : []), ...this.after] };
  }

  /** The page's own close (LEAVE): the socket closed, the listeners let go. */
  close(): void {
    this.ended = true;
    this.detach();
    this.held?.close();
    this.held = null;
  }

  private detach(): void { this.off?.(); this.off = null; }

  /** The popup's seam (`./lobby/deps`): `close` is the page's (LEAVE, the window's close). */
  deps(doc: Document, close: () => void): ForgeLobbyDeps {
    return {
      doc,
      net: () => this.held,
      lobby: () => this.view,
      onLobby: (cb) => { this.lobbyCbs.add(cb); return () => { this.lobbyCbs.delete(cb); }; },
      onChat: (cb) => { this.chatCbs.add(cb); return () => { this.chatCbs.delete(cb); }; },
      me: () => this.me(),
      title: () => this.o.title(),
      send: (ev: ForgeLobbyRequest) => { if (this.held?.state === 'open') this.held.send({ type: ev }); },
      chat: (text, team) => { if (this.held?.state === 'open') this.held.send({ type: 'chat', text, ...(team ? { team: true } : {}) }); },
      armory: () => {
        const me = this.me();
        const side = me ? this.view?.seats.find((s) => s.id === me.id)?.team ?? null : null;
        const data = side ? this.o.armoryData?.() ?? null : null;
        if (!side || !data) return null;
        return { data, side, send: (exit: ArmoryExit) => { if (this.held?.state === 'open') this.held.send(loadoutOf(exit)); } };
      },
      close,
    };
  }
}
