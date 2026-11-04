import {
  ClanInvitationCommands, LOBBY_STATE, LogoffCommands, MyClanInvitations, OnlineOptionsCommands, ROOM_LIST_VAR, WorldOfSocomCommands, lobbySessionStart, seedWorldOfSocomValves,
  type AnnouncementQuery, type AnnouncementReply, type AnnouncementService, type ChannelListEntry, type ClanInvitationsService, type LobbyStateHandler, type LogoffLobby,
  type OwnerFieldsService, type PlayerInfoLookup, type RoomListQuery, type RoomListService, type UiCommandHost, type UiVarManager, type UiVarValue, type ValveStore,
} from '@s2u/ui';
import { roomRowsWithPing } from './briefingRoomPing';
import { timeDoorPing } from './doorPing';

/**
 * ONL-09's page half (web research 158 §4): the SOCOM II ONLINE menu's mount on the session, and the announcement
 * request's service. `GetMediusAnnouncements` (`@s2u/ui`'s `WorldOfSocomCommands`) sends GetAnnouncements through the
 * service to the match server, which answers it from SVC-05's texts (`packages/central/src/serverTexts.ts`,
 * `POST /texts/announcement`, mounted when the server has a data directory) with one Lobby 0x4d reply. The base is
 * ONL-04's (`universeServiceBase`). The transport is ours (a browser adaptation, as SVC-05's endpoint is); the
 * request's word and the reply's fields are the original's. Any failure is a request never answered: the promise
 * rejects and "Retrieving messages from server..." stays, as the console's would with no reply.
 */

const isStr = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

/** The server's reply checked field by field; anything else throws. */
export function announcementReplyOf(raw: unknown): AnnouncementReply {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || !isInt(r['status']) || !isInt(r['announcementId']) || !isStr(r['announcement']) || !isBool(r['endOfList'])) {
    throw new Error('announcement reply: not the shape');
  }
  return { status: r['status'] as number, announcementId: r['announcementId'] as number, announcement: r['announcement'] as string, endOfList: r['endOfList'] as boolean };
}

/** The announcement service over the match server's `POST <base>/texts/announcement`. */
export function fetchAnnouncementService(base: string, fetchFn: typeof fetch = (...a) => fetch(...a)): AnnouncementService {
  return {
    announcement: async (q: AnnouncementQuery) => {
      // TEXTS-OMIT: no cookie and no cache, as the account routes' clients (a browser adaptation's hardening; the request word unchanged).
      const res = await fetchFn(`${base}/texts/announcement`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q), credentials: 'omit', cache: 'no-store' });
      if (!res.ok) throw new Error(`announcement request: HTTP ${res.status}`);
      return announcementReplyOf(await res.json());
    },
  };
}

// ---- ONL-11: the room list (web research 161 §3) ----

/** A 401 for the room list: the server holds no session for the ticket (`SESSION_LOST_READING`, `@s2u/ui`'s lobby client). */
export const ROOM_LIST_SESSION_LOST = 'session-lost' as const;

/**
 * ROOM_LIST_HTTP_ADAPTATION: how `/lobby/channel-list`'s HTTP answer reads. 2xx with `{ entries: [...] }` of the 0xed
 * entry's fields: the reply, handed to `FUN_002e3b00`'s transcription whole. 401: the session lost -- the ticket handed
 * to the lobby client's `sessionLost`, as the keep-alive's 401 is (state 2: MP_MEDIUS_ERROR with UIMnLOC 450, which
 * this dialog binds to `UIanim.rdr`'s `OnMultiplayerDisconnect`). Anything else -- 403, 404, 429, 5xx, another shape,
 * no answer at all -- is a request never answered: the list keeps what it drew, as the console's would with no reply.
 * A browser adaptation of the transport (OT.R27); the entries and what the client does with them are the original's.
 */
export const ROOM_LIST_HTTP_ADAPTATION = '2xx the entries; 401 the session lost; anything else a request never answered' as const;

