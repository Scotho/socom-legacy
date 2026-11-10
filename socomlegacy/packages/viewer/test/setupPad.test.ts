// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crossTaken, GamePad, PAD_SELECTION_KEY, takeCrossPress } from '../src/setupPad';
import { padInput } from '../src/gamepad';
import { attachMenuInput } from '../src/menuInput';
import { defaultController, SETUP_KEY, setControllerStanceMode } from '../src/startupSettings';
import { calibrateStick, padKey, resolveConflict } from '../src/controllerInput';
import { PAD_DEAD_ZONE } from '../src/gamepad';

/**
 * The owner, 2026-10-04: "also please make sure the game retains controller and mic settings as the setup implies". The
 * setup page's controller choices -- the device ("Automatic selection" or one pad), the bindings, the dead zone, the
 * crouch shortcut (`src/controllerSetup.ts`, saved per device profile by `src/controllerInput.ts`) -- are what the game
 * reads: the menus' pad (`src/menuInput.ts` `attachMenuInput`) and the match's (`src/main.ts` `padFrame`), both through
 * `GamePad`. Nothing customised, the original's layout as before. A browser adaptation.
 */
type Btn = { pressed: boolean; value: number };
interface Pad { index: number; id: string; mapping: string; connected: boolean; axes: number[]; buttons: Btn[] }
const pad = (index: number, id = `Pad ${index}`): Pad => ({ index, id, mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });
const press = (p: Pad, ...buttons: number[]): void => { p.buttons.forEach((b, i) => { b.pressed = buttons.includes(i); b.value = b.pressed ? 1 : 0; }); };
const source = (pads: Pad[]) => ({ getGamepads: () => pads });
/** The profile key `ControllerInput` saves a pad's config under. */
const profile = (p: Pad): string => `${SETUP_KEY}.pad.${JSON.stringify([p.id, p.mapping, p.buttons.length, p.axes.length])}`;
const save = (p: Pad, config: { bindings?: number[]; deadZone?: number; crouch?: number; prone?: number }): void => {
  localStorage.setItem(profile(p), JSON.stringify({ version: 1, bindings: Array.from({ length: 16 }, (_, i) => i), deadZone: 0.15, crouch: -1, ...config }));
};
const swapCrossCircle = (): number[] => { const b = Array.from({ length: 16 }, (_, i) => i); b[0] = 1; b[1] = 0; return b; };

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

