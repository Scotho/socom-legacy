/**
 * SVC-12a (web sprint 10; research 261 §1-§3, research 155 §1.1-§1.3): the career stats record and what a match's end
 * adds to it, computed as the original's client computes it. Pure: no store, no socket, no clock -- the record's bytes
 * are SVC-12b's, its store and its write at a match's end SVC-12c's (W10.R1). The rating (+0x04) is not touched here:
 * it moves at every round's end (`FUN_002253c0`), SVC-13a's.
 *
 * Sources: the retail decompilation `socom2_game.elf.decomp.c` (`D:L<n>`), cited, never pasted; the ELF's instructions
 * of `FUN_00225070` read by address (0x2251d4-0x225398) where the decompiled text leaves a width or a precision open.
 *
 * - The fold: `FUN_00225070` (D:L76584-76658), called from the exit state's enter (`FUN_00223970` D:L76078-76082) once
 *   the game is over (net state 6), with respawn off (game +0xdc) and `ComeFromLan` 0 (`FUN_003045b0`
 *   D:L204495-204507) -- `uploadsAfter`.
 * - Its input is the local player's **match block** (actor +0x544; research 155 §1.2), the round blocks summed into it
 *   at every round's end (D:L76030-76063), and the hit ratio +0x588 set beside it (D:L76064-76070).
 * - Single-precision steps are rounded toward zero, as the EE's FPU rounds (research 111 §1.4's reading, transcribed as
 *   the viewer's `roundScreens.ts` transcribes it); `STATS_FOLD_ROUNDING_READING`.
 */

/** The game types (game +0x111; research 91 §11, S:0x3e5828-0x3e5850). Only ESCORT changes the fold. */
export const GAME_TYPE = { BREACH: 1, DEMOLITION: 2, ESCORT: 3, EXTRACTION: 4, SUPPRESSION: 5 } as const;

/** The record's version byte this client writes (`'E'`, `FUN_002f9ac0` D:L198209). */
export const RECORD_VERSION_E = 0x45;

/** The rating of a new record (`FUN_002f9ac0` D:L198210). */
export const DEFAULT_RATING = 1000;

/**
 * The career stats record (research 155 §1.1, R155.1-R155.2): the 0xe4-byte `'E'` record, field by field. Integers are
 * held at their width: an `int32` field as a signed 32-bit value, a `u32` field (the minutes and the seconds, SVC-12e) as
 * 0..2^32 - 1, a 16-bit field as 0..65535 (the fold loads it `lhu`,
 * ELF 0x2250ec-0x2250f8, and PLAYER INFO loads it `lhu` to print it, ELF 0x2f0aa4-0x2f0d14), a bit field as its unsigned
 * value. The strings are the session's, filled at each build (`FUN_002fab80`), carried here untouched.
 */
