import { RAISE_RECORDS_MAX } from './raise';

/**
 * The enemy-raise analysis over the probe's rows (`probe.ts --raise`; agent-mail/evidence/enemy-raise/SCOPE.md s2.1,
 * CAPTURE-JOB.md runs O1 and O2). Product track: an instrument, never in a build; its numbers reach a research note
 * through `derive-from-desktop`. Pure: rows in, detections out, each with its frame time (the row's guest clock `t`, s).
 *
 * - The raise: a frame where raiseState (body+0xf74 & 0xef, FUN_005dfe30 D:L494244) goes 2 -> 1 with raiseEdge
 *   (ctrl+0x118) 0 and raiseCount (ctrl+0xc0) >= 1. That is CONSISTENT WITH the idle-tail call (r0001 0x59643c, r0004
 *   0x59bee4), not proof of it: the edge test rules out only the two fire calls (0x59bd2c, 0x59bd40); another a1=1 call
 *   exists (r0004 0x59b9dc), and the idle tail also asks UP on the scope branch (FUN_005be6c0 && !FUN_005b90f0,
 *   D:L453089-453092) with no enemy counted. Per-frame samples cannot tell the call; only a debugger breakpoint at
 *   r0004 0x5e7600 (FUN_005dfe30) logging $ra identifies it (SCOPE.md s2.1 "Breakpoints").
 * - Mark to raise: for each raise, the latest mark onset (a record's +0x2c bit 0x200 going 0 -> 1, by its target
 *   pointer) at or before it among the records marked at the raise, with that record's squared distance (+0x10) and the
 *   reach x magnification (ctrl+0xa8 x body+0x204, FUN_005c9520 D:L481801) on the marking row.
 * - The lower: the count's return to 0, then the next raiseState 1 -> 2 (5.0 s expected, ctrl+0x22c, FUN_00598280
 *   D:L454808); a count back above 0 first drops it; one still pending at the case's end has lowerT null.
 * - The envelope, apart from the state flip: the weight of body+0x1160..0x116c ([up, hold, down, remaining],
 *   FUN_00286c90 D:L130817; remaining counts down, FUN_00286d40 D:L130840-130847) first reaching 1 after a raise (the
 *   "+0.1 s" half of the pass bar, the up ramp) and first reaching 0 after a lower (O2's 0.5 s fall, the down ramp).
 *
 * Only ELIGIBLE rows time anything (review F1): raiseGate read and non-zero, raiseTorn 0, raiseStale 0. A gated, stale or
 * torn row is never an edge, never the previous row of one. Every edge carries the previous eligible row's time and
 * whether it was the frame just before (review F2: `gapFrames`, in game steps of the group's own guest-clock step --
 * re-check F1, see guestStep and `groups`); a time across a gap is a bound, not exact (`exact` false). A row whose record count passes the run's cap was walked in part (review F3):
 * anything read on it is `truncated`. Rows group by (trial, case), in order; nothing carries across a group. Values may
 * be numbers or the CSV's text ('' is no value).
 */
export interface RaiseRow {
  readonly trial?: unknown;
  readonly case?: unknown;
  readonly t?: unknown;
  readonly [col: string]: unknown;
}

/**
 * The guest clock's step between consecutive game frames when a group has too few steps to read its own, s: two NTSC
 * vsyncs (2 / 59.94), the game's observed 30 Hz step. An instrument constant (what the probe's rows show), not a game
 * value: the 2026-11-01 probe CSVs' positive `t` steps are 0.03336 s (agent-mail/evidence/eph-hunt-2026-11-01/probes/:
 * r0001-square 1620 of 1629, r0001-ladder 6608 of 6640, r0004-ladder all 6634, r0004-s6-delivery all 766, within 0.1 ms;
 * REVIEW-EPH-RAISE-2.md finding 1). A row at that spacing is every game frame; only a wider one skipped a frame.
 */
export const GUEST_STEP_S = 2 / 59.94;
/** The fewest positive guest-clock steps a group needs to take its own step (their mode) instead of GUEST_STEP_S. */
export const GUEST_STEP_MIN_STEPS = 4;
/** The rounding of a guest-clock step before its mode is taken, s (0.1 ms: the clock's float jitter collapses). */
const GUEST_STEP_ROUND_S = 1e-4;

