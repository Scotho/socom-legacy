import { footprintDistance, planeHeightAt, SEAL_TUNING, segmentHits, type AiMaps, type Grid } from '@s2u/scene';
import { AI_HULL_READING, BODY_RADIUS, WALL_PROBE_READING, wallProbeHeights, type GroundData } from '../src/mover';

/**
 * DF-13 (product track: a test instrument, never shipped; it changes nothing the game does): the walk a two-client
 * round spec's SEAL takes along a hostage's route, made a route a SEAL's body can walk.
 *
 * The rooms' route (`sceneRoundHarness` `route`: `HostagePathPlanner.plan` on the map's AI grid, the hostages' own
 * planner) joins AI-cell centres -- 10 u cells, smoothed into long legs -- and is a hostage's route, not a body's: its
 * points sit a unit or two off a jamb, its legs cut a doorway's corner, and a door's open leaf can lie on a cell. A spec
 * that held W along it stalled on the hull (the box run of 2026-11-08, `df13-box/20261108T2127Z`: Fish Hook's walk at
 * (2079.3, 179, 722.6), 123.9 u off its next point, reproduced to the decimal by `match/test/extractionWalkway.test.ts`
 * on the room's own walker). This keeps every point of the route and adds or moves points only where the body meets
 * the hull, reading nothing but the room's own hull (`segmentHits` on its grid) and the doors' rest leaves:
 *
 * 1. a leg that crosses a door's rest leaf (its ground-plane chord; `DoorSet.leaf` before any swing) goes through the
 *    chord's middle, square to it (`throughDoors`): the doorway the leaf fills when shut;
 * 2. each inner point is pushed clear of the walls (`nudge`): a disc of `WALKWAY.clear` at the body's two wall lines;
 * 3. a leg whose body edge (`WALKWAY.clear` either side, and its centre line) meets a wall gets that crossing point,
 *    pushed clear, as a point of its own (`refineWalkway`), three passes at most; a point the push moved behind its leg's
 *    start or past its end is dropped.
 *
 * The wall lines are cast from the floor under each point (`floorUnder`: the hull's ground there), not from the AI
 * cell's stored height -- a cell can store a prop's top as walkable soil (Fish Hook's (0,165,106) holds `bush_med`'s top,
 * 118.54, over a floor at 110: RESEARCH-FH-ROUTES, 2026-11-08), and lines cast from that top pass over the prop.
 *
 * A wall here is what the walker meets as one (`wallHits`): a face no flatter than `AI_HULL_READING.slope` met by a line
 * at the step (`WALL_PROBE_READING.stand.h`, `step_height` 6.5, `DAT_0044c26c`) or the head over the floor -- a stair's
 * riser or a ramp is walked. The walker
 * takes every point (`walkRoute` with `WALKWAY.step`); an inner one is reached within `WALKWAY.within` of it, or -- a
 * point the body cannot stand on, its cell's stored height over a step above the floor under it (`onProp`) -- once the
 * feet are inside its AI cell (`cellBox`): a test tool's reading of the follower's own point drop, which takes a route
 * point as soon as its located cell is the point's cell (`FUN_00567900` D:L429574-429592; research 200 s3). Only there:
 * the cell's reach everywhere lets the walk turn at a cell's edge and cut a doorway's corner (Fish Hook's z ~720,
 * `match/test/extractionWalkway.test.ts`).
 */
export const WALKWAY = {
  /** The body's disc (`BODY_RADIUS`, mover.ts) and a margin of 1.5 u for the walk's steering: an instrument's choice. */
  clear: BODY_RADIUS + 1.5,
  /** The heights over the feet the body meets a wall at, standing (`wallProbeHeights('stand')`: the low line, the head line). */
  heights: wallProbeHeights('stand'),
  /** The step (`WALL_PROBE_READING.stand.h`): a stored height over it above the floor is a prop's top (`onProp`). */
  step: WALL_PROBE_READING.stand.h,
  /** How far before and after a doorway's middle the walk is squared to it. */
  doorway: 6,
  /** `walkRoute`'s thinning: none (each point is the walk's). */
  thin: 1,
  /** `walkRoute`'s reach of an inner point: under a step of the page's poll loop at a walk (the room's walker: 4-10 ticks). */
  within: 3,
} as const;

