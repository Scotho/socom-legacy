import { describe, expect, it } from 'vitest';
import { buildGrid, CLAYMORE, THROW_ANIMS, type Grid, type GridParams, type ThrowableRecord, type V3, type WorldPoly } from '@s2u/scene';
import { aimReach } from '../src/fireCore';
import { GrenadeThrower, type GrenadeSource } from '../src/grenade';
import { aimVectorOf, HAND_OPEN_CAST_READING, handOpenCast, handOpenClear, throwClear, throwClearanceSegment } from '../src/throwCommit';
import {
  bodyThrowAim, THROW_AIM_BODIES_PLACEHOLDER, THROW_AIM_CAP_PLACEHOLDER, THROW_AIM_CONE_READING, THROW_AIM_ORIGIN_LATCH_READING,
  throwAimKept, throwAimOrigin, throwAimReach, throwAimVector,
} from '../src/throwAim';
import type { PlaySnapshot } from '../src/walk';

/**
 * LANE-KILL B-06 (research 256 s5.3; reading of r0004, two readers, pending review; the standing origin a fitted
 * calibration to the capture, PC 3, 2026-11-21, record D:/s2u-captures/kill-item1-20261121T0305Z/kill-item1-20261121T0305Z.zip, sha256 b65866b086c6451ff4093d6f91d8defab9e34070ab72a13c933aa1cfbafeb3de): the body's throw aim `actor+0x144c..0x1454` as r0004's `0x5e6690` forms it
 * -- T the camera ray's nearest kept hit, else its far end; O the feet raised and carried ahead; the body's frame; the
 * stance's cone -- and r0004's hand-open cast (0x5c92b4-0x5c93ac).
 */

const DEG = Math.PI / 180;
const poly = (points: number[], i: number, material = 7, ditype = 2): WorldPoly => ({
  modelName: 'worldmodel', path: `worldmodel/w${i}`, region: 0, ditype, material, ptcount: 4, cameratype: 0, points: Float32Array.from(points),
});
/** A wall across z there, x -200..200, y 0..200, its normal +z: it faces a body at a larger z looking toward -z. */
const wallAt = (z: number, i: number, material = 7): WorldPoly => poly([-200, 0, z, 200, 0, z, 200, 200, z, -200, 200, z], i, material);
const gridOf = (walls: WorldPoly[]): Grid => {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
  return buildGrid(params, [], [], walls, walls.map((p, i) => ({ modelName: 'worldmodel', path: `${p.path}${i}`, first: i, count: 1 })));
};
const STONE = 7, SEE_THROUGH = 3;                         // INVISIBLE_DI: PENETRATION 1 without PICKUP, never kept by the eye
const kept = throwAimKept('');
const close = (a: readonly number[], b: readonly number[], d = 6): void => { for (let k = 0; k < 3; k++) expect(a[k]).toBeCloseTo(b[k]!, d); };
const unit = (v: readonly number[]): V3 => { const l = Math.hypot(v[0]!, v[1]!, v[2]!); return [v[0]! / l, v[1]! / l, v[2]! / l]; };

