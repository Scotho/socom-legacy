import { describe, expect, it } from 'vitest';
import type { DialogBinding, DialogDesign } from '../../src/dialog';
import { addChild, buildDialogScreen, newNode } from '../../src/compositor/index';
import { ValveStore } from '../../src/valves';
import type { ZAnimRtAnimation, ZAnimRtCommand, ZAnimRtSet } from '../../src/zanimRuntime';
import { screenNodeTree, screenScripts } from '../../src/screens/screenScripts';

/**
 * The bridge from PLAT-07's runtime to the shell (web research 115 §3 A3, §4.3 step 8): the scripts' node names
 * resolved on the dialog's screen -- MENUFADER and POPUP included, which `dialogNodeTree` does not hold -- and a
 * dialog's sets started and its event records fired (`FUN_00367810` D:L263357-263396 through PLAT-21's
 * `deliverDialogEvent`).
 */

const design = (bindings: DialogBinding[], scripts: string[]): DialogDesign => ({
  libraries: [], usesMemcard: false, font: null, fontLib: true, background: null, bindings,
  controls: [], objects: [], scripts, models: [], dropped: [],
});
const anim = (name: string, flags: number): ZAnimRtAnimation => ({ name, params: { flags, priority: 0, seqOffsets: [] }, names: ['NA'], nodeRefs: [], sequences: [] });

/** The CALL/UI/WAIT layouts read in research 106 §4; research 363 pins CALL flag 1's input inheritance. */
function inputAnim(name: string, ops: ({ call: string; flags: number } | { wait: number } | { read: true })[]): ZAnimRtAnimation {
  const names = ['NA', ...ops.flatMap((op) => 'call' in op ? [op.call] : []), 'Read'];
  let offset = 0x1c;
  const commands: ZAnimRtCommand[] = ops.map((op) => {
    const set = 'read' in op ? 1 : 0, n = 'call' in op ? 45 : 'wait' in op ? 15 : 1;
    const size = 'call' in op ? 20 : 'wait' in op ? 12 : 16;
    const bytes = new Uint8Array(size), v = new DataView(bytes.buffer), timeless = !('wait' in op);
    v.setUint32(0, n | (set << 8) | (timeless ? 1 << 17 : 0) | (size << 18), true);
    if ('call' in op) { v.setUint16(4, op.flags, true); v.setUint8(7, names.indexOf(op.call)); }
    else if ('wait' in op) { v.setUint16(4, 9, true); v.setFloat32(8, op.wait, true); }
    else v.setUint8(6, names.indexOf('Read'));
    const at = offset; offset += size;
    return { offset: at, set, cmd: n, size, timeless, bytes };
  });
  return { ...anim(name, 0x22), names, sequences: [{ offset: 0, name: 'main', word: 0x102, size: offset, commands }] };
}

describe('screenNodeTree', () => {
  it('reaches MENUFADER, POPUP and the records by their exact names, and writes through to the screen', () => {
    const screen = buildDialogScreen(design([], []));
    addChild(screen.backplane, newNode('Start_Button'));
    const tree = screenNodeTree(screen);
    const fader = tree.node('MENUFADER')!;
    expect(fader.opacity).toBe(1);
    fader.opacity = 0.7;
    expect(screen.fader.opacity).toBe(0.7);
    const popup = tree.node('POPUP')!;
    expect(popup.active).toBe(false);
    popup.active = true;
    expect(screen.popup!.visible).toBe(true);
    const b = tree.node('Start_Button')!;
    b.position = [12, 34, 5];
    expect([screen.backplane.children[0]!.x, screen.backplane.children[0]!.y]).toEqual([12, 34]);
    expect(b.position).toEqual([12, 34, 5]);
    b.scale = [2, 3, 4];
    expect(screen.backplane.children[0]!.scale).toEqual([2, 3]);
    expect(tree.node('nothing')).toBeUndefined();
    expect(tree.node('MENUFADER')).toBe(fader);                 // one view per node
    expect([tree.node('menufader'), tree.node('start_button')]).toEqual([undefined, undefined]);
  });

  it('a name spelled exactly finds its node, not a shallower one differing only by case (FUN_00315d00 D:L215255-215290: strcmp)', () => {
    // dlgLadderLobby.rdr's shape (research 269 §4.2): the legend's `medal_blue` sits shallower in the walk than the foot's
    // `Medal_Blue`, so a case-folding walk bound ActivateMedalOfMerit's HIDE/SHOW to the legend.
    const screen = buildDialogScreen(design([], []));
    const legend = newNode('medal_blue'), group = newNode('foot'), foot = newNode('Medal_Blue');
    addChild(screen.backplane, legend);
    addChild(screen.backplane, group);
    addChild(group, foot);
    const tree = screenNodeTree(screen);
    tree.node('Medal_Blue')!.active = false;
    expect([legend.visible, foot.visible]).toEqual([true, false]);
    tree.node('medal_blue')!.active = false;
    expect([legend.visible, foot.visible]).toEqual([false, false]);
    // No exact spelling, no node: the menu's search has no folding step (NODE_NAME_MATCH_READING).
    expect(tree.node('MEDAL_BLUE')).toBeUndefined();
  });
});

