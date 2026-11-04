import {
  FriendListCommands,
  type FriendEvent, type FriendInvitationEntry, type FriendListEntry, type FriendListService, type LadderOnlineState, type UiCommandHost, type UiVarManager,
  type ZAnimUiCommand,
} from '@s2u/ui';

/**
 * ONL-24's page half (web research 269 §3): the friends' requests -- SVC-16's seven `/lobby/friend-*` paths
 * (`packages/central/src/friends.ts`, `LOBBY_FRIEND_PATHS`; research 268 §2) -- at the page's own origin
 * (`ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`, `./connectHost`) with the session's ticket as the bearer, as ONL-25's ignore
 * list (`./ignoreListHost`); and the session's mount of `@s2u/ui`'s `FriendListCommands` -- one client friends list for
 * SOCOM II ONLINE's pane, FRIENDS and PLAYER INFO's FRIEND origin, one list of requests for the usage agreement's
 * `GetFriendInvitations`, the forwards and FRIENDS' ConfirmationList. The transport is ours (OT.R27); the fields and what
 * the client does with them are the original's. The answers read as `BRIEFING_ROOM_HTTP_ADAPTATION`
 * (`./briefingRoomHost`) reads them: 2xx the reply's fields, checked (the answer's 204 no body); 401 the session lost
 * (handed to the lobby client's `sessionLost`: state 2, MP_MEDIUS_ERROR, which FRIENDS binds to
 * `OnMultiplayerDisconnect`); anything else a request never answered; no ticket, no request.
 */

/** A 401: the server holds no session for the ticket (`SESSION_LOST_READING`, `@s2u/ui`'s lobby client). */
export const FRIEND_LIST_SESSION_LOST = 'session-lost' as const;
type Lost = typeof FRIEND_LIST_SESSION_LOST;

const isStr = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const record = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('friends reply: not the shape');
  return raw as Record<string, unknown>;
};
const ints = <K extends string>(raw: unknown, keys: readonly K[]): Record<K, number> => {
  const r = record(raw);
  if (!keys.every((k) => isInt(r[k]))) throw new Error('friends reply: not the shape');
  return Object.fromEntries(keys.map((k) => [k, r[k] as number])) as Record<K, number>;
};
const named = (raw: unknown): string => {
  const n = record(raw)['accountName'];
  if (!isStr(n)) throw new Error('friends reply: not the shape');
  return n;
};
const ended = (raw: unknown): boolean => {
  const e = record(raw)['endOfList'];
  if (!isBool(e)) throw new Error('friends reply: not the shape');
  return e;
};
const rows = (raw: unknown, key: string): unknown[] => {
  const list = record(raw)[key];
  if (!Array.isArray(list)) throw new Error(`friends ${key}: not the shape`);
  return list;
};

/** `MediusPlayerOnlineState` as SVC-16 serves it, checked field by field. */
function onlineStateOf(raw: unknown): LadderOnlineState {
  const s = record(raw);
  if (!isStr(s['lobbyName']) || !isStr(s['gameName'])) throw new Error('friends online state: not the shape');
  return { ...ints(s, ['connectStatus', 'lobbyWorldId', 'gameWorldId'] as const), lobbyName: s['lobbyName'], gameName: s['gameName'] };
}

/** SVC-16's list (`{ entries: [...] }` of Lobby 0xd7 rows) checked field by field; anything else throws. */
export function friendListOf(raw: unknown): FriendListEntry[] {
  return rows(raw, 'entries').map((e) => ({
    ...ints(e, ['status', 'accountId'] as const), accountName: named(e), onlineState: onlineStateOf(record(e)['onlineState']), endOfList: ended(e),
  }));
}

/** SVC-16's waiting requests (`{ entries: [...] }` of LobbyExt 0x09 rows) checked field by field; anything else throws. */
export function friendInvitationsOf(raw: unknown): FriendInvitationEntry[] {
  return rows(raw, 'entries').map((e) => ({ ...ints(e, ['status', 'accountId', 'addType'] as const), accountName: named(e), endOfList: ended(e) }));
}

/** SVC-16's pushes (`{ events: [...] }`): a forward with who asked and the word, an answer with whom and the status; anything else throws. */
export function friendEventsOf(raw: unknown): FriendEvent[] {
  return rows(raw, 'events').map((e): FriendEvent => {
    const kind = record(e)['kind'];
    if (kind === 'forward') return { kind, ...ints(e, ['accountId', 'addType'] as const), accountName: named(e) };
    if (kind === 'answer') return { kind, ...ints(e, ['accountId', 'status'] as const), accountName: named(e) };
    throw new Error('friends event: not the shape');
  });
}

/** The transport: each request with the ticket as its bearer. */
export interface FriendListTransport {
  list(ticket: string): Promise<FriendListEntry[] | Lost>;
  request(q: { name: string }, ticket: string): Promise<{ status: number } | Lost>;
  answer(q: { accountId: number; status: number }, ticket: string): Promise<void | Lost>;
  invitations(ticket: string): Promise<FriendInvitationEntry[] | Lost>;
  add(q: { accountId: number }, ticket: string): Promise<{ status: number } | Lost>;
  remove(q: { accountId: number }, ticket: string): Promise<{ status: number } | Lost>;
  events(ticket: string): Promise<FriendEvent[] | Lost>;
}

