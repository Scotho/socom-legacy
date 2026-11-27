import { expect, it } from 'vitest';
import { PRESSURE_SILENT_MS_ADAPTATION, PRESSURE_START_TIMEOUT_MS_ADAPTATION, PressurePad } from '../src/pressurePad';

/**
 * PAD-DS3 (a browser adaptation, OT.R28): the Connect row's state -- none, connecting, starting, waiting, silent, reports,
 * pressure -- read from the WebHID reader through an injected clock. Part 1 (granted by the owner, 2026-11-23): on Connect
 * the reader runs SDL's wired DualShock 3 start sequence (a reading, not yet run on a physical DS3) and nothing else:
 * feature reports 0xF2 and 0xF5 read, then a one-byte output report 0xF5. No feature report is ever sent.
 */
type Send = (e: { reportId: number; data: DataView }) => void;
// PADDS3-PC5's TS2345: the fake's data must be BufferSource, as HidDevice.sendReport's -- under TS 5.7+ a bare Uint8Array
// (Uint8Array<ArrayBufferLike>) and BufferSource are assignable in neither direction, so the fake did not fit the interface
type Call = { kind: 'receiveFeatureReport'; id: number } | { kind: 'sendReport'; id: number; data: BufferSource };
const flush = (): Promise<void> => new Promise((res) => setTimeout(res, 0));
function rig(o: { hold?: boolean; holdChooser?: boolean; failReceive?: boolean; failSend?: boolean } = {}) {
  let now = 0;
  const input = new PressurePad(() => now);
  let send: Send = () => {};
  let release = (): void => {};
  const gate = new Promise<void>((res) => { release = res; });
  let openChooser = (): void => {};
  const chooser = new Promise<void>((res) => { openChooser = res; });
  // sendFeatureReport is a counter that must stay 0; receiveFeatureReport and sendReport are recorded, in order.
  const calls = { feature: 0, log: [] as Call[] };
  const device = {
    vendorId: 0x054c, productId: 0x0268, opened: false,
    async open() { this.opened = true; }, async close() { this.opened = false; },
    addEventListener(_t: 'inputreport', cb: Send) { send = cb; }, removeEventListener() {},
    async sendFeatureReport() { calls.feature++; },
    async receiveFeatureReport(id: number) {
      calls.log.push({ kind: 'receiveFeatureReport', id });
      if (o.hold) await gate;
      if (o.failReceive) throw new Error('feature report refused');
      return new DataView(new ArrayBuffer(id === 0xf2 ? 17 : 8));
    },
    async sendReport(id: number, data: BufferSource) {
      calls.log.push({ kind: 'sendReport', id, data });
      if (o.failSend) throw new Error('output report refused');
    },
  };
  const hid = {
    requestDevice: async () => { if (o.holdChooser) await chooser; return [device]; },
    addEventListener() {}, removeEventListener() {},
  };
  // A Sony-order report: Triangle's digital bit (data[2] & 0x10 = bit 12) with pressure byte 21 and R1's pair idle.
  const triangle = (pressure: number): void => {
    const data = new DataView(new ArrayBuffer(48));
    for (const a of [5, 6, 7, 8]) data.setUint8(a, 128);
    data.setUint8(21, pressure);
    if (pressure) data.setUint8(2, 0x10);
    send({ reportId: 1, data });
  };
  return { input, hid, triangle, calls, release, openChooser, time: (t: number) => { now = t; } };
}

it('the silent time is a labelled browser adaptation of three seconds', () => {
  expect(PRESSURE_SILENT_MS_ADAPTATION).toBe(3000);
});

it('none before a connection', () => {
  expect(rig().input.status()).toBe('none');
});

it('none -> waiting -> silent: connected, nothing arrives, time passes', async () => {
  const r = rig();
  r.time(1000);
  expect(await r.input.connect(r.hid)).toBe(true);
  expect(r.input.status()).toBe('waiting');
  r.time(1000 + PRESSURE_SILENT_MS_ADAPTATION - 1);
  expect(r.input.status()).toBe('waiting');
  r.time(1000 + PRESSURE_SILENT_MS_ADAPTATION);
  expect(r.input.status()).toBe('silent');
});

it('waiting -> reports on a report; a neutral report is not pressure; later silence does not return to silent', async () => {
  const r = rig();
  await r.input.connect(r.hid);
  r.triangle(0);
  expect(r.input.status()).toBe('reports');
  r.time(PRESSURE_SILENT_MS_ADAPTATION * 10);
  expect(r.input.status()).toBe('reports');
});

it('silent -> reports when a report finally arrives', async () => {
  const r = rig();
  await r.input.connect(r.hid);
  r.time(PRESSURE_SILENT_MS_ADAPTATION + 1);
  expect(r.input.status()).toBe('silent');
  r.triangle(0);
  expect(r.input.status()).toBe('reports');
});

