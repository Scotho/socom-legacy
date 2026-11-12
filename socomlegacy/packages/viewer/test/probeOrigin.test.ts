import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { buildGrid, type Grid, type WorldPoly } from '@s2u/scene';
import {
  AIR_PROBE_ROOT_READING, CROUCH_RUN_PROBE_ROOT_READING, PROBE_LIFT_FLOOR_R0004, probeLiftFor, PROBE_LIFT_PRONE_READING, PROBE_LIFT_TRANSITION_READING, PRONE_ROOT,
  probeLiftOf, RUNNING_JUMP_ROOT, STANCE, STANDING_JUMP_PROBE_ROOT_READING, Walker,
} from '../src/mover';
import { wadingDepth } from '../src/equipment';
import { loadSimMap } from '../src/simMap';

/**
 * PROBE-ORIGIN (LATER 785; research 80 s7): the floor probe's origin over the feet is r0004's floored root for the ground
 * and every airborne pick -- max(the skeleton root's posed height on the previous frame, C(posture)), C 11.48 standing,
 * 5.0 crouched, else 0 (r0004's twin of `FUN_005b0840`, 0x5b67f8-0x5b6844). The r0004 memory trace
 * (`agent-mail/evidence/jump-air/ORIGIN-TRACE.md`, 3 trials) reads 11.480 standing, walking and running and in the running
 * jump's launch, 5.504 crouched. The pick (`FUN_005b5d40`) keeps the highest floor at or under the origin + 1.
 */

const quad = (pts: number[], ditype: number, path: string): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(pts),
});
function world(polys: WorldPoly[]): Grid {
  const owners = polys.map((p, first) => ({ modelName: p.modelName, path: p.path, first, count: 1 }));
  return buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [], [], polys, owners);
}
/** A floor at 0 and a plank `h` over it with no face (a floor polygon alone) from z -50 to -150: only the pick reaches it. */
const plankWorld = (h: number): Grid => world([
  quad([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200], 3, 'worldmodel/floor'),
  quad([-50, h, -150, 50, h, -150, 50, h, -50, -50, h, -50], 3, 'worldmodel/plank'),
]);
const STILL = { forward: 0, right: 0, boost: false };

/** A body in `stance` walked from z -40 (beside the plank) to under it at z -70: the height it ends at. */
function walkUnder(h: number, stance: 'stand' | 'crouch' | 'prone', forward: number): number {
  const w = new Walker(plankWorld(h));
  expect(w.place(0, 1, -40)).toBe(true);
  w.stance = stance;
  w.state.yaw = 0;                                              // forward is -z
  for (let i = 0; i < 2000 && w.state.z > -70; i++) w.tick({ forward, right: 0, boost: false });
  expect(w.state.z).toBeLessThan(-60);
  expect(w.posture).toBe(stance);
  return w.state.y;
}
const lift = (w: Walker): number => w['probeLift']();

