// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControllerInput } from '../src/controllerInput';
import { PadBinding } from '../src/padBinding';
import { knownLayout, padVendorProduct } from '../src/padKnownLayouts';
import { standardView } from '../src/padLayout';
import { SETUP_KEY, defaultController } from '../src/startupSettings';

/**
 * Built-in layouts (product track, a browser adaptation): a pad of another layout recognised by vendor, product and
 * shape reads as a standard pad with no pass. The GameSir-G7 HE for Xbox on macOS Chromium, as a player's diagnostic
 * recorded it on 2026-10-28, every control pressed alone.
 */
const HAT_REST = 3.2857;
const ID = 'GameSir-G7 HE Controller for Xbox (Vendor: 3537 Product: 1082)';
function gamesir(o: { buttons?: number[]; axes?: Record<number, number> } = {}, shape = { buttons: 15, axes: 10 }) {
  const rest = [0, 0, 0, -1, -1, 0, 0, 0, 0, HAT_REST].slice(0, shape.axes);
  return {
    index: 0, id: ID, connected: true, mapping: '',
    axes: rest.map((v, i) => o.axes?.[i] ?? v),
    buttons: Array.from({ length: shape.buttons }, (_, i) => ({ pressed: (o.buttons ?? []).includes(i), value: (o.buttons ?? []).includes(i) ? 1 : 0 })),
  };
}
const read = (pad: ReturnType<typeof gamesir>) => {
  const input = new ControllerInput();
  input.waitForRest = false;
  return input.poll({ getGamepads: () => [pad] })!;
};
const pressed = (pad: ReturnType<typeof gamesir>): number[] => read(pad).buttons.flatMap((b, i) => (b.pressed ? [i] : []));

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

describe('the vendor and product in a pad id', () => {
  it("reads Chromium's and Firefox's forms", () => {
    expect(padVendorProduct(ID)).toEqual({ vendor: '3537', product: '1082' });
    expect(padVendorProduct('3537-1082-GameSir-G7 HE Controller for Xbox')).toEqual({ vendor: '3537', product: '1082' });
    expect(padVendorProduct('45e-b13-Xbox Wireless Controller')).toEqual({ vendor: '045e', product: '0b13' });
    expect(padVendorProduct('Some Pad')).toBeNull();
  });
});

describe('the GameSir-G7 HE for Xbox, untaught, reads as a standard pad', () => {
  it('each control to its standard button, the sticks to the standard axes', () => {
    expect(pressed(gamesir())).toEqual([]);                                          // at rest: nothing held
    const want: [number[], number][] = [[[0], 0], [[1], 1], [[3], 2], [[4], 3], [[6], 4], [[7], 5], [[10], 8], [[11], 9], [[13], 10], [[14], 11]];
    for (const [raw, std] of want) expect(pressed(gamesir({ buttons: raw })), `raw ${raw} -> ${std}`).toEqual([std]);
    expect(pressed(gamesir({ buttons: [8], axes: { 3: 1 } }))).toEqual([6]);         // L2 by its axis
    expect(pressed(gamesir({ buttons: [9], axes: { 4: 1 } }))).toEqual([7]);         // R2
    expect(pressed(gamesir({ axes: { 9: -1 } }))).toEqual([12]);                     // d-pad up
    expect(pressed(gamesir({ axes: { 9: -1 + 4 / 7 } }))).toEqual([15]);             // right
    expect(pressed(gamesir({ axes: { 9: -1 + 8 / 7 } }))).toEqual([13]);             // down
    expect(pressed(gamesir({ axes: { 9: -1 + 12 / 7 } }))).toEqual([14]);            // left
    expect(read(gamesir({ axes: { 0: 0.6, 1: 0.8, 2: -0.7, 5: 0.9 } })).axes).toEqual([0.6, 0.8, -0.7, 0.9]);
    // Guide as the standard centre button (16), which the game's sixteen bindings do not carry: the layout's view holds it.
    const guide = gamesir({ buttons: [12] });
    expect(standardView(guide, knownLayout(guide)!).buttons[16]!.pressed).toBe(true);
  });

  it('untouched triggers (Chromium reads 0 before the first pull) are not held', () => {
    const v = read(gamesir({ axes: { 3: 0, 4: 0 } }));
    for (const b of [6, 7]) expect(v.buttons[b]!.pressed || v.buttons[b]!.value >= 0.5).toBe(false);
  });

  it('the menus read it at rest (the rest wait passes) and the pass is not asked for', () => {
    const input = new ControllerInput();
    expect(input.poll({ getGamepads: () => [gamesir()] }), 'the menus read it').not.toBeNull();
    const b = new PadBinding({ pads: { getGamepads: () => [gamesir()] }, now: () => 0 });
    b.frame(0);
    expect(b.usable()).toBe(true);
  });

  it('another mode of the pad (another shape) is not taken for it', () => {
    expect(knownLayout(gamesir({}, { buttons: 12, axes: 6 }))).toBeNull();
    expect(knownLayout({ ...gamesir(), mapping: 'standard' })).toBeNull();
  });

  it('a layout taught on the pad comes first', () => {
    const key = `${SETUP_KEY}.pad.${JSON.stringify([ID, '', 15, 10])}`;
    const taught = { version: 1, buttons: Array.from({ length: 17 }, (_, i) => (i === 0 ? { button: 1 } : null)), axes: [null, null, null, null] };
    localStorage.setItem(key, JSON.stringify({ ...defaultController(), layout: taught }));
    expect(pressed(gamesir({ buttons: [1] }))).toEqual([0]);                          // B taught as Cross
  });
});
