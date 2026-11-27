import { describe, expect, it } from 'vitest';
import { cloneMesh, faceVerts, liveFaces, type EditMesh } from '../../src/forge/geometry/editMesh';
import { box, plane, type PrimitiveOptions } from '../../src/forge/geometry/primitives';
import { MeshError, Topo, transact } from '../../src/forge/geometry/topology';

/**
 * The geometry tools' edit core (`src/forge/geometry/topology`; the Forge's owner (crispy, OT.R112), 2026-11-19: "rebuild it as half edge ... and
 * test"): the adjacency, the operators every tool is built from, and the transaction that undoes a tool whole.
 */

const OPTS: PrimitiveOptions = { textureName: 'brick', size: () => [64, 64], scaleTexel: 0.5 };
const snap = (m: EditMesh): string => JSON.stringify([m.verts, m.cVert, m.cUv, m.cColor, m.cNormal, m.cCentroid, m.faces]);
const cube = (): EditMesh => box([0, 0, 0], [2, 2, 2], OPTS);

describe('adjacency', () => {
  it('a box corner: three faces in one closed fan, each edge two faces', () => {
    const m = cube();
    const t = new Topo(m);
    const v = faceVerts(m, liveFaces(m)[0]!)[0]!;
    const fan = t.fan(v)!;
    expect(fan.closed).toBe(true);
    expect(fan.faces).toHaveLength(3);
    fan.out.forEach((w, i) => expect(fan.inn[(i + 1) % 3]).toBe(w));
    for (const w of t.spokes(v)) expect(t.facesOn(v, w)).toHaveLength(2);
  });
  it('a grid corner: an open fan', () => {
    const m = plane([0, 0, 0], 4, 4, 2, OPTS);
    const t = new Topo(m);
    const corner = [...Array(m.verts.length / 3).keys()].find((v) => t.facesAt(v).length === 1)!;
    expect(t.fan(corner)!.closed).toBe(false);
  });
  it('an edge of three faces (a wall on a floor): its faces all found, no single fan at its ends', () => {
    const m = plane([0, 0, 0], 4, 4, 2, OPTS);
    const t0 = new Topo(m);
    const f = liveFaces(m)[0]!;
    const [a, b] = faceVerts(m, f);
    // A third face on edge a-b.
    const t = new Topo(m);
    const c = t.addVert([0, 5, 0]);
    t.makeFace([t.addCorner(a!, { uv: [0, 0], color: [1, 1, 1, 1], normal: [0, 0, 1] }), t.addCorner(b!, { uv: [0, 0], color: [1, 1, 1, 1], normal: [0, 0, 1] }), t.addCorner(c, { uv: [0, 0], color: [1, 1, 1, 1], normal: [0, 0, 1] })], { style: 0 });
    expect(t.facesOn(a!, b!).length).toBe(t0.facesOn(a!, b!).length + 1);
  });
});

describe('operators', () => {
  it('splitEdge puts the new point in both faces along the edge', () => {
    const m = cube();
    const t = new Topo(m);
    const f = liveFaces(m)[0]!;
    const [a, b] = faceVerts(m, f);
    const v = t.splitEdge(a!, b!, 0.5);
    expect(t.facesAt(v)).toHaveLength(2);
    expect(t.facesOn(a!, v)).toHaveLength(2);
    expect(t.hasEdge(a!, b!)).toBe(false);
    t.check();
  });
  it('splitFace cuts a quad in two; joinFaces puts it back to one', () => {
    const m = cube();
    const t = new Topo(m);
    const f = liveFaces(m)[0]!;
    const vs = faceVerts(m, f);
    const [, g] = t.splitFace(f, vs[0]!, vs[2]!);
    expect(faceVerts(m, f)).toHaveLength(3);
    expect(faceVerts(m, g)).toHaveLength(3);
    expect(t.joinFaces(f, g)).toBe(f);
    expect(faceVerts(m, f)).toHaveLength(4);
    t.check();
  });
  it('joinFaces refuses faces that would make a ring (two separate runs shared), changing nothing', () => {
    const m = cube();
    const t = new Topo(m);
    const fs = liveFaces(m);
    // Opposite faces share no edge: nothing to join.
    const before = snap(m);
    const a = fs[0]!, opp = fs.find((g) => faceVerts(m, g).every((v) => !faceVerts(m, a).includes(v)))!;
    expect(t.joinFaces(a, opp)).toBeNull();
    expect(snap(m)).toBe(before);
  });
});

describe('the transaction', () => {
  it('rolls back every change exactly', () => {
    const m = cube();
    const before = snap(m);
    const t = new Topo(m);
    const f = liveFaces(m)[0]!;
    const vs = faceVerts(m, f);
    const v = t.splitEdge(vs[0]!, vs[1]!, 0.3);
    t.splitFace(f, v, vs[2]!);
    t.setPos(vs[3]!, [9, 9, 9]);
    t.flip(liveFaces(m)[1]!);
    t.kill(liveFaces(m)[2]!);
    t.rollback();
    expect(snap(m)).toBe(before);
  });
  it('undoes back to a savepoint only', () => {
    const m = cube();
    const t = new Topo(m);
    const f = liveFaces(m)[0]!;
    const vs = faceVerts(m, f);
    t.splitEdge(vs[0]!, vs[1]!, 0.5);
    const mid = snap(m);
    const mark = t.savepoint();
    t.kill(liveFaces(m)[3]!);
    t.undoTo(mark);
    expect(snap(m)).toBe(mid);
  });
  it('refuses a result with a face of no area, leaving the mesh as it was', () => {
    const m = cube();
    const before = snap(m);
    const f = liveFaces(m)[0]!;
    const vs = faceVerts(m, f);
    const r = transact(m, {}, 'refused', (t) => { t.setPos(vs[0]!, [...t.pos(vs[1]!)]); t.setPos(vs[2]!, [...t.pos(vs[1]!)]); return 'kept'; });
    expect(r).toBe('refused');
    expect(snap(m)).toBe(before);
  });
  it('refuses a result that opens a closed surface (a face killed), unless the tool may open it', () => {
    const m = cube();
    expect(transact(m, {}, 'refused', (t) => { t.kill(liveFaces(m)[0]!); return 'kept'; })).toBe('refused');
    expect(liveFaces(m)).toHaveLength(6);
    const n = cloneMesh(m);
    expect(transact(n, { open: true }, 'refused', (t) => { t.kill(liveFaces(n)[0]!); return 'kept'; })).toBe('kept');
    expect(liveFaces(n)).toHaveLength(5);
  });
  it('a MeshError undoes and refuses; any other error undoes and is thrown on', () => {
    const m = cube();
    const before = snap(m);
    expect(transact(m, {}, 'refused', (t) => { t.kill(liveFaces(m)[0]!); throw new MeshError('no'); })).toBe('refused');
    expect(snap(m)).toBe(before);
    expect(() => transact(m, {}, 'refused', (t) => { t.kill(liveFaces(m)[0]!); throw new TypeError('bug'); })).toThrow(TypeError);
    expect(snap(m)).toBe(before);
  });
});
