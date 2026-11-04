import { afterEach, describe, expect, it, vi } from 'vitest';
import * as collision from '../src/collision';
import {
  buildGrid, cellsCovering, isCameraSurface, modelGate, segmentHits, ALL_LAYERS,
  type CollisionObject, type CollisionOwner, type Footprint, type Grid, type GridParams, type SegmentHit, type WorldPoly,
} from '../src/index';

/**
 * CPS collision, 2026-11-03 (plan `2026-11-02-client-performance-sprint.md`, CPS.R9 (e); a CPU-side browser adaptation,
 * product track): the 16-seat live cell's profile put `segmentHits` at 0.5 ms a frame of self time -- the eye's rays cast
 * every rendered frame -- with each polygon's normal recomputed on every call and every polygon of every owner whose
 * ground-plane box meets the segment's tested. The same hits in the same order is the whole contract: `referenceHits`
 * below is `segmentHits` as it stood at agent/client-perf 8dcdcaafa (its helpers too), kept as the oracle, and every
 * number of every hit is compared with `Object.is`.
 */

type V3 = readonly [number, number, number];
const realNormal = collision.polygonNormal;

// ---- The oracle: segment.ts at 8dcdcaafa, unchanged but for the names. ----
function refInside(points: Float32Array, n: V3, q: V3): boolean {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  const [iu, iv]: [0 | 1 | 2, 0 | 1 | 2] = ax >= ay && ax >= az ? [1, 2] : ay >= az ? [0, 2] : [0, 1];
  const count = points.length / 3;
  let left = false, right = false;
  for (let i = 0; i < count; i++) {
    const a = i * 3, b = ((i + 1) % count) * 3;
    const eu = points[b + iu]! - points[a + iu]!, ev = points[b + iv]! - points[a + iv]!;
    const cross = eu * (q[iv] - points[a + iv]!) - ev * (q[iu] - points[a + iu]!);
    if (cross > 1e-7) left = true;
    else if (cross < -1e-7) right = true;
    if (left && right) return false;
  }
  return true;
}
function refFrontSides(points: Float32Array, a: V3, d: V3): boolean {
  const p0x = points[0]!, p0y = points[1]!, p0z = points[2]!, p1x = points[3]!, p1y = points[4]!, p1z = points[5]!;
  const ux = points[6]! - p1x, uy = points[7]! - p1y, uz = points[8]! - p1z;
  const vx = p0x - p1x, vy = p0y - p1y, vz = p0z - p1z;
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const start = nx * (a[0] - p1x) + ny * (a[1] - p1y) + nz * (a[2] - p1z);
  const end = nx * (a[0] + d[0] - p1x) + ny * (a[1] + d[1] - p1y) + nz * (a[2] + d[2] - p1z);
  return start + 1e-5 >= 0 && end + 1e-5 < 0;
}
function refCrossing(poly: WorldPoly, a: V3, d: V3, frontOnly = false): { t: number; normal: [number, number, number] } | null {
  const n = realNormal(poly.points);
  if (n === null) return null;
  const denom = n[0] * d[0] + n[1] * d[1] + n[2] * d[2];
  if (Math.abs(denom) < 1e-12) return null;
  if (frontOnly && (denom > 0 || !refFrontSides(poly.points, a, d))) return null;
  const p = poly.points;
  const t = (n[0] * (p[0]! - a[0]) + n[1] * (p[1]! - a[1]) + n[2] * (p[2]! - a[2])) / denom;
  if (t < -1e-9 || t > 1 + 1e-9) return null;
  const q: V3 = [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];
  return refInside(p, n, q) ? { t: Math.min(1, Math.max(0, t)), normal: n } : null;
}
function referenceHits(
  grid: Grid, a: V3, b: V3, accept: (p: WorldPoly) => boolean = () => true, layers: number = ALL_LAYERS, frontOnly = false,
): SegmentHit[] {
  const box = { minX: Math.min(a[0], b[0]), minZ: Math.min(a[2], b[2]), maxX: Math.max(a[0], b[0]), maxZ: Math.max(a[2], b[2]) };
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const seen = new Set<CollisionObject>();
  const out: SegmentHit[] = [];
  for (const cell of cellsCovering(grid, box)) {
    for (const atom of cell.atoms) {
      const object = atom.object;
      if (object.kind !== 'collision' || seen.has(object)) continue;
      seen.add(object);
      const f = object.footprint;
      if (f.maxX < box.minX || f.minX > box.maxX || f.maxZ < box.minZ || f.minZ > box.maxZ) continue;
      if (!modelGate(object.owner, layers)) continue;
      for (const poly of object.polys) {
        if (!accept(poly)) continue;
        const c = refCrossing(poly, a, d, frontOnly);
        if (c === null) continue;
        out.push({ point: [a[0] + d[0] * c.t, a[1] + d[1] * c.t, a[2] + d[2] * c.t], t: c.t, normal: c.normal, poly, owner: object.owner });
      }
    }
  }
  return out.sort((x, y) => x.t - y.t);
}
// ---- end of the oracle ----

