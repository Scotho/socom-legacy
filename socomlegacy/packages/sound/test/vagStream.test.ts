import { describe, expect, it } from 'vitest';
import { decodeVagStream, VAGP_HEADER_BYTES, VAGP_MAX_DATA_BYTES_GUARD } from '../src/vagStream';
import { STREAM_RATE_GUARD } from '../src/vpk';

/**
 * The VAGp voice stream (research 124 §2; ported from Chris's browser-beta-v5 `packages/sound/test/vagStream.test.ts`,
 * adapted): Sony's 48-byte big-endian header -- the magic, the version, the data's bytes at +12, the rate at +16, the
 * name at +32 -- then mono SPU ADPCM up to the frame that carries the end flag. Synthetic bytes only.
 */
function vagp(o: { size: number; rate?: number; frames: number[][]; extra?: number }): Uint8Array {
  const data = o.frames.flat();
  const b = new Uint8Array(VAGP_HEADER_BYTES + data.length + (o.extra ?? 0));
  const v = new DataView(b.buffer);
  b.set([0x56, 0x41, 0x47, 0x70]);                    // "VAGp"
  v.setUint32(4, 32, false);                          // the version every voice line of the dev disc but 50 carries
  v.setUint32(12, o.size, false);
  v.setUint32(16, o.rate ?? 22050, false);
  b.set([0x50, 0x48, 0x5f, 0x30], 32);                // a name
  b.set(data, VAGP_HEADER_BYTES);
  return b;
}
const frame = (flags: number, nibble: number): number[] => [0x0c, flags, ...new Array<number>(14).fill((nibble & 0xf) | ((nibble & 0xf) << 4))];

describe('decodeVagStream: the VAGp voice stream (research 124 §2)', () => {
  it('reads the big-endian rate and size and decodes the mono line into both channels, one array (PR #631)', () => {
    const s = decodeVagStream(vagp({ size: 32, frames: [frame(0, 1), frame(1, 2)] }));
    expect(s.sampleRate).toBe(22050);
    expect(s.voices).toBe(1);
    expect(s.left.length).toBe(56);
    expect(s.left[0]).toBeCloseTo(1 / 32768);
    expect(s.left[28]).toBeCloseTo(2 / 32768);
    expect(Array.from(s.right)).toEqual(Array.from(s.left));
    // PR #631 (a browser adaptation): the right channel IS the left array, no copy -- nothing writes a decoded line in place,
    // and the transfer list names the shared buffer once (`soundTransferables`' Set).
    expect(s.right).toBe(s.left);
    expect(s.peak).toBeCloseTo(2 / 32768);
  });

  it('ends on the frame that carries the end flag, as the disc lines do (PH_0014: 17,264 of 17,296 bytes)', () => {
    const s = decodeVagStream(vagp({ size: 48, frames: [frame(0, 1), frame(1, 2), frame(0, 7)] }));
    expect(s.left.length).toBe(56);
  });

  it('refuses a header it cannot play (the bounds are our guards, not the game\'s)', () => {
    const ok = vagp({ size: 32, frames: [frame(0, 1), frame(1, 2)] });
    expect(() => decodeVagStream(ok.subarray(0, 40))).toThrow(/header/);
    expect(() => decodeVagStream(ok.subarray(0, 63))).toThrow(/truncated/);
    const bad = ok.slice(); bad[0] = 0;
    expect(() => decodeVagStream(bad)).toThrow(/magic/);
    expect(() => decodeVagStream(vagp({ size: 0, frames: [] }))).toThrow(/size/);
    expect(() => decodeVagStream(vagp({ size: 24, frames: [frame(1, 1)], extra: 8 }))).toThrow(/size/);
    expect(() => decodeVagStream(vagp({ size: VAGP_MAX_DATA_BYTES_GUARD + 16, frames: [] }))).toThrow(/size/);
    expect(() => decodeVagStream(vagp({ size: 16, rate: STREAM_RATE_GUARD[0] - 1, frames: [frame(1, 1)] }))).toThrow(/rate/);
    expect(() => decodeVagStream(vagp({ size: 16, rate: STREAM_RATE_GUARD[1] + 1, frames: [frame(1, 1)] }))).toThrow(/rate/);
  });
});
