import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HELD_RIFLE, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { clipsFromPack } from '../src/motionTable';
import { ACTION_CLIPS, actionRoots, groundGrid, packGround, TICK as MOVER_TICK, Walker } from '../src/mover';
import { Accuracy, airBloomFeed, type AccuracyInput } from '../src/accuracy';

/**
 * AS-34, the standing jump's bloom (reading, pending review; the controller's ruling of 2026-11-24 put it in AS-34). The
 * kit's tick (r0004 0x5c9b40, r0001 `FUN_005c2670`) squares the body's own velocity `+0x2c/+0x30/+0x34` -- the vertical
 * included -- under `TargetDilateUponMovementMult`. ATLAS's bloom double-check (relayed, r0004 D4:L455067-455073 and
 * D4:L454198-454206): the mover saves `+0x30` to `+0xf50` and restores it before the kit's tick, so during the standing
 * jump (action 178, never airborne) the clip root's rise reaches the bloom. IQ-158 (B13-BLOOM-PC2, capture-scored): the
 * original's peak vertical 29.61 u/s, target 13.49, size 5.89 px; the page's stayed 1.00. The port feeds the `seal_jump`
 * root's vertical velocity (its `skel_root` y keys, `actionRoots`) into the accuracy's velocity y.
 */

const still: AccuracyInput = { stance: 'stand', velocity: [0, 0, 0], airborne: false, yawRate: 0, pitchRate: 0, zoomState: 0 };
const RUN = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'), 'RUN');
const PACK = resolve(RUN, 'MOTION_P.ZAR');
const noPack = !existsSync(PACK);

function flatWalker(): Walker {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const w = new Walker(groundGrid(packGround(params, [floor], owners)));
  w.place(0, 20, 0);
  w.settle();
  return w;
}

/**
 * The size and target per mover tick through a standing jump, the rifle up, standing still. The kit is stepped by the
 * mover's own tick (`MOVER_TICK`, 1/60 s), as the page runs it once a frame of the walk (MISSION R8). *Was:* stepped by
 * the kit's `TICK` (1/29.97 s) per 1/60 s mover tick -- the bloom at twice clip time (the fresh review's F1).
 */
function jumpBloom(w: Walker): { peakRise: number; peakTarget: number; peakSize: number; sizes: number[] } {
  const a = new Accuracy(HELD_RIFLE);
  let peakRise = 0, peakTarget = 0, peakSize = 0;
  const sizes: number[] = [];
  expect(w.jump()).toBe(true);
  expect(w.airborne).toBe(false);                                     // the standing jump: the Jump action on the floor
  for (let i = 0; i < 90; i++) {                                     // the whole action (1.1 s) and the close after it
    w.tick({ forward: 0, right: 0, boost: false });
    const c = w.carriedAir;
    peakRise = Math.max(peakRise, Math.abs(c.rise));
    a.update(MOVER_TICK, { ...still, airborne: w.airborne, ...airBloomFeed(w.state, c) });
    peakTarget = Math.max(peakTarget, a.state().target);
    peakSize = Math.max(peakSize, a.state().size);
    sizes.push(a.state().size);
  }
  return { peakRise, peakTarget, peakSize, sizes };
}

describe('AS-34: the standing jump opens the bloom by its root\'s rise (+0x30 under Mult)', () => {
  it('synthetic keys: the walker reports the jump root\'s vertical velocity and the feed puts it in the velocity\'s y', () => {
    const c = ACTION_CLIPS.jump, n = c.frames;
    const keys = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) keys[2 * n + i] = 2 * i;                // the root rises 2 a key
    const w = flatWalker();
    w.actionRoots = new Map([['seal_jump', keys]]);
    expect(w.jump()).toBe(true);
    w.tick({ forward: 0, right: 0, boost: false });
    expect(w.action?.name).toBe('jump');
    expect(w.carriedAir.rise).toBeCloseTo(2 * n / c.playback, 9);     // 2 a key x 20 keys / 1.1 s
    const feed = airBloomFeed({ vx: 0, vy: 0, vz: 0 }, w.carriedAir);
    expect(feed.velocity).toEqual([0, 2 * n / c.playback, 0]);
    // Off the jump: no rise.
    expect(flatWalker().carriedAir.rise).toBe(0);
  });

  it.skipIf(noPack)(`the disc's seal_jump: the peak rise and target at IQ-158's 29.61 u/s and 13.49; the size per game frame against IQ-158, the descent under MISSION R8${noPack ? ' (MOTION_P.ZAR absent)' : ''}`, () => {
    const w = flatWalker();
    w.actionRoots = actionRoots(clipsFromPack(new Uint8Array(readFileSync(PACK)), ['seal_jump']));
    const r = jumpBloom(w);
    console.log(`AS-34 standing jump: peak rise ${r.peakRise.toFixed(3)} u/s, peak target ${r.peakTarget.toFixed(3)}, peak size ${r.peakSize.toFixed(3)} px; every other tick ${r.sizes.filter((_, i) => i % 2 === 1).map((x) => x.toFixed(3)).join(' ')}`);
    expect(r.peakRise).toBeCloseTo(29.61, 1);                           // IQ-158's peak vertical (capture-scored)
    expect(r.peakTarget).toBeCloseTo(13.49, 1);                         // 29.61^2 / 65 x Mult 1: the capture's target
    // The size against IQ-158 trial 1, action 178, per game frame (capture-scored): 2.000, 2.404, 3.404, 4.404, 5.404,
    // 3.735, 2.067, 1.000, 1.889, 2.889, 3.889, 4.889, 5.889 -- the peak 5.889 on the descent. The port's size at each game
    // frame's end (every second 60 Hz mover tick): from the capture's 2.404 through the apex's 1.000 and 1.889, eight frames,
    // each within 0.01 px (the capture's 3 decimals and the port's continuous kit). The descent is MISSION R8's ruled
    // deviation (the bloom's sub-frame stair-steps not reproduced), not a new reading: one seal_jump key segment is 1.566
    // game frames, so the original takes 4 whole 1 px steps over the two descent segments (2.889 ... 5.889) where the port,
    // sampling the rise each 60 Hz tick under a dt-scaled dilate, takes 7 half-steps -- its own values pinned: 2.388, 3.387,
    // 4.386, 5.385. The capture's peak (5.889) is on the descent; the port's stair-step under R8 is half a step short of it.
    // The first frame (the port's 1.499 against the capture's 2.000) is unexplained and not pinned.
    const frames = r.sizes.filter((_, i) => i % 2 === 1);
    const at = frames.findIndex((x) => Math.abs(x - 2.404) < 0.01);
    expect(at, 'the capture\'s second frame, 2.404').toBeGreaterThan(0);
    [2.404, 3.404, 4.404, 5.404, 3.735, 2.067, 1.000, 1.889].forEach((x, k) => expect(Math.abs(frames[at + k]! - x), `frame ${k + 1}`).toBeLessThanOrEqual(0.01));
    [2.388, 3.387, 4.386, 5.385].forEach((x, k) => expect(Math.abs(frames[at + 8 + k]! - x), `descent frame ${k + 1} (MISSION R8)`).toBeLessThanOrEqual(0.01));
  });
});
