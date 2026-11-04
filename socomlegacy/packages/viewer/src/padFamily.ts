import { padVendorProduct } from './padKnownLayouts';

/**
 * Which family a pad belongs to, from the id the browser reports (OBF-9; product track, a browser adaptation with no
 * original). One reading for every prompt that names a pad's buttons, so a pad over Bluetooth is the same family as the
 * same pad on a cable: Chromium and Firefox give a Bluetooth pad another product number (and, for a Microsoft pad, often
 * the bare name "Controller"), so the name alone is not enough -- the USB vendor decides first (Sony 054c, Microsoft 045e),
 * then the name.
 */
export type PadFamily = 'playstation' | 'xbox' | 'other';

const SONY_VENDOR = '054c';
const MICROSOFT_VENDOR = '045e';

export function padFamily(id: string): PadFamily {
  const vp = padVendorProduct(id);
  if (vp?.vendor === SONY_VENDOR) return 'playstation';
  if (vp?.vendor === MICROSOFT_VENDOR) return 'xbox';
  if (/xbox|xinput/i.test(id)) return 'xbox';
  if (/dualshock|dualsense|playstation|sony/i.test(id)) return 'playstation';
  return 'other';
}
