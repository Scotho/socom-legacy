import {
  IgnoreListCommands,
  type IgnoreAccountQuery, type IgnoreAccountReply, type IgnoreListEntry, type IgnoreListService, type UiCommandHost, type UiVarManager, type ZAnimUiCommand,
} from '@s2u/ui';

/**
 * ONL-25's page half (web research 269 §1): the ignore list's requests -- SVC-17's `/lobby/ignore-list`,
 * `/lobby/ignore-add`, `/lobby/ignore-remove` (`packages/central/src/ignore.ts`, `LOBBY_IGNORE_PATHS`; research 263 §4)
 * and AccountGetID's `/lobby/account-id` for the add's lookup of the typed name (NU-14, `packages/central/src/accountGetId.ts`;
 * it was SVC-18's `/lobby/find-player`, which finds only a player in a room or a game seat) -- at the page's own origin (`ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`, `./connectHost`) with the session's ticket as
 * the bearer, as ONL-11's room list (`./worldOfSocomHost`) and ONL-12's briefing room (`./briefingRoomHost`); and the
 * session's mount of `@s2u/ui`'s `IgnoreListCommands` -- one client list for SOCOM II ONLINE's pane, IGNORE's page and
 * the chat keyboards' IGNORE key. The transport is ours (OT.R27); the fields and what the client does with them are the
 * original's. The answers read as `BRIEFING_ROOM_HTTP_ADAPTATION` (`./briefingRoomHost`) reads them: 2xx the reply's fields,
 * checked; 401 the session lost (handed to the lobby client's `sessionLost`: state 2, MP_MEDIUS_ERROR, which IGNORE
 * binds to `OnMultiplayerDisconnect`); anything else a request never answered; no ticket, no request.
 */

/** A 401: the server holds no session for the ticket (`SESSION_LOST_READING`, `@s2u/ui`'s lobby client). */
export const IGNORE_LIST_SESSION_LOST = 'session-lost' as const;
type Lost = typeof IGNORE_LIST_SESSION_LOST;

const isStr = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const record = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object') throw new Error('ignore list reply: not the shape');
  return raw as Record<string, unknown>;
};
const ints = <K extends string>(raw: unknown, keys: readonly K[]): Record<K, number> => {
  const r = record(raw);
  if (!keys.every((k) => isInt(r[k]))) throw new Error('ignore list reply: not the shape');
  return Object.fromEntries(keys.map((k) => [k, r[k] as number])) as Record<K, number>;
};

/** SVC-17's list (`{ entries: [...] }` of Lobby 0xc1 rows) checked field by field; anything else throws. */
export function ignoreListOf(raw: unknown): IgnoreListEntry[] {
  const list = record(raw)['entries'];
  if (!Array.isArray(list)) throw new Error('ignore list: not the shape');
  return list.map((x) => {
    const e = record(x);
    if (!isStr(e['ignoreAccountName']) || !isBool(e['endOfList'])) throw new Error('ignore list row: not the shape');
    return { ...ints(e, ['status', 'ignoreAccountId', 'playerStatus'] as const), ignoreAccountName: e['ignoreAccountName'], endOfList: e['endOfList'] };
  });
}

/** The transport: each request with the ticket as its bearer. */
export interface IgnoreListTransport {
  list(ticket: string): Promise<IgnoreListEntry[] | Lost>;
  accountId(q: { name: string }, ticket: string): Promise<IgnoreAccountReply | Lost>;
  add(q: IgnoreAccountQuery, ticket: string): Promise<{ status: number } | Lost>;
  remove(q: IgnoreAccountQuery, ticket: string): Promise<{ status: number } | Lost>;
}

/** The four requests over the match server's `POST <base>/lobby/<op>` (the module's reading of the answers). */
export function fetchIgnoreListService(base: string, fetchFn: typeof fetch = (...a) => fetch(...a)): IgnoreListTransport {
  const post = async <T>(op: string, body: unknown, ticket: string, read: (raw: unknown) => T): Promise<T | Lost> => {
    const res = await fetchFn(`${base}/lobby/${op}`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ticket}` }, body: JSON.stringify(body),
      credentials: 'omit', cache: 'no-store',
    });
    if (res.status === 401) return IGNORE_LIST_SESSION_LOST;
    if (!res.ok) throw new Error(`${op}: HTTP ${res.status}`);
    return read(await res.json());
  };
  return {
    list: (t) => post('ignore-list', {}, t, ignoreListOf),
    // NU-14: AccountGetID's answer, the two fields `FUN_00300db0` reads (any account of the name, logged in or not, `ACCOUNT_GET_ID_PRESENCE_OWNER`).
    accountId: (q, t) => post('account-id', { accountName: q.name }, t, (r) => ints(r, ['status', 'accountId'] as const)),
    add: (q, t) => post('ignore-add', { ignoreAccountId: q.ignoreAccountId }, t, (r) => ints(r, ['status'] as const)),
    remove: (q, t) => post('ignore-remove', { ignoreAccountId: q.ignoreAccountId }, t, (r) => ints(r, ['status'] as const)),
  };
}

/** The client's `IgnoreListService` over the transport: the session's ticket read at each request (none: no request), a 401 handed to `sessionLost`. */
export function sessionIgnoreList(t: IgnoreListTransport, ticket: () => string | null, sessionLost: (ticket: string) => void): IgnoreListService {
  const send = async <T>(ask: (held: string) => Promise<T | Lost>): Promise<T> => {
    const held = ticket();
    if (held === null) throw new Error('ignore list: no ticket');
    const r = await ask(held);
    if (r === IGNORE_LIST_SESSION_LOST) { sessionLost(held); throw new Error('ignore list: session lost'); }
    return r as T;
  };
  return {
    list: () => send((h) => t.list(h)),
    accountId: (q) => send((h) => t.accountId(q, h)),
    add: (q) => send((h) => t.add(q, h)),
    remove: (q) => send((h) => t.remove(q, h)),
  };
}

export interface IgnoreListMount {
  uiVars: UiVarManager;
  /** The transport (`fetchIgnoreListService`); absent, every request never answered. */
  service?: IgnoreListTransport;
  ticket: () => string | null;
  sessionLost: (ticket: string) => void;
  /** The running animation's input string (the shell's): REMOVE's row. */
  inputString: (cmd: ZAnimUiCommand) => string | null;
  /** The lobby's events into the built dialog (`lobbyEventInto`): PLAYER_IS_IGNORED, MP_PLAYER_NOT_FOUND, MP_IGNORE_LIST_FULL. */
  event: (kind: number, text: string | null) => void;
}

/** The mount (`FrontEndSession`'s one call): the three rows over the session's transport. */
export function connectIgnoreList(host: UiCommandHost, m: IgnoreListMount): IgnoreListCommands {
  const commands = new IgnoreListCommands({
    uiVars: m.uiVars, service: m.service ? sessionIgnoreList(m.service, m.ticket, m.sessionLost) : undefined,
    event: m.event, inputString: m.inputString, ticket: m.service ? m.ticket : undefined,
  });
  commands.register(host);
  return commands;
}
