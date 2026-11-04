/**
 * FCW-09 asset-member output (product adaptation, no original-game behaviour).
 * The published viewer/src/packs/content/assets.ts owns the JSON schema; this is a pure tool-local member writer.
 * It emits definition bytes only: no file I/O, network, publication, installation, visual serialization or game units.
 */
import {
  CONTENT_ASSET_ID, DigestError, PACK_BYTES_ADAPTATION, PACK_CODES, PACK_FILES_ADAPTATION,
  PACK_MEMBER_BYTES_ADAPTATION, canonicalJson, checkReport, diagnostic, packPath, sha256Hex, type CheckReport,
} from '@s2u/creator-contracts';
import {
  ASSET_CODES, ASSET_DEFINITION_SCHEMA, ASSET_DEFINITION_VERSION, ASSET_FACE_POINTS_MAX, assetMemberPath,
} from '../../../packages/viewer/src/packs/content/assets';
import { identity } from './geometry';
import { preflightOriginalGlb, type OriginalGlbAuthoringSource, type OriginalGlbMemberContext } from './originalGlb';

/** Approved original members plus the stable asset ID. No PackRef: the definition precedes the pack digest. */
export interface AssetMemberContext extends OriginalGlbMemberContext {
  readonly assetId: string;
}

/** One owned definition member, or the existing diagnostic report model with no emitted member. */
export type AssetMemberResult =
  | { readonly ok: true; readonly member: { readonly path: string; readonly bytes: Uint8Array } }
  | { readonly ok: false; readonly report: CheckReport };

function refused(code: string, text: string, field?: string, file?: string): AssetMemberResult {
  return { ok: false, report: checkReport([
    diagnostic({ source: 'pack', severity: 'error', code, text, field, file, evidence: 'validation' }),
  ], { evidence: 'validation' }) };
}

/**
 * Preflight validates the original views and returns owned baked hull/bounds arrays synchronously. Approved member
 * bytes and paths are then copied, after admission budgets pass and before the first digest await. Nothing after
 * that await reads caller-owned bytes, authoring geometry or context metadata.
 * The original GLB remains the visual/source member; already-baked hulls use identity, never the source frame again.
 * No production PackRef/hash is invented to call the engine reader. Consumer round-trips belong to the tests.
 */
export async function prepareAssetMember(
  glb: Uint8Array,
  authoring: OriginalGlbAuthoringSource,
  context: AssetMemberContext,
): Promise<AssetMemberResult> {
  if (!context || typeof context !== 'object') {
    return refused('local.glb.GLB_MEMBER_MISSING', 'The writer requires an approved original-member context.', 'glbMember');
  }
  const result = preflightOriginalGlb(glb, authoring, context);
  if (!result.ok) return { ok: false, report: result.report };

  const assetId = context.assetId;
  if (typeof assetId !== 'string' || !CONTENT_ASSET_ID.test(assetId)) {
    return refused(ASSET_CODES.refInvalid, 'assetId must satisfy the published content asset ID contract.', 'assetId');
  }
  const output = packPath(assetMemberPath(assetId));
  if (!output.ok) return refused(output.code, output.text, 'assetId');
  const visual = packPath(context.glbMember);
  if (!visual.ok) return refused(visual.code, visual.text, 'visual.member');
  if (!/\.glb$/i.test(visual.path)) {
    return refused(ASSET_CODES.visualFormat, 'The visual is the original pack GLB member.', 'visual.member', output.path);
  }

  const baked = result.prepared.baked;
  if (baked.collision.kind === 'convex') {
    for (const hull of baked.collision.hulls) {
      if (hull.faces.some(face => face.length > ASSET_FACE_POINTS_MAX)) {
        return refused(ASSET_CODES.collisionFacePoints, `A hull face has at most ${ASSET_FACE_POINTS_MAX} points.`, 'collision.hulls', output.path);
      }
    }
  }

  if (context.members.length + 1 > PACK_FILES_ADAPTATION) {
    return refused(PACK_CODES.tooManyFiles, 'The new definition would exceed the published pack member count.', 'members', output.path);
  }
  const ownedMembers: { member: string; bytes: Uint8Array }[] = [];
  let memberBytes = 0;
  for (const entry of context.members) {
    const path = packPath(entry.member);
    if (!path.ok) return refused(path.code, path.text, 'members');
    if (path.path.toLowerCase() === output.path.toLowerCase()) {
      return refused(PACK_CODES.pathCollision, 'The definition output would overwrite an approved member.', 'assetId', output.path);
    }
    memberBytes += entry.bytes.byteLength;
    ownedMembers.push({ member: path.path, bytes: new Uint8Array(entry.bytes) });
  }
  const original = ownedMembers.find(entry => entry.member === visual.path)!;
  // Original ownership and exact view equality were admitted by preflight; the snapshot is the hash source.
  try {
    const sourceHash = await sha256Hex(original.bytes);
    const definition = {
      schema: ASSET_DEFINITION_SCHEMA, version: ASSET_DEFINITION_VERSION, assetId, kind: 'prop',
      units: baked.unit, up: baked.up, transformsBaked: baked.transformsBaked,
      visual: { member: visual.path }, boundsMetres: baked.boundsMetres,
      collision: baked.collision.kind === 'visual-only'
        ? { intent: 'none' }
        : { intent: 'convex', hulls: baked.collision.hulls, frame: identity() },
      source: { member: visual.path, sha256: sourceHash },
    };
    const bytes = new TextEncoder().encode(canonicalJson(definition));
    if (bytes.byteLength > PACK_MEMBER_BYTES_ADAPTATION) {
      return refused(PACK_CODES.memberTooLarge, 'The definition exceeds the published member byte budget.', undefined, output.path);
    }
    if (memberBytes + bytes.byteLength > PACK_BYTES_ADAPTATION) {
      return refused(PACK_CODES.tooLarge, 'The definition would exceed the published aggregate pack byte budget.', undefined, output.path);
    }
    return { ok: true, member: { path: output.path, bytes } };
  } catch (error) {
    if (!(error instanceof DigestError)) throw error;
    return refused(`local.${error.code}`, error.message, undefined, output.path);
  }
}
