import { describe, expect, it } from 'vitest';
import { UI_COMMAND_TABLE, UiCommandHost, uiCommandRowByName } from '../../src/uiCommands';
import { UiVarManager } from '../../src/uiVars';
import { VALVE_TYPE, ValveStore } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import type { ChannelListEntry } from '../../src/screens/worldOfSocomCommands';
import type { MissionRecord } from '../../src/screens/createGameCommands';
import {
  BRIEFING_ROOM_COMMAND_ROWS, BRIEFING_ROOM_ENTRY_COMMANDS, BriefingRoomCommands, GAME_INFO_DETAILS_VAR, GAME_INFO_RANK_RESTRICTIONS_VALVE,
  MEDIUS_LOBBY_NAME_VAR, MISSION_AVAILABLE_VALVE, currentGameDetails, gameDetails, type CurrentGameHeld, type GameListEntry,
} from '../../src/screens/briefingRoomCommands';

/**
 * `GetGameInfo` (row id 172, `FUN_00279d50` D:L124151-124170; research 154 §7.1): GAME DETAILS. 'CurrentGame' (S:0x3eede8,
 * without case) builds the player's own game from the valves (`FUN_002e24d0` D:L184131-184228); any other name the
 * room's listed record (`FUN_002e1f20` D:L183973-184130, `gameDetails`). Synthetic values: the mission table is a
 * test's, not the disc's; nothing measured on the original running.
 */

const MISSIONS: MissionRecord[] = [
  { number: 51, name: 'Map A', type: 5, multiplayer: true },
  { number: 2, name: 'Map B', type: 5, multiplayer: true },
  { number: 72, name: 'Map C', type: 1, multiplayer: true },
  { number: 9, name: 'Single', type: 1, multiplayer: false },
];
const cmd = (arg: string, anim = 'show_game_details'): ZAnimUiCommand =>
  ({ anim, sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'GetGameInfo', arg, loc: 0, bytes: new Uint8Array(0x10) });
const call = (c: ZAnimUiCommand) => [c, uiCommandRowByName('GetGameInfo')!, undefined] as const;
const stats = (o: { rounds?: number; minutes?: number; eq?: number; ranks?: number; list?: number[] } = {}): string => {
  const b = new Uint8Array(256);
  b[0] = 0x44; b[1] = o.rounds ?? 0; b[2] = o.minutes ?? 0; b[5] = o.eq ?? 0; b[7] = o.ranks ?? 0;
  (o.list ?? []).forEach((m, i) => { b[8 + i] = m; });
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};
const game = (gameName: string, o: Partial<GameListEntry> = {}): GameListEntry => ({
  status: 0, mediusWorldId: 7, playerCount: 1, minPlayers: 2, maxPlayers: 24, gameLevel: 51, playerSkillLevel: 0, rulesSet: 0, genericField1: 1,
  genericField2: 65000, genericField3: 0, securityLevel: 0, worldStatus: 1, gameHostType: 0, gameName, gameStats: stats(), endOfList: false, ...o,
});
const ROOMS: ChannelListEntry[] = [{ status: 0, mediusWorldId: 1, playerCount: 0, maxPlayers: 64, securityLevel: 0, genericField1: 0, lobbyName: 'Alpha', endOfList: true }];

function rig(o: { current?: CurrentGameHeld | null; valves?: Record<string, number> } = {}) {
  const uiVars = new UiVarManager();
  const valves = new ValveStore();
  for (const [k, v] of Object.entries(o.valves ?? {})) valves.set(k, v, VALVE_TYPE.PERM);
  let input: string | null = null;
  const c = new BriefingRoomCommands({
    uiVars, valves: () => valves, rooms: () => ROOMS, inputString: () => input, missions: () => MISSIONS,
    ...(o.current !== undefined ? { currentGame: () => o.current! } : {}),
  });
  const host = new UiCommandHost({});
  c.register(host);
  const text = (): unknown => { const v = uiVars.find(GAME_INFO_DETAILS_VAR)?.value; return v?.type === 'string' ? v.value : v; };
  /** The room Alpha joined (MEDIUS_LOBBY_NAME) and its game list answered. */
  const listed = (entries: GameListEntry[]): void => {
    uiVars.set(uiVars.add(MEDIUS_LOBBY_NAME_VAR, null, 2), { type: 'string', value: 'Alpha' });
    c.gameListReply(entries.map((e, i) => ({ ...e, endOfList: i === entries.length - 1 })));
  };
  return { uiVars, valves, c, host, text, listed, setInput: (s: string | null) => { input = s; } };
}

/** The valves the 24/7 respawn game holds after its entry (`enterGameLobby`, `FUN_002f83b0` D:L197176-197300): FF.R13's 1 round of 10 minutes ('D'[2] 10 x 60), respawn. */
const RESPAWN_247 = { mp_max_rounds: 1, mp_max_round_time: 600, mp_allow_respawn: 1, mp_friendly_fire: 0, EQlimit: 0 };

