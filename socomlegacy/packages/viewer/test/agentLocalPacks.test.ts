import { describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { CHECK_REPORT_SCHEMA, CHECK_REPORT_VERSION, DIAGNOSTIC_SCHEMA, DIAGNOSTIC_VERSION } from '@s2u/creator-contracts';
import { LocalFileError } from '../src/agent/localFiles';
import { createLocalPackApi } from '../src/agent/localPacks';
import { readSaved } from '../src/forge/record';
import { idbModLibrary, memoryModLibrary } from '../src/mods/store';
import { makeZip } from './zipFixture';
import { memoryUploadBackend, UploadedPacks } from '../src/texturePackStore';
import { encodePng } from '../../../tools/png';
import type { PackSource } from '../src/texturePack';
import type { PackEntry } from '../src/modelPack';
import type { LoadedModelPack } from '../src/modelPackRuntime';

/** One untextured synthetic triangle; no disc data and no external GLB resources. */
function triangle(): Uint8Array {
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }], buffers: [{ byteLength: 36 }] };
  const encoded = new TextEncoder().encode(JSON.stringify(json)); const padded = Math.ceil(encoded.length / 4) * 4;
  const out = new Uint8Array(12 + 8 + padded + 8 + 36); const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, out.length, true);
  view.setUint32(12, padded, true); view.setUint32(16, 0x4e4f534a, true); out.fill(32, 20, 20 + padded); out.set(encoded, 20);
  view.setUint32(20 + padded, 36, true); view.setUint32(24 + padded, 0x004e4942, true);
  out.set(new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer), 28 + padded); return out;
}

const record = { v: 2, name: 'Local map', base: 'blank:floor', assets: [], pieces: [], spawns: [] };
const file = (name: string, data: string | Uint8Array) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return { name, size: bytes.length, arrayBuffer: async () => bytes.slice().buffer };
};
const mod = (extra: Record<string, unknown> = {}) => ({ format: 's2u-mod', formatVersion: 1, id: 'local-demo', name: 'Local demo', version: '1', author: 'Fixture', description: '', target: 'socom2-us-r0001', files: [{ path: 'NOTES/HELLO.TXT', file: 'hello.txt' }], ...extra });
const modZip = () => makeZip([{ name: 'mod.json', data: JSON.stringify(mod()) }, { name: 'hello.txt', data: 'private local bytes' }]);
const store = () => { const data = new Map<string, string>(); return { get: (k: string) => data.get(k) ?? null, set: (k: string, v: string) => { data.set(k, v); } }; };
const options = () => ({ mods: memoryModLibrary(), maps: store(), models: { read: async () => null, put: async () => {}, remove: async () => {} }, textures: new UploadedPacks(memoryUploadBackend()) });

async function removable(kind: 'mod' | 'model') {
  const config = options();
  let entries: readonly PackEntry[] | null = [{ path: 'model.glb', bytes: Uint8Array.of(1, 2, 3) }];
  const models = {
    read: async () => entries,
    put: async (next: readonly PackEntry[]) => { entries = next; },
    remove: async () => { entries = null; },
  };
  const savedMod = (value: number) => ({ id: 'local-demo', label: 'Local demo', files: [{ name: 'hello.txt', bytes: Uint8Array.of(value, 2, 3) }] });
  if (kind === 'mod') await config.mods.put(savedMod(1));
  return {
    config: { ...config, models }, id: kind === 'mod' ? 'mod:local-demo' : 'model:current',
    async replace() { if (kind === 'mod') await config.mods.put(savedMod(4)); else await models.put([{ path: 'model.glb', bytes: Uint8Array.of(4, 2, 3) }]); },
    async bytes() { return kind === 'mod' ? (await config.mods.read()).packages[0]?.files[0]?.bytes : (await models.read())?.[0]?.bytes; },
  };
}

