import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { loadDialog, type DialogDesign } from '../../src/dialog';
import { Popup, type PopupContext } from '../../src/popup/popup';
import { readPopupRecord } from '../../src/popup/record';
import { UiCommandHost } from '../../src/uiCommands';
import { ValveStore } from '../../src/valves';
import type { ZAnimRtSet } from '../../src/zanimRuntime';
import { screenScripts } from '../../src/screens/screenScripts';
import { newScreen } from '../../src/compositor/scene';
import {
  DESKTOP_SCREEN_ANSWER_VALVE, DESKTOP_SCREEN_CONTINUE_LABEL, DESKTOP_SCREEN_GATE, DESKTOP_SCREEN_HOOKS, DESKTOP_SCREEN_NAMES,
  DESKTOP_SCREEN_RECORD, DESKTOP_SCREEN_TEXT_PLACEHOLDER, DesktopScreen, DesktopScreenHooks, MENU_03_HOOKS, MENU_08_HOOKS, ONL_02_HOOKS,
  bindersOf, boundAnimation, checkDesktopHook, checkDesktopHooks, desktopHookRig, desktopNoticeCommand, writePopupRecord,
  type DesktopHookRigOptions, type DesktopScreenHook,
} from '../../src/desktopScreen/index';
import * as ui from '../../src/index';
import { textFace } from '../text/fixtures';
import { r, rec } from '../widgets/fixtures';
import { animation, uiFn } from '../screens/zanimAsm';

/**
 * PLAT-28's screen, its harness and MENU-03's and MENU-08's hooks (web research 142), on a hand-built main menu: the
 * six items under their disc names, each CROSS bound to the disc's animation (the pin `menuEntryCommands.pinned.json`),
 * each animation a miniature of the disc's first commands (`SuspendMenuInput 1.75`, `ClearCareerStats`, `SWITCHMENU`;
 * LOAD GAME's with `ListSavedGames` added so the acceptance's row is reachable). No disc bytes: the hooks need no drawn
 * menu (the real `dlgMenu` is `desktopScreenFixtures.test.ts`'s). Nothing measured on the original running.
 */

const NAMES = [
  'NA', 'SuspendMenuInput', '1.75', 'ClearCareerStats', 'SWITCHMENU', 'dlgSelectRank.rdr', 'BackgroundMPEG', 'OFF', 'ON',
  'ListSavedGames', 'dlgOptions_Menu.rdr', 'dlgNetUnlockableExtras.rdr', 'dlgMPswitch.rdr',
];
const suspend = uiFn(NAMES, 'SuspendMenuInput', '1.75');
const go = (to: string) => uiFn(NAMES, 'SWITCHMENU', to);
const SETS: ZAnimRtSet[] = [{
  name: 'dlgMenu.rdr',
  anims: [
    animation('UiprepMission1', NAMES, [], [suspend, uiFn(NAMES, 'ClearCareerStats'), go('dlgSelectRank.rdr')]),
    animation('MainMenuOnLoad', NAMES, [], [uiFn(NAMES, 'BackgroundMPEG', 'OFF'), uiFn(NAMES, 'ListSavedGames'), uiFn(NAMES, 'BackgroundMPEG', 'ON')]),
    animation('do_multi_or_medius', NAMES, [], [suspend, go('dlgMPswitch.rdr')]),
    animation('CallOptions', NAMES, [], [suspend, go('dlgOptions_Menu.rdr')]),
    animation('CallExtras', NAMES, [], [suspend, go('dlgNetUnlockableExtras.rdr')]),
    animation('go_to_LAN_play', NAMES, [], [suspend, go('dlgMPswitch.rdr')]),
  ],
}];

const ITEMS: [string, string][] = [
  ['new_game_button', 'UiprepMission1'], ['load_game_button', 'MainMenuOnLoad'], ['multiplayer_button', 'do_multi_or_medius'],
  ['options_button', 'CallOptions'], ['Extras_button', 'CallExtras'], ['LAN_button', 'go_to_LAN_play'],
];
const button = (name: string, y: number, anim: string): RdrNode[] =>
  rec(name, 'BUTTON', 100, y, r('XSIZE', '100', 'YSIZE', '20', 'ANIMATIONS', [r('BUTTON', 'CROSS', 'ANIMATION', anim)]));
