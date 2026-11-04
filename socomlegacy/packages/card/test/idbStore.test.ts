import { IDBDatabase as FakeDatabase, IDBFactory as FakeFactory, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { CARD_DB_NAME, CARD_DB_STORE, classifyFailure, IdbStore, StoreError, type OpenTimer } from '../src/index';
import { pattern, sameBytes, storeContract } from './storeContract';

/** A fresh, private IndexedDB per test (fake-indexeddb, Apache-2.0): the browser's object, passed in as the viewer does. */
const freshFactory = (): IDBFactory => new FakeFactory() as unknown as IDBFactory;

/** Opens `name` at `version` on `factory`, runs `upgrade`, and closes it: a database some other code left behind. */
function seed(factory: IDBFactory, name: string, version: number, upgrade: (db: IDBDatabase) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = factory.open(name, version);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => { req.result.close(); resolve(); };
    req.onerror = () => reject(req.error);
  });
}

async function failureOf(p: Promise<unknown>): Promise<unknown> {
  return p.then(() => null, (e: unknown) => e);
}

/** Reads `key` through a second, raw connection to the card's database (what another tab would see). */
function rawGet(factory: IDBFactory, key: string, name = CARD_DB_NAME): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = factory.open(name);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const get = db.transaction(CARD_DB_STORE, 'readonly').objectStore(CARD_DB_STORE).get(key);
      get.onsuccess = () => { db.close(); resolve(get.result); };
      get.onerror = () => { db.close(); reject(get.error); };
    };
  });
}

/** A factory over `real` that records every connection it hands out. */
function recording(real: IDBFactory): { factory: IDBFactory; opened: IDBDatabase[]; opens: () => number } {
  const opened: IDBDatabase[] = [];
  let opens = 0;
  const factory = {
    open: (name: string, version?: number) => {
      opens++;
      const req = real.open(name, version);
      req.addEventListener('success', () => opened.push(req.result));
      return req;
    },
    deleteDatabase: (name: string) => real.deleteDatabase(name),
  } as unknown as IDBFactory;
  return { factory, opened, opens: () => opens };
}

/** A timer the test fires by hand: `IdbStore`'s injected open bound. */
function manualTimer(): { timer: OpenTimer; fire: () => void; armed: () => number } {
  const pending = new Set<() => void>();
  return {
    timer: (giveUp) => { pending.add(giveUp); return () => { pending.delete(giveUp); }; },
    fire: () => { const all = [...pending]; pending.clear(); for (const f of all) f(); },
    armed: () => pending.size,
  };
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 20));

describe('IdbStore: the ByteStore contract (fake-indexeddb)', () => {
  storeContract(() => new IdbStore(freshFactory()));
});

describe('IdbStore: the card survives its own connection', () => {
  it('a second store on the same database reads what the first wrote (a reload)', async () => {
    const factory = freshFactory();
    const image = pattern(8_650_752, 11);
    const first = new IdbStore(factory);
    await first.put('slot/1/image', image);
    first.close();
    const second = new IdbStore(factory);
    expect(sameBytes(await second.get('slot/1/image'), image)).toBe(true);
    expect(await second.keys()).toEqual(['slot/1/image']);
  });

  it('a value whose bytes cannot be copied (a detached buffer) refuses the batch whole, before it starts', async () => {
    const store = new IdbStore(freshFactory());
    await store.put('pointer', pattern(1, 1));
    const detached = new Uint8Array(8);
    structuredClone(detached.buffer, { transfer: [detached.buffer] });  // its bytes gone: copying it throws
    const failure = await failureOf(store.write([
      { put: 'pointer', value: pattern(1, 2) }, { put: 'gen/2/0', value: pattern(8, 2) }, { put: 'gen/2/1', value: detached },
    ]));
    expect(failure).toBeInstanceOf(StoreError);
    expect(failure).toMatchObject({ operation: 'write', key: 'gen/2/1' });
    expect(await store.keys()).toEqual(['pointer']);
    expect(sameBytes(await store.get('pointer'), pattern(1, 1))).toBe(true);
  });

  it('a batch whose third op throws inside the transaction is rolled back whole', async () => {
    const store = new IdbStore(freshFactory());
    await store.put('pointer', pattern(1, 1));
    const put = FakeObjectStore.prototype.put;
    const spy = vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(function (this: unknown, value: unknown, key?: unknown) {
      if (key === 'gen/2/1') throw new DOMException('injected', 'UnknownError');
      return put.call(this, value, key as IDBValidKey);
    });
    try {
      const failure = await failureOf(store.write([
        { put: 'pointer', value: pattern(1, 2) }, { put: 'gen/2/0', value: pattern(8, 2) }, { put: 'gen/2/1', value: pattern(8, 3) },
      ]));
      expect(failure).toBeInstanceOf(StoreError);
      expect(failure).toMatchObject({ operation: 'write' });
    } finally {
      spy.mockRestore();
    }
    expect(await store.keys()).toEqual(['pointer']);
    expect(sameBytes(await store.get('pointer'), pattern(1, 1))).toBe(true);
  });

  it('a write settles only once its transaction has committed or failed (not when its requests are issued)', async () => {
    const factory = freshFactory();
    const store = new IdbStore(factory);
    await store.put('k', Uint8Array.of(1));
    // A request that fails after it is issued (a ConstraintError: `add` over an existing key) aborts the transaction.
    const put = FakeObjectStore.prototype.put;
    const spy = vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: unknown) {
      return key === 'k' ? this.add(value, key as IDBValidKey) : put.call(this, value, key as IDBValidKey);
    });
    try {
      const failure = await failureOf(store.write([{ put: 'j', value: Uint8Array.of(2) }, { put: 'k', value: Uint8Array.of(3) }]));
      expect(failure).toBeInstanceOf(StoreError);
    } finally {
      spy.mockRestore();
    }
    expect(await rawGet(factory, 'j')).toBeUndefined();
    expect([...(await rawGet(factory, 'k') as Uint8Array)]).toEqual([1]);
    await store.write([{ put: 'j', value: Uint8Array.of(4) }, { put: 'k', value: Uint8Array.of(5) }]);
    expect([...(await rawGet(factory, 'j') as Uint8Array)]).toEqual([4]);
    expect([...(await rawGet(factory, 'k') as Uint8Array)]).toEqual([5]);
  });

  it('keeps two stores of different names apart', async () => {
    const factory = freshFactory();
    await new IdbStore(factory, { name: 'a' }).put('k', pattern(4, 1));
    expect(await new IdbStore(factory, { name: 'b' }).get('k')).toBeUndefined();
  });
});

