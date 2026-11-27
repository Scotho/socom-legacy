// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { polygonNormal, type CollisionObject } from '@s2u/scene';
import { loadSimMap } from '../../viewer/src/simMap';

/**
 * WM-29, research 430 s7.4 (the main controller's ruling of 2026-11-15: MEASURED from the disc before the blast rule's
 * broad phase is designed again, not argued). A census, through the repository's readers (`loadSimMap`: the room's own
 * map and grid), of every collision polygon the grid holds on each multiplayer map, in the terms of s7.2's cases. It
 * changes nothing the game does, asserts only that it ran over every map, and prints its numbers, which are filed in
 * research 430 s7 as MEASURED on the disc's data -- never as the original's behaviour. Per map:
 *
 * - the collision owners and polygons (the costs of s7.3's alternatives A and B), the moving owners (`sweep`), the
 *   polygons by vertex count;
 * - case 4, not planar: for a polygon of more than three vertices, the distance of its LAST vertex -- and of its
 *   farthest vertex -- from the plane of the first three (the raw normal n = (p2 - p1) x (p0 - p1), through p1): the
 *   largest, and how many pass 1e-3 (the broad phase's BOX_PAD), 1e-2, 0.1 and 1;
 * - case 6, not convex: polygons whose corners, projected along n, turn both ways (a turn counted when its cross
 *   product is more than 1e-9 of the two edges' lengths);
 * - case 3, sharp corners: the smallest sin(corner / 2), the largest corner term Be / (|n| x the shorter edge) /
 *   sin(corner / 2), and how many pass 1e-3; and the plane's own term Be / |n|, its largest and how many pass 1e-3;
 * - case 8: polygons whose first three vertices are in a line (n = 0) though `polygonNormal` gives them a normal;
 *   case 7: edges of no length.
 *
 * A dev-disc test: without `SOCOM_DISC` it is skipped (a skip is not a pass). With it, a map the disc lacks or the
 * readers refuse FAILS the test by name.
 */

const DISC = process.env.SOCOM_DISC;
const MAPS = [1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 51, 52, 53, 61, 62, 64, 71, 72, 73, 81, 82, 83] as const;   // `cameraParamsDisc.test.ts`'s 22
const BE = 1.0013580322e-5;
const PAD = 1e-3;

interface Census {
  owners: number; moving: number; polys: number; tri: number; quad: number; more: number;
  lastOff: number; lastOffAt: string; anyOff: number; over: [number, number, number, number];
  notConvex: number; minHalf: number; cornerTerm: number; cornerOver: number; planeTerm: number; planeOver: number;
  rawZero: number; noNormal: number; zeroEdges: number;
}

