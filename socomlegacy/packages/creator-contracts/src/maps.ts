/**
 * FCW-10 (product track; a browser adaptation with no original): a complete authored map a creator pack supplies, as
 * the engine reads it -- the `ContentMapDefinition` a pack member `maps/<mapId>.json` holds -- beside the retail maps,
 * which are read off the player's own disc (`RUN/<STEM>.ZDB`) and never come here. Nothing in this module changes what
 * a retail map does.
 *
 * A definition is gameplay data only, in metres with +Y up, every transform baked (as an `AssetDefinition`, FCW-09):
 * - `regions`: the collision polygons, in named sets, each set walkable (a body stands on it and is stopped by its
 *   steep faces) or solid (it stops, it never stands a body) -- the `WorldPoly` sources a `GroundData` packs;
 * - `spawns`: the team start points, in the layout's `SpawnMarker` shape (team A or B, a point, a yaw about +Y);
 * - `objectives`: one of the original's five game types (`FORGE_GAME_TYPES`, `FUN_002c9540`) and the bomb in the forge's
 *   own `BombObjectives` shape (StartBomb and the MPBOMB sites, research 173 s2), which `applyForgeObjectives` and the
 *   room's `BombAuthority` read; never a sixth type;
 * - `navigation`: one AI grid in the shape `@s2u/scene` `parseAiMaps` gives a sub-map (research 75 sections 3-5: a
 *   min corner, square cells, rows of stored cells, a height per cell, named points), so the room's AI and the walk read
 *   the one structure the disc's maps give them;
 * - `props`: pack props placed on it (FCW-09's provider), each one's pack declared in `dependencies` -- bar a prop of the
 *   map's own pack, which names no pack (`{assetId}`) and has the map's reference attached by the reader (S3d). The own
 *   pack is the reader's `ref.pack` by id and version (any hash: its writer cannot know one); it is never a dependency,
 *   and a prop naming it in full is refused, while another version of the same pack id is an ordinary pack, placed by a
 *   full reference and declared like any other (LATER 459).
 *
 * The member names its map by `mapId` (and a `name`) only, never by a `ContentRef`: the pack's hash is a digest over the
 * member's own bytes (`packDigest`), so a writer cannot know it before writing them (S3c). The reader attaches the
 * caller's reference to the definition, as `readAssetDefinition` does for an asset (FCW-09).
 *
 * `gameplayDigest` hashes those members alone (a name, a region's label, a visual, the map's own reference and any pack's
 * hash never move it), through the contract's `canonicalJson` and `sha256Hex`: the page's load and the room's compile
 * carry the same digest for the same map, and a pack re-published with the same gameplay keeps it.
 */
import { canonicalJson, sha256Hex, type Sha256 } from "./digest.js";
import { CONTENT_ASSET_ID, checkContentRef, checkPackRef, missingPackRefs, packRefKey, samePackRef, sortPackRefs, type ContentRef } from "./content.js";
import { diagnostic, type Diagnostic } from "./diagnostics.js";
import type { PackRef } from "./packs.js";
import { FORGE_GAME_TYPES, LAYOUT_NAME_MAX, RECORD_CODES, RECORD_LIMITS, type ContentLayoutBase, type ForgeGameType } from "./layout.js";

export const CONTENT_MAP_SCHEMA = "s2u.creator/content-map" as const;
export const CONTENT_MAP_VERSION = 1 as const;

/** The pack member that holds a map's definition: derived from the structured reference only, never a caller's path. */
export const contentMapMemberPath = (mapId: string): string => `maps/${mapId}.json`;

/**
 * Metres a game unit for an authored map: the engine's default (`@s2u/scene` `worldRoot.ts` L163 `DEFAULT_METERS_PER_UNIT`,
 * research 36 section 2), the value FCW-09's pack props use (`viewer/src/packs/content/collision.ts`
 * `CONTENT_METRES_PER_UNIT_ADAPTATION`; `viewer/test/packs/contentMap.test.ts` holds the two equal). An adaptation.
 */
export const CONTENT_MAP_METRES_PER_UNIT_ADAPTATION = 0.1;
/**
 * How far from the origin, in metres, any point of a map may lie on each axis: half the forge's blank floor
 * (`match/src/forgeSimMap.ts` `FORGE_FLOOR_SIZE`, 8000 units, at 0.1 m a unit: 800 m square). A bound of this tool, not
 * a game value.
 */
export const CONTENT_MAP_EXTENT_METRES_ADAPTATION = 400;
/**
 * The most collision polygons a map's regions may carry: the forge's own polygon budget for a layout's pieces
 * (`match/src/forgeSimMap.ts` `FORGE_PIECE_POLYS_MAX`, 20,000; a disc map's hull is in the low tens of thousands). A bound.
 */
export const CONTENT_MAP_POLYGONS_MAX_ADAPTATION = 20_000;
/** The most regions (each one collision owner) a map may name. A bound of this tool, not a game value. */
export const CONTENT_MAP_REGIONS_MAX_ADAPTATION = 1024;
/**
 * The most points one polygon may have: a collision polygon's `m_ptcount` is eight bits of its surface word
 * (`@s2u/scene` `collision.ts` `surfaceWord`; reCOM `zIntersect/zintersect.h:21-28`), FCW-09's `ASSET_FACE_POINTS_MAX`.
 */
export const CONTENT_MAP_POLYGON_POINTS_MAX = 255;
/**
 * A side's start points: at least one, at most 24 -- the disc's `AIMAPS.MPS` spawn list holds 24 a side
 * (`viewer/src/loadMap.ts` `LoadedMap.slots`, research 75 section 5.5). The upper bound is that reference taken as this
 * tool's bound; the room's wrap above it (`room.ts` `pick`) is unchanged. An adaptation.
 */
