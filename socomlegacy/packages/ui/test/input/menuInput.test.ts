import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { UI_TICK_SECONDS } from '../../src/clock/index';
import type { DialogDesign } from '../../src/dialog';
import type { MovieService } from '../../src/movie/movieCommands';
import { UiCommandHost } from '../../src/uiCommands';
import type { ZAnimRtSet, ZAnimUiCommand } from '../../src/zanimRuntime';
import { DialogPartsHost } from '../../src/screens/dialogParts';
import { FrontEndMachine } from '../../src/screens/frontEndMachine';
import { PopupSlot } from '../../src/screens/popupSlot';
import { POPUP_BUTTON_SLOTS, POPUP_COMMAND_SIZE, POPUP_RECORD_AT, SlotPopup } from '../../src/popup/index';
import { ButtonWidget } from '../../src/widgets/button';
import { RadioStripWidget } from '../../src/widgets/radioStrip';
import { findNode, type UiNode } from '../../src/compositor/scene';
import { ListboxWidget } from '../../src/widgets/listbox';
import { LISTBOX_HOLD_REPEAT } from '../../src/widgets/listbox';
import { SLIDER_HOLD_REPEAT } from '../../src/widgets/slider';
import {
  MENU_TICK_RATE_READING, MENU_TOUCH_READING, MenuInput, SUSPEND_MENU_INPUT, atofF32, type PadSlotName,
} from '../../src/input/index';
import { ENABLED_AT_BUILD } from '../../src/widgets/widgetSet';
import { textFace } from '../text/fixtures';
import { loadDialog } from '../../src/index';
import { r, rec } from '../widgets/fixtures';
import { animation, sound, uiFn } from '../screens/zanimAsm';

/**
 * PLAT-11 connected to PLAT-10's front end (web research 116 §3-§6): the pad read at the menu state's tick step 2 and
 * flushed at its init, `FUN_00368650` as the dialog host's A1 input, the ring's load focus and `ActivateButton`,
 * `SuspendMenuInput` in PLAT-08's table, PLAT-15's widgets answering the record. Synthetic dialogs and animations on the
 * front end's own tick (PLAT-12's `UI_TICK_SECONDS`); nothing measured on the original running.
 */

const MARKS = ['goA', 'goB', 'goC', 'actA', 'actB', 'actC', 'back', 'down', 'pick'];
const NAMES = ['NA', 'SuspendMenuInput', 'ActivateButton', '0.15', 'B', ...MARKS.map((m) => `.${m}`), 'AreYouSure'];
const SETS: ZAnimRtSet[] = [{
  name: 't.rdr',
  anims: [
    ...MARKS.filter((m) => m !== 'down').map((m) => animation(m, NAMES, [], [sound(NAMES, `.${m}`)])),
    // dlgMenu's OnMenuBtnDown in miniature (research 116 §4.4): SuspendMenuInput(0.15), then the next button by name.
    animation('down', NAMES, [], [uiFn(NAMES, 'SuspendMenuInput', '0.15'), uiFn(NAMES, 'ActivateButton', 'B'), sound(NAMES, '.down')]),
  ],
}];

const button = (name: string, x: number, y: number, ...anims: RdrNode[][]) =>
  rec(name, 'BUTTON', x, y, r('XSIZE', '100', 'YSIZE', '20', 'ANIMATIONS', anims));
const abc = (...more: RdrNode[][]) => [
  button('A', 100, 100, r('BUTTON', 'CROSS', 'ANIMATION', 'goA'), r('EVENT', 'ONACTIVATE', 'ANIMATION', 'actA'), ...more),
  button('B', 100, 130, r('BUTTON', 'CROSS', 'ANIMATION', 'goB'), r('EVENT', 'ONACTIVATE', 'ANIMATION', 'actB')),
  button('C', 100, 160, r('BUTTON', 'CROSS', 'ANIMATION', 'goC'), r('EVENT', 'ONACTIVATE', 'ANIMATION', 'actC')),
];
// The screen's own keys before CONTROLS, as on the disc: the loader's lookups are depth-first (`RdrLookup`), so a screen
// ANIMATIONS after CONTROLS would be found inside the first control.
const screen = (controls: RdrNode[][], ...screenAnims: RdrNode[][]): DialogDesign =>
  loadDialog([['SCREENS', r('SCRIPT_LIBRARY', 't.rdr', 'ANIMATIONS', screenAnims, 'FONT', 'font_t', 'CONTROLS', controls, 'OBJECTS', [])]]);

