import { describe, expect, it } from 'vitest';
import { decodeVag } from '../src/vag';
import { decodeVpk, parseVpkHeader, STREAM_RATE_GUARD, VPK_MAX_CHANNEL_BYTES_GUARD } from '../src/vpk';

/**
 * The VPK music stream (research 124 §1; ported from Chris's browser-beta-v5 `packages/sound/test/vpk.test.ts`, adapted):
 * `VPKFileHead` (989snd `iop/types.h` 498-506) -- the magic, the bytes of one channel, the data's offset, the streaming
 * buffer the file was cut for, the rate, the channels, then a vol/group/pan per channel -- and the data, one buffer at a
 * time, its first half the left channel's and its second the right's (KNOWN, the stereo-desync row: `FUN_00013334`'s
 * per-channel stride is word 3 >> 1). All bytes here are synthetic.
 */

/** A frame of SPU ADPCM: `head` (shift | filter << 4), `flags`, and every nibble `nibble`. */
function frame(head: number, flags: number, nibble: number): number[] {
  return [head, flags, ...Array.from({ length: 14 }, () => (nibble & 0xf) | ((nibble & 0xf) << 4))];
}

/** A VPK: the header's six words and two vol/pan pairs, the data at `dataOffset`. */
function vpk(o: { channelBytes: number; dataOffset?: number; buffer: number; rate?: number; channels?: number; data: number[]; size?: number }): Uint8Array {
  const dataOffset = o.dataOffset ?? 0x800;
  const b = new Uint8Array(o.size ?? dataOffset + o.data.length);
  const v = new DataView(b.buffer);
  b.set([0x20, 0x4b, 0x50, 0x56]);                 // the little-endian word "VPK ": the bytes " KPV"
  v.setUint32(4, o.channelBytes, true);
  v.setUint32(8, dataOffset, true);
  v.setUint32(12, o.buffer, true);
  v.setUint32(16, o.rate ?? 32000, true);
  v.setUint32(20, o.channels ?? 2, true);
  // VPKFileVolPanPair: vol 127, group 0, pan 270 (left) / 90 (right), as every VPK on the dev disc carries.
  v.setInt8(0x18, 127); v.setInt8(0x19, 0); v.setInt16(0x1a, 270, true);
  v.setInt8(0x1c, 127); v.setInt8(0x1d, 0); v.setInt16(0x1e, 90, true);
  b.set(o.data, dataOffset);
  return b;
}

describe('decodeVpk: the VPK music stream (research 124 §1)', () => {
  // Two channels of two frames each, the buffer two frames (16 bytes of each channel a buffer): L0 R0 L1 R1. Filter 1
  // (60/64 of the last sample) carries a predictor across the frames, so a channel decoded with the other's state would
  // differ from the channel decoded alone.
  const L = [frame(0x1c, 0, 1), frame(0x1c, 0, 3)];
  const R = [frame(0x1c, 0, 2), frame(0x1c, 0, 7)];
  const bytes = vpk({ channelBytes: 32, buffer: 32, data: [...L[0]!, ...R[0]!, ...L[1]!, ...R[1]!] });

  it('reads the header as VPKFileHead lays it out', () => {
    expect(parseVpkHeader(bytes)).toEqual({
      channelBytes: 32, dataOffset: 0x800, bufferBytes: 32, sampleRate: 32000, channels: 2,
      volPan: [{ vol: 127, group: 0, pan: 270 }, { vol: 127, group: 0, pan: 90 }],
    });
  });

  it('de-interleaves each buffer into its channels, each decoded with its own predictor', () => {
    const r = decodeVpk(bytes);
    const alone = (frames: number[][]): number[] => Array.from(decodeVag(new Uint8Array(frames.flat())).pcm, (x) => x / 32768);
    expect(r.sampleRate).toBe(32000);
    expect(r.voices).toBe(2);
    expect(r.left.length).toBe(56);
    expect(Array.from(r.left)).toEqual(alone(L));
    expect(Array.from(r.right)).toEqual(alone(R));
    expect(r.left[0]).toBeCloseTo(1 / 32768);
    expect(r.right[0]).toBeCloseTo(2 / 32768);
    expect(r.sendLeft).toBeNull();
    expect(r.peak).toBeGreaterThan(0);
    expect(r.left.buffer).not.toBe(r.right.buffer);   // two buffers: a transfer list holds each once
  });

  it('starts the data at word 2, the data offset -- not at word 3, the buffer size', () => {
    // A file cut for the game's 0xb000 buffer: its first buffer's left half is 0x5800 bytes from 0x800. A frame of
    // nibble 5 at 0x800 is the left channel's first; read from 0xb000 the left would start on something else.
    const data = new Array<number>(0xb000).fill(0);
    data.splice(0, 16, ...frame(0x0c, 0, 5));
    data.splice(0x5800, 16, ...frame(0x0c, 0, 6));
    const r = decodeVpk(vpk({ channelBytes: 0x5800, buffer: 0xb000, data }));
    expect(r.left[0]).toBeCloseTo(5 / 32768);
    expect(r.right[0]).toBeCloseTo(6 / 32768);
    expect(r.left.length).toBe((0x5800 / 16) * 28);
  });

  it('takes the last, partial buffer: a channel shorter than a whole number of buffers', () => {
    // 48 bytes a channel in 32-byte halves: the second buffer carries 16 of each (L2 at its start, R2 at its half).
    const data = [...L[0]!, ...L[1]!, ...R[0]!, ...R[1]!, ...frame(0x0c, 0, 4), ...new Array<number>(16).fill(0), ...frame(0x0c, 0, 5)];
    const r = decodeVpk(vpk({ channelBytes: 48, buffer: 64, data }));
    expect(r.left.length).toBe(84);
    expect(r.left[56]).toBeCloseTo(4 / 32768);
    expect(r.right[56]).toBeCloseTo(5 / 32768);
  });

  it('refuses what is not a VPK it can play (the bounds are our guards, not the game\'s)', () => {
    expect(() => decodeVpk(bytes.slice(0, 0x10))).toThrow(/header/);
    expect(() => decodeVpk(bytes.slice(0, 0x1c))).toThrow(/header/);   // the second channel's vol/pan pair cut
    const bad = bytes.slice(); bad[0] = 0;
    expect(() => decodeVpk(bad)).toThrow(/magic/);
    expect(() => decodeVpk(bytes.slice(0, 0x800 + 48))).toThrow(/truncated/);
    expect(() => decodeVpk(vpk({ channelBytes: 32, buffer: 32, channels: 3, data: [] }))).toThrow(/channels/);
    expect(() => decodeVpk(vpk({ channelBytes: 32, buffer: 32, channels: 0, data: [] }))).toThrow(/channels/);
    expect(() => decodeVpk(vpk({ channelBytes: 24, buffer: 32, data: new Array<number>(64).fill(0) }))).toThrow(/bytes/);
    expect(() => decodeVpk(vpk({ channelBytes: 32, buffer: 24, data: new Array<number>(64).fill(0) }))).toThrow(/buffer/);
    expect(() => decodeVpk(vpk({ channelBytes: VPK_MAX_CHANNEL_BYTES_GUARD + 16, buffer: 32, data: [] }))).toThrow(/bytes/);
    expect(() => decodeVpk(vpk({ channelBytes: 32, buffer: 32, rate: STREAM_RATE_GUARD[1] + 1, data: new Array<number>(64).fill(0) }))).toThrow(/rate/);
    expect(() => decodeVpk(vpk({ channelBytes: 32, buffer: 32, dataOffset: 0x1c, data: new Array<number>(64).fill(0) }))).toThrow(/offset/);
  });
});
