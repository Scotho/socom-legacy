import { describe, expect, it } from 'vitest';
import { ENGINE_CONTRACT_VERSION, PACK_TARGET_US, sha256Hex, type PackContext } from '@s2u/creator-contracts';
import { IDBFactory } from 'fake-indexeddb';
import { idbPackDatabase } from '../src/packs/storage';
import { makeZip } from './zipFixture';
import { encodePng } from '../../../tools/png';
import { createLocalPackApi } from '../src/agent/localPacks';
import { createPackRegistry } from '../src/packs/registry';
import { forgeMapPackDrivers } from '../src/agent/forgePacks';
import { createForgeAgentApi, type ForgeAgentSnapshot } from '../src/forge/agent/api';
import { readSaveList } from '../src/forge/saves';
import { memoryModLibrary } from '../src/mods/store';
import { memoryUploadBackend, UploadedPacks } from '../src/texturePackStore';
import type { LayoutRecord } from '../src/forge/record';

function fixture() {
  let workspace: LayoutRecord = { v: 2, name: 'Working', base: 'blank:floor', assets: [], pieces: [], spawns: [] };
  let revision = 0, mode: ForgeAgentSnapshot['mode'] = 'forge-editor';
  const history: LayoutRecord[] = [];
  const api = createForgeAgentApi({
    snapshot: () => ({ ready: true, mode, revision, layout: structuredClone(workspace), selection: [], refs: [], catalogue: {}, issues: [], view: {}, canUndo: history.length > 0, canRedo: false }),
    prepare: async (operation, args, guard) => {
      if (operation !== 'layout.import') throw Error('Unexpected editor operation');
      const next = structuredClone(args['layout']) as LayoutRecord;
      return { commit() { guard(); history.push(structuredClone(workspace)); workspace = next; revision++; }, dispose() {} };
    },
  });
  const data = new Map<string, string>();
  const maps = { get: (key: string) => data.get(key) ?? null, set: (key: string, value: string) => { data.set(key, value); } };
  const packs = createLocalPackApi({ maps, mods: memoryModLibrary(), models: { read: async () => null, put: async () => {}, remove: async () => {} },
    textures: new UploadedPacks(memoryUploadBackend()), ...forgeMapPackDrivers(api) });
  return { api, maps, packs, history, workspace: () => structuredClone(workspace),
    setMode: (next: ForgeAgentSnapshot['mode']) => { mode = next; },
    humanEdit() { history.push(structuredClone(workspace)); workspace.name = 'Later human work'; workspace.spawns.push(['A', 1, 2, 3, 0]); revision++; } };
}
async function applied(f: ReturnType<typeof fixture>) {
  const record: LayoutRecord = { v: 2, name: 'Imported recipe', base: 'blank:floor', assets: [], pieces: [], spawns: [] };
  const bytes = new TextEncoder().encode(JSON.stringify(record));
  const [staged] = await f.packs.stage([{ name: 'map.json', size: bytes.length, arrayBuffer: async () => bytes.slice().buffer }]);
  return f.packs.import({ kind: 'map', stagedId: staged!.id, apply: true });
}
describe('Forge saved-recipe lifecycle (product adaptation)', () => {
  it('removes an applied library recipe while preserving its independent working copy, human edits and history', async () => {
    const f = fixture();
    try {
      const imported = await applied(f);
      expect(imported).toMatchObject({ stored: true, applied: true });
      expect(f.workspace().name).toBe('Imported recipe'); expect(f.history).toHaveLength(1);
      f.humanEdit(); const working = f.workspace(), history = structuredClone(f.history), revision = f.api.read().revision;
      await expect(f.packs.remove(imported.id)).resolves.toMatchObject({ id: imported.id, removed: true, stored: false, applied: false, enabled: false });
      expect(readSaveList(f.maps).saves).toEqual([]);
      expect((await f.packs.list()).some(entry => entry.id === imported.id)).toBe(false);
      expect(f.workspace()).toEqual(working); expect(f.history).toEqual(history); expect(f.api.read().revision).toBe(revision);
    } finally { f.packs.dispose(); f.api.dispose(); }
  });
  it.each(['forge-play', 'blocked'] as const)('preserves the saved recipe and working layout on %s', async mode => {
    const f = fixture();
    try {
      const imported = await applied(f); const working = f.workspace(), history = structuredClone(f.history);
      f.setMode(mode);
      await expect(f.packs.remove(imported.id)).rejects.toMatchObject({ code: 'UNSUPPORTED_SURFACE' });
      expect(readSaveList(f.maps).saves).toHaveLength(1);
      expect(f.workspace()).toEqual(working); expect(f.history).toEqual(history);
    } finally { f.packs.dispose(); f.api.dispose(); }
  });
  it('preserves the save, layout and history when removal is aborted', async () => {
    const f = fixture();
    try {
      const imported = await applied(f); const working = f.workspace(), history = structuredClone(f.history);
      const abort = new AbortController(); abort.abort();
      await expect(f.packs.remove(imported.id, { signal: abort.signal })).rejects.toMatchObject({ code: 'ABORTED' });
      expect(readSaveList(f.maps).saves).toHaveLength(1); expect(f.workspace()).toEqual(working); expect(f.history).toEqual(history);
    } finally { f.packs.dispose(); f.api.dispose(); }
  });
  it('limits its detach driver to map recipes in Build, with a live abort check', async () => {
    const f = fixture();
    try {
      const drivers = forgeMapPackDrivers(f.api), signal = new AbortController();
      expect(drivers.allowedSurface!('mod')).toBe(false);
      expect(() => drivers.deactivate!('model', 'model:current', signal.signal)).toThrow('saved map recipes only');
      expect(() => drivers.deactivate!('map', 'texture:other', signal.signal)).toThrow('saved map recipes only');
      f.setMode('forge-play');
      expect(() => drivers.deactivate!('map', 'map:fixture', signal.signal)).toThrow('only in Build');
      f.setMode('forge-editor'); signal.abort();
      expect(() => drivers.deactivate!('map', 'map:fixture', signal.signal)).toThrow('cancelled');
      expect(f.history).toEqual([]); expect(f.workspace().name).toBe('Working');
    } finally { f.packs.dispose(); f.api.dispose(); }
  });
  // FCW-33 fold 1 (product adaptation): the editor's own import admits v2 packs, so the editor and the solo room agree.
  it('admits a v2 pack on the Forge surface (storage only), in Build only', async () => {
    const context: PackContext = { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSION, packs: [], archives: {}, handlers: [] };
    const png = encodePng(1, 1, new Uint8Array([1, 2, 3, 255]));
    const manifest = { format: 's2u-pack', formatVersion: 2, id: 'example.yard', version: '1.2.0', name: 'Yard', description: 'A small yard.',
      target: PACK_TARGET_US, contract: `^${ENGINE_CONTRACT_VERSION}`, kinds: ['content'], sides: 'client', dependencies: [],
      files: [{ path: 'textures/crate.png', sha256: await sha256Hex(png), size: png.length, role: 'texture' }],
      intents: [{ kind: 'cosmetic', files: ['textures/crate.png'] }] };
    const zip = makeZip([{ name: 's2u-pack.json', data: JSON.stringify(manifest) }, { name: 'textures/crate.png', data: png }]);
    let mode: ForgeAgentSnapshot['mode'] = 'forge-editor';
    const stub = { read: () => ({ mode }) } as unknown as Parameters<typeof forgeMapPackDrivers>[0];
    const drivers = forgeMapPackDrivers(stub), factory = new IDBFactory();
    expect(drivers.allowedSurface!('pack')).toBe(true);
    const packs = createPackRegistry({ legacyMapWrites: true, context, database: idbPackDatabase(() => factory), maps: { get: () => null, set: () => {} }, mods: memoryModLibrary(),
      models: { read: async () => null, put: async () => {}, remove: async () => {} }, textures: new UploadedPacks(memoryUploadBackend()), ...drivers });
    try {
      const [staged] = await packs.stage([{ name: 'yard.zip', size: zip.length, arrayBuffer: async () => zip.slice().buffer }]);
      expect(await packs.import({ kind: 'pack', stagedId: staged!.id })).toMatchObject({ stored: true, applied: false, packKinds: ['content'] });
      mode = 'forge-play';
      expect(drivers.allowedSurface!('pack')).toBe(false);
    } finally { packs.dispose(); }
  });
});
