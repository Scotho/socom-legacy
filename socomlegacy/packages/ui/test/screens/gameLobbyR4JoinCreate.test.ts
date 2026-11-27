import { describe, expect, it } from 'vitest';
import type { DialogDesign } from '../../src/dialog';
import { buildDialogScreen } from '../../src/compositor/index';
import type { GameListEntry } from '../../src/screens/briefingRoomCommands';
import {
  CREATE_GAME_INPUT_PAUSE_S_READING, GameLobbyCommands, type GameLobbyLobby, type GameSocketPort,
} from '../../src/screens/gameLobbyCommands';
import { MenuQueue } from '../../src/screens/menuQueue';
import { MenuShell, type MenuShellHost } from '../../src/screens/menuShell';
import { UiVarManager, type UiVarValue } from '../../src/uiVars';
import { VALVE_TYPE, ValveStore } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';

/**
 * AS-17 (atlas leads L72 and L98; reading (r0004), pending review; the spec is r0004, OT.R97):
 *
 * - L72: r0004's CZOnlineLobby::JoinGame (`r0004:0x00315640`) moves the valve updates into r4 0x316450 (D4:L218354 on),
 *   where MaxPlayersValve takes the record's total `+0x24` (lhu) less its spectator slots `+0x19e` (lbu, 'D'[4]) --
 *   r4 0x3164a8-0x3164e8, `subu` then `sh` (16 bits) -- where r0001's `FUN_002f83b0` (D:L197193-197205) copied the
 *   total whole.
 * - L98: r0004's UIConnectToGameServer (`r0004:0x0027f740`, D4:L133677-133686; r4 0x27f744-0x27f7dc) opens on a
 *   prologue r0001's `FUN_0027e4c0` lacks: when the running animation's name (`CZAnim::GetName`, r4 0x26fcc0) is
 *   "create_game" (strcmp, r4 0x198f18), PLAYLISTVAR (`CUIVarManager::Add`, r4 0x3a5ad0, longevity 1) not an array
 *   (zrdr type 4, `FUN_003860f0` D:L279743-279747) or an array of 0 entries (+2 u16) calls `CZOnlineLobby::RejoinRoom`
 *   (r4 0x3005e0 = r0001 `FUN_002e3730` D:L184739-184754) and answers 0; else `FUN_001f3bb0` (r4 0x27f7d4,
 *   D4:L59335-59344; r0001 D:L54349-54358) writes 0.75 (0x3f400000) over g_menuState's G+0x900 (r4 0x434eb8 = r0001
 *   0x408538, the global `SuspendMenuInput`'s row writes) before the r0001 body runs.
 *
 * Synthetic games off the machine; world ids and names invented.
 */
const cmd = (anim: string): ZAnimUiCommand => ({ anim, sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'ConnectToGameServer', arg: '', loc: 0, bytes: new Uint8Array(16) });
const hex = (b: number): string => b.toString(16).padStart(2, '0');
/** A 'D' GameStats string: rounds 5, time 6, spectator slots `spectators` ('D'[4]), mission 2. */
const stats = (spectators: number): string => ['44', '05', '06', '00', hex(spectators), '00', '00', '00', '02'].join('').padEnd(80, '0');
const listed = (maxPlayers: number, spectators: number): GameListEntry => ({
  status: 0, mediusWorldId: 7, playerCount: 1, minPlayers: 2, maxPlayers, gameLevel: 2, playerSkillLevel: 0, rulesSet: 0, genericField1: 1, genericField2: 300,
  genericField3: 0, securityLevel: 0, worldStatus: 1, gameHostType: 0, gameName: 'test', gameStats: stats(spectators), endOfList: false,
});

/** A menu shell over one empty dialog, counting the frames whose input was read. */
function shell(): { g: MenuShell; inputs: () => number } {
  let n = 0;
  const d: DialogDesign = { libraries: [], usesMemcard: false, font: null, fontLib: true, background: null, bindings: [], controls: [], objects: [], scripts: [], models: [], dropped: [] };
  const host: MenuShellHost = {
    open: () => d,
    build: (x) => ({ screen: buildDialogScreen(x), scripts: null }),
    states: { loadScreen: () => undefined, popToMenu: () => undefined, menuScreen: () => undefined, shutdown: () => undefined },
    reboot: () => undefined,
    input: () => { n++; },
  };
  const g = new MenuShell(new MenuQueue(), host);
  g.start('d');
  return { g, inputs: () => n };
}

/** A page holding a listed game (world 7) in a room (world 3), the lobby up; `playlist` written to PLAYLISTVAR when given. */
function page(playlist?: UiVarValue) {
  const valves = new ValveStore();
  const uiVars = new UiVarManager();
  if (playlist) uiVars.set(uiVars.add('PLAYLISTVAR', null, 2), playlist);
  const opened: number[] = [];
  const queued: number[] = [];
  const pauses: number[] = [];
  const socket: GameSocketPort = { open: (id) => { opened.push(id); return true; }, send: () => undefined, close: () => undefined };
  const lobby = { up: true, state: () => 0x0f, queueState: (s: number) => { queued.push(s); }, setHandler: () => undefined } as unknown as GameLobbyLobby;
  const m = shell();
  const c = new GameLobbyCommands({
    uiVars, valves: () => valves, games: () => [], socket, lobby, roomWorldId: () => 3,
    suspendMenuInput: (s) => { pauses.push(s); m.g.suspendInput(s); },
  });
  c.enterGameLobby(listed(16, 4));
  const connect = (anim: string): boolean => c.ConnectToGameServer(cmd(anim), null as never, undefined) as boolean;
  return { c, valves, opened, queued, pauses, connect, shell: m, uiVars };
}

