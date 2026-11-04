/** Neutral original prop-fixture sidecar adaptation. This is tool-internal source geometry, not a public pack
 * schema or runtime asset. Audit-inventory hashes and render/source filenames are not independently verified here;
 * callers remain responsible for pack ownership/hashes, and the normal preflight validates all geometry.
 */
import { checkReport, diagnostic } from '@s2u/creator-contracts';
import { preflightOriginalGlb, type OriginalGlbMemberContext, type OriginalGlbPreflightResult, type OriginalGlbHullSource, type SourcePoint } from './originalGlb';
import { ImportRefusal, refuse } from './geometry';
import { CheckLimit, PreparationBudget } from './limits';

const record = (value: unknown, field: string): Record<string,unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse('SOURCE_SIDECAR_INVALID', `${field} must be an authoring object.`);
  return value as Record<string,unknown>;
};
const array = (value: unknown, field: string): unknown[] => {
  if (!Array.isArray(value)) refuse('SOURCE_SIDECAR_INVALID', `${field} must be an authoring array.`);
  return value;
};

export function preflightOriginalPropSidecar(
  bytes: Uint8Array,
  sidecar: unknown,
  members?: OriginalGlbMemberContext,
): OriginalGlbPreflightResult {
  try {
    const raw = record(sidecar,'sidecar');
    const coordinates = record(raw.coordinates,'coordinates');
    if (typeof coordinates.unit !== 'string' || typeof coordinates.up !== 'string' || typeof raw.transformsBaked !== 'boolean') refuse('SOURCE_SIDECAR_INVALID','A sidecar declares unit, up and transformsBaked explicitly.');
    if (raw.intendedCollision !== 'none' && raw.intendedCollision !== 'convex') refuse('SOURCE_SIDECAR_INVALID','intendedCollision must explicitly declare none or convex.');
    const hulls: OriginalGlbHullSource[] = [];
    const shapeBudget = new PreparationBudget();
    const sourceHulls = array(raw.hulls,'hulls');
    // Each projected hull costs an entry even when malformed/empty; reserve that known outer work BEFORE reads.
    shapeBudget.check(sourceHulls.length);
    for (const value of sourceHulls) {
      const hull = record(value,'hull');
      const vertices = array(hull.vertices,'hull.vertices');
      const sourceFaces = array(hull.faces,'hull.faces');
      if (vertices.length < 4 || sourceFaces.length < 4) refuse('COLLISION_DEGENERATE','A solid hull needs at least four vertices and faces before sidecar projection.');
      // Bound projection itself before walking a large sidecar. The normal preflight subsequently charges the
      // complete render/source/baked-hull aggregate; this guard grants no extra work or numeric-output budget.
      shapeBudget.check(vertices.length*sourceFaces.length + vertices.length + sourceFaces.length);
      const faces: number[][] = [];
      for (const value of sourceFaces) {
        const face = record(value,'face');
        const indices = array(face.indices,'face.indices');
        shapeBudget.check(indices.length);
        // No coercion: the regular geometry preflight checks the actual numeric coordinates/indices.
        // Borrow readonly source references; only the regular preflight allocates owned baked numeric output.
        faces.push(indices as number[]);
      }
      hulls.push({ vertices: vertices as unknown as SourcePoint[], faces });
    }
    return preflightOriginalGlb(bytes,{
      unit: coordinates.unit, up: coordinates.up, transformsBaked: raw.transformsBaked,
      nodeMatrixColumnMajor: array(raw.nodeMatrixColumnMajor,'nodeMatrixColumnMajor') as number[],
      collision: { intent: raw.intendedCollision, hulls },
    },members);
  } catch (error) {
    const failure = error instanceof CheckLimit ? new ImportRefusal('CHECK_BUDGET_EXCEEDED',error.message) : error;
    if (!(failure instanceof ImportRefusal)) throw failure;
    return { ok: false, diagnostics: [{ code: failure.code, message: failure.message }], report: checkReport([
      diagnostic({ source: 'pack', code: `local.glb.${failure.code}`, severity: 'error', text: failure.message, evidence: 'validation' }),
    ], { evidence: 'validation' }) };
  }
}
