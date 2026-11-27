// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { groundGrid, groundPolygons, probeLiftOf, Walker } from '../src/mover';
import { simMapFromBytes } from '../src/simMap';
import { Traversal } from '../src/traversal';

/**
 * LATER 833 (research 217 section 2.8, "The push is a displacement, never a velocity"): r0004's near-vertical floor push
 * (`FUN_0054a6d0`, at most n 6 0.7 = 4.2 units in one frame) raises the frame's displacement `+0xf44` / `+0xf4c` only
 * (D:L414448-414462). The velocity `+0x64` was fixed earlier in the same driver call from the clip's (D:L416515-416520),
 * and the move copies `+0x38 = +0x64` at its end (D:L413963-413965), so a walk-off after the push carries the clip's
 * velocity (`+0x1350 = +0x38`, D:L466972-466974) -- r0004 the same (r4 0x552b00-0x552b50, 0x54e644-0x54e65c,
 * 0x5b5a28-0x5b5a40). The port wrote the push as `s.vx = dx / dt` (4.2 u in a 1/60 s tick = 252 u/s), and the walk-off's
 * `takeOff` carried it: players were thrown up to 282 units (server recordings of 2026-11-09/10; 15 launches of 250.5 to
 * 251.7 u/s in 80 matches, every one at a floor under n_y 0.1). These are the reported spots, each started from the
 * recording's own row before its launch (feet, yaw, the stick along the row's velocity). Disc-backed: skipped without it.
 */
const DISC = process.env.SOCOM_DISC;

/** Over the fastest the stick drives a SEAL (the stand set's 65 u/s), far under the push's 252. */
const STICK_TOP = 70;

interface Spot { name: string; map: string; feet: readonly [number, number, number]; yaw: number; v: readonly [number, number] }
const SPOTS: Spot[] = [
  { name: 'Crossroads (MP72): the medical crates\' +x lip', map: 'MP72', feet: [2019.75, 74, 1470.25], yaw: 140.7, v: [12.38, -21.91] },
  { name: 'Night Stalker (MP7): the 282-unit throw, +z off the ledge', map: 'MP7', feet: [2167, 149.875, 1553.5], yaw: 90, v: [-49.44, 42.2] },
  { name: 'Night Stalker (MP7): the +x lip at 1803, 1443', map: 'MP7', feet: [1802.75, 129.625, 1442.5], yaw: 103.3, v: [2.22, 64.97] },
  { name: 'Vigilance (MP51): the lip at 1302, 721', map: 'MP51', feet: [1302.125, -30, 720.625], yaw: 261.5, v: [9.63, -64.28] },
];

const maps = new Map<string, { grid: ReturnType<typeof groundGrid>; polys: ReturnType<typeof groundPolygons> }>();
function mapOf(name: string): { grid: ReturnType<typeof groundGrid>; polys: ReturnType<typeof groundPolygons> } {
  let m = maps.get(name);
  if (!m) {
    const map = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC!, `RUN/${name}.ZDB`))), `RUN/${name}.ZDB`);
    m = { grid: groundGrid(map.ground!), polys: groundPolygons(map.ground!) };
    maps.set(name, m);
  }
  return m;
}

/** The local stick (forward, right) whose world direction is (vx, vz) at `yaw`, full deflection. */
function stickAlong(vx: number, vz: number, yawDeg: number): { forward: number; right: number } {
  const yaw = (yawDeg * Math.PI) / 180;
  const f = vx * -Math.sin(yaw) + vz * -Math.cos(yaw), r = vx * Math.cos(yaw) + vz * -Math.sin(yaw);
  const h = Math.hypot(f, r) || 1;
  return { forward: f / h, right: r / h };
}

/** The walker's private take-off velocity (`carried`), read through a cast: an intersection with a private member is `never`. */
const carriedOf = (w: Walker): [number, number] => (w as unknown as { carried: [number, number] }).carried;

function bodyAt(map: string, feet: readonly [number, number, number], yaw: number): Walker {
  const { grid, polys } = mapOf(map);
  const w = new Walker(grid);
  w.driver = new Traversal(grid, polys);
  expect(w.place(feet[0], feet[1] + probeLiftOf('stand'), feet[2])).toBe(true);
  w.state.yaw = yaw;
  return w;
}

