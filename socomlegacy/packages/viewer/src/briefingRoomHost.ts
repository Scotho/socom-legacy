import {
  AutoplaySearch, BriefingRoomChat, BriefingRoomCommands, isLobbyId, seedBriefingRoomValves,
  type AutoplayService, type BriefingRoomService, type ChannelListEntry, type ChatFwdLine, type ChatLinesReply, type LobbyChatService, type ServerSystemMessage, type MissionRecord, type GameListEntry, type GameListFilterQuery,
  type CurrentGameHeld, type GameListQuery, type JoinChannelQuery, type RoomPlayerEntry,
  type RoomLobby, type RoundQueueLine, type UiCommandHost, type UiVarManager, type ValveStore, type WorldReply, type ZAnimUiCommand,
} from '@s2u/ui';
import { gameListPing, type DoorPingCacheDeps } from './gamePing';

/**
 * ONL-12's page half (web research 162 §4): the briefing room's requests to SVC-06's endpoint (research 154 §1) --
 * `/lobby/join-channel`, `/lobby/set-filter`, `/lobby/leave-channel`, `/lobby/game-list` -- at the page's own origin
 * (`ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`, `./connectHost`) with the session's ticket as the bearer, as ONL-11's room
 * list (`./worldOfSocomHost`); and the session's mount of `@s2u/ui`'s `BriefingRoomCommands` over ONL-07's lobby. The
 * transport is ours (OT.R27); the fields and what the client does with them are the original's. ONL-15 (research 265
 * §2): `/lobby/clear-filter` beside them, for AUTOPLAY's chain (`AutoplaySearch`, mounted here over the same rows).
 * ONL-23 (research 266 §1): SVC-18's `/lobby/find-player`, `/lobby/chat` and `/lobby/chat-lines` for the lobby server's
 * chat (`BriefingRoomChat`, mounted here; its poll stepped by `frame`). SVC-15 (research 268 §3): `/lobby/room-player-list`
 * for the room's PLAYER LIST (`RefreshRoomPlayerList`, its period on the page's clock).
 */

/** A 401: the server holds no session for the ticket (`SESSION_LOST_READING`, `@s2u/ui`'s lobby client). */
export const BRIEFING_ROOM_SESSION_LOST = 'session-lost' as const;
type Lost = typeof BRIEFING_ROOM_SESSION_LOST;

/**
 * BRIEFING_ROOM_HTTP_ADAPTATION: how the four requests' HTTP answers read, as the room list's
 * (`ROOM_LIST_HTTP_ADAPTATION`): 2xx the reply's fields, checked; 401 the session lost, handed to the lobby client's
 * `sessionLost` (state 2: MP_MEDIUS_ERROR, which both dialogs bind to `OnMultiplayerDisconnect`); anything else -- 403,
 * 404, 429, 5xx, another shape, no answer -- a request never answered. With no ticket no request is sent
 * (`ROOM_LIST_NO_TICKET_ADAPTATION`'s reason). A browser adaptation of the transport.
 */
export const BRIEFING_ROOM_HTTP_ADAPTATION = '2xx the reply; 401 the session lost; anything else never answered; no ticket, no request' as const;

const isStr = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const record = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object') throw new Error('briefing room reply: not the shape');
  return raw as Record<string, unknown>;
};
const ints = <K extends string>(raw: unknown, keys: readonly K[]): Record<K, number> => {
  const r = record(raw);
  if (!keys.every((k) => isInt(r[k]))) throw new Error('briefing room reply: not the shape');
  return Object.fromEntries(keys.map((k) => [k, r[k] as number])) as Record<K, number>;
};

const GAME_INTS = [
  'status', 'mediusWorldId', 'playerCount', 'minPlayers', 'maxPlayers', 'gameLevel', 'playerSkillLevel', 'rulesSet', 'genericField1', 'genericField2',
  'genericField3', 'securityLevel', 'worldStatus', 'gameHostType',
] as const;

