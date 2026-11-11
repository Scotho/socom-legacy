import { describe, expect, it } from 'vitest';
import {
  glassDragFactor, glassFragmentColour, GlassFragments, NewlibRand, shatterPane, stepGlassFragment,
  type DestructionDebris, type GlassFragment, type GlassRandom, type Vec3,
} from '../src/index';

/**
 * LATER 850 (research 210 s6.2): the fragments a broken pane throws, after `FUN_00322800`, `FUN_00322df0` and
 * `FUN_003271d0`, with no renderer. The draws are scripted so each lands where the transcription says it does; the
 * debris is Fish Hook's and Frostfire's `breakapane` (research 210 s6.1) unless a test says otherwise.
 */

const FISH_HOOK: DestructionDebris = {
  texture: 'window01.tif', mode: 0, colour: [40, 40, 43, 0.5], size: 13,
  velocityFrom: [4, 1, 4], velocityTo: [-4, -1, -4], life: [2, 3], drag: 0, acceleration: [0, -98, 0], visual9c: 1,
};
const debris = (over: Partial<DestructionDebris>): DestructionDebris => ({ ...FISH_HOOK, ...over });

/** `FUN_00197740`'s draws from a list (0 past its end), counting them. */
class Script implements GlassRandom {
  used = 0;
  constructor(private readonly values: readonly number[]) {}
  next(): number { return this.values[this.used++] ?? 0; }
}
const HALF = 2 ** 30, ONE = 2 ** 31 - 1;   // u = 0.5; u = 1 (2^31 - 1 rounds to 2^31 as an f32)
const close = (v: readonly number[], want: readonly number[]): void => v.forEach((x, i) => expect(x).toBeCloseTo(want[i]!, 5));

describe("newlib's rand (FUN_00197728 / FUN_00197740, D:L14514-14536)", () => {
  it('state x 0x5851f42d4c957f2d + 1, the high word less its sign: seeded 1, 1481765933, 1085377743, 1270216262', () => {
    const r = new NewlibRand(1);
    expect([r.next(), r.next(), r.next()]).toEqual([1481765933, 1085377743, 1270216262]);
  });
});

describe('the throw (FUN_00322800 D:L222681-222831)', () => {
  it('fans each polygon from its first point; a kept triangle spends seven draws in FUN_00322df0, then is thrown from its centroid with seven more: velocity, spin, life', () => {
    // Size 1000 over a 4 x 4 quad: the measure 0.6 x 1000 / 16 is far over 0.3 and every draw under it, so each
    // triangle is kept whole. 15 draws a triangle: the keep's, seven spent in the leaf, seven for the throw.
    const quad = { points: [0, 0, 0, 4, 0, 0, 4, 4, 0, 0, 4, 0] };
    const draws = [0, ...new Array(7).fill(0), HALF, 0, ONE, HALF, 0, ONE, HALF];
    const rand = new Script([...draws, ...draws]);
    const out = shatterPane([quad], debris({ size: 1000 }), rand);
    expect(rand.used).toBe(30);
    expect(out).toHaveLength(2);
    const [a, b] = out as [GlassFragment, GlassFragment];
    close(a.pos, [8 / 3, 4 / 3, 0]);                                          // (v0 + v1 + v2) / 3
    close(b.pos, [4 / 3, 8 / 3, 0]);                                          // (v0 + v2 + v3) / 3
    close(a.points.flat(), [-8 / 3, -4 / 3, 0, 4 / 3, -4 / 3, 0, 4 / 3, 8 / 3, 0]);
    close(a.vel, [0, 1, -4]);                                                 // 4 + (-8)(0.5); 1 + (-2)(0); 4 + (-8)(1)
    close(a.spin, [0, -5, 5]);                                                // r x 10 - 5
    expect(a.life).toBeCloseTo(2.5, 6);                                       // 2 + (3 - 2)(0.5)
    expect([a.age, a.alive, a.rotation]).toEqual([0, true, [0, 0, 0]]);
  });

  it('a mode other than 0 throws nothing and draws nothing (FUN_00322580 D:L222660-222672)', () => {
    const rand = new Script([]);
    expect(shatterPane([{ points: [0, 0, 0, 4, 0, 0, 0, 4, 0] }], debris({ mode: 1 }), rand)).toEqual([]);
    expect(rand.used).toBe(0);
  });

  it("the colour: each word + 0.5 cut to a byte, the fourth 100 whatever the disc's 0.5 (D:L222777, D:L223268-223298)", () => {
    expect(glassFragmentColour(FISH_HOOK)).toEqual([40, 40, 43, 100]);
  });
});

