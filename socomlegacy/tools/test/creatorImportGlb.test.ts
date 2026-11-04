import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { PACK_BYTES_ADAPTATION, PACK_FILES_ADAPTATION } from '@s2u/creator-contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER, FLOAT, GlbWriter, UNSIGNED_SHORT, type Json } from '../gltf';
import { encodePng } from '../png';
import { GLB_PREPARED_BYTES_ADAPTATION, GLB_JSON_BYTES_ADAPTATION, GLB_CHECK_BUDGET_ADAPTATION } from '../creator-import/src/limits';
import { preflightOriginalPropSidecar } from '../creator-import/src/propSidecar';
import {
  preflightOriginalGlb, type OriginalGlbAuthoringSource, type OriginalGlbMemberContext,
  type OriginalGlbPreparedSource, type SourcePoint,
} from '../creator-import/src/originalGlb';

/**
 * FCW-09 TEST-FIRST PREPARATION, original-authored adaptation inputs, no disc payload.
 * Retained assertion RED on b92f9b77f preceded implementation; renderer/engine acceptance remains separate.
 * Future runs: codex-seatrun.sh, ONE file per invocation, only after root grants the window, dependencies and
 * allowlist entry. No direct Vitest, worker override or multi-file invocation is authorized for this batch.
 * No fixture/pack schema, Blender export, render acceptance, engine-unit conversion or solidity is certified here.
 */
const BOX: SourcePoint[] = [
  [-1, 0, -0.5], [1, 0, -0.5], [1, 0, 0.5], [-1, 0, 0.5],
  [-1, 1.5, -0.5], [1, 1.5, -0.5], [1, 1.5, 0.5], [-1, 1.5, 0.5],
];
const FACES = [[0, 1, 2, 3], [4, 7, 6, 5], [3, 2, 6, 7], [0, 4, 5, 1], [0, 3, 7, 4], [1, 5, 6, 2]];
const TRIANGLES = FACES.flatMap(([a, b, c, d]) => [a!, b!, c!, a!, c!, d!]);
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function source(): OriginalGlbAuthoringSource {
  return {
    unit: 'metre', up: '+Y', transformsBaked: true, nodeMatrixColumnMajor: [...IDENTITY],
    collision: { intent: 'convex', hulls: [{ vertices: BOX.map(p => [...p] as SourcePoint), faces: FACES.map(f => [...f]) }] },
  };
}

/** A single indexed, used box primitive. Mutation runs before serialization to target real GLB fields. */
function boxGlb(change: (writer: GlbWriter) => void = () => {}): Uint8Array {
  const writer = new GlbWriter('redotcom FCW-09 synthetic test input; original-authored');
  const positions = new Float32Array(BOX.flat());
  const indices = new Uint16Array(TRIANGLES);
  const p = writer.addAccessor(writer.addBufferView(new Uint8Array(positions.buffer), ARRAY_BUFFER), FLOAT, BOX.length, 'VEC3',
    { min: [-1, 0, -0.5], max: [1, 1.5, 0.5] });
  const i = writer.addAccessor(writer.addBufferView(new Uint8Array(indices.buffer), ELEMENT_ARRAY_BUFFER), UNSIGNED_SHORT, indices.length, 'SCALAR');
  writer.materials.push({ name: 'original test material', pbrMetallicRoughness: { baseColorFactor: [1, 0.25, 0, 1] } });
  writer.meshes.push({ primitives: [{ attributes: { POSITION: p }, indices: i, material: 0, mode: 4 }] });
  writer.nodes.push({ name: 'original test box', mesh: 0 });
  writer.roots.push(0);
  change(writer);
  return writer.finish();
}

/** This is only the subset this synthetic JSON mutation helper edits, not a proposed import/pack schema. */
interface SyntheticJson {
  [key: string]: unknown;
  buffers: { byteLength: number; uri?: string }[];
  materials: { pbrMetallicRoughness: Json }[];
  images?: Json[];
  textures?: Json[];
}

/** Test-only corruption helper: keep BIN bytes intact while changing JSON, including buffer declarations. */
function rewriteJson(bytes: Uint8Array, change: (doc: SyntheticJson) => void): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const doc = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as SyntheticJson;
  change(doc);
  const json = new TextEncoder().encode(JSON.stringify(doc));
  const paddedLength = Math.ceil(json.length / 4) * 4;
  const remainder = bytes.subarray(20 + jsonLength);
  const out = new Uint8Array(20 + paddedLength + remainder.length);
  out.set(bytes.subarray(0, 20));
  out.fill(0x20, 20, 20 + paddedLength);
  out.set(json, 20);
  out.set(remainder, 20 + paddedLength);
  const dv = new DataView(out.buffer);
  dv.setUint32(8, out.length, true);
  dv.setUint32(12, paddedLength, true);
  return out;
}

function prepared(bytes: Uint8Array, authoring = source(), members?: OriginalGlbMemberContext): OriginalGlbPreparedSource {
  const result = preflightOriginalGlb(bytes, authoring, members);
  // First required assertion RED: the PREPARATION_ONLY seam cannot accept the valid solid source.
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.diagnostics.map(d => d.code).join(', '));
  return result.prepared;
}

function refused(bytes: Uint8Array, code: string, authoring = source(), members?: OriginalGlbMemberContext): void {
  const result = preflightOriginalGlb(bytes, authoring, members);
  expect(result.ok).toBe(false);
  expect(result).not.toHaveProperty('prepared');
  if (result.ok) throw new Error('invalid input produced prepared output');
  expect(result.diagnostics.map(d => d.code)).toContain(code);
}

