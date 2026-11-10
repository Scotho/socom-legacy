// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import * as ui from '@s2u/ui';
import type { MissionRecord } from '@s2u/ui';
import { accountServiceBase } from '../../../src/connectHost';
import { FORGE_LOBBY_PARAM, lobbyIdOf } from '../../../src/forge/lobbyClient';
import { discAssetsOf } from '../../../src/modern/discAssets';
import { FORGE_SEGMENT, isForgeAddress } from '../../../src/pageEntry';
import { devMode, devSwitches } from '../../../src/source';
import { channelListOf } from '../../../src/worldOfSocomHost';
import { gameListOf } from '../../../src/briefingRoomHost';
import {
  CUSTOM_MATCHES_PATH, LobbyLoadError, MU_CUSTOM_MATCHES_OPTIONAL_ADAPTATION, MU_LOBBY_WORLD_ACTIVE, customMatchAddress, customMatchMap, customMatchesOf,
  fetchCustomMatchSource, fetchLobbySource, lobbyGameDetails, lobbyViewOf, membersOf, publicRoomsOf,
} from '../../../src/modern/lobbies/data';
import { BASE, NO_GAMES, NO_ROOMS, PUBLIC_ROOMS, TICKET, XSS_NAME, fakeFetch, game, lobbyFixture, room, signedInRoutes, type Answer } from './fixtures';

/**
 * MU-3's data (`src/modern/lobbies/data.ts`): the three routes read through the original page's own clients
 * (`fetchRoomListService`, `fetchBriefingRoomService`) and the modern members route, merged by world id.
 */
describe('the lobby view from the routes', () => {
  it('rooms in the original list\'s order and filter, with counts, the lock and the members\' names', () => {
    const f = lobbyFixture();
    const v = lobbyViewOf(channelListOf(f.channels), gameListOf(f.games), membersOf(f.members));
    // FUN_002e3f80's order (GF1's high half, the name's length, the name); "Medius..." not drawn (FUN_002e3cc0).
    expect(v.rooms.map((r) => r.name)).toEqual(['Veterans', 'Channel 1', 'Channel 2']);
    const ch1 = v.rooms.find((r) => r.id === 100)!;
    expect(ch1).toMatchObject({ players: 2, max: 64, locked: false, private: false, names: ['Alpha', XSS_NAME], ranks: [1, 2, 3, 4] });
    const vets = v.rooms.find((r) => r.id === 102)!;
    expect(vets).toMatchObject({ players: 1, locked: true, private: true, names: [] });
    expect(v.names).toBe(true);
  });
  it('games with the original row\'s columns: the name cut at "$~", IN/MAX, SPEC, PING, PASS, CLAN, the map', () => {
    const f = lobbyFixture();
    const v = lobbyViewOf(channelListOf(f.channels), gameListOf(f.games), membersOf(f.members));
    const g = v.games.find((x) => x.id === 500)!;
    expect(g).toMatchObject({ name: 'test', room: 100, inPlayers: 2, maxIn: 12, spectators: 0, maxSpectators: 4, ping: 2, locked: false, clan: false, map: 'MP2', names: ['Alpha', XSS_NAME] });
    const s = v.games.find((x) => x.id === 501)!;
    expect(s).toMatchObject({ locked: true, private: true, names: [], inPlayers: 1 });
  });
  it('the order is the roomOrder of @s2u/ui (FUN_002e3f80), not a copy', () => {
    const { roomOrder, caseless } = ui as unknown as Record<string, unknown>;
    expect(typeof roomOrder).toBe('function');
    expect(typeof caseless).toBe('function');
    const f = lobbyFixture();
    const sorted = [...channelListOf(f.channels)].sort(roomOrder as (a: unknown, b: unknown) => number).map((e) => e.lobbyName).filter((n) => !n.startsWith('Medius'));
    expect(lobbyViewOf(channelListOf(f.channels), [], null).rooms.map((r) => r.name)).toEqual(sorted);
  });
  it('an empty server: no rooms, no games (the NoResult entries are not rows)', () => {
    const v = lobbyViewOf(channelListOf(NO_ROOMS), gameListOf(NO_GAMES), { rooms: [], games: [] });
    expect(v.rooms).toEqual([]);
    expect(v.games).toEqual([]);
  });
  it('without the members route the counts stand and the names are unknown (null), never empty', () => {
    const f = lobbyFixture();
    const v = lobbyViewOf(channelListOf(f.channels), gameListOf(f.games), null);
    expect(v.names).toBe(false);
    expect(v.rooms.every((r) => r.names === null)).toBe(true);
    expect(v.rooms.find((r) => r.id === 100)!.players).toBe(2);
  });
  it('the members answer is checked: a name is text, anything else is refused', () => {
    expect(() => membersOf({ rooms: [{ mediusWorldId: 1, name: 'x', players: [{ name: 3 }] }], games: [] })).toThrow();
    expect(() => membersOf({ rooms: 'no' })).toThrow();
    expect(membersOf({ rooms: [], games: [] })).toEqual({ rooms: [], games: [] });
  });
  it('the public rooms answer: map, rules and counts; another shape is refused', () => {
    expect(publicRoomsOf(PUBLIC_ROOMS)).toEqual(PUBLIC_ROOMS);
    expect(() => publicRoomsOf({ rooms: [] })).toThrow();
    expect(() => publicRoomsOf([{ map: 'MP2' }])).toThrow();
  });
  it('a room with players past its maximum keeps its count (the bar is clamped by the view, not the data)', () => {
    const v = lobbyViewOf([room(1, 'Full', 70, 64)], [], null);
    expect(v.rooms[0]!.players).toBe(70);
  });
});

