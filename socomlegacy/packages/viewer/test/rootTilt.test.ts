import { describe, expect, it, vi } from 'vitest';
import { buildGrid, parseMotionClip, sampleClip, type WorldPoly } from '@s2u/scene';
import { Zar } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { SEAL_ANIMS } from '../src/locomotion';
import { motionTableFromArchive } from '../src/motionTable';
import { HOLD_CLIPS, moverSnapshot, Walker } from '../src/mover';
import {
  DIVE_KEYS, PRONE_TILT_EASE, TILT_WINDOWS, oneShotPhase, rootTiltStart, rotateByQuat, shortestArc, stepRootTilt, tiltWeight, tiltWindowOf,
  worldToBody, type RootTiltState, type TiltInput, type TiltReadings, type TiltVec,
} from '../src/rootTilt';
import { TRAVERSAL_CLIP } from '../src/traversal';
import { FsAssetSource } from '@s2u/archive/node';
import { loadSimMap } from '../src/simMap';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PRONE-TILT (research 217 section 7; reading, pending review): `FUN_00548090` (D:L413179-413287) transcribed -- the
 * skeleton root laid on the floor hit's normal by the top play's `Normalize` window, the settled prone body easing 0.2 a
 * tick. Transcription tests on synthetic normals, a walker on a synthetic 20-degree ramp, and the windows pinned against
 * the fixture's `motion.rdr` and `MOTION_P.ZAR`.
 */

const deg = (r: number): number => (r * 180) / Math.PI;
const angle = (a: readonly number[], b: readonly number[]): number => {
  const d = (a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) / (Math.hypot(a[0]!, a[1]!, a[2]!) * Math.hypot(b[0]!, b[1]!, b[2]!));
  return deg(Math.acos(Math.min(1, Math.max(-1, d))));
};
const rad = (d: number): number => (d * Math.PI) / 180;
/** Uphill toward -z (the facing at yaw 0): the normal leans back, +z. */
const UPHILL_20: TiltVec = [0, Math.cos(rad(20)), Math.sin(rad(20))];
/** Rising toward -x (left at yaw 0): the normal leans right, +x. */
const SIDE_20: TiltVec = [Math.sin(rad(20)), Math.cos(rad(20)), 0];
const PRONE_AT_REST = (normal: readonly number[], yaw = 0): TiltInput => ({
  normal, yaw, span: [0, 0], phase: 0.5, prone: true, proneTransition: false, diving: false, airborne: false,
});
const run = (input: TiltInput, ticks: number, readings?: TiltReadings, from: RootTiltState = rootTiltStart()): RootTiltState => {
  let s = from;
  for (let i = 0; i < ticks; i++) s = stepRootTilt(s, input, readings);
  return s;
};

describe('the weight over the Normalize window (FUN_00548090 D:L413225-413255)', () => {
  it('A = B: 0 at or under A, 1 over it', () => {
    expect([0, 0.3, 0.3001, 1].map((p) => tiltWeight(p, 0.3, 0.3))).toEqual([0, 0, 1, 1]);
    expect([0, 1e-6].map((p) => tiltWeight(p, 0, 0))).toEqual([0, 1]);                // bare: phase 0 weighs 0
    expect([0.5, 1, 1.0001].map((p) => tiltWeight(p, 1, 1))).toEqual([0, 0, 1]);        // absent: never within a play
  });
  it('A < B: 0 at or under A, 1 at or over B, linear between', () => {
    expect([0.2, 0.5, 0.6, 0.7, 0.9, 1].map((p) => tiltWeight(p, 0.5, 0.9))).toEqual([0, 0, expect.closeTo(0.25, 12), expect.closeTo(0.5, 12), 1, 1]);
  });
  it('A > B: 1 at or under B, 0 at or over A, 1 - (p - B) / (A - B) between', () => {
    expect([0, 0.5, 0.75, 0.9, 1, 1.2].map((p) => tiltWeight(p, 1, 0.5))).toEqual([1, 1, 0.5, expect.closeTo(0.2, 12), 0, 0]);
  });
});