/** Every difference between two hit lists: length, then per hit t, polygon, owner, point and normal (`Object.is`). */
function differences(got: SegmentHit[], want: SegmentHit[]): string[] {
  if (got.length !== want.length) return [`length ${got.length} != ${want.length}`];
  const out: string[] = [];
  got.forEach((g, i) => {
    const w = want[i]!;
    if (!Object.is(g.t, w.t)) out.push(`[${i}] t ${g.t} != ${w.t}`);
    if (g.poly !== w.poly) out.push(`[${i}] poly`);
    if (g.owner !== w.owner) out.push(`[${i}] owner`);
    for (let k = 0; k < 3; k++) {
      if (!Object.is(g.point[k], w.point[k])) out.push(`[${i}] point[${k}] ${g.point[k]} != ${w.point[k]}`);
      if (!Object.is(g.normal[k], w.normal[k])) out.push(`[${i}] normal[${k}] ${g.normal[k]} != ${w.normal[k]}`);
    }
  });
  return out;
}

/** mulberry32: the recorded random sequence (seeded, so every run casts the same 200 segments). */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poly(points: number[], ditype = 2, cameratype = 0): WorldPoly {
  return { modelName: 'worldmodel', path: 'worldmodel/p', region: 0, ditype, material: 25, ptcount: points.length / 3, cameratype, points: Float32Array.from(points) };
}

const PARAMS: GridParams = { atomCount: 1 << 16, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };

/** A world of owners, each a run of polygons, as `buildGrid` takes them (`sweeps` marks the moving owners). */
function worldOf(groups: WorldPoly[][], sweeps: (Footprint | undefined)[] = []) {
  const polys: WorldPoly[] = [];
  const owners: CollisionOwner[] = [];
  groups.forEach((g, i) => {
    const sweep = sweeps[i];
    owners.push({ modelName: 'worldmodel', path: `worldmodel/o${i}`, first: polys.length, count: g.length, ...(sweep ? { sweep } : {}) });
    polys.push(...g);
  });
  return { grid: buildGrid(PARAMS, [], [], polys, owners), polys, owners };
}

/** A convex n-gon of radius `r` about `c` in a random plane. */
function convexIn(rand: () => number, c: V3, r: number, n: number): number[] {
  const u = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
  const ul = Math.hypot(u[0]!, u[1]!, u[2]!) || 1;
  const e1 = u.map((x) => x / ul);
  const h = Math.abs(e1[0]!) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e2raw = [e1[1]! * h[2]! - e1[2]! * h[1]!, e1[2]! * h[0]! - e1[0]! * h[2]!, e1[0]! * h[1]! - e1[1]! * h[0]!];
  const e2l = Math.hypot(e2raw[0]!, e2raw[1]!, e2raw[2]!);
  const e2 = e2raw.map((x) => x / e2l);
  const e3 = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
  const angles = Array.from({ length: n }, () => rand() * Math.PI * 2).sort((x, y) => x - y);
  const out: number[] = [];
  for (const a of angles) for (let k = 0; k < 3; k++) out.push(c[k]! + r * (Math.cos(a) * e2[k]! + Math.sin(a) * e3[k]!));
  return out;
}

