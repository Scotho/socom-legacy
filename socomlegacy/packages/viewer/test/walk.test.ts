// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FsAssetSource } from '@s2u/archive/node';
import { buildGrid, probeGround, GAME_FRAME_DT, PROBE_LIFT, SEAL_LOCOMOTION, SEAL_TUNING, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { FlyCamera } from '../src/camera';
import { loadMap } from '../src/loadMap';
import {
  groundGrid, groundPolygons, landingClass, packGround, rootY, runningJumpSpeed, stanceBody, throttleStep, Walker, WalkMode, ACTION_CLIPS,
  ACTION_SECONDS, BODY_RADIUS, CARRY_DECAY, DEATH_LANDING_GETUP_PLACEHOLDER, EYE_HEIGHT, JUMP_DELAY, JUMP_LOCK, landingHitDraw, RUNNING_JUMP_SPEED,
  STANCES, TICK,
  type GroundData, type Stance, type WalkInput,
} from '../src/walk';
import { PRONE_ROOT, SWAP_OVERLAY_SECONDS, swapPlayedOut, type ActionEnd } from '../src/mover';
import { PICKUP_SWAP_OWN_LAG_READING } from '../src/walk';
import { playedOutCommand } from '../src/mover';
import { motionTableFromArchive } from '../src/motionTable';
import { fireCapability } from '../src/net/fireCapability';
import { lookHeight, ramp } from '../src/cameraRig';
import { Traversal } from '../src/traversal';
import { readMotionTable } from '../src/motionTable';
import { GATE_MOTION_RECORDS } from './helpers/gateTable';
import { CROUCH_GATE_REACH_READING, CROUCH_GATE_READING, HEADROOM_HIPS_READING, PRONE_GATE_READING, STEP_PROBE_LIFT_READING, WALL_PROBE_READING, wallProbeHeights } from '../src/mover';
import { MoverSim } from '../src/net/moverSim';
import { Button, holdBits, STANCE_CODES, type Command } from '../src/net/protocol';
import { FLINCH_CUT_COMMANDS } from '../src/net/flinchReload';
import { reloadCutOf } from '../src/reloadLock';
import { LAUNCHER_RAISE_CLIPS } from '../src/equipment';
import { LAUNCHER_MOVING_LOWER, launcherBaseCommand, launcherMovingLowerCommands, launcherMovingLowerSeconds, launcherStickLowers } from '../src/mover';

/**
 * The walk (web sprint 1, W1.4): a mover at the engine's 60 Hz on the probe's floor, sliding on walls at radius
 * 3.5, the eye 15.4 over the feet (W1.R2). Synthetic worlds pin the rules; Frostfire's route pins the whole.
 */

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP2 = fixture('RUN/MP2.ZDB');

/** A flat ground polygon (`m_ditype` 3: bits 0 and 1), world space. */
function floor(minX: number, minZ: number, maxX: number, maxZ: number, y: number): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([minX, y, minZ, maxX, y, minZ, maxX, y, maxZ, minX, y, maxZ]),
  };
}

/** A vertical wall across z at `x`, from y0 to y1 (`m_ditype` 2: bit 1, the column probe's, research 24 section 1.2). */
function wallX(x: number, z0: number, z1: number, y0: number, y1: number, cameratype = 0): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/wall', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype,
    points: Float32Array.from([x, y0, z0, x, y0, z1, x, y1, z1, x, y1, z0]),
  };
}

/**
 * SEGMENT-BODY: `wallX` with z0 < z1 is wound so its own normal (Newell's) is -x: a hull face is hit only from its
 * front (research 281 s4.3), so a body walked into it from +x passes it. This one faces +x.
 */
function wallXEast(x: number, z0: number, z1: number, y0: number, y1: number): WorldPoly {
  return wallX(x, z1, z0, y0, y1);
}

/** A 4 x 4 grid of `cellDim` cells (100 by default) from (-2, -2) cells, one owner per polygon. */
function world(polys: WorldPoly[], cellDim = 100): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim, cellsX: 4, cellsZ: 4, originX: -2 * cellDim, originZ: -2 * cellDim };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

/** The yaw, in degrees, that faces from (x, z) toward (tx, tz): the camera looks down its own -z (`camera.ts`). */
const facing = (x: number, z: number, tx: number, tz: number): number => Math.atan2(-(tx - x), -(tz - z)) * 180 / Math.PI;

const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };
const STILL: WalkInput = { forward: 0, right: 0, boost: false };

describe('the mover (W1.4, W1.R2)', () => {
  const plain = world([floor(-200, -200, 200, 200, 0)]);

  it('stands on the floor under a point, eye 15.4 over its feet, and refuses a point with no floor', () => {
    const w = new Walker(plain);
    expect(w.place(10, 50, 20)).toBe(true);
    expect([w.state.x, w.state.y, w.state.z]).toEqual([10, 0, 20]);
    expect(w.eye()).toEqual([10, EYE_HEIGHT, 20]);
    expect(EYE_HEIGHT).toBe(15.4);                        // research 17 section 1's 15.38, W1.R2
    expect(w.place(500, 50, 500)).toBe(false);            // off the grid's floor: nothing under it
    expect([w.state.x, w.state.z]).toEqual([10, 20]);     // and the mover has not moved
  });

  it('steps at 60 Hz whatever the frame rate: 30 fps and 240 fps land in the same place', () => {
    const run = (fps: number): [number, number, number] => {
      const w = new Walker(plain);
      w.place(0, 0, 0);
      w.state.yaw = facing(0, 0, 1, 0);
      for (let i = 0; i < fps; i++) w.advance(1 / fps, FORWARD);
      return [w.state.x, w.state.y, w.state.z];
    };
    const slow = run(30), fast = run(240);
    expect(slow[0]).toBeGreaterThan(20);
    expect(fast[0]).toBeCloseTo(slow[0], 9);
    expect(fast[2]).toBeCloseTo(slow[2], 9);
    // The accumulator carries the remainder: two 10 ms frames make one tick, not zero.
    const w = new Walker(plain);
    w.place(0, 0, 0);
    expect(w.advance(0.01, FORWARD)).toBe(0);
    expect(w.advance(0.01, FORWARD)).toBe(1);
    expect(TICK).toBe(1 / 60);                            // CGame::Tick, socomlegacy/docs/research/71 section 1.5
  });

  it('a step toward a wall is still stopped when the walk is fast: 65 a second is 1.08 a tick', () => {
    const w = new Walker(plain);
    w.place(0, 0, 0);
    w.state.yaw = facing(0, 0, 0, -1);
    for (let i = 0; i < 60; i++) w.tick(FORWARD);
    expect(w.state.vx * w.state.vx + w.state.vz * w.state.vz).toBeGreaterThan(64 * 64);
  });
});

/** Speeds of every tick, units a second, over `ticks` ticks of `input` on a big flat floor, facing -z. */
function speeds(input: WalkInput, ticks: number, stance: Stance = 'stand', from?: Walker): { w: Walker; v: number[] } {
  const w = from ?? new Walker(world([floor(-2000, -2000, 2000, 2000, 0)], 1000));
  if (!from) { w.place(0, 0, 0); w.stance = stance; }
  const v: number[] = [];
  for (let i = 0; i < ticks; i++) {
    const x = w.state.x, z = w.state.z;
    w.tick(input);
    v.push(Math.hypot(w.state.x - x, w.state.z - z) / TICK);
  }
  return { w, v };
}
/** The mean speed over the last second of a run: distance / time, as the brief measures it. */
const lastSecond = (v: number[]): number => v.slice(-60).reduce((a, b) => a + b, 0) / 60;

describe('the game\'s speeds (W2.2b, W2.R2): motion.rdr\'s bands through FUN_00586c10 and FUN_00583350', () => {
  it('ten seconds of full forward holds 65.0 a second; back 37.0; the strafes 65; the boost does nothing', () => {
    expect(lastSecond(speeds(FORWARD, 600).v)).toBeCloseTo(65, 1);                                   // seal_run 6.5 m/s
    expect(lastSecond(speeds({ forward: -1, right: 0, boost: false }, 600).v)).toBeCloseTo(37, 1);   // seal_run_bw 3.7
    expect(lastSecond(speeds({ forward: 0, right: 1, boost: false }, 600).v)).toBeCloseTo(65, 1);    // seal_rstrafe
    expect(lastSecond(speeds({ forward: 0, right: -1, boost: false }, 600).v)).toBeCloseTo(65, 1);   // seal_lstrafe
    expect(lastSecond(speeds({ forward: 1, right: 0, boost: true }, 600).v)).toBeCloseTo(65, 1);     // W2.R2: no boost
  });

  it('the throttle is linear (throt_exp 1): half a stick is 32.5', () => {
    expect(lastSecond(speeds({ forward: 0.5, right: 0, boost: false }, 600).v)).toBeCloseTo(32.5, 1);
    expect(lastSecond(speeds({ forward: -0.5, right: 0, boost: false }, 600).v)).toBeCloseTo(18.5, 1);
  });

  it('a diagonal blends the run and the strafe by the stick\'s angle and renormalises: 65 at 45 degrees, heading 45', () => {
    const s = Math.SQRT1_2;
    const { w, v } = speeds({ forward: s, right: s, boost: false }, 600);
    expect(lastSecond(v)).toBeCloseTo(65, 1);
    // Facing -z, right is +x: the heading is 45 degrees between them.
    expect(Math.atan2(w.state.x, -w.state.z) * 180 / Math.PI).toBeCloseTo(45, 0);
  });

  it('the ramp: the stick moves at most upper_z_accel 5 a second, so 90 % of the run is reached on tick 11 (0.18 s)', () => {
    const { v } = speeds(FORWARD, 30);
    const first90 = v.findIndex((x) => x >= 0.9 * 65) + 1;
    expect(first90).toBe(11);                                   // 0.9 / 5 = 0.18 s = 10.8 ticks, up to the next tick
    expect(v[0]).toBeCloseTo(65 * 5 / 60, 6);                   // one tick of 5 a second
    expect(v[11]).toBeCloseTo(65, 6);                           // full at 0.2 s
    // The limit is lower_z_accel 2 with the stick at rest and upper 5 at full: (1 - (1 - |s|)^8) between them.
    expect(throttleStep(0, 1, 'forward', TICK)).toBeCloseTo(5 / 60, 9);
    expect(throttleStep(0.5, 0, 'forward', TICK)).toBeCloseTo(0.5 - 2 / 60, 9);
    expect(throttleStep(0, 0.5, 'forward', TICK)).toBeCloseTo((2 + 3 * (1 - 0.5 ** 8)) / 60, 9);
  });

  it('a stick let go stops at once, from full or half (FUN_00586f00 idles it; FUN_00586570 skips the ramp at rest)', () => {
    const run = speeds(FORWARD, 60);
    expect(speeds(STILL, 1, 'stand', run.w).v[0]).toBe(0);
    const half = speeds({ forward: 0.5, right: 0, boost: false }, 60);
    expect(speeds(STILL, 1, 'stand', half.w).v[0]).toBe(0);
    // Easing off without letting go is the ramp's: from 0.5 to 0.1 the stick falls at the limit.
    const ease = speeds({ forward: 0.1, right: 0, boost: false }, 1, 'stand', speeds({ forward: 0.5, right: 0, boost: false }, 60).w).v;
    expect(ease[0]).toBeCloseTo(65 * (0.5 - (2 + 3 * (1 - 0.9 ** 8)) / 60), 6);
    expect(throttleStep(0.5, 0, 'forward', TICK)).toBeCloseTo(0.5 - 2 / 60, 9);
    expect(throttleStep(1, 0, 'forward', TICK)).toBe(0);
    expect(throttleStep(1, -1, 'right', TICK)).toBe(-1);       // the lateral snap: > 0.78, > 7.8 a second
  });
});

describe('the stances (W2.2b): C cycles stand, crouch, prone', () => {
  it('each stance runs at its motion.rdr bands', () => {
    const band = (clip: string): number => SEAL_LOCOMOTION.find((b) => b.clip === clip)!.maxVelocity;
    expect(STANCES).toEqual(['stand', 'crouch', 'prone']);
    expect(stanceBody('stand').bands).toEqual({ forward: band('seal_run'), back: band('seal_run_bw'), right: band('seal_rstrafe'), left: band('seal_lstrafe') });
    expect(stanceBody('crouch').bands).toEqual({ forward: 14.8, back: 13.5, right: 15, left: 15 });
    expect(stanceBody('prone').bands).toEqual({ forward: 11, back: 11, right: 5.5, left: 5.5 });
  });

  it('the crouch walk (FUN_00584c60): under 0.838 of a stick it is rescaled to 14 / 14.8, so it runs at 14.0 whatever the push', () => {
    const k = 14 / 14.8;
    expect(lastSecond(speeds({ forward: 0.5, right: 0, boost: false }, 600, 'crouch').v)).toBeCloseTo(14.0, 1);   // not 7.4
    expect(lastSecond(speeds({ forward: 0.2, right: 0, boost: false }, 600, 'crouch').v)).toBeCloseTo(14.0, 1);
    expect(lastSecond(speeds({ forward: -0.5, right: 0, boost: false }, 600, 'crouch').v)).toBeCloseTo(k * 13.5, 1);
    expect(lastSecond(speeds({ forward: 0, right: 0.5, boost: false }, 600, 'crouch').v)).toBeCloseTo(k * 15, 1);
    // One clip set by direction class (FUN_00582d10), no blend: a shallow diagonal walks straight ahead.
    const { w } = speeds({ forward: 0.5, right: 0.2, boost: false }, 600, 'crouch');
    expect(Math.abs(w.state.x)).toBeLessThan(1e-6);
    expect(w.posture).toBe('crouch');
  });

  it('the crouch at full stick (>= 0.838) with 19 units of headroom stands and runs the standing blend (FUN_0057efe0, FUN_00583030)', () => {
    const open = speeds(FORWARD, 600, 'crouch');
    expect(lastSecond(open.v)).toBeCloseTo(65, 1);
    expect(open.w.stance).toBe('crouch');
    expect(open.w.posture).toBe('stand');
    // Under a ceiling 17 over the floor the headroom ray is cut: the crouch walk at 14.0 instead.
    const roofed = new Walker(world([floor(-2000, -2000, 2000, 2000, 0), floor(-2000, -2000, 2000, 2000, 17)], 1000));
    roofed.place(0, 5, 0);
    expect(roofed.state.y).toBe(0);
    roofed.stance = 'crouch';
    const low = speeds(FORWARD, 600, 'crouch', roofed);
    expect(lastSecond(low.v)).toBeCloseTo(14.0, 1);
    expect(low.w.posture).toBe('crouch');
    // Back under 0.838 the run drops to the crouch walk again.
    expect(lastSecond(speeds({ forward: 0.8, right: 0, boost: false }, 120, 'crouch', open.w).v)).toBeCloseTo(14.0, 1);
    expect(open.w.posture).toBe('crouch');
  });

  it('prone (FUN_005845c0 -> FUN_00583500): no ramp, one axis by direction class, the band times that axis', () => {
    expect(speeds(FORWARD, 1, 'prone').v[0]).toBeCloseTo(11, 6);                                   // full on tick 1
    expect(speeds({ forward: -1, right: 0, boost: false }, 1, 'prone').v[0]).toBeCloseTo(11, 6);   // the crawl reversed
    expect(speeds({ forward: 0, right: -1, boost: false }, 1, 'prone').v[0]).toBeCloseTo(5.5, 6);
    const ahead = speeds({ forward: 0.8, right: 0.6, boost: false }, 1, 'prone');
    expect(ahead.v[0]).toBeCloseTo(0.8 * 11, 6);                                                     // max(|x|, |z|) x 11
    expect(Math.abs(ahead.w.state.x)).toBeLessThan(1e-9);                                            // straight ahead
    const aside = speeds({ forward: 0.6, right: 0.8, boost: false }, 1, 'prone');
    expect(aside.v[0]).toBeCloseTo(0.8 * 5.5, 6);                                                    // the strafe, 5.5
    expect(Math.abs(aside.w.state.z)).toBeLessThan(1e-9);
  });

  it('the root height: standing 11.484 and crouched 5.504 as the dump has them; prone at the camera ramp\'s floor', () => {
    expect(rootY('stand')).toBe(11.484);                       // five standing actors in the console dump
    expect(rootY('crouch')).toBe(5.504);                       // the crouched player there (research 17 section 1)
    expect(rootY('crouch')).toBeLessThan(9);                   // FUN_00584c60's own stance test: root under 9
    expect(rootY('prone')).toBeLessThanOrEqual(2.169155);      // FUN_0029a950's ramp is flat below this
  });

  // PF-21 (research 180 s1.2, research 217 s4; ruling PF.R45): seal_prone's skel_root at its first key is 2.1680
  // (`MOTION_P.ZAR`, as seal_fp_prone, seal_p_prone and seal_headlooks_prone), 555/256 exactly; FUN_0029a950's ramp
  // floor 2.169155 sits 0.001 over it, so the camera's prone target with no posed root is the root + the ramp's 5.5.
  it("the prone root is seal_prone's 2.16796875 (555/256) and the camera fallback's prone target 2.168 + ramp (research 180 s1.2)", () => {
    expect(PRONE_ROOT).toBe(555 / 256);
    expect(rootY('prone')).toBe(2.16796875);
    expect(ramp(rootY('prone'))).toBe(5.5);                     // under the ramp's floor: its least
    expect(lookHeight(rootY('prone'))).toBe(2.16796875 + 5.5);
    expect(lookHeight(rootY('prone'))).toBeCloseTo(7.668, 3);  // research 88 section 4 item 3's target
  });

  it('the head line lowers with the stance: a crouch passes under a lintel at 16 that stops a standing SEAL (the idle head + 2: 19.394 standing, 12.138 crouched, 5.637 prone; FUN_0054aa30 D:L415442-415443)', () => {
    const lintel = world([floor(-200, -200, 200, 200, 0), wallX(50, -150, 150, 16, 40)]);
    const x = (stance: Stance): number => {
      const w = new Walker(lintel);
      w.place(0, 0, 0);
      w.stance = stance;
      w.state.yaw = facing(0, 0, 1, 0);
      for (let i = 0; i < 600; i++) w.tick(stance === 'crouch' ? { forward: 0.5, right: 0, boost: false } : FORWARD);
      return w.state.x;
    };
    expect(x('stand')).toBeLessThan(50);
    expect(x('crouch')).toBeGreaterThan(60);
    expect(x('prone')).toBeGreaterThan(60);
    expect(wallProbeHeights('stand')).toEqual([6.5, 17.394 + 2]);   // PF-16: no column; the low probe and the head line
  });
});

describe('the fall and the step (W2.2b): dynamics.rdr\'s gravity, touch distance, step height and slope', () => {
  it('stepping off a 42-unit deck falls under 235 a second squared, lands hard after ~0.60 s, and runs on after the clip', () => {
    const deck = world([floor(-200, -200, 200, 200, 0), floor(-100, -100, 30, 100, 42), wallX(30, -100, 100, 0, 42)]);
    const w = new Walker(deck);
    expect(w.place(0, 60, 0)).toBe(true);
    expect(w.state.y).toBe(42);
    w.state.yaw = facing(0, 0, 1, 0);
    let off = -1, landed = -1, inAir = '';
    for (let i = 0; i < 240 && landed < 0; i++) {
      w.tick(FORWARD);
      if (off < 0 && w.airborne) off = i;
      if (w.airborne) inAir = w.action?.name ?? '';
      if (off >= 0 && !w.airborne) landed = i;
    }
    expect(off).toBeGreaterThan(0);
    expect(w.state.y).toBe(0);
    // sqrt(2 x 42 / 235) = 0.598 s; the fall is stepped at 60 Hz and starts on the tick after the edge, so +-2 ticks.
    expect(SEAL_TUNING.gravity).toBe(235);
    expect(Math.abs((landed - off) * TICK - Math.sqrt(2 * 42 / 235))).toBeLessThanOrEqual(2 * TICK);
    expect(w.state.x).toBeGreaterThan(30 + 0.5 * 65);          // the run's 65 carried through the air
    expect(inAir).toBe('fall');                                 // FUN_0057e050: the in-air clip on the way down
    // The contact at sqrt(2 x 235 x 42) = 140 is over land_hard_fall_rate 115 (FUN_005af590): the hard landing, which
    // holds the mover while the carried 65 runs down at 150 a second squared (FUN_0054d9a0) ...
    expect(w.landing?.clip).toBe('landHard');
    expect(w.landing!.speed).toBeGreaterThan(115);
    expect(w.action?.name).toBe('landHard');
    // ... until its NoInterrupt 0.35 of the phase (FUN_00587c20: 0.35 x 1 x 19/20 = 0.3325 s), the held stick then
    // cutting it and the run going on
    const x = w.state.x;
    const held = Math.ceil((0.35 * ACTION_CLIPS.landHard.playback * 0.95) / TICK) - 1;
    for (let i = 0; i < held; i++) w.tick(FORWARD);
    expect(w.action?.name).toBe('landHard');
    let glide = 0, v = 65;
    for (let i = 0; i < held; i++) { v = Math.max(0, v - CARRY_DECAY * TICK); glide += v * TICK; }
    expect(w.state.x - x).toBeCloseTo(glide, 6);
    for (let i = 0; i < 3; i++) w.tick(FORWARD);
    expect(w.action).toBeNull();
    const x2 = w.state.x;
    for (let i = 0; i < 30; i++) w.tick(FORWARD);
    expect(w.state.x - x2).toBeGreaterThan(25);
    expect(w.state.y).toBe(0);
  });

  it('a drop within ground_touch_distance 8 is a step down; a 13-unit crate top is a short fall to the floor', () => {
    const steps = world([floor(-200, -200, 200, 200, 0), floor(-20, -20, 20, 20, 7.5)]);
    const s = new Walker(steps);
    s.place(0, 20, 0);
    s.state.yaw = facing(0, 0, 1, 0);
    let flew = false;
    for (let i = 0; i < 90; i++) { s.tick(FORWARD); flew ||= s.airborne; }
    expect(flew).toBe(false);
    expect(s.state.y).toBe(0);
    const crate = world([floor(-200, -200, 200, 200, 0), floor(-20, -20, 20, 20, 13)]);
    const w = new Walker(crate);
    w.place(0, 20, 0);
    w.state.yaw = facing(0, 0, 1, 0);
    flew = false;
    for (let i = 0; i < 90; i++) { w.tick(FORWARD); flew ||= w.airborne; }
    expect(flew).toBe(true);
    expect(w.state.x).toBeGreaterThan(30);
    expect(w.state.y).toBe(0);
  });

  it('step_height 6.5: a kerb whose face is 6.5 climbs, a 7-unit face stops the mover at the low probe line', () => {
    // The face is what stops the body (research 86 s6.5; issue #111, research 217 s2.6): the wall probes at `step_height`
    // (`FUN_0054aa30` D:L415167, research 217 s2.1; the contact branch's lifted query, `FUN_005483d0` D:L413686-413736),
    // the port's low probe line at the feet + 6.5 (`wallProbeHeights`).
    const kerb = (h: number): Walker => {
      const w = new Walker(world([floor(-200, -200, 30, 200, 0), floor(30, -200, 200, 200, h), wallX(30, -200, 200, 0, h)]));
      w.place(0, 0, 0);
      w.state.yaw = facing(0, 0, 1, 0);
      for (let i = 0; i < 120; i++) w.tick(FORWARD);
      return w;
    };
    expect(SEAL_TUNING.stepHeight).toBe(6.5);
    // SEGMENT-BODY (re-judged): a face whose top edge lies ON the line at 6.5 is hit -- the segment's crossing is inside
    // the polygon, edges included (`segment.ts` `inside`; micro 336-361) -- so the kerb under step_height is 6.4 (was 6.5).
    const low = kerb(6.4);
    expect(low.state.x).toBeGreaterThan(40);
    expect(low.state.y).toBeCloseTo(6.4, 5);
    const high = kerb(7);
    expect(high.state.x).toBeLessThanOrEqual(30);
    expect(high.state.y).toBe(0);
  });

  it("no rise is compared with step_height (issue #111): a face-less floor 7 or 19.5 over the feet is stepped onto, one 21 over is refused (FUN_005b5d40's 20)", () => {
    // FUN_005b5d40 (D:L470232-470274): the highest floor at or under the origin + 1, else the lowest, refused only when
    // more than 20 over the feet -- on the ground as in the air (`airStep`, OWNER-5). With no face in the way the
    // original's segment query meets nothing (research 86 s6.5), so the pick alone decides: MP72's stair side edge, where
    // the port's former rise rule held a body in the crack beside it (research 217 s2.6).
    const ledge = (h: number): Walker => {
      const w = new Walker(world([floor(-200, -200, 30, 200, 0), floor(30, -200, 200, 200, h)]));
      w.place(0, 0, 0);
      w.state.yaw = facing(0, 0, 1, 0);
      for (let i = 0; i < 120; i++) w.tick(FORWARD);
      return w;
    };
    for (const h of [7, 19.5]) {
      const w = ledge(h);
      expect(w.state.x, `${h}`).toBeGreaterThan(40);
      expect(w.state.y, `${h}`).toBe(h);
      expect(w.airborne, `${h}`).toBe(false);
    }
    const over = ledge(21);
    expect(over.state.x).toBeLessThanOrEqual(30);
    expect(over.state.y).toBe(0);
  });

  // Ported from Chris's browser-beta-v5 (walk.test.ts): a kerb 6 to 6.5 over the feet with the lower floor still
  // under the line (research 101 A7). The step's probe origin is STEP_PROBE_LIFT_READING over the feet, so the
  // selection window (+ SELECT_ABOVE) reaches step_height.
  it.each([6, 6.25, 6.5])('steps onto a %s-unit kerb above an overlapping lower floor (research 101 A7)', (height) => {
    for (const base of [0, 40]) {
      const w = new Walker(world([floor(-200, -200, 200, 200, base), floor(30, -200, 200, 200, base + height)]));
      w.place(0, base, 0);
      w.state.yaw = facing(0, 0, 1, 0);
      for (let i = 0; i < 120; i++) w.tick(FORWARD);
      expect(w.state.x).toBeGreaterThan(40);
      expect(w.state.y).toBe(base + height);
      expect(w.airborne).toBe(false);
    }
  });

  it('an overlapping surface 7 over the feet, above step_height, is walked under for the floor below', () => {
    const w = new Walker(world([floor(-200, -200, 200, 200, 0), floor(30, -200, 200, 200, 7)]));
    w.place(0, 0, 0);
    w.state.yaw = facing(0, 0, 1, 0);
    for (let i = 0; i < 120; i++) w.tick(FORWARD);
    expect(w.state.x).toBeGreaterThan(40);
    expect(w.state.y).toBe(0);
  });

  it('max_slope 50: a 45-degree ramp is walked up, a 55-degree ramp refuses', () => {
    const ramp = (degrees: number): Walker => {
      const h = 100 * Math.tan(degrees * Math.PI / 180);
      const slope: WorldPoly = {
        modelName: 'worldmodel', path: 'worldmodel/ramp', region: 0, ditype: 1, material: 25, ptcount: 4, cameratype: 0,
        points: Float32Array.from([30, 0, -200, 130, h, -200, 130, h, 200, 30, 0, 200]),
      };
      const w = new Walker(world([floor(-200, -200, 30, 200, 0), slope]));
      w.place(0, 0, 0);
      w.state.yaw = facing(0, 0, 1, 0);
      for (let i = 0; i < 60; i++) w.tick(FORWARD);
      return w;
    };
    expect(SEAL_TUNING.maxSlopeDeg).toBe(50);
    const walked = ramp(45);
    expect(walked.state.x).toBeGreaterThan(50);                 // 1 s at 65 with the 0.2 s ramp: ~59 from 0
    expect(walked.state.y).toBeCloseTo(walked.state.x - 30, 3);
    const refused = ramp(55);
    expect(refused.state.x).toBeLessThanOrEqual(30);
    expect(refused.state.y).toBe(0);
  });

  // The M71 rubble toe: the three low-probe contacts measured at the hallway stand-off, and the triangle
  // those supporting lines enclose. A half-length plane through each contact does not close that triangle, so a
  // body outside one segment is not in the pocket the disc measures. Contacts are relative to the stand-off.
  const contactTriangle = (at: { x: number; z: number }, contacts: { x: number; z: number }[]): { ax: number; az: number; bx: number; bz: number }[] => {
    const lines = contacts.map((c) => {
      const dx = c.x - at.x, dz = c.z - at.z, len = Math.hypot(dx, dz) || 1;
      const nx = dx / len, nz = dz / len;
      return { nx, nz, d: nx * c.x + nz * c.z };
    });
    const meet = (i: number, j: number): { x: number; z: number } => {
      const a = lines[i]!, b = lines[j]!;
      const det = a.nx * b.nz - a.nz * b.nx;
      return { x: (a.d * b.nz - b.d * a.nz) / det, z: (a.nx * b.d - b.nx * a.d) / det };
    };
    return contacts.map((_, i) => {
      const a = meet(i, (i + 1) % contacts.length), b = meet(i, (i + 2) % contacts.length);
      return { ax: a.x, az: a.z, bx: b.x, bz: b.z };
    });
  };
  const verticalFace = (ax: number, az: number, bx: number, bz: number, y0: number, y1: number): WorldPoly => ({
    modelName: 'worldmodel', path: 'worldmodel/wall', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az]),
  });
  const REL_CONTACTS = [{ x: -0.16, z: -3.5 }, { x: 3.14, z: 1.55 }, { x: -2.86, z: 2.05 }];
  // SEGMENT-BODY: each face wound so its own normal (Newell's) points at (cx, cz), the side the body stands on, as a hull
  // face is (research 281 s4.3: hit only from its front); `verticalFace`'s winding is otherwise its ends' order.
  const facingIn = (e: { ax: number; az: number; bx: number; bz: number }, cx: number, cz: number) => {
    const nx = e.bz - e.az, nz = -(e.bx - e.ax);                   // (b - a) turned: verticalFace's -x for +z ends
    const toward = -nx * (cx - e.ax) - nz * (cz - e.az) > 0;
    return toward ? e : { ax: e.bx, az: e.bz, bx: e.ax, bz: e.az };
  };
  const pocket = (): { contacts: { x: number; z: number }[]; ground: ReturnType<typeof world> } => {
    const faces = contactTriangle({ x: 0, z: 0 }, REL_CONTACTS).map((e) => facingIn(e, 0, 0)).map((e) => verticalFace(e.ax, e.az, e.bx, e.bz, 0, 12));
    return { contacts: REL_CONTACTS, ground: world([floor(-80, -80, 80, 80, 0), ...faces]) };
  };
  const planeGap = (px: number, pz: number, c: { x: number; z: number }): number => {
    const len = Math.hypot(c.x, c.z) || 1;
    return len - (px * c.x + pz * c.z) / len;
  };

  // SEGMENT-BODY (re-judged; was "keeps the body a radius off", the disc's 3.5): pressed from a point inside every
  // face's reach, the body's segments cross the faces from their fronts and it never passes one.
  it('pressing each face of the pocket from the stand-off never carries the body through it', () => {
    const { contacts, ground } = pocket();
    expect(BODY_RADIUS).toBe(3.5);
    for (const c of contacts) {
      const w = new Walker(ground);
      expect(w.place(0, 2, 0)).toBe(true);
      w.state.yaw = facing(0, 0, c.x, c.z);
      let nearest = Infinity;
      for (let i = 0; i < 120; i++) {
        w.tick(FORWARD);
        nearest = Math.min(nearest, planeGap(w.state.x, w.state.z, c));
      }
      expect(nearest, `face (${c.x}, ${c.z})`).toBeGreaterThan(0);
      expect(w.wallHits().length, 'the climb contact is recorded').toBeGreaterThan(0);
      expect(w.state.y).toBe(0);
      expect(w.airborne).toBe(false);
    }
  });

  it('pressing each face of the pocket 30 degrees off its normal never carries the body through a face (#408 review, 5bb4e4892 point 1; SEGMENT-BODY re-judged)', () => {
    // The original has no slide along one face of a pocket (FUN_005483d0 D:L413533-413614); the review's probe walked
    // the centre to 0.000-0.178 from a face plane at 5 to 60 degrees off a face, where main held 3.489-3.500.
    const { contacts, ground } = pocket();
    for (const c of contacts) {
      for (const off of [-30, 30]) {
        const w = new Walker(ground);
        expect(w.place(0, 2, 0)).toBe(true);
        const a = Math.atan2(c.z, c.x) + (off * Math.PI) / 180;
        w.state.yaw = facing(0, 0, Math.cos(a), Math.sin(a));
        let nearest = Infinity;
        for (let i = 0; i < 120; i++) {
          w.tick(FORWARD);
          for (const f of contacts) nearest = Math.min(nearest, planeGap(w.state.x, w.state.z, f));
        }
        expect(nearest, `face (${c.x}, ${c.z}) at ${off} degrees`).toBeGreaterThan(0);
      }
    }
  });

  // SEGMENT-BODY: the M71 pin ("the ramp-foot pocket holds a body on its stand-off as main does") pinned the disc's
  // departure, its three contacts meeting at one point (LATER 283). Retired: the original's segments are built, and the
  // pocket is measured on the disc's own hull (`segmentBody.test.ts`, "LATER 283: M71's ramp-foot pocket").

  it('from one unit off the pocket, pressing toward the stand-off still moves', () => {
    // Disc check of Fuse's #408 head (PR #408's verification comment): from 1 unit off, pressing toward the ramp did not move. #408's earlier head reached the foot.
    const { ground } = pocket();
    const len = Math.hypot(4.46, 1.15);
    const x = -4.46 / len, z = -1.15 / len;
    const w = new Walker(ground);
    expect(w.place(x, 2, z)).toBe(true);
    w.state.yaw = facing(x, z, 0, 0);
    let nearest = Infinity;
    for (let i = 0; i < 60; i++) {
      w.tick(FORWARD);
      nearest = Math.min(nearest, Math.hypot(w.state.x, w.state.z));
    }
    // SEGMENT-BODY (re-judged; was "> 0.5 moved, to within 0.5 of the stand-off", the disc's): every face within the
    // segments' reach, each put out by the depth less 1 or held by the jam rule, the press still moves the body -- not
    // toward the point: the depth push carries it 0.26 back from the face it faces.
    expect(Math.hypot(w.state.x - x, w.state.z - z)).toBeGreaterThan(0.1);
    expect(nearest).toBeLessThan(2);
    expect(w.state.y).toBe(0);
  });

  it('a 54-degree face is not walked into from the floor in front of it', () => {
    const tan = Math.tan((54 * Math.PI) / 180);
    const slope: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/ramp', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([0, 0, -20, 40, 40 * tan, -20, 40, 40 * tan, 20, 0, 0, 20]),
    };
    const w = new Walker(world([floor(-80, -40, 80, 40, 0), slope]));
    expect(w.place(-8, 2, 0)).toBe(true);
    w.state.yaw = facing(w.state.x, w.state.z, 20, 0);
    for (let i = 0; i < 180; i++) w.tick(FORWARD);
    expect(w.state.y).toBe(0);
    // The face starts at x 0. Disc check of Fuse's #408 head (PR #408's verification comment) stopped 0.7 to 1.8 short of the chain's stop.
    expect(w.state.x).toBeCloseTo(-0.416666666666668, 4);
  });

  // FUN_005483d0's deep branch (D:L413602-413614), built with the original's segments by SEGMENT-BODY (LATER 283;
  // research 217 s2.9): on the port's disc contacts it had stuck MP72's emb01 step-down and frozen a body placed deep,
  // so these were held skipped (research 217 s2.3).
  it('LATER 283 (WALL_DEEP_REVERT_READING, built by SEGMENT-BODY): prone, a crawl turned toward a wall 4 off is put back and its frame displacement zeroed (bVar6, D:L413487-413502)', () => {
    // bVar6 is prone: one hit more than 1 deep puts the move back. The line ahead meets the wall at 4 of its 8
    // (PRONE_FAN_READING), 4 deep; the port's chain shoves the body back to 8 off instead.
    const ground = world([floor(-200, -200, 200, 200, 0), wallX(50, -150, 150, 0, 30)]);
    const w = new Walker(ground);
    w.place(46, 0, 0);
    w.stance = 'prone';
    w.state.yaw = facing(46, 0, 100, 0);
    for (let i = 0; i < 30; i++) {
      w.tick(FORWARD);
      expect(w.state.x, `tick ${i}`).toBe(46);
    }
    expect([w.state.vx, w.state.vz]).toEqual([0, 0]);
    expect(w.wallHits().length, 'the climb contact is the move\'s, taken or not').toBeGreaterThan(0);
  });

  it('LATER 283 (WALL_DEEP_REVERT_READING, built by SEGMENT-BODY): the probe hits are counted, not the walls -- a body 1.25 inside a corner both lines meet (four hits) is put back, one only the low probe meets (two) is pushed out (D:L413603, 2 < iVar25)', () => {
    // iVar25 counts the segments that hit (D:L413406-413425): the low probe at 6.5 and the head line at 19.394
    // (wallProbeHeights) each meet both faces of a corner 30 high, four hits; a corner 12 high meets the low probe
    // only, two. 2.25 from each face is 1.25 inside the radius. The body faces into the corner: the original casts a
    // still body's segments along its facing (FUN_0054aa30 D:L415135-415149). An AI body (its controller's vtable
    // +0x2c answers 0, D:L413571) keeps no depth and is never put back.
    const corner = (top: number): Grid => world([
      floor(-200, -200, 200, 200, 0), verticalFace(50, -150, 50, 50, 0, top), verticalFace(-150, 50, 50, 50, 0, top),
    ]);
    const tall = new Walker(corner(30));
    tall.place(47.75, 0, 47.75);
    tall.state.yaw = facing(47.75, 47.75, 50, 50);
    for (let i = 0; i < 10; i++) tall.tick(STILL);
    expect([tall.state.x, tall.state.z]).toEqual([47.75, 47.75]);
    const short = new Walker(corner(12));
    short.place(47.75, 0, 47.75);
    short.state.yaw = facing(47.75, 47.75, 50, 50);
    for (let i = 0; i < 10; i++) short.tick(STILL);
    // SEGMENT-BODY: put out by the deepest's depth less 1 along its normal each tick it has two hits or fewer
    // (D:L413612-413614) -- off the face the segments meet, not to the disc's radius (was `BODY_RADIUS` on both).
    expect(50 - short.state.x).toBeGreaterThan(2.25 + 1);
    expect(50 - short.state.z).toBeGreaterThanOrEqual(2.25);
  });
});

