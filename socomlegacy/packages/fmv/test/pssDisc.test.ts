import { describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync } from 'node:fs';
import { resolve } from 'node:path';
import { IsoAssetSource, type AssetSource } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { PssDemuxer, SShdSplitter, demuxPssFile, type SShdHeader } from '../src/pss';

/**
 * PLAT-18's dev-disc checks (W6.R8; research 109 §3): each PSS demuxed from the disc tree (`SOCOM_DISC`) against
 * ffmpeg's stream copy (`ffmpeg -threads 1 -i X -map 0:v:0 -c copy -f mpeg2video`), byte for byte by length and
 * SHA-256, and its picture count; the audio track's SShd header and length; the PC project's `title_disc_audio.bin`
 * (PC research 32 §7.1 "Method") against the demuxed tracks; and the same file read from the image (`SOCOM_ISO`).
 * Each skips itself when its input is absent, as on CI; the ffmpeg comparison also when ffmpeg is not on the PATH.
 * The ffmpeg run is the host's to schedule (the PC project's lock): one thread, a stream copy, no decode.
 *
 * Three movies by default (SONY448, INTRO_2, MENULOOP, whole); `PSS_ALL=1` runs all 69 PSS files on the disc, for the
 * audio claim (research 109 R109.3, R109.4) and the ffmpeg comparison.
 */
const DISC = process.env.SOCOM_DISC;
const HAVE_DISC = !!DISC && existsSync(resolve(DISC, 'RUN/MOVIES'));
const ISO = process.env.SOCOM_ISO;
const HAVE_ISO = HAVE_DISC && !!ISO && existsSync(ISO);
const HAVE_FFMPEG = HAVE_DISC && spawnSync('ffmpeg', ['-version']).status === 0;
const HAVE_FFPROBE = HAVE_DISC && spawnSync('ffprobe', ['-version']).status === 0;
// The desktop checkout's git-ignored logs/ (SOCOM_PC_ROOT); the repository's root no longer holds it (the restructure).
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const TITLE_AUDIO = PC_ROOT ? resolve(PC_ROOT, 'logs/title_disc_audio.bin') : '';

/**
 * Pictures and the audio track's SSbd size, read 2026-10-01 by this demuxer and by ffmpeg 8.1 (the picture start codes
 * of the stream copy, and `ffprobe -count_frames`: the same). MENULOOP's 3732 contradicts PC research 09's 3790
 * (research 109 §4); 3732 at 30 fps is ffprobe's 124.40 s.
 */
const MOVIES: Record<string, { pictures: number; bodySize: number }> = {
  'RUN/MOVIES/COMMON/SONY448.PSS': { pictures: 310, bodySize: 2_114_560 },
  'RUN/MOVIES/INTRO_2.PSS': { pictures: 3836, bodySize: 23_917_568 },
  'RUN/MOVIES/COMMON/MENULOOP.PSS': { pictures: 3732, bodySize: 23_806_976 },
};
/** Every disc track's header but its size (research 109 §2: all 69 alike). */
const TRACK_HEADER: Omit<SShdHeader, 'bodySize'> = { type: 1, sampleRate: 48000, channels: 2, interleave: 0x200, word24: 0xffffffff, word28: 0xffffffff };

/** The video stream's length, SHA-256 and picture start codes (00 00 01 00), counted across packet boundaries. */
interface VideoDigest { length: number; sha256: string; pictures: number }
const videoDigest = (): { update(b: Uint8Array): void; digest(): VideoDigest } => {
  const h = createHash('sha256');
  let length = 0, pictures = 0, last = 0xffffffff;
  return {
    update(b) {
      h.update(b); length += b.length;
      for (let i = 0; i < b.length; i++) { last = ((last << 8) | b[i]!) >>> 0; if (last === 0x100) pictures++; }
    },
    digest: () => ({ length, sha256: h.digest('hex'), pictures }),
  };
};

/** What the demuxer makes of `path`: the video's digest, the track's header and PCM length, and the counters. */
const demuxed = async (source: AssetSource, path: string) => {
  const v = videoDigest();
  const audio = createHash('sha256');
  const sshd = new SShdSplitter();
  const d = new PssDemuxer();
  let pcm = 0, track = 0;
  const subStreams = new Set<string>();
  for await (const p of demuxPssFile(source, path, {}, d)) {
    if (p.streamId === 0xe0) v.update(p.data);
    else if (p.streamId === 0xbd) {
      audio.update(p.data); track += p.data.length; pcm += sshd.push(p.data).length;
      subStreams.add([...p.subStream!].map((x) => x.toString(16).padStart(2, '0')).join(' '));
    }
  }
  return {
    video: v.digest(), header: sshd.header, pcm, track, audioSha: audio.digest('hex'), subStreams: [...subStreams],
    stats: d.stats, highWater: d.highWater,
  };
};

/** ffmpeg's stream copy of the first video stream, digested as it arrives (never held whole). */
const ffmpegVideo = (file: string): Promise<VideoDigest> => new Promise((done, fail) => {
  const v = videoDigest();
  const run = spawn('ffmpeg', ['-nostdin', '-v', 'error', '-threads', '1', '-i', file, '-map', '0:v:0', '-c', 'copy', '-f', 'mpeg2video', '-']);
  let err = '';
  run.stdout.on('data', (b: Buffer) => v.update(b));
  run.stderr.on('data', (b: Buffer) => { err += b; });
  run.on('error', fail);
  run.on('close', (code) => (code === 0 ? done(v.digest()) : fail(new Error(`ffmpeg exited ${code}: ${err}`))));
});

