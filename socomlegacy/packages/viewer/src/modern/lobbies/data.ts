import {
  GAME_LIST_QUERY, MEDIUS_STATUS, ROOM_LIST_QUERY, gameDetails, gameListRow, gameStatsD, roomEligibleRanks, roomOrder,
  type ChannelListEntry, type GameDetails, type GameListEntry, type MissionRecord,
} from '@s2u/ui';
import { BRIEFING_ROOM_SESSION_LOST, fetchBriefingRoomService } from '../../briefingRoomHost';
import { DEV_PARAM, DEVTOOLS_PARAM } from '../../source';
import { ROOM_LIST_SESSION_LOST, fetchRoomListService, type RoomListWithDoors } from '../../worldOfSocomHost';
import { safeServerDetail } from '../report/serverDetail';

/**
 * The lobby browser's data (MU-3 of `docs/plans/2026-10-09-modern-ui-parallel.md`; the dialogue's D2.2, D2.3). A
 * browser adaptation (MU.R1): the original's lists are its own screens', unchanged; this reads the same server.
 *
 * **Signed in** -- three reads, each with the session's ticket as the bearer, at the account requests' base (the page's
 * own origin, `ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`, `../../connectHost`):
 * - the briefing rooms: `POST /lobby/channel-list` through the original page's own client (`fetchRoomListService`,
 *   `../../worldOfSocomHost`; the original's query `ROOM_LIST_QUERY` and its field-by-field check `channelListOf`);
 * - the game lobbies: `POST /lobby/game-list` through the briefing room's client (`fetchBriefingRoomService`,
 *   `../../briefingRoomHost`; `GAME_LIST_QUERY`, `gameListOf`), each row's columns as the original's row draws them
 *   (`gameListRow`, `FUN_002e2ce0` D:L184391-184506: the name cut at "$~", IN/MAX, SPEC, PING, PASS, CLAN, the ranks);
 * - the players by name: `POST /modern/lobby-members` with an empty JSON body (`packages/central/src/modernHttp.ts`, the
 *   modern UI's own read, MU.R6; MU-H3's default -- a name and nothing else, a password room's or game's names to its
 *   own members only). POST, not GET: a browser sends `Origin` on a same-origin GET never, and the route's Origin check
 *   needs it (the MU-3 review's ruling, 2026-10-09).
 * **Signed out** -- the anonymous `GET /rooms` (`packages/match/src/server.ts` `roomsBody`, CORS `*` and no Origin
 * check: each classic room's map, rules, players, spectators, round; counts only), with no bearer.
 *
 * A room or a game is keyed by its `mediusWorldId` across the three answers (the members route sends the same ids).
 * The counts are the lists' (the original's), never the members' length; the names are the members route's, and
 * unknown (null, never an empty list) when that route did not answer.
 */

/**
 * MU_LOBBY_NAMES_OPTIONAL_ADAPTATION: the members route is the modern UI's own (MU.R6, not yet on every server); a
 * refusal of it other than 401 -- 403 (an origin it does not allow), 404 (not mounted), 5xx, another shape, no answer
 * -- leaves the lists standing with their counts and says the names are unavailable. A 401 from any of the three is
 * the session lost. A browser adaptation.
 */
export const MU_LOBBY_NAMES_OPTIONAL_ADAPTATION = 'the members route refused but 401: the counts stand, the names unavailable' as const;

/** The members route (`modernHttp.ts` `MODERN_MEMBERS_PATH`). */
export const MODERN_MEMBERS_PATH = '/modern/lobby-members';

/**
 * MU2-5: the game-list entry's `worldStatus` for a game whose round is under way -- MediusWorldStatus' WorldActive
 * (`packages/central/src/lobby.ts` L45-46 `WORLD_STATUS`, Types.cs:369), which the server reports once the game is
 * launched (`packages/central/src/bridge.ts` L700: `launched ? Active : Staging`); the list carries Staging (in its game
 * lobby) and Active games only (`lobby.ts` L556, L748). The original's game list draws no such column (`FUN_002e2ce0`
 * D:L184391-184506): MU_LOBBY_IN_PROGRESS_ADAPTATION -- the modern list's own reading of the field the server sends, a
 * browser adaptation (MU.R1).
 */