describe('the lobby source over fetch', () => {
  it('signed in: the two lists posted and the members read, each with the ticket as the bearer', async () => {
    const f = fakeFetch(signedInRoutes());
    const v = await fetchLobbySource(BASE, f.fetch).lobby(TICKET, new AbortController().signal);
    expect(v.rooms).toHaveLength(3);
    const byPath = Object.fromEntries(f.calls.map((c) => [c.url.slice(BASE.length), c]));
    expect(byPath['/lobby/channel-list']).toMatchObject({ method: 'POST', auth: `Bearer ${TICKET}` });
    expect(byPath['/lobby/game-list']).toMatchObject({ method: 'POST', auth: `Bearer ${TICKET}` });
    expect(byPath['/modern/lobby-members']).toMatchObject({ method: 'POST', auth: `Bearer ${TICKET}`, type: 'application/json', body: '{}' });
  });
  it('signed out: only the anonymous /rooms, no bearer', async () => {
    const f = fakeFetch(signedInRoutes());
    expect(await fetchLobbySource(BASE, f.fetch).publicRooms(new AbortController().signal)).toEqual(PUBLIC_ROOMS);
    expect(f.calls).toEqual([{ url: `${BASE}/rooms`, method: 'GET', auth: null }]);
  });
  it('no answer is "unreachable"; a 401 is "session-lost"; another refusal is "refused"', async () => {
    const kind = async (routes: Parameters<typeof fakeFetch>[0]): Promise<string> => {
      try { await fetchLobbySource(BASE, fakeFetch(routes).fetch).lobby(TICKET, new AbortController().signal); return 'ok'; }
      catch (e) { return e instanceof LobbyLoadError ? e.kind : 'other'; }
    };
    expect(await kind({ ...signedInRoutes(), '/lobby/channel-list': 'reject' })).toBe('unreachable');
    expect(await kind({ ...signedInRoutes(), '/lobby/game-list': { status: 401 } })).toBe('session-lost');
    expect(await kind({ ...signedInRoutes(), '/modern/lobby-members': { status: 401 } })).toBe('session-lost');
    expect(await kind({ ...signedInRoutes(), '/lobby/channel-list': { status: 500 } })).toBe('refused');
    expect(await kind({ ...signedInRoutes(), '/lobby/channel-list': { body: { nope: 1 } } })).toBe('refused');
  });
  it('the members route refused (not mounted, origin, fault): the lists stand, names unknown', async () => {
    const f = fakeFetch({ ...signedInRoutes(), '/modern/lobby-members': { status: 403 } });
    const v = await fetchLobbySource(BASE, f.fetch).lobby(TICKET, new AbortController().signal);
    expect(v.names).toBe(false);
    expect(v.rooms).toHaveLength(3);
  });
  it('an abort is passed to every request', async () => {
    const f = fakeFetch({ ...signedInRoutes(), '/lobby/channel-list': 'hang' });
    const ac = new AbortController();
    const p = fetchLobbySource(BASE, f.fetch).lobby(TICKET, ac.signal);
    ac.abort();
    await expect(p).rejects.toMatchObject({ kind: 'unreachable' });
  });
});