describe('the mover, continued (W1.4)', () => {
  const plain = world([floor(-200, -200, 200, 200, 0)]);

  it('a step toward a wall ends 3.5 from it, and slides along it', () => {
    const walled = world([floor(-200, -200, 200, 200, 0), wallX(50, -150, 150, 0, 30)]);
    const w = new Walker(walled);
    w.place(0, 0, 0);
    w.state.yaw = facing(0, 0, 1, 0);
    for (let i = 0; i < 180; i++) w.tick(FORWARD);
    // SEGMENT-BODY (re-judged; was `BODY_RADIUS` 3.5, the disc's stand-off): head on, the first segment to cross the
    // wall is the centre line, 1.1 x 1.4 x 3.5 = 5.39 (checkpoint 4: the head line runs along the facing by the muzzle
    // only prone, `HEAD_LINE_MUZZLE_READING`; ac's capture at M51 house2), plus the tick's move (65 a second);
    // the move's part along the normal is taken away there (`FUN_005483d0` D:L413557-413567) -- it stops between.
    const standOff = 50 - w.state.x;
    expect(standOff).toBeGreaterThan(1.1 * 1.4 * 3.5 - 0.01);
    expect(standOff).toBeLessThan(1.1 * 1.4 * 3.5 + 65 * TICK + 0.01);
    expect(BODY_RADIUS).toBe(3.5);                        // research 24 section 2 step 3
    expect(w.state.z).toBeCloseTo(0, 6);
    // Now at 45 degrees into it: the part into the wall is taken out and the rest slides along, no nearer.
    w.state.yaw = facing(0, 0, 1, 1);
    for (let i = 0; i < 60; i++) w.tick(FORWARD);
    expect(50 - w.state.x).toBeGreaterThan(5);
    expect(w.state.z).toBeGreaterThan(15);
  });

  it('prone crawls through a 13-wide doorway and along a 7.5-wide corridor: the fan is cast along the travel, 0.39 r = 3.12 across (PRONE_FAN_READING)', () => {
    // PF-05's third round: a radius-8 disc froze a prone SEAL in any gap under 16. PF-16: the original's prone class
    // (8.0, 6.0) casts its segments along the travel (FUN_0054aa30 D:L415585-415621, D:L415825-415861), the side lines
    // 0.3 x 1.3 r off the axis, so the 8.0 is the reach ahead, not a disc.
    expect(WALL_PROBE_READING.prone).toEqual({ h: 3, r: 8 });
    // A wall across x = 50 with a doorway z -6.5..6.5; prone 30 short of it, facing it, crawling through.
    const door = world([floor(-200, -200, 200, 200, 0), wallX(50, -150, -6.5, 0, 30), wallX(50, 6.5, 150, 0, 30)]);
    const w = new Walker(door);
    w.place(20, 0, 0);
    w.state.yaw = facing(20, 0, 100, 0);
    w.changeStance('prone');
    for (let i = 0; i < 90; i++) w.tick(STILL);
    expect(w.stance).toBe('prone');
    for (let i = 0; i < 600; i++) w.tick(FORWARD);
    expect(w.state.x).toBeGreaterThan(60);
    // A corridor 7.5 wide (x 42.5..50) running along z: prone at its mouth facing along it, it crawls down it.
    const corridor = world([floor(-200, -200, 200, 200, 0), wallX(42.5, -150, 0, 0, 30), wallX(50, -150, 0, 0, 30)]);
    const c = new Walker(corridor);
    c.place(46.25, 0, 20);
    c.state.yaw = facing(46.25, 20, 46.25, -100);
    c.changeStance('prone');
    for (let i = 0; i < 90; i++) c.tick(STILL);
    expect(c.stance).toBe('prone');
    for (let i = 0; i < 600; i++) c.tick(FORWARD);
    expect(c.state.z).toBeLessThan(-40);
    expect(c.state.x).toBeGreaterThan(42.5);
    expect(c.state.x).toBeLessThan(50);
  });

  it('prone is refused near an obstacle (FUN_00552ec0 -> FUN_0054d620): 11.2 ahead, 8.0 behind, at the feet + 3.25', () => {
    // D:L418935-418940: from stand or crouch, `FUN_0054d620(11.2, 8.0, step_height x 0.5)` casts two segments from the
    // feet + 3.25 (D:L416270-416274), one 11.2 along the facing and one 8.0 behind it (D:L416265-416269); a hit refuses
    // the change and the SEAL keeps its stance (the walls' column and radius never grow into the obstacle).
    expect(PRONE_GATE_READING).toEqual({ ahead: 11.2, behind: 8, lift: 0.5 });
    const at = (wall: WorldPoly, x: number, toward: number): Walker => {
      const w = new Walker(world([floor(-200, -200, 200, 200, 0), wall]));
      w.place(x, 0, 0);
      w.state.yaw = facing(x, 0, toward, 0);
      w.changeStance('prone');
      for (let i = 0; i < 90; i++) w.tick(STILL);
      return w;
    };
    expect(at(wallX(50, -150, 150, 0, 30), 50 - 11, 100).stance).toBe('stand');     // 11 ahead: refused
    expect(at(wallX(50, -150, 150, 0, 30), 50 - 11.5, 100).stance).toBe('prone');   // 11.5 ahead: lies down
    expect(at(wallX(50, -150, 150, 0, 30), 50 - 7.8, -100).stance).toBe('stand');   // 7.8 behind: refused
    expect(at(wallX(50, -150, 150, 0, 30), 50 - 8.3, -100).stance).toBe('prone');   // 8.3 behind: lies down
    expect(at(wallX(50, -150, 150, 2, 3), 50 - 6, 100).stance).toBe('prone');       // under the segments' height
  });

  it('the gate faces the body: in a 7.5-wide gap prone is refused facing across it, and taken facing along it, never crossing a wall', () => {
    // FUN_0054d620's segments run along the facing only (D:L416259-416269): across the gap one meets a wall within 11.2;
    // along it neither does, and the body lies down between the walls (the column and BODY_RADIUS: 3.75 each side).
    const gap = world([floor(-200, -200, 200, 200, 0), wallX(42.5, -150, 150, 0, 30), wallX(50, -150, 150, 0, 30)]);
    const across = new Walker(gap);
    across.place(46.25, 0, 0);
    across.state.yaw = facing(46.25, 0, 100, 0);
    across.changeStance('prone');
    for (let i = 0; i < 90; i++) across.tick(STILL);
    expect(across.stance).toBe('stand');
    expect(across.state.x).toBeCloseTo(46.25, 6);
    const along = new Walker(gap);
    along.place(46.25, 0, 0);
    along.state.yaw = facing(46.25, 0, 46.25, -100);
    along.changeStance('prone');
    for (let i = 0; i < 90; i++) along.tick(STILL);
    for (let i = 0; i < 240; i++) along.tick(FORWARD);
    expect(along.stance).toBe('prone');
    expect(along.state.z).toBeLessThan(-10);
    expect(along.state.x).toBeGreaterThan(42.5);
    expect(along.state.x).toBeLessThan(50);
  });

  it('a door leaf swung against a still body by a wall never pushes it through the wall', () => {
    // SEGMENT-BODY (re-judged; was "the crossing guard", the disc's refusal). A leaf (a moving owner, read fresh) shut 3
    // from a wall with a still body between them, both faces toward -x. The still body (facing -z) casts along its
    // facing; its +x side line crosses the wall from its front, more than 1 deep, and puts the body out by the depth
    // less 1 (`FUN_005483d0` D:L413612-413614) toward -x -- through the leaf's back, a face met from behind (research 281
    // s4.3) -- never through the wall.
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
    const polys = [floor(-200, -200, 200, 200, 0), wallX(50, -150, 150, 0, 30), wallX(47, -20, 20, 0, 30)];
    const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
    owners[2] = { ...owners[2]!, sweep: { minX: 27, maxX: 47, minZ: -20, maxZ: 20 } };
    for (const stance of ['stand', 'prone'] as const) {
      const w = new Walker(buildGrid(params, [], [], polys, owners));
      w.place(48.5, 0, 0);
      w.stance = stance;
      for (let i = 0; i < 60; i++) w.tick(STILL);
      expect(w.state.x, stance).toBeLessThan(50);
      expect(w.state.x, stance).toBeGreaterThan(40);
    }
  });

  it('a wall is bit 18 clear and met by the body\'s probes: standing the feet + 6.5 and the head line at 19.394, no column between (FUN_0054aa30; WALL_PROBE_READING)', () => {
    const through = (poly: WorldPoly): number => {
      const w = new Walker(world([floor(-200, -200, 200, 200, 0), poly]));
      w.place(0, 0, 0);
      w.state.yaw = facing(0, 0, 1, 0);
      for (let i = 0; i < 180; i++) w.tick(FORWARD);
      return w.state.x;
    };
    expect(through(wallX(50, -150, 150, 0, 30))).toBeLessThan(50);           // a wall: stopped
    expect(through(wallX(50, -150, 150, 0, 30, 1))).toBeGreaterThan(60);     // bit 18 set: a doorway volume, walked through
    expect(through(wallX(50, -150, 150, 0, 5))).toBeGreaterThan(60);         // under the low probe: a kerb's face
    expect(through(wallX(50, -150, 150, 21, 40))).toBeGreaterThan(60);       // over the head line: a lintel
    expect(through(wallX(50, -150, 150, 7, 17))).toBeGreaterThan(60);        // between the two (PF-16): no column
    expect(through(wallX(50, -150, 150, 18, 40))).toBeLessThan(50);          // the head line (19.394) meets it
  });

  it('a step over a 1-unit kerb climbs it', () => {
    const kerb = world([floor(-200, -200, 30, 200, 0), floor(30, -200, 200, 200, 1), wallX(30, -200, 200, 0, 1)]);
    const w = new Walker(kerb);
    w.place(0, 0, 0);
    w.state.yaw = facing(0, 0, 1, 0);
    for (let i = 0; i < 120; i++) w.tick(FORWARD);
    expect(w.state.x).toBeGreaterThan(40);
    expect(w.state.y).toBe(1);
  });

  it('from below, the deck\'s face is a wall at the body\'s height', () => {
    // SEGMENT-BODY (re-judged): the deck's face wound toward the walker (+x), as a hull face is; the body stops where its
    // segments first cross it -- the centre line, 5.39 (the head line takes the muzzle only prone,
    // `HEAD_LINE_MUZZLE_READING`), plus the tick's move -- not the disc's 3.5.
    const deck = world([floor(-200, -200, 200, 200, 0), floor(-100, -100, 30, 100, 42), wallXEast(30, -100, 100, 0, 42)]);
    const below = new Walker(deck);
    below.place(80, 10, 0);
    below.state.yaw = facing(80, 0, 0, 0);
    for (let i = 0; i < 180; i++) below.tick(FORWARD);
    expect(below.state.x - 30).toBeGreaterThan(1.1 * 1.4 * 3.5 - 0.01);
    expect(below.state.x - 30).toBeLessThan(1.1 * 1.4 * 3.5 + 65 * TICK + 0.01);
    expect(below.state.y).toBe(0);
  });

  it('refuses a step onto no floor at all, and the eye follows the feet between ticks', () => {
    const w = new Walker(plain);
    w.place(190, 0, 0);
    w.state.yaw = facing(0, 0, 1, 0);
    for (let i = 0; i < 120; i++) w.tick(FORWARD);
    expect(w.state.x).toBeLessThanOrEqual(200);
    expect(w.state.x).toBeGreaterThan(199);
    // Interpolation: half a tick into the next one, the eye is between the last two positions.
    const v = new Walker(plain);
    v.place(0, 0, 0);
    v.state.yaw = facing(0, 0, 1, 0);
    for (let i = 0; i < 60; i++) v.tick(FORWARD);
    const x0 = v.state.x;
    v.advance(TICK * 1.5, FORWARD);
    const x1 = v.state.x;
    expect(v.eye()[0]).toBeGreaterThan(x0);
    expect(v.eye()[0]).toBeLessThan(x1);
  });
});

describe('the ground\'s trip from the worker', () => {
  it('packs the polygons into two transferable arrays and gets every field and point back, named by their node', () => {
    const polys = [floor(0, 0, 10, 10, 3), { ...wallX(5, 0, 10, 0, 30, 1), region: 34, material: 9 }];
    const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/a', first: 0, count: 1, flags: 4097 },
      { modelName: 'door1', path: 'worldmodel/b=door1', first: 1, count: 1 }];
    const packed = packGround({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 1, cellsZ: 1, originX: 0, originZ: 0 }, polys, owners);
    expect(packed.points.length).toBe(24);
    const back = groundPolygons(structuredClone(packed));
    expect(back.map((p) => [p.modelName, p.path, p.ptcount, p.ditype, p.material, p.cameratype, p.region])).toEqual([
      ['worldmodel', 'worldmodel/a', 4, 3, 25, 0, 0], ['door1', 'worldmodel/b=door1', 4, 2, 9, 1, 34]]);
    expect([...back[1]!.points]).toEqual([...polys[1]!.points]);
    expect(back[0]!.points.buffer).toBe(back[1]!.points.buffer);     // views on one buffer, not copies
  });
});

/**
 * Research 24 section 6.1: A's spawn to B's floor, 20 legs. Each waypoint with the floor its leg ends on.
 */
const ROUTE: [number, number, number][] = [
  [806, 100, 665], [806, 100, 712], [760, 100, 720], [745, 100, 720], [695, 100, 730], [690, 100, 780],
  [685, 100, 830], [718, 100, 872], [720, 100, 915], [720, 100, 960], [720, 100, 1005], [735, 100, 1055],
  [720, 100, 1100], [715, 100, 1155], [712, 100, 1190], [705, 100, 1223], [680, 102, 1223.5], [640, 122, 1223.5],
  [600, 142, 1223.5], [565, 142, 1235],
];

/** Steers the mover at a point, a tick at a time, until it is within `near` of it or `seconds` run out. */
function steer(w: Walker, tx: number, tz: number, near = 2, seconds = 10): boolean {
  for (let i = 0; i < seconds / TICK; i++) {
    const d = Math.hypot(tx - w.state.x, tz - w.state.z);
    if (d <= near) return true;
    w.state.yaw = facing(w.state.x, w.state.z, tx, tz);
    w.tick({ forward: Math.min(1, d / 10), right: 0, boost: false });
  }
  return false;
}

