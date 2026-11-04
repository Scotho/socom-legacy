/**
 * **The disc copy's writer, side-effect free** (disc-access plan `docs/plans/2026-10-11-disc-access.md`, DA-8, DA.R6;
 * research 306 §3, §10): the chunk size, the messages between the page and the copy's worker, the chunk loop and the
 * message handler. The worker entry, `./discCopyWorker`, is two lines that call `serveDiscCopy` on its own scope; this
 * module calls nothing on import, so the page (`./discCopy`) and a test can import it, and no other worker that
 * imports the page's modules (`./worker` through `./discMemory`) answers a message of its own (DA-8's review, F4).
 *
 * The worker writes the disc's bytes into the page's origin private file system (OPFS) through each file's
 * `createSyncAccessHandle()` -- the fast path, and one only a worker may open. The page (`./discCopy` `copyDisc`) makes
 * the files' handles, posts them with the disc's `Blob`s, and waits for `done` or `error`; the worker reads each `Blob`
 * a chunk at a time, writes and flushes the chunk, posts the progress, and between chunks honours a `cancel`.
 *
 * A **browser adaptation** (DA.R2, DA.R3) with no original: the original reads its own disc. Nothing here reads the
 * network or sends anything: the bytes go from the player's disc to the player's own browser storage.
 */

/**
 * The bytes read, written and flushed at a time: 8 MiB. **An adaptation value, ours** (no original): big enough that a
 * 4.38 GB image is about 520 writes and as many progress posts, small enough that a cancel waits for one chunk and the
 * worker holds one chunk of memory. Not measured against another size.
 */
export const DISC_COPY_CHUNK = 8 * 1024 * 1024;

/** The calls of a `FileSystemSyncAccessHandle` (OPFS, workers only) the copy uses. */
export interface CopySyncAccess {
  write(buffer: ArrayBufferView | ArrayBuffer, options?: { at?: number }): number;
  flush(): void;
  truncate(size: number): void;
  getSize(): number;
  close(): void;
}

/** An OPFS file's handle, as the worker receives it (a `FileSystemFileHandle` crosses `postMessage`). */
export interface CopyTarget {
  createSyncAccessHandle(): Promise<CopySyncAccess>;
}

/** One file to copy: the disc's bytes and where they go. */
export type CopyFileJob = { readonly blob: Blob; readonly target: CopyTarget };

/** How `copyFiles` runs: its chunk, its progress report, and its cancel, read between chunks. */
export type CopyLoop = {
  readonly chunk: number;
  onProgress(done: number, total: number): void;
  cancelled(): boolean;
};

/**
 * **The chunk loop**, pure (the worker's own, run in-process by its test): each file's sync access handle opened,
 * truncated to nothing (a re-run writes over a partial), then `chunk` bytes at a time read from its `Blob`, written at
 * their offset until the whole chunk is taken (a short `write` is written on), flushed, and reported against the
 * total of every file. A cancel is read before each chunk: an `AbortError`, the open handle closed, nothing more
 * written (the page removes what was written). Every handle is closed, whatever happens. Answers the bytes copied.
 */
export async function copyFiles(files: readonly CopyFileJob[], loop: CopyLoop): Promise<number> {
  if (!(loop.chunk > 0)) throw new RangeError(`the copy's chunk is ${loop.chunk} bytes`);
  const total = files.reduce((n, f) => n + f.blob.size, 0);
  let done = 0;
  for (const { blob, target } of files) {
    if (loop.cancelled()) throw abortError();
    const access = await target.createSyncAccessHandle();
    try {
      access.truncate(0);
      for (let at = 0; at < blob.size; at += loop.chunk) {
        if (loop.cancelled()) throw abortError();
        const bytes = new Uint8Array(await blob.slice(at, Math.min(at + loop.chunk, blob.size)).arrayBuffer());
        for (let put = 0; put < bytes.length;) {
          const n = access.write(bytes.subarray(put), { at: at + put });
          if (!(n > 0)) throw new Error(`the browser wrote nothing at byte ${at + put} of a ${blob.size}-byte file`);
          put += n;
        }
        access.flush();
        done += bytes.length;
        loop.onProgress(done, total);
      }
      if (access.getSize() !== blob.size) throw new Error(`the copy holds ${access.getSize()} bytes of a ${blob.size}-byte file`);
    } finally {
      access.close();
    }
  }
  return done;
}

const abortError = (): DOMException => new DOMException('the copy was cancelled', 'AbortError');

/** The page's commands: copy these files (one job at a time), or cancel it. */
export type CopyCommand =
  | { kind: 'copy'; files: readonly CopyFileJob[]; chunk: number }
  | { kind: 'cancel' };

/** The worker's replies: progress per chunk, then `done` (the bytes copied) or `error` (its name and message). */
export type CopyReply =
  | { kind: 'progress'; done: number; total: number }
  | { kind: 'done'; bytes: number }
  | { kind: 'error'; name: string; message: string };

/** The worker's end of the channel (its global scope; a fake one in the test). */
export interface CopyPort {
  onmessage: ((event: MessageEvent<CopyCommand>) => void) | null;
  postMessage(message: CopyReply): void;
}

/**
 * Serves the page's commands on `port`: a `copy` runs `copyFiles` and answers `done` or `error`; a `cancel` is read by
 * the loop before its next chunk. One copy at a time: a second `copy` while one runs is refused.
 */
export function serveDiscCopy(port: CopyPort): void {
  let cancelled = false;
  let busy = false;
  port.onmessage = (event) => {
    const command = event.data;
    if (command.kind === 'cancel') { cancelled = true; return; }
    if (busy) { port.postMessage({ kind: 'error', name: 'InvalidStateError', message: 'a copy is already under way' }); return; }
    busy = true;
    cancelled = false;
    copyFiles(command.files, {
      chunk: command.chunk,
      onProgress: (done, total) => port.postMessage({ kind: 'progress', done, total }),
      cancelled: () => cancelled,
    }).then(
      (bytes) => port.postMessage({ kind: 'done', bytes }),
      (e: unknown) => port.postMessage({
        kind: 'error',
        name: e instanceof Error || e instanceof DOMException ? e.name : 'Error',
        message: e instanceof Error || e instanceof DOMException ? e.message : String(e),
      }),
    ).finally(() => { busy = false; });
  };
}
