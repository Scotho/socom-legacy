import { readSetPaths, type DiscIdentity } from '@s2u/archive';
import type { DiscExtractFile, DiscExtractRecord } from './discExtract';
import type { ExtractBackend } from './discExtractStore';
import type { StreamedFile } from './discStreamWrite';
import {
  SHARE_DROPPED, SHARE_IDLE, SHARE_LOCAL_STUCK, SHARE_NOT_READ_SET, SHARE_OTHER_STOPPED, SHARE_PROTOCOL, SHARE_SOURCE_GONE, SHARE_VERSION, shareMismatch,
} from './discShareWords';

/**
 * **Disc share's transfer protocol** (`docs/plans/2026-10-18-disc-share.md`, DSH-4; DSH.R4, DSH.R7). **A browser
 * adaptation, product track** (OT.R53): nothing here changes what the game does -- the files sent are the sender's kept
 * extraction's bytes, stored on the receiver by the extraction's own streamed writer and read back by the same readers.
 * Pure: no DOM, no network; it runs over a `SharePipe` (`./discShareRtc` `channelPipe`, a data channel; a test's fake).
 *
 * The exchange, one file at a time, in the manifest's order:
 * 0. The receiver: `hello`, once its own connection check passed (its path read, `./discShareRtc` `pairVerdict`, DSH.R15;
 *    it is handed the pipe only then); the sender sends
 *    nothing until it hears it (the disc share review's B1), so nothing flows before both sides' checks passed. Each
 *    side's `onLinked` says so: the sender's at `hello`, the receiver's at the manifest.
 * 1. The sender: `manifest` (`manifestOf`: the identity, the read set's version, and each file's path, size and SHA-256
 *    from its kept, whole record -- DSH.R7: the kept extraction only, never the image).
 * 2. The receiver checks the read set's version against its own (`SHARE_VERSION` if not) and the manifest's paths against
 *    the read set (`fitsReadSet`: no fixed member missing and no stranger path -- the review's N2; `SHARE_NOT_READ_SET`
 *    if not; what it cannot catch is in its own comment), makes way for it in its store
 *    (`ReceiveStore.prepare`), then for each file opens it (`ReceiveStore.open`, DSH-2's `openStreamedFile`) and asks
 *    for it from what is already stored: `want { i, from }` with `from` the file's `storedBytes` -- 0 for a new file, the
 *    last stored block's end after a drop, its size when stored whole (then nothing is asked). **The resume**: a drop
 *    keeps every stored block (`abort`), and the next transfer asks from there.
 * 3. The sender sends the file's bytes from `from` as binary messages of `SHARE_CHUNK_BYTES_ADAPTATION`, read from its
 *    store in `SHARE_READ_BLOCK_ADAPTATION` ranges, **paced** twice: never while the channel's `bufferedAmount` is past
 *    its high mark (it waits for `bufferedamountlow`), and never more than `SHARE_WINDOW_BYTES_ADAPTATION` past the
 *    receiver's last `ack { i, at }` (sent every `SHARE_ACK_BYTES_ADAPTATION` written), so the receiver's memory holds
 *    at most a window however slowly its storage writes.
 * 4. Each file's SHA-256 (the streamed writer's, over the bytes stored) is checked on arrival against the manifest's: a
 *    mismatch discards the file (`ReceiveStore.discard`), tells the sender (`fail { why: 'mismatch', i }`) and stops.
 * 5. When every file matches -- and only then -- the record is committed (`ReceiveStore.commit`: `./discExtractRecord`'s
 *    form, so START reads the copy as a local extraction) and the receiver says `done`.
 * A stop on either side is `fail { why: 'stopped' }` (a side whose own connection check failed once the other's pipe was
 * up says `fail { why: 'local' }`, `./discShareRtc`; the other reads both as `SHARE_OTHER_STOPPED`, the second disc share
 * review's finding 2); a closed channel is `dropped`; a side waiting on the other that hears nothing for
 * `SHARE_IDLE_MS_ADAPTATION` fails `idle` and closes the pipe (the review's B1: a stall never hangs). **The keepalive**
 * (the second review's finding 1): while the receiver works on its own -- making way, opening a file (which re-hashes what
 * is already stored: a resume at 90% re-reads about 1.2 GB before its first `want`), writing, finishing, discarding,
 * committing -- it says `busy` every `SHARE_BUSY_MS_ADAPTATION`; the sender's tap swallows it, and it restarts the
 * sender's bound. Every failure is a `ShareProtocolError` whose message is in a player's words (`./discShareWords`).
 */

