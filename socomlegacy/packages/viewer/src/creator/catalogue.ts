import { Box3, Matrix4, Vector3 } from 'three';
import { isGroundSurface, isWallSurface, polygonNormal, probeGround, segmentHits, type Grid, type WorldPoly } from '@s2u/scene';
import type { LoadedMap } from '../loadMap';
import { palette, prototypeMap } from '../forge/library';
import { prototypePolygons } from '../forge/ground';
import { ForgeAgentError, validateForgeAgentArguments } from '../forge/agent/api';

/** Browser adaptation: observations only. No placement, collision or game rule is changed. */
type Point = readonly [number, number, number];
export interface AssetBounds { min: Point; max: Point }
export interface CreatorCatalogueState {
  /** Layout mutation revision; catalogue observations have their own monotonically advancing epoch. */
  revision(): number;
  /** Only decoded palettes actually held by this page; querying never loads an archive.
   * Publish changed decoded bytes as a new map object. A fresh array of the same maps is not a publication. */
  maps(): readonly LoadedMap[];
  grid(): Grid | null;
  obstacles(): readonly { ref: string; bounds: AssetBounds }[];
}
export interface CreatorAssetQuery { query?: string; archive?: string; role?: 'visual' | 'ground-surface' | 'wall-surface'; limit?: number }
/** Internal serialized-recipe comparison only; public placement checks retain full precision. */
export interface PlacementComparisonOptions {
  positionEncoding?: 'record-v2';
  /** Grid owner paths of earlier pieces independently rounded into the same saved record. */
  supportOwners?: readonly string[];
}
// Existing v2 lattice from forge/record.ts:tenth at d8ca8fe2a. Controller 09:08 permits this local binding until
// FCW-07a publishes RECORD_POSITION_DENOMINATOR; integration then imports that single source instead.
const RECORD_POSITION_DENOMINATOR = 10;
export interface CreatorAsset {
  ref: string; revision: number; asset: string; model: string;
  source: { archive: string; path: string }; bounds: AssetBounds | null;
  geometry: { parts: number; separability: 'whole-prototype-only' };
  collision: { state: 'available' | 'none' | 'unavailable' | 'invalid'; polygons: number; ground: number; walls: number; bounds: AssetBounds | null };
  roles: string[]; diagnostics: string[];
}
interface AssetData { row: CreatorAsset; polys: readonly WorldPoly[] | null; map: LoadedMap }
const refuse = (code: string): never => { throw new ForgeAgentError(code, code); };
const validateInput = (operation: string, args: unknown): void => {
  try { validateForgeAgentArguments(operation, args); } catch { refuse('INVALID_ARGUMENT'); }
};
const boxOf = (b: AssetBounds): Box3 => new Box3(new Vector3(...b.min), new Vector3(...b.max));
const boundsOf = (b: Box3): AssetBounds => ({ min: b.min.toArray() as Point, max: b.max.toArray() as Point });
const validPoints = (points: unknown): points is Float32Array => points instanceof Float32Array && points.length >= 9 && points.length % 3 === 0 && points.every(Number.isFinite);
/** Inspection-only numerical tolerance on a segment's unit parameter: face contact at either endpoint is not an
 * interior wall crossing. This does not change scene collision, movement or probes, and every hit is still examined. */
