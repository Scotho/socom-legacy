// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PAD_BUTTON, padInput } from '../src/gamepad';
import { OVERLAY_BUTTON_KEY } from '../src/overlayButtonSetting';
import { padExtrasKeyOf } from '../src/padExtras';
import { GamePad } from '../src/setupPad';
import { SETUP_KEY, setControllerStanceMode } from '../src/startupSettings';

/**
 * h59U9CLb task 4 (a **browser adaptation**, off by default): the profile's extra binds read by the game's pad -- stored
 * under `s2u.startup.v1.pad.extras.<profile>` (version 1), read again whenever what is stored changes (beside OBF-12's
 * profile read), validated at each load, the modifier state reset at a flush, a blur and a pad change -- and applied by the
 * front end's match after its pad read (`../src/matchMount`), never while a menu holds the pad.
 */
type Btn = { pressed: boolean; value: number };
interface Pad { index: number; id: string; mapping: string; connected: boolean; axes: number[]; buttons: Btn[] }
const pad = (index = 0, id = `Pad ${index}`): Pad => ({ index, id, mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });
const press = (p: Pad, ...buttons: number[]): void => { p.buttons.forEach((b, i) => { b.pressed = buttons.includes(i); b.value = b.pressed ? 1 : 0; }); };
const source = (pads: Pad[]) => ({ getGamepads: () => pads });
const profile = (p: Pad): string => `${SETUP_KEY}.pad.${JSON.stringify([p.id, p.mapping, p.buttons.length, p.axes.length])}`;
const extrasKey = (p: Pad): string => `${SETUP_KEY}.pad.extras.${JSON.stringify([p.id, p.mapping, p.buttons.length, p.axes.length])}`;
const storeExtras = (p: Pad, v: unknown): void => { localStorage.setItem(extrasKey(p), JSON.stringify(v)); };
const { Square, L1, R3, Triangle } = PAD_BUTTON;