describe('GamePad: the setup page\'s controller settings, read by the game', () => {
  it('nothing customised: the original layout -- Square jumps, as the match maps it', () => {
    const p = pad(0); const g = new GamePad(); const src = source([p]);
    g.poll(src);                                                     // neutral first (a held button is not read)
    press(p, 2);
    expect(padInput(g.poll(src)).jump).toBe(true);
  });
  it('a custom binding changes what a press does in the match', () => {
    const p = pad(0); const b = Array.from({ length: 16 }, (_, i) => i); b[2] = 0; b[0] = 2;   // Square's action on Cross
    save(p, { bindings: b });
    const g = new GamePad(); const src = source([p]);
    g.poll(src);
    press(p, 0);
    expect(padInput(g.poll(src)).jump).toBe(true);
    press(p, 2);
    expect(padInput(g.poll(src)).jump).toBe(false);
  });
  it('the dead zone filters stick noise', () => {
    const p = pad(0); save(p, { deadZone: 0.3 });
    const g = new GamePad(); const src = source([p]);
    g.poll(src);
    p.axes[0] = 0.25;
    expect(padInput(g.poll(src)).moveX).toBe(0);
    p.axes[0] = 0.9;
    expect(padInput(g.poll(src)).moveX).toBeGreaterThan(0);
  });
  // STM-1 (STM.R1a): the Crouch and Prone binds are read, and their buttons taken, in SEPARATE only (`stanceModes.test.ts`).
  it('the crouch shortcut', () => {
    setControllerStanceMode('separate');
    const p = pad(0); save(p, { crouch: 10 });
    const g = new GamePad(); const src = source([p]);
    g.poll(src);
    press(p, 10);
    g.poll(src);
    expect(g.crouch).toBe(true);
  });
  // PP-5 (OT.R67): the Prone bind is read and masked as the Crouch one is.
  it('the Prone bind: held, and its button taken from the pad in the match, kept in the menus', () => {
    setControllerStanceMode('separate');                   // STM.R1a: SEPARATE's
    const p = pad(0); save(p, { crouch: 10, prone: 11 });
    const match = new GamePad(); const menus = new GamePad({ releaseCrouch: false }); const src = source([p]);
    match.poll(src); menus.poll(src);
    press(p, 11);
    expect(match.poll(src)!.buttons[11]!.pressed).toBe(false);
    expect(match.prone).toBe(true);
    expect(match.crouch).toBe(false);
    expect(menus.poll(src)!.buttons[11]!.pressed).toBe(true);
    press(p);
    match.poll(src);
    expect(match.prone).toBe(false);
  });
  it('the chosen device is the one polled; gone, the automatic choice', () => {
    const a = pad(0, 'Pad A'), b = pad(1, 'Pad B');
    localStorage.setItem(PAD_SELECTION_KEY, '1:Pad B');
    const g = new GamePad(); let src = source([a, b]);
    g.poll(src);
    press(a, 2);
    expect(padInput(g.poll(src)).jump).toBe(false);                 // pad A is not the chosen one
    press(a); press(b, 2);
    expect(padInput(g.poll(src)).jump).toBe(true);
    src = source([a]);
    press(b); g.poll(src); press(a, 2);
    expect(padInput(g.poll(src)).jump).toBe(true);
  });
  it('a button held when the game first reads the pad is not read until released (no stale START)', () => {
    const p = pad(0); const g = new GamePad(); const src = source([p]);
    press(p, 9);
    expect(g.poll(src)).toBeNull();
    press(p); g.poll(src); press(p, 9);
    expect(g.poll(src)!.buttons[9]!.pressed).toBe(true);
  });
  it("the match reads a pad as it is from the first frame (its state start flushes instead: research 116 R116.13, `./padFlush`); the rest-wait is the menus' (the setup page's START)", () => {
    const p = pad(0); p.axes = [0, -1, 0, 0]; press(p, 2);           // connected with the stick pushed and Square held
    const src = source([p]);
    const match = new GamePad({ waitForRest: false });
    const read = padInput(match.poll(src));
    expect(read.moveY).toBe(1);
    expect(read.jump).toBe(true);
    expect(new GamePad().poll(src)).toBeNull();                       // the default (the menus): not until at rest
  });
});

describe('the menus read the pad through GamePad (`attachMenuInput`)', () => {
  it('a custom binding changes what a press does in the menu: Circle pressed reads as CROSS after a swap', () => {
    const p = pad(0); save(p, { bindings: swapCrossCircle() });
    const win = { navigator: { getGamepads: () => [p] }, addEventListener: () => {}, removeEventListener: () => {} } as unknown as Window;
    const canvas = document.createElement('canvas');
    const menu = attachMenuInput(canvas, win);
    menu.page.read();
    press(p, 1);
    const down = menu.page.read().down;
    expect(down.has('CROSS')).toBe(true);
    expect(down.has('CIRCLE')).toBe(false);
    menu.detach();
  });
});

describe("the defaults are main's old pad, exactly", () => {
  it('the default dead zone is the 0.15 adapter, and calibration is the identity there', () => {
    expect(defaultController().deadZone).toBe(0.15);
    expect(PAD_DEAD_ZONE).toBe(0.15);
    expect(calibrateStick(0.1, -0.12, defaultController().deadZone)).toEqual([0.1, -0.12]);
  });
  it('nothing customised: every one of the 16 buttons and both sticks pass through unchanged', () => {
    const p = pad(0); const g = new GamePad(); const src = source([p]);
    g.poll(src);
    for (let i = 0; i < 16; i++) {
      press(p, i);
      const read = g.poll(src)!;
      expect(read.buttons.map((b) => b.pressed), `button ${i}`).toEqual(Array.from({ length: 16 }, (_, j) => j === i));
      press(p); g.poll(src);
    }
    p.axes = [0.5, -0.7, -0.3, 0.9];
    expect(g.poll(src)!.axes).toEqual([0.5, -0.7, -0.3, 0.9]);
  });
  it('a non-standard pad is read as before, the raw layout, no bindings', () => {
    const p = { ...pad(0, 'Odd pad'), mapping: '' };
    save(p, { bindings: swapCrossCircle() });
    const g = new GamePad(); const src = source([p]);
    g.poll(src);
    press(p, 0);
    const read = g.poll(src)!;
    expect(read).not.toBeNull();
    expect(read.buttons[0]!.pressed).toBe(true);
    expect(read.buttons[1]!.pressed).toBe(false);
  });
  it("the crouch shortcut releases its button in the match, not in the menus (L2 is the disc's scroll-down)", () => {
    setControllerStanceMode('separate');                   // STM.R1a: SEPARATE's
    const p = pad(0); save(p, { crouch: 6 });
    const match = new GamePad(); const menus = new GamePad({ releaseCrouch: false }); const src = source([p]);
    match.poll(src); menus.poll(src);
    press(p, 6);
    expect(match.poll(src)!.buttons[6]!.pressed).toBe(false);
    expect(match.crouch).toBe(true);
    expect(menus.poll(src)!.buttons[6]!.pressed).toBe(true);
  });
});

