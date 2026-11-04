import { describe, expect, it } from 'vitest';
import type { DialogDesign } from '../../src/dialog';
import { buildDialogScreen, findNode } from '../../src/compositor/index';
import { UI_COMMAND_TABLE, UiCommandHost, uiCommandRowByName } from '../../src/uiCommands';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import { MenuQueue, MENU_RECORD } from '../../src/screens/menuQueue';
import { MenuShell } from '../../src/screens/menuShell';
import { DEFAULT_MENU_SCREEN_LENGTH_READING, SCREEN_COMMAND_ROWS, ScreenCommands, type ScreenCommandsOptions } from '../../src/screens/screenCommands';

/**
 * The screens' entries in the command table at 0x3dd4d0 (PLAT-08's `UiCommandHost`, a registry each module fills by
 * `setHandler`; web research 115 §2): SwitchMenu `FUN_0027e720` (D:L126556-126639), PopUpDialog `FUN_0027eb10` ->
 * `FUN_0027eff0` (D:L126644-126652, D:L126862-126904), KillPopUp `FUN_0027d190` (D:L125846-125859), the button rows
 * `FUN_0027c160/260/360` (D:L125335-125393), FlushMenuHistory `FUN_0027c7f0` (D:L125492-125512), SetDefaultMenuScreen
 * `FUN_00278d60` (D:L123712-123727), GameStatePopCommand `FUN_00278df0` (D:L123729-123746), CloseAndSwitch
 * `FUN_00281a70` (D:L128101-128135), ReplayMission `FUN_00280040` (D:L127379-127395), AbortLoad `FUN_00278060`
 * (D:L123260-123270) -> `FUN_001f5d00` (D:L55527-55534).
 */

const cmd = (fn: string, arg: string, anim = 'goto_menu'): ZAnimUiCommand =>
  ({ anim, sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });
const design = (): DialogDesign => ({
  libraries: [], usesMemcard: false, font: null, fontLib: true, background: null, bindings: [],
  controls: [], objects: [], scripts: [], models: [], dropped: [],
});

function setup(over: Partial<ScreenCommandsOptions> = {}) {
  const log: string[] = [];
  const queue = new MenuQueue();
  const shell = new MenuShell(queue, {
    open: () => design(), build: (d) => ({ screen: buildDialogScreen(d), scripts: null }),
    states: { loadScreen() {}, popToMenu() {}, menuScreen() {}, shutdown() {} }, reboot() {},
    playMetal: () => log.push('.METAL'),
  });
  shell.start('dlgMenu.rdr');
  const menu = { startDialog: 'dlgIntroScreen.rdr' };
  const load = { abort: false };
  const commands = new ScreenCommands({
    queue, shell: () => shell, menu, load,
    states: { pop: (arg) => log.push(`CG pop(${arg})`), switchToMenu: () => log.push('CG switch(MS)') },
    playBack: () => log.push('BACK'),
    showLoadingPicture: () => log.push('LOADING.RAW'),
    inputString: (c) => (c.anim === 'goto_menu' ? 'dlgOptions_Menu.rdr' : null),
    ...over,
  });
  const host = new UiCommandHost();
  commands.register(host);
  const run = (fn: string, arg = '', anim?: string) => host.dispatch(cmd(fn, arg, anim));
  return { log, queue, shell, menu, load, commands, host, run };
}

describe('the rows (W9.R4: PLAT-08\'s host is a registry; no table edit)', () => {
  it('names twelve rows of the table, each at its index, id and function', () => {
    expect(SCREEN_COMMAND_ROWS.map((r) => `${r.row} ${r.name}`)).toEqual([
      '12 SwitchMenu', '13 PopUpDialog', '14 KillPopUp', '15 ActivateButton', '18 EnableButton', '19 DisableButton',
      '73 ReplayMission', '74 CloseAndSwitch', '85 GameStatePopCommand', '86 SetDefaultMenuScreen', '95 AbortLoad',
      '131 FlushMenuHistory',
    ]);
    for (const r of SCREEN_COMMAND_ROWS) {
      const t = uiCommandRowByName(r.name)!;
      expect([t.index, t.id, t.fn]).toEqual([r.row, r.id, r.fn]);
      expect(UI_COMMAND_TABLE[r.row]!.name).toBe(r.name);
    }
  });

  it('registered, each row is answered by its entry (a table outcome, not "not implemented")', () => {
    const { run } = setup();
    for (const r of SCREEN_COMMAND_ROWS) expect(run(r.name, 'x').kind).toBe('table');
  });
});

