import { ISO_READ_CHUNK } from './readChunk';

/**
 * Where the viewer's archive bytes come from. Paths are archive-relative and always use forward slashes
 * ("RUN/MP2.ZDB"), so the same index code runs over a served directory in the browser and over the disc
 * tree copied into `public/maps` in node.
 */
export interface AssetSource {
  list(): Promise<string[]>;
  /**
   * `onProgress` is called with bytes so far and the total the server declared, for a progress bar.
   * It is optional on both sides: a source that cannot report progress (a local directory, a source
   * whose server sends no `Content-Length`) simply never calls it, and a caller that does not care
   * passes nothing and gets the cheaper path.
   */
  read(path: string, onProgress?: ReadProgress): Promise<Uint8Array>;
  /**
   * A file, or an extent of it, as ordered chunks that the consumer pulls one at a time (PLAT-03): the movies
   * (`RUN/MOVIES/**.PSS`, up to 335 MB, CD-streamed by the original from `sceCdStStart(lbn)`, PC research 09) and the
   * VAGSTORE streams (a member by sector and offset, PC research 32 §6) are read this way, so a source never holds
   * more than the chunk in hand. Optional: the ISO, HTTP and node directory sources have it; a caller goes through
   * `streamFile`, which falls back on `readRange` for a ranged source that does not.
   */
  stream?(path: string, options?: StreamOptions): AsyncIterable<Uint8Array>;
}

/** Bytes so far and the declared total; `total` is 0 when the server did not say. */
export type ReadProgress = (loaded: number, total: number) => void;

/**
 * What a `stream` reads: `length` bytes from `offset` (by default the whole file), `chunkSize` at a time (by default
 * `ISO_READ_CHUNK`, the chunk the ISO source already reads with progress), until `signal` aborts -- then the next pull
 * throws the signal's reason and nothing more is read.
 */
export interface StreamOptions {
  offset?: number;
  length?: number;
  chunkSize?: number;
  signal?: AbortSignal;
}

/**
 * A source that can read part of a file without the rest of it, and say how long the file is. The ISO
 * source is one (design spec §3.1: it reads by LBN, so any range of an extent is one `Blob.slice`), and it
 * is why `listMaps` can name the maps on a player's disc from each archive's table of contents and its
 * `READERM.ZAR` -- tens of kilobytes an archive -- instead of the 224 MB of all 22. A served directory
 * has `index.json` for that instead and does not implement it.
 */
export interface RangedAssetSource extends AssetSource {
  size(path: string): Promise<number>;
  /** `length` bytes from `offset`; throws when the range runs past the end of the file. */
  readRange(path: string, offset: number, length: number): Promise<Uint8Array>;
}

/** Whether `source` reads by range. */
export function isRanged(source: AssetSource): source is RangedAssetSource {
  const s = source as Partial<RangedAssetSource>;
  return typeof s.readRange === 'function' && typeof s.size === 'function';
}

/**
 * `path` (or the extent `options` names) as ordered chunks: the source's own `stream` when it has one, else its
 * `readRange` a chunk at a time. A source that can only read a file whole is refused, not read whole: the point of a
 * stream is that a 300 MB movie is never in memory at once.
 */
export function streamFile(source: AssetSource, path: string, options: StreamOptions = {}): AsyncIterable<Uint8Array> {
  if (source.stream) return source.stream(path, options);
  if (isRanged(source)) {
    return (async function* () {
      yield* rangedChunks((offset, length) => source.readRange(path, offset, length), await source.size(path), path, options);
    })();
  }
  return (async function* () {
    throw new Error(`${path}: this source neither streams nor reads by range, so it cannot stream without reading the file whole`);
  })();
}

/**
 * The chunks of an extent, read through `read(offset, length)` (offsets within the file) one chunk per pull: nothing is
 * read before the consumer asks, so at most one chunk is held. The extent is checked against `size` first, the abort
 * signal before every read and again before every yield.
 */
export async function* rangedChunks(
  read: (offset: number, length: number) => Promise<Uint8Array>, size: number, path: string, options: StreamOptions,
): AsyncGenerator<Uint8Array> {
  const { start, end, chunk } = streamExtent(size, path, options);
  const { signal } = options;
  for (let at = start; at < end; at += chunk) {
    signal?.throwIfAborted();
    const bytes = await read(at, Math.min(chunk, end - at));
    signal?.throwIfAborted();
    yield bytes;
  }
  signal?.throwIfAborted();
}

/** The extent a `StreamOptions` names in a file of `size` bytes, checked, and the chunk size, checked. */
export function streamExtent(size: number, path: string, options: StreamOptions): { start: number; end: number; chunk: number } {
  const start = options.offset ?? 0;
  const length = options.length ?? size - start;
  const chunk = options.chunkSize ?? ISO_READ_CHUNK;
  if (!Number.isInteger(chunk) || chunk <= 0) throw new Error(`${path}: a stream's chunk size must be a positive integer, not ${chunk}`);
  if (!Number.isInteger(start) || !Number.isInteger(length) || start < 0 || length < 0 || start + length > size) {
    throw new Error(`${path}: ${length} bytes at ${start} run past its ${size} bytes`);
  }
  return { start, end: start + length, chunk };
}
