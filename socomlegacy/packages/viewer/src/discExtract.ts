import { discIdentity, discReadSet, hasFileBlobs, type BlobAssetSource, type DiscIdentity, type DiscReadSet } from '@s2u/archive';
import { DISC_COPY_MARGIN, copyDirName, type CopyDirectoryHandle, type CopyStorage } from './discCopy';
import { DISC_COPY_CHUNK } from './discCopyProtocol';
import { hashBlob } from './discExtractHash';
import type { ExtractCommand, ExtractReply } from './discExtractProtocol';
import { idbOf, openStore, storageOf, storedExtraction } from './discExtractRecord';
import { STILL_FROM_DISC } from './discExtractWords';
import {
  EXTRACT_ROOT, ExtractStoreError, deleteExtractDb, idbExtractStore, type ExtractBackend, type ExtractStore,
} from './discExtractStore';
import { assetSourceFor, type DiscRequest } from './discSource';
import { DISC_EXTRACT_SLOT, pageRecords, type RecordStore } from './pageStore';

// DX-2's review F5: the start-up's reads live in `./discExtractRecord` (and the words in `./discExtractWords`), so a start
// from storage loads none of the writer; each is still this module's by its name.
export { extractionState, openExtractedSource, storedExtraction } from './discExtractRecord';
export { STILL_FROM_DISC } from './discExtractWords';

/**
 * **The extraction** (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, DX-1, FI.R6; the owner's
 * DISC-EXTRACT: "extract assets from disc instead of reading directly on the first page load"): on first use the disc's
 * **read set** (`@s2u/archive` `discReadSet`: the files the page reads) is copied, file by file, into the browser's own
 * storage (`./discExtractStore`: OPFS, IndexedDB the fallback), so that later visits read from storage and the disc is
 * asked for again only when storage is missing or cleared (DX-3's read path).
 *
 * `extractDisc` reads the disc's identity (DA.R8) and its read set (sizes from the disc's own table) first, then checks
 * the space (`estimate()` against what is left to store plus `DISC_COPY_MARGIN`; refused with the shortfall before any
 * write) and asks `persist()`. Each file is then written in turn -- in the extraction's worker through a sync access
 * handle (OPFS; `./discExtractProtocol`, DA-8's chunk loop), or as one `Blob` (IndexedDB) -- with its SHA-256 taken as
 * it streams (`./discExtractHash`, an incremental SHA-256: the file's true digest), its stored size checked against the
 * table, and the record (`./pageStore`'s `disc.extract` slot) written after each file. It is **resumable**: a reload or a
 * closed tab carries on at the first file not done, and a file left half-written is rewritten from its start; a cancel
 * keeps every file done. `verifyExtraction` re-hashes on demand (not at every load: `VAGSTORE.ZAR` alone is 577 MB);
 * `extractionState` is the start-up's cheap check (each recorded size against the stored file's); `openExtractedSource`
 * reads it back as a source (`./discExtractSource`); `deleteExtraction` removes it all.
 *
 * A **browser adaptation** (FI.R2, OT.R53: the product track) with no original: the original reads its own disc. The
 * stored files are the disc's own bytes, read back by the same readers by the same paths, so nothing the game reads
 * changes. **Nothing leaves the player's machine** (DA.R3): no network, no upload. FI.R6 supersedes DA.R6's opt-in for
 * the read path only; DA-8's whole-image copy (`./discCopy`) stays as it is. The popover that shows this is DX-2's; when
 * the page starts from it is DX-3's.
 */

/** The record in `DISC_EXTRACT_SLOT`, one entry a read-set file. `v` is this record's own version, ours. */
export type DiscExtractFile = {
  readonly path: string;
  /** From the disc's table (`discReadSet`). */
  readonly size: number;
  /** Its SHA-256 as written (64 hex digits), or null while not done. */
  readonly sha256: string | null;
  readonly done: boolean;
};
export type DiscExtractRecord = {
  readonly v: 1;
  /** `READ_SET_VERSION` when it was planned: an extraction of another version is made again. */
  readonly readSet: number;
  /** The disc's `SYSTEM.CNF` (DA-2, DA.R8). */
  readonly identity: DiscIdentity;
  readonly backend: ExtractBackend;
  /** Its directory (OPFS) or key prefix (IndexedDB): `copyDirName(identity)`. */
  readonly dir: string;
  readonly files: readonly DiscExtractFile[];
  /** Bytes of the whole read set. */
  readonly total: number;
  /** `persist()`'s answer (recorded, not required). */
  readonly persisted: boolean;
  /** When it was first started, and when it was finished (null while it is not): ms since the epoch. */
  readonly started: number;
  readonly when: number | null;
};

