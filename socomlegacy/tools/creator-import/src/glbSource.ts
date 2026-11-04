/** Strict source-only GLB reader. No renderer, resource loader, filesystem or network capability. */
import { PACK_BYTES_ADAPTATION, PACK_FILES_ADAPTATION, PACK_MEMBER_BYTES_ADAPTATION, packPath } from '@s2u/creator-contracts';
import type { OriginalGlbMemberContext, SourcePoint } from './originalGlb';
import { checkDeterminant, closeMatrix, finite, identity, integer, multiply, nodeMatrix, refuse, transform } from './geometry';
import { GLB_JSON_BYTES_ADAPTATION, PreparationBudget } from './limits';

type Obj = Record<string, unknown>;
const obj = (value: unknown, code: string): Obj => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse(code, 'An expected GLB object is absent or malformed.');
  return value as Obj;
};
const list = (value: unknown, code: string): unknown[] => {
  if (!Array.isArray(value)) refuse(code, 'An expected GLB array is absent or malformed.');
  return value;
};
const item = (rows: unknown[], index: unknown, code: string): Obj => {
  if (!integer(index) || index >= rows.length) refuse(code, 'A GLB index is out of range.');
  return obj(rows[index], code);
};
const count = (v: unknown, code: string): number => {
  if (!integer(v)) refuse(code, 'A byte/count field must be a nonnegative safe integer.');
  return v;
};

