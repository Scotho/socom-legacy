import { describe, expect, it } from 'vitest';
import { edgeMap, faceNormal, faceVerts, liveFaces, vertPos, type EditMesh } from '../../src/forge/geometry/editMesh';
import { bevelEdges, knifeCut, loopCut, subdivideFaces } from '../../src/forge/geometry/ops';
import { box, plane, sphere, type PrimitiveOptions } from '../../src/forge/geometry/primitives';
import { edgeRing } from '../../src/forge/geometry/selection';

/**
 * Subdivide, Loop Cut, Knife and Bevel (`src/forge/geometry/ops`; a browser adaptation after a level editor's mesh tools, the Forge's owner (crispy, OT.R112),
 * 2026-11-18): each leaves a closed mesh closed and every face turned as its neighbours, and handles the odd cases --
 * triangles, a grid's straight-on edge ends, edges with one face, widths past the faces.
 */

const OPTS: PrimitiveOptions = { textureName: 'brick', size: () => [64, 64], scaleTexel: 0.5 };

function runs(m: EditMesh): Map<string, number> {
  const out = new Map<string, number>();
  for (const f of liveFaces(m)) { const vs = faceVerts(m, f); vs.forEach((v, i) => { const k = `${v}>${vs[(i + 1) % vs.length]}`; out.set(k, (out.get(k) ?? 0) + 1); }); }
  return out;
}
/** Every edge run once each way: closed, consistently turned. */
const closed = (m: EditMesh): boolean => [...runs(m)].every(([k, n]) => { const [a, b] = k.split('>'); return n === 1 && runs(m).get(`${b}>${a}`) === 1; });
/** No edge run twice the same way (an open surface, consistently turned). */
const consistent = (m: EditMesh): boolean => [...runs(m)].every(([k, n]) => { const [a, b] = k.split('>'); return n === 1 && (runs(m).get(`${b}>${a}`) ?? 0) <= 1; });
const sane = (m: EditMesh): boolean => liveFaces(m).every((f) => { const n = faceNormal(m, f); return Number.isFinite(n[0]) && Math.hypot(...n) > 0.5; });
const facing = (m: EditMesh, n: readonly number[]): number => liveFaces(m).find((f) => { const q = faceNormal(m, f); return q[0] * n[0]! + q[1] * n[1]! + q[2] * n[2]! > 0.99; })!;
const edgeWhere = (m: EditMesh, pred: (a: readonly number[], b: readonly number[]) => boolean) => [...edgeMap(m).values()].find((e) => pred(vertPos(m, e.a), vertPos(m, e.b)))!;
const cube = (): EditMesh => box([0, 0, 0], [2, 2, 2], OPTS);

describe('Subdivide', () => {
  it('splits a tile in four quads', () => {
    const m = plane([0, 0, 0], 2, 2, 1, OPTS);
    expect(subdivideFaces(m, liveFaces(m))).toHaveLength(4);
    expect(consistent(m)).toBe(true);
  });
  it('splits a box top, its sides gaining the middles: closed, no crack', () => {
    const m = cube();
    subdivideFaces(m, [facing(m, [0, 1, 0])]);
    expect(liveFaces(m)).toHaveLength(9);
    expect(closed(m)).toBe(true);
    expect(liveFaces(m).filter((f) => faceVerts(m, f).length === 5)).toHaveLength(4);
  });
  it('splits a whole box into 24 quads, closed', () => {
    const m = cube();
    subdivideFaces(m, liveFaces(m));
    expect(liveFaces(m)).toHaveLength(24);
    expect(closed(m)).toBe(true);
  });
  it('leaves a triangle whole (Quad Slice needs four corners), and a quad\'s pieces keep its hull words', () => {
    const t = plane([0, 0, 0], 2, 2, 1, OPTS);
    const tf = liveFaces(t)[0]!;
    t.faces[tf]!.corners.pop();
    expect(subdivideFaces(t, [tf])).toHaveLength(0);
    const m = plane([0, 0, 0], 2, 2, 1, OPTS);
    const f = liveFaces(m)[0]!;
    m.faces[f]!.surface = [3, 5, 0, 7, 8];
    const made = subdivideFaces(m, [f]);
    expect(made).toHaveLength(4);
    for (const g of made) expect(m.faces[g]!.surface).toEqual([3, 5, 0, 7, 8]);
  });
  // PR #5 D1 (seat-forge): Quad Slice made each piece with `faceLike`, which rewrites a hull face's words to a floor's or
  // a wall's by its facing (`floorOrWall`): a ladder face (climb, cameratype bit 0) sliced became a plain wall. The pieces
  // now keep the source's words, as the knife's and the loop cut's do (`propsOf(f, { surface: true })`).
  it('a ladder face sliced: every piece keeps its climb words, as the knife keeps them', () => {
    const m = plane([0, 0, 0], 2, 2, 1, OPTS);
    for (let i = 0; i < m.verts.length; i += 3) { const y = m.verts[i + 1]!; m.verts[i + 1] = m.verts[i + 2]!; m.verts[i + 2] = y; }   // stood upright
    const f = liveFaces(m)[0]!;
    const ladder: [number, number, number, number, number] = [2, 5, 1, 7, 5];   // a wall, climbable (cameratype bit 0), app flags 5
    m.faces[f]!.surface = [...ladder];
    const made = subdivideFaces(m, [f], 2, 2);
    expect(made).toHaveLength(9);
    for (const g of made) expect(m.faces[g]!.surface).toEqual(ladder);
    expect(new Set(made.map((g) => m.faces[g]!.surface)).size, 'each piece its own words, none shared').toBe(made.length);
  });
  it('slices a grid of cuts: 2 x 3 on a box top makes 12 pieces, closed', () => {
    const m = cube();
    const top = liveFaces(m).find((f) => faceNormal(m, f)[1] > 0.9)!;
    expect(subdivideFaces(m, [top], 2, 3)).toHaveLength(12);
    expect(closed(m)).toBe(true);
  });
});

