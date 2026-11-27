import type { EditMesh, Face } from './editMesh';
import type { GeoObject, WorldGeometry } from './world';

/**
 * The edited geometry as a file (the Forge geometry audit's bug 1, the Forge's owner (crispy, OT.R112), 2026-11-16: "Edits aren't saved"; a browser
 * adaptation, FG.R2 -- the game has no editor): what `../geometryStore` keeps for a layout (`Layout.geometry`), as
 * A level editor keeps a map's mesh edits in its `.vmap`. Only what an edit can change is written -- the drawn layer's objects
 * and meshes, the collision layer's when it was edited, the textures lent from other maps -- never what the disc gives
 * back as it was read (the hull as read, the world's original mesh, the owners' nodes): `GeometryEditor.restoreSaved`
 * takes those from the base as it opens it, so a file is small and the disc stays the one source of the disc's data.
 *
 * The layout: a header (JSON) naming each mesh once (a node's object shares the world's one mesh), each object by its
 * mesh's index, and every typed or long number array as a binary chunk after it (Float64 for numbers, so an untouched
 * value reads back exactly). Then the whole is gzipped (`CompressionStream`, where the browser has it).
 */
export interface SavedGeometry {
  /** The drawn layer as edited. */
  geo: WorldGeometry;
  /** The collision layer as edited, or null when it was never opened for editing (Build makes it from `geo`). */
  hull: WorldGeometry | null;
  /** The textures lent from other maps the faces wear (`texture.<map>.<name>` asset ids: `../page` `lendTexture`). */
  lent: string[];
}

/** A saved world geometry, less what the base gives back (`restoreSaved` fills them from the base as opened). */
export interface SavedWorld {
  objects: GeoObject[];
  /** It had the world's mesh as read (`WorldGeometry.original`): the restore puts the base's back. */
  original: boolean;
  /** It had the hull as read (`WorldGeometry.collision`): the restore puts the base's back. */
  collision: boolean;
  clearedNodes?: number[];
  clearedSolids?: string[];
}

export const GEOMETRY_FILE_VERSION = 1;
const MAGIC = 0x45474c53;   // "SLGE", little-endian
/** A number array this long or longer goes to a chunk (shorter ones stay in the header's JSON). */
const CHUNK_MIN = 32;
const NO_GROUP = -2147483648;

type Chunked = { $c: number; t: 'f64' | 'f32' | 'i32' | 'u32' | 'u16' | 'u8' | 'i16' | 'i8'; n?: 'array' };
const TYPED: Record<Chunked['t'], { new (b: ArrayBuffer, o: number, l: number): ArrayLike<number> & { buffer: ArrayBufferLike }; BYTES_PER_ELEMENT: number }> = {
  f64: Float64Array, f32: Float32Array, i32: Int32Array, u32: Uint32Array, u16: Uint16Array, u8: Uint8Array, i16: Int16Array, i8: Int8Array,
} as never;
const typeOf = (v: ArrayBufferView): Chunked['t'] | null =>
  v instanceof Float64Array ? 'f64' : v instanceof Float32Array ? 'f32' : v instanceof Int32Array ? 'i32' : v instanceof Uint32Array ? 'u32'
    : v instanceof Uint16Array ? 'u16' : v instanceof Uint8Array ? 'u8' : v instanceof Int16Array ? 'i16' : v instanceof Int8Array ? 'i8' : null;

/** A mesh's faces as flat arrays (one per field), so a hundred thousand faces are a few chunks, not as many objects. */
interface FaceTable {
  /** Each face's corner count, -1 for a deleted face (its index kept: a face's name). */
  counts: number[];
  corners: number[];
  style: number[];
  /** `Face.group`, `NO_GROUP` when absent. */
  group: number[];
  /** Bits: 1 normal, 2 mapping, 4 surface, 8 owner. */
  flags: number[];
  normals: number[];
  mappings: number[];
  surfaces: number[];
  owners: number[];
  /** The rare displaced faces, by index. */
  disp: [number, Face['disp']][];
}

