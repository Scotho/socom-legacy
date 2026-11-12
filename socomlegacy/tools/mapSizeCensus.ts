/**
 * A read-only census of the disc maps' sizes (product track; an instrument with no original): how large the game's own
 * maps are, measured the way a creator's content map is bounded (`@s2u/creator-contracts` `maps.ts`,
 * `readContentMapDefinition`), for the owner's question of where those bounds should sit. It reports what the disc holds
 * and changes nothing the game or the port does; nothing of the disc is written but counts, extents and map stems.
 *
 * Every map archive the Forge lists (`../packages/viewer/src/forge/catalog` `archivesOf`: the multiplayer `RUN/MP<N>.ZDB`
 * and the campaign's `RUN/M<NN>.ZDB`) is loaded as the page loads it (`../packages/viewer/src/loadMap` `loadMap`), and
 * measured off the `LoadedMap`:
 * - the collision hull as the walk uses it: `LoadedMap.ground` (`GroundData`, packed by `mover.ts` `packGround` from the
 *   world's and its placed props' polygons, `worldCollision` order; the match server's `simMapFromBytes` packs the same
 *   hull the same way), read back through `mover.ts` `groundPolygons` for each polygon's `ptcount`, with its owners
 *   (`CollisionOwner`, one per realised node carrying polygons: what a content map's `regions` are, one region one owner);
 * - its extent: the box of `GroundData.points`, in game units and in metres at `LoadedMap.metersPerUnit`, and the
 *   farthest coordinate from the origin on each axis (what `CONTENT_MAP_EXTENT_METRES_ADAPTATION` bounds: every bound
 *   coordinate within that many metres of 0, `readBounds`), and its widest side (what `CONTENT_MAP_SPAN_METRES_ADAPTATION`
 *   bounds, over the same declared bounds);
 * - the engine's collision grid, `LoadedMap.grid` (`grid_params`);
 * - the AI grid: `LoadedMap.ai` (`@s2u/scene` `parseAiMaps`, the server's `SimMap.ai`): its sub-maps, the stored cells
 *   counted as a content map's `navigation.rows` are (each row's `x1 - x0`), the cells on each axis and the cell size;
 * - for context, the drawn size: `LoadedMap.world` (placed in world space by the loader) and `LoadedMap.props` (a
 *   prototype's parts once, a column-major matrix per placement), and `LoadedMap.textures`.
 * Then, for each quantity, the minimum, median and maximum over the maps that loaded, and how many exceed the content
 * map's bound today.
 *
 * The disc and the flags are `./censusDisc`'s (`openDisc`, `parseCensusArgs`), the exit codes as `./forgePlacementCensus`'s. From `socomlegacy/`:
 *   SOCOM_DISC=<dir> npx tsx tools/mapSizeCensus.ts [--json <path>] [--maps MP2,M51]
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CONTENT_MAP_EXTENT_METRES_ADAPTATION, CONTENT_MAP_METRES_PER_UNIT_ADAPTATION, CONTENT_MAP_NAV_AXIS_MAX, CONTENT_MAP_NAV_CELLS_MAX_ADAPTATION,
  CONTENT_MAP_POLYGON_POINTS_MAX, CONTENT_MAP_POLYGONS_MAX_ADAPTATION, CONTENT_MAP_REGIONS_MAX_ADAPTATION, CONTENT_MAP_SPAN_METRES_ADAPTATION,
  CONTENT_MAP_POINTS_MAX_ADAPTATION, CONTENT_MAP_REGION_POLYGONS_MAX_ADAPTATION,
} from '@s2u/creator-contracts';
import { cleanError, openDisc, parseCensusArgs } from './censusDisc';

export type Vec3 = [number, number, number];
export interface Box { min: Vec3; max: Vec3 }

/** The box of the finite points among `points` (xyz, `stride` numbers apart); null with none. Pure. */
export function extentOf(points: ArrayLike<number>, stride = 3): Box | null {
  let box: Box | null = null;
  for (let i = 0; i + 2 < points.length; i += stride) {
    const x = points[i]!, y = points[i + 1]!, z = points[i + 2]!;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    box = growBox(box, x, y, z);
  }
  return box;
}

