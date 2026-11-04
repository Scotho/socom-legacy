import { describe, expect, it } from 'vitest';
import { UiVarManager, type UiVarValue } from '../../src/uiVars';
import { VALVE_TYPE, ValveStore } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import type { RadioStripWidget } from '../../src/widgets/radioStrip';
import { lobbySessionStart, seedWorldOfSocomValves, type ChannelListEntry } from '../../src/screens/worldOfSocomCommands';
import { BriefingRoomCommands, GAME_LIST_VAR, MEDIUS_LOBBY_NAME_VAR, seedBriefingRoomValves, type GameListEntry, type RoomLobby } from '../../src/screens/briefingRoomCommands';
import type { MissionRecord } from '../../src/screens/createGameCommands';
import {
  GAME_TYPE_FILTER_TYPES, MAP_TYPE_CYCLE, NUM_MULTI_MISSIONS_VALVE, ONLINE_FILTERS, ONLINE_FILTER_RESET, OnlineFiltersCommands, gameTypePasses, missionGameType,
  numMultiMissions, playListOf, seedNumMultiMissions,
} from '../../src/screens/onlineFiltersCommands';
import { discMissions, HAVE as HAVE_MISSIONS } from './createGameRig';
import { HAVE, worldRig } from './worldOfSocomRig';

/**
 * ONL-15 (web research 265 §2): ONLINE FILTERS (`dlgOnlineFilters.rdr`) and the game list's filter it sets.
 * - The game-type test (`FUN_002e31e0` D:L184549-184617 over `FUN_002c8b80`'s mission types) and `GetMissionInformation`
 *   (`FUN_00275ef0` D:L122200-122252), off the machine.
 * - The client's filters over a seeded set of games (`FUN_002e3080` D:L184509-184546, the briefing room's draw): for
 *   each valve the drawn list equals the hand-filtered one. The server honours only the two fields the console sends
 *   (`packages/central/test/lobby.test.ts`'s seeded set); every other filter is dropped here, on the page.
 * - The page over the machine, built from the disc's layout and scripts (or the committed fixtures): its rows, their
 *   valves and descriptions, RESET, the way back, the change flag ONLINE OPTIONS' RETURN saves on.
 * Synthetic games and the disc's own records; nothing measured on the original running (ONL-32's captures).
 */

const SETTLED = 60;
/** A mission table of five: one map of each game type, and a second Suppression map (numbers as the disc's). */
const MISSIONS: MissionRecord[] = [
  { number: 51, name: 'VIGILANCE', type: 5, multiplayer: true }, { number: 72, name: 'CROSSROADS', type: 2, multiplayer: true },
  { number: 61, name: 'SUJO', type: 1, multiplayer: true }, { number: 52, name: 'THE MIXER', type: 3, multiplayer: true },
  { number: 2, name: 'FROSTFIRE', type: 5, multiplayer: true }, { number: 71, name: 'FISH HOOK', type: 4, multiplayer: true },
  { number: 90, name: 'A CAMPAIGN MAP', type: 2, multiplayer: false },
];

describe('the game-type filter (FUN_002e31e0) and the mission table (FUN_002c8b80, FUN_002c8c10)', () => {
  it('a map\'s type is its multiplayer record\'s TYPE; a number no multiplayer record holds has none', () => {
    expect([missionGameType(MISSIONS, 51), missionGameType(MISSIONS, 72), missionGameType(MISSIONS, 90), missionGameType(MISSIONS, 3)]).toEqual([5, 2, 0, 0]);
  });

  it('252..248 name Suppression, Demolition, Extraction, Escort, Breach (the captions #656-#660); the cycle is the script\'s', () => {
    expect(GAME_TYPE_FILTER_TYPES).toEqual({ 252: 5, 251: 2, 250: 4, 249: 3, 248: 1 });
    expect(MAP_TYPE_CYCLE).toEqual([0, 251, 250, 252, 249, 248]);
  });

  it('0 passes every game; a type value a play list of that one type; a map value that map alone', () => {
    const pass = (filter: number, list: number[]): boolean => gameTypePasses(filter, list, MISSIONS);
    expect([pass(0, []), pass(0, [51, 72])]).toEqual([true, true]);
    expect([pass(252, [51]), pass(252, [51, 2, 51]), pass(252, [72]), pass(252, [51, 72]), pass(252, [])]).toEqual([true, true, false, false, false]);
    expect([pass(251, [72]), pass(250, [71]), pass(249, [52]), pass(248, [61])]).toEqual([true, true, true, true]);
    expect([pass(51, [51]), pass(51, [51, 51]), pass(51, [51, 2]), pass(51, [2]), pass(51, [])]).toEqual([true, true, false, false, false]);
    expect(pass(72, [72, 51])).toBe(false);                                                   // mixed types: refused before the value is read
  });

  it('the play list is the \'D\' record\'s bytes from 8 to the first 0, at most 0x20', () => {
    const d = new Uint8Array(0x28); d[8] = 51; d[9] = 2; d[10] = 0; d[11] = 72;
    expect(playListOf(d)).toEqual([51, 2]);
    expect(playListOf(new Uint8Array(0x28).fill(7)).length).toBe(0x20);
  });

  it('NumMultiMissions counts the multiplayer missions present (FUN_002c8c10 D:L168587-168598)', () => {
    const valves = new ValveStore();
    seedNumMultiMissions(valves, MISSIONS);
    expect([numMultiMissions(MISSIONS), valves.find(NUM_MULTI_MISSIONS_VALVE)?.value, numMultiMissions(MISSIONS, (n) => n !== 2)]).toEqual([6, 6, 5]);
  });
});

