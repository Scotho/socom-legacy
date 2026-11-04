import {
  checkContentRef, checkFrameDeterminant, checkHull, diagnostic, GEOMETRY_CHECK_BUDGET_ADAPTATION, GEOMETRY_DETERMINANT_EPSILON_ADAPTATION, GeometryRefusal,
  packPath, type ContentRef, type Diagnostic, type GeometryHull, type PackRef,
} from '@s2u/creator-contracts';

/**
 * FCW-09 (product track; a browser adaptation with no original): a creator pack's prop as the engine reads it -- the
 * `AssetDefinition` a pack member `assets/<assetId>.json` holds. The forge's retail pieces never come here: a disc
 * prototype (`MP2:crate`) is read off the player's own disc (`../../forge/ground` `prototypePolygons`), unchanged.
 *
 * The definition is the import tool's prepared output (`tools/creator-import/src/originalGlb.ts`
 * `OriginalGlbPreparedSource.baked`) written as a member: metres, +Y up, every authoring transform already baked
 * (`unit` there is `units` here; its `collision.kind` `visual-only` is `intent: 'none'`, `convex` is `intent: 'convex'`
 * with its baked `hulls` and the identity `frame`; `boundsMetres` as it is). The engine needs only the bounds and the
 * hull; the visual is a reference to the pack's GLB member, which the page's three.js loader reads -- the engine never
 * parses a GLB. Units, axis and scale are the tool's to bake: a definition that is not metre, +Y and baked is refused
 * here, never converted.
 *
 * The checks the tool makes on a frame and a hull are the creator contracts' (`@s2u/creator-contracts` `geometry.ts`,
 * `checkFrameDeterminant` and `checkHull`, S3b: one source, the tool's algorithm and codes), each refusal given as
 * `asset.<the tool's code>`. `test/packs/contentAssets.test.ts` holds the codes; `test/packs/contentGeometry.test.ts` holds
 * the contract and the tool's own copy (`tools/creator-import/src/geometry.ts`, until its seat imports the contract) in
 * agreement.
 */

export const ASSET_DEFINITION_SCHEMA = 's2u.creator/asset-definition' as const;
export const ASSET_DEFINITION_VERSION = 1 as const;

/** The pack member that holds an asset's definition. */
export const assetMemberPath = (assetId: string): string => `assets/${assetId}.json`;

/**
 * A frame whose |determinant| is under this collapses geometry: the contract's (`GEOMETRY_DETERMINANT_EPSILON_ADAPTATION`,
 * the import tool's threshold, `tools/creator-import/src/limits.ts` `GLB_DETERMINANT_EPSILON_ADAPTATION`). A product-tool
 * bound, not a game value.
 */
export const ASSET_DETERMINANT_EPSILON_ADAPTATION = GEOMETRY_DETERMINANT_EPSILON_ADAPTATION;
/**
 * The structural work a definition's hulls may cost to check (each hull's V x F + V + F and each face index, both the
 * source and the baked hull): the contract's (`GEOMETRY_CHECK_BUDGET_ADAPTATION`, the import tool's budget,
 * `tools/creator-import/src/limits.ts` `GLB_CHECK_BUDGET_ADAPTATION`). Work units, not milliseconds.
 */
export const ASSET_CHECK_BUDGET_ADAPTATION = GEOMETRY_CHECK_BUDGET_ADAPTATION;
/**
 * The most points one hull face may have: a collision polygon's `m_ptcount` is eight bits of its surface word
 * (`@s2u/scene` `collision.ts` `surfaceWord`; reCOM `zIntersect/zintersect.h:21-28`, `DI_PARAMS`). A face over it could
 * not be a `WorldPoly`.
 */
export const ASSET_FACE_POINTS_MAX = 255;

