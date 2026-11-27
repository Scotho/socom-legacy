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
/** DS3-PRESSURE (f) (a browser adaptation): the last input report's ID, its payload's length and first eight bytes in hex. */
export interface PressureDiagnostics { reportId: number; length: number; head: string }
export const PRESSURE_PAD_INDEX = 65536;

interface ReportEvent { reportId: number; data: DataView }
interface HidDevice {
  vendorId: number; productId: number; opened: boolean;
  open(): Promise<void>; close(): Promise<void>;
  receiveFeatureReport(reportId: number): Promise<DataView>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  addEventListener(type: 'inputreport', cb: (e: ReportEvent) => void): void;
  removeEventListener(type: 'inputreport', cb: (e: ReportEvent) => void): void;
}
interface HidAccess {
  requestDevice(o: { filters: { vendorId: number; productId: number }[] }): Promise<HidDevice[]>;
  addEventListener(type: 'disconnect', cb: (e: { device: HidDevice }) => void): void;
  removeEventListener(type: 'disconnect', cb: (e: { device: HidDevice }) => void): void;
}

/**
 * PAD-DS3 (a browser adaptation, OT.R28; no original): how long a connected pad may send no input report before the
 * Connect row calls it silent -- "listed but silent", LATER 1117. Three seconds is long enough for a pad that streams
 * at USB rates (a report every few ms) to have spoken, and short enough that a player is not left waiting. It only
 * changes a line of words; nothing of the game.
 */
export const PRESSURE_SILENT_MS_ADAPTATION = 3000;
/**
 * PAD-DS3 (a browser adaptation, no original; the review's finding 3): the longest the DS3 start sequence
 * (`startDualShock3`) may take on Connect before connect goes on without it -- a feature read that never settles must not
 * leave the row on "waking the controller..." for ever.
 */
export const PRESSURE_START_TIMEOUT_MS_ADAPTATION = 2000;
/**
 * DS3-PRESSURE (b) (product track; a browser adaptation, OT.R28 -- no original, nothing of the game): how many Triangle or
 * R1 presses (each counted once its pressure byte reaches `PRESSURE_UNREADABLE_FIRM_BYTE_ADAPTATION`, re-armed under
 * `PRESSURE_UNREADABLE_REARM_BYTE_ADAPTATION`; `pressureButtonOrder`'s pairs) whose button order stays unknown the reader
 * takes before the Connect row says 'unreadable'. A Sony pad or the tested adapter settles its order on its first press
 * (research 373 §4), so a handful of firm presses that settle nothing means a report this reader cannot read; eight is
 * small enough that a player trying a few presses reaches it, and large enough that a press or two caught mid-report does
 * not. A player who only ever touches lightly is never told (the price of never blaming a factory pad). It only changes a
 * line of words.
 */
export const PRESSURE_UNREADABLE_PRESSES_ADAPTATION = 8;
/**
 * DS3-PRESSURE (b), review F2: an undecided press counts only once its Triangle or R1 pressure byte reaches this (of 255):
 * a press firm enough that a DualShock 3's own digital bit is set with it, so a factory pad touched lightly eight times
 * (its bit has a threshold above zero pressure, research 373 section 2) is never blamed on a driver. A browser measure.
 */
export const PRESSURE_UNREADABLE_FIRM_BYTE_ADAPTATION = 0xc0;
/**
 * DS3-PRESSURE (b), re-review F1: a counted press re-arms once both bytes fall under this, not only at exactly 0, so a pad
 * or driver whose bytes rest a little above 0 still counts each firm press (a field resting at 0x40 or above never
 * re-arms: the count stops at one, quietly, and the readout still shows the bytes). Well under the firm byte, so it adds
 * no false count. A browser measure.
 */
