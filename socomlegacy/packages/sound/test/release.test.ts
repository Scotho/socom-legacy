import { describe, expect, it } from 'vitest';
import {
  GRAIN, OUTPUT_RATE, RELEASE_CURVE_HZ, RELEASE_LIMIT_SECONDS_PLACEHOLDER, soundRelease, toneRelease, type SoundBank,
} from '../src/index';

/**
 * A stopped sound's tail (research 186 §3.2 BED_FADE, research 205 §2.1): StopSound keys the voices off, so what is
 * heard is each tone's ADSR release (the SPU envelope `render.ts` models), from the level it holds, not a fade.
 */

/**
 * A bank of one sound whose TONE grains each play a tone of `adsr`. The tones below hold near full: adsr1 0x00ff decays
 * one exponential step (to 32760) into a sustain of 0x8000, and adsr2 0x1fxx's sustain rises one step in 21 s.
 */
function bank(adsr: readonly [number, number][]): SoundBank {
  const grainData = new Uint8Array(24 * adsr.length), v = new DataView(grainData.buffer);
  adsr.forEach(([a1, a2], i) => { v.setUint16(24 * i + 10, a1, true); v.setUint16(24 * i + 12, a2, true); });
  return {
    name: 'T', blockId: 'TEST', flags: 0, grainData, names: new Map(), vag: new Uint8Array(0),
    sounds: [{ vol: 127, volGroup: 0, pan: 0, instanceLimit: 0, flags: 0, grains: adsr.map((_, i) => ({ type: GRAIN.TONE, arg: 24 * i, delay: 0 })) }],
  };
}

describe('the release a stopped sound is heard by (research 205 §2.1: no fade, the key-off)', () => {
  it('a linear release of shift 10 takes 32760 / 16 samples from the held level: 2048 at 48 kHz, 42.7 ms', () => {
    const r = toneRelease(0x00ff, 0x1f0a);
    expect(r.seconds).toBeCloseTo(2048 / OUTPUT_RATE, 6);
    expect(r.curve[0]).toBe(1);
    expect(r.curve.at(-1)).toBe(0);
    expect(r.curve.length).toBe(Math.ceil(r.seconds * RELEASE_CURVE_HZ) + 1);
    for (let i = 1; i < r.curve.length; i++) expect(r.curve[i]!).toBeLessThanOrEqual(r.curve[i - 1]!);
  });

  it('a slower shift is slower: shift 14 steps 8 every 8 samples, 32760 samples from the held level', () => {
    expect(toneRelease(0x00ff, 0x1f0e).seconds).toBeCloseTo(32760 / OUTPUT_RATE, 3);
  });

  it('starts from the sustain level the decay settles on, so a lower sustain ends sooner', () => {
    const full = toneRelease(0x00ff, 0x1f0a), half = toneRelease(0x00f7, 0x1f0a);   // sustain (7+1) x 0x800 = 0x4000
    expect(half.seconds).toBeCloseTo(0x4000 / 16 / OUTPUT_RATE, 3);
    expect(half.seconds).toBeLessThan(full.seconds);
  });

  it('is cut at RELEASE_LIMIT_SECONDS_PLACEHOLDER when the envelope would run on (an exponential step that rounds to 0)', () => {
    const r = toneRelease(0x00ff, 0x1f00 | 0x0020 | 0x0010);
    expect(r.seconds).toBe(RELEASE_LIMIT_SECONDS_PLACEHOLDER);
    expect(r.curve.at(-1)).toBe(0);
  });

  it('a sound of several tones: the mean of their curves (RELEASE_MIX_READING), as long as the slowest', () => {
    const one = toneRelease(0x00ff, 0x1f0a), two = toneRelease(0x00ff, 0x1f0c);
    const both = soundRelease(bank([[0x00ff, 0x1f0a], [0x00ff, 0x1f0c]]), 0);
    expect(both.seconds).toBeCloseTo(Math.max(one.seconds, two.seconds), 6);
    expect(both.curve[1]).toBeCloseTo((one.curve[1]! + two.curve[1]!) / 2, 6);
    expect(soundRelease(bank([[0x00ff, 0x1f0a]]), 0)).toEqual(one);
  });

  it('a sound with no tone stops at once', () => {
    const empty = bank([]);
    expect(soundRelease(empty, 0)).toEqual({ seconds: 0, curve: Float32Array.of(0) });
  });
});