describe('IdbStore: a throwing or absent store reads as an empty card; a failed write is reported', () => {
  it('no IndexedDB at all (a private window that refuses it): empty reads, a put rejects as unavailable', async () => {
    const heard: StoreError[] = [];
    const store = new IdbStore(undefined, { report: (e) => heard.push(e) });
    expect(await store.get('slot/0/image')).toBeUndefined();
    expect(await store.keys()).toEqual([]);
    const failure = await failureOf(store.put('slot/0/image', pattern(4)));
    expect(failure).toBeInstanceOf(StoreError);
    expect(failure).toMatchObject({ kind: 'unavailable', operation: 'open' });
    expect(heard.length).toBeGreaterThan(0);
    expect(heard.every((e) => e.kind === 'unavailable')).toBe(true);
  });

  it('opening throws: empty reads, a put rejects as unavailable, and the next call tries again', async () => {
    const real = freshFactory();
    let refuse = true;
    const factory = {
      open: (name: string, version?: number) => {
        if (refuse) throw new DOMException('denied', 'SecurityError');
        return real.open(name, version);
      },
    } as unknown as IDBFactory;
    const store = new IdbStore(factory);
    expect(await store.get('k')).toBeUndefined();
    expect(await failureOf(store.put('k', pattern(4)))).toMatchObject({ kind: 'unavailable', operation: 'open' });
    refuse = false;
    await store.put('k', pattern(4, 5));
    expect(sameBytes(await store.get('k'), pattern(4, 5))).toBe(true);
  });

  it('opening errors (a newer database than this code): empty reads, a put rejects as unavailable', async () => {
    const factory = freshFactory();
    await seed(factory, CARD_DB_NAME, 99, (db) => db.createObjectStore(CARD_DB_STORE));
    const store = new IdbStore(factory);
    expect(await store.get('k')).toBeUndefined();
    expect(await failureOf(store.put('k', pattern(4)))).toMatchObject({ kind: 'unavailable', operation: 'open' });
  });

  it('a get that throws (the database is there without its store): empty reads, the put rejects as failed', async () => {
    const factory = freshFactory();
    await seed(factory, CARD_DB_NAME, 1, () => undefined);
    const heard: StoreError[] = [];
    const store = new IdbStore(factory, { report: (e) => heard.push(e) });
    expect(await store.get('k')).toBeUndefined();
    expect(await store.keys()).toEqual([]);
    expect(heard.map((e) => e.operation)).toEqual(['get', 'list']);
    const failure = await failureOf(store.put('k', pattern(4)));
    expect(failure).toBeInstanceOf(StoreError);
    expect(failure).toMatchObject({ kind: 'failed', operation: 'write', key: 'k' });
  });

  it('a value of the wrong type under a key reads as nothing there, and is reported', async () => {
    const factory = freshFactory();
    await seed(factory, CARD_DB_NAME, 1, (db) => {
      db.createObjectStore(CARD_DB_STORE).put('a string, not bytes', 'k');
    });
    const heard: StoreError[] = [];
    const store = new IdbStore(factory, { report: (e) => heard.push(e) });
    expect(await store.get('k')).toBeUndefined();
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ operation: 'get', key: 'k', kind: 'failed' });
  });

  it('a precondition on a key holding a non-byte value is failed (corruption), not conflict (another tab)', async () => {
    const factory = freshFactory();
    await seed(factory, CARD_DB_NAME, 1, (db) => {
      db.createObjectStore(CARD_DB_STORE).put('a string, not bytes', 'pointer');
    });
    const store = new IdbStore(factory);
    const failure = await failureOf(store.write([{ put: 'x', value: pattern(2) }], [{ key: 'pointer', equals: Uint8Array.of(1) }]));
    expect(failure).toMatchObject({ kind: 'failed', operation: 'write', key: 'pointer' });
    expect(await store.keys()).toEqual(['pointer']);
  });

  it('estimates through the StorageManager it was given, and has none without one or when it throws', async () => {
    const quota = { estimate: async () => ({ usage: 1234, quota: 5_000_000 }) };
    expect(await new IdbStore(freshFactory(), { quota }).estimate()).toEqual({ usage: 1234, quota: 5_000_000 });
    expect(await new IdbStore(freshFactory()).estimate()).toBeUndefined();
    const broken = { estimate: async () => { throw new Error('no'); } };
    expect(await new IdbStore(freshFactory(), { quota: broken }).estimate()).toBeUndefined();
    const partial = { estimate: async () => ({ usage: 10 }) };
    expect(await new IdbStore(freshFactory(), { quota: partial }).estimate()).toBeUndefined();
  });
});

