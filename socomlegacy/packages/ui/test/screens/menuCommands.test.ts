import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import { UI_COMMAND_TABLE, UiCommandHost, uiCommandKey, uiCommandRowByKey, uiCommandRowByName } from '../../src/uiCommands';
import { UiVarManager } from '../../src/uiVars';
import { ValveStore, VALVE_TYPE } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import { MOVIE_COMMAND_ROWS } from '../../src/movie/movieCommands';
import { UI_SOUND_COMMAND_ROWS } from '../../src/sounds/uiSoundCues';
import { SUSPEND_MENU_INPUT } from '../../src/input/menuInput';
import { GET_TEXT_INPUT } from '../../src/keyboard/frontEnd';
import { SCREEN_COMMAND_ROWS } from '../../src/screens/screenCommands';
import {
  CAREER_STATS_WORDS, IOP_MODULE_SET, MC_CHANGED_SLOT_VALVE, MENU_COMMAND_ROWS, MENU_ENTRY_COMMANDS, MenuCommands, SAVE_GAME_SLOTS,
  SAVE_HEADER_DUMMY_TEXT, type MenuCardIo, type MenuCommandsOptions,
} from '../../src/screens/menuCommands';

/**
 * MENU-01a: the rows `dlgMenu` and the online entry (`dlgMPswitch`) dispatch that no earlier task implements, each
 * against its transcription (web research 138): CleanupMissionMemory `FUN_00281bc0` (D:L128136-128143), ClearCareerStats
 * `FUN_0027aa30` -> `FUN_002a3e20` (D:L124599-124606, D:L147533-147550), RebootIOP `FUN_002777f0` (D:L122994-123032),
 * ClearUIVar `FUN_002780a0` (D:L123273-123321), TestUIVar `FUN_00278200` (D:L123324-123365), GetNumSavedGames
 * `FUN_0027dea0` (D:L126303-126343), the `MC_*` rows over `CMemCardIO` (D:L124826-124927; D:L295445-295520,
 * D:L295834-295953), IsMemCardInserted and IsMemCardFormatted (the tails `FUN_003a1650`, `FUN_003a1580`). The list of
 * everything the two dialogs name, each row answered by a task, is `MENU_ENTRY_COMMANDS`; `tools/test/menuEntryCommands.test.ts`
 * holds it to the dialogs' pin. Synthetic commands over a fake card; nothing measured on the original running.
 */

const cmd = (fn: string, arg = 'NA', anim = 'a'): ZAnimUiCommand =>
  ({ anim, sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });

/** A card as `CMemCardIO` sees libmc (PLAT-26a's `Libmc` fits this shape): what each port answers, and every call made. */
function fakeCard(answers: Partial<Record<number, { info?: { result: number; type: number; format: number }; dirs?: Record<string, number>; chdir?: Record<string, number>; mkdir?: Record<string, number>; saves?: Record<string, string | null> }>> = {}) {
  const calls: string[] = [];
  const port = (p: number) => answers[p] ?? {};
  const card: MenuCardIo = {
    getInfo: (p, s) => { calls.push(`getInfo ${p}/${s}`); return port(p).info ?? { result: -4, type: 0, format: 0 }; },
    getDir: (p, s, path, max) => { calls.push(`getDir ${p}/${s} ${path} ${max}`); const r = port(p).dirs?.[path] ?? -4; return { result: r, entries: [] }; },
    chdir: (p, s, path) => { calls.push(`chdir ${p}/${s} ${path}`); return { result: port(p).chdir?.[path] ?? -4 }; },
    mkdir: (p, s, path) => { calls.push(`mkdir ${p}/${s} ${path}`); return port(p).mkdir?.[path] ?? 0; },
    saveHeaderText: (p, s, path) => { calls.push(`header ${p}/${s} ${path}`); return port(p).saves?.[path] ?? null; },
  };
  return { card, calls };
}