/** The refusal codes: the import tool's, namespaced `asset.`, where they overlap; the engine's own beside them. */
export const ASSET_CODES = {
  invalid: 'asset.ASSET_INVALID',
  refInvalid: 'asset.REF_INVALID',
  refMismatch: 'asset.REF_MISMATCH',
  sourceUnit: 'asset.SOURCE_UNIT',
  sourceUp: 'asset.SOURCE_UP',
  notBaked: 'asset.NOT_BAKED',
  sourceTransform: 'asset.SOURCE_TRANSFORM',
  nonfiniteTransform: 'asset.NONFINITE_TRANSFORM',
  degenerateTransform: 'asset.DEGENERATE_TRANSFORM',
  mirroredTransform: 'asset.MIRRORED_TRANSFORM',
  collisionMissing: 'asset.COLLISION_MISSING',
  collisionIntent: 'asset.COLLISION_INTENT',
  collisionCoordinate: 'asset.COLLISION_COORDINATE',
  collisionDegenerate: 'asset.COLLISION_DEGENERATE',
  collisionIndex: 'asset.COLLISION_INDEX',
  collisionNonplanar: 'asset.COLLISION_NONPLANAR',
  collisionNonconvex: 'asset.COLLISION_NONCONVEX',
  collisionOpen: 'asset.COLLISION_OPEN',
  collisionWinding: 'asset.COLLISION_WINDING',
  collisionFacePoints: 'asset.COLLISION_FACE_POINTS',
  checkBudget: 'asset.CHECK_BUDGET_EXCEEDED',
  boundsInvalid: 'asset.BOUNDS_INVALID',
  visualFormat: 'asset.VISUAL_FORMAT',
} as const;
export type AssetCode = (typeof ASSET_CODES)[keyof typeof ASSET_CODES];

export type Vec3 = readonly [number, number, number];
/** A closed convex hull in metres: outward faces, counterclockwise seen from outside (the import tool's). */
export interface AssetHull {
  readonly vertices: readonly Vec3[];
  readonly faces: readonly (readonly number[])[];
}
export type AssetCollision =
  /** Visual-only: placed and drawn, never solid. */
  | { readonly intent: 'none' }
  /** Solid: the hulls in the asset's model space through ONE frame (column-major 4x4, affine, positive), baked once. */
  | { readonly intent: 'convex'; readonly hulls: readonly AssetHull[]; readonly frame: readonly number[] };

export interface AssetDefinition {
  readonly ref: ContentRef;
  readonly kind: 'prop';
  readonly units: 'metre';
  readonly up: '+Y';
  readonly transformsBaked: true;
  /** The pack's GLB member the page's loader draws; the engine reads none of it. */
  readonly visual: { readonly member: string };
  readonly boundsMetres: { readonly min: Vec3; readonly max: Vec3 };
  readonly collision: AssetCollision;
  /** The pack it came from, and the source GLB member with its SHA-256 (the import tool's input bytes). */
  readonly provenance: { readonly pack: PackRef; readonly member: string; readonly sha256: string };
}

class Refusal extends Error {
  constructor(readonly code: string, message: string, readonly field?: string) { super(message); }
}
function refuse(code: string, message: string, field?: string): never { throw new Refusal(code, message, field); }

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const point = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && finite(v[0]) && finite(v[1]) && finite(v[2]);
const HEX64 = /^[0-9a-f]{64}$/;
const FIELDS = ['schema', 'version', 'assetId', 'kind', 'units', 'up', 'transformsBaked', 'visual', 'boundsMetres', 'collision', 'source'];

function onlyKeys(v: Record<string, unknown>, keys: readonly string[], at: string): void {
  for (const k of Object.keys(v)) if (!keys.includes(k)) refuse(ASSET_CODES.invalid, `${at} names no field ${k}.`, at ? `${at}.${k}` : k);
}

function member(v: unknown, field: string): string {
  const r = packPath(v);
  if (!r.ok) refuse(r.code, r.text, field);
  return r.path;
}

/** A contract check (`@s2u/creator-contracts` `geometry.ts`) whose refusal is the tool's code as `asset.<CODE>` at `field`. */
function geometry(field: string, check: () => void): void {
  try { check(); } catch (e) {
    if (e instanceof GeometryRefusal) refuse(`asset.${e.code}`, e.message, field);
    throw e;
  }
}

/** The tool's `checkDeterminant` (the contract's `checkFrameDeterminant`): not finite, then degenerate, then mirrored. */
function checkDeterminant(m: readonly number[]): void {
  geometry('collision.frame', () => checkFrameDeterminant(m, 'The hull frame'));
}

/** The tool's `matrix`: 16 finite numbers, affine, a determinant that neither collapses nor mirrors. */
function frameOf(v: unknown): number[] {
  if (!Array.isArray(v) || v.length !== 16) refuse(ASSET_CODES.sourceTransform, 'The hull frame is a 16-element column-major matrix.', 'collision.frame');
  if (!v.every(finite)) refuse(ASSET_CODES.nonfiniteTransform, 'A hull frame component is not finite.', 'collision.frame');
  if (v[3] !== 0 || v[7] !== 0 || v[11] !== 0 || v[15] !== 1) refuse(ASSET_CODES.sourceTransform, 'The hull frame must be affine.', 'collision.frame');
  checkDeterminant(v as number[]);
  return [...(v as number[])];
}

