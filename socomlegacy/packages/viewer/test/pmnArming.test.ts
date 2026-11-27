import { describe, expect, it } from 'vitest';
import { buildGrid, CLAYMORE, CLAYMORE_RULES, GAME_FRAME_DT, type Grid, type GridParams, type ThrowableRecord, type WorldPoly } from '@s2u/scene';
import { GrenadeThrower } from '../src/grenade';
import type { PlaySnapshot } from '../src/walk';

/**
 * LATER 1075 (research 433 s1; simulation track; a pin of the port's timing against a capture of the original). PC 3's
 * memory-read capture of r0004 (2026-11-18, MP6, n = 3, hand-scored, not harness-scored): the PMN's placing press (the
 * plant action 271 from the R1 row) -> the mine on the trip list 1.33-1.35 s; `Timer1` (+0x8c) 8.0 there, counting at
 * 1.0003 s a guest second -> 0 at 8.00 s; press -> armed 9.33-9.35 s. The page lays it when the kit's timer (+0x87c,
 * 1.3 s, 0x3fa66666, D:L475355-475359) runs out (`FUN_005c1970` D:L476883-476905: decremented and committed in one tick):
 * 39 game frames here, 1.30 s, against the capture's 40 -- the first-decrement frame is research 433's open reading
 * (PMN_ARMING_START_READING). Then its own copy arms 8 s later. So the page's press -> armed is 1.30 + 8 s: within one or
 * two frames of the original's 9.33-9.35 s.
 */

const snap = (): PlaySnapshot => ({
  feet: [100, 50, 200], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
  landing: null, jumps: 0,
} as PlaySnapshot);

const PMN: ThrowableRecord = {
  ...CLAYMORE, name: 'PMN Mine', id: 158, fuse: 8, removal: 10, explosionDamage: 6.5, explosionRadius: 40, proximity: 10,
  model: 'pmn', icon: 'pmn.tif', capacity: 4,
};

function floor(): Grid {
  const f: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/f', region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-2000, 50, 2000, 2000, 50, 2000, 2000, 50, -2000, -2000, 50, -2000]),
  };
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
  return buildGrid(params, [], [], [f], [{ modelName: 'worldmodel', path: 'worldmodel/f0', first: 0, count: 1 }]);
}

describe('LATER 1075: the page lays the PMN at its 1.3 s kit timer and arms it 8 s later (press -> armed 1.3 + 8 s)', () => {
  it('in game frames: laid on frame 39 (1.30 s), tripped by an actor 5 u away only once Timer1 has run out (8 s on)', () => {
    const map = floor();
    let near = false;
    const g = new GrenadeThrower({
      grid: () => map, snapshot: snap, view: () => 'third', handPoint: () => [102, 62, 192],
      aim: () => ({ eye: [100, 62, 200], far: [400, 62, 200] }), actors: () => (near ? [[102, 50, 197]] : []),
    });
    g.setRecords([PMN]);
    g.setKit(['PMN Mine', null, null]);
    let laidAt = -1, burstAt = -1, frame = 0;
    g.on('place', () => { laidAt = frame; near = true; });
    g.on('explode', () => { if (burstAt < 0) burstAt = frame; });
    expect(g.select('PMN Mine')).toBe(true);
    g.pull();                                                       // the press: the kit timer set to 1.3
    expect(g.placingClock()).toBeCloseTo(CLAYMORE_RULES.placeSeconds, 6);
    g.release();
    for (frame = 1; frame <= 400 && burstAt < 0; frame++) g.update(GAME_FRAME_DT);
    expect(laidAt, 'the lay, in game frames from the press').toBe(Math.ceil(CLAYMORE_RULES.placeSeconds / GAME_FRAME_DT - 1e-9));
    expect(laidAt * GAME_FRAME_DT).toBeCloseTo(1.30, 2);
    const armedFrames = Math.ceil(PMN.fuse / GAME_FRAME_DT - 1e-9);
    // Tripped on the frame its Timer1 reaches 0 (the trip test reads +0x8c <= 0, D:L410287): 240 frames, never before.
    expect(burstAt - laidAt, 'lay -> trip, in game frames: on the frame Timer1 reaches 0').toBe(armedFrames);
    const pressToArmed = (burstAt) * GAME_FRAME_DT;
    expect(pressToArmed).toBeGreaterThan(9.28);
    expect(pressToArmed).toBeLessThan(9.32);                        // 279 frames, 9.309 s; the capture: 9.33-9.35 s
  });
});