const CONTACT_PARAMETER_EPSILON = 1e-6;
function inspect(map: LoadedMap, model: string, asset: string, revision: number, index: number): AssetData {
  const parts = prototypeMap(map, model)?.props[0]?.parts.filter(p => !p.alternate) ?? [];
  const box = new Box3();
  const geometryValid = parts.length > 0 && parts.every(p => validPoints(p.positions));
  if (geometryValid) for (const part of parts) for (let i = 0; i < part.positions.length; i += 3)
    box.expandByPoint(new Vector3(part.positions[i]!, part.positions[i + 1]!, part.positions[i + 2]!));
  let polys: WorldPoly[] | null = null;
  let collisionState: CreatorAsset['collision']['state'] = map.ground ? 'none' : 'unavailable';
  try {
    polys = prototypePolygons(map, model);
    if (polys?.length) collisionState = polys.every(p => validPoints(p.points) && p.ptcount === p.points.length / 3 && Number.isInteger(p.ditype) && polygonNormal(p.points) !== null && (!p.frame || p.frame.every(Number.isFinite))) ? 'available' : 'invalid';
    else if (!map.props.find(p => p.modelName === model)?.paths?.length) collisionState = 'unavailable';
  } catch { collisionState = 'unavailable'; }
  if (collisionState !== 'available') polys = null;
  const hullBox = new Box3();
  for (const p of polys ?? []) for (let i = 0; i < p.points.length; i += 3)
    hullBox.expandByPoint(new Vector3(p.points[i]!, p.points[i + 1]!, p.points[i + 2]!));
  const ground = polys?.filter(isGroundSurface).length ?? 0, walls = polys?.filter(isWallSurface).length ?? 0;
  return { row: { ref: `asset:${revision}:${index}`, revision, asset, model,
    source: { archive: map.archive, path: map.path }, bounds: geometryValid ? boundsOf(box) : null,
    geometry: { parts: parts.length, separability: 'whole-prototype-only' },
    collision: { state: collisionState, polygons: polys?.length ?? 0, ground, walls, bounds: hullBox.isEmpty() ? null : boundsOf(hullBox) },
    roles: [...(geometryValid ? ['visual'] : []), ...(ground ? ['ground-surface'] : []), ...(walls ? ['wall-surface'] : [])],
    diagnostics: geometryValid ? [] : ['INVALID_GEOMETRY'] }, polys, map };
}

