import { BufferGeometry, Color, Group, LoadingManager, Matrix3, Mesh, MeshBasicMaterial, NoColorSpace, type Material, type Object3D, type Side, type Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ZipError, openZip, bytesSource } from './zipReader';
import { setModelVisualSource } from './modelPackHook';
import { pageIndexedDb, pageSettings } from './pageStore';
import { modsStateStore, type ModelSwitches, type ModsStateStore } from './packs/modsState';
import { idbPackDatabase, PackStorageError, type PackMigrationPart, type PackWriteOptions } from './packs/storage';
import { memberAt, storedMember, type NativePackIdentity, type NativePackObservation } from './packs/identity';
import type { CheckReport } from '@s2u/creator-contracts';
import {
  MODEL_PACK_LIMITS, MODEL_PACK_MANIFEST, ModelPackError, modelPackActive, modelPackFiles, packFile, parseModelManifest, refusePackBytes,
  type ModelMapping, type ModelManifest, type PackEntry,
} from './modelPack';

/**
 * Loads a model pack and, on the test room only, hands it to `buildWorld` (`TEST_ROOM_MODEL_PACK_ADAPTATION`).
 * A folder (`showDirectoryPicker`, or a directory input where that API is absent) or a zip. The bytes stay in this
 * browser. A GLB that will not parse is skipped with one console warning and the game's mesh stays.
 *
 * A second pack installs beside the first. Each pack keeps `MODEL_PACK_LIMITS` (128 ids, 500 MiB). An id named by
 * both keeps the first pack's entry. Collision is not this module's: the packs change the draw only.
 */

const DB_NAME = 's2u.modelPack';
const DB_VERSION = 1;
const STORE = 'pack';
const KEY = 'current';
/** The stored pack's byte count. Read before `KEY`, so boot can size its wait without loading the GLBs. */
const META_KEY = 'meta';
const PICKER_ID = 's2u-model-pack';
const SECOND_PICKER_ID = 's2u-model-pack-second';
const PACK_LATE_LINE = 'Saved model pack did not load in time, so it stays off for this visit.';
const SECOND_LATE_LINE = 'Saved second model pack did not load in time, so it stays off for this visit.';

/** Which installed pack. `primary` is the one the panel has always loaded; `second` sits beside it. */
export type ModelPackSlot = 'primary' | 'second';

/** One pack's keys in the same store. Chunk keys do not overlap, so a write of one leaves the other. */
interface PackStore {
  key: string;
  meta: string;
  chunkKey(index: number): string;
  picker: string;
  /** A pack kept before the size record existed is recognised by its key. The second slot has no such packs. */
  legacy: boolean;
}

const PRIMARY_STORE: PackStore = {
  key: KEY, meta: META_KEY, chunkKey: (index) => modelPackChunkKey(index), picker: PICKER_ID, legacy: true,
};
const SECOND_STORE: PackStore = {
  key: 'second', meta: 'meta2', chunkKey: (index) => modelPackSecondChunkKey(index), picker: SECOND_PICKER_ID, legacy: false,
};

function storeFor(slot: ModelPackSlot): PackStore {
  return slot === 'second' ? SECOND_STORE : PRIMARY_STORE;
}

export interface LoadedModelPack {
  readonly manifest: ModelManifest;
  /** Ids that parsed, lowercase, in manifest order. */
  readonly ids: readonly string[];
  /** Ids whose GLB was missing or would not parse. */
  readonly skipped: readonly string[];
  has(id: string): boolean;
  clone(id: string): Object3D;
  /** Drops the template's geometry, materials and textures. Clones already in the scene share them. */
  dispose(): void;
}

interface StoredFileSpan { path: string; bytes: number }
interface StoredFiles {
  kind: 'files';
  /** A pack kept before chunking: one value holds every file. */
  entries?: { path: string; bytes: ArrayBuffer }[];
  /** A chunked pack: file lengths, the bytes laid across `c:0` .. `c:chunks-1`. */
  files?: StoredFileSpan[];
  chunks?: number;
}
interface StoredFolder {
  kind: 'folder';
  handle: FileSystemDirectoryHandle;
}
type StoredPack = StoredFiles | StoredFolder;
interface StoredMeta { bytes: number }
/** `bytes` is the stored size. `null` is a pack kept before that record existed: boot uses the wait cap. */
interface PackPlan { bytes: number | null }

interface PickerHost {
  showDirectoryPicker?(options: { id?: string; mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
}

const degrees = (value: number): number => value * Math.PI / 180;

/** One warning per id inside a single load. The message names the id, the file and the reason. */
function warnSkip(seen: Set<string>, id: string, file: string, reason: string): void {
  const key = id.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  console.warn(`Model pack: "${id}" (${file}) was not used (${reason}). The original mesh stays.`);
}

/**
 * The map samples a texel as the stored byte (`world.ts` `makeTexture`, `NoColorSpace`) and the renderer writes
 * that sample out unconverted (`renderer.ts`, `LinearSRGBColorSpace`). GLTFLoader tags a base-colour map and an
 * emissive map `SRGBColorSpace`, so the GPU decodes them: a mid grey of 128 samples as about 0.216 instead of
 * 128/255, and a native export draws about half as bright. Both packs share this. A `KHR_materials_unlit` material
 * is already basic, so the tag is cleared on that return too. COLOR_0 is left as the file stored it.
 */
function drawTexelsAsStored(material: Material): void {
  const textured = material as Material & { map?: Texture | null; emissiveMap?: Texture | null };
  for (const texture of [textured.map, textured.emissiveMap]) {
    if (!texture || texture.colorSpace === NoColorSpace) continue;
    texture.colorSpace = NoColorSpace;
    texture.needsUpdate = true;
  }
}

export function unlitMaterial(material: Material): Material {
  if (material.type === 'MeshBasicMaterial') {
    drawTexelsAsStored(material);
    return material;
  }
  const src = material as Material & {
    map?: Texture | null;
    color?: { getHex(): number };
    transparent?: boolean;
    opacity?: number;
    alphaTest?: number;
    side?: Side;
    vertexColors?: boolean;
    emissive?: { clone(): Color; r: number; g: number; b: number };
    emissiveMap?: Texture | null;
    emissiveIntensity?: number;
  };
  const basic = new MeshBasicMaterial({
    map: src.map ?? null,
    color: src.color?.getHex() ?? 0xffffff,
    transparent: src.transparent === true,
    opacity: typeof src.opacity === 'number' ? src.opacity : 1,
    alphaTest: typeof src.alphaTest === 'number' ? src.alphaTest : 0,
    side: src.side,
    vertexColors: src.vertexColors === true,
  });
  // Base colour above is unchanged. Emissive is carried beside it. The basic shader has no emissive uniform, so a
  // set `emissive` would throw in the renderer's uniform refresh; both paths install that uniform. Only a source
  // that actually glows changes the fragment shader (added after the base colour, before tone mapping).
  const emissive = src.emissive?.clone() ?? new Color(0x000000);
  const emissiveMap = src.emissiveMap ?? null;
  const emissiveIntensity = typeof src.emissiveIntensity === 'number' ? src.emissiveIntensity : 1;
  const lit = basic as MeshBasicMaterial & { emissive: Color; emissiveMap: Texture | null; emissiveIntensity: number };
  lit.emissive = emissive;
  lit.emissiveMap = emissiveMap;
  lit.emissiveIntensity = emissiveIntensity;
  const shines = emissiveMap !== null || emissive.r + emissive.g + emissive.b > 0;
  basic.onBeforeCompile = shines ? (shader) => {
    shader.uniforms.emissive = { value: new Color(0x000000) };
    shader.uniforms.emissiveMap = { value: null };
    shader.uniforms.emissiveMapTransform = { value: new Matrix3() };
    shader.fragmentShader = `uniform vec3 emissive;\n#ifdef USE_EMISSIVEMAP\nuniform sampler2D emissiveMap;\n#endif\n${shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      'vec3 s2uGlow = emissive;\n#ifdef USE_EMISSIVEMAP\ns2uGlow *= texture2D(emissiveMap, vEmissiveMapUv).rgb;\n#endif\noutgoingLight += s2uGlow;\n#include <opaque_fragment>',
    )}`;
  } : (shader) => {
    shader.uniforms.emissive = { value: new Color(0x000000) };
  };
  material.dispose();
  drawTexelsAsStored(basic);
  return basic;
}

/**
 * The map is drawn unlit (vertex colour, no scene lights). A GLB's PBR material would come out black, so the
 * mesh keeps the GLB's base-colour texture and is drawn with an unlit material. Emissive is added on top when the
 * source has it. The geometry is the GLB's.
 */
function showUnlit(root: Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = list.map((material) => unlitMaterial(material));
    mesh.material = Array.isArray(mesh.material) ? next : next[0]!;
  });
}

