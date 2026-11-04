/**
 * FCW-09 S3b (product track; a tool's authoring mathematics, no original and no game value): the hull and frame checks
 * the import tool makes (`tools/creator-import/src/geometry.ts` `checkDeterminant`, `validateHull`) and the engine makes
 * again on a pack prop's member (`viewer/src/packs/content/assets.ts` `readAssetDefinition`), in ONE module both can
 * import -- pure (no DOM, no renderer, no Node API). The numerical tolerances are floating-point error allowances, never
 * game values. A refusal is a `GeometryRefusal` with the tool's own bare code (`DEGENERATE_TRANSFORM`, `COLLISION_OPEN`
 * ...); a caller namespaces it (the engine's `asset.<CODE>`).
 *
 * The tool still holds its own copy until its seat switches its import to this module (S3b item 6: the tool's file is
 * not this seat's); `viewer/test/packs/contentGeometry.test.ts` holds the two in agreement.
 */

/**
 * A frame whose |determinant| is under this collapses geometry: the import tool's threshold
 * (`tools/creator-import/src/limits.ts` L7 `GLB_DETERMINANT_EPSILON_ADAPTATION`, the owning UI controller's
 * 2026-10-25T08:50Z ruling). A product-tool bound, not a game value.
 */
export const GEOMETRY_DETERMINANT_EPSILON_ADAPTATION = 1e-12;
/**
 * The structural work a preparation's hulls may cost to check (each hull's V x F + V + F and each face index): the import
 * tool's budget (`tools/creator-import/src/limits.ts` L5 `GLB_CHECK_BUDGET_ADAPTATION`). Work units, not milliseconds.
 */
export const GEOMETRY_CHECK_BUDGET_ADAPTATION = 5_000_000;

/** The tool's refusal codes these checks give (`tools/creator-import/src/geometry.ts`). */
export const GEOMETRY_CODES = {
  nonfiniteTransform: "NONFINITE_TRANSFORM",
  degenerateTransform: "DEGENERATE_TRANSFORM",
  mirroredTransform: "MIRRORED_TRANSFORM",
  collisionCoordinate: "COLLISION_COORDINATE",
  collisionDegenerate: "COLLISION_DEGENERATE",
  collisionIndex: "COLLISION_INDEX",
  collisionNonplanar: "COLLISION_NONPLANAR",
  collisionNonconvex: "COLLISION_NONCONVEX",
  collisionOpen: "COLLISION_OPEN",
  collisionWinding: "COLLISION_WINDING",
  /** The engine's own bound beside the tool's (`HullCheckOptions.facePointsMax`). */
  collisionFacePoints: "COLLISION_FACE_POINTS",
} as const;
export type GeometryCode = (typeof GEOMETRY_CODES)[keyof typeof GEOMETRY_CODES];

/** A check's refusal: the tool's bare code and its words. */
export class GeometryRefusal extends Error {
  override readonly name = "GeometryRefusal";
  constructor(readonly code: GeometryCode, message: string) { super(message); }
}
function refuse(code: GeometryCode, message: string): never { throw new GeometryRefusal(code, message); }

export type GeometryPoint = readonly [number, number, number];
/** A closed convex hull in metres: outward faces, counterclockwise seen from outside (the import tool's). */
export interface GeometryHull {
  readonly vertices: readonly GeometryPoint[];
  readonly faces: readonly (readonly number[])[];
}
/** The work budget a check charges (the tool's `PreparationBudget`, the engine's own): throws its own refusal when spent. */
export interface GeometryBudget { check(count: number): void }

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const point = (v: unknown): v is GeometryPoint => Array.isArray(v) && v.length === 3 && finite(v[0]) && finite(v[1]) && finite(v[2]);
const sub = (a: GeometryPoint, b: GeometryPoint): GeometryPoint => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: GeometryPoint, b: GeometryPoint): GeometryPoint => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: GeometryPoint, b: GeometryPoint): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The upper-left 3x3's determinant of a column-major 4x4 (the tool's expansion, term for term). */
export function frameDeterminant(m: readonly number[]): number {
  return m[0]! * (m[5]! * m[10]! - m[9]! * m[6]!) - m[4]! * (m[1]! * m[10]! - m[9]! * m[2]!) + m[8]! * (m[1]! * m[6]! - m[5]! * m[2]!);
}

/**
 * The tool's `checkDeterminant`: a determinant not finite (`NONFINITE_TRANSFORM`), then one whose magnitude is under
 * `GEOMETRY_DETERMINANT_EPSILON_ADAPTATION` (`DEGENERATE_TRANSFORM`: a negative one that small collapses before it
 * mirrors), then a negative one (`MIRRORED_TRANSFORM`). `path` names the frame in the words.
 */
export function checkFrameDeterminant(m: readonly number[], path = "frame"): void {
  const det = frameDeterminant(m);
  if (!finite(det)) refuse(GEOMETRY_CODES.nonfiniteTransform, `${path}: the transform determinant is not finite.`);
  if (Math.abs(det) < GEOMETRY_DETERMINANT_EPSILON_ADAPTATION) {
    refuse(GEOMETRY_CODES.degenerateTransform, `${path}: determinant ${det} collapses geometry (tool threshold ${GEOMETRY_DETERMINANT_EPSILON_ADAPTATION}).`);
  }
  if (det < 0) refuse(GEOMETRY_CODES.mirroredTransform, `${path}: mirrored nodes are not supported.`);
}

export interface HullCheckOptions {
  /** The engine's bound on a face's points (a `WorldPoly`'s eight-bit count), checked after each face's indices. Absent: none (the tool's). */
  readonly facePointsMax?: number;
}