function setup(over: Partial<MenuCommandsOptions> = {}) {
  const log: string[] = [];
  const valves = new ValveStore();
  const uiVars = new UiVarManager();
  const commands = new MenuCommands({
    valves: () => valves, uiVars,
    event: (kind) => log.push(`event ${kind}`),
    iop: (set) => log.push(`iop ${set}`),
    missionMemory: () => log.push('mission memory'),
    inputString: (c) => (c.anim === 'withInput' ? 'Multiplayer' : null),
    ...over,
  });
  const host = new UiCommandHost({ log: (o) => { if (o.kind === 'not-implemented') log.push(o.message); } });
  commands.register(host);
  const run = (fn: string, arg = 'NA', anim?: string) => host.dispatch(cmd(fn, arg, anim));
  return { log, valves, uiVars, commands, host, run };
}

describe('the rows (W9.R4: PLAT-08\'s host is a registry; no table edit)', () => {
  it('names its rows of the table, each at its index, id and function', () => {
    expect(MENU_COMMAND_ROWS.map((r) => `${r.row} ${r.name}`)).toEqual([
      '57 IsMemCardInserted', '58 IsMemCardFormatted', '67 MC_ChDir', '68 MC_ChPort', '70 MC_Exists', '71 MC_MkDir',
      '89 GetNumSavedGames', '93 TestUIVar', '119 RebootIOP', '140 MC_Changed', '143 ClearUIVar', '145 CleanupMissionMemory',
      '189 ClearCareerStats',
    ]);
    for (const r of MENU_COMMAND_ROWS) {
      const t = uiCommandRowByName(r.name)!;
      expect([t.index, t.id, t.fn]).toEqual([r.row, r.id, r.fn]);
      expect(UI_COMMAND_TABLE[r.row]!.name).toBe(r.name);
    }
  });

  it('registered, each row is answered by its entry (a table outcome, not "not implemented")', () => {
    const { run, log } = setup();
    for (const r of MENU_COMMAND_ROWS) expect(run(r.name, 'x').kind).toBe('table');
    expect(log.filter((l) => l.startsWith('not implemented'))).toEqual([]);
  });
});

describe('the list the two dialogs name (every command answered by a task, none silently ignored)', () => {
  const earlier = new Set<string>([
    ...SCREEN_COMMAND_ROWS.map((r) => r.name), ...MOVIE_COMMAND_ROWS.map((r) => r.name), ...UI_SOUND_COMMAND_ROWS.map((r) => r.name),
    SUSPEND_MENU_INPUT, GET_TEXT_INPUT,
  ]);

  it('every entry names a table row by the dispatcher\'s key, and the aliases the scripts spell fold to it', () => {
    for (const e of MENU_ENTRY_COMMANDS) {
      const row = uiCommandRowByName(e.name);
      expect(row, e.name).toBeDefined();
      for (const spelt of e.spelt) expect(uiCommandRowByKey(uiCommandKey(spelt))?.name, spelt).toBe(e.name);
    }
    expect(new Set(MENU_ENTRY_COMMANDS.map((e) => e.name)).size).toBe(MENU_ENTRY_COMMANDS.length);
  });

  it('"here" is exactly this module\'s rows; "earlier" names a row an earlier module registers; "declared" keeps the table\'s owner', () => {
    const here = MENU_ENTRY_COMMANDS.filter((e) => e.status === 'here').map((e) => e.name).sort();
    expect(here).toEqual([...MENU_COMMAND_ROWS.map((r) => r.name)].sort());
    for (const e of MENU_ENTRY_COMMANDS) {
      if (e.status === 'earlier') expect(earlier.has(e.name), `${e.name} by ${e.task}`).toBe(true);
      if (e.status === 'declared') {
        expect(uiCommandRowByName(e.name)!.task, e.name).toBe(e.task);
        expect(e.why, e.name).toBeTruthy();
      }
    }
  });
});