/**
 * CX-LOBBIES: the data cases of the retired section's tests, kept beside the module they read (`data.ts` stays: the
 * console's rooms and Custom matches adapters, Home and the Server view read it). From `custom.test.ts` (FG-46, FG-48a),
 * `details.test.ts` (MU-13d) and `kinds.test.ts` (MU2-5), unchanged.
 */
describe('GAME DETAILS\' data (MU-13d)', () => {
  const MISSIONS_D: MissionRecord[] = [{ number: 2, name: 'Map <b>B</b>', type: 5, multiplayer: true }, { number: 72, name: 'Map C', type: 1, multiplayer: true }];
  it('decodes as the original\'s reader does: the same function, the record the list carries', () => {
    const f = lobbyFixture();
    f.channels = { entries: [room(100, 'Channel 1', 1)] };
    f.games = { entries: [{ ...game(600, 'set$~Channel 1', 100, 1, { level: 2, list: [72], rounds: 11, minutes: 6, eq: 1, rulesSet: 3 }), endOfList: true }] };
    f.members = { rooms: [{ mediusWorldId: 100, name: 'Channel 1', players: [{ name: 'Alpha' }] }], games: [{ mediusWorldId: 600, name: 'set$~Channel 1', room: 100, players: [{ name: 'Alpha' }] }] };
    const entries = gameListOf(f.games);
    const g = lobbyViewOf(channelListOf(f.channels), entries, membersOf(f.members)).games[0]!;
    expect(lobbyGameDetails(g, null)).toEqual(ui.gameDetails(entries[0]!, null));
    expect(lobbyGameDetails(g, MISSIONS_D)).toEqual(ui.gameDetails(entries[0]!, MISSIONS_D));
    expect(lobbyGameDetails(g, MISSIONS_D)).toMatchObject({ rounds: 11, roundMinutes: 6, friendlyFire: true, respawn: true, equipment: 1, mission: { typeWord: 'MEDLEY' } });
  });

  it('the disc\'s mission table through the image\'s readers (`readMissions`), read once', async () => {
    const missions = vi.fn(async () => MISSIONS_D);
    const assets = discAssetsOf({ read: async () => new Uint8Array(0) } as never, { valves: async () => [], itemNames: async () => new Map(), missions });
    expect(await assets.readMissions!()).toEqual(MISSIONS_D);
    await assets.readMissions!();
    expect(missions).toHaveBeenCalledTimes(1);
  });
});

describe('a round in progress (MU2-5)', () => {
  it('the data: WorldActive (2) is a round in progress, Staging (1) a game lobby', () => {
    expect(MU_LOBBY_WORLD_ACTIVE).toBe(2);
    const v = lobbyViewOf([room(100, 'Channel 1', 2)], [game(500, 'staging', 100, 2), game(502, 'underway', 100, 8, { worldStatus: 2 })], null);
    expect(v.games.map((g) => [g.id, g.inProgress])).toEqual([[500, false], [502, true]]);
  });
});

