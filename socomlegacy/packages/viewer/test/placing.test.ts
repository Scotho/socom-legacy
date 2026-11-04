import { describe, expect, it } from 'vitest';
import { parseRdr, Zar } from '@s2u/archive';
import {
  buildGrid, gridCast, materialTable, soilsTable, type Grid, type GridParams, type HullCast, type HullHit, type SurfaceMaterial, type V3,
  type WorldPoly,
} from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { GrenadeThrower } from '../src/grenade';
import { EYE_HEIGHT } from '../src/mover';
import * as placing from '../src/net/placing';
import { chargeRests, placeGround, restsOn } from '../src/net/placing';
import type { PlaySnapshot } from '../src/walk';

/**
 * AD-4 (web sprint 40; the reconciliation's C11, research 202 §2.2 adopted at reading, LATER 38): the placement's own
 * accept test. `FUN_005c2430` (D:L477228-477230) keeps a column entry whose material slot is empty, or whose `+0x3c`
 * has bit 0 (VOLUMETRIC) clear and bit 1 (LIQUID) clear -- or set with the allow-liquid argument, which its one caller
 * passes as 0 (D:L477002). No penetration test: the port's `penetration !== 1` refused ACTION, INVISIBLE_DI and ITEM,
 * which the original accepts. Over the disc's 44 SOILS (`READERC.ZAR` `materials.rdr`, read through `soilsTable`).
 */

const READERC = fixture('RUN/READERC.ZAR');
const hitOf = (material: SurfaceMaterial): HullHit => ({ point: [0, 0, 0], normal: [0, 1, 0], material, t: 0 });
/** The filter the port had before AD-4 (`restsOn` until 2026-10-16), kept here to name what changed. */
const before = (m: SurfaceMaterial): boolean => !m.volumetric && m.penetration !== 1 && !m.liquid;

