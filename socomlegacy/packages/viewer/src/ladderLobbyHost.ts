import {
  LadderLobbyCommands,
  type ClanListEntry, type ClanListQuery, type ClanPositionQuery, type ClanPositionReply, type ClanTotalReply,
  type LadderListEntry, type LadderListQuery, type LadderOnlineState, type LadderPositionReply, type LadderService, type LobbyClan, type PlayerInfoAnswer, type PlayerInfoQuery,
  type UiCommandHost, type UiVarManager, type ValveStore, type ZAnimUiCommand,
} from '@s2u/ui';

/**
 * ONL-30a's page half (web research 269 §2): PLAYER RANKING's and PLAYER INFO's requests -- SVC-13's
 * `/lobby/ladder-position` and `/lobby/ladder-list` (`packages/central/src/ladder.ts`, `LOBBY_LADDER_PATHS`; research 261
 * §9) and SVC-15a's `/lobby/player-info` (`playerInfo.ts`, research 268 §1) -- at the page's own origin
 * (`ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`, `./connectHost`) with the session's ticket as the bearer, as ONL-25's ignore
 * list (`./ignoreListHost`); and the session's mount of `@s2u/ui`'s `LadderLobbyCommands` -- one client ladder for SOCOM
 * II ONLINE's top ten and PLAYER RANKING. The transport is ours (OT.R27); the fields and what the client does with them
 * are the original's. The answers read as `BRIEFING_ROOM_HTTP_ADAPTATION` (`./briefingRoomHost`) reads them: 2xx the
 * reply's fields, checked; 401 the session lost (handed to the lobby client's `sessionLost`: state 2, MP_MEDIUS_ERROR,
 * which PLAYER RANKING binds to `OnMultiplayerDisconnect`); anything else a request never answered; no ticket, no
 * request; an answer that lands once the ticket is no longer the one asked with is never answered (as SVC-15a's
 * `sessionPlayerInfo`), so another account's ladder never reaches this session.
 *
 * My position (SVC-15, research 268 §3.6; `LADDER_POSITION_BY_NAME_ADAPTATION` retired): one `/lobby/ladder-position`
 * of stat 0 in order 1 with no account -- the services answer the bearer's own, as 0xf1 carries the session's
 * (`FUN_002eafb0` D:L188987). The rows carry each one's account id at +0x20 (`LADDER_ROW_KEY_ADAPTATION` retired).
 *
 * CLAN RANKING's three (ONL-30, web research 311 §8.2 item 3): CLAN-BOARD-SERVER's `/lobby/clan-ladder-position` (0xd4:
 * the clan id, stat 0, order 1, the tag "GetSurrounding" or none), `/lobby/total-rankings` with `{ ladderType: 1 }` (0xd8,
 * the clans' total) and `/lobby/clan-ladder-list` (0xd2: the tag, stat 0, order 1, the start, the count), each reply
 * checked as the players' are, through the same session rules. The console's "ClanTotal" MessageID is not on our wire:
 * the total's reply carries none and the page knows which request it sent (the transport, OT.R27). The mount hands the
 * session's `LobbyClan` to the rows (`clan`): the client's clan id and whether one is held; and its roster to PLAYER
 * INFO's CLAN origin (`clanState`, PLAYER-INFO-CLAN, research 272 §5).
 */

/** A 401: the server holds no session for the ticket (`SESSION_LOST_READING`, `@s2u/ui`'s lobby client). */
export const LADDER_SESSION_LOST = 'session-lost' as const;
type Lost = typeof LADDER_SESSION_LOST;

/** The stat and the order 0xf1 carries (`FUN_002eafb0` D:L188985-188986: `LadderStatIndex` 0, `MediusSortOrder` 1). */
const POSITION_QUERY = { ladderStatIndex: 0, sortOrder: 1 } as const;
/** GetTotalRankings' ladder type for the clans (`FUN_002eab80` D:L188822: type 1 at +0x18; the server's `LADDER_TYPE.Clan`). */
const CLAN_LADDER_TYPE = 1;

const isStr = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const record = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object') throw new Error('ladder reply: not the shape');
  return raw as Record<string, unknown>;
};
const ints = <K extends string>(raw: unknown, keys: readonly K[]): Record<K, number> => {
  const r = record(raw);
  if (!keys.every((k) => isInt(r[k]))) throw new Error('ladder reply: not the shape');
  return Object.fromEntries(keys.map((k) => [k, r[k] as number])) as Record<K, number>;
};
/** A record served: 512 hex digits, or the empty text of a reply that carries none. */
const isStats = (v: unknown): v is string => isStr(v) && (v === '' || /^[0-9a-fA-F]{512}$/.test(v));

