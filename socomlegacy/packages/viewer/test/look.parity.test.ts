// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GAME_FRAME_DT } from '@s2u/scene';
import { MAP_FOV } from '../src/accuracy';
import { FlyCamera } from '../src/camera';
import {
  EXPLOSION_SHAKES, explosionShake, LOOK_GAIN, LookLaw, MACHINE_GUN_SHAKE, MAX_PITCH_RATE, MAX_YAW_RATE, PITCH_RETURN, RAMP_PER_SECOND, rampStep, RIGHT_STICK,
  SCOPE_SLOW, stepPitch, zoomScale,
} from '../src/look';
import { CAM_BACK, CAM_CLOSE, CAM_MARGIN, LEAD_DOWN, LEAD_PROBE, LEAD_UP, lookHeight, ramp } from '../src/cameraRig';
import { CAM_HOLD, CAM_REGROW, INIT_AIM_PITCH, pitchLimits } from '../src/playerCamera';

/**
 * Parity pins for the look and the third-person camera (web research 83 sections 1-6, research 17 section 3 through
 * `cameraRig.ts`), unit tier. `look.test.ts` and `playerCamera.test.ts` drive the law and the camera; this file holds the
 * transcribed settings themselves -- the pad block, the gains, the pitch's return and hard limit, the shake presets, the
 * camera's distances -- as literals, so a changed setting fails in CI even where the behaviour tests would scale with it.
 */

const DEG = 180 / Math.PI;

describe('movement.look: the right stick\'s pad block and the gains (FUN_002da930, FUN_005966a0; research 83 section 1)', () => {
  it('dead zone 0.3, curve 0.65 x v^3, ramp setting 0.75, gain 1.72: 1.118 at full push, 2.236 rad/s turn and 0.950 pitch', () => {
    expect(RIGHT_STICK).toEqual({ deadZone: 0.3, gain: 0.65, exponent: 3, ramp: 0.75 });
    expect(LOOK_GAIN).toBe(1.72);
    expect(MAX_YAW_RATE).toBeCloseTo(2.236, 9);
    expect(MAX_YAW_RATE * DEG).toBeCloseTo(128.113, 3);       // research 22: 128.11 deg/s measured
    expect(MAX_PITCH_RATE).toBeCloseTo(0.9503, 9);
    expect(MAX_PITCH_RATE * DEG).toBeCloseTo(54.448, 3);
  });

  it('the ramp grows 0.0518 a game frame (525/15734 s) and reaches the full 0.65 on the 13th frame (0.43 s), not the 12th', () => {
    // FUN_002da930 D:L179774-179776 at the game's frame (research 180 section 1.1, V1 section 8.3): 1.5532 a second.
    expect(rampStep(GAME_FRAME_DT)).toBeCloseTo((GAME_FRAME_DT + (1 - GAME_FRAME_DT) * 0.13 * 0.25) / 1.25, 12);
    expect(rampStep(GAME_FRAME_DT)).toBeCloseTo(0.05183, 5);
    expect(RAMP_PER_SECOND).toBeCloseTo(1.5532, 4);
    const law = new LookLaw();
    const rates: number[] = [];
    for (let i = 0; i < 13; i++) rates.push(Math.abs(law.frame(GAME_FRAME_DT, 1, 0).yaw));
    expect(rates[11]).toBeLessThan(MAX_YAW_RATE * (1 - 1e-6));
    expect(rates[12]).toBeCloseTo(MAX_YAW_RATE, 12);
    expect(rates[0]).toBeCloseTo(2 * 1.72 * rampStep(GAME_FRAME_DT), 9);   // turn_maxrate x gain x the first step
  });

  it('the pitch: aim limits -70..60 standing and crouched, -20..25 prone; back at 0.5 rad/s from outside; never past 1.4 rad', () => {
    expect(pitchLimits('stand')).toEqual([-70, 60]);
    expect(pitchLimits('crouch')).toEqual([-70, 60]);
    expect(pitchLimits('prone')).toEqual([-20, 25]);
    expect(INIT_AIM_PITCH).toBe(-9.167);
    expect(PITCH_RETURN).toBe(0.5);
    // outside the limits (radians): back at 0.5 a second whatever the push
    expect(stepPitch(0.6, 0, 0.1, -0.35, 0.44)).toBeCloseTo(0.55, 12);
    expect(stepPitch(-0.6, 0, 0.1, -0.35, 0.44)).toBeCloseTo(-0.55, 12);
    // FUN_00594600: alive, the pitch is held within +-1.4 rad (0x3fb33333)
    expect(stepPitch(1.39, 10, 1, -10, 10)).toBe(1.4);
    expect(stepPitch(-1.39, -10, 1, -10, 10)).toBe(-1.4);
  });

  it('the scope divides the look by its magnification, view mode 4 by 5 more (x 0.2); the move stick x 0.2 scoped', () => {
    expect(SCOPE_SLOW).toBe(0.2);
    expect(zoomScale(2.5)).toBeCloseTo(0.4, 12);
    expect(zoomScale(9, true)).toBeCloseTo(1 / 45, 12);
    expect(zoomScale(0)).toBe(1);
  });

  it('the shake presets by distance (FUN_002994e0; the camera\'s constructor 142906-142929) and the machine guns\' per round', () => {
    expect(EXPLOSION_SHAKES).toEqual([
      { x: { base: 6, rand: 1, decr: 2, dps: 2000 }, y: { base: 6, rand: 0.5, decr: 2, dps: 250 } },
      { x: { base: 20, rand: 10, decr: 2, dps: 2000 }, y: { base: 10, rand: 5, decr: 2, dps: 2000 } },
      { x: { base: 60, rand: 30, decr: 4, dps: 1000 }, y: { base: 55, rand: 15, decr: 4, dps: 1150 } },
    ]);
    expect(MACHINE_GUN_SHAKE).toEqual({ x: { base: 1, rand: 1, decr: 1, dps: 1600 }, y: { base: 1, rand: 1, decr: 1, dps: 2400 } });
    expect([explosionShake(99.9), explosionShake(100), explosionShake(199.9), explosionShake(200), explosionShake(599.9), explosionShake(600)])
      .toEqual([EXPLOSION_SHAKES[2], EXPLOSION_SHAKES[1], EXPLOSION_SHAKES[1], EXPLOSION_SHAKES[0], EXPLOSION_SHAKES[0], null]);
  });

  // DRIFT (TA.R6), research 88 line 201 (section 2 item 7): research 22 line 126 read the turn axis 0 at byte 176 on
  // both runs; the port's pad block (dead zone, circle, curve, gain) gives 0.0048 there. The assertion is the
  // original's value, so the test fails today; it.fails turns green-to-red the day the port reads 0 at byte 176.
  it.fails('the right stick at byte 176 turns 0 after a 1 s hold, as research 22 read it on both runs [drift: the port 0.005]', () => {
    const law = new LookLaw();
    const v = (176 - 127.5) * 0.007843138;                       // the pad's byte to axis (moveStick.ts's header)
    for (let i = 0; i < 60; i++) law.frame(1 / 60, v, 0);
    expect(Math.abs(law.axis()[0])).toBeLessThan(0.0015);         // the feel table's look.axis tolerance
  });
});

