/**
 * SVC-13a (web sprint 10, W10.R2; research 261 §8, research 155 §2.1 R155.5-R155.7): the rating's change at a round's
 * end, computed as the original's client computes it -- the client's Elo over the two teams, no server formula. Pure:
 * no store, no room, no clock; nobody calls it yet (SVC-13 and SVC-07 wire it).
 *
 * Sources: the retail decompilation `socom2_game.elf.decomp.c` (`D:L<n>`), cited, never pasted; the ELF's instructions
 * read by address where the decompiled text leaves a precision or an order open (0x2253c0-0x2256ec, 0x2397f0-0x239b84,
 * 0x239d40-0x23a020, 0x2c2dc0-0x2c2e24).
 *
 * - **When.** The exit state's leave (`FUN_002232a0`) calls `FUN_002253c0` with respawn off (game +0xdc) and
 *   `ComeFromLan` 0 (D:L75798), and writes a result above 0 into the record's +0x04 and posts it (D:L75801-75804): every
 *   round's end, the game over included (research 261 §3; research 155 §4.1 for the order beside the career fold).
 *   Deciding that is the caller's; this module computes the round.
 * - **The calculator** (`FUN_002253c0` D:L76661-76768): nothing for a local spectator (D:L76690-76691); two sides, the
 *   SEALs (id 0) with game +0x120's round wins and the Terrorists (id 8) with +0x124's, the winner flag "game +0x128 is 0"
 *   on the SEALs and its opposite on the Terrorists (D:L76699-76704) -- so a round with no winner is scored as a
 *   Terrorist win; the rounds played, game +0x11c (D:L76700); every player of the list on a side who is not a ghost of
 *   the round (actor +0xfd2, D:L76717; the side tests D:L76719-76721), with his published rating (`FUN_002c3500`
 *   D:L164888-164910, converted `cvt.s.w`, ELF 0x225580) and his match score (actor +0x580, a signed short floored at 0,
 *   D:L76734-76737, ELF 0x225558-0x225564); no result unless both sides hold a player (D:L76747).
 * - **The arithmetic** (`FUN_00239d40` D:L86199-86280): `ratingsAfterRound`'s steps, each cited where it is done.
 * - **The local result** (D:L76752-76759): the player's own new rating, rounded `(int)(new + 0.5)`; halved toward the
 *   record's rating for a join in progress -- `localRating`.
 *
 * The team mode (the calculator's byte +8: one rating a side, K 50, the sides from 1118.0 and 982.0, D:L76703-76704,
 * D:L86256-86270, D:L86062-86069) is dead: the constructor clears the byte (`FUN_0023a2c0` D:L86400) and the caller
 * clears it again (D:L76702); nothing sets it. It is not transcribed.
 *
 * `FUN_001b3620` (D:L32990-32996) is a fabs -- the sign bit cleared. `FUN_00239d40` calls it twice, on the shares' sum
 * less the pot (D:L86263) and on the sum of the changes (D:L86276), and uses neither result: an assertion's remains, no
 * effect on any rating. No stand-in is needed; nothing here computes it.
 */

import type { Side } from './accountStats';

/** The floor of a new rating (`FUN_002397f0` D:L86052-86055; ELF 0x2398f4 loads 200.0, 0x23991c `c.olt.s`). */
export const RATING_FLOOR = 200;

/** K = 3 x the players in the calculator (`FUN_00239d40` D:L86266; ELF 0x239f80-0x239f88). */
export const RATING_K_PER_PLAYER = 3;

/**
 * RATING_ROUNDING_READING: every single-precision step of the calculator (`add.s`, `sub.s`, `mul.s`, `div.s`, `cvt.s.w`;
 * ELF 0x239df8-0x239f60, 0x239824-0x239828, 0x239888-0x239950, 0x2399e0-0x239a60, 0x239ab8-0x239b10, 0x225618,
 * 0x225694-0x225698) is rounded toward zero, the EE FPU's rounding as research 111 §1.4 reads it -- the same reading as
 * the fold's `STATS_FOLD_ROUNDING_READING`, not measured on these functions. An ordinary round depends on it: one SEAL
 * against two Terrorists, all at 1000, round 1, the Terrorists winning with match scores 3 and 6 -- the score-3
 * Terrorist's new rating is 1001.4999 under chop (1001 posted) and 1001.5 to nearest (1002). That round played on the
 * local stack and its posts read (ONL-32) would settle it.
 */
export const RATING_ROUNDING_READING = 'chop' as const;

