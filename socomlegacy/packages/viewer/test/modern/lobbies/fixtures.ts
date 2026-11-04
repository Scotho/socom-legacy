import type { ChannelListEntry, GameListEntry } from '@s2u/ui';
import type { ModernSession, SessionSnapshot, SessionState } from '../../../src/modern/session';
import type { LauncherSnapshot, LauncherState } from '../../../src/modern/launcherState';

/**
 * Fixtures for the lobby browser's tests (MU-3): the three routes' answers in the shapes their servers write them
 * (`packages/central/src/lobbyHttp.ts` `channel-list` / `game-list`, `modernHttp.ts` `/modern/lobby-members`,
 * `server.ts` `roomsBody`), a session double and a launcher double. Generated values only.
 */

export const BASE = 'http://lobby.test';
/** A ticket for the bearer: generated, never a credential. */
export const TICKET = ['t', 'k', String(42)].join('-');
/** The XSS probe a player's name may carry: it must render as these characters, never as markup. */
export const XSS_NAME = '<img src=x onerror=1>';

export function room(id: number, name: string, players: number, max = 64, opts: { locked?: boolean; gf1?: number } = {}): ChannelListEntry {
  return { status: 0, mediusWorldId: id, playerCount: players, maxPlayers: max, securityLevel: opts.locked ? 1 : 0, genericField1: opts.gf1 ?? 0, lobbyName: name, endOfList: false };
}

/**
 * A GameStats 'D' record as hex: byte 0 'D', byte 1 the rounds, byte 2 the round's minutes, byte 3 the spectators' cap,
 * byte 4 the spectator slots, byte 5 EQlimit, byte 7 the ranks, byte 8 the map (the play list's first; `list` the rest).
 */
export function statsHex(o: { spec?: number; slots?: number; ranks?: number; level?: number; rounds?: number; minutes?: number; eq?: number; list?: number[] } = {}): string {
  const b = new Uint8Array(256);
  b[0] = 0x44; b[1] = o.rounds ?? 0; b[2] = o.minutes ?? 0; b[3] = o.spec ?? 0; b[4] = o.slots ?? 0; b[5] = o.eq ?? 0; b[7] = o.ranks ?? 0; b[8] = o.level ?? 0;
  (o.list ?? []).forEach((m, i) => { b[9 + i] = m; });
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function game(id: number, name: string, roomId: number, players: number, opts: { max?: number; locked?: boolean; clan?: boolean; ping?: number; level?: number; slots?: number; spec?: number; ranks?: number; rounds?: number; minutes?: number; eq?: number; list?: number[]; rulesSet?: number; worldStatus?: number } = {}): GameListEntry {
  return {
    status: 0, mediusWorldId: id, playerCount: players, minPlayers: 2, maxPlayers: opts.max ?? 16, gameLevel: opts.level ?? 0, playerSkillLevel: 0,
    rulesSet: opts.rulesSet ?? 0, genericField1: roomId, genericField2: opts.ping ?? 100, genericField3: opts.clan ? 1 : 0, securityLevel: opts.locked ? 1 : 0,
    worldStatus: opts.worldStatus ?? 1, gameHostType: 0, gameName: name, gameStats: statsHex({ level: 2, ...opts }), endOfList: false,
  };
}

export const NO_ROOMS = { entries: [{ status: -1, mediusWorldId: 0, playerCount: 0, maxPlayers: 0, securityLevel: 0, genericField1: 0, lobbyName: '', endOfList: true }] };
export const NO_GAMES = { entries: [{ ...game(0, '', 0, 0), status: -1, endOfList: true }] };

/** A server's lobby: two open rooms and a password room; a game in Channel 1, a password game in Veterans. */
export function lobbyFixture(): { channels: unknown; games: unknown; members: unknown } {
  return {
    channels: { entries: [room(101, 'Channel 2', 1), room(100, 'Channel 1', 2), room(102, 'Veterans', 1, 64, { locked: true }), room(103, 'Medius Hidden', 0)] },
    games: { entries: [game(500, 'test$~Channel 1', 100, 2, { slots: 4, ping: 450 }), { ...game(501, 'secret', 102, 1, { locked: true }), endOfList: true }] },
    members: {
      rooms: [
        { mediusWorldId: 100, name: 'Channel 1', players: [{ name: 'Alpha' }, { name: XSS_NAME }] },
        { mediusWorldId: 101, name: 'Channel 2', players: [{ name: 'Bravo' }] },
        { mediusWorldId: 102, name: 'Veterans', private: true, players: [] },
        { mediusWorldId: 103, name: 'Medius Hidden', players: [] },
      ],
      games: [
        { mediusWorldId: 500, name: 'test$~Channel 1', room: 100, players: [{ name: 'Alpha' }, { name: XSS_NAME }] },
        { mediusWorldId: 501, name: 'secret', room: 102, private: true, players: [] },
      ],
    },
  };
}

export const PUBLIC_ROOMS = [
  { map: 'MP2', rules: 'classic', players: 3, spectators: 1, round: 2 },
  { map: 'MP51', rules: 'classic', players: 0, spectators: 0, round: 0 },
];

/** A minimal answer (status, ok, json): a real `Response`'s body is read through streams the fake timers can stall. */
function answer(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => { if (body === undefined) throw new SyntaxError('no body'); return JSON.parse(JSON.stringify(body)); } } as Response;
}

