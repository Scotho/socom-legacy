// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MissionRecord } from '@s2u/ui';
import { LOBBY_WORDS, liveCustomMatches, type CustomDeps } from '../../../src/console/adapters/lobbies';
import { liveRooms, type RoomsDeps } from '../../../src/console/adapters/rooms';
import { clearServerDetails, noteServerDetail, serverDetailLine } from '../../../src/modern/report/serverDetail';
import { roomFull, type LobbyGameView, type LobbyRoomView } from '../../../src/console/state';
import {
  CUSTOM_MATCHES_PATH, MU_CUSTOM_MATCHES_TIMEOUT_MS_ADAPTATION, fetchCustomMatchSource, fetchLobbySource,
} from '../../../src/modern/lobbies/data';
import { MU_LOBBY_POLL_MS, MU_LOBBY_REQUEST_TIMEOUT_MS, MU_LOBBY_RETRY_MS } from '../../../src/modern/lobbies/poller';
import { createSelection } from '../../../src/modern/lobbies/selection';
import type { LauncherState } from '../../../src/modern/launcherState';
import { BASE, XSS_NAME, fakeFetch, fakeLauncher, fakeSession, game, lobbyFixture, room, signedInRoutes, type Answer } from '../../modern/lobbies/fixtures';

/**
 * CX-LOBBIES (the console launcher plan; OT.R60 (c)): the retired modern Lobbies section's rules, held on the console's
 * adapters. The rooms adapter (`src/console/adapters/rooms.ts`, the one rooms poll Home and Server read too) gives Browse
 * rooms the briefing rooms and each room's and game's detail (`room`, `game`): signed out the anonymous `/rooms` counts
 * and nothing to open; signed in a row per briefing room with its count, its lock and its ranks as text (MU-F3) and no
 * player's name, the names only in the detail and none for a private room or game; GAME DETAILS through `lobbyGameDetails`;
 * a sign-out and a lost session drop the signed-in answers. The custom matches adapter (`src/console/adapters/lobbies.ts`)
 * reads the forge's listed lobbies (FG-46) only while its screen is shown and the tab visible, bounded by its own limit,
 * with the lock mark (FG-48a) and JOIN's address (`customMatchAddress`). Generated values only. A browser adaptation with
 * no original (OT.R28).
 */
beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});
afterEach(() => { vi.useRealTimers(); });

const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(10); };
const MISSIONS: MissionRecord[] = [{ number: 2, name: 'Frostfire', type: 5, multiplayer: true }, { number: 72, name: 'Blizzard', type: 1, multiplayer: true }];
const withMissions = (): LauncherState => ({ ...fakeLauncher('ready'), assets: () => ({ readMissions: async () => MISSIONS }) as never });

function rooms(routes: Record<string, Answer | Answer[]>, o: { signedIn?: boolean; launcher?: LauncherState } = {}) {
  const f = fakeFetch(routes);
  const session = fakeSession(o.signedIn ? 'signed-in' : 'signed-out');
  const selection = createSelection();
  const r = liveRooms(document, () => {}, { source: fetchLobbySource(BASE, f.fetch), session, launcher: o.launcher ?? fakeLauncher(), selection });
  return { f, session, selection, r };
}
const ok = <T extends { kind: string }>(v: T): Extract<T, { kind: 'ok' }> => {
  expect(v.kind).toBe('ok');
  return v as Extract<T, { kind: 'ok' }>;
};
const facts = (v: { facts: readonly { label: string; value: string }[] }): Record<string, string> => Object.fromEntries(v.facts.map((x) => [x.label, x.value]));

describe('the rooms adapter: signed out (the anonymous counts)', () => {
  it('a row per classic room with its counts; nothing to open, no bearer, no names route', async () => {
    const { f, r } = rooms(signedInRoutes());
    await flush();
    expect(r.list().map((x) => [x.name, x.n, x.kind])).toEqual([['Game in Frostfire', 3, undefined], ['Game in Vigilance', 0, undefined]]);
    expect(f.calls.map((c) => [new URL(c.url).pathname, c.auth])).toEqual([['/rooms', null]]);
    expect(r.room('room:100').kind).toBe('gone');
    expect(r.game('game:500').kind).toBe('gone');
    r.dispose();
  });
});

