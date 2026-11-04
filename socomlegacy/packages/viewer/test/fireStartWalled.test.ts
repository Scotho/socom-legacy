import { describe, expect, it } from 'vitest';
import { Line, type BufferAttribute } from 'three';
import { buildGrid, DEFAULT_RIFLE, segmentHit, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { Fire, type FireEvent, type FireSource } from '../src/fire';
import { Effects } from '../src/effects';
import type { EffectData } from '../src/effectData';
import { headEye } from '../src/cameraRig';
import { headPoint, targetHeight } from '../src/net/shotCone';

/**
 * LATER 366 (OT.R80, Craig's option 1, 2026-10-23): the page asks the room's start lines (`room.ts` `startRefused`,
 * SVC-23b: the head kept on the body's side along `headEye`, and the axis at the look-at target's height, every polygon)
 * before a round leaves its posed muzzle. A muzzle those lines meet a wall on -- a barrel poked past a post's edge or a
 * low wall's top -- sends its round from the head toward the same aim point instead, so the room takes it and the round
 * cannot pass the wall the barrel poked through. The tracer is still drawn from the muzzle.
 */

type V3 = [number, number, number];
const quad = (points: number[]): WorldPoly =>
  ({ modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(points) });
function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

/** A body standing at the origin facing -z (yaw 0), no move, no peek: the room's `StartBody` less its slack. */
const BODY = { feet: [0, 0, 0] as V3, yaw: 0, posture: 'stand' as const, moveRoot: null, peek: 0 };
/** The camera's eye over the body, looking down -z; the posed muzzle 3 right, 6 down, 8 ahead of the feet's column. */
const EYE: V3 = [0, 20, 0];
const MUZZLE: V3 = [3, 14, -8];
const farWall = quad([-50, 0, -60, 50, 0, -60, 50, 50, -60, -50, 50, -60]);
/** A post's face at z -5 from x 1 to 10: right of the eye's line, across the head's line to the muzzle. */
const post = quad([1, 0, -5, 10, 0, -5, 10, 50, -5, 1, 50, -5]);
/** A low wall at z -5, y 0 to 17: under the eye's line (y 20), over the head (15.884). */
const lowWall = quad([-50, 0, -5, 50, 0, -5, 50, 17, -5, -50, 17, -5]);

/** The room's `startRefused` 'walled' lines, written out here from `room.ts` (4165-4184) so the test stands alone. */
function roomWalled(grid: Grid, to: readonly number[]): boolean {
  const head = headEye(grid, BODY.feet, headPoint(BODY), () => true);
  const axis: V3 = [0, targetHeight(BODY.posture, BODY.moveRoot), 0];
  const end: V3 = [to[0]!, to[1]!, to[2]!];
  return segmentHit(grid, head, end) !== null || segmentHit(grid, axis, end) !== null;
}

function rig(grid: Grid): { fire: Fire; tracerStart: () => V3 } {
  const source: FireSource & { startBody(): typeof BODY } = {
    grid: () => grid, aim: () => ({ eye: EYE, far: [0, 20, -1000] }), muzzle: () => [...MUZZLE], startBody: () => BODY,
  };
  const fire = new Fire(source, DEFAULT_RIFLE, undefined, () => 0.5);
  const line = fire.object.children.find((c): c is Line => c instanceof Line)!;
  const tracerStart = (): V3 => {
    const p = line.geometry.getAttribute('position') as BufferAttribute;
    return [p.getX(0), p.getY(0), p.getZ(0)];
  };
  return { fire, tracerStart };
}

/** A far wall 150 ahead: a shot long enough to draw a tracer (70 units and more, `FUN_003d5030` D:L327195-327196). */
const deepWall = quad([-50, 0, -150, 50, 0, -150, 50, 50, -150, -50, 50, -150]);

/** The match's animated tracer (research 89 §19): synthetic effect data holding the ally's zAnim, the generator 0.5. */
function tracerEffects(): Effects {
  const fx = new Effects(() => 0.5, () => {});
  const data: EffectData = {
    archive: 'T', textures: [], absent: [], materials: ['UNKNOWN'], defaultMaterial: 0, marks: [], footprints: [],
    ambient: [], sceneNodes: [], hitAnims: [], missing: [], models: [],
    programs: [{ name: 'tracer_ally_anim', root: 0, flags: 0, nodes: ['NA'], sequences: [{ name: 's0', activation: 1, ops: [{ op: 'wait', seconds: 60, range: 0, frames: null }] }] }],
  };
  fx.setData(data);
  return fx;
}

/** The point `d` units from `a` toward `b`: where a tracer launched from `a` stands (`(495 + 1) / 10` = 49.6 at 0.5). */
const along = (a: readonly number[], b: readonly number[], d: number): V3 => {
  const v = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], l = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [a[0]! + v[0]! / l * d, a[1]! + v[1]! / l * d, a[2]! + v[2]! / l * d];
};