function growBox(box: Box | null, x: number, y: number, z: number): Box {
  if (!box) return { min: [x, y, z], max: [x, y, z] };
  if (x < box.min[0]) box.min[0] = x; if (x > box.max[0]) box.max[0] = x;
  if (y < box.min[1]) box.min[1] = y; if (y > box.max[1]) box.max[1] = y;
  if (z < box.min[2]) box.min[2] = z; if (z > box.max[2]) box.max[2] = z;
  return box;
}

/** The box holding both; either may be null. Pure. */
export function unionBox(a: Box | null, b: Box | null): Box | null {
  if (!a) return b ? { min: [...b.min], max: [...b.max] } : null;
  if (!b) return { min: [...a.min], max: [...a.max] };
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])],
  };
}

/** The box scaled by `s` (units to metres: `s` is the map's metres per unit, above 0). Pure. */
export function scaleBox(box: Box, s: number): Box {
  return { min: box.min.map((v) => v * s) as Vec3, max: box.max.map((v) => v * s) as Vec3 };
}

/** Per axis, the farthest the box reaches from the origin: max(|min|, |max|). Pure. */
export function farthestOf(box: Box): Vec3 {
  return [0, 1, 2].map((k) => Math.max(Math.abs(box.min[k]!), Math.abs(box.max[k]!))) as Vec3;
}

/** The box's side on each axis. Pure. */
export function spanOf(box: Box): Vec3 {
  return [0, 1, 2].map((k) => box.max[k]! - box.min[k]!) as Vec3;
}

/** The box of `box`'s eight corners carried by the column-major 4x4 at `m[at..at+15]` (a placement). Pure. */
export function transformBox(box: Box, m: ArrayLike<number>, at = 0): Box {
  let out: Box | null = null;
  for (let c = 0; c < 8; c++) {
    const x = c & 1 ? box.max[0] : box.min[0], y = c & 2 ? box.max[1] : box.min[1], z = c & 4 ? box.max[2] : box.min[2];
    out = growBox(out,
      m[at]! * x + m[at + 4]! * y + m[at + 8]! * z + m[at + 12]!,
      m[at + 1]! * x + m[at + 5]! * y + m[at + 9]! * z + m[at + 13]!,
      m[at + 2]! * x + m[at + 6]! * y + m[at + 10]! * z + m[at + 14]!);
  }
  return out!;
}

/** A hull as the census reads it: each polygon's point count, every point (xyz, polygon after polygon), the owners. */
export interface HullInput {
  ptcounts: ArrayLike<number>;
  points: ArrayLike<number>;
  owners: readonly { modelName: string; path: string; first: number; count: number }[];
}

export interface HullMeasure {
  /** Every polygon of the hull (the world's and its placed props', doors and gates in their opening state). */
  polygons: number;
  /** Every point of every polygon. */
  points: number;
  /** The owners listed, empty ones included. */
  ownersListed: number;
  /** The owners carrying at least one polygon: a content map's regions (one region, one collision owner). */
  regions: number;
  /** Polygons no owner covers. */
  unowned: number;
  /** The owner carrying the most polygons, by its path (its model name when it has none). */
  largestRegion: { polygons: number; name: string } | null;
  /** The most points of one polygon (`ptcount`). */
  maxPoints: number;
  /** The box of every point, game units. */
  extent: Box | null;
}

/** The hull's counts and extent. An owner covers polygons `[first, first + count)` within the hull. Pure. */
export function measureHull(hull: HullInput): HullMeasure {
  const polygons = hull.ptcounts.length;
  let points = 0, maxPoints = 0;
  for (let i = 0; i < polygons; i++) {
    const n = hull.ptcounts[i]!;
    points += n;
    if (n > maxPoints) maxPoints = n;
  }
  const covered = new Uint8Array(polygons);
  let regions = 0;
  let largestRegion: HullMeasure['largestRegion'] = null;
  for (const o of hull.owners) {
    const from = Math.max(0, o.first), to = Math.min(polygons, o.first + o.count);
    const n = Math.max(0, to - from);
    if (n === 0) continue;
    regions++;
    covered.fill(1, from, to);
    if (!largestRegion || n > largestRegion.polygons) largestRegion = { polygons: n, name: o.path || o.modelName };
  }
  let unowned = 0;
  for (let i = 0; i < polygons; i++) if (!covered[i]) unowned++;
  return { polygons, points, ownersListed: hull.owners.length, regions, unowned, largestRegion, maxPoints, extent: extentOf(hull.points) };
}

