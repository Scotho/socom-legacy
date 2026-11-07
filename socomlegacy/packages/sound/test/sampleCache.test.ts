import { describe, expect, it } from 'vitest';
import {
  decodeVag, GRAIN, renderSound, SampleBudget, SampleCache, SOUND_DECODE_CACHE_BYTES_ADAPTATION, soundSampleOffsets,
  type SoundBank, type VagSample,
} from '../src/index';

/**
 * LATER 730 (product track, a browser adaptation; the same sounds at the same times): a bank's samples are decoded once
 * each and kept (`SampleCache`), each decode sized to its own sample, under a byte cap with the least recently used let
 * go past it (`SampleBudget`, `SOUND_DECODE_CACHE_BYTES_ADAPTATION`); `soundSampleOffsets` names the samples a sound can
 * start, for the page's warm-up.
 */

/** `blocks` VAG blocks of one sample: shift 12, filter 0, nibble 1 throughout; the last carries the end flag. */
function vagSample(blocks: number): Uint8Array {
  const b = new Uint8Array(16 * blocks);
  for (let i = 0; i < blocks; i++) {
    b[16 * i] = 0x0c;
    for (let j = 2; j < 16; j++) b[16 * i + j] = 0x11;
  }
  b[16 * (blocks - 1) + 1] = 0x01;
  return b;
}

/** Two samples back to back: 4 blocks at 0, 2 blocks at 64. */
const VAG = (() => { const v = new Uint8Array(96); v.set(vagSample(4), 0); v.set(vagSample(2), 64); return v; })();

/** A 24-byte tone (`bankTone`'s layout) naming `sampleOffset`. */
function tone(sampleOffset: number): Uint8Array {
  const t = new Uint8Array(24), dv = new DataView(t.buffer);
  t[1] = 127; t[2] = 60;                                    // vol 127, centre note 60
  dv.setUint16(10, 0x00ff, true); dv.setUint16(12, 0x1fc0, true);
  dv.setUint32(16, sampleOffset, true);
  return t;
}

/**
 * Sound 0: a tone on sample 0, then a child (sound 2). Sound 1: a tone on sample 64 behind a RAND_PLAY. Sound 2: a tone
 * on sample 64. The grain pool: tone A at 0, tone B at 24, the child spec at 48 (soundId at +12).
 */
function bank(): SoundBank {
  const pool = new Uint8Array(64);
  pool.set(tone(0), 0); pool.set(tone(64), 24);
  new DataView(pool.buffer).setInt32(48 + 12, 2, true);
  const s = (grains: { type: number; arg: number }[]) => ({ vol: 127, volGroup: 0, pan: 0, instanceLimit: 0, flags: 0, grains: grains.map((g) => ({ ...g, delay: 0 })) });
  return {
    name: 'TEST', blockId: 'TEST', flags: 0, grainData: pool, vag: VAG, names: new Map([['.A', 0], ['.B', 1]]),
    sounds: [
      s([{ type: GRAIN.TONE, arg: 0 }, { type: GRAIN.STARTCHILDSOUND, arg: 48 }]),
      s([{ type: GRAIN.RAND_PLAY, arg: 0x010101 }, { type: GRAIN.TONE2, arg: 24 }]),
      s([{ type: GRAIN.TONE, arg: 24 }]),
    ],
  };
}

describe('SampleCache: each sample decoded once, whatever the plays (LATER 730)', () => {
  it('N renders of a sound decode each of its samples once (the decoder spied)', () => {
    const calls: number[] = [];
    const spy = (data: Uint8Array, offset?: number): VagSample => { calls.push(offset ?? 0); return decodeVag(data, offset); };
    const b = bank(), cache = new SampleCache(b.vag, null, spy);
    for (let i = 0; i < 8; i++) renderSound(b, 0, cache, { random: () => 0.25, pan: 30 * i });
    expect(calls.sort((x, y) => x - y)).toEqual([0, 64]);
    expect(cache.decodes).toBe(2);
  });

  it('a decoded sample holds its own samples only, not the rest of the bank (the decode sized to its end block)', () => {
    const s = decodeVag(VAG, 0);
    expect(s.pcm.length).toBe(4 * 28);
    expect(s.pcm.buffer.byteLength).toBe(s.pcm.byteLength);
    // A run with no end block still decodes to the data's end, as before.
    const open = decodeVag(VAG.subarray(0, 48));
    expect(open.pcm.length).toBe(3 * 28);
    expect(open.pcm.buffer.byteLength).toBe(open.pcm.byteLength);
  });

  it('the samples a sound can start: its tones, every RAND_PLAY branch and its children', () => {
    const b = bank();
    expect([...soundSampleOffsets(b, 0)].sort((x, y) => x - y)).toEqual([0, 64]);
    expect([...soundSampleOffsets(b, 1)]).toEqual([64]);
    expect([...soundSampleOffsets(b, 99)]).toEqual([]);
  });
});

describe('SampleBudget: a byte cap, the least recently used let go past it (SOUND_DECODE_CACHE_BYTES_ADAPTATION)', () => {
  it('the cap is above the largest decoded bank set measured (MP2, 26.5 MB): a map evicts nothing', () => {
    expect(SOUND_DECODE_CACHE_BYTES_ADAPTATION).toBeGreaterThanOrEqual(27_000_000);
  });

  it('past the cap the least recently used sample goes, and comes back decoded again at its next use', () => {
    const big = 4 * 28 * 2, small = 2 * 28 * 2;              // the two samples' PCM bytes
    const budget = new SampleBudget(big + small - 1);         // room for one of the two at a time
    const cache = new SampleCache(VAG, budget);
    cache.get(0);
    expect(budget.bytes).toBe(big);
    cache.get(64);                                            // over the cap: sample 0, the older, goes
    expect(budget.bytes).toBe(small);
    expect(budget.evictions).toBe(1);
    expect(cache.has(0)).toBe(false);
    expect(cache.has(64)).toBe(true);
    cache.get(0);
    expect(cache.decodes).toBe(3);
    expect(cache.has(64)).toBe(false);
  });

  it('a use makes a sample the most recent', () => {
    const budget = new SampleBudget(2 * (2 * 28 * 2) + 4 * 28 * 2 - 1);
    const a = new SampleCache(VAG, budget), b = new SampleCache(VAG, budget);   // two banks, one budget
    a.get(64); b.get(64);
    a.get(64);                                                // a's is now the newer
    b.get(0);                                                 // over: b's 64, the least recently used, goes
    expect(a.has(64)).toBe(true);
    expect(b.has(64)).toBe(false);
    expect(b.has(0)).toBe(true);
  });

  it('a pinned sample (the warm set) is never let go; the cap then holds what it can', () => {
    const budget = new SampleBudget(10);
    const cache = new SampleCache(VAG, budget);
    expect(cache.pin(0)).not.toBeNull();
    cache.get(64);
    expect(cache.has(0)).toBe(true);
    expect(cache.has(64)).toBe(false);
    expect(budget.pinned).toBe(1);
  });

  it('without a budget nothing is let go (the worker\'s loops, the tests)', () => {
    const cache = new SampleCache(VAG);
    cache.get(0); cache.get(64);
    expect(cache.has(0) && cache.has(64)).toBe(true);
    expect(cache.size).toBe(2);
  });
});
