// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { applyPressureDefault, ControllerInput } from '../src/controllerInput';
import { PRESSURE_PAD_ID, PRESSURE_PAD_INDEX, pressurePad } from '../src/pressurePad';
import { PRESSURE_SEPARATE_TOAST, pendingPressureDefault, pressureDetector } from '../src/pressureDetect';
import { STANCE_FULL_PRESS_READING } from '../src/stanceButton';
import { controllerStanceMode, readPreference, STANCE_MODE_KEY } from '../src/startupSettings';

/**
 * DS3-PRESSURE (e) (product track: it pins the chain, it changes nothing): one wired DualShock 3's chain, end to end, from
 * fake WebHID bytes -- the reader (`PressurePad`, Sony order: Triangle's digital bit 12, its pressure byte 21 of the
 * payload) -> `ControllerInput.poll` (`connectedPads` adds the reader's pad) -> the detection (`pressureDetector`, two
 * in-between Triangle reports) -> the pending default -> `applyPressureDefault` (no Stance mode stored: SEPARATE, Prone and
 * Crouch on Triangle) -> `StancePress` (`STANCE_FULL_PRESS_READING`, unchanged here) -> a light press is Crouch's one-frame
 * press, a firm one Prone's. Nothing here has run on a physical DS3.
 */
type Send = (e: { reportId: number; data: DataView }) => void;
let send: Send = () => {};
const device = {
  vendorId: 0x054c, productId: 0x0268, opened: false,
  async open() { this.opened = true; }, async close() { this.opened = false; },
  addEventListener(_t: 'inputreport', cb: Send) { send = cb; }, removeEventListener() {},
  async receiveFeatureReport() { return new DataView(new ArrayBuffer(8)); },
  async sendReport() {},
};
const hid = { requestDevice: async () => [device], addEventListener() {}, removeEventListener() {} };
/** One Sony-order report: Triangle at `pressure` (0..255), its digital bit with it; sticks centred. */
const triangle = (pressure: number): void => {
  const data = new DataView(new ArrayBuffer(48));
  for (const a of [5, 6, 7, 8]) data.setUint8(a, 128);
  data.setUint8(21, pressure);
  if (pressure) data.setUint8(2, 0x10);
  send({ reportId: 1, data });
};

beforeEach(() => { localStorage.clear(); pressureDetector.clear(); });
afterEach(async () => { await pressurePad.disconnect(); localStorage.clear(); pressureDetector.clear(); });

it('HID bytes -> PressurePad -> ControllerInput -> detection -> applyPressureDefault -> StancePress: Crouch light, Prone firm', async () => {
  expect(await pressurePad.connect(hid)).toBe(true);
  const input = new ControllerInput();
  input.waitForRest = false;
  input.select(`${PRESSURE_PAD_INDEX}:${PRESSURE_PAD_ID}`);
  const src = { getGamepads: () => [] };
  const log: string[] = [];
  const frame = (pressure: number): void => {
    triangle(pressure);
    input.poll(src);
    if (input.crouch) log.push('crouch');
    if (input.prone) log.push('prone');
  };

  // The detection: two in-between Triangle reports; no Stance mode stored, so the default waits for the front end.
  expect(readPreference(STANCE_MODE_KEY)).toBeNull();
  frame(0); frame(60); frame(90); frame(0);
  expect(input.raw?.id).toBe(PRESSURE_PAD_ID);
  expect(pressureDetector.capable(input.raw)).toBe(true);
  expect(pendingPressureDefault()?.id).toBe(PRESSURE_PAD_ID);
  expect(log).toEqual([]);                                   // COMBINED until then: pressure read, no binds

  // The front end's console frame applies it.
  expect(applyPressureDefault()).toBe(PRESSURE_SEPARATE_TOAST);
  expect(controllerStanceMode()).toBe('separate');

  // At rest, then a light press (peak under the full press) and its release: one Crouch.
  for (let i = 0; i < 6; i++) frame(0);
  expect(input.config.prone).toBe(3);
  expect(input.config.crouch).toBe(3);
  const light = Math.floor(STANCE_FULL_PRESS_READING * 255 * 0.5);
  frame(light); frame(light); frame(0);
  expect(log).toEqual(['crouch']);

  // At rest, then a firm press: one Prone, at once.
  for (let i = 0; i < 6; i++) frame(0);
  frame(light); frame(200); frame(200); frame(0);
  expect(log).toEqual(['crouch', 'prone']);
});
