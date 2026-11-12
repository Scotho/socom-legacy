import { describe, expect, it } from 'vitest';
import { GUEST_STEP_MIN_STEPS, GUEST_STEP_S, analyzeRaise, envelopeWeight, type RaiseRow } from '../eph/analyzeRaise';

/**
 * The enemy-raise analysis (agent-mail/evidence/enemy-raise/SCOPE.md s2.1, CAPTURE-JOB.md runs O1/O2): over the probe's
 * rows (probe.ts --raise), a frame where body+0xf74 & 0xef goes 2 -> 1 with ctrl+0x118 == 0 and ctrl+0xc0 >= 1 is
 * consistent with the idle-tail call (r0001 0x59643c / r0004 0x59bee4; only a breakpoint at 0x5e7600 identifies it);
 * the time from a record's mark (+0x2c bit 0x200) to that raise; the lower (1 -> 2) after the count returns to 0 (5.0 s
 * expected, ctrl+0x22c, FUN_00598280 D:L454808); and the envelope's own rise to full and fall to 0 (FUN_00286c90
 * D:L130817). Only eligible rows (gate read and set, not torn, not stale) time anything; every edge carries the previous
 * eligible row's time and whether it was the frame just before. Pure: driven by fake rows. Product track: an instrument.
 */
/**
 * The guest clock's step between consecutive game frames, s: the 2026-11-01 probe CSVs' positive `t` steps
 * (agent-mail/evidence/eph-hunt-2026-11-01/probes/, e.g. r0004-ladder/probe.csv: 0.03336 s; the game steps at 30 Hz,
 * two NTSC vsyncs).
 */
const F = 0.03336;
const T0 = '0x1c30000';
/**
 * The envelope [up, hold, down, remaining] with FUN_005dffc0's values (D:L494282-494285: 0.1, 100000, 0.5); remaining
 * counts DOWN (FUN_00286d40 D:L130840-130847). At rest every word but the shape is 0: the weight 0.
 */
const UP = 0.1, HOLD = 100000, DOWN = 0.5;
const ENVELOPE = { raiseEnv0: UP, raiseEnv1: HOLD, raiseEnv2: DOWN };
const TOTAL = UP + HOLD + DOWN;

/** One case's frames at the guest clock's step from t = 1: every row eligible unless the spec says otherwise. */
function frames(spec: { n: number; at: (i: number) => Partial<RaiseRow> | null }, trial = 1, kase = 'raise-idle'): RaiseRow[] {
  const out: RaiseRow[] = [];
  for (let i = 0; i < spec.n; i++) {
    const x = spec.at(i);
    if (x === null) continue;   // a row the sampler never produced
    out.push({
      trial, case: kase, t: 1 + i * F, raiseState: 2, raiseEdge: 0, raiseCount: 0, raiseTorn: 0, raiseGate: 1, raiseStale: 0,
      raiseRecs: 1, raiseReach: 1000, raiseMag: 1.5, ...ENVELOPE, raiseEnv3: 0, rec0Target: T0, rec0Marked: 0, rec0Dist2: 2500, ...x,
    });
  }
  return out;
}

/**
 * Frame 60 marks T0, 61 counts it, 64 raises (remaining = the total at the raise, FUN_00286d90 D:L130879-130883, then
 * down a step a frame: full at 67, 3 steps ~ 0.1 s); frame 180 the count back to 0, 330 (150 steps ~ 5.0 s on) lowers
 * (remaining = min(1, 0.99) x 0.5 = 0.495, D:L494250-494255, down a step a frame: 0 at 345, 15 steps ~ 0.5 s).
 */
const LOWER = 330;
const O1O2 = (i: number): Partial<RaiseRow> => ({
  rec0Marked: i >= 60 && i < 179 ? 1 : 0,
  raiseCount: i >= 61 && i < 180 ? 1 : 0,
  raiseState: i >= 64 && i < LOWER ? 1 : 2,
  raiseEnv3: i < 64 ? 0 : i < LOWER ? TOTAL - (i - 64) * F : Math.max(0, 0.99 * DOWN - (i - LOWER) * F),
});

