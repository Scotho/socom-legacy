import { describe, expect, it } from 'vitest';
import { localCamera, scopeEye, toWorld } from '../src/cameraRig';
import { FIRST_TO_THIRD_PITCH_CLAMP, repitchToward, toActor } from '../src/headRepitch';

/**
 * FP-REPITCH (the controller's ruling (B), 2026-11-25): the one-shot re-pitch on a view switch, transcribed from r0001's
 * FUN_0029a3f0 (third -> first, D:L142266-142320), FUN_00299ed0 (first -> third, clamped, D:L142129-142198) -- r0004's
 * FUN_0029b980 / FUN_0029b460 (ATLAS's throw-aim reading s13.2, reading pending review). The bars are r0004's numbers
 * (PC 2: REPITCH-BACK-PC2, C7-OFFCLAMP-PC2; MP51 face 1575, heading 298.6).
 */
describe('FP-REPITCH: the view switch re-pitches toward the stored aim point', () => {
  it('third -> first: the pitch becomes the elevation from the head eye to T (REPITCH-BACK-PC2: -9.17 -> +4.28 / +4.25)', () => {
    // the first-person eye placed on the switch (cam+0xd8) and the stored point +0x1458 of the pass before
    const eye = [1342.01, -11.33, 435.19], T = [1361.82, -9.64, 423.98];
    const p = repitchToward(eye, T, 298.6, -9.17, false);
    expect(p).toBeGreaterThan(4.15);
    expect(p).toBeLessThan(4.35);
  });

  it('first -> third: from the tether target, clamped (REPITCH-BACK-PC2: +4.28 -> -8.70 on both trials)', () => {
    // the feet from REPITCH-BACK's first-person eye (cam+0xd8 = the head eye on the switch) through the port's own
    // FUN_0029ae50 (`scopeEye`, standing, the root at rest 11.484 -- ATLAS s13.9: the throw clip's dip comes later); the
    // tether's target then the port's FUN_0029a950 (`localCamera`) at the first-person pitch, as the switch back reads it
    const root = 11.484, head = toWorld([0, 0, 0], 298.6, scopeEye('stand', root));
    const eye = [1342.01, -11.33, 435.19];
    const feet = [eye[0]! - head[0], eye[1]! - head[1], eye[2]! - head[2]];
    const vertex = toWorld(feet, 298.6, localCamera(root, 4.28).target);
    const p = repitchToward(vertex, [1361.82, -9.64, 423.98], 298.6, 4.28, true);
    expect(p).toBeGreaterThan(-8.9);
    expect(p).toBeLessThan(-8.5);
  });

  it('the body y-z plane: a point straight ahead at the eye\'s height is level whatever the look; across is ignored', () => {
    // to 1e-3 degree: the wrap's loops use the original's float 6.2831855 (D:L142309-142316), not 2 pi, and keep its residue
    expect(repitchToward([0, 10, 0], [0, 10, -50], 0, -9.17, false)).toBeCloseTo(0, 3);
    expect(repitchToward([0, 10, 0], [30, 10, -50], 0, 20, false)).toBeCloseTo(0, 3);      // x (right) is no part of it
    expect(repitchToward([0, 0, 0], [0, 50, -50], 0, 0, false)).toBeCloseTo(45, 3);
    expect(repitchToward([0, 0, 0], [50, -50, 0], 270, 0, false)).toBeCloseTo(-45, 3);     // yaw 270 faces +x
  });

  it('first -> third alone is clamped to +-1.57 rad (0x3fc8f5c3, D:L142185-142194); third -> first is not', () => {
    expect(FIRST_TO_THIRD_PITCH_CLAMP).toBeCloseTo(1.57, 6);
    // a point above and BEHIND the vertex: the wrapped difference passes the clamp
    const free = repitchToward([0, 0, 0], [0, 50, 1], 0, 0, false);
    const held = repitchToward([0, 0, 0], [0, 50, 1], 0, 0, true);
    expect(free).toBeGreaterThan(90);
    expect(held).toBeCloseTo((1.57 * 180) / Math.PI, 4);
  });

  it('toActor is toWorld\'s inverse', () => {
    const feet = [12, -3, 40], v = [1.5, 7, -22];
    const w = toWorld(feet, 298.6, v);
    const back = toActor(feet, 298.6, w);
    for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(v[i]!, 9);
  });
});