/**
 * A group's guest-clock step from its rows' `t` in order: the mode of the positive steps between consecutive rows that
 * carry a time, rounded to 0.1 ms (ties to the smaller: a skip is a multiple, never smaller); GUEST_STEP_S with fewer than
 * GUEST_STEP_MIN_STEPS steps.
 */
export function guestStep(ts: readonly number[]): { guestStepS: number; steps: number; fromClock: boolean } {
  const tally = new Map<number, number>();
  let steps = 0;
  for (let i = 1; i < ts.length; i++) {
    const d = ts[i]! - ts[i - 1]!;
    if (!(d > 0)) continue;
    steps++;
    const k = Math.round(d / GUEST_STEP_ROUND_S);
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  if (steps < GUEST_STEP_MIN_STEPS) return { guestStepS: GUEST_STEP_S, steps, fromClock: false };
  let best = -1, bestN = 0;
  for (const [k, n] of tally) if (n > bestN || (n === bestN && k < best)) { best = k; bestN = n; }
  return { guestStepS: Math.round(best * GUEST_STEP_ROUND_S * 1e6) / 1e6, steps, fromClock: true };
}

export interface RaiseFrame {
  /** The row's trial: a number when it reads as one (the CSV's text too). */
  readonly trial: number | string;
  readonly case: string;
  readonly t: number;
  /** The previous eligible row's time; null at a group's first eligible row. */
  readonly prevT: number | null;
  /** Game steps missing between prevT and t, in the group's guestStepS (0: the frame just before); null with no previous row. */
  readonly gapFrames: number | null;
  readonly contiguous: boolean;
  readonly count: number;
  /** The eligible row the count last rose from 0 to >= 1 in this group; null when it never was seen to rise. */
  readonly countRoseT: number | null;
  readonly countRoseContiguous: boolean | null;
  /** The raise row's record count passed the run's cap. */
  readonly truncated: boolean;
  /** The first eligible row at or after the raise whose envelope weight is 1 (before a lower); null when never seen. */
  readonly fullT: number | null;
  readonly fullDt: number | null;
  readonly fullContiguous: boolean | null;
}

export interface MarkToRaise {
  readonly trial: number | string;
  readonly case: string;
  readonly target: string;
  readonly markT: number;
  readonly markPrevT: number | null;
  readonly markContiguous: boolean;
  readonly raiseT: number;
  readonly dt: number;
  /** Both the mark onset and the raise contiguous: dt is exact to the frame; else a bound. */
  readonly exact: boolean;
  /** The marking row's record count passed the run's cap: the onset may be a record moving into the walked part. */
  readonly truncated: boolean;
  /** The record's squared distance (+0x10) on the marking row. */
  readonly dist2: number | null;
  /** raiseReach x raiseMag on the marking row (null when either is unread). */
  readonly reach: number | null;
}

export interface LowerAfterClear {
  readonly trial: number | string;
  readonly case: string;
  readonly countZeroT: number;
  readonly countZeroPrevT: number | null;
  readonly countZeroContiguous: boolean;
  readonly lowerT: number | null;
  readonly lowerPrevT: number | null;
  readonly lowerContiguous: boolean | null;
  readonly dt: number | null;
  /** Both edges contiguous: dt exact to the frame; else a bound (false while the lower is pending). */
  readonly exact: boolean;
  /** The first eligible row at or after the lower whose envelope weight is 0; null when never seen. */
  readonly fallEndT: number | null;
  readonly fallDt: number | null;
  readonly fallContiguous: boolean | null;
}

/** A (trial, case) group's guest-clock step: what its gapFrames count in. */
export interface RaiseGroup {
  readonly trial: number | string;
  readonly case: string;
  /** The step used, s: the mode of the group's positive guest-clock steps (0.1 ms), or GUEST_STEP_S. */
  readonly guestStepS: number;
  /** The positive guest-clock steps seen. */
  readonly steps: number;
  /** True when guestStepS is the group's own mode; false when too few steps fell back to GUEST_STEP_S. */
  readonly fromClock: boolean;
}

export interface RaiseAnalysis {
  readonly groups: RaiseGroup[];
  readonly raises: RaiseFrame[];
  readonly marks: MarkToRaise[];
  readonly lowers: LowerAfterClear[];
}

export interface AnalyzeRaiseOptions {
  /** The run's record cap (probe.json raise.recordsMax; default RAISE_RECORDS_MAX). */
  readonly recordsMax?: number;
}

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const text = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));