describe('the menu rows', () => {
  it('SwitchMenu: INPUT_STRING replaced by the animation\'s argument, then the queue (S4 here)', () => {
    const { run, queue } = setup();
    expect(run('SwitchMenu', 'INPUT_STRING').answer).toBe(true);
    expect(queue.peek()).toEqual({ type: MENU_RECORD.SWITCH, name: 'dlgOptions_Menu.rdr' });
  });

  it('SwitchMenu PREVIOUS_SCREEN: the back record and MS\'s BACK sound', () => {
    const { run, queue, log } = setup();
    queue.pushHistory('dlgIntroScreen.rdr');
    run('SwitchMenu', 'PREVIOUS_SCREEN');
    expect(queue.peek()).toEqual({ type: MENU_RECORD.BACK, name: 'dlgIntroScreen.rdr' });
    expect(log).toEqual(['BACK']);
  });

  it('SwitchMenu with INPUT_STRING and no argument: nothing queued (INPUT_STRING_NULL_READING)', () => {
    const { run, queue, log } = setup();
    run('SwitchMenu', 'INPUT_STRING', 'other');
    expect([queue.count, log]).toEqual([0, []]);
  });

  it('PopUpDialog: a type-3 record, the POPUP node shown, .METAL; KillPopUp hides it', () => {
    const { run, queue, shell, log } = setup();
    run('PopUpDialog', 'dlgLogoff');
    expect(queue.peek()).toEqual({ type: MENU_RECORD.POPUP, name: 'dlgLogoff' });
    expect(findNode(shell.screen.root, 'POPUP')!.visible).toBe(true);
    expect(log).toEqual(['.METAL']);
    run('KillPopUp');
    expect(findNode(shell.screen.root, 'POPUP')!.visible).toBe(false);
  });

  it('ActivateButton, EnableButton, DisableButton queue 6, 7, 8 with INPUT_STRING resolved', () => {
    const { run, queue } = setup();
    run('ActivateButton', 'a'); run('EnableButton', 'b'); run('DisableButton', 'INPUT_STRING');
    expect(queue.records.slice(1, 4)).toEqual([{ type: 6, name: 'a' }, { type: 7, name: 'b' }, { type: 8, name: 'dlgOptions_Menu.rdr' }]);
  });

  it('FlushMenuHistory: names blanked, the history emptied, the popup kept', () => {
    const { run, queue } = setup();
    queue.pushHistory('a');
    run('FlushMenuHistory');
    expect([queue.depth, queue.popupObject !== null]).toEqual([0, true]);
  });

  it('SetDefaultMenuScreen writes MS+0x30 (strncpy 0x40: DEFAULT_MENU_SCREEN_LENGTH_READING)', () => {
    const { run, menu } = setup();
    run('SetDefaultMenuScreen', 'dlgMenu.rdr');
    expect(menu.startDialog).toBe('dlgMenu.rdr');
    expect(DEFAULT_MENU_SCREEN_LENGTH_READING).toBe(63);
    run('SetDefaultMenuScreen', 'x'.repeat(70));
    expect(menu.startDialog).toBe('x'.repeat(63));
  });
});

describe('the boundary rows (research 115 §2.3)', () => {
  it('GameStatePopCommand: the default screen, then CG pop(0) and switch to MS', () => {
    const { run, menu, log } = setup();
    run('GameStatePopCommand', 'dlgMPFinal.rdr');
    expect(menu.startDialog).toBe('dlgMPFinal.rdr');
    expect(log).toEqual(['CG pop(0)', 'CG switch(MS)']);
  });

  it('CloseAndSwitch offline: the default screen always, pop(0), switch to MS, the loading picture', () => {
    const { run, menu, log } = setup();
    run('CloseAndSwitch', 'dlgMenu.rdr');
    expect(menu.startDialog).toBe('dlgMenu.rdr');
    expect(log).toEqual(['CG pop(0)', 'CG switch(MS)', 'LOADING.RAW']);
  });

  it('CloseAndSwitch online: a non-host does nothing more; a host takes game state 5 or the pop, then reports', () => {
    const net = (host: boolean, d4: boolean) => ({
      online: true, host, roundFlag: d4,
      gameState5: () => logs.push('state 5'), report: () => logs.push('report'),
    });
    let logs: string[] = [];
    const a = setup({ online: () => net(false, false) });
    logs = a.log;
    a.run('CloseAndSwitch', 'dlgGameLobby.rdr');
    expect([a.menu.startDialog, a.log]).toEqual(['dlgGameLobby.rdr', []]);
    const b = setup({ online: () => net(true, false) });
    logs = b.log;
    b.run('CloseAndSwitch', 'dlgGameLobby.rdr');
    expect(b.log).toEqual(['state 5', 'report']);
    const c = setup({ online: () => net(true, true) });
    logs = c.log;
    c.run('CloseAndSwitch', 'dlgGameLobby.rdr');
    expect(c.log).toEqual(['CG pop(0)', 'CG switch(MS)', 'report']);
  });

  it('ReplayMission: offline pop(1); online host state 5 and report; online non-host nothing', () => {
    const a = setup();
    a.run('ReplayMission');
    expect(a.log).toEqual(['CG pop(1)']);
    const logs: string[] = [];
    const b = setup({ online: () => ({ online: true, host: true, roundFlag: false, gameState5: () => logs.push('state 5'), report: () => logs.push('report') }) });
    b.run('ReplayMission');
    expect(logs).toEqual(['state 5', 'report']);
    const c = setup({ online: () => ({ online: true, host: false, roundFlag: false }) });
    c.run('ReplayMission');
    expect(c.log).toEqual([]);
  });

  it('AbortLoad: the literal argument stored (no INPUT_STRING check), the load state\'s abort flag set, answers 0', () => {
    const { run, menu, load } = setup();
    expect(run('AbortLoad', 'INPUT_STRING').answer).toBe(false);
    expect(menu.startDialog).toBe('INPUT_STRING');
    expect(load.abort).toBe(true);
  });
});