export const MU_LOBBY_WORLD_ACTIVE = 2;
export const MU_LOBBY_IN_PROGRESS_ADAPTATION = 'a game the server reports WorldActive is drawn as a round in progress' as const;

/** Why a load failed: no answer (the server not reachable), a 401 (the session lost), or any other refusal. */
export type LobbyFailure = 'unreachable' | 'session-lost' | 'refused';

/**
 * A server that answers but fails (`refused`: an HTTP 500, a refusal that is not a 401, an answer not of the shape) in one
 * wording (MU-P1c 14 and 18, the rendered design review r1; dot's response: "an HTTP 500 is Server unavailable, not
 * offline") -- beside `../home/cards`' `SERVER_OFFLINE` for no answer at all. The raw detail is never said in the UI. A
 * browser adaptation (MU.R1): the launcher's own words.
 */
export const SERVER_UNAVAILABLE = 'Server unavailable';
/** No answer at all (MU-P1b 14): the word Home, the Server view, the sections and the profile say. */
export const SERVER_OFFLINE = 'Offline';
/** The one line's retry word while a retry is out (dot: "Retrying..." updates the one status line). */
export const RETRYING = 'Retrying...';
/**
 * The one mapping of a failed server to its words (MU-P1d, review r1 item 14), shared by Home's cards, the Server view
 * and Lobbies' status line: no answer is `SERVER_OFFLINE`, an answer that fails `SERVER_UNAVAILABLE`; `retrying` adds
 * `RETRYING`. The raw detail is never said.
 */
export function serverFailureWords(why: 'unreachable' | 'refused', retrying: boolean): string {
  const words = why === 'unreachable' ? SERVER_OFFLINE : SERVER_UNAVAILABLE;
  return retrying ? `${words} · ${RETRYING}` : words;
}

export class LobbyLoadError extends Error {
  /**
   * `detail`: the raw cause for the Report only (MU-P2, the design review r2, P3-2; `../report/serverDetail`) -- "rooms:
   * HTTP 500", "channel list: HTTP 500", "rooms: no answer"; never in the UI, nor in `message`.
   */
  constructor(readonly kind: LobbyFailure, readonly detail?: string) {
    super(`lobby: ${kind}`);
    this.name = 'LobbyLoadError';
  }
}

/** One classic room of the anonymous `/rooms`. */
export interface PublicRoom { map: string; rules: string; players: number; spectators: number; round: number }

/** A briefing room as the browser draws it. */
export interface LobbyRoom {
  id: number;
  name: string;
  players: number;
  max: number;
  /** The room asks a password (its SecurityLevel). */
  locked: boolean;
  /** Its names are withheld (locked, or the members route says so). */
  private: boolean;
  /** The eligible rank tiers 1..4 (`roomEligibleRanks`, GenericField1's low four bits). */
  ranks: number[];
  /** The players' names; [] for none or withheld; null when the members route did not answer. */
  names: string[] | null;
  /** GAME-PING / LATER 455 (a browser adaptation): its host's door origin for the page's ping probe, when central names one. */
  door?: string;
}

