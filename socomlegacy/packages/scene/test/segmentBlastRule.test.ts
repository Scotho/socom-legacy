import { describe, expect, it } from 'vitest';
import { buildGrid, cellRange, chopF32, polygonNormal, segmentHits, ALL_LAYERS, type CollisionObject, type CollisionOwner, type Footprint, type Grid, type GridParams, type NodeBox, type WorldPoly } from '../src/index';

/**
 * WM-29 (research 430 s3 and its micro addendum; the controller's (B)): `segmentHits`' blast modes, the original's ray
 * query as 8f read its VU0 microprogram (instructions 288-333; r1 file 0x2c6b50, r4 file 0x2f1cf0). Per polygon, n the
 * UNNORMALISED (p2-p1)x(p0-p1), ds = n.(start-p1), de = n.(end-p1): 'blast' (one-sided) a hit iff ds + 9.99999975e-6 >= 0
 * and de + 1.0013580322e-5 < 0; t = ds / (ds - de) as computed, no window, no clamp (LATER 1252: the two-sided
 * 'blast-scene', the scene line's former departure, retired). Every other caller keeps the
 * default path.
 *
 * Here: off the planes' bands the blast modes give the default path's hits exactly (the same polygons, t, points) over a
 * fixed set of segments through a box of walls; and from a start on a plane the RULE's answer for the float32 residual.
 */

function quad(points: number[]): WorldPoly {
  return { modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(points) };
}
const wallX = (x: number, flip: boolean): WorldPoly => quad(flip ? [x, 0, -50, x, 50, -50, x, 50, 50, x, 0, 50] : [x, 0, -50, x, 0, 50, x, 50, 50, x, 50, -50]);
const wallZ = (z: number, flip: boolean): WorldPoly => quad(flip ? [-50, 0, z, -50, 50, z, 50, 50, z, 50, 0, z] : [-50, 0, z, 50, 0, z, 50, 50, z, -50, 50, z]);

