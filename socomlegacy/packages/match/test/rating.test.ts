// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { applyMatch, defaultAccountStats, GAME_TYPE, type MatchBlock, type MatchOutcome } from '../src/stats/accountStats';
import {
  expectation, localRating, RATING_EXPECTATION_SOFTFLOAT_READING, RATING_FLOOR, RATING_ROUNDING_READING,
  RATING_SPECTATOR_OUT_PLACEHOLDER, ratingsAfterRound, roundFactor,
  type RatingSeat, type RoundResult,
} from '../src/stats/rating';

/**
 * SVC-13a (web sprint 10, W10.R2; research 261 §8, research 155 §2.1 R155.5-R155.7): the rating's change at a round's
 * end, held to `FUN_002253c0` (D:L76661-76768 of `socom2_game.elf.decomp.c`, the calculator built from the round) and
 * `FUN_00239d40` (D:L86199-86280, the arithmetic, with its helpers `FUN_00239980` D:L86075-86102, `FUN_00239a70`
 * D:L86105-86121, `FUN_00239b20` D:L86124-86137 and `FUN_002397f0` D:L86027-86072), the steps' precision and order
 * read from the ELF's instructions by address (0x239d40-0x23a020, 0x2397f0-0x239b84, 0x2253c0-0x2256ec). Transcription
 * tests: a reading, not a measurement -- the proven level is ONL-32's per-round posts.
 */

let next = 0;
function seat(over: Partial<RatingSeat> = {}): RatingSeat {
  return {
    id: `p${next++}`, side: 'seal', rating: 1000, score: 1, joinedInProgress: false, spectator: false, ghost: false, ...over,
  };
}

function round(over: Partial<RoundResult> & { seats: RatingSeat[] }): RoundResult {
  return { roundsPlayed: 1, sealRoundWins: 0, terroristRoundWins: 0, winner: null, ...over };
}

const after = (r: RoundResult): number[] => ratingsAfterRound(r).map((s) => s.rating);

describe('the factor by rounds played (FUN_00239d40 D:L86234-86252; ELF 0x239e38-0x239efc, single-precision constants)', () => {
  it('reads 11, 9, 7, 5, 3 as 0.05, 0.07, 0.10, 0.16, 0.35 -- the floats the ELF loads', () => {
    expect(roundFactor(11)).toBe(Math.fround(0.05));   // 0x3d4ccccd
    expect(roundFactor(9)).toBe(Math.fround(0.07));    // 0x3d8f5c29
    expect(roundFactor(7)).toBe(Math.fround(0.1));     // 0x3dcccccd
    expect(roundFactor(5)).toBe(Math.fround(0.16));    // 0x3e23d70a
    expect(roundFactor(3)).toBe(Math.fround(0.35));    // 0x3eb33333
  });

  it('reads any other count as 0.05 (D:L86250-86251): 1, 2, 4, 10, 12', () => {
    for (const n of [1, 2, 4, 10, 12]) expect(roundFactor(n)).toBe(Math.fround(0.05));
  });

  it('moves the losing side\'s part: L = f x pot x its round wins (D:L86253; ELF 0x239f0c-0x239f18)', () => {
    // One against one, the Terrorists won after the SEALs took one round: pot 1, L = f x 1 x 1, the SEAL's share L.
    const at = (rounds: number) => ratingsAfterRound(round({
      roundsPlayed: rounds, sealRoundWins: 1, terroristRoundWins: rounds - 1, winner: 'terrorist',
      seats: [seat({ side: 'seal' }), seat({ side: 'terrorist' })],
    }));
    expect(at(3)[0]!.share).toBeCloseTo(0.35, 6);
    expect(at(5)[0]!.share).toBeCloseTo(0.16, 6);
    expect(at(4)[0]!.share).toBeCloseTo(0.05, 6);   // another count: the else branch
  });
});