export interface AccountStatsRecord {
  /** +0x00, 1 byte: `'E'` (0x45). */
  version: number;
  /** +0x01 bits 0-6: HIT PERCENTAGE, the running mean over the games (D:L76637-76641; D:L192116). */
  hitPercent: number;
  /** +0x01 bit 7: the byte `DAT_0045a0c3` (not read; set at each build, D:L198524). */
  byte01Bit7: number;
  /** +0x02 bits 0-4: not read, carried. */
  byte02Low5: number;
  /** +0x02 bits 5-6: the team in the current game, 0 SEAL, 1 Terrorist, 2 neither (`FUN_002ef7f0` D:L191440-191452). */
  team: number;
  /** +0x02 bit 7: the account leads its clan (D:L198542-198547). */
  clanLeader: number;
  /** +0x03 bits 0-1: gender, bit 0 the valve `PLAYERGENDER` (D:L198213-198214). */
  gender: number;
  /** +0x03 bits 2-7: not read, carried. */
  byte03High6: number;
  /** +0x04, int32: the rating (SCORE:), 1000 new; every round's end (SVC-13a), never this fold. */
  rating: number;
  /** +0x08, int32: the ladder position last heard (LADDER POSITION:; D:L198555). */
  ladderPosition: number;
  /**
   * +0x0c, u32: minutes since the login (ONLINE:; D:L198525-198532). Unsigned, as its writer converts it (SVC-12e,
   * research 261 §11); ONLINE prints its bits `%d`, signed (D:L192022) -- the format's, not the field's.
   */
  minutesOnline: number;
  /**
   * +0x10, u32: seconds played (TOTAL PLAYING TIME:; D:L76642-76649). Unsigned, as the fold's conversion is and as
   * PLAYER INFO divides it (`divu`, ELF 0x2f0dc0; SVC-12e, research 261 §11).
   */
  secondsPlayed: number;
  /** +0x14, int32: rounds won (ROUNDS WON:; D:L76650). */
  roundsWon: number;
  /** +0x18, int32: rounds lost (ROUNDS LOST:; D:L76651). */
  roundsLost: number;
  /** +0x1c, int32: kills (KILLS:; D:L76614). */
  kills: number;
  /** +0x20 bits 0-21: games (TOTAL # OF GAMES:; D:L76652-76654). */
  games: number;
  /** +0x20 bits 22-31: bonus objectives (BONUS OBJECTIVES:), replaced by each match's (D:L76635-76636). */
  bonusObjectives: number;
  /** +0x24, 16 bits: hostages rescued, every type but ESCORT (D:L76631-76633). */
  hostagesRescued: number;
  /** +0x26, 16 bits: VIPs rescued, ESCORT as a SEAL (D:L76627-76628). */
  vipsRescued: number;
  /** +0x28, 16 bits: VIPs killed, ESCORT as a Terrorist (D:L76621-76625). */
  vipsKilled: number;
  /** +0x2a, 16 bits: deaths (D:L76615). */
  deaths: number;
  /** +0x2c, 16 bits: suicides (D:L76616). */
  suicides: number;
  /** +0x2e, 16 bits: bombs planted (D:L76617). */
  bombsPlanted: number;
  /** +0x30, 16 bits: bombs defused (D:L76618). */
  bombsDefused: number;
  /** +0x32, 16 bits: head shots (D:L76634). */
  headShots: number;
  /** +0x34, 12 bytes: the clan tag (D:L198534-198541). */
  clanTag: string;
  /** +0x40, 32 bytes: the clan's name (D:L198533). */
  clanName: string;
  /** +0x60, 63 bytes: the hometown (D:L198548-198554). */
  hometown: string;
  /** +0x9f, 66 bytes: the description (D:L182644; D:L198401-198402). */
  description: string;
}

/**
 * A field's place in the record: its byte offset and either a bit range or a byte size (research 155 §1.1). A 32-bit
 * word is `int32` (held signed) or `u32` (held unsigned, 0..2^32 - 1: the minutes and the seconds, SVC-12e).
 */
export type FieldPlace =
  | { offset: number; kind: 'int32' | 'u32' | 'u16' | 'u8' }
  | { offset: number; kind: 'bits'; bit: number; bits: number }
  | { offset: number; kind: 'text'; size: number };

