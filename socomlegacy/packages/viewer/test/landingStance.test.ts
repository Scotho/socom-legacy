import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, Walker, type Stance, type WalkInput } from '../src/sim';
import { TICK } from '../src/mover';

/**
 * LATER 1349 (B-90; SCOPE-C D4): a landing that plays its clip forces a STAND, then the held stance comes back by itself;
 * a landing with no clip keeps the stance. Reading, pending review: the landing function (r0004 0x5b52b0, r0001
 * `FUN_005af590` D:L466641-466728) calls the stance writer (`+0x90`) with 0 on every non-fatal landing and leaves the
 * request `+0x374` alone; with a clip pushed the per-tick applier (r0004 0x557f20, `FUN_00552d60`) asks the gate for the
 * request once the clip frees the body; with none, the chooser (0x58c710 at 0x556a1c) rewrites the stance from the top
 * record later in the same call, so the frame ends in the stance the body left the ground in
 * (`LANDING_NO_CLIP_STANCE_READING`). Not a knock's landing (0x585a80) nor a dive's (0x585900).
 * The capture B90-PC4 (Shadow PC 4, r0004, offline MP51; sha256 e2a315aa...6761cafe; recounted by a fresh reader, the
 * build accepted with a caveat), 15 trials, a drop of about 15 u: prone hands-off -- stance 0 for 20 game frames (19 of
 * `seal_land_soft`, 1 of `seal_stand`), then prone; prone with the stick held -- 0 for 2 frames, then the crawl; crouched
 * hands-off -- 0 for 20 frames, then crouched (5/5 each). LATER 873's rows: a crouched run-on landing (no clip) shows the
 * crouch in every frame. Held here, with no game data: the clip landings stand with the prior stance pending and come
 * back after the clip's 19 frames (the capture's 20th is LATER 546's one frame); the crouched running jump with a wall
 * inside the crouch gate stays crouched; the stick-held prone case waits on LATER 1377 (`it.fails`). Simulation track;
 * the fix is `mover.ts` (seat-walls').
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };
/** The capture's drop, about 15 u. */
const DROP = 15;
/**
 * The forced stand hands-off: the capture's 20 game frames are the clip's 19 (`seal_land_soft`) + 1 of `seal_stand`; the
 * port gives the 19 (38 ticks). The missing frame is `PENDING_STANCE_RETRY_READING` `'afterClocks'` (the request asked
 * after the tick's clocks, so it is taken on the tick the clip runs out, where the original shows one stand frame first):
 * a one-frame departure of every pending stance (PAR-19), LATER 546 (with LATER 1378 filed as its duplicate), not this one's (the 1349 review's F2).
 */
const PORT_FORCED_HANDS_OFF_S = 19 / 30;

function floorPoly(y: number): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, y, 1000, 1000, y, 1000, 1000, y, -1000, -1000, y, -1000]),
  };
}

/** A body in `stance` on a flat floor, settled, then lifted DROP over it: the next ticks fall and land. */
function lifted(stance: Stance): Walker {
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const w = new Walker(groundGrid(packGround(PARAMS, [floorPoly(0)], owners)));
  expect(w.place(0, 20, 0)).toBe(true);
  w.settle();
  w.changeStance(stance);                                          // the game's stance press
  for (let i = 0; i < 3 * 60; i++) w.tick(STILL);                  // its transition runs out
  expect(w.stance).toBe(stance);
  w.state.y = DROP;
  return w;
}

/** Ticks `input` until the body lands; returns the stance and pending request on the landing tick. */
function landing(w: Walker, input: WalkInput): { stance: Stance; pending: Stance | null } {
  for (let i = 0; i < 600; i++) {
    const wasAir = w.airborne || i === 0;
    w.tick(input);
    if (wasAir && !w.airborne && i > 0) return { stance: w.stance, pending: w.pendingStance };
  }
  throw new Error('never landed');
}

/** Seconds from now until the stance is `want` again (Infinity past 3 s). */
function untilStance(w: Walker, want: Stance, input: WalkInput): number {
  for (let i = 0; i < 3 * 60; i++) { if (w.stance === want) return i * TICK; w.tick(input); }
  return Infinity;
}

