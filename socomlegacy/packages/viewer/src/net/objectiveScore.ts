/**
 * The objective events' scoring (web sprint 27 PF-14; socomlegacy/docs/research/214-demolition-as-built.md s5; research 192
 * s3.6 and s6.5, V3 claim 4) -- headless: the room applies it (`match/src/room.ts` `scoreObjective`).
 *
 * - The bomb-state switch (D:L163919-163947) scores its actor on each transition: state 3 (planted) `FUN_005455d0` +2
 *   (stat +0x38), state 4 (defused) `FUN_00545650` +2 (stat +0x36; BREACH also the primary objective +0x32), state 5
 *   (detonated) `FUN_00545750` +4 when the game type is 1 (BREACH), else +2 (stats +0x1a, +0x32) -- D:L411594-411655.
 * - `FUN_00545530`: an action record's own `points` (`MapAction.points`: Crossroads' switches and the access actions of
 *   MP6, MP11, MP61 Sujo, MP62 Enowapi, MP71, MP73, MP82, MP83, 2; Vigilance's carry none, 0), once a round -- the record's `+0x3f` bit 1 (`WorldState.actionUsed` / `markUsed`), cleared by
 *   `FUN_002b5510` -- from its three callers D:L160566, L160645, L160668.
 * - Each of them calls `FUN_00544d60(scorer, 1)` (D:L411236-411306): +1 to the game's team score (+0x7c SEALs, +0x80
 *   Terrorists) for every living player (+0xe1 bit 4) whose team word shares a bit with the scorer's, the scorer
 *   included (`teamCarry`).
 * - GAME COMPLETE's YOUR STATS reads primary objectives at +0x576 and bonus objectives at +0x578 (`FUN_00225a00`
 *   D:L76886-76933; research 216 s2); which event feeds which is `OBJECTIVE_STAT_KIND_READING` (`statKind`).
 */
import type { MapAction } from '../mapActions';

/**
 * An objective event the room scores: the bomb's three transitions (PF-14b, XR-05's), an action record's points, and --
 * HX-5 (research 239 s4) -- a hostage's rescue (`FUN_00545480`) and a hostage's kill (`FUN_00545390`).
 */
export type ObjectiveEvent =
  | { kind: 'plant' }
  | { kind: 'defuse' }
  | { kind: 'detonate' }
  | { kind: 'action'; points: number }
  | { kind: 'rescue' }
  | { kind: 'hostageKill'; killerTeam: 'seal' | 'terrorist' };

/** The game type ESCORT (`FUN_002c9540` D:L168877-168906): its hostage kill scores a Terrorist +3 (`FUN_00545390` D:L411530). */
const ESCORT = 3;

/**
 * HX-5 (research 239 s4; 190 C3): a hostage's kill costs its killer 2 (+0x3c -= 2) and counts escortees killed +1 (+0x18)
 * -- `FUN_00545390` D:L411524-411547; in ESCORT (type 3) a Terrorist killer gains 3 instead (D:L411530: `FUN_002c31d0`
 * false, `FUN_002c30b0` true -> +3), recorded here for MAP-08b; then `FUN_00544d60(killer, 0)`, a recount that adds no
 * carry. Nothing without a type-2 killer (the room's `WORLD_KILL_UNCOUNTED_READING`). [reading]
 */
export const HOSTAGE_KILL_SCORE_READING = -2;

/** The game type BREACH (`FUN_002c9540` D:L168877-168906; `@s2u/scene` `GAME_TYPE_BY_NAME`). */
const BREACH = 1;

/**
 * The bomb's points (D:L411594-411655): the plant `FUN_005455d0` +2, the defuse `FUN_00545650` +2, the detonation
 * `FUN_00545750` +4 in BREACH (game type 1), +2 otherwise.
 */
export const OBJECTIVE_POINTS = {
  plant: 2,
  defuse: 2,
  detonate: (gameType: number): number => (gameType === BREACH ? 4 : 2),
  /**
   * HX-5 (research 239 s4; 190 C4, C5): a rescue scores its last leader +3 (round block +0x3c) beside brought out +1
   * (+0x1c) -- `FUN_00545480` D:L411554-411572, only offline or for a SEAL leader (`FUN_002c31d0`), on the leader's own
   * console (the room scores once: research 239 s4's note on `KILL_SCORE_LOCAL_READING`).
   */
  rescue: 3,
} as const;

