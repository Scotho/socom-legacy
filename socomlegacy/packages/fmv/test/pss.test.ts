import { describe, expect, it } from 'vitest';
import type { RangedAssetSource } from '@s2u/archive';
import {
  PSS_READ_CHUNK, PSS_SUBSTREAM_HEADER, PssDemuxer, SSHD_HEADER_LENGTH, SShdSplitter, demuxPss, demuxPssFile, pssTimestamp,
  type PssPacket,
} from '../src/pss';

/**
 * PLAT-18's CI half: the demuxer over a synthetic MPEG program stream built here, byte by byte (no disc bytes). The
 * dev-disc half -- the video byte-equal to ffmpeg's stream copy, the picture counts, the audio's header and length --
 * is `pssDisc.test.ts`. The layout is research 109 §1.
 */

const cat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
const bytes = (n: number, seed: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed * 7 + 1) & 0xff);

/** An MPEG-2 pack header (14 bytes) and `stuffing` 0xFF bytes. SCR and mux rate are arbitrary but well-formed. */
const pack2 = (stuffing = 0): Uint8Array => cat(
  Uint8Array.of(0, 0, 1, 0xba, 0x44, 0x00, 0x04, 0x00, 0x04, 0x01, 0x01, 0x68, 0x03, 0xf8 | stuffing),
  new Uint8Array(stuffing).fill(0xff),
);
/** An MPEG-1 pack header (12 bytes). */
const pack1 = (): Uint8Array => Uint8Array.of(0, 0, 1, 0xba, 0x21, 0x00, 0x01, 0x00, 0x01, 0x80, 0x00, 0x01);
/** A system header with one stream entry. */
const systemHeader = (): Uint8Array => Uint8Array.of(0, 0, 1, 0xbb, 0, 9, 0x80, 0xb4, 0x01, 0x00, 0x21, 0x7f, 0xe0, 0xe7, 0x06);
/** A 5-byte PTS/DTS field with the 4-bit prefix `prefix`. */
const stamp = (prefix: number, t: number): number[] => {
  const hi = Math.floor(t / 2 ** 30) & 7;
  const mid = Math.floor(t / 2 ** 15) & 0x7fff;
  const lo = t & 0x7fff;
  return [(prefix << 4) | (hi << 1) | 1, mid >> 7, ((mid & 0x7f) << 1) | 1, lo >> 7, ((lo & 0x7f) << 1) | 1];
};
/** An MPEG-2 PES packet: header with optional PTS/DTS and `stuffing` 0xFF bytes in its header data. */
const pes2 = (id: number, payload: Uint8Array, o: { pts?: number; dts?: number; stuffing?: number } = {}): Uint8Array => {
  const fields: number[] = [];
  let flags = 0;
  if (o.pts !== undefined && o.dts !== undefined) { flags = 0xc0; fields.push(...stamp(3, o.pts), ...stamp(1, o.dts)); }
  else if (o.pts !== undefined) { flags = 0x80; fields.push(...stamp(2, o.pts)); }
  for (let i = 0; i < (o.stuffing ?? 0); i++) fields.push(0xff);
  const len = 3 + fields.length + payload.length;
  return cat(Uint8Array.of(0, 0, 1, id, len >> 8, len & 0xff, 0x81, flags, fields.length, ...fields), payload);
};
/** An MPEG-1 PES packet: stuffing, an STD buffer field, then a PTS (or 0x0F for none). */
const pes1 = (id: number, payload: Uint8Array, pts?: number): Uint8Array => {
  const head = [0xff, 0xff, 0x40 | 0x20, 0x00, ...(pts === undefined ? [0x0f] : stamp(2, pts))];
  const len = head.length + payload.length;
  return cat(Uint8Array.of(0, 0, 1, id, len >> 8, len & 0xff, ...head), payload);
};
/** A stream without a PES header extension (padding 0xBE, private stream 2 0xBF). */
const raw = (id: number, payload: Uint8Array): Uint8Array =>
  cat(Uint8Array.of(0, 0, 1, id, payload.length >> 8, payload.length & 0xff), payload);
const END = Uint8Array.of(0, 0, 1, 0xb9);

/** The PSS audio: private stream 1, a 4-byte substream header (`FF A0 00 00` on the disc, research 109 R109.3), then the track's bytes. */
const audio = (track: Uint8Array, pts?: number): Uint8Array => pes2(0xbd, cat(Uint8Array.of(0xff, 0xa0, 0, 0), track), { pts, stuffing: 5 });