describe('Subdivide, consistent (the Forge\'s owner (crispy, OT.R112), 2026-11-18: "It should be consistent all the time")', () => {
  /** A face's corners: the points where its outline turns. */
  const turns = (m: EditMesh, f: number): number[][] => { const vs = faceVerts(m, f); return vs.filter((v, i) => { const a = vertPos(m, vs[(i + vs.length - 1) % vs.length]!), b = vertPos(m, v), c = vertPos(m, vs[(i + 1) % vs.length]!); const d1 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], d2 = [c[0]! - b[0]!, c[1]! - b[1]!, c[2]! - b[2]!]; return Math.hypot(d1[1]! * d2[2]! - d1[2]! * d2[1]!, d1[2]! * d2[0]! - d1[0]! * d2[2]!, d1[0]! * d2[1]! - d1[1]! * d2[0]!) > 1e-12; }).map((v) => vertPos(m, v) as number[]); };
  const area = (pts: number[][]): number => { let x = 0, y = 0, z = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i]!, q = pts[(i + 1) % pts.length]!; x += p[1]! * q[2]! - p[2]! * q[1]!; y += p[2]! * q[0]! - p[0]! * q[2]!; z += p[0]! * q[1]! - p[1]! * q[0]!; } return Math.hypot(x, y, z) / 2; };
  const tileAt = (m: EditMesh, x: number, z: number): number => liveFaces(m).find((f) => { const t = turns(m, f); return Math.abs(t.reduce((s, p) => s + p[0]!, 0) / t.length - x) < 1e-6 && Math.abs(t.reduce((s, p) => s + p[2]!, 0) / t.length - z) < 1e-6; })!;

  it('splits a face whose side carries a neighbour’s middle into four even quarters round its real centre', () => {
    const m = plane([0, 0, 0], 2, 2, 2, OPTS);
    subdivideFaces(m, [tileAt(m, -0.5, -0.5)]);
    const b = tileAt(m, 0.5, -0.5);
    expect(faceVerts(m, b)).toHaveLength(5);
    const pieces = subdivideFaces(m, [b]);
    expect(pieces).toHaveLength(4);
    for (const f of pieces) { expect(turns(m, f)).toHaveLength(4); expect(area(turns(m, f))).toBeCloseTo(0.25, 9); }
    expect(consistent(m)).toBe(true);
  });

  it('gives the same quarters one face at a time as all at once', () => {
    const one = plane([0, 0, 0], 2, 2, 2, OPTS);
    for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] as const) subdivideFaces(one, [tileAt(one, x, z)]);
    const all = plane([0, 0, 0], 2, 2, 2, OPTS);
    subdivideFaces(all, liveFaces(all));
    const sig = (m: EditMesh): string => liveFaces(m).map((f) => area(turns(m, f)).toFixed(6)).sort().join(',');
    expect(liveFaces(one)).toHaveLength(16);
    expect(sig(one)).toBe(sig(all));
  });
});

