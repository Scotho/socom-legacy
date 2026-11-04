// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataTexture, Group } from 'three';
import { createLiveLocalPackDrivers } from '../src/testroom/agent/packs';
import { mountModPanel } from '../src/mods/panel';
import { memoryModLibrary } from '../src/mods/store';
import { modPackageFromEntries } from '../src/mods/readPackage';
import { parseModManifestBytes } from '../src/mods/manifest';
import { applyOverrideSource, installModOverrides } from '../src/mods/override';
import { installMemberOverrides } from '@s2u/archive';
import { LocalTexturePacks, TexturePackTarget } from '../src/texturePackRuntime';
import { memoryUploadBackend, UploadedPacks } from '../src/texturePackStore';
import { buildTexturePack } from '../../../tools/localTexturePack';
import { loadModelPack, clearModelPack, clearModelPackIf, installModelPack } from '../src/modelPackRuntime';
import { hasMappedModel } from '../src/modelPackHook';
import type { PackSource } from '../src/texturePack';
import { createLocalPackApi } from '../src/agent/localPacks';

const bytes = (s: string) => new TextEncoder().encode(s);
const manifest = () => bytes(JSON.stringify({ format: 's2u-mod', formatVersion: 1, id: 'agent-demo', name: 'Agent demo', version: '1', author: 'Fixture', description: '', target: 'socom2-us-r0001', files: [{ path: 'NOTES/HELLO.TXT', file: 'hello.txt' }] }));
afterEach(() => { installModOverrides(null); installMemberOverrides(null); clearModelPack(); document.body.replaceChildren(); vi.restoreAllMocks(); });

function setup() {
  let allowed = true;
  document.body.innerHTML = '<div id="panel-body"></div>';
  const library = memoryModLibrary(), posted: unknown[] = [];
  const panel = mountModPanel(document, { postMessage: (m) => posted.push(m) }, { library })!;
  const reload = vi.fn(async () => {});
  const drivers = createLiveLocalPackDrivers({ allowed: () => allowed, modPanel: () => panel, texturePacks: () => null, textureContext: async () => { throw new Error('no map'); }, modelAddress: () => '/testroom?modmodels', reload });
  return { drivers, panel, library, reload, posted, block: () => { allowed = false; } };
}
async function enableMods(library: ReturnType<typeof memoryModLibrary>): Promise<void> {
  const master = document.getElementById('mods-enabled') as HTMLInputElement;
  master.checked = true; master.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(async () => expect((await library.read()).choices.enabled).toBe(true));
}