describe('envelopeWeight (FUN_00286c90 D:L130817: [up, hold, down, remaining])', () => {
  it('(total - remaining)/up rising, 1 held, remaining/down falling, 0 at or under 0; remaining clamped to the total; null unread', () => {
    expect(envelopeWeight(UP, HOLD, DOWN, TOTAL)).toBe(0);
    expect(envelopeWeight(UP, HOLD, DOWN, TOTAL - 0.05)).toBeCloseTo(0.5, 6);
    expect(envelopeWeight(UP, HOLD, DOWN, TOTAL - 0.1)).toBeCloseTo(1, 6);
    expect(envelopeWeight(UP, HOLD, DOWN, 5)).toBe(1);
    expect(envelopeWeight(UP, HOLD, DOWN, 0.495)).toBeCloseTo(0.99, 9);
    expect(envelopeWeight(UP, HOLD, DOWN, 0.25)).toBeCloseTo(0.5, 9);
    expect(envelopeWeight(UP, HOLD, DOWN, 0)).toBe(0);
    expect(envelopeWeight(UP, HOLD, DOWN, TOTAL * 10)).toBe(0);
    expect(envelopeWeight(UP, HOLD, null, 1)).toBeNull();
  });

  it('walks a raise: remaining from the total counting down, the weight 0 -> 1 over 0.1 s (the up ramp), then held', () => {
    const dt = 0.001;
    const w = (k: number): number => envelopeWeight(UP, HOLD, DOWN, TOTAL - k * dt)!;
    expect(w(0)).toBe(0);
    expect(w(25)).toBeCloseTo(0.25, 6);
    expect(w(50)).toBeCloseTo(0.5, 6);
    for (let k = 1; k <= 100; k++) expect(w(k)).toBeGreaterThan(w(k - 1) - 1e-9);
    let first = -1;
    for (let k = 0; k <= 200 && first < 0; k++) if (w(k) >= 1 - 1e-6) first = k;
    expect(first * dt).toBeCloseTo(UP, 2);
    expect(w(120)).toBe(1);
    expect(w(10_000)).toBe(1);
  });

  it('walks a lower: remaining from 0.495 counting down, the weight 0.99 -> 0 over ~0.5 s (the down ramp)', () => {
    const dt = 0.001;
    const w = (k: number): number => envelopeWeight(UP, HOLD, DOWN, Math.max(0, 0.99 * DOWN - k * dt))!;
    expect(w(0)).toBeCloseTo(0.99, 9);
    expect(w(245)).toBeCloseTo(0.5, 6);
    for (let k = 1; k <= 500; k++) expect(w(k)).toBeLessThan(w(k - 1) + 1e-9);
    let zero = -1;
    for (let k = 0; k <= 1000 && zero < 0; k++) if (w(k) === 0) zero = k;
    expect(zero * dt).toBeCloseTo(0.495, 2);
  });
});