function world(polys: WorldPoly[]) {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

/** A fixed pseudo-random set of segments: starts and ends inside the box, none on a wall's plane. */
function segments(): [number, number, number][][] {
  let seed = 7;
  const r = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const v = (): [number, number, number] => [Math.round((r() * 160 - 80) * 7) / 7 + 0.013, 1 + r() * 48, Math.round((r() * 160 - 80) * 7) / 7 + 0.017];
  return Array.from({ length: 200 }, () => [v(), v()]);
}

describe('WM-29 (B): segmentHits\' blast modes against the default path (synthetic)', () => {
  const grid = world([wallX(-30, false), wallX(10, true), wallX(40, false), wallZ(-20, true), wallZ(25, false)]);
  /** The same polygons in the same order, and the same t and point to a tolerance (the mode computes t from the raw normal). */
  const same = (x: ReturnType<typeof segmentHits>, y: ReturnType<typeof segmentHits>): void => {
    expect(x.map((h) => h.poly)).toEqual(y.map((h) => h.poly));
    x.forEach((h, j) => {
      expect(Math.abs(h.t - y[j]!.t)).toBeLessThan(1e-9);
      for (let k = 0; k < 3; k++) expect(Math.abs(h.point[k]! - y[j]!.point[k]!)).toBeLessThan(1e-6);
    });
  };

  // LATER 1252: the two-sided 'blast-scene' half (the port's former departure) retired with the mode.
  it('off every plane, \'blast\' gives the default one-sided hits', () => {
    for (const [a, b] of segments()) {
      same(segmentHits(grid, a!, b!, undefined, ALL_LAYERS, 'blast'), segmentHits(grid, a!, b!, undefined, ALL_LAYERS, true));
    }
  });

  it('a start on a plane: the micro\'s rule on the float32 residual (n = (-5000, 0, 0); ds stated)', () => {
    // x 0.05: ds = +3.73e-6 (in front); 0.7: ds = -5.96e-5 (behind, past the band); 0.01: ds = -1.12e-6 (behind by the
    // residual, inside the start's inclusive band: in front); 123.4: ds = +7.63e-3 (in front).
    const cases = [
      { x: 0.05, inFront: true }, { x: 0.7, inFront: false }, { x: 0.01, inFront: true }, { x: 123.4, inFront: true },
    ];
    for (const { x, inFront } of cases) {
      expect(-5000 * (x - Math.fround(x)) + 9.99999975e-6 >= 0).toBe(inFront);
      const g = world([wallX(x, false)]);                      // its raw normal (0,50,0)x(0,0,-100) = (-5000, 0, 0)
      const on: [number, number, number] = [x, 20, 0];
      const toFront: [number, number, number] = [x - 30, 20, 0], toBehind: [number, number, number] = [x + 30, 20, 0];
      expect(segmentHits(g, on, toBehind, undefined, ALL_LAYERS, 'blast')).toHaveLength(inFront ? 1 : 0);
      expect(segmentHits(g, on, toFront, undefined, ALL_LAYERS, 'blast')).toHaveLength(0);
      // Every x tests the RULE on the port's double inputs, not a prediction of the original at that spot (8f's check,
      // notes 2 and 6).
    }
  });

  // The controller's ruling (b), 2026-11-15: the broad phase is widened by the rule's band in the two blast modes ONLY.
  // At x 0.01 the start lies 2.2e-10 behind the wall's float32 plane: the blast modes are asked the rule (above); the
  // default path's rejects are the lines they were, and both of its modes still find nothing there.
  it('the default path at the same spot is unchanged: a start 2.2e-10 behind the plane crosses nothing, one-sided or two', () => {
    const x = 0.01, g = world([wallX(x, false)]);
    expect(x - Math.fround(x)).toBeGreaterThan(0);
    const on: [number, number, number] = [x, 20, 0], toBehind: [number, number, number] = [x + 30, 20, 0];
    expect(segmentHits(g, on, toBehind, undefined, ALL_LAYERS, true)).toHaveLength(0);
    expect(segmentHits(g, on, toBehind, undefined, ALL_LAYERS, false)).toHaveLength(0);
    expect(segmentHits(g, on, toBehind)).toHaveLength(0);
    expect(segmentHits(g, on, toBehind, undefined, ALL_LAYERS, 'blast')).toHaveLength(1);
  });

  // The fresh review's finding 1 (2026-11-15): the rule has no test of t (8f's re-decode s4), so from a start inside the
  // band BEHIND a plane the hit point lies BACK along the line, t in (-Bs / (Be - Bs), 0) -- about -736 -- and on a line
  // shallow to the plane that is far outside the segment's own box. Here ds = -1.12e-6 (in front by the band),
  // de = -1.11e-5 (behind), t = -0.112: the point is at z 47.6, on the wall (z -50..50), while the segment runs z 51..81.
  it('a hit point back along a shallow line, outside the segment\'s box, is still asked of the rule (one-sided)', () => {
    const x = 0.01, g = world([wallX(x, false)]);
    const a: [number, number, number] = [x, 20, 51], b: [number, number, number] = [x + 2e-9, 20, 81];
    const ds = -5000 * (a[0] - Math.fround(x)), de = -5000 * (b[0] - Math.fround(x));
    expect(ds + 9.99999975e-6 >= 0 && de + 1.0013580322e-5 < 0).toBe(true);
    const hits = segmentHits(g, a, b, undefined, ALL_LAYERS, 'blast');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.t).toBeCloseTo(ds / (ds - de), 9);
    expect(hits[0]!.point[2]).toBeCloseTo(51 + 30 * (ds / (ds - de)), 6);
    expect(segmentHits(g, a, b, undefined, ALL_LAYERS, true)).toHaveLength(0);   // the default path: unchanged
  });

  // The second review's finding 1 (2026-11-15): at a SHARP corner the edge test's bias reaches further than the bias
  // over the edge's length -- the two edges' offset lines meet delta / sin(corner / 2) outside the vertex. A sliver
  // triangle, n = +y, |n| = 0.05; a line straight down through (-0.007, 0, 0), 0.007 outside its sharp corner at the
  // origin: both edge sums there are +1.25e-6 and the third is positive, so the rule hits at t = 0.5.
  it('a hit point just outside a sharp corner, inside the edge test\'s bias, is still asked of the rule (one-sided)', () => {
    const sliver: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material: 25, ptcount: 3, cameratype: 0,
      points: Float32Array.from([0, 0, 0, 1, 0, 0.025, 1, 0, -0.025]) };
    const g = world([sliver]);
    const a: [number, number, number] = [-0.007, 1, 0], b: [number, number, number] = [-0.007, -1, 0];
    const hits = segmentHits(g, a, b, undefined, ALL_LAYERS, 'blast');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.t).toBeCloseTo(0.5, 9);
    expect(segmentHits(g, a, b, undefined, ALL_LAYERS, true)).toHaveLength(0);   // the default path: outside the polygon
  });
});

/**
 * WM-29, research 430 s7 (the main controller's ruling of 2026-11-15: build B, test first): in the blast mode (one since LATER 1252) the
 * rule's own plane test is asked of EVERY polygon of the map -- no cell, footprint, box or band stands before it. The
 * thirteen cases of s7.2, each a named test, and a sweep against an ORACLE: the rule transcribed here from s3.1 and
 * s7.1 (raw n = (p2 - p1) x (p0 - p1); the plane through the LAST vertex; ds + 9.99999975e-6 >= 0 and
 * de + 1.0013580322e-5 < 0, two-sided also the reverse; t = ds / (ds - de) with no window; per edge
 * (q - v_i) . (n x e_i) + 9.99999975e-6 >= 0), asked of every polygon with no broad phase at all.
 */