/**
 * A URI three may fetch for a buffer or an image. Only `data:` and `blob:` are the file's own bytes (an embedded
 * image becomes a blob URL). Anything else is refused before a request, so a shared pack cannot make the browser
 * fetch an outside address.
 */
const OUTSIDE_GLB = 'the GLB names an address outside the file';

function packUri(refused: { current: boolean }): (url: string) => string {
  return (url) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    refused.current = true;
    throw new ModelPackError(OUTSIDE_GLB);
  };
}

/** Triangles and texture edges of a parsed scene. A scene over the cap is not drawn. */
export function visualLimit(root: Object3D): string | null {
  let triangles = 0;
  let edge = 0;
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    if (geometry) {
      if (geometry.index) triangles += geometry.index.count / 3;
      else {
        const position = geometry.getAttribute('position');
        if (position) triangles += position.count / 3;
      }
    }
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        const texture = value as Texture;
        if (texture?.isTexture !== true) continue;
        const image = texture.image as { width?: number; height?: number } | undefined;
        edge = Math.max(edge, image?.width ?? 0, image?.height ?? 0);
      }
    }
  });
  if (edge > MODEL_PACK_LIMITS.textureEdge) return `a texture is ${edge} px on a side, over ${MODEL_PACK_LIMITS.textureEdge}`;
  if (triangles > MODEL_PACK_LIMITS.triangles) return `${triangles} triangles is over ${MODEL_PACK_LIMITS.triangles}`;
  return null;
}

/** The template's GPU resources. A material's textures go with it. */
export function disposeObject(root: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        const texture = value as Texture;
        if (texture?.isTexture === true) textures.add(texture);
      }
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}

/**
 * A buffer or image `uri` that is not the file's own `data:` or `blob:` bytes. Refused before `GLTFLoader.parse`,
 * so three never starts the request. The loader's URL check is the second line, for a URI this scan does not see.
 */
function refuseOutsideUris(bytes: Uint8Array): void {
  if (bytes.byteLength < 20) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) return;
  const length = view.getUint32(12, true);
  if (20 + length > bytes.byteLength) return;
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  } catch {
    return;
  }
  const doc = json as { buffers?: { uri?: unknown }[]; images?: { uri?: unknown }[] };
  for (const list of [doc.buffers, doc.images]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== 'object' || typeof item.uri !== 'string') continue;
      if (item.uri.startsWith('data:') || item.uri.startsWith('blob:')) continue;
      throw new ModelPackError(OUTSIDE_GLB);
    }
  }
}

const GLB_MAGIC = 0x46546c67;
const GLB_JSON = 0x4e4f534a;

/**
 * Drops `extras.pivot` from every node before `GLTFLoader.parse`.
 *
 * three 0.186 copies node extras onto `userData` (`assignExtrasToUserData`). `loadNode` then, when that node has a
 * child, treats `userData.pivot` as three's own pivot: it subtracts the array from the node's position, sets
 * `Object3D.pivot`, and sets the first child's position to zero. That reconstructs a container `GLTFExporter`
 * wrote. A pack GLB's `pivot` is not that container (a Meshy export moved a building by about 1,700 units on the
 * disc check). Other extras stay. A file with no such key is returned unchanged.
 */
function stripNodePivotExtras(bytes: Uint8Array): Uint8Array {
  if (bytes.byteLength < 20) return bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) return bytes;
  const length = Math.min(view.getUint32(8, true), bytes.byteLength);
  let offset = 12;
  while (offset + 8 <= length) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkLength;
    if (dataEnd > length) return bytes;
    if (chunkType !== GLB_JSON) {
      offset = dataEnd;
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder().decode(bytes.subarray(dataStart, dataEnd)));
    } catch {
      return bytes;
    }
    if (!json || typeof json !== 'object') return bytes;
    const nodes = (json as { nodes?: unknown }).nodes;
    if (!Array.isArray(nodes)) return bytes;
    let stripped = false;
    for (const node of nodes) {
      if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
      const extras = (node as { extras?: unknown }).extras;
      if (!extras || typeof extras !== 'object' || Array.isArray(extras)) continue;
      if (!Object.prototype.hasOwnProperty.call(extras, 'pivot')) continue;
      delete (extras as { pivot?: unknown }).pivot;
      stripped = true;
      if (Object.keys(extras).length === 0) delete (node as { extras?: unknown }).extras;
    }
    if (!stripped) return bytes;
    const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
    const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
    const after = bytes.subarray(dataEnd);
    const total = offset + 8 + jsonBytes.length + jsonPad + after.length;
    const out = new Uint8Array(total);
    const outView = new DataView(out.buffer);
    out.set(bytes.subarray(0, offset), 0);
    outView.setUint32(8, total, true);
    outView.setUint32(offset, jsonBytes.length + jsonPad, true);
    outView.setUint32(offset + 4, GLB_JSON, true);
    out.set(jsonBytes, offset + 8);
    out.fill(0x20, offset + 8 + jsonBytes.length, offset + 8 + jsonBytes.length + jsonPad);
    out.set(after, offset + 8 + jsonBytes.length + jsonPad);
    return out;
  }
  return bytes;
}

/** Parses one GLB into a scene. Throws when the bytes are not a glTF binary, name an outside URI, or have no mesh. */
export function parseGlb(bytes: Uint8Array): Promise<Object3D> {
  refuseOutsideUris(bytes);
  bytes = stripNodePivotExtras(bytes);
  const refused = { current: false };
  const manager = new LoadingManager();
  manager.setURLModifier(packUri(refused));
  const loader = new GLTFLoader(manager);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Promise((resolve, reject) => {
    const fail = (error: unknown): void => {
      reject(refused.current ? new ModelPackError(OUTSIDE_GLB) : error instanceof Error ? error : new ModelPackError(String(error)));
    };
    loader.parse(buffer, '', (gltf) => {
      const scene = gltf.scene;
      if (refused.current) {
        disposeObject(scene);
        reject(new ModelPackError(OUTSIDE_GLB));
        return;
      }
      let meshes = 0;
      scene.traverse((obj) => { if ((obj as Mesh).isMesh) meshes += 1; });
      const limit = meshes === 0 ? 'the GLB has no mesh' : visualLimit(scene);
      if (limit) {
        disposeObject(scene);
        reject(new ModelPackError(limit));
        return;
      }
      resolve(scene);
    }, fail);
  });
}

function templateFor(scene: Object3D, mapping: ModelMapping): Group {
  showUnlit(scene);
  const offset = new Group();
  offset.position.set(mapping.position[0], mapping.position[1], mapping.position[2]);
  offset.rotation.set(degrees(mapping.rotation[0]), degrees(mapping.rotation[1]), degrees(mapping.rotation[2]));
  offset.scale.setScalar(mapping.scale);
  offset.add(scene);
  const root = new Group();
  root.name = mapping.id;
  root.userData.modelPack = true;
  root.frustumCulled = false;
  root.add(offset);
  return root;
}

