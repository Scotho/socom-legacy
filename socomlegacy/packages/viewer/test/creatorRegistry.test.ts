import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { CHECK_REPORT_SCHEMA, CHECK_REPORT_VERSION, DIAGNOSTIC_SCHEMA, DIAGNOSTIC_VERSION, ENGINE_CONTRACT_VERSION, PACK_TARGET_US,
  sha256Hex, validatePack, type BufferedPackFile, type PackContext } from '@s2u/creator-contracts';
import { idbPackDatabase, PACKS_BYTES, PACKS_DB, PACKS_SCOPES } from '../src/packs/storage';
import { createPackRegistry } from '../src/packs/registry';
import { validateLegacyPack } from '../src/packs/adapters';
import { createLocalPackApi, type LocalPackOptions } from '../src/agent/localPacks';
import { loadMods } from '../src/mods/load';
import { idbModLibrary, memoryModLibrary, type ModLibrary, type StoredMod } from '../src/mods/store';
import { memoryUploadBackend, UploadedPacks } from '../src/texturePackStore';

/** FCW-06 product adaptation: compatibility tests use the existing facade and stores, with authored bytes only. */
function mod(id: string, path: string, text: string): StoredMod {
  const manifest = {
    format: 's2u-mod', formatVersion: 1, id, name: id, version: '1', author: 'Fixture', description: '',
    target: 'socom2-us-r0001', files: [{ path, file: 'note.txt' }],
  };
  return { id, label: id, files: [
    { name: 'mod.json', bytes: new TextEncoder().encode(JSON.stringify(manifest)) },
    { name: 'note.txt', bytes: new TextEncoder().encode(text) },
  ] };
}

function options(mods: ModLibrary): LocalPackOptions {
  const values = new Map<string, string>();
  return {
    mods, maps: { get: key => values.get(key) ?? null, set: (key, value) => { values.set(key, value); } },
    models: { read: async () => null, put: async () => {}, remove: async () => {} },
    textures: new UploadedPacks(memoryUploadBackend()),
  };
}

async function stageMod(api: ReturnType<typeof createLocalPackApi>, pack: StoredMod): Promise<string> {
  const [staged] = await api.stage(pack.files.map(file => ({
    name: file.name, size: file.bytes.length, arrayBuffer: async () => file.bytes.slice().buffer,
  })));
  return staged!.id;
}