describe('LATER 1349: a landing forces a stand, and the held stance comes back by itself', () => {
  for (const stance of ['prone', 'crouch'] as const) {
    it(`${stance}, hands off: the landing tick stands with ${stance} pending; ${stance} again after the clip's 19 frames`, () => {
      const w = lifted(stance);
      const at = landing(w, STILL);
      expect(at.stance).toBe('stand');
      expect(at.pending).toBe(stance);
      const back = untilStance(w, stance, STILL);
      expect(Math.abs(back - PORT_FORCED_HANDS_OFF_S)).toBeLessThanOrEqual(1 / 60 + 1e-9);   // 38 ticks, one tick's slack
    });
  }

  // B90's t2 (prone, the stick held, 5/5) pushed the landing clip (action 10), cut by the stick after 1 frame, then 27 frames
  // of `seal_stand2prone` before the crawl: the original's landing still test sums the MOVE's velocity, not the fall (the
  // 1349 read's item 2; [CAP] + [ELF4] + [INF]); the port counts the fall (mover.ts land's `still`), so it pushes no clip
  // and the landing keeps prone (LANDING_NO_CLIP_STANCE_READING). A SEPARATE departure, LATER 1377, which also covers the
  // crouched twin (a slow crouched landing with the stick held is clipless in the port for the same reason). Held as
  // `it.fails` until LATER 1377 is built.
  it.fails('prone with the stick held: the landing tick stands with prone pending; prone again within about 2 frames (needs LATER 1377)', () => {
    const w = lifted('prone');
    const at = landing(w, FORWARD);
    expect(at.stance).toBe('stand');
    expect(at.pending).toBe('prone');
    expect(untilStance(w, 'prone', FORWARD)).toBeLessThan(0.25);
  });

  // The 1349 review's F1: a crouched running jump that lands with no clip keeps the crouch even with a wall inside the
  // crouch gate's reach -- the gate (`crouchRefused`, `CROUCH_GATE_READING`) looks along the facing, the firepoint's reach
  // x 1.2 ahead, so the wall stands across the path just ahead of the landing. The landing re-takes nothing through the
  // gate (`LANDING_NO_CLIP_STANCE_READING`: the original's chooser rewrites the stance from the record the body left the
  // ground in). A dry run on the open floor finds the landing; the same run then meets a wall 6 ahead of it.
  it('a crouched running jump landing with a wall just ahead (inside the crouch gate) stays crouched on every tick', () => {
    const run = (wallAt: { x: number; z: number; dx: number; dz: number } | null) => {
      const polys: WorldPoly[] = [floorPoly(0)];
      if (wallAt) {
        // a wall across the path: perpendicular to the run's direction (dx, dz), through the given point, 40 high
        const px = -wallAt.dz, pz = wallAt.dx;
        const a = [wallAt.x - px * 200, wallAt.z - pz * 200], b = [wallAt.x + px * 200, wallAt.z + pz * 200];
        polys.push({
          modelName: 'worldmodel', path: 'worldmodel/wall', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
          points: Float32Array.from([a[0]!, 0, a[1]!, b[0]!, 0, b[1]!, b[0]!, 40, b[1]!, a[0]!, 40, a[1]!]),
        });
      }
      const owners: CollisionOwner[] = polys.map((q, k) => ({ modelName: q.modelName, path: `${q.path}${k}`, first: k, count: 1 }));
      const w = new Walker(groundGrid(packGround(PARAMS, polys, owners)));
      expect(w.place(-400, 20, 0)).toBe(true);
      w.settle();
      w.state.yaw = -90;
      w.stanceSeparate = true;
      w.changeStance('crouch');
      for (let k = 0; k < 90; k++) w.tick(STILL);
      expect(w.stance).toBe('crouch');
      const stances = new Set<string>();
      let land: { x: number; z: number; dx: number; dz: number } | null = null, wasAir = false;
      for (let k = 0; k < 60; k++) { w.tick(FORWARD); stances.add(w.stance); }
      w.jump();
      for (let k = 0; k < 210; k++) {
        w.tick(FORWARD);
        stances.add(w.stance);
        if (wasAir && !w.airborne && land === null) {
          const v = Math.hypot(w.state.vx, w.state.vz) || 1;
          land = { x: w.state.x, z: w.state.z, dx: w.state.vx / v, dz: w.state.vz / v };
        }
        wasAir = w.airborne;
      }
      return { stances, land, w };
    };
    const dry = run(null);
    expect(dry.land, 'the dry run lands').not.toBeNull();
    const L = dry.land!;
    const wet = run({ x: L.x + L.dx * 6, z: L.z + L.dz * 6, dx: L.dx, dz: L.dz });
    expect(wet.land, 'the run with the wall lands').not.toBeNull();
    expect(wet.w.crouchRefused('stand'), 'the wall is inside the crouch gate at the end').toBe(true);
    expect([...wet.stances]).toEqual(['crouch']);
  });
});