/** One AI sub-map as the census reads it (`@s2u/scene` `AiSubMap`'s fields). */
export interface NavSubMapInput {
  name: string;
  min: ArrayLike<number>;
  max: ArrayLike<number>;
  cellsX: number;
  cellsZ: number;
  /** Along x, along z. */
  cellSize: readonly [number, number];
  rows: readonly { x0: number; x1: number }[];
}

export interface NavMeasure {
  subMaps: number;
  /** Stored cells over every sub-map, each row's `x1 - x0` (a content map's `navigation.rows` count). */
  storedTotal: number;
  /** The most stored cells of one sub-map (a content map has one grid), and that sub-map's name. */
  storedLargest: number;
  largestName: string | null;
  cellsXMax: number;
  cellsZMax: number;
  /** The most cells on either axis of any sub-map (what `CONTENT_MAP_NAV_AXIS_MAX` bounds). */
  axisMax: number;
  /** The least and greatest cell side over every sub-map and both axes, game units; null with no sub-map. */
  cellSizeMin: number | null;
  cellSizeMax: number | null;
  /** The box every sub-map's grid covers: x and z from its min over its cells, y from its min to its max; game units. */
  box: Box | null;
}

/** The AI grid's counts and the box its grids cover. Pure. */
export function measureNav(ai: { maps: readonly NavSubMapInput[] } | null | undefined): NavMeasure {
  const out: NavMeasure = {
    subMaps: 0, storedTotal: 0, storedLargest: 0, largestName: null, cellsXMax: 0, cellsZMax: 0, axisMax: 0,
    cellSizeMin: null, cellSizeMax: null, box: null,
  };
  for (const sub of ai?.maps ?? []) {
    out.subMaps++;
    let stored = 0;
    for (const r of sub.rows) stored += Math.max(0, r.x1 - r.x0);
    out.storedTotal += stored;
    if (out.largestName === null || stored > out.storedLargest) { out.storedLargest = stored; out.largestName = sub.name; }
    out.cellsXMax = Math.max(out.cellsXMax, sub.cellsX);
    out.cellsZMax = Math.max(out.cellsZMax, sub.cellsZ);
    for (const s of sub.cellSize) {
      out.cellSizeMin = out.cellSizeMin === null ? s : Math.min(out.cellSizeMin, s);
      out.cellSizeMax = out.cellSizeMax === null ? s : Math.max(out.cellSizeMax, s);
    }
    const far = extentOf([
      sub.min[0]!, sub.min[1]!, sub.min[2]!,
      sub.min[0]! + sub.cellsX * sub.cellSize[0], sub.max[1]!, sub.min[2]! + sub.cellsZ * sub.cellSize[1],
    ]);
    out.box = unionBox(out.box, far);
  }
  out.axisMax = Math.max(out.cellsXMax, out.cellsZMax);
  return out;
}

/** A drawn mesh as the census reads it: its positions (xyz) and its index count (three a triangle). */
export interface MeshInput { positions: ArrayLike<number>; indices: { length: number } }

export interface DrawInput {
  /** `LoadedMap.world`: placed in world space by the loader. */
  world: readonly MeshInput[];
  /** `LoadedMap.props`: a prototype's parts in its own space once, a column-major 4x4 per placement. */
  props: readonly { parts: readonly MeshInput[]; matrices: ArrayLike<number> }[];
  textures: Readonly<Record<string, { width: number; height: number }>>;
}

export interface DrawMeasure {
  worldDraws: number;
  worldTriangles: number;
  worldVertices: number;
  /** Prop entries (one per prop model-node). */
  prototypes: number;
  placements: number;
  /** Each prototype's triangles once. */
  propTrianglesPrototype: number;
  /** Each prototype's triangles times its placements: what is drawn with every placement shown. */
  propTrianglesDrawn: number;
  textures: number;
  /** Width times height over every texture (the base level; no mips). */
  texturePixels: number;
  /** The world's points and every placement's prototype box carried by its matrix (an outer box), game units. */
  box: Box | null;
}