/** Every field of `AccountStatsRecord` with its offset and width (research 155 §1.1); SVC-12b's codec reads it. */
export const RECORD_LAYOUT: { readonly [K in keyof AccountStatsRecord]: FieldPlace } = {
  version: { offset: 0x00, kind: 'u8' },
  hitPercent: { offset: 0x01, kind: 'bits', bit: 0, bits: 7 },
  byte01Bit7: { offset: 0x01, kind: 'bits', bit: 7, bits: 1 },
  byte02Low5: { offset: 0x02, kind: 'bits', bit: 0, bits: 5 },
  team: { offset: 0x02, kind: 'bits', bit: 5, bits: 2 },
  clanLeader: { offset: 0x02, kind: 'bits', bit: 7, bits: 1 },
  gender: { offset: 0x03, kind: 'bits', bit: 0, bits: 2 },
  byte03High6: { offset: 0x03, kind: 'bits', bit: 2, bits: 6 },
  rating: { offset: 0x04, kind: 'int32' },
  ladderPosition: { offset: 0x08, kind: 'int32' },
  minutesOnline: { offset: 0x0c, kind: 'u32' },
  secondsPlayed: { offset: 0x10, kind: 'u32' },
  roundsWon: { offset: 0x14, kind: 'int32' },
  roundsLost: { offset: 0x18, kind: 'int32' },
  kills: { offset: 0x1c, kind: 'int32' },
  games: { offset: 0x20, kind: 'bits', bit: 0, bits: 22 },
  bonusObjectives: { offset: 0x20, kind: 'bits', bit: 22, bits: 10 },
  hostagesRescued: { offset: 0x24, kind: 'u16' },
  vipsRescued: { offset: 0x26, kind: 'u16' },
  vipsKilled: { offset: 0x28, kind: 'u16' },
  deaths: { offset: 0x2a, kind: 'u16' },
  suicides: { offset: 0x2c, kind: 'u16' },
  bombsPlanted: { offset: 0x2e, kind: 'u16' },
  bombsDefused: { offset: 0x30, kind: 'u16' },
  headShots: { offset: 0x32, kind: 'u16' },
  clanTag: { offset: 0x34, kind: 'text', size: 12 },
  clanName: { offset: 0x40, kind: 'text', size: 32 },
  hometown: { offset: 0x60, kind: 'text', size: 63 },
  description: { offset: 0x9f, kind: 'text', size: 66 },
};

/**
 * STATS_DEFAULT_GENDER_PLACEHOLDER (research 261 §6, §11; SVC-12e): the default record's +0x03 bit 0 when the server
 * makes the default -- `false`, the valve read as 0, so the bit is 0. The original sets the bit when the **local**
 * console's valve `PLAYERGENDER` (S:0x3f5b40) is non-zero (D:L198213-198214); a server has no console, and which value
 * is which sex is not read; both s4 consoles carried 0. The one name of this unknown (the modern UI tree's
 * `statsRecord.ts` named it too, MU-12a; one name since SVC-12e). A caller that holds the valve passes it instead.
 */
export const STATS_DEFAULT_GENDER_PLACEHOLDER = false as boolean;

/**
 * The default record (`FUN_002f9ac0` D:L198207-198222): what any record but a known version parses to -- a new account's
 * 256 zero bytes among them (R155.1): `'E'`, rating 1000, the gender's bit 0 from `PLAYERGENDER`, everything else zero.
 */
export function defaultAccountStats(genderValve: boolean = STATS_DEFAULT_GENDER_PLACEHOLDER): AccountStatsRecord {
  return {
    version: RECORD_VERSION_E, hitPercent: 0, byte01Bit7: 0, byte02Low5: 0, team: 0, clanLeader: 0, gender: genderValve ? 1 : 0,
    byte03High6: 0, rating: DEFAULT_RATING, ladderPosition: 0, minutesOnline: 0, secondsPlayed: 0, roundsWon: 0, roundsLost: 0,
    kills: 0, games: 0, bonusObjectives: 0, hostagesRescued: 0, vipsRescued: 0, vipsKilled: 0, deaths: 0, suicides: 0,
    bombsPlanted: 0, bombsDefused: 0, headShots: 0, clanTag: '', clanName: '', hometown: '', description: '',
  };
}

/**
 * The match block (actor +0x544; research 155 §1.2), the counters the fold and YOUR STATS read, each a 16-bit counter
 * of the actor (summed as shorts, D:L76030-76063). What the room keeps today and what it does not: research 261 §2.
 */
export interface MatchBlock {
  /** +0x00 head shots. Fed by the caller; which hits the original counts is unread: `HEAD_SHOT_COUNT_PLACEHOLDER`. */
  headShots: number;
  /** +0x04 hits and +0x08 shots: the ratio +0x588 = hits / shots, 0 with no shot (D:L76064-76070). */
  hits: number;
  shots: number;
  /** +0x0c kills. */
  kills: number;
  /** +0x12 deaths. */
  deaths: number;
  /** +0x14 suicides. */
  suicides: number;
  /** +0x16 team kills (YOUR STATS' FRIENDLY KILLS; not in the record). */
  teamKills: number;
  /** +0x18 escortees killed. */
  escorteesKilled: number;
  /** +0x1c escortees brought out. */
  escorteesBroughtOut: number;
  /** +0x32 primary objectives (YOUR STATS; not in the record). */
  primaryObjectives: number;
  /** +0x34 bonus objectives. Fed by the caller; its writer is unread: `BONUS_OBJECTIVE_COUNT_PLACEHOLDER`. */
  bonusObjectives: number;
  /** +0x36 bombs defused. */
  bombsDefused: number;
  /** +0x38 bombs planted. */
  bombsPlanted: number;
  /** +0x3c the match score. */
  score: number;
}