describe('GetMissionInformation (FUN_00275ef0) as a row', () => {
  /** The disc's record (`increment_game_filter`): flag 1 at +0x10, the names' indices 5, 4, 3 at +0x14, +0x18, +0x1c. */
  const record = (): ZAnimUiCommand => {
    const bytes = new Uint8Array(0x20);
    const v = new DataView(bytes.buffer);
    bytes[0x10] = 1; v.setInt32(0x14, 5, true); v.setInt32(0x18, 4, true); v.setInt32(0x1c, 3, true);
    return { anim: 'increment_game_filter', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'GetMissionInformation', arg: 'NA', loc: 0, bytes };
  };
  const NAMES = ['', '', '', 'GameTypeMapIndex', 'GameTypeFilter', 'MissionNameUIVar'];
  const run = (index: number) => {
    const uiVars = new UiVarManager(), valves = new ValveStore();
    valves.set('GameTypeMapIndex', index, VALVE_TYPE.PERSIST);
    const answer = new OnlineFiltersCommands({ uiVars, valves: () => valves, missions: () => MISSIONS, name: (_c, i) => NAMES[i] ?? null }).GetMissionInformation(record(), {} as never, undefined);
    const text = uiVars.find('MissionNameUIVar')?.value;
    return [answer, text?.type === 'string' ? text.value : null, valves.find('GameTypeFilter')?.value ?? null];
  };
  it('the index\'s multiplayer mission, in the table\'s order: its NAME into the variable, its NUMBER into the valve; answers 1', () => {
    expect(run(1)).toEqual([true, 'VIGILANCE', 51]);
    expect(run(5)).toEqual([true, 'FROSTFIRE', 2]);
    expect(run(6)).toEqual([true, 'FISH HOOK', 71]);
  });
  it('an index past the multiplayer missions (or 0) writes nothing and answers 1', () => {
    expect(run(7)).toEqual([true, null, null]);
    expect(run(0)).toEqual([true, null, null]);
  });
});

// ---- the client's filters over a seeded set (FUN_002e3080) ----

const statsHex = (o: { slots?: number; map?: number[] } = {}): string => {
  const b = new Uint8Array(256);
  b[0] = 0x44; b[4] = o.slots ?? 0;
  (o.map ?? []).forEach((n, i) => { b[8 + i] = n; });
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};
const entry = (gameName: string, id: number, o: { players: number; speed: number; password: boolean; ff: boolean; map: number[] }): GameListEntry => ({
  status: 0, mediusWorldId: id, playerCount: o.players, minPlayers: 2, maxPlayers: 16, gameLevel: o.map[0] ?? 0, playerSkillLevel: 0, rulesSet: o.ff ? 1 : 0,
  genericField1: 1, genericField2: o.speed, genericField3: 0, securityLevel: o.password ? 1 : 0, worldStatus: 1, gameHostType: 0, gameName, gameStats: statsHex({ map: o.map }), endOfList: false,
});
/** The seeded set: players, speed (GenericField2), password, friendly fire and the play list vary. */
const SEEDED: GameListEntry[] = [
  entry('a', 1, { players: 1, speed: 250, password: false, ff: true, map: [51] }),
  entry('b', 2, { players: 3, speed: 450, password: true, ff: false, map: [72] }),
  entry('c', 3, { players: 5, speed: 900, password: false, ff: false, map: [2, 51] }),
  entry('d', 4, { players: 8, speed: 65000, password: false, ff: true, map: [61] }),
  entry('e', 5, { players: 12, speed: 300, password: true, ff: true, map: [51, 72] }),
  entry('f', 6, { players: 15, speed: 1200, password: false, ff: false, map: [71] }),
].map((g, i, all) => ({ ...g, endOfList: i === all.length - 1 }));

