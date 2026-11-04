import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { streamFile, type AssetSource, type RangedAssetSource } from '../src/assetSource';
import { FsAssetSource } from '../src/fsAssetSource';
import { HttpAssetSource } from '../src/httpAssetSource';
import { IsoAssetSource, ISO_READ_CHUNK } from '../src/isoAssetSource';
import { buildIso, SECTOR } from './isoImage';

const pattern = (length: number, seed: number): Uint8Array => {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = (i * 31 + seed * 7 + (i >>> 8)) & 0xff;
  return out;
};

/** A `Blob` that records every range it is asked for, to show what a stream touched and when. */
class CountingBlob extends Blob {
  readonly ranges: [number, number][] = [];
  override slice(start?: number, end?: number, type?: string): Blob {
    this.ranges.push([start ?? 0, end ?? this.size]);
    return super.slice(start, end, type);
  }
}

const collect = async (chunks: AsyncIterable<Uint8Array>): Promise<Uint8Array[]> => {
  const out: Uint8Array[] = [];
  for await (const c of chunks) out.push(c);
  return out;
};
const concat = (chunks: Uint8Array[]): Uint8Array => Buffer.concat(chunks.map((c) => Buffer.from(c)));

/** A movie-sized member, not a multiple of the chunk, sector or anything else. */
const MOVIE = pattern(5 * 4096 + 1234, 3);
const PATH = 'RUN/MOVIES/COMMON/MENULOOP.PSS';

describe('IsoAssetSource.stream: a chunked read over an extent', () => {
  it('yields the file in order, chunkSize bytes at a time, the last chunk short', async () => {
    const source = new IsoAssetSource(new Blob([buildIso([{ path: PATH, bytes: MOVIE }])]));
    const chunks = await collect(source.stream(PATH, { chunkSize: 4096 }));
    expect(chunks.map((c) => c.length)).toEqual([4096, 4096, 4096, 4096, 4096, 1234]);
    expect(Buffer.from(concat(chunks)).equals(Buffer.from(MOVIE))).toBe(true);
  });

  it('defaults to ISO_READ_CHUNK and reads an empty file as no chunks', async () => {
    const big = pattern(ISO_READ_CHUNK + 5, 1);
    const source = new IsoAssetSource(new Blob([buildIso([{ path: 'A.PSS', bytes: big }, { path: 'E.PSS', bytes: new Uint8Array(0) }])]));
    expect((await collect(source.stream('A.PSS'))).map((c) => c.length)).toEqual([ISO_READ_CHUNK, 5]);
    expect(await collect(source.stream('E.PSS'))).toEqual([]);
  });

  it('streams a sub-extent: from an offset, for a length (a VAGSTORE member by sector and offset)', async () => {
    const source = new IsoAssetSource(new Blob([buildIso([{ path: PATH, bytes: MOVIE }])]));
    const chunks = await collect(source.stream(PATH, { offset: 3 * SECTOR + 100, length: 5000, chunkSize: 2048 }));
    expect(chunks.map((c) => c.length)).toEqual([2048, 2048, 904]);
    expect(Buffer.from(concat(chunks)).equals(Buffer.from(MOVIE.subarray(3 * SECTOR + 100, 3 * SECTOR + 5100)))).toBe(true);
    await expect(collect(source.stream(PATH, { offset: MOVIE.length - 10, length: 11 }))).rejects.toThrow(/past/);
    await expect(collect(source.stream(PATH, { chunkSize: 0 }))).rejects.toThrow(/chunk/);
  });

  it('holds one chunk at a time: nothing is read ahead of the consumer, and each slice is one chunk', async () => {
    const blob = new CountingBlob([buildIso([{ path: PATH, bytes: MOVIE }])]);
    const source = new IsoAssetSource(blob);
    const it = source.stream(PATH, { chunkSize: 4096 })[Symbol.asyncIterator]();
    await it.next();
    const before = blob.ranges.length;
    // The descriptor, the root, RUN, MOVIES, COMMON, then the first chunk: one data slice so far.
    const data = (ranges: [number, number][]) => ranges.filter(([a, b]) => b - a === 4096 || b - a === 1234);
    expect(data(blob.ranges).length).toBe(1);
    await it.next();
    expect(blob.ranges.length).toBe(before + 1);
    for (const [a, b] of blob.ranges.slice(before - 1)) expect(b - a).toBeLessThanOrEqual(4096);
    // A consumer that stops early (a `break`) ends the reads there.
    await it.return?.(undefined);
    expect(blob.ranges.length).toBe(before + 1);
  });

  it('stops on abort: the next pull throws the signal\'s reason and nothing more is read', async () => {
    const blob = new CountingBlob([buildIso([{ path: PATH, bytes: MOVIE }])]);
    const source = new IsoAssetSource(blob);
    const abort = new AbortController();
    const got: Uint8Array[] = [];
    const run = (async () => {
      for await (const chunk of source.stream(PATH, { chunkSize: 4096, signal: abort.signal })) {
        got.push(chunk);
        if (got.length === 2) abort.abort(new Error('closed by the player'));
      }
    })();
    await expect(run).rejects.toThrow('closed by the player');
    expect(got.length).toBe(2);
    const reads = blob.ranges.length;
    // Already aborted: refused before any read.
    await expect(collect(source.stream(PATH, { signal: abort.signal }))).rejects.toThrow('closed by the player');
    expect(blob.ranges.length).toBe(reads);
  });
});

