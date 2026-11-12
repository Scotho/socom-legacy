import { stepThrowPower, THROW_PARAMS, THROW_POWER_RISE } from '@s2u/scene';

/**
 * The grenade-flow spec's hold measure -- a test instrument (a browser adaptation, product track): it reads the spec's
 * frame trace and changes nothing in the game.
 *
 * Why: the game counts a held throw's power in each frame's REAL seconds (`../src/grenade.ts` `GrenadeHand.update`,
 * PAR-34, research 252 / ACT.R8), `power += (1 - power) * THROW_POWER_RISE * dt` in substeps of at most
 * `THROW_POWER_STEP_MAX_S` (`@s2u/scene` `stepThrowPower`, `FUN_00594cf0`, research 85 s1). How long a spec's "short"
 * hold lasts is the host's: on a slow renderer the round trip that sees the target and lets go can hold the button as
 * long as a "full" hold (RC1 on SwiftShader: 0.9029 short against 0.8779 full). So the spec checks each throw's power
 * against the time the game counted, and compares two holds only when one was measurably the shorter.
 *
 * The bracket. The probe samples once a frame in its own `requestAnimationFrame` callback, registered after the game's
 * frame callback (which re-registers itself each frame before the probe does; callbacks run in registration order), so
 * sample `i` is the state after the game's update `i`, and its `performance.now()` `t_i` is no earlier than that update's
 * clock read `now_i` (`main.ts` `frame`: `FrameTime.frame(performance.now())`, its first line), which in turn is later
 * than the previous sample's `t_(i-1)`: `now_i` lies in `(t_(i-1), t_i]`. A frame that raised the power was credited
 * `now_i - now_(i-1)` real seconds; a run of consecutive raising frames `i..j` telescopes to `now_j - now_(i-1)`, which
 * lies in `[t_(j-1) - t_(i-1), t_j - t_(i-2)]` (unbounded above without a sample `i-2`). Summed over the runs (a hold
 * is one run): the counted hold's low and high bounds -- one frame's slack at each end, wider on a slow host.
 * Over a time `s` from power `p0` at pressure 1, with substeps of at most 0.1 s, the power lies between the continuous
 * curve `1 - (1 - p0) e^(-3 s)` (the smallest steps) and 0.1 s steps (the largest; `log(1 - 3d)` is concave). The thrown
 * power must lie between the low bound's continuous power and the high bound's stepped power; `POWER_EPSILON` is the
 * only slack, float rounding. A substep is also no longer than its frame (`real / n` with `n >= 1`), and frame `i`
 * lasted at most `t_i - t_(i-2)`: the upper curve steps at `stepCapS`, the least of 0.1 s and the longest raising frame
 * the trace allows, which keeps a fast host's short hold tight. Without a sample `i-2` the high bound is unbounded and
 * the upper power 1 (the spec waits two probe frames before a press, so its traces always have one).
 */
export const THROW_POWER_STEP_MAX_S = 0.1;   // ../src/grenade.ts THROW_POWER_STEP_MAX_S (pinned by test/e2eGrenadeHold.test.ts)
export const POWER_EPSILON = 1e-6;
/** A short hold whose counted frames all ran at least this fast (20 fps) must be measured apart from the full hold: a
 * test instrument's bound, no original value. At that pace 0.25 is reached in ~2 frames and 0.85 in ~13. */
export const FAST_FRAME_MS = 50;

export interface HoldFrame { t: number; phase: string; power: number; thrown: boolean }

export interface Hold {
  /** Frames whose update raised the power (the hold's counted frames). */
  counted: number;
  /** The power before the first counted frame. */
  startPower: number;
  /** The counted real seconds' bracket. */
  heldLowS: number;
  heldHighS: number;
  /** The upper curve's substep: min(0.1 s, the longest a raising frame can have lasted). */
  stepCapS: number;
  /** The trace's median frame interval, ms (the host's pace; reported). */
  frameMs: number;
  /** The longest probe interval among the counted frames, ms (`t_k - t_(k-1)`): a stall inside the hold. */
  longestFrameMs: number;
  /** The power the bracket allows. */
  powerLow: number;
  powerHigh: number;
  thrownPower: number;
  matches: boolean;
}

/** The power from `p0` after `seconds` held at pressure 1 in steps of `cap` (the largest allowed); 1 for no bound. */
function steppedPower(p0: number, seconds: number, cap: number): number {
  if (!Number.isFinite(seconds) || !(cap > 0)) return 1;
  let p = p0;
  for (let left = seconds; left > 1e-12; left -= cap) p = stepThrowPower(p, 1, Math.min(cap, left)).power;
  return p;
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function measureHold(frames: readonly HoldFrame[], thrownPower: number): Hold {
  const out = frames.findIndex(f => f.thrown);
  const stop = out < 0 ? frames.length : out;
  let counted = 0, low = 0, high = 0, first = -1, longest = 0, longestFrameMs = 0;
  for (let i = 1; i < stop; i++) {
    if (!(frames[i]!.power > frames[i - 1]!.power)) continue;
    // A run of consecutive raising frames telescopes: `now_end - now_(start-1)`, one bracket for the whole run.
    let j = i;
    while (j + 1 < stop && frames[j + 1]!.power > frames[j]!.power) j++;
    const before = frames[i - 1]!, end = frames[j]!;
    if (first < 0) first = i;
    counted += j - i + 1;
    for (let k = i; k <= j; k++) {
      longest = Math.max(longest, k >= 2 ? frames[k]!.t - frames[k - 2]!.t : Infinity);
      longestFrameMs = Math.max(longestFrameMs, frames[k]!.t - frames[k - 1]!.t);
    }
    low += (frames[j - 1]!.t - before.t) / 1000;
    high += i >= 2 ? (end.t - frames[i - 2]!.t) / 1000 : Infinity;
    i = j;
  }
  const startPower = first < 0 ? NaN : frames[first - 1]!.power;
  const powerLow = 1 - (1 - startPower) * Math.exp(-THROW_POWER_RISE * low);
  const stepCapS = Math.min(THROW_POWER_STEP_MAX_S, longest / 1000);
  const powerHigh = steppedPower(startPower, high, stepCapS);
  const frameMs = median(frames.slice(1).map((f, i) => f.t - frames[i]!.t));
  const matches = counted > 0 && thrownPower >= powerLow - POWER_EPSILON && thrownPower <= powerHigh + POWER_EPSILON;
  return { counted, startPower, heldLowS: low, heldHighS: high, stepCapS, frameMs, longestFrameMs, powerLow, powerHigh, thrownPower, matches };
}

/** `short` was held measurably less long than `full`: its whole bracket under `full`'s. */
export function shorterHold(short: Hold, full: Hold): boolean {
  return short.counted > 0 && full.counted > 0 && short.heldHighS < full.heldLowS;
}

/**
 * The short hold must be measurably the shorter: none of its counted frames stalled past `FAST_FRAME_MS`. Then a short
 * hold as long as the full one is the release's own delay, not the host (the review's F1); one stall inside the hold (a
 * first-use compile, a late touch) waives it, as the median frame did not (the re-review's finding).
 */
export function mustSeparate(short: Hold): boolean {
  return short.counted > 0 && short.longestFrameMs <= FAST_FRAME_MS;
}

/** The hold was too short to reach the toss threshold whatever the frames' steps: its throw must be a toss. */
export function mustToss(h: Hold): boolean {
  return h.counted > 0 && h.powerHigh < THROW_PARAMS.tossPowerThreshold;
}
