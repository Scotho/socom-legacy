import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { floorAiMaps } from '../../src/forge/floorAi';
import { playObjectives } from '../../src/forge/playObjectives';
import { emptyLayout } from '../../src/forge/layout';
import { packGround } from '../../src/mover';

/**
 * A placed prop on the AI grid, as the original has it (the Forge's owner (crispy, OT.R112), 2026-11-16: "I don't want any editor colors/flags/
 * special cases, when we place a prop make it whatever the engine puts"): the game adds nothing to `AIMAPS.MPS` for a
 * scene object but a configured vehicle's footprint (research 335 section 5: `ai_vehicles.rdr`'s two), so a prop's
 * cells keep the grid's own soils; a hostage meets it at run time, the collision soil marked where it touches
 * (`FUN_00556ee0`, `match/src/hostageObstacles.ts` `markCollision`). Play's map holds the layout's grid, untouched.
 */
const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const square = (path: string, y: number, ditype: number): WorldPoly => ({
  modelName: path.split('/')[0]!, path, region: 0, ditype, material: 0, ptcount: 4, cameratype: 0,
  points: Float32Array.from([0, y, 0, 40, y, 0, 40, y, 40, 0, y, 40]),
} as WorldPoly);

describe('placed props on the AI grid', () => {
  it('a prop standing on the floor leaves Play\'s AI grid the layout\'s own (no stamping)', () => {
    const ai = floorAiMaps(8000);
    // The floor, and a crate's top 8 units over it owned by the layout's first piece.
    const polys = [square('worldmodel/floor', 0, 3), square('forge/piece_0', 8, 3)];
    const owners: CollisionOwner[] = [
      { modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1, flags: 0x1001 },
      { modelName: 'forge', path: 'forge/piece_0', first: 1, count: 1, flags: 0x1001 },
    ] as CollisionOwner[];
    const ground = packGround(params, polys, owners);
    const played = playObjectives({ ai, ground, escortees: [], meta: { actions: [] }, path: 'RUN/MP6.ZDB', tac: null },
      emptyLayout({ kind: 'blank', library: 'MP6' }), undefined);
    expect(played.map.ai).toBe(ai);
  });
});
