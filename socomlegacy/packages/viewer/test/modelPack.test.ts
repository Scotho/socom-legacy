import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory as FakeFactory, IDBObjectStore } from 'fake-indexeddb';
import { PACKS_DB, PACKS_SCOPES, PACKS_BYTES } from '../src/packs/storage';
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, Group, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, NoColorSpace, ShaderLib, SRGBColorSpace, Texture, Vector3, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DEFAULT_GRID_PARAMS, type ZAnimLight } from '@s2u/scene';
import { buildWorld } from '../src/world';
import { EffectLights } from '../src/effectLights';
import {
  applyEntries, clearModelPack, disposeObject, entriesFromDirectory, entriesFromFileList, entriesFromZip, entriesFromZipFile,
  assembleStoredFiles, chunkStoredFiles, installModelPack, keepModelPack, loadModelPack, MODEL_PACK_CHUNK_BYTES, unlitMaterial,
  readStoredModelPack, packWorkQueue,
  MODEL_PACK_READY_WAIT_MAX_MS, MODEL_PACK_READY_WAIT_MS, MODEL_PACK_READY_WAIT_MS_PER_MIB_ADAPTATION, modelPackChunkKey, modelPackLoadingLine, modelPackReadyWaitMs,
  modelPackSecondChunkKey,
  runWithinPackDeadline, visualLimit,
} from '../src/modelPackRuntime';
import { cloneMappedModel, hasMappedModel, mappedWorldPieceIds } from '../src/modelPackHook';
import { MODEL_PACK_LIMITS, ModelPackError, mappingFor, modelPackActive, modelPackFiles, parseModelManifest } from '../src/modelPack';
import { instanceRootMatrices } from '../src/loadMap';
import { IDENTITY, NODE_GENERIC, NODE_INSTANCE, NODE_MODEL, type SceneNode } from '@s2u/scene';
import type { LoadedMap, LoadedMesh } from '../src/loadMap';
import { makeZip } from './zipFixture';

/**
 * The test-room model pack (`TEST_ROOM_MODEL_PACK_ADAPTATION`): the manifest, the id lookup, a bad GLB falling back,
 * and the gate that keeps the loader off every page that is not `/testroom?modmodels`. The GLB is built here.
 */

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../src');

/** A glTF binary. `bin` is the GLB body; omit it when the JSON's buffer is not the body. */
function glbFrom(json: unknown, bin: Uint8Array = new Uint8Array(0)): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const binPad = (4 - (bin.length % 4)) % 4;
  const hasBin = bin.length > 0;
  const total = 12 + 8 + jsonBytes.length + jsonPad + (hasBin ? 8 + bin.length + binPad : 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  let at = 12;
  view.setUint32(at, jsonBytes.length + jsonPad, true);
  view.setUint32(at + 4, 0x4e4f534a, true);
  out.set(jsonBytes, at + 8);
  out.fill(0x20, at + 8 + jsonBytes.length, at + 8 + jsonBytes.length + jsonPad);
  at += 8 + jsonBytes.length + jsonPad;
  if (hasBin) {
    view.setUint32(at, bin.length + binPad, true);
    view.setUint32(at + 4, 0x004e4942, true);
    out.set(bin, at + 8);
  }
  return out;
}

const TRIANGLE_JSON = {
  asset: { version: '2.0' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
    { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
    { buffer: 0, byteOffset: 36, byteLength: 6, target: 34963 },
  ],
  buffers: [{ byteLength: 42 }],
};

/** A one-triangle glTF binary, positions (0,0,0), (1,0,0), (0,1,0). No texture, no game data. */
function triangleGlb(): Uint8Array {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint16Array([0, 1, 2]);
  const bin = new Uint8Array(42);
  bin.set(new Uint8Array(positions.buffer), 0);
  bin.set(new Uint8Array(indices.buffer), 36);
  return glbFrom(TRIANGLE_JSON, bin);
}

/**
 * The same triangle under a parent whose `extras.pivot` is `[1700, 0, 0]`, and a leaf that also names `pivot`.
 * three 0.186's `GLTFLoader.loadNode` treats a parent `extras.pivot` as its own pivot.
 */
function pivotGlb(): Uint8Array {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint16Array([0, 1, 2]);
  const bin = new Uint8Array(42);
  bin.set(new Uint8Array(positions.buffer), 0);
  bin.set(new Uint8Array(indices.buffer), 36);
  return glbFrom({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: 'building', translation: [10, 20, 30], extras: { pivot: [1700, 0, 0], keep: 'yes' }, children: [1] },
      { name: 'wall', translation: [1, 2, 3], extras: { pivot: [4, 5, 6], note: 'leaf' }, mesh: 0 },
    ],
    meshes: TRIANGLE_JSON.meshes,
    accessors: TRIANGLE_JSON.accessors,
    bufferViews: TRIANGLE_JSON.bufferViews,
    buffers: TRIANGLE_JSON.buffers,
  }, bin);
}

function parseWithThree(bytes: Uint8Array): Promise<Object3D> {
  const loader = new GLTFLoader();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Promise((resolve, reject) => {
    loader.parse(buffer, '', (gltf) => resolve(gltf.scene), reject);
  });
}

/** The same triangle, `count` times, so a pack can cross the triangle cap. */
function repeatedGlb(count: number): Uint8Array {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint32Array(count * 3);
  for (let i = 0; i < count; i++) indices.set([0, 1, 2], i * 3);
  const bin = new Uint8Array(36 + indices.byteLength);
  bin.set(new Uint8Array(positions.buffer), 0);
  bin.set(new Uint8Array(indices.buffer), 36);
  return glbFrom({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5125, count: indices.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 36, byteLength: indices.byteLength, target: 34963 },
    ],
    buffers: [{ byteLength: bin.length }],
  }, bin);
}

const manifest = (models: unknown): string => JSON.stringify({ format: 's2u-model-pack', version: 1, models });
const glb = triangleGlb();
function fileBytes(bytes: Uint8Array, name: string): File {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new File([copy], name);
}

afterEach(() => { clearModelPack(); });

describe('models.json', () => {
  it('reads an id, and fills in scale, rotation and position when they are left out', () => {
    const parsed = parseModelManifest(manifest([
      { id: 'm4Acarbine', file: 'm4a1.glb', scale: 0.1, rotation: [0, 180, 0], position: [1, 2, 3] },
      { id: 'crate_wood', file: 'mp6/crate.glb', note: 'ignored' },
    ]));
    expect(parsed.format).toBe('s2u-model-pack');
    expect(parsed.models[0]).toEqual({ id: 'm4Acarbine', file: 'm4a1.glb', scale: 0.1, rotation: [0, 180, 0], position: [1, 2, 3] });
    expect(parsed.models[1]).toEqual({ id: 'crate_wood', file: 'mp6/crate.glb', scale: 1, rotation: [0, 0, 0], position: [0, 0, 0] });
    expect(mappingFor(parsed, 'M4ACARBINE')?.file).toBe('m4a1.glb');
    expect(mappingFor(parsed, 'nope')).toBeNull();
  });

  it('accepts a level-piece id, including the ordinal that tells same-named buildings apart', () => {
    const parsed = parseModelManifest(manifest([
      { id: 'world:building_wc2#0', file: 'b0.glb', scale: 2, rotation: [0, 180, 0], position: [0, 3, 0] },
      { id: 'world:garage', file: 'garage.glb' },
    ]));
    expect(parsed.models[0]?.id).toBe('world:building_wc2#0');
    expect(parsed.models[0]).toMatchObject({ scale: 2, rotation: [0, 180, 0], position: [0, 3, 0] });
    expect(mappingFor(parsed, 'WORLD:BUILDING_WC2#0')?.file).toBe('b0.glb');
    expect(mappingFor(parsed, 'world:garage')?.file).toBe('garage.glb');
  });

  it('refuses a bad manifest, a second id, a scale of 0 and a file that leaves the pack', () => {
    expect(() => parseModelManifest('{"format":"nope"}')).toThrow(/models\.json: expected format/);
    expect(() => parseModelManifest(manifest([{ id: 'a', file: 'a.glb' }, { id: 'A', file: 'b.glb' }]))).toThrow(/listed twice/);
    expect(() => parseModelManifest(manifest([{ id: 'a', file: 'a.glb', scale: 0 }]))).toThrow(/scale must be greater than 0/);
    expect(() => parseModelManifest(manifest([{ id: 'a', file: '../a.glb' }]))).toThrow(/\.glb inside the pack/);
    expect(() => parseModelManifest(new Uint8Array([0xff, 0xfe]))).toThrow(/models\.json: not UTF-8/);
  });
});

describe('the pack files', () => {
  it('takes models.json at the root, or inside the one folder a zip adds, and ignores __MACOSX', () => {
    const nested = modelPackFiles([
      { path: 'pack/models.json', bytes: new Uint8Array([1]) },
      { path: 'pack/m4a1.glb', bytes: new Uint8Array([2]) },
      { path: '__MACOSX/pack/models.json', bytes: new Uint8Array([9]) },
    ]);
    expect([...nested.keys()]).toEqual(['models.json', 'm4a1.glb']);
    expect(() => modelPackFiles([{ path: 'readme.txt', bytes: new Uint8Array([1]) }])).toThrow(/models\.json is missing/);
    expect(() => modelPackFiles([
      { path: 'a/models.json', bytes: new Uint8Array([1]) },
      { path: 'b/models.json', bytes: new Uint8Array([1]) },
    ])).toThrow(/more than one folder/);
  });
});