/** Catalogue-epoch-scoped refs must have been returned by a query; cursors also bind the normalized query. */
export function createCreatorCatalogue(state: CreatorCatalogueState) {
  let catalogueRevision = -1, layoutRevision: number | undefined;
  let publishedMaps: readonly LoadedMap[] | undefined;
  const issued = new Map<string, AssetData>();
  const contexts = new Map<string, string>();
  let nextContext = 0;
  const observationNow = () => {
    const currentLayoutRevision = state.revision(), maps = state.maps();
    // Compare publication identities, not array identity or a per-read deep geometry fingerprint.
    // Keep our own array: the host may publish by mutating its container in place.
    if (!publishedMaps || currentLayoutRevision !== layoutRevision || maps.length !== publishedMaps.length || maps.some((map, i) => map !== publishedMaps![i])) {
      catalogueRevision = publishedMaps ? catalogueRevision + 1 : currentLayoutRevision;
      layoutRevision = currentLayoutRevision;
      publishedMaps = [...maps];
      issued.clear(); contexts.clear();
    }
    return { revision: catalogueRevision, maps };
  };
  function queryCreatorAssets(query: CreatorAssetQuery, cursor?: string | null) {
    validateInput('assets.query', { ...query, ...(cursor ? { cursor } : {}) });
    const { revision, maps } = observationNow(), limit = query.limit ?? 25;
    const filter = JSON.stringify([query.archive ?? null, query.query ?? '', query.role ?? null, limit]);
    // Include actual loaded palette identity as well as revision: a late archive completion cannot reuse a cursor.
    const entries = maps.flatMap(map => palette(map).map(entry => ({ map, ...entry })));
    const context = JSON.stringify([filter, entries.map(e => [e.map.archive, e.asset])]);
    let contextId = [...contexts].find(([, value]) => value === context)?.[0];
    if (!contextId) {
      contextId = String(++nextContext);
      if (contexts.size >= 64) contexts.delete(contexts.keys().next().value!);
      contexts.set(contextId, context);
    }
    let offset = 0;
    if (cursor !== undefined && cursor !== null) {
      let parsed: { revision?: unknown; context?: unknown; offset?: unknown };
      try { parsed = JSON.parse(cursor); } catch { return refuse('INVALID_CURSOR'); }
      if (!parsed || parsed.revision !== revision) return refuse('STALE_REVISION');
      if (parsed.context !== contextId || !Number.isSafeInteger(parsed.offset) || Number(parsed.offset) < 0) return refuse('INVALID_CURSOR');
      offset = Number(parsed.offset);
    }
    const rows: { entry: (typeof entries)[number]; index: number; data: AssetData | null }[] = [];
    for (const [index, e] of entries.entries()) {
      if ((query.archive && e.map.archive !== query.archive) || !e.model.toLowerCase().includes((query.query ?? '').toLowerCase())) continue;
      // Name/source queries only decode bounds/hulls for this page. A role filter necessarily inspects its matches.
      const data = query.role ? inspect(e.map, e.model, e.asset, revision, index) : null;
      if (!query.role || data!.row.roles.includes(query.role)) rows.push({ entry: e, index, data });
    }
    if (offset > rows.length) return refuse('INVALID_CURSOR');
    const items: CreatorAsset[] = [];
    for (const candidate of rows.slice(offset, offset + limit)) {
      const e = candidate.entry;
      const data = candidate.data ?? inspect(e.map, e.model, e.asset, revision, candidate.index);
      if (new TextEncoder().encode(JSON.stringify([...items, data.row])).length > 40_000) {
        if (!items.length) return refuse('ITEM_TOO_LARGE');
        break;
      }
      items.push(structuredClone(data.row)); issued.set(data.row.ref, data);
    }
    const next = offset + items.length;
    const nextCursor = next < rows.length ? JSON.stringify({ revision, context: contextId, offset: next }) : null;
    return { revision, items, total: rows.length, nextCursor,
      diagnostics: query.archive && !maps.some(m => m.archive === query.archive) ? ['ARCHIVE_NOT_LOADED'] : [] };
  }
  function checkPlacement(ref: string, transform: { at: Point; yaw?: number }, comparison: PlacementComparisonOptions = {}) {
    validateInput('placement.check', { ref, ...transform });
    const recordPosition = comparison.positionEncoding === 'record-v2';
    if (recordPosition && transform.at.some(n => Math.round(n * RECORD_POSITION_DENOMINATOR) / RECORD_POSITION_DENOMINATOR + 0 !== n)) return refuse('INVALID_RECORD_POSITION');
    // Serialization adaptation only: one rounded translation loses at most half a v2 position step. An earlier
    // serialized support piece contributes another half-step; original source owners do not. Only vertical
    // support comparison uses this bound; wall crossings, horizontal probes and actor checks remain unchanged.
    const sourceTolerance = recordPosition ? 0.5 / RECORD_POSITION_DENOMINATOR : 1e-3;
    const serializedSupportTolerance = recordPosition ? 1 / RECORD_POSITION_DENOMINATOR : sourceTolerance;
    const supportOwners = new Set(comparison.supportOwners ?? []);
    const { revision } = observationNow();
    if (/^asset:\d+:/.test(ref) && Number(ref.split(':')[1]) !== revision) return refuse('STALE_REVISION');
    const data = issued.get(ref);
    if (!data) return refuse('INVALID_REFERENCE');
    if (!data.row.bounds) return refuse('INVALID_GEOMETRY');
    if (data.row.collision.state === 'invalid') return refuse('INVALID_COLLISION');
    const matrix = new Matrix4().makeRotationY(transform.yaw ?? 0).setPosition(...transform.at);
    const bounds = boxOf(data.row.bounds).applyMatrix4(matrix);
    const diagnostics: { code: string; evidence: string; message: string; ref?: string }[] = [];
    let omittedDiagnostics = 0;
    const add = (code: string, evidence: string, message: string, other?: string): void => {
      if (diagnostics.length < 31) diagnostics.push({ code, evidence, message, ...(other ? { ref: other.slice(0, 160) } : {}) });
      else omittedDiagnostics++;
    };
    if (data.row.collision.state !== 'available') add('NO_COLLISION', 'source-hull', `Collision ${data.row.collision.state}; visual geometry does not establish solidity.`);
    for (const obstacle of state.obstacles()) {
      const other = boxOf(obstacle.bounds);
      // Touching faces are not overlap. This is deliberately a broad phase, never collision proof.
      if (bounds.min.x < other.max.x && bounds.max.x > other.min.x && bounds.min.y < other.max.y && bounds.max.y > other.min.y && bounds.min.z < other.max.z && bounds.max.z > other.min.z)
        add('BOUNDS_OVERLAP', 'bounds-only', 'Conservative visual bounds overlap; this does not establish collision or traversability.', obstacle.ref);
    }
    const grid = state.grid();
    let probes = 0, obstructed = false, supported = false, limited = false;
    if (!grid) add('GROUND_UNAVAILABLE', 'source-hull', 'No current layout collision grid is available.');
    else if (data.polys) {
      const minY = boxOf(data.row.collision.bounds!).applyMatrix4(matrix).min.y;
      // Instrument limits and numerical tolerance only: no invented body size, movement or placement rule.
      support: for (const p of data.polys) for (let i = 0; i < p.points.length; i += 3) {
        const v = new Vector3(p.points[i]!, p.points[i + 1]!, p.points[i + 2]!).applyMatrix4(matrix);
        if (v.y > minY + 1e-3) continue;
        if (probes >= 128) { limited = true; break support; }
        probes++;
        if (probeGround(grid, v.x, v.z).some(h => Math.abs(h.y - minY) <= (recordPosition && supportOwners.has(h.owner.path) ? serializedSupportTolerance : sourceTolerance))) supported = true;
      }
      edges: for (const p of data.polys) {
        for (let i = 0; i < p.ptcount; i++) {
          if (probes >= 256) { limited = true; break edges; }
          const j = (i + 1) % p.ptcount;
          const a = new Vector3(p.points[i * 3]!, p.points[i * 3 + 1]!, p.points[i * 3 + 2]!).applyMatrix4(matrix).toArray() as Point;
          const b = new Vector3(p.points[j * 3]!, p.points[j * 3 + 1]!, p.points[j * 3 + 2]!).applyMatrix4(matrix).toArray() as Point;
          probes++;
          if (segmentHits(grid, a, b, isWallSurface).some(hit => hit.t > CONTACT_PARAMETER_EPSILON && hit.t < 1 - CONTACT_PARAMETER_EPSILON)) obstructed = true;
        }
      }
      if (!supported) add('UNSUPPORTED', 'hull-ground-probe', 'No sampled lowest hull vertex rests on current ground; wall mounts and incomplete hulls need inspection.');
      if (obstructed) add('OBSTRUCTED', 'hull-segment-probe', 'A proposed hull edge crosses an existing wall polygon.');
      if (limited) add('PROBE_LIMIT', 'partial-hull-probe', 'Hull sampling reached an instrument limit (128 support / 256 total probes); results are incomplete.');
    }
    diagnostics.push({ code: 'TRAVERSABILITY_UNVERIFIED', evidence: 'inspection-only', message: 'Bounds overlap and sampled hull probes cannot certify a traversable stack or player clearance; use normal collision play probes.' });
    return { revision, ref, asset: data.row.asset, bounds: boundsOf(bounds), boundsOverlapScope: 'authored-pieces-only', traversability: 'unverified' as const,
      supportComparison: { evidence: recordPosition ? 'record-v2-serialization-adaptation' : 'full-precision-hull-probe', sourceTolerance, serializedSupportTolerance }, probes, omittedDiagnostics, diagnostics };
  }
  return { queryCreatorAssets, checkPlacement };
}