/**
 * Reads `models.json` out of `entries` and parses each GLB. A bad or missing GLB is one warning and is left out
 * of the pack, so the game's mesh is what draws. A bad manifest throws `ModelPackError` and nothing is installed.
 */
export async function loadModelPack(entries: readonly PackEntry[], parse: (bytes: Uint8Array) => Promise<Object3D> = parseGlb): Promise<LoadedModelPack> {
  const files = modelPackFiles(entries);
  const manifest = parseModelManifest(files.get(MODEL_PACK_MANIFEST)!);
  const templates = new Map<string, Object3D>();
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const mapping of manifest.models) {
    const bytes = packFile(files, mapping.file);
    if (!bytes) {
      warnSkip(seen, mapping.id, mapping.file, 'the file is not in the pack');
      skipped.push(mapping.id);
      continue;
    }
    if (bytes.byteLength > MODEL_PACK_LIMITS.glbBytes) {
      warnSkip(seen, mapping.id, mapping.file, `over ${MODEL_PACK_LIMITS.glbBytes} bytes`);
      skipped.push(mapping.id);
      continue;
    }
    try {
      const scene = await parse(bytes);
      templates.set(mapping.id.toLowerCase(), templateFor(scene, mapping));
    } catch (e) {
      const reason = e instanceof Error && e.message ? e.message : 'the file is not a GLB';
      warnSkip(seen, mapping.id, mapping.file, reason);
      skipped.push(mapping.id);
    }
  }
  return {
    manifest,
    ids: manifest.models.filter((model) => templates.has(model.id.toLowerCase())).map((model) => model.id),
    skipped,
    has: (id) => templates.has(id.toLowerCase()),
    clone: (id) => templates.get(id.toLowerCase())!.clone(true),
    dispose: () => {
      for (const template of templates.values()) disposeObject(template);
      templates.clear();
    },
  };
}

let primary: LoadedModelPack | null = null;
let second: LoadedModelPack | null = null;

function claimedIds(pack: LoadedModelPack): Set<string> {
  return new Set(pack.manifest.models.map((model) => model.id.toLowerCase()));
}

/** An id in both manifests: one warning, and the first pack's entry is the one `has` and `clone` use. */
function warnSharedIds(first: LoadedModelPack, next: LoadedModelPack): void {
  const claimed = claimedIds(first);
  for (const model of next.manifest.models) {
    if (!claimed.has(model.id.toLowerCase())) continue;
    console.warn(`Model pack: "${model.id}" is in both packs; the first pack's entry is kept.`);
  }
}

/** The draw source for two packs. The first pack's manifest wins an id, including one whose GLB was skipped. */
function combinePacks(first: LoadedModelPack, next: LoadedModelPack): { has(id: string): boolean; clone(id: string): Object3D; ids: readonly string[] } {
  const claimed = claimedIds(first);
  return {
    ids: [...first.ids, ...next.ids.filter((id) => !claimed.has(id.toLowerCase()))],
    has: (id) => (claimed.has(id.toLowerCase()) ? first.has(id) : next.has(id)),
    clone: (id) => (claimed.has(id.toLowerCase()) ? first : next).clone(id),
  };
}

function publish(): void {
  if (primary && second) {
    warnSharedIds(primary, second);
    setModelVisualSource(combinePacks(primary, second));
    return;
  }
  setModelVisualSource(primary ?? second);
}

function packIn(slot: ModelPackSlot): LoadedModelPack | null {
  return slot === 'second' ? second : primary;
}

/** Browser adaptation: query one live slot without treating the pack beside it as that slot. */
export function modelPackSlotInstalled(slot: ModelPackSlot = 'primary'): boolean { return packIn(slot) !== null; }

function setPack(slot: ModelPackSlot, pack: LoadedModelPack | null): void {
  if (slot === 'second') second = pack;
  else primary = pack;
}

function dropInstalled(): void {
  const gone = [primary, second];
  primary = null;
  second = null;
  setModelVisualSource(null);
  const seen = new Set<LoadedModelPack>();
  for (const pack of gone) {
    if (!pack || seen.has(pack)) continue;
    seen.add(pack);
    pack.dispose();
  }
}

function dropSlot(slot: ModelPackSlot): void {
  const previous = packIn(slot);
  setPack(slot, null);
  publish();
  previous?.dispose();
}

/**
 * Installs `pack` for `buildWorld` when `address` is the test room with `modmodels`. `slot` `second` sits beside
 * the primary pack; the same call with `primary` replaces only that pack. Any other address clears both packs and
 * installs nothing. Returns whether this pack is now installed. An id named by both keeps the first pack's entry.
 */
export function installModelPack(pack: LoadedModelPack, address: string, base = '/', slot: ModelPackSlot = 'primary'): boolean {
  if (!modelPackActive(address, base)) {
    dropInstalled();
    return false;
  }
  const other = slot === 'second' ? primary : second;
  // One object in both slots would be disposed twice. It is already installed.
  if (other === pack || packIn(slot) === pack) return true;
  const previous = packIn(slot);
  setPack(slot, pack);
  publish();
  previous?.dispose();
  return true;
}

/** Clears both installed packs and frees their geometry, materials and textures. */
export function clearModelPack(): void {
  dropInstalled();
}

/** Browser adaptation: a failed local activation must not clear a newer pack the visitor installed meanwhile. */
export function clearModelPackIf(pack: LoadedModelPack): boolean {
  if (primary !== pack) return false;
  dropSlot('primary');
  return true;
}

/** Browser adaptation: the agent's model removal drops one slot (the primary it installed), never the visitor's second. */
export function clearModelPackSlot(slot: ModelPackSlot = 'primary'): void {
  dropSlot(slot);
}

interface NamedSource {
  path: string;
  /**
   * `File.size`, or a zip member's declared uncompressed size. A function asks for that size without reading the
   * bytes (a directory handle's `getFile`). Checked before `read`.
   */
  size: number | (() => Promise<number>);
  read(): Promise<Uint8Array>;
}

async function sourceSize(source: NamedSource): Promise<number> {
  return typeof source.size === 'function' ? source.size() : source.size;
}

/**
 * `models.json` and the GLBs it names, and nothing else. Their sizes are added up and refused before any GLB is
 * read. A missing GLB is left out so the loader can warn and keep the game mesh.
 */
async function entriesNamed(sources: readonly NamedSource[]): Promise<PackEntry[]> {
  const files = sources.filter((source) => {
    const path = source.path.replace(/\\/g, '/');
    return path !== '' && !path.endsWith('/') && path !== '__MACOSX' && !path.startsWith('__MACOSX/');
  });
  const manifest = manifestSource(files);
  const manifestSize = await sourceSize(manifest.source);
  if (manifestSize > MODEL_PACK_LIMITS.manifestBytes) throw new ModelPackError('models.json: over 64 KiB');
  refusePackBytes(manifestSize);
  const manifestBytes = await manifest.source.read();
  const parsed = parseModelManifest(manifestBytes);
  let total = manifestSize;
  const wanted: NamedSource[] = [];
  for (const model of parsed.models) {
    const source = sourceFor(files, manifest.root, model.file);
    if (!source || wanted.includes(source)) continue;
    total += await sourceSize(source);
    refusePackBytes(total);
    wanted.push(source);
  }
  const entries: PackEntry[] = [{ path: MODEL_PACK_MANIFEST, bytes: manifestBytes }];
  for (const source of wanted) entries.push({ path: source.path.slice(manifest.root.length), bytes: await source.read() });
  return entries;
}

