import { ISO_READ_CHUNK, rangedChunks, type RangedAssetSource, type ReadProgress, type StreamOptions } from '@s2u/archive';
import type { DiscExtractFile, DiscExtractRecord } from './discExtract';
import { ExtractStoreError, type ExtractStore } from './discExtractStore';

/**
 * **The extraction read back as a source** (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, DX-1,
 * FI.R6): a `RangedAssetSource` with `stream` over the files `./discExtract` kept, opened from its record
 * (`openExtractedSource`). `list()` is the read set; `read`, `size`, `readRange` and `stream` go to the stored file's
 * `Blob` by `slice`, so a 335 MB movie is never held whole unless asked for whole -- the reads `IsoAssetSource` and
 * `DirectoryAssetSource` make, by the same paths, so every reader of the page reads it unchanged.
 *
 * A path outside the read set, a file not done, a file gone from storage, or one whose stored size is not the recorded
 * one is a **named miss** (`ExtractedMissError`), never a wrong byte; whether the page then falls back on the disc is
 * DX-3's. A **browser adaptation** (FI.R2, DA.R3): nothing of the game; nothing leaves the player's machine.
 */

/** Why a path is not read from storage: `outside` the read set, `not-done`, `gone` from storage, or `changed` in size. */
export type ExtractedMissReason = 'outside' | 'not-done' | 'gone' | 'changed';

/**
 * A `gone` miss's words after the key (LATER 67: the front end tells a kept movie gone by them, also when the movie's
 * worker hands back the message alone).
 */
export const EXTRACTED_GONE_WORDS = "is gone from this browser's storage";

export class ExtractedMissError extends Error {
  override readonly name = 'ExtractedMissError';
  constructor(readonly path: string, readonly reason: ExtractedMissReason, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
  }
}

/** `NAME.EXT;1` -> `NAME.EXT`, `NAME.` -> `NAME`, upper case: the disc readers' naming (`isoAssetSource.ts` `clean`). */
function clean(name: string): string {
  const version = name.indexOf(';');
  const bare = version >= 0 ? name.slice(0, version) : name;
  return (bare.endsWith('.') ? bare.slice(0, -1) : bare).toUpperCase();
}
/** `/run//mp2.zdb` or `run\mp2.zdb` -> `RUN/MP2.ZDB`, as the disc readers name a path. */
const canonical = (path: string): string => path.split(/[\\/]+/).filter((p) => p.length > 0).map(clean).join('/');

export class ExtractedAssetSource implements RangedAssetSource {
  private readonly files: Map<string, DiscExtractFile>;

  constructor(readonly record: DiscExtractRecord, private readonly store: ExtractStore) {
    this.files = new Map(record.files.map((f) => [f.path, f]));
  }

  /** The read set's paths, sorted, as the disc readers list theirs. */
  async list(): Promise<string[]> {
    return [...this.files.keys()].sort();
  }

  /** The stored file as a `Blob`, checked against the record, or the named miss. */
  async fileBlob(path: string): Promise<Blob> {
    const key = canonical(path);
    const f = this.files.get(key);
    if (!f) throw new ExtractedMissError(key, 'outside', `${key || JSON.stringify(path)} is not among the disc's files kept in this browser`);
    if (!f.done) throw new ExtractedMissError(key, 'not-done', `${key} is not extracted yet`);
    let blob: Blob;
    try {
      blob = await this.store.file(key);
    } catch (e) {
      if (e instanceof ExtractStoreError && e.reason === 'missing') {
        throw new ExtractedMissError(key, 'gone', `${key} ${EXTRACTED_GONE_WORDS} (cleared or evicted)`, e);
      }
      throw e;
    }
    if (blob.size !== f.size) {
      throw new ExtractedMissError(key, 'changed', `${key} is stored as ${blob.size} bytes, not the disc's ${f.size}`);
    }
    return blob;
  }

  async size(path: string): Promise<number> {
    return (await this.fileBlob(path)).size;
  }

  /** A file's bytes; with `onProgress`, `ISO_READ_CHUNK` at a time, as the disc readers report theirs. */
  async read(path: string, onProgress?: ReadProgress): Promise<Uint8Array> {
    const blob = await this.fileBlob(path);
    if (!onProgress) return bytes(blob, 0, blob.size);
    const out = new Uint8Array(blob.size);
    for (let at = 0; at < blob.size; at += ISO_READ_CHUNK) {
      const chunk = await bytes(blob, at, Math.min(ISO_READ_CHUNK, blob.size - at));
      out.set(chunk, at);
      onProgress(at + chunk.length, blob.size);
    }
    if (blob.size === 0) onProgress(0, 0);
    return out;
  }

  async readRange(path: string, offset: number, length: number): Promise<Uint8Array> {
    const blob = await this.fileBlob(path);
    if (offset < 0 || length < 0 || offset + length > blob.size) {
      throw new Error(`stored disc: ${length} bytes at ${offset} of ${canonical(path)} run past its ${blob.size} bytes`);
    }
    return bytes(blob, offset, length);
  }

  /** The file, or the extent `options` names, as ordered chunks: one `Blob.slice` a pull. */
  async *stream(path: string, options: StreamOptions = {}): AsyncGenerator<Uint8Array> {
    options.signal?.throwIfAborted();
    const blob = await this.fileBlob(path);
    yield* rangedChunks((at, n) => bytes(blob, at, n), blob.size, canonical(path), options);
  }
}

async function bytes(blob: Blob, offset: number, length: number): Promise<Uint8Array> {
  if (length === 0) return new Uint8Array(0);
  return new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());
}
