import { describe, expect, it } from 'vitest';
import { buildGrid, type WorldPoly } from '@s2u/scene';
import { PRONE_EYE_LOOK_PLACEHOLDER, proneEyeTerms, scopeEye, toWorld } from '../src/cameraRig';
import { rootY, Walker } from '../src/mover';
import { headPoint } from '../src/net/shotCone';

/**
 * PRONE-TILT-2 (2) (research 217 s7.7; reading, pending review): `FUN_0029ae50`'s prone eye (D:L142591-142602) reads the
 * floor normal's y at the body's `+0x1348` (D:L142596) -- the saved normal `actor+0x1344..+0x134c` the aim limits lean by
 * (`Walker.floorNormal`), not the tilt's `+0x410`. Its lift over the root is `(max(6q, 0) + 1.8) x 2 / max(n_y, 0.5)` and
 * its reach ahead `max(n_y, 0.5) x 0.7 x -7`; the look term q stays the placeholder.
 */

const rad = (d: number): number => (d * Math.PI) / 180;
const UPHILL_20 = [0, Math.cos(rad(20)), Math.sin(rad(20))] as const;

function plane(n: readonly number[]): { grid: ReturnType<typeof buildGrid>; y: (x: number, z: number) => number } {
  const y = (x: number, z: number): number => -(n[0]! * x + n[2]! * z) / n[1]!;
  const p: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/slope', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, y(-200, 200), 200, 200, y(200, 200), 200, 200, y(200, -200), -200, -200, y(-200, -200), -200]),
  };
  const grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    [], [], [p], [{ modelName: p.modelName, path: p.path, first: 0, count: 1 }]);
  return { grid, y };
}

describe('the prone eye takes the saved floor normal\'s y (FUN_0029ae50 D:L142591-142602)', () => {
  it('on a 20-degree slope the eye rises by 2 / cos 20 of its 1.8 and reaches cos 20 of its 4.9; flat ground as before', () => {
    expect(PRONE_EYE_LOOK_PLACEHOLDER).toBe(0);
    expect(proneEyeTerms()).toEqual({ look: 0, groundNormalY: 1 });
    const n = Math.cos(rad(20));
    const eye = scopeEye('prone', 2.168, 0, proneEyeTerms(n));
    expect(eye[1]).toBeCloseTo(2.168 + 1.8 * 2 / n, 12);
    expect(eye[2]).toBeCloseTo(n * 0.7 * -7, 12);
    expect(scopeEye('prone', 2.168, 0, proneEyeTerms(1))).toEqual(scopeEye('prone', 2.168));
    expect(scopeEye('prone', 2.168)[1]).toBeCloseTo(5.768, 3);
    expect(scopeEye('stand', 11, 0, proneEyeTerms(n))).toEqual(scopeEye('stand', 11));   // standing reads no normal
  });

  it('the room\'s head (headPoint) takes the body\'s groundNormalY; absent, flat', () => {
    const n = Math.cos(rad(20));
    const b = { feet: [10, 5, -3] as [number, number, number], yaw: 30, posture: 'prone' as const, moveRoot: null, peek: 0 };
    const flat = headPoint(b);
    const sloped = headPoint({ ...b, groundNormalY: n });
    expect(sloped).toEqual(toWorld(b.feet, b.yaw, scopeEye('prone', rootY('prone'), 0, proneEyeTerms(n))));
    expect(sloped[1] - flat[1]).toBeCloseTo(1.8 * 2 / n - 1.8 * 2, 3);
    expect(headPoint({ ...b, groundNormalY: 1 })).toEqual(flat);
  });

  it('a prone walker on the slope: its saved normal\'s y is the slope\'s, and the eye the page places from it matches the transcription', () => {
    const { grid, y } = plane(UPHILL_20);
    const w = new Walker(grid);
    expect(w.place(0, y(0, 0) + 5, 0)).toBe(true);
    w.stance = 'prone';
    for (let i = 0; i < 30; i++) w.tick({ forward: 0, right: 0, boost: false });
    expect(w.floorNormal[1]).toBeCloseTo(Math.cos(rad(20)), 6);
    const eye = scopeEye('prone', 2.168, 0, proneEyeTerms(w.floorNormal[1]));
    expect(eye[1]).toBeCloseTo(2.168 + 3.6 / Math.cos(rad(20)), 5);
  });
});
