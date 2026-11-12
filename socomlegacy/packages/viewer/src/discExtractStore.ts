import type { CopyDirectoryHandle, CopyFileHandle } from './discCopy';
import type { CopyTarget } from './discCopyProtocol';
import { Sha256 } from './discExtractHash';

/**
 * **The extraction's store** (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, DX-1, FI.R6): where the
 * disc's read set is kept, file by file, in the player's own browser. One interface, two backends:
 * - **OPFS**, the origin private file system (`./pageStore` `pageOriginStorage`): a directory
 *   `EXTRACT_ROOT/<copyDirName(identity)>/<path>`, one file a disc file, written by the extraction's worker through sync
 *   access handles (`target`), read back as `File`s. Preferred.
 * - **IndexedDB** (`./pageStore` `pageIndexedDb`): a database of its own, `EXTRACT_DB`, one `Blob` a disc file keyed
 *   `<dir>/<path>` -- a `Blob`, not bytes, so the browser keeps it on disk and nothing is held in memory. The fallback
 *   where OPFS is missing or no worker can write it.
 *
 * **A file taken as a stream** (disc-share plan `docs/plans/2026-10-18-disc-share.md`, DSH-2, DSH.R4: the transfer's
 * receiver on a 1 GB device, where a received `VAGSTORE.ZAR` -- 577 MB -- may never be held whole). The IndexedDB store's
 * `stream` takes a file as bytes in any pieces and stores it a block (`EXTRACT_STREAM_BLOCK`) at a time, each block its
 * own `Blob` record keyed `[<dir>/<path>, <block index>]`, with a head record at `<dir>/<path>` (`{ stream: 1, block,
 * size, done }`: the block size, the bytes stored from the file's start, whether it is finished) put in the same
 * transaction as each block, so the head never claims a block that is not stored. At most one block is held. `size`,
 * `file` (a `Blob` made of the block `Blob`s, which the browser keeps on disk), `range` (only the blocks a byte range
 * spans) and `remove` read either form, so the start path and `./discExtractSource` read a streamed file as a whole one.
 * A stream opened again with the same size and block carries on from its last stored block, its SHA-256 rebuilt by
 * re-reading the stored part; another block size, or a size that does not fit, starts the file again. `write` of a
 * `ReadableStream` goes through it (DX-1's review F4's held-in-memory stream is gone); `write` of a `Blob` is one record,
 * as before. OPFS's streamed write is its worker's (`./discExtractProtocol` `openOpfsStream`); the one writer over both
 * is `./discStreamWrite` `openStreamedFile`.
 *
 * Which backend an extraction uses is `./discExtract`'s choice (`chooseExtractBackend`) and is kept in its record. A
 * **browser adaptation** (FI.R2, DA.R3): the original reads its own disc; nothing here is the game's, and nothing
 * leaves the player's machine.
 */

/** The OPFS directory holding the extraction: one directory below it per disc identity. Ours (beside DA-8's `s2u.disc.copy`). */
export const EXTRACT_ROOT = 's2u.disc.extract';
/** The IndexedDB database holding the extraction where OPFS cannot. Ours (beside `s2u.page` and `s2u.card`). */
export const EXTRACT_DB = 's2u.disc.extract';
/** Its schema version: 1, one object store. */
export const EXTRACT_DB_VERSION = 1;
/** Its object store: a `Blob` a disc file, keyed `<dir>/<path>` (or a streamed file's head there and its blocks beside it). */
export const EXTRACT_DB_FILES = 'files';
/**
 * The block a streamed file is stored (IndexedDB) and flushed (OPFS) in: 4 MiB. **An adaptation value, ours** (no
 * original; DSH-2): about one block is what the writer holds, so small beside a 1 GB page's budget; big enough that the
 * 577 MB `VAGSTORE.ZAR` is 138 records and as many transactions. Chosen, not measured against another size.
 */
export const EXTRACT_STREAM_BLOCK = 4 * 1024 * 1024;

/** The two backends, by the name the record keeps. */
export type ExtractBackend = 'opfs' | 'indexeddb';

/**
 * Why a store call failed: `missing` (no such file stored), `unavailable` (the backend cannot be opened), `denied` (the
 * browser refuses it: a `SecurityError`, a private window), `quota` (a write refused for space), `failed` (anything else).
 */
