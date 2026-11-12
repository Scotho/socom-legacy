import type { Grid, SpawnSlot } from '@s2u/scene';
import type { GroundData } from '../mover';
import { standingSpot } from './ground';
import { stepOfYaw } from './matchMap';

/**
 * FG-50 (a browser adaptation, no original): Play from here. The local player stands on the floor under the camera,
 * or under the cursor when the camera has none there, facing the way the camera looks. No floor at either point is
 * null -- the caller keeps the layout's own spawns. `standingSpot`'s last resort (the hull's first polygon) is not
 * a floor under the view, so it is not a stand.
 */

/** Where the editor is looking when Play or Walk is asked. */
export interface ViewStand {
  /** The camera, game units. */
  camera: readonly [number, number, number];
  /** The camera's yaw in radians, the same sense as a spawn marker's (`page.ts` `facing`). */
  yaw: number;
  /** The cursor's place on the world, x and z, when the pointer is over something. */
  cursor: readonly [number, number] | null;
}

/** The unit facing of a step, the same turn `./matchMap` gives a marker. */
function facingOf(step: number): [number, number] {
  const a = (step * Math.PI) / 4;
  return [Math.sin(a) + 0, -Math.cos(a) + 0];
}

/**
 * The floor under the first of `around` that has one at or below `below` (the camera): `standingSpot`'s first hit.
 * A hit that is only the hull's own centre, or a centre above the camera, is not under the view.
 */
export function floorUnder(
  grid: Grid, ground: GroundData, around: readonly (readonly [number, number])[], below: number,
): [number, number, number] | null {
  if (around.length === 0) return null;
  const spot = standingSpot(grid, ground, around, below);
  if (!spot || spot[1] > below) return null;
  return around.some(([x, z]) => x === spot[0] && z === spot[2]) ? spot : null;
}

/**
 * Where Play stands the local player: the floor under the camera, else under the cursor, facing `view.yaw`. Null when
 * neither has a floor at or below the camera.
 */
export function standFromHere(grid: Grid, ground: GroundData, view: ViewStand): { at: [number, number, number]; yaw: number } | null {
  const around: [number, number][] = [[view.camera[0], view.camera[2]]];
  if (view.cursor) around.push([view.cursor[0], view.cursor[1]]);
  const at = floorUnder(grid, ground, around, view.camera[1]);
  return at ? { at, yaw: view.yaw } : null;
}

/**
 * LATER 803 (a browser adaptation, product track; FG-50, FP.R15): where Walk stands the feet. The floor under the view
 * (`standFromHere`), else the layout's spawn marker, else -- a disc map's base only, `mapStand` null otherwise -- the
 * map's own computed stand (`../matchCore` `standOf`: spawn A's feet, its eye `from` above them), when the walk's
 * ground has a floor there at or below that eye (the same test `standFromHere` makes under the camera). FP.R15 opens a
 * disc map at a still camera that often has no floor under it, and a bare map has no marker. Null: nowhere to stand.
 */
export function walkFeet(
  grid: Grid, ground: GroundData, view: ViewStand, marker: readonly [number, number, number] | null,
  mapStand: { feet: readonly [number, number, number] | null; from: readonly [number, number, number] } | null,
): [number, number, number] | null {
  const here = standFromHere(grid, ground, view);
  if (here) return here.at;
  if (marker) return [marker[0], marker[1], marker[2]];
  const feet = mapStand?.feet;
  if (!mapStand || !feet) return null;
  return floorUnder(grid, ground, [[feet[0], feet[2]]], mapStand.from[1]);
}

/**
 * The local player's start stood at `spot` facing `yaw`. The room's classic round start takes the side's slots in
 * index order and the seat `clientIndex % count` (`room.ts` `pick`); the forge seats the player at client index 0,
 * so this slot is index 0 of `side`. Every other slot is kept, and `slots` is not changed -- the caller can leave
 * the layout's own list as the respawns.
 *
 * Classic reads `map.slots` at every round's start (the forge's room is classic, so a later round is not a
 * respawn; OT.R71's respawn is CREATE GAME's and the test room's). `openingStand` is this list for round 1, and `restore` puts the layout's index 0 back into that same
 * array once round 1 has spawned, which is the list round 2 reads.
 */
export function withPlayerHere(
  slots: readonly SpawnSlot[], side: 0 | 1, spot: readonly [number, number, number], yaw: number,
): SpawnSlot[] {
  const step = stepOfYaw(yaw);
  const here: SpawnSlot = {
    side, index: 0, position: [spot[0], spot[1], spot[2]], onFloor: true,
    step, facing: facingOf(step), loc: { map: 0, x: 0, z: 0 },
  };
  return [here, ...slots.filter((s) => !(s.side === side && s.index === 0))];
}

/**
 * Round 1's slots: the player's index 0 is the camera spot, and the array is the one the room keeps (`simMapOfLoaded`
 * shares it). `restore` puts the layout's index 0 back into that array, so a later classic round start stands there.
 * A side that had no slot keeps the camera spot. `slots` (the layout's list) is not changed.
 */
export function openingStand(
  slots: readonly SpawnSlot[], side: 0 | 1, spot: readonly [number, number, number], yaw: number,
): { slots: SpawnSlot[]; restore(): void } {
  const layout = slots.find((s) => s.side === side && s.index === 0) ?? null;
  const opening = withPlayerHere(slots, side, spot, yaw);
  let restored = false;
  return {
    slots: opening,
    restore(): void {
      if (restored || !layout) return;
      restored = true;
      const at = opening.findIndex((s) => s.side === side && s.index === 0);
      if (at >= 0) opening[at] = layout;
    },
  };
}

/**
 * The Play settings' random spawn (a browser adaptation, FG.R2; no original): one of `side`'s slots -- the layout's
 * spawns, or the disc's slots where it placed none, as the match's map holds them -- drawn by `rand` ([0, 1)), facing
 * as that slot faces (the inverse of `stepOfYaw`). Null when the side has no slot. `openingStand` then stands the
 * player there for round 1, as it does the camera's spot.
 */
export function randomStand(slots: readonly SpawnSlot[], side: 0 | 1, rand: () => number = Math.random): { at: [number, number, number]; yaw: number } | null {
  const own = slots.filter((s) => s.side === side);
  if (own.length === 0) return null;
  const s = own[Math.min(own.length - 1, Math.floor(rand() * own.length))]!;
  return { at: [s.position[0], s.position[1], s.position[2]], yaw: -(s.step * Math.PI) / 4 + 0 };
}