/** The drawn size, from counts the loaded map already holds. Pure. */
export function measureDraw(draw: DrawInput): DrawMeasure {
  let worldTriangles = 0, worldVertices = 0, box: Box | null = null;
  for (const m of draw.world) {
    worldTriangles += Math.floor(m.indices.length / 3);
    worldVertices += Math.floor(m.positions.length / 3);
    box = unionBox(box, extentOf(m.positions));
  }
  let placements = 0, propTrianglesPrototype = 0, propTrianglesDrawn = 0;
  for (const p of draw.props) {
    const n = Math.floor(p.matrices.length / 16);
    let tris = 0, own: Box | null = null;
    for (const part of p.parts) {
      tris += Math.floor(part.indices.length / 3);
      own = unionBox(own, extentOf(part.positions));
    }
    placements += n;
    propTrianglesPrototype += tris;
    propTrianglesDrawn += tris * n;
    if (own) for (let i = 0; i < n; i++) box = unionBox(box, transformBox(own, p.matrices, i * 16));
  }
  let textures = 0, texturePixels = 0;
  for (const t of Object.values(draw.textures)) { textures++; texturePixels += t.width * t.height; }
  return {
    worldDraws: draw.world.length, worldTriangles, worldVertices, prototypes: draw.props.length, placements,
    propTrianglesPrototype, propTrianglesDrawn, textures, texturePixels, box,
  };
}

/** A box in metres with its per-axis reach from the origin and its sides. */
export interface MetreBox { min: Vec3; max: Vec3; farthest: Vec3; farthestAny: number; span: Vec3 }

function metreBox(box: Box | null, metresPerUnit: number): MetreBox | null {
  if (!box) return null;
  const m = scaleBox(box, metresPerUnit), farthest = farthestOf(m);
  return { min: m.min, max: m.max, farthest, farthestAny: Math.max(...farthest), span: spanOf(m) };
}

/** What `measureMap` reads off a `LoadedMap`. */
export interface MapInput {
  metersPerUnit: number;
  grid: { cellDim: number; cellsX: number; cellsZ: number; originX: number; originZ: number } | null;
  /** Null when the map has no `ground` (its graph did not parse). */
  ground: HullInput | null;
  ai: { maps: readonly NavSubMapInput[] } | null;
  world: DrawInput['world'];
  props: DrawInput['props'];
  textures: DrawInput['textures'];
}

export interface MapSizeRow {
  map: string;
  campaign: boolean;
  status: 'ok' | 'failed';
  error?: string;
  metresPerUnit: number | null;
  /** The engine's collision grid (`grid_params`), and the side its cells cover in metres on each of x and z. */
  collisionGrid: { cellDim: number; cellsX: number; cellsZ: number; originX: number; originZ: number; spanXM: number; spanZM: number } | null;
  hull: HullMeasure | null;
  hullMetres: MetreBox | null;
  nav: NavMeasure | null;
  navMetres: MetreBox | null;
  draw: DrawMeasure | null;
  drawMetres: MetreBox | null;
}

/** One map's row from what its load holds. Pure. */
export function measureMap(map: string, campaign: boolean, input: MapInput): MapSizeRow {
  const mpu = input.metersPerUnit;
  const hull = input.ground ? measureHull(input.ground) : null;
  const nav = measureNav(input.ai);
  const draw = measureDraw(input);
  const g = input.grid;
  return {
    map, campaign, status: 'ok', metresPerUnit: mpu,
    collisionGrid: g ? { ...g, spanXM: g.cellDim * g.cellsX * mpu, spanZM: g.cellDim * g.cellsZ * mpu } : null,
    hull, hullMetres: metreBox(hull?.extent ?? null, mpu),
    nav: input.ai ? nav : null, navMetres: input.ai ? metreBox(nav.box, mpu) : null,
    draw, drawMetres: metreBox(draw.box, mpu),
  };
}

/** A map that did not load: carried, and left out of every statistic. Pure. */
export function failedSizeMap(map: string, campaign: boolean, error: string): MapSizeRow {
  return {
    map, campaign, status: 'failed', error, metresPerUnit: null, collisionGrid: null, hull: null, hullMetres: null,
    nav: null, navMetres: null, draw: null, drawMetres: null,
  };
}

