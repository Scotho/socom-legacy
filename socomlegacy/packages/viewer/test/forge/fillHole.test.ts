import { describe, expect, it } from 'vitest';
import { edgeMap, faceNormal, faceVerts, liveFaces, type EditMesh } from '../../src/forge/geometry/editMesh';
import { deleteFaces, fillHoles, isBent } from '../../src/forge/geometry/ops';
import { box } from '../../src/forge/geometry/primitives';

// Fill Hole (a browser adaptation, the game has no editor): a loop of open edges capped with one face.
const OPTS = { textureName: 'brick', size: () => [64, 64] as [number, number], scaleTexel: 0.5 };
const closed = (m: EditMesh): boolean => {
  const runs = new Map<string, number>();
  for (const f of liveFaces(m)) { const vs = faceVerts(m, f); vs.forEach((v, i) => { const k = `${v}>${vs[(i + 1) % vs.length]}`; runs.set(k, (runs.get(k) ?? 0) + 1); }); }
  return [...runs].every(([k, n]) => { const [a, b] = k.split('>'); return n === 1 && runs.get(`${b}>${a}`) === 1; });
};
const facing = (m: EditMesh, n: readonly number[]): number => liveFaces(m).find((f) => { const q = faceNormal(m, f); return q[0] * n[0]! + q[1] * n[1]! + q[2] * n[2]! > 0.99; })!;
const openEdges = (m: EditMesh): [number, number][] => [...edgeMap(m).values()].filter((e) => e.faces.length === 1).map((e) => [e.a, e.b]);
const solid = (): EditMesh => box([0, 0, 0], [40, 20, 40], OPTS);

describe('fillHoles', () => {
  it('caps a box\'s missing top from one of its edges, facing out, closed', () => {
    const m = solid();
    deleteFaces(m, [facing(m, [0, 1, 0])]);
    const r = fillHoles(m, liveFaces(m), [openEdges(m)[0]!]);
    expect('faces' in r && r.faces.length).toBe(1);
    if (!('faces' in r)) return;
    expect(faceNormal(m, r.faces[0]!)[1]).toBeGreaterThan(0.99);
    expect(closed(m)).toBe(true);
  });

  it('fills a hole once however many of its edges are selected; two holes, two caps', () => {
    const m = solid();
    deleteFaces(m, [facing(m, [0, 1, 0]), facing(m, [0, -1, 0])]);
    const r = fillHoles(m, liveFaces(m), openEdges(m));
    expect('faces' in r && r.faces.length).toBe(2);
    expect(closed(m)).toBe(true);
  });

  it('caps a hole round a corner with one face of six points (bent: the editor splits it)', () => {
    const m = solid();
    deleteFaces(m, [facing(m, [0, 1, 0]), facing(m, [0, 0, 1])]);
    const r = fillHoles(m, liveFaces(m), [openEdges(m)[0]!]);
    if (!('faces' in r)) throw new Error(r.error);
    expect(faceVerts(m, r.faces[0]!)).toHaveLength(6);
    expect(isBent(m, r.faces[0]!)).toBe(true);
    expect(closed(m)).toBe(true);
  });

  it('refuses an edge with faces on both sides, leaving the mesh as it was', () => {
    const m = solid();
    const e = [...edgeMap(m).values()][0]!;
    const r = fillHoles(m, liveFaces(m), [[e.a, e.b]]);
    expect('error' in r).toBe(true);
    expect(liveFaces(m)).toHaveLength(6);
  });
});
