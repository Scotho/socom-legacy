import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import type { TurretPlacement } from '@s2u/scene';
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
});
