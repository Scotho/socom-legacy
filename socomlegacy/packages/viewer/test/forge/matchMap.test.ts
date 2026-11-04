import { describe, expect, it } from 'vitest';
import type { LoadedMap } from '../../src/loadMap';
import type { Layout } from '../../src/forge/layout';
import { floorGround, layoutGround } from '../../src/forge/ground';
import { groundWithout, placementsOf } from '../../src/forge/hide';
import { placementKey } from '../../src/forge/layout';
import { packGround } from '../../src/mover';
import { composeMatchMap, floorMesh, slotsOfSpawns, stepOfYaw } from '../../src/forge/matchMap';
import { contentAssetKey, type ContentRef } from '@s2u/creator-contracts';
import type { ContentMiss } from '../../src/forge/ground';
import { readAssetDefinition, type AssetDefinition } from '../../src/packs/content/assets';
import { propMatrix } from '../../src/packs/content/collision';
import { REF, solidJson } from '../packs/contentFixtures';

/**
 * FORGE (the owner, 2026-10-13: Play "starts an actual match with our testroom style local match"): the layout as one map
 * the match plays -- the base's, the pieces as props, the composed hull, the markers as the disc's spawn slots.
 */
const part = (tex: string | null) => ({ textureName: tex, positions: new Float32Array(9) }) as unknown as LoadedMap['props'][number]['parts'][number];
const prop = (modelName: string, tex: string, order = 0): LoadedMap['props'][number] => ({
  modelName, parts: [part(tex)], matrices: new Float32Array(16), order, alternate: false, facade: 0, lod: null,
});
const rgba = (n: number) => ({ width: 1, height: 1, pixels: new Uint8Array([n, n, n, 255]) }) as unknown as LoadedMap['textures'][string];
const base = {
  archive: 'MP2', path: 'RUN/MP2.ZDB', name: 'FROSTFIRE',
  props: [prop('crate', 'crate.tif', 4)], textures: { 'crate.tif': rgba(1) }, textureFlags: { 'crate.tif': {} },
  slots: [{ side: 0, index: 0, position: [9, 9, 9], onFloor: true, step: 0, facing: [0, -1], loc: { map: 0, x: 0, z: 0 } }],
} as unknown as LoadedMap;
const camp = {
  archive: 'M51', path: 'RUN/M51.ZDB', name: 'x',
  props: [prop('oak', 'crate.tif')], textures: { 'crate.tif': rgba(2) }, textureFlags: { 'crate.tif': { opaque: true } },
} as unknown as LoadedMap;
const I = (x: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1];
const layout: Layout = {
  forge: 1, base: { kind: 'map', archive: 'MP2' },
  pieces: [{ asset: 'MP2:crate', m: I(1) }, { asset: 'M51:oak', m: I(2) }, { asset: 'MP2:crate', m: I(3) }, { asset: 'M51:none', m: I(4) }],
  spawns: [{ team: 'A', p: [1, 2, 3], yaw: 0 }, { team: 'A', p: [4, 5, 6], yaw: -Math.PI / 2 }],
};
const libs = new Map([['MP2', base], ['M51', camp]]);