/** A measured quantity, and the content map's bound on it today (null: none). A map is over when its value is above it. */
export interface SizeQuantity {
  key: string;
  label: string;
  unit: 'count' | 'm' | 'units';
  limit: number | null;
  limitName: string | null;
  value: (row: MapSizeRow) => number | null;
}

const EXTENT = CONTENT_MAP_EXTENT_METRES_ADAPTATION;

/** Every quantity the totals block reports, with the bound each is held against. */
export const SIZE_QUANTITIES: readonly SizeQuantity[] = [
  { key: 'collision.polygons', label: 'hull polygons', unit: 'count', limit: CONTENT_MAP_POLYGONS_MAX_ADAPTATION, limitName: 'CONTENT_MAP_POLYGONS_MAX_ADAPTATION', value: (r) => r.hull?.polygons ?? null },
  { key: 'collision.regions', label: 'hull owners (regions)', unit: 'count', limit: CONTENT_MAP_REGIONS_MAX_ADAPTATION, limitName: 'CONTENT_MAP_REGIONS_MAX_ADAPTATION', value: (r) => r.hull?.regions ?? null },
  { key: 'collision.points', label: 'hull points', unit: 'count', limit: CONTENT_MAP_POINTS_MAX_ADAPTATION, limitName: 'CONTENT_MAP_POINTS_MAX_ADAPTATION', value: (r) => r.hull?.points ?? null },
  { key: 'collision.largestRegion', label: 'largest owner polygons', unit: 'count', limit: CONTENT_MAP_REGION_POLYGONS_MAX_ADAPTATION, limitName: 'CONTENT_MAP_REGION_POLYGONS_MAX_ADAPTATION', value: (r) => r.hull?.largestRegion?.polygons ?? null },
  { key: 'collision.unowned', label: 'polygons with no owner', unit: 'count', limit: null, limitName: null, value: (r) => r.hull?.unowned ?? null },
  { key: 'collision.maxPoints', label: 'most points in a polygon', unit: 'count', limit: CONTENT_MAP_POLYGON_POINTS_MAX, limitName: 'CONTENT_MAP_POLYGON_POINTS_MAX', value: (r) => r.hull?.maxPoints ?? null },
  { key: 'extent.hullFarthestM', label: 'hull farthest from origin, any axis', unit: 'm', limit: EXTENT, limitName: 'CONTENT_MAP_EXTENT_METRES_ADAPTATION', value: (r) => r.hullMetres?.farthestAny ?? null },
  { key: 'extent.hullFarthestXM', label: 'hull farthest |x|', unit: 'm', limit: EXTENT, limitName: 'CONTENT_MAP_EXTENT_METRES_ADAPTATION', value: (r) => r.hullMetres?.farthest[0] ?? null },
  { key: 'extent.hullFarthestYM', label: 'hull farthest |y|', unit: 'm', limit: EXTENT, limitName: 'CONTENT_MAP_EXTENT_METRES_ADAPTATION', value: (r) => r.hullMetres?.farthest[1] ?? null },
  { key: 'extent.hullFarthestZM', label: 'hull farthest |z|', unit: 'm', limit: EXTENT, limitName: 'CONTENT_MAP_EXTENT_METRES_ADAPTATION', value: (r) => r.hullMetres?.farthest[2] ?? null },
  { key: 'extent.hullSpanM', label: 'hull widest side', unit: 'm', limit: CONTENT_MAP_SPAN_METRES_ADAPTATION, limitName: 'CONTENT_MAP_SPAN_METRES_ADAPTATION', value: (r) => (r.hullMetres ? Math.max(...r.hullMetres.span) : null) },
  { key: 'extent.metresPerUnit', label: 'metres per unit', unit: 'count', limit: null, limitName: null, value: (r) => r.metresPerUnit },
  { key: 'grid.spanM', label: 'collision grid widest side', unit: 'm', limit: null, limitName: null, value: (r) => (r.collisionGrid ? Math.max(r.collisionGrid.spanXM, r.collisionGrid.spanZM) : null) },
  { key: 'nav.subMaps', label: 'AI sub-maps', unit: 'count', limit: null, limitName: null, value: (r) => r.nav?.subMaps ?? null },
  { key: 'nav.storedTotal', label: 'AI stored cells, all sub-maps', unit: 'count', limit: null, limitName: null, value: (r) => r.nav?.storedTotal ?? null },
  { key: 'nav.storedLargest', label: 'AI stored cells, largest sub-map', unit: 'count', limit: CONTENT_MAP_NAV_CELLS_MAX_ADAPTATION, limitName: 'CONTENT_MAP_NAV_CELLS_MAX_ADAPTATION', value: (r) => r.nav?.storedLargest ?? null },
  { key: 'nav.axisMax', label: 'AI cells on one axis', unit: 'count', limit: CONTENT_MAP_NAV_AXIS_MAX, limitName: 'CONTENT_MAP_NAV_AXIS_MAX', value: (r) => r.nav?.axisMax ?? null },
  { key: 'nav.cellSizeMax', label: 'AI cell side, largest', unit: 'units', limit: null, limitName: null, value: (r) => r.nav?.cellSizeMax ?? null },
  { key: 'nav.farthestM', label: 'AI grids farthest from origin', unit: 'm', limit: EXTENT, limitName: 'CONTENT_MAP_EXTENT_METRES_ADAPTATION', value: (r) => r.navMetres?.farthestAny ?? null },
  { key: 'draw.worldTriangles', label: 'world triangles', unit: 'count', limit: null, limitName: null, value: (r) => r.draw?.worldTriangles ?? null },
  { key: 'draw.worldVertices', label: 'world vertices', unit: 'count', limit: null, limitName: null, value: (r) => r.draw?.worldVertices ?? null },
  { key: 'draw.prototypes', label: 'prop prototypes', unit: 'count', limit: null, limitName: null, value: (r) => r.draw?.prototypes ?? null },
  { key: 'draw.placements', label: 'prop placements', unit: 'count', limit: null, limitName: null, value: (r) => r.draw?.placements ?? null },
  { key: 'draw.propTrianglesDrawn', label: 'prop triangles drawn', unit: 'count', limit: null, limitName: null, value: (r) => r.draw?.propTrianglesDrawn ?? null },
  { key: 'draw.textures', label: 'textures decoded', unit: 'count', limit: null, limitName: null, value: (r) => r.draw?.textures ?? null },
  { key: 'draw.texturePixels', label: 'texture pixels', unit: 'count', limit: null, limitName: null, value: (r) => r.draw?.texturePixels ?? null },
  { key: 'draw.farthestM', label: 'drawn geometry farthest (sky included)', unit: 'm', limit: null, limitName: null, value: (r) => r.drawMetres?.farthestAny ?? null },
];