describe.skipIf(!DISC)('the near-vertical floor push is a displacement, never carried into the air (LATER 833)', () => {
  for (const spot of SPOTS) {
    it(`${spot.name}: pushed off, then walks off with the stick's velocity, not the push's`, { timeout: 120_000 }, () => {
      const w = bodyAt(spot.map, spot.feet, spot.yaw);
      const stick = stickAlong(spot.v[0], spot.v[1], spot.yaw);
      let pushed = false, flew = false, fastest = 0, fastestCarried = 0;
      for (let k = 0; k < 90; k++) {
        const x0 = w.state.x, z0 = w.state.z, grounded = !w.airborne;
        w.state.yaw = spot.yaw;
        w.tick({ forward: stick.forward, right: stick.right, boost: false });
        if (grounded && Math.hypot(w.state.x - x0, w.state.z - z0) > 3) pushed = true;   // the push kept: 3+ u in one tick
        if (w.airborne) flew = true;
        fastest = Math.max(fastest, Math.hypot(w.state.vx, w.state.vz));
        fastestCarried = Math.max(fastestCarried, Math.hypot(carriedOf(w)[0], carriedOf(w)[1]));
      }
      expect(pushed).toBe(true);                                       // r0004's push still frees the body off the face
      expect(flew).toBe(true);                                         // and it still walks off the lip
      expect(fastestCarried).toBeLessThan(STICK_TOP);                  // carrying the clip's velocity (+0x38), not 252
      expect(fastest).toBeLessThan(STICK_TOP);
    });
  }

  it('The Ruins (MP12): at the rig grass height no grounded push fires, and the walk-off and jump keep the stick speed (FLE-2; LATER 833)', { timeout: 120_000 }, () => {
    // LATER 1164 (RAMP_LEAD; strafeRamp.test.ts): the push's trigger is a thin near-vertical sliver at x ~867.5. From the
    // recording's row (x 877.625) the walk's ramp read half a tick ahead puts the body 0.21 further along, so its tick 24
    // has already stepped past the sliver and no tick samples it (no push in 80 ticks; the trunk pushed at tick 25).
    // The precondition needs a start that samples the sliver: swept over x -0.6..+0.6 in 0.1 steps, the trunk pushes at 10
    // of 13 starts and the head at 8 of 13, and both push at -0.3, -0.1, +0.2 and +0.4. The start is 0.1 back of the row
    // (877.525): push at tick 24 at the head and 25 at the trunk. Wherever a push fires, both give v 39.0, carry 39.0 and
    // a flight of 29.2, so the claims below are unchanged.
    const start = [877.525, 43.375, 1772.75] as const, yaw = 317.7;
    const w = bodyAt('MP12', start, yaw);
    const stick = stickAlong(-48.06, -43.75, yaw);
    const half = { forward: stick.forward * 0.6, right: stick.right * 0.6 };
    let pushed = -1;
    for (let k = 0; k < 80 && pushed < 0; k++) {
      w.state.yaw = yaw;
      const x0 = w.state.x, z0 = w.state.z;
      w.tick({ forward: half.forward, right: half.right, boost: false });
      if (!w.airborne && Math.hypot(w.state.x - x0, w.state.z - z0) > 3) pushed = k;
    }
    // FLE-2 (2026-11-19; the fall-leave-edge plan, research 151 s9.1): this floor is GRASS (the rig, l-fle2-soil: the body
    // rests at 42.575 over the floor word 43.375 here), so the body now stands 0.8 under it, as the original's does, and at
    // that height no start samples the sliver: the sweep of x -0.6..+0.6 in 0.1 steps pushes at 0 of 13 (was 10 of 13).
    // The push's precondition is gone at this spot -- whether the ORIGINAL is pushed here is not measured (the spot is a
    // server recording of the port's launch, not a capture) -- so the case keeps its guard, not its push: no launch, the
    // walk-off and the jump at the stick's speed. The four spots above still push and hold the claim.
    expect(pushed, 'FLE-2: no push at the rig grass height (0 of 13 starts)').toBe(-1);
    expect(w.state.y).toBeCloseTo(42.575, 2);
    expect(w.airborne).toBe(false);
    expect(Math.hypot(w.state.vx, w.state.vz)).toBeLessThan(STICK_TOP);
    if (w.jump()) expect(Math.hypot(carriedOf(w)[0], carriedOf(w)[1])).toBeLessThan(STICK_TOP);
    const x1 = w.state.x, z1 = w.state.z;
    for (let k = 0, landed = false; k < 120 && !landed; k++) {
      const air = w.airborne;
      w.tick({ forward: half.forward, right: half.right, boost: false });
      landed = air && !w.airborne;
    }
    expect(Math.hypot(w.state.x - x1, w.state.z - z1)).toBeLessThan(30);   // the push's 252 u/s flew 113 u
  });
});