describe('the shares by match score (FUN_00239980 D:L86075-86102; ELF 0x239980-0x239a6c)', () => {
  it('splits L by score on the losing side and gives the winners 0.5 + (W - n x 0.5) x score / S', () => {
    // Two against two, round 3, the Terrorists' second win: N 4, pot 2, L = 0.35 x 2 x 1 = 0.7, W = 1.3.
    const r = ratingsAfterRound(round({
      roundsPlayed: 3, sealRoundWins: 1, terroristRoundWins: 2, winner: 'terrorist',
      seats: [
        seat({ side: 'seal', score: 3 }), seat({ side: 'seal', score: 1 }),
        seat({ side: 'terrorist', score: 6 }), seat({ side: 'terrorist', score: 2 }),
      ],
    }));
    expect(r.map((s) => s.share)).toEqual([
      expect.closeTo(0.525, 6), expect.closeTo(0.175, 6), expect.closeTo(0.725, 6), expect.closeTo(0.575, 6),
    ]);
    // The shares sum to the pot (what D:L86263 hands FUN_001b3620, a fabs whose result is unused).
    expect(r.reduce((a, s) => a + s.share!, 0)).toBeCloseTo(2, 6);
    // K = 12, E = 0.5: 1000 + 12 x (share - 0.5), rounded (D:L76754).
    expect(r.map((s) => s.rating)).toEqual([1000, 996, 1003, 1001]);
  });

  it('gives every player of a side whose scores sum under 1 a share of 0 -- the losers and the winners alike (D:L86089-86090)', () => {
    // One against one, round 3 (f 0.35): L = 0.35, W = 0.65.
    const losersAtZero = ratingsAfterRound(round({
      roundsPlayed: 3, sealRoundWins: 1, terroristRoundWins: 2, winner: 'terrorist',
      seats: [seat({ side: 'seal', score: 0 }), seat({ side: 'terrorist', score: 5 })],
    }));
    expect(losersAtZero.map((s) => s.share)).toEqual([0, expect.closeTo(0.65, 6)]);
    expect(losersAtZero.map((s) => s.rating)).toEqual([997, 1001]);
    const winnersAtZero = ratingsAfterRound(round({
      roundsPlayed: 3, sealRoundWins: 1, terroristRoundWins: 2, winner: 'terrorist',
      seats: [seat({ side: 'seal', score: 4 }), seat({ side: 'terrorist', score: 0 })],
    }));
    expect(winnersAtZero.map((s) => s.share)).toEqual([expect.closeTo(0.35, 6), 0]);
    expect(winnersAtZero.map((s) => s.rating)).toEqual([999, 997]);   // the winner with no score loses 3
  });

  it('floors a negative match score at 0 (D:L76734-76737; ELF 0x225558-0x225564, `lh` then the floor)', () => {
    const r = ratingsAfterRound(round({ winner: 'seal', sealRoundWins: 1, seats: [seat({ side: 'seal', score: -4 }), seat({ side: 'terrorist' })] }));
    expect(r[0]!.share).toBe(0);
    expect(r[0]!.rating).toBe(997);
  });
});