/**
 * ROOM_LIST_NO_TICKET_ADAPTATION: with no ticket held (no login on this page: a deep link to the menu, a session lost)
 * no request is sent and the list is a request never answered. The console sends its request on the lobby
 * connection whatever its login; the page's request without a bearer would be refused 401 and read as a session lost
 * that never began. A browser adaptation.
 */
export const ROOM_LIST_NO_TICKET_ADAPTATION = 'no ticket: no request, the list never answered' as const;

/** LATER 455 (OT.R84): the room list with each room's door origin by its name -- the rooms whose host is known. */
export interface RoomListWithDoors { entries: readonly ChannelListEntry[]; doors: ReadonlyMap<string, string> }

/** The transport: `/lobby/channel-list` asked with the ticket as its bearer. */
export interface RoomListTransport {
  channelList(q: RoomListQuery, ticket: string): Promise<readonly ChannelListEntry[] | typeof ROOM_LIST_SESSION_LOST>;
  /** LATER 455: the same request, the reply's `doors` kept beside its entries (`roomDoorsOf`); absent, no room has a door. */
  channelListWithDoors?(q: RoomListQuery, ticket: string): Promise<RoomListWithDoors | typeof ROOM_LIST_SESSION_LOST>;
}

const ENTRY_INTS = ['status', 'mediusWorldId', 'playerCount', 'maxPlayers', 'securityLevel', 'genericField1'] as const;

/** SVC-06's answer checked field by field (`{ entries: [...] }`); anything else throws. */
export function channelListOf(raw: unknown): ChannelListEntry[] {
  const list = (raw as Record<string, unknown> | null)?.['entries'];
  if (!Array.isArray(list)) throw new Error('channel list: not the shape');
  return list.map((x) => {
    const e = x as Record<string, unknown> | null;
    if (!e || typeof e !== 'object' || !ENTRY_INTS.every((k) => isInt(e[k])) || !isStr(e['lobbyName']) || !isBool(e['endOfList'])) throw new Error('channel list entry: not the shape');
    return {
      status: e['status'] as number, mediusWorldId: e['mediusWorldId'] as number, playerCount: e['playerCount'] as number, maxPlayers: e['maxPlayers'] as number,
      securityLevel: e['securityLevel'] as number, genericField1: e['genericField1'] as number, lobbyName: e['lobbyName'] as string, endOfList: e['endOfList'] as boolean,
    };
  });
}

/** A door origin as central names one: `https://<host>` or `http://<host>:<port>`, nothing after it, no credentials. */
function doorOrigin(v: unknown): string | null {
  if (!isStr(v)) return null;
  try {
    const u = new URL(v);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.origin === v ? v : null;
  } catch {
    return null;
  }
}

/**
 * LATER 455 (OT.R84; a browser adaptation, beside the original's entries and never in them): central's `doors`, one
 * a 0xed entry in the entries' order (`packages/central/src/lobbyHttp.ts` `roomDoor`), read into each room's door origin
 * by its name. No `doors`, another length, or an entry that is no bare http(s) origin: no door for that room.
 */
export function roomDoorsOf(raw: unknown, entries: readonly ChannelListEntry[]): Map<string, string> {
  const doors = (raw as Record<string, unknown> | null)?.['doors'];
  const out = new Map<string, string>();
  if (!Array.isArray(doors) || doors.length !== entries.length) return out;
  entries.forEach((e, i) => {
    const door = doorOrigin(doors[i]);
    if (door !== null && e.lobbyName !== '') out.set(e.lobbyName, door);
  });
  return out;
}

/**
 * The room list over the match server's `POST <base>/lobby/channel-list` (SVC-06, mounted by SVC-07a's bridge with the
 * session's bearer as its `identify`, research 154 §1, 159). The base is the account requests' -- the page's own origin
 * (`ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`, `./connectHost`) -- since the request carries the session's ticket. No
 * credentials, not cached; `ROOM_LIST_HTTP_ADAPTATION` reads the answer.
 */