/**
 * RATING_EXPECTATION_SOFTFLOAT_READING: the expectation's power, add and divide are done in double precision by the
 * soft-float helpers `FUN_002397f0` calls (D:L86040-86044; ELF 0x239834-0x23986c): `FUN_001a0720` (single to double),
 * `FUN_001b3898` with 10.0 (0x4024000000000000) and the exponent, `FUN_001a0b58` with 1.0, `FUN_001a0ea0` with 1.0,
 * `FUN_001a12d8` (double to single) -- read as `pow(10, d)`, `1 + x`, `1 / x` and the conversion by their shape and their
 * constants only, not traced through (research 155 §9). Transcribed as IEEE double steps rounded to nearest (JavaScript's
 * own `Math.pow`, `+`, `/`) and `Math.fround` for the conversion. The s4 trace fixes E = 0.5 at equal means (R155.6);
 * nothing measures an unequal pair -- a round between unequal ratings posted by the original (ONL-32), or a call trace
 * of the helpers, would: e.g. one against one at 1400 and 1000, round 1, the 1400 side winning, posts 1401 and 999.
 */
export const RATING_EXPECTATION_SOFTFLOAT_READING = 'double, to nearest' as const;

/**
 * RATING_SPECTATOR_OUT_PLACEHOLDER: a spectator is in no side of the calculator and gets no result -- a stand-in for an
 * unread fact. The original's own spectator test is on the local player only (`FUN_002c2fd0` D:L76690-76691, the player
 * state's bit 0x10000 or the valve at 0x44f370, D:L164609-164645); the calculator takes every player whom the side tests
 * (`FUN_002c31d0` / `FUN_002c30b0`, the team word against 0x40000001 / 0x80000100, D:L164723-164767, D:L164662-164706)
 * put on a side. Whether a spectator's team word answers either test on the other consoles is not read. Our rooms seat
 * no spectator on a side today (SVC-07a's watchers), so the choice changes no rating the server computes now. Settled by
 * a read of who writes a spectator's team word, or by ONL-32's per-round posts from a round with a spectator seated.
 */
export const RATING_SPECTATOR_OUT_PLACEHOLDER = 'out' as const;

/** One seat of the round, as the calculator reads it (research 155 §4.2's `RoundResult`). */
export interface RatingSeat {
  /** The caller's key for the seat (an account, a room id). */
  id: string;
  /** The side (`FUN_002c31d0` SEAL / `FUN_002c30b0` Terrorist), or null on neither. */
  side: Side | null;
  /**
   * The rating: the published one the calculator reads (the player state's +8, `FUN_002c3500`), which each client
   * refreshes from its own record (`FUN_002c5360` D:L166208-166209), and the record's +0x04 the half reads
   * (D:L76758-76759) -- one value on our server, which holds one rating an account.
   */
  rating: number;
  /** The match score (actor +0x580, the match block's +0x3c): a signed short, floored at 0 (D:L76734-76737). */
  score: number;
  /** Joined the game in progress: the player state's +0x43 is not -1 (`FUN_002c2dc0` D:L164486-164513). */
  joinedInProgress: boolean;
  /** Spectates: no result (D:L76690-76691) and out of the sides (`RATING_SPECTATOR_OUT_PLACEHOLDER`). */
  spectator: boolean;
  /** A ghost of this round (actor +0xfd2, the exit state's copy of +0xfd1, D:L76148): out of the calculator (D:L76717). */
  ghost: boolean;
}

/** What a round's end hands the rating (research 155 §4.2). */
export interface RoundResult {
  /** Game +0x11c: the rounds played, this one included (D:L150648-150649; D:L76700). */
  roundsPlayed: number;
  /** Game +0x120 / +0x124: each side's round wins (D:L76703-76704). */
  sealRoundWins: number;
  terroristRoundWins: number;
  /** Game +0x128: the round's winner -- 0 the SEALs, 8 the Terrorists, any other value none (research 91 §9). */
  winner: Side | null;
  /** Every player of the game's list, in its order (the order of the float sums, D:L76713-76746). */
  seats: readonly RatingSeat[];
}

/** One seat's rating after the round. */
export interface SeatRating {
  id: string;
  /** The rating before the round (the seat's). */
  before: number;
  /** The seat's share of its side's part (`FUN_00239980`), or null when it is not in the calculator. */
  share: number | null;
  /** The new rating in single precision, floored (`FUN_002397f0` +0x14), or null when it is not in the calculator. */
  computed: number | null;
  /** `FUN_002253c0`'s return for this seat: the local result, 0 for none. */
  result: number;
  /** The rating after the round: the result when above 0 (D:L75801), else the rating before. */
  rating: number;
}

/**
 * The two roundings `RATING_ROUNDING_READING` chooses between: toward zero (the reading) and to nearest (the other
 * hypothesis it names). Only PROVE-1's scorer (`tools/prove-results.ts`, research 267) asks for `'nearest'`, to show the
 * other mode's value beside a post; every caller of the server takes the reading.
 */
export type RatingRounding = 'chop' | 'nearest';

