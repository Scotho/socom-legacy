import type { GameType } from '@s2u/scene';
import type { Rules, Team } from './protocol';

/**
 * The match's rules, shared by the server's room and the page (web sprint 3, classic mode; the owner's ruling of
 * 2026-09-29: every rule from the decompilation, the disc's scripts or reCOM, cited; what cannot be sourced is a named
 * placeholder). Sources: `analysis/socom2_game.elf.decomp.c` (`FUN_x Lnnn`), the disc's `MPxx.ZDB:MZANIM.ZAR`
 * animation `objectives` (read with `@s2u/scene` `parseAnimSets` / `decodeEffectProgram`; MP51's sequences cited, the
 * same in MP2, MP5, MP8, MP64, MP81), and socomlegacy/docs/research/91-the-round.md (sections 9, 12, 18).
 */

/**
 * OWNER_LAUNCH_COUNTDOWN_S (owner ruling, 2026-10-01): once a classic room waiting for both sides has a player on each,
 * a 10-second countdown runs before the match's first round starts, shown to every page in the HUD's clock and message
 * window; a side emptied during it puts the room back to waiting. The ARMORY may stay open through it, its choices
 * taken live (the room's requests outside a round are the ARMORY's). The original's lobby has the same shape -- the
 * launch clock `mp_x_sec_clock` (research 91 section 18, `FUN_002a7560` L149578-149586), which the lobby's scripts set to
 * 11 seconds (match `gameLobby.ts` `LAUNCH_COUNTDOWN_S_READING`, the game room's countdown), and its words "GAME STARTS
 * IN" n "SECONDS" (UIMnLOC 354-355, `countdownLine`) -- but a dedicated room has no lobby and no READY button, so the
 * length, 10 seconds, and its start (both sides seated) are the owner's. The solo room starts at once.
 */
export const OWNER_LAUNCH_COUNTDOWN_S = 10;

/** The countdown's line in the message window: the lobby's "GAME STARTS IN" n "SECONDS" (UIMnLOC 354-355). */
export function countdownLine(seconds: number): string {
  return `GAME STARTS IN ${Math.max(0, Math.ceil(seconds - 1e-9))} SECONDS`;
}

/** `mp_max_rounds`: the create-game default, 11 (frame `A_49_creategame`; 9 if the valve is 0 at load, `FUN_001f5e70` L55628-55631). */
export const MAX_ROUNDS = 11;

/**
 * Respawn's fixed CREATE GAME settings: `RUN/UIZANIM.ZAR` `dlgCreateGame.rdr` `set_respawn_valve` sets
 * `RTimeValve` 20 / `RCountValve` 1; `refresh_cg_screen` writes `mp_max_round_time` 1200 / `mp_max_rounds` 1.
 * Research 348 §1 (reading, pending review).
 */
export const RESPAWN_ROUND_SECONDS = 1200, RESPAWN_MAX_ROUNDS = 1;

/** `mp_half_rounds` = (`mp_max_rounds` + 1) >> 1 (`FUN_002a6c50` L149073): 6 of 11. */
export function halfRounds(maxRounds: number): number {
  return (maxRounds + 1) >> 1;
}

/**
 * Whether the round just scored ends the match (`mp_game_over`).
 * - respawn: the map script's `success2` sets `mp_game_over` = 1 unconditionally after the one timed round, a draw
 *   included (research 91 section 18.2.1).
 * - classic: the `objectives` sequence `game_over` (research 91 section 18.2.2): `end_of_round_round_count` =
 *   `mp_round_count` + 1 (the rounds played, this one counted); IF it is >= `mp_max_rounds`: over unless the round wins
 *   are level (then the sequence stops and a tiebreaker round is played); ELSEIF either side's wins >= `mp_half_rounds`:
 *   over.
 */
export function isMatchOver(rules: Rules, roundsPlayed: number, maxRounds: number, wins: { seal: number; terrorist: number }): boolean {
  if (rules === 'respawn') return true;
  if (roundsPlayed >= maxRounds) return wins.seal !== wins.terrorist;
  const half = halfRounds(maxRounds);
  return wins.seal >= half || wins.terrorist >= half;
}

