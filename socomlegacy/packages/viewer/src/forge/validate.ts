import { Matrix4, Vector3 } from 'three';
import {
  BUILTIN_MATERIALS, castRay, isGroundSurface, isWallSurface, probeFloor, probeGround, SOILS, type WorldPoly,
} from '@s2u/scene';
import { BODY_RADIUS, groundGrid, type GroundData } from '../mover';
import { MAX_PLAYERS } from '../net/protocol';
import type { Layout } from './layout';
import { SPAWN_FLOOR_SLACK, spawnOnFloor, stepOfYaw } from './matchMap';

/**
 * FORGE map check (a browser adaptation, no original): problems in a layout before Play or a lobby, on the hull the
 * match stands on. The hull is the one the page and the server both build (`./ground` `layoutGround`,
 * `packages/match/src/forgeSimMap.ts` `composeForgeSimMap`). The floor test is `./matchMap` `spawnOnFloor`
 * (`./ground` `standingSpot` over `groundGrid`). A wall in the way is the same walk the server uses to spread start
 * points (`forgeSimMap.ts` `walkedTo`: `FORGE_SPREAD_PACE`, `FORGE_SPREAD_RISE`, `FORGE_SPREAD_HEIGHTS`), capped so a
 * long pair is skipped and said rather than walked. Nothing here moves a spawn or a piece.
 */

/** The pace, rise and heights of the server's spread walk (`forgeSimMap.ts`). A test holds them equal to those exports. */
export const REACH_PACE = 7;
export const REACH_RISE = 6.5;
export const REACH_HEIGHTS: readonly number[] = [3, 10, 18];
/**
 * How far one reach walk will go, in paces of `REACH_PACE`. Past it the sides are too far apart to walk cheaply on the
 * grid, and the check says so instead of walking. One pair only (the first on-floor spawn of each side): every pair is
 * not cheap.
 */
export const REACH_MAX_PACES = 64;
/** A wall this close along the facing is point-blank: a short step past the body (`BODY_RADIUS` 3.5). An adaptation. */
export const SPAWN_POINT_BLANK = 12;
/** A piece whose lowest point is further than this from the floor under it is floating or buried. An adaptation. */
export const PIECE_FLOOR_GAP = 8;
/**
 * A piece this thin on its smallest edge is a light, a pane or a wall mount, and so is one with no ground polygon
 * (ditype bit 0). Its floor is a note, not a problem: those pieces sit in a wall. An adaptation, the same gap as
 * `PIECE_FLOOR_GAP`.
 */
export const PIECE_THIN = PIECE_FLOOR_GAP;
/**
 * The material byte of `INVISIBLE_DI`: the two built-ins, then SOILS in file order (research 85: byte 3, PENETRATION 1,
 * a round passes). The perimeter a shot meets and a player does not (`tools/sweepHeading.ts` on MP71) is that byte.
 * Facing ignores it. Open bars are the same byte (research 199) and are not a wall in the face either.
 */
export const INVISIBLE_DI_BYTE = BUILTIN_MATERIALS.length + SOILS.findIndex((s) => s.name === 'INVISIBLE_DI');
/** The server's piece polygon cap (`forgeSimMap.ts` `FORGE_PIECE_POLYS_MAX`). A test holds them equal. */
export const PIECE_POLY_BUDGET = 20_000;
/** Two matrices within this, element by element, are the same place. An adaptation. */
const SAME_PLACE = 0.01;

export type MapIssueKind =
  | 'spawn-floor' | 'spawn-inside' | 'spawn-facing' | 'spawn-reach' | 'spawn-count'
  | 'piece-float' | 'piece-buried' | 'piece-overlap' | 'missing' | 'budget';

export interface MapIssue {
  kind: MapIssueKind;
  text: string;
  /** Where Jump looks, or null when the problem is the whole map. */
  at: [number, number, number] | null;
}

export interface MapCheck {
  issues: MapIssue[];
  /** A check that was skipped, said and not treated as a problem. */
  notes: string[];
}

/**
 * A disc spawn slot (`SpawnSlot`): side 0 is team A. Passed for a map base. With no marker placed, the count is these
 * slots, which is what the server plays (`forgeSimMap.ts`).
 */
export interface DiscSpawn {
  side: 0 | 1;
  at: readonly [number, number, number];
}

