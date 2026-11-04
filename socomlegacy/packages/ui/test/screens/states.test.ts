import { describe, expect, it } from 'vitest';
import type { DialogDesign } from '../../src/dialog';
import { buildDialogScreen } from '../../src/compositor/index';
import { f32 } from '../../src/text/f32';
import { MenuQueue } from '../../src/screens/menuQueue';
import { MenuShell, type MenuShellHost } from '../../src/screens/menuShell';
import {
  DEFAULT_MENU_SCREEN, LOAD_FADE_SECONDS, LoadState, MENU_STATE_POP_HOLD, MenuState, ShutdownState,
} from '../../src/screens/menuState';
import {
  NETWORK_GUI_PLACEHOLDER, NTGUI_RETURN, NTGUI_RETURN_LAN_PLACEHOLDER, REBOOT_LAUNCH, menuStateOf, shutdownLaunch,
} from '../../src/screens/launch';

/**
 * The menu state MS (`CMenuState`, 0x408538, vtable 0x405010; web research 115 §7): Init `FUN_001f4860`
 * (D:L54778-54914), Tick 0x1f4640 (read from the ELF), UnInit `FUN_001f4440` (D:L54706-54747), OnCover 0x1f4630,
 * OnPop `FUN_001f45e0` (D:L54766-54775); the load state (Init `FUN_001f6660` D:L55787-55877, Tick `FUN_001f5e70`
 * D:L55583-55784, UnInit `FUN_001f5d40` D:L55538-55564; the map load's busy flag CoreState+0xb4, set by
 * `FUN_001ebba0` D:L50633-50662 and cleared by its thread `FUN_001ebda0` D:L50735); the shutdown state
 * (`FUN_0022ea70` D:L80981-81008) and the reboot's argument block (`FUN_0022ed10` D:L81077-81096; the strings read off
 * the ELF at 0x3e5c60, 0x3dc9d0, 0x3e5ba0, 0x3dc9c0).
 */

const design = (bindings = true): DialogDesign => ({
  libraries: [], usesMemcard: false, font: null, fontLib: true, background: null,
  bindings: bindings ? [{ kind: 'event', name: 'ON_STATE_POP', code: 0xd, state: 1, animation: 'pop', argument: null }] : [],
  controls: [], objects: [], scripts: [], models: [], dropped: [],
});

function shellHost(log: string[], dialogs: string[]): MenuShellHost {
  return {
    open: (name) => (dialogs.includes(name) ? design() : null),
    build: (d, name) => ({
      screen: buildDialogScreen(d),
      scripts: { start() {}, tick() {}, stop() {}, event: (k) => { log.push(`${name} event ${k}`); return true; } },
    }),
    states: { loadScreen() {}, popToMenu() {}, menuScreen() {}, shutdown() {} },
    reboot() {},
  };
}

describe('MenuState', () => {
  it('opens on dlgIntroScreen.rdr by default (FUN_001e7530 through FUN_001e7b50)', () => {
    expect(DEFAULT_MENU_SCREEN).toBe('dlgIntroScreen.rdr');
    const log: string[] = [];
    const ms = new MenuState({ queue: new MenuQueue(), shellHost: shellHost(log, ['dlgIntroScreen.rdr']), toLoad: () => log.push('to load') });
    expect(ms.init()).toBe(true);
    expect(ms.shell!.currentName).toBe('dlgIntroScreen.rdr');
  });

  it('Init with MS+0xc set: a switch to the load state and nothing else (D:L54910-54912); Init answers 1 either way', () => {
    const log: string[] = [];
    const ms = new MenuState({ queue: new MenuQueue(), shellHost: shellHost(log, ['dlgIntroScreen.rdr']), toLoad: () => log.push('to load') });
    ms.loadPending = true;
    expect(ms.init()).toBe(true);
    expect([ms.shell, log]).toEqual([null, ['to load']]);
  });

  it('Tick: the movie first (the menu skipped while the pushed movie runs), then the pad, the shell and the draw', () => {
    const log: string[] = [];
    let movie: 'menu' | 'movie' = 'movie';
    const ms = new MenuState({
      queue: new MenuQueue(), shellHost: shellHost(log, ['dlgMenu.rdr']), toLoad() {},
      movieFrame: () => { log.push('movie'); return movie; }, pad: () => log.push('pad'), systemMessages: () => log.push('messages'),
    });
    ms.startDialog = 'dlgMenu.rdr';
    ms.init();
    ms.tick(1 / 60);
    expect(log).toEqual(['dlgMenu.rdr event 0', 'movie']);
    movie = 'menu';
    ms.tick(1 / 60);
    expect(log.slice(2)).toEqual(['movie', 'pad', 'messages']);
    expect(ms.frame[0]).toMatchObject({ kind: 'clear' });
  });

  it('OnCover stops the background movie; OnPop restarts it, fires ON_STATE_POP and holds the swap two frames', () => {
    const log: string[] = [];
    const ms = new MenuState({
      queue: new MenuQueue(), shellHost: shellHost(log, ['dlgMenu.rdr']), toLoad() {},
      movie: { background: { on: () => { log.push('bg on'); return true; }, off: () => { log.push('bg off'); return true; } }, play() {} },
    });
    ms.startDialog = 'dlgMenu.rdr';
    ms.init();
    log.length = 0;
    ms.onCover();
    ms.onPop(0);
    expect(log).toEqual(['bg off', 'bg on', 'dlgMenu.rdr event 13']);
    expect(MENU_STATE_POP_HOLD).toBe(2);
    const swaps: number[] = [];
    for (let i = 0; i < 3; i++) { ms.tick(1 / 60); swaps.push(ms.swap); }
    expect(swaps).toEqual([0, 0, 1]);                              // zVid_Swap(0, 1) twice, then (1, 1)
  });

  it('UnInit destroys the shell and flushes M with its popup (FUN_0027edf0(M, 1))', () => {
    const q = new MenuQueue();
    const ms = new MenuState({ queue: q, shellHost: shellHost([], ['dlgIntroScreen.rdr']), toLoad() {} });
    ms.init();
    q.pushHistory('x');
    ms.unInit();
    expect([ms.shell, q.depth, q.popupObject]).toEqual([null, 0, null]);
  });
});