/** SVC-13's page (`{ entries: [...] }` of Lobby 0xf0 rows) checked field by field; anything else throws. */
export function ladderListOf(raw: unknown): LadderListEntry[] {
  const list = record(raw)['entries'];
  if (!Array.isArray(list)) throw new Error('ladder list: not the shape');
  return list.map((x) => {
    const e = record(x);
    if (!isStr(e['accountName']) || !isStats(e['stats']) || !isBool(e['endOfList'])) throw new Error('ladder row: not the shape');
    const s = record(e['onlineState']);
    if (!isStr(s['lobbyName']) || !isStr(s['gameName'])) throw new Error('ladder row: not the shape');
    return {
      ...ints(e, ['status', 'ladderPosition', 'accountId'] as const), accountName: e['accountName'], stats: e['stats'],
      onlineState: { ...ints(s, ['connectStatus', 'lobbyWorldId', 'gameWorldId'] as const), lobbyName: s['lobbyName'], gameName: s['gameName'] },
      endOfList: e['endOfList'],
    };
  });
}

/** CLAN-BOARD-SERVER's page (`{ entries: [...] }` of Lobby 0xd3 rows: `{ tag, status, clanId, clanName, ladderPosition, endOfList }`) checked field by field; anything else throws. */
export function clanLadderListOf(raw: unknown): ClanListEntry[] {
  const list = record(raw)['entries'];
  if (!Array.isArray(list)) throw new Error('clan ladder list: not the shape');
  return list.map((x) => {
    const e = record(x);
    if (!isStr(e['tag']) || !isStr(e['clanName']) || !isBool(e['endOfList'])) throw new Error('clan ladder row: not the shape');
    return { tag: e['tag'], ...ints(e, ['status', 'clanId'] as const), clanName: e['clanName'], ...ints(e, ['ladderPosition'] as const), endOfList: e['endOfList'] };
  });
}

/** CLAN-BOARD-SERVER's 0xd4 reply (`{ tag, status, ladderPosition, totalRankings }`) checked; anything else throws. */
export function clanPositionOf(raw: unknown): ClanPositionReply {
  const r = record(raw);
  if (!isStr(r['tag'])) throw new Error('clan position: not the shape');
  return { tag: r['tag'], ...ints(r, ['status', 'ladderPosition', 'totalRankings'] as const) };
}

/** SVC-15a's reply (`PlayerInfoReply`: `{ status, accountName, playerStatus, stats }`) checked; anything else throws. */
export function playerInfoOf(raw: unknown): PlayerInfoAnswer {
  const r = record(raw);
  if (!isStr(r['accountName']) || !isStats(r['stats'])) throw new Error('player info: not the shape');
  return { ...ints(r, ['status', 'playerStatus'] as const), accountName: r['accountName'], stats: r['stats'] };
}

/** The transport: each request with the ticket as its bearer. */
export interface LadderTransport {
  position(ticket: string): Promise<LadderPositionReply | Lost>;
  list(q: LadderListQuery, ticket: string): Promise<LadderListEntry[] | Lost>;
  playerInfo(q: PlayerInfoQuery, ticket: string): Promise<PlayerInfoAnswer | Lost>;
  /** ONL-30: the clan's position (0xd4). */
  clanPosition(q: ClanPositionQuery, ticket: string): Promise<ClanPositionReply | Lost>;
  /** ONL-30: the clans' total (0xd8 type 1). */
  clanTotal(ticket: string): Promise<ClanTotalReply | Lost>;
  /** ONL-30: a page of the clans' board (0xd2). */
  clanList(q: ClanListQuery, ticket: string): Promise<ClanListEntry[] | Lost>;
}

