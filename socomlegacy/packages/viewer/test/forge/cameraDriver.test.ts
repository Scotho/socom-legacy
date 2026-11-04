import { describe, expect, it, vi } from 'vitest';
import { createShotDriver, linearShotSampler, poseOfShot, SHOT_ADMISSION_SAMPLES_CAP_ADAPTATION, SHOT_PITCH_LIMIT_DEGREES_ADAPTATION, shotAdmission,
  shotLengthOf, shotOutsideBounds, shotPastPitchLimit, type ShotSampler, type ShotSpec } from '../../src/forge/camera/driver';

/**
 * R5-A (a browser adaptation, no original): the agent's cinematic camera driver. It hands the sampler a continuous t
 * frame by frame and applies the page's own pose; nothing here touches the game's camera or any simulation value.
 */
const spec = (hold?: number): ShotSpec => ({
  points: [{ at: [0, 0, 0], look: [0, 0, -10] }, { at: [10, 0, 0], look: [10, 0, -10] }, { at: [10, 0, 10], look: [0, 0, 10] }],
  seconds: 2, ...(hold === undefined ? {} : { hold }),
});

describe('the camera shot driver', () => {
  it('hands the sampler a continuous t each frame and applies its pose, ending done after seconds + hold', () => {
    const ts: number[] = [];
    const sampler: ShotSampler = (s, t) => { ts.push(t); return linearShotSampler(s, t); };
    const apply = vi.fn();
    const driver = createShotDriver({ sampler, apply });
    const s = spec(0.5);
    expect(driver.start(s, 'shot-1')).toBeNull();
    expect(driver.status()).toEqual({ shot: 'shot-1', t: 0 });
    let frames = 0;
    while (driver.active()) { expect(driver.frame(1 / 60)).toBe(true); frames++; if (frames > 1000) break; }
    expect(frames).toBe(Math.ceil(2.5 * 60 - 1e-9));
    for (let i = 1; i < ts.length; i++) expect(ts[i]! - ts[i - 1]!).toBeLessThanOrEqual(1 / 60 + 1e-9);
    for (let i = 1; i < ts.length; i++) expect(ts[i]!).toBeGreaterThan(ts[i - 1]!);
    expect(ts.at(-1)).toBe(2.5);
    expect(apply).toHaveBeenCalledTimes(frames);
    // The end pose is the last point's, exactly.
    expect(apply.mock.calls.at(-1)![1]).toEqual({ at: [10, 0, 10], look: [0, 0, 10] });
    expect(apply.mock.calls.at(-1)![0]).toEqual(poseOfShot({ at: [10, 0, 10], look: [0, 0, 10] }));
    expect(driver.status()).toEqual({ shot: 'shot-1', t: 2.5, ended: 'done' });
    expect(driver.frame(1 / 60)).toBe(false);
    expect(apply).toHaveBeenCalledTimes(frames);
  });
  it('produces the page fly camera pose: lookFrom yaw and pitch in degrees', () => {
    expect(poseOfShot({ at: [1, 2, 3], look: [1, 2, -7] })).toEqual({ x: 1, y: 2, z: 3, yaw: 0, pitch: 0 });
    expect(poseOfShot({ at: [0, 0, 0], look: [-5, 0, 0] }).yaw).toBeCloseTo(90);
    expect(poseOfShot({ at: [0, 0, 0], look: [0, 5, -5] }).pitch).toBeCloseTo(45);
    // A look on the point itself has no direction: the previous facing is kept.
    expect(poseOfShot({ at: [0, 0, 0], look: [0, 0, 0] }, { x: 9, y: 9, z: 9, yaw: 30, pitch: -10 })).toEqual({ x: 0, y: 0, z: 0, yaw: 30, pitch: -10 });
  });
  it('the linear fallback is exact at its points and clamps t', () => {
    const s = spec(1);
    expect(shotLengthOf(s)).toBe(3);
    expect(linearShotSampler(s, -1)).toEqual(s.points[0]);
    expect(linearShotSampler(s, 0)).toEqual(s.points[0]);
    expect(linearShotSampler(s, 1)).toEqual(s.points[1]);
    expect(linearShotSampler(s, 0.5)).toEqual({ at: [5, 0, 0], look: [5, 0, -10] });
    expect(linearShotSampler(s, 2)).toEqual(s.points[2]);
    expect(linearShotSampler(s, 2.7)).toEqual(s.points[2]);
    expect(linearShotSampler(s, 99)).toEqual(s.points[2]);
  });
  it('records the reason a stop gives, and only the first', () => {
    for (const reason of ['manual', 'mode', 'map', 'stopped', 'revoked', 'disconnected'] as const) {
      const apply = vi.fn();
      const driver = createShotDriver({ sampler: linearShotSampler, apply });
      driver.start(spec(), 'a');
      driver.frame(0.25);
      expect(driver.stop(reason)).toBe('a');
      expect(driver.status()).toEqual({ shot: 'a', t: 0.25, ended: reason });
      expect(driver.stop('stopped')).toBeNull();
      expect(driver.status().ended).toBe(reason);
      expect(driver.frame(0.25)).toBe(false);
      expect(apply).toHaveBeenCalledTimes(1);
    }
    const idle = createShotDriver({ sampler: linearShotSampler, apply: () => undefined });
    expect(idle.status()).toEqual({ shot: null, t: 0 });
    expect(idle.stop('manual')).toBeNull();
    expect(idle.status()).toEqual({ shot: null, t: 0 });
  });
  it('a second start replaces the first and names it', () => {
    const driver = createShotDriver({ sampler: linearShotSampler, apply: () => undefined });
    driver.start(spec(), 'a'); driver.frame(0.5);
    expect(driver.start(spec(), 'b')).toBe('a');
    expect(driver.status()).toEqual({ shot: 'b', t: 0 });
    driver.stop('stopped');
    expect(driver.start(spec(), 'c')).toBeNull();
  });
  it('without a dt it measures the frame on its clock; a bad dt advances nothing', () => {
    let ms = 1000;
    const driver = createShotDriver({ sampler: linearShotSampler, apply: () => undefined, now: () => ms });
    driver.start(spec(), 'a');
    ms += 500; driver.frame();
    expect(driver.status().t).toBeCloseTo(0.5);
    driver.frame(Number.NaN); driver.frame(-1);
    expect(driver.status().t).toBeCloseTo(0.5);
  });
  it('ends with mode when the page refuses the pose, and stopped on a non-finite sample, never applying it', () => {
    const refusing = createShotDriver({ sampler: linearShotSampler, apply: () => false });
    refusing.start(spec(), 'a'); refusing.frame(0.1);
    expect(refusing.status()).toEqual({ shot: 'a', t: 0.1, ended: 'mode' });
    const apply = vi.fn();
    const broken = createShotDriver({ sampler: () => ({ at: [Number.NaN, 0, 0], look: [0, 0, 0] }), apply });
    broken.start(spec(), 'b'); broken.frame(0.1);
    expect(apply).not.toHaveBeenCalled();
    expect(broken.status().ended).toBe('stopped');
  });
  it('checks every point and the sampled path against the map bounds', () => {
    const bounds = { min: [-1, -1, -11] as [number, number, number], max: [11, 1, 11] as [number, number, number] };
    expect(shotOutsideBounds(spec(), bounds, linearShotSampler)).toBeNull();
    const out = { ...spec(), points: [...spec().points, { at: [12, 0, 0] as [number, number, number], look: [0, 0, 0] as [number, number, number] }] };
    expect(shotOutsideBounds(out, bounds, linearShotSampler)).toMatch(/point 3/);
    const lookOut = { ...spec(), points: [spec().points[0]!, { at: [1, 0, 0] as [number, number, number], look: [0, 0, -20] as [number, number, number] }] };
    expect(shotOutsideBounds(lookOut, bounds, linearShotSampler)).toMatch(/point 1/);
    // A sampler that overshoots between its points (a cubic can) is caught along the path.
    const overshoot: ShotSampler = (s, t) => (t > 0.9 && t < 1.1 ? { at: [5, 50, 0], look: [5, 0, -10] } : linearShotSampler(s, t));
    expect(shotOutsideBounds(spec(), bounds, overshoot)).toMatch(/path/);
  });
  it('keeps the previous yaw on a look straight up or down, so a vertical frame does not snap the heading', () => {
    const previous = { x: 0, y: 0, z: 0, yaw: 30, pitch: 10 };
    expect(poseOfShot({ at: [0, 0, 0], look: [0, 5, 0] }, previous)).toEqual({ x: 0, y: 0, z: 0, yaw: 30, pitch: 90 });
    expect(poseOfShot({ at: [0, 0, 0], look: [0, -5, 0] }, previous)).toEqual({ x: 0, y: 0, z: 0, yaw: 30, pitch: -90 });
    expect(poseOfShot({ at: [0, 0, 0], look: [0, -5, 0] }).yaw).toBe(0);
  });
  it('names a shot whose sampled look passes the pitch limit (the page admission refuses it, round 5b)', () => {
    expect(SHOT_PITCH_LIMIT_DEGREES_ADAPTATION).toBe(89);
    expect(shotPastPitchLimit(spec(), linearShotSampler)).toBeNull();
    const steep: ShotSpec = { points: [{ at: [0, 0, 0], look: [0, 0, -10] }, { at: [0, 0, 0], look: [0, 10, 0] }], seconds: 1 };
    expect(shotPastPitchLimit(steep, linearShotSampler)).toMatch(/point 1/);
    // Between its points the path can turn past the limit (a sampler's own overshoot): caught on the sampled path.
    const overshoot: ShotSampler = (s, t) => (t > 0.4 && t < 0.6 ? { at: [5, 0, 0], look: [5, -10, -0.01] } : linearShotSampler(s, t));
    expect(shotPastPitchLimit(spec(), overshoot)).toMatch(/path/);
    // 88 degrees passes; a look on the camera itself has no direction and passes.
    const near: ShotSpec = { points: [{ at: [0, 0, 0], look: [0, Math.tan(88 * Math.PI / 180), -1] }, { at: [1, 0, 0], look: [1, 0, 0] }], seconds: 1 };
    expect(shotPastPitchLimit(near, linearShotSampler)).toBeNull();
  });
  it('R5-B: carries the admission check the page gives, null without one', () => {
    const plain = createShotDriver({ sampler: linearShotSampler, apply: () => undefined });
    expect(plain.check(spec())).toBeNull();
    const check = vi.fn((s: ShotSpec) => (s.points.length > 2 ? 'three points' : null));
    const checked = createShotDriver({ sampler: linearShotSampler, apply: () => undefined, check });
    expect(checked.check(spec())).toBe('three points');
    expect(check).toHaveBeenCalledOnce();
  });
  it('R5-B: one admission walk -- bounds, then pitch -- sampled once per instant, at most the cap', () => {
    const bounds = { min: [-20, -20, -20] as [number, number, number], max: [20, 20, 20] as [number, number, number] };
    expect(shotAdmission(spec(), bounds, linearShotSampler)).toBeNull();
    const out = { ...spec(), points: [...spec().points, { at: [30, 0, 0] as [number, number, number], look: [0, 0, 0] as [number, number, number] }] };
    expect(shotAdmission(out, bounds, linearShotSampler)).toMatchObject({ code: 'OUT_OF_BOUNDS', message: expect.stringMatching(/point 3/) });
    const steep: ShotSpec = { points: [{ at: [0, 0, 0], look: [0, 0, -10] }, { at: [0, 0, 0], look: [0, 10, 0] }], seconds: 1 };
    expect(shotAdmission(steep, bounds, linearShotSampler)).toMatchObject({ code: 'OUT_OF_RANGE', message: expect.stringMatching(/point 1/) });
    const overshoot: ShotSampler = (s, t) => (t > 0.4 && t < 0.6 ? { at: [5, 0, 0], look: [5, -10, -0.01] } : linearShotSampler(s, t));
    expect(shotAdmission(spec(), bounds, overshoot)).toMatchObject({ code: 'OUT_OF_RANGE', message: expect.stringMatching(/path/) });
    // 30 a second on a short shot, each instant sampled once for both checks.
    let calls = 0;
    const counting: ShotSampler = (s, t) => { calls++; return linearShotSampler(s, t); };
    expect(shotAdmission(spec(), bounds, counting)).toBeNull();
    expect(calls).toBe(2 * 30 + 1);
    // A 120 s shot is walked in at most the cap's samples (10 a second at 120 s), so admission never blocks for seconds.
    expect(SHOT_ADMISSION_SAMPLES_CAP_ADAPTATION).toBe(1200);
    calls = 0;
    const long: ShotSpec = { ...spec(), seconds: 120 };
    expect(shotAdmission(long, bounds, counting)).toBeNull();
    expect(calls).toBe(SHOT_ADMISSION_SAMPLES_CAP_ADAPTATION + 1);
    calls = 0; shotOutsideBounds(long, bounds, counting);
    expect(calls).toBe(SHOT_ADMISSION_SAMPLES_CAP_ADAPTATION + 1);
    calls = 0; shotPastPitchLimit(long, counting);
    expect(calls).toBe(SHOT_ADMISSION_SAMPLES_CAP_ADAPTATION + 1);
  });
});
