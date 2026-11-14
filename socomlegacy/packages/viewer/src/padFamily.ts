import { padVendorProduct } from './padKnownLayouts';

/**
 * Which family a pad belongs to, from the id the browser reports (OBF-9; product track, a browser adaptation with no
 * original). One reading for every prompt that names a pad's buttons, so a pad over Bluetooth is the same family as the
 * same pad on a cable: Chromium and Firefox give a Bluetooth pad another product number (and, for a Microsoft pad, often
 * the bare name "Controller"), so the name alone is not enough -- the USB vendor decides first (Sony 054c, Microsoft 045e),
 * then the name.
 */
export type PadFamily = 'playstation' | 'xbox' | 'steam' | 'steam-deck' | 'other';

const SONY_VENDOR = '054c';
const MICROSOFT_VENDOR = '045e';
/** Identity only, never a raw input map. SDL's Valve product entries, read 2026-11-10:
 * https://github.com/libsdl-org/SDL/blob/main/src/joystick/controller_list.h
 * 11ff is an emulated controller of unknown physical type and is deliberately excluded.
 */
const VALVE_VENDOR = '28de';
const STEAM_CONTROLLER_PRODUCTS = new Set(['1101', '1102', '1105', '1106', '1142', '1201', '1202', '1302', '1303', '1304', '1305']);

export function padFamily(id: string): PadFamily {
  const vp = padVendorProduct(id);
  if (vp?.vendor === SONY_VENDOR) return 'playstation';
  if (vp?.vendor === MICROSOFT_VENDOR) return 'xbox';
  if (vp?.vendor === VALVE_VENDOR) {
    if (vp.product === '1205') return 'steam-deck';
    if (STEAM_CONTROLLER_PRODUCTS.has(vp.product)) return 'steam';
  }
  if (/\bsteam[\s_-]*deck\b/i.test(id)) return 'steam-deck';
  if (/\bsteam[\s_-]*controller\b/i.test(id)) return 'steam';
  if (/xbox|xinput/i.test(id)) return 'xbox';
  if (/dualshock|dualsense|playstation|sony/i.test(id)) return 'playstation';
  return 'other';
}
