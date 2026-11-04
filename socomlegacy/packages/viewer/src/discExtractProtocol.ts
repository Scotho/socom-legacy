import { copyFiles, type CopyLoop, type CopySyncAccess, type CopyTarget } from './discCopyProtocol';
import { Sha256, feedBlob } from './discExtractHash';
import { ExtractStoreError, type ExtractStoreReason, type ExtractStream, type StreamTarget } from './discExtractStore';

/**
 * **The extraction's writer, side-effect free** (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, DX-1,
 * FI.R6): the messages between the page (`./discExtract`) and the extraction's worker (`./discExtractWorker`, two lines
 * that call `serveDiscExtract` on their own scope), and the one-file write. Nothing runs on import (DA-8's review, F4).
 *
 * The write is DA-8's own chunk loop (`./discCopyProtocol` `copyFiles`: the sync access handle, truncated to nothing so a
 * partial file is rewritten from its start, a chunk read, written whole, flushed and reported, the cancel read between
 * chunks, the written size checked against the source's), run over one file at a time; the only addition is the hash:
 * the file's `Blob` is handed to the loop through `hashingBlob`, which feeds each chunk the loop reads to an incremental
 * SHA-256 (`./discExtractHash`) in order, so the digest is of exactly the bytes written, with no second read.
 *
 * **A file taken as a stream** (disc-share plan `docs/plans/2026-10-18-disc-share.md`, DSH-2): `openOpfsStream` and the
 * `open` / `write` / `finish` / `abort` commands write a file whose bytes arrive in pieces (the transfer's), with no
 * whole-file `Blob`: the sync access handle opened once, each piece written at its offset and hashed, the handle flushed
 * at every block boundary (`./discExtractStore` `EXTRACT_STREAM_BLOCK`) and at the end, then closed. A file opened again
 * is **not truncated**: it carries on from its last flushed block (the file's own size, rounded down to a block; the whole
 * file when it is all there), only a tail past that block -- bytes written but not flushed -- trimmed, and the SHA-256
 * rebuilt by re-reading the stored part. The worker holds the piece in hand, never the file.
 *
 * A **browser adaptation** (FI.R2, DA.R3) with no original. Nothing here reads the network or sends anything: the bytes
 * go from the player's disc to the player's own browser storage.
 */

/**
 * The page's commands: is a sync access handle on offer (`probe`); write this file; cancel the file under way. A
 * streamed file: `open` it (`size` bytes in blocks of `block`), `write` its next bytes, `finish` it, or `abort` it.
 */
export type ExtractCommand =
  | { kind: 'probe' }
  | { kind: 'file'; blob: Blob; dir: string; path: string; chunk: number }
  | { kind: 'cancel' }
  | { kind: 'open'; dir: string; path: string; size: number; block: number }
  | { kind: 'write'; bytes: Uint8Array }
  | { kind: 'finish' }
  | { kind: 'abort' };

/**
 * The worker's replies: the probe's answer; progress within the file per chunk; the file written; an error. A streamed
 * file: `opened` (the bytes already stored, where it carries on), `wrote` (the bytes now written), `finished`, `aborted`.
 */
export type ExtractReply =
  | { kind: 'probe'; sync: boolean }
  | { kind: 'progress'; done: number; total: number }
  | { kind: 'file'; bytes: number; sha256: string }
  | { kind: 'error'; name: string; message: string; reason?: ExtractStoreReason }
  | { kind: 'opened'; stored: number }
  | { kind: 'wrote'; stored: number }
  | { kind: 'finished'; bytes: number; sha256: string }
  | { kind: 'aborted' };

/** The worker's end of the channel (its global scope; a fake one in the test). */
export interface ExtractPort {
  onmessage: ((event: MessageEvent<ExtractCommand>) => void) | null;
  postMessage(message: ExtractReply): void;
}

