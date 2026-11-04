import { DirectoryAssetSource, discIdentity, type AssetSource, type DiscIdentity } from '@s2u/archive';
import { DISC_COPY_CHUNK, type CopyCommand, type CopyFileJob, type CopyReply, type CopyTarget } from './discCopyProtocol';
import { assetSourceFor, type DiscEntry, type DiscRequest } from './discSource';
import { DISC_COPY_SLOT, pageOriginStorage, pageRecords, type RecordStore } from './pageStore';

/**
 * **Keep a copy in this browser** (disc-access plan `docs/plans/2026-10-11-disc-access.md`, DA-8, DA.R6; research 306
 * §3, §10): once a disc is validated, the player may ask for the **whole** disc -- the image, or every file of a picked
 * folder (DA.R6: no subset, so `IsoAssetSource` and `DirectoryAssetSource` read it unchanged, the movies and the
 * streams with it) -- to be copied into the page's origin private file system (OPFS, `navigator.storage
 * .getDirectory()`, named in `./pageStore` `pageOriginStorage`). The next visit starts from it with no chooser and no
 * permission (DA.R5's first step, `./discMemory` `startOrder`'s `copy`), which is the pad-only player's path.
 *
 * `copyDisc` reads the disc's identity (DA-2, DA.R8) and checks the quota first (`estimate()`; refused with the
 * shortfall), asks `persist()` (the answer recorded, not required), has `./discCopyWorker` write the bytes by sync
 * access handles in chunks (progress per chunk; an `AbortSignal` cancels between chunks and the partial copy is
 * removed), verifies the copy (its size; its `SYSTEM.CNF` read back to the same identity; a SHA-256 of
 * `DISC_COPY_CHECK_PATH` read through the archive's own reader over the copy, equal to the disc's), and records it in
 * `./pageStore`'s `disc.copy` slot. `storedCopyRequest` / `storedCopySource` give the start path the copy's request and
 * source; `deleteStoredCopy` frees it.
 *
 * A **browser adaptation** (DA.R2, DA.R3) with no original: the original reads its own disc. The copy is the disc's
 * own bytes, read back by the same readers by the same paths, so nothing the game reads changes. **Nothing leaves the
 * player's machine**: no network, no upload; the bytes go from the player's disc to the player's own browser storage.
 * This module has no control of its own: "Keep a copy in this browser", its progress and cancel, and "Delete the stored
 * copy" are the console launcher's (row CX-10); the words of what is kept are DA-9's.
 */

/**
 * The room left beyond the copy's own size before a copy starts: 256 MiB. **An adaptation value, ours** (no original):
 * the page's other origin data (the card, the page's records, a build's caches) must still fit after a 4.38 GB copy,
 * and `estimate()` is an approximation (browsers round and pad it). Chosen, not measured.
 */
export const DISC_COPY_MARGIN = 256 * 1024 * 1024;

/** The OPFS directory holding the copy: one directory below it per disc identity (`copyDirName`). Ours. */
export const DISC_COPY_ROOT = 's2u.disc.copy';

/** The copied image's file name in its directory. Ours. */
export const DISC_COPY_IMAGE = 'disc.iso';

/**
 * The file whose hash the verification compares: `RUN/UI/READERC.ZAR`, the front end's first dialog archive -- the
 * file `./discPrompt` `openFrontEndDisc` probes (`FRONT_END_FILES.dialogs[0]`), so a copy that opens is a copy whose
 * front end reads what the disc's does.
 */
export const DISC_COPY_CHECK_PATH = 'RUN/UI/READERC.ZAR';

/** The record in `DISC_COPY_SLOT`. `v` is this record's own version, ours: a later shape bumps it. */
export type DiscCopyRecord = {
  readonly v: 1;
  /** An image (`DISC_COPY_IMAGE`) or a folder's files. */
  readonly kind: 'image' | 'folder';
  /** The disc's `SYSTEM.CNF` (DA-2), read at the copy and again from the copy. */
  readonly identity: DiscIdentity;
  /** Bytes copied, and files. */
  readonly size: number;
  readonly files: number;
  /** Its directory below `DISC_COPY_ROOT` (`copyDirName`). */
  readonly dir: string;
  /** When it was made (ms since the epoch). */
  readonly when: number;
  /** `persist()`'s answer: true, the browser will not evict it under storage pressure without asking. */
  readonly persisted: boolean;
};