/** The PSS files on the disc tree (69 on the US disc). */
const allMovies = async (source: AssetSource): Promise<string[]> =>
  (await source.list()).filter((p) => /^RUN\/MOVIES\/.*\.PSS$/i.test(p)).sort();

describe.skipIf(!HAVE_DISC)('the PSS demuxer on the disc tree (SOCOM_DISC)', () => {
  const source = (): AssetSource => new FsAssetSource(resolve(DISC ?? ''));

  it('finds 69 PSS files', async () => {
    expect((await allMovies(source())).length).toBe(69);
  }, 60_000);

  for (const [path, want] of Object.entries(MOVIES)) {
    it(`${path}: its pictures, its track (SShd, then exactly the SSbd size of PCM), packs and nothing skipped`, async () => {
      const got = await demuxed(source(), path);
      expect(got.video.pictures).toBe(want.pictures);
      expect(got.header).toEqual({ ...TRACK_HEADER, bodySize: want.bodySize });
      expect(got.pcm).toBe(want.bodySize);
      expect(got.stats).toMatchObject({ systemHeaders: 1, programEnds: 1, skippedBytes: 0 });
      expect(got.highWater).toBeLessThanOrEqual(0x4000);   // the packs are 16 KB: nothing carries between reads
    }, 120_000);
  }

  it("every track: SShd type 1, 48000 Hz, 2 channels, 0x200 (PCM, no ADPCM), PCM exactly SSbd's size, FF A0 00 00 before each payload", async () => {
    const paths = process.env.PSS_ALL === '1' ? await allMovies(source()) : Object.keys(MOVIES);
    const differ: string[] = [];
    for (const path of paths) {
      const got = await demuxed(source(), path);
      const { bodySize, ...rest } = got.header ?? { bodySize: -1 };
      const ok = JSON.stringify(rest) === JSON.stringify(TRACK_HEADER) && got.pcm === bodySize
        && JSON.stringify(got.subStreams) === '["ff a0 00 00"]' && got.stats.skippedBytes === 0;
      if (!ok) differ.push(`${path}: ${JSON.stringify({ header: got.header, pcm: got.pcm, subStreams: got.subStreams, skipped: got.stats.skippedBytes })}`);
    }
    expect(differ).toEqual([]);
  }, 1_800_000);

  it.skipIf(!HAVE_FFMPEG)('the video is byte-equal to ffmpeg\'s stream copy (-map 0:v:0 -c copy -f mpeg2video)', async () => {
    const paths = process.env.PSS_ALL === '1' ? await allMovies(source()) : Object.keys(MOVIES);
    const differ: string[] = [];
    for (const path of paths) {
      const [ours, theirs] = await Promise.all([demuxed(source(), path), ffmpegVideo(resolve(DISC ?? '', path))]);
      if (JSON.stringify(ours.video) !== JSON.stringify(theirs)) differ.push(`${path}: ${JSON.stringify(ours.video)} vs ${JSON.stringify(theirs)}`);
    }
    expect(differ).toEqual([]);
  }, 1_800_000);

  it.skipIf(!HAVE_FFPROBE)('ffprobe sees no audio stream: its PS reader takes the 0xFF before 0xA0 for the substream id', () => {
    const run = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', resolve(DISC ?? '', 'RUN/MOVIES/INTRO_2.PSS')], { encoding: 'utf8' });
    expect(run.stdout.split(/\r?\n/).filter(Boolean).map((l) => l.replace(/,$/, ''))).toEqual(['video']);
  }, 60_000);

  it.skipIf(!existsSync(TITLE_AUDIO))('title_disc_audio.bin is SONY448\'s whole track, then the head of INTRO_2\'s (PC research 32 §7.1)', async () => {
    const ref = readFileSync(TITLE_AUDIO);
    const ours = createHash('sha256');
    let need = ref.length;
    for (const path of ['RUN/MOVIES/COMMON/SONY448.PSS', 'RUN/MOVIES/INTRO_2.PSS']) {
      for await (const p of demuxPssFile(source(), path)) {
        if (p.streamId !== 0xbd || need === 0) continue;
        const take = p.data.subarray(0, Math.min(need, p.data.length));
        ours.update(take);
        need -= take.length;
      }
    }
    expect(need).toBe(0);
    expect(ours.digest('hex')).toBe(createHash('sha256').update(ref).digest('hex'));
  }, 120_000);
});

/** The retail image through a readSync-per-slice Blob stand-in, as `frontEndDisc.test.ts` reads it. */
const fsBlob = (path: string): Blob & { close(): void } => {
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
};

describe.skipIf(!HAVE_ISO)('the PSS demuxer on the retail image (SOCOM_ISO)', () => {
  it('SONY448 demuxed from the image by range is what the tree gives', async () => {
    const blob = fsBlob(resolve(ISO ?? ''));
    try {
      const path = 'RUN/MOVIES/COMMON/SONY448.PSS';
      const [iso, tree] = await Promise.all([demuxed(new IsoAssetSource(blob), path), demuxed(new FsAssetSource(resolve(DISC ?? '')), path)]);
      expect(iso).toEqual(tree);
    } finally {
      blob.close();
    }
  }, 120_000);
});
