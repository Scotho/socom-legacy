// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { TICK, Walker, type Stance, type WalkInput } from '../src/mover';
import { moveStick } from '../src/moveStick';

/**
 * LATER 711 -- bodies push apart (research 426; simulation track; the RED of the wm-move lane's task 1, 2026-11-15).
 * The original's online push-apart (`FUN_0054f7e0`, D:L416574-416576, D:L417351-417668) stops a body against another:
 * the port's bodies pass through each other. The legs below are the capture rig's on the original running (r0004, MP2,
 * three consoles, 5 runs a leg, positions on the mover's console; shadow-relay-1, 2026-11-15, the Q22 files under
 * `evidence/q10-hitreg/q22-push-apart/standing/` (standing) and `.../q22-push-apart/` (crouched) on Shadow PC 1, scored
 * by the rig's own scorer -- proven within their stated spread for the original, a reading of the port's target until a
 * harness scorer re-reads the rows). Only the TEAMMATE legs: the enemy legs, a wall-side body and a prone body are
 * research 426's placeholders and are not asserted. The mechanism behind each figure is not asserted either (research
 * 426 s6: the walker's hold is inferred to be the muzzle push, `PUSH_APART_MUZZLE_REACH_READING`): each figure is the
 * rig's number, the distance the port must show.
 *
 * Tolerance: the measured spread widened by one 60 Hz tick of the leg's own speed -- the port moves a tick at a time, the
 * original a game frame at a time (`GAME_FRAME_DT` = 525/15734 s, about 30 Hz: research 208, the game frame; proven by the
 * rig's Q12 read interval, research 208 s10), so where a body stops can differ by about that much. Unit tier: a flat synthetic floor, no
 * game data. Each body is the one `Walker` the page and the room share; the other body is offered through `bodies`.
 */

const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 2000, cellsX: 4, cellsZ: 4, originX: -4000, originZ: -4000 };
const floor: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-4000, 0, 4000, 4000, 0, 4000, 4000, 0, -4000, -4000, 0, -4000]),
};
const owners: CollisionOwner[] = [{ modelName: floor.modelName, path: floor.path, first: 0, count: 1 }];
const GRID = buildGrid(params, [], [], [floor], owners);

/** RECRUIT's move stick (the rig's preset): W full; the walk key `8` a raw 0.5 forward (0.404 after the dead zone). */
const RUN: WalkInput = { forward: 1, right: 0, boost: false };
const WALK: WalkInput = { forward: moveStick(0, 0.5, 0.3)[1], right: 0, boost: false };
const STILL: WalkInput = { forward: 0, right: 0, boost: false };

interface Pair { m: Walker; t: Walker; sep: () => number; along: () => number; tMoved: () => number }

/** The mover M and the teammate T, `start` apart along M's facing, T `offset` to M's side; each offered the other as a body. */
function pair(mStance: Stance, tStance: Stance, start = 40, offset = 0, tFacesM = true): Pair {
  const m = new Walker(GRID), t = new Walker(GRID);
  m.place(0, 20, 0); m.state.yaw = 0;
  if (mStance !== 'stand') m.stance = mStance;
  // M's forward at yaw 0, found by a probe walker (the test does not assume the port's axis convention).
  const probe = new Walker(GRID); probe.place(0, 20, 0); probe.state.yaw = 0;
  for (let i = 0; i < 30; i++) probe.tick(RUN);
  const fx = probe.state.x, fz = probe.state.z, n = Math.hypot(fx, fz);
  const ux = fx / n, uz = fz / n;
  t.place(ux * start - uz * offset, 20, uz * start + ux * offset);
  t.state.yaw = tFacesM ? 180 : 0;
  if (tStance !== 'stand') t.stance = tStance;
  const t0 = { x: t.state.x, z: t.state.z };
  const body = (w: Walker) => () => [{ x: w.state.x, y: w.state.y, z: w.state.z, stance: w.stance }];
  m.bodies = body(t);
  t.bodies = body(m);
  return {
    m, t,
    sep: () => Math.hypot(t.state.x - m.state.x, t.state.z - m.state.z),
    along: () => (m.state.x * ux + m.state.z * uz),
    tMoved: () => Math.hypot(t.state.x - t0.x, t.state.z - t0.z),
  };
}

/** Runs `seconds` of M's input (T's input alongside), returning the separation each tick. */
function run(p: Pair, mInput: WalkInput, seconds: number, tInput: WalkInput = STILL): number[] {
  const seps: number[] = [];
  for (let k = 0; k < Math.round(seconds / TICK); k++) { p.m.tick(mInput); p.t.tick(tInput); seps.push(p.sep()); }
  return seps;
}
const within = (v: number, lo: number, hi: number, tick: number): boolean => v >= lo - tick && v <= hi + tick;

