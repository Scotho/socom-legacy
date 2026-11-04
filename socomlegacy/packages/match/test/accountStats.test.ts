// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { hitPct } from '../../viewer/src/roundScreens';
import {
  applyMatch, BONUS_OBJECTIVE_COUNT_PLACEHOLDER, defaultAccountStats, GAME_TYPE, matchHitPercent, RECORD_LAYOUT, roundsOf,
  secondsOfClock, uploadsAfter, YOUR_STATS_ORDER, yourStatsValues,
  type AccountStatsRecord, type MatchBlock, type MatchOutcome,
} from '../src/stats/accountStats';

/**
 * SVC-12a (web sprint 10; research 261 §1-§3; research 155 §1.1-§1.2): the career record's per-match fold, held to
 * `FUN_00225070` (D:L76584-76658 of `socom2_game.elf.decomp.c`) line by line, its caller's upload rule (`FUN_00223970`
 * D:L76078-76082, `FUN_003045b0` D:L204495-204507) and YOUR STATS' order (`FUN_00225a00` D:L76904-76925). Transcription
 * tests: a reading, not a measurement of the original running.
 */

const ZERO_BLOCK: MatchBlock = {
  headShots: 0, hits: 0, shots: 0, kills: 0, deaths: 0, suicides: 0, teamKills: 0, escorteesKilled: 0, escorteesBroughtOut: 0,
  primaryObjectives: 0, bonusObjectives: 0, bombsDefused: 0, bombsPlanted: 0, score: 0,
};

function outcome(over: Partial<Omit<MatchOutcome, 'block'>> = {}, block: Partial<MatchBlock> = {}): MatchOutcome {
  return {
    side: 'seal', spectator: false, gameType: GAME_TYPE.DEMOLITION, respawn: false, comeFromLan: false, clockMs: 0,
    roundsPlayed: 0, sealRoundWins: 0, terroristRoundWins: 0, ...over, block: { ...ZERO_BLOCK, ...block },
  };
}

const record = (over: Partial<AccountStatsRecord> = {}): AccountStatsRecord => ({ ...defaultAccountStats(), ...over });

describe('SVC-12a: the record and its widths (research 155 §1.1)', () => {
  it('lays every field at its offset and width', () => {
    expect(RECORD_LAYOUT.hitPercent).toEqual({ offset: 0x01, kind: 'bits', bit: 0, bits: 7 });
    expect(RECORD_LAYOUT.games).toEqual({ offset: 0x20, kind: 'bits', bit: 0, bits: 22 });
    expect(RECORD_LAYOUT.bonusObjectives).toEqual({ offset: 0x20, kind: 'bits', bit: 22, bits: 10 });
    const ints = (['rating', 'ladderPosition', 'roundsWon', 'roundsLost', 'kills'] as const).map((k) => RECORD_LAYOUT[k]);
    expect(ints).toEqual([0x04, 0x08, 0x14, 0x18, 0x1c].map((offset) => ({ offset, kind: 'int32' })));
    // SVC-12e (c): the minutes and the seconds are unsigned words (research 261 §11).
    expect([RECORD_LAYOUT.minutesOnline, RECORD_LAYOUT.secondsPlayed]).toEqual([{ offset: 0x0c, kind: 'u32' }, { offset: 0x10, kind: 'u32' }]);
    const shorts = (['hostagesRescued', 'vipsRescued', 'vipsKilled', 'deaths', 'suicides', 'bombsPlanted', 'bombsDefused', 'headShots'] as const)
      .map((k) => RECORD_LAYOUT[k]);
    expect(shorts).toEqual([0x24, 0x26, 0x28, 0x2a, 0x2c, 0x2e, 0x30, 0x32].map((offset) => ({ offset, kind: 'u16' })));
    expect([RECORD_LAYOUT.clanTag, RECORD_LAYOUT.clanName, RECORD_LAYOUT.hometown, RECORD_LAYOUT.description]).toEqual([
      { offset: 0x34, kind: 'text', size: 12 }, { offset: 0x40, kind: 'text', size: 32 },
      { offset: 0x60, kind: 'text', size: 63 }, { offset: 0x9f, kind: 'text', size: 66 },
    ]);
  });

  it('the default record: E, rating 1000, the gender bit, the rest zero (FUN_002f9ac0 D:L198207-198222)', () => {
    const r = defaultAccountStats(true);
    expect([r.version, r.rating, r.gender, r.games, r.hitPercent, r.kills]).toEqual([0x45, 1000, 1, 0, 0, 0]);
    expect(defaultAccountStats().gender).toBe(0);
  });
});

