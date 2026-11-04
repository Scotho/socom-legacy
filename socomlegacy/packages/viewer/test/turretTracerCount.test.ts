import { describe, expect, it } from 'vitest';
import { tracerRound, type TurretPlacement } from '@s2u/scene';
import { TurretPage, type TurretPageDeps } from '../src/turretPage';

/**
 * The PKM's tracer count (research 215 §7.6, research 89 §19). `TurretPage.fired` counts from the mount.
 * A trigger release zeroes `turretPulled` in `matchActions` (`kit+0x818`, the rounds-this-pull cap) and does not
 * reach this page. Whether the original's turret `+0x2b0` is cleared on that release was not re-read.
 */

const place = {
  id: 1, facing: 0, gunOrigin: [0, 0, 0], firepointOrigin: [0, 1, 0], origin: [0, 0, 0],
  limits: { yaw: null, pitch: null },
} as TurretPlacement;

const deps = (): TurretPageDeps => ({
  turrets: () => [place],
  feet: () => [0, 0, 0],
  look: () => ({ yaw: 0, pitch: 0 }),
  setLook: () => undefined,
  setLocked: () => undefined,
  bodyLook: () => null,
  move: () => undefined,
  net: () => ({ role: 'player', id: 1, send: () => undefined, lastSeq: () => 1 }),
  now: () => 0,
});

describe('a mounted turret\'s tracer count', () => {
  it('counts from the mount across pulls, and starts again only when the hold changes', () => {
    const page = new TurretPage(deps());
    page.event({ type: 'turret', id: 1, occupant: 1, ammo: 750 });
    const counts: number[] = [];
    for (let i = 0; i < 8; i++) counts.push(page.round()!.count);
    expect(counts).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // PKM TURRET is weapon 205. Rounds 4 and 8 of the mount streak; 5 does not, so a second pull's first rounds
    // are not a fresh 1. A burst of exactly four looks the same either way.
    expect(counts.map((n) => tracerRound(205, n))).toEqual([false, false, false, true, false, false, false, true]);
    page.event({ type: 'turret', id: 1, occupant: null, ammo: 750 });
    page.event({ type: 'turret', id: 1, occupant: 1, ammo: 750 });
    expect(page.round()!.count).toBe(1);
  });
});