describe('K, the expectation and the floor (FUN_00239d40 D:L86265-86274; FUN_002397f0 D:L86040-86059)', () => {
  it('E = 1 / (1 + 10^((other mean - own mean) / 400)): 0.5 at equal means (the s4 trace fixes this point)', () => {
    expect(expectation(1000, 1000)).toBe(0.5);
    expect(expectation(1500, 1500)).toBe(0.5);
  });

  it('off the diagonal, the transcription of the soft-float power, add and divide (RATING_EXPECTATION_SOFTFLOAT_READING)', () => {
    expect(RATING_EXPECTATION_SOFTFLOAT_READING).toBe('double, to nearest');
    expect(expectation(1400, 1000)).toBeCloseTo(10 / 11, 6);   // own mean 1400 against 1000: the stronger side
    expect(expectation(1000, 1400)).toBeCloseTo(1 / 11, 6);
    // Research 155 §2.1's worked case: a player 400 above his opponent wins 1 and loses 5 (K = 6); the other moves 1 or 5.
    const play = (winner: 'seal' | 'terrorist') => after(round({
      winner, sealRoundWins: winner === 'seal' ? 1 : 0, terroristRoundWins: winner === 'terrorist' ? 1 : 0,
      seats: [seat({ side: 'seal', rating: 1400 }), seat({ side: 'terrorist', rating: 1000 })],
    }));
    expect(play('seal')).toEqual([1401, 999]);
    expect(play('terrorist')).toEqual([1395, 1005]);
  });

  it('floors the new rating at 200 (D:L86052-86055; ELF 0x239914-0x239928, `c.olt.s` against 200.0)', () => {
    expect(RATING_FLOOR).toBe(200);
    const r = ratingsAfterRound(round({ winner: 'terrorist', terroristRoundWins: 1, seats: [seat({ side: 'seal', rating: 200 }), seat({ side: 'terrorist', rating: 200 })] }));
    expect(r.map((s) => s.computed)).toEqual([200, 203]);
    expect(r.map((s) => s.rating)).toEqual([200, 203]);
    const below = ratingsAfterRound(round({ winner: 'terrorist', terroristRoundWins: 1, seats: [seat({ side: 'seal', rating: 201 }), seat({ side: 'terrorist', rating: 201 })] }));
    expect(below[0]!.rating).toBe(200);   // 201 - 3 = 198, floored
  });

  it('rounds the uneven game: one beating three at 1000, round 1 -> +18, -6 each (K = 12, the lone share 2)', () => {
    const r = ratingsAfterRound(round({
      winner: 'seal', sealRoundWins: 1,
      seats: [seat({ side: 'seal' }), seat({ side: 'terrorist' }), seat({ side: 'terrorist' }), seat({ side: 'terrorist' })],
    }));
    expect(r[0]!.share).toBe(2);
    expect(r.map((s) => s.rating)).toEqual([1018, 994, 994, 994]);
  });
});

describe('the local result: rounded, halved for a join in progress, applied above 0 (FUN_002253c0 D:L76754-76759; FUN_002232a0 D:L75801)', () => {
  it('rounds with (int)(new + 0.5) in single precision (ELF 0x225608-0x225620: `add.s`, `cvt.w.s`)', () => {
    expect(RATING_ROUNDING_READING).toBe('chop');
    expect(localRating(1001.5, false, 1000)).toBe(1002);
    expect(localRating(998.5, false, 1000)).toBe(999);
    expect(localRating(1002.4, false, 1000)).toBe(1002);
    // Through the calculator: a round count off the table (10, f 0.05), the losers' 5 wins: L = 0.25, W = 0.75.
    const r = ratingsAfterRound(round({ roundsPlayed: 10, sealRoundWins: 5, terroristRoundWins: 5, winner: 'seal', seats: [seat({ side: 'seal' }), seat({ side: 'terrorist' })] }));
    expect(r.map((s) => s.computed)).toEqual([1001.5, 998.5]);
    expect(r.map((s) => s.rating)).toEqual([1002, 999]);
  });

  it('decides an ordinary round by the rounding: 1 against 2 at 1000, the winners scoring 3 and 6 (RATING_ROUNDING_READING)', () => {
    // N 3, pot 1.5, W 1.5, K 9; the score-3 share 0.5 + 3 x 0.5 / 9 in single precision rounded toward zero is
    // 0.66666663, so 1000 + 9 x 0.16666663 = 1001.4999 and the post 1001 -- to nearest it would be 1001.5 and 1002.
    const r = ratingsAfterRound(round({
      winner: 'terrorist', terroristRoundWins: 1,
      seats: [seat({ side: 'seal', score: 0 }), seat({ side: 'terrorist', score: 3 }), seat({ side: 'terrorist', score: 6 })],
    }));
    expect(r[1]!.computed).toBeLessThan(1001.5);
    expect(r.map((s) => s.rating)).toEqual([996, 1001, 1003]);
  });

  it("computes the same round to nearest only when asked (`RatingRounding`, PROVE-1's other mode; research 267 §1): 1002", () => {
    const deciding = round({
      winner: 'terrorist', terroristRoundWins: 1,
      seats: [seat({ side: 'seal', score: 0 }), seat({ side: 'terrorist', score: 3 }), seat({ side: 'terrorist', score: 6 })],
    });
    expect(ratingsAfterRound(deciding, 'nearest').map((s) => s.rating)).toEqual([996, 1002, 1003]);
    expect(ratingsAfterRound(deciding).map((s) => s.rating)).toEqual([996, 1001, 1003]);   // the reading, restored after the call
  });

  it('halves a join in progress\'s change, truncated toward zero: old + trunc((rounded - old) x 0.5) (ELF 0x225640-0x2256a8)', () => {
    expect(localRating(1001.5, true, 1000)).toBe(1001);   // +2 -> +1
    expect(localRating(998.5, true, 1000)).toBe(1000);    // -1 -> trunc(-0.5) = 0, not -1
    expect(localRating(997, true, 1000)).toBe(999);       // -3 -> trunc(-1.5) = -1
    expect(localRating(1003, true, 1000)).toBe(1001);     // +3 -> +1
    const r = ratingsAfterRound(round({ seats: [seat({ side: 'seal', joinedInProgress: true }), seat({ side: 'terrorist', joinedInProgress: true })] }));
    expect(r.map((s) => s.rating)).toEqual([999, 1001]);
  });

  it('applies a result only above 0: a seat out of the calculator keeps its rating (D:L75801)', () => {
    const r = ratingsAfterRound(round({ seats: [seat({ side: 'seal', rating: 1234 }), seat({ side: null, rating: 1500 })] }));
    expect(r.map((s) => [s.result, s.rating])).toEqual([[0, 1234], [0, 1500]]);
  });
});

