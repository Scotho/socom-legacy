import { describe, expect, it } from 'vitest';
import { buildGrid, SEAL_TUNING, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { Walker, type WalkInput } from '../src/walk';
import { Traversal } from '../src/traversal';
import { aimPitchLimitsOf } from '../src/net/lookGate';

/**
 * LATER 597 (SCOPE-C D2): through the dive the original takes the STANDING branch of the aim pair, the port the prone.
 * Reading, pending review (a seat-kill key job read it at r0004: three twins instruction for instruction, unchanged from
 * r0001): the dive sets the posture word `+0x174` to 6 (r0001 `FUN_0057e540` D:L440898, through the actor's `+0x90`);
 * the aim pair (`FUN_00594600`) takes the standing and crouched -70..60 with no lean whenever the word is not 2
 * (D:L452817, D:L452837-452838); the eye (`FUN_0029ae50`) likewise (D:L142591). The port's walker is `prone` through the
 * dive (`Traversal.dive` writes it), and `aimPitchLimitsOf` -- the one call the room's gate, the page's gate and camera
 * and the bots make -- hands `w.posture` to `aimPitchLimits`, so it clamps to the prone pair -20..25 there.
 * `Walker.aimProne` already is the posture word 2 as the aim tests it (prone and not in the dive); the limits do not ask
 * it. Held here with no game data: every tick of a dive, the limits are the standing pair; prone and still (not in a
 * dive), the prone pair (control). The eye's half is the page's camera (`./walk`, its owner's hunk) and the room's
 * body posture (`match` room.ts, its owner's hunk), with their own tests. The posture word is NOT on the original's wire
 * (the dive is: each client replays it), so no snapshot field. Simulation track.
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };

function flatWalker(): { w: Walker; t: Traversal } {
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, 1000, 1000, 0, 1000, 1000, 0, -1000, -1000, 0, -1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const grid = buildGrid(PARAMS, [], [], [floor], owners);
  const w = new Walker(grid), t = new Traversal(grid, [floor]);
  w.driver = t;
  expect(w.place(0, 10, 0)).toBe(true);
  w.settle();
  return { w, t };
}

const STANDING_PAIR: [number, number] = [SEAL_TUNING.aimPitch[0], SEAL_TUNING.aimPitch[1]];
const PRONE_PAIR: [number, number] = [SEAL_TUNING.proneAimPitch[0], SEAL_TUNING.proneAimPitch[1]];

describe('LATER 597: through the dive the aim pair is the standing one', () => {
  it('prone and still, not in a dive: the prone pair (control)', () => {
    const { w } = flatWalker();
    w.changeStance('prone');
    for (let i = 0; i < 3 * 60; i++) w.tick(STILL);
    expect(w.stance).toBe('prone');
    expect(aimPitchLimitsOf(w)).toEqual(PRONE_PAIR);
  });

  it('every tick of a dive: the standing pair -70..60 with no lean, not the prone pair', () => {
    const { w, t } = flatWalker();
    for (let i = 0; i < 60; i++) w.tick(FORWARD);                  // up to speed
    expect(t.canDive(w)).toBe(true);
    expect(t.dive(w)).toBe(true);
    expect(t.inDive()).toBe(true);
    let ticks = 0;
    const seen: Array<[number, number]> = [];
    for (let i = 0; i < 600 && t.inDive(); i++) { seen.push(aimPitchLimitsOf(w)); ticks++; w.tick(STILL); }
    expect(ticks).toBeGreaterThan(5);
    expect(seen.filter((p) => p[0] !== STANDING_PAIR[0] || p[1] !== STANDING_PAIR[1])).toEqual([]);
  });
});