/** The SShd/SSbd header of research 109 §2: 40 bytes, little-endian words. */
const sshd = (bodySize: number): Uint8Array => {
  const h = new Uint8Array(SSHD_HEADER_LENGTH);
  const v = new DataView(h.buffer);
  h.set([0x53, 0x53, 0x68, 0x64], 0); v.setUint32(4, 24, true);
  v.setUint32(8, 1, true); v.setUint32(12, 48000, true); v.setUint32(16, 2, true); v.setUint32(20, 0x200, true);
  v.setInt32(24, -1, true); v.setInt32(28, -1, true);
  h.set([0x53, 0x53, 0x62, 0x64], 32); v.setUint32(36, bodySize, true);
  return h;
};

const VIDEO = [bytes(100, 1), bytes(4000, 2), bytes(7, 3), bytes(1, 4), bytes(300, 5)];
const PCM = bytes(4073 + 4059 + 100 - SSHD_HEADER_LENGTH, 9);
const TRACK = cat(sshd(PCM.length), PCM);
/** The track cut where the disc cuts it (4073, 4059, the rest): odd payloads, so samples straddle packets. */
const TRACK_PARTS = [TRACK.subarray(0, 4073), TRACK.subarray(4073, 4073 + 4059), TRACK.subarray(4073 + 4059)];

/** A program stream with every kind of unit the demuxer must step over or take. */
const STREAM = cat(
  pack2(), systemHeader(),
  pes2(0xe0, VIDEO[0]!, { pts: 3810, dts: 900 }),
  audio(TRACK_PARTS[0]!, 3600),
  pack2(3), raw(0xbe, new Uint8Array(37).fill(0xff)),
  pes2(0xe0, VIDEO[1]!),
  raw(0xbf, bytes(20, 6)),
  pack1(), pes1(0xe0, VIDEO[2]!, 2 ** 32 + 5), pes1(0xe0, VIDEO[3]!),
  pack2(), audio(TRACK_PARTS[1]!), pes2(0xc0, bytes(12, 7), { pts: 1 }),
  pes2(0xe0, VIDEO[4]!, { pts: 2 ** 33 - 1, stuffing: 2 }),
  audio(TRACK_PARTS[2]!),
  END,
);

/** Everything `demuxPss` yields for `chunks`, the payloads and substream headers copied out (they are views). */
const collect = async (chunks: Uint8Array[]): Promise<PssPacket[]> => {
  const out: PssPacket[] = [];
  for await (const p of demuxPss((async function* () { yield* chunks; })())) out.push({ ...p, data: p.data.slice(), ...(p.subStream ? { subStream: p.subStream.slice() } : {}) });
  return out;
};
const video = (ps: PssPacket[]): Uint8Array => cat(...ps.filter((p) => p.streamId === 0xe0).map((p) => p.data));
const track = (ps: PssPacket[]): Uint8Array => cat(...ps.filter((p) => p.streamId === 0xbd).map((p) => p.data));

