import { describe, expect, it } from 'vitest';
import { edgeMap, liveFaces, vertPos, type Vec3 } from '../../src/forge/geometry/editMesh';
import { loopCutAt, onFrameGrid, placeVerts } from '../../src/forge/geometry/ops';
import { box } from '../../src/forge/geometry/primitives';

// Snap to Grid, Snap to Vertex / Edges and the Knife's loop mode (browser adaptations; the reference editor's tools).
const OPTS = { textureName: 'brick', size: () => [64, 64] as [number, number], scaleTexel: 0.5 };
const FLAT: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

describe('onFrameGrid', () => {
  it('rounds each coordinate to the step on a flat workplane', () => {
    expect(onFrameGrid([13, 21, -4.9], [0, 0, 0], FLAT, 10)).toEqual([10, 20, 0]);
  });

  it('rounds along a turned workplane’s own axes', () => {
    const c = Math.SQRT1_2;
    const axes: Vec3[] = [[c, 0, -c], [0, 1, 0], [c, 0, c]];
    const p = onFrameGrid([7, 3, 7], [0, 0, 0], axes, 4);
    const local = axes.map((ax) => ax[0]! * p[0] + ax[1]! * p[1] + ax[2]! * p[2]);
    for (const x of local) expect(Math.abs(x / 4 - Math.round(x / 4))).toBeLessThan(1e-9);
  });
});

describe('placeVerts', () => {
  it('moves points where it is told, joining nothing', () => {
    const m = box([0, 0, 0], [40, 20, 40], OPTS);
    const n = m.verts.length;
    placeVerts(m, new Map([[0, [1, 2, 3]], [1, [1, 2, 3]]]));
    expect(vertPos(m, 0)).toEqual([1, 2, 3]);
    expect(vertPos(m, 1)).toEqual([1, 2, 3]);
    expect(m.verts.length).toBe(n);
  });
});

describe('loopCutAt with a share (the Knife’s loop mode)', () => {
  it('cuts one loop round a box at that share along each edge, from the start’s side', () => {
    const m = box([0, 0, 0], [40, 20, 40], OPTS);
    const e = [...edgeMap(m).values()].find((x) => { const a = vertPos(m, x.a), b = vertPos(m, x.b); return a[1] === 20 && b[1] === 20 && a[2] === 40 && b[2] === 40; })!;
    const from = vertPos(m, e.a);
    const cut = loopCutAt(m, e.a, e.b, 1, liveFaces(m), 0.25);
    expect(cut).toHaveLength(4);
    expect(liveFaces(m)).toHaveLength(10);
    const x = from[0] === 0 ? 10 : 30;
    for (const v of new Set(cut.flat())) expect(vertPos(m, v)[0]).toBeCloseTo(x, 9);
  });
});
