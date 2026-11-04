// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory as FakeFactory } from 'fake-indexeddb';
import { hasMappedModel } from '../src/modelPackHook';
import { clearModelPack, keepModelPack, mountModelPack, readStoredModelPack } from '../src/modelPackRuntime';

/**
 * The test-room panel's second pack (`TEST_ROOM_MODEL_PACK_ADAPTATION`). The bytes are a one-triangle GLB built here.
 * Nothing of the disc is in this file.
 */

const manifest = (models: unknown): string => JSON.stringify({ format: 's2u-model-pack', version: 1, models });

function triangleGlb(): Uint8Array {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint16Array([0, 1, 2]);
  const bin = new Uint8Array(42);
  bin.set(new Uint8Array(positions.buffer), 0);
  bin.set(new Uint8Array(indices.buffer), 36);
  const jsonBytes = new TextEncoder().encode(JSON.stringify({
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
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
  }));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + bin.length + 2;
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
  view.setUint32(at, bin.length + 2, true);
  view.setUint32(at + 4, 0x004e4942, true);
  out.set(bin, at + 8);
  return out;
}

const glb = triangleGlb();
const pack = (id: string, file: string): { path: string; bytes: Uint8Array }[] => [
  { path: 'models.json', bytes: new TextEncoder().encode(manifest([{ id, file }])) },
  { path: file, bytes: glb },
];

afterEach(() => { clearModelPack(); vi.unstubAllGlobals(); });

describe('the model pack panel offers a second pack', () => {
  it('mounts the second-pack controls on the test room, and Clear drops both packs', async () => {
    window.history.pushState(null, '', '/testroom?modmodels');
    vi.stubGlobal('indexedDB', new FakeFactory());
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const body = document.createElement('div');
    body.id = 'panel-body';
    document.body.append(body);
    await mountModelPack(document);
    const labels = [...document.querySelectorAll('#model-pack button')].map((button) => button.textContent);
    expect(labels).toEqual([
      'Choose model folder', 'Import model pack (.zip)', 'Choose second folder', 'Import second pack (.zip)',
      'Clear model pack', 'Reload map',
    ]);
    await keepModelPack(pack('crate', 'crate.glb'), () => {}, '/testroom?modmodels');
    await keepModelPack(pack('barrel', 'barrel.glb'), () => {}, '/testroom?modmodels', 'second');
    expect(hasMappedModel('crate')).toBe(true);
    expect(hasMappedModel('barrel')).toBe(true);
    const clear = [...document.querySelectorAll('#model-pack button')].find((button) => button.textContent === 'Clear model pack');
    clear?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(async () => {
      expect(hasMappedModel('crate')).toBe(false);
      expect(hasMappedModel('barrel')).toBe(false);
      expect(await readStoredModelPack()).toBeNull();
      expect(await readStoredModelPack('second')).toBeNull();
    });
    warn.mockRestore();
  });
});