export type V3 = [number, number, number];
/** A door's rest leaf as its ground-plane chord: the two leaf points farthest apart, (x, z) each. */
export interface DoorChord { node: string; a: [number, number]; b: [number, number] }

const flat = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!);

/** The chord of a leaf's polygons (`DoorSet.leaf`, world space): its two points farthest apart on the ground plane. */
export function doorChord(node: string, leaf: readonly ArrayLike<number>[]): DoorChord | null {
  const pts: [number, number][] = [];
  for (const p of leaf) for (let i = 0; i + 2 < p.length; i += 3) pts.push([p[i]!, p[i + 2]!]);
  if (pts.length < 2) return null;
  let best: [[number, number], [number, number]] = [pts[0]!, pts[0]!], far = -1;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const d = Math.hypot(pts[i]![0] - pts[j]![0], pts[i]![1] - pts[j]![1]);
    if (d > far) { far = d; best = [pts[i]!, pts[j]!]; }
  }
  return { node, a: best[0], b: best[1] };
}

/** The hull's ground heights over (x, z) (`footprintDistance`, `planeHeightAt`, as the harness's `ground` op reads them). */
function floorsAt(ground: GroundData, x: number, z: number): number[] {
  const ys: number[] = [];
  let at = 0;
  for (let i = 0; i < ground.fields.length / 6; i++) {
    const pc = ground.fields[i * 6]!, pts = ground.points.subarray(at, at + pc * 3);
    at += pc * 3;
    if (footprintDistance(pts, x, z) > 0) continue;
    const h = planeHeightAt(pts, x, z);
    if (h !== null) ys.push(h);
  }
  return ys;
}

/**
 * The floor the walk stands on under a route point at height `y` (the AI cell's stored one). Walked from a floor at
 * `from`: the ground there nearest `from` within a step (`WALKWAY.step`) -- the floor the body steps onto, never a
 * prop's top a step or more above it. Else (no `from`, or nothing within a step: a ramp's long leg) the lowest within
 * two steps below `y` and a unit above; `y` itself when none.
 */
export function floorUnder(ground: GroundData, x: number, z: number, y: number, from?: number): number {
  const ys = floorsAt(ground, x, z);
  if (from !== undefined) {
    const near = ys.filter((h) => Math.abs(h - from) <= WALKWAY.step).sort((a, b) => Math.abs(a - from) - Math.abs(b - from));
    if (near.length) return near[0]!;
  }
  const under = ys.filter((h) => h >= y - 2 * WALKWAY.step && h <= y + 1).sort((a, b) => a - b);
  if (under.length) return under[0]!;
  if (from !== undefined) {                                                   // off an edge: the floor the body falls to
    const below = ys.filter((h) => h < from).sort((a, b) => b - a);
    if (below.length) return below[0]!;
  }
  return y;
}

/** An AI cell's box on the ground plane (its sub-map's `min` and `cellSize`), for the walk's cell-arrival reach. */
export interface CellBox { minX: number; maxX: number; minZ: number; maxZ: number }
export function cellBox(ai: AiMaps, loc: { map: number; x: number; z: number }): CellBox | null {
  const sub = ai.maps[loc.map];
  if (!sub) return null;
  const minX = sub.min[0] + loc.x * sub.cellSize[0], minZ = sub.min[2] + loc.z * sub.cellSize[1];
  return { minX, maxX: minX + sub.cellSize[0], minZ, maxZ: minZ + sub.cellSize[1] };
}
/** A route point the body cannot stand on: its stored height over a step above the floor under it (a prop's top). */
export const onProp = (ground: GroundData, p: readonly number[]): boolean => p[1]! - floorUnder(ground, p[0]!, p[2]!, p[1]!) > WALKWAY.step;
export const insideCell = (b: CellBox | null, at: readonly number[]): boolean =>
  !!b && at[0]! >= b.minX && at[0]! < b.maxX && at[2]! >= b.minZ && at[2]! < b.maxZ;