/**
 * Why an extraction was refused or stopped: `refused` (not a SOCOM II disc, or a file of the read set missing), `unavailable`
 * (no storage), `quota` (`shortfall` the bytes missing, or null when the browser refused a write with no estimate saying
 * so), `denied` (the browser forbids the page's storage: a `SecurityError`, a private window), `cancelled` (the signal:
 * what is done is kept), `mismatch` (a stored file's size is not the table's), `failed` (anything else). Each message
 * says, in a player's words, what to free or allow.
 */
export type DiscExtractReason = 'refused' | 'unavailable' | 'quota' | 'denied' | 'cancelled' | 'mismatch' | 'failed';

export class DiscExtractError extends Error {
  override readonly name = 'DiscExtractError';
  constructor(readonly reason: DiscExtractReason, message: string, readonly shortfall: number | null = null, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
  }
}

/** What the caller hears (DX-2's popover), and its cancel. */
export type ExtractHooks = {
  /** The plan, once the checks pass and before any write: every file (the ones already done marked), the bytes, the backend. */
  readonly onPlan?: (files: readonly DiscExtractFile[], totalBytes: number, backend: ExtractBackend) => void;
  /** The file in hand: its path, its place in the plan (from 0) and the plan's length. */
  readonly onFile?: (path: string, index: number, count: number) => void;
  /** Bytes stored of the whole read set (the files done before included), per chunk. */
  readonly onProgress?: (doneBytes: number, totalBytes: number) => void;
  readonly onDone?: (record: DiscExtractRecord) => void;
  readonly signal?: AbortSignal;
};

/** The page's end of the extraction's worker (a `Worker`; an in-process fake in the test). */
export interface ExtractWorker {
  postMessage(message: ExtractCommand): void;
  onmessage: ((event: MessageEvent<ExtractReply>) => void) | null;
  onerror: ((event: Event) => void) | null;
  terminate(): void;
}

/** What the extraction runs over: the page's own by default; a test passes fakes. */
export type ExtractEnv = {
  /** The origin storage (`./pageStore` `pageOriginStorage`); null: none. */
  readonly storage?: CopyStorage | null;
  /** The IndexedDB factory (`./pageStore` `pageIndexedDb`); answering null: none. */
  readonly idb?: () => IDBFactory | null | undefined;
  /** The page's records (`./pageStore` `pageRecords`). */
  readonly records?: RecordStore;
  /** Makes the extraction's worker (`./discExtractWorker`, a module worker). */
  readonly worker?: () => ExtractWorker;
  /** Bytes a chunk (`DISC_COPY_CHUNK`, DA-8's). */
  readonly chunk?: number;
  readonly now?: () => number;
  /** One backend only (a test; a page that wants one). Absent: OPFS where it can be written, else IndexedDB. */
  readonly backend?: ExtractBackend;
  /** How long the worker's probe may take (`EXTRACT_PROBE_TIMEOUT`). */
  readonly probeTimeout?: number;
};

/**
 * How long the page waits for its worker to say whether it can open a sync access handle before it counts OPFS out and
 * falls back to IndexedDB: 10 s. **An adaptation value, ours** (no original): a module worker answers in milliseconds; a
 * worker that never loads would otherwise hold the extraction for ever. Chosen, not measured.
 */
export const EXTRACT_PROBE_TIMEOUT = 10_000;

/** The extraction's state at start-up (`extractionState`). */
export type ExtractionState = 'none' | 'partial' | 'whole' | 'evicted';

const pageWorker = (): ExtractWorker =>
  new Worker(new URL('./discExtractWorker.ts', import.meta.url), { type: 'module' }) as unknown as ExtractWorker;

const words = (e: unknown): string => (e instanceof Error || e instanceof DOMException ? e.message : String(e));
const named = (e: unknown, ...names: string[]): boolean =>
  typeof e === 'object' && e !== null && names.includes(String((e as { name?: unknown }).name));