describe('the row (FUN_00279d50, id 172)', () => {
  it('is BRIEFING_ROOM_COMMAND_ROWS\' -- the table\'s row 170, id 172, ONL-12 -- and the room\'s entry is this module\'s', () => {
    const r = BRIEFING_ROOM_COMMAND_ROWS.find((x) => x.name === 'GetGameInfo');
    expect(r).toEqual({ row: 170, id: 172, name: 'GetGameInfo', fn: 0x279d50, task: 'ONL-12' });
    const row = uiCommandRowByName('GetGameInfo')!;
    expect([row.index, row.id, row.fn, row.task]).toEqual([170, 172, 0x279d50, 'ONL-12']);
    expect(UI_COMMAND_TABLE[170]!.name).toBe('GetGameInfo');
    expect(BRIEFING_ROOM_ENTRY_COMMANDS.find((e) => e.name === 'GetGameInfo')).toMatchObject({ state: 'here', task: 'ONL-12' });
  });

  it('register sets its body: a dispatch reaches it and answers 1 (D:L124169)', () => {
    const r = rig({ current: { playList: [51], mission: 'mp51' }, valves: RESPAWN_247 });
    expect(r.host.dispatch(cmd('CurrentGame'))).toMatchObject({ kind: 'table', answer: true });
    expect(r.text()).toBe('SUPPRESSION\nROUND COUNT:1\nROUND TIME:10 min.\nRESPAWN\n');
  });
});

describe("GetGameInfo('CurrentGame'): the own game from the valves (FUN_002e24d0 D:L184131-184228)", () => {
  it('the 24/7 respawn game: the type word, ROUND COUNT:%d, ROUND TIME:%d min. (mp_max_round_time / 60), RESPAWN -- each part ended by "\\n", no map line', () => {
    const r = rig({ current: { playList: [51, 2], mission: 'mp51' }, valves: RESPAWN_247 });
    expect(r.c.GetGameInfo(...call(cmd('CurrentGame')))).toBe(true);
    expect(r.text()).toBe('SUPPRESSION\nROUND COUNT:1\nROUND TIME:10 min.\nRESPAWN\n');
    // the own path writes neither MISSION_AVAILABLE nor game_info_rank_restrictions
    expect([r.valves.find(MISSION_AVAILABLE_VALVE), r.valves.find(GAME_INFO_RANK_RESTRICTIONS_VALVE)]).toEqual([undefined, undefined]);
  });

  it("'CurrentGame' is compared without case (FUN_00198b80, D:L124161)", () => {
    const r = rig({ current: { playList: [51], mission: 'mp51' }, valves: RESPAWN_247 });
    r.c.GetGameInfo(...call(cmd('currentgame')));
    expect(r.text()).toBe('SUPPRESSION\nROUND COUNT:1\nROUND TIME:10 min.\nRESPAWN\n');
  });

  it('MEDLEY when a held play-list entry\'s type differs from the first one\'s (FUN_002f82e0, lobby +0x84; D:L184155-184166)', () => {
    const r = rig({ current: { playList: [51, 72], mission: 'mp51' }, valves: RESPAWN_247 });
    r.c.GetGameInfo(...call(cmd('CurrentGame')));
    expect(r.text()).toBe('MEDLEY\nROUND COUNT:1\nROUND TIME:10 min.\nRESPAWN\n');
  });

  it('one type: the word is the current mission\'s (FUN_0027f800 -> 0x414e00, FUN_002c8a00: its number past two letters), not the play list\'s', () => {
    expect(currentGameDetails(new ValveStore(), { playList: [51, 2], mission: 'mp72' }, MISSIONS)).toBe('BREACH\nROUND COUNT:0\nROUND TIME:0 min.\n');
    // no mission (two characters or fewer: D:L168456-168457), or one the table does not hold: UNKNOWN (S:0x3f3b88)
    expect(currentGameDetails(new ValveStore(), { playList: [51], mission: '' }, MISSIONS)).toBe('UNKNOWN\nROUND COUNT:0\nROUND TIME:0 min.\n');
    expect(currentGameDetails(new ValveStore(), { playList: [51], mission: 'mp9' }, MISSIONS)).toBe('UNKNOWN\nROUND COUNT:0\nROUND TIME:0 min.\n');
  });

  it('FRIENDLY FIRE when mp_friendly_fire, before RESPAWN; the minutes truncated (ushort / 0x3c, D:L184198)', () => {
    const r = rig({ current: { playList: [51], mission: 'mp51' }, valves: { ...RESPAWN_247, mp_friendly_fire: 1, mp_max_rounds: 11, mp_max_round_time: 379 } });
    r.c.GetGameInfo(...call(cmd('CurrentGame')));
    expect(r.text()).toBe('SUPPRESSION\nROUND COUNT:11\nROUND TIME:6 min.\nFRIENDLY FIRE\nRESPAWN\n');
  });

  it('EQlimit 1, 2, 3: PISTOLS ONLY, SHOTGUNS ONLY, SNIPERS ONLY; 0 no line; any other value the line\'s ending alone (D:L184211-184225)', () => {
    const text = (eq: number): string => currentGameDetails(rigValves({ mp_max_rounds: 1, mp_max_round_time: 600, EQlimit: eq }), { playList: [51], mission: 'mp51' }, MISSIONS);
    const head = 'SUPPRESSION\nROUND COUNT:1\nROUND TIME:10 min.\n';
    expect([0, 1, 2, 3, 4].map(text)).toEqual([head, `${head}PISTOLS ONLY\n`, `${head}SHOTGUNS ONLY\n`, `${head}SNIPERS ONLY\n`, `${head}\n`]);
  });

  it('with no game held (the lobby\'s play list zeroed, FUN_002e0710 D:L182874-182885; no mission): UNKNOWN and the valves as they stand', () => {
    const r = rig({ current: null, valves: RESPAWN_247 });
    r.c.GetGameInfo(...call(cmd('CurrentGame')));
    expect(r.text()).toBe('UNKNOWN\nROUND COUNT:1\nROUND TIME:10 min.\nRESPAWN\n');
  });
});

