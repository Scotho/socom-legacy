// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import type { Walker } from '../src/mover';
import { packGround, WalkMode } from '../src/walk';

/**
 * LATER 305 (the merge controller's call between readings, 2026-10-22: one source; reading, pending review): the
 * original's eye ray -- the round's aim point, C4's and the SWITCH's target, the reticle's pick, the hostage order's --
 * is `FUN_005aa6e0`'s, cast from the camera's eye (`cam+0xd8`) along the matrix `FUN_00296f10` builds after the pass
 * (D:L142028), whose -z is the eye toward the moved look-at target (`playerCamera.ts`'s header, `FUN_0029bc90`); the
 * round leaves the muzzle toward its hit (`FUN_005be9a0` D:L475550; research 84 §19). The page cast toward
 * `FUN_00297410`'s far point instead, which parts from the view once the pass's side probes shift the eye.
 */

function quad(points: number[], ditype: number, path: string): WorldPoly {
  return { modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(points) };
}
const floor = quad([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200], 3, 'worldmodel/floor');
/** A vertical wall across z at `x`, z0..z1, y0..y1. */
const wallX = (x: number, z0: number, z1: number, y0 = 0, y1 = 60): WorldPoly => quad([x, y0, z0, x, y0, z1, x, y1, z1, x, y1, z0], 2, 'worldmodel/wallx');

function walking(polys: WorldPoly[], pitch = 0): { walk: WalkMode; fly: FlyCamera } {
  const ground = packGround(
    { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    polys, polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 })),
  );
  const fly = new FlyCamera(document.createElement('canvas'));
  const walk = new WalkMode(fly);
  walk.setGround(ground, [0, 0, 0]);
  fly.setPose({ x: 0, y: 15.4, z: 0, yaw: 0, pitch });
  expect(walk.setMode('walk')).toBe(true);
  walk.setCamera({ x: 0, y: 15.4, z: 0, yaw: 0, pitch });
  return { walk, fly };
}

const unit = (v: readonly number[]): number[] => { const l = Math.hypot(...v); return v.map((c) => c / l); };
const viewDir = (fly: FlyCamera): number[] => fly.camera.getWorldDirection(new Vector3()).toArray();
/**
 * The game's view -- the pass's eye toward its target (`WalkMode.gameCamera`). Beside a wall the near clearance
 * (#479, H309) may stand the drawn camera off it; the rounds, the reticle's point and the use ray are the game's line.
 */
const gameDir = (walk: WalkMode): number[] => { const g = walk.gameCamera()!; return unit(g.target.map((c, i) => c - g.eye[i]!)); };
/** A camera of the drawn one's projection placed as the game's (`gameCamera`): where the game's frame centres. */
const gameCam = (walk: WalkMode, fly: FlyCamera) => {
  const g = walk.gameCamera()!, cam = fly.camera.clone();
  cam.position.set(g.eye[0]!, g.eye[1]!, g.eye[2]!); cam.lookAt(g.target[0]!, g.target[1]!, g.target[2]!); cam.updateMatrixWorld();
  return cam;
};
const along = (aim: { eye: readonly number[]; far: readonly number[] }): number[] => unit(aim.far.map((c, i) => c - aim.eye[i]!));