/** A size in a player's words: GB, MB or kB (decimal, as the browsers' storage settings show them), or bytes. */
export function amountSaid(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} kB`;
  return `${n} bytes`;
}

const deniedError = (cause?: unknown): DiscExtractError => new DiscExtractError('denied',
  'this browser does not let this page keep files (a private window, or this site\'s data blocked): open the page in a '
  + `normal window, or allow this site to store data in the browser's settings, then try again. ${STILL_FROM_DISC}`, null, cause);
const unavailableError = (why: readonly string[]): DiscExtractError => new DiscExtractError('unavailable',
  `this browser offers no storage this page can keep the game's files in (${why.join('; ') || 'none found'}): a current `
  + `browser has one. ${STILL_FROM_DISC}`);
const quotaRefused = (cause?: unknown): DiscExtractError => new DiscExtractError('quota',
  `the browser refused the room to store the game's files${cause ? ` (${words(cause)})` : ''}: free some space -- other `
  + `sites' data in the browser's settings, or files on this drive -- or allow this site more storage, then try again; `
  + `the files done are kept. ${STILL_FROM_DISC}`, null, cause);

/**
 * Extracts the read set of the disc `request` names into the browser's storage, resuming a kept extraction of the same
 * disc (see the module's header). Call it after the disc is validated (`./discPrompt` `openFrontEndDisc`). Resolves with
 * the finished record; rejects with a `DiscExtractError` -- and then every file done is kept, and recorded, for the next
 * call to carry on from. **An extraction of another disc, read set or backend is replaced**: the space it holds counts
 * as free in the quota check, and once that check passes it is removed before the new one is written.
 */