describe('screenScripts', () => {
  const sets: ZAnimRtSet[] = [
    { name: 'UIanim.rdr', anims: [anim('menu_fade_up', 0x21), anim('goto_menu', 0x22)] },
    { name: 'dlgOther.rdr', anims: [anim('other', 0x21)] },
  ];

  it('starts the sets the dialog names (their auto-start animations) and fires its event records by kind', () => {
    const d = design([
      { kind: 'event', name: 'ON_STATE_POP', code: 0xd, state: 1, animation: 'goto_menu', argument: null },
      { kind: 'button', name: 'CROSS', code: 9, state: 1, animation: 'other', argument: null },
    ], ['UIanim.rdr', 'dlgMissing.rdr']);
    const screen = buildDialogScreen(d);
    const s = screenScripts({ design: d, screen, sets, valves: new ValveStore(), host: { uiCommand: () => true } });
    expect(s.missing).toEqual(['dlgMissing.rdr']);
    s.start();
    expect(s.runtime.isRunning('menu_fade_up')).toBe(true);    // params.flags & 7 == 1 (MENU_FADE_UP_AUTOSTART_READING)
    expect(s.runtime.isRunning('goto_menu')).toBe(false);
    expect(s.runtime.isActive('dlgOther.rdr')).toBe(false);      // not in the dialog's SCRIPT_LIBRARY
    expect(s.event(0)).toBe(false);                             // no ONSTART record
    expect(s.event(0xd)).toBe(true);
    expect(s.runtime.isRunning('goto_menu')).toBe(true);
    s.stop();
    expect(s.runtime.isActive('UIanim.rdr')).toBe(false);
  });

  it('INPUT_STRING_ARGUMENT_READING: an animation\'s string input is the ARGUMENT of the binding that started it', () => {
    const d = design([
      { kind: 'event', name: 'ON_STATE_POP', code: 0xd, state: 1, animation: 'goto_menu', argument: 'dlgOptions_Menu.rdr' },
      { kind: 'event', name: 'ONEXIT', code: 1, state: 1, animation: 'goto_menu', argument: 'dlgOther.rdr' },
    ], ['UIanim.rdr']);
    const s = screenScripts({ design: d, screen: buildDialogScreen(d), sets, valves: new ValveStore(), host: { uiCommand: () => true } });
    s.start();
    expect(s.inputString('goto_menu')).toBeNull();
    s.event(0xd);
    expect(s.inputString('GOTO_MENU')).toBe('dlgOptions_Menu.rdr');
    s.event(1);                                                 // refused: goto_menu still runs, its input stays
    expect(s.inputString('goto_menu')).toBe('dlgOptions_Menu.rdr');
    expect(s.startBinding('nothing', 'x')).toBe(false);
    s.stop();
    expect(s.inputString('goto_menu')).toBeNull();
  });

  it('a CALL inherits its own binding input while a keyboard event starts with its independent APPLY text', () => {
    const scripts = [{ name: 'test.rdr', anims: [
      inputAnim('join_game', [{ call: 'aux_join_game', flags: 0x201 }]),
      inputAnim('aux_join_game', [{ read: true }, { wait: 0.05 }, { read: true }]),
      inputAnim('send_chat', [{ read: true }]),
    ] }];
    const d = design([], ['test.rdr']);
    const seen: { anim: string; input: string | null }[] = [];
    const s = screenScripts({ design: d, screen: buildDialogScreen(d), sets: scripts, valves: new ValveStore(),
      host: { uiCommand: (c) => { seen.push({ anim: c.anim, input: s.inputString(c.anim) }); return true; } },
    });
    s.start(); s.startBinding('join_game', 'selected game'); s.tick(1 / 60);
    expect(s.inputString('aux_join_game')).toBe('selected game');
    s.startBinding('send_chat', 'password'); s.tick(1 / 60); s.tick(0.1);
    expect(seen).toEqual([
      { anim: 'aux_join_game', input: 'selected game' }, { anim: 'send_chat', input: 'password' },
      { anim: 'aux_join_game', input: 'selected game' },
    ]);
  });

  it('an unbound CALL without flag 1 gets no unrelated event argument', () => {
    const scripts = [{ name: 'test.rdr', anims: [
      inputAnim('other', [{ wait: 1 }]), inputAnim('caller', [{ call: 'callee', flags: 0x200 }]),
      inputAnim('callee', [{ read: true }]),
    ] }];
    const d = design([], ['test.rdr']);
    const seen: (string | null)[] = [];
    const s = screenScripts({ design: d, screen: buildDialogScreen(d), sets: scripts, valves: new ValveStore(),
      host: { uiCommand: (c) => { seen.push(s.inputString(c.anim)); return true; } },
    });
    s.start(); s.startBinding('other', 'unrelated'); s.startBinding('caller', 'caller input'); s.tick(1 / 60);
    expect(seen).toEqual([null]);
  });

  it('BINDING_SET_SEARCH_READING: a binding\'s animation is looked up in the dialog\'s own sets, in SCRIPT_LIBRARY order, not in an earlier set the dialog does not load', () => {
    // On the disc 169 names are defined in more than one set: dlgMenu's PulseArrows is also dlgCreateGame's (an earlier
    // set), dlgNetLogin's OnLoginRoomstart also dlgNetPlayerName's (MENU-01a, research 138 §3).
    const shadowing: ZAnimRtSet[] = [
      { name: 'dlgCreateGame.rdr', anims: [anim('PulseArrows', 0x22)] },
      { name: 'dlgMenu.rdr', anims: [anim('PulseArrows', 0x22), anim('SetMenuValve', 0x22)] },
      { name: 'UIanim.rdr', anims: [anim('menu_fade_up', 0x21), anim('PulseArrows', 0x22)] },
    ];
    const d = design([
      { kind: 'event', name: 'ONSTART', code: 0, state: 1, animation: 'PulseArrows', argument: null },
      { kind: 'event', name: 'ONSTART', code: 0, state: 1, animation: 'SetMenuValve', argument: null },
    ], ['dlgMenu.rdr', 'UIanim.rdr']);
    const s = screenScripts({ design: d, screen: buildDialogScreen(d), sets: shadowing, valves: new ValveStore(), host: { uiCommand: () => true } });
    s.start();
    expect(s.event(0)).toBe(true);
    const running = s.runtime.running().map((i) => `${shadowing.find((x) => x.anims.includes(i.anim))!.name}/${i.name}`);
    expect(running).toContain('dlgMenu.rdr/PulseArrows');
    expect(running).toContain('dlgMenu.rdr/SetMenuValve');
    expect(running).not.toContain('dlgCreateGame.rdr/PulseArrows');
    expect(s.startBinding('other', null)).toBe(false);          // a name none of the dialog's sets defines
  });

  it('LOADED_SETS_READING: a binding\'s animation is found among the dialog\'s SCRIPT_LIBRARY sets in their order, not in an unloaded set that precedes them in the archive (BOOT-04)', () => {
    // The archive holds `do_onstart` in dlgAfterErrorReboot.rdr (set 29) before dlgIntroScreen.rdr's (set 35): the
    // boot's ONSTART must start the latter -- the context at 0x414bb0 holds only the loaded sets (build step 8,
    // D:L263692-263731, `FUN_00268250` then `FUN_0026c600`), which `FUN_0026a250` searches (research 139 §4).
    const archive: ZAnimRtSet[] = [
      { name: 'dlgAfterErrorReboot.rdr', anims: [anim('do_onstart', 0x22)] },
      { name: 'UIanim.rdr', anims: [anim('menu_fade_up', 0x21), anim('goto_menu', 0x22)] },
      { name: 'dlgIntroScreen.rdr', anims: [anim('do_onstart', 0x22), anim('handle_memcard_error', 0x22)] },
    ];
    const d = design([
      { kind: 'event', name: 'ONSTART', code: 0, state: 1, animation: 'do_onstart', argument: null },
    ], ['dlgIntroScreen.rdr', 'uianim.rdr']);
    const s = screenScripts({ design: d, screen: buildDialogScreen(d), sets: archive, valves: new ValveStore(), host: { uiCommand: () => true } });
    s.start();
    expect(s.runtime.isActive('dlgAfterErrorReboot.rdr')).toBe(false);
    expect(s.event(0)).toBe(true);
    expect(s.runtime.isRunning('do_onstart')).toBe(true);
    expect(s.runtime.running().map((i) => `${archive.findIndex((x) => x.anims.includes(i.anim))}:${i.name}`)).toContain('2:do_onstart');
  });
});
