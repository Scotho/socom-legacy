import { IDBFactory as FakeFactory, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { READ_SET_VERSION } from '@s2u/archive';
import { copyDirName } from '../src/discCopy';
import { extractionState, openExtractedSource, type DiscExtractRecord, type ExtractEnv } from '../src/discExtract';
import { openOpfsStream } from '../src/discExtractProtocol';
import { EXTRACT_ROOT, EXTRACT_STREAM_BLOCK, idbExtractStore, opfsExtractStore } from '../src/discExtractStore';
import { openStreamedFile } from '../src/discStreamWrite';
import { DISC_EXTRACT_SLOT, openPageRecords, type RecordStore } from '../src/pageStore';
import { FakeOpfs, FakeStorage, anyOpen, fakeWorker, filler, type WorkerLog } from './discExtractFakes';

/**
 * DSH-2 (disc-share plan `docs/plans/2026-10-18-disc-share.md`, DSH.R4): the extraction store for a 1 GB device -- a
 * file taken as a stream of fixed-size blocks, never held whole: the IndexedDB fallback one record a block, read back
 * by byte range across blocks; the OPFS worker writing at an offset without truncating a resumed file; a resume carried
 * on from the last stored block with its SHA-256 rebuilt by re-reading the stored part; one writer API
 * (`openStreamedFile`) over both. A browser adaptation (OT.R53, the product track): nothing of the game; the bytes are
 * made here. The OPFS, the storage manager and the worker are DX-1's fakes; the IndexedDB is fake-indexeddb's.
 */

const IDENTITY = { boot: 'SCUS_972.75', ver: '1.02', vmode: 'NTSC' };
const DIR = copyDirName(IDENTITY);
const BLOCK = 1000;
const SIZE = 4_500;                       // four whole blocks and a half
const BYTES = filler(SIZE, 7);
const sha = async (b: Uint8Array): Promise<string> =>
  Buffer.from(await crypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>)).toString('hex');
/** `bytes` in messages of `n` (the transfer's 16-64 KiB, scaled down), none aligned to a block. */
const messages = (bytes: Uint8Array, n = 333, from = 0): Uint8Array[] => {
  const out: Uint8Array[] = [];
  for (let at = from; at < bytes.length; at += n) out.push(bytes.slice(at, Math.min(at + n, bytes.length)));
  return out;
};

let fs: FakeOpfs;
let storage: FakeStorage;
let idb: IDBFactory;
let records: RecordStore;
let workers: WorkerLog;
let setup: ExtractEnv & { block: number };
beforeEach(() => {
  fs = new FakeOpfs();
  storage = new FakeStorage(fs);
  idb = new FakeFactory() as unknown as IDBFactory;
  records = openPageRecords(() => idb, () => undefined);
  workers = { count: 0, terminated: 0, files: 0 };
  setup = { storage, idb: () => idb, records, worker: () => fakeWorker(workers, fs), block: BLOCK, now: () => 1_760_000_000_000 };
});
afterEach(() => { vi.restoreAllMocks(); });

/** Every value the IndexedDB double is asked to put, its size (a `Blob`'s) in order: the instrument for bytes held. */
function instrumentPuts(): number[] {
  const sizes: number[] = [];
  const put = FakeObjectStore.prototype.put;
  vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
    if (value instanceof Blob) sizes.push(value.size);
    return put.call(this, value, key);
  });
  return sizes;
}