describe("resolveConflict: the bindings dialog never leaves the menus' buttons unbound", () => {
  const ident = (): number[] => Array.from({ length: 16 }, (_, i) => i);
  it.each([[9, 'START'], [0, 'Cross'], [1, 'Circle'], [12, 'D-pad up'], [13, 'D-pad down'], [14, 'D-pad left'], [15, 'D-pad right']] as const)('a replace that would unbind %s (%s) is refused', (slot, name) => {
    const b = ident();
    const r = resolveConflict(b, 3, slot, 'replace');
    expect(r.refused).toContain(name);
    expect(r.refused).toContain('must stay bound');
    expect(r.bindings).toEqual(ident());
  });
  // Task W2ibPC6c: the START menu's leave and abort confirms start on NO and reach YES only by d-pad Left (`../src/startMenu`),
  // so a Replace that unbound a d-pad direction (Scotho's fire rate onto Left) locked a player in the match. Swap keeps all.
  it.each([12, 13, 14, 15])('a swap onto d-pad %i keeps the direction bound (it takes the old button of the listening slot)', (slot) => {
    const r = resolveConflict(ident(), 3, slot, 'swap');
    expect(r.refused).toBeUndefined();
    expect([r.bindings[3], r.bindings[slot]]).toEqual([3, 3]);
  });
  // The batch review's F2 (h59U9CLb's batch): a Swap from an UNBOUND listening slot would hand its -1 to the menu button.
  it.each([[14, 'D-pad left'], [9, 'START'], [0, 'Cross']] as const)('a swap from an unbound slot onto %s (%s) is refused, nothing changed', (slot, name) => {
    const b = ident(); b[3] = -1;
    const r = resolveConflict(b, 3, slot, 'swap');
    expect(r.refused).toContain(name);
    expect(r.refused).toContain('must stay bound');
    expect(r.bindings).toEqual(b);
  });
  it('a swap from an unbound slot onto a button the menus do not need still unbinds it (no lock-out)', () => {
    const b = ident(); b[3] = -1;
    const r = resolveConflict(b, 3, 5, 'swap');
    expect(r.refused).toBeUndefined();
    expect(r.bindings[5]).toBe(-1);
  });
  it('a swap keeps START bound; a replace of another binding unbinds it', () => {
    expect(resolveConflict(ident(), 3, 9, 'swap').bindings[9]).toBe(3);
    const r = resolveConflict(ident(), 3, 5, 'replace');
    expect(r.refused).toBeUndefined();
    expect(r.bindings[5]).toBe(-1);
  });
});

