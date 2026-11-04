import { describe, expect, it } from 'vitest';
import { contentAssetKey, type ContentRef } from '@s2u/creator-contracts';
import { isWallSurface, probeGround, segmentHit } from '@s2u/scene';
import { groundGrid, groundPolygons, Walker } from '../../src/mover';
import type { LoadedMap } from '../../src/loadMap';
import type { Layout } from '../../src/forge/layout';
import { floorGround, layoutGround, type ContentMiss } from '../../src/forge/ground';
import { composeMatchMap } from '../../src/forge/matchMap';
import { readAssetDefinition, type AssetDefinition } from '../../src/packs/content/assets';
import {
  CONTENT_GROUND_DITYPE_ADAPTATION, CONTENT_METRES_PER_UNIT_ADAPTATION, CONTENT_WALL_DITYPE_ADAPTATION, contentPieceHull, pieceYaw, propHull, propMatrix, propPolys,
} from '../../src/packs/content/collision';
import { REF, solidJson, visualJson } from './contentFixtures';

/**
 * FCW-09 (product track; a browser adaptation with no original): a creator pack's solid prop in the forge's ground. The
 * provider turns an `AssetDefinition`'s baked hull into the `PieceHull` `layoutGround` already composes -- no second
 * compositor -- placed by translation and a turn about +Y only, metres into game units at the engine's default scale.
 * A retail piece's path through `layoutGround` is untouched (its own tests, `test/forge/ground.test.ts`).
 */

const def = (json: Record<string, unknown>, ref: ContentRef = REF): AssetDefinition => {
  const r = readAssetDefinition(json, ref);
  if (Array.isArray(r)) throw new Error(r.map((d) => d.code).join(', '));
  return r;
};
const SOLID = def(solidJson());
const VISUAL = def(visualJson(), { ...REF, assetId: 'crate' });
const resolve = (ref: ContentRef): AssetDefinition | null => (ref.assetId === 'crate' ? SOLID : null);
const near = (a: ArrayLike<number>, b: readonly number[]): void => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < b.length; i++) expect(a[i]!).toBeCloseTo(b[i]!, 4);
};

