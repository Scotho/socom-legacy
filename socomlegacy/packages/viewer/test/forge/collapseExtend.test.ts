import { describe, expect, it } from 'vitest';
import { edgeKey, edgeMap, edgeOfKey, faceNormal, faceVerts, liveFaces, vertPos, type EditMesh } from '../../src/forge/geometry/editMesh';
import { collapseEdgeGroups, collapseFaces, deleteFaces, extendEdges, mergeVerts } from '../../src/forge/geometry/ops';
import { box, plane } from '../../src/forge/geometry/primitives';
import { edgeRibs } from '../../src/forge/geometry/selection';

// Collapse, Extend Edges and Select Ribs (browser adaptations; the reference editor's Shift+O, N and Ctrl+G).
const OPTS = { textureName: 'brick', size: () => [64, 64] as [number, number], scaleTexel: 0.5 };
const closed = (m: EditMesh): boolean => {
  const runs = new Map<string, number>();
  for (const f of liveFaces(m)) { const vs = faceVerts(m, f); vs.forEach((v, i) => { const k = `${v}>${vs[(i + 1) % vs.length]}`; runs.set(k, (runs.get(k) ?? 0) + 1); }); }
  return [...runs].every(([k, n]) => { const [a, b] = k.split('>'); return n === 1 && runs.get(`${b}>${a}`) === 1; });
};
const hasPoint = (m: EditMesh, p: readonly number[]): boolean => liveFaces(m).some((f) => faceVerts(m, f).some((v) => vertPos(m, v).every((x, k) => Math.abs(x - p[k]!) < 1e-6)));
const edgeWhere = (m: EditMesh, pred: (a: readonly number[], b: readonly number[]) => boolean): [number, number] => {
  const e = [...edgeMap(m).values()].find((x) => pred(vertPos(m, x.a), vertPos(m, x.b)))!;
  return [e.a, e.b];
};

describe('collapse', () => {
  it('groups edges by the runs they make', () => {
    expect(collapseEdgeGroups([[1, 2], [2, 3], [7, 8]]).map((g) => g.length).sort()).toEqual([2, 3]);
  });

  it('collapses a box’s top front edge to its middle: closed, two faces made triangles', () => {
    const m = box([0, 0, 0], [40, 20, 40], OPTS);
    const e = edgeWhere(m, (a, b) => a[1] === 20 && b[1] === 20 && a[2] === 40 && b[2] === 40);
    const [k] = mergeVerts(m, collapseEdgeGroups([e]), 'centre');
    expect(vertPos(m, k!)).toEqual([20, 20, 40]);
    expect(closed(m)).toBe(true);
    expect(liveFaces(m).filter((f) => faceVerts(m, f).length === 3)).toHaveLength(2);
  });

  it('collapses a box’s top face to its middle: a pyramid', () => {
    const m = box([0, 0, 0], [40, 20, 40], OPTS);
    const top = liveFaces(m).find((f) => faceNormal(m, f)[1] > 0.9)!;
    const [k] = collapseFaces(m, [top]);
    expect(vertPos(m, k!)).toEqual([20, 20, 20]);
    expect(liveFaces(m)).toHaveLength(5);
    expect(closed(m)).toBe(true);
  });
});

describe('extendEdges', () => {
  it('extends one edge of a plane a step out in its plane', () => {
    const m = plane([0, 0, 0], 40, 40, 1, OPTS);
    const e = edgeWhere(m, (a, b) => a[0] === 20 && b[0] === 20);
    const r = extendEdges(m, [e], 5);
    expect(r.faces).toHaveLength(1);
    expect(hasPoint(m, [25, 0, 20]) && hasPoint(m, [25, 0, -20])).toBe(true);
    expect(faceNormal(m, r.faces[0]!)[1]).toBeGreaterThan(0.99);
  });

  it('extends all four edges of a plane with mitred corners', () => {
    const m = plane([0, 0, 0], 40, 40, 1, OPTS);
    const all = [...edgeMap(m).values()].map((x) => [x.a, x.b] as [number, number]);
    const r = extendEdges(m, all, 5);
    expect(r.faces).toHaveLength(4);
    for (const p of [[25, 0, 25], [-25, 0, 25], [25, 0, -25], [-25, 0, -25]]) expect(hasPoint(m, p)).toBe(true);
    for (const f of r.faces) expect(faceNormal(m, f)[1]).toBeGreaterThan(0.99);
  });

  it('extends an open box’s rim up, in the plane of its walls; leaves an edge with two faces', () => {
    const m = box([0, 0, 0], [40, 20, 40], OPTS);
    deleteFaces(m, [liveFaces(m).find((f) => faceNormal(m, f)[1] > 0.9)!]);
    const rim = [...edgeMap(m).values()].filter((x) => x.faces.length === 1).map((x) => [x.a, x.b] as [number, number]);
    const r = extendEdges(m, rim, 5);
    expect(r.faces).toHaveLength(4);
    for (const [a, b] of r.edges) { expect(vertPos(m, a)[1]).toBeCloseTo(25, 9); expect(vertPos(m, b)[1]).toBeCloseTo(25, 9); }
    const n = box([0, 0, 0], [40, 20, 40], OPTS);
    expect(extendEdges(n, [edgeWhere(n, (a, b) => a[1] === 20 && b[1] === 20)], 5).faces).toHaveLength(0);
  });
});

describe('edgeRibs', () => {
  it('from one edge of a grid, the edges across it out to the grid’s edges on both sides', () => {
    const g = plane([0, 0, 0], 50, 50, 5, OPTS);
    const spine = edgeWhere(g, (a, b) => a[2] === -5 && b[2] === -5 && Math.min(a[0]!, b[0]!) === -5 && Math.max(a[0]!, b[0]!) === 5);
    const ribs = edgeRibs(g, liveFaces(g), [spine]);
    expect(ribs.size).toBe(10);
    for (const k of ribs) { const [a, b] = edgeOfKey(k); expect(vertPos(g, a)[0]).toBe(vertPos(g, b)[0]); expect(Math.abs(vertPos(g, a)[0]!)).toBe(5); }
    expect(ribs.has(edgeKey(...spine))).toBe(false);
  });

  it('gives nothing for edges that branch', () => {
    const g = plane([0, 0, 0], 50, 50, 5, OPTS);
    const at = (p: readonly number[]) => (x: { a: number; b: number }) => [x.a, x.b].some((v) => vertPos(g, v).every((c, k) => c === p[k]));
    const branch = [...edgeMap(g).values()].filter(at([5, 0, 5])).slice(0, 3).map((x) => [x.a, x.b] as [number, number]);
    expect(branch).toHaveLength(3);
    expect(edgeRibs(g, liveFaces(g), branch).size).toBe(0);
  });
});