describe('LATER 305: the page\'s eye ray runs along the view, the eye toward the moved target', () => {
  it('a side probe shifts the eye off a wall: the aim runs down the view\'s centre line, not toward the far point', () => {
    // A wall along the view line 0.5 to the eye's right (+x at yaw 0): the pass pushes the eye to x = -0.25
    // (`playerCamera.test.ts`, the four side probes); the target stays on the body's line, x = 0.
    const { walk, fly } = walking([floor, wallX(0.5, 5, 60)]);
    const aim = walk.fireAim()!;
    expect(aim.eye[0]).toBeCloseTo(-0.25, 6);                                // the precondition: the eye was shifted
    const dir = along(aim), view = gameDir(walk);
    dir.forEach((c, i) => expect(c, `component ${i}: ${dir.join(', ')} against the view ${view.join(', ')}`).toBeCloseTo(view[i]!, 6));
    expect(dir[0]).toBeGreaterThan(0.008);                                   // 0.25 over ~28.75 to the target: toward it
    // The reticle at rest is the game's frame's centre: the aim point projects there.
    const ndc = new Vector3(...aim.far).project(gameCam(walk, fly));
    expect(ndc.x).toBeCloseTo(0, 6);
    expect(ndc.y).toBeCloseTo(0, 6);
  });

  it('looking down at -70 with the eye shifted, the line still runs down the view', () => {
    const { walk } = walking([floor, wallX(0.5, -60, 60)], -70);
    const aim = walk.fireAim()!;
    expect(aim.eye[0]).toBeLessThan(-0.01);                                  // shifted
    const dir = along(aim), view = gameDir(walk);
    dir.forEach((c, i) => expect(c).toBeCloseTo(view[i]!, 6));
  });

  it('no side shift: the line is the far-point cast it was, within float rounding', () => {
    const { walk, fly } = walking([floor]);
    const aim = walk.fireAim()!;
    expect(aim.eye[0]).toBe(0);
    expect(aim.eye[1]).toBeCloseTo(21.484, 3);
    expect(aim.eye[2]).toBeCloseTo(28.75, 3);
    expect(aim.far[0]).toBeCloseTo(0, 9);
    expect(aim.far[1]).toBeCloseTo(21.484, 3);
    const dir = along(aim), view = viewDir(fly);
    dir.forEach((c, i) => expect(c).toBeCloseTo(view[i]!, 9));
  });

  it('the view from the head (the scope) is untouched: the far point 1000 along the look from the head\'s eye', () => {
    const { walk } = walking([floor, wallX(0.5, 5, 60)]);
    walk.setScoped(true);
    expect(walk.view()).toBe('scope');
    const aim = walk.fireAim()!;
    const d = aim.far.map((c, i) => c - aim.eye[i]!);
    expect(Math.hypot(...d)).toBeCloseTo(1000, 9);
    expect(d[0]).toBeCloseTo(0, 9);                                          // yaw 0, pitch 0: straight down -z
    expect(d[1]).toBeCloseTo(0, 9);
    expect(d[2]).toBeCloseTo(-1000, 9);
  });
});

/**
 * LATER 305 with #427 (the agreement of 2026-10-23, the plan's Log; the redo of 2026-10-24): one line for the shot, the
 * reticle and the use prompt -- `lookAim` is `{ drawnEye ?? placed.eye, drawnFar ?? placed.far }`, its far `aim()`'s,
 * where #427's `reticleFar` and the pre-pass far point used to part once the pass shifted the eye.
 */
describe('LATER 305 / #427: the use ray is the reticle\'s line', () => {
  it('third person, the eye shifted by a wall: on the ground the use ray is the shot\'s, its far the reticle\'s', () => {
    const { walk } = walking([floor, wallX(0.5, 5, 60)]);
    const shot = walk.fireAim()!, look = walk.lookAim()!;
    expect(shot.eye[0]).toBeCloseTo(-0.25, 6);                               // the precondition: the eye was shifted
    expect(look).toEqual(shot);
    expect(look.far).toEqual(walk.aim());
  });

  for (const scoped of [false, true]) {
    it(`a drawn offset (${scoped ? 'the head\'s view' : 'third person'}): the use ray from the drawn eye, its far the reticle's, the shot's line moved by it`, () => {
      const { walk } = walking([floor]);
      if (scoped) { walk.setScoped(true); expect(walk.view()).toBe('scope'); }
      for (let i = 0; i < 5; i++) walk.frame(1 / 60);
      const w = (walk as unknown as { walker: Walker }).walker;
      w.drawOffset = [3, 0, -4];                                             // after a tick, as the turret page sets it
      walk.frame(1 / 60);
      const d = [0, 1, 2].map((k) => w.drawnFeet()[k]! - w.tickFeet()[k]!);
      expect(Math.hypot(...d)).toBeGreaterThan(1);                           // the precondition: the drawn eye moved
      const shot = walk.fireAim()!, look = walk.lookAim()!;
      for (let k = 0; k < 3; k++) {
        expect(look.eye[k]! - shot.eye[k]!, `the eye's axis ${k}`).toBeCloseTo(d[k]!, 6);
        expect(look.far[k]! - shot.far[k]!, `the far point's axis ${k}`).toBeCloseTo(d[k]!, 6);
      }
      expect(look.far).toEqual(walk.aim());
    });
  }
});