describe('who is in it (FUN_002253c0 D:L76690-76747)', () => {
  it('scores a round with no winner as a Terrorist win (D:L76699-76704: the flag is "game +0x128 is 0")', () => {
    // Round 2 drawn after the SEALs won round 1: the Terrorists carry the flag, the SEALs' part is f x pot x 1.
    const r = ratingsAfterRound(round({ roundsPlayed: 2, sealRoundWins: 1, winner: null, seats: [seat({ side: 'seal' }), seat({ side: 'terrorist' })] }));
    expect(r.map((s) => s.share)).toEqual([expect.closeTo(0.05, 6), expect.closeTo(0.95, 6)]);
    expect(r.map((s) => s.rating)).toEqual([997, 1003]);
    // The same round with the SEALs as the winner would have gone the other way.
    expect(after(round({ roundsPlayed: 2, sealRoundWins: 1, winner: 'seal', seats: [seat({ side: 'seal' }), seat({ side: 'terrorist' })] }))).toEqual([1003, 997]);
  });

  it('leaves a ghost of the round out (actor +0xfd2, D:L76717) and a spectator out (RATING_SPECTATOR_OUT_PLACEHOLDER)', () => {
    expect(RATING_SPECTATOR_OUT_PLACEHOLDER).toBe('out');
    const without = after(round({ winner: 'seal', sealRoundWins: 1, seats: [seat({ side: 'seal' }), seat({ side: 'terrorist' })] }));
    const r = ratingsAfterRound(round({
      winner: 'seal', sealRoundWins: 1,
      seats: [
        seat({ side: 'seal' }), seat({ side: 'terrorist' }),
        seat({ side: 'terrorist', ghost: true, rating: 1300, score: 9 }),
        seat({ side: 'terrorist', spectator: true, rating: 700, score: 9 }),
        seat({ side: null, spectator: true }),
      ],
    }));
    expect(r.slice(0, 2).map((s) => s.rating)).toEqual(without);   // N = 2, K = 6: the ghost and the spectators count for nothing
    expect(r.slice(2).map((s) => [s.computed, s.result, s.rating])).toEqual([[null, 0, 1300], [null, 0, 700], [null, 0, 1000]]);
  });

  it('changes nothing with a side empty (D:L76747), a side emptied by its ghosts included', () => {
    expect(after(round({ winner: 'seal', seats: [seat({ side: 'seal', rating: 1100 }), seat({ side: 'seal', rating: 900 })] }))).toEqual([1100, 900]);
    expect(after(round({ seats: [seat({ side: 'seal', rating: 1100 }), seat({ side: 'terrorist', ghost: true, rating: 900 })] }))).toEqual([1100, 900]);
  });
});

