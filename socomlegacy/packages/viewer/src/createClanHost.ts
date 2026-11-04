import {
  CreateClanCommands,
  type CreateClanReply, type CreateClanService, type LobbyClan, type UiCommandHost, type UiVarManager,
} from '@s2u/ui';

/**
 * ONL-26's page half (web research 271): CREATE CLAN's requests -- SVC-08's `/clan/create` and `/clan/update-stats`
 * (`packages/central/src/clans.ts`, `CLAN_PATHS`; research 262 §1-§2) -- at the page's own origin
 * (`ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`, `./connectHost`) with the session's ticket as the bearer, as ONL-25's ignore
 * list (`./ignoreListHost`); and the session's mount of `@s2u/ui`'s `CreateClanCommands` over the client's clan that
 * SOCOM II ONLINE's rows read (`WorldOfSocomCommands.clan`). The transport is ours (OT.R27); the fields and what the
 * client does with them are the original's. No text filter is asked: our services serve none (`@s2u/ui`'s create
 * passes every name, research 271 §2). The answers read as the ignore list's: 2xx the reply's fields, checked;
 * 401 the session lost (handed to the lobby client's `sessionLost`: MP_MEDIUS_ERROR, which CREATE CLAN binds to
 * `OnMultiplayerDisconnect`); anything else a request never answered; no ticket, no request.
 */

/** A 401: the server holds no session for the ticket (`SESSION_LOST_READING`, `@s2u/ui`'s lobby client). */
export const CREATE_CLAN_SESSION_LOST = 'session-lost' as const;
type Lost = typeof CREATE_CLAN_SESSION_LOST;

const isInt = (v: unknown): v is number => Number.isSafeInteger(v);
const ints = <K extends string>(raw: unknown, keys: readonly K[]): Record<K, number> => {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || !keys.every((k) => isInt(r[k]))) throw new Error('clan reply: not the shape');
  return Object.fromEntries(keys.map((k) => [k, r[k] as number])) as Record<K, number>;
};
const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** The transport: each request with the ticket as its bearer. */
export interface CreateClanTransport {
  create(q: { clanName: string }, ticket: string): Promise<CreateClanReply | Lost>;
  updateStats(q: { clanId: number; stats: Uint8Array }, ticket: string): Promise<{ status: number } | Lost>;
}

/** The two requests over the match server's `POST <base>/clan/<op>` (the server's body: the stats as 512 hex digits). */
export function fetchCreateClanService(base: string, fetchFn: typeof fetch = (...a) => fetch(...a)): CreateClanTransport {
  const post = async <T>(op: string, body: unknown, ticket: string, read: (raw: unknown) => T): Promise<T | Lost> => {
    const res = await fetchFn(`${base}/clan/${op}`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ticket}` }, body: JSON.stringify(body),
      credentials: 'omit', cache: 'no-store',
    });
    if (res.status === 401) return CREATE_CLAN_SESSION_LOST;
    if (!res.ok) throw new Error(`${op}: HTTP ${res.status}`);
    return read(await res.json());
  };
  return {
    create: (q, t) => post('create', { clanName: q.clanName }, t, (r) => ints(r, ['status', 'clanId'] as const)),
    updateStats: (q, t) => post('update-stats', { clanId: q.clanId, stats: hex(q.stats) }, t, (r) => ints(r, ['status'] as const)),
  };
}

/** The client's `CreateClanService` over the transport: the session's ticket read at each request (none: no request), a 401 handed to `sessionLost`. */
export function sessionCreateClan(t: CreateClanTransport, ticket: () => string | null, sessionLost: (ticket: string) => void): CreateClanService {
  const send = async <T>(ask: (held: string) => Promise<T | Lost>): Promise<T> => {
    const held = ticket();
    if (held === null) throw new Error('create clan: no ticket');
    const r = await ask(held);
    if (r === CREATE_CLAN_SESSION_LOST) { sessionLost(held); throw new Error('create clan: session lost'); }
    return r as T;
  };
  return {
    create: (q) => send((h) => t.create(q, h)),
    updateStats: (q) => send((h) => t.updateStats(q, h)),
  };
}

export interface CreateClanMount {
  uiVars: UiVarManager;
  /** The client's clan (`WorldOfSocomCommands.clan`): the one SOCOM II ONLINE's CLAN row reads. */
  clan: LobbyClan;
  /** The transport (`fetchCreateClanService`); absent, every request never answered. */
  service?: CreateClanTransport;
  ticket: () => string | null;
  sessionLost: (ticket: string) => void;
  /** The lobby's events into the built dialog (`lobbyEventInto`): MP_CREATE_CLAN_SUCCESS, MP_CREATE_CLAN_FAILURE, MP_FILTER_FAILURE. */
  event: (kind: number, text: string | null) => void;
  /** ONL-07's lobby: its +0x7d, its state and the account's name; absent, the readings (`WORLD_LOBBY_STATE_READING`, `ACCOUNT_NAME_READING`). */
  lobby?: { readonly up: boolean; state(): number; account?(): string | null } | null;
}

/** The mount (`FrontEndSession`'s one call): the row over the session's transport. */
export function connectCreateClan(host: UiCommandHost, m: CreateClanMount): CreateClanCommands {
  const lobby = m.lobby ?? null;
  const commands = new CreateClanCommands({
    uiVars: m.uiVars, clan: m.clan, service: m.service ? sessionCreateClan(m.service, m.ticket, m.sessionLost) : undefined,
    event: m.event, ticket: m.service ? m.ticket : undefined,
    ...(lobby ? { lobbyUp: () => lobby.up, lobbyState: () => lobby.state(), accountName: () => lobby.account?.() ?? null } : {}),
  });
  commands.register(host);
  return commands;
}
