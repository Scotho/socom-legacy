import type { PadLike } from './gamepad';
import { STANDARD_AXIS_COUNT, STANDARD_BUTTON_COUNT, type PadLayout, type RawSource } from './padLayout';

/**
 * Layouts known without a pass (product track, a browser adaptation with no original; LATER 380's layouts, built in):
 * a pad the browser reads without the standard mapping, recognised by its USB vendor and product and its shape, is read
 * as a standard pad at once. A layout taught by press on the pad's profile comes first (`./controllerInput`). Each entry
 * is a real pad's report, its source named; nothing is guessed for a pad no one has reported.
 */

/** The USB vendor and product in a pad's id: Chromium's "(Vendor: 3537 Product: 1082)", Firefox's "3537-1082-". */
export function padVendorProduct(id: string): { vendor: string; product: string } | null {
  const chromium = /Vendor:\s*([0-9a-f]{4})\s+Product:\s*([0-9a-f]{4})/i.exec(id);
  if (chromium) return { vendor: chromium[1]!.toLowerCase(), product: chromium[2]!.toLowerCase() };
  const firefox = /^([0-9a-f]{1,4})-([0-9a-f]{1,4})-/i.exec(id);
  return firefox ? { vendor: firefox[1]!.toLowerCase().padStart(4, '0'), product: firefox[2]!.toLowerCase().padStart(4, '0') } : null;
}

const HAT = (k: number): RawSource => ({ axis: 9, to: -1 + k * 2 / 7, hat: true });

/**
 * An Xbox-protocol pad on macOS Chromium, read as HID without the standard mapping: fifteen buttons (A 0, B 1, X 3, Y 4,
 * LB 6, RB 7, the triggers' digital twins 8 and 9, View 10, Menu 11, Guide 12, L3 13, R3 14), ten axes (the sticks 0/1
 * and 2/5, the triggers 3/4 from -1, the d-pad a hat on 9). Source: the GameSir-G7 HE for Xbox, a player's diagnostic of
 * 2026-10-28 (the pad support plan's Log), every control pressed alone.
 */
const XBOX_HID_MACOS: PadLayout = (() => {
  const buttons: (RawSource | null)[] = Array.from({ length: STANDARD_BUTTON_COUNT }, () => null);
  buttons[0] = { button: 0 }; buttons[1] = { button: 1 }; buttons[2] = { button: 3 }; buttons[3] = { button: 4 };
  buttons[4] = { button: 6 }; buttons[5] = { button: 7 };
  buttons[6] = { axis: 3, from: -1, to: 1 }; buttons[7] = { axis: 4, from: -1, to: 1 };
  buttons[8] = { button: 10 }; buttons[9] = { button: 11 }; buttons[10] = { button: 13 }; buttons[11] = { button: 14 };
  buttons[12] = HAT(0); buttons[13] = HAT(4); buttons[14] = HAT(6); buttons[15] = HAT(2);
  buttons[16] = { button: 12 };
  const axes = [{ axis: 0, invert: false }, { axis: 1, invert: false }, { axis: 2, invert: false }, { axis: 5, invert: false }];
  return { version: 1, buttons, axes: axes.slice(0, STANDARD_AXIS_COUNT) };
})();

/**
 * OBF-10b (the owner, via seat 20, 2026-10-30: "map controls TO a PlayStation pad's buttons from the menu's rebinding
 * screen", DS4 and DualSense, wired and Bluetooth; taking the layouts from SDL's database "very wise"): a Sony pad the
 * browser reads without the standard mapping. Source: SDL 2.32.10's `src/joystick/SDL_gamecontrollerdb.h` (the copy
 * under the desktop's ps2recomp build, SDL commit 5d249570393f), its DirectInput (Windows) entries -- line 257
 * `030000004c050000c405000000000000` (DS4, 05c4), 258 `...cc09...` (DS4 v2, 09cc), 259 `...e60c...` (DualSense, 0ce6) --
 * and its macOS entries, lines 467-470, all alike: x (Square) b0, a (Cross) b1, b (Circle) b2, y (Triangle) b3,
 * leftshoulder b4, rightshoulder b5, back (Share / Create) b8, start (Options) b9, leftstick b10, rightstick b11, guide
 * (PS) b12; lefttrigger a3, righttrigger a4; leftx a0, lefty a1, rightx a2, righty a5; the d-pad the hat h0.
 *
 * **The one stated assumption** (not a fact; checked on no real pad): DirectInput's and IOKit's button order is the HID
 * button order, and the browsers expose a non-standard pad's buttons in that same order -- so SDL's `b<n>` is the
 * browser's `buttons[n]`. The axes and the hat take only what SDL and the GameSir report above agree on for the same
 * Chromium HID path: the axes by HID usage (X 0, Y 1, Z 2, Rx 3, Ry 4, Rz 5: SDL's a0-a5), the triggers from -1, the hat
 * on axis 9 in Chromium's eighths. Firefox's d-pad form for such a pad (a hat axis, or extra buttons) is not sourced: a
 * report with fewer than ten axes has no hat on 9 and is left to the teach pass. Line 490 -- itself a macOS entry (09cc,
 * GUID version 0000, beside line 469's 0001) -- maps 09cc's back to b13. Share is b8: line 257 names b13 the touchpad
 * (`touchpad:b13`), and every other Sony line (258, 259, 467-470) gives back b8.
 * The touchpad (b13) is not in the standard layout's seventeen. A wrong entry is undone by Teach again (the mapping
 * screen's, `./console/render/remap`): a taught layout comes first (`./controllerInput` `layout`).
 */