/** A placed piece as the check reads it. `polys` null: the asset is not on this disc. */
export interface CheckedPiece {
  index: number;
  asset: string;
  m: readonly number[];
  polys: readonly WorldPoly[] | null;
  /** Its owner path in `ground` when the hull was composed in, so its own top is not the floor under it. */
  owner: string;
}

/** Start points one side should have: half the room up to the original cap, the server's spread target above it. */
export function sideSeats(players: number): number {
  return players > MAX_PLAYERS ? players : players / 2;
}

const facingOf = (yaw: number): [number, number] => {
  const a = (stepOfYaw(yaw) * Math.PI) / 4;
  return [Math.sin(a), -Math.cos(a)];
};

/** A wall within `reach` of (x, y, z) along `dir` (any length). `accept` defaults to every wall. */
function wallAt(
  grid: ReturnType<typeof groundGrid>, at: readonly [number, number, number], dir: readonly [number, number], reach: number,
  accept: (p: WorldPoly) => boolean = isWallSurface,
): number | null {
  const hit = castRay(grid, [at[0], at[1], at[2]], [dir[0], 0, dir[1]], reach, accept);
  return hit ? hit.t : null;
}

/** A wall the body can meet. The invisible perimeter is not one (`INVISIBLE_DI_BYTE`). */
const facingWall = (p: WorldPoly): boolean => isWallSurface(p) && p.material !== INVISIBLE_DI_BYTE;

/**
 * The body overlaps a wall: a wall closer than `BODY_RADIUS`, sampled above a step (`REACH_RISE`). The spread's lowest
 * height (3) is under a step, and a steep hillside there is the ground rising, not the body in a wall.
 */
function insideWall(grid: ReturnType<typeof groundGrid>, x: number, y: number, z: number): boolean {
  for (const h of REACH_HEIGHTS) {
    if (h <= REACH_RISE) continue;
    for (let b = 0; b < 16; b++) {
      const a = (2 * Math.PI * b) / 16;
      const t = wallAt(grid, [x, y + h, z], [Math.cos(a), Math.sin(a)], BODY_RADIUS);
      if (t !== null && t < BODY_RADIUS) return true;
    }
  }
  return false;
}

/**
 * The floor y at (x, z) walked to from `from`, or null where a step rises too far or a wall crosses the pace. 'far'
 * when the walk would be longer than `REACH_MAX_PACES`.
 */
function walked(grid: ReturnType<typeof groundGrid>, from: readonly [number, number, number], x: number, z: number): number | 'far' | null {
  const dx = x - from[0], dz = z - from[2];
  const length = Math.hypot(dx, dz);
  const paces = Math.max(1, Math.ceil(length / REACH_PACE));
  if (paces > REACH_MAX_PACES) return 'far';
  let y = from[1], px = from[0], pz = from[2];
  for (let i = 1; i <= paces; i++) {
    const t = i / paces;
    const nx = from[0] + dx * t, nz = from[2] + dz * t;
    const floor = probeFloor(grid, nx, y, nz);
    if (!floor || Math.abs(floor.y - y) > REACH_RISE) return null;
    const step = Math.hypot(nx - px, nz - pz);
    for (const h of REACH_HEIGHTS) if (castRay(grid, [px, y + h, pz], [nx - px, 0, nz - pz], step, isWallSurface)) return null;
    y = floor.y; px = nx; pz = nz;
  }
  const top = Math.max(from[1], y);
  for (const h of REACH_HEIGHTS) if (castRay(grid, [from[0], top + h, from[2]], [dx, 0, dz], length, isWallSurface)) return null;
  return y;
}

/**
 * Whether `at` is on a floor a disc slot can walk to. 'far' when every slot is past `REACH_MAX_PACES` (the walk is
 * skipped, as the side-to-side walk is). Disc roofs are ordinary floors (ditype bit 0), so a cap that is not a floor
 * is a different finding; this is the one that catches a floor the slots cannot reach.
 */
function fromDisc(grid: ReturnType<typeof groundGrid>, at: readonly [number, number, number], disc: readonly DiscSpawn[]): 'ok' | 'no' | 'far' {
  let near = false;
  for (const d of disc) {
    const w = walked(grid, d.at, at[0], at[2]);
    if (w === 'far') continue;
    near = true;
    if (typeof w === 'number' && Math.abs(w - at[1]) <= SPAWN_FLOOR_SLACK) return 'ok';
  }
  return near ? 'no' : 'far';
}

