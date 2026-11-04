import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  CHECK_REPORT_SCHEMA, CHECK_REPORT_VERSION, PACK_CODES, canonicalJson, type ContentRef,
} from '@s2u/creator-contracts';
import { describe, expect, it } from 'vitest';
import {
  ASSET_CODES, ASSET_DEFINITION_SCHEMA, ASSET_DEFINITION_VERSION, ASSET_FACE_POINTS_MAX,
  assetMemberPath, bakedHulls, readAssetDefinition, type AssetDefinition,
} from '../../packages/viewer/src/packs/content/assets';
import { ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER, FLOAT, GlbWriter, UNSIGNED_SHORT, type Json } from '../gltf';
import { prepareAssetMember, type AssetMemberContext, type AssetMemberResult } from '../creator-import/src/assetMember';
import {
  preflightOriginalGlb, type OriginalGlbAuthoringSource, type OriginalGlbHullSource, type SourcePoint,
} from '../creator-import/src/originalGlb';

/**
 * Product adaptation with original-authored fixtures, no disc payload.
 * Root retained 41 collected behavioral assertion failures against inert writer 198f9a40a before implementation.
 * Root retained 41 GREEN, tools typecheck exit 0 and fresh whole-source PASS high at 00d86c31f.
 * Claude cross-reviewed PASS WITH FINDINGS high and integrated the writer; rendered acceptance remains owed.
 * Future checks require root's install/allowlist/runtime grant and codex-seatrun.sh ONE file per invocation.
 * No direct Vitest, multi-file invocation or worker override.
 * Consumer round-trips are unit validation, not rendered/textured, Blender, physical solidity or game acceptance.
 */
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
/** Explicit synthetic consumer identity for tests only. Never supplied to, invented by, or serialized by the writer. */
const TEST_REF: ContentRef = { kind: 'pack', pack: { id: 'fcw09.fixture', version: '1.0.0', hash: 'a'.repeat(64) }, assetId: 'crate' };
type FixtureStem = 'solid' | 'visual-only' | 'degenerate-hull' | 'external-uri' | 'mirrored-transform';
interface FixtureSidecar {
  coordinates: { unit: string; up: string };
  transformsBaked: boolean;
  nodeMatrixColumnMajor: number[];
  intendedCollision: 'none' | 'convex';
  hulls: { vertices: SourcePoint[]; faces: { indices: number[] }[] }[];
  sourceSha256: string;
}
function fixture(stem: FixtureStem = 'solid') {
  const glb = new Uint8Array(readFileSync(new URL(`../creator-import/fixtures/props/${stem}.glb`, import.meta.url)));
  const sidecar = JSON.parse(readFileSync(new URL(`../creator-import/fixtures/props/${stem}.collision-source.json`, import.meta.url), 'utf8')) as FixtureSidecar;
  // Test-data projection of the committed neutral fixture into the existing preflight's typed authoring seam.
  // These sidecars are INPUTS, never the asset-member output being tested.
  const authoring: OriginalGlbAuthoringSource = {
    unit: sidecar.coordinates.unit, up: sidecar.coordinates.up, transformsBaked: sidecar.transformsBaked,
    nodeMatrixColumnMajor: [...sidecar.nodeMatrixColumnMajor],
    collision: { intent: sidecar.intendedCollision, hulls: sidecar.hulls.map(h => ({
      vertices: h.vertices.map(p => [...p] as SourcePoint), faces: h.faces.map(f => [...f.indices]),
    })) },
  };
  return { glb, sidecar, authoring, context: context(glb, stem) };
}
function context(glb: Uint8Array, stem = 'solid'): AssetMemberContext {
  const glbMember = `props/${stem}.glb`;
  return { assetId: 'crate', glbMember, members: [{ member: glbMember, bytes: glb }] };
}
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
type Success = Extract<AssetMemberResult, { ok: true }>;
async function success(work: Promise<AssetMemberResult>): Promise<Success> {
  await expect(work).resolves.toMatchObject({ ok: true, member: { bytes: expect.any(Uint8Array) } });
  const result = await work;
  if (!result.ok) throw new Error(result.report.diagnostics.map(d => d.code).join(', '));
  return result;
}
async function refusal(work: Promise<AssetMemberResult>, code?: string): Promise<Extract<AssetMemberResult, { ok: false }>> {
  await expect(work).resolves.toMatchObject({
    ok: false, report: { schema: CHECK_REPORT_SCHEMA, version: CHECK_REPORT_VERSION, status: 'fail' },
  });
  const result = await work;
  expect(result).not.toHaveProperty('member');
  if (result.ok) throw new Error('refused input emitted a definition member');
  expect(result.report.diagnostics.length).toBeGreaterThan(0);
  if (code) expect(result.report.diagnostics).toContainEqual(expect.objectContaining({ code, source: 'pack', severity: 'error', evidence: 'validation' }));
  return result;
}
function json(result: Success): Record<string, unknown> {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(result.member.bytes)) as Record<string, unknown>;
}
function consume(result: Success, assetId = 'crate'): AssetDefinition {
  const definition = readAssetDefinition(json(result), { ...TEST_REF, assetId });
  expect(Array.isArray(definition)).toBe(false);
  if (Array.isArray(definition)) throw new Error(definition.map(d => `${d.code}: ${d.text}`).join(', '));
  return definition;
}