export const CONTENT_MAP_SPAWNS_ADAPTATION = { min: 1, max: 24 } as const;
/** The most props a map may place: the layout record's piece bound (`RECORD_LIMITS.pieces`). */
export const CONTENT_MAP_PROPS_MAX_ADAPTATION = RECORD_LIMITS.pieces;
/** The most packs a map may depend on: the layout record's bound (`RECORD_LIMITS.requires`). */
export const CONTENT_MAP_DEPENDENCIES_MAX_ADAPTATION = RECORD_LIMITS.requires;
/**
 * The most stored cells the navigation grid may hold: a bound of this tool -- Desert Glory's nine sub-maps store 13,547
 * (`viewer/src/simMap.ts` `SimMap.ai`, research 237 s1), the 83 disc sub-maps 946,155 in all (`@s2u/scene` `aimaps.ts`).
 */
export const CONTENT_MAP_NAV_CELLS_MAX_ADAPTATION = 65_536;
/** A grid axis's most cells: a loc's x and z are 13 bits each (`@s2u/scene` `aimaps.ts` `decodeAiLoc`, research 75 s4). */
export const CONTENT_MAP_NAV_AXIS_MAX = 8192;
/** The most named points the grid may carry. A bound of this tool, not a game value. */
export const CONTENT_MAP_NAV_POINTS_MAX_ADAPTATION = 64;
/** A named point's longest name: a 32-byte field with its terminator (`@s2u/scene` `aimaps.ts` `NAME`, research 75 s5.1). */
export const CONTENT_MAP_POINT_NAME_MAX = 31;
/**
 * How far a polygon's point may sit off its plane, as a fraction of the polygon's size: a floating-point allowance for
 * an exporter's arithmetic (FCW-09's hull check takes 1e-9 of the hull's size; a JSON round trip of metres needs more).
 */
export const CONTENT_MAP_PLANAR_TOLERANCE_ADAPTATION = 1e-6;

/** The refusal codes, namespaced `map.`; the lobby's refusal joins the record's own online codes (`record.`). */
export const CONTENT_MAP_CODES = {
  invalid: "map.MAP_INVALID",
  refInvalid: "map.REF_INVALID",
  refMismatch: "map.REF_MISMATCH",
  /**
   * S3c: a member that carries a `ref` field (a writer from before S3c). The member names its map by `mapId`; its pack's
   * reference is the caller's, attached by the reader. Refused, never ignored, so an old writer fails loudly.
   */
  refInMember: "map.REF_IN_MEMBER",
  nameInvalid: "map.NAME_INVALID",
  units: "map.UNITS",
  up: "map.UP",
  boundsInvalid: "map.BOUNDS_INVALID",
  outOfBounds: "map.OUT_OF_BOUNDS",
  dependenciesMissing: "map.DEPENDENCIES_MISSING",
  dependencyInvalid: "map.DEPENDENCY_INVALID",
  dependencyUndeclared: "map.DEPENDENCY_UNDECLARED",
  dependencyUnavailable: "map.DEPENDENCY_UNAVAILABLE",
  /**
   * LATER 459: a dependency that is the map's own pack -- the reader's `ref.pack` id and version, whatever hash it names
   * (its writer cannot know its own pack's hash, S3c). The own pack is implied, never listed; another version of the
   * same pack id is an ordinary dependency.
   */
  dependencyOwnPack: "map.DEPENDENCY_OWN_PACK",
  regionsMissing: "map.REGIONS_MISSING",
  regionInvalid: "map.REGION_INVALID",
  polygonInvalid: "map.POLYGON_INVALID",
  tooLarge: "map.TOO_LARGE",
  spawnsMissing: "map.SPAWNS_MISSING",
  spawnInvalid: "map.SPAWN_INVALID",
  objectivesInvalid: "map.OBJECTIVES_INVALID",
  gameType: "map.GAME_TYPE",
  objectivesUnplayable: "map.OBJECTIVES_UNPLAYABLE",
  navigationInvalid: "map.NAVIGATION_INVALID",
  propInvalid: "map.PROP_INVALID",
  /**
   * S3d: a prop whose content names the map's own pack in full. A prop of the map's own pack names no pack (`{assetId}`):
   * the writer cannot know its own pack's hash before its bytes, so a full reference to it -- the reader's `ref.pack` id
   * and version, whatever hash -- is refused by name, never read. Another version of the same pack id is not the own pack
   * (LATER 459): its prop is a full reference, declared in `dependencies` (`map.DEPENDENCY_UNDECLARED` otherwise).
   */
  propOwnPackRef: "map.PROP_OWN_PACK_REF",
  visualInvalid: "map.VISUAL_INVALID",
  /** The loader's: the map member was not there, or the expected gameplay digest differs. */
  mapUnavailable: "map.MAP_UNAVAILABLE",
  digestMismatch: "map.DIGEST_MISMATCH",
  /**
   * The room's compile (`match/src/creator/contentMap.ts`): the base's declared library was not read, so the victory
   * data and default material it lends an authored map (as `simMapFromBytes` reads them off a disc map) are not there.
   */
  libraryUnavailable: "map.LIBRARY_UNAVAILABLE",
  /** H273/H274: an online lobby plays the disc's own maps (the record's own code, `layout.ts` `RECORD_CODES`). */
  onlineContentMap: RECORD_CODES.onlineContentMap,
} as const;
export type ContentMapCode = (typeof CONTENT_MAP_CODES)[keyof typeof CONTENT_MAP_CODES];

export type MapVec3 = readonly [number, number, number];

/** A set of collision polygons, one owner: `walkable` stands a body (and its steep faces stop one), `solid` only stops. */
export interface ContentMapRegion {
  /** Stable authored id: the owner's path is `content/<id>`. */
  readonly id: string;
  readonly role: "walkable" | "solid";
  /** Convex planar polygons, metres; a walkable polygon is counterclockwise seen from above (its normal up). */
  readonly polygons: readonly (readonly MapVec3[])[];
  /** A label for the editor; not gameplay (`gameplayDigest` leaves it out). */
  readonly label?: string;
}

