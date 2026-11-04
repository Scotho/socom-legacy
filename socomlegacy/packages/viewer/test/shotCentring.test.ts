import { describe, expect, it } from 'vitest';
import { perturb, type Cone } from '../src/accuracy';
import { centringOf, coneCoords, HONEST_CENTRING_MEAN } from '../src/net/shotCone';

/**
 * SEC-F1 (OT.R98 step 1; product track, a detection statistic -- it changes no game value): a round's offset from the
 * cone's centre as a fraction of the cone's half side (`centringOf`), read back through `coneCoords` (`perturb`
 * inverted). The page's sample is `perturb`'s (`FUN_005bd100` / `FUN_00592260` as `../src/accuracy` transcribes them):
 * each axis `offset + radius x u|u|`, `u` uniform in [-1, 1) -- a square, its density heaped at the centre, not a uniform
 * disc. Its Chebyshev offset max(|u1|, |u2|)^2 has the mean 1/2 and puts a tenth of the rounds under 0.1; a page that
 * sends the cone's centre puts every round at 0.
 */

type V3 = [number, number, number];
const unit = (a: readonly number[]): V3 => { const l = Math.hypot(a[0]!, a[1]!, a[2]!); return [a[0]! / l, a[1]! / l, a[2]! / l]; };
function lcg(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** `n` rounds sampled the page's way about random looks and cones, each read back as the room reads it. */
function sample(n: number, rand: () => number, roll: (cone: Cone) => () => number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const look = unit([rand() * 2 - 1, rand() * 1.2 - 0.6, rand() * 2 - 1]);
    const cone: Cone = { offsetX: (rand() * 2 - 1) * 0.02, offsetY: (rand() * 2 - 1) * 0.02, radius: 0.002 + rand() * 0.03 };
    const ray = unit(perturb(look, cone, roll(cone)));
    const x = centringOf(coneCoords(look, ray)!, cone);
    expect(x).not.toBeNull();
    out.push(x!);
  }
  return out;
}
const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('SEC-F1: a round\'s offset from the cone\'s centre (centringOf)', () => {
  it('the page\'s own sample (perturb): mean ~1/2, a tenth under 0.1, none past the edge', () => {
    const rand = lcg(11), roll = lcg(29);
    const xs = sample(4000, rand, () => roll);
    expect(HONEST_CENTRING_MEAN).toBe(0.5);
    expect(mean(xs)).toBeGreaterThan(0.48);
    expect(mean(xs)).toBeLessThan(0.52);
    const under = xs.filter((x) => x < 0.1).length / xs.length;
    expect(under).toBeGreaterThan(0.08);
    expect(under).toBeLessThan(0.12);
    expect(Math.max(...xs)).toBeLessThanOrEqual(1);
  });

  it('a page that sends the cone\'s centre: every round at 0', () => {
    const rand = lcg(5);
    const xs = sample(200, rand, () => () => 0.5);                  // u = 0 on both axes: the centre
    expect(Math.max(...xs)).toBeLessThan(1e-6);
  });

  it('the corner reads 1; past the edge is held at 1; no cone (scoped: radius 0) reads null', () => {
    const cone: Cone = { offsetX: 0.01, offsetY: -0.004, radius: 0.02 };
    expect(centringOf([0.01 + 0.02, -0.004 - 0.02], cone)).toBeCloseTo(1, 12);
    expect(centringOf([0.01 + 0.01, -0.004], cone)).toBeCloseTo(0.5, 12);
    expect(centringOf([0.01 + 0.08, -0.004], cone)).toBe(1);
    expect(centringOf([0, 0], { offsetX: 0.001, offsetY: 0, radius: 0 })).toBeNull();
  });
});
