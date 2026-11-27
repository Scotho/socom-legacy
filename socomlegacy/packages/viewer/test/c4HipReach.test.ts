// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGrid, CLAYMORE, SOILS, type Grid, type GridParams, type ThrowableRecord, type V3, type WorldPoly } from '@s2u/scene';
import * as equipment from '../src/equipment';
import * as shotCone from '../src/net/shotCone';
import { GrenadeThrower } from '../src/grenade';
import { rootY, type Stance } from '../src/mover';
import type { StartBody } from '../src/net/startLine';
import type { PlaySnapshot } from '../src/walk';
import { C4_HIP_CAPTURE, caseHipSq, caseUp, HIP_CASES, HIP_REACH_SQ, PLACES_REFUSED, PLACES_TAKEN, type HipCase } from './helpers/c4HipReach';

/**
 * LATER 1139 on the page (research 440 s8; the table: `./helpers/c4HipReach`): the C4 prompt's target is taken only while
 * the squared 3-D distance from the hip to the aim's point is under 396 -- `FUN_005be9a0` D:L475400-475405, proven on
 * r0004 by the capture later1139-c4reach (2026-11-18). The hip is `hipPoint(startBody)` (`./net/shotCone`), the same
 * call the room makes (`match/test/roomC4HipReach.test.ts` drives the same cases through `placeCharge`).
 */

const byteOf = (name: string): number => SOILS.findIndex((m) => m.name === name) + 2;
const DI = 'worldmodel/access1=access1/good_parts/di_good', PANE = 'worldmodel/pane1=pane1/glass';
const FEET: V3 = [100, 50, 200];

/** The hip stand-in under test (the export the fix adds). */
function hipOf(b: StartBody): V3 {
  const f = (shotCone as unknown as { hipPoint?: (b: StartBody) => V3 }).hipPoint;
  expect(typeof f, 'net/shotCone.ts exports hipPoint, the hip both sides measure C4 from').toBe('function');
  return f!(b);
}
const bodyOf = (posture: Stance): StartBody => ({ feet: FEET, yaw: 270, posture, moveRoot: null, peek: 0, groundNormalY: 1 });

/** The target's face across x = feet + `along` (z 150..250, y 20..120) and, for `pane`, a GLASS pane 3 u in front. */
function world(c: HipCase): Grid {
  const face = (path: string, x: number, material: number): WorldPoly => ({
    modelName: 'worldmodel', path, region: 0, ditype: 2, material, ptcount: 4, cameratype: 0,
    points: Float32Array.from([x, 20, 150, x, 20, 250, x, 120, 250, x, 120, 150]),
  });
  const p: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
  const x = FEET[0] + c.along;
  return buildGrid(p, [], [], [face(DI, x, byteOf('STONE')), ...(c.pane ? [face(PANE, x - 3, byteOf('GLASS'))] : [])], [
    { modelName: 'worldmodel', path: DI, first: 0, count: 1 },
    ...(c.pane ? [{ modelName: 'worldmodel', path: PANE, first: 1, count: 1 }] : []),
  ]);
}
const pointOf = (c: HipCase): V3 => [FEET[0] + c.along, FEET[1] + caseUp(c), FEET[2]];
const health = { c4TargetAt: (path: string, damage: number): number | null => (damage >= 17 && path === DI ? 0 : null) };

const C4: ThrowableRecord = { ...CLAYMORE, name: 'C4', id: 151, fuse: 6, removal: 0.1, explosionDamage: 18, explosionRadius: 50, model: 'c4', icon: 'c4.tif', capacity: 4 };