describe('OA-3 fold F2: a Cross the operator toast takes never reaches a game reader (`takeCrossPress`, the seam in `GamePad.poll`)', () => {
  const cross = (g: GamePad, src: ReturnType<typeof source>): boolean => !!g.poll(src)?.buttons[0]?.pressed;

  it('a taken press is reported up to every reader until its release; then a new press is reported', () => {
    const p = pad(0); const src = source([p]);
    const a = new GamePad({ waitForRest: false }), b = new GamePad({ releaseCrouch: false, waitForRest: false });   // the match's and the menus'
    const got: number[] = [];
    const off = takeCrossPress(() => { got.push(1); });
    expect(cross(a, src)).toBe(false);                                          // up: a fresh press may now be taken
    press(p, 0);
    expect(cross(a, src)).toBe(false);
    expect(got).toEqual([1]);
    expect(cross(b, src)).toBe(false);                                          // the other reader, the same frame
    expect(cross(a, src)).toBe(false);                                          // the next frames
    press(p);
    expect(cross(a, src)).toBe(false);
    press(p, 0);
    expect(cross(a, src)).toBe(true);                                           // a new press after the release: the game's
    expect(cross(b, src)).toBe(true);
    expect(got).toEqual([1]);                                                   // one press taken (the taker's one shot)
    off();
  });

  it('a press held before the take is not taken', () => {
    const p = pad(0); const src = source([p]); const g = new GamePad({ waitForRest: false });
    press(p, 0);
    expect(cross(g, src)).toBe(true);
    const got: number[] = [];
    const off = takeCrossPress(() => { got.push(1); });
    expect(cross(g, src)).toBe(true);                                           // still held: the game's
    expect(got).toEqual([]);
    press(p);
    expect(cross(g, src)).toBe(false);
    press(p, 0);
    expect(cross(g, src)).toBe(false);                                          // fresh: taken
    expect(got).toEqual([1]);
    off();
  });

  it('let go before any press: nothing taken, nothing masked; the toast\'s own reader (`ownsCross`) sees the button as it is', () => {
    const p = pad(0); const src = source([p]); const g = new GamePad({ waitForRest: false }); const own = new GamePad({ waitForRest: false, ownsCross: true });
    const off = takeCrossPress(() => {});
    off();
    g.poll(src); press(p, 0);
    expect(cross(g, src)).toBe(true);
    press(p);
    g.poll(src);
    const off2 = takeCrossPress(() => {});
    own.poll(src); press(p, 0);
    expect(cross(own, src)).toBe(true);                                          // taken -- yet its own reader is not masked
    expect(cross(g, src)).toBe(false);
    off2();
    press(p);
    g.poll(src);
  });
});

describe('OA-3 fold 2 F2: the taken press is the taken pad\'s', () => {
  it('a second reader on another pad, its Cross up, neither lets go of the mask nor is masked itself', () => {
    const p0 = pad(0), p1 = pad(1); const src = source([p0, p1]);
    const a = new GamePad({ wanted: padKey(p0 as never), waitForRest: false }), b = new GamePad({ wanted: padKey(p1 as never), waitForRest: false });
    const cross = (g: GamePad): boolean => !!g.poll(src)?.buttons[0]?.pressed;
    const off = takeCrossPress(() => {});
    expect(cross(a)).toBe(false);
    press(p0, 0);
    expect(cross(a)).toBe(false);                                               // pad 0's press taken
    expect(cross(b)).toBe(false);                                               // pad 1's Cross up: the mask kept
    expect(cross(a)).toBe(false);                                               // still pad 0's held press: masked
    press(p1, 0);
    expect(cross(b)).toBe(true);                                                // pad 1's own press is never masked
    press(p0);
    expect(cross(a)).toBe(false);
    press(p0, 0);
    expect(cross(a)).toBe(true);                                                // released on pad 0: its next press is the game's
    off();
    press(p0); press(p1); a.poll(src); b.poll(src);
  });
});

describe('OA-3: a vanished pad clears the taken-Cross mask', () => {
  it('a press taken on pad 0, pad 0 gone from getGamepads(): the next poll lets go; a fresh press on pad 1 is the game\'s', () => {
    const p0 = pad(0), p1 = pad(1); const pads = [p0, p1]; const src = source(pads);
    const g = new GamePad({ waitForRest: false });
    const off = takeCrossPress(() => {});
    g.poll(src);
    press(p0, 0);
    expect(g.poll(src)?.buttons[0]?.pressed).toBe(false);                       // taken on pad 0
    expect(crossTaken()).toBe(true);
    pads.splice(0, 1);                                                           // pad 0 unplugged with Cross held
    g.poll(src);
    expect(crossTaken()).toBe(false);
    press(p1, 0);
    expect(g.poll(src)?.buttons[0]?.pressed).toBe(true);
    off();
    press(p1); g.poll(src);
  });
});