describe('LATER 366: a walled muzzle sends its round from the head (OT.R80)', () => {
  const head = headPoint(BODY);

  it('the setting: the room refuses a start at the muzzle on both maps, and the head stands clear of each', () => {
    expect(head.map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 15.884, -2.5]);
    for (const grid of [world([farWall, post]), world([farWall, lowWall])]) {
      expect(roomWalled(grid, MUZZLE)).toBe(true);
      expect(headEye(grid, BODY.feet, head, () => true)).toEqual(head);
    }
  });

  it("a muzzle past a post's edge: the round leaves the head, the room's lines are clear of it, it reaches the aim point", () => {
    const grid = world([farWall, post]);
    const { fire, tracerStart } = rig(grid);
    const shot = fire.shoot()!;
    expect(shot.from.map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 15.884, -2.5]);
    expect(roomWalled(grid, shot.from)).toBe(false);                  // the room takes it (was 'muzzle walled')
    expect(shot.hit!.point[2]).toBeCloseTo(-60, 6);                    // the far wall under the reticle
    expect(shot.hit!.point[0]).toBeCloseTo(0, 6);
    expect(shot.hit!.point[1]).toBeCloseTo(20, 6);
    expect(tracerStart()).toEqual(MUZZLE);                              // drawn from the muzzle still
  });

  it("a muzzle over a low wall: the round from the head stops at the wall -- it cannot pass the wall the barrel poked over", () => {
    const grid = world([farWall, lowWall]);
    const { fire, tracerStart } = rig(grid);
    const shot = fire.shoot()!;
    expect(shot.from.map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 15.884, -2.5]);
    expect(roomWalled(grid, shot.from)).toBe(false);
    expect(shot.hit!.point[2]).toBeCloseTo(-5, 6);                     // the low wall, not the far one
    expect(shot.hit!.point[1]).toBeLessThan(17);
    expect(tracerStart()).toEqual(MUZZLE);
  });

  it('a muzzle the lines are clear of fires from the muzzle, as before', () => {
    const grid = world([farWall]);
    const { fire } = rig(grid);
    expect(fire.shoot()!.from).toEqual(MUZZLE);
  });

  it('without a body (off the walk, an instrument) the muzzle is not tested, as before', () => {
    const grid = world([farWall, post]);
    const fire = new Fire({ grid: () => grid, aim: () => ({ eye: EYE, far: [0, 20, -1000] }), muzzle: () => [...MUZZLE] }, DEFAULT_RIFLE, undefined, () => 0.5);
    expect(fire.shoot()!.from).toEqual(MUZZLE);
  });

  it("in a match the animated tracer replaces the line: the round event carries the muzzle (`tracerFrom`) and onRound launches from it", () => {
    const grid = world([deepWall, post]);
    const { fire } = rig(grid);
    fire.setTracerModel(() => true);                                    // the map draws the zAnim: no line (`matchFirearm`)
    const rounds: Extract<FireEvent, { type: 'round' }>[] = [];
    fire.subscribe((e) => { if (e.type === 'round') rounds.push(e); });
    const shot = fire.shoot()!;
    expect(rounds).toHaveLength(1);
    const e = rounds[0]!;
    expect(e.from).toEqual(shot.from);                                  // the round's start, the room's: the head
    expect(e.from.map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 15.884, -2.5]);
    expect(e.tracer).toBe(true);
    const fx = tracerEffects();
    fx.onRound(e, null, false);
    const live = fx.stats().tracers;
    expect(live).toHaveLength(1);
    const want = along(MUZZLE, e.to, 49.6);                             // down the shot from the muzzle, not the head
    expect(live[0]!.head.map((v) => Math.round(v * 1000) / 1000), 'the tracer launched from the muzzle').toEqual(want.map((v) => Math.round(v * 1000) / 1000));
    expect(e.tracerFrom).toEqual(MUZZLE);
  });

  it('a clear muzzle carries no `tracerFrom`: the round and its tracer leave the muzzle, as before', () => {
    const grid = world([deepWall]);
    const { fire } = rig(grid);
    fire.setTracerModel(() => true);
    const rounds: Extract<FireEvent, { type: 'round' }>[] = [];
    fire.subscribe((e) => { if (e.type === 'round') rounds.push(e); });
    fire.shoot();
    expect(rounds[0]!.from).toEqual(MUZZLE);
    expect('tracerFrom' in rounds[0]!).toBe(false);
  });
});
