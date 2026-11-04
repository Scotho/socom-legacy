// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DoorSet, doorInReach, type DoorSpec } from '../src/doors';
import { apply4, mul4 } from '../src/doorMath';

/**
 * A PORT RULE, not a parity pin: `doorInReach` is the match server's check on a client's `door` event, which the
 * original has no counterpart of. Its `slack` (8 units, `src/doors.ts`) is the port's own allowance for the pick's point
 * and the view the server does not see. The original's reach test (`FUN_005aa240`, research 92 lines 25-28) is the
 * ground-plane distance squared under `range` squared with no slack; that is `pickDoor`'s, registered as
 * `combatfx.doors.pick`. This test holds the server's rule so a change to it is seen; it is not in the parity registry.
 * It runs on `test/golden/doors.json`'s Frostfire doors with no hull and no game data.
 */

const PIN = JSON.parse(readFileSync(new URL('./golden/doors.json', import.meta.url), 'utf8')) as { MP2: DoorSpec[] };

describe('the server\'s door reach (a port rule: no counterpart in the original)', () => {
  it('with no hull, the server\'s reach is the node\'s origin within range 30 plus the port\'s 8 of slack', () => {
    const set = new DoorSet(PIN.MP2, null, { sound: () => {}, moved: () => {} });
    const o = apply4(mul4(PIN.MP2[0]!.local, PIN.MP2[0]!.parent), 0, 0, 0);
    expect(doorInReach(set, 0, [o[0] + 37.9, o[1], o[2]])).toBe(true);
    expect(doorInReach(set, 0, [o[0] + 38.1, o[1], o[2]])).toBe(false);
  });
});
