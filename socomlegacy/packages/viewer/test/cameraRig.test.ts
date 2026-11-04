// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PRONE_EYE_LOOK_PLACEHOLDER, proneEyeTerms, SCOPE_EYE_READING, scopeEye, scopeEyeHeight, scopePeekShift, toWorld } from '../src/cameraRig';
import { viewFar } from '../src/playerCamera';
import { rootY } from '../src/mover';
import { headPoint } from '../src/net/shotCone';

/**
 * PF-05 (web sprint 25; research 180 §1.3, V1 #2 CONFIRMED in its §8.3): the view from the head -- the scope's and first
 * person's eye -- is `FUN_0029ae50`'s (D:L142565-142624): the camera's node (`cam+0xc8` = the body's `+0x2e8`, the
 * `skel_root`: `FUN_0028e7b0` D:L419606-419608, `FUN_002956e0` D:L139749-139750) at its posed position plus (0, 4.4,
 * -2.5) standing and crouched; prone, y + (max(6q, 0) + 1.8) x 2 / max(n_y, 0.5) and z = max(n_y, 0.5) x 0.7 x -7.
 * The posed roots are the clips' idle roots the animator hands the camera (`WalkMode.setPosedRoot`), pinned in
 * `golden/movement-clips.json` (`idleRootY`, from `MOTION_P.ZAR`).
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLIPS = JSON.parse(readFileSync(resolve(here, 'golden/movement-clips.json'), 'utf8')) as { idleRootY: Record<string, number> };
const posed = CLIPS.idleRootY;

describe("the scope's and first person's eye (FUN_0029ae50, research 180 §1.3)", () => {
  it("the scope's eye is the root + 4.4: 15.884 standing at the stand idle, 9.904 crouched, 2.5 ahead", () => {
    expect(scopeEyeHeight('stand', posed.seal_stand!)).toBeCloseTo(15.884, 3);
    expect(scopeEyeHeight('crouch', posed.seal_crouch!)).toBeCloseTo(9.904, 3);
    const stand = scopeEye('stand', posed.seal_stand!);
    expect(stand[0]).toBe(0);
    expect(stand[2]).toBeCloseTo(-2.5, 12);                         // actor space: -z is ahead
    expect(scopeEye('crouch', posed.seal_crouch!)[2]).toBeCloseTo(-2.5, 12);
    // No posed root (the page before the pack, the room): the stance's measured root, the same idle's.
    expect(scopeEyeHeight('stand', rootY('stand'))).toBeCloseTo(15.884, 3);
    expect(scopeEyeHeight('crouch', rootY('crouch'))).toBeCloseTo(9.904, 3);
  });

  it('prone: 5.768 over the feet and 4.9 ahead on flat ground at a level look (seal_prone\'s root 2.168)', () => {
    const prone = scopeEye('prone', posed.seal_prone!);
    expect(prone[1]).toBeCloseTo(5.768, 3);
    expect(prone[2]).toBeCloseTo(-4.9, 12);
    // The look term and the ground normal the eye is taken at with no body: level, flat (the look term's meaning is owed;
    // the normal's y is the body's own, PRONE-TILT-2 (2)).
    expect(PRONE_EYE_LOOK_PLACEHOLDER).toBe(0);
    expect(proneEyeTerms()).toEqual({ look: 0, groundNormalY: 1 });
    // The formula itself: a slope's normal divides the lift (floored at 0.5) and shortens the reach ahead.
    const slope = scopeEye('prone', 2, 0, { look: 0, groundNormalY: 0.8 });
    expect(slope[1]).toBeCloseTo(2 + 1.8 * 2 / 0.8, 12);
    expect(slope[2]).toBeCloseTo(0.8 * 0.7 * -7, 12);
    const steep = scopeEye('prone', 2, 0, { look: 0, groundNormalY: 0.2 });
    expect(steep[1]).toBeCloseTo(2 + 1.8 * 2 / 0.5, 12);
    expect(steep[2]).toBeCloseTo(0.5 * 0.7 * -7, 12);
    expect(scopeEye('prone', 2, 0, { look: 0.5, groundNormalY: 1 })[1]).toBeCloseTo(2 + (3 + 1.8) * 2, 12);
    expect(scopeEye('prone', 2, 0, { look: -0.5, groundNormalY: 1 })[1]).toBeCloseTo(2 + 1.8 * 2, 12);
  });

  it("the eye follows the posed root (the fp clips' 10.797 gives 15.197) and the peek moves it across", () => {
    expect(scopeEyeHeight('stand', 10.797)).toBeCloseTo(15.197, 3);
    expect(SCOPE_EYE_READING.lift).toBe(4.4);
    expect(scopeEye('stand', 11, 1)[0]).toBeCloseTo(scopePeekShift(1), 12);
    expect(scopeEye('stand', 11, -1)[0]).toBeCloseTo(scopePeekShift(-1), 12);
  });

  it("the room's head (headPoint) is the same eye, on the stance's root or the move's, turned by the yaw", () => {
    const feet: [number, number, number] = [100, 5, -40], yaw = 37;
    for (const posture of ['stand', 'crouch', 'prone'] as const) {
      const head = headPoint({ feet, yaw, posture, moveRoot: null, peek: 0.5 });
      const want = toWorld(feet, yaw, scopeEye(posture, rootY(posture), 0.5));
      for (let i = 0; i < 3; i++) expect(head[i]).toBeCloseTo(want[i]!, 12);
    }
    const moved = headPoint({ feet, yaw, posture: 'stand', moveRoot: 14, peek: 0 });
    expect(moved[1]).toBeCloseTo(5 + 14 + 4.4, 12);
  });
});

// LATER 305's redo (2026-10-24): #427's `reticleFar` retired for `viewFar`, the one helper; its two cases kept.
describe('the reticle far point (FUN_005aa6e0 through FUN_0029bc90; `viewFar`)', () => {
  it('the stored far when it already lies on eye → target, and the optical axis when the pass shoved the eye', () => {
    const eye: [number, number, number] = [0, 10, 0];
    const target: [number, number, number] = [0, 10, 28];
    const far: [number, number, number] = [0, 10, 1000];
    viewFar(eye, target, far).forEach((c, i) => expect(c, `component ${i}`).toBeCloseTo(far[i]!, 9));
    const shoved: [number, number, number] = [4, 10, 0];
    const got = viewFar(shoved, target, far);
    const look = [target[0] - shoved[0], target[1] - shoved[1], target[2] - shoved[2]];
    const to = [got[0] - shoved[0], got[1] - shoved[1], got[2] - shoved[2]];
    const cross = [
      look[1]! * to[2]! - look[2]! * to[1]!,
      look[2]! * to[0]! - look[0]! * to[2]!,
      look[0]! * to[1]! - look[1]! * to[0]!,
    ];
    expect(Math.hypot(...cross)).toBeLessThan(1e-6);
    expect(Math.hypot(...to)).toBeCloseTo(Math.hypot(far[0] - shoved[0], far[1] - shoved[1], far[2] - shoved[2]), 6);
    expect(got[0]).not.toBeCloseTo(far[0], 3);
  });
});