describe('LANE-KILL B-06: the throw aim (r0004 0x5e6690; research 256 s5.3)', () => {
  it('names its values: the latched origin (stand, crouch, prone), the cone, the cap and the bodies', () => {
    // Prone 1.356: KILL-LATCH (PC 2, D:/s2u-records/KILL-LATCH-PC2/KILL-LATCH-PC2.zip, sha256
    // 5bcf4f60b800abcb29c421056a687fa17efce098c6579275d1457fc62670ccc0; RESULTS.md s1), 3/3; was the 0.397 placeholder.
    expect(THROW_AIM_ORIGIN_LATCH_READING).toEqual({ stand: { up: 13.11, ahead: 0 }, crouch: { up: 8.76, ahead: 0 }, prone: { up: 1.356, ahead: 0 } });
    expect(throwAimOrigin('stand')).toBe(THROW_AIM_ORIGIN_LATCH_READING.stand);
    expect(throwAimOrigin('crouch')).toBe(THROW_AIM_ORIGIN_LATCH_READING.crouch);
    expect(throwAimOrigin('prone')).toBe(THROW_AIM_ORIGIN_LATCH_READING.prone);
    expect(THROW_AIM_CONE_READING).toEqual({ stand: { up: 85, down: 85, yaw: 85 }, prone: { up: 20, down: 20, yaw: 45 } });
    expect(THROW_AIM_CAP_PLACEHOLDER).toBeNull();
    expect(THROW_AIM_BODIES_PLACEHOLDER).toBe('hull only');
    expect(HAND_OPEN_CAST_READING).toBe(25);
  });

  it("the ray's length is AD-1's aimReach with no camera cap: 600 floor, the M67's range above it", () => {
    for (const r of [0, 100, 600, 601, 100000]) expect(throwAimReach(r)).toBe(aimReach(r, null));
    expect(throwAimReach(100)).toBe(600);
  });

  it('O: the feet raised by up and carried ahead along the facing; T the far end with nothing hit', () => {
    const feet: V3 = [10, 5, 20], o = THROW_AIM_ORIGIN_LATCH_READING.stand;
    // The eye 30 up and 20 behind, looking level along -z: no grid, T is its end 100 out.
    const ray = { eye: [10, 35, 40], far: [10, 35, 0], reach: 100, kept };
    const { aim, point } = throwAimVector(null, ray, { feet, yaw: 0, stance: 'stand' });
    close(point, [10, 35, -60]);
    close(aim, unit([0, 35 - (5 + o.up), -60 - (20 - o.ahead)]));
    // Crouched (no latch: the stance) takes the crouch latch's height, ahead 0; prone the prone latch's, here past its
    // 20-degree cone (the ray 40 up: at the old 0.397 the 35 u ray was past it, at 1.356 it is 19.7 degrees, inside).
    const h = THROW_AIM_ORIGIN_LATCH_READING.crouch.up;
    close(throwAimVector(null, ray, { feet, yaw: 0, stance: 'crouch' }).aim, unit([0, 35 - (5 + h), -80]));
    const hp = THROW_AIM_ORIGIN_LATCH_READING.prone.up, rayP = { eye: [10, 45, 40], far: [10, 45, 0], reach: 100, kept };
    expect(Math.asin(unit([0, 45 - (5 + hp), -80])[1])).toBeGreaterThan(20 * DEG);
    close(throwAimVector(null, rayP, { feet, yaw: 0, stance: 'prone' }).aim, [0, Math.sin(20 * DEG), -Math.cos(20 * DEG)]);
  });

  it('T: the nearest KEPT hit; a see-through hit before it is dropped, never T', () => {
    const ray = { eye: [0, 30, 40], far: [0, 30, 0], reach: 600, kept };
    const stone = throwAimVector(gridOf([wallAt(-20, 0)]), ray, { feet: [0, 0, 20], yaw: 0, stance: 'stand' });
    close(stone.point, [0, 30, -20], 4);
    const through = throwAimVector(gridOf([wallAt(0, 0, SEE_THROUGH), wallAt(-20, 1)]), ray, { feet: [0, 0, 20], yaw: 0, stance: 'stand' });
    close(through.point, [0, 30, -20], 4);                        // past the see-through face to the stone
    const o = THROW_AIM_ORIGIN_LATCH_READING.stand;
    close(stone.aim, unit([0, 30 - o.up, -(40 - o.ahead)]));
  });

  it("the body's frame: T - O turned by the yaw's inverse (yaw 90 faces -x), the x the sideways offset", () => {
    const o = THROW_AIM_ORIGIN_LATCH_READING.stand;
    const ray = { eye: [0, 20, 0], far: [-1, 20, 0], reach: 50, kept };   // T at (-50, 20, 0)
    close(throwAimVector(null, ray, { feet: [0, 0, 0], yaw: 90, stance: 'stand' }).aim, unit([0, 20 - o.up, -(50 - o.ahead)]));
    // T off to the body's right (yaw 0: the right is +x).
    const side = throwAimVector(null, { eye: [0, o.up, 0], far: [10, o.up, -100], reach: Math.hypot(10, 100), kept }, { feet: [0, 0, 0], yaw: 0, stance: 'stand' });
    close(side.aim, unit([10, 0, -100 + o.ahead]));
    expect(side.aim[0]).toBeGreaterThan(0);
  });

  it("the cone: inside copied verbatim; outside held at the stance's bounds (85 standing, 20 / 45 prone)", () => {
    const o = THROW_AIM_ORIGIN_LATCH_READING.stand;
    // T straight over O: w = (0, 1, 0), outside the standing cone: held at 85 degrees up.
    const up = throwAimVector(null, { eye: [0, 100, -o.ahead], far: [0, 200, -o.ahead], reach: 50, kept }, { feet: [0, 0, 0], yaw: 0, stance: 'stand' });
    close(up.aim, [0, Math.sin(85 * DEG), -Math.cos(85 * DEG)]);
    // 30 degrees up: inside standing, outside prone (20).
    const p = THROW_AIM_ORIGIN_LATCH_READING.prone.up;
    const at30 = { eye: [0, p, 0], far: [0, p + Math.sin(30 * DEG), -Math.cos(30 * DEG)], reach: 100, kept };
    close(throwAimVector(null, at30, { feet: [0, 0, 0], yaw: 0, stance: 'prone' }).aim, [0, Math.sin(20 * DEG), -Math.cos(20 * DEG)]);
    const c = THROW_AIM_ORIGIN_LATCH_READING.crouch.up;
    const at30c = { eye: [0, c, 0], far: [0, c + Math.sin(30 * DEG), -Math.cos(30 * DEG)], reach: 100, kept };
    close(throwAimVector(null, at30c, { feet: [0, 0, 0], yaw: 0, stance: 'crouch' }).aim, [0, Math.sin(30 * DEG), -Math.cos(30 * DEG)]);
    // 60 degrees to the side prone: held at 45.
    const side = { eye: [0, p, 0], far: [Math.sin(60 * DEG), p, -Math.cos(60 * DEG)], reach: 100, kept };
    close(throwAimVector(null, side, { feet: [0, 0, 0], yaw: 0, stance: 'prone' }).aim, [Math.sin(45 * DEG), 0, -Math.cos(45 * DEG)]);
  });

  it('no camera ray: the pitch sine stands, (0, s, -sqrt(1 - s^2))', () => {
    close(bodyThrowAim(null, null, { feet: [0, 0, 0], yaw: 0, stance: 'stand', pitch: -9.167 }, 100000, ''), aimVectorOf(Math.sin(-9.167 * DEG)));
  });

  it("the clearance casts along the whole aim vector, its x included; a bare sine is (0, s, -sqrt(1 - s^2))", () => {
    const s = { feet: [0, 0, 0], yaw: 0, stance: 'stand', vx: 0, vz: 0 } as unknown as PlaySnapshot;
    const v = unit([0.3, 0.5, -0.8]);
    const seg = throwClearanceSegment(s, 0.9, v);
    const h = THROW_ANIMS.standThrow.offset;
    close(seg.from, h);
    close(seg.to, [h[0] + 25 * v[0], h[1] + 25 * v[1], h[2] + 25 * v[2]]);
    expect(throwClearanceSegment(s, 0.9, 0.5)).toEqual(throwClearanceSegment(s, 0.9, aimVectorOf(0.5)));
  });
});