export function fetchRoomListService(base: string, fetchFn: typeof fetch = (...a) => fetch(...a)): RoomListTransport {
  const withDoors = async (q: RoomListQuery, ticket: string): Promise<RoomListWithDoors | typeof ROOM_LIST_SESSION_LOST> => {
    const res = await fetchFn(`${base}/lobby/channel-list`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ticket}` }, body: JSON.stringify(q),
      credentials: 'omit', cache: 'no-store',
    });
    if (res.status === 401) return ROOM_LIST_SESSION_LOST;
    if (!res.ok) throw new Error(`channel list: HTTP ${res.status}`);
    const raw = await res.json() as unknown;
    const entries = channelListOf(raw);
    return { entries, doors: roomDoorsOf(raw, entries) };
  };
  return {
    channelList: async (q, ticket) => {
      const r = await withDoors(q, ticket);
      return r === ROOM_LIST_SESSION_LOST ? r : r.entries;
    },
    channelListWithDoors: withDoors,
  };
}

/** The client's `RoomListService` over the transport: the session's ticket as the bearer (`ROOM_LIST_NO_TICKET_ADAPTATION`), a 401 handed to `sessionLost`. */
export function sessionRoomList(t: RoomListTransport, ticket: () => string | null, sessionLost: (ticket: string) => void): RoomListService {
  return {
    channelList: async (q) => {
      const held = ticket();
      if (held === null) throw new Error('channel list: no ticket');
      const r = await t.channelList(q, held);
      if (r === ROOM_LIST_SESSION_LOST) { sessionLost(held); throw new Error('channel list: session lost'); }
      return r;
    },
  };
}

/**
 * LATER 527, a browser adaptation: the original has no client-side ping (its game list draws a 0-3 icon from a host value
 * fixed at 65000, `FUN_002e2ce0` D:L184438-184452, `FUN_002ef590` D:L191395), so this count is ours, not the original's
 * (Craig's word, 04's ruling under OT.R27): the samples a door needs before its PING is drawn.
 */
export const ROOM_LIST_PING_SAMPLES_ADAPTATION = 3;
/** LATER 527, a browser adaptation (the original has no client ping; Craig's word, 04's ruling): the samples the drawn mean runs over. */
export const ROOM_LIST_PING_WINDOW_ADAPTATION = 5;

/**
 * Browser adaptation (MLS.R4 as OT.R84 supersedes it; LATER 455): each briefing room's PING is its own round trip to its
 * host's door -- after each room-list reply that names doors (`RoomListTransport.channelListWithDoors`), one probe a
 * distinct door (`probe`, `./doorPing.ts` `timeDoorPing`), its answer drawn on every row of that door; a room with no
 * door keeps the existing request's own elapsed time to the lobby service, timed with a monotonic clock as before. A
 * door's drawn number is the rounded mean of its last samples (LATER 527): a door with fewer than
 * `ROOM_LIST_PING_SAMPLES_ADAPTATION` samples is sent the missing ones on the refresh that names it -- one after another,
 * each sent when the last has answered -- and shows `--` until they are in, so the first read is a mean, not one cold
 * sample; afterwards one probe per refresh, the mean over the last `ROOM_LIST_PING_WINDOW_ADAPTATION` samples. A failed
 * probe is not averaged in (a door with none answered is `--`); the drawn mean stays until the next sample answers. The
 * rooms with no door are unchanged: the lobby request's own elapsed time. Probes go only on the list's own
 * refresh (RefreshRoomList): no timer, poll or connection of their own. A service/session replacement or a newer refresh
 * invalidates old work -- old list replies, old probes, old failures and 401 replies; `frame` clears the held samples as
 * soon as their session changes. Only the drawn rows are decorated; the entries the client keeps are the original's.
 */
class RoomListPing implements RoomListService {
  private seq = 0;
  private service: RoomListTransport | undefined;
  private ticket: string | null;
  /** The room-list request's own elapsed time (MLS.R4's sample): the PING of a room with no door. */
  private milliseconds: number | null = null;
  /** LATER 455: each room's door by its name, and each door's last sample (absent: not yet answered). */
  private doors = new Map<string, string>();
  private pings = new Map<string, number[]>();
  private nativeRows: UiVarValue[] | null = null;

  constructor(private readonly m: WorldOfSocomMount, private readonly now: () => number, private readonly probe: (door: string) => Promise<number | null>) {
    this.service = m.roomList;
    this.ticket = m.ticket?.() ?? null;
  }

  /** GAME-PING (a browser adaptation): a listed room's door by its name, as the latest room list named it; null for none. */
  doorOf(name: string): string | null { return this.doors.get(name) ?? null; }

  private readonly msOf = (name: string): number | null => {
    const door = this.doors.get(name);
    if (door === undefined) return this.milliseconds;
    const held = this.pings.get(door) ?? [];
    if (held.length < ROOM_LIST_PING_SAMPLES_ADAPTATION) return null;
    return Math.round(held.reduce((a, b) => a + b, 0) / held.length);
  };

  private redraw(): void {
    if (this.nativeRows === null) return;
    const vars = this.m.uiVars;
    vars.set(vars.add(ROOM_LIST_VAR, null, 1), { type: 'array', value: roomRowsWithPing(this.nativeRows, this.msOf) });
  }

  private clear(): void {
    this.milliseconds = null;
    this.doors = new Map();
    this.pings = new Map();
  }

  frame = (): void => {
    const ticket = this.m.ticket?.() ?? null;
    if (ticket === this.ticket && this.service === this.m.roomList) return;
    this.ticket = ticket;
    this.service = this.m.roomList;
    this.seq++;
    this.clear();
    this.redraw();
  };

  reset(): void {
    this.seq++;
    this.clear();
    this.redraw();
    this.nativeRows = null;
  }

  present = (rows: UiVarValue[]): UiVarValue[] => {
    this.frame();
    this.nativeRows = rows;
    return roomRowsWithPing(rows, this.msOf);
  };

  /** LATER 527: a distinct door of this reply is sent the samples it lacks (up to SAMPLES), one after another, else one probe; an answer lands only while its refresh is still the latest of its session. */
  private probeDoors(seq: number): void {
    for (const door of new Set(this.doors.values())) void this.probeDoor(door, seq);
  }

  private async probeDoor(door: string, seq: number): Promise<void> {
    const missing = Math.max(1, ROOM_LIST_PING_SAMPLES_ADAPTATION - (this.pings.get(door)?.length ?? 0));
    for (let i = 0; i < missing; i++) {
      const ms = await this.probe(door).catch(() => null);
      this.frame();
      if (seq !== this.seq) return;
      if (ms !== null && Number.isFinite(ms) && ms >= 0) this.pings.set(door, [...(this.pings.get(door) ?? []), ms].slice(-ROOM_LIST_PING_WINDOW_ADAPTATION));
      this.redraw();
    }
  }

  channelList = async (q: RoomListQuery): Promise<readonly ChannelListEntry[]> => {
    this.frame();
    const seq = ++this.seq, service = this.service, ticket = this.ticket;
    const current = (): boolean => { this.frame(); return seq === this.seq; };
    if (!service || ticket === null) {
      this.milliseconds = null;
      this.redraw();
      throw new Error('channel list: no service or ticket');
    }
    const start = this.now();
    try {
      const reply = service.channelListWithDoors
        ? await service.channelListWithDoors(q, ticket)
        : await service.channelList(q, ticket);
      if (!current()) throw new Error('channel list: superseded');
      if (reply === ROOM_LIST_SESSION_LOST) {
        this.m.sessionLost?.(ticket);
        throw new Error('channel list: session lost');
      }
      const elapsed = this.now() - start;
      this.milliseconds = Number.isFinite(elapsed) && elapsed >= 0 && Number.isSafeInteger(Math.round(elapsed)) ? Math.round(elapsed) : null;
      const { entries, doors } = isRoomListWithDoors(reply) ? reply : { entries: reply, doors: new Map<string, string>() };
      this.doors = new Map(doors);
      const listed = new Set(this.doors.values());
      for (const door of [...this.pings.keys()]) if (!listed.has(door)) this.pings.delete(door);
      this.redraw();
      this.probeDoors(seq);
      return entries;
    } catch (error) {
      if (current()) { this.clear(); this.redraw(); }
      throw error;
    }
  };
}

// ---- OPT-15: the owner-fields operation (web research 265 §1) ----

/** The transport: `/lobby/owner-fields` asked with the ticket as its bearer; a 401 the session lost. */
export interface OwnerFieldsTransport {
  setDescription(description: string, ticket: string): Promise<{ description: string } | typeof ROOM_LIST_SESSION_LOST>;
}

/**
 * ONLINE OPTIONS' PLAYER DESCRIPTION over the match server's `POST <base>/lobby/owner-fields` (`packages/central/src/
 * ownerFields.ts`, W22.R1: the record's description written, nothing else of it). The base, the bearer and the reading of
 * the answer are the room list's (`ROOM_LIST_HTTP_ADAPTATION`: 2xx the stored text; 401 the session lost; anything else
 * a request never answered, the variable left as typed). A browser adaptation of the transport (OT.R27); the original
 * sent the text through the lobby's TextFilter and posted its whole record (`FUN_00277640`, research 265 §1).
 */
export function fetchOwnerFieldsService(base: string, fetchFn: typeof fetch = (...a) => fetch(...a)): OwnerFieldsTransport {
  return {
    setDescription: async (description, ticket) => {
      const res = await fetchFn(`${base}/lobby/owner-fields`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ticket}` }, body: JSON.stringify({ description }),
        credentials: 'omit', cache: 'no-store',
      });
      if (res.status === 401) return ROOM_LIST_SESSION_LOST;
      if (!res.ok) throw new Error(`owner fields: HTTP ${res.status}`);
      const r = await res.json() as Record<string, unknown> | null;
      if (!r || typeof r !== 'object' || !isStr(r['description'])) throw new Error('owner fields: not the shape');
      return { description: r['description'] as string };
    },
  };
}

