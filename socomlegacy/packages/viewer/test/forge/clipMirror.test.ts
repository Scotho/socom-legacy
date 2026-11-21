import { describe, expect, it } from 'vitest';
import { faceVerts, facePoints, liveFaces, type EditMesh } from '../../src/forge/geometry/editMesh';
import { clipFaces, fillHoles, mirrorMatrix } from '../../src/forge/geometry/ops';
import { box } from '../../src/forge/geometry/primitives';

// The Clipping tool's cut and the Mirror tool's reflection (browser adaptations; the reference editor's tools).
const OPTS = { textureName: 'brick', size: () => [64, 64] as [number, number], scaleTexel: 0.5 };
const closed = (m: EditMesh): boolean => {
  const runs = new Map<string, number>();
  for (const f of liveFaces(m)) { const vs = faceVerts(m, f); vs.forEach((v, i) => { const k = `${v}>${vs[(i + 1) % vs.length]}`; runs.set(k, (runs.get(k) ?? 0) + 1); }); }
  return [...runs].every(([k, n]) => { const [a, b] = k.split('>'); return n === 1 && runs.get(`${b}>${a}`) === 1; });
};
const ys = (m: EditMesh): number[] => liveFaces(m).flatMap((f) => facePoints(m, f).map((p) => p[1]!));
const solid = (): EditMesh => box([0, 0, 0], [40, 20, 40], OPTS);

describe('clipFaces', () => {
  it('Both: cuts round the box, keeps every face, stays closed', () => {
    const m = solid();
    const r = clipFaces(m, liveFaces(m), [0, 1, 0], 8, 'both');
    expect(r.cut).toHaveLength(4);
    expect(liveFaces(m)).toHaveLength(10);
    expect(closed(m)).toBe(true);
  });

  it('Front keeps the side the normal points away from; a cap closes it', () => {
    const m = solid();
    const r = clipFaces(m, liveFaces(m), [0, 1, 0], 8, 'front');
    expect(liveFaces(m)).toHaveLength(5);
    expect(Math.max(...ys(m))).toBe(8);
    expect('error' in fillHoles(m, liveFaces(m), r.cut)).toBe(false);
    expect(closed(m)).toBe(true);
  });

  it('Back keeps the other side', () => {
    const m = solid();
    clipFaces(m, liveFaces(m), [0, 1, 0], 8, 'back');
    expect(Math.min(...ys(m))).toBe(8);
  });

  it('a slanted plane, capped: closed', () => {
    const m = solid();
    const r = clipFaces(m, liveFaces(m), [1, 1, 0], 50 / Math.SQRT2, 'front');
    fillHoles(m, liveFaces(m), r.cut);
    expect(closed(m)).toBe(true);
  });

  it('a plane missing the shape cuts nothing', () => {
    const m = solid();
    expect(clipFaces(m, liveFaces(m), [0, 1, 0], 50, 'front').cut).toHaveLength(0);
    expect(liveFaces(m)).toHaveLength(6);
  });
});

describe('mirrorMatrix', () => {
  it('reflects through the plane', () => {
    const M = mirrorMatrix([1, 0, 0], 30);
    const p = [10, 5, 7];
    expect([0, 1, 2].map((r) => M[r]! * p[0]! + M[4 + r]! * p[1]! + M[8 + r]! * p[2]! + M[12 + r]!)).toEqual([50, 5, 7]);
  });
});