describe('a GLB whose node extras name a pivot', () => {
  it('keeps the node translations; three 0.186 would move the parent and drop the child', async () => {
    const bytes = pivotGlb();
    const raw = await parseWithThree(bytes);
    const rawBuilding = raw.getObjectByName('building');
    const rawWall = raw.getObjectByName('wall');
    expect(rawBuilding).toBeTruthy();
    expect(rawWall).toBeTruthy();
    expect(rawBuilding!.position.toArray()).toEqual([-1690, 20, 30]);
    expect(rawWall!.position.toArray()).toEqual([0, 0, 0]);
    expect(rawBuilding!.pivot?.toArray()).toEqual([1700, 0, 0]);
    expect(rawBuilding!.userData.pivot).toBeUndefined();
    expect(rawBuilding!.userData.keep).toBe('yes');
    expect(rawWall!.pivot).toBeNull();
    expect(rawWall!.userData.pivot).toEqual([4, 5, 6]);

    const pack = await loadModelPack([
      { path: 'models.json', bytes: new TextEncoder().encode(manifest([{ id: 'crate', file: 'crate.glb' }])) },
      { path: 'crate.glb', bytes },
    ]);
    const root = pack.clone('crate');
    const building = root.getObjectByName('building');
    const wall = root.getObjectByName('wall');
    expect(building).toBeTruthy();
    expect(wall).toBeTruthy();
    expect(building!.position.toArray()).toEqual([10, 20, 30]);
    expect(wall!.position.toArray()).toEqual([1, 2, 3]);
    expect(building!.pivot).toBeNull();
    expect(wall!.pivot).toBeNull();
    expect(building!.userData.pivot).toBeUndefined();
    expect(wall!.userData.pivot).toBeUndefined();
    expect(building!.userData.keep).toBe('yes');
    expect(wall!.userData.note).toBe('leaf');
    building!.updateWorldMatrix(true, true);
    const corner = new Vector3(0, 0, 0).applyMatrix4(wall!.matrixWorld);
    expect(corner.toArray()).toEqual([11, 22, 33]);
  });
});

describe('a GLB that will not load', () => {
  const files = (extra: { path: string; bytes: Uint8Array }[] = []): { path: string; bytes: Uint8Array }[] => [
    { path: 'models.json', bytes: new TextEncoder().encode(manifest([
      { id: 'crate', file: 'crate.glb', scale: 2, position: [0, 3, 0] },
      { id: 'm4Acarbine', file: 'broken.glb' },
      { id: 'gone', file: 'missing.glb' },
    ])) },
    { path: 'crate.glb', bytes: glb },
    { path: 'broken.glb', bytes: new Uint8Array([1, 2, 3, 4]) },
    ...extra,
  ];

  it('parses the triangle, looks the id up without case, and warns once per bad file', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pack = await loadModelPack(files());
    expect(pack.ids).toEqual(['crate']);
    expect(pack.skipped).toEqual(['m4Acarbine', 'gone']);
    expect(pack.has('CRATE')).toBe(true);
    expect(pack.has('m4Acarbine')).toBe(false);
    const root = pack.clone('crate');
    expect(root.userData.modelPack).toBe(true);
    const offset = root.children[0]!;
    expect(offset.position.toArray()).toEqual([0, 3, 0]);
    expect(offset.scale.x).toBe(2);
    const meshes: Mesh[] = [];
    offset.traverse((obj) => { if ((obj as Mesh).isMesh) meshes.push(obj as Mesh); });
    expect(meshes[0]?.isMesh).toBe(true);
    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(messages.filter((line) => line.includes('m4Acarbine'))).toHaveLength(1);
    expect(messages.filter((line) => line.includes('gone'))).toHaveLength(1);
    expect(messages.every((line) => line.startsWith('Model pack:') && line.includes('The original mesh stays.'))).toBe(true);
    warn.mockRestore();
  });

  it('reads the same pack from a zip and from a folder handle', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const zip = makeZip([
      { name: 'Desert/models.json', data: manifest([{ id: 'crate', file: 'Crate.glb' }]), method: 0 },
      { name: 'Desert/crate.glb', data: glb, method: 0 },
    ]);
    const fromZip = await loadModelPack(await entriesFromZip(zip));
    expect(fromZip.has('crate')).toBe(true);
    const folder = {
      kind: 'directory', name: 'Desert',
      values: async function* () {
        yield { kind: 'file', name: 'models.json', getFile: async () => new File([manifest([{ id: 'crate', file: 'crate.glb' }])], 'models.json') };
        yield { kind: 'file', name: 'crate.glb', getFile: async () => fileBytes(glb, 'crate.glb') };
        yield { kind: 'file', name: 'notes.txt', getFile: async () => { throw new Error('unused was opened'); } };
      },
    } as unknown as Parameters<typeof entriesFromDirectory>[0];
    const fromDir = await loadModelPack(await entriesFromDirectory(folder));
    expect(fromDir.ids).toEqual(['crate']);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('the test-room gate', () => {
  const play = '/testroom?devtools&flyok&map=MP6&mode=play&devmode';

  it('is on only for the test room with modmodels', () => {
    expect(modelPackActive(`${play}&modmodels`)).toBe(true);
    expect(modelPackActive('/testroom?modmodels')).toBe(true);
    expect(modelPackActive('/testroom/?modmodels')).toBe(true);
    expect(modelPackActive('http://127.0.0.1:5173/testroom?modmodels')).toBe(true);
    expect(modelPackActive('/socomlegacy/testroom?modmodels', '/socomlegacy/')).toBe(true);
    expect(modelPackActive(play)).toBe(false);
    expect(modelPackActive('/testroom')).toBe(false);
    expect(modelPackActive('/testroom?devmode')).toBe(false);
    expect(modelPackActive('/?modmodels')).toBe(false);
    expect(modelPackActive('/?devmode&modmodels')).toBe(false);
    expect(modelPackActive('/setup?modmodels')).toBe(false);
    expect(modelPackActive('/forge?modmodels')).toBe(false);
    expect(modelPackActive('//evil.com/testroom?modmodels')).toBe(false);
  });

  it('installs only on that address, and a launcher address clears a pack that was installed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pack = await loadModelPack([
      { path: 'models.json', bytes: new TextEncoder().encode(manifest([{ id: 'crate', file: 'crate.glb' }])) },
      { path: 'crate.glb', bytes: glb },
    ]);
    expect(installModelPack(pack, '/?modmodels')).toBe(false);
    expect(hasMappedModel('crate')).toBe(false);
    expect(installModelPack(pack, `${play}&modmodels`)).toBe(true);
    expect(hasMappedModel('crate')).toBe(true);
    expect(cloneMappedModel('crate')?.userData.modelPack).toBe(true);
    expect(installModelPack(pack, play)).toBe(false);
    expect(hasMappedModel('crate')).toBe(false);
    warn.mockRestore();
  });

  it('the loader is gated in main; the local API may parse/store but cannot install global models', () => {
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith('.ts') && readFileSync(path, 'utf8').includes('modelPackRuntime')) hits.push(relative(src, path).replace(/\\/g, '/'));
      }
    };
    walk(src);
    // R6 (the Forge batch, item 3): forge/page.ts draws a pack piece's GLB through `parseGlb` (the same outside-URI refusal
    // and visual limits), by a dynamic import, and installs no global model (checked below).
    // FP-6 item 5: testroomContent.ts draws an authored map's pack props in the test room the same way, and installs none.
    expect(hits).toEqual(['forge/page.ts', 'main.ts', 'packs/registry.ts', 'testroom/agent/packs.ts', 'testroomContent.ts']);
    const forgePage = readFileSync(join(src, 'forge/page.ts'), 'utf8');
    expect(forgePage).toMatch(/await import\('\.\.\/modelPackRuntime'\)\)\.parseGlb\(/);
    const roomContent = readFileSync(join(src, 'testroomContent.ts'), 'utf8');
    expect(roomContent).toMatch(/await import\('\.\/modelPackRuntime'\)\)\.parseGlb\(/);
    expect(roomContent).not.toMatch(/^import[^;]*modelPackRuntime/m);
    expect(roomContent).not.toMatch(/\b(?:installModelPack|setModelVisualSource|clearModelPack|keepModelPack|applyEntries)\s*\(/);
    expect(forgePage).not.toMatch(/\b(?:installModelPack|setModelVisualSource|clearModelPack|keepModelPack|applyEntries)\s*\(/);
    const facade = readFileSync(join(src, 'agent/localPacks.ts'), 'utf8');
    expect(facade).toContain('createPackRegistry');
    expect(facade).not.toContain('modelPackRuntime');
    const local = readFileSync(join(src, 'packs/registry.ts'), 'utf8');
    expect(local).toContain("import('../modelPackRuntime')");
    expect(local).toContain('allowedSurface');
    expect(local).not.toMatch(/\b(?:installModelPack|setModelVisualSource|clearModelPack|keepModelPack|applyEntries)\s*\(/);
    // The only live local installer is the typed test-room driver. The generic parser/store API above stays inert.
    const driver = readFileSync(join(src, 'testroom/agent/packs.ts'), 'utf8');
    const install = driver.slice(driver.indexOf('async applyModel('), driver.indexOf('async applyTexture('));
    expect(driver).toContain('deps.allowed() === true');
    expect(install).toMatch(/await import\('\.\.\/\.\.\/modelPackRuntime'\);\s*check\(signal\);/);
    expect(install).toContain('modelPackActive(deps.modelAddress(),');
    expect(install).toMatch(/check\(signal\);\s*if \(!runtime\.installModelPack\(/);
    const main = readFileSync(join(src, 'main.ts'), 'utf8');
    const at = main.indexOf("import('./modelPackRuntime')");
    const gate = main.slice(at - 500, at);
    expect(gate).toContain('modelPackActive(');
    expect(gate).toContain('REPLAY_WORLD');
    expect(main.match(/import\(['"]\.\/modelPackRuntime['"]\)/g)).toHaveLength(1);
    expect(main).toContain('const packOn = !REPLAY_WORLD && modelPackActive(currentModelPackAddress(),');
    expect(main).not.toMatch(/agentModelsEnabled\s*\|\|\s*modelPackActive/);
    expect(main).toContain('return state?.buildAllowed === true && state.ready;');
    const setHits: string[] = [];
    const walkSet = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walkSet(path);
        else if (name.endsWith('.ts') && readFileSync(path, 'utf8').includes('setModelVisualSource')) setHits.push(relative(src, path));
      }
    };
    walkSet(src);
    expect(setHits.sort()).toEqual(['modelPackHook.ts', 'modelPackRuntime.ts']);
  });
});

describe('an outside URI', () => {
  const packFor = (bytes: Uint8Array): { path: string; bytes: Uint8Array }[] => [
    { path: 'models.json', bytes: new TextEncoder().encode(manifest([{ id: 'crate', file: 'crate.glb' }])) },
    { path: 'crate.glb', bytes },
  ];

  async function refused(bytes: Uint8Array): Promise<void> {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));
    try {
      const pack = await loadModelPack(packFor(bytes));
      expect(pack.has('crate')).toBe(false);
      expect(pack.skipped).toEqual(['crate']);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
      const line = String(warn.mock.calls[0]?.[0]);
      expect(line.startsWith('Model pack:')).toBe(true);
      expect(line).toContain('crate');
      expect(line).toContain('the GLB names an address outside the file');
      expect(line).toContain('The original mesh stays.');
      expect(installModelPack(pack, '/testroom?modmodels')).toBe(true);
      const view = buildWorld(map());
      for (const task of view.revealProps) task();
      const crate = view.group.getObjectByName('crate');
      expect(crate).toBeInstanceOf(Mesh);
      expect(crate?.userData.modelPack).toBeUndefined();
    } finally {
      warn.mockRestore();
      error.mockRestore();
      fetchSpy.mockRestore();
    }
  }

  it('does not fetch a buffer URI, warns once, and draws the game mesh', async () => {
    const outside = structuredClone(TRIANGLE_JSON);
    outside.buffers = [{ byteLength: 42, uri: 'https://evil.example/buf.bin' } as unknown as { byteLength: number }];
    await refused(glbFrom(outside));
  });

  it('does not fetch an image URI, warns once, and draws the game mesh', async () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint16Array([0, 1, 2]);
    const bin = new Uint8Array(42);
    bin.set(new Uint8Array(positions.buffer), 0);
    bin.set(new Uint8Array(indices.buffer), 36);
    const json = {
      ...TRIANGLE_JSON,
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      textures: [{ source: 0 }],
      images: [{ uri: 'https://evil.example/tex.png' }],
    };
    await refused(glbFrom(json, bin));
  });
});