/** The seven requests over the match server's `POST <base>/lobby/<op>` (the module's reading of the answers). */
export function fetchFriendListService(base: string, fetchFn: typeof fetch = (...a) => fetch(...a)): FriendListTransport {
  const post = async <T>(op: string, body: unknown, ticket: string, read: ((raw: unknown) => T) | null): Promise<T | Lost> => {
    const res = await fetchFn(`${base}/lobby/${op}`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ticket}` }, body: JSON.stringify(body),
      credentials: 'omit', cache: 'no-store',
    });
    if (res.status === 401) return FRIEND_LIST_SESSION_LOST;
    if (read === null) {
      if (res.status !== 204) throw new Error(`${op}: HTTP ${res.status}`);
      return undefined as T;
    }
    if (!res.ok) throw new Error(`${op}: HTTP ${res.status}`);
    return read(await res.json());
  };
  const status = (r: unknown): { status: number } => ints(r, ['status'] as const);
  return {
    list: (t) => post('friend-list', {}, t, friendListOf),
    request: (q, t) => post('friend-request', { name: q.name }, t, status),
    answer: (q, t) => post<void>('friend-answer', { accountId: q.accountId, status: q.status }, t, null),
    invitations: (t) => post('friend-invitations', {}, t, friendInvitationsOf),
    add: (q, t) => post('friend-add', { accountId: q.accountId }, t, status),
    remove: (q, t) => post('friend-remove', { accountId: q.accountId }, t, status),
    events: (t) => post('friend-events', {}, t, friendEventsOf),
  };
}

/** The client's `FriendListService` over the transport: the session's ticket read at each request (none: no request), a 401 handed to `sessionLost`. */
export function sessionFriendList(t: FriendListTransport, ticket: () => string | null, sessionLost: (ticket: string) => void): FriendListService {
  const send = async <T>(ask: (held: string) => Promise<T | Lost>): Promise<T> => {
    const held = ticket();
    if (held === null) throw new Error('friends: no ticket');
    const r = await ask(held);
    if (r === FRIEND_LIST_SESSION_LOST) { sessionLost(held); throw new Error('friends: session lost'); }
    return r as T;
  };
  return {
    list: () => send((h) => t.list(h)),
    request: (q) => send((h) => t.request(q, h)),
    answer: (q) => send((h) => t.answer(q, h)),
    invitations: () => send((h) => t.invitations(h)),
    add: (q) => send((h) => t.add(q, h)),
    remove: (q) => send((h) => t.remove(q, h)),
    events: () => send((h) => t.events(h)),
  };
}

export interface FriendListMount {
  uiVars: UiVarManager;
  /** The transport (`fetchFriendListService`); absent, every request never answered. */
  service?: FriendListTransport;
  ticket: () => string | null;
  sessionLost: (ticket: string) => void;
  /** The running animation's input string (the shell's): a row's account. */
  inputString: (cmd: ZAnimUiCommand) => string | null;
  /** The lobby's events into the built dialog (`lobbyEventInto`): MP_PLAYER_IS_FRIEND, MP_PLAYER_NOT_FOUND, MP_FRIEND_CONFIRMATION_REQUESTED. */
  event: (kind: number, text: string | null) => void;
  /** ONL-07's lobby: its +0x7d, its state and the account's name; absent, the readings (`WORLD_LOBBY_STATE_READING`, `ACCOUNT_NAME_READING`). */
  lobby?: { readonly up: boolean; state(): number; account?(): string | null } | null;
  /** The front end screen's line call (ONL-23's `BriefingRoomChat.screenLine`): the forward's line. */
  line?: (text: string, name: string | null, flag: number, kind: number) => void;
  /** The page's clock, ms, for the pushes' poll (`FRIEND_EVENTS_POLL_MS_ADAPTATION`); absent, `performance.now`. */
  now?: () => number;
}

/** The mount (`FrontEndSession`'s one call): the eight rows over the session's transport, and the pushes' poll once a frame. */
export function connectFriendList(host: UiCommandHost, m: FriendListMount): { commands: FriendListCommands; frame(): void } {
  const lobby = m.lobby ?? null;
  const commands = new FriendListCommands({
    uiVars: m.uiVars, service: m.service ? sessionFriendList(m.service, m.ticket, m.sessionLost) : undefined,
    event: m.event, inputString: m.inputString, ticket: m.service ? m.ticket : undefined, ...(m.line ? { line: m.line } : {}),
    ...(lobby ? { lobbyUp: () => lobby.up, lobbyState: () => lobby.state(), accountName: () => lobby.account?.() ?? null } : {}),
  });
  commands.register(host);
  return { commands, frame: () => { commands.frame(m.now?.() ?? performance.now()); } };
}