/**
 * The round-start banner (`FUN_001fb420` L57633-57648): "STARTING ROUND %d OF %d" (0x3e3520) with `mp_round_count` + 1
 * and `mp_max_rounds`, or "PLAYING TIEBREAKER ROUND" (0x3e3540) when `mp_max_rounds` < `mp_round_count` + 1. The
 * function reads the room's round count under either ruleset: respawn's original CREATE GAME setting is 1
 * (`RESPAWN_MAX_ROUNDS`, research 348 §1), so its first banner reads "STARTING ROUND 1 OF 1".
 */
export function roundBanner(round: number, maxRounds: number): string {
  return maxRounds < round ? 'PLAYING TIEBREAKER ROUND' : `STARTING ROUND ${round} OF ${maxRounds}`;
}

/**
 * Classic's round clock (MP51 `objectives`): `start` waits 5 s then 10 s before its elimination loop, and
 * `mission_timer` waits 15 s before it watches `mp_timer`: neither ends a round in its first 15 s.
 */
export const ROUND_WATCH_S = 5 + 10;
/**
 * After an elimination: `start`'s WAIT 2 (the sound, then the music), `success` / `failure`'s WAIT 20, `round_count`
 * += 1 and `game_over`, WAIT 1, then `mission_complete` / `mission_failure` = 1 -- the round's end state, which the
 * engine reads 3 s later (`FUN_002a9b30` L150612-150672) as for any round.
 */
export const ELIMINATED_HOLD_S = 2 + 20 + 1;

/**
 * HX-1 (research 237 s3; 190 s4.2 C2's table, V2 claim 12): EXTRACTION's rescue win, `start`'s third branch
 * (`rescuecount >= 2 AND rescuecheck == 1`) -- WAIT 2, then "SEALS VICTORIOUS!" and `^PH_0014`, WAIT 2, then `success`'s
 * WAIT 20 and WAIT 1: 25 s from the decision to the round's end state (the engine's 3.0 s after it, `FUN_002a9b30`, are
 * the round screens' `ENGINE_READ_S`). Decoded twice (H2's listing, V2's raw `zanim_raw.py`, 190 s10.7). [reading]
 */
export const RESCUE_WIN_HOLD_READING = 2 + 2 + 20 + 1;

/**
 * HX-1 (research 237 s3; 190 C2, V2 claim 12): EXTRACTION's hostage-kill win, `start`'s fourth branch
 * (`mp_hostages_by_seals >= 2`) -- the branch's WAIT 2, then `failure`'s WAIT 20 and WAIT 1: 23 s, the same value as
 * MP6's elimination hold (`eliminatedHoldS('MP6')` = `ELIMINATED_HOLD_S`): one value, two branches. [reading]
 */
export const HOSTAGE_KILL_WIN_HOLD_READING = 2 + 20 + 1;

/**
 * HX-1 (research 237 s4; 190 C3, V2 claim 9): a hostage's death posts no kill line -- `FUN_00547860` (D:L412863-412909)
 * takes its `else` for an escortee victim and plays `FUN_005e7f20(victim, 0x44, 0)` (CMD_MP_HOSTAGE_KILLED, radio
 * chatter, `HOSTAGE_KILL_RADIO_PLACEHOLDER`) instead of the "%s fragged %s" line; the script's own two lines are HX-5's.
 * The page's `kill` case reads `victimKind: 'hostage'` and posts nothing. [reading]
 */
export const HOSTAGE_KILL_LINE_READING = 'none';

/**
 * The maps whose `start` has no WAIT after its 10 s guard -- none in its elimination branches: the line and the music
 * at once, then `success` / `failure`'s WAIT 20 and WAIT 1 -- 20 + 1 s.
 * - Research 176 (WT-101) §3 counts the commands of the SUPPRESSION maps: `start` is 76 long on Frostfire (MP2),
 *   Abandoned (MP5) and Shadow Falls (MP64), and 82 on Rat's Nest (MP8), Vigilance (MP51) and Chain Reaction (MP81) --
 *   the six more being the WAIT 2 of each perspective's two outcome branches (research 124 §5 shows the same WAIT,
 *   read off the disc by `roundCues.ts`; 124 §11, research 192 §2.2).
 * - The PF-11 review recounted `start` on all 22 maps (2026-10-04, `parseAnimSets` / `decodeEffectProgram`): the VIP
 *   maps MP52, MP53, MP82 wait only 5, 2, 10 and the breach maps MP61, MP62, MP73 only 5, 10 -- no WAIT after the guard,
 *   so 20 + 1 s as well. Every other map waits 2 in each outcome branch; `success` / `failure` are WAIT 20, WAIT 1 on all 22.
 */