export const PRESSURE_UNREADABLE_REARM_BYTE_ADAPTATION = 0x40;
/**
 * The Connect row's state (PAD-DS3): none (not connected); connecting (the browser's chooser is open, or the device is
 * opening); starting (opened, the start sequence is running); waiting (connected, no report yet, inside the silent time);
 * silent (connected, no report within it); reports (reports arrive, no partial face press seen yet, or the button order
 * is not identified); pressure (a face button read strictly between 0 and 1 -- a real partial press); unreadable
 * (DS3-PRESSURE (b): the last report was not report 1 of 48 bytes, or `PRESSURE_UNREADABLE_PRESSES_ADAPTATION` Triangle /
 * R1 presses left the button order unknown -- most likely a driver that changes the report).
 */
export type PressureLinkStatus = 'none' | 'connecting' | 'starting' | 'waiting' | 'silent' | 'reports' | 'pressure' | 'unreadable';

/**
 * PAD-DS3 part 1 (a browser adaptation, OT.R28; granted by the owner, 2026-11-23, relayed by the main controller). The
 * wired DualShock 3's USB start, as SDL does it: SDL_hidapi_ps3.c, `HIDAPI_DriverPS3_InitDevice`, the `!is_bluetooth`
 * branch, "Set the controller into report mode over USB": read feature report 0xF2, read feature report 0xF5, then write
 * a one-byte output report -- the report ID (0xF5) only, which is what SDL's one-byte `SDL_hid_write` carries under
 * hidapi's convention. Nothing else is sent: no LED, no rumble, no 0xF4 (Bluetooth only in SDL), no feature report.
 * A reading, not yet run on a physical DS3 (the owner's test, 2026-11-24). Any step may throw; the caller keeps going.
 * `stillWanted` (the delta review's finding): asked before each later step, so a sequence the caller has given up on
 * (its timeout passed, or the pad was disconnected or replaced) sends nothing more -- above all not the output report.
 */
export async function startDualShock3(device: Pick<HidDevice, 'receiveFeatureReport' | 'sendReport'>, stillWanted: () => boolean = () => true): Promise<void> {
  await device.receiveFeatureReport(0xf2);
  if (!stillWanted()) return;
  await device.receiveFeatureReport(0xf5);
  if (!stillWanted()) return;
  await device.sendReport(0xf5, new Uint8Array(0));
}

