// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import { FlyCamera } from '../src/camera';
import type { FireGun } from '../src/fireCore';
import { Hud } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import { mountFirearm } from '../src/matchFirearm';
import { Play } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
import { packGround, WalkMode, type GroundData } from '../src/walk';

/**
 * SWAPFIRE-CONE-ORDER (research 321; reading, pending review). The round aims by the cone the frame BEGAN with: the
 * original caches the unscoped cone width in body+0x5dc (r0001 `FUN_005bd100`, D:L474214-474225, D:L474264-474271;
 * r0004 0x5c3cb0, read kit+0x84c at 0x5c3dcc, stored at 0x5c4094) from the human controller's update (r0001
 * `FUN_00594cf0` D:L453666; r0004 0x59a6e0 at 0x59bef0), which the body's slot +0x14 runs (r0004 0x557080 at 0x5572bc)
 * in the world's pre-tick pass (priority 1.0; r0001 `FUN_001ec480` D:L50922, r0004 0x1ec5a4 -> 0x2a0a10); the kit's
 * reticle tick (r0001 `FUN_005c2670`, r0004 0x5c9b40, from the kit tick 0x5c7ce0 at 0x5c7d54) runs later in the same
 * frame from the body's slot +0x20 (r0004 0x555800 at 0x555b90) in the post-tick pass (priority 6.0; r0004 0x1ec6cc ->
 * 0x2a06a0). The shot reads the cached field (r0001 `FUN_00592260` D:L451547-451575). So during a settle the round's
 * cone is the previous frame's size, not this frame's (the port measured ~1.67 tighter at the same frame,
 * NADESWAP-PC2: `size_at_fire=4.311 ... original-timing size there 5.980`).
 */

afterEach(() => { vi.restoreAllMocks(); });

const FLOOR: GroundData = packGround(
  { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
  [{
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]),
  }],
  [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }],
);

/** The firearm on a walking body, the page's frame in `main.ts`'s order (`matchFirearm.test.ts`'s `walking`). */
function walking() {
  const scene = new Scene();
  const fly = new FlyCamera(document.createElement('canvas'));
  const walk = new WalkMode(fly);
  const firearm = mountFirearm({
    scene, fly, walk, play: new Play(), remote: new RemotePlayers(scene), hud: new Hud(), loadouts: new PlayerLoadout(),
    view: () => null, map: () => null, body: () => null, net: () => null, blocked: () => false, refreshFog: () => {},
  });
  walk.setGround(FLOOR, [0, 0, 0]);
  fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
  walk.setMode('walk');
  const frame = (dt = 1 / 60): void => {
    walk.frame(dt);
    firearm.gunFrame(dt, true);
    firearm.kitFrame(dt, true);
    firearm.aimReticle(dt);
  };
  return { firearm, frame };
}

describe('SWAPFIRE-CONE-ORDER: the round reads the cone sampled before the frame\'s reticle tick', () => {
  it('during a settle, a round fired on a frame aims by the size the frame began with, not the size after its tick', () => {
    const w = walking();
    for (let i = 0; i < 60; i++) w.frame();                            // down on the floor and still
    const acc = w.firearm.accuracy;
    const s = acc.save();
    acc.load({ ...s, size: 20, offX: 0, offY: 0, swayX: 0, swayY: 0 }); // bloomed, no knock: standing still closes it
    w.frame();                                                         // one frame of the settle at 20
    const began = acc.state().size;
    const radiusBegan = acc.cone(0, 1, null).radius;
    w.frame();                                                         // this frame's tick closes it further
    const after = acc.state().size;
    expect(after).toBeLessThan(began);                                 // settling: the tick moved the size this frame
    const radiusAfter = acc.cone(0, 1, null).radius;
    // The round on this frame (after the gun's frame, as `fireFrame` follows `gunFrame`): random 1 puts the round at
    // the cone's edge (`perturb`: a = offsetX + radius, b = offsetY + radius); dir +z, so `up` is +y and y = radius.
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const gun = (w.firearm.fire as unknown as { gun: FireGun }).gun;
    const out = gun.round([0, 0, 1], null);
    expect(out[1]).toBeCloseTo(radiusBegan, 12);
    expect(out[1]).not.toBeCloseTo(radiusAfter, 6);
  });
  // The review's F4 (research 321 s3.1): each pellet of a pull calls `gun.round` (the draw, then the bloom). In the
  // original the bloom between the pellets writes the kit's size while the draw reads the cache (0x597a90 at body+0x5d4),
  // which nothing rewrites inside the pull -- so every pellet draws from the one sample. This reverses LATER 934's page
  // reading ("the bloom sits between the pellets"): its effect was wrong.
  it("a pull's pellets share one cone: the bloom between them does not reach the next pellet's draw", () => {
    const w = walking();
    for (let i = 0; i < 60; i++) w.frame();
    w.frame();
    const acc = w.firearm.accuracy;
    const radiusBegan = acc.cone(0, 1, null).radius;
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const gun = (w.firearm.fire as unknown as { gun: FireGun }).gun;
    const sizeBefore = acc.state().size;
    const ys = Array.from({ length: 8 }, () => gun.round([0, 0, 1], null)[1]);
    expect(acc.state().size).toBeGreaterThan(sizeBefore);              // the pellets bloomed the kit's size
    for (const y of ys) expect(y).toBeCloseTo(ys[0]!, 12);
    expect(ys[0]).toBeCloseTo(radiusBegan, 12);
  });
});
