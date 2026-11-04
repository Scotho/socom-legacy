/**
 * The PNG reader's core, shared by the generator (`tools/png.ts`, inflating with node's zlib) and the test room's pack
 * upload (GX-27, inflating with the browser's `DecompressionStream`): the subset an image tool writes back -- 8-bit RGBA
 * or RGB (alpha 255), not interlaced, every scanline filter, CRCs checked, ancillary chunks skipped. No `node:` import:
 * this file runs in the page. A browser adaptation with no original (H135): it reads an artist's replacement images,
 * never the disc's. Every failure is an `Error` whose message begins `PNG:` (texture pack conventions §5).
 */
export const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (IEEE 802.3): the PNG chunk's and the zip member's. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const fail = (why: string): never => { throw new Error(`PNG: ${why}`); };

/** What the chunks give before inflation: the size, the channels and the concatenated IDAT bodies. */
export interface PngChunks { width: number; height: number; channels: 3 | 4; packed: Uint8Array; expected: number }

/**
 * The chunk walk: signature, CRCs, IHDR (`maxEdge` bounds the image before anything is inflated), IDAT gathered,
 * IEND; `expected` is the exact inflated length the header implies.
 */
export function readPngChunks(bytes: Uint8Array, maxEdge = 8192): PngChunks {
  if (bytes.length < 8 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) fail('not a PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8, width = 0, height = 0, channels: 3 | 4 = 4, ended = false;
  const idat: Uint8Array[] = [];
  while (!ended && at + 12 <= bytes.length) {
    const length = view.getUint32(at), type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (at + 12 + length > bytes.length) fail(`truncated ${type}`);
    if (view.getUint32(at + 8 + length) !== crc32(bytes.subarray(at + 4, at + 8 + length))) fail(`bad CRC in ${type}`);
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      if (width || length !== 13) fail('bad IHDR');
      const head = new DataView(body.buffer, body.byteOffset, 13);
      width = head.getUint32(0); height = head.getUint32(4);
      if (width < 1 || height < 1 || width > maxEdge || height > maxEdge) fail(`size ${width}x${height} outside 1..${maxEdge}`);
      if (body[8] !== 8 || (body[9] !== 6 && body[9] !== 2) || body[10] !== 0 || body[11] !== 0 || body[12] !== 0) fail('only 8-bit RGBA/RGB, not interlaced');
      channels = body[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') { if (!width) fail('IDAT before IHDR'); idat.push(body); }
    else if (type === 'IEND') ended = true;
    else if (type !== 'PLTE' && (bytes[at + 4]! & 0x20) === 0) fail(`unknown critical chunk ${type}`);
    at += 12 + length;
  }
  if (!ended || !width || idat.length === 0) fail('incomplete');
  const packed = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of idat) { packed.set(c, o); o += c.length; }
  return { width, height, channels, packed, expected: height * (width * channels + 1) };
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** The inflated scanlines (exactly `expected` bytes) unfiltered to RGBA8, top row first; RGB gains alpha 255. */
export function unfilterPng(chunks: PngChunks, raw: Uint8Array): { width: number; height: number; data: Uint8ClampedArray } {
  const { width, height, channels, expected } = chunks;
  if (raw.length !== expected) fail('image data is the wrong length');
  const stride = width * channels, data = new Uint8ClampedArray(width * height * 4);
  let prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!, line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels]! : 0, b = prev[i]!, c = i >= channels ? prev[i - channels]! : 0, x = line[i]!;
      cur[i] = filter === 0 ? x : filter === 1 ? x + a : filter === 2 ? x + b : filter === 3 ? x + ((a + b) >> 1)
        : filter === 4 ? x + paeth(a, b, c) : fail(`filter ${filter}`);
    }
    for (let x = 0; x < width; x++) {
      const d = (y * width + x) * 4, s = x * channels;
      data[d] = cur[s]!; data[d + 1] = cur[s + 1]!; data[d + 2] = cur[s + 2]!; data[d + 3] = channels === 4 ? cur[s + 3]! : 255;
    }
    [prev, cur] = [cur, prev];
  }
  return { width, height, data };
}

/** The header's size alone (the signature and a whole IHDR with its CRC first), or null when it is not a PNG's. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 33 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') return null;
  if (view.getUint32(29) !== crc32(bytes.subarray(12, 29))) return null;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * GX-27 review F1: the input is handed to the decompressor this many bytes at a time, each slice only when the stream
 * asks for it (`pull`), so a deflate bomb is stopped after the slices in flight rather than inflated whole first
 * (deflate expands a slice by about 1032 times at most). A browser adaptation's bound, not a console value.
 */
