import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { roundPath } from '../src/round';
import { groundGrid, packGround } from '../src/walk';

/**
 * LATER 413's review, finding 1 (research 84 section 13): the round's own query (`FUN_002d3030`'s type-2 branch) records
 * only polygons with surface-word bit 1 (`m_ditype` bit 1, `SURFACE_SIDE`) set (D:L175350-175352), as it passes every
 * bit-18 polygon (D:L175299-175312): a wall whose `ditype` lacks bit 1 does not stop a round.
 */
function wall(x: number, ditype: number, path: string): WorldPoly {
  return { modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([x, 0, -50, x, 0, 50, x, 50, 50, x, 50, -50]) };
}

describe("a round's query takes the side bit (LATER 413's review)", () => {
  it('a wall without surface-word bit 1 is passed; one with it stops the round', () => {
    const polys = [wall(20, 1, 'worldmodel/noside'), wall(40, 3, 'worldmodel/side')];
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
    const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: 'worldmodel', path: p.path, first: i, count: 1 }));
    const grid = groundGrid(packGround(params, polys, owners));
    const path = roundPath(grid, [0, 20, 0], [1, 0, 0], 100, () => 0, 3);
    expect(path.struck[0]?.owner).toBe('worldmodel/side');
  });
});