/**
 * HEAD_SHOT_COUNT_PLACEHOLDER (research 155 §8, research 261 §6): which hits the block's +0x00 counts is not read (the
 * hit paths at D:L459528-459680; its writer `FUN_005459c0` D:L411756-411773). The fold takes `MatchBlock.headShots` as
 * given; the room's stand-in is its `headshots`, a kill whose fatal part is the head (room.ts `kill`, research 216 §5).
 */
export const HEAD_SHOT_COUNT_PLACEHOLDER = 'a kill by a head hit' as const;

/**
 * BONUS_OBJECTIVE_COUNT_PLACEHOLDER (research 155 §8, research 261 §1, §6): the block's +0x34 is, at least, the rounds'
 * sum of the round block's +0x3a (`FUN_00224d10` D:L76575, added at D:L76026-76029), whose own writer is not read. The
 * fold takes `MatchBlock.bonusObjectives` as given; the room's stand-in is its `bonusObjs`, ruled by PF.R34 (research
 * 214 §5). Without one, the count is this value.
 */
export const BONUS_OBJECTIVE_COUNT_PLACEHOLDER = 0;

/** A side of a game; `null` is neither (a spectator's, or no seat on a side). */
export type Side = 'seal' | 'terrorist';

/** What a match's end hands the fold (research 261 §2): the game's state and the local player's match block. */
export interface MatchOutcome {
  /** The local player's side (`FUN_002c31d0` SEAL / `FUN_002c30b0` Terrorist), or null on neither. */
  side: Side | null;
  /** The local player spectates (`FUN_002c2fd0`). */
  spectator: boolean;
  /** Game +0x111, `GAME_TYPE`. */
  gameType: number;
  /** Game +0xdc: respawn on. */
  respawn: boolean;
  /** The valve `ComeFromLan` (S:0x3f6328) is set: a LAN game. */
  comeFromLan: boolean;
  /** Game +0xf0: the game's clock total in milliseconds (an unsigned 32-bit count). */
  clockMs: number;
  /** Game +0x11c: rounds played; +0x120 / +0x124: the SEALs' and the Terrorists' round wins (research 91 §18). */
  roundsPlayed: number;
  sealRoundWins: number;
  terroristRoundWins: number;
  /** The local player's match block. */
  block: MatchBlock;
}

/**
 * STATS_FOLD_ROUNDING_READING: each single-precision step of the fold (`mul.s`, `add.s`, `div.s`, `cvt.s.w`; ELF
 * 0x2251f8-0x2252a8, 0x2252c8-0x22531c) is rounded toward zero, the EE FPU's rounding as research 111 §1.4 reads it
 * (PCSX2's default "Chop / Zero"); not measured on this function. Settled by a record whose hit percentage depends on
 * it (a match of 1 hit in 200 shots: 0 under chop, 1 to nearest) read back after a match on the local stack.
 */
export const STATS_FOLD_ROUNDING_READING = 'chop' as const;

const BOX = new Float32Array(1);
const BITS = new Uint32Array(BOX.buffer);

/** `x` to single precision rounded toward zero (`STATS_FOLD_ROUNDING_READING`). */
function f32(x: number): number {
  if (!Number.isFinite(x)) return Math.fround(x);
  const r = Math.fround(x);
  if (r === x || Math.abs(r) <= Math.abs(x)) return r;
  BOX[0] = r;
  BITS[0] = BITS[0]! - 1;   // one step toward zero, either sign
  return BOX[0]!;
}