/**
 * Why a copy was refused or stopped: `refused` (not a SOCOM II disc, or no `DISC_COPY_CHECK_PATH`: DA.R8), `unavailable`
 * (no OPFS, or no worker), `quota` (`shortfall` the bytes missing, or null when the browser refused a write without an
 * estimate saying so), `cancelled` (the signal), `mismatch` (the verification: the copy is removed), `failed` (anything
 * else: a read of the disc, a write, the record).
 */
export type DiscCopyReason = 'refused' | 'unavailable' | 'quota' | 'cancelled' | 'mismatch' | 'failed';

export class DiscCopyError extends Error {
  override readonly name = 'DiscCopyError';
  constructor(readonly reason: DiscCopyReason, message: string, readonly shortfall: number | null = null, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
  }
}

/** The calls of an OPFS `FileSystemFileHandle` the page uses (the worker opens its sync access handle). */
export interface CopyFileHandle {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<File>;
}
/** The calls of an OPFS `FileSystemDirectoryHandle` the page uses (`values()` is its async iterator). */
export interface CopyDirectoryHandle {
  readonly kind: 'directory';
  readonly name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<CopyDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<CopyFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  values(): AsyncIterable<CopyFileHandle | CopyDirectoryHandle>;
}
/** The calls of the browser's `StorageManager` the copy uses. */
export interface CopyStorage {
  getDirectory(): Promise<CopyDirectoryHandle>;
  estimate?(): Promise<{ quota?: number; usage?: number }>;
  persist?(): Promise<boolean>;
}
/** The page's end of the copy's worker (a `Worker`; an in-process fake in the test). */
export interface CopyWorker {
  postMessage(message: CopyCommand): void;
  onmessage: ((event: MessageEvent<CopyReply>) => void) | null;
  onerror: ((event: Event) => void) | null;
  terminate(): void;
}

/** What the copy runs over: the page's own by default; a test passes fakes. */
export type CopyEnv = {
  /** The origin storage (`./pageStore` `pageOriginStorage`); null: none. */
  readonly storage?: CopyStorage | null;
  /** The page's records (`./pageStore` `pageRecords`). */
  readonly records?: RecordStore;
  /** Makes the copy's worker (`./discCopyWorker`, a module worker). */
  readonly worker?: () => CopyWorker;
  /** Bytes a chunk (`DISC_COPY_CHUNK`). */
  readonly chunk?: number;
  readonly now?: () => number;
};

/** What the caller hears: progress per chunk (bytes done, of the total), and its cancel. */
export type CopyHooks = {
  readonly onProgress?: (done: number, total: number) => void;
  readonly signal?: AbortSignal;
};

/**
 * The page's worker, registered as `./worker.ts` and `./movieWorker.ts` are, so a build bundles it. The entry is loaded
 * only here, by URL: this module imports the protocol (`./discCopyProtocol`), never the entry (DA-8's review, F4).
 */
const pageWorker = (): CopyWorker =>
  new Worker(new URL('./discCopyWorker.ts', import.meta.url), { type: 'module' }) as unknown as CopyWorker;

const storageOf = (env: CopyEnv): CopyStorage | null =>
  env.storage === undefined ? (pageOriginStorage() as unknown as CopyStorage | null) : env.storage;

/**
 * The copy's directory name for a disc identity: boot name, `VER`, `VMODE`, joined by `_` (`SCUS_972.75_1.02_NTSC`),
 * a missing field `NONE`, anything but letters, digits, `.`, `_` and `-` made `_`.
 */
export function copyDirName(identity: DiscIdentity): string {
  return [identity.boot, identity.ver ?? 'NONE', identity.vmode ?? 'NONE'].join('_').replace(/[^A-Za-z0-9._-]/g, '_');
}

const words = (e: unknown): string => (e instanceof Error || e instanceof DOMException ? e.message : String(e));
const named = (e: unknown, name: string): boolean => typeof e === 'object' && e !== null && (e as { name?: unknown }).name === name;
const bytesSaid = (n: number): string => `${n.toLocaleString('en-US')} bytes`;
const cancelled = (): DiscCopyError => new DiscCopyError('cancelled', 'the copy was cancelled; nothing of it is kept');

