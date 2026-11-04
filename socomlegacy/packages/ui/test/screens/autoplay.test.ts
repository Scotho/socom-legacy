import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import type { ChannelListEntry } from '../../src/screens/worldOfSocomCommands';
import { PARKED_ROWS, WORLD_OF_SOCOM, parkedRowGate } from '../../src/screens/worldOfSocomCommands';
import { GAME_LOBBY, GAME_NAME_VAR, LOBBY_STATE_IN_GAME, LOBBY_STATE_JOIN_GAME, PLAYER_GAME_PASSWORD_VAR } from '../../src/screens/gameLobbyCommands';
import { BriefingRoomCommands } from '../../src/screens/briefingRoomCommands';
import { LobbyClient } from '../../src/screens/lobbyClient';
import { lobbySessionStart } from '../../src/screens/worldOfSocomCommands';
import { UiCommandHost } from '../../src/uiCommands';
import { UiVarManager } from '../../src/uiVars';
import { ValveStore } from '../../src/valves';
import type { GameListEntry } from '../../src/screens/briefingRoomCommands';
import {
  AUTOPLAY_CLEAR_PLAYER_FILTER, AUTOPLAY_CLEAR_ROOM_FILTER, AUTOPLAY_LIST_QUERY, AUTOPLAY_PLAYER_FILTER, AutoplaySearch, autoplayCandidate, autoplayPick,
  clanFieldAdmits, type AutoplayBriefing, type AutoplayService,
} from '../../src/screens/autoplayCommands';
import { HAVE } from './worldOfSocomRig';
import { gameLobbyRig } from './gameLobbyRig';

/**
 * ONL-15's AUTOPLAY (web research 265 §2): `JoinMPGame(RANDOM)`'s chain -- `FUN_002f83b0` D:L197147-197155,
 * `FUN_002f8e50`, `FUN_002f8ed0`, `FUN_002f8fd0`, `FUN_002f9220` D:L197533-197715 -- off the machine over a fake service,
 * then SOCOM II ONLINE's AUTOPLAY row over the machine (the disc's `join_random_game` and `join_game`) through the
 * room's join and the game's into the GAME LOBBY. Synthetic games; nothing measured on the original running (ONL-32).
 */

const statsHex = (slots = 0): string => { const b = new Uint8Array(256); b[0] = 0x44; b[4] = slots; b[8] = 2; return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); };
const game = (gameName: string, id: number, o: Partial<GameListEntry> = {}): GameListEntry => ({
  status: 0, mediusWorldId: id, playerCount: 2, minPlayers: 2, maxPlayers: 16, gameLevel: 2, playerSkillLevel: 0, rulesSet: 0, genericField1: 1, genericField2: 300,
  genericField3: 0, securityLevel: 0, worldStatus: 1, gameHostType: 0, gameName, gameStats: statsHex(0), endOfList: false, ...o,
});
const last = (list: GameListEntry[]): GameListEntry[] => list.map((g, i) => ({ ...g, endOfList: i === list.length - 1 }));
/** GameStats with its current spectators (D[3]) and its spectator slots (D[4]). */
const mixedStats = (watching: number, slots: number): string => { const b = new Uint8Array(256); b[0] = 0x44; b[3] = watching; b[4] = slots; b[8] = 2; return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); };
const NO_RESULT: GameListEntry = { ...game('', 0), status: 1, endOfList: true };
const room = (lobbyName: string, mediusWorldId: number, o: Partial<ChannelListEntry> = {}): ChannelListEntry => ({
  status: 0, mediusWorldId, playerCount: 0, maxPlayers: 64, securityLevel: 0, genericField1: 0, lobbyName, endOfList: false, ...o,
});
const ROOMS = [room('Alpha', 1), room('Bravo', 2, { endOfList: true })];
const names = Object.fromEntries(Object.entries(DIALOG_EVENTS).map(([k, v]) => [v, k]));

