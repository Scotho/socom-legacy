import { describe, expect, it } from 'vitest';
import { buildGrid, materialTable, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { blastExposed, blastSeen, blastSeesThrough } from '../src/net/blast';

/**
 * R4B-10 (research 388; LATER 615 then G6): the blast's exposure test on a body (r0001 `FUN_005a0e70` D:L459173-459190;
 * r0004 r4 0x5a6af8-0x5a6be0, the same in the PINE dump and the served decrypt). Each pass takes the nearest hit beyond
 * the last; the hit is cover when its material entry exists, its `+0x3c` bits 3, 1 (LIQUID) and 4 (PICKUP) are clear
 * and its id is not PERSON's -- r0004 adds METAL_GRATE's and INVISIBLE_DI's ids (r4 0x5a6b38-0x5a6b4c, 0x5a6bb0-0x5a6bc8)
 * -- else it is seen through and the walk goes on. Bit 3 is set by `FUN_002de4b0` on PARTICLE_SYSTEM alone
 * (D:L181549-181550; no SOILS key sets it, D:L181403-181422), copied onto entry 0 only with the map's default
 * (`FUN_002ddc30` D:L181216-181218). A polygon's byte 0 is the map's `DefaultMaterial` (`FUN_002dc1d0` D:L180305-180318).
 * The charges' line (`blastSeen`, PF-36's `FUN_003c80e0` side, unchanged in r0004) keeps every admitted face.
 */

const quad = (pts: number[], material: number, path: string): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype: 2, material, ptcount: 4, cameratype: 0, appflags: 0, points: Float32Array.from(pts),
});
/** A vertical pane across x at `z`, x -50..50, y 0..60, its front toward +z (the blast's side). */
const pane = (z: number, material: number, path = 'worldmodel/pane'): WorldPoly => quad([-50, 0, z, 50, 0, z, 50, 60, z, -50, 60, z], material, path);
function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

const FROM: [number, number, number] = [0, 20, 40], TO: [number, number, number] = [0, 20, -40];
const TABLE = materialTable();
const byte = (name: string): number => TABLE.findIndex((m) => m.name === name);

describe('R4B-10: the blast exposure test sees through what FUN_005a6920 sees through', () => {
  it('of the whole table, exactly PARTICLE_SYSTEM (bit 3), WATER (LIQUID), PERSON, ITEM (PICKUP), METAL_GRATE and INVISIBLE_DI are seen through', () => {
    const through = TABLE.filter((m) => blastSeesThrough(m)).map((m) => m.name).sort();
    expect(through).toEqual(['INVISIBLE_DI', 'ITEM', 'METAL_GRATE', 'PARTICLE_SYSTEM', 'PERSON', 'WATER']);
    // The two r0004 ids are the RAM table's [3] and [28] (research 199 s6, H4-6): the bytes the hull carries.
    expect(byte('INVISIBLE_DI')).toBe(3);
    expect(byte('METAL_GRATE')).toBe(28);
  });

  it('a face of each see-through material does not shelter the head; a face of any other material does', () => {
    for (let i = 1; i < TABLE.length; i++) {
      const m = TABLE[i]!;
      expect([m.name, blastExposed(world([pane(0, i)]), FROM, TO, '')]).toEqual([m.name, blastSeesThrough(m)]);
    }
  });

  it('LATER 615 alone (r0001): LIQUID, PICKUP, bit 3 and PERSON are seen through; METAL_GRATE_THIN, the leafy tree (VOLUMETRIC alone) and glass still shelter', () => {
    for (const name of ['WATER', 'ITEM', 'PARTICLE_SYSTEM', 'PERSON']) expect([name, blastExposed(world([pane(0, byte(name))]), FROM, TO, '')]).toEqual([name, true]);
    for (const name of ['METAL_GRATE_THIN', 'LEAFY_TREE', 'GLASS', 'CHAINLINK_FENCE', 'METAL_THICK']) expect([name, blastExposed(world([pane(0, byte(name))]), FROM, TO, '')]).toEqual([name, false]);
  });

  it('G6 (r0004): a METAL_GRATE or INVISIBLE_DI face between the blast and the head does not shelter it', () => {
    expect(blastExposed(world([pane(0, 28)]), FROM, TO, '')).toBe(true);
    expect(blastExposed(world([pane(0, 3)]), FROM, TO, '')).toBe(true);
  });

  it('the walk goes on past a see-through face: a grate in front of a thick wall still shelters (the loop to the next hit)', () => {
    expect(blastExposed(world([pane(10, 28, 'worldmodel/grate'), pane(-10, byte('METAL_THICK'), 'worldmodel/wall')]), FROM, TO, '')).toBe(false);
    expect(blastExposed(world([pane(10, 3, 'worldmodel/invis'), pane(-10, byte('WATER'), 'worldmodel/water')]), FROM, TO, '')).toBe(true);
  });

  it("byte 0 is the map's DefaultMaterial: a default METAL_GRATE or WATER is seen through, METAL_THICK or none (UNKNOWN) shelters", () => {
    const g = world([pane(0, 0)]);
    expect(blastExposed(g, FROM, TO, 'METAL_GRATE')).toBe(true);
    expect(blastExposed(g, FROM, TO, 'WATER')).toBe(true);
    expect(blastExposed(g, FROM, TO, 'METAL_THICK')).toBe(false);
    expect(blastExposed(g, FROM, TO, '')).toBe(false);
  });

  it("keeps the round's query class and one side (LATER 416, research 386 s3.2): a camera-only pane passed, the back of a wall not met", () => {
    const cam: WorldPoly = { ...pane(0, byte('METAL_THICK')), cameratype: 1 };
    expect(blastExposed(world([cam]), FROM, TO, '')).toBe(true);
    expect(blastExposed(world([pane(0, byte('METAL_THICK'))]), TO, FROM, '')).toBe(true);
    expect(blastExposed(world([]), FROM, TO, '')).toBe(true);
  });

  it("the charges' line (blastSeen, FUN_003c80e0's side: unchanged in r0004) is not given the skips: a grate, an invisible wall and water still stop it", () => {
    for (const i of [28, 3, byte('WATER')]) expect(blastSeen(world([pane(0, i)]), FROM, TO)).toBe(false);
  });
});