describe('creator registry legacy compatibility (product adaptation)', () => {
  afterEach(() => vi.restoreAllMocks());
  it('lists unvalidated native payloads with a null ref and pending validation, without loading their bytes', async () => {
    const factory = new IDBFactory(), library = idbModLibrary(() => factory);
    await library.put(mod('unvalidated', 'NOTES/UNVALIDATED.TXT', 'legacy bytes'));
    const api = createLocalPackApi(options(library)), get = IDBObjectStore.prototype.get, byteReads: unknown[] = [];
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.transaction.db.name === PACKS_DB && this.name === PACKS_BYTES) byteReads.push(args[0]);
      return get.apply(this, args);
    });
    expect(await api.list()).toEqual([expect.objectContaining({ id: 'mod:unvalidated', ref: null, validation: 'pending-validation' })]);
    expect(byteReads).toEqual([]); api.dispose();
  });

  it('persists the validated canonical ref beside legacy mod bytes while preserving the colon facade id', async () => {
    const factory = new IDBFactory(), library = idbModLibrary(() => factory), api = createLocalPackApi(options(library));
    const stagedId = await stageMod(api, mod('validated', 'NOTES/VALIDATED.TXT', 'validated bytes'));
    const result = await api.import({ kind: 'mod', stagedId });
    expect(result).toMatchObject({ id: 'mod:validated', validation: 'validated', ref: { id: 'mod.validated', version: '0.0.0+legacy.1', hash: expect.stringMatching(/^[a-f0-9]{64}$/) } });
    api.dispose();
    const restarted = createLocalPackApi(options(idbModLibrary(() => factory)));
    expect(await restarted.list()).toEqual([expect.objectContaining({ id: 'mod:validated', ref: result.ref, validation: 'validated' })]);
    restarted.dispose();
  });

  it('preserves the native facade import of an extra unlisted member while leaving framework identity pending', async () => {
    const factory = new IDBFactory(), library = idbModLibrary(() => factory), api = createLocalPackApi(options(library));
    const pack = mod('with-notes', 'NOTES/EXTRA.TXT', 'native override');
    pack.files.push({ name: 'readme.txt', bytes: new TextEncoder().encode('extra native package notes') });
    const stagedId = await stageMod(api, pack);
    const report = expect.objectContaining({ schema: CHECK_REPORT_SCHEMA, version: CHECK_REPORT_VERSION,
      evidence: 'validation', status: 'fail', diagnostics: expect.arrayContaining([expect.objectContaining({
        schema: DIAGNOSTIC_SCHEMA, version: DIAGNOSTIC_VERSION, source: 'pack', severity: 'error',
        code: 'pack.MEMBER_UNLISTED', file: 'readme.txt',
      })]),
    });
    await expect(api.import({ kind: 'mod', stagedId })).resolves.toMatchObject({
      id: 'mod:with-notes', stored: true, ref: null, validation: 'pending-validation', report,
    });
    expect((await library.read()).packages[0]?.files.map(file => file.name)).toEqual(['mod.json', 'note.txt', 'readme.txt']);
    api.dispose();
    const restarted = createLocalPackApi(options(idbModLibrary(() => factory)));
    expect(await restarted.list()).toEqual([expect.objectContaining({ ref: null, validation: 'pending-validation',
      report,
    })]);
    restarted.dispose();
  });

  it('lists current saved mod choices without reading owned package bytes or freezing the import cache', async () => {
    const factory = new IDBFactory(), library = idbModLibrary(() => factory), api = createLocalPackApi(options(library));
    const stagedId = await stageMod(api, mod('choices', 'NOTES/CHOICES.TXT', 'owned bytes'));
    await api.import({ kind: 'mod', stagedId });
    await library.writeChoices({ enabled: true, order: ['choices'], disabled: [] });
    const get = IDBObjectStore.prototype.get, byteReads: unknown[] = [];
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.transaction.db.name === PACKS_DB && this.name === PACKS_BYTES) byteReads.push(args[0]);
      return get.apply(this, args);
    });
    expect(await api.list()).toEqual([expect.objectContaining({ id: 'mod:choices', enabled: true, applied: false })]);
    expect(byteReads).toEqual([]);
    api.dispose();
  });

  it('retains the live state of an applied pending mod and deactivates it before deleting its saved bytes', async () => {
    const library = memoryModLibrary(), events: string[] = [];
    let active = false;
    const remove = library.remove.bind(library);
    vi.spyOn(library, 'remove').mockImplementation(async (...args) => { events.push('remove'); await remove(...args); });
    const apply = vi.fn(async () => { active = true; events.push('apply'); });
    const deactivate = vi.fn(async () => {
      expect((await library.read()).packages.map(pack => pack.id)).toContain('pending-live');
      active = false; events.push('deactivate');
    });
    const api = createLocalPackApi({ ...options(library), allowedSurface: () => true, applyMod: apply, deactivate });
    const pack = mod('pending-live', 'NOTES/LIVE.TXT', 'native live override');
    pack.files.push({ name: 'readme.txt', bytes: new TextEncoder().encode('extra native package notes') });
    const stagedId = await stageMod(api, pack);
    const imported = await api.import({ kind: 'mod', stagedId, apply: true });
    expect(imported).toMatchObject({ id: 'mod:pending-live', stored: true, applied: true,
      ref: null, validation: 'pending-validation' });
    expect(apply).toHaveBeenCalledOnce();
    // isApplied is optional; this API's own completed apply must remain attached to these exact saved bytes.
    expect.soft(await api.list()).toEqual([expect.objectContaining({ id: 'mod:pending-live', applied: true,
      ref: null, validation: 'pending-validation', digest: imported.digest })]);
    expect(await api.remove('mod:pending-live')).toMatchObject({ removed: true, stored: false, applied: false });
    expect.soft(deactivate).toHaveBeenCalledOnce();
    expect.soft(events).toEqual(['apply', 'deactivate', 'remove']);
    expect.soft(active).toBe(false);
    expect((await library.read()).packages).toEqual([]); api.dispose();
  });

  it('does not attach an applied pending mod cache to different bytes saved by a human under the same id', async () => {
    const library = memoryModLibrary(), apply = vi.fn(async () => {});
    const api = createLocalPackApi({ ...options(library), allowedSurface: () => true, applyMod: apply });
    const pack = mod('pending-replace', 'NOTES/LIVE.TXT', 'first native bytes');
    pack.files.push({ name: 'readme.txt', bytes: new TextEncoder().encode('extra native package notes') });
    const stagedId = await stageMod(api, pack);
    const imported = await api.import({ kind: 'mod', stagedId, apply: true });
    expect(imported).toMatchObject({ applied: true, ref: null, validation: 'pending-validation' });
    expect(imported.digest).toEqual(expect.any(String));
    const replacement = mod('pending-replace', 'NOTES/LIVE.TXT', 'human native bytes');
    replacement.files.push({ name: 'readme.txt', bytes: new TextEncoder().encode('extra native package notes') });
    await library.put(replacement);
    const [listed] = await api.list();
    expect(listed).toMatchObject({ id: 'mod:pending-replace', applied: false, ref: null, validation: 'pending-validation' });
    expect(listed?.digest).not.toBe(imported.digest);
    expect((await library.read()).packages).toEqual([replacement]); api.dispose();
  });

  it('keeps removal busy until an already-started content digest settles after cancellation', async () => {
    const library = memoryModLibrary(), deactivate = vi.fn();
    const api = createLocalPackApi({ ...options(library), allowedSurface: () => true, applyMod: async () => {}, deactivate });
    const pack = mod('pending-hash', 'NOTES/HASH.TXT', 'tiny native bytes');
    pack.files.push({ name: 'readme.txt', bytes: new TextEncoder().encode('extra native package notes') });
    const stagedId = await stageMod(api, pack);
    expect(await api.import({ kind: 'mod', stagedId, apply: true })).toMatchObject({ applied: true, ref: null });
    const before = await library.read(), read = vi.spyOn(library, 'read'), remove = vi.spyOn(library, 'remove'), put = vi.spyOn(library, 'put');
    const controller = new AbortController(), original = crypto.subtle.digest.bind(crypto.subtle);
    let enter!: () => void, release!: () => void, finish!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const resume = new Promise<void>(resolve => { release = resolve; });
    const drained = new Promise<void>(resolve => { finish = resolve; });
    let hashes = 0, digestFinished = false, operationSettled = false;
    const digestSpy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      hashes++;
      const work = original(...args);
      if (hashes !== 1) return work;
      // The real digest has started; only this owning promise's completion is controlled, not physical CPU work.
      enter();
      try { await resume; return await work; } finally { digestFinished = true; finish(); }
    });
    let removing: Promise<unknown> | undefined;
    try {
      removing = api.remove('mod:pending-hash', { signal: controller.signal }).then(
        value => { operationSettled = true; return value; },
        error => { operationSettled = true; return { error }; },
      );
      await entered; controller.abort();
      await new Promise<void>(resolve => setTimeout(resolve, 0)); // Let cancellation handlers run while the digest gate stays closed.
      expect.soft(digestFinished).toBe(false);
      expect.soft(operationSettled).toBe(false);
      await expect.soft(api.stage([{ name: 'busy.txt', size: 1, arrayBuffer: async () => new Uint8Array([1]).buffer }]))
        .rejects.toMatchObject({ code: 'BUSY' });
      expect.soft(read).toHaveBeenCalledOnce(); expect.soft(hashes).toBe(1);
      expect(remove).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled();
      release();
      expect(await removing).toMatchObject({ error: { code: 'ABORTED' } });
      await drained;
      expect(digestFinished).toBe(true); expect(hashes).toBe(1);
      expect(read).toHaveBeenCalledOnce(); expect(deactivate).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled();
      expect(await library.read()).toEqual(before);
    } finally { release(); await removing; await drained; digestSpy.mockRestore(); api.dispose(); }
  });

  it.each([
    ['install', 'first member', 'resolve'], ['install', 'first member', 'reject'],
    ['install', 'final pack digest', 'resolve'], ['install', 'final pack digest', 'reject'],
    ['stored validation', 'final pack digest', 'resolve'], ['stored validation', 'final pack digest', 'reject'],
  ] as const)('drains the shared validator before releasing %s cancellation at %s on %s', async (surface, phase, outcome) => {
    const factory = new IDBFactory(), database = idbPackDatabase(() => factory);
    await database.read('packs', async () => ({ records: [] }));
    const library = surface === 'stored validation' ? idbModLibrary(() => factory) : memoryModLibrary();
    const context: PackContext = { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSION, packs: [], handlers: [] };
    const original = crypto.subtle.digest.bind(crypto.subtle), hashInputs: Uint8Array[] = [];
    const hash = async (value: Uint8Array): Promise<Uint8Array> => new Uint8Array(await original('SHA-256', new Uint8Array(value).buffer));
    const baseline = { ...context, sha256: async (value: Uint8Array) => { hashInputs.push(value.slice()); return hash(value); } };
    let files: BufferedPackFile[];
    if (surface === 'stored validation') {
      const native = mod('validation-drain', 'NOTES/DRAIN.TXT', 'tiny stored native member');
      await library.put(native); files = native.files.map(file => ({ path: file.name, bytes: file.bytes }));
    } else {
      const first = new TextEncoder().encode('tiny first member'), second = new TextEncoder().encode('tiny second member');
      const manifest = { format: 's2u-pack', formatVersion: 2, id: 'fixture.validation-drain', version: '1.0.0', name: 'Drain fixture',
        target: context.target, contract: '*', kinds: ['content'], sides: 'client', dependencies: [],
        files: [{ path: 'first.txt', sha256: await sha256Hex(first), size: first.length, role: 'data' },
          { path: 'second.txt', sha256: await sha256Hex(second), size: second.length, role: 'data' }],
        intents: [{ kind: 'cosmetic', files: ['first.txt', 'second.txt'] }],
      };
      files = [{ path: 's2u-pack.json', bytes: new TextEncoder().encode(JSON.stringify(manifest)) },
        { path: 'first.txt', bytes: first }, { path: 'second.txt', bytes: second }];
    }
    const checked = surface === 'stored validation' ? await validateLegacyPack('mod', files, baseline) : await validatePack(files, baseline);
    if (!checked.ok) throw Error('The bounded lifetime fixture must pass the published validator.');
    // Select an actual published-validator hash input from its successful baseline, without duplicating digest construction.
    const target = phase === 'first member' ? hashInputs[0]! : hashInputs[hashInputs.length - 1]!;
    const same = (value: Uint8Array): boolean => value.length === target.length && value.every((byte, index) => byte === target[index]);
    const before = await library.read(), controller = new AbortController();
    let enter!: () => void, release!: () => void, finish!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const resume = new Promise<void>(resolve => { release = resolve; });
    const drained = new Promise<void>(resolve => { finish = resolve; });
    let held = false, hashFinished = false, operationSettled = false, postAbortHashes = 0;
    const api = createPackRegistry({ ...options(library), database, context: { ...context, sha256: async value => {
      // Count an illicit later call, then stop that bad path so even the failing fixture leaves no crypto work behind.
      if (controller.signal.aborted) { postAbortHashes++; throw Error('A later validation hash started after cancellation.'); }
      const work = hash(value);
      if (held || !same(value)) return work;
      held = true; enter();
      try {
        await resume; const result = await work;
        if (outcome === 'reject') throw Error('Controlled rejection of the already-started owned hash promise.');
        return result;
      } finally { hashFinished = true; finish(); }
    } } });
    const put = IDBObjectStore.prototype.put, postAbortWrites: unknown[] = [];
    const writes = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (controller.signal.aborted && this.transaction.db.name === PACKS_DB && (this.name === PACKS_BYTES || this.name === PACKS_SCOPES))
        postAbortWrites.push(args[1]);
      return put.apply(this, args);
    });
    let operation: Promise<unknown> | undefined;
    try {
      const started = surface === 'stored validation' ? api.validate('mod:validation-drain', { signal: controller.signal })
        : api.install(checked.ref, files, { signal: controller.signal });
      operation = started.then(value => { operationSettled = true; return value; }, error => { operationSettled = true; return { error }; });
      await entered; controller.abort();
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      expect.soft(hashFinished).toBe(false); expect.soft(operationSettled).toBe(false);
      await expect.soft(api.stage([{ name: 'busy.txt', size: 1, arrayBuffer: async () => new Uint8Array([1]).buffer }]))
        .rejects.toMatchObject({ code: 'BUSY' });
      expect.soft(postAbortWrites).toEqual([]);
      release(); await drained;
      expect(await operation).toMatchObject({ error: { code: 'ABORTED' } });
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      expect(hashFinished).toBe(true); expect.soft(postAbortHashes).toBe(0); expect(postAbortWrites).toEqual([]);
      expect(await library.read()).toEqual(before);
      expect((await database.peek('packs'))?.data).toEqual({ records: [] });
      expect((await api.list()).filter(item => item.stored)).toEqual(surface === 'stored validation'
        ? [expect.objectContaining({ ref: null, validation: 'pending-validation' })] : []);
    } finally { release(); await operation; await drained; writes.mockRestore(); api.dispose(); }
  });

  it('drops an old validated ref after a native replacement instead of reusing cached validation', async () => {
    const factory = new IDBFactory(), library = idbModLibrary(() => factory), api = createLocalPackApi(options(library));
    const stagedId = await stageMod(api, mod('replace', 'NOTES/REPLACE.TXT', 'first validated bytes'));
    expect(await api.import({ kind: 'mod', stagedId })).toMatchObject({ validation: 'validated' });
    await idbModLibrary(() => factory).put(mod('replace', 'NOTES/REPLACE.TXT', 'new native bytes'));
    const get = IDBObjectStore.prototype.get, reads: unknown[] = [];
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.transaction.db.name === PACKS_DB && this.name === PACKS_BYTES) reads.push(args[0]);
      return get.apply(this, args);
    });
    expect(await api.list()).toEqual([expect.objectContaining({ id: 'mod:replace', ref: null, validation: 'pending-validation' })]);
    expect(reads).toEqual([]); api.dispose();
  });

  it('retains staged capabilities and commits neither bytes nor initial choices when a native write fails', async () => {
    const factory = new IDBFactory(), library = idbModLibrary(() => factory);
    await library.read();
    const api = createLocalPackApi(options(library));
    const stagedId = await stageMod(api, mod('retry', 'NOTES/RETRY.TXT', 'retry bytes'));
    const put = IDBObjectStore.prototype.put;
    const fault = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.transaction.db.name === PACKS_DB && this.name === PACKS_SCOPES) throw new DOMException('full', 'QuotaExceededError');
      return put.apply(this, args);
    });
    await expect(api.import({ kind: 'mod', stagedId })).rejects.toMatchObject({ code: 'STORAGE_FAILED' });
    fault.mockRestore();
    expect((await library.read()).packages).toEqual([]);
    expect((await library.read()).choices).toEqual({ enabled: false, order: [], disabled: [] });
    expect(await api.list()).toEqual([expect.objectContaining({ id: stagedId, staged: true, stored: false })]);
    expect(await api.import({ kind: 'mod', stagedId })).toMatchObject({ stored: true, enabled: false, applied: false });
    expect((await library.read()).choices.disabled).toContain('retry');
    api.dispose();
  });

  it('preserves a newer human replacement committed just before the import write', async () => {
    const factory = new IDBFactory(), a = idbModLibrary(() => factory), b = idbModLibrary(() => factory);
    await a.put(mod('racing', 'NOTES/RACE.TXT', 'original bytes'));
    const racing: ModLibrary = { ...a, put: async (pack, request) => {
      await b.put(mod('racing', 'NOTES/RACE.TXT', 'newer human bytes'));
      await a.put(pack, request);
    } };
    const api = createLocalPackApi(options(racing)), stagedId = await stageMod(api, mod('racing', 'NOTES/RACE.TXT', 'agent replacement'));
    await expect(api.import({ kind: 'mod', stagedId })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(new TextDecoder().decode((await b.read()).packages[0]?.files.find(file => file.name === 'note.txt')?.bytes)).toBe('newer human bytes');
    expect(await api.list()).toEqual(expect.arrayContaining([expect.objectContaining({ id: stagedId, staged: true, stored: false })]));
    api.dispose();
  });

  it('preserves a human replacement made while the import bytes are being hashed', async () => {
    const factory = new IDBFactory(), a = idbModLibrary(() => factory), b = idbModLibrary(() => factory);
    await a.put(mod('hash-race', 'NOTES/HASH.TXT', 'original bytes'));
    const api = createLocalPackApi(options(a)), stagedId = await stageMod(api, mod('hash-race', 'NOTES/HASH.TXT', 'agent bytes'));
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let replaced = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      if (!replaced) { replaced = true; await b.put(mod('hash-race', 'NOTES/HASH.TXT', 'human bytes during hashing')); }
      return digest(...args);
    });
    await expect(api.import({ kind: 'mod', stagedId })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(new TextDecoder().decode((await b.read()).packages[0]?.files.find(file => file.name === 'note.txt')?.bytes))
      .toBe('human bytes during hashing');
    api.dispose();
  });

  it.each(['newer bytes', 'selected bytes'])('preserves a second native writer committing %s after the final observation', async text => {
    const factory = new IDBFactory(), a = idbModLibrary(() => factory), b = idbModLibrary(() => factory);
    await a.put(mod('racing', 'NOTES/RACE.TXT', 'selected bytes'));
    const racing: ModLibrary = { ...a, remove: async (id, request) => {
      await b.put(mod('racing', 'NOTES/RACE.TXT', text));
      await a.remove(id, request);
    } };
    const api = createLocalPackApi(options(racing));

    await expect(api.remove('mod:racing')).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });

    const saved = await b.read();
    expect(new TextDecoder().decode(saved.packages.find(pack => pack.id === 'racing')?.files
      .find(file => file.name === 'note.txt')?.bytes)).toBe(text);
    api.dispose();
  });

  it('keeps an imported mod disabled after restart when the existing master switch is on', async () => {
    // A second library/API opens the same browser store; an in-memory active-summary cache cannot satisfy this.
    const factory = new IDBFactory(); const library = idbModLibrary(() => factory);
    await library.put(mod('enabled-first', 'NOTES/FIRST.TXT', 'first existing bytes'));
    await library.put(mod('already-disabled', 'NOTES/MUTED.TXT', 'muted existing bytes'));
    await library.put(mod('enabled-last', 'NOTES/LAST.TXT', 'last existing bytes'));
    await library.writeChoices({
      enabled: true, order: ['enabled-last', 'already-disabled', 'enabled-first'], disabled: ['already-disabled'],
    });
    const api = createLocalPackApi(options(library));
    const stagedId = await stageMod(api, mod('new-pack', 'NOTES/NEW.TXT', 'new authored bytes'));
    const result = await api.import({ kind: 'mod', stagedId, apply: false });
    api.dispose();

    const reopened = idbModLibrary(() => factory);
    const saved = await reopened.read();
    const restarted = createLocalPackApi(options(reopened));
    const summary = (await restarted.list()).find(item => item.id === 'mod:new-pack');
    const session = loadMods(saved.packages.map(pack => ({
      label: pack.label, files: new Map(pack.files.map(file => [file.name, file.bytes])),
    })), saved.choices);

    expect(session.overrides.map(entry => ({
      id: entry.modId, text: new TextDecoder().decode(entry.bytes),
    }))).toEqual([
      { id: 'enabled-last', text: 'last existing bytes' },
      { id: 'enabled-first', text: 'first existing bytes' },
    ]);
    expect(session.choices.enabled).toBe(true);
    expect(session.choices.order).toEqual(['enabled-last', 'already-disabled', 'enabled-first', 'new-pack']);
    expect(session.rows.flatMap(row => row.kind === 'loaded' && row.enabled ? [row.id] : []))
      .toEqual(['enabled-last', 'enabled-first']);
    expect(saved.choices.disabled).toEqual(expect.arrayContaining(['already-disabled', 'new-pack']));
    expect(summary).toMatchObject({ stored: true, enabled: false, applied: false });
    expect(result).toMatchObject({ id: 'mod:new-pack', stored: true, enabled: false, applied: false });
    restarted.dispose();
  });

  it('preserves the explicitly consented apply:true compatibility composite', async () => {
    const factory = new IDBFactory(); const library = idbModLibrary(() => factory);
    const installed = new Set<string>();
    const config: LocalPackOptions = {
      ...options(library), allowedSurface: () => true,
      applyMod: async (_pack, manifest) => { installed.add(`mod:${manifest.id}`); },
      isApplied: (kind, id) => kind === 'mod' && installed.has(id),
    };
    const api = createLocalPackApi(config);
    const stagedId = await stageMod(api, mod('consented-pack', 'NOTES/CONSENT.TXT', 'explicitly applied bytes'));

    const result = await api.import({ kind: 'mod', stagedId, apply: true });

    expect(result).toMatchObject({ id: 'mod:consented-pack', stored: true, enabled: true, applied: true });
    expect(installed.has('mod:consented-pack')).toBe(true);
    const saved = await idbModLibrary(() => factory).read();
    expect(new TextDecoder().decode(saved.packages.find(pack => pack.id === 'consented-pack')?.files
      .find(file => file.name === 'note.txt')?.bytes)).toBe('explicitly applied bytes');
    api.dispose();
  });

  it('reports committed mod bytes when the explicit live application fails', async () => {
    const factory = new IDBFactory(); const library = idbModLibrary(() => factory);
    const api = createLocalPackApi({
      ...options(library), allowedSurface: () => true,
      applyMod: async () => { throw new Error('live installation refused'); },
    });
    const stagedId = await stageMod(api, mod('apply-failed', 'NOTES/FAILED.TXT', 'kept after live failure'));

    await expect(api.import({ kind: 'mod', stagedId, apply: true })).rejects.toMatchObject({
      code: 'APPLY_FAILED', result: { id: 'mod:apply-failed', stored: true, applied: false },
    });

    const saved = await idbModLibrary(() => factory).read();
    expect(new TextDecoder().decode(saved.packages.find(pack => pack.id === 'apply-failed')?.files
      .find(file => file.name === 'note.txt')?.bytes)).toBe('kept after live failure');
    api.dispose();
  });

  it.each(['throws', 'unavailable'] as const)('reports stored:true if a choices read %s after the package transaction commits', async mode => {
    const factory = new IDBFactory(); const library = idbModLibrary(() => factory);
    let committed = false;
    // Only the failing read is injected. The put and its transaction remain the existing IndexedDB backend.
    const failingRead: ModLibrary = {
      ...library,
      put: async (pack, request) => { await library.put(pack, request); committed = true; },
      read: async () => {
        if (!committed) return library.read();
        if (mode === 'throws') throw new Error('choices read unavailable');
        return { choices: { enabled: false, order: [], disabled: [] }, packages: [], unavailable: true };
      },
    };
    const api = createLocalPackApi(options(failingRead));
    const stagedId = await stageMod(api, mod('read-failed', 'NOTES/READ.TXT', 'committed before read failure'));

    await expect(api.import({ kind: 'mod', stagedId, apply: false })).rejects.toMatchObject({
      code: 'STORAGE_FAILED', result: { id: 'mod:read-failed', stored: true, applied: false },
    });

    const saved = await idbModLibrary(() => factory).read();
    expect(new TextDecoder().decode(saved.packages.find(pack => pack.id === 'read-failed')?.files
      .find(file => file.name === 'note.txt')?.bytes)).toBe('committed before read failure');
    api.dispose();
  });
});