export type ExtractStoreReason = 'missing' | 'unavailable' | 'denied' | 'quota' | 'failed';

export class ExtractStoreError extends Error {
  override readonly name = 'ExtractStoreError';
  constructor(readonly reason: ExtractStoreReason, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
  }
}

/** What either backend does. Paths are the read set's (`RUN/MP2.ZDB`). */
export interface ExtractStore {
  readonly backend: ExtractBackend;
  /** The identity's directory (`./discCopy` `copyDirName`). */
  readonly dir: string;
  has(path: string): Promise<boolean>;
  /** The stored file's size, or null when none is stored: the start-up's cheap check. */
  size(path: string): Promise<number | null>;
  /** The stored file as a `Blob` (OPFS: its `File`); a `missing` refusal when none is stored. */
  file(path: string): Promise<Blob>;
  /** `length` bytes at `offset` of the stored file (a streamed one: only the blocks they span); past its end, a refusal. */
  range(path: string, offset: number, length: number): Promise<Uint8Array>;
  /** Stores `data` at `path` over what was there; answers the bytes stored. */
  write(path: string, data: Blob | ReadableStream<Uint8Array>): Promise<number>;
  /** Removes this identity's every stored file. Nothing stored is no error. */
  remove(): Promise<void>;
}

/** A file's handle as the worker writes it: its sync access handle, and its `File` (a resumed stream re-reads it). */
export interface StreamTarget extends CopyTarget {
  getFile(): Promise<Blob>;
}

/** The OPFS store, with the file handle its worker writes through. */
export interface OpfsExtractStore extends ExtractStore {
  readonly backend: 'opfs';
  /** The file's handle (made, with its directories), resolved inside the worker that opens its sync access handle. */
  target(path: string): Promise<StreamTarget>;
}

/**
 * A file being written as a stream (the module's header): `stored` the bytes already stored when it was opened (a
 * resume's start; the file's size when it was stored whole); `write` takes the next bytes in order (awaited before the
 * next); `finish` stores what is held and answers the file's bytes and SHA-256 (refused if they are not the size it
 * was opened with); `abort` drops what is held and keeps every block stored, for the next open to carry on from.
 */
export interface ExtractStream {
  readonly stored: number;
  write(bytes: Uint8Array): Promise<void>;
  finish(): Promise<{ bytes: number; sha256: string }>;
  abort(): Promise<void>;
}

/** The IndexedDB store, with its streamed write. */
export interface IdbExtractStore extends ExtractStore {
  readonly backend: 'indexeddb';
  /**
   * Opens `path` as a stream of `size` bytes (null: not known, and nothing resumed) in blocks of `options.block`
   * (`EXTRACT_STREAM_BLOCK`). With `resume` (the default) a file stored before at this size and block carries on from
   * its last stored block, else what was stored at `path` goes first.
   */
  stream(path: string, size: number | null, options?: { block?: number; resume?: boolean }): Promise<ExtractStream>;
}

/** A `FileSystemWritableFileStream`'s calls the page-side write uses. */
interface WritableLike {
  write(data: Blob | Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort?(reason?: unknown): Promise<void>;
}
/** An OPFS file handle with the page-side writer (`createWritable`), where the browser has it. */
type WritableFileHandle = CopyFileHandle & { createWritable?(options?: { keepExistingData?: boolean }): Promise<WritableLike> };

const named = (e: unknown, ...names: string[]): boolean =>
  typeof e === 'object' && e !== null && names.includes(String((e as { name?: unknown }).name));
const words = (e: unknown): string => (e instanceof Error || e instanceof DOMException ? e.message : String(e));

/** A browser refusal as a store error: `SecurityError` denied, `QuotaExceededError` quota, else `fallback`. */
function storeError(e: unknown, fallback: ExtractStoreReason, what: string): ExtractStoreError {
  if (e instanceof ExtractStoreError) return e;
  const reason: ExtractStoreReason = named(e, 'SecurityError') ? 'denied' : named(e, 'QuotaExceededError') ? 'quota' : fallback;
  return new ExtractStoreError(reason, `${what}: ${words(e)}`, e);
}

/** A stored path's parts: no empty, `.` or `..` segment (OPFS names). */
function partsOf(path: string): string[] {
  const parts = path.split('/');
  if (parts.some((p) => p === '' || p === '.' || p === '..')) throw new ExtractStoreError('failed', `the path ${JSON.stringify(path)} cannot be stored`);
  return parts;
}

/** `length` bytes at `offset` of `blob`, or a refusal past its end. */
async function rangeOf(blob: Blob, path: string, offset: number, length: number): Promise<Uint8Array> {
  if (!(offset >= 0 && length >= 0 && offset + length <= blob.size)) {
    throw new ExtractStoreError('failed', `${length} bytes at ${offset} of the stored ${path} run past its ${blob.size} bytes`);
  }
  return length === 0 ? new Uint8Array(0) : new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());
}