function manifestSource(files: readonly NamedSource[]): { source: NamedSource; root: string } {
  const direct = files.find((source) => source.path.replace(/\\/g, '/') === MODEL_PACK_MANIFEST);
  if (direct) return { source: direct, root: '' };
  const nests = files.filter((source) => source.path.replace(/\\/g, '/').endsWith(`/${MODEL_PACK_MANIFEST}`));
  if (nests.length === 0) throw new ModelPackError('models.json is missing');
  if (nests.length > 1) throw new ModelPackError('models.json appears in more than one folder');
  const path = nests[0]!.path.replace(/\\/g, '/');
  const root = path.slice(0, -MODEL_PACK_MANIFEST.length);
  return { source: nests[0]!, root };
}

function sourceFor(files: readonly NamedSource[], root: string, file: string): NamedSource | undefined {
  const want = `${root}${file}`.toLowerCase();
  const hits = files.filter((source) => source.path.replace(/\\/g, '/').toLowerCase() === want);
  return hits.length === 1 ? hits[0] : undefined;
}

export async function entriesFromZip(bytes: Uint8Array): Promise<PackEntry[]> {
  refusePackBytes(bytes.byteLength);
  try {
    const zip = await openZip(bytesSource(bytes));
    const sources = zip.members.filter((member) => !member.name.endsWith('/')).map((member) => ({
      path: member.name,
      size: member.size,
      read: () => zip.read(member),
    }));
    return await entriesNamed(sources);
  } catch (e) {
    if (e instanceof ModelPackError) throw e;
    if (e instanceof ZipError) throw new ModelPackError(e.message);
    throw new ModelPackError(e instanceof Error ? e.message : String(e));
  }
}

/** A folder the page can walk. The File System Access handle has these; the DOM lib here does not name `values`. */
export interface PackDirectory {
  values(): AsyncIterable<PackNode>;
  queryPermission?(descriptor: { mode: 'read' }): Promise<PermissionState>;
}
interface PackNode {
  readonly kind: string;
  readonly name: string;
  getFile(): Promise<Blob>;
  values(): AsyncIterable<PackNode>;
}

/** A file whose size is known only once the handle is opened. `getFile` runs the first time the size or the bytes are asked for. */
function lazyFile(path: string, getFile: () => Promise<Blob>): NamedSource {
  let opened: Promise<Blob> | undefined;
  const open = (): Promise<Blob> => (opened ??= getFile());
  return {
    path,
    size: () => open().then((file) => file.size),
    read: async () => new Uint8Array(await (await open()).arrayBuffer()),
  };
}

/** The files under a picked folder. Paths are relative to that folder. Only `models.json` and the GLBs it names are opened. */
export async function entriesFromDirectory(dir: PackDirectory): Promise<PackEntry[]> {
  const sources: NamedSource[] = [];
  await walkDir(dir, '', sources);
  return entriesNamed(sources);
}

async function walkDir(dir: PackDirectory, prefix: string, out: NamedSource[]): Promise<void> {
  const children: PackNode[] = [];
  for await (const child of dir.values()) children.push(child);
  children.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const child of children) {
    const path = prefix ? `${prefix}/${child.name}` : child.name;
    if (child.kind === 'file') out.push(lazyFile(path, () => child.getFile()));
    else await walkDir(child, path, out);
  }
}

interface ListedFile { name: string; size: number; webkitRelativePath?: string; arrayBuffer(): Promise<ArrayBuffer> }

/** A directory input's files (`webkitRelativePath`). `size` is `File.size`, checked before `arrayBuffer`. */
export async function entriesFromFileList(files: Iterable<ListedFile>): Promise<PackEntry[]> {
  const sources: NamedSource[] = [];
  for (const file of files) {
    const path = file.webkitRelativePath && file.webkitRelativePath.length > 0 ? file.webkitRelativePath : file.name;
    sources.push({ path, size: file.size, read: async () => new Uint8Array(await file.arrayBuffer()) });
  }
  return entriesNamed(sources);
}

/** A zip the page picked. `file.size` is refused before the archive is read. */
export async function entriesFromZipFile(file: { size: number; arrayBuffer(): Promise<ArrayBuffer> }): Promise<PackEntry[]> {
  refusePackBytes(file.size);
  return entriesFromZip(new Uint8Array(await file.arrayBuffer()));
}

function openDb(): Promise<IDBDatabase> {
  const idb = pageIndexedDb();
  if (!idb) return Promise.reject(new ModelPackError('no IndexedDB in this browser'));
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (reason: string): void => { if (settled) return; settled = true; clearTimeout(timer); reject(new ModelPackError(reason)); };
    const timer = setTimeout(() => fail('the model recovery store did not open in time'), 5000);
    let req: IDBOpenDBRequest;
    try { req = idb.open(DB_NAME, DB_VERSION); } catch (e) { fail(e instanceof Error ? e.message : 'the model recovery store could not open'); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => { if (settled) { req.result.close(); return; } settled = true; clearTimeout(timer); resolve(req.result); };
    req.onerror = () => fail(req.error?.message || 'the model pack store did not open');
    req.onblocked = () => fail('another tab holds an older model recovery store');
  });
}

function storedBytes(entries: readonly { bytes: { byteLength: number } }[]): number {
  let total = 0;
  for (const entry of entries) total += entry.bytes.byteLength;
  return total;
}

/** The size record, then whether a pack is stored. Neither read loads the GLB bytes. */
async function legacyStoredPackPlan(slot: PackStore = PRIMARY_STORE): Promise<PackPlan | null> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return null;
  }
  try {
    return await new Promise<PackPlan | null>((resolve, reject) => {
      const store = db.transaction(STORE, 'readonly').objectStore(STORE);
      const metaReq = store.get(slot.meta);
      metaReq.onerror = () => reject(metaReq.error);
      metaReq.onsuccess = () => {
        const meta = metaReq.result as StoredMeta | undefined;
        if (meta && Number.isFinite(meta.bytes) && meta.bytes >= 0) {
          resolve({ bytes: meta.bytes });
          return;
        }
        if (!slot.legacy) {
          resolve(null);
          return;
        }
        const keyReq = store.getKey(slot.key);
        keyReq.onerror = () => reject(keyReq.error);
        keyReq.onsuccess = () => resolve(keyReq.result === undefined ? null : { bytes: null });
      };
    });
  } catch {
    return null;
  } finally {
    db.close();
  }
}

interface ModelSlotData { pack: StoredPack | null; chunks: (ArrayBuffer | undefined)[]; meta: StoredMeta | null;
  identity?: NativePackIdentity; report?: CheckReport }
interface ModelData { primary: ModelSlotData; second: ModelSlotData }
const emptySlot = (): ModelSlotData => ({ pack: null, chunks: [], meta: null });
const modelDatabase = () => idbPackDatabase(pageIndexedDb);
const slotName = (slot: PackStore): ModelPackSlot => slot === SECOND_STORE ? 'second' : 'primary';