/** The middle value, or the mean of the two middle ones; null for none. Pure. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b), h = s.length >> 1;
  return s.length % 2 ? s[h]! : (s[h - 1]! + s[h]!) / 2;
}

export interface QuantitySummary {
  key: string;
  label: string;
  unit: SizeQuantity['unit'];
  limit: number | null;
  limitName: string | null;
  /** Maps that loaded and have the value. */
  n: number;
  min: number | null;
  median: number | null;
  max: number | null;
  maxMap: string | null;
  /** Maps above the limit (null with no limit), and which. */
  over: number | null;
  overMaps: string[];
}

export interface SizeTotals { maps: number; measured: number; failed: string[]; quantities: QuantitySummary[] }

/** For each quantity, min, median, max and its map, and the maps over its limit -- failed maps left out. Pure. */
export function summarise(rows: readonly MapSizeRow[], quantities: readonly SizeQuantity[] = SIZE_QUANTITIES): SizeTotals {
  const ok = rows.filter((r) => r.status === 'ok');
  return {
    maps: rows.length,
    measured: ok.length,
    failed: rows.filter((r) => r.status === 'failed').map((r) => r.map),
    quantities: quantities.map((q) => {
      const vals: { map: string; v: number }[] = [];
      for (const r of ok) {
        const v = q.value(r);
        if (v !== null && Number.isFinite(v)) vals.push({ map: r.map, v });
      }
      let maxAt: { map: string; v: number } | null = null;
      for (const e of vals) if (!maxAt || e.v > maxAt.v) maxAt = e;
      const overMaps = q.limit === null ? [] : vals.filter((e) => e.v > q.limit!).map((e) => e.map);
      return {
        key: q.key, label: q.label, unit: q.unit, limit: q.limit, limitName: q.limitName, n: vals.length,
        min: vals.length ? Math.min(...vals.map((e) => e.v)) : null,
        median: median(vals.map((e) => e.v)),
        max: maxAt?.v ?? null, maxMap: maxAt?.map ?? null,
        over: q.limit === null ? null : overMaps.length, overMaps,
      };
    }),
  };
}