export const INFLATE_SLICE_BYTES = 16 * 1024;
export interface InflateOptions {
  /** Stop once this many bytes are out and return them (nothing more is checked). */
  prefix?: number;
  /** The slice fed at a time (default `INFLATE_SLICE_BYTES`). */
  slice?: number;
  /** Counted as the run goes: the input bytes fed, the output bytes read. */
  stats?: { fed: number; out: number };
}
/**
 * Inflates `data` (`format` 'deflate' is zlib, 'deflate-raw' a zip member's) by the browser's `DecompressionStream`,
 * fed a slice at a time and stopping as soon as the output passes `limit` bytes: returns the bytes, 'over' past the
 * limit, or 'bad' for a stream that does not inflate -- bytes after the stream's end included (the browser refuses
 * them; node's `inflateSync`, the generator's, ignores them: a named difference, conventions §10).
 */
export async function inflateBounded(data: Uint8Array, format: 'deflate' | 'deflate-raw', limit: number, options: InflateOptions = {}): Promise<Uint8Array | 'over' | 'bad'> {
  const { prefix } = options, slice = Math.max(1, options.slice ?? INFLATE_SLICE_BYTES), stats = options.stats;
  let stream: { writable: WritableStream<Uint8Array>; readable: ReadableStream<Uint8Array> };
  try { stream = new DecompressionStream(format) as unknown as typeof stream; } catch { return 'bad'; }
  // The writes are gated here, not by the stream's backpressure (node's adapter drains its input whatever is unread):
  // a slice is written, what it gave is read, and no slice follows once the output has passed the limit.
  const writer = stream.writable.getWriter(), reader = stream.readable.getReader();
  writer.closed.catch(() => undefined);           // a cancelled or failed run rejects it; the outcome is read below
  const chunks: Uint8Array[] = [];
  let length = 0, ended = false, failed = false;
  type Read = { r: ReadableStreamReadResult<Uint8Array> } | { e: unknown };
  const next = (): Promise<Read> => reader.read().then(r => ({ r }), (e: unknown) => ({ e }));
  let pending = next(), settled: Read | null = null;
  const arm = (): void => { settled = null; const p = pending; void p.then(x => { if (pending === p) settled = x; }); };
  arm();
  /** A few microtask turns: what the stream already holds settles within them; nothing waits on a timer. */
  const turns = async (): Promise<void> => { for (let i = 0; i < 8 && !settled; i++) await null; };
  const stop = (): boolean => length > limit || (prefix !== undefined && length >= prefix);
  /** Takes one read; true when the run is over (ended, failed, past the limit or the prefix). */
  const take = (x: Read): boolean => {
    if ('e' in x) { failed = true; return true; }
    if (x.r.done) { ended = true; return true; }
    length += x.r.value.byteLength;
    if (stats) stats.out += x.r.value.byteLength;
    chunks.push(x.r.value);
    if (stop()) return true;
    pending = next();
    arm();
    return false;
  };
  let over = false;
  for (let at = 0; at < data.length && !over; at += slice) {
    const part = data.slice(at, Math.min(data.length, at + slice));
    if (stats) stats.fed += part.length;
    const written = writer.write(part).then(() => 'written' as const, () => 'written' as const);
    for (;;) {                                   // read while the slice is taken in (a browser may wait on the reader)
      const x = await Promise.race([written, pending]);
      if (x === 'written') break;
      if (take(x)) { over = true; break; }
    }
    while (!over) {                              // then what the slice gave and is ready now
      await turns();
      const x = settled as Read | null;
      if (!x) break;
      if (take(x)) over = true;
    }
  }
  if (!over) {
    writer.close().catch(() => undefined);
    while (!take(await pending)) { /* the rest of the output */ }
  }
  // A run stopped early aborts the input side (the stream then drops its output); node's adapter, cancelled from the
  // output side instead, rejects promises of its own that nobody can observe.
  if (!ended && !failed) writer.abort(new Error('inflate stopped')).catch(() => undefined);   // not awaited: it waits on the write in flight
  writer.releaseLock();
  reader.releaseLock();
  const joined = (): Uint8Array => {
    const out = new Uint8Array(length);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  };
  if (prefix !== undefined && length >= prefix) return joined();
  if (length > limit) return 'over';
  if (failed) return 'bad';
  return joined();
}

/**
 * GX-27: the browser's decode -- the same chunk walk, bounds and messages as `tools/png.ts`'s `decodePng`, the IDAT
 * inflated by `DecompressionStream('deflate')` bounded to the size the header implies. A stream that does not inflate
 * is `PNG: image data does not inflate` -- as is one with bytes after its end, which the generator's `decodePng`
 * accepts (a named difference, conventions §10); one that inflates past the image, `PNG: image data is the wrong length`.
 */
export async function decodePngAsync(bytes: Uint8Array, maxEdge = 8192): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const chunks = readPngChunks(bytes, maxEdge);
  const raw = await inflateBounded(chunks.packed, 'deflate', chunks.expected);
  if (raw === 'bad') fail('image data does not inflate');
  if (raw === 'over') fail('image data is the wrong length');
  return unfilterPng(chunks, raw as Uint8Array);
}
