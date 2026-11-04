import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { ENGINE_CONTRACT_VERSION, PACK_TARGET_US, sha256Hex, type BufferedPackFile, type PackContext } from '@s2u/creator-contracts';
import { createPackRegistry } from '../src/packs/registry';
import { validateLegacyPack } from '../src/packs/adapters';
import { idbPackDatabase, PACKS_BYTES, PACKS_DB } from '../src/packs/storage';
import { idbModLibrary, memoryModLibrary, type StoredMod } from '../src/mods/store';
import { idbUploadBackend, memoryUploadBackend, UploadedPacks } from '../src/texturePackStore';
import { chunkStoredFiles } from '../src/modelPackRuntime';
import { buildTexturePack } from '../src/texturePackBuild';

/** Product adaptation: stored validation uses authored small records; no renderer or large fixture is involved. */
const bytes = (text: string) => new TextEncoder().encode(text);
const context: PackContext = { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSION, packs: [], handlers: [] };
const mod = (text = 'authored native bytes'): StoredMod => ({ id: 'native', label: 'Native', files: [
  { name: 'mod.json', bytes: bytes(JSON.stringify({ format: 's2u-mod', formatVersion: 1, id: 'native', name: 'Native',
    version: '1', author: 'Fixture', description: '', target: 'socom2-us-r0001', files: [{ path: 'NOTES/NATIVE.TXT', file: 'native.txt' }] })) },
  { name: 'native.txt', bytes: bytes(text) },
] });
const asFiles = (pack: StoredMod): BufferedPackFile[] => pack.files.map(file => ({ path: file.name, bytes: file.bytes }));
const options = (factory: IDBFactory) => ({ context, database: idbPackDatabase(() => factory), mods: idbModLibrary(() => factory),
  maps: { get: () => null, set: () => {} }, models: { read: async () => null, put: async () => {}, remove: async () => {} },
  textures: new UploadedPacks(memoryUploadBackend()) });