describe('the candidate test (FUN_002f8fd0 D:L197629-197639) and the pick (FUN_002f9220 D:L197678-197692)', () => {
  const ok = { playerFilter: 0, admits: () => true, clanId: -1 };
  it('a game with a free seat, more players than GamePlayerFilter, open, not closed, not another clan\'s, that the list\'s filter admits', () => {
    expect(autoplayCandidate(game('a', 1), ok)).toBe(true);
    expect(autoplayCandidate(game('a', 1, { playerCount: 0 }), ok)).toBe(false);                                 // nobody in it
    expect(autoplayCandidate(game('a', 1, { playerCount: 16 }), ok)).toBe(false);                                // full
    expect(autoplayCandidate(game('a', 1, { playerCount: 8, gameStats: statsHex(8) }), ok)).toBe(false);         // 8 < 16 - 8 is false: the spectator slots
    expect(autoplayCandidate(game('a', 1, { playerCount: 7, gameStats: statsHex(8) }), ok)).toBe(true);
    expect(autoplayCandidate(game('a', 1, { playerCount: 4 }), { ...ok, playerFilter: 4 })).toBe(false);         // more than the filter, strictly
    expect(autoplayCandidate(game('a', 1, { playerCount: 5 }), { ...ok, playerFilter: 4 })).toBe(true);
    expect(autoplayCandidate(game('a', 1, { securityLevel: 1 }), ok)).toBe(false);                               // a password
    expect(autoplayCandidate(game('a', 1, { worldStatus: 3 }), ok)).toBe(false);                                 // closed
    expect(autoplayCandidate(game('a', 1), { ...ok, admits: () => false })).toBe(false);                         // FUN_002e3080
    expect(autoplayCandidate(game('a', 1, { genericField3: (0xc0000000 | 5) >>> 0 }), ok)).toBe(false);          // another clan's clan game
    expect(autoplayCandidate(game('a', 1, { genericField3: (0xc0000000 | 5) >>> 0 }), { ...ok, clanId: 5 })).toBe(true);
  });

  // B138 (dot's review 1, CPU_SEAT_REPLACEABLE_ADAPTATION): a game of one human and fifteen CPUs lists 16/16, and a
  // joining player takes a CPU's seat (central's `replaceable`); the seat test counts the humans, the list's occupancy stays.
  it('B138: a game whose CPU seats a joining player may take is a candidate; without them, full as before', () => {
    expect(autoplayCandidate(game('a', 1, { playerCount: 16, replaceable: 15 } as Partial<GameListEntry>), ok)).toBe(true);
    expect(autoplayCandidate(game('a', 1, { playerCount: 16, replaceable: 0 } as Partial<GameListEntry>), ok)).toBe(false);
    expect(autoplayCandidate(game('a', 1, { playerCount: 8, gameStats: statsHex(8), replaceable: 1 } as Partial<GameListEntry>), ok)).toBe(true);
    expect(autoplayCandidate(game('a', 1, { playerCount: 16, replaceable: 15 } as Partial<GameListEntry>), { ...ok, playerFilter: 15 })).toBe(true);   // the filter reads the occupancy
  });

  // dot's re-check of B138: PlayerCount holds the spectators too, so with CPUs the seat test is central's -- the room less
  // the CPUs under MaxPlayers, and the humans playing (less the spectators, D[3], and the CPUs) under the player seats.
  it('B138: 8 humans, 8 CPUs and 8 spectators (24 of 24, 8 slots) is a candidate; with no CPU the original\'s test is unchanged', () => {
    expect(autoplayCandidate(game('a', 1, { playerCount: 24, maxPlayers: 24, gameStats: mixedStats(8, 8), replaceable: 8 } as Partial<GameListEntry>), ok)).toBe(true);
    expect(autoplayCandidate(game('a', 1, { playerCount: 24, maxPlayers: 24, gameStats: mixedStats(8, 8), replaceable: 1 } as Partial<GameListEntry>), ok)).toBe(true);    // 15 humans + 1 CPU + 8 watching: 15 < 16 seats
    expect(autoplayCandidate(game('a', 1, { playerCount: 16, maxPlayers: 24, gameStats: mixedStats(8, 8) }), ok)).toBe(false);   // no CPU: 16 >= 24 - 8, the original's
    expect(autoplayCandidate(game('a', 1, { playerCount: 15, maxPlayers: 24, gameStats: mixedStats(8, 8) }), ok)).toBe(true);
  });

  it('FUN_002e9940: only a clan game (top nibble 0xC) is closed to the other clans', () => {
    expect([clanFieldAdmits(0, -1), clanFieldAdmits(0xa0000003, -1), clanFieldAdmits(0xd0000003, -1), clanFieldAdmits(0xc0000003, -1), clanFieldAdmits(0xc0000003, 3)]).toEqual([true, true, true, false, true]);
  });

  it('the most MaxPlayers less MinPlayers; then the smaller GenericField2; then the first in the list\'s order; none, null', () => {
    const a = game('a', 1, { maxPlayers: 8 }), b = game('b', 2, { maxPlayers: 16, genericField2: 600 }), c = game('c', 3, { maxPlayers: 16, genericField2: 300 }), d = game('d', 4, { maxPlayers: 16, genericField2: 300 });
    expect(autoplayPick([a, b, c, d])?.gameName).toBe('c');
    expect(autoplayPick([a, b])?.gameName).toBe('b');
    expect(autoplayPick([d, c])?.gameName).toBe('d');
    expect(autoplayPick([game('e', 5, { minPlayers: 4, maxPlayers: 16 }), game('f', 6, { minPlayers: 2, maxPlayers: 15 })])?.gameName).toBe('f');   // 12 < 13
    expect(autoplayPick([])).toBeNull();
  });
});