/** Fully used texture dependency with actual UVs; PNG bytes are generated from one original-authored orange pixel. */
function texturedBoxGlb(uri: string): Uint8Array {
  const bytes = boxGlb(w => {
    const uv = new Float32Array(BOX.flatMap(([x, _y, z]) => [(x + 1) / 2, z + 0.5]));
    const texcoord = w.addAccessor(w.addBufferView(new Uint8Array(uv.buffer), ARRAY_BUFFER), FLOAT, BOX.length, 'VEC2');
    w.meshes[0]!['primitives'] = [{ attributes: { POSITION: 0, TEXCOORD_0: texcoord }, indices: 1, material: 0, mode: 4 }];
  });
  return rewriteJson(bytes, doc => {
    doc.images = [{ uri }];
    doc.textures = [{ source: 0 }];
    doc.materials[0]!.pbrMetallicRoughness['baseColorTexture'] = { index: 0 };
  });
}

function orangePng(): Uint8Array { return encodePng(1, 1, new Uint8Array([255, 128, 0, 255])); }

function repeatedGeometry(instances: number, vertexCount = 1024): Uint8Array {
  const writer = new GlbWriter('original-authored expansion boundary fixture');
  const positions = new Float32Array(vertexCount*3);
  for (let at = 0; at < vertexCount; at++) positions.set(BOX[at % BOX.length]!,at*3);
  const indices = new Uint16Array(TRIANGLES);
  const p = writer.addAccessor(writer.addBufferView(new Uint8Array(positions.buffer), ARRAY_BUFFER), FLOAT, vertexCount, 'VEC3');
  const i = writer.addAccessor(writer.addBufferView(new Uint8Array(indices.buffer), ELEMENT_ARRAY_BUFFER), UNSIGNED_SHORT, indices.length,'SCALAR');
  writer.meshes.push({ primitives: [{ attributes: { POSITION: p }, indices: i }] });
  for (let at = 0; at < instances; at++) { writer.nodes.push({ mesh: 0 }); writer.roots.push(at); }
  return writer.finish();
}