describe('CleanupMissionMemory, ClearCareerStats, RebootIOP', () => {
  it('CleanupMissionMemory: the mission allocator\'s sweep (FUN_0053df50), answer 1', () => {
    const { run, log } = setup();
    expect(run('CleanupMissionMemory').answer).toBe(true);
    expect(log).toEqual(['mission memory']);
  });

  it('ClearCareerStats: the 13 words at 0x437e30 zeroed (FUN_002a3e20), answer 1', () => {
    const { run, commands } = setup();
    expect(CAREER_STATS_WORDS).toBe(13);
    commands.careerStats.fill(7);
    expect(run('ClearCareerStats').answer).toBe(true);
    expect(commands.careerStats).toEqual(new Array(13).fill(0));
  });

  it('RebootIOP: the argument folded to the module set -- Singleplayer 2, Multiplayer 3, NetConfig 4, MainMenu 5, anything else 2', () => {
    const { run, log } = setup();
    expect(IOP_MODULE_SET).toEqual({ Singleplayer: 2, Multiplayer: 3, NetConfig: 4, MainMenu: 5 });
    for (const [arg, set] of [['Singleplayer', 2], ['MULTIPLAYER', 3], ['netconfig', 4], ['MainMenu', 5], ['NA', 2], ['', 2]] as const) {
      log.length = 0;
      expect(run('RebootIOP', arg).answer).toBe(true);
      expect(log, arg).toEqual([`iop ${set}`]);
    }
  });

  it('RebootIOP INPUT_STRING: the running animation\'s string input (FUN_00272480)', () => {
    const { run, log } = setup();
    expect(run('RebootIOP', 'INPUT_STRING', 'withInput').answer).toBe(true);
    expect(log).toEqual(['iop 3']);
  });
});

describe('ClearUIVar and TestUIVar', () => {
  it('ClearUIVar: an int to 0, a real to 0, a string to "", an array to none; a var it lacks, nothing; answer 1', () => {
    const { run, uiVars } = setup();
    uiVars.add('I', { type: 'int', value: 5 }, 2);
    uiVars.add('R', { type: 'real', value: 2.5 }, 2);
    uiVars.add('S', { type: 'string', value: 'abc' }, 2);
    uiVars.add('A', { type: 'array', value: [{ type: 'int', value: 1 }] }, 2);
    for (const n of ['i', 'R', 'S', 'A', 'MISSING']) expect(run('ClearUIVar', n).answer).toBe(true);
    expect(uiVars.find('I')!.value).toEqual({ type: 'int', value: 0 });
    expect(uiVars.find('R')!.value).toEqual({ type: 'real', value: 0 });
    expect(uiVars.find('S')!.value).toEqual({ type: 'string', value: '' });
    expect(uiVars.find('A')!.value).toEqual({ type: 'array', value: [] });
    expect(uiVars.find('MISSING')).toBeUndefined();
  });

  it('ClearUIVar tells the attached items only when the value changes (FUN_00386460)', () => {
    const { run, uiVars } = setup();
    const heard: string[] = [];
    uiVars.add('I', { type: 'int', value: 0 }, 2);
    uiVars.add('J', { type: 'int', value: 3 }, 2);
    uiVars.attach('I', (v) => heard.push(v.name));
    uiVars.attach('J', (v) => heard.push(v.name));
    run('ClearUIVar', 'I');
    run('ClearUIVar', 'J');
    expect(heard).toEqual(['J']);
  });

  it('TestUIVar: int != 0, real != 0, a non-empty string, an array with elements; a var it lacks is false', () => {
    const { run, uiVars } = setup();
    uiVars.add('I0', { type: 'int', value: 0 }, 2); uiVars.add('I1', { type: 'int', value: -2 }, 2);
    uiVars.add('R0', { type: 'real', value: 0 }, 2); uiVars.add('R1', { type: 'real', value: 0.5 }, 2);
    uiVars.add('S0', { type: 'string', value: '' }, 2); uiVars.add('S1', { type: 'string', value: 'x' }, 2);
    uiVars.add('A0', { type: 'array', value: [] }, 2); uiVars.add('A1', { type: 'array', value: [{ type: 'int', value: 0 }] }, 2);
    uiVars.add('N', null, 2);
    const t = (n: string) => run('TestUIVar', n).answer;
    expect(['I0', 'I1', 'R0', 'R1', 'S0', 'S1', 'A0', 'A1', 'N', 'MISSING'].map(t)).toEqual([false, true, false, true, false, true, false, true, false, false]);
  });
});