describe('the rooms adapter: signed in (the briefing rooms, their games, the names in the detail)', () => {
  it('the briefing rooms in the original list\'s order, each with its count, its lock and its games; a row carries no name', async () => {
    const { r } = rooms(signedInRoutes(), { signedIn: true });
    await flush();
    expect(r.list().map((x) => [x.id, x.kind, x.name, x.n, x.cap, x.lock ?? null, x.games])).toEqual([
      ['room:102', 'room', 'Veterans', 1, 64, 'Password', 1],
      ['room:100', 'room', 'Channel 1', 2, 64, null, 1],
      ['room:101', 'room', 'Channel 2', 1, 64, null, 0],
    ]);
    expect(JSON.stringify(r.list())).not.toContain('Alpha');                    // no names on a row (Q3's default)
    expect(JSON.stringify(r.list())).not.toContain(XSS_NAME);
    r.dispose();
  });

  it('a rank-limited room carries the original\'s rank names (MU-F3, as text); every rank leaves the slot empty', async () => {
    const f = lobbyFixture();
    f.channels = { entries: [room(100, 'Channel 1', 2, 64, { gf1: 0b0110 }), { ...room(101, 'Open', 1), endOfList: true }] };
    const { r } = rooms(signedInRoutes(f), { signedIn: true });
    await flush();
    const [open, limited] = r.list();
    expect(open!.ranks).toBeUndefined();
    expect(limited!.ranks).toEqual(['LIEUTENANT', 'LT. COMMANDER']);
    expect(facts(ok(r.room('room:100')))).toMatchObject({ Ranks: 'LIEUTENANT, LT. COMMANDER' });
    expect(facts(ok(r.room('room:101')))).toMatchObject({ Ranks: LOBBY_WORDS.everyRank });
    r.dispose();
  });

  it('a room\'s detail: its count and ranks, its games, its players by name (text, never markup)', async () => {
    const { r } = rooms(signedInRoutes(), { signedIn: true });
    await flush();
    const v = ok<LobbyRoomView>(r.room('room:100'));
    expect([v.name, v.locked, v.full]).toEqual(['Channel 1', false, false]);
    expect(facts(v)).toEqual({ Players: '2/64', Ranks: LOBBY_WORDS.everyRank });
    expect(v.games.map((g) => [g.id, g.name, g.locked, g.inProgress])).toEqual([['game:500', 'test', false, false]]);
    expect(v.games[0]!.sub).toBe('Frostfire · 2/12 players · 0/4 spectators · Ping Fair');   // before the disc: the name table's (MN-1, OT.R113)
    expect(v.players).toEqual({ kind: 'names', names: ['Alpha', XSS_NAME] });
    expect(ok<LobbyRoomView>(r.room('room:101')).games).toEqual([]);
    r.dispose();
  });

  it('a private room or game shows its lock and count, no names', async () => {
    const { r } = rooms(signedInRoutes(), { signedIn: true });
    await flush();
    const v = ok<LobbyRoomView>(r.room('room:102'));
    expect([v.locked, facts(v)['Players']]).toEqual([true, '1/64']);
    expect(v.players).toEqual({ kind: 'note', line: LOBBY_WORDS.privateRoom, private: true });
    expect(v.games.map((g) => [g.name, g.locked])).toEqual([['secret', true]]);
    expect(v.games[0]!.sub).toContain('Password');
    const g = ok<LobbyGameView>(r.game('game:501'));
    expect([g.locked, facts(g)['Players']]).toEqual([true, '1/16']);
    expect(g.players).toEqual({ kind: 'note', line: LOBBY_WORDS.privateGame, private: true });
    r.dispose();
  });

  it('a game\'s detail: its facts, GAME DETAILS through the original\'s reader, its players; its room named', async () => {
    const { r } = rooms(signedInRoutes(), { signedIn: true });
    await flush();
    const g = ok<LobbyGameView>(r.game('game:500'));
    expect([g.name, g.room, g.roomName, g.inProgress]).toEqual(['test', 'room:100', 'Channel 1', false]);
    expect(facts(g)).toMatchObject({ Players: '2/12', Status: LOBBY_WORDS.inLobby, Spectators: '0/4', Ping: 'Fair', Room: 'Channel 1' });
    expect(g.details.map((d) => [d.kind, d.label, d.value])).toEqual([
      ['fact', 'Map', 'Frostfire'], ['fact', 'Rounds', '0'], ['fact', 'Round time', '0 min'], ['fact', 'Friendly fire', 'Off'], ['fact', 'Respawn', 'Off'],
      ['note', LOBBY_WORDS.needsDisc, ''],
    ]);
    expect(g.players).toEqual({ kind: 'names', names: ['Alpha', XSS_NAME] });
    r.dispose();
  });

  it('with the disc: the map\'s name and the mode from the mission table; a play list the table lacks is Unavailable, no settings', async () => {
    const f = lobbyFixture();
    f.games = { entries: [game(600, 'set', 100, 1, { level: 2, rounds: 11, minutes: 6, eq: 1, rulesSet: 3 }), { ...game(601, 'odd', 100, 1, { level: 2, list: [99] }), endOfList: true }] };
    const { r } = rooms(signedInRoutes(f), { signedIn: true, launcher: withMissions() });
    await flush();
    expect(ok<LobbyGameView>(r.game('game:600')).details.map((d) => [d.label, d.value])).toEqual([
      ['Map', 'Frostfire'], ['Mode', 'Suppression'], ['Rounds', '11'], ['Round time', '6 min'], ['Friendly fire', 'On'], ['Respawn', 'On'], ['Weapons', 'Pistols only'],
    ]);
    expect(ok<LobbyGameView>(r.game('game:601')).details.map((d) => [d.kind, d.label, d.value])).toEqual([
      ['fact', 'Map', 'Frostfire'], ['fact', 'Status', 'Unavailable'], ['note', LOBBY_WORDS.unavailable, ''],      // the section's, as unavailable; named by the name table (MN-1)
    ]);
    expect(ok<LobbyRoomView>(r.room('room:100')).games[0]!.sub).toBe('Frostfire · Suppression · 1/16 players · Ping Good');
    r.dispose();
  });

  it('a round under way (WorldActive) is "In progress" on its row and in its detail (MU_LOBBY_IN_PROGRESS_ADAPTATION)', async () => {
    const f = lobbyFixture();
    f.games = { entries: [{ ...game(500, 'live', 100, 2, { worldStatus: 2 }), endOfList: true }] };
    const { r } = rooms(signedInRoutes(f), { signedIn: true });
    await flush();
    const row = ok<LobbyRoomView>(r.room('room:100')).games[0]!;
    expect([row.inProgress, row.sub]).toEqual([true, `Frostfire · ${LOBBY_WORDS.inProgress} · 2/16 players · Ping Good`]);   // the section's: by the name
    expect(facts(ok<LobbyGameView>(r.game('game:500')))['Status']).toBe(LOBBY_WORDS.inProgress);
    r.dispose();
  });

  it('the names route refused but 401: the counts stand, the names said unavailable', async () => {
    const { r } = rooms({ ...signedInRoutes(), '/modern/lobby-members': { status: 403 } }, { signedIn: true });
    await flush();
    expect(r.list()).toHaveLength(3);
    expect(ok<LobbyRoomView>(r.room('room:100')).players).toEqual({ kind: 'note', line: LOBBY_WORDS.noNames, private: false });
    r.dispose();
  });

  it('a game whose room the list does not draw is a row of its own after the rooms, so every game is reachable', async () => {
    const f = lobbyFixture();
    f.games = { entries: [{ ...game(700, 'stray', 103, 1), endOfList: true }] };     // in "Medius Hidden", not drawn
    f.members = { rooms: [], games: [] };
    const { r } = rooms(signedInRoutes(f), { signedIn: true });
    await flush();
    expect(r.list().map((x) => [x.id, x.kind])).toEqual([['room:102', 'room'], ['room:100', 'room'], ['room:101', 'room'], ['game:700', 'game']]);
    expect(ok<LobbyGameView>(r.game('game:700')).room).toBeNull();
    r.dispose();
  });

  // B138 (dot's review 1, CPU_SEAT_REPLACEABLE_ADAPTATION): one human and fifteen CPUs list 16/16; a joining player takes a
  // CPU's seat (central's `replaceable`), so the row is not full -- its count still the list's occupancy -- and a game of
  // sixteen humans is.
  it('B138: a game whose CPU seats a joining player may take reads 16/16 and is not full; sixteen humans are', async () => {
    const f = lobbyFixture();
    f.games = { entries: [{ ...game(700, 'bots$~Channel 1', 100, 16), replaceable: 15 }, { ...game(701, 'packed$~Channel 1', 100, 16), endOfList: true }] };
    const { r } = rooms(signedInRoutes(f), { signedIn: true });
    await flush();
    const bots = r.row('game:700')!, packed = r.row('game:701')!;
    expect([bots.n, bots.cap, roomFull(bots)]).toEqual([16, 16, false]);
    expect([packed.n, packed.cap, roomFull(packed)]).toEqual([16, 16, true]);
    const g = ok<LobbyGameView>(r.game('game:700'));
    expect([facts(g)['Players'], g.full]).toEqual(['16/16', false]);
    expect(ok<LobbyGameView>(r.game('game:701')).full).toBe(true);
    const room = ok<LobbyRoomView>(r.room('room:100'));
    expect(room.games.map((x) => [x.id, x.full])).toEqual([['game:700', false], ['game:701', true]]);
    r.dispose();
  });

  // dot's re-check of B138: 8 humans, 8 CPUs and 8 spectators (24 of 24, 8 spectator slots): the row's IN is the players
  // (16 of 16, the spectators apart), and with the CPUs' seats free to a joining player it is not full.
  it('B138: 8 humans + 8 CPUs + 8 spectators reads 16/16 and 8/8 and is not full; the CPUs gone, it is', async () => {
    const f = lobbyFixture();
    f.games = { entries: [{ ...game(710, 'mixed$~Channel 1', 100, 24, { max: 24, slots: 8, spec: 8 }), replaceable: 8 }, { ...game(711, 'humans$~Channel 1', 100, 24, { max: 24, slots: 8, spec: 8 }), endOfList: true }] };
    const { r } = rooms(signedInRoutes(f), { signedIn: true });
    await flush();
    const mixed = r.row('game:710')!, humans = r.row('game:711')!;
    expect([mixed.n, mixed.cap, roomFull(mixed)]).toEqual([16, 16, false]);
    expect([humans.n, humans.cap, roomFull(humans)]).toEqual([16, 16, true]);
    const g = ok<LobbyGameView>(r.game('game:710'));
    expect([facts(g)['Players'], facts(g)['Spectators'], g.full]).toEqual(['16/16', '8/8', false]);
    expect(ok<LobbyGameView>(r.game('game:711')).full).toBe(true);
    r.dispose();
  });

  it('the launch target: a room or a game kept by id in the selection; `row` names either; gone with its row', async () => {
    const { f, r, selection } = rooms(signedInRoutes(), { signedIn: true });
    await flush();
    r.select('room:100');
    expect(selection.selected()).toEqual({ kind: 'room', mediusWorldId: 100, name: 'Channel 1' });
    expect(r.selected()).toBe('room:100');
    r.select('game:500');
    expect(selection.selected()).toEqual({ kind: 'game', mediusWorldId: 500, room: 100, name: 'test' });
    expect(r.row('game:500')!.name).toBe('test');
    expect(r.row('room:101')!.name).toBe('Channel 2');
    f.set('/lobby/game-list', { body: { entries: [{ ...game(501, 'secret', 102, 1, { locked: true }), endOfList: true }] } });
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS);
    await flush();
    expect(selection.selected()).toBeNull();
    expect(r.game('game:500').kind).toBe('gone');
    r.dispose();
  });
});

