import { describe, expect, it } from 'vitest';
import {
  CONTENT_MAP_EXTENT_METRES_ADAPTATION, CONTENT_MAP_NAV_AXIS_MAX, CONTENT_MAP_NAV_CELLS_MAX_ADAPTATION, CONTENT_MAP_POLYGON_POINTS_MAX,
  CONTENT_MAP_POLYGONS_MAX_ADAPTATION, CONTENT_MAP_REGIONS_MAX_ADAPTATION, CONTENT_MAP_SPAN_METRES_ADAPTATION,
  CONTENT_MAP_POINTS_MAX_ADAPTATION, CONTENT_MAP_REGION_POLYGONS_MAX_ADAPTATION,
} from '@s2u/creator-contracts';
import {
  extentOf, failedSizeMap, farthestOf, measureDraw, measureHull, measureMap, measureNav, median, renderSizeTable, scaleBox,
  SIZE_QUANTITIES, summarise, transformBox, type MapInput, type MapSizeRow,
} from '../mapSizeCensus';

/**
 * The map size census's pure half on synthetic input -- no disc (a product-track instrument: it measures the disc's maps
 * for the owner's question of how large a creator's content map may be, and decides nothing the game does).
 */

/** Two triangles side by side on the ground, x 0..10, z 0..20, one owner. */
const twoTriangles = (): { ptcounts: number[]; points: number[]; owners: { modelName: string; path: string; first: number; count: number }[] } => ({
  ptcounts: [3, 3],
  points: [0, 0, 0, 10, 0, 0, 10, 0, 20, /* second */ 0, 0, 0, 10, 0, 20, 0, 5, 20],
  owners: [{ modelName: 'worldmodel', path: 'worldmodel', first: 0, count: 2 }],
});

const okRow = (map: string, polygons: number, farthest = 10): MapSizeRow => {
  const input: MapInput = {
    metersPerUnit: 0.1,
    grid: { cellDim: 640, cellsX: 8, cellsZ: 8, originX: 0, originZ: 0 },
    ground: {
      ptcounts: new Array<number>(polygons).fill(3),
      points: new Array<number>(polygons * 9).fill(0).map((_, i) => (i === 0 ? farthest * 10 : 0)),
      owners: [{ modelName: 'worldmodel', path: 'worldmodel', first: 0, count: polygons }],
    },
    ai: null, world: [], props: [], textures: {},
  };
  return measureMap(map, false, input);
};

describe('measureHull', () => {
  it('counts a two-triangle hull: polygons, regions, the largest region, the most points, and its extent', () => {
    const h = measureHull(twoTriangles());
    expect(h.polygons).toBe(2);
    expect(h.points).toBe(6);
    expect(h.regions).toBe(1);
    expect(h.ownersListed).toBe(1);
    expect(h.unowned).toBe(0);
    expect(h.largestRegion).toEqual({ polygons: 2, name: 'worldmodel' });
    expect(h.maxPoints).toBe(3);
    expect(h.extent).toEqual({ min: [0, 0, 0], max: [10, 5, 20] });
  });

  it('counts a polygon no owner covers as unowned, an empty owner as no region, and a quad as four points', () => {
    const t = twoTriangles();
    const h = measureHull({
      ptcounts: [3, 3, 4],
      points: [...t.points, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1],
      owners: [
        { modelName: 'worldmodel', path: 'worldmodel', first: 0, count: 1 },
        { modelName: 'crate', path: 'worldmodel/crate', first: 1, count: 1 },
        { modelName: 'empty', path: 'worldmodel/empty', first: 3, count: 0 },
      ],
    });
    expect(h.polygons).toBe(3);
    expect(h.ownersListed).toBe(3);
    expect(h.regions).toBe(2);
    expect(h.unowned).toBe(1);
    expect(h.maxPoints).toBe(4);
    expect(h.largestRegion).toEqual({ polygons: 1, name: 'worldmodel' });
  });

  it('gives no extent and no largest region for an empty hull', () => {
    const h = measureHull({ ptcounts: [], points: [], owners: [] });
    expect(h.polygons).toBe(0);
    expect(h.extent).toBeNull();
    expect(h.largestRegion).toBeNull();
  });
});

