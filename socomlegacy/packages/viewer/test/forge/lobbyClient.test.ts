// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { ArmoryData } from '../../src/armoryData';
import type { WebSocketLike } from '../../src/net/client';
import type { ServerEvent } from '../../src/net/protocol';
import { emptyLayout, serializeLayout, type Layout } from '../../src/forge/layout';
import { FORGE_LOBBY_WINDOW_KEY } from '../../src/forge/lobby/window';
import {
  addressWithLobby, askForgeSeat, askGuest, closeLobby, createLobby, enterLocked, fetchLobby, FORGE_BASE_MISSING_WORDS, FORGE_LOBBY_KICKED_CODE, FORGE_SEAT_RETRY_ADAPTATION,
  ForgeLobbySession, GUEST_PASS_LAPSED, handOnLobby, isForgeToken, kickSeat, LOBBY_KICKED_WORDS, lobbyEndWords, lobbyIdOf, loadoutOf, missingArchives, openLobbySocket, setListed,
  setPassword,
} from '../../src/forge/lobbyClient';
import { GAME_TOKEN_CHARS_MAX, isGameToken } from '../../src/connectHost';
import { PAGE_SETTING_KEYS } from '../../src/pageStore';

/**
 * FORGE (FG-26; FG.R19-R21, a browser adaptation with no original): the forge's client of the server's forge lobby
 * (`packages/central/src/forgeLobbyHttp.ts`'s routes, the hello's `forge` field `server.ts` `joinForge` seats) and the
 * session the page's popup is fed by, as `../../src/gameLobbyHost` `GameSocketHost` routes the game lobby's socket.
 * The owner's word (2026-10-14, FG.R21): nothing of a guest is stored -- no memory card, no persona, no ARMORY profile,
 * no `PUT /lobby/loadout`; the host ticket lives in memory only.
 */

const BASE = 'https://forge.test';
const layout = (): Layout => ({ ...emptyLayout({ kind: 'map', archive: 'MP72' }), pieces: [{ asset: 'MP2:a_box', m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 20, 1] }], settings: { players: 8 } });
const summary = { id: 'L1', name: 'BOXES', base: 'MP72', players: 0, max: 8, settings: {}, created: 1 };

interface Call { url: string; method: string; headers: Record<string, string>; body: unknown }
function fakeFetch(answers: { status: number; body?: unknown }[]): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    calls.push({ url: String(input), method: init.method ?? 'GET', headers, body: typeof init.body === 'string' ? JSON.parse(init.body) as unknown : null });
    const a = answers.shift() ?? { status: 500 };
    return { status: a.status, ok: a.status >= 200 && a.status < 300, json: async () => a.body ?? null } as unknown as Response;
  }) as typeof fetch;
  return { fetch: fn, calls };
}

class FakeSocket implements WebSocketLike {
  binaryType = 'blob';
  readyState = 0;
  sent: unknown[] = [];
  closed: number | null = null;
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(readonly url: string) {}
  send(data: string | Uint8Array): void { this.sent.push(typeof data === 'string' ? JSON.parse(data) as unknown : data); }
  close(code = 1000): void { this.closed = code; }
  open(): void { this.readyState = 1; this.onopen?.({}); }
  emit(ev: ServerEvent): void { this.onmessage?.({ data: JSON.stringify(ev) }); }
  drop(code: number, reason = ''): void { this.readyState = 3; this.onclose?.({ code, reason }); }
}

const seat = (id: number, name: string, team: 'seal' | 'terrorist' | null, host = false) => ({ id, name, team, ready: false, host, readyIn: 0 });
const welcome = (id: number, team: 'seal' | 'terrorist'): ServerEvent => ({
  type: 'welcome', id, version: 11, map: 'MP72', tick: 0, role: 'player', team, queue: 0, name: id === 1 ? 'Guest-1' : 'Guest-2',
  players: [], rules: 'classic', round: 0, rounds: 3, ghost: false,
} as unknown as ServerEvent);

function seated(o: { hostTicket?: string; ticket?: string; token?: string; url?: string } = {}) {
  let sock: FakeSocket | null = null;
  const client = openLobbySocket({ url: 'wss://forge.test/ws', id: 'L1', name: '', ...o, socket: (url) => (sock = new FakeSocket(url)) });
  const s = sock as unknown as FakeSocket;
  s.open();
  return { client, sock: s };
}

afterEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe('FORGE lobby client: the HTTP routes (forgeLobbyHttp.ts)', () => {
  it('creates a lobby: POST /lobby/forge/lobby with the name and the layout, the bearer when signed in', async () => {
    const f = fakeFetch([{ status: 201, body: { id: 'L1', hostTicket: 'HT', lobby: summary } }]);
    const a = await createLobby(BASE, 'BOXES', layout(), 'TICKET', f.fetch);
    expect(a).toEqual({ ok: true, id: 'L1', hostTicket: 'HT', lobby: summary, guest: false, stale: false, pass: null, seat: null });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toMatchObject({ url: `${BASE}/lobby/forge/lobby`, method: 'POST' });
    expect(f.calls[0]!.headers['authorization']).toBe('Bearer TICKET');
    expect(f.calls[0]!.headers['content-type']).toMatch(/^application\/json/);
    expect(f.calls[0]!.body).toEqual({ name: 'BOXES', layout: JSON.parse(serializeLayout(layout())), listed: false });   // FG-45: unlisted unless asked
  });

  it('a guest creates with no bearer (FG.R21)', async () => {
    const f = fakeFetch([{ status: 201, body: { id: 'L1', hostTicket: 'HT', lobby: summary } }]);
    const a = await createLobby(BASE, 'BOXES', layout(), null, f.fetch);
    expect(a).toMatchObject({ ok: true, guest: true, stale: false });
    expect(f.calls[0]!.headers['authorization']).toBeUndefined();
  });

  it('a stale bearer (401) is dropped and the create asked again as a guest, said as stale', async () => {
    const f = fakeFetch([{ status: 401 }, { status: 201, body: { id: 'L1', hostTicket: 'HT', lobby: summary } }]);
    const a = await createLobby(BASE, 'BOXES', layout(), 'DEAD', f.fetch);
    expect(a).toMatchObject({ ok: true, guest: true, stale: true });
    expect(f.calls.map((c) => c.headers['authorization'])).toEqual(['Bearer DEAD', undefined]);
  });

  it('says each refusal of the table in words, with its status', async () => {
    for (const status of [400, 403, 409, 413, 429, 503]) {
      const a = await createLobby(BASE, 'BOXES', layout(), null, fakeFetch([{ status }]).fetch);
      expect(a.ok).toBe(false);
      if (!a.ok) { expect(a.status).toBe(status); expect(a.words.length).toBeGreaterThan(5); }
    }
    const thrown = await createLobby(BASE, 'BOXES', layout(), null, (async () => { throw new TypeError('offline'); }) as typeof fetch);
    expect(thrown).toMatchObject({ ok: false, status: 0 });
  });

  it('a base the server lacks (400 `{ refused: "base", map }`) names that map, not the three-way guess (the owner, 2026-10-15)', async () => {
    const a = await createLobby(BASE, 'BOXES', layout(), null, fakeFetch([{ status: 400, body: { refused: 'base', map: 'M51' } }]).fetch);
    expect(a).toMatchObject({ ok: false, status: 400, words: FORGE_BASE_MISSING_WORDS('M51') });
    expect(FORGE_BASE_MISSING_WORDS('M51')).toContain('M51');
    // A map that is not a stem is never shown: the table's words.
    const odd = await createLobby(BASE, 'BOXES', layout(), null, fakeFetch([{ status: 400, body: { refused: 'base', map: '<b>x</b>' } }]).fetch);
    expect(odd).toMatchObject({ ok: false, status: 400 });
    if (!odd.ok) expect(odd.words).not.toContain('<b>');
  });

  it('fetches a lobby: GET /lobby/forge/lobby/<id>, its layout read by parseLayout, its state and missing', async () => {
    const detail = { ...summary, layout: JSON.parse(serializeLayout(layout())) as unknown, missing: 1, state: { seats: [], countdown: null, launched: false } };
    const f = fakeFetch([{ status: 200, body: detail }, { status: 404 }, { status: 200, body: { ...detail, layout: { forge: 9 } } }]);
    const a = await fetchLobby(BASE, 'L1', f.fetch);
    expect(f.calls[0]).toMatchObject({ url: `${BASE}/lobby/forge/lobby/L1`, method: 'GET' });
    expect(a.ok).toBe(true);
    if (a.ok) { expect(a.lobby.layout).toEqual(layout()); expect(a.lobby.name).toBe('BOXES'); expect(a.lobby.missing).toBe(1); expect(a.lobby.state.launched).toBe(false); }
    expect(await fetchLobby(BASE, 'L1', f.fetch)).toMatchObject({ ok: false, status: 404 });
    expect(await fetchLobby(BASE, 'L1', f.fetch)).toMatchObject({ ok: false });
    expect((await fetchLobby(BASE, 'not/an id', fakeFetch([]).fetch)).ok).toBe(false);   // never asked
  });

  it('closes a lobby: DELETE with the host ticket in X-Forge-Host', async () => {
    const f = fakeFetch([{ status: 204 }, { status: 403 }]);
    expect(await closeLobby(BASE, 'L1', 'HT', null, f.fetch)).toBe(true);
    expect(f.calls[0]).toMatchObject({ url: `${BASE}/lobby/forge/lobby/L1`, method: 'DELETE' });
    expect(f.calls[0]!.headers['x-forge-host']).toBe('HT');
    expect(await closeLobby(BASE, 'L1', 'HT', null, f.fetch)).toBe(false);
  });
});