/** A vertex this close to the lowest is on the bottom, and is probed. */
const LOW_EPS = 0.05;

interface PieceExtent {
  minY: number;
  /** The lowest vertices and the footprint's corners, in xz. One of them on a floor is enough (a gazebo's posts). */
  samples: [number, number][];
  /** No ground polygon, or thinner than `PIECE_THIN`: noted, not flagged. */
  slight: boolean;
}

function extentOf(polys: readonly WorldPoly[], m: readonly number[]): PieceExtent | null {
  const mat = new Matrix4().fromArray(m as number[]);
  const v = new Vector3();
  let n = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const verts: { x: number; y: number; z: number }[] = [];
  for (const p of polys) {
    for (let i = 0; i < p.points.length; i += 3) {
      v.set(p.points[i]!, p.points[i + 1]!, p.points[i + 2]!).applyMatrix4(mat);
      n++;
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
      if (v.z > maxZ) maxZ = v.z;
      verts.push({ x: v.x, y: v.y, z: v.z });
    }
  }
  if (n === 0) return null;
  const samples: [number, number][] = [];
  const seen = new Set<string>();
  const add = (x: number, z: number): void => {
    const key = `${Math.round(x * 100)},${Math.round(z * 100)}`;
    if (seen.has(key)) return;
    seen.add(key);
    samples.push([x, z]);
  };
  for (const p of verts) if (p.y <= minY + LOW_EPS) add(p.x, p.z);
  add(minX, minZ); add(minX, maxZ); add(maxX, minZ); add(maxX, maxZ);
  const thinEdge = Math.min(maxX - minX, maxY - minY, maxZ - minZ) <= PIECE_THIN;
  return { minY, samples, slight: thinEdge || !polys.some((p) => isGroundSurface(p)) };
}

/** How `minY` sits on the floors under one sample. A floor within `PIECE_FLOOR_GAP` above the bottom is still support. */
function seatAt(ys: readonly number[], minY: number): 'ok' | 'float' | 'buried' {
  const support = ys.filter((y) => y <= minY + 0.5).sort((a, b) => b - a)[0];
  if (support !== undefined) return minY > support + PIECE_FLOOR_GAP ? 'float' : 'ok';
  const above = ys.filter((y) => y > minY).sort((a, b) => a - b)[0];
  if (above === undefined) return 'float';
  return minY < above - PIECE_FLOOR_GAP ? 'buried' : 'ok';
}

function samePlace(a: readonly number[], b: readonly number[]): boolean {
  if (a.length < 16 || b.length < 16) return false;
  for (let i = 0; i < 16; i++) if (Math.abs(a[i]! - b[i]!) > SAME_PLACE) return false;
  return true;
}

const atOf = (m: readonly number[]): [number, number, number] => [m[12] ?? 0, m[13] ?? 0, m[14] ?? 0];

/**
 * The layout's problems on `ground` (the composed hull). `pieces` is every placed piece; `polyCount` overrides the
 * polygon total the budget reads (the pieces' own lengths when omitted). `discSpawns` is the map base's slots: with
 * no marker placed, the count is theirs (the server plays them); a marker on a floor they cannot walk to is said.
 * Pure.
 */