export interface SizeReport {
  /** The content map's bounds today, by name, and its own metres per unit. */
  limits?: Record<string, number>;
  maps: MapSizeRow[];
  totals: SizeTotals;
}

/** The content map's bounds as the shared contracts declare them. */
export const CONTENT_MAP_LIMITS: Readonly<Record<string, number>> = {
  CONTENT_MAP_EXTENT_METRES_ADAPTATION, CONTENT_MAP_POLYGONS_MAX_ADAPTATION, CONTENT_MAP_REGIONS_MAX_ADAPTATION,
  CONTENT_MAP_POLYGON_POINTS_MAX, CONTENT_MAP_NAV_CELLS_MAX_ADAPTATION, CONTENT_MAP_NAV_AXIS_MAX, CONTENT_MAP_METRES_PER_UNIT_ADAPTATION,
  CONTENT_MAP_SPAN_METRES_ADAPTATION, CONTENT_MAP_POINTS_MAX_ADAPTATION, CONTENT_MAP_REGION_POLYGONS_MAX_ADAPTATION,
};

const fmt = (n: number | null | undefined, places = 0): string => {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  const f = 10 ** places;
  return String(Math.round(n * f) / f);
};

/** The text report: a line per map, then the totals block. Pure. */
export function renderSizeTable(report: SizeReport): string {
  const cols: [string, number, (r: MapSizeRow) => string][] = [
    ['map', 6, (r) => r.map],
    ['m/unit', 7, (r) => fmt(r.metresPerUnit, 4)],
    ['polys', 7, (r) => fmt(r.hull?.polygons)],
    ['owners', 7, (r) => fmt(r.hull?.regions)],
    ['bigOwn', 7, (r) => fmt(r.hull?.largestRegion?.polygons)],
    ['noOwn', 6, (r) => fmt(r.hull?.unowned)],
    ['maxPt', 6, (r) => fmt(r.hull?.maxPoints)],
    ['|x|m', 7, (r) => fmt(r.hullMetres?.farthest[0], 1)],
    ['|y|m', 7, (r) => fmt(r.hullMetres?.farthest[1], 1)],
    ['|z|m', 7, (r) => fmt(r.hullMetres?.farthest[2], 1)],
    ['wideM', 7, (r) => fmt(r.hullMetres ? Math.max(...r.hullMetres.span) : null, 1)],
    ['gridM', 7, (r) => fmt(r.collisionGrid ? Math.max(r.collisionGrid.spanXM, r.collisionGrid.spanZM) : null, 1)],
    ['subs', 5, (r) => fmt(r.nav?.subMaps)],
    ['cells', 8, (r) => fmt(r.nav?.storedTotal)],
    ['bigSub', 7, (r) => fmt(r.nav?.storedLargest)],
    ['axis', 5, (r) => fmt(r.nav?.axisMax)],
    ['cell', 6, (r) => (r.nav && r.nav.cellSizeMin !== null ? `${fmt(r.nav.cellSizeMin, 1)}${r.nav.cellSizeMax !== r.nav.cellSizeMin ? `-${fmt(r.nav.cellSizeMax, 1)}` : ''}` : '-')],
    ['navM', 7, (r) => fmt(r.navMetres?.farthestAny, 1)],
    ['worldTri', 9, (r) => fmt(r.draw?.worldTriangles)],
    ['places', 7, (r) => fmt(r.draw?.placements)],
    ['propTri', 9, (r) => fmt(r.draw?.propTrianglesDrawn)],
    ['tex', 5, (r) => fmt(r.draw?.textures)],
    ['texMpx', 7, (r) => fmt(r.draw ? r.draw.texturePixels / 1e6 : null, 2)],
    ['drawM', 7, (r) => fmt(r.drawMetres?.farthestAny, 1)],
  ];
  const out = [cols.map(([h, w], i) => (i === 0 ? h.padEnd(w) : h.padStart(w))).join(' ')];
  for (const r of report.maps) {
    if (r.status === 'failed') out.push(`${r.map.padEnd(6)} FAILED: ${r.error ?? ''}`);
    else out.push(cols.map(([, w, f], i) => (i === 0 ? f(r).padEnd(w) : f(r).padStart(w))).join(' '));
  }
  const t = report.totals;
  out.push('', `totals over ${t.measured} of ${t.maps} maps (failed, left out: ${t.failed.length ? t.failed.join(', ') : 'none'})`);
  out.push(['quantity'.padEnd(40), 'min'.padStart(10), 'median'.padStart(10), 'max'.padStart(10), 'at'.padEnd(6), 'limit'.padStart(8), ' refused today'].join(' '));
  for (const q of t.quantities) {
    const p = q.unit === 'm' ? 1 : q.key === 'extent.metresPerUnit' ? 4 : 0;
    const refused = q.limit === null ? '' : `${q.over} of ${q.n} maps would be refused as a content map today`;
    out.push([
      `${q.label}${q.unit === 'm' ? ' (m)' : q.unit === 'units' ? ' (units)' : ''}`.padEnd(40), fmt(q.min, p).padStart(10), fmt(q.median, p).padStart(10),
      fmt(q.max, p).padStart(10), (q.maxMap ?? '-').padEnd(6), fmt(q.limit, p).padStart(8), ` ${refused}`,
    ].join(' ').trimEnd());
  }
  return out.join('\n');
}

