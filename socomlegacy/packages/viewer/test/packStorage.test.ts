import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { idbPackDatabase, PACKS_BYTES, PACKS_DB, PACKS_MIGRATIONS, PACKS_RECOVERY, PACKS_SCOPES,
  PACK_MIGRATION_RECLAIM_MS_ADAPTATION, type PackMigrationPart } from '../src/packs/storage';

const initial = () => ({ packages: ['old bytes'], choices: { enabled: true, order: ['old'], disabled: [] as string[] } });

async function raw(factory: IDBFactory, store: string, key: string): Promise<unknown> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(PACKS_DB);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(store).objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
async function keys(factory: IDBFactory, store: string): Promise<IDBValidKey[]> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(PACKS_DB);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try {
    if (!db.objectStoreNames.contains(store)) return [];
    return await new Promise((resolve, reject) => {
      const request = db.transaction(store).objectStore(store).getAllKeys();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
async function putRows(factory: IDBFactory, rows: { store: string; key: string; value: unknown }[]): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(PACKS_DB);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([...new Set(rows.map(row => row.store))], 'readwrite');
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    for (const row of rows) tx.objectStore(row.store).put(row.value, row.key);
  }); } finally { db.close(); }
}

afterEach(() => vi.restoreAllMocks());

describe('one pack database transaction boundary (product adaptation)', () => {
  it('rejects a stale streaming observation before fetching any member bytes', async () => {
    const factory = new IDBFactory(), db = idbPackDatabase(() => factory);
    const legacy = async () => ({ primary: new Uint8Array([1]) });
    const observed = await db.read('models', legacy);
    await db.patch('models', legacy, () => ({ primary: new Uint8Array([9]) }));
    const get = IDBObjectStore.prototype.get, reads: unknown[] = [];
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === PACKS_BYTES) reads.push(args[0]); return get.apply(this, args);
    });
    await expect((async () => {
      for await (const _chunk of db.streamAt('models', ['primary'], { expectedGeneration: observed.generation })) { /* Drain only. */ }
    })()).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(reads).toEqual([]);
  });

  it('streams one member with backpressure and bounded records without reading unrelated model bytes', async () => {
    const factory = new IDBFactory(), db = idbPackDatabase(() => factory, { byteRecordLimit: 2 });
    await db.read('models', async () => ({ primary: new Uint8Array([1, 2, 3, 4, 5]), second: new Uint8Array([9]) }));
    expect.soft(await db.peek('models')).toMatchObject({ binary: [
      { path: ['primary'], byteLength: 5 }, { path: ['second'], byteLength: 1 },
    ] });
    const get = IDBObjectStore.prototype.get, reads: unknown[] = [];
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === PACKS_BYTES) reads.push(args[0]); return get.apply(this, args);
    });
    const iterator = db.streamAt('models', ['primary'])[Symbol.asyncIterator]();
    expect(reads).toEqual([]);
    expect(await iterator.next()).toMatchObject({ done: false, value: new Uint8Array([1, 2]) });
    expect(reads).toHaveLength(1);
    expect(await iterator.next()).toMatchObject({ done: false, value: new Uint8Array([3, 4]) });
    expect(reads).toHaveLength(2);
    expect(await iterator.next()).toMatchObject({ done: false, value: new Uint8Array([5]) });
    expect(reads).toHaveLength(3);
    expect(await iterator.next()).toMatchObject({ done: true });
    expect(reads).toHaveLength(3);
  });

  it('reclaims a long-expired orphan before a fresh migration needs to stage bytes', async () => {
    const factory = new IDBFactory(), db = idbPackDatabase(() => factory, { now: () => 2_000_000, owner: 'new-tab' });
    await db.peek('models');
    const key = 'migration/models/crashed/0/0';
    await putRows(factory, [
      { store: PACKS_BYTES, key, value: new Uint8Array([3]).buffer },
      { store: PACKS_MIGRATIONS, key: 'crashed', value: { nonce: 'crashed', kind: 'models', owner: 'dead-tab', leaseUntil: 0, keys: [key] } },
    ]);
    await db.migrate('models', async function* (): AsyncIterable<PackMigrationPart> {
      expect(await raw(factory, PACKS_BYTES, key)).toBeUndefined();
      yield { type: 'bytes', path: ['primary'], bytes: new Uint8Array([8]) };
      yield { type: 'metadata', data: { primary: null } };
    });
    expect(await db.readAt('models', ['primary'])).toMatchObject({ data: new Uint8Array([8]) });
    expect(await keys(factory, PACKS_MIGRATIONS)).toEqual([]);
  });

  it('reclaims a long-expired first-migration nonce before publication while preserving a fresh lease', async () => {
    const factory = new IDBFactory(), db = idbPackDatabase(() => factory, { now: () => 2_000_000 });
    await db.peek('models');
    const key = 'migration/models/unfinished/0/0';
    await putRows(factory, [
      { store: PACKS_BYTES, key, value: new Uint8Array([3]).buffer },
      { store: PACKS_MIGRATIONS, key: 'unfinished', value: { nonce: 'unfinished', kind: 'models', owner: 'dead-tab', leaseUntil: 0, keys: [key] } },
      { store: PACKS_BYTES, key: 'migration/models/live/0/0', value: new Uint8Array([4]).buffer },
      { store: PACKS_MIGRATIONS, key: 'live', value: { nonce: 'live', kind: 'models', owner: 'live-tab', leaseUntil: 2_030_000,
        keys: ['migration/models/live/0/0'] } },
    ]);
    expect(await db.reclaim('models')).toBe(1);
    expect(await db.peek('models')).toBeNull();
    expect(await raw(factory, PACKS_BYTES, key)).toBeUndefined();
    expect(await raw(factory, PACKS_BYTES, 'migration/models/live/0/0')).toEqual(new Uint8Array([4]).buffer);
    expect(await keys(factory, PACKS_MIGRATIONS)).toEqual(['live']);
  });

  it('retains committed recovery chunks after replacements and refuses to reclaim a referenced chunk', async () => {
    const factory = new IDBFactory(), db = idbPackDatabase(() => factory, { now: () => 2_000_000 });
    await db.migrate('models', async function* (): AsyncIterable<PackMigrationPart> {
      yield { type: 'bytes', path: ['primary'], bytes: new Uint8Array([8]) };
      yield { type: 'metadata', data: { primary: null } };
    });
    const saved = await raw(factory, PACKS_RECOVERY, 'models') as { binary: { keys: string[] }[] };
    const key = saved.binary[0]!.keys[0]!, nonce = key.split('/')[2]!;
    await db.patch('models', async () => ({ primary: new Uint8Array() }), () => ({ primary: new Uint8Array([9]) }));
    await db.update('models', async () => ({ primary: new Uint8Array() }), () => ({ primary: new Uint8Array([10]) }));
    await putRows(factory, [{ store: PACKS_MIGRATIONS, key: nonce,
      value: { nonce, kind: 'models', owner: 'dead-tab', leaseUntil: 0, keys: [key, 'mods/0/0/0'] } }]);
    expect(await db.reclaim('models')).toBe(1);
    expect(await raw(factory, PACKS_BYTES, key)).toEqual(new Uint8Array([8]).buffer);
    expect((await db.read('models', async () => ({ primary: new Uint8Array() }))).data.primary).toEqual(new Uint8Array([10]));
  });

  it('stops an expired lease before publication and can retry from the unchanged legacy source', async () => {
    const factory = new IDBFactory(); let clock = 1_000;
    const db = idbPackDatabase(() => factory, { now: () => clock, owner: 'tab' });
    await expect(db.migrate('models', async function* (): AsyncIterable<PackMigrationPart> {
      yield { type: 'bytes', path: ['primary'], bytes: new Uint8Array([1]) };
      clock += 120_000;
      yield { type: 'metadata', data: { primary: null } };
    })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await db.peek('models')).toBeNull();
    expect(await keys(factory, PACKS_BYTES)).toEqual([]);
    await db.migrate('models', async function* (): AsyncIterable<PackMigrationPart> {
      yield { type: 'bytes', path: ['primary'], bytes: new Uint8Array([1]) };
      yield { type: 'metadata', data: { primary: null } };
    });
    expect(await db.readAt('models', ['primary'])).toMatchObject({ data: new Uint8Array([1]) });
  });

  it('reclaims an expired migration nonce only after publication and leaves a fresh lease alone', async () => {
    const factory = new IDBFactory(), now = 1_000_000, db = idbPackDatabase(() => factory, { now: () => now, owner: 'new-tab' });
    await db.read('models', async () => ({ primary: null }));
    const oldKey = 'migration/models/old/0/0', freshKey = 'migration/models/fresh/0/0';
    await putRows(factory, [
      { store: PACKS_BYTES, key: oldKey, value: new Uint8Array([1]).buffer },
      { store: PACKS_BYTES, key: freshKey, value: new Uint8Array([2]).buffer },
      { store: PACKS_MIGRATIONS, key: 'old', value: { nonce: 'old', kind: 'models', owner: 'old-tab',
        leaseUntil: now - PACK_MIGRATION_RECLAIM_MS_ADAPTATION - 1, keys: [oldKey] } },
      { store: PACKS_MIGRATIONS, key: 'fresh', value: { nonce: 'fresh', kind: 'models', owner: 'live-tab',
        leaseUntil: now + 30_000, keys: [freshKey] } },
    ]);
    expect(await db.reclaim('models')).toBe(1);
    expect(await raw(factory, PACKS_BYTES, oldKey)).toBeUndefined();
    expect(await raw(factory, PACKS_BYTES, freshKey)).toEqual(new Uint8Array([2]).buffer);
    expect(await keys(factory, PACKS_MIGRATIONS)).toEqual(['fresh']);
  });

  it('reads one model slot without fetching the byte records belonging to the other slot', async () => {
    const factory = new IDBFactory(), db = idbPackDatabase(() => factory);
    await db.read('models', async () => ({ primary: { bytes: new Uint8Array([1]) }, second: { bytes: new Uint8Array([2]) } }));
    const get = IDBObjectStore.prototype.get, reads: unknown[] = [];
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === PACKS_BYTES) reads.push(args[0]); return get.apply(this, args);
    });
    expect(await db.readAt('models', ['primary'])).toMatchObject({ data: { bytes: new Uint8Array([1]) } });
    expect(reads).toHaveLength(1);
  });

  it('stages bounded migration chunks with backpressure and publishes only the final metadata marker', async () => {
    const factory = new IDBFactory(), db = idbPackDatabase(() => factory, { byteRecordLimit: 2 });
    const put = IDBObjectStore.prototype.put, sizes: number[] = [], observed: unknown[] = [];
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === PACKS_BYTES) sizes.push((args[0] as ArrayBuffer).byteLength);
      return put.apply(this, args);
    });
    await db.migrate('models', async function* (): AsyncIterable<PackMigrationPart> {
      yield { type: 'bytes', path: ['primary'], bytes: new Uint8Array([1, 2, 3]) };
      observed.push({ writes: sizes.length, published: await db.peek('models') });
      yield { type: 'bytes', path: ['second'], bytes: new Uint8Array([4]) };
      observed.push({ writes: sizes.length, published: await db.peek('models') });
      yield { type: 'metadata', data: { primary: null, second: null } };
    });
    expect(observed).toEqual([{ writes: 2, published: null }, { writes: 3, published: null }]);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(2);
    expect((await db.read('models', async () => { throw Error('published'); })).data)
      .toEqual({ primary: new Uint8Array([1, 2, 3]), second: new Uint8Array([4]) });
    expect(await raw(factory, PACKS_RECOVERY, 'models')).toBeDefined();
  });

  it('cleans only an interrupted migration attempt and permits a new attempt without publishing partial content', async () => {
    const factory = new IDBFactory(), db = idbPackDatabase(() => factory);
    await expect(db.migrate('models', async function* (): AsyncIterable<PackMigrationPart> {
      yield { type: 'bytes', path: ['primary'], bytes: new Uint8Array([1]) };
      throw Error('legacy read interrupted');
    })).rejects.toThrow('legacy read interrupted');
    expect(await db.peek('models')).toBeNull();
    expect(await raw(factory, PACKS_RECOVERY, 'models')).toBeUndefined();
    expect(await keys(factory, PACKS_BYTES)).toEqual([]);
    expect(await keys(factory, PACKS_MIGRATIONS)).toEqual([]);
    await db.migrate('models', async function* (): AsyncIterable<PackMigrationPart> {
      yield { type: 'bytes', path: ['primary'], bytes: new Uint8Array([2]) };
      yield { type: 'metadata', data: { primary: null } };
    });
    expect((await db.read('models', async () => { throw Error('published'); })).data).toEqual({ primary: new Uint8Array([2]) });
  });

  it('lets a two-tab first-open loser keep the winner and clean only its own unpublished nonce', async () => {
    const factory = new IDBFactory(), a = idbPackDatabase(() => factory), b = idbPackDatabase(() => factory);
    let entered!: () => void, release!: () => void;
    const staged = new Promise<void>(resolve => { entered = resolve; }), paused = new Promise<void>(resolve => { release = resolve; });
    const losing = a.migrate('models', async function* (): AsyncIterable<PackMigrationPart> {
      yield { type: 'bytes', path: ['primary'], bytes: new Uint8Array([1]) };
      entered(); await paused;
      yield { type: 'metadata', data: { primary: null } };
    });
    await Promise.race([staged, losing.then(() => { throw Error('migration completed before its staged source entered'); })]);
    await b.migrate('models', async function* (): AsyncIterable<PackMigrationPart> {
      yield { type: 'bytes', path: ['primary'], bytes: new Uint8Array([9]) };
      yield { type: 'metadata', data: { primary: null } };
    });
    release(); await losing;
    expect((await a.read('models', async () => { throw Error('published'); })).data).toEqual({ primary: new Uint8Array([9]) });
    expect(await keys(factory, PACKS_BYTES)).toHaveLength(1);
    expect(await keys(factory, PACKS_MIGRATIONS)).toEqual([]);
  });

  it('rolls back failed streamed publication and cleans no byte records belonging to another store', async () => {
    const factory = new IDBFactory(), db = idbPackDatabase(() => factory);
    await db.read('mods', async () => ({ bytes: new Uint8Array([7]) }));
    const previous = await keys(factory, PACKS_BYTES), put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === PACKS_SCOPES && args[1] === 'models') throw new DOMException('full', 'QuotaExceededError');
      return put.apply(this, args);
    });
    await expect(db.migrate('models', async function* (): AsyncIterable<PackMigrationPart> {
      yield { type: 'bytes', path: ['primary'], bytes: new Uint8Array([1]) };
      yield { type: 'metadata', data: { primary: null } };
    })).rejects.toMatchObject({ code: 'QUOTA' });
    expect(await db.peek('models')).toBeNull();
    expect(await raw(factory, PACKS_RECOVERY, 'models')).toBeUndefined();
    expect(await keys(factory, PACKS_BYTES)).toEqual(previous);
    expect(await keys(factory, PACKS_MIGRATIONS)).toEqual([]);
  });

  it('cancels a staged byte write and removes its unpublished migration job and chunks', async () => {
    const factory = new IDBFactory(), db = idbPackDatabase(() => factory), abort = new AbortController();
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      const result = put.apply(this, args); if (this.name === PACKS_BYTES) abort.abort(); return result;
    });
    await expect(db.migrate('models', async function* (): AsyncIterable<PackMigrationPart> {
      yield { type: 'bytes', path: ['primary'], bytes: new Uint8Array([1]) };
      yield { type: 'metadata', data: { primary: null } };
    }, abort.signal)).rejects.toMatchObject({ code: 'ABORTED' });
    expect(await db.peek('models')).toBeNull();
    expect(await keys(factory, PACKS_BYTES)).toEqual([]);
    expect(await keys(factory, PACKS_MIGRATIONS)).toEqual([]);
  });

  it('edits one slot without fetching or copying the byte records owned by either existing slot', async () => {
    const factory = new IDBFactory(), db = idbPackDatabase(() => factory);
    const legacy = async () => ({ primary: { bytes: new Uint8Array([1, 2]) }, second: { bytes: new Uint8Array([3, 4]) } });
    await db.read('models', legacy);
    const get = IDBObjectStore.prototype.get, put = IDBObjectStore.prototype.put;
    const reads: unknown[] = [], writes: unknown[] = [];
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === PACKS_BYTES) reads.push(args[0]); return get.apply(this, args);
    });
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === PACKS_BYTES) writes.push(args[1]); return put.apply(this, args);
    });
    await db.patch('models', legacy, data => ({ ...data, primary: { bytes: new Uint8Array([9]) } }), { expectedGeneration: 0 });
    expect((await db.peek('models'))?.generation).toBe(1);
    expect(reads).toEqual([]);
    expect(writes).toHaveLength(1);
    expect((await db.read('models', legacy)).data).toEqual({ primary: { bytes: new Uint8Array([9]) }, second: { bytes: new Uint8Array([3, 4]) } });
  });

  it('owns a Node Buffer subview without storing its unrelated backing-pool bytes', async () => {
    const factory = new IDBFactory(), db = idbPackDatabase(() => factory);
    const pool = Buffer.from([90, 1, 2, 3, 91]), member = pool.subarray(1, 4);
    await db.read('mods', async () => ({ bytes: member }));
    pool.fill(0);
    const stored = await db.read<{ bytes: Uint8Array }>('mods', async () => { throw Error('already migrated'); });
    expect(Array.from(stored.data.bytes)).toEqual([1, 2, 3]);
  });

  it('bounds individual binary records and reads boot metadata without fetching model bytes', async () => {
    const factory = new IDBFactory(), db = idbPackDatabase(() => factory, { byteRecordLimit: 4 });
    const first = new Uint8Array([1, 2, 3, 4, 5, 6, 7]), second = new Uint8Array([8, 9, 10]);
    const saved = { primary: { bytes: 7, entries: [{ path: 'first.glb', bytes: first.buffer }] } as
      { bytes: number; entries: { path: string; bytes: ArrayBufferLike }[] } | null,
      second: { bytes: 3, entries: [{ path: 'second.glb', bytes: second }] } };
    const put = IDBObjectStore.prototype.put;
    const sizes: number[] = [];
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.transaction.db.name === PACKS_DB && this.name === PACKS_BYTES) {
        expect(args[0]).toBeInstanceOf(ArrayBuffer);
        sizes.push((args[0] as ArrayBuffer).byteLength);
      }
      return put.apply(this, args);
    });
    await db.read('models', async () => saved);
    expect(sizes.length).toBeGreaterThan(2);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(4);
    const get = IDBObjectStore.prototype.get;
    const reads: string[] = [];
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, ...args) {
      reads.push(this.name); return get.apply(this, args);
    });
    expect(await db.peek('models')).toMatchObject({ data: { primary: { bytes: 7 }, second: { bytes: 3 } } });
    expect(reads).not.toContain(PACKS_BYTES);
    expect((await db.read('models', async () => { throw Error('already migrated'); })).data).toEqual(saved);
    await db.update('models', async () => saved, data => ({ ...data, primary: null }));
    expect((await db.read('models', async () => saved)).data.second).toEqual(saved.second);
    expect(await raw(factory, PACKS_RECOVERY, 'models')).toBeDefined();
  });

  it('keeps the exact legacy snapshot as recovery while publishing mutable owned data', async () => {
    const factory = new IDBFactory(), db = idbPackDatabase(() => factory), legacy = initial();
    const first = await db.read('mods', async () => legacy);
    await db.update('mods', async () => initial(), data => ({
      ...data, packages: [...data.packages, 'new bytes'], choices: { ...data.choices, order: ['old', 'new'], disabled: ['new'] },
    }), { expectedGeneration: first.generation });

    expect(legacy).toEqual({ packages: ['old bytes'], choices: { enabled: true, order: ['old'], disabled: [] } });
    expect(await raw(factory, PACKS_RECOVERY, 'mods')).toMatchObject({ data: {
      packages: ['old bytes'], choices: { enabled: true, order: ['old'], disabled: [] },
    } });
    const reopened = idbPackDatabase(() => factory);
    expect(await reopened.read('mods', async () => { throw Error('legacy must not be read again'); })).toMatchObject({
      generation: 1, data: { packages: ['old bytes', 'new bytes'], choices: { enabled: true, order: ['old', 'new'], disabled: ['new'] } },
    });
  });

  it('lets a concurrent first-open loser read the winning migration instead of overwriting it', async () => {
    const factory = new IDBFactory(), a = idbPackDatabase(() => factory), b = idbPackDatabase(() => factory);
    let release!: (value: ReturnType<typeof initial>) => void;
    let entered!: () => void;
    const loading = new Promise<void>(resolve => { entered = resolve; });
    const first = a.read('mods', async () => { entered(); return new Promise<ReturnType<typeof initial>>(resolve => { release = resolve; }); });
    await Promise.race([loading, first.then(() => { throw Error('migration finished before its legacy loader entered'); })]);
    const winner = await b.read('mods', async () => ({ ...initial(), packages: ['winning legacy bytes'] }));
    release({ ...initial(), packages: ['losing legacy bytes'] });

    expect(await first).toEqual(winner);
    expect(await raw(factory, PACKS_RECOVERY, 'mods')).toMatchObject({ data: { packages: ['winning legacy bytes'] } });
  });

  it('rolls back migration publication when its recovery-copy write fails and permits a fresh retry', async () => {
    const factory = new IDBFactory(), db = idbPackDatabase(() => factory);
    const put = IDBObjectStore.prototype.put;
    const fault = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.transaction.db.name === PACKS_DB && this.name === PACKS_RECOVERY) throw new DOMException('full', 'QuotaExceededError');
      return put.apply(this, args);
    });
    await expect(db.read('mods', async () => initial())).rejects.toMatchObject({ code: 'QUOTA' });
    expect(await raw(factory, PACKS_SCOPES, 'mods')).toBeUndefined();
    expect(await raw(factory, PACKS_RECOVERY, 'mods')).toBeUndefined();
    fault.mockRestore();

    expect(await db.read('mods', async () => initial())).toMatchObject({ generation: 0, data: { packages: ['old bytes'] } });
  });

  it('commits bytes, disabled choices and generation together, leaving all three unchanged on quota failure', async () => {
    const factory = new IDBFactory(), db = idbPackDatabase(() => factory);
    await db.read('mods', async () => initial());
    const put = IDBObjectStore.prototype.put;
    const fault = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.transaction.db.name === PACKS_DB && this.name === PACKS_SCOPES) throw new DOMException('full', 'QuotaExceededError');
      return put.apply(this, args);
    });
    await expect(db.update('mods', async () => initial(), data => ({
      ...data, packages: ['replacement bytes'], choices: { ...data.choices, disabled: ['old'] },
    }), { expectedGeneration: 0 })).rejects.toMatchObject({ code: 'QUOTA' });
    fault.mockRestore();

    expect(await db.read('mods', async () => initial())).toEqual({ kind: 'mods', generation: 0, data: initial() });
  });

  it('rejects a second instance with an old generation and preserves the newer committed bytes', async () => {
    const factory = new IDBFactory(), a = idbPackDatabase(() => factory), b = idbPackDatabase(() => factory);
    const old = await a.read('mods', async () => initial());
    await b.update('mods', async () => initial(), data => ({ ...data, packages: ['newer human bytes'] }), { expectedGeneration: old.generation });

    await expect(a.update('mods', async () => initial(), data => ({ ...data, packages: [] }),
      { expectedGeneration: old.generation })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await a.read('mods', async () => initial())).toMatchObject({ generation: 1, data: { packages: ['newer human bytes'] } });
  });

  it('keeps generations independent between native pack kinds', async () => {
    const factory = new IDBFactory(), db = idbPackDatabase(() => factory);
    await db.read('mods', async () => initial());
    await db.read('models', async () => ({ primary: null, second: null }));
    await db.update('mods', async () => initial(), data => data, { expectedGeneration: 0 });
    expect((await db.read('models', async () => ({ primary: null, second: null }))).generation).toBe(0);
  });

  it('does not publish a migration cancelled while its legacy read was pending', async () => {
    const factory = new IDBFactory(), db = idbPackDatabase(() => factory), abort = new AbortController();
    await expect(db.read('mods', async () => { abort.abort(); return initial(); }, abort.signal)).rejects.toMatchObject({ code: 'ABORTED' });
    expect(await raw(factory, PACKS_SCOPES, 'mods')).toBeUndefined();
    expect(await raw(factory, PACKS_RECOVERY, 'mods')).toBeUndefined();
  });

  it('aborts an in-flight write without leaving partially updated bytes or choices', async () => {
    const factory = new IDBFactory(), db = idbPackDatabase(() => factory), abort = new AbortController();
    await db.read('mods', async () => initial());
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      const result = put.apply(this, args);
      if (this.transaction.db.name === PACKS_DB && this.name === PACKS_SCOPES) abort.abort();
      return result;
    });
    await expect(db.update('mods', async () => initial(), data => ({ ...data, packages: [] }),
      { expectedGeneration: 0, signal: abort.signal })).rejects.toMatchObject({ code: 'ABORTED' });
    expect(await db.read('mods', async () => initial())).toEqual({ kind: 'mods', generation: 0, data: initial() });
  });
});
