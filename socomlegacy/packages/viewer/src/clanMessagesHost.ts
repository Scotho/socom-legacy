import {
  ClanMessagesCommands,
  type ClanMessageReply, type ClanMessagesService, type LobbyClan, type MyClanMessageReply, type UiCommandHost, type UiVarManager, type ZAnimUiCommand,
} from '@s2u/ui';

/**
 * ONL-29's page half (web research 274 §4): the clan messages' requests over SVC-10's paths on the match server
 * (`packages/central/src/clans.ts`, `CLAN_MESSAGE_PATHS`): `POST <base>/clan/messages` `{ clanId, start, pageSize }`
 * (GetMyClanMessages), `/clan/all-messages` `{ start, pageSize }` (GetAllClanMessages), `/clan/send-message`
 * `{ message }`, `/clan/modify-message` `{ clanMessageId, newMessage }` and `/clan/delete-message` `{ clanMessageId }`,
 * each with the session's ticket as the bearer, `credentials: 'omit'`, `cache: 'no-store'`, `<base>` the page's own
 * origin (`accountServiceBase`, `ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`, `./connectHost`) as the invitations' requests
 * (`./clanInvitationsHost`). The transport is ours (OT.R27); the requests' words and the replies' fields are the
 * original's. 2xx the reply's fields, checked; 401 the session lost (the lobby client's `sessionLost`); anything else a
 * request never answered; no ticket, no request.
 */

const isStr = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

/** A 401: the server holds no session for the ticket (`SESSION_LOST_READING`, `@s2u/ui`'s lobby client). */
export const CLAN_MESSAGES_SESSION_LOST = 'session-lost' as const;
type Lost = typeof CLAN_MESSAGES_SESSION_LOST;

const record = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object') throw new Error('clan messages reply: not the shape');
  return raw as Record<string, unknown>;
};
const replies = (raw: unknown): Record<string, unknown>[] => {
  const list = record(raw)['replies'];
  if (!Array.isArray(list)) throw new Error('clan messages reply: not the shape');
  return list.map(record);
};

/** SVC-10's `{ replies }` of GetMyClanMessages checked field by field; anything else throws. */
export function myClanMessagesOf(raw: unknown): MyClanMessageReply[] {
  return replies(raw).map((e) => {
    if (!isInt(e['status']) || !isInt(e['clanId']) || !isStr(e['message']) || !isBool(e['endOfList'])) throw new Error('clan message: not the shape');
    return { status: e['status'] as number, clanId: e['clanId'] as number, message: e['message'] as string, endOfList: e['endOfList'] as boolean };
  });
}

/** SVC-10's `{ replies }` of GetAllClanMessages checked field by field; anything else throws. */
export function allClanMessagesOf(raw: unknown): ClanMessageReply[] {
  return replies(raw).map((e) => {
    if (!isInt(e['status']) || !isInt(e['clanMessageId']) || !isStr(e['message']) || !isInt(e['clanMessageStatus']) || !isBool(e['endOfList'])) {
      throw new Error('clan message: not the shape');
    }
    return {
      status: e['status'] as number, clanMessageId: e['clanMessageId'] as number, message: e['message'] as string,
      clanMessageStatus: e['clanMessageStatus'] as number, endOfList: e['endOfList'] as boolean,
    };
  });
}

const statusOf = (raw: unknown): { status: number } => {
  const r = record(raw);
  if (!isInt(r['status'])) throw new Error('clan messages reply: not the shape');
  return { status: r['status'] as number };
};

/** The transport: each request with the ticket as its bearer. */
export interface ClanMessagesTransport {
  myMessages(q: { clanId: number; start: number; pageSize: number }, ticket: string): Promise<MyClanMessageReply[] | Lost>;
  allMessages(q: { start: number; pageSize: number }, ticket: string): Promise<ClanMessageReply[] | Lost>;
  send(q: { message: string }, ticket: string): Promise<{ status: number } | Lost>;
  modify(q: { clanMessageId: number; newMessage: string }, ticket: string): Promise<{ status: number } | Lost>;
  delete(q: { clanMessageId: number }, ticket: string): Promise<{ status: number } | Lost>;
}

