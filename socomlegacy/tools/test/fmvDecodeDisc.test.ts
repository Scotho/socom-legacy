import { describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { IsoAssetSource, type AssetSource } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { MovieDecoder, demuxPssFile } from '@s2u/fmv';
import { engineFromFile, fsBlob, orderProblems, teeHeaders } from '../fmv-spike';
import { BLACK_FLIP_RGB_READING, blockMaxDiff, comparePlanes, lostBlackBlocks } from '../fmvPlanes';
import type { PictureHeader } from '../fmvStream';

/**
 * PLAT-19b's dev-disc acceptance (research 120 §8; the block in `docs/roadmap/01-platform.md`): every picture of
 * SONY448, INTRO_2 and MENULOOP decoded by the page's core (`MovieDecoder` over libmpeg2's wasm, fed by PLAT-18's
 * demuxer reading the movie by range -- from the retail image when `SOCOM_ISO` is set, as the page reads it, else from
 * the disc tree) against libavcodec's decode of the same file made now (`ffmpeg -i <PSS> -map 0:v:0 -fps_mode
 * passthrough -f rawvideo -pix_fmt yuv420p`, research 98 §7.3; not a committed list of hashes):
 *
 * - the same count and order, and the count the demuxer pinned (research 109: 310, 3836, 3732);
 * - every coded picture displayed once, in the standard's order, by the decoder's tags (research 98 §7.8);
 * - 0 lost blocks: no 16x16 block black in ours (every RGB byte 0 after the IPU's conversion) where libavcodec's is
 *   brighter than `BLACK_FLIP_RGB_READING` (`lostBlackBlocks`; `tools_py/parity/movie_blocks.py`'s differential with the
 *   black-level flip set apart). It fails on its own, apart from the per-sample bound: a block lost over a near-black
 *   reference stays within 5 per sample. The strict count -- any block black in ours and not in libavcodec's -- is
 *   logged, not failed: on the full movies it finds 87 INTRO_2 and 9 MENULOOP pictures whose every such block is
 *   libavcodec's RGB 1 within 1 sample, the IDCTs' rounding at the black level, which libavcodec against itself with
 *   another IDCT finds as often (research 98 §7.11). Relaxing "0 pictures with extra black blocks" to this reading is
 *   the controller's ruling to record at merge;
 * - every picture within the bound: research 98 §7.1's 3 per sample and 0.015 per-picture mean held on SONY448 and
 *   MENULOOP; INTRO_2 past its first 300 pictures reaches 5 and 0.0209 (picture 1284 Cr, picture 2247 Y), so the
 *   bound is research 98 §7.11's full-movie one, 5 and 0.021, raised there with its evidence.
 *
 * Skips without the disc (`SOCOM_DISC`), the built wasm (`packages/fmv/wasm/build.sh`) or ffmpeg. Heavy: three whole
 * movies decoded twice and compared picture by picture -- the host's lock rules apply (a free lock).
 */
const DISC = process.env.SOCOM_DISC;
const ISO = process.env.SOCOM_ISO;
const WASM = resolve(import.meta.dirname, '../../packages/fmv/wasm/out/libmpeg2.wasm');
const HAVE_DISC = !!DISC && existsSync(resolve(DISC, 'RUN/MOVIES'));
const HAVE = HAVE_DISC && existsSync(WASM) && spawnSync('ffmpeg', ['-version']).status === 0;

/** The pictures research 109 counts (the demuxer's and ffprobe's). */
const MOVIES: Record<string, number> = {
  'RUN/MOVIES/COMMON/SONY448.PSS': 310,
  'RUN/MOVIES/INTRO_2.PSS': 3836,
  'RUN/MOVIES/COMMON/MENULOOP.PSS': 3732,
};
/** The full-movie epsilon (research 98 §7.11; §7.1's 3 and 0.015 were INTRO_2's first 300 pictures). */
const MAX_SAMPLE = 5;
const MAX_MEAN = 0.021;

/** libavcodec's decode of `file`, one picture of `size` bytes per pull, never held whole (INTRO_2 is 1.65 GB of yuv). */
async function* ffmpegPictures(file: string, size: number): AsyncGenerator<Uint8Array> {
  const run = spawn('ffmpeg', ['-nostdin', '-v', 'error', '-threads', '1', '-i', file, '-map', '0:v:0', '-threads', '1',
    '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-']);
  let err = '';
  run.stderr.on('data', (b: Buffer) => { err += b; });
  const exited = new Promise<number | null>((done) => run.on('close', done));
  let pending = new Uint8Array(0);
  for await (const chunk of run.stdout) {
    const b = new Uint8Array(chunk as Buffer);
    let joined = pending.length ? new Uint8Array(pending.length + b.length) : b;
    if (pending.length) { joined.set(pending); joined.set(b, pending.length); }
    let at = 0;
    for (; at + size <= joined.length; at += size) yield joined.slice(at, at + size);
    pending = joined.slice(at);
    joined = pending;
  }
  const code = await exited;
  if (code !== 0) throw new Error(`ffmpeg exited ${code}: ${err}`);
  if (pending.length) throw new Error(`ffmpeg left ${pending.length} bytes, not a whole picture`);
}

interface Worst { value: number; picture: number; plane: string }
const worse = (w: Worst, value: number, picture: number, plane: string): void => { if (value > w.value) { w.value = value; w.picture = picture; w.plane = plane; } };

describe.skipIf(!HAVE)('the page\'s decoder against libavcodec, every picture (SOCOM_DISC, the built wasm, ffmpeg)', () => {
  for (const [path, count] of Object.entries(MOVIES)) {
    it(`${path}: ${count} pictures, once each and in order, 0 lost blocks, within ${MAX_SAMPLE} per sample and ${MAX_MEAN} per picture`, async () => {
      const blob = ISO && existsSync(ISO) ? fsBlob(ISO) : null;
      const source: AssetSource = blob ? new IsoAssetSource(blob) : new FsAssetSource(resolve(DISC ?? ''));
      const engine = await engineFromFile(WASM);
      try {
        const headers: PictureHeader[] = [];
        const decoder = new MovieDecoder(engine);
        decoder.open(teeHeaders(demuxPssFile(source, path), headers));
        const shown: { codingIndex: number | null; type: string; temporalReference: number }[] = [];
        let ref: AsyncGenerator<Uint8Array> | null = null;
        const maxAbs: Worst = { value: 0, picture: -1, plane: '' };
        const maxMean: Worst = { value: 0, picture: -1, plane: '' };
        const black: number[] = [];
        const lost: number[] = [];
        let blackWorst = 0;
        let blackRgbWorst = 0;
        const over: number[] = [];
        let refCount = 0;
        let end;
        for (;;) {
          const r = await decoder.next();
          if (r.kind === 'end') { end = r; break; }
          const p = r.picture;
          ref ??= ffmpegPictures(resolve(DISC ?? '', path), p.width * p.height * 3 / 2);
          const theirs = await ref.next();
          if (theirs.done) break;
          refCount++;
          shown.push({ codingIndex: p.codingIndex, type: p.type, temporalReference: p.temporalReference });
          const d = comparePlanes(p.data, theirs.value, p.width, p.height);
          let out = false;
          for (const k of ['y', 'cb', 'cr'] as const) {
            const mean = d[k].sumAbs / d[k].n;
            worse(maxAbs, d[k].maxAbs, p.index, k);
            worse(maxMean, mean, p.index, k);
            if (d[k].maxAbs > MAX_SAMPLE || mean > MAX_MEAN) out = true;
          }
          if (out) over.push(p.index);
          // Every block black in ours and not in libavcodec's (the strict count), with libavcodec's RGB max.
          const extra = lostBlackBlocks(p.data, theirs.value, p.width, p.height, 0);
          if (extra.length) {
            black.push(p.index);
            const d = Math.max(...extra.map((b) => blockMaxDiff(p.data, theirs.value, p.width, p.height, b.bx, b.by)));
            blackWorst = Math.max(blackWorst, d);
            blackRgbWorst = Math.max(blackRgbWorst, ...extra.map((b) => b.refRgbMax));
            if (extra.some((b) => b.refRgbMax > BLACK_FLIP_RGB_READING)) lost.push(p.index);
          }
        }
        // libavcodec's remaining pictures, if ours ended first.
        if (ref) for await (const _ of ref) { refCount++; void _; }
        console.log(`${path}${blob ? ' (from the image)' : ''}: ours ${end?.pictures ?? '?'} (coded ${end?.coded}, invalid ${end?.invalid}), libavcodec ${refCount}; `
          + `max |d| ${maxAbs.value} (picture ${maxAbs.picture}, ${maxAbs.plane}); worst picture mean ${maxMean.value.toFixed(5)} (picture ${maxMean.picture}, ${maxMean.plane}); `
          + `over the bound ${over.length}${over.length ? ` (${over.slice(0, 10).join(',')})` : ''}; `
          + `extra black ${black.length} pictures (their blocks' worst |d| ${blackWorst}, libavcodec's RGB max ${blackRgbWorst}), lost blocks in ${lost.length}`);
        expect(end, 'ours ended before libavcodec').toBeDefined();
        expect(end!.error).toBeNull();
        expect(end!.invalid).toBe(0);
        expect(end!.pictures).toBe(count);
        expect(refCount).toBe(count);
        expect(orderProblems(headers, shown)).toEqual([]);
        expect(lost).toEqual([]);
        expect(over).toEqual([]);
      } finally {
        engine.close();
        blob?.close();
      }
    }, 1_800_000);
  }
});