describe('FORGE lobby client: the socket (the hello\'s forge field, server.ts joinForge)', () => {
  it('the host\'s hello names the lobby and its host ticket; the account\'s login ticket is the hello\'s own ticket', () => {
    const { sock } = seated({ hostTicket: 'HT', ticket: 'LOGIN' });
    const hello = sock.sent[0] as Record<string, unknown>;
    expect(hello).toMatchObject({ type: 'hello', forge: { id: 'L1', ticket: 'HT' }, ticket: 'LOGIN' });
    expect(hello['game']).toBeUndefined();
    expect(sock.url).toBe('wss://forge.test/ws');
  });

  it('a guest joiner\'s hello names the lobby alone: no host ticket, no login ticket', () => {
    const { sock } = seated();
    const hello = sock.sent[0] as Record<string, unknown>;
    expect(hello['forge']).toEqual({ id: 'L1' });
    expect('ticket' in hello).toBe(false);
  });

  it('only the hello is rewritten: the frames after it go as sent', () => {
    const { client, sock } = seated({ hostTicket: 'HT' });
    client.send({ type: 'lobbyReady' });
    expect(sock.sent[1]).toEqual({ type: 'lobbyReady' });
  });
});

describe('FORGE lobby session: the events routed as GameSocketHost routes the game lobby\'s', () => {
  const session = (o: { armory?: () => Promise<ArmoryData> | null } = {}) => {
    const s = seated({ hostTicket: 'HT' });
    const lobby = new ForgeLobbySession(s.client, { title: () => ({ name: 'BOXES', map: 'MP72', players: 8 }), ...(o.armory ? { armoryData: o.armory } : {}) });
    let closes = 0;
    const deps = lobby.deps(document, () => { closes++; });
    return { ...s, lobby, deps, closes: () => closes };
  };

  it('welcome, gameLobby and chat reach the popup\'s seam; its requests reach the socket', () => {
    const { sock, deps } = session();
    expect(deps.me()).toBeNull();
    sock.emit(welcome(1, 'seal'));
    const seen: unknown[] = [], lines: unknown[] = [];
    deps.onLobby((ev) => seen.push(ev));
    deps.onChat((l) => lines.push(l));
    sock.emit({ type: 'gameLobby', seats: [seat(1, 'Guest-1', 'seal', true), seat(2, 'Guest-2', 'terrorist')], countdown: null, launched: false });
    expect(deps.me()).toEqual({ id: 1, host: true });
    expect(deps.lobby()?.seats).toHaveLength(2);
    expect(seen).toHaveLength(1);
    sock.emit({ type: 'chat', sender: 2, name: 'Guest-2', text: 'hi', team: true });
    expect(lines).toEqual([{ from: 'Guest-2', text: 'hi', team: true }]);
    deps.send('lobbyReady');
    deps.chat('go', false);
    deps.chat('flank', true);
    expect(sock.sent.slice(1)).toEqual([{ type: 'lobbyReady' }, { type: 'chat', text: 'go' }, { type: 'chat', text: 'flank', team: true }]);
    expect(deps.title()).toEqual({ name: 'BOXES', map: 'MP72', players: 8 });
  });

  it('the launch is told once (gameLobby launched or a roundStart), and the hand-off gives the client and the welcome on its side', () => {
    const { sock, lobby, deps, client } = session();
    let launches = 0;
    lobby.onLaunch(() => { launches++; });
    sock.emit(welcome(1, 'seal'));
    sock.emit({ type: 'gameLobby', seats: [seat(1, 'Guest-1', 'terrorist', true), seat(2, 'Guest-2', 'seal')], countdown: 0, launched: true });
    sock.emit({ type: 'roundStart', round: 1, seconds: 300, wins: { seal: 0, terrorist: 0 }, rounds: 3, epoch: 1, startTick: 0 });
    expect(launches).toBe(1);
    const h = lobby.handOff();
    expect(h).not.toBeNull();
    expect(h!.client).toBe(client);
    expect(deps.net()).toBeNull();
    expect(h!.welcome?.team).toBe('terrorist');                       // SWITCH SIDES after the welcome (seatWelcome)
    expect(h!.roundStart?.round).toBe(1);
    expect(h!.events[0]?.type).toBe('welcome');
    expect(h!.events.some((e) => e.type === 'roundStart')).toBe(true);
    expect(lobby.handOff()).toBeNull();                                 // once
  });

  it('a close of the socket ends the session once, with its code: 4007 is the lobby closed', () => {
    const { sock, lobby } = session();
    const ends: [number | null, string | null][] = [];
    lobby.onEnd((code, reason) => ends.push([code, reason]));
    sock.emit(welcome(1, 'seal'));
    lobby.poll();
    expect(ends).toEqual([]);
    sock.drop(4007, 'lobby closed');
    lobby.poll();
    lobby.poll();
    expect(ends).toEqual([[4007, 'The lobby closed']]);
  });

  it('FG-48b: the host\'s kick (FORGE_LOBBY_KICKED_CODE, 4030) ends the session with the kick\'s own words', () => {
    const { sock, lobby } = session();
    const ends: [number | null, string | null][] = [];
    lobby.onEnd((code, reason) => ends.push([code, reason]));
    sock.emit(welcome(1, 'seal'));
    sock.drop(FORGE_LOBBY_KICKED_CODE, 'kicked by the host');
    lobby.poll();
    expect(FORGE_LOBBY_KICKED_CODE).toBe(4030);
    expect(ends).toEqual([[4030, LOBBY_KICKED_WORDS]]);
    expect(LOBBY_KICKED_WORDS).toMatch(/host/i);
    expect(lobbyEndWords(LOBBY_KICKED_WORDS, true)).toBe(LOBBY_KICKED_WORDS);   // a guest's kick says the kick, not a lapsed pass
  });

  it('a refused hello ends the session with the room\'s reason', () => {
    const { sock, lobby } = session();
    const ends: [number | null, string | null][] = [];
    lobby.onEnd((code, reason) => ends.push([code, reason]));
    sock.emit({ type: 'refused', reason: 'not the host' });
    sock.drop(4003);
    lobby.poll();
    expect(ends).toEqual([[4003, 'not the host']]);
  });

  it('the ARMORY opens on the seat\'s own side, never a watcher\'s, and its exit goes to the room as `loadout`', async () => {
    const data = { archive: 'MP72', world: { arsenal: {}, valves: new Map() } } as unknown as ArmoryData;
    const { sock, deps } = session({ armory: () => Promise.resolve(data) });
    sock.emit(welcome(1, 'seal'));
    expect(deps.armory()).toBeNull();                                     // no lobby view yet: no side
    sock.emit({ type: 'gameLobby', seats: [seat(1, 'Guest-1', null, true)], countdown: null, launched: false });
    expect(deps.armory()).toBeNull();                                     // a watcher
    sock.emit({ type: 'gameLobby', seats: [seat(1, 'Guest-1', 'terrorist', true)], countdown: null, launched: false });
    const a = deps.armory()!;
    expect(a.side).toBe('terrorist');
    expect(await a.data).toBe(data);
    a.send({ type: 2, kit: [] as never, picks: [{ slot: 0, id: 7 }, { slot: 1, id: 9 }] });
    expect(sock.sent.at(-1)).toEqual({ type: 'loadout', picks: [{ slot: 0, id: 7 }, { slot: 1, id: 9 }], char: 2 });
  });

  it('LEAVE and the window\'s close are the page\'s', () => {
    const { deps, closes } = session();
    deps.close();
    expect(closes()).toBe(1);
  });
});