describe('the IndexedDB store: a file as a stream of blocks', () => {
  it('a multi-block file streamed in and read back by ranges that cross block boundaries', async () => {
    const store = idbExtractStore(() => idb, DIR);
    const s = await store.stream('RUN/SOUNDS/VAGSTORE.ZAR', SIZE, { block: BLOCK });
    expect(s.stored).toBe(0);
    for (const m of messages(BYTES)) await s.write(m);
    expect(await s.finish()).toEqual({ bytes: SIZE, sha256: await sha(BYTES) });

    expect(await store.size('RUN/SOUNDS/VAGSTORE.ZAR')).toBe(SIZE);
    expect(await store.has('RUN/SOUNDS/VAGSTORE.ZAR')).toBe(true);
    for (const [at, n] of [[0, 1], [990, 30], [999, 1002], [1999, 2003], [4000, 500], [0, SIZE], [4499, 1], [2500, 0]] as const) {
      expect(await store.range('RUN/SOUNDS/VAGSTORE.ZAR', at, n), `${n} at ${at}`).toEqual(BYTES.subarray(at, at + n));
    }
    await expect(store.range('RUN/SOUNDS/VAGSTORE.ZAR', 4000, 501)).rejects.toMatchObject({ name: 'ExtractStoreError' });
    const blob = await store.file('RUN/SOUNDS/VAGSTORE.ZAR');
    expect(blob.size).toBe(SIZE);
    expect(new Uint8Array(await blob.slice(1990, 3010).arrayBuffer())).toEqual(BYTES.subarray(1990, 3010));
  });

  it('holds about one block: no value put is larger than a block, and what is written but not put never passes one', async () => {
    const puts = instrumentPuts();
    const store = idbExtractStore(() => idb, DIR);
    const s = await store.stream('RUN/SOUNDS/VAGSTORE.ZAR', SIZE, { block: BLOCK });
    let written = 0;
    for (const m of messages(BYTES, 777)) {
      await s.write(m);
      written += m.length;
      const flushed = puts.reduce((n, x) => n + x, 0);
      expect(written - flushed).toBeLessThan(BLOCK);
    }
    await s.finish();
    expect(Math.max(...puts)).toBeLessThanOrEqual(BLOCK);
    expect(puts.reduce((n, x) => n + x, 0)).toBe(SIZE);
    expect(puts).toHaveLength(Math.ceil(SIZE / BLOCK));
  });

  it('write() of a ReadableStream is stored a block at a time, never gathered into one Blob', async () => {
    const puts = instrumentPuts();
    const store = idbExtractStore(() => idb, DIR);
    const big = filler(3 * EXTRACT_STREAM_BLOCK + 5, 3);
    const parts = messages(big, 1 << 20);
    const stream = new ReadableStream<Uint8Array>({ start(c) { for (const p of parts) c.enqueue(p); c.close(); } });
    expect(await store.write('RUN/MP2.ZDB', stream)).toBe(big.length);
    expect(Math.max(...puts)).toBeLessThanOrEqual(EXTRACT_STREAM_BLOCK);
    expect(await store.size('RUN/MP2.ZDB')).toBe(big.length);
    expect(await store.range('RUN/MP2.ZDB', EXTRACT_STREAM_BLOCK - 3, 7)).toEqual(big.subarray(EXTRACT_STREAM_BLOCK - 3, EXTRACT_STREAM_BLOCK + 4));
  });

  it('a resume after an abort mid-file carries on from the last stored block, with the same SHA-256', async () => {
    const store = idbExtractStore(() => idb, DIR);
    const first = await store.stream('RUN/SOUNDS/VAGSTORE.ZAR', SIZE, { block: BLOCK });
    await first.write(BYTES.subarray(0, 2_600));          // two blocks stored, 600 bytes held
    await first.abort();
    expect(await store.size('RUN/SOUNDS/VAGSTORE.ZAR')).toBe(2 * BLOCK);   // a partial file: not its recorded size

    const puts = instrumentPuts();
    const again = await store.stream('RUN/SOUNDS/VAGSTORE.ZAR', SIZE, { block: BLOCK });
    expect(again.stored).toBe(2 * BLOCK);
    for (const m of messages(BYTES, 333, again.stored)) await again.write(m);
    expect(await again.finish()).toEqual({ bytes: SIZE, sha256: await sha(BYTES) });
    expect(puts.reduce((n, x) => n + x, 0)).toBe(SIZE - 2 * BLOCK);          // the stored blocks are not written again
    expect(new Uint8Array(await (await store.file('RUN/SOUNDS/VAGSTORE.ZAR')).arrayBuffer())).toEqual(BYTES);
  });

  it('a file stored whole is resumed as done; a block size changed starts again; too many bytes are refused', async () => {
    const store = idbExtractStore(() => idb, DIR);
    const s = await store.stream('X', SIZE, { block: BLOCK });
    for (const m of messages(BYTES)) await s.write(m);
    await s.finish();
    const done = await store.stream('X', SIZE, { block: BLOCK });
    expect(done.stored).toBe(SIZE);
    expect(await done.finish()).toEqual({ bytes: SIZE, sha256: await sha(BYTES) });

    const part = await store.stream('Y', SIZE, { block: BLOCK });
    await part.write(BYTES.subarray(0, 2_000));
    await part.abort();
    expect((await store.stream('Y', SIZE, { block: 500 })).stored).toBe(0);
    expect(await store.size('Y')).toBeNull();                   // what was stored at another block is gone

    const over = await store.stream('Z', 10, { block: BLOCK });
    await expect(over.write(filler(11, 1))).rejects.toMatchObject({ name: 'ExtractStoreError' });
    const short = await store.stream('W', 10, { block: BLOCK });
    await short.write(filler(9, 1));
    await expect(short.finish()).rejects.toMatchObject({ name: 'ExtractStoreError' });
  });

  it('the whole-file path is unchanged: a Blob is one record, and replaces a streamed file with its blocks', async () => {
    const store = idbExtractStore(() => idb, DIR);
    const s = await store.stream('RUN/MP2.ZDB', SIZE, { block: BLOCK });
    for (const m of messages(BYTES)) await s.write(m);
    await s.finish();
    const puts = instrumentPuts();
    const small = filler(1234, 9);
    expect(await store.write('RUN/MP2.ZDB', new Blob([small]))).toBe(1234);
    expect(puts).toEqual([1234]);
    expect(await store.size('RUN/MP2.ZDB')).toBe(1234);
    expect(new Uint8Array(await (await store.file('RUN/MP2.ZDB')).arrayBuffer())).toEqual(small);
    expect(await store.range('RUN/MP2.ZDB', 1000, 234)).toEqual(small.subarray(1000));
    await store.remove();
    expect(await store.has('RUN/MP2.ZDB')).toBe(false);
    // Nothing of the identity is left: no block record outlives its file.
    const left = await new Promise<number>((resolve) => {
      const open = idb.open('s2u.disc.extract');
      open.onsuccess = () => {
        const r = open.result.transaction('files', 'readonly').objectStore('files').count();
        r.onsuccess = () => { open.result.close(); resolve(r.result); };
      };
    });
    expect(left).toBe(0);
  });
});

