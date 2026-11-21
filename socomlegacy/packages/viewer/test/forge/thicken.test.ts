import { describe, expect, it } from 'vitest';
import { faceNormal, facePoints, faceVerts, liveFaces, type EditMesh } from '../../src/forge/geometry/editMesh';
import { deleteFaces, thickenFaces } from '../../src/forge/geometry/ops';
import { box, plane } from '../../src/forge/geometry/primitives';

// Thicken Faces (a browser adaptation, the game has no editor; the reference editor's G in Face mode).
const OPTS = { textureName: 'brick', size: () => [64, 64] as [number, number], scaleTexel: 0.5 };
const closed = (m: EditMesh): boolean => {
  const runs = new Map<string, number>();
  for (const f of liveFaces(m)) { const vs = faceVerts(m, f); vs.forEach((v, i) => { const k = `${v}>${vs[(i + 1) % vs.length]}`; runs.set(k, (runs.get(k) ?? 0) + 1); }); }
  return [...runs].every(([k, n]) => { const [a, b] = k.split('>'); return n === 1 && runs.get(`${b}>${a}`) === 1; });
};

describe('thickenFaces', () => {
  it('a one-face plane becomes a slab: a back the amount behind, four walls, closed', () => {
    const m = plane([0, 0, 0], 40, 40, 1, OPTS);
    const r = thickenFaces(m, liveFaces(m), 4);
    expect(r.faces).toHaveLength(1);
    expect(r.back).toHaveLength(1);
    expect(r.walls).toHaveLength(4);
    expect(closed(m)).toBe(true);
    for (const p of facePoints(m, r.back[0]!)) expect(p[1]).toBeCloseTo(-4, 6);
    expect(faceNormal(m, r.back[0]!)[1]).toBeLessThan(-0.99);
  });

  it('a whole 5 x 5 plane: 25 backs and 20 walls', () => {
    const m = plane([0, 0, 0], 50, 50, 5, OPTS);
    const r = thickenFaces(m, liveFaces(m), 2);
    expect(r.back).toHaveLength(25);
    expect(r.walls).toHaveLength(20);
    expect(closed(m)).toBe(true);
  });

  it('leaves alone an island whose border is not all open: a plane’s middle face, a closed box', () => {
    const g = plane([0, 0, 0], 50, 50, 5, OPTS);
    const mid = liveFaces(g).find((f) => { const ps = facePoints(g, f); return ps.every((p) => Math.abs(p[0]!) < 6 && Math.abs(p[2]!) < 6); })!;
    expect(thickenFaces(g, [mid], 2).faces).toHaveLength(0);
    expect(liveFaces(g)).toHaveLength(25);
    const b = box([0, 0, 0], [20, 20, 20], OPTS);
    expect(thickenFaces(b, liveFaces(b), 2).faces).toHaveLength(0);
    expect(liveFaces(b)).toHaveLength(6);
  });

  it('an open box (its top deleted): a shell with its inside the amount in, a wall round the opening', () => {
    const m = box([20, 10, 20], [40, 20, 40], OPTS);
    deleteFaces(m, [liveFaces(m).find((f) => faceNormal(m, f)[1] > 0.9)!]);
    const r = thickenFaces(m, liveFaces(m), 2);
    expect(r.back).toHaveLength(5);
    expect(r.walls).toHaveLength(4);
    expect(closed(m)).toBe(true);
    const ps = r.back.flatMap((f) => facePoints(m, f));
    expect(Math.min(...ps.map((p) => p[1]!))).toBeCloseTo(12, 6);
    expect(Math.max(...ps.map((p) => p[0]!))).toBeCloseTo(38, 6);
  });

  it('refuses a back turned through itself, leaving the faces as they were', () => {
    const m = box([20, 10, 20], [40, 20, 40], OPTS);
    deleteFaces(m, [liveFaces(m).find((f) => faceNormal(m, f)[1] > 0.9)!]);
    expect(thickenFaces(m, liveFaces(m), 15).faces).toHaveLength(0);
    expect(liveFaces(m)).toHaveLength(5);
  });
});