/** SVC-06's game list (`{ entries: [...] }`, research 154 §1) checked field by field; anything else throws. */
export function gameListOf(raw: unknown): GameListEntry[] {
  const list = record(raw)['entries'];
  if (!Array.isArray(list)) throw new Error('game list: not the shape');
  return list.map((x) => {
    const e = record(x);
    if (!isStr(e['gameName']) || !isStr(e['gameStats']) || !isBool(e['endOfList'])) throw new Error('game list entry: not the shape');
    const lobbyId = typeof e['lobbyId'] === 'string' && isLobbyId(e['lobbyId']) ? e['lobbyId'] : undefined;
    // B138: the CPU seats a joining player may take (central's CPU_SEAT_REPLACEABLE_ADAPTATION), sent only above 0.
    const replaceable = Number.isSafeInteger(e['replaceable']) && (e['replaceable'] as number) > 0 ? e['replaceable'] as number : undefined;
    return {
      ...ints(e, GAME_INTS), gameName: e['gameName'], gameStats: e['gameStats'], endOfList: e['endOfList'], ...(lobbyId ? { lobbyId } : {}),
      ...(replaceable ? { replaceable } : {}),
    };
  });
}

/** SVC-15's player list (`{ entries: [...] }` of Lobby 0xdd rows, research 268 §3) checked field by field; anything else throws. */
export function roomPlayerListOf(raw: unknown): RoomPlayerEntry[] {
  const list = record(raw)['entries'];
  if (!Array.isArray(list)) throw new Error('room player list: not the shape');
  return list.map((x) => {
    const e = record(x);
    if (!isStr(e['accountName']) || !isBool(e['endOfList'])) throw new Error('room player row: not the shape');
    const s = record(e['onlineState']);
    if (!isStr(s['lobbyName']) || !isStr(s['gameName'])) throw new Error('room player row: not the shape');
    return {
      ...ints(e, ['status', 'accountId'] as const), accountName: e['accountName'],
      onlineState: { ...ints(s, ['connectStatus', 'lobbyWorldId', 'gameWorldId'] as const), lobbyName: s['lobbyName'], gameName: s['gameName'] },
      endOfList: e['endOfList'],
    };
  });
}

/** The transport: each request with the ticket as its bearer. */
export interface BriefingRoomTransport {
  joinChannel(q: JoinChannelQuery, ticket: string): Promise<WorldReply | Lost>;
  setGameListFilter(q: GameListFilterQuery, ticket: string): Promise<{ status: number; filterId: number } | Lost>;
  leaveChannel(ticket: string): Promise<{ status: number } | Lost>;
  gameList(q: GameListQuery, ticket: string): Promise<GameListEntry[] | Lost>;
  /** ONL-15: AUTOPLAY's ClearGameListFilter0 (`/lobby/clear-filter`); absent, a request never answered. */
  clearGameListFilter?(q: { filterId: number }, ticket: string): Promise<{ status: number } | Lost>;
  /** ONL-23: FindPlayer (`/lobby/find-player`); absent, a request never answered. */
  findPlayer?(q: { name: string }, ticket: string): Promise<{ status: number; accountId: number; accountName: string } | Lost>;
  /** ONL-23: ChatMessage (`/lobby/chat`, 204 and no body); absent, never sent. */
  chat?(q: { messageType: number; targetId: number; message: string }, ticket: string): Promise<void | Lost>;
  /** ONL-23: the page's waiting ChatFwdMessages (`/lobby/chat-lines`); absent, a request never answered. */
  chatLines?(ticket: string): Promise<ChatFwdLine[] | ChatLinesReply | Lost>;
  /** SVC-15: GetLobbyPlayerNames_ExtraInfo (`/lobby/room-player-list`); absent, a request never answered. */
  roomPlayerList?(q: { mediusWorldId: number }, ticket: string): Promise<RoomPlayerEntry[] | Lost>;
}

