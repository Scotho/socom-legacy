import type { PadLike } from './gamepad';
import { PRESSURE_PAD_ID } from './pressurePad';

/**
 * PS2P (the owner, 2026-11-01, via seat 5d: "if you think feasible to auto-detect pressure sensitive controllers, and when
 * we do, default to the new separate mode we have with the two states bound"): which pads give their face buttons'
 * pressure. A browser adaptation (OT.R28), nothing of the game: what a pad does with it is the reader's
 * (`./controllerInput` `StancePress`, in SEPARATE only) and the stance is B193's lanes'.
 *
 * A pad is pressure-capable when either
 * - it is the WebHID 054c:0268 reader's pad (`./pressurePad`, Chromium only: WebHID is not in Firefox or Safari) and its
 *   Triangle reads strictly between its ends on `PRESSURE_HID_FRAMES` or more reports of one press -- the reader
 *   hands every pad of that USB identity the same pad, and a pressure byte that only ever reads 0 or 255 is a digital
 *   adapter's; or
 * - a Gamepad API pad of the standard mapping reads a face button (Cross, Circle, Square, Triangle: 0-3) strictly between
 *   `PRESSURE_FACE_LOW` and `PRESSURE_FACE_HIGH` -- the cheap check. L2 / R2 (6 / 7) are analog on nearly every pad and
 *   never count, nor does a pad of another mapping (its buttons' order is not known).
 * The detection is the pad's id's for the page's life (a pad back at another index is the same model).
 */
export const PRESSURE_FACE_LOW = 0.05;
export const PRESSURE_FACE_HIGH = 0.95;
export const PRESSURE_HID_FRAMES = 2;
/** The console's line when the auto default set SEPARATE (SEP-SHOW's `TOUCHPAD_CROUCH_TOAST`'s style). */
export const PRESSURE_SEPARATE_TOAST = 'Pressure controller: Crouch and Prone bound to Triangle';

const FACE = [0, 1, 2, 3] as const;
const TRIANGLE = 3;
const between = (v: number | undefined): boolean => v !== undefined && v > PRESSURE_FACE_LOW && v < PRESSURE_FACE_HIGH;

export class PressureDetector {
  private readonly found = new Set<string>();
  /** The WebHID pad's press under way: the last report seen (a report read by two readers is one) and its count. */
  private hidSeen: unknown = null;
  private hidFrames = 0;

  /** The pad is pressure-capable (seen so already). */
  capable(pad: PadLike | null | undefined): boolean { return !!pad && this.found.has(pad.id); }

  /** One read of `pad`: answers true on the read it is first found pressure-capable, false otherwise. */
  observe(pad: PadLike | null | undefined): boolean {
    if (!pad || this.found.has(pad.id) || pad.mapping !== 'standard') return false;
    let capable = false;
    if (pad.id === PRESSURE_PAD_ID) {
      if (pad === this.hidSeen) return false;
      this.hidSeen = pad;
      const v = pad.buttons[TRIANGLE]?.value ?? 0;
      if (v <= 0) this.hidFrames = 0;
      else if (v < 1) this.hidFrames += 1;
      capable = this.hidFrames >= PRESSURE_HID_FRAMES;
    } else capable = FACE.some((b) => between(pad.buttons[b]?.value));
    if (capable) this.found.add(pad.id);
    return capable;
  }

  /** Forgets every detection and the pending default (the tests'). */
  clear(): void { this.found.clear(); this.hidSeen = null; this.hidFrames = 0; pending = null; }
}

/** The page's one detector: the menus' reader and the match's share what was seen. */
export const pressureDetector = new PressureDetector();

let pending: PadLike | null = null;
/**
 * PS2P fold (seat 5d, 2026-11-01: "The mode must never change under the player in a match"): a pad first detected with
 * no Stance mode stored is only recorded here, by whichever reader saw it (the match's among them); the front end's
 * console applies it at its next frame (`./controllerInput` `applyPressureDefault`, `ConsoleController.remapFrame`).
 */
export function recordPressureDefault(pad: PadLike): void { pending = pad; }
/** The pad whose default waits for the menus, or null. */
export function pendingPressureDefault(): PadLike | null { return pending; }
/** Takes the pending default (it is applied or dropped once). */
export function takePressureDefault(): PadLike | null { const p = pending; pending = null; return p; }

/**
 * The Button mapping's "Connect USB pressure controller" row is offered: WebHID is there (`navigator.hid`: Chromium) and
 * a connected Gamepad API pad names USB vendor 054c, product 0268 in its id (Chromium: "Vendor: 054c Product: 0268";
 * Firefox: "054c-0268-").
 */
export function pressureConnectOffered(pads: readonly PadLike[], nav: unknown = globalThis.navigator): boolean {
  if (!(nav as { hid?: unknown } | undefined)?.hid) return false;
  return pads.some((p) => p.id !== PRESSURE_PAD_ID && /054c/i.test(p.id) && /0268/.test(p.id));
}
