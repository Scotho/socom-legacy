import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_ARCHIVES } from '@s2u/archive';
import {
  SHARE_BUSY_MS_ADAPTATION, SHARE_CHUNK_BYTES_ADAPTATION, SHARE_IDLE_MS_ADAPTATION, SHARE_LOCAL_MAX_MS_ADAPTATION, ShareProtocolError, fitsReadSet, manifestOf, manifestTotal,
  readManifest, receiveFiles, sendFiles,
} from '../src/discShareProtocol';
import { SHARE_IDLE, SHARE_LOCAL_STUCK, SHARE_NOT_READ_SET, SHARE_OTHER_STOPPED } from '../src/discShareWords';
import { IDENTITY, bytesOf, files, pipes, sha, source, store, syntheticSet } from './discShareFakes';

/**
 * DSH-4 (the disc share plan's DSH-4 and DSH-8 rows): the transfer's protocol over two fake ends -- the manifest first
 * (identity, and each file's path, size and SHA-256 from the sender's kept record), then the files in 16-64 KiB messages
 * paced on the channel's buffer, then 'done'; a resume after a drop from the receiver's stored bytes; each file's hash
 * checked on arrival; the record committed only once every file matches. Synthetic bytes only, never disc data. A
 * browser adaptation, product track.
 */

const READ_SET = 3;

describe('DSH-4: the manifest', () => {
  it('is the kept record\'s identity, read set and files (path, size, SHA-256); its total is their sum', () => {
    const src = source(files(10, 20));
    const m = manifestOf(src.record);
    expect(m).toEqual({
      t: 'manifest', v: 1, readSet: READ_SET, identity: IDENTITY,
      files: src.record.files.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 })),
    });
    expect(manifestTotal(m)).toBe(30);
    expect(readManifest(JSON.stringify(m))).toEqual(m);
  });

  it('a record not whole is no manifest; a malformed one is refused on reading', () => {
    const src = source(files(10));
    expect(() => manifestOf({ ...src.record, when: null })).toThrow(ShareProtocolError);
    expect(() => manifestOf({ ...src.record, files: [{ ...src.record.files[0]!, done: false }] })).toThrow(ShareProtocolError);
    const m = manifestOf(src.record);
    for (const bad of [
      { ...m, v: 2 }, { ...m, files: [] }, { ...m, files: [{ path: '../x', size: 1, sha256: 'a'.repeat(64) }] },
      { ...m, files: [{ path: 'RUN/A', size: -1, sha256: 'a'.repeat(64) }] }, { ...m, files: [{ path: 'RUN/A', size: 1, sha256: 'xyz' }] },
      { ...m, identity: {} },
    ]) expect(readManifest(JSON.stringify(bad))).toBeNull();
    expect(readManifest('not json')).toBeNull();
  });

  it('the chunk is within 16-64 KiB', () => {
    expect(SHARE_CHUNK_BYTES_ADAPTATION).toBeGreaterThanOrEqual(16 * 1024);
    expect(SHARE_CHUNK_BYTES_ADAPTATION).toBeLessThanOrEqual(64 * 1024);
  });
});

