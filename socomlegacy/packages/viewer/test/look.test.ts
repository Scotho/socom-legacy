// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { GAME_FRAME_DT, SEAL_TUNING } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { PAD_DEAD_ZONE } from '../src/gamepad';
import {
  aimTwist, circle, deadZone, EXPLOSION_SHAKES, explosionShake, ViewBob, FULL_AXIS, LOOK_GAIN, LookLaw,
  MAX_PITCH_RATE, MAX_YAW_RATE, MOUSE_RADIANS_PER_COUNT, nudgePitch, PITCH_PER_YAW, pitchStickOf, RAMP_PER_SECOND, ramp,
  rampStep,
  runningLean, ScreenShake, stepPitch, stickCurve, throttle, viewOffset, zoomScale,
} from '../src/look';
import { WalkMode } from '../src/walk';
import { vi } from 'vitest';
import { HELD_RIFLE } from '@s2u/scene';
import { Accuracy } from '../src/accuracy';
import { ShotCone, type AimMover } from '../src/net/shotCone';
import { pitchStickInView } from '../src/look';
import { CONE_SCOPE_LEVEL_READING } from '../src/net/shotCone';
import { lookContextOf, lookScaleOf } from '../src/net/lookGate';
import { Button } from '../src/net/protocol';
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Zoom } from '../src/zoom';
import { DEFAULT_RIFLE } from '@s2u/scene';
import { TICK_HZ, type Command } from '../src/net/protocol';

const DEG = 180 / Math.PI;
const TICK = 1 / 60;
/** A pad byte (0..255, 0x80 at rest) as `FUN_002da930` reads it, with the viewer's sign: right and up positive. */
const byte = (b: number): number => -(127.5 - b) / 127.5;
/** The turn axis a byte settles to: the pad reader's curve x the look gain (research 22's `actor+0x23c`, unsigned). */
const settled = (b: number): number => Math.abs(stickCurve(byte(b), 0)[0] * LOOK_GAIN);

describe('the pad reader and the look gain against research 22\'s measured turn axis', () => {
  it('full push: 0.65 x 1.72 = 1.118, 128.1 deg/s at turn_maxrate 2', () => {
    expect(FULL_AXIS).toBeCloseTo(1.118, 3);
    expect(settled(255)).toBeCloseTo(1.118, 3);
    expect(settled(0)).toBeCloseTo(1.118, 3);
    expect(MAX_YAW_RATE * DEG).toBeCloseTo(128.11, 1);            // research 22's peak omega 128.11 deg/s
    expect(MAX_PITCH_RATE * DEG).toBeCloseTo(54.45, 1);
  });

  it('rx - 0x80 = +96 reads 0.879 and +-64 reads 0.080 / 0.072: the circle\'s sqrt 2 and the cube', () => {
    expect(settled(0x80 + 96)).toBeCloseTo(0.879, 3);                // both runs: -0.879
    expect(settled(0x80 + 64)).toBeCloseTo(0.080, 3);                // run 3: -0.080
    expect(settled(0x80 - 64)).toBeCloseTo(0.072, 3);                // both runs: +0.072
    expect(settled(0x80 - 48)).toBeCloseTo(0.0035, 3);               // run 3: +0.004 (run 2: 0)
    expect(settled(0x80 + 16)).toBe(0);                              // the dead zone
  });

  it('the dead zone is 0.3 a side and rescales to the rim; the circle is x sqrt 2 below full push', () => {
    expect(deadZone(0.29)).toBe(0);
    expect(deadZone(0.65)).toBeCloseTo(0.5, 9);
    expect(deadZone(-1)).toBe(-1);
    expect(circle(0.5, 0)).toEqual([Math.SQRT2 * 0.5, 0]);
    expect(circle(1, 0.5)).toEqual([1, 0.5 * Math.sqrt(1.5)]);        // one axis whole: sqrt(1 + minor / major)
    expect(circle(0.9, 0.9)).toEqual([1, 1]);
  });

  it('the throttle (off on the console) is linear to (0.9, 0.4), then to (1, 1)', () => {
    expect(throttle(0.45, SEAL_TUNING.turnThrottle)).toBeCloseTo(0.2, 9);
    expect(throttle(-0.95, SEAL_TUNING.turnThrottle)).toBeCloseTo(-0.7, 9);
  });
});

