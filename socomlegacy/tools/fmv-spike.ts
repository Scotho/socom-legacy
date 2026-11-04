/**
 * The decoder harness (PLAT-19a's spike, research 98 §7; switched to the page's decoder core and PLAT-18's demuxer by
 * PLAT-19b, research 120 §8). Dev-host only: it reads the disc's movies and writes decodes into a git-ignored scratch
 * directory; no picture, stream or hash of disc data is written into the tree.
 *
 *   npx tsx tools/fmv-spike.ts decode <libmpeg2.wasm> <movie.PSS | stream.m2v> <ours.yuv> [--iso <image>] [--records r.json] [--check]
 *   npx tsx tools/fmv-spike.ts compare <ours.yuv> <ref.yuv> [--size 640x448] [--count N] [--out records.json]
 *
 * `decode` instantiates `packages/fmv/wasm/build.sh`'s standalone `libmpeg2.wasm` (no generated JS: compiled and
 * instantiated here, its imports stubbed by `mpeg2ImportStubs`) and decodes a movie through `@s2u/fmv`'s core
 * (`MovieDecoder` over `wasmMpeg2Engine`) -- the code the page's worker runs. A `.PSS` is demuxed by PLAT-18's
 * `demuxPss` (16 KB reads, `PSS_READ_CHUNK`): from the file system, or with `--iso` from the retail image by range
 * through `IsoAssetSource` (the movie's path inside the image, e.g. `RUN/MOVIES/COMMON/SONY448.PSS`); a `.m2v`
 * elementary stream is fed as it is (research 98 §7.1's two-sequence stream). The core feeds one coded picture per
 * feed, tagged with its coding index. Every displayed picture goes to `ours.yuv` as raw yuv420p in display order. It
 * prints the count, the coding types, the invalid states and the time spent in the core (the file writes excluded);
 * `--records` writes per picture the display index, coding index, type, temporal reference, PTS and plane hashes.
 *
 * `--check` proves count and order without looking at a sample (research 98 §7.8): the coded pictures are read off the
 * stream's picture start codes as the core cuts it (`CodedPictureSplitter`), grouped into frames (`codedFrames`: a
 * field picture and its complement are one frame), and the coding indices the decoder displays must be exactly
 * `displayOrder` of those frames -- every coded frame shown once, in the standard's order -- each with its header's
 * type and temporal reference. Exit code 1 on a failed check.
 *
 * `compare` takes two raw yuv420p decodes of the same stream (ours; ref: libavcodec's, `ffmpeg -i <movie> -map 0:v:0
 * -fps_mode passthrough -f rawvideo -pix_fmt yuv420p`) and prints: the picture counts, the pictures hash-equal per
 * plane, the worst and mean |difference| per plane, the pictures whose nearest reference is a neighbour (a shift:
 * dropped, repeated or reordered), and the pictures with extra black 16x16 blocks (`fmvPlanes.extraBlackBlocks`,
 * movie_blocks.py's differential). `--out` writes one record per picture to scratch.
 *
 * The pure pieces are `tools/fmvPlanes.ts` and `tools/fmvStream.ts`, tested in `tools/test/fmvPlanes.test.ts` and
 * `tools/test/fmvStream.test.ts`; the core is `@s2u/fmv`'s, tested in `packages/fmv/test/`.
 */
