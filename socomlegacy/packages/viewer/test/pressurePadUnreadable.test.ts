import { expect, it } from 'vitest';
import { PRESSURE_UNREADABLE_PRESSES_ADAPTATION, PRESSURE_UNREADABLE_FIRM_BYTE_ADAPTATION, PressurePad } from '../src/pressurePad';

/**
 * DS3-PRESSURE (b) (product track; a browser adaptation, OT.R28 -- nothing of the game): the Connect row's "unreadable"
 * state. A driver (DsHidMini's SDF/GPJ modes, ScpToolkit, Steam Input) can hand the browser a report that is not the
 * wired DualShock 3's report 1 of 48 bytes, or one whose Triangle / R1 pressure never pairs with a known button order;
 * the reader drops those, so the row sat on "press Triangle lightly" for ever. Fake devices only: nothing here has run on a
 * physical DS3.
 */
type Send = (e: { reportId: number; data: DataView }) => void;
function rig() {
  let now = 0;
  const input = new PressurePad(() => now);
  let send: Send = () => {};
  const device = {
    vendorId: 0x054c, productId: 0x0268, opened: false,
    async open() { this.opened = true; }, async close() { this.opened = false; },
    addEventListener(_t: 'inputreport', cb: Send) { send = cb; }, removeEventListener() {},
    async receiveFeatureReport() { return new DataView(new ArrayBuffer(8)); },
    async sendReport() {},
  };
  const hid = { requestDevice: async () => [device], addEventListener() {}, removeEventListener() {} };
  const report = (reportId: number, length: number, fill: (d: DataView) => void = () => {}): void => {
    const data = new DataView(new ArrayBuffer(length));
    fill(data);
    send({ reportId, data });
  };
  return { input, hid, report, time: (t: number) => { now = t; } };
}
const neutral = (d: DataView): void => { for (const a of [5, 6, 7, 8]) d.setUint8(a, 128); };

it('the press count is a small, labelled browser adaptation', () => {
  expect(PRESSURE_UNREADABLE_PRESSES_ADAPTATION).toBe(8);
});

it('a report of another length is unreadable', async () => {
  const r = rig();
  await r.input.connect(r.hid);
  r.report(1, 64);
  expect(r.input.status()).toBe('unreadable');
});

it('a report of another ID is unreadable', async () => {
  const r = rig();
  await r.input.connect(r.hid);
  r.report(0x11, 48);
  expect(r.input.status()).toBe('unreadable');
});

it('a report of the right shape is not', async () => {
  const r = rig();
  await r.input.connect(r.hid);
  r.report(1, 48, neutral);
  expect(r.input.status()).toBe('reports');
});

it('Triangle pressure that never pairs with a known button order: unreadable after the count of presses, not before', async () => {
  const r = rig();
  await r.input.connect(r.hid);
  // Triangle's pressure byte with neither Sony's nor the adapter's digital bit: no order can be settled.
  const press = (): void => { r.report(1, 48, (d) => { neutral(d); d.setUint8(21, 120); }); r.report(1, 48, (d) => { neutral(d); d.setUint8(21, 200); }); r.report(1, 48, neutral); };
  for (let i = 1; i < PRESSURE_UNREADABLE_PRESSES_ADAPTATION; i++) press();
  expect(r.input.status()).toBe('reports');
  press();
  expect(r.input.status()).toBe('unreadable');
});

it('light touches under the firm byte never count: a factory DS3 touched lightly is not blamed on a driver (review F2)', async () => {
  const r = rig();
  await r.input.connect(r.hid);
  // A light Triangle press: its pressure byte rises with no digital bit yet (under the pad's own threshold).
  const light = (): void => { r.report(1, 48, (d) => { neutral(d); d.setUint8(21, 40); }); r.report(1, 48, (d) => { neutral(d); d.setUint8(21, 90); }); r.report(1, 48, neutral); };
  for (let i = 0; i < 3 * PRESSURE_UNREADABLE_PRESSES_ADAPTATION; i++) light();
  expect(r.input.status()).toBe('reports');
  expect(90).toBeLessThan(PRESSURE_UNREADABLE_FIRM_BYTE_ADAPTATION);
});

it('a pad whose bytes rest at 2 between firm presses still re-arms: unreadable after the count (re-review F1)', async () => {
  const r = rig();
  await r.input.connect(r.hid);
  const resting = (d: DataView): void => { neutral(d); d.setUint8(21, 2); };
  const firm = (): void => { r.report(1, 48, (d) => { neutral(d); d.setUint8(21, 220); }); r.report(1, 48, resting); };
  r.report(1, 48, resting);
  for (let i = 1; i < PRESSURE_UNREADABLE_PRESSES_ADAPTATION; i++) firm();
  expect(r.input.status()).toBe('reports');
  firm();
  expect(r.input.status()).toBe('unreadable');
});

it('a settled button order is never unreadable, and a light press still reads as pressure', async () => {
  const r = rig();
  await r.input.connect(r.hid);
  r.report(1, 48, (d) => { neutral(d); d.setUint8(21, 100); d.setUint8(2, 0x10); });   // Sony: Triangle bit 12
  expect(r.input.status()).toBe('pressure');
});

it('a reconnect forgets it', async () => {
  const r = rig();
  await r.input.connect(r.hid);
  r.report(1, 64);
  expect(r.input.status()).toBe('unreadable');
  await r.input.disconnect();
  await r.input.connect(r.hid);
  expect(r.input.status()).toBe('waiting');
});

/** DS3-PRESSURE (f): the last report's ID, length and first eight bytes, for a player to copy into a report. */
it('diagnostics: none before a report; then the last report ID, length and first eight bytes in hex', async () => {
  const r = rig();
  await r.input.connect(r.hid);
  expect(r.input.diagnostics()).toBeNull();
  r.report(1, 48, (d) => { neutral(d); d.setUint8(2, 0x10); d.setUint8(0, 0xab); });
  expect(r.input.diagnostics()).toEqual({ reportId: 1, length: 48, head: 'ab 00 10 00 00 80 80 80' });
  r.report(0x11, 5, (d) => { d.setUint8(4, 0xff); });
  expect(r.input.diagnostics()).toEqual({ reportId: 0x11, length: 5, head: '00 00 00 00 ff' });
  await r.input.disconnect();
  expect(r.input.diagnostics()).toBeNull();
});