describe('LoadState (offline)', () => {
  const run = (busyFrames: number, dt = 0.1) => {
    const log: string[] = [];
    let busy = 0;
    const shell = new MenuShell(new MenuQueue(), shellHost(log, ['dlgLoad.rdr']));
    const ls = new LoadState({
      shell: () => { shell.start('dlgLoad.rdr'); return shell; },
      loader: { start: () => { log.push('load start'); busy = busyFrames; }, busy: () => busy > 0 },
      toCore: () => log.push('to core'), toMenu: () => log.push('to menu'),
    });
    ls.init();
    const alphas: number[] = [];
    for (let i = 0; i < 40 && !log.includes('to core') && !log.includes('to menu'); i++) {
      ls.tick(dt);
      if (busy > 0) busy--;
      alphas.push(Math.round(shell.faderAlpha));
    }
    return { log, alphas, ls };
  };

  it('fades in over 0.5 s, starts the load, waits for it, fades out over 0.5 s, then switches to the round', () => {
    expect(LOAD_FADE_SECONDS).toBe(f32(0.5));
    const { log, alphas } = run(3);
    expect(log.filter((l) => l === 'load start' || l === 'to core')).toEqual(['load start', 'to core']);
    // (1 - t/0.5) x 128 in at t = 0.1 .. 0.5 (the fifth frame's single-precision sum is just under 0.5, the sixth ends
    // the ramp); the load starts on the seventh, before which nothing tests it; busy over two more frames; (t/0.5) x 128
    // out over five frames; the switch on the sixth of them.
    expect(alphas).toEqual([102, 77, 51, 26, 0, 0, 0, 0, 0, 26, 51, 77, 102, 128, 128]);
  });

  it('the abort flag (AbortLoad, a network error) switches back to the menu state', () => {
    const log: string[] = [];
    const shell = new MenuShell(new MenuQueue(), shellHost(log, ['dlgLoad.rdr']));
    const ls = new LoadState({ shell: () => shell, loader: { start() {}, busy: () => false }, toCore: () => log.push('to core'), toMenu: () => log.push('to menu') });
    ls.init();
    ls.abort = true;
    ls.tick(0.1);
    expect(log).toEqual(['to menu']);
  });
});

describe('the launches (research 115 §9)', () => {
  it('REBOOT relaunches the disc\'s ELF with --menu_state dlgAfterErrorReboot.rdr', () => {
    expect(REBOOT_LAUNCH).toEqual({ elf: 'cdrom0:\\SCUS_972.75;1', argv: ['--menu_state', 'dlgAfterErrorReboot.rdr', ''] });
    expect(menuStateOf(REBOOT_LAUNCH.argv)).toBe('dlgAfterErrorReboot.rdr');
    expect(menuStateOf([])).toBeNull();
  });

  it('SHUTDOWN launches the network setup GUI with the game and its return dialog', () => {
    expect(NTGUI_RETURN).toEqual({ wan: 'dlgReturnFromNTGUI2.rdr', lan: 'dlgReturnFromNTGUI2LAN.rdr' });
    expect(shutdownLaunch(false)).toEqual({
      elf: 'cdrom0:\\SCUSNGUI.ELF;1', argv: ['ENGLISH', 'cdrom0:\\SCUS_972.75;1', '--menu_state', 'dlgReturnFromNTGUI2.rdr'],
    });
    expect(shutdownLaunch(true).argv[3]).toBe('dlgReturnFromNTGUI2LAN.rdr');
    expect(menuStateOf(shutdownLaunch(false).argv)).toBe('dlgReturnFromNTGUI2.rdr');
    expect([NETWORK_GUI_PLACEHOLDER, NTGUI_RETURN_LAN_PLACEHOLDER]).toEqual(['return at once', false]);
  });

  it('ShutdownState Init launches it and answers 1', () => {
    const launched: unknown[] = [];
    const s = new ShutdownState({ launch: (l) => launched.push(l) });
    expect(s.init()).toBe(true);
    expect(launched).toEqual([shutdownLaunch(NTGUI_RETURN_LAN_PLACEHOLDER)]);
  });
});