describe('WM-29 (B): the blast modes ask the rule of every polygon -- s7.2\'s cases and the oracle', () => {
  type P3 = [number, number, number];
  const BS = 9.99999975e-6, BE = 1.0013580322e-5;
  const poly = (points: number[], path = 'worldmodel/q'): WorldPoly =>
    ({ modelName: 'worldmodel', path, region: 0, ditype: 2, material: 25, ptcount: points.length / 3, cameratype: 0, points: Float32Array.from(points) });
  /** The rule on one polygon, transcribed: t, or null. */
  const rule = (p: Float32Array, a: P3, b: P3): number | null => {
    const k = p.length / 3, v = (i: number): P3 => [p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!];
    const sub = (x: P3, y: P3): P3 => [x[0] - y[0], x[1] - y[1], x[2] - y[2]];
    const cross = (x: P3, y: P3): P3 => [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
    const dot = (x: P3, y: P3): number => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
    const n = cross(sub(v(2), v(1)), sub(v(0), v(1))), last = v(k - 1);
    const ds = dot(n, sub(a, last)), de = dot(n, sub(b, last));
    const front = ds + BS >= 0, behind = de + BE < 0;
    if (!(front && behind)) return null;
    if (ds - de === 0) return null;
    const t = ds / (ds - de), q: P3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    for (let i = 0; i < k; i++) if (dot(sub(q, v(i)), cross(n, sub(v((i + 1) % k), v(i)))) + BS < 0) return null;
    return t;
  };
  /** B: the rule of every polygon. */
  const ruleAll = (polys: WorldPoly[], a: P3, b: P3): { index: number; t: number }[] =>
    polys.flatMap((p, index) => { const t = rule(p.points, a, b); return t === null ? [] : [{ index, t }]; })
      .sort((x, y) => x.t - y.t || x.index - y.index);
  /**
   * LATER 1094: the original's walk for one line, transcribed here apart from `segment.ts` -- the cells `FUN_002d66b0`
   * marks for a segment record (count 2, flag 1: D:L177059-177067, the setup D:L177260-177297, the normals
   * D:L177104-177111), each step in float32; and the node box `FUN_003124f0` (D:L213172-213241) on every node of the
   * owner's chain, in the node's frame. Each step chopped toward zero as the EE rounds (`chopF32`).
   */
  const f = Math.fround, c = chopF32;
  const marked = (g: Grid, a: P3, b: P3): Set<number> => {
    const { cellsX, cellsZ, cellDim, originX, originZ } = g.params, cell = f(cellDim), inv = g.invCellDim;
    const idx = (p: number, o: number, n: number): number => Math.min(n - 1, Math.max(0, Math.trunc(c(inv * c(c(f(p) - f(o)) + f(0.0001))))));
    const P = [[f(a[0]), f(a[2])], [f(b[0]), f(b[2])]] as const;
    const xs = [idx(a[0], originX, cellsX), idx(b[0], originX, cellsX)], zs = [idx(a[2], originZ, cellsZ), idx(b[2], originZ, cellsZ)];
    const n = [0, 1].map((e) => {
      const o = 1 - e;
      let n94 = c(P[e]![0] - P[o]![0]), n8c = c(P[o]![1] - P[e]![1]);
      const len = c(Math.sqrt(c(c(n94 * n94) + c(n8c * n8c))));
      if (len !== 0) { const r = c(1 / len); n94 = c(n94 * r); n8c = c(n8c * r); }
      return [n8c, n94] as const;                                              // the x factor, the z factor
    });
    const w = f(f(cell * 0.5) * f(Math.SQRT2)), out = new Set<number>();
    for (let z = Math.min(...zs); z <= Math.max(...zs); z++) {
      for (let x = Math.min(...xs); x <= Math.max(...xs); x++) {
        const cx = c(c(cell * 0.5) + c(f(originX) + c(x * cell))), cz = c(c(cell * 0.5) + c(f(originZ) + c(z * cell)));
        const keep = [0, 1].every((e) => { const v = c(c(c(cz - P[e]![1]) * n[e]![1]) + c(c(cx - P[e]![0]) * n[e]![0])); return !(v < -w) && !(w < v); });
        if (keep) out.add(x + z * cellsX);
      }
    }
    return out;
  };
  /**
   * The original's inverse applied to a point (`FUN_00308160`, D:L206756-206800): (p - T) x M^T / |M's first row|^2 for
   * row vectors -- the inverse for a turn times a uniform scale, and the original's own answer for any other frame.
   */
  const toLocal = (m: Float32Array, p: P3): P3 => {
    const q: P3 = [p[0] - m[12]!, p[1] - m[13]!, p[2] - m[14]!], k = 1 / (m[0]! * m[0]! + m[1]! * m[1]! + m[2]! * m[2]!);
    return [(q[0] * m[0]! + q[1] * m[1]! + q[2] * m[2]!) * k, (q[0] * m[4]! + q[1] * m[5]! + q[2] * m[6]!) * k, (q[0] * m[8]! + q[1] * m[9]! + q[2] * m[10]!) * k];
  };
  const refuses = (owner: CollisionOwner, a: P3, b: P3): boolean => !owner.sweep && (owner.nodes ?? []).some((n) => {
    if (n.free) return false;
    const la = toLocal(n.world, a), lb = toLocal(n.world, b);
    return [0, 1, 2].some((k) => (la[k]! < n.bbox[k]! && lb[k]! < n.bbox[k]!) || (n.bbox[k + 3]! < la[k]! && n.bbox[k + 3]! < lb[k]!));
  });
  const reached = (g: Grid, o: CollisionObject, a: P3, b: P3): boolean => {
    const r = o.owner.filed && !o.owner.sweep ? cellRange(g, o.owner.filed) : o.cells, m = marked(g, a, b);
    let inCell = false;
    for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) if (m.has(x + z * g.params.cellsX)) inCell = true;
    return inCell && !refuses(o.owner, a, b);
  };
  /** The ORACLE: B's hits on the polygons the original's walk reaches. */
  const oracle = (polys: WorldPoly[], a: P3, b: P3, g: Grid = world(polys)): { index: number; t: number }[] => {
    const objects = g.objects.filter((o): o is CollisionObject => o.kind === 'collision');
    return ruleAll(polys, a, b).filter((h) => { const o = objects.find((x) => x.polys.includes(polys[h.index]!)); return o !== undefined && reached(g, o, a, b); });
  };
  const got = (g: ReturnType<typeof world>, polys: WorldPoly[], a: P3, b: P3): { index: number; t: number }[] =>
    segmentHits(g, a, b, undefined, ALL_LAYERS, 'blast').map((h) => ({ index: polys.indexOf(h.poly), t: h.t })).sort((x, y) => x.t - y.t || x.index - y.index);
  const agree = (polys: WorldPoly[], a: P3, b: P3, g = world(polys)): void => {
    const want = oracle(polys, a, b, g), have = got(g, polys, a, b);
    expect(have.map((h) => h.index), `${a} -> ${b}`).toEqual(want.map((h) => h.index));
    have.forEach((h, i) => expect(Math.abs(h.t - want[i]!.t)).toBeLessThan(1e-9));
  };

  // The third review's quad, 50 times the size and 5 along x: its last vertex 35.4 off the plane of the first three.
  const warpedPoints = [5, 0, 0, 55, 50, 0, 55, 50, 50, 5, 50, 50];
  const warped = poly(warpedPoints);
  const warpedLine: [P3, P3] = [[5 - 17.93, 27.07, 5], [5 - 17.93, 37.07, 5]];

  const IDENTITY = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const params100: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const params10: GridParams = { atomCount: 8192, posts: 16, cellDim: 10, cellsX: 40, cellsZ: 40, originX: -200, originZ: -200 };
  /** One owner a polygon, each with its node chain and the footprint its filed node gives. */
  const boxed = (params: GridParams, polys: WorldPoly[], nodes: NodeBox[][], filed?: Footprint): Grid => buildGrid(params, [], [], polys, polys.map((p, i): CollisionOwner => {
    const top = nodes[i]![0]!;
    return { modelName: 'worldmodel', path: `${p.path}${i}`, first: i, count: 1, nodes: nodes[i]!, filed: filed ?? { minX: top.bbox[0]!, minZ: top.bbox[2]!, maxX: top.bbox[3]!, maxZ: top.bbox[5]! } };
  }));

  // LATER 1094 (the review of 79d589a7e0 FAILED, medium: B pinned hits the original very probably does not have). The
  // third review's quad, moved 20 along x (its vertices x 25..75, its box the same): the rule hits it at x 7.07 on the
  // plane through its last vertex -- and the original never asks the rule, because both ends lie left of the box's
  // x minimum (FUN_003124f0 D:L213191-213195). With the node's flag bit 30 set the box refuses nothing (D:L213184).
  it('case 4, not planar, RE-PINNED: the hit outside the vertices\' box is refused by the node box (both ends below its x minimum)', () => {
    const shifted = poly(warpedPoints.map((v, i) => (i % 3 === 0 ? v + 20 : v)));
    const line: [P3, P3] = [[7.07, 27.07, 5], [7.07, 37.07, 5]];
    expect(rule(shifted.points, line[0], line[1])).toBeCloseTo(0.5, 6);  // B hits it
    const box = Float32Array.from([25, 0, 0, 75, 50, 50]);
    const g = boxed(params100, [shifted], [[{ bbox: box, world: IDENTITY }]]);
    expect(marked(g, line[0], line[1]).has(2 + 2 * 4)).toBe(true);           // the owner's cell IS walked: the box alone refuses
    expect(segmentHits(g, line[0], line[1], undefined, ALL_LAYERS, 'blast')).toHaveLength(0);
    const free = boxed(params100, [shifted], [[{ bbox: box, world: IDENTITY, free: true }]]);
    const hits = segmentHits(free, line[0], line[1], undefined, ALL_LAYERS, 'blast');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.point[0]).toBeLessThan(25);                               // left of every vertex: B's hit, let through
  });

  it('case 5, an edge that leaves the plane: the same quad, lines by its projected edge', () => {
    for (const x of [-12.5, -12.9, -12.99, -13.5]) agree([warped], [x, 20, 25], [x, 45, 25]);
  });

  // LATER 1094: the same hit point (-12.93, 32.07, 5) on the third review's quad, by a line the node box lets through (its
  // ends straddle the box's x minimum and z minimum) whose x-z path passes outside the box's corner (5, 0): on 10-unit
  // cells no cell the line marks is one the owner is filed in, so the original never offers the owner.
  it('case 9, the cells, RE-PINNED: a line the box lets through, whose cells are none of the owner\'s, finds nothing', () => {
    const line: [P3, P3] = [[7.07, 32.07, -15], [-32.93, 32.07, 25]];
    expect(rule(warped.points, line[0], line[1])).toBeCloseTo(0.5, 6);  // B hits it, at x -12.93
    const node: NodeBox = { bbox: Float32Array.from([5, 0, 0, 55, 50, 50]), world: IDENTITY };
    const g = boxed(params10, [warped], [[node]]);
    const o = g.objects.find((x): x is CollisionObject => x.kind === 'collision')!;
    expect(refuses(o.owner, line[0], line[1])).toBe(false);                   // the box lets it through
    const r = cellRange(g, o.owner.filed!), m = marked(g, line[0], line[1]);
    for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) expect(m.has(x + z * 40)).toBe(false);
    expect(segmentHits(g, line[0], line[1], undefined, ALL_LAYERS, 'blast')).toHaveLength(0);
    // On 100-unit cells the same line marks the owner's cell: it is offered, and hit.
    const coarse = boxed(params100, [warped], [[node]]);
    expect(segmentHits(coarse, line[0], line[1], undefined, ALL_LAYERS, 'blast')).toHaveLength(1);
  });

  it('the node box is asked in the node\'s own frame, on every node of the chain, and a parent\'s refusal refuses the owner', () => {
    // A wall x = 10 (one-sided hits from x under 10). Its node is turned a quarter about y and moved to (100, 0, 0):
    // world = local x M + T with M's rows (0, 0, -1), (0, 1, 0), (1, 0, 0) -- local (u, v, w) is world (100 + w, v, -u).
    const turned = Float32Array.from([0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 100, 0, 0, 1]);
    const wall = wallX(10, false);
    const line: [P3, P3] = [[0, 20, 0], [30, 20, 0]];
    expect(rule(wall.points, line[0], line[1])).toBeCloseTo(1 / 3, 9);
    // The box in the turned frame: world x 0..40 is local w -100..-60, world z -50..50 is local u -50..50 -> both ends'
    // local w are -100 and -70: inside. A box of local w -60..-20 holds neither end: both below its minimum -> refused.
    const inside: NodeBox = { bbox: Float32Array.from([-50, 0, -100, 50, 50, -60]), world: turned };
    const beside: NodeBox = { bbox: Float32Array.from([-50, 0, -60, 50, 50, -20]), world: turned };
    // Filed by the box carried into the world (`worldFootprint`): local w -100..-60 is world x 0..40, u -50..50 is z 50..-50.
    const g1 = boxed(params100, [wall], [[inside]], { minX: 0, minZ: -50, maxX: 40, maxZ: 50 });
    const g2 = boxed(params100, [wall], [[beside]], { minX: 40, minZ: -50, maxX: 80, maxZ: 50 });
    expect(segmentHits(g1, line[0], line[1], undefined, ALL_LAYERS, 'blast')).toHaveLength(1);
    expect(segmentHits(g2, line[0], line[1], undefined, ALL_LAYERS, 'blast')).toHaveLength(0);
    // A chain: the parent's box refuses, the owner's own box lets it through -> refused (D:L175102, D:L175396-175402).
    const own: NodeBox = { bbox: Float32Array.from([10, 0, -50, 10, 50, 50]), world: IDENTITY };
    const parentNo: NodeBox = { bbox: Float32Array.from([50, 0, -50, 90, 50, 50]), world: IDENTITY };
    const parentYes: NodeBox = { bbox: Float32Array.from([-90, 0, -90, 90, 90, 90]), world: IDENTITY };
    expect(segmentHits(boxed(params100, [wall], [[parentYes, own]]), line[0], line[1], undefined, ALL_LAYERS, 'blast')).toHaveLength(1);
    expect(segmentHits(boxed(params100, [wall], [[parentNo, own]]), line[0], line[1], undefined, ALL_LAYERS, 'blast')).toHaveLength(0);
    expect(segmentHits(boxed(params100, [wall], [[{ ...parentNo, free: true }, own]]), line[0], line[1], undefined, ALL_LAYERS, 'blast')).toHaveLength(1);
    // The review of fc0cb0622b, S1: a frame that is not a turn times a uniform scale -- x doubled, diag(2, 1, 1) -- is
    // inverted as the original inverts it, over |first row|^2 = 4: world y 40 is local y 10, inside a box of y 0..20, so
    // the line is NOT refused (a true inverse would read y 40 and refuse it).
    const stretched: NodeBox = { bbox: Float32Array.from([-100, 0, -100, 100, 20, 100]), world: Float32Array.from([2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) };
    const high: [P3, P3] = [[0, 40, 0], [30, 40, 0]];
    expect(toLocal(stretched.world, high[0])[1]).toBe(10);
    expect(segmentHits(boxed(params100, [wall], [[stretched]], { minX: -200, minZ: -100, maxX: 200, maxZ: 100 }), high[0], high[1], undefined, ALL_LAYERS, 'blast')).toHaveLength(1);
    // Strict: an end ON a face is not beyond it (D:L213191: `<`, not `<=`).
    const onFace: NodeBox = { bbox: Float32Array.from([30, 0, -50, 60, 50, 50]), world: IDENTITY };
    expect(segmentHits(boxed(params100, [wall], [[onFace]]), line[0], line[1], undefined, ALL_LAYERS, 'blast')).toHaveLength(1);
  });

  it('the walk against the oracle: 600 lines over boxed owners on 10-unit cells, the one blast mode -- B\'s hits on what the walk reaches', () => {
    const polys = [wallX(-30, false), wallX(10, true), wallZ(-20, true), wallZ(25, false), warped, poly([40, 10, 40, 80, 10, 41, 80, 12.5, 80, 40, 10.2, 79])];
    const boxOf = (p: WorldPoly): Float32Array => {
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < p.points.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, p.points[i + k]!); hi[k] = Math.max(hi[k]!, p.points[i + k]!); }
      return Float32Array.from([...lo, ...hi]);
    };
    const g = boxed(params10, polys, polys.map((p) => [{ bbox: boxOf(p), world: IDENTITY }]));
    let seed = 31;
    const r = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const v = (): P3 => [r() * 180 - 90, r() * 60 - 5, r() * 180 - 90];
    let byB = 0, byWalk = 0;
    for (let i = 0; i < 600; i++) {
      const a = v(), b = v();
      byB += ruleAll(polys, a, b).length;
      byWalk += oracle(polys, a, b, g).length;
      agree(polys, a, b, g);
    }
    expect(byWalk).toBeGreaterThan(100);                                       // the walk lets most through
    expect(byWalk).toBeLessThan(byB);                                          // and refuses some B hits
  });

  it('case 10, a moving owner (sweep): asked the rule on its polygons as they stand, as a static one', () => {
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
    const door = poly(warpedPoints, 'worldmodel/door');
    const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/door', first: 0, count: 1, sweep: { minX: 0, minZ: -10, maxX: 60, maxZ: 60 } }];
    const g = buildGrid(params, [], [], [door], owners);
    expect(segmentHits(g, warpedLine[0], warpedLine[1], undefined, ALL_LAYERS, 'blast')).toHaveLength(1);
    // Its points change in place and nothing is kept for it. Moved 200 along x, the same line finds nothing; then TURNED
    // onto another plane (the wall x = 10, its raw normal (-5000, 0, 0) where the quad's was (-2500, 2500, 0)): a kept raw
    // normal would misjudge it (the review of dee83b8f95, finding 2: a translation alone leaves the raw normal as it was).
    for (let i = 0; i < door.points.length; i += 3) door.points[i] = door.points[i]! + 200;
    expect(segmentHits(g, warpedLine[0], warpedLine[1], undefined, ALL_LAYERS, 'blast')).toHaveLength(0);
    door.points.set(wallX(10, false).points);
    const a: P3 = [0, 20, 0], b: P3 = [30, 20, 0];
    expect(rule(door.points, a, b)).toBeCloseTo(1 / 3, 9);
    const turned = segmentHits(g, a, b, undefined, ALL_LAYERS, 'blast');
    expect(turned).toHaveLength(1);
    expect(turned[0]!.t).toBeCloseTo(1 / 3, 9);
    expect(segmentHits(g, b, a, undefined, ALL_LAYERS, 'blast')).toHaveLength(0);          // from behind it, one-sided: nothing
  });

  it('case 6, not convex (a dart): the rule\'s own half-planes decide, whatever its shape', () => {
    const dart = poly([0, 0, 0, 40, 0, 0, 12, 0, 12, 0, 0, 40]);
    for (const [x, z] of [[5, 5], [20, 3], [3, 20], [14, 14], [25, 25], [-0.000001, 10], [11.999, 12.001]] as const) agree([dart], [x, 10, z], [x, -10, z]);
  });

  it('case 7, a doubled vertex: hit as any polygon (its edge of no length refuses nothing); case 8, the first three vertices in a line (n = 0): never hit', () => {
    const doubled = poly([0, 0, 0, 40, 0, 0, 40, 0, 40, 40, 0, 40]);
    // LATER 1252: crossed from its front (the raw normal (0, -1600, 0): the start below), as the one mode asks.
    agree([doubled], [30, -10, 10], [30, 10, 10]);
    expect(segmentHits(world([doubled]), [30, -10, 10], [30, 10, 10], undefined, ALL_LAYERS, 'blast')).toHaveLength(1);
    const inLine = poly([0, 0, 0, 20, 0, 0, 40, 0, 0, 40, 0, 40]);
    expect(polygonNormal(inLine.points)).not.toBeNull();
    expect(segmentHits(world([inLine]), [30, -10, 10], [30, 10, 10], undefined, ALL_LAYERS, 'blast')).toHaveLength(0);
    agree([inLine], [30, 10, 10], [30, -10, 10]);
  });

  // The review of dee83b8f95, Q1: a polygon with NO polygon normal (`polygonNormal` null: its Newell sum is 0) whose raw
  // normal is not 0 is still a polygon to the rule -- the rule knows only the raw normal. The quad doubles back on its
  // second vertex; the line passes through that vertex, where every edge sum is exactly 0 (inside by the bias).
  it('a polygon with no polygon normal but a raw normal (16 on the disc, s7.5) is asked the rule and can be hit', () => {
    const folded = poly([0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0]);
    expect(polygonNormal(folded.points)).toBeNull();
    const a: P3 = [1, 0, 1], b: P3 = [1, 0, -1];
    expect(rule(folded.points, a, b)).toBe(0.5);
    const hits = segmentHits(world([folded]), a, b, undefined, ALL_LAYERS, 'blast');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.t).toBe(0.5);
    expect(hits[0]!.normal.map((x) => x + 0)).toEqual([0, 0, 1]);              // the raw normal's direction (a -0 read as 0): it has no other
    expect(segmentHits(world([folded]), a, b, undefined, ALL_LAYERS, true)).toHaveLength(0);   // the default path: no normal, no crossing
  });

  // LATER 1252: case 11 (the two-sided mode's from-behind hit past the end) retired with the mode.

  it('case 13, which polygon of an owner is offered first: an owner\'s polygons are offered in its own order', () => {
    const polys = [wallX(10, false), wallX(20, false), wallX(30, false)];
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
    const g = buildGrid(params, [], [], polys, [{ modelName: 'worldmodel', path: 'worldmodel/three', first: 0, count: 3 }]);
    const offered: number[] = [];
    const hits = segmentHits(g, [0, 20, 0], [40, 20, 0], (p) => { offered.push(polys.indexOf(p)); return true; }, ALL_LAYERS, 'blast');
    expect(hits).toHaveLength(3);
    expect(offered).toEqual([0, 1, 2]);
  });

  // The controller's ruling after the measured gate was missed (2026-11-15; research 430 s7.7): the start's sums are kept
  // while the start is the same -- every line of one blast starts at the same point. The same oracle; the lines now SHARE
  // starts, change them and come back, switch modes on one start, and are asked from inside another query's `accept`.
  const hostile = (): WorldPoly[] => [
    wallX(-30, false), wallX(10, true), wallZ(-20, true), wallZ(25, false), poly(warpedPoints),
    poly([60, 0, -60, 61, 0, -59.975, 61, 0, -60.025]), poly([-80, 0, 40, -40, 0, 40, -68, 0, 52, -80, 0, 80]),
    poly([-60, 30, -60, -20, 30, -60, -20, 30, -20, -20, 30, -20]), poly([40, 10, 40, 80, 10, 41, 80, 12.5, 80, 40, 10.2, 79]),
    poly([0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0]),
  ];
  const rng = (seed: number) => (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  it('lines of one blast share their start: 40 starts, 15 ends each, the start sums kept across its lines -- the oracle\'s hits', () => {
    const polys = hostile(), g = world(polys), r = rng(23);
    const v = (): P3 => [r() * 180 - 90, r() * 60 - 5, r() * 180 - 90];
    let hits = 0;
    for (let s = 0; s < 40; s++) {
      const a: P3 = s % 5 === 1 ? [Math.fround(10) + (r() - 0.5) * 4e-9, r() * 40, r() * 80 - 40] : v();   // some starts in a wall's band
      for (let e = 0; e < 15; e++) { const b = v(); hits += oracle(polys, a, b).length; agree(polys, a, b, g); }
    }
    expect(hits).toBeGreaterThan(100);
  });

  it('a start that changes and comes back, and two starts that differ in one coordinate only: never another start\'s sums', () => {
    const polys = hostile(), g = world(polys);
    const a1: P3 = [-50, 20, -50], a2: P3 = [-50, 20, 50], a3: P3 = [-50, 21, -50], a4: P3 = [60, 20, -50], b: P3 = [70, 15, 60];
    for (const a of [a1, a2, a1, a3, a1, a4, a2, a4, a3, a1]) { agree(polys, a, b, g); agree(polys, a, [b[0], b[1], -b[2]], g); }
  });

  // The review of 79d589a7e0, finding 2: two starts 2e-13 apart that the rule classes on OPPOSITE sides of a wall's
  // band (the wall x = 10, n = (-5000, 0, 0): in front while ds + 9.99999975e-6 >= 0, that is x - 10 <= 2e-9) -- a start
  // matched within any tolerance would give the second the first's sums.
  it('two starts 2e-13 apart on either side of a band\'s edge are two starts: one hit, then none, then one', () => {
    const polys = [wallX(10, false)], g = world(polys);
    const inFront: P3 = [10 + 1.9999e-9, 20, 0], behind: P3 = [10 + 2.0001e-9, 20, 0], b: P3 = [40, 20, 0];
    expect(rule(polys[0]!.points, inFront, b)).not.toBeNull();
    expect(rule(polys[0]!.points, behind, b)).toBeNull();
    for (const [a, hits] of [[inFront, 1], [behind, 0], [inFront, 1], [behind, 0]] as const) {
      expect(segmentHits(g, a, b, undefined, ALL_LAYERS, 'blast')).toHaveLength(hits);
      agree(polys, a, b, g);
    }
  });

  // The review of 79d589a7e0, Q1: +0 and -0 are equal to `===` but not the same number -- a start at -0 after one at +0
  // must have its own sums, or a hit's t and point come out with the other zero's sign. Each answer is compared, to the
  // sign of every zero, with the same query on a grid nothing was ever asked of.
  it('a start at -0 after a start at +0 is another start: every number of the hit is the fresh answer\'s, to the sign of zero', () => {
    const same = (x: number[], y: number[]): boolean => x.length === y.length && x.every((v, i) => Object.is(v, y[i]));
    const flat = (g: ReturnType<typeof world>, a: P3, b: P3, mode: 'blast'): number[] =>
      segmentHits(g, a, b, undefined, ALL_LAYERS, mode).flatMap((h) => [h.t, ...h.point]);
    // The first wall is wound so its raw normal is (-5000, +0, +0) and its LAST vertex is its highest corner (0, 50, 50):
    // from a start under it, all three products of the start's sum are zeros, and the sum is -0 from x = +0, +0 from -0.
    const make = (): WorldPoly[] => [poly([0, 50, -50, 0, 0, -50, 0, 0, 50, 0, 50, 50]), wallX(0, false), wallX(0, true), wallZ(0, false), wallZ(0, true)];
    let compared = 0;
    for (const mode of ['blast'] as const) {
      for (const [y, z] of [[20, 10], [20, -10], [0, 10], [0, -10], [50, 0], [0, 0]] as const) {
        for (const ends of [[30, 25, 5], [-30, 25, 5], [5, 25, 30], [5, 25, -30]] as const) {
          const b: P3 = [ends[0], ends[1], ends[2]];
          for (const [first, second] of [[0, -0], [-0, 0]] as const) {
            const g = world(make());
            flat(g, [first, y, z], b, mode);                                   // the sums are now kept for `first`
            const got = flat(g, [second, y, z], b, mode), want = flat(world(make()), [second, y, z], b, mode);
            expect(same(got, want), `${mode} from x ${Object.is(second, -0) ? '-0' : '+0'} after the other, y ${y} z ${z} to ${b}: ${got} against ${want}`).toBe(true);
            compared++;
          }
        }
      }
    }
    expect(compared).toBe(48);                                               // one mode since LATER 1252 (was 96, two)
  });

  it('a query made from inside another\'s accept, from another start, disturbs neither: both give the oracle\'s hits', () => {
    // ONE owner holds every polygon: the inner query is made while the outer is part-way through that owner's polygons,
    // so sums rewritten for the inner's start would be read by the outer's remaining polygons.
    const polys = hostile();
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
    const g = buildGrid(params, [], [], polys, [{ modelName: 'worldmodel', path: 'worldmodel/all', first: 0, count: polys.length }]);
    const a: P3 = [-50, 20, -50], b: P3 = [70, 15, 60], a2: P3 = [70, 30, -70], b2: P3 = [-60, 5, 70];
    for (const mode of ['blast'] as const) {
      const inner: number[][] = [];
      const outer = segmentHits(g, a, b, () => {
        inner.push(segmentHits(g, a2, b2, undefined, ALL_LAYERS, mode).map((h) => polys.indexOf(h.poly)).sort((x, y) => x - y));
        return true;
      }, ALL_LAYERS, mode).map((h) => polys.indexOf(h.poly)).sort((x, y) => x - y);
      expect(outer).toEqual(oracle(polys, a, b, g).map((h) => h.index).sort((x, y) => x - y));
      expect(inner.length).toBeGreaterThan(0);
      const want = oracle(polys, a2, b2, g).map((h) => h.index).sort((x, y) => x - y);
      for (const hit of inner) expect(hit).toEqual(want);
      agree(polys, a, b, g);                                                   // and the outer's start is still answered rightly after
    }
  });

  it('cases 1-3 and 12, the sweep: over hostile polygons and 600 lines, the blast mode gives the oracle\'s hits exactly', () => {
    const polys = [
      wallX(-30, false), wallX(10, true), wallZ(-20, true), wallZ(25, false), warped,
      poly([60, 0, -60, 61, 0, -59.975, 61, 0, -60.025]),                     // the second review's sliver
      poly([-80, 0, 40, -40, 0, 40, -68, 0, 52, -80, 0, 80]),                 // a dart
      poly([-60, 30, -60, -20, 30, -60, -20, 30, -20, -20, 30, -20]),         // a doubled vertex
      poly([-60, 5, -60, -40, 5, -60, -20, 5, -60, -20, 5, -20]),             // the first three in a line
      poly([40, 10, 40, 80, 10, 41, 80, 12.5, 80, 40, 10.2, 79]),             // a quad a little off its plane
      poly([70, 0, -80, 70.0001, 0, -79.9999, 70, 0.0001, -80]),              // a tiny triangle: a small raw normal, a wide band
    ];
    const g = world(polys);
    let seed = 11;
    const r = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const v = (): P3 => [r() * 180 - 90, r() * 60 - 5, r() * 180 - 90];
    let hits = 0;
    for (let i = 0; i < 600; i++) {
      let a = v(), b = v();
      if (i % 4 === 1) a = [Math.fround(10) + (r() - 0.5) * 4e-9, a[1], a[2]];             // a start in a wall's band
      if (i % 4 === 2) { a = [a[0], (r() - 0.5) * 3e-7, a[2]]; b = [b[0], (r() - 0.5) * 3e-7, b[2]]; }   // shallow to the floor polygons
      if (i % 4 === 3) b = [b[0], b[1], Math.fround(25) + (r() - 0.5) * 4e-9];             // an end in a wall's band
      hits += oracle(polys, a, b).length;
      agree(polys, a, b, g);
    }
    expect(hits).toBeGreaterThan(100);                                         // the sweep is not empty
  });
});