/**
 * The OPFS store of the identity directory `dir`, below `EXTRACT_ROOT` in the origin root `origin` answers (the
 * browser's `navigator.storage.getDirectory()`, through `./pageStore`; a fake in the test). The page writes through
 * `createWritable` where the browser has it (`write`); the extraction writes through its worker (`target`).
 */
export function opfsExtractStore(origin: () => Promise<CopyDirectoryHandle>, dir: string): OpfsExtractStore {
  partsOf(dir);
  const base = async (create: boolean): Promise<CopyDirectoryHandle> =>
    (await (await origin()).getDirectoryHandle(EXTRACT_ROOT, { create })).getDirectoryHandle(dir, { create });
  const handle = async (path: string, create: boolean): Promise<WritableFileHandle> => {
    const parts = partsOf(path);
    let at = await base(create);
    for (const part of parts.slice(0, -1)) at = await at.getDirectoryHandle(part, { create });
    return (await at.getFileHandle(parts[parts.length - 1]!, { create })) as WritableFileHandle;
  };
  const absent = (e: unknown): boolean => named(e, 'NotFoundError', 'TypeMismatchError');
  const store: OpfsExtractStore = {
    backend: 'opfs',
    dir,
    async has(path) { return (await store.size(path)) !== null; },
    async size(path) {
      try {
        return (await (await handle(path, false)).getFile()).size;
      } catch (e) {
        if (absent(e)) return null;
        throw storeError(e, 'failed', `the stored ${path} could not be read`);
      }
    },
    async file(path) {
      try {
        return await (await handle(path, false)).getFile();
      } catch (e) {
        if (absent(e)) throw new ExtractStoreError('missing', `${path} is not stored in this browser`, e);
        throw storeError(e, 'failed', `the stored ${path} could not be read`);
      }
    },
    async write(path, data) {
      let file: WritableFileHandle;
      try { file = await handle(path, true); } catch (e) { throw storeError(e, 'failed', `${path} could not be made in this browser's storage`); }
      if (typeof file.createWritable !== 'function') {
        throw new ExtractStoreError('unavailable', 'this browser writes its private files only from a worker (no createWritable)');
      }
      let out: WritableLike;
      try { out = await file.createWritable({ keepExistingData: false }); } catch (e) { throw storeError(e, 'failed', `${path} could not be opened for writing`); }
      try {
        if (data instanceof Blob) await out.write(data);
        else {
          const reader = data.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            await out.write(value);
          }
        }
        await out.close();
      } catch (e) {
        try { await out.abort?.(e); } catch { /* already closed */ }
        throw storeError(e, 'failed', `${path} could not be written`);
      }
      return (await file.getFile()).size;
    },
    async range(path, offset, length) { return rangeOf(await store.file(path), path, offset, length); },
    async remove() {
      try {
        await (await (await origin()).getDirectoryHandle(EXTRACT_ROOT)).removeEntry(dir, { recursive: true });
      } catch (e) {
        if (absent(e)) return;
        throw storeError(e, 'failed', named(e, 'NoModificationAllowedError')
          ? 'the stored files are in use (another tab may be extracting or reading them); close the other tab and try again'
          : 'the stored files could not be removed');
      }
    },
    async target(path) {
      try {
        return (await handle(path, true)) as unknown as StreamTarget;
      } catch (e) {
        throw storeError(e, 'failed', `${path} could not be made in this browser's storage`);
      }
    },
  };
  return store;
}