describe('the PSS demuxer on a synthetic program stream', () => {
  it('yields the video payloads and the audio track, stepping over packs, the system header, padding and private 2', async () => {
    const ps = await collect([STREAM]);
    expect(ps.map((p) => p.streamId)).toEqual([0xe0, 0xbd, 0xe0, 0xe0, 0xe0, 0xbd, 0xc0, 0xe0, 0xbd]);
    expect(video(ps)).toEqual(cat(...VIDEO));
    expect(track(ps)).toEqual(TRACK);
  });

  it('steps over every unit without skipping a byte (the MPEG-2 pack stuffing is part of the pack)', () => {
    const d = new PssDemuxer();
    [...d.push(STREAM)];
    d.end();
    expect(d.stats).toMatchObject({ packs: 4, systemHeaders: 1, programEnds: 1, skippedBytes: 0 });
  });

  it('reads PTS and DTS (MPEG-2 and MPEG-1 headers, all 33 bits), and none where a packet has none', async () => {
    const ps = await collect([STREAM]);
    const v = ps.filter((p) => p.streamId === 0xe0);
    expect(v.map((p) => p.pts)).toEqual([3810, undefined, 2 ** 32 + 5, undefined, 2 ** 33 - 1]);
    expect(v.map((p) => p.dts)).toEqual([900, undefined, undefined, undefined, undefined]);
    expect(ps.find((p) => p.streamId === 0xbd)!.pts).toBe(3600);
    expect(pssTimestamp(Uint8Array.of(...stamp(2, 123456789)), 0)).toBe(123456789);
  });

  it('strips the 4-byte substream header from private stream 1 and keeps its bytes', async () => {
    const a = (await collect([STREAM])).filter((p) => p.streamId === 0xbd);
    expect(PSS_SUBSTREAM_HEADER).toBe(4);
    expect(a.map((p) => p.data.length)).toEqual([4073, 4059, TRACK.length - 4073 - 4059]);
    expect(a.map((p) => [...p.subStream!])).toEqual(a.map(() => [0xff, 0xa0, 0, 0]));
  });

  it('gives the same packets for the stream cut in two at every offset', async () => {
    const whole = await collect([STREAM]);
    for (let k = 1; k < STREAM.length; k++) {
      const ps = await collect([STREAM.subarray(0, k), STREAM.subarray(k)]);
      if (ps.length !== whole.length || !ps.every((p, i) => p.offset === whole[i]!.offset && sameBytes(p.data, whole[i]!.data))) {
        throw new Error(`cut at ${k}: the packets differ`);
      }
    }
  }, 60_000);

  it('gives the same packets for every chunk size from 1 byte up', async () => {
    const whole = await collect([STREAM]);
    for (const size of [1, 2, 3, 5, 13, 2048, 4096, 16384]) {
      const chunks: Uint8Array[] = [];
      for (let at = 0; at < STREAM.length; at += size) chunks.push(STREAM.subarray(at, at + size));
      expect(await collect(chunks)).toEqual(whole);
    }
  });

  it('records each packet at its offset in the stream', async () => {
    const ps = await collect([STREAM]);
    for (const p of ps) expect([...STREAM.subarray(p.offset, p.offset + 4)]).toEqual([0, 0, 1, p.streamId]);
  });

  it('holds no more than one packet and one chunk, however long the stream', () => {
    const d = new PssDemuxer();
    const unit = cat(pack2(), pes2(0xe0, bytes(4000, 1)), audio(bytes(4073, 2)));
    let n = 0;
    for (let i = 0; i < 2000; i++) for (const _ of d.push(unit)) n++, void _;
    expect(n).toBe(4000);
    expect(d.highWater).toBeLessThanOrEqual(unit.length * 2);
    d.end();
    expect(d.stats).toMatchObject({ packs: 2000, skippedBytes: 0 });
  });

  it('refuses a stream that ends inside a packet, naming the offset', async () => {
    const cut = STREAM.length - 10;
    await expect(collect([STREAM.subarray(0, cut)])).rejects.toThrow(/inside the unit at \d+/);
  });

  it('resynchronises on bytes between units and counts them', () => {
    const d = new PssDemuxer();
    const got = [...d.push(cat(pack2(), Uint8Array.of(1, 2, 3, 0, 0), pes2(0xe0, bytes(9, 1)), END))];
    d.end();
    expect(got.map((p) => p.data.length)).toEqual([9]);
    expect(d.stats.skippedBytes).toBe(5);
  });

  it('resynchronises past a non-system start code between units (00 00 01 00, a picture start): it is not read as a unit', () => {
    // Were 00 00 01 00 taken as a unit, its bytes 4-5 (00 04) would read as a length and swallow the video packet's start.
    const d = new PssDemuxer();
    const got = [...d.push(cat(pack2(), Uint8Array.of(0, 0, 1, 0, 0, 4), pes2(0xe0, bytes(9, 1)), END))];
    d.end();
    expect(got.map((p) => p.data.length)).toEqual([9]);
    expect(d.stats.skippedBytes).toBe(6);
  });

  it('keeps the last three bytes of a chunk when resynchronising: a start code split across chunks is found', () => {
    const d = new PssDemuxer();
    const got = [...d.push(cat(pack2(), Uint8Array.of(9, 9, 9, 0, 0))), ...d.push(Uint8Array.of(1, 0xb9)), ...d.push(pes2(0xe0, bytes(9, 1)))];
    d.end();
    expect(got.map((p) => p.data.length)).toEqual([9]);
    expect(d.stats).toMatchObject({ programEnds: 1, skippedBytes: 3 });
  });

  it('refuses a PTS or DTS the PES header data length does not cover, naming the offset', () => {
    // The PTS flag set, header data length 0: the five bytes after it are payload, not a timestamp.
    const ptsOnly = Uint8Array.of(0, 0, 1, 0xe0, 0, 5, 0x81, 0x80, 0, 0xaa, 0xbb);
    expect(() => [...new PssDemuxer().push(cat(ptsOnly, END))]).toThrow(/PES header at 0 .*PTS/);
    // PTS and DTS flagged, header data length 5: room for the PTS only.
    const both = cat(Uint8Array.of(0, 0, 1, 0xe0, 0, 8 + 4, 0x81, 0xc0, 5, ...stamp(3, 1)), bytes(4, 1));
    expect(() => [...new PssDemuxer().push(cat(pack2(), both, END))]).toThrow(/PES header at 14 .*DTS/);
  });

  it('a PES packet length of 0 (allowed only for video in a transport stream, 13818-1 clause 2.4.3, PES_packet_length): an empty packet, its bytes then stepped over as stray', () => {
    // 00 00 01 E0 00 00 is a whole unit of 6 bytes; the payload that follows opens no system start code (video
    // start codes are all below B9), so it is resynchronised over and counted, and the next unit is read.
    const d = new PssDemuxer();
    const stray = Uint8Array.of(0x81, 0x80, 5, ...stamp(2, 7), 0, 0, 1, 0xb3, 1, 2, 3);
    const got = [...d.push(cat(pack2(), Uint8Array.of(0, 0, 1, 0xe0, 0, 0), stray, pes2(0xe0, bytes(9, 1)), END))];
    d.end();
    expect(got.map((p) => p.data.length)).toEqual([0, 9]);
    expect(got[0]!.pts).toBeUndefined();
    expect(d.stats).toMatchObject({ packets: { 0xe0: 2 }, skippedBytes: stray.length, programEnds: 1 });
  });

  it('1 to 3 stray bytes after the program end are named as such, not as a unit cut short', () => {
    for (const tail of [[7], [0, 0], [0, 0, 1]]) {
      const d = new PssDemuxer();
      [...d.push(cat(pack2(), pes2(0xe0, bytes(9, 1)), END, Uint8Array.from(tail)))];
      expect(() => d.end()).toThrow(new RegExp(`ends with ${tail.length} bytes? at \\d+ that open no unit`));
    }
  });

  it('counts the program end code and the packets by stream', () => {
    const d = new PssDemuxer();
    [...d.push(cat(pack2(), pes2(0xe0, bytes(9, 1)), END))];
    d.end();
    expect(d.stats).toMatchObject({ programEnds: 1, packets: { 0xe0: 1 } });
  });
});