async function drawn(set: Record<string, number>): Promise<string[]> {
  const uiVars = new UiVarManager();
  lobbySessionStart(uiVars);
  uiVars.set(uiVars.add(MEDIUS_LOBBY_NAME_VAR, null, 2), { type: 'string', value: 'Alpha' });
  uiVars.set(uiVars.find(GAME_LIST_VAR)!, { type: 'array', value: [] });
  const valves = new ValveStore();
  seedWorldOfSocomValves(valves);
  seedBriefingRoomValves(valves);
  for (const [n, v] of Object.entries(set)) valves.set(n, v, VALVE_TYPE.PERSIST);
  const lobby: RoomLobby = { up: true, state: () => 11, queueState: () => {}, setHandler: () => {} } as unknown as RoomLobby;
  const rooms: ChannelListEntry[] = [{ status: 0, mediusWorldId: 1, playerCount: 0, maxPlayers: 64, securityLevel: 0, genericField1: 0, lobbyName: 'Alpha', endOfList: true }];
  const c = new BriefingRoomCommands({
    uiVars, valves: () => valves, lobby, rooms: () => rooms, missions: () => MISSIONS,
    service: { joinChannel: () => new Promise(() => {}), setGameListFilter: () => new Promise(() => {}), leaveChannel: () => new Promise(() => {}), gameList: () => Promise.resolve(SEEDED) },
  });
  c.RefreshGameList({ anim: 'autorefresh', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'RefreshGameList', arg: 'NA', loc: 0, bytes: new Uint8Array(0x10) }, {} as never, undefined);
  for (let i = 0; i < 4; i++) await Promise.resolve();
  const v = uiVars.find(GAME_LIST_VAR)?.value as UiVarValue;
  return v.type === 'array' ? v.value.map((r) => (r.type === 'array' && r.value[0]?.type === 'string' ? r.value[0].value : '?')) : [];
}
/** The hand filter: each valve's rule as `FUN_002e3080` reads it, over the seeded set. */
function byHand(f: Partial<Record<keyof typeof ONLINE_FILTER_RESET, number>>): string[] {
  const v = { ...ONLINE_FILTER_RESET, ...f };
  return SEEDED.filter((g) => {
    const locked = (g.securityLevel & 1) !== 0;
    if (v.GamePasswordFilter === 0 && locked) return false;
    if (v.GamePasswordFilter === 1 && !locked) return false;
    if (!gameTypePasses(v.GameTypeFilter, playListOf(Buffer.from(g.gameStats, 'hex').subarray(0, 0x28)), MISSIONS)) return false;
    return g.playerCount >= v.GamePlayerFilter && g.genericField2 <= v.GameSpeedFilter && (v.FF_FILTER === 2 || (v.FF_FILTER === 1) === ((g.rulesSet & 1) !== 0));
  }).map((g) => g.gameName).sort();
}

describe('the game list\'s filters over a seeded set: the page drops what the console drops (FUN_002e3080)', () => {
  const cases: [string, Partial<Record<keyof typeof ONLINE_FILTER_RESET, number>>][] = [
    ['the reset values (every game)', {}],
    ['# OF PLAYERS more than 4 (GamePlayerFilter 4: at least 4)', { GamePlayerFilter: 4 }],
    ['# OF PLAYERS 14', { GamePlayerFilter: 14 }],
    ['RESPONSE TIME Fast (300)', { GameSpeedFilter: 300 }],
    ['RESPONSE TIME Average (600)', { GameSpeedFilter: 600 }],
    ['RESPONSE TIME Slow (1200)', { GameSpeedFilter: 1200 }],
    ['FRIENDLY FIRE ENABLED', { FF_FILTER: 1 }],
    ['FRIENDLY FIRE DISABLED', { FF_FILTER: 0 }],
    ['PASSWORD NO PASS', { GamePasswordFilter: 0 }],
    ['PASSWORD PASS ONLY', { GamePasswordFilter: 1 }],
    ['MAP TYPE Suppression ONLY (252)', { GameTypeFilter: 252 }],
    ['MAP TYPE Demolition ONLY (251)', { GameTypeFilter: 251 }],
    ['MAP TYPE Breach ONLY (248)', { GameTypeFilter: 248 }],
    ['MAP TYPE one map (VIGILANCE, 51)', { GameTypeFilter: 51 }],
    ['three at once', { GamePlayerFilter: 2, GameSpeedFilter: 1200, FF_FILTER: 0 }],
  ];
  for (const [what, f] of cases) {
    it(what, async () => { expect((await drawn(f)).sort()).toEqual(byHand(f)); });
  }
  it('the hand filter is not empty where it should not be (the set exercises each rule)', () => {
    expect(byHand({ GameTypeFilter: 252 })).toEqual(['a', 'c']);                                   // c plays FROSTFIRE and VIGILANCE: both Suppression
    expect(byHand({ GameTypeFilter: 51 })).toEqual(['a']);
    expect(byHand({ GamePasswordFilter: 1 })).toEqual(['b', 'e']);
    expect(byHand({ GameSpeedFilter: 300 })).toEqual(['a', 'e']);
    expect(byHand({ FF_FILTER: 0 })).toEqual(['b', 'c', 'f']);
    expect(byHand({ GamePlayerFilter: 8 })).toEqual(['d', 'e', 'f']);
  });
});

