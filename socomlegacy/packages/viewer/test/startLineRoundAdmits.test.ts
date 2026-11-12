import { describe, expect, it } from 'vitest';
import { buildGrid, surfaceMaterial, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { roundAdmits } from '../src/round';
import { roundStartAdmits, startWalled } from '../src/net/startLine';

/**
 * LEAN-WALLED (issue #752 defect 2, LATER 775; reading, pending review): a round's start line (OT.R80, `startWalled`)
 * meets only what the round's own flight can meet -- the round's query class (`roundAdmits`: the side bit set, the
 * camera-only bit clear; `FUN_002d3030`, LATER 413) less a surface whose PENETRATION is exactly 1, which the walk passes
 * over with no mark (`HandleIntersections` `FUN_003c9b70` D:L320028-320030, r0004 0x3ebf28-0x3ebf40 unchanged; the
 * port's `penetrate`). So an r0004 INVISIBLE_DI wall (byte 3, PENETRATION 1) no longer refuses an honest round
 * `muzzle walled`, while a wall the round stops at or cuts through still does. A throw, a launcher's round and a rocket
 * keep every polygon (the default): their flights are not the round's walk.
 */

type V3 = [number, number, number];
const BYTE = { invisibleDi: 3, stone: 7, metalThick: 25 } as const;
const quad = (points: number[], material: number, ditype = 2): WorldPoly =>
  ({ modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype, material, ptcount: 4, cameratype: 0, points: Float32Array.from(points) });
function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

/** `fireStartWalled.test.ts`'s body and muzzle: standing at the origin facing -z, the muzzle 8 ahead, 3 right. */
const BODY = { feet: [0, 0, 0] as V3, yaw: 0, posture: 'stand' as const, moveRoot: null, peek: 0 };
const MUZZLE: V3 = [3, 14, -8];
/** A wall across z -5 (y 0..50): between the body's head and axis and the muzzle, on both lines. */
const across = (material: number, ditype = 2): WorldPoly => quad([-50, 0, -5, 50, 0, -5, 50, 50, -5, -50, 50, -5], material, ditype);
/** The room's material lookup (`room.ts` `fireAt`'s, PEN-MATERIAL): the byte's SOILS row, 0 the map's default. */
const penetration = (m: number | undefined): number => surfaceMaterial(m ?? 0, '').penetration;

describe('LEAN-WALLED: the round start line admits what the round admits (issue #752 defect 2, OT.R80)', () => {
  it('the table the predicate reads: INVISIBLE_DI is PENETRATION 1, STONE and METAL_THICK 0', () => {
    expect(surfaceMaterial(BYTE.invisibleDi).name).toBe('INVISIBLE_DI');
    expect(penetration(BYTE.invisibleDi)).toBe(1);
    expect(surfaceMaterial(BYTE.stone).name).toBe('STONE');
    expect(penetration(BYTE.stone)).toBe(0);
    expect(penetration(BYTE.metalThick)).toBe(0);
  });

  it('roundStartAdmits: the round query class, less PENETRATION exactly 1', () => {
    const admits = roundStartAdmits(penetration);
    expect(admits(across(BYTE.invisibleDi))).toBe(false);
    expect(admits(across(BYTE.stone))).toBe(true);
    expect(admits(across(BYTE.metalThick))).toBe(true);
    const sideless = across(BYTE.stone, 0);
    expect(roundAdmits(sideless)).toBe(false);
    expect(admits(sideless)).toBe(false);
  });

  it('with no material table (the page before its effects load) it is the round query class alone, as the flight then', () => {
    const admits = roundStartAdmits(null);
    expect(admits(across(BYTE.invisibleDi))).toBe(true);
    expect(admits(across(BYTE.stone, 0))).toBe(false);
  });

  it('an INVISIBLE_DI wall between the body and its muzzle walls the start for every polygon, not for the round', () => {
    const grid = world([across(BYTE.invisibleDi)]);
    expect(startWalled(grid, BODY, MUZZLE)).toBe(true);
    expect(startWalled(grid, BODY, MUZZLE, roundStartAdmits(penetration))).toBe(false);
  });

  it('a STONE wall still walls the round start; a wall without the side bit does not', () => {
    expect(startWalled(world([across(BYTE.stone)]), BODY, MUZZLE, roundStartAdmits(penetration))).toBe(true);
    expect(startWalled(world([across(BYTE.stone, 0)]), BODY, MUZZLE, roundStartAdmits(penetration))).toBe(false);
  });

  it('a STONE wall behind an INVISIBLE_DI one still walls it: the admits skips a face, never the line', () => {
    const grid = world([across(BYTE.invisibleDi), quad([-50, 0, -6, 50, 0, -6, 50, 50, -6, -50, 50, -6], BYTE.stone)]);
    expect(startWalled(grid, BODY, MUZZLE, roundStartAdmits(penetration))).toBe(true);
  });
});
