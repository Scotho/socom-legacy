// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { type CollisionOwner, type GridParams, type V3, type WorldPoly } from '@s2u/scene';
import { aimPick, c4Line, C4_SURFACE_SLACK_PLACEHOLDER } from '../src/equipment';
import { groundGrid, packGround } from '../src/mover';

/**
 * LATER 121 (PR #321's review; the room's check of a page's named point, `c4Line`): the named point must be where the
 * line from the head **first** meets the named node. Before, the line passed over the node's own other face, so a point
 * named on the far face of a thick barrier was accepted -- and since #321 the named point is the blast's centre, so a
 * forged page moved the blast through the barrier by its thickness. An honest page names the first hit from the eye it
 * aimed from -- its camera, as the original's aim record (`FUN_005aa6e0` with `cam+0xd8`, D:L142028), or the scope's,
 * the head -- so the room judges the first hit along the head's line or the camera's (`eyes`; the room's `orderOrigin`).
 */
const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLAGS = 0x1001;
/** A wall across `x` (z -20..20, height 0..40): one polygon of `path`. */
const across = (path: string, x: number): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([x, 0, -20, x, 0, 20, x, 40, 20, x, 40, -20]),
});
const BARRIER = 'worldmodel/access1=access1/good_parts/di_good';
const NEAR = 100, FAR = 110;                                         // a barrier 10 units thick: well past the slack

/** The floor and one node, the barrier, with its two faces. */
function grid() {
  const polys: WorldPoly[] = [{ ...across('worldmodel/floor', 0), ditype: 3, points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]) }];
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1, flags: FLAGS }];
  owners.push({ modelName: 'worldmodel', path: BARRIER, first: polys.length, count: 2, flags: FLAGS });
  polys.push(across(BARRIER, NEAR), across(BARRIER, FAR));
  return groundGrid(packGround(params, polys, owners));
}
const HEAD: V3 = [50, 12, 0];

/**
 * The review's F1 (LATER 121): the page picks from its third-person camera (`walk.ts` `fireAim`; the original's aim
 * record from the camera's eye, `FUN_005aa6e0` with `cam+0xd8` D:L142028, the hit nearest it kept D:L464163-464169),
 * 28 behind and 5.6 above the head at pitch 0 (`localCamera`). A barrier 18 high, 6 deep, its top face 18 high: the
 * camera's line over the near edge strikes the top first; the head's crosses the near face 4 short of the point.
 */
const TOPPED = 'worldmodel/access2=access2/good_parts/di_good';
function grid2() {
  const wall = (x: number): WorldPoly => ({ ...across(TOPPED, x), points: Float32Array.from([x, 0, -20, x, 0, 20, x, 18, 20, x, 18, -20]) });
  const top: WorldPoly = { ...across(TOPPED, 30), points: Float32Array.from([30, 18, -20, 36, 18, -20, 36, 18, 20, 30, 18, 20]) };
  const polys: WorldPoly[] = [{ ...across('worldmodel/floor', 0), ditype: 3, points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]) }, wall(30), top, wall(36)];
  const owners: CollisionOwner[] = [
    { modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1, flags: FLAGS },
    { modelName: 'worldmodel', path: TOPPED, first: 1, count: 3, flags: FLAGS },
  ];
  return groundGrid(packGround(params, polys, owners));
}
const STAND_HEAD: V3 = [2.5, 15.88, 0], CAMERA: V3 = [-28, 21.48, 0];   // `headPoint`, `localCamera(...).eye` at pitch 0, facing +x

