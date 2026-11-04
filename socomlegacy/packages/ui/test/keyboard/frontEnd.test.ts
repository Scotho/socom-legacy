import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { UI_TICK_SECONDS } from '../../src/clock/index';
import type { DialogDesign } from '../../src/dialog';
import type { MovieService } from '../../src/movie/movieCommands';
import { UiCommandHost, uiCommandRowByName } from '../../src/uiCommands';
import type { ZAnimRtSet } from '../../src/zanimRuntime';
import { DialogPartsHost } from '../../src/screens/dialogParts';
import { FrontEndMachine } from '../../src/screens/frontEndMachine';
import { PopupSlot } from '../../src/screens/popupSlot';
import { MenuInput, type PadSlotName } from '../../src/input/index';
import { GET_TEXT_INPUT, SKB_SOUND, SoftKeyboardFrontEnd, readSoftKeyboards, type UsbKey } from '../../src/keyboard';
import { findNode, loadDialog, UiVarManager } from '../../src/index';
import { textFace } from '../text/fixtures';
import { r, rec } from '../widgets/fixtures';
import { animation, command, sound } from '../screens/zanimAsm';
import { textInputBlock, uiParams } from './fixtures';

/**
 * PLAT-17 connected to the front end (web research 119 §3, §8; sprint 9's W9.R4 lines): `GetTextInput` in PLAT-08's
 * registry, the keyboard taking the pad at the dispatch's step 2 before the focused control and the screen, A8's tick,
 * the draw over the screen, MENUFADER at 0.5, the events to the dialog's records with the typed text as the animation's
 * argument, `skb_done` in the launch's valves. Synthetic dialog and animations on PLAT-12's tick; nothing measured on
 * the original running.
 */

const NAMES = ['NA', 'GetTextInput', 'PLAYERNAMEVAR', '$1', '.name', '.applied', '.cancelled', '.closed', '.screenUp', 'PLAYERPASSWORD'];
const gti = (uiVar: string, maxChars = 14) => command(1, 1, 0xac, (v, b) => {
  b.set(textInputBlock({ uiVarIndex: NAMES.indexOf(uiVar), purpose: '_455_EnterPlayerName_MSG', skb: 'CREATEPLAYERNAME', maxBytes: 31, maxChars, noDQuote: true }).subarray(8), 8);
  v.setUint16(4, 0, true);
  v.setUint8(6, NAMES.indexOf('GetTextInput'));
});
const SETS: ZAnimRtSet[] = [{
  name: 't.rdr',
  anims: [
    animation('name', NAMES, [], [gti('PLAYERNAMEVAR'), sound(NAMES, '.name')]),
    animation('byArg', NAMES, [], [gti('$1')]),
    animation('pw', NAMES, [], [gti('PLAYERPASSWORD', 12)]),
    animation('applied', NAMES, [], [sound(NAMES, '.applied')]),
    animation('cancelled', NAMES, [], [sound(NAMES, '.cancelled')]),
    animation('closed', NAMES, [], [sound(NAMES, '.closed')]),
    animation('screenUp', NAMES, [], [sound(NAMES, '.screenUp')]),
  ],
}];

const button = (name: string, y: number, ...anims: RdrNode[][]) => rec(name, 'BUTTON', 100, y, r('XSIZE', '100', 'YSIZE', '20', 'ANIMATIONS', anims));
const DESIGN: DialogDesign = loadDialog([['SCREENS', r('SCRIPT_LIBRARY', 't.rdr',
  'ANIMATIONS', [r('EVENT', 'ON_SKB_APPLY', 'ANIMATION', 'applied'), r('EVENT', 'ON_SKB_CANCEL', 'ANIMATION', 'cancelled'),
    r('EVENT', 'ON_SKB_CLOSE', 'ANIMATION', 'closed'), r('BUTTON', 'UP', 'ANIMATION', 'screenUp')],
  'FONT', 'font_t',
  'CONTROLS', [button('A', 100, r('BUTTON', 'CROSS', 'ANIMATION', 'name')), button('B', 130, r('BUTTON', 'CROSS', 'ANIMATION', 'byArg', 'ARGUMENT', 'MYVAR')),
    button('C', 160, r('BUTTON', 'CROSS', 'ANIMATION', 'pw'))],
  // The persona form's fields as dlgNetPlayerName holds them: a TEXT and a SECURETEXT printing their UIVARs (FUN_00379260).
  'OBJECTS', [rec('NAMEFIELD', 'TEXT', 300, 100, r('UIVAR', [r('NAME', 'PLAYERNAMEVAR')])), rec('PWFIELD', 'SECURETEXT', 300, 160, r('UIVAR', [r('NAME', 'PLAYERPASSWORD')]))])]]);