const menu = (items: [string, string][] = ITEMS): DialogDesign => loadDialog([['SCREENS', r(
  // The screen's own ANIMATIONS, empty: absent, the depth-first lookup (`FUN_0032f0e0`) would read the first control's as
  // the screen's (bindersOf's `screen BUTTON CROSS`); the disc's dlgMenu has none bound to the five.
  'SCRIPT_LIBRARY', 'dlgMenu.rdr', 'FONT', 'font_t', 'ANIMATIONS', [], 'CONTROLS', items.map(([n, a], i) => button(n, 100 + 30 * i, a)), 'OBJECTS', [],
)]]);
const blank = (): DialogDesign => loadDialog([['SCREENS', r('FONT', 'font_t', 'CONTROLS', [rec('x', 'BUTTON', 0, 0, r('XSIZE', '10', 'YSIZE', '10'))], 'OBJECTS', [])]]);
const DIALOGS: Record<string, () => DialogDesign> = {
  'dlgMenu.rdr': menu, 'dlgSelectRank.rdr': blank, 'dlgOptions_Menu.rdr': blank, 'dlgNetUnlockableExtras.rdr': blank, 'dlgMPswitch.rdr': blank,
};

/** A card the rig's MENU-01a rows read: an empty port 0; its "content" is constant (nothing here writes it). */
const make = (hooks?: DesktopScreenHooks | null, more: Partial<DesktopHookRigOptions> = {}) => () => desktopHookRig({
  dialog: (n) => DIALOGS[n]?.() ?? null, sets: SETS, startDialog: 'dlgMenu.rdr', face: () => textFace(),
  locText: (id) => (id === DESKTOP_SCREEN_CONTINUE_LABEL ? 'CONTINUE' : null), cardState: () => 'empty', hooks, ...more,
});

/**
 * The five hooks the acceptance names, written out (not read from `DESKTOP_SCREEN_HOOKS`): a hook dropped from the list
 * fails its own test below instead of taking the test with it.
 */
const FIVE: [string, string, string][] = [
  ['NEW GAME', 'new_game_button', 'UiprepMission1'], ['LOAD GAME', 'load_game_button', 'MainMenuOnLoad'],
  ['OPTIONS', 'options_button', 'CallOptions'], ['EXTRAS', 'Extras_button', 'CallExtras'], ['LAN', 'LAN_button', 'go_to_LAN_play'],
];
const hookOf = (feature: string): DesktopScreenHook => {
  const h = DESKTOP_SCREEN_HOOKS.find((x) => x.feature === feature);
  if (!h) throw new Error(`DESKTOP_SCREEN_HOOKS has no ${feature} hook`);
  return h;
};
const TIMING = { settle: 5, step: 2, hold: 5, after: 5 };

/** The pinned bindings of `dlgMenu.rdr` (MENU-01a's pin, read off the disc by `tools/menuEntryCommands.ts`). */
const PIN: { dialogs: { name: string; bindings: string[] }[] } = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../../tools/test/menuEntryCommands.pinned.json'), 'utf8'),
);
const menuPin = PIN.dialogs.find((d) => d.name === 'dlgMenu.rdr')!.bindings;