describe('the rooms adapter: the poll and a sign-out (MU_LOBBY_POLL_ADAPTATION)', () => {
  it('a sign-out drops the signed-in answers at once and the selection; only /rooms is asked after it, with no bearer', async () => {
    const { f, r, session, selection } = rooms(signedInRoutes(), { signedIn: true });
    await flush();
    r.select('room:100');
    const asked = f.calls.length;
    session.set('signed-out');
    expect(r.room('room:100').kind).toBe('gone');
    expect(r.list()).toEqual([]);
    expect(selection.selected()).toBeNull();
    await flush();
    expect(f.calls.slice(asked).map((c) => [new URL(c.url).pathname, c.auth])).toEqual([['/rooms', null]]);
    expect(r.list().every((x) => x.kind === undefined)).toBe(true);
    r.dispose();
  });

  it('an answer that arrives after the sign-out is dropped', async () => {
    const { f, r, session } = rooms({ ...signedInRoutes(), '/lobby/channel-list': 'hang' }, { signedIn: true });
    await flush();
    f.set('/lobby/channel-list', { body: lobbyFixture().channels });
    session.set('signed-out');
    await flush();
    expect(r.list().every((x) => x.kind === undefined)).toBe(true);
    r.dispose();
  });

  it('a lost session (401) drops the names and the selection, says "Session ended", and stops the signed-in poll', async () => {
    const { f, r, selection } = rooms(signedInRoutes(), { signedIn: true });
    await flush();
    r.select('room:100');
    f.set('/lobby/channel-list', { status: 401 });
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS);
    await flush();
    expect(r.status()).toEqual({ kind: 'failed', words: 'Session ended' });
    expect(r.room('room:100').kind).toBe('gone');
    expect(selection.selected()).toBeNull();
    const asked = f.calls.length;
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS * 3);
    expect(f.calls.length).toBe(asked);
    r.dispose();
  });

  // `packages/central/src/lobbyHttp.ts` and `server.ts`: 400 a body it refuses; 403 the origin gate; 404 a route not mounted;
  // 413 a body too large; 415 not JSON; 429 the limiter; 500 a fault; 503 drained. The number is never said.
  it.each([400, 403, 404, 413, 415, 429, 500, 503])('a list answering %i is "Server unavailable", the number nowhere in the words', async (status) => {
    const { r } = rooms({ ...signedInRoutes(), '/lobby/game-list': { status } }, { signedIn: true });
    await flush();
    expect(r.status()).toEqual({ kind: 'failed', words: 'Server unavailable · Retrying...' });
    r.dispose();
  });

  it('a failure retries after the backoff\'s first step, not the period; an answer returns it to the period', async () => {
    const f0 = lobbyFixture();
    const { f, r } = rooms({ ...signedInRoutes(f0), '/lobby/channel-list': ['reject', { body: f0.channels }] }, { signedIn: true });
    await flush();
    const after = f.calls.length;
    await vi.advanceTimersByTimeAsync(MU_LOBBY_RETRY_MS - 60);
    expect(f.calls.length).toBe(after);
    await vi.advanceTimersByTimeAsync(60);
    expect(f.calls.length).toBe(after + 3);                                      // the three reads, once
    await flush();
    expect(r.status().kind).toBe('ok');
    r.dispose();
  });

  it('the failure words: no answer Offline, a refusal Server unavailable, each with its retry while the poll goes on', async () => {
    for (const [a, words] of [['reject', 'Offline · Retrying...'], [{ status: 500 }, 'Server unavailable · Retrying...']] as const) {
      const { r } = rooms({ ...signedInRoutes(), '/lobby/game-list': a }, { signedIn: true });
      await flush();
      expect(r.status(), JSON.stringify(a)).toEqual({ kind: 'failed', words });
      r.dispose();
    }
  });
});