/**
 * Copies the whole disc `request` names -- an image, or every file of a folder -- into the page's OPFS, verifies it and
 * records it (see the module's header). Call it after the disc is validated (`./discPrompt` `openFrontEndDisc`), on the
 * player's own ask (DA.R6: opt-in). Resolves with the record; rejects with a `DiscCopyError` -- and then nothing of the
 * new copy is kept. **A new copy replaces the one kept**: the space the old one holds counts as free in the quota
 * check, and once that check passes the old copy (and any partial a closed tab left) is deleted before the new one is
 * written, so a copy that then fails leaves none.
 */
export async function copyDisc(request: DiscRequest, hooks: CopyHooks = {}, env: CopyEnv = {}): Promise<DiscCopyRecord> {
  const { signal, onProgress } = hooks;
  const records = env.records ?? pageRecords();
  if (signal?.aborted) throw cancelled();
  // The stored copy's own files (DA-8's review, F2): copying them would delete them before they are read.
  if (isStoredCopy(request)) {
    throw new DiscCopyError('refused', 'this disc is the stored copy itself: it is already kept in this browser, so there is nothing to copy');
  }

  // Identity before anything else (DA.R8), then the file the verification hashes. A folder the reader refuses (one
  // path named twice) is refused here, in its words.
  let source: AssetSource;
  let identity: DiscIdentity;
  let files: { path: string; blob: Blob }[];
  try {
    source = assetSourceFor(request);
    identity = await discIdentity(source);
    await (source as AssetSource & { size(path: string): Promise<number> }).size(DISC_COPY_CHECK_PATH);
    files = request.kind === 'iso'
      ? [{ path: DISC_COPY_IMAGE, blob: request.file as Blob }]
      : await folderFiles(request.entries);
  } catch (e) {
    throw new DiscCopyError('refused', words(e), null, e);
  }
  const size = files.reduce((n, f) => n + f.blob.size, 0);
  if (signal?.aborted) throw cancelled();

  const storage = storageOf(env);
  if (!storage) throw new DiscCopyError('unavailable', 'this browser offers no origin private file system, so it cannot keep a copy of the disc');
  let kept: DiscCopyRecord | null;
  try { kept = await storedCopy(records); } catch (e) { throw new DiscCopyError('failed', `the page's records could not be read: ${words(e)}`, null, e); }
  let estimate: { quota?: number; usage?: number } | null = null;
  try { estimate = typeof storage.estimate === 'function' ? await storage.estimate() : null; } catch { estimate = null; }
  if (estimate && typeof estimate.quota === 'number') {
    const free = estimate.quota - (estimate.usage ?? 0) + (kept?.size ?? 0);
    const need = size + DISC_COPY_MARGIN;
    if (free < need) {
      throw new DiscCopyError('quota',
        `this browser can keep ${bytesSaid(Math.max(0, free))} more for this page; the copy needs ${bytesSaid(need)} (the disc's ${bytesSaid(size)} and ${bytesSaid(DISC_COPY_MARGIN)} to spare): ${bytesSaid(need - free)} short`,
        need - free);
    }
  }
  let persisted = false;
  try { persisted = typeof storage.persist === 'function' && (await storage.persist()) === true; } catch { persisted = false; }
  if (signal?.aborted) throw cancelled();

  let copies: CopyDirectoryHandle;
  try {
    copies = await (await storage.getDirectory()).getDirectoryHandle(DISC_COPY_ROOT, { create: true });
  } catch (e) {
    throw new DiscCopyError('unavailable', `the browser would not open its storage for the copy: ${words(e)}`, null, e);
  }
  // The old copy goes: its record first, so none ever points at a half-removed copy; then every directory left. A
  // directory another tab holds open (a sync access handle: `NoModificationAllowedError`) cannot go; the copy stops.
  if (kept) {
    try { await records.delete(DISC_COPY_SLOT); } catch (e) { throw new DiscCopyError('failed', `the kept copy's record could not be removed: ${words(e)}`, null, e); }
  }
  try {
    for (const name of await childNames(copies)) await copies.removeEntry(name, { recursive: true });
  } catch (e) {
    throw new DiscCopyError('failed', named(e, 'NoModificationAllowedError')
      ? `the kept copy is in use (another tab may be copying or reading it): ${words(e)}; close the other tab and try again`
      : `the kept copy could not be removed: ${words(e)}`, null, e);
  }

  const dirName = copyDirName(identity);
  try {
    const dir = await copies.getDirectoryHandle(dirName, { create: true });
    const jobs: CopyFileJob[] = [];
    for (const f of files) jobs.push({ blob: f.blob, target: (await fileAt(dir, f.path)) as unknown as CopyTarget });
    await runWorker(jobs, env.chunk ?? DISC_COPY_CHUNK, signal, onProgress, env.worker ?? pageWorker);
    if (signal?.aborted) throw cancelled();
    await verify(request.kind === 'iso' ? 'image' : 'folder', dir, files, source, identity);
    const record: DiscCopyRecord = {
      v: 1, kind: request.kind === 'iso' ? 'image' : 'folder', identity: { ...identity }, size, files: files.length,
      dir: dirName, when: (env.now ?? Date.now)(), persisted,
    };
    await records.put(DISC_COPY_SLOT, record);
    return record;
  } catch (e) {
    // Every access handle is closed before the worker answers, so the partial copy can go. A removal the browser
    // refuses leaves bytes the next copy or `deleteStoredCopy` sweeps; the copy's own failure is what is said.
    try { await copies.removeEntry(dirName, { recursive: true }); } catch { /* swept later */ }
    if (e instanceof DiscCopyError) throw e;
    if (named(e, 'QuotaExceededError')) throw new DiscCopyError('quota', `the browser refused the copy's space: ${words(e)}`, null, e);
    if (named(e, 'AbortError')) throw cancelled();
    throw new DiscCopyError('failed', `the copy failed: ${words(e)}`, null, e);
  }
}