/** Budget bytes before decoding or allocating output. Embedded resources are charged in addition to input bytes. */
class Budget {
  private bytes = 0;
  add(bytes: number): void {
    if (!integer(bytes) || bytes > PACK_MEMBER_BYTES_ADAPTATION) refuse('SOURCE_BUDGET', 'An input or decoded resource exceeds the published member byte budget.');
    this.bytes += bytes;
    if (this.bytes > PACK_BYTES_ADAPTATION) refuse('SOURCE_BUDGET', 'Inputs and decoded resources exceed the published pack byte budget.');
  }
}
function members(bytes: Uint8Array, context: OriginalGlbMemberContext | undefined, budget: Budget): { owned: Map<string, Uint8Array>; directory: string } {
  const owned = new Map<string, Uint8Array>();
  if (context === undefined) { budget.add(bytes.byteLength); return { owned, directory: '' }; }
  if (!context || context.glbMember === undefined) refuse('GLB_MEMBER_MISSING', 'The context must name its GLB member.');
  const glb = packPath(context.glbMember);
  if (!glb.ok) refuse('MEMBER_PATH', glb.text);
  if (!Array.isArray(context.members) || context.members.length > PACK_FILES_ADAPTATION) refuse('MEMBER_PATH', 'The approved member collection is absent or over its published bound.');
  const aliases = new Set<string>();
  for (const entry of context.members) {
    const path = packPath(entry?.member);
    if (!path.ok) refuse('MEMBER_PATH', path.text);
    const folded = path.path.toLowerCase();
    if (aliases.has(folded)) refuse('MEMBER_PATH', 'Approved members alias after NFC normalization or case folding.');
    aliases.add(folded);
    if (!(entry.bytes instanceof Uint8Array)) refuse('MEMBER_PATH', 'A member must own bytes.');
    budget.add(entry.bytes.byteLength);
    owned.set(path.path, entry.bytes);
  }
  const source = owned.get(glb.path);
  if (!source) refuse('GLB_MEMBER_MISSING', 'The approved member collection does not own the named GLB.');
  if (source.length !== bytes.length || source.some((v,i) => v !== bytes[i])) refuse('GLB_MEMBER_MISMATCH', 'The supplied GLB differs from its approved member.');
  return { owned, directory: glb.path.includes('/') ? glb.path.slice(0, glb.path.lastIndexOf('/')+1) : '' };
}
function dataUri(uri: string, budget: Budget, image: boolean): Uint8Array {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(uri);
  if (!match || match[2]!.length % 4 !== 0 || !(image ? /^image\/(png|jpeg)$/.test(match[1]!) : /^(application\/octet-stream|application\/gltf-buffer)$/.test(match[1]!))) refuse('GLB_RESOURCE', 'Only supported, strictly base64 encoded data resources are accepted.');
  const body = match[2]!;
  const length = body.length / 4 * 3 - (body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0);
  budget.add(length);
  let raw: string;
  try { raw = atob(body); } catch { return refuse('GLB_RESOURCE', 'Malformed base64 resource.'); }
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

/** This source subset implements no extension semantics. Inspect declarations and payload locations BEFORE
 * buffers/images are interpreted, so fallback bytes never turn an unsupported extension into silent data loss.
 * Iteration avoids recursion on authored JSON; extras are opaque author metadata, not glTF extension locations.
 */
function refuseExtensions(json: Obj): void {
  const unsupported = (name: string, where: string): never => refuse('GLB_EXTENSION_UNSUPPORTED', `${where}: extension ${name} is not supported by the static source tool; no decoder or instance expander is run.`);
  for (const key of ['extensionsRequired','extensionsUsed'] as const) {
    if (json[key] === undefined) continue;
    const declarations = list(json[key],'GLB_JSON');
    for (const name of declarations) {
      if (typeof name !== 'string' || name.length === 0) refuse('GLB_JSON', `${key} must contain extension names.`);
      unsupported(name,key);
    }
  }
  const pending: unknown[] = [json];
  while (pending.length) {
    const value = pending.pop();
    if (Array.isArray(value)) { for (const child of value) pending.push(child); continue; }
    if (!value || typeof value !== 'object') continue;
    for (const [key,child] of Object.entries(value)) {
      if (key === 'extras' || key === 'extensionsRequired' || key === 'extensionsUsed') continue;
      if (key === 'extensions') {
        const extensions = obj(child,'GLB_JSON');
        for (const name of Object.keys(extensions)) unsupported(name,'extensions');
      } else if (child && typeof child === 'object') pending.push(child);
    }
  }
}

function container(bytes: Uint8Array): { json: Obj; bin?: Uint8Array } {
  if (bytes.length < 20) refuse('GLB_CONTAINER', 'The GLB container is truncated.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0,true) !== 0x46546c67 || view.getUint32(4,true) !== 2 || view.getUint32(8,true) !== bytes.length) refuse('GLB_CONTAINER', 'The GLB magic, version or total length is invalid.');
  let at = 12, json: Obj | undefined, bin: Uint8Array | undefined;
  while (at < bytes.length) {
    if (at + 8 > bytes.length) refuse('GLB_CONTAINER', 'A GLB chunk header is truncated.');
    const length = view.getUint32(at,true), kind = view.getUint32(at+4,true);
    if (length % 4 !== 0 || at + 8 + length > bytes.length) refuse('GLB_CONTAINER', 'A GLB chunk is unaligned or out of bounds.');
    const chunk = bytes.subarray(at+8,at+8+length);
    if (at === 12) {
      if (kind !== 0x4e4f534a) refuse('GLB_CONTAINER', 'The first GLB chunk must be JSON.');
      if (length > GLB_JSON_BYTES_ADAPTATION) refuse('JSON_TOO_LARGE', `Declared GLB JSON chunk ${length} bytes exceeds the tool cap ${GLB_JSON_BYTES_ADAPTATION} bytes.`);
      let parsed: unknown;
      try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(chunk)); }
      catch { return refuse('GLB_JSON', 'The GLB JSON is malformed UTF-8 or JSON.'); }
      json = obj(parsed, 'GLB_JSON');
    } else if (kind === 0x004e4942 && bin === undefined) bin = chunk;
    else refuse('GLB_CONTAINER', 'Duplicate or unsupported GLB chunk.');
    at += 8 + length;
  }
  if (!json) refuse('GLB_CONTAINER', 'The GLB JSON chunk is missing.');
  const asset = obj(json.asset, 'GLB_JSON');
  if (asset.version !== '2.0') refuse('GLB_JSON', 'Only glTF 2.0 source is supported.');
  refuseExtensions(json);
  // Unsupported semantic payloads must not be silently discarded by a geometry-only preparation step.
  if (json.animations !== undefined || json.skins !== undefined) refuse('GLB_UNSUPPORTED', 'Animated or skinned content needs its own reviewed adapter.');
  return { json, ...(bin === undefined ? {} : { bin }) };
}

