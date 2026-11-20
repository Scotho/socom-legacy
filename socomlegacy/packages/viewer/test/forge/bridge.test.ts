import { describe, expect, it } from 'vitest';
import { edgeMap, faceNormal, facePoints, faceVerts, liveFaces, type EditMesh } from '../../src/forge/geometry/editMesh';
import { bridgeEdges, bridgeFaces } from '../../src/forge/geometry/ops';
import { box, plane, type PrimitiveOptions } from '../../src/forge/geometry/primitives';

/**
 * A level editor's Bridge (`src/forge/geometry/ops` `bridgeFaces`, `bridgeEdges`; a browser adaptation, the owner 2026-11-18):
 * two faces joined by a tunnel of new faces, the two removed; two edges joined by one face. Each new face takes its
 * source's object (group) and, on a hull, its collision words by its own facing (`floorOrWall`).
 */

const SIZE = (name: string | null): readonly [number, number] | null => (name ? [64, 64] : null);
const OPTS: PrimitiveOptions = { textureName: 'brick', size: SIZE, scaleTexel: 0.5 };

/** `src` appended into `into` (points, corners, styles, faces), as `mergeObjects` does. */
function append(into: EditMesh, src: EditMesh): EditMesh {
  const styleBase = into.styles.length, vBase = into.verts.length / 3, cBase = into.cVert.length;
  into.styles.push(...src.styles);
  into.verts.push(...src.verts);
  into.cVert.push(...src.cVert.map((v) => v + vBase));
  into.cUv.push(...src.cUv); into.cColor.push(...src.cColor); into.cNormal.push(...src.cNormal); into.cCentroid.push(...src.cCentroid);
  for (const f of src.faces) if (f) into.faces.push({ ...f, corners: f.corners.map((c) => c + cBase), style: f.style + styleBase });
  return into;
}

/** The live face whose normal is nearest `n` and whose centre's x is nearest `x`. */
function faceFacing(m: EditMesh, n: readonly number[], x: number): number {
  return liveFaces(m).filter((f) => { const fn = faceNormal(m, f); return fn[0] * n[0]! + fn[1] * n[1]! + fn[2] * n[2]! > 0.99; })
    .sort((a, b) => Math.abs(centre(m, a)[0]! - x) - Math.abs(centre(m, b)[0]! - x))[0]!;
}
const centre = (m: EditMesh, f: number): number[] => { const ps = facePoints(m, f); return [0, 1, 2].map((k) => ps.reduce((s, p) => s + p[k]!, 0) / ps.length); };

/** Every edge used by exactly two faces, run once each way: a closed surface, every face turned as its neighbours. */
function closedAndConsistent(m: EditMesh): boolean {
  const runs = new Map<string, number>();
  for (const f of liveFaces(m)) {
    const vs = faceVerts(m, f);
    for (let i = 0; i < vs.length; i++) { const k = `${vs[i]}>${vs[(i + 1) % vs.length]}`; runs.set(k, (runs.get(k) ?? 0) + 1); }
  }
  for (const [k, n] of runs) {
    const [a, b] = k.split('>');
    if (n !== 1 || runs.get(`${b}>${a}`) !== 1) return false;
  }
  return true;
}

/** Two unit boxes on the x axis, a gap of 2 between them: A spans x 0..1, B x 3..4. */
const twoBoxes = (): EditMesh => append(box([0, 0, 0], [1, 1, 1], OPTS), box([3, 0, 0], [4, 1, 1], OPTS));

