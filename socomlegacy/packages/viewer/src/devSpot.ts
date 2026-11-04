/**
 * A developer link back to one spot (`./devPanel`). `at` and `yaw` are extra parameters, beside the share table
 * (`./shareUrl`): that table stays `mode`, `map`, `view` and `online`, and these two pass through it the way
 * `devmode` does. A browser adaptation, a development instrument with no original: a link without `at` places
 * nothing, and while the panel is closed, the game's clock and ammo are main's; only the drawing overlays may stay.
 */
import { writeShare } from './shareUrl';

export interface DevSpot { x: number; y: number; z: number; yaw: number }

const NUM = /^-?\d+(?:\.\d+)?$/;

function isNum(s: string): boolean {
  return NUM.test(s);
}

function round(n: number, places: number): number {
  const v = Math.round(n * 10 ** places) / 10 ** places;
  return Object.is(v, -0) ? 0 : v;
}

/** `at` and `yaw` as written, or null when the spot is not four finite numbers. Position to 0.01, facing to 0.1. */
export function formatDevSpot(spot: DevSpot): { at: string; yaw: string } | null {
  if (![spot.x, spot.y, spot.z, spot.yaw].every((n) => Number.isFinite(n))) return null;
  return { at: [round(spot.x, 2), round(spot.y, 2), round(spot.z, 2)].join(','), yaw: String(round(spot.yaw, 1)) };
}

/** The spot an address names, or null when `at` or `yaw` is missing or not a plain number. */
export function readDevSpot(search: string): DevSpot | null {
  let q: URLSearchParams;
  try { q = new URLSearchParams(search); } catch { return null; }
  const at = q.get('at');
  const yawRaw = q.get('yaw');
  if (at === null || yawRaw === null) return null;
  const parts = at.split(',');
  if (parts.length !== 3 || !parts.every(isNum) || !isNum(yawRaw)) return null;
  const [x, y, z] = parts.map(Number);
  const yaw = Number(yawRaw);
  if (![x!, y!, z!, yaw].every((n) => Number.isFinite(n))) return null;
  return { x: x!, y: y!, z: z!, yaw };
}

function keyOf(part: string): string {
  const raw = part.split('=')[0]!.replace(/\+/g, ' ');
  try { return decodeURIComponent(raw); } catch { return raw; }
}

/**
 * The query with `at` and `yaw` replaced. By hand, as `writeShare` is, so a bare flag stays bare.
 * Null when the spot cannot be written.
 */
export function writeDevSpot(search: string, spot: DevSpot): string | null {
  const formatted = formatDevSpot(spot);
  if (!formatted) return null;
  const rest = search.replace(/^\?/, '').split('&').filter((p) => p !== '' && keyOf(p) !== 'at' && keyOf(p) !== 'yaw');
  return `?${[...rest, `at=${formatted.at}`, `yaw=${formatted.yaw}`].join('&')}`;
}

/**
 * The share table's mode and map, then this spot. `archive` null leaves the address's map alone.
 * Null when the spot cannot be written.
 */
export function devSpotSearch(search: string, play: boolean, archive: string | null, spot: DevSpot): string | null {
  return writeDevSpot(writeShare(search, { play, map: archive ?? undefined }), spot);
}
