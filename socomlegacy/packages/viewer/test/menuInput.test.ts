// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FsAssetSource } from '@s2u/archive/node';
import { MenuInput, STICK, UI_TICK_SECONDS, loadDialog, type DialogDesign, type ZAnimUiCommand } from '@s2u/ui';
import { ARMORY_MENU_KEYS_READING } from '../src/armory';
import { controlGroups, GROUP_MENUS, padControlGroups } from '../src/controlsList';
import { PAD_BUTTON } from '../src/gamepad';
import { FrontEndSession, mountFrontEnd, readFrontEndDisc, type FrontEndDisc } from '../src/frontEnd';
import { GamePad } from '../src/setupPad';
import { r, rec } from '../../ui/test/widgets/fixtures';
import {
  MENU_KEYS_READING, MENU_KEY_LATCH_READING, MENU_PAD_SLOTS, MENU_STICK_READING, MenuPageInput, attachMenuInput, framePoint, menuStick, padSnapshot,
} from '../src/menuInput';

/**
 * PLAT-11's page adapter (web research 116 §11-§12; the sprint 9 plan's owner default 1): the keys, the pad and the
 * taps as the PS2 pad `@s2u/ui`'s `MenuInput` reads, and the front end keeping them from the map viewer beneath it
 * (PLAT-10's review: with `?menuflow` the viewer boots underneath with its listeners live). jsdom; synthetic dialogs,
 * and the dev disc's `dlgOptions_Menu` when `SOCOM_DISC` / `SOCOM_PC_ROOT` is set.
 */

describe('MENU_KEYS_READING (the owner\'s default 1)', () => {
  it("is the ARMORY's map for every menu, and one key each for START, SELECT, L1, L2, R1, R2", () => {
    const armory: Record<string, string> = { up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', cross: 'CROSS', triangle: 'TRIANGLE', circle: 'CIRCLE', square: 'SQUARE' };
    for (const [code, a] of Object.entries(ARMORY_MENU_KEYS_READING)) expect([code, MENU_KEYS_READING[code]]).toEqual([code, armory[a]]);
    const rest = Object.entries(MENU_KEYS_READING).filter(([code]) => !(code in ARMORY_MENU_KEYS_READING));
    expect(Object.fromEntries(rest)).toEqual({ KeyP: 'START', KeyO: 'SELECT', PageUp: 'TRIGGER_L1', PageDown: 'TRIGGER_L2', KeyT: 'TRIGGER_R1', KeyY: 'TRIGGER_R2' });
    expect(MENU_KEYS_READING.Escape).toBeUndefined();
  });

  it('none of the added keys is one the walk takes (research 116 §12)', () => {
    const walk = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'KeyG', 'KeyF', 'Backquote', 'KeyR', 'KeyB', 'KeyC', 'KeyX', 'KeyQ', 'KeyE', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'KeyI', 'Tab', 'KeyM'];
    for (const code of ['KeyP', 'KeyO', 'PageUp', 'PageDown', 'KeyT', 'KeyY']) expect(walk).not.toContain(code);
  });
});