describe('the vector helpers as the original\'s', () => {
  it('FUN_00306d40: the half vector\'s quaternion turns up onto a unit target; a short target turns less; opposite is the half turn about x', () => {
    const q = shortestArc([0, 1, 0], UPHILL_20);
    expect(angle(rotateByQuat(q, [0, 1, 0]), UPHILL_20)).toBeLessThan(1e-9);
    expect(Math.hypot(...q)).toBeCloseTo(1, 12);
    const half: TiltVec = [UPHILL_20[0] * 0.5, UPHILL_20[1] * 0.5, UPHILL_20[2] * 0.5];
    expect(angle(rotateByQuat(shortestArc([0, 1, 0], half), [0, 1, 0]), [0, 1, 0])).toBeLessThan(20);
    expect(shortestArc([0, 1, 0], [0, -1, 0])).toEqual([1, 0, 0, 0]);
    expect(shortestArc([0, 1, 0], [0, 2, 0])).toEqual([0, 0, 0, 1]);
  });
  it('the world into the body frame undoes the yaw (play.ts actorToWorld inverted)', () => {
    const r = rad(30), v: TiltVec = [0.3, 0.9, -0.2];
    const body = worldToBody(30, v);
    // actorToWorld's turn: [x c + z s, y, -x s + z c]
    expect([body[0] * Math.cos(r) + body[2] * Math.sin(r), body[1], -body[0] * Math.sin(r) + body[2] * Math.cos(r)].map((x) => +x.toFixed(12))).toEqual(v);
  });
});

