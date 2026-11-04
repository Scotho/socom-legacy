// @vitest-environment node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { PSS_READ_CHUNK, PSS_SUBSTREAM_HEADER, PssDemuxer, SSHD_HEADER_LENGTH, SShdSplitter, demuxPssFile, type SShdHeader } from '../src/pss';

/**
 * TA-FRONTEND's golden pin of the disc's movies as the demuxer reads them (web research 109 §1-§4; TA.R3).
 * `golden/pssStreamMap.json` holds, for each of the 69 `RUN/MOVIES/**.PSS`, the file's size, its packs, packets by
 * stream id, the video elementary stream's length, SHA-256 and picture start codes, the audio track's bytes, its PCM
 * bytes behind the 40-byte header, the SShd header and the substream header -- what `PssDemuxer` / `SShdSplitter` gave
 * over the whole of each file, 2026-10-02 (`pssDisc.test.ts` held the video to ffmpeg's stream copy). The unit half
 * checks the pin's invariants and research 109's totals and drives the header reader from it with no game data (CI);
 * the disc half re-demuxes SONY448, INTRO_2 and MENULOOP and compares their rows whole, and every file's size; with
 * `PSS_ALL=1` every row (3.25 GB read: a heavy run, the host lock's). It skips without `SOCOM_DISC`.
 */
interface Movie {
  path: string; size: number; packs: number; systemHeaders: number; programEnds: number; packets: Record<string, number>;
  skippedBytes: number; pictures: number; video: { length: number; sha256: string }; track: number; pcm: number;
  header: SShdHeader; subStreams: string[];
}
interface Pin { _source: string; movies: Movie[] }
const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, 'golden/pssStreamMap.json'), 'utf8')) as Pin;
const movie = (p: string): Movie => PIN.movies.find((m) => m.path === p)!;
const BOOT = ['RUN/MOVIES/COMMON/SONY448.PSS', 'RUN/MOVIES/INTRO_2.PSS', 'RUN/MOVIES/COMMON/MENULOOP.PSS'];
/** The header the game counts and drops: the track's first 0x28 bytes (`FUN_0030a590`, D:L208242-208248). */
const HEAD = 0x28;
/** A 40-byte SShd/SSbd head carrying `h`'s fields (the layout `parseSShd` reads). */
const sshdBytes = (h: SShdHeader): Uint8Array => {
  const b = new Uint8Array(HEAD), v = new DataView(b.buffer);
  b.set([0x53, 0x53, 0x68, 0x64], 0); v.setUint32(4, 24, true);
  [h.type, h.sampleRate, h.channels, h.interleave, h.word24, h.word28].forEach((x, i) => v.setUint32(8 + 4 * i, x, true));
  b.set([0x53, 0x53, 0x62, 0x64], 32); v.setUint32(36, h.bodySize, true);
  return b;
};