describe.skipIf(!MP2)(`walking Frostfire${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('walks research 24\'s route from A\'s spawn to B\'s floor, on each leg\'s floor within 1.5, and the door leaf stops it', async () => {
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB');
    expect(map.ground).toBeDefined();
    expect(groundPolygons(map.ground!).length).toBe(3318);           // research 24 section 1.1
    const w = new Walker(groundGrid(map.ground!));
    expect(w.place(796, 100 + EYE_HEIGHT, 614)).toBe(true);
    expect(w.state.y).toBe(100);
    for (const [i, [x, y, z]] of ROUTE.entries()) {
      expect(steer(w, x, z), `leg ${i + 1} to (${x}, ${z}) from (${w.state.x.toFixed(1)}, ${w.state.z.toFixed(1)})`).toBe(true);
      expect(Math.abs(w.state.y - y), `leg ${i + 1}: feet at ${w.state.y.toFixed(2)}, floor ${y}`).toBeLessThanOrEqual(1.5);
    }
    // Research 24 section 0.3 / 6.3: the door leaf between B's region and the building, x 576-589, z 1117-1118.
    // Squarely in front of it on B's side, then straight at it: the leaf stops the mover short -- SEGMENT-BODY (re-judged;
    // was a body's radius): where the centre line (5.39) first crosses it, plus at most a tick's move.
    expect(steer(w, 582.5, 1140)).toBe(true);
    w.state.yaw = facing(582.5, 1140, 582.5, 1000);
    for (let i = 0; i < 180; i++) w.tick({ forward: 1, right: 0, boost: false });
    expect(w.state.z).toBeGreaterThan(1118 + 4.5);
    expect(w.state.z).toBeLessThan(1118 + 7.5);
    expect(w.state.y).toBeCloseTo(142, 3);
  });

  it('the 142 deck east of A\'s spawn: its pipeworks rail stops the walk on the deck; a fall of 42 off an open edge takes ~0.60 s (W2.2b)', async () => {
    // B's ramp at z 1223 is walled on both sides; the deck at x 630-675, z 725-815, y 142, drops at x ~675 to the 100
    // floor. SEGMENT-BODY (re-judged; was "walking off it falls 42"): `worldmodel/pipeworks` stands a face toward -x at
    // x 678.3 along that side, met at the feet + 6.5 (148.5); the disc stood 3.5 off it, past the deck's edge, and fell.
    // The segments meet it first -- the centre 5.39 ahead plus the move, or the contact branch's look-ahead
    // (`FUN_005483d0` D:L413686-413756) -- and the body stays on the deck at every z along that side.
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB');
    const w = new Walker(groundGrid(map.ground!));
    expect(w.place(660, 142 + EYE_HEIGHT, 725)).toBe(true);
    expect(w.state.y).toBe(142);
    w.state.yaw = facing(660, 725, 700, 725);
    for (let i = 0; i < 120; i++) w.tick(FORWARD);
    expect(w.airborne).toBe(false);
    expect(w.state.y).toBe(142);
    expect(w.state.x).toBeGreaterThan(665);
    expect(w.state.x).toBeLessThan(678.3 - 5);
    // The fall's time, off an open edge 42 high (no face): sqrt(2 x 42 / 235) = 0.60 s, within two ticks.
    const ledge = new Walker(world([floor(-200, -200, 0, 200, 142), floor(0, -200, 200, 200, 100)]));
    expect(ledge.place(-20, 150, 0)).toBe(true);
    ledge.state.yaw = facing(-20, 0, 100, 0);
    let off = -1, landed = -1;
    for (let i = 0; i < 120 && landed < 0; i++) {
      ledge.tick(FORWARD);
      if (off < 0 && ledge.airborne) off = i;
      if (off >= 0 && !ledge.airborne) landed = i;
    }
    expect(off).toBeGreaterThan(0);
    expect(ledge.state.y).toBe(100);
    expect(Math.abs((landed - off) * TICK - Math.sqrt(2 * 42 / 235))).toBeLessThanOrEqual(2 * TICK);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The mode: G, the panel's switch, the stick, and the hook's setCamera (W1.4 step 5).

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
};
const key = (code: string, type: 'keydown' | 'keyup' = 'keydown', init: KeyboardEventInit = {}): void => {
  globalThis.dispatchEvent(new KeyboardEvent(type, { code, ...init }));
};

/** A floor over x, z -200..200 at y 0 and a deck over x, z -100..30 at y 42, as the probe receives them. */
const GROUND: GroundData = packGround(
  { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
  [floor(-200, -200, 200, 200, 0), floor(-100, -100, 30, 30, 42)],
  [{ modelName: 'worldmodel', path: 'worldmodel/ground', first: 0, count: 1 }, { modelName: 'worldmodel', path: 'worldmodel/deck', first: 1, count: 1 }],
);

describe('walk mode (W1.4 step 5)', () => {
  const made: WalkMode[] = [];
  const setUp = (ground: GroundData | null = GROUND, spawn: [number, number, number] | null = [150, 0, 150]) => {
    const fly = new FlyCamera(canvas());
    fly.setScale(0.1);
    const changes: boolean[] = [];
    const mode = new WalkMode(fly, (walking) => changes.push(walking));
    mode.setGround(ground ?? undefined, spawn);
    mode.bindKey();
    made.push(mode);
    return { fly, mode, changes };
  };
  afterEach(() => { for (const m of made.splice(0)) { m.unbindKey(); } key('KeyW', 'keyup'); });

  it('a lean in the open eases the peek, and peekPin holds the camera when the body lean is off', () => {
    const { fly, mode } = setUp();
    fly.setPose({ x: 0, y: 20, z: 0, yaw: 0, pitch: 0 });
    mode.useTraversal((w, g) => new Traversal(w.grid, groundPolygons(g)));
    expect(mode.setMode('walk')).toBe(true);
    mode.lean(1);
    for (let i = 0; i < 40; i++) mode.frame(TICK);
    expect(mode.traversal()?.peek() ?? 0).toBeGreaterThan(0.5);
    mode.lean(0);
    for (let i = 0; i < 40; i++) mode.frame(TICK);
    expect(Math.abs(mode.traversal()?.peek() ?? 1)).toBeLessThan(0.05);
    const straight = mode.cameraState()!.eye[0];
    mode.peekPin = 1;
    for (let i = 0; i < 8; i++) mode.frame(TICK);
    const pinned = mode.cameraState()!.eye[0];
    expect(Math.abs(pinned - straight)).toBeGreaterThan(2);
    mode.peekPin = null;
    for (let i = 0; i < 8; i++) mode.frame(TICK);
    expect(Math.abs(mode.cameraState()!.eye[0] - straight)).toBeLessThan(0.5);
  });

  it('G toggles walk and fly, and the switch hears it; nothing is on Ctrl', () => {
    const { fly, mode, changes } = setUp();
    fly.setPose({ x: 150, y: 80, z: 150, yaw: 0, pitch: 0 });
    expect(mode.mode()).toBe('fly');
    key('KeyG');
    expect(mode.mode()).toBe('walk');
    key('KeyG');
    expect(mode.mode()).toBe('fly');
    key('KeyG', 'keydown', { ctrlKey: true });
    key('KeyG', 'keydown', { metaKey: true });
    expect(mode.mode()).toBe('fly');
    key('KeyG', 'keydown', { repeat: true });                       // a held G does not flicker the mode
    expect(mode.mode()).toBe('fly');
    expect(changes).toEqual([true, false]);
    // The panel's switch drives the same thing.
    expect(mode.setMode('walk')).toBe(true);
    expect(mode.mode()).toBe('walk');
    expect(changes).toEqual([true, false, true]);
  });

  it('the view from the head never passes a wall: prone and crouched against one, the eye stays on the body\'s side (PF-05)', () => {
    // FUN_0029ae50 puts the eye 4.9 ahead prone and 2.5 crouched. Crouched the body stops BODY_RADIUS (3.5) off a wall.
    // Prone, crawled straight in, PF-16's fan stops it 8.0 off, the eye inside; so the prone body crawls in 60 degrees
    // aslant -- the fan slides it along the wall 8 x cos 60 = 4.0 off -- and then turns to face the wall: the eye would
    // stand 0.9 past its face. The page casts from the body's axis at the eye's height to the eye and keeps the eye short
    // of the first wall (HEAD_EYE_WALL_BACK_PLACEHOLDER); the room's head (`headPoint`) stays exact.
    const walled = packGround(
      { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
      [floor(-200, -200, 200, 200, 0), wallX(50, -150, 150, 0, 30)],
      [{ modelName: 'worldmodel', path: 'worldmodel/ground', first: 0, count: 1 }, { modelName: 'worldmodel', path: 'worldmodel/wall', first: 1, count: 1 }],
    );
    const toWall = facing(20, 0, 100, 0);
    for (const stance of ['prone', 'crouch'] as const) {
      const { fly, mode } = setUp(walled, [20, 0, 0]);
      fly.setPose({ x: 20, y: 30, z: 0, yaw: stance === 'prone' ? toWall + 60 : toWall, pitch: 0 });
      mode.setMode('walk');
      mode.setStance(stance);
      for (let t = 0; t < 2; t += TICK) mode.frame(TICK);
      expect(mode.stance()).toBe(stance);
      mode.walkFor(8, { forward: 1, right: 0, boost: false });
      fly.setPose({ yaw: toWall });                                 // now facing the wall
      mode.walkFor(0.5, { forward: 0, right: 0, boost: false });
      const feet = mode.feet()!;
      // SEGMENT-BODY (re-judged; was the disc's stand-off, 3.5 crouched and 8 cos 60 prone): short of the wall, where
      // the segments left it.
      expect(feet[0]).toBeLessThan(50);
      mode.setScoped(true);
      mode.frame(TICK);
      expect(fly.camera.position.x).toBeLessThan(50);
      expect(fly.camera.position.x).toBeGreaterThan(feet[0]);
      expect(mode.fireAim()!.eye[0]).toBeLessThan(50);
      mode.setScoped(false);
    }
  });

  it('a tap of C toggles stand and crouch, a hold goes prone (owner, 2026-09-29); not on Ctrl; setStance for the hook', () => {
    const { fly, mode } = setUp();
    mode.setStanceMode('separate');                                // OT.R67: KEY_STANCE is the fallback's (the default's: pronePopWalk.test.ts)
    fly.setPose({ x: 150, y: 40, z: 150, yaw: 0, pitch: 0 });
    const tap = (init: KeyboardEventInit = {}): void => { key('KeyC', 'keydown', init); key('KeyC', 'keyup', init); mode.frame(TICK); mode.frame(TICK); };
    expect(mode.stance()).toBe('stand');
    tap();
    expect(mode.stance()).toBe('stand');                            // in fly mode C does nothing
    mode.setMode('walk');
    tap();
    expect(mode.stance()).toBe('crouch');
    tap({ ctrlKey: true });
    expect(mode.stance()).toBe('crouch');
    tap();
    expect(mode.stance()).toBe('stand');
    // PAR-19: the Stand -> Crouch clip (0x11) still on top refuses prone until it ends (FUN_00552ec0 D:L418932)
    for (let t = 0; t < 1; t += TICK) mode.frame(TICK);
    key('KeyC');                                                    // held: prone at 0.4 s, the repeats ignored
    for (let t = 0; t < 0.5; t += TICK) { key('KeyC', 'keydown', { repeat: true }); mode.frame(TICK); }
    expect(mode.stance()).toBe('prone');
    key('KeyC', 'keyup');
    mode.frame(TICK);
    expect(mode.stance()).toBe('prone');
    // PAR-19: the Stand -> Prone clip (0x19) on top refuses crouch until it ends (FUN_00552ec0 D:L418953)
    for (let t = 0; t < 1.5; t += TICK) mode.frame(TICK);
    tap();
    expect(mode.stance()).toBe('crouch');                           // from prone a tap crouches
    expect(mode.setStance('stand')).toBe(true);
    for (let t = 0; t < 2; t += TICK) mode.frame(TICK);             // the transitions' clips run out
    expect(mode.setStance('crouch')).toBe(true);
    const at = mode.feet()!;
    mode.walkFor(10, { forward: 0.5, right: 0, boost: false });
    const after = mode.feet()!;
    // SEP-POP (OT.R93): in SEPARATE the stick cuts Stand -> Crouch (`NoInterrupt` absent, 0) a game frame after its push
    // (FUN_00587c20), so the crouch walk, 14.0 a second, runs the whole 10 s but that frame; COMBINED holds the clip its
    // 0.60 s (stanceCutSeparate.test.ts pins COMBINED's trace)
    const walked = 14 * 10;
    expect(at[2] - after[2]).toBeGreaterThan(walked - 3);
    expect(at[2] - after[2]).toBeLessThan(walked + 0.5);
  });

  it('the touch C button is C: a tap toggles stand and crouch (prone: crouch), a hold goes prone, a cancel is nothing', () => {
    const { fly, mode } = setUp();
    mode.setStanceMode('separate');                                // OT.R67: KEY_STANCE is the fallback's (the default's: pronePopWalk.test.ts)
    fly.setPose({ x: 150, y: 40, z: 150, yaw: 0, pitch: 0 });
    const tap = (): void => { mode.stanceTouch('down'); mode.stanceTouch('up'); mode.frame(TICK); mode.frame(TICK); };
    tap();
    expect(mode.stance()).toBe('stand');                            // in fly mode the button does nothing
    mode.setMode('walk');
    tap();
    expect(mode.stance()).toBe('crouch');
    tap();
    expect(mode.stance()).toBe('stand');
    // PAR-19: the Stand -> Crouch clip (0x11) still on top refuses prone until it ends (FUN_00552ec0 D:L418932)
    for (let t = 0; t < 1; t += TICK) mode.frame(TICK);
    mode.stanceTouch('down');                                       // held: prone at 0.4 s
    for (let t = 0; t < 0.5; t += TICK) mode.frame(TICK);
    expect(mode.stance()).toBe('prone');
    mode.stanceTouch('up');
    mode.frame(TICK);
    expect(mode.stance()).toBe('prone');                            // the hold's release does nothing
    for (let t = 0; t < 3; t += TICK) mode.frame(TICK);             // the dive's clip runs out
    tap();
    expect(mode.stance()).toBe('crouch');                           // from prone a tap crouches, not the pad's stand
    for (let t = 0; t < 3; t += TICK) mode.frame(TICK);
    mode.stanceTouch('down');                                       // cancelled (a system gesture took the finger): no tap
    mode.frame(TICK);
    mode.stanceTouch('cancel');
    mode.frame(TICK);
    mode.frame(TICK);
    expect(mode.stance()).toBe('crouch');
  });

  it('with the R2 menu open (holdForMenu) C, Space and the touch C do nothing, and a C under way is forgotten (ctrl+0x221)', () => {
    // FUN_0021c6f0 L72835 sets ctrl+0x221 = 1: the player update runs no Jump (L453208) and no stance block (L453331)
    // until the close; the development keyboard's C / Space and the touch C are the same buttons.
    const { fly, mode } = setUp();
    fly.setPose({ x: 150, y: 40, z: 150, yaw: 0, pitch: 0 });
    mode.setMode('walk');
    for (let t = 0; t < 1; t += TICK) mode.frame(TICK);
    const jumps = (): number => mode.snapshot()!.jumps;
    const j0 = jumps();
    key('KeyC');                                                    // C down, short of the hold, as R2 opens the menu
    mode.frame(TICK);
    mode.holdForMenu(true);
    key('KeyC', 'keyup');                                           // its release is no tap
    mode.frame(TICK); mode.frame(TICK);
    expect(mode.stance()).toBe('stand');
    key('KeyC'); key('KeyC', 'keyup'); mode.frame(TICK); mode.frame(TICK);
    expect(mode.stance()).toBe('stand');                            // a C tap while open: nothing
    key('KeyC');
    for (let t = 0; t < 0.6; t += TICK) mode.frame(TICK);
    key('KeyC', 'keyup');
    expect(mode.stance()).toBe('stand');                            // nor a hold
    mode.stanceTouch('down'); mode.stanceTouch('up'); mode.frame(TICK); mode.frame(TICK);
    expect(mode.stance()).toBe('stand');                            // nor the touch C
    key('Space'); key('Space', 'keyup'); mode.frame(TICK);
    expect(jumps()).toBe(j0);                                       // nor Space's jump
    mode.holdForMenu(false);
    key('KeyC'); key('KeyC', 'keyup'); mode.frame(TICK); mode.frame(TICK);
    expect(mode.stance()).toBe('crouch');                           // closed: C is the stance again
  });

  it('Ctrl+C is left to the browser in fly and walk mode; a bare C while walking is the stance\'s', () => {
    const { fly, mode } = setUp();
    fly.setPose({ x: 150, y: 40, z: 150, yaw: 0, pitch: 0 });
    const press = (init: KeyboardEventInit): boolean => {
      const e = new KeyboardEvent('keydown', { code: 'KeyC', cancelable: true, ...init });
      globalThis.dispatchEvent(e);
      globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC' }));
      mode.frame(TICK);                                             // the tap acts at the release, on the next frame
      mode.frame(TICK);
      return e.defaultPrevented;
    };
    expect(press({ ctrlKey: true })).toBe(false);
    expect(press({ metaKey: true })).toBe(false);
    expect(press({})).toBe(false);                                   // fly mode: C is nobody's
    mode.setMode('walk');
    expect(press({ ctrlKey: true })).toBe(false);
    expect(mode.stance()).toBe('stand');
    expect(press({})).toBe(true);
    expect(mode.stance()).toBe('crouch');
  });

  it('entering walk drops the mover onto the floor under the camera, the game\'s camera behind it (W2.1)', () => {
    const { fly, mode } = setUp();
    fly.setPose({ x: 0, y: 90, z: 0, yaw: 30, pitch: -10 });
    mode.setMode('walk');
    expect(mode.feet()).toEqual([0, 42, 0]);                        // the deck, the highest floor under the camera
    // Standing at the spawn pitch: 25.709 over the feet, 24.906 behind along the yaw (`playerCamera.ts`).
    const pose = fly.pose(), yaw = (30 * Math.PI) / 180;
    expect(pose.x).toBeCloseTo(24.906 * Math.sin(yaw), 3);
    expect(pose.y).toBeCloseTo(42 + 25.709, 3);
    expect(pose.z).toBeCloseTo(24.906 * Math.cos(yaw), 3);
    expect(pose.yaw).toBeCloseTo(30, 9);                            // the turn is kept; the pitch is the spawn's
    mode.setMode('fly');
    fly.setPose({ x: 0, y: 30, z: 0 });                             // under the deck, over the floor
    mode.setMode('walk');
    expect(mode.feet()).toEqual([0, 0, 0]);
  });

  it('entering walk off every floor stands on spawn A; with no ground at all it stays in fly', () => {
    const { fly, mode } = setUp();
    fly.setPose({ x: 900, y: 90, z: 900 });
    expect(mode.setMode('walk')).toBe(true);
    expect(mode.feet()).toEqual([150, 0, 150]);
    const bare = setUp(null, [150, 0, 150]);
    expect(bare.mode.setMode('walk')).toBe(false);
    expect(bare.mode.mode()).toBe('fly');
    expect(bare.changes).toEqual([]);
  });

  it('the keys and the stick drive the mover, at 60 Hz, and the camera follows behind it', () => {
    const { fly, mode } = setUp();
    fly.setPose({ x: 150, y: 40, z: 150, yaw: 0, pitch: 0 });      // yaw 0 faces -z
    mode.setMode('walk');
    key('KeyW');
    for (let i = 0; i < 30; i++) { fly.update(1 / 30); mode.frame(1 / 30); }
    key('KeyW', 'keyup');
    const pose = fly.pose(), feet = mode.feet()!;
    expect(feet[2]).toBeLessThan(130);
    expect(pose.x).toBeCloseTo(150, 6);
    expect(feet[1]).toBe(0);
    expect(pose.y).toBeCloseTo(25.709, 3);                          // the game's camera standing (W2.1)
    expect(pose.z - mode.drawnFeet()![2]).toBeCloseTo(24.906, 3);  // both drawn between the last two ticks
    // The touch stick is the same wish: pushed up the screen, forward.
    const before = mode.feet()![2];
    fly.setStick(0, 1);
    for (let i = 0; i < 30; i++) { fly.update(1 / 30); mode.frame(1 / 30); }
    fly.setStick(0, 0);
    expect(mode.feet()![2]).toBeLessThan(before - 10);
    // And in fly mode the frame leaves the camera to fly.
    mode.setMode('fly');
    const at = fly.pose();
    mode.frame(1 / 30);
    expect(fly.pose()).toEqual(at);
  });

  // PAR-60 (research 230 section 5.2.1; PTW.R3 with the room's `flinchCut`, roomReloadLock.test): the original pops the
  // flinch on the victim's own console when a move axis or the turn is past 0.1 (`FUN_00550ef0` D:L418180-418185), from
  // the second driver tick that sees it (`FLINCH_CUT_DELAY_READING`: `FLINCH_CUT_COMMANDS` past the push). The page's own
  // flinch ends on the same command, from its own stick: `flinching()` -- the reload's gate -- is false from there.
  describe('the page\'s own flinch, cut by its own stick (PAR-60)', () => {
    const pose = { clip: 'seal_flinch_rarm', frame: 0, loop: false, rootY: null };
    const walking = () => {
      const { fly, mode } = setUp();
      fly.setPose({ x: 150, y: 40, z: 150, yaw: 0, pitch: 0 });
      mode.setMode('walk');
      const seen: { seq: number; flinching: boolean }[] = [];
      mode.setNetTap(() => { seen.push({ seq: seen.length + 1, flinching: mode.flinching() }); });
      return { fly, mode, seen, seq: (): number => seen.length };
    };

    it('the stick held: the flinch ends on the command FLINCH_CUT_COMMANDS past the room\'s push, flinching() false from there', () => {
      const { mode, seen, seq } = walking();
      expect(FLINCH_CUT_COMMANDS).toBe(Math.ceil(GAME_FRAME_DT * 60 - 1e-9));   // 3: one game frame (PAR-61's re-read)
      key('KeyW');
      for (let i = 0; i < 20; i++) mode.frame(TICK);
      const w = mode['walker']!;
      expect(reloadCutOf(w.cutStick, w.turn, w.airborne)).toBe(true);
      const start = seq() + 1, until = start + 42;
      expect(mode.setFlinchPose(() => pose, { start, until })).toBeNull();      // none of the window run yet
      expect(mode.flinching()).toBe(true);
      while (seq() < start + FLINCH_CUT_COMMANDS + 3) mode.frame(TICK);
      const inside = seen.filter((s) => s.seq >= start);
      expect(inside.filter((s) => s.flinching).map((s) => s.seq)).toEqual([0, 1, 2].map((k) => start + k));
      expect(mode.flinching()).toBe(false);
      expect(mode.snapshot()!.traversal?.clip).not.toBe('seal_flinch_rarm');  // the clip off the body too
    });

    it('the window already cut on the page\'s commands when the event arrives: setFlinchPose answers the cut\'s command and the flinch is over', () => {
      const { mode, seq } = walking();
      key('KeyW');
      for (let i = 0; i < 30; i++) mode.frame(TICK);
      const start = seq() - 12, until = start + 42;                            // the room's push, a round trip back
      expect(mode.setFlinchPose(() => pose, { start, until })).toBe(start + FLINCH_CUT_COMMANDS);
      expect(mode.flinching()).toBe(false);
    });

    // PAR-60 review F2: off the floor `FUN_005af930` zeroes all three axes, the turn `+0x23c` with the stick
    // (D:L466805-466815), so nothing cuts in the air -- PAR-28's "held in the air" too.
    it('in the air a turn past 0.1 cuts nothing (FUN_005af930 D:L466811-466815 zeroes the turn with the stick); on the floor the same turn cuts on the command FLINCH_CUT_COMMANDS past the push', () => {
      const run = (air: boolean) => {
        const { fly, mode, seq } = walking();
        for (let i = 0; i < 10; i++) mode.frame(TICK);
        const w = mode['walker']!;
        if (air) { w.state.y = 200; w.setAirborne(true); }
        const start = seq() + 1;
        expect(mode.setFlinchPose(() => pose, { start, until: start + 42 })).toBeNull();
        fly.setLook(1, 0);                                                     // the right stick full over: a turn
        const turns: number[] = [];
        while (seq() < start + FLINCH_CUT_COMMANDS + 3) { fly.update(TICK); mode.frame(TICK); turns.push(Math.abs(w.turn)); }
        fly.setLook(0, 0);
        expect(Math.max(...turns.slice(-4))).toBeGreaterThan(0.1 * SEAL_TUNING.turnMaxRate);   // the turn is there
        expect(w.airborne).toBe(air);
        return mode.flinching();
      };
      expect(run(true)).toBe(true);                                            // in the air: not cut
      expect(run(false)).toBe(false);                                          // on the floor: cut
    });

    // PAR-62 (research 230 section 5.2.2; PTW.R3 with roomReloadLock.test): a landing that plays no clip pops the top once
    // (`FUN_00589aa0` D:L466894-466902) before the driver's cut, so the top's action at D:L418176 is not the one read before
    // the tick's work (D:L418116) and the landing's tick asks no cut -- not the take-off's stick the mover hands back for
    // the pose (`land`), not the tick's own, not the turn; the next tick reads its own axes.
    // *Moved by PAR-71* (research 230 section 5.2.4, "PAR-71"): the lift before the flinch's first command puts that
    // command in the air, so the fall covers the flinch at its phase 0 and the clipless landing hands it back whole; its
    // stick's cut counts from the landing -- a game frame on, `FLINCH_CUT_COMMANDS` past it (was: the next tick). No cut
    // on the landing's own tick holds as PAR-62 read it.
    it('PAR-62, moved by PAR-71: a landing that plays no clip asks no cut on its own tick -- taken off running and landed at a stick under 0.1 the flinch holds; landed turning at a full stick it is cut FLINCH_CUT_COMMANDS past the landing', () => {
      /** The touch stick's push that gives the walk a forward past FORWARD_DEAD 0.03 and at or under 0.1 (`groundWish`). */
      const slow = (fly: FlyCamera): number => {
        for (let y = 0; y < 1; y += 0.0005) {
          fly.setStick(0, y);
          const f = fly.groundWish().forward;
          if (f > 0.04) { expect(f).toBeLessThanOrEqual(0.1); return y; }
        }
        throw new Error('no push under 0.1');
      };
      const across = (running: boolean, turning: boolean): boolean[] => {
        const { fly, mode, seq } = walking();
        if (running) key('KeyW');
        for (let i = 0; i < 20; i++) { fly.update(TICK); mode.frame(TICK); }
        const w = mode['walker']!;
        const start = seq() + 1;
        expect(mode.setFlinchPose(() => pose, { start, until: start + 42 })).toBeNull();
        w.state.y += 6; w.setAirborne(true);                                    // off the floor, the flinch under the fall
        if (running) { key('KeyW', 'keyup'); fly.setStick(0, slow(fly)); } else key('KeyW');
        if (turning) fly.setLook(1, 0);
        while (w.airborne) { fly.update(TICK); mode.frame(TICK); }
        expect(w.landing?.clip).toBeNull();                                      // moving, the stick not at rest: no clip
        expect(seq()).toBeGreaterThanOrEqual(start + FLINCH_CUT_COMMANDS);
        if (turning) expect(Math.abs(w.turn)).toBeGreaterThan(0.1 * SEAL_TUNING.turnMaxRate);
        const after = [mode.flinching()];                                       // the landing's tick, then the next three
        for (let k = 0; k < FLINCH_CUT_COMMANDS; k++) { fly.update(TICK); mode.frame(TICK); after.push(mode.flinching()); }
        fly.setStick(0, 0); fly.setLook(0, 0);
        return after;
      };
      expect(across(true, false)).toEqual([true, true, true, true]);            // the take-off's full stick: no cut
      expect(across(false, true)).toEqual([true, true, true, false]);           // the turn: a game frame past the landing
    });

    it('a still stick keeps the page\'s flinch to its own clock\'s end; without the room\'s window nothing cuts it', () => {
      const { mode, seq } = walking();
      for (let i = 0; i < 10; i++) mode.frame(TICK);
      let open = true;
      const start = seq() + 1;
      expect(mode.setFlinchPose(() => (open ? pose : null), { start, until: start + 42 })).toBeNull();
      for (let i = 0; i < 20; i++) mode.frame(TICK);
      expect(mode.flinching()).toBe(true);
      open = false;
      expect(mode.flinching()).toBe(false);
      // An older room's event (no window): the page's clock alone, whatever the stick does.
      open = true;
      key('KeyW');
      expect(mode.setFlinchPose(() => pose)).toBeNull();
      for (let i = 0; i < 20; i++) mode.frame(TICK);
      expect(mode.flinching()).toBe(true);
    });

    // PAR-64 (research 230 section 5.2.3; PTW.R3 with roomReloadLock.test): the cut's move axes are the pad's stick as
    // `FUN_00551ec0` copies it each frame (D:L418613-418615), in the pass before the driver's (D:L50922-50925) -- not the
    // ground state's ramp (written back after the cut, `FUN_00584c60` D:L444165-444166), and not 0 under a hold.
    it('PAR-64: a stick pushed from rest cuts the page\'s flinch on the push\'s own command, not when the ramp passes 0.1', () => {
      const { mode, seq } = walking();
      for (let i = 0; i < 10; i++) mode.frame(TICK);
      const start = seq() + 1;
      expect(mode.setFlinchPose(() => pose, { start, until: start + 42 })).toBeNull();
      while (seq() < start + FLINCH_CUT_COMMANDS + 1) mode.frame(TICK);         // at rest, past the second driver tick
      expect(mode.flinching()).toBe(true);
      key('KeyW');
      const pushed = seq() + 1;
      while (seq() < pushed) mode.frame(TICK);
      const ramped = mode['walker']!.ground.forward;
      key('KeyW', 'keyup');
      expect(ramped).toBeLessThanOrEqual(0.1);                                  // the ramp's first step, under the threshold
      expect(mode.flinching(), 'the push\'s own command').toBe(false);
    });

    it('PAR-64: a stick held through a kit hold cuts the page\'s flinch on its first cuttable command, the hold left (under its NoInterrupt)', () => {
      const { mode, seq } = walking();
      for (let i = 0; i < 10; i++) mode.frame(TICK);
      const w = mode['walker']!;
      expect(w.hold('seal_crouch_reload')).toBe(true);
      const start = seq() + 1;
      expect(mode.setFlinchPose(() => pose, { start, until: start + 42 })).toBeNull();
      key('KeyW');
      while (seq() < start + FLINCH_CUT_COMMANDS - 1) mode.frame(TICK);
      const before = mode.flinching();
      while (seq() < start + FLINCH_CUT_COMMANDS) mode.frame(TICK);
      key('KeyW', 'keyup');
      expect(before).toBe(true);
      expect(w.holding?.clip).toBe('seal_crouch_reload');
      expect(w.ground.state).toBe('idle');                                      // the ground state does not run under it
      expect(mode.flinching(), 'the first cuttable command').toBe(false);
    });

    // PAR-65 (research 230 section 5.2.4; PTW.R3 with roomReloadLock.test): a flinch pushed in the air replaces the action
    // (`FUN_0058a4d0` D:L460018, `FUN_00588bc0` D:L460019); the next tick still in the air the fall is pushed over it
    // (`FUN_005af930` D:L466956-466970), and a landing with no clip pops the fall and hands the flinch back whole
    // (`FUN_00589aa0` D:L466900-466901): the body shows the fall in the air, the flinch from the landing's command, and the
    // stick's cut counts from there; a landing with a clip pops the stack to its base (`FUN_005af590` D:L466691-466693).
    it('PAR-65: a flinch pushed in the air is covered by the fall (not drawn) and handed back at a clipless landing: flinching() and the stick\'s cut run from the landing\'s command; a landing with a clip ends it', () => {
      const flight = (stick: 'held' | 'released') => {
        const { fly, mode, seen, seq } = walking();
        key('KeyW');
        for (let i = 0; i < 20; i++) { fly.update(TICK); mode.frame(TICK); }
        const w = mode['walker']!;
        w.state.y += 6; w.setAirborne(true);                                    // walked off: the fall
        const start = seq() + 1;
        expect(mode.setFlinchPose(() => pose, { start, until: start + 42 })).toBeNull();
        if (stick === 'released') key('KeyW', 'keyup');
        const drawn: boolean[] = [];
        while (w.airborne) { fly.update(TICK); mode.frame(TICK); drawn.push(mode.snapshot()!.traversal?.clip === 'seal_flinch_rarm'); }
        const landed = seq();
        for (let i = 0; i < FLINCH_CUT_COMMANDS + 2; i++) { fly.update(TICK); mode.frame(TICK); }
        key('KeyW', 'keyup');
        const flinching = (s: number): boolean => seen.find((e) => e.seq === s)!.flinching;
        return { w, mode, start, landed, drawn, flinching };
      };
      const held = flight('held');
      expect(held.w.landing?.clip).toBeNull();                                  // moving, the stick pushed: no clip
      expect(held.landed).toBeGreaterThan(held.start);
      expect(held.drawn.slice(0, -1).every((d) => !d), 'covered by the fall in the air').toBe(true);
      expect(held.drawn[held.drawn.length - 1], 'handed back at the landing').toBe(true);
      expect([0, 1, 2, 3].map((k) => held.flinching(held.landed + k))).toEqual([true, true, true, false]);
      const released = flight('released');
      expect(released.w.landing?.clip).toBe('land');                            // at rest: Jump land
      expect(released.flinching(released.landed), 'popped at the landing').toBe(false);
      expect(released.mode.flinching()).toBe(false);
    });

    it('PAR-65: the event arriving after a clipless landing: the walk answers the window\'s end as its own commands give it -- the landing\'s command plus the clip, or the cut counted from the landing', () => {
      /** The touch stick's push that gives the walk a forward past FORWARD_DEAD 0.03 and at or under 0.1 (`groundWish`). */
      const slow = (fly: FlyCamera): number => {
        for (let y = 0; y < 1; y += 0.0005) {
          fly.setStick(0, y);
          const f = fly.groundWish().forward;
          if (f > 0.04) { expect(f).toBeLessThanOrEqual(0.1); return y; }
        }
        throw new Error('no push under 0.1');
      };
      const late = (push: 'full' | 'slow') => {
        const { fly, mode, seq } = walking();
        key('KeyW');
        for (let i = 0; i < 20; i++) { fly.update(TICK); mode.frame(TICK); }
        const w = mode['walker']!;
        w.state.y += 6; w.setAirborne(true);
        fly.update(TICK); mode.frame(TICK);                                      // a command in the air: the hit after it
        expect(w.airborne).toBe(true);
        const start = seq() + 1;
        key('KeyW', 'keyup');
        fly.setStick(0, push === 'full' ? 1 : slow(fly));
        while (w.airborne) { fly.update(TICK); mode.frame(TICK); }
        const landed = seq();
        for (let i = 0; i < FLINCH_CUT_COMMANDS + 2; i++) { fly.update(TICK); mode.frame(TICK); }
        fly.setStick(0, 0);
        expect(w.landing?.clip).toBeNull();
        return { mode, landed, answer: mode.setFlinchPose(() => pose, { start, until: start + 42 }) };
      };
      const cut = late('full');
      expect(cut.answer).toBe(cut.landed + FLINCH_CUT_COMMANDS);
      expect(cut.mode.flinching()).toBe(false);
      const whole = late('slow');
      expect(whole.answer).toBe(whole.landed + 42);
      expect(whole.mode.flinching()).toBe(true);
    });

    // PAR-71 (research 230 section 5.2.4, "PAR-71"; PTW.R3 with roomReloadLock.test): a flinch pushed on the floor, then
    // carried off a ledge. On the first tick in the air the fall is pushed over it (`FUN_005af930` D:L466956-466970) before
    // the tick's advance (D:L418169 before D:L418454), and only the top advances (`FUN_0057a330` D:L438708): its phase
    // stops. A clipless landing's pop hands it back, phase kept, skip set again (`FUN_0028da00` D:L135104-135107) and spent
    // by the peek (D:L418293) before that tick's advance: the rest of its clip from the landing's command, its cut from
    // there. A landing with a clip pops it (`FUN_005af590` D:L466691-466693).
    it('PAR-71: a flinch pushed on the floor and walked off a ledge is covered by the fall (not drawn) and handed back at a clipless landing with the rest of its clip: flinching() and the stick\'s cut from the landing\'s command; a landing with a clip ends it; an event after the landing answers the moved end', () => {
      /** The touch stick's push that gives the walk a forward past FORWARD_DEAD 0.03 and at or under 0.1 (`groundWish`). */
      const slow = (fly: FlyCamera): number => {
        for (let y = 0; y < 1; y += 0.0005) {
          fly.setStick(0, y);
          const f = fly.groundWish().forward;
          if (f > 0.04) { expect(f).toBeLessThanOrEqual(0.1); return y; }
        }
        throw new Error('no push under 0.1');
      };
      /** At rest; the flinch's window from the next command (or, `late`, told after the landing); `floor` ticks on the floor; lifted 6; `landing`'s stick to the floor. */
      const ledge = (floor: number, landing: 'slow' | 'full' | 'rest', late = false) => {
        const { fly, mode, seen, seq } = walking();
        for (let i = 0; i < 10; i++) { fly.update(TICK); mode.frame(TICK); }
        const w = mode['walker']!;
        const start = seq() + 1, until = start + 42;
        if (!late) expect(mode.setFlinchPose(() => pose, { start, until })).toBeNull();
        while (seq() < start + floor - 1) { fly.update(TICK); mode.frame(TICK); }
        expect(w.airborne).toBe(false);
        w.state.y += 6; w.setAirborne(true);                                    // walked off: the fall
        const air = seq() + 1;
        if (landing === 'full') key('KeyW'); else if (landing === 'slow') fly.setStick(0, slow(fly));
        const drawn: boolean[] = [];
        while (w.airborne) { fly.update(TICK); mode.frame(TICK); drawn.push(mode.snapshot()!.traversal?.clip === 'seal_flinch_rarm'); }
        const landed = seq();
        if (late) for (let i = 0; i < FLINCH_CUT_COMMANDS + 2; i++) { fly.update(TICK); mode.frame(TICK); }
        const answer = late ? mode.setFlinchPose(() => pose, { start, until }) : null;   // told a round trip on
        while (seq() < landed + (until - air) + 1) { fly.update(TICK); mode.frame(TICK); }
        key('KeyW', 'keyup'); fly.setStick(0, 0);
        const flinching = (s: number): boolean => seen.find((e) => e.seq === s)!.flinching;
        return { w, mode, start, until, air, landed, drawn, flinching, answer };
      };
      // Ten ticks in, landed at a stick under 0.1: the 32 commands left, from the landing's.
      const a = ledge(10, 'slow');
      expect(a.w.landing?.clip).toBeNull();
      expect(a.air).toBe(a.start + 10);
      const left = a.until - a.air;
      expect(a.landed + left).toBeGreaterThan(a.until);
      expect(a.drawn.slice(0, -1).every((d) => !d), 'covered by the fall in the air').toBe(true);
      expect(a.drawn[a.drawn.length - 1], 'handed back at the landing').toBe(true);
      expect([a.landed + left - 1, a.landed + left].map((s) => a.flinching(s))).toEqual([true, false]);
      // PAR-71 review F1: off the ledge on the window's end command -- covered before the end test (D:L418169 before
      // D:L418193, skipped at D:L418176), handed back for the landing's command, popped on the next.
      const g = ledge(42, 'slow');
      expect(g.w.landing?.clip).toBeNull();
      expect(g.air).toBe(g.until);
      expect([0, 1].map((k) => g.flinching(g.landed + k))).toEqual([true, false]);
      // Forty ticks in, two left: the flight outlasts the event's window, and the two are played after the landing.
      const b = ledge(40, 'slow');
      expect(b.w.landing?.clip).toBeNull();
      expect(b.landed).toBeGreaterThan(b.until);
      expect([0, 1, 2].map((k) => b.flinching(b.landed + k))).toEqual([true, true, false]);
      // Landed at a full stick: cut FLINCH_CUT_COMMANDS past the landing's command.
      const c = ledge(10, 'full');
      expect(c.w.landing?.clip).toBeNull();
      expect([0, 1, 2, 3].map((k) => c.flinching(c.landed + k))).toEqual([true, true, true, false]);
      // Landed at rest: `Jump land` pops it at the landing.
      const d = ledge(10, 'rest');
      expect(d.w.landing?.clip).toBe('land');
      expect(d.flinching(d.landed), 'popped at the landing').toBe(false);
      // The event after the landing: the walk answers the window's end its own commands give.
      const e = ledge(10, 'slow', true);
      expect(e.answer).toBe(e.landed + (e.until - e.air));
      const f = ledge(10, 'full', true);
      expect(f.answer).toBe(f.landed + FLINCH_CUT_COMMANDS);
    });
  });

  // PAR-78 (research 230 section 5.2.5; PTW.R3 with roomStillReloadJump.test): the flinch is a one-shot on top of the stack
  // (`FUN_005a2690` pushes it, D:L460019; `motion.rdr` looped 0 on the six), so `FUN_00550ef0` takes a jump press under it
  // down the one-shot branch (D:L418119-418132) and `FUN_0057e1b0` refuses it on the top's looped bit (D:L440810): spent,
  // not kept (the request only on first down, `FUN_00594cf0` D:L453210-453215). The page refuses it on the room's window
  // (`setFlinchPose`'s `cut`), as cut by its own commands, before the press rides on the command -- as the still reload's.
  describe('PAR-78: the page\'s own flinch refuses the jump, on the room\'s window', () => {
    const pose = { clip: 'seal_flinch_rarm', frame: 0, loop: false, rootY: null };
    const walking = () => {
      const { fly, mode } = setUp();
      fly.setPose({ x: 150, y: 40, z: 150, yaw: 0, pitch: 0 });
      mode.setMode('walk');
      const sent: number[] = [];
      mode.setNetTap((cmd) => { sent.push(cmd.buttons); });
      /** The commands from `from` that carried the jump. */
      const jumps = (from: number): number[] => sent.flatMap((b, i) => (i + 1 >= from && (b & Button.Jump) !== 0 ? [i + 1] : []));
      return { fly, mode, jumps, seq: (): number => sent.length };
    };

    // *Moved by PAR-78's review (F1)*: `until` is the command the flinch pops on, which reads the jump first
    // (D:L418119-418132 before D:L418193-418203): refused there, taken on the next (was: taken on `until`).
    it('at rest: refused from the window\'s first command to its pop\'s own (until), never on the wire and nothing kept for its end; taken on the next', () => {
      const { mode, jumps, seq } = walking();
      expect(mode.jump()).toBe(true);                                            // the control: no flinch, the jump is taken
      for (let i = 0; i < 120; i++) mode.frame(TICK);
      const w = mode['walker']!;
      expect(w.action).toBeNull();
      const start = seq() + 1, until = start + 42;
      expect(mode.setFlinchPose(() => pose, { start, until })).toBeNull();
      expect(mode.jump()).toBe(false);                                           // rides on the window's first command
      while (seq() < until - 1) mode.frame(TICK);
      expect(mode.jump()).toBe(false);                                           // rides on its pop's own (until)
      while (seq() < until) mode.frame(TICK);
      expect(jumps(start)).toEqual([]);
      expect(w.action).toBeNull();
      expect(mode.jump()).toBe(true);                                            // rides on `until + 1`: the flinch popped
      mode.frame(TICK);
      expect(jumps(start)).toEqual([until + 1]);
    });

    it('handed back by a clipless landing: refused through the hand-back\'s pop (landed + the commands left), taken on the next', () => {
      const { fly, mode, jumps, seq } = walking();
      /** The touch stick's push that gives the walk a forward past FORWARD_DEAD 0.03 and at or under 0.1 (no cut). */
      const slow = (): number => {
        for (let y = 0; y < 1; y += 0.0005) {
          fly.setStick(0, y);
          const f = fly.groundWish().forward;
          if (f > 0.04) { expect(f).toBeLessThanOrEqual(0.1); return y; }
        }
        throw new Error('no push under 0.1');
      };
      key('KeyW');
      for (let i = 0; i < 20; i++) { fly.update(TICK); mode.frame(TICK); }
      const w = mode['walker']!;
      const start = seq() + 1;
      expect(mode.setFlinchPose(() => pose, { start, until: start + 42 })).toBeNull();
      w.state.y += 6; w.setAirborne(true);                                     // off the floor before its first command: covered whole
      key('KeyW', 'keyup'); fly.setStick(0, slow());
      while (w.airborne) { fly.update(TICK); mode.frame(TICK); }
      expect(w.landing?.clip).toBeNull();                                       // moving: no clip, the flinch handed back
      const back = seq() + 42;
      expect((mode as unknown as { flinchCut: { until: number } | null }).flinchCut!.until).toBe(back);
      while (seq() < back - 1) { fly.update(TICK); mode.frame(TICK); }
      expect(mode.jump()).toBe(false);                                           // rides on the hand-back's pop (back)
      fly.update(TICK); mode.frame(TICK);
      expect(mode.jump()).toBe(true);                                            // rides on `back + 1`
      fly.update(TICK); mode.frame(TICK);
      fly.setStick(0, 0);
      expect(jumps(start)).toEqual([back + 1]);
    });

    it('the stick held: the jump riding on the cut\'s own command is refused (read before the cut, D:L418119-418130 before D:L418174-418190), the next command\'s is taken', () => {
      const { mode, jumps, seq } = walking();
      key('KeyW');
      for (let i = 0; i < 60; i++) mode.frame(TICK);
      const start = seq() + 1, until = start + 42, cut = start + FLINCH_CUT_COMMANDS;
      expect(mode.setFlinchPose(() => pose, { start, until })).toBeNull();
      while (seq() < cut - 1) mode.frame(TICK);
      expect(mode.flinching()).toBe(true);
      expect(mode.jump()).toBe(false);                                           // rides on `cut`
      mode.frame(TICK);
      expect(mode.flinching()).toBe(false);                                      // `cut` cut it
      expect(mode.jump()).toBe(true);                                            // rides on `cut + 1`
      mode.frame(TICK);
      expect(jumps(start)).toEqual([cut + 1]);
    });

    it('without the room\'s window (an older room, or a room without the clips: no window held) the page refuses nothing, as the room', () => {
      const { mode } = walking();
      for (let i = 0; i < 120; i++) mode.frame(TICK);
      expect(mode.setFlinchPose(() => pose)).toBeNull();
      expect(mode.flinching()).toBe(true);
      expect(mode.jump()).toBe(true);
    });
  });

  // PAR-81 (research 230 section 5.2.6; PTW.R3 with roomEquipment.test's "PAR-81"): the launcher's raise takes its anim set
  // (`FUN_005a6d30` -> `FUN_0058c350` D:L462105) before the driver on its press's frame, and `FUN_005b4340(actor, 0xb)`
  // refuses the jump under it (D:L469466-469471; the press gate D:L453211-453213, `FUN_0057e1b0` D:L440806) until the
  // lower's reversed clip gives the set back at its end (`FUN_00582540` D:L443058-443062), after the jump's read: the 84th
  // command from the rifle's clip, the 82nd from the pistol's. The page refuses the press before it rides, on the same
  // commands as the room (the `throw` event's seq is the last command sent: `taps`).
  describe("PAR-81: the launcher's anim set refuses the jump on the page, on the room's commands", () => {
    const walking = () => {
      const { fly, mode } = setUp();
      fly.setPose({ x: 150, y: 40, z: 150, yaw: 0, pitch: 0 });
      mode.setMode('walk');
      const sent: number[] = [];
      mode.setNetTap((cmd) => { sent.push(cmd.buttons); });
      /** The commands from `from` that carried the jump. */
      const jumps = (from: number): number[] => sent.flatMap((b, i) => (i + 1 >= from && (b & Button.Jump) !== 0 ? [i + 1] : []));
      for (let i = 0; i < 120; i++) mode.frame(TICK);
      return { fly, mode, jumps, seq: (): number => sent.length };
    };

    it("raised: refused from the raise's own command (the next) and while the launcher is up, never on the wire", () => {
      const { mode, jumps, seq } = walking();
      const e = seq();
      mode.launcherRaised();
      expect(mode.jump()).toBe(false);                                           // rides on e + 1
      for (let i = 0; i < 100; i++) mode.frame(TICK);
      expect(mode.jump()).toBe(false);                                           // the raise over, the launcher up
      for (let i = 0; i < 300; i++) mode.frame(TICK);
      expect(mode.jump()).toBe(false);
      mode.frame(TICK);
      expect(jumps(e + 1)).toEqual([]);
    });

    it("lowered: refused through the lower's end (its 84th from the rifle's clip, 82nd from the pistol's), taken on the next", () => {
      for (const [from, end] of [[0, 84], [1, 82]] as const) {
        const { mode, jumps, seq } = walking();
        mode.launcherRaised();
        for (let i = 0; i < 120; i++) mode.frame(TICK);
        const l = seq();
        mode.launcherLowered(from);
        while (seq() < l + end - 1) mode.frame(TICK);
        expect(mode.jump(), `from ${from}: its end's own command`).toBe(false);  // rides on l + end
        mode.frame(TICK);
        expect(mode.jump(), `from ${from}: the next`).toBe(true);               // rides on l + end + 1
        mode.frame(TICK);
        expect(jumps(l + 1), `from ${from}`).toEqual([l + end + 1]);
      }
    });

    // LATER 203's review F1: the set's own life, read by the page's Fire and aim weights (`Play`): on from the raise,
    // through the still lower's clip to its end (`FUN_005a60d0(.., 4)` from that clip's end, D:L438531-438536,
    // D:L461770-461771), off after.
    it("LATER 203: launcherSetOn holds from the raise through the still lower's end, and is off on the next", () => {
      const { mode, seq } = walking();
      expect(mode.launcherSetOn()).toBe(false);
      mode.launcherRaised();
      expect(mode.launcherSetOn()).toBe(true);
      for (let i = 0; i < 120; i++) mode.frame(TICK);
      const l = seq();
      mode.launcherLowered(0);
      while (seq() < l + 84 - 1) mode.frame(TICK);
      expect(mode.launcherSetOn(), "the lower's end's own command").toBe(true);
      mode.frame(TICK);
      expect(mode.launcherSetOn(), 'the next').toBe(false);
    });

  // LATER 504 (reading, research 215 §8.5): the raise `FUN_005a6d30` calls `FUN_0058c350(actor, DAT_0044d408, 0x12, 1, 0)`
  // (D:L462105): the set's "Crouch" row `seal_launcher` at posture 1, the stance request crouch (D:L447957-447995); under
  // the set the stand state asks crouch every frame (`FUN_00586570` D:L444853-444855); either lower gives the set back
  // through `FUN_0058c4a0(actor, previous set, 0)` -- the "Stand" row at posture 0, the request 0 (still lower's end
  // `FUN_005a60d0(.., 4)` D:L461769-461771; the stick's D:L418268-418272).
    it("LATER 504: the raise kneels the mover, a stand press keeps the crouch, the still lower's end stands it", () => {
      const { mode, seq } = walking();
      const w = (mode as unknown as { walker: { stance: string } }).walker;
      expect(w.stance).toBe('stand');
      mode.launcherRaised();
      for (let i = 0; i < 3; i++) mode.frame(TICK);
      expect(w.stance, 'the raise: crouched at once').toBe('crouch');        // today: 'stand'
      for (let i = 0; i < 120; i++) mode.frame(TICK);
      mode.setStance('stand');
      for (let i = 0; i < 30; i++) mode.frame(TICK);
      expect(w.stance, 'a stand press under the set').toBe('crouch');
      const l = seq();
      mode.launcherLowered(0);
      while (seq() < l + 84) mode.frame(TICK);
      expect(w.stance, "the lower's end's own command: still under the set").toBe('crouch');
      mode.frame(TICK);
      expect(w.stance, "the next: the Stand row (FUN_0058c4a0)").toBe('stand');
    });

    it("cleared (a spawn's kit: the room's spawn holds no launcher) the jump is taken", () => {
      const { mode } = walking();
      mode.launcherRaised();
      mode.frame(TICK);
      mode.launcherCleared();
      expect(mode.jump()).toBe(true);
    });
  });

  // PAR-83 (research 230 section 5.2.8; PTW.R3 with roomEquipment.test's "PAR-83"): with the launcher's set on and its base
  // (type 0x12) on top -- from the command after the raise's end -- a move axis past 0.1 (`+0x240` / `+0x244`; never the
  // turn) lowers it in the ground driver's looped branch (`FUN_00550ef0` D:L418263-418278): the set given back on that
  // command, after the jump's read (D:L418119-418150), the moving lower on the second channel (`FUN_005a6b70` D:L462073 /
  // D:L462082, `seal_mv_*2launcher` run back from its end, kinds 8 / 10 at D:L445419-445437). The page decides it on the
  // command the stick rides, as the room does from that command; no event goes to the room.
  describe("PAR-83: the launcher's stick lower on the page, on the room's commands", () => {
    it('the test is a move axis strictly past 0.1, the turn not read; the base comes on top the command after the raise ends; the moving lower runs playback x (n-1)/n', () => {
      expect(launcherStickLowers({ forward: 0.1, right: -0.1 })).toBe(false);
      expect(launcherStickLowers({ forward: 0, right: 0 })).toBe(false);
      expect(launcherStickLowers({ forward: 0.1000001, right: 0 })).toBe(true);
      expect(launcherStickLowers({ forward: 0, right: -0.11 })).toBe(true);
      expect(launcherBaseCommand(1000, LAUNCHER_RAISE_CLIPS.rifle)).toBe(1085);
      expect(launcherBaseCommand(1000, LAUNCHER_RAISE_CLIPS.pistol)).toBe(1083);
      expect(LAUNCHER_MOVING_LOWER.rifle).toEqual({ clip: 'seal_mv_rifle2launcher', playback: 1.5, frames: 35 });
      expect(LAUNCHER_MOVING_LOWER.pistol).toEqual({ clip: 'seal_mv_pistol2launcher', playback: 1.5, frames: 24 });
      expect(launcherMovingLowerSeconds(0)).toBeCloseTo(1.5 * 34 / 35, 12);
      expect(launcherMovingLowerSeconds(1)).toBeCloseTo(1.5 * 23 / 24, 12);
    });

    const walking = () => {
      const { fly, mode } = setUp();
      fly.setPose({ x: 150, y: 40, z: 150, yaw: 0, pitch: 0 });
      mode.setMode('walk');
      const sent: Omit<Command, 'seq'>[] = [];
      mode.setNetTap((cmd) => { sent.push(cmd); });
      /** The commands from `from` that carried the jump. */
      const jumps = (from: number): number[] => sent.flatMap((c, i) => (i + 1 >= from && (c.buttons & Button.Jump) !== 0 ? [i + 1] : []));
      for (let i = 0; i < 120; i++) mode.frame(TICK);
      const heard: number[] = [];
      mode.onLauncherStickLower((from) => { heard.push(from); });
      return { fly, mode, jumps, heard, sent, seq: (): number => sent.length };
    };

    // LATER 504: the stick's lower gives the set back through `FUN_0058c4a0(actor, previous set, 0)` and writes the request
    // 0 (D:L418268-418272): the mover kneeling under the set stands on the next command -- the port's frame order (the
    // set followed at the tick's start, as `climbLock`), where the original pushes the row in the stick's frame (D:L418270).
    it("LATER 504: the stick's lower stands the kneeling mover on the next command", () => {
      const { fly, mode } = walking();
      const w = (mode as unknown as { walker: { stance: string } }).walker;
      mode.launcherRaised(0);
      for (let i = 0; i < 100; i++) mode.frame(TICK);
      expect(w.stance).toBe('crouch');
      fly.setStick(0, 1);
      mode.frame(TICK);                                              // the stick's command: the set given back
      mode.frame(TICK);
      expect(w.stance).toBe('stand');
    });

    it("a stick past 0.1 with the launcher up lowers it on the command it rides: the jump on that command refused, on the next taken; heard once, with the firearm", () => {
      for (const from of [0, 1] as const) {
        const { fly, mode, jumps, heard, seq } = walking();
        mode.launcherRaised(from);
        for (let i = 0; i < 100; i++) mode.frame(TICK);                         // the raise over: its base on top
        expect(heard).toEqual([]);
        const u = seq() + 1;
        fly.setStick(0, 1);
        expect(mode.jump(), `from ${from}: rides on the stick's own command`).toBe(false);
        mode.frame(TICK);
        expect(seq()).toBe(u);
        expect(heard, `from ${from}`).toEqual([from]);
        expect(mode.jump(), `from ${from}: the next`).toBe(true);               // rides on u + 1
        mode.frame(TICK);
        fly.setStick(0, 0);
        expect(jumps(u - 1), `from ${from}`).toEqual([u + 1]);
        for (let i = 0; i < 10; i++) mode.frame(TICK);
        expect(heard, `from ${from}: once`).toEqual([from]);
      }
    });

    it("the stick held from the raise lowers it on the command after the raise's end (e + 85 from the rifle, e + 83 from the pistol), never before", () => {
      for (const [from, end] of [[0, 84], [1, 82]] as const) {
        const { fly, mode, heard, seq } = walking();
        const e = seq();
        mode.launcherRaised(from);
        fly.setStick(0, 0.3);
        while (seq() < e + end) mode.frame(TICK);
        expect(heard, `from ${from}: through the raise's end`).toEqual([]);
        mode.frame(TICK);
        expect(seq()).toBe(e + end + 1);
        expect(heard, `from ${from}: the base's first command`).toEqual([from]);
        fly.setStick(0, 0);
      }
    });

    it("lowered (the kit's), cleared, or not raised, the stick lowers nothing", () => {
      const { fly, mode, heard } = walking();
      fly.setStick(0, 0.3);
      for (let i = 0; i < 10; i++) mode.frame(TICK);
      mode.launcherRaised(0);
      fly.setStick(0, 0);
      for (let i = 0; i < 100; i++) mode.frame(TICK);
      mode.launcherLowered(0);
      fly.setStick(0, 0.3);
      for (let i = 0; i < 10; i++) mode.frame(TICK);
      mode.launcherRaised(0);
      mode.launcherCleared();
      for (let i = 0; i < 100; i++) mode.frame(TICK);
      fly.setStick(0, 0);
      expect(heard).toEqual([]);
    });

    // F3 of PAR-81's review: a firearm taken with the launcher still up is the lower in the set (`FUN_005a64c0(actor, 4,
    // firearm, 0)` -> `FUN_005a6b70`, the raise's clip reversed by the firearm taken), its set given back at that clip's
    // end -- the room's `aim` the same on the same command.
    it("F3: the swap with the launcher still up lowers it to the firearm taken: the jump refused through that clip's end (the pistol's 82nd), taken on the next", () => {
      const { mode, jumps, heard, seq } = walking();
      mode.launcherRaised(0);
      for (let i = 0; i < 100; i++) mode.frame(TICK);
      const w = seq() + 1;
      expect(mode.swapWeapon('pistol')).not.toBeNull();
      while (seq() < w + 80) mode.frame(TICK);
      expect(mode.jump()).toBe(false);                                           // rides on w + 81, the lower's end
      mode.frame(TICK);
      expect(mode.jump()).toBe(true);                                            // rides on w + 82
      mode.frame(TICK);
      expect(jumps(w)).toEqual([w + 82]);
      expect(heard).toEqual([]);
    });

    // F1 of PAR-83's review (research 230 section 5.2.8): the stick's moving lower refuses the take while it lives -- every
    // slot's take and the swap ask `FUN_005a8cb0` (D:L453289-453310), whose `FUN_005a7de0(actor, 1, 1)` (D:L463159) refuses
    // while `FUN_005a7980(actor, 1)` answers on `DAT_003df0f0` / `DAT_003df0f8` (D:L462492-462499, D:L462636-462638). The
    // page's half of that gate is `swapGate` (the shoulder press's, the R2 inventory's, the swap's): closed for a take
    // riding the stick's command u + 1 .. u + life - 1, open riding u + life -- the life the room's `firearmReadyAt` counts
    // (87 commands from the rifle, 86 from the pistol), as roomEquipment.test's "F1" refuses the raise and the swap.
    it("F1: a take inside the stick's moving lower is refused on the commands the room refuses it (87 from the rifle, 86 from the pistol), the swap with it, nothing on the wire", () => {
      expect(launcherMovingLowerCommands(0)).toBe(87);
      expect(launcherMovingLowerCommands(1)).toBe(86);
      for (const [from, life] of [[0, 87], [1, 86]] as const) {
        const { fly, mode, heard, sent, seq } = walking();
        mode.launcherRaised(from);
        for (let i = 0; i < 100; i++) mode.frame(TICK);
        expect(mode.swapGate(), `from ${from}: the launcher up, before the stick`).toBe(true);
        fly.setStick(0, 1);
        mode.frame(TICK);
        fly.setStick(0, 0);
        const u = seq();
        expect(heard, `from ${from}`).toEqual([from]);
        while (seq() + 1 < u + life) {
          expect(mode.swapGate(), `from ${from}: a take riding u + ${seq() + 1 - u}`).toBe(false);
          expect(mode.swapWeapon('pistol'), `from ${from}: riding u + ${seq() + 1 - u}`).toBeNull();
          mode.frame(TICK);
        }
        expect(seq() + 1).toBe(u + life);
        expect(mode.swapGate(), `from ${from}: riding u + ${life}`).toBe(true);
        expect(sent.some((c) => (c.buttons & Button.Swap) !== 0), `from ${from}`).toBe(false);
      }
    });

    it("F1: the kit's lower plays no moving lower (the take open), and a spawn's clear ends the stick's", () => {
      const { fly, mode, heard } = walking();
      mode.launcherRaised(0);
      for (let i = 0; i < 100; i++) mode.frame(TICK);
      mode.launcherLowered(0);
      // PAR-84 (research 230 section 5.2.10): the kit's still lower is the raise's clip reversed on the body, under which
      // `FUN_005a7980` answers: the take closed through its 84 commands, then open -- no moving lower's life after it.
      expect(mode.swapGate()).toBe(false);
      for (let i = 0; i < 84; i++) mode.frame(TICK);
      expect(mode.swapGate()).toBe(true);
      mode.launcherRaised(0);
      for (let i = 0; i < 100; i++) mode.frame(TICK);
      fly.setStick(0, 1);
      mode.frame(TICK);
      fly.setStick(0, 0);
      expect(heard).toEqual([0]);
      expect(mode.swapGate()).toBe(false);
      mode.launcherCleared();
      expect(mode.swapGate()).toBe(true);
    });
  });

  // NU-5 X1 and research 324 P2 (research 323 §1.5; the gameplay controller's point 3, 2026-10-14): the taker's own
  // `Swap rifle` on the page's body. The page learns of the exchange (or the launcher claim) from the room's `kit` --
  // one message after the claim -- and plays the clip on its next command (`pickupSwap`), kept with that command as the
  // launcher's clips are (`KeptCommand.launcher`); the room's mover plays it from the claim's command + 1
  // (`PICKUP_SWAP_OWN_LAG_READING`). Here the room keeps the clip at the command the page plays it on: the page's body is
  // the room's on every command through the clip, held still under it (the stick cuts nothing: `NoInterrupt ()` bare).
  describe("NU-5: the taker's own Swap rifle on the page's walk at the room's kit (PICKUP_SWAP_OWN_LAG_READING)", () => {
    it('pickupSwap plays swapRifleExchange from the next command, the body held as the room\'s mover holds it through the clip; swapRifleClaim alike', () => {
      expect(PICKUP_SWAP_OWN_LAG_READING).toBe("from the claim's command");   // NU-5 review F3; was 'at the kit message'
      for (const name of ['swapRifleExchange', 'swapRifleClaim'] as const) {
        const { fly, mode } = setUp();
        fly.setPose({ x: 150, y: 40, z: 150, yaw: 0, pitch: 0 });
        mode.setMode('walk');
        const sent: { cmd: Command; feet: [number, number, number] }[] = [];
        mode.setNetTap((cmd, feet) => { sent.push({ cmd: { ...cmd, seq: sent.length + 1 }, feet: [feet[0], feet[1], feet[2]] }); });
        for (let i = 0; i < 120; i++) mode.frame(TICK);
        const at = sent[sent.length - 1]!.feet;
        const room = new Walker(groundGrid(GROUND));
        room.place(at[0], at[1] + STEP_PROBE_LIFT_READING, at[2]);
        const sim = new MoverSim(room, null);
        sim.seq = sent.length;
        let ran = sent.length;
        const k = sent.length;
        mode.pickupSwap(name);
        sim.launcherClips.keep({ name, reversed: false, at: k + 1 });
        fly.setStick(0, 1);
        const end = playedOutCommand(ACTION_CLIPS[name].playback, ACTION_CLIPS[name].frames);
        while (sent.length < k + end + 10) {
          mode.frame(TICK);
          while (ran < sent.length) sim.apply(sent[ran++]!.cmd);
          const page = sent[sent.length - 1]!.feet;
          expect([page[0], page[2]], `${name} k + ${sent.length - k}`).toEqual([room.state.x, room.state.z]);
          expect(mode.snapshot()?.action?.name ?? null, `${name} k + ${sent.length - k}`).toBe(room.action?.name ?? null);
          if (sent.length - k === 1) expect(mode.snapshot()?.action?.name).toBe(name);
        }
        fly.setStick(0, 0);
      }
    });
  });

  // NU-5 review F3 (the fresh review of 7c374ad0a; PTW.R3): the room keeps the taker's `Swap rifle` at the claim's
  // command + 1 (`room.ts`'s `swapRifle` sink); the page learns of it from the room's `kit`, N commands later. The page
  // knows its own claim's command (`pickupClaimed`, the `pickup` event's seq: the client's last), so it starts the clip
  // there with the elapsed offset, as the room starts a kept clip late (PAR-84's `elapsed`): at the message's next
  // command the page's clip is at the room's phase, and a fire inside it is refused on both.
  describe("NU-5 review F3: the taker's own Swap rifle from the claim's command, the message's lag absorbed", () => {
    const READERC_BYTES = fixture('RUN/READERC.ZAR');
    it.skipIf(READERC_BYTES === null)('the kit arriving 6 commands after the claim: the page\'s clip phase equals the room\'s on the next command, and the fire is refused on both (NoFire bare)', () => {
      const table = motionTableFromArchive(READERC_BYTES!)!;
      for (const name of ['swapRifleExchange', 'swapRifleClaim'] as const) {
        const { fly, mode } = setUp();
        fly.setPose({ x: 150, y: 40, z: 150, yaw: 0, pitch: 0 });
        mode.setMode('walk');
        mode.setMotionTable(table);
        const sent: { cmd: Command; feet: [number, number, number] }[] = [];
        mode.setNetTap((cmd, feet) => { sent.push({ cmd: { ...cmd, seq: sent.length + 1 }, feet: [feet[0], feet[1], feet[2]] }); });
        for (let i = 0; i < 120; i++) mode.frame(TICK);
        const at = sent[sent.length - 1]!.feet;
        const room = new Walker(groundGrid(GROUND));
        room.place(at[0], at[1] + STEP_PROBE_LIFT_READING, at[2]);
        const sim = new MoverSim(room, null);
        sim.seq = sent.length;
        let ran = sent.length;
        const catchUp = (): void => { while (ran < sent.length) sim.apply(sent[ran++]!.cmd); };
        const k = sent.length;
        mode.pickupClaimed();                                            // the claim sent at command k
        sim.launcherClips.keep({ name, reversed: false, at: k + 1 });    // room.ts: the claim's command + 1
        for (let i = 0; i < 6; i++) { mode.frame(TICK); catchUp(); }    // the room's kit is 6 commands away
        expect(room.action?.name, name).toBe(name);
        expect(mode.snapshot()?.action ?? null, name).toBeNull();        // the page has not heard yet
        mode.pickupSwap(name);                                           // the kit arrives
        mode.frame(TICK); catchUp();
        const page = mode.snapshot()?.action;
        expect(page?.name, name).toBe(name);
        expect(page!.t, name).toBeCloseTo(room.action!.t, 6);            // the room's phase on the same command
        expect(mode.fireAllowed(), name).toBe(false);
        expect(fireCapability(room, null, false, table).fire, name).toBe(false);
        // Both come off on the same command.
        const end = playedOutCommand(ACTION_CLIPS[name].playback, ACTION_CLIPS[name].frames);
        while (sent.length < k + end + 3) {
          mode.frame(TICK); catchUp();
          expect(mode.snapshot()?.action?.name ?? null, `${name} k + ${sent.length - k}`).toBe(room.action?.name ?? null);
        }
        expect(mode.fireAllowed()).toBe(true);
      }
    });
  });

  // PAR-84 (research 230 section 5.2.10, build step 6; PTW.R3 with roomEquipment.test's "PAR-84"): the raise and the still
  // lower hold the page's body as they hold the room's -- the page starts the clip at the press (as its swap), the room's
  // mover on the command it rides (`MoverSim.prepare`, the kept clip at the `throw` event's seq + 1). The room's half here
  // is its own rule over the page's own commands: a `MoverSim` with the room's kept clips (`launcherClips`), each command the
  // page sent applied to a mover stood where the page's stood. The page's body is the room's on every command.
  describe("PAR-84: the launcher's raise and still lower hold the page's body as the room's, on the same commands", () => {
    const walking = () => {
      const { fly, mode } = setUp();
      fly.setPose({ x: 150, y: 40, z: 150, yaw: 0, pitch: 0 });
      mode.setMode('walk');
      const sent: { cmd: Command; feet: [number, number, number] }[] = [];
      mode.setNetTap((cmd, feet) => { sent.push({ cmd: { ...cmd, seq: sent.length + 1 }, feet: [feet[0], feet[1], feet[2]] }); });
      for (let i = 0; i < 120; i++) mode.frame(TICK);
      // The room's mover: stood where the page's stands now, at rest, on the same ground.
      const at = sent[sent.length - 1]!.feet;
      const room = new Walker(groundGrid(GROUND));
      room.place(at[0], at[1] + STEP_PROBE_LIFT_READING, at[2]);
      const sim = new MoverSim(room, null);
      sim.seq = sent.length;
      let ran = sent.length;
      /** The room runs every command the page has sent since. */
      const catchUp = (): void => { while (ran < sent.length) sim.apply(sent[ran++]!.cmd); };
      return { fly, mode, sent, room, sim, catchUp, seq: (): number => sent.length };
    };

    it("raised from the rifle and the pistol: a stick held from the raise's own command, the page's feet are the room's on every command, the clip held through e + 83 / e + 81 and off on e + 84 / e + 82", () => {
      for (const [from, end] of [[0, 84], [1, 82]] as const) {
        const { fly, mode, sent, room, sim, catchUp, seq } = walking();
        const e = seq();
        mode.launcherRaised(from);
        sim.launcherClips.keep({ name: from === 1 ? 'pistolToLauncher' : 'rifleToLauncher', reversed: false, at: e + 1 });   // room.ts raiseLauncher
        fly.setStick(0, 1);
        while (seq() < e + end + 20) {
          mode.frame(TICK);
          catchUp();
          const k = seq() - e, page = sent[sent.length - 1]!.feet;
          expect([page[0], page[2]], `from ${from}: command e + ${k}`).toEqual([room.state.x, room.state.z]);
          const on = mode.snapshot()?.action?.name ?? null;
          expect(on, `from ${from}: command e + ${k}`).toBe(room.action?.name ?? null);
          if (k < end) expect(on, `from ${from}: command e + ${k}`).toBe(from === 1 ? 'pistolToLauncher' : 'rifleToLauncher');
          if (k === end) expect(on, `from ${from}: off on e + ${end}`).toBeNull();
        }
        fly.setStick(0, 0);
        expect(Math.hypot(room.state.x - sent[e - 1]!.feet[0], room.state.z - sent[e - 1]!.feet[2])).toBeGreaterThan(5);   // it walked after
      }
    });

    it('the still lower (the kit\'s lower): the same, reversed, from l + 1; the swap (the take) refused through it on the page, as the room refuses it', () => {
      const { fly, mode, sent, room, sim, catchUp, seq } = walking();
      mode.launcherRaised(0);
      sim.launcherClips.keep({ name: 'rifleToLauncher', reversed: false, at: seq() + 1 });
      for (let i = 0; i < 100; i++) { mode.frame(TICK); catchUp(); }
      const l = seq();
      mode.launcherLowered(0);
      sim.launcherClips.keep({ name: 'rifleToLauncher', reversed: true, at: l + 1 });   // room.ts launcherDown
      expect(mode.swapGate()).toBe(false);                                     // FUN_005a7980 answers: no take
      fly.setStick(0, 1);
      while (seq() < l + 84) {
        expect(mode.swapGate(), `riding l + ${seq() + 1 - l}`).toBe(false);
        mode.frame(TICK);
        catchUp();
        const page = sent[sent.length - 1]!.feet;
        expect([page[0], page[2]], `command l + ${seq() - l}`).toEqual([room.state.x, room.state.z]);
        if (seq() < l + 84) expect(mode.snapshot()?.action, `command l + ${seq() - l}`).toMatchObject({ name: 'rifleToLauncher', reversed: true });
      }
      expect(mode.snapshot()?.action ?? null).toBeNull();
      expect(room.action).toBeNull();
      expect(mode.swapGate()).toBe(true);
      fly.setStick(0, 0);
    });

    it("the run under a victory dance replays the clip from the command it was kept with (KeptCommand), as the room's mover ran it", () => {
      const { mode, sent, seq } = walking();
      const e = seq();
      mode.launcherRaised(0);
      for (let i = 0; i < 10; i++) mode.frame(TICK);
      const kept = (mode as unknown as { kept: { seq: number; launcher?: { name: string; reversed: boolean; at: number } }[] }).kept;
      expect(kept.find((k) => k.seq === e + 1)?.launcher).toEqual({ name: 'rifleToLauncher', reversed: false, at: e + 1 });
      expect(kept.filter((k) => k.launcher !== undefined)).toHaveLength(1);
      expect(sent).toHaveLength(e + 10);
    });
  });

  it('the hook\'s setCamera also sets the mover: onto the floor under the new pose, or back to fly with none', () => {
    const { fly, mode } = setUp();
    fly.setPose({ x: 150, y: 40, z: 150 });
    mode.setMode('walk');
    mode.setCamera({ x: 0, y: 60, z: 0, yaw: 90 });
    expect(mode.feet()).toEqual([0, 42, 0]);
    // Facing -x (yaw 90), the camera behind on +x, at the spawn pitch (W2.1).
    expect(fly.pose().x).toBeCloseTo(24.906, 3);
    expect(fly.pose().y).toBeCloseTo(42 + 25.709, 3);
    expect(fly.pose().z).toBeCloseTo(0, 6);
    expect(fly.pose().yaw).toBeCloseTo(90, 9);
    mode.setCamera({ yaw: 180 });                                    // a turn only: the mover stays put
    expect(mode.feet()).toEqual([0, 42, 0]);
    mode.setCamera({ x: 900, y: 60, z: 900 });                      // nowhere to stand: the pose is honoured, in fly
    expect(mode.mode()).toBe('fly');
    expect(fly.pose()).toMatchObject({ x: 900, y: 60, z: 900 });
  });

  it('walkFor drives the mover a whole number of ticks, the same whatever the frame rate, for Playwright', () => {
    const { fly, mode } = setUp();
    fly.setPose({ x: 150, y: 40, z: 150, yaw: 90, pitch: 0 });     // yaw 90 faces -x
    mode.setMode('walk');
    const pose = mode.walkFor(1, { forward: 1, right: 0, boost: false });
    expect(mode.feet()![0]).toBeLessThan(120);
    expect(pose.x - mode.feet()![0]).toBeCloseTo(24.906, 3);       // the camera behind, on +x (W2.1)
    expect(pose.z).toBeCloseTo(150, 6);
    expect(pose.y).toBeCloseTo(25.709, 3);
    expect(fly.pose()).toEqual(pose);
  });

  it('a new map re-stands a walking mover: on the floor under the camera the map load placed', () => {
    const { fly, mode } = setUp();
    fly.setPose({ x: 150, y: 40, z: 150 });
    mode.setMode('walk');
    fly.setPose({ x: 0, y: 120, z: 0 });                             // main.ts stands the camera at the new spawn
    mode.setGround(GROUND, [150, 0, 150]);
    expect(mode.mode()).toBe('walk');
    expect(mode.feet()).toEqual([0, 42, 0]);
    mode.setGround(undefined, null);                                 // a map with no hull: back to fly
    expect(mode.mode()).toBe('fly');
  });

  it('PAR-46a: walking, the walker\'s grid is the map\'s hull grid (one object, so a walking page\'s cast is unchanged); off the walk only the map\'s remains', () => {
    const { fly, mode } = setUp();
    expect(mode.grid()).toBeNull();                                  // fly: no walking grid ...
    const hull = mode.gridOfGround();
    expect(hull).not.toBeNull();                                     // ... the map's held all the same
    fly.setPose({ x: 150, y: 40, z: 150 });
    mode.setMode('walk');
    expect(mode.grid()).toBe(hull);
    fly.setPose({ x: 0, y: 120, z: 0 });
    mode.setGround(GROUND, [150, 0, 150]);                           // a new map re-stands the walker on its own grid
    expect(mode.mode()).toBe('walk');
    expect(mode.grid()).toBe(mode.gridOfGround());
    expect(mode.gridOfGround()).not.toBe(hull);
  });

  it('setStance(\'prone\') 5 deep in water is the game\'s crouch at once (FUN_00581660; issue #22), not prone for a frame', () => {
    const water = { ...floor(100, 100, 200, 200, 5), material: 11 };
    const wet = packGround(
      { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
      [floor(-200, -200, 200, 200, 0), water],
      [{ modelName: 'worldmodel', path: 'worldmodel/ground', first: 0, count: 1 }, { modelName: 'worldmodel', path: 'worldmodel/water', first: 1, count: 1 }],
    );
    const { fly, mode } = setUp(wet);
    mode.useTraversal((w, g) => new Traversal(w.grid, groundPolygons(g)));
    fly.setPose({ x: 150, y: 40, z: 150 });
    expect(mode.setMode('walk')).toBe(true);
    expect(mode.feet()).toEqual([150, 0, 150]);
    expect(mode.setStance('prone')).toBe(true);                      // the press is taken; the game rewrites it
    expect(mode.stance()).toBe('crouch');
    expect(mode.mover()?.stance).toBe('crouch');
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The jump (socomlegacy/docs/research/80-the-jump.md): FUN_0057e1b0's two jumps, FUN_005af930's impulse, FUN_005af590's landing.

describe('the jump, as the decompilation has it (research 80)', () => {
  const plain = world([floor(-200, -200, 200, 200, 0)]);
  const standing = (): Walker => {
    const w = new Walker(plain);
    w.place(0, 0, 0);
    w.state.yaw = facing(0, 0, 1, 0);
    return w;
  };

  it('under 15 a second is the standing jump: the Jump action on the floor, 0.99 s, the feet never leave it', () => {
    const w = standing();
    expect(RUNNING_JUMP_SPEED).toBe(15);                           // FUN_0057e1b0: 225 <= |v|^2
    expect(w.jump()).toBe(true);
    expect(w.action?.name).toBe('jump');
    expect(ACTION_SECONDS.jump).toBeCloseTo(1.1 * (19 / 20) ** 2, 9);   // seal_jump: playback 1.1, 20 keys
    let lowest = 0, highest = 0;
    for (let i = 0; i < 50; i++) {
      w.tick(STILL);
      expect(w.airborne).toBe(false);
      lowest = Math.min(lowest, w.state.y); highest = Math.max(highest, w.state.y);
    }
    expect([lowest, highest]).toEqual([0, 0]);                     // FUN_0059afd0: not UseVelY, the height is the actor's
    expect(w.jump()).toBe(false);                                  // the Jump action holds: no second jump inside it
    for (let i = 0; i < 20; i++) w.tick(STILL);
    expect(w.action).toBeNull();
    expect(w.jump()).toBe(true);                                   // and again once it is done
  });

  it('the standing jump\'s stick drives it at the sets\' top speeds: 65 ahead, 37 back, 65 aside, 20 crouched', () => {
    const speed = (input: WalkInput, stance: Stance = 'stand'): number => {
      const w = standing();
      w.stance = stance;
      w.jump();
      for (let i = 0; i < 30; i++) w.tick(input);
      return Math.hypot(w.state.vx, w.state.vz);
    };
    expect(speed(FORWARD)).toBeCloseTo(65, 6);
    expect(speed({ forward: -1, right: 0, boost: false })).toBeCloseTo(37, 6);
    expect(speed({ forward: 0, right: 1, boost: false })).toBeCloseTo(65, 6);
    expect(speed({ forward: 0, right: -1, boost: false })).toBeCloseTo(65, 6);
    expect(speed(FORWARD, 'crouch')).toBeCloseTo(20, 6);
    // no renormalisation (DAT_0064fc80 is 1 in the Jump state): a diagonal stick is the axes' own
    expect(speed({ forward: Math.SQRT1_2, right: Math.SQRT1_2, boost: false })).toBeCloseTo(65, 6);
    expect(speed(STILL)).toBe(0);                                  // at rest, seal_jump's root does not travel
  });

  it('from 15 a second the running jump: the launch, 79.9 up 0.1 s after take-off, 13.6 high, carried, no stick', () => {
    const w = standing();
    for (let i = 0; i < 60; i++) w.tick(FORWARD);                  // running at 65
    const v0 = Math.hypot(w.state.vx, w.state.vz);
    expect(v0).toBeCloseTo(65, 6);
    const x0 = w.state.x;
    expect(w.jump()).toBe(true);
    expect(w.action?.name).toBe('launch');
    expect(w.airborne).toBe(true);
    expect(runningJumpSpeed()).toBeCloseTo(0.85 * 235 * 0.4, 9);  // jump_factor x gravity x 0.4 = 79.9
    let top = 0, ticks = 0, firstRise = -1;
    while (w.airborne && ticks < 200) {
      w.tick({ forward: 0, right: 1, boost: false });              // the stick does nothing in the air
      ticks++;
      if (firstRise < 0 && w.state.y > 0) firstRise = ticks;
      top = Math.max(top, w.state.y);
    }
    // The air steps at the game frame (PF-03, PF.R8): the 0.1 s runs out on frame 3 (0.0666, 0.0333, -0.0001 left),
    // which the 60 Hz tick 7 runs -- the first whose end reaches 3 x GAME_FRAME_DT.
    const impulseFrame = Math.ceil(JUMP_DELAY / GAME_FRAME_DT);
    expect(impulseFrame).toBe(3);
    expect(firstRise).toBe(Math.ceil((impulseFrame * GAME_FRAME_DT - 1e-9) / TICK));
    expect(firstRise).toBe(7);
    // Through the wind-up the fall runs from 0 with the landing off: the feet sink 0.785 in two frames (FUN_0059b440,
    // FUN_0059ad30). Then FUN_0059b440 adds g dt to the fall speed before it moves the height: the rise tops out
    // 12.27 over where it began, 11.485 over the floor (research 90 section 8's order, research 208 section 4).
    let sink = 0, fall = 0;
    for (let i = 0; i < impulseFrame - 1; i++) { fall += 235 * GAME_FRAME_DT; sink += fall * GAME_FRAME_DT; }
    expect(sink).toBeCloseTo(0.785, 3);
    let apex = -sink, h = -sink;
    for (let v = runningJumpSpeed() - 235 * GAME_FRAME_DT; v > 0; v -= 235 * GAME_FRAME_DT) { h += v * GAME_FRAME_DT; apex = h; }
    expect(top).toBeCloseTo(apex, 6);
    expect(apex).toBeCloseTo(11.485, 3);
    const air = ticks * TICK;
    expect(air).toBeGreaterThan(JUMP_DELAY + (2 * runningJumpSpeed()) / 235 - 2 * TICK);   // 0.75 s from the sunk feet
    expect(air).toBeLessThan(JUMP_DELAY + (2 * runningJumpSpeed()) / 235 + 2 * TICK);
    expect(w.state.x - x0).toBeCloseTo(v0 * air, 0);               // the take-off's 65, straight on
    expect(w.state.z).toBeCloseTo(0, 9);
    // landing at 79.9 with the stick off rest: no landing clip, the run goes on (FUN_005af590)
    expect(w.landing?.clip).toBeNull();
    expect(w.action).toBeNull();
    expect(w.jump()).toBe(false);                                  // JUMP_LOCK 0.4 s after a landing
    for (let i = 0; i < Math.ceil(JUMP_LOCK / TICK); i++) w.tick(FORWARD);
    expect(w.jump()).toBe(true);
  });

  it('LATER 676: pushed square into a wall at full stick, blocked, the press is the running jump (r0004 ditch capture)', () => {
    // `FUN_0057e1b0` squares the clip's velocity `+0x2c..+0x34` against 225 (D:L440812-440814; r0004 0x583668-0x583694),
    // which `FUN_0057a330` writes from the top clip's root velocity (D:L438908-438985) and the walls never cut
    // (`FUN_005483d0` cuts only `+0xf44` and `+0x1350`, D:L413533-413597). Proven by ac's r0004 ditch capture
    // (agent-mail/evidence/eph-hunt-2026-11-01/segment-body/ditch-capture/RESULTS.md, 2026-11-04): blocked, the body
    // moving 0.00 a second against a clip velocity of 65, every press gave type 8, never the standing jump (178).
    const walled = world([floor(-200, -200, 200, 200, 0), wallX(50, -150, 150, 0, 30)]);
    const w = new Walker(walled);
    w.place(40, 0, 0);
    w.state.yaw = facing(0, 0, 1, 0);
    for (let i = 0; i < 30; i++) w.tick(FORWARD);
    expect(Math.hypot(w.state.vx, w.state.vz)).toBeLessThan(RUNNING_JUMP_SPEED);   // the walls' cut: blocked
    expect(w.jump()).toBe(true);
    expect(w.action?.name).toBe('launch');
    expect(w.airborne).toBe(true);
  });

  it('LATER 676: a placing clears the clip velocity -- a run, placed elsewhere, then a press: the standing jump', () => {
    // `place` starts the body afresh (its velocity 0): the speed test (`FUN_0057e1b0` D:L440812-440814) reads no
    // velocity kept from before the placing (fresh review 3, F3).
    const { w } = speeds(FORWARD, 20);
    expect(Math.hypot(w.state.vx, w.state.vz)).toBeGreaterThan(RUNNING_JUMP_SPEED);   // the control: running
    expect(w.place(500, 0, 500)).toBe(true);
    expect(w.jump()).toBe(true);
    expect(w.action?.name).toBe('jump');
    expect(w.airborne).toBe(false);
  });

  it('a running jump landed with the stick at rest plays Jump land, gliding the carried speed down to a stop', () => {
    const w = standing();
    for (let i = 0; i < 60; i++) w.tick(FORWARD);
    w.jump();
    while (w.airborne) w.tick(STILL);
    expect(w.landing?.clip).toBe('land');
    expect(w.landing!.speed).toBeLessThan(115);
    expect(w.action?.name).toBe('land');
    for (let i = 0; i < Math.ceil(ACTION_SECONDS.land / TICK); i++) w.tick(STILL);
    expect(w.action).toBeNull();
    expect(Math.hypot(w.state.vx, w.state.vz)).toBe(0);
  });

  it('prone cannot jump (FUN_005b4340 refuses stance 2); crouched it can, and stays crouched', () => {
    const w = standing();
    w.stance = 'prone';
    expect(w.jump()).toBe(false);
    w.stance = 'crouch';
    expect(w.jump()).toBe(true);
    expect(w.action?.name).toBe('jump');
    for (let i = 0; i < 70; i++) w.tick(STILL);
    expect(w.stance).toBe('crouch');
  });

  it('the one-shots the mover waits on are motion.rdr\'s playback over their keys (FUN_0028c4f0)', () => {
    for (const [name, c] of Object.entries(ACTION_CLIPS)) {
      expect(ACTION_SECONDS[name as keyof typeof ACTION_CLIPS]).toBeCloseTo(c.playback * ((c.frames - 1) / c.frames) ** 2, 9);
    }
  });

  it('a stance change on the floor plays its transition, holding the mover; moving over 10 it runs straight on', () => {
    const w = standing();
    w.changeStance('crouch');
    expect(w.action).toMatchObject({ name: 'standToCrouch', reversed: false });
    for (let i = 0; i < 20; i++) w.tick(FORWARD);
    expect(Math.hypot(w.state.x, w.state.z)).toBeLessThan(1.8);    // held: only the clip's own 1.7-unit shuffle
    for (let i = 0; i < 30; i++) w.tick(STILL);
    expect(w.action).toBeNull();
    w.changeStance('stand');
    expect(w.action).toMatchObject({ name: 'standToCrouch', reversed: true });
    for (let i = 0; i < 40; i++) w.tick(STILL);
    w.changeStance('prone');
    expect(w.action).toMatchObject({ name: 'standToProne', reversed: false });
    for (let i = 0; i < 60; i++) w.tick(STILL);
    w.changeStance('crouch');
    expect(w.action).toMatchObject({ name: 'crouchToProne', reversed: true });
    for (let i = 0; i < 60; i++) w.tick(STILL);
    w.changeStance('stand');
    expect(w.action?.reversed).toBe(true);
    for (let i = 0; i < 60; i++) w.tick(STILL);
    for (let i = 0; i < 60; i++) w.tick(FORWARD);                  // running at 65
    w.changeStance('crouch');
    expect(w.action).toBeNull();                                   // FUN_005817d0: speed^2 > 100, no transition
    expect(w.stance).toBe('crouch');
  });
});

describe('NoInterrupt and the heavy falls (FUN_00587c20, FUN_005af590, FUN_005ac1f0)', () => {
  const plain = world([floor(-200, -200, 200, 200, 0)]);
  const at = (): Walker => {
    const w = new Walker(plain);
    w.place(0, 0, 0);
    w.state.yaw = facing(0, 0, 1, 0);
    return w;
  };
  const drop = (height: number, random = 0.9): Walker => {
    const tower = world([floor(-200, -200, 200, 200, 0), floor(-20, -20, 20, 20, height)]);
    const w = new Walker(tower);
    w.random = () => random;
    w.place(0, height + 5, 0);
    w.state.yaw = facing(0, 0, 1, 0);
    for (let i = 0; i < 30; i++) w.tick(FORWARD);
    for (let i = 0; i < 400 && (w.airborne || w.state.y > 0); i++) w.tick(STILL);
    return w;
  };
  const phaseTicks = (name: keyof typeof ACTION_CLIPS): number => {
    const c = ACTION_CLIPS[name];
    return Math.floor((c.noInterrupt * c.playback * ((c.frames - 1) / c.frames)) / TICK);
  };

  it('the soft landing gives way to the stick at once (no NoInterrupt); a stick under 0.1 does not cut it', () => {
    const w = at();
    for (let i = 0; i < 60; i++) w.tick(FORWARD);
    w.jump();
    while (w.airborne) w.tick(STILL);
    expect(w.action?.name).toBe('land');
    w.tick({ forward: 0.09, right: 0, boost: false });
    expect(w.action?.name).toBe('land');
    w.tick({ forward: 0.2, right: 0, boost: false });
    expect(w.action).toBeNull();
  });

  it('the standing jump gives way to the stick past 0.7 of its phase (0.73 s), not before', () => {
    const w = at();
    w.jump();
    for (let i = 0; i < phaseTicks('jump'); i++) w.tick(FORWARD);
    expect(w.action?.name).toBe('jump');
    for (let i = 0; i < 2; i++) w.tick(FORWARD);
    expect(w.action).toBeNull();
  });

  it('a transition is never cut by the stick: the player cannot interrupt Stand -> Crouch', () => {
    const w = at();
    w.changeStance('crouch');
    for (let i = 0; i < Math.floor(ACTION_SECONDS.standToCrouch / TICK) - 1; i++) w.tick(FORWARD);
    expect(w.action?.name).toBe('standToCrouch');
  });

  it('landingClass: sqrt(2 g h) of FALLING_DAMAGE_LIGHT/HEAVY/DEATH -- 170.7, 206.8, 237.5', () => {
    expect(landingClass(170)).toBe(0);
    expect(landingClass(171)).toBe(1);
    expect(landingClass(207)).toBe(2);
    expect(landingClass(Math.sqrt(2 * 235 * 120))).toBe(3);
  });

  // LATER 410 (Fuse's #339, ed4c3fe1b): a point with no floor is the port's refusal (`place` over the ground grid); the
  // original's spawn rebuild (`FUN_00599b60` D:L455604) has no such branch. The refused respawn keeps the standing
  // walker, its kept state and its spawn count.
  it('a respawn with no floor leaves the standing walker where it is', () => {
    const mode = new WalkMode(new FlyCamera(canvas()), () => undefined);
    mode.setGround(GROUND, null);
    expect(mode.respawn([150, 0, 150], 20)).toBe(true);
    const feet = mode.feet();
    const spawns = mode.spawns();
    expect(feet).not.toEqual([0, 0, 0]);
    expect(mode.respawn([5000, 0, 5000], 90)).toBe(false);
    expect(mode.feet()).toEqual(feet);
    expect(mode.spawns()).toBe(spawns);
    expect(mode.mode()).toBe('walk');
  });

  // LATER 496's review F1: the client's refused spawn calls setDead(false), the refused respawn, then setDead(true); the
  // death camera (`./deathCamera`, mode 3 on its killer) is the one it had -- not a new mode-6 camera with the killer lost.
  const deathOf = (m: WalkMode): unknown => (m as unknown as { player: { death: unknown } | null }).player?.death ?? null;
  it('LATER 496: a refused respawn between setDead(false) and setDead(true) keeps the death camera and its killer', () => {
    const mode = new WalkMode(new FlyCamera(canvas()), () => undefined);
    mode.setGround(GROUND, null);
    expect(mode.respawn([150, 0, 150], 20)).toBe(true);
    mode.setDead(true);
    mode.setDeathKiller(() => [1, 2, 3]);
    const cam = deathOf(mode);
    expect(cam).not.toBeNull();
    mode.setDead(false, { keepDeath: true });                     // the client's spawn: kept only for its respawn
    expect(mode.respawn([5000, 0, 5000], 90)).toBe(false);
    mode.setDead(true);
    expect(deathOf(mode)).toBe(cam);
  });

  // The fold's re-look (review-later-496-fold.md): setDead(false) with no spawn behind it -- a match's close
  // (`NetClient.release`), the ghost's give-back, an attach -- keeps nothing: the next death is a new camera.
  it('LATER 496: setDead(false) without the spawn\'s intent keeps no death camera; nor does a new ground', () => {
    const mode = new WalkMode(new FlyCamera(canvas()), () => undefined);
    mode.setGround(GROUND, null);
    expect(mode.respawn([150, 0, 150], 20)).toBe(true);
    mode.setDead(true);
    mode.setDeathKiller(() => [1, 2, 3]);
    const cam = deathOf(mode);
    mode.setDead(false);                                         // a release, no respawn after it
    mode.setDead(true);
    expect(deathOf(mode)).not.toBeNull();
    expect(deathOf(mode)).not.toBe(cam);
    const cam2 = deathOf(mode);
    mode.setDead(false, { keepDeath: true });
    const kept = (m: WalkMode): unknown => (m as unknown as { deathKept: unknown }).deathKept;
    expect(kept(mode)).toBe(cam2);                               // the spawn's intent: kept
    mode.setGround(GROUND, null);                                // a new map: the kept camera goes with the old one,
    expect(kept(mode)).toBeNull();                               //   before any respawn (which would clear it too)
    expect(mode.respawn([150, 0, 150], 20)).toBe(true);
    mode.setDead(true);
    expect(deathOf(mode)).not.toBe(cam2);
  });

  it('LATER 496: a respawn that held between them drops the old death camera: the next death gets a new one', () => {
    const mode = new WalkMode(new FlyCamera(canvas()), () => undefined);
    mode.setGround(GROUND, null);
    expect(mode.respawn([150, 0, 150], 20)).toBe(true);
    mode.setDead(true);
    mode.setDeathKiller(() => [1, 2, 3]);
    const cam = deathOf(mode);
    mode.setDead(false);
    expect(mode.respawn([150, 0, 150], 90)).toBe(true);
    mode.setDead(true);
    expect(deathOf(mode)).not.toBeNull();
    expect(deathOf(mode)).not.toBe(cam);
  });

  it('the real WalkMode numbers its ticks as the net client does: commandSeq is taps + 1, the landing draws on it (research 86:631; review 3, A3)', () => {
    const fly = new FlyCamera(canvas());
    const mode = new WalkMode(fly, () => undefined);
    mode.setGround(GROUND, null);
    expect(mode.respawn([150, 0, 150], 0)).toBe(true);
    const w = (): Walker => mode['walker']!;
    const sent: Command[] = [];
    let wasAir = false, landedAt = 0, checked = 0;
    // The client's tap (net/client.ts: `++this.seq` once per tap, never reset): this tick's command is sent.length + 1.
    mode.setNetTap((cmd) => {
      const seq = sent.length + 1;
      expect(w().commandSeq).toBe(seq);
      checked++;
      if (wasAir && !w().airborne) {
        landedAt = seq;
        expect(w().landing?.cls).toBe(2);
        expect(w().landing?.clip).toBe(landingHitDraw(seq) <= 0.5 ? 'hitStomach' : 'hit');
      }
      wasAir = w().airborne;
      sent.push({ ...cmd, seq });
    });
    for (let i = 0; i < 10; i++) mode.frame(TICK);
    w().state.y = 100;                                              // 216.8 at contact: a heavy (class 2) landing
    w().setAirborne(true);
    for (let i = 0; i < 120; i++) mode.frame(TICK);
    expect(landedAt).toBeGreaterThan(10);
    expect(checked).toBe(sent.length);
    // Untapped, the count runs on (taps++ precedes the tap's early return); a new tap restarts it at 1.
    mode.setNetTap(null);
    for (let i = 0; i < 7; i++) mode.frame(TICK);
    expect(w().commandSeq).toBe(7);
    sent.length = 0;
    const seqs: number[] = [];
    mode.setNetTap((cmd) => { seqs.push(w().commandSeq); sent.push({ ...cmd, seq: sent.length + 1 }); });
    for (let i = 0; i < 3; i++) mode.frame(TICK);
    expect(seqs).toEqual([1, 2, 3]);
    mode.setNetTap(null);
  });

  it('a fall past heavy plays a hit, one of two by the draw; past death Land forward, then (the viewer) gets up', () => {
    const a = drop(100, 0.9);                                       // 216.8: heavy
    expect(a.landing).toMatchObject({ clip: 'hit', cls: 2 });
    expect(a.action?.name).toBe('hit');
    expect(drop(100, 0.2).landing?.clip).toBe('hitStomach');
    const b = drop(70);                                             // 181.4: light -- the hard landing
    expect(b.landing).toMatchObject({ clip: 'landHard', cls: 1 });
    const d = drop(130);                                            // 247.2: death
    expect(d.landing).toMatchObject({ clip: 'landDeath', cls: 3 });
    for (let i = 0; i < Math.ceil(ACTION_SECONDS.landDeath / TICK) + 1; i++) d.tick(STILL);
    expect(d.action?.name).toBe('getUp');
  });

  it('dead (online: the server killed the fall), Land forward holds its last key -- no get-up, the feet stay (FUN_005af590)', () => {
    expect(DEATH_LANDING_GETUP_PLACEHOLDER).toBe(true);                // the offline get-up stays a named placeholder
    const d = drop(130);
    expect(d.action?.name).toBe('landDeath');
    d.dead = true;
    for (let i = 0; i < Math.ceil(ACTION_SECONDS.landDeath / TICK) + 1; i++) d.tick(STILL);
    expect(d.action?.name).toBe('landDeath');
    const feet = [d.state.x, d.state.y, d.state.z];
    for (let i = 0; i < 120; i++) d.tick(FORWARD);                    // the stick never cuts it, nothing moves the body
    expect(d.action?.name).toBe('landDeath');
    expect([d.state.x, d.state.y, d.state.z]).toEqual(feet);
    // The kill heard after the get-up began (latency over the 0.4 s clip): back to the landing's last key.
    const late = drop(130);
    for (let i = 0; i < Math.ceil(ACTION_SECONDS.landDeath / TICK) + 3; i++) late.tick(STILL);
    expect(late.action?.name).toBe('getUp');
    late.dead = true;
    expect(late.action?.name).toBe('landDeath');
    late.tick(STILL);
    expect(late.action?.name).toBe('landDeath');
    expect(new Walker(plain).dead).toBe(false);
  });

  // PF-21 (research 180 s1.8, research 217 s4; ruling PF.R45): FUN_005af590 D:L466658-466660 forces class 3 when the
  // body's alive bit (+0xe1 bit 4, cleared by the death FUN_00547af0) is clear, and class 3 over the hard rate (115)
  // pushes `Land forward` (D:L495332): a corpse never draws the coin, never lands `Hit`.
  it("a corpse's hard landing is always Land forward (D:L466658-466660: the alive bit clear forces class 3), never the coin's Hit; the living still draw the coin", () => {
    const fall = (height: number, dead: boolean, draw: number): Walker => {
      const w = new Walker(plain);
      w.random = () => draw;
      w.place(0, 0, 0);
      for (let i = 0; i < 10; i++) w.tick(STILL);
      w.dead = dead;
      w.state.y = height;
      w.setAirborne(true);
      for (let i = 0; i < 400 && w.airborne; i++) w.tick(STILL);
      return w;
    };
    // The living: the coin over heavy (216.8), the hard clip over light (181.4), the death landing over deadly (247.2).
    expect(fall(100, false, 0.9).landing?.clip).toBe('hit');
    expect(fall(100, false, 0.2).landing?.clip).toBe('hitStomach');
    expect(fall(70, false, 0.9).landing?.clip).toBe('landHard');
    expect(fall(130, false, 0.9).landing?.clip).toBe('landDeath');
    // A corpse: `Land forward` over the hard rate whatever the speed's class or the draw, held at its last key.
    for (const [height, draw] of [[100, 0.9], [100, 0.2], [70, 0.9], [130, 0.9]] as const) {
      const c = fall(height, true, draw);
      expect(c.landing?.clip, `${height} ${draw}`).toBe('landDeath');
      for (let i = 0; i < Math.ceil(ACTION_SECONDS.landDeath / TICK) + 30; i++) c.tick(STILL);
      expect(c.action?.name, `${height} ${draw}`).toBe('landDeath');
    }
    // Under the hard rate (96.9 at 20) the class is 0 for everyone: a still corpse lands soft, as the living do.
    expect(fall(20, true, 0.9).landing?.clip).toBe(fall(20, false, 0.9).landing?.clip);
  });

  it('a hit carries the mover by the clip\'s own root travel, and gives way to the stick past 0.8', () => {
    const w = drop(100, 0.9);
    const x = w.state.x, z = w.state.z;
    for (let i = 0; i < phaseTicks('hit'); i++) w.tick(FORWARD);
    expect(w.action?.name).toBe('hit');
    const moved = Math.hypot(w.state.x - x, w.state.z - z);
    expect(moved).toBeGreaterThan(0.7 * 16.6 * 0.8);
    expect(moved).toBeLessThan(16.7);
    for (let i = 0; i < 2; i++) w.tick(FORWARD);
    expect(w.action).toBeNull();
  });
});

describe('round 3: the turn axis cuts, the actions move by their root key by key (FUN_00550ef0, FUN_0028c250)', () => {
  const plain = world([floor(-200, -200, 200, 200, 0)]);
  const at = (): Walker => {
    const w = new Walker(plain);
    w.place(0, 0, 0);
    w.state.yaw = 0;                                                // facing -z
    return w;
  };

  it('the turn axis past 0.1 (the turn over turn_maxrate) cuts an interruptible action as the stick does', () => {
    const w = at();
    for (let i = 0; i < 60; i++) w.tick(FORWARD);
    w.jump();
    while (w.airborne) w.tick(STILL);
    expect(w.action?.name).toBe('land');
    w.turn = 0.1 * SEAL_TUNING.turnMaxRate;                          // exactly 0.1: not past it
    w.tick(STILL);
    expect(w.action?.name).toBe('land');
    w.turn = 0.3;
    w.tick(STILL);
    expect(w.action).toBeNull();
  });

  it('a transition carries the mover by the root key it is on, not the clip\'s mean', () => {
    const w = at();
    const n = ACTION_CLIPS.standToCrouch.frames;
    // made-up root keys: still for the first half of the keys, then 1 a key along -z (ahead)
    const keys = new Float32Array(2 * n);
    for (let i = 0; i < n; i++) keys[2 * i + 1] = -Math.max(0, i - Math.floor(n / 2));
    w.actionRoots = new Map([['seal_stand2crouch', keys]]);
    w.changeStance('crouch');
    const early = w.actionVelocity('standToCrouch', 0.05, false);
    expect(early).toEqual([0, 0]);
    const late = w.actionVelocity('standToCrouch', ACTION_SECONDS.standToCrouch * 0.9, false);
    expect(late[1]).toBeCloseTo(-n / ACTION_CLIPS.standToCrouch.playback, 6);   // 1 a key x keys / playback
    // backwards (getting up) the phase runs from the end and the motion turns round
    expect(w.actionVelocity('standToCrouch', 0.05, true)[1]).toBeCloseTo(n / ACTION_CLIPS.standToCrouch.playback, 6);
    let z = w.state.z;
    for (let i = 0; i < 10; i++) w.tick(STILL);
    expect(w.state.z).toBeCloseTo(z, 9);                            // the still half: no carry
    for (let i = 0; i < Math.ceil(ACTION_SECONDS.standToCrouch / TICK) - 12; i++) w.tick(STILL);
    expect(w.state.z).toBeLessThan(z - 5);                          // then carried ahead
    z = w.state.z;
  });

  it('with no root keys, each clip\'s mean travel stands in', () => {
    const w = at();
    const [x, z] = w.actionVelocity('crouchToProne', 0.2, false);
    const c = ACTION_CLIPS.crouchToProne;
    expect(x).toBeCloseTo(c.travel[0] / ACTION_SECONDS.crouchToProne, 9);
    expect(z).toBeCloseTo(c.travel[1] / ACTION_SECONDS.crouchToProne, 9);
  });
});

describe("the running jump's clips: the launch over the flight, the fall only past it, no stand at the landing (FUN_005af930)", () => {
  const plain = world([floor(-400, -400, 400, 400, 0)]);
  const at = (y = 0): Walker => {
    const w = new Walker(y === 0 ? plain : world([floor(-400, -400, 400, 400, y)]));
    w.place(0, y, 0);
    w.state.yaw = 0;                                                // facing -z
    return w;
  };
  /** The action or, with none, the ground state each tick: what the animator is handed. */
  const shown = (w: Walker): string => w.action?.name ?? `ground:${w.ground.state}`;

  it('a flat running jump holds Jump launch the whole flight and lands straight into the run', () => {
    const w = at();
    for (let i = 0; i < 60; i++) w.tick(FORWARD);
    expect(w.ground.state).toBe('stand');
    expect(w.jump()).toBe(true);
    const seq: string[] = [];
    while (w.airborne) { w.tick(FORWARD); seq.push(shown(w)); }
    for (let i = 0; i < 5; i++) { w.tick(FORWARD); seq.push(shown(w)); }
    const runs = seq.filter((x, i) => i === 0 || x !== seq[i - 1]);
    // the launch (2.21 s) outlasts the 0.75 s flight: no Jump fall; the landing tick poses the run it left in
    expect(runs).toEqual(['launch', 'ground:stand']);
    expect(ACTION_SECONDS.launch).toBeCloseTo(2.4 * (24 / 25) ** 2, 9);
    expect(w.landing?.clip).toBeNull();
  });

  it('a flight outlasting the launch gives way to Jump fall (FUN_0057e130 -> FUN_0057e050), then lands', () => {
    // a running jump off a 700-unit drop: the floor is only far under the take-off's edge
    const w = new Walker(world([floor(-400, -400, 400, -20, 0), floor(-400, -20, 400, 400, 700)]));
    w.place(0, 700, 60);
    w.state.yaw = 0;
    for (let i = 0; i < 60 && w.state.z > 0; i++) w.tick(FORWARD);
    expect(w.airborne).toBe(false);
    expect(w.jump()).toBe(true);
    const seq: string[] = [];
    let ticks = 0;
    while (w.airborne && ticks < 2000) { w.tick(FORWARD); seq.push(shown(w)); ticks++; }
    const runs = seq.filter((x, i) => i === 0 || x !== seq[i - 1]);
    expect(runs.slice(0, 2)).toEqual(['launch', 'fall']);
    expect(seq.indexOf('fall')).toBe(Math.ceil(ACTION_SECONDS.launch / TICK - 1e-6) - 1);
  });

  it('a walk-off still falls in Jump fall, and lands on the run with the stick held', () => {
    const w = new Walker(world([floor(-400, -400, 400, -20, 0), floor(-400, -20, 400, 400, 20)]));
    w.place(0, 20, 60);
    w.state.yaw = 0;
    const seq: string[] = [];
    for (let i = 0; i < 200; i++) { w.tick(FORWARD); seq.push(shown(w)); }
    const runs = seq.filter((x, i) => i === 0 || x !== seq[i - 1]);
    expect(runs).toEqual(['ground:stand', 'fall', 'ground:stand']);
  });
});

describe("round 4: the jump only from a looped play (FUN_0057e1b0's FUN_005551a0(entry+0x28, 0x40))", () => {
  const plain = world([floor(-400, -400, 400, 400, 0)]);
  const at = (): Walker => {
    const w = new Walker(plain);
    w.place(0, 0, 0);
    w.state.yaw = 0;
    return w;
  };

  it('refused through a soft landing past the lock, taken the tick the stick cuts it', () => {
    const w = at();
    for (let i = 0; i < 60; i++) w.tick(FORWARD);
    w.jump();
    while (w.airborne) w.tick(STILL);
    expect(w.action?.name).toBe('land');
    for (let i = 0; i < Math.ceil(JUMP_LOCK / TICK) + 1; i++) w.tick(STILL);
    expect(w.action?.name).toBe('land');                            // 0.632 s: still playing past the 0.4 s lock
    expect(w.jump()).toBe(false);                                   // seal_land_soft is not looped
    w.tick(FORWARD);                                                // NoInterrupt 0: the stick cuts it
    expect(w.action).toBeNull();
    expect(w.jump()).toBe(true);
  });

  it('refused through a stance transition and the standing jump; taken on the idle after', () => {
    const w = at();
    w.changeStance('crouch');
    expect(w.action?.name).toBe('standToCrouch');
    expect(w.jump()).toBe(false);
    for (let i = 0; i < Math.ceil(ACTION_SECONDS.standToCrouch / TICK) + 1; i++) w.tick(STILL);
    expect(w.action).toBeNull();
    expect(w.jump()).toBe(true);                                    // crouched: the standing jump
    expect(w.action?.name).toBe('jump');
    expect(w.jump()).toBe(false);
  });
});

describe('round 4: the rifle <-> pistol swap in the picker (FUN_005a64c0)', () => {
  const plain = world([floor(-400, -400, 400, 400, 0)]);
  const at = (): Walker => {
    const w = new Walker(plain);
    w.place(0, 0, 0);
    w.state.yaw = 0;
    return w;
  };

  it('still: the stance\'s full-body swap holds the mover, backwards to the rifle; the jump waits for it', () => {
    const w = at();
    expect(w.swapWeapon('pistol')).toEqual({ action: 'swapStand', overlay: false, reversed: false, seconds: ACTION_SECONDS.swapStand });
    expect(w.action?.name).toBe('swapStand');
    expect(w.jump()).toBe(false);
    expect(w.swapWeapon('rifle')).toBeNull();                        // one at a time
    for (let i = 0; i < Math.ceil(ACTION_SECONDS.swapStand / TICK) + 1; i++) w.tick(STILL);
    expect(w.action).toBeNull();
    expect(w.state.x).toBeCloseTo(0, 6);
    w.stance = 'crouch';
    expect(w.swapWeapon('rifle')).toMatchObject({ action: 'swapCrouch', reversed: true });
    expect(w.action?.reversed).toBe(true);
    const p = at();
    p.stance = 'prone';
    expect(p.swapWeapon('pistol')?.action).toBe('swapProne');
    expect(ACTION_SECONDS.swapStand).toBeCloseTo(1.32 * (31 / 32) ** 2, 9);
  });

  it('on the move (over 20 a second): the overlay over the locomotion, the run going on', () => {
    const w = at();
    for (let i = 0; i < 60; i++) w.tick(FORWARD);
    const pick = w.swapWeapon('pistol')!;
    expect(pick).toMatchObject({ action: null, overlay: true, reversed: false });
    expect(w.overlay?.clip).toBe('seal_mv_rifle2pistol');
    const z = w.state.z;
    for (let i = 0; i < 30; i++) w.tick(FORWARD);
    expect(w.action).toBeNull();
    expect(z - w.state.z).toBeGreaterThan(30);                       // still running
    for (let i = 0; i < Math.ceil(pick.seconds / TICK); i++) w.tick(FORWARD);
    expect(w.overlay).toBeNull();
  });

  it('the moving overlay runs on the second channel\'s clock: freed at playback x (n-1)/n = 1.257 s, not the one-shot\'s 1.197 (research 211 G2)', () => {
    // FUN_0028d170 (D:L134703-134737, research 150 s3.4): the key at t is t / playback x n, the node freed at the last
    // key, t = playback x (n-1)/n -- `seal_mv_rifle2pistol` 1.32 x 20/21.
    const w = at();
    for (let i = 0; i < 60; i++) w.tick(FORWARD);
    const pick = w.swapWeapon('pistol')!;
    expect(pick.seconds).toBeCloseTo(1.32 * (20 / 21), 9);
    expect(w.overlay!.seconds).toBeCloseTo(1.32 * (20 / 21), 9);
    let last = 0, ticks = 0;
    while (w.swapProgress() !== null && ticks < 200) { last = w.swapProgress()!.progress; w.tick(FORWARD); ticks++; }
    expect(ticks).toBe(Math.ceil((1.32 * (20 / 21)) / TICK - 1e-9));
    expect(last).toBeGreaterThan(0.98);                              // the progress reaches the last key, then the node is freed
  });

  it('refused in the 9x view or a scope (zoom 4 and up, Walker.scoped): FUN_005c4fd0 (research 201 s1, 211 G4)', () => {
    const w = at();
    w.scoped = true;
    expect(w.swapWeapon('pistol')).toBeNull();
    expect(w.action).toBeNull();
    for (let i = 0; i < 60; i++) w.tick(FORWARD);
    expect(w.swapWeapon('pistol')).toBeNull();                       // moving too: no overlay
    expect(w.overlay).toBeNull();
    w.scoped = false;
    for (let i = 0; i < 60; i++) w.tick(FORWARD);                   // the stick x 0.2 held it under 20 a second
    expect(w.swapWeapon('pistol')).toMatchObject({ overlay: true });
  });

  it("taken during a stance change, the new stance's clip in its place (206 s1.3 A27; the plan's PF-39)", () => {
    // FUN_005b4340(actor, 4) refuses the landings, the get-ups and the dive, not the stance transitions (201 s1). The stance
    // word is the new one at once (`changeStance`, FUN_005817d0 and kin), so the selector reads it; which clip the game
    // plays there is owed to capture C3 (research 211 s7).
    for (const [from, to, swap] of [['stand', 'crouch', 'swapCrouch'], ['crouch', 'stand', 'swapStand'], ['crouch', 'prone', 'swapProne'], ['stand', 'prone', 'swapProne']] as const) {
      const w = at();
      w.stance = from;
      w.changeStance(to);
      expect(w.action?.name, `${from} -> ${to}`).toMatch(/To/);
      expect(w.swapWeapon('pistol'), `${from} -> ${to}`).toMatchObject({ action: swap, overlay: false });
      expect(w.action?.name).toBe(swap);
      expect(w.stance).toBe(to);
    }
    const j = at();
    expect(j.jump()).toBe(true);
    expect(j.swapWeapon('pistol')).toBeNull();                       // the jump still refuses it
  });

  it('the standing swap cut by the stick goes on as the overlay at its phase (FUN_00550ef0 418226-418245)', () => {
    const w = at();
    w.swapWeapon('pistol');
    for (let i = 0; i < 20; i++) w.tick(STILL);
    const t = w.action!.t;
    w.tick(FORWARD);
    expect(w.action).toBeNull();
    expect(w.overlay?.clip).toBe('seal_mv_rifle2pistol');
    expect(w.overlay!.t / w.overlay!.seconds).toBeCloseTo((t + TICK) / ACTION_SECONDS.swapStand, 1);
  });

  // PAR-80 (research 251 section 12.5, "PAR-80"): the swap is pushed before the driver on its press's own frame
  // (`FUN_00551ec0` D:L418611 -> `FUN_005dfc80` D:L494228 -> `FUN_005c1660` D:L476734 -> `FUN_005a64c0`), and its
  // key's callback is run and cleared by the advance long before the stop (`FUN_0057a330` D:L438995-439003), so
  // `FUN_00582540` answers 1 on the end test's first pass (D:L443131-443132): the driver pops it there, on the push's
  // own clock plus half a frame's step -- one command before its last key. The commands count from the press's own
  // (the swap started, then the tick: the room's `MoverSim.prepare` then `Walker.tick`).
  const SWAP_POPS = { swapStand: 74, swapCrouch: 54, swapProne: 102 } as const;
  const stanceOf = (a: keyof typeof SWAP_POPS): Stance =>
    (a === 'swapProne' ? 'prone' : a === 'swapCrouch' ? 'crouch' : 'stand');

  it("PAR-80: a still swap left alone comes off complete on the end test's first pass, a command before its last key, both ways", () => {
    for (const [action, pop] of Object.entries(SWAP_POPS) as [keyof typeof SWAP_POPS, number][]) {
      expect(Math.ceil(ACTION_SECONDS[action] / TICK - 1e-9), `${action}: the last key's command`).toBe(pop + 1);
      for (const to of ['pistol', 'rifle'] as const) {
        const w = at();
        w.stance = stanceOf(action);
        const ends: ActionEnd[] = [];
        w.onActionEnd((e) => ends.push(e));
        expect(w.swapWeapon(to)?.action).toBe(action);
        for (let i = 1; i < pop; i++) w.tick(STILL);
        expect(w.action?.name, `${action} to the ${to}: on command ${pop - 1}`).toBe(action);
        w.tick(STILL);
        expect(w.action, `${action} to the ${to}: off on command ${pop}`).toBeNull();
        expect(ends[ends.length - 1]).toMatchObject({ reason: 'complete', body: { name: action } });
        expect(w.overlay).toBeNull();
        expect(w.swapProgress()).toBeNull();
      }
    }
  });

  it("PAR-80: the end test on the push's own clock -- t / (P e) + G / (2 P e) > e (FUN_0028c6e0 D:L134283-134308)", () => {
    for (const [action, pop] of Object.entries(SWAP_POPS) as [keyof typeof SWAP_POPS, number][]) {
      const c = ACTION_CLIPS[action];
      expect(swapPlayedOut((pop - 1) * TICK, c.playback, c.frames), `${action} ${pop - 1}`).toBe(false);
      expect(swapPlayedOut(pop * TICK, c.playback, c.frames), `${action} ${pop}`).toBe(true);
      const e = (c.frames - 1) / c.frames;
      expect(swapPlayedOut(c.playback * e * e - GAME_FRAME_DT / 2 + 1e-6, c.playback, c.frames)).toBe(true);
      expect(swapPlayedOut(c.playback * e * e - GAME_FRAME_DT / 2 - 1e-6, c.playback, c.frames)).toBe(false);
    }
  });

  it("PAR-80: the stick on the standing swap's end tick cuts it there (0x35 asks no end refusal, FUN_00550ef0 D:L418181): the moving overlay goes on, both ways", () => {
    for (const to of ['pistol', 'rifle'] as const) {
      const w = at();
      const ends: ActionEnd[] = [];
      w.onActionEnd((e) => ends.push(e));
      w.swapWeapon(to);
      for (let i = 1; i < SWAP_POPS.swapStand; i++) w.tick(STILL);
      const t = w.action!.t;
      w.tick(FORWARD);
      expect(w.action, to).toBeNull();
      expect(ends[ends.length - 1]).toMatchObject({ reason: 'cut', body: { name: 'swapStand' } });
      expect(w.overlay).toMatchObject({ clip: 'seal_mv_rifle2pistol', reversed: to === 'rifle' });
      expect(w.overlay!.t).toBeCloseTo(Math.min(1, (t + TICK) / ACTION_SECONDS.swapStand) * SWAP_OVERLAY_SECONDS, 9);
      expect(w.swapProgress()).toMatchObject({ action: null, overlay: true });
    }
  });

  it("PAR-80: the turn past 0.1 on the end tick cuts it too; the room's backlog (elapse) reads no stick and ends it complete", () => {
    const w = at();
    w.swapWeapon('pistol');
    for (let i = 1; i < SWAP_POPS.swapStand; i++) w.tick(STILL);
    w.turn = SEAL_TUNING.turnMaxRate * 0.2;
    w.tick(STILL);
    expect(w.action).toBeNull();
    expect(w.overlay?.clip).toBe('seal_mv_rifle2pistol');
    const b = at();
    const ends: ActionEnd[] = [];
    b.onActionEnd((e) => ends.push(e));
    b.swapWeapon('pistol');
    b.elapse(SWAP_POPS.swapStand - 1);
    expect(b.action?.name).toBe('swapStand');
    b.elapse(1);
    expect(b.action).toBeNull();
    expect(ends[ends.length - 1]).toMatchObject({ reason: 'complete' });
    expect(b.overlay).toBeNull();
  });

  it("PAR-80: the crouched and prone swaps take the common path -- never cut (their NoInterrupt bare), off complete on their end tick with the stick held", () => {
    for (const action of ['swapCrouch', 'swapProne'] as const) {
      const w = at();
      w.stance = stanceOf(action);
      const ends: ActionEnd[] = [];
      w.onActionEnd((e) => ends.push(e));
      w.swapWeapon('pistol');
      for (let i = 1; i < SWAP_POPS[action]; i++) w.tick(FORWARD);
      expect(w.action?.name, action).toBe(action);
      w.tick(FORWARD);
      expect(w.action, action).toBeNull();
      expect(ends[ends.length - 1]).toMatchObject({ reason: 'complete', body: { name: action } });
      expect(w.overlay).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The owner's 2026-09-29 report: a running jump up a slope went through the ground (web research 86 section 6.3).

/** The highest surface the probe has over (x, z): the slope's top where a ramp stands over a lower floor. */
const topAt = (grid: Grid, x: number, z: number): number => Math.max(...probeGround(grid, x, z).map((h) => h.y));

/** A walker on `grid` driven as the page drives it: the traversal's tick and `FUN_005b56c0`'s uphill factor. */
function driven(grid: Grid, polys: readonly WorldPoly[]): Walker {
  const w = new Walker(grid);
  w.driver = new Traversal(grid, polys);
  return w;
}

/**
 * Runs the mover from where it stands toward (tx, tz) until `jumpWhen` says so, jumps, and flies it to a landing.
 * Each tick from the impulse on (the 0.1 s wind-up sinks the feet in the game too: FUN_0059ad30 lands nothing while
 * `actor+0x1360` runs) the feet must stand at or over the slope's top under them. Returns the flight's lowest margin.
 */
function jumpUp(w: Walker, grid: Grid, tx: number, tz: number, jumpWhen: (w: Walker) => boolean): { worst: number; landed: boolean } {
  w.state.yaw = facing(w.state.x, w.state.z, tx, tz);
  for (let i = 0; i < 600 && !jumpWhen(w); i++) w.tick(FORWARD);
  expect(jumpWhen(w), `never reached the take-off, at (${w.state.x.toFixed(1)}, ${w.state.y.toFixed(1)}, ${w.state.z.toFixed(1)})`).toBe(true);
  expect(w.jump(), `jump refused at (${w.state.x.toFixed(1)}, ${w.state.z.toFixed(1)})`).toBe(true);
  let worst = Infinity, ticks = 0;
  // the wind-up's ticks: those before the one that runs the impulse's game frame (frame 3, tick 7: PF-03)
  const windUp = Math.ceil((Math.ceil(JUMP_DELAY / GAME_FRAME_DT) * GAME_FRAME_DT - 1e-9) / TICK) - 1;
  while (w.airborne && ticks < 240) {
    w.tick(FORWARD);
    ticks++;
    if (ticks > windUp) worst = Math.min(worst, w.state.y - topAt(grid, w.state.x, w.state.z));
  }
  return { worst, landed: !w.airborne };
}

describe('a running jump up a slope lands on it, never under it (owner 2026-09-29; FUN_0059ad30, FUN_0059b440)', () => {
  /** A ramp rising along +x from x 0 at `degrees`, over a flat floor at 0 that runs on under it (as Frostfire's). */
  const ramp = (degrees: number): WorldPoly[] => {
    const k = Math.tan(degrees * Math.PI / 180);
    const slope: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/ramp', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([0, 0, -200, 190, 190 * k, -200, 190, 190 * k, 200, 0, 0, 200]),
    };
    return [floor(-200, -200, 200, 200, 0), slope];
  };

  for (const degrees of [15, 26.6, 40, 48]) {
    it(`a ${degrees}-degree ramp: the flight never dips under it, and the landing is on it`, () => {
      const polys = ramp(degrees), grid = world(polys);
      const w = driven(grid, polys);
      w.place(-60, 0, 0);
      const r = jumpUp(w, grid, 200, 0, (m) => m.state.x > 20 && Math.hypot(m.state.vx, m.state.vz) >= RUNNING_JUMP_SPEED);
      expect(r.landed).toBe(true);
      expect(r.worst).toBeGreaterThanOrEqual(-1e-6);
      expect(w.state.y).toBeCloseTo(topAt(grid, w.state.x, w.state.z), 6);   // on the ramp, not the floor under it
      expect(w.state.y).toBeGreaterThan(5);
    });
  }

  it("taken off the flat at 65 just short of a 26.6-degree ramp's foot: the ramp rising under the flight is met, not passed", () => {
    const polys = ramp(26.6), grid = world(polys);
    const w = driven(grid, polys);
    w.place(-100, 0, 0);
    const r = jumpUp(w, grid, 200, 0, (m) => m.state.x > -3);
    expect(r.landed).toBe(true);
    expect(r.worst).toBeGreaterThanOrEqual(-1e-6);
    expect(w.state.y).toBeCloseTo(topAt(grid, w.state.x, w.state.z), 6);
    expect(w.state.y).toBeGreaterThan(5);
  });

  it('rising into the ground keeps the rise (FUN_0059b440 zeroes only a fall): no landing until the feet come down', () => {
    const polys = ramp(26.6), grid = world(polys);
    const w = driven(grid, polys);
    w.place(-100, 0, 0);
    w.state.yaw = facing(-100, 0, 200, 0);
    for (let i = 0; i < 600 && w.state.x < 10; i++) w.tick(FORWARD);
    expect(w.jump()).toBe(true);
    let rose = false, lastVy = 0;
    while (w.airborne) { w.tick(FORWARD); if (w.state.vy > 0) rose = true; if (w.airborne) lastVy = w.state.vy; }
    expect(rose).toBe(true);
    expect(lastVy).toBeLessThan(0);                                          // the landing is on a fall
    expect(w.landing!.speed).toBeGreaterThan(0);
  });
});

describe.skipIf(!MP2)(`a running jump up Frostfire's rail ramp${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  // LATER 682 (closed 2026-11-04): under the weapon line the ramp's own floor is stored about 23 ahead
  // (`WEAPON_LINE_POLYGON_SET_PLACEHOLDER`), and the r0001 reading refused the running jump with a stored contact; the
  // r0004 jump-near-wall capture proved the running jump reads no contact (`JUMP_CONTACT_PROVEN` 'none'), so it lands.
  it('rmp1 (x 680-705, z 891-975, y 100 -> 142 at 26.6 degrees, the 100 floor under it): lands on the ramp', async () => {
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB');
    const grid = groundGrid(map.ground!);
    for (const bare of [true, false]) {                                     // with and without the uphill factor
      const w = bare ? new Walker(grid) : driven(grid, groundPolygons(map.ground!));
      expect(w.place(693, 100 + EYE_HEIGHT, 870)).toBe(true);
      expect(w.state.y).toBe(100);
      const r = jumpUp(w, grid, 693, 1000, (m) => m.state.z > 905);
      expect(r.landed).toBe(true);
      expect(r.worst).toBeGreaterThanOrEqual(-1e-6);
      expect(w.state.y).toBeGreaterThan(110);                                 // not the 100 floor under the ramp
      expect(w.state.y).toBeCloseTo(topAt(grid, w.state.x, w.state.z), 6);
    }
  });
});

const MP6 = fixture('RUN/MP6.ZDB');
describe.skipIf(!MP6)(`a running jump up MP6's hillside${MP6 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('g157 at z 1700 (x 1010 -> 1040, y 36 -> 59, about 39 degrees): the flight stays over the ground', async () => {
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP6.ZDB');
    const grid = groundGrid(map.ground!);
    for (const bare of [true, false]) {
      const w = bare ? new Walker(grid) : driven(grid, groundPolygons(map.ground!));
      expect(w.place(1012, 60, 1700)).toBe(true);
      const r = jumpUp(w, grid, 1100, 1700, (m) => Math.hypot(m.state.vx, m.state.vz) >= RUNNING_JUMP_SPEED);
      expect(r.landed).toBe(true);
      expect(r.worst).toBeGreaterThanOrEqual(-1e-6);
      expect(w.state.y).toBeCloseTo(topAt(grid, w.state.x, w.state.z), 6);
    }
  });
});

describe('an airborne column is entered on the ground\'s own pick (OWNER-5; FUN_005b0420 467037-467110, FUN_005b5d40 470163-470290)', () => {
  /** The feet before the tick in which the flight crosses z = `edge` going +z, and where the flight ends. */
  const crossing = (w: Walker, edge: number, jumpAt: number | null): { crossY: number | null; y: number; z: number; airborne: boolean } => {
    w.state.yaw = facing(w.state.x, w.state.z, w.state.x, 200);
    for (let i = 0; i < 600 && w.state.z < (jumpAt ?? Infinity) && !w.airborne; i++) w.tick(FORWARD);
    if (jumpAt !== null) expect(w.jump(), `jump refused at z ${w.state.z.toFixed(1)}`).toBe(true);
    let crossY: number | null = null;
    for (let i = 0; i < 400 && (w.airborne || i === 0); i++) {
      const before = w.state.y;                                              // the feet as the tick found them
      w.tick(FORWARD);
      if (crossY === null && w.state.z > edge) crossY = before;
    }
    return { crossY, y: w.state.y, z: w.state.z, airborne: w.airborne };
  };

  it('a running jump at a wall-less ledge 12 high enters it with the feet low (the pick takes a floor up to 20 over them) and ends on it', () => {
    // SEGMENT-BODY (checkpoint 3): `floor` is wound with its own normal down (-y); the rising jump's records crossed the
    // ledge's floor from below -- its front -- as a ceiling, and the jam held the move across for a tick. A hull floor faces
    // up; this ledge's is wound so (the points reversed).
    const up = (p: WorldPoly): WorldPoly => ({ ...p, points: Float32Array.from([...p.points.slice(9, 12), ...p.points.slice(6, 9), ...p.points.slice(3, 6), ...p.points.slice(0, 3)]) });
    const w = new Walker(world([floor(-200, -200, 200, -20, 0), up(floor(-200, -20, 200, 200, 12))]));
    expect(w.place(0, PROBE_LIFT, -150)).toBe(true);
    const r = crossing(w, -20, -32);
    expect(r.crossY).not.toBeNull();
    // Entered before the feet were within step_height of the top: the column is the pick's, not the ground step's.
    expect(r.crossY!).toBeLessThan(12 - SEAL_TUNING.stepHeight);
    expect(r.airborne).toBe(false);
    expect(r.z).toBeGreaterThan(-20);
    expect(r.y).toBe(12);
  });

  it('walking off into a narrow cut, a far side 12 over the edge is taken (lifted onto it); one 25 over is refused', () => {
    // floor 0 to z -20, a cut 4 wide and 60 deep, then the far side at `top`
    const cut = (top: number): Walker => {
      const w = new Walker(world([floor(-200, -200, 200, -20, 0), floor(-200, -20, 200, -16, -60), floor(-200, -16, 200, 200, top)]));
      expect(w.place(0, PROBE_LIFT, -60)).toBe(true);
      return w;
    };
    const low = crossing(cut(12), -16, null);
    expect(low.crossY!).toBeLessThan(12 - SEAL_TUNING.stepHeight);           // the old 6.5 allowance refused this
    expect(low.y).toBe(12);
    expect(low.z).toBeGreaterThan(-16);
    const high = cut(25);
    const r = crossing(high, -16, null);
    expect(r.crossY).toBeNull();                                            // more than 20 over the feet: the miss
    expect(r.y).toBe(-60);                                                  // down the cut
    expect(r.z).toBeLessThanOrEqual(-16);
  });

  it('at the map\'s edge (no floor beyond) a running jump is pinned: it never leaves the floor\'s x/z and lands back on it', () => {
    const w = new Walker(world([floor(-200, -200, 200, -20, 0)]));
    expect(w.place(0, PROBE_LIFT, -150)).toBe(true);
    const r = crossing(w, -20, -32);
    expect(r.crossY).toBeNull();
    expect(r.z).toBeLessThanOrEqual(-20);
    expect(r.airborne).toBe(false);
    expect(r.y).toBe(0);
  });
});

describe('a spawn stands on the tick\'s pick: from the feet + STEP_PROBE_LIFT_READING, not the eye (PL-2; FUN_002b8100 158793, FUN_005b5d40)', () => {
  /** The ground at 0 everywhere and a crate 12 high over x, z -50..50: two floors over the spawn. */
  const CRATE: GroundData = packGround(
    { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    [floor(-200, -200, 200, 200, 0), floor(-50, -50, 50, 50, 12)],
    [{ modelName: 'worldmodel', path: 'worldmodel/ground', first: 0, count: 1 }, { modelName: 'worldmodel', path: 'worldmodel/crate', first: 1, count: 1 }],
  );
  const made: WalkMode[] = [];
  afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });
  const mode = (spawn: [number, number, number] | null): { fly: FlyCamera; mode: WalkMode } => {
    const fly = new FlyCamera(canvas());
    fly.setScale(0.1);
    const m = new WalkMode(fly, () => undefined);
    m.setGround(CRATE, spawn);
    made.push(m);
    return { fly, mode: m };
  };

  it('the server\'s respawn at feet 0 under the crate stands on the ground, not on the crate 12 over it', () => {
    const { mode: m } = mode(null);
    expect(m.respawn([0, 0, 0], 0)).toBe(true);
    expect(m.snapshot()).not.toBeNull();
    expect(m['walker']!.state.y).toBe(0);
  });

  it('the spawn fallback (no floor under the camera) does the same', () => {
    const { fly, mode: m } = mode([0, 0, 0]);
    fly.setPose({ x: 900, y: 80, z: 900, yaw: 0, pitch: 0 });           // off the grid: no floor under the camera
    expect(m.setMode('walk')).toBe(true);
    expect(m['walker']!.state.y).toBe(0);
  });

  // One probe origin per tick (FUN_005b0840 computes it, FUN_005b5d40 selects with it; socom_pc research 23 sections
  // 1.1-1.2): the spawn, the grounded step and the airborne fall all pick from the feet + STEP_PROBE_LIFT_READING, so a
  // kerb 6.25 over the feet with a lower floor under the line is the spawn's floor too, not a 6.25 lift on the first
  // walking tick (PL-2 in the 6-6.5 band; research 101 A7).
  const KERB: GroundData = packGround(
    { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    [floor(-200, -200, 200, 200, 0), floor(-50, -50, 50, 50, 6.25)],
    [{ modelName: 'worldmodel', path: 'worldmodel/ground', first: 0, count: 1 }, { modelName: 'worldmodel', path: 'worldmodel/kerb', first: 1, count: 1 }],
  );

  it('the respawn at feet 0 under a kerb 6.25 up stands on the kerb, the floor the walking tick picks', () => {
    const m = new WalkMode(new FlyCamera(canvas()), () => undefined);
    m.setGround(KERB, null);
    made.push(m);
    expect(STEP_PROBE_LIFT_READING).toBe(5.5);
    expect(m.respawn([0, 0, 0], 0)).toBe(true);
    const w = m['walker']!;
    expect(w.state.y).toBe(6.25);
    w.tick(FORWARD);
    expect(w.state.y).toBe(6.25);                                   // no lift on the first walking tick
  });

  it('the airborne fall picks from the same origin: rising from 0 under the kerb, the feet meet the kerb', () => {
    const w = new Walker(groundGrid(KERB));
    expect(w.place(0, 4, 0)).toBe(true);                            // origin 4: the floor at 0 (window 5)
    expect(w.state.y).toBe(0);
    w.setAirborne(true, 1);
    w.tick(STILL);                                                  // no game frame yet: rising at 1, the feet ride the kerb
    expect(w.state.y).toBe(6.25);
    expect(w.airborne).toBe(true);
    w.tick(STILL); w.tick(STILL);                                   // tick 3 runs the first game frame: a fall, the landing
    expect(w.state.y).toBe(6.25);
    expect(w.airborne).toBe(false);
  });

  it('online, setDead reaches the mover; a respawn brings a live one', () => {
    const { mode: m } = mode(null);
    expect(m.respawn([0, 0, 0], 0)).toBe(true);
    m.setDead(true);
    expect(m['walker']!.dead).toBe(true);
    expect(m.respawn([0, 0, 0], 0)).toBe(true);
    expect(m['walker']!.dead).toBe(false);
    m.setDead(true);
    m.setDead(false);
    expect(m['walker']!.dead).toBe(false);
  });

  // NU-12 B1 (research 328 R328.1, §2, §4.2 D1-D2, §5 B1): the original's spawn rebuilds the body and makes a new camera
  // on it (`FUN_00599b60` D:L455663, `FUN_00299150` D:L455694). The walk counts its spawns for the body's play
  // (`./play` drops the animation at a change) and drops the last posed root, so the respawn's camera stands on the
  // stance's root -- not on the corpse's, crouch's or prone's left from the last life (`cameraTick`, `follow`).
  it('NU-12 B1: a respawn is counted (spawns) and drops the posed root: its camera stands where a fresh one does, not on the corpse\'s root', () => {
    const fresh = mode(null);
    expect(fresh.mode.spawns()).toBe(0);
    expect(fresh.mode.respawn([0, 0, 0], 0)).toBe(true);
    expect(fresh.mode.spawns()).toBe(1);
    const was = mode(null);
    expect(was.mode.respawn([0, 0, 0], 0)).toBe(true);
    was.mode.setPosedRoot(2);                                       // the corpse's root over its feet, from the last life
    expect(was.mode.respawn([0, 0, 0], 0)).toBe(true);
    expect(was.mode.spawns()).toBe(2);
    const a = fresh.fly.camera.position, b = was.fly.camera.position;
    expect([b.x, b.y, b.z]).toEqual([a.x, a.y, a.z]);
    expect(was.mode['posedRoot']).toBeNull();
  });
});

describe('the death drops a move (review 2, M-4: FUN_005af590 L466696-466699, FUN_005a5da0 on state 8)', () => {
  /** research 86's ladder wall: the ground at 0 in front (z > 0), a deck at 40 behind, the ladder on the face at z 0.2. */
  const quad = (pts: number[], ditype: number, appflags = 0, path = 'worldmodel/q'): WorldPoly => ({
    modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, appflags, points: Float32Array.from(pts),
  });
  const polys = [
    floor(-100, 0, 100, 100, 0),
    floor(-100, -100, 100, 0, 40),
    quad([-100, 0, 0, 100, 0, 0, 100, 40, 0, -100, 40, 0], 2),
    quad([-3, 0, 0.2, 3, 0, 0.2, 3, 40, 0.2, -3, 40, 0.2], 2, 2, 'worldmodel/lad/ladder'),
    quad([3, 40, 0.2, -3, 40, 0.2, -3, 50, 0.2, 3, 50, 0.2], 2, 2, 'worldmodel/lad/ladder'),
  ];
  const LADDER: GroundData = packGround(
    { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    polys, polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 })),
  );
  const made: WalkMode[] = [];
  afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });

  it('a SEAL killed on a ladder leaves it: the move ends, the corpse falls to the floor and lies there', () => {
    const fly = new FlyCamera(canvas());
    fly.setScale(0.1);
    const m = new WalkMode(fly, () => undefined);
    made.push(m);
    m.setGround(LADDER, null);
    m.useTraversal((w, g) => new Traversal(w.grid, groundPolygons(g)));
    expect(m.respawn([0, 0, 20], 0)).toBe(true);                     // facing -z, at the ladder's foot
    const w = m['walker']!, t = m.traversal() as Traversal;
    for (let i = 0; i < 600 && t.state().kind !== 'ladder'; i++) w.tick(FORWARD);
    expect(t.state().kind).toBe('ladder');
    for (let i = 0; i < 120; i++) w.tick(FORWARD);                   // two seconds up the rungs
    expect(w.state.y).toBeGreaterThan(10);
    m.setLocked(true);
    m.setDead(true);
    expect(t.active).toBe(false);
    for (let i = 0; i < 180; i++) w.tick(STILL);
    expect(t.active).toBe(false);
    expect(w.airborne).toBe(false);
    expect(w.state.y).toBe(0);                                       // on the ground at the ladder's foot, not on the rungs
  });

  it('a death with no move leaves the mover as it is: a knocked corpse still falls in its knock', () => {
    const fly = new FlyCamera(canvas());
    const m = new WalkMode(fly, () => undefined);
    made.push(m);
    m.setGround(LADDER, null);
    m.useTraversal((w, g) => new Traversal(w.grid, groundPolygons(g)));
    expect(m.respawn([0, 0, 60], 0)).toBe(true);
    const w = m['walker']!;
    w.knock([0, 40, 5], 'fallBackwards');
    m.setDead(true);
    expect(w.action?.name).toBe('fallBackwards');
    expect(w.airborne).toBe(true);
  });
});