/**
 * A folder's files at the paths `DirectoryAssetSource` names them (DA-1: upper case, no `;1`, the picked folder's own
 * name stripped), so the stored folder lists and reads as the picked one. The reader's naming is used, not copied: a
 * reader over the same paths whose every file holds its own index answers each canonical path's entry.
 */
async function folderFiles(entries: readonly DiscEntry[]): Promise<{ path: string; blob: Blob }[]> {
  const tagged = new DirectoryAssetSource(entries.map((e, i) => ({ path: e.path, blob: new Blob([String(i)]) })));
  const out: { path: string; blob: Blob }[] = [];
  for (const path of await tagged.list()) {
    const entry = entries[Number(new TextDecoder().decode(await tagged.read(path)))];
    if (!entry) throw new DiscCopyError('failed', `the folder's ${path} could not be matched to its file`);
    out.push({ path, blob: entry.file });
  }
  return out;
}

/** The file at `path` below `dir`, its directories made on the way (OPFS names: no empty, `.` or `..` segment). */
async function fileAt(dir: CopyDirectoryHandle, path: string): Promise<CopyFileHandle> {
  const parts = path.split('/');
  if (parts.some((p) => p === '' || p === '.' || p === '..')) throw new DiscCopyError('failed', `the folder's path ${JSON.stringify(path)} cannot be stored`);
  let at = dir;
  for (const part of parts.slice(0, -1)) at = await at.getDirectoryHandle(part, { create: true });
  return at.getFileHandle(parts[parts.length - 1]!, { create: true });
}

async function childNames(dir: CopyDirectoryHandle): Promise<string[]> {
  const names: string[] = [];
  for await (const child of dir.values()) names.push(child.name);
  return names;
}

/**
 * Runs the copy's worker over `jobs`: progress forwarded per chunk; the signal's abort posted as `cancel`, honoured by
 * the worker between chunks; resolved on `done`, rejected on `error` (an `AbortError` -- or any answer after an abort --
 * as cancelled). The worker is terminated either way, after it has answered, so its handles are closed.
 */