/**
 * `blob` as the chunk loop reads it, every chunk's bytes fed to `hash` as they are read. `copyFiles` reads a file's
 * chunks once each, in order, from its start; a read out of that order would hash the wrong stream, so it is refused.
 */
export function hashingBlob(blob: Blob, hash: Sha256): Blob {
  let next = 0;
  const slice = (start = 0, end = blob.size): Blob => {
    const part = blob.slice(start, end);
    return {
      size: part.size,
      arrayBuffer: async (): Promise<ArrayBuffer> => {
        if (start !== next) throw new Error(`the extraction read byte ${start} of a file whose next unhashed byte is ${next}`);
        const bytes = await part.arrayBuffer();
        hash.update(new Uint8Array(bytes));
        next = start + bytes.byteLength;
        return bytes;
      },
    } as unknown as Blob;
  };
  return { size: blob.size, slice } as unknown as Blob;
}

/**
 * One file into its OPFS target, hashed as it is written (the module's header): resolves with the bytes written and
 * their SHA-256; rejects as `copyFiles` does (an `AbortError` on a cancel; the handle closed either way).
 */
export async function extractFile(blob: Blob, target: CopyTarget, loop: CopyLoop): Promise<{ bytes: number; sha256: string }> {
  const hash = new Sha256();
  const bytes = await copyFiles([{ blob: hashingBlob(blob, hash), target }], loop);
  return { bytes, sha256: hash.hex() };
}

/**
 * A file of `size` bytes written as a stream into its OPFS target (the module's header): the stored part kept and
 * re-hashed, then each `write` at its offset, a flush at each block boundary. `stored` is where it carries on. Every
 * path out (`finish`, `abort`, a failed write) closes the handle.
 */
export async function openOpfsStream(target: StreamTarget, size: number, block: number): Promise<ExtractStream & { readonly at: number }> {
  if (!(Number.isInteger(block) && block > 0)) throw new RangeError(`a stream's block is ${block} bytes`);
  if (!(Number.isInteger(size) && size >= 0)) throw new RangeError(`a stream of ${size} bytes`);
  const file = await target.getFile();
  const stored = file.size === size ? size : Math.floor(Math.min(file.size, size) / block) * block;
  const hash = await feedBlob(new Sha256(), file.slice(0, stored), block);
  const access: CopySyncAccess = await target.createSyncAccessHandle();
  let at = stored;
  let closed = false;
  const close = (): void => { if (!closed) { closed = true; access.close(); } };
  const failed = (message: string): ExtractStoreError => new ExtractStoreError('failed', message);
  try {
    if (access.getSize() !== stored) access.truncate(stored);          // only a tail past the last flushed block
  } catch (e) { close(); throw e; }
  return {
    stored,
    get at() { return at; },
    async write(bytes) {
      if (closed) throw failed('the stream is closed');
      try {
        if (at + bytes.length > size) throw failed(`${at + bytes.length} bytes given of a ${size}-byte file`);
        for (let put = 0; put < bytes.length;) {
          const n = access.write(bytes.subarray(put), { at: at + put });
          if (!(n > 0)) throw new Error(`the browser wrote nothing at byte ${at + put} of a ${size}-byte file`);
          put += n;
        }
        hash.update(bytes);
        const before = at;
        at += bytes.length;
        if (Math.floor(at / block) > Math.floor(before / block)) access.flush();
      } catch (e) { close(); throw e; }
    },
    async finish() {
      if (closed) throw failed('the stream is closed');
      try {
        access.flush();
        if (at !== size) throw failed(`${at} bytes given of a ${size}-byte file`);
        if (access.getSize() !== size) throw failed(`the file holds ${access.getSize()} bytes of ${size}`);
      } finally { close(); }
      return { bytes: at, sha256: hash.hex() };
    },
    async abort() {
      if (closed) return;
      try { access.flush(); } finally { close(); }
    },
  };
}