/** A start point: the layout's `SpawnMarker` in metres (team, feet, radians about +Y). */
export interface ContentMapSpawn {
  readonly team: "A" | "B";
  readonly at: MapVec3;
  readonly yaw: number;
}

/** A plant site: the layout's `BombSite`, its reach in metres (-1 elevation: no height test, `ACTION_ELEVATION_NONE`). */
export interface ContentMapBombSite {
  readonly team: 0 | 1;
  readonly at: MapVec3;
  readonly yaw: number;
  readonly range: number;
  readonly elevation: number;
}

/** The map's game type (one of the five) and its bomb (StartBomb and the sites), the forge's own objective shape. */
export interface ContentMapObjectives {
  readonly gameType: ForgeGameType;
  readonly bomb?: { readonly start?: MapVec3; readonly sites: readonly ContentMapBombSite[] };
}

/** A named cell of the grid (`AiNamedPoint`: `PlayerStart`, `Charlie` ...), at a point on a stored cell. */
export interface ContentMapPoint {
  readonly name: string;
  readonly at: MapVec3;
}

/**
 * One AI grid (`AiSubMap`'s shape, metres): the min corner (x, the lowest y, z), the highest y, square cells of
 * `cellSize`, `cellsX` by `cellsZ`; per z row the stored columns `[x0, x1)`; per stored cell, in row order, its height
 * (absent: every cell at the min y); and its named points.
 */
export interface ContentMapNavigation {
  readonly kind: "grid";
  readonly min: MapVec3;
  readonly yMax: number;
  readonly cellSize: number;
  readonly cellsX: number;
  readonly cellsZ: number;
  readonly rows: readonly (readonly [number, number])[];
  readonly heights?: readonly number[];
  readonly points?: readonly ContentMapPoint[];
}

/**
 * A pack prop placed on the map (FCW-09's provider): its reference, feet and yaw about +Y. Solid when its asset is. A prop
 * of the map's own pack is `{assetId}` in the member and carries the map's reference's pack here (S3d).
 */
export interface ContentMapProp {
  readonly content: ContentRef;
  readonly at: MapVec3;
  readonly yaw: number;
}

export interface ContentMapDefinition {
  readonly schema: typeof CONTENT_MAP_SCHEMA;
  readonly version: typeof CONTENT_MAP_VERSION;
  /** The caller's reference, attached by the reader (S3c): the member holds `mapId`, its `assetId`, never this. */
  readonly ref: ContentRef;
  readonly name: string;
  readonly units: "metre";
  readonly up: "+Y";
  readonly bounds: { readonly min: MapVec3; readonly max: MapVec3 };
  readonly regions: readonly ContentMapRegion[];
  readonly spawns: readonly ContentMapSpawn[];
  readonly objectives?: ContentMapObjectives;
  readonly navigation?: ContentMapNavigation;
  readonly props?: readonly ContentMapProp[];
  /** The pack's GLB member the page draws (FUI-17); not gameplay. */
  readonly visual?: { readonly member: string };
  /** Every pack the map needs beside its own, each once (an own-pack prop needs no entry: S3d). */
  readonly dependencies: readonly PackRef[];
}

export interface ReadContentMapOptions {
  /** The packs this device holds (the registry's). Absent: dependencies are not checked against a device. */
  readonly available?: readonly PackRef[];
}

const FIELDS = ["schema", "version", "mapId", "name", "units", "up", "bounds", "regions", "spawns", "objectives", "navigation", "props", "visual", "dependencies"];
const REGION_ID = /^[A-Za-z0-9_.-]{1,64}$/;
const POINT_NAME = /^[A-Za-z0-9_]{1,31}$/;
const MEMBER = /^[A-Za-z0-9_./-]{1,240}$/;

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const vec3 = (v: unknown): v is MapVec3 => Array.isArray(v) && v.length === 3 && v.every(finite);
const extraKey = (v: Record<string, unknown>, keys: readonly string[]): string | null => Object.keys(v).find((k) => !keys.includes(k)) ?? null;

class Refusals {
  readonly list: Diagnostic[] = [];
  add(code: ContentMapCode, text: string, field?: string, actual?: string): void {
    this.list.push(diagnostic({ source: "pack", severity: "error", code, text, field, actual, evidence: "validation" }));
  }
}

/**
 * Reads a map member's JSON (its text, or the parsed value) as the engine's `ContentMapDefinition`, or every refusal
 * found (each a `Diagnostic` coded `map.*`, source `pack`, evidence `validation`). `ref` is the reference the caller
 * asked for, attached to the definition (S3c): the member names only its `mapId`, and one whose `mapId` is not
 * `ref.assetId` is refused (`map.REF_MISMATCH`); a member that still carries a `ref` is refused (`map.REF_IN_MEMBER`).
 * With `available`, a dependency the device does not hold is refused (`map.DEPENDENCY_UNAVAILABLE`); a dependency that
 * is the map's own pack (`ref.pack`'s id and version) is refused `map.DEPENDENCY_OWN_PACK` (LATER 459). Nothing is
 * converted: metres and +Y or a refusal.
 */