/** `FUN_00545530`: an action's points are its record's (`points`, 0 when the record gives none). */
export function actionPoints(record: Pick<MapAction, 'points'>): number {
  return record.points;
}

/** The points an objective event scores its actor, by the game's type (`OBJECTIVE_POINTS`, `actionPoints`). */
export function objectivePoints(event: ObjectiveEvent, gameType: number): number {
  switch (event.kind) {
    case 'plant': return OBJECTIVE_POINTS.plant;
    case 'defuse': return OBJECTIVE_POINTS.defuse;
    case 'detonate': return OBJECTIVE_POINTS.detonate(gameType);
    case 'action': return actionPoints(event);
    case 'rescue': return OBJECTIVE_POINTS.rescue;
    case 'hostageKill': return gameType === ESCORT && event.killerTeam === 'terrorist' ? 3 : HOSTAGE_KILL_SCORE_READING;
  }
}

/**
 * `FUN_00544d60(scorer, 1)` (D:L411236-411306): the team carry an objective adds to the scorer's side -- one for each
 * living player of that side, the scorer included when living (a dead one, the scorer too, adds none).
 */
export function teamCarry<T>(scorerTeam: T, players: Iterable<{ team: T; alive: boolean }>): number {
  let n = 0;
  for (const p of players) if (p.alive && p.team === scorerTeam) n++;
  return n;
}

/**
 * OBJECTIVE_STAT_KIND_READING (PF.R34; research 214 s5, 192 s3.6): which YOUR STATS line an event feeds. The detonation
 * writes +0x1a and +0x32 and BREACH's defuse +0x32 (read as the primary objective, +0x576 on the screen); the plant
 * (+0x38), DEMOLITION's defuse (+0x36) and an action's points (no stat traced in `FUN_00545530`) are read as bonus
 * objectives (+0x578). Which round-block offsets the screen's +0x576 / +0x578 total is not traced; owed a GAME COMPLETE
 * frame after a Crossroads match (capture B item 9).
 */
export const OBJECTIVE_STAT_KIND_READING = 'detonate-and-breach-defuse-primary' as const;

/** The game type DEMOLITION (`FUN_002c9540` D:L168877-168906). */
const DEMOLITION = 2;

/**
 * OBJECTIVE_TEAMMATE_CREDIT_READING (R4P-252; research 239 s4.5 and s8): online, the BREACH defuse (`FUN_00545650`,
 * its gate D:L411643, the actor's +0x32 D:L411644, the call D:L411645) and the BREACH or DEMOLITION detonation
 * (`FUN_00545750`, the types read D:L411671-411672, its gate D:L411689, +0x32 D:L411690, the call D:L411691) call
 * `FUN_00545d80` (D:L411914-411936), which visits every other player body (type 2, D:L411925; not the actor,
 * D:L411928) that is alive (+0xe1 bit 4, D:L411929) and shares a team bit with the actor (D:L411930). Its call on each
 * goes through member-pointer records the decompilation does not resolve, read off the ELF's data (review 1 of R4P-252,
 * r0001; r0004's twins the same but the type byte): 0x64fd58 and 0x64fd38 point at 0x00545890, which returns the body's
 * round block (+0x58c); 0x64fd68 points at `FUN_00545650` and 0x64fd48 at `FUN_00545750`. So each living teammate's
 * block gets the scoring method with a third argument of 1 -- its +0x32 += 1 branch (D:L411649, D:L411695), one primary
 * objective each; the direct callers pass 0 (D:L163922, D:L163934). Owed as confirmation: a GAME COMPLETE frame of a
 * living teammate after an online BREACH defuse (r0004). [reading]
 */
export const OBJECTIVE_TEAMMATE_CREDIT_READING =
  'each other living teammate +1 primary: the BREACH defuse, the BREACH or DEMOLITION detonation' as const;