describe('the hooks (MENU-03, MENU-08) and their registry', () => {
  it('five hooks on dlgMenu: NEW GAME, LOAD GAME, OPTIONS, EXTRAS (MENU-03) and LAN (MENU-08), each a pinned CROSS binding; then the ONL-02 hook', () => {
    expect(DESKTOP_SCREEN_HOOKS.map((h) => [h.task, h.feature, h.control, h.replaces])).toEqual([
      ['MENU-03', 'NEW GAME', 'new_game_button', 'UiprepMission1'],
      ['MENU-03', 'LOAD GAME', 'load_game_button', 'MainMenuOnLoad'],
      ['MENU-03', 'OPTIONS', 'options_button', 'CallOptions'],
      ['MENU-03', 'EXTRAS', 'Extras_button', 'CallExtras'],
      ['MENU-08', 'LAN', 'LAN_button', 'go_to_LAN_play'],
      ['ONL-02', 'EDIT NETWORK CONFIGURATIONS', 'configureBtn', 'launchNTGUI2'],   // on dlgNetLogin: netLoginDesktopHook.test.ts
    ]);
    expect([...MENU_03_HOOKS, ...MENU_08_HOOKS, ...ONL_02_HOOKS]).toEqual(DESKTOP_SCREEN_HOOKS);
    for (const h of [...MENU_03_HOOKS, ...MENU_08_HOOKS]) {
      expect(h.dialog).toBe('dlgMenu.rdr');
      expect(menuPin, h.feature).toContain(`${h.control} BUTTON ${h.press} -> ${h.replaces} [dlgMenu.rdr]`);
    }
    // ONLINE is the one live branch (OT.R5): not hooked.
    expect(DESKTOP_SCREEN_HOOKS.some((h) => h.control === 'multiplayer_button')).toBe(false);
  });

  it('OPTIONS and EXTRAS are marked removable by their screens (OPT-09, MENU-04); the other three are not', () => {
    expect(Object.fromEntries(DESKTOP_SCREEN_HOOKS.map((h) => [h.feature, h.removableBy ?? null]))).toEqual({
      'NEW GAME': null, 'LOAD GAME': null, OPTIONS: 'OPT-09', EXTRAS: 'MENU-04', LAN: null, 'EDIT NETWORK CONFIGURATIONS': null,
    });
    expect(DESKTOP_SCREEN_HOOKS.find((h) => h.feature === 'LOAD GAME')!.chain).toEqual(['ListSavedGames']);
  });

  it('the registry: a hook per (dialog, control, press); a second throws; unregister removes it; match follows the design', () => {
    const hooks = new DesktopScreenHooks(DESKTOP_SCREEN_HOOKS);
    expect(() => hooks.register(MENU_08_HOOKS[0]!)).toThrow(/already hooked/);
    const d = menu();
    expect(boundAnimation(d, 'options_button', 'CROSS')).toBe('CallOptions');
    expect(hooks.match('DLGMENU.RDR', d, 'calloptions')?.feature).toBe('OPTIONS');           // case-folded as the dispatcher folds
    expect(hooks.match('dlgMenu.rdr', d, 'do_multi_or_medius')).toBeNull();
    expect(hooks.match('dlgOptions_Menu.rdr', d, 'CallOptions')).toBeNull();
    expect(hooks.unregister('dlgMenu.rdr', 'options_button', 'CROSS')).toBe(true);          // OPT-09's day
    expect(hooks.match('dlgMenu.rdr', d, 'CallOptions')).toBeNull();
    expect(hooks.unregister('dlgMenu.rdr', 'options_button', 'CROSS')).toBe(false);
    // A later task's hook (ONL-02's shape): one entry, matched by its design's binding.
    const later: DesktopScreenHook = { task: 'ONL-02', feature: 'X', dialog: 'dlgMenu.rdr', control: 'multiplayer_button', press: 'CROSS', replaces: 'do_multi_or_medius' };
    hooks.register(later);
    expect(hooks.match('dlgMenu.rdr', d, 'do_multi_or_medius')).toEqual(later);
  });

  it('is exported from the package index (the registration API for ONL-02 and the others)', () => {
    for (const name of ['DesktopScreen', 'DesktopScreenHooks', 'DESKTOP_SCREEN_HOOKS', 'checkDesktopHook', 'desktopHookRig', 'DESKTOP_SCREEN_TEXT_PLACEHOLDER']) {
      expect(ui, name).toHaveProperty(name);
    }
  });
});

describe('the notice: PLAT-16\'s popup with the main menu\'s one-button record, its text the owner\'s (H76)', () => {
  it('says the block\'s sentence, plainly, as a named placeholder', () => {
    expect(DESKTOP_SCREEN_TEXT_PLACEHOLDER).toBe('available in the desktop recompilation or with emulators');
    expect(DESKTOP_SCREEN_NAMES[DESKTOP_SCREEN_RECORD.textName]).toBe(DESKTOP_SCREEN_TEXT_PLACEHOLDER);
  });

  it('the record round-trips through the popup\'s reader (FUN_0036da20\'s offsets)', () => {
    expect(readPopupRecord(writePopupRecord(DESKTOP_SCREEN_RECORD))).toEqual(DESKTOP_SCREEN_RECORD);
    const cmd = desktopNoticeCommand();
    expect([cmd.node, cmd.bytes[6]]).toEqual(['POPUP', 0xe8]);
  });

  it('applied: popupOp.tif 340 x 120 at (150, 180), one CONTINUE button 85 x 25 at (125, 80), its answer in a valve store of its own', () => {
    const valves = new ValveStore();
    const ctx: PopupContext = {
      face: () => textFace(), font: 'font_t', captions: null, uiVars: null, valves, locText: (id) => (id === 226 ? 'CONTINUE' : null),
      name: (_c, i) => DESKTOP_SCREEN_NAMES[i] ?? null, hasTexture: () => true,
    };
    const p = new Popup(ctx);
    p.command(desktopNoticeCommand());
    expect([p.x, p.y, p.w, p.h, p.panel.texture]).toEqual([150, 180, 340, 120, 'popupOp.tif']);
    expect([p.buttons[0].size, p.buttonAt[0], p.buttons[1].size[0]]).toEqual([[85, 25], [125, 80], 0]);
    expect(p.valve?.name).toBe(DESKTOP_SCREEN_ANSWER_VALVE);
    expect(p.text.lines.length).toBeGreaterThan(0);
  });
});

