/** Neutral authoring mathematics. Numerical tolerances are floating-point error allowances, not game values. */
import type { OriginalGlbHullSource, SourcePoint } from './originalGlb';
import { GLB_DETERMINANT_EPSILON_ADAPTATION, type PreparationBudget } from './limits';

export class ImportRefusal extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
export function refuse(code: string, message: string): never { throw new ImportRefusal(code, message); }
export const identity = (): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const point = (v: unknown): v is SourcePoint => Array.isArray(v) && v.length === 3 && finite(v[0]) && finite(v[1]) && finite(v[2]);
const clean = (v: number): number => v === 0 ? 0 : v;
export function multiply(a: readonly number[], b: readonly number[]): number[] {
  return Array.from({ length: 16 }, (_, i) => {
    const row = i % 4, col = Math.floor(i / 4);
    return clean(a[row]! * b[col * 4]! + a[row + 4]! * b[col * 4 + 1]! + a[row + 8]! * b[col * 4 + 2]! + a[row + 12]! * b[col * 4 + 3]!);
  });
}
export function transform(m: readonly number[], p: SourcePoint): SourcePoint {
  const out: SourcePoint = [0, 1, 2].map(i => clean(m[i]! * p[0] + m[i + 4]! * p[1] + m[i + 8]! * p[2] + m[i + 12]!)) as unknown as SourcePoint;
  if (!out.every(finite)) refuse('NONFINITE_TRANSFORM', 'A transformed point is not finite.');
  return out;
}
export function matrix(value: unknown, code: string, path = 'authoring.nodeMatrixColumnMajor'): number[] {
  if (!Array.isArray(value) || value.length !== 16) refuse(code, 'An authoring transform is a 16-element column-major matrix.');
  if (!value.every(finite)) refuse('NONFINITE_TRANSFORM', 'A transform component is not finite.');
  if (value[3] !== 0 || value[7] !== 0 || value[11] !== 0 || value[15] !== 1) refuse(code, 'An authoring transform must be affine.');
  checkDeterminant(value,path);
  return [...value];
}
export function checkDeterminant(m: readonly number[], path: string): void {
  const det = m[0]! * (m[5]! * m[10]! - m[9]! * m[6]!) - m[4]! * (m[1]! * m[10]! - m[9]! * m[2]!) + m[8]! * (m[1]! * m[6]! - m[5]! * m[2]!);
  if (!finite(det)) refuse('NONFINITE_TRANSFORM', `${path}: the transform determinant is not finite.`);
  if (Math.abs(det) < GLB_DETERMINANT_EPSILON_ADAPTATION) refuse('DEGENERATE_TRANSFORM', `${path}: determinant ${det} collapses geometry (tool threshold ${GLB_DETERMINANT_EPSILON_ADAPTATION}).`);
  if (det < 0) refuse('MIRRORED_TRANSFORM', `${path}: mirrored nodes are not supported.`);
}
export function nodeMatrix(node: Record<string, unknown>, path: string): number[] {
  if (node.matrix !== undefined) {
    if (node.translation !== undefined || node.rotation !== undefined || node.scale !== undefined) refuse('GLB_TRANSFORM', 'A node cannot supply both matrix and TRS.');
    return matrix(node.matrix, 'GLB_TRANSFORM',path);
  }
  const vector = (v: unknown, size: number, fallback: number[]): number[] => {
    if (v === undefined) return fallback;
    if (!Array.isArray(v) || v.length !== size) refuse('GLB_TRANSFORM', 'A TRS vector has the wrong size.');
    if (!v.every(finite)) refuse('NONFINITE_TRANSFORM', 'A TRS component is not finite.');
    return [...v];
  };
  const t = vector(node.translation, 3, [0, 0, 0]);
  const s = vector(node.scale, 3, [1, 1, 1]);
  const [x, y, z, w] = vector(node.rotation, 4, [0, 0, 0, 1]) as [number, number, number, number];
  const norm = Math.hypot(x, y, z, w);
  if (Math.abs(norm - 1) > 1e-6) refuse('GLB_TRANSFORM', 'The rotation quaternion must be normalized.');
  const out = [
    (1 - 2 * (y*y + z*z)) * s[0]!, 2 * (x*y + z*w) * s[0]!, 2 * (x*z - y*w) * s[0]!, 0,
    2 * (x*y - z*w) * s[1]!, (1 - 2 * (x*x + z*z)) * s[1]!, 2 * (y*z + x*w) * s[1]!, 0,
    2 * (x*z + y*w) * s[2]!, 2 * (y*z - x*w) * s[2]!, (1 - 2 * (x*x + y*y)) * s[2]!, 0,
    t[0]!, t[1]!, t[2]!, 1,
  ];
  checkDeterminant(out,path);
  return out;
}
export const closeMatrix = (a: readonly number[], b: readonly number[]): boolean => a.every((v, i) => Math.abs(v - b[i]!) <= 1e-10 * Math.max(1, Math.abs(v), Math.abs(b[i]!)));
const sub = (a: SourcePoint, b: SourcePoint): SourcePoint => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const cross = (a: SourcePoint, b: SourcePoint): SourcePoint => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const dot = (a: SourcePoint, b: SourcePoint): number => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