/** The mixed world: convex polygons in random planes, slivers, tiny triangles, non-convex quads, walls and floors. */
function mixedWorld(seed: number) {
  const rand = prng(seed);
  const at = (): V3 => [rand() * 360 - 180, rand() * 120 - 30, rand() * 360 - 180];
  const groups: WorldPoly[][] = [];
  for (let o = 0; o < 70; o++) {
    const g: WorldPoly[] = [];
    const base = at();
    const count = 1 + Math.floor(rand() * 6);
    for (let k = 0; k < count; k++) {
      const c: V3 = [base[0] + rand() * 40 - 20, base[1] + rand() * 20 - 10, base[2] + rand() * 40 - 20];
      const kind = Math.floor(rand() * 7);
      const ditype = rand() < 0.5 ? 2 : 3, cam = Math.floor(rand() * 4);
      if (kind <= 2) g.push(poly(convexIn(rand, c, 1 + rand() * 30, 3 + Math.floor(rand() * 6)), ditype, cam));
      else if (kind === 3) g.push(poly([c[0], c[1], c[2], c[0] + 30, c[1], c[2], c[0] + 30, c[1] + 0.001, c[2] + 0.002], ditype, cam));   // a sliver
      else if (kind === 4) g.push(poly([c[0], c[1], c[2], c[0] + 1e-4, c[1], c[2], c[0], c[1], c[2] + 1e-4], ditype, cam));             // tiny
      else if (kind === 5) g.push(poly([c[0], c[1], c[2], c[0] + 10, c[1], c[2], c[0] + 5, c[1], c[2] + 2, c[0] + 5, c[1], c[2] + 10], ditype, cam));   // non-convex
      else g.push(poly([c[0] - 15, c[1] - 5, c[2], c[0] + 15, c[1] - 5, c[2], c[0] + 15, c[1] + 15, c[2], c[0] - 15, c[1] + 15, c[2]], ditype, cam));   // a wall
    }
    groups.push(g);
  }
  groups.push([poly([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200], 3)]);   // the floor
  return worldOf(groups);
}

/** 200 recorded segments: random, axis-aligned (a zero direction component), and aimed through a polygon's edge. */
function segments(seed: number, polys: readonly WorldPoly[]): [V3, V3][] {
  const rand = prng(seed);
  const out: [V3, V3][] = [];
  for (let i = 0; i < 200; i++) {
    const a: V3 = [rand() * 380 - 190, rand() * 100 - 20, rand() * 380 - 190];
    const kind = i % 4;
    if (kind === 0) {
      const len = 1 + rand() * 300;
      const dir = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
      const l = Math.hypot(dir[0]!, dir[1]!, dir[2]!) || 1;
      out.push([a, [a[0] + dir[0]! / l * len, a[1] + dir[1]! / l * len, a[2] + dir[2]! / l * len]]);
    } else if (kind === 1) {
      const axis = Math.floor(rand() * 3), len = (rand() - 0.5) * 400;
      const b: [number, number, number] = [a[0], a[1], a[2]];
      b[axis] = b[axis]! + len;
      out.push([a, b]);
    } else {
      // Through a point on (kind 2) or just off (kind 3, 1e-7 to 1e-4 out) one polygon's edge: the inside test's tolerance.
      const p = polys[Math.floor(rand() * polys.length)]!.points;
      const n = p.length / 3, e = Math.floor(rand() * n), f = (e + 1) % n, s = rand();
      const on: number[] = [0, 1, 2].map((k) => p[e * 3 + k]! + (p[f * 3 + k]! - p[e * 3 + k]!) * s);
      if (kind === 3) { const off = 10 ** (-7 + rand() * 3); on[0] = on[0]! + off * (rand() - 0.5); on[2] = on[2]! + off * (rand() - 0.5); }
      const b: V3 = [2 * on[0]! - a[0]!, 2 * on[1]! - a[1]!, 2 * on[2]! - a[2]!];
      out.push([a, b]);
    }
  }
  return out;
}

