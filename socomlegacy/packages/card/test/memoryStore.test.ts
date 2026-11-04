import { describe, expect, it } from 'vitest';
import { MemoryStore, StoreError } from '../src/index';
import { pattern, sameBytes, storeContract } from './storeContract';

describe('MemoryStore: the ByteStore contract', () => {
  storeContract(() => new MemoryStore());
});

describe('MemoryStore: failures, injected', () => {
  it('a get that throws reads as an empty card, and the failure goes to the reporter', async () => {
    const heard: StoreError[] = [];
    const store = new MemoryStore({ fail: (op) => (op === 'get' || op === 'list' ? new Error('disk on fire') : undefined), report: (e) => heard.push(e) });
    await store.put('slot/0', pattern(4));
    expect(await store.get('slot/0')).toBeUndefined();
    expect(await store.keys()).toEqual([]);
    expect(heard.map((e) => [e.operation, e.kind])).toEqual([['get', 'failed'], ['list', 'failed']]);
    const r = await store.read('slot/0');                      // read says why, for a caller that must know
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ operation: 'get', key: 'slot/0', kind: 'failed' });
  });

  it('a put that throws is reported, not silent: the promise rejects with a typed StoreError', async () => {
    const store = new MemoryStore({ fail: (op) => (op === 'write' ? new Error('no') : undefined) });
    const failure = await store.put('slot/0', pattern(4)).then(() => null, (e: unknown) => e);
    expect(failure).toBeInstanceOf(StoreError);
    expect(failure).toMatchObject({ kind: 'failed', operation: 'write', key: 'slot/0' });
    expect((failure as StoreError).cause).toBeInstanceOf(Error);
  });

  it('a fault on the second op of a batch leaves the store as it was (the interrupted write PLAT-25 needs)', async () => {
    const store = new MemoryStore({ fail: (op, key) => (op === 'write' && key === 'pointer' ? new Error('killed') : undefined) });
    await store.write([{ put: 'gen/1/0', value: pattern(8, 1) }]);
    const failure = await store.write([{ put: 'gen/2/0', value: pattern(8, 2) }, { put: 'pointer', value: pattern(1) }])
      .then(() => null, (e: unknown) => e);
    expect(failure).toBeInstanceOf(StoreError);
    expect(await store.keys()).toEqual(['gen/1/0']);
  });

  it('refuses a write past its quota whole, as a quota failure, and estimates usage', async () => {
    const store = new MemoryStore({ quota: 100 });
    await store.put('a', pattern(60));
    expect(await store.estimate()).toEqual({ usage: 60, quota: 100 });
    const failure = await store.put('b', pattern(41)).then(() => null, (e: unknown) => e);
    expect(failure).toMatchObject({ kind: 'quota', operation: 'write', key: 'b' });
    await store.put('a', pattern(100, 2));                  // a replacement counts once
    expect(sameBytes(await store.get('a'), pattern(100, 2))).toBe(true);
    expect(await store.estimate()).toEqual({ usage: 100, quota: 100 });
  });

  it('has no estimate without a quota', async () => {
    expect(await new MemoryStore().estimate()).toBeUndefined();
  });

  it('a precondition on a key holding a non-byte value is failed (corruption), not conflict', async () => {
    const store = new MemoryStore();
    (store as unknown as { data: Map<string, unknown> }).data.set('pointer', 'not bytes');   // only corruption puts it there
    const failure = await store.write([{ put: 'x', value: pattern(2) }], [{ key: 'pointer', absent: true }]).then(() => null, (e: unknown) => e);
    expect(failure).toMatchObject({ kind: 'failed', operation: 'write', key: 'pointer' });
  });
});