describe('the ramp: a push grows to full over 0.42 s and lets go at once', () => {
  it('the game frame\'s step at 525/15734 s is 0.0518, 1.553 a second (research 180 section 1.1; not 60 Hz\'s 2.334)', () => {
    expect(rampStep(GAME_FRAME_DT)).toBeCloseTo(0.05183, 5);
    expect(RAMP_PER_SECOND).toBe(rampStep(GAME_FRAME_DT) / GAME_FRAME_DT);
    expect(RAMP_PER_SECOND).toBeCloseTo(1.5532, 4);
    expect(0.65 / RAMP_PER_SECOND).toBeCloseTo(0.4185, 4);           // a full push in 12.5 frames, 0.42 s
  });

  it('grows by the step, falls at once, and a reversal starts from 0', () => {
    expect(ramp(0, 0.65, 0.04)).toBeCloseTo(0.04, 9);
    expect(ramp(0.3, 0.65, 0.04)).toBeCloseTo(0.34, 9);
    expect(ramp(0.64, 0.65, 0.04)).toBe(0.65);
    expect(ramp(0.65, 0.1, 0.04)).toBe(0.1);
    expect(ramp(0.65, -0.65, 0.04)).toBeCloseTo(-0.04, 9);
  });

  it('the right arrow (a full push) turns right at 128 deg/s after 13 game frames, and stops the frame it is let go', () => {
    const law = new LookLaw();
    const rates: number[] = [];
    for (let i = 0; i < 30; i++) rates.push(law.frame(GAME_FRAME_DT, 1, 0).yaw);
    expect(rates[0]!).toBeCloseTo(-SEAL_TUNING.turnMaxRate * rampStep(GAME_FRAME_DT) * LOOK_GAIN, 9);
    expect(rates[11]!).toBeGreaterThan(-MAX_YAW_RATE);
    expect(rates[12]!).toBeCloseTo(-MAX_YAW_RATE, 9);
    expect(law.frame(GAME_FRAME_DT, 0, 0).yaw).toBe(0);
  });

  it('the pitch axis (ctrl+0x138 x DAT_003df198) is the pad reader\'s ramped push: before the gain and the zoom, up positive', () => {
    const law = new LookLaw();
    law.setZoom(2.5);
    for (let i = 0; i < 13; i++) law.frame(GAME_FRAME_DT, 0, 1);
    expect(law.pitchAxis()).toBeCloseTo(0.65, 12);                    // FUN_002c65b0's [-1, 1] value, not 1.118 / 2.5
    law.setOptions({ invertPitch: true });
    for (let i = 0; i < 13; i++) law.frame(GAME_FRAME_DT, 0, 1);
    expect(law.pitchAxis()).toBeCloseTo(-0.65, 12);                   // DAT_003df198 = -1: pushing up looks down
    const mouse = new LookLaw();
    mouse.mouse(0, -800);
    mouse.frame(GAME_FRAME_DT, 0, 0);
    expect(mouse.pitchAxis()).toBe(0);                                // the raw mouse is no stick
  });

  it('the zoom divides the look (the M4A1\'s 2.5x), and view mode 4 by 5 more', () => {
    expect(zoomScale(2.5)).toBeCloseTo(0.4, 9);
    expect(zoomScale(9, true)).toBeCloseTo(0.2 / 9, 9);
    const law = new LookLaw();
    law.setZoom(2.5);
    for (let i = 0; i < 30; i++) law.frame(TICK, 0, 1);
    expect(law.frame(TICK, 0, 1).pitch).toBeCloseTo(MAX_PITCH_RATE / 2.5, 9);
  });
});

describe('the pitch (FUN_00594600)', () => {
  const lo = -70 / DEG, hi = 60 / DEG;
  it('moves toward the limit it points at and stops on it', () => {
    expect(stepPitch(0, 1, 0.5, lo, hi)).toBeCloseTo(0.5, 9);
    expect(stepPitch(hi - 0.01, 1, 0.5, lo, hi)).toBe(hi);
    expect(stepPitch(lo, -1, 0.5, lo, hi)).toBe(lo);
  });

  it('outside the limits (a stance change) it comes back at 0.5 rad/s, and a push outward does not move it', () => {
    const plo = -20 / DEG, phi = 25 / DEG;
    expect(stepPitch(lo, 0, 0.1, plo, phi)).toBeCloseTo(lo + 0.05, 9);
    expect(stepPitch(lo, -1, 0.1, plo, phi)).toBeCloseTo(lo + 0.05, 9);
    expect(stepPitch(plo - 0.01, 0, 0.1, plo, phi)).toBe(plo);
    expect(nudgePitch(lo, -0.1, plo, phi)).toBe(lo);
    expect(nudgePitch(lo, 0.1, plo, phi)).toBeCloseTo(lo + 0.1, 9);
  });
});

