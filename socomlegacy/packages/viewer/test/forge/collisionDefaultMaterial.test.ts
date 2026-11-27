import { describe, expect, it } from 'vitest';
import type { GridParams, WorldPoly } from '@s2u/scene';
import { packGround } from '../../src/mover';
import { importCollision, packCollision } from '../../src/forge/geometry/collision';

/**
 * PR #5's import (seat-forge, item A6): FLE-2 (21331326d7) carries a map's default soil (`GroundData.defaultMaterial`,
 * `Grid.defaultMaterial`; `climb.ts` `defaultMaterialByte`) through every Forge rebuild of the walk ground. The public
 * pull request's editable hull layer (`../../src/forge/geometry/collision`) rebuilt the ground without it, so a map
 * edited in Geometry mode would lose its default soil. Synthetic hull, no game data.
 */
const GRID: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-400, 0, -400, 400, 0, -400, 400, 0, 400, -400, 0, 400]),
};

describe('PR #5 A6 (FLE-2): the editable hull keeps the map\'s default soil', () => {
  it('a ground with a default material imports and packs back with it', () => {
    const ground = packGround(GRID, [FLOOR], [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }], 7);
    expect(ground.defaultMaterial, 'the source carries it').toBe(7);
    expect(packCollision(importCollision(ground)).defaultMaterial).toBe(7);
  });
  it('a ground with none packs back with none', () => {
    const ground = packGround(GRID, [FLOOR], [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }]);
    expect('defaultMaterial' in packCollision(importCollision(ground))).toBe(false);
  });
});
