import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { formatModChoices } from '../src/mods/choices';
import { createLocalPackApi } from '../src/agent/localPacks';
import { idbModLibrary, memoryModLibrary, MODS_DB } from '../src/mods/store';
import { readStoredModelPack, removeStoredModelPack, storeModelPackEntries } from '../src/modelPackRuntime';
import { MODEL_PACK_LIMITS } from '../src/modelPack';
import { idbUploadBackend, memoryUploadBackend, UploadedPacks, UPLOADED_PACKS_DB } from '../src/texturePackStore';
import { PACKS_BYTES, PACKS_DB, PACKS_MIGRATIONS, PACKS_RECOVERY, PACKS_SCOPES } from '../src/packs/storage';
import type { TexturePackIndexEntry } from '../src/texturePack';
import { ENGINE_CONTRACT_VERSIONS, PACK_TARGET_US, sha256Hex, type BufferedPackFile, type PackContext } from '@s2u/creator-contracts';
import { createPackRegistry } from '../src/packs/registry';
import { validateLegacyPack } from '../src/packs/adapters';
import { buildTexturePack } from '../src/texturePackBuild';

const host = vi.hoisted(() => ({ factory: null as IDBFactory | null }));
vi.mock('../src/pageStore', () => ({ pageIndexedDb: () => host.factory,
  pageSettings: { get: () => null, set: () => { throw Error('localStorage hint refused'); }, remove: () => {} },
}));
beforeEach(() => { host.factory = new IDBFactory(); });
afterEach(() => vi.restoreAllMocks());
const utf8 = (text: string) => new TextEncoder().encode(text);
type SeedStore = { name: string; keyPath?: string; rows: [IDBValidKey, unknown][] };
async function seed(name: string, stores: SeedStore[]): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = host.factory!.open(name, 1);
    request.onupgradeneeded = () => { for (const store of stores) request.result.createObjectStore(store.name,
      store.keyPath ? { keyPath: store.keyPath } : undefined); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores.map(store => store.name), 'readwrite');
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    for (const store of stores) for (const [key, value] of store.rows) {
      if (store.keyPath) tx.objectStore(store.name).put(value); else tx.objectStore(store.name).put(value, key);
    }
  }); } finally { db.close(); }
}
async function raw(name: string, store: string, key: string): Promise<unknown> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = host.factory!.open(name);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try {
    if (!db.objectStoreNames.contains(store)) return undefined;
    return await new Promise((resolve, reject) => {
      const request = db.transaction(store).objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
const oldMod = { id: 'old', label: 'Old', files: [{ name: 'old.txt', bytes: utf8('legacy mod bytes') }] };
const choices = { enabled: true, order: ['old'], disabled: ['old'] };
async function seedMods(): Promise<void> {
  await seed(MODS_DB, [{ name: 'packages', keyPath: 'id', rows: [['old', oldMod]] },
    { name: 'choices', rows: [['choices', formatModChoices(choices)]] }]);
}
const textureEntry = (id: string): TexturePackIndexEntry => ({ id, name: id, kind: 'textures', method: 'uploaded',
  scale: 2, roles: 'wide', generatedAt: '2026-10-25T00:00:00.000Z', textures: 1, bytes: 3, notes: '' });
const packContext: PackContext = { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSIONS, packs: [], handlers: [] };
const modelFiles = (): BufferedPackFile[] => [{ path: 'models.json', bytes: utf8(JSON.stringify({
  format: 's2u-model-pack', version: 1, models: [{ id: 'crate', file: 'crate.glb' }],
})) }, { path: 'crate.glb', bytes: new Uint8Array([1, 2, 3]) }];
const registryOptions = () => ({ maps: { get: () => null, set: () => {} }, mods: memoryModLibrary(),
  textures: new UploadedPacks(idbUploadBackend(() => host.factory)) });
async function nativeTexture() {
  const archive = utf8('authored archive'), archiveSha256 = await sha256Hex(archive);
  const context = { ...packContext, archives: { 'RUN/MP51.ZDB': archiveSha256 } };
  const built = await buildTexturePack([{ key: 'fixture', library: 'MP51', record: 'fixture',
    flags: { bilinear: true, transparent: false, graded: false, opaque: true, gs: null },
    levels: [{ width: 1, height: 1, data: new Uint8ClampedArray([1, 2, 3, 255]) }],
  }], { archiveSha256, archiveBytes: archive.length, toolCommit: 'b'.repeat(40), toolSha256: 'c'.repeat(64) });
  const members = new Map([['manifest.json', built.manifestBytes], ...built.payloads]);
  const files = [...members].map(([path, bytes]) => ({ path, bytes }));
  const checked = await validateLegacyPack('texture', files, context);
  if (!checked.ok) throw Error('The native texture fixture must validate through the published contracts.');
  return { built, context, members, files, checked };
}

describe('native pack writers migrate into one browser-local database (product adaptation)', () => {
  it('returns the existing exact texture ref idempotently without advancing storage generation', async () => {
    const fixture = await nativeTexture(), textures = new UploadedPacks(idbUploadBackend(() => host.factory));
    const first = createPackRegistry({ ...registryOptions(), textures, context: fixture.context });
    const installed = await first.install(fixture.checked.ref, fixture.files); first.dispose();
    const before = await raw(PACKS_DB, PACKS_SCOPES, 'textures');
    const reopened = createPackRegistry({ ...registryOptions(), context: fixture.context });
    await expect(reopened.install(fixture.checked.ref, fixture.files)).resolves.toEqual(installed);
    expect(await raw(PACKS_DB, PACKS_SCOPES, 'textures')).toEqual(before);
    expect((await textures.snapshot('MP51', fixture.built.id)).files).toEqual(fixture.members);
    expect(await textures.list('MP51')).toHaveLength(1); reopened.dispose();
  });

  it('atomically replaces a pending native texture key with the submitted checked bytes and identity', async () => {
    const fixture = await nativeTexture(), textures = new UploadedPacks(idbUploadBackend(() => host.factory));
    const [path, payload] = [...fixture.built.payloads][0]!, wrong = payload.slice(); wrong[wrong.length - 1] = wrong[wrong.length - 1]! ^ 1;
    const old = new Map(fixture.members); old.set(path, wrong);
    await textures.add('MP51', 'pack', textureEntry(fixture.built.id), old);
    const api = createPackRegistry({ ...registryOptions(), textures, context: fixture.context });
    const put = IDBObjectStore.prototype.put; let publicationFailures = 0;
    const fault = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.transaction.db.name === PACKS_DB && this.name === PACKS_SCOPES && args[1] === 'textures') {
        publicationFailures++; throw new DOMException('full', 'QuotaExceededError');
      }
      return put.apply(this, args);
    });
    await expect(api.install(fixture.checked.ref, fixture.files)).rejects.toMatchObject({ code: 'STORAGE_FAILED' }); fault.mockRestore();
    expect.soft(publicationFailures).toBe(1);
    expect((await textures.snapshot('MP51', fixture.built.id)).files).toEqual(old);
    expect(await api.list()).toEqual([expect.objectContaining({ ref: null, validation: 'pending-validation' })]);
    await expect(api.install(fixture.checked.ref, fixture.files)).resolves.toMatchObject({ ref: fixture.checked.ref, validation: 'validated', stored: true, applied: false });
    expect((await textures.snapshot('MP51', fixture.built.id)).files).toEqual(fixture.members);
    expect(await textures.list('MP51')).toHaveLength(1); api.dispose();
    const reopened = createPackRegistry({ ...registryOptions(), context: fixture.context });
    expect(await reopened.list()).toEqual([expect.objectContaining({ ref: fixture.checked.ref, validation: 'validated' })]); reopened.dispose();
  });

  it('reports an actual texture generation race as REVISION_CONFLICT and preserves the human replacement', async () => {
    const fixture = await nativeTexture(), textures = new UploadedPacks(idbUploadBackend(() => host.factory));
    const human = new UploadedPacks(idbUploadBackend(() => host.factory)), [path, payload] = [...fixture.built.payloads][0]!;
    const initial = new Map(fixture.members), a = payload.slice(); a[a.length - 1] = a[a.length - 1]! ^ 1; initial.set(path, a);
    const replacement = new Map(fixture.members), b = payload.slice(); b[b.length - 1] = b[b.length - 1]! ^ 2; replacement.set(path, b);
    await textures.add('MP51', 'pack', textureEntry(fixture.built.id), initial);
    let replaced = false;
    const api = createPackRegistry({ ...registryOptions(), textures, context: { ...fixture.context, sha256: async bytes => {
      if (!replaced) { replaced = true; await human.replace('MP51', fixture.built.id, 'pack', textureEntry(fixture.built.id), replacement); }
      return new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer));
    } } });
    await expect(api.install(fixture.checked.ref, fixture.files)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(replaced).toBe(true);
    expect((await human.snapshot('MP51', fixture.built.id)).files).toEqual(replacement);
    expect(await api.list()).toEqual([expect.objectContaining({ ref: null, validation: 'pending-validation' })]); api.dispose();
  });

  it.each(['primary', 'second'] as const)('replaces the native %s model slot with checked bytes and identity in one transaction', async slot => {
    const other = slot === 'primary' ? 'second' : 'primary', untouched = [{ path: 'other.glb', bytes: utf8('other slot bytes') }];
    await storeModelPackEntries(untouched, other);
    const first = modelFiles(), replacement = modelFiles().map((file, index) => (index === 1 ? { ...file, bytes: new Uint8Array([9, 8, 7]) } : file));
    const a = await validateLegacyPack('model', first, packContext, { slot }), b = await validateLegacyPack('model', replacement, packContext, { slot });
    if (!a.ok || !b.ok) throw Error('Both native model fixtures must validate.');
    const api = createPackRegistry(registryOptions()); await api.install(a.ref, first);
    const before = await readStoredModelPack(slot), put = IDBObjectStore.prototype.put;
    const fault = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.transaction.db.name === PACKS_DB && this.name === PACKS_SCOPES && args[1] === 'models') throw new DOMException('full', 'QuotaExceededError');
      return put.apply(this, args);
    });
    await expect(api.install(b.ref, replacement)).rejects.toMatchObject({ code: 'STORAGE_FAILED' }); fault.mockRestore();
    expect(await readStoredModelPack(slot)).toEqual(before);
    expect(await api.list()).toEqual(expect.arrayContaining([expect.objectContaining({ ref: a.ref, validation: 'validated' })]));
    expect(await api.install(b.ref, replacement)).toMatchObject({ ref: b.ref, validation: 'validated', stored: true });
    expect(await readStoredModelPack(slot)).toEqual({ kind: 'files', entries: replacement.map(file => ({ path: file.path, bytes: file.bytes.buffer })) });
    expect(await readStoredModelPack(other)).toEqual({ kind: 'files', entries: untouched.map(file => ({ path: file.path, bytes: file.bytes.buffer })) });
    await expect(api.remove(a.ref)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' }); api.dispose();
  });

  it.each(['quota', 'expired lease'] as const)('reads intact legacy model slots after first migration fails from %s without publishing an identity', async failure => {
    const primary = utf8('intact primary legacy bytes'), second = utf8('intact second legacy bytes');
    const header = { kind: 'files', files: [{ path: 'primary.glb', bytes: primary.length }], chunks: 2 };
    const secondHeader = { kind: 'files', entries: [{ path: 'second.glb', bytes: second.buffer }] };
    await seed('s2u.modelPack', [{ name: 'pack', rows: [['current', header], ['meta', { bytes: primary.length }],
      ['c:0', primary.slice(0, 5).buffer], ['c:1', primary.slice(5).buffer], ['second', secondHeader], ['meta2', { bytes: second.length }]] }]);
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.transaction.db.name === PACKS_DB) {
        if (failure === 'quota' && this.name === PACKS_RECOVERY && args[1] === 'models') throw new DOMException('full', 'QuotaExceededError');
        if (failure === 'expired lease' && this.name === PACKS_MIGRATIONS) {
          const job = args[0] as { kind?: string; leaseUntil?: number };
          if (job.kind === 'models') return put.call(this, { ...job, leaseUntil: Date.now() - 1 }, args[1]);
        }
      }
      return put.apply(this, args);
    });
    expect.soft(await readStoredModelPack()).toEqual({ kind: 'files', entries: [{ path: 'primary.glb', bytes: primary.buffer }] });
    expect.soft(await readStoredModelPack('second')).toEqual(secondHeader);
    expect(await raw(PACKS_DB, PACKS_SCOPES, 'models')).toBeUndefined();
    expect(await raw(PACKS_DB, PACKS_RECOVERY, 'models')).toBeUndefined();
    const api = createPackRegistry({ ...registryOptions(), textures: new UploadedPacks(memoryUploadBackend()) });
    await expect(api.validate('model:current')).rejects.toMatchObject({ code: expect.stringMatching(/^(STORAGE_FAILED|UNSUPPORTED_SURFACE|REVISION_CONFLICT)$/) });
    expect(await raw(PACKS_DB, PACKS_SCOPES, 'models')).toBeUndefined(); api.dispose();
    expect(await raw('s2u.modelPack', 'pack', 'current')).toEqual(header);
    expect(await raw('s2u.modelPack', 'pack', 'c:0')).toEqual(primary.slice(0, 5).buffer);
    expect(await raw('s2u.modelPack', 'pack', 'c:1')).toEqual(primary.slice(5).buffer);
    expect(await raw('s2u.modelPack', 'pack', 'second')).toEqual(secondHeader);
  });

  it.each([
    { name: 'oversized first chunk', declared: 1, chunks: [[1, 2], [3, 4], [5, 6]], reads: ['c:0'] },
    { name: 'surplus final bytes', declared: 3, chunks: [[1, 2], [3, 4]], reads: ['c:0', 'c:1'] },
    { name: 'truncated final bytes', declared: 3, chunks: [[1], [2]], reads: ['c:0', 'c:1'] },
    { name: 'declared total above existing global limit', declared: MODEL_PACK_LIMITS.packBytes + 1, chunks: [[1]], reads: [] },
  ])('refuses readonly legacy fallback with $name and stops reading once its bound is exceeded', async fixture => {
    const header = { kind: 'files', files: [{ path: 'bad.glb', bytes: fixture.declared }], chunks: fixture.chunks.length };
    const chunks = fixture.chunks.map((values, index): [IDBValidKey, unknown] => [`c:${index}`, new Uint8Array(values).buffer]);
    await seed('s2u.modelPack', [{ name: 'pack', rows: [['current', header], ['meta', { bytes: fixture.declared }], ...chunks] }]);
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.transaction.db.name === PACKS_DB && this.name === PACKS_RECOVERY && args[1] === 'models') throw new DOMException('full', 'QuotaExceededError');
      return put.apply(this, args);
    });
    const get = IDBObjectStore.prototype.get, fallbackReads: string[] = [];
    const observed = vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, ...args) {
      // Migration uses its existing cursors. These get requests are the real readonly legacy fallback only.
      if (this.transaction.db.name === 's2u.modelPack' && this.name === 'pack' && typeof args[0] === 'string' && /^c:/.test(args[0]))
        fallbackReads.push(args[0]);
      return get.apply(this, args);
    });
    expect.soft(await readStoredModelPack()).toBeNull();
    expect.soft(fallbackReads).toEqual(fixture.reads); observed.mockRestore();
    expect(await raw(PACKS_DB, PACKS_SCOPES, 'models')).toBeUndefined();
    expect(await raw(PACKS_DB, PACKS_RECOVERY, 'models')).toBeUndefined();
    expect(await raw('s2u.modelPack', 'pack', 'current')).toEqual(header);
    for (const [key, bytes] of chunks) expect(await raw('s2u.modelPack', 'pack', String(key))).toEqual(bytes);
  });

  it('persists a validated second model identity, keeps primary bytes, and removes the exact second ref after restart', async () => {
    const primary = [{ path: 'primary.glb', bytes: utf8('preserved primary') }];
    await storeModelPackEntries(primary);
    const files = modelFiles(), checked = await validateLegacyPack('model', files, packContext, { slot: 'second' });
    expect(checked.ok).toBe(true); if (!checked.ok) return;
    const first = createPackRegistry(registryOptions());
    expect(await first.install(checked.ref, files)).toMatchObject({ id: 'model:second', ref: checked.ref, stored: true, applied: false });
    first.dispose();
    const reopened = createPackRegistry(registryOptions());
    expect(await reopened.list()).toEqual(expect.arrayContaining([expect.objectContaining({
      id: 'model:second', ref: checked.ref, validation: 'validated', slot: 'second',
    })]));
    expect(await reopened.remove(checked.ref)).toMatchObject({ removed: true, stored: false });
    expect(await readStoredModelPack('second')).toBeNull();
    expect(await readStoredModelPack()).toEqual({ kind: 'files', entries: primary.map(file => ({ path: file.path, bytes: file.bytes.buffer })) });
    reopened.dispose();
  });

  it('keeps two validated same-map texture refs separately and removes only the exact selected payload', async () => {
    const archive = utf8('authored archive'), archiveSha256 = await sha256Hex(archive);
    const context = { ...packContext, archives: { 'RUN/MP51.ZDB': archiveSha256 } };
    const build = async (red: number) => {
      const built = await buildTexturePack([{ key: 'fixture', library: 'MP51', record: 'fixture',
        flags: { bilinear: true, transparent: false, graded: false, opaque: true, gs: null },
        levels: [{ width: 1, height: 1, data: new Uint8ClampedArray([red, 2, 3, 255]) }],
      }], { archiveSha256, archiveBytes: archive.length, toolCommit: 'b'.repeat(40), toolSha256: 'c'.repeat(64) });
      const files = [{ path: 'manifest.json', bytes: built.manifestBytes }, ...[...built.payloads].map(([path, bytes]) => ({ path, bytes }))];
      const checked = await validateLegacyPack('texture', files, context);
      if (!checked.ok) throw Error('The bounded authored texture fixture must validate.');
      return { built, files, checked };
    };
    const a = await build(1), b = await build(9), config = { ...registryOptions(), context };
    const first = createPackRegistry(config);
    await first.install(a.checked.ref, a.files); await first.install(b.checked.ref, b.files); first.dispose();
    const reopened = createPackRegistry({ ...registryOptions(), context });
    expect(await reopened.list()).toEqual(expect.arrayContaining([expect.objectContaining({ ref: a.checked.ref }),
      expect.objectContaining({ ref: b.checked.ref })]));
    expect(await reopened.remove(a.checked.ref)).toMatchObject({ removed: true });
    expect(await config.textures.file('MP51', a.built.id, 'manifest.json')).toBeNull();
    expect(await config.textures.file('MP51', b.built.id, 'manifest.json')).toEqual(b.built.manifestBytes);
    expect(await reopened.list()).toEqual([expect.objectContaining({ ref: b.checked.ref, validation: 'validated' })]);
    reopened.dispose();
  });

  it('lists unvalidated native model slots as pending without reading their saved binary records', async () => {
    await storeModelPackEntries(modelFiles()); await storeModelPackEntries(modelFiles(), 'second');
    const api = createPackRegistry(registryOptions()), get = IDBObjectStore.prototype.get, reads: unknown[] = [];
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.transaction.db.name === PACKS_DB && this.name === PACKS_BYTES) reads.push(args[0]);
      return get.apply(this, args);
    });
    expect(await api.list()).toEqual([expect.objectContaining({ id: 'model:current', ref: null, validation: 'pending-validation' }),
      expect.objectContaining({ id: 'model:second', ref: null, validation: 'pending-validation' })]);
    expect(reads).toEqual([]); api.dispose();
  });

  it('never certifies different existing texture bytes with the identity of a submitted valid pack', async () => {
    const archive = utf8('authored archive'), archiveSha256 = await sha256Hex(archive);
    const context = { ...packContext, archives: { 'RUN/MP51.ZDB': archiveSha256 } };
    const built = await buildTexturePack([{ key: 'fixture', library: 'MP51', record: 'fixture',
      flags: { bilinear: true, transparent: false, graded: false, opaque: true, gs: null },
      levels: [{ width: 1, height: 1, data: new Uint8ClampedArray([1, 2, 3, 255]) }],
    }], { archiveSha256, archiveBytes: archive.length, toolCommit: 'b'.repeat(40), toolSha256: 'c'.repeat(64) });
    const submitted = new Map([['manifest.json', built.manifestBytes], ...built.payloads]);
    const files = [...submitted].map(([path, bytes]) => ({ path, bytes }));
    const checked = await validateLegacyPack('texture', files, context);
    if (!checked.ok) throw Error('The submitted authored texture fixture must validate.');
    const [payloadPath, payload] = [...built.payloads][0]!;
    const incorrect = payload.slice(); incorrect[incorrect.length - 1] = incorrect[incorrect.length - 1]! ^ 1;
    const original = new Map(submitted); original.set(payloadPath, incorrect);
    const textures = new UploadedPacks(idbUploadBackend(() => host.factory));
    const entry = textureEntry(built.id);
    expect(await textures.add('MP51', 'pack', entry, original)).toBe('added');
    const nativeRecord = (await textures.list('MP51'))[0]!;
    // The legacy duplicate-add contract keeps the first payload, even when the submitted bytes differ.
    expect(await textures.add('MP51', 'pack', entry, submitted)).toBe('exists');
    expect((await textures.snapshot('MP51', built.id)).files).toEqual(original);
    const first = createPackRegistry({ ...registryOptions(), textures, context });
    expect(await first.list()).toEqual([expect.objectContaining({ ref: null, validation: 'pending-validation' })]);
    const [outcome] = await Promise.allSettled([first.install(checked.ref, files)]); first.dispose();
    const reopenedTextures = new UploadedPacks(idbUploadBackend(() => host.factory));
    const reopened = createPackRegistry({ ...registryOptions(), textures: reopenedTextures, context });
    const saved = await reopenedTextures.snapshot('MP51', built.id);
    // Either refusal or a checked replacement is truthful; certifying the unchanged incorrect payload is not.
    if (outcome!.status === 'fulfilled') {
      expect.soft(outcome!.value).toMatchObject({ stored: true, ref: checked.ref, validation: 'validated' });
      expect.soft(saved.files).toEqual(submitted);
      expect.soft(await reopened.list()).toEqual([expect.objectContaining({ ref: checked.ref, validation: 'validated' })]);
    } else {
      expect.soft(saved.files).toEqual(original);
      expect.soft(saved.record).toEqual(nativeRecord);
      expect.soft(await reopened.list()).toEqual([expect.objectContaining({ ref: null, validation: 'pending-validation' })]);
    }
    reopened.dispose();
  });

  it('keeps a committed mod visible to a fresh registry when the native boot hint cannot be written', async () => {
    const library = idbModLibrary(() => host.factory);
    await library.writeChoices({ enabled: true, order: [], disabled: [] });
    const config = { maps: { get: () => null, set: () => {} },
      models: { read: async () => null, put: async () => {}, remove: async () => {} },
      textures: new UploadedPacks(memoryUploadBackend()) };
    const manifest = JSON.stringify({ format: 's2u-mod', formatVersion: 1, id: 'hint', name: 'Hint', version: '1',
      author: 'Fixture', description: '', target: 'socom2-us-r0001', files: [{ path: 'NOTES/HINT.TXT', file: 'note.txt' }] });
    const api = createLocalPackApi(config);
    const [staged] = await api.stage([{ name: 'mod.json', size: utf8(manifest).length, arrayBuffer: async () => utf8(manifest).buffer },
      { name: 'note.txt', size: 3, arrayBuffer: async () => utf8('new').buffer }]);
    const result = await api.import({ kind: 'mod', stagedId: staged!.id });
    expect.soft(result).toMatchObject({ stored: true, enabled: false, applied: false,
      diagnostics: expect.arrayContaining([{ code: 'MODS_RESTART_HINT_UNAVAILABLE', count: 1 }]) });
    api.dispose();
    const fresh = createLocalPackApi(config);
    expect.soft(await fresh.list()).toEqual([expect.objectContaining({ id: 'mod:hint', stored: true, enabled: false })]);
    expect((await library.read()).choices).toEqual({ enabled: true, order: ['hint'], disabled: ['hint'] });
    fresh.dispose();
  });

  it.each(['memory', 'IndexedDB'] as const)('preserves a newly imported disabled mod when an older %s choices view saves', async backend => {
    const first = backend === 'memory' ? memoryModLibrary() : idbModLibrary(() => host.factory);
    const second = backend === 'memory' ? first : idbModLibrary(() => host.factory);
    await first.put(oldMod);
    await first.writeChoices({ enabled: true, order: ['old'], disabled: [] });
    const oldView = (await first.read()).choices;
    await second.put({ id: 'new', label: 'New', files: [{ name: 'new.txt', bytes: utf8('new bytes') }] });
    await first.writeChoices(oldView);
    expect((await second.read()).choices).toEqual({ enabled: true, order: ['old', 'new'], disabled: ['new'] });
  });

  it('retains legacy mod bytes, master, order and disabled state while native writes use the common scope', async () => {
    await seedMods();
    const library = idbModLibrary(() => host.factory);
    expect(await library.read()).toMatchObject({ choices, packages: [oldMod] });
    await library.put({ id: 'new', label: 'New', files: [{ name: 'new.txt', bytes: utf8('new native bytes') }] });
    const saved = await idbModLibrary(() => host.factory).read();
    expect(saved.choices).toEqual({ enabled: true, order: ['old', 'new'], disabled: ['old', 'new'] });
    expect(saved.packages.map(pack => pack.id)).toEqual(['old', 'new']);
    expect(await raw(PACKS_DB, PACKS_SCOPES, 'mods')).toMatchObject({ generation: 1 });
    expect(await raw(PACKS_DB, PACKS_RECOVERY, 'mods')).toBeDefined();
    expect(await raw(MODS_DB, 'packages', 'old')).toEqual(oldMod);
    expect(await raw(MODS_DB, 'packages', 'new')).toBeUndefined();
    expect(await raw(MODS_DB, 'choices', 'choices')).toBe(formatModChoices(choices));
  });

  it('does not publish a migration or lose the legacy source when recovery storage is full', async () => {
    await seedMods();
    const put = IDBObjectStore.prototype.put;
    const fault = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.transaction.db.name === PACKS_DB && this.name === PACKS_RECOVERY) throw new DOMException('full', 'QuotaExceededError');
      return put.apply(this, args);
    });
    await expect(idbModLibrary(() => host.factory).read()).rejects.toMatchObject({ kind: 'quota' });
    expect(await raw(PACKS_DB, PACKS_SCOPES, 'mods')).toBeUndefined();
    expect(await raw(MODS_DB, 'packages', 'old')).toEqual(oldMod);
    fault.mockRestore();
    expect(await idbModLibrary(() => host.factory).read()).toMatchObject({ choices, packages: [oldMod] });
  });

  it('reassembles old model chunks and preserves the second slot when the primary is replaced or removed', async () => {
    const primary = utf8('primary old bytes'), second = utf8('second old bytes');
    const primaryHeader = { kind: 'files', files: [{ path: 'primary.glb', bytes: primary.length }], chunks: 2 };
    const secondHeader = { kind: 'files', entries: [{ path: 'second.glb', bytes: second.buffer }] };
    await seed('s2u.modelPack', [{ name: 'pack', rows: [
      ['current', primaryHeader], ['meta', { bytes: primary.length }], ['c:0', primary.slice(0, 4).buffer],
      ['c:1', primary.slice(4).buffer], ['second', secondHeader], ['meta2', { bytes: second.length }],
    ] }]);
    expect(await readStoredModelPack()).toEqual({ kind: 'files', entries: [{ path: 'primary.glb', bytes: primary.buffer }] });
    expect(await readStoredModelPack('second')).toEqual(secondHeader);
    await storeModelPackEntries([{ path: 'replacement.glb', bytes: utf8('replacement') }]);
    await removeStoredModelPack();
    expect(await readStoredModelPack()).toBeNull();
    expect(await readStoredModelPack('second')).toEqual(secondHeader);
    expect(await raw(PACKS_DB, PACKS_SCOPES, 'models')).toMatchObject({ generation: 2 });
    expect(await raw(PACKS_DB, PACKS_RECOVERY, 'models')).toBeDefined();
    expect(await raw('s2u.modelPack', 'pack', 'current')).toEqual(primaryHeader);
    expect(await raw('s2u.modelPack', 'pack', 'second')).toEqual(secondHeader);
    expect(await raw('s2u.modelPack', 'pack', 'c:1')).toEqual(primary.slice(4).buffer);
  });

  it('keeps old folder-handle records as recovery and readable after migration', async () => {
    // No permission request or file read is needed to migrate the opaque structured-cloneable handle.
    const folder = { kind: 'folder', handle: { kind: 'directory', name: 'picked-models' } };
    await seed('s2u.modelPack', [{ name: 'pack', rows: [['current', folder], ['meta', { bytes: 8 }]] }]);
    expect(await readStoredModelPack()).toEqual(folder);
    expect(await raw(PACKS_DB, PACKS_RECOVERY, 'models')).toBeDefined();
    expect(await raw('s2u.modelPack', 'pack', 'current')).toEqual(folder);
  });

  it('migrates legacy model records without aggregating both slots through getAll', async () => {
    const header = { kind: 'files', files: [{ path: 'fixture.glb', bytes: 3 }], chunks: 1 };
    await seed('s2u.modelPack', [{ name: 'pack', rows: [
      ['current', header], ['meta', { bytes: 3 }], ['c:0', new Uint8Array([1, 2, 3]).buffer],
      ['second', header], ['meta2', { bytes: 3 }], ['s:0', new Uint8Array([4, 5, 6]).buffer],
    ] }]);
    const getAll = IDBObjectStore.prototype.getAll;
    vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.transaction.db.name === 's2u.modelPack') throw Error('legacy model getAll aggregates both slots');
      return getAll.apply(this, args);
    });
    expect(await readStoredModelPack()).toEqual({ kind: 'files', entries: [{ path: 'fixture.glb', bytes: new Uint8Array([1, 2, 3]).buffer }] });
    expect(await readStoredModelPack('second')).toEqual({ kind: 'files', entries: [{ path: 'fixture.glb', bytes: new Uint8Array([4, 5, 6]).buffer }] });
  });

  it('migrates legacy texture files without aggregating every uploaded payload through getAll', async () => {
    const first = { key: 'MP51/first', map: 'MP51', id: 'first', state: 'pack', entry: textureEntry('first'),
      bytes: 3, files: ['first.png'], added: 1 };
    const second = { key: 'MP52/second', map: 'MP52', id: 'second', state: 'pack', entry: textureEntry('second'),
      bytes: 3, files: ['second.png'], added: 2 };
    await seed(UPLOADED_PACKS_DB, [
      { name: 'records', keyPath: 'key', rows: [[first.key, first], [second.key, second]] },
      { name: 'files', rows: [[`${first.key}/first.png`, new Uint8Array([1, 2, 3])],
        [`${second.key}/second.png`, new Uint8Array([4, 5, 6])]] },
    ]);
    const getAll = IDBObjectStore.prototype.getAll;
    vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.transaction.db.name === UPLOADED_PACKS_DB && this.name === 'files') throw Error('legacy texture getAll aggregates every payload');
      return getAll.apply(this, args);
    });
    const packs = new UploadedPacks(idbUploadBackend(() => host.factory));
    expect(await packs.listAll()).toEqual([first, second]);
    expect(await packs.file('MP51', 'first', 'first.png')).toEqual(new Uint8Array([1, 2, 3]));
    expect(await packs.file('MP52', 'second', 'second.png')).toEqual(new Uint8Array([4, 5, 6]));
  });

  it('migrates texture records and files per map and leaves the old source untouched after a native removal', async () => {
    const record = { key: 'MP51/old', map: 'MP51', id: 'old', state: 'pack', entry: textureEntry('old'),
      bytes: 3, files: ['manifest.json'], added: 1 };
    await seed(UPLOADED_PACKS_DB, [{ name: 'records', keyPath: 'key', rows: [[record.key, record]] },
      { name: 'files', rows: [['MP51/old/manifest.json', utf8('old')]] }]);
    const store = new UploadedPacks(idbUploadBackend(() => host.factory));
    expect(await store.file('MP51', 'old', 'manifest.json')).toEqual(utf8('old'));
    await store.add('MP2', 'pack', textureEntry('new'), new Map([['manifest.json', utf8('new')]]));
    await store.remove('MP51', 'old');
    const reopened = new UploadedPacks(idbUploadBackend(() => host.factory));
    expect(await reopened.list('MP51')).toEqual([]);
    expect(await reopened.file('MP2', 'new', 'manifest.json')).toEqual(utf8('new'));
    expect(await raw(PACKS_DB, PACKS_SCOPES, 'textures')).toMatchObject({ generation: 2 });
    expect(await raw(PACKS_DB, PACKS_RECOVERY, 'textures')).toBeDefined();
    expect(await raw(UPLOADED_PACKS_DB, 'files', 'MP51/old/manifest.json')).toEqual(utf8('old'));
  });

  it('reads one requested texture file without fetching unrelated uploaded payloads', async () => {
    const backend = idbUploadBackend(() => host.factory), store = new UploadedPacks(backend);
    await store.add('MP51', 'pack', textureEntry('first'), new Map([['first.png', new Uint8Array([1, 2, 3])]]));
    await store.add('MP52', 'pack', textureEntry('second'), new Map([['second.png', new Uint8Array([4, 5, 6])]]));
    const get = IDBObjectStore.prototype.get, reads: unknown[] = [];
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.transaction.db.name === PACKS_DB && this.name === PACKS_BYTES) reads.push(args[0]);
      return get.apply(this, args);
    });
    expect(await store.file('MP51', 'first', 'first.png')).toEqual(new Uint8Array([1, 2, 3]));
    expect(reads).toHaveLength(1);
  });

  it('enforces texture per-map capacity inside the commit shared by two independent native writers', async () => {
    const a = new UploadedPacks(idbUploadBackend(() => host.factory), { bytes: 100, perMap: 1 });
    const b = new UploadedPacks(idbUploadBackend(() => host.factory), { bytes: 100, perMap: 1 });
    const results = await Promise.allSettled([
      a.add('MP51', 'pack', textureEntry('first'), new Map([['manifest.json', utf8('one')]])),
      b.add('MP51', 'pack', textureEntry('second'), new Map([['manifest.json', utf8('two')]])),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(await a.list('MP51')).toHaveLength(1);
    expect(await a.usage()).toEqual({ bytes: 3, records: 1 });
  });
});