/** The page's thrower on the case's world, the camera behind and above the feet aiming through the point. */
function planter(c: HipCase, withBody = true) {
  const g0 = world(c), point = pointOf(c);
  const eye: V3 = [FEET[0] - 8, FEET[1] + rootY(c.posture) + 6, FEET[2]];
  const far: V3 = [eye[0] + (point[0] - eye[0]) * 10, eye[1] + (point[1] - eye[1]) * 10, eye[2]];
  const snap = (): PlaySnapshot => ({
    feet: [...FEET], yaw: 270, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: c.posture === 'crouch', stance: c.posture, landing: null, jumps: 0,
  } as PlaySnapshot);
  const g = new GrenadeThrower({
    grid: () => g0, snapshot: snap, view: () => 'third', handPoint: () => [102, 62, 192], aim: () => ({ eye, far }),
    ...(withBody ? { startBody: () => bodyOf(c.posture) } : {}),
  });
  g.setRecords([C4]);
  g.setWorld(() => ({ health: { ...health, blastAt: () => [] } }) as never);
  g.setKit(['M67', 'AN-M8', 'C4']);
  return g;
}
const run = (g: GrenadeThrower, seconds: number): void => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) g.update(1 / 60); };

describe(`LATER 1139: one hip gate on the page, |point - hip|^2 < 396 (${C4_HIP_CAPTURE})`, () => {
  it('the gate is the proven 396, one constant (C4_HIP_REACH_SQ); the two ground reaches are retired', () => {
    expect((equipment as unknown as { C4_HIP_REACH_SQ?: number }).C4_HIP_REACH_SQ).toBe(HIP_REACH_SQ);
    expect((equipment as Record<string, unknown>).C4_REACH_READING).toBeUndefined();
    expect((equipment as Record<string, unknown>).C4_THROUGH_REACH_READING).toBeUndefined();
  });

  it('hipPoint stands skel_root straight over the feet at the move root, else the stance root (headPoint\'s own root)', () => {
    for (const posture of ['stand', 'crouch', 'prone'] as const) expect(hipOf(bodyOf(posture))).toEqual([FEET[0], FEET[1] + rootY(posture), FEET[2]]);
    expect(hipOf({ ...bodyOf('stand'), moveRoot: 7.25 })).toEqual([FEET[0], FEET[1] + 7.25, FEET[2]]);
  });

  it.each(HIP_CASES)('c4TargetOf from the hip: $name', (c) => {
    expect(caseHipSq(c) < HIP_REACH_SQ).toBe(c.taken);                     // the table agrees with its own arithmetic
    const got = equipment.c4TargetOf(health, { path: DI, point: pointOf(c) }, hipOf(bodyOf(c.posture)), 18);
    expect(got).toBe(c.taken ? 0 : null);
  });

  it.each(HIP_CASES)('GrenadeThrower with its startBody (the prompt): $name', (c) => {
    const g = planter(c);
    run(g, 0.3);
    expect(g.c4Target()).toBe(c.taken ? 0 : null);
  });

  it.each(HIP_CASES)('GrenadeThrower with no body: the feet plus rootY(snapshot.stance) -- $name', (c) => {
    const g = planter(c, false);
    run(g, 0.3);
    expect(g.c4Target()).toBe(c.taken ? 0 : null);
  });

  it.each(PLACES_REFUSED)('research 440 s4: $map $target behind $front, $gap u: refused, through the face or plain', ({ gap }) => {
    const c: HipCase = { name: '', posture: 'stand', along: gap, up: 'hip', taken: false };
    expect(equipment.c4TargetOf(health, { path: DI, point: pointOf(c) }, hipOf(bodyOf('stand')), 18)).toBeNull();
    const pane = planter({ ...c, pane: true }), plain = planter(c);
    run(pane, 0.3); run(plain, 0.3);
    expect(pane.c4Target()).toBeNull();
    expect(plain.c4Target()).toBeNull();
  });

  it.each(PLACES_TAKEN)('research 440 s4: $map $target behind $front, $gap u: taken', ({ gap }) => {
    const c: HipCase = { name: '', posture: 'stand', along: gap, up: 'hip', taken: true };
    expect(equipment.c4TargetOf(health, { path: DI, point: pointOf(c) }, hipOf(bodyOf('stand')), 18)).toBe(0);
  });
});
