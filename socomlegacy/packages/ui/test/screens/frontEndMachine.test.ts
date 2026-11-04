import { describe, expect, it } from 'vitest';
import type { DialogDesign } from '../../src/dialog';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import { UiCommandHost } from '../../src/uiCommands';
import { REBOOT_LAUNCH, shutdownLaunch } from '../../src/screens/launch';
import {
  CORE_STATE_PLACEHOLDER, FrontEndMachine, LOAD_DIALOG, LOAD_STATE_SCRIPTS_PLACEHOLDER, MAP_LOAD_PLACEHOLDER,
} from '../../src/screens/frontEndMachine';
import type { GameState } from '../../src/screens/gameStates';

/**
 * The front end assembled (PLAT-10; web research 115 §8): CG with the menu, load, round and shutdown states, M, the
 * dialog host and the screens' command rows in PLAT-08's host -- the boundaries front end -> `LOAD_SCREEN` -> load ->
 * round -> back to the menu (`CloseAndSwitch`, `GameStatePopCommand`), and the reboot. Synthetic dialogs; the commands
 * dispatched through `UiCommandHost` as the scripts would send them.
 */

const design = (): DialogDesign => ({
  libraries: [], usesMemcard: false, font: null, fontLib: true, background: null,
  bindings: [{ kind: 'event', name: 'ONSTART', code: 0, state: 1, animation: 'menu_fade_up', argument: null }],
  controls: [], objects: [], scripts: ['UIanim.rdr'], models: [], dropped: [],
});
const DIALOGS = ['dlgIntroScreen.rdr', 'dlgMenu.rdr', 'dlgOptions_Menu.rdr', LOAD_DIALOG, 'dlgAfterErrorReboot.rdr', 'dlgReturnFromNTGUI2.rdr'];
const cmd = (fn: string, arg = ''): ZAnimUiCommand =>
  ({ anim: 'goto_menu', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });

function machine(over: { startDialog?: string; core?: GameState } = {}) {
  const launches: unknown[] = [];
  let syncs = 0;
  const host = new UiCommandHost();
  const m = new FrontEndMachine({
    dialog: (n) => (DIALOGS.includes(n) ? design() : null),
    host, frameSync: () => { syncs++; }, onLaunch: (l) => launches.push(l), ...over,
  });
  m.boot();
  const run = (frames: number, dt = 1 / 60) => { for (let i = 0; i < frames; i++) m.frame(dt); };
  return { m, host, launches, run, syncs: () => syncs };
}

describe('FrontEndMachine', () => {
  it('boots: CG switches to the menu state on the first frame (a frame sync before its Init); MS builds dlgIntroScreen.rdr', () => {
    const { m, run, syncs } = machine();
    expect(m.shell()).toBeNull();
    run(1);
    expect(m.states.top()).toBe(m.menu);
    expect(m.shell()!.currentName).toBe('dlgIntroScreen.rdr');
    expect(syncs()).toBe(1);
  });

  it('--menu_state picks the start dialog (FUN_001eabd0)', () => {
    const { m, run } = machine({ startDialog: 'dlgMenu.rdr' });
    run(1);
    expect(m.shell()!.currentName).toBe('dlgMenu.rdr');
  });

  it('SwitchMenu through PLAT-08\'s host: the switch, its countdown, the new dialog; PREVIOUS_SCREEN back', () => {
    const { m, host, run } = machine();
    run(2);
    expect(host.dispatch(cmd('SwitchMenu', 'dlgMenu.rdr')).kind).toBe('table');
    run(6);                                                        // F, then the fader already opaque: 4 countdown frames
    expect(m.shell()!.currentName).toBe('dlgMenu.rdr');
    expect(m.queue.history).toEqual(['dlgIntroScreen.rdr']);
    host.dispatch(cmd('SwitchMenu', 'PREVIOUS_SCREEN'));
    expect(m.queue.history).toEqual([]);                            // popped at queue time
    run(6);
    expect(m.shell()!.currentName).toBe('dlgIntroScreen.rdr');
  });

  it('LOAD_SCREEN: MS un-inits (M flushed), the load state fades in and out over dlgLoad.rdr, then the round', () => {
    expect([MAP_LOAD_PLACEHOLDER, CORE_STATE_PLACEHOLDER, LOAD_STATE_SCRIPTS_PLACEHOLDER]).toEqual(['loaded at once', 'idle', 'none']);
    const { m, host, run } = machine();
    run(2);
    m.queue.pushHistory('dlgMenu.rdr');
    host.dispatch(cmd('SwitchMenu', 'LOAD_SCREEN'));
    run(6);                                                        // the countdown; the dispatch queues CG's switch
    run(1);                                                        // CG applies it
    expect(m.states.top()).toBe(m.load);
    expect(m.menu.shell).toBeNull();
    expect(m.queue.depth).toBe(0);                                 // MS's UnInit flushed the history (FUN_0027edf0(M, 1))
    expect(m.shell()!.currentName).toBe(LOAD_DIALOG);
    run(60, 0.1);
    expect(m.states.top()).toBe(m.core);
  });

  it('from a state pushed over the round, CloseAndSwitch pops it and returns to the menu on the named dialog', () => {
    const core: GameState = { name: 'Core', init: () => true, tick() {}, unInit() {} };
    const exit: GameState = { name: 'Exit', init: () => true, tick() {}, unInit() {} };
    const { m, host, run } = machine({ core });
    run(1);
    m.states.switchTo(core);
    run(1);
    m.states.push(exit);
    run(1);
    host.dispatch(cmd('CloseAndSwitch', 'dlgOptions_Menu.rdr'));
    run(2);                                                        // the pop, then the switch
    expect(m.states.top()).toBe(m.menu);
    expect(m.shell()!.currentName).toBe('dlgOptions_Menu.rdr');
  });

  it('REBOOT relaunches: everything new, MS on dlgAfterErrorReboot.rdr (research 115 §9)', () => {
    const { m, host, launches, run } = machine();
    run(2);
    const oldQueue = m.queue;
    host.dispatch(cmd('SwitchMenu', 'REBOOT'));
    run(6);
    expect(launches).toEqual([REBOOT_LAUNCH]);
    expect(m.queue).not.toBe(oldQueue);
    run(1);
    expect(m.shell()!.currentName).toBe('dlgAfterErrorReboot.rdr');
  });

  it('SHUTDOWN: the shutdown state launches the network GUI; the browser returns at once on its dialog', () => {
    const { m, host, launches, run } = machine();
    run(2);
    host.dispatch(cmd('SwitchMenu', 'SHUTDOWN'));
    run(6);
    run(1);
    expect(launches).toEqual([shutdownLaunch(false)]);
    run(1);
    expect(m.shell()!.currentName).toBe('dlgReturnFromNTGUI2.rdr');
  });
});