export function readContentMapDefinition(json: unknown, ref: ContentRef, options: ReadContentMapOptions = {}): ContentMapDefinition | Diagnostic[] {
  const r = new Refusals();
  let raw: unknown = json;
  if (typeof json === "string") {
    try { raw = JSON.parse(json); } catch { r.add(CONTENT_MAP_CODES.invalid, "The map member is not JSON."); return r.list; }
  }
  if (!isObject(raw)) { r.add(CONTENT_MAP_CODES.invalid, "The map member is not an object."); return r.list; }
  if (raw["ref"] !== undefined) r.add(CONTENT_MAP_CODES.refInMember, "A map member names its map by mapId; its pack's reference is the reader's, never the member's.", "ref");
  const extra = extraKey(raw, [...FIELDS, "ref"]);
  if (extra) r.add(CONTENT_MAP_CODES.invalid, `A map names no field ${extra}.`, extra);
  if (raw["schema"] !== CONTENT_MAP_SCHEMA || raw["version"] !== CONTENT_MAP_VERSION) {
    r.add(CONTENT_MAP_CODES.invalid, `A map is ${CONTENT_MAP_SCHEMA} version ${CONTENT_MAP_VERSION}.`, "schema");
  }
  const refWhy = checkContentRef(ref);
  const mapId = raw["mapId"];
  if (refWhy) r.add(CONTENT_MAP_CODES.refInvalid, refWhy, "ref");
  else if (typeof mapId !== "string" || !CONTENT_ASSET_ID.test(mapId)) r.add(CONTENT_MAP_CODES.refInvalid, "A map's mapId is 1-64 of A-Z a-z 0-9 _ . -.", "mapId");
  else if (mapId !== ref.assetId) r.add(CONTENT_MAP_CODES.refMismatch, `The member defines ${mapId}, not ${ref.assetId}.`, "mapId", mapId);
  const name = raw["name"];
  if (typeof name !== "string" || name.trim().length === 0 || name.length > LAYOUT_NAME_MAX) r.add(CONTENT_MAP_CODES.nameInvalid, `A map's name is 1-${LAYOUT_NAME_MAX} characters.`, "name");
  if (raw["units"] !== "metre") r.add(CONTENT_MAP_CODES.units, "A map is in metres: units must be metre (it is never converted).", "units", String(raw["units"]));
  if (raw["up"] !== "+Y") r.add(CONTENT_MAP_CODES.up, "A map is +Y up (it is never converted).", "up", String(raw["up"]));

  const bounds = readBounds(raw["bounds"], r);
  const inBounds = (p: MapVec3): boolean => !bounds || p.every((v, i) => v >= bounds.min[i]! && v <= bounds.max[i]!);
  const outside = (p: MapVec3, field: string): void => r.add(CONTENT_MAP_CODES.outOfBounds, "A point lies outside the map's bounds.", field, `[${p.join(", ")}]`);

  const own = refWhy ? null : ref.pack;
  const dependencies = readDependencies(raw["dependencies"], r, options.available, own);
  const regions = readRegions(raw["regions"], r, inBounds, outside);
  const spawns = readSpawns(raw["spawns"], r, inBounds, outside);
  const objectives = raw["objectives"] === undefined ? undefined : readObjectives(raw["objectives"], r, inBounds, outside);
  const navigation = raw["navigation"] === undefined ? undefined : readNavigation(raw["navigation"], r, inBounds, outside);
  const props = raw["props"] === undefined ? undefined : readProps(raw["props"], r, inBounds, outside, dependencies ?? [], own);
  let visual: { member: string } | undefined;
  if (raw["visual"] !== undefined) {
    const v = raw["visual"];
    if (!isObject(v) || extraKey(v, ["member"]) || typeof v["member"] !== "string" || !MEMBER.test(v["member"]) || v["member"].split("/").includes("..")) {
      r.add(CONTENT_MAP_CODES.visualInvalid, "A map's visual is {member}, a pack member path.", "visual");
    } else visual = { member: v["member"] };
  }
  if (r.list.length > 0) return r.list;
  const def: ContentMapDefinition = {
    schema: CONTENT_MAP_SCHEMA, version: CONTENT_MAP_VERSION, ref: cloneRef(ref), name: name as string, units: "metre", up: "+Y",
    bounds: bounds!, regions: regions!, spawns: spawns!, dependencies: dependencies!,
    ...(objectives ? { objectives } : {}), ...(navigation ? { navigation } : {}), ...(props ? { props } : {}), ...(visual ? { visual } : {}),
  };
  return def;
}

/**
 * LATER 459: whether `p` is the map's own pack `own` (the reader's `ref.pack`): the same id and version, whatever hash --
 * a writer cannot know its own pack's hash (S3c), so any hash it names at that id and version means the own pack.
 */
const isOwnPack = (p: PackRef, own: PackRef | null): boolean => own !== null && p.id === own.id && p.version === own.version;

const cloneRef = (c: ContentRef): ContentRef => ({ kind: "pack", pack: { id: c.pack.id, version: c.pack.version, hash: c.pack.hash }, assetId: c.assetId });
const v3 = (p: MapVec3): MapVec3 => [p[0] + 0, p[1] + 0, p[2] + 0];

function readBounds(v: unknown, r: Refusals): { min: MapVec3; max: MapVec3 } | null {
  if (!isObject(v) || extraKey(v, ["min", "max"]) || !vec3(v["min"]) || !vec3(v["max"])) {
    r.add(CONTENT_MAP_CODES.boundsInvalid, "A map's bounds are {min, max}, two metre points.", "bounds");
    return null;
  }
  const min = v["min"] as MapVec3, max = v["max"] as MapVec3;
  if (min.some((x, i) => !(x < max[i]!))) { r.add(CONTENT_MAP_CODES.boundsInvalid, "A map's bounds have min under max on every axis.", "bounds"); return null; }
  const e = CONTENT_MAP_EXTENT_METRES_ADAPTATION;
  if ([...min, ...max].some((x) => Math.abs(x) > e)) {
    r.add(CONTENT_MAP_CODES.outOfBounds, `A map lies within ${e} m of the origin on every axis.`, "bounds");
    return null;
  }
  return { min: v3(min), max: v3(max) };
}

