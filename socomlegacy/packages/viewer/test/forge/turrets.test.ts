import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { DEFAULT_GRID_PARAMS, type CollisionOwner, type TurretPlacement, type WorldPoly } from '@s2u/scene';
import { groundPolygons, packGround } from '../../src/mover';
import type { LoadedMap } from '../../src/loadMap';
import { placedTurretRoot, turretMove, turretTemplates, withPlacedTurrets, copiedPlacement } from '../../src/forge/turrets';

/**
 * The layout's placed turrets (a browser adaptation, FG.R2): a copy of a disc map's own turret, moved to a new place and
 * facing -- its definition, parts and drawn props the template's, every matrix and point moved by P F^-1, its paths
 * renamed beneath its own root, numbered after the map's own.
 */
const placement = (over: Partial<TurretPlacement> = {}): TurretPlacement => ({
  id: 0, root: 'worldmodel/mp72_turret01', name: 'mp72_turret01', def: { name: 'mp72_turret01' } as TurretPlacement['def'],
  parts: { turret: 'worldmodel/mp72_turret01/R=R/turret', gun: 'worldmodel/mp72_turret01/R=R/turret/gun', firepoint: 'worldmodel/mp72_turret01/R=R/turret/gun/firepoint' },
  origin: [100, 10, 200], facing: 0, gunOrigin: [100, 10, 200], firepointOrigin: [100, 12, 190],
  limits: { yaw: [-0.2, 2], pitch: [-0.8, 0.6] }, mountRange: 22, mountAngleCos: 0.7, weapon: 'PKM TURRET', ammoInit: 750, ...over,
});
const lib = (): LoadedMap => ({
  archive: 'MP72', textures: { gun: {} }, textureFlags: {}, turrets: [placement()],
  props: [
    { modelName: 'R', parts: [{ textureName: 'gun' }], matrices: Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 100, 10, 200, 1]), order: 0, alternate: false, facade: 0, lod: null,
      paths: ['worldmodel/mp72_turret01/R=R/turret/gun/gunvis'] },
    { modelName: 'crate', parts: [], matrices: new Float32Array(16), order: 1, alternate: false, facade: 0, lod: null, paths: ['worldmodel/crate'] },
  ],
} as unknown as LoadedMap);

describe('placed turrets', () => {
  it('a template is a map turret with the props beneath its root', () => {
    const [t] = turretTemplates(lib(), 'MP72');
    expect([t!.source, t!.name, t!.pieces.map((p) => p.prop.modelName)]).toEqual(['MP72', 'mp72_turret01', ['R']]);
  });

  it('a copy at its own place and facing is the template; turned a quarter left, its muzzle swings to -x', () => {
    const [t] = turretTemplates(lib(), 'MP72');
    const same = copiedPlacement(t!, turretMove(t!, [100, 10, 200], 0), 'worldmodel/mp72_turret01', 0, 0);
    expect(same.firepointOrigin.map((v) => Math.round(v * 1000) / 1000)).toEqual([100, 12, 190]);
    const turned = copiedPlacement(t!, turretMove(t!, [0, 0, 0], Math.PI / 2), placedTurretRoot(0), 3, Math.PI / 2);
    expect(turned.firepointOrigin.map((v) => Math.round(v * 1000) / 1000)).toEqual([-10, 2, 0]);
    expect([turned.facing, turned.id, turned.root, turned.parts.gun]).toEqual([90, 3, 'worldmodel/forge_turret_1', 'worldmodel/forge_turret_1/R=R/turret/gun']);
  });

  it('copies join the map after its own, their props renamed and their foreign textures carried; a template not found counted', () => {
    const base = { archive: 'MP2', props: [], turrets: [placement({ id: 0, root: 'worldmodel/own' })], textures: {}, textureFlags: {} } as unknown as LoadedMap;
    const [t] = turretTemplates(lib(), 'MP72');
    const { map, unplaced } = withPlacedTurrets(base, [{ source: 'MP72', name: 'mp72_turret01', at: [0, 0, 0], yaw: 0 }, { source: 'MP9', name: 'x', at: [0, 0, 0], yaw: 0 }],
      (s, n) => (s === 'MP72' && n === 'mp72_turret01' ? t! : null));
    expect(unplaced).toBe(1);
    expect(map.turrets!.map((x) => [x.id, x.root])).toEqual([[0, 'worldmodel/own'], [1, 'worldmodel/forge_turret_1']]);
    expect(map.props[0]!.paths).toEqual(['worldmodel/forge_turret_1/R=R/turret/gun/gunvis']);
    expect(map.props[0]!.parts[0]!.textureName).toBe('MP72/gun');
    expect('MP72/gun' in map.textures).toBe(true);
  });
});