/**
 * The tool's `validateHull`: closed manifold topology, planar convex faces, a consistent outward winding and a convex
 * positive volume -- independent checks, in the tool's order, each refusing with the tool's code. The budget is charged
 * the known O(V x F) and linear costs before any face entry is read, then each face's index count.
 */
export function checkHull(hull: GeometryHull, budget: GeometryBudget, options: HullCheckOptions = {}): void {
  if (!hull || !Array.isArray(hull.vertices)) refuse(GEOMETRY_CODES.collisionCoordinate, "Hull coordinates must be finite triples.");
  const { vertices, faces } = hull;
  if (vertices.length < 4 || !Array.isArray(faces) || faces.length < 4) refuse(GEOMETRY_CODES.collisionDegenerate, "A solid hull needs a volume.");
  budget.check(vertices.length * faces.length + vertices.length + faces.length);
  for (const face of faces) {
    if (!Array.isArray(face)) refuse(GEOMETRY_CODES.collisionIndex, "Hull faces must be arrays.");
    budget.check(face.length);
  }
  for (const vertex of vertices) if (!point(vertex)) refuse(GEOMETRY_CODES.collisionCoordinate, "Hull coordinates must be finite triples.");
  if (new Set(vertices.map((p) => p.join(","))).size !== vertices.length) {
    refuse(GEOMETRY_CODES.collisionDegenerate, "A hull must not repeat a coordinate under separate vertex indices.");
  }
  const min = vertices.reduce<number[]>((acc, p) => acc.map((x, i) => Math.min(x, p[i]!)), [Infinity, Infinity, Infinity]);
  const max = vertices.reduce<number[]>((acc, p) => acc.map((x, i) => Math.max(x, p[i]!)), [-Infinity, -Infinity, -Infinity]);
  const scale = Math.max(...max.map((v, i) => v - min[i]!));
  if (!(scale > 0) || max.some((v, i) => v === min[i])) refuse(GEOMETRY_CODES.collisionDegenerate, "The hull has zero extent.");
  const tolerance = scale * 1e-9;
  const edges = new Map<string, { count: number; direction: number }>();
  const planes: { at: GeometryPoint; normal: GeometryPoint }[] = [];
  const used = new Set<number>();
  let volume = 0;
  for (const face of faces) {
    if (face.length < 3 || new Set(face).size !== face.length) refuse(GEOMETRY_CODES.collisionIndex, "A face needs distinct, in-range vertex indices.");
    for (const i of face) if (!integer(i) || i >= vertices.length) refuse(GEOMETRY_CODES.collisionIndex, "A face needs distinct, in-range vertex indices.");
    if (options.facePointsMax !== undefined && face.length > options.facePointsMax) {
      refuse(GEOMETRY_CODES.collisionFacePoints, `A hull face has at most ${options.facePointsMax} points.`);
    }
    const a = vertices[face[0]!]!;
    let normal: GeometryPoint = [0, 0, 0];
    for (let j = 1; j + 1 < face.length; j++) {
      const c = cross(sub(vertices[face[j]!]!, a), sub(vertices[face[j + 1]!]!, a));
      normal = [normal[0] + c[0], normal[1] + c[1], normal[2] + c[2]];
      // A translated origin, as the tool's: no catastrophic cancellation for a small hull far from zero.
      volume += dot(sub(a, vertices[0]!), cross(sub(vertices[face[j]!]!, vertices[0]!), sub(vertices[face[j + 1]!]!, vertices[0]!))) / 6;
    }
    const length = Math.hypot(...normal);
    if (!finite(length) || length <= scale * scale * 1e-12) refuse(GEOMETRY_CODES.collisionDegenerate, "A hull face has zero area.");
    normal = normal.map((x) => x / length) as unknown as GeometryPoint;
    if (face.some((i: number) => Math.abs(dot(normal, sub(vertices[i]!, a))) > tolerance)) refuse(GEOMETRY_CODES.collisionNonplanar, "A hull face is not planar.");
    for (let j = 0; j < face.length; j++) {
      const u = face[j]!, v = face[(j + 1) % face.length]!;
      used.add(u);
      const key = `${Math.min(u, v)}:${Math.max(u, v)}`;
      const e = edges.get(key) ?? { count: 0, direction: 0 };
      e.count++; e.direction += u < v ? 1 : -1; edges.set(key, e);
      const ab = sub(vertices[v]!, vertices[u]!);
      const bc = sub(vertices[face[(j + 2) % face.length]!]!, vertices[v]!);
      if (dot(normal, cross(ab, bc)) < -tolerance * scale) refuse(GEOMETRY_CODES.collisionNonconvex, "A hull face is concave or self-crossing.");
    }
    planes.push({ at: a, normal });
  }
  if ([...edges.values()].some((e) => e.count !== 2) || used.size !== vertices.length) {
    refuse(GEOMETRY_CODES.collisionOpen, "Every hull edge must have exactly two faces and every vertex must be used.");
  }
  if ([...edges.values()].some((e) => e.direction !== 0) || volume < 0) refuse(GEOMETRY_CODES.collisionWinding, "Hull faces must have consistent outward winding.");
  if (!finite(volume) || volume <= scale * scale * scale * 1e-12) refuse(GEOMETRY_CODES.collisionDegenerate, "The hull has no positive volume.");
  for (const plane of planes) {
    if (vertices.some((p) => dot(plane.normal, sub(p, plane.at)) > tolerance)) refuse(GEOMETRY_CODES.collisionNonconvex, "A hull vertex lies outside a face plane.");
  }
}
