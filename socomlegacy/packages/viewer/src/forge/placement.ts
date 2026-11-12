import { Box3, Vector3, type Object3D } from 'three';
import { probeGround, type Grid } from '@s2u/scene';
import { groundGrid, type GroundData } from '../mover';
import { centreOf, type Quat, type Vec3 } from './group';
import { floorGround, layoutGround, type ContentPiece, type ContentResolver, type PieceHull } from './ground';

/**
 * FORGE placement aids (FG-5's ghost, FG-49; a browser adaptation, no original). The maths of placing: the grid and
 * the turn step, where a piece rests (the hull under the cursor, `./ground` `floorGround` and the probe), and a paste
 * that keeps a group's offsets. The page draws the ghost and reads the pointer; nothing here changes the game.
 */

/** The steps the forge shipped with, before they were settings. */
export const DEFAULT_GRID_STEP = 25;
export const DEFAULT_TURN_STEP = 15;
export const GRID_STEP_MIN = 1;
export const GRID_STEP_MAX = 500;
export const TURN_STEP_MIN = 1;
export const TURN_STEP_MAX = 180;

/**
 * How far a pointer may move (CSS pixels) and still be a click. Past this, a press that began on the gizmo is the
 * gizmo's drag. The select box uses the same slop (`page.ts`).
 */
export const PLACE_DRAG_PX = 4;

/**
 * The blank floor's drawn plane sits this far under the hull (`page.ts`, so the grid does not z-fight the walk's
 * floor). A hit on that plane still rests on the hull.
 */
export const FLOOR_PLANE_SINK = 0.5;

/** A typed step held to whole units inside the bounds; anything that is not a number stays the fallback. */
export function boundStep(v: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

/** `v` to the nearest multiple of `step`. A step that is not positive leaves `v` alone. */
export function snapTo(v: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(v)) return v;
  const n = Math.round(v / step) * step;
  return n === 0 ? 0 : n;
}

/** A yaw in radians snapped to a step of `degrees`. */
export function snapYawRadians(yaw: number, degrees: number): number {
  const step = (degrees * Math.PI) / 180;
  if (!(step > 0) || !Number.isFinite(yaw)) return yaw;
  return Math.round(yaw / step) * step;
}

/**
 * The height a placement rests at. `groundYs` are the probe's surfaces at this x, z. The highest one at or below the
 * hit, allowing `slack` (the drawn floor sits half a unit under the hull), is the surface. With none there, the hit's
 * own height stands.
 */
export function restingY(hitY: number, groundYs: readonly number[], slack = FLOOR_PLANE_SINK): number {
  let best: number | null = null;
  // A ray on the drawn plane is half a unit under the hull, and the intersection can sit a hair lower still.
  const reach = hitY + slack + 1e-3;
  for (const y of groundYs) {
    if (y <= reach && (best === null || y > best)) best = y;
  }
  return best ?? hitY;
}

export interface PlacePoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Where a placement goes. `x` and `z` snap to `gridStep` when it is set (snap on); `y` is the hull under that point
 * (`probeYs`, from `probeGround`). The snap is applied before the probe, so the piece sits on the ground at the cell
 * it lands in.
 */
export function restingPoint(point: PlacePoint, probeYs: (x: number, z: number) => readonly number[], gridStep: number | null): PlacePoint {
  const x = gridStep === null ? point.x : snapTo(point.x, gridStep);
  const z = gridStep === null ? point.z : snapTo(point.z, gridStep);
  return { x, y: restingY(point.y, probeYs(x, z)), z };
}

/**
 * The probe grid a placement rests on: the base hull, plus each placed piece's collision (`./ground` `layoutGround`).
 * A click on a placed container's top then stacks; the map's ground alone would drop the new piece to the floor inside it.
 * R6 (3): a creator pack's piece (`ContentPiece`) through `resolveContent`, as `layoutGround` composes it.
 */
export function placementGridOf(base: GroundData, pieces: readonly (PieceHull | ContentPiece)[], resolveContent: ContentResolver | null = null): Grid {
  return groundGrid(layoutGround(base, pieces, resolveContent));
}

/** The blank floor's hull as a probe grid (`./ground` `floorGround`). The match draws this same square (`./matchMap` `floorMesh`). */
export function blankFloorGrid(size: number): Grid {
  return placementGridOf(floorGround(size), []);
}

/** The probe's surface heights at `x`, `z`. */
export function surfaceYs(grid: Grid, x: number, z: number): number[] {
  return probeGround(grid, x, z).map((h) => h.y);
}

/**
 * Place mode, over the gizmo: a pointer that stays inside the slop is a click and places. One that moves farther, and
 * began on the gizmo, is the gizmo's drag and does not place.
 */
export function placeClickKind(movementPx: number, beganOnGizmo: boolean, slop = PLACE_DRAG_PX): 'place' | 'gizmo' {
  if (beganOnGizmo && movementPx >= slop) return 'gizmo';
  return 'place';
}