describe('the pad and the keys as the game\'s pad', () => {
  const pad = (pressed: number[], axes: number[] = [0, 0, 0, 0]) => ({
    axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
  });

  it('the W3C standard mapping by position; the left stick processed, then negated into the game\'s signs (MENU_STICK_READING)', () => {
    expect(MENU_STICK_READING).toContain('negated');
    const s = padSnapshot(pad([PAD_BUTTON.Cross, PAD_BUTTON.Up, PAD_BUTTON.L2, PAD_BUTTON.Start], [0.5, -0.8]));
    expect([...s.down].sort()).toEqual(['CROSS', 'START', 'TRIGGER_L2', 'UP']);
    // LATER 350: (0.5 - 0.3) / 0.7 x sqrt 2 = 0.404 right (negative x); (0.8 - 0.3) / 0.7 x sqrt 2 clamped: 1 up (positive y).
    expect(s.stickX).toBeCloseTo(-(0.2 / 0.7) * Math.SQRT2, 12);
    expect(s.stickY).toBe(1);
    expect(Object.keys(MENU_PAD_SLOTS).sort()).toEqual(Object.keys(PAD_BUTTON).sort());
    expect(padSnapshot(null).down.size).toBe(0);
  });

  // LATER 350 (MENU_STICK_READING, reading pending review): the menus read the pad's stick 0 after `FUN_002da930`'s steps
  // (D:L179566-179634): each axis zeroed inside `+0x288` (0.3), rescaled past it, the circle -- the move stick's
  // (`./moveStick`) -- so a resting stick's drift is no stick at all, and the 0.2 / 0.6 hysteresis is on the processed
  // value. CONTROLLER OPTIONS' DEAD ZONE writes `+0x288` for both sticks (research 104 §4): the menus' too.
  it('LATER 350: the menus\' stick through the pad\'s dead zone, rescale and circle; the live DEAD ZONE', () => {
    expect(padSnapshot(pad([], [0.25, -0.2]))).toMatchObject({ stickX: 0, stickY: 0 });     // a drift inside 0.3: none
    expect(menuStick(0.29, 0)).toEqual([0, 0]);
    // Back to 0.35 after a flick: (0.05 / 0.7) x sqrt 2 = 0.101, within the 0.2 that re-arms -- raw, 0.35 never re-armed.
    expect(Math.abs(menuStick(0.35, 0)[0])).toBeLessThan(0.2);
    // A push of 0.62 as processed: (0.32 / 0.7) x sqrt 2 = 0.646, past the 0.6 that fires.
    expect(-menuStick(0.62, 0)[0]).toBeCloseTo((0.32 / 0.7) * Math.SQRT2, 12);
    const live = new MenuPageInput(() => [pad([], [0.5, 0])], () => null, () => 0.1);
    expect(live.read().stickX).toBeCloseTo(-(0.4 / 0.9) * Math.SQRT2, 12);                  // DEAD ZONE 0.1
    expect(new MenuPageInput(() => [pad([], [0.5, 0])]).read().stickX).toBeCloseTo(-(0.2 / 0.7) * Math.SQRT2, 12);
    // The touch layer's virtual stick takes the same steps (the review's finding 2): a drag under 0.3 is no stick.
    expect(new MenuPageInput(() => [], () => pad([], [0.25, 0.1])).read()).toMatchObject({ stickX: 0, stickY: 0 });
  });

  it('MENU_KEY_LATCH_READING: a key down and up between two reads is read down once', () => {
    expect(MENU_KEY_LATCH_READING).toContain('once');
    const p = new MenuPageInput();
    p.keyDown('ArrowDown'); p.keyUp('ArrowDown');
    expect([...p.read().down]).toEqual(['DOWN']);
    expect([...p.read().down]).toEqual([]);
    p.keyDown('KeyX');
    expect([...p.read().down]).toEqual(['CROSS']);
    expect([...p.read().down]).toEqual(['CROSS']);                    // held
    p.release();
    expect([...p.read().down]).toEqual([]);
  });

  it('a client point to the 640 x 448 frame drawn object-fit: contain', () => {
    const rect = { left: 0, top: 0, width: 1280, height: 1000 };   // scale 2, 52 px bars top and bottom
    expect(framePoint(640, 500, rect)).toEqual({ x: 320, y: 224 });
    expect(framePoint(10, 20, rect)).toBeNull();                    // on the bar
  });
});