describe('movement.camera: FUN_0029a950 and FUN_0029bf70\'s numbers (research 17 section 3, research 83 section 3)', () => {
  it('the goal 28 behind, a vertical look closing to 14, the pass 0.75 off a hit; the lead -8 down, -3 up, a probe under -5', () => {
    expect([CAM_BACK, CAM_CLOSE, CAM_MARGIN]).toEqual([28, 14, 0.75]);
    expect([LEAD_DOWN, LEAD_UP, LEAD_PROBE]).toEqual([-8, -3, -5]);
  });

  it('the ramp: 10 with no root, 5.5 at the prone floor 2.169155, 10 from 5.6; the target 21.484 standing, 15.378 crouched', () => {
    expect(ramp(0)).toBe(10);
    expect(ramp(2.169155)).toBeCloseTo(5.5, 9);
    expect(ramp(2)).toBeCloseTo(5.5, 9);
    expect(ramp(5.6)).toBe(10);
    expect(ramp(5.504)).toBeCloseTo(9.874, 3);
    expect(lookHeight(11.484)).toBeCloseTo(21.484, 9);
    expect(lookHeight(5.504)).toBeCloseTo(15.378, 3);
  });

  it('after a hit the pulled-in distance holds 1.5 s, then lets out 3 % of the gap a game frame', () => {
    expect(CAM_HOLD).toBe(1.5);
    expect(CAM_REGROW).toBe(0.03);
  });
});

describe('movement.camera.fov: the projection the viewer opens with (cam_pcsx2_mission.txt line 8; research 88 section 2 item 5)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('the map camera half-angles 0.6109 by 0.4276; the fly camera projects 49 degrees vertical, and 70 horizontal at the PS2 aspect', () => {
    expect(MAP_FOV).toEqual({ hfov: 0.6109, vfov: 0.4276 });
    expect(2 * MAP_FOV.vfov * DEG).toBeCloseTo(49, 1);
    expect(2 * MAP_FOV.hfov * DEG).toBeCloseTo(70, 1);
    // The viewer's own camera, constructed with no DOM: its listeners go nowhere, its projection is three's.
    vi.stubGlobal('addEventListener', () => undefined);
    const canvas = { addEventListener: () => undefined } as unknown as HTMLCanvasElement;
    const fly = new FlyCamera(canvas);
    expect(fly.camera.fov).toBeCloseTo(49, 1);
    fly.setAspect(Math.tan(MAP_FOV.hfov) / Math.tan(MAP_FOV.vfov));    // main.ts's PS2_ASPECT
    const e = fly.camera.projectionMatrix.elements;
    expect(2 * Math.atan(1 / e[5]!) * DEG).toBeCloseTo(49, 1);        // vertical, read off the matrix
    expect(2 * Math.atan(1 / e[0]!) * DEG).toBeCloseTo(70, 1);        // horizontal
  });
});
