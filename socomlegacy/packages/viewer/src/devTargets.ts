/**
 * Places the test room can stand the player (`./devPanel`): the measured spawns, the disc's slots, the escortee
 * starts, the extraction points and the bomb start when the map has one. A browser adaptation, a development
 * instrument with no original. It names points the map already holds; it does not invent an objective. Nothing
 * moves until a place is chosen, and while the panel is closed, the game's clock and ammo are main's; only the drawing overlays may stay.
 */
import { mayEnter, type FlyAccess } from './flyAccess';

export interface DevPlace {
  id: string;
  label: string;
  at: readonly [number, number, number];
  /** Degrees. Null keeps the facing the page already has. */
  yaw: number | null;
}

export interface DevSlot {
  side: 0 | 1;
  index: number;
  position: readonly [number, number, number];
  facing: readonly [number, number];
}

export interface DevEscortee {
  name?: string;
  at: readonly [number, number, number];
  yaw: number;
}

export interface DevPlaceInput {
  spawns: { a: readonly number[]; b: readonly number[] } | null;
  slots: readonly DevSlot[];
  escortees: readonly DevEscortee[];
  extraction: readonly (readonly [number, number, number])[];
  bomb: readonly [number, number, number] | null;
}

/** A slot's facing `(sin θ, -cos θ)` as degrees (`facingVector`). */
export function slotYaw(facing: readonly [number, number]): number {
  return Math.atan2(facing[0], -facing[1]) * 180 / Math.PI;
}

function xyz(p: readonly number[]): readonly [number, number, number] | null {
  if (p.length < 3 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) return null;
  return [p[0]!, p[1]!, p[2]!];
}

export function devPlaces(input: DevPlaceInput): DevPlace[] {
  const out: DevPlace[] = [];
  const a = input.spawns ? xyz(input.spawns.a) : null;
  const b = input.spawns ? xyz(input.spawns.b) : null;
  if (a) out.push({ id: 'spawn-a', label: 'Spawn A', at: a, yaw: null });
  if (b) out.push({ id: 'spawn-b', label: 'Spawn B', at: b, yaw: null });
  for (const slot of input.slots) {
    const at = xyz(slot.position);
    if (!at) continue;
    out.push({
      id: `slot-${slot.side}-${slot.index}`,
      label: `${slot.side === 0 ? 'A' : 'B'} slot ${slot.index + 1}`,
      at, yaw: slotYaw(slot.facing),
    });
  }
  input.escortees.forEach((e, i) => {
    const at = xyz(e.at);
    if (!at) return;
    out.push({ id: `hostage-${i}`, label: e.name ? `Hostage ${e.name}` : `Hostage ${i + 1}`, at, yaw: Number.isFinite(e.yaw) ? e.yaw : null });
  });
  input.extraction.forEach((p, i) => {
    const at = xyz(p);
    if (!at) return;
    out.push({ id: `extraction-${i}`, label: `Extraction ${i + 1}`, at, yaw: null });
  });
  const bomb = input.bomb ? xyz(input.bomb) : null;
  if (bomb) out.push({ id: 'bomb', label: 'Bomb', at: bomb, yaw: null });
  return out;
}

/** Walk when the page may stand, otherwise the free camera. */
export function planPointPlace(mode: 'walk' | 'fly', play: boolean, access: Pick<FlyAccess, 'toggle'>): 'walk' | 'camera' {
  return mode === 'walk' || mayEnter('walk', play, access) ? 'walk' : 'camera';
}

export interface XzBounds { minX: number; maxX: number; minZ: number; maxZ: number }

/** The xz extent of the points, padded, or null when none are finite. A single point still has a span. */
export function boundsOf(points: readonly (readonly number[])[]): XzBounds | null {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, n = 0;
  for (const p of points) {
    if (p.length < 3 || !Number.isFinite(p[0]) || !Number.isFinite(p[2])) continue;
    minX = Math.min(minX, p[0]!); maxX = Math.max(maxX, p[0]!);
    minZ = Math.min(minZ, p[2]!); maxZ = Math.max(maxZ, p[2]!);
    n += 1;
  }
  if (n === 0) return null;
  if (maxX - minX < 1) { minX -= 1; maxX += 1; }
  if (maxZ - minZ < 1) { minZ -= 1; maxZ += 1; }
  const dx = (maxX - minX) * 0.05, dz = (maxZ - minZ) * 0.05;
  return { minX: minX - dx, maxX: maxX + dx, minZ: minZ - dz, maxZ: maxZ + dz };
}

/** The rect inside a canvas that shows `bounds` at one scale for x and z, centered. The leftover axis is empty. */
export function minimapFrame(bounds: XzBounds, width: number, height: number): { x: number; y: number; w: number; h: number } | null {
  const dx = bounds.maxX - bounds.minX, dz = bounds.maxZ - bounds.minZ;
  if (![width, height, dx, dz, bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].every((n) => Number.isFinite(n))) return null;
  if (!(width > 0) || !(height > 0) || !(dx > 0) || !(dz > 0)) return null;
  const scale = Math.min(width / dx, height / dz);
  const w = dx * scale, h = dz * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

/**
 * A click on the minimap, in canvas pixels. The top of the frame is max z. A pixel in the empty margin is null,
 * so the click is not stretched to the canvas edge.
 */
export function minimapHit(bounds: XzBounds, px: number, py: number, width: number, height: number): { x: number; z: number } | null {
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  const frame = minimapFrame(bounds, width, height);
  if (!frame) return null;
  if (px < frame.x || py < frame.y || px > frame.x + frame.w || py > frame.y + frame.h) return null;
  const u = (px - frame.x) / frame.w, v = (py - frame.y) / frame.h;
  return { x: bounds.minX + u * (bounds.maxX - bounds.minX), z: bounds.maxZ - v * (bounds.maxZ - bounds.minZ) };
}

/**
 * The floor a minimap click stands on. Every height in the column is a candidate: the one nearest `feet`, the higher
 * one when two are the same distance, and the highest when `feet` is not a number. Null when the column has no floor.
 * The walk's own pick (`selectFloor`) is not this: it refuses a floor more than 20 over the feet, so a click uphill
 * was ignored.
 */
export function nearestFloor(heights: readonly number[], feet: number): number | null {
  let best: number | null = null, bestD = Infinity, highest = -Infinity, any = false;
  for (const y of heights) {
    if (!Number.isFinite(y)) continue;
    any = true;
    if (y > highest) highest = y;
    if (!Number.isFinite(feet)) continue;
    const d = Math.abs(y - feet);
    if (best === null || d < bestD || (d === bestD && y > best)) { best = y; bestD = d; }
  }
  if (!any) return null;
  return best ?? highest;
}

/** The y of the nearest place, or `fallback` when there is none. */
export function heightNear(points: readonly (readonly number[])[], x: number, z: number, fallback: number): number {
  let best = fallback, bestD = Infinity;
  for (const p of points) {
    if (p.length < 3 || !Number.isFinite(p[1])) continue;
    const d = (p[0]! - x) ** 2 + (p[2]! - z) ** 2;
    if (d < bestD) { bestD = d; best = p[1]!; }
  }
  return best;
}