describe('the card rows over CMemCardIO (0x436460)', () => {
  it('MC_ChPort: atoi of the argument into the port when not negative; the port and slot mirrored into +8 / +0xc; answer 1', () => {
    const { run, commands } = setup();
    expect(commands.cardState()).toEqual({ port: 0, slot: 0, portInUse: 0, slotInUse: 0 });
    expect(run('MC_ChPort', '1').answer).toBe(true);
    expect(commands.cardState()).toEqual({ port: 1, slot: 0, portInUse: 1, slotInUse: 0 });
    expect(run('MC_ChPort', '-1').answer).toBe(true);
    expect(commands.cardState().port).toBe(1);
    expect(run('MC_ChPort', 'NA').answer).toBe(true);                     // atoi("NA") is 0
    expect(commands.cardState().port).toBe(0);
  });

  it('MC_Exists: GetDir of the path with one entry on the current port; the count above 0', () => {
    const { card, calls } = fakeCard({ 0: { dirs: { 'BASCUS-97275SOCOMII': 1, '..': 0 } } });
    const { run } = setup({ card });
    expect(run('MC_Exists', 'BASCUS-97275SOCOMII').answer).toBe(true);
    expect(run('MC_Exists', '..').answer).toBe(false);
    expect(run('MC_Exists', 'nope').answer).toBe(false);                   // NoEntry (-4): not above 0
    expect(calls).toEqual(['getDir 0/0 BASCUS-97275SOCOMII 1', 'getDir 0/0 .. 1', 'getDir 0/0 nope 1']);
  });

  it('MC_ChDir: Chdir on the current port; a non-zero result posts MEMCARD_ERROR to G; answer 1', () => {
    const { card } = fakeCard({ 1: { chdir: { ok: 0, bad: -4 } } });
    const { run, log } = setup({ card });
    run('MC_ChPort', '1');
    expect(run('MC_ChDir', 'ok').answer).toBe(true);
    expect(log).toEqual([]);
    expect(run('MC_ChDir', 'bad').answer).toBe(true);
    expect(log).toEqual([`event ${DIALOG_EVENTS.MEMCARD_ERROR}`]);
  });

  it('MC_MkDir: Mkdir; a result that is neither 0 nor -4 posts MEMCARD_ERROR; answer 1', () => {
    const { card } = fakeCard({ 0: { mkdir: { fresh: 0, there: -4, full: -3 } } });
    const { run, log } = setup({ card });
    expect(run('MC_MkDir', 'fresh').answer).toBe(true);
    expect(run('MC_MkDir', 'there').answer).toBe(true);
    expect(log).toEqual([]);
    expect(run('MC_MkDir', 'full').answer).toBe(true);
    expect(log).toEqual([`event ${DIALOG_EVENTS.MEMCARD_ERROR}`]);
  });

  it('IsMemCardInserted: GetInfo, up to twice; a PS2 card (type 2) whose result is above -10', () => {
    const { card, calls } = fakeCard({ 0: { info: { result: 0, type: 2, format: 1 } }, 1: { info: { result: -4, type: 0, format: 0 } } });
    const { run } = setup({ card });
    expect(run('IsMemCardInserted').answer).toBe(true);
    expect(calls).toEqual(['getInfo 0/0']);
    run('MC_ChPort', '1');
    expect(run('IsMemCardInserted').answer).toBe(false);
    expect(calls.slice(1)).toEqual(['getInfo 1/0', 'getInfo 1/0']);
  });

  it('IsMemCardInserted holds the -10 boundary (D:L295944: -10 < result): -10 on a PS2 card is out, -9 is in', () => {
    const { card, calls } = fakeCard({ 0: { info: { result: -10, type: 2, format: 1 } }, 1: { info: { result: -9, type: 2, format: 1 } } });
    const { run } = setup({ card });
    expect(run('IsMemCardInserted').answer).toBe(false);
    expect(calls).toEqual(['getInfo 0/0', 'getInfo 0/0']);
    run('MC_ChPort', '1');
    expect(run('IsMemCardInserted').answer).toBe(true);
    expect(calls.slice(2)).toEqual(['getInfo 1/0']);
  });

  it('IsMemCardFormatted: GetInfo, up to twice; the format flag', () => {
    const { card } = fakeCard({ 0: { info: { result: -2, type: 2, format: 0 } }, 1: { info: { result: 0, type: 2, format: 1 } } });
    const { run } = setup({ card });
    expect(run('IsMemCardFormatted').answer).toBe(false);
    run('MC_ChPort', '1');
    expect(run('IsMemCardFormatted').answer).toBe(true);
  });

  it('without a card service every card row answers as libmc answers an empty port', () => {
    const { run, log } = setup();
    expect(run('MC_Exists', 'BASCUS-97275SOCOMII').answer).toBe(false);
    expect(run('IsMemCardInserted').answer).toBe(false);
    expect(run('IsMemCardFormatted').answer).toBe(false);
    expect(run('MC_ChDir', 'x').answer).toBe(true);
    expect(log).toEqual([`event ${DIALOG_EVENTS.MEMCARD_ERROR}`]);        // NoEntry: Chdir's error, as the original
  });
});