/**
 * Whether this scope can open a sync access handle: `FileSystemFileHandle.prototype.createSyncAccessHandle` exists only
 * in a dedicated worker of a browser that has it (the page's own scope never has it, so the page asks its worker).
 */
export function hasSyncAccess(scope: unknown = globalThis): boolean {
  const handle = (scope as { FileSystemFileHandle?: { prototype?: { createSyncAccessHandle?: unknown } } }).FileSystemFileHandle;
  return typeof handle?.prototype?.createSyncAccessHandle === 'function';
}

/**
 * Serves the page's commands on `port`: a `probe` is answered at once; a `file` runs `extractFile` and answers `file` or
 * `error`; a `cancel` is read by the loop before its next chunk. One file at a time: a second `file` while one runs is
 * refused. `targetFor` opens the destination in this worker; `syncAccess` is the probe's answer (tests pass their own).
 */
export function serveDiscExtract(
  port: ExtractPort,
  targetFor: (dir: string, path: string) => Promise<StreamTarget>,
  syncAccess: () => boolean = hasSyncAccess,
): void {
  let cancelled = false;
  let busy = false;
  let stream: (ExtractStream & { readonly at: number }) | null = null;
  const refuse = (message: string): void => { port.postMessage({ kind: 'error', name: 'InvalidStateError', message }); };
  const replyError = (e: unknown): void => port.postMessage({
    kind: 'error',
    name: e instanceof Error || e instanceof DOMException ? e.name : 'Error',
    message: e instanceof Error || e instanceof DOMException ? e.message : String(e),
    ...(e instanceof ExtractStoreError ? { reason: e.reason } : {}),
  });
  /** One step of a streamed file, run alone; a failure ends the stream (its handle is closed by `openOpfsStream`). */
  const step = (run: () => Promise<ExtractReply>, ends: boolean): void => {
    busy = true;
    // Free before the reply is posted: the page sends its next step as soon as it hears this one.
    Promise.resolve().then(run).then(
      (reply) => { busy = false; if (ends) stream = null; port.postMessage(reply); },
      (e: unknown) => { busy = false; stream = null; replyError(e); },
    );
  };
  port.onmessage = (event) => {
    const command = event.data;
    if (command.kind === 'cancel') { cancelled = true; return; }
    if (command.kind === 'probe') { port.postMessage({ kind: 'probe', sync: syncAccess() }); return; }
    if (busy) { refuse('a file is already being written'); return; }
    if (command.kind === 'open') {
      if (stream) { refuse('a streamed file is already open'); return; }
      step(async () => {
        stream = await openOpfsStream(await targetFor(command.dir, command.path), command.size, command.block);
        return { kind: 'opened', stored: stream.stored };
      }, false);
      return;
    }
    if (command.kind === 'write' || command.kind === 'finish' || command.kind === 'abort') {
      const open = stream;
      if (!open) { refuse('no streamed file is open'); return; }
      if (command.kind === 'write') step(async () => { await open.write(command.bytes); return { kind: 'wrote', stored: open.at }; }, false);
      else if (command.kind === 'finish') step(async () => ({ kind: 'finished', ...(await open.finish()) }), true);
      else step(async () => { await open.abort(); return { kind: 'aborted' }; }, true);
      return;
    }
    if (stream) { refuse('a streamed file is open'); return; }
    busy = true;
    cancelled = false;
    // Resolve the destination in this worker. Some iPhone browsers cannot structured-clone an OPFS handle.
    // Only the source Blob and destination names cross the channel; storage and its resume format stay the same.
    Promise.resolve().then(() => targetFor(command.dir, command.path)).then((target) => extractFile(command.blob, target, {
      chunk: command.chunk,
      onProgress: (done, total) => port.postMessage({ kind: 'progress', done, total }),
      cancelled: () => cancelled,
    })).then(
      (written) => port.postMessage({ kind: 'file', ...written }),
      replyError,
    ).finally(() => { busy = false; });
  };
}