describe('the gate on PLAT-08\'s host interface: none of the chain is dispatched', () => {
  const CHAIN = ['UiprepMission1', 'MainMenuOnLoad', 'ListSavedGames', 'CallOptions', 'CallExtras', 'go_to_LAN_play'];

  /** The dialog's scripts over the hand-built menu, every dispatch and every start recorded. */
  const scripts = (gate: boolean) => {
    const host = new UiCommandHost();
    const dispatched: string[] = [], started: string[] = [];
    const dispatch = host.dispatch.bind(host);
    host.dispatch = (c, t) => { const o = dispatch(c, t); if (o.kind !== 'node') dispatched.push(c.fn ?? ''); return o; };
    const machine = { shell: () => null, queue: { popupObject: null } } as never;
    const screen = new DesktopScreen({ machine: () => machine });
    if (gate) screen.register(host);
    const s = screenScripts({ design: menu(), screen: newScreen(), sets: SETS, valves: new ValveStore(), host, dialog: 'dlgMenu.rdr', trace: (e) => { if (e.kind === 'start') started.push(e.anim); } });
    s.start();
    return { s, host, dispatched, started };
  };

  it('with the gate: each hooked binding is taken ("found"), nothing started, no row dispatched', () => {
    const t = scripts(true);
    for (const [feature, , anim] of FIVE) expect(t.s.startBinding(anim, null), feature).toBe(true);
    for (let i = 0; i < 10; i++) t.s.tick(1 / 30);
    expect(t.started).toEqual([]);
    expect(t.dispatched.filter((n) => CHAIN.some((c) => c.toLowerCase() === n.toLowerCase()))).toEqual([]);
    expect(t.dispatched).toEqual([]);
    // An unhooked binding goes on as the original's.
    expect(t.s.startBinding('do_multi_or_medius', null)).toBe(true);
    expect(t.started).toEqual(['do_multi_or_medius']);
  });

  it('the control: without the gate the same starts run the chain (the miniature\'s rows reach the host)', () => {
    const t = scripts(false);
    for (const [, , anim] of FIVE) t.s.startBinding(anim, null);
    for (let i = 0; i < 10; i++) t.s.tick(1 / 30);
    expect(t.started).toEqual(FIVE.map(([, , anim]) => anim));
    expect(t.dispatched).toContain('ListSavedGames');
    expect(t.dispatched).toContain('ClearCareerStats');
  });

  it('the gate is the host\'s, under PLAT-28\'s name; removing it restores the original path', () => {
    const host = new UiCommandHost();
    const seen: string[] = [];
    host.setBindingGate(DESKTOP_SCREEN_GATE, (b) => { seen.push(b.animation); return true; });
    expect(host.bindingStart({ dialog: 'd', design: menu(), animation: 'a', argument: null })).toBe(true);
    host.setBindingGate(DESKTOP_SCREEN_GATE, null);
    expect(host.bindingStart({ dialog: 'd', design: menu(), animation: 'b', argument: null })).toBe(false);
    expect(seen).toEqual(['a']);
  });
});