// ---- the page over the machine ----

const MP = HAVE && HAVE_MISSIONS ? discMissions() : [];
type Rig = ReturnType<typeof worldRig>;
async function filters(valves: Record<string, number> = {}): Promise<Rig> {
  const r = worldRig({
    start: ONLINE_FILTERS, name: 'socomc',
    register: (host, ctx) => {
      new OnlineFiltersCommands({ uiVars: ctx.uiVars, valves: () => ctx.machine().valves, missions: () => MP, name: (cmd, i) => ctx.parts.current?.name(cmd, i) ?? null }).register(host);
    },
  });
  seedNumMultiMissions(r.m.valves, MP);
  seedBriefingRoomValves(r.m.valves);                                    // the page's boot loads global_valves.rdr whole: GamePasswordFilter, LockedFilter 2
  for (const [name, value] of Object.entries(valves)) r.m.valves.set(name, value, VALVE_TYPE.PERSIST);
  await r.settle(SETTLED);
  expect(r.current()).toBe(ONLINE_FILTERS);
  return r;
}
function go(r: Rig, name: string): void {
  for (let i = 0; i < 12 && r.focused() !== name; i++) r.press('DOWN', 6);
  expect(r.focused()).toBe(name);
}
const loc = (r: Rig, id: number): string => r.loc.byId.get(id)!.trim();
const strip = (r: Rig, name: string): RadioStripWidget => r.parts.current!.widgets.get(name) as unknown as RadioStripWidget;
async function cross(r: Rig): Promise<void> { r.press('CROSS', 6); await r.settle(10); }