const NO_RESULT_WAIT = new Set(['MP2', 'MP5', 'MP52', 'MP53', 'MP61', 'MP62', 'MP64', 'MP73', 'MP82']);

/**
 * The hold for a map that is not one of the disc's 22 (one built by hand, a test's): no script of its own is read, so
 * it takes MP51's, `ELIMINATED_HOLD_S`, the value the room held on every map before PF-11. Not a game value.
 */
export const ELIMINATED_HOLD_UNREAD_MAP_S = ELIMINATED_HOLD_S;

/** The disc's 22 multiplayer maps (`RUN/MP*.ZDB`), whose `start` the PF-11 recount read. */
const DISC_MAPS = new Set(['MP1', 'MP2', 'MP5', 'MP6', 'MP7', 'MP8', 'MP9', 'MP10', 'MP11', 'MP12', 'MP51', 'MP52', 'MP53',
  'MP61', 'MP62', 'MP64', 'MP71', 'MP72', 'MP73', 'MP81', 'MP82', 'MP83']);

/**
 * The hold from an elimination to the round's end state on the map `stem` (PF-11; owner's H95 default: the original's):
 * 20 + 1 s on the nine maps of `NO_RESULT_WAIT`, `ELIMINATED_HOLD_S` (2 + 20 + 1) on the other 13 of the disc's 22
 * (research 176 §3 and the PF-11 review's recount), `ELIMINATED_HOLD_UNREAD_MAP_S` on any other stem.
 */
export function eliminatedHoldS(stem: string): number {
  const s = stem.toUpperCase();
  if (NO_RESULT_WAIT.has(s)) return 20 + 1;
  return DISC_MAPS.has(s) ? ELIMINATED_HOLD_S : ELIMINATED_HOLD_UNREAD_MAP_S;
}

/**
 * [reading, pending review] LATER 126: ESCORT's SEAL elimination's hold on the host's console, a SEAL's
 * (`ELIMINATION_PERSPECTIVE_READING`): `start`'s Terrorists-eliminated branch only sets `mp_winner = 0` (MP52 @888, MP53
 * @888, MP82 @868); `escort_success` leaves its WHILE, WAIT 2 (MP52 @7208), `mp_score00 += 1`, WAIT 5 (@7268), and calls
 * `success`: WAIT 20 (@7436), WAIT 1 (@7472) -- 2 + 5 + 20 + 1 = 28 s, the extraction's path from `escort_success` on
 * (`ESCORT_RESCUE_HOLD_READING`). The Terrorists' elimination calls `failure` at once: `eliminatedHoldS`.
 */
export const ESCORT_ELIMINATION_HOLD_READING = 2 + 5 + 20 + 1;

/**
 * [reading, pending review] LATER 127: ESCORT's time-out win's hold: `mission_timer` at 00:00 sets `mp_winner = 0`
 * (MP52 @7036, MP53 @7116, MP82 @6448); `escort_success` posts its two lines, WAIT 2, the music, WAIT 5, then a SEAL host's
 * `success` 20 + 1 -- 28 s.
 */
export const ESCORT_TIMEOUT_HOLD_READING = 2 + 5 + 20 + 1;

/**
 * [reading, pending review] LATER 138: BREACH's time-out win's hold: `mission_timer` sets `mp_winner = 8` (MP61 @6488,
 * MP62 and MP73 @5900); `breach_success` posts ^*PT_0021 and its two lines, WAIT 2 (MP61 @6684), the music, then by
 * `player_team` a SEAL host's `CALL_SEQUENCE failure` (@6768) -- 20 + 1 -- 23 s (a Terrorist host's `success`: the same).
 * Its elimination and defuse holds stay the room's 21 and 24 s: the second `CALL_SEQUENCE failure` finds the first
 * running and leaves it (`FUN_00269b00` D:L114714-114760 skips a sequence whose state is 2, 3 or 4).
 */
export const BREACH_TIMEOUT_HOLD_READING = 2 + 20 + 1;

/** LATER 127 / 138: the hold of a game type's time-out win -- ESCORT's and BREACH's; null where it is a draw (`abort`). */
export function timeoutHoldS(type: GameType): number | null {
  return type === 3 ? ESCORT_TIMEOUT_HOLD_READING : type === 1 ? BREACH_TIMEOUT_HOLD_READING : null;
}