/**
 * The walls a segment meets, as fractions along it: camera-only faces aside (`cameratype` 0 only), and a face the
 * walker's own segments meet as a wall -- its normal's rise at most `AI_HULL_READING.slope` (mover.ts `segmentHit`),
 * either side here. Its height is the lines' business: they run from the floor under the points up (`floorUnder`), the
 * low one at the step (`WALKWAY.heights`), so a riser under the step is never met and a face over it is, however short
 * or sloped (an outboard motor's cowl on Fish Hook's beach, 54.8-65.6 over sand at 49-50).
 */
function wallHits(grid: Grid, from: V3, to: V3): number[] {
  return segmentHits(grid, from, to, (q) => q.cameratype === 0).filter((h) => Math.abs(h.normal[1]) <= AI_HULL_READING.slope).map((h) => h.t);
}

/** `p` pushed clear of the walls: a disc of `WALKWAY.clear` at the body's wall lines over `floor`, sixteen rays, six passes. */
export function nudge(grid: Grid, floor: number, p0: readonly number[]): V3 {
  const R = WALKWAY.clear;
  let p: V3 = [p0[0]!, p0[1]!, p0[2]!];
  for (let pass = 0; pass < 6; pass++) {
    let px = 0, pz = 0;
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8, dx = Math.cos(a), dz = Math.sin(a);
      let near = R;
      for (const h of WALKWAY.heights) {
        for (const t of wallHits(grid, [p[0], floor + h, p[2]], [p[0] + dx * R, floor + h, p[2] + dz * R])) near = Math.min(near, t * R);
      }
      if (near < R) { px -= dx * (R - near); pz -= dz * (R - near); }
    }
    if (Math.hypot(px, pz) < 0.05) break;
    p = [p[0] + px / 2, p[1], p[2] + pz / 2];
  }
  return p;
}

/** The walls the body's edges and centre meet along a leg (`WALKWAY.clear` either side), as fractions of the leg. */
function edgeHits(grid: Grid, a: V3, b: V3, fa: number, fb: number): number[] {
  const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L, R = WALKWAY.clear, out: number[] = [];
  for (const side of [-1, 0, 1]) for (const h of WALKWAY.heights) {
    out.push(...wallHits(grid, [a[0] + nx * R * side, fa + h, a[2] + nz * R * side], [b[0] + nx * R * side, fb + h, b[2] + nz * R * side]));
  }
  return out.sort((x, y) => x - y);
}

/** A leg that crosses a door's rest chord goes through the chord's middle, `WALKWAY.doorway` before and after it, square to it. */
export function throughDoors(route: readonly V3[], doors: readonly DoorChord[]): V3[] {
  if (!route.length) return [];
  const out: V3[] = [route[0]!];
  for (let i = 1; i < route.length; i++) {
    const p = route[i - 1]!, q = route[i]!;
    const d1x = q[0] - p[0], d1z = q[2] - p[2];
    const crossings: { t: number; pts: V3[] }[] = [];
    for (const { a, b } of doors) {
      const d2x = b[0] - a[0], d2z = b[1] - a[1], den = d1x * d2z - d1z * d2x;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((a[0] - p[0]) * d2z - (a[1] - p[2]) * d2x) / den, u = ((a[0] - p[0]) * d1z - (a[1] - p[2]) * d1x) / den;
      if (t <= 0 || t >= 1 || u < -0.2 || u > 1.2) continue;
      const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, L = Math.hypot(d2x, d2z) || 1;
      let nx = -d2z / L, nz = d2x / L;
      if (nx * d1x + nz * d1z < 0) { nx = -nx; nz = -nz; }
      const y = p[1] + (q[1] - p[1]) * t, k = WALKWAY.doorway;
      crossings.push({ t, pts: [[cx - nx * k, y, cz - nz * k], [cx, y, cz], [cx + nx * k, y, cz + nz * k]] });
    }
    for (const c of crossings.sort((x, y) => x.t - y.t)) out.push(...c.pts);
    out.push(q);
  }
  return out;
}