/** `own` is the map's own pack (the reader's `ref.pack`; null when that reference is refused, a refusal already). */
function readDependencies(v: unknown, r: Refusals, available: readonly PackRef[] | undefined, own: PackRef | null): PackRef[] | null {
  if (!Array.isArray(v)) { r.add(CONTENT_MAP_CODES.dependenciesMissing, "A map lists its dependencies (an empty list when it needs none).", "dependencies"); return null; }
  if (v.length > CONTENT_MAP_DEPENDENCIES_MAX_ADAPTATION) { r.add(CONTENT_MAP_CODES.tooLarge, `A map depends on at most ${CONTENT_MAP_DEPENDENCIES_MAX_ADAPTATION} packs.`, "dependencies"); return null; }
  for (const [i, d] of v.entries()) {
    const why = checkPackRef(d);
    if (why) { r.add(CONTENT_MAP_CODES.dependencyInvalid, why, `dependencies[${i}]`); return null; }
  }
  const refs = sortPackRefs(v as PackRef[]);
  if (refs.length !== v.length) { r.add(CONTENT_MAP_CODES.dependencyInvalid, "A map lists each dependency once.", "dependencies"); return null; }
  for (const [i, d] of (v as PackRef[]).entries()) {
    if (isOwnPack(d, own)) r.add(CONTENT_MAP_CODES.dependencyOwnPack, "A map's own pack is not among its dependencies; its reference is the reader's.", `dependencies[${i}]`, packRefKey(d));
  }
  if (available) {
    for (const m of missingPackRefs(refs.filter((d) => !isOwnPack(d, own)), available)) r.add(CONTENT_MAP_CODES.dependencyUnavailable, "A pack the map needs is not on this device.", "dependencies", packRefKey(m));
  }
  return refs;
}

type InBounds = (p: MapVec3) => boolean;
type Outside = (p: MapVec3, field: string) => void;

function readRegions(v: unknown, r: Refusals, inBounds: InBounds, outside: Outside): ContentMapRegion[] | null {
  if (!Array.isArray(v) || v.length === 0) { r.add(CONTENT_MAP_CODES.regionsMissing, "A map has regions: at least one walkable.", "regions"); return null; }
  if (v.length > CONTENT_MAP_REGIONS_MAX_ADAPTATION) { r.add(CONTENT_MAP_CODES.tooLarge, `A map has at most ${CONTENT_MAP_REGIONS_MAX_ADAPTATION} regions.`, "regions"); return null; }
  const out: ContentMapRegion[] = [];
  const ids = new Set<string>();
  let polygons = 0;
  for (const [i, g] of v.entries()) {
    const at = `regions[${i}]`;
    if (!isObject(g) || extraKey(g, ["id", "role", "polygons", "label"]) || typeof g["id"] !== "string" || !REGION_ID.test(g["id"])
      || (g["role"] !== "walkable" && g["role"] !== "solid") || !Array.isArray(g["polygons"]) || g["polygons"].length === 0
      || (g["label"] !== undefined && (typeof g["label"] !== "string" || g["label"].length > LAYOUT_NAME_MAX))) {
      r.add(CONTENT_MAP_CODES.regionInvalid, "A region is {id, role walkable or solid, polygons, label?}.", at);
      return null;
    }
    if (ids.has(g["id"])) { r.add(CONTENT_MAP_CODES.regionInvalid, "Each region id is used once.", `${at}.id`, g["id"]); return null; }
    ids.add(g["id"]);
    polygons += g["polygons"].length;
    if (polygons > CONTENT_MAP_POLYGONS_MAX_ADAPTATION) { r.add(CONTENT_MAP_CODES.tooLarge, `A map's regions carry at most ${CONTENT_MAP_POLYGONS_MAX_ADAPTATION} polygons.`, "regions"); return null; }
    const polys: MapVec3[][] = [];
    for (const [j, poly] of (g["polygons"] as unknown[]).entries()) {
      const field = `${at}.polygons[${j}]`;
      const why = polygonError(poly, g["role"]);
      if (why) { r.add(CONTENT_MAP_CODES.polygonInvalid, why, field); return null; }
      for (const p of poly as MapVec3[]) if (!inBounds(p)) { outside(p, field); return null; }
      polys.push((poly as MapVec3[]).map(v3));
    }
    out.push({ id: g["id"], role: g["role"], polygons: polys, ...(g["label"] !== undefined ? { label: g["label"] as string } : {}) });
  }
  if (!out.some((g) => g.role === "walkable")) { r.add(CONTENT_MAP_CODES.regionsMissing, "A map has at least one walkable region.", "regions"); return null; }
  return out;
}

/** Why `poly` is not a convex planar polygon of 3-255 metre points (a walkable one facing up), or null. */
function polygonError(poly: unknown, role: unknown): string | null {
  if (!Array.isArray(poly) || poly.length < 3 || poly.length > CONTENT_MAP_POLYGON_POINTS_MAX || !poly.every(vec3)) {
    return `A polygon is 3 to ${CONTENT_MAP_POLYGON_POINTS_MAX} finite metre points.`;
  }
  const ps = poly as MapVec3[];
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i]!, b = ps[(i + 1) % ps.length]!;
    nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const length = Math.hypot(nx, ny, nz);
  let size = 0;
  for (const p of ps) for (const q of ps) size = Math.max(size, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
  if (!(length > size * size * 1e-9)) return "A polygon has no area.";
  const n = [nx / length, ny / length, nz / length] as const;
  const tolerance = size * CONTENT_MAP_PLANAR_TOLERANCE_ADAPTATION;
  const a = ps[0]!;
  if (ps.some((p) => Math.abs(n[0] * (p[0] - a[0]) + n[1] * (p[1] - a[1]) + n[2] * (p[2] - a[2])) > tolerance)) return "A polygon is not planar.";
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]!, q = ps[(i + 1) % ps.length]!, s = ps[(i + 2) % ps.length]!;
    const e = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], f = [s[0] - q[0], s[1] - q[1], s[2] - q[2]];
    const c = [e[1]! * f[2]! - e[2]! * f[1]!, e[2]! * f[0]! - e[0]! * f[2]!, e[0]! * f[1]! - e[1]! * f[0]!];
    if (n[0] * c[0]! + n[1] * c[1]! + n[2] * c[2]! < -tolerance * size) return "A polygon is concave or self-crossing.";
  }
  if (role === "walkable" && !(n[1] > 0)) return "A walkable polygon faces up: counterclockwise seen from above.";
  return null;
}