const list = (items: number, ...more: (string | RdrNode)[]) => rec('L', 'LISTBOX', 100, 50, r(
  'FILENAME', 'list.tif', 'XSIZE', '200', 'YSIZE', '100', 'SPACING', '20', 'SCALE', '1',
  'OPTIONS', Array.from({ length: items }, (_, i) => r('CAPTION', [`i${i}`])),
  ...more,
));

/** The front end as the page connects it, without the page; `held` and `stick` are the physical pad. */
function rig(d: DialogDesign, hold: PadSlotName[] = []) {
  let m!: FrontEndMachine;
  const heard: string[] = [];
  const face = textFace();
  const parts = new DialogPartsHost({ popupObject: () => m.queue.popupObject, face: () => face, sound: (n) => heard.push(n) });
  const host = new UiCommandHost({ node: parts.nodeCommand, sound: (c) => heard.push(c.sound) });
  const input = new MenuInput({ machine: () => m, parts, selection: () => heard.push('SELECTION') });
  input.register(host);
  const held = new Set<PadSlotName>(hold);
  const stick = { x: 0, y: 0 };
  input.source = { read: () => ({ down: new Set(held), stickX: stick.x, stickY: stick.y }) };
  let dispatches = 0;
  const slot = new PopupSlot();
  slot.connect(parts.makePopup);
  const movie = {
    service: { background: { on: () => {}, off: () => {} }, play: () => {} } as unknown as MovieService,
    frame: () => 'menu' as const, unload: () => {}, load: () => input.built(),
  };
  m = new FrontEndMachine({
    dialog: (n) => (n === 'dlgTest.rdr' ? d : null), sets: SETS, host, popups: slot, startDialog: 'dlgTest.rdr',
    built: parts.built, draw: parts.draw, widgetsTick: parts.widgetsTick, setEnabled: parts.setEnabled,
    input: () => { dispatches++; input.dispatch(); }, pad: input.read, activate: input.activate, movie,
  });
  m.boot();
  const run = (n = 1, dt = UI_TICK_SECONDS): void => { for (let i = 0; i < n; i++) m.frame(dt); };
  const focus = (): string | null => input.ring()?.focused?.name ?? null;
  const press = (b: PadSlotName): void => { held.add(b); run(); held.delete(b); run(); };
  run(2);
  return { m, host, input, parts, heard, held, stick, run, focus, press, take: () => heard.splice(0), dispatches: () => dispatches };
}

