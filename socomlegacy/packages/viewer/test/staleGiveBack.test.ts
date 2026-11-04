import { describe, expect, it } from 'vitest';
import type { Grid } from '@s2u/scene';
import { GrenadeThrower } from '../src/grenade';
import type { PlaySnapshot } from '../src/walk';

/**
 * LOW-2 round 2 (web research 223 s6): a throw the room refused stale (`stale`, request 'throw') never left the room's
 * pouch, so the page gives the item back (`GrenadeThrower.giveBack`) -- one, never past the pouch's full count.
 */

const snap = (): PlaySnapshot => ({
  feet: [100, 50, 200], yaw: 90, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null, jumps: 0,
} as PlaySnapshot);

describe('GrenadeThrower.giveBack', () => {
  it('a thrown item back, once a call, never past the pouch full; an item the pouch does not carry: nothing', () => {
    const g = new GrenadeThrower({ grid: (): Grid | null => null, snapshot: () => snap(), view: () => 'third' });
    g.select('HE');
    expect(g.throwNow(1)?.item).toBe('HE');
    expect(g.stats().leftByItem.HE).toBe(2);
    expect(g.giveBack('HE')).toBe(true);
    expect(g.stats().leftByItem.HE).toBe(3);
    expect(g.giveBack('HE')).toBe(false);                    // full
    expect(g.giveBack('Rifle')).toBe(false);                 // no throwable of that name
  });
});