describe('while the front end has the screen, the keys and the pointer do not reach the viewer', () => {
  let canvas: HTMLCanvasElement;
  beforeEach(() => {
    canvas = document.createElement('canvas');
    document.body.append(canvas);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 640, height: 448, right: 640, bottom: 448, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
  });
  afterEach(() => { canvas.remove(); vi.restoreAllMocks(); });

  it('a key: the viewer\'s window and document listeners see none of it, Esc and chords pass; after the detach all pass', () => {
    const seen: string[] = [], unlock: string[] = [];
    const viewer = (e: KeyboardEvent) => { seen.push(`${e.type} ${e.code}`); };
    const gesture = (e: Event) => { unlock.push(e.type); };
    document.addEventListener('keydown', gesture, { capture: true });   // GameAudio.unlockOn(doc), registered first
    window.addEventListener('keydown', viewer);                      // the camera's, the walk's, ui.ts's
    window.addEventListener('keyup', viewer);
    document.addEventListener('keydown', viewer);
    const taps: [number, number][] = [];
    const page = new MenuPageInput();
    const detach = page.attach({ tap: (x, y) => { taps.push([x, y]); return null; } }, canvas, window);
    const key = (type: string, code: string, init: KeyboardEventInit = {}) => document.body.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...init }));
    key('keydown', 'KeyW'); key('keyup', 'KeyW'); key('keydown', 'KeyG'); key('keydown', 'Digit1');
    expect(seen).toEqual([]);
    expect(unlock).toEqual(['keydown', 'keydown', 'keydown']);          // the front end's own audio still unlocks
    expect([...page.read().down]).toEqual(['UP']);
    key('keydown', 'Escape'); key('keydown', 'KeyR', { ctrlKey: true });
    expect(seen).toEqual(['keydown Escape', 'keydown Escape', 'keydown KeyR', 'keydown KeyR']);
    seen.length = 0;
    detach();
    key('keydown', 'KeyW');
    expect(seen).toEqual(['keydown KeyW', 'keydown KeyW']);
    window.removeEventListener('keydown', viewer); window.removeEventListener('keyup', viewer); document.removeEventListener('keydown', viewer);
    document.removeEventListener('keydown', gesture, { capture: true });
  });

  it('the front end\'s audio unlock registered after the adapter (pageUiSounds, once the files are read) still sees the key', () => {
    const seen: string[] = [], unlock: string[] = [];
    const viewer = (e: KeyboardEvent) => { seen.push(e.type); };
    const gesture = (e: Event) => { unlock.push(e.type); };
    const detach = new MenuPageInput().attach({ tap: () => null }, canvas, window);
    document.addEventListener('keydown', gesture, { capture: true });
    document.addEventListener('keydown', viewer); window.addEventListener('keydown', viewer);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true, cancelable: true }));
    expect([unlock, seen]).toEqual([['keydown'], []]);
    detach();
    document.removeEventListener('keydown', gesture, { capture: true });
    document.removeEventListener('keydown', viewer); window.removeEventListener('keydown', viewer);
  });

  it('a key let go with Ctrl, Alt or Meta down is let go: no stuck DOWN (review round finding 1)', () => {
    const page = new MenuPageInput();
    const detach = page.attach({ tap: () => null }, canvas, window);
    const key = (type: string, code: string, init: KeyboardEventInit = {}) => document.body.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...init }));
    for (const mod of ['ctrlKey', 'altKey', 'metaKey'] as const) {
      key('keydown', 'ArrowDown');
      key('keydown', 'ControlLeft', { [mod]: true });
      key('keyup', 'ArrowDown', { [mod]: true });
      key('keyup', 'ControlLeft');
      expect([...page.read().down]).toEqual(['DOWN']);                // the latch: read down once
      expect([...page.read().down]).toEqual([]);                      // and let go
    }
    key('keydown', 'KeyS', { ctrlKey: true });                         // a chord's keydown is still the page's
    expect([...page.read().down]).toEqual([]);
    detach();
  });

  it('a pointer on the front end\'s canvas: a tap at its frame point, nothing bubbles to the page', () => {
    const seen: string[] = [], unlock: string[] = [];
    const viewer = (e: Event) => { seen.push(e.type); };
    const gesture = (e: Event) => { unlock.push(e.type); };
    for (const t of ['pointerdown', 'mousedown', 'wheel', 'contextmenu']) document.addEventListener(t, viewer);
    document.addEventListener('pointerdown', gesture, { capture: true });
    const taps: [number, number][] = [];
    const detach = new MenuPageInput().attach({ tap: (x, y) => { taps.push([x, y]); return null; } }, canvas, window);
    canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 150, clientY: 135, bubbles: true, cancelable: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    expect(seen).toEqual([]);
    expect(unlock).toEqual(['pointerdown']);                             // the capture-phase unlock sees the tap
    expect(taps).toEqual([[150, 135]]);
    detach();
    canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(seen).toEqual(['mousedown']);
    document.removeEventListener('pointerdown', gesture, { capture: true });
    for (const t of ['pointerdown', 'mousedown', 'wheel', 'contextmenu']) document.removeEventListener(t, viewer);
  });
});