function rig(uiVars?: UiVarManager) {
  let m!: FrontEndMachine;
  const heard: string[] = [];
  const face = textFace();
  const parts = new DialogPartsHost({ popupObject: () => m.queue.popupObject, face: () => face, sound: (n) => heard.push(n), uiVars });
  const host = new UiCommandHost({ node: parts.nodeCommand, sound: (c) => heard.push(c.sound) });
  const input = new MenuInput({ machine: () => m, parts });
  input.register(host);
  const skb = new SoftKeyboardFrontEnd({ machine: () => m, parts, sound: (s) => heard.push(`skb${s}`), uiVars });
  skb.load(readSoftKeyboards(uiParams()));
  skb.connect(host, input);
  const queue: UsbKey[] = [];
  skb.usbKey = () => queue.shift() ?? null;
  const held = new Set<PadSlotName>();
  input.source = { read: () => ({ down: new Set(held), stickX: 0, stickY: 0 }) };
  const slot = new PopupSlot();
  slot.connect(parts.makePopup);
  const movie = {
    service: { background: { on: () => {}, off: () => {} }, play: () => {} } as unknown as MovieService,
    frame: () => 'menu' as const, unload: () => {}, load: () => input.built(),
  };
  m = new FrontEndMachine({
    dialog: (n) => (n === 'dlgTest.rdr' ? DESIGN : null), sets: SETS, host, popups: slot, startDialog: 'dlgTest.rdr',
    built: parts.built, draw: skb.drawOver(parts.draw), widgetsTick: parts.widgetsTick, setEnabled: parts.setEnabled,
    focusTick: skb.tick, input: input.dispatch, pad: input.read, activate: input.activate, movie,
  });
  m.boot();
  let last: ReturnType<FrontEndMachine['frame']> = [];
  const run = (n = 1): void => { for (let i = 0; i < n; i++) last = m.frame(UI_TICK_SECONDS); };
  const press = (b: PadSlotName): void => { held.add(b); run(); held.delete(b); run(); };
  run(2);
  return { m, skb, input, parts, heard, queue, run, press, take: () => heard.splice(0), items: () => last };
}