describe('the Report\'s server detail (MU-P2): kept on a failure, cleared by the next answer, never in the words', () => {
  const noted = (): Pick<RoomsDeps, 'noteDetail'> => ({ noteDetail: (d) => { noteServerDetail(document, 'lobby', d); } });

  it('a 500 notes "<what>: HTTP 500" and the words say none of it; the next answer clears it; no answer notes the kind', async () => {
    clearServerDetails(document);
    const f0 = lobbyFixture();
    const f = fakeFetch({ ...signedInRoutes(f0), '/lobby/channel-list': [{ status: 500 }, { body: f0.channels }] });
    const r = liveRooms(document, () => {}, { source: fetchLobbySource(BASE, f.fetch), session: fakeSession('signed-in'), launcher: fakeLauncher(), selection: createSelection(), ...noted() });
    await flush();
    expect(serverDetailLine(document)).toBe('unavailable (channel list: HTTP 500)');
    expect(r.status().words).not.toMatch(/HTTP|500/);
    void r.refresh();
    await flush();
    expect(serverDetailLine(document)).toBeNull();
    r.dispose();
    const off = fakeFetch({ '/rooms': 'reject' });
    const o = liveRooms(document, () => {}, { source: fetchLobbySource(BASE, off.fetch), session: fakeSession(), launcher: fakeLauncher(), selection: createSelection(), ...noted() });
    await flush();
    expect(serverDetailLine(document)).toBe('offline (rooms: no answer)');
    o.dispose();
  });

  it('the session lost is the account\'s, not the server\'s: nothing noted; a sign-out clears what was', async () => {
    clearServerDetails(document);
    const f = fakeFetch({ ...signedInRoutes(), '/lobby/channel-list': { status: 401 } });
    const r = liveRooms(document, () => {}, { source: fetchLobbySource(BASE, f.fetch), session: fakeSession('signed-in'), launcher: fakeLauncher(), selection: createSelection(), ...noted() });
    await flush();
    expect(serverDetailLine(document)).toBeNull();
    r.dispose();
    const session = fakeSession('signed-in');
    const g = fakeFetch({ ...signedInRoutes(), '/lobby/game-list': { status: 500 }, '/rooms': 'hang' });
    const s = liveRooms(document, () => {}, { source: fetchLobbySource(BASE, g.fetch), session, launcher: fakeLauncher(), selection: createSelection(), ...noted() });
    await flush();
    expect(serverDetailLine(document)).not.toBeNull();
    session.set('signed-out');
    expect(serverDetailLine(document)).toBeNull();
    s.dispose();
  });
});