describe('the rule (FUN_00548090 D:L413256-413282)', () => {
  it('prone at rest up a 20-degree slope: the root\'s up eases 0.2 a tick from level and settles on the normal (root-up basis)', () => {
    const one = run(PRONE_AT_REST(UPHILL_20), 1);
    expect(angle(one.up, [0, 1, 0])).toBeGreaterThan(1);
    expect(angle(one.up, [0, 1, 0])).toBeLessThan(10);                                  // not the full slope at once
    const settled = run(PRONE_AT_REST(UPHILL_20), 200);
    expect(angle(settled.up, UPHILL_20)).toBeLessThan(1e-6);
    // facing uphill, the head end (forward, -z) lifts: the root's forward rises by the slope
    const fwd = rotateByQuat(settled.q!, [0, 0, -1]);
    expect(deg(Math.asin(fwd[1]))).toBeCloseTo(20, 6);
  });

  it('a 20-degree side slope gives 20 degrees of roll and leaves the heading as it was', () => {
    for (const yaw of [0, 90, 217]) {
      const world = worldToBody(-yaw, SIDE_20);                                         // the same slope under the body's own frame
      const s = run(PRONE_AT_REST(world, yaw), 200);
      expect(angle(s.up, SIDE_20)).toBeLessThan(1e-6);
      const fwd = rotateByQuat(s.q!, [0, 0, -1]);
      expect(Math.abs(fwd[0])).toBeLessThan(1e-9);                                      // no turn off the facing
      expect(fwd[1]).toBeCloseTo(0, 9);                                                 // no pitch on a side slope
      const right = rotateByQuat(s.q!, [1, 0, 0]);
      expect(deg(Math.asin(-right[1]))).toBeCloseTo(20, 6);
    }
  });

  it('the dive: 0 at or under phase 0.5, full at or over 0.9, linear between (D:L413219-413223), its own window whatever the motion\'s', () => {
    const dive = (phase: number): RootTiltState => stepRootTilt(rootTiltStart(), {
      normal: UPHILL_20, yaw: 0, span: [1, 1], phase, prone: false, proneTransition: false, diving: true, airborne: false,
    });
    expect([0.3, 0.5].map((p) => dive(p).q)).toEqual([null, null]);
    expect(angle(dive(0.9).up, UPHILL_20)).toBeLessThan(1e-9);
    expect(angle(dive(0.95).up, UPHILL_20)).toBeLessThan(1e-9);
    // at 0.7 (w 0.5) the target is the lerp halfway, and the root takes it whole (no ease off posture 2)
    const half = worldToBody(0, [UPHILL_20[0] * 0.5, 0.5 + UPHILL_20[1] * 0.5, UPHILL_20[2] * 0.5]);
    expect(angle(dive(0.7).up, rotateByQuat(shortestArc([0, 1, 0], half), [0, 1, 0]))).toBeLessThan(1e-9);
    expect(angle(dive(0.7).up, [0, 1, 0])).toBeGreaterThan(5);
    expect(angle(dive(0.7).up, [0, 1, 0])).toBeLessThan(15);
  });

  it('the 0.2 ease runs only prone and with neither 0x13 nor 0x19 playing; otherwise the target is taken at once', () => {
    const firstTilt = (input: Partial<TiltInput>): number => angle(stepRootTilt(rootTiltStart(), { ...PRONE_AT_REST(UPHILL_20), ...input }).up, [0, 1, 0]);
    expect(firstTilt({})).toBeLessThan(10);
    expect(firstTilt({ proneTransition: true })).toBeCloseTo(20, 9);
    expect(firstTilt({ prone: false })).toBeCloseTo(20, 9);
    expect(PRONE_TILT_EASE).toBe(0.2);
  });

  it('the world-up basis (PRONE_TILT_EASE_BASIS_READING switched) holds a fixed fifth of the way, tick after tick', () => {
    const readings: TiltReadings = { basis: 'world-up', unwritten: 'clip', standCrouch: 'by-span' };
    const one = run(PRONE_AT_REST(UPHILL_20), 1, readings), many = run(PRONE_AT_REST(UPHILL_20), 200, readings);
    expect(angle(many.up, one.up)).toBeLessThan(1e-9);
    const fifth = worldToBody(0, [UPHILL_20[0] * 0.2, 0.8 + UPHILL_20[1] * 0.2, UPHILL_20[2] * 0.2]);
    expect(angle(many.up, rotateByQuat(shortestArc([0, 1, 0], fifth), [0, 1, 0]))).toBeLessThan(1e-9);
    expect(angle(many.up, UPHILL_20)).toBeGreaterThan(10);
  });

  it('nothing written in the air (D:L413207-413211) unless dead; a w of 0 writes nothing: the clip\'s level root (clip) or the last tilt (held)', () => {
    const settled = run(PRONE_AT_REST(UPHILL_20), 200);
    const air = stepRootTilt(settled, { ...PRONE_AT_REST(UPHILL_20), airborne: true });
    expect(air).toEqual(rootTiltStart());
    const held = stepRootTilt(settled, { ...PRONE_AT_REST(UPHILL_20), airborne: true }, { basis: 'root-up', unwritten: 'held', standCrouch: 'by-span' });
    expect(held).toEqual(settled);
    const dead = stepRootTilt(rootTiltStart(), { ...PRONE_AT_REST(UPHILL_20), airborne: true, deadTop: true, span: [1, 1], phase: 0.9, prone: false });
    expect(dead.q).not.toBeNull();
    // standing on the slope: seal_stand has no Normalize (1, 1), so the rule writes nothing
    expect(stepRootTilt(settled, { ...PRONE_AT_REST(UPHILL_20), prone: false, span: tiltWindowOf(SEAL_ANIMS.stand) })).toEqual(rootTiltStart());
  });

  it('a one-shot\'s phase runs 0 .. (n - 1) / n, backwards from its end', () => {
    expect([0, 0.5, 1].map((p) => oneShotPhase(p, 36, false))).toEqual([0, 0.5 * 35 / 36, 35 / 36]);
    expect(oneShotPhase(0, 36, true)).toBe(35 / 36);
    expect(oneShotPhase(1, 36, true)).toBe(0);
  });

  it('costs little: 16 bodies a tick (a micro-benchmark, reported, not tightly asserted)', () => {
    const states = Array.from({ length: 16 }, () => rootTiltStart());
    const inputs = states.map((_, i) => PRONE_AT_REST([Math.sin(rad(i)), Math.cos(rad(i)), Math.sin(rad(20 - i)) * 0.3], i * 20));
    const ticks = 6000;
    const t0 = performance.now();
    for (let k = 0; k < ticks; k++) for (let i = 0; i < 16; i++) states[i] = stepRootTilt(states[i]!, inputs[i]!);
    const perTick = (performance.now() - t0) / ticks;
    console.log(`PRONE-TILT cost: stepRootTilt for 16 bodies, ${(perTick * 1000).toFixed(2)} us a tick (${ticks} ticks)`);
    expect(perTick).toBeLessThan(1);
  });
});