describe('FCW-09: the content collision provider', () => {
  it('converts metres at the engine\'s default 0.1 m a unit (scene worldRoot DEFAULT_METERS_PER_UNIT)', () => {
    expect(CONTENT_METRES_PER_UNIT_ADAPTATION).toBe(0.1);
    expect(CONTENT_GROUND_DITYPE_ADAPTATION).toBe(3);
    expect(CONTENT_WALL_DITYPE_ADAPTATION).toBe(2);
  });

  it('a visual-only prop has no solidity: no hull, no polygons, the ground unchanged', () => {
    expect(propHull(VISUAL, [0, 0, 0], 0)).toBeNull();
    expect(propPolys(VISUAL, [0, 0, 0], 0)).toEqual([]);
    const base = floorGround(2000);
    const g = layoutGround(base, [{ owner: 'forge/piece_0', content: REF, m: propMatrix([0, 0, 0], 0) }], () => VISUAL);
    expect(groundPolygons(g)).toHaveLength(groundPolygons(base).length);
    expect(g.owners.map((o) => o.path)).toEqual(['forge_floor']);
  });

  it('the box placed at (100, 5, -40) turned a quarter about +Y gives the hand-computed six polygons', () => {
    // Units: the 2 x 1.5 x 1 m box is x -10..10, y 0..15, z -5..5. A quarter turn (three's makeRotationY) takes
    // (x, z) to (z, -x): x -5..5, z -10..10; then the shift: x 95..105, y 5..20, z -50..-30.
    const polys = propPolys(SOLID, [100, 5, -40], Math.PI / 2);
    expect(polys).toHaveLength(6);
    expect(polys.map((p) => p.ptcount)).toEqual([4, 4, 4, 4, 4, 4]);
    expect(polys.every((p) => p.path === 'forge/content' && p.modelName === contentAssetKey(REF) && p.material === 0 && p.cameratype === 0)).toBe(true);
    // bottom (outward down): not ground, not a wall
    near(polys[0]!.points, [95, 5, -30, 95, 5, -50, 105, 5, -50, 105, 5, -30]);
    expect(polys[0]!.ditype).toBe(2);
    expect(isWallSurface(polys[0]!)).toBe(false);
    // top (outward up): ground
    near(polys[1]!.points, [95, 20, -30, 105, 20, -30, 105, 20, -50, 95, 20, -50]);
    expect(polys[1]!.ditype).toBe(3);
    // the four sides: walls
    for (const side of polys.slice(2)) {
      expect(side.ditype).toBe(2);
      expect(isWallSurface(side)).toBe(true);
    }
    // the +Z marker face (v3 v2 v6 v7) faces +X after the quarter turn, at x = 105
    near(polys[2]!.points, [105, 5, -30, 105, 5, -50, 105, 20, -50, 105, 20, -30]);
  });

  it('propHull is the PieceHull layoutGround composes: the same polygons, one owner the piece, upright (no frame)', () => {
    const hull = propHull(SOLID, [100, 5, -40], Math.PI / 2, 'forge/piece_3')!;
    expect(hull.owner).toBe('forge/piece_3');
    expect(hull.m).toEqual(propMatrix([100, 5, -40], Math.PI / 2));
    const g = layoutGround(floorGround(2000), [hull]);
    const placed = groundPolygons(g).slice(1);
    const direct = propPolys(SOLID, [100, 5, -40], Math.PI / 2, 'forge/piece_3');
    expect(placed.map((p) => [p.ditype, p.ptcount, Array.from(p.points)])).toEqual(direct.map((p) => [p.ditype, p.ptcount, Array.from(p.points)]));
    expect(g.owners.at(-1)).toMatchObject({ path: 'forge/piece_3', first: 1, count: 6 });
    expect(g.owners.at(-1)!.frame).toBeUndefined();
  });

  it('layoutGround takes a content piece through the injected resolver, the same as its PieceHull', () => {
    const m = propMatrix([10, 0, 20], 0.3);
    const viaContent = layoutGround(floorGround(2000), [{ owner: 'forge/piece_0', content: REF, m }], resolve);
    const viaHull = layoutGround(floorGround(2000), [propHull(SOLID, [10, 0, 20], 0.3, 'forge/piece_0')!]);
    expect(Array.from(viaContent.points)).toEqual(Array.from(viaHull.points));
    expect(Array.from(viaContent.fields)).toEqual(Array.from(viaHull.fields));
    expect(viaContent.owners).toEqual(viaHull.owners);
  });

  it('an unresolved reference gives no hull and is reported; so is a placement that is not a turn about +Y', () => {
    const missing: ContentMiss[] = [];
    const other: ContentRef = { ...REF, assetId: 'barrel' };
    const tilted = propMatrix([0, 0, 0], 0); tilted[6] = 0.5; tilted[9] = -0.5;
    const scaled = propMatrix([0, 0, 0], 0); scaled[0] = 2; scaled[10] = 2;
    const base = floorGround(2000);
    const g = layoutGround(base, [
      { owner: 'forge/piece_0', content: other, m: propMatrix([0, 0, 0], 0) },
      { owner: 'forge/piece_1', content: REF, m: tilted },
      { owner: 'forge/piece_2', content: REF, m: scaled },
    ], resolve, missing);
    expect(groundPolygons(g)).toHaveLength(groundPolygons(base).length);
    expect(missing).toEqual([
      { owner: 'forge/piece_0', content: other, reason: 'unresolved' },
      { owner: 'forge/piece_1', content: REF, reason: 'placement' },
      { owner: 'forge/piece_2', content: REF, reason: 'placement' },
    ]);
    // No resolver at all: every content piece is unresolved.
    expect(contentPieceHull({ owner: 'p', content: REF, m: propMatrix([0, 0, 0], 0) }, null)).toEqual({ missing: 'unresolved' });
  });

  it('reads a yaw-only placement off a piece\'s matrix, three\'s compose included', () => {
    const r = pieceYaw(propMatrix([1, 2, 3], -2.5))!;
    expect(r.at).toEqual([1, 2, 3]);
    expect(r.yaw).toBeCloseTo(-2.5, 12);
    expect(pieceYaw([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, Number.NaN, 0, 0, 1])).toBeNull();
  });

  it('a mover probe: the walk stands on the box\'s top, is stopped by its side, and a shot meets it', () => {
    const g = layoutGround(floorGround(2000), [{ owner: 'forge/piece_0', content: REF, m: propMatrix([0, 0, 0], 0) }], resolve);
    const grid = groundGrid(g);
    const tops = probeGround(grid, 0, 0).map((h) => h.y).sort((a, b) => b - a);
    expect(tops[0]).toBeCloseTo(15);                                  // the box's top, 1.5 m
    expect(tops[1]).toBeCloseTo(0);                                   // the floor under it
    const blocked = new Walker(grid);
    expect(blocked.place(0, 0, 30)).toBe(true);
    for (let i = 0; i < 40; i++) blocked.glide(0, -1);
    expect(blocked.state.z).toBeGreaterThan(5);                       // held off the +z side (z = 5 units)
    const open = new Walker(groundGrid(floorGround(2000)));
    open.place(0, 0, 30);
    for (let i = 0; i < 40; i++) open.glide(0, -1);
    expect(open.state.z).toBeCloseTo(-10);                            // nothing there without the box
    const shot = segmentHit(grid, [0, 10, 40], [0, 10, -40]);
    expect(shot?.point[2]).toBeCloseTo(5);
  });
});

describe('FCW-09: the match\'s map takes the same resolver', () => {
  const base = { archive: 'MP2', path: 'RUN/MP2.ZDB', name: 'x', props: [], textures: {}, textureFlags: {}, slots: [] } as unknown as LoadedMap;
  const piece = (assetId: string, x: number) => {
    const content: ContentRef = { ...REF, assetId };
    return { asset: contentAssetKey(content), m: propMatrix([x, 0, 0], 0), content };
  };
  const layout: Layout = { forge: 1, base: { kind: 'map', archive: 'MP2' }, pieces: [piece('crate', 1), piece('barrel', 2)], spawns: [] };

  it('no resolver: every pack piece is counted missing, as before', () => {
    const { missing, content } = composeMatchMap(base, layout, new Map([['MP2', base]]), floorGround(100));
    expect(missing).toBe(2);
    expect(content).toEqual([]);
  });

  it('a resolver: a resolved piece is handed over for the page to draw (never a disc prop), an unresolved one counted', () => {
    const { map, missing, content } = composeMatchMap(base, layout, new Map([['MP2', base]]), floorGround(100), 'seal', resolve);
    expect(missing).toBe(1);
    expect(content).toEqual([{ index: 0, def: SOLID, m: layout.pieces[0]!.m }]);
    expect(map.props).toEqual([]);
  });
});
