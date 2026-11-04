import { describe, expect, it } from 'vitest';
import { BLIND_GLOW, blindGlow, blindWash, glowGain, glowHalfSize, washFogColour, washLitColour, WhiteOut } from '../src/flash';
import { trueColourScaleRow } from '../src/trueColourScale';

/**
 * The flashbang's blind as the original draws it (PF-07b; research 202 §3.9 item 13 and its V7 §8.2, research 206 §1.2;
 * research 181 §3.7 and V1 #10): the `blindplayer0<level>` zAnim's `TRUE_COLOR_SCALE` wash of every lit colour,
 * `c x grey + strength + 0.5`, under a `BLUR3D` glow -- 2 or 3 additive half-resolution passes at FIX up to 255, whose
 * `fadeout_normal` starts 0.2 s after the flash. No white overlay.
 */

describe('the glow: BLUR3D passes and FIX by level (FUN_00264a40; V7 §8.2, flash time)', () => {
  it('level 3: FIX rises 0 -> 255 over the first 0.2 s, holds to 8.2 s, 128 at 9.2 s, clear at 10.2 s; 3 passes', () => {
    expect(blindGlow(3, 0)).toEqual({ passes: 3, fix: 0 });
    expect(blindGlow(3, 0.1)).toEqual({ passes: 3, fix: 128 });
    expect(blindGlow(3, 0.2)).toEqual({ passes: 3, fix: 255 });               // 2.0 x 128 = 256, clamped
    expect(blindGlow(3, 5)).toEqual({ passes: 3, fix: 255 });
    expect(blindGlow(3, 8.2)).toEqual({ passes: 3, fix: 255 });
    expect(blindGlow(3, 9.2)).toEqual({ passes: 3, fix: 128 });
    expect(blindGlow(3, 10.2 + 1e-9)).toEqual({ passes: 0, fix: 0 });
  });

  it('level 2: 3 passes, full from 0.2 to 1.7 s, clear at 4.2 s; level 1: 2 passes, 64 at 1.2 s, clear at 2.2 s', () => {
    expect(blindGlow(2, 1.7)).toEqual({ passes: 3, fix: 255 });
    expect(blindGlow(2, 2.95)).toEqual({ passes: 3, fix: 128 });
    expect(blindGlow(2, 4.3)).toEqual({ passes: 0, fix: 0 });
    expect(blindGlow(1, 0.2)).toEqual({ passes: 2, fix: 255 });
    expect(blindGlow(1, 1.2)).toEqual({ passes: 2, fix: 64 });
    expect(blindGlow(1, 2.3)).toEqual({ passes: 0, fix: 0 });
    expect(BLIND_GLOW.fadeIn).toEqual({ seconds: 0.2, keys: [[0, 0], [0.2, 2]] });
    expect(BLIND_GLOW.fadeOut[3]).toEqual([[0, 2], [8, 2], [10, 0]]);
  });

  it('a pass adds the half-size copy x FIX / 128 to the frame (ALPHA 0x68: Cs x FIX + Cd), at half the frame', () => {
    expect(glowGain(255)).toBeCloseTo(255 / 128, 12);
    expect(glowGain(64)).toBe(0.5);
    expect(glowHalfSize(640, 448)).toEqual([320, 224]);                      // the original's 320 x 224 buffer
    expect(glowHalfSize(1281, 721)).toEqual([641, 361]);
  });
});

describe('the wash: TRUE_COLOR_SCALE row 2 (FUN_002642f0, the combine D:L308514-308527, FUN_003b59a0)', () => {
  it('level 3 holds (0.75, 0.75, 0.75, 60 + 0.5) to 8 s and is neutral at 10 s; level 1 (0.9, 25 + 0.5) eases out by 2 s', () => {
    expect(blindWash(3, 0)).toEqual([0.75, 0.75, 0.75, 60.5]);
    expect(blindWash(3, 8)).toEqual([0.75, 0.75, 0.75, 60.5]);
    const mid = blindWash(3, 9)!;
    expect(mid[0]).toBeCloseTo(0.875, 12);
    expect(mid[3]).toBeCloseTo(30.5, 12);
    expect(blindWash(3, 10)).toBeNull();
    expect(blindWash(2, 1.5)).toEqual([0.75, 0.75, 0.75, 60.5]);
    expect(blindWash(2, 4)).toBeNull();
    expect(blindWash(1, 0)).toEqual([0.9, 0.9, 0.9, 25.5]);
    expect(blindWash(1, 1)![3]).toBeCloseTo(13, 12);
    expect(blindWash(1, 2)).toBeNull();
  });

  it('lifts a lit colour (1 = the GS\'s 128) by c x grey + w / 128 and the fog colour (0..255) by c x grey + w, alpha kept', () => {
    const row: [number, number, number, number] = [0.75, 0.75, 0.75, 60.5];
    const lit = washLitColour([0.5, 1, 0, 0.25], row);
    expect(lit[0]).toBeCloseTo(0.375 + 60.5 / 128, 12);
    expect(lit[1]).toBeCloseTo(0.75 + 60.5 / 128, 12);
    expect(lit[2]).toBeCloseTo(60.5 / 128, 12);                              // black is lifted, not kept
    expect(lit[3]).toBe(0.25);
    expect(washFogColour([100, 100, 100], row)).toEqual([135.5, 135.5, 135.5]);
  });
});

describe('WhiteOut: the blind on the page, no overlay', () => {
  it('runs the wash and the glow from a flash to its end, the stronger level kept, and clears both', () => {
    const w = new WhiteOut();
    w.start(3);
    w.update(1);
    expect(w.state()).toMatchObject({ level: 3, passes: 3, fix: 255, wash: [0.75, 0.75, 0.75, 60.5], length: 10.2 });
    expect(w.glow()).toEqual({ passes: 3, fix: 255 });
    expect(trueColourScaleRow()).toEqual([0.75, 0.75, 0.75, 60.5]);
    w.start(1);                                                               // a weaker flash does not cut it short
    expect(w.state().level).toBe(3);
    for (let i = 0; i < 100; i++) w.update(0.1);
    expect(w.state()).toMatchObject({ level: null, passes: 0, fix: 0, wash: null });
    expect(w.glow()).toEqual({ passes: 0, fix: 0 });
    expect(trueColourScaleRow()).toBeNull();
    w.start(2);
    w.stop();
    expect(trueColourScaleRow()).toBeNull();
    expect(w.glow().passes).toBe(0);
  });
});