function readSpawns(v: unknown, r: Refusals, inBounds: InBounds, outside: Outside): ContentMapSpawn[] | null {
  if (!Array.isArray(v) || v.length === 0) { r.add(CONTENT_MAP_CODES.spawnsMissing, "A map has spawns: at least one a team.", "spawns"); return null; }
  const out: ContentMapSpawn[] = [];
  for (const [i, s] of v.entries()) {
    const at = `spawns[${i}]`;
    if (!isObject(s) || extraKey(s, ["team", "at", "yaw"]) || (s["team"] !== "A" && s["team"] !== "B") || !vec3(s["at"]) || !finite(s["yaw"])) {
      r.add(CONTENT_MAP_CODES.spawnInvalid, "A spawn is {team A or B, at, yaw}.", at);
      return null;
    }
    if (!inBounds(s["at"] as MapVec3)) { outside(s["at"] as MapVec3, at); return null; }
    out.push({ team: s["team"], at: v3(s["at"] as MapVec3), yaw: (s["yaw"] as number) + 0 });
  }
  const { min, max } = CONTENT_MAP_SPAWNS_ADAPTATION;
  for (const team of ["A", "B"] as const) {
    const n = out.filter((s) => s.team === team).length;
    if (n < min) { r.add(CONTENT_MAP_CODES.spawnsMissing, `Team ${team} has no spawn.`, "spawns", team); return null; }
    if (n > max) { r.add(CONTENT_MAP_CODES.tooLarge, `A team has at most ${max} spawns.`, "spawns", team); return null; }
  }
  return out;
}

function readObjectives(v: unknown, r: Refusals, inBounds: InBounds, outside: Outside): ContentMapObjectives | undefined {
  if (!isObject(v) || extraKey(v, ["gameType", "bomb"])) { r.add(CONTENT_MAP_CODES.objectivesInvalid, "A map's objectives are {gameType, bomb?}.", "objectives"); return undefined; }
  const type = v["gameType"];
  if (!(FORGE_GAME_TYPES as readonly unknown[]).includes(type)) {
    r.add(CONTENT_MAP_CODES.gameType, "A map's game type is one of the original's five (1-5).", "objectives.gameType", String(type));
    return undefined;
  }
  let bomb: ContentMapObjectives["bomb"];
  if (v["bomb"] !== undefined) {
    const b = v["bomb"];
    if (!isObject(b) || extraKey(b, ["start", "sites"]) || !Array.isArray(b["sites"]) || (b["start"] !== undefined && !vec3(b["start"]))) {
      r.add(CONTENT_MAP_CODES.objectivesInvalid, "A map's bomb is {start?, sites}.", "objectives.bomb");
      return undefined;
    }
    if (b["sites"].length > RECORD_LIMITS.spawns) { r.add(CONTENT_MAP_CODES.tooLarge, `A bomb has at most ${RECORD_LIMITS.spawns} sites.`, "objectives.bomb.sites"); return undefined; }
    const sites: ContentMapBombSite[] = [];
    for (const [i, s] of (b["sites"] as unknown[]).entries()) {
      const at = `objectives.bomb.sites[${i}]`;
      if (!isObject(s) || extraKey(s, ["team", "at", "yaw", "range", "elevation"]) || (s["team"] !== 0 && s["team"] !== 1) || !vec3(s["at"])
        || !finite(s["yaw"]) || !finite(s["range"]) || !(s["range"] > 0) || !finite(s["elevation"]) || (s["elevation"] < 0 && s["elevation"] !== -1)) {
        r.add(CONTENT_MAP_CODES.objectivesInvalid, "A site is {team 0 or 1, at, yaw, range above 0, elevation (-1: none)}.", at);
        return undefined;
      }
      if (!inBounds(s["at"] as MapVec3)) { outside(s["at"] as MapVec3, at); return undefined; }
      sites.push({ team: s["team"], at: v3(s["at"] as MapVec3), yaw: (s["yaw"] as number) + 0, range: s["range"] as number, elevation: s["elevation"] as number });
    }
    const start = b["start"] as MapVec3 | undefined;
    if (start && !inBounds(start)) { outside(start, "objectives.bomb.start"); return undefined; }
    bomb = { ...(start ? { start: v3(start) } : {}), sites };
  }
  const why = unplayable(type as ForgeGameType, bomb);
  if (why) { r.add(CONTENT_MAP_CODES.objectivesUnplayable, why, "objectives", String(type)); return undefined; }
  return { gameType: type as ForgeGameType, ...(bomb ? { bomb } : {}) };
}

/**
 * Why a map cannot supply what the room's rule of `type` reads (`viewer/src/forge/objectives.ts` `forgeTypeUnplayable`,
 * each the room's own test): 1 BREACH the bomb's start and the SEALs' site (`BombAuthority.of`); 2 DEMOLITION a start and
 * one site a team (`bombReady`); 3 ESCORT and 4 EXTRACTION escortees, which an authored map cannot carry yet (no field
 * for them: refused, never played with an invented rule); 5 SUPPRESSION nothing.
 */
function unplayable(type: ForgeGameType, bomb: ContentMapObjectives["bomb"]): string | null {
  switch (type) {
    case 1: return bomb?.start && bomb.sites.some((s) => s.team === 0) ? null : "Breach needs the bomb's start and the SEALs' site.";
    case 2: return bomb?.start && bomb.sites.some((s) => s.team === 0) && bomb.sites.some((s) => s.team === 1) ? null : "Demolition needs a start and one site for each team.";
    case 3: return "Escort needs escortees and an escort script: an authored map has neither.";
    case 4: return "Extraction needs escortees: an authored map has none.";
    case 5: return null;
  }
}