describe('the hook\'s setCamera kept on foot (review 2, m-27: Play without the fly toggle)', () => {
  const made: WalkMode[] = [];
  afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });
  const walking = (): { fly: FlyCamera; mode: WalkMode } => {
    const fly = new FlyCamera(canvas());
    fly.setScale(0.1);
    const m = new WalkMode(fly, () => undefined);
    made.push(m);
    m.setGround(GROUND, [150, 0, 150]);
    fly.setPose({ x: 150, y: 40, z: 150 });
    expect(m.setMode('walk')).toBe(true);
    return { fly, mode: m };
  };

  it('kept on foot, a pose with no floor under it stands the mover at the spawn\'s feet: the walk is never left', () => {
    const { mode: m } = walking();
    m.setCamera({ x: 900, y: 60, z: 900 }, true);
    expect(m.mode()).toBe('walk');
    expect(m.feet()).toEqual([150, 0, 150]);
  });

  it('not kept on foot (the fly toggle, devmode), the same pose is honoured in fly', () => {
    const { fly, mode: m } = walking();
    m.setCamera({ x: 900, y: 60, z: 900 }, false);
    expect(m.mode()).toBe('fly');
    expect(fly.pose()).toMatchObject({ x: 900, y: 60, z: 900 });
  });
});

/**
 * MATCH-FIX-2: the page's own body flinches (research 91 section 21, 2026-10-02 addition). The game plays the flinch on
 * the victim's own actor (`FUN_005a54d0` L461401-461405 -> `FUN_005a2690` -> `FUN_00588bc0`, L460019) before it sends
 * it; the page's own body takes it as it takes its death clip (`setDeathPose`): in place of the mover's play, over the
 * ground play only (FLINCH_GATE_READING), until it has run; the death clip wins.
 */