/** A 400 x 400 plane through the origin with normal `n` (y > 0), as one ground polygon, and its grid. */
function plane(n: TiltVec): { grid: ReturnType<typeof buildGrid>; polys: WorldPoly[]; y: (x: number, z: number) => number } {
  const y = (x: number, z: number): number => -(n[0] * x + n[2] * z) / n[1];
  const p: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/slope', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, y(-200, 200), 200, 200, y(200, 200), 200, 200, y(200, -200), -200, -200, y(-200, -200), -200]),
  };
  const grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    [], [], [p], [{ modelName: p.modelName, path: p.path, first: 0, count: 1 }]);
  return { grid, polys: [p], y };
}

describe('PRONE-TILT-2 (EPH Q2, proven): the rule steps once a 30 Hz game frame, not once a 60 Hz walk tick (FUN_005506a0 D:L417863)', () => {
  it('a walker laid prone on a 20-degree slope closes 0.2 of the remaining angle a game frame: about 30 steps a second, the angle after N of them 20 x 0.8^N', () => {
    const { grid, y } = plane(UPHILL_20);
    const w = new Walker(grid);
    expect(w.place(0, y(0, 0) + 5, 0)).toBe(true);
    w.state.yaw = 0;
    w.stance = 'prone';
    const left = (): number => angle(w.rootTilt.up, worldToBody(w.state.yaw, UPHILL_20));
    const steps: number[] = [];
    let last = left();
    for (let i = 0; i < 60; i++) {                                   // one second of 60 Hz ticks
      w.tick({ forward: 0, right: 0, boost: false });
      const now = left();
      if (Math.abs(now - last) > 1e-12) steps.push(now);
      last = now;
    }
    expect(PRONE_TILT_EASE).toBe(0.2);                              // D:L413267, not refitted
    // 29.97 game frames in a second (GAME_FRAME_DT = 525/15734 s): the rule wrote 29 or 30 times, never 60
    expect(steps.length).toBeGreaterThanOrEqual(29);
    expect(steps.length).toBeLessThanOrEqual(30);
    // each step closes 0.2 of what is left (the chord lerp of FUN_00308fc0: within 1% of 0.8 at these angles)
    for (let n = 1; n < steps.length; n++) expect(steps[n]! / steps[n - 1]!).toBeCloseTo(0.8, 2);
    expect(steps[9]! / 20).toBeCloseTo(0.8 ** 10, 2);
  });
});

