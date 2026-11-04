import type { PadLike } from './gamepad';

/** Browser adaptation: Sony 054c:0268 USB reports, independently read through WebHID.
 * SDL HIDAPI PS3 HandleStatePacket / button_axis_offsets (research 373 §2).
 * WebHID separates report ID 1 from its payload; SDL's offsets include that byte.
 */
export type PressureButtonOrder = 'sony' | 'ps2-adapter';

/** Only identify from an unambiguous pressure/button pair observed on this connection. Research 373 §4.
 * VID/PID alone does not identify the digital layout: the tested adapter and Sony share it.
 */
export function pressureButtonOrder(reportId: number, data: DataView): PressureButtonOrder | null {
  if (reportId !== 1 || data.byteLength !== 48) return null;
  const bits = data.getUint8(1) | (data.getUint8(2) << 8) | (data.getUint8(3) << 16);
  const pairs = [[21, 12, 0], [20, 11, 5]] as const; // Triangle, R1: physical captures and SDL
  let sony = true, adapter = true, observed = false;
  for (const [pressure, sonyBit, adapterBit] of pairs) {
    if (data.getUint8(pressure) === 0) continue;
    observed = true;
    sony &&= !!(bits & (1 << sonyBit));
    adapter &&= !!(bits & (1 << adapterBit));
  }
  return !observed || sony === adapter ? null : sony ? 'sony' : 'ps2-adapter';
}

export function pressureReport(reportId: number, data: DataView, order: PressureButtonOrder = 'sony'): PadLike | null {
  if (reportId !== 1 || data.byteLength !== 48) return null;
  const byte = (i: number): number => data.getUint8(i - 1);
  const bits = byte(2) | (byte(3) << 8) | (byte(4) << 16);
  const bitOf = [14, 13, 15, 12, 10, 11, 8, 9, 0, 3, 1, 2, 4, 6, 7, 5, 16];
  const pressureOf = [24, 23, 25, 22, 20, 21, 18, 19, 0, 0, 0, 0, 14, 16, 17, 15, 0];
  const buttons = bitOf.map((bit, i) => {
    const offset = pressureOf[i]!;
    // The tested adapter's twelve pressure channels retain Sony's order, while its digital bits do not.
    // Read its pressure buttons from those channels; its four digital-only buttons were captured separately.
    const digitalBit = order === 'ps2-adapter' ? ({ 8: 8, 9: 9, 10: 10, 11: 11 } as Record<number, number>)[i] : bit;
    const digital = digitalBit !== undefined && (bits & (1 << digitalBit)) !== 0;
    const value = offset ? byte(offset) / 255 : digital ? 1 : 0;
    return { pressed: order === 'ps2-adapter' && offset !== 0 ? value > 0 : digital, value };
  });
  return { id: PRESSURE_PAD_ID, index: PRESSURE_PAD_INDEX, connected: true, mapping: 'standard', nativePressure: true,
    buttons, axes: [6, 7, 8, 9].map((i) => (byte(i) - 127.5) / 127.5) };
}
export const PRESSURE_PAD_ID = 'PlayStation USB · native pressure';
export const PRESSURE_PAD_INDEX = 65536;

interface ReportEvent { reportId: number; data: DataView }
interface HidDevice {
  vendorId: number; productId: number; opened: boolean;
  open(): Promise<void>; close(): Promise<void>;
  addEventListener(type: 'inputreport', cb: (e: ReportEvent) => void): void;
  removeEventListener(type: 'inputreport', cb: (e: ReportEvent) => void): void;
}
interface HidAccess {
  requestDevice(o: { filters: { vendorId: number; productId: number }[] }): Promise<HidDevice[]>;
  addEventListener(type: 'disconnect', cb: (e: { device: HidDevice }) => void): void;
  removeEventListener(type: 'disconnect', cb: (e: { device: HidDevice }) => void): void;
}

/** One explicit connection per page. No background permission requests or device output reports. */
export class PressurePad {
  private device: HidDevice | null = null;
  private access: HidAccess | null = null;
  private frame: PadLike | null = null;
  private at = 0;
  private connecting = false;
  private needsRest = false;
  private order: PressureButtonOrder | null = null;
  constructor(private readonly clock: () => number = () => performance.now()) {}
  private report = (e: ReportEvent): void => {
    this.order ??= pressureButtonOrder(e.reportId, e.data);
    // Until identified, keep the connected identity neutral rather than guessing and triggering another action.
    if (!this.order) return;
    const frame = pressureReport(e.reportId, e.data, this.order);
    if (frame) {
      const now = this.clock();
      if (this.frame && now - this.at > 250) this.needsRest = true;
      if (frame.buttons.every((b) => !b.pressed && b.value === 0)) this.needsRest = false;
      this.frame = frame; this.at = now;
    }
  };
  private lost = (e: { device: HidDevice }): void => { if (e.device === this.device) void this.disconnect(); };
  read(): PadLike | null {
    // Browser adaptation: stale USB input must not leave movement or fire held after reports stop.
    if (!this.device?.opened) return null;
    if (this.frame && this.clock() - this.at <= 250 && !this.needsRest) return this.frame;
    if (this.frame) this.needsRest = true;
    // Keep its identity present: GamePad must not fall back to another person's device when USB reports pause.
    return { id: PRESSURE_PAD_ID, index: PRESSURE_PAD_INDEX, connected: true, mapping: 'standard', nativePressure: true, stanceCancelled: true,
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
  }
  async connect(access = (globalThis.navigator as unknown as { hid?: HidAccess })?.hid): Promise<boolean> {
    if (!access) throw new Error('This browser does not offer WebHID. Use a browser with USB HID support.');
    if (this.connecting) return false;
    this.connecting = true;
    try {
      const devices = await access.requestDevice({ filters: [{ vendorId: 0x054c, productId: 0x0268 }] });
      const device = devices[0];
      if (!device) return false;
      if (device.vendorId !== 0x054c || device.productId !== 0x0268) throw new Error('Unsupported pressure controller.');
      await this.disconnect();
      await device.open();
      this.device = device; this.access = access;
      device.addEventListener('inputreport', this.report);
      access.addEventListener('disconnect', this.lost);
      return true;
    } finally { this.connecting = false; }
  }
  async disconnect(): Promise<void> {
    const device = this.device;
    this.device = null; this.frame = null; this.needsRest = false; this.order = null;
    this.access?.removeEventListener('disconnect', this.lost); this.access = null;
    if (!device) return;
    device.removeEventListener('inputreport', this.report);
    try { if (device.opened) await device.close(); } catch { /* unplugged already */ }
  }
}
export const pressurePad = new PressurePad();
