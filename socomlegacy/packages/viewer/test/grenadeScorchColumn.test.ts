import { describe, expect, it } from 'vitest';
import { buildGrid, materialTable, type Grid, type GridParams, type HullCast, type HullHit, type SurfaceMaterial, type V3, type WorldPoly } from '@s2u/scene';
import { GrenadeThrower, scorchHit, SCORCH_ABOVE } from '../src/grenade';
import { GRENADE_BITMAPS } from '../src/grenadeAssets';
import { WORLD_COLUMN_HALF, worldColumn } from '../src/net/placing';
import type { PlaySnapshot } from '../src/walk';

/**
 * AD-4 (web sprint 40; the reconciliation's C12, research 202 §3.4): the scorch's ground is the game's own selector. The
 * explosion (`FUN_003c7af0` D:L318876) asks `FUN_0031df50(10.0, world, pos)` (D:L220029-220045): the world's vertical
 * line at the blast's x and z from +50000 to -50000 (`FUN_002d49c0` D:L175812-175818, 0x47435000 / 0xc7435000), and of
 * what it meets the highest no more than 10 over the blast, the first of equal heights (`FUN_002d4c20`
 * D:L175857-175892: a later entry replaces only a strictly higher one), with no lower bound and no material test; the
 * decal is made only on a hit (`if (lVar5 != 0)`, D:L318877). Was: the placement's material filter, 10 above and 10
 * below, and a flat scorch at the blast when nothing was found.
 */

const table = materialTable();
const mat = (name: string): SurfaceMaterial => table.find((m) => m.name === name)!;
const hit = (y: number, material = 'STONE'): HullHit => ({ point: [0, y, 0], normal: [0, 1, 0], material: mat(material), t: 0 });

describe('AD-4: the scorch selector (FUN_002d4c20) over the world column (FUN_0031df50)', () => {
  it('the column is the world line at the blast\'s x and z, +50000 to -50000', () => {
    expect(WORLD_COLUMN_HALF).toBe(50000);
    const asked: [V3, V3][] = [];
    const cast: HullCast = (a, b) => { asked.push([a, b]); return []; };
    worldColumn(cast, [12, 34, 56]);
    expect(asked).toEqual([[[12, 50000, 56], [12, -50000, 56]]]);
  });

  it('the upper allowance is 10: a surface exactly 10 over the blast is taken, one 10.01 over is not', () => {
    expect(SCORCH_ABOVE).toBe(10);
    const at10 = hit(60), over = hit(60.01), floor = hit(50);
    expect(scorchHit([over, at10, floor], 50)).toBe(at10);
    expect(scorchHit([over, floor], 50)).toBe(floor);
  });

  it('a deep floor is taken: no lower bound (5000 under the blast)', () => {
    const deep = hit(-4950);
    expect(scorchHit([hit(80), deep], 50)).toBe(deep);
  });

  it('no hit: null (nothing at all, or only surfaces above the allowance)', () => {
    expect(scorchHit([], 50)).toBeNull();
    expect(scorchHit([hit(70), hit(61)], 50)).toBeNull();
  });

  it('a tie: the first of equal heights (a later one replaces only a strictly higher one)', () => {
    const first = hit(40, 'DIRT'), second = hit(40, 'GRASS');
    expect(scorchHit([first, second], 50)).toBe(first);
    expect(scorchHit([second, first], 50)).toBe(second);
  });

  it('no material test: WATER (LIQUID), a VOLUMETRIC one and ITEM (PENETRATION 1) are taken as any surface', () => {
    const volumetric = table.find((m) => m.volumetric)!;
    expect(volumetric).toBeDefined();
    for (const m of ['WATER', 'ITEM', 'ACTION', volumetric.name]) {
      const top = hit(48, m);
      expect(scorchHit([top, hit(0)], 50)).toBe(top);
    }
  });
});

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
/** A floor at `y` over x in [x0, x1], z in [-2000, 2000]. */
function floorGrid(y: number, x0 = -2000, x1 = 2000): Grid {
  const poly: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/f', region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0,
    points: Float32Array.from([x0, y, -2000, x1, y, -2000, x1, y, 2000, x0, y, 2000]),
  };
  return buildGrid(PARAMS, [], [], [poly], [{ modelName: 'worldmodel', path: 'worldmodel/f0', first: 0, count: 1 }]);
}
const snap = (): PlaySnapshot => ({
  feet: [100, 50, 200], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
  landing: null, jumps: 0,
} as PlaySnapshot);
const run = (g: GrenadeThrower, seconds: number): void => { for (let t = 0; t < seconds; t += 1 / 60) g.update(1 / 60); };

describe('AD-4: the scorch is dispatched on a hit only (FUN_003c7af0 D:L318876-318880)', () => {
  /** A claymore set on the floor at 50, then the hull swapped for `blastGrid` and the charge fired. */
  function blastOver(blastGrid: Grid): GrenadeThrower {
    let grid = floorGrid(50);
    const g = new GrenadeThrower({ grid: () => grid, snapshot: snap, view: () => 'third', handPoint: () => [102, 62, 192] });
    const rgba = { width: 2, height: 2, data: new Uint8ClampedArray(16).fill(128) };
    g.setMap(null, { models: [], bitmaps: { [GRENADE_BITMAPS.scorch]: rgba }, defaultMaterial: '' });
    g.select('Claymore');
    g.pull();
    run(g, 1.5);
    expect(g.stats().placed).toBe(1);
    grid = blastGrid;
    expect(g.detonateCharges()).toBe(1);
    run(g, 0.1);
    return g;
  }

  it('nothing in the column under or over the blast: no scorch at all (was: a flat scorch at the blast)', () => {
    expect(blastOver(floorGrid(50, 1000, 2000)).scorchMeshes()).toHaveLength(0);
  });

  it('a floor in the column: one scorch', () => {
    expect(blastOver(floorGrid(50)).scorchMeshes()).toHaveLength(1);
  });
});