describe('LATER 711: a standing teammate stops a body (the rig\'s Q22 standing pass, 2026-11-15, the teammate legs)', () => {
  it('S1: a standing runner into a stationary standing teammate stops dead at 10.71-10.86 u; the teammate never moves', () => {
    const p = pair('stand', 'stand');
    const seps = run(p, RUN, 3);
    const tick = 65 * TICK;
    expect(within(Math.min(...seps), 10.71, 10.86, tick), `min sep ${Math.min(...seps)}`).toBe(true);
    expect(within(seps.at(-1)!, 10.71, 10.86, tick), `end sep ${seps.at(-1)}`).toBe(true);
    expect(p.tMoved()).toBe(0);
  });

  /** LATER 711 step (2): a candidate is the muzzle push (rB + the muzzle's reach, `PUSH_APART_MUZZLE_REACH_READING`); the slide alone stops a walker near 12. */
  it.fails('S2: a standing walker stops at 14.05-14.26 u and holds over 7 s; the teammate never moves', () => {
    const p = pair('stand', 'stand');
    const seps = run(p, WALK, 7);
    const tick = 26 * TICK;
    expect(within(Math.min(...seps), 14.05, 14.26, tick), `min sep ${Math.min(...seps)}`).toBe(true);
    expect(within(seps.at(-1)!, 14.05, 14.26, tick), `end sep ${seps.at(-1)}`).toBe(true);
    expect(p.tMoved()).toBe(0);
  });

  it('S11: a standing runner into a crouched teammate stops at 12.04-12.98 u', () => {
    const p = pair('stand', 'crouch');
    const seps = run(p, RUN, 3);
    expect(within(seps.at(-1)!, 12.04, 12.98, 65 * TICK), `end sep ${seps.at(-1)}`).toBe(true);
    expect(p.tMoved()).toBe(0);
  });

  it('S12: a crouched runner into a standing teammate stops at 11.97-12.99 u', () => {
    const p = pair('crouch', 'stand');
    const seps = run(p, RUN, 4);
    expect(within(seps.at(-1)!, 11.97, 12.99, 65 * TICK), `end sep ${seps.at(-1)}`).toBe(true);
    expect(p.tMoved()).toBe(0);
  });

  it('S5a: 2 u off-centre, a runner is blocked at 11.1-12.0 u, then slides round and passes', () => {
    const p = pair('stand', 'stand', 40, 2);
    const seps = run(p, RUN, 3);
    expect(within(Math.min(...seps), 11.1, 12.0, 65 * TICK), `min sep ${Math.min(...seps)}`).toBe(true);
    expect(p.along(), 'M ends beyond T').toBeGreaterThan(40);
    expect(p.tMoved()).toBe(0);
  });

  /** LATER 711: the rig's pass is inferred to be the two consoles' lag (research 426 s6); one lag-free sim stalls the pair. */
  it.fails('S3: head-on, both running, they stall and then pass at a minimum of 1.48-2.22 u', () => {
    const p = pair('stand', 'stand', 40, 0, true);
    const seps = run(p, RUN, 3, RUN);
    expect(within(Math.min(...seps), 1.48, 2.22, 65 * TICK), `min sep ${Math.min(...seps)}`).toBe(true);
    expect(p.along(), 'M ends beyond where T started').toBeGreaterThan(40);
  });
});

describe('LATER 711: a crouched teammate stops a crouched body (the rig\'s Q22 crouched pass, 2026-11-15, the teammate legs)', () => {
  it('L1: a crouched runner into a stationary crouched teammate stops at 12.9-13.4 u; the teammate at 0.000 moved', () => {
    const p = pair('crouch', 'crouch');
    const seps = run(p, RUN, 4);
    expect(within(seps.at(-1)!, 12.9, 13.4, 65 * TICK), `end sep ${seps.at(-1)}`).toBe(true);
    expect(p.tMoved()).toBe(0);
  });

  /** LATER 711 step (2), as S2: the slide alone stops a crouched walker near 14. */
  it.fails('L2: a crouched walker stops at 18.1-19.2 u and holds', () => {
    const p = pair('crouch', 'crouch');
    const seps = run(p, WALK, 7);
    expect(within(seps.at(-1)!, 18.1, 19.2, 26 * TICK), `end sep ${seps.at(-1)}`).toBe(true);
    expect(Math.min(...seps), 'held: never closer than the hold').toBeGreaterThanOrEqual(18.1 - 26 * TICK);
    expect(p.tMoved()).toBe(0);
  });

  it('L7: overtaking, a runner is held 13.6-14.4 u behind a walker', () => {
    const p = pair('crouch', 'crouch', 40, 0, false);
    const seps = run(p, RUN, 5, WALK);
    expect(within(seps.at(-1)!, 13.6, 14.4, 65 * TICK), `end sep ${seps.at(-1)}`).toBe(true);
  });

  it('L0 control: with no body ahead the runner keeps its clear line (the rig 176.5 u in 3 s)', () => {
    const m = new Walker(GRID); m.place(0, 20, 0); m.state.yaw = 0;
    for (let k = 0; k < Math.round(3 / TICK); k++) m.tick(RUN);
    expect(Math.hypot(m.state.x, m.state.z)).toBeGreaterThan(150);
  });
});