/** The requests over the match server's `POST <base>/lobby/<op>` (the module's reading of the answers). */
export function fetchLadderService(base: string, fetchFn: typeof fetch = (...a) => fetch(...a)): LadderTransport {
  const post = async <T>(op: string, body: unknown, ticket: string, read: (raw: unknown) => T): Promise<T | Lost> => {
    const res = await fetchFn(`${base}/lobby/${op}`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ticket}` }, body: JSON.stringify(body),
      credentials: 'omit', cache: 'no-store',
    });
    if (res.status === 401) return LADDER_SESSION_LOST;
    if (!res.ok) throw new Error(`${op}: HTTP ${res.status}`);
    return read(await res.json());
  };
  const playerInfo = (q: PlayerInfoQuery, t: string): Promise<PlayerInfoAnswer | Lost> =>
    post('player-info', 'name' in q ? { name: q.name } : { accountId: q.accountId }, t, playerInfoOf);
  return {
    // SVC-15: 0xf1 in one request, the bearer's own account (the services', `lobbyHttp.ts`'s ladder-position).
    position: (t) => post('ladder-position', { ...POSITION_QUERY }, t, (r) => ints(r, ['status', 'ladderPosition', 'totalRankings'] as const)),
    list: (q, t) => post('ladder-list', { ladderStatIndex: q.ladderStatIndex, sortOrder: q.sortOrder, startPosition: q.startPosition, pageSize: q.pageSize }, t, ladderListOf),
    playerInfo,
    // ONL-30 (CLAN-BOARD-SERVER, `lobbyHttp.ts`'s three cases): the tag sent only when the console writes one.
    clanPosition: (q, t) => post('clan-ladder-position', { clanId: q.clanId, ladderStatIndex: q.ladderStatIndex, sortOrder: q.sortOrder, ...(q.tag !== undefined ? { tag: q.tag } : {}) }, t, clanPositionOf),
    clanTotal: (t) => post('total-rankings', { ladderType: CLAN_LADDER_TYPE }, t, (r) => ints(r, ['status', 'totalRankings'] as const)),
    clanList: (q, t) => post('clan-ladder-list', { tag: q.tag, ladderStatIndex: q.ladderStatIndex, sortOrder: q.sortOrder, startPosition: q.startPosition, pageSize: q.pageSize }, t, clanLadderListOf),
  };
}

/**
 * The client's `LadderService` over the transport: the session's ticket read at each request (none: no request), a
 * 401 handed to `sessionLost`, an answer under a ticket no longer held a request never answered.
 */
export function sessionLadder(t: LadderTransport, ticket: () => string | null, sessionLost: (ticket: string) => void): LadderService {
  const send = async <T>(ask: (held: string) => Promise<T | Lost>): Promise<T> => {
    const held = ticket();
    if (held === null) throw new Error('ladder: no ticket');
    const r = await ask(held);
    if (r === LADDER_SESSION_LOST) { sessionLost(held); throw new Error('ladder: session lost'); }
    if (ticket() !== held) throw new Error('ladder: another session');
    return r as T;
  };
  return {
    position: () => send((h) => t.position(h)),
    list: (q) => send((h) => t.list(q, h)),
    playerInfo: (q) => send((h) => t.playerInfo(q, h)),
    clanPosition: (q) => send((h) => t.clanPosition(q, h)),
    clanTotal: () => send((h) => t.clanTotal(h)),
    clanList: (q) => send((h) => t.clanList(q, h)),
  };
}

export interface LadderLobbyMount {
  uiVars: UiVarManager;
  /** The launch's valves (the menu state's): the medal and the tier the position answers write. */
  valves: () => ValveStore;
  /** The transport (`fetchLadderService`); absent, every request never answered. */
  service?: LadderTransport;
  ticket: () => string | null;
  sessionLost: (ticket: string) => void;
  /** The running animation's input string (the shell's): the row's key for PLAYER INFO. */
  inputString: (cmd: ZAnimUiCommand) => string | null;
  /** The lobby's events into the built dialog (`lobbyEventInto`): ON_LADDER_REFRESH. */
  event: (kind: number, text: string | null) => void;
  /** ONL-07's lobby: its +0x7d, its state and the account's name; absent, the readings (`WORLD_LOBBY_STATE_READING`, `ACCOUNT_NAME_READING`). */
  lobby?: { readonly up: boolean; state(): number; account?(): string | null } | null;
  /** ONL-24: the friends list's online state of a name (`FriendListCommands.onlineStateByName`), PLAYER INFO's FRIEND origin; absent, none. */
  friendState?: (name: string) => LadderOnlineState | null;
  /** SVC-15: the room's player list's online state of a name (`BriefingRoomCommands.roomPlayerState`), PLAYER INFO's BRIEFING origin; absent, none. */
  roomState?: (name: string) => LadderOnlineState | null;
  /**
   * ONL-30: the session's `LobbyClan` (`WorldOfSocomCommands.clan`, as the clan pages' mounts take it): CLAN RANKING's
   * clan id and whether one is held; PLAYER-INFO-CLAN: its roster's `find` (`FUN_002e9460` on 0x44f740), PLAYER INFO's
   * CLAN origin (`clanState`). Absent, none held and no roster row found.
   */
  clan?: Pick<LobbyClan, 'clanId' | 'member' | 'find'>;
}

/**
 * The mount (`FrontEndSession`'s one call): the three rows (92, 162, 173) over the session's transport. PLAYER-INFO-CLAN:
 * PLAYER INFO's CLAN origin built here from the session's clan -- `clanState` its roster's row of the reply's name
 * (`LobbyClan.find`, `FUN_002e9460` D:L188026-188056, as `FUN_002f0020` calls it at D:L191827), read at each reply, so
 * the roster GetClanRoster last wrote.
 */
export function connectLadderLobby(host: UiCommandHost, m: LadderLobbyMount): LadderLobbyCommands {
  const lobby = m.lobby ?? null;
  const clan = m.clan;
  const commands = new LadderLobbyCommands({
    uiVars: m.uiVars, valves: m.valves, service: m.service ? sessionLadder(m.service, m.ticket, m.sessionLost) : undefined,
    event: m.event, inputString: m.inputString, ...(m.friendState ? { friendState: m.friendState } : {}), ...(m.roomState ? { roomState: m.roomState } : {}),
    ...(clan ? { clan, clanState: (name: string) => clan.find(name) } : {}),
    ...(lobby ? { lobbyUp: () => lobby.up, lobbyState: () => lobby.state(), accountName: () => lobby.account?.() ?? null } : {}),
  });
  commands.register(host);
  return commands;
}