/** SVC-18's waiting lines (`{ lines: [...] }`, research 263 §1) checked field by field; anything else throws. */
export function chatLinesOf(raw: unknown): ChatFwdLine[] {
  const list = record(raw)['lines'];
  if (!Array.isArray(list)) throw new Error('chat lines: not the shape');
  return list.map((x) => {
    const e = record(x);
    if (!isStr(e['originatorAccountName']) || !isStr(e['message'])) throw new Error('chat line: not the shape');
    return { ...ints(e, ['originatorAccountId', 'messageType'] as const), originatorAccountName: e['originatorAccountName'], message: e['message'] };
  });
}

/**
 * SA-43c RESTART-NOTICE (an adaptation of the transport): `/lobby/chat-lines`' reply with central's optional `system` --
 * the lines as `chatLinesOf` reads them and each system message checked field by field, one not of the shape skipped (the
 * lines are never lost for it); a reply without the key (an older central's) is the lines alone, as before.
 */
export function chatReplyOf(raw: unknown): ChatFwdLine[] | ChatLinesReply {
  const lines = chatLinesOf(raw);
  const list = record(raw)['system'];
  if (list === undefined) return lines;
  const system: ServerSystemMessage[] = [];
  for (const x of Array.isArray(list) ? list : []) {
    const m = x !== null && typeof x === 'object' ? x as Record<string, unknown> : {};
    if (Number.isSafeInteger(m['id']) && Number.isSafeInteger(m['severity']) && isStr(m['text'])) system.push({ id: m['id'] as number, severity: m['severity'] as number, text: m['text'] });
  }
  return { lines, system };
}

/**
 * NET-DRAIN (web research 223 §7): a request the server refused with a JSON body carrying the Medius status -- the drain's
 * 503 -- is passed on as that status (`refused`), so the screen shows its refusal at once; a refusal without one is a
 * request never answered, as before.
 */
async function statusOf(res: Response): Promise<number | null> {
  try {
    const body = await res.json() as { status?: unknown } | null;
    return body && typeof body === 'object' && Number.isSafeInteger(body.status) ? body.status as number : null;
  } catch { return null; }
}