describe('the mouse (the viewer\'s mapping, research 83 section 7)', () => {
  it('raw: one inch at 800 DPI turns as far as a second of full stick; the pitch at 0.425 of it', () => {
    const law = new LookLaw();
    const [yaw, pitch] = law.mouse(800, -800);
    expect(yaw).toBeCloseTo(-MAX_YAW_RATE, 9);
    expect(pitch).toBeCloseTo(MAX_YAW_RATE * PITCH_PER_YAW, 9);
    expect(MOUSE_RADIANS_PER_COUNT * DEG).toBeCloseTo(0.160, 3);
  });

  it('raw: the sensitivity, the uniform ratio, the invert and the zoom', () => {
    const law = new LookLaw();
    law.setOptions({ sensitivity: 2, pitchRatio: 'uniform', invertPitch: true });
    law.setZoom(2);
    const [yaw, pitch] = law.mouse(10, 10);
    expect(yaw).toBeCloseTo(-10 * MOUSE_RADIANS_PER_COUNT, 9);
    expect(pitch).toBeCloseTo(10 * MOUSE_RADIANS_PER_COUNT, 9);
  });

  it('stick: 800 counts a second is a full push, capped at 128 deg/s; 400 is half a push through the curve', () => {
    const turnAt = (countsPerSecond: number): number => {
      const law = new LookLaw();
      law.setOptions({ mouse: 'stick' });
      let rate = 0;
      for (let i = 0; i < 120; i++) { expect(law.mouse(countsPerSecond * TICK, 0)).toEqual([0, 0]); rate = law.frame(TICK, 0, 0).yaw; }
      return rate;
    };
    expect(turnAt(800)).toBeCloseTo(-MAX_YAW_RATE, 6);
    expect(turnAt(4000)).toBeCloseTo(-MAX_YAW_RATE, 6);
    expect(turnAt(400)).toBeCloseTo(-SEAL_TUNING.turnMaxRate * 0.65 * Math.pow(Math.SQRT1_2, 3) * LOOK_GAIN, 4);
  });
});

describe('the screen shake (FUN_002994e0, FUN_00299c40)', () => {
  it('an explosion\'s preset by distance: 100, 200, 600', () => {
    expect(explosionShake(50)).toBe(EXPLOSION_SHAKES[2]);
    expect(explosionShake(150)).toBe(EXPLOSION_SHAKES[1]);
    expect(explosionShake(599)).toBe(EXPLOSION_SHAKES[0]);
    expect(explosionShake(600)).toBeNull();
  });

  it('starts centred, swings at its rate, falls by decr a game frame (525/15734 s) and ends', () => {
    // FUN_00299c40 runs once a game frame: decr is a 30 Hz frame's fall (research 180 U4; research 208).
    const shake = new ScreenShake(() => 0);                          // phases 270 / 180; the random part 0
    shake.start(EXPLOSION_SHAKES[2]!);
    expect(shake.amplitude()).toEqual([60, 55]);
    const [x, y] = shake.step(GAME_FRAME_DT);
    expect(x).toBeCloseTo(60 * Math.cos(((270 + 1000 * GAME_FRAME_DT) * Math.PI) / 180), 9);
    expect(y).toBeCloseTo(55 * Math.sin(((180 + 1150 * GAME_FRAME_DT) * Math.PI) / 180), 9);
    expect(shake.amplitude()).toEqual([56, 51]);
    for (let i = 0; i < 14; i++) shake.step(GAME_FRAME_DT);          // 60 / 4 = 15 frames, 0.5 s (0.25 s at 60 Hz)
    expect(shake.amplitude()).toEqual([0, 0]);
    expect(shake.step(GAME_FRAME_DT)).toEqual([0, 0]);
  });

  it('a 60 Hz page frame falls by half a game frame\'s decr: dt / GAME_FRAME_DT frames, not dt x 60', () => {
    const shake = new ScreenShake(() => 0);
    shake.start(EXPLOSION_SHAKES[2]!);
    shake.step(TICK);
    const k = TICK / GAME_FRAME_DT;                                   // 0.4995 of a frame
    expect(shake.amplitude()[0]).toBeCloseTo(60 - 4 * k, 9);
    expect(shake.amplitude()[1]).toBeCloseTo(55 - 4 * k, 9);
  });

  it('a smaller shake does not take over a running one', () => {
    const shake = new ScreenShake(() => 0);
    shake.start(EXPLOSION_SHAKES[2]!);
    shake.start(EXPLOSION_SHAKES[0]!);
    expect(shake.amplitude()).toEqual([60, 55]);
  });
});