export async function extractDisc(request: DiscRequest, hooks: ExtractHooks = {}, env: ExtractEnv = {}): Promise<DiscExtractRecord> {
  const { signal } = hooks;
  const records = env.records ?? pageRecords();
  const now = env.now ?? Date.now;
  const chunk = env.chunk ?? DISC_COPY_CHUNK;
  const stopped = (done: number, count: number): DiscExtractError => new DiscExtractError('cancelled', done === 0
    ? 'the extraction was stopped before any file was done; nothing of it needs keeping'
    : `the extraction was stopped: the ${done} of ${count} files done are kept, and it carries on from the next one when it is started again`);
  if (signal?.aborted) throw stopped(0, 0);

  // Identity before anything else (DA.R8), then the read set from the disc's own table.
  let source: BlobAssetSource;
  let identity: DiscIdentity;
  let set: DiscReadSet;
  try {
    const opened = assetSourceFor(request);
    identity = await discIdentity(opened);
    set = await discReadSet(opened);
    if (!hasFileBlobs(opened)) throw new Error('this disc cannot hand its files over one by one');
    source = opened;
  } catch (e) {
    throw new DiscExtractError('refused', words(e), null, e);
  }
  if (set.missing.length) {
    throw new DiscExtractError('refused', `this disc lacks ${set.missing.length} of the files the game reads (${set.missing.join(', ')}): `
      + 'it may be damaged or incomplete -- choose the whole disc image, or the folder that holds all of its files');
  }
  if (signal?.aborted) throw stopped(0, set.files.length);

  let kept: DiscExtractRecord | null;
  try { kept = await storedExtraction(records); } catch (e) { throw new DiscExtractError('failed', `the page's records could not be read: ${words(e)}`, null, e); }

  const chosen = await chooseBackend(env, kept?.backend);
  // DX-1's review F2: a resume of this disc's kept extraction never changes backend. A passing failure of the kept one
  // (OPFS's worker probe timing out, a worker that would not start) would otherwise make this a new extraction and wipe
  // up to the whole set already stored; it is refused instead, and the next try resumes. A backend asked for (`env.backend`) is a choice, not a failure.
  if (!env.backend && kept && chosen.backend !== kept.backend && kept.readSet === set.version && kept.dir === copyDirName(identity)
    && kept.files.some((f) => f.done)) {
    chosen.channel?.close();
    throw new DiscExtractError('unavailable',
      `this browser's ${kept.backend === 'opfs' ? 'private file system' : 'IndexedDB'}, where the game's files kept so far `
      + `are, would not open just now, so the extraction waits rather than start again elsewhere: try again in a moment. ${STILL_FROM_DISC}`);
  }
  const channel = chosen.channel;
  let files: DiscExtractFile[] = [];
  try {
    const backend = chosen.backend;
    const dir = copyDirName(identity);
    const store = openStore(backend, dir, env);
    const same = kept !== null && sameExtraction(kept, identity, backend, dir, set);

    // The plan: the files a kept extraction of this disc has done stay done if the cheap check finds them whole.
    files = set.files.map((f) => {
      const was = same ? kept!.files.find((k) => k.path === f.path) : undefined;
      return { path: f.path, size: f.size, sha256: was?.done ? was.sha256 : null, done: was?.done === true };
    });
    for (const [i, f] of files.entries()) {
      if (f.done && (await store.size(f.path)) !== f.size) files[i] = { ...f, sha256: null, done: false };
    }
    const doneBytes = files.reduce((n, f) => n + (f.done ? f.size : 0), 0);
    const remaining = set.total - doneBytes;

    // The space, before any write: what is left to store and the margin, against what the browser says is free (an
    // extraction this one replaces counted as free).
    const storage = storageOf(env);
    let estimate: { quota?: number; usage?: number } | null = null;
    try { estimate = storage && typeof storage.estimate === 'function' ? await storage.estimate() : null; } catch { estimate = null; }
    if (estimate && typeof estimate.quota === 'number') {
      const reclaim = kept && !same ? kept.files.reduce((n, f) => n + (f.done ? f.size : 0), 0) : 0;
      const free = estimate.quota - (estimate.usage ?? 0) + reclaim;
      const need = remaining + DISC_COPY_MARGIN;
      if (free < need) {
        const short = need - free;
        throw new DiscExtractError('quota',
          `this browser can keep ${amountSaid(Math.max(0, free))} more for this page, and the game's files need `
          + `${amountSaid(need)} (${amountSaid(remaining)} to store and ${amountSaid(DISC_COPY_MARGIN)} to spare): free `
          + `${amountSaid(short)} (${short.toLocaleString('en-US')} bytes) -- other sites' data in the browser's settings, or `
          + `files on this drive -- or allow this site more storage, then try again. ${STILL_FROM_DISC}`, short);
      }
    }
    let persisted = false;
    try { persisted = !!storage && typeof storage.persist === 'function' && (await storage.persist()) === true; } catch { persisted = false; }
    if (signal?.aborted) throw stopped(files.filter((f) => f.done).length, files.length);
    hooks.onPlan?.(files.map((f) => ({ ...f })), set.total, backend);

    // Not a resume: an extraction this one replaces goes, its record first (so none ever points at half-removed files),
    // then every stored file of either backend -- the replaced one's, and any a lost record left -- since one
    // extraction is kept. A removal the browser refuses leaves bytes the next sweep or `deleteExtraction` takes.
    if (!same) {
      if (kept) await records.delete(DISC_EXTRACT_SLOT);
      await removeStoredFiles(env).catch(() => undefined);
    }
    let record: DiscExtractRecord = {
      v: 1, readSet: set.version, identity: { ...identity }, backend, dir, files: [...files], total: set.total, persisted,
      started: same ? kept!.started : now(), when: null,
    };
    await records.put(DISC_EXTRACT_SLOT, record);

    let done = doneBytes;
    hooks.onProgress?.(done, set.total);
    for (const [i, f] of files.entries()) {
      if (f.done) continue;
      if (signal?.aborted) throw stopped(files.filter((x) => x.done).length, files.length);
      hooks.onFile?.(f.path, i, files.length);
      const blob = await source.fileBlob(f.path);
      if (blob.size !== f.size) throw mismatch(f.path, blob.size, f.size, 'the disc hands over');
      const before = done;
      const progress = (n: number): void => { hooks.onProgress?.(before + n, set.total); };
      const written = backend === 'opfs'
        ? await channel!.file(blob, dir, f.path, chunk, progress, signal)
        : await writeWhole(store, f.path, blob, chunk, progress, signal);
      const stored = await store.size(f.path);
      if (written.bytes !== f.size) throw mismatch(f.path, written.bytes, f.size, 'the writer wrote');
      if (stored !== f.size) throw mismatch(f.path, stored ?? 0, f.size, 'this browser holds');
      files[i] = { ...f, sha256: written.sha256, done: true };
      record = { ...record, files: [...files] };
      await records.put(DISC_EXTRACT_SLOT, record);
      done = before + f.size;
      hooks.onProgress?.(done, set.total);
    }
    record = { ...record, when: now() };
    await records.put(DISC_EXTRACT_SLOT, record);
    hooks.onDone?.(record);
    return record;
  } catch (e) {
    if (e instanceof DiscExtractError) throw e;
    if (named(e, 'AbortError') || signal?.aborted) throw stopped(files.filter((f) => f.done).length, files.length);
    throw asExtractError(e);
  } finally {
    channel?.close();
  }
}