/** Opens `EXTRACT_DB` on the factory `factory` answers (asked for at each call), made at its first open. */
function openExtractDb(factory: () => IDBFactory | null | undefined): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      const idb = factory();
      if (!idb) { reject(new ExtractStoreError('unavailable', 'this browser offers no IndexedDB')); return; }
      req = idb.open(EXTRACT_DB, EXTRACT_DB_VERSION);
    } catch (e) {
      reject(storeError(e, 'unavailable', 'this browser would not open its IndexedDB'));
      return;
    }
    let settled = false;
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(EXTRACT_DB_FILES)) req.result.createObjectStore(EXTRACT_DB_FILES);
    };
    req.onsuccess = () => {
      if (settled) { req.result.close(); return; }
      settled = true;
      resolve(req.result);
    };
    req.onerror = () => { settled = true; reject(storeError(req.error, 'unavailable', 'this browser would not open its IndexedDB')); };
    req.onblocked = () => {
      settled = true;
      reject(new ExtractStoreError('unavailable', 'another tab holds an older version of the extraction\'s database; close it and try again'));
    };
  });
}

/** One transaction on the files' store, the database closed after; `run` answers the value to resolve with. */
async function transact<T>(
  factory: () => IDBFactory | null | undefined, mode: IDBTransactionMode, what: string,
  run: (files: IDBObjectStore, done: (value: T) => void) => void,
): Promise<T> {
  const db = await openExtractDb(factory);
  try {
    return await new Promise<T>((resolve, reject) => {
      let value: T | undefined;
      let tx: IDBTransaction;
      try { tx = db.transaction(EXTRACT_DB_FILES, mode); } catch (e) { reject(storeError(e, 'failed', what)); return; }
      tx.oncomplete = () => resolve(value as T);
      tx.onabort = () => reject(storeError(tx.error ?? new Error('the transaction was aborted'), 'failed', what));
      try {
        run(tx.objectStore(EXTRACT_DB_FILES), (v) => { value = v; });
      } catch (e) {
        reject(storeError(e, 'failed', what));
        try { tx.abort(); } catch { /* already finished */ }
      }
    });
  } finally {
    db.close();
  }
}

/** A streamed file's head record, at its key (the module's header). */
type StreamHead = { readonly stream: 1; readonly block: number; readonly size: number; readonly done: boolean };
const isHead = (v: unknown): v is StreamHead => typeof v === 'object' && v !== null && !(v instanceof Blob)
  && (v as StreamHead).stream === 1 && Number.isInteger((v as StreamHead).block) && (v as StreamHead).block > 0
  && Number.isInteger((v as StreamHead).size) && (v as StreamHead).size >= 0 && typeof (v as StreamHead).done === 'boolean';
/** What a key holds: a whole file's `Blob`, a streamed file's head, or nothing. */
type Stored = Blob | StreamHead | undefined;
const storedOf = (v: unknown): Stored => (v instanceof Blob ? v : isHead(v) ? v : undefined);
/** The blocks of a head, by count. */
const blocksOf = (head: StreamHead): number => Math.ceil(head.size / head.block);

/**
 * The IndexedDB store of the identity directory `dir`, in `EXTRACT_DB` on the factory `factory` answers (`./pageStore`
 * `pageIndexedDb`; fake-indexeddb in the test). Each call opens the database and closes it after, as the page's records
 * do, so no connection is held across a tab's life. A file is one `Blob` (`write` of a `Blob`) or a stream of blocks
 * (`stream`, `write` of a `ReadableStream`; the module's header).
 */