/** A game lobby as the browser draws it: the original row's columns, the map, the room, the names. */
export interface LobbyGame {
  id: number;
  name: string;
  /** The room it was made in (the members route's, else its GenericField1), or null. */
  room: number | null;
  inPlayers: number; maxIn: number; spectators: number; maxSpectators: number;
  /** 0 no players, 1 / 2 / 3 by GenericField2 (the row's PING). */
  ping: number;
  locked: boolean;
  clan: boolean;
  ranks: number[];
  /** The map's archive stem (`MP<level>`), or null for none named. */
  map: string | null;
  private: boolean;
  names: string[] | null;
  /** Its round is under way: the server reports its world active (`MU_LOBBY_WORLD_ACTIVE`); else it is in its game lobby. */
  inProgress: boolean;
  /** The list's entry as it came (MU-13d: GAME DETAILS reads its GameStats and RulesSet, `lobbyGameDetails`). */
  entry: GameListEntry;
  /** GAME-PING (a browser adaptation): its room's door (any listed room's, drawn or not), when central names one. */
  door?: string;
  /**
   * GAME-PING (a browser adaptation, `../../gamePing`): the page's measured round trip to `door`, in ms; null, no door or
   * no answer (drawn `--`); absent, not measured (no players, or no reader set it) -- `ping`, the original's band, stands.
   */
  measuredMs?: number | null;
}

export interface LobbyView { rooms: LobbyRoom[]; games: LobbyGame[]; /** Whether the members route answered. */ names: boolean }

export interface MembersEntry { mediusWorldId: number; name: string; private: boolean; players: string[]; room?: number | null }
export interface MembersAnswer { rooms: MembersEntry[]; games: MembersEntry[] }

const isInt = (v: unknown): v is number => Number.isSafeInteger(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const obj = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('lobby: not the shape');
  return v as Record<string, unknown>;
};

function membersEntry(raw: unknown, game: boolean): MembersEntry {
  const e = obj(raw);
  const players = e['players'];
  if (!isInt(e['mediusWorldId']) || !isStr(e['name']) || !Array.isArray(players)) throw new Error('members: not the shape');
  const names = players.map((p) => { const n = obj(p)['name']; if (!isStr(n)) throw new Error('members: not the shape'); return n; });
  const out: MembersEntry = { mediusWorldId: e['mediusWorldId'], name: e['name'], private: e['private'] === true, players: names };
  if (game) {
    const room = e['room'];
    if (room !== null && room !== undefined && !isInt(room)) throw new Error('members: not the shape');
    out.room = room ?? null;
  }
  return out;
}

/** `/modern/lobby-members`' answer checked field by field (a name is a string); anything else throws. */
export function membersOf(raw: unknown): MembersAnswer {
  const r = obj(raw);
  if (!Array.isArray(r['rooms']) || !Array.isArray(r['games'])) throw new Error('members: not the shape');
  return { rooms: r['rooms'].map((x) => membersEntry(x, false)), games: r['games'].map((x) => membersEntry(x, true)) };
}

/** `/rooms`' answer checked row by row; anything else throws. */
export function publicRoomsOf(raw: unknown): PublicRoom[] {
  if (!Array.isArray(raw)) throw new Error('rooms: not the shape');
  return raw.map((x) => {
    const e = obj(x);
    const n = (k: string): number => { const v = e[k]; if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error('rooms: not the shape'); return Math.floor(v); };
    if (!isStr(e['map']) || !isStr(e['rules'])) throw new Error('rooms: not the shape');
    return { map: e['map'], rules: e['rules'], players: n('players'), spectators: n('spectators'), round: n('round') };
  });
}

// ---- the original list's order and filter ----
// The rooms' order is `@s2u/ui`'s `roomOrder` (`FUN_002e3f80` D:L185059-185088: GenericField1's high half, the name's
// length in bytes, the name without case), the original page's own transcription.

/**
 * Whether the original's list draws a room (`FUN_002e3cc0` D:L184974-185056, as `@s2u/ui` `roomListRows`): a success
 * entry with a name; not one opening "Medius"; not a "+Clan - " room (drawn only for its own clan's member, and clans
 * are parked, OT.R6, so no player has one here).
 */
const drawnRoom = (e: ChannelListEntry): boolean =>
  e.status === MEDIUS_STATUS.Success && e.lobbyName !== '' && !e.lobbyName.startsWith('Medius') && !e.lobbyName.startsWith('+Clan - ');