function search(entries: GameListEntry[] | 'never', o: { rooms?: ChannelListEntry[]; filters?: { players: number; admits?: (e: GameListEntry) => boolean } } = {}) {
  const sent: string[] = [];
  const events: string[] = [];
  const found: string[] = [];
  const joined: string[] = [];
  let reads = 0;
  const service: AutoplayService = {
    clearGameListFilter: (q) => { sent.push(`clear ${q.filterId}`); return Promise.resolve({ status: 0 }); },
    setGameListFilter: (q) => { sent.push(`set ${q.filterField} ${q.comparisonOperator} ${q.baselineValue}`); return Promise.resolve({ status: 0, filterId: q.filterField }); },
    gameList: (q) => { sent.push(`list ${q.pageId} ${q.pageSize}`); return entries === 'never' ? new Promise(() => {}) : Promise.resolve(entries); },
  };
  const briefing: AutoplayBriefing = {
    readAutoplayFilters: () => { reads++; }, admits: o.filters?.admits ?? (() => true), playerFilter: () => o.filters?.players ?? 0,
    joinRoomForRandomGame: (n) => { joined.push(n); return true; },
  };
  const s = new AutoplaySearch({ service, briefing, rooms: () => o.rooms ?? ROOMS, event: (k) => { events.push(names[k]!); }, found: (g) => { found.push(g.gameName); } });
  const flush = async (): Promise<void> => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  return { s, sent, events, found, joined, reads: () => reads, flush };
}

describe('AutoplaySearch: the chain\'s requests and its ends', () => {
  it('the constants are the builders\' (D:L197152, D:L197547-197549, D:L197580-197581, D:L197617)', () => {
    expect([AUTOPLAY_CLEAR_ROOM_FILTER, AUTOPLAY_PLAYER_FILTER, AUTOPLAY_LIST_QUERY, AUTOPLAY_CLEAR_PLAYER_FILTER]).toEqual([
      { filterId: 10 }, { filterField: 1, comparisonOperator: 3, baselineValue: 1 }, { pageId: 1, pageSize: 999 }, { filterId: 1 },
    ]);
  });

  it('clear 10, set 1 >= 1, the five filters read, list 1 of 999; the pick found, MP_RANDOM_GAME_FOUND, its room joined by GF1; clear 1', async () => {
    const t = search(last([game('a', 1, { maxPlayers: 8 }), game('b', 2, { genericField1: 2 }), game('c', 3, { securityLevel: 1, maxPlayers: 32 })]));
    t.s.start();
    await t.flush();
    expect(t.sent).toEqual(['clear 10', 'set 1 3 1', 'list 1 999', 'clear 1']);
    expect(t.reads()).toBe(1);
    expect([t.found, t.events, t.joined]).toEqual([['b'], ['MP_RANDOM_GAME_FOUND'], ['Bravo']]);
  });

  it('no candidate: MP_MEDIUS_JOIN_GAME_FAILURE (#803 on the menu), clear 1, no join', async () => {
    const t = search(last([game('a', 1, { playerCount: 0 }), game('b', 2, { securityLevel: 1 })]));
    t.s.start();
    await t.flush();
    expect([t.sent.at(-1), t.events, t.found, t.joined]).toEqual(['clear 1', ['MP_MEDIUS_JOIN_GAME_FAILURE'], [], []]);
  });

  it('Horizon\'s NoResult (no game at all): MP_MEDIUS_JOIN_GAME_FAILURE and clear 1 (D:L197610-197619)', async () => {
    const t = search([NO_RESULT]);
    t.s.start();
    await t.flush();
    expect([t.sent, t.events]).toEqual([['clear 10', 'set 1 3 1', 'list 1 999', 'clear 1'], ['MP_MEDIUS_JOIN_GAME_FAILURE']]);
  });

  it('the game\'s room not among the client\'s rooms: the game is kept, MP_MEDIUS_JOIN_GAME_FAILURE, no join (D:L197699-197703)', async () => {
    const t = search(last([game('a', 1, { genericField1: 9 })]));
    t.s.start();
    await t.flush();
    expect([t.found, t.events, t.joined]).toEqual([['a'], ['MP_MEDIUS_JOIN_GAME_FAILURE'], []]);
  });

  it('the list\'s filters and GamePlayerFilter decide (the briefing room\'s FUN_002e3080 and DAT_0044f530)', async () => {
    const t = search(last([game('a', 1, { playerCount: 3, maxPlayers: 32 }), game('b', 2, { playerCount: 5, genericField1: 2 })]), { filters: { players: 4 } });
    t.s.start();
    await t.flush();
    expect(t.found).toEqual(['b']);
    const u = search(last([game('a', 1, { maxPlayers: 32 }), game('b', 2, { genericField1: 2 })]), { filters: { players: 0, admits: (e) => e.gameName !== 'a' } });
    u.s.start();
    await u.flush();
    expect(u.found).toEqual(['b']);
  });

  it('a list never answered: nothing more is sent or posted', async () => {
    const t = search('never');
    t.s.start();
    await t.flush();
    expect([t.sent, t.events]).toEqual([['clear 10', 'set 1 3 1', 'list 1 999'], []]);
  });
});