const mismatch = (path: string, got: number, want: number, who: string): DiscExtractError => new DiscExtractError('mismatch',
  `${path}: ${who} ${got.toLocaleString('en-US')} bytes, and the disc's table says ${want.toLocaleString('en-US')}: it `
  + 'is copied again from its start when the extraction is started again');

/** A failure that is not yet a `DiscExtractError`, as one, in a player's words. Also `./discStreamWrite`'s. */
export function asExtractError(e: unknown): DiscExtractError {
  if (e instanceof ExtractStoreError) {
    if (e.reason === 'denied') return deniedError(e);
    if (e.reason === 'quota') return quotaRefused(e);
    if (e.reason === 'unavailable') return new DiscExtractError('unavailable', `${e.message}. ${STILL_FROM_DISC}`, null, e);
    return new DiscExtractError('failed', `the extraction failed: ${e.message}`, null, e);
  }
  if (named(e, 'QuotaExceededError')) return quotaRefused(e);
  if (named(e, 'SecurityError')) return deniedError(e);
  if (named(e, 'NoModificationAllowedError')) {
    return new DiscExtractError('failed', `the extraction failed: the stored files are in use (another tab may be extracting or `
      + `reading them): ${words(e)}; close the other tab and try again`, null, e);
  }
  return new DiscExtractError('failed', `the extraction failed: ${words(e)}`, null, e);
}

/** The IndexedDB writer: the file hashed a chunk at a time on the page, then stored as one `Blob`. */
async function writeWhole(
  store: ExtractStore, path: string, blob: Blob, chunk: number, progress: (n: number) => void, signal?: AbortSignal,
): Promise<{ bytes: number; sha256: string }> {
  const sha256 = await hashBlob(blob, chunk, () => signal?.aborted === true, progress);
  if (signal?.aborted) throw new DOMException('the extraction was cancelled', 'AbortError');
  const bytes = await store.write(path, blob);
  return { bytes, sha256 };
}

/** Whether a kept record is this extraction's, to be resumed: the same disc, read set, backend, files and sizes. */
function sameExtraction(kept: DiscExtractRecord, identity: DiscIdentity, backend: ExtractBackend, dir: string, set: DiscReadSet): boolean {
  if (kept.readSet !== set.version || kept.backend !== backend || kept.dir !== dir) return false;
  if (kept.identity.boot !== identity.boot || kept.identity.ver !== identity.ver || kept.identity.vmode !== identity.vmode) return false;
  if (kept.files.length !== set.files.length) return false;
  const sizes = new Map(kept.files.map((f) => [f.path, f.size]));
  return set.files.every((f) => sizes.get(f.path) === f.size);
}

/**
 * The backend to write with: OPFS where the browser offers it and the extraction's worker can open a sync access handle
 * (its probe), else IndexedDB where it opens; `prefer` (a kept extraction's) is tried first, so a resume keeps its own.
 * Neither: `denied` when the browser refused one (a `SecurityError`), else `unavailable`, each naming why. Also
 * `./discStreamWrite`'s (DSH-2), which closes the channel it is given.
 */
