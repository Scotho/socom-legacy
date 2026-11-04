import { describe, expect, it } from 'vitest';
import { GAME_FRAME_DT, GAME_FRAME_MAX_STEPS, GameFrameAccumulator } from '../src/gameFrame';
import * as scene from '../src/index';

/**
 * PF-01 (PF.R8; research 208): the game frame and the fixed-step helper that applies a per-frame constant once per
 * game frame. The drift tests feed whole H-blank counts (n / 15734 s), so the expected frame count is an integer sum
 * over 525 with no rounding at all.
 */

/** A deterministic LCG: the same uneven sequence on every run. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

describe('GAME_FRAME_DT', () => {
  it('is two NTSC fields of H-blanks over the game\'s integer H-blank rate: 525 / 15734 s (research 180 §0, V1 #1)', () => {
    expect(GAME_FRAME_DT).toBe(525 / 15734);
    expect(GAME_FRAME_DT).toBeCloseTo(0.03336723, 8);           // DAT_004a449c in the PCSX2 dumps
    expect(1 / GAME_FRAME_DT).toBeCloseTo(29.9695, 4);           // 29.97 Hz nominal (V4 #17)
  });

  it('is the package\'s export, the one the page, the room and uiClock read', () => {
    expect(scene.GAME_FRAME_DT).toBe(GAME_FRAME_DT);
    expect(scene.GameFrameAccumulator).toBe(GameFrameAccumulator);
  });

  it('caps a backlog at the existing loops\' 30 steps (mover.ts MAX_TICKS, accuracy.ts update)', () => {
    expect(GAME_FRAME_MAX_STEPS).toBe(30);
  });
});

describe('GameFrameAccumulator', () => {
  it('runs no frame before a whole game frame has passed, then one, keeping the remainder', () => {
    const a = new GameFrameAccumulator();
    expect(a.advance(GAME_FRAME_DT / 2)).toBe(0);
    expect(a.remainder).toBeCloseTo(GAME_FRAME_DT / 2, 12);
    expect(a.advance(GAME_FRAME_DT / 2)).toBe(1);
    expect(a.remainder).toBeCloseTo(0, 12);
    expect(a.advance(GAME_FRAME_DT * 2.5)).toBe(2);
    expect(a.remainder).toBeCloseTo(GAME_FRAME_DT / 2, 12);
    expect(a.alpha()).toBeCloseTo(0.5, 9);
  });

  it('counts exact frames over an uneven dt sequence', () => {
    const a = new GameFrameAccumulator();
    // H-blank counts: 100, 425 -> 525 (1); 1000 -> 1525 (2, 475 left); 50 -> 525 (1); 524 (0); 1 -> 525 (1)
    const counts = [100, 425, 1000, 50, 524, 1];
    const frames = counts.map((n) => a.advance(n / 15734));
    expect(frames).toEqual([0, 1, 1, 1, 0, 1]);
    expect(a.remainder).toBeCloseTo(0, 12);
  });

  it('does not drift over 10,000 uneven steps (whole H-blank counts, checked against integer arithmetic)', () => {
    const a = new GameFrameAccumulator();
    const rnd = lcg(208);
    let hblanks = 0;
    let expected = 0;
    let total = 0;
    for (let i = 0; i < 10_000; i++) {
      const n = 1 + Math.floor(rnd() * 900);                 // 1..900 H-blanks: 0.06 ms to 57 ms
      hblanks += n;
      const due = Math.floor(hblanks / 525) - expected;
      expected += due;
      const ran = a.advance(n / 15734);
      expect(ran, `step ${i}`).toBe(due);
      total += ran;
    }
    expect(total).toBe(Math.floor(hblanks / 525));
    expect(a.remainder * 15734).toBeCloseTo(hblanks % 525, 6);
  });

  it('turns a 60 Hz transport into 29.97 game frames a second, with no drift (1000 s of 1/60 s steps)', () => {
    const a = new GameFrameAccumulator();
    let total = 0;
    for (let i = 0; i < 60_000; i++) total += a.advance(1 / 60);
    expect(total).toBe(Math.floor(1000 / GAME_FRAME_DT));     // 29969 (1000 x 15734 / 525 = 29969.5)
  });

  it('runs exactly one frame per GAME_FRAME_DT step, 10,000 times', () => {
    const a = new GameFrameAccumulator();
    let total = 0;
    for (let i = 0; i < 10_000; i++) total += a.advance(GAME_FRAME_DT);
    expect(total).toBe(10_000);
    expect(a.remainder).toBeLessThan(1e-9);
  });

  it('caps one advance at GAME_FRAME_MAX_STEPS and drops the backlog, not runs it later', () => {
    const a = new GameFrameAccumulator();
    expect(a.advance(5)).toBe(GAME_FRAME_MAX_STEPS);
    expect(a.remainder).toBe(0);
    expect(a.advance(GAME_FRAME_DT)).toBe(1);
    const b = new GameFrameAccumulator(4);
    expect(b.advance(GAME_FRAME_DT * 10)).toBe(4);
    expect(b.remainder).toBe(0);
  });

  it('keeps the remainder when the cap is met exactly', () => {
    const a = new GameFrameAccumulator(2);
    expect(a.advance(GAME_FRAME_DT * 2.5)).toBe(2);
    expect(a.remainder).toBeCloseTo(GAME_FRAME_DT / 2, 12);
  });

  it('ignores a negative or non-finite dt, and reset() drops the carry', () => {
    const a = new GameFrameAccumulator();
    expect(a.advance(-1)).toBe(0);
    expect(a.advance(Number.NaN)).toBe(0);
    expect(a.advance(Number.POSITIVE_INFINITY)).toBe(0);
    expect(a.remainder).toBe(0);
    a.advance(GAME_FRAME_DT / 2);
    a.reset();
    expect(a.remainder).toBe(0);
    expect(a.advance(GAME_FRAME_DT / 2)).toBe(0);
  });
});
