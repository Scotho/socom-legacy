/**
 * FCW-09 original-authored content tool, a browser adaptation with no original-game behaviour.
 * This is a provisional TOOL-INTERNAL seam, not AssetDefinition, a pack format, or the client/match wire.
 *
 * Source preparation only: no loading, storage, publication, engine conversion or render serialization.
 */
import { checkReport, diagnostic, type CheckReport } from '@s2u/creator-contracts';
import { closeMatrix, ImportRefusal, matrix, refuse, transform, validateHull } from './geometry';
import { readGlbSource } from './glbSource';
import { CheckLimit, PreparationBudget, PreparedLimit } from './limits';

export type SourcePoint = readonly [number, number, number];

/** Neutral authoring geometry in metres; no engine surface flags or gameplay semantics. */
export interface OriginalGlbHullSource {
  readonly vertices: readonly SourcePoint[];
  /** Outward, counterclockwise polygons viewed from outside; must form a closed convex hull. */
  readonly faces: readonly (readonly number[])[];
}

export interface OriginalGlbAuthoringSource {
  /** Only an explicit metre source is covered by the proposed tests; conversion belongs to a reviewed adapter. */
  readonly unit: string;
  readonly up: string;
  /** Source declaration only. Finite positive-determinant transforms are baked regardless of this claim. */
  readonly transformsBaked: boolean;
  /**
   * Declared resolved frame of this provisional single-node hull source. The actual GLB nodes and ancestor order
   * are authoritative; this declaration must match that resolved frame and cannot replace hierarchy inspection.
   * SOURCE_FRAME_MISMATCH is the proposed internal refusal, pending the published contract's diagnostic mapping.
   */
  readonly nodeMatrixColumnMajor: readonly number[];
  /** Absence does not grant solidity. An explicit empty `none` is the visual-only case. */
  readonly collision?: {
    readonly intent: 'none' | 'convex';
    readonly hulls: readonly OriginalGlbHullSource[];
  };
}

/**
 * Already-approved bytes only. This provisional context grants no file/network lookup or public pack schema.
 * When supplied, glbMember must exist, own exactly the passed GLB bytes, and every member/path must be canonical
 * and safe before any resource resolution. Missing ownership, mismatched bytes or unsafe paths refuse rather than
 * fall back to the standalone bytes or a file/network resolver. MEMBER_PATH, GLB_MEMBER_MISSING and
 * GLB_MEMBER_MISMATCH are proposed internal diagnostics pending the published contract's canonical mapping.
 */
export interface OriginalGlbMemberContext {
  readonly glbMember: string;
  readonly members: readonly { readonly member: string; readonly bytes: Uint8Array }[];
}

export interface OriginalGlbPreparedSource {
  /** Exact input provenance/material source, NOT the rendered/baked GLB or a replacement visual serializer. */
  readonly source: { readonly originalGlb: Uint8Array };
  /** Neutral baked-geometry proposal only. Serializing render/material output belongs to the future adapter. */
  readonly baked: {
    readonly unit: 'metre';
    readonly up: '+Y';
    readonly transformsBaked: true;
    readonly primitives: readonly {
      readonly positionsMetres: readonly SourcePoint[];
      readonly indices: readonly number[];
    }[];
    readonly boundsMetres: { readonly min: SourcePoint; readonly max: SourcePoint };
    readonly collision:
      | { readonly kind: 'visual-only'; readonly hulls: readonly [] }
      | { readonly kind: 'convex'; readonly hulls: readonly OriginalGlbHullSource[] };
  };
}

/** Diagnostics are internal to this provisional tool; no public diagnostic/wire contract is established here. */
export type OriginalGlbPreflightResult =
  | { readonly ok: true; readonly prepared: OriginalGlbPreparedSource }
  | { readonly ok: false; readonly diagnostics: readonly { readonly code: string; readonly message: string }[]; readonly report: CheckReport };