import { createHash } from 'node:crypto';
import { closeSync, createReadStream, fstatSync, openSync, readFileSync, readSync, writeFileSync, writeSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { IsoAssetSource } from '@s2u/archive';
import {
  CodedPictureSplitter, MovieDecoder, PSS_READ_CHUNK, demuxPss, demuxPssFile, mpeg2ImportStubs, wasmMpeg2Engine,
  type CodedUnit, type Mpeg2Engine, type PssPacket,
} from '@s2u/fmv';
import { comparePlanes, extraBlackBlocks, pictureAt, planeDiff, planes } from './fmvPlanes';
import { codedFrames, displayOrder, type PictureHeader } from './fmvStream';

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex').slice(0, 16);
const USAGE = [
  'usage: npx tsx tools/fmv-spike.ts decode <libmpeg2.wasm> <movie.PSS | stream.m2v> <ours.yuv> [--iso <image>] [--records r.json] [--check]',
  '       npx tsx tools/fmv-spike.ts compare <ours.yuv> <ref.yuv> [--size 640x448] [--count N] [--out records.json]',
].join('\n');

/** A file as a Blob by `readSync` per slice: `fs.openAsBlob` reports an image above 4 GiB modulo 2^32 on Windows. */
export function fsBlob(path: string): Blob & { close(): void } {
  const fd = openSync(path, 'r');
  const size = fstatSync(fd).size;
  const slice = (start = 0, end = size): Blob => ({
    size: end - start,
    arrayBuffer: async () => {
      const out = new Uint8Array(end - start);
      let got = 0;
      while (got < out.length) {
        const n = readSync(fd, out, got, out.length - got, start + got);
        if (n === 0) break;
        got += n;
      }
      return out.buffer;
    },
  }) as unknown as Blob;
  return { size, slice, close: () => closeSync(fd) } as unknown as Blob & { close(): void };
}

/** A file's bytes `PSS_READ_CHUNK` at a time. */
async function* fileChunks(path: string): AsyncGenerator<Uint8Array> {
  for await (const c of createReadStream(path, { highWaterMark: PSS_READ_CHUNK })) yield new Uint8Array(c as Buffer);
}

/**
 * The movie's packets: a PSS demuxed from a file or (with `iso`) from the image by range, or an elementary stream
 * (`.m2v`) as video packets. `close` lets the image go.
 */
export function moviePackets(input: string, iso?: string): { packets: AsyncIterable<PssPacket>; close(): void } {
  if (/\.m2v$/i.test(input)) {
    return {
      packets: (async function* () {
        let offset = 0;
        for await (const data of fileChunks(input)) { yield { streamId: 0xe0, offset, data }; offset += data.length; }
      })(),
      close: () => undefined,
    };
  }
  if (iso) {
    const blob = fsBlob(iso);
    return { packets: demuxPssFile(new IsoAssetSource(blob), input), close: () => blob.close() };
  }
  return { packets: demuxPss(fileChunks(input)), close: () => undefined };
}

/** Instantiate `libmpeg2.wasm` at `path` as the page's worker does, with a file read in place of `fetch`. */
export async function engineFromFile(path: string): Promise<Mpeg2Engine> {
  const module = await WebAssembly.compile(readFileSync(path));
  const instance = await WebAssembly.instantiate(module, mpeg2ImportStubs(WebAssembly.Module.imports(module)));
  return wasmMpeg2Engine(instance.exports);
}

/** `packets` passed through, their video also cut by a splitter of its own: the coded pictures' headers, in coding order. */
export function teeHeaders(packets: AsyncIterable<PssPacket>, headers: PictureHeader[]): AsyncIterable<PssPacket> {
  const s = new CodedPictureSplitter();
  const keep = (u: CodedUnit | null): void => { if (u?.header) headers.push({ offset: 0, ...u.header }); };
  return (async function* () {
    for await (const p of packets) {
      if (p.streamId >= 0xe0 && p.streamId <= 0xef) for (const u of s.push(p.data, p.pts)) keep(u);
      yield p;
    }
    keep(s.end());
  })();
}

/**
 * What is wrong with `shown` (the displayed pictures' tags, types and temporal references) against the coded
 * pictures' headers: the count in frames, the order (`displayOrder` of the frames), the type and temporal reference of
 * each. Empty when every coded frame was displayed once, in the standard's order.
 */
export function orderProblems(headers: readonly PictureHeader[], shown: readonly { codingIndex: number | null; type: string; temporalReference: number }[]): string[] {
  const frames = codedFrames(headers);
  const want = displayOrder(frames.map((f) => f.type)).map((k) => frames[k]!.first);
  const problems: string[] = [];
  const seconds = headers.length - frames.length;
  if (shown.length !== frames.length) {
    problems.push(`${shown.length} pictures displayed, ${frames.length} coded frames in the stream` +
      (seconds ? ` (${headers.length} picture start codes, ${seconds} of them second fields of a field pair)` : ''));
  }
  const got = shown.map((x) => x.codingIndex ?? -1);
  const first = want.findIndex((k, i) => got[i] !== k);
  if (first >= 0 || got.length !== want.length) {
    const at = first >= 0 ? first : Math.min(got.length, want.length);
    problems.push(`display order differs from the coded pictures' at position ${at}: got tags ${got.slice(Math.max(0, at - 2), at + 3).join(',')}, want ${want.slice(Math.max(0, at - 2), at + 3).join(',')}`);
  }
  const mismatched = shown.filter((x) => x.codingIndex === null || headers[x.codingIndex]?.type !== x.type || headers[x.codingIndex]?.temporalReference !== x.temporalReference);
  if (mismatched.length) problems.push(`${mismatched.length} displayed pictures whose type or temporal reference is not their tag's header's`);
  return problems;
}

async function decode(wasmPath: string, input: string, outPath: string): Promise<void> {
  const t0 = performance.now();
  const engine = await engineFromFile(wasmPath);
  console.log(`${wasmPath}: libmpeg2 0.5.1; instantiate ${(performance.now() - t0).toFixed(1)} ms`);
  const check = args.includes('--check');
  const headers: PictureHeader[] = [];
  const src = moviePackets(input, opt('--iso'));
  const decoder = new MovieDecoder(engine);
  decoder.open(check ? teeHeaders(src.packets, headers) : src.packets);
  const fd = openSync(outPath, 'w');
  const records: unknown[] = [];
  const shown: { codingIndex: number | null; type: string; temporalReference: number }[] = [];
  const types: Record<string, number> = {};
  let core = 0, size = '';
  let end;
  for (;;) {
    const t = performance.now();
    const r = await decoder.next();
    core += performance.now() - t;
    if (r.kind === 'end') { end = r; break; }
    const p = r.picture;
    size ||= `${p.width}x${p.height}`;
    writeSync(fd, p.data);
    types[p.type] = (types[p.type] ?? 0) + 1;
    if (check) shown.push({ codingIndex: p.codingIndex, type: p.type, temporalReference: p.temporalReference });
    if (opt('--records')) {
      const pl = planes(p.data, p.width, p.height);
      records.push({ index: p.index, codingIndex: p.codingIndex, type: p.type, temporalReference: p.temporalReference, pts: p.pts, planes: [sha(pl.y), sha(pl.cb), sha(pl.cr)] });
    }
  }
  closeSync(fd);
  src.close();
  engine.close();
  console.log(`${input}${opt('--iso') ? ` (from ${opt('--iso')})` : ''}: ${end.coded} coded pictures -> ${end.pictures} pictures ${size} ` +
    `(${Object.entries(types).map(([k, v]) => `${k} ${v}`).join(', ')}); invalid states ${end.invalid}; ${end.error ? `ended early: ${end.error}` : 'to its end'}`);
  console.log(`  decode time (the core: demux, cut, wasm, copy): ${core.toFixed(1)} ms total, ${(core / Math.max(1, end.pictures)).toFixed(3)} ms per picture`);
  if (opt('--records')) writeFileSync(opt('--records')!, JSON.stringify(records));
  if (check) {
    const problems = orderProblems(headers, shown);
    const fields = headers.filter((h) => h.structure === 'top' || h.structure === 'bottom').length;
    console.log(`  check (count and order, by tags): ${headers.length} coded pictures (${['I', 'P', 'B'].map((t) => `${headers.filter((x) => x.type === t).length} ${t}`).join(', ')})` +
      `${fields ? `, ${fields} of them field pictures, paired into frames` : ''}, ${end.pictures} displayed: ${problems.length ? 'FAIL -- ' + problems.join('; ') : 'PASS'}`);
    if (problems.length || end.error) process.exitCode = 1;
  }
}

function compare(oursPath: string, refPath: string): void {
  const [W, H] = (opt('--size') ?? '640x448').split('x').map(Number) as [number, number];
  const SIZE = W * H * 3 / 2;
  const ours = new Uint8Array(readFileSync(oursPath));
  const ref = new Uint8Array(readFileSync(refPath));
  const nOurs = ours.length / SIZE;
  const nRef = ref.length / SIZE;
  if (!Number.isInteger(nOurs) || !Number.isInteger(nRef)) throw new Error(`a file is not whole ${W}x${H} pictures: ${nOurs}, ${nRef}`);
  const count = Math.min(Number(opt('--count') ?? Infinity), nOurs, nRef);

  const total = { y: { max: 0, sum: 0, n: 0, equal: 0, worst: -1 }, cb: { max: 0, sum: 0, n: 0, equal: 0, worst: -1 }, cr: { max: 0, sum: 0, n: 0, equal: 0, worst: -1 } };
  let allEqual = 0;
  const shifted: number[] = [];
  const black: number[] = [];
  const records: unknown[] = [];

  for (let i = 0; i < count; i++) {
    const a = pictureAt(ours, i, W, H);
    const b = pictureAt(ref, i, W, H);
    const d = comparePlanes(a, b, W, H);
    for (const k of ['y', 'cb', 'cr'] as const) {
      const t = total[k];
      if (d[k].maxAbs > t.max) { t.max = d[k].maxAbs; t.worst = i; }
      t.sum += d[k].sumAbs; t.n += d[k].n;
      if (d[k].equal) t.equal++;
    }
    const equal = d.y.equal && d.cb.equal && d.cr.equal;
    if (equal) allEqual++;
    else {
      // A shift shows as a neighbour of the reference being nearer than the picture at the same index.
      const here = planeDiff(a, b).sumAbs;
      for (const j of [i - 1, i + 1]) {
        if (j < 0 || j >= nRef) continue;
        if (planeDiff(a, pictureAt(ref, j, W, H)).sumAbs < here) { shifted.push(i); break; }
      }
    }
    const extra = extraBlackBlocks(a, b, W, H);
    if (extra.length) black.push(i);
    if (opt('--out')) {
      const pa = planes(a, W, H);
      const pb = planes(b, W, H);
      records.push({
        index: i,
        ours: [sha(pa.y), sha(pa.cb), sha(pa.cr)],
        ref: [sha(pb.y), sha(pb.cb), sha(pb.cr)],
        diff: { y: d.y, cb: d.cb, cr: d.cr },
        extraBlack: extra,
      });
    }
  }

  console.log(`${oursPath} vs ${refPath}: ${nOurs} vs ${nRef} pictures; compared ${count}`);
  console.log(`  hash-equal on all three planes: ${allEqual}/${count}`);
  for (const k of ['y', 'cb', 'cr'] as const) {
    const t = total[k];
    console.log(`  ${k.padEnd(2)} equal ${t.equal}/${count}, max |d| ${t.max}${t.worst >= 0 ? ` (worst picture ${t.worst})` : ''}, mean |d| ${(t.sum / Math.max(1, t.n)).toFixed(6)}`);
  }
  console.log(`  nearer to a neighbour (shifted): ${shifted.length}${shifted.length ? ' ' + shifted.slice(0, 20).join(',') : ''}`);
  console.log(`  extra black 16x16 blocks: ${black.length} pictures${black.length ? ' ' + black.slice(0, 20).join(',') : ''}`);
  if (opt('--out')) writeFileSync(opt('--out')!, JSON.stringify(records));
}

// Run as a script only: the dev-disc test imports `engineFromFile`, `moviePackets`, `teeHeaders` and `orderProblems`.
const [mode, a1, a2, a3] = args;
if (/fmv-spike\.ts$/.test((process.argv[1] ?? '').replace(/\\/g, '/'))) {
  if (mode === 'decode' && a1 && a2 && a3) await decode(a1, a2, a3);
  else if (mode === 'compare' && a1 && a2) compare(a1, a2);
  else {
    console.error(USAGE);
    process.exit(2);
  }
}