const SONY_HID: PadLayout = (() => {
  const buttons: (RawSource | null)[] = Array.from({ length: STANDARD_BUTTON_COUNT }, () => null);
  buttons[0] = { button: 1 }; buttons[1] = { button: 2 }; buttons[2] = { button: 0 }; buttons[3] = { button: 3 };
  buttons[4] = { button: 4 }; buttons[5] = { button: 5 };
  buttons[6] = { axis: 3, from: -1, to: 1 }; buttons[7] = { axis: 4, from: -1, to: 1 };
  buttons[8] = { button: 8 }; buttons[9] = { button: 9 }; buttons[10] = { button: 10 }; buttons[11] = { button: 11 };
  buttons[12] = HAT(0); buttons[13] = HAT(4); buttons[14] = HAT(6); buttons[15] = HAT(2);
  buttons[16] = { button: 12 };
  const axes = [{ axis: 0, invert: false }, { axis: 1, invert: false }, { axis: 2, invert: false }, { axis: 5, invert: false }];
  return { version: 1, buttons, axes: axes.slice(0, STANDARD_AXIS_COUNT) };
})();

/**
 * A known pad: its vendor and product, and its shape -- exact (`buttons`, `axes`), or (`atLeast`) the least it must
 * report: the Sony entries' counts are not sourced, so they ask only for the inputs the layout reads (buttons to PS's
 * 12, axes to the hat's 9).
 */
interface Known { vendor: string; product: string; buttons: number; axes: number; atLeast?: boolean; layout: PadLayout; name: string }

/** The known pads; the shape guards a pad's other mode (a switch to DInput or Switch mode reports another shape). */
export const KNOWN_PAD_LAYOUTS: readonly Known[] = [
  { name: 'GameSir-G7 HE for Xbox (macOS Chromium)', vendor: '3537', product: '1082', buttons: 15, axes: 10, layout: XBOX_HID_MACOS },
  // OBF-10b: SDL's DirectInput and macOS entries (above); the shape a minimum.
  { name: 'DUALSHOCK 4 (05c4), without the standard mapping', vendor: '054c', product: '05c4', buttons: 13, axes: 10, atLeast: true, layout: SONY_HID },
  { name: 'DUALSHOCK 4 v2 (09cc), without the standard mapping', vendor: '054c', product: '09cc', buttons: 13, axes: 10, atLeast: true, layout: SONY_HID },
  { name: 'DualSense (0ce6), without the standard mapping', vendor: '054c', product: '0ce6', buttons: 13, axes: 10, atLeast: true, layout: SONY_HID },
];

/** The built-in layout for a pad of another layout, or null when none is known for it. */
export function knownLayout(pad: Pick<PadLike, 'id' | 'mapping' | 'buttons' | 'axes'>): PadLayout | null {
  if (pad.mapping === 'standard') return null;
  const vp = padVendorProduct(pad.id);
  if (!vp) return null;
  const k = KNOWN_PAD_LAYOUTS.find((e) => e.vendor === vp.vendor && e.product === vp.product && (e.atLeast ? pad.buttons.length >= e.buttons && pad.axes.length >= e.axes : e.buttons === pad.buttons.length && e.axes === pad.axes.length));
  return k ? k.layout : null;
}