function census(objects: readonly CollisionObject[]): Census {
  const c: Census = {
    owners: objects.length, moving: 0, polys: 0, tri: 0, quad: 0, more: 0, lastOff: 0, lastOffAt: '', anyOff: 0, over: [0, 0, 0, 0],
    notConvex: 0, minHalf: 1, cornerTerm: 0, cornerOver: 0, planeTerm: 0, planeOver: 0, rawZero: 0, noNormal: 0, zeroEdges: 0,
  };
  for (const object of objects) {
    if (object.owner.sweep) c.moving++;
    for (const poly of object.polys) {
      const p = poly.points, k = p.length / 3;
      c.polys++;
      if (k === 3) c.tri++; else if (k === 4) c.quad++; else c.more++;
      const p1x = p[3]!, p1y = p[4]!, p1z = p[5]!;
      const ux = p[6]! - p1x, uy = p[7]! - p1y, uz = p[8]! - p1z, vx = p[0]! - p1x, vy = p[1]! - p1y, vz = p[2]! - p1z;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, n = Math.hypot(nx, ny, nz);
      if (polygonNormal(p) === null) { c.noNormal++; continue; }
      if (!(n > 0)) { c.rawZero++; continue; }
      // Case 4: each vertex's distance from the plane of the first three.
      let any = 0, last = 0;
      for (let i = 3; i < k; i++) {
        const d = Math.abs(nx * (p[i * 3]! - p1x) + ny * (p[i * 3 + 1]! - p1y) + nz * (p[i * 3 + 2]! - p1z)) / n;
        if (d > any) any = d;
        if (i === k - 1) last = d;
      }
      if (any > c.anyOff) c.anyOff = any;
      if (last > c.lastOff) { c.lastOff = last; c.lastOffAt = `${poly.path} (${k} vertices)`; }
      [1e-3, 1e-2, 0.1, 1].forEach((limit, j) => { if (last > limit) c.over[j]!++; });
      // The edges, and the corners between consecutive edges.
      const ex: number[] = [], ey: number[] = [], ez: number[] = [], len: number[] = [];
      for (let i = 0; i < k; i++) {
        const a = i * 3, b = ((i + 1) % k) * 3;
        const x = p[b]! - p[a]!, y = p[b + 1]! - p[a + 1]!, z = p[b + 2]! - p[a + 2]!;
        ex.push(x); ey.push(y); ez.push(z); len.push(Math.hypot(x, y, z));
      }
      if (len.some((l) => !(l > 0))) { c.zeroEdges++; continue; }
      const plane = BE / n;
      if (plane > c.planeTerm) c.planeTerm = plane;
      if (plane > PAD) c.planeOver++;
      let left = false, right = false, term = 0;
      for (let i = 0; i < k; i++) {
        const j = (i + 1) % k;
        const half = Math.sqrt(Math.max(0, (1 + (ex[i]! * ex[j]! + ey[i]! * ey[j]! + ez[i]! * ez[j]!) / (len[i]! * len[j]!)) / 2));
        if (half < c.minHalf) c.minHalf = half;
        term = Math.max(term, BE / (n * Math.min(len[i]!, len[j]!)) / half);
        // The turn at this corner, seen along n: (e_i x e_j) . n, against the two lengths.
        const turn = ((ey[i]! * ez[j]! - ez[i]! * ey[j]!) * nx + (ez[i]! * ex[j]! - ex[i]! * ez[j]!) * ny + (ex[i]! * ey[j]! - ey[i]! * ex[j]!) * nz) / n;
        if (turn > 1e-9 * len[i]! * len[j]!) left = true;
        else if (turn < -1e-9 * len[i]! * len[j]!) right = true;
      }
      if (left && right) c.notConvex++;
      if (term > c.cornerTerm) c.cornerTerm = term;
      if (term > PAD) c.cornerOver++;
    }
  }
  return c;
}

describe.skipIf(!DISC)('WM-29 (research 430 s7.4): the blast broad phase\'s census of every map\'s collision polygons (dev-disc)', () => {
  it('reads all 22 multiplayer maps and prints the census; a map it cannot read fails by name', { timeout: 1_800_000 }, async () => {
    const missing = MAPS.filter((m) => !existsSync(join(DISC!, `RUN/MP${m}.ZDB`))).map((m) => `MP${m}`);
    expect(missing).toEqual([]);
    const source = new FsAssetSource(DISC!);
    const total = { owners: 0, polys: 0, lastOver: 0, notConvex: 0, cornerOver: 0, planeOver: 0 };
    let worst = 0, worstAt = '';
    for (const m of MAPS) {
      const map = await loadSimMap(source, `RUN/MP${m}.ZDB`);      // a refusal throws: the test fails on this map by its error
      const objects = map.grid.objects.filter((o): o is CollisionObject => o.kind === 'collision');
      const c = census(objects);
      expect(c.polys, `MP${m} holds no collision polygon`).toBeGreaterThan(0);
      console.log(`(WM-29 census) MP${m}: owners ${c.owners} (moving ${c.moving}), polygons ${c.polys} (3: ${c.tri}, 4: ${c.quad}, more: ${c.more})`);
      console.log(`(WM-29 census) MP${m}: case 4 -- last vertex off the first three's plane: largest ${c.lastOff.toExponential(3)} at ${c.lastOffAt || 'none'}; any vertex: largest ${c.anyOff.toExponential(3)}; last vertex over 1e-3: ${c.over[0]}, over 1e-2: ${c.over[1]}, over 0.1: ${c.over[2]}, over 1: ${c.over[3]}`);
      console.log(`(WM-29 census) MP${m}: case 6 -- not convex ${c.notConvex}; case 3 -- smallest sin(corner/2) ${c.minHalf.toExponential(3)}, largest corner term ${c.cornerTerm.toExponential(3)}, over 1e-3: ${c.cornerOver}; the plane's term: largest ${c.planeTerm.toExponential(3)}, over 1e-3: ${c.planeOver}`);
      console.log(`(WM-29 census) MP${m}: case 8 -- raw normal 0 with a polygon normal: ${c.rawZero}; no polygon normal: ${c.noNormal}; case 7 -- polygons with an edge of no length: ${c.zeroEdges}`);
      total.owners += c.owners; total.polys += c.polys; total.lastOver += c.over[0]; total.notConvex += c.notConvex; total.cornerOver += c.cornerOver; total.planeOver += c.planeOver;
      if (c.lastOff > worst) { worst = c.lastOff; worstAt = `MP${m} ${c.lastOffAt}`; }
    }
    console.log(`(WM-29 census) ALL ${MAPS.length} MAPS: owners ${total.owners}, polygons ${total.polys}; last vertex over 1e-3 off its plane: ${total.lastOver} (largest ${worst.toExponential(3)} at ${worstAt || 'none'}); not convex ${total.notConvex}; corner term over 1e-3: ${total.cornerOver}; plane term over 1e-3: ${total.planeOver}`);
    expect(total.polys).toBeGreaterThan(0);
  });
});

