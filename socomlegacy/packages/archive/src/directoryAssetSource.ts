import { rangedChunks, type RangedAssetSource, type ReadProgress, type StreamOptions } from './assetSource';
import { ISO_READ_CHUNK } from './readChunk';

/** One file of a picked folder: its path below the pick (a `File`'s `webkitRelativePath`) and its bytes. */
export interface DirectoryEntry {
  path: string;
  blob: Blob;
}

/**
 * The directories at the top of the retail disc (SOCOM II, USA): the first segment of every path the image holds below
 * its root (`IsoAssetSource(SOCOM_ISO).list()`, equal to `tools_py/iso_lbn.py list`'s 349 files, research 306 §2); its
 * root's files are `SYSTEM.CNF`, the two ELFs, `ENDER` and the `*.CNF` beside them. A pick whose every file shares one
 * of these as its first segment is a pick inside the disc, not a folder holding it, so it is kept. The dev-disc test of
 * `directoryAssetSource.test.ts` holds the list against the image.
 */
export const DISC_ROOT_DIRECTORIES: readonly string[] = ['CNF', 'NETGUI', 'OVERLAY', 'RUN'];

/**
 * A picked folder or drive as a ranged `AssetSource` (disc-access plan DA-1, DA.R4): in the page, the `File`s of a
 * directory pick -- a disc in a drive, a mounted image or a copy of the disc's files; under node, `fs.openAsBlob` per
 * file. A **browser adaptation** (DA.R2): the original reads its own disc by LBN; here every read goes by path through
 * the same readers, and the dev-disc test pins that this source and `IsoAssetSource` answer the same bytes for a path.
 *
 * Paths are named as `IsoAssetSource` names them -- upper case, forward slashes, no `;1`, no bare trailing `.` (so
 * ISO9660's `ENDER.` and a mounted volume's `ENDER` are one path, research 306 §2) -- and the picked folder's own name
 * is stripped when every entry carries it and it is none of `DISC_ROOT_DIRECTORIES`. Every byte is one `Blob.slice`,
 * so a 335 MB movie or the 577 MB VAGSTORE is never read whole unless asked for whole. Nothing here needs the DOM
 * beyond `Blob`.
 */
export class DirectoryAssetSource implements RangedAssetSource {
  private readonly files = new Map<string, Blob>();

  constructor(entries: readonly DirectoryEntry[]) {
    const named = entries.map((e) => ({ raw: e.path, parts: normalise(e.path), blob: e.blob }));
    const first = named[0]?.parts[0];
    const strip = first !== undefined
      && !DISC_ROOT_DIRECTORIES.includes(first)
      && named.every((e) => e.parts.length > 1 && e.parts[0] === first);
    const raws = new Map<string, string>();
    for (const e of named) {
      const path = (strip ? e.parts.slice(1) : e.parts).join('/');
      if (path === '') throw new Error(`disc folder: ${JSON.stringify(e.raw)} names no file`);
      const other = raws.get(path);
      if (other !== undefined) throw new Error(`disc folder: ${other} and ${e.raw} are both ${path}`);
      raws.set(path, e.raw);
      this.files.set(path, e.blob);
    }
  }

  /** Every file, `RUN/MP2.ZDB` style, sorted. */
  async list(): Promise<string[]> {
    return [...this.files.keys()].sort();
  }

  async size(path: string): Promise<number> {
    return this.file(path).blob.size;
  }

  /**
   * A file's bytes. With `onProgress` it is read `ISO_READ_CHUNK` bytes at a time and each chunk reported against the
   * file's length, as `IsoAssetSource.read` does: a folder on a DVD drive reads at 10-20 MB/s (research 306 §2).
   */
  async read(path: string, onProgress?: ReadProgress): Promise<Uint8Array> {
    const { blob } = this.file(path);
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
    const { blob } = this.file(path);
    if (offset < 0 || length < 0 || offset + length > blob.size) {
      throw new Error(`disc folder: ${length} bytes at ${offset} of ${path} run past its ${blob.size} bytes`);
    }
    return bytes(blob, offset, length);
  }

  /** The picked file itself, read nothing (`BlobAssetSource`, DX-1): the extraction copies it chunk by chunk. */
  async fileBlob(path: string): Promise<Blob> {
    return this.file(path).blob;
  }

  /** The file, or the extent `options` names, as ordered chunks (`AssetSource.stream`): one `Blob.slice` a pull. */
  async *stream(path: string, options: StreamOptions = {}): AsyncGenerator<Uint8Array> {
    options.signal?.throwIfAborted();
    const { blob } = this.file(path);
    yield* rangedChunks((at, n) => bytes(blob, at, n), blob.size, path, options);
  }

  /** The entry for a path given in any case and with either slash. */
  private file(path: string): { blob: Blob } {
    const key = normalise(path).join('/');
    const blob = this.files.get(key);
    if (!blob) throw new Error(`disc folder: no ${key || JSON.stringify(path)} in the picked folder`);
    return { blob };
  }
}

async function bytes(blob: Blob, offset: number, length: number): Promise<Uint8Array> {
  if (length === 0) return new Uint8Array(0);
  return new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());
}

/**
 * `NAME.EXT;1` -> `NAME.EXT`, `NAME.;1` and `NAME.` -> `NAME`, upper case: `isoAssetSource.ts`'s `clean`, kept in step
 * with it so both sources name a file alike.
 */
function clean(name: string): string {
  const version = name.indexOf(';');
  const bare = version >= 0 ? name.slice(0, version) : name;
  return (bare.endsWith('.') ? bare.slice(0, -1) : bare).toUpperCase();
}

/** `/run//mp2.zdb` or `run\mp2.zdb` -> `['RUN', 'MP2.ZDB']`, as `isoAssetSource.ts`'s `normalise`. */
function normalise(path: string): string[] {
  return path.split(/[\\/]+/).filter((p) => p.length > 0).map(clean);
}