describe('MU.R2: the lobby\'s modules keep nothing in the browser (the retired section\'s rule, on the console\'s files)', () => {
  const files = [
    'modern/lobbies/data.ts', 'modern/lobbies/poller.ts', 'modern/lobbies/selection.ts', 'console/lobbyFilters.ts', 'console/adapters/rooms.ts',
    'console/adapters/lobbies.ts', 'console/render/lobbies.ts', 'modern/report/serverDetail.ts',
  ];
  it.each(files)('%s: no storage, no cookie, no store, no document-wide key listener', (file) => {
    const text = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../src', file), 'utf8');
    expect(text).not.toMatch(/\b(localStorage|sessionStorage|indexedDB|caches)\b|document\.cookie|\.cookie\b/);
    expect(text).not.toMatch(/from '[^']*(pageStore|cardSave|settings\/store)'/);
    expect(text).not.toMatch(/(doc|document|win|window)\.addEventListener\('key/);
  });
});

describe('the review folds: a game line carries the section flags; Refresh after a lost session', () => {
  it('F1: spectators, lock, clan, ping, ranks in the section order, as text: a clan game and a rank-limited one read apart', async () => {
    const f = lobbyFixture();
    f.games = { entries: [game(500, 'test', 100, 2, { slots: 4, ping: 450 }), game(502, 'clanwar', 100, 4, { clan: true, ranks: 0b0011 }),
      { ...game(503, 'locked', 100, 1, { locked: true, slots: 2 }), endOfList: true }] };
    const { r } = rooms(signedInRoutes(f), { signedIn: true });
    await flush();
    expect(ok<LobbyRoomView>(r.room('room:100')).games.map((g) => g.sub)).toEqual([
      'Frostfire · 2/12 players · 0/4 spectators · Ping Fair',
      'Frostfire · 4/16 players · Clan game · Ping Good · Ranks: ENSIGN, LIEUTENANT',             // GenericField3 set; 'D'[7] bits 1 and 2
      'Frostfire · 1/14 players · 0/2 spectators · Password · Ping Good',
    ]);
    r.dispose();
  });

  it('F2: after a lost session (401), Refresh answers at once in that state words and asks nothing; a new session reads again', async () => {
    const { f, r, session } = rooms(signedInRoutes(), { signedIn: true });
    await flush();
    f.set('/lobby/channel-list', { status: 401 });
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS);
    await flush();
    const asked = f.calls.length;
    const done = vi.fn();
    void r.refresh().then(done);
    for (let i = 0; i < 4; i++) await Promise.resolve();
    expect(done).toHaveBeenCalledTimes(1);                                       // no waiter left for a poll that never comes
    expect(r.status()).toEqual({ kind: 'failed', words: 'Session ended' });
    expect(f.calls.length).toBe(asked);
    f.set('/lobby/channel-list', { body: lobbyFixture().channels });
    session.set('signed-out');
    session.set('signed-in');
    await flush();
    expect(r.status().kind).toBe('ok');
    r.dispose();
  });
});

/** A lobby as the forge's route lists it (`forgeLobby.ts` `ForgeLobbySummary`). */
const forgeLobby = (id: string, name: string, base: string, players: number, max: number, o: { inMatch?: boolean; locked?: boolean } = {}) => ({
  id, name, base, players, max, settings: { players: max, rounds: 3, roundSeconds: 300, friendlyFire: false }, created: 1, listed: true,
  inMatch: o.inMatch ?? false, ...(o.locked !== undefined ? { locked: o.locked } : {}),
});
const LISTED = { lobbies: [forgeLobby('L1', 'Crate maze', 'MP72', 3, 16, { locked: true }), forgeLobby('L2', XSS_NAME, 'blank:MP2', 8, 8, { inMatch: true })] };

function custom(answer: Answer | Answer[] | undefined, o: { search?: string; missions?: readonly MissionRecord[] | null } = {}) {
  const f = fakeFetch(answer === undefined ? {} : { [CUSTOM_MATCHES_PATH]: answer });
  const assigned: string[] = [];
  const page = { location: { search: o.search ?? '', origin: 'https://play.example', assign: (u: string) => { assigned.push(u); } } };
  const deps: CustomDeps = { source: fetchCustomMatchSource(BASE, f.fetch), base: BASE, page, missions: () => o.missions ?? null };
  const c = liveCustomMatches(document, () => {}, deps);
  const asked = (): number => f.calls.filter((x) => x.url === `${BASE}${CUSTOM_MATCHES_PATH}`).length;
  return { c, f, asked, assigned };
}

describe('the custom matches adapter (FG-46; MU_CUSTOM_MATCHES_OPTIONAL_ADAPTATION)', () => {
  it('nothing is read until its screen is shown; then once a period, with no bearer; none once it is left or the tab hidden', async () => {
    const { c, f, asked } = custom({ body: LISTED });
    await flush();
    expect(asked()).toBe(0);
    expect(c.view()).toEqual({ kind: 'waiting' });
    c.sync(true);
    await flush();
    expect(asked()).toBe(1);
    expect(f.calls[0]!.auth).toBeNull();
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS);
    expect(asked()).toBe(2);
    c.sync(false);
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS * 3);
    expect(asked()).toBe(2);
    c.sync(true);
    await flush();
    expect(asked()).toBe(3);                                                     // one fell due while it was away: at once
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS * 3);
    expect(asked()).toBe(3);
    c.dispose();
  });

  it('a row each: the name as it came, the map, players / seats, in match, the lock mark (FG-48a), JOIN\'s address', async () => {
    const { c } = custom({ body: LISTED });
    c.sync(true);
    await flush();
    expect(c.view()).toEqual({
      kind: 'ok', empty: null, rows: [
        { id: 'L1', name: 'Crate maze', map: 'Crossroads', players: 3, max: 16, inMatch: false, locked: true, href: '/forge/lobby/L1' },
        { id: 'L2', name: XSS_NAME, map: 'Blank floor (Frostfire)', players: 8, max: 8, inMatch: true, locked: false, href: '/forge/lobby/L2' },
      ],
    });
    c.dispose();
  });

  it('the map by the disc\'s mission table when it is in', async () => {
    const { c } = custom({ body: LISTED }, { missions: MISSIONS });
    c.sync(true);
    await flush();
    const v = c.view();
    expect(v.kind === 'ok' ? v.rows.map((x) => x.map) : []).toEqual(['Blizzard', 'Blank floor (Frostfire)']);
    c.dispose();
  });

  it('none listed is its line; the route absent, refused or not answering is unavailable; a hang gives up at its own limit', async () => {
    const empty = custom({ body: { lobbies: [] } });
    empty.c.sync(true);
    await flush();
    expect(empty.c.view()).toEqual({ kind: 'ok', rows: [], empty: LOBBY_WORDS.customEmpty });
    empty.c.dispose();
    for (const a of [undefined, { status: 500, body: {} }, 'reject'] as (Answer | undefined)[]) {
      const { c } = custom(a);
      c.sync(true);
      await flush();
      expect(c.view(), JSON.stringify(a)).toEqual({ kind: 'unavailable', line: LOBBY_WORDS.customUnavailable });
      c.dispose();
    }
    expect(MU_CUSTOM_MATCHES_TIMEOUT_MS_ADAPTATION).toBeLessThan(MU_LOBBY_REQUEST_TIMEOUT_MS);
    const hung = custom('hang');
    hung.c.sync(true);
    await vi.advanceTimersByTimeAsync(MU_CUSTOM_MATCHES_TIMEOUT_MS_ADAPTATION + 10);
    expect(hung.c.view()).toEqual({ kind: 'unavailable', line: LOBBY_WORDS.customUnavailable });
    hung.c.dispose();
  });

  it('JOIN opens the forge at the lobby on the page\'s window, under devmode with the list\'s server; an unknown id opens nothing', async () => {
    const plain = custom({ body: LISTED });
    plain.c.sync(true);
    await flush();
    expect(plain.c.join('L1')).toBe('/forge/lobby/L1');
    expect(plain.assigned).toEqual(['/forge/lobby/L1']);
    expect(plain.c.join('nope')).toBeNull();
    expect(plain.assigned).toHaveLength(1);
    plain.c.dispose();
    const dev = custom({ body: LISTED }, { search: '?devmode' });
    dev.c.sync(true);
    await flush();
    expect(dev.c.join('L2')).toBe(`/forge/lobby/L2?devmode&server=${encodeURIComponent(BASE)}`);
    dev.c.dispose();
    // The dev-tools switch on its own: the same server, under its own word (PR #333 review).
    const tools = custom({ body: LISTED }, { search: '?devtools' });
    tools.c.sync(true);
    await flush();
    expect(tools.c.join('L2')).toBe(`/forge/lobby/L2?devtools&server=${encodeURIComponent(BASE)}`);
    tools.c.dispose();
  });

  it('Refresh reads again at once while shown and settles with the answer', async () => {
    const { c, asked } = custom({ body: LISTED });
    c.sync(true);
    await flush();
    const done = vi.fn();
    void c.refresh().then(done);
    await flush();
    expect(asked()).toBe(2);
    expect(done).toHaveBeenCalled();
    c.dispose();
  });
});