describe('the menu input on the front end (FUN_00368650)', () => {
  it('at build: the first control focused and activated, its ONACTIVATE run (D:L263735-263745)', () => {
    const t = rig(screen(abc()));
    expect(t.focus()).toBe('A');
    expect((t.parts.current!.widgets.get('A') as ButtonWidget).look.state).toBe('ACTIVE');
    expect(t.take()).toContain('.actA');
  });

  it('DOWN with no binding moves to the next control (SELECTION, ONACTIVATE); held 2 s it moves once -- no framework repeat', () => {
    const t = rig(screen(abc()));
    t.take();
    t.held.add('DOWN');
    t.run(60);                                                     // 2 s at the UI tick
    expect(t.focus()).toBe('B');
    expect(t.take()).toEqual(['SELECTION', '.actB']);
    t.held.delete('DOWN');
    t.run();
    t.press('UP');
    expect(t.focus()).toBe('A');
    t.press('UP');
    expect(t.focus()).toBe('C');                                   // wraps
  });

  it('the focused control is asked before the screen: a CROSS bound on both runs only the button', () => {
    const t = rig(screen(abc(), r('BUTTON', 'CROSS', 'ANIMATION', 'back'), r('BUTTON', 'TRIANGLE', 'ANIMATION', 'back')));
    t.take();
    t.press('CROSS');
    expect(t.take()).toEqual(['.goA']);
    t.press('TRIANGLE');                                           // the button does not bind it: the screen's
    expect(t.take()).toEqual(['.back']);
  });

  it('a screen binding on DOWN takes the press: the default navigation does not run', () => {
    const t = rig(screen(abc(), r('BUTTON', 'DOWN', 'ANIMATION', 'back')));
    t.take();
    t.press('DOWN');
    expect([t.focus(), t.take()]).toEqual(['A', ['.back']]);
  });

  it('R116.16: a matching binding with no ANIMATION (or one no set defines) still takes the press -- the focus holds', () => {
    const t = rig(screen(abc(r('BUTTON', 'UP'), r('BUTTON', 'DOWN', 'ANIMATION', 'NONE'))));
    t.take();
    t.press('DOWN');
    t.press('UP');
    expect([t.focus(), t.take()]).toEqual(['A', []]);
  });

  it("the 12 TRIGGER bindings (button 0x10, no animation) never match: they compare 1 with pad +0x11, read 0", () => {
    const t = rig(screen(abc(), r('TRIGGER', 'L1', 'ANIMATION', 'back')));
    expect(t.parts.current!.dialog.design.bindings[0]).toMatchObject({ code: 0x10, state: 1, animation: null });
    t.take();
    t.press('DOWN');
    expect(t.focus()).toBe('B');
  });

  it('a disabled control is skipped (DisableButton, record 8); ActivateButton (record 6) moves the focus with SELECTION', () => {
    const t = rig(screen(abc()));
    t.m.queue.disableButton('B');
    t.run();
    t.take();
    t.press('DOWN');
    expect([t.focus(), t.take()]).toEqual(['C', ['SELECTION', '.actC']]);
    t.m.queue.activateButton('A');
    t.run(2);                                                      // A5 activates; ONACTIVATE's script runs at the next A3
    expect([t.focus(), t.take()]).toEqual(['A', ['SELECTION', '.actA']]);
  });

  it('the stick: a flick down is one step, held it does not repeat, past 0.2 and back it steps again (R116.10)', () => {
    const t = rig(screen(abc()));
    t.stick.y = -1;                                                // the game's signs: y positive up
    t.run(30);
    expect(t.focus()).toBe('B');
    t.stick.y = -0.1;
    t.run();
    t.stick.y = -1;
    t.run();
    expect(t.focus()).toBe('C');
  });

  it("dlgMenu's pattern (R116.7, R116.8): the button's DOWN suspends 0.15 s -- 5 dispatches skipped at the UI tick -- and a press inside is lost", () => {
    const d = screen([button('A', 100, 100, r('BUTTON', 'DOWN', 'ANIMATION', 'down')), button('B', 100, 130), button('C', 100, 160)]);
    const t = rig(d);
    t.held.add('DOWN');
    t.run();
    t.held.delete('DOWN');
    expect(t.m.menu.shell!.inputTimer).toBe(Math.fround(0.15));
    const before = t.dispatches();
    t.run(5);
    expect(t.dispatches()).toBe(before);                           // suspended: timer -= raw dt, no dispatch
    t.run();
    expect(t.dispatches()).toBe(before + 1);
    expect(t.focus()).toBe('B');                                   // ActivateButton B, through the queue
    // A press whose frames fall inside a suspension is never dispatched (R116.9).
    t.m.menu.shell!.suspendInput(0.15);
    t.held.add('DOWN'); t.run(); t.held.delete('DOWN'); t.run(); t.run(5);
    expect(t.focus()).toBe('B');
  });

  it('SuspendMenuInput through PLAT-08\'s table: atof to float, overwritten, 0 ends it; MS\'s G only', () => {
    const t = rig(screen(abc()));
    const cmd = (arg: string): ZAnimUiCommand => ({ anim: 'x', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn: SUSPEND_MENU_INPUT, arg, loc: 0, bytes: new Uint8Array(16) });
    t.host.dispatch(cmd('.3'));
    expect(t.m.menu.shell!.inputTimer).toBe(Math.fround(0.3));
    t.host.dispatch(cmd('60'));
    expect(t.m.menu.shell!.inputTimer).toBe(60);
    t.host.dispatch(cmd('0'));
    expect(t.m.menu.shell!.inputTimer).toBe(0);
    expect([atofF32('1.75x'), atofF32('word'), atofF32(' 2')]).toEqual([1.75, 0, 2]);
  });

  it("the pad is flushed at the menu state's init: a CROSS held through the boot is never a press", () => {
    const t = rig(screen(abc()), ['CROSS']);                       // held before the first frame, through MS's init
    t.run(5);
    expect(t.input.pad.state('CROSS')).toBe(2);
    expect(t.take()).not.toContain('.goA');
    t.held.delete('CROSS');
    t.run();
    t.press('CROSS');
    t.run();
    expect(t.take()).toContain('.goA');
  });

  it('a shown POPUP takes the pad first: DOWN does not move the focus', () => {
    const t = rig(screen(abc()));
    const shell = t.m.shell()!;
    shell.screen.popup!.visible = true;
    t.press('DOWN');
    expect([t.focus(), t.input.last]).toEqual(['A', 'popup']);
  });
});