describe('the walker runs the rule each tick, after its move, from its own floor (the page, the room, one Walker)', () => {
  it('prone at rest on a 20-degree ramp facing uphill: the root settles on the floor\'s normal; the snapshot carries it', () => {
    const { grid, y } = plane(UPHILL_20);
    const w = new Walker(grid);
    expect(w.place(0, y(0, 0) + 5, 0)).toBe(true);
    w.state.yaw = 0;
    w.stance = 'prone';
    for (let i = 0; i < 240; i++) w.tick({ forward: 0, right: 0, boost: false });
    expect(w.posture).toBe('prone');
    expect(angle(w.tiltNormal, UPHILL_20)).toBeLessThan(1e-4);
    expect(angle(w.rootTilt.up, worldToBody(w.state.yaw, UPHILL_20))).toBeLessThan(1e-3);
    expect(moverSnapshot(w, null, 0, 0).rootTilt).toEqual(w.rootTilt.q);
    // a kept state carries the tilt (PAR-37's rerun)
    const kept = w.saveState(), before = w.rootTilt;
    w.stance = 'stand';
    w.tick({ forward: 0, right: 0, boost: false });
    expect(w.rootTilt.q).toBeNull();                                                   // standing: no Normalize, the clip's level root
    w.restoreState(kept);
    expect(w.rootTilt).toEqual(before);
  });

  it('on flat ground the prone root stays level', () => {
    const { grid } = plane([0, 1, 0]);
    const w = new Walker(grid);
    expect(w.place(0, 5, 0)).toBe(true);
    w.stance = 'prone';
    for (let i = 0; i < 60; i++) w.tick({ forward: 0, right: 0, boost: false });
    expect(angle(w.rootTilt.up, [0, 1, 0])).toBeLessThan(1e-9);
  });

  it('the floor normal is read only on a tick the rule writes: a w of 0 never asks it and leaves the same root as with it', () => {
    const settled = run(PRONE_AT_REST(UPHILL_20), 200);
    const asked = vi.fn(() => UPHILL_20 as readonly number[]);
    // w 0: standing (no window), a bare window at phase 0, in the air -- the same state as with the normal given, never asked
    for (const input of [
      { ...PRONE_AT_REST(UPHILL_20), prone: false, span: tiltWindowOf(SEAL_ANIMS.stand) },
      { ...PRONE_AT_REST(UPHILL_20), phase: 0 },
      { ...PRONE_AT_REST(UPHILL_20), airborne: true },
    ] as TiltInput[]) {
      expect(stepRootTilt(settled, { ...input, normal: asked })).toEqual(stepRootTilt(settled, input));
    }
    expect(asked).not.toHaveBeenCalled();
    // w > 0: asked once, and the same root as with the vector
    expect(stepRootTilt(settled, { ...PRONE_AT_REST(UPHILL_20), normal: asked })).toEqual(stepRootTilt(settled, PRONE_AT_REST(UPHILL_20)));
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it('a standing or running walker never picks the floor for the tilt; a prone one does, once a game frame', () => {
    const { grid, y } = plane(UPHILL_20);
    const w = new Walker(grid);
    expect(w.place(0, y(0, 0) + 5, 0)).toBe(true);
    const pick = vi.spyOn(w as unknown as { tiltFloorNormal: () => unknown }, 'tiltFloorNormal');
    for (let i = 0; i < 60; i++) w.tick({ forward: 0, right: 0, boost: false });
    for (let i = 0; i < 60; i++) w.tick({ forward: 1, right: 0.3, boost: false });
    expect(w.posture).toBe('stand');
    expect(pick).not.toHaveBeenCalled();
    w.stance = 'prone';
    for (let i = 0; i < 30; i++) w.tick({ forward: 0, right: 0, boost: false });
    expect(pick.mock.calls.length).toBeGreaterThanOrEqual(14);         // 30 ticks: 15 game frames (14 or 15 by the carry)
    expect(pick.mock.calls.length).toBeLessThanOrEqual(15);
  });

  it('with no wall on the slope the tilt moves nothing: a walker with the rule switched off takes the same positions, velocities and postures, tick for tick (PRONE-TILT-2 (3): the prone low line tilts, and meets nothing here)', () => {
    const { grid, y } = plane(UPHILL_20);
    const make = (off: boolean): Walker => {
      const w = new Walker(grid);
      w.place(10, y(10, 0) + 5, 0);
      if (off) (w as unknown as { tiltTick: () => void }).tiltTick = () => {};
      return w;
    };
    const on = make(false), off = make(true);
    let tilted = 0;
    const state = (w: Walker): unknown[] => [w.state.x, w.state.y, w.state.z, w.state.vx, w.state.vy, w.state.vz, w.state.yaw, w.posture, w.airborne, w.action?.name ?? null];
    for (let i = 0; i < 900; i++) {
      for (const w of [on, off]) {
        if (i === 120) w.changeStance('prone');
        if (i === 400) w.changeStance('stand');
        if (i === 600 && !w.airborne) w.jump();
        w.state.yaw = (i * 0.7) % 360;
        w.tick({ forward: i % 300 < 200 ? 1 : -0.5, right: i % 90 < 45 ? 0.4 : -0.4, boost: false });
      }
      expect(state(on), `tick ${i}`).toEqual(state(off));
      if (on.rootTilt.q && Math.abs(on.rootTilt.q[3]) < 0.999) tilted++;
    }
    expect(tilted).toBeGreaterThan(100);                           // the rule did tilt one of them, prone on the slope
    expect(off.rootTilt.q).toBeNull();
  });

  it('PRONE-TILT-2 (3): where the prone low line meets a wall on the slope the tilt moves the body -- the same until the line reaches the fin, then the level one stops 8 short and the tilted one crawls over', () => {
    // Uphill toward -z (UPHILL_20), a fin across the slope at z -40 standing 1.5 over the ground there (PRONE_PROBE_TILT_READING).
    const { polys, y } = plane(UPHILL_20);
    const finY = y(0, -40);
    const fin: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/fin', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-150, finY - 1, -40, 150, finY - 1, -40, 150, finY + 1.5, -40, -150, finY + 1.5, -40]),
    };
    const grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
      [], [], [...polys, fin], [{ modelName: 'worldmodel', path: 'worldmodel/slope', first: 0, count: 1 }, { modelName: 'worldmodel', path: 'worldmodel/fin', first: 1, count: 1 }]);
    const make = (off: boolean): Walker => {
      const w = new Walker(grid);
      w.place(0, y(0, 0) + 5, 0);
      if (off) (w as unknown as { tiltTick: () => void }).tiltTick = () => {};
      w.state.yaw = 0;
      w.stance = 'prone';
      return w;
    };
    const on = make(false), off = make(true);
    let parted = -1;
    for (let i = 0; i < 900; i++) {
      for (const w of [on, off]) w.tick({ forward: i < 60 ? 0 : 1, right: 0, boost: false });
      if (parted < 0 && (on.state.z !== off.state.z || on.state.x !== off.state.x)) parted = i;
    }
    expect(parted).toBeGreaterThan(60);
    expect(off.state.z).toBeCloseTo(-40 + 8, 4);                                     // level: stopped with the fin 8 ahead
    expect(on.state.z).toBeLessThan(-50);                                            // tilted: over it
    // where they parted, the level one was within 8 of the fin (its line met it), the tilted one's not yet stopped
    expect(Math.abs(off.state.z - -40)).toBeLessThanOrEqual(8 + 1e-6);
  });

  it('costs: 16 walkers with the rule and with it switched off, running and prone (reported)', () => {
    const { grid, y } = plane(UPHILL_20);
    const make = (off: boolean, prone: boolean): Walker[] => Array.from({ length: 16 }, (_, i) => {
      const w = new Walker(grid);
      w.place(-80 + i * 10, y(-80 + i * 10, 0) + 5, 0);
      if (prone) w.stance = 'prone';
      if (off) (w as unknown as { tiltTick: () => void }).tiltTick = () => {};
      return w;
    });
    const time = (ws: Walker[], prone: boolean): number => {
      const ticks = 2000, t0 = performance.now();
      for (let n = 0; n < ticks; n++) for (const w of ws) w.tick({ forward: prone ? 0 : n % 200 < 100 ? 1 : -1, right: prone ? 0 : 0.2, boost: false });
      return ((performance.now() - t0) / ticks) * 1000;
    };
    for (const prone of [false, true]) {
      const rounds = [0, 1, 2].map(() => [time(make(false, prone), prone), time(make(true, prone), prone)]);
      console.log(`PRONE-TILT cost, 16 ${prone ? 'prone' : 'running'} walkers, us a tick (with / without the rule): `
        + rounds.map(([a, b]) => `${a!.toFixed(1)} / ${b!.toFixed(1)}`).join(', '));
    }
  });

  it('costs little in the walker: 16 prone walkers ticked on the ramp (reported)', () => {
    const { grid, y } = plane(UPHILL_20);
    const ws = Array.from({ length: 16 }, (_, i) => {
      const w = new Walker(grid);
      w.place(-80 + i * 10, y(-80 + i * 10, 0) + 5, 0);
      w.stance = 'prone';
      return w;
    });
    for (const w of ws) w.tick({ forward: 0, right: 0, boost: false });
    const ticks = 300, t0 = performance.now();
    for (let k = 0; k < ticks; k++) for (const w of ws) w.tick({ forward: 0, right: 0, boost: false });
    console.log(`PRONE-TILT cost: 16 prone walkers, ${((performance.now() - t0) / ticks).toFixed(3)} ms a tick, the tilt and its floor probe included`);
  });
});