describe('local package API (product adaptation)', () => {
  it.each(['mod', 'model'] as const)('removes an active %s when its own deactivation reload advances the initiating editor revision', async kind => {
    const fixture = await removable(kind); let revision = 1;
    const check = vi.fn(() => { if (revision !== 1) throw new LocalFileError('REVISION_CONFLICT', 'The editor changed.'); });
    const deactivate = vi.fn(async () => { revision++; await Promise.resolve(); });
    const api = createLocalPackApi({ ...fixture.config, allowedSurface: () => true, isApplied: () => true, deactivate });
    await expect(api.remove(fixture.id, { check })).resolves.toMatchObject({ removed: true, stored: false });
    expect(deactivate).toHaveBeenCalledOnce(); expect(check).toHaveBeenCalled(); expect(await fixture.bytes()).toBeUndefined();
  });
  it.each(['mod', 'model'] as const)('preserves a human replacement of the same stored %s ID during deactivation', async kind => {
    const fixture = await removable(kind); let revision = 1;
    const api = createLocalPackApi({ ...fixture.config, allowedSurface: () => true, isApplied: () => true,
      deactivate: async () => { revision++; await fixture.replace(); } });
    await expect(api.remove(fixture.id, { check: () => { if (revision !== 1) throw new LocalFileError('REVISION_CONFLICT', 'The editor changed.'); } })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(await fixture.bytes()).toEqual(Uint8Array.of(4, 2, 3));
  });
  it.each(['abort', 'surface'] as const)('retains stored content when %s changes during its own deactivation reload', async change => {
    const fixture = await removable('model'); let revision = 1; let allowed = true; const abort = new AbortController();
    const api = createLocalPackApi({ ...fixture.config, allowedSurface: () => allowed, isApplied: () => true,
      deactivate: async () => { revision++; if (change === 'abort') abort.abort(); else allowed = false; await Promise.resolve(); } });
    await expect(api.remove(fixture.id, { signal: abort.signal, check: () => { if (revision !== 1) throw new LocalFileError('REVISION_CONFLICT', 'The editor changed.'); } })).rejects.toMatchObject({ code: change === 'abort' ? 'ABORTED' : 'UNSUPPORTED_SURFACE' });
    expect(await fixture.bytes()).toEqual(Uint8Array.of(1, 2, 3));
  });
  it('checks the initiating revision before deactivation can have a live effect', async () => {
    const fixture = await removable('model'); const deactivate = vi.fn(); let revision = 1;
    const models = { ...fixture.config.models, read: async () => { const entries = await fixture.config.models.read(); revision++; return entries; } };
    const api = createLocalPackApi({ ...fixture.config, models, allowedSurface: () => true, isApplied: () => true, deactivate });
    await expect(api.remove(fixture.id, { check: () => { if (revision !== 1) throw new LocalFileError('REVISION_CONFLICT', 'The editor changed.'); } })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(deactivate).not.toHaveBeenCalled(); expect(await fixture.bytes()).toEqual(Uint8Array.of(1, 2, 3));
  });
  it('rechecks the initiating edit revision before committing a validated local package', async () => {
    let revision = 1; const config = options();
    const api = createLocalPackApi({ ...config, onProgress: e => { if (e.phase === 'storing') revision++; } });
    const [staged] = await api.stage([file('map.json', JSON.stringify(record))]);
    await expect(api.import({ kind: 'map', stagedId: staged!.id }, { check: () => {
      if (revision !== 1) throw new LocalFileError('REVISION_CONFLICT', 'The editor changed during validation.');
    } })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect((await api.list()).filter(item => item.stored)).toEqual([]);
  });
  it('queries live activation before removing packs that predate this API instance', async () => {
    const config = options(); await config.mods.put({ id: 'local-demo', label: 'Local demo', files: [] });
    const deactivate = vi.fn(async () => {});
    const api = createLocalPackApi({ ...config, allowedSurface: () => true, isApplied: (kind, id) => kind === 'mod' && id === 'mod:local-demo', deactivate });
    expect(await api.list()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'mod:local-demo', applied: true })]));
    await api.remove('mod:local-demo');
    expect(deactivate).toHaveBeenCalledWith('mod', 'mod:local-demo', expect.any(AbortSignal));
  });
  it('refuses ungranted paths and unsafe paths without any network request', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const api = createLocalPackApi(options());
    await expect(api.import({ kind: 'map', path: 'map.json' })).rejects.toMatchObject({ code: 'PERMISSION_REQUIRED' });
    await expect(api.import({ kind: 'map', path: '../map.json' })).rejects.toMatchObject({ code: 'INVALID_PATH' });
    expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals();
  });
  it('stages then parses a map through the existing record reader, persists and applies only explicitly', async () => {
    const mapApply = vi.fn(); const config = { ...options(), allowedSurface: () => true, applyMap: mapApply };
    const api = createLocalPackApi(config);
    const [staged] = await api.stage([file('map.json', JSON.stringify(record))]);
    const result = await api.import({ kind: 'map', stagedId: staged!.id });
    expect(result).toMatchObject({ imported: true, stored: true, enabled: false, applied: false });
    expect(mapApply).not.toHaveBeenCalled();
    const restored = createLocalPackApi(config);
    expect(await restored.list()).toEqual(expect.arrayContaining([expect.objectContaining({ id: result.id, kind: 'map', stored: true })]));
    const [again] = await api.stage([file('map.json', JSON.stringify(record))]);
    const applied = await api.import({ kind: 'map', stagedId: again!.id, apply: true });
    // FCW-07a: the record reader gives the v3 record (the v2 file migrated)
    expect(applied.applied).toBe(true); expect(mapApply).toHaveBeenCalledWith(readSaved(JSON.stringify(record), 'x'), expect.any(AbortSignal));
    await restored.remove(result.id); expect(await restored.list()).toEqual([]);
  });
  it('validates real mod packages before a real IndexedDB transaction, leaves switches off and returns only metadata', async () => {
    // Keep one factory: opening another factory creates another independent browser store.
    const factory = new IDBFactory(); const library = idbModLibrary(() => factory);
    const api = createLocalPackApi({ ...options(), mods: library });
    const [staged] = await api.stage([file('mod.zip', modZip())]);
    const result = await api.import({ kind: 'mod', stagedId: staged!.id });
    expect(result).toMatchObject({ id: 'mod:local-demo', imported: true, stored: true, enabled: false, applied: false });
    expect(JSON.stringify(result)).not.toContain('private local bytes');
    expect(typeof result.files).toBe('number'); expect(typeof result.bytes).toBe('number'); expect(result).not.toHaveProperty('entries');
    expect((await library.read()).packages[0]?.files).toHaveLength(2);
    expect((await library.read()).choices.enabled).toBe(false);
    const refreshed = createLocalPackApi({ ...options(), mods: library });
    expect(await refreshed.list()).toEqual(expect.arrayContaining([expect.objectContaining({ id: result.id })]));
    await refreshed.remove(result.id); expect((await library.read()).packages).toEqual([]);
  });
  it('refuses missing mod members before storage and reports unsupported live surfaces before commit', async () => {
    const config = options(); const api = createLocalPackApi(config);
    const [bad] = await api.stage([file('mod.json', JSON.stringify(mod()))]);
    await expect(api.import({ kind: 'mod', stagedId: bad!.id })).rejects.toMatchObject({ code: 'INVALID_PACKAGE' });
    const [good] = await api.stage([file('mod.zip', modZip())]);
    await expect(api.import({ kind: 'mod', stagedId: good!.id, apply: true })).rejects.toMatchObject({ code: 'UNSUPPORTED_SURFACE' });
    expect((await config.mods.read()).packages).toEqual([]);
  });
  it('emits progress; cancellation, revocation and dispose leave no staged partial package', async () => {
    const events: unknown[] = []; const api = createLocalPackApi({ ...options(), onProgress: event => events.push(event) });
    const abort = new AbortController();
    await expect(api.stage([{ name: 'map.json', size: 2, arrayBuffer: async () => { abort.abort(); return new ArrayBuffer(2); } }], { signal: abort.signal })).rejects.toMatchObject({ code: 'ABORTED' });
    expect(await api.list()).toEqual([]);
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ phase: 'reading' }), expect.objectContaining({ phase: 'error', code: 'ABORTED' })]));
    api.dispose(); await expect(api.list()).rejects.toMatchObject({ code: 'DISPOSED' });
  });
  it('rejects a live driver failure as failure, preserving honest stored status in its typed error', async () => {
    const api = createLocalPackApi({ ...options(), allowedSurface: () => true, applyMap: async () => { throw new Error('renderer failed'); } });
    const [staged] = await api.stage([file('map.json', JSON.stringify(record))]);
    await expect(api.import({ kind: 'map', stagedId: staged!.id, apply: true })).rejects.toMatchObject({ code: 'APPLY_FAILED', result: { stored: true, applied: false } });
  });
  it('imports the one map.json or layout.json of a multi-file map pack, ignores its other files, and refuses none or several', async () => {
    const config = { ...options(), allowedSurface: () => true }; const api = createLocalPackApi(config);
    const [zipped] = await api.stage([file('pack.zip', makeZip([{ name: 'map.json', data: JSON.stringify(record) }, { name: 'README.txt', data: 'notes' }]))]);
    const fromZip = await api.import({ kind: 'map', stagedId: zipped!.id });
    expect(fromZip).toMatchObject({ imported: true, stored: true, files: 1 });
    const [loose] = await api.stage([file('layout.json', JSON.stringify(record)), file('preview.txt', 'notes')]);
    expect(await api.import({ kind: 'map', stagedId: loose!.id })).toMatchObject({ imported: true, stored: true });
    const [alone] = await api.stage([file('map.json', JSON.stringify(record))]);
    expect((await api.import({ kind: 'map', stagedId: alone!.id })).id).toBe(fromZip.id);   // the readme is not part of the saved map
    const [several] = await api.stage([file('two.zip', makeZip([{ name: 'map.json', data: JSON.stringify(record) }, { name: 'extra/layout.json', data: JSON.stringify(record) }]))]);
    await expect(api.import({ kind: 'map', stagedId: several!.id })).rejects.toMatchObject({ code: 'INVALID_PACKAGE' });
    const [none] = await api.stage([file('none.zip', makeZip([{ name: 'notes.json', data: JSON.stringify(record) }, { name: 'README.txt', data: 'notes' }]))]);
    await expect(api.import({ kind: 'map', stagedId: none!.id })).rejects.toMatchObject({ code: 'INVALID_PACKAGE' });
  });
  it('loads real GLBs, reports skipped mappings, persists locally without installation and restores/removes the saved model pack', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory()); const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const config = { ...options(), models: undefined }; const api = createLocalPackApi(config);
      const manifest = { format: 's2u-model-pack', version: 1, models: [{ id: 'crate', file: 'triangle.glb' }, { id: 'missing', file: 'missing.glb' }] };
      const [staged] = await api.stage([file('models.json', JSON.stringify(manifest)), file('triangle.glb', triangle())]);
      const imported = await api.import({ kind: 'model', stagedId: staged!.id });
      expect(imported).toMatchObject({ id: 'model:current', stored: true, applied: false, diagnostics: [{ code: 'MODELS_SKIPPED', count: 1 }] });
      const report = expect.objectContaining({ schema: CHECK_REPORT_SCHEMA, version: CHECK_REPORT_VERSION,
        evidence: 'validation', status: 'fail', diagnostics: expect.arrayContaining([expect.objectContaining({
          schema: DIAGNOSTIC_SCHEMA, version: DIAGNOSTIC_VERSION, source: 'pack', severity: 'error',
          code: 'pack.MEMBER_MISSING', file: 'missing.glb',
        })]),
      });
      expect(imported).toMatchObject({ ref: null, validation: 'pending-validation', report });
      const refreshed = createLocalPackApi(config);
      expect(await refreshed.list()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'model:current', files: 2,
        ref: null, validation: 'pending-validation', report,
      })]));
      await refreshed.remove('model:current'); expect(await refreshed.list()).toEqual([]);
    } finally { warn.mockRestore(); vi.unstubAllGlobals(); }
  });
  it.each(['unchanged', 'human replacement'] as const)('binds an applied pending model summary to its saved content: %s', async state => {
    vi.stubGlobal('indexedDB', new IDBFactory()); const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let live: LoadedModelPack | undefined;
    const apply = vi.fn(async (pack: LoadedModelPack) => { live = pack; });
    const api = createLocalPackApi({ ...options(), models: undefined, allowedSurface: () => true, applyModel: apply });
    try {
      const manifest = JSON.stringify({ format: 's2u-model-pack', version: 1,
        models: [{ id: 'crate', file: 'triangle.glb' }, { id: 'missing', file: 'missing.glb' }] });
      const glb = triangle();
      const [staged] = await api.stage([file('models.json', manifest), file('triangle.glb', glb)]);
      const imported = await api.import({ kind: 'model', stagedId: staged!.id, apply: true });
      expect(imported).toMatchObject({ id: 'model:current', stored: true, applied: true, enabled: true,
        ref: null, validation: 'pending-validation', diagnostics: [{ code: 'MODELS_SKIPPED', count: 1 }],
        report: { schema: CHECK_REPORT_SCHEMA, version: CHECK_REPORT_VERSION, evidence: 'validation', status: 'fail',
          diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'pack.MEMBER_MISSING', file: 'missing.glb' })]) },
      });
      expect(imported.digest).toEqual(expect.any(String));
      expect(apply).toHaveBeenCalledOnce(); expect(live?.has('crate')).toBe(true); expect(live?.skipped).toEqual(['missing']);
      if (state === 'human replacement') {
        // Same manifest, paths and byte lengths; only an actual GLB vertex changes.
        const replacement = glb.slice(); new DataView(replacement.buffer).setFloat32(replacement.length - 4, 0.5, true);
        const { storeModelPackEntries } = await import('../src/modelPackRuntime');
        await storeModelPackEntries([{ path: 'models.json', bytes: new TextEncoder().encode(manifest) },
          { path: 'triangle.glb', bytes: replacement }]);
      }
      const [listed] = await api.list();
      if (state === 'unchanged') {
        expect(listed).toMatchObject({ id: 'model:current', ref: null, validation: 'pending-validation',
          applied: true, enabled: true, digest: imported.digest, diagnostics: [{ code: 'MODELS_SKIPPED', count: 1 }] });
      } else {
        expect(listed).toMatchObject({ id: 'model:current', ref: null, validation: 'pending-validation', applied: false, enabled: false });
        expect(listed?.digest).not.toBe(imported.digest);
      }
    } finally { api.dispose(); live?.dispose(); warn.mockRestore(); vi.unstubAllGlobals(); }
  });
  it.each(['first observation', 'changed generation'] as const)('closes pending model content reads when removal is cancelled during %s', async observation => {
    vi.stubGlobal('indexedDB', new IDBFactory()); const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const runtime = await import('../src/modelPackRuntime'), controller = new AbortController();
    let instrument = false, reads = 0, readers = 0, readerClosed = false, observedSignal: AbortSignal | undefined, live: LoadedModelPack | undefined;
    let atSettlement: { reads: number; readers: number; closed: boolean } | undefined;
    let enter!: () => void, release!: () => void, close!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const resume = new Promise<void>(resolve => { release = resolve; });
    const closed = new Promise<void>(resolve => { close = resolve; });
    const models = {
      list: runtime.storedModelPackCatalogue, put: runtime.storeModelPackEntries, remove: runtime.removeStoredModelPack,
      identify: runtime.identifyStoredModelPack,
      read: async () => {
        const saved = await runtime.readStoredModelPack();
        return saved?.kind === 'files' && saved.entries ? saved.entries.map(entry => ({ path: entry.path, bytes: new Uint8Array(entry.bytes) })) : null;
      },
      inspect: async (slot: 'primary' | 'second', signal?: AbortSignal) => {
        const owned = await runtime.inspectStoredModelPack(slot, signal);
        if (!owned || !instrument) return owned;
        return { ...owned, files: owned.files?.map(member => {
          if ('bytes' in member) throw Error('The owning native model inspection must expose bounded readers.');
          return { ...member, async *read() {
            readers++;
            try {
              for await (const chunk of member.read()) for (let offset = 0; offset < chunk.length; offset++) {
                if (signal?.aborted) throw new DOMException('cancelled', 'AbortError');
                reads++;
                if (reads === 1) {
                  observedSignal = signal; enter(); controller.abort();
                  // An owning abort-aware reader can finish before remove settles. The test's fallback release
                  // also keeps the old wrong-signal path bounded, without supplying it the missing cancellation.
                  await new Promise<void>(resolve => {
                    const wake = (): void => { signal?.removeEventListener('abort', wake); resolve(); };
                    if (signal?.aborted) wake();
                    else { signal?.addEventListener('abort', wake, { once: true }); void resume.then(wake); }
                  });
                }
                if (signal?.aborted) throw new DOMException('cancelled', 'AbortError');
                yield chunk.subarray(offset, offset + 1);
              }
            } finally { readers--; readerClosed = true; close(); }
          } };
        }) ?? null };
      },
    };
    const deactivate = vi.fn(), api = createLocalPackApi({ ...options(), models, allowedSurface: () => true,
      applyModel: pack => { live = pack; }, deactivate });
    try {
      const manifest = JSON.stringify({ format: 's2u-model-pack', version: 1,
        models: [{ id: 'crate', file: 'triangle.glb' }, { id: 'missing', file: 'missing.glb' }] });
      const entries = [{ path: 'models.json', bytes: new TextEncoder().encode(manifest) }, { path: 'triangle.glb', bytes: triangle() }];
      const [staged] = await api.stage(entries.map(entry => file(entry.path, entry.bytes)));
      expect(await api.import({ kind: 'model', stagedId: staged!.id, apply: true })).toMatchObject({ ref: null, applied: true });
      if (observation === 'changed generation') {
        expect(await api.list()).toEqual([expect.objectContaining({ applied: true })]);
        await runtime.storeModelPackEntries(entries); // Same bytes, new real native scope generation.
      }
      const before = await runtime.readStoredModelPack(); instrument = true;
      const removing = expect(api.remove('model:current', { signal: controller.signal }).catch(error => {
        atSettlement = { reads, readers, closed: readerClosed }; throw error;
      })).rejects.toMatchObject({ code: 'ABORTED' });
      await entered;
      if (!observedSignal?.aborted) release();
      await removing;
      expect.soft(observedSignal?.aborted).toBe(true);
      expect.soft(atSettlement).toEqual({ reads: 1, readers: 0, closed: true });
      release(); await closed;
      expect.soft(reads).toBe(1); expect.soft(readers).toBe(0);
      expect(deactivate).not.toHaveBeenCalled();
      expect(await runtime.readStoredModelPack()).toEqual(before);
    } finally { release(); api.dispose(); live?.dispose(); warn.mockRestore(); vi.unstubAllGlobals(); }
  });
  it('builds a real PNG texture ZIP for the loaded map, keeps it in the existing library and restores/removes it', async () => {
    const source: PackSource = { key: 'rock.tif', flags: { bilinear: true, transparent: false, graded: false, opaque: true, gs: null }, levels: [{ width: 4, height: 4, data: new Uint8ClampedArray(64).fill(255) }] };
    const png = encodePng(8, 8, new Uint8ClampedArray(256).fill(255));
    const config = { ...options(), loadedTextures: () => ({ map: 'MP72' as const, sourcesFor: () => [source], archive: Uint8Array.of(1, 2, 3), toolCommit: 'a'.repeat(40) }) };
    const api = createLocalPackApi(config); const [staged] = await api.stage([file('textures.zip', makeZip([{ name: 'rock.png', data: png }]))]);
    const result = await api.import({ kind: 'texture', stagedId: staged!.id });
    expect(result).toMatchObject({ kind: 'texture', stored: true, enabled: false, applied: false });
    const refreshed = createLocalPackApi(config); expect(await refreshed.list()).toEqual(expect.arrayContaining([expect.objectContaining({ id: result.id, stored: true })]));
    expect((await config.textures.list('MP72'))[0]?.files).toContain('manifest.json');
    await refreshed.remove(result.id); expect(await refreshed.list()).toEqual([]);
  });
  it('refuses normalized-away manifest traversal and external model resources without fetching anything', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    try {
      for (const kind of ['mod', 'model'] as const) {
        const api = createLocalPackApi(options());
        const manifest = kind === 'mod' ? mod({ files: [{ path: 'NOTES/HELLO.TXT', file: '/hello.txt' }] }) : { format: 's2u-model-pack', version: 1, models: [{ id: 'crate', file: '/triangle.glb' }] };
        const [staged] = await api.stage([file(kind === 'mod' ? 'mod.json' : 'models.json', JSON.stringify(manifest)), file(kind === 'mod' ? 'hello.txt' : 'triangle.glb', kind === 'mod' ? 'data' : triangle())]);
        await expect(api.import({ kind, stagedId: staged!.id })).rejects.toMatchObject({ code: 'INVALID_PATH' });
      }
      expect(fetch).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it('checks surface approval immediately before commit, including apply:false, and honors revocation mid-read', async () => {
    let allowed = true; const config = options();
    const api = createLocalPackApi({ ...config, allowedSurface: () => allowed, onProgress: event => { if (event.phase === 'storing') allowed = false; } });
    const [staged] = await api.stage([file('map.json', JSON.stringify(record))]);
    await expect(api.import({ kind: 'map', stagedId: staged!.id })).rejects.toMatchObject({ code: 'UNSUPPORTED_SURFACE' });
    expect(config.maps.get('s2u-forge-saves')).toBeNull();
    const local = createLocalPackApi(config);
    const root = { kind: 'directory' as const, name: 'root', queryPermission: async () => 'granted' as const, getDirectoryHandle: vi.fn(), async *values() {}, getFileHandle: async () => ({ kind: 'file' as const, name: 'map.json', getFile: async () => ({ ...file('map.json', JSON.stringify(record)), arrayBuffer: async () => { local.setDirectory(null); return new TextEncoder().encode(JSON.stringify(record)).buffer; } }) }) };
    local.setDirectory(root);
    await expect(local.import({ kind: 'map', path: 'map.json' })).rejects.toMatchObject({ code: 'ABORTED' });
    expect(config.maps.get('s2u-forge-saves')).toBeNull();
  });
  it('turns quota failures into typed storage errors and retains staged data for retry', async () => {
    const config = { ...options(), mods: memoryModLibrary(1) }; const api = createLocalPackApi(config);
    const [staged] = await api.stage([file('mod.zip', modZip())]);
    await expect(api.import({ kind: 'mod', stagedId: staged!.id })).rejects.toMatchObject({ code: 'STORAGE_FAILED' });
    expect(await api.list()).toEqual([expect.objectContaining({ id: staged!.id, staged: true })]);
    expect((await config.mods.read()).packages).toEqual([]);
  });
  // FCW-33 fold F5: the widened localFiles extensions (.md .gltf .ktx2 .ogg .wav) serve the v2 `pack` kind only; a legacy
  // mod's stray member of one of them is refused as before, never stored.
  it.each(['sounds/hit.ogg', 'README.md', 'models/crate.gltf'])('refuses a stray %s in a legacy mod zip, storing nothing', async stray => {
    const config = options(), api = createLocalPackApi(config);
    const zip = makeZip([{ name: 'mod.json', data: JSON.stringify(mod()) }, { name: 'hello.txt', data: 'private local bytes' }, { name: stray, data: 'stray' }]);
    const [staged] = await api.stage([file('mod.zip', zip)]);
    await expect(api.import({ kind: 'mod', stagedId: staged!.id })).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' });
    expect((await config.mods.read()).packages).toEqual([]);
    api.dispose();
  });
});

