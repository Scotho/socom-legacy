import { describe, expect, it } from 'vitest';
import { edgeKey, edgeMap, edgeOfKey, faceNormal, faceVerts, liveFaces, vertPos, type EditMesh } from '../../src/forge/geometry/editMesh';
import {
  bevelEdges, bridgeEdgeRuns, bridgeFaces, connectEdges, deleteVerts, dissolveEdges, dissolveFaces, extrudeClosedEdges, extrudeVerts,
  insetFaces, knifeCut, loopCutAt, subdivideEdges, subdivideFaces,
} from '../../src/forge/geometry/ops';
import { box, cylinder, plane, type PrimitiveOptions } from '../../src/forge/geometry/primitives';
import { edgeLoop, edgeRing } from '../../src/forge/geometry/selection';

/**
 * The Edit tools' rules (the Forge's owner (crispy, OT.R112), 2026-11-19: one to one with the reference editor) and their settings ("parametric
 * values ... for each edit tool"): one case a rule.
 */

const OPTS: PrimitiveOptions = { textureName: 'brick', size: () => [64, 64], scaleTexel: 0.5 };
const cube = (): EditMesh => box([0, 0, 0], [4, 4, 4], OPTS);
const P = (m: EditMesh, v: number): number[] => vertPos(m, v);
const runs = (m: EditMesh): Map<string, number> => {
  const r = new Map<string, number>();
  for (const f of liveFaces(m)) { const vs = faceVerts(m, f); vs.forEach((v, i) => { const k = `${v}>${vs[(i + 1) % vs.length]}`; r.set(k, (r.get(k) ?? 0) + 1); }); }
  return r;
};
const closed = (m: EditMesh): boolean => { const r = runs(m); return [...r].every(([k, n]) => { const [a, b] = k.split('>'); return n === 1 && r.get(`${b}>${a}`) === 1; }); };
const volume = (m: EditMesh): number => { let v = 0; for (const f of liveFaces(m)) { const ps = faceVerts(m, f).map((x) => P(m, x)); for (let i = 1; i + 1 < ps.length; i++) { const [a, b, c] = [ps[0]!, ps[i]!, ps[i + 1]!]; v += (a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) - a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) + a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!)) / 6; } } return v; };
const sizes = (m: EditMesh): string => liveFaces(m).map((f) => faceVerts(m, f).length).sort().join(',');
const top = (m: EditMesh): number => liveFaces(m).find((f) => faceNormal(m, f)[1] > 0.9)!;
const topEdge = (m: EditMesh) => [...edgeMap(m).values()].find((e) => P(m, e.a)[1] === 4 && P(m, e.b)[1] === 4)!;
const vertical = (m: EditMesh) => [...edgeMap(m).values()].find((e) => P(m, e.a)[1] !== P(m, e.b)[1])!;
const corner = (m: EditMesh): number => [...Array(m.verts.length / 3).keys()].find((v) => P(m, v).every((x) => x === 4))!;

describe('Combine Faces and Dissolve', () => {
  it('combines only faces in one plane: a box\'s six stay six; a 2x2 floor becomes one quad', () => {
    const m = cube();
    dissolveFaces(m, liveFaces(m));
    expect(liveFaces(m)).toHaveLength(6);
    const f = plane([0, 0, 0], 4, 4, 2, OPTS);
    dissolveFaces(f, liveFaces(f));
    expect(sizes(f)).toBe('4');
  });
  it('dissolves an edge at any angle, the points left with two edges taken out', () => {
    const m = cube();
    const e = topEdge(m);
    dissolveEdges(m, [[e.a, e.b]]);
    expect(sizes(m)).toBe('3,3,4,4,4');
    expect(closed(m)).toBe(true);
  });
});

describe('Delete', () => {
  it('deletes a box corner by cutting it out of its three faces (triangles round a hole)', () => {
    const m = cube();
    deleteVerts(m, [corner(m)]);
    expect(sizes(m)).toBe('3,3,3,4,4,4');
    expect(closed(m)).toBe(false);
  });
});

