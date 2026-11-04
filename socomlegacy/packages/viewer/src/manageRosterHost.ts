import {
  ManageRosterCommands, ManageRosterLeaderCommands,
  type ClanRosterEntry, type LobbyClan, type ManageRosterLeaderService, type ManageRosterService, type MyClansReply, type UiCommandHost, type UiVarManager,
  type ZAnimUiCommand,
} from '@s2u/ui';

/**
 * ONL-27's page half (web research 272 §4): the clan roster's requests over SVC-08's and SVC-09's paths on the match
 * server (`packages/central/src/clans.ts`, `CLAN_PATHS`, `CLAN_MEMBERSHIP_PATHS`): `POST <base>/clan/my-clans`
 * `{ start, pageSize }` (GetMyClans; the server answers its one reply, handed on as a list of one), `/clan/roster`
 * `{ clanId, ladderStatIndex, sortOrder }` (`{ entries }`), `/clan/remove` `{ playerAccountId, clanId }` (QuitClan and the
 * leader's removal), `/clan/transfer-leadership` `{ newLeaderAccountId, newLeaderAccountName }`, `/clan/disband`
 * `{ clanId }` and `/clan/update-stats` `{ clanId, stats }` (the 256 bytes as 512 hex digits, as CREATE CLAN's,
 * `./createClanHost`), each with the session's ticket as the bearer, `credentials: 'omit'`, `cache: 'no-store'`,
 * `<base>` the page's own origin (`accountServiceBase`, `ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`, `./connectHost`). The
 * transport is ours (OT.R27); the requests' words and the replies' fields are the original's. 2xx the reply's fields,
 * checked; 401 the session lost (the lobby client's `sessionLost`); anything else a request never answered; no ticket, no
 * request.
 */

const isStr = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** A 401: the server holds no session for the ticket (`SESSION_LOST_READING`, `@s2u/ui`'s lobby client). */
export const MANAGE_ROSTER_SESSION_LOST = 'session-lost' as const;
type Lost = typeof MANAGE_ROSTER_SESSION_LOST;

const record = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('clan roster reply: not the shape');
  return raw as Record<string, unknown>;
};

/** SVC-08's MyClansReply checked field by field (the fields `FUN_002e8bd0` reads and the leader's name); anything else throws. */
export function myClansOf(raw: unknown): MyClansReply[] {
  const r = record(raw);
  if (!isInt(r['status']) || !isInt(r['clanId']) || !isStr(r['clanName']) || !isInt(r['leaderAccountId']) || !isStr(r['leaderAccountName'])
    || !isStr(r['stats']) || !isBool(r['endOfList'])) throw new Error('my clans reply: not the shape');
  return [{
    status: r['status'] as number, clanId: r['clanId'] as number, clanName: r['clanName'] as string, leaderAccountId: r['leaderAccountId'] as number,
    leaderAccountName: r['leaderAccountName'] as string, stats: r['stats'] as string, endOfList: r['endOfList'] as boolean,
  }];
}

/** SVC-08's `{ entries }` of the roster checked field by field; anything else throws. */
export function rosterEntriesOf(raw: unknown): ClanRosterEntry[] {
  const list = record(raw)['entries'];
  if (!Array.isArray(list)) throw new Error('clan roster reply: not the shape');
  return list.map((x) => {
    const e = record(x);
    const o = e['onlineState'];
    const s = o && typeof o === 'object' ? o as Record<string, unknown> : null;
    if (!isInt(e['status']) || !isInt(e['accountId']) || !isStr(e['accountName']) || !isStr(e['stats']) || !isInt(e['ladderStat'])
      || !isInt(e['ladderPosition']) || !isInt(e['totalRankings']) || !isBool(e['endOfList']) || !s
      || !isInt(s['connectStatus']) || !isInt(s['lobbyWorldId']) || !isInt(s['gameWorldId']) || !isStr(s['lobbyName']) || !isStr(s['gameName'])) {
      throw new Error('clan roster row: not the shape');
    }
    return {
      status: e['status'] as number, accountId: e['accountId'] as number, accountName: e['accountName'] as string, stats: e['stats'] as string,
      onlineState: {
        connectStatus: s['connectStatus'] as number, lobbyWorldId: s['lobbyWorldId'] as number, gameWorldId: s['gameWorldId'] as number,
        lobbyName: s['lobbyName'] as string, gameName: s['gameName'] as string,
      },
      ladderStat: e['ladderStat'] as number, ladderPosition: e['ladderPosition'] as number, totalRankings: e['totalRankings'] as number,
      endOfList: e['endOfList'] as boolean,
    };
  });
}

const statusOf = (raw: unknown): { status: number } => {
  const r = record(raw);
  if (!isInt(r['status'])) throw new Error('clan roster reply: not the shape');
  return { status: r['status'] as number };
};

/** The transport: each request with the ticket as its bearer. */
export interface ManageRosterTransport {
  myClans(q: { start: number; pageSize: number }, ticket: string): Promise<MyClansReply[] | Lost>;
  roster(q: { clanId: number; ladderStatIndex: number; sortOrder: number }, ticket: string): Promise<ClanRosterEntry[] | Lost>;
  remove(q: { playerAccountId: number; clanId: number }, ticket: string): Promise<{ status: number } | Lost>;
  transferLeadership(q: { newLeaderAccountId: number; newLeaderAccountName: string }, ticket: string): Promise<{ status: number } | Lost>;
  disband(q: { clanId: number }, ticket: string): Promise<{ status: number } | Lost>;
  updateStats(q: { clanId: number; stats: Uint8Array }, ticket: string): Promise<{ status: number } | Lost>;
}