/** The rounding of the call in progress: `ratingsAfterRound` sets it for its own duration and restores it. */
let rounding: RatingRounding = RATING_ROUNDING_READING;

const BOX = new Float32Array(1);
const BITS = new Uint32Array(BOX.buffer);

/** `x` to single precision rounded toward zero (`RATING_ROUNDING_READING`), or to nearest when the call asks it. */
function f32(x: number): number {
  if (rounding === 'nearest' || !Number.isFinite(x)) return Math.fround(x);
  const r = Math.fround(x);
  if (r === x || Math.abs(r) <= Math.abs(x)) return r;
  BOX[0] = r;
  BITS[0] = BITS[0]! - 1;   // one step toward zero, either sign
  return BOX[0]!;
}

/** `cvt.s.w`: a signed 32-bit integer to single precision. */
const i2f = (n: number): number => f32(n | 0);

/** An unsigned 32-bit integer to single precision as the compiler converts it (ELF 0x225648-0x225674: halved, odd bit kept, doubled). */
function u2f(n: number): number {
  const u = n >>> 0;
  if (u < 0x80000000) return f32(u);
  const half = f32((u >>> 1) | (u & 1));
  return f32(half + half);
}

/** `cvt.w.s`: truncation toward zero. */
const toInt = (x: number): number => Math.trunc(x) | 0;

const F_HALF = 0.5;               // 0x3f000000 (ELF 0x239df8, 0x2399ac, 0x22560c, 0x22567c)
const F_400 = 400;                // 0x43c80000 (ELF 0x2397f4)
const F_FLOOR = RATING_FLOOR;     // 0x43480000 (ELF 0x239884, 0x2398f4)

/**
 * The factor by rounds played (`FUN_00239d40` D:L86234-86252): 11 -> 0.05, 9 -> 0.07, 7 -> 0.10, 5 -> 0.16, 3 -> 0.35,
 * any other count 0.05 -- the single-precision constants the ELF loads (0x239e78-0x239ef8: 0x3d4ccccd, 0x3d8f5c29,
 * 0x3dcccccd, 0x3e23d70a, 0x3eb33333).
 */
export function roundFactor(roundsPlayed: number): number {
  switch (roundsPlayed) {
    case 11: return Math.fround(0.05);
    case 9: return Math.fround(0.07);
    case 7: return Math.fround(0.1);
    case 5: return Math.fround(0.16);
    case 3: return Math.fround(0.35);
    default: return Math.fround(0.05);
  }
}

/**
 * A side's expectation (`FUN_002397f0` D:L86040-86044): `E = 1 / (1 + 10^((other mean - own mean) / 400))`, the
 * difference and the division in single precision (ELF 0x239824-0x239828), the rest the soft-float double steps
 * (`RATING_EXPECTATION_SOFTFLOAT_READING`).
 */
export function expectation(ownMean: number, otherMean: number): number {
  const d = f32(f32(otherMean - ownMean) / F_400);
  return Math.fround(1 / (1 + Math.pow(10, d)));
}

/**
 * The local result (`FUN_002253c0` D:L76754-76759): `(int)(new + 0.5)` in single precision (ELF 0x225608-0x225620);
 * for a join in progress, `old + (int)((float)(that - old) x 0.5)`, `old` the record's rating converted unsigned to
 * single and truncated back (ELF 0x225648-0x2256a8) -- the half truncated toward zero.
 */
export function localRating(computed: number, joinedInProgress: boolean, recordRating: number): number {
  const rounded = toInt(f32(F_HALF + computed));
  if (!joinedInProgress) return rounded;
  const old = toInt(u2f(recordRating));
  return (old + toInt(f32(F_HALF * i2f((rounded - old) | 0)))) | 0;
}

interface Entry { seat: RatingSeat; index: number; rating: number; score: number; share: number; computed: number }
interface Team { entries: Entry[]; wins: number; winner: boolean }

/** A side's sum of scores, an integer (`FUN_00239b20` D:L86124-86137). */
const scoreSum = (t: Team): number => t.entries.reduce((s, e) => (s + e.score) | 0, 0);

/** A side's mean rating: the ratings summed in the list's order, divided by the count (`FUN_00239a70` D:L86105-86121; ELF 0x239aa8-0x239b10). */
function meanRating(t: Team): number {
  let sum = 0;
  for (const e of t.entries) sum = f32(sum + e.rating);
  return f32(sum / u2f(t.entries.length));
}

/**
 * Each player's share of his side's part (`FUN_00239980` D:L86075-86102; ELF 0x239980-0x239a6c): 0 for every player of
 * a side whose scores sum under 1; on the losing side `(part x score) / S`; on the winning side
 * `0.5 + (score x (part - n x 0.5)) / S`.
 */
