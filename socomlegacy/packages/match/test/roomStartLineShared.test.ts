import { describe, expect, it } from 'vitest';
import { buildGrid, DEFAULT_RIFLE, type CollisionOwner, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { Fire } from '../../viewer/src/fire';
import { packGround, type SimMap } from '../../viewer/src/sim';
import { Room } from '../src/room';

/**
 * LATER 366 (OT.R80, Craig's "366: 1"): the room's start lines (`startRefused`, SVC-23b) and the page's (`Fire.ray`) are
 * one source, `viewer/src/net/startLine.ts`. The pin: a muzzle poked past a post's edge or over a low wall is refused
 * `walled` by the room, and the start the page's `Fire` sends instead -- the kept head -- is one the room takes. The
 * geometry is `viewer/test/fireStartWalled.test.ts`'s.
 */

type V3 = [number, number, number];
const quad = (points: number[]): WorldPoly =>
  ({ modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(points) });
const floor = quad([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]);
const farWall = quad([-50, 0, -60, 50, 0, -60, 50, 50, -60, -50, 50, -60]);
const post = quad([1, 0, -5, 10, 0, -5, 10, 50, -5, 1, 50, -5]);
const lowWall = quad([-50, 0, -5, 50, 0, -5, 50, 17, -5, -50, 17, -5]);

function map(walls: WorldPoly[]): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const own = (polys: WorldPoly[]): CollisionOwner[] => polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  const ground = packGround(params, [floor], own([floor]));
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -150, -150 + i * 20), slot(1, i, 150, -150 + i * 20)]);
  return { stem: 'MP99', name: 'POST', ground, grid: buildGrid(params, [], [], [floor, ...walls], own([floor, ...walls])), spawns: null, slots, respawns: [], notes: [] };
}

/** The body at the origin facing -z, standing, still: the room's `StartBody` with no root slack. */
const BODY = { feet: [0, 0, 0] as V3, yaw: 0, posture: 'stand' as const, moveRoot: null, peek: 0, rootSlack: 0 };
const EYE: V3 = [0, 20, 0];
const MUZZLE: V3 = [3, 14, -8];

type Refuses = { startRefused(b: typeof BODY, from: readonly number[], placed?: boolean): 'far' | 'walled' | null };

describe("LATER 366: the room takes the start the page sends for a walled muzzle (OT.R80, one source)", () => {
  for (const [name, wall] of [["a post's edge", post], ['a low wall', lowWall]] as const) {
    it(`a muzzle past ${name}: the room refuses it walled and takes the page's start from the head`, () => {
      const m = map([farWall, wall]);
      const room = new Room(m, null, { now: () => 0, random: () => 0.5, launchCountdownS: 0 }, null, null) as unknown as Refuses;
      const fire = new Fire({ grid: () => m.grid, aim: () => ({ eye: EYE, far: [0, 20, -1000] }), muzzle: () => [...MUZZLE], startBody: () => BODY },
        DEFAULT_RIFLE, undefined, () => 0.5);
      const from = fire.shoot()!.from;
      expect(room.startRefused(BODY, MUZZLE)).toBe('walled');
      expect(from).not.toEqual(MUZZLE);
      expect(room.startRefused(BODY, from)).toBeNull();
    });
  }

  it('a clear muzzle: the page fires from it and the room takes it, as before', () => {
    const m = map([farWall]);
    const room = new Room(m, null, { now: () => 0, random: () => 0.5, launchCountdownS: 0 }, null, null) as unknown as Refuses;
    const fire = new Fire({ grid: () => m.grid, aim: () => ({ eye: EYE, far: [0, 20, -1000] }), muzzle: () => [...MUZZLE], startBody: () => BODY },
      DEFAULT_RIFLE, undefined, () => 0.5);
    expect(fire.shoot()!.from).toEqual(MUZZLE);
    expect(room.startRefused(BODY, MUZZLE)).toBeNull();
  });
});