describe('FORGE lobby: a guest stores nothing (the owner\'s word, 2026-10-14, FG.R21)', () => {
  it('a guest\'s create, join, chat and ARMORY leave no storage, no cookie, no loadout PUT and no ticket in the address', async () => {
    const f = fakeFetch([{ status: 201, body: { id: 'L1', hostTicket: 'SECRET-HOST', lobby: summary } }]);
    const made = await createLobby(BASE, 'BOXES', layout(), null, f.fetch);
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const s = seated({ hostTicket: made.hostTicket });
    const data = { archive: 'MP72', world: { arsenal: {}, valves: new Map() } } as unknown as ArmoryData;
    const lobby = new ForgeLobbySession(s.client, { title: () => ({ name: 'BOXES', map: 'MP72', players: 8 }), armoryData: () => Promise.resolve(data) });
    const deps = lobby.deps(document, () => undefined);
    s.sock.emit(welcome(1, 'seal'));
    s.sock.emit({ type: 'gameLobby', seats: [seat(1, 'Guest-1', 'seal', true)], countdown: null, launched: false });
    deps.chat('hello', false);
    deps.armory()!.send({ type: 1, kit: [] as never, picks: [{ slot: 0, id: 3 }] });
    const address = addressWithLobby('https://forge.test/forge?devmode', made.id);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    expect(f.calls.every((c) => !c.url.includes('/lobby/loadout'))).toBe(true);
    expect(f.calls.every((c) => c.method !== 'PUT')).toBe(true);
    expect(address).not.toContain('SECRET-HOST');
    expect(JSON.stringify(s.sock.sent.slice(1))).not.toContain('SECRET-HOST');   // the host ticket rides the hello only
    expect(s.sock.sent.filter((e) => (e as { type: string }).type === 'loadout')).toEqual([{ type: 'loadout', picks: [{ slot: 0, id: 3 }], char: 1 }]);
  });

  it('the popup\'s window place is a listed page key (FG-27\'s report: `pageStore.ts` PAGE_SETTING_KEYS)', () => {
    expect(PAGE_SETTING_KEYS).toContain(FORGE_LOBBY_WINDOW_KEY);
  });
});

describe('FORGE lobby: the address and the archives a joiner needs', () => {
  // The lobby links plan (the merge controller's scope (ii), 2026-10-23): the link is the path `/forge/lobby/<id>`; an old
  // `?lobby=<id>` is still read, and the forge's own replaceState on the join rewrites it to the path.
  it('reads /forge/lobby/<id> (and an old ?lobby=<id>) and writes the path, keeping the rest of the address', () => {
    expect(lobbyIdOf('?devmode&lobby=Abc_-9')).toBe('Abc_-9');
    expect(lobbyIdOf('?lobby=../x')).toBeNull();
    expect(lobbyIdOf('?devmode')).toBeNull();
    expect(lobbyIdOf('', '/forge/lobby/Abc_-9')).toBe('Abc_-9');
    expect(lobbyIdOf('?devmode', '/s2u/forge/lobby/L1/')).toBe('L1');
    expect(lobbyIdOf('?lobby=Q1', '/forge/lobby/P1')).toBe('P1');              // the path wins
    expect(lobbyIdOf('', '/forge/lobby/..')).toBeNull();
    expect(lobbyIdOf('', '/forge')).toBeNull();
    expect(addressWithLobby('https://h.test/forge?devmode#x', 'L1')).toBe('https://h.test/forge/lobby/L1?devmode#x');
    expect(addressWithLobby('https://h.test/forge?lobby=L1&disc', null)).toBe('https://h.test/forge?disc');
    expect(addressWithLobby('https://h.test/forge?lobby=L1', null)).toBe('https://h.test/forge');
    expect(addressWithLobby('https://h.test/forge?lobby=L0', 'L1')).toBe('https://h.test/forge/lobby/L1');   // the old form, rewritten
    expect(addressWithLobby('https://h.test/forge/lobby/L1?disc', null)).toBe('https://h.test/forge?disc');
    expect(addressWithLobby('https://h.test/s2u/forge/lobby/L0/', 'L1')).toBe('https://h.test/s2u/forge/lobby/L1');
    expect(addressWithLobby('https://h.test/other?x', 'L1')).toBe('https://h.test/other?x&lobby=L1');   // not the forge's path: the query
  });

  it('names every archive the layout draws from that this disc lacks: the base\'s, then the pieces\'', () => {
    const l = layout();
    expect(missingArchives(l, new Set(['MP72', 'MP2']))).toEqual([]);
    expect(missingArchives(l, new Set(['MP2']))).toEqual(['MP72']);
    expect(missingArchives(l, new Set())).toEqual(['MP72', 'MP2']);
    expect(missingArchives({ ...emptyLayout({ kind: 'blank', library: 'M51' }), pieces: [] }, new Set(['MP2']))).toEqual(['M51']);
  });

  it('the ARMORY\'s exit as the room\'s loadout request (protocol 7 and 9)', () => {
    expect(loadoutOf({ type: 4, kit: [] as never, picks: [{ slot: 2, id: 11 }] })).toEqual({ type: 'loadout', picks: [{ slot: 2, id: 11 }], char: 4 });
  });
});

/**
 * FG-45 (FG.R24; a product-track adaptation, no original): the lobby's visibility as the client speaks it -- the
 * create's `listed` (false unless asked) and `PATCH /lobby/forge/lobby/<id>` `{ listed }` with the host's proof (its
 * ticket in `X-Forge-Host`, the bearer when signed in), as `closeLobby` proves it. No game wire is touched.
 */
describe('FG-45: the lobby\'s visibility (forgeLobbyHttp.ts `listed`, the PATCH)', () => {
  it('the create sends `listed`: false unless asked, true when asked; a stale bearer\'s retry keeps it', async () => {
    const ok = { status: 201, body: { id: 'L1', hostTicket: 'HT', lobby: { ...summary, listed: true, inMatch: false } } };
    const f = fakeFetch([ok, ok, { status: 401 }, ok]);
    await createLobby(BASE, 'BOXES', layout(), null, f.fetch);
    const shown = await createLobby(BASE, 'BOXES', layout(), null, f.fetch, { listed: true });
    expect(shown).toMatchObject({ ok: true, lobby: { listed: true, inMatch: false } });
    await createLobby(BASE, 'BOXES', layout(), 'DEAD', f.fetch, { listed: true });
    expect(f.calls.map((c) => (c.body as { listed?: unknown }).listed)).toEqual([false, true, true, true]);
  });

  it('setListed: PATCH /lobby/forge/lobby/<id> with exactly { listed }, the host ticket in X-Forge-Host, the bearer when signed in', async () => {
    const f = fakeFetch([{ status: 200, body: { ...summary, listed: true, inMatch: false } }, { status: 200, body: { ...summary, listed: false, inMatch: true } }]);
    expect(await setListed(BASE, 'L1', true, 'HT', 'TICKET', f.fetch)).toEqual({ ok: true, listed: true, lobby: { ...summary, listed: true, inMatch: false } });
    expect(f.calls[0]).toMatchObject({ url: `${BASE}/lobby/forge/lobby/L1`, method: 'PATCH', body: { listed: true } });
    expect(f.calls[0]!.headers['x-forge-host']).toBe('HT');
    expect(f.calls[0]!.headers['authorization']).toBe('Bearer TICKET');
    expect(f.calls[0]!.headers['content-type']).toMatch(/^application\/json/);
    expect(await setListed(BASE, 'L1', false, 'HT', null, f.fetch)).toMatchObject({ ok: true, listed: false });
    expect(f.calls[1]!.body).toEqual({ listed: false });
    expect(f.calls[1]!.headers['authorization']).toBeUndefined();
  });

  it('setListed\'s refusals in words of their own; an id that is no id never asked; an answer not of the shape is none', async () => {
    const words: string[] = [];
    for (const status of [400, 401, 403, 404, 413]) {
      const a = await setListed(BASE, 'L1', true, 'HT', null, fakeFetch([{ status }]).fetch);
      if (a.ok) throw new Error('answered');
      expect(a.status).toBe(status);
      words.push(a.words);
    }
    expect(words[2]).toMatch(/host/i);                                    // 403: only the host changes it
    expect(words[0]).not.toMatch(/layout/);                               // not the create's words
    expect(await setListed(BASE, 'L1', true, 'HT', null, (async () => { throw new TypeError('offline'); }) as typeof fetch)).toMatchObject({ ok: false, status: 0 });
    const never = fakeFetch([]);
    expect((await setListed(BASE, 'not/an id', true, 'HT', null, never.fetch)).ok).toBe(false);
    expect(never.calls).toHaveLength(0);
    expect(await setListed(BASE, 'L1', true, 'HT', null, fakeFetch([{ status: 200, body: { id: 'L1' } }]).fetch)).toMatchObject({ ok: false, status: 200 });
  });
});