/** Preserve the original fixture BIN/material bytes while changing only its actual node hierarchy. */
function editNodes(bytes: Uint8Array, change: (doc: { nodes: Json[]; scenes: { nodes: number[] }[] }) => void): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(12, true);
  const doc = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as { nodes: Json[]; scenes: { nodes: number[] }[] };
  change(doc);
  const encoded = new TextEncoder().encode(JSON.stringify(doc));
  const padded = Math.ceil(encoded.length / 4) * 4;
  const rest = bytes.subarray(20 + length);
  const out = new Uint8Array(20 + padded + rest.length);
  out.set(bytes.subarray(0, 20)); out.fill(0x20, 20, 20 + padded);
  out.set(encoded, 20); out.set(rest, 20 + padded);
  const header = new DataView(out.buffer);
  header.setUint32(8, out.length, true); header.setUint32(12, padded, true);
  return out;
}

/** Original-authored regular prism. The reader's exported face bound supplies the boundary; no new cap. */
function prism(sides: number): OriginalGlbHullSource {
  const ring = Array.from({ length: sides }, (_, i) => [Math.cos(i * 2 * Math.PI / sides), Math.sin(i * 2 * Math.PI / sides)] as const);
  const vertices: SourcePoint[] = [
    ...ring.map(([x, z]) => [x, 0, z] as SourcePoint), ...ring.map(([x, z]) => [x, 1, z] as SourcePoint),
  ];
  const bottom = Array.from({ length: sides }, (_, i) => i);
  const top = bottom.map(i => i + sides).reverse();
  const walls = bottom.map(i => [i, i + sides, ((i + 1) % sides) + sides, (i + 1) % sides]);
  return { vertices, faces: [bottom, top, ...walls] };
}
function prismGlb(hull: OriginalGlbHullSource): Uint8Array {
  const writer = new GlbWriter('redotcom FCW-09 original-authored face-bound test');
  const positions = new Float32Array(hull.vertices.flat());
  const indices = new Uint16Array(hull.faces.flatMap(face => {
    const triangles: number[] = [];
    for (let i = 1; i + 1 < face.length; i++) triangles.push(face[0]!, face[i]!, face[i + 1]!);
    return triangles;
  }));
  const bounds = (fn: (...values: number[]) => number) => [0, 1, 2].map(i => fn(...hull.vertices.map(p => p[i]!)));
  const p = writer.addAccessor(writer.addBufferView(new Uint8Array(positions.buffer), ARRAY_BUFFER), FLOAT, hull.vertices.length, 'VEC3', { min: bounds(Math.min), max: bounds(Math.max) });
  const i = writer.addAccessor(writer.addBufferView(new Uint8Array(indices.buffer), ELEMENT_ARRAY_BUFFER), UNSIGNED_SHORT, indices.length, 'SCALAR');
  writer.meshes.push({ primitives: [{ attributes: { POSITION: p }, indices: i, mode: 4 }] });
  writer.nodes.push({ mesh: 0 }); writer.roots.push(0);
  return writer.finish();
}

