import {
  ClanInvitationCommands, InvitedPlayersCommands, RespondToInvitesCommands,
  type ClanInvitationReply, type ClanInvitationResponse, type ClanInvitationsQuery, type ClanInvitationsService, type InvitedPlayersService, type LobbyClan,
  type MyClanInvitations, type RespondToInvitesService, type SentInvitationReply, type UiCommandHost, type UiVarManager, type ZAnimUiCommand,
} from '@s2u/ui';
import type { BriefingRoomTransport, ChatLinesReplyWithSays } from './briefingRoomHost';

/**
 * SVC-09a's page half (web research 156 §2.4), for ONL-09's INVITATIONS row: `CheckMyInvites` (`@s2u/ui`'s
 * `ClanInvitationCommands`) sends CheckMyClanInvitations through this service to the match server's
 * `POST /clan/invitations` (`packages/central/src/clanInvitations.ts`, mounted beside SVC-05's texts when the server has
 * a data directory). ONL-09 wires it: `new ClanInvitationCommands({ list: new MyClanInvitations({ uiVars, event }),
 * service: fetchClanInvitationsService(universeServiceBase(search, location)) }).register(host)`. The transport is ours;
 * the request's words and the replies' fields are the original's. Any failure is a request never answered: the promise
 * rejects and the list stays empty, as the console's would with no reply.
 *
 * ONL-28 (web research 273 §5, below): that request carries no ticket. `connectClanInvitations` registers the two rows
 * again over the same received list with `fetchClanMembershipService`'s ticketed `/clan/invitations` at the page's own
 * origin -- so the page never sends this one -- and mounts INVITE PLAYERS' and RESPOND TO INVITES' rows over the same
 * transport. INVITE-TICKETLESS (2026-10-15, research 273 §9): the server now answers a request with no ticket 401, as
 * its other clan paths; this service, if it were asked, would read that as a request never answered.
 */

const isStr = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

/** The server's `{ replies }` checked field by field; anything else throws. */
export function clanInvitationsReplyOf(raw: unknown): ClanInvitationReply[] {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || !Array.isArray(r['replies'])) throw new Error('invitations reply: not the shape');
  return (r['replies'] as unknown[]).map((e) => {
    const x = e as Record<string, unknown> | null;
    const ok = !!x && typeof x === 'object' && isInt(x['status']) && isInt(x['clanInvitationId']) && isInt(x['clanId'])
      && isInt(x['responseStatus']) && isStr(x['message']) && isInt(x['leaderAccountId']) && isStr(x['leaderAccountName']) && isBool(x['endOfList']);
    if (!ok) throw new Error('invitation reply: a field of another type');
    const y = x as Record<string, unknown>;
    return {
      status: y['status'] as number, clanInvitationId: y['clanInvitationId'] as number, clanId: y['clanId'] as number,
      responseStatus: y['responseStatus'] as number, message: y['message'] as string, leaderAccountId: y['leaderAccountId'] as number,
      leaderAccountName: y['leaderAccountName'] as string, endOfList: y['endOfList'] as boolean,
    };
  });
}