describe('the held repeat is the widgets\', on the menu\'s tick (R116.6, §5.3)', () => {
  it('the delay: 0.4 s (LISTBOX_HOLD_REPEAT, SLIDER_HOLD_REPEAT); MENU_TICK_RATE_READING 30 Hz', () => {
    expect([LISTBOX_HOLD_REPEAT, SLIDER_HOLD_REPEAT, MENU_TICK_RATE_READING]).toEqual([0.4, 0.4, 30]);
  });

  // Research 116 §5.3's table, with the hold clock summed as the EE sums it (`fadd`, EE_FPU_ROUNDING_READING): at the
  // UI tick 12, at 1/30 13, at one NTSC field 24 -- and at exactly 1/60 25, not the table's 24 (the sum of 24 chopped
  // steps is 0.39999986, not past 0.4; the table multiplied 24 x f32(1/60) instead; section 16 of the note).
  for (const [dt, first] of [[UI_TICK_SECONDS, 12], [1 / 30, 13], [1001 / 60000, 24], [1 / 60, 25]] as const) {
    it(`a list held DOWN at dt ${dt.toFixed(6)}: the press steps, the first repeat on tick ${first}, then every tick`, () => {
      const t = rig(screen([list(40)]));
      const l = t.parts.current!.widgets.get('L') as ListboxWidget;
      expect(t.focus()).toBe('L');
      const steps: number[] = [];
      t.held.add('DOWN');
      for (let k = 0; k <= first + 3; k++) {
        const before = l.focus;
        t.run(1, dt);
        if (l.focus !== before) steps.push(k);
      }
      expect(steps).toEqual([0, first, first + 1, first + 2, first + 3]);
    });
  }

  it('PADHOG: at the last item a DOWN stays in the list; without it the press leaves the list (the default navigation)', () => {
    for (const [hog, expected] of [[true, 'L'], [false, 'B']] as const) {
      const t = rig(screen([list(2, ...(hog ? ['PADHOG', []] : [])), button('B', 100, 300)]));
      t.press('DOWN');                                             // to the last item
      t.press('DOWN');                                             // refused at the end
      expect(t.focus()).toBe(expected);
    }
  });

  it('NOSELECT gates only the highlight\'s draw (R116.11; D:L270014): the build focus and every DOWN step are the same', () => {
    const walk = (noSelect: boolean) => {
      const t = rig(screen([list(3, ...(noSelect ? ['NOSELECT', []] : [])), button('B', 100, 300)]));
      const l = t.parts.current!.widgets.get('L') as ListboxWidget;
      expect(l.noSelect).toBe(noSelect);
      const seen: [string | null, number][] = [[t.focus(), l.focus]];
      for (let i = 0; i < 4; i++) { t.press('DOWN'); seen.push([t.focus(), l.focus]); }
      return seen;
    };
    expect(walk(true)).toEqual(walk(false));
    expect(walk(true)).toEqual([['L', 0], ['L', 1], ['L', 2], ['B', 2], ['L', 2]]);
  });
});

