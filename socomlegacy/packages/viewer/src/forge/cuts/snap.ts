import { Vector3, type Matrix4 } from 'three';
import type { CollisionOwner } from '@s2u/scene';
import type { GroundData } from '../../mover';
import { groundPolygons } from '../../mover';
import { leafFrame, pointsOf } from './doors';
import { newell, ownerMoves, triples } from './geometry';

/**
 * FORGE CUTS, a door snapped into its wall (a browser adaptation, FG.R2: the game places no doors). A door dropped near
 * a wall -- placed, or let go after a move or a turn -- turns square to the wall and sits in the middle of its thickness
 * (between its two faces, else on its one face): its frame's middle when it brings one (a disc door hangs to one side of
 * its frame), else its leaf's. Its foot is set on the wall's foot: raised however far when sunk below it, lowered only
 * within `DOOR_SNAP_FOOT_ADAPTATION`. Where it stands along the wall stays the person's. A door with no wall within
 * `DOOR_SNAP_REACH_ADAPTATION` stays where it was dropped.
 */

/** How far from the leaf's middle a wall's face may be and still take the door (about 60 cm), world units. */
export const DOOR_SNAP_REACH_ADAPTATION = 6;
/** The thickest wall whose two faces are read as one wall (about 80 cm); a face farther off is another wall. */
export const DOOR_SNAP_THICKEST_ADAPTATION = 8;
/** The thinnest gap between two opposed faces that is read as a wall's thickness (about 5 cm). */
export const DOOR_SNAP_THINNEST_ADAPTATION = 0.5;
/** How far above its wall's foot a door's foot may stand and be set down on it (about 30 cm); one sunk below is always raised. */
export const DOOR_SNAP_FOOT_ADAPTATION = 3;
/** How upright a face must be to be a wall: its unit normal's upward part at most this. */
export const DOOR_SNAP_UPRIGHT_ADAPTATION = 0.3;
/** How far past a face's ends along the wall the leaf's middle may stand and still be beside it (about 20 cm). */
export const DOOR_SNAP_ALONG_SLACK_ADAPTATION = 2;
/** How nearly opposite two faces' normals must be (their dot at most minus this) to be a wall's two faces. */
export const DOOR_SNAP_OPPOSED_ADAPTATION = 0.95;

/** A wall face: its outward level normal, its plane's offset along it, its extent along the wall and up. */
export interface WallFace { n: [number, number]; d: number; along: [number, number]; up: [number, number] }

/** One polygon (xyz, flat) as a wall face, or null when it is not upright. */
export function faceOf(points: ArrayLike<number>): WallFace | null {
  const pts = triples(points);
  const unit = pts.length >= 3 ? newell(pts) : null;
  if (!unit || Math.abs(unit[1]) > DOOR_SNAP_UPRIGHT_ADAPTATION) return null;
  const level = Math.hypot(unit[0], unit[2]);
  const n: [number, number] = [unit[0] / level, unit[2] / level];
  let d = 0, a0 = Infinity, a1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y, z] of pts as [number, number, number][]) {
    d += n[0] * x + n[1] * z;
    const s = -n[1] * x + n[0] * z;
    a0 = Math.min(a0, s); a1 = Math.max(a1, s); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { n, d: d / pts.length, along: [a0, a1], up: [y0, y1] };
}

/** The static, upright faces of a hull (a moving owner's -- a door's leaf, a gate, a hook -- left out). */
export function wallFaces(ground: GroundData): WallFace[] {
  const polys = groundPolygons(ground);
  const ownerOf: (CollisionOwner | undefined)[] = new Array(polys.length);
  for (const o of ground.owners) for (let i = o.first; i < Math.min(polys.length, o.first + o.count); i++) ownerOf[i] = o;
  const out: WallFace[] = [];
  polys.forEach((p, i) => {
    if (ownerMoves(ownerOf[i])) return;
    const f = faceOf(p.points);
    if (f) out.push(f);
  });
  return out;
}

/**
 * Where a door would snap: its hinge `at` and turn `yaw` as dropped, `place` the move a hinge and turn make
 * (`../placedDoors` `doorMove`), `leaf` its template's leaf polygons, `faces` the walls, `frame` the points of the frame
 * it brings (`../placedDoors` `doorFramePoints`; none, the leaf is squared and centred). Null: no wall in reach.
 */