/**
 * Who an elimination makes the winner (MP51 `objectives` sequence `start`, its WHILE loop): `aiteam_08` == 0 (no living
 * Terrorists) is tested first, so the SEALs win it -- also when both sides fell together; then `aiteam_00` == 0 (no
 * living SEALs): the Terrorists. Null while both have a living player.
 */
export function eliminationWinner(living: { seal: number; terrorist: number }, seated?: { seal: number; terrorist: number }): Team | null {
  // `seated` (the room's single-player match, SOLO_ROUND_PLACEHOLDER): a side with nobody on it is never eliminated.
  if (living.terrorist === 0 && (!seated || seated.terrorist > 0)) return 'seal';
  if (living.seal === 0 && (!seated || seated.seal > 0)) return 'terrorist';
  return null;
}

/**
 * The two MESSAGE lines the elimination posts (MP51 `objectives` `start`; `mp51LOC` 5103-5106): the side eliminated
 * at 0.7, the winner at 0.9 (research 91 section 18.2.3). TAUNT-WRAP (research 87 §14.1): each carries its script scale
 * as `post` (`FUN_00267760` D:L113376 posts it), so the message window measures it at that x 1.1429 (D:L157986).
 */
export function eliminationLines(winner: Team): { text: string; scale: number; post: number }[] {
  const line = (text: string, scale: number) => ({ text, scale, post: scale });
  return winner === 'seal'
    ? [line('ALL TERRORISTS ELIMINATED', 0.7), line('SEALS VICTORIOUS!', 0.9)]
    : [line('ALL SEALS ELIMINATED', 0.7), line('TERRORISTS WIN!', 0.9)];
}

export { GAME_TYPE_BY_NAME, type GameType } from '@s2u/scene';

/**
 * PF-12 (web sprint 26; research 192 s2.1, 179 s9.8, 210 s1): what a game type's `objectives` script does with the
 * round's clock. Every map of a type waits and ends the same way (the 22 maps' scripts read, 179 s9.8's table):
 * - `eliminationWatchS`: `start`'s waits before its elimination loop, by the console's `player_team` -- 5 + 10 on
 *   SUPPRESSION and BREACH, 3 + 10 on DEMOLITION; ESCORT and EXTRACTION's SEAL branch waits 2 s more between its two
 *   objective lines (5 + 2 + 10), the Terrorists' does not.
 * - `timerWatchS`: `mission_timer`'s WAIT before it watches `mp_timer` -- 15 (SUPPRESSION, DEMOLITION, EXTRACTION) or 5
 *   (ESCORT, BREACH).
 * - `timeoutWinner`: `mission_timer` at 00:00 -- `abort` (`mp_winner` 99, a draw) on SUPPRESSION, DEMOLITION and
 *   EXTRACTION; `mp_winner = 0` (`escort_success`, MP52 `mission_timer` @6964) on ESCORT; `mp_winner = 8`
 *   (`breach_success`, MP61 @6416/6488; research 174 s2) on BREACH.
 * - `plantedStopsClock`: the bomb modes' `switch_timer` stops `start` and `mission_timer` once `mp_bomb` is 3 (planted;
 *   research 171 s7) -- the hook only: the bomb itself is XR-05's.
 */
export interface ModeRules {
  eliminationWatchS: { seal: number; terrorist: number };
  timerWatchS: number;
  timeoutWinner: Team | null;
  plantedStopsClock: boolean;
}

const MODE_RULES: Readonly<Record<1 | 2 | 3 | 4 | 5, ModeRules>> = {
  1: { eliminationWatchS: { seal: 5 + 10, terrorist: 5 + 10 }, timerWatchS: 5, timeoutWinner: 'terrorist', plantedStopsClock: true },
  2: { eliminationWatchS: { seal: 3 + 10, terrorist: 3 + 10 }, timerWatchS: 15, timeoutWinner: null, plantedStopsClock: true },
  3: { eliminationWatchS: { seal: 5 + 2 + 10, terrorist: 5 + 10 }, timerWatchS: 5, timeoutWinner: 'seal', plantedStopsClock: false },
  4: { eliminationWatchS: { seal: 5 + 2 + 10, terrorist: 5 + 10 }, timerWatchS: 15, timeoutWinner: null, plantedStopsClock: false },
  5: { eliminationWatchS: { seal: 5 + 10, terrorist: 5 + 10 }, timerWatchS: 15, timeoutWinner: null, plantedStopsClock: false },
};