describe('the pack cap, before a read', () => {
  const named = manifest([{ id: 'crate', file: 'crate.glb' }]);

  it('refuses a named zip member from its declared size and does not unpack it', async () => {
    const zip = makeZip([
      { name: 'models.json', data: named, method: 0 },
      { name: 'crate.glb', data: glb, method: 0, size: MODEL_PACK_LIMITS.packBytes + 1 },
    ]);
    await expect(entriesFromZip(zip)).rejects.toBeInstanceOf(ModelPackError);
    await expect(entriesFromZip(zip)).rejects.toThrow(/the pack is over/);
  });

  it('does not read a member the manifest does not name, even when that member claims to be huge', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const zip = makeZip([
      { name: 'models.json', data: named, method: 0 },
      { name: 'crate.glb', data: glb, method: 0 },
      { name: 'unused.bin', data: new Uint8Array([1]), method: 0, size: MODEL_PACK_LIMITS.packBytes + 1 },
    ]);
    const pack = await loadModelPack(await entriesFromZip(zip));
    expect(pack.has('crate')).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('refuses a zip from File.size before arrayBuffer', async () => {
    let read = false;
    await expect(entriesFromZipFile({
      size: MODEL_PACK_LIMITS.packBytes + 1,
      arrayBuffer: async () => { read = true; return new ArrayBuffer(0); },
    })).rejects.toThrow(/the pack is over/);
    expect(read).toBe(false);
  });

  it('keeps a declared total of 500 MiB and refuses one byte over, without a buffer of that size', async () => {
    expect(MODEL_PACK_LIMITS.packBytes).toBe(500 * 1024 * 1024);
    expect(MODEL_PACK_LIMITS.glbBytes).toBe(500 * 1024 * 1024);
    const manifestBytes = new TextEncoder().encode(named);
    const under = MODEL_PACK_LIMITS.packBytes - manifestBytes.byteLength;
    let underRead = false;
    const entries = await entriesFromFileList([
      { name: 'models.json', size: manifestBytes.byteLength, arrayBuffer: async () => manifestBytes.slice().buffer },
      { name: 'crate.glb', size: under, arrayBuffer: async () => { underRead = true; return glb.slice().buffer; } },
    ]);
    expect(under).toBeLessThan(MODEL_PACK_LIMITS.packBytes);
    expect(under + manifestBytes.byteLength).toBe(MODEL_PACK_LIMITS.packBytes);
    expect(underRead).toBe(true);
    expect(entries.map((entry) => entry.path)).toEqual(['models.json', 'crate.glb']);
    expect(entries[1]?.bytes.byteLength).toBe(glb.byteLength);
    let overRead = false;
    await expect(entriesFromFileList([
      { name: 'models.json', size: manifestBytes.byteLength, arrayBuffer: async () => manifestBytes.slice().buffer },
      { name: 'crate.glb', size: under + 1, arrayBuffer: async () => { overRead = true; return glb.slice().buffer; } },
    ])).rejects.toThrow(new RegExp(`the pack is over ${MODEL_PACK_LIMITS.packBytes} bytes`));
    expect(overRead).toBe(false);
    let zipRead = false;
    const zip = makeZip([
      { name: 'models.json', data: named, method: 0 },
      { name: 'crate.glb', data: glb, method: 0 },
    ]);
    const fromZip = await entriesFromZipFile({
      size: MODEL_PACK_LIMITS.packBytes,
      arrayBuffer: async () => { zipRead = true; const copy = new ArrayBuffer(zip.byteLength); new Uint8Array(copy).set(zip); return copy; },
    });
    expect(zipRead).toBe(true);
    expect(fromZip.some((entry) => entry.path === 'crate.glb')).toBe(true);
  });

  it('reads only the files the manifest names, and checks File.size first', async () => {
    let unused = false;
    let glbRead = false;
    const manifestBytes = new TextEncoder().encode(named);
    const entries = await entriesFromFileList([
      { name: 'models.json', size: manifestBytes.byteLength, arrayBuffer: async () => manifestBytes.slice().buffer },
      { name: 'crate.glb', size: glb.byteLength, arrayBuffer: async () => { glbRead = true; return glb.slice().buffer; } },
      { name: 'unused.bin', size: 4, arrayBuffer: async () => { unused = true; return new ArrayBuffer(4); } },
    ]);
    expect(unused).toBe(false);
    expect(glbRead).toBe(true);
    expect(entries.map((entry) => entry.path)).toEqual(['models.json', 'crate.glb']);
    let over = false;
    await expect(entriesFromFileList([
      { name: 'models.json', size: manifestBytes.byteLength, arrayBuffer: async () => manifestBytes.slice().buffer },
      { name: 'crate.glb', size: MODEL_PACK_LIMITS.packBytes, arrayBuffer: async () => { over = true; return glb.slice().buffer; } },
    ])).rejects.toThrow(/the pack is over/);
    expect(over).toBe(false);
  });
});

describe('geometry, materials and textures', () => {
  const one = (): { path: string; bytes: Uint8Array }[] => [
    { path: 'models.json', bytes: new TextEncoder().encode(manifest([{ id: 'crate', file: 'crate.glb' }])) },
    { path: 'crate.glb', bytes: glb },
  ];

  it('drops them when the pack is cleared or replaced, and when the page will not install it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const geometry = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const first = await loadModelPack(one());
    const second = await loadModelPack(one());
    expect(installModelPack(first, '/testroom?modmodels')).toBe(true);
    const dropped = vi.spyOn(first, 'dispose');
    expect(installModelPack(second, '/testroom?modmodels')).toBe(true);
    expect(dropped).toHaveBeenCalledTimes(1);
    expect(hasMappedModel('crate')).toBe(true);
    clearModelPack();
    expect(hasMappedModel('crate')).toBe(false);
    expect(geometry).toHaveBeenCalled();
    geometry.mockClear();
    const rejected = await applyEntries(one(), () => {}, () => true, '/');
    expect(rejected).toBeNull();
    expect(hasMappedModel('crate')).toBe(false);
    expect(geometry).toHaveBeenCalled();
    geometry.mockRestore();
    warn.mockRestore();
  });

  it('warns and skips a texture or a triangle count over the cap', async () => {
    const texture = new Texture();
    texture.image = { width: MODEL_PACK_LIMITS.textureEdge + 1, height: 8 };
    const mesh = new Mesh(
      new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(9), 3)),
      new MeshBasicMaterial({ map: texture }),
    );
    expect(visualLimit(mesh)).toBe(`a texture is ${MODEL_PACK_LIMITS.textureEdge + 1} px on a side, over ${MODEL_PACK_LIMITS.textureEdge}`);
    const tex = vi.spyOn(texture, 'dispose');
    disposeObject(mesh);
    expect(tex).toHaveBeenCalledTimes(1);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pack = await loadModelPack([
      { path: 'models.json', bytes: new TextEncoder().encode(manifest([{ id: 'crate', file: 'crate.glb' }])) },
      { path: 'crate.glb', bytes: repeatedGlb(MODEL_PACK_LIMITS.triangles + 1) },
    ]);
    expect(pack.has('crate')).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain(`${MODEL_PACK_LIMITS.triangles + 1} triangles is over ${MODEL_PACK_LIMITS.triangles}`);
    expect(String(warn.mock.calls[0]?.[0])).toContain('The original mesh stays.');
    warn.mockRestore();
  });
});

describe('a native export\'s brightness', () => {
  /** The sRGB EOTF an `SRGBColorSpace` upload applies to a stored byte. */
  function srgbToLinear(byte: number): number {
    const s = byte / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }

  it('samples the stored byte on the second pack, within 2% of the map, and leaves COLOR_0 at x1', async () => {
    // `tools/export-gltf.ts` writes the GS byte into the PNG and unity (the byte over 128, already 1) as COLOR_0 255.
    // GLTFLoader tags that base colour sRGB and, for KHR_materials_unlit, builds a MeshBasicMaterial. The early return
    // used to keep the tag. A flat 128 then sampled as the sRGB decode below, about half the map's 128/255.
    const bytes = [128, 96, 160, 200];
    const rgba = new Uint8Array(bytes.flatMap((b) => [b, b, b, 255]));
    const texture = new Texture();
    texture.image = { width: 2, height: 2, data: rgba };
    texture.colorSpace = SRGBColorSpace;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]), 4));
    const scene = new Group();
    scene.add(new Mesh(geometry, new MeshBasicMaterial({ map: texture, color: 0xffffff, vertexColors: true })));
    const pack = await loadModelPack([
      { path: 'models.json', bytes: new TextEncoder().encode(manifest([{ id: 'g47', file: 'g47.glb' }])) },
      { path: 'g47.glb', bytes: glb },
    ], async () => scene);
    expect(installModelPack(pack, '/testroom?modmodels', '/', 'second')).toBe(true);
    const root = cloneMappedModel('g47');
    expect(root).not.toBeNull();
    let drawn: MeshBasicMaterial | null = null;
    root!.traverse((obj) => {
      const mesh = obj as Mesh;
      if (mesh.isMesh) drawn = mesh.material as MeshBasicMaterial;
    });
    expect(drawn).toBeInstanceOf(MeshBasicMaterial);
    const material = drawn!;
    expect(material.map).toBe(texture);
    expect(material.map!.colorSpace).toBe(NoColorSpace);
    expect(material.vertexColors).toBe(true);
    expect(material.color.getHex()).toBe(0xffffff);
    const color = geometry.getAttribute('color');
    expect([color.getX(0), color.getY(0), color.getZ(0)]).toEqual([1, 1, 1]);
    const mean = (decode: boolean): number => {
      let sum = 0;
      for (const byte of bytes) sum += (decode ? srgbToLinear(byte) : byte / 255) * color.getX(0);
      return sum / bytes.length;
    };
    const native = mean(false);
    const before = mean(true);
    const after = mean(material.map!.colorSpace !== NoColorSpace);
    expect(Math.abs(after - native) / native).toBeLessThan(0.02);
    expect(after).toBeCloseTo(native, 6);
    const midNative = 128 / 255;
    const midBefore = srgbToLinear(128);
    expect(midBefore / midNative).toBeCloseTo(0.43003459007065864, 6);
    expect(before / native).toBeCloseTo(0.5510201592288314, 6);
    const glow = new Texture();
    glow.colorSpace = SRGBColorSpace;
    const standardMap = new Texture();
    standardMap.colorSpace = SRGBColorSpace;
    const standard = unlitMaterial(new MeshStandardMaterial({ map: standardMap, emissiveMap: glow })) as MeshBasicMaterial & { emissiveMap: Texture };
    expect(standard.map!.colorSpace).toBe(NoColorSpace);
    expect(standard.emissiveMap.colorSpace).toBe(NoColorSpace);
  });
});

