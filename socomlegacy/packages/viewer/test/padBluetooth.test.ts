// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControllerInput, padKey } from '../src/controllerInput';
import { PadWatch } from '../src/gamepad';
import { padFamily } from '../src/padFamily';
import { PadBinding } from '../src/padBinding';
import { overlayButtonCap, overlayButtonName } from '../src/modern/overlay/binding';
import { padActuator, padRumbleForm } from '../src/rumble';

/**
 * OBF-9 (product track; a browser adaptation, no original): a Bluetooth pad gets the same family, button order, prompts
 * and rumble as its wired self. The ids are the strings Chromium ("<name> (STANDARD GAMEPAD Vendor: v Product: p)",
 * "<name> (Vendor: v Product: p)" without the standard mapping, "<name> (XInput STANDARD GAMEPAD)") and Firefox
 * ("<vendor>-<product>-<name>") give a pad on Windows. They are the author's transcription of those forms, a STUB until a
 * person reads the real ids off the real pads (the report lists what to check); no value here is the game's.
 */
const IDS = {
  ds4Usb: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
  ds4Bt: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 05c4)',
  ds4BtNoMap: 'Wireless Controller (Vendor: 054c Product: 09cc)',
  ds4Firefox: '054c-09cc-Wireless Controller',
  dualSense: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
  dualSenseFirefox: '054c-0ce6-DualSense Wireless Controller',
  xboxXInput: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
  xboxBt0b13: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
  xboxBt0b20: 'Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b20)',
  xboxBt02e0: 'Microsoft Controller (Vendor: 045e Product: 02e0)',
  xboxFirefox: '45e-b13-Xbox Wireless Controller',
  xboxFirefoxBare: '45e-2e0-Controller',
  other: 'Generic Gamepad (Vendor: 1234 Product: abcd)',
};

describe('the pad family, by the id the browser reports', () => {
  it('reads a Sony pad the same over Bluetooth and USB, in either browser', () => {
    for (const id of [IDS.ds4Usb, IDS.ds4Bt, IDS.ds4BtNoMap, IDS.ds4Firefox, IDS.dualSense, IDS.dualSenseFirefox]) expect(padFamily(id), id).toBe('playstation');
  });
  it('reads an Xbox pad the same over Bluetooth and USB, by name or by Microsoft vendor', () => {
    for (const id of [IDS.xboxXInput, IDS.xboxBt0b13, IDS.xboxBt0b20, IDS.xboxBt02e0, IDS.xboxFirefox, IDS.xboxFirefoxBare]) expect(padFamily(id), id).toBe('xbox');
  });
  it('leaves any other pad alone', () => {
    expect(padFamily(IDS.other)).toBe('other');
    expect(padFamily('')).toBe('other');
  });
});

const pad = (id: string, o: { index?: number; mapping?: string; n?: number } = {}) => ({
  index: o.index ?? 0, id, connected: true, mapping: o.mapping ?? 'standard',
  axes: [0, 0, 0, 0], buttons: Array.from({ length: o.n ?? 17 }, () => ({ pressed: false, value: 0 })),
});

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

describe('the prompts follow the family, not the bus', () => {
  it('names the buttons alike for an Xbox pad whatever its id says', () => {
    for (const id of [IDS.xboxBt0b13, IDS.xboxBt0b20, IDS.xboxFirefoxBare]) {
      expect(overlayButtonName(0, id), id).toBe('A / Cross');
      expect(overlayButtonName(16, id), id).toBe('Guide');
      expect(overlayButtonCap(16, id), id).toBe('Guide');
    }
    expect(overlayButtonName(0, IDS.ds4Bt)).toBe(overlayButtonName(0, IDS.ds4Usb));
    expect(overlayButtonCap(16, IDS.ds4Bt)).toBe('Home');
  });
  it('labels the remap and finds the touchpad alike over Bluetooth and USB', () => {
    const view = (id: string, n: number) => {
      const p = pad(id, { n });
      const b = new PadBinding({ pads: { getGamepads: () => [p] } });
      b.poll();
      return b;
    };
    expect(view(IDS.xboxBt0b20, 17).label(2)).toBe(view(IDS.xboxXInput, 17).label(2));
    expect(view(IDS.ds4Bt, 18).touchpad()).toBe(view(IDS.ds4Usb, 18).touchpad());
    expect(view(IDS.dualSenseFirefox, 18).touchpad()).toBe(true);
  });
});

describe('a Bluetooth pad that drops and comes back', () => {
  it('keeps a chosen pad when it returns at another index', () => {
    const input = new ControllerInput();
    input.waitForRest = false;
    const first = pad(IDS.ds4Bt, { index: 0 });
    input.select(padKey(first));
    expect(input.poll({ getGamepads: () => [first] })?.id).toBe(IDS.ds4Bt);
    const back = pad(IDS.ds4Bt, { index: 2 });
    expect(input.poll({ getGamepads: () => [null, null, back] })?.id).toBe(IDS.ds4Bt);
  });
  it('does not guess between two identical pads that left their slots', () => {
    const input = new ControllerInput();
    input.waitForRest = false;
    input.select(padKey(pad(IDS.ds4Bt, { index: 0 })));
    expect(input.poll({ getGamepads: () => [null, pad(IDS.ds4Bt, { index: 1 }), pad(IDS.ds4Bt, { index: 2 })] })).toBeNull();
  });
  it('ends with the one pad known after the move', () => {
    const said: string[] = [];
    const w = new PadWatch({ connected: (id) => said.push(`+${id}`), disconnected: (id) => said.push(`-${id}`) });
    w.poll({ getGamepads: () => [pad(IDS.ds4Bt, { index: 0 })] });
    w.poll({ getGamepads: () => [null, null, pad(IDS.ds4Bt, { index: 2 })] });
    expect([...said].sort()).toEqual([`+${IDS.ds4Bt}`, `+${IDS.ds4Bt}`, `-${IDS.ds4Bt}`].sort());   // the new slot is seen before the old one is found gone
    expect(w.count()).toBe(1);
  });
});

describe('rumble degrades quietly', () => {
  const nav = (p: unknown) => ({ getGamepads: () => [p] });
  it('uses Chromium dual-rumble, Firefox pulse, and else says it once and returns none', () => {
    const dual = { playEffect: async () => 'complete', reset: async () => 'complete' };
    expect(padRumbleForm({ vibrationActuator: dual })).toBe('dual-rumble');
    expect(padRumbleForm({ hapticActuators: [{ pulse: async () => true }] })).toBe('pulse');
    const notes: string[] = [];
    const bare = { ...pad(IDS.xboxBt0b13), vibrationActuator: null, hapticActuators: [] };
    expect(padActuator(nav(bare), (m) => notes.push(m))).toBeNull();
    expect(padActuator(nav(bare), (m) => notes.push(m))).toBeNull();
    expect(notes).toHaveLength(1);
  });
  it('survives an actuator that rejects or throws', async () => {
    const throwing = { ...pad(IDS.ds4Bt), vibrationActuator: { playEffect: () => { throw new Error('no'); }, reset: () => Promise.reject(new Error('no')) } };
    expect(() => padActuator(nav(throwing))).not.toThrow();
    expect(padActuator({ getGamepads: () => { throw new Error('policy'); } })).toBeNull();
  });
});