function faceTable(faces: readonly (Face | null)[]): FaceTable {
  const t: FaceTable = { counts: [], corners: [], style: [], group: [], flags: [], normals: [], mappings: [], surfaces: [], owners: [], disp: [] };
  faces.forEach((f, i) => {
    if (!f) { t.counts.push(-1); return; }
    t.counts.push(f.corners.length);
    t.corners.push(...f.corners);
    t.style.push(f.style);
    t.group.push(f.group ?? NO_GROUP);
    let flags = 0;
    if (f.normal) { flags |= 1; t.normals.push(...f.normal); }
    if (f.mapping) { const m = f.mapping; flags |= 2; t.mappings.push(...m.u, ...m.v, m.scaleU, m.scaleV, m.shiftU, m.shiftV); }
    if (f.surface) { flags |= 4; t.surfaces.push(...f.surface); }
    if (f.owner !== undefined) { flags |= 8; t.owners.push(f.owner); }
    t.flags.push(flags);
    if (f.disp) t.disp.push([i, f.disp]);
  });
  return t;
}

function facesOf(t: FaceTable): (Face | null)[] {
  const out: (Face | null)[] = [];
  const disp = new Map(t.disp);
  let c = 0, live = 0, n = 0, m = 0, s = 0, o = 0;
  for (let i = 0; i < t.counts.length; i++) {
    const k = t.counts[i]!;
    if (k < 0) { out.push(null); continue; }
    const flags = t.flags[live]!;
    const f: Face = { corners: t.corners.slice(c, c + k), style: t.style[live]!, normal: null };
    c += k;
    const g = t.group[live]!;
    if (g !== NO_GROUP) f.group = g;
    if (flags & 1) { f.normal = [t.normals[n]!, t.normals[n + 1]!, t.normals[n + 2]!]; n += 3; }
    if (flags & 2) {
      const a = t.mappings;
      f.mapping = { u: [a[m]!, a[m + 1]!, a[m + 2]!], v: [a[m + 3]!, a[m + 4]!, a[m + 5]!], scaleU: a[m + 6]!, scaleV: a[m + 7]!, shiftU: a[m + 8]!, shiftV: a[m + 9]! };
      m += 10;
    }
    if (flags & 4) { f.surface = [t.surfaces[s]!, t.surfaces[s + 1]!, t.surfaces[s + 2]!, t.surfaces[s + 3]!, t.surfaces[s + 4]!]; s += 5; }
    if (flags & 8) f.owner = t.owners[o++]!;
    const d = disp.get(i);
    if (d) f.disp = { power: d.power, heights: [...d.heights] };
    out.push(f);
    live++;
  }
  return out;
}

/** The file's bytes for `g` (not yet compressed): `packGeometry`'s, then `gzip`. */
export function encodeGeometry(g: SavedGeometry): Uint8Array {
  const meshes: EditMesh[] = [];
  const meshIndex = new Map<EditMesh, number>();
  const indexOf = (m: EditMesh): number => { let i = meshIndex.get(m); if (i === undefined) { i = meshes.length; meshes.push(m); meshIndex.set(m, i); } return i; };
  const world = (w: WorldGeometry) => ({
    objects: w.objects.map(({ mesh, ...rest }) => ({ ...rest, mesh: indexOf(mesh) })),
    original: !!w.original, collision: !!w.collision,
    ...(w.clearedNodes ? { clearedNodes: w.clearedNodes } : {}), ...(w.clearedSolids ? { clearedSolids: w.clearedSolids } : {}),
  });
  const head = {
    v: GEOMETRY_FILE_VERSION,
    geo: world(g.geo),
    hull: g.hull ? world(g.hull) : null,
    lent: g.lent,
    meshes: [] as unknown[],
  };
  // After the objects named every mesh they use.
  head.meshes = meshes.map((m) => ({
    verts: m.verts, cVert: m.cVert, cUv: m.cUv, cColor: m.cColor, cNormal: m.cNormal, cCentroid: m.cCentroid,
    faces: faceTable(m.faces), styles: m.styles,
  }));
  return pack(head);
}