export interface ParsedGeometry {
  primitives: { positionsMetres: SourcePoint[]; indices: number[] }[];
  /** Null when the static scene has multiple resolved mesh frames; visual-only geometry is still fully baked. */
  frame: number[] | null;
  boundsMetres: { min: SourcePoint; max: SourcePoint };
}
export function readGlbSource(bytes: Uint8Array, context: OriginalGlbMemberContext | undefined, preparation: PreparationBudget): ParsedGeometry {
  if (!(bytes instanceof Uint8Array)) refuse('GLB_CONTAINER', 'A GLB source must be an owned byte view.');
  const budget = new Budget();
  const approved = members(bytes, context, budget);
  const { json, bin } = container(bytes);
  const buffers = list(json.buffers, 'GLB_ACCESSOR').map((raw, i) => {
    const buffer = obj(raw, 'GLB_ACCESSOR');
    const length = count(buffer.byteLength, 'GLB_ACCESSOR');
    let data: Uint8Array;
    if (buffer.uri === undefined) {
      if (i !== 0 || !bin || bin.length < length || bin.length - length > 3) refuse('GLB_ACCESSOR', 'The declared GLB buffer does not fit its BIN chunk.');
      data = bin.subarray(0,length);
    } else {
      if (typeof buffer.uri !== 'string' || !buffer.uri.startsWith('data:')) refuse('EXTERNAL_URI', 'Buffers must reside in BIN or a data URI; no external preflight is performed.');
      data = dataUri(buffer.uri,budget,false);
      if (data.length !== length) refuse('GLB_ACCESSOR', 'Decoded buffer length differs from its declaration.');
    }
    return data;
  });
  const views = list(json.bufferViews, 'GLB_ACCESSOR');
  const accessors = list(json.accessors, 'GLB_ACCESSOR');
  const viewBytes = (index: unknown): { bytes: Uint8Array; stride: unknown; start: number } => {
    const v = item(views,index,'GLB_ACCESSOR');
    if (!integer(v.buffer) || v.buffer >= buffers.length) refuse('GLB_ACCESSOR','A buffer view names no buffer.');
    const data = buffers[v.buffer]!;
    const start = count(v.byteOffset ?? 0,'GLB_ACCESSOR'), length = count(v.byteLength,'GLB_ACCESSOR');
    if (start + length > data.length) refuse('GLB_ACCESSOR','A buffer view exceeds its declared buffer.');
    return { bytes: data.subarray(start,start+length), stride: v.byteStride, start };
  };
  const accessor = (index: unknown, position: boolean): number[][] => {
    const a = item(accessors,index,'GLB_ACCESSOR');
    if (a.sparse !== undefined || (a.normalized !== undefined && a.normalized !== false) || a.type !== (position ? 'VEC3' : 'SCALAR')) refuse('GLB_ACCESSOR','Unsupported source accessor layout.');
    const component = a.componentType;
    const size = component === 5126 || component === 5125 ? 4 : component === 5123 ? 2 : component === 5121 ? 1 : 0;
    if (!size || (position ? component !== 5126 : component === 5126)) refuse('GLB_ACCESSOR','Unsupported accessor component type.');
    const v = viewBytes(a.bufferView), width = position ? 3 : 1;
    const offset = count(a.byteOffset ?? 0,'GLB_ACCESSOR'), n = count(a.count,'GLB_ACCESSOR');
    const stride = v.stride === undefined ? size*width : count(v.stride,'GLB_ACCESSOR');
    // glTF 2.0 bufferView.byteStride schema: 4..252, multiple of four, vertex attributes only.
    if (v.stride !== undefined && (!position || stride < 4 || stride > 252 || stride % 4 !== 0)) refuse('GLB_ACCESSOR','An explicit vertex stride must be 4..252 bytes and a multiple of four.');
    if (n === 0 || stride < size*width || stride % size !== 0 || offset % size !== 0 || (v.start+offset) % size !== 0 || offset+(n-1)*stride+size*width > v.bytes.length) refuse('GLB_ACCESSOR','An accessor is misaligned or exceeds its buffer view.');
    preparation.prepare(n * width * Float64Array.BYTES_PER_ELEMENT);
    preparation.check(position ? n : Math.ceil(n / 3));
    const dv = new DataView(v.bytes.buffer,v.bytes.byteOffset,v.bytes.byteLength);
    return Array.from({ length: n }, (_, i) => Array.from({ length: width }, (_, c) => {
      const at = offset+i*stride+c*size;
      const value = component === 5126 ? dv.getFloat32(at,true) : component === 5125 ? dv.getUint32(at,true) : component === 5123 ? dv.getUint16(at,true) : dv.getUint8(at);
      if (!finite(value)) refuse(position ? 'GLB_POSITION' : 'GLB_INDEX','A used geometry component is not finite.');
      return value;
    }));
  };
  // Validate every image URI before any lookup, including unused declarations; resolution is memory-only.
  for (const raw of json.images === undefined ? [] : list(json.images,'GLB_RESOURCE')) {
    const image = obj(raw,'GLB_RESOURCE');
    if (image.uri !== undefined) {
      if (typeof image.uri !== 'string') refuse('EXTERNAL_URI','An image URI must be a string.');
      if (image.uri.startsWith('data:')) { dataUri(image.uri,budget,true); continue; }
      const path = packPath(image.uri);
      if (!path.ok) refuse('EXTERNAL_URI','Images can only reference safe relative in-pack members.');
      const resolved = packPath(approved.directory+path.path);
      if (!resolved.ok) refuse('EXTERNAL_URI','The image path cannot be resolved inside its pack.');
      if (!approved.owned.has(resolved.path)) refuse('GLB_MEMBER_MISSING','A relative image is absent from the approved members.');
    } else {
      if (image.mimeType !== 'image/png' && image.mimeType !== 'image/jpeg') refuse('GLB_RESOURCE','An embedded image needs a supported MIME type.');
      viewBytes(image.bufferView);
    }
  }
  const nodes = list(json.nodes,'GLB_NODE'), meshes = list(json.meshes,'GLB_ACCESSOR');
  const scenes = list(json.scenes,'GLB_NODE');
  const scene = item(scenes,json.scene ?? 0,'GLB_NODE');
  const roots = list(scene.nodes,'GLB_NODE');
  const visited = new Set<number>();
  const stack = roots.slice().reverse().map(index => ({ index, parent: identity() }));
  preparation.prepare(6 * Float64Array.BYTES_PER_ELEMENT); // The returned min/max are six numeric values too.
  const primitives: ParsedGeometry['primitives'] = [];
  const frames: number[][] = [];
  let min: SourcePoint = [Infinity,Infinity,Infinity], max: SourcePoint = [-Infinity,-Infinity,-Infinity];
  while (stack.length) {
    const { index, parent } = stack.pop()!;
    const node = item(nodes,index,'GLB_NODE');
    const id = index as number;
    if (visited.has(id)) refuse('GLB_NODE','A used node is shared or cyclic; a single ownership hierarchy is required.');
    visited.add(id);
    if (node.skin !== undefined || node.weights !== undefined) refuse('GLB_UNSUPPORTED','Skins and morph weights need a reviewed adapter.');
    if (node.extras && typeof node.extras === 'object' && Object.prototype.hasOwnProperty.call(node.extras,'pivot')) refuse('GLB_PIVOT_UNSUPPORTED','extras.pivot is unsupported; it is never discarded or reinterpreted.');
    const local = nodeMatrix(node,`nodes[${id}]`), world = multiply(parent,local);
    if (!world.every(finite)) refuse('NONFINITE_TRANSFORM','The resolved transform is not finite.');
    checkDeterminant(world,`nodes[${id}].world`);
    if (node.children !== undefined) {
      for (const child of list(node.children,'GLB_NODE').slice().reverse()) {
        if (!integer(child) || child >= nodes.length) refuse('GLB_NODE','A node names a missing child.');
        stack.push({ index: child, parent: world });
      }
    }
    if (node.mesh === undefined) continue;
    const mesh = item(meshes,node.mesh,'GLB_ACCESSOR');
    if (mesh.weights !== undefined) refuse('GLB_UNSUPPORTED','Mesh morph weights need a reviewed adapter.');
    frames.push(world);
    for (const raw of list(mesh.primitives,'GLB_ACCESSOR')) {
      const primitive = obj(raw,'GLB_ACCESSOR');
      if ((primitive.mode ?? 4) !== 4 || primitive.targets !== undefined || primitive.extensions !== undefined) refuse('GLB_UNSUPPORTED','Only uncompressed static triangle primitives are supported.');
      const attributes = obj(primitive.attributes,'GLB_ACCESSOR');
      const source: SourcePoint[] = accessor(attributes.POSITION,true).map(row => [row[0]!,row[1]!,row[2]!]);
      const positionsMetres = source.map(p => transform(world,p));
      if (primitive.indices === undefined) {
        preparation.prepare(source.length * Float64Array.BYTES_PER_ELEMENT);
        preparation.check(Math.ceil(source.length / 3));
      }
      const indices = primitive.indices === undefined ? source.map((_,i) => i) : accessor(primitive.indices,false).map(row => row[0]!);
      if (indices.length % 3 !== 0 || indices.some(i => i >= source.length)) refuse('GLB_INDEX','Triangle indices are incomplete or outside their POSITION accessor.');
      for (const p of positionsMetres) {
        min = min.map((v,i) => Math.min(v,p[i]!)) as unknown as SourcePoint;
        max = max.map((v,i) => Math.max(v,p[i]!)) as unknown as SourcePoint;
      }
      primitives.push({ positionsMetres, indices });
    }
  }
  if (!primitives.length) refuse('GLB_POSITION','The selected scene has no usable triangle geometry.');
  const frame = frames.some(m => !closeMatrix(m,frames[0]!)) ? null : frames[0]!;
  return { primitives, frame, boundsMetres: { min, max } };
}
