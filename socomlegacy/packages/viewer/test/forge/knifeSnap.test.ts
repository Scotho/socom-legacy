import { describe, expect, it } from 'vitest';
import { faceNormal, liveFaces, type EditMesh, type Vec3 } from '../../src/forge/geometry/editMesh';
import { knifeSnapped, type KnifeFrame } from '../../src/forge/geometry/knifeSnap';
import { box } from '../../src/forge/geometry/primitives';

// The Knife's grid snap (a browser adaptation; the reference editor's edge cut snapping).
const OPTS = { textureName: 'brick', size: () => [64, 64] as [number, number], scaleTexel: 0.5 };
const FLAT: KnifeFrame = { origin: [0, 0, 0], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
const solid = (): EditMesh => box([0, 0, 0], [40, 20, 40], OPTS);   // 0..40 x 0..20 x 0..40
const top = (m: EditMesh): number => liveFaces(m).find((f) => faceNormal(m, f)[1] > 0.9)!;
const near = (a: readonly number[], b: readonly number[]): boolean => a.every((x, k) => Math.abs(x - b[k]!) < 1e-6);

describe('knifeSnapped', () => {
  it('first point: an edge’s nearest place moved to the nearer grid crossing along it', () => {
    const m = solid();
    const s = knifeSnapped(m, top(m), [13, 20, 0.4], 8, FLAT, null)!;
    expect(near(s.at, [16, 20, 0])).toBe(true);
    expect('a' in s.p).toBe(true);
  });

  it('first point: a corner when it is nearest; never a place inside the face', () => {
    const m = solid();
    expect('v' in knifeSnapped(m, top(m), [1, 20, 1], 8, FLAT, null)!.p).toBe(true);
    expect('f' in knifeSnapped(m, top(m), [20, 20, 20], 8, FLAT, null)!.p).toBe(false);
  });

  it('after a point: the far edge where it lines up with it', () => {
    const m = solid();
    const s = knifeSnapped(m, top(m), [17, 20, 39.6], 8, FLAT, { at: [16, 20, 0] })!;
    expect(near(s.at, [16, 20, 40])).toBe(true);
  });

  it('after a point: a grid corner inside the face', () => {
    const m = solid();
    const s = knifeSnapped(m, top(m), [23, 20, 17], 8, FLAT, { at: [16, 20, 0] })!;
    expect('f' in s.p).toBe(true);
    expect(near(s.at, [24, 20, 16])).toBe(true);
  });

  it('Shift: only the places in line with the last point', () => {
    const m = solid();
    const s = knifeSnapped(m, top(m), [23, 20, 17], 8, FLAT, { at: [16, 20, 0] }, true)!;
    expect(s.aligned).toBe(true);
    expect(s.at[0] === 16 || s.at[2] === 0).toBe(true);
  });

  it('a tilted workplane: the face’s grid points on its frame', () => {
    const m = solid();
    const c = Math.SQRT1_2;
    const turned: KnifeFrame = { origin: [0, 0, 0], axes: [[c, 0, -c], [0, 1, 0], [c, 0, c]] as [Vec3, Vec3, Vec3] };
    const s = knifeSnapped(m, top(m), [20, 20, 20], 8, turned, { at: [16, 20, 0] })!;
    const local = [0, 2].map((k) => turned.axes[k]!.reduce((t, x, i) => t + x * s.at[i]!, 0));
    for (const x of local) expect(Math.abs(x / 8 - Math.round(x / 8))).toBeLessThan(1e-6);
  });
});