/** The Controls popover's menu rows (`ControlMode` 'menu'). */
describe('the Controls popover\'s Menus group', () => {
  it('both tabs list the Menus group alone in menu mode; the walk and fly lists are unchanged', () => {
    for (const make of [controlGroups, padControlGroups]) {
      expect(make('menu', false).map((g) => g.name)).toEqual([GROUP_MENUS]);
      expect(make('walk', true).some((g) => g.name === GROUP_MENUS)).toBe(false);
    }
    const keys = controlGroups('menu', false)[0]!.rows.map((r) => `${r.keys} = ${r.does}`);
    expect(keys).toContain('Enter / X / Space = choose (Cross)');
    expect(keys).toContain('P = Start');
  });
});

// The session with a synthetic dialog (the screen's keys before CONTROLS, as on the disc): two buttons.
const twoButtons = (): DialogDesign => loadDialog([['SCREENS', r('FONT', 'font_t', 'CONTROLS', [
  rec('A', 'BUTTON', 100, 100, r('XSIZE', '100', 'YSIZE', '20')),
  rec('B', 'BUTTON', 100, 130, r('XSIZE', '100', 'YSIZE', '20')),
], 'OBJECTS', [])]]);
const cmd = (arg: string): ZAnimUiCommand =>
  ({ anim: 'x', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'SuspendMenuInput', arg, loc: 0, bytes: new Uint8Array(16) });

describe("the page connected to FrontEndSession (frontEnd.ts's lines)", () => {
  it("the session's MenuInput: the build focuses A, the keys move it, a tap steps to B; SuspendMenuInput is its host's row", () => {
    const disc: FrontEndDisc = { dialog: (n) => (n === 'dlgIntroScreen.rdr' ? twoButtons() : null), sets: [], faces: [], captions: null, loader: {}, missing: [] };
    const s = new FrontEndSession({ disc, loader: false });      // past the loader's screens (BOOT-04): dlgIntroScreen at once
    expect(s.input).toBeInstanceOf(MenuInput);
    const page = new MenuPageInput();
    s.input.source = page;
    let now = 0;
    const tick = (n = 1) => { for (let i = 0; i < n; i++) { now += UI_TICK_SECONDS * 1000; s.advance(now); } };
    s.advance(now);
    tick(3);
    expect(s.input.ring()!.focused!.name).toBe('A');
    page.keyDown('KeyS'); tick(); page.keyUp('KeyS'); tick();
    expect(s.input.ring()!.focused!.name).toBe('B');
    expect(s.input.tap(150, 105)).toBe('A');
    tick(2);
    expect(s.input.ring()!.focused!.name).toBe('A');
    s.host.dispatch(cmd('1.75'));
    expect(s.machine.menu.shell!.inputTimer).toBe(Math.fround(1.75));
  });
});

/**
 * AM-2 (research 340 §3; research 116 §7, R116.10): the front end's flick end to end, on the page's own chain --
 * `attachMenuInput`'s `GamePad` (the setup's profile at its default: the dead zone the identity, `calibrateStick`) under
 * `MenuPageInput` -- from a standard pad's raw W3C axes (x right, y down) to the focus of a built dialog's ring. The
 * three BUTTON controls bind nothing, so the default navigation moves the focus: DOWN or the stick flicked down the next,
 * UP or flicked up the previous; LEFT and RIGHT move nothing by default (`FUN_00368650` D:L264124-264241).
 */