describe('the OPFS worker: a file written at an offset, a resumed file never truncated', () => {
  const target = (path = 'RUN/SOUNDS/VAGSTORE.ZAR') => opfsExtractStore(async () => fs.root, DIR).target(path);
  const stored = (path = 'RUN/SOUNDS/VAGSTORE.ZAR'): Uint8Array | undefined => fs.files().get(`${EXTRACT_ROOT}/${DIR}/${path}`);

  it('streams a multi-block file in and its digest is the whole file\'s', async () => {
    const s = await openOpfsStream(await target(), SIZE, BLOCK);
    expect(s.stored).toBe(0);
    for (const m of messages(BYTES)) await s.write(m);
    expect(await s.finish()).toEqual({ bytes: SIZE, sha256: await sha(BYTES) });
    expect(stored()).toEqual(BYTES);
    expect(anyOpen(fs.root)).toBe(false);
    const store = opfsExtractStore(async () => fs.root, DIR);
    expect(await store.range('RUN/SOUNDS/VAGSTORE.ZAR', 999, 1002)).toEqual(BYTES.subarray(999, 2001));
  });

  it('a resume keeps the stored blocks (no truncation, no rewrite), trims only a tail past the last block', async () => {
    const first = await openOpfsStream(await target(), SIZE, BLOCK);
    await first.write(BYTES.subarray(0, 2_600));
    await first.abort();
    expect(stored()).toEqual(BYTES.subarray(0, 2_600));       // what was written stays; the handle is closed
    expect(anyOpen(fs.root)).toBe(false);

    const before = fs.written;
    const again = await openOpfsStream(await target(), SIZE, BLOCK);
    expect(again.stored).toBe(2 * BLOCK);
    expect(stored()).toEqual(BYTES.subarray(0, 2 * BLOCK));   // the tail past the last flushed block is trimmed, no more
    for (const m of messages(BYTES, 333, again.stored)) await again.write(m);
    expect(await again.finish()).toEqual({ bytes: SIZE, sha256: await sha(BYTES) });
    expect(fs.written - before).toBe(SIZE - 2 * BLOCK);         // the stored blocks were not written again
    expect(stored()).toEqual(BYTES);
  });

  it('the worker serves open, write, finish and abort; a whole file is refused while a stream is open', async () => {
    const replies: unknown[] = [];
    let next!: (r: unknown) => void;
    const { serveDiscExtract } = await import('../src/discExtractProtocol');
    const port = { onmessage: null as ((e: MessageEvent) => void) | null, postMessage: (r: unknown) => { replies.push(r); next(r); } };
    serveDiscExtract(port as never, (dir, path) => opfsExtractStore(async () => fs.root, dir).target(path), () => true);
    const send = (command: unknown): Promise<unknown> => new Promise((resolve) => { next = resolve; port.onmessage!({ data: command } as MessageEvent); });
    expect(await send({ kind: 'open', dir: DIR, path: 'RUN/MP2.ZDB', size: SIZE, block: BLOCK })).toEqual({ kind: 'opened', stored: 0 });
    expect(await send({ kind: 'file', dir: DIR, path: 'RUN/X', blob: new Blob(['x']), chunk: 4 })).toMatchObject({ kind: 'error' });
    expect(await send({ kind: 'write', bytes: BYTES.subarray(0, 1_500) })).toEqual({ kind: 'wrote', stored: 1_500 });
    expect(await send({ kind: 'abort' })).toEqual({ kind: 'aborted' });
    expect(await send({ kind: 'write', bytes: BYTES.subarray(0, 1) })).toMatchObject({ kind: 'error' });
    expect(await send({ kind: 'open', dir: DIR, path: 'RUN/MP2.ZDB', size: SIZE, block: BLOCK })).toEqual({ kind: 'opened', stored: BLOCK });
    expect(await send({ kind: 'write', bytes: BYTES.subarray(BLOCK) })).toEqual({ kind: 'wrote', stored: SIZE });
    expect(await send({ kind: 'finish' })).toEqual({ kind: 'finished', bytes: SIZE, sha256: await sha(BYTES) });
    expect(anyOpen(fs.root)).toBe(false);
  });
});

