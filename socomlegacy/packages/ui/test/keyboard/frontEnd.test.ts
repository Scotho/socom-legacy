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
import { findNode, loadDialog, setUiVarDisplayMask, UiVarManager } from '../../src/index';
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

function rig(uiVars?: UiVarManager, design: DialogDesign = DESIGN) {
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
  const menuKeys: number[] = [];                                                    // the dispatch's step 6 queue (FUN_002dbd90)
  input.source = { read: () => ({ down: new Set(held), stickX: 0, stickY: 0 }), usbKey: () => menuKeys.shift() ?? null };
  const slot = new PopupSlot();
  slot.connect(parts.makePopup);
  const movie = {
    service: { background: { on: () => {}, off: () => {} }, play: () => {} } as unknown as MovieService,
    frame: () => 'menu' as const, unload: () => {}, load: () => input.built(),
  };
  m = new FrontEndMachine({
    dialog: (n) => (n === 'dlgTest.rdr' ? design : null), sets: SETS, host, popups: slot, startDialog: 'dlgTest.rdr',
    built: parts.built, draw: skb.drawOver(parts.draw), widgetsTick: parts.widgetsTick, setEnabled: parts.setEnabled,
    focusTick: skb.tick, input: input.dispatch, pad: input.read, activate: input.activate, movie,
  });
  m.boot();
  let last: ReturnType<FrontEndMachine['frame']> = [];
  const run = (n = 1): void => { for (let i = 0; i < n; i++) last = m.frame(UI_TICK_SECONDS); };
  const press = (b: PadSlotName): void => { held.add(b); run(); held.delete(b); run(); };
  run(2);
  return { m, skb, input, parts, heard, queue, menuKeys, run, press, take: () => heard.splice(0), items: () => last };
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

/**
 * WM-ENTER-CHAT (the page's `ENTER_OPENS_CHAT_ADAPTATION`, `packages/viewer/src/softKeyboardKeys.ts`): the page asks the
 * front end's keyboard whether the screen showing has an EVENT binding of `USBKBD_ENTER` (0x2c) -- the game lobby's and
 * the briefing rooms' on the disc (web research 119) -- and a USB Enter popped at the dispatch's step 6 fires it
 * (`FUN_00368650`, D:L264243-264246), whose animation opens the keyboard. Synthetic dialogs.
 */
const CHAT_DESIGN: DialogDesign = loadDialog([['SCREENS', r('SCRIPT_LIBRARY', 't.rdr',
  'ANIMATIONS', [r('EVENT', 'USBKBD_ENTER', 'ANIMATION', 'name'), r('EVENT', 'ON_SKB_APPLY', 'ANIMATION', 'applied')],
  'FONT', 'font_t',
  'CONTROLS', [button('A', 100, r('BUTTON', 'SQUARE', 'ANIMATION', 'pw'))])]]);
/** A screen that names `USBKBD_ENTER` only as a BUTTON's word would be no binding of the event: here, none at all. */
const NO_CHAT_DESIGN: DialogDesign = loadDialog([['SCREENS', r('SCRIPT_LIBRARY', 't.rdr',
  'ANIMATIONS', [r('EVENT', 'ON_SKB_APPLY', 'ANIMATION', 'applied'), r('BUTTON', 'TRIGGER_R1', 'ANIMATION', 'name')],
  'FONT', 'font_t',
  'CONTROLS', [button('A', 100, r('BUTTON', 'SQUARE', 'ANIMATION', 'pw'))])]]);

describe("SoftKeyboardFrontEnd.usbKbdEnterScreen: the screen showing, when it has a USBKBD_ENTER binding", () => {
  it("answers the showing screen's design on a screen with an EVENT binding of USBKBD_ENTER (0x2c), the same one each time; null on one without, null with no screen", () => {
    const chat = rig(undefined, CHAT_DESIGN).skb;
    expect(chat.usbKbdEnterScreen()).not.toBeNull();
    expect(chat.usbKbdEnterScreen()).toBe(chat.usbKbdEnterScreen());
    expect(rig(undefined, NO_CHAT_DESIGN).skb.usbKbdEnterScreen()).toBeNull();
    expect(rig(undefined, DESIGN).skb.usbKbdEnterScreen()).toBeNull();
    const none = new SoftKeyboardFrontEnd({ machine: () => ({ shell: () => null }) as unknown as FrontEndMachine, parts: {} as DialogPartsHost });
    expect(none.usbKbdEnterScreen()).toBeNull();
  });

  it("a USB Enter (0x28 or 0x58) popped at step 6 fires the binding, which opens the keyboard; another key does not", () => {
    for (const hid of [0x28, 0x58]) {
      const t = rig(undefined, CHAT_DESIGN);
      t.take();
      t.menuKeys.push(0x29);                                                          // Escape: step 6 tests only the two Enters
      t.run();
      expect(t.skb.keyboard.isOpen).toBe(false);
      t.menuKeys.push(hid);
      t.run();
      expect([hid, t.take(), t.skb.keyboard.isOpen]).toEqual([hid, ['skb0', '.name'], true]);
      expect(t.menuKeys).toEqual([]);
    }
  });

  it("on a screen with no USBKBD_ENTER binding a popped Enter does nothing", () => {
    const t = rig(undefined, NO_CHAT_DESIGN);
    t.take();
    t.menuKeys.push(0x28);
    t.run();
    expect([t.take(), t.skb.keyboard.isOpen]).toEqual([[], false]);
  });
});

/**
 * STREAMER-P1 (OT.R152; a browser adaptation, `../../src/text/displayMask`): a variable the page names is drawn as a
 * SECURETEXT draws its own -- in the TEXT that prints it and in the keyboard's typed lines -- its value unchanged.
 */
describe('STREAMER-P1: the page\'s display mask over a UI variable', () => {
  const typeName = (t: ReturnType<typeof rig>, hids: number[]): void => {
    t.press('CROSS');                                                                // A: PLAYERNAMEVAR
    t.run(8);
    for (const hid of hids) t.queue.push({ hid, shift: false, capsLamp: false });
    t.run();
  };
  const userGlyphs = (t: ReturnType<typeof rig>) => JSON.stringify(t.skb.keyboard.shownLines);

  it('unset: the TEXT prints the value as before', () => {
    setUiVarDisplayMask(null);
    const vars = new UiVarManager();
    const t = rig(vars);
    typeName(t, [0x0a, 0x12]);                                                       // "go"
    t.press('CIRCLE');
    t.run(8);
    const c = findNode(t.m.shell()!.screen.root, 'NAMEFIELD')?.content;
    expect(c?.kind === 'text' ? c.text.codes : null).toEqual([0x67, 0x6f]);
  });

  it('named: the TEXT draws one * a character and the keyboard draws its typed line masked; the value is the typed text', () => {
    setUiVarDisplayMask((n) => n === 'PLAYERNAMEVAR');
    try {
      const vars = new UiVarManager();
      const a = rig(vars);
      typeName(a, [0x0a, 0x12]);                                                     // "go"
      const go = userGlyphs(a);
      const b = rig(new UiVarManager());
      typeName(b, [0x0b, 0x0c]);                                                     // "hi": the same two stars
      expect(userGlyphs(b)).toBe(go);
      expect(a.skb.keyboard.shownLines).toEqual([[0x2a, 0x2a], []]);
      expect(a.skb.keyboard.text).toBe('go');                                         // what is typed is kept as typed
      a.press('CIRCLE');
      a.run(8);
      expect(vars.find('PLAYERNAMEVAR')?.value).toEqual({ type: 'string', value: 'go' });
      const c = findNode(a.m.shell()!.screen.root, 'NAMEFIELD')?.content;
      expect(c?.kind === 'text' ? c.text.codes : null).toEqual([0x2a, 0x2a]);
      setUiVarDisplayMask(null);
      const u1 = rig(new UiVarManager()); typeName(u1, [0x0a, 0x12]);
      const u2 = rig(new UiVarManager()); typeName(u2, [0x0b, 0x0c]);
      expect(userGlyphs(u1)).not.toBe(userGlyphs(u2));                               // unmasked, the two lines differ
    } finally { setUiVarDisplayMask(null); }
  });
});