describe('touch (MENU_TOUCH_READING) and the enabled bit a control is built with (research 116 §17)', () => {
  it('a tap on a control steps to it (SELECTION) and presses CROSS one frame; on the focused one CROSS alone', () => {
    expect(MENU_TOUCH_READING).toBe('step to the control, then CROSS one frame');
    const t = rig(screen(abc()));
    t.take();
    expect(t.input.tap(150, 135)).toBe('B');                       // B's body: (100, 130) 100 x 20
    t.run(2);
    expect([t.focus(), t.take()]).toEqual(['B', ['SELECTION', '.actB', '.goB']]);
    expect(t.input.tap(150, 138)).toBe('B');
    t.run(2);
    expect(t.take()).toEqual(['.goB']);
    expect(t.input.tap(5, 5)).toBeNull();                          // off every control: CROSS on the focused
    t.run(2);
    expect(t.take()).toEqual(['.goB']);
  });

  it('a tap on a disabled control is lost: no step, no SELECTION, no CROSS (the pad cannot focus it, FUN_003670d0)', () => {
    const t = rig(screen(abc(), r('BUTTON', 'CROSS', 'ANIMATION', 'back')));
    t.m.queue.disableButton('B');
    t.run();
    t.take();
    expect(t.input.tap(150, 135)).toBeNull();                      // B's body, B disabled
    t.run(2);
    expect([t.focus(), t.take()]).toEqual(['A', []]);
    expect((t.parts.current!.widgets.get('A') as ButtonWidget).look.state).toBe('ACTIVE');
  });

  // A strip of three boxes beside A, B and C (CONTROLLER OPTIONS' PRESETS in miniature): the merge controller's ruling of
  // 2026-10-23 (CTL-1, a browser adaptation) -- a click on a strip's box chooses that box; the pad's CROSS is untouched.
  const box = (name: string, x: number) => r('NAME', name, 'XPOS', String(x), 'YPOS', '0', 'TYPE', 'CHECKBOX', 'SPEC', r('CHILDOF', 'S', 'XSIZE', '50', 'YSIZE', '20'));
  const strip = () => rec('S', 'RADIOSTRIP', 100, 190, r('XSIZE', '100', 'YSIZE', '20', 'SUBORDINATES', [box('S0', 200), box('S1', 260), box('S2', 320)]));
  /** A frame point inside a node's 50 x 20 box (the node's place, as `controlAt` walks it). */
  const inside = (t: ReturnType<typeof rig>, name: string): [number, number] => {
    let x = 0, y = 0, a = 1, d = 1;
    const chain: UiNode[] = [];
    for (let n: UiNode | null = findNode(t.m.shell()!.screen.root, name); n; n = n.parent) chain.unshift(n);
    for (const n of chain) { x += a * n.x; y += d * n.y; a *= n.scale[0]; d *= n.scale[1]; }
    return [x + 25, y + 10];
  };
  const selection = (t: ReturnType<typeof rig>) => (t.parts.current!.widgets.get('S') as RadioStripWidget).selection;

  it('a click on a strip\'s box steps to the strip and chooses that box -- no CROSS after it; a click on the chosen box changes nothing', () => {
    const t = rig(screen([...abc(), strip()]));
    t.take();
    expect(selection(t)).toBe(0);
    expect(t.input.tap(...inside(t, 'S2'))).toBe('S');
    t.run(2);
    expect([t.focus(), selection(t)]).toEqual(['S', 2]);          // not 0: no CROSS stepped it on
    expect(t.take()).toContain('SELECTION');
    expect(t.input.tap(...inside(t, 'S1'))).toBe('S');            // focused already: the box alone
    t.run(2);
    expect(selection(t)).toBe(1);
    t.take();
    t.input.tap(...inside(t, 'S1'));
    t.run(2);
    expect([selection(t), t.take()]).toEqual([1, []]);
    t.press('CROSS');                                              // the pad's CROSS: one box on, the original's (FUN_00370f60)
    expect(selection(t)).toBe(2);
    expect(t.input.tap(...inside(t, 'S'))).toBe('S');              // the strip's own body: CROSS, as before (2 on to 0)
    t.run(2);
    expect(selection(t)).toBe(0);
  });

  it('a click on a box of a disabled strip is lost', () => {
    const t = rig(screen([...abc(), strip()]));
    t.m.queue.disableButton('S');
    t.run();
    t.take();
    expect(t.input.tap(...inside(t, 'S2'))).toBeNull();
    t.run(2);
    expect([t.focus(), selection(t), t.take()]).toEqual(['A', 0, []]);
  });

  const image = (name: string) => rec(name, 'IMAGE', 0, 0, r('FILENAME', 'x.tif', 'XSIZE', '10', 'YSIZE', '10'));
  const bits = (t: ReturnType<typeof rig>): [string, boolean][] => t.input.ring()!.controls.map((c) => [c.name, c.enabled()]);

  it('an IMAGE in CONTROLS is on the ring, built disabled: the build focuses the first enabled control and the walk passes it', () => {
    // The plain bitmap's constructor clears +0x14 bit 7 through its own +0x4c (FUN_0020cd50 D:L65834-65853; the IMAGE
    // record's create FUN_00382ff0 D:L278176); the build finds index 0 not enabled and steps on (D:L263735-263745).
    const t = rig(screen([image('I'), ...abc()]));
    expect(bits(t)).toEqual([['I', false], ['A', true], ['B', true], ['C', true]]);
    expect(t.focus()).toBe('A');
    expect((t.parts.current!.widgets.get('A') as ButtonWidget).look.state).toBe('ACTIVE');
    expect(t.take()).toEqual(['.actA']);                           // the build's step makes no SELECTION (FUN_003670d0(G, 0))
    t.press('UP');                                                 // A, I (passed), C: one SELECTION, the index moved
    expect([t.focus(), t.take()]).toEqual(['C', ['SELECTION', '.actC']]);
    t.press('DOWN');                                               // C, I (passed), A
    expect([t.focus(), t.take()]).toEqual(['A', ['SELECTION', '.actA']]);
  });

  it('EnableButton reaches any class (records 7 / 8: the element\'s +0x4c, 0x1fde10): an enabled IMAGE is a stop that lights nothing and takes no pad', () => {
    const t = rig(screen([image('I'), ...abc()], r('BUTTON', 'CROSS', 'ANIMATION', 'back')));
    t.m.queue.enableButton('I');
    t.run();
    t.take();
    expect(bits(t)[0]).toEqual(['I', true]);
    t.press('UP');                                                 // A to I: its activate is the base's (0x1fe290), nothing lit
    expect([t.focus(), t.take()]).toEqual(['I', ['SELECTION']]);
    expect((t.parts.current!.widgets.get('A') as ButtonWidget).look.state).toBe('NORMAL');
    t.press('CROSS');                                              // its +0x44 is the base's (0x1fe260): the screen's binding runs
    expect(t.take()).toEqual(['.back']);
    t.m.queue.disableButton('I');
    t.run();
    t.press('DOWN');
    expect(t.focus()).toBe('A');
    t.press('UP');
    expect(t.focus()).toBe('C');                                   // passed over again
  });

  it('the bit each class is built with: the text family, IMAGE and PROGRESSBAR 0; the button family, LISTBOX, MAPCONTROL and SCROLLINGTEXT 1', () => {
    expect(ENABLED_AT_BUILD).toEqual({
      IMAGE: false, PROGRESSBAR: false,                                                       // FUN_0020cd50 (D:L278176, D:L275672)
      TEXT: false, SECURETEXT: false, TELETYPE: false, WRAPPEDTEXT: false, COUNTER: false, CLOCK: false,   // FUN_003792f0 D:L273066
      LISTBOX: true,                                                                          // FUN_0037e8b0 D:L275854
      BUTTON: true, HANDLERBUTTON: true, SLIDERBAR: true, CHECKBOX: true, RADIOSTRIP: true,   // FUN_00377800 -> FUN_00365100
      MAPCONTROL: true, SCROLLINGTEXT: true,                                                  // FUN_0036d850; FUN_0027f250, set-up 0x370340 `jr ra`
    });
    const wrapped = (name: string, type: string) => rec(name, type, 0, 0, r('CAPTION', 'x', 'WIDTH', '50', 'SPACING', '10', 'HEIGHT', '30'));
    const t = rig(screen([
      image('image'),
      rec('text', 'TEXT', 0, 0, r('CAPTION', 'x')),
      rec('secure', 'SECURETEXT', 0, 0, r('CAPTION', 'x')),
      rec('tty', 'TELETYPE', 0, 0, r('CAPTION', 'x')),
      wrapped('wrapped', 'WRAPPEDTEXT'),
      rec('counter', 'COUNTER', 0, 0, r('StartTime', '1', 'ValVar', 'Won', 'Duration', '2')),
      rec('clock', 'CLOCK', 0, 0, r('CAPTION', 'x')),
      rec('bar', 'PROGRESSBAR', 0, 0, r('FILENAME', 'x.tif', 'XSIZE', '10', 'YSIZE', '2')),
      rec('map', 'MAPCONTROL', 0, 0, r('UPPERLEFT', ['0', '0'], 'LOWERRIGHT', ['1', '1'])),
      wrapped('scrolling', 'SCROLLINGTEXT'),
      list(2),
      ...abc(),
    ]));
    expect(bits(t)).toEqual([
      ['image', false], ['text', false], ['secure', false], ['tty', false], ['wrapped', false], ['counter', false], ['clock', false], ['bar', false],
      ['map', true], ['scrolling', true], ['L', true], ['A', true], ['B', true], ['C', true],
    ]);
    expect(t.focus()).toBe('map');                                 // the first enabled control of the file order
  });

  // A click on a shown popup's button answers that button (research 116 §11, a browser adaptation; the player's report
  // of 2026-11-02: the card's AskToOverwrite, NO first and focused, re-prompted when YES was clicked).
  /** A two-button POPUP record (research 118 §2) on the animation `goA`, its valve `AreYouSure`: slot k at `at[k]`, 50 x 25. */
  const popupRecord = (at: [[number, number], [number, number]], centred = false): ZAnimUiCommand => {
    const bytes = new Uint8Array(POPUP_COMMAND_SIZE);
    const dv = new DataView(bytes.buffer);
    const o0 = POPUP_RECORD_AT;
    bytes[4] = 1;
    dv.setInt32(o0 + 8, 150, true); dv.setInt32(o0 + 12, 180, true);            // the panel at (150, 180), 340 x 130
    dv.setInt32(o0 + 16, 130, true); dv.setInt32(o0 + 20, 340, true);
    dv.setFloat32(o0 + 32, 1, true);
    bytes[o0 + 66] = 1; bytes[o0 + 67] = NAMES.indexOf('AreYouSure');
    POPUP_BUTTON_SLOTS.forEach((b, k) => {
      const o = o0 + b;
      dv.setInt32(o + 4, at[k]![0], true); dv.setInt32(o + 8, at[k]![1], true); dv.setInt32(o + 12, 50, true); dv.setInt32(o + 16, 25, true);
      bytes[o + 20] = 255;
      bytes[o + 68] = centred ? 1 : 0;                                          // HCENTERED (D:L267003)
      dv.setFloat32(o + 72, 1, true);
    });
    return { anim: 'goA', sequence: 'NA', nodeIndex: 1, node: 'POPUP', opcodeByte: 0, fn: null, arg: 'NA', loc: 0, bytes };
  };
  /** AskToOverwrite's layout (popup #857, research 118 rows 268-269): NO (246) button 1 at 225, YES (253) button 2 at 65. */
  const NO_FIRST: [[number, number], [number, number]] = [[225, 90], [65, 90]];
  /** save_and_leave's (#831): YES (253) button 1 at 65, NO (246) button 2 at 225. */
  const YES_FIRST: [[number, number], [number, number]] = [[65, 90], [225, 90]];
  /** The popup shown with a record, as PopUpDialog then the POPUP node's command leave it; answers the valve's value. */
  const popUp = (t: ReturnType<typeof rig>, at: [[number, number], [number, number]], centred = false) => {
    const shell = t.m.shell()!;
    const p = t.m.queue.popupObject as SlotPopup;
    expect(p).toBeInstanceOf(SlotPopup);
    p.command(popupRecord(at, centred));
    shell.popups.show(shell.screen);
    t.run();
    t.take();
    return { popup: p.popup, answer: () => t.parts.current!.dialog.valves.find('AreYouSure')?.value };
  };
  // Frame points: the panel at (150, 180); a slot at (225, 90) is x 375-424, y 270-294; at (65, 90), x 215-264.
  const AT_225: [number, number] = [400, 280], AT_65: [number, number] = [240, 280];

  it("a click on a NO-first popup's second button steps the focus as LEFT / RIGHT does, then CROSS answers 2", () => {
    const t = rig(screen(abc()));
    const q = popUp(t, NO_FIRST);
    expect(q.popup.answer).toBe(1);
    expect(t.input.tap(...AT_65)).toBeNull();                      // YES: button 2's body
    t.run(2);
    expect([q.answer(), q.popup.visible, t.focus()]).toEqual([2, false, 'A']);
    expect(t.take().filter((s) => s === 'SELECTION')).toEqual(['SELECTION', 'SELECTION']);   // the step's, then CROSS's
  });

  it('a click on the focused button, or off both, is CROSS alone: the focused answer (1)', () => {
    const t = rig(screen(abc()));
    let q = popUp(t, NO_FIRST);
    t.input.tap(...AT_225);                                        // NO: button 1, focused
    t.run(2);
    expect([q.answer(), q.popup.visible]).toEqual([1, false]);
    expect(t.take().filter((s) => s === 'SELECTION')).toEqual(['SELECTION']);
    q = popUp(t, NO_FIRST);
    t.input.tap(5, 5);                                             // off both buttons: CROSS on the focus, as before
    t.run(2);
    expect([q.answer(), q.popup.visible]).toEqual([1, false]);
  });

  it("a YES-first popup: a click on each button gives that button's slot", () => {
    const t = rig(screen(abc()));
    let q = popUp(t, YES_FIRST);
    t.input.tap(...AT_65);                                         // YES: button 1
    t.run(2);
    expect(q.answer()).toBe(1);
    q = popUp(t, YES_FIRST);
    t.input.tap(...AT_225);                                        // NO: button 2
    t.run(2);
    expect(q.answer()).toBe(2);
  });

  // Review F2: the tap end to end with centred buttons and the POPUP node under a parent moved off the origin. The
  // expected bodies are worked here by hand, not read from buttonRects: the pen is the parent's (60, 40) plus the
  // node's (150, 180) plus the slot's; a centred 50-wide body spans pen - 25 to pen + 25 (-(w >> 1) to (int)(XSIZE / 2),
  // FUN_0037c220 D:L274561-274576), 25 down.
  const OFFSET: [number, number] = [60, 40];
  const centredOn = (slotX: number): { left: number; inside: [number, number] } => {
    const pen = OFFSET[0] + 150 + slotX, top = OFFSET[1] + 180 + 90;
    return { left: pen - 25, inside: [pen - 24, top + 20] };   // missed if the centring or the offset were dropped
  };
  const offsetRig = () => {
    const t = rig(screen(abc()));
    const shell = t.m.shell()!;
    expect(shell.screen.popup!.parent).toBe(shell.screen.foreplane);
    shell.screen.foreplane.x = OFFSET[0]; shell.screen.foreplane.y = OFFSET[1];
    return t;
  };

  for (const [order, at] of [['NO-first (246, 253)', NO_FIRST], ['YES-first (253, 246)', YES_FIRST]] as const) {
    it(`centred buttons under an offset parent, ${order}: a click on each body answers its slot; just left of one, the focus`, () => {
      const t = offsetRig();
      const b1 = centredOn(at[0][0]), b2 = centredOn(at[1][0]);
      let q = popUp(t, at, true);
      t.input.tap(...b2.inside);                                   // button 2's body, near its left edge
      t.run(2);
      expect([q.answer(), q.popup.visible]).toEqual([2, false]);
      q = popUp(t, at, true);
      t.input.tap(...b1.inside);                                   // button 1's body
      t.run(2);
      expect([q.answer(), q.popup.visible]).toEqual([1, false]);
      q = popUp(t, at, true);
      t.input.tap(b2.left - 1, b2.inside[1]);                      // one pixel left of button 2: off both, CROSS on the focus
      t.run(2);
      expect([q.answer(), q.popup.visible]).toEqual([1, false]);
      q = popUp(t, at, true);
      t.input.tap(b1.left - 1, b1.inside[1]);                      // one pixel left of button 1: the same
      t.run(2);
      expect([q.answer(), q.popup.visible]).toEqual([1, false]);
    });
  }

  it('a ring with no enabled control rests on index 0 with nothing active (dlgNetConnect: one TEXT)', () => {
    const t = rig(screen([rec('ConnectAnim', 'TEXT', 0, 0, r('CAPTION', 'x'))], r('BUTTON', 'CROSS', 'ANIMATION', 'back')));
    expect([t.focus(), bits(t)]).toEqual(['ConnectAnim', [['ConnectAnim', false]]]);
    t.press('DOWN');
    expect(t.focus()).toBe('ConnectAnim');
    t.press('CROSS');                                              // nothing focused takes it: the screen's binding
    expect(t.take()).toEqual(['.back']);
  });
});