export type Answer ={ status?: number; body?: unknown } | 'reject' | 'hang';
export interface Call { url: string; method: string; auth: string | null; type?: string | null; body?: unknown }

/** A `fetch` double: each path answers from its queue (the last answer repeats), every call recorded. */
export function fakeFetch(answers: Record<string, Answer | Answer[]>): { fetch: typeof fetch; calls: Call[]; set(path: string, a: Answer | Answer[]): void } {
  const queues = new Map<string, Answer[]>(Object.entries(answers).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]));
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = url.startsWith(BASE) ? url.slice(BASE.length) : url;
    const headers = new Headers(init?.headers);
    calls.push({ url, method: init?.method ?? 'GET', auth: headers.get('authorization'), ...(init?.body !== undefined ? { type: headers.get('content-type'), body: init.body } : {}) });
    const q = queues.get(path);
    if (!q || q.length === 0) return answer(404, undefined);
    const a = q.length > 1 ? q.shift()! : q[0]!;
    if (a === 'reject') throw new TypeError('Failed to fetch');
    if (a === 'hang') {
      return new Promise<Response>((_, fail) => { init?.signal?.addEventListener('abort', () => fail(new DOMException('aborted', 'AbortError'))); });
    }
    return answer(a.status ?? 200, a.body);
  }) as typeof fetch;
  return { fetch: fn, calls, set(path, a) { queues.set(path, Array.isArray(a) ? [...a] : [a]); } };
}

/** The signed-in server's routes from `lobbyFixture`. */
export function signedInRoutes(f = lobbyFixture()): Record<string, Answer> {
  return {
    '/lobby/channel-list': { body: f.channels },
    '/lobby/game-list': { body: f.games },
    '/modern/lobby-members': { body: f.members },
    '/rooms': { body: PUBLIC_ROOMS },
  };
}

/** A session double: its state set by the test. */
export function fakeSession(start: SessionState = 'signed-out'): ModernSession & { set(s: SessionState): void } {
  let state = start;
  const subs = new Set<(s: SessionSnapshot) => void>();
  const snap = (): SessionSnapshot => ({ state, account: state === 'signed-in' ? { name: 'Me' } : null, error: null });
  return {
    state: () => state,
    account: () => snap().account,
    ticket: () => (state === 'signed-in' ? TICKET : null),
    error: () => null,
    remembers: () => false,
    onChange(cb) { subs.add(cb); return () => { subs.delete(cb); }; },
    signIn: async () => ({ ok: true }),
    create: async () => ({ ok: true }),
    signOut: async () => { state = 'signed-out'; for (const cb of [...subs]) cb(snap()); },
    close() { state = 'signed-out'; for (const cb of [...subs]) cb(snap()); },
    set(s) { state = s; for (const cb of [...subs]) cb(snap()); },
  };
}

export function fakeLauncher(disc: LauncherSnapshot['disc'] = 'empty'): LauncherState & { set(d: LauncherSnapshot['disc']): void } {
  let now = disc; const subs = new Set<(s: LauncherSnapshot) => void>();
  return {
    disc: () => now, isoInserted: () => now === 'ready', filename: () => null,
    onChange: (cb) => { subs.add(cb); return () => { subs.delete(cb); }; },
    set(d) { now = d; for (const cb of [...subs]) cb({ disc: d, isoInserted: d === 'ready', filename: null }); },
  };
}

/** Lets the promises queued so far settle (a fetch double's answer and the view's reading of it). */
export async function settle(times = 12): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}
