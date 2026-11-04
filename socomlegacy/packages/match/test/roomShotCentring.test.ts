import { describe, expect, it } from 'vitest';
import { CENTRED10_FRACTION, freshSignals, noteCentring } from '../src/stats/roomResults';
import { burst, M4A1 } from './helpers/fireCadence';

/**
 * SEC-F1 (OT.R98 step 1; product track, a detection statistic -- it changes no game value): the room keeps, for each
 * seat and round, its accepted rounds' offsets from the cone's centre (`ShotCone.centring`: 0 the centre, 1 the edge)
 * -- their count, their mean and the share under `CENTRED10_FRACTION` -- in the round's signals. A refused round is not
 * counted. The page's sample is `perturb`'s (each axis `u|u|`, `u` uniform in [-1, 1)): its mean 1/2.
 */

function lcg(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}
/** `perturb`'s factor for one axis (`../../viewer/src/accuracy` `perturb`'s `signedSquare`). */
const signedSquare = (r: () => number): number => { const u = r() * 2 - 1; return u < 0 ? -(u * u) : u * u; };

describe('SEC-F1: the shot-centring statistic (noteCentring)', () => {
  it('counts the rounds, keeps their mean and the share under a tenth; a fresh round holds none', () => {
    const s = freshSignals();
    expect(s.centring).toBeUndefined();
    for (const x of [0, 0.05, 0.5, 1]) noteCentring(s, x);
    expect(s.centring!.rounds).toBe(4);
    expect(s.centring!.mean).toBeCloseTo(0.3875, 12);
    expect(s.centring!.centred10).toBeCloseTo(0.5, 12);
    expect(CENTRED10_FRACTION).toBe(0.1);
  });
});

describe('SEC-F1: the room\'s statistic over a held burst (the viewer\'s own kit, the room\'s own cone)', () => {
  it('an honest page (perturb\'s own sample): every round taken, the mean near 1/2', () => {
    const roll = lcg(3);
    const r = burst(M4A1, 60, 6, undefined, { spread: () => [signedSquare(roll), signedSquare(roll)] });
    expect(r.tally['fired']).toBeGreaterThanOrEqual(40);
    const c = r.signals().centring!;
    expect(c.rounds).toBe(r.tally['fired']);
    expect(c.mean).toBeGreaterThan(0.35);
    expect(c.mean).toBeLessThan(0.65);
    expect(c.centred10).toBeLessThan(0.3);
  });

  it('a page that sends the cone\'s centre: every round taken (the hole), the mean near 0, nearly all under a tenth', () => {
    const r = burst(M4A1, 60, 6, undefined, { spread: () => [0, 0] });
    expect(r.tally['fired']).toBeGreaterThanOrEqual(40);
    const c = r.signals().centring!;
    expect(c.rounds).toBe(r.tally['fired']);
    expect(c.mean).toBeLessThan(0.05);
    expect(c.centred10).toBeGreaterThan(0.9);
  });

  it('a refused round is not counted: claims past the cone\'s edge are refused and the statistic holds none of them', () => {
    const r = burst(M4A1, 60, 2, undefined, { spread: () => [20, 20] });
    expect(r.tally['fired'] ?? 0).toBe(0);
    expect(r.signals().centring).toBeUndefined();
  });
});