async function oldModels(factory: IDBFactory, rows: [string, unknown][]): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = factory.open('s2u.modelPack', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('pack');
    open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
  });
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('pack', 'readwrite');
    for (const [key, value] of rows) tx.objectStore('pack').put(value, key);
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('explicit stored native validation (product adaptation)', () => {
  it('promotes an unvalidated mod through the published validator while preserving bytes and saved choices', async () => {
    const factory = new IDBFactory(), config = options(factory), pack = mod();
    await config.mods.put(pack); await config.mods.writeChoices({ enabled: true, order: ['native'], disabled: ['native'] });
    const before = await config.mods.read(), expected = await validateLegacyPack('mod', asFiles(pack), context);
    expect(expected.ok).toBe(true); if (!expected.ok) return;
    const api = createPackRegistry(config), put = IDBObjectStore.prototype.put, byteWrites: unknown[] = [];
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.transaction.db.name === PACKS_DB && this.name === PACKS_BYTES) byteWrites.push(args[1]);
      return put.apply(this, args);
    });
    expect(await api.validate('mod:native')).toMatchObject({ ref: expected.ref, validation: 'validated', report: { status: 'pass' },
      stored: true, enabled: false, applied: false });
    const after = await config.mods.read();
    expect(after.packages).toEqual(before.packages); expect(after.choices).toEqual(before.choices);
    expect(byteWrites).toEqual([]); api.dispose();
    const reopened = createPackRegistry(options(factory));
    expect(await reopened.list()).toEqual([expect.objectContaining({ ref: expected.ref, validation: 'validated' })]); reopened.dispose();
  });

  it('retains bytes, choices, generation and pending identity when strict validation refuses a native manifest', async () => {
    const factory = new IDBFactory(), config = options(factory), pack = mod();
    pack.files[0]!.bytes = bytes('invalid JSON'); await config.mods.put(pack);
    const before = await config.mods.read(), api = createPackRegistry(config);
    await expect(api.validate('mod:native')).rejects.toMatchObject({ code: 'INVALID_PACKAGE', report: {
      status: 'fail', diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'pack.LEGACY_INVALID', file: 'mod.json' })]),
    } });
    expect(await config.mods.read()).toEqual(before);
    expect(await api.list()).toEqual([expect.objectContaining({ ref: null, validation: 'pending-validation' })]); api.dispose();
  });

  it('preserves a human replacement committed while the published manifest hash is pending', async () => {
    const factory = new IDBFactory(), config = options(factory), human = idbModLibrary(() => factory);
    await config.mods.put(mod()); let replaced = false;
    const api = createPackRegistry({ ...config, context: { ...context, sha256: async value => {
      if (!replaced) { replaced = true; await human.put(mod('newer human bytes')); }
      return new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(value).buffer));
    } } });
    await expect(api.validate('mod:native')).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect((await human.read()).packages).toEqual([mod('newer human bytes')]);
    expect(await api.list()).toEqual([expect.objectContaining({ ref: null, validation: 'pending-validation' })]); api.dispose();
  });

  it('stops a cancelled stored byte iteration and leaves its scope unchanged', async () => {
    const factory = new IDBFactory(), config = options(factory), controller = new AbortController();
    await config.mods.put(mod()); const before = await config.mods.read(), api = createPackRegistry(config);
    const get = IDBObjectStore.prototype.get, reads: unknown[] = [];
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, ...args) {
      const request = get.apply(this, args);
      if (this.transaction.db.name === PACKS_DB && this.name === PACKS_BYTES) {
        reads.push(args[0]); queueMicrotask(() => controller.abort());
      }
      return request;
    });
    await expect(api.validate('mod:native', { signal: controller.signal })).rejects.toMatchObject({ code: 'ABORTED' });
    expect(reads).toHaveLength(1); vi.restoreAllMocks();
    expect(await config.mods.read()).toEqual(before); api.dispose();
  });

  it('validates chunked model members with one byte request in flight and preserves the other native slot', async () => {
    const factory = new IDBFactory(); vi.stubGlobal('indexedDB', factory);
    const files = [{ path: 'models.json', bytes: bytes(JSON.stringify({ format: 's2u-model-pack', version: 1,
      models: [{ id: 'crate', file: 'crate.glb' }] })) }, { path: 'crate.glb', bytes: new Uint8Array([1, 2, 3, 4, 5]) }];
    const packed = chunkStoredFiles(files.map(file => ({ path: file.path, bytes: file.bytes.slice().buffer })), 7);
    await oldModels(factory, [['current', { kind: 'files', files: packed.files, chunks: packed.chunks.length }],
      ...packed.chunks.map((chunk, index): [string, unknown] => [`c:${index}`, chunk]),
      ['second', { kind: 'files', entries: [{ path: 'second.glb', bytes: bytes('other slot').buffer }] }]]);
    const config = options(factory), api = createPackRegistry({ ...config, models: undefined });
    await api.list(); // Complete bounded migration before observing only the validation path.
    const expected = await validateLegacyPack('model', files, context); expect(expected.ok).toBe(true); if (!expected.ok) return;
    let pending = 0, peak = 0, reads = 0;
    const get = IDBObjectStore.prototype.get, getAll = IDBObjectStore.prototype.getAll;
    vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === PACKS_BYTES) throw Error('stored validation must not aggregate byte records');
      return getAll.apply(this, args);
    });
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, ...args) {
      const request = get.apply(this, args);
      if (this.transaction.db.name === PACKS_DB && this.name === PACKS_BYTES) {
        reads++; peak = Math.max(peak, ++pending);
        request.addEventListener('success', () => { pending--; }, { once: true });
        request.addEventListener('error', () => { pending--; }, { once: true });
      }
      return request;
    });
    expect(await api.validate('model:current')).toMatchObject({ ref: expected.ref, validation: 'validated', applied: false });
    expect(reads).toBeGreaterThan(1); expect(peak).toBe(1); expect(pending).toBe(0);
    expect(await api.list()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'model:second', ref: null, validation: 'pending-validation' })]));
    api.dispose();
  });

  it('refuses stored validation of an injected library without a common atomic inspection boundary', async () => {
    const factory = new IDBFactory(), foreign = memoryModLibrary(); await foreign.put(mod());
    const api = createPackRegistry({ ...options(factory), mods: foreign });
    await expect(api.validate('mod:native')).rejects.toMatchObject({ code: 'UNSUPPORTED_SURFACE' });
    expect((await foreign.read()).packages).toEqual([mod()]); api.dispose();
  });

  it('validates one stored texture upload with archive evidence and preserves its per-map payload', async () => {
    const factory = new IDBFactory(), archive = bytes('authored archive'), archiveSha256 = await sha256Hex(archive);
    const built = await buildTexturePack([{ key: 'fixture', library: 'MP51', record: 'fixture',
      flags: { bilinear: true, transparent: false, graded: false, opaque: true, gs: null },
      levels: [{ width: 1, height: 1, data: new Uint8ClampedArray([1, 2, 3, 255]) }],
    }], { archiveSha256, archiveBytes: archive.length, toolCommit: 'b'.repeat(40), toolSha256: 'c'.repeat(64) });
    const files = new Map([['manifest.json', built.manifestBytes], ...built.payloads]), m = built.manifest;
    const textures = new UploadedPacks(idbUploadBackend(() => factory));
    await textures.add('MP51', 'pack', { id: built.id, name: 'Fixture', kind: 'textures', method: m.method, scale: m.scale,
      roles: m.roles ?? 'world', generatedAt: '2026-10-25T00:00:00.000Z', textures: m.entries.length, bytes: m.totalBytes, notes: '' }, files);
    const validationContext = { ...context, archives: { 'RUN/MP51.ZDB': archiveSha256 } };
    const checked = await validateLegacyPack('texture', [...files].map(([path, bytes]) => ({ path, bytes })), validationContext);
    expect(checked.ok).toBe(true); if (!checked.ok) return;
    const api = createPackRegistry({ ...options(factory), context: validationContext, textures });
    expect(await api.validate(`texture:MP51:${built.id}`)).toMatchObject({ ref: checked.ref, validation: 'validated', applied: false });
    expect(await textures.file('MP51', built.id, 'manifest.json')).toEqual(built.manifestBytes);
    api.dispose();
    const restarted = createPackRegistry({ ...options(factory), context: validationContext,
      textures: new UploadedPacks(idbUploadBackend(() => factory)) });
    expect(await restarted.list()).toEqual([expect.objectContaining({ ref: checked.ref, validation: 'validated', slot: 'per-map' })]);
    restarted.dispose();
  });

  it('retains an old folder capability and refuses to certify it without reading or requesting its files', async () => {
    const factory = new IDBFactory(); vi.stubGlobal('indexedDB', factory);
    const folder = { kind: 'folder', handle: { kind: 'directory', name: 'picked-models' } };
    await oldModels(factory, [['current', folder], ['meta', { bytes: 10 }]]);
    const api = createPackRegistry({ ...options(factory), models: undefined });
    await expect(api.validate('model:current')).rejects.toMatchObject({ code: 'UNSUPPORTED_SURFACE' });
    expect(await api.list()).toEqual([expect.objectContaining({ id: 'model:current', ref: null, validation: 'pending-validation' })]);
    api.dispose();
  });
});