const accepts: [string, (p: WorldPoly) => boolean, boolean][] = [
  ['every polygon', () => true, false],
  ['the camera\'s surfaces', isCameraSurface, false],
  ['front entries only', () => true, true],
];

afterEach(() => { vi.restoreAllMocks(); });

describe('CPS collision step 1: segmentHits caches each polygon\'s normal -- the same hits, computed once', () => {
  it('200 recorded segments over a mixed world: every hit identical to the oracle (Object.is on every number)', () => {
    const { grid, polys } = mixedWorld(0x5e6);
    let hits = 0;
    const bad: string[] = [];
    for (const [a, b] of segments(0xa11, polys)) {
      for (const [name, accept, front] of accepts) {
        const want = referenceHits(grid, a, b, accept, ALL_LAYERS, front);
        const got = segmentHits(grid, a, b, accept, ALL_LAYERS, front);
        hits += want.length;
        for (const d of differences(got, want)) bad.push(`${name} ${JSON.stringify([a, b])}: ${d}`);
      }
    }
    expect(bad).toEqual([]);
    expect(hits).toBeGreaterThan(100);   // the comparison is about hits, not about empty lists
  });

  it('polygonNormal runs at most once per polygon over the 200 segments (each accept, both sides)', () => {
    const { grid, polys } = mixedWorld(0x5e7);
    const segs = segments(0xa12, polys);
    const spy = vi.spyOn(collision, 'polygonNormal');
    for (const [a, b] of segs) for (const [, accept, front] of accepts) segmentHits(grid, a, b, accept, ALL_LAYERS, front);
    const per = new Map<Float32Array, number>();
    for (const [points] of spy.mock.calls) per.set(points, (per.get(points) ?? 0) + 1);
    expect(spy.mock.calls.length).toBeGreaterThan(0);
    expect(Math.max(...per.values())).toBe(1);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(polys.length);
  });

  it('a moving owner (`sweep`: a door, a gate, a crane) is not cached: its points turned in place, the hit follows them', () => {
    const wall = poly([-50, 0, 10, 50, 0, 10, 50, 50, 10, -50, 50, 10]);
    const { grid } = worldOf([[wall]], [{ minX: -60, maxX: 60, minZ: -60, maxZ: 60 }]);
    expect(segmentHits(grid, [0, 20, 0], [0, 20, 30]).map((h) => h.poly)).toEqual([wall]);
    // Turned a quarter about the y axis through x = 0 (the door's way: `doors.ts` rewrites the hull's points in place).
    wall.points.set([0, 0, -40, 0, 0, 60, 0, 50, 60, 0, 50, -40]);
    const a: V3 = [-10, 20, 5], b: V3 = [10, 20, 5];
    const got = segmentHits(grid, a, b);
    expect(differences(got, referenceHits(grid, a, b))).toEqual([]);
    expect(got.map((h) => h.poly)).toEqual([wall]);
    expect(Math.abs(got[0]!.normal[0])).toBeCloseTo(1, 9);
  });

  it('a hit\'s normal is its own array: a caller that writes it changes no later hit', () => {
    const wall = poly([-50, 0, 10, 50, 0, 10, 50, 50, 10, -50, 50, 10]);
    const { grid } = worldOf([[wall]]);
    const first = segmentHits(grid, [0, 20, 0], [0, 20, 30])[0]!;
    first.normal[0] = 99; first.normal[2] = 99;
    expect(differences(segmentHits(grid, [0, 20, 0], [0, 20, 30]), referenceHits(grid, [0, 20, 0], [0, 20, 30]))).toEqual([]);
  });
});

/**
 * A world where most owners overlap a ground-level segment's ground-plane box but not its path: an 8 x 8 field of
 * columns, each three plates and a wall high above the ground, and a floor.
 */