describe('the boot wait', () => {
  const mib = 1024 * 1024;

  it('stops at 2s and a late answer stays off', async () => {
    expect(MODEL_PACK_READY_WAIT_MS).toBe(2000);
    vi.useFakeTimers();
    try {
      let release: () => void = () => {};
      const hung = new Promise<void>((resolve) => { release = resolve; });
      let aliveAfter = true;
      let timedOut = false;
      const done = runWithinPackDeadline(async (alive) => {
        await hung;
        aliveAfter = alive();
      }, () => { timedOut = true; });
      await vi.advanceTimersByTimeAsync(MODEL_PACK_READY_WAIT_MS + 1);
      await done;
      expect(timedOut).toBe(true);
      release();
      await hung;
      expect(aliveAfter).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  // #410's re-check F1 (taken over, OT.R69): the ceiling is the size cap's own wait (2 s + 500 MiB at the rate = 52 s), a
  // pack kept before the size record waits that, never 60 s; the rate is a named adaptation, citing the measured read.
  it('scales the wait from the stored size, about 1s per 10 MiB, and stops at the size cap\'s own 52s (#410 F1)', () => {
    expect(MODEL_PACK_READY_WAIT_MS_PER_MIB_ADAPTATION).toBe(100);
    expect(MODEL_PACK_READY_WAIT_MAX_MS).toBe(52_000);
    expect(MODEL_PACK_READY_WAIT_MAX_MS).toBe(modelPackReadyWaitMs(MODEL_PACK_LIMITS.packBytes));
    expect(modelPackReadyWaitMs(0)).toBe(MODEL_PACK_READY_WAIT_MS);
    expect(modelPackReadyWaitMs(-1)).toBe(MODEL_PACK_READY_WAIT_MS);
    expect(modelPackReadyWaitMs(Number.NaN)).toBe(MODEL_PACK_READY_WAIT_MS);
    expect(modelPackReadyWaitMs(10 * mib)).toBe(3_000);
    expect(modelPackReadyWaitMs(24 * mib)).toBe(4_400);
    expect(modelPackReadyWaitMs(Math.round(117.8 * mib))).toBe(13_780);
    expect(modelPackReadyWaitMs(500 * mib)).toBe(52_000);
    expect(modelPackReadyWaitMs(1000 * mib)).toBe(MODEL_PACK_READY_WAIT_MAX_MS);
    expect(modelPackLoadingLine(24 * mib)).toBe('Loading model pack… 25 MB');
    expect(modelPackLoadingLine(118_000_000)).toBe('Loading model pack… 118 MB');
    expect(modelPackLoadingLine(Math.round(117.8 * mib))).toBe('Loading model pack… 124 MB');
  });

  it('a large pack does not time out at 2s, and a late answer after the scaled wait stays off', async () => {
    const wait = modelPackReadyWaitMs(Math.round(117.8 * mib));
    expect(wait).toBeGreaterThan(MODEL_PACK_READY_WAIT_MS);
    vi.useFakeTimers();
    try {
      let release: () => void = () => {};
      const hung = new Promise<void>((resolve) => { release = resolve; });
      let aliveAfter = true;
      let timedOut = false;
      const done = runWithinPackDeadline(async (alive) => {
        await hung;
        aliveAfter = alive();
      }, () => { timedOut = true; }, wait);
      await vi.advanceTimersByTimeAsync(MODEL_PACK_READY_WAIT_MS + 1);
      expect(timedOut).toBe(false);
      await vi.advanceTimersByTimeAsync(wait - MODEL_PACK_READY_WAIT_MS);
      await done;
      expect(timedOut).toBe(true);
      release();
      await hung;
      expect(aliveAfter).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

const part = (): LoadedMesh => ({
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), uvs: new Float32Array(6),
  colors: new Float32Array(12).fill(1), normals: null, faceNormals: null, indices: new Uint32Array([0, 1, 2]),
  textureName: 'door.tif', fog: true, lit: false, order: 0, orderEnd: 0, cull: true, alternate: false, scroll: null,
});
const at = (x: number, y: number, z: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const map = (): LoadedMap => ({
  archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', world: [], lines: null,
  props: [
    { modelName: 'crate', parts: [part()], matrices: new Float32Array(at(10, 0, 0)), order: 0, alternate: false, facade: 0, lod: null,
      paths: ['worldmodel/door_a/door1=crate'] },
    { modelName: 'other', parts: [part()], matrices: new Float32Array(at(0, 0, 0)), order: 1, alternate: false, facade: 0, lod: null },
  ],
  textures: { 'door.tif': { data: new Uint8ClampedArray(16).fill(255), width: 2, height: 2 } },
  textureFlags: { 'door.tif': { bilinear: true, transparent: false, graded: false, opaque: true, gs: null } },
  metersPerUnit: 0.1, lightRig: null, origin: [0, 0, 0], detail: {}, grid: DEFAULT_GRID_PARAMS,
  collision: { positions: new Float32Array([1, 2, 3]), colors: new Uint8Array(0), polygons: 1 },
  slots: [], diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
  weapons: { m4Acarbine: { name: 'm4Acarbine', parts: [part(), part()], points: [{ name: 'firepoint', at: [1, 2, 3] }] } },
} as LoadedMap);

describe('a pack remake and the animated-light pass', () => {
  it('makes no overlay copies of a swapped mesh, and still re-draws a native mesh the light reaches', async () => {
    const pack = await loadModelPack([
      { path: 'models.json', bytes: new TextEncoder().encode(manifest([{ id: 'crate', file: 'crate.glb' }])) },
      { path: 'crate.glb', bytes: glb },
    ]);
    expect(installModelPack(pack, '/testroom?modmodels')).toBe(true);
    const remake = cloneMappedModel('crate');
    expect(remake).toBeTruthy();
    remake!.visible = false;
    const native = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
    const world = new Group();
    world.add(native);
    world.add(remake!);
    const lights = new EffectLights();
    lights.setReceivers(() => [world]);
    lights.setTexture(null);
    lights.warmMeshes();
    const copies = (root: Object3D): Object3D[] => {
      const found: Object3D[] = [];
      root.traverse((obj) => { if (obj.userData.effectLightPass === true) found.push(obj); });
      return found;
    };
    const drawn = remake!.getObjectByProperty('isMesh', true) as Mesh;
    expect(drawn.userData.modelPackDraw).toBe(true);
    expect(native.userData.modelPackDraw).toBeUndefined();
    expect(copies(remake!)).toHaveLength(0);
    expect(lights.stats().pooled).toBe(2);
    lights.warmDone();
    remake!.visible = true;
    const light = {
      flags: 0, node: null, atContext: false, offset: [0, 0, 0], rgb: [255, 200, 120], opacity: 64, blend: 0x48,
      ranges: [[0, 0, 50], [0.2, 0, 50]], duration: 0.2,
    } as unknown as ZAnimLight;
    lights.begin(light, [0, 0, 0], () => true);
    expect(copies(remake!)).toHaveLength(0);
    expect(world.children.filter((obj) => obj.userData.effectLightPass === true && obj.visible)).toHaveLength(1);
    expect(lights.stats().pooled).toBe(2);
  });
});

describe('buildWorld draws the GLB and leaves the rest of the map', () => {
  it('without a pack, the prop and the weapon are the game meshes', () => {
    const view = buildWorld(map());
    for (const task of view.revealProps) task();
    const crate = view.group.getObjectByName('crate');
    expect(crate).toBeInstanceOf(Mesh);
    expect(crate?.userData.modelPack).toBeUndefined();
    expect(view.triangles).toBe(2);
    const weapon = view.held('m4Acarbine')!;
    expect(weapon.children.filter((child) => (child as Mesh).isMesh)).toHaveLength(2);
  });

  it('with a pack on the test room, the mapped prop and weapon are the GLB and the other prop is not', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loaded = map();
    const collision = loaded.collision.positions;
    const pack = await loadModelPack([
      { path: 'models.json', bytes: new TextEncoder().encode(manifest([
        { id: 'crate', file: 'crate.glb', scale: 2, position: [0, 3, 0] },
        { id: 'm4Acarbine', file: 'm4.glb' },
      ])) },
      { path: 'crate.glb', bytes: glb },
      { path: 'm4.glb', bytes: glb },
    ]);
    expect(installModelPack(pack, '/testroom?modmodels')).toBe(true);
    const view = buildWorld(loaded);
    for (const task of view.revealProps) task();
    expect(loaded.collision.positions).toBe(collision);
    expect(loaded.weapons?.m4Acarbine?.points[0]?.at).toEqual([1, 2, 3]);
    const crate = view.group.getObjectByName('crate')!;
    expect(crate.userData.modelPack).toBe(true);
    expect(crate).not.toBeInstanceOf(Mesh);
    crate.updateWorldMatrix(true, true);
    const drawn = crate.getObjectByProperty('isMesh', true) as Mesh;
    const corner = new Vector3(1, 0, 0).applyMatrix4(drawn.matrixWorld);
    expect(corner.x).toBeCloseTo(12, 5);
    expect(corner.y).toBeCloseTo(3, 5);
    expect(corner.z).toBeCloseTo(0, 5);
    const other = view.group.getObjectByName('other');
    expect(other).toBeInstanceOf(Mesh);
    expect(other?.userData.modelPack).toBeUndefined();
    const weapon = view.held('m4Acarbine')!;
    expect(weapon.children.some((child) => child.userData.modelPack === true)).toBe(true);
    expect(weapon.children.filter((child) => (child as Mesh).isMesh && child.userData.modelPack !== true)).toHaveLength(0);
    const shift = new Matrix4().makeTranslation(0, 0, 5);
    expect(view.moveNode('worldmodel/door_a', shift.toArray())).toBe(1);
    crate.updateWorldMatrix(true, true);
    expect(new Vector3().setFromMatrixPosition(crate.matrixWorld).toArray().map((n) => Math.round(n))).toEqual([10, 0, 5]);
    expect((crate.children[0] as { scale: Vector3 }).scale.x).toBe(2);
    warn.mockRestore();
  });

  it('draws one GLB per prop instance, not one per sub-part', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loaded = map();
    loaded.props = [
      { modelName: 'crate', parts: [part(), part()], matrices: new Float32Array(at(10, 0, 0)), order: 0, alternate: false, facade: 0, lod: null,
        paths: ['worldmodel/door=crate'] },
      { modelName: 'crate', parts: [part()], matrices: new Float32Array(at(10, 2, 0)), order: 1, alternate: false, facade: 0, lod: null,
        paths: ['worldmodel/door=crate/lid'] },
      { modelName: 'crate', parts: [part()], matrices: new Float32Array(at(10, 3, 0)), order: 2, alternate: true, facade: 0, lod: null,
        paths: ['worldmodel/door=crate/broken'] },
      { modelName: 'crate', parts: [part(), part(), part()], matrices: new Float32Array([...at(20, 0, 0), ...at(30, 0, 0)]), order: 3, alternate: false, facade: 0, lod: null,
        paths: ['worldmodel/ramp=crate/panel', 'worldmodel/shed=crate'] },
      { modelName: 'other', parts: [part()], matrices: new Float32Array(at(0, 0, 0)), order: 4, alternate: false, facade: 0, lod: null },
    ];
    const pack = await loadModelPack([
      { path: 'models.json', bytes: new TextEncoder().encode(manifest([{ id: 'crate', file: 'crate.glb' }])) },
      { path: 'crate.glb', bytes: glb },
    ]);
    expect(installModelPack(pack, '/testroom?modmodels')).toBe(true);
    const view = buildWorld(loaded);
    for (const task of view.revealProps) task();
    const places: number[][] = [];
    view.group.traverse((obj) => {
      if (obj.userData.modelPack === true && obj.name === 'crate') {
        obj.updateWorldMatrix(true, true);
        places.push(new Vector3().setFromMatrixPosition(obj.matrixWorld).toArray().map((n) => Math.round(n)));
      }
    });
    expect(places).toEqual([[10, 0, 0], [20, 0, 0], [30, 0, 0]]);
    const other = view.group.getObjectByName('other');
    expect(other).toBeInstanceOf(Mesh);
    expect(other?.userData.modelPack).toBeUndefined();
    warn.mockRestore();
  });

  it('anchors a multi-piece prop on the instance root, not on a piece', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loaded = map();
    loaded.instanceRoots = [
      { path: 'worldmodel/stack=pallet', matrix: new Float32Array(at(100, 0, 50)) },
    ];
    loaded.props = [
      { modelName: 'pallet', parts: [part()], matrices: new Float32Array(at(100, 6.5, 50)), order: 0, alternate: false, facade: 0, lod: null,
        paths: ['worldmodel/stack=pallet/top'] },
      { modelName: 'pallet', parts: [part()], matrices: new Float32Array(at(106.2, 0, 44)), order: 1, alternate: false, facade: 0, lod: null,
        paths: ['worldmodel/stack=pallet/side'] },
      { modelName: 'pallet', parts: [part()], matrices: new Float32Array(at(100, 30, 50)), order: 2, alternate: true, facade: 0, lod: null,
        paths: ['worldmodel/stack=pallet/broken'] },
    ];
    const pack = await loadModelPack([
      { path: 'models.json', bytes: new TextEncoder().encode(manifest([{ id: 'pallet', file: 'pallet.glb' }])) },
      { path: 'pallet.glb', bytes: glb },
    ]);
    expect(installModelPack(pack, '/testroom?modmodels')).toBe(true);
    const view = buildWorld(loaded);
    for (const task of view.revealProps) task();
    const places: number[][] = [];
    view.group.traverse((obj) => {
      if (obj.userData.modelPack === true && obj.name === 'pallet') {
        obj.updateWorldMatrix(true, true);
        places.push(new Vector3().setFromMatrixPosition(obj.matrixWorld).toArray());
      }
    });
    expect(places).toEqual([[100, 0, 50]]);
    expect(view.moveNode('worldmodel/stack=pallet', new Matrix4().makeTranslation(0, 0, 4).toArray())).toBe(1);
    view.group.traverse((obj) => {
      if (obj.userData.modelPack === true && obj.name === 'pallet') {
        obj.updateWorldMatrix(true, true);
        expect(new Vector3().setFromMatrixPosition(obj.matrixWorld).z).toBeCloseTo(54, 5);
      }
    });
    warn.mockRestore();
  });

  it('clones every placement that shares one scene path, each at its own root, and skips the native draw', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const path = 'worldmodel/garage/mp6_shelves=mp6_shelves';
    const loaded = map();
    loaded.instanceRoots = [
      { path, matrix: new Float32Array(at(2000, 0, 1800)) },
      { path, matrix: new Float32Array(at(2095.97, 0, 1843.16)) },
    ];
    loaded.props = [
      { modelName: 'mp6_shelves', parts: [part(), part()], matrices: new Float32Array([...at(2000, 0, 1800), ...at(2095.97, 0, 1843.16)]), order: 0, alternate: false, facade: 0, lod: null,
        paths: [path, path] },
    ];
    const pack = await loadModelPack([
      { path: 'models.json', bytes: new TextEncoder().encode(manifest([{ id: 'mp6_shelves', file: 'shelves.glb' }])) },
      { path: 'shelves.glb', bytes: glb },
    ]);
    expect(installModelPack(pack, '/testroom?modmodels')).toBe(true);
    const view = buildWorld(loaded);
    for (const task of view.revealProps) task();
    const places: number[][] = [];
    let native = 0;
    view.group.traverse((obj) => {
      if (obj.userData.modelPack === true && obj.name === 'mp6_shelves') {
        obj.updateWorldMatrix(true, true);
        places.push(new Vector3().setFromMatrixPosition(obj.matrixWorld).toArray());
      }
      const mesh = obj as Mesh;
      if (mesh.isMesh && obj.userData.modelPack !== true && obj.name === 'mp6_shelves') native += 1;
    });
    expect(places).toHaveLength(2);
    const byX = [...places].sort((a, b) => a[0]! - b[0]!);
    expect(byX[0]![0]).toBeCloseTo(2000, 2);
    expect(byX[0]![1]).toBeCloseTo(0, 2);
    expect(byX[0]![2]).toBeCloseTo(1800, 2);
    expect(byX[1]![0]).toBeCloseTo(2095.97, 2);
    expect(byX[1]![1]).toBeCloseTo(0, 2);
    expect(byX[1]![2]).toBeCloseTo(1843.16, 2);
    expect(native).toBe(0);
    expect(view.triangles).toBe(0);
    warn.mockRestore();
  });

  it('a piece midway between two roots of one path takes the first root in scene order; one far from both still takes the nearer', async () => {
    // The takeover's read of #477 (product track): `instanceKey` keeps the first root on a tie (a strict `<`), so the
    // choice is the scene's order, never the build's; and no distance bound -- a piece is always some root's, and a
    // bound would only leave a hole where the native draw is skipped.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const path = 'worldmodel/garage/mp6_shelves=mp6_shelves';
    const loaded = map();
    loaded.instanceRoots = [
      { path, matrix: new Float32Array(at(2000, 0, 1800)) },
      { path, matrix: new Float32Array(at(2100, 0, 1800)) },
    ];
    loaded.props = [
      { modelName: 'mp6_shelves', parts: [part()], matrices: new Float32Array([...at(2050, 0, 1800), ...at(2600, 0, 1800)]), order: 0, alternate: false, facade: 0, lod: null,
        paths: [`${path}/board`, `${path}/leg`] },
    ];
    const pack = await loadModelPack([
      { path: 'models.json', bytes: new TextEncoder().encode(manifest([{ id: 'mp6_shelves', file: 'shelves.glb' }])) },
      { path: 'shelves.glb', bytes: glb },
    ]);
    expect(installModelPack(pack, '/testroom?modmodels')).toBe(true);
    const view = buildWorld(loaded);
    for (const task of view.revealProps) task();
    const places: number[][] = [];
    view.group.traverse((obj) => {
      if (obj.userData.modelPack === true && obj.name === 'mp6_shelves') {
        obj.updateWorldMatrix(true, true);
        places.push(new Vector3().setFromMatrixPosition(obj.matrixWorld).toArray());
      }
    });
    // The midway board: root 0 (2000). The far leg (2600): root 1 (2100), the nearer.
    expect(places.map((p) => Math.round(p[0]!)).sort()).toEqual([2000, 2100]);
    expect(view.triangles).toBe(0);
    warn.mockRestore();
  });

  it('joins each child of a shared path to the root nearest that child', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const path = 'worldmodel/garage/mp6_shelves=mp6_shelves';
    const loaded = map();
    loaded.instanceRoots = [
      { path, matrix: new Float32Array(at(2000, 0, 1800)) },
      { path, matrix: new Float32Array(at(2095.97, 0, 1843.16)) },
    ];
    loaded.props = [
      { modelName: 'mp6_shelves', parts: [part()], matrices: new Float32Array([...at(2000, 1.25, 1800), ...at(2095.97, 1.25, 1843.16)]), order: 0, alternate: false, facade: 0, lod: null,
        paths: [`${path}/board`, `${path}/board`] },
    ];
    const pack = await loadModelPack([
      { path: 'models.json', bytes: new TextEncoder().encode(manifest([{ id: 'mp6_shelves', file: 'shelves.glb' }])) },
      { path: 'shelves.glb', bytes: glb },
    ]);
    expect(installModelPack(pack, '/testroom?modmodels')).toBe(true);
    const view = buildWorld(loaded);
    for (const task of view.revealProps) task();
    const places: number[][] = [];
    view.group.traverse((obj) => {
      if (obj.userData.modelPack === true && obj.name === 'mp6_shelves') {
        obj.updateWorldMatrix(true, true);
        places.push(new Vector3().setFromMatrixPosition(obj.matrixWorld).toArray());
      }
    });
    expect(places).toHaveLength(2);
    const byX = [...places].sort((a, b) => a[0]! - b[0]!);
    expect(byX[0]![1]).toBeCloseTo(0, 2);
    expect(byX[1]![0]).toBeCloseTo(2095.97, 2);
    expect(byX[1]![1]).toBeCloseTo(0, 2);
    expect(view.triangles).toBe(0);
    warn.mockRestore();
  });

  it('keeps the flare billboard when the model it shares a name with is swapped', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loaded = map();
    loaded.props = [
      { modelName: 'lightbulb', parts: [part()], matrices: new Float32Array(at(4, 5, 6)), order: 0, alternate: false, facade: 0, lod: null,
        paths: ['worldmodel/lamp=lightbulb'] },
      { modelName: 'lightbulb', parts: [part()], matrices: new Float32Array(at(4, 5, 6)), order: 1, alternate: false, facade: 1, lod: null,
        paths: ['worldmodel/lamp=lightbulb/flare'] },
    ];
    const pack = await loadModelPack([
      { path: 'models.json', bytes: new TextEncoder().encode(manifest([{ id: 'lightbulb', file: 'bulb.glb' }])) },
      { path: 'bulb.glb', bytes: glb },
    ]);
    expect(installModelPack(pack, '/testroom?modmodels')).toBe(true);
    const view = buildWorld(loaded);
    for (const task of view.revealProps) task();
    const flare = view.group.getObjectByName('lightbulb (flare)');
    expect(flare).toBeInstanceOf(Mesh);
    expect(flare?.userData.modelPack).toBeUndefined();
    let swapped = 0;
    view.group.traverse((obj) => {
      if (obj.userData.modelPack === true && obj.name === 'lightbulb') swapped += 1;
    });
    expect(swapped).toBe(1);
    warn.mockRestore();
  });

  /** Position floats of the game's own world meshes, after the world queue is in the group. */
  function worldDraw(loaded: LoadedMap): number[][] {
    const view = buildWorld(loaded);
    for (const task of view.revealWorld) task();
    const out: number[][] = [];
    view.group.traverse((obj) => {
      let cursor: typeof obj | null = obj;
      let pack = false;
      while (cursor) {
        if (cursor.userData.modelPack === true) { pack = true; break; }
        cursor = cursor.parent;
      }
      const mesh = obj as Mesh;
      if (pack || !mesh.isMesh) return;
      // Through the attribute: a world draw's positions are an interleaved buffer's slots (CPS H12).
      const position = mesh.geometry.getAttribute('position');
      out.push(Array.from({ length: position.count * 3 }, (_, k) => position.getComponent(Math.floor(k / 3), k % 3)));
    });
    return out;
  }

  it('a pack with no world keys leaves the world draw byte for byte', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loaded = map();
    const kept = part();
    const other = { ...part(), positions: new Float32Array([4, 0, 0, 5, 0, 0, 4, 1, 0]) };
    loaded.world = [kept, other];
    const before = worldDraw(loaded);
    const pack = await loadModelPack([
      { path: 'models.json', bytes: new TextEncoder().encode(manifest([{ id: 'crate', file: 'crate.glb' }])) },
      { path: 'crate.glb', bytes: glb },
    ]);
    expect(installModelPack(pack, '/testroom?modmodels')).toBe(true);
    expect(worldDraw(loaded)).toEqual(before);
    expect(before).toEqual([Array.from(kept.positions), Array.from(other.positions)]);
    warn.mockRestore();
  });

  it('places one GLB at the piece anchor and leaves the kept draw and the collision', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loaded = map();
    const collision = loaded.collision.positions;
    const kept = part();
    loaded.world = [kept];
    loaded.worldSwaps = [{
      id: 'world:building_wc2#1', key: 'world:building_wc2#1', name: 'building_wc2',
      index: 2, ordinal: 1, anchor: new Float32Array(at(30, 4, 5)), pivot: [30, 4, 5], order: 4, cells: [2],
    }];
    const pack = await loadModelPack([
      { path: 'models.json', bytes: new TextEncoder().encode(manifest([
        { id: 'world:building_wc2#1', file: 'b.glb', scale: 2, rotation: [0, 180, 0], position: [0, 3, 0] },
      ])) },
      { path: 'b.glb', bytes: glb },
    ]);
    expect(installModelPack(pack, '/testroom?modmodels')).toBe(true);
    const view = buildWorld(loaded);
    for (const task of view.revealWorld) task();
    expect(loaded.collision.positions).toBe(collision);
    expect(worldDraw(loaded)).toEqual([Array.from(kept.positions)]);
    const root = view.group.getObjectByName('world:building_wc2#1')!;
    expect(root.userData.modelPack).toBe(true);
    root.updateWorldMatrix(true, true);
    expect(new Vector3().setFromMatrixPosition(root.matrixWorld).toArray()).toEqual([30, 4, 5]);
    const offset = root.children[0] as Mesh;
    expect(offset.scale.x).toBe(2);
    expect(offset.position.toArray()).toEqual([0, 3, 0]);
    offset.updateMatrix();
    const turned = new Vector3(1, 0, 0).applyMatrix4(offset.matrix);
    expect(turned.x).toBeCloseTo(-2, 5);
    expect(turned.y).toBeCloseTo(3, 5);
    expect(turned.z).toBeCloseTo(0, 5);
    const drawn = root.getObjectByProperty('isMesh', true) as Mesh;
    const corner = new Vector3(1, 0, 0).applyMatrix4(drawn.matrixWorld);
    expect(corner.x).toBeCloseTo(28, 5);
    expect(corner.y).toBeCloseTo(7, 5);
    expect(corner.z).toBeCloseTo(5, 5);
    let swapped = 0;
    view.group.traverse((obj) => { if (obj.userData.modelPack === true) swapped += 1; });
    expect(swapped).toBe(1);
    warn.mockRestore();
  });
});