/** Read exactly one old value. The next cursor is opened only after this value's staged chunks commit. */
async function legacyModelRecord(key: string): Promise<unknown> {
  const db = await openDb();
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly'), store = tx.objectStore(STORE);
      const cursor = store.openCursor(key);
      let value: unknown;
      cursor.onsuccess = () => { value = cursor.result?.value; };
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(tx.error ?? new ModelPackError('the model recovery source could not be read'));
    });
  } finally { db.close(); }
}
async function legacyModelRecordCount(): Promise<number> {
  const db = await openDb();
  try { return await new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly'), count = tx.objectStore(STORE).count();
    tx.oncomplete = () => resolve(count.result);
    tx.onabort = () => reject(tx.error ?? new ModelPackError('the model recovery source could not be counted'));
  }); } finally { db.close(); }
}
/** Native boot may still read a selected legacy slot after first-migration failure. No legacy/common writes. */
async function legacyStoredModelPack(slot: PackStore): Promise<StoredPack | null> {
  const db = await openDb();
  try { return await new Promise<StoredPack | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly'), store = tx.objectStore(STORE);
    const header = store.get(slot.key), count = store.count();
    let result: StoredPack | null = null, started = false;
    const read = (): void => {
      if (started || header.readyState !== 'done' || count.readyState !== 'done') return;
      started = true;
      const value = header.result as StoredPack | undefined;
      if (!value) return;
      if (value.kind === 'folder' || value.entries) { result = value; return; }
      const files = value.files, length = value.chunks;
      if (!Array.isArray(files) || typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || length > count.result
        || files.some(file => !Number.isSafeInteger(file.bytes) || file.bytes < 0)) return;
      const declared = files.reduce((total, file) => total + file.bytes, 0);
      try { refusePackBytes(declared); } catch { return; }
      // Bounded by the header's declared total: once the bytes read exceed it, no further get is issued (LATER 460).
      const chunks: ArrayBuffer[] = [];
      let bytesRead = 0;
      const next = (): void => {
        if (chunks.length === length) {
          try { result = { kind: 'files', entries: assembleStoredFiles(files, chunks) }; } catch { /* Invalid legacy bytes stay uninstalled. */ }
          return;
        }
        const request = store.get(slot.chunkKey(chunks.length));
        request.onsuccess = () => {
          if (!(request.result instanceof ArrayBuffer)) return;
          bytesRead += request.result.byteLength;
          if (bytesRead > declared) return;
          chunks.push(request.result); next();
        };
      };
      next();
    };
    header.onsuccess = count.onsuccess = read;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error ?? new ModelPackError('the legacy model pack could not be read'));
  }); } finally { db.close(); }
}
/** Strip bytes from one cursor result as they are staged; opaque directory handles never request permission. */
async function* migrationValue(value: unknown, path: (string | number)[]): AsyncGenerator<PackMigrationPart, unknown> {
  if (value instanceof ArrayBuffer || value instanceof Uint8Array) {
    yield { type: 'bytes', path, bytes: value }; return null;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) value[index] = yield* migrationValue(value[index], [...path, index]);
  } else if (value && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) record[key] = yield* migrationValue(record[key], [...path, key]);
  }
  return value;
}
/** Old stores stay untouched. Both slots publish together, but at most one legacy value is read at a time. */
async function* legacyModelParts(): AsyncIterable<PackMigrationPart> {
  const metadata = { primary: emptySlot(), second: emptySlot() }, records = await legacyModelRecordCount();
  for (const name of ['primary', 'second'] as const) {
    const slot = storeFor(name), item = metadata[name];
    item.pack = (yield* migrationValue(await legacyModelRecord(slot.key) ?? null, [name, 'pack'])) as StoredPack | null;
    item.meta = (await legacyModelRecord(slot.meta) ?? null) as StoredMeta | null;
    const count = item.pack?.kind === 'files' ? item.pack.chunks ?? 0 : 0;
    if (!Number.isSafeInteger(count) || count < 0 || count > records) continue;
    for (let index = 0; index < count; index++)
      item.chunks.push((yield* migrationValue(await legacyModelRecord(slot.chunkKey(index)), [name, 'chunks', index])) as ArrayBuffer | undefined);
  }
  yield { type: 'metadata', data: metadata };
}
const missingModelMigration = async (): Promise<ModelData> => { throw new ModelPackError('the model migration marker is missing; retry'); };
async function ensureModelMigration(signal?: AbortSignal): Promise<ReturnType<typeof modelDatabase>> {
  const db = modelDatabase();
  await db.migrate('models', legacyModelParts, signal); return db;
}
function assembled(slot: ModelSlotData): StoredPack | null {
  const value = slot.pack;
  if (!value) return null;
  if (value.kind === 'folder' || value.entries) return value;
  if (!value.files || value.chunks !== slot.chunks.length || slot.chunks.some(chunk => !(chunk instanceof ArrayBuffer))) return null;
  try { return { kind: 'files', entries: assembleStoredFiles(value.files, slot.chunks as ArrayBuffer[]) }; }
  catch { return null; }
}
function planOf(slot: ModelSlotData, legacy: boolean): PackPlan | null {
  if (slot.meta && Number.isFinite(slot.meta.bytes) && slot.meta.bytes >= 0) return { bytes: slot.meta.bytes };
  return legacy && slot.pack ? { bytes: null } : null;
}
async function storedPackPlan(slot: PackStore = PRIMARY_STORE): Promise<PackPlan | null> {
  try {
    const scope = await modelDatabase().peek('models');
    if (scope) return planOf((scope.data as ModelData)[slotName(slot)], slot.legacy);
    return legacyStoredPackPlan(slot);
  } catch { return null; }
}