describe('GetNumSavedGames', () => {
  it('counts SaveGame0..9 that exist and whose header text starts with "m" and is not the dummy; the valve takes the count (TEMP, D:L126316)', () => {
    expect(SAVE_GAME_SLOTS).toBe(10);
    expect(SAVE_HEADER_DUMMY_TEXT).toBe('This game is a dummy game.');
    const { card, calls } = fakeCard({ 0: {
      dirs: { SaveGame0: 1, SaveGame1: 1, SaveGame2: 1, SaveGame3: 1, SaveGame5: 1 },
      saves: { SaveGame0: 'm52 the title', SaveGame1: SAVE_HEADER_DUMMY_TEXT, SaveGame2: 'Mission', SaveGame3: 'm', SaveGame5: null },
    } });
    const { run, valves } = setup({ card });
    expect(run('GetNumSavedGames', 'GotSaveGames').answer).toBe(true);
    expect(valves.find('GotSaveGames')).toMatchObject({ value: 2, type: VALVE_TYPE.TEMP });
    expect(calls.filter((c) => c.startsWith('getDir'))).toHaveLength(10);
    expect(calls.filter((c) => c.startsWith('header'))).toHaveLength(5);
  });

  it('the valve\'s watchers run when the count changes, not when it stays', () => {
    const { card } = fakeCard({ 0: { dirs: { SaveGame4: 1 }, saves: { SaveGame4: 'm61' } } });
    const { run, valves } = setup({ card });
    const seen: number[] = [];
    valves.set('GotSaveGames', 1, VALVE_TYPE.PERM);
    valves.watch('GotSaveGames', 3, (v) => seen.push(v.value));
    run('GetNumSavedGames', 'GotSaveGames');
    expect(seen).toEqual([]);
    valves.set('GotSaveGames', 0, VALVE_TYPE.PERM);
    seen.length = 0;
    run('GetNumSavedGames', 'GotSaveGames');
    expect(seen).toEqual([1]);
  });

  it('with no card the count is 0', () => {
    const { run, valves } = setup();
    run('GetNumSavedGames', 'GotSaveGames');
    expect(valves.find('GotSaveGames')!.value).toBe(0);
  });
});