/** One explicit connection per page. Only the start sequence above is ever sent; no background permission requests. */
export class PressurePad {
  private connectedAt = -1;
  private gotReport = false;
  private pressureSeen = false;
  private device: HidDevice | null = null;
  private access: HidAccess | null = null;
  private frame: PadLike | null = null;
  private at = 0;
  private connecting = false;
  private starting = false;
  private needsRest = false;
  private order: PressureButtonOrder | null = null;
  /** DS3-PRESSURE (b): the last report was not report 1 of 48 bytes; Triangle / R1 presses that settled no order; one is down. */
  private shapeBad = false;
  private undecided = 0;
  private undecidedDown = false;
  /** DS3-PRESSURE (f): the last report's readout (`diagnostics`); null before one. */
  private last: PressureDiagnostics | null = null;
  constructor(private readonly clock: () => number = () => performance.now()) {}
  /** PAD-DS3: read-only; the Connect row's state. It sends nothing. */
  status(): PressureLinkStatus {
    if (this.starting && this.device?.opened) return 'starting';
    if (this.connecting) return 'connecting';
    if (!this.device?.opened) return 'none';
    if (!this.order && (this.shapeBad || this.undecided >= PRESSURE_UNREADABLE_PRESSES_ADAPTATION)) return 'unreadable';
    if (this.pressureSeen) return 'pressure';
    if (this.gotReport) return 'reports';
    return this.clock() - this.connectedAt >= PRESSURE_SILENT_MS_ADAPTATION ? 'silent' : 'waiting';
  }
  /** DS3-PRESSURE (f): read-only; the last report's ID, length and first eight bytes, or null. It sends nothing. */
  diagnostics(): PressureDiagnostics | null { return this.last; }
  private report = (e: ReportEvent): void => {
    this.gotReport = true;
    const n = Math.min(8, e.data.byteLength);
    this.last = { reportId: e.reportId, length: e.data.byteLength,
      head: Array.from({ length: n }, (_, i) => e.data.getUint8(i).toString(16).padStart(2, '0')).join(' ') };
    // DS3-PRESSURE (b): a report of another shape is dropped (as `pressureReport` would) and said ('unreadable').
    this.shapeBad = e.reportId !== 1 || e.data.byteLength !== 48;
    if (this.shapeBad) return;
    this.order ??= pressureButtonOrder(e.reportId, e.data);
    // Until identified, keep the connected identity neutral rather than guessing and triggering another action.
    if (!this.order) {
      // DS3-PRESSURE (b): a Triangle (21) or R1 (20) press that settled no order counts once, when its pressure byte reaches
      // PRESSURE_UNREADABLE_FIRM_BYTE_ADAPTATION (a light touch under the pad's digital threshold never counts); it re-arms
      // once both fall under PRESSURE_UNREADABLE_REARM_BYTE_ADAPTATION (a pad resting at 1-2 still re-arms).
      const peak = Math.max(e.data.getUint8(21), e.data.getUint8(20));
      if (peak >= PRESSURE_UNREADABLE_FIRM_BYTE_ADAPTATION && !this.undecidedDown) { this.undecided++; this.undecidedDown = true; }
      if (peak < PRESSURE_UNREADABLE_REARM_BYTE_ADAPTATION) this.undecidedDown = false;
      return;
    }
    const frame = pressureReport(e.reportId, e.data, this.order);
    if (frame) {
      const now = this.clock();
      // Face buttons (Cross, Circle, Square, Triangle) strictly between 0 and 1: a real partial press. Not
      // `pressureDetect`'s 0.05..0.95 band (it would import this module's ids back: a cycle); a light press under 0.05 counts.
      if (frame.buttons.slice(0, 4).some((b) => b.value > 0 && b.value < 1)) this.pressureSeen = true;
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
      this.connectedAt = this.clock(); this.gotReport = false; this.pressureSeen = false;
      device.addEventListener('inputreport', this.report);
      access.addEventListener('disconnect', this.lost);
      // PAD-DS3 part 1: the start sequence, once, after open() and with the listeners already on so no report is missed.
      // A failure is not fatal: the device stays open and, if nothing arrives, the status reaches 'silent' by the timeout.
      this.starting = true;
      // The review's finding 3: a feature read that never settles must not hold 'starting' (and `connecting`) for ever --
      // the sequence races PRESSURE_START_TIMEOUT_MS_ADAPTATION; on the timeout connect goes on, and silence says the rest.
      let timer: ReturnType<typeof setTimeout> | undefined;
      // The delta review's finding: once the race is over (done, failed or timed out) or this device is no longer the
      // connected one, a still-running sequence sends nothing more (`startDualShock3`'s stillWanted).
      let wanted = true;
      try {
        await Promise.race([
          startDualShock3(device, () => wanted && this.device === device),
          new Promise<void>((done) => { timer = setTimeout(done, PRESSURE_START_TIMEOUT_MS_ADAPTATION); }),
        ]);
      } catch { /* the pad may still stream; silence says so after the timeout */ } finally { clearTimeout(timer); wanted = false; }
      this.starting = false;
      // The silent time runs from the end of the sequence, so a slow start is not counted as silence.
      if (this.device === device) this.connectedAt = this.clock();
      return true;
    } finally { this.connecting = false; this.starting = false; }
  }
  async disconnect(): Promise<void> {
    const device = this.device;
    this.device = null; this.frame = null; this.needsRest = false; this.order = null;
    this.connectedAt = -1; this.gotReport = false; this.pressureSeen = false;
    this.shapeBad = false; this.undecided = 0; this.undecidedDown = false; this.last = null;
    this.access?.removeEventListener('disconnect', this.lost); this.access = null;
    if (!device) return;
    device.removeEventListener('inputreport', this.report);
    try { if (device.opened) await device.close(); } catch { /* unplugged already */ }
  }
}
export const pressurePad = new PressurePad();
