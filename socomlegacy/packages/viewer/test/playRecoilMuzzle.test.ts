// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Group } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import type { MotionClip, MotionPart } from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';
import { FlyCamera } from '../src/camera';
import { buildBody } from '../src/bodyView';
import { DEFAULT_LIGHTING } from '../src/lighting';
import { loadMap } from '../src/loadMap';
import { packGround, WalkMode, type GroundData } from '../src/walk';
import { Play } from '../src/play';

/**
 * Research 442, the main controller's ruling (B) on the review's blocker: the recoil bend is the picture only. The gun
 * as drawn bends with the hand, but the muzzle (the round's leg, the tracer's start, the pip's muzzle ray) and the
 * launch point keep the UNBENT arm chain's (`RECOIL_BEND_MUZZLE_READING`: whether the original's firepoint `+0x14b0` is
 * posed after `FUN_0057b550` is unread). Frostfire's fixture body, as `play.test.ts` builds it.
 */
const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
};
const GROUND: GroundData = packGround(
  { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
  [{
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, 0, 200, 200, 0, 200, 200, 0, -200, -200, 0, -200]),
  }],
  [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }],
);
function still(name: string, frames: number): MotionClip {
  const parts: MotionPart[] = [{
    index: 0, name: 'skel_root', flags: 0x3c, translations: Float32Array.of(0, 11, 0), rotations: Float32Array.of(0, 0, 0, 1),
  }];
  return { name, version: 5, duration: frames / 30, frameCount: frames, rate: 30, unknown10: -1, unknown14: 1, parts };
}
const MP2 = fixture('RUN/MP2.ZDB');
const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));

describe.skipIf(MP2 === null)('research 442: the bend moves the drawn gun, not the muzzle or the launch point (ruling B)', () => {
  it('with a full bend the muzzle and the launch point equal the unbent pose\'s', async () => {
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB');
    const fly = new FlyCamera(canvas());
    const walk = new WalkMode(fly);
    walk.setGround(GROUND, [0, 0, 0]);
    const view = buildBody(map.body!, map, DEFAULT_LIGHTING);
    const play = new Play();
    play.setBody(view, map.body!);
    const rifle = new Group();
    play.setWeapon(rifle, [{ name: 'firepoint', at: [7.7854, 0.8338, 0] }, { name: 'firepoint_203', at: [5.5, -1.2, 0] }]);
    play.setClips({ clips: [still('seal_stand', 10), still('seal_fp_stand', 8)], table: null });
    play.setWeaponInput(() => ({ trigger: false, aiming: false }));
    fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
    walk.setMode('walk');
    for (let i = 0; i < 3; i++) play.frame(1 / 60, walk, fly.camera);
    const muzzle0 = play.muzzle()!, launch0 = play.launchPoint();
    const drawn0 = Array.from(rifle.matrix.elements);
    expect(muzzle0).not.toBeNull();
    play.recoilShot(10);                                       // the cap: the fullest bend
    play.frame(1 / 60, walk, fly.camera);
    // The picture: the drawn gun has moved with the bent hand.
    const moved = Array.from(rifle.matrix.elements).some((v, i) => Math.abs(v - drawn0[i]!) > 1e-3);
    expect(moved, 'the drawn gun bends').toBe(true);
    // What the game does: the muzzle and the launch point are the unbent pose's (float32 skeleton matrices: 1e-4).
    const muzzle1 = play.muzzle()!;
    muzzle1.forEach((c, i) => expect(c).toBeCloseTo(muzzle0[i]!, 4));
    const launch1 = play.launchPoint();
    if (launch0) launch1!.forEach((c, i) => expect(c).toBeCloseTo(launch0[i]!, 4));
    view.dispose();
    walk.unbindKey();
  });
});
