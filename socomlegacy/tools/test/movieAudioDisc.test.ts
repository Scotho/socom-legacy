import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { IsoAssetSource, type AssetSource } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import {
  MOVIE_PCM_RING_BYTES, SShdSplitter, demuxPssFile, movieAudioFrameAt, movieAudioTimeline, primeMovieAudio,
  type MoviePrimePacket,
} from '@s2u/fmv';
import { MOVIE_PCM_LAYOUT_READING, MoviePcmDecoder } from '@s2u/sound';
import { fsBlob } from '../fmv-spike';

/**
 * PLAT-20's dev-disc checks (web research 137 §5): each opener movie's sound track decoded whole -- PLAT-18's demuxer
 * (from the retail image when `SOCOM_ISO` is set, as the page reads it, else the disc tree), the track's header cut
 * (`SShdSplitter`), the PCM decoded by `@s2u/sound`'s `MoviePcmDecoder` -- and pinned: the frames, the rate, a SHA-256
 * of each channel's samples (16-bit little-endian, in order). INTRO_2, the trailer, is the acceptance's centre.
 *
 * Also held on the disc's data: the channel layout (`MOVIE_PCM_LAYOUT_READING`, research 137 R137.2), the create's
 * priming (`primeMovieAudio`: the sound starts with picture 0, R137.3), and the ring's tail after the track
 * (R137.4). `PSS_ALL=1` runs the layout and the priming over all 69 PSS files. Skips without the disc.
 */
const DISC = process.env.SOCOM_DISC;
const ISO = process.env.SOCOM_ISO;
const HAVE_DISC = !!DISC && existsSync(resolve(DISC, 'RUN/MOVIES'));
const HAVE_ISO = !!ISO && existsSync(ISO);
const HAVE = HAVE_DISC || HAVE_ISO;

/** Pinned 2026-10-02 by this decode (frames a channel; the SHA-256 of each channel's samples). */
const TRACKS: Record<string, { frames: number; left: string; right: string; pictures: number; tailRms: number }> = {
  'RUN/MOVIES/COMMON/SONY448.PSS': {
    frames: 528_640, pictures: 310, tailRms: 0,
    left: '49450eaf577270d13b1861022bb086e43d2c38c7338f81df7d6081582f971c71',
    right: '689b915e3c6d01252df547c59d893a6ab8acb5b9253ec66cb5c01660947cc82f',
  },
  'RUN/MOVIES/INTRO_2.PSS': {
    frames: 5_979_392, pictures: 3836, tailRms: 4,
    left: '7fc02dfdcbc43c54d9d1ead1a31fd055d32e36d01a2c6f9b82c07ac27d580cef',
    right: 'aa767a20b3619c593707b036f180c4ee0262392196ae09070efb89a0fa0b6213',
  },
  'RUN/MOVIES/COMMON/MENULOOP.PSS': {
    frames: 5_951_744, pictures: 3732, tailRms: 0,
    left: '7d57ad84c619c889b96f2c1617a891382a66c83109a7df1ad8899b544c9838d2',
    right: '6ac6149806ac2775acd5bece7e0a53ff400b49164e49f7a963868ee8fb9f6585',
  },
};

/** The two layouts' tests on raw 16-bit words: the step at a block's edge against inside it, and each decode's smoothness. */
interface Layout { edgeStep: number; innerStep: number; blocksSmooth: number; samplesSmooth: number }
const layoutMeter = () => {
  let edge = 0, nEdge = 0, inner = 0, nInner = 0, blk = 0, smp = 0, nSmooth = 0;
  return {
    /** Whole 1024-byte groups of words, in order. */
    group(w: Int16Array) {
      for (let g = 0; g + 512 <= w.length; g += 512) {
        for (let i = 0; i < 511; i++) {
          const d = Math.abs(w[g + i + 1]! - w[g + i]!);
          if (i === 255) { edge += d; nEdge++; } else { inner += d; nInner++; }
        }
        for (let k = 1; k < 256; k++) {
          blk += Math.abs(w[g + k]! - w[g + k - 1]!) + Math.abs(w[g + 256 + k]! - w[g + 256 + k - 1]!);
          smp += Math.abs(w[g + 2 * k]! - w[g + 2 * k - 2]!) + Math.abs(w[g + 2 * k + 1]! - w[g + 2 * k - 1]!);
          nSmooth += 2;
        }
      }
    },
    result: (): Layout => ({ edgeStep: edge / nEdge, innerStep: inner / nInner, blocksSmooth: blk / nSmooth, samplesSmooth: smp / nSmooth }),
  };
};