/**
 * Fail-closed source preflight. Actual GLB node TRS/matrices/hierarchy are checked
 * independently of the author's baked-transform claim. `extras.pivot` is unsupported and must be refused, not
 * silently stripped/reinterpreted. Policy: UI-seat message 2026-10-25T06:47Z -- buffers BIN/data, images data or
 * normalized relative in-pack members (member paths contain no .., absolute path or scheme). blob/http(s)/file
 * are EXTERNAL_URI with no network or filesystem preflight. FCW-05 pack/member byte budgets and packPath are reused.
 * UI-seat 2026-10-25T06:54Z supersedes the earlier transform refusal: every finite positive-determinant node TRS
 * is baked into render and hull vertices, including translation and visual-only nodes. The baked proposal records
 * transformsBaked:true. Nonfinite is NONFINITE_TRANSFORM. The owning controller's 08:57Z refinement tests
 * |determinant| < 1e-12 first (DEGENERATE_TRANSFORM), then a remaining negative as MIRRORED_TRANSFORM.
 * Proposed tool validation: actual GLB hierarchy owns transform order; a disagreeing declared sidecar frame refuses
 * with SOURCE_FRAME_MISMATCH rather than choosing one or baking only the sidecar's matrix.
 * Singular transforms and |determinant| < 1e-12 refuse per the owning UI controller's 2026-10-25T08:50Z ruling.
 * Sources are metres and +Y up; placement yaw-only enforcement belongs to the published adapter/provider.
 * Success would establish source preparation only, not Blender export, rendering, gameplay units or solidity.
 */
export function preflightOriginalGlb(
  bytes: Uint8Array,
  authoring: OriginalGlbAuthoringSource,
  members?: OriginalGlbMemberContext,
): OriginalGlbPreflightResult {
  try {
    if (!authoring || authoring.unit !== 'metre') refuse('SOURCE_UNIT', 'Declare metres explicitly; no unit conversion is guessed.');
    if (authoring.up !== '+Y') refuse('SOURCE_UP', 'Declare +Y up explicitly; no reorientation is guessed.');
    const frame = matrix(authoring.nodeMatrixColumnMajor,'SOURCE_TRANSFORM');
    const preparation = new PreparationBudget();
    const geometry = readGlbSource(bytes,members,preparation);
    const collision = authoring.collision;
    if (!collision || !Array.isArray(collision.hulls) || (collision.intent === 'convex' && collision.hulls.length === 0)) refuse('COLLISION_MISSING', 'Declare visual-only explicitly or supply validated convex hulls.');
    if (collision.intent !== 'convex' && collision.intent !== 'none') refuse('COLLISION_INTENT', 'Collision intent must be none or convex.');
    if (collision.intent === 'none' && collision.hulls.length !== 0) refuse('COLLISION_INTENT', 'Visual-only intent must have no hulls.');
    // Visual-only scenes need no hull frame binding: every primitive already uses its actual node hierarchy.
    // A solid sidecar still describes ONE frame, never the first arbitrarily chosen frame of several instances.
    if (collision.intent === 'convex' && (!geometry.frame || !closeMatrix(frame,geometry.frame))) refuse('SOURCE_FRAME_MISMATCH', 'The solid sidecar does not match one resolved GLB geometry frame.');
    const hulls: OriginalGlbHullSource[] = [];
    for (let index = 0; index < collision.hulls.length; index++) {
      if (!Object.prototype.hasOwnProperty.call(collision.hulls,index) || !collision.hulls[index]) refuse('COLLISION_MISSING', 'Every convex hull list entry must supply a hull.');
      const hull: OriginalGlbHullSource = collision.hulls[index];
      validateHull(hull,preparation);
      preparation.prepare((hull.vertices.length * 3 + hull.faces.reduce((n,face) => n + face.length,0)) * Float64Array.BYTES_PER_ELEMENT);
      const baked = { vertices: hull.vertices.map(p => transform(geometry.frame!,p)), faces: hull.faces.map(face => [...face]) };
      validateHull(baked,preparation);
      hulls.push(baked);
    }
    return { ok: true, prepared: {
      // Typed-array construction copies even Node Buffer inputs; Buffer.slice() would retain an alias.
      source: { originalGlb: new Uint8Array(bytes) },
      baked: { unit: 'metre', up: '+Y', transformsBaked: true,
        primitives: geometry.primitives, boundsMetres: geometry.boundsMetres,
        collision: collision.intent === 'none' ? { kind: 'visual-only', hulls: [] } : { kind: 'convex', hulls },
      },
    } };
  } catch (error) {
    const failure = error instanceof PreparedLimit ? new ImportRefusal('PREPARED_TOO_LARGE',error.message)
      : error instanceof CheckLimit ? new ImportRefusal('CHECK_BUDGET_EXCEEDED',error.message) : error;
    if (!(failure instanceof ImportRefusal)) throw failure;
    return { ok: false, diagnostics: [{ code: failure.code, message: failure.message }],
      report: checkReport([diagnostic({ source: 'pack', code: `local.glb.${failure.code}`,
        severity: 'error', text: failure.message, evidence: 'validation',
      })], { evidence: 'validation' }),
    };
  }
}