function plateWorld() {
  const groups: WorldPoly[][] = [];
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const x = -175 + i * 50, z = -175 + j * 50;
      const plate = (y: number): WorldPoly => poly([x - 10, y, z - 10, x + 10, y, z - 10, x + 10, y, z + 10, x - 10, y, z + 10], 3);
      groups.push([plate(80), plate(120), plate(160), poly([x - 10, 170, z, x + 10, 170, z, x + 10, 200, z, x - 10, 200, z])]);
    }
  }
  groups.push([poly([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200], 3)]);
  return worldOf(groups);
}

/** 200 recorded segments over the plate field: most along the ground, one in five steeply up into the plates. */
function groundSegments(seed: number): [V3, V3][] {
  const rand = prng(seed);
  const out: [V3, V3][] = [];
  for (let i = 0; i < 200; i++) {
    const a: V3 = [rand() * 380 - 190, 2 + rand() * 40, rand() * 380 - 190];
    const yaw = rand() * Math.PI * 2, len = 50 + rand() * 250;
    const up = i % 5 === 0 ? 100 + rand() * 120 : (rand() - 0.5) * 40;
    out.push([a, [a[0] + Math.cos(yaw) * len, a[1] + up, a[2] + Math.sin(yaw) * len]]);
  }
  return out;
}

describe('CPS collision step 2: an owner is skipped only when the segment misses every point its polygons can cross at', () => {
  it('200 recorded segments over the plate field: every hit identical to the oracle, and far fewer polygons tested', () => {
    const { grid } = plateWorld();
    let wantTested = 0, gotTested = 0, hits = 0;
    const bad: string[] = [];
    for (const [a, b] of groundSegments(0xb0b)) {
      for (const [name, accept, front] of accepts) {
        const want = referenceHits(grid, a, b, (p) => { wantTested++; return accept(p); }, ALL_LAYERS, front);
        const got = segmentHits(grid, a, b, (p) => { gotTested++; return accept(p); }, ALL_LAYERS, front);
        hits += want.length;
        for (const d of differences(got, want)) bad.push(`${name} ${JSON.stringify([a, b])}: ${d}`);
      }
    }
    expect(bad).toEqual([]);
    expect(hits).toBeGreaterThan(40);
    expect(gotTested).toBeGreaterThan(0);
    expect(gotTested).toBeLessThan(wantTested / 3);
  });

  it('the mixed world (slivers, tiny and non-convex polygons, segments through and just off edges) stays identical too', () => {
    const { grid, polys } = mixedWorld(0x5e8);
    const bad: string[] = [];
    for (const [a, b] of segments(0xa13, polys)) {
      for (const [name, accept, front] of accepts) {
        for (const d of differences(segmentHits(grid, a, b, accept, ALL_LAYERS, front), referenceHits(grid, a, b, accept, ALL_LAYERS, front))) {
          bad.push(`${name} ${JSON.stringify([a, b])}: ${d}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('a crossing inside the edge tolerance but outside the polygon\'s own box is still found (the reach, not the points\' box)', () => {
    // The triangle lies at y 5 over z 10..11; the segment crosses y 5 at z 10 - 5e-8: outside the points' box, within
    // `inside`'s 1e-7 of the z = 10 edge. Its ground-plane box overlaps the footprint, so the old code tests it -- and hits.
    const tri = poly([10, 5, 10, 11, 5, 10, 10, 5, 11], 3);
    const { grid } = worldOf([[tri]]);
    const a: V3 = [10.5, 15, 9], b: V3 = [10.5, -5, 11 - 1e-7];
    const want = referenceHits(grid, a, b);
    expect(want.map((h) => h.poly)).toEqual([tri]);
    expect(want[0]!.point[2]).toBeLessThan(10);
    expect(differences(segmentHits(grid, a, b), want)).toEqual([]);
    // Clearly off it (the crossing at z 9.5), the owner is skipped: no polygon asked.
    let asked = 0;
    expect(segmentHits(grid, [10.5, 15, 9], [10.5, -5, 10], () => { asked++; return true; })).toEqual([]);
    expect(asked).toBe(0);
  });
});