describe('SVC-12a: the hit percentage, a running mean (D:L76637-76641; the ratio D:L76064-76070)', () => {
  // [old %, games before, hits, shots, new %, why]
  const rows: [number, number, number, number, number, string][] = [
    [0, 0, 0, 0, 0, 'no shot: the ratio is 0.0 (D:L76064-76065)'],
    [0, 0, 1, 4, 25, 'the first match: its own percentage over 1'],
    [25, 1, 2, 4, 38, '(25 + 50) / 2 = 37.5, + 0.5, truncated: half goes up'],
    [0, 1, 1, 100, 1, '(0 + 1) / 2 = 0.5 -> 1'],
    [30, 2, 0, 0, 20, 'a match without a shot still counts a game: 60 / 3'],
    [1, 2, 0, 1, 1, '2 / 3 = 0.667 + 0.5 -> 1'],
    [0, 0, 3, 1, 44, 'the width: 300 & 0x7f (hits over shots; D:L76641\'s mask)'],
    [0, 0, 1, 200, 0, 'STATS_FOLD_ROUNDING_READING: 1 in 200 is 0 under chop (1 to nearest)'],
  ];
  it.each(rows)('old %i over %i games, %i/%i hits -> %i (%s)', (old, games, hits, shots, want) => {
    const r = applyMatch(record({ hitPercent: old, games }), outcome({}, { hits, shots }));
    expect(r.hitPercent).toBe(want);
  });

  /**
   * SVC-12e (research 261 §11): the modern UI tree's `statsRecord.ts` held its own fold of the hit percentage
   * (MU-12a's `foldHitPercent(old, gamesBefore, ratio)`), retired for `applyMatch`. Its vectors, moved whole, the ratio
   * given as the hits and shots that make it (`hitRatio`, D:L76064-76070): 0.25 is 1 / 4, `chopF32(57 / 200)` is 57 / 200,
   * 0.333 is 333 / 1000, 1 is 1 / 1, 0 is 0 / 1.
   */
  it.each<[number, number, number, number, number, string]>([
    [50, 1, 1, 4, 38, 'old 50 over 1 game, a ratio of 0.25'],
    [0, 0, 57, 200, 28, 'each float step toward zero (STATS_FOLD_ROUNDING_READING): 28, not 29'],
    [0, 0, 333, 1000, 33, 'a first game\'s ratio as is, rounded'],
    [0, 0, 1, 1, 100, 'a first game of every shot a hit'],
    [100, 3, 0, 1, 75, '300 / 4'],
  ])('statsRecord.ts\'s fold vector: old %i over %i games, %i/%i hits -> %i (%s)', (old, games, hits, shots, want) => {
    expect(applyMatch(record({ hitPercent: old, games }), outcome({}, { hits, shots })).hitPercent).toBe(want);
  });

  it('bit 7 kept apart from the mean (D:L76638)', () => {
    expect(applyMatch(record({ byte01Bit7: 1 }), outcome({}, { hits: 1, shots: 2 })).byte01Bit7).toBe(1);
  });

  it('matches YOUR STATS\' HIT % (the viewer\'s `hitPct`, the same expression at D:L76913)', () => {
    for (let shots = 0; shots <= 60; shots++) for (let hits = 0; hits <= shots; hits++) expect(matchHitPercent(hits, shots)).toBe(hitPct(hits, shots));
  });
});

describe('SVC-12a: the games count, 22 bits (D:L76637, D:L76652-76654)', () => {
  it('adds one a match', () => {
    expect(applyMatch(record({ games: 41 }), outcome()).games).toBe(42);
  });
  it('at 2^22 - 1 the mean divides by 2^22, and the count wraps to 0 (a 22-bit logical shift, no saturation)', () => {
    const r = applyMatch(record({ games: 2 ** 22 - 1, hitPercent: 50 }), outcome({}, { hits: 1, shots: 2 }));
    expect([r.games, r.hitPercent]).toEqual([0, 50]);
    // The next match's mean then starts over: (50 x 0 + 10) / 1.
    expect(applyMatch(r, outcome({}, { hits: 1, shots: 10 })).hitPercent).toBe(10);
  });
});