export function checkMap(
  layout: Layout, ground: GroundData, pieces: readonly CheckedPiece[], polyCount?: number, discSpawns?: readonly DiscSpawn[],
): MapCheck {
  const grid = groundGrid(ground);
  const issues: MapIssue[] = [];
  const notes: string[] = [];
  const counted = { A: 0, B: 0 };
  let discFar = false;

  for (const s of layout.spawns) {
    const n = ++counted[s.team];
    const name = `Team ${s.team} spawn ${n}`;
    const at: [number, number, number] = [s.p[0], s.p[1], s.p[2]];
    if (!spawnOnFloor(grid, ground, at)) issues.push({ kind: 'spawn-floor', text: `${name} is not on a floor.`, at });
    else if (discSpawns && discSpawns.length > 0) {
      const reached = fromDisc(grid, at, discSpawns);
      if (reached === 'no') issues.push({ kind: 'spawn-floor', text: `${name} stands where no disc spawn can walk.`, at });
      else if (reached === 'far') discFar = true;
    }
    const inside = insideWall(grid, at[0], at[1], at[2]);
    if (inside) issues.push({ kind: 'spawn-inside', text: `${name} is inside geometry.`, at });
    else {
      const [fx, fz] = facingOf(s.yaw);
      const t = wallAt(grid, [at[0], at[1] + 10, at[2]], [fx, fz], SPAWN_POINT_BLANK, facingWall);
      if (t !== null) issues.push({ kind: 'spawn-facing', text: `${name} faces a wall at point-blank range.`, at });
    }
  }
  if (discFar) notes.push('A spawn\'s floor was not walked from the disc\'s slots: they stand too far apart to walk on the grid here.');

  const reachFrom = (team: 'A' | 'B'): [number, number, number] | null => {
    for (const s of layout.spawns) {
      if (s.team !== team || !spawnOnFloor(grid, ground, s.p)) continue;
      return [s.p[0], s.p[1], s.p[2]];
    }
    return null;
  };
  const a = reachFrom('A'), b = reachFrom('B');
  if (!a || !b) notes.push('Reach between the sides was not checked: one side has no spawn on a floor.');
  else {
    const walkedTo = walked(grid, a, b[0], b[2]);
    if (walkedTo === 'far') notes.push('Reach between the sides was not checked: they stand too far apart to walk on the grid here.');
    else if (walkedTo === null) issues.push({ kind: 'spawn-reach', text: 'A straight walk from team A did not reach team B; a way around was not tried.', at: a });
  }

  // No marker on a map: the server stands the room on the disc's slots (`forgeSimMap.ts`), so those are the count.
  if (layout.spawns.length === 0 && layout.base.kind === 'map' && discSpawns && discSpawns.length > 0) {
    counted.A = discSpawns.filter((d) => d.side === 0).length;
    counted.B = discSpawns.filter((d) => d.side === 1).length;
  }

  // Only a player cap the layout itself stored. The disc's 16 (`settingsOf`) is not assumed: a layout that never set
  // one would otherwise want 8 spawns a side and stop Play.
  const players = layout.settings?.players;
  if (players !== undefined) {
    const seats = sideSeats(players);
    for (const team of ['A', 'B'] as const) {
      if (counted[team] >= seats) continue;
      const side = team === 'A' ? 'A' : 'B';
      const word = counted[team] === 1 ? 'spawn' : 'spawns';
      const text = players > MAX_PLAYERS
        ? `Team ${side} has ${counted[team]} ${word}; a lobby of ${players} wants ${seats} start points on that side.`
        : `Team ${side} has ${counted[team]} ${word}; the map is set for ${players} players (${seats} a side).`;
      issues.push({ kind: 'spawn-count', text, at: null });
    }
  }

  for (const p of pieces) {
    const label = `Piece ${p.index + 1} (${p.asset})`;
    const at = atOf(p.m);
    if (p.polys === null) { issues.push({ kind: 'missing', text: `${label} is not on this disc.`, at }); continue; }
    const b = extentOf(p.polys, p.m);
    if (!b) continue;
    let sawFloat = false, sawBuried = false, seated = false;
    for (const [x, z] of b.samples) {
      const ys = probeGround(grid, x, z).filter((h) => h.owner.path !== p.owner).map((h) => h.y);
      const seat = seatAt(ys, b.minY);
      if (seat === 'ok') { seated = true; break; }
      if (seat === 'buried') sawBuried = true;
      else sawFloat = true;
    }
    if (seated) continue;
    if (b.slight) { notes.push(`${label} is thin or wall-mounted; its floor was not judged.`); continue; }
    if (sawBuried && !sawFloat) issues.push({ kind: 'piece-buried', text: `${label} is buried in the floor.`, at });
    else issues.push({ kind: 'piece-float', text: `${label} is floating off the floor.`, at });
  }
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      if (!samePlace(pieces[i]!.m, pieces[j]!.m)) continue;
      issues.push({
        kind: 'piece-overlap',
        text: `Pieces ${pieces[i]!.index + 1} and ${pieces[j]!.index + 1} are in the same place.`,
        at: atOf(pieces[i]!.m),
      });
    }
  }

  const total = polyCount ?? pieces.reduce((n, p) => n + (p.polys?.length ?? 0), 0);
  if (total > PIECE_POLY_BUDGET) {
    issues.push({
      kind: 'budget',
      text: `The pieces carry ${total} collision polygons; a lobby refuses a layout past ${PIECE_POLY_BUDGET}.`,
      at: null,
    });
  }
  return { issues, notes };
}
