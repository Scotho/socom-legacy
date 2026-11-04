import { expect, it } from 'vitest';
import { pressureReport, pressureButtonOrder, PressurePad } from '../src/pressurePad';

it('reads the Sony USB format with report ID separated, including light Triangle and neutral d-pad', () => {
  const data = new DataView(new ArrayBuffer(48));
  for (const i of [5, 6, 7, 8]) data.setUint8(i, 128);
  data.setUint8(21, 51); // SDL full-report byte 22: Triangle (WebHID payload excludes ID).
  data.setUint8(2, 0x10); // Triangle digital bit, not Cross.
  const p = pressureReport(1, data)!;
  expect(p.buttons[3]).toEqual({ pressed: true, value: 0.2 });
  expect(p.buttons[0]).toEqual({ pressed: false, value: 0 });
  expect(p.buttons.slice(12, 16).map((b) => b.value)).toEqual([0, 0, 0, 0]);
  expect(p.axes.every((x) => Math.abs(x) < 0.004)).toBe(true);
  expect(pressureReport(2, data)).toBeNull();
  expect(pressureReport(1, new DataView(new ArrayBuffer(6)))).toBeNull();
});

it('drops stale reports and removes listeners on disconnect', async () => {
  let now = 0;
  const input = new PressurePad(() => now);
  let report: ((e: { reportId: number; data: DataView }) => void) | undefined;
  const d = { vendorId: 0x054c, productId: 0x0268, opened: false,
    async open() { this.opened = true; }, async close() { this.opened = false; },
    addEventListener(_type: 'inputreport', cb: NonNullable<typeof report>) { report = cb; },
    removeEventListener() { report = undefined; } };
  const hid = { requestDevice: async () => [d], addEventListener() {}, removeEventListener() {} };
  expect(await input.connect(hid)).toBe(true);
  expect(input.read()!.buttons.every((b) => b.value === 0)).toBe(true);
  report!({ reportId: 1, data: new DataView(new ArrayBuffer(48)) });
  expect(input.read()).not.toBeNull();
  now = 251;
  expect(input.read()!.buttons.every((b) => b.value === 0)).toBe(true);
  expect(input.read()!.axes).toEqual([0, 0, 0, 0]);
  await input.disconnect();
  expect(input.read()).toBeNull();
  expect(d.opened).toBe(false);
  expect(report).toBeUndefined();
});