describe.skipIf(!READERC)(`AD-4: restsOn is FUN_005c2430's accept test over the 44 materials${READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const zar = READERC ? Zar.parse(READERC) : null;
  const soils = zar ? soilsTable(parseRdr(zar.data(zar.root.children.find((k) => k.name.toLowerCase() === 'materials.rdr')!))) : [];

  it('the disc has 44 SOILS; a surface is refused exactly when it is VOLUMETRIC or LIQUID', () => {
    expect(soils).toHaveLength(44);
    for (const m of soils) expect(restsOn(hitOf(m)), m.name).toBe(!m.volumetric && !m.liquid);
  });

  it('against the port\'s old filter, exactly ACTION, INVISIBLE_DI and ITEM are now accepted, and nothing newly refused', () => {
    expect(soils.filter((m) => restsOn(hitOf(m)) && !before(m)).map((m) => m.name)).toEqual(['ACTION', 'INVISIBLE_DI', 'ITEM']);
    expect(soils.filter((m) => !restsOn(hitOf(m)) && before(m)).map((m) => m.name)).toEqual([]);
  });

  it('the refused: the VOLUMETRIC and the LIQUID ones (WATER among them), as before', () => {
    const refused = soils.filter((m) => !restsOn(hitOf(m))).map((m) => m.name);
    expect(refused).toContain('WATER');
    expect(refused).toEqual(soils.filter((m) => m.volumetric || m.liquid).map((m) => m.name));
  });
});

/** A column of surfaces (each `[y, material]`) as a cast gives it, highest first, under any point; the asks kept. */
function columnCast(surfaces: readonly (readonly [number, string])[]): { cast: HullCast; asked: [V3, V3][] } {
  const table = materialTable();
  const asked: [V3, V3][] = [];
  const cast: HullCast = (a, b) => {
    asked.push([[...a], [...b]]);
    return surfaces
      .filter(([y]) => y <= Math.max(a[1], b[1]) && y >= Math.min(a[1], b[1]))
      .map(([y, name]) => ({
        point: [a[0], y, a[2]] as V3, normal: [0, 1, 0] as V3, material: table.find((m) => m.name === name)!,
        t: Math.abs(a[1] - y) / Math.abs(a[1] - b[1]),
      }))
      .sort((p, q) => p.t - q.t);
  };
  return { cast, asked };
}

describe('AD-4: placeGround is FUN_005c2430\'s selection over the world column', () => {
  const HAND: V3 = [10, 62, 20];

  it('asks the world\'s line at the hand\'s x and z, +50000 to -50000 (FUN_0031dea0 -> FUN_002d49c0)', () => {
    const { cast, asked } = columnCast([[50, 'STONE']]);
    placeGround(cast, HAND);
    expect(asked).toEqual([[[10, 50000, 20], [10, -50000, 20]]]);
  });

  it('the highest accepted surface at or below the hand: a ledge 0.5 over the hand is not chosen when a floor lies below', () => {
    expect(placeGround(columnCast([[62.5, 'STONE'], [50, 'STONE']]).cast, HAND)!.point[1]).toBe(50);
    expect(placeGround(columnCast([[62.5, 'STONE'], [58, 'DIRT'], [50, 'STONE']]).cast, HAND)!.point[1]).toBe(58);
    expect(placeGround(columnCast([[62, 'STONE'], [50, 'STONE']]).cast, HAND)!.point[1]).toBe(62);   // at the hand: taken
  });

  it('none at or below the hand: the lowest accepted surface in the column, over the hand (under a table)', () => {
    expect(placeGround(columnCast([[80, 'STONE'], [65, 'METAL_THICK']]).cast, HAND)!.point[1]).toBe(65);
  });

  it('VOLUMETRIC and LIQUID entries are skipped by both picks; ACTION, INVISIBLE_DI and ITEM are taken', () => {
    const volumetric = materialTable().find((m) => m.volumetric)!.name;
    expect(placeGround(columnCast([[61, 'WATER'], [60, volumetric], [50, 'STONE']]).cast, HAND)!.point[1]).toBe(50);
    expect(placeGround(columnCast([[70, 'STONE'], [64, 'WATER']]).cast, HAND)!.point[1]).toBe(70);
    for (const name of ['ACTION', 'INVISIBLE_DI', 'ITEM']) {
      expect(placeGround(columnCast([[60, name], [50, 'STONE']]).cast, HAND)!.material.name).toBe(name);
    }
    expect(placeGround(columnCast([[70, 'WATER'], [55, volumetric]]).cast, HAND)).toBeNull();
    expect(placeGround(columnCast([]).cast, HAND)).toBeNull();
  });

  it('a tie keeps the later entry, in both picks (an earlier best is kept only when strictly lower or higher, D:L477231-477239)', () => {
    expect(placeGround(columnCast([[55, 'DIRT'], [55, 'GRASS']]).cast, HAND)!.material.name).toBe('GRASS');
    expect(placeGround(columnCast([[55, 'GRASS'], [55, 'DIRT']]).cast, HAND)!.material.name).toBe('DIRT');
    expect(placeGround(columnCast([[70, 'DIRT'], [70, 'GRASS']]).cast, HAND)!.material.name).toBe('GRASS');
  });

  it('no cast lift: the column takes no surface over the hand while one lies at or under it (the `fVar14 <= fVar4` test, D:L477232)', () => {
    expect(Object.keys(placing).filter((k) => /CAST_LIFT/.test(k))).toEqual([]);
  });

  it('no rest lift: the charge sits on the entry\'s point (FUN_005c2430 returns the entry, D:L477007-477010 hand its x, y, z to FUN_005bc730, which sets the model there, D:L473998-474004)', () => {
    expect(Object.keys(placing).filter((k) => /LIFT/.test(k))).toEqual([]);
  });
});

/** A charge's point on a surface at `y`: on it, no rest lift (AD-4; was 0.1 over it, the page's own). */
const on = (y: number): V3 => [0, y, 0];

describe('AD-4: the room\'s check (chargeRests) takes what placeGround can give', () => {
  const FEET = 50, EYE = FEET + EYE_HEIGHT;

  it('a charge on its surface is taken, an ACTION face among them; one in the air past the slack is not', () => {
    expect(chargeRests(columnCast([[50, 'STONE']]).cast, on(50), FEET, EYE)).toBe(true);
    expect(chargeRests(columnCast([[55, 'ACTION'], [50, 'STONE']]).cast, on(55), FEET, EYE)).toBe(true);
    expect(chargeRests(columnCast([[50, 'STONE']]).cast, on(50.3), FEET, EYE)).toBe(false);
    expect(chargeRests(columnCast([[50, 'WATER']]).cast, on(50), FEET, EYE)).toBe(false);
  });

  it('the feet test: a surface no higher than the feet less placeDrop (10) is refused (D:L477005)', () => {
    expect(chargeRests(columnCast([[40.5, 'STONE']]).cast, on(40.5), FEET, EYE)).toBe(true);
    expect(chargeRests(columnCast([[40, 'STONE']]).cast, on(40), FEET, EYE)).toBe(false);
  });

  it('over the eye: taken only when it is the column\'s lowest accepted surface (nothing at or under the hand)', () => {
    expect(chargeRests(columnCast([[70, 'STONE']]).cast, on(70), FEET, EYE)).toBe(true);
    expect(chargeRests(columnCast([[70, 'STONE'], [64, 'WATER']]).cast, on(70), FEET, EYE)).toBe(true);
    expect(chargeRests(columnCast([[70, 'STONE'], [50, 'STONE']]).cast, on(70), FEET, EYE)).toBe(false);
  });
});

const GRID_PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
/** Level slabs `[y, material byte]` over x and z in [-2000, 2000]. */
function slabs(list: readonly (readonly [number, number])[]): Grid {
  const polys: WorldPoly[] = list.map(([y, material], i) => ({
    modelName: 'worldmodel', path: `worldmodel/s${i}`, region: 0, ditype: 3, material, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-2000, y, -2000, 2000, y, -2000, 2000, y, 2000, -2000, y, 2000]),
  }));
  return buildGrid(GRID_PARAMS, [], [], polys, polys.map((p, i) => ({ modelName: 'worldmodel', path: `${p.path}0`, first: i, count: 1 })));
}
const byte = (name: string): number => materialTable().findIndex((m) => m.name === name);
const snap = (): PlaySnapshot => ({
  feet: [100, 50, 200], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
  landing: null, jumps: 0,
} as PlaySnapshot);

describe('AD-4: the page and the room on the same command (PTW.R3): the page sets the charge where placeGround says, the room takes it', () => {
  /** The page's claymore set down under the hand (102, 62, 192), the feet at y 50, on `grid`: the place event's point, or null. */
  function place(grid: Grid): V3 | null {
    const g = new GrenadeThrower({ grid: () => grid, snapshot: snap, view: () => 'third', handPoint: () => [102, 62, 192] });
    let at: V3 | null = null;
    g.on('place', (e) => { at = [...e.pos]; });
    g.select('Claymore');
    g.pull();
    for (let t = 0; t < 1.5; t += 1 / 60) g.update(1 / 60);
    return at;
  }

  it('on an ITEM face at the feet: set on it, no lift, and the room takes it', () => {
    const grid = slabs([[50, byte('ITEM')]]);
    const at = place(grid);
    expect(at).not.toBeNull();
    expect(at![1]).toBeCloseTo(50, 9);
    expect(chargeRests(gridCast(grid), at!, 50, 50 + EYE_HEIGHT)).toBe(true);
  });

  it('a ledge 0.5 over the hand is passed for the floor; with nothing under the hand, the table over it is taken -- and the room takes each', () => {
    const ledge = slabs([[62.5, byte('STONE')], [50, byte('STONE')]]);
    const a = place(ledge)!;
    expect(a[1]).toBeCloseTo(50, 9);
    expect(chargeRests(gridCast(ledge), a, 50, 50 + EYE_HEIGHT)).toBe(true);
    const table = slabs([[70, byte('STONE')]]);
    const b = place(table)!;
    expect(b).not.toBeNull();
    expect(b[1]).toBeCloseTo(70, 9);
    expect(chargeRests(gridCast(table), b, 50, 50 + EYE_HEIGHT)).toBe(true);
  });

  it('nothing over the feet less 10 in the column: nothing is set down', () => {
    expect(place(slabs([[39, byte('STONE')]]))).toBeNull();
  });
});