describe('openStreamedFile: the one writer the transfer calls', () => {
  /** A record of `paths`, every file done, in `./discExtractRecord`'s form, as the transfer will write it. */
  const record = (backend: 'opfs' | 'indexeddb', files: { path: string; bytes: Uint8Array; sha256: string }[]): DiscExtractRecord => ({
    v: 1, readSet: READ_SET_VERSION, identity: { ...IDENTITY }, backend, dir: DIR,
    files: files.map((f) => ({ path: f.path, size: f.bytes.length, sha256: f.sha256, done: true })),
    total: files.reduce((n, f) => n + f.bytes.length, 0), persisted: true, started: 1, when: 2,
  });

  for (const backend of ['opfs', 'indexeddb'] as const) {
    it(`${backend}: picks the backend, resumes mid-file with the same SHA-256, and START reads it as a local extraction`, async () => {
      const env = backend === 'opfs' ? setup : { ...setup, storage: null };
      const first = await openStreamedFile(IDENTITY, 'RUN/SOUNDS/VAGSTORE.ZAR', SIZE, env);
      expect(first.backend).toBe(backend);
      expect(first.storedBytes).toBe(0);
      for (const m of messages(BYTES.subarray(0, 3_100))) await first.write(m);
      await first.abort();

      const again = await openStreamedFile(IDENTITY, 'RUN/SOUNDS/VAGSTORE.ZAR', SIZE, env);
      expect(again.backend).toBe(backend);
      expect(again.storedBytes).toBe(3 * BLOCK);
      for (const m of messages(BYTES, 333, again.storedBytes)) await again.write(m);
      const digest = await again.finish();
      expect(digest).toEqual({ bytes: SIZE, sha256: await sha(BYTES) });

      const small = filler(777, 4);
      const other = await openStreamedFile(IDENTITY, 'RUN/MP2.ZDB', small.length, env);
      await other.write(small);
      const otherDigest = await other.finish();

      await records.put(DISC_EXTRACT_SLOT, record(backend, [
        { path: 'RUN/SOUNDS/VAGSTORE.ZAR', bytes: BYTES, sha256: digest.sha256 },
        { path: 'RUN/MP2.ZDB', bytes: small, sha256: otherDigest.sha256 },
      ]));
      expect(await extractionState(env)).toBe('whole');
      const source = (await openExtractedSource(env))!;
      expect(await source.readRange('RUN/SOUNDS/VAGSTORE.ZAR', 1_990, 1_020)).toEqual(BYTES.subarray(1_990, 3_010));
      expect(await source.read('run/mp2.zdb')).toEqual(small);
      if (backend === 'opfs') {
        expect(workers.terminated).toBe(workers.count);           // every file's worker closed
        expect(anyOpen(fs.root)).toBe(false);
      }
    });
  }

  it('the backend asked for (the record\'s) is kept: IndexedDB beside a working OPFS', async () => {
    const f = await openStreamedFile(IDENTITY, 'RUN/MP2.ZDB', 10, { ...setup, backend: 'indexeddb' });
    expect(f.backend).toBe('indexeddb');
    await f.write(filler(10, 1));
    await f.finish();
    expect(workers.count).toBe(0);
  });
});
