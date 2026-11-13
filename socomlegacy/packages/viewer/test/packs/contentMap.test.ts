import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOMB_SITE_REACH, CONTENT_MAP_CODES, CONTENT_MAP_FEET_RANGE_UNITS, CONTENT_MAP_METRES_PER_UNIT_ADAPTATION, CONTENT_MAP_SPAN_METRES_ADAPTATION, gameplayDigest, readContentMapDefinition, type ContentMapDefinition, type ContentRef } from '@s2u/creator-contracts';
import { aiCellIndex, castRay, isWallSurface, namedPoint, probeGround } from '@s2u/scene';
import { MAP_PACK, MAP_REF, minimalMapJson, PROP_PACK } from '../../../creator-contracts/test/contentMapFixtures';
import { groundGrid, groundPolygons } from '../../src/mover';
import { loadAnyMap, type LoadedMap } from '../../src/loadMap';
import { FEET_RANGE } from '../../src/net/codec';
import { plantSite } from '../../src/net/objective';
import { readAssetDefinition, type AssetDefinition } from '../../src/packs/content/assets';
import { CONTENT_METRES_PER_UNIT_ADAPTATION } from '../../src/packs/content/collision';
import { ContentMapLoadError, loadContentMap, mapSwap, type ContentLoadStage } from '../../src/packs/content/map';
import { solidJson } from './contentFixtures';

/**
 * FCW-10 (product track; a browser adaptation with no original): an authored map loads to the `LoadedMap` a retail load
 * gives -- its hull through the content polygon provider, its spawns, its objectives, its navigation grid -- or rejects
 * whole, and the caller's world is swapped only on success. The retail loader (`loadMap`) is not touched: its own tests
 * hold it.
 */

const U = 1 / CONTENT_METRES_PER_UNIT_ADAPTATION;
const defOf = (json: Record<string, unknown> = minimalMapJson()): ContentMapDefinition => {
  const got = readContentMapDefinition(json, MAP_REF);
  if (Array.isArray(got)) throw new Error(got.map((d) => d.code).join(', '));
  return got;
};
const crate = (): AssetDefinition => {
  const got = readAssetDefinition(solidJson(), { kind: 'pack', pack: PROP_PACK, assetId: 'crate' });
  if (Array.isArray(got)) throw new Error('no crate');
  return got as AssetDefinition;
};