describe('SVC-12a: the three game-type shorts, ESCORT by side (D:L76619-76633)', () => {
  // [type, side, brought out (+0x1c), killed (+0x18), hostages, vips rescued, vips killed]
  const rows: [string, number, 'seal' | 'terrorist', number, number, number, number, number][] = [
    ['ESCORT SEAL: VIPs rescued += +0x1c (D:L76627-76628)', GAME_TYPE.ESCORT, 'seal', 2, 1, 0, 2, 0],
    ['ESCORT Terrorist: VIPs killed += +0x18 (D:L76622-76625)', GAME_TYPE.ESCORT, 'terrorist', 2, 1, 0, 0, 1],
    ['EXTRACTION SEAL: hostages += +0x1c (D:L76631-76632)', GAME_TYPE.EXTRACTION, 'seal', 3, 1, 3, 0, 0],
    ['EXTRACTION Terrorist: hostages += +0x1c, whatever the side', GAME_TYPE.EXTRACTION, 'terrorist', 3, 1, 3, 0, 0],
    ['DEMOLITION: hostages += +0x1c', GAME_TYPE.DEMOLITION, 'seal', 1, 2, 1, 0, 0],
  ];
  it.each(rows)('%s', (_, gameType, side, broughtOut, killed, hostages, vipsRescued, vipsKilled) => {
    const r = applyMatch(record(), outcome({ gameType, side }, { escorteesBroughtOut: broughtOut, escorteesKilled: killed }));
    expect([r.hostagesRescued, r.vipsRescued, r.vipsKilled]).toEqual([hostages, vipsRescued, vipsKilled]);
  });
});

describe('SVC-12a: the counters (D:L76614-76618, D:L76634-76636)', () => {
  // [field, block's value, old, new, why]
  const rows: [keyof AccountStatsRecord, Partial<MatchBlock>, number, number, string][] = [
    ['kills', { kills: 7 }, 10, 17, '+0x1c += +0x0c (D:L76614)'],
    ['kills', { kills: 0xffff }, 0, 65535, 'an unsigned short widened into the int32'],
    ['kills', { kills: 1 }, 0x7fffffff, -0x80000000, 'the int32 wraps'],
    ['deaths', { deaths: 3 }, 4, 7, '+0x2a += +0x12 (D:L76615)'],
    ['deaths', { deaths: 1 }, 0xffff, 0, 'a 16-bit sum wraps'],
    ['suicides', { suicides: 2 }, 1, 3, '+0x2c += +0x14 (D:L76616)'],
    ['bombsPlanted', { bombsPlanted: 2 }, 0, 2, '+0x2e += +0x38 (D:L76617)'],
    ['bombsDefused', { bombsDefused: 1 }, 5, 6, '+0x30 += +0x36 (D:L76618)'],
    ['headShots', { headShots: 4 }, 6, 10, '+0x32 += +0x00 (D:L76634)'],
    ['bonusObjectives', { bonusObjectives: 3 }, 500, 3, 'replaced, not added (D:L76635-76636)'],
    ['bonusObjectives', { bonusObjectives: 0x401 }, 0, 1, 'its low 10 bits (ELF 0x2251dc `andi 0x3ff`)'],
  ];
  it.each(rows)('%s: %j over %i -> %i (%s)', (field, block, old, want) => {
    expect(applyMatch(record({ [field]: old } as Partial<AccountStatsRecord>), outcome({}, block))[field]).toBe(want);
  });

  it('touches nothing the fold does not name: the rating, the position, the minutes, the team, the strings', () => {
    const before = record({ rating: 1003, ladderPosition: 2, minutesOnline: 12, team: 1, clanTag: 'TAG', hometown: 'X' });
    const after = applyMatch(before, outcome({ clockMs: 1000, roundsPlayed: 1, sealRoundWins: 1 }, { kills: 1, hits: 1, shots: 1 }));
    expect([after.rating, after.ladderPosition, after.minutesOnline, after.team, after.clanTag, after.hometown]).toEqual([1003, 2, 12, 1, 'TAG', 'X']);
    expect(before.kills).toBe(0);   // the input is not changed
  });

  it('BONUS_OBJECTIVE_COUNT_PLACEHOLDER is the count fed when no writer gives one', () => {
    expect(BONUS_OBJECTIVE_COUNT_PLACEHOLDER).toBe(0);
  });
});

