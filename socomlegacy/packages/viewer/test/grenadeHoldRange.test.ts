import { describe, expect, it } from 'vitest';
import {
  GAME_FRAME_DT, heldPower, launchGrenade, maxThrowDistance, stepGrenade, stepThrowPower,
  surfaceMaterial, throwAnim, throwVelocity, type HullCast,
} from '@s2u/scene';
import { meterLayout, meterPower } from '../src/reticle';

// Controlled flat-floor flight: distance to first impact, not the predicted arc or bounce roll.
const ground: HullCast = (a, b) => {
  if (a[1] < 0 || b[1] > 0 || a[1] === b[1]) return [];
  const t = a[1] / (a[1] - b[1]);
  return [{ point: [a[0] + (b[0] - a[0]) * t, 0, a[2] + (b[2] - a[2]) * t],
    normal: [0, 1, 0], t, material: surfaceMaterial(0, 'STONE') }];
};
describe('digital grenade hold strength, meter and actual flight', () => {
  for (const hz of [30, 60, 120]) for (const stance of ['stand', 'crouch', 'prone'] as const) for (const aim of [0, 0.2]) {
    it(`${hz} Hz, ${stance}, aim sine ${aim}: longer holds fill the meter and land farther`, () => {
      const rows: { power: number; fill: number; distance: number }[] = [];
      for (const seconds of [0.1, 0.2, 0.4, 0.8, 1.6, 3]) {
        const power = heldPower(seconds, 1 / hz);
        const anim = throwAnim(power, aim, stance);
        const shot = throwVelocity(power, aim, anim.offset, maxThrowDistance(stance));
        const g = launchGrenade([...anim.offset], [...shot.velocity]);
        let distance: number | null = null;
        for (let i = 0; i < 180; i++) {
          const hit = stepGrenade(g, GAME_FRAME_DT, ground).find(e => e.kind === 'bounce');
          if (hit?.kind === 'bounce') { distance = Math.hypot(hit.point[0] - anim.offset[0], hit.point[2] - anim.offset[2]); break; }
        }
        expect(distance, 'the grenade reaches the controlled floor before its fuse ends').not.toBeNull();
        const fill = meterLayout({ width: 915, height: 412 }, [457.5, 206], meterPower(power, 3), { width: 64, height: 64 }).quads[0]!.height;
        rows.push({ power, fill, distance: distance! });
      }
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i]!.power).toBeGreaterThan(rows[i - 1]!.power);
        expect(rows[i]!.fill).toBeGreaterThan(rows[i - 1]!.fill);
        expect(rows[i]!.distance).toBeGreaterThan(rows[i - 1]!.distance);
      }
      expect(rows.at(-1)!.power).toBeLessThanOrEqual(1);
      expect(rows.at(-1)!.power).toBeGreaterThan(0.999);
    });
  }
  it('full hold saturates instead of wrapping, and release retains the built strength', () => {
    const power = heldPower(10);
    expect(power).toBeCloseTo(1, 8);
    expect(stepThrowPower(power, 0, GAME_FRAME_DT)).toEqual({ power, release: true });
    expect(meterPower(power, 0)).toBe(0);
  });
});