/**
 * The map a game names: GameLevel, else GameStats' byte 8 (`FUN_002e1d50` D:L183890-183891, as the client's `keep`),
 * as the server's archive stem `MP<level>` (`central/src/lobby.ts` `levelStem`); 0 names none.
 */
function mapOf(e: GameListEntry): string | null {
  const level = e.gameLevel !== 0 ? e.gameLevel : gameStatsD(e.gameStats)[8]!;
  return level > 0 ? `MP${level}` : null;
}

/**
 * The three answers merged by world id (`members` null: the members route did not answer). `doors` (GAME-PING / LATER
 * 455, a browser adaptation): each room's door origin by its name, as the channel list's `doors` gives it
 * (`roomDoorsOf`); a game takes its room's, whether or not the room is drawn.
 */
export function lobbyViewOf(channels: readonly ChannelListEntry[], games: readonly GameListEntry[], members: MembersAnswer | null, doors: ReadonlyMap<string, string> = new Map()): LobbyView {
  const doorById = new Map<number, string>();
  for (const e of channels) { const d = doors.get(e.lobbyName); if (e.status === MEDIUS_STATUS.Success && d !== undefined) doorById.set(e.mediusWorldId, d); }
  const roomMembers = new Map(members?.rooms.map((m) => [m.mediusWorldId, m]) ?? []);
  const gameMembers = new Map(members?.games.map((m) => [m.mediusWorldId, m]) ?? []);
  const namesOf = (m: MembersEntry | undefined, withheld: boolean): string[] | null => {
    if (members === null) return null;
    if (!m) return withheld ? [] : null;
    return [...m.players];
  };
  const rooms = channels.filter(drawnRoom).sort(roomOrder).map((e): LobbyRoom => {
    const m = roomMembers.get(e.mediusWorldId);
    const locked = e.securityLevel !== 0;
    const priv = locked || m?.private === true;
    return {
      id: e.mediusWorldId, name: e.lobbyName, players: e.playerCount & 0xffff, max: e.maxPlayers & 0xffff, locked, private: priv,
      ranks: roomEligibleRanks(e.genericField1), names: namesOf(m, priv), ...(doorById.has(e.mediusWorldId) ? { door: doorById.get(e.mediusWorldId)! } : {}),
    };
  });
  const list = games.filter((e) => e.status === MEDIUS_STATUS.Success).map((e): LobbyGame => {
    // [name, IN, MAX, SPEC, SPEC MAX, ping, pass (1 open), clan (1 not a clan game), ...ranks]
    const c = gameListRow(e);
    const m = gameMembers.get(e.mediusWorldId);
    const locked = c[6] === 0;
    const priv = locked || m?.private === true;
    const room = m ? (m.room ?? null) : (e.genericField1 > 0 ? e.genericField1 : null);
    const door = room === null ? undefined : doorById.get(room);
    return {
      id: e.mediusWorldId, name: String(c[0]), room, ...(door !== undefined ? { door } : {}),
      inPlayers: Number(c[1]), maxIn: Number(c[2]), spectators: Number(c[3]), maxSpectators: Number(c[4]), ping: Number(c[5]),
      locked, clan: c[7] === 0, ranks: c.slice(8).map(Number), map: mapOf(e), private: priv, names: namesOf(m, priv),
      inProgress: e.worldStatus === MU_LOBBY_WORLD_ACTIVE, entry: e,
    };
  });
  return { rooms, games: list, names: members !== null };
}

/**
 * A game's GAME DETAILS (MU-13d) by the original's own reader (`@s2u/ui` `gameDetails`, `FUN_002e1f20`
 * D:L183973-184130; research 154 §7.1): the settings from the entry alone; with the disc's mission table
 * (`missions`, `missionlist.rdr`) also the availability, the map's name and the type word. No second decoding.
 */
export function lobbyGameDetails(g: LobbyGame, missions: readonly MissionRecord[] | null): GameDetails {
  return gameDetails(g.entry, missions);
}

// ---- the source ----