describe('HttpAssetSource.stream: one ranged request, re-chunked', () => {
  afterEach(() => vi.unstubAllGlobals());

  /**
   * A server holding MOVIE that answers a Range with 206 and its `Content-Range`, the last byte clamped to the file's
   * end and a range starting past it refused with 416 (RFC 9110 §14.1.1, §15.5.17), in network packets of 1000 bytes;
   * `ranges: false` ignores the header.
   */
  const serve = (ranges = true) => vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'HEAD') return new Response(null, { headers: { 'content-length': String(MOVIE.length) } });
    const range = /bytes=(\d+)-(\d+)/.exec(String((init?.headers as Record<string, string> | undefined)?.Range ?? ''));
    const first = Number(range?.[1] ?? 0), last = Math.min(Number(range?.[2] ?? 0), MOVIE.length - 1);
    if (ranges && range && first >= MOVIE.length) {
      return new Response(null, { status: 416, headers: { 'content-range': `bytes */${MOVIE.length}` } });
    }
    const bytes = ranges && range ? MOVIE.slice(first, last + 1) : MOVIE;
    const headers = ranges && range ? { 'content-range': `bytes ${first}-${last}/${MOVIE.length}` } : undefined;
    let at = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (at >= bytes.length) { controller.close(); return; }
        controller.enqueue(bytes.slice(at, at + 1000));
        at += 1000;
      },
    });
    return new Response(body, { status: ranges && range ? 206 : 200, headers });
  });

  it('yields the extent in order in chunkSize pieces from a single Range request', async () => {
    const fetched = serve();
    vi.stubGlobal('fetch', fetched);
    const chunks = await collect(new HttpAssetSource('/maps').stream(PATH, { offset: 100, length: 9000, chunkSize: 4096 }));
    expect(chunks.map((c) => c.length)).toEqual([4096, 4096, 808]);
    expect(Buffer.from(concat(chunks)).equals(Buffer.from(MOVIE.subarray(100, 9100)))).toBe(true);
    expect(fetched.mock.calls.length).toBe(1);
    expect((fetched.mock.calls[0]![1] as RequestInit).headers).toEqual({ Range: 'bytes=100-9099' });
  });

  it('asks the length first when none is given, and skips to the offset when the server ignores Range', async () => {
    vi.stubGlobal('fetch', serve(false));
    const chunks = await collect(new HttpAssetSource('/maps').stream(PATH, { offset: 2500, chunkSize: 4096 }));
    expect(Buffer.from(concat(chunks)).equals(Buffer.from(MOVIE.subarray(2500)))).toBe(true);
    expect(chunks.slice(0, -1).every((c) => c.length === 4096)).toBe(true);
  });

  it("refuses an extent past the file before any chunk, in the ISO's words, given a length or not (close review note)", async () => {
    const iso = new IsoAssetSource(new Blob([buildIso([{ path: PATH, bytes: MOVIE }])]));
    const outcome = async (chunks: AsyncIterable<Uint8Array>): Promise<{ yielded: number; error: string | null }> => {
      let yielded = 0;
      try { for await (const c of chunks) yielded += c.length; } catch (e) { return { yielded, error: (e as Error).message }; }
      return { yielded, error: null };
    };
    for (const ranges of [true, false]) {
      vi.stubGlobal('fetch', serve(ranges));
      for (const extent of [
        { offset: 0, length: MOVIE.length + 1, chunkSize: 4096 }, { offset: MOVIE.length + 10000, length: 0 },
        { offset: MOVIE.length - 10, length: 11 }, { offset: MOVIE.length + 1 },
      ]) {
        const want = await outcome(iso.stream(PATH, extent));
        expect(want.error, JSON.stringify(extent)).toMatch(/run past its/);
        expect(await outcome(new HttpAssetSource('/maps').stream(PATH, extent)), `${ranges} ${JSON.stringify(extent)}`).toEqual(want);
      }
    }
  });

  it('passes the abort signal to the request and stops on it', async () => {
    const fetched = serve();
    vi.stubGlobal('fetch', fetched);
    const abort = new AbortController();
    const got: Uint8Array[] = [];
    await expect((async () => {
      for await (const c of new HttpAssetSource('/maps').stream(PATH, { chunkSize: 2048, signal: abort.signal })) {
        got.push(c);
        abort.abort(new Error('stop'));
      }
    })()).rejects.toThrow('stop');
    expect(got.length).toBe(1);
    expect((fetched.mock.calls.at(-1)![1] as RequestInit).signal).toBe(abort.signal);
  });
});