/** One binary message: 64 KiB (DSH-4: 16-64 KiB). An adaptation, ours: chosen, not measured. */
export const SHARE_CHUNK_BYTES_ADAPTATION = 64 * 1024;
/** One range read of the sender's store: 1 MiB, cut into chunks. An adaptation. */
export const SHARE_READ_BLOCK_ADAPTATION = 1024 * 1024;
/** How far the sender may run ahead of the receiver's acknowledged writes: 8 MiB. An adaptation. */
export const SHARE_WINDOW_BYTES_ADAPTATION = 8 * 1024 * 1024;
/** How often the receiver acknowledges its writes: every 1 MiB, and at each file's end. An adaptation. */
export const SHARE_ACK_BYTES_ADAPTATION = 1024 * 1024;
/**
 * The copy's inactivity bound (the disc share review's B1): a side waiting on the other -- for its next message, an
 * acknowledgement, or the channel's buffer to drain -- that hears nothing for this long fails `idle`. 30 s. An
 * adaptation, ours: chosen, not measured (an acknowledgement comes every `SHARE_ACK_BYTES_ADAPTATION` written).
 */
export const SHARE_IDLE_MS_ADAPTATION = 30_000;
/**
 * How often the receiver says `busy` while it works on its own (the module's header, the second disc share review's
 * finding 1): 10 s, a third of `SHARE_IDLE_MS_ADAPTATION`, so a late timer or a slow message still lands inside the
 * sender's bound. An adaptation, ours: chosen, not measured.
 */
export const SHARE_BUSY_MS_ADAPTATION = 10_000;

/**
 * The third check of the disc share lane: the longest one local step of the receiver may take (a prepare, an open that
 * re-hashes what is stored, a write, a finish, a commit) before the copy fails "store". 10 minutes: the read set's
 * largest file (VAGSTORE.ZAR, 576,593,920 bytes, the plan's "What we know") re-hashed at 1 MB/s is under 10. An
 * adaptation, ours: chosen, not measured on a console.
 */
export const SHARE_LOCAL_MAX_MS_ADAPTATION = 600_000;

/** The channel as the protocol uses it (`./discShareRtc` `channelPipe`). */
export interface SharePipe {
  send(d: string | Uint8Array): void;
  /** The bytes queued and not yet sent (`RTCDataChannel.bufferedAmount`). */
  buffered(): number;
  /** The mark past which nothing more is sent until `drained`. */
  readonly high: number;
  /** Resolves when the buffer is low again (`bufferedamountlow`), or the pipe closed. */
  drained(): Promise<void>;
  onMessage(fn: (d: string | ArrayBuffer) => void): void;
  onClose(fn: () => void): void;
  close(): void;
}

export interface ManifestFile { path: string; size: number; sha256: string }
export interface ShareManifest { t: 'manifest'; v: 1; readSet: number; identity: DiscIdentity; files: ManifestFile[] }

export type ShareFailKind = 'dropped' | 'mismatch' | 'version' | 'set' | 'protocol' | 'stopped' | 'source' | 'store' | 'idle';
export class ShareProtocolError extends Error {
  override readonly name = 'ShareProtocolError';
  constructor(readonly kind: ShareFailKind, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
  }
}

/** The sender's kept extraction (`./discExtractSource` `ExtractedAssetSource` is one). */
export interface SendSource {
  readonly record: DiscExtractRecord;
  readRange(path: string, offset: number, length: number): Promise<Uint8Array>;
}