describe("LANE-KILL B-06: the latch through a C4 plant (THROW_AIM_ORIGIN_LATCH_READING's no-write path; the review of 4e26b9ad0e, finding 3)", () => {
  const DI = 'worldmodel/access1=access1/good_parts/di_good';
  const C4: ThrowableRecord = { ...CLAYMORE, name: 'C4', id: 151, fuse: 6, removal: 0.1, explosionDamage: 18, explosionRadius: 50, model: 'c4', icon: 'c4.tif', capacity: 4 };
  const plantGrid = (): Grid => {
    const f: WorldPoly = { ...poly([-2000, 50, 2000, 2000, 50, 2000, 2000, 50, -2000, -2000, 50, -2000], 0, 7, 3), path: 'worldmodel/f' };
    const wall: WorldPoly = { ...f, path: DI, ditype: 2, points: Float32Array.from([115, 50, 150, 115, 50, 250, 115, 110, 250, 115, 110, 150]) };
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
    return buildGrid(params, [], [], [f, wall], [
      { modelName: 'worldmodel', path: 'worldmodel/f0', first: 0, count: 1 }, { modelName: 'worldmodel', path: DI, first: 1, count: 1 },
    ]);
  };
  const run = (g: GrenadeThrower, seconds: number): void => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) g.update(1 / 60); };
  /** A SEAL facing a C4 target at x 115 whose stance the test sets; the M67 selected at `selectAt`, then stood. */
  const seal = (selectAt: 'stand' | 'crouch', plant: boolean) => {
    const map = plantGrid();
    let stance: 'stand' | 'crouch' = selectAt;
    const g = new GrenadeThrower({
      grid: () => map, view: () => 'third', handPoint: () => [102, 62, 192], aim: () => ({ eye: [100, 62, 200], far: [400, 62, 200] }), actors: () => [],
      snapshot: () => ({ feet: [100, 50, 200], yaw: 90, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: stance === 'crouch', stance, landing: null, jumps: 0 } as unknown as PlaySnapshot),
    });
    g.setRecords([C4]);
    g.setWorld(() => ({ health: { blastAt: () => [], c4TargetAt: (path: string, damage: number) => (path === DI && damage >= 17 ? 0 : null) } }));
    g.setKit(['M67', null, 'C4']);
    run(g, 0.3);
    expect(g.select('M67')).toBe(true);
    stance = 'stand';
    if (plant) {
      expect(g.plantC4(), 'harness: the plant accepted').toBe(true);
      for (let i = 0; i < 300 && g.phase() === 'throwing'; i++) g.update(1 / 60);   // the plant's clip to its end
      expect(g.held(), 'the held throwable restored').toBe('M67');
    }
    return g.throwNow(1.5)!;
  };

  it('the M67 selected crouched, stood, a C4 planted: the plant ends on the M67 with the crouch latch kept (no firearm up between)', () => {
    const kept = seal('crouch', false), planted = seal('crouch', true), standing = seal('stand', false);
    expect(kept.aimSin).toBeGreaterThan(standing.aimSin + 0.01);  // the harness tells the two latches apart
    expect(planted.aimSin).toBe(kept.aimSin);
    expect(planted.velocity).toEqual(kept.velocity);
  });
});