function shareOut(t: Team, part: number): void {
  const S = scoreSum(t);
  const n = t.entries.length;
  for (const e of t.entries) {
    if (S < 1) e.share = 0;
    else if (!t.winner) e.share = f32(f32(part * i2f(e.score)) / i2f(S));
    else e.share = f32(F_HALF + f32(f32(i2f(e.score) * f32(part - f32(F_HALF * i2f(n)))) / i2f(S)));
  }
}

/**
 * Each player's new rating (`FUN_002397f0` D:L86046-86059; ELF 0x2398c8-0x239950): `R + K x (share - E)`, E the side's
 * expectation against the other side's mean, floored at 200.
 */
function rateOut(t: Team, otherMean: number, K: number): void {
  const E = expectation(meanRating(t), otherMean);
  const k = i2f(K);
  for (const e of t.entries) {
    const v = f32(e.rating + f32(k * f32(e.share - E)));
    e.computed = v < F_FLOOR ? F_FLOOR : v;
  }
}

/**
 * Every seat's rating after a round, as each seat's own console computes its own (`FUN_002253c0`, `FUN_00239d40`):
 *
 * 1. the sides: the SEALs with their round wins and the winner flag `winner === 'seal'`, the Terrorists with theirs and
 *    the opposite flag -- a round with no winner is a Terrorist win (D:L76699-76704);
 * 2. every seat on a side, not a ghost (D:L76717) and not a spectator (`RATING_SPECTATOR_OUT_PLACEHOLDER`), with its rating
 *    and its score floored at 0 (D:L76734-76739); no result for anyone unless both sides hold one (D:L76747);
 * 3. the pot `0.5 x N` (D:L86232; ELF 0x239e10-0x239e20);
 * 4. the losing side's part `L = f x (pot x its round wins)` -- the ELF's order, pot times wins first (0x239f0c-0x239f18);
 *    the winning side's `W = pot - L` (D:L86253-86254);
 * 5. the shares (`shareOut`; the winners' first, D:L86261-86262);
 * 6. `K = 3 x N` (D:L86266);
 * 7. the winners' new ratings against the losers' mean, then the losers' against the winners' (`rateOut`,
 *    D:L86271-86274);
 * 8. each seat's local result (`localRating`, D:L76752-76759) -- 0 for a seat out of the calculator (D:L76688,
 *    `FUN_00239ca0` D:L86179-86196 not finding it) -- applied only above 0 (D:L75801).
 *
 * `mode` is the single-precision rounding of every step: the reading by default; `'nearest'` only for PROVE-1's report
 * of the other mode (`RatingRounding`).
 */
export function ratingsAfterRound(round: RoundResult, mode: RatingRounding = RATING_ROUNDING_READING): SeatRating[] {
  const was = rounding;
  rounding = mode;
  try {
    return rate(round);
  } finally {
    rounding = was;
  }
}

function rate(round: RoundResult): SeatRating[] {
  const seal: Team = { entries: [], wins: round.sealRoundWins | 0, winner: round.winner === 'seal' };
  const terrorist: Team = { entries: [], wins: round.terroristRoundWins | 0, winner: round.winner !== 'seal' };
  round.seats.forEach((seat, index) => {
    if (seat.ghost || seat.spectator || seat.side === null) return;
    const score = Math.max(0, (seat.score << 16) >> 16);
    const entry: Entry = { seat, index, rating: i2f(seat.rating), score, share: 0, computed: 0 };
    (seat.side === 'seal' ? seal : terrorist).entries.push(entry);
  });

  const inCalculator = new Map<number, Entry>();
  if (seal.entries.length > 0 && terrorist.entries.length > 0) {
    const [winners, losers] = terrorist.winner ? [terrorist, seal] : [seal, terrorist];
    const N = seal.entries.length + terrorist.entries.length;
    const pot = f32(F_HALF * i2f(N));
    const L = f32(roundFactor(round.roundsPlayed | 0) * f32(pot * i2f(losers.wins)));
    const W = f32(pot - L);
    shareOut(winners, W);
    shareOut(losers, L);
    const K = (RATING_K_PER_PLAYER * N) | 0;
    const winnersMean = meanRating(winners), losersMean = meanRating(losers);
    rateOut(winners, losersMean, K);
    rateOut(losers, winnersMean, K);
    for (const e of [...seal.entries, ...terrorist.entries]) inCalculator.set(e.index, e);
  }

  return round.seats.map((seat, index) => {
    const e = inCalculator.get(index);
    const result = e ? localRating(e.computed, seat.joinedInProgress, seat.rating) : 0;
    return {
      id: seat.id,
      before: seat.rating,
      share: e ? e.share : null,
      computed: e ? e.computed : null,
      result,
      rating: result > 0 ? result : seat.rating,
    };
  });
}
