import { expect, it } from 'vitest';
import type { PadLike } from '../src/gamepad';
import { PRESSURE_PAD_ID } from '../src/pressurePad';
import { pressureConnectAbsent } from '../src/pressureDetect';

/**
 * DS3-PRESSURE (c) (product track; a browser adaptation, OT.R28 -- nothing of the game): why the Connect row is absent
 * while a pad is present -- no WebHID (Firefox, Safari), or a DualShock 3 that a driver shows as an XInput or DS4 pad (no
 * 054c:0268 in its id). Conservative: only an XInput / Xbox 360 or a DualShock 4 id counts as a possibly wrapped DS3.
 */
const p = (id: string): PadLike => ({ id, index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: [] });
const HID = { hid: {} };
const NO_HID = {};
const DS3_CHROME = 'Sony PLAYSTATION(R)3 Controller (STANDARD GAMEPAD Vendor: 054c Product: 0268)';
const DS3_FIREFOX = '054c-0268-Sony PLAYSTATION(R)3 Controller';
const XINPUT = 'Xbox 360 Controller (XInput STANDARD GAMEPAD)';
const X360_IDS = 'Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)';
const DS4 = 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 05c4)';
const DS4_V2 = 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)';
const DUALSENSE = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
const GENERIC = 'USB Gamepad (Vendor: 0079 Product: 0006)';

it('no pad: nothing to say', () => {
  expect(pressureConnectAbsent([], NO_HID)).toBeNull();
  expect(pressureConnectAbsent([], HID)).toBeNull();
});

it('no WebHID (Firefox, Safari) with a pad present: no-webhid', () => {
  expect(pressureConnectAbsent([p(DS3_FIREFOX)], NO_HID)).toBe('no-webhid');
  expect(pressureConnectAbsent([p(XINPUT)], NO_HID)).toBe('no-webhid');
});

it('WebHID with a DS3 listed: the row is offered, nothing to say', () => {
  expect(pressureConnectAbsent([p(DS3_CHROME)], HID)).toBeNull();
});

it('WebHID, an XInput / Xbox 360 or a DS4 id and no DS3: wrapped (a driver may be showing a DS3 as another pad)', () => {
  for (const id of [XINPUT, X360_IDS, DS4, DS4_V2]) expect(pressureConnectAbsent([p(id)], HID)).toBe('wrapped');
});

it('WebHID and another pad (DualSense, a generic pad, the WebHID reader\'s own pad): nothing to say', () => {
  for (const id of [DUALSENSE, GENERIC, PRESSURE_PAD_ID]) expect(pressureConnectAbsent([p(id)], HID)).toBeNull();
});