describe('the view bob (BOBBING_FIRSTPERSON), in the views from the eye', () => {
  it('moving, 6 x cos(phase) pixels, the phase at 15 rad/s x the push; still, 0; prone, 4 at 8', () => {
    const bob = new ViewBob();
    expect(bob.step(TICK, 0, 1, false)).toBeCloseTo(SEAL_TUNING.bobbing.walkAmplitude, 9);
    expect(bob.step(TICK, 0, 1, false)).toBeCloseTo(6 * Math.cos(15 * TICK), 9);
    expect(bob.step(TICK, 0, 0, false)).toBe(0);
    expect(bob.step(TICK, 0.5, 1, true)).toBeCloseTo(4 * Math.cos(30 * TICK), 9);
  });

  it('as a view offset: 6 pixels down on a 448-high frame; x at 4:3 of 640', () => {
    expect(viewOffset(0, 6)).toEqual([-0, -6]);
    expect(viewOffset(150, 0)[0]).toBeCloseTo(-150 * (4 / 3) * 448 / 640, 9);   // 140 of the frame's 448
    expect(viewOffset(0, 900)).toEqual([-0, -200]);
  });
});

describe('the body and the look', () => {
  it('the aim cone: 85 deg standing, 45 prone; the aim pitch limits', () => {
    expect(aimTwist(120, -80, false)).toEqual({ yaw: 85, pitch: -70 });
    expect(aimTwist(-60, 30, true)).toEqual({ yaw: -45, pitch: 25 });
  });

  it('the run\'s bank: 3.1 deg into a full turn at 65', () => {
    expect(runningLean(-MAX_YAW_RATE, 65) * DEG).toBeCloseTo(3.12, 2);
  });
});

function canvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  document.body.appendChild(c);
  return c;
}

describe('FlyCamera, walking: the look law', () => {
  const walking = (): FlyCamera => {
    const fly = new FlyCamera(canvas());
    fly.setPose({ yaw: 0, pitch: 0 });
    fly.setWalking(true);
    fly.setPitchLimits(-70, 60);
    return fly;
  };

  it('the pad\'s push arrives dead-zoned by ./gamepad; the camera undoes it, so +96 still turns at 0.879', () => {
    const fly = walking();
    const raw = byte(0x80 + 96);
    fly.setLook((raw - PAD_DEAD_ZONE) / (1 - PAD_DEAD_ZONE), 0);    // what padInput hands over for that push
    for (let i = 0; i < 60; i++) fly.update(TICK);
    const state = fly.lookState();
    expect(state.axis[0]).toBeCloseTo(0.879, 3);
    expect(state.turnRate).toBeCloseTo(-SEAL_TUNING.turnMaxRate * 0.879, 2);
    expect(state.bodyYaw).toBe(state.lookYaw);
    expect(state.turning).toBe(true);
  });

  it('the arrow held a second turns 128 deg less the ramp\'s first 0.42 s', () => {
    const fly = walking();
    globalThis.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
    for (let i = 0; i < 60; i++) fly.update(TICK);
    globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft' }));
    const yaw = fly.pose().yaw;
    expect(yaw).toBeGreaterThan(128.1 - 27);
    expect(yaw).toBeLessThan(128.1 - 22);
    for (let i = 0; i < 2; i++) fly.update(TICK);                    // let go: the next drawn frame reads it (MISSION R8)
    const after = fly.pose().yaw;
    fly.update(TICK);
    expect(fly.pose().yaw).toBe(after);
  });

  it('the look law runs every drawn frame at the ramp\'s per-second equivalent (MISSION R8): the yaw is the frames\' sum, full at 0.42 s', () => {
    // The original's FUN_002da930 reads the pad once a 30 Hz frame; the port reads it every drawn frame and grows the
    // ramp at RAMP_PER_SECOND (rampStep(GAME_FRAME_DT) / GAME_FRAME_DT), then FUN_00594600 / actor+0x48 move by the rate
    // x dt: page frame i turns at min(0.65, i x dt x RAMP_PER_SECOND) x 1.72 x turn_maxrate 2 for its dt.
    const fly = walking();
    globalThis.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
    let want = 0, full = -1;
    for (let i = 1; i <= 60; i++) {
      fly.update(TICK);
      want += SEAL_TUNING.turnMaxRate * LOOK_GAIN * Math.min(0.65, i * TICK * RAMP_PER_SECOND) * TICK;
      expect(fly.pose().yaw, `page frame ${i}`).toBeCloseTo(want * DEG, 6);
      if (full < 0 && Math.abs(fly.lookState().axis[0]) >= FULL_AXIS * (1 - 1e-9)) full = i;
    }
    expect(full).toBe(26);                                             // 0.65 / 1.5532 = 0.4185 s: the 26th 60 Hz frame
    expect(RAMP_PER_SECOND).toBe(rampStep(GAME_FRAME_DT) / GAME_FRAME_DT);
    globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft' }));
  });

  it('scoped and moving, the bob shifts the view; the shake too, and neither in fly mode', () => {
    const fly = walking();
    fly.setAspect(4 / 3);
    fly.setBody(true, false);                                         // the eye's view (the night vision: no slow)
    globalThis.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    fly.update(TICK);
    expect(fly.lookState().screen[1]).toBeCloseTo(6, 9);
    expect(fly.camera.view?.enabled).toBe(true);
    expect(fly.screenShift()[1]).toBeCloseTo(6 / 448, 9);
    globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    fly.update(TICK);
    expect(fly.lookState().screen).toEqual([0, 0]);
    expect(fly.camera.view?.enabled ?? false).toBe(false);
    fly.shakeScreen(EXPLOSION_SHAKES[1]!);
    fly.update(TICK);
    expect(fly.lookState().screen).not.toEqual([0, 0]);
    fly.setWalking(false);
    expect(fly.lookState().screen).toEqual([0, 0]);
  });

  it('WalkMode still reads the look\'s yaw as the body\'s', () => {
    const fly = walking();
    const mode = new WalkMode(fly);
    expect(mode.mode()).toBe('fly');                                  // no ground: the look law is the camera's alone
    expect(fly.lookState().bodyYaw).toBe(fly.pose().yaw);
  });
});