/** The four requests over the match server's `POST <base>/lobby/<op>` (`BRIEFING_ROOM_HTTP_ADAPTATION`). */
export function fetchBriefingRoomService(base: string, fetchFn: typeof fetch = (...a) => fetch(...a)): BriefingRoomTransport {
  const post = async <T>(op: string, body: unknown, ticket: string, read: (raw: unknown) => T, refused?: (status: number) => T): Promise<T | Lost> => {
    const res = await fetchFn(`${base}/lobby/${op}`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ticket}` }, body: JSON.stringify(body),
      credentials: 'omit', cache: 'no-store',
    });
    if (res.status === 401) return BRIEFING_ROOM_SESSION_LOST;
    if (!res.ok) {
      const status = refused ? await statusOf(res) : null;
      if (status !== null && status !== 0) return refused!(status);
      throw new Error(`${op}: HTTP ${res.status}`);
    }
    return read(await res.json());
  };
  return {
    joinChannel: (q, t) => post('join-channel', q, t, (r) => ints(r, ['status', 'mediusWorldId'] as const), (status) => ({ status, mediusWorldId: 0 })),
    setGameListFilter: (q, t) => post('set-filter', q, t, (r) => ints(r, ['status', 'filterId'] as const)),
    leaveChannel: (t) => post('leave-channel', {}, t, (r) => ints(r, ['status'] as const)),
    gameList: (q, t) => post('game-list', q, t, gameListOf),
    clearGameListFilter: (q, t) => post('clear-filter', q, t, (r) => ints(r, ['status'] as const)),
    findPlayer: (q, t) => post('find-player', q, t, (r) => {
      const name = record(r)['accountName'];
      if (!isStr(name)) throw new Error('find-player: not the shape');
      return { ...ints(r, ['status', 'accountId'] as const), accountName: name };
    }),
    chat: async (q, t) => {
      const res = await fetchFn(`${base}/lobby/chat`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, body: JSON.stringify(q),
        credentials: 'omit', cache: 'no-store',
      });
      if (res.status === 401) return BRIEFING_ROOM_SESSION_LOST;
      if (!res.ok) throw new Error(`chat: HTTP ${res.status}`);
      return undefined;                                                         // 204: ChatMessage has no reply
    },
    chatLines: (t) => post('chat-lines', {}, t, chatReplyOf),          // SA-43c: with central's `system`
    roomPlayerList: (q, t) => post('room-player-list', { mediusWorldId: q.mediusWorldId }, t, roomPlayerListOf),
  };
}

/** The client's `BriefingRoomService` over the transport: the session's ticket read at each request, a 401 handed to `sessionLost`. */
export function sessionBriefingRoom(t: BriefingRoomTransport, ticket: () => string | null, sessionLost: (ticket: string) => void): BriefingRoomService & AutoplayService & LobbyChatService {
  const send = async <T>(ask: (held: string) => Promise<T | Lost>): Promise<T> => {
    const held = ticket();
    if (held === null) throw new Error('briefing room: no ticket');
    const r = await ask(held);
    if (r === BRIEFING_ROOM_SESSION_LOST) { sessionLost(held); throw new Error('briefing room: session lost'); }
    return r as T;
  };
  return {
    joinChannel: (q) => send((h) => t.joinChannel(q, h)),
    setGameListFilter: (q) => send((h) => t.setGameListFilter(q, h)),
    leaveChannel: () => send((h) => t.leaveChannel(h)),
    gameList: (q) => send((h) => t.gameList(q, h)),
    clearGameListFilter: (q) => (t.clearGameListFilter ? send((h) => t.clearGameListFilter!(q, h)) : Promise.reject(new Error('briefing room: no clear-filter'))),
    findPlayer: (q) => (t.findPlayer ? send((h) => t.findPlayer!(q, h)) : Promise.reject(new Error('briefing room: no find-player'))),
    chat: (q) => (t.chat ? send((h) => t.chat!(q, h)) : Promise.reject(new Error('briefing room: no chat'))),
    chatLines: () => (t.chatLines ? send((h) => t.chatLines!(h)) : Promise.reject(new Error('briefing room: no chat-lines'))),
    roomPlayerList: (q) => (t.roomPlayerList ? send((h) => t.roomPlayerList!(q, h)) : Promise.reject(new Error('briefing room: no room-player-list'))),
  };
}

export interface BriefingRoomMount {
  uiVars: UiVarManager;
  valves: () => ValveStore;
  /** ONL-07's lobby client; null with no account service: nothing is joined. */
  lobby: RoomLobby | null;
  /** ONL-11's records (`WorldOfSocomCommands.rooms()`). */
  rooms: () => readonly ChannelListEntry[];
  /** The running animation's input string (the shell's). */
  inputString: (cmd: ZAnimUiCommand) => string | null;
  /** The lobby's events into the built dialog, with their text (`lobbyEventInto`). */
  event: (kind: number, text: string | null) => void;
  /** SVC-06's endpoint (`fetchBriefingRoomService`); absent, never answered. */
  service?: BriefingRoomTransport;
  ticket: () => string | null;
  sessionLost: (ticket: string) => void;
  /** ONL-13's `missionlist.rdr` records: the game-type filter's types (ONL-15); absent, none. */
  missions?: () => readonly MissionRecord[];
  /** ONL-15: AUTOPLAY's game found, handed to the game lobby (`GameLobbyCommands.randomGameFound`). */
  found?: (game: GameListEntry) => void;
  /** CLAN-ID-WIRE: the client's clan id (`DAT_0044f59c`, the session's `LobbyClan.clanId`) for AUTOPLAY's `FUN_002e9940`; absent, -1. */
  clanId?: () => number;
  /** ONL-23: the page's clock, ms, for the chat's poll (`CHAT_POLL_MS_ADAPTATION`); SVC-15: the player list's period; absent, `performance.now`. */
  now?: () => number;
  /**
   * SVC-19 (research 266 §3.3): the round's drain of the lobby server's lines (`BriefingRoomChat`'s `round`): the
   * mounted match's (`./roundChat`), null while none is up; absent, never a round's.
   */
  round?: () => ((line: RoundQueueLine) => void) | null;
  /** SA-43c: a match loading (the load state current, `FUN_001e7c80`): a server system message is dropped; absent, never. */
  loading?: () => boolean;
  /** `GetGameInfo('CurrentGame')` (research 154 §7.1): the game lobby's held play list and mission (`GameLobbyCommands.currentGame`); absent, none. */
  currentGame?: () => CurrentGameHeld | null;
  /**
   * GAME-PING (Craig's "go", 2026-10-31/11-01; a browser adaptation, `./gamePing`): the game list's PING drawn from the
   * page's round trip to the joined room's host door (`roomDoor`, the room list's `doors`), banded by the original's
   * bounds, in place of GenericField2's band (65000 on the wire, so every game red); the wire and the filter unchanged.
   * Absent, the original's band. `probe`/`now`: the door probe's seams (`timeDoorPing`, `performance.now` by default).
   */
  gamePing?: { roomDoor: (room: string) => string | null } & Omit<DoorPingCacheDeps, 'changed'>;
}

/** The mount (`FrontEndSession`'s one call): the join's and the room's rows, the gate, the lobby's states 19 and 20, the filters' seed. */
export function connectBriefingRoom(host: UiCommandHost, m: BriefingRoomMount): { commands: BriefingRoomCommands; autoplay: AutoplaySearch; service: AutoplayService | undefined; chat: BriefingRoomChat; launch(): void; frame(): void } {
  const service = m.service ? sessionBriefingRoom(m.service, m.ticket, m.sessionLost) : undefined;
  // ONL-23 (research 266 §1): the lobby server's chat -- `SendMediusChat`, the lines polled and drawn.
  const chat = new BriefingRoomChat({ uiVars: m.uiVars, lobby: m.lobby, service, rooms: m.rooms, event: m.event, ticket: m.service ? m.ticket : undefined, ...(m.round ? { round: m.round } : {}), ...(m.loading ? { loading: m.loading } : {}) });
  chat.register(host);
  // GAME-PING: a door's answer draws the held games again (`redrawGameList`, nothing sent); a session's change clears it.
  const gamePing = m.gamePing ? gameListPing(m.gamePing.roomDoor, { ...m.gamePing, changed: () => { commands.redrawGameList(); } }) : null;
  let pingTicket = m.ticket();
  const commands: BriefingRoomCommands = new BriefingRoomCommands({
    uiVars: m.uiVars, valves: m.valves, lobby: m.lobby, rooms: m.rooms, inputString: m.inputString, event: m.event,
    service, ticket: m.service ? m.ticket : undefined, ...(m.missions ? { missions: m.missions } : {}), chat, ...(m.now ? { now: m.now } : {}),
    ...(m.currentGame ? { currentGame: m.currentGame } : {}),
    ...(gamePing ? { gamePing: gamePing.cell } : {}),
  });
  commands.register(host);
  // ONL-15 (research 265 §2): AUTOPLAY's chain over the same transport, the room's join and the lobby's game join.
  const autoplay = new AutoplaySearch({ service, briefing: commands, rooms: m.rooms, event: m.event, found: (g) => { m.found?.(g); }, ...(m.clanId ? { clanId: m.clanId } : {}) });
  const launch = (): void => { seedBriefingRoomValves(m.valves()); };
  launch();
  // LOBBY-INVITE (INVITE_JOIN_ADAPTATION, `./inviteHost`): the invite's search over the same session-held transport as AUTOPLAY's.
  const frame = (): void => {
    chat.frame(m.now?.() ?? performance.now());
    const ticket = m.ticket();
    if (ticket !== pingTicket) { pingTicket = ticket; gamePing?.clear(); }
  };
  return { commands, autoplay, service, chat, launch, frame };
}