/** The receiver's store (the adapter's: DSH-2's streamed write, the page's records). */
export interface ReceiveStore {
  /** Makes way for this disc's files: an extraction of another disc or read set is removed. */
  prepare(identity: DiscIdentity, readSet: number): Promise<void>;
  /** `./discStreamWrite` `openStreamedFile`; `backend` holds every file to the first's. */
  open(identity: DiscIdentity, path: string, size: number, backend?: ExtractBackend): Promise<StreamedFile>;
  /** A file that arrived damaged, removed (stored again from its start next time). */
  discard(identity: DiscIdentity, path: string, backend: ExtractBackend): Promise<void>;
  /** The record written, every file matched: answers it. */
  commit(r: { identity: DiscIdentity; readSet: number; backend: ExtractBackend; files: DiscExtractFile[]; total: number }): Promise<DiscExtractRecord>;
}

export interface ShareHooks {
  /** Bytes moved of the whole set (on the receiver, stored; on the sender, sent), and the set's total. */
  onProgress?: (bytes: number, total: number) => void;
  signal?: AbortSignal;
  /**
   * Both sides' connection checks passed (the sender heard `hello`, the receiver the manifest): the pairing has nothing
   * more to carry (the disc share review's B2: the adapter ends its polls here; the channel carries the end from now).
   */
  onLinked?: () => void;
}

const SHA = /^[0-9a-f]{64}$/;
const PATH = /^[A-Za-z0-9_][A-Za-z0-9_.-]*(\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/;

/** The manifest of a kept, whole record (the module's header, 1); refused for a record not whole. */
export function manifestOf(record: DiscExtractRecord): ShareManifest {
  if (record.when === null || !record.files.length || !record.files.every((f) => f.done && f.sha256 !== null)) {
    throw new ShareProtocolError('source', SHARE_SOURCE_GONE);
  }
  return {
    t: 'manifest', v: 1, readSet: record.readSet, identity: { ...record.identity },
    files: record.files.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256! })),
  };
}

export const manifestTotal = (m: ShareManifest): number => m.files.reduce((n, f) => n + f.size, 0);

/**
 * Whether `paths` fit the read set (the disc share review's N2): **no fixed member missing, no stranger path** --
 * `@s2u/archive` `readSetPaths` over them as a listing names nothing missing and keeps every one. Refused: a fixed member
 * absent (`SYSTEM.CNF`, a common or campaign archive, a kept movie, a front-end name the lists give by name), a path the
 * set would not take (another movie, a stray file). A whole extraction's record passes (its paths are `readSetPaths` of
 * its disc, nothing missing: `extractDisc` refuses a disc that lacks one).
 *
 * **What it cannot catch** (the second disc share review's finding 3): a manifest short of some of the multiplayer map
 * archives (`RUN/MP<n>.ZDB`) or of files a front-end pattern matches -- `readSetPaths` takes those as whatever the listing
 * holds, and no list of the disc's maps, nor a count or a total for a disc's identity, lives in code to hold them against
 * (the plan's 95 files and 1,338,391,063 bytes are a reading of one retail disc, shown before the manifest arrives,
 * `./discShare` `SHARE_READ_SET_BYTES`, not a check). Such a set is stored and committed; each file it holds is still
 * the sender's, hash for hash.
 */