describe('Loop Cut', () => {
  it('cuts a box round the middle: 4 new edges, 10 faces, closed', () => {
    const m = cube();
    const e = edgeWhere(m, (a, b) => a[1] !== b[1]);
    const cut = loopCut(m, edgeRing(m, liveFaces(m), e.a, e.b));
    expect(cut).toHaveLength(4);
    expect(liveFaces(m)).toHaveLength(10);
    expect(closed(m)).toBe(true);
    for (const [a, b] of cut) { expect(vertPos(m, a)[1]).toBe(1); expect(vertPos(m, b)[1]).toBe(1); }
  });
  it('cuts a sphere round a band, closed', () => {
    const m = sphere([0, 0, 0], 10, 8, 6, OPTS);
    const e = edgeWhere(m, (a, b) => Math.abs(a[1]! - b[1]!) > 1e-6 && Math.abs(a[1]!) < 6 && Math.abs(b[1]!) < 6);
    expect(loopCut(m, edgeRing(m, liveFaces(m), e.a, e.b)).length).toBeGreaterThanOrEqual(8);
    expect(closed(m)).toBe(true);
  });
});

describe('Knife', () => {
  it('cuts a tile from edge to edge, and point to point', () => {
    let m = plane([0, 0, 0], 2, 2, 1, OPTS);
    const l = edgeWhere(m, (a, b) => a[0] === -1 && b[0] === -1), r = edgeWhere(m, (a, b) => a[0] === 1 && b[0] === 1);
    expect(knifeCut(m, [{ a: l.a, b: l.b, t: 0.5 }, { a: r.a, b: r.b, t: 0.25 }]).edges).toHaveLength(1);
    expect(liveFaces(m)).toHaveLength(2);
    m = plane([0, 0, 0], 2, 2, 1, OPTS);
    const vs = faceVerts(m, liveFaces(m)[0]!);
    knifeCut(m, [{ v: vs[0]! }, { v: vs[2]! }]);
    expect(liveFaces(m).every((f) => faceVerts(m, f).length === 3)).toBe(true);
  });
  it('cuts across two faces of a box in a row, closed', () => {
    const m = cube();
    const fl = edgeWhere(m, (a, b) => a[0] === 0 && b[0] === 0 && a[2] === 2 && b[2] === 2);
    const ft = edgeWhere(m, (a, b) => a[1] === 2 && b[1] === 2 && a[2] === 2 && b[2] === 2);
    const bt = edgeWhere(m, (a, b) => a[1] === 2 && b[1] === 2 && a[2] === 0 && b[2] === 0);
    expect(knifeCut(m, [{ a: fl.a, b: fl.b, t: 0.5 }, { a: ft.a, b: ft.b, t: 0.5 }, { a: bt.a, b: bt.b, t: 0.5 }]).edges).toHaveLength(2);
    expect(closed(m)).toBe(true);
  });
  // His own red at 0ed80a521b (the owner, 2026-11-22: "Mark as known failures"): expects no edge for two points with no face in common; gets one ([0, 2]).
  it.fails('misses two points with no face in common, and passes over two already joined', () => {
    let m = cube();
    const g1 = edgeWhere(m, (a, b) => a[1] === 0 && b[1] === 0 && a[2] === 0 && b[2] === 0), g2 = edgeWhere(m, (a, b) => a[1] === 2 && b[1] === 2 && a[2] === 2 && b[2] === 2);
    expect(knifeCut(m, [{ a: g1.a, b: g1.b, t: 0.5 }, { a: g2.a, b: g2.b, t: 0.5 }]).missed).toBe(1);
    expect(closed(m)).toBe(true);
    m = plane([0, 0, 0], 2, 2, 1, OPTS);
    const vs = faceVerts(m, liveFaces(m)[0]!);
    expect(knifeCut(m, [{ v: vs[0]! }, { v: vs[1]! }])).toEqual({ edges: [], missed: 0 });
  });
  // His own red at 0ed80a521b (the owner, 2026-11-22: "Mark as known failures"): expects the zigzag cut as 2 edges; gets 4.
  it.fails('cuts a zigzag with two places on each edge', () => {
    const m = plane([0, 0, 0], 2, 2, 1, OPTS);
    const l = edgeWhere(m, (a, b) => a[0] === -1 && b[0] === -1), r = edgeWhere(m, (a, b) => a[0] === 1 && b[0] === 1);
    const k = knifeCut(m, [{ a: l.a, b: l.b, t: 0.3 }, { a: r.a, b: r.b, t: 0.3 }, { a: r.a, b: r.b, t: 0.7 }, { a: l.a, b: l.b, t: 0.7 }]);
    expect(k).toMatchObject({ missed: 0 });
    expect(k.edges).toHaveLength(2);
    expect(liveFaces(m)).toHaveLength(3);
    expect(consistent(m)).toBe(true);
  });
});

