import { describe, expect, it } from 'vitest';
import { stepThrowPower, THROW_PARAMS } from '@s2u/scene';
import { FAST_FRAME_MS, measureHold, mustSeparate, mustToss, shorterHold, THROW_POWER_STEP_MAX_S, type HoldFrame } from '../e2e/grenadeHold';
import { THROW_POWER_STEP_MAX_S as GAME_STEP_MAX_S } from '../src/grenade';

/**
 * The grenade-flow spec's hold measure (`../e2e/grenadeHold`; a test instrument, product track): a simulated page whose
 * game frame steps the held power in real seconds the way `GrenadeHand.update` does (substeps of at most
 * `THROW_POWER_STEP_MAX_S`, `stepThrowPower` at pressure 1), and a probe that samples after the game in the same frame:
 * `t` the probe's `performance.now()`, the game's clock read plus that frame's work (under the next frame's read).
 */
function simulate(realMs: number[], pressFrame: number, releaseFrame: number, opts: { work?: number[] } = {}) {
  const frames: HoldFrame[] = [];
  let now = 1000, power = 0, phase = 'ready', thrown = false;
  for (let i = 0; i < realMs.length; i++) {
    const work = Math.min(opts.work?.[i % opts.work.length] ?? 5, (realMs[i + 1] ?? Infinity) - 1);
    now += realMs[i]!;                         // the game's clock read this frame
    const real = i === 0 ? 0 : realMs[i]! / 1000;
    if (i === pressFrame) phase = 'holding';
    if (i === releaseFrame && phase === 'holding') { phase = 'throwing'; thrown = true; }
    else if (phase === 'holding') {
      const n = Math.max(1, Math.ceil(real / GAME_STEP_MAX_S - 1e-9));
      for (let k = 0; k < n; k++) power = stepThrowPower(power, 1, real / n).power;
    }
    frames.push({ t: now + work, phase, power, thrown });
  }
  return { frames, power };
}

describe('the grenade-flow spec measures each hold as the game counted it', () => {
  it('carries the game step bound it cites', () => {
    expect(THROW_POWER_STEP_MAX_S).toBe(GAME_STEP_MAX_S);
  });

  it('brackets a steady 60 fps hold and finds its power inside the bracket', () => {
    const { frames, power } = simulate(Array(60).fill(1000 / 60), 5, 25);
    const h = measureHold(frames, power);
    expect(h.counted).toBe(20);
    expect(h.heldLowS).toBeLessThanOrEqual(20 / 60);
    expect(h.heldHighS).toBeGreaterThanOrEqual(20 / 60);
    expect(h.matches).toBe(true);
  });

  it('brackets a slow, uneven host (SwiftShader-like: 40-300 ms frames, long in-frame work)', () => {
    const realMs = [16, 40, 120, 300, 85, 210, 60, 140, 95, 250, 70, 40];
    const { frames, power } = simulate(realMs, 2, 9, { work: [15, 150, 60, 5] });
    const h = measureHold(frames, power);
    const truth = realMs.slice(2, 9).reduce((a, b) => a + b, 0) / 1000;
    expect(h.heldLowS).toBeLessThanOrEqual(truth);
    expect(h.heldHighS).toBeGreaterThanOrEqual(truth);
    expect(h.matches).toBe(true);
    expect(power).toBeGreaterThan(0.85);       // the short hold's overshoot the RC1 red saw (0.9029)
  });

  it('refuses a thrown power the counted time cannot give', () => {
    const { frames, power } = simulate(Array(60).fill(1000 / 60), 5, 25);
    expect(measureHold(frames, power * 0.8).matches).toBe(false);
    expect(measureHold(frames, Math.min(1, power * 1.25)).matches).toBe(false);
  });

  it('refuses a trace with no counted hold', () => {
    const { frames } = simulate(Array(10).fill(16), 20, 30);
    expect(measureHold(frames, 0.5).matches).toBe(false);
  });

  it('returns (never hangs) when the first raising frame is the trace\'s second sample: no upper bound', () => {
    const { frames, power } = simulate(Array(30).fill(1000 / 60), 1, 20);
    const h = measureHold(frames, power);
    expect(h.heldHighS).toBe(Infinity);
    expect(h.powerHigh).toBe(1);
    expect(h.matches).toBe(true);
  });

  it('caps the upper bound\'s step at the longest frame the trace allows (a fast host\'s short hold is bracketed tight)', () => {
    const { frames, power } = simulate(Array(40).fill(1000 / 60), 5, 12);
    const h = measureHold(frames, power);
    expect(h.stepCapS).toBeLessThan(0.05);
    expect(h.matches).toBe(true);
    expect(measureHold(frames, power * 1.15).matches).toBe(false);
  });

  it('reads the trace\'s median frame interval', () => {
    expect(measureHold(simulate(Array(30).fill(20), 5, 20).frames, 0).frameMs).toBeCloseTo(20, 6);
    expect(measureHold(simulate([16, 300, 300, 16, 300], 1, 4).frames, 0).frameMs).toBeCloseTo(300, 6);
  });

  it('demands a measured separation only of a short hold with no stall in its counted frames', () => {
    const fast = measureHold(...pair(simulate(Array(40).fill(1000 / 60), 5, 12)));
    expect(fast.longestFrameMs).toBeLessThan(FAST_FRAME_MS);
    expect(mustSeparate(fast)).toBe(true);
    // One 450 ms stall inside the short hold (a first-use compile, a late touch): the median stays fast, the rule waives.
    const realMs = Array(40).fill(1000 / 60); realMs[8] = 450;
    const stalled = measureHold(...pair(simulate(realMs, 5, 12)));
    expect(stalled.frameMs).toBeLessThan(FAST_FRAME_MS);
    expect(stalled.longestFrameMs).toBeGreaterThanOrEqual(450);
    expect(mustSeparate(stalled)).toBe(false);
    // A stall outside the counted run is not the hold's.
    const after = Array(40).fill(1000 / 60); after[20] = 450;
    expect(mustSeparate(measureHold(...pair(simulate(after, 5, 12))))).toBe(true);
    expect(mustSeparate(measureHold(simulate(Array(10).fill(16), 20, 30).frames, 0))).toBe(false);
  });

  it('compares two holds only when one was measurably the shorter', () => {
    const short = measureHold(...pair(simulate(Array(60).fill(1000 / 60), 5, 15)));
    const full = measureHold(...pair(simulate(Array(80).fill(1000 / 60), 5, 50)));
    expect(shorterHold(short, full)).toBe(true);
    const slowShort = measureHold(...pair(simulate([16, 16, 16, 300, 300, 300, 16], 2, 6)));
    const slowFull = measureHold(...pair(simulate([16, 16, 16, 300, 300, 300, 16], 2, 6)));
    expect(shorterHold(slowShort, slowFull)).toBe(false);
  });

  it('demands a toss only where the counted time cannot reach the toss threshold', () => {
    const short = measureHold(...pair(simulate(Array(60).fill(1000 / 60), 5, 15)));
    expect(short.powerHigh).toBeLessThan(THROW_PARAMS.tossPowerThreshold);
    expect(mustToss(short)).toBe(true);
    const slow = measureHold(...pair(simulate([16, 16, 16, 300, 300, 300, 16], 2, 6)));
    expect(mustToss(slow)).toBe(false);
  });
});

function pair(s: { frames: HoldFrame[]; power: number }): [HoldFrame[], number] { return [s.frames, s.power]; }