describe('IdbStore: the connection -- bounded opening, no stale handler, no leak', () => {
  it('an opening that never ends (a pending delete held up by another connection) is given up at the bound', async () => {
    const factory = freshFactory();
    await seed(factory, CARD_DB_NAME, 1, (db) => db.createObjectStore(CARD_DB_STORE));
    const holder = await new Promise<IDBDatabase>((resolve) => {
      const r = factory.open(CARD_DB_NAME); r.onsuccess = () => resolve(r.result);
    });                                                     // never answers versionchange: the delete waits on it
    factory.deleteDatabase(CARD_DB_NAME);
    const t = manualTimer();
    const heard: StoreError[] = [];
    const store = new IdbStore(factory, { openTimer: t.timer, report: (e) => heard.push(e) });
    const read = store.read('k');
    const put = failureOf(store.put('k', pattern(4)));
    await settle();
    expect(t.armed()).toBe(1);                              // one opening, shared, still waiting
    t.fire();
    const r = await read;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ kind: 'unavailable', operation: 'open' });
    expect(await put).toMatchObject({ kind: 'unavailable', operation: 'open' });
    holder.close();
  });

  it('a connection that arrives after its opening was given up is closed, not leaked', async () => {
    const rec = recording(freshFactory());
    const t = manualTimer();
    const closes = vi.spyOn(FakeDatabase.prototype, 'close');
    try {
      const store = new IdbStore(rec.factory, { openTimer: t.timer });
      const read = store.read('k');
      t.fire();                                             // given up before the request's success
      expect((await read).ok).toBe(false);
      await settle();
      expect(rec.opened).toHaveLength(1);
      expect(closes.mock.contexts).toContain(rec.opened[0]);
      expect((await store.read('k')).ok).toBe(true);        // the next call opens afresh
      expect(rec.opens()).toBe(2);
    } finally {
      closes.mockRestore();
    }
  });

  it('the bound is cancelled once the opening succeeds', async () => {
    const t = manualTimer();
    const store = new IdbStore(freshFactory(), { openTimer: t.timer });
    expect((await store.read('k')).ok).toBe(true);
    expect(t.armed()).toBe(0);
    t.fire();
    expect((await store.read('k')).ok).toBe(true);
  });

  it('an old connection\'s close or versionchange does not drop the current one', async () => {
    const rec = recording(freshFactory());
    const store = new IdbStore(rec.factory);
    await store.get('k');
    store.close();
    await store.get('k');
    expect(rec.opens()).toBe(2);
    const [old, current] = rec.opened as [IDBDatabase, IDBDatabase];
    old.onclose?.call(old, new Event('close'));
    old.onversionchange?.call(old, new Event('versionchange') as IDBVersionChangeEvent);
    await store.get('k');
    expect(rec.opens()).toBe(2);                            // still on the current connection
    current.onversionchange?.call(current, new Event('versionchange') as IDBVersionChangeEvent);
    await store.get('k');
    expect(rec.opens()).toBe(3);                            // its own versionchange does drop it
  });
});

describe('classifyFailure', () => {
  it('names a quota refusal by the legacy codes too (old Safari\'s 22, Firefox\'s 1014)', () => {
    expect(classifyFailure({ name: 'Error', code: 22 })).toBe('quota');
    expect(classifyFailure({ name: 'NS_ERROR_DOM_QUOTA_REACHED', code: 1014 })).toBe('quota');
    expect(classifyFailure({ code: 1014 })).toBe('quota');
    expect(classifyFailure({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe('quota');
    expect(classifyFailure({ name: 'Error', code: 18 })).toBe('failed');
  });

  it('names a quota refusal, a refused store, and everything else', () => {
    expect(classifyFailure(new DOMException('full', 'QuotaExceededError'))).toBe('quota');
    expect(classifyFailure({ name: 'QuotaExceededError' })).toBe('quota');
    expect(classifyFailure(new DOMException('denied', 'SecurityError'))).toBe('unavailable');
    expect(classifyFailure(new DOMException('gone', 'InvalidStateError'))).toBe('unavailable');
    expect(classifyFailure(new Error('other'))).toBe('failed');
    expect(classifyFailure(null)).toBe('failed');
  });
});