// ---- over the machine ----

const SETTLED = 60;
const SECOND = 30;
type Rig = Awaited<ReturnType<typeof gameLobbyRig>>;
async function until(r: Rig, done: () => boolean, frames = 60 * SECOND): Promise<void> { for (let i = 0; i < frames && !done(); i++) await r.settle(1); }
const str = (r: Rig, n: string): string | null => { const v = r.uiVars.find(n)?.value; return v?.type === 'string' ? v.value : null; };

async function menu(games: GameListEntry[], extra: { clears?: number[] } = {}): Promise<Rig & { autoplay: string[] }> {
  let s!: AutoplaySearch;
  const autoplay: string[] = [];
  const r = await gameLobbyRig({ name: 'socomc', announcement: '', rooms: ROOMS, games, randomGame: () => s.start() });
  s = new AutoplaySearch({
    service: {
      clearGameListFilter: (q) => { autoplay.push(`clear ${q.filterId}`); extra.clears?.push(q.filterId); return Promise.resolve({ status: 0 }); },
      setGameListFilter: (q) => { autoplay.push(`set ${q.filterField}`); return Promise.resolve({ status: 0, filterId: q.filterField }); },
      gameList: (q) => { autoplay.push(`list ${q.pageSize}`); return Promise.resolve(games); },
    },
    briefing: r.briefing, rooms: () => r.world()?.rooms() ?? [], event: (k) => { r.post(names[k]!); }, found: (g) => { r.commands.randomGameFound(g); },
  });
  await r.settle(SETTLED);
  r.press('CROSS', 10);                                                    // SERVER NEWS' popup closed
  return Object.assign(r, { autoplay });
}
function go(r: Rig, name: string): void { for (let i = 0; i < 12 && r.focused() !== name; i++) r.press('DOWN', 6); expect(r.focused()).toBe(name); }

describe('AUTOPLAY\'s gate is lifted (OT.R8\'s row retired by ONL-15)', () => {
  it('join_random_game is no parked row: its CROSS runs', () => {
    expect(PARKED_ROWS.map((p) => p.control)).not.toContain('autoplay');
    expect(parkedRowGate({ dialog: WORLD_OF_SOCOM, animation: 'join_random_game' })).toBe(false);
  });
});

