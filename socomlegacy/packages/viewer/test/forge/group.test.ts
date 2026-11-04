import { describe, expect, it } from 'vitest';
import {
  centreOf, inRect, moved, Selection, turnedAbout, yawOf, yawQuat, yOnly, type Pose, type Quat, type Vec3,
} from '../../src/forge/group';

/**
 * FORGE (FG-47, FG.R24; an adaptation, no original -- the game has no editor): the selection of several. Its
 * membership, its centre, a move and a turn of the whole group about that centre, the markers' y-only rule, and the
 * box's pick over the members' screen-projected places.
 */
const close = (a: readonly number[], b: readonly number[]): void => {
  expect(a.length).toBe(b.length);
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));
};
const ID: Quat = [0, 0, 0, 1];
const piece = (p: Vec3, q: Quat = ID): Pose => ({ p, q, marker: false });
const marker = (p: Vec3, yaw: number): Pose => ({ p, q: yawQuat(yaw), marker: true });
/** A quarter turn about x (a tipped piece). */
const TIP_X: Quat = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];

describe('FORGE: the selection of several (FG-47)', () => {
  it('adds, takes out, toggles, clears and asks, each member once, in the order picked', () => {
    const s = new Selection<string>();
    expect(s.size).toBe(0);
    expect(s.add('a')).toBe(true);
    expect(s.add('b')).toBe(true);
    expect(s.add('a')).toBe(false);                        // once
    expect(s.items).toEqual(['a', 'b']);
    expect(s.has('b')).toBe(true);
    expect(s.toggle('b')).toBe(false);                     // in: taken out
    expect(s.toggle('c')).toBe(true);                      // out: added
    expect(s.items).toEqual(['a', 'c']);
    expect(s.remove('a')).toBe(true);
    expect(s.remove('a')).toBe(false);
    s.only('z');
    expect(s.items).toEqual(['z']);
    s.only(null);
    expect(s.size).toBe(0);
    s.addAll(['x', 'y', 'x']);
    expect(s.items).toEqual(['x', 'y']);
    s.clear();
    expect(s.items).toEqual([]);
  });

  it('keys a member by its key where the caller gives one (a map prop by its placement key, a fresh object each pick)', () => {
    const s = new Selection<{ key: string; n: number }>((m) => m.key);
    s.add({ key: 'k1', n: 1 });
    expect(s.has({ key: 'k1', n: 2 })).toBe(true);
    expect(s.toggle({ key: 'k1', n: 3 })).toBe(false);
    expect(s.size).toBe(0);
  });

  it('puts the centre at the members’ mean place; none, none', () => {
    expect(centreOf([])).toBeNull();
    close(centreOf([[0, 0, 0], [10, 20, -30], [20, 40, 0]])!, [10, 20, -10]);
  });

  it('moves every member by the same offset, their turns kept', () => {
    const out = moved([piece([1, 2, 3], TIP_X), marker([-5, 0, 5], 1)], [10, -1, 0]);
    close(out[0]!.p, [11, 1, 3]);
    close(out[0]!.q, TIP_X);
    close(out[1]!.p, [5, -1, 5]);
    expect(yawOf(out[1]!.q)).toBeCloseTo(1, 6);
    expect(out[1]!.marker).toBe(true);
  });

  it('turns a mixed group about its centre’s vertical axis: the places swing round it, each member turned by as much', () => {
    const c: Vec3 = [0, 0, 0];
    const quarter = yawQuat(Math.PI / 2);
    const out = turnedAbout([piece([10, 5, 0], TIP_X), marker([0, 0, -10], 0.25)], c, quarter);
    // A quarter turn about +y takes +x to -z and -z to -x (three.js's right hand).
    close(out[0]!.p, [0, 5, -10]);
    close(out[1]!.p, [-10, 0, 0]);
    expect(yawOf(out[1]!.q)).toBeCloseTo(0.25 + Math.PI / 2, 6);
    // The piece keeps its tip and gains the quarter turn: the yaw quaternion times its own.
    const [x, y, z, w] = TIP_X, [qx, qy, qz, qw] = quarter;
    close(out[0]!.q, [qw * x + qx * w + qy * z - qz * y, qw * y - qx * z + qy * w + qz * x, qw * z + qx * y - qy * x + qz * w, qw * w - qx * x - qy * y - qz * z]);
  });

  it('turns about the centre given, not the origin', () => {
    const out = turnedAbout([piece([110, 0, 100])], [100, 0, 100], yawQuat(Math.PI));
    close(out[0]!.p, [90, 0, 100]);
  });

  it('a group with a marker in it turns about y only: a tilt asked is reduced to its turn about y', () => {
    expect(yOnly([piece([0, 0, 0]), piece([1, 0, 0])])).toBe(false);
    expect(yOnly([piece([0, 0, 0]), marker([1, 0, 0], 0)])).toBe(true);
    const tilted: Quat = [Math.sin(0.2), 0, 0, Math.cos(0.2)];                    // 0.4 rad about x
    const mixed = turnedAbout([piece([0, 0, 10]), marker([0, 0, -10], 0)], [0, 0, 0], tilted);
    close(mixed[0]!.p, [0, 0, 10]);                                                // no tilt: nothing moved
    close(mixed[0]!.q, ID);
    close(mixed[1]!.q, ID);
    // A group of pieces alone takes the tilt whole.
    const pieces = turnedAbout([piece([0, 0, 10]), piece([0, 0, -10])], [0, 0, 0], tilted);
    expect(pieces[0]!.p[1]).toBeLessThan(-1);
    close(pieces[0]!.q, tilted);
  });

  it('reads a quaternion’s turn about y (the twist), and makes one back', () => {
    for (const a of [0, 0.5, -1.2, 3]) expect(yawOf(yawQuat(a))).toBeCloseTo(a, 6);
    expect(yawOf(TIP_X)).toBeCloseTo(0, 6);
  });

  it('box-picks the members whose projected places lie in the rectangle, either corner first, never one behind the eye', () => {
    const ndc: Vec3[] = [[0, 0, 0.5], [0.5, 0.5, 0.9], [-0.9, 0.2, 0.3], [0.1, -0.1, 1.5], [0.2, 0.2, -1.2]];
    expect(inRect(ndc, [-0.2, -0.2], [0.6, 0.6])).toEqual([0, 1]);
    expect(inRect(ndc, [0.6, 0.6], [-0.2, -0.2])).toEqual([0, 1]);                 // the drag drawn up and left
    expect(inRect(ndc, [-1, -1], [1, 1])).toEqual([0, 1, 2]);                       // behind the eye (z > 1) or past the near plane: out
    expect(inRect(ndc, [0.7, 0.7], [0.8, 0.8])).toEqual([]);
  });
});