describe('analyzeRaise', () => {
  it('finds the raise consistent with the idle-tail call, contiguous, with the count rise and the envelope full 3 steps (~0.1 s) on', () => {
    const r = analyzeRaise(frames({ n: 600, at: O1O2 }));
    expect(r.raises).toHaveLength(1);
    const x = r.raises[0]!;
    expect(x).toMatchObject({ trial: 1, case: 'raise-idle', count: 1, gapFrames: 0, contiguous: true, countRoseContiguous: true, truncated: false, fullContiguous: true });
    expect(x.t).toBeCloseTo(1 + 64 * F, 9);
    expect(x.prevT).toBeCloseTo(1 + 63 * F, 9);
    expect(x.countRoseT).toBeCloseTo(1 + 61 * F, 9);
    expect(x.fullT).toBeCloseTo(1 + 67 * F, 9);
    expect(x.fullDt).toBeCloseTo(3 * F, 9);
    expect(x.fullDt).toBeCloseTo(UP, 2);
  });

  it("times a record's mark to the raise, naming its target, its squared distance and the reach x magnification at the mark", () => {
    const r = analyzeRaise(frames({ n: 600, at: O1O2 }));
    expect(r.marks).toHaveLength(1);
    const m = r.marks[0]!;
    expect(m).toMatchObject({ target: T0, markContiguous: true, exact: true, truncated: false, dist2: 2500, reach: 1500 });
    expect(m.markT).toBeCloseTo(1 + 60 * F, 9);
    expect(m.markPrevT).toBeCloseTo(1 + 59 * F, 9);
    expect(m.raiseT).toBeCloseTo(1 + 64 * F, 9);
    expect(m.dt).toBeCloseTo(4 * F, 9);
  });

  it('times the lower after the count returns to 0 (~5.0 s here) and the fall to 0 (~0.5 s); one pending at the case end has nulls', () => {
    const r = analyzeRaise(frames({ n: 600, at: O1O2 }));
    expect(r.lowers).toHaveLength(1);
    const l = r.lowers[0]!;
    expect(l).toMatchObject({ countZeroContiguous: true, lowerContiguous: true, exact: true, fallContiguous: true });
    expect(l.countZeroT).toBeCloseTo(1 + 180 * F, 9);
    expect(l.countZeroPrevT).toBeCloseTo(1 + 179 * F, 9);
    expect(l.lowerT).toBeCloseTo(1 + LOWER * F, 9);
    expect(l.dt).toBeCloseTo((LOWER - 180) * F, 9);
    expect(l.dt).toBeCloseTo(5, 1);
    expect(l.fallEndT).toBeCloseTo(1 + (LOWER + 15) * F, 9);
    expect(l.fallDt).toBeCloseTo(15 * F, 9);
    expect(l.fallDt).toBeCloseTo(0.5, 2);
    const cut = analyzeRaise(frames({ n: 300, at: O1O2 }));
    expect(cut.lowers).toHaveLength(1);
    expect(cut.lowers[0]).toMatchObject({ lowerT: null, lowerPrevT: null, lowerContiguous: null, dt: null, exact: false, fallEndT: null, fallDt: null });
  });

  it('a count back above 0 before the lower drops the pending lower', () => {
    const r = analyzeRaise(frames({ n: 600, at: (i) => ({ ...O1O2(i), raiseCount: (i >= 61 && i < 180) || (i >= 200 && i < 600) ? 1 : 0, raiseState: i >= 64 ? 1 : 2 }) }));
    expect(r.lowers).toEqual([]);
  });

  it('F2: a gap before an edge is said -- prevT, gapFrames, contiguous false, exact false -- never an exact time', () => {
    const r = analyzeRaise(frames({ n: 600, at: (i) => (i === 62 || i === 63 ? null : O1O2(i)) }));
    const x = r.raises[0]!;
    expect(x.prevT).toBeCloseTo(1 + 61 * F, 9);
    expect(x.gapFrames).toBe(2);
    expect(x.contiguous).toBe(false);
    expect(r.marks[0]!.exact).toBe(false);
  });

  it('re-check F1: rows at the guest clock\'s 0.03336 s step are every game frame (gapFrames 0); one step skipped is gapFrames 1', () => {
    const r = analyzeRaise(frames({ n: 600, at: O1O2 }));
    expect(r.raises[0]).toMatchObject({ gapFrames: 0, contiguous: true });
    expect(r.marks[0]!.exact).toBe(true);
    expect(r.lowers[0]!.exact).toBe(true);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]).toMatchObject({ trial: 1, case: 'raise-idle', fromClock: true, steps: 599 });
    expect(r.groups[0]!.guestStepS).toBeCloseTo(0.0334, 9);
    const skip = analyzeRaise(frames({ n: 600, at: (i) => (i === 63 ? null : O1O2(i)) }));
    expect(skip.raises[0]).toMatchObject({ gapFrames: 1, contiguous: false });
    expect(skip.marks[0]!.exact).toBe(false);
    expect(skip.groups[0]!.guestStepS).toBeCloseTo(0.0334, 9);
  });

  it('re-check F1: the step is the mode rounded to 0.1 ms, so the clock\'s jitter (0.03336 / 0.03342 s) collapses to one step', () => {
    const rows = frames({ n: 600, at: O1O2 }).map((row, i) => ({ ...row, t: 1 + i * F + (i % 3 === 0 ? 0.00006 : 0) }));
    const r = analyzeRaise(rows);
    expect(r.groups[0]!.guestStepS).toBeCloseTo(0.0334, 9);
    expect(r.raises[0]).toMatchObject({ gapFrames: 0, contiguous: true });
    expect(r.marks[0]!.exact).toBe(true);
  });

  it('re-check F1: a group with too few clock steps falls back to GUEST_STEP_S (2 / 59.94 s, the observed 30 Hz step)', () => {
    expect(GUEST_STEP_S).toBeCloseTo(2 / 59.94, 12);
    expect(GUEST_STEP_MIN_STEPS).toBeGreaterThan(1);
    // Two rows two game steps apart: the clock's own mode would call that one step; the fallback says one was skipped.
    const rows: RaiseRow[] = [
      { trial: 1, case: 'short', t: 1, raiseState: 2, raiseEdge: 0, raiseCount: 1, raiseTorn: 0, raiseGate: 1, raiseStale: 0 },
      { trial: 1, case: 'short', t: 1 + 2 * F, raiseState: 1, raiseEdge: 0, raiseCount: 1, raiseTorn: 0, raiseGate: 1, raiseStale: 0 },
    ];
    const r = analyzeRaise(rows);
    expect(r.groups[0]).toMatchObject({ trial: 1, case: 'short', fromClock: false, steps: 1, guestStepS: GUEST_STEP_S });
    expect(r.raises[0]).toMatchObject({ gapFrames: 1, contiguous: false });
  });

  it('F1: a gated (gate 0 or unread), stale or torn row times nothing and is not the previous row', () => {
    // The count rises under the gate (frames 55-62 gated): the rise is first seen at 63, after a gap.
    const gated = analyzeRaise(frames({ n: 600, at: (i) => ({ ...O1O2(i), raiseGate: i >= 55 && i <= 62 ? (i === 58 ? null : 0) : 1 }) }));
    expect(gated.raises[0]!.countRoseT).toBeCloseTo(1 + 63 * F, 9);
    expect(gated.raises[0]!.countRoseContiguous).toBe(false);
    // The count-zero edge under stale rows (frames 180-185 stale): seen at 186, not contiguous.
    const stale = analyzeRaise(frames({ n: 600, at: (i) => ({ ...O1O2(i), raiseStale: i >= 180 && i <= 185 ? 1 : 0 }) }));
    expect(stale.lowers[0]!.countZeroT).toBeCloseTo(1 + 186 * F, 9);
    expect(stale.lowers[0]!.countZeroContiguous).toBe(false);
    expect(stale.lowers[0]!.exact).toBe(false);
    // A torn raise frame: the flip is seen at 65 against the last eligible row, 63.
    const torn = analyzeRaise(frames({ n: 120, at: (i) => ({ raiseCount: 1, raiseState: i >= 64 ? 1 : 2, raiseTorn: i === 64 ? 1 : 0 }) }));
    expect(torn.raises).toHaveLength(1);
    expect(torn.raises[0]!.t).toBeCloseTo(1 + 65 * F, 9);
    expect(torn.raises[0]!.gapFrames).toBe(1);
  });

  it('F3: a mark or raise on a row whose record count passes the cap is truncated (the run cap given, or 8)', () => {
    const over = analyzeRaise(frames({ n: 600, at: (i) => ({ ...O1O2(i), raiseRecs: 9 }) }));
    expect(over.marks[0]!.truncated).toBe(true);
    expect(over.raises[0]!.truncated).toBe(true);
    const capped = analyzeRaise(frames({ n: 600, at: (i) => ({ ...O1O2(i), raiseRecs: 5 }) }), { recordsMax: 4 });
    expect(capped.marks[0]!.truncated).toBe(true);
    const within = analyzeRaise(frames({ n: 600, at: (i) => ({ ...O1O2(i), raiseRecs: 5 }) }));
    expect(within.marks[0]!.truncated).toBe(false);
  });

  it('is not an enemy raise: a fire raise (edge 2), a raise with the count 0; nor across a case boundary', () => {
    const fire = analyzeRaise(frames({ n: 120, at: (i) => ({ raiseCount: 1, raiseState: i >= 64 ? 1 : 2, raiseEdge: i === 64 ? 2 : 0 }) }));
    expect(fire.raises).toEqual([]);
    const none = analyzeRaise(frames({ n: 120, at: (i) => ({ raiseState: i >= 64 ? 1 : 2 }) }));
    expect(none.raises).toEqual([]);
    const two = analyzeRaise([...frames({ n: 10, at: () => ({ raiseCount: 1 }) }, 1, 'a'), ...frames({ n: 10, at: () => ({ raiseCount: 1, raiseState: 1 }) }, 1, 'b')]);
    expect(two.raises).toEqual([]);
  });

  it('reads the CSV form too (numbers as text, an empty cell as no value)', () => {
    const rows = frames({ n: 600, at: O1O2 }).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null ? '' : String(v)])));
    const r = analyzeRaise(rows);
    expect(r.raises).toHaveLength(1);
    expect(r.lowers[0]!.dt).toBeCloseTo((LOWER - 180) * F, 4);
  });
});