/**
 * A game type's rules. Type 0 (a TYPE `FUN_002c9540` does not know, or a map off the list) plays SUPPRESSION's -- the
 * classic rules every room ran before the types were read.
 */
export function modeRules(type: GameType): ModeRules {
  const r = MODE_RULES[type === 0 ? 5 : type];
  return { ...r, eliminationWatchS: { ...r.eliminationWatchS } };
}

/**
 * LATER 153 (research 192 §2.2): a map off the mission list (game type 0: a test's flat map, an archive the list does not
 * name; a forge room takes its base archive's type) keeps the room's respawn choice. The original never sees such a map -- its respawn is SUPPRESSION's alone,
 * `FUN_002a7560` D:L149405-149431 -- and the port plays SUPPRESSION's rules there (`modeRules`), so this is the port's
 * own adaptation, not a reading.
 */
export const RESPAWN_TYPE0_KEEPS_CHOICE_ADAPTATION = true;

/**
 * LATER 153 (research 192 §2.2): the rules a room plays for the rules it was asked -- respawn is SUPPRESSION's alone
 * (`FUN_002a7560` D:L149405-149431: the `Respawn` valve only with the host option and game type 5), so respawn asked on
 * another read type plays classic; type 0 keeps the asked rules (`RESPAWN_TYPE0_KEEPS_CHOICE_ADAPTATION`). The room's
 * constructor and the server's replay header both take it (its review's finding 1), so a recording never claims rules
 * the room did not play; the server keys its rooms by it too (LATER 212), and the page its standing room (LATER 229, `connectHost.ts` `roomKeyOf`).
 */
export function playedRules(rules: Rules, gameType: number | undefined): Rules {
  const type = gameType ?? 0;
  if (rules !== 'respawn' || type === 5 || (type === 0 && RESPAWN_TYPE0_KEEPS_CHOICE_ADAPTATION)) return rules;
  return 'classic';
}

/** A map's game type off the parsed `missionlist.rdr` (`@s2u/scene` `parseMissionList`), by its archive's stem; 0 off the list. */
export function gameTypeOf(stem: string, list: ReadonlyMap<string, { type: GameType }>): GameType {
  return list.get(stem.toUpperCase())?.type ?? 0;
}

/**
 * Whose `start` the round's elimination waits on where the two sides' scripts differ (ESCORT, EXTRACTION: 17 s on a SEAL
 * console, 15 on a Terrorist's). The round's result is read from the master's valves (`FUN_002a9b30` D:L150612-150672),
 * so the master's script governs: the host, a SEAL by default (research 91 s7) -- 17 s. [reading: research 192 s2.1's
 * perspective note is BELIEVED; owed, a capture of the first elimination on Desert Glory with a Terrorist host; the
 * controller's ruling PF.R16, 2026-10-04]
 */
export const ELIMINATION_PERSPECTIVE_READING = 'host';

/** The room's elimination watch for a mode: the host's script's (`ELIMINATION_PERSPECTIVE_READING`), a SEAL's. */
export function eliminationWatchS(rules: ModeRules): number {
  return rules.eliminationWatchS.seal;
}

/**
 * The cycle's next (research 91 section 12; `FUN_001f97b0` L57000-57007 "cycle through living teammates"), as the walk
 * `FUN_00547170` takes it (DEAD-CYCLE, LATER 79; research 314 §5.6): it starts at the slot of the camera's bound actor
 * (`FUN_0029f180` on the camera's +0xbc, D:L412637 -- the object's +8, -1 for none, D:L145045-145048), steps up a slot at
 * a time (D:L412663), wraps past the list's end to slot 0 (D:L412646-412648, D:L412664-412667), never tests its start
 * (the loop ends on coming back to it, D:L412672) and binds the first candidate it meets, none when it meets none
 * (D:L412674). The slots are the seat ids in order (`../spectatorView` SPECTATOR_CYCLE_ORDER_READING): the next of
 * `candidates` after `current`'s place in id order -- `current` a candidate or not (a dead or departed body still bound)
 * -- wrapping, never `current` itself; from before the first when `current` is null; null with no other candidate.
 * (Was: from the first when `current` was no longer a candidate, and `current` again when it was the only one.)
 */
export function nextFollow(current: number | null, candidates: readonly number[]): number | null {
  const ids = candidates.filter((id) => id !== current).sort((a, b) => a - b);
  if (!ids.length) return null;
  if (current === null) return ids[0]!;
  return ids.find((id) => id > current) ?? ids[0]!;
}