export function idbExtractStore(factory: () => IDBFactory | null | undefined, dir: string): IdbExtractStore {
  partsOf(dir);
  const key = (path: string): string => `${dir}/${partsOf(path).join('/')}`;
  /**
   * The key's value and, of a streamed file, its blocks `first` to `last` (clamped to those stored; none by default), in
   * one transaction.
   */
  const read = (path: string, first = 0, last = -1): Promise<{ value: Stored; blocks: unknown[] }> =>
    transact<{ value: Stored; blocks: unknown[] }>(factory, 'readonly', `the stored ${path} could not be read`, (files, done) => {
      const k = key(path);
      const r = files.get(k);
      r.onsuccess = () => {
        const value = storedOf(r.result);
        const blocks: unknown[] = [];
        done({ value, blocks });
        if (!isHead(value)) return;
        const end = Math.min(last, blocksOf(value) - 1);
        for (let i = first; i <= end; i++) {
          const at = i - first;
          const b = files.get([k, i]);
          b.onsuccess = () => { blocks[at] = b.result; };
        }
      };
    });
  /** Removes what `path` holds, a streamed file's every block with it, inside the transaction `files`, then calls `then`. */
  const clear = (files: IDBObjectStore, k: string, then: () => void = () => undefined): void => {
    const r = files.get(k);
    r.onsuccess = () => {
      const value = storedOf(r.result);
      if (isHead(value)) for (let i = 0; i < blocksOf(value); i++) files.delete([k, i]);
      files.delete(k);
      then();
    };
  };
  const blocksBlob = (path: string, blocks: unknown[], count: number): Blob => {
    if (blocks.length !== count || !blocks.every((b) => b instanceof Blob)) {
      throw new ExtractStoreError('failed', `a block of the stored ${path} is missing`);
    }
    return new Blob(blocks as Blob[]);
  };
  const store: IdbExtractStore = {
    backend: 'indexeddb',
    dir,
    async has(path) { return (await store.size(path)) !== null; },
    async size(path) {
      const { value } = await read(path);   // the key only: no block
      return value instanceof Blob ? value.size : value ? value.size : null;
    },
    async file(path) {
      const { value, blocks } = await read(path, 0, Number.POSITIVE_INFINITY);
      if (!value) throw new ExtractStoreError('missing', `${path} is not stored in this browser`);
      return value instanceof Blob ? value : blocksBlob(path, blocks, blocksOf(value));
    },
    async range(path, offset, length) {
      const head = (await read(path)).value;
      if (!head) throw new ExtractStoreError('missing', `${path} is not stored in this browser`);
      if (head instanceof Blob) return rangeOf(head, path, offset, length);
      if (!(offset >= 0 && length >= 0 && offset + length <= head.size)) {
        throw new ExtractStoreError('failed', `${length} bytes at ${offset} of the stored ${path} run past its ${head.size} bytes`);
      }
      if (length === 0) return new Uint8Array(0);
      const first = Math.floor(offset / head.block);
      const last = Math.floor((offset + length - 1) / head.block);
      const { value, blocks } = await read(path, first, last);
      if (!isHead(value) || value.block !== head.block || value.size < offset + length) {
        throw new ExtractStoreError('failed', `the stored ${path} changed while it was read`);
      }
      const out = new Uint8Array(length);
      const parts = blocksBlob(path, blocks, last - first + 1);
      const from = offset - first * head.block;
      out.set(new Uint8Array(await parts.slice(from, from + length).arrayBuffer()));
      return out;
    },
    async write(path, data) {
      if (!(data instanceof Blob)) {
        const s = await store.stream(path, null, { resume: false });
        const reader = data.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            await s.write(value);
          }
          return (await s.finish()).bytes;
        } catch (e) {
          await s.abort();
          try { await reader.cancel(e); } catch { /* already closed */ }
          throw storeError(e, 'failed', `${path} could not be stored`);
        }
      }
      const k = key(path);
      await transact<void>(factory, 'readwrite', `${path} could not be stored`, (files) => { clear(files, k, () => { files.put(data, k); }); });
      return data.size;
    },
    async stream(path, size, options = {}) {
      const block = options.block ?? EXTRACT_STREAM_BLOCK;
      if (!(Number.isInteger(block) && block > 0)) throw new RangeError(`a stream's block is ${block} bytes`);
      if (size !== null && !(Number.isInteger(size) && size >= 0)) throw new RangeError(`a stream of ${size} bytes`);
      const k = key(path);
      const was = (await read(path)).value;
      // What is kept: a file stored whole at this size, or a stream of this size and block (its stored part whole blocks).
      let stored = 0;
      let finished = false;
      if (size !== null && options.resume !== false && was) {
        if (was instanceof Blob) { if (was.size === size) { stored = size; finished = true; } }
        else if (was.block === block && (was.done ? was.size === size : was.size <= size && was.size % block === 0)) {
          stored = was.size;
          finished = was.done;
        }
      }
      if (stored === 0 && was) {
        finished = false;
        await transact<void>(factory, 'readwrite', `the stored ${path} could not be replaced`, (files) => { clear(files, k); });
      }
      // The hash state rebuilt by re-reading the stored part, a block at a time.
      const hash = new Sha256();
      for (let at = 0; at < stored; at += block) hash.update(await store.range(path, at, Math.min(block, stored - at)));

      const buf = new Uint8Array(size === null ? block : Math.min(block, size - stored));
      let fill = 0;
      let at = stored;
      let closed = false;
      const live = (): void => { if (closed) throw new ExtractStoreError('failed', `the stream of ${path} is closed`); };
      const flush = async (): Promise<void> => {
        const index = Math.floor((at - fill) / block);
        const blob = new Blob([buf.subarray(0, fill)]);
        const head: StreamHead = { stream: 1, block, size: at, done: false };
        await transact<void>(factory, 'readwrite', `${path} could not be stored`, (files) => {
          files.put(blob, [k, index]);
          files.put(head, k);
        });
        fill = 0;
      };
      const fail = (e: unknown): never => { closed = true; throw storeError(e, 'failed', `${path} could not be stored`); };
      return {
        stored,
        async write(bytes) {
          live();
          if (size !== null && at + bytes.length > size) {
            closed = true;
            throw new ExtractStoreError('failed', `${path}: ${at + bytes.length} bytes given of a ${size}-byte file`);
          }
          hash.update(bytes);
          try {
            for (let put = 0; put < bytes.length;) {
              const n = Math.min(buf.length - fill, bytes.length - put);
              buf.set(bytes.subarray(put, put + n), fill);
              fill += n;
              put += n;
              at += n;
              if (fill === buf.length) await flush();
            }
          } catch (e) { fail(e); }
        },
        async finish() {
          live();
          closed = true;
          if (size !== null && at !== size) {
            throw new ExtractStoreError('failed', `${path}: ${at} bytes given of a ${size}-byte file`);
          }
          try {
            if (fill > 0) await flush();
            if (!finished) {
              const head: StreamHead = { stream: 1, block, size: at, done: true };
              await transact<void>(factory, 'readwrite', `${path} could not be stored`, (files) => { files.put(head, k); });
            }
          } catch (e) { fail(e); }
          return { bytes: at, sha256: hash.hex() };
        },
        async abort() { closed = true; fill = 0; },
      };
    },
    async remove() {
      try {
        await transact<void>(factory, 'readwrite', 'the stored files could not be removed', (files) => {
          const r = files.openCursor();
          r.onsuccess = () => {
            const cursor = r.result;
            if (!cursor) return;
            // A whole file's or a head's key is `<dir>/<path>`; a block's, `[<dir>/<path>, <index>]`.
            const k = Array.isArray(cursor.key) ? cursor.key[0] : cursor.key;
            if (String(k).startsWith(`${dir}/`)) cursor.delete();
            cursor.continue();
          };
        });
      } catch (e) {
        if (e instanceof ExtractStoreError && e.reason === 'unavailable') return;   // no database: nothing stored
        throw e;
      }
    },
  };
  return store;
}

/**
 * Deletes `EXTRACT_DB` whole (`./discExtract` `deleteExtraction`): every identity's files. No database is no error.
 * Another tab holding the database open blocks the delete (`onblocked`): that is refused at once, `unavailable`, in words
 * that name the cure (LATER 578: unanswered, the promise never settled, and a disc share receiver's `prepare` waited on
 * it). The browser keeps the delete queued; it runs once the other tab lets go, and a later removal finds nothing.
 */
export function deleteExtractDb(factory: () => IDBFactory | null | undefined): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let idb: IDBFactory | null | undefined;
    try { idb = factory(); } catch { resolve(); return; }
    if (!idb) { resolve(); return; }
    let req: IDBOpenDBRequest;
    try { req = idb.deleteDatabase(EXTRACT_DB); } catch (e) { reject(storeError(e, 'failed', 'the stored files could not be removed')); return; }
    req.onsuccess = () => resolve();
    req.onerror = () => reject(storeError(req.error, 'failed', 'the stored files could not be removed'));
    req.onblocked = () => {
      reject(new ExtractStoreError('unavailable', 'another tab of this site holds the stored game files, so they could not be removed; close it and try again'));
    };
  });
}