describe('extentOf, farthestOf and scaleBox', () => {
  it('takes the farthest coordinate from the origin on each axis of an off-centre box, whichever side it is on', () => {
    const box = extentOf([-50, 2, 100, 300, 10, 700, -5000, 4, 200]);
    expect(box).toEqual({ min: [-5000, 2, 100], max: [300, 10, 700] });
    expect(farthestOf(box!)).toEqual([5000, 10, 700]);
    const metres = scaleBox(box!, 0.1);
    expect(metres.min[0]).toBeCloseTo(-500);
    expect(metres.max[2]).toBeCloseTo(70);
    const far = farthestOf(metres);
    expect(far[0]).toBeCloseTo(500);
    expect(far[1]).toBeCloseTo(1);
    expect(far[2]).toBeCloseTo(70);
  });

  it('skips a point that is not finite, and is null with no finite point', () => {
    expect(extentOf([Number.NaN, 0, 0, 1, 2, 3])).toEqual({ min: [1, 2, 3], max: [1, 2, 3] });
    expect(extentOf([Number.NaN, 0, 0])).toBeNull();
    expect(extentOf([])).toBeNull();
  });

  it('carries a box through a column-major placement: a quarter turn about y and a shift', () => {
    // A quarter turn about y: x goes to -z, z goes to +x; then shifted by (100, 0, 0).
    const m = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 100, 0, 0, 1];
    const b = transformBox({ min: [0, 0, 0], max: [10, 2, 4] }, m);
    expect(b.min[0]).toBeCloseTo(100);
    expect(b.max[0]).toBeCloseTo(104);
    expect(b.min[2]).toBeCloseTo(-10);
    expect(b.max[2]).toBeCloseTo(0);
    expect(b.max[1]).toBeCloseTo(2);
  });
});

describe('measureNav', () => {
  it('counts the stored cells as the content map counts them (each row x1 - x0), the largest sub-map, and its box', () => {
    const nav = measureNav({
      maps: [
        { name: 'outside', min: [-100, 0, -200], max: [0, 50, 0], cellsX: 10, cellsZ: 4, cellSize: [8, 8], rows: [{ x0: 0, x1: 10 }, { x0: 2, x1: 5 }, { x0: 0, x1: 0 }, { x0: 1, x1: 2 }] },
        { name: 'tunnel', min: [0, -10, 0], max: [10, 0, 10], cellsX: 300, cellsZ: 2, cellSize: [4, 4], rows: [{ x0: 0, x1: 1 }, { x0: 0, x1: 1 }] },
      ],
    });
    expect(nav.subMaps).toBe(2);
    expect(nav.storedTotal).toBe(16);
    expect(nav.storedLargest).toBe(14);
    expect(nav.largestName).toBe('outside');
    expect(nav.axisMax).toBe(300);
    expect(nav.cellSizeMin).toBe(4);
    expect(nav.cellSizeMax).toBe(8);
    // outside: x -100..-20, z -200..-168; tunnel: x 0..1200, z 0..8; y -10..50.
    expect(nav.box).toEqual({ min: [-100, -10, -200], max: [1200, 50, 8] });
  });

  it('is empty without an AI map', () => {
    const nav = measureNav(null);
    expect(nav.subMaps).toBe(0);
    expect(nav.storedTotal).toBe(0);
    expect(nav.box).toBeNull();
  });
});

describe('measureDraw', () => {
  it('counts the world and the placed props, and boxes every placement', () => {
    const tri = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: { length: 3 } };
    const shift = (x: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1];
    const d = measureDraw({
      world: [{ positions: [-5, 0, 0, 5, 0, 0, 0, 3, 0, 0, 0, 1], indices: { length: 6 } }],
      props: [{ parts: [tri, tri], matrices: [...shift(100), ...shift(-200), ...shift(0)] }],
      textures: { a: { width: 64, height: 32 }, b: { width: 128, height: 128 } },
    });
    expect(d.worldDraws).toBe(1);
    expect(d.worldTriangles).toBe(2);
    expect(d.worldVertices).toBe(4);
    expect(d.prototypes).toBe(1);
    expect(d.placements).toBe(3);
    expect(d.propTrianglesDrawn).toBe(6);
    expect(d.textures).toBe(2);
    expect(d.texturePixels).toBe(64 * 32 + 128 * 128);
    expect(d.box).toEqual({ min: [-200, 0, 0], max: [101, 3, 1] });
  });
});