export function fitsReadSet(paths: readonly string[]): boolean {
  const given = new Set(paths);
  if (given.size === 0 || given.size !== paths.length) return false;
  const { paths: want, missing } = readSetPaths([...given]);
  return missing.length === 0 && want.length === given.size && want.every((p) => given.has(p));
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A manifest message read and checked, or null: its shape, each path a plain relative path, each size and hash. */
export function readManifest(text: string): ShareManifest | null {
  let v: unknown;
  try { v = JSON.parse(text); } catch { return null; }
  if (!isObj(v) || v['t'] !== 'manifest' || v['v'] !== 1 || !Number.isSafeInteger(v['readSet'])) return null;
  const id = v['identity'];
  if (!isObj(id) || typeof id['boot'] !== 'string' || !(id['ver'] === null || typeof id['ver'] === 'string')
    || !(id['vmode'] === null || typeof id['vmode'] === 'string')) return null;
  const fs = v['files'];
  if (!Array.isArray(fs) || fs.length === 0) return null;
  const files: ManifestFile[] = [];
  const seen = new Set<string>();
  for (const f of fs) {
    if (!isObj(f) || typeof f['path'] !== 'string' || !PATH.test(f['path']) || f['path'].split('/').includes('..') || seen.has(f['path'])) return null;
    if (!Number.isSafeInteger(f['size']) || (f['size'] as number) < 0 || typeof f['sha256'] !== 'string' || !SHA.test(f['sha256'])) return null;
    seen.add(f['path']);
    files.push({ path: f['path'], size: f['size'] as number, sha256: f['sha256'] });
  }
  return { t: 'manifest', v: 1, readSet: v['readSet'] as number, identity: { boot: id['boot'], ver: id['ver'] as string | null, vmode: id['vmode'] as string | null }, files };
}

type Msg = string | ArrayBuffer;

/**
 * The pipe's messages as a queue read in order; a close or a stop rejects the reader. While this side waits on the other
 * (`waitOn`: its next message, an acknowledgement, the buffer draining) the inactivity bound runs, restarted by every
 * message heard; past it the inbox ends `idle` and the pipe is closed (the review's B1). No timer outlives a wait.
 */
class Inbox {
  private queue: Msg[] = [];
  private waiter: { ok: (m: Msg) => void; no: (e: Error) => void } | null = null;
  private ended: Error | null = null;
  private waits = 0;
  private idle: ReturnType<typeof setTimeout> | null = null;
  private readonly enders: (() => void)[] = [];
  constructor(private readonly pipe: SharePipe, private readonly tap: (m: Msg) => boolean = () => false) {
    pipe.onMessage((m) => {
      if (this.ended) return;
      if (this.waits > 0) this.arm();
      if (this.tap(m)) return;
      if (this.waiter) { const w = this.waiter; this.waiter = null; w.ok(m); } else this.queue.push(m);
    });
    pipe.onClose(() => { this.end(new ShareProtocolError('dropped', SHARE_DROPPED)); });
  }
  /** `p`, awaited with the inactivity bound running. */
  async waitOn<T>(p: Promise<T>): Promise<T> {
    this.waits++;
    if (this.waits === 1) this.arm();
    try { return await p; } finally { if (--this.waits === 0) this.disarm(); }
  }
  private arm(): void {
    this.disarm();
    if (this.ended) return;
    this.idle = setTimeout(() => {
      this.idle = null;
      this.end(new ShareProtocolError('idle', SHARE_IDLE));
      try { this.pipe.close(); } catch { /* closed */ }
    }, SHARE_IDLE_MS_ADAPTATION);
  }
  private disarm(): void { if (this.idle !== null) { clearTimeout(this.idle); this.idle = null; } }
  next(): Promise<Msg> {
    if (this.queue.length) return Promise.resolve(this.queue.shift()!);
    if (this.ended) return Promise.reject(this.ended);
    return this.waitOn(new Promise<Msg>((ok, no) => { this.waiter = { ok, no }; }));
  }
  /** `f` called once when the inbox ends (a waiter outside `next` woken). */
  onEnd(f: () => void): void { if (this.ended) f(); else this.enders.push(f); }
  end(e: Error): void {
    if (this.ended) return;
    this.ended = e;
    this.disarm();
    if (this.waiter) { const w = this.waiter; this.waiter = null; w.no(e); }
    for (const f of this.enders.splice(0)) f();
  }
  get error(): Error | null { return this.ended; }
}

const json = (m: Msg): Record<string, unknown> | null => {
  if (typeof m !== 'string') return null;
  try { const v: unknown = JSON.parse(m); return isObj(v) ? v : null; } catch { return null; }
};
const trySend = (pipe: SharePipe, d: string | Uint8Array): void => { try { pipe.send(d); } catch { /* closed: the inbox says so */ } };

/** The other side's `fail`, as this side's error. */
function theirFail(m: Record<string, unknown>, manifest: ShareManifest | null): ShareProtocolError {
  const why = m['why'];
  if (why === 'mismatch' && manifest && typeof m['i'] === 'number' && manifest.files[m['i']]) return new ShareProtocolError('mismatch', shareMismatch(manifest.files[m['i']]!.path));
  if (why === 'version') return new ShareProtocolError('version', SHARE_VERSION);
  if (why === 'set') return new ShareProtocolError('set', SHARE_NOT_READ_SET);
  return new ShareProtocolError('stopped', SHARE_OTHER_STOPPED);
}

/** Wires a stop: the signal's abort ends the inbox with `stopped` and tells the other side. */
function onStop(pipe: SharePipe, inbox: Inbox, signal: AbortSignal | undefined, also: () => void = () => undefined): () => void {
  if (!signal) return () => undefined;
  const stop = (): void => {
    if (inbox.error) return;
    trySend(pipe, JSON.stringify({ t: 'fail', why: 'stopped' }));
    inbox.end(new ShareProtocolError('stopped', SHARE_OTHER_STOPPED));
    also();
  };
  if (signal.aborted) stop(); else signal.addEventListener('abort', stop, { once: true });
  return () => { signal.removeEventListener('abort', stop); };
}

/** The sender's side (the module's header): resolves when the receiver says `done`. */
export async function sendFiles(pipe: SharePipe, source: SendSource, hooks: ShareHooks = {}): Promise<void> {
  const manifest = manifestOf(source.record);
  const total = manifestTotal(manifest);
  const starts: number[] = [];
  manifest.files.reduce((n, f) => { starts.push(n); return n + f.size; }, 0);
  let acked = { i: -1, at: 0 };
  let ackWake: (() => void) | null = null;
  const wake = (): void => { const w = ackWake; ackWake = null; w?.(); };
  const inbox = new Inbox(pipe, (m) => {
    const v = json(m);
    if (v?.['t'] === 'busy') return true;                 // the receiver's keepalive: heard (the bound restarted), nothing more
    if (v?.['t'] !== 'ack' || typeof v['i'] !== 'number' || typeof v['at'] !== 'number') return false;
    acked = { i: v['i'], at: v['at'] };
    wake();
    return true;
  });
  pipe.onClose(wake);
  inbox.onEnd(wake);
  const unStop = onStop(pipe, inbox, hooks.signal, wake);
  const live = (): void => { if (inbox.error) throw inbox.error; };
  try {
    const hi = json(await inbox.next());                  // B1: nothing before the receiver's own check passed
    if (hi?.['t'] === 'fail') throw theirFail(hi, manifest);
    if (hi?.['t'] !== 'hello') {
      trySend(pipe, JSON.stringify({ t: 'fail', why: 'protocol' }));
      throw new ShareProtocolError('protocol', SHARE_PROTOCOL);
    }
    hooks.onLinked?.();
    pipe.send(JSON.stringify(manifest));
    hooks.onProgress?.(0, total);
    for (;;) {
      const v = json(await inbox.next());
      if (!v) throw new ShareProtocolError('protocol', SHARE_PROTOCOL);
      if (v['t'] === 'done') return;
      if (v['t'] === 'fail') throw theirFail(v, manifest);
      const i = v['i'];
      const from = v['from'];
      const f = typeof i === 'number' ? manifest.files[i] : undefined;
      if (v['t'] !== 'want' || !f || typeof from !== 'number' || !Number.isSafeInteger(from) || from < 0 || from > f.size) {
        throw new ShareProtocolError('protocol', SHARE_PROTOCOL);
      }
      acked = { i: i as number, at: from };
      let pos = from;
      while (pos < f.size) {
        const len = Math.min(SHARE_READ_BLOCK_ADAPTATION, f.size - pos);
        let block: Uint8Array;
        try { block = await source.readRange(f.path, pos, len); } catch (e) {
          trySend(pipe, JSON.stringify({ t: 'fail', why: 'source' }));
          throw new ShareProtocolError('source', SHARE_SOURCE_GONE, e);
        }
        if (block.length !== len) throw new ShareProtocolError('source', SHARE_SOURCE_GONE);
        for (let o = 0; o < len; o += SHARE_CHUNK_BYTES_ADAPTATION) {
          live();
          while (acked.i === i && pos - acked.at >= SHARE_WINDOW_BYTES_ADAPTATION) {
            await inbox.waitOn(new Promise<void>((r) => { ackWake = r; }));
            live();
          }
          while (pipe.buffered() > pipe.high) { await inbox.waitOn(pipe.drained()); live(); }
          const piece = block.subarray(o, Math.min(o + SHARE_CHUNK_BYTES_ADAPTATION, len));
          pipe.send(piece);
          pos += piece.length;
          hooks.onProgress?.(starts[i as number]! + pos, total);
          live();
        }
      }
    }
  } catch (e) {
    throw e instanceof ShareProtocolError ? e : inbox.error ?? new ShareProtocolError('dropped', SHARE_DROPPED, e);
  } finally {
    unStop();
  }
}

export interface ReceiveOptions extends ShareHooks {
  /** This page's read set's version (`@s2u/archive` `READ_SET_VERSION`): a manifest of another is refused. */
  readSet: number;
  /** The manifest, as soon as it is read (its total for the progress). */
  onManifest?: (m: ShareManifest) => void;
  /**
   * Whether the manifest's paths fit the read set; absent, `fitsReadSet`. A test seam: a synthetic set's test
   * (the unit tests' fakes, the DSH-8 browser spec) passes its own check of its own paths.
   */
  isReadSet?: (paths: readonly string[]) => boolean;
}

/** The receiver's side (the module's header): resolves with the committed record, every file matched. */
export async function receiveFiles(pipe: SharePipe, store: ReceiveStore, opts: ReceiveOptions): Promise<DiscExtractRecord> {
  const inbox = new Inbox(pipe);
  let current: StreamedFile | null = null;
  const unStop = onStop(pipe, inbox, opts.signal);
  let manifest: ShareManifest | null = null;
  // The keepalive (the module's header): one timer from the first local work to the end of the receive, ended with the
  // inbox or the run -- not with each step: the third check found a resume's chain of short re-hashing opens, each under
  // the period, silent past the sender's bound. Each local step is capped (`SHARE_LOCAL_MAX_MS_ADAPTATION`), so a step
  // that never ends (LATER 578's blocked delete) fails "store" instead of holding both screens on the keepalive.
  let beat: ReturnType<typeof setInterval> | null = null;
  const quiet = (): void => { if (beat !== null) { clearInterval(beat); beat = null; } };
  inbox.onEnd(quiet);
  // The re-check of the third check: a step also ends with the inbox, so a stop or a drop during a step that never ends
  // ends the receive at once, not at the cap.
  const gone = new Promise<never>((_, reject) => { inbox.onEnd(() => reject(inbox.error ?? new ShareProtocolError('dropped', SHARE_DROPPED))); });
  gone.catch(() => undefined);
  // `late`: what a step's result needs if it lands after the step was given up (an open's file closed, so its handle does
  // not hold the next attempt).
  const local = async <T>(work: () => Promise<T>, late?: (v: T) => Promise<unknown>): Promise<T> => {
    if (beat === null && !inbox.error) {
      beat = setInterval(() => {
        if (inbox.error) { quiet(); return; }
        trySend(pipe, JSON.stringify({ t: 'busy' }));
      }, SHARE_BUSY_MS_ADAPTATION);
    }
    let cap: ReturnType<typeof setTimeout> | null = null;
    const stuck = new Promise<never>((_, reject) => {
      cap = setTimeout(() => reject(new ShareProtocolError('store', SHARE_LOCAL_STUCK)), SHARE_LOCAL_MAX_MS_ADAPTATION);
    });
    let step: Promise<T> | null = null;
    try {
      step = work();
      return await Promise.race([step, stuck, gone]);
    } catch (e) {
      stuck.catch(() => undefined);
      if (late && step) void step.then((v) => late(v), () => undefined).catch(() => undefined);
      throw e;
    } finally {
      if (cap !== null) clearTimeout(cap);
    }
  };
  try {
    trySend(pipe, JSON.stringify({ t: 'hello' }));        // B1: this side's check passed (the pipe is handed out after it)
    const first = await inbox.next();
    const m = typeof first === 'string' ? readManifest(first) : null;
    if (!m) {
      const v = json(first);
      if (v?.['t'] === 'fail') throw theirFail(v, null);
      trySend(pipe, JSON.stringify({ t: 'fail', why: 'protocol' }));
      throw new ShareProtocolError('protocol', SHARE_PROTOCOL);
    }
    manifest = m;
    opts.onLinked?.();
    if (m.readSet !== opts.readSet) {
      trySend(pipe, JSON.stringify({ t: 'fail', why: 'version' }));
      throw new ShareProtocolError('version', SHARE_VERSION);
    }
    if (!(opts.isReadSet ?? fitsReadSet)(m.files.map((f) => f.path))) {
      trySend(pipe, JSON.stringify({ t: 'fail', why: 'set' }));
      throw new ShareProtocolError('set', SHARE_NOT_READ_SET);
    }
    const total = manifestTotal(m);
    opts.onManifest?.(m);
    await local(() => store.prepare(m.identity, m.readSet));
    let backend: ExtractBackend | undefined;
    let before = 0;
    const done: DiscExtractFile[] = [];
    for (const [i, f] of m.files.entries()) {
      if (inbox.error) throw inbox.error;
      const file = await local(() => store.open(m.identity, f.path, f.size, backend), (late) => late.abort());
      current = file;
      backend = file.backend;
      let at = file.storedBytes;
      opts.onProgress?.(before + at, total);
      if (at < f.size) {
        pipe.send(JSON.stringify({ t: 'want', i, from: at }));
        let lastAck = at;
        while (at < f.size) {
          const d = await inbox.next();
          if (typeof d === 'string') {
            const v = json(d);
            if (v?.['t'] === 'fail') throw theirFail(v, m);
            throw new ShareProtocolError('protocol', SHARE_PROTOCOL);
          }
          if (at + d.byteLength > f.size) {
            trySend(pipe, JSON.stringify({ t: 'fail', why: 'protocol' }));
            throw new ShareProtocolError('protocol', SHARE_PROTOCOL);
          }
          await local(() => file.write(new Uint8Array(d)));
          at += d.byteLength;
          opts.onProgress?.(before + at, total);
          if (at - lastAck >= SHARE_ACK_BYTES_ADAPTATION || at === f.size) { trySend(pipe, JSON.stringify({ t: 'ack', i, at })); lastAck = at; }
        }
      }
      current = null;
      const got = await local(() => file.finish());
      if (got.sha256 !== f.sha256 || got.bytes !== f.size) {
        await local(() => store.discard(m.identity, f.path, file.backend)).catch(() => undefined);
        trySend(pipe, JSON.stringify({ t: 'fail', why: 'mismatch', i }));
        throw new ShareProtocolError('mismatch', shareMismatch(f.path));
      }
      done.push({ path: f.path, size: f.size, sha256: got.sha256, done: true });
      before += f.size;
    }
    const record = await local(() => store.commit({ identity: m.identity, readSet: m.readSet, backend: backend ?? 'opfs', files: done, total }));
    trySend(pipe, JSON.stringify({ t: 'done' }));
    return record;
  } catch (e) {
    // The second re-check: the keepalive stops before the abort, and the abort is bounded, so a wedged store (the cap
    // fired on a write that never ends) cannot hold the receive or the keepalive.
    quiet();
    if (current) {
      const c = current; current = null;
      let bound: ReturnType<typeof setTimeout> | null = null;
      await Promise.race([c.abort().catch(() => undefined), new Promise<void>((r) => { bound = setTimeout(r, SHARE_BUSY_MS_ADAPTATION); })]);
      if (bound !== null) clearTimeout(bound);
    }
    if (e instanceof ShareProtocolError) throw e;
    if (inbox.error) throw inbox.error;
    throw new ShareProtocolError('store', e instanceof Error ? e.message : String(e), e);
  } finally {
    quiet();
    unStop();
  }
}