describe("a placed turret collides as the disc's does (FP-1b; REVIEW-A 15)", () => {
  // The hull's owners beneath the turret's root (`LoadedMap.ground`, the reader the map's collision comes through; the
  // same subtree test `placedAccess` copies a gate's collision by): copied, moved by P F^-1, renamed beneath the copy.
  const poly = (path: string, points: number[]): WorldPoly => ({
    modelName: 'R', path, region: 0, ditype: 2, material: 0, ptcount: points.length / 3, cameratype: 0, appflags: 0, inside: 0, reverbZone: 0,
    points: Float32Array.from(points),
  } as WorldPoly);
  const owner = (path: string, first: number, count: number): CollisionOwner => ({ modelName: 'R', path, first, count });
  const withHull = (): LoadedMap => ({
    ...lib(),
    ground: packGround(DEFAULT_GRID_PARAMS, [
      poly('worldmodel/mp72_turret01/R=R/base', [99, 10, 199, 101, 10, 199, 101, 12, 201]),
      poly('worldmodel/crate', [0, 0, 0, 1, 0, 0, 1, 1, 0]),
    ], [owner('worldmodel/mp72_turret01/R=R/base', 0, 1), owner('worldmodel/crate', 1, 1)]),
  } as unknown as LoadedMap);

  it("a template carries the hull's owners beneath its root, and no other", () => {
    const [t] = turretTemplates(withHull(), 'MP72');
    expect(t!.owners.map((o) => [o.owner.path, o.polys.length])).toEqual([['worldmodel/mp72_turret01/R=R/base', 1]]);
    expect(turretTemplates(lib(), 'MP72')[0]!.owners).toEqual([]);
  });

  it("each copy's polygons join the map's hull after its own, moved and renamed beneath the copy's root", () => {
    const base = {
      archive: 'MP72', props: [], turrets: [], textures: {}, textureFlags: {},
      ground: packGround(DEFAULT_GRID_PARAMS, [poly('worldmodel/wall', [5, 0, 5, 6, 0, 5, 6, 1, 5])], [owner('worldmodel/wall', 0, 1)]),
    } as unknown as LoadedMap;
    const [t] = turretTemplates(withHull(), 'MP72');
    const { map } = withPlacedTurrets(base, [{ source: 'MP72', name: 'mp72_turret01', at: [0, 0, 0], yaw: 0 }], () => t!);
    expect(map.ground!.owners.map((o) => [o.path, o.first, o.count])).toEqual([
      ['worldmodel/wall', 0, 1], ['worldmodel/forge_turret_1/R=R/base', 1, 1],
    ]);
    const polys = groundPolygons(map.ground!);
    expect(Array.from(polys[1]!.points).map((v) => Math.round(v * 1000) / 1000)).toEqual([-1, 0, -1, 1, 0, -1, 1, 2, 1]);
    expect(Array.from(polys[0]!.points)).toEqual([5, 0, 5, 6, 0, 5, 6, 1, 5]);
    // A map with no hull takes the turret without its polygons, as before.
    const bare = withPlacedTurrets({ ...base, ground: undefined } as unknown as LoadedMap, [{ source: 'MP72', name: 'mp72_turret01', at: [0, 0, 0], yaw: 0 }], () => t!);
    expect(bare.map.ground).toBeUndefined();
  });
});