describe('median and summarise', () => {
  it('takes the middle value, or the mean of the two middle ones', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('counts the maps over each limit and names the map holding the maximum', () => {
    const rows = [okRow('MP1', 10), okRow('MP2', 25), okRow('MP3', 30)];
    const s = summarise(rows, [{ key: 'polys', label: 'polygons', unit: 'count', limit: 20, limitName: 'TEST', value: (r) => r.hull?.polygons ?? null }]);
    const q = s.quantities[0]!;
    expect(q.n).toBe(3);
    expect(q.min).toBe(10);
    expect(q.median).toBe(25);
    expect(q.max).toBe(30);
    expect(q.maxMap).toBe('MP3');
    expect(q.over).toBe(2);
    expect(q.overMaps).toEqual(['MP2', 'MP3']);
  });

  it('totals the hull points of each map, the quantity the content map points bound is held against', () => {
    const s = summarise([okRow('MP1', 2), okRow('MP2', 5)]);
    const q = s.quantities.find((x) => x.key === 'collision.points')!;
    expect(q.label).toBe('hull points');
    expect(q.max).toBe(15);
    expect(q.maxMap).toBe('MP2');
    expect(q.over).toBe(0);
  });

  it('carries a failed map as failed and leaves it out of the statistics', () => {
    const rows = [okRow('MP1', 10), failedSizeMap('M51', true, 'boom'), okRow('MP2', 40)];
    expect(rows[1]!.status).toBe('failed');
    expect(rows[1]!.error).toBe('boom');
    expect(rows[1]!.hull).toBeNull();
    const s = summarise(rows);
    expect(s.maps).toBe(3);
    expect(s.measured).toBe(2);
    expect(s.failed).toEqual(['M51']);
    const polys = s.quantities.find((q) => q.key === 'collision.polygons')!;
    expect(polys.n).toBe(2);
    expect(polys.median).toBe(25);
    expect(polys.maxMap).toBe('MP2');
    const table = renderSizeTable({ maps: rows, totals: s });
    expect(table).toContain('M51');
    expect(table).toContain('FAILED: boom');
  });

  it('reads the hull extent in metres at the map own metres per unit and counts a map past the extent bound', () => {
    const rows = [okRow('MP1', 1, 120), okRow('MP2', 1, 1050)];
    const s = summarise(rows);
    const far = s.quantities.find((q) => q.key === 'extent.hullFarthestM')!;
    expect(far.limit).toBe(CONTENT_MAP_EXTENT_METRES_ADAPTATION);
    expect(far.max).toBeCloseTo(1050);
    expect(far.over).toBe(1);
    expect(far.overMaps).toEqual(['MP2']);
    expect(renderSizeTable({ maps: rows, totals: s })).toContain('1 of 2 maps');
  });

  it('compares against the content map limits as the shared contracts declare them', () => {
    const limit = (key: string): number | null => SIZE_QUANTITIES.find((q) => q.key === key)!.limit;
    expect(limit('collision.polygons')).toBe(CONTENT_MAP_POLYGONS_MAX_ADAPTATION);
    expect(limit('collision.regions')).toBe(CONTENT_MAP_REGIONS_MAX_ADAPTATION);
    expect(limit('collision.maxPoints')).toBe(CONTENT_MAP_POLYGON_POINTS_MAX);
    expect(limit('nav.storedLargest')).toBe(CONTENT_MAP_NAV_CELLS_MAX_ADAPTATION);
    expect(limit('nav.axisMax')).toBe(CONTENT_MAP_NAV_AXIS_MAX);
    expect(limit('nav.farthestM')).toBe(CONTENT_MAP_EXTENT_METRES_ADAPTATION);
    expect(limit('extent.hullSpanM')).toBe(CONTENT_MAP_SPAN_METRES_ADAPTATION);
    expect(limit('collision.points')).toBe(CONTENT_MAP_POINTS_MAX_ADAPTATION);
    expect(limit('collision.largestRegion')).toBe(CONTENT_MAP_REGION_POLYGONS_MAX_ADAPTATION);
    expect(new Set(SIZE_QUANTITIES.map((q) => q.key)).size).toBe(SIZE_QUANTITIES.length);
  });
});