function runWorker(
  jobs: CopyFileJob[], chunk: number, signal: AbortSignal | undefined,
  onProgress: CopyHooks['onProgress'], make: () => CopyWorker,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let worker: CopyWorker;
    try {
      worker = make();
    } catch (e) {
      reject(new DiscCopyError('unavailable', `the copy's worker would not start: ${words(e)}`, null, e));
      return;
    }
    let aborted = false;
    const onAbort = (): void => { aborted = true; worker.postMessage({ kind: 'cancel' }); };
    const finish = (settle: () => void): void => {
      signal?.removeEventListener('abort', onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      settle();
    };
    worker.onmessage = (event) => {
      const reply = event.data;
      if (reply.kind === 'progress') { onProgress?.(reply.done, reply.total); return; }
      if (reply.kind === 'done') { finish(() => (aborted ? reject(cancelled()) : resolve())); return; }
      finish(() => reject(aborted || reply.name === 'AbortError'
        ? cancelled()
        : reply.name === 'QuotaExceededError'
          ? new DiscCopyError('quota', `the browser refused the copy's space: ${reply.message}`)
          : new DiscCopyError('failed', `the copy failed: ${reply.name}: ${reply.message}`)));
    };
    worker.onerror = (event) => {
      const said = (event as ErrorEvent).message;
      finish(() => reject(new DiscCopyError('failed', `the copy's worker failed${said ? `: ${said}` : ''}`)));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    worker.postMessage({ kind: 'copy', files: jobs, chunk });
    // A cancel pressed during the setup, before the listener (DA-8's review, F1): posted after the copy, so the worker
    // reads it before its first chunk (a cancel posted first would be reset by the copy's start).
    if (signal?.aborted) onAbort();
  });
}

/**
 * The `File`s `storedCopyRequest` has handed out on this page: the stored copy's own, which `copyDisc` refuses (DA-8's
 * review, F2). Weak: a `File` the page drops is forgotten with it. A worker's clone is not in it, and need not be:
 * only the page copies.
 */
const storedFiles = new WeakSet<Blob>();

/** Whether `request` reads the stored copy's own files (`storedFiles`). */
function isStoredCopy(request: DiscRequest): boolean {
  return request.kind === 'iso' ? storedFiles.has(request.file) : request.entries.some((e) => storedFiles.has(e.file));
}

/** The request over a stored copy's directory: the image's `File`, or every stored file by its path (name order). */
async function requestOver(kind: DiscCopyRecord['kind'], dir: CopyDirectoryHandle): Promise<DiscRequest> {
  if (kind === 'image') return { kind: 'iso', file: await (await dir.getFileHandle(DISC_COPY_IMAGE)).getFile() };
  return { kind: 'dir', entries: await walk(dir, '') };
}

async function walk(dir: CopyDirectoryHandle, at: string): Promise<DiscEntry[]> {
  const children: (CopyFileHandle | CopyDirectoryHandle)[] = [];
  for await (const child of dir.values()) children.push(child);
  children.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const out: DiscEntry[] = [];
  for (const child of children) {
    const path = at ? `${at}/${child.name}` : child.name;
    if (child.kind === 'file') out.push({ path, file: await child.getFile() });
    else out.push(...await walk(child, path));
  }
  return out;
}

const sha256 = async (bytes: Uint8Array): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))].map((b) => b.toString(16).padStart(2, '0')).join('');
const identitySaid = (i: DiscIdentity): string => `${i.boot} VER ${i.ver ?? 'none'} VMODE ${i.vmode ?? 'none'}`;

/**
 * The copy, read back through the readers the start path uses, against the disc: its size (the image's, or every
 * file's and the list), its `SYSTEM.CNF`'s identity, and `DISC_COPY_CHECK_PATH`'s SHA-256. A difference is a
 * `mismatch`, naming what differed.
 */
async function verify(
  kind: DiscCopyRecord['kind'], dir: CopyDirectoryHandle, files: readonly { path: string; blob: Blob }[],
  source: AssetSource, identity: DiscIdentity,
): Promise<void> {
  const mismatch = (what: string): DiscCopyError => new DiscCopyError('mismatch', `the copy does not match the disc: ${what}; it was removed`);
  const request = await requestOver(kind, dir);
  if (request.kind === 'iso') {
    const want = files[0]!.blob.size;
    if (request.file.size !== want) throw mismatch(`it holds ${bytesSaid(request.file.size)} of the image's ${bytesSaid(want)}`);
  } else {
    const want = new Map(files.map((f) => [f.path, f.blob.size]));
    const got = new Map(request.entries.map((e) => [e.path, e.file.size]));
    const missing = [...want.keys()].filter((p) => !got.has(p));
    const extra = [...got.keys()].filter((p) => !want.has(p));
    if (missing.length || extra.length) throw mismatch(`its files differ (${[...missing.map((p) => `no ${p}`), ...extra.map((p) => `an extra ${p}`)].join(', ')})`);
    for (const [path, n] of want) if (got.get(path) !== n) throw mismatch(`${path} holds ${bytesSaid(got.get(path)!)} of ${bytesSaid(n)}`);
  }
  const copy = assetSourceFor(request);
  let copied: DiscIdentity;
  try { copied = await discIdentity(copy); } catch (e) { throw mismatch(`its SYSTEM.CNF: ${words(e)}`); }
  if (copied.boot !== identity.boot || copied.ver !== identity.ver || copied.vmode !== identity.vmode) {
    throw mismatch(`its SYSTEM.CNF names ${identitySaid(copied)}, the disc's ${identitySaid(identity)}`);
  }
  const [want, got] = await Promise.all([
    source.read(DISC_COPY_CHECK_PATH).then(sha256),
    copy.read(DISC_COPY_CHECK_PATH).then(sha256, (e: unknown) => `unreadable (${words(e)})`),
  ]);
  if (want !== got) throw mismatch(`${DISC_COPY_CHECK_PATH} differs (SHA-256 ${got}, the disc's ${want})`);
}