export async function chooseBackend(env: ExtractEnv, prefer?: ExtractBackend): Promise<{ backend: ExtractBackend; channel: WorkerChannel | null }> {
  const order: ExtractBackend[] = env.backend ? [env.backend] : prefer === 'indexeddb' ? ['indexeddb', 'opfs'] : ['opfs', 'indexeddb'];
  const why: string[] = [];
  let denied: unknown = null;
  for (const backend of order) {
    if (backend === 'opfs') {
      const storage = storageOf(env);
      if (!storage) { why.push('no origin private file system'); continue; }
      try {
        await storage.getDirectory();
      } catch (e) {
        if (named(e, 'SecurityError')) denied = e;
        why.push(`its private file system would not open: ${words(e)}`);
        continue;
      }
      let channel: WorkerChannel;
      try { channel = new WorkerChannel((env.worker ?? pageWorker)()); } catch (e) { why.push(`no worker would start: ${words(e)}`); continue; }
      let sync = false;
      try { sync = await channel.probe(env.probeTimeout ?? EXTRACT_PROBE_TIMEOUT); } catch { sync = false; }
      if (sync) return { backend, channel };
      channel.close();
      why.push('its worker cannot write the private file system');
    } else {
      try {
        await idbExtractStore(idbOf(env), 'probe').size('probe');
        return { backend, channel: null };
      } catch (e) {
        if (e instanceof ExtractStoreError && e.reason === 'denied') denied = e;
        why.push(`its IndexedDB would not open: ${words(e)}`);
      }
    }
  }
  if (denied) throw deniedError(denied);
  throw unavailableError(why);
}

/**
 * The page's end of the extraction's worker: one request at a time, progress forwarded, terminated by `close`. Exported
 * for `./discStreamWrite` (DSH-2), whose streamed file is its `stream*` requests.
 */
export class WorkerChannel {
  private pending: { resolve: (reply: ExtractReply) => void; reject: (e: unknown) => void; progress?: (n: number) => void } | null = null;
  private broken: unknown = null;

  constructor(private readonly worker: ExtractWorker) {
    worker.onmessage = (event) => {
      const reply = event.data;
      const pending = this.pending;
      if (!pending) return;
      if (reply.kind === 'progress') { pending.progress?.(reply.done); return; }
      this.pending = null;
      if (reply.kind === 'error') pending.reject(reply.reason
        ? new ExtractStoreError(reply.reason, reply.message)
        : Object.assign(new Error(reply.message), { name: reply.name }));
      else pending.resolve(reply);
    };
    worker.onerror = (event) => {
      const said = (event as ErrorEvent).message;
      this.broken = new DiscExtractError('failed', `the extraction's worker failed${said ? `: ${said}` : ''}`);
      const pending = this.pending;
      this.pending = null;
      pending?.reject(this.broken);
    };
  }

  private request(command: ExtractCommand, progress?: (n: number) => void): Promise<ExtractReply> {
    if (this.broken) return Promise.reject(this.broken);
    if (this.pending) return Promise.reject(new Error('the extraction\'s worker is busy'));
    return new Promise<ExtractReply>((resolve, reject) => {
      this.pending = { resolve, reject, progress };
      try { this.worker.postMessage(command); } catch (e) { this.pending = null; reject(e); }
    });
  }