const clean = (v: number): number => (v === 0 ? 0 : v);
/** A point through a column-major affine frame; a point carried past finite is the tool's `NONFINITE_TRANSFORM`. */
function transform(m: readonly number[], p: Vec3): Vec3 {
  const out = [0, 1, 2].map((i) => clean(m[i]! * p[0] + m[i + 4]! * p[1] + m[i + 8]! * p[2] + m[i + 12]!)) as unknown as Vec3;
  if (!out.every(finite)) refuse(ASSET_CODES.nonfiniteTransform, 'A hull point carried by the frame is not finite.', 'collision.frame');
  return out;
}

class Budget {
  private used = 0;
  check(count: number): void {
    const next = this.used + count;
    if (!Number.isSafeInteger(next) || next > ASSET_CHECK_BUDGET_ADAPTATION) {
      refuse(ASSET_CODES.checkBudget, `Checking the hulls would cost ${next} checks, over ${ASSET_CHECK_BUDGET_ADAPTATION}.`, 'collision.hulls');
    }
    this.used = next;
  }
}

/**
 * The tool's `validateHull` (the contract's `checkHull`, its codes and tolerances: floating-point allowances, not game
 * values): closed manifold topology, planar convex faces, outward winding, a convex positive volume -- plus the engine's
 * own face-point bound (`ASSET_FACE_POINTS_MAX`). The member's own shape first: an object with a vertex list and no
 * other key than `vertices` and `faces`.
 */
function validateHull(hull: unknown, budget: Budget): AssetHull {
  if (!isObject(hull) || !Array.isArray(hull['vertices'])) refuse(ASSET_CODES.collisionCoordinate, 'Hull coordinates must be finite triples.', 'collision.hulls');
  onlyKeys(hull, ['vertices', 'faces'], 'collision.hulls[]');
  geometry('collision.hulls', () => checkHull(hull as unknown as GeometryHull, budget, { facePointsMax: ASSET_FACE_POINTS_MAX }));
  const vs = hull['vertices'] as Vec3[];
  const fs = hull['faces'] as number[][];
  return { vertices: vs.map((p) => [p[0], p[1], p[2]] as Vec3), faces: fs.map((f) => [...f]) };
}

function collisionOf(v: unknown): AssetCollision {
  if (!isObject(v)) refuse(ASSET_CODES.collisionMissing, 'Declare visual-only (intent none) explicitly or supply convex hulls.', 'collision');
  if (v['intent'] !== 'none' && v['intent'] !== 'convex') refuse(ASSET_CODES.collisionIntent, 'Collision intent must be none or convex.', 'collision.intent');
  if (v['intent'] === 'none') {
    if (v['hulls'] !== undefined || v['frame'] !== undefined) refuse(ASSET_CODES.collisionIntent, 'Visual-only intent has no hulls and no frame.', 'collision');
    onlyKeys(v, ['intent'], 'collision');
    return { intent: 'none' };
  }
  onlyKeys(v, ['intent', 'hulls', 'frame'], 'collision');
  if (!Array.isArray(v['hulls']) || v['hulls'].length === 0) refuse(ASSET_CODES.collisionMissing, 'A convex intent supplies at least one hull.', 'collision.hulls');
  const frame = frameOf(v['frame']);
  const budget = new Budget();
  const hulls = (v['hulls'] as unknown[]).map((h) => validateHull(h, budget));
  // As the tool does: the source hull checked, then the hull the frame bakes checked again.
  for (const h of hulls) validateHull(bakeHull(h, frame), budget);
  return { intent: 'convex', hulls, frame };
}

const bakeHull = (h: AssetHull, frame: readonly number[]): AssetHull => ({ vertices: h.vertices.map((p) => transform(frame, p)), faces: h.faces.map((f) => [...f]) });

/**
 * The definition's hulls with their one frame baked, in metres, in the asset's model space (the identity frame leaves
 * them as they are); none for a visual-only prop.
 */
export function bakedHulls(def: AssetDefinition): AssetHull[] {
  if (def.collision.intent !== 'convex') return [];
  const { frame, hulls } = def.collision;
  return hulls.map((h) => bakeHull(h, frame));
}