describe('the page\'s own flinch on its body (walk.setFlinchPose, as setDeathPose)', () => {
  const made: WalkMode[] = [];
  afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });
  const walking = (): WalkMode => {
    const fly = new FlyCamera(canvas());
    fly.setScale(0.1);
    const m = new WalkMode(fly, () => undefined);
    made.push(m);
    m.setGround(GROUND, [150, 0, 150]);
    fly.setPose({ x: 150, y: 40, z: 150 });
    expect(m.setMode('walk')).toBe(true);
    return m;
  };
  const pose = (clip: string, frame = 3) => ({ clip, frame, loop: false, rootY: null });

  it('over the ground play: the clip drawn in the mover\'s place while it runs, the body\'s own once it has run', () => {
    const m = walking();
    let left: ReturnType<typeof pose> | null = pose('seal_flinch_rarm');
    m.setFlinchPose(() => left);
    expect(m.snapshot()!.traversal).toEqual(pose('seal_flinch_rarm'));
    left = null;                                                         // played through
    expect(m.snapshot()!.traversal).toBeNull();
    left = pose('seal_flinch_rarm');
    expect(m.snapshot()!.traversal).toBeNull();                          // gone: not drawn again
  });

  it('the death clip wins and takes the flinch off; the spawn (no death clip) ends one too', () => {
    const m = walking();
    m.setFlinchPose(() => pose('seal_flinch_rarm'));
    m.setDeathPose(() => pose('seal_death', 5));
    expect(m.snapshot()!.traversal).toEqual(pose('seal_death', 5));
    m.setDeathPose(null);
    expect(m.snapshot()!.traversal).toBeNull();
    m.setFlinchPose(() => pose('seal_flinch_rarm'));
    m.setDeathPose(null);                                                // the page's spawn, a close, a drop; a death with no clip
    expect(m.snapshot()!.traversal).toBeNull();
  });

  it('over a mover action (a knock, a landing): not drawn, and dropped', () => {
    const m = walking();
    m.setFlinchPose(() => pose('seal_flinch_rarm'));
    m['walker']!.knock([0, 40, 5], 'fallBackwards');
    const s = m.snapshot()!;
    expect(s.action?.name).toBe('fallBackwards');
    expect(s.traversal).toBeNull();
    expect(m['flinchPose']).toBeNull();                                  // dropped: not drawn once the action is done
  });
});