describe('the front end\'s flick, end to end: the W3C axes to a focus step (AM-2, research 340 §3)', () => {
  const threeButtons = (): DialogDesign => loadDialog([['SCREENS', r('FONT', 'font_t', 'CONTROLS', [
    rec('A', 'BUTTON', 100, 100, r('XSIZE', '100', 'YSIZE', '20')),
    rec('B', 'BUTTON', 100, 130, r('XSIZE', '100', 'YSIZE', '20')),
    rec('C', 'BUTTON', 100, 160, r('XSIZE', '100', 'YSIZE', '20')),
  ], 'OBJECTS', [])]]);
  function session() {
    const disc: FrontEndDisc = { dialog: (n) => (n === 'dlgIntroScreen.rdr' ? threeButtons() : null), sets: [], faces: [], captions: null, loader: {}, missing: [] };
    const s = new FrontEndSession({ disc, loader: false });
    const raw = { id: 'pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    const nav = { getGamepads: () => [raw] };
    const pad = new GamePad({ wanted: 'auto', releaseCrouch: false });     // attachMenuInput's
    s.input.source = new MenuPageInput(() => { const p = pad.poll(nav); return p ? [p] : []; });
    let now = 0;
    const tick = (n = 1) => { for (let i = 0; i < n; i++) { now += UI_TICK_SECONDS * 1000; s.advance(now); } };
    /** The W3C left stick at (x, y) for `n` menu ticks. */
    const at = (x: number, y: number, n = 1) => { raw.axes = [x, y, 0, 0]; tick(n); };
    s.advance(now);
    tick(3);
    return { s, at, focus: () => s.input.ring()!.focused!.name, dir: () => s.input.stick.direction() };
  }

  it('a push to 0.7 steps once; held, it does not repeat; back within 0.2 it re-arms, and not before', () => {
    const t = session();
    expect(t.focus()).toBe('A');
    t.at(0, 0.7);                                       // down (W3C y +): the game's y -0.7, past 0.6 -- the next control
    expect(t.focus()).toBe('B');
    t.at(0, 0.7, 90);                                   // held 3 s: no repeat (R116.6, R116.10)
    expect(t.focus()).toBe('B');
    // LATER 350: the hysteresis is on the processed stick (`MENU_STICK_READING`): 0.42 is (0.12 / 0.7) x sqrt 2 = 0.242.
    t.at(0, 0.42); t.at(0, 0.7);                        // back to 0.42 only: still disarmed
    expect(t.focus()).toBe('B');
    t.at(0, 0.35); t.at(0, 0.7);                        // 0.35 is 0.101, within 0.2 for one tick: re-armed, a step
    expect(t.focus()).toBe('C');
    t.at(0, 0); t.at(0, 0.7);                           // the last control wraps to the first
    expect(t.focus()).toBe('A');
    t.at(0, 0); t.at(0, -0.7);                          // up: the previous, wrapping
    expect(t.focus()).toBe('C');
    t.at(0, 0); t.at(0, 0.55, 30);                      // not past 0.6: nothing
    expect(t.focus()).toBe('C');
  });

  it('the diagonals settle as §7\'s table says: down-right DOWN, up-right UP, up-left and down-left LEFT', () => {
    const t = session();
    const flick = (x: number, y: number): [string, number] => { t.at(x, y); const out: [string, number] = [t.focus(), t.dir()]; t.at(0, 0, 2); return out; };
    expect(flick(0.7, 0.7)).toEqual(['B', STICK.DOWN]);   // the game's (-0.7, -0.7): x == y < 0, DOWN -- the next
    expect(flick(0.7, -0.7)).toEqual(['A', STICK.UP]);    // (-0.7, 0.7): x == -y < 0, UP -- the previous
    expect(flick(-0.7, -0.7)).toEqual(['A', STICK.LEFT]); // (0.7, 0.7): x == y > 0, LEFT -- no move by default
    expect(flick(-0.7, 0.7)).toEqual(['A', STICK.LEFT]);  // (0.7, -0.7): x == -y > 0, LEFT
    expect(flick(-0.7, 0)).toEqual(['A', STICK.LEFT]);
    expect(flick(0.7, 0)).toEqual(['A', STICK.RIGHT]);
  });
});

// The dev disc (W6.R8): `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; skipped without one.
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '' && existsSync(join(DISC, 'RUN/UI/READERC.ZAR'));

/** A session on a disc dialog driven by the page's keys on the front end's own clock. */
async function onDisc(dialog: string) {
  const disc = await readFrontEndDisc(new FsAssetSource(DISC));
  const s = new FrontEndSession({ disc, startDialog: dialog });
  // A standard pad at rest beside the keys: its W3C left stick is `axes` (AM-2's flicks).
  const raw = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  const page = new MenuPageInput(() => [raw]);
  s.input.source = page;
  let now = 0;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { now += UI_TICK_SECONDS * 1000; s.advance(now); } };
  const tap = (code: string) => { page.keyDown(code); tick(); page.keyUp(code); tick(30); };
  const popupShown = () => { const g = s.machine.shell()!; return g.popups.shown(g.screen); };
  // The card's "New memory card ... detected. Would you like to load data?" popup comes up on these screens (and again
  // every few seconds: the card host is not PLAT-11's); CROSS answers it through PLAT-16's popup, step 1 of the dispatch.
  const answerPopups = () => { for (let j = 0; j < 5 && popupShown(); j++) tap('KeyX'); };
  s.advance(now);
  tick(60);
  /** The W3C left stick pushed to `y` (down positive) for one tick, then at rest as `tap` leaves a key. */
  const flick = (y: number) => { raw.axes = [0, y, 0, 0]; tick(); raw.axes = [0, 0, 0, 0]; tick(30); };
  return { s, page, raw, tick, tap, flick, popupShown, answerPopups, focus: () => s.input.ring()!.focused?.name ?? null };
}