/** The row's `OwnerFieldsService` over the transport: the session's ticket as the bearer (none: no request), a 401 handed to `sessionLost`. */
export function sessionOwnerFields(t: OwnerFieldsTransport, ticket: () => string | null, sessionLost: (ticket: string) => void): OwnerFieldsService {
  return {
    setDescription: async (description) => {
      const held = ticket();
      if (held === null) throw new Error('owner fields: no ticket');
      const r = await t.setDescription(description, held);
      if (r === ROOM_LIST_SESSION_LOST) { sessionLost(held); throw new Error('owner fields: session lost'); }
      return r;
    },
  };
}

// ---- SVC-15a: the own-stats read over PlayerInfo (web research 268 §1.7) ----

/** The transport: `/lobby/player-info` asked with the ticket as its bearer; a 401 the session lost. */
export interface PlayerInfoTransport {
  playerInfo(q: { name: string }, ticket: string): Promise<{ status: number; stats: string } | typeof ROOM_LIST_SESSION_LOST>;
}

/**
 * The own-stats read's PlayerInfo over the match server's `POST <base>/lobby/player-info` (`packages/central/src/
 * playerInfo.ts`): the base, the bearer and the reading of the answer the owner-fields operation's (2xx the answer; 401
 * the session lost; anything else a request never answered). A browser adaptation of the transport (OT.R27); the
 * request's fields and the reply's are the original's PlayerInfo (`FUN_002fa870`, research 268 §1.7), by name
 * (`OWN_RECORD_BY_NAME_ADAPTATION`).
 */