describe('PLAT-28\'s harness over the hand-built menu: the screen at the press, CONTINUE back, nothing changed', () => {
  for (const [feature, control, anim] of FIVE) {
    it(`${feature}: ${control} CROSS opens the screen in place of ${anim}; CONTINUE returns to the row; the twin's state`, () => {
      const hook = hookOf(feature);
      expect([hook.control, hook.replaces]).toEqual([control, anim]);
      const c = checkDesktopHook(make(), hook, TIMING);
      expect(c.failures).toEqual([]);
      expect([c.reached, c.shown, c.drawn, c.closed]).toEqual([true, true, true, true]);
      expect(c.after.dialog).toBe('dlgMenu.rdr');
      expect(c.after.focused).toBe(hook.control);
      expect(c.after).toEqual(c.twin);
      expect(c.chain).toEqual([]);
      expect(c.extra).toEqual([]);
    });
  }

  it('the control: with no gate the harness fails each hook -- the chain runs, the dialog leaves or the rows differ', () => {
    for (const c of checkDesktopHooks(make(null), FIVE.map(([f]) => hookOf(f)), TIMING)) {
      expect(c.shown, c.hook.feature).toBe(false);
      expect(c.chain, c.hook.feature).toContain(c.hook.replaces);
      expect(c.failures.length, c.hook.feature).toBeGreaterThan(0);
    }
  });

  it('ONLINE, not hooked, still switches to dlgMPswitch through the same rig', () => {
    const rig = make()();
    rig.run(5);
    rig.press('DOWN'); rig.run(2); rig.press('DOWN'); rig.run(2);
    expect(rig.focused()).toBe('multiplayer_button');
    rig.press('CROSS');
    rig.run(60);
    expect(rig.state().dialog).toBe('dlgMPswitch.rdr');
    expect(rig.screen.opened).toEqual([]);
  });

  it('a hook whose design binds another animation fails the harness (the hook follows the disc, the harness says so)', () => {
    const wrong: DesktopScreenHook = { ...MENU_08_HOOKS[0]!, replaces: 'SomethingElse' };
    const c = checkDesktopHook(make(new DesktopScreenHooks([wrong])), wrong, TIMING);
    expect(c.bound).toBe('go_to_LAN_play');
    expect(c.failures).toContain('LAN_button CROSS starts go_to_LAN_play, not SomethingElse');
  });

  it('a later task\'s rows (`register`) go in after MENU-01a\'s: its body is the one the chain reaches, with the rig\'s machine', () => {
    const calls: string[] = [];
    let valves = false;
    const later = make(null, {
      register: (host, machine) => host.setHandler('ClearCareerStats', () => { calls.push('later'); valves = machine().valves !== undefined; return true; }),
    })();
    later.run(5);
    expect(later.focused()).toBe('new_game_button');
    later.press('CROSS');
    later.run(10);
    expect(calls).toEqual(['later']);              // had MENU-01a's rows gone in after it, its ClearCareerStats would answer
    expect(valves).toBe(true);
    // With the gate, the rows behind the hooked press are not reached: the harness passes with them registered.
    calls.length = 0;
    const gated = make(undefined, { register: (host) => host.setHandler('ClearCareerStats', () => { calls.push('later'); return true; }) });
    expect(checkDesktopHook(gated, hookOf('NEW GAME'), TIMING).failures).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('a hook is per (dialog, animation): another binding of the same animation is named, and fails the harness', () => {
    const alias: [string, string][] = [...ITEMS, ['LAN_alias', 'go_to_LAN_play']];
    const d = menu(alias);
    expect(bindersOf(d, 'go_to_LAN_play')).toEqual(['LAN_button BUTTON CROSS', 'LAN_alias BUTTON CROSS']);
    expect(bindersOf(menu(), 'GO_TO_LAN_PLAY')).toEqual(['LAN_button BUTTON CROSS']);
    d.bindings.push({ kind: 'event', name: 'ONSTART', code: 0, state: 1, animation: 'go_to_LAN_play', argument: null });
    expect(bindersOf(d, 'go_to_LAN_play')).toContain('screen EVENT ONSTART');
    // The registry matches the animation, so the alias's press opens the screen too (not reachable on dlgMenu): the harness says so.
    expect(new DesktopScreenHooks(MENU_08_HOOKS).match('dlgMenu.rdr', menu(alias), 'go_to_LAN_play')?.control).toBe('LAN_button');
    const rig = () => desktopHookRig({
      dialog: (n) => (n === 'dlgMenu.rdr' ? menu(alias) : DIALOGS[n]?.() ?? null), sets: SETS, startDialog: 'dlgMenu.rdr', face: () => textFace(),
      locText: (id) => (id === DESKTOP_SCREEN_CONTINUE_LABEL ? 'CONTINUE' : null), cardState: () => 'empty',
    });
    const c = checkDesktopHook(rig, hookOf('LAN'), TIMING);
    expect(c.shared).toEqual(['LAN_alias BUTTON CROSS']);
    expect(c.failures).toContain('go_to_LAN_play is also bound on LAN_alias BUTTON CROSS: a hook is per (dialog, animation), so that start opens the screen too');
    // The hand-built menu, as the disc's, binds each of the five once.
    for (const [feature] of FIVE) expect(checkDesktopHook(make(), hookOf(feature), TIMING).shared, feature).toEqual([]);
  });
});