describe.skipIf(!HAVE_DISC)("the dev disc: the focus walk on dlgOptions_Menu (research 116 §4.4) and dlgMenu's DOWN (R116.7)", () => {
  it('DOWN by the keyboard walks dlgOptions_Menu in file order and wraps (its buttons bind only CROSS; the HDD strip enabled here)', async () => {
    const t = await onDisc('dlgOptions_Menu.rdr');
    expect(t.s.input.ring()!.controls.map((c) => c.name)).toEqual(['AudioOpBtn', 'VideoOpBtn', 'ControlOpBtn', 'ControlPresetBtn', 'HDDOnOff', 'SaveAndLeaveBtn']);
    expect(t.focus()).toBe('AudioOpBtn');
    const walk: (string | null)[] = [];
    for (let i = 0; i < 7; i++) { t.answerPopups(); t.tap('ArrowDown'); walk.push(t.focus()); }
    expect(walk).toEqual(['VideoOpBtn', 'ControlOpBtn', 'ControlPresetBtn', 'HDDOnOff', 'SaveAndLeaveBtn', 'AudioOpBtn', 'VideoOpBtn']);
    t.answerPopups();
    t.tap('ArrowUp');
    expect(t.focus()).toBe('AudioOpBtn');
  }, 60_000);

  it('dlgMenu: DOWN held 2 s moves the roller once, on the press frame (OnMenuBtnDown, then SuspendMenuInput 0.15)', async () => {
    const t = await onDisc('dlgMenu.rdr');
    t.answerPopups();
    const changes: number[] = [];
    let last = t.focus();
    t.page.keyDown('ArrowDown');
    for (let k = 0; k < 60; k++) {
      t.tick();
      const f = t.focus();
      if (f !== last) { changes.push(k); last = f; }
    }
    t.page.keyUp('ArrowDown');
    expect(changes).toEqual([0]);
    expect(last).toBe('multiplayer_button');
  }, 60_000);

  // AM-2 (research 340 §3): the stick's flick is the press for the default navigation and for a FALLING binding.
  it('the stick flicked down and up walks dlgOptions_Menu as DOWN and UP do (the default navigation, R116.10)', async () => {
    const t = await onDisc('dlgOptions_Menu.rdr');
    expect(t.focus()).toBe('AudioOpBtn');
    const walk: (string | null)[] = [];
    for (let i = 0; i < 7; i++) { t.answerPopups(); t.flick(0.7); walk.push(t.focus()); }
    expect(walk).toEqual(['VideoOpBtn', 'ControlOpBtn', 'ControlPresetBtn', 'HDDOnOff', 'SaveAndLeaveBtn', 'AudioOpBtn', 'VideoOpBtn']);
    t.answerPopups();
    t.flick(-0.7);
    expect(t.focus()).toBe('AudioOpBtn');
  }, 60_000);

  it('dlgMenu: the stick held down 2 s moves the roller once, on the frame it passes 0.6 (OnMenuBtnDown is FALLING, R116.7)', async () => {
    const t = await onDisc('dlgMenu.rdr');
    t.answerPopups();
    const changes: number[] = [];
    let last = t.focus();
    t.raw.axes = [0, 0.7, 0, 0];
    for (let k = 0; k < 60; k++) {
      t.tick();
      const f = t.focus();
      if (f !== last) { changes.push(k); last = f; }
    }
    t.raw.axes = [0, 0, 0, 0];
    expect(changes).toEqual([0]);
    expect(last).toBe('multiplayer_button');
  }, 60_000);
});