/**
 * PF-17 (ruling PF.R36; research 194 A02, 218 s1): the page's `Fire.source.ready` half -- `WalkMode.fireAllowed()` reads
 * `./net/fireCapability` on the page's own mover, with the table `./play` hands over (`setMotionTable`), as the room
 * records it at the command (`roomCapability.test.ts`).
 */
describe('the page\'s fire permission from its own mover (PF-17, WalkMode.fireAllowed)', () => {
  const made: WalkMode[] = [];
  afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });
  const walking = (): WalkMode => {
    const fly = new FlyCamera(canvas());
    fly.setScale(0.1);
    const m = new WalkMode(fly, () => undefined);
    made.push(m);
    m.setGround(GROUND, [150, 0, 150]);
    fly.setPose({ x: 150, y: 40, z: 150 });
    expect(m.setMode('walk')).toBe(true);
    return m;
  };

  it('WalkMode.fireAllowed refuses through stand -> prone and opens past crouch -> prone\'s 0.8, from the table play hands over', () => {
    const m = walking();
    for (let i = 0; i < 10; i++) m.frame(TICK);
    expect(m.fireAllowed()).toBe(true);
    m.setMotionTable(readMotionTable(GATE_MOTION_RECORDS));
    m.setStance('prone');
    m.frame(TICK);
    expect(m['walker']!.action?.name).toBe('standToProne');
    expect(m.fireAllowed()).toBe(false);
    m.setMotionTable(null);                                            // no table: nothing to refuse by
    expect(m.fireAllowed()).toBe(true);
    m.setMotionTable(readMotionTable(GATE_MOTION_RECORDS));
    for (let i = 0; i < 120 && m['walker']!.action; i++) { expect(m.fireAllowed()).toBe(false); m.frame(TICK); }
    m.setStance('crouch');
    for (let i = 0; i < 120 && m['walker']!.action; i++) m.frame(TICK);
    m.setStance('prone');
    m.frame(TICK);
    expect(m['walker']!.action?.name).toBe('crouchToProne');
    const seen: boolean[] = [];
    for (let i = 0; i < 120 && m['walker']!.action; i++) { seen.push(m.fireAllowed()); m.frame(TICK); }
    const open = seen.indexOf(true);
    const c = ACTION_CLIPS.crouchToProne;
    // the first tick open is the first past 0.8 of the stack's clock: (k + 1) TICK > 0.8 x playback x (n - 1) / n
    expect(open).toBe(Math.floor((0.8 * c.playback * ((c.frames - 1) / c.frames)) / TICK));
    expect(seen.slice(open).every(Boolean)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// PF-15 (web sprint 28; research 217 s1): FUN_00552ec0's stance-change gates (D:L418914-419025) on the shared mover.

describe("the stance-change gates (PF-15): FUN_00552ec0, FUN_0054d620 and FUN_0057efe0's two tops", () => {
  /** A horizontal roof over the origin at `y` (`m_ditype` 2: no floor to stand on, no wall; the headroom ray meets it). */
  const roof = (y: number): WorldPoly => ({ ...floor(-50, -50, 50, 50, y), ditype: 2 });
  /** A SEAL in `stance` at the origin of a floor under `extra`, facing +x. */
  const body = (stance: Stance, extra: WorldPoly[] = []): Walker => {
    const w = new Walker(world([floor(-200, -200, 200, 200, 0), ...extra]));
    w.place(0, 2, 0);
    expect(w.state.y).toBe(0);
    w.state.yaw = facing(0, 0, 100, 0);
    w.stance = stance;
    return w;
  };
  const press = (w: Walker, to: Stance): Stance => {
    w.changeStance(to);
    for (let i = 0; i < 90; i++) w.tick(STILL);
    return w.stance;
  };

  it('a 10-unit roof over a crouched SEAL refuses the stand: the ray from the idle hips + 2 (7.504) to the feet + 19 meets it (FUN_0057efe0 D:L441190-441245; HEADROOM_HIPS_READING)', () => {
    expect(HEADROOM_HIPS_READING).toBe('idle');
    expect(press(body('crouch', [roof(10)]), 'stand')).toBe('crouch');       // refused: the SEAL stays crouched
    expect(press(body('crouch', [roof(18.9)]), 'stand')).toBe('crouch');     // under the feet + 19 (D:L441214)
    expect(press(body('crouch', [roof(19.5)]), 'stand')).toBe('stand');      // over it: clear
    expect(press(body('crouch', [roof(7.6)]), 'stand')).toBe('crouch');      // just over the foot, 5.504 + 2 (D:L441218)
    expect(press(body('crouch', [roof(7.4)]), 'stand')).toBe('stand');       // under the foot: the ray never meets it
    expect(press(body('crouch'), 'stand')).toBe('stand');                    // open sky
  });

  it('a 16-unit roof over a prone SEAL allows prone -> crouch (the ray 4.168 to the feet + 12 is clear) and refuses the stand (to 19)', () => {
    expect(press(body('prone', [roof(16)]), 'crouch')).toBe('crouch');       // FUN_0057efe0(actor, 1): to the feet + 12 (D:L441210)
    expect(press(body('prone', [roof(16)]), 'stand')).toBe('prone');         // FUN_0057efe0(actor, 0): to the feet + 19
    expect(press(body('prone', [roof(13)]), 'crouch')).toBe('crouch');       // 13 is over the crouch's top
    expect(press(body('prone', [roof(11.5)]), 'crouch')).toBe('prone');      // under it: refused, the SEAL stays down
    expect(press(body('prone', [roof(4.3)]), 'crouch')).toBe('prone');       // just over the prone foot, 555/256 + 2
    expect(press(body('prone', [roof(4.0)]), 'crouch')).toBe('crouch');      // under it
  });

  it('crouch from stand is refused by an obstacle inside FUN_0054d620(|v| x 1.2, 7.0, 7.8); from prone the ahead reach is |v| + 0.5 (FUN_00552ec0 D:L418914-419025)', () => {
    // D:L418958-418964: |v| is the horizontal length of `actor+0x14b0`, the firepoint's offset from the feet (written by
    // FUN_005df450 -> FUN_005df930 D:L493889 off the `firepoint` node, 0x660410) -- not a speed. The segments are the
    // prone gate's (FUN_0054d620), cast at the feet + step_height x 1.2 (7.8).
    expect(CROUCH_GATE_READING).toEqual({ scale: 1.2, pronePad: 0.5, behind: 7, lift: 1.2 });
    expect(CROUCH_GATE_REACH_READING).toEqual({ stand: 9.03, prone: 14.59 });
    /** A bar across x at `x` from 7 to 9 over the floor: at the gate's height 7.8. */
    const bar = (x: number): WorldPoly => wallX(x, -150, 150, 7, 9);
    expect(press(body('stand', [bar(10.5)]), 'crouch')).toBe('stand');       // 10.5 ahead: inside 9.03 x 1.2 = 10.84
    expect(press(body('stand', [bar(11.2)]), 'crouch')).toBe('crouch');      // past it: taken
    expect(press(body('stand', [bar(-6.8)]), 'crouch')).toBe('stand');       // 6.8 behind: inside 7.0
    expect(press(body('stand', [bar(-7.3)]), 'crouch')).toBe('crouch');
    expect(press(body('stand', [wallX(6, -150, 150, 2, 3)]), 'crouch')).toBe('crouch');   // under the segments' 7.8
    expect(press(body('prone', [bar(15)]), 'crouch')).toBe('prone');         // from prone: 14.59 + 0.5 = 15.09 ahead
    expect(press(body('prone', [bar(15.3)]), 'crouch')).toBe('crouch');
    expect(press(body('stand', [bar(10.5)]), 'prone')).toBe('prone');        // the prone gate's segments run at 3.25: no bar
  });

  it('the dive into prone asks no gate: the press dives (FUN_00594cf0 D:L453386-453390 -> FUN_0057e540) before FUN_00552ec0 runs, so 11.2 ahead blocked still dives; a still press there is refused', () => {
    // The original's full press goes straight to the dive when FUN_00584b00 passes (D:L453386-453390); FUN_00552ec0 runs
    // only from the per-tick applier FUN_00552d60 (D:L418875), and asks nothing of a body mid-dive.
    const run = (wall: number | null): { w: Walker; t: Traversal; sim: MoverSim } => {
      const polys = [floor(-400, -400, 400, 400, 0), ...(wall === null ? [] : [wallX(wall, -150, 150, 0, 30)])];
      const grid = world(polys, 200);
      const w = new Walker(grid);
      w.place(0, 2, 0);
      const yaw = facing(0, 0, 100, 0);
      w.state.yaw = yaw;                                                      // placed facing its run, as a spawn sets it (LATER 14)
      const t = new Traversal(grid, polys);
      const sim = new MoverSim(w, t);
      let seq = 0;
      const cmd = (over: Partial<Command> = {}): Command => ({ seq: ++seq, forward: 1, right: 0, yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0, ...over });
      for (let i = 0; i < 12; i++) sim.apply(cmd());
      return { w, t, sim };
    };
    const scout = run(null);
    expect(Math.hypot(scout.w.state.vx, scout.w.state.vz)).toBeGreaterThanOrEqual(30);   // FUN_00584b00: the dive's speed
    const ahead = scout.w.state.x + 10;                                       // 10 ahead at the press: inside the prone gate's 11.2
    const { w, t, sim } = run(ahead);
    expect(w.state.x).toBeCloseTo(scout.w.state.x, 9);                        // the wall has not touched the run
    expect(w.proneRefused()).toBe(true);                                      // a prone press here would be refused...
    sim.apply({ seq: 13, forward: 1, right: 0, yaw: w.state.yaw, pitch: 0, turn: 0, buttons: Button.Stance, stance: STANCE_CODES.indexOf('prone'), weapon: 0 });
    expect(t.state().kind).toBe('dive');                                      // ...but the dive is taken
    expect(w.stance).toBe('prone');
    const still = body('stand', [wallX(10, -150, 150, 0, 30)]);               // a still SEAL 10 from the wall: no dive
    expect(press(still, 'prone')).toBe('stand');
  });
});

describe('PF-20: the page under a held peek (research 217 s3)', () => {
  const made: WalkMode[] = [];
  afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });

  it('two stance presses in one tick under a held peek are both the peek\'s: no transition, the stance kept, as the room takes the one press its command carries', () => {
    const m = new WalkMode(new FlyCamera(canvas()), () => undefined);
    made.push(m);
    m.setGround(GROUND, null);
    m.useTraversal((w, g) => new Traversal(w.grid, groundPolygons(g)));
    expect(m.respawn([150, 0, 150], 0)).toBe(true);
    const w = m['walker']!, t = m.traversal() as Traversal;
    m.lean(1);
    m.walkFor(60 * TICK, STILL);
    expect(t.peeking()).toBe(1);
    expect(m.setStance('crouch')).toBe(true);                        // pops the peek
    expect(m.setStance('prone')).toBe(true);                         // the same tick: still the peek's press
    expect(w.action).toBeNull();
    expect(w.stance).toBe('stand');
    m.walkFor(TICK, STILL);
    expect(w.stance).toBe('stand');
    expect(w.action).toBeNull();
    m.walkFor(TICK, STILL);
    expect(t.peeking()).toBe(1);                                     // the held lean peeks again
    expect(w.stance).toBe('stand');
  });
});

// PAR-74 and PAR-75 (research 251 section 12.5, "PAR-74"; PTW.R3 with roomHoldOverHold.test): the page's walk lays a
// placing's hold with its push's pass -- the bomb's plant before the driver (`./bombPage`'s own clip, `ownBombBody`), the
// claymore's and the PMN's after it (`./matchThrow`'s `throwStart`, the code's default) -- on one code: the command
// carries the code alone (`holdBits`), the room derives the pass from its own bomb (`room.ts`), and the page keeps it with
// the command for a run under the dance (PAR-37's `KeptCommand`, beside the period).
describe("PAR-74 and PAR-75: the walk's placing hold on its push's pass, the code alone on the wire", () => {
  const made: WalkMode[] = [];
  afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });
  const walking = () => {
    const fly = new FlyCamera(canvas());
    fly.setScale(0.1);
    const mode = new WalkMode(fly, () => undefined);
    mode.setGround(GROUND, [150, 0, 150]);
    made.push(mode);
    fly.setPose({ x: 150, y: 40, z: 150, yaw: 0, pitch: 0 });
    mode.setMode('walk');
    const sent: Command[] = [];
    mode.setNetTap((cmd) => { sent.push({ ...cmd, seq: sent.length + 1 } as Command); });
    for (let i = 0; i < 10; i++) mode.frame(TICK);
    return { mode, sent, w: mode['walker']! };
  };
  /** The commands, counted from the one that carries the hold, until the page's mover lets it go; and that command's buttons. */
  const offAt = (clip: string, pass?: 'before' | 'after'): { n: number; buttons: number; kept: unknown } => {
    const { mode, sent, w } = walking();
    expect(mode.hold(clip, undefined, pass)).toBe(true);
    const first = sent.length + 1;
    while (w.holding && sent.length < first + 600) mode.frame(TICK);
    const kept = (mode as unknown as { readonly kept: { seq: number; pass?: unknown }[] }).kept.find((k) => k.seq === first);
    return { n: sent.length - first + 1, buttons: sent[first - 1]!.buttons, kept: kept?.pass };
  };

  it("the bomb's plant off on the 156th command and the claymore's placing on the 158th, both commands carrying the one code; the pass kept with the command", () => {
    const plant = offAt('seal_place_claymore', 'before'), claymore = offAt('seal_place_claymore');
    expect(plant.n).toBe(156);
    expect(claymore.n).toBe(158);
    expect(plant.buttons).toBe(holdBits('seal_place_claymore'));
    expect(claymore.buttons).toBe(holdBits('seal_place_claymore'));
    expect(plant.kept).toBe('before');
    expect(claymore.kept).toBeUndefined();
  });

  it("PAR-75: C4's plant off on the 142nd command (was the 143rd, its last key)", () => {
    expect(offAt('seal_put_onwall').n).toBe(142);
    expect(offAt('seal_p_put_onwall').n).toBe(142);
  });
});

