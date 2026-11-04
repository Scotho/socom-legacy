import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { groundGrid, packGround } from '../src/mover';
import { roundPath } from '../src/round';
import { SHOT_GEOMETRY_LIVE_READING } from '../src/worldState';

/**
 * A round meets the world as it stands when it is resolved (`FUN_003c9b70`, `FUN_003c8920`, D:L319383, research 91 §23).
 * The room rewinds actors and queries this grid (`SHOT_GEOMETRY_LIVE_READING`). Two grids are the behaviour: the same
 * line misses an open stretch and stops on a wall that stands in the grid it is given.
 */

const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLAGS = 0x1001;
const floor: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};
const wall = (x: number): WorldPoly => ({
  modelName: 'worldmodel', path: 'worldmodel/barrier', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([x, 0, -20, x, 0, 20, x, 40, 20, x, 40, -20]),
});

function grid(withWall: boolean) {
  const polys = withWall ? [floor, wall(100)] : [floor];
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1, flags: FLAGS }];
  if (withWall) owners.push({ modelName: 'worldmodel', path: 'worldmodel/barrier', first: 1, count: 1, flags: FLAGS });
  return groundGrid(packGround(params, polys, owners));
}

const FROM: [number, number, number] = [0, 20, 0];
const DIR: [number, number, number] = [1, 0, 0];

describe('a round meets the grid it is given (SHOT_GEOMETRY_LIVE_READING)', () => {
  it('is the live query, and the same line stops on a wall that stands and misses where it does not', () => {
    expect(SHOT_GEOMETRY_LIVE_READING).toBe('present');
    const open = roundPath(grid(false), FROM, DIR, 400, () => 0, 0);
    const shut = roundPath(grid(true), FROM, DIR, 400, () => 0, 0);
    expect(open.hit).toBeNull();
    expect(shut.hit).not.toBeNull();
    expect(shut.hit!.point[0]).toBeCloseTo(100, 3);
    expect(shut.hit!.owner).toBe('worldmodel/barrier');
  });
});