const MP2 = fixture('RUN/MP2.ZDB');
const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
describe.skipIf(!MP2)(`the floors a tilt reads are the map's own (FUN_005b0420's CSealEx branch)${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it("every owner of the room's ground is a worldmodel scene node: no actor is a floor, so +0x410's held branch cannot arise", async () => {
    const map = await loadSimMap(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB');
    expect(map.ground.owners.length).toBeGreaterThan(100);
    expect(map.ground.owners.filter((o) => !o.path.startsWith('worldmodel'))).toEqual([]);
  });
});

const READERC = fixture('RUN/READERC.ZAR'), PACK = fixture('RUN/MOTION_P.ZAR');
describe.skipIf(!READERC || !PACK)(`the windows and the clips' roots against the disc${READERC && PACK ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('TILT_WINDOWS is motion.rdr\'s Normalize for every clip a walker\'s top can be on (actions, holds, ground plays, the traversal clips)', () => {
    const table = motionTableFromArchive(READERC!)!;
    const names = new Set<string>([...Object.values(SEAL_ANIMS), ...Object.keys(HOLD_CLIPS), ...Object.values(TRAVERSAL_CLIP)]);
    for (const name of names) {
      const e = table.get(name);
      if (!e) continue;
      expect(tiltWindowOf(name), name).toEqual(e.normalize);
    }
    for (const name of Object.keys(TILT_WINDOWS)) expect(table.get(name)?.normalize, name).toEqual(TILT_WINDOWS[name]);
    // traversalPhase asks only "past 0" of a move's clip: every one but the dive is windowless or bare
    for (const name of Object.values(TRAVERSAL_CLIP)) {
      if (name !== TRAVERSAL_CLIP.dive) expect([[1, 1], [0, 0]], name).toContainEqual(tiltWindowOf(name));
    }
  });

  it('the clips that track skel_root hold it at the identity rotation but three (ROOT_TILT_UNWRITTEN_READING "clip": level), every windowed clip among them', () => {
    const zar = Zar.parse(PACK!);
    const turning: string[] = [];
    let tracked = 0;
    const keys: { name: string; offset: number; size: number; children: unknown[] }[] = [];
    zar.walk((k) => { if (k.size > 0 && !k.children.length) keys.push(k); });
    for (const key of keys) {
      let clip: ReturnType<typeof parseMotionClip>;
      try { clip = parseMotionClip(zar.data(key as Parameters<typeof zar.data>[0]), key.name); } catch { continue; }
      const root = clip.parts.find((p) => p.name === 'skel_root');
      if (!root) continue;
      tracked++;
      for (let k = 0; k < root.rotations.length; k += 4) {
        if (Math.abs(root.rotations[k + 3]!) < 1 - 1e-4) { turning.push(clip.name); break; }
      }
    }
    console.log(`PRONE-TILT: ${tracked} clips track skel_root; turning it: ${turning.join(' ') || 'none'}`);
    expect(tracked).toBeGreaterThan(100);
    expect(turning).toEqual(['seal_180', 'guard_susp_look_back', 'seal_walk_alert02']);
    expect(Object.keys(TILT_WINDOWS).filter((n) => turning.includes(n))).toEqual([]);
    const dive = parseMotionClip(zar.data(zar.find(TRAVERSAL_CLIP.dive)!), TRAVERSAL_CLIP.dive);
    expect(dive.frameCount).toBe(DIVE_KEYS);
    expect(sampleClip(dive, 0).parts.length).toBeGreaterThan(0);
  });
});