describe.skipIf(!HAVE || !HAVE_MISSIONS)(`ONLINE FILTERS over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('the disc\'s table: 22 multiplayer missions, VIGILANCE first (NumMultiMissions 22)', () => {
    expect([numMultiMissions(MP), MP.filter((m) => m.multiplayer)[0]?.name]).toEqual([22, 'VIGILANCE']);
  });

  it('ONSTART: the three descriptions at the reset values (#655 ANY MAP, #661, #669), both strips on DON\'T CARE, MAP TYPE active, no change', async () => {
    const r = await filters();
    expect([r.text('game_type_desc'), r.text('game_player_desc'), r.text('game_speed_desc')]).toEqual([[loc(r, 655)], [loc(r, 661)], [loc(r, 669)]]);
    expect([strip(r, 'FF').selection, strip(r, 'Pword').selection]).toEqual([2, 2]);
    expect(r.focused()).toBe('gamestype');
    expect([r.valve('MapChanged'), r.valve('PlayersChanged'), r.valve('FFChanged'), r.valve('PassChanged')]).toEqual([0, 0, 0, 0]);
  });

  it('MAP TYPE: CROSS cycles 251, 250, 252, 249, 248 (#657, #658, #656, #659, #660), then each map by GetMissionInformation (its name drawn, its number the filter), then back to ANY MAP', async () => {
    const r = await filters();
    const seen: [number | undefined, number | undefined, string[]][] = [];
    for (let i = 0; i < 5; i++) { await cross(r); seen.push([r.valve('GameTypeMapIndex'), r.valve('GameTypeFilter'), r.text('game_type_desc')]); }
    expect(seen).toEqual([[251, 251, [loc(r, 657)]], [250, 250, [loc(r, 658)]], [252, 252, [loc(r, 656)]], [249, 249, [loc(r, 659)]], [248, 248, [loc(r, 660)]]]);
    await cross(r);
    expect([r.valve('GameTypeMapIndex'), r.valve('GameTypeFilter'), r.text('game_type_desc')]).toEqual([1, 51, ['VIGILANCE']]);
    await cross(r);
    expect([r.valve('GameTypeMapIndex'), r.valve('GameTypeFilter'), r.text('game_type_desc')]).toEqual([2, 52, ['THE MIXER']]);
    expect([r.valve('OptionsMenuChanged'), r.valve('MapChanged')]).toEqual([1, 1]);
    r.m.valves.set('GameTypeMapIndex', 22, VALVE_TYPE.PERSIST);
    await cross(r);
    expect([r.valve('GameTypeMapIndex'), r.valve('GameTypeFilter'), r.text('game_type_desc')]).toEqual([0, 0, [loc(r, 655)]]);
  });

  it('# OF PLAYERS: 0, 2, 4 .. 14, 0 (#661-#668); RESPONSE TIME: 65000, 300, 600, 1200, 65000 (#669-#672)', async () => {
    const r = await filters();
    go(r, 'NumPlayersTab');
    const players: (number | undefined)[] = [];
    for (let i = 0; i < 8; i++) { await cross(r); players.push(r.valve('GamePlayerFilter')); }
    expect(players).toEqual([2, 4, 6, 8, 10, 12, 14, 0]);
    expect(r.text('game_player_desc')).toEqual([loc(r, 661)]);
    go(r, 'responsetime');
    const speeds: [number | undefined, string[]][] = [];
    for (let i = 0; i < 4; i++) { await cross(r); speeds.push([r.valve('GameSpeedFilter'), r.text('game_speed_desc')]); }
    expect(speeds).toEqual([[300, [loc(r, 670)]], [600, [loc(r, 671)]], [1200, [loc(r, 672)]], [65000, [loc(r, 669)]]]);
    expect([r.valve('OptionsMenuChanged'), r.valve('PlayersChanged'), r.valve('SpeedChanged')]).toEqual([1, 1, 1]);
  });

  it('the strips: FRIENDLY FIRE ENABLED / DISABLED / DON\'T CARE write FF_FILTER 1 / 0 / 2; PASSWORD NO PASS / PASS ONLY / DON\'T CARE write GamePasswordFilter 0 / 1 / 2', async () => {
    const r = await filters();
    go(r, 'FF');
    r.press('LEFT', 6);
    expect([strip(r, 'FF').selection, r.valve('FF_FILTER'), r.valve('FFChanged')]).toEqual([1, 0, 1]);
    r.press('LEFT', 6);
    expect([strip(r, 'FF').selection, r.valve('FF_FILTER')]).toEqual([0, 1]);
    go(r, 'Pword');
    r.press('LEFT', 6);
    expect([strip(r, 'Pword').selection, r.valve('GamePasswordFilter'), r.valve('PassChanged')]).toEqual([1, 1, 1]);
    r.press('LEFT', 6);
    expect([strip(r, 'Pword').selection, r.valve('GamePasswordFilter')]).toEqual([0, 0]);
    expect(r.valve('OptionsMenuChanged')).toBe(1);
  });

  it('the strips start from their valves (FF_FILTER 1 on ENABLED, GamePasswordFilter 0 on NO PASS)', async () => {
    const r = await filters({ FF_FILTER: 1, GamePasswordFilter: 0 });
    expect([strip(r, 'FF').selection, strip(r, 'Pword').selection]).toEqual([0, 0]);
  });

  it('RESET FILTERS: the seven valves to 0, 0, 0, 65000, 2, 2, 2, OptionsMenuChanged 1, the descriptions redrawn, #648', async () => {
    const r = await filters({ GamePlayerFilter: 8, GameSpeedFilter: 300, FF_FILTER: 0, GamePasswordFilter: 1, LockedFilter: 0, GameTypeMapIndex: 251, GameTypeFilter: 251 });
    go(r, 'resetFilters');
    await cross(r);
    const now = Object.fromEntries(Object.keys(ONLINE_FILTER_RESET).map((n) => [n, r.valve(n)]));
    expect(now).toEqual({ ...ONLINE_FILTER_RESET });
    expect(r.valve('OptionsMenuChanged')).toBe(1);
    expect([r.text('game_type_desc'), r.text('game_speed_desc'), r.text('DescriptionText')]).toEqual([[loc(r, 655)], [loc(r, 669)], [loc(r, 648)]]);
  });

  it('TRIANGLE after a change asks (the popup); with none it goes back to ONLINE OPTIONS; RETURN goes back to the previous screen', async () => {
    const r = await filters();
    go(r, 'NumPlayersTab');
    await cross(r);
    r.press('TRIANGLE', 6);
    expect(r.shown()).toBe(true);
    const q = await filters();
    q.press('TRIANGLE', 6);
    await q.settle(SETTLED);
    expect(q.builds.at(-1)).toBe('dlgOnlineOptions.rdr');
  });
});