describe('level-piece ids the page will send', () => {
  it('names only a world id whose GLB parsed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pack = await loadModelPack([
      { path: 'models.json', bytes: new TextEncoder().encode(manifest([
        { id: 'crate', file: 'crate.glb' },
        { id: 'world:building_wc2#0', file: 'b0.glb' },
        { id: 'world:garage', file: 'missing.glb' },
      ])) },
      { path: 'crate.glb', bytes: glb },
      { path: 'b0.glb', bytes: glb },
    ]);
    expect(installModelPack(pack, '/testroom?modmodels')).toBe(true);
    expect(mappedWorldPieceIds()).toEqual(['world:building_wc2#0']);
    clearModelPack();
    expect(mappedWorldPieceIds()).toEqual([]);
    warn.mockRestore();
  });
});

describe('unlitMaterial keeps emissive and leaves the base colour', () => {
  // #410's re-check F4 (taken over, OT.R69): the glow is spliced in before three's own include; a three release that
  // renamed it would leave the `.replace` a no-op and the glow gone silently. The stock shader names it today.
  it('three\'s basic fragment shader still holds the include the glow is spliced before (#410 F4)', () => {
    expect(ShaderLib.basic.fragmentShader).toContain('#include <opaque_fragment>');
  });
  const stock = 'void main(){\n\t#include <opaque_fragment>\n}\n';
  type Lit = MeshBasicMaterial & { emissive: Color; emissiveMap: Texture | null; emissiveIntensity: number };

  function compiled(material: MeshBasicMaterial): { fragmentShader: string; hasEmissive: boolean } {
    const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: '', fragmentShader: stock };
    material.onBeforeCompile(shader as never, undefined as never);
    return { fragmentShader: shader.fragmentShader, hasEmissive: shader.uniforms.emissive !== undefined };
  }

  it('copies an emissive source onto the unlit material', () => {
    const map = new Texture();
    const glowMap = new Texture();
    const source = new MeshStandardMaterial({ color: 0x112233, map, emissive: 0xff8800, emissiveIntensity: 2, emissiveMap: glowMap });
    const lit = unlitMaterial(source) as Lit;
    expect(lit).toBeInstanceOf(MeshBasicMaterial);
    expect(lit.color.getHex()).toBe(0x112233);
    expect(lit.map).toBe(map);
    expect(lit.emissive.getHex()).toBe(0xff8800);
    expect(lit.emissiveMap).toBe(glowMap);
    expect(lit.emissiveIntensity).toBe(2);
    expect(lit.toneMapped).toBe(true);
    const shader = compiled(lit);
    expect(shader.hasEmissive).toBe(true);
    expect(shader.fragmentShader).toContain('void main(){');
    expect(shader.fragmentShader).toContain('outgoingLight += s2uGlow');
    expect(shader.fragmentShader).toContain('#include <opaque_fragment>');
  });

  it('leaves a non-emissive source black and does not change the basic shader', () => {
    const map = new Texture();
    const source = new MeshStandardMaterial({ color: 0xabcdef, map });
    const lit = unlitMaterial(source) as Lit;
    expect(lit.color.getHex()).toBe(0xabcdef);
    expect(lit.map).toBe(map);
    expect(lit.emissive.getHex()).toBe(0x000000);
    expect(lit.emissive.r + lit.emissive.g + lit.emissive.b).toBe(0);
    expect(lit.emissiveMap).toBeNull();
    const shader = compiled(lit);
    expect(shader.fragmentShader).toBe(stock);
    expect(shader.hasEmissive).toBe(true);
  });
});