describe('FsAssetSource.stream and streamFile over any source', () => {
  let dir = '';
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 's2u-stream-'));
    writeFileSync(join(dir, 'M.PSS'), MOVIE);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('reads a file on disk a chunk at a time, an extent of it too', async () => {
    const fs = new FsAssetSource(dir);
    const chunks = await collect(fs.stream('M.PSS', { chunkSize: 4096 }));
    expect(chunks.map((c) => c.length)).toEqual([4096, 4096, 4096, 4096, 4096, 1234]);
    expect(Buffer.from(concat(chunks)).equals(Buffer.from(MOVIE))).toBe(true);
    const part = concat(await collect(fs.stream('M.PSS', { offset: 7, length: 9 })));
    expect(Buffer.from(part).equals(Buffer.from(MOVIE.subarray(7, 16)))).toBe(true);
    await expect(collect(fs.stream('M.PSS', { offset: MOVIE.length, length: 1 }))).rejects.toThrow(/past/);
  });

  it('streamFile uses readRange on a ranged source without stream, and refuses a source that reads only whole', async () => {
    const asked: [number, number][] = [];
    const ranged: RangedAssetSource = {
      list: async () => ['M.PSS'],
      read: async () => { throw new Error('a whole read'); },
      size: async () => MOVIE.length,
      readRange: async (_p, offset, length) => { asked.push([offset, length]); return MOVIE.slice(offset, offset + length); },
    };
    const chunks = await collect(streamFile(ranged, 'M.PSS', { chunkSize: 8192 }));
    expect(Buffer.from(concat(chunks)).equals(Buffer.from(MOVIE))).toBe(true);
    expect(asked).toEqual([[0, 8192], [8192, 8192], [16384, MOVIE.length - 16384]]);
    const whole: AssetSource = { list: async () => [], read: async () => MOVIE };
    await expect(collect(streamFile(whole, 'M.PSS'))).rejects.toThrow(/neither streams nor reads by range/);
  });
});
