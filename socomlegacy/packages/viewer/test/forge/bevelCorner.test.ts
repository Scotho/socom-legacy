import { describe, expect, it } from 'vitest';
import { edgeMap, faceNormal, facePoints, liveFaces, vertPos } from '../../src/forge/geometry/editMesh';
import { bevelEdges, extrudeFacesBy, insetFaces } from '../../src/forge/geometry/ops';
import { box } from '../../src/forge/geometry/primitives';

// Bevel at the end of a bevelled edge where more than three edges meet (the reference editor's walk round the point):
// every edge there cut, the point dropped, one face filling the gap -- no sharp point left behind.
const OPTS = { textureName: 'brick', size: () => [64, 64] as [number, number], scaleTexel: 0.5 };

describe('bevel end corners', () => {
  it('a column on an inset slab: its foot corners leave no old point, the corner face ends on the diagonal', () => {
    const m = box([0, 0, 0], [40, 10, 40], OPTS);
    const top = liveFaces(m).find((f) => faceNormal(m, f)[1] > 0.9)!;
    const { faces } = insetFaces(m, [top], 4);
    extrudeFacesBy(m, faces, 30);
    const vertical = [...edgeMap(m).values()].filter((e) => {
      const a = vertPos(m, e.a), b = vertPos(m, e.b);
      return a[0] === b[0] && a[2] === b[2] && Math.min(a[1], b[1]) >= 10;
    });
    expect(vertical).toHaveLength(4);
    const r = bevelEdges(m, vertical.map((e) => [e.a, e.b] as [number, number]), 6, 4, 1);
    expect(r.faces.length).toBeGreaterThan(0);
    const slabTop = liveFaces(m).flatMap((f) => facePoints(m, f)).filter((p) => Math.abs(p[1]! - 10) < 1e-6);
    // The column's old square corners (4,36), (4,4), (36,4), (36,36) are gone from the slab's top.
    for (const [x, z] of [[4, 36], [4, 4], [36, 4], [36, 36]]) expect(slabTop.some((p) => Math.abs(p[0]! - x!) < 1e-6 && Math.abs(p[2]! - z!) < 1e-6)).toBe(false);
    // Each diagonal cut 15/16 along (its far end is not cut): at (0.25, 39.75) and the like.
    expect(slabTop.some((p) => Math.abs(p[0]! - 0.25) < 1e-6 && Math.abs(p[2]! - 39.75) < 1e-6)).toBe(true);
  });
});
