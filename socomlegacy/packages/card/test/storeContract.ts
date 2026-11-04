import { expect, it } from 'vitest';
import { StoreError, type ByteStore } from '../src/index';

/** The size of one slot's raw `.ps2` image with ECC: 16,384 pages x (512 + 16) B (PLAT-25's block, mymcplus L42-44, L598). */
export const PS2_IMAGE_BYTES = 8_650_752;

/** A deterministic, non-periodic fill, so a dropped, doubled or shifted chunk cannot compare equal. */
export function pattern(length: number, seed = 1): Uint8Array {
  const out = new Uint8Array(length);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < length; i++) {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    out[i] = x & 0xff;
  }
  return out;
}

export function sameBytes(a: Uint8Array | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.byteLength) return false;
  return Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength));
}

/** What every `ByteStore` backend promises, run against each (the in-memory store and the IndexedDB one). */
export function storeContract(make: () => ByteStore | Promise<ByteStore>): void {
  it('an empty store reads as an empty card: no value, no keys', async () => {
    const store = await make();
    expect(await store.get('slot/0')).toBeUndefined();
    expect(await store.keys()).toEqual([]);
    expect(await store.read('slot/0')).toEqual({ ok: true, value: undefined });
  });

  it('read tells a value from nothing there', async () => {
    const store = await make();
    await store.put('k', pattern(3, 4));
    const r = await store.read('k');
    expect(r.ok).toBe(true);
    if (r.ok) expect(sameBytes(r.value, pattern(3, 4))).toBe(true);
  });

  it('round-trips a binary value of 8,650,752 bytes byte-equal (one raw .ps2 image)', async () => {
    const store = await make();
    const image = pattern(PS2_IMAGE_BYTES, 7);
    await store.put('slot/0/image', image);
    const back = await store.get('slot/0/image');
    expect(back).toBeInstanceOf(Uint8Array);
    expect(back!.byteLength).toBe(PS2_IMAGE_BYTES);
    expect(sameBytes(back, image)).toBe(true);
  });

  it('keeps what was put, not a view the caller goes on changing; and keeps only the view, not its whole buffer', async () => {
    const store = await make();
    const whole = pattern(64, 3);
    const view = whole.subarray(16, 32);
    await store.put('k', view);
    const kept = view.slice();
    view.fill(0);
    const back = await store.get('k');
    expect(sameBytes(back, kept)).toBe(true);
    back!.fill(9);
    expect(sameBytes(await store.get('k'), kept)).toBe(true);
  });

  it('lists keys sorted, by prefix, and deletes', async () => {
    const store = await make();
    await store.put('slot/1/b', pattern(4));
    await store.put('slot/0/a', pattern(4));
    await store.put('slot/0/b', pattern(4));
    expect(await store.keys()).toEqual(['slot/0/a', 'slot/0/b', 'slot/1/b']);
    expect(await store.keys('slot/0/')).toEqual(['slot/0/a', 'slot/0/b']);
    await store.delete('slot/0/a');
    expect(await store.get('slot/0/a')).toBeUndefined();
    expect(await store.keys('slot/0/')).toEqual(['slot/0/b']);
    await store.delete('never/there');                     // deleting nothing is no failure
  });

  it('writes a batch whole: puts and deletes land together', async () => {
    const store = await make();
    await store.put('old', pattern(8, 1));
    await store.write([{ put: 'gen/2/0', value: pattern(8, 2) }, { put: 'pointer', value: pattern(1, 2) }, { delete: 'old' }]);
    expect(await store.keys()).toEqual(['gen/2/0', 'pointer']);
    expect(sameBytes(await store.get('gen/2/0'), pattern(8, 2))).toBe(true);
  });

  it('refuses a batch with a bad key whole: nothing of it lands, and the failure is a StoreError', async () => {
    const store = await make();
    await store.put('pointer', pattern(1, 1));
    const bad = [{ put: 'pointer', value: pattern(1, 2) }, { put: undefined as unknown as string, value: pattern(1, 3) }];
    const failure = await store.write(bad).then(() => null, (e: unknown) => e);
    expect(failure).toBeInstanceOf(StoreError);
    expect(sameBytes(await store.get('pointer'), pattern(1, 1))).toBe(true);
  });

  it('keeps the bytes as they were at the call, though the caller changes them before the write settles', async () => {
    const store = await make();
    await store.get('warm');                                // the database already open, as in a page
    const buf = Uint8Array.of(1, 2, 3, 4);
    const p = store.put('k', buf);
    buf.fill(0);
    await p;
    expect([...(await store.get('k'))!]).toEqual([1, 2, 3, 4]);
    const chunk = Uint8Array.of(5, 6);
    const w = store.write([{ put: 'gen/1/0', value: chunk }], [{ key: 'pointer', absent: true }]);
    chunk.fill(0);
    await w;
    expect([...(await store.get('gen/1/0'))!]).toEqual([5, 6]);
  });

  it('a conditional write lands only when its preconditions hold, checked in the same transaction', async () => {
    const store = await make();
    await store.write([{ put: 'pointer', value: Uint8Array.of(1) }], [{ key: 'pointer', absent: true }]);
    expect([...(await store.get('pointer'))!]).toEqual([1]);
    await store.write([{ put: 'pointer', value: Uint8Array.of(2) }, { put: 'gen/2/0', value: pattern(4) }],
      [{ key: 'pointer', equals: Uint8Array.of(1) }]);
    expect([...(await store.get('pointer'))!]).toEqual([2]);
  });

  it('a conditional write whose precondition fails is refused whole, as a conflict naming the key', async () => {
    const store = await make();
    await store.put('pointer', Uint8Array.of(2));
    const absent = await store.write([{ put: 'x', value: pattern(4) }], [{ key: 'pointer', absent: true }]).then(() => null, (e: unknown) => e);
    expect(absent).toBeInstanceOf(StoreError);
    expect(absent).toMatchObject({ kind: 'conflict', operation: 'write', key: 'pointer' });
    const stale = await store.write([{ put: 'pointer', value: Uint8Array.of(3) }, { put: 'y', value: pattern(4) }],
      [{ key: 'pointer', equals: Uint8Array.of(1) }]).then(() => null, (e: unknown) => e);
    expect(stale).toMatchObject({ kind: 'conflict', key: 'pointer' });
    const longer = await store.write([{ put: 'z', value: pattern(4) }], [{ key: 'pointer', equals: Uint8Array.of(2, 0) }])
      .then(() => null, (e: unknown) => e);
    expect(longer).toMatchObject({ kind: 'conflict' });
    const missing = await store.write([{ put: 'z', value: pattern(4) }], [{ key: 'nothing', equals: Uint8Array.of(2) }])
      .then(() => null, (e: unknown) => e);
    expect(missing).toMatchObject({ kind: 'conflict', key: 'nothing' });
    expect(await store.keys()).toEqual(['pointer']);
    expect([...(await store.get('pointer'))!]).toEqual([2]);
  });

  it('readMany reads several keys in one transaction, in order, nothing there as undefined', async () => {
    const store = await make();
    await store.write([{ put: 'a', value: Uint8Array.of(1) }, { put: 'c', value: Uint8Array.of(3) }]);
    const r = await store.readMany(['c', 'b', 'a']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.map((v) => (v ? [...v] : v))).toEqual([[3], undefined, [1]]);
    expect(await store.readMany([])).toEqual({ ok: true, value: [] });
  });

  it('readMany never half-sees a batch written beside it (the pointer and its chunks)', async () => {
    const store = await make();
    const keys = ['pointer', ...Array.from({ length: 8 }, (_, i) => `gen/${i}`)];
    await store.write(keys.map((k) => ({ put: k, value: Uint8Array.of(1) })));
    await store.get('warm');
    for (let round = 2; round < 6; round++) {
      const read = store.readMany(keys);                   // started first ...
      const write = store.write(keys.map((k) => ({ put: k, value: Uint8Array.of(round) })));  // ... the batch beside it
      const r = await read;
      await write;
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const seen = new Set(r.value.map((v) => v![0]));
      expect(seen.size, `round ${round}: ${[...seen]}`).toBe(1);
    }
  });
}
