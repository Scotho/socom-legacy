import { describe, expect, it } from 'vitest';
import { box } from '../../src/forge/geometry/primitives';
import { snapVerts, transformVerts, translation } from '../../src/forge/geometry/ops';

// Bug 5 (the geometry audit): grid snap puts each moved point on the grid, along the axes it moved -- a level editor snaps
// vertices -- not the selection's centre by a whole step.
const OPTS = { textureName: null, size: () => null, scaleTexel: 1 };
const xs = (m: { verts: number[] }, vs: number[]): number[] => vs.map((v) => m.verts[v * 3]!);

describe('snapVerts', () => {
  it('moved points land on the grid along the moved axis; the others untouched', () => {
    const m = box([3.3, 0, 4.7], [21.9, 7.7, 18.2], OPTS);
    // The +x side's points (x 21.9): 1, 2, 5, 6 (`./primitives` `box`'s order).
    const side = [1, 2, 5, 6];
    transformVerts(m, side, translation([8.4, 0, 0]));
    expect(xs(m, side).every((x) => Math.abs(x - 30.3) < 1e-9)).toBe(true);
    snapVerts(m, side, 10, [true, false, false]);
    expect(xs(m, side)).toEqual([30, 30, 30, 30]);
    // y and z as they were: off the grid, and left so.
    expect([m.verts[1 * 3 + 2], m.verts[5 * 3 + 1]]).toEqual([4.7, 7.7]);
    // The points not moved stay where they are.
    expect(xs(m, [0, 3])).toEqual([3.3, 3.3]);
  });

  it('a zero or missing step snaps nothing', () => {
    const m = box([0.3, 0, 0], [1, 1, 1], OPTS);
    snapVerts(m, [0], 0, [true, true, true]);
    expect(m.verts[0]).toBe(0.3);
  });
});