/** Storage observations include the shared generation; a later delete compares it inside the write transaction. */
export async function readStoredModelPackSnapshot(slot: ModelPackSlot = 'primary'): Promise<{ generation: number; pack: StoredPack | null }> {
  const db = await ensureModelMigration(), scope = await db.readAt<ModelSlotData>('models', [slot]);
  if (!scope) throw new ModelPackError('the model migration marker is missing; retry');
  return { generation: scope.generation, pack: assembled(scope.data) };
}
/** The pack this browser kept, files reassembled. The other live/storage slot is independent. */
export async function readStoredModelPack(slot: ModelPackSlot = 'primary'): Promise<StoredPack | null> {
  try { return (await readStoredModelPackSnapshot(slot)).pack; } catch {
    try {
      const db = modelDatabase();
      // Once migration published, the common scope owns removals/replacements. Never resurrect its old source.
      if (await db.peek('models')) return null;
      const legacy = await legacyStoredModelPack(storeFor(slot));
      // Another tab may have completed migration while the readonly legacy snapshot was being read.
      if (await db.peek('models')) {
        const current = await db.readAt<ModelSlotData>('models', [slot]);
        return current ? assembled(current.data) : null;
      }
      return legacy;
    } catch { return null; }
  }
}
/** After bounded first-open migration, listing reads only metadata, never current GLB byte records. */
export async function storedModelPackCatalogue(): Promise<{ generation: number; slots: { slot: ModelPackSlot; files: number; bytes: number;
  identity?: NativePackIdentity; report?: CheckReport }[] }> {
  const db = await ensureModelMigration(), scope = await db.peek('models');
  if (!scope) throw new ModelPackError('the model migration marker is missing; retry');
  const data = scope.data as ModelData;
  return { generation: scope.generation, slots: (['primary', 'second'] as const).flatMap(slot => {
    const item = data[slot];
    if (!item.pack) return [];
    const files = item.pack.kind === 'files' ? (item.pack.files?.length ?? item.pack.entries?.length ?? 0) : 0;
    return [{ slot, files, bytes: item.meta?.bytes ?? 0, identity: item.identity, report: item.identity?.report ?? item.report }];
  }) };
}
/** Metadata and bounded range readers, never the native whole-pack reassembly or renderer. */
export async function inspectStoredModelPack(slot: ModelPackSlot = 'primary', signal?: AbortSignal): Promise<NativePackObservation | null> {
  const db = await ensureModelMigration(signal), scope = await db.peek('models');
  if (!scope) return null;
  const item = (scope.data as ModelData)[slot];
  if (!item.pack) return null;
  const observation = { database: db, kind: 'models' as const, generation: scope.generation, refPath: [slot, 'identity', 'ref'], identity: item.identity };
  if (item.pack.kind === 'folder') return { ...observation, files: null };
  if (item.pack.entries) return { ...observation, files: item.pack.entries.map((file, index) =>
    memberAt(db, scope, [slot, 'pack', 'entries', index, 'bytes'], file.path, signal)) };
  if (!item.pack.files || item.pack.chunks !== item.chunks.length) throw new PackStorageError('FAILED', 'The saved model header is incomplete.');
  const chunks = item.chunks.map((_, index) => {
    const path = [slot, 'chunks', index];
    const binary = scope.binary.find(member => member.path.length === path.length && path.every((key, i) => key === member.path[i]));
    if (!binary) throw new PackStorageError('FAILED', 'A saved model chunk is missing.');
    return { path, bytes: binary.byteLength };
  });
  let offset = 0;
  const files = item.pack.files.map(file => {
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0) throw new PackStorageError('FAILED', 'A saved model file length is invalid.');
    const begin = offset, end = offset + file.bytes;
    let cursor = 0;
    const spans = chunks.flatMap(chunk => {
      const start = cursor; cursor += chunk.bytes;
      const from = Math.max(begin, start), to = Math.min(end, cursor);
      return to > from ? [{ path: chunk.path, offset: from - start, bytes: to - from }] : [];
    });
    if (spans.reduce((total, span) => total + span.bytes, 0) !== file.bytes)
      throw new PackStorageError('FAILED', 'The saved model file is incomplete.');
    offset = end;
    return storedMember(db, scope, file.path, spans, signal);
  });
  return { ...observation, files };
}
export async function identifyStoredModelPack(slot: ModelPackSlot, identity: NativePackIdentity, options: PackWriteOptions): Promise<void> {
  await (await ensureModelMigration(options.signal)).patch('models', missingModelMigration, data => {
    if (!data[slot].pack) throw new PackStorageError('CONFLICT', 'The selected model slot changed.');
    return { ...data, [slot]: { ...data[slot], identity, report: undefined } };
  }, options);
}
/** Browser adaptation: keep bytes without installing them or changing the live opt-in switch. */
export async function storeModelPackEntries(entries: readonly PackEntry[], slot: ModelPackSlot = 'primary',
  options: PackWriteOptions & { identity?: NativePackIdentity; validationReport?: CheckReport } = {}): Promise<void> {
  const stored = entriesToStored(entries);
  refusePackBytes(storedBytes(stored));
  await rememberPack({ kind: 'files', entries: stored }, storedBytes(stored), storeFor(slot), options);
}
/** Remove saved bytes only; the live surface owns the installed templates. Old callers address primary. */
export async function removeStoredModelPack(slot: ModelPackSlot = 'primary', options: { expectedGeneration?: number; signal?: AbortSignal } = {}): Promise<void> {
  await forgetPack(storeFor(slot), options);
}
async function storedPack(slot: PackStore = PRIMARY_STORE): Promise<StoredPack | null> {
  return readStoredModelPack(slotName(slot));
}
async function rememberPack(value: StoredPack, bytes: number, slot: PackStore = PRIMARY_STORE,
  options: PackWriteOptions & { identity?: NativePackIdentity; validationReport?: CheckReport } = {}): Promise<void> {
  let next: ModelSlotData = { pack: value, chunks: [], meta: { bytes } };
  if (value.kind === 'files' && value.entries) {
    const packed = chunkStoredFiles(value.entries);
    next = { pack: { kind: 'files', files: packed.files, chunks: packed.chunks.length }, chunks: packed.chunks, meta: { bytes } };
  }
  if (options.identity) next.identity = options.identity;
  else if (options.validationReport) next.report = options.validationReport;
  await (await ensureModelMigration(options.signal)).patch('models', missingModelMigration, data => ({ ...data, [slotName(slot)]: next }), options);
}
async function forgetPack(slot: PackStore = PRIMARY_STORE, options: { expectedGeneration?: number; signal?: AbortSignal } = {}): Promise<void> {
  await (await ensureModelMigration(options.signal)).patch('models', missingModelMigration, data => ({ ...data, [slotName(slot)]: emptySlot() }), options);
}
async function forgetBothPacks(): Promise<void> {
  await (await ensureModelMigration()).patch('models', missingModelMigration, () => ({ primary: emptySlot(), second: emptySlot() }));
}
function packAddress(): string {
  const loc = globalThis.location;
  if (!loc) return '';
  return `${loc.pathname}${loc.search}`;
}

function packBase(): string {
  return import.meta.env.BASE_URL ?? '/';
}