describe('the goldens', () => {
  it('research 155 R155.6, the s4 session: two at 1000, round 1 drawn on the clock, score 1 each -> SEAL 997, Terrorist 1003', () => {
    // slice-Medius.log lines 262 and 270 (the stats posts), 264 and 272 (the ladder posts' byte 28): 997 and 1003.
    const r = ratingsAfterRound(round({ roundsPlayed: 1, sealRoundWins: 0, terroristRoundWins: 0, winner: null, seats: [seat({ side: 'seal' }), seat({ side: 'terrorist' })] }));
    expect(r.map((s) => s.share)).toEqual([0, 1]);
    expect(r.map((s) => s.computed)).toEqual([997, 1003]);
    expect(r.map((s) => s.result)).toEqual([997, 1003]);
    expect(r.map((s) => s.rating)).toEqual([997, 1003]);
  });

  it('pins a match\'s last round: the rating from the match block the round\'s fold left, the same whether the career fold ran first', () => {
    // BREACH, five rounds, the SEALs' third win in round 5: the match blocks hold 3 x 6 and 2 x 6 (the +5 and +1 a round).
    const block = (score: number): MatchBlock => ({
      headShots: 0, hits: 0, shots: 0, kills: 0, deaths: 0, suicides: 0, teamKills: 0, escorteesKilled: 0,
      escorteesBroughtOut: 0, primaryObjectives: 0, bonusObjectives: 0, bombsDefused: 0, bombsPlanted: 0, score,
    });
    const seal = block(18), terr = block(12);
    const last = round({
      roundsPlayed: 5, sealRoundWins: 3, terroristRoundWins: 2, winner: 'seal',
      seats: [seat({ side: 'seal', score: seal.score }), seat({ side: 'terrorist', score: terr.score })],
    });
    const r = ratingsAfterRound(last);
    // f(5) = 0.16, pot 1: L = 0.32, W = 0.68; shares 0.68 and 0.32; K = 6, E = 0.5.
    expect(r.map((s) => s.share)).toEqual([expect.closeTo(0.68, 6), expect.closeTo(0.32, 6)]);
    expect(r.map((s) => s.rating)).toEqual([1001, 999]);
    // The fold (`FUN_00225070`, D:L76078-76082) runs in the exit state's enter, the rating (D:L75798-75805) at its leave;
    // their fields are disjoint (research 155 §4.1), so either order leaves the same record.
    const outcome = (side: 'seal' | 'terrorist', b: MatchBlock): MatchOutcome => ({
      side, spectator: false, gameType: GAME_TYPE.BREACH, respawn: false, comeFromLan: false, clockMs: 300_000,
      roundsPlayed: 5, sealRoundWins: 3, terroristRoundWins: 2, block: b,
    });
    ([['seal', seal, 0], ['terrorist', terr, 1]] as const).forEach(([side, b, i]) => {
      const foldFirst = { ...applyMatch(defaultAccountStats(), outcome(side, b)), rating: r[i]!.rating };
      const ratingFirst = applyMatch({ ...defaultAccountStats(), rating: r[i]!.rating }, outcome(side, b));
      expect(applyMatch(defaultAccountStats(), outcome(side, b)).rating).toBe(1000);   // the fold never moves it
      expect(foldFirst).toEqual(ratingFirst);
      expect(foldFirst.rating).toBe(side === 'seal' ? 1001 : 999);
    });
    // Pure: the same round handed over twice gives the same ratings (applying it once is the caller's, SVC-07).
    expect(ratingsAfterRound(last)).toEqual(r);
  });
});