/** An unsigned 32-bit integer to single precision as the compiler converts it (ELF 0x225220-0x225248: halved, odd bit kept, doubled). */
function u32ToF32(n: number): number {
  const u = n >>> 0;
  if (u < 0x80000000) return f32(u);
  const half = f32((u >>> 1) | (u & 1));
  return f32(half + half);
}

/** `cvt.w.s`: truncation toward zero. */
const toInt = (x: number): number => Math.trunc(x);
const u16 = (x: number): number => x & 0xffff;
const i32 = (x: number): number => x | 0;
const GAMES_MASK = 0x3fffff;   // 22 bits: `dsll32`/`dsrl32` by 10 (ELF 0x22537c-0x22538c)

/** The single-precision constants of the fold (ELF 0x2251a8 100.0, 0x2251b0 0.5, 0x2252f4-0x2252fc 0.001). */
const F100 = 100;
const FHALF = 0.5;
const F0001 = Math.fround(0.001);   // 0x3a83126f
const F2P31 = 2147483648;           // 0x4f000000

/** The ratio +0x588: hits / shots in single precision, 0.0 with no shot (`FUN_00223970` D:L76064-76070). */
export function hitRatio(hits: number, shots: number): number {
  const s = u16(shots);
  return s === 0 ? 0 : f32(f32(u16(hits)) / f32(s));
}

/** `(int)(+0x588 x 100.0 + 0.5)`: the match's hit percentage (the fold D:L76640; YOUR STATS D:L76913). */
export function matchHitPercent(hits: number, shots: number): number {
  return toInt(f32(f32(hitRatio(hits, shots) * F100) + FHALF));
}

/** The seconds the game's clock adds (D:L76642-76648): `ms x 0.001` in single precision, as an unsigned count. */
export function secondsOfClock(clockMs: number): number {
  const s = f32(F0001 * u32ToF32(clockMs));
  if (!(F2P31 <= s)) return toInt(s);
  return (toInt(f32(s - F2P31)) | 0x80000000) >>> 0;
}

/**
 * The rounds the fold adds (`FUN_00223970` D:L76009-76013, D:L76073-76077): won, my side's round wins (0 on neither);
 * lost, the rounds played less my side's wins and the drawn rounds (played less both sides' wins).
 */
export function roundsOf(o: Pick<MatchOutcome, 'side' | 'roundsPlayed' | 'sealRoundWins' | 'terroristRoundWins'>): { won: number; lost: number } {
  const drawn = i32(o.roundsPlayed - (o.sealRoundWins + o.terroristRoundWins));
  const won = o.side === 'seal' ? o.sealRoundWins : o.side === 'terrorist' ? o.terroristRoundWins : 0;
  return { won, lost: i32(o.roundsPlayed - (won + drawn)) };
}

/**
 * Whether the match's end folds the match into the record and posts it (`FUN_00223970` D:L76080-76081; research 155
 * R155.3): respawn off (game +0xdc 0) and not a LAN game (`FUN_003045b0` D:L204495-204507 false). The game being over
 * (net state 6, D:L76078) is the outcome's premise.
 */
export function uploadsAfter(o: Pick<MatchOutcome, 'respawn' | 'comeFromLan'>): boolean {
  return !o.respawn && !o.comeFromLan;
}

/**
 * The record after a match, as `FUN_00225070` folds it (D:L76609-76655). The caller has decided `uploadsAfter`; the
 * function's own test is a local player on a side who is no spectator (D:L76610-76611), else the record is returned as
 * it was. Field by field:
 *
 * - kills += block +0x0c, an unsigned short into the int32 (D:L76614);
 * - deaths, suicides, bombs planted, bombs defused, head shots += block +0x12, +0x14, +0x38, +0x36, +0x00, 16-bit sums
 *   (D:L76615-76618, D:L76634);
 * - ESCORT (game +0x111 = 3): a SEAL's VIPs rescued += +0x1c (D:L76627-76628), a Terrorist's VIPs killed += +0x18
 *   (D:L76621-76625); any other type: hostages rescued += +0x1c (D:L76631-76632);
 * - bonus objectives := block +0x34, its low 10 bits (D:L76635-76636; ELF 0x2251d4-0x2251e8 `lhu`, `andi 0x3ff`);
 * - hit percentage := `(int)((old x games + pct) / (games + 1) + 0.5) & 0x7f`, games the count before this match,
 *   pct `matchHitPercent`, in single precision (D:L76637-76641); bit 7 kept;
 * - seconds played += `secondsOfClock(game +0xf0)` (D:L76642-76649);
 * - rounds won += `roundsOf().won`, rounds lost += `roundsOf().lost` (D:L76650-76651);
 * - games := (games + 1) in 22 bits, wrapping to 0 past 2^22 - 1 (D:L76652-76654).
 */