function readNavigation(v: unknown, r: Refusals, inBounds: InBounds, outside: Outside): ContentMapNavigation | undefined {
  const bad = (text: string, field = "navigation"): undefined => { r.add(CONTENT_MAP_CODES.navigationInvalid, text, field); return undefined; };
  if (!isObject(v) || extraKey(v, ["kind", "min", "yMax", "cellSize", "cellsX", "cellsZ", "rows", "heights", "points"]) || v["kind"] !== "grid") {
    return bad("A map's navigation is {kind grid, min, yMax, cellSize, cellsX, cellsZ, rows, heights?, points?}.");
  }
  const min = v["min"], yMax = v["yMax"], cell = v["cellSize"], cx = v["cellsX"], cz = v["cellsZ"];
  if (!vec3(min) || !finite(yMax) || !(yMax >= min[1]) || !finite(cell) || !(cell > 0)) return bad("A grid's min is a point, its yMax at or over min y, its cell size above 0.");
  const axis = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= CONTENT_MAP_NAV_AXIS_MAX;
  if (!axis(cx) || !axis(cz)) return bad(`A grid is 1-${CONTENT_MAP_NAV_AXIS_MAX} cells on each axis.`);
  const far: MapVec3 = [min[0] + cx * cell, yMax, min[2] + cz * cell];
  if (!inBounds(min)) { outside(min, "navigation.min"); return undefined; }
  if (!inBounds(far)) { outside(far, "navigation"); return undefined; }
  const rows = v["rows"];
  if (!Array.isArray(rows) || rows.length !== cz) return bad("A grid has one row of stored cells for each z.", "navigation.rows");
  let stored = 0;
  for (const [i, row] of rows.entries()) {
    if (!Array.isArray(row) || row.length !== 2 || !Number.isInteger(row[0]) || !Number.isInteger(row[1]) || row[0] < 0 || row[1] < row[0] || row[1] > cx) {
      return bad("A row is [x0, x1): 0 <= x0 <= x1 <= cellsX.", `navigation.rows[${i}]`);
    }
    stored += row[1] - row[0];
  }
  if (stored === 0) return bad("A grid stores at least one cell.", "navigation.rows");
  if (stored > CONTENT_MAP_NAV_CELLS_MAX_ADAPTATION) { r.add(CONTENT_MAP_CODES.tooLarge, `A grid stores at most ${CONTENT_MAP_NAV_CELLS_MAX_ADAPTATION} cells.`, "navigation.rows"); return undefined; }
  let heights: number[] | undefined;
  if (v["heights"] !== undefined) {
    const h = v["heights"];
    if (!Array.isArray(h) || h.length !== stored || !h.every((y) => finite(y) && y >= min[1] && y <= yMax)) {
      return bad("A grid's heights are one a stored cell, each between min y and yMax.", "navigation.heights");
    }
    heights = h.map((y: number) => y + 0);
  }
  let points: ContentMapPoint[] | undefined;
  if (v["points"] !== undefined) {
    const p = v["points"];
    if (!Array.isArray(p) || p.length > CONTENT_MAP_NAV_POINTS_MAX_ADAPTATION) return bad(`A grid has at most ${CONTENT_MAP_NAV_POINTS_MAX_ADAPTATION} named points.`, "navigation.points");
    points = [];
    for (const [i, q] of p.entries()) {
      const at = `navigation.points[${i}]`;
      if (!isObject(q) || extraKey(q, ["name", "at"]) || typeof q["name"] !== "string" || !POINT_NAME.test(q["name"]) || !vec3(q["at"])) {
        return bad(`A named point is {name, 1-${CONTENT_MAP_POINT_NAME_MAX} of A-Z a-z 0-9 _, at}.`, at);
      }
      const pt = q["at"] as MapVec3;
      const x = Math.floor((pt[0] - min[0]) / cell), z = Math.floor((pt[2] - min[2]) / cell);
      const row = rows[z] as [number, number] | undefined;
      if (!row || x < row[0] || x >= row[1]) return bad("A named point stands on a stored cell.", at);
      points.push({ name: q["name"], at: v3(pt) });
    }
  }
  return {
    kind: "grid", min: v3(min), yMax: yMax + 0, cellSize: cell, cellsX: cx, cellsZ: cz, rows: rows.map((row: [number, number]) => [row[0], row[1]] as const),
    ...(heights ? { heights } : {}), ...(points ? { points } : {}),
  };
}

/** A prop's content that names no pack (S3d): `{assetId}` or `{kind: "pack", assetId}`, the map's own pack. */
const ownPackContent = (c: Record<string, unknown>): boolean => c["pack"] === undefined;
const ownPackContentValid = (c: Record<string, unknown>): boolean =>
  !extraKey(c, ["kind", "assetId"]) && (c["kind"] === undefined || c["kind"] === "pack") && typeof c["assetId"] === "string" && CONTENT_ASSET_ID.test(c["assetId"]);

/**
 * `own` is the map's own pack (the caller's `ref.pack`; null when that reference is refused, which is a refusal already).
 * A prop that names no pack is the map's own (S3d): `own` is attached and no dependency is asked; a prop naming the own
 * pack in full (its id and version, any hash: `isOwnPack`) is refused (`map.PROP_OWN_PACK_REF`, before the dependency
 * check, the more useful message); any other prop -- another version of the own pack id among them (LATER 459) -- is a
 * full `ContentRef` whose pack the map's `dependencies` list.
 */
