// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { contactSlide, type OtherBody } from '../src/pushApart';

/**
 * LATER 711 (research 426 s2; 8f's second read of the fold, 2026-11-15): the original takes the bodies in contact NEAREST
 * FIRST -- its neighbour list (`+0xd8`, built by `FUN_002a0a10` D:L145876-145985) sorted by 3-D distance squared
 * (`FUN_002a12e0`, the comparator at 0x2a1140). The removals run one after another on the same displacement and do not
 * commute when two normals are not orthogonal, so the order decides where a wedged body's frame ends.
 * A mover at the origin (standing, radius 6) between two standing bodies (radius 6; both inside the 12 gate): A 11 away
 * with the normal (1, 0), B 10 away with the normal (0.5, 0.866); the displacement (-1, -1) in x and z.
 * Nearest first (B, then A): (-1, -1) less its part along B's normal -> (-0.317, 0.183); then along A's -> (0, 0.183).
 * A first (the list's own order here): (0, -1), then (0.433, -0.25). The list is handed far first, so a walk in list order fails.
 */
describe("LATER 711: two bodies in contact at once are taken nearest first (the original's sorted neighbour list)", () => {
  it('a mover wedged between two bodies whose normals are not orthogonal ends its frame as the nearest-first removals give', () => {
    const s = Math.sqrt(3) / 2;
    const far: OtherBody = { x: -11, y: 0, z: 0, stance: 'stand' };               // normal (1, 0), 11 away
    const near: OtherBody = { x: -5, y: 0, z: -10 * s, stance: 'stand' };          // normal (0.5, 0.866), 10 away
    const [dx, dy, dz] = contactSlide(0, 0, 0, 'stand', [-1, 0, -1], [far, near]);
    expect(dy).toBe(0);
    expect(dx).toBeCloseTo(0, 9);
    expect(dz).toBeCloseTo(-1 + s * (0.5 + s), 9);                                 // -1 + 0.866 x 1.366 = 0.183
    expect(dz).toBeCloseTo(0.183, 3);
  });

  it('the same two bodies handed nearest first give the same answer (the order is the distance, not the list)', () => {
    const s = Math.sqrt(3) / 2;
    const far: OtherBody = { x: -11, y: 0, z: 0, stance: 'stand' };
    const near: OtherBody = { x: -5, y: 0, z: -10 * s, stance: 'stand' };
    const a = contactSlide(0, 0, 0, 'stand', [-1, 0, -1], [far, near]);
    const b = contactSlide(0, 0, 0, 'stand', [-1, 0, -1], [near, far]);
    expect(a[0]).toBeCloseTo(b[0], 12);
    expect(a[2]).toBeCloseTo(b[2], 12);
  });
});
