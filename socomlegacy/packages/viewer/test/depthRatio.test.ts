import { describe, expect, it } from 'vitest';
import { HELD_RIFLE } from '@s2u/scene';
import { Accuracy, clampKnock, depthRatio, tangentPerPixel, RADIUS_FACTOR } from '../src/accuracy';

/**
 * LATER 1141 (research 441; reading, pending review): the aim-to-firepoint depth ratio f = (d_aim - d_fire) / d_aim,
 * d(P) = (cam+0x30 - P) . cam+0x20 (`FUN_00290830` D:L136933-136955), P1 the actor's aim point `+0x1458`, P2 the posed
 * `firepoint` `+0x14b0` through the matrix `+0x1c` (`FUN_00309240`). The knock's vertical cap is ReticuleKnockMax x
 * cam+0x474 x f, the horizontal ReticuleKnockMax x cam+0x470 with no f (`FUN_005c3360` D:L477762-477789); the cone's
 * offsets take k = d_aim / (cam+0x474 x (d_aim - d_fire)) = 1 / (scale x f), the radius none (`FUN_005bd100`
 * D:L474226-474258). d_aim - d_fire exactly 0 (an emplaced weapon sets P1 = P2, D:L477771-477776, D:L474234-474239):
 * f is not applied -- the cap is ReticuleKnockMax x scale and k is 1.0, not 1 / scale.
 */

const eye: [number, number, number] = [0, 15, 0];
const ahead: [number, number, number] = [1, 0, 0];             // the camera's axis
const sd = HELD_RIFLE.stances;

describe('LATER 1141: depthRatio (FUN_00290830 twice, FUN_005c3360 / FUN_005bd100)', () => {
  it('is (d_aim - d_fire) / d_aim along the camera axis; the sign of d cancels', () => {
    // Aim 60 ahead of the eye, firepoint 36 ahead: (60 - 36) / 60 = 0.4.
    expect(depthRatio(eye, ahead, [60, 15, 0], [36, 9, 2])).toBeCloseTo(0.4, 12);
    // Only the depth along the axis counts: the firepoint's height and side do not.
    expect(depthRatio(eye, ahead, [60, 40, -7], [36, 0, 30])).toBeCloseTo(0.4, 12);
    // The camera's +0x20 taken the other way flips both depths: the ratio is the same.
    expect(depthRatio(eye, [-1, 0, 0], [60, 15, 0], [36, 9, 2])).toBeCloseTo(0.4, 12);
  });

  it('is null when d_aim - d_fire is exactly 0 (P1 = P2: the emplaced weapon) -- f not applied', () => {
    expect(depthRatio(eye, ahead, [36, 9, 2], [36, 9, 2])).toBeNull();
  });

  it('goes to 1 as the aim point goes far (FUN_005ab1c0 with no hit: its far point)', () => {
    expect(depthRatio(eye, ahead, [3000, 15, 0], [36, 9, 2])!).toBeGreaterThan(0.98);
  });

  it('is transcribed literally when the muzzle is past the aim point (a wall at the barrel): f <= 0', () => {
    expect(depthRatio(eye, ahead, [30, 15, 0], [36, 9, 2])).toBeCloseTo(-0.2, 12);
  });
});

describe('LATER 1141: the knock cap takes f, the cone k = 1 / (scale x f)', () => {
  it('caps the climb at ReticuleKnockMax x f; the side cap keeps ReticuleKnockMax', () => {
    const a = new Accuracy(HELD_RIFLE);
    for (let i = 0; i < 20; i++) a.round(0, 'stand', HELD_RIFLE, 0.4);
    expect(a.state().offset[1]).toBeCloseTo(-sd.stand.knockMax * 0.4, 9);
    // Without f (no depth known: today's callers) the cap is the whole maximum.
    const b = new Accuracy(HELD_RIFLE);
    for (let i = 0; i < 20; i++) b.round(0, 'stand');
    expect(b.state().offset[1]).toBe(-sd.stand.knockMax);
  });

  it('P1 = P2 (null): the cap is the whole maximum', () => {
    const a = new Accuracy(HELD_RIFLE);
    for (let i = 0; i < 20; i++) a.round(0, 'stand', HELD_RIFLE, null);
    expect(a.state().offset[1]).toBe(-sd.stand.knockMax);
  });

  it('the clamp is the code\'s two branches (D:L477779-477783): if (cap < y) y = cap; else if (y < -cap) y = -cap', () => {
    expect(clampKnock(-50, 18)).toBe(-18);
    expect(clampKnock(20, 18)).toBe(18);
    expect(clampKnock(-5, 18)).toBe(-5);
    // f <= 0 (the muzzle past the aim point) makes the cap negative; transcribed literally, a climbed reticle is thrown
    // to +|cap|, and one inside (cap, -cap) to cap: the odd behaviour the plan names, kept, not "fixed".
    expect(clampKnock(-12, -9)).toBe(9);
    expect(clampKnock(-3, -9)).toBe(-9);
  });

  it('the cone multiplies the knock offset by 1 / (magnification x f); the radius takes no factor', () => {
    const t = tangentPerPixel();
    const a = new Accuracy(HELD_RIFLE);
    for (let i = 0; i < 20; i++) a.round(0, 'stand', HELD_RIFLE, 0.4);
    const c = a.cone(0, 1, 0.4);
    // The capped climb times k: (knockMax x 0.4) x 1 / 0.4 -- the knock lands where the full reticle climb points.
    expect(c.offsetY).toBeCloseTo(sd.stand.knockMax * t.y, 9);
    expect(c.radius).toBeCloseTo(a.state().size * t.y * RADIUS_FACTOR, 12);
    // Today's call (f not given): 1 / magnification, as before.
    expect(a.cone(0, 1).offsetY).toBeCloseTo(sd.stand.knockMax * 0.4 * t.y, 9);
    // P1 = P2: k is 1.0 whatever the magnification (fVar9 = 1.0, D:L474241).
    expect(a.cone(0, 3, null).offsetY).toBeCloseTo(sd.stand.knockMax * 0.4 * t.y, 9);
    // Scoped, the sway takes k too (the block is not scope-gated, D:L474226-474258).
    expect(a.cone(5, 3, 0.5).radius).toBe(0);
  });
});