describe('FCW-10 loadContentMap', () => {
  it('builds a LoadedMap whose hull probes as the regions say: the floor stands a body, the divider stops a shot', async () => {
    const stages: ContentLoadStage[] = [];
    const map = await loadContentMap(defOf(), { onStage: (s) => { if (stages[stages.length - 1] !== s) stages.push(s); } });
    expect(stages).toEqual(['validating', 'dependencies', 'collision', 'navigation', 'objectives', 'ready']);
    const grid = groundGrid(map.ground!);
    expect(probeGround(grid, -10 * U, 5 * U).map((h) => h.y)).toEqual([0]);
    expect(probeGround(grid, 30 * U, 0)).toEqual([]);
    // The divider's top is a wall's, never a floor: under it the probe finds the floor alone.
    expect(probeGround(grid, 0, 0).map((h) => h.y)).toEqual([0]);
    expect(castRay(grid, [-10 * U, 1.5 * U, 0], [1, 0, 0], 20 * U, isWallSurface)?.point[0]).toBeCloseTo(-0.5 * U, 3);
    expect(castRay(grid, [-10 * U, 1.5 * U, -12 * U], [1, 0, 0], 20 * U, isWallSurface)).toBeNull();
    expect(map.ground!.owners.map((o) => o.path)).toEqual(['content/floor', 'content/divider']);
    expect(groundPolygons(map.ground!).map((p) => p.ditype)).toEqual([3, 2, 2]);
  });

  it('carries the spawns, the five-type objectives and the navigation in the retail shapes', async () => {
    const map = await loadContentMap(defOf());
    expect(map.slots.map((s) => [s.side, s.index, s.position, s.onFloor, s.step])).toEqual([
      [0, 0, [-15 * U, 0, 0], true, 2], [1, 0, [15 * U, 0, 0], true, 6],
    ]);
    expect(map.respawns).toEqual(map.slots);
    expect(map.gameType).toBe(1);
    expect(map.bombStart).toEqual([0, 0, -12 * U]);
    expect(plantSite('seal', map.actions ?? [])?.at).toEqual([14 * U, 0, 0]);
    expect(map.meta?.actions).toEqual(map.actions);
    const sub = map.ai!.maps[0]!;
    expect([sub.cellsX, sub.cellsZ, sub.cellSize, sub.min]).toEqual([10, 8, [4 * U, 4 * U], [-20 * U, 0, -16 * U]]);
    expect(aiCellIndex(sub, 9, 7)).toBe(79);
    expect(namedPoint(map.ai!, 'charlie')?.point.loc).toEqual({ map: 0, x: 5, z: 1 });
    expect(map.metersPerUnit).toBe(CONTENT_METRES_PER_UNIT_ADAPTATION);
    expect(map.content.digest).toBe(await gameplayDigest(defOf()));
    expect(map.content.ref).toEqual(MAP_REF);
    expect(map.world.length).toBe(1);
  });

  it('a prop from a declared pack is solid through the FCW-09 provider; one not resolved fails the load whole', async () => {
    const prop = { content: { kind: 'pack', pack: PROP_PACK, assetId: 'crate' }, at: [5, 0, 5], yaw: 0 };
    const def = defOf(minimalMapJson({ props: [prop], dependencies: [PROP_PACK] }));
    const resolveAsset = (ref: ContentRef): AssetDefinition | null => (ref.assetId === 'crate' ? crate() : null);
    const map = await loadContentMap(def, { resolveAsset });
    expect(map.ground!.owners.map((o) => o.path)).toEqual(['content/floor', 'content/divider', 'content/prop_0']);
    expect(Math.max(...probeGround(groundGrid(map.ground!), 5 * U, 5 * U).map((h) => h.y))).toBeCloseTo(1.5 * U, 3);
    const failed = await loadContentMap(def, { resolveAsset: () => null }).catch((e: unknown) => e);
    expect(failed).toBeInstanceOf(ContentMapLoadError);
    expect((failed as ContentMapLoadError).diagnostics.map((d) => d.code)).toEqual([CONTENT_MAP_CODES.dependencyUnavailable]);
  });

  it('a definition that does not read, or a digest that does not match, is refused before anything is built', async () => {
    const bad = { ...defOf(), units: 'foot' } as unknown as ContentMapDefinition;
    const refused = await loadContentMap(bad).catch((e: unknown) => e);
    expect((refused as ContentMapLoadError).diagnostics.map((d) => d.code)).toEqual([CONTENT_MAP_CODES.units]);
    const pinned = await loadContentMap(defOf(), { expectDigest: '0'.repeat(64) }).catch((e: unknown) => e);
    expect((pinned as ContentMapLoadError).diagnostics.map((d) => d.code)).toEqual([CONTENT_MAP_CODES.digestMismatch]);
  });
});