describe('typed live solo pack drivers (browser adaptation)', () => {
  it('keeps agent imports stored and the master off when explicit apply is refused', async () => {
    const { drivers, panel, library, reload } = setup(); await panel.ready;
    const api = createLocalPackApi({ ...drivers, mods: library,
      models: { read: async () => null, put: async () => {}, remove: async () => {} },
      textures: new UploadedPacks(memoryUploadBackend()),
    });
    const files = [{ name: 'mod.json', bytes: manifest() }, { name: 'hello.txt', bytes: bytes('kept but off') }];
    const [staged] = await api.stage(files.map(file => ({ name: file.name, size: file.bytes.length,
      arrayBuffer: async () => file.bytes.slice().buffer })));

    await expect(api.import({ kind: 'mod', stagedId: staged!.id, apply: true })).rejects.toMatchObject({
      code: 'APPLY_FAILED', result: { id: 'mod:agent-demo', stored: true, enabled: false, applied: false },
    });
    const saved = await library.read();
    expect(saved.choices.enabled).toBe(false);
    expect(new TextDecoder().decode(saved.packages.find(pack => pack.id === 'agent-demo')?.files
      .find(file => file.name === 'hello.txt')?.bytes)).toBe('kept but off');
    expect(panel.isApplied('agent-demo')).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    api.dispose();
  });

  it('does not report or deactivate the second model slot as model:current', async () => {
    const { drivers, reload } = setup();
    const second = await loadModelPack([{ path: 'models.json', bytes: bytes(JSON.stringify({
      format: 's2u-model-pack', version: 1, models: [{ id: 'second-only', file: 'fixture.glb' }],
    })) }, { path: 'fixture.glb', bytes: new Uint8Array([1]) }], async () => new Group());
    installModelPack(second, '/testroom?modmodels', '/', 'second');

    expect(drivers.isApplied!('model', 'model:current')).toBe(false);
    await drivers.deactivate!('model', 'model:current', new AbortController().signal);
    expect(hasMappedModel('second-only')).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });

  it('activates real mod overrides and the worker table, then deactivates before removal', async () => {
    const { drivers, panel, library, posted, reload } = setup(); await panel.ready;
    await enableMods(library);
    const pack = modPackageFromEntries('Agent demo', [{ path: 'mod.json', bytes: manifest() }, { path: 'hello.txt', bytes: bytes('local override') }]);
    const parsed = parseModManifestBytes(manifest());
    await library.put({ id: parsed.id, label: pack.label, files: [...pack.files].map(([name, bytes]) => ({ name, bytes })) });
    await drivers.applyMod!(pack, parsed, new AbortController().signal);
    const source = applyOverrideSource({ list: async () => [], read: async (_path: string) => bytes('original') });
    expect(new TextDecoder().decode(await source.read('NOTES/HELLO.TXT'))).toBe('local override');
    expect(posted).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'mods', entries: [expect.objectContaining({ path: 'NOTES/HELLO.TXT' })] })]));
    expect(reload).toHaveBeenCalledOnce();
    await drivers.deactivate!('mod', 'mod:agent-demo', new AbortController().signal);
    expect(new TextDecoder().decode(await source.read('NOTES/HELLO.TXT'))).toBe('original');
  });

  it('rechecks build mode after the real saved-choice await and never publishes a late mod', async () => {
    const { drivers, panel, library, posted, block } = setup(); await panel.ready; posted.length = 0;
    await enableMods(library); posted.length = 0;
    let release!: () => void;
    vi.spyOn(library, 'writeChoices').mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));
    const pack = modPackageFromEntries('Agent demo', [{ path: 'mod.json', bytes: manifest() }, { path: 'hello.txt', bytes: bytes('late') }]);
    const apply = drivers.applyMod!(pack, parseModManifestBytes(manifest()), new AbortController().signal);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    block(); release();
    await expect(apply).rejects.toThrow();
    expect(posted).toEqual([]);
    expect(drivers.allowedSurface!('mod')).toBe(false);
  });

  it('installs the actual model visual source and waits for rebuild, while an aborted call installs nothing', async () => {
    const { drivers, reload } = setup();
    const pack = await loadModelPack([{ path: 'models.json', bytes: bytes(JSON.stringify({ format: 's2u-model-pack', version: 1, models: [{ id: 'crate', file: 'crate.glb' }] })) }, { path: 'crate.glb', bytes: new Uint8Array([1]) }], async () => new Group());
    const aborted = new AbortController(); aborted.abort();
    await expect(drivers.applyModel!(pack, aborted.signal)).rejects.toThrow();
    expect(hasMappedModel('crate')).toBe(false);
    await drivers.applyModel!(pack, new AbortController().signal);
    expect(hasMappedModel('crate')).toBe(true); expect(reload).toHaveBeenCalledOnce();
    await drivers.deactivate!('model', 'model:current', new AbortController().signal);
    expect(hasMappedModel('crate')).toBe(false);
  });

  it('cleans a failed model activation without disposing a newer human-installed model pack', async () => {
    const create = (id: string) => loadModelPack([{ path: 'models.json', bytes: bytes(JSON.stringify({ format: 's2u-model-pack', version: 1, models: [{ id, file: 'fixture.glb' }] })) }, { path: 'fixture.glb', bytes: new Uint8Array([1]) }], async () => new Group());
    const first = await create('crate'), newer = await create('barrel');
    const drivers = createLiveLocalPackDrivers({ allowed: () => true, modPanel: () => null, texturePacks: () => null, textureContext: async () => { throw new Error('none'); }, modelAddress: () => '/testroom?modmodels', reload: async () => { installModelPack(newer, '/testroom?modmodels'); throw new Error('load failed'); } });
    await expect(drivers.applyModel!(first, new AbortController().signal)).rejects.toThrow('load failed');
    expect(clearModelPackIf(first)).toBe(false);
    expect(hasMappedModel('barrel')).toBe(true);
    expect(clearModelPackIf(newer)).toBe(true);
    expect(hasMappedModel('barrel')).toBe(false);
  });

  it('queries model and mod activation installed before the agent drivers existed, while inactive IDs preserve them', async () => {
    const { panel, library } = setup(); await panel.ready; await enableMods(library);
    const pack = modPackageFromEntries('Agent demo', [{ path: 'mod.json', bytes: manifest() }, { path: 'hello.txt', bytes: bytes('native') }]);
    await panel.activateStored(pack, parseModManifestBytes(manifest()), () => true);
    const model = await loadModelPack([{ path: 'models.json', bytes: bytes(JSON.stringify({ format: 's2u-model-pack', version: 1, models: [{ id: 'crate', file: 'fixture.glb' }] })) }, { path: 'fixture.glb', bytes: new Uint8Array([1]) }], async () => new Group());
    installModelPack(model, '/testroom?modmodels');
    const drivers = createLiveLocalPackDrivers({ allowed: () => true, modPanel: () => panel, texturePacks: () => null, textureContext: async () => { throw new Error('none'); }, modelAddress: () => '/testroom?modmodels', reload: async () => {} });
    expect(drivers.isApplied!('mod', 'mod:agent-demo')).toBe(true);
    expect(drivers.isApplied!('model', 'model:current')).toBe(true);
    expect(drivers.isApplied!('mod', 'mod:other')).toBe(false);
    expect(drivers.isApplied!('model', 'model:other')).toBe(false);
    await drivers.deactivate!('model', 'model:other', new AbortController().signal);
    await drivers.deactivate!('mod', 'mod:other', new AbortController().signal);
    expect(hasMappedModel('crate')).toBe(true);
    expect(drivers.isApplied!('mod', 'mod:agent-demo')).toBe(true);
  });

  it('removes native-installed packs through a fresh local API and uninstalls the actual runtime first', async () => {
    const { panel, library } = setup(); await panel.ready;
    await enableMods(library);
    const pack = modPackageFromEntries('Agent demo', [{ path: 'mod.json', bytes: manifest() }, { path: 'hello.txt', bytes: bytes('native') }]);
    await library.put({ id: 'agent-demo', label: 'Agent demo', files: [...pack.files].map(([name, bytes]) => ({ name, bytes })) });
    await library.put({ id: 'inactive', label: 'Inactive', files: [] });
    await panel.activateStored(pack, parseModManifestBytes(manifest()), () => true);
    const modelEntries = [{ path: 'models.json', bytes: bytes(JSON.stringify({ format: 's2u-model-pack', version: 1, models: [{ id: 'crate', file: 'fixture.glb' }] })) }, { path: 'fixture.glb', bytes: new Uint8Array([1]) }];
    const model = await loadModelPack(modelEntries, async () => new Group());
    installModelPack(model, '/testroom?modmodels');
    const drivers = createLiveLocalPackDrivers({ allowed: () => true, modPanel: () => panel, texturePacks: () => null, textureContext: async () => { throw new Error('none'); }, modelAddress: () => '/testroom?modmodels', reload: async () => {} });
    const deactivate = vi.fn(drivers.deactivate!);
    const api = createLocalPackApi({ ...drivers, deactivate, mods: library, models: { read: async () => modelEntries, put: async () => {}, remove: async () => { expect(hasMappedModel('crate')).toBe(false); } }, textures: new UploadedPacks(memoryUploadBackend()) });
    await api.remove('mod:inactive');
    expect(deactivate).not.toHaveBeenCalled(); expect(panel.isApplied('agent-demo')).toBe(true);
    await api.remove('model:current');
    expect(deactivate).toHaveBeenCalledWith('model', 'model:current', expect.any(AbortSignal));
    expect(hasMappedModel('crate')).toBe(false);
    await api.remove('mod:agent-demo');
    expect(panel.isApplied('agent-demo')).toBe(false);
    expect(deactivate).toHaveBeenCalledWith('mod', 'mod:agent-demo', expect.any(AbortSignal));
    api.dispose();
  });

  it('applies a real stored texture through verified runtime reads, with no network, and restores on deactivate', async () => {
    const source: PackSource = { key: 'wall', flags: { bilinear: true, transparent: false, graded: false, opaque: true, gs: null }, levels: [{ width: 2, height: 2, data: new Uint8ClampedArray([10, 20, 30, 255, 10, 20, 30, 255, 10, 20, 30, 255, 10, 20, 30, 255]) }], library: 'MP51', record: 'wall' };
    const built = await buildTexturePack([source], { archiveSha256: 'a'.repeat(64), archiveBytes: 123, toolCommit: 'b'.repeat(40), toolSha256: 'c'.repeat(64) });
    const store = new UploadedPacks(memoryUploadBackend());
    const entry = { id: built.id, name: 'Fixture', kind: 'textures' as const, method: built.manifest.method, scale: built.manifest.scale, roles: 'world' as const, generatedAt: '2026-10-24T00:00:00.000Z', textures: 1, bytes: built.manifest.totalBytes, notes: '' };
    await store.add('MP51', 'pack', entry, new Map([['manifest.json', built.manifestBytes], ...built.payloads]));
    const texture = new DataTexture(new Uint8Array(16), 2, 2), fetcher = vi.fn(async () => { throw new Error('unexpected fetch'); });
    const runtime = new LocalTexturePacks(fetcher, undefined, undefined, undefined, { store });
    runtime.setTarget(new TexturePackTarget(() => new Map([['wall', source]]), new Map([['wall', texture]]), 'MP51'));
    const options = createLiveLocalPackDrivers({ allowed: () => true, modPanel: () => null, texturePacks: () => runtime, textureContext: async () => ({ map: 'MP51', archive: bytes('fixture archive'), toolCommit: 'b'.repeat(40), sourcesFor: () => [source] }), modelAddress: () => '/testroom?modmodels', reload: async () => {} });
    await options.applyTexture!({ pack: built, entry, leftOut: [] }, new AbortController().signal);
    expect(runtime.applied).toBe(1); expect(texture.image.width).toBe(4); expect(fetcher).not.toHaveBeenCalled();
    expect(options.isApplied!('texture', `texture:MP51:${built.id}`)).toBe(true);
    expect(options.isApplied!('texture', `texture:MP72:${built.id}`)).toBe(false);
    await options.deactivate!('texture', 'texture:MP51:other', new AbortController().signal);
    expect(runtime.applied).toBe(1);
    await options.deactivate!('texture', `texture:MP51:${built.id}`, new AbortController().signal);
    expect(texture.image.width).toBe(2); expect(runtime.applied).toBe(0);
    runtime.dispose();
  });

  it.each(['abort', 'play'])('refuses a delayed texture payload after %s without touching the original image', async (cause) => {
    let allowed = true;
    const source: PackSource = { key: 'wall', flags: { bilinear: true, transparent: false, graded: false, opaque: true, gs: null }, levels: [{ width: 1, height: 1, data: new Uint8ClampedArray([10, 20, 30, 255]) }] };
    const built = await buildTexturePack([source], { archiveSha256: 'a'.repeat(64), archiveBytes: 123, toolCommit: 'b'.repeat(40), toolSha256: 'c'.repeat(64) });
    const store = new UploadedPacks(memoryUploadBackend());
    const entry = { id: built.id, name: 'Fixture', kind: 'textures' as const, method: built.manifest.method, scale: built.manifest.scale, roles: 'world' as const, generatedAt: '2026-10-24T00:00:00.000Z', textures: 1, bytes: built.manifest.totalBytes, notes: '' };
    await store.add('MP51', 'pack', entry, new Map([['manifest.json', built.manifestBytes], ...built.payloads]));
    const originalRead = store.file.bind(store);
    let release!: () => void;
    vi.spyOn(store, 'file').mockImplementation(async (map, id, name) => {
      const data = await originalRead(map, id, name);
      if (name !== 'manifest.json') await new Promise<void>((resolve) => { release = resolve; });
      return data;
    });
    const texture = new DataTexture(new Uint8Array(4), 1, 1), original = texture.image;
    const runtime = new LocalTexturePacks(async () => { throw new Error('unexpected fetch'); }, undefined, undefined, undefined, { store });
    runtime.setTarget(new TexturePackTarget(() => new Map([['wall', source]]), new Map([['wall', texture]]), 'MP51'));
    const abort = new AbortController();
    const applying = runtime.activateStored(built.id, () => allowed && !abort.signal.aborted, abort.signal);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    if (cause === 'abort') abort.abort(); else allowed = false;
    release();
    await expect(applying).rejects.toThrow();
    expect(texture.image).toBe(original); expect(runtime.applied).toBe(0);
    runtime.dispose();
  });
});