export async function applyEntries(
  entries: readonly PackEntry[],
  status: (line: string) => void,
  alive: () => boolean = () => true,
  address: string = packAddress(),
  slot: ModelPackSlot = 'primary',
): Promise<LoadedModelPack | null> {
  try {
    const pack = await loadModelPack(entries);
    if (!alive()) {
      pack.dispose();
      return null;
    }
    if (!installModelPack(pack, address, packBase(), slot)) {
      pack.dispose();
      status('Model pack: this page is not the test room with modmodels, so nothing was swapped.');
      return null;
    }
    return pack;
  } catch (e) {
    if (!alive()) return null;
    dropSlot(slot);
    status(`Model pack refused: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** The line the panel shows once the pack is installed and, for an import, once the store write has committed. */
function packOnLine(pack: LoadedModelPack, which: 'Model pack' | 'Second pack' = 'Model pack'): string {
  const names = pack.ids.join(', ');
  const skipped = pack.skipped.length ? ` ${pack.skipped.length} file${pack.skipped.length === 1 ? '' : 's'} not used (see the console).` : '';
  return pack.ids.length
    ? `${which} on: ${pack.ids.length} model${pack.ids.length === 1 ? '' : 's'} (${names}). A mapped prop, weapon, or world piece draws the GLB the next time the map is built.${skipped}`
    : `${which}: nothing mapped.${skipped}`;
}

/** Both packs, primary first. One pack alone is that pack's own line. */
function installedLine(): string {
  return [primary ? packOnLine(primary) : '', second ? packOnLine(second, 'Second pack') : ''].filter(Boolean).join(' ');
}

/** A write failure's text. An empty `message` (a quota error on some browsers) falls through to `name`, then `String`. */
function packWriteReason(e: unknown): string {
  const message = e instanceof Error ? e.message : '';
  const name = e instanceof Error ? e.name : '';
  return message || name || String(e) || 'unknown error';
}

/**
 * Installs `entries` and keeps them in this browser. The "on" line is said only after the write transaction
 * completes, so a reload after that line reads the pack back. A failed write is one console warning and is not "on".
 */
export async function keepModelPack(
  entries: readonly PackEntry[], status: (line: string) => void, address = packAddress(), slot: ModelPackSlot = 'primary',
): Promise<LoadedModelPack | null> {
  const pack = await applyEntries(entries, status, () => true, address, slot);
  if (!pack) return null;
  try {
    const stored = entriesToStored(entries);
    await rememberPack({ kind: 'files', entries: stored }, storedBytes(stored), storeFor(slot));
  } catch (e) {
    const reason = packWriteReason(e);
    console.warn(`Model pack: the pack was not kept (${reason}).`);
    status(`Model pack: the pack was not kept (${reason}).`);
    return pack;
  }
  status(installedLine());
  return pack;
}

async function applyDirectory(
  handle: FileSystemDirectoryHandle, status: (line: string) => void, alive: () => boolean = () => true, slot: ModelPackSlot = 'primary',
): Promise<void> {
  const entries = await entriesFromDirectory(handle as unknown as PackDirectory);
  if (!alive()) return;
  const pack = await applyEntries(entries, status, alive, packAddress(), slot);
  if (!pack) return;
  try {
    await rememberPack({ kind: 'folder', handle }, storedBytes(entries), storeFor(slot));
  } catch (e) {
    const reason = packWriteReason(e);
    console.warn(`Model pack: the folder was not kept (${reason}).`);
    status(`Model pack: the folder was not kept (${reason}).`);
    return;
  }
  status(installedLine());
}


/**
 * B206 ML-10 batch review F2 (ML.R14; product track, ML.R2): the MODS screen's model-pack switches, as the record holds
 * them (`../packs/modsState`, read through its models hint, so a page with none on opens nothing). A record that cannot
 * be read leaves every slot off: a switch not known to be on mounts nothing.
 */
export async function readModelSwitches(
  store: Pick<ModsStateStore, 'read'> = modsStateStore(modelDatabase(), pageSettings, () => null),
): Promise<ModelSwitches> {
  try { const { models } = await store.read(); return { primary: models.primary, second: models.second }; } catch { return { primary: false, second: false }; }
}
/** ML-10 F2: the kept packs' plans with every slot switched off in MODS dropped -- an off model pack is not mounted. */
export function switchedModelPlans<P>(plans: { primary: P | null; second: P | null }, on: ModelSwitches): { primary: P | null; second: P | null } {
  return { primary: on.primary ? plans.primary : null, second: on.second ? plans.second : null };
}

/** B206 ML-7: the model-pack section's one line (ML.R14). */
export const MODEL_PACK_LINE = 'Model packs: Home > Experiments > Mods. The ones switched on there are drawn here; reload the page after a change there.';
/** ML-10 F2: the status when packs are kept but none is switched on. */
export const MODEL_PACK_OFF_LINE = 'Model packs kept, none switched on in Home > Experiments > Mods.';

/**
 * The test room's model-pack section, appended to `#panel-body` (with `?modmodels`). Restores the packs this browser
 * kept. B206 ML-7 (plan 2026-11-06-mods-loader, ML.R14; OT.R110): the folder, zip, second-pack, Clear and Reload
 * controls left the page -- model packs are added, switched and removed in Home > Experiments > Mods (the same store);
 * what stays is one line saying so, the restore's status, the kept pieces' line and the world piece ids the hook's
 * `models.json` needs. Call it only when `modelPackActive` is true: it installs into `buildWorld`.
 */
export async function mountModelPack(doc: Document): Promise<void> {
  if (!modelPackActive(packAddress(), packBase())) return;
  const body = doc.getElementById('panel-body');
  if (!body || doc.getElementById('model-pack')) return;
  const status = doc.createElement('p');
  status.id = 'model-pack-status';
  status.className = 's2u-status';
  status.setAttribute('role', 'status');
  const say = (line: string): void => { status.textContent = line; };

  const section = doc.createElement('section');
  section.id = 'model-pack';
  section.className = 'section';
  section.setAttribute('aria-label', 'Model pack');
  const line = doc.createElement('p');
  line.id = 'model-pack-line';
  line.className = 's2u-field__note';
  line.textContent = MODEL_PACK_LINE;
  const pieces = doc.createElement('details');
  pieces.id = 'model-pack-piece-list';
  const piecesSummary = doc.createElement('summary');
  piecesSummary.textContent = 'World piece ids';
  const piecesNote = doc.createElement('p');
  piecesNote.className = 's2u-field__note';
  piecesNote.textContent = 'One direct child of the world, in the disc\u2019s order. Copy an id into models.json. A repeated name needs #0, #1, \u2026 The same list is __viewer.worldPieces().';
  const piecesList = doc.createElement('pre');
  piecesList.id = 'model-pack-pieces';
  piecesList.className = 's2u-field__note';
  piecesList.textContent = 'Load a map to list world pieces.';
  pieces.append(piecesSummary, piecesNote, piecesList);
  // #432 (OT.R69): the requested level pieces left on the disc's draw -- they move or break, or have no world draw of
  // their own; the page fills it on
  // each map (`main.ts` `show`, `worldPiecesKeptLine`).
  const kept = doc.createElement('p');
  kept.id = 'model-pack-kept';
  kept.className = 's2u-field__note';
  section.append(line, status, kept, pieces);
  body.append(section);

  say('No model pack.');
  const read = await readBootPlansWithin(MODEL_PACK_READY_WAIT_MS);
  if (read === 'late') {
    say(PACK_LATE_LINE);
    return;
  }
  // ML-10 F2: only the slots switched on in Home > Experiments > Mods are mounted.
  const plans = switchedModelPlans(read, await readModelSwitches());
  if (!plans.primary && !plans.second) {
    if (read.primary || read.second) say(MODEL_PACK_OFF_LINE);
    return;
  }
  const loadSaved = async (plan: PackPlan, slot: ModelPackSlot, late: string, loading: (bytes: number | null) => string): Promise<void> => {
    const wait = plan.bytes === null ? MODEL_PACK_READY_WAIT_MAX_MS : modelPackReadyWaitMs(plan.bytes);
    say(loading(plan.bytes));
    await runWithinPackDeadline((alive) => restore(say, alive, slot), () => { say(late); }, wait);
  };
  if (plans.primary) {
    await loadSaved(plans.primary, 'primary', PACK_LATE_LINE, (bytes) => bytes === null ? 'Loading model pack…' : modelPackLoadingLine(bytes));
  }
  if (plans.second) await loadSaved(plans.second, 'second', SECOND_LATE_LINE, secondLoadingLine);
}

/**
 * #410's re-check F3: the panel's work in the order it was asked. `retain` keeps an import already under way (its file
 * picker must open in the click itself); `after` runs a step once everything before it has settled, so a clear never
 * lands before an import's write; `settled` is all of it, which Reload waits on. A failed step does not stop the next.
 * LATER 309: `importing` is an import asked now -- its read starts at once (the picker, the file), and its `apply` (the
 * install and the store write) waits for every `after` step asked before it, so an import asked after a clear lands after
 * that clear and the clear cannot wipe it. No deadlock: an import waits only on clear steps asked before it, never on work
 * queued after them -- a step waits on what was queued before it, so nothing waits on itself (a gate on the whole queue
 * would: it holds the import). Not a "cleared since" generation (the row's first shape): a generation alone leaves the
 * clear queued after the slow import, so still after the later one's write. The returned promise is the import's own,
 * for its refusal line.
 */
export function packWorkQueue(): {
  retain(work: Promise<unknown>): void;
  after(step: () => unknown): Promise<void>;
  importing<T>(read: Promise<T>, apply: (value: T) => unknown): Promise<unknown>;
  settled(): Promise<void>;
} {
  let keeping: Promise<void> = Promise.resolve();
  let steps: Promise<void> = Promise.resolve();   // the last `after` step asked
  const quiet = (): void => {};
  const retain = (work: Promise<unknown>): void => { keeping = keeping.then(() => work).then(quiet, quiet); };
  return {
    retain,
    after(step) { keeping = keeping.then(step).then(quiet, quiet); steps = keeping; return keeping; },
    importing(read, apply) {
      const gate = steps;
      const work = read.then(async (value) => { await gate; return apply(value); });
      retain(work);
      return work;
    },
    settled() { return keeping; },
  };
}

/**
 * The floor of the boot wait. A saved pack adds `MODEL_PACK_READY_WAIT_MS_PER_MIB_ADAPTATION` per MiB of its stored size,
 * and the whole wait stops at `MODEL_PACK_READY_WAIT_MAX_MS` (52 s). After that the pack stays off for the visit.
 */
export const MODEL_PACK_READY_WAIT_MS = 2000;

/**
 * #410's re-check F1 (`TEST_ROOM_MODEL_PACK_ADAPTATION`; a browser adaptation, no original): the boot wait's rate, ms per
 * MiB of the stored pack -- 1 s per 10 MiB. Measured on the PR's own runs (Fuse's disc verification of 2fdbf6ddb, #410's
 * thread; a rendered browser run, not repeated here): the 117.8 MB (112.3 MiB) 4K pack read from this browser's store in
 * 1.7-2.2 s, 15-20 ms per MiB, and the 2K pack in 0.35-0.5 s. 100 ms per MiB is that read's margin taken five to six
 * and a half times over -- the 4K pack gets 13.2 s -- and the 52 s ceiling below is derived from it and the size cap,
 * not chosen.
 */
export const MODEL_PACK_READY_WAIT_MS_PER_MIB_ADAPTATION = 100;

/**
 * The longest boot will wait for a saved pack (`TEST_ROOM_MODEL_PACK_ADAPTATION`): the size cap's own wait, 2 s + 500 MiB
 * at the rate = 52 s. A pack kept before the size record existed waits this, never more (#410's re-check F1; was 60 s).
 */
export const MODEL_PACK_READY_WAIT_MAX_MS =
  MODEL_PACK_READY_WAIT_MS + Math.round((MODEL_PACK_LIMITS.packBytes / (1024 * 1024)) * MODEL_PACK_READY_WAIT_MS_PER_MIB_ADAPTATION);

/** 2 seconds, plus the rate per MiB, and never longer than the cap. A bad size stays at the floor. */
export function modelPackReadyWaitMs(bytes: number): number {
  const size = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const extra = Math.round((size / (1024 * 1024)) * MODEL_PACK_READY_WAIT_MS_PER_MIB_ADAPTATION);
  return Math.min(MODEL_PACK_READY_WAIT_MAX_MS, MODEL_PACK_READY_WAIT_MS + extra);
}

/** The status line while the saved bytes are still being read. `N` is the stored size in decimal MB (1,000,000 bytes). */
export function modelPackLoadingLine(bytes: number): string {
  const size = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const mb = Math.max(size > 0 ? 1 : 0, Math.round(size / 1_000_000));
  return `Loading model pack… ${mb} MB`;
}

/** One IndexedDB value stays under Chromium's memory-profile cap (133,169,152 bytes). A 500 MiB pack is many of these. */
export const MODEL_PACK_CHUNK_BYTES = 32 * 1024 * 1024;

/** The key of one chunk of the pack stored under `current`. */
export function modelPackChunkKey(index: number): string {
  return `c:${index}`;
}

/** The key of one chunk of the second pack. It does not share the primary pack's `c:` records. */
export function modelPackSecondChunkKey(index: number): string {
  return `s:${index}`;
}

/** The status line while the second pack's saved bytes are still being read. */
function secondLoadingLine(bytes: number | null): string {
  if (bytes === null) return 'Loading second model pack…';
  return modelPackLoadingLine(bytes).replace('Loading model pack', 'Loading second model pack');
}

/**
 * The pack's files laid end to end in records of at most `chunkBytes`. One file may cross a record. An empty pack
 * is no records.
 */
export function chunkStoredFiles(
  entries: readonly { path: string; bytes: ArrayBuffer }[],
  chunkBytes = MODEL_PACK_CHUNK_BYTES,
): { files: StoredFileSpan[]; chunks: ArrayBuffer[] } {
  if (!Number.isFinite(chunkBytes) || chunkBytes < 1) throw new ModelPackError('bad chunk size');
  const files = entries.map((entry) => ({ path: entry.path, bytes: entry.bytes.byteLength }));
  const chunks: ArrayBuffer[] = [];
  let pieces: Uint8Array[] = [];
  let filled = 0;
  const flush = (): void => {
    const out = new Uint8Array(filled);
    let at = 0;
    for (const piece of pieces) { out.set(piece, at); at += piece.byteLength; }
    chunks.push(out.buffer);
    pieces = [];
    filled = 0;
  };
  for (const entry of entries) {
    const view = new Uint8Array(entry.bytes);
    let off = 0;
    while (off < view.byteLength) {
      const take = Math.min(chunkBytes - filled, view.byteLength - off);
      pieces.push(view.subarray(off, off + take));
      filled += take;
      off += take;
      if (filled === chunkBytes) flush();
    }
  }
  if (filled > 0) flush();
  return { files, chunks };
}

/** The files back out of the chunk records, in the order `files` names. */
export function assembleStoredFiles(
  files: readonly StoredFileSpan[],
  chunks: readonly ArrayBuffer[],
): { path: string; bytes: ArrayBuffer }[] {
  const parts = chunks.map((chunk) => new Uint8Array(chunk));
  let ci = 0;
  let co = 0;
  const take = (n: number): ArrayBuffer => {
    const out = new Uint8Array(n);
    let at = 0;
    while (at < n) {
      const part = parts[ci];
      if (!part || co >= part.byteLength) throw new ModelPackError('the saved pack is short');
      const nTake = Math.min(part.byteLength - co, n - at);
      out.set(part.subarray(co, co + nTake), at);
      at += nTake;
      co += nTake;
      if (co >= part.byteLength) { ci += 1; co = 0; }
    }
    return out.buffer;
  };
  return files.map((file) => ({ path: file.path, bytes: take(file.bytes) }));
}

/**
 * Runs `work` until `waitMs`. When the wait ends first, `onTimeout` runs and `work` sees `alive()` false, so a late
 * answer does not install. Resolves when `work` finishes inside the window, or when the window ends.
 */
export function runWithinPackDeadline(
  work: (alive: () => boolean) => Promise<void>,
  onTimeout: () => void,
  waitMs = MODEL_PACK_READY_WAIT_MS,
): Promise<void> {
  return new Promise((resolve) => {
    let booted = false;
    const timer = setTimeout(() => {
      if (booted) return;
      booted = true;
      onTimeout();
      resolve();
    }, waitMs);
    work(() => !booted).then(() => {
      if (booted) return;
      booted = true;
      clearTimeout(timer);
      resolve();
    }, () => {
      if (booted) return;
      booted = true;
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Both size records, inside the floor wait. A late answer is `'late'` and does not start either pack read. */
async function readBootPlansWithin(waitMs: number): Promise<{ primary: PackPlan | null; second: PackPlan | null } | 'late'> {
  let primary: PackPlan | null = null;
  let second: PackPlan | null = null;
  let late = false;
  await runWithinPackDeadline(async (alive) => {
    const foundPrimary = await storedPackPlan(PRIMARY_STORE);
    const foundSecond = await storedPackPlan(SECOND_STORE);
    if (!alive()) return;
    primary = foundPrimary;
    second = foundSecond;
  }, () => { late = true; }, waitMs);
  return late ? 'late' : { primary, second };
}

function entriesToStored(entries: readonly PackEntry[]): { path: string; bytes: ArrayBuffer }[] {
  return entries.map((entry) => ({ path: entry.path, bytes: entry.bytes.buffer.slice(entry.bytes.byteOffset, entry.bytes.byteOffset + entry.bytes.byteLength) as ArrayBuffer }));
}

function isAbort(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError';
}

async function restore(say: (line: string) => void, alive: () => boolean = () => true, slot: ModelPackSlot = 'primary'): Promise<void> {
  const saved = await storedPack(storeFor(slot));
  if (!alive()) return;
  if (!saved) {
    if (slot === 'primary') say('No model pack.');
    return;
  }
  try {
    if (saved.kind === 'folder') {
      const perm = await (saved.handle as unknown as PackDirectory).queryPermission?.({ mode: 'read' });
      if (!alive()) return;
      if (perm !== 'granted') {
        say(slot === 'second'
          ? 'A second model folder is kept in this browser. Choose second folder to read it again.'
          : 'A model folder is kept in this browser. Choose model folder to read it again.');
        return;
      }
      await applyDirectory(saved.handle, say, alive, slot);
      return;
    }
    if (!alive() || !saved.entries) return;
    const entries = saved.entries.map((entry) => ({ path: entry.path, bytes: new Uint8Array(entry.bytes) }));
    const pack = await applyEntries(entries, say, alive, packAddress(), slot);
    if (pack && alive()) say(installedLine());
  } catch (e) {
    if (!alive()) return;
    say(`Model pack refused: ${e instanceof Error ? e.message : String(e)}`);
  }
}