/**
 * Whether an objective event credits the actor's living teammates a primary objective
 * (`OBJECTIVE_TEAMMATE_CREDIT_READING`): the defuse in BREACH, the detonation in BREACH or DEMOLITION.
 */
export function creditsTeammates(event: ObjectiveEvent, gameType: number): boolean {
  if (event.kind === 'defuse') return gameType === BREACH;
  if (event.kind === 'detonate') return gameType === BREACH || gameType === DEMOLITION;
  return false;
}

/**
 * BREACH_SEAL_TALLY_READING (LATER 1462; research 239 s4.5 and s8; reading, pending review): the SEALs' plant tally
 * BREACH's round-end arm reads. GetRoundResult `FUN_00224d10` runs once per console, for that console's local player
 * (its one call site D:L76026 in `FUN_00223970`, passing `FUN_002b3580`'s body; the result into that body's
 * +0x5be / +0x5c0, D:L76028-76029), and sums +0x5c4 (bombs planted, the round block +0x58c's +0x38) over that console's
 * own SEAL copies (D:L76527-76530). +0x5c4's only incrementing writer, `FUN_005455d0` (D:L411606-411613), writes only
 * offline (`DAT_0045a0c1` clear) or when the planter is the local player (`FUN_002b3580`); its caller, the bomb state
 * handler `FUN_002c1c30` state 3 (D:L163940-163947), runs on every console, the guard keeping the write local. No
 * message carries it: the per-player replicated state carries six other stats words (`FUN_002bd640` D:L162041-162047,
 * received `FUN_002be150` D:L162417-162440), the bomb object 0x14 bytes with no count (D:L164090-164096). So online a
 * console's tally is its own player's plants -- a Terrorist console's 0; offline the true count. Two independent reads
 * of r0001 agree (LATER 1462, reads 1 and 2, 2026-11-24); r0004 moves only the mode byte here (R4P-252's review). A
 * third read (atlas-maps, read 3) covers both exports and agrees: the round's bombs-planted tally (CSealStats +0x38 at
 * actor +0x58c); r0004's BombPlanted `FUN_00549ff0` D4:L451763-451780 (offline flag `DAT_0045d481`, local getter
 * `FUN_002b4f90`, its caller state 3 at D4:L172706), Reset `FUN_00549c20` at D4:L81939, RemoteRespawn `FUN_0059e690`
 * (r0001 `FUN_00598b90`: the actor's own block saved and restored), UpdateLocalSeal `FUN_002bf280` (r0001
 * `FUN_002bd640`: the six words, not +0x5c4). Three agreeing reads, no capture.
 * Would prove it: an r0004 capture of a Terrorist console's +0x5be after a BREACH round with a remote SEAL plant.
 * [reading]
 */
export const BREACH_SEAL_TALLY_READING = 'online, a console sums only its own player plants: a Terrorist console 0' as const;

/**
 * BREACH_JOINER_CREDIT_PLACEHOLDER (LATER 1462, the controller's ruling (A); research 239 s4.5 and s8): whether a
 * mid-round joiner on the Terrorist side takes BREACH's round-end +1. Every other Terrorist seat present at the round's
 * end does, alive or dead, a seat held away or passed by at the round's start, a bot, plant or not, whoever won -- the
 * three reads agree. For the joiner the plain reading of `FUN_00223970` credits him too (it takes the local body,
 * D:L76015, and calls GetRoundResult, D:L76026, with no ghost test between; the tally branch D:L76571-76573 has no
 * life test), but whether a joiner's console reaches that call is unread, so the port holds its earlier behaviour: no
 * credit (`false`). A true mid-round joiner is a seat seated after the round's start (`Player.seatedAt`, which a
 * takeover's kept row carries, `TAKEOVER_ROW_READING`: a reconnected seat is not one). Settled by IQ-176: an r0004
 * capture of a late joiner's YOUR STATS after a BREACH round. Replaces the retired reading of the seats it credits (s8).
 * [placeholder]
 */
export const BREACH_JOINER_CREDIT_PLACEHOLDER: boolean = false;

/** A seat as BREACH's arm reads it: its id, side, life (+0xe1 bit 4) and plants this round (+0x5c4). */
export type BreachSeat = { id: number; team: 'seal' | 'terrorist'; alive: boolean; roundPlanted: number };

