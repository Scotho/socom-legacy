import { describe, expect, it } from 'vitest';
import { MOVIE_PCM_LAYOUT_READING, MoviePcmDecoder, decodeMoviePcm, moviePcmFloat } from '../src/moviePcm';

/**
 * A movie's PCM track (PLAT-20; web research 137 §2): `SShd` type 1, 16-bit little-endian, two channels laid out in
 * blocks of `interleave` (0x200) bytes, channel 0's block then channel 1's -- the disc's own layout, measured on the
 * three opener tracks (research 137 R137.2). Synthetic bytes only.
 */
const FORMAT = { sampleRate: 48000, channels: 2, interleave: 0x200 };

/** `frames` stereo frames as the disc lays them out: blocks of 256 left samples then 256 right ones. */
function blocks(left: number[], right: number[]): Uint8Array {
  const per = FORMAT.interleave / 2;
  const groups = Math.ceil(left.length / per);
  const b = new Uint8Array(groups * FORMAT.interleave * 2);
  const v = new DataView(b.buffer);
  for (let g = 0; g < groups; g++) {
    for (let k = 0; k < per; k++) {
      v.setInt16(g * 1024 + k * 2, left[g * per + k] ?? 0, true);
      v.setInt16(g * 1024 + 512 + k * 2, right[g * per + k] ?? 0, true);
    }
  }
  return b;
}

const ramp = (n: number, from: number, step: number): number[] => Array.from({ length: n }, (_, i) => from + i * step);

describe('the movie PCM layout (research 137 R137.2)', () => {
  it('is the disc\'s: blocks of 0x200 bytes a channel, left then right', () => {
    expect(MOVIE_PCM_LAYOUT_READING).toBe('blocks');
  });

  it('decodes two block groups to 512 frames, each channel in order', () => {
    const left = ramp(512, -300, 1), right = ramp(512, 1000, -3);
    const d = decodeMoviePcm(blocks(left, right), FORMAT);
    expect(d.frames).toBe(512);
    expect(Array.from(d.left)).toEqual(left);
    expect(Array.from(d.right)).toEqual(right);
    expect(d.droppedBytes).toBe(0);
  });

  it('drops a last group shorter than 0x400 bytes: the original moves the track 1 KB at a time (research 137 §3)', () => {
    const whole = blocks(ramp(256, 0, 1), ramp(256, 0, 2));
    const b = new Uint8Array(whole.length + 700);
    b.set(whole);
    const d = decodeMoviePcm(b, FORMAT);
    expect(d.frames).toBe(256);
    expect(d.droppedBytes).toBe(700);
  });

  it('refuses a layout it has not read: not two channels, or an interleave other than 0x200', () => {
    expect(() => decodeMoviePcm(new Uint8Array(1024), { ...FORMAT, channels: 1 })).toThrow(/channels/);
    expect(() => decodeMoviePcm(new Uint8Array(1024), { ...FORMAT, interleave: 0x100 })).toThrow(/interleave/);
  });
});

describe('MoviePcmDecoder: the track as it arrives, packet by packet', () => {
  it('gives the same frames for every cut of the bytes, odd lengths included (the disc\'s 4073- and 4059-byte payloads)', () => {
    const left = ramp(1024, -2000, 3), right = ramp(1024, 500, -1);
    const bytes = blocks(left, right);
    for (const size of [1, 7, 511, 1023, 1024, 1025, 4073]) {
      const dec = new MoviePcmDecoder(FORMAT);
      const l: number[] = [], r: number[] = [];
      let next = 0;
      for (let at = 0; at < bytes.length; at += size) {
        const piece = dec.push(bytes.subarray(at, at + size));
        if (!piece) continue;
        expect(piece.frame).toBe(next);
        next += piece.left.length;
        l.push(...piece.left);
        r.push(...piece.right);
      }
      expect(dec.pending).toBe(0);
      expect(l).toEqual(left);
      expect(r).toEqual(right);
    }
  });

  it('holds an unfinished group until the bytes that complete it come', () => {
    const dec = new MoviePcmDecoder(FORMAT);
    const bytes = blocks(ramp(256, 1, 1), ramp(256, 2, 1));
    expect(dec.push(bytes.subarray(0, 1000))).toBeNull();
    expect(dec.pending).toBe(1000);
    const p = dec.push(bytes.subarray(1000));
    expect(p?.left.length).toBe(256);
    expect(p?.left[255]).toBe(256);
    expect(p?.right[0]).toBe(2);
  });
});

describe('moviePcmFloat: the samples on the page\'s scale', () => {
  it('divides by 32768, as the sound package\'s other decoders do', () => {
    const f = moviePcmFloat(Int16Array.of(-32768, 0, 16384, 32767));
    expect(Array.from(f)).toEqual([-1, 0, 0.5, 32767 / 32768]);
  });
});