describe('FCW-09 asset definition member output', () => {
  it('emits the real solid fixture as one assets/crate.json member that the published reader accepts', async () => {
    const f = fixture();
    const work = prepareAssetMember(f.glb, f.authoring, f.context);
    // Retained first behavioral RED: the inert PREPARATION_ONLY rejection failed this success assertion.
    await expect(work).resolves.toMatchObject({ ok: true, member: { path: 'assets/crate.json', bytes: expect.any(Uint8Array) } });
    const result = await success(work);
    const definition = consume(result);
    expect(result.member.path).toBe(assetMemberPath('crate'));
    expect(json(result)).toEqual({
      schema: ASSET_DEFINITION_SCHEMA, version: ASSET_DEFINITION_VERSION, assetId: 'crate', kind: 'prop',
      units: 'metre', up: '+Y', transformsBaked: true,
      visual: { member: f.context.glbMember }, boundsMetres: { min: [-1, 0, -0.5], max: [1, 1.5, 0.5] },
      collision: { intent: 'convex', hulls: f.authoring.collision!.hulls, frame: IDENTITY },
      source: { member: f.context.glbMember, sha256: sha256(f.glb) },
    });
    expect(definition.provenance).toEqual({ pack: TEST_REF.pack, member: f.context.glbMember, sha256: sha256(f.glb) });
    expect(definition.provenance.sha256).not.toBe(f.sidecar.sourceSha256);
    expect(bakedHulls(definition)).toEqual(f.authoring.collision!.hulls);
  });

  it('emits the real visual-only fixture with exactly intent none and no inferred box, hulls or frame', async () => {
    const f = fixture('visual-only');
    const result = await success(prepareAssetMember(f.glb, f.authoring, f.context));
    expect(json(result).collision).toEqual({ intent: 'none' });
    expect(consume(result).collision).toEqual({ intent: 'none' });
    expect(bakedHulls(consume(result))).toEqual([]);
    expect(json(result)).not.toHaveProperty('solid');
  });

  it('preserves a valid mixed-case stable ID instead of silently renaming it for output', async () => {
    const f = fixture(); const assetId = 'Crate_1.v2';
    const result = await success(prepareAssetMember(f.glb, f.authoring, { ...f.context, assetId }));
    expect(result.member.path).toBe('assets/Crate_1.v2.json');
    expect(consume(result, assetId).ref.assetId).toBe(assetId);
  });

  it('bakes actual child scale then ancestor translation once while the visual still names the original GLB', async () => {
    const f = fixture();
    const glb = editNodes(f.glb, doc => {
      doc.nodes[0]!['scale'] = [2, 1, 1];
      doc.nodes.push({ children: [0], translation: [3, 0, 0] });
      doc.scenes[0]!.nodes = [1];
    });
    const authoring = { ...f.authoring, transformsBaked: false, nodeMatrixColumnMajor: [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 0, 0, 1] };
    const result = await success(prepareAssetMember(glb, authoring, context(glb)));
    const def = consume(result);
    expect(def.boundsMetres).toEqual({ min: [1, 0, -0.5], max: [5, 1.5, 0.5] });
    expect(def.collision.intent === 'convex' && def.collision.frame).toEqual(IDENTITY);
    expect(bakedHulls(def)[0]!.vertices).toEqual(f.authoring.collision!.hulls[0]!.vertices.map(([x, y, z]) => [x * 2 + 3, y, z]));
    expect(def.visual.member).toBe('props/solid.glb');
    expect(def.provenance.sha256).toBe(sha256(glb));
  });

  it('keeps a transformed visual-only original hierarchy without inventing collision', async () => {
    const f = fixture('visual-only');
    const glb = editNodes(f.glb, doc => { doc.nodes[0]!['translation'] = [3, 2, -4]; });
    const result = await success(prepareAssetMember(glb, f.authoring, context(glb, 'visual-only')));
    const def = consume(result);
    expect(def.boundsMetres).toEqual({ min: [2, 2, -4.5], max: [4, 3.5, -3.5] });
    expect(def.collision).toEqual({ intent: 'none' });
    expect(def.visual.member).toBe('props/visual-only.glb');
  });

  it.each(['degenerate-hull', 'external-uri', 'mirrored-transform'] as const)('preserves the real %s preflight refusal and emits no member', async stem => {
    const f = fixture(stem);
    const baseline = preflightOriginalGlb(f.glb, f.authoring, f.context);
    expect(baseline.ok).toBe(false);
    if (baseline.ok) throw new Error('invalid committed fixture unexpectedly passed source preflight');
    const result = await refusal(prepareAssetMember(f.glb, f.authoring, f.context));
    expect(result.report).toEqual(baseline.report);
  });

  it('preserves malformed-container refusal rather than hashing or emitting a partial definition', async () => {
    const f = fixture(); f.glb[0] = 0;
    await refusal(prepareAssetMember(f.glb, f.authoring, f.context), 'local.glb.GLB_CONTAINER');
  });

  it('refuses missing collision rather than treating render bounds as solidity', async () => {
    const f = fixture(); const { collision: _collision, ...authoring } = f.authoring;
    await refusal(prepareAssetMember(f.glb, authoring, f.context), 'local.glb.COLLISION_MISSING');
  });

  it('preserves a disagreement between actual GLB hierarchy and the sidecar frame as a refusal', async () => {
    const f = fixture();
    const authoring = { ...f.authoring, nodeMatrixColumnMajor: [...IDENTITY.slice(0, 12), 3, 0, 0, 1] };
    await refusal(prepareAssetMember(f.glb, authoring, f.context), 'local.glb.SOURCE_FRAME_MISMATCH');
  });

  it.each([['centimetre', '+Y'], ['metre', '+Z']] as const)('refuses source units/up %s/%s rather than falsely labelling the unchanged visual metre/+Y', async (unit, up) => {
    const f = fixture();
    await refusal(prepareAssetMember(f.glb, { ...f.authoring, unit, up }, f.context), unit === 'metre' ? 'local.glb.SOURCE_UP' : 'local.glb.SOURCE_UNIT');
  });

  it.each(['', 'has space', '../escape', '/absolute', 'a/b', 'http:asset', 'escaped%id', 'a'.repeat(65)])('refuses invalid asset ID %j using the existing content-ID contract', async assetId => {
    // CONTENT_ASSET_ID is 1..64 ASCII letters/digits/underscore/dot/hyphen (creator-contracts/content.ts).
    const f = fixture();
    await refusal(prepareAssetMember(f.glb, f.authoring, { ...f.context, assetId }), ASSET_CODES.refInvalid);
  });

  it.each(['.', '..', '.hidden'])('refuses unsafe generated definition path for otherwise character-valid ID %j', async assetId => {
    const f = fixture();
    await refusal(prepareAssetMember(f.glb, f.authoring, { ...f.context, assetId }), PACK_CODES.pathInvalid);
  });

  it.each(['../source.glb', '/source.glb', 'https://example.invalid/source.glb', 'C:/source.glb'])('preserves unsafe approved source path %j refusal', async glbMember => {
    const f = fixture();
    await refusal(prepareAssetMember(f.glb, f.authoring, { ...f.context, glbMember }), 'local.glb.MEMBER_PATH');
  });

  it('refuses an original GLB member missing from the approved collection', async () => {
    const f = fixture();
    await refusal(prepareAssetMember(f.glb, f.authoring, { ...f.context, members: [] }), 'local.glb.GLB_MEMBER_MISSING');
  });

  it('refuses valid GLB bytes owned under a safe non-GLB member suffix instead of emitting an unreadable visual reference', async () => {
    const f = fixture();
    const glbMember = 'models/source.bin';
    const ctx = { assetId: 'crate', glbMember, members: [{ member: glbMember, bytes: f.glb }] };
    // Source geometry admission does not enforce the published AssetDefinition visual.member extension.
    expect(preflightOriginalGlb(f.glb, f.authoring, ctx).ok).toBe(true);
    await refusal(prepareAssetMember(f.glb, f.authoring, ctx), ASSET_CODES.visualFormat);
  });

  it('refuses passed GLB bytes that disagree with the member owning the declared path', async () => {
    const f = fixture(); const other = fixture('visual-only');
    await refusal(prepareAssetMember(f.glb, f.authoring, { ...f.context, members: [{ member: f.context.glbMember, bytes: other.glb }] }), 'local.glb.GLB_MEMBER_MISMATCH');
  });

  it.each(['props/solid.glb', 'PROPS/SOLID.GLB'])('refuses duplicate approved-member alias %s rather than picking one', async member => {
    const f = fixture();
    await refusal(prepareAssetMember(f.glb, f.authoring, { ...f.context, members: [...f.context.members, { member, bytes: f.glb.slice() }] }), 'local.glb.MEMBER_PATH');
  });

  it.each(['assets/crate.json', 'ASSETS/CRATE.JSON'])('refuses output path collision with existing member %s even if its bytes look reusable', async member => {
    const f = fixture();
    const existing = new TextEncoder().encode('{}');
    const ctx = { ...f.context, members: [...f.context.members, { member, bytes: existing }] };
    const before = structuredClone(ctx);
    await refusal(prepareAssetMember(f.glb, f.authoring, ctx), PACK_CODES.pathCollision);
    expect(ctx).toEqual(before);
  });

  it('accepts the published maximum face size and round-trips it through the engine reader', async () => {
    const hull = prism(ASSET_FACE_POINTS_MAX); const glb = prismGlb(hull);
    const authoring: OriginalGlbAuthoringSource = { unit: 'metre', up: '+Y', transformsBaked: true, nodeMatrixColumnMajor: IDENTITY, collision: { intent: 'convex', hulls: [hull] } };
    const result = await success(prepareAssetMember(glb, authoring, context(glb)));
    expect(bakedHulls(consume(result))[0]!.faces[0]).toHaveLength(ASSET_FACE_POINTS_MAX);
  });

  it('refuses a preflight-valid face beyond the engine bound before emitting an unreadable asset member', async () => {
    const hull = prism(ASSET_FACE_POINTS_MAX + 1); const glb = prismGlb(hull);
    const authoring: OriginalGlbAuthoringSource = { unit: 'metre', up: '+Y', transformsBaked: true, nodeMatrixColumnMajor: IDENTITY, collision: { intent: 'convex', hulls: [hull] } };
    expect(preflightOriginalGlb(glb, authoring, context(glb)).ok).toBe(true);
    await refusal(prepareAssetMember(glb, authoring, context(glb)), ASSET_CODES.collisionFacePoints);
  });

  it('hashes exactly an offset Uint8Array view rather than prefix/suffix bytes in its backing allocation', async () => {
    const f = fixture(); const backing = new Uint8Array(f.glb.length + 20).fill(0xa5);
    backing.set(f.glb, 7); const view = backing.subarray(7, 7 + f.glb.length);
    const result = await success(prepareAssetMember(view, f.authoring, context(view)));
    const def = consume(result);
    expect(def.provenance.sha256).toBe(sha256(f.glb));
    expect(def.provenance.sha256).not.toBe(sha256(backing));
  });

  it('emits deterministic JSON without depending on approved-member order or adding runtime reference fields', async () => {
    const f = fixture();
    const members = [...f.context.members, { member: 'notes.txt', bytes: new Uint8Array([1, 2, 3]) }];
    const first = await success(prepareAssetMember(f.glb, f.authoring, { ...f.context, members }));
    const second = await success(prepareAssetMember(f.glb, f.authoring, { ...f.context, members: [...members].reverse() }));
    expect(first.member).toEqual(second.member);
    expect(canonicalJson(json(first))).toBe(canonicalJson(json(second)));
    expect(Object.keys(json(first)).sort()).toEqual(['schema', 'version', 'assetId', 'kind', 'units', 'up', 'transformsBaked', 'visual', 'boundsMetres', 'collision', 'source'].sort());
  });

  it('keeps caller inputs unchanged and returns independent output byte ownership across calls', async () => {
    const f = fixture(); const before = structuredClone(f);
    const first = await success(prepareAssetMember(f.glb, f.authoring, f.context));
    const second = await success(prepareAssetMember(f.glb, f.authoring, f.context));
    const secondBytes = second.member.bytes.slice();
    expect(f).toEqual(before);
    first.member.bytes.fill(0);
    expect(second.member.bytes).toEqual(secondBytes);
    expect(f).toEqual(before);
  });

  it('snapshots source bytes and hulls before the asynchronous digest can observe caller mutations', async () => {
    const f = fixture(); const glbBefore = f.glb.slice();
    const work = prepareAssetMember(f.glb, f.authoring, f.context);
    f.glb.fill(0);
    // Deliberately mutate the caller's backing data despite the readonly TypeScript view.
    (f.authoring.collision!.hulls[0]!.vertices[0] as unknown as number[])[0] = 123;
    const result = await success(work);
    const def = consume(result);
    expect(def.provenance.sha256).toBe(sha256(glbBefore));
    expect(bakedHulls(def)[0]!.vertices[0]).toEqual([-1, 0, -0.5]);
  });
});
