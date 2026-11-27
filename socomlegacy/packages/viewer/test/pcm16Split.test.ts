import { describe, expect, it } from 'vitest';
import { isPcm16Stream, type Pcm16Stream } from '@s2u/sound';
import { STREAM_PCM16_MAX_SAMPLES, STREAM_PCM16_MAX_SECONDS_ADAPTATION, storedStreamOf } from '../src/soundData';

/**
 * LATER 1229 (the controller's split C of PR #790's PCM16 storage; product track, a browser storage adaptation): Web Audio
 * plays floats, so a PCM16 stream is expanded at its start (`WebAudioOut.stream`) -- ~0.7-1.35 ms per million samples on
 * the hub, so the round music (up to 38 s at 32 kHz, 1.22M samples a channel) cost ~1.7-3.3 ms at a start there and
 * several times that on an Xbox (a reading), over the 2 ms bar. So only a stream under
 * `STREAM_PCM16_MAX_SECONDS_ADAPTATION` (10 s: the voices and callouts, <= ~0.6 ms) is kept as PCM16; a longer one is
 * expanded once at load (off the frame) and kept as floats, as before #790. The samples are the same either way (x/32768).
 */
const pcm = (n: number, rate: number, stereo = false): Pcm16Stream => {
  const left = new Int16Array(n).map((_, i) => ((i * 7919) % 65536) - 32768);
  const right = stereo ? new Int16Array(n).map((_, i) => ((i * 104729) % 65536) - 32768) : left;
  return { storage: 'pcm16', left, right, sendLeft: null, sendRight: null, sampleRate: rate, voices: stereo ? 2 : 1, samples: [], peak: 1 };
};

describe('LATER 1229: PCM16 only for streams under 10 s; longer ones expanded once at load', () => {
  it('is a named adaptation at 10 s', () => {
    expect(STREAM_PCM16_MAX_SECONDS_ADAPTATION).toBe(10);
  });

  it('a 4 s callout stays PCM16 (the same arrays)', () => {
    const s = pcm(4 * 22050, 22050);
    const out = storedStreamOf(s);
    expect(isPcm16Stream(out)).toBe(true);
    expect(out.left).toBe(s.left);
  });

  it('a 38 s music stream (and one at exactly 10 s) comes back as floats, sample for sample x/32768, stereo kept apart', () => {
    for (const n of [38 * 32000, 10 * 32000]) {
      const s = pcm(n, 32000, true);
      const out = storedStreamOf(s);
      expect(isPcm16Stream(out)).toBe(false);
      expect(out.left).toBeInstanceOf(Float32Array);
      for (const side of ['left', 'right'] as const) {
        const a = out[side] as Float32Array, b = s[side];
        expect(a.length).toBe(b.length);
        for (let i = 0; i < b.length; i += 997) expect(Object.is(a[i], b[i]! / 32768)).toBe(true);
      }
      expect(out.right).not.toBe(out.left);
    }
  });

  it('a mono long stream keeps one array for both sides (as the float decoder did)', () => {
    const out = storedStreamOf(pcm(12 * 22050, 22050));
    expect(out.right).toBe(out.left);
  });

  it('review F2: the cap is in samples (10 s at 22,050 Hz): a 6 s stream at 48 kHz is expanded at load, not at its start', () => {
    expect(STREAM_PCM16_MAX_SAMPLES).toBe(220500);
    expect(isPcm16Stream(storedStreamOf(pcm(6 * 48000, 48000)))).toBe(false);
    expect(isPcm16Stream(storedStreamOf(pcm(9 * 22050, 22050)))).toBe(true);
  });

  it('review F1: a kept stream holds only its samples (a decoder view of a padded buffer is trimmed), mono still shared', () => {
    const big = new Int16Array(1000).map((_, i) => i);
    const view = big.subarray(0, 700);
    const s: Pcm16Stream = { storage: 'pcm16', left: view, right: view, sendLeft: null, sendRight: null, sampleRate: 22050, voices: 1, samples: [], peak: 1 };
    const out = storedStreamOf(s) as Pcm16Stream;
    expect(out.left.buffer.byteLength).toBe(700 * 2);
    expect(out.right).toBe(out.left);
    expect(Array.from(out.left.subarray(0, 5))).toEqual([0, 1, 2, 3, 4]);
  });
});