export function snapDoor(at: readonly [number, number, number], yaw: number, place: (at: readonly number[], yaw: number) => Matrix4,
  leaf: readonly { points: ArrayLike<number> }[], faces: readonly WallFace[], frame: readonly (readonly [number, number, number])[] = []):
  { at: [number, number, number]; yaw: number } | null {
  const framed = (m: Matrix4): [number, number, number][] => {
    const v = new Vector3();
    return frame.map((p) => { v.set(p[0], p[1], p[2]).applyMatrix4(m); return [v.x, v.y, v.z]; });
  };
  // Squared by its frame when it brings one (`./doors` `leafFrame`), else by its leaf.
  const orient = (m: Matrix4) => { const pts = pointsOf(leaf, m); return leafFrame(pts, frame.length ? framed(m) : pts); };
  const f0 = orient(place(at, yaw));
  if (!f0) return null;
  const height = f0.y[1] - f0.y[0];
  // A face beside the leaf: in reach across, over its middle along, overlapping half its height. Its offset across, or null.
  const beside = (f: WallFace, c: readonly number[], reach: number): number | null => {
    const across = f.n[0] * c[0]! + f.n[1] * c[2]! - f.d;
    if (Math.abs(across) > reach) return null;
    const s = -f.n[1] * c[0]! + f.n[0] * c[2]!;
    if (s < f.along[0] - DOOR_SNAP_ALONG_SLACK_ADAPTATION || s > f.along[1] + DOOR_SNAP_ALONG_SLACK_ADAPTATION) return null;
    return Math.min(f.up[1], f0.y[1]) - Math.max(f.up[0], f0.y[0]) >= height / 2 ? across : null;
  };
  let near: WallFace | null = null, best = Infinity;
  for (const f of faces) {
    const a = beside(f, f0.c, DOOR_SNAP_REACH_ADAPTATION);
    if (a !== null && Math.abs(a) < best) { best = Math.abs(a); near = f; }
  }
  if (!near) return null;
  // Square to it: the way through turned onto the wall's normal by the smaller turn (either sense of either).
  let delta = Math.atan2(near.n[1], near.n[0]) - Math.atan2(f0.n[1], f0.n[0]);
  delta -= Math.PI * Math.round(delta / Math.PI);
  // three's turn about y by `yaw` takes a level direction's angle atan2(z, x) the other way.
  const yaw2 = yaw - delta;
  const f1 = orient(place(at, yaw2))!;
  // The wall's middle: halfway to the nearest opposed face within the thickest wall, else the face itself.
  let target = near.d, thick = Infinity;
  for (const f of faces) {
    if (f === near || f.n[0] * near.n[0] + f.n[1] * near.n[1] > -DOOR_SNAP_OPPOSED_ADAPTATION) continue;
    if (beside(f, f1.c, DOOR_SNAP_REACH_ADAPTATION + DOOR_SNAP_THICKEST_ADAPTATION) === null) continue;
    const pos = -f.d;                                     // its plane along the near face's normal (its own points the other way)
    const gap = Math.abs(pos - near.d);
    if (gap >= DOOR_SNAP_THINNEST_ADAPTATION && gap <= DOOR_SNAP_THICKEST_ADAPTATION && gap < thick) { thick = gap; target = (pos + near.d) / 2; }
  }
  // What is centred: the frame's extent across the wall, moved as the leaf is; else the leaf's middle.
  const fr = frame.length ? framed(place(at, yaw2)) : null;
  let mid = near.n[0] * f1.c[0] + near.n[1] * f1.c[2];
  if (fr) {
    const across = fr.map((p) => near.n[0] * p[0] + near.n[1] * p[2]);
    mid = (Math.min(...across) + Math.max(...across)) / 2;
  }
  const across = mid - target;
  // Its foot on the wall's foot: raised however far when sunk (a door whose node stands halfway up its leaf, as Blizzard's
  // outhouse doors, is dropped half into the floor); lowered only within `DOOR_SNAP_FOOT_ADAPTATION` (a wall rising from
  // far below is left be).
  const foot = fr ? Math.min(...fr.map((p) => p[1])) : f1.y[0];
  const rise = near.up[0] - foot;
  const y = (rise >= 0 && rise <= height) || Math.abs(rise) <= DOOR_SNAP_FOOT_ADAPTATION ? at[1] + rise : at[1];
  return { at: [at[0] - near.n[0] * across, y, at[2] - near.n[1] * across], yaw: yaw2 };
}
