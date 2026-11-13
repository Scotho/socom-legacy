import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { CHECK_REPORT_SCHEMA, CHECK_REPORT_VERSION, DIAGNOSTIC_SCHEMA, DIAGNOSTIC_VERSION,
  ENGINE_CONTRACT_VERSIONS, PACK_TARGET_US, sha256Hex, validatePack, type BufferedPackFile, type PackContext, type PackRef } from '@s2u/creator-contracts';
import { createPackRegistry, type PackRegistryOptions } from '../src/packs/registry';
import { idbPackDatabase, PACKS_DB, PACKS_SCOPES } from '../src/packs/storage';
import { idbModLibrary, memoryModLibrary } from '../src/mods/store';
import { memoryUploadBackend, UploadedPacks } from '../src/texturePackStore';
import { validateLegacyPack } from '../src/packs/adapters';

// Published build constants; no inferred engine version or application-provided handler claims.
const context: PackContext = { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSIONS, packs: [], archives: {}, handlers: [] };
const bytes = (text: string) => new TextEncoder().encode(text);
const legacyMod = (): BufferedPackFile[] => [{ path: 'mod.json', bytes: bytes(JSON.stringify({
  format: 's2u-mod', formatVersion: 1, id: 'native', name: 'Native', version: '1', author: 'Fixture', description: '',
  target: 'socom2-us-r0001', files: [{ path: 'NOTES/NATIVE.TXT', file: 'native.txt' }],
})) }, { path: 'native.txt', bytes: bytes('authored native bytes') }];
async function fixture(text = 'owned authored data', version = '1.0.0'): Promise<{ files: BufferedPackFile[]; ref: PackRef }> {
  const member = bytes(text), manifest = {
    format: 's2u-pack', formatVersion: 2, id: 'fixture.content', version, name: 'Fixture',
    target: context.target, contract: '*', kinds: ['content'], sides: 'client', dependencies: [],
    files: [{ path: 'data.txt', sha256: await sha256Hex(member), size: member.length, role: 'data' }],
    intents: [{ kind: 'cosmetic', files: ['data.txt'] }],
  };
  const files = [{ path: 's2u-pack.json', bytes: bytes(JSON.stringify(manifest)) }, { path: 'data.txt', bytes: member }];
  const checked = await validatePack(files, context);
  if (!checked.ok) throw Error('The authored fixture must validate through the published contracts.');
  return { files, ref: checked.ref };
}
function options(factory: IDBFactory): PackRegistryOptions {
  const saves = new Map<string, string>();
  return { context, database: idbPackDatabase(() => factory), mods: memoryModLibrary(),
    maps: { get: key => saves.get(key) ?? null, set: (key, value) => { saves.set(key, value); } },
    models: { read: async () => null, put: async () => {}, remove: async () => {} },
    textures: new UploadedPacks(memoryUploadBackend()),
  };
}
afterEach(() => vi.restoreAllMocks());