describe('SVC-12a: seconds played (D:L76642-76649) and the rounds (FUN_00223970 D:L76009-76013, D:L76073-76077)', () => {
  it.each([
    [0, 0], [999, 0], [59_999, 59], [600_000, 600], [0xffffffff, 4_294_967],
  ])('a clock of %i ms adds %i s', (ms, s) => {
    expect(secondsOfClock(ms)).toBe(s);
    expect(applyMatch(record({ secondsPlayed: 10 }), outcome({ clockMs: ms })).secondsPlayed).toBe((10 + s) >>> 0);
  });

  it('SVC-12e (c): the sum is an unsigned 32-bit word, as its writer\'s conversion is (D:L76642-76649): past 2^31 it stays positive, past 2^32 it wraps', () => {
    expect(applyMatch(record({ secondsPlayed: 0x7fffffff }), outcome({ clockMs: 1000 })).secondsPlayed).toBe(0x80000000);
    expect(applyMatch(record({ secondsPlayed: 0xffffffff }), outcome({ clockMs: 2000 })).secondsPlayed).toBe(1);
  });

  it.each([
    ['seal', 6, 4, 1, 4, 1], ['terrorist', 6, 4, 1, 1, 4], ['seal', 6, 6, 0, 6, 0], ['terrorist', 5, 0, 0, 0, 0],
  ] as const)('%s, %i played, SEALs %i, Terrorists %i -> won %i, lost %i (drawn rounds are neither)', (side, played, seal, terr, won, lost) => {
    expect(roundsOf({ side, roundsPlayed: played, sealRoundWins: seal, terroristRoundWins: terr })).toEqual({ won, lost });
    const r = applyMatch(record({ roundsWon: 1, roundsLost: 2 }), outcome({ side, roundsPlayed: played, sealRoundWins: seal, terroristRoundWins: terr }));
    expect([r.roundsWon, r.roundsLost]).toEqual([1 + won, 2 + lost]);
  });
});

describe('SVC-12a: who is folded, and when it posts', () => {
  it('a spectator, or a player on no side, is not folded (D:L76610-76611)', () => {
    const before = record({ games: 3 });
    expect(applyMatch(before, outcome({ spectator: true }, { kills: 5 }))).toEqual(before);
    expect(applyMatch(before, outcome({ side: null }, { kills: 5 }))).toEqual(before);
  });

  it.each([
    [false, false, true], [true, false, false], [false, true, false], [true, true, false],
  ])('respawn %s, ComeFromLan %s -> uploads %s (D:L76080-76081; FUN_003045b0 D:L204495-204507)', (respawn, comeFromLan, want) => {
    expect(uploadsAfter({ respawn, comeFromLan })).toBe(want);
  });
});

describe('SVC-12a: YOUR STATS in FUN_00225a00\'s order (D:L76907-76923)', () => {
  it('prints nine counters of the match block in this order, under these captions', () => {
    expect(YOUR_STATS_ORDER.map((r) => [r.caption, r.offset])).toEqual([
      ['SCORE', 0x3c], ['KILLS', 0x0c], ['DEATHS', 0x12], ['HIT %', 0x44], ['HEAD SHOTS', 0x00],
      ['PRIMARY OBJECTIVES', 0x32], ['BONUS OBJECTIVES', 0x34], ['FRIENDLY KILLS', 0x16], ['SUICIDES', 0x14],
    ]);
    expect(YOUR_STATS_ORDER.map((r) => r.line)).toEqual([76907, 76909, 76911, 76913, 76915, 76917, 76919, 76921, 76923]);
  });

  it('research 155 §1.2\'s sample page (the recomp\'s A_hold32.png: six rounds won, no kill): 36, 0, 0, 0, 0, 6, 0, 0, 0', () => {
    expect(yourStatsValues({ ...ZERO_BLOCK, score: 36, primaryObjectives: 6 })).toEqual([36, 0, 0, 0, 0, 6, 0, 0, 0]);
    const r = applyMatch(defaultAccountStats(), outcome({ roundsPlayed: 6, sealRoundWins: 6 }, { score: 36, primaryObjectives: 6 }));
    expect([r.games, r.roundsWon, r.roundsLost, r.kills, r.rating]).toEqual([1, 6, 0, 0, 1000]);
  });
});