function readProps(v: unknown, r: Refusals, inBounds: InBounds, outside: Outside, dependencies: readonly PackRef[], own: PackRef | null): ContentMapProp[] | undefined {
  if (!Array.isArray(v) || v.length > CONTENT_MAP_PROPS_MAX_ADAPTATION) { r.add(CONTENT_MAP_CODES.propInvalid, `A map's props are a list of at most ${CONTENT_MAP_PROPS_MAX_ADAPTATION}.`, "props"); return undefined; }
  const out: ContentMapProp[] = [];
  for (const [i, p] of v.entries()) {
    const at = `props[${i}]`;
    const c = isObject(p) ? p["content"] : undefined;
    if (!isObject(p) || extraKey(p, ["content", "at", "yaw"]) || !isObject(c) || !vec3(p["at"]) || !finite(p["yaw"])
      || (ownPackContent(c) ? !ownPackContentValid(c) : checkContentRef(c) !== null)) {
      r.add(CONTENT_MAP_CODES.propInvalid, "A prop is {content, at, yaw}; its content {assetId} (the map's own pack) or {kind, pack, assetId}.", at);
      return undefined;
    }
    let content: ContentRef;
    if (ownPackContent(c)) {
      if (!own) return undefined;
      content = { kind: "pack", pack: own, assetId: c["assetId"] as string };
    } else {
      const full = c as unknown as ContentRef;
      if (isOwnPack(full.pack, own)) {
        r.add(CONTENT_MAP_CODES.propOwnPackRef, "A prop of the map's own pack names no pack ({assetId}); its pack's reference is the reader's.", at, packRefKey(full.pack));
        return undefined;
      }
      if (!dependencies.some((d) => samePackRef(d, full.pack))) {
        r.add(CONTENT_MAP_CODES.dependencyUndeclared, "A prop's pack is not among the map's dependencies.", at, packRefKey(full.pack));
        return undefined;
      }
      content = full;
    }
    if (!inBounds(p["at"] as MapVec3)) { outside(p["at"] as MapVec3, at); return undefined; }
    out.push({ content: cloneRef(content), at: v3(p["at"] as MapVec3), yaw: (p["yaw"] as number) + 0 });
  }
  return out;
}

/**
 * The member a writer writes for `def` (S3c): its fields as they are, `ref` left out and `mapId` (`ref.assetId`) in its
 * place, and a prop of the map's own pack (its pack `ref.pack`'s id and version, any hash: `isOwnPack`) written `{assetId}`,
 * naming no pack (S3d). `readContentMapDefinition(contentMapMember(def), def.ref)` reads `def` again; a field `def`
 * should not carry is kept, so the reader refuses it as it would in a member.
 */
export function contentMapMember(def: ContentMapDefinition): Record<string, unknown> {
  const { ref, ...rest } = def;
  const member = JSON.parse(JSON.stringify(rest)) as Record<string, unknown>;
  const props = member["props"];
  if (ref?.pack && Array.isArray(def.props) && Array.isArray(props)) {
    member["props"] = def.props.map((p, i) => isOwnPack(p.content.pack, ref.pack)
      ? { ...(props[i] as Record<string, unknown>), content: { assetId: p.content.assetId } }
      : props[i] as unknown);
  }
  return { ...member, mapId: ref?.assetId };
}

/**
 * The canonical gameplay JSON's version: 3 since a prop's pack hash left it (S3c); 2 when the map's own reference left
 * it (S3b); version 1 hashed both.
 */
export const GAMEPLAY_CANONICAL_VERSION = 3 as const;

/**
 * The canonical JSON of what plays: the units and axis, the bounds (they lay out the hull's grid, so they are gameplay),
 * each region's id, role and polygons (not its label), the spawns, the objectives, the navigation and the props. Never
 * the map's own reference (its pack's id, version and hash, its map id: the same gameplay re-published keeps its digest),
 * the name, a label, the visual or the dependency list. A prop is named by its pack's id and version and its asset id,
 * never its pack's hash (S3c): a prop of the map's own pack would name a hash its member's bytes decide, and a pack
 * re-published with the same geometry keeps its digest. The hash still pins the bytes where the pack is resolved
 * (`dependencies`, the registry); the digest does not stand for a prop's hull. A prop of the map's own pack (S3d) is
 * named by the map's reference's pack id and version, so it canonicalises as a foreign prop of that same pack id,
 * version and asset id does, whatever hash that one names: intended, the digest keys on id@version + assetId.
 */
export function gameplayCanonical(def: ContentMapDefinition): string {
  return canonicalJson({
    digest: "s2u.content-map-gameplay", version: GAMEPLAY_CANONICAL_VERSION,
    units: def.units, up: def.up,
    bounds: { min: [...def.bounds.min], max: [...def.bounds.max] },
    regions: def.regions.map((g) => ({ id: g.id, role: g.role, polygons: g.polygons.map((p) => p.map((q) => [...q])) })),
    spawns: def.spawns.map((s) => ({ team: s.team, at: [...s.at], yaw: s.yaw })),
    objectives: def.objectives ? JSON.parse(JSON.stringify(def.objectives)) as unknown : null,
    navigation: def.navigation ? JSON.parse(JSON.stringify(def.navigation)) as unknown : null,
    props: (def.props ?? []).map((p) => ({
      content: { id: p.content.pack.id, version: p.content.pack.version, assetId: p.content.assetId }, at: [...p.at], yaw: p.yaw,
    })),
  });
}

/** SHA-256 (lower-case hex) of `gameplayCanonical(def)`: one digest for the page's load and the room's compile. */
export function gameplayDigest(def: ContentMapDefinition, hash?: Sha256): Promise<string> {
  return sha256Hex(new TextEncoder().encode(gameplayCanonical(def)), hash);
}

// ---------------------------------------------------------------------------------------------------------------------
// The content base
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The content base (`ContentLayoutBase`, `isContentLayout`, `checkContentLayoutBase`) and the lobby's refusal of it
 * (`onlineCreatorLayoutRefusal`) are `layout.ts`'s since S3b: the base is a `LayoutBase` member, read by `parseLayout` and
 * the record v3. What stays here is how a base names its map.
 */

/** The map's reference: the pack's asset `mapId`. */
export const contentBaseRef = (b: ContentLayoutBase): ContentRef => ({ kind: "pack", pack: { id: b.ref.id, version: b.ref.version, hash: b.ref.hash }, assetId: b.mapId });