describe('Bevel', () => {
  const topFront = (m: EditMesh) => edgeWhere(m, (a, b) => a[1] === 2 && b[1] === 2 && a[2] === 2 && b[2] === 2);
  it('chamfers a box edge: 7 faces, closed, the bevel at 45 degrees', () => {
    const m = cube();
    const e = topFront(m);
    const r = bevelEdges(m, [[e.a, e.b]], 0.5);
    expect(liveFaces(m)).toHaveLength(7);
    expect(closed(m)).toBe(true);
    const n = faceNormal(m, r.faces[0]!);
    expect(n[1]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(n[2]).toBeCloseTo(Math.SQRT1_2, 6);
  });
  it('bevels a face outline as Blender does: strips into the corners, one seam each, every face a quad', () => {
    const m = cube();
    const fr = facing(m, [0, 0, 1]);
    const vs = faceVerts(m, fr);
    bevelEdges(m, vs.map((v, i) => [v, vs[(i + 1) % vs.length]!] as const), 0.5);
    expect(liveFaces(m)).toHaveLength(10);
    expect(closed(m)).toBe(true);
    expect(liveFaces(m).every((f) => faceVerts(m, f).length === 4)).toBe(true);
    const top = facing(m, [0, 1, 0]);
    expect(Math.max(...faceVerts(m, top).map((v) => vertPos(m, v)[2]!))).toBe(1.5);
  });

  it('bevels the twelve box edges with a triangle at each corner: 26 faces, closed', () => {
    const m = cube();
    bevelEdges(m, [...edgeMap(m).values()].map((e) => [e.a, e.b] as const), 0.2);
    expect(liveFaces(m)).toHaveLength(26);
    expect(liveFaces(m).filter((f) => faceVerts(m, f).length === 3)).toHaveLength(8);
    expect(closed(m)).toBe(true);
  });

  it('bevels all four top edges, and all twelve, together: closed', () => {
    for (const pick of [(m: EditMesh) => [...edgeMap(m).values()].filter((e) => vertPos(m, e.a)[1] === 2 && vertPos(m, e.b)[1] === 2), (m: EditMesh) => [...edgeMap(m).values()]]) {
      const m = cube();
      const r = bevelEdges(m, pick(m).map((e) => [e.a, e.b] as const), 0.2);
      expect(r.skipped).toBe(0);
      expect(closed(m)).toBe(true);
      expect(sane(m)).toBe(true);
    }
  });
  // His own red at 0ed80a521b (the owner, 2026-11-22: "Mark as known failures"): expects 17 live faces after the bevel; gets 19.
  it.fails('bevels a grid edge that carries straight on: no flat triangle, the end points on the bevel', () => {
    const m = plane([0, 0, 0], 4, 4, 4, OPTS);
    const e = edgeWhere(m, (a, b) => a[0] === 0 && b[0] === 0 && Math.min(a[2]!, b[2]!) === 0);
    const r = bevelEdges(m, [[e.a, e.b]], 0.25);
    expect(liveFaces(m)).toHaveLength(17);
    expect(faceVerts(m, r.faces[0]!)).toHaveLength(6);
    expect(consistent(m) && sane(m)).toBe(true);
  });
  it('skips an edge with one face; holds a width past the faces under half', () => {
    let m = plane([0, 0, 0], 2, 2, 1, OPTS);
    const e = [...edgeMap(m).values()][0]!;
    expect(bevelEdges(m, [[e.a, e.b]], 0.25).skipped).toBe(1);
    m = cube();
    const t = topFront(m);
    bevelEdges(m, [[t.a, t.b]], 50);
    expect(closed(m) && sane(m)).toBe(true);
  });
});