describe('GetTextInput in the front end', () => {
  it('row 18 of PLAT-08\'s table is bound (the registry), its answer 1', () => {
    const t = rig();
    expect(uiCommandRowByName(GET_TEXT_INPUT)?.id).toBe(18);
    t.take();
    t.press('CROSS');
    expect(t.take()).toEqual(['skb0', '.name']);                                    // the open sound, then the script goes on
    expect(t.skb.keyboard.isOpen).toBe(true);
    expect(t.m.valves.find('skb_done')?.value).toBe(0);
    expect(t.m.shell()!.screen.fader.opacity).toBe(0.5);
  });

  it('while up the keyboard takes the pad before the focused control and the screen; A8 runs its scale', () => {
    const t = rig();
    t.press('CROSS');
    t.run(8);
    expect(t.skb.keyboard.busy).toBe(false);
    t.take();
    t.press('UP');                                                                   // the screen binds UP: not reached
    expect(t.take()).toEqual([`skb${SKB_SOUND.NAVIGATION}`]);
    expect(t.input.last).toBe('softKeyboard');
    expect(t.items().some((i) => i.kind === 'sprite' && i.texture === 'Skbbg_LC.tif')).toBe(true);
  });

  it('ENTER: ON_SKB_APPLY\'s animation started with the typed text as its argument, then ON_SKB_CLOSE\'s; skb_done 1 at the close\'s end', () => {
    const t = rig();
    t.press('CROSS');
    t.run(8);
    t.queue.push({ hid: 0x0a, shift: true, capsLamp: false }, { hid: 0x12, shift: false, capsLamp: false });
    t.run();
    expect(t.skb.keyboard.text).toBe('Go');
    t.take();
    t.press('CIRCLE');
    expect(t.take()).toEqual(['skb1', 'skb4', '.applied', '.closed']);
    expect(t.parts.current!.dialog.scripts!.inputString('applied')).toBe('Go');
    expect(t.skb.uiVars.find('PLAYERNAMEVAR')?.value).toEqual({ type: 'string', value: 'Go' });
    t.run(8);
    expect(t.m.valves.find('skb_done')?.value).toBe(1);
    expect(t.skb.keyboard.isOpen).toBe(false);
    expect(t.m.shell()!.screen.fader.opacity).toBe(0);
  });

  it('TRIANGLE: ON_SKB_CANCEL then ON_SKB_CLOSE, each with its own ARGUMENT', () => {
    const t = rig();
    t.press('CROSS');
    t.run(8);
    t.take();
    t.press('TRIANGLE');
    expect(t.take()).toEqual(['skb1', '.cancelled', '.closed']);
  });

  it('UiVar $1: the running script\'s argument names the variable (FUN_00397640 D:L289873-289876)', () => {
    const t = rig();
    t.press('DOWN');
    t.press('CROSS');
    t.run(8);
    t.queue.push({ hid: 0x04, shift: false, capsLamp: false });
    t.run();
    t.press('CIRCLE');
    expect(t.skb.uiVars.find('MYVAR')?.value).toEqual({ type: 'string', value: 'a' });
  });

  it('a tap on a key highlights it and presses it; a tap off the keys is lost (SKB_TOUCH_READING)', () => {
    const t = rig();
    t.press('CROSS');
    t.run(8);
    const kb = t.skb.keyboard, l = kb.layout!;
    const q = l.keyProps.find((p) => p.key.type === 0 && p.key.value === 0x51)!;      // Q
    expect(t.input.tap(l.skbPos[0] + q.x + 1, l.skbPos[1] + q.y + 1)).toBeNull();
    t.run();
    expect(kb.text).toBe('q');
    t.input.tap(1, 1);
    t.run();
    expect(kb.text).toBe('q');
  });

  it('one manager for the widgets and the keyboard: the persona form\'s TEXT shows the name, its SECURETEXT one * a character', () => {
    const vars = new UiVarManager();
    const t = rig(vars);
    expect(t.skb.uiVars).toBe(vars);
    const codes = (name: string) => { const c = findNode(t.m.shell()!.screen.root, name)?.content; return c?.kind === 'text' ? c.text.codes : null; };
    t.press('CROSS');                                                                // A: PLAYERNAMEVAR, cap 14
    t.run(8);
    t.queue.push({ hid: 0x0a, shift: true, capsLamp: false }, { hid: 0x12, shift: false, capsLamp: false });
    t.run();
    t.press('CIRCLE');
    t.run(8);
    expect(vars.find('PLAYERNAMEVAR')?.value).toEqual({ type: 'string', value: 'Go' });
    expect(codes('NAMEFIELD')).toEqual([0x47, 0x6f]);
    t.press('DOWN');
    t.press('DOWN');
    t.press('CROSS');                                                                // C: PLAYERPASSWORD, cap 12
    t.run(8);
    for (const hid of [0x13, 0x04, 0x16, 0x16, 0x1e, 0x1f, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26]) t.queue.push({ hid, shift: false, capsLamp: false });
    t.run();
    t.press('CIRCLE');
    t.run(8);
    expect(vars.find('PLAYERPASSWORD')?.value).toEqual({ type: 'string', value: 'pass12345678' });   // 13 typed, 12 kept
    expect(codes('PWFIELD')).toEqual(Array(12).fill(0x2a));
    expect(codes('NAMEFIELD')).toEqual([0x47, 0x6f]);
  });
});