describe('demuxPssFile over a ranged source', () => {
  it('reads the file in PSS_READ_CHUNK ranges, never whole, and yields what demuxPss does', async () => {
    const big = cat(...Array.from({ length: 12 }, () => STREAM));
    const reads: number[] = [];
    const source: RangedAssetSource = {
      list: async () => ['M.PSS'],
      read: async () => { throw new Error('read whole'); },
      size: async () => big.length,
      readRange: async (_p, offset, length) => { reads.push(length); return big.slice(offset, offset + length); },
    };
    const got: PssPacket[] = [];
    for await (const p of demuxPssFile(source, 'M.PSS')) got.push({ ...p, data: p.data.slice(), ...(p.subStream ? { subStream: p.subStream.slice() } : {}) });
    expect(PSS_READ_CHUNK).toBe(0x4000);
    expect(Math.max(...reads)).toBe(PSS_READ_CHUNK);
    expect(reads.reduce((a, b) => a + b, 0)).toBe(big.length);
    expect(got).toEqual(await collect([big]));
  });
});

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

describe('the SShd header and the PCM behind it', () => {
  it('takes the first 40 bytes of the track as the header, however the packets cut it, and passes the rest', () => {
    for (const cuts of [[4073, 4059], [1, 39, 4000], [20, 30], [40], [39, 2]]) {
      const s = new SShdSplitter();
      const pcm: Uint8Array[] = [];
      let at = 0;
      for (const c of [...cuts, TRACK.length]) {
        const end = Math.min(c + at, TRACK.length);
        pcm.push(s.push(TRACK.subarray(at, end)));
        at = end;
        if (at >= TRACK.length) break;
      }
      expect(cat(...pcm)).toEqual(PCM);
      expect(s.header).toEqual({ type: 1, sampleRate: 48000, channels: 2, interleave: 0x200, word24: 0xffffffff, word28: 0xffffffff, bodySize: PCM.length });
    }
  });

  it('counts the samples per channel from the SSbd size', () => {
    const s = new SShdSplitter();
    s.push(TRACK);
    expect(s.samplesPerChannel()).toBe(PCM.length / 4);
  });

  it('refuses a track that does not open on SShd/SSbd', () => {
    const bad = TRACK.slice();
    bad[0] = 0x58;
    expect(() => new SShdSplitter().push(bad)).toThrow(/SShd/);
  });
});