/** Disc-backed (`SOCOM_ISO`): Crossroads' own two turrets, copied onto their own place, are themselves. Skipped, and said, without it. */
const ISO = process.env['SOCOM_ISO'];
describe.skipIf(!ISO || !existsSync(ISO))('placed turrets on the disc (SOCOM_ISO)', () => {
  it("a copy of each of Crossroads' turrets at its own place and facing is that turret: its points and its props' matrices", async () => {
    const { IsoAssetSource } = await import('@s2u/archive');
    const { fsBlob } = await import('../../../../tools/fmv-spike');
    const { loadMap } = await import('../../src/loadMap');
    const map = await loadMap(new IsoAssetSource(fsBlob(ISO!)), 'RUN/MP72.ZDB');
    const templates = turretTemplates(map, 'MP72');
    expect(templates.map((t) => t.name).sort()).toEqual(['mp72_turret01', 'mp72_turret02']);
    for (const t of templates) {
      const p = t.placement;
      const m = turretMove(t, p.origin, p.facing * Math.PI / 180);
      const copy = copiedPlacement(t, m, p.root, p.id, p.facing * Math.PI / 180);
      const near = (a: readonly number[], b: readonly number[]): void => a.forEach((v, i) => expect(v, t.name).toBeCloseTo(b[i]!, 3));
      near(copy.origin, p.origin); near(copy.gunOrigin, p.gunOrigin); near(copy.firepointOrigin, p.firepointOrigin);
      expect(copy.facing).toBeCloseTo(p.facing, 6);
      expect(t.pieces.length).toBeGreaterThan(3);
    }
  }, 120_000);

  it("each Crossroads turret's root owns three hull polygons (its *MG_turret), copied into the joined hull at the placed turret's transform", async () => {
    const { IsoAssetSource } = await import('@s2u/archive');
    const { fsBlob } = await import('../../../../tools/fmv-spike');
    const { loadMap } = await import('../../src/loadMap');
    const map = await loadMap(new IsoAssetSource(fsBlob(ISO!)), 'RUN/MP72.ZDB');
    const templates = turretTemplates(map, 'MP72');
    // Measured off the disc (FP-1b, the review's F2): MP72's hull, read by `loadMap`, has one owner under each turret root.
    expect(templates.map((t) => [t.name, t.owners.map((o) => [o.owner.path, o.polys.length])])).toEqual([
      ['mp72_turret02', [['worldmodel/mp72_turret02/LMG_turret', 3]]],
      ['mp72_turret01', [['worldmodel/mp72_turret01/RMG_turret', 3]]],
    ]);
    const before = groundPolygons(map.ground!);
    for (const t of templates) {
      // A copy 100 u along x and 50 along z, at the disc turret's own facing: its polygons the disc's, moved by that alone.
      const p = t.placement;
      const at: [number, number, number] = [p.origin[0] + 100, p.origin[1], p.origin[2] + 50];
      const { map: joined } = withPlacedTurrets(map, [{ source: 'MP72', name: t.name, at, yaw: p.facing * Math.PI / 180 }], () => t);
      const owners = joined.ground!.owners.slice(map.ground!.owners.length);
      const leaf = t.owners[0]!.owner.path.slice(p.root.length);
      expect(owners.map((o) => [o.path, o.first, o.count]), t.name).toEqual([[`worldmodel/forge_turret_1${leaf}`, before.length, 3]]);
      const copied = groundPolygons(joined.ground!).slice(before.length);
      t.owners[0]!.polys.forEach((poly, k) => {
        const got = copied[k]!.points;
        for (let i = 0; i < poly.points.length; i += 3) {
          expect(got[i]!, t.name).toBeCloseTo(poly.points[i]! + 100, 2);
          expect(got[i + 1]!, t.name).toBeCloseTo(poly.points[i + 1]!, 2);
          expect(got[i + 2]!, t.name).toBeCloseTo(poly.points[i + 2]! + 50, 2);
        }
      });
      // The map's own polygons are untouched, first in the joined hull.
      expect(Array.from(groundPolygons(joined.ground!)[0]!.points)).toEqual(Array.from(before[0]!.points));
    }
  }, 120_000);
});