/** Each point minus the group's centre (`./group` `centreOf`); empty when there is no point. */
export function offsetsFromCentre(points: readonly Vec3[]): Vec3[] {
  const c = centreOf(points);
  if (!c) return [];
  return points.map((p) => [p[0] - c[0], p[1] - c[1], p[2] - c[2]]);
}

/** The group's places with its centre at `at`: each offset added, so the members keep their positions relative to each other. */
export function pastedPlaces(offsets: readonly Vec3[], at: Vec3): Vec3[] {
  return offsets.map((o) => [at[0] + o[0], at[1] + o[1], at[2] + o[2]]);
}

/** A copied member: its offset from the group's centre, and its turn. */
export interface ClipOffset {
  offset: Vec3;
  q: Quat;
}

/** Offsets and turns for a paste. The turns are copied as they were; only the places move. */
export function clipOf(points: readonly Vec3[], turns: readonly Quat[]): ClipOffset[] {
  const offsets = offsetsFromCentre(points);
  return offsets.map((offset, i) => ({ offset, q: turns[i] ?? [0, 0, 0, 1] }));
}

/** Whether `o` is `root` or lies beneath it. */
const isBeneath = (o: Object3D, root: Object3D): boolean => { for (let at: Object3D | null = o; at; at = at.parent) if (at === root) return true; return false; };

/**
 * `object` placed on `at` with the bottom of its bounding box on it (the owner, 2026-11-06; a browser adaptation,
 * FG.R2): set at `at`, its turn as it is, then raised or lowered by the box's floor -- so a model whose geometry reaches
 * below its origin (a door's hinge, part way up its leaf) stands on the surface, never under it. One with no geometry
 * stands at `at`. Its editor guides (`userData.forgeGuide`: a plant site's reach, a turret's arc) are drawings, not the
 * object: left out of the box, or a guide reaching below the marker -- a site's reach cylinder -- lifts it off the floor.
 */
/**
 * A wall mount (the owner, 2026-11-10: "anything that should be placed on the wall to use the normal of where the
 * cursor is being placed"; a browser adaptation, FG.R2): a face under the cursor whose normal is this near level is a
 * wall -- 60 degrees or steeper from the floor -- and what is placed on it takes its turn; a flatter one is a floor, as
 * before. An editor rule, not a game value.
 */
export const WALL_NORMAL_Y_MAX = 0.5;

/** The box of `object` and its children but its editor guides (`userData.forgeGuide`: drawings, not the object). */
export function objectBox(object: Object3D): Box3 {
  object.updateMatrixWorld(true);
  const guides: { guide: Object3D; parent: Object3D }[] = [];
  object.traverse((o) => { if (o !== object && o.userData['forgeGuide'] && o.parent && !guides.some((g) => isBeneath(o, g.guide))) guides.push({ guide: o, parent: o.parent }); });
  for (const { guide, parent } of guides) parent.remove(guide);
  const box = new Box3().setFromObject(object);
  for (const { guide, parent } of guides) parent.add(guide);
  return box;
}

/**
 * `object` mounted on a wall (`WALL_NORMAL_Y_MAX`) at `point`, whose face's outward normal is `normal`: turned so its
 * own `front` (x, z in its frame: +Z, the side a placement turns to the camera, for most) points out of the wall, and
 * moved out until the back of its box (in its own frame) is on the wall. `how`: `mount`, its box's middle at the point's
 * height (a switch, a prop); `stand`, its box's bottom on `floorY` below (a ladder), the point's height where none is.
 */
export function mountOnWall(object: Object3D, point: Vector3, normal: Vector3, front: readonly [number, number] = [0, 1],
  how: 'mount' | 'stand' = 'mount', floorY?: (x: number, z: number, fromY: number) => number | null): void {
  const out = new Vector3(normal.x, 0, normal.z);
  if (out.lengthSq() < 1e-9) return;
  out.normalize();
  // Its box in its own frame (its scale kept): no turn, at the origin.
  const q = object.quaternion.clone();
  object.quaternion.identity();
  object.position.set(0, 0, 0);
  const box = objectBox(object);
  object.quaternion.copy(q);
  object.rotation.set(0, Math.atan2(out.x, out.z) - Math.atan2(front[0], front[1]), 0);
  // How far the box reaches behind its origin, against its front: the distance out from the wall.
  let back = 0;
  if (!box.isEmpty()) for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) back = Math.max(back, -(x * front[0] + z * front[1]));
  const at = point.clone().addScaledVector(out, back + WALL_GAP);
  if (box.isEmpty()) at.y = point.y;
  else if (how === 'stand') at.y = (floorY?.(at.x, at.z, point.y) ?? point.y) - box.min.y;
  else at.y = point.y - (box.min.y + box.max.y) / 2;
  object.position.copy(at);
  object.updateMatrixWorld(true);
}
/** A wall mount's clearance: its back just off the wall's face, so the two never fight in the draw. */
const WALL_GAP = 0.05;

export function seatOn(object: Object3D, at: Vector3): void {
  object.position.copy(at);
  const box = objectBox(object);
  if (box.isEmpty() || !Number.isFinite(box.min.y)) return;
  object.position.y += at.y - box.min.y;
  object.updateMatrixWorld(true);
}