// LATER 351 (research 84 section 17): the exertion's pitch throttle is the controller's `+0x138`, the pad's processed
// pitch axis v.y (`FUN_002c6280` -> `FUN_002c65b0`: after the pad reader's dead zone, curve x gain and ramp), stored
// (D:L453772-453773) before the look's x 1.72 (D:L453774) and its / magnification (`FUN_005be660` D:L453807-453812):
// |pitch rate| x magnification / (`pitch_rate` x 1.72) -- no stick gain in the divisor. `MAX_PITCH_RATE` carries
// RECRUIT's 0.65, so the port read a full push as 1, not 0.65.
describe("the exertion's pitch throttle (LATER 351)", () => {
  it('a full push at RECRUIT reads its gain, 0.65; a full push at gain 1 reads 1; a scope multiplies the rate back', () => {
    expect(pitchStickOf(MAX_PITCH_RATE)).toBeCloseTo(0.65, 6);
    expect(pitchStickOf(-MAX_PITCH_RATE)).toBeCloseTo(0.65, 6);
    expect(pitchStickOf(SEAL_TUNING.pitchRate * LOOK_GAIN)).toBeCloseTo(1, 6);
    expect(pitchStickOf(MAX_PITCH_RATE / 3, 3)).toBeCloseTo(0.65, 6);
    expect(pitchStickOf(10)).toBe(1);
  });

  it("the room's cone feeds the exertion the same throttle: a command pitching at RECRUIT's full push gives 0.65", () => {
    const seen: number[] = [];
    const update = Accuracy.prototype.update;
    const spy = vi.spyOn(Accuracy.prototype, 'update').mockImplementation(function (this: Accuracy, dt, input) { seen.push(input.sticks?.pitch ?? NaN); return update.call(this, dt, input); });
    const cone = new ShotCone(HELD_RIFLE);
    const m: AimMover = { feet: [0, 0, 0], velocity: [0, 0, 0], airborne: false, posture: 'stand', moveRoot: null, peek: 0, weapon: 0 };
    const cmd = (seq: number, pitch: number): Command => ({ seq, forward: 0, right: 0, yaw: 0, pitch, turn: 0, buttons: 0, stance: 0, weapon: 0 });
    const step = (MAX_PITCH_RATE * 180) / Math.PI / TICK_HZ;                    // degrees a command at RECRUIT's full push
    cone.tick(cmd(1, 0), m, 1);
    cone.tick(cmd(2, step), m, 2);
    spy.mockRestore();
    expect(seen.at(-1)).toBeCloseTo(0.65, 3);
  });
});