/**
 * LATER 96 (`./turretPage` `TURRET_CATCHUP_DRAW_DECAY_ADAPTATION`): the walker's drawn-only offset. Set after a tick, it is
 * drawn between the last two ticks' values as the feet are (`drawnFeet`); the simulated feet (`state`, `tickFeet`, the
 * eye's shot place) never read it; a placing clears it.
 */
describe('LATER 96: the walker drawOffset is drawn only', () => {
  it('drawnFeet adds the offset between the last two ticks; state and tickFeet unchanged; place clears it', () => {
    const w = new Walker(world([floor(-200, -200, 200, 200, 0)]));
    expect(w.place(10, 50, 20)).toBe(true);
    w.advance(1 / 60, STILL);
    expect(w.drawOffset).toEqual([0, 0, 0]);
    w.drawOffset = [3, 0, -4];                                  // set after the tick, as the turret page sets it
    const sim = w.tickFeet(), state = [w.state.x, w.state.y, w.state.z];
    w.advance(0.5 / 60, STILL);                                 // half a tick into the next: no tick runs
    expect(w.tickFeet()).toEqual(sim);
    const half = w.drawnFeet();
    expect(half[0]).toBeCloseTo(sim[0] + 1.5, 9);              // half way from the last tick's start (0) to the offset
    expect(half[2]).toBeCloseTo(sim[2] - 2, 9);
    w.advance(0.5 / 60, STILL);                                 // the next tick: the offset drawn whole from its start
    expect([w.state.x, w.state.y, w.state.z]).toEqual(state);
    const whole = w.drawnFeet(), feet = w.tickFeet();
    expect(whole[0]).toBeCloseTo(feet[0] + 3, 9);
    expect(whole[2]).toBeCloseTo(feet[2] - 4, 9);
    expect(w.place(10, 50, 20)).toBe(true);
    expect(w.drawOffset).toEqual([0, 0, 0]);
    expect(w.drawnFeet()).toEqual(w.tickFeet());
  });
});