/** The requests over the match server's `POST <base>/clan/<op>`, `<base>` the page's own origin. */
export function fetchClanMessagesService(base: string, fetchFn: typeof fetch = (...a) => fetch(...a)): ClanMessagesTransport {
  const post = async <T>(path: string, body: unknown, ticket: string, read: (raw: unknown) => T): Promise<T | Lost> => {
    const res = await fetchFn(`${base}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ticket}` }, body: JSON.stringify(body),
      credentials: 'omit', cache: 'no-store',
    });
    if (res.status === 401) return CLAN_MESSAGES_SESSION_LOST;
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return read(await res.json());
  };
  return {
    myMessages: (q, t) => post('/clan/messages', { clanId: q.clanId, start: q.start, pageSize: q.pageSize }, t, myClanMessagesOf),
    allMessages: (q, t) => post('/clan/all-messages', { start: q.start, pageSize: q.pageSize }, t, allClanMessagesOf),
    send: (q, t) => post('/clan/send-message', { message: q.message }, t, statusOf),
    modify: (q, t) => post('/clan/modify-message', { clanMessageId: q.clanMessageId, newMessage: q.newMessage }, t, statusOf),
    delete: (q, t) => post('/clan/delete-message', { clanMessageId: q.clanMessageId }, t, statusOf),
  };
}

/** The rows' service over the transport: the session's ticket read at each request (none: no request), a 401 handed to `sessionLost`. */
export function sessionClanMessages(t: ClanMessagesTransport, ticket: () => string | null, sessionLost: (ticket: string) => void): ClanMessagesService {
  const send = async <T>(ask: (held: string) => Promise<T | Lost>): Promise<T> => {
    const held = ticket();
    if (held === null) throw new Error('clan messages: no ticket');
    const r = await ask(held);
    if (r === CLAN_MESSAGES_SESSION_LOST) { sessionLost(held); throw new Error('clan messages: session lost'); }
    return r as T;
  };
  return {
    myMessages: (q) => send((h) => t.myMessages(q, h)),
    allMessages: (q) => send((h) => t.allMessages(q, h)),
    send: (q) => send((h) => t.send(q, h)),
    modify: (q) => send((h) => t.modify(q, h)),
    delete: (q) => send((h) => t.delete(q, h)),
  };
}

export interface ClanMessagesMount {
  uiVars: UiVarManager;
  /** The client's clan (`WorldOfSocomCommands.clan`): the clan id GetMyClanMessages carries. */
  clan: LobbyClan;
  /** The transport (`fetchClanMessagesService`); absent, every request never answered. */
  service?: ClanMessagesTransport;
  ticket: () => string | null;
  sessionLost: (ticket: string) => void;
  /** The lobby's events into the built dialog (`lobbyEventInto`): CLAN_MESSAGE_EMPTY, CLAN_MESSAGE_ID_ERR. */
  event: (kind: number, text: string | null) => void;
  /** The running animation's input string (the shell's): a row's id. */
  inputString: (cmd: ZAnimUiCommand) => string | null;
  /** ONL-07's lobby: its +0x7d and its state; absent, the reading (`WORLD_LOBBY_STATE_READING`). */
  lobby?: { readonly up: boolean; state(): number } | null;
}

/**
 * The mount (`FrontEndSession`'s one call, after `connectClanInvitations`): the five rows over the transport. The rows'
 * object is returned: its `myClanMessages` is the band's request GetMyClans' success sends -- ONL-27's GetClan, the
 * seam `@s2u/ui`'s `clanMessagesCommands` names (web research 274 §1.3).
 */
export function connectClanMessages(host: UiCommandHost, m: ClanMessagesMount): ClanMessagesCommands {
  const lobby = m.lobby ?? null;
  const c = new ClanMessagesCommands({
    uiVars: m.uiVars, clan: m.clan, service: m.service ? sessionClanMessages(m.service, m.ticket, m.sessionLost) : undefined, event: m.event,
    inputString: m.inputString, ticket: m.service ? m.ticket : undefined,
    ...(lobby ? { lobbyUp: () => lobby.up, lobbyState: () => lobby.state() } : {}),
  });
  c.register(host);
  return c;
}