export function fetchPlayerInfoService(base: string, fetchFn: typeof fetch = (...a) => fetch(...a)): PlayerInfoTransport {
  return {
    playerInfo: async (q, ticket) => {
      const res = await fetchFn(`${base}/lobby/player-info`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ticket}` }, body: JSON.stringify({ name: q.name }),
        credentials: 'omit', cache: 'no-store',
      });
      if (res.status === 401) return ROOM_LIST_SESSION_LOST;
      if (!res.ok) throw new Error(`player info: HTTP ${res.status}`);
      const r = await res.json() as Record<string, unknown> | null;
      if (!r || typeof r !== 'object' || !isInt(r['status']) || !isStr(r['stats'])) throw new Error('player info: not the shape');
      return { status: r['status'] as number, stats: r['stats'] as string };
    },
  };
}

/**
 * The read's `PlayerInfoLookup` over the transport: the session's ticket as the bearer (none: no request), a 401 handed
 * to `sessionLost`, and an answer that lands once the ticket is no longer the one asked with (a logoff and another
 * login meanwhile) a request never answered: it rejects, so another account's record never reaches this session.
 */
export function sessionPlayerInfo(t: PlayerInfoTransport, ticket: () => string | null, sessionLost: (ticket: string) => void): PlayerInfoLookup {
  return {
    playerInfo: async (q) => {
      const held = ticket();
      if (held === null) throw new Error('player info: no ticket');
      const r = await t.playerInfo(q, held);
      if (r === ROOM_LIST_SESSION_LOST) { sessionLost(held); throw new Error('player info: session lost'); }
      if (ticket() !== held) throw new Error('player info: another session');
      return r;
    },
  };
}

export interface WorldOfSocomMount {
  /** The game's one UI variable manager. */
  uiVars: UiVarManager;
  /** The launch's valve store (the menu state's). */
  valves: () => ValveStore;
  /** The menu state's named events (`DAT_0044f3c8`'s sink: MP_MEDIUS_HAS_INVITES). */
  event: (kind: number) => void;
  /** SVC-05's announcement; absent, a request never answered. */
  announcement?: AnnouncementService;
  /** SVC-09a's invitations; absent, a request never answered. */
  invitations?: ClanInvitationsService;
  /** ONL-11: SVC-06's room list (`fetchRoomListService`); absent, a request never answered. */
  roomList?: RoomListTransport;
  /**
   * MLS-PING browser table adaptation; absent, the original rows remain unchanged. Clock defaults to performance.now;
   * LATER 455's door probe to `./doorPing.ts` `timeDoorPing`.
   */
  roomListPing?: { now?: () => number; probe?: (door: string) => Promise<number | null> };
  /** The session's ticket (`LobbyClient.ticket()`, ONL-07's seam), the room list's bearer; absent or null, no request. */
  ticket?: () => string | null;
  /** A 401 for the ticket: the lobby's session lost (`LobbyClient.sessionLost`). */
  sessionLost?: (ticket: string) => void;
  /** ONL-07's lobby session: its flag, its state byte and the account's name; absent, the menu's readings (research 158 §6). */
  lobbyUp?: () => boolean;
  lobbyState?: () => number;
  accountName?: () => string;
  /**
   * ONL-10: the lobby the logoff's rows log out and take down (`LobbyClient`); absent, they answer with no lobby. SVC-15a:
   * its state handlers (`setHandler`, state 11's entry the own-stats read) and its account's name (`account`), when it has them.
   */
  lobby?: (LogoffLobby & { setHandler?(state: number, handler: LobbyStateHandler): void; account?(): string | null }) | null;
  /** OPT-15: ONLINE OPTIONS' description to the record (`fetchOwnerFieldsService`, the session's ticket); absent, a request never answered. */
  ownerFields?: OwnerFieldsTransport;
  /** SVC-15a: the own-stats read's PlayerInfo (`fetchPlayerInfoService`, the session's ticket); absent, never answered. */
  playerInfo?: PlayerInfoTransport;
}

export interface WorldOfSocomConnection {
  commands: WorldOfSocomCommands;
  /** The received clan invitations (0x44f700): `HasClanInvitations` reads its count. */
  invitations: MyClanInvitations;
  /** ONL-10: `LobbyLogout` and `UnInitNetwork` (research 160 §2). */
  logoff: LogoffCommands;
  /**
   * A launch's start (every `LoadExecPS2`): the valves `global_valves.rdr` gives the dialog, as the boot reads them
   * anew, and a lobby still up closed (ONL-10, `LOBBY_CLOSED_AT_LAUNCH_ADAPTATION`).
   */
  launch(): void;
  /** Browser ping metadata: discard a sample when its session or service changed; sends no traffic. */
  frame(): void;
  /** GAME-PING (a browser adaptation): a listed room's host door by the room's name (LATER 455's `doors`); null for none or with no ping table. */
  roomDoor(name: string): string | null;
}

const unanswered = <T>(): Promise<T> => Promise.reject(new Error('no service'));

const isRoomListWithDoors = (r: readonly ChannelListEntry[] | RoomListWithDoors): r is RoomListWithDoors => !Array.isArray(r);

/**
 * The mount (`FrontEndSession`'s one call): the lobby session's UI variables added (`FUN_002df6a0`: MY_CLAN_INVITES,
 * MEDIUS_MOTD and the rest exist before any reply), this task's five rows (`RefreshRoomList` over the room list with the
 * session's ticket, ONL-11) and the parked rows' gate, SVC-09a's two
 * invitation rows over the session's list -- unregistered, `HasClanInvitations` answered the table's default and lit
 * the row -- the launch's valves seeded, ONL-10's two logoff rows over the session's lobby (research 160 §4), and
 * OPT-15's `SetPlayerDescription` over the owner-fields operation with the session's ticket (research 265 §1), and
 * SVC-15a's own-stats read at each entry into the lobby's state 11, LOGGED IN (`FUN_002ee540` D:L190794-190797:
 * `PlayerDescription` from the own record's +0x9f; research 268 §1.7). The
 * original adds the variables at `LobbyConnect`; the port adds them when the session is made, since the connect is
 * ONL-07's (owed: moved to its `LobbyConnect`, research 158 §7).
 */
export function connectWorldOfSocom(host: UiCommandHost, m: WorldOfSocomMount): WorldOfSocomConnection {
  lobbySessionStart(m.uiVars);
  const ping = m.roomListPing ? new RoomListPing(m, m.roomListPing.now ?? (() => performance.now()), m.roomListPing.probe ?? ((door) => timeDoorPing(door))) : null;
  const commands = new WorldOfSocomCommands({
    uiVars: m.uiVars, service: m.announcement ?? { announcement: () => unanswered() },
    lobbyUp: m.lobbyUp, lobbyState: m.lobbyState, accountName: m.accountName,
    roomList: ping ?? (m.roomList ? sessionRoomList(m.roomList, m.ticket ?? (() => null), m.sessionLost ?? (() => {})) : undefined),
    ticket: m.roomList || ping ? (m.ticket ?? (() => null)) : undefined,
    presentRoomList: ping?.present,
  });
  commands.register(host);
  const invitations = new MyClanInvitations({ uiVars: m.uiVars, event: m.event });
  new ClanInvitationCommands({ list: invitations, service: m.invitations ?? { check: () => unanswered() } }).register(host);
  const logoff = new LogoffCommands({ lobby: m.lobby });           // ONL-10 (research 160 §4): the rows' bodies, over ONL-08's and ONL-06's stand-ins
  logoff.register(host);
  const onlineOptions = new OnlineOptionsCommands({               // OPT-15 (research 265 §1): ONLINE OPTIONS' SetPlayerDescription
    uiVars: m.uiVars, service: m.ownerFields ? sessionOwnerFields(m.ownerFields, m.ticket ?? (() => null), m.sessionLost ?? (() => {})) : undefined,
    playerInfo: m.playerInfo ? sessionPlayerInfo(m.playerInfo, m.ticket ?? (() => null), m.sessionLost ?? (() => {})) : undefined,
    accountName: () => m.lobby?.account?.() ?? null, session: m.ticket,
  });
  onlineOptions.register(host);
  // SVC-15a (research 268 §1.7): state 11's entry asks the own record (FUN_002ee540 D:L190794-190795, FUN_002fa870)
  m.lobby?.setHandler?.(LOBBY_STATE.LOGGED_IN, (phase) => { if (phase === 1) onlineOptions.readOwnRecord(); });
  seedWorldOfSocomValves(m.valves());
  const launch = (): void => { ping?.reset(); logoff.launch(); seedWorldOfSocomValves(m.valves()); };
  return { commands, invitations, logoff, launch, frame: () => { ping?.frame(); }, roomDoor: (name) => ping?.doorOf(name) ?? null };
}