it('reports -> pressure on a face button strictly between 0 and 1 (Triangle 51/255)', async () => {
  const r = rig();
  await r.input.connect(r.hid);
  r.triangle(0);
  expect(r.input.status()).toBe('reports');
  r.triangle(51);
  expect(r.input.status()).toBe('pressure');
  r.triangle(0);
  expect(r.input.status()).toBe('pressure'); // seen stays seen for this connection
});

it('a full 255 press alone is digital: it does not count as pressure', async () => {
  const r = rig();
  await r.input.connect(r.hid);
  r.triangle(255);
  expect(r.input.status()).toBe('reports');
});

it('disconnect gives none again, and a new connection starts from waiting', async () => {
  const r = rig();
  await r.input.connect(r.hid);
  r.triangle(51);
  expect(r.input.status()).toBe('pressure');
  await r.input.disconnect();
  expect(r.input.status()).toBe('none');
  r.time(50_000);
  await r.input.connect(r.hid);
  expect(r.input.status()).toBe('waiting');
});

it('Connect runs the wired DS3 start sequence once, in order: read 0xF2, read 0xF5, write one byte (report ID 0xF5)', async () => {
  const r = rig();
  expect(await r.input.connect(r.hid)).toBe(true);
  expect(r.calls.log.map((c) => `${c.kind}:${c.id.toString(16)}`)).toEqual(['receiveFeatureReport:f2', 'receiveFeatureReport:f5', 'sendReport:f5']);
  const out = r.calls.log[2]!;
  expect(out.kind === 'sendReport' && out.data).toBeInstanceOf(Uint8Array);
  expect(out.kind === 'sendReport' && out.data.byteLength).toBe(0);
});

it('nothing else is sent: no feature report is ever sent, and later activity sends nothing more', async () => {
  const r = rig();
  await r.input.connect(r.hid);
  r.triangle(51);
  r.time(PRESSURE_SILENT_MS_ADAPTATION * 2);
  r.input.status();
  r.input.read();
  await r.input.disconnect();
  expect(r.calls.feature).toBe(0);
  expect(r.calls.log).toHaveLength(3);
});

it('starting while the sequence runs, then waiting once it is done', async () => {
  const r = rig({ hold: true });
  const done = r.input.connect(r.hid);
  await flush();
  expect(r.input.status()).toBe('starting');
  r.release();
  expect(await done).toBe(true);
  expect(r.input.status()).toBe('waiting');
});

it('connecting while the browser chooser is open, none again if nothing is chosen', async () => {
  const r = rig({ holdChooser: true });
  const done = r.input.connect(r.hid);
  await flush();
  expect(r.input.status()).toBe('connecting');
  r.openChooser();
  await done;
  expect(r.input.status()).toBe('waiting');
});

it('a throwing receiveFeatureReport keeps the device open, connect true, and the status reaches silent by the timeout', async () => {
  const r = rig({ failReceive: true });
  r.time(1000);
  expect(await r.input.connect(r.hid)).toBe(true);
  expect(r.input.status()).toBe('waiting');
  r.time(1000 + PRESSURE_SILENT_MS_ADAPTATION);
  expect(r.input.status()).toBe('silent');
  expect(r.calls.feature).toBe(0);
});

it("a start sequence that never settles: connect goes on after the start timeout, and the abandoned sequence sends nothing more (the delta review's findings)", async () => {
  expect(PRESSURE_START_TIMEOUT_MS_ADAPTATION).toBe(2000);
  const r = rig({ hold: true });                             // receiveFeatureReport(0xF2) waits on a gate never released here
  r.time(1000);
  expect(await r.input.connect(r.hid)).toBe(true);           // resolved by the real 2 s race, not by the sequence
  expect(r.input.status()).toBe('waiting');                  // not left on 'starting'
  expect(r.calls.log).toEqual([{ kind: 'receiveFeatureReport', id: 0xf2 }]);
  r.release();                                               // the hung read finally settles...
  await flush(); await flush();
  expect(r.calls.log).toEqual([{ kind: 'receiveFeatureReport', id: 0xf2 }]);   // ...and nothing more is read or sent
  expect(r.calls.feature).toBe(0);
}, 10_000);

it('a throwing sendReport likewise: connect true, silent by the timeout', async () => {
  const r = rig({ failSend: true });
  expect(await r.input.connect(r.hid)).toBe(true);
  r.time(PRESSURE_SILENT_MS_ADAPTATION);
  expect(r.input.status()).toBe('silent');
});

it('a report that arrives after a failed start still reads', async () => {
  const r = rig({ failReceive: true });
  await r.input.connect(r.hid);
  r.triangle(51);
  expect(r.input.status()).toBe('pressure');
});
