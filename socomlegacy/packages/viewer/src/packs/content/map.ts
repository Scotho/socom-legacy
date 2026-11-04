import {
  CONTENT_MAP_CODES, contentAssetKey, contentBaseRef, contentMapMember, diagnostic, gameplayDigest, readContentMapDefinition,
  type ContentLayoutBase, type ContentMapDefinition, type ContentRef, type Diagnostic, type MapVec3,
} from '@s2u/creator-contracts';
import { collisionLines, DEFAULT_GRID_PARAMS, type AiMaps, type AiNamedPoint, type AiRow, type AiSubMap, type CollisionOwner, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import type { LoadedMap } from '../../loadMap';
import { groundGrid, groundPolygons, packGround, type GroundData } from '../../mover';
import { layoutGround } from '../../forge/ground';
import { slotsOfSpawns } from '../../forge/matchMap';
import { forgeBombActions } from '../../forge/objectives';
import type { MapAction } from '../../mapActions';
import type { MapMeta } from '../../mapMeta';
import { stemOf } from '../../simMap';
import { bareMeta } from '../../worldState';
import type { AssetDefinition } from './assets';
import {
  CONTENT_GROUND_DITYPE_ADAPTATION, CONTENT_MATERIAL_ADAPTATION, CONTENT_METRES_PER_UNIT_ADAPTATION, CONTENT_WALL_DITYPE_ADAPTATION, propMatrix,
  type ContentMiss, type ContentPiece, type ContentResolver,
} from './collision';

/**
 * FCW-10 (product track; a browser adaptation with no original): an authored map (`ContentMapDefinition`,
 * `@s2u/creator-contracts` `maps.ts`) loaded to the `LoadedMap` a retail load gives, beside the disc's own path
 * (`../../loadMap` `loadMap`, unchanged: `loadAnyMap` routes a content base here and a ZDB path there).
 *
 * One provider builds what plays, for the page (`loadContentMap`) and the room (`match/src/creator/contentMap.ts`
 * `compileContentSimMap`) alike, so the two hold the same hull, slots, objectives and grid by construction:
 * - the hull (`contentMapGround`): each region one owner `content/<id>`, its polygons in game units
 *   (`CONTENT_METRES_PER_UNIT_ADAPTATION`, FCW-09's scale), a walkable region's polygons ground and side
 *   (`CONTENT_GROUND_DITYPE_ADAPTATION`), a solid region's side only (`CONTENT_WALL_DITYPE_ADAPTATION`), FCW-09's material;
 *   then the map's props through FCW-09's provider (`../../forge/ground` `layoutGround` and `./collision`
 *   `contentPieceHull`), so there is no second collision compositor;
 * - the slots (`contentMapSlots`): the spawns as the forge's markers (`../../forge/matchMap` `slotsOfSpawns`);
 * - the objectives (`contentMapObjectives`): the game type, StartBomb and the sites as MPBOMB records
 *   (`../../forge/objectives` `forgeBombActions`), the fields the disc's readers set (`gameType`, `bombStart`,
 *   `meta.actions`);
 * - the navigation (`contentMapAi`): one `AiSubMap` in `parseAiMaps`'s shape.
 *
 * A load is all or nothing: every part is built into locals and the `LoadedMap` is made once, at the end, so a load that
 * is aborted, superseded or refused hands out nothing; `mapSwap` is the caller's side of that contract.
 */

/** Game units a metre (FCW-09's scale, inverted once so a whole metre is a whole number of units). */
const U = 1 / CONTENT_METRES_PER_UNIT_ADAPTATION;
const units = (p: MapVec3): [number, number, number] => [p[0] * U + 0, p[1] * U + 0, p[2] * U + 0];

/**
 * The colours the page's match draws an authored map's regions in when the pack's visual is not drawn (the page draws
 * the GLB, FUI-17): the forge floor's grey (`../../forge/matchMap.ts` `FLOOR_GREY`, 0.32) for a walkable region and a
 * lighter grey for a solid one. Adaptations, no original.
 */
export const CONTENT_WALKABLE_GREY_ADAPTATION = 0.32;
export const CONTENT_SOLID_GREY_ADAPTATION = 0.5;
/** An authored grid's `param` (the f32 at +0x58, not decoded: 0.5 on 76 of the 83 disc sub-maps, `@s2u/scene` `aimaps.ts`). */
export const CONTENT_NAV_PARAM_ADAPTATION = 0.5;
/** An authored named point's `kind` and `word` (not decoded on the disc, research 75 s5.1): 0. */
export const CONTENT_NAV_POINT_KIND_ADAPTATION = 0;
/** A cell word's bit 31, set on all 946,155 stored disc cells (`@s2u/scene` `aimaps.ts` `AiSubMap.cells`, research 75 s4). */
const CELL_STORED = 0x80000000;
/** The marker under a named point (bits 5-7: 2, `@s2u/scene` `aimaps.ts` `aiCellMarker`). */
const CELL_NAMED_POINT = 2;
/** The 1024ths of the grid's y range a cell's height is quantised to (bits 9-18, `aiCellY`, `FUN_00516940` D:L385086). */
const CELL_HEIGHT_STEPS = 1024;

/** The load's stages, in order, for the progress line (FUI-17 shows them). */
export type ContentLoadStage = 'validating' | 'dependencies' | 'collision' | 'navigation' | 'objectives' | 'ready';
export type OnContentStage = (stage: ContentLoadStage, done: number, total: number) => void;
/** The registry's answer for a prop's asset (FCW-06): its definition, or null when the pack or the asset is not here. */
export type ContentAssetResolver = (ref: ContentRef, signal: AbortSignal) => Promise<AssetDefinition | null> | AssetDefinition | null;

export interface LoadContentMapOptions {
  readonly signal?: AbortSignal;
  readonly resolveAsset?: ContentAssetResolver;
  readonly onStage?: OnContentStage;
  /** The gameplay digest the caller expects (a saved layout's pin): another refuses the load (`map.DIGEST_MISMATCH`). */
  readonly expectDigest?: string;
  /**
   * The disc map whose characters, kits, HUD and their textures the match takes (the base's `library`), as the blank
   * floor's match takes its library's; none of its world, hull, spawns or objectives. Absent: none.
   */
  readonly library?: LoadedMap;
}

/** What the page shows of an authored map beside the `LoadedMap`: its reference, its gameplay digest and its visual. */
export interface ContentMapInfo {
  readonly ref: ContentRef;
  readonly digest: string;
  readonly visual: { readonly member: string } | null;
}
export interface LoadedContentMap extends LoadedMap {
  readonly content: ContentMapInfo;
}

/** A load refused: every reason, each a `Diagnostic` (the Check lists them). Nothing was built. */
export class ContentMapLoadError extends Error {
  override readonly name = 'ContentMapLoadError';
  readonly diagnostics: readonly Diagnostic[];
  constructor(diagnostics: readonly Diagnostic[]) {
    super(diagnostics.map((d) => `${d.code}: ${d.text}`).join('; ') || 'the map did not load');
    this.diagnostics = diagnostics;
  }
}

const abortError = (): Error => new DOMException('the map load was cancelled', 'AbortError');
const checkpoint = async (signal: AbortSignal | undefined): Promise<void> => {
  if (signal?.aborted) throw abortError();
  await Promise.resolve();
  if (signal?.aborted) throw abortError();
};

/** The map's path as the page names it: not a disc path, never a retail stem (`stemOf` reads the pack, version and id). */
export const contentMapPath = (ref: ContentRef): string => `content/${ref.pack.id}@${ref.pack.version}#${ref.pack.hash.slice(0, 12)}:${ref.assetId}`;
/** The room's `SimMap.stem` and the page's `stemOf(path)` for an authored map. */
export const contentMapStem = (ref: ContentRef): string => stemOf(contentMapPath(ref));

/** The hull's grid: the engine's default cell (`DEFAULT_GRID_PARAMS`, 640 units) laid over the map's bounds. */
export function contentMapGridParams(def: ContentMapDefinition): GridParams {
  const cell = DEFAULT_GRID_PARAMS.cellDim;
  const [minX, , minZ] = units(def.bounds.min), [maxX, , maxZ] = units(def.bounds.max);
  const originX = Math.floor(minX / cell) * cell, originZ = Math.floor(minZ / cell) * cell;
  return {
    ...DEFAULT_GRID_PARAMS, originX, originZ,
    cellsX: Math.max(1, Math.ceil((maxX - originX) / cell)), cellsZ: Math.max(1, Math.ceil((maxZ - originZ) / cell)),
  };
}

/** The regions' polygons in game units, one owner a region (`content/<id>`), in the definition's order. */
export function contentMapRegionPolys(def: ContentMapDefinition): { polys: WorldPoly[]; owners: CollisionOwner[] } {
  const polys: WorldPoly[] = [];
  const owners: CollisionOwner[] = [];
  for (const g of def.regions) {
    const path = `content/${g.id}`;
    const ditype = g.role === 'walkable' ? CONTENT_GROUND_DITYPE_ADAPTATION : CONTENT_WALL_DITYPE_ADAPTATION;
    owners.push({ modelName: path, path, first: polys.length, count: g.polygons.length });
    for (const poly of g.polygons) {
      const points = new Float32Array(poly.length * 3);
      poly.forEach((p, k) => points.set(units(p), k * 3));
      polys.push({ modelName: path, path, region: 0, ditype, material: CONTENT_MATERIAL_ADAPTATION, ptcount: poly.length, cameratype: 0, points });
    }
  }
  return { polys, owners };
}

/** The map's props as the forge's pack pieces (`ContentPiece`), owner `content/prop_<i>`, placed by FCW-09's `propMatrix`. */
export function contentMapPieces(def: ContentMapDefinition): ContentPiece[] {
  return (def.props ?? []).map((p, i) => ({ owner: `content/prop_${i}`, content: p.content, m: propMatrix(units(p.at), p.yaw) }));
}

/**
 * The provider: the map's hull -- its regions, then its props through FCW-09's (`layoutGround`, `contentPieceHull`).
 * `missing` lists the props left out (unresolved): a caller refuses the map when it is not empty.
 */
export function contentMapGround(def: ContentMapDefinition, resolve: ContentResolver | null): { ground: GroundData; missing: ContentMiss[] } {
  const { polys, owners } = contentMapRegionPolys(def);
  const regions = packGround(contentMapGridParams(def), polys, owners);
  const missing: ContentMiss[] = [];
  const pieces = contentMapPieces(def);
  return { ground: pieces.length ? layoutGround(regions, pieces, resolve, missing) : regions, missing };
}

/** The spawns as the room's slots: the forge's markers (`slotsOfSpawns`), each probed on the map's own hull. */
export function contentMapSlots(def: ContentMapDefinition, ground: GroundData): SpawnSlot[] {
  return slotsOfSpawns(def.spawns.map((s) => ({ team: s.team, p: units(s.at), yaw: s.yaw })), groundGrid(ground), ground);
}

/** The objectives as the disc's readers set them: the game type, StartBomb, and the sites as MPBOMB records. */
export function contentMapObjectives(def: ContentMapDefinition): { gameType?: number; bombStart?: [number, number, number]; actions: MapAction[]; meta: MapMeta } {
  const o = def.objectives;
  const stem = contentMapStem(def.ref);
  if (!o) return { actions: [], meta: bareMeta(stem) };
  const sites = (o.bomb?.sites ?? []).map((s) => ({
    team: s.team, at: units(s.at), yaw: s.yaw, range: s.range * U, elevation: s.elevation === -1 ? -1 : s.elevation * U,
  }));
  const actions = forgeBombActions({ sites });
  return {
    gameType: o.gameType, ...(o.bomb?.start ? { bombStart: units(o.bomb.start) } : {}),
    actions, meta: { ...bareMeta(stem), actions },
  };
}

/** The navigation as one `AiSubMap` (`parseAiMaps`'s shape, research 75 s3-s5), or undefined when the map has none. */
export function contentMapAi(def: ContentMapDefinition): AiMaps | undefined {
  const n = def.navigation;
  if (!n) return undefined;
  const rows: AiRow[] = [];
  let first = 0;
  for (const [x0, x1] of n.rows) { rows.push({ x0, x1, first }); first += x1 - x0; }
  const range = n.yMax - n.min[1];
  const cells = new Uint32Array(first);
  for (let i = 0; i < first; i++) {
    const h = n.heights?.[i] ?? n.min[1];
    const q = range > 0 ? Math.min(CELL_HEIGHT_STEPS - 1, Math.max(0, Math.round(((h - n.min[1]) / range) * CELL_HEIGHT_STEPS))) : 0;
    cells[i] = (CELL_STORED | (q << 9)) >>> 0;
  }
  const points: AiNamedPoint[] = (n.points ?? []).map((p) => {
    const x = Math.floor((p.at[0] - n.min[0]) / n.cellSize), z = Math.floor((p.at[2] - n.min[2]) / n.cellSize);
    const i = rows[z]!.first + x - rows[z]!.x0;
    cells[i] = (cells[i]! | (CELL_NAMED_POINT << 5)) >>> 0;
    return { name: p.name, loc: { map: 0, x, z }, kind: CONTENT_NAV_POINT_KIND_ADAPTATION, word: CONTENT_NAV_POINT_KIND_ADAPTATION };
  });
  const size = n.cellSize * U;
  const sub: AiSubMap = {
    index: 0, name: 'content', id: -1, flags: 0,
    min: units(n.min), max: units([n.min[0] + n.cellsX * n.cellSize, n.yMax, n.min[2] + n.cellsZ * n.cellSize]),
    cellsX: n.cellsX, cellsZ: n.cellsZ, cellSize: [size, size], param: CONTENT_NAV_PARAM_ADAPTATION, stamp: 0,
    rows, cells, cellsB: new Uint32Array(first), points, markers: [], links: [], zones: [], spawns: [], lines: [],
  };
  return { version: 2, maps: [sub], links: { words: 0, records: 0 }, spawns: [] };
}

/** Everything the room plays of a map, from the one provider (the page's `loadContentMap` builds its `LoadedMap` of the same parts). */
export interface ContentWorld {
  readonly stem: string;
  readonly ground: GroundData;
  readonly slots: SpawnSlot[];
  readonly ai: AiMaps | undefined;
  readonly objectives: ReturnType<typeof contentMapObjectives>;
}

const unresolved = (def: ContentMapDefinition, missing: readonly ContentMiss[]): Diagnostic[] => missing.map((m) => diagnostic({
  source: 'pack', severity: 'error', code: CONTENT_MAP_CODES.dependencyUnavailable, field: `props[${m.owner.replace('content/prop_', '')}]`,
  actual: contentAssetKey(m.content), evidence: 'validation',
  text: m.reason === 'unresolved' ? `A prop of ${def.name} is not available on this device.` : `A prop of ${def.name} is not placed by a turn about +Y.`,
}));

/** The map's world, synchronously, through the provider: refused whole (`ContentMapLoadError`) when a prop is not available. */
export function compileContentWorld(def: ContentMapDefinition, resolve: ContentResolver | null): ContentWorld {
  const { ground, missing } = contentMapGround(def, resolve);
  if (missing.length) throw new ContentMapLoadError(unresolved(def, missing));
  return { stem: contentMapStem(def.ref), ground, slots: contentMapSlots(def, ground), ai: contentMapAi(def), objectives: contentMapObjectives(def) };
}

/** The region polygons as one untextured draw (the blank floor's, `../../forge/matchMap` `floorMesh`), a fan a polygon. */
function regionsMesh(def: ContentMapDefinition): LoadedMap['world'][number] {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  for (const g of def.regions) {
    const grey = g.role === 'walkable' ? CONTENT_WALKABLE_GREY_ADAPTATION : CONTENT_SOLID_GREY_ADAPTATION;
    for (const poly of g.polygons) {
      const base = positions.length / 3;
      for (const p of poly) { positions.push(...units(p)); colors.push(grey, grey, grey, 1); }
      for (let k = 1; k + 1 < poly.length; k++) indices.push(base, base + k + 1, base + k);
    }
  }
  return {
    positions: Float32Array.from(positions), uvs: new Float32Array((positions.length / 3) * 2), colors: Float32Array.from(colors),
    normals: null, faceNormals: null, indices: Uint32Array.from(indices),
    textureName: null, fog: true, lit: false, order: 0, orderEnd: 0, cull: false, alternate: false, scroll: null,
  } as unknown as LoadedMap['world'][number];
}

/** What a match takes of its library's disc map: the characters, kits, HUD and their textures -- none of its world. */
function libraryParts(library: LoadedMap | undefined): Partial<LoadedMap> {
  if (!library) return {};
  const { body, terrorist, types, characters, weapons, arsenal, reticle, bulletMark, hud, grenade, textures, textureMips, textureFlags, detail, shadowVector } = library;
  return { body, terrorist, types, characters, weapons, arsenal, reticle, bulletMark, hud, grenade, textures, textureMips, textureFlags, detail, shadowVector };
}

/**
 * Loads an authored map: re-reads the definition (`readContentMapDefinition`, so a hand-made object is checked as a
 * member is), resolves its props' assets, builds the hull, the slots, the grid and the objectives through the provider,
 * and resolves with the whole `LoadedMap` and its gameplay digest -- or rejects (`ContentMapLoadError`, or an
 * `AbortError` when `signal` aborts) having handed out nothing. Stages are reported in order through `onStage`.
 */
export async function loadContentMap(def: ContentMapDefinition, options: LoadContentMapOptions = {}): Promise<LoadedContentMap> {
  const { signal, onStage } = options;
  const started = Date.now();
  const stage = (s: ContentLoadStage, done = 0, total = 0): void => onStage?.(s, done, total);
  await checkpoint(signal);
  stage('validating');
  // S3c: a definition carries the reader's `ref`; its member never does, so it is re-read as the member it came from.
  const read = readContentMapDefinition(contentMapMember(def), def.ref);
  if (Array.isArray(read)) throw new ContentMapLoadError(read);
  const checked = read as ContentMapDefinition;
  const digest = await gameplayDigest(checked);
  if (options.expectDigest !== undefined && options.expectDigest !== digest) {
    throw new ContentMapLoadError([diagnostic({
      source: 'pack', severity: 'error', code: CONTENT_MAP_CODES.digestMismatch, field: 'ref', expected: options.expectDigest, actual: digest, evidence: 'validation',
      text: 'The map plays differently from the one this layout was made on.',
    })]);
  }
  await checkpoint(signal);

  const props = checked.props ?? [];
  stage('dependencies', 0, props.length);
  const resolved = new Map<string, AssetDefinition>();
  const local = new AbortController();
  const onAbort = (): void => local.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    for (const [i, p] of props.entries()) {
      const key = contentAssetKey(p.content);
      if (!resolved.has(key) && options.resolveAsset) {
        const got = await options.resolveAsset(p.content, local.signal);
        if (got) resolved.set(key, got);
      }
      await checkpoint(signal);
      stage('dependencies', i + 1, props.length);
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }

  stage('collision');
  const world = compileContentWorld(checked, (ref) => resolved.get(contentAssetKey(ref)) ?? null);
  await checkpoint(signal);
  stage('navigation');
  await checkpoint(signal);
  stage('objectives');
  await checkpoint(signal);

  const o = world.objectives;
  const map: LoadedContentMap = {
    ...libraryParts(options.library),
    archive: options.library?.archive ?? world.stem,
    camera: null,
    path: contentMapPath(checked.ref),
    name: checked.name,
    world: [regionsMesh(checked)],
    lines: null,
    props: [],
    textures: options.library?.textures ?? {},
    textureFlags: options.library?.textureFlags ?? {},
    detail: options.library?.detail ?? {},
    metersPerUnit: CONTENT_METRES_PER_UNIT_ADAPTATION,
    lightRig: null,
    origin: [0, 0, 0],
    grid: world.ground.grid,
    collision: collisionLines(groundPolygons(world.ground)),
    slots: world.slots,
    respawns: world.slots,
    ground: world.ground,
    actions: o.actions,
    meta: o.meta,
    ...(o.gameType !== undefined ? { gameType: o.gameType as LoadedMap['gameType'] } : {}),
    ...(o.bombStart ? { bombStart: o.bombStart } : {}),
    ...(world.ai ? { ai: world.ai } : {}),
    doors: [], gates: [], cranes: [], turrets: [], escortees: [], scenicViews: [], tac: null,
    diagnostics: [],
    loadMs: Date.now() - started,
    timings: { fetch: 0, decode: Date.now() - started, postedAt: 0 },
    content: { ref: checked.ref, digest, visual: checked.visual ?? null },
  };
  stage('ready');
  return map;
}

/**
 * A content base (`ContentLayoutBase`) loaded: its map member read through `readMap` by the structured reference only
 * (`contentBaseRef`: the pack and the map id, never a caller's path or URL), read (`readContentMapDefinition`) and
 * loaded. A member that is not there refuses the load (`map.MAP_UNAVAILABLE`).
 */
export async function loadContentBase(base: ContentLayoutBase, readMap: (ref: ContentRef, signal?: AbortSignal) => Promise<unknown>,
  options: LoadContentMapOptions = {}): Promise<LoadedContentMap> {
  const ref = contentBaseRef(base);
  await checkpoint(options.signal);
  const json = await readMap(ref, options.signal);
  await checkpoint(options.signal);
  if (json === null || json === undefined) {
    throw new ContentMapLoadError([diagnostic({
      source: 'pack', severity: 'error', code: CONTENT_MAP_CODES.mapUnavailable, field: 'base', actual: `${base.ref.id}@${base.ref.version}/${base.mapId}`,
      evidence: 'validation', text: 'The authored map is not on this device.',
    })]);
  }
  const read = readContentMapDefinition(json, ref);
  if (Array.isArray(read)) throw new ContentMapLoadError(read);
  return loadContentMap(read as ContentMapDefinition, options);
}

/**
 * The caller's side of the all-or-nothing load: the world in use (`current`) is replaced only by a load that succeeds
 * and is still the latest. `replace` aborts the load before it (its signal), and a superseded or cancelled load rejects
 * with an `AbortError` even when it ignores its signal; a refused one rejects with its error. Either way `current` is
 * what it was.
 */
export interface MapSwap {
  readonly current: LoadedMap | null;
  replace(load: (signal: AbortSignal) => Promise<LoadedMap>): Promise<LoadedMap>;
  cancel(): void;
}

export function mapSwap(initial: LoadedMap | null): MapSwap {
  let current = initial;
  let latest: AbortController | null = null;
  return {
    get current() { return current; },
    async replace(load) {
      latest?.abort();
      const mine = new AbortController();
      latest = mine;
      const map = await load(mine.signal);
      if (mine.signal.aborted || latest !== mine) throw abortError();
      current = map;
      latest = null;
      return map;
    },
    cancel() { latest?.abort(); latest = null; },
  };
}