describe("LANE-KILL B-06: r0004's hand-open cast (0x5c92b4-0x5c93ac; HAND_OPEN_CAST_READING)", () => {
  const at = (z: number): PlaySnapshot => ({
    feet: [0, 0, z], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null, jumps: 0,
  } as unknown as PlaySnapshot);

  it('any hit within 25 u from the table point along the aim refuses it -- a see-through face too, with no filter', () => {
    // The standing throw's table point is 3.91 behind the feet: from z 3.91 to -21.09 along -z.
    expect(handOpenClear(gridOf([wallAt(-15, 0)]), at(0), 0.9, 0)).toBe(false);
    expect(handOpenClear(gridOf([wallAt(-15, 0, SEE_THROUGH)]), at(0), 0.9, 0)).toBe(false);
    expect(throwClear(gridOf([wallAt(-15, 0, SEE_THROUGH)]), at(0), 0.9, 0)).toBe(true);   // the request's clearance passes it
    expect(handOpenClear(gridOf([wallAt(-25, 0)]), at(0), 0.9, 0)).toBe(true);             // past the end
    expect(handOpenClear(null, at(0), 0.9, 0)).toBe(true);
  });

  it('THROW_DIAG_ADAPTATION (issue #858): handOpenCast is the same cast, handOpenClear its `clear`, with the segment and the nearest hit', () => {
    const cases: [ReturnType<typeof gridOf> | null, number][] = [
      [gridOf([wallAt(-15, 0)]), 0.9], [gridOf([wallAt(-15, 0, SEE_THROUGH)]), 0.9], [gridOf([wallAt(-25, 0)]), 0.9], [null, 0.9],
      [gridOf([wallAt(-15, 0)]), 0.3], [gridOf([wallAt(-10, 0), wallAt(-18, 1)]), 0.9],
    ];
    for (const [grid, power] of cases) expect(handOpenCast(grid, at(0), power, 0).clear).toBe(handOpenClear(grid, at(0), power, 0));
    const c = handOpenCast(gridOf([wallAt(-10, 0), wallAt(-18, 1)]), at(0), 0.9, 0);
    expect(c.clear).toBe(false);
    expect(c.from![2]).toBeCloseTo(3.91, 2);
    expect(c.to![2]).toBeCloseTo(3.91 - 25, 2);
    expect(c.hit!.point[2]).toBeCloseTo(-10, 4);                 // the nearest of the two
    expect(c.hit!.path).toBe('worldmodel/w0');
    expect(c.hit!.material).toBe(7);
    expect(handOpenCast(gridOf([wallAt(-25, 0)]), at(0), 0.9, 0)).toMatchObject({ clear: true, hit: null });
    expect(handOpenCast(null, at(0), 0.9, 0)).toEqual({ clear: true, from: null, to: null, hit: null });
  });

  it('through the thrower: a see-through face 15 ahead clears the request, the hand-open skips the launch, the count kept', () => {
    const grid = gridOf([wallAt(-15, 0, SEE_THROUGH)]);
    const source: GrenadeSource = { grid: () => grid, snapshot: () => at(0), view: () => 'third' };
    const g = new GrenadeThrower(source);
    const starts: string[] = [], thrown: string[] = [];
    g.on('throwStart', (e) => starts.push(e.anim.clip));
    g.on('throw', (t) => thrown.push(t.item));
    g.select('M67');
    const left = g.stats().left;
    g.pull();
    for (let i = 0; i < 40; i++) g.update(1 / 60);
    g.release();
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    expect(starts).toEqual(['seal_throwgrenade']);                 // the request cleared: the clip pushed
    expect(thrown).toEqual([]);                                   // the hand-open cast met the face: no launch
    expect(g.stats().left).toBe(left);                            // nothing spent
    expect(g.stats().lastThrow).toBeNull();
  });
});