/** The instrument itself, on polygons made by hand: run everywhere, so a box run's numbers rest on a checked census. */
describe('WM-29: the census instrument on synthetic polygons (no game data)', () => {
  const object = (...polys: number[][]): CollisionObject => ({
    kind: 'collision', owner: { modelName: 'worldmodel', path: 'worldmodel/q', first: 0, count: polys.length },
    polys: polys.map((points, i) => ({ modelName: 'worldmodel', path: `worldmodel/q${i}`, region: 0, ditype: 2, material: 25, ptcount: points.length / 3, cameratype: 0, points: Float32Array.from(points) })),
  } as unknown as CollisionObject);

  it('a square: planar, convex, no sharp corner', () => {
    const c = census([object([0, 0, 0, 10, 0, 0, 10, 0, 10, 0, 0, 10])]);
    expect([c.owners, c.polys, c.quad, c.notConvex, c.over[0], c.rawZero, c.zeroEdges]).toEqual([1, 1, 1, 0, 0, 0, 0]);
    expect(c.lastOff).toBe(0);
    expect(c.minHalf).toBeCloseTo(Math.SQRT1_2, 9);            // a right corner: sin(45 degrees)
    expect(c.planeTerm).toBeCloseTo(BE / 100, 12);             // |n| = 10 x 10
  });

  it('the third review\'s quad: its last vertex 0.7071 off the plane of the first three', () => {
    const c = census([object([0, 0, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1])]);
    expect(c.lastOff).toBeCloseTo(Math.SQRT1_2, 6);
    expect(c.over).toEqual([1, 1, 1, 0]);
    expect(c.lastOffAt).toContain('worldmodel/q0');
  });

  it('the second review\'s sliver: sin(corner / 2) 0.025 at its tip, a corner term of 8e-3, over the pad', () => {
    const c = census([object([0, 0, 0, 1, 0, 0.025, 1, 0, -0.025])]);
    expect(c.tri).toBe(1);
    expect(c.minHalf).toBeCloseTo(0.025, 4);
    expect(c.cornerTerm).toBeGreaterThan(7e-3);
    expect(c.cornerTerm).toBeLessThan(9e-3);
    expect(c.cornerOver).toBe(1);
  });

  it('a dart is not convex; three points in a line first give a raw normal of 0; a doubled vertex an edge of no length', () => {
    expect(census([object([0, 0, 0, 10, 0, 0, 3, 0, 3, 0, 0, 10])]).notConvex).toBe(1);
    expect(census([object([0, 0, 0, 5, 0, 0, 10, 0, 0, 10, 0, 10])]).rawZero).toBe(1);
    expect(census([object([0, 0, 0, 10, 0, 0, 10, 0, 10, 10, 0, 10])]).zeroEdges).toBe(1);
  });
});
