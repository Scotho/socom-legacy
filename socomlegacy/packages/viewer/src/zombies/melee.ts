/**
 * Melee reach, facing and a clear lane (`TEST_ROOM_ZOMBIES_ADAPTATION`). Phoenix's swing, not a reading of the original.
 */
import { segmentHit, type Grid } from '@s2u/scene';

export function meleeReach(a: readonly number[], b: readonly number[]): boolean {
  return Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!) <= 13 && Math.abs(a[1]! - b[1]!) < 10;
}

/** A locked swing only connects in front of the zombie. Within 2 units, facing is not required. */
export function meleeFacing(a: readonly number[], b: readonly number[], yaw: number): boolean {
  const dx = b[0]! - a[0]!, dz = b[2]! - a[2]!, distance = Math.hypot(dx, dz);
  return distance < 2 || (-Math.sin(yaw * Math.PI / 180) * dx - Math.cos(yaw * Math.PI / 180) * dz) / distance >= 0.35;
}

/** Every lane of a short swing is clear, including low cover and a door-frame edge. */
export function meleeClear(grid: Grid, a: readonly number[], b: readonly number[]): boolean {
  if (!meleeReach(a, b)) return false;
  const dx = b[0]! - a[0]!, dz = b[2]! - a[2]!, d = Math.hypot(dx, dz) || 1, sx = -dz / d * 3, sz = dx / d * 3;
  return [4, 11, 17].every((h) => [-1, 0, 1].every((side) =>
    !segmentHit(grid, [a[0]! + sx * side, a[1]! + h, a[2]! + sz * side], [b[0]! + sx * side, b[1]! + h, b[2]! + sz * side])));
}