/**
 * FCW-32 round 2 (the review's F7; product track): the map library keeps records without rules, deliberately strict --
 * the record has no rules field until the contract row (FCW-35, FCW.R19) -- so a saved Forge layout with rules (its
 * authoring envelope) offered as a map pack is refused by name, pointing at the Forge's own file open, never as a record
 * "outside the Forge record limits".
 */
describe('FCW-32 round 2: a layout with rules offered as a map pack', () => {
  it('is refused by name, storing nothing', async () => {
    const { planForgeLayout } = await import('../src/forge/agent/commands');
    const { emptyLayout } = await import('../src/forge/layout');
    const { forgeAuthoringText, sealForgeRules } = await import('../src/forge/rulesAuthoring');
    let l = planForgeLayout(emptyLayout({ kind: 'blank', library: 'floor' }), 'zone.place', { id: 'vault', shape: 'cylinder', at: [0, 0, 0], radius: 5, height: 3 }, []);
    l = planForgeLayout(l, 'rules.new', { pack: 'my.vault', version: '1.0.0', id: 'vault.run', name: 'Vault run' }, []);
    const made = forgeAuthoringText(await sealForgeRules(l), 'Vault');
    if (!('text' in made)) throw new Error(made.why);
    const api = createLocalPackApi({ ...options(), allowedSurface: () => true });
    const [staged] = await api.stage([file('map.json', made.text)]);
    await expect(api.import({ kind: 'map', stagedId: staged!.id })).rejects.toMatchObject({ code: 'INVALID_PACKAGE', message: expect.stringMatching(/a Forge layout with rules/) });
    expect((await api.list()).filter((item) => !item.staged)).toEqual([]);
  });
});