/** Closed manifold topology, planar convex faces and a convex outward volume are independent checks. */
export function validateHull(hull: OriginalGlbHullSource, budget: PreparationBudget): void {
  if (!hull || !Array.isArray(hull.vertices)) refuse('COLLISION_COORDINATE', 'Hull coordinates must be finite triples.');
  const { vertices, faces } = hull;
  if (vertices.length < 4 || !Array.isArray(faces) || faces.length < 4) refuse('COLLISION_DEGENERATE', 'A solid hull needs a volume.');
  // Reserve the known O(V*F) and linear shape costs before even reading a face entry. An oversized list
  // must not be traversed merely to discover its index count. Index visits are charged incrementally below.
  budget.check(vertices.length * faces.length + vertices.length + faces.length);
  for (const face of faces) {
    if (!Array.isArray(face)) refuse('COLLISION_INDEX', 'Hull faces must be arrays.');
    budget.check(face.length);
  }
  for (const vertex of vertices) if (!point(vertex)) refuse('COLLISION_COORDINATE', 'Hull coordinates must be finite triples.');
  const unique = new Set(vertices.map(p => p.join(',')));
  if (unique.size !== vertices.length) refuse('COLLISION_DEGENERATE', 'A hull must not repeat a coordinate under separate vertex indices.');
  const min = vertices.reduce<number[]>((v,p) => v.map((x,i) => Math.min(x,p[i]!)), [Infinity,Infinity,Infinity]);
  const max = vertices.reduce<number[]>((v,p) => v.map((x,i) => Math.max(x,p[i]!)), [-Infinity,-Infinity,-Infinity]);
  const scale = Math.max(...max.map((v, i) => v - min[i]!));
  if (!(scale > 0) || max.some((v, i) => v === min[i])) refuse('COLLISION_DEGENERATE', 'The hull has zero extent.');
  const tolerance = scale * 1e-9;
  const edges = new Map<string, { count: number; direction: number }>();
  const planes: { at: SourcePoint; normal: SourcePoint }[] = [];
  const used = new Set<number>();
  let volume = 0;
  for (const face of faces) {
    if (face.length < 3 || new Set(face).size !== face.length) refuse('COLLISION_INDEX', 'A face needs distinct, in-range vertex indices.');
    for (const index of face) if (!integer(index) || index >= vertices.length) refuse('COLLISION_INDEX', 'A face needs distinct, in-range vertex indices.');
    const a = vertices[face[0]!]!;
    let normal: SourcePoint = [0, 0, 0];
    for (let j = 1; j + 1 < face.length; j++) {
      const c = cross(sub(vertices[face[j]!]!, a), sub(vertices[face[j+1]!]!, a));
      normal = [normal[0]+c[0], normal[1]+c[1], normal[2]+c[2]];
      // Use a translated origin to avoid catastrophic cancellation for a small hull far from zero.
      volume += dot(sub(a, vertices[0]!), cross(sub(vertices[face[j]!]!, vertices[0]!), sub(vertices[face[j+1]!]!, vertices[0]!))) / 6;
    }
    const length = Math.hypot(...normal);
    if (!finite(length) || length <= scale*scale*1e-12) refuse('COLLISION_DEGENERATE', 'A hull face has zero area.');
    normal = normal.map(x => x / length) as unknown as SourcePoint;
    if (face.some((i: number) => Math.abs(dot(normal, sub(vertices[i]!, a))) > tolerance)) refuse('COLLISION_NONPLANAR', 'A hull face is not planar.');
    for (let j = 0; j < face.length; j++) {
      const u = face[j]!, v = face[(j+1)%face.length]!;
      used.add(u);
      const key = `${Math.min(u,v)}:${Math.max(u,v)}`;
      const e = edges.get(key) ?? { count: 0, direction: 0 };
      e.count++; e.direction += u < v ? 1 : -1; edges.set(key,e);
      const ab = sub(vertices[v]!, vertices[u]!);
      const bc = sub(vertices[face[(j+2)%face.length]!]!, vertices[v]!);
      if (dot(normal, cross(ab, bc)) < -tolerance*scale) refuse('COLLISION_NONCONVEX', 'A hull face is concave or self-crossing.');
    }
    planes.push({ at: a, normal });
  }
  if ([...edges.values()].some(e => e.count !== 2) || used.size !== vertices.length) refuse('COLLISION_OPEN', 'Every hull edge must have exactly two faces and every vertex must be used.');
  if ([...edges.values()].some(e => e.direction !== 0) || volume < 0) refuse('COLLISION_WINDING', 'Hull faces must have consistent outward winding.');
  if (!finite(volume) || volume <= scale*scale*scale*1e-12) refuse('COLLISION_DEGENERATE', 'The hull has no positive volume.');
  for (const plane of planes) {
    if (vertices.some(p => dot(plane.normal, sub(p, plane.at)) > tolerance)) refuse('COLLISION_NONCONVEX', 'A hull vertex lies outside a face plane.');
  }
}