describe('Shift-drag', () => {
  it('on an edge between two faces: a ridge kept closed as it is pulled out', () => {
    const m = cube();
    const v0 = volume(m);
    const e = topEdge(m);
    expect(extrudeClosedEdges(m, [[e.a, e.b]], 0.25).faces.length).toBeGreaterThanOrEqual(2);
    expect(closed(m)).toBe(true);
    for (const v of [e.a, e.b]) { const p = P(m, v); m.verts.splice(v * 3, 3, p[0]!, p[1]! + 1, p[2]!); }
    expect(closed(m)).toBe(true);
    expect(volume(m)).toBeGreaterThan(v0);
  });
  it('on a vertex: a spike -- the corner left at a fan of three triangles, pulled out closed', () => {
    const m = cube();
    const c = corner(m);
    extrudeVerts(m, [c], 0.5);
    const fan = liveFaces(m).filter((f) => faceVerts(m, f).includes(c));
    expect(fan.map((f) => faceVerts(m, f).length)).toEqual([3, 3, 3]);
    const p = P(m, c); m.verts.splice(c * 3, 3, p[0]! + 1, p[1]! + 1, p[2]! + 1);
    expect(closed(m)).toBe(true);
  });
});

describe('Connect, rings and loops', () => {
  it('connects a box\'s vertical ring into a loop cut; one edge alone does nothing', () => {
    const m = cube();
    const e = vertical(m);
    expect(connectEdges(m, edgeRing(m, liveFaces(m), e.a, e.b).map((k) => edgeOfKey(k)))).toHaveLength(4);
    expect(liveFaces(m)).toHaveLength(10);
    const n = cube();
    const t = topEdge(n);
    expect(connectEdges(n, [[t.a, t.b]])).toHaveLength(0);
  });
  it('rings across an even-sided face (a hexagon cap) to the side opposite', () => {
    const m = cylinder([0, 0, 0], 2, 2, 6, OPTS);
    const cap = liveFaces(m).find((f) => faceVerts(m, f).length === 6)!;
    const vs = faceVerts(m, cap);
    expect(edgeRing(m, liveFaces(m), vs[0]!, vs[1]!)).toContain(edgeKey(vs[3]!, vs[4]!));
  });
  it('loops a box edge (no loop through its corners) round a face beside it', () => {
    const m = cube();
    const e = topEdge(m);
    expect(edgeLoop(m, liveFaces(m), e.a, e.b)).toHaveLength(4);
  });
});

describe('Quad Slice', () => {
  it('leaves a triangle whole', () => {
    const t = plane([0, 0, 0], 2, 2, 1, OPTS);
    const f = liveFaces(t)[0]!;
    t.faces[f]!.corners.pop();
    expect(subdivideFaces(t, [f])).toHaveLength(0);
  });
  it('slices a side with points already on it by its four corners', () => {
    const m = cube();
    subdivideFaces(m, [top(m)]);
    const side = liveFaces(m).find((f) => faceVerts(m, f).length === 5)!;
    expect(subdivideFaces(m, [side], 1, 1)).toHaveLength(4);
    expect(closed(m)).toBe(true);
  });
});

describe('Bridge runs', () => {
  it('bridges two runs of two open edges, edge by edge', () => {
    const a = plane([0, 0, 0], 2, 4, 1, OPTS);
    subdivideFaces(a, liveFaces(a));
    const b = plane([5, 0, 0], 2, 4, 1, OPTS);
    subdivideFaces(b, liveFaces(b));
    const vb = a.verts.length / 3, cb = a.cVert.length;
    a.verts.push(...b.verts); a.cVert.push(...b.cVert.map((v) => v + vb)); a.cUv.push(...b.cUv); a.cColor.push(...b.cColor); a.cNormal.push(...b.cNormal); a.cCentroid.push(...b.cCentroid);
    for (const f of b.faces) if (f) a.faces.push({ ...f, corners: f.corners.map((x) => x + cb) });
    const open = [...edgeMap(a).values()].filter((e) => e.faces.length === 1);
    const pick = open.filter((e) => (P(a, e.a)[0] === 1 && P(a, e.b)[0] === 1) || (P(a, e.a)[0] === 4 && P(a, e.b)[0] === 4)).map((e) => [e.a, e.b] as [number, number]);
    const r = bridgeEdgeRuns(a, pick);
    expect('faces' in r && r.faces.length).toBe(2);
  });
});