describe('PROBE-ORIGIN (LATER 785): the probe lift is r0004\'s floored root, per posture', () => {
  it('the floors are r0004\'s (0x5b67f8-0x5b6844: 11.48 posture 0, 5.0 posture 1, else 0) and the root terms the trace\'s', () => {
    expect(PROBE_LIFT_FLOOR_R0004).toEqual({ stand: 11.48, crouch: 5.0, prone: 0 });
    expect(PROBE_LIFT_PRONE_READING).toBe(PRONE_ROOT);
    expect(probeLiftOf('stand')).toBeCloseTo(11.480, 3);         // the trace: standing, walking, running 11.480
    expect(probeLiftOf('crouch')).toBeCloseTo(5.504, 3);         // the trace: crouched 5.504 (the root over the 5.0 floor)
    expect(probeLiftOf('crouch')).toBe(STANCE.crouch.rootY);
    expect(probeLiftOf('prone')).toBeCloseTo(2.168, 3);          // untraced: the prone root over the 0 floor
    expect(Math.max(RUNNING_JUMP_ROOT, PROBE_LIFT_FLOOR_R0004.stand)).toBeCloseTo(11.480, 3);
  });

  it('the untraced cases are named readings', () => {
    expect(STANDING_JUMP_PROBE_ROOT_READING).toBe('floor');
    expect(AIR_PROBE_ROOT_READING).toBe('stance-root');
    expect(CROUCH_RUN_PROBE_ROOT_READING).toBe(10.02);              // the trace's lowest run root (action 2: 10.02-10.79)
    expect(PROBE_LIFT_TRANSITION_READING).toBe('target');
  });

  it('a standing body on the ground takes a floor up to 12.48 over its feet (11.48 + the pick\'s 1.0), not one at 12.6', () => {
    expect(walkUnder(12.4, 'stand', 1)).toBeCloseTo(12.4, 4);
    expect(walkUnder(12.6, 'stand', 1)).toBe(0);
  });

  it('a crouched body takes a floor up to 6.504 over its feet', () => {
    expect(walkUnder(6.502, 'crouch', 0.5)).toBeCloseTo(6.502, 4);
    expect(walkUnder(6.51, 'crouch', 0.5)).toBe(0);
  });

  it('a prone body takes a floor up to 3.168 over its feet (PROBE_LIFT_PRONE_READING)', () => {
    expect(walkUnder(3.1, 'prone', 1)).toBeCloseTo(3.1, 4);
    expect(walkUnder(3.25, 'prone', 1)).toBe(0);
  });

  it('a standing fall (posture 0, not the launch) takes a floor up to 12.48 over its feet', () => {
    const w = new Walker(plankWorld(20));
    expect(w.place(0, 1, -100)).toBe(true);
    Object.assign(w.state, { x: 0, y: 8, z: -100, vx: 0, vz: 0 });
    w.setAirborne(true, 0);
    expect(lift(w)).toBeCloseTo(11.48, 6);
    w.tick(STILL);
    for (let i = 0; i < 120 && w.airborne; i++) w.tick(STILL);
    expect(w.state.y).toBe(20);                                   // 8 + 11.48 + 1 >= 20: the plank (5.5 left it at 0)
  });

  it('in the air the stance root stays under max() (AIR_PROBE_ROOT_READING): crouched 5.504, prone 2.168', () => {
    const w = new Walker(plankWorld(20));
    expect(w.place(0, 1, -100)).toBe(true);
    w.stance = 'crouch';
    w.setAirborne(true, 0);
    expect(lift(w)).toBeCloseTo(5.504, 6);
    w.stance = 'prone';
    expect(lift(w)).toBeCloseTo(PRONE_ROOT, 6);
  });

  // Review 1 F2: the floor is keyed on the stance word (`actor+0x174`, the mover's `stance`), which a crouch run keeps at 1
  // (D:L444175-444187) while the standing run's body plays: max(the run root, 5.0), the run root
  // `CROUCH_RUN_PROBE_ROOT_READING` 10.02 -- not posture 0's 11.48.
  it('a crouch-running body (stance word 1 on the run) lifts by the run root 10.02: no top at 11.5, a top at 10.9', () => {
    const run = (h: number): { y: number; w: Walker } => {
      const w = new Walker(plankWorld(h));
      expect(w.place(0, 1, -40)).toBe(true);
      w.stance = 'crouch';
      w.state.yaw = 0;
      for (let i = 0; i < 2000 && w.state.z > -70; i++) w.tick({ forward: 1, right: 0, boost: false });
      expect(w.state.z).toBeLessThan(-60);
      expect(w.stance).toBe('crouch');
      expect(w.posture).toBe('stand');                              // the crouch run: the standing run's body
      return { y: w.state.y, w };
    };
    const low = run(10.9);
    expect(lift(low.w)).toBeCloseTo(10.02, 6);
    expect(low.y).toBeCloseTo(10.9, 4);
    expect(run(11.5).y).toBe(0);
  });

  it('probeLiftFor keys on the stance word and the drawn body: a crouch run 10.02, a crouch 5.504, standing 11.48 (the local mover; a remote body keys on the drawn stance, REMOTE_PROBE_STANCE_READING)', () => {
    expect(probeLiftFor('crouch', 'stand')).toBeCloseTo(10.02, 6);
    expect(probeLiftFor('crouch', 'crouch')).toBeCloseTo(5.504, 6);
    expect(probeLiftFor('stand', 'stand')).toBeCloseTo(11.48, 6);
    expect(probeLiftFor('prone', 'prone')).toBeCloseTo(PRONE_ROOT, 6);
  });

  it('the ground lift follows the posture: standing 11.48, crouched 5.504, prone 2.168', () => {
    const w = new Walker(plankWorld(20));
    expect(w.place(0, 1, 30)).toBe(true);
    expect(lift(w)).toBeCloseTo(11.48, 6);
    w.stance = 'crouch';
    expect(lift(w)).toBeCloseTo(5.504, 6);
    w.stance = 'prone';
    expect(lift(w)).toBeCloseTo(PRONE_ROOT, 6);
  });

  it('a stance transition takes the target posture\'s value at once (PROBE_LIFT_TRANSITION_READING)', () => {
    const w = new Walker(plankWorld(20));
    expect(w.place(0, 1, 30)).toBe(true);
    w.tick(STILL);
    w.changeStance('crouch');
    expect(w.action?.name).toBe('standToCrouch');
    expect(lift(w)).toBeCloseTo(5.504, 6);
    w.tick(STILL);
    expect(lift(w)).toBeCloseTo(5.504, 6);
  });
});