/**
 * FG-34 (the online lane's `NetOptions.forge` and `forgeAccount`, on `main` with online checkpoint 9): the forge opens its
 * lobby's socket with the client's own options, no first-frame wrapper of its own.
 */
describe('FG-34: the lobby socket is NetClient\'s own forge option', () => {
  it('lobbyClient.ts hands NetClient `forge` and `forgeAccount`, and wraps no frame', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/forge/lobbyClient.ts'), 'utf8');
    expect(src).not.toMatch(/function forgeHelloSocket/);
    expect(src).toMatch(/new NetClient\(\{[^}]*forge,[^}]*forgeAccount: o\.ticket \?\? null/);
  });
});

/**
 * FG-38 (OT.R55, FG.R21; FG-28's account-backed guest, a product-track adaptation): the server answers a guest's ticket
 * and name -- at a guest host's create, and at `POST /lobby/forge/lobby/<id>/guest` for a joiner -- and the page keeps
 * them in this module's objects only: the hello's own `ticket` carries the guest's (a joiner's hello no `forge.ticket`),
 * nothing else does. The owner's two clauses: forge lobbies only; nothing of a guest on the memory card (R6).
 */
describe('FG-38: the guest\'s pass, in memory only', () => {
  const PASS = { ticket: 'GUEST-TICKET-SECRET', name: 'Guest-7' };

  it('a guest host\'s create carries its pass; a signed-in one\'s none; a stale bearer\'s retry carries one', async () => {
    const g = await createLobby(BASE, 'BOXES', layout(), null, fakeFetch([{ status: 201, body: { id: 'L1', hostTicket: 'HT', lobby: summary, guest: PASS } }]).fetch);
    expect(g).toMatchObject({ ok: true, guest: true, pass: PASS });
    const s = await createLobby(BASE, 'BOXES', layout(), 'TICKET', fakeFetch([{ status: 201, body: { id: 'L1', hostTicket: 'HT', lobby: summary } }]).fetch);
    expect(s).toMatchObject({ ok: true, guest: false, pass: null });
    const stale = await createLobby(BASE, 'BOXES', layout(), 'DEAD', fakeFetch([{ status: 401 }, { status: 201, body: { id: 'L1', hostTicket: 'HT', lobby: summary, guest: PASS } }]).fetch);
    expect(stale).toMatchObject({ ok: true, guest: true, stale: true, pass: PASS });
    // A pass not of the shape is none (a server without accounts sends none: FG.R21's lobby seat).
    const odd = await createLobby(BASE, 'BOXES', layout(), null, fakeFetch([{ status: 201, body: { id: 'L1', hostTicket: 'HT', lobby: summary, guest: { ticket: 7 } } }]).fetch);
    expect(odd).toMatchObject({ ok: true, pass: null });
  });

  it('a joiner asks its pass: POST /lobby/forge/lobby/<id>/guest with no bearer and no body; none from a server without accounts', async () => {
    const f = fakeFetch([{ status: 200, body: { guest: PASS } }, { status: 200, body: { guest: null } }, { status: 404 }]);
    expect(await askGuest(BASE, 'L1', f.fetch)).toEqual({ ok: true, pass: PASS });
    expect(f.calls[0]).toMatchObject({ url: `${BASE}/lobby/forge/lobby/L1/guest`, method: 'POST', body: null });
    expect(f.calls[0]!.headers['authorization']).toBeUndefined();
    expect(await askGuest(BASE, 'L1', f.fetch)).toEqual({ ok: true, pass: null });
    expect(await askGuest(BASE, 'L1', f.fetch)).toMatchObject({ ok: false, status: 404 });
    expect((await askGuest(BASE, 'not/an id', fakeFetch([]).fetch)).ok).toBe(false);
    expect(await askGuest(BASE, 'L1', (async () => { throw new TypeError('offline'); }) as typeof fetch)).toMatchObject({ ok: false, status: 0 });
  });

  it('FG-28\'s refusals in words of their own (limited 429, full and names 503), at the join and at the create', async () => {
    const words: string[] = [];
    for (const [status, refused] of [[429, 'limited'], [503, 'full'], [503, 'names']] as const) {
      const j = await askGuest(BASE, 'L1', fakeFetch([{ status, body: { refused } }]).fetch);
      const c = await createLobby(BASE, 'BOXES', layout(), null, fakeFetch([{ status, body: { refused } }]).fetch);
      if (j.ok || c.ok) throw new Error('answered');
      expect([j.status, c.status]).toEqual([status, status]);
      expect(c.words).toBe(j.words);
      words.push(j.words);
    }
    expect(new Set(words).size).toBe(3);
    expect(words[0]).toMatch(/guest/i);
    // The lobbies' own 503 (no guest refusal in the body) keeps its words.
    const lobbies = await createLobby(BASE, 'BOXES', layout(), null, fakeFetch([{ status: 503 }]).fetch);
    expect(lobbies.ok === false && lobbies.words).toMatch(/lobbies are full/);
  });

  it('R4: a guest\'s seat refused for its lapsed ticket says so; anything else keeps the room\'s words', () => {
    expect(lobbyEndWords('not logged in', true)).toBe(GUEST_PASS_LAPSED);
    expect(GUEST_PASS_LAPSED).toMatch(/60 s/);
    expect(lobbyEndWords('not logged in', false)).toBe('not logged in');
    expect(lobbyEndWords('The lobby closed', true)).toBe('The lobby closed');
    expect(lobbyEndWords(null, true)).toBeNull();
  });

  it('item 7: a guest\'s create, join, chat and ARMORY -- no storage, no cookie, no PUT; its ticket in no address and in no frame but the hello', async () => {
    const f = fakeFetch([
      { status: 201, body: { id: 'L1', hostTicket: 'SECRET-HOST', lobby: summary, guest: PASS } },
      { status: 200, body: { guest: { ticket: 'JOINER-TICKET-SECRET', name: 'Guest-8' } } },
      { status: 204 },
    ]);
    const made = await createLobby(BASE, 'BOXES', layout(), null, f.fetch);
    const asked = await askGuest(BASE, 'L1', f.fetch);
    if (!made.ok || !made.pass || !asked.ok || !asked.pass) throw new Error('no pass');
    // The host's hello: the host ticket in `forge`, its guest's ticket as the hello's own; the joiner's: its ticket alone.
    const host = seated({ hostTicket: made.hostTicket, ticket: made.pass.ticket });
    const joiner = seated({ ticket: asked.pass.ticket });
    expect(host.sock.sent[0]).toMatchObject({ type: 'hello', forge: { id: 'L1', ticket: 'SECRET-HOST' }, ticket: PASS.ticket });
    expect(joiner.sock.sent[0]).toMatchObject({ type: 'hello', forge: { id: 'L1' }, ticket: 'JOINER-TICKET-SECRET' });
    expect((joiner.sock.sent[0] as { forge: Record<string, unknown> }).forge).toEqual({ id: 'L1' });
    const data = { archive: 'MP72', world: { arsenal: {}, valves: new Map() } } as unknown as ArmoryData;
    for (const [s, id] of [[host, 1], [joiner, 2]] as const) {
      const lobby = new ForgeLobbySession(s.client, { title: () => ({ name: 'BOXES', map: 'MP72', players: 8 }), armoryData: () => Promise.resolve(data) });
      const deps = lobby.deps(document, () => undefined);
      s.sock.emit(welcome(id, 'seal'));
      s.sock.emit({ type: 'gameLobby', seats: [seat(1, 'Guest-7', 'seal', true), seat(2, 'Guest-8', 'seal')], countdown: null, launched: false });
      deps.chat('hello', false);
      deps.send('lobbyReady');
      deps.armory()!.send({ type: 1, kit: [] as never, picks: [{ slot: 0, id: 3 }] });
    }
    expect(await closeLobby(BASE, 'L1', made.hostTicket, null, f.fetch)).toBe(true);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    expect(f.calls.every((c) => c.method !== 'PUT' && !c.url.includes('/lobby/loadout'))).toBe(true);
    for (const t of [PASS.ticket, 'JOINER-TICKET-SECRET', PASS.name]) {
      expect(f.calls.every((c) => !c.url.includes(t) && !JSON.stringify(c.headers).includes(t) && !JSON.stringify(c.body).includes(t)), t).toBe(true);
      expect(addressWithLobby('https://forge.test/forge?devmode', made.id)).not.toContain(t);
      for (const s of [host, joiner]) expect(JSON.stringify(s.sock.sent.slice(1)), t).not.toContain(t);
    }
  });
});

/**
 * FG-38 R6 (FG-28's fresh review; the owner's clause 2, nothing of a guest on the card): the page hands the guest's
 * ticket and name to nothing but its own lobby -- no import of the persona, the card's save or edits, no `MP_NAME_KEY`,
 * no page setting written with them, no bearer of a guest's on the lobby's close. A scan of the page's calls.
 */