describe('DSH-4: a transfer across two fake ends', () => {
  it('manifest, then the files, then done: the bytes and hashes arrive, the record committed once, after all', async () => {
    const fs = files(200_000, 70_001, 0, 64 * 1024);
    const src = source(fs, READ_SET);
    const st = store();
    const { a, b } = pipes();
    const sent: number[] = [];
    let commitsAtLastProgress = -1;
    const [done, rec] = await Promise.all([
      sendFiles(a, src, { onProgress: (n) => { sent.push(n); } }),
      receiveFiles(b, st, { readSet: READ_SET, isReadSet: syntheticSet, onProgress: () => { commitsAtLastProgress = st.commits.length; } }),
    ]);
    expect(done).toBeUndefined();
    expect(JSON.parse(a.sent[0] as string)).toMatchObject({ t: 'manifest' });
    expect(JSON.parse(b.sent.at(-1) as string)).toEqual({ t: 'done' });
    for (const f of fs) expect(sha(st.stored.get(f.path)!)).toBe(sha(f.data));
    expect(st.prepared).toBe(1);
    expect(st.commits).toHaveLength(1);
    expect(commitsAtLastProgress).toBe(0);
    expect(rec.files).toEqual(fs.map((f) => ({ path: f.path, size: f.data.length, sha256: sha(f.data), done: true })));
    expect(rec.total).toBe(fs.reduce((n, f) => n + f.data.length, 0));
    expect(rec.identity).toEqual(IDENTITY);
    expect(sent.at(-1)).toBe(rec.total);
    // every binary message within the chunk
    for (const m of a.sent) if (typeof m !== 'string') expect(m.byteLength).toBeLessThanOrEqual(SHARE_CHUNK_BYTES_ADAPTATION);
  });

  it('pacing: nothing is sent while bufferedAmount is past the high mark; it waits for drained', async () => {
    const fs = files(600_000);
    const src = source(fs, READ_SET);
    const st = store();
    const { a, b } = pipes({ hold: true, high: 128 * 1024 });
    const out = Promise.all([sendFiles(a, src), receiveFiles(b, st, { readSet: READ_SET, isReadSet: syntheticSet })]);
    let rounds = 0;
    let settled = false;
    void out.then(() => { settled = true; }, () => { settled = true; });
    while (!settled && rounds < 10_000) {
      await new Promise((r) => setTimeout(r, 0));
      expect(a.bufferedAmount).toBeLessThanOrEqual(128 * 1024 + SHARE_CHUNK_BYTES_ADAPTATION);
      a.flush(); b.flush();
      rounds++;
    }
    await out;
    expect(a.maxBufferedAtSend).toBeLessThanOrEqual(128 * 1024);
    expect(rounds).toBeGreaterThan(4);                            // it really waited on the buffer, several times
    expect(sha(st.stored.get(fs[0]!.path)!)).toBe(sha(fs[0]!.data));
  });

  it('a drop mid-file: both ends fail "dropped"; a new transfer resumes from the stored bytes and ends with the right SHA-256', async () => {
    const fs = files(50_000, 300_000);
    const block = 32 * 1024;
    const st = store(block);
    const first = pipes({ hold: true, high: 64 * 1024 });
    const src1 = source(fs, READ_SET);
    let cut = false;
    const r1 = Promise.allSettled([
      sendFiles(first.a, src1),
      receiveFiles(first.b, st, { readSet: READ_SET, isReadSet: syntheticSet, onProgress: (n) => { if (n > 50_000 + 150_000) cut = true; } }),
    ]);
    let over = false;
    void r1.then(() => { over = true; });
    // The held pipes delivered a round at a time; once the receiver has stored past the mark, the channel drops with
    // bytes still in flight (the held queue is lost, as a real drop loses them).
    for (let k = 0; !over && k < 10_000; k++) {
      await new Promise((r) => setTimeout(r, 0));
      if (cut) first.a.drop(); else { first.a.flush(); first.b.flush(); }
    }
    const [s1, v1] = await r1;
    expect(s1.status).toBe('rejected');
    expect(v1.status).toBe('rejected');
    expect((v1 as PromiseRejectedResult).reason).toMatchObject({ kind: 'dropped' });
    expect(st.commits).toHaveLength(0);
    const kept = st.stored.get(fs[1]!.path)!.length;
    expect(kept).toBeGreaterThan(0);
    expect(kept % block).toBe(0);

    const second = pipes();
    const src2 = source(fs, READ_SET);
    const [, rec] = await Promise.all([sendFiles(second.a, src2), receiveFiles(second.b, st, { readSet: READ_SET, isReadSet: syntheticSet })]);
    // the first file was whole: not asked for again; the second from its last stored block
    expect(src2.reads.filter((r) => r.path === fs[0]!.path)).toHaveLength(0);
    expect(src2.reads.find((r) => r.path === fs[1]!.path)!.offset).toBe(kept);
    expect(rec.files.map((f) => f.sha256)).toEqual(fs.map((f) => sha(f.data)));
    expect(sha(st.stored.get(fs[1]!.path)!)).toBe(sha(fs[1]!.data));
    expect(st.commits).toHaveLength(1);
  });

  it('a hash mismatch fails that file and stops: the file discarded, nothing committed, the sender told', async () => {
    const fs = files(40_000, 40_000, 40_000);
    const st = store();
    st.corrupt.add(fs[1]!.path);
    const { a, b } = pipes();
    const [s, r] = await Promise.allSettled([sendFiles(a, source(fs, READ_SET)), receiveFiles(b, st, { readSet: READ_SET, isReadSet: syntheticSet })]);
    expect(r.status).toBe('rejected');
    expect((r as PromiseRejectedResult).reason).toMatchObject({ kind: 'mismatch' });
    expect(((r as PromiseRejectedResult).reason as Error).message).toContain(fs[1]!.path);
    expect(s.status).toBe('rejected');
    expect((s as PromiseRejectedResult).reason).toMatchObject({ kind: 'mismatch' });
    expect(st.discarded).toEqual([fs[1]!.path]);
    expect(st.commits).toHaveLength(0);
    expect(st.stored.has(fs[2]!.path)).toBe(false);              // stopped: the third file never asked for
  });

  it('another read set\'s manifest is refused before anything is stored', async () => {
    const { a, b } = pipes();
    const st = store();
    const [, r] = await Promise.allSettled([sendFiles(a, source(files(10), 2)), receiveFiles(b, st, { readSet: READ_SET, isReadSet: syntheticSet })]);
    expect((r as PromiseRejectedResult).reason).toMatchObject({ kind: 'version' });
    expect(st.prepared).toBe(0);
    expect(st.stored.size).toBe(0);
  });

  it('a stop (the signal) ends both: the receiver\'s file aborted with its blocks kept, nothing committed', async () => {
    const fs = files(400_000);
    const st = store();
    const { a, b } = pipes();
    const ac = new AbortController();
    const [s, r] = await Promise.allSettled([
      sendFiles(a, source(fs, READ_SET), { onProgress: (n) => { if (n > 100_000) ac.abort(); }, signal: ac.signal }),
      receiveFiles(b, st, { readSet: READ_SET, isReadSet: syntheticSet }),
    ]);
    expect((s as PromiseRejectedResult).reason).toMatchObject({ kind: 'stopped' });
    expect(r.status).toBe('rejected');
    expect(st.commits).toHaveLength(0);
  });
});