/**
 * The SEALs' plants this round as the console of `viewer` sums them (`BREACH_SEAL_TALLY_READING`; D:L76527-76530):
 * offline every SEAL's; online only `viewer`'s own (a remote body's +0x5c4 is never written on his console).
 */
export function breachSealTally(viewer: number, players: Iterable<BreachSeat>, online: boolean): number {
  let n = 0;
  for (const q of players) if (q.team === 'seal' && (!online || q.id === viewer)) n += q.roundPlanted;
  return n;
}

/**
 * BREACH's arm of GetRoundResult (`FUN_00224d10` D:L76571-76573), as `p`'s own console computes it: a Terrorist
 * (`FUN_002c30b0`) only; +1 when alive with no SEAL alive (the living count, D:L76506-76530), or when his console's SEAL
 * plant tally (`breachSealTally`) is 0, alive or dead. A SEAL never.
 */
export function breachRoundCredit(p: BreachSeat, players: readonly BreachSeat[], online: boolean): boolean {
  if (p.team !== 'terrorist') return false;
  const sealsAlive = players.some((q) => q.team === 'seal' && q.alive);
  return (p.alive && !sealsAlive) || breachSealTally(p.id, players, online) === 0;
}

/**
 * ACTION_POINTS_ACTOR_READING (PF.R34; research 214 s5, 210 s8): who scores an action a destructible's death runs
 * (an access barrier's `accessN` -> `EXECUTE_ACTION set_accessN`, `points 2` on MP61 Sujo's six; Vigilance's carry none): the charge's owner (a blast's thrower), the
 * round's shooter; nobody when the owner left the room. `FUN_00545530`'s callers (D:L160566, L160645, L160668) take the
 * actor from the action message (research 193 s3: u16 actor), which a death's chain does not name; owed capture A.
 */
export const ACTION_POINTS_ACTOR_READING = 'charge-owner' as const;

/**
 * TEAM_SCORE_READING (research 214 s5, 192 s3.6 G26 / s3.13 G25): the team carry accumulates in the room's
 * `teamScore.seal` / `terrorist` (the game's +0x7c / +0x80), zeroed with the round, sent additively on `score.teamScore`
 * for the respawn result's compare (`success2`) only; nothing draws it this sprint, and the room's result does not read
 * it yet. When the game zeroes +0x7c / +0x80 is not traced.
 */
export const TEAM_SCORE_READING = 'per-round' as const;

/**
 * The YOUR STATS kind of an event (`OBJECTIVE_STAT_KIND_READING`): primary or bonus; HX-5's rescue and hostage kill are
 * neither (`'none'`) -- they write the round block's +0x1c (brought out) and +0x18 (escortees killed), which the room
 * counts apart (`hostagesRescued`, `escorteesKilled`), not +0x576 / +0x578.
 */
export function statKind(event: ObjectiveEvent, gameType: number): 'primary' | 'bonus' | 'none' {
  if (event.kind === 'rescue' || event.kind === 'hostageKill') return 'none';
  if (event.kind === 'detonate') return 'primary';
  if (event.kind === 'defuse' && gameType === BREACH) return 'primary';
  return 'bonus';
}

/**
 * HX-5 (research 239 s4; 190 C5): the rescue's team carry is the objectives' own -- `FUN_00545480` ends in
 * `FUN_00544d60(leader, 1)` (D:L411569), +1 to the leader's side for each living player sharing a team bit with it, the
 * leader included when alive (`teamCarry`); `TEAM_SCORE_READING` stands for when it is zeroed. [reading]
 */
export const TEAM_CARRY_RESCUE_READING = 'FUN_00544d60(leader, 1): teamCarry';

/**
 * Whether an event adds the team carry (`FUN_00544d60(scorer, 1)`): every objective but the hostage's kill, whose
 * `FUN_00544d60(killer, 0)` (D:L411545) only recounts the team scores and adds none (HX-5, research 239 s4).
 */
export function carriesTeam(event: ObjectiveEvent): boolean {
  return event.kind !== 'hostageKill';
}