export function applyMatch(record: AccountStatsRecord, o: MatchOutcome): AccountStatsRecord {
  if (o.spectator || o.side === null) return { ...record };
  const b = o.block;
  const next: AccountStatsRecord = { ...record };
  next.kills = i32(record.kills + u16(b.kills));
  next.deaths = u16(record.deaths + u16(b.deaths));
  next.suicides = u16(record.suicides + u16(b.suicides));
  next.bombsPlanted = u16(record.bombsPlanted + u16(b.bombsPlanted));
  next.bombsDefused = u16(record.bombsDefused + u16(b.bombsDefused));
  if (o.gameType === GAME_TYPE.ESCORT) {
    if (o.side === 'seal') next.vipsRescued = u16(record.vipsRescued + u16(b.escorteesBroughtOut));
    else next.vipsKilled = u16(record.vipsKilled + u16(b.escorteesKilled));
  } else {
    next.hostagesRescued = u16(record.hostagesRescued + u16(b.escorteesBroughtOut));
  }
  next.headShots = u16(record.headShots + u16(b.headShots));
  next.bonusObjectives = b.bonusObjectives & 0x3ff;

  const games = record.games & GAMES_MASK;
  const sum = (Math.imul(record.hitPercent & 0x7f, games) + matchHitPercent(b.hits, b.shots)) >>> 0;
  const mean = f32(u32ToF32(sum) / u32ToF32(games + 1));
  next.hitPercent = toInt(f32(FHALF + mean)) & 0x7f;

  next.secondsPlayed = (record.secondsPlayed + secondsOfClock(o.clockMs)) >>> 0;   // a u32 word (SVC-12e, research 261 §11)
  const rounds = roundsOf(o);
  next.roundsWon = i32(record.roundsWon + rounds.won);
  next.roundsLost = i32(record.roundsLost + rounds.lost);
  next.games = (games + 1) & GAMES_MASK;
  return next;
}

/**
 * YOUR STATS (`PlayerLbContents`, `FUN_00225a00` D:L76904-76925): the nine numbers of the match block GAME COMPLETE
 * prints, in its order, under the captions of `dlgMultiplayerFinalReally` (loc 2106-2108, 2116-2121; the viewer's
 * `ROUND_STRINGS`).
 */
export const YOUR_STATS_ORDER = [
  { caption: 'SCORE', offset: 0x3c, line: 76907 },
  { caption: 'KILLS', offset: 0x0c, line: 76909 },
  { caption: 'DEATHS', offset: 0x12, line: 76911 },
  { caption: 'HIT %', offset: 0x44, line: 76913 },
  { caption: 'HEAD SHOTS', offset: 0x00, line: 76915 },
  { caption: 'PRIMARY OBJECTIVES', offset: 0x32, line: 76917 },
  { caption: 'BONUS OBJECTIVES', offset: 0x34, line: 76919 },
  { caption: 'FRIENDLY KILLS', offset: 0x16, line: 76921 },
  { caption: 'SUICIDES', offset: 0x14, line: 76923 },
] as const;

/** The nine YOUR STATS values of a match block, in `YOUR_STATS_ORDER` (HIT % as `matchHitPercent`). */
export function yourStatsValues(b: MatchBlock): number[] {
  return [
    b.score, b.kills, b.deaths, matchHitPercent(b.hits, b.shots), b.headShots, b.primaryObjectives, b.bonusObjectives,
    b.teamKills, b.suicides,
  ];
}