afterEach(() => { vi.useRealTimers(); });

/** The review's B1: nothing flows before both sides' local-only checks passed, and a stall never hangs. */
describe('DSH-4 review B1: hello first, and the copy\'s inactivity bound', () => {
  it('the receiver says hello first; the sender sends nothing until it hears it', async () => {
    const fs = files(10_000);
    const st = store();
    const { a, b } = pipes({ hold: true });
    const out = Promise.allSettled([sendFiles(a, source(fs, READ_SET)), receiveFiles(b, st, { readSet: READ_SET, isReadSet: syntheticSet })]);
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    expect(a.sent, 'no manifest before hello').toEqual([]);
    expect(b.sent.map((m) => JSON.parse(m as string))).toEqual([{ t: 'hello' }]);
    b.flush();                                                   // hello delivered
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    expect(JSON.parse(a.sent[0] as string)).toMatchObject({ t: 'manifest' });
    for (let k = 0; k < 1000 && st.commits.length === 0; k++) { a.flush(); b.flush(); await new Promise((r) => setTimeout(r, 0)); }
    b.flush();
    const [s, r] = await out;
    expect(s.status).toBe('fulfilled');
    expect(r.status).toBe('fulfilled');
  });

  it('a hello before the sender listens is kept (the pipe queues it), and the copy completes', async () => {
    const fs = files(5_000);
    const st = store();
    const { a, b } = pipes();
    const rx = receiveFiles(b, st, { readSet: READ_SET, isReadSet: syntheticSet });
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));   // hello delivered to a, no listener yet
    const tx = sendFiles(a, source(fs, READ_SET));
    await Promise.all([tx, rx]);
    expect(st.commits).toHaveLength(1);
  });

  it.each(['sender', 'receiver'] as const)('the %s hears nothing for the bound while it waits: it fails "idle", its pipe closed, no timer left', async (side) => {
    vi.useFakeTimers();
    const { a, b } = pipes({ hold: true });                      // nothing is ever delivered: a stalled channel
    const mine = side === 'sender' ? a : b;
    let closed = 0;
    mine.onClose(() => { closed++; });
    const out = side === 'sender'
      ? sendFiles(a, source(files(10_000), READ_SET))            // waits for hello
      : receiveFiles(b, store(), { readSet: READ_SET, isReadSet: syntheticSet });   // waits for the manifest
    let settled = false;
    void out.then(() => { settled = true; }, () => { settled = true; });
    await vi.advanceTimersByTimeAsync(SHARE_IDLE_MS_ADAPTATION - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(out).rejects.toMatchObject({ kind: 'idle', message: SHARE_IDLE });
    expect(closed).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(SHARE_IDLE_MS_ADAPTATION).toBe(30_000);
  });

  it('the sender waiting on an acknowledgement that never comes fails "idle" too', async () => {
    vi.useFakeTimers();
    const { a, b } = pipes({ hold: true });
    const out = sendFiles(a, source(files(20 * 1024 * 1024), READ_SET));
    let settled = false;
    void out.then(() => { settled = true; }, () => { settled = true; });
    b.send(JSON.stringify({ t: 'hello' })); b.flush();
    await vi.advanceTimersByTimeAsync(0);
    b.send(JSON.stringify({ t: 'want', i: 0, from: 0 })); b.flush();
    for (let k = 0; k < 400 && a.sent.length < 2 + 8 * 16; k++) { a.flush(); await vi.advanceTimersByTimeAsync(0); }
    expect(settled).toBe(false);                                 // the window is full: it waits on an ack
    await vi.advanceTimersByTimeAsync(SHARE_IDLE_MS_ADAPTATION);
    await expect(out).rejects.toMatchObject({ kind: 'idle' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a copy that keeps moving never trips the bound, however long it runs; no timer left after', async () => {
    vi.useFakeTimers();
    const fs = files(3 * 1024 * 1024);
    const src = source(fs, READ_SET);
    const slow = { ...src, readRange: async (p: string, o: number, l: number) => { await new Promise((r) => setTimeout(r, SHARE_IDLE_MS_ADAPTATION - 1_000)); return src.readRange(p, o, l); } };
    const st = store();
    const { a, b } = pipes();
    const out = Promise.all([sendFiles(a, slow), receiveFiles(b, st, { readSet: READ_SET, isReadSet: syntheticSet })]);
    let done = false;
    void out.then(() => { done = true; }, () => { done = true; });
    for (let k = 0; k < 200 && !done; k++) await vi.advanceTimersByTimeAsync(1_000);
    await out;
    expect(st.commits).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

/**
 * The second review's finding 1: on reopen the store re-hashes what it holds (a resume at 90% re-reads about 1.2 GB
 * before the first `want`), so the receiver's own long local work tells the sender it is still there: `busy` every
 * `SHARE_BUSY_MS_ADAPTATION`, swallowed by the sender's tap and restarting its inactivity bound.
 */
describe('DSH-4 second review 1: the receiver\'s keepalive while it works locally', () => {
  const SLOW = SHARE_IDLE_MS_ADAPTATION * 2 + 5_000;           // longer than the bound, twice over
  const slowOpen = (st: ReturnType<typeof store>, opts: { fail?: boolean } = {}) => {
    const open = st.open.bind(st);
    st.open = async (...args: Parameters<typeof open>) => {
      await new Promise((r) => setTimeout(r, SLOW));
      if (opts.fail) throw new Error('the store could not read the file back');
      return open(...args);
    };
    return st;
  };
  const busies = (sent: readonly (string | Uint8Array)[]): number => sent.filter((m) => typeof m === 'string' && JSON.parse(m).t === 'busy').length;
  const settle = async <T>(p: Promise<T>, ms = 400_000) => {
    let over = false;
    void p.then(() => { over = true; }, () => { over = true; });
    for (let k = 0; k < ms / 1_000 && !over; k++) await vi.advanceTimersByTimeAsync(1_000);
    return p;
  };

  it('the keepalive is well inside the bound', () => {
    expect(SHARE_BUSY_MS_ADAPTATION).toBe(10_000);
    expect(SHARE_BUSY_MS_ADAPTATION * 2).toBeLessThan(SHARE_IDLE_MS_ADAPTATION);
  });

  it('a store whose open takes longer than the bound: the copy completes, the sender heard busy, no timer left', async () => {
    vi.useFakeTimers();
    const fs = files(20_000, 30_000);
    const st = slowOpen(store());
    const { a, b } = pipes();
    const [, rec] = await settle(Promise.all([sendFiles(a, source(fs, READ_SET)), receiveFiles(b, st, { readSet: READ_SET, isReadSet: syntheticSet })]));
    expect(rec.files.map((f) => f.sha256)).toEqual(fs.map((f) => sha(f.data)));
    expect(st.commits).toHaveLength(1);
    expect(busies(b.sent)).toBeGreaterThanOrEqual(2 * Math.floor(SLOW / SHARE_BUSY_MS_ADAPTATION));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('the third check: many short opens in a row (each under the keepalive period, together past the bound) complete', async () => {
    // A 90% resume: every whole-stored file is re-hashed by a short open, with no want or ack between them.
    vi.useFakeTimers();
    const fs = files(5_000, 5_000, 5_000, 5_000, 5_000, 5_000);
    const st = store();
    for (const f of fs) st.stored.set(f.path, f.data.slice());   // every file whole: no want, no ack, only the opens
    const open = st.open.bind(st);
    st.open = async (...args: Parameters<typeof open>) => { await new Promise((r) => setTimeout(r, SHARE_BUSY_MS_ADAPTATION - 1_000)); return open(...args); };
    const { a, b } = pipes();
    const [, rec] = await settle(Promise.all([sendFiles(a, source(fs, READ_SET)), receiveFiles(b, st, { readSet: READ_SET, isReadSet: syntheticSet })]));
    expect(fs.length * (SHARE_BUSY_MS_ADAPTATION - 1_000), 'the chain is longer than the bound').toBeGreaterThan(SHARE_IDLE_MS_ADAPTATION);
    expect(b.sent.filter((m) => typeof m === 'string' && JSON.parse(m).t === 'want'), 'nothing asked for').toHaveLength(0);
    expect(rec.files).toHaveLength(fs.length);
    expect(busies(b.sent)).toBeGreaterThan(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('the third check: a local step that never ends fails "store" at its cap; no keepalive or timer left', async () => {
    // LATER 578's blocked delete: before the cap, the keepalive held both screens forever.
    vi.useFakeTimers();
    const st = store();
    st.prepare = () => new Promise<void>(() => undefined);
    const { a, b } = pipes();
    const [, r] = await settle(Promise.allSettled([sendFiles(a, source(files(10_000), READ_SET)), receiveFiles(b, st, { readSet: READ_SET, isReadSet: syntheticSet })]), SHARE_LOCAL_MAX_MS_ADAPTATION + 60_000);
    expect((r as PromiseRejectedResult).reason).toMatchObject({ kind: 'store', message: SHARE_LOCAL_STUCK });
    const n = busies(b.sent);
    await vi.advanceTimersByTimeAsync(SHARE_BUSY_MS_ADAPTATION * 5);
    expect(busies(b.sent)).toBe(n);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('the re-check: a stop during a local step that never ends ends the receive at once, not at the cap', async () => {
    vi.useFakeTimers();
    const st = store();
    st.prepare = () => new Promise<void>(() => undefined);
    const { a, b } = pipes();
    const ac = new AbortController();
    const out = Promise.allSettled([
      sendFiles(a, source(files(10_000), READ_SET)),
      receiveFiles(b, st, { readSet: READ_SET, isReadSet: syntheticSet, signal: ac.signal }),
    ]);
    await vi.advanceTimersByTimeAsync(SHARE_BUSY_MS_ADAPTATION + 500);
    ac.abort();
    const [, r] = await settle(out, SHARE_BUSY_MS_ADAPTATION);
    expect(r.status).toBe('rejected');
    expect((r as PromiseRejectedResult).reason).not.toMatchObject({ message: SHARE_LOCAL_STUCK });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('the second re-check: a wedged write, then a wedged abort: the cap still fails "store", the keepalive stops, no timer left', async () => {
    vi.useFakeTimers();
    const st = store();
    const open = st.open.bind(st);
    st.open = async (...args: Parameters<typeof open>) => {
      const f = await open(...args);
      return { ...f, write: () => new Promise<void>(() => undefined), abort: () => new Promise<void>(() => undefined) };
    };
    const { a, b } = pipes();
    const [, r] = await settle(Promise.allSettled([sendFiles(a, source(files(10_000), READ_SET)), receiveFiles(b, st, { readSet: READ_SET, isReadSet: syntheticSet })]), SHARE_LOCAL_MAX_MS_ADAPTATION + 60_000);
    expect((r as PromiseRejectedResult).reason).toMatchObject({ kind: 'store', message: SHARE_LOCAL_STUCK });
    const n = busies(b.sent);
    await vi.advanceTimersByTimeAsync(SHARE_BUSY_MS_ADAPTATION * 5);
    expect(busies(b.sent)).toBe(n);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a long open that fails: the receiver fails "store", and no keepalive runs after it', async () => {
    vi.useFakeTimers();
    const st = slowOpen(store(), { fail: true });
    const { a, b } = pipes();
    const [, r] = await settle(Promise.allSettled([sendFiles(a, source(files(10_000), READ_SET)), receiveFiles(b, st, { readSet: READ_SET, isReadSet: syntheticSet })]));
    expect((r as PromiseRejectedResult).reason).toMatchObject({ kind: 'store' });
    const n = busies(b.sent);
    await vi.advanceTimersByTimeAsync(SHARE_BUSY_MS_ADAPTATION * 5);
    expect(busies(b.sent)).toBe(n);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['stop', 'close'] as const)('a %s during a long open stops the keepalive at once; the open, landing late, is closed', async (how) => {
    vi.useFakeTimers();
    const st = slowOpen(store());
    const slow = st.open.bind(st);
    let landed = 0, aborted = 0;
    st.open = async (...args: Parameters<typeof slow>) => {
      const f = await slow(...args);
      landed++;
      return { ...f, abort: async () => { aborted++; await f.abort(); } };
    };
    const { a, b } = pipes();
    const ac = new AbortController();
    const out = Promise.allSettled([
      sendFiles(a, source(files(10_000), READ_SET)),
      receiveFiles(b, st, { readSet: READ_SET, isReadSet: syntheticSet, signal: ac.signal }),
    ]);
    await vi.advanceTimersByTimeAsync(SHARE_BUSY_MS_ADAPTATION * 2 + 500);
    expect(busies(b.sent)).toBe(2);                              // the open is still running, the keepalive with it
    if (how === 'stop') ac.abort(); else b.drop();
    const n = busies(b.sent);
    await vi.advanceTimersByTimeAsync(SHARE_BUSY_MS_ADAPTATION * 3);
    expect(busies(b.sent)).toBe(n);
    const [, r] = await settle(out);
    expect(r.status).toBe('rejected');
    expect(landed, 'the receive ended before the open landed (the re-check)').toBe(0);
    await vi.advanceTimersByTimeAsync(SLOW);
    expect([landed, aborted]).toEqual([1, 1]);
    expect(st.commits).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

/** The second review's finding 2: a side whose own check fails after the other's pipe is up says so on the channel. */
describe('DSH-4 second review 2: the other side\'s fail "local" is its stop', () => {
  it('the receiver hears fail {why: local} for the manifest: SHARE_OTHER_STOPPED, nothing prepared', async () => {
    const { a, b } = pipes();
    const st = store();
    const rx = receiveFiles(b, st, { readSet: READ_SET, isReadSet: syntheticSet });
    a.send(JSON.stringify({ t: 'fail', why: 'local' }));
    await expect(rx).rejects.toMatchObject({ kind: 'stopped', message: SHARE_OTHER_STOPPED });
    expect(st.prepared).toBe(0);
  });

  it('the sender hears fail {why: local} for hello: SHARE_OTHER_STOPPED', async () => {
    const { a, b } = pipes();
    const tx = sendFiles(a, source(files(10), READ_SET));
    b.send(JSON.stringify({ t: 'fail', why: 'local' }));
    await expect(tx).rejects.toMatchObject({ kind: 'stopped', message: SHARE_OTHER_STOPPED });
  });
});

/** The review's N2: a manifest that is not exactly the read set is refused before anything is stored. */
describe('DSH-4 review N2: the manifest is the read set', () => {
  /** A listing whose read set is whole (`@s2u/archive`'s own test's listing: names only). */
  const READ = [
    'SYSTEM.CNF',
    'RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR', 'RUN/UI/UI.ZED', 'RUN/UI/UI_GEO.ZED', 'RUN/UI/UI_MDL.ZED', 'RUN/UI/UI_TXR.ZED',
    'RUN/UI/UI_PAL.ZED', 'RUN/UI/UIMP_TXR.ZED', 'RUN/UI/UIMP_PAL.ZED', 'RUN/UI/JUNK_TXR.ZED',
    'RUN/UIZANIM.ZAR', 'RUN/EXTZANIM.ZAR', 'RUN/MPZANIM.ZAR',
    'RUN/LOCALE/STATES/UIMNLOC.ZAR', 'RUN/LOCALE/STATES/UIMPXLOC.ZAR', 'RUN/LOCALE/STATES/UIXLOC.ZAR', 'RUN/LOCALE/STATES/HUDCLOC.ZAR',
    'RUN/MOVIES/COMMON/MENULOOP.PSS', 'RUN/MOVIES/COMMON/SONY448.PSS', 'RUN/MOVIES/INTRO_2.PSS',
    'RUN/COMMON/FONT_TXR.ZED', 'RUN/COMMON/FONT_PAL.ZED',
    'RUN/RAW/LOADING.RAW', 'RUN/RAW/PULOADGP.RAW',
    'RUN/SOUNDS/VAGSTORE.ZAR', 'RUN/SOUNDS/BNKSTORE.ZAR',
    'RUN/ICONS/LIST.ICO', 'RUN/ICONS/HDD/ICON.SYS',
    'RUN/READERC.ZAR', 'RUN/ZWEAPON.ZAR', 'RUN/MOTION_P.ZAR', 'RUN/SOUNDRDR.ZAR', 'RUN/IRX/LIBSD.IRX',
    'RUN/MP1.ZDB', 'RUN/MP2.ZDB', 'RUN/MP72.ZDB',
    ...CAMPAIGN_ARCHIVES,
  ];
  const over = (paths: readonly string[]) => source(paths.map((path, i) => ({ path, data: bytesOf(i + 1, 16 + i) })), READ_SET);

  it('fitsReadSet: the read set exactly; a fixed member missing or one extra is not', () => {
    expect(fitsReadSet(READ)).toBe(true);
    expect(fitsReadSet(READ.filter((p) => p !== 'RUN/ZWEAPON.ZAR'))).toBe(false);
    expect(fitsReadSet(READ.filter((p) => p !== 'SYSTEM.CNF'))).toBe(false);
    expect(fitsReadSet(READ.filter((p) => p !== 'RUN/M73.ZDB'))).toBe(false);
    expect(fitsReadSet([...READ, 'RUN/MOVIES/COMMON/CREDITS.PSS'])).toBe(false);
    expect(fitsReadSet([...READ, 'RUN/E2E/F0.BIN'])).toBe(false);
    expect(fitsReadSet([])).toBe(false);
  });

  it('the second review\'s finding 3, what it cannot catch: the map archives are whatever the listing holds', () => {
    // No list of the disc's multiplayer maps lives in code (`@s2u/archive` `readSetPaths` takes every `RUN/MP<n>.ZDB` the
    // listing holds), so a set short of some of them still fits; the hashes, sizes and record do not catch it either.
    expect(fitsReadSet(READ.filter((p) => p !== 'RUN/MP72.ZDB'))).toBe(true);
    expect(fitsReadSet(READ.filter((p) => !/^RUN\/MP\d+\.ZDB$/.test(p)))).toBe(true);
  });

  it('by default the receiver takes the whole read set and commits it', async () => {
    const st = store();
    const { a, b } = pipes();
    const [, rec] = await Promise.all([sendFiles(a, over(READ)), receiveFiles(b, st, { readSet: READ_SET })]);
    expect(rec.files.map((f) => f.path)).toEqual(READ);
    expect(st.commits).toHaveLength(1);
  });

  it.each([
    ['a path missing', READ.filter((p) => p !== 'RUN/M73.ZDB')],
    ['an extra path', [...READ, 'RUN/MOVIES/COMMON/CREDITS.PSS']],
  ])('%s: refused in its words, before anything is stored; the sender told', async (_what, paths) => {
    const st = store();
    const { a, b } = pipes();
    const [s, r] = await Promise.allSettled([sendFiles(a, over(paths)), receiveFiles(b, st, { readSet: READ_SET })]);
    expect((r as PromiseRejectedResult).reason).toMatchObject({ kind: 'set', message: SHARE_NOT_READ_SET });
    expect((s as PromiseRejectedResult).reason).toMatchObject({ kind: 'set', message: SHARE_NOT_READ_SET });
    expect(st.prepared).toBe(0);
    expect(st.stored.size).toBe(0);
    expect(st.commits).toHaveLength(0);
  });
});