/** The file read back (its bytes as `encodeGeometry` made them, decompressed); throws on a file this build cannot read. */
export function decodeGeometry(bytes: Uint8Array): { geo: SavedWorld; hull: SavedWorld | null; lent: string[] } {
  const head = unpack(bytes) as {
    v: number; lent: string[];
    geo: SavedWorldHead; hull: SavedWorldHead | null;
    meshes: { verts: number[]; cVert: number[]; cUv: number[]; cColor: number[]; cNormal: number[]; cCentroid: number[]; faces: FaceTable; styles: EditMesh['styles'] }[];
  };
  if (head.v !== GEOMETRY_FILE_VERSION) throw new Error(`a geometry file of version ${head.v}, which this build cannot read`);
  const meshes: EditMesh[] = head.meshes.map((m) => ({
    verts: m.verts, cVert: m.cVert, cUv: m.cUv, cColor: m.cColor, cNormal: m.cNormal, cCentroid: m.cCentroid,
    faces: facesOf(m.faces), styles: m.styles,
  }));
  const world = (w: SavedWorldHead): SavedWorld => ({
    objects: w.objects.map(({ mesh, ...rest }) => ({ ...rest, mesh: meshes[mesh]! } as GeoObject)),
    original: w.original, collision: w.collision,
    ...(w.clearedNodes ? { clearedNodes: w.clearedNodes } : {}), ...(w.clearedSolids ? { clearedSolids: w.clearedSolids } : {}),
  });
  return { geo: world(head.geo), hull: head.hull ? world(head.hull) : null, lent: head.lent ?? [] };
}
type SavedWorldHead = Omit<SavedWorld, 'objects'> & { objects: (Omit<GeoObject, 'mesh'> & { mesh: number })[] };

/** `value` as bytes: its JSON with every typed array and long number array a chunk after it, each 8-byte aligned. */
function pack(value: unknown): Uint8Array {
  const chunks: ArrayBufferView[] = [];
  const json = JSON.stringify(value, (_k, v: unknown) => {
    if (ArrayBuffer.isView(v)) {
      const t = typeOf(v);
      if (!t) return v;
      chunks.push(v);
      return { $c: chunks.length - 1, t } satisfies Chunked;
    }
    if (Array.isArray(v) && v.length >= CHUNK_MIN && v.every((x) => typeof x === 'number')) {
      chunks.push(Float64Array.from(v as number[]));
      return { $c: chunks.length - 1, t: 'f64', n: 'array' } satisfies Chunked;
    }
    return v;
  });
  const text = new TextEncoder().encode(json);
  const pad8 = (n: number): number => (n + 7) & ~7;
  const lens = chunks.map((c) => c.byteLength);
  let size = pad8(16 + text.byteLength + 4 * chunks.length);
  for (const l of lens) size += pad8(l);
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, GEOMETRY_FILE_VERSION, true);
  dv.setUint32(8, text.byteLength, true);
  dv.setUint32(12, chunks.length, true);
  out.set(text, 16);
  let at = 16 + text.byteLength;
  for (const l of lens) { dv.setUint32(at, l, true); at += 4; }
  at = pad8(at);
  for (const c of chunks) { out.set(new Uint8Array(c.buffer, c.byteOffset, c.byteLength), at); at += pad8(c.byteLength); }
  return out;
}

function unpack(bytes: Uint8Array): unknown {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 16 || dv.getUint32(0, true) !== MAGIC) throw new Error('not a geometry file');
  const textLen = dv.getUint32(8, true), count = dv.getUint32(12, true);
  const json = new TextDecoder().decode(bytes.subarray(16, 16 + textLen));
  const pad8 = (n: number): number => (n + 7) & ~7;
  let at = 16 + textLen;
  const lens: number[] = [];
  for (let i = 0; i < count; i++) { lens.push(dv.getUint32(at, true)); at += 4; }
  at = pad8(at);
  const offsets: number[] = [];
  for (const l of lens) { offsets.push(at); at += pad8(l); }
  // A copy of the bytes, aligned for every typed view (the input's own offset may not be).
  const buf = bytes.slice().buffer;
  return JSON.parse(json, (_k, v: unknown) => {
    if (v && typeof v === 'object' && '$c' in v) {
      const c = v as Chunked;
      const T = TYPED[c.t];
      const view = new T(buf, offsets[c.$c]!, lens[c.$c]! / T.BYTES_PER_ELEMENT);
      return c.n === 'array' ? Array.from(view) : view;
    }
    return v;
  });
}

/** `bytes` gzipped, where the browser can (`CompressionStream`); as they are where it cannot (marked by the magic). */
export async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') return bytes;
  const s = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** `gzip`'s bytes back: gunzipped when they are gzip (0x1f 0x8b), else as they are. */
export async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const s = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