/** One frame of the match's read: the pad through the bindings, then the extras (`menu`: a menu holds the pad). */
function frame(g: GamePad, src: ReturnType<typeof source>, menu = false) {
  const base = padInput(g.poll(src));
  return { base, out: g.extras(base, menu) };
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

describe('h59U9CLb: the extras\' key', () => {
  it('beside the pad\'s profile, under the setup store\'s pad prefix: s2u.startup.v1.pad.extras.<profile>', () => {
    const p = pad();
    expect(padExtrasKeyOf(profile(p))).toBe(extrasKey(p));
    expect(extrasKey(p)).toBe('s2u.startup.v1.pad.extras.["Pad 0","standard",17,4]');
  });
});

describe('h59U9CLb: nothing stored, the match\'s input is today\'s', () => {
  it('every frame of a press sequence comes back the same object, untouched', () => {
    const p = pad(); const g = new GamePad({ waitForRest: false }); const src = source([p]);
    for (const down of [[], [Square], [Square, L1], [L1], [R3, Triangle], [], [Square]]) {
      press(p, ...down);
      const { base, out } = frame(g, src);
      const copy = structuredClone(base);
      expect(out).toBe(base);
      expect(out).toEqual(copy);
    }
  });
});

describe('h59U9CLb: an extra stored acts in the match', () => {
  it('a double bind: Square jumps and fires, the same frame', () => {
    const p = pad(); storeExtras(p, { version: 1, doubles: [{ button: Square, action: 'fire' }] });
    const g = new GamePad({ waitForRest: false }); const src = source([p]);
    frame(g, src);
    press(p, Square);
    const { out } = frame(g, src);
    expect([out.jump, out.fire]).toEqual([true, true]);
    press(p);
    expect(frame(g, src).out.fire).toBe(false);
  });
  it('a combo: L1 held, then Square -- the swap and the jump kept, the reload added', () => {
    const p = pad(); storeExtras(p, { version: 1, combos: [{ modifier: L1, button: Square, action: 'reload' }] });
    const g = new GamePad({ waitForRest: false }); const src = source([p]);
    frame(g, src);
    press(p, L1); frame(g, src);
    press(p, L1, Square);
    const { out } = frame(g, src);
    expect([out.swap1, out.jump, out.reload]).toEqual([true, true, true]);
  });
  it('while a menu holds the pad the input is untouched', () => {
    const p = pad(); storeExtras(p, { version: 1, doubles: [{ button: Square, action: 'fire' }] });
    const g = new GamePad({ waitForRest: false }); const src = source([p]);
    frame(g, src);
    press(p, Square);
    const { base, out } = frame(g, src, true);
    expect(out).toBe(base);
    expect(out.fire).toBe(false);
  });
  it('a change to what is stored is read on the next frame; removed, the input is today\'s again', () => {
    const p = pad(); const g = new GamePad({ waitForRest: false }); const src = source([p]);
    frame(g, src);
    press(p, Square);
    expect(frame(g, src).out.fire).toBe(false);
    storeExtras(p, { version: 1, doubles: [{ button: Square, action: 'fire' }] });
    press(p); frame(g, src);
    press(p, Square);
    expect(frame(g, src).out.fire).toBe(true);
    localStorage.removeItem(extrasKey(p));
    expect(frame(g, src).out.fire).toBe(false);
  });
  it('validated at load: a bad entry drops alone; the overlay\'s button and a SEPARATE held bind as modifier are refused', () => {
    const p = pad();
    setControllerStanceMode('separate');
    localStorage.setItem(profile(p), JSON.stringify({ version: 1, bindings: Array.from({ length: 16 }, (_, i) => i), deadZone: 0.15, crouch: -1, prone: R3 }));
    localStorage.setItem(OVERLAY_BUTTON_KEY, String(Triangle));
    storeExtras(p, { version: 1,
      doubles: [{ button: Square, action: 'fire' }, { button: Square, action: 'boost' }, { button: Triangle, action: 'reload' }],
      combos: [{ modifier: R3, button: L1, action: 'reload' }] });
    const g = new GamePad({ waitForRest: false }); const src = source([p]);
    frame(g, src);
    expect(g.input.extras).toEqual({ doubles: [{ button: Square, action: 'fire' }], combos: [] });
  });
  it('the modifier state resets on a flush, a blur and a pad change: a button held through any is no combo', () => {
    const p = pad(); storeExtras(p, { version: 1, combos: [{ modifier: L1, button: Square, action: 'reload' }] });
    const g = new GamePad({ waitForRest: false }); const src = source([p]);
    const throughEach = (cut: () => void): boolean[] => {
      press(p); frame(g, src);
      press(p, L1); frame(g, src);
      press(p, L1, Square); frame(g, src);
      cut();
      return [frame(g, src).out.reload, frame(g, src).out.reload];
    };
    expect(throughEach(() => g.flushExtras())).toEqual([false, false]);
    expect(throughEach(() => { g.input.focus(false); g.input.focus(true); })).toEqual([false, false]);
    expect(throughEach(() => g.input.select('auto'))).toEqual([false, false]);
    expect(throughEach(() => undefined)).toEqual([true, true]);           // with no cut, the combo holds
  });
});

const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');

describe('h59U9CLb: the front end\'s match applies the extras after its pad read', () => {
  it('matchMount: after the FIRE RATE swap and before the flush, menus passed; the flush resets the modifiers', () => {
    const m = src('matchMount.ts');
    const apply = m.indexOf('playOptions.apply(fly, pad);');
    const extras = m.indexOf('gamePad.extras(pad, ');
    const flush = m.indexOf('if (held || !flushed) {');
    expect(apply).toBeGreaterThan(0);
    expect(extras).toBeGreaterThan(apply);
    expect(flush).toBeGreaterThan(extras);
    expect(m.slice(flush, m.indexOf('flushed = !held;', flush))).toContain('gamePad.flushExtras();');
    expect(m.slice(apply, extras)).toMatch(/startMenu\.isOpen\(\)[\s\S]*taunts\.isOpen\(\)[\s\S]*exchange\.isOpen\(\)[\s\S]*throws\.inventory\.isOpen\(\)/);
  });
});