describe('FG-38 R6: the forge page hands a guest\'s pass to its lobby alone', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const page = readFileSync(resolve(here, '../../src/forge/page.ts'), 'utf8');
  const client = readFileSync(resolve(here, '../../src/forge/lobbyClient.ts'), 'utf8');
  const imports = (src: string): string[] => [...src.matchAll(/^import[^;]*?from '([^']+)';/gms)].map((m) => m[1]!);

  it('neither file imports the persona, the card\'s save or edits, or the card package; neither names MP_NAME_KEY', () => {
    for (const src of [page, client]) {
      for (const from of imports(src)) expect(from, from).not.toMatch(/personaHost|cardSave|cardEdits|cardProfileEdits|modern\/profile|@s2u\/card|console\/adapters\/card/);
      expect(src).not.toMatch(/MP_NAME_KEY|s2u\.mp\.name/);
    }
    // The lobby client reads no session, no connection host and no page store: it is handed what it sends.
    expect(imports(client).filter((f) => /modern\/session|connectHost|pageStore/.test(f))).toEqual([]);
  });

  it('the pass reaches only the lobby\'s hello: no page setting written with it, the session only read, the close carries no guest\'s bearer', () => {
    const lines = page.split('\n');
    const code = lines.filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l));
    const passLines = code.filter((l) => /guestPass|\.pass\b/.test(l));
    expect(passLines.length).toBeGreaterThan(0);
    // Each line naming a pass: its ask, its refusal said (no pass kept), or the lobby's entry -- whose hello alone carries it.
    // FG-48a: and a locked lobby's entry (`enterLocked`), whose bearer is the seat's own -- the pass, as in the hello; its
    // review's F2: a fresh pass (a lapsed one renewed once) is that bearer and that hello's ticket, and nothing else.
    for (const l of passLines) {
      expect(l, l).toMatch(/^\s*((await )?enterLobby\(\{|const guestPass = (ticket \? null : )?await askGuest\(|if \(guestPass && !guestPass\.ok\) \{ ownLayoutBack\(\); return stop\(|let seatTicket = ticket \?\? guestPass\?\.pass\?\.ticket \?\? null;|return fresh\.pass \? \{ ok: true, bearer: fresh\.pass\.ticket \})/);
    }
    const join = page.slice(page.indexOf('const joinLobby = '), page.indexOf('lobbyBtn.addEventListener'));
    const joinCode = join.split('\n').filter((x) => !/^\s*(\*|\/\/)/.test(x));
    for (const l of joinCode.filter((x) => /\bbearer\b/.test(x))) {
      expect(l, l).toMatch(/enter: \(password, bearer\) => enterLocked\(lobbyBase\(\), id, password, bearer\),|return fresh\.pass \? \{ ok: true, bearer: fresh\.pass\.ticket \}|seatTicket = joined\.bearer;/);
    }
    // The seat's ticket: its own, the locked lobby's entry, then the hello alone.
    for (const l of joinCode.filter((x) => /\bseatTicket\b/.test(x))) {
      expect(l, l).toMatch(/let seatTicket = |if \(!seatTicket\)|await joinLockedLobby\(got\.lobby\.name, seatTicket, \{|seatTicket = joined\.bearer;|enterLobby\(\{[^}]*ticket: seatTicket,|const placed = seatTicket \? await askForgeSeat\(lobbyBase\(\), id, seatTicket\) : null;/);
    }
    // LATER 275: a placed lobby's seat is asked once, by the seat's own ticket, and handed to the entry alone.
    expect(joinCode.filter((x) => /askForgeSeat\(/.test(x))).toHaveLength(1);
    for (const l of joinCode.filter((x) => /\bplaced\b/.test(x))) {
      expect(l, l).toMatch(/const placed = seatTicket \? await askForgeSeat\(|if \(placed && !placed\.ok\) \{ ownLayoutBack\(\); return stop\(|enterLobby\(\{[^}]*seat: placed\?\.seat \?\? null/);
    }
    // The entry hands the ticket to `openLobbySocket` alone (the hello's `ticket`).
    const enter = page.slice(page.indexOf('const enterLobby = '), page.indexOf('const createLobbyNow = '));
    expect([...enter.matchAll(/o\.ticket/g)]).toHaveLength(1);
    expect(enter).toMatch(/openLobbySocket\(\{[^}]*ticket: o\.ticket/);
    // LATER 275: the placed lobby's token goes to `openLobbySocket` alone (the hello's `token`), at the door it was signed for.
    expect([...enter.matchAll(/\.token\b/g)]).toHaveLength(1);
    expect(enter).toMatch(/openLobbySocket\(\{[^}]*token: sock\.token/);
    for (const l of code.filter((x) => /writeKey\(|pageSettings\.set\(|localStorage|sessionStorage|document\.cookie/.test(x))) {
      expect(l, l).not.toMatch(/ticket|guest|pass/i);
    }
    for (const m of page.matchAll(/pageSession\([^)]*\)\.(\w+)\(/g)) expect(['ticket', 'account'], m[0]).toContain(m[1]);
    // FG-48c: the close's and the LEAVE's proof is `lobbyHostProof`'s (lobbyPage.test runs it: a guest creator's pass is
    // never its bearer; a guest successor's pass is, the only proof it has).
    expect(page).toMatch(/const p = l\.ended \? null : lobbyHostProof\(l, l\.session\.me\(\)\);/);
    expect(page).toMatch(/closeLobby\(lobbyBase\(\), l\.id, p\.hostTicket, p\.bearer\)/);
    expect(page).toMatch(/handOnLobby\(lobbyBase\(\), l\.id, p\.hostTicket, p\.bearer\)/);
  });
});

/**
 * FG-45's review F3: a signed-in host whose sign-in went stale is answered 401 on the PATCH and the DELETE before its
 * host ticket is read (`forgeLobbyHttp.ts`: a bearer naming no session is 401, never a guest). The host ticket alone
 * proves the host, so the client asks once more without the bearer. Without a bearer a 401 is not asked again.
 */
describe('FG-45 F3: a stale bearer on the host\'s PATCH and DELETE', () => {
  it('setListed: a 401 with a bearer is asked once more with the host ticket alone', async () => {
    const f = fakeFetch([{ status: 401 }, { status: 200, body: { ...summary, listed: true, inMatch: false } }]);
    expect(await setListed(BASE, 'L1', true, 'HT', 'DEAD', f.fetch)).toMatchObject({ ok: true, listed: true });
    expect(f.calls.map((c) => [c.method, c.headers['authorization'], c.headers['x-forge-host']])).toEqual([['PATCH', 'Bearer DEAD', 'HT'], ['PATCH', undefined, 'HT']]);
    expect(f.calls[1]!.body).toEqual({ listed: true });
    const twice = fakeFetch([{ status: 401 }, { status: 403 }]);
    expect(await setListed(BASE, 'L1', true, 'HT', 'DEAD', twice.fetch)).toMatchObject({ ok: false, status: 403 });
    expect(twice.calls).toHaveLength(2);                                    // once more, never a loop
    const bare = fakeFetch([{ status: 401 }, { status: 200, body: summary }]);
    expect(await setListed(BASE, 'L1', true, 'HT', null, bare.fetch)).toMatchObject({ ok: false, status: 401 });
    expect(bare.calls).toHaveLength(1);
  });

  it('closeLobby: a 401 with a bearer is asked once more with the host ticket alone', async () => {
    const f = fakeFetch([{ status: 401 }, { status: 204 }]);
    expect(await closeLobby(BASE, 'L1', 'HT', 'DEAD', f.fetch)).toBe(true);
    expect(f.calls.map((c) => [c.method, c.headers['authorization'], c.headers['x-forge-host']])).toEqual([['DELETE', 'Bearer DEAD', 'HT'], ['DELETE', undefined, 'HT']]);
    const bare = fakeFetch([{ status: 401 }, { status: 204 }]);
    expect(await closeLobby(BASE, 'L1', 'HT', null, bare.fetch)).toBe(false);
    expect(bare.calls).toHaveLength(1);
  });
});

/**
 * FG-48a (FG.R24; a product-track adaptation, no original): a lobby's password as the client speaks it -- the create's
 * optional `password`, `POST /lobby/forge/lobby/<id>/enter { password }` with the seat's bearer (an account's ticket or
 * FG-28's guest pass), and the host's `PATCH { password }` (or null) proved as `setListed` proves it. No game wire.
 */
describe('FG-48a: the lobby\'s password (forgeLobbyHttp.ts)', () => {
  it('the create sends `password` when one is given and none otherwise; a stale bearer\'s retry keeps it', async () => {
    const ok = { status: 201, body: { id: 'L1', hostTicket: 'HT', lobby: { ...summary, listed: false, inMatch: false, locked: true } } };
    const f = fakeFetch([ok, ok, { status: 401 }, ok]);
    await createLobby(BASE, 'BOXES', layout(), null, f.fetch);
    const locked = await createLobby(BASE, 'BOXES', layout(), null, f.fetch, { password: 'pw one' });
    expect(locked).toMatchObject({ ok: true, lobby: { locked: true } });
    await createLobby(BASE, 'BOXES', layout(), 'DEAD', f.fetch, { password: 'pw one' });
    expect(f.calls.map((c) => (c.body as { password?: unknown }).password)).toEqual([undefined, 'pw one', 'pw one', 'pw one']);
    expect('password' in (f.calls[0]!.body as object)).toBe(false);
  });

  it('enterLocked: POST /lobby/forge/lobby/<id>/enter with exactly { password } and the seat\'s bearer; 204 admitted', async () => {
    const f = fakeFetch([{ status: 204 }]);
    expect(await enterLocked(BASE, 'L1', 'pw one', 'GUEST-PASS', f.fetch)).toEqual({ ok: true });
    expect(f.calls[0]).toMatchObject({ url: `${BASE}/lobby/forge/lobby/L1/enter`, method: 'POST', body: { password: 'pw one' } });
    expect(f.calls[0]!.headers['authorization']).toBe('Bearer GUEST-PASS');
    expect(f.calls[0]!.headers['content-type']).toMatch(/^application\/json/);
  });

  it('enterLocked\'s refusals: a wrong password (403) said as one, the address\'s tries spent (429), no bearer never asked', async () => {
    const wrong = await enterLocked(BASE, 'L1', 'nope', 'T', fakeFetch([{ status: 403, body: { refused: 'password' } }]).fetch);
    expect(wrong).toMatchObject({ ok: false, status: 403, wrong: true });
    if (wrong.ok) throw new Error('answered');
    expect(wrong.words).toMatch(/password/i);
    const limited = await enterLocked(BASE, 'L1', 'nope', 'T', fakeFetch([{ status: 429 }]).fetch);
    expect(limited).toMatchObject({ ok: false, status: 429, wrong: false });
    if (limited.ok) throw new Error('answered');
    expect(limited.words).toMatch(/wait/i);
    const never = fakeFetch([]);
    expect(await enterLocked(BASE, 'L1', 'pw', null, never.fetch)).toMatchObject({ ok: false, status: 401, wrong: false });
    expect(await enterLocked(BASE, 'not/an id', 'pw', 'T', never.fetch)).toMatchObject({ ok: false, status: 404 });
    expect(never.calls).toHaveLength(0);
    expect(await enterLocked(BASE, 'L1', 'pw', 'T', (async () => { throw new TypeError('offline'); }) as typeof fetch)).toMatchObject({ ok: false, status: 0 });
  });

  it('setPassword: PATCH with exactly { password } (a string, or null to clear), the host ticket and the bearer as setListed', async () => {
    const f = fakeFetch([{ status: 200, body: { ...summary, listed: false, inMatch: false, locked: true } }, { status: 200, body: { ...summary, listed: false, inMatch: false, locked: false } }]);
    expect(await setPassword(BASE, 'L1', 'pw two', 'HT', 'TICKET', f.fetch)).toMatchObject({ ok: true, locked: true });
    expect(f.calls[0]).toMatchObject({ url: `${BASE}/lobby/forge/lobby/L1`, method: 'PATCH', body: { password: 'pw two' } });
    expect(f.calls[0]!.headers['x-forge-host']).toBe('HT');
    expect(f.calls[0]!.headers['authorization']).toBe('Bearer TICKET');
    expect(await setPassword(BASE, 'L1', null, 'HT', null, f.fetch)).toMatchObject({ ok: true, locked: false });
    expect(f.calls[1]!.body).toEqual({ password: null });
    const refused = await setPassword(BASE, 'L1', 'x', 'HT', null, fakeFetch([{ status: 403 }]).fetch);
    if (refused.ok) throw new Error('answered');
    expect(refused.words).toMatch(/host/i);
    expect(await setPassword(BASE, 'L1', 'x', 'HT', null, fakeFetch([{ status: 200, body: { id: 'L1' } }]).fetch)).toMatchObject({ ok: false, status: 200 });
  });
});

/**
 * FG-48b (FG.R24; a product-track adaptation, no original): the host's kick as the client speaks it -- `POST
 * /lobby/forge/lobby/<id>/kick { seat }`, proved as `setListed` proves the host (the host ticket, the bearer when signed
 * in, a stale bearer's 401 asked once more with the ticket alone); its refusals in words; a locked lobby's barred entry.
 */
describe('FG-48b: the host\'s kick (forgeLobbyHttp.ts)', () => {
  it('kickSeat: POST with exactly { seat }, the host ticket and the bearer; 204 done', async () => {
    const f = fakeFetch([{ status: 204 }]);
    expect(await kickSeat(BASE, 'L1', 3, 'HT', 'TICKET', f.fetch)).toEqual({ ok: true });
    expect(f.calls[0]).toMatchObject({ url: `${BASE}/lobby/forge/lobby/L1/kick`, method: 'POST', body: { seat: 3 } });
    expect(f.calls[0]!.headers['x-forge-host']).toBe('HT');
    expect(f.calls[0]!.headers['authorization']).toBe('Bearer TICKET');
    expect(f.calls[0]!.headers['content-type']).toMatch(/^application\/json/);
    // A stale bearer's 401: asked once more with the host ticket alone.
    const stale = fakeFetch([{ status: 401 }, { status: 204 }]);
    expect(await kickSeat(BASE, 'L1', 3, 'HT', 'DEAD', stale.fetch)).toEqual({ ok: true });
    expect(stale.calls.map((c) => c.headers['authorization'] ?? null)).toEqual(['Bearer DEAD', null]);
  });

  it('kickSeat\'s refusals in words: the host\'s own seat (400), not the host (403), the seat gone (404), the network (0); a bad id never asked', async () => {
    const words = async (status: number, body?: unknown): Promise<string> => {
      const a = await kickSeat(BASE, 'L1', 3, 'HT', null, fakeFetch([{ status, ...(body !== undefined ? { body } : {}) }]).fetch);
      if (a.ok) throw new Error('answered');
      return a.words;
    };
    expect(await words(400)).toMatch(/yourself|itself|own/i);
    expect(await words(403)).toMatch(/host/i);
    expect(await words(404, { refused: 'seat' })).toMatch(/left/i);
    expect(await words(404)).toMatch(/no such lobby/i);
    const never = fakeFetch([]);
    expect(await kickSeat(BASE, 'not/an id', 3, 'HT', null, never.fetch)).toMatchObject({ ok: false, status: 404 });
    expect(never.calls).toHaveLength(0);
    expect(await kickSeat(BASE, 'L1', 3, 'HT', null, (async () => { throw new TypeError('offline'); }) as typeof fetch)).toMatchObject({ ok: false, status: 0 });
  });

  it('a barred account\'s entry to a locked lobby says the kick (403 `barred`), and is no wrong password', async () => {
    const barred = await enterLocked(BASE, 'L1', 'pw', 'T', fakeFetch([{ status: 403, body: { refused: 'barred' } }]).fetch);
    expect(barred).toMatchObject({ ok: false, status: 403, wrong: false });
    if (barred.ok) throw new Error('answered');
    expect(barred.words).toMatch(/host/i);
  });
});

/**
 * FG-48c (FG.R24; a product-track adaptation, no original): the host's LEAVE as the client speaks it -- `POST
 * /lobby/forge/lobby/<id>/leave` (no body), proved as the PATCH is: the creator's host ticket and its bearer, or a
 * successor's bearer alone (no host ticket); 200 `{ handedOn }`. And the session's own `onLobby`, by which the page
 * learns its seat now carries the host's flag.
 */
describe('FG-48c: the host\'s LEAVE (forgeLobbyHttp.ts)', () => {
  it('handOnLobby: POST to the lobby\'s leave, no body; the creator\'s ticket and bearer; 200 { handedOn } answered', async () => {
    const f = fakeFetch([{ status: 200, body: { handedOn: true } }]);
    expect(await handOnLobby(BASE, 'L1', 'HT', 'TICKET', f.fetch)).toEqual({ ok: true, handedOn: true });
    expect(f.calls[0]).toMatchObject({ url: `${BASE}/lobby/forge/lobby/L1/leave`, method: 'POST', body: null });
    expect(f.calls[0]!.headers['x-forge-host']).toBe('HT');
    expect(f.calls[0]!.headers['authorization']).toBe('Bearer TICKET');
    expect(await handOnLobby(BASE, 'L1', 'HT', null, fakeFetch([{ status: 200, body: { handedOn: false } }]).fetch)).toEqual({ ok: true, handedOn: false });
    // A stale bearer's 401: asked once more with the host ticket alone.
    const stale = fakeFetch([{ status: 401 }, { status: 200, body: { handedOn: true } }]);
    expect(await handOnLobby(BASE, 'L1', 'HT', 'DEAD', stale.fetch)).toEqual({ ok: true, handedOn: true });
    expect(stale.calls.map((c) => c.headers['authorization'] ?? null)).toEqual(['Bearer DEAD', null]);
  });

  it('a successor\'s proof is its bearer alone: no host ticket header, and its 401 is not asked again (nothing to ask with)', async () => {
    const f = fakeFetch([{ status: 200, body: { handedOn: true } }]);
    expect(await handOnLobby(BASE, 'L1', null, 'TICKET', f.fetch)).toEqual({ ok: true, handedOn: true });
    expect('x-forge-host' in f.calls[0]!.headers).toBe(false);
    expect(f.calls[0]!.headers['authorization']).toBe('Bearer TICKET');
    const stale = fakeFetch([{ status: 401 }, { status: 200, body: { handedOn: true } }]);
    expect(await handOnLobby(BASE, 'L1', null, 'DEAD', stale.fetch)).toMatchObject({ ok: false, status: 401 });
    expect(stale.calls).toHaveLength(1);
    // The PATCH, the kick and the DELETE are proved the same way: the bearer alone.
    const k = fakeFetch([{ status: 204 }]);
    expect(await kickSeat(BASE, 'L1', 3, null, 'TICKET', k.fetch)).toEqual({ ok: true });
    expect('x-forge-host' in k.calls[0]!.headers).toBe(false);
    const d = fakeFetch([{ status: 204 }]);
    expect(await closeLobby(BASE, 'L1', null, 'TICKET', d.fetch)).toBe(true);
    expect(d.calls[0]!.headers['authorization']).toBe('Bearer TICKET');
  });

  it('handOnLobby\'s refusals: not the host (403) in words, an answer not understood, the network (0); a bad id never asked', async () => {
    const no = await handOnLobby(BASE, 'L1', 'HT', null, fakeFetch([{ status: 403 }]).fetch);
    expect(no).toMatchObject({ ok: false, status: 403 });
    if (no.ok) throw new Error('answered');
    expect(no.words).toMatch(/host/i);
    expect(await handOnLobby(BASE, 'L1', 'HT', null, fakeFetch([{ status: 200, body: { handedOn: 'yes' } }]).fetch)).toMatchObject({ ok: false, status: 200 });
    expect(await handOnLobby(BASE, 'L1', 'HT', null, fakeFetch([{ status: 404 }]).fetch)).toMatchObject({ ok: false, status: 404 });
    const never = fakeFetch([]);
    expect(await handOnLobby(BASE, 'not/an id', 'HT', null, never.fetch)).toMatchObject({ ok: false, status: 404 });
    expect(never.calls).toHaveLength(0);
    expect(await handOnLobby(BASE, 'L1', 'HT', null, (async () => { throw new TypeError('offline'); }) as typeof fetch)).toMatchObject({ ok: false, status: 0 });
  });

  it('the session\'s onLobby: each gameLobby told, `me()` already the seat\'s new flag when it is; let go, told no more', () => {
    const s = seated({ ticket: 'LOGIN' });
    const lobby = new ForgeLobbySession(s.client, { title: () => ({ name: 'BOXES', map: 'MP72', players: 8 }) });
    const seen: (boolean | null)[] = [];
    const off = lobby.onLobby(() => { seen.push(lobby.me()?.host ?? null); });
    s.sock.emit(welcome(2, 'terrorist'));
    s.sock.emit({ type: 'gameLobby', seats: [seat(1, 'Kilo', 'seal', true), seat(2, 'Lima', 'terrorist')], countdown: null, launched: false });
    s.sock.emit({ type: 'gameLobby', seats: [seat(2, 'Lima', 'terrorist', true)], countdown: null, launched: false });
    expect(seen).toEqual([false, true]);
    off();
    s.sock.emit({ type: 'gameLobby', seats: [seat(2, 'Lima', 'terrorist', true)], countdown: null, launched: false });
    expect(seen).toHaveLength(2);
  });
});

/**
 * LATER 275 (SA-7i's page half; product track, the transport -- a browser adaptation with no original): a forge lobby
 * central placed on a host is joined at that host's door with a forge token, as a placed game's page does (SA-6b). The
 * create's 201 carries the creator's `{ door, token }` (`forgeLobbyHttp.ts` `door`, `token`); a joiner asks its own at
 * `POST /lobby/forge/lobby/<id>/token` (body `{}`, the seat's bearer; 200 `{ door, token }`, 409 a lobby run on central
 * itself -- its `/ws` as before --, 503 `{ refused: 'not yet' }` ask again, 403 `{ refused }`, 401, 404). The hello at the
 * door carries `forge: { id }` and the token alone: no host ticket, no login ticket. Doors and tokens invented.
 */
describe('LATER 275: a placed lobby\'s door and forge token', () => {
  const DOOR = 'wss://firehuge.play.socom2legacy.com/g/41';
  const TOKEN = ['aGVhZGVy', 'Y2xhaW1z', 'c2ln'].join('.');
  const LOGIN = ['login', 'ticket'].join('-');
  const made = (extra: Record<string, unknown>) => fakeFetch([{ status: 201, body: { id: 'L1', hostTicket: 'HT', lobby: summary, ...extra } }]).fetch;
  const noWait = (): { wait: (ms: number) => Promise<void>; waits: number[] } => {
    const waits: number[] = [];
    return { waits, wait: async (ms) => { waits.push(ms); } };
  };

  it('createLobby keeps the seat when the 201 carries a door and a well-formed token, none when it carries neither', async () => {
    expect(await createLobby(BASE, 'BOXES', layout(), LOGIN, made({ door: DOOR, token: TOKEN }))).toMatchObject({ ok: true, seat: { door: DOOR, token: TOKEN } });
    expect(await createLobby(BASE, 'BOXES', layout(), LOGIN, made({}))).toMatchObject({ ok: true, seat: null });
    // A guest host's create carries its pass and its seat both.
    const g = await createLobby(BASE, 'BOXES', layout(), null, made({ guest: { ticket: 'G', name: 'Guest-1' }, door: DOOR, token: TOKEN }));
    expect(g).toMatchObject({ ok: true, guest: true, pass: { ticket: 'G', name: 'Guest-1' }, seat: { door: DOOR, token: TOKEN } });
  });

  /**
   * LATER 306 (LATER 275's after-the-fact review, the forge seat's; product track, defence in depth): a seat whose door or
   * token is present but not of its form -- half a seat, a door not a string or empty, a token empty or not a forge
   * token's envelope (`isForgeToken`, the game token's: central signs both alike) -- is no seat AND not "none": `seat:
   * null` means the page's own `/ws`, which central refuses for a placed lobby, and an empty token once fell back to the
   * ticket hello at the door. The create's is not ok in words, its lobby closed by the host ticket alone (else the host
   * holds a lobby it cannot enter: a signed-in host's next Create is 409); the joiner's is not ok.
   */
  const ODD = ['not', 'a', 'token'].join('-');
  const MALFORMED: Record<string, unknown>[] = [
    { door: DOOR }, { token: TOKEN }, { door: 7, token: TOKEN }, { door: DOOR, token: { t: 1 } }, { door: '', token: TOKEN },
    ...['', ODD, 'a.b', 'a.b.c d', `${TOKEN}.x`, 'a.b.', null].map((token) => ({ door: DOOR, token })), { door: null, token: TOKEN },
  ];

  it('LATER 306: createLobby -- a seat present but not of its form is not ok in words, the lobby closed by its host ticket alone', async () => {
    for (const extra of MALFORMED) {
      const f = fakeFetch([{ status: 201, body: { id: 'L1', hostTicket: 'HT', lobby: summary, ...extra } }, { status: 204 }]);
      const a = await createLobby(BASE, 'BOXES', layout(), LOGIN, f.fetch);
      expect(a, JSON.stringify(extra)).toMatchObject({ ok: false, status: 201 });
      if (a.ok) throw new Error('made');
      expect(a.words, JSON.stringify(extra)).toMatch(/not understood/i);
      expect(a.words, JSON.stringify(extra)).toMatch(/: the lobby was closed$/);
      expect(f.calls, JSON.stringify(extra)).toHaveLength(2);
      expect(f.calls[1], JSON.stringify(extra)).toMatchObject({ url: `${BASE}/lobby/forge/lobby/L1`, method: 'DELETE' });
      expect(f.calls[1]!.headers['x-forge-host']).toBe('HT');
      expect('authorization' in f.calls[1]!.headers).toBe(false);
    }
    // The close refused or unanswered: said too -- the lobby stays until the server's idle sweep.
    const refused = await createLobby(BASE, 'BOXES', layout(), LOGIN, fakeFetch([{ status: 201, body: { id: 'L1', hostTicket: 'HT', lobby: summary, door: DOOR, token: '' } }, { status: 403 }]).fetch);
    expect(refused).toMatchObject({ ok: false, status: 201 });
    if (refused.ok) throw new Error('made');
    expect(refused.words).toMatch(/could not be closed/i);
  });

  it('LATER 306: askForgeSeat -- a 200 whose seat is not of its form is not ok (never `seat: null`, the page\'s /ws)', async () => {
    for (const body of MALFORMED) {
      expect(await askForgeSeat(BASE, 'L1', LOGIN, fakeFetch([{ status: 200, body }]).fetch), JSON.stringify(body)).toMatchObject({ ok: false, status: 200 });
    }
  });

  it('LATER 306: isForgeToken is the game token\'s form (`../connectHost` `isGameToken`, which the client may not import)', () => {
    const long = `${'a'.repeat(GAME_TOKEN_CHARS_MAX - 4)}.b.c`;
    const samples: unknown[] = [TOKEN, '', 'x', 'a.b', 'a.b.c', 'a.b.c.d', 'a.b.', '.b.c', 'a+b.c.d', 'a.b.c d', 'A-_9.b_-.C', long, `${long}x`, 7, null, undefined, { t: 1 }];
    for (const v of samples) expect(isForgeToken(v), String(v).slice(0, 40)).toBe(isGameToken(v));
    expect(isForgeToken(TOKEN)).toBe(true);
    expect(isForgeToken('')).toBe(false);
  });

  it('LATER 306: openLobbySocket with a token given -- even an empty one -- sends the token form alone: never forge.ticket, never the login ticket', () => {
    for (const token of ['', ODD, TOKEN]) {
      const s = seated({ url: DOOR, token, ticket: LOGIN, hostTicket: 'HT' });
      const hello = s.sock.sent[0] as Record<string, unknown>;
      expect(hello['forge'], token).toEqual({ id: 'L1' });
      expect(hello['token'], token).toBe(token);
      expect('ticket' in hello, token).toBe(false);
      expect(JSON.stringify(hello), token).not.toMatch(/HT|login-ticket/);
    }
  });

  it('askForgeSeat: POST /lobby/forge/lobby/<id>/token with exactly {} and the seat\'s bearer; 200 the seat', async () => {
    const f = fakeFetch([{ status: 200, body: { door: DOOR, token: TOKEN } }]);
    expect(await askForgeSeat(BASE, 'L1', LOGIN, f.fetch)).toEqual({ ok: true, seat: { door: DOOR, token: TOKEN } });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toMatchObject({ url: `${BASE}/lobby/forge/lobby/L1/token`, method: 'POST' });
    expect(f.calls[0]!.body).toEqual({});
    expect(f.calls[0]!.headers['authorization']).toBe(`Bearer ${LOGIN}`);
    expect(f.calls[0]!.headers['content-type']).toMatch(/^application\/json/);
    expect('x-forge-host' in f.calls[0]!.headers).toBe(false);
  });

  it('409 (a lobby central runs itself) is no seat: the page\'s own socket, as before -- `npm run local`\'s joiner', async () => {
    expect(await askForgeSeat(BASE, 'L1', LOGIN, fakeFetch([{ status: 409 }]).fetch)).toEqual({ ok: true, seat: null });
  });

  it('503 `not yet` is asked again a bounded number of times, a second apart, then said in words', async () => {
    expect(FORGE_SEAT_RETRY_ADAPTATION).toEqual({ tries: 3, apartMs: 1000 });
    const later = fakeFetch([{ status: 503, body: { refused: 'not yet' } }, { status: 503, body: { refused: 'not yet' } }, { status: 200, body: { door: DOOR, token: TOKEN } }]);
    const w1 = noWait();
    expect(await askForgeSeat(BASE, 'L1', LOGIN, later.fetch, { wait: w1.wait })).toEqual({ ok: true, seat: { door: DOOR, token: TOKEN } });
    expect(later.calls).toHaveLength(3);
    expect(w1.waits).toEqual([1000, 1000]);
    const never = fakeFetch(Array.from({ length: 6 }, () => ({ status: 503, body: { refused: 'not yet' } })));
    const w2 = noWait();
    const a = await askForgeSeat(BASE, 'L1', LOGIN, never.fetch, { wait: w2.wait });
    expect(a).toMatchObject({ ok: false, status: 503 });
    if (a.ok) throw new Error('answered');
    expect(a.words).toMatch(/not ready|again/i);
    expect(never.calls).toHaveLength(3);
    expect(w2.waits).toEqual([1000, 1000]);
    // Another 503 (no `not yet`) is not asked again.
    const other = fakeFetch([{ status: 503 }, { status: 200, body: { door: DOOR, token: TOKEN } }]);
    expect(await askForgeSeat(BASE, 'L1', LOGIN, other.fetch, { wait: noWait().wait })).toMatchObject({ ok: false, status: 503 });
    expect(other.calls).toHaveLength(1);
  });

  it('403\'s refusals each in its own words (barred the kick\'s); 401, 404, the network, an answer not of the shape: not ok', async () => {
    const words = async (status: number, body?: unknown): Promise<string> => {
      const a = await askForgeSeat(BASE, 'L1', LOGIN, fakeFetch([{ status, ...(body !== undefined ? { body } : {}) }]).fetch, { wait: noWait().wait });
      if (a.ok) throw new Error(`answered ${status}`);
      expect(a.status).toBe(status);
      return a.words;
    };
    const barred = await words(403, { refused: 'barred' });
    expect(barred).toBe(LOBBY_KICKED_WORDS);
    const elsewhere = await words(403, { refused: 'elsewhere' });
    expect(elsewhere).toMatch(/guest pass/i);
    const password = await words(403, { refused: 'password' });
    expect(password).toMatch(/password/i);
    const notHost = await words(403, { refused: 'not the host' });
    expect(notHost).toMatch(/host/i);
    expect(new Set([barred, elsewhere, password, notHost]).size).toBe(4);
    expect(await words(401)).toMatch(/sign-in/i);
    expect(await words(404)).toMatch(/no such lobby/i);
    for (const body of [{ door: DOOR }, { token: TOKEN }, { door: 7, token: TOKEN }, { door: DOOR, token: 7 }, null, 'x']) {
      expect(await askForgeSeat(BASE, 'L1', LOGIN, fakeFetch([{ status: 200, body }]).fetch), JSON.stringify(body)).toMatchObject({ ok: false, status: 200 });
    }
    expect(await askForgeSeat(BASE, 'L1', LOGIN, (async () => { throw new TypeError('offline'); }) as typeof fetch)).toMatchObject({ ok: false, status: 0 });
  });

  it('an id that is no id, or no ticket, is never asked', async () => {
    const never = fakeFetch([]);
    expect(await askForgeSeat(BASE, 'not/an id', LOGIN, never.fetch)).toMatchObject({ ok: false, status: 404 });
    expect(await askForgeSeat(BASE, 'L1', '', never.fetch)).toMatchObject({ ok: false, status: 401 });
    expect(never.calls).toHaveLength(0);
  });

  it('openLobbySocket with a token: the socket at the door, the hello { forge: { id }, token } and no ticket anywhere', () => {
    const s = seated({ url: DOOR, token: TOKEN, ticket: LOGIN, hostTicket: 'HT' });
    expect(s.sock.url).toBe(DOOR);
    const hello = s.sock.sent[0] as Record<string, unknown>;
    expect(hello).toMatchObject({ type: 'hello', forge: { id: 'L1' }, token: TOKEN });
    expect(hello['forge']).toEqual({ id: 'L1' });
    expect('ticket' in hello).toBe(false);
    expect(JSON.stringify(hello)).not.toMatch(/ticket|HT|login-ticket/);
    // Without a token: today's hello, the host ticket in `forge` and the login's as its own (FG-34), no token.
    const local = seated({ ticket: LOGIN, hostTicket: 'HT' });
    expect(local.sock.url).toBe('wss://forge.test/ws');
    expect(local.sock.sent[0]).toMatchObject({ forge: { id: 'L1', ticket: 'HT' }, ticket: LOGIN });
    expect('token' in (local.sock.sent[0] as object)).toBe(false);
  });
});