function boundsOf(v: unknown): AssetDefinition['boundsMetres'] {
  if (!isObject(v) || !point(v['min']) || !point(v['max'])) refuse(ASSET_CODES.boundsInvalid, 'boundsMetres is {min, max}, each three finite numbers.', 'boundsMetres');
  onlyKeys(v, ['min', 'max'], 'boundsMetres');
  const min = v['min'] as Vec3, max = v['max'] as Vec3;
  if (min.some((x, i) => x > max[i]!)) refuse(ASSET_CODES.boundsInvalid, 'boundsMetres.min is above boundsMetres.max.', 'boundsMetres');
  return { min: [min[0], min[1], min[2]], max: [max[0], max[1], max[2]] };
}

/**
 * The definition a pack member holds (`json`, parsed), for the asset `ref` names -- or why not, in the one diagnostics
 * model (`source: 'pack'`, an error, the member named, `evidence: 'validation'`). The first refusal is the answer, as the
 * import tool's preflight answers. `ref` is the reference the layout's piece carries: the member never names its own pack
 * hash (the hash covers the member), so the reader attaches it.
 */
export function readAssetDefinition(json: unknown, ref: ContentRef): AssetDefinition | Diagnostic[] {
  const file = typeof ref?.assetId === 'string' ? assetMemberPath(ref.assetId) : undefined;
  try {
    const why = checkContentRef(ref);
    if (why) refuse(ASSET_CODES.refInvalid, why);
    if (!isObject(json)) refuse(ASSET_CODES.invalid, 'An asset definition is a JSON object.');
    onlyKeys(json, FIELDS, '');
    if (json['schema'] !== ASSET_DEFINITION_SCHEMA || json['version'] !== ASSET_DEFINITION_VERSION) {
      refuse(ASSET_CODES.invalid, `An asset definition is ${ASSET_DEFINITION_SCHEMA} version ${ASSET_DEFINITION_VERSION}.`, 'schema');
    }
    if (json['assetId'] !== ref.assetId) refuse(ASSET_CODES.refMismatch, `The member defines ${String(json['assetId'])}, not ${ref.assetId}.`, 'assetId');
    if (json['kind'] !== 'prop') refuse(ASSET_CODES.invalid, 'An asset definition\'s kind is prop.', 'kind');
    if (json['units'] !== 'metre') refuse(ASSET_CODES.sourceUnit, 'Declare metres; the engine converts no unit.', 'units');
    if (json['up'] !== '+Y') refuse(ASSET_CODES.sourceUp, 'Declare +Y up; the engine reorients nothing.', 'up');
    if (json['transformsBaked'] !== true) refuse(ASSET_CODES.notBaked, 'Every authoring transform is baked by the import tool before the engine reads it.', 'transformsBaked');
    const visual = json['visual'];
    if (!isObject(visual)) refuse(ASSET_CODES.invalid, 'visual is {member}.', 'visual');
    onlyKeys(visual, ['member'], 'visual');
    const visualMember = member(visual['member'], 'visual.member');
    if (!/\.glb$/i.test(visualMember)) refuse(ASSET_CODES.visualFormat, 'The visual is the pack\'s GLB member.', 'visual.member');
    const boundsMetres = boundsOf(json['boundsMetres']);
    const collision = collisionOf(json['collision']);
    const source = json['source'];
    if (!isObject(source)) refuse(ASSET_CODES.invalid, 'source is {member, sha256}.', 'source');
    onlyKeys(source, ['member', 'sha256'], 'source');
    const sourceMember = member(source['member'], 'source.member');
    if (typeof source['sha256'] !== 'string' || !HEX64.test(source['sha256'])) refuse(ASSET_CODES.invalid, 'source.sha256 is 64 lower-case hex digits.', 'source.sha256');
    const pack: PackRef = { id: ref.pack.id, version: ref.pack.version, hash: ref.pack.hash };
    return {
      ref: { kind: 'pack', pack: { ...pack }, assetId: ref.assetId },
      kind: 'prop', units: 'metre', up: '+Y', transformsBaked: true,
      visual: { member: visualMember },
      boundsMetres,
      collision,
      provenance: { pack, member: sourceMember, sha256: source['sha256'] },
    };
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    return [diagnostic({ source: 'pack', severity: 'error', code: error.code, text: error.message, file, field: error.field, evidence: 'validation' })];
  }
}