describe('framework pack registry (product adaptation)', () => {
  it('installs a native mod into the existing ordered library and removes its canonical ref after restart', async () => {
    const factory = new IDBFactory(), library = idbModLibrary(() => factory), config = { ...options(factory), mods: library };
    await library.writeChoices({ enabled: true, order: [], disabled: [] });
    const files = legacyMod(), checked = await validateLegacyPack('mod', files, context);
    expect(checked.ok).toBe(true); if (!checked.ok) return;
    const first = createPackRegistry(config);
    expect(await first.install(checked.ref, files)).toMatchObject({ id: 'mod:native', ref: checked.ref,
      validation: 'validated', stored: true, enabled: false, applied: false });
    expect((await library.read()).choices).toEqual({ enabled: true, order: ['native'], disabled: ['native'] });
    first.dispose();
    const reopened = createPackRegistry({ ...options(factory), mods: idbModLibrary(() => factory) });
    expect(await reopened.list()).toEqual([expect.objectContaining({ id: 'mod:native', ref: checked.ref })]);
    expect(await reopened.remove(checked.ref)).toMatchObject({ removed: true, stored: false });
    expect((await library.read()).packages).toEqual([]); reopened.dispose();
  });

  it('resolves a v2 dependency against a validated native mod in the same registry', async () => {
    const factory = new IDBFactory(), config = { ...options(factory), mods: idbModLibrary(() => factory) };
    const api = createPackRegistry(config), native = legacyMod();
    const [staged] = await api.stage(native.map(file => ({ name: file.path, size: file.bytes.length,
      arrayBuffer: async () => file.bytes.slice().buffer })));
    const imported = await api.import({ kind: 'mod', stagedId: staged!.id });
    expect(imported.ref).toBeTruthy();
    if (!imported.ref) throw Error('The native fixture must have a validated ref.');
    const pack = await fixture(), manifestFile = pack.files.find(file => file.path === 's2u-pack.json')!;
    const manifest = JSON.parse(new TextDecoder().decode(manifestFile.bytes));
    manifest.dependencies = [{ id: imported.ref.id, range: '*' }];
    pack.files[pack.files.indexOf(manifestFile)] = { path: manifestFile.path, bytes: bytes(JSON.stringify(manifest)) };
    const checked = await validatePack(pack.files, { ...context, packs: [{ ref: imported.ref }] });
    expect(checked.ok).toBe(true); if (!checked.ok) return;
    expect(await api.install(checked.ref, pack.files)).toMatchObject({ stored: true, ref: checked.ref });
    api.dispose();
  });

  it('fences a native dependency replacement in the same transaction that would publish a v2 install', async () => {
    const factory = new IDBFactory(), library = idbModLibrary(() => factory), human = idbModLibrary(() => factory);
    const native = legacyMod(), setup = createPackRegistry({ ...options(factory), mods: library });
    const [staged] = await setup.stage(native.map(file => ({ name: file.path, size: file.bytes.length,
      arrayBuffer: async () => file.bytes.slice().buffer })));
    const imported = await setup.import({ kind: 'mod', stagedId: staged!.id }); setup.dispose();
    if (!imported.ref) throw Error('The native dependency fixture must have a validated ref.');
    const dependency = imported.ref, pack = await fixture(), manifestFile = pack.files.find(file => file.path === 's2u-pack.json')!;
    const manifest = JSON.parse(new TextDecoder().decode(manifestFile.bytes));
    manifest.dependencies = [{ id: dependency.id, range: '*' }];
    pack.files[pack.files.indexOf(manifestFile)] = { path: manifestFile.path, bytes: bytes(JSON.stringify(manifest)) };
    const snapshotContext = { ...context, packs: [{ ref: dependency }] };
    const checked = await validatePack(pack.files, snapshotContext); expect(checked.ok).toBe(true); if (!checked.ok) return;
    let replaced = false;
    const api = createPackRegistry({ ...options(factory), mods: library, context: { ...snapshotContext, sha256: async value => {
      if (!replaced) {
        replaced = true; await human.put({ id: 'native', label: 'Human replacement',
          files: [{ name: 'human.txt', bytes: bytes('human replacement during validation') }] });
      }
      return new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(value).buffer));
    } } });
    await expect(api.install(checked.ref, pack.files)).rejects.toMatchObject({ code: 'REVISION_CONFLICT', report: {
      status: 'incomplete', diagnostics: expect.arrayContaining([expect.objectContaining({
        code: 'registry.DEPENDENCY_CHANGED', id: dependency.id, status: 'incomplete',
      })]),
    } });
    expect((await human.read()).packages[0]?.label).toBe('Human replacement');
    expect(await api.list()).toEqual([expect.objectContaining({ id: 'mod:native', ref: null })]); api.dispose();
  });
  it('installs, lists, restarts and removes exact validated refs without enabling or applying', async () => {
    const factory = new IDBFactory(), config = options(factory), pack = await fixture(), apply = vi.fn();
    const first = createPackRegistry({ ...config, applyMod: apply, applyModel: apply, applyTexture: apply });
    const result = await first.install(pack.ref, pack.files);
    expect(result).toMatchObject({ ref: pack.ref, stored: true, enabled: false, applied: false, packKinds: ['content'] });
    expect(apply).not.toHaveBeenCalled();
    first.dispose();
    const restarted = createPackRegistry(options(factory));
    expect(await restarted.list()).toEqual([expect.objectContaining({ ref: pack.ref, stored: true, enabled: false, applied: false })]);
    expect(await restarted.remove(pack.ref)).toMatchObject({ ref: pack.ref, removed: true, stored: false });
    expect(await restarted.list()).toEqual([]);
    restarted.dispose();
  });

  it('treats exact installation as idempotent and refuses a different hash for the same id/version', async () => {
    const factory = new IDBFactory(), a = createPackRegistry(options(factory)), b = createPackRegistry(options(factory));
    const first = await fixture(), replacement = await fixture('different authored bytes');
    await a.install(first.ref, first.files);
    await b.install(first.ref, first.files);
    expect(await a.list()).toHaveLength(1);
    await expect(b.install(replacement.ref, replacement.files)).rejects.toMatchObject({ code: 'REVISION_CONFLICT', report: {
      schema: CHECK_REPORT_SCHEMA, version: CHECK_REPORT_VERSION, evidence: 'validation', status: 'fail',
      diagnostics: expect.arrayContaining([expect.objectContaining({ schema: DIAGNOSTIC_SCHEMA, version: DIAGNOSTIC_VERSION,
        source: 'pack', severity: 'error', code: 'registry.REVISION_CONFLICT', id: first.ref.id,
        text: expect.stringMatching(/remove fixture\.content@1\.0\.0 first/i),
      })]),
    } });
    expect(await a.list()).toEqual([expect.objectContaining({ ref: first.ref })]);
    await expect(b.remove(replacement.ref)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(await a.list()).toHaveLength(1);
    a.dispose(); b.dispose();
  });

  it('replaces a native mod slot with checked bytes and identity while preserving master, order and other packages', async () => {
    const factory = new IDBFactory(), library = idbModLibrary(() => factory), config = { ...options(factory), mods: library };
    const api = createPackRegistry(config), first = legacyMod();
    const replacement = legacyMod().map(file => (file.path === 'native.txt' ? { ...file, bytes: bytes('checked replacement native bytes') } : file));
    const a = await validateLegacyPack('mod', first, context), b = await validateLegacyPack('mod', replacement, context);
    if (!a.ok || !b.ok) throw Error('Both native slot fixtures must validate.');
    await library.put({ id: 'unrelated', label: 'Unrelated', files: [{ name: 'untouched.txt', bytes: bytes('unrelated bytes') }] });
    await api.install(a.ref, first);
    await library.writeChoices({ enabled: true, order: ['native', 'unrelated'], disabled: ['native'] });
    const before = await library.read();
    expect(await api.install(b.ref, replacement)).toMatchObject({ ref: b.ref, stored: true, validation: 'validated', enabled: false, applied: false });
    expect((await library.read()).choices).toEqual(before.choices);
    expect((await library.read()).packages.find(pack => pack.id === 'unrelated')).toEqual(before.packages.find(pack => pack.id === 'unrelated'));
    expect((await library.read()).packages.find(pack => pack.id === 'native')?.files)
      .toEqual(replacement.map(file => ({ name: file.path, bytes: file.bytes })));
    api.dispose(); const reopened = createPackRegistry({ ...options(factory), mods: idbModLibrary(() => factory) });
    expect(await reopened.list()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'mod:native', ref: b.ref, validation: 'validated' })]));
    await expect(reopened.remove(a.ref)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' }); reopened.dispose();
  });

  it('revalidates supplied bytes and reports the published diagnostic without storing invalid data', async () => {
    const factory = new IDBFactory(), api = createPackRegistry(options(factory)), pack = await fixture();
    pack.files.find(file => file.path === 'data.txt')!.bytes.fill(0);
    await expect(api.install(pack.ref, pack.files)).rejects.toMatchObject({ code: 'INVALID_PACKAGE', report: {
      status: 'fail', diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'pack.MEMBER_HASH_MISMATCH' })]),
    } });
    expect(await api.list()).toEqual([]);
    api.dispose();
  });

  it('rejects a caller ref that does not identify the validated manifest', async () => {
    const factory = new IDBFactory(), api = createPackRegistry(options(factory)), pack = await fixture();
    await expect(api.install({ ...pack.ref, hash: '0'.repeat(64) }, pack.files)).rejects.toMatchObject({ code: 'INVALID_PACKAGE' });
    expect(await api.list()).toEqual([]);
    api.dispose();
  });

  it('keeps a failed install absent and allows retry after transaction quota failure', async () => {
    const factory = new IDBFactory(), api = createPackRegistry(options(factory)), pack = await fixture();
    // Establish migration before targeting only the installation write.
    await options(factory).database!.read('packs', async () => ({ records: [] }));
    const put = IDBObjectStore.prototype.put;
    const fault = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.transaction.db.name === PACKS_DB && this.name === PACKS_SCOPES) throw new DOMException('full', 'QuotaExceededError');
      return put.apply(this, args);
    });
    await expect(api.install(pack.ref, pack.files)).rejects.toMatchObject({ code: 'STORAGE_FAILED' });
    fault.mockRestore();
    expect(await api.list()).toEqual([]);
    await api.install(pack.ref, pack.files);
    expect(await api.list()).toHaveLength(1);
    api.dispose();
  });

  it('uses the published build context and empty engine handler catalogue when the caller supplies no context', async () => {
    const factory = new IDBFactory(), config = options(factory), pack = await fixture(); delete config.context;
    const api = createPackRegistry(config);
    expect(await api.install(pack.ref, pack.files)).toMatchObject({ ref: pack.ref, stored: true, enabled: false, applied: false });
    expect(await api.list()).toHaveLength(1); api.dispose();
  });

  it('accepts a validated legacy model ref through the shared install surface without activating it', async () => {
    const config = options(new IDBFactory()), manifest = { format: 's2u-model-pack', version: 1, models: [{ id: 'crate', file: 'crate.glb' }] };
    const files = [{ path: 'models.json', bytes: bytes(JSON.stringify(manifest)) }, { path: 'crate.glb', bytes: new Uint8Array([1, 2, 3]) }];
    const checked = await validatePack(files, { ...context, legacy: { kind: 'model', manifestPath: 'models.json', manifest } });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const put = vi.fn(async () => {}), apply = vi.fn();
    const api = createPackRegistry({ ...config, models: { ...config.models!, put }, applyModel: apply });
    expect(await api.install(checked.ref, files)).toMatchObject({ id: 'model:current', ref: checked.ref, stored: true, enabled: false, applied: false, slot: 'primary' });
    expect(put).toHaveBeenCalledOnce();
    expect(apply).not.toHaveBeenCalled(); api.dispose();
  });

  it('returns the published incomplete report and stores nothing when archive evidence is absent', async () => {
    const factory = new IDBFactory(), config = options(factory), pack = await fixture();
    const manifestIndex = pack.files.findIndex(file => file.path === 's2u-pack.json'), manifestFile = pack.files[manifestIndex]!;
    const manifest = JSON.parse(new TextDecoder().decode(manifestFile.bytes));
    manifest.dependencies = [{ archive: 'RUN/MP51.ZDB', sha256: 'a'.repeat(64) }];
    pack.files[manifestIndex] = { path: manifestFile.path, bytes: bytes(JSON.stringify(manifest)) };
    const noArchives: PackContext = { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSIONS, packs: [], handlers: [] };
    const checked = await validatePack(pack.files, noArchives);
    expect(checked).toMatchObject({ ok: false, report: { status: 'incomplete' } });
    const api = createPackRegistry({ ...config, context: noArchives });
    await expect(api.install(pack.ref, pack.files)).rejects.toMatchObject({ code: 'INVALID_PACKAGE', report: {
      status: 'incomplete', diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'pack.CHECK_SKIPPED' })]),
    } });
    expect(await api.list()).toEqual([]); api.dispose();
  });

  it('keeps the new registry map adapter read-only while the legacy facade owns the transitional writer', async () => {
    const api = createPackRegistry(options(new IDBFactory()));
    await expect(api.remove('map:legacy')).rejects.toMatchObject({ code: 'UNSUPPORTED_SURFACE' });
    api.dispose();
  });
});
