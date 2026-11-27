import { describe, expect, it } from 'vitest';
import { launchGrenade, M67, proximityTripped, type Grenade, type ThrowableRecord, type V3 } from '../src/projectile';

/**
 * A PMN trips in flight (research 433 s1, s7; review 1 of WM-HOSTAGE task 3): the original's trip test `FUN_00543930`
 * checks a mine on the proximity list only for `+0x8c <= 0` (D:L410287) -- no state test; the mine is on the list from
 * its creation (`FUN_005bc730` D:L474106-474108), not from its landing; `Timer1` (`+0x8c`) counts down in every state
 * but 4-7 (`FUN_003c5310` D:L316893-316896), flight included; and the mine's position `+0x48` is refreshed from its
 * node every tick (D:L316849-316858). So a PMN whose Timer1 has run out while it still flies trips on a body inside its
 * ProximityDistance (10 u, 3D). Reading, pending review; no rig case exercises it (the rig's mines all landed).
 */

/** The PMN's numbers as the disc's record gives them (equipment.test.ts's ROWS: Timer1 8, Timer2 10, 1 m = 10 u). */
const PMN: ThrowableRecord = { ...M67, name: 'PMN Mine', id: 158, fuse: 8, removal: 10, muzzleVelocity: 0, proximity: 10 };

const flying = (): Grenade => {
  const g = launchGrenade([10, 20, 30], [0, 0, 0], PMN);
  g.vel = [0, -40, 120];                                    // still moving: not at rest
  g.fuse = 0;                                               // Timer1 run out in the air
  return g;
};

describe('a PMN whose Timer1 has run out trips while it is still in flight (FUN_00543930 D:L410287: +0x8c only)', () => {
  it('a body 5 u away in 3D trips a flying PMN at fuse 0 and sets its trigger; one 10.5 u away does not', () => {
    const g = flying();
    expect(g.state).toBe('flight');
    expect(g.trigger).toBeFalsy();
    const near: V3 = [10, 23, 34];                          // (0, 3, 4): 5 u
    expect(proximityTripped(g, [near])).toBe(true);
    expect(g.trigger).toBe(true);

    const c = flying();
    const far: V3 = [10, 26.3, 38.4];                       // (0, 6.3, 8.4): 10.5 u
    expect(proximityTripped(c, [far])).toBe(false);
    expect(c.trigger).toBeFalsy();
    expect(c.state).toBe('flight');
  });
});
