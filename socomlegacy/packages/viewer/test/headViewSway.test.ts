// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { CollisionOwner, WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { CameraEffects, publishCameraEffects } from '../src/cameraEffects';
import { packGround, TICK, WalkMode, type GroundData } from '../src/walk';

/**
 * LATER 1251 (the bodies seat, 2026-11-19; a reading, pending review): the map's camera sway (`camera_jiggle`'s
 * `camera_effects`, LATER 1246) turns the HEAD's view and the scope too -- `FUN_002998f0` multiplies the node into the view
 * after every camera mode (D:L142020-142024). LATER 1246 built it in the third person (`playerCamera.ts` `view()`); the
 * head's view builds its own look in `walk.ts` (`follow()`'s head branch, `noteTick`'s non-third branch). Here, with a
 * node turned and published, the head view's aim (`fireAim`, the shot's and the use pick's) turns by it, the eye unmoved;
 * with none published it is today's. Unit test (a synthetic floor).
 */

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
};
function floor(): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]),
  };
}
function ground(polys: WorldPoly[]): GroundData {
  return packGround(
    { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    polys, polys.map((p, i): CollisionOwner => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 })),
  );
}

const made: WalkMode[] = [];
afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); publishCameraEffects(null); });

/** A node turned by `k` rad/s about its local y for 1 s (a yaw of about k), the legs' own form (`CameraEffects.motion`). */
function turnedNode(k: number): CameraEffects {
  const node = new CameraEffects();
  node.rotate({ op: 'rotate', node: 1, flags: 1, xyz: [0, 0, 0] } as never);
  const leg = node.motion({ op: 'motion', motion: { node: 1, flags: 0x101, lifetime: 1, angular: { w: [0, k, 0], accel: [0, 0, 0] } } } as never);
  for (let i = 0; i < 60; i++) leg(1 / 60);
  return node;
}

function headAim(): { eye: number[]; dir: number[] } {
  const fly = new FlyCamera(canvas());
  fly.setScale(0.1);
  fly.setAspect(16 / 9);
  const mode = new WalkMode(fly, () => undefined);
  mode.setGround(ground([floor()]), [0, 0, 0], null);
  made.push(mode);
  fly.setPose({ x: 0, y: 30, z: 0, yaw: 30, pitch: -5 });
  expect(mode.setMode('walk')).toBe(true);
  for (let t = 0; t < 1; t += TICK) mode.frame(TICK);
  mode.setScoped(true);
  mode.frame(TICK);
  const a = mode.fireAim()!;
  const d = [a.far[0] - a.eye[0], a.far[1] - a.eye[1], a.far[2] - a.eye[2]], l = Math.hypot(d[0]!, d[1]!, d[2]!);
  return { eye: [...a.eye], dir: d.map((v) => v / l) };
}

describe('LATER 1251: the head view and the scope carry the camera sway', () => {
  it('a turned camera_effects turns the head view aim by its angle; the eye does not move', () => {
    const still = headAim();
    const k = 0.01;                                              // a visible test turn (the disc's own is 0.05 deg/s)
    publishCameraEffects(turnedNode(k));
    const swayed = headAim();
    for (let i = 0; i < 3; i++) expect(Math.abs(swayed.eye[i]! - still.eye[i]!), 'the eye unmoved').toBeLessThan(1e-6);
    const cos = still.dir[0]! * swayed.dir[0]! + still.dir[1]! * swayed.dir[1]! + still.dir[2]! * swayed.dir[2]!;
    const angle = Math.acos(Math.min(1, cos));
    console.log(`LATER 1251 head view: the aim turned ${angle.toExponential(3)} rad by a node turned ~${k}`);
    expect(angle).toBeGreaterThan(k * 0.9);
    expect(angle).toBeLessThan(k * 1.1);
  });

  it('the drawn head view turns with the aim, and the tick aim (the shot) carries the same turn (the review F1, F2)', () => {
    publishCameraEffects(turnedNode(0.01));
    const fly = new FlyCamera(canvas());
    fly.setScale(0.1);
    fly.setAspect(16 / 9);
    const mode = new WalkMode(fly, () => undefined);
    mode.setGround(ground([floor()]), [0, 0, 0], null);
    made.push(mode);
    fly.setPose({ x: 0, y: 30, z: 0, yaw: 30, pitch: -5 });
    expect(mode.setMode('walk')).toBe(true);
    for (let t = 0; t < 1; t += TICK) mode.frame(TICK);
    mode.setScoped(true);
    mode.frame(TICK);
    const a = mode.fireAim()!;
    const aim = [a.far[0] - a.eye[0], a.far[1] - a.eye[1], a.far[2] - a.eye[2]];
    const l = Math.hypot(aim[0]!, aim[1]!, aim[2]!);
    // The drawn camera's forward (-z in its frame) against the aim: together (the scope's centred cross on the round).
    fly.camera.updateMatrixWorld();
    const e = fly.camera.matrixWorld.elements, fwd = [-e[8]!, -e[9]!, -e[10]!];
    const cosDrawn = (fwd[0]! * aim[0]! + fwd[1]! * aim[1]! + fwd[2]! * aim[2]!) / l / Math.hypot(fwd[0]!, fwd[1]!, fwd[2]!);
    expect(Math.acos(Math.min(1, cosDrawn)), 'the drawn view on the aim').toBeLessThan(1e-4);
    // The shot's tick aim (`tickAim`, `noteTick`'s head branch) on the same turned line.
    const tick = mode.tickAim(Number.POSITIVE_INFINITY);
    if (tick) {
      const d = [tick.far[0] - tick.eye[0], tick.far[1] - tick.eye[1], tick.far[2] - tick.eye[2]], m = Math.hypot(d[0]!, d[1]!, d[2]!);
      const cosTick = (d[0]! * aim[0]! + d[1]! * aim[1]! + d[2]! * aim[2]!) / l / m;
      expect(Math.acos(Math.min(1, cosTick)), 'the tick aim on the follow aim').toBeLessThan(2e-3);
    }
    expect(tick, 'a tick was noted').not.toBeNull();
  });

  it('with no node published the head view aim is unchanged', () => {
    const a = headAim(), b = headAim();
    for (let i = 0; i < 3; i++) expect(Math.abs(a.dir[i]! - b.dir[i]!)).toBeLessThan(1e-9);
  });
});