/** The route a SEAL's body walks (see the module's note): doorways squared, inner points pushed clear, wall crossings added. */
export function refineWalkway(grid: Grid, ground: GroundData, route: readonly V3[], doors: readonly DoorChord[] = []): V3[] {
  const through = throughDoors(route, doors);
  // The floor walked under each point, from the first (where the walker stands) on (`floorUnder`'s `from`).
  const floorsOf = (ps: readonly V3[]): number[] => {
    const out: number[] = [];
    for (const [i, q] of ps.entries()) out.push(floorUnder(ground, q[0], q[2], q[1], i ? out[i - 1] : undefined));
    return out;
  };
  const f0 = floorsOf(through);
  let pts: V3[] = through.map((q, i) => (i === 0 || i === through.length - 1 ? [q[0], q[1], q[2]] : nudge(grid, f0[i]!, q)));
  for (let pass = 0; pass < 3; pass++) {
    const fl = floorsOf(pts);
    const next: V3[] = [pts[0]!];
    let changed = false;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!, b = pts[i]!, L = flat(a, b), fa = fl[i - 1]!, fb = fl[i]!;
      const t = L > 3 ? edgeHits(grid, a, b, fa, fb).find((x) => x > 0.02 && x < 0.98) : undefined;
      if (t !== undefined) {
        const m = nudge(grid, fa + (fb - fa) * t, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
        const along = ((m[0] - a[0]) * (b[0] - a[0]) + (m[2] - a[2]) * (b[2] - a[2])) / (L * L);
        if (along > 0.02 && along < 0.98 && flat(m, next[next.length - 1]!) > 1.5 && flat(m, b) > 1.5) { next.push(m); changed = true; }
      }
      next.push(b);
    }
    pts = next;
    if (!changed) break;
  }
  return pts;
}

/**
 * DF-13 box 2: what a walk meets of height along a walkway, the floor walked sampled a unit apart (`floorUnder`, each
 * from the last), where the AI route's cell heights are not: Desert Glory's route out steps off the deck's east edge
 * (`di_top1` at 30 ends at z 1440; the floor `g346_4` at 0 beyond) between two adjacent cells, (1690.3, 29.9, 1439.7) to
 * (1690.3, -0.2, 1449.7) -- the spec's `climbOf` 3.0 on the cells. `rise`: the largest climb between samples, a ledge
 * over the step (`WALKWAY.step`) the walk cannot take; `drop`: the largest fall, under `SEAL_TUNING.fallingDamage[0]`
 * (`FALLING_DAMAGE_LIGHT` 62, mover.ts `landingClass`) a landing that does no damage. Not no effect: the deck's 30 u
 * lands at about 118.7 u/s (sqrt(2 x 235 x 30)), over `landHardFallRate` 115, so the SEAL plays the hard landing
 * (`landHard`, mover.ts's landing branch) -- a walk the original allows, the landing's clip and all.
 */
export const WALK_LIMITS = { rise: WALKWAY.step, drop: SEAL_TUNING.fallingDamage[0] } as const;
export function walkedHeights(ground: GroundData, points: readonly V3[]): { rise: number; drop: number; riseAt: V3 | null; dropAt: V3 | null } {
  const out = { rise: 0, drop: 0, riseAt: null as V3 | null, dropAt: null as V3 | null };
  if (!points.length) return out;
  let floor = floorUnder(ground, points[0]![0], points[0]![2], points[0]![1]);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, n = Math.max(1, Math.ceil(flat(a, b)));
    for (let k = 1; k <= n; k++) {
      const t = k / n, q: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const f = floorUnder(ground, q[0], q[2], q[1], floor);
      if (f - floor > out.rise) { out.rise = f - floor; out.riseAt = q; }
      if (floor - f > out.drop) { out.drop = floor - f; out.dropAt = q; }
      floor = f;
    }
  }
  return out;
}