/** The requests over the match server's `POST <base>/clan/<op>`, `<base>` the page's own origin. */
export function fetchManageRosterService(base: string, fetchFn: typeof fetch = (...a) => fetch(...a)): ManageRosterTransport {
  const post = async <T>(path: string, body: unknown, ticket: string, read: (raw: unknown) => T): Promise<T | Lost> => {
    const res = await fetchFn(`${base}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ticket}` }, body: JSON.stringify(body),
      credentials: 'omit', cache: 'no-store',
    });
    if (res.status === 401) return MANAGE_ROSTER_SESSION_LOST;
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return read(await res.json());
  };
  return {
    myClans: (q, t) => post('/clan/my-clans', { start: q.start, pageSize: q.pageSize }, t, myClansOf),
    roster: (q, t) => post('/clan/roster', { clanId: q.clanId, ladderStatIndex: q.ladderStatIndex, sortOrder: q.sortOrder }, t, rosterEntriesOf),
    remove: (q, t) => post('/clan/remove', { playerAccountId: q.playerAccountId, clanId: q.clanId }, t, statusOf),
    transferLeadership: (q, t) => post('/clan/transfer-leadership', { newLeaderAccountId: q.newLeaderAccountId, newLeaderAccountName: q.newLeaderAccountName }, t, statusOf),
    disband: (q, t) => post('/clan/disband', { clanId: q.clanId }, t, statusOf),
    updateStats: (q, t) => post('/clan/update-stats', { clanId: q.clanId, stats: hex(q.stats) }, t, statusOf),
  };
}

/** The rows' service over the transport: the session's ticket read at each request (none: no request), a 401 handed to `sessionLost`. */
export function sessionManageRoster(t: ManageRosterTransport, ticket: () => string | null, sessionLost: (ticket: string) => void): ManageRosterService & ManageRosterLeaderService {
  const send = async <T>(ask: (held: string) => Promise<T | Lost>): Promise<T> => {
    const held = ticket();
    if (held === null) throw new Error('clan roster: no ticket');
    const r = await ask(held);
    if (r === MANAGE_ROSTER_SESSION_LOST) { sessionLost(held); throw new Error('clan roster: session lost'); }
    return r as T;
  };
  return {
    myClans: (q) => send((h) => t.myClans(q, h)),
    roster: (q) => send((h) => t.roster(q, h)),
    remove: (q) => send((h) => t.remove(q, h)),
    transferLeadership: (q) => send((h) => t.transferLeadership(q, h)),
    disband: (q) => send((h) => t.disband(q, h)),
    updateStats: (q) => send((h) => t.updateStats(q, h)),
  };
}

export interface ManageRosterMount {
  uiVars: UiVarManager;
  /** The client's clan (`WorldOfSocomCommands.clan`): the one every clan row reads. */
  clan: LobbyClan;
  /** The transport (`fetchManageRosterService`); absent, every request never answered. */
  service?: ManageRosterTransport;
  ticket: () => string | null;
  sessionLost: (ticket: string) => void;
  /** The lobby's events into the built dialog, with their text (`lobbyEventInto`): MP_CLAN_DISBANDED, MP_DISBAND_CLAN_FAILURE and the rest. */
  event: (kind: number, text: string | null) => void;
  /** The running animation's input string (the shell's): a roster row's key. */
  inputString: (cmd: ZAnimUiCommand) => string | null;
  /** ONL-07's lobby: its +0x7d, its state and the account's name; absent, the readings (`WORLD_LOBBY_STATE_READING`, `ACCOUNT_NAME_READING`). */
  lobby?: { readonly up: boolean; state(): number; account?(): string | null } | null;
  /** ONL-29's rows (`connectClanMessages`' return): GetMyClans' success asks the band through them; absent, not asked. */
  clanMessages?: { myClanMessages(): void };
  /** ONL-30a's ladder (`connectLadderLobby`' return): my total, the medal column's (`state().myTotal`); absent, 0. */
  ladderTotal?: () => number;
  /** The same ladder's my position (`state().myPosition`, `DAT_0044f7f8`): a roster row's -1 takes its medal; absent, 0. */
  ladderPosition?: () => number;
}

/** The mount (`FrontEndSession`'s one call, after `connectClanMessages` and `connectLadderLobby`): the clan client's six rows and the leader's four. */
export function connectManageRoster(host: UiCommandHost, m: ManageRosterMount): { roster: ManageRosterCommands; leader: ManageRosterLeaderCommands } {
  const lobby = m.lobby ?? null;
  const service = m.service ? sessionManageRoster(m.service, m.ticket, m.sessionLost) : undefined;
  const common = {
    uiVars: m.uiVars, clan: m.clan, event: m.event, inputString: m.inputString, ticket: m.service ? m.ticket : undefined,
    ...(lobby ? { lobbyUp: () => lobby.up, lobbyState: () => lobby.state(), accountName: () => lobby.account?.() ?? null } : {}),
  };
  const roster = new ManageRosterCommands({
    ...common, service, ...(m.clanMessages ? { clanMessages: m.clanMessages } : {}), ...(m.ladderTotal ? { ladderTotal: m.ladderTotal } : {}), ...(m.ladderPosition ? { ladderPosition: m.ladderPosition } : {}),
  });
  roster.register(host);
  const leader = new ManageRosterLeaderCommands({ ...common, roster, service });
  leader.register(host);
  return { roster, leader };
}