/**
 * The envelope's weight as FUN_00286c90 (D:L130817-130835) computes it from body+0x1160..0x116c [up, hold, down,
 * remaining]: FUN_00286d90 stores the ramp up (0.1 s), the hold (100000) and the ramp down (0.5 s) with remaining = their
 * total on a raise (D:L130879-130883; values FUN_005dffc0 D:L494282-494285), and FUN_00286d40 counts remaining DOWN by dt
 * (D:L130840-130847). Remaining clamped to the total; 0 at remaining <= 0; (total - remaining)/up while rising (hold +
 * down < remaining); remaining/down while falling (remaining < down); 1 while held. Null when a word is unread.
 */
export function envelopeWeight(up: number | null, hold: number | null, down: number | null, remaining: number | null): number | null {
  if (up === null || hold === null || down === null || remaining === null) return null;
  const total = down + up + hold;
  const c = Math.min(remaining, total);
  if (!(c > 0)) return 0;
  if (hold + down < c) return (total - c) / up;
  return c < down ? c / down : 1;
}

interface Edge { readonly t: number; readonly prevT: number | null; readonly gapFrames: number | null; readonly contiguous: boolean }

export function analyzeRaise(rows: readonly RaiseRow[], opts: AnalyzeRaiseOptions = {}): RaiseAnalysis {
  const cap = opts.recordsMax ?? RAISE_RECORDS_MAX;
  const groupKey = (r: RaiseRow): string => `${String(r.trial ?? '')}\u0000${String(r.case ?? '')}`;
  // Each group's guest-clock step, from all its rows' times in order (a torn or gated row's clock is still the frame's).
  const groups: RaiseGroup[] = [];
  const stepOf: number[] = [];
  for (let i = 0; i < rows.length;) {
    const k = groupKey(rows[i]!);
    const ts: number[] = [];
    let j = i;
    for (; j < rows.length && groupKey(rows[j]!) === k; j++) {
      const t = num(rows[j]!.t);
      if (t !== null) ts.push(t);
    }
    const g = guestStep(ts);
    groups.push({ trial: num(rows[i]!.trial) ?? String(rows[i]!.trial ?? ''), case: String(rows[i]!.case ?? ''), ...g });
    for (let n = i; n < j; n++) stepOf.push(g.guestStepS);
    i = j;
  }
  const raises: RaiseFrame[] = [];
  const marks: MarkToRaise[] = [];
  const lowers: LowerAfterClear[] = [];
  let key: string | null = null;
  let trial: number | string = '', kase = '';
  let prev: { t: number; state: number | null; count: number | null } | null = null;
  let countRose: Edge | null = null;
  /** Each target's mark onset while it stays marked. */
  let onset = new Map<string, { edge: Edge; truncated: boolean; dist2: number | null; reach: number | null }>();
  let pendingLower = null as LowerAfterClear | null;
  /** The raise whose envelope is still rising, and the lower whose envelope is still falling (indices into the lists). */
  let rising: number | null = null;
  let falling: number | null = null;
  const flush = (): void => {
    if (pendingLower) lowers.push(pendingLower);
    pendingLower = null;
  };
  for (let ri = 0; ri < rows.length; ri++) {
    const r = rows[ri]!;
    const k = groupKey(r);
    if (k !== key) {
      flush();
      key = k;
      trial = num(r.trial) ?? String(r.trial ?? '');
      kase = String(r.case ?? '');
      prev = null;
      countRose = null;
      onset = new Map();
      rising = null;
      falling = null;
    }
    const gate = num(r.raiseGate);
    if (gate === null || gate === 0 || num(r.raiseTorn) !== 0 || num(r.raiseStale) !== 0) continue;
    const t = num(r.t);
    if (t === null) continue;
    const gapFrames = prev ? Math.max(0, Math.round((t - prev.t) / stepOf[ri]!) - 1) : null;
    const edge: Edge = { t, prevT: prev ? prev.t : null, gapFrames, contiguous: gapFrames === 0 };
    const state = num(r.raiseState);
    const count = num(r.raiseCount);
    const recs = num(r.raiseRecs);
    const truncated = recs !== null && recs > cap;
    const reachW = num(r.raiseReach), mag = num(r.raiseMag);
    const weight = envelopeWeight(num(r.raiseEnv0), num(r.raiseEnv1), num(r.raiseEnv2), num(r.raiseEnv3));
    const marked = new Map<string, number>();
    for (let i = 0; i < RAISE_RECORDS_MAX; i++) {
      const target = text(r[`rec${i}Target`]);
      if (target !== null && num(r[`rec${i}Marked`]) === 1) marked.set(target, i);
    }
    for (const tg of [...onset.keys()]) if (!marked.has(tg)) onset.delete(tg);
    for (const [tg, i] of marked) {
      if (!onset.has(tg) && prev) {
        onset.set(tg, { edge, truncated, dist2: num(r[`rec${i}Dist2`]), reach: reachW !== null && mag !== null ? reachW * mag : null });
      }
    }
    if (prev) {
      if (count !== null && count >= 1 && !(prev.count !== null && prev.count >= 1)) countRose = edge;
      if (prev.state === 2 && state === 1 && num(r.raiseEdge) === 0 && count !== null && count >= 1) {
        raises.push({
          trial, case: kase, t, prevT: edge.prevT, gapFrames, contiguous: edge.contiguous, count,
          countRoseT: countRose ? countRose.t : null, countRoseContiguous: countRose ? countRose.contiguous : null,
          truncated, fullT: null, fullDt: null, fullContiguous: null,
        });
        rising = raises.length - 1;
        let best: [string, { edge: Edge; truncated: boolean; dist2: number | null; reach: number | null }] | null = null;
        for (const e of onset) if (!best || e[1].edge.t > best[1].edge.t) best = e;
        if (best) {
          const m = best[1];
          marks.push({
            trial, case: kase, target: best[0], markT: m.edge.t, markPrevT: m.edge.prevT, markContiguous: m.edge.contiguous, raiseT: t,
            dt: t - m.edge.t, exact: m.edge.contiguous && edge.contiguous, truncated: m.truncated, dist2: m.dist2, reach: m.reach,
          });
        }
      }
      if (prev.count !== null && prev.count >= 1 && count === 0) {
        pendingLower = {
          trial, case: kase, countZeroT: t, countZeroPrevT: edge.prevT, countZeroContiguous: edge.contiguous,
          lowerT: null, lowerPrevT: null, lowerContiguous: null, dt: null, exact: false, fallEndT: null, fallDt: null, fallContiguous: null,
        };
      } else if (pendingLower && count !== null && count >= 1) {
        pendingLower = null;
      }
      if (prev.state === 1 && state === 2) {
        rising = null;
        if (pendingLower) {
          const p: LowerAfterClear = pendingLower;
          lowers.push({ ...p, lowerT: t, lowerPrevT: edge.prevT, lowerContiguous: edge.contiguous, dt: t - p.countZeroT, exact: p.countZeroContiguous && edge.contiguous });
          pendingLower = null;
          falling = lowers.length - 1;
        }
      }
    }
    if (rising !== null && weight !== null && weight >= 1) {
      const x = raises[rising]!;
      raises[rising] = { ...x, fullT: t, fullDt: t - x.t, fullContiguous: edge.contiguous };
      rising = null;
    }
    if (falling !== null && weight !== null && weight <= 0) {
      const l = lowers[falling]!;
      lowers[falling] = { ...l, fallEndT: t, fallDt: t - l.lowerT!, fallContiguous: edge.contiguous };
      falling = null;
    }
    prev = { t, state, count };
  }
  flush();
  return { groups, raises, marks, lowers };
}