/**
 * LATER 96 (the walk.ts `follow()` hunk, cleared by the merge controller): the drawn view on the drawn feet -- the drawn
 * feet less the simulated (`Walker.drawnFeet - tickFeet`: MISSION R8's height in the air, LATER 96's drawn-only offset)
 * moves the third-person view's eye, target and aim; the shot's eye (`placed`, `fireAim`) stays on the simulated feet.
 */
describe('LATER 96: the camera on the drawn feet (walk.ts follow())', () => {
  const made: WalkMode[] = [];
  afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });
  const TICKF = 1 / 60;
  const setup = (): { fly: FlyCamera; mode: WalkMode; w: Walker } => {
    const ground = packGround(
      { atomCount: 8192, posts: 16, cellDim: 1000, cellsX: 4, cellsZ: 4, originX: -2000, originZ: -2000 },
      [{ modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from([-2000, 0, -2000, 2000, 0, -2000, 2000, 0, 2000, -2000, 0, 2000]) }],
      [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }],
    );
    const fly = new FlyCamera(canvas());
    fly.setScale(0.1);
    const mode = new WalkMode(fly, () => undefined);
    made.push(mode);
    mode.setGround(ground, [0, 0, 0]);
    fly.setPose({ x: 0, y: 40, z: 0, yaw: 0, pitch: 0 });
    expect(mode.setMode('walk')).toBe(true);
    for (let i = 0; i < 30; i++) { fly.update(TICKF); mode.frame(TICKF); }
    return { fly, mode, w: (mode as unknown as { walker: Walker }).walker };
  };
  const eyeOf = (fly: FlyCamera): number[] => { const p = fly.pose(); return [p.x, p.y, p.z]; };

  it('no offset: on the ground the drawn view and the aim are the placed ones; in the air lifted by the drawn height alone (MISSION R8), value for value', () => {
    const { fly, mode, w } = setup();
    expect(mode.cameraState()!.mode).toBe('third');
    const placed = mode.cameraState()!;
    expect(eyeOf(fly)).toEqual(placed.eye);
    expect(mode.aim()).toEqual(mode.fireAim()!.far);
    expect(mode.lookAim()).toEqual(mode.fireAim());
    globalThis.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));   // a running jump, as gameFrameHybrid's
    for (let i = 0; i < 240; i++) { fly.update(TICKF / 4); mode.frame(TICKF / 4); }
    globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    expect(mode.jump()).toBe(true);
    let lifted = 0, aired = false;
    for (let i = 0; i < 800 && (!aired || mode.mover()!.airborne); i++) {
      fly.update(TICKF / 4); mode.frame(TICKF / 4);                    // part ticks: the drawn height between game frames
      aired ||= mode.mover()!.airborne;
      const p = mode.cameraState()!, dy = w.drawnFeet()[1] - w.tickFeet()[1];
      expect(w.drawOffset).toEqual([0, 0, 0]);
      const e = eyeOf(fly), aim = mode.aim()!, far = mode.fireAim()!.far, look = mode.lookAim()!;
      expect(e[0]).toBeCloseTo(p.eye[0], 6); expect(e[1]).toBeCloseTo(p.eye[1] + dy, 6); expect(e[2]).toBeCloseTo(p.eye[2], 6);
      expect(look.eye[0]).toBeCloseTo(e[0]!, 6); expect(look.eye[1]).toBeCloseTo(e[1]!, 6); expect(look.eye[2]).toBeCloseTo(e[2]!, 6);
      expect(look.far).toEqual(aim);
      if (dy === 0) expect(aim).toEqual(far);
      else { lifted++; expect(aim[0]).toBeCloseTo(far[0], 6); expect(aim[1]).toBeCloseTo(far[1] + dy, 6); expect(aim[2]).toBeCloseTo(far[2], 6); }
    }
    expect(lifted, 'drawn frames lifted in the air').toBeGreaterThan(10);
  });

  it('an offset: the drawn view and the aim move by it; the shot\'s eye stays on the simulated feet (a twin without the offset)', () => {
    const a = setup(), b = setup();
    a.w.drawOffset = [3, 0, -4];                                        // after a tick, as the turret page sets it
    for (const s of [a, b]) { s.fly.update(TICKF); s.mode.frame(TICKF); }
    expect(a.mode.fireAim()).toEqual(b.mode.fireAim());                  // the shot's eye and aim: the simulated feet's
    expect(a.mode.cameraState()!.eye).toEqual(b.mode.cameraState()!.eye);
    const d = [0, 1, 2].map((k) => a.w.drawnFeet()[k]! - a.w.tickFeet()[k]!);
    expect(d[0]).toBeCloseTo(3, 6); expect(d[2]).toBeCloseTo(-4, 6);
    const ea = eyeOf(a.fly), eb = eyeOf(b.fly);
    for (let k = 0; k < 3; k++) expect(ea[k]! - eb[k]!, `the drawn eye's axis ${k}`).toBeCloseTo(d[k]!, 6);
    const aa = a.mode.aim()!, ab = b.mode.aim()!;
    for (let k = 0; k < 3; k++) expect(aa[k]! - ab[k]!, `the aim's axis ${k}`).toBeCloseTo(d[k]!, 6);
    const look = a.mode.lookAim()!, shot = a.mode.fireAim()!;
    for (let k = 0; k < 3; k++) expect(look.eye[k]! - shot.eye[k]!, `the reticle eye's axis ${k}`).toBeCloseTo(d[k]!, 6);
    expect(look.far).toEqual(aa);
    expect(b.mode.lookAim()).toEqual(b.mode.fireAim());
  });
});

/**
 * LATER 220 (research 369 §1; reading, pending review): the prompts' common gate's terms the walker carries --
 * `Walker.gateTop`: a throw on top (term 4, D:L462620-462633), a reload clip on the stack (term 5, D:L462527-462546), a
 * swap's clip or its moving overlay (term 6, D:L462484-462497), a get-up (term 9, D:L462679); null: none of them.
 */
describe('LATER 220: the walker\'s terms of the prompts\' common gate (Walker.gateTop)', () => {
  const plain = world([floor(-400, -400, 400, 400, 0)]);
  const at = (): Walker => {
    const w = new Walker(plain);
    w.place(0, 0, 0);
    w.state.yaw = 0;
    for (let i = 0; i < 10; i++) w.tick(STILL);
    return w;
  };

  it('idle: none', () => {
    expect(at().gateTop()).toBeNull();
  });

  it("a throw's hold on top: 'throw'; a reload's: 'reload'", () => {
    const a = at();
    expect(a.hold('seal_throwgrenade')).toBe(true);
    expect(a.gateTop()).toBe('throw');
    const b = at();
    b.stance = 'crouch';
    for (let i = 0; i < 60; i++) b.tick(STILL);
    expect(b.hold('seal_crouch_reload')).toBe(true);
    expect(b.gateTop()).toBe('reload');
  });

  // The review's F1: term 4's words (D:L462622-462626, D:L495211-495237) are the rifle's throws, the tosses (the
  // pistol's two among them) and the rifle's peek tosses -- the pistol's throws and peek tosses are not among them, and
  // the port plays the rifle's clips for them (HOLD_OVER_THROW_HAND_READING): with the pistol in hand, no gate.
  it("the review's F1: with the pistol in hand a throw or a peek toss is no gate; its tosses are", () => {
    for (const [clip, rifle, pistol] of [
      // LATER 509's review F1: the pistol's crouched and prone throws have no record in the Seal anim set (research 85
      // §8.1 item 3: ELF 0x6617e0, 0x6617a0), so `FUN_0058c820` keeps the rifle's type (D:L448176-448189): "Crouch throw
      // grenade" / "Prone throw grenade" on top, both term 4 -- *was* null for the pistol here.
      ['seal_throwgrenade', 'throw', null], ['seal_crouch_throwgrenade', 'throw', 'throw'], ['seal_prone_throwgrenade', 'throw', 'throw'],
      ['seal_toss_rlean', 'throw', null], ['seal_toss_llean', 'throw', null],
      ['seal_tossgrenade', 'throw', 'throw'], ['seal_p_tossgrenade', 'throw', 'throw'], ['seal_prone_tossgrenade', 'throw', 'throw'],
    ] as const) {
      const w = at();
      if (/prone/.test(clip)) { w.stance = 'prone'; for (let i = 0; i < 120; i++) w.tick(STILL); }
      else if (/crouch/.test(clip)) { w.stance = 'crouch'; for (let i = 0; i < 60; i++) w.tick(STILL); }
      expect(w.hold(clip), clip).toBe(true);
      expect(w.gateTop(false), `${clip}, the rifle`).toBe(rifle);
      expect(w.gateTop(true), `${clip}, the pistol`).toBe(pistol);
    }
  });

  it("the swap's clip, still or moving: 'swap'", () => {
    const a = at();
    a.swapWeapon('pistol');
    expect(a.gateTop()).toBe('swap');
    const b = at();
    for (let i = 0; i < 60; i++) b.tick(FORWARD);
    b.swapWeapon('pistol');
    expect(b.swapProgress()).not.toBeNull();
    expect(b.gateTop()).toBe('swap');
  });
});

/**
 * LATER 220's review F2: a door's and a switch's ask name the page's last command (`lastSeq()`, `./doorPage`,
 * `./actionPage`), and the room judges the kit's lock and its press window on that command (`room.ts` `actionGateShut`):
 * the page asks its kit lock on the same command (the walk's `taps`), as LATER 221's mount does (`kitLocked(lastSeq())`).
 */
describe("LATER 220's review F2: WalkMode.actionGateShut asks the kit's lock on the command an ask names", () => {
  const made: WalkMode[] = [];
  afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });
  it('the lock asked on the walk\'s last command (taps), not the next', () => {
    const fly = new FlyCamera(canvas());
    fly.setScale(0.1);
    const mode = new WalkMode(fly, () => undefined);
    mode.setGround(GROUND, [150, 0, 150]);
    made.push(mode);
    fly.setPose({ x: 150, y: 40, z: 150, yaw: 0, pitch: 0 });
    mode.setMode('walk');
    mode.setNetTap(() => {});
    for (let i = 0; i < 10; i++) mode.frame(TICK);
    const asked: number[] = [];
    mode.setReloadLock((cmd) => { asked.push(cmd); return false; });
    expect(mode.actionGateShut()).toBe(false);
    expect(asked).toEqual([(mode as unknown as { taps: number }).taps]);
  });

  // LATER 220's last head: the climb's lock (`Walker.climbLock`, `FUN_005b4340(actor, 2)`) asks `FUN_005a7980` too
  // (D:L469412), whose second layer holds the stick's moving lower (D:L462494-462495): the climb refused under it.
  it("the stick's moving lower living on the next command locks the climb's offer (Walker.climbLock); ended, not", () => {
    const fly = new FlyCamera(canvas());
    fly.setScale(0.1);
    const mode = new WalkMode(fly, () => undefined);
    mode.setGround(GROUND, [150, 0, 150]);
    made.push(mode);
    fly.setPose({ x: 150, y: 40, z: 150, yaw: 0, pitch: 0 });
    mode.setMode('walk');
    mode.setNetTap(() => {});
    for (let i = 0; i < 10; i++) mode.frame(TICK);
    const w = mode['walker']!, taps = (mode as unknown as { taps: number }).taps;
    expect(w.climbLock?.()).toBe(false);
    (mode as unknown as { launcherMovingUntil: number }).launcherMovingUntil = taps + 2;
    expect(w.climbLock?.(), 'under the moving lower').toBe(true);
    (mode as unknown as { launcherMovingUntil: number }).launcherMovingUntil = taps + 1;
    expect(w.climbLock?.()).toBe(false);
  });

  // The first head's re-look (04's carried gap): the stick's moving lower on the next command shuts it (term 6 directly).
  it("the stick's moving lower living on the next command shuts the gate; ended, open", () => {
    const fly = new FlyCamera(canvas());
    fly.setScale(0.1);
    const mode = new WalkMode(fly, () => undefined);
    mode.setGround(GROUND, [150, 0, 150]);
    made.push(mode);
    fly.setPose({ x: 150, y: 40, z: 150, yaw: 0, pitch: 0 });
    mode.setMode('walk');
    mode.setNetTap(() => {});
    for (let i = 0; i < 10; i++) mode.frame(TICK);
    const taps = (mode as unknown as { taps: number }).taps;
    (mode as unknown as { launcherMovingUntil: number }).launcherMovingUntil = taps + 2;   // staged: lives on taps + 1
    expect(mode.actionGateShut()).toBe(true);
    (mode as unknown as { launcherMovingUntil: number }).launcherMovingUntil = taps + 1;
    expect(mode.actionGateShut()).toBe(false);
  });
});

/** LATER 509: the walker's hand hook (`Walker.pistolHand`) set by the page's walk from the firearm in hand (`weapon_`). */
describe('LATER 509: the walk sets the walker\'s hand (Walker.pistolHand)', () => {
  const made: WalkMode[] = [];
  afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });
  it('the rifle in hand: false; the sidearm: true', () => {
    const fly = new FlyCamera(canvas());
    fly.setScale(0.1);
    const mode = new WalkMode(fly, () => undefined);
    mode.setGround(GROUND, [150, 0, 150]);
    made.push(mode);
    fly.setPose({ x: 150, y: 40, z: 150, yaw: 0, pitch: 0 });
    mode.setMode('walk');
    mode.setNetTap(() => {});
    for (let i = 0; i < 10; i++) mode.frame(TICK);
    const w = mode['walker']!;
    expect(w.pistolHand?.()).toBe(false);
    (mode as unknown as { weapon_: 0 | 1 }).weapon_ = 1;
    expect(w.pistolHand?.()).toBe(true);
  });
});
