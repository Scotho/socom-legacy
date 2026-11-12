import { describe, expect, it } from 'vitest';
import { buildGrid, CLAYMORE, CLAYMORE_RULES, type Grid, type GridParams, type ThrowableRecord, type WorldPoly } from '@s2u/scene';
import { GrenadeThrower } from '../src/grenade';
import type { PlaySnapshot } from '../src/walk';

/**
 * R4B-08a (research 392; OT.R97, reading, pending review): r0004's PMN placing gate. r4 0x5c5550's PMN branch (the twin
 * of `FUN_005be9a0`, D:L475338-475369) refuses a PMN placing while the kit's `+0x87c` is above 0 (0x5c5848-0x5c585c;
 * r0001 has no such test, 0x5bec2c-0x5bece8): the placing's own 1.3 s timer (0x3fa66666, written at 0x5c58fc, as r0001's
 * 0x5bed10) -- the swap is refused while it runs (`FUN_005c4fd0` D:L478947), so only the PMN's own placing can
 * hold it. The page's `GrenadeThrower.placing.left` is that timer (`placingClock`, decremented and placed at or under 0
 * as `FUN_005c1970` D:L476883-476901). The page already refuses a second placing while one runs (`pull` outside
 * 'ready', `startPlacing` while `placing`): r0004's outcome by construction. This file holds it, so a change that lets a
 * re-press restart the PMN's placing (what r0001's branch does if it is reached again: the clip re-pushed, 1.3 s
 * rewritten, D:L475354-475360) goes red. Not a port: no RED run exists.
 */

const snap = (over: Partial<PlaySnapshot> = {}): PlaySnapshot => ({
  feet: [100, 50, 200], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
  landing: null, jumps: 0, ...over,
} as PlaySnapshot);

const PMN: ThrowableRecord = {
  ...CLAYMORE, name: 'PMN Mine', id: 158, fuse: 8, removal: 10, explosionDamage: 6.5, explosionRadius: 40, proximity: 10,
  model: 'pmn', icon: 'pmn.tif', capacity: 4,
};

function floor(): Grid {
  const f: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/f', region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-2000, 50, -2000, 2000, 50, -2000, 2000, 50, 2000, -2000, 50, 2000]),
  };
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
  return buildGrid(params, [], [], [f], [{ modelName: 'worldmodel', path: 'worldmodel/f0', first: 0, count: 1 }]);
}

function terrorist() {
  const map = floor();
  const g = new GrenadeThrower({
    grid: () => map, snapshot: () => snap(), view: () => 'third', handPoint: () => [102, 62, 192],
    aim: () => ({ eye: [100, 62, 200], far: [400, 62, 200] }), actors: () => [],
  });
  g.setRecords([PMN]);
  g.setKit(['PMN Mine', null, null]);
  const placed: string[] = [], refused: string[] = [];
  g.on('place', (e) => placed.push(e.item));
  g.on('refuse', (r) => refused.push(r.text));
  const run = (seconds: number): void => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) g.update(1 / 60); };
  return { g, placed, refused, run };
}

describe('R4B-08a: a PMN is refused while its kit timer (+0x87c) runs (r4 0x5c5848-0x5c585c; research 392 §2)', () => {
  it('a re-press inside the 1.3 s neither restarts the timer nor starts a second placing; one PMN down, one spent', () => {
    const s = terrorist();
    expect(s.g.select('PMN Mine')).toBe(true);
    const before = s.g.stats().left;
    s.g.pull();
    expect(s.g.stats().placing).toBe(true);
    expect(s.g.placingClock()).toBeCloseTo(CLAYMORE_RULES.placeSeconds, 6);   // +0x87c = 1.3 (0x5c58fc)
    s.run(0.5);
    const left = s.g.placingClock();
    expect(left).not.toBeNull();
    expect(left!).toBeGreaterThan(0);
    s.g.release();
    s.g.pull();                                                // +0x87c > 0: refused (0x5c5858 -> 0x5c58b0)
    expect(s.g.placingClock()).toBeCloseTo(left!, 6);          // not rewritten to 1.3 (r0001's 0x5bed10 on a re-push)
    expect(s.refused).toEqual([]);                             // no message: the refusal returns before it
    s.run(CLAYMORE_RULES.placeSeconds - 0.5 + 0.1);
    expect(s.placed).toEqual(['PMN Mine']);                    // down at 1.3 s from the first press, once
    expect(s.g.stats().placing).toBe(false);
    expect(s.g.stats().left).toBe(before - 1);
  });
});