describe('MC_Changed (the alternating GetInfo poll, FUN_003a1370 mode 1)', () => {
  it('first call: nothing pending, GetInfo issued on the poll port, answer 0; the slot valve exists from this tick (PERM, D:L124914), its value left as made', () => {
    const { card, calls } = fakeCard({ 0: { info: { result: 0, type: 2, format: 1 } } });
    const { run, valves } = setup({ card });
    expect(valves.find(MC_CHANGED_SLOT_VALVE)).toBeUndefined();
    expect(run('MC_Changed').answer).toBe(false);
    expect(calls).toEqual(['getInfo 0/0']);
    expect(valves.find(MC_CHANGED_SLOT_VALVE)).toMatchObject({ value: 0, type: VALVE_TYPE.PERM });   // a script reading it between the ticks finds it
  });

  it('a tick that reads nothing leaves the valve as it is (MC_CHANGED_SLOT_UNWRITTEN_READING) and runs no watcher', () => {
    const { card } = fakeCard({ 0: { info: { result: 0, type: 2, format: 1 } }, 1: { info: { result: 0, type: 2, format: 1 } } });
    const { run, valves } = setup({ card });
    const seen: number[] = [];
    run('MC_Changed'); run('MC_Changed');                                   // port 0 read: the valve holds 0
    valves.set(MC_CHANGED_SLOT_VALVE, 7, VALVE_TYPE.PERM);                  // a script wrote it
    valves.watch(MC_CHANGED_SLOT_VALVE, 3, (v) => seen.push(v.value));
    run('MC_Changed');                                                      // port 1 issued: nothing read
    expect(valves.find(MC_CHANGED_SLOT_VALVE)!.value).toBe(7);
    expect(seen).toEqual([]);
    run('MC_Changed');                                                      // port 1 read
    expect(seen).toEqual([1]);
  });

  it('second call: the pending answer read -- changed when the result is -1 or -2 on a PS2 card -- the port written to mc_changed_slot, the poll port toggled', () => {
    const { card, calls } = fakeCard({ 0: { info: { result: 0, type: 2, format: 1 } }, 1: { info: { result: -2, type: 2, format: 0 } } });
    const { run, valves } = setup({ card });
    expect([run('MC_Changed').answer, run('MC_Changed').answer]).toEqual([false, false]);   // port 0: unchanged
    expect(valves.find(MC_CHANGED_SLOT_VALVE)).toMatchObject({ value: 0, type: VALVE_TYPE.PERM });
    expect([run('MC_Changed').answer, run('MC_Changed').answer]).toEqual([false, true]);    // port 1: a fresh (unformatted) card
    expect(valves.find(MC_CHANGED_SLOT_VALVE)!.value).toBe(1);
    expect(calls).toEqual(['getInfo 0/0', 'getInfo 1/0']);
    expect([run('MC_Changed').answer, run('MC_Changed').answer]).toEqual([false, false]);   // back to port 0
    expect(calls).toHaveLength(3);
  });

  it('a card changed on a port that is not a PS2 card is not a change', () => {
    const { card } = fakeCard({ 0: { info: { result: -1, type: 0, format: 0 } } });
    const { run } = setup({ card });
    run('MC_Changed');
    expect(run('MC_Changed').answer).toBe(false);
  });

  it('a completed poll at -1 (ChangedCard) on a PS2 card is a change, as -2 is (D:L295866: result + 2U < 2); -3 is not', () => {
    const { card } = fakeCard({ 0: { info: { result: -1, type: 2, format: 1 } }, 1: { info: { result: -3, type: 2, format: 1 } } });
    const { run } = setup({ card });
    expect([run('MC_Changed').answer, run('MC_Changed').answer]).toEqual([false, true]);    // port 0: -1
    expect([run('MC_Changed').answer, run('MC_Changed').answer]).toEqual([false, false]);   // port 1: -3
  });

  it('another CMemCardIO call between two ticks drains libmc (sceMcSync(0) first, D:L295455/295482/295510/295900/295935): the poll is consumed and the next tick re-issues it on the same port, answering 0', () => {
    const { card, calls } = fakeCard({ 0: { info: { result: 0, type: 2, format: 1 }, dirs: { 'BASCUS-97275SOCOMII': 1 } }, 1: { info: { result: -2, type: 2, format: 0 } } });
    const { run, valves } = setup({ card });
    expect([run('MC_Changed').answer, run('MC_Changed').answer]).toEqual([false, false]);   // port 0 issued and read
    expect(valves.find(MC_CHANGED_SLOT_VALVE)!.value).toBe(0);
    expect(run('MC_Changed').answer).toBe(false);                                           // port 1 issued
    for (const [row, arg] of [['IsMemCardInserted', 'NA'], ['IsMemCardFormatted', 'NA'], ['MC_Exists', 'BASCUS-97275SOCOMII'], ['MC_ChDir', 'x'], ['MC_MkDir', 'x'], ['GetNumSavedGames', 'GotSaveGames']] as const) {
      calls.length = 0;
      run(row, arg);                                                                        // each drains the poll
      expect(run('MC_Changed').answer, row).toBe(false);                                    // sync(1) -1: re-issued, not read
      expect(calls.at(-1), row).toBe('getInfo 1/0');
      expect(valves.find(MC_CHANGED_SLOT_VALVE)!.value, row).toBe(0);
    }
    expect(run('MC_Changed').answer).toBe(true);                                            // the re-issued poll read: port 1 changed
    expect(valves.find(MC_CHANGED_SLOT_VALVE)!.value).toBe(1);
  });
});