describe('L72: a listed join sets MaxPlayersValve to the total less the spectator slots (r4 0x3164a8-0x3164e8)', () => {
  const max = (n: number, s: number, created = false): number => {
    const valves = new ValveStore();
    const c = new GameLobbyCommands({ uiVars: new UiVarManager(), valves: () => valves, games: () => [] });
    valves.acquire('MaxPlayersValve', VALVE_TYPE.PERM);
    valves.set('MaxPlayersValve', 99, VALVE_TYPE.PERM);
    c.enterGameLobby(listed(n, s), { created });
    return valves.acquire('MaxPlayersValve', VALVE_TYPE.PERM).value;
  };
  it('N 16, S 4 -> 12; N 24, S 8 -> 16; S 0 -> N; MaxSpectatorsValve stays S', () => {
    expect([max(16, 4), max(24, 8), max(16, 0)]).toEqual([12, 16, 16]);
    const valves = new ValveStore();
    new GameLobbyCommands({ uiVars: new UiVarManager(), valves: () => valves, games: () => [] }).enterGameLobby(listed(16, 4));
    expect(valves.acquire('MaxSpectatorsValve', VALVE_TYPE.PERM).value).toBe(4);
  });
  it('CREATE GAME\'s success still leaves MaxPlayersValve as the screen set it (LATER 232)', () => {
    expect(max(16, 4, true)).toBe(99);
  });
});

describe('L98: create_game\'s ConnectToGameServer needs a non-empty PLAYLISTVAR array (r4 0x27f744-0x27f7c0)', () => {
  const bad: [string, UiVarValue | undefined][] = [
    ['absent', undefined],
    ['an int', { type: 'int', value: 5 }],
    ['a string', { type: 'string', value: 'mp2' }],
    ['an empty array', { type: 'array', value: [] }],
  ];
  for (const [what, v] of bad) {
    it(`PLAYLISTVAR ${what}: RejoinRoom (state 11 queued) and 0; no socket, no pause`, () => {
      const p = page(v);
      expect(p.connect('create_game')).toBe(false);
      expect([p.opened, p.queued, p.pauses]).toEqual([[], [0x0b], []]);
    });
  }
  it('RejoinRoom with no room held (DAT_0066a538 < 0) queues nothing; still 0', () => {
    const uiVars = new UiVarManager();
    const queued: number[] = [];
    const lobby = { up: true, state: () => 0x0f, queueState: (s: number) => { queued.push(s); }, setHandler: () => undefined } as unknown as GameLobbyLobby;
    const c = new GameLobbyCommands({ uiVars, valves: () => new ValveStore(), games: () => [], lobby, roomWorldId: () => -1, socket: { open: () => true, send: () => undefined, close: () => undefined } });
    c.enterGameLobby(listed(16, 0));
    expect([c.ConnectToGameServer(cmd('create_game'), null as never, undefined), queued]).toEqual([false, []]);
  });
});

describe('L98: a valid create suspends menu input for 0.75 s, then connects (r4 0x27f7c8-0x27f7d4)', () => {
  it('the constant is the image\'s word 0x3f400000', () => {
    expect(CREATE_GAME_INPUT_PAUSE_S_READING).toBe(0.75);
  });
  it('a one-map play list: the pause asked, the socket opened, 1; input ignored at 0.74 s, read after 0.75 s', () => {
    const p = page({ type: 'array', value: [{ type: 'int', value: 2 }] });
    expect(p.connect('create_game')).toBe(true);
    expect([p.opened, p.queued, p.pauses]).toEqual([[7], [], [0.75]]);
    const { g, inputs } = p.shell;
    g.tick(0.74);                       // the timer 0.75 at the frame's start: not read
    g.tick(0.005);                      // 0.01 left at 0.74 s: still not read
    expect(inputs()).toBe(0);
    g.tick(0.01);                       // 0.745 s elapsed, 0.005 left: not read
    expect(inputs()).toBe(0);
    g.tick(1 / 60);                     // past 0.75 s: read
    expect(inputs()).toBe(1);
  });
  it('a join that is not create_game has no pause and no play list test', () => {
    const p = page();
    expect(p.connect('aux_join_game')).toBe(true);
    expect([p.opened, p.queued, p.pauses]).toEqual([[7], [], []]);
    g0(p.shell);
  });
});

/** A shell no pause was asked of reads input on its first frame. */
function g0(m: { g: MenuShell; inputs: () => number }): void {
  m.g.tick(1 / 60);
  expect(m.inputs()).toBe(1);
}
