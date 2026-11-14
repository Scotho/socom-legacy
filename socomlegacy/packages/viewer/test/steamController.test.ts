// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { padFamily } from '../src/padFamily';
import { PadBinding } from '../src/padBinding';
import { padHasTouchpad } from '../src/controllerInput';
import { GamePad } from '../src/setupPad';
import { padInput } from '../src/gamepad';
import { controllerConfigs } from '../src/controllerConfigs';
import { setCodModernChosen } from '../src/controllerModern';
import { defaultController, SETUP_KEY } from '../src/startupSettings';
import { overlayButtonName, overlayButtonCap } from '../src/modern/overlay/binding';
import { buttonGlyph } from '../src/console/render/remap';

const LABELS = `${SETUP_KEY}.controllerLabels`;
const device = (id: string, mapping = 'standard') => ({ id, mapping, index: 0, connected: true,
  axes: [0, 0, 0, 0], buttons: Array.from({ length: 21 }, () => ({ pressed: false, value: 0 })) });
const binding = (id: string) => { const raw = device(id); const b = new PadBinding({ pads: { getGamepads: () => [raw] } }); b.poll(); return b; };
beforeEach(() => { localStorage.clear(); controllerConfigs.reset(); });
afterEach(() => { localStorage.clear(); controllerConfigs.reset(); });

describe('Steam devices and Steam Input browser support', () => {
  for (const [id, family] of [
    ['Steam Controller', 'steam'], ['Steam Controller (2026)', 'steam'],
    ['Steam Deck Controller', 'steam-deck'], ['SteamDeck', 'steam-deck'],
    ['Controller (Vendor: 28de Product: 1102)', 'steam'],
    ['28de-1142-Wireless Controller', 'steam'], ['28de-1106-Controller', 'steam'],
    ['28de-1302-Controller', 'steam'], ['28de-1303-Controller', 'steam'],
    ['Controller (STANDARD GAMEPAD Vendor: 28de Product: 1205)', 'steam-deck'],
    ['28de-1205-Controller', 'steam-deck'],
  ] as const) it(`recognizes ${id}`, () => expect(padFamily(id)).toBe(family));

  it('does not guess the hardware behind Steam Virtual Gamepad or unknown Valve hardware', () => {
    expect(padFamily('Steam Virtual Gamepad (Vendor: 28de Product: 11ff)')).toBe('other');
    expect(padFamily('Valve device (Vendor: 28de Product: beef)')).toBe('other');
    expect(padFamily('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('xbox');
  });
  for (const id of ['Steam Controller', 'Steam Deck Controller']) it(`${id} names physical controls and draws ABXY`, () => {
    const b = binding(id);
    expect([0, 1, 2, 3, 4, 6, 8, 9, 16].map(i => b.label(i))).toEqual(['A', 'B', 'X', 'Y', 'L1', 'L2', 'View', 'Menu', 'Steam']);
    expect(overlayButtonName(0, id)).toBe('A');
    expect(overlayButtonName(16, id)).toBe('Steam');
    expect(overlayButtonCap(16, id)).toBe('Steam');
    expect(buttonGlyph(b, 0)).toContain('>A<');
    expect(b.label(17)).toBe('Button 18'); // extra physical buttons have no guessed grip order
    expect(b.touchpad()).toBe(false);
  });
  it('draws Xbox physical glyphs when its labels are chosen for a Steam device', () => {
    localStorage.setItem(LABELS, 'xbox');
    const b = binding('Steam Controller');
    expect(buttonGlyph(b, 0)).toContain('>A<');
    expect(buttonGlyph(b, 4)).toContain('>LB<');
    expect(padFamily('Steam Controller')).toBe('steam');
    localStorage.setItem(LABELS, 'playstation');
    expect(b.label(0)).toBe('Cross');
    expect(buttonGlyph(b, 0)).not.toContain('>A<');
  });
  it('uses a saved Steam Deck label choice for an Xbox-emulated pad without changing hardware detection', () => {
    const id = 'Xbox 360 Controller (XInput STANDARD GAMEPAD)';
    localStorage.setItem(LABELS, 'steam-deck');
    expect(binding(id).label(0)).toBe('A');
    expect(binding(id).label(4)).toBe('L1');
    expect(overlayButtonCap(16, id)).toBe('Steam');
    expect(padFamily(id)).toBe('xbox');
    expect(padHasTouchpad(device('Steam Deck Controller'))).toBe(false);
    localStorage.setItem(LABELS, 'auto');
    expect(binding(id).label(4)).toBe('LB');
    localStorage.setItem(LABELS, 'invalid');
    expect(binding(id).label(4)).toBe('LB');
  });
  for (const id of ['Steam Controller', 'Steam Deck Controller', 'Steam Virtual Gamepad (Vendor: 28de Product: 11ff)', 'Xbox 360 Controller (XInput STANDARD GAMEPAD)']) {
    it(`${id} keeps saved binds/calibration through a new reader and reconnect`, () => {
      const raw = device(id);
      const profile = `${SETUP_KEY}.pad.${JSON.stringify([raw.id, raw.mapping, raw.buttons.length, raw.axes.length])}`;
      const config = defaultController(); config.bindings[0] = 18; config.deadZone = .2;
      localStorage.setItem(profile, JSON.stringify(config));
      setCodModernChosen(true); controllerConfigs.store(name => name === 'SelectedControllerConfig' ? 1 : 0);   // V20.R4: the page's choice
      for (const index of [0, 2]) {
        raw.index = index;
        const reader = new GamePad({ waitForRest: false });
        const source = { getGamepads: () => [raw] };
        raw.buttons[18]!.pressed = false; raw.buttons[18]!.value = 0; reader.poll(source);
        raw.buttons[18]!.pressed = true; raw.buttons[18]!.value = 1;
        raw.axes = [.1, 0, .8, 0];
        const input = padInput(reader.poll(source));
        expect(input.jump).toBe(true); expect(input.moveX).toBe(0); expect(input.lookX).toBeGreaterThan(0);
        expect(reader.input.config.deadZone).toBe(.2);
      }
    });
  }
  it('prefers Steam Input standard output over a simultaneously exposed raw device', () => {
    const raw = device('Steam Controller (Vendor: 28de Product: 1102)', '');
    const virtual = device('Steam Virtual Gamepad (Vendor: 28de Product: 11ff)'); virtual.index = 1;
    const reader = new GamePad({ waitForRest: false });
    expect(reader.poll({ getGamepads: () => [raw, virtual] })?.id).toBe(virtual.id);
    expect(reader.input.view?.mapping).toBe('standard');
  });
  it('leaves an unknown raw Steam report for the existing teach pass', () => {
    const raw = device('Steam Controller (Vendor: 28de Product: 1102)', '');
    const reader = new GamePad({ waitForRest: false });
    expect(reader.poll({ getGamepads: () => [raw] })).toBe(raw);
    expect(reader.input.view).toBeNull();
  });
});