/** One movie's track, decoded as it streams, with its packets' sizes for the priming. */
async function decodeTrack(source: AssetSource, path: string) {
  const split = new SShdSplitter();
  let dec: MoviePcmDecoder | null = null;
  const hl = createHash('sha256'), hr = createHash('sha256');
  const packets: MoviePrimePacket[] = [];
  const meter = layoutMeter();
  let frames = 0, pcmBytes = 0, raw = new Uint8Array(0);
  /** The last pieces, enough of them to hold the ring's 6144 frames. */
  const tail: { left: Int16Array; right: Int16Array }[] = [];
  for await (const p of demuxPssFile(source, path)) {
    packets.push({ streamId: p.streamId, length: p.data.length, ...(p.subStream ? { subStream: p.subStream.slice() } : {}) });
    if (p.streamId !== 0xbd) continue;
    const pcm = split.push(p.data);
    if (!split.header) continue;
    dec ??= new MoviePcmDecoder(split.header);
    pcmBytes += pcm.length;
    // The raw words for the layout meter, in whole 1024-byte groups.
    const joined = new Uint8Array(raw.length + pcm.length);
    joined.set(raw); joined.set(pcm, raw.length);
    const whole = joined.length - (joined.length % 1024);
    if (whole) meter.group(new Int16Array(joined.slice(0, whole).buffer));
    raw = joined.slice(whole);
    const piece = dec.push(pcm);
    if (!piece) continue;
    hl.update(new Uint8Array(piece.left.buffer)); hr.update(new Uint8Array(piece.right.buffer));
    frames += piece.left.length;
    tail.push(piece);
    while (tail.length > 1 && tail.slice(1).reduce((n, q) => n + q.left.length, 0) >= MOVIE_PCM_RING_BYTES / 4) tail.shift();
  }
  const cat = (k: 'left' | 'right'): Int16Array => {
    const out = new Int16Array(tail.reduce((n, q) => n + q[k].length, 0));
    let o = 0;
    for (const q of tail) { out.set(q[k], o); o += q[k].length; }
    return out;
  };
  const last = { left: cat('left'), right: cat('right') };
  return { header: split.header!, frames, pcmBytes, pending: dec?.pending ?? -1, left: hl.digest('hex'), right: hr.digest('hex'), packets, layout: meter.result(), last };
}

const openSource = (): AssetSource => (HAVE_ISO ? new IsoAssetSource(fsBlob(ISO!)) : new FsAssetSource(resolve(DISC!)));

describe.skipIf(!HAVE)('PLAT-20 on the dev disc: the opener\'s sound tracks decoded whole', () => {
  for (const [path, want] of Object.entries(TRACKS)) {
    it(`${path}: frames, rate and digest; the layout; the start with picture 0; the ring's tail`, async () => {
      const t = await decodeTrack(openSource(), path);
      // The track: 48000 Hz, two channels, every byte in whole 1 KB groups, the samples as pinned.
      expect(t.header.sampleRate).toBe(48000);
      expect(t.header.channels).toBe(2);
      expect(t.pending).toBe(0);
      expect(t.frames).toBe(want.frames);
      expect(t.frames * 4).toBe(t.header.bodySize);
      expect({ left: t.left, right: t.right }).toEqual({ left: want.left, right: want.right });
      // The layout the decoder reads: a block's edge is a channel change (a big step), and the blocks decode smoother.
      expect(MOVIE_PCM_LAYOUT_READING).toBe('blocks');
      expect(t.layout.edgeStep).toBeGreaterThan(1.5 * t.layout.innerStep);
      expect(t.layout.samplesSmooth).toBeGreaterThan(1.5 * t.layout.blocksSmooth);
      // The priming stops on the staging ring and holds the ring's 24 KB: the sound starts with picture 0.
      const prime = primeMovieAudio(t.packets);
      expect(prime.stoppedBy).toBe('audio');
      expect(prime.staged).toBeGreaterThanOrEqual(MOVIE_PCM_RING_BYTES);
      expect(prime.startsOnFirstPicture).toBe(true);
      // The timeline at the picture rate (1001/30000 s a tick): where the movie's end falls in the sound.
      const tl = movieAudioTimeline(t.pcmBytes, t.header);
      expect(tl.frames).toBe(want.frames);
      const endFrame = movieAudioFrameAt(tl, (want.pictures * 1001) / 30000);
      if (want.frames / 48000 < (want.pictures * 1001) / 30000) {
        // The track ends first (INTRO_2, MENULOOP): the ring's last 6144 frames play until the end; they are (near) silent.
        expect(endFrame).toBeGreaterThanOrEqual(tl.frames - tl.loopFrames);
        const l = t.last.left, r = t.last.right, n = tl.loopFrames;
        let s = 0;
        for (let i = l.length - n; i < l.length; i++) s += l[i]! * l[i]! + r[i]! * r[i]!;
        expect(Math.sqrt(s / (2 * n))).toBeLessThanOrEqual(want.tailRms);
      } else {
        // The pictures end first (SONY448): the stop cuts the track.
        expect(endFrame).toBeLessThan(tl.frames);
      }
    }, 300_000);
  }
});

describe.skipIf(!HAVE_DISC || process.env.PSS_ALL !== '1')('PLAT-20 over all 69 PSS files (PSS_ALL=1)', () => {
  const files = (dir: string): string[] => readdirSync(resolve(DISC!, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(`${dir}/${e.name}`) : /\.pss$/i.test(e.name) ? [`${dir}/${e.name}`] : []);

  it('every track: the block layout and whole 1 KB groups; which start with picture 0 by the priming', async () => {
    const all = files('RUN/MOVIES');
    expect(all.length).toBe(69);
    const source = new FsAssetSource(resolve(DISC!));
    const later: string[] = [];
    for (const path of all) {
      const t = await decodeTrack(source, path);
      const prime = primeMovieAudio(t.packets);
      expect(t.pending, path).toBe(0);
      expect(t.layout.edgeStep, path).toBeGreaterThan(t.layout.innerStep);
      expect(t.layout.samplesSmooth, path).toBeGreaterThan(t.layout.blocksSmooth);
      if (!prime.startsOnFirstPicture) later.push(`${path} ${prime.stoppedBy} ${prime.staged}`);
    }
    // Research 137 R137.3: the priming holds the ring's 24 KB on 68 of the 69; one campaign movie's priming stops on
    // the video ring with 16,252 PCM bytes staged, so its sound starts on a later tick (the per-tick demux decides which).
    expect(later).toEqual(['RUN/MOVIES/M51/M51IG07.PSS video 16252']);
  }, 900_000);
});