  /** Whether the worker can open a sync access handle; false if it does not answer within `timeout` ms. */
  async probe(timeout: number): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<ExtractReply>((resolve) => { timer = setTimeout(() => resolve({ kind: 'probe', sync: false }), timeout); });
    try {
      const reply = await Promise.race([this.request({ kind: 'probe' }), late]);
      return reply.kind === 'probe' && reply.sync;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * One file written and hashed by the worker. The signal's abort is posted as `cancel`, read by the worker between
   * chunks; a cancel pressed before the worker listens is posted after the file (DA-8's review, F1).
   */
  async file(blob: Blob, dir: string, path: string, chunk: number, progress: (n: number) => void, signal?: AbortSignal): Promise<{ bytes: number; sha256: string }> {
    const onAbort = (): void => { this.worker.postMessage({ kind: 'cancel' }); };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const reply = this.request({ kind: 'file', blob, dir, path, chunk }, progress);
      if (signal?.aborted) onAbort();
      const done = await reply;
      if (done.kind !== 'file') throw new Error(`the extraction's worker answered ${done.kind}`);
      if (signal?.aborted) throw new DOMException('the extraction was cancelled', 'AbortError');
      return { bytes: done.bytes, sha256: done.sha256 };
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  /** A reply of the kind asked for, or the error that it is not. */
  private async expect<K extends ExtractReply['kind']>(command: ExtractCommand, kind: K): Promise<Extract<ExtractReply, { kind: K }>> {
    const reply = await this.request(command);
    if (reply.kind !== kind) throw new Error(`the extraction's worker answered ${reply.kind}, not ${kind}`);
    return reply as Extract<ExtractReply, { kind: K }>;
  }

  /** A streamed file opened in the worker (`./discExtractProtocol` `openOpfsStream`): answers the bytes already stored. */
  async streamOpen(dir: string, path: string, size: number, block: number): Promise<number> {
    return (await this.expect({ kind: 'open', dir, path, size, block }, 'opened')).stored;
  }

  /** The streamed file's next bytes, written (and flushed at a block's end) when this resolves. */
  async streamWrite(bytes: Uint8Array): Promise<void> {
    await this.expect({ kind: 'write', bytes }, 'wrote');
  }

  /** The streamed file finished: its bytes and SHA-256. */
  async streamFinish(): Promise<{ bytes: number; sha256: string }> {
    const done = await this.expect({ kind: 'finish' }, 'finished');
    return { bytes: done.bytes, sha256: done.sha256 };
  }

  /** The streamed file closed with what is stored kept. */
  async streamAbort(): Promise<void> {
    await this.expect({ kind: 'abort' }, 'aborted');
  }

  close(): void {
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.terminate();
  }
}

/** What `verifyExtraction` found: the files re-hashed, and those whose bytes are not what was written. */
export type ExtractVerdict = { readonly checked: readonly string[]; readonly bad: readonly string[] };

/**
 * Re-hashes every file the record has done against its recorded SHA-256 (on demand: slow on `VAGSTORE.ZAR`). A file whose
 * stored bytes differ, whose size differs, or that is gone is bad: marked not done in the record, so the next
 * `extractDisc` copies it again from its start. `onProgress` hears the bytes hashed of the bytes to hash.
 */
export async function verifyExtraction(
  env: ExtractEnv = {}, hooks: { onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<ExtractVerdict> {
  const records = env.records ?? pageRecords();
  const record = await storedExtraction(records);
  if (!record) return { checked: [], bad: [] };
  const store = openStore(record.backend, record.dir, env);
  const chunk = env.chunk ?? DISC_COPY_CHUNK;
  const done = record.files.filter((f) => f.done);
  const total = done.reduce((n, f) => n + f.size, 0);
  const checked: string[] = [];
  const bad: string[] = [];
  let at = 0;
  for (const f of done) {
    if (hooks.signal?.aborted) throw new DiscExtractError('cancelled', 'the check was stopped; nothing was changed');
    let blob: Blob | null;
    try { blob = await store.file(f.path); } catch (e) { if (e instanceof ExtractStoreError && e.reason === 'missing') blob = null; else throw asExtractError(e); }
    const before = at;
    const sha = blob && blob.size === f.size
      ? await hashBlob(blob, chunk, () => hooks.signal?.aborted === true, (n) => hooks.onProgress?.(before + n, total))
      : null;
    checked.push(f.path);
    if (sha !== f.sha256) bad.push(f.path);
    at = before + f.size;
    hooks.onProgress?.(at, total);
  }
  if (bad.length) {
    const files = record.files.map((f) => (bad.includes(f.path) ? { ...f, sha256: null, done: false } : f));
    await records.put(DISC_EXTRACT_SLOT, { ...record, files, when: null });
  }
  return { checked, bad };
}

/**
 * Deletes the extraction: its record, then every stored file of either backend (OPFS's `EXTRACT_ROOT`, the IndexedDB
 * database), any disc's. Nothing kept is no error. A refusal of the record's delete is thrown before any file is removed.
 */
export async function deleteExtraction(env: ExtractEnv = {}): Promise<void> {
  await (env.records ?? pageRecords()).delete(DISC_EXTRACT_SLOT);
  await removeStoredFiles(env);
}

/** Every stored file of either backend: OPFS's `EXTRACT_ROOT`, then the IndexedDB database. None is no error. */
async function removeStoredFiles(env: ExtractEnv): Promise<void> {
  const storage = storageOf(env);
  if (storage) {
    let root: CopyDirectoryHandle | null = null;
    try { root = await storage.getDirectory(); } catch { root = null; }
    if (root) {
      try {
        await root.removeEntry(EXTRACT_ROOT, { recursive: true });
      } catch (e) {
        if (!named(e, 'NotFoundError')) throw asExtractError(e);
      }
    }
  }
  await deleteExtractDb(idbOf(env));
}