// #410's re-check F3 (taken over, OT.R69): Clear during an unfinished import could bring the pack back on Reload -- the
// clear forgot the store at once while the import's write landed after it, and Reload waited on the clear alone. The
// panel's work now runs in the order it was asked: a clear after the imports already under way, Reload after all.
describe('the panel\'s work, in order (#410 F3)', () => {
  it('a clear asked during an import runs after the import\'s write, and Reload waits for both', async () => {
    const queue = packWorkQueue();
    const log: string[] = [];
    let stored: string | null = null;
    let finish!: () => void;
    const importing = new Promise<void>((resolve) => { finish = resolve; }).then(() => { stored = 'pack'; log.push('import wrote'); });
    queue.retain(importing);
    const cleared = queue.after(async () => { stored = null; log.push('cleared'); });
    let reloaded = false;
    const reload = queue.settled().then(() => { reloaded = true; log.push('reload'); });
    await Promise.resolve();
    expect(log).toEqual([]);                                                  // the clear waits on the import
    finish();
    await cleared;
    await reload;
    expect(log).toEqual(['import wrote', 'cleared', 'reload']);
    expect(stored).toBeNull();
    expect(reloaded).toBe(true);
  });

  it('a failed import still lets the clear and Reload run', async () => {
    const queue = packWorkQueue();
    const log: string[] = [];
    queue.retain(Promise.reject(new Error('refused')));
    await queue.after(() => { log.push('cleared'); });
    await queue.settled();
    expect(log).toEqual(['cleared']);
  });

  // LATER 309 (#410/#432's review F3): an import asked after a clear, finishing before an earlier slow import, was
  // wiped by that clear (it ran after the slow import, so after the later one's write too).
  it('an import asked after a clear lands after it, though an earlier import is still under way (LATER 309)', async () => {
    const queue = packWorkQueue();
    const log: string[] = [];
    let stored: string | null = null;
    let finishA!: (v: string) => void;
    void queue.importing(new Promise<string>((resolve) => { finishA = resolve; }), (v) => { stored = v; log.push('A wrote'); });
    const cleared = queue.after(async () => { stored = null; log.push('cleared'); });
    const b = queue.importing(Promise.resolve('B'), (v) => { stored = v; log.push('B wrote'); });
    await new Promise((r) => setTimeout(r, 0));
    expect(log).toEqual([]);                                                  // B's read is done; its write waits on the clear
    finishA('A');
    await cleared;
    await b;
    await queue.settled();
    expect(log).toEqual(['A wrote', 'cleared', 'B wrote']);
    expect(stored).toBe('B');
  });

  it('with no clear between them, a later import does not wait on an earlier one (LATER 309)', async () => {
    const queue = packWorkQueue();
    const log: string[] = [];
    let finishA!: (v: string) => void;
    void queue.importing(new Promise<string>((resolve) => { finishA = resolve; }), () => { log.push('A wrote'); });
    await queue.importing(Promise.resolve('B'), () => { log.push('B wrote'); });
    expect(log).toEqual(['B wrote']);
    finishA('A');
    await queue.settled();
    expect(log).toEqual(['B wrote', 'A wrote']);
  });

  it('an import refused at its read rejects for its line, and the clear and Reload still run (LATER 309)', async () => {
    const queue = packWorkQueue();
    const log: string[] = [];
    const refused = queue.importing(Promise.reject(new Error('bad zip')), () => { log.push('wrote'); });
    await expect(refused).rejects.toThrow('bad zip');
    await queue.after(() => { log.push('cleared'); });
    await queue.settled();
    expect(log).toEqual(['cleared']);
  });

  it('the section imports nothing since B206 ML-7 (MODS is the loader), and retains nothing bare (LATER 309)', () => {
    const text = readFileSync(resolve(src, 'modelPackRuntime.ts'), 'utf8');
    const panel = text.slice(text.indexOf('export async function mountModelPack('), text.indexOf('export function packWorkQueue('));
    expect(panel).not.toMatch(/queue\.importing\(|showDirectoryPicker|type = 'file'/);
    expect(panel).not.toMatch(/\bretain\(/);
  });
});

describe('keeping the pack', () => {
  const entries = (): { path: string; bytes: Uint8Array }[] => [
    { path: 'models.json', bytes: new TextEncoder().encode(manifest([{ id: 'crate', file: 'crate.glb' }])) },
    { path: 'crate.glb', bytes: glb },
  ];

  interface KeptSlot { pack: { kind: string; entries?: unknown; files: { path: string; bytes: number }[]; chunks: number }; meta: { bytes: number } }
  interface KeptScope { data: { primary: KeptSlot; second: KeptSlot }; binary: { path: (string | number)[]; keys: string[] }[] }
  async function readKey<T>(key: IDBValidKey, store = PACKS_SCOPES): Promise<T | undefined> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = globalThis.indexedDB.open(PACKS_DB, 1);
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    try { return await new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined); req.onerror = () => reject(req.error);
    }); } finally { db.close(); }
  }
  async function writeScope(value: KeptScope): Promise<void> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = globalThis.indexedDB.open(PACKS_DB, 1);
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    try { await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PACKS_SCOPES, 'readwrite'); tx.objectStore(PACKS_SCOPES).put(value, 'models');
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    }); } finally { db.close(); }
  }
  function failOwnedWrite(error: DOMException) {
    const put = IDBObjectStore.prototype.put;
    return vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      // Real transactions/migration stay intact; fail only publication of a populated owned model scope.
      const value = args[0] as Partial<KeptScope>;
      if (this.transaction.db.name === PACKS_DB && this.name === PACKS_SCOPES && value.data?.primary?.pack) throw error;
      return put.apply(this, args);
    });
  }

  it('splits the bytes into records under the chunk cap and reads them back', () => {
    expect(MODEL_PACK_CHUNK_BYTES).toBe(32 * 1024 * 1024);
    expect(MODEL_PACK_CHUNK_BYTES).toBeLessThan(133_169_152);
    const first = Uint8Array.from([1, 2, 3, 4, 5]);
    const second = Uint8Array.from([6, 7, 8, 9]);
    const packed = chunkStoredFiles([
      { path: 'a.bin', bytes: first.buffer },
      { path: 'b.bin', bytes: second.buffer },
    ], 4);
    expect(packed.chunks.length).toBe(3);
    expect(packed.chunks.every((chunk) => chunk.byteLength <= 4)).toBe(true);
    const back = assembleStoredFiles(packed.files, packed.chunks);
    expect([...back.map((file) => file.path)]).toEqual(['a.bin', 'b.bin']);
    expect(new Uint8Array(back[0]!.bytes)).toEqual(first);
    expect(new Uint8Array(back[1]!.bytes)).toEqual(second);
  });

  it('awaits the import, then the store already holds the pack', async () => {
    vi.stubGlobal('indexedDB', new FakeFactory());
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const lines: string[] = [];
      await keepModelPack(entries(), (line) => lines.push(line), '/testroom?modmodels');
      const scope = (await readKey<KeptScope>('models'))!, saved = scope.data.primary.pack;
      expect(saved.kind).toBe('files');
      expect(saved.entries).toBeUndefined();
      expect(saved.chunks).toBe(1);
      expect(saved.files.map(file => file.path)).toEqual(['models.json', 'crate.glb']);
      const member = scope.binary.find(item => item.path.join('/') === 'primary/chunks/0')!;
      expect(member.keys).toHaveLength(1);
      const chunk = await readKey<ArrayBuffer>(member.keys[0]!, PACKS_BYTES);
      expect(chunk?.byteLength).toBeLessThanOrEqual(MODEL_PACK_CHUNK_BYTES);
      const restored = assembleStoredFiles(saved.files, [chunk!]);
      expect(new Uint8Array(restored[1]!.bytes)).toEqual(glb);
      const round = await readStoredModelPack();
      expect(round?.kind).toBe('files');
      if (round?.kind === 'files') {
        expect(round.entries?.map((entry) => entry.path)).toEqual(['models.json', 'crate.glb']);
        expect(new Uint8Array(round.entries![1]!.bytes)).toEqual(glb);
      }
      const keptBytes = saved.files.reduce((sum, file) => sum + file.bytes, 0);
      expect(scope.data.primary.meta.bytes).toBe(keptBytes);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/^Model pack on: 1 model \(crate\)/);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  // #410's re-check F2 (taken over by the merge controller's seats, OT.R69): a header whose files span more bytes than its
  // chunks hold threw inside the chunk read's onsuccess, so the read never settled and boot waited out its deadline on
  // every visit. It refuses at once: the read settles to null, the database closed.
  it('a kept pack whose header outruns its chunks settles to null at once (#410 F2)', async () => {
    vi.stubGlobal('indexedDB', new FakeFactory());
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await keepModelPack(entries(), () => {}, '/testroom?modmodels');
      const scope = (await readKey<KeptScope>('models'))!, saved = scope.data.primary.pack;
      expect(saved.chunks).toBe(1);
      const short = { ...saved, files: saved.files.map((f, i) => i === saved.files.length - 1 ? { ...f, bytes: f.bytes + 4096 } : f) };
      scope.data.primary.pack = short;
      await writeScope(scope);
      const late = Symbol('late');
      const got = await Promise.race([readStoredModelPack(), new Promise<symbol>((r) => setTimeout(() => r(late), 1000))]);
      expect(got).toBeNull();
      // A pack with no chunk records at all (the n === 0 branch) whose header names bytes refuses the same way.
      scope.data.primary.pack = { ...short, chunks: 0 };
      await writeScope(scope);
      const got0 = await Promise.race([readStoredModelPack(), new Promise<symbol>((r) => setTimeout(() => r(late), 1000))]);
      expect(got0).toBeNull();
    } finally {
      warn.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('warns once when the store write fails and does not say the pack is on', async () => {
    vi.stubGlobal('indexedDB', new FakeFactory());
    const fault = failOwnedWrite(new DOMException('full', 'QuotaExceededError'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const lines: string[] = [];
      await keepModelPack(entries(), (line) => lines.push(line), '/testroom?modmodels');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toMatch(/^Model pack: the pack was not kept/);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/^Model pack: the pack was not kept/);
      expect(lines[0]).not.toMatch(/^Model pack on:/);
    } finally {
      fault.mockRestore();
      warn.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('names a write failure whose message is empty', async () => {
    vi.stubGlobal('indexedDB', new FakeFactory());
    const fault = failOwnedWrite(new DOMException('', 'QuotaExceededError'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const lines: string[] = [];
      await keepModelPack(entries(), (line) => lines.push(line), '/testroom?modmodels');
      expect(lines).toEqual(['Model pack: the pack was not kept (This browser has no room left to keep the pack.).']);
      expect(String(warn.mock.calls[0]?.[0])).toBe(lines[0]);
    } finally {
      fault.mockRestore();
      warn.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('preserves the first storage failure instead of a later aborted-write message', async () => {
    vi.stubGlobal('indexedDB', new FakeFactory());
    const fault = failOwnedWrite(new DOMException('serialized value too large (146801535 > 133169152)', 'UnknownError'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const lines: string[] = [];
      await keepModelPack(entries(), (line) => lines.push(line), '/testroom?modmodels');
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('serialized value too large');
      expect(lines[0]).not.toContain('The transaction has finished.');
      expect(lines[0]).not.toMatch(/^Model pack on:/);
      expect(String(warn.mock.calls[0]?.[0])).toContain('serialized value too large');
    } finally {
      fault.mockRestore();
      warn.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});

describe('a second pack beside the first', () => {
  const files = (id: string, scale = 1, file = 'crate.glb'): { path: string; bytes: Uint8Array }[] => [
    { path: 'models.json', bytes: new TextEncoder().encode(manifest([{ id, file, scale }])) },
    { path: file, bytes: glb },
  ];

  it('draws both packs, keeps the first pack on a shared id, and clears both', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const geometry = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const first = await loadModelPack(files('crate', 2));
    const beside = await loadModelPack([
      { path: 'models.json', bytes: new TextEncoder().encode(manifest([
        { id: 'crate', file: 'crate.glb', scale: 9 },
        { id: 'm4Acarbine', file: 'm4.glb' },
        { id: 'world:garage#0', file: 'garage.glb' },
      ])) },
      { path: 'crate.glb', bytes: glb },
      { path: 'm4.glb', bytes: glb },
      { path: 'garage.glb', bytes: glb },
    ]);
    const world = await loadModelPack(files('world:building_wc2#0', 1, 'building.glb'));
    expect(installModelPack(first, '/testroom?modmodels')).toBe(true);
    expect(installModelPack(world, '/testroom?modmodels', '/', 'second')).toBe(true);
    expect(hasMappedModel('crate')).toBe(true);
    expect(hasMappedModel('world:building_wc2#0')).toBe(true);
    expect(mappedWorldPieceIds()).toEqual(['world:building_wc2#0']);
    const droppedWorld = vi.spyOn(world, 'dispose');
    expect(installModelPack(beside, '/testroom?modmodels', '/', 'second')).toBe(true);
    expect(droppedWorld).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toBe('Model pack: "crate" is in both packs; the first pack\'s entry is kept.');
    expect(hasMappedModel('crate')).toBe(true);
    expect(hasMappedModel('m4Acarbine')).toBe(true);
    expect(hasMappedModel('world:garage#0')).toBe(true);
    expect(mappedWorldPieceIds()).toEqual(['world:garage#0']);
    const loaded = map();
    const collision = loaded.collision.positions;
    const view = buildWorld(loaded);
    for (const task of view.revealProps) task();
    const crate = view.group.getObjectByName('crate')!;
    expect(crate.userData.modelPack).toBe(true);
    expect((crate.children[0] as { scale: Vector3 }).scale.x).toBe(2);
    const weapon = view.held('m4Acarbine')!;
    expect(weapon.children.some((child) => child.userData.modelPack === true)).toBe(true);
    expect(loaded.collision.positions).toBe(collision);
    const firstDispose = vi.spyOn(first, 'dispose');
    const besideDispose = vi.spyOn(beside, 'dispose');
    clearModelPack();
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(besideDispose).toHaveBeenCalledTimes(1);
    expect(hasMappedModel('crate')).toBe(false);
    expect(hasMappedModel('m4Acarbine')).toBe(false);
    expect(geometry).toHaveBeenCalled();
    geometry.mockRestore();
    warn.mockRestore();
  });

  it('a skipped id in the first pack stays skipped, and a launcher address drops both packs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = await loadModelPack([
      { path: 'models.json', bytes: new TextEncoder().encode(manifest([{ id: 'crate', file: 'missing.glb' }])) },
    ]);
    const beside = await loadModelPack(files('crate', 4));
    expect(first.has('crate')).toBe(false);
    expect(installModelPack(first, '/testroom?modmodels')).toBe(true);
    expect(installModelPack(beside, '/testroom?modmodels', '/', 'second')).toBe(true);
    expect(hasMappedModel('crate')).toBe(false);
    expect(String(warn.mock.calls.at(-1)?.[0])).toContain('the first pack\'s entry is kept');
    const firstDispose = vi.spyOn(first, 'dispose');
    const besideDispose = vi.spyOn(beside, 'dispose');
    expect(installModelPack(beside, '/')).toBe(false);
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(besideDispose).toHaveBeenCalledTimes(1);
    expect(hasMappedModel('crate')).toBe(false);
    warn.mockRestore();
  });

  it('replacing the first pack leaves the second, and a refused second pack leaves the first', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = await loadModelPack(files('crate', 2));
    const beside = await loadModelPack(files('barrel', 1, 'barrel.glb'));
    const replacement = await loadModelPack(files('other'));
    expect(installModelPack(first, '/testroom?modmodels')).toBe(true);
    expect(installModelPack(beside, '/testroom?modmodels', '/', 'second')).toBe(true);
    const besideDispose = vi.spyOn(beside, 'dispose');
    expect(installModelPack(replacement, '/testroom?modmodels')).toBe(true);
    expect(besideDispose).not.toHaveBeenCalled();
    expect(hasMappedModel('crate')).toBe(false);
    expect(hasMappedModel('other')).toBe(true);
    expect(hasMappedModel('barrel')).toBe(true);
    const lines: string[] = [];
    const refused = await applyEntries(
      [{ path: 'models.json', bytes: new TextEncoder().encode('nope') }],
      (line) => lines.push(line), () => true, '/testroom?modmodels', 'second',
    );
    expect(refused).toBeNull();
    expect(lines[0]).toMatch(/^Model pack refused:/);
    expect(hasMappedModel('other')).toBe(true);
    expect(hasMappedModel('barrel')).toBe(false);
    warn.mockRestore();
  });

  it('keeps each pack at 128 ids and 500 MiB, and stores both independently without writing legacy keys', async () => {
    expect(MODEL_PACK_LIMITS.models).toBe(128);
    expect(MODEL_PACK_LIMITS.packBytes).toBe(500 * 1024 * 1024);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const parse = (): Promise<Object3D> => {
      const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
      const root = new Group();
      root.add(new Mesh(geometry));
      return Promise.resolve(root);
    };
    const many = Array.from({ length: MODEL_PACK_LIMITS.models }, (_, i) => ({ id: `tile${i}`, file: 'crate.glb' }));
    const terrain = await loadModelPack([
      { path: 'models.json', bytes: new TextEncoder().encode(manifest(many)) },
      { path: 'crate.glb', bytes: glb },
    ], parse);
    const props = await loadModelPack(files('crate'));
    expect(terrain.ids).toHaveLength(128);
    expect(installModelPack(props, '/testroom?modmodels')).toBe(true);
    expect(installModelPack(terrain, '/testroom?modmodels', '/', 'second')).toBe(true);
    expect(hasMappedModel('crate')).toBe(true);
    expect(hasMappedModel('tile0')).toBe(true);
    expect(hasMappedModel('tile127')).toBe(true);
    const over = Array.from({ length: MODEL_PACK_LIMITS.models + 1 }, (_, i) => ({ id: `x${i}`, file: 'crate.glb' }));
    await expect(loadModelPack([
      { path: 'models.json', bytes: new TextEncoder().encode(manifest(over)) },
      { path: 'crate.glb', bytes: glb },
    ], parse)).rejects.toThrow(/more than 128/);
    expect(hasMappedModel('crate')).toBe(true);
    vi.stubGlobal('indexedDB', new FakeFactory());
    try {
      const lines: string[] = [];
      await keepModelPack(files('crate'), (line) => lines.push(line), '/testroom?modmodels');
      await keepModelPack(files('barrel', 1, 'barrel.glb'), (line) => lines.push(line), '/testroom?modmodels', 'second');
      expect(lines.at(-1)).toMatch(/Model pack on: 1 model \(crate\)/);
      expect(lines.at(-1)).toMatch(/Second pack on: 1 model \(barrel\)/);
      const primary = await readStoredModelPack();
      const extra = await readStoredModelPack('second');
      expect(primary?.kind).toBe('files');
      expect(extra?.kind).toBe('files');
      if (primary?.kind === 'files') expect(primary.entries?.map((entry) => entry.path)).toEqual(['models.json', 'crate.glb']);
      if (extra?.kind === 'files') expect(extra.entries?.map((entry) => entry.path)).toEqual(['models.json', 'barrel.glb']);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = globalThis.indexedDB.open('s2u.modelPack', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const read = (key: IDBValidKey) => new Promise((resolve, reject) => {
        const req = db.transaction('pack', 'readonly').objectStore('pack').get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      expect(await read(modelPackChunkKey(0))).toBeUndefined();
      expect(await read(modelPackSecondChunkKey(0))).toBeUndefined();
      expect(await read('current')).toBeUndefined();
      expect(await read('second')).toBeUndefined();
      db.close();
    } finally {
      vi.unstubAllGlobals();
      warn.mockRestore();
    }
  });
});

describe('the instance root', () => {
  const node = (name: string, over: Partial<SceneNode> = {}): SceneNode => ({
    name, modelName: null, type: NODE_GENERIC, flags: 0, matrix: Float32Array.from(IDENTITY),
    bbox: new Float32Array(6), regionmask: 0, visuals: 0, visualParams: [], visualMaterials: [], children: [], collision: [], ...over,
  });
  const moved = (x: number, y: number, z: number): Float32Array => {
    const m = Float32Array.from(IDENTITY);
    m[12] = x; m[13] = y; m[14] = z;
    return m;
  };

  it('is the node that owns =<model>, not a piece that has a visual', () => {
    const pallet = node('pallet', { type: NODE_MODEL, children: [
      node('top', { visuals: 1, visualParams: [0], visualMaterials: [0], matrix: moved(0, 6.5, 0) }),
      node('side', { visuals: 1, visualParams: [0], visualMaterials: [0], matrix: moved(6.2, 0, -6) }),
    ] });
    const world = node('worldmodel', { type: NODE_MODEL, visuals: 1, visualParams: [0], visualMaterials: [0], children: [
      node('stack', { type: NODE_INSTANCE, modelName: 'pallet', matrix: moved(100, 0, 50) }),
    ] });
    const roots = instanceRootMatrices([world, pallet]);
    const root = roots.find((entry) => entry.path === 'worldmodel/stack=pallet');
    expect([...root!.matrix.slice(12, 15)]).toEqual([100, 0, 50]);
    expect(roots.some((entry) => entry.path.endsWith('/top') || entry.path.endsWith('/side'))).toBe(false);
  });
});