describe('FORGE: the match\'s map', () => {
  it('adds each prototype once as a prop after the base\'s, its placements one after another; a missing one counted', () => {
    const { map, missing } = composeMatchMap(base, layout, libs, floorGround(100));
    expect(missing).toBe(1);
    expect(map.props.map((p) => [p.modelName, p.matrices.length / 16, p.order])).toEqual([['crate', 1, 4], ['crate', 2, 5], ['oak', 1, 6]]);
    expect([...map.props[1]!.matrices.slice(12, 13), ...map.props[1]!.matrices.slice(28, 29)]).toEqual([1, 3]);
    expect(base.props).toHaveLength(1);                                 // the base is not touched
  });

  it('brings another archive\'s textures under its own name: two archives\' crate.tif never collide', () => {
    const { map } = composeMatchMap(base, layout, libs, floorGround(100));
    expect(map.props[2]!.parts[0]!.textureName).toBe('M51/crate.tif');
    expect(map.textures['M51/crate.tif']).toBe(camp.textures['crate.tif']);
    expect(map.textures['crate.tif']).toBe(base.textures['crate.tif']);
    expect(map.textureFlags['M51/crate.tif']).toEqual({ opaque: true });
    expect(map.props[1]!.parts[0]!.textureName).toBe('crate.tif');     // the base's own as they are
  });

  it('plays on the composed hull, from the markers\' slots; a side with none starts at the other\'s', () => {
    const g = floorGround(100);
    const { map } = composeMatchMap(base, layout, libs, g);
    expect(map.ground).toBe(g);
    expect(map.slots.map((s) => [s.side, s.index, s.position])).toEqual([[0, 0, [1, 2, 3]], [0, 1, [4, 5, 6]], [1, 0, [1, 2, 3]], [1, 1, [4, 5, 6]]]);
    expect(map.respawns).toBe(map.slots);
    expect(composeMatchMap(base, { ...layout, spawns: [] }, libs, g).map.slots).toBe(base.slots);
  });
});

describe('FORGE: a marker\'s facing as the disc\'s', () => {
  it('turns the yaw into eighth-turn steps, step k facing (sin 45k, -cos 45k)', () => {
    expect(stepOfYaw(0)).toBe(0);
    expect(stepOfYaw(-Math.PI / 2)).toBe(2);
    expect(stepOfYaw(Math.PI / 2)).toBe(6);
    expect(stepOfYaw(Math.PI)).toBe(4);
    const [s] = slotsOfSpawns([{ team: 'B', p: [0, 0, 0], yaw: -Math.PI / 2 }]);
    expect(s!.side).toBe(1);
    expect(s!.facing[0]).toBeCloseTo(1);
    expect(s!.facing[1]).toBeCloseTo(0);
  });
});

describe('FORGE: the blank floor in the match', () => {
  it('is one drawn square at y = 0 the size of the hull\'s floor, two triangles, untextured, lit by its grey', () => {
    const m = floorMesh(1000);
    expect(m.positions.length).toBe(12);
    expect(Math.max(...m.positions)).toBe(500);
    expect(Math.min(...m.positions)).toBe(-500);
    expect([m.positions[1], m.positions[4], m.positions[7], m.positions[10]]).toEqual([0, 0, 0, 0]);
    expect([...m.indices]).toHaveLength(6);
    expect(m.textureName).toBeNull();
    expect(m.colors.length).toBe(16);
  });
});