describe.skipIf(!HAVE)(`AUTOPLAY over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('CROSS: .DINK, #801, JoinMPGame(RANDOM) answered 1; the chain; the room joined with no MP_JOIN_ROOM; JoinGame for the pick; state 17\'s MP_MEDIUS_READY_TO_CONNECT runs join_game into the GAME LOBBY', async () => {
    const PICK = game('pick$~Bravo', 7, { genericField1: 2, maxPlayers: 24 });
    const r = await menu(last([game('small$~Alpha', 5, { maxPlayers: 8 }), PICK]));
    go(r, 'autoplay');
    const from = r.outcomes.length, sounds = r.sound.log.length;
    r.press('CROSS', 4);
    expect(r.sound.log.slice(sounds).some((l) => l.includes('.DINK'))).toBe(true);
    expect(r.shown()).toBe(true);                                                                          // #801, kept
    await until(r, () => r.joins.length > 0);
    expect(r.calls(WORLD_OF_SOCOM, from).filter((c) => c.startsWith('JoinMPGame'))[0]).toBe('JoinMPGame(RANDOM) table');
    expect(r.autoplay).toEqual(['clear 10', 'set 1', 'list 999', 'clear 1']);
    expect(r.requests.filter((q) => q.op === 'join-channel').map((q) => q.body)).toEqual([{ mediusWorldId: 2, lobbyChannelPassword: '' }]);
    expect(r.requests.filter((q) => q.op === 'set-filter').map((q) => q.body)).toEqual([{ filterField: 10, comparisonOperator: 0, baselineValue: 0 }]);
    expect(r.joins).toEqual([{ mediusWorldId: 7, joinType: 0, gamePassword: '' }]);
    expect([str(r, GAME_NAME_VAR), str(r, PLAYER_GAME_PASSWORD_VAR), str(r, 'MEDIUS_LOBBY_NAME')]).toEqual(['pick', '', 'Bravo']);
    expect(r.builds).not.toContain('dlgMPBriefingRoom.rdr');                                               // no MP_JOIN_ROOM
    await until(r, () => r.current() === GAME_LOBBY);
    expect(r.current()).toBe(GAME_LOBBY);
    expect(r.lobby.state()).toBe(LOBBY_STATE_IN_GAME);
    expect(r.socketLog[0]).toBe('open 7');
  });

  it('no game the filters admit: #803 (OnRandomGameFailure), the menu stays, nothing joined', async () => {
    const r = await menu([NO_RESULT]);
    go(r, 'autoplay');
    r.press('CROSS', 4);
    await r.settle(SETTLED);
    expect(r.autoplay).toEqual(['clear 10', 'set 1', 'list 999', 'clear 1']);
    expect([r.current(), r.joins.length, r.requests.filter((q) => q.op === 'join-channel').length]).toEqual([WORLD_OF_SOCOM, 0, 0]);
    expect(r.shown()).toBe(true);
    expect((r.parts.current?.popup()?.popup.text.lines ?? []).map((l) => new TextDecoder().decode(Uint8Array.from(l.bytes)).trim()).join(' ')).toContain(r.loc.byId.get(803)!.split('.')[0]!.trim());
  });
});

describe('the random-join flag is the lobby session\'s (FUN_002df8e0 D:L182283 at the close, FUN_002e0450 D:L182778 at the init)', () => {
  it('a refused AUTOPLAY room join, a logoff and a login: a listed room\'s join then posts MP_JOIN_ROOM and stands in state 11, not state 15', async () => {
    const valves = new ValveStore();
    const uiVars = new UiVarManager();
    lobbySessionStart(uiVars);
    const events: string[] = [];
    const lobby = new LobbyClient({ valves: () => valves, service: { login: () => Promise.resolve({ status: 0, ticket: 'T' }), register: () => Promise.resolve({ status: 0 }) }, event: () => {} });
    let refuse = true;
    const c = new BriefingRoomCommands({
      uiVars, valves: () => valves, lobby, rooms: () => ROOMS, event: (k) => { events.push(names[k]!); },
      service: {
        joinChannel: (q) => Promise.resolve({ status: refuse ? -948 : 0, mediusWorldId: q.mediusWorldId }), setGameListFilter: (q) => Promise.resolve({ status: 0, filterId: q.filterField }),
        leaveChannel: () => Promise.resolve({ status: 0 }), gameList: () => Promise.resolve([]),
      },
    });
    c.register(new UiCommandHost({}));
    const states: number[] = [];
    const step = async (n: number): Promise<void> => { for (let i = 0; i < n; i++) { lobby.step(); states.push(lobby.state()); for (let k = 0; k < 4; k++) await Promise.resolve(); } };
    const online = async (): Promise<void> => { lobby.connect('localhost', 10075); lobby.login('socomc', 'pw'); for (let i = 0; i < 12 && lobby.state() !== 11; i++) await step(1); };
    await online();
    expect(c.joinRoomForRandomGame('Bravo')).toBe(true);
    await step(4);
    expect([events, lobby.state()]).toEqual([['MP_MEDIUS_JOIN_ROOM_FAILURE'], 11]);
    lobby.disconnect();
    await online();
    refuse = false;
    events.length = 0; states.length = 0;
    c.JoinMPRoom({ anim: 'join_room', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'JoinMPRoom', arg: 'Alpha', loc: 0, bytes: new Uint8Array(0x10) }, {} as never, undefined);
    await step(4);
    expect(events).toEqual(['MP_JOIN_ROOM']);
    expect(states).not.toContain(LOBBY_STATE_JOIN_GAME);
    expect(lobby.state()).toBe(11);
  });
});