describe('the split (FUN_00322df0 D:L222837-223482)', () => {
  const tri = { points: [0, 0, 0, 4, 0, 0, 0, 4, 0] };   // A, B, C: |A x B + B x C + C x A| = 16, twice the area

  it('a measure at or under 0.3 splits with no draw; t = 0.4 + 0.2 r; the corners kept hand back, and the middle throws itself and them with one set of draws from its centroid', () => {
    // size 8: 0.6 x 8 / 16 = 0.3 (as f32, 0x3e99999a) -- split. t = 0.5: M0 = (2, 0, 0), M1 = (2, 2, 0), M2 = (0, 2, 0).
    // Each corner's measure is 1.2: one draw keeps it (under 1.2), seven spent. The middle carries all three: no draw
    // of its own to split, seven draws, four fragments thrown at (M0 + M1 + M2) / 3. Draws: 1 + 3 x 8 + 7 = 32.
    const corner = [0, ...new Array(7).fill(0)];
    const rand = new Script([HALF, ...corner, ...corner, ...corner, HALF, HALF, HALF, HALF, HALF, HALF, 0]);
    const out = shatterPane([tri], debris({ size: 8 }), rand);
    expect(rand.used).toBe(32);
    expect(out).toHaveLength(4);
    const mid: Vec3 = [4 / 3, 4 / 3, 0];
    for (const f of out) { close(f.pos, mid); close(f.vel, [0, 0, 0]); close(f.spin, [0, 0, 0]); expect(f.life).toBe(2); }
    const at = (pts: number[]): number[] => pts.map((v, i) => v - mid[i % 3]!);
    close(out[0]!.points.flat(), at([2, 0, 0, 2, 2, 0, 0, 2, 0]));             // the middle (M0, M1, M2)
    close(out[1]!.points.flat(), at([0, 0, 0, 2, 0, 0, 0, 2, 0]));             // corner A (A, M0, M2)
    close(out[2]!.points.flat(), at([4, 0, 0, 2, 0, 0, 2, 2, 0]));             // corner B (B, M0, M1)
    close(out[3]!.points.flat(), at([0, 4, 0, 0, 2, 0, 2, 2, 0]));             // corner C (C, M2, M1)
  });

  it('a measure over 0.3 draws once: under it the triangle is kept whole, at or over it split', () => {
    // size 16: the measure is 0.6. A draw of 0.5 keeps it (one fragment, 15 draws); 0.75 splits it (t, then corners
    // of measure 2.4, each kept: four fragments).
    const kept = new Script([HALF]);
    expect(shatterPane([tri], debris({ size: 16 }), kept)).toHaveLength(1);
    expect(kept.used).toBe(15);
    const split = new Script([3 * 2 ** 29]);
    expect(shatterPane([tri], debris({ size: 16 }), split)).toHaveLength(4);
    expect(split.used).toBe(1 + 1 + 3 * 8 + 7);
  });

  it("the edges' texture coordinates split at the same t", () => {
    const rand = new Script([HALF]);
    const out = shatterPane([{ ...tri, uvs: [0, 0, 1, 0, 0, 1] }], debris({ size: 8 }), rand);
    close(out[0]!.uv.flat(), [0.5, 0, 0.5, 0.5, 0, 0.5]);
  });
});

describe('the flight (FUN_003271d0 D:L225155-225284)', () => {
  const flying = (over: Partial<GlassFragment>): GlassFragment => ({
    points: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], uv: [[0, 0], [0, 0], [0, 0]],
    pos: [0, 0, 0], vel: [0, 10, 0], spin: [0, 0, 0], rotation: [0, 0, 0], age: 0, life: 1, alive: true, ...over,
  });

  it('the position moves by the velocity it had, then the velocity takes the acceleration and 20 of gravity: step 0.25 from 10 up gives 2.5 and 5', () => {
    const f = flying({});
    stepGlassFragment(f, 0.25, debris({ acceleration: [0, 0, 0] }));
    expect([f.pos[1], f.vel[1], f.age]).toEqual([2.5, 5, 0.25]);
    const g = flying({});
    stepGlassFragment(g, 0.25, FISH_HOOK);                                    // (0, -98, 0): 10 - 24.5 - 5
    expect([g.pos[1], g.vel[1]]).toEqual([2.5, -19.5]);
  });

  it('the age reaching the life hides it with no move: 0.75 + 0.25 of 1', () => {
    const f = flying({ age: 0.75, pos: [1, 2, 3] });
    stepGlassFragment(f, 0.25, FISH_HOOK);
    expect([f.alive, f.age, f.pos, f.vel]).toEqual([false, 1, [1, 2, 3], [0, 10, 0]]);
  });

  it('the spin turns it from the second tick: the first, when the age is the step, does not', () => {
    const f = flying({ spin: [1, 2, 3], life: 10 });
    stepGlassFragment(f, 0.25, FISH_HOOK);
    expect(f.rotation).toEqual([0, 0, 0]);
    stepGlassFragment(f, 0.25, FISH_HOOK);
    expect(f.rotation).toEqual([0.25, 0.5, 0.75]);
  });

  it("a drag eases the velocity toward the wind by the original's series, not exp: drag 2 over 0.5 s is 1 / 1.3979165^2, not e^-1", () => {
    // x = -1: halved once to 0.5; 1 + x(0.5 + x(0.333333 + x(0.25 + x(0.2 + x(0.166666 + x))))) = 1.3979165; squared;
    // inverted.
    const e = glassDragFactor(-1);
    expect(e).toBeCloseTo(1 / 1.3979165 ** 2, 5);
    expect(Math.abs(e - Math.exp(-1))).toBeGreaterThan(0.1);
    expect(glassDragFactor(0)).toBe(1);
    const f = flying({ vel: [4, 0, 0], life: 10 });
    stepGlassFragment(f, 0.5, debris({ drag: 2, acceleration: [0, 0, 0] }), [1, 0, 0]);
    close(f.pos, [2, 0, 0]);
    close(f.vel, [1 + 3 * e, -10 * e, 0]);                                    // (v - w) e + w, gravity first
  });

  it('the set throws, flies and frees: every fragment of a Fish Hook throw is gone by its longest life', () => {
    const set = new GlassFragments(new NewlibRand(1));
    const made = set.add([{ points: [0, 0, 0, 16, 0, 0, 16, 10, 0, 0, 10, 0] }], FISH_HOOK);
    expect(made.length).toBeGreaterThan(2);
    expect(set.flying).toHaveLength(made.length);
    for (const f of made) expect(f.life).toBeGreaterThanOrEqual(2), expect(f.life).toBeLessThanOrEqual(3);
    for (let i = 0; i < 200; i++) set.step(1 / 60);
    expect(set.flying).toEqual([]);
  });
});