// LATER 476 (LATER 351's review, F2; research 84 sections 11, 17): the look divides the stored `+0x138` (x 1.72) by
// `FUN_005be660`'s zoom -- the view state's own `ZoomMode[state - 4]`, not the zoom eased on screen -- and by 5 more in
// view state 4 (D:L453807-453816), `Zoom.lookScale()`; so the throttle from a pitch rate is
// `pitchStickOf(rate, 1 / lookScale)`, on the page and in the room's cone alike.
describe("the exertion's pitch throttle at the look's own scale (LATER 476)", () => {
  const RIFLE = { ...DEFAULT_RIFLE, zoomModes: [1.5, 6, 12] };

  it("the page: binoculars and a scope, RECRUIT's full push reads 0.65 at the view's look scale", () => {
    for (const state of [4, 5, 6]) {
      const z = new Zoom(RIFLE);
      z.set(state);
      z.settle();
      expect(pitchStickInView(MAX_PITCH_RATE * z.lookScale(), z), `state ${state}`).toBeCloseTo(0.65, 6);
    }
    const open = new Zoom(RIFLE);
    expect(pitchStickInView(MAX_PITCH_RATE, open)).toBeCloseTo(0.65, 6);
  });

  it("the room: a command at RECRUIT's full push through the binoculars (the command's look scale) gives 0.65", () => {
    const seen: number[] = [];
    const update = Accuracy.prototype.update;
    const spy = vi.spyOn(Accuracy.prototype, 'update').mockImplementation(function (this: Accuracy, dt, input) { seen.push(input.sticks?.pitch ?? NaN); return update.call(this, dt, input); });
    const cone = new ShotCone(HELD_RIFLE);
    const scale = (1 / 1.5) * 0.2;                                            // the binoculars' look scale
    const m: AimMover = { feet: [0, 0, 0], velocity: [0, 0, 0], airborne: false, posture: 'stand', moveRoot: null, peek: 0, weapon: 0, lookScale: scale };
    const cmd = (seq: number, pitch: number): Command => ({ seq, forward: 0, right: 0, yaw: 0, pitch, turn: 0, buttons: 0, stance: 0, weapon: 0 });
    const step = (MAX_PITCH_RATE * scale * 180) / Math.PI / TICK_HZ;
    cone.tick(cmd(1, 0), m, 1);
    cone.tick(cmd(2, step), m, 2);
    spy.mockRestore();
    expect(seen.at(-1)).toBeCloseTo(0.65, 3);
  });
});

describe("LATER 476's review: the scope's level the command does not carry, and the wiring", () => {
  it("CONE_SCOPE_LEVEL_READING: the room takes the scope's least magnification -- the M40A1's [1.5, 6, 12] at state 6: the page 0.65, the room 0.325", () => {
    expect(CONE_SCOPE_LEVEL_READING).toBe("the scope's least magnification: the command carries no level");
    const rec = { zoomModes: [1.5, 6, 12], rifleKick: {} };
    const page = new Zoom({ ...DEFAULT_RIFLE, zoomModes: [1.5, 6, 12] });
    page.set(6);
    page.settle();
    const rate = MAX_PITCH_RATE * page.lookScale();                      // the page's pitch rate at a full push, 1/12
    expect(pitchStickInView(rate, page)).toBeCloseTo(0.65, 6);
    const roomScale = lookScaleOf(Button.Scope, lookContextOf(rec));     // 1/6: the least scope
    expect(roomScale).toBeCloseTo(1 / 6, 9);
    expect(pitchStickOf(rate, 1 / roomScale)).toBeCloseTo(0.325, 6);
  });

  it('the wiring, pinned at the source: the page asks pitchStickInView of its zoom; the room hands the cone lookScaleOf', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const page = readFileSync(resolvePath(here, '../src/matchFirearm.ts'), 'utf8');
    const room = readFileSync(resolvePath(here, '../../match/src/room.ts'), 'utf8');
    expect(page).toContain('pitch: pitchStickInView(pitchRate, zoom)');
    expect(room).toContain('lookScale: lookScaleOf(cmd.buttons, p.sim.lookContext?.(w) ?? OPEN_LOOK_CONTEXT)');
  });
});