export interface LobbySource {
  /**
   * Signed out: the anonymous counts. `fresh`: an explicit refresh (the poller's `pollNow`); the fetch source always asks
   * (`cache: 'no-cache'`), a sharing source (the retired Home's `shareLobbySource`, CX-25) would then skip its held copy.
   */
  publicRooms(signal: AbortSignal, fresh?: boolean): Promise<PublicRoom[]>;
  /** Signed in: the rooms, games and names, with `ticket` as the bearer. */
  lobby(ticket: string, signal: AbortSignal): Promise<LobbyView>;
}

/** The source over `fetch` at `base` (the account requests' base); every failure is a `LobbyLoadError`. */
export function fetchLobbySource(base: string, fetchFn: typeof fetch = (...a) => fetch(...a)): LobbySource {
  /** `fetchFn` with the signal, a request with no answer (a rejection, an abort) read as unreachable. */
  const guarded = (signal: AbortSignal, what: string): typeof fetch => (async (input: RequestInfo | URL, init?: RequestInit) => {
    try { return await fetchFn(input, { ...init, signal }); } catch { throw new LobbyLoadError('unreachable', `${what}: no answer`); }
  }) as typeof fetch;
  // The services' own messages are "<what>: HTTP <code>"; anything else is named by its kind (no address copied).
  const failure = (e: unknown, what: string): LobbyLoadError =>
    (e instanceof LobbyLoadError ? e : new LobbyLoadError('refused', safeServerDetail(e instanceof Error ? e.message : null, `${what}: unreadable answer`)));
  return {
    async publicRooms(signal) {
      const res = await guarded(signal, 'rooms')(`${base}/rooms`, { method: 'GET', credentials: 'omit', cache: 'no-cache' });
      if (!res.ok) throw new LobbyLoadError('refused', `rooms: HTTP ${res.status}`);
      try { return publicRoomsOf(await res.json()); } catch (e) { throw failure(e, 'rooms'); }
    },
    async lobby(ticket, signal) {
      const f = guarded(signal, 'lobby');
      const channels = (async () => {
        // GAME-PING (LATER 455's `doors`, a browser adaptation): the same request, the rooms' doors kept beside the entries.
        const r = await fetchRoomListService(base, f).channelListWithDoors!({ ...ROOM_LIST_QUERY }, ticket);
        if (r === ROOM_LIST_SESSION_LOST) throw new LobbyLoadError('session-lost');
        return r;
      })();
      const games = (async () => {
        const r = await fetchBriefingRoomService(base, f).gameList({ ...GAME_LIST_QUERY }, ticket);
        if (r === BRIEFING_ROOM_SESSION_LOST) throw new LobbyLoadError('session-lost');
        return r;
      })();
      // MU_LOBBY_NAMES_OPTIONAL_ADAPTATION: the names' refusal but 401 is null, not a failure.
      const members = (async (): Promise<MembersAnswer | null> => {
        let res: Response;
        try {
          res = await f(`${base}${MODERN_MEMBERS_PATH}`, {
            method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ticket}` }, body: '{}', credentials: 'omit', cache: 'no-store',
          });
        } catch { return null; }
        if (res.status === 401) throw new LobbyLoadError('session-lost');
        if (!res.ok) return null;
        try { return membersOf(await res.json()); } catch { return null; }
      })();
      const settled = await Promise.allSettled([channels, games, members]);
      const failed = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected').map((s) => failure(s.reason, 'lobby'));
      // The session lost outranks the rest: a 401 from any of the three ends the signed-in view.
      const lost = failed.find((e) => e.kind === 'session-lost');
      if (lost) throw lost;
      if (failed.length > 0) throw failed.find((e) => e.kind === 'unreachable') ?? failed[0]!;
      const [c, g, m] = settled as [PromiseFulfilledResult<RoomListWithDoors>, PromiseFulfilledResult<GameListEntry[]>, PromiseFulfilledResult<MembersAnswer | null>];
      return lobbyViewOf(c.value.entries, g.value, m.value, c.value.doors);
    },
  };
}

// ---- FG-46: Custom matches -- the listed forge lobbies ----

/**
 * FG-46 (FG.R24, the owner's seventh round; a product-track adaptation, MU.R1, with no original -- the game has no
 * editor and no custom match): the forge's lobbies a host listed (FG-45), as `GET /lobby/forge/lobbies` answers them
 * (`packages/central/src/forgeLobbyHttp.ts` `FORGE_LOBBIES_PATH`, `forgeLobby.ts` `ForgeLobbySummary`), read with no
 * bearer on the lists' own poll, signed in or out.
 *
 * MU_CUSTOM_MATCHES_OPTIONAL_ADAPTATION: the route is the forge's own, not on every server -- any refusal (404 not
 * mounted, 401, 403 an origin it does not allow, 5xx), another shape or no answer is no list (null): the area says the
 * custom matches are unavailable and the rest of the section stands, as `MU_LOBBY_NAMES_OPTIONAL_ADAPTATION` keeps the
 * counts when the names are refused. It never fails the lists' load.
 */
export const MU_CUSTOM_MATCHES_OPTIONAL_ADAPTATION = 'the forge lobbies route refused or absent: Custom matches unavailable, the lists stand' as const;

/**
 * MU_CUSTOM_MATCHES_TIMEOUT_MS_ADAPTATION (FG-45's review F2): the most the lists' load waits on the custom matches'
 * read, ms -- past it the read is let go and counts as no list (null: the area says unavailable), so a hanging route
 * never holds the lists to their own limit (`./poller` `MU_LOBBY_REQUEST_TIMEOUT_MS`, 10 s) and never fails them. A
 * browser adaptation (MU.R1), the browser's own value: well under the lists' limit, well over a served list's answer.
 */
export const MU_CUSTOM_MATCHES_TIMEOUT_MS_ADAPTATION = 4_000;

/** The route (`forgeLobbyHttp.ts` `FORGE_LOBBIES_PATH`). */
export const CUSTOM_MATCHES_PATH = '/lobby/forge/lobbies';
/** The forge's page segment and its lobby parameter (`../../pageEntry` `FORGE_SEGMENT`, `../../forge/lobbyClient` `FORGE_LOBBY_PARAM`). */
const FORGE_PAGE = 'forge';
const FORGE_LOBBY = 'lobby';
/** A lobby's id as the server makes it (`forgeLobbyHttp.ts` `ID`). */
const FORGE_LOBBY_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** A listed forge lobby as the area draws it. */
export interface CustomMatch {
  id: string;
  name: string;
  /** The base: a map's stem (`MP72`), or `blank:<library>` (a blank floor). */
  base: string;
  players: number;
  /** The lobby's seats (the layout's `players`). */
  max: number;
  /** Its match is under way (the pre-match launched). */
  inMatch: boolean;
  /** FG-48a: it asks a password (the forge asks it at JOIN); false from a server before FG-48. */
  locked: boolean;
  /**
   * CHT-3 (a browser adaptation): the lobby's host record is community. The listing draws "unranked" and the
   * HyperNode label. Absent on a trusted host.
   */
  community?: true;
}

/**
 * The route's answer checked field by field; anything else throws. A lobby not marked `listed: true` is dropped: a
 * server from before FG-45 lists every lobby, and an unlisted one is joined by its link alone (FG.R24).
 */
export function customMatchesOf(raw: unknown): CustomMatch[] {
  const lobbies = obj(raw)['lobbies'];
  if (!Array.isArray(lobbies)) throw new Error('forge lobbies: not the shape');
  return lobbies.flatMap((x): CustomMatch[] => {
    const e = obj(x);
    const { id, name, base, players, max } = e;
    const inMatch = e['inMatch'] ?? false;
    const locked = e['locked'] === undefined ? false : e['locked'];
    if (!isStr(id) || !FORGE_LOBBY_ID.test(id) || !isStr(name) || !isStr(base) || !isInt(players) || players < 0 || !isInt(max) || max < 1 || typeof inMatch !== 'boolean'
      || typeof locked !== 'boolean') {
      throw new Error('forge lobbies: not the shape');
    }
    return e['listed'] === true ? [{ id, name, base, players, max, inMatch, locked, ...(e['community'] === true ? { community: true as const } : {}) }] : [];
  });
}

/** The custom matches' reader: the list, or null when the route gave none (MU_CUSTOM_MATCHES_OPTIONAL_ADAPTATION). Never throws. */
export interface CustomMatchSource {
  customMatches(signal: AbortSignal): Promise<CustomMatch[] | null>;
}

/** The reader over `fetch` at `base` (the account requests' base: the same server the forge's lobby client names). */
export function fetchCustomMatchSource(base: string, fetchFn: typeof fetch = (...a) => fetch(...a)): CustomMatchSource {
  return {
    async customMatches(signal) {
      try {
        const res = await fetchFn(`${base}${CUSTOM_MATCHES_PATH}`, { method: 'GET', credentials: 'omit', cache: 'no-store', signal });
        if (res.status !== 200) return null;
        return customMatchesOf(await res.json());
      } catch {
        return null;
      }
    },
  };
}

/**
 * A lobby's map as the area names it: a multiplayer map (`MP<n>`) by the disc's mission table when the disc is in --
 * the table's first multiplayer record of that number, the lookup GAME DETAILS reads a game's map by (`@s2u/ui`
 * `gameDetails`' `mpMission`, `FUN_002c9040`) -- else its stem (MU.R3: nothing of the disc before it is in); a blank
 * floor (`blank:<library>`) said as one, with its library's name; any other stem (a campaign mission) as it stands.
 */
export function customMatchMap(base: string, missions: readonly MissionRecord[] | null): string {
  const stemName = (stem: string): string => {
    const m = /^MP(\d+)$/i.exec(stem);
    const record = m && missions ? missions.find((r) => r.multiplayer && r.number === Number(m[1])) : undefined;
    return record?.name ?? stem;
  };
  return base.startsWith('blank:') ? `Blank floor (${stemName(base.slice('blank:'.length))})` : stemName(base);
}

/**
 * Where JOIN's forge is to read its lobby from (the view reads it off the page: `../../source` `devMode`,
 * `devSwitches` and the section's own base): `devmode`, whether the page has the developer's switch; `devtools`, whether
 * its dev-tools switch is on (`devSwitches`' `tools`: `devmode`, or `devtools` on a development build); `server`, the
 * base this section read the list from when it is not the page's own origin (null when it is).
 */
export interface CustomMatchServer { devmode: boolean; devtools?: boolean; server: string | null }

/**
 * JOIN's address: the forge's lobby link (`/forge/lobby/<id>`, the forge's `lobbyIdOf`; the lobby links plan's scope
 * (ii)), under the page's base. Under the developer's `devmode` the switch is carried -- or, without it, the
 * dev-tools switch's own word `devtools` -- and with it the list's server as `server=` when it is not the page's own;
 * nothing else of the page's address. So the forge's lobby base (`../../connectHost` `accountServiceBase`, the forge's
 * `lobbyBase`: `server=` only under the dev-tools switch on a development build) names the server this section read the
 * list from.
 */
export function customMatchAddress(id: string, from: CustomMatchServer, base: string = import.meta.env.BASE_URL ?? '/'): string {
  const b = base.endsWith('/') ? base : `${base}/`;
  const parts: string[] = [];
  if (from.devmode || from.devtools === true) {
    parts.push(from.devmode ? DEV_PARAM : DEVTOOLS_PARAM);
    if (from.server !== null) parts.push(`server=${encodeURIComponent(from.server)}`);
  }
  return `${b}${FORGE_PAGE}/${FORGE_LOBBY}/${encodeURIComponent(id)}${parts.length ? `?${parts.join('&')}` : ''}`;
}