/** Context ownership has no filesystem/network resolver: only the supplied collection may supply bytes. */
function refusedMemberContext(bytes: Uint8Array, context: OriginalGlbMemberContext, code: string): void {
  const before = structuredClone(context);
  const fetch = vi.fn(() => { throw new Error('invalid ownership/path must not trigger fetch'); });
  vi.stubGlobal('fetch', fetch);
  refused(bytes, code, source(), context);
  expect(context).toEqual(before);
  expect(fetch).not.toHaveBeenCalled();
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('original GLB source preflight (provisional tool seam)', () => {
  it('accepts the exact 2 x 1.5 x 1 metre indexed solid source and preserves input provenance bytes separately', () => {
    const bytes = boxGlb();
    const authoring = source();
    const before = bytes.slice();
    const declaredBefore = structuredClone(authoring);
    const result = prepared(bytes, authoring);
    expect(result.baked.unit).toBe('metre');
    expect(result.baked.up).toBe('+Y');
    expect(result.baked.transformsBaked).toBe(true);
    expect(result.baked.boundsMetres).toEqual({ min: [-1, 0, -0.5], max: [1, 1.5, 0.5] });
    expect(result.baked.primitives).toEqual([{ positionsMetres: BOX, indices: TRIANGLES }]);
    expect(result.baked.collision).toEqual({ kind: 'convex', hulls: authoring.collision!.hulls });
    expect(result.source.originalGlb).toEqual(before);
    expect(bytes).toEqual(before);
    expect(authoring).toEqual(declaredBefore);
  });

  it('reads only a byte-offset Uint8Array view, excluding prefix/suffix garbage', () => {
    const bytes = boxGlb();
    const backing = new Uint8Array(bytes.length + 18).fill(0xa5);
    backing.set(bytes, 7); // Unaligned backing offset must not be confused with a GLB/accessor offset.
    const view = backing.subarray(7, 7 + bytes.length);
    const before = backing.slice();
    const result = prepared(view);
    expect(result.baked.primitives[0]!.positionsMetres).toEqual(BOX);
    expect(result.source.originalGlb).toEqual(bytes);
    expect(backing).toEqual(before);
  });

  it('owns retained provenance when Node Buffer input and its backing storage are later mutated', () => {
    const original = boxGlb();
    const backing = Buffer.alloc(original.length+18,0xa5);
    backing.set(original,7);
    const input = backing.subarray(7,7+original.length);
    const result = prepared(input);
    backing.fill(0);
    expect(result.source.originalGlb).toEqual(original);
    expect(result.source.originalGlb.constructor).toBe(Uint8Array);
  });

  it.each([
    ['magic', 0, 0], ['version', 4, 1], ['total length shorter', 8, 12],
    ['total length longer', 8, 0xffff_ffff], ['first chunk type', 16, 0x004e4942],
    ['JSON chunk overrun', 12, 0xffff_fffc], ['unaligned JSON chunk', 12, 5],
  ] as const)('refuses malformed GLB %s without a partial result', (_name, offset, value) => {
    const bytes = boxGlb();
    new DataView(bytes.buffer).setUint32(offset, value, true);
    refused(bytes, 'GLB_CONTAINER');
  });

  it.each([0, 4, 11, 12, 19])('refuses a header/chunk header truncated to %i bytes', length => {
    refused(boxGlb().subarray(0, length), 'GLB_CONTAINER');
  });

  it('refuses a BIN chunk whose declared length overruns its actual bytes', () => {
    const bytes = boxGlb();
    const dv = new DataView(bytes.buffer);
    const bin = 20 + dv.getUint32(12, true);
    dv.setUint32(bin, dv.getUint32(bin, true) + 4, true);
    refused(bytes, 'GLB_CONTAINER');
  });

  it('refuses a truncated BIN payload even if the top-level length is rewritten to match', () => {
    const bytes = boxGlb().slice(0, -4);
    new DataView(bytes.buffer).setUint32(8, bytes.length, true);
    refused(bytes, 'GLB_CONTAINER');
  });

  it('refuses malformed JSON in an otherwise intact GLB container', () => {
    const bytes = boxGlb();
    bytes[20] = 0x21; // JSON begins with !, while all declared container lengths remain intact.
    refused(bytes, 'GLB_JSON');
  });

  it('refuses an unaligned BIN chunk even when total length matches the supplied view', () => {
    const complete = boxGlb();
    const bytes = complete.slice(0, -1);
    const dv = new DataView(bytes.buffer);
    const bin = 20 + dv.getUint32(12, true);
    dv.setUint32(8, bytes.length, true);
    dv.setUint32(bin, dv.getUint32(bin, true) - 1, true);
    refused(bytes, 'GLB_CONTAINER');
  });

  it.each([
    ['count beyond bufferView', (w: GlbWriter) => { w.accessors[0]!['count'] = BOX.length + 1; }],
    ['misaligned accessor', (w: GlbWriter) => { w.accessors[0]!['byteOffset'] = 1; }],
    ['missing bufferView', (w: GlbWriter) => { w.accessors[0]!['bufferView'] = 12; }],
    ['negative accessor offset', (w: GlbWriter) => { w.accessors[0]!['byteOffset'] = -4; }],
    ['fractional count', (w: GlbWriter) => { w.accessors[0]!['count'] = 1.5; }],
    ['view overrun', (w: GlbWriter) => { w.bufferViews[0]!['byteOffset'] = 0xffff_fffc; }],
    ['stride shorter than VEC3', (w: GlbWriter) => { w.bufferViews[0]!['byteStride'] = 4; }],
  ] satisfies [string, (writer: GlbWriter) => void][])('refuses accessor bounds/alignment: %s', (_name, change) => {
    refused(boxGlb(change), 'GLB_ACCESSOR');
  });

  it('refuses a declared buffer shorter than a used view', () => {
    const bytes = rewriteJson(boxGlb(), doc => { doc.buffers[0]!.byteLength = 4; });
    refused(bytes, 'GLB_ACCESSOR');
  });

  it('refuses byteStride outside the glTF 4..252 byte range even for a one-element accessor', () => {
    const bytes = boxGlb(w => {
      w.accessors[0]!['count'] = 1;
      w.bufferViews[0]!['byteStride'] = 256;
    });
    refused(bytes, 'GLB_ACCESSOR');
  });

  it('refuses a normalized POSITION accessor even when its flag is a malformed truthy value', () => {
    refused(boxGlb(w => { w.accessors[0]!['normalized'] = 'true'; }), 'GLB_ACCESSOR');
  });

  it('refuses unsupported mesh-level morph weights instead of silently dropping them', () => {
    refused(boxGlb(w => { w.meshes[0]!['weights'] = [0.5]; }), 'GLB_UNSUPPORTED');
  });

  it.each([
    ['Draco required', 'KHR_draco_mesh_compression', (doc: SyntheticJson) => { doc.extensionsRequired = ['KHR_draco_mesh_compression']; }],
    ['Draco optional payload', 'KHR_draco_mesh_compression', (doc: SyntheticJson) => {
      const primitive = ((doc.meshes as Json[])[0]!.primitives as Json[])[0]!;
      primitive.extensions = { KHR_draco_mesh_compression: { bufferView: 0, attributes: { POSITION: 0 } } };
    }],
    ['meshopt required', 'EXT_meshopt_compression', (doc: SyntheticJson) => { doc.extensionsRequired = ['EXT_meshopt_compression']; }],
    ['meshopt optional payload', 'EXT_meshopt_compression', (doc: SyntheticJson) => {
      (doc.bufferViews as Json[])[0]!.extensions = { EXT_meshopt_compression: { buffer: 0, byteOffset: 0, byteLength: 96, byteStride: 12, count: 8, mode: 'ATTRIBUTES' } };
    }],
    ['meshopt without fallback bytes', 'EXT_meshopt_compression', (doc: SyntheticJson) => {
      doc.buffers.push({ byteLength: 96 });
      (doc.bufferViews as Json[])[0]!.buffer = 1;
      (doc.bufferViews as Json[])[0]!.extensions = { EXT_meshopt_compression: { buffer: 0, byteOffset: 0, byteLength: 96, byteStride: 12, count: 8, mode: 'ATTRIBUTES' } };
    }],
    ['KTX2 required', 'KHR_texture_basisu', (doc: SyntheticJson) => { doc.extensionsRequired = ['KHR_texture_basisu']; }],
    ['KTX2 optional payload', 'KHR_texture_basisu', (doc: SyntheticJson) => {
      doc.textures = [{ extensions: { KHR_texture_basisu: { source: 0 } } }];
    }],
    ['node instancing', 'EXT_mesh_gpu_instancing', (doc: SyntheticJson) => {
      (doc.nodes as Json[])[0]!.extensions = { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: 0 } } };
    }],
    ['unknown required extension', 'VENDOR_required_fixture', (doc: SyntheticJson) => { doc.extensionsRequired = ['VENDOR_required_fixture']; }],
  ] satisfies [string,string,(doc: SyntheticJson) => void][])('refuses %s by extension name before reading unsupported payloads', (_name, extension, change) => {
    const bytes = rewriteJson(boxGlb(),change);
    const before = bytes.slice();
    const result = preflightOriginalGlb(bytes,source());
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('prepared');
    if (result.ok) throw new Error('unsupported extension silently lost authored content');
    expect(result.diagnostics[0]!.code).toBe('GLB_EXTENSION_UNSUPPORTED');
    expect(result.diagnostics[0]!.message).toContain(extension);
    expect(bytes).toEqual(before);
  });

  it.each(['animations','skins'] as const)('refuses declared %s as unsupported static-source semantics', key => {
    refused(rewriteJson(boxGlb(),doc => { doc[key] = [{}]; }),'GLB_UNSUPPORTED');
  });

  it('refuses a skin attached to a used node even without a top-level skins list', () => {
    refused(boxGlb(w => { w.nodes[0]!.skin = 0; }),'GLB_UNSUPPORTED');
  });

  it('refuses matrix and TRS authored together instead of choosing a transform silently', () => {
    refused(boxGlb(w => { w.nodes[0]!.matrix = [...IDENTITY]; w.nodes[0]!.translation = [1,0,0]; }),'GLB_TRANSFORM');
  });

  it('refuses a non-unit source quaternion rather than normalizing author intent', () => {
    refused(boxGlb(w => { w.nodes[0]!.rotation = [0,0,0,2]; }),'GLB_TRANSFORM');
  });

  it('refuses a shared non-cyclic node instead of baking it once and dropping another instance', () => {
    refused(boxGlb(w => { w.nodes.push({ children: [0] }); w.roots.push(1); }),'GLB_NODE');
  });

  it.each([NaN, Infinity, -Infinity])('refuses nonfinite used POSITION %s despite finite declared min/max', value => {
    const bytes = boxGlb();
    const dv = new DataView(bytes.buffer);
    const binData = 20 + dv.getUint32(12, true) + 8;
    dv.setFloat32(binData, value, true);
    refused(bytes, 'GLB_POSITION');
  });

  it('measures real positions instead of trusting stale accessor bounds', () => {
    const bytes = boxGlb(w => { w.accessors[0]!['min'] = [0, 0, 0]; w.accessors[0]!['max'] = [0, 0, 0]; });
    expect(prepared(bytes).baked.boundsMetres).toEqual({ min: [-1, 0, -0.5], max: [1, 1.5, 0.5] });
  });

  it('refuses a used triangle index outside the POSITION accessor', () => {
    const bytes = boxGlb();
    const dv = new DataView(bytes.buffer);
    const binData = 20 + dv.getUint32(12, true) + 8;
    dv.setUint16(binData + BOX.length * 3 * Float32Array.BYTES_PER_ELEMENT, BOX.length, true);
    refused(bytes, 'GLB_INDEX');
  });

  it('refuses an index accessor that does not contain complete triangles', () => {
    refused(boxGlb(w => { w.accessors[1]!['count'] = TRIANGLES.length - 1; }), 'GLB_INDEX');
  });

  it.each([
    'https://example.invalid/used', 'http://example.invalid/used',
    'file:///must-not-open-fcw09', 'blob:fcw09-not-a-file',
    '/absolute/member', '../outside/member', 'textures/../../outside/member',
  ])('refuses USED buffer and image URI %s without network/file preflight', uri => {
    const fetch = vi.fn(() => { throw new Error('preflight must never fetch'); });
    vi.stubGlobal('fetch', fetch);
    refused(rewriteJson(boxGlb(), doc => { doc.buffers[0]!.uri = uri; }), 'EXTERNAL_URI');
    refused(texturedBoxGlb(uri), 'EXTERNAL_URI');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses even an in-pack relative buffer URI: buffer sources are BIN or data only', () => {
    const bytes = rewriteJson(boxGlb(), doc => { doc.buffers[0]!.uri = 'geometry.bin'; });
    refused(bytes, 'EXTERNAL_URI', source(), {
      glbMember: 'box.glb', members: [{ member: 'box.glb', bytes }, { member: 'geometry.bin', bytes: new Uint8Array(4) }],
    });
  });

  it('accepts a data buffer without fetching, preserving the exact original GLB', () => {
    const original = boxGlb();
    const jsonEnd = 20 + new DataView(original.buffer).getUint32(12, true);
    const binary = original.subarray(jsonEnd + 8);
    const withData = rewriteJson(original, doc => {
      doc.buffers[0]!.uri = `data:application/octet-stream;base64,${Buffer.from(binary).toString('base64')}`;
    });
    const end = 20 + new DataView(withData.buffer).getUint32(12, true);
    const bytes = withData.slice(0, end); // JSON-only GLB, geometry now resides in its declared data URI.
    new DataView(bytes.buffer).setUint32(8, bytes.length, true);
    const fetch = vi.fn(() => { throw new Error('data buffers require no fetch'); });
    vi.stubGlobal('fetch', fetch);
    const result = prepared(bytes);
    expect(result.baked.primitives[0]!.positionsMetres).toEqual(BOX);
    expect(result.source.originalGlb).toEqual(bytes);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('accepts a used data image without fetching or changing the visual source bytes', () => {
    const uri = `data:image/png;base64,${Buffer.from(orangePng()).toString('base64')}`;
    const bytes = texturedBoxGlb(uri);
    const fetch = vi.fn(() => { throw new Error('data images require no fetch'); });
    vi.stubGlobal('fetch', fetch);
    expect(prepared(bytes).source.originalGlb).toEqual(bytes);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    'data:image/png;base64,%%%=', 'data:image/png;base64,A===', 'data:image/svg+xml;base64,AAAA',
  ])('refuses malformed or unsupported data-image URI %s precisely', uri => {
    refused(texturedBoxGlb(uri),'GLB_RESOURCE');
  });

  it('refuses malformed data-buffer base64 before using its decoded geometry', () => {
    refused(rewriteJson(boxGlb(),doc => { doc.buffers[0]!.uri = 'data:application/octet-stream;base64,A==='; }),'GLB_RESOURCE');
  });

  it('refuses unsupported embedded image MIME without inspecting or fetching a codec payload', () => {
    refused(rewriteJson(boxGlb(),doc => { doc.images = [{ bufferView: 0, mimeType: 'image/gif' }]; }),'GLB_RESOURCE');
  });

  it('resolves a used normalized relative image only from approved in-memory pack members', () => {
    const bytes = texturedBoxGlb('textures/marker.png');
    const image = orangePng();
    const members: OriginalGlbMemberContext = {
      glbMember: 'props/box.glb', members: [{ member: 'props/box.glb', bytes }, { member: 'props/textures/marker.png', bytes: image }],
    };
    const before = structuredClone(members);
    const fetch = vi.fn(() => { throw new Error('pack members require no fetch'); });
    vi.stubGlobal('fetch', fetch);
    expect(prepared(bytes, source(), members).source.originalGlb).toEqual(bytes);
    expect(members).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a missing relative image member without probing disk or the network', () => {
    const bytes = texturedBoxGlb('textures/missing.png');
    const fetch = vi.fn(() => { throw new Error('missing pack members must not trigger fetch'); });
    vi.stubGlobal('fetch', fetch);
    refused(bytes, 'GLB_MEMBER_MISSING', source(), { glbMember: 'props/box.glb', members: [{ member: 'props/box.glb', bytes }] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a supplied context without glbMember instead of treating the input as an unowned standalone GLB', () => {
    const bytes = boxGlb();
    // Deliberately malformed runtime context; the provisional TypeScript declaration is not validation.
    const context = { members: [{ member: 'props/box.glb', bytes }] } as unknown as OriginalGlbMemberContext;
    refusedMemberContext(bytes, context, 'GLB_MEMBER_MISSING');
  });

  it('refuses a declared glbMember absent from the approved collection without looking elsewhere', () => {
    const bytes = boxGlb();
    refusedMemberContext(bytes, {
      glbMember: 'props/missing.glb', members: [{ member: 'props/box.glb', bytes }],
    }, 'GLB_MEMBER_MISSING');
  });

  it('refuses when the declared GLB member owns different bytes even if both GLBs are independently well formed', () => {
    const bytes = boxGlb();
    const different = boxGlb(w => { w.nodes[0]!['name'] = 'different original source with the same geometry'; });
    refusedMemberContext(bytes, {
      glbMember: 'props/box.glb', members: [{ member: 'props/box.glb', bytes: different }],
    }, 'GLB_MEMBER_MISMATCH');
  });

  it.each([
    '', '..', '../outside.glb', 'props/../box.glb', '/absolute/box.glb',
    'https://example.invalid/box.glb', 'file:///outside.glb', 'blob:outside', 'C:/outside.glb',
  ])('refuses independently unsafe glbMember %j even when every collection member is safe', glbMember => {
    const bytes = boxGlb();
    refusedMemberContext(bytes, {
      glbMember, members: [{ member: 'props/box.glb', bytes }],
    }, 'MEMBER_PATH');
  });

  it.each([
    '', '..', '../outside.png', 'props/../outside.png', '/absolute/outside.png',
    'https://example.invalid/outside.png', 'file:///outside.png', 'blob:outside', 'C:/outside.png',
  ])('refuses independently unsafe collection member %j despite a safe, correctly owned GLB member', member => {
    const bytes = boxGlb();
    refusedMemberContext(bytes, {
      glbMember: 'props/box.glb', members: [{ member: 'props/box.glb', bytes }, { member, bytes: orangePng() }],
    }, 'MEMBER_PATH');
  });

  it('refuses duplicate or normalization-alias members instead of choosing one silently', () => {
    const bytes = texturedBoxGlb('textures/marker.png');
    const image = orangePng();
    for (const alias of ['props/textures/marker.png', 'props/textures/./marker.png']) {
      refused(bytes, 'MEMBER_PATH', source(), {
        glbMember: 'props/box.glb', members: [
          { member: 'props/box.glb', bytes }, { member: 'props/textures/marker.png', bytes: image }, { member: alias, bytes: image.slice() },
        ],
      });
    }
  });

  it('performs no fetch even for a valid embedded source', () => {
    const fetch = vi.fn(() => { throw new Error('preflight must never fetch'); });
    vi.stubGlobal('fetch', fetch);
    prepared(boxGlb());
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses unsupported extras.pivot instead of stripping or reinterpreting the authored visual', () => {
    const bytes = boxGlb(w => { w.nodes[0]!['extras'] = { pivot: [1, 2, 3] }; });
    const before = bytes.slice();
    refused(bytes, 'GLB_PIVOT_UNSUPPORTED');
    expect(bytes).toEqual(before);
  });

  it.each([
    {
      name: 'nonuniform scale', node: { scale: [1, 2, 1] },
      matrix: [1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      points: BOX.map(([x, y, z]) => [x, y * 2, z] as SourcePoint), min: [-1, 0, -0.5], max: [1, 3, 0.5],
    },
    {
      name: 'uniform scale', node: { scale: [2, 2, 2] },
      matrix: [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1],
      points: BOX.map(([x, y, z]) => [x * 2, y * 2, z * 2] as SourcePoint), min: [-2, 0, -1], max: [2, 3, 1],
    },
    {
      name: 'yaw rotation', node: { rotation: [0, 1, 0, 0] },
      matrix: [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1],
      points: BOX.map(([x, y, z]) => [-x, y, -z] as SourcePoint), min: [-1, 0, -0.5], max: [1, 1.5, 0.5],
    },
    {
      name: 'pitch rotation at import (placements remain yaw-only)', node: { rotation: [1, 0, 0, 0] },
      matrix: [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1],
      points: BOX.map(([x, y, z]) => [x, y === 0 ? 0 : -y, -z] as SourcePoint), min: [-1, -1.5, -0.5], max: [1, 0, 0.5],
    },
    {
      name: 'two negative scale axes with positive determinant', node: { scale: [-1, -1, 1] },
      matrix: [-1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      points: BOX.map(([x, y, z]) => [-x, y === 0 ? 0 : -y, z] as SourcePoint), min: [-1, -1.5, -0.5], max: [1, 0, 0.5],
    },
    {
      name: 'finite translation', node: { translation: [3, 2, -4] },
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 2, -4, 1],
      points: BOX.map(([x, y, z]) => [x + 3, y + 2, z - 4] as SourcePoint), min: [2, 2, -4.5], max: [4, 3.5, -3.5],
    },
  ])('bakes $name once into solid and visual-only geometry while retaining separate input provenance', testCase => {
    for (const kind of ['convex', 'none'] as const) {
      const bytes = boxGlb(w => { Object.assign(w.nodes[0]!, testCase.node); });
      const authoring: OriginalGlbAuthoringSource = {
        ...source(), transformsBaked: kind === 'convex', nodeMatrixColumnMajor: testCase.matrix,
        collision: { intent: kind, hulls: kind === 'convex' ? source().collision!.hulls : [] },
      };
      const before = bytes.slice();
      const authoringBefore = structuredClone(authoring);
      const result = prepared(bytes, authoring);
      expect(result.baked.transformsBaked).toBe(true);
      expect(result.baked.primitives).toEqual([{ positionsMetres: testCase.points, indices: TRIANGLES }]);
      expect(result.baked.boundsMetres).toEqual({ min: testCase.min, max: testCase.max });
      expect(result.baked.collision).toEqual(kind === 'convex'
        ? { kind: 'convex', hulls: [{ vertices: testCase.points, faces: FACES }] }
        : { kind: 'visual-only', hulls: [] });
      expect(result.source.originalGlb).toEqual(before); // Provenance, not a demand for unchanged baked render bytes.
      expect(bytes).toEqual(before);
      expect(authoring).toEqual(authoringBefore);
    }
  });

  it.each([
    ['scale', { scale: [-1, 1, 1] }], ['matrix', { matrix: [-1, ...IDENTITY.slice(1)] }],
  ] satisfies [string, Json][])('diagnoses a mirrored determinant from actual GLB %s separately', (_name, transform) => {
    refused(boxGlb(w => { Object.assign(w.nodes[0]!, transform); }), 'MIRRORED_TRANSFORM');
  });

  it('refuses an actual GLB matrix of the wrong length', () => {
    refused(boxGlb(w => { w.nodes[0]!['matrix'] = IDENTITY.slice(1); }), 'GLB_TRANSFORM');
  });

  it('checks an ancestor transform rather than only the mesh-bearing node', () => {
    const bytes = boxGlb(w => {
      w.nodes.push({ children: [0], scale: [-1, 1, 1] });
      w.roots.splice(0, 1, 1);
    });
    refused(bytes, 'MIRRORED_TRANSFORM');
  });

  it('bakes child scale before parent translation into both render and hull vertices, exactly once', () => {
    const bytes = boxGlb(w => {
      w.nodes[0]!['scale'] = [2, 1, 1];
      w.nodes.push({ children: [0], translation: [3, 0, 0] });
      w.roots.splice(0, 1, 1);
    });
    const authoring = { ...source(), transformsBaked: false, nodeMatrixColumnMajor: [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 0, 0, 1] };
    const points = BOX.map(([x, y, z]) => [x * 2 + 3, y, z] as SourcePoint);
    const result = prepared(bytes, authoring);
    expect(result.baked.primitives[0]!.positionsMetres).toEqual(points);
    expect(result.baked.boundsMetres).toEqual({ min: [1, 0, -0.5], max: [5, 1.5, 0.5] });
    expect(result.baked.collision).toEqual({ kind: 'convex', hulls: [{ vertices: points, faces: FACES }] });
    expect(result.baked.transformsBaked).toBe(true);
    expect(result.source.originalGlb).toEqual(bytes);
  });

  it('bakes every visual-only mesh frame independently and keeps exact original source provenance', () => {
    const bytes = boxGlb(w => { w.nodes.push({ mesh: 0, translation: [0,1,0] }); w.roots.push(1); });
    const authoring: OriginalGlbAuthoringSource = { ...source(), collision: { intent: 'none', hulls: [] } };
    const before = bytes.slice();
    const result = prepared(bytes,authoring);
    expect(result.baked.primitives).toEqual([
      { positionsMetres: BOX, indices: TRIANGLES },
      { positionsMetres: BOX.map(([x,y,z]) => [x,y+1,z]), indices: TRIANGLES },
    ]);
    expect(result.baked.boundsMetres).toEqual({ min: [-1,0,-0.5], max: [1,2.5,0.5] });
    expect(result.baked.collision).toEqual({ kind: 'visual-only', hulls: [] });
    expect(result.source.originalGlb).toEqual(before);
    expect(bytes).toEqual(before);
  });

  it('still refuses differing solid frames when a single-frame sidecar cannot bind their hulls', () => {
    refused(boxGlb(w => { w.nodes.push({ mesh: 0, translation: [0,1,0] }); w.roots.push(1); }),'SOURCE_FRAME_MISMATCH');
  });

  it('refuses a sidecar frame composed in the wrong order instead of baking solely from its declared matrix', () => {
    const bytes = boxGlb(w => {
      w.nodes[0]!['scale'] = [2, 1, 1];
      w.nodes.push({ children: [0], translation: [3, 0, 0] });
      w.roots.splice(0, 1, 1);
    });
    // Actual GLB hierarchy is parent translation * child scale: x -> 2*x + 3.
    // This valid finite sidecar instead claims child scale * parent translation: x -> 2*x + 6.
    // Proposed INTERNAL validation/code, pending canonical contract mapping: the GLB hierarchy is authoritative.
    const wrongFrame = { ...source(), transformsBaked: false, nodeMatrixColumnMajor: [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 6, 0, 0, 1] };
    const before = bytes.slice();
    const authoringBefore = structuredClone(wrongFrame);
    refused(bytes, 'SOURCE_FRAME_MISMATCH', wrongFrame);
    expect(bytes).toEqual(before);
    expect(wrongFrame).toEqual(authoringBefore);
  });

  it('refuses a negative determinant at any ancestor even when another mirror makes the final world determinant positive', () => {
    const bytes = boxGlb(w => {
      w.nodes[0]!['scale'] = [-1, 1, 1];
      w.nodes.push({ children: [0], scale: [-1, 1, 1] });
      w.roots.splice(0, 1, 1);
    });
    refused(bytes, 'MIRRORED_TRANSFORM');
  });

  it('refuses a cycle in the used node hierarchy rather than recursing indefinitely', () => {
    const bytes = boxGlb(w => {
      w.nodes[0]!['children'] = [1];
      w.nodes.push({ children: [0] });
    });
    refused(bytes, 'GLB_NODE');
  });

  it('refuses a used node hierarchy that references a missing child', () => {
    refused(boxGlb(w => { w.nodes[0]!['children'] = [99]; }), 'GLB_NODE');
  });

  it.each([NaN, Infinity, -Infinity])('rejects nonfinite node transform component %s (JSON null), not as identity defaults', value => {
    for (const node of [
      { matrix: [value, ...IDENTITY.slice(1)] }, { scale: [value, 1, 1] },
      { translation: [0, value, 0] }, { rotation: [0, 0, value, 1] },
    ]) {
      refused(boxGlb(w => { Object.assign(w.nodes[0]!, node); }), 'NONFINITE_TRANSFORM');
    }
  });

  it('refuses a later bad primitive without exposing an earlier prepared primitive or changing prior success', () => {
    const good = prepared(boxGlb());
    const prior = structuredClone(good);
    const bad = boxGlb(w => {
      w.meshes.push({ primitives: [{ attributes: { POSITION: 99 }, indices: 1 }] });
      w.nodes.push({ mesh: 1 });
      w.roots.push(1);
    });
    refused(bad, 'GLB_ACCESSOR');
    expect(good).toEqual(prior);
  });

  // Frozen importer policy is scoped to this new tool, not a rewrite of the existing generic viewer parser.
  it('bounds aggregate approved member bytes using distinct paths and one small shared readonly byte source', () => {
    const bytes = boxGlb();
    const member = new Uint8Array(1024*1024);
    const copies = Math.floor(PACK_BYTES_ADAPTATION/member.byteLength)+1;
    const entries = Array.from({ length: copies }, (_,i) => ({ member: `parts/${i}.bin`, bytes: member }));
    expect(entries.length+1).toBeLessThanOrEqual(PACK_FILES_ADAPTATION);
    refused(bytes,'SOURCE_BUDGET',source(),{ glbMember: 'box.glb', members: [{ member: 'box.glb',bytes },...entries] });
  });

  // SOURCE_BUDGET is implemented. The single-member real-size boundary case is separately prepared in
  // creatorImportSourceBudget.large.test.ts, explicitly blocked until a controller memory grant.
  it('reuses FCW-05 case/NFC member alias refusal without changing caller-owned bytes', () => {
    const bytes = boxGlb();
    for (const pair of [['props/Marker.png', 'props/marker.png'], ['props/caf\u00e9.png', 'props/cafe\u0301.png']]) {
      refusedMemberContext(bytes, { glbMember: 'box.glb', members: [
        { member: 'box.glb', bytes }, ...pair.map(member => ({ member, bytes: orangePng() })),
      ] }, 'MEMBER_PATH');
    }
  });
  it('accepts repeated geometry just below the prepared numeric byte cap and refuses the next full instance', () => {
    // Each instance emits 1024 float64 triples and 36 float64 index values; no JS-object heap claim.
    const perInstance = 1024 * 3 * 8 + TRIANGLES.length * 8;
    const under = Math.floor((GLB_PREPARED_BYTES_ADAPTATION - 6*8) / perInstance);
    expect(GLB_PREPARED_BYTES_ADAPTATION - 6*8 - under * perInstance).toBeLessThan(perInstance);
    const authoring: OriginalGlbAuthoringSource = { ...source(), collision: { intent: 'none', hulls: [] } };
    expect(prepared(repeatedGeometry(under),authoring).baked.primitives).toHaveLength(under);
    const result = preflightOriginalGlb(repeatedGeometry(under+1),authoring);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expanded geometry exceeded its tool budget');
    expect(result.diagnostics[0]!.code).toBe('PREPARED_TOO_LARGE');
    // The next POSITION reservation refuses before either its numeric output or its subsequent indices allocate.
    expect(result.diagnostics[0]!.message).toContain(String(6*8 + under*perInstance + 1024*3*8));
    expect(result.diagnostics[0]!.message).toContain(String(GLB_PREPARED_BYTES_ADAPTATION));
    expect(result.report.status).toBe('fail');
  });

  it('accepts JSON at the tool chunk cap and refuses a chunk one alignment unit above before parsing it', () => {
    const original = boxGlb();
    const jsonLength = new DataView(original.buffer).getUint32(12,true);
    const remainder = original.subarray(20+jsonLength);
    const padded = (length: number): Uint8Array => {
      const out = new Uint8Array(20+length+remainder.length);
      out.set(original.subarray(0,20)); out.fill(0x20,20,20+length);
      out.set(original.subarray(20,20+jsonLength),20); out.set(remainder,20+length);
      const dv = new DataView(out.buffer); dv.setUint32(8,out.length,true); dv.setUint32(12,length,true);
      return out;
    };
    prepared(padded(GLB_JSON_BYTES_ADAPTATION));
    const oversized = padded(GLB_JSON_BYTES_ADAPTATION+4);
    oversized[20] = 0x21; // Would be invalid JSON if decoding/parsing were reached.
    refused(oversized,'JSON_TOO_LARGE');
  });

  it('counts all six returned numeric bounds at the exact output boundary', () => {
    const authoring: OriginalGlbAuthoringSource = { ...source(), collision: { intent: 'none', hulls: [] } };
    const under = Math.floor((GLB_PREPARED_BYTES_ADAPTATION - 6*8 - TRIANGLES.length*8) / (3*8));
    const good = prepared(repeatedGeometry(1,under),authoring);
    expect((good.baked.primitives[0]!.positionsMetres.length*3 + good.baked.primitives[0]!.indices.length + 6)*8).toBeLessThanOrEqual(GLB_PREPARED_BYTES_ADAPTATION);
    refused(repeatedGeometry(1,under+1),'PREPARED_TOO_LARGE',authoring);
  });

  it('refuses sparse in-memory hull vertices without throwing or publishing partial output', () => {
    const hull = source().collision!.hulls[0]!;
    const vertices = hull.vertices.map(p => [...p] as SourcePoint);
    delete vertices[0];
    refused(boxGlb(),'COLLISION_COORDINATE',{ ...source(), collision: { intent: 'convex', hulls: [{ ...hull, vertices }] } });
  });

  it('refuses sparse in-memory hull indices without throwing or publishing partial output', () => {
    const hull = source().collision!.hulls[0]!;
    const faces = hull.faces.map(f => [...f]);
    delete faces[0]![1];
    refused(boxGlb(),'COLLISION_INDEX',{ ...source(), collision: { intent: 'convex', hulls: [{ ...hull, faces }] } });
  });

  it.each([-1e-13, 0, 1e-13])('refuses determinant %s as the decided degenerate transform and identifies its node', axis => {
    const result = preflightOriginalGlb(boxGlb(w => { w.nodes[0]!['scale'] = [axis,1,1]; }),source());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('collapsed transform was accepted');
    expect(result.diagnostics[0]!.code).toBe('DEGENERATE_TRANSFORM');
    expect(result.diagnostics[0]!.message).toContain('nodes[0]');
  });

  it('keeps a negative determinant exactly at the threshold classified as mirrored', () => {
    refused(boxGlb(w => { w.nodes[0]!['scale'] = [-1e-12,1,1]; }),'MIRRORED_TRANSFORM');
  });

  it('accepts a positive determinant exactly at the decided threshold for a visual-only source', () => {
    const authoring: OriginalGlbAuthoringSource = { ...source(), nodeMatrixColumnMajor: [1e-12,...IDENTITY.slice(1)], collision: { intent: 'none', hulls: [] } };
    prepared(boxGlb(w => { w.nodes[0]!['scale'] = [1e-12,1,1]; }),authoring);
  });

  it('documents the strict JSON/BIN subset by refusing a bounded unknown GLB chunk', () => {
    const base = boxGlb();
    const bytes = new Uint8Array(base.length+12);
    bytes.set(base);
    const dv = new DataView(bytes.buffer);
    dv.setUint32(8,bytes.length,true); dv.setUint32(base.length,4,true); dv.setUint32(base.length+4,0x54534554,true);
    refused(bytes,'GLB_CONTAINER');
  });
  it.todo('published adapter serializes baked render geometry while preserving materials and retaining original source provenance');
});

describe('original prop fixture sidecar adaptation (tool-internal, no runtime asset schema)', () => {
  it('refuses an over-budget outer hull list before reading even its first element', () => {
    const bytes = readFileSync(new URL('../creator-import/fixtures/props/solid.glb',import.meta.url));
    const sidecar = JSON.parse(readFileSync(new URL('../creator-import/fixtures/props/solid.collision-source.json',import.meta.url),'utf8')) as Record<string,unknown>;
    // Actual sparse array length, not a forged byteLength. No large geometry or byte allocation is involved.
    const sparse = new Array<unknown>(GLB_CHECK_BUDGET_ADAPTATION+1);
    let reads = 0;
    sidecar.hulls = new Proxy(sparse,{ get(target,key,receiver) {
      if (key === '0') { reads++; throw new Error('over-budget outer hull list was traversed'); }
      return Reflect.get(target,key,receiver);
    } });
    const captured: { result?: ReturnType<typeof preflightOriginalPropSidecar> } = {};
    expect(() => { captured.result = preflightOriginalPropSidecar(bytes,sidecar); }).not.toThrow();
    const result = captured.result;
    expect(reads).toBe(0);
    expect(result?.ok).toBe(false);
    if (!result || result.ok) throw new Error('unbounded outer hull list acquired prepared output');
    expect(result.diagnostics[0]!.code).toBe('CHECK_BUDGET_EXCEEDED');
    expect(result.diagnostics[0]!.message).toContain(String(GLB_CHECK_BUDGET_ADAPTATION+1));
    expect(result.diagnostics[0]!.message).toContain(String(GLB_CHECK_BUDGET_ADAPTATION));
  });

  it('refuses an empty convex hull before reading the next sidecar list entry', () => {
    const bytes = readFileSync(new URL('../creator-import/fixtures/props/solid.glb',import.meta.url));
    const sidecar = JSON.parse(readFileSync(new URL('../creator-import/fixtures/props/solid.collision-source.json',import.meta.url),'utf8')) as Record<string,unknown>;
    const hulls: unknown[] = [{ vertices: [], faces: [] },undefined];
    let reads = 0;
    Object.defineProperty(hulls,1,{ get: () => { reads++; throw new Error('a later hull was visited after an empty convex hull'); } });
    sidecar.hulls = hulls;
    const captured: { result?: ReturnType<typeof preflightOriginalPropSidecar> } = {};
    expect(() => { captured.result = preflightOriginalPropSidecar(bytes,sidecar); }).not.toThrow();
    const result = captured.result;
    expect(reads).toBe(0);
    expect(result?.ok).toBe(false);
    if (!result || result.ok) throw new Error('empty convex hull acquired prepared output');
    expect(result.diagnostics[0]!.code).toBe('COLLISION_DEGENERATE');
  });

  it('accepts the committed original solid GLB through its actual neutral sidecar shape', () => {
    const bytes = readFileSync(new URL('../creator-import/fixtures/props/solid.glb',import.meta.url));
    const sidecar = JSON.parse(readFileSync(new URL('../creator-import/fixtures/props/solid.collision-source.json',import.meta.url),'utf8')) as unknown;
    const before = structuredClone(sidecar);
    const result = preflightOriginalPropSidecar(bytes,sidecar);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.diagnostics.map(d => d.code).join(', '));
    expect(result.prepared.baked.collision.kind).toBe('convex');
    expect(result.prepared.baked.boundsMetres).toEqual({ min: [-1,0,-0.5], max: [1,1.5,0.5] });
    expect(result.prepared.source.originalGlb).toEqual(new Uint8Array(bytes));
    expect(sidecar).toEqual(before);
  });

  it('refuses the committed original external-URI fixture precisely after adapting its sidecar', () => {
    const bytes = readFileSync(new URL('../creator-import/fixtures/props/external-uri.glb',import.meta.url));
    const sidecar = JSON.parse(readFileSync(new URL('../creator-import/fixtures/props/external-uri.collision-source.json',import.meta.url),'utf8')) as unknown;
    const result = preflightOriginalPropSidecar(bytes,sidecar);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('external original fixture acquired prepared output');
    expect(result.diagnostics.map(d => d.code)).toContain('EXTERNAL_URI');
  });
});