describe('the disc\'s PSS files from their golden pin (no game data)', () => {
  it('69 files: 3,254,108,436 bytes, 198,615 packs, 619,594 video, 174,743 audio and 191 padding packets (R109.2)', () => {
    expect(PIN.movies).toHaveLength(69);
    const total = (f: (m: Movie) => number): number => PIN.movies.reduce((s, m) => s + f(m), 0);
    expect([total((m) => m.size), total((m) => m.packs), total((m) => m.packets.e0 ?? 0), total((m) => m.packets.bd ?? 0), total((m) => m.packets.be ?? 0)])
      .toEqual([3_254_108_436, 198_615, 619_594, 174_743, 191]);
    // Video 0xE0, private stream 1 0xBD, padding 0xBE: no other stream.
    for (const m of PIN.movies) expect(Object.keys(m.packets).filter((k) => !['e0', 'bd', 'be'].includes(k)), m.path).toEqual([]);
  });

  it('every file is the same shape: 16,384-byte packs (the game\'s 0x4000 read) then the 4-byte end code; one system header; nothing skipped', () => {
    expect(PSS_READ_CHUNK).toBe(0x4000);
    for (const m of PIN.movies) {
      expect(m.size, m.path).toBe(m.packs * PSS_READ_CHUNK + 4);
      expect([m.systemHeaders, m.programEnds, m.skippedBytes], m.path).toEqual([1, 1, 0]);
    }
  });

  it('every track: FF A0 00 00 before each payload, then SShd type 1, 48000 Hz, 2 channels, 0x200 -- PCM, exactly SSbd\'s size (R109.3, R109.4)', () => {
    expect(PSS_SUBSTREAM_HEADER).toBe(4);
    for (const m of PIN.movies) {
      expect(m.subStreams, m.path).toEqual(['ff a0 00 00']);
      const { bodySize, ...rest } = m.header;
      expect(rest, m.path).toEqual({ type: 1, sampleRate: 48000, channels: 2, interleave: 0x200, word24: 0xffffffff, word28: 0xffffffff });
      expect([m.pcm, m.track], m.path).toEqual([bodySize, bodySize + HEAD]);
    }
  });

  it('the splitter takes the pinned header as the game counts it (FUN_0030a590: the first 0x28 bytes) and passes the PCM behind it', () => {
    expect(SSHD_HEADER_LENGTH).toBe(HEAD);
    for (const p of BOOT) {
      const m = movie(p);
      const s = new SShdSplitter();
      const head = sshdBytes(m.header);
      // Cut across two payloads, as the packets cut it.
      expect(s.push(head.subarray(0, 13)).length).toBe(0);
      const rest = new Uint8Array(HEAD - 13 + 8);
      rest.set(head.subarray(13));
      expect(s.push(rest).length).toBe(8);
      expect(s.header).toEqual(m.header);
      expect(s.samplesPerChannel()).toBe(m.pcm / 4);
    }
  });

  it('the boot\'s movies: SONY448 310 pictures, INTRO_2 3,836, MENULOOP 3,732 -- not PC research 09\'s 3,790 (R109.7)', () => {
    expect(BOOT.map((p) => [movie(p).pictures, movie(p).pcm])).toEqual([[310, 2_114_560], [3836, 23_917_568], [3732, 23_806_976]]);
  });

  it('title_disc_audio.bin\'s length is SONY448\'s whole track and the head of INTRO_2\'s: 2,114,600 + 2,417,318 bytes (R109.6)', () => {
    expect(movie(BOOT[0]!).track).toBe(2_114_600);
    expect(movie(BOOT[1]!).track).toBeGreaterThan(2_417_318);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The disc half: the pin re-derived.

const DISC = process.env.SOCOM_DISC;
const HAVE_DISC = !!DISC && existsSync(resolve(DISC, 'RUN/MOVIES'));

/** One file's row, as the pin was made: the whole file through the demuxer. */
async function row(path: string): Promise<Movie> {
  const d = new PssDemuxer();
  const sshd = new SShdSplitter();
  const h = createHash('sha256');
  let vlen = 0, pictures = 0, last = 0xffffffff, track = 0, pcm = 0;
  const subs = new Set<string>();
  for await (const p of demuxPssFile(new FsAssetSource(resolve(DISC!)), path, {}, d)) {
    if (p.streamId === 0xe0) {
      h.update(p.data); vlen += p.data.length;
      for (let i = 0; i < p.data.length; i++) { last = ((last << 8) | p.data[i]!) >>> 0; if (last === 0x100) pictures++; }
    } else if (p.streamId === 0xbd) {
      track += p.data.length; pcm += sshd.push(p.data).length;
      subs.add([...p.subStream!].map((x) => x.toString(16).padStart(2, '0')).join(' '));
    }
  }
  return {
    path, size: statSync(resolve(DISC!, path)).size, packs: d.stats.packs, systemHeaders: d.stats.systemHeaders, programEnds: d.stats.programEnds,
    packets: Object.fromEntries(Object.entries(d.stats.packets).map(([k, v]) => [Number(k).toString(16), v])), skippedBytes: d.stats.skippedBytes,
    pictures, video: { length: vlen, sha256: h.digest('hex') }, track, pcm, header: sshd.header!, subStreams: [...subs],
  };
}

describe.skipIf(!HAVE_DISC)('the PSS pin re-derived from the disc (SOCOM_DISC)', () => {
  it('the 69 files and their sizes are the pin\'s', async () => {
    const paths = (await new FsAssetSource(resolve(DISC!)).list()).filter((p) => /^RUN\/MOVIES\/.*\.PSS$/i.test(p)).sort();
    expect(paths).toEqual(PIN.movies.map((m) => m.path));
    for (const m of PIN.movies) expect(statSync(resolve(DISC!, m.path)).size, m.path).toBe(m.size);
  }, 60_000);

  it('the boot\'s three movies (all 69 with PSS_ALL=1) demux to their pinned rows, whole', async () => {
    const paths = process.env.PSS_ALL === '1' ? PIN.movies.map((m) => m.path) : BOOT;
    for (const p of paths) expect(await row(p), p).toEqual(movie(p));
  }, 1_800_000);
});