/** The kept copy's record, or null: none, or a record of another shape (nothing this version wrote). */
export async function storedCopy(records: RecordStore = pageRecords()): Promise<DiscCopyRecord | null> {
  const r = (await records.get(DISC_COPY_SLOT)) as Partial<DiscCopyRecord> | undefined;
  if (!r || typeof r !== 'object') return null;
  const i = r.identity as Partial<DiscIdentity> | undefined;
  const ok = r.v === 1 && (r.kind === 'image' || r.kind === 'folder') && !!i && typeof i.boot === 'string'
    && typeof r.size === 'number' && typeof r.files === 'number' && typeof r.dir === 'string' && r.dir !== ''
    && typeof r.when === 'number' && typeof r.persisted === 'boolean';
  return ok ? (r as DiscCopyRecord) : null;
}

/**
 * The kept copy's `DiscRequest`, for the start path (`./discPrompt` `openFrontEndDisc` and the workers, as a pick's):
 * an image's `{ kind: 'iso' }` over the stored file (`getFile()`), a folder's `{ kind: 'dir' }` over the stored files.
 * Null when none is kept, or the browser has no origin storage; when the record's directory is gone (the browser evicted
 * it: a copy not `persisted`), the record is cleared and null answered: the caller reads `./discMemory` `readStartState`
 * again, and DA.R5's next step follows (the remembered disc, else the chooser). A request whose files are these is
 * refused by `copyDisc` (they are the copy).
 */
export async function storedCopyRequest(env: CopyEnv = {}): Promise<DiscRequest | null> {
  const records = env.records ?? pageRecords();
  const record = await storedCopy(records);
  if (!record) return null;
  const storage = storageOf(env);
  if (!storage) return null;
  try {
    const copies = await (await storage.getDirectory()).getDirectoryHandle(DISC_COPY_ROOT);
    const request = await requestOver(record.kind, await copies.getDirectoryHandle(record.dir));
    if (request.kind === 'iso') storedFiles.add(request.file);
    else for (const e of request.entries) storedFiles.add(e.file);
    return request;
  } catch (e) {
    if (!named(e, 'NotFoundError') && !named(e, 'TypeMismatchError')) throw e;
    try { await records.delete(DISC_COPY_SLOT); } catch { /* the next read finds it gone again */ }
    return null;
  }
}

/** The kept copy as a source (`IsoAssetSource` over the image, `DirectoryAssetSource` over the files), or null. */
export async function storedCopySource(env: CopyEnv = {}): Promise<AssetSource | null> {
  const request = await storedCopyRequest(env);
  return request ? assetSourceFor(request) : null;
}

/**
 * "Delete the stored copy": its record, then every byte under `DISC_COPY_ROOT` (a partial a closed tab left with it).
 * Nothing kept is no error. A refusal of the record's delete is thrown, before any byte is removed.
 */
export async function deleteStoredCopy(env: CopyEnv = {}): Promise<void> {
  await (env.records ?? pageRecords()).delete(DISC_COPY_SLOT);
  const storage = storageOf(env);
  if (!storage) return;
  try {
    await (await storage.getDirectory()).removeEntry(DISC_COPY_ROOT, { recursive: true });
  } catch (e) {
    if (!named(e, 'NotFoundError')) throw e;
  }
}