async function main(argv: readonly string[]): Promise<void> {
  let args: ReturnType<typeof parseCensusArgs>;
  try { args = parseCensusArgs(argv); } catch (e) {
    console.error(`mapSizeCensus: ${(e as Error).message}\nusage: npx tsx tools/mapSizeCensus.ts [--json <path>] [--maps MP2,M51]`);
    process.exitCode = 2;
    return;
  }
  const disc = await openDisc();
  if (!disc) {
    console.error('mapSizeCensus: no disc -- set SOCOM_DISC (the directory holding RUN/), SOCOM_PC_ROOT or SOCOM_ISO');
    process.exitCode = 2;
    return;
  }
  const { archivesOf } = await import('../packages/viewer/src/forge/catalog');
  const { loadMap } = await import('../packages/viewer/src/loadMap');
  const { groundPolygons } = await import('../packages/viewer/src/mover');
  let archives = archivesOf(await disc.source.list());
  const only = args.maps;
  if (only) archives = archives.filter((a) => only.includes(a.stem));
  const rows: MapSizeRow[] = [];
  for (const a of archives) {
    const t = Date.now();
    try {
      const map = await loadMap(disc.source, a.path);
      const ground = map.ground;
      const row = measureMap(a.stem, a.campaign, {
        metersPerUnit: map.metersPerUnit,
        grid: map.grid,
        ground: ground ? { ptcounts: groundPolygons(ground).map((p) => p.ptcount), points: ground.points, owners: ground.owners } : null,
        ai: map.ai ?? null,
        world: map.world,
        props: map.props,
        textures: map.textures,
      });
      rows.push(row);
      console.error(`${a.stem}: ${row.hull?.polygons ?? 'no'} hull polygons, ${row.nav?.storedTotal ?? 'no'} AI cells, ${Date.now() - t} ms`);
    } catch (e) {
      rows.push(failedSizeMap(a.stem, a.campaign, cleanError(e, disc.root)));
      console.error(`${a.stem}: FAILED after ${Date.now() - t} ms`);
    }
  }
  const report: SizeReport = { limits: { ...CONTENT_MAP_LIMITS }, maps: rows, totals: summarise(rows) };
  console.log(renderSizeTable(report));
  if (args.json) {
    writeFileSync(args.json, JSON.stringify(report, null, 2));
    console.log(`\nJSON written to ${args.json}`);
  } else console.log(`\n${JSON.stringify(report, null, 2)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // A map that fails to load is a finding (exit 0); only the census's own crash exits 1.
  main(process.argv.slice(2)).catch((e: unknown) => { console.error(e); process.exitCode = 1; });
}
