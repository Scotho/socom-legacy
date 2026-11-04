import { describe, expect, it } from 'vitest';
import { noInput, padInput, mergeInput, PAD_LAYOUT } from '../src/gamepad';

// Research 373: synthetic inputs, no hardware claim. PS2P (2026-11-01, the owner via seat 5d: "Keep our separate logic"):
// Phil's `StanceButton` pressure cases ("a light press never becomes a timed hold", "a firm press drops immediately
// once", "changing the digital mode cannot retrigger a held native press") are dropped with the pressure branch they
// pinned -- the press is the reader's now, SEPARATE only (`test/pressureSeparate.test.ts`). What stays: the value carried.
describe('native pressure stance', () => {
  it('preserves a light value below the browser digital threshold through mapping and merging', () => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    buttons[3] = { pressed: false, value: 0.2 };
    const i = padInput({ axes: [0, 0, 0, 0], buttons, nativePressure: true }, PAD_LAYOUT);
    expect(i.stance).toBe(false);                     // PS2P: the press is the button's own (B193's `held`), pressure or not
    expect(mergeInput(noInput(), i).stancePressure).toBe(0.2);
  });
});

it('a pressure controller keeps its real value through profile mapping', async () => {
  const { ControllerInput } = await import('../src/controllerInput');
  const { pressureReport } = await import('../src/pressurePad');
  const { ExchangeInput } = await import('../src/exchangeInput');
  const data = new DataView(new ArrayBuffer(48));
  data.setUint8(21, 51);
  const p = pressureReport(1, data)!;
  const input = new ControllerInput(); input.waitForRest = false;
  const logical = input.poll({ getGamepads: () => [p] });
  const mapped = padInput(logical);
  expect(mapped.stancePressure).toBe(0.2);
  const exchange = new ExchangeInput();
  exchange.frame(mapped, true);
  const taken = exchange.frame(mapped, false);
  expect(taken.stance).toBe(false);
  expect(taken.stancePressure).toBe(0);
});

it('an explicit digital preference overrides the USB pressure default and survives parsing', async () => {
  const { ControllerInput } = await import('../src/controllerInput');
  const { pressureReport } = await import('../src/pressurePad');
  const { defaultController, parseController } = await import('../src/startupSettings');
  const data = new DataView(new ArrayBuffer(48)); data.setUint8(21, 51);
  const p = pressureReport(1, data)!;
  const input = new ControllerInput(); input.waitForRest = false;
  input.poll({ getGamepads: () => [p] });
  input.config = parseController(JSON.stringify({ ...defaultController(), nativePressure: false }));
  expect(padInput(input.poll({ getGamepads: () => [p] })).stancePressure).toBeUndefined();
  input.config.nativePressure = true;
  expect(padInput(input.poll({ getGamepads: () => [p] })).stancePressure).toBe(0.2);
});