/** The disc (`SOCOM_DISC`): MP64 for `MP64_RESPAWN_181_READING`; skipped where absent. */
const DISC_DIR = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '';
const HAVE_MP64 = !!DISC_DIR && existsSync(join(DISC_DIR, 'RUN', 'MP64.ZDB'));

describe.skipIf(!HAVE_MP64)(`MP64_RESPAWN_181_READING (research 80 s7): respawn 181 under the standing lift${HAVE_MP64 ? '' : ' (SOCOM_DISC absent -- skipped)'}`, () => {
  // The record (1386.04, 9.32, 2435) is under water; the standing lift's window (the record lifted a unit + 12.48) takes
  // `inv_di` at 18.16 (mat 3 INVISIBLE_DI, normal y 0.067) -- kept as read (`FUN_005b5d40` filters no normal); whether the
  // original's GetIntersect hits it is VU0 microcode (0x2dd130, vcallms 0x70), unread. The body leaves the face in its
  // first tick (r0004's near-vertical push, 4.19 units, a displacement only since LATER 833: research 217 s2.8), moves
  // 2.30 more across in its second (velocity 0; not traced), then falls straight to the floor under the record, about
  // 6.5 from it, still under water (research 80 s7). (Before LATER 833 the push was carried as 251 u/s and the body
  // flew to a rest about 89 east, (1474.96, 15.105, 2438.84) -- the launch LATER 833 removed.)
  it('placed on inv_di at 18.16, off the face in the first tick, at rest at (1391.30, 9.321, 2438.80) under water', async () => {
    const map = await loadSimMap(new FsAssetSource(DISC_DIR), 'RUN/MP64.ZDB');
    const r = map.respawns.find((q) => q.index === 181 && q.side === 0)!;
    expect(r.position[1]).toBeCloseTo(9.32, 2);
    const w = new Walker(map.grid);
    expect(w.place(r.position[0], r.position[1] + 1 + probeLiftOf('stand'), r.position[2])).toBe(true);
    expect(w.state.y).toBeCloseTo(18.162, 3);
    w.tick(STILL);
    expect(w.airborne).toBe(true);
    for (let i = 1; i < 240; i++) w.tick(STILL);
    expect(w.airborne).toBe(false);
    expect(w.state.x).toBeCloseTo(1391.30, 1);
    expect(w.state.y).toBeCloseTo(9.321, 2);
    expect(w.state.z).toBeCloseTo(2438.80, 1);
    // Wet either way: 6.42 under the water line here, on the floor the record names (y 9.32).
    expect(wadingDepth(map.grid, [w.state.x, w.state.y, w.state.z])).toBeCloseTo(6.417, 2);
  }, 120_000);
});

const HAVE_MP8 = !!DISC_DIR && existsSync(join(DISC_DIR, 'RUN', 'MP8.ZDB'));

describe.skipIf(!HAVE_MP8)(`MP8_RESPAWN_326_READING (research 80 s7): respawn 0/326 under the standing lift${HAVE_MP8 ? '' : ' (SOCOM_DISC absent -- skipped)'}`, () => {
  // The record (1065.85, 102.86, 484.24) stands on `land35/g3341` (mat 19, normal y 0.054). The body slides off and takes
  // the near-vertical push on both builds; under the standing window the air pick takes `land35/g3343` (normal y 0.611) and
  // it rests at 111.92, where the former +6.5 let it fall to 18.83. Whether the original's GetIntersect hits the record's
  // near-vertical floor (VU0 microcode, 0x2dd130 vcallms 0x70) is unread.
  it('placed at 102.86, rests at (1067.64, 111.92, 479.97), grounded and dry', async () => {
    const map = await loadSimMap(new FsAssetSource(DISC_DIR), 'RUN/MP8.ZDB');
    const r = map.respawns.find((q) => q.index === 326 && q.side === 0)!;
    expect(r.position[1]).toBeCloseTo(102.86, 2);
    const w = new Walker(map.grid);
    expect(w.place(r.position[0], r.position[1] + 1 + probeLiftOf('stand'), r.position[2])).toBe(true);
    expect(w.state.y).toBeCloseTo(102.86, 2);
    for (let i = 0; i < 240; i++) w.tick(STILL);
    expect(w.airborne).toBe(false);
    expect(w.state.x).toBeCloseTo(1067.64, 1);
    expect(w.state.y).toBeCloseTo(111.92, 1);
    expect(w.state.z).toBeCloseTo(479.97, 1);
    expect(wadingDepth(map.grid, [w.state.x, w.state.y, w.state.z])).toBe(0);
  }, 120_000);
});