/** The invitations service over the match server's `POST <base>/clan/invitations`. */
export function fetchClanInvitationsService(base: string, fetchFn: typeof fetch = (...a) => fetch(...a)): ClanInvitationsService {
  return {
    check: async (q: ClanInvitationsQuery) => {
      // TEXTS-OMIT: no cookie and no cache, as the account routes' clients (a browser adaptation's hardening; the request word unchanged).
      const res = await fetchFn(`${base}/clan/invitations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q), credentials: 'omit', cache: 'no-store' });
      if (!res.ok) throw new Error(`invitations request: HTTP ${res.status}`);
      return clanInvitationsReplyOf(await res.json());
    },
  };
}

// ---- ONL-28: the invitations' pages over the session's ticket (web research 273 §5) ----

/** A 401: the server holds no session for the ticket (`SESSION_LOST_READING`, `@s2u/ui`'s lobby client). */
export const CLAN_INVITATIONS_SESSION_LOST = 'session-lost' as const;
type Lost = typeof CLAN_INVITATIONS_SESSION_LOST;

const record = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object') throw new Error('clan reply: not the shape');
  return raw as Record<string, unknown>;
};
const ints = <K extends string>(raw: unknown, keys: readonly K[]): Record<K, number> => {
  const r = record(raw);
  if (!keys.every((k) => isInt(r[k]))) throw new Error('clan reply: not the shape');
  return Object.fromEntries(keys.map((k) => [k, r[k] as number])) as Record<K, number>;
};

/** SVC-09's `{ replies }` of GetClanInvitationsSent checked field by field; anything else throws. */
export function sentInvitationsOf(raw: unknown): SentInvitationReply[] {
  const list = record(raw)['replies'];
  if (!Array.isArray(list)) throw new Error('invitations sent: not the shape');
  return list.map((x) => {
    const e = record(x);
    if (!isStr(e['accountName']) || !isStr(e['responseMessage']) || !isBool(e['endOfList'])) throw new Error('invitation sent: not the shape');
    return {
      ...ints(e, ['status', 'accountId', 'responseStatus', 'responseTime'] as const), accountName: e['accountName'], responseMessage: e['responseMessage'], endOfList: e['endOfList'],
    };
  });
}

/** The transport: each request with the ticket as its bearer. */
export interface ClanMembershipTransport {
  /** CheckMyClanInvitations (SVC-09a's `/clan/invitations`) with the bearer: the caller's own list. */
  check(q: ClanInvitationsQuery, ticket: string): Promise<ClanInvitationReply[] | Lost>;
  invitationsSent(q: ClanInvitationsQuery, ticket: string): Promise<SentInvitationReply[] | Lost>;
  invite(q: { playerAccountId: number; message: string }, ticket: string): Promise<{ status: number } | Lost>;
  revoke(q: { playerAccountId: number }, ticket: string): Promise<{ status: number } | Lost>;
  respond(q: ClanInvitationResponse, ticket: string): Promise<{ status: number } | Lost>;
  /** AccountGetID (NU-14; `@s2u/ui`'s `invitedPlayersCommands`, research 273 §2.2): the services' `/lobby/account-id`. */
  accountId(q: { name: string }, ticket: string): Promise<{ status: number; accountId: number } | Lost>;
  /** SVC-18's ChatMessage (the invitation's whisper): 204, no reply. */
  chat(q: { messageType: number; targetId: number; message: string }, ticket: string): Promise<void | Lost>;
}

/**
 * The requests over the match server's `POST <base>/clan/<op>` and `/lobby/<op>`, `<base>` the page's own origin
 * (`accountServiceBase`, `ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`, `./connectHost`): the bearer never goes to a `server=`
 * host, as `fetchClanInvitationsService`'s ticketless request may. The answers read as the ignore list's: 2xx the
 * reply's fields, checked; 401 the session lost; anything else a request never answered.
 */
export function fetchClanMembershipService(base: string, fetchFn: typeof fetch = (...a) => fetch(...a)): ClanMembershipTransport {
  const send = async (path: string, body: unknown, ticket: string): Promise<Response | Lost> => {
    const res = await fetchFn(`${base}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ticket}` }, body: JSON.stringify(body),
      credentials: 'omit', cache: 'no-store',
    });
    if (res.status === 401) return CLAN_INVITATIONS_SESSION_LOST;
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res;
  };
  const post = async <T>(path: string, body: unknown, ticket: string, read: (raw: unknown) => T): Promise<T | Lost> => {
    const res = await send(path, body, ticket);
    return res === CLAN_INVITATIONS_SESSION_LOST ? res : read(await res.json());
  };
  const status = (r: unknown): { status: number } => ints(r, ['status'] as const);
  return {
    check: (q, t) => post('/clan/invitations', { start: q.start, pageSize: q.pageSize }, t, clanInvitationsReplyOf),
    invitationsSent: (q, t) => post('/clan/invitations-sent', { start: q.start, pageSize: q.pageSize }, t, sentInvitationsOf),
    invite: (q, t) => post('/clan/invite', { playerAccountId: q.playerAccountId, message: q.message }, t, status),
    revoke: (q, t) => post('/clan/revoke', { playerAccountId: q.playerAccountId }, t, status),
    respond: (q, t) => post('/clan/respond', { clanInvitationId: q.clanInvitationId, response: q.response, message: q.message }, t, status),
    // NU-14: AccountGetID (`packages/central/src/accountGetId.ts`): a logged-in account of the name, the two fields its reply
    // gives (`FUN_002e7850`). Was SVC-18's `/lobby/find-player`, which finds only a player in a room or a game seat.
    accountId: (q, t) => post('/lobby/account-id', { accountName: q.name }, t, (r) => ints(r, ['status', 'accountId'] as const)),
    chat: async (q, t) => {
      const res = await send('/lobby/chat', { messageType: q.messageType, targetId: q.targetId, message: q.message }, t);
      return res === CLAN_INVITATIONS_SESSION_LOST ? res : undefined;              // 204: ChatMessage has no reply
    },
  };
}

/** The clients' services over the transport: the session's ticket read at each request (none: no request), a 401 handed to `sessionLost`. */
export function sessionClanMembership(t: ClanMembershipTransport, ticket: () => string | null, sessionLost: (ticket: string) => void): {
  invitations: ClanInvitationsService; invited: InvitedPlayersService; respond: RespondToInvitesService;
} {
  const send = async <T>(ask: (held: string) => Promise<T | Lost>): Promise<T> => {
    const held = ticket();
    if (held === null) throw new Error('clan invitations: no ticket');
    const r = await ask(held);
    if (r === CLAN_INVITATIONS_SESSION_LOST) { sessionLost(held); throw new Error('clan invitations: session lost'); }
    return r as T;
  };
  return {
    invitations: { check: (q) => send((h) => t.check(q, h)) },
    invited: {
      accountId: (q) => send((h) => t.accountId(q, h)),
      invite: (q) => send((h) => t.invite(q, h)),
      chat: (q) => send((h) => t.chat(q, h)),
      invitationsSent: (q) => send((h) => t.invitationsSent(q, h)),
      revoke: (q) => send((h) => t.revoke(q, h)),
    },
    respond: { respond: (q) => send((h) => t.respond(q, h)) },
  };
}

export interface ClanInvitationsMount {
  uiVars: UiVarManager;
  /** The client's clan (`WorldOfSocomCommands.clan`): the invitation's clan name and the roster's seat rule. */
  clan: LobbyClan;
  /** The session's received list (`WorldOfSocomConnection.invitations`), the one SOCOM II ONLINE's INVITATIONS row reads. */
  invitations: MyClanInvitations;
  /** The transport (`fetchClanMembershipService`); absent, every request never answered and the received list keeps the world's registration. */
  service?: ClanMembershipTransport;
  ticket: () => string | null;
  sessionLost: (ticket: string) => void;
  /** The lobby's events into the built dialog (`lobbyEventInto`): MP_PLAYER_NOT_FOUND, MP_PLAYER_ALREADY_INVITED, MP_CLAN_FULL and the rest. */
  event: (kind: number, text: string | null) => void;
  /** The running animation's input string (the shell's): a row's name or invitation id. */
  inputString: (cmd: ZAnimUiCommand) => string | null;
  /** ONL-07's lobby: its +0x7d, its state and the account's name; absent, the readings (`WORLD_LOBBY_STATE_READING`, `ACCOUNT_NAME_READING`). */
  lobby?: { readonly up: boolean; state(): number; account?(): string | null } | null;
  /**
   * The dialog the page shows (the shell's `currentName`), for `CLAN_INVITE_LIVE_DIALOGS`: a live mark asks the list only
   * on one of them. Absent, every mark asks (a rig with no shell).
   */
  dialog?: () => string | null;
}

/**
 * The mount (`FrontEndSession`'s one call, after `connectWorldOfSocom`): with a transport, SOCOM II ONLINE's
 * `CheckMyInvites` and `HasClanInvitations` registered again over the session's received list with the ticket as the
 * bearer -- the page then sends the ticket (no ticket, no request), so the server's ticketless branch could be retired
 * (INVITE-TICKETLESS, research 273 §9); INVITE PLAYERS' five rows and RESPOND TO INVITES' two over the same transport.
 */
export function connectClanInvitations(host: UiCommandHost, m: ClanInvitationsMount): {
  invited: InvitedPlayersCommands; respond: RespondToInvitesCommands; live(): void; livePending(): boolean;
} {
  const lobby = m.lobby ?? null;
  const svc = m.service ? sessionClanMembership(m.service, m.ticket, m.sessionLost) : null;
  // CLAN-INVITES (the review's F2): the original's own ask of the received list settles a live mark left pending
  let pending = false;
  if (svc) new ClanInvitationCommands({ list: m.invitations, service: svc.invitations, log: (name) => { if (name === 'CheckMyInvites') pending = false; } }).register(host);
  const never: ClanInvitationsService = { check: () => Promise.reject(new Error('no service')) };
  const invited = new InvitedPlayersCommands({
    uiVars: m.uiVars, clan: m.clan, service: svc?.invited, event: m.event, inputString: m.inputString, ticket: svc ? m.ticket : undefined,
    ...(lobby ? { lobbyUp: () => lobby.up, lobbyState: () => lobby.state(), accountName: () => lobby.account?.() ?? null } : {}),
  });
  invited.register(host);
  const respond = new RespondToInvitesCommands({
    list: m.invitations, invitations: svc?.invitations ?? never, service: svc?.respond, inputString: m.inputString, ticket: svc ? m.ticket : undefined,
  });
  respond.register(host);
  // CLAN-INVITES (CLAN_INVITE_LIVE_ADAPTATION): central's mark asks the received list again over the ticketed transport,
  // only on SOCOM II ONLINE or RESPOND TO INVITES (CLAN_INVITE_LIVE_DIALOGS; the review's F2) -- elsewhere it stays pending
  // and SOCOM II ONLINE's own init_screen CheckMyInvites asks the list on entry; no transport, nothing (the world's
  // ticketless row is never asked by it); no ticket, the request is never sent
  const live = (): void => {
    if (!svc) return;
    const on = m.dialog ? m.dialog() : null;
    if (m.dialog && (on === null || !(CLAN_INVITE_LIVE_DIALOGS as readonly string[]).includes(on))) { pending = true; return; }
    pending = false;
    m.invitations.refresh(svc.invitations);
  };
  return { invited, respond, live, livePending: () => pending };
}

/**
 * CLAN_INVITE_LIVE_DIALOGS (the review's F2 on `CLAN_INVITE_LIVE_ADAPTATION`): the dialogs on which a live mark asks the
 * received list -- SOCOM II ONLINE, whose `TurnOnInvitations` draws the INVITATIONS row from it (research 273 §4), and
 * RESPOND TO INVITES, which lists it (§3). The list's reply raises MP_MEDIUS_HAS_INVITES (`FUN_002e86c0` D:L187604) into
 * the dialog shown, and the original asks the list only from these menus (`init_screen`, the respond page's loop), so the
 * adaptation raises it nowhere else: on any other dialog -- or none, a match -- the mark waits for SOCOM II ONLINE's own
 * `init_screen` CheckMyInvites on entry.
 */
export const CLAN_INVITE_LIVE_DIALOGS = ['dlgWorldOfSOCOM.rdr', 'dlgRespondToInvites.rdr'] as const;

/**
 * CLAN-INVITES (the owner's word, 2026-11-10: "ensure ... that clan invites come in live for a player that recieves
 * one"): the page's half of `CLAN_INVITE_LIVE_ADAPTATION` (a browser adaptation, no original; the server's
 * `packages/central/src/clanInviteLive.ts`, research 273 §10). The original asks the received list only at SOCOM II
 * ONLINE's `init_screen`, RESPOND TO INVITES' `WAIT 30` loop and a respond's reply, so a new invitation never reaches a
 * player resting on the menu. Central marks the logged-in invitee whose list changed and its `/lobby/chat-lines` reply
 * -- the briefing room transport's poll, `CHAT_POLL_MS_ADAPTATION` (1 s), already running while the lobby is up --
 * carries `clanInvitations: true` once. This wraps that transport as `./operatorToast`'s `withSays` does: the reply
 * handed on unchanged (the chat reads `lines` and `system` only), and on the mark `changed` called with the ticket the
 * poll was sent with; the session then asks the list again (`connectClanInvitations`' `live`,
 * `MyClanInvitations.refresh`), and the original's own reply handling and `TurnOnInvitations` draw the row. No request,
 * connection or period is added.
 */
export function withClanInvitationNotice(t: BriefingRoomTransport, changed: (ticket: string) => void): BriefingRoomTransport {
  const poll = t.chatLines;
  if (!poll) return t;
  return {
    ...t,
    chatLines: (ticket) => poll.call(t, ticket).then((r) => {
      if (r !== null && typeof r === 'object' && !Array.isArray(r) && (r as ChatLinesReplyWithSays).clanInvitations === true) changed(ticket);
      return r;
    }),
  };
}