describe('FG-31: the base\'s doors after a hidden placement', () => {
  /** Three props a path each, one owner each in the walk's order; the barrel (the second owner) hidden; a piece after them. */
  const grid = { atomCount: 8192, posts: 16, cellDim: 640, cellsX: 4, cellsZ: 4, originX: -1280, originZ: -1280 };
  const sq = (x: number, z: number, y: number) => new Float32Array([x - 10, y, z - 10, x + 10, y, z - 10, x + 10, y, z + 10, x - 10, y, z + 10]);
  const poly = (modelName: string, path: string, points: Float32Array) =>
    ({ modelName, path, region: 0, ditype: 3, material: 0, ptcount: 4, cameratype: 0, points });
  const T = (x: number, z: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1];
  const names = ['crate', 'barrel', 'gate'] as const;
  const xs = [100, -300, 500];
  const three = {
    ...base,
    props: names.map((n, i) => ({ ...prop(n, `${n}.tif`, i), matrices: new Float32Array(T(xs[i]!, 0)), paths: [`worldmodel/${n}=${n}`] })),
    ground: packGround(grid, names.map((n, i) => poly(n, `worldmodel/${n}=${n}`, sq(xs[i]!, 0, 10))),
      names.map((n, i) => ({ modelName: n, path: `worldmodel/${n}=${n}`, first: i, count: 1 }))),
    doors: [{ index: 0, owners: [2] }, { index: 1, owners: [1] }, { index: 2, owners: [0, 1, 2] }],
  } as unknown as LoadedMap;

  it('a door names its owners\' new places on the composed hull; an owner hidden leaves its door\'s list', () => {
    const hidden = placementsOf(three, [placementKey('barrel', -300, 0, 0)]);
    const ground = layoutGround(groundWithout(three, three.ground!, hidden),
      [{ owner: 'forge/piece_0', polys: [poly('crate', 'x', sq(0, 0, 10))], m: T(800, 800) }]);
    expect(ground.owners.map((o) => o.path)).toEqual(['worldmodel/crate=crate', 'worldmodel/gate=gate', 'forge/piece_0']);
    const { map } = composeMatchMap(three, { ...layout, pieces: [], spawns: [] }, libs, ground);
    expect(map.doors!.map((d) => [d.index, d.owners])).toEqual([[0, [1]], [1, []], [2, [0, 1]]]);
    expect(three.doors!.map((d) => d.owners)).toEqual([[2], [1], [0, 1, 2]]);          // the base's are not touched
    // Nothing hidden: the doors' owners as they were.
    const whole = composeMatchMap(three, { ...layout, pieces: [], spawns: [] }, libs, layoutGround(three.ground!, [])).map;
    expect(whole.doors!.map((d) => d.owners)).toEqual([[2], [1], [0, 1, 2]]);
  });
});

describe('S3b item 5: a drawn pack piece takes the hull\'s placement rule (contentPieceHull, pieceYaw)', () => {
  const SOLID = readAssetDefinition(solidJson(), REF) as AssetDefinition;
  const resolve = (ref: ContentRef): AssetDefinition | null => (ref.assetId === 'crate' ? SOLID : null);
  const packPiece = (assetId: string, m: number[]) => {
    const content: ContentRef = { ...REF, assetId };
    return { asset: contentAssetKey(content), m, content };
  };
  const tilted = [1, 0, 0, 0, 0, Math.cos(0.3), Math.sin(0.3), 0, 0, -Math.sin(0.3), Math.cos(0.3), 0, 5, 0, 5, 1];
  const scaled = [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 9, 0, 9, 1];
  const packed: Layout = {
    forge: 1, base: { kind: 'map', archive: 'MP2' },
    pieces: [packPiece('crate', propMatrix([1, 0, 1], 0.5)), packPiece('crate', tilted), packPiece('crate', scaled), packPiece('barrel', propMatrix([0, 0, 0], 0))],
    spawns: [],
  };

  it('a tilted or scaled piece is neither drawn nor solid: refused into misses as placement, as layoutGround refuses it', () => {
    const { content, missing, misses } = composeMatchMap(base, packed, libs, floorGround(100), 'seal', resolve);
    expect(content.map((c) => c.index)).toEqual([0]);
    expect(missing).toBe(3);
    expect(misses.map((m) => [m.owner, m.reason])).toEqual([['forge/piece_1', 'placement'], ['forge/piece_2', 'placement'], ['forge/piece_3', 'unresolved']]);
    const pageMisses: ContentMiss[] = [];
    const ground = layoutGround(floorGround(100), packed.pieces.map((p, i) => ({ owner: `forge/piece_${i}`, content: p.content!, m: p.m })), resolve, pageMisses);
    expect(pageMisses).toEqual(misses);
    expect(ground.owners.map((o) => o.path)).toEqual(['forge_floor', 'forge/piece_0']);
  });

  it('with no resolver every pack piece is missing and unresolved; a disc layout gives no misses', () => {
    const none = composeMatchMap(base, packed, libs, floorGround(100));
    expect([none.content, none.missing, none.misses.map((m) => m.reason)]).toEqual([[], 4, ['unresolved', 'unresolved', 'unresolved', 'unresolved']]);
    expect(composeMatchMap(base, layout, libs, floorGround(100)).misses).toEqual([]);
  });
});
