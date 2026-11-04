import { streamExtent, type RangedAssetSource, type ReadProgress, type StreamOptions } from './assetSource';
import { parseServedIndex, type MapInfo, type ServedIndex } from './mapIndex';

/**
 * An `AssetSource` over a served directory: the disc tree under `baseUrl`, with an `index.json`
 * beside it listing every archive that was extracted. The trailing slash on `baseUrl` is optional.
 *
 * `index.json` is `{ maps, common }` (`ServedIndex`), written by `tools/extract-maps.ts`: `maps` is one
 * `MapInfo` -- `{ archive, path, name }` -- an archive, the name read from each `mission.rdr` once at
 * extraction time. That is the whole reason the name is in there: naming the 22 maps from the archives
 * themselves costs 224 MB of fetches, which is not a menu. `common` is the archives every map shares
 * (`READERC.ZAR`, `ZWEAPON.ZAR`; web sprint 2, W2.R5), which `list()` names too. The older indexes -- an
 * array of `MapInfo`, or of bare paths, whose entries carry no name -- still load (`parseServedIndex`).
 */
/**
 * LATER 8: a 206 whose `Content-Range` names another span than the `length` bytes at `offset` asked is refused (thrown);
 * without the header (one a cross-origin server does not expose) the answer is taken as asked.
 */
function spanRefused(path: string, response: Response, offset: number, length: number): void {
  const named = response.headers.get('content-range');
  if (named === null) return;
  const span = /^bytes (\d+)-(\d+)\//i.exec(named);
  if (!span || Number(span[1]) !== offset || Number(span[2]) !== offset + length - 1) {
    throw new Error(`HTTP ${path}: asked ${length} bytes at ${offset}, answered ${named}`);
  }
}

export class HttpAssetSource implements RangedAssetSource {
  private readonly base: string;

  constructor(baseUrl: string) {
    this.base = baseUrl.replace(/\/+$/, '');
  }

  async list(): Promise<string[]> {
    const { maps, common, frontEnd = [] } = await this.index();
    // The front-end files (PLAT-03) overlap the common archives (the ARMORY's UI files): each path once.
    const listed = [...maps.map((m) => m.path), ...common];
    const seen = new Set(listed);
    return [...listed, ...frontEnd.filter((p) => !seen.has(p))];
  }

  /** Every map the served index names, ready for a picker. No archive is read. */
  async maps(): Promise<MapInfo[]> {
    return (await this.index()).maps;
  }

  private async index(): Promise<ServedIndex> {
    return parseServedIndex(await (await this.get('index.json')).json());
  }