describe('FCW-10 the caller contract: an aborted, stale or partial load leaves the previous world', () => {
  const previous = { name: 'Frostfire', path: 'RUN/MP72.ZDB' } as LoadedMap;

  it('an aborted load rejects and the previous LoadedMap stays current', async () => {
    const swap = mapSwap(previous);
    const pending = swap.replace((signal) => loadContentMap(defOf(), { signal }));
    swap.cancel();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(swap.current).toBe(previous);
    const aborted = new AbortController();
    aborted.abort();
    await expect(loadContentMap(defOf(), { signal: aborted.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('a failed (partial) load rejects and leaves it; a newer load supersedes an older; only success swaps', async () => {
    const swap = mapSwap(previous);
    await expect(swap.replace(() => loadContentMap(defOf(minimalMapJson({ props: [{ content: { kind: 'pack', pack: PROP_PACK, assetId: 'crate' }, at: [5, 0, 5], yaw: 0 }], dependencies: [PROP_PACK] }))))).rejects.toBeInstanceOf(ContentMapLoadError);
    expect(swap.current).toBe(previous);
    let release: (m: LoadedMap) => void = () => {};
    const slow = swap.replace(() => new Promise<LoadedMap>((r) => { release = r; }));
    const fast = swap.replace((signal) => loadContentMap(defOf(), { signal }));
    const loaded = await fast;
    expect(swap.current).toBe(loaded);
    release(previous);
    await expect(slow).rejects.toMatchObject({ name: 'AbortError' });
    expect(swap.current).toBe(loaded);
  });
});

describe('FCW-10 the committed courtyard fixture (tools/creator-import/fixtures/maps, its README) as a definition', () => {
  type Source = {
    bounds: { min: number[]; max: number[] };
    collision: { polygons: { owner: string; role: 'floor' | 'wall'; vertices: number[][] }[] };
    spawns: { team: 'A' | 'B'; position: number[]; facing: number[] }[];
    objectives: { pickup: { position: number[] }; sites: { plantingTeam: 'A' | 'B'; position: number[] }[] };
    geometryProbes: { rays: { id: string; from: number[]; to: number[]; blocked: boolean }[] };
  };
  const source = JSON.parse(readFileSync(new URL('../../../../tools/creator-import/fixtures/maps/courtyard.source.json', import.meta.url), 'utf8')) as Source;
  /**
   * The test's own adaptation of the neutral source (the import tool's adapter is not this task's): each collision owner
   * one region (floor role walkable, wall role solid), a facing (fx, fz) the yaw `slotsOfSpawns` reads (step k faces
   * (sin 45k, -cos 45k), `@s2u/scene` `facingVector`), planting team A the SEALs' side 0, a site's reach the disc's
   * `BOMB_SITE_REACH` (the README: the engine keeps reach).
   */
  const owners = [...new Set(source.collision.polygons.map((p) => p.owner))];
  const json = minimalMapJson({
    bounds: source.bounds,
    regions: owners.map((owner) => {
      const polys = source.collision.polygons.filter((p) => p.owner === owner);
      return { id: owner, role: polys[0]!.role === 'floor' ? 'walkable' : 'solid', polygons: polys.map((p) => p.vertices) };
    }),
    spawns: source.spawns.map((s) => ({ team: s.team, at: s.position, yaw: -Math.atan2(s.facing[0]!, -s.facing[2]!) })),
    objectives: {
      gameType: 2,
      bomb: {
        start: source.objectives.pickup.position,
        sites: source.objectives.sites.map((s) => ({
          team: s.plantingTeam === 'A' ? 0 : 1, at: s.position, yaw: 0,
          range: BOMB_SITE_REACH * CONTENT_MAP_METRES_PER_UNIT_ADAPTATION, elevation: BOMB_SITE_REACH * CONTENT_MAP_METRES_PER_UNIT_ADAPTATION,
        })),
      },
    },
    navigation: undefined,
  });

  it('reads and loads: 31 polygons, the four spawns on the floor, the two rays as the README states them', async () => {
    const map = await loadContentMap(defOf(json));
    expect(groundPolygons(map.ground!)).toHaveLength(31);
    expect(map.slots.map((s) => [s.side, s.onFloor, s.step])).toEqual([[0, true, 2], [0, true, 2], [1, true, 6], [1, true, 6]]);
    expect(map.gameType).toBe(2);
    const grid = groundGrid(map.ground!);
    for (const ray of source.geometryProbes.rays) {
      const from = ray.from.map((v) => v * U) as [number, number, number], to = ray.to.map((v) => v * U);
      const dir: [number, number, number] = [to[0]! - from[0], to[1]! - from[1], to[2]! - from[2]];
      expect([ray.id, castRay(grid, from, dir, Math.hypot(...dir), isWallSurface) !== null]).toEqual([ray.id, ray.blocked]);
    }
  });
});

describe('FCW-10 loadMap.ts routes a content base beside the ZDB path', () => {
  it('the map and the pack prop share one scale', () => {
    expect(CONTENT_MAP_METRES_PER_UNIT_ADAPTATION).toBe(CONTENT_METRES_PER_UNIT_ADAPTATION);
  });

  it('FX-LIMITS: the content map width bound restates the wire feet range and stays inside it', () => {
    // The feet reach FEET_RANGE units either side of the map hull centre (protocol 11): a map no wider than the span
    // bound keeps every point of its hull, and so every standing body, inside that reach on every axis.
    expect(CONTENT_MAP_FEET_RANGE_UNITS).toBe(FEET_RANGE);
    expect(CONTENT_MAP_SPAN_METRES_ADAPTATION / 2).toBeLessThan(FEET_RANGE * CONTENT_MAP_METRES_PER_UNIT_ADAPTATION);
  });

  it('a content base reads its map member through the structured reference and loads it', async () => {
    const asked: ContentRef[] = [];
    const map = await loadAnyMap({
      kind: 'content', base: { kind: 'content', ref: MAP_PACK, mapId: 'yard', library: 'MP72' },
      readMap: async (ref) => { asked.push(ref); return minimalMapJson(); },
    });
    expect(asked).toEqual([MAP_REF]);
    expect(map.slots).toHaveLength(2);
    const missing = await loadAnyMap({ kind: 'content', base: { kind: 'content', ref: MAP_PACK, mapId: 'gone', library: 'MP72' }, readMap: async () => null })
      .catch((e: unknown) => e);
    expect((missing as ContentMapLoadError).diagnostics.map((d) => d.code)).toEqual([CONTENT_MAP_CODES.mapUnavailable]);
  });
});