describe('Bridge: two faces', () => {
  it('joins the facing sides of two boxes with four faces and removes the two: one closed surface', () => {
    const m = twoBoxes();
    const f = faceFacing(m, [1, 0, 0], 1), g = faceFacing(m, [-1, 0, 0], 3);
    const r = bridgeFaces(m, f, g);
    expect('faces' in r && r.faces.length).toBe(4);
    expect(m.faces[f]).toBeNull();
    expect(m.faces[g]).toBeNull();
    expect(liveFaces(m)).toHaveLength(6 + 6 - 2 + 4);
    expect(closedAndConsistent(m)).toBe(true);
  });

  it('turns each new face out of the tunnel, the way the boxes face', () => {
    const m = twoBoxes();
    const r = bridgeFaces(m, faceFacing(m, [1, 0, 0], 1), faceFacing(m, [-1, 0, 0], 3));
    if (!('faces' in r)) throw new Error(r.error);
    for (const f of r.faces) {
      const n = faceNormal(m, f), c = centre(m, f);
      // Away from the tunnel's axis (y 0.5, z 0.5), along neither end.
      expect(Math.abs(n[0])).toBeLessThan(1e-6);
      expect(n[1] * (c[1]! - 0.5) + n[2] * (c[2]! - 0.5)).toBeGreaterThan(0);
      for (const p of facePoints(m, f)) expect(p[0]! === 1 || p[0]! === 3).toBe(true);
    }
  });

  it('pairs each point with its nearest across the gap, whatever ring order the second face starts at', () => {
    const m = twoBoxes();
    const g = faceFacing(m, [-1, 0, 0], 3);
    m.faces[g]!.corners.push(m.faces[g]!.corners.shift()!);          // the same face, its ring started one point on
    const r = bridgeFaces(m, faceFacing(m, [1, 0, 0], 1), g);
    if (!('faces' in r)) throw new Error(r.error);
    // Every new face is a rectangle 2 long: no twisted face crossing the gap on a diagonal.
    for (const f of r.faces) {
      const ps = facePoints(m, f);
      const along = ps.map((p, i) => { const q = ps[(i + 1) % ps.length]!; return Math.hypot(q[0]! - p[0]!, q[1]! - p[1]!, q[2]! - p[2]!); });
      expect(along.sort((a, b) => a - b)).toEqual([1, 1, 2, 2]);
    }
    expect(closedAndConsistent(m)).toBe(true);
  });

  it('keeps the first face\'s object and draw style on every new face', () => {
    const m = twoBoxes();
    const f = faceFacing(m, [1, 0, 0], 1);
    m.faces[f]!.group = 7;
    const r = bridgeFaces(m, f, faceFacing(m, [-1, 0, 0], 3));
    if (!('faces' in r)) throw new Error(r.error);
    for (const n of r.faces) {
      expect(m.faces[n]!.group).toBe(7);
      expect(m.faces[n]!.style).toBe(0);
    }
  });

  it('gives each new hull face the first face\'s collision words, a floor\'s facing up and a wall\'s else, its flags kept', () => {
    const m = twoBoxes();
    const f = faceFacing(m, [1, 0, 0], 1);
    // Ground words on material 5, region 7, with the inside bit (flags bit 3) and an app flag (bit 0).
    m.faces[f]!.surface = [3, 5, 0, 7, 0b1001];
    const r = bridgeFaces(m, f, faceFacing(m, [-1, 0, 0], 3));
    if (!('faces' in r)) throw new Error(r.error);
    const up = r.faces.find((n) => faceNormal(m, n)[1] > 0.9)!;
    expect(m.faces[up]!.surface).toEqual([3, 5, 0, 7, 0b1001]);
    for (const n of r.faces.filter((x) => x !== up)) expect(m.faces[n]!.surface).toEqual([2, 5, 0, 7, 0b1000]);
  });

  it('leaves a drawn face\'s new faces without words (Build gives them their section\'s by facing)', () => {
    const m = twoBoxes();
    const r = bridgeFaces(m, faceFacing(m, [1, 0, 0], 1), faceFacing(m, [-1, 0, 0], 3));
    if (!('faces' in r)) throw new Error(r.error);
    for (const n of r.faces) expect(m.faces[n]!.surface).toBeUndefined();
  });

  it('refuses faces with different point counts, and faces that share a point', () => {
    const m = append(twoBoxes(), plane([10, 0, 0], 1, 1, 1, OPTS));
    const tri = liveFaces(m).at(-1)!;
    m.faces[tri]!.corners.pop();                                       // a three-sided face
    expect(bridgeFaces(m, faceFacing(m, [1, 0, 0], 1), tri)).toHaveProperty('error');
    const a = faceFacing(m, [1, 0, 0], 1), top = faceFacing(m, [0, 1, 0], 0.5);
    expect(bridgeFaces(m, a, top)).toHaveProperty('error');
  });
});

describe('Bridge: two edges', () => {
  it('joins two floor tiles\' facing edges with one face that continues their surface', () => {
    const m = append(plane([0.5, 0, 0.5], 1, 1, 1, OPTS), plane([3.5, 0, 0.5], 1, 1, 1, OPTS));
    const edges = [...edgeMap(m).values()];
    const e1 = edges.find((e) => vertX(m, e.a) === 1 && vertX(m, e.b) === 1)!;
    const e2 = edges.find((e) => vertX(m, e.a) === 3 && vertX(m, e.b) === 3)!;
    const r = bridgeEdges(m, [e1.a, e1.b], [e2.a, e2.b]);
    if (!('faces' in r)) throw new Error(r.error);
    expect(r.faces).toHaveLength(1);
    expect(faceNormal(m, r.faces[0]!)[1]).toBeGreaterThan(0.99);       // up, as the tiles
    expect(facePoints(m, r.faces[0]!).map((p) => p[0]).sort()).toEqual([1, 1, 3, 3]);
    // The tiles' shared edges now run once each way.
    const runs = new Set<string>();
    for (const f of liveFaces(m)) { const vs = faceVerts(m, f); vs.forEach((v, i) => runs.add(`${v}>${vs[(i + 1) % vs.length]}`)); }
    expect(runs.has(`${e1.a}>${e1.b}`) && runs.has(`${e1.b}>${e1.a}`)).toBe(true);
  });

  it('makes a triangle when the two edges share a point', () => {
    const m = plane([0.5, 0, 0.5], 1, 1, 1, OPTS);
    const vs = faceVerts(m, liveFaces(m)[0]!);
    const r = bridgeEdges(m, [vs[0]!, vs[1]!], [vs[1]!, vs[2]!]);
    if (!('faces' in r)) throw new Error(r.error);
    expect(faceVerts(m, r.faces[0]!)).toHaveLength(3);
  });

  it('refuses edges with a face on both sides (two boxes\' corners), as a level editor does, and points to bridging faces', () => {
    const m = twoBoxes();
    const before = JSON.stringify(m.faces);
    const edges = [...edgeMap(m).values()].filter((e) => e.faces.length === 2);
    const r = bridgeEdges(m, [edges[0]!.a, edges[0]!.b], [edges.at(-1)!.a, edges.at(-1)!.b]);
    expect(r).toHaveProperty('error');
    expect('error' in r && r.error).toMatch(/facing faces/);
    expect(JSON.stringify(m.faces)).toBe(before);
  });
});

const vertX = (m: EditMesh, v: number): number => m.verts[v * 3]!;