  /**
   * With no `onProgress`, one `arrayBuffer()`. With one, the body is read a chunk at a time so the page
   * can show how far a 13 MB archive has got -- which is the whole of the wait on a cold cache over the
   * network, and used to look like a frozen page.
   *
   * The streaming path still falls back: no `body` (an old browser, a mocked fetch) or no declared
   * length and it reads the buffer in one go, because a progress bar with no denominator is worth less
   * than the simpler code path.
   */
  async read(path: string, onProgress?: ReadProgress): Promise<Uint8Array> {
    const response = await this.get(path);
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (!onProgress || !response.body || !Number.isFinite(declared) || declared <= 0) {
      return new Uint8Array(await response.arrayBuffer());
    }
    const out = new Uint8Array(declared);
    const reader = response.body.getReader();
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // A server that under-declared its length would overflow the buffer; take what fits and stop
      // trusting the header rather than throwing on a map that would otherwise have drawn.
      if (loaded + value.length > out.length) {
        const all = new Uint8Array(loaded + value.length);
        all.set(out.subarray(0, loaded));
        all.set(value, loaded);
        loaded += value.length;
        onProgress(loaded, loaded);
        return all.subarray(0, loaded);
      }
      out.set(value, loaded);
      loaded += value.length;
      onProgress(loaded, declared);
    }
    return loaded === out.length ? out : out.subarray(0, loaded);
  }

  /**
   * A file's length (socomlegacy/docs/research/81 §1: the ranged reads of `SOUNDS/BNKSTORE.ZAR`): a `HEAD`'s
   * `Content-Length`, or, where a server leaves it out, the total a one-byte `Range` answer's `Content-Range` names.
   */
  async size(path: string): Promise<number> {
    const head = await fetch(`${this.base}/${path}`, { method: 'HEAD' });
    if (!head.ok) throw new Error(`HTTP ${head.status} ${path}`);
    const declared = Number(head.headers.get('content-length') ?? NaN);
    if (Number.isFinite(declared) && declared >= 0) return declared;
    const probe = await fetch(`${this.base}/${path}`, { headers: { Range: 'bytes=0-0' } });
    const total = Number(/\/(\d+)$/.exec(probe.headers.get('content-range') ?? '')?.[1] ?? NaN);
    if (!Number.isFinite(total)) throw new Error(`HTTP ${path}: the server says neither its length nor its range`);
    return total;
  }

  /**
   * `length` bytes from `offset` with a `Range` request. A server that ignores the header answers 200 with the
   * whole file, which is sliced rather than refused -- correct, only slower; a short answer is refused, and so is a 206
   * whose `Content-Range` names another span than the one asked (LATER 8; without the header it is taken as asked).
   */
  async readRange(path: string, offset: number, length: number): Promise<Uint8Array> {
    if (offset < 0 || length < 0) throw new Error(`HTTP ${path}: no range of ${length} bytes at ${offset}`);
    if (length === 0) return new Uint8Array(0);
    const response = await fetch(`${this.base}/${path}`, { headers: { Range: `bytes=${offset}-${offset + length - 1}` } });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${path}`);
    let bytes = new Uint8Array(await response.arrayBuffer());
    if (response.status !== 206) bytes = bytes.subarray(offset, offset + length);
    else spanRefused(path, response, offset, length);
    if (bytes.byteLength !== length) throw new Error(`HTTP ${path}: ${length} bytes at ${offset} run past its end`);
    return bytes;
  }

  /**
   * The file, or the extent `options` names, as ordered chunks of `chunkSize` (`AssetSource.stream`): one `Range`
   * request, its body re-cut as it arrives, so no more than a chunk and one network packet are held. Without a length
   * the file's is asked first (`size`). A server that ignores the `Range` answers 200 with the whole file: the bytes
   * before the offset are dropped as they pass, and the body is cancelled once the extent is read. The abort signal
   * goes to the request, and is checked before every chunk is handed over and on every pull after one.
   *
   * The extent is held to the file's length as the ISO and the disk hold it (`streamExtent`), before any byte is handed
   * over, so the served tree and the player's ISO refuse the same calls with the same words (the sprint 6 close
   * review): with a length, the file's is the ranged answer's `Content-Range` total (a 200's `Content-Length`, a 416's
   * total after `bytes *`), or `size` where the answer names none; with no length, or a length of 0, `size` first.
   */
  async *stream(path: string, options: StreamOptions = {}): AsyncGenerator<Uint8Array> {
    const { signal } = options;
    signal?.throwIfAborted();
    const known = options.length === undefined || options.length === 0 ? await this.size(path) : null;
    const { start, end, chunk } = streamExtent(known ?? (options.offset ?? 0) + options.length!, path, options);
    if (start === end) return;
    const response = await fetch(`${this.base}/${path}`, { headers: { Range: `bytes=${start}-${end - 1}` }, signal });
    if (known === null && (response.ok || response.status === 416)) {
      const named = Number(response.status === 200
        ? response.headers.get('content-length') ?? NaN
        : /\/(\d+)$/.exec(response.headers.get('content-range') ?? '')?.[1] ?? NaN);
      try {
        streamExtent(Number.isFinite(named) ? named : await this.size(path), path, options);
      } catch (e) {
        await response.body?.cancel().catch(() => undefined);
        throw e;
      }
    }
    if (!response.ok) throw new Error(`HTTP ${response.status} ${path}`);
    if (response.status === 206) {
      try { spanRefused(path, response, start, end - start); } catch (e) { await response.body?.cancel().catch(() => undefined); throw e; }
    }
    let skip = response.status === 206 ? 0 : start;
    if (!response.body) {
      // No body to read in pieces (an old browser, a mocked fetch): the answer is in memory already; hand it out cut.
      const all = new Uint8Array(await response.arrayBuffer()).subarray(skip, skip + end - start);
      if (all.length !== end - start) throw new Error(`HTTP ${path}: ${end - start} bytes at ${start} run past its end`);
      for (let at = 0; at < all.length; at += chunk) {
        signal?.throwIfAborted();
        yield all.slice(at, at + chunk);
      }
      return;
    }
    const reader = response.body.getReader();
    try {
      let left = end - start;
      let buffer = new Uint8Array(Math.min(chunk, left));
      let filled = 0;
      while (left > 0) {
        const { done, value } = await reader.read();
        if (done) throw new Error(`HTTP ${path}: the body ended ${left - filled} bytes short of ${end - start} at ${start}`);
        let bytes = value;
        if (skip > 0) {
          const dropped = Math.min(skip, bytes.length);
          bytes = bytes.subarray(dropped);
          skip -= dropped;
        }
        while (bytes.length > 0 && left > 0) {
          const n = Math.min(bytes.length, buffer.length - filled);
          buffer.set(bytes.subarray(0, n), filled);
          filled += n;
          bytes = bytes.subarray(n);
          if (filled === buffer.length) {
            signal?.throwIfAborted();
            const out = buffer;
            left -= filled;
            filled = 0;
            if (left > 0) buffer = new Uint8Array(Math.min(chunk, left));
            yield out;
            signal?.throwIfAborted();
          }
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }

  private async get(path: string): Promise<Response> {
    const response = await fetch(`${this.base}/${path}`);
    if (!response.ok) throw new Error(`HTTP ${response.status} ${path}`);
    return response;
  }
}