describe('attachMenuInput: the page\'s source on the session\'s input', () => {
  it('connect sets the source (the keys before it forgotten), reads the window\'s pads; a tap before it is lost', () => {
    const input = new MenuInput({ machine: () => { throw new Error('unused'); }, parts: { current: null } as never });
    const tap = vi.spyOn(input, 'tap').mockReturnValue(null);
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 640, height: 448, right: 640, bottom: 448, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    const a = attachMenuInput(canvas, window);
    a.page.keyDown('KeyX');
    canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true, cancelable: true }));
    a.connect(input);
    expect(input.source).toBe(a.page);
    expect(input.source.read().down.size).toBe(0);
    expect(tap).not.toHaveBeenCalled();
    canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true, cancelable: true }));
    expect(tap).toHaveBeenCalledWith(10, 10);
    a.detach();
    vi.restoreAllMocks();
  });

  it("GM-12b: `also` takes a second canvas (#front-end-gpu): a tap on it lands on the same frame point, nothing bubbles; the detach lets both go", () => {
    const input = new MenuInput({ machine: () => { throw new Error('unused'); }, parts: { current: null } as never });
    const tap = vi.spyOn(input, 'tap').mockReturnValue(null);
    const box = { left: 20, top: 10, width: 1280, height: 896, right: 1300, bottom: 906, x: 20, y: 10, toJSON: () => ({}) } as DOMRect;
    const a2d = document.createElement('canvas'), gpu = document.createElement('canvas');
    document.body.append(a2d, gpu);
    vi.spyOn(a2d, 'getBoundingClientRect').mockReturnValue(box);
    vi.spyOn(gpu, 'getBoundingClientRect').mockReturnValue(box);
    const seen: string[] = [];
    const viewer = (e: Event) => { seen.push(e.type); };
    document.addEventListener('pointerdown', viewer);
    const a = attachMenuInput(a2d, window);
    a.connect(input);
    a.also(gpu);
    const at = { clientX: 20 + 300, clientY: 10 + 200, bubbles: true, cancelable: true };
    a2d.dispatchEvent(new MouseEvent('pointerdown', at));
    gpu.dispatchEvent(new MouseEvent('pointerdown', at));
    expect(tap.mock.calls).toEqual([[150, 100], [150, 100]]);           // the same frame point from either canvas
    expect(seen).toEqual([]);
    a.page.keyDown('KeyX');                                               // one source: the keys are not doubled
    expect([...input.source.read().down]).toEqual(['CROSS']);
    a.detach();
    gpu.dispatchEvent(new MouseEvent('pointerdown', at));
    expect(seen).toEqual(['pointerdown']);
    expect(tap).toHaveBeenCalledTimes(2);
    document.removeEventListener('pointerdown', viewer);
    a2d.remove(); gpu.remove();
    vi.restoreAllMocks();
  });

  it('mountFrontEnd keeps the keys and the pointer from the viewer from the moment its canvas is up (review round finding 2)', () => {
    const seen: string[] = [];
    const viewer = (e: Event) => { seen.push(`${e.type} ${(e as KeyboardEvent).code ?? ''}`.trim()); };
    window.addEventListener('keydown', viewer);
    document.addEventListener('keydown', viewer);
    document.addEventListener('pointerdown', viewer);
    const key = (code: string) => document.body.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
    const pending = { read: () => new Promise<Uint8Array>(() => {}), list: () => new Promise<string[]>(() => {}) };
    const audio = { setData: () => {} };
    // No served tree: the canvas is up with its line; reading: the disc never answers.
    for (const mount of [() => mountFrontEnd('?menuflow', null, document)!,
      () => mountFrontEnd('?menuflow', { kind: 'http', baseUrl: 'http://127.0.0.1:1/' } as never, document, { assets: pending as never, audio: audio as never })!]) {
      const m = mount();
      key('KeyW'); key('KeyG'); key('Digit1');
      m.canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
      expect(seen).toEqual([]);
      m.stop();
      key('KeyW');
      expect(seen).toEqual(['keydown KeyW', 'keydown KeyW']);
      seen.length = 0;
    }
    window.removeEventListener('keydown', viewer);
    document.removeEventListener('keydown', viewer);
    document.removeEventListener('pointerdown', viewer);
  });
});