it('stalled USB reports keep the selected controller identity instead of falling back to another held pad', async () => {
  const { GamePad } = await import('../src/setupPad');
  const { pressurePad, PRESSURE_PAD_ID, PRESSURE_PAD_INDEX } = await import('../src/pressurePad');
  const { vi } = await import('vitest');
  const neutral = { id: PRESSURE_PAD_ID, index: PRESSURE_PAD_INDEX, connected: true, mapping: 'standard', nativePressure: true,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
  const other = { ...neutral, id: 'Other pad', index: 0, nativePressure: false, axes: [1, 1, 1, 1],
    buttons: neutral.buttons.map(() => ({ pressed: true, value: 1 })) };
  const spy = vi.spyOn(pressurePad, 'read').mockReturnValue(neutral);
  try {
    const game = new GamePad({ wanted: `${PRESSURE_PAD_INDEX}:${PRESSURE_PAD_ID}`, waitForRest: false });
    const read = game.poll({ getGamepads: () => [other] })!;
    expect(read.id).toBe(PRESSURE_PAD_ID);
    expect(read.axes).toEqual([0, 0, 0, 0]);
    expect(read.buttons.every((b) => b.value === 0)).toBe(true);
  } finally { spy.mockRestore(); }
});

it('a report stall cancels pressure and requires real button release before accepting another held press', async () => {
  let now = 0;
  const input = new PressurePad(() => now);
  let send: (e: { reportId: number; data: DataView }) => void = () => {};
  const device = { vendorId: 0x054c, productId: 0x0268, opened: false,
    async open() { this.opened = true; }, async close() { this.opened = false; },
    addEventListener(_type: 'inputreport', cb: typeof send) { send = cb; }, removeEventListener() {} };
  await input.connect({ requestDevice: async () => [device], addEventListener() {}, removeEventListener() {} });
  const report = (pressure: number) => { const data = new DataView(new ArrayBuffer(48)); data.setUint8(21, pressure); if (pressure) data.setUint8(2, 0x10); send({ reportId: 1, data }); };
  report(204);
  expect(input.read()!.buttons[3]!.value).toBe(0.8);
  now = 251;
  expect(input.read()!.stanceCancelled).toBe(true);
  report(204);
  expect(input.read()!.stanceCancelled).toBe(true);
  expect(input.read()!.buttons[3]!.value).toBe(0);
  report(0);
  expect(input.read()!.stanceCancelled).toBeUndefined();
  report(204);
  expect(input.read()!.buttons[3]!.value).toBe(0.8);
  await input.disconnect();
});

// Physical 2026-10-31 capture, Sony-compatible PS2 USB interface: pressure channels agree with Sony,
// digital bits do not. Triangle header 00 01 00 00 00; R1 header 00 20 00 00 00.
it('does not turn the captured Triangle press into SELECT or the captured R1 press into d-pad right', async () => {
  const { padInput, PAD_LAYOUT } = await import('../src/gamepad');
  const make = (bit: number, offset: number, pressure: number) => {
    const d = new DataView(new ArrayBuffer(48));
    d.setUint8(1, bit); d.setUint8(offset, pressure);
    for (const axis of [5, 6, 7, 8]) d.setUint8(axis, 128);
    return padInput(pressureReport(1, d, pressureButtonOrder(1, d)!), PAD_LAYOUT);
  };
  const triangle = make(1, 21, 17);
  expect(triangle.stance).toBe(true);
  expect(triangle.scoreboard).toBe(false);
  const r1 = make(32, 20, 39);
  expect(r1.fire).toBe(true);
  expect(r1.leanRight).toBe(false);
});

it('retains the identified adapter layout for captured SELECT, START, L3 and R3 digital-only reports', async () => {
  const { padInput, PAD_LAYOUT } = await import('../src/gamepad');
  let send: (e: { reportId: number; data: DataView }) => void = () => {};
  const input = new PressurePad(() => 0);
  const device = { vendorId: 0x054c, productId: 0x0268, opened: false,
    async open() { this.opened = true; }, async close() { this.opened = false; },
    addEventListener(_t: 'inputreport', cb: typeof send) { send = cb; }, removeEventListener() {} };
  await input.connect({ requestDevice: async () => [device], addEventListener() {}, removeEventListener() {} });
  const emit = (bits: number, triangle = 0) => {
    const data = new DataView(new ArrayBuffer(48));
    data.setUint8(1, bits & 255); data.setUint8(2, bits >> 8); data.setUint8(21, triangle);
    for (const a of [5, 6, 7, 8]) data.setUint8(a, 128);
    send({ reportId: 1, data }); return input.read()!;
  };
  // Unknown layout stays neutral instead of treating adapter SELECT (bit 8) as Sony L2.
  expect(emit(256).buttons.every((b) => !b.pressed)).toBe(true);
  const triangle = padInput(emit(1, 17), PAD_LAYOUT);
  expect(triangle.stancePressure).toBeCloseTo(17 / 255);
  expect(triangle.scoreboard).toBe(false);
  emit(0);
  for (const [bits, button] of [[256, 8], [512, 9], [1024, 10], [2048, 11]] as const) {
    const p = emit(bits);
    expect(p.buttons.flatMap((b, i) => b.pressed ? [i] : [])).toEqual([button]);
    emit(0);
  }
  expect(pressureButtonOrder(1, new DataView(new ArrayBuffer(48)))).toBeNull();
  await input.disconnect();
});