/** A lobby as the server lists it (`forgeLobby.ts` `ForgeLobbySummary`). */
const forgeLobby = (id: string, name: string, base: string, players: number, max: number, o: { inMatch?: boolean; listed?: boolean; locked?: boolean } = {}) => ({
  id, name, base, players, max, settings: { players: max, rounds: 3, roundSeconds: 300, friendlyFire: false }, created: 1,
  listed: o.listed ?? true, inMatch: o.inMatch ?? false, ...(o.locked !== undefined ? { locked: o.locked } : {}),
});
const LISTED = { lobbies: [forgeLobby('L1', 'Crate maze', 'MP72', 3, 16), forgeLobby('L2', XSS_NAME, 'blank:MP2', 8, 8, { inMatch: true })] };
const MISSIONS_C: MissionRecord[] = [{ number: 72, name: 'Frostfire', type: 1, multiplayer: true }, { number: 2, name: 'Blizzard', type: 2, multiplayer: true }];

describe('Custom matches: the data (FG-46)', () => {
  it('the summary\'s fields: id, name, base, players, seats, in match; a lobby not listed (a server before FG-45) is dropped', () => {
    expect(customMatchesOf(LISTED)).toEqual([
      { id: 'L1', name: 'Crate maze', base: 'MP72', players: 3, max: 16, inMatch: false, locked: false },
      { id: 'L2', name: XSS_NAME, base: 'blank:MP2', players: 8, max: 8, inMatch: true, locked: false },
    ]);
    const old = { lobbies: [{ ...forgeLobby('L3', 'Old', 'MP2', 1, 16), listed: undefined }, forgeLobby('L4', 'Hidden', 'MP2', 1, 16, { listed: false })] };
    expect(customMatchesOf(old)).toEqual([]);
    expect(customMatchesOf({ lobbies: [] })).toEqual([]);
  });

  it('the answer is checked field by field: anything else is refused', () => {
    const one = forgeLobby('L1', 'x', 'MP2', 1, 16);
    for (const bad of [
      [], { lobbies: 'no' }, { lobbies: [{ ...one, id: 'not an id' }] }, { lobbies: [{ ...one, name: 7 }] }, { lobbies: [{ ...one, base: null }] },
      { lobbies: [{ ...one, players: -1 }] }, { lobbies: [{ ...one, players: 1.5 }] }, { lobbies: [{ ...one, max: 0 }] }, { lobbies: [{ ...one, inMatch: 'yes' }] },
    ]) expect(() => customMatchesOf(bad), JSON.stringify(bad)).toThrow();
  });

  it('the read: GET /lobby/forge/lobbies at the base with no bearer; any refusal, no answer or another shape is none (null)', async () => {
    const ok = fakeFetch({ [CUSTOM_MATCHES_PATH]: { body: LISTED } });
    const ac = new AbortController();
    expect(await fetchCustomMatchSource(BASE, ok.fetch).customMatches(ac.signal)).toHaveLength(2);
    expect(ok.calls).toEqual([{ url: `${BASE}/lobby/forge/lobbies`, method: 'GET', auth: null }]);
    for (const a of [{ status: 404 }, { status: 401 }, { status: 403 }, { status: 500, body: {} }, { body: { rooms: [] } }, 'reject'] as Answer[]) {
      const f = fakeFetch({ [CUSTOM_MATCHES_PATH]: a });
      expect(await fetchCustomMatchSource(BASE, f.fetch).customMatches(ac.signal), JSON.stringify(a)).toBeNull();
    }
    expect(MU_CUSTOM_MATCHES_OPTIONAL_ADAPTATION).toMatch(/unavailable/);
  });

  it('the map: a multiplayer map by the disc\'s mission name when it is in, else its display name (OT.R113), never its stem; a blank floor said as one', () => {
    expect(customMatchMap('MP72', null)).toBe('Crossroads');                     // MN-1 (OT.R113): the name table, not the stem
    expect(customMatchMap('MP72', MISSIONS_C)).toBe('Frostfire');
    expect(customMatchMap('blank:MP2', null)).toBe('Blank floor (Frostfire)');
    expect(customMatchMap('blank:MP2', MISSIONS_C)).toBe('Blank floor (Blizzard)');
    expect(customMatchMap('M51', MISSIONS_C)).toBe('M51');                          // a campaign mission: its stem
    expect(customMatchMap('MP9', MISSIONS_C)).toBe('Bitter Jungle');                // not in the disc's table: the name table's (MN-1)
    expect(customMatchMap('MP99', null)).toBe('Unknown map');                       // off every table: never the code
  });

  it('JOIN\'s address: the forge\'s lobby link (`/forge/lobby/<id>`); under devmode the switch and the list\'s server, nothing else', () => {
    expect(customMatchAddress('L1', { devmode: false, server: null }, '/')).toBe('/forge/lobby/L1');
    expect(customMatchAddress('L1', { devmode: false, server: null }, '/s2u')).toBe('/s2u/forge/lobby/L1');
    expect(customMatchAddress('L1', { devmode: false, server: 'http://other.test' }, '/')).toBe('/forge/lobby/L1');   // server= only under devmode
    expect(customMatchAddress('L1', { devmode: true, server: null }, '/')).toBe('/forge/lobby/L1?devmode');
    const dev = customMatchAddress('Ab_-9', { devmode: true, server: 'http://host.test:8787' }, '/');
    expect(dev).toBe('/forge/lobby/Ab_-9?devmode&server=http%3A%2F%2Fhost.test%3A8787');
    // The dev-tools switch on its own carries server= as devmode does, under its own word (connectHost's switch; PR #333 review).
    expect(customMatchAddress('L1', { devmode: false, devtools: true, server: null }, '/')).toBe('/forge/lobby/L1?devtools');
    expect(customMatchAddress('L1', { devmode: false, devtools: true, server: 'http://host.test:8787' }, '/')).toBe('/forge/lobby/L1?devtools&server=http%3A%2F%2Fhost.test%3A8787');
    expect(customMatchAddress('L1', { devmode: true, devtools: true, server: null }, '/')).toBe('/forge/lobby/L1?devmode');   // devmode already includes it
    // The forge reads it as its own link: its page, its lobby, and the same server the console's requests go to.
    expect(FORGE_SEGMENT).toBe('forge');
    expect(FORGE_LOBBY_PARAM).toBe('lobby');
    expect(isForgeAddress(dev, '/')).toBe(true);
    expect(lobbyIdOf(dev.slice(dev.indexOf('?')), dev.slice(0, dev.indexOf('?')))).toBe('Ab_-9');
    const loc = { protocol: 'https:', host: 'play.test', origin: 'https://play.test' };
    for (const page of ['?devmode&server=ws://host.test:8787', '?devmode', '', '?server=ws://other.test', '?devtools&server=ws://host.test:8787', '?devtools']) {
      // the list's base as the console takes it (`src/console/adapters/rooms.ts` `lobbyBase`: the account requests' base), and the address it makes
      const listBase = accountServiceBase(page, loc, true, false);
      const forge = customMatchAddress('L1', { devmode: devMode(page), devtools: devSwitches(page, true).tools, server: listBase !== loc.origin ? listBase : null }, '/');
      expect(accountServiceBase(forge.slice(forge.indexOf('?')), loc, true, false), page).toBe(listBase);
    }
  });

  it('FG-48a: `locked` read (absent, false); anything but a boolean refused', () => {
    expect(customMatchesOf({ lobbies: [forgeLobby('L1', 'Locked', 'MP72', 1, 16, { locked: true }), forgeLobby('L2', 'Open', 'MP72', 1, 16, { locked: false })] }).map((m) => m.locked)).toEqual([true, false]);
    expect(customMatchesOf({ lobbies: [forgeLobby('L3', 'Old', 'MP72', 1, 16)] })[0]!.locked).toBe(false);
    for (const bad of ['yes', 1, null]) expect(() => customMatchesOf({ lobbies: [{ ...forgeLobby('L1', 'x', 'MP2', 1, 16), locked: bad }] }), JSON.stringify(bad)).toThrow();
  });
});