describe('LATER 121: the named point is the first hit of the head\'s line on the named node', () => {
  it('the near face, where an honest aim strikes: accepted', () => {
    const g = grid();
    const hit = aimPick(g, HEAD, [200, 12, 0])!;
    expect(hit.path).toBe(BARRIER);
    expect(hit.point[0]).toBeCloseTo(NEAR, 3);
    expect(c4Line(g, HEAD, { path: BARRIER, point: hit.point }).clear).toBe(true);
    expect(c4Line(g, HEAD, { path: BARRIER, point: [NEAR, 12, 0] }).clear).toBe(true);
  });

  it('the far face, beyond the node\'s own near face: refused (missed), as the line first meets the node elsewhere', () => {
    expect(c4Line(grid(), HEAD, { path: BARRIER, point: [FAR, 12, 0] })).toEqual({ clear: false, why: 'missed' });
  });

  it('a point inside the slack of the near face still passes; one past it does not', () => {
    const g = grid();
    expect(c4Line(g, HEAD, { path: BARRIER, point: [NEAR + C4_SURFACE_SLACK_PLACEHOLDER * 0.5, 12, 0] }).clear).toBe(true);
    expect(c4Line(g, HEAD, { path: BARRIER, point: [NEAR + C4_SURFACE_SLACK_PLACEHOLDER * 3, 12, 0] })).toEqual({ clear: false, why: 'missed' });
  });

  it('from the far side the far face is the near one: accepted there, the other refused', () => {
    const g = grid(), back: V3 = [160, 12, 0];
    expect(c4Line(g, back, { path: BARRIER, point: [FAR, 12, 0] }).clear).toBe(true);
    expect(c4Line(g, back, { path: BARRIER, point: [NEAR, 12, 0] })).toEqual({ clear: false, why: 'missed' });
  });
});

describe('LATER 121, the review\'s F1: the camera\'s eye is an aim eye too (the page\'s pick and the original\'s)', () => {
  const ON_TOP: V3 = [34, 18, 0];

  it('a top face the camera strikes first over the near edge: refused by the head\'s line alone, accepted with the camera\'s', () => {
    const g = grid2();
    const hit = aimPick(g, CAMERA, [CAMERA[0] + (ON_TOP[0] - CAMERA[0]) * 3, CAMERA[1] + (ON_TOP[1] - CAMERA[1]) * 3, 0])!;
    expect(hit.path).toBe(TOPPED);
    expect(hit.point[1]).toBeCloseTo(18, 3);                                         // the camera's first hit is the top face
    expect(c4Line(g, STAND_HEAD, { path: TOPPED, point: hit.point })).toEqual({ clear: false, why: 'missed' });
    expect(c4Line(g, STAND_HEAD, { path: TOPPED, point: hit.point }, '', [CAMERA]).clear).toBe(true);
  });

  it('e3\'s pin: the far face is still refused with the camera given -- both eyes are on the near side', () => {
    const g = grid2();
    expect(c4Line(g, STAND_HEAD, { path: TOPPED, point: [36, 9, 0] }, '', [CAMERA])).toEqual({ clear: false, why: 'missed' });
    expect(c4Line(grid(), HEAD, { path: BARRIER, point: [FAR, 12, 0] }, '', [[30, 20, 0]])).toEqual({ clear: false, why: 'missed' });
  });

  it('the camera\'s line never excuses a wall: walled stays the head\'s (another node, a kerb, between the head and the point)', () => {
    const kerb = 'worldmodel/kerb';
    const polys: WorldPoly[] = [{ ...across('worldmodel/floor', 0), ditype: 3, points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]) },
      { ...across(kerb, 20), points: Float32Array.from([20, 0, -20, 20, 0, 20, 20, 14, 20, 20, 14, -20]) }, across(TOPPED, 30)];
    const owners: CollisionOwner[] = [
      { modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1, flags: FLAGS },
      { modelName: 'worldmodel', path: kerb, first: 1, count: 1, flags: FLAGS },
      { modelName: 'worldmodel', path: TOPPED, first: 2, count: 1, flags: FLAGS },
    ];
    const g = groundGrid(packGround(params, polys, owners));
    expect(c4Line(g, STAND_HEAD, { path: TOPPED, point: [30, 9, 0] }, '', [CAMERA])).toEqual({ clear: false, why: 'walled' });
  });
});
