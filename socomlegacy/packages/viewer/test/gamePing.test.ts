// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CREATE_GAME_GENERIC_FIELD2, gameListRow } from '@s2u/ui';
import {
  DoorPingCache, GAME_PING_CACHE_MS_ADAPTATION, gameListPing, gameListPingCell, gamePingBand, gamePingMs,
} from '../src/gamePing';
import { liveRooms } from '../src/console/adapters/rooms';
import { pingBand, type LobbyGameView, type LobbyRoomView } from '../src/console/state';
import { fetchLobbySource } from '../src/modern/lobbies/data';
import { createSelection } from '../src/modern/lobbies/selection';
import { BASE, fakeFetch, fakeLauncher, fakeSession, game, lobbyFixture, room, signedInRoutes } from './modern/lobbies/fixtures';

/**
 * GAME-PING (product track, a browser adaptation; Craig's "go", 2026-10-31/11-01): a listed game's PING is the page's
 * own round trip to its room's host door (LATER 455's probe), banded by the original's bounds on GenericField2
 * (`FUN_002e2ce0` D:L184438-184452: under 300, under 600, else red), in the in-game game list and the console's rooms
 * list; the wire still carries 65000. Fake probes, clocks and doors; the door names are invented.
 */

const flushAll = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe('GAME-PING: the band from ms (the original\'s bounds)', () => {
  it('under 300 green (1), under 600 amber (2), else red (3)', () => {
    expect([0, 299, 300, 599, 600, 65000].map(gamePingBand)).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

describe('GAME-PING: the throttle and cache (per door)', () => {
  it('one probe out per door; a read inside GAME_PING_CACHE_MS_ADAPTATION answers the held value with no probe; past it, one more', async () => {
    let now = 0;
    const sent: string[] = [];
    let changed = 0;
    const cache = new DoorPingCache({ probe: async (d) => { sent.push(d); return 120; }, now: () => now, changed: () => { changed++; } });
    expect(cache.read('https://a.example')).toBeUndefined();
    expect(cache.read('https://a.example')).toBeUndefined();     // in flight: no second probe
    await flushAll();
    expect(sent).toEqual(['https://a.example']);
    expect(changed).toBe(1);
    now = GAME_PING_CACHE_MS_ADAPTATION - 1;
    expect(cache.read('https://a.example')).toBe(120);
    await flushAll();
    expect(sent).toHaveLength(1);
    now = GAME_PING_CACHE_MS_ADAPTATION;
    expect(cache.read('https://a.example')).toBe(120);            // the held value stands while the next is out
    cache.read('https://b.example');
    await flushAll();
    expect(new Set(sent)).toEqual(new Set(['https://a.example', 'https://b.example']));
    expect(sent).toHaveLength(3);
    expect(changed).toBe(2);                                       // the same answer for a: no redraw; b's first: one
  });

  it('a cleared cache drops an answer to a probe sent before it', async () => {
    let answer!: (ms: number) => void;
    const cache = new DoorPingCache({ probe: () => new Promise((r) => { answer = r; }), now: () => 0 });
    cache.read('https://a.example');
    cache.clear();
    answer(50);
    await flushAll();
    expect(cache.read('https://a.example')).toBeUndefined();
  });
});

describe('GAME-PING: no probe for an empty game; "--" (null) when unreachable', () => {
  it('a game with no players: undefined (the original\'s 0 stands) and nothing sent', async () => {
    const sent: string[] = [];
    const cache = new DoorPingCache({ probe: async (d) => { sent.push(d); return 10; }, now: () => 0 });
    expect(gamePingMs(cache, 'https://a.example', 0)).toBeUndefined();
    expect(gameListPingCell(cache, 'https://a.example', 0)).toBeUndefined();
    await flushAll();
    expect(sent).toEqual([]);
  });

  it("a door with no answer yet, or a failed probe: null (drawn --), never the red band; no door named: the original's band stands", async () => {
    const cache = new DoorPingCache({ probe: async () => null, now: () => 0 });
    expect(gamePingMs(cache, null, 3)).toBeUndefined();
    expect(gameListPingCell(cache, null, 3)).toBeUndefined();
    expect(gamePingMs(cache, 'https://a.example', 3)).toBeNull();
    await flushAll();
    expect(gamePingMs(cache, 'https://a.example', 3)).toBeNull();
    expect(gameListPingCell(cache, 'https://a.example', 3)).toBe(0);
    expect(pingBand({ pingMeasured: null })).toEqual(['none', '--', 0]);
  });
});

describe('GAME-PING: the in-game game list\'s cell (gameListPing, the mount\'s hook)', () => {
  it('the room\'s door probed, its band drawn; redraw asked when it answers; an empty game not probed', async () => {
    const sent: string[] = [];
    let redraws = 0;
    const ping = gameListPing((name) => (name === 'Channel 1' ? 'https://a.example' : null), { probe: async (d) => { sent.push(d); return 450; }, now: () => 0, changed: () => { redraws++; } });
    const busy = game(500, 'busy', 100, 2);
    expect(ping.cell('Channel 1', busy)).toBe(0);                  // not answered yet: no icon, not red
    await flushAll();
    expect(redraws).toBe(1);
    expect(ping.cell('Channel 1', busy)).toBe(2);                  // 450 ms: amber
    expect(ping.cell('Channel 1', game(501, 'empty', 100, 0))).toBeUndefined();   // the original's 0 stands
    expect(ping.cell('Elsewhere', busy)).toBeUndefined();          // no door named: the original's band
    await flushAll();
    expect(sent).toEqual(['https://a.example']);
  });
});

describe('GAME-PING review F2: the in-game list redrawn only when a band changes', () => {
  it('a new ms within the same band asks no redraw; a new band does; no answer after an unanswered read asks none', async () => {
    let now = 0;
    const answers = [100, 250, 450, null, null];
    let redraws = 0;
    const ping = gameListPing(() => 'https://a.example', { probe: async () => answers.shift() ?? null, now: () => now, changed: () => { redraws++; } });
    const busy = game(500, 'busy', 100, 2);
    const step = async (): Promise<void> => { ping.cell('Channel 1', busy); await flushAll(); now += GAME_PING_CACHE_MS_ADAPTATION; };
    await step();
    expect(redraws).toBe(1);                                       // 100: undefined (icon 0) -> green
    await step();
    expect(redraws).toBe(1);                                       // 250: still green, no redraw
    await step();
    expect(redraws).toBe(2);                                       // 450: amber
    await step();
    expect(redraws).toBe(3);                                       // no answer: amber -> icon 0
    await step();
    expect(redraws).toBe(3);                                       // still none: icon 0 both times
  });

  it('a door first unanswered draws icon 0 as before it was asked: no redraw', async () => {
    let redraws = 0;
    const ping = gameListPing(() => 'https://a.example', { probe: async () => null, now: () => 0, changed: () => { redraws++; } });
    ping.cell('Channel 1', game(500, 'busy', 100, 2));
    await flushAll();
    expect(redraws).toBe(0);
  });
});

describe('GAME-PING: the wire is the original\'s', () => {
  it('GenericField2 still 65000 sent, and the original\'s row of it still the red band', () => {
    expect(CREATE_GAME_GENERIC_FIELD2).toBe(65000);
    expect(gameListRow({ ...game(500, 'g', 100, 1), genericField2: 65000 })[5]).toBe(3);
  });
});

describe('GAME-PING: the console\'s rooms list', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });
  afterEach(() => { vi.useRealTimers(); });
  const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(10); };

  function rooms(ms: number | null) {
    const f = lobbyFixture();
    // Channel 2, Channel 1, Veterans, Medius Hidden (not drawn): each room's door beside the entries (central's `doors`).
    f.channels = {
      entries: [room(101, 'Channel 2', 1), room(100, 'Channel 1', 2), room(102, 'Veterans', 1, 64, { locked: true }), room(103, 'Medius Hidden', 0)],
      doors: ['https://a.example', 'https://b.example', null, 'https://c.example'],
    };
    f.games = { entries: [game(500, 'test$~Channel 1', 100, 2, { slots: 4, ping: 65000 }), game(502, 'hidden', 103, 3, { ping: 65000 }), { ...game(503, 'empty', 103, 0, { ping: 65000 }), endOfList: true }] };
    (f.members as { games: unknown[] }).games.push({ mediusWorldId: 502, name: 'hidden', room: 103, players: [] }, { mediusWorldId: 503, name: 'empty', room: 103, players: [] });
    const sent: string[] = [];
    const fetched = fakeFetch(signedInRoutes(f));
    const r = liveRooms(document, () => {}, {
      source: fetchLobbySource(BASE, fetched.fetch), session: fakeSession('signed-in'), launcher: fakeLauncher(), selection: createSelection(),
      ping: { probe: async (d) => { sent.push(d); return ms; }, now: () => Date.now() },
    });
    return { r, sent };
  }

  it('a game\'s row, its detail and its room\'s detail draw the measured band (not GenericField2\'s red); the empty game is not probed', async () => {
    const { r, sent } = rooms(120);
    await flush();
    const row = r.row('game:502')!;
    expect([row.pingMeasured, pingBand(row)]).toEqual([120, ['good', 'Good', 3]]);
    expect((r.game('game:500') as Extract<LobbyGameView, { kind: 'ok' }>).facts.find((x) => x.label === 'Ping')!.value).toBe('Good');
    expect((r.room('room:100') as Extract<LobbyRoomView, { kind: 'ok' }>).games[0]!.sub).toContain('Ping Good');
    expect(r.row('game:503')!.pingMeasured).toBeUndefined();
    expect(pingBand(r.row('game:503')!)[1]).toBe('No players');
    expect([...sent].sort()).toEqual(['https://b.example', 'https://c.example']);
    r.dispose();
  });

  it('review F3: a probe answering after dispose rebuilds and notifies nothing', async () => {
    const f = lobbyFixture();
    f.channels = { entries: [room(100, 'Channel 1', 2), { ...room(103, 'Medius Hidden', 0), endOfList: true }], doors: ['https://b.example', 'https://c.example'] };
    f.games = { entries: [{ ...game(502, 'hidden', 103, 3, { ping: 65000 }), endOfList: true }] };
    (f.members as { games: unknown[] }).games.push({ mediusWorldId: 502, name: 'hidden', room: 103, players: [] });
    const answers: ((ms: number) => void)[] = [];
    let notified = 0;
    const r = liveRooms(document, () => { notified++; }, {
      source: fetchLobbySource(BASE, fakeFetch(signedInRoutes(f)).fetch), session: fakeSession('signed-in'), launcher: fakeLauncher(), selection: createSelection(),
      ping: { probe: () => new Promise<number>((res) => { answers.push(res); }), now: () => Date.now() },
    });
    await flush();
    expect(answers).toHaveLength(1);
    expect(r.row('game:502')!.pingMeasured).toBeNull();
    r.dispose();
    const before = notified;
    answers[0]!(120);
    await flush();
    expect(notified).toBe(before);
    expect(r.row('game:502')!.pingMeasured).toBeNull();
  });

  it('a door with no answer: -- , not Poor', async () => {
    const { r } = rooms(null);
    await flush();
    expect(pingBand(r.row('game:502')!)).toEqual(['none', '--', 0]);
    expect((r.game('game:500') as Extract<LobbyGameView, { kind: 'ok' }>).facts.find((x) => x.label === 'Ping')!.value).toBe('--');
    r.dispose();
  });
});