describe('Knife across faces', () => {
  const at = (m: EditMesh, pred: (a: number[], b: number[]) => boolean, t = 0.5): { a: number; b: number; t: number } => {
    const e = [...edgeMap(m).values()].find((x) => pred(P(m, x.a), P(m, x.b)))!;
    return { a: e.a, b: e.b, t };
  };
  const frontTop = (a: number[], b: number[]): boolean => a[1] === 4 && b[1] === 4 && a[2] === 4 && b[2] === 4;
  const rightTop = (a: number[], b: number[]): boolean => a[1] === 4 && b[1] === 4 && a[0] === 4 && b[0] === 4;
  it('cuts edge -> a place inside a face -> another edge along the bent line, the cut beyond the bend taken out', () => {
    const m = cube();
    const r = knifeCut(m, [at(m, frontTop), { f: top(m), at: [2, 4, 2] }, at(m, rightTop)]);
    expect(r.edges).toHaveLength(2);
    expect(liveFaces(m).filter((f) => faceNormal(m, f)[1] > 0.9)).toHaveLength(2);
    expect(closed(m)).toBe(true);
  });
  // His own red at 0ed80a521b (the owner, 2026-11-22: "Mark as known failures"): expects 8 live faces after the cut; gets 20.
  it.fails('cuts straight across several faces between two edge points', () => {
    const m = plane([0, 0, 0], 40, 10, 4, OPTS);
    const left = at(m, (a, b) => a[0] === -20 && b[0] === -20), right = at(m, (a, b) => a[0] === 20 && b[0] === 20);
    expect(knifeCut(m, [left, right]).edges).toHaveLength(4);
    expect(liveFaces(m)).toHaveLength(8);
  });
  it('starts no cut inside a face', () => {
    const m = cube();
    expect(knifeCut(m, [{ f: top(m), at: [1, 4, 1] }, { f: top(m), at: [3, 4, 3] }]).edges).toHaveLength(0);
    expect(liveFaces(m)).toHaveLength(6);
  });
});

describe('settings', () => {
  it('Quad Slice cuts: 2 x 3 makes 12 pieces', () => {
    const m = cube();
    expect(subdivideFaces(m, [top(m)], 2, 3)).toHaveLength(12);
    expect(closed(m)).toBe(true);
  });
  it('edge cuts: 3 make four equal pieces', () => {
    const m = cube();
    const e = vertical(m);
    const pieces = subdivideEdges(m, [[e.a, e.b]], 3);
    expect(pieces).toHaveLength(4);
    expect([...new Set(pieces.flatMap((k) => edgeOfKey(k)).map((v) => P(m, v)[1]))].sort()).toEqual([0, 1, 2, 3, 4]);
  });
  it('loop cut cuts: 3 loops at even heights', () => {
    const m = cube();
    const e = vertical(m);
    const cut = loopCutAt(m, e.a, e.b, 3);
    expect(cut).toHaveLength(12);
    expect([...new Set(cut.flat().map((v) => P(m, v)[1]))].sort()).toEqual([1, 2, 3]);
    expect(closed(m)).toBe(true);
  });
  it('inset steps: three rings', () => {
    const m = cube();
    expect(insetFaces(m, [top(m)], 1.5, 3).ring).toHaveLength(12);
    expect(closed(m)).toBe(true);
  });
  it('bevel segments and shape: a rounded bevel holds more than a chamfer, less than the box', () => {
    const v0 = volume(cube());
    const round = cube(); const e = topEdge(round);
    bevelEdges(round, [[e.a, e.b]], 1, 4, 1);
    const flat = cube();
    bevelEdges(flat, [[e.a, e.b]], 1, 1, 0);
    expect(closed(round)).toBe(true);
    expect(volume(round)).toBeGreaterThan(volume(flat));
    expect(volume(round)).toBeLessThan(v0);
  });
  it('bridge segments: 4 rings along a tunnel between two boxes', () => {
    const a = cube(), b = box([10, 0, 0], [14, 4, 4], OPTS);
    const vb = a.verts.length / 3, cb = a.cVert.length;
    a.verts.push(...b.verts); a.cVert.push(...b.cVert.map((v) => v + vb)); a.cUv.push(...b.cUv); a.cColor.push(...b.cColor); a.cNormal.push(...b.cNormal); a.cCentroid.push(...b.cCentroid);
    for (const f of b.faces) if (f) a.faces.push({ ...f, corners: f.corners.map((x) => x + cb) });
    const f = liveFaces(a).find((x) => x < 6 && faceNormal(a, x)[0] > 0.9)!, g = liveFaces(a).find((x) => x >= 6 && faceNormal(a, x)[0] < -0.9)!;
    const r = bridgeFaces(a, f, g, 4);
    expect('faces' in r && r.faces.length).toBe(16);
    expect(closed(a)).toBe(true);
  });
});