function rigValves(v: Record<string, number>): ValveStore {
  const s = new ValveStore();
  for (const [k, n] of Object.entries(v)) s.set(k, n, VALVE_TYPE.PERM);
  return s;
}

describe('GetGameInfo(<name>): the room\'s listed record (FUN_002e1f20 D:L183973-184130)', () => {
  it('INPUT_STRING (the list\'s row): the record of that drawn name in the joined room -- gameDetails\' caption, MISSION_AVAILABLE 1, game_info_rank_restrictions D[7]', () => {
    const r = rig();
    const g = game('test$~Alpha', { rulesSet: 3, gameStats: stats({ rounds: 11, minutes: 6, eq: 3, ranks: 0b0101, list: [51, 2] }) });
    r.listed([game('other$~Alpha'), g]);
    r.setInput('test');
    expect(r.c.GetGameInfo(...call(cmd('INPUT_STRING', 'UpdateGameListInfo')))).toBe(true);
    expect(r.text()).toBe('Map A\nSUPPRESSION\nROUND COUNT:11\nROUND TIME:6\nFRIENDLY FIRE\nRESPAWN\nSNIPERS ONLY\n');
    expect(r.text()).toBe(gameDetails(g, MISSIONS).mission!.text);
    expect([r.valves.find(MISSION_AVAILABLE_VALVE)!.value, r.valves.find(GAME_INFO_RANK_RESTRICTIONS_VALVE)!.value]).toEqual([1, 0b0101]);
  });

  it('a play list naming a mission the table does not hold: "UNAVAILABLE" alone, MISSION_AVAILABLE 0, game_info_rank_restrictions not written (D:L184113-184121)', () => {
    const r = rig();
    r.listed([game('ok$~Alpha', { gameStats: stats({ ranks: 0b0010, list: [51] }) }), game('bad$~Alpha', { gameStats: stats({ ranks: 0b1000, list: [51, 200] }) })]);
    r.setInput('ok');
    r.c.GetGameInfo(...call(cmd('INPUT_STRING', 'UpdateGameListInfo')));
    r.setInput('bad');
    r.c.GetGameInfo(...call(cmd('INPUT_STRING', 'UpdateGameListInfo')));
    expect(r.text()).toBe('UNAVAILABLE');
    expect([r.valves.find(MISSION_AVAILABLE_VALVE)!.value, r.valves.find(GAME_INFO_RANK_RESTRICTIONS_VALVE)!.value]).toEqual([0, 0b0010]);
  });

  it('a name no record holds: GAME_INFO_DETAILS emptied (S:0x3f3b18, "", D:L183994-183995), MISSION_AVAILABLE acquired as it stands; 1', () => {
    const r = rig({ current: { playList: [51], mission: 'mp51' }, valves: RESPAWN_247 });
    r.listed([game('test$~Alpha', { gameStats: stats({ list: [51] }) })]);
    r.c.GetGameInfo(...call(cmd('CurrentGame')));
    expect(r.text()).not.toBe('');
    r.setInput('nothing');
    expect(r.c.GetGameInfo(...call(cmd('INPUT_STRING', 'UpdateGameListInfo')))).toBe(true);
    expect(r.text()).toBe('');
    expect(r.valves.find(MISSION_AVAILABLE_VALVE)!.value).toBe(0);
  });

  it('no argument (INPUT_STRING with no input): nothing written; 1 (D:L124160)', () => {
    const r = rig();
    r.setInput(null);
    expect(r.c.GetGameInfo(...call(cmd('INPUT_STRING', 'UpdateGameListInfo')))).toBe(true);
    expect(r.uiVars.find(GAME_INFO_DETAILS_VAR)).toBeUndefined();
  });
});
