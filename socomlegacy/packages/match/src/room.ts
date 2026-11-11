import { probeGround, SEAL_TUNING, selectFloor } from '@s2u/scene';
import { stanceBody, type MoverActionName } from '../../viewer/src/mover';
import { victoryEligibility, type VictoryEligibility } from '../../viewer/src/victory';
import { chooseVictory } from '../../viewer/src/victoryData';
import { playedRules, RESPAWN_MAX_ROUNDS, RESPAWN_ROUND_SECONDS } from '../../viewer/src/net/rules';   // LATER 229: the constructor's own call
import { oneShotSeconds } from '../../viewer/src/locomotion';
import { TauntRequests } from '../../viewer/src/taunts';
import { CommunicationRequests, tacticalAllowed } from '../../viewer/src/communications';
import {
  actorToWorldDir, actorToWorldPoint, AN_M8, applyPicks, armoryTypeAllowed, backblastAxis, BOUNCE_LIFT, DEFAULT_ARMORY_TYPE, CLAYMORE, CLAYMORE_RULES, claymoreCone, countsTowardClaymoreLimit, GAME_FRAME_DT, GameFrameAccumulator, gridCast, HE, ITEM, itemClass, launchGrenade, M67, MARK141,
  materialTable, maxThrowDistance, maxThrowSpeed, PISTOL_HAND_ANIMS, proximityTripped, releaseSeconds, segmentHit, SOILS, stepGrenade, THROW_AIM_CLAMP, THROW_ANIMS,
  throwAnim, throwClipSeconds, throwVelocity, UNITS_PER_METRE, CHARGE_HIT_RADIUS_PLACEHOLDER, raySphere, surfaceMaterial, volatileQueues,
  type Grenade, type HullCast, type HullHit, type KitTable, type Loadout, type Pick, type SpawnSlot, type ThrowableRecord, type WeaponRecord, type WorldPoly,
} from '@s2u/scene';
import { blastLine } from '../../viewer/src/sceneHealth';
import { apply4 } from '../../viewer/src/doorMath';
import { C4_KIT_TIMER_SECONDS } from '../../viewer/src/throwCommit';
import { holdFamily, holdOf,
  applyFall, applyHit, bodyOf, fallKills, bulletDamage, DAMAGE_SCALE, quantiseHit, fragmentCount, fragmentDamage, fragmentPart, decodeCommands, encodeSnapshot, feetOriginOf, Frame, frameKind, freshHealth, groundPolygons, isDead, Lobby,
  ACTION_TYPE_CODES, actionAtPick, bareMeta, CraneSet, cranePressSlack, DoorSet, doorInReach, doorPick, GateSet, openDoorClip, type DoorActor, LOOK_KIT_LEAD_PLACEHOLDER, lookContextOf, lookScaleOf, looserLookContext, MoverSim, OPEN_LOOK_CONTEXT, ROOM_SKIP_EFFECTS_READING, under, WorldState, overall, ringFor, roundPath, shortTurn, Traversal, Walker, wrapYaw, type MagazineRing,
  fallDamageFraction, KNOCK_LANDING_SPEED_FACTOR, MP_HEALTH, PART, type Landing, decodeVoiceUp, encodeVoiceDown,
  healthTold, PART_HEALTH_INTERVAL_TICKS_READING, partHealthBytes,
  BUILT_AT_PATTERN, Button, HOLD_SHIFT, STANCE_CODES, isSessionToken, MAX_LOADOUT_PICKS, MAX_REWIND_MS, REWIND_CEILING_MS_ADAPTATION, INTERP_DELAY_MS, PROTOCOL_VERSION, SESSION_REPLACED_CLOSE, SNAPSHOT_HZ, TICK_HZ,
  eliminatedHoldS, eliminationWatchS, eliminationWinner, ESCORT_ELIMINATION_HOLD_READING, isMatchOver, MAX_ROUNDS, modeRules, OWNER_LAUNCH_COUNTDOWN_S, timeoutHoldS, type Rules,
  EYE_HEIGHT, HEAD_EYE_WALL_BACK_PLACEHOLDER, headEye, localCamera, rootY, toWorld, probeLiftOf, headPoint, reloadHoldPeriod, reloadLockSeconds, reloadMoving, reloadSeconds, ShotCone, lookFitsPoint,
  ROOT_POSE_SLACK_PLACEHOLDER, SEAL_ANIMS, type AimFrame, aimRoot,
  BAKED_LOADOUT, kitRecords, typeLoadout, type SimKits,
  afterShotLock, isCarrier, KitRounds, pelletDamage, pelletsOf, reloadDelayOf, reloadFamily, roundFits, shotgunPellets,
  backblastReaches, c4InReach, c4Line, plantPickFrom, craneActionMiss, craneSurfaceOffRay, C4_PLANT_SECONDS, C4_REFUSED_MATERIAL, C4_START_EYE_FEET_PLACEHOLDER, C4_START_EYE_TICKS_PLACEHOLDER, equipmentKind, equipmentSlotsOf, type EquipmentSlots, EQUIPMENT_SLOTS, LAUNCHER_BODY_READING, wadingDepth, launcherLowerSeconds, launcherRaiseSeconds, rocketRoundOf, serverNameOf, type CraneActionMiss,
  LAUNCHER_RAISE_CLIPS, LAUNCHER_SET_MOVES_READING, playedOutCommand,
  launcherBaseCommand, launcherClipName, launcherMovingLowerCommands, launcherMovingLowerSeconds, launcherStickLowers, SCOPED_STICK, type LauncherUp, type HoldPass,
  isPushedClip, type PushedClip,
  type BodyState, type ClientEvent, type EnvWire, type LookContext, type Command, type ExtraSurface, type Health, type KillHow, type LobbyChange,
  type LoadoutRefusal, type Member, type PlaySnapshot, type RoomPhase, type ScoreRow, type ServerEvent, type SimClips, type SimMap, type SimSkeleton, type Team,
} from '../../viewer/src/sim';
import { fourthArmoryTypeOpen } from '@s2u/scene';
import { readProfile, type ArmoryProfile } from '../../viewer/src/armoryState';
import { equipmentLimit, equipmentLimitKit, equipmentLimitValves } from '../../viewer/src/equipmentLimit';
import { firearmSlotPresent, heldWeaponModels, initialFirearmSlot } from '../../viewer/src/loadout';
import { WEAPON_LINE_BOTS_READING } from '../../viewer/src/weaponLine';
import { roundStartAdmits, startLines, startWalled, type StartAdmits } from '../../viewer/src/net/startLine';   // LATER 366 (OT.R80): the start lines, one source
import { detonationOf } from '../../viewer/src/smoke';
import { bodyRecords, bodyVolumes, NO_PART, placedVolumes, rayBody, rayRecords, stanceVolumes, type BoneBox, type HitBody as PlacedBody, type StanceVolumes, type V3 } from '../../viewer/src/net/hitVolumes';
import { HIT_POSE_MOUNT_READING, HitPoser } from '../../viewer/src/net/hitPose';
import { corpseShownS, deathCause, deathClip, DEATH_CAUSE, flinchBodyOf, flinchClip, flinchRefused, VOICE_GATE_S } from '../../viewer/src/net/deaths';
import { applyKnock, blastExposed, blastFlashLevel, BLAST_RING_SECONDS, blastSeen, BLAST_RING_VOLUME, KNOCK_COVER_RELOAD_READING, KNOCK_LETHAL_IN_MOVE_READING, mountFallRefuses, mountPop, releaseMove, resolveBlast, type Knock } from '../../viewer/src/net/blast';
import { CHARGE_GROUND_SLACK_PLACEHOLDER, chargeRests } from '../../viewer/src/net/placing';
import { combatHealthSummary } from '../../viewer/src/net/combatHealth';
import { fireAllowed, fireCapability } from '../../viewer/src/net/fireCapability';
import { fastestWait, fireCycleTicks, FIRE_GATE_NONE, scheduleAfter, scheduleOpen } from '../../viewer/src/net/fireGate';   // LATER 588 (a)
import { actionGateWhy } from '../../viewer/src/net/actionGate';
import { reloadCutAt, reloadCutOf, reloadEnded, reloadLifeSpec, type ReloadLifeSpec } from '../../viewer/src/reloadLock';
import { fallCovers, flinchOnTop, landingPops, stillClipClock, stillClipCuttable, stillClipFlight, stillClipSeconds, type StillClipClock } from '../../viewer/src/stillReloadLife';
import { CLIMB_RELOAD_REFUSED_READING, climbHoldsBody } from '../../viewer/src/traversal';
import { flinchCommands, flinchCovered, flinchCutAt, flinchLanded, pushedWindow } from '../../viewer/src/net/flinchReload';
import { netRefills } from '../../viewer/src/net/netRefill';
import { versionRefusalText } from '@s2u/ui';
import { netCapLive, netCapRefuses } from '../../viewer/src/net/netCap';
import { resultHoldS } from '../../viewer/src/net/objective';
import { BombAuthority, type BombActor, type PlantAim } from './bomb';
import type { PlantPick } from '../../viewer/src/net/objective';
import { allMapsSwitch } from './botGates';
import { ExtractionAuthority, HOSTAGE_ID_BASE, PENALTY_MINUTE_READING, rescuedRefuses, type Hostage, type HostageKillInfo, type HostagePast } from './extraction';
import { SEAL_TEAM_MASK, TERRORIST_TEAM_MASK } from './hostageAi';
import { crosshairPick, pickSurfaces, ORDER_PICK_REACH_READING, type PickBody } from './hostageOrders';
import type { CombatReport, DecidedWire, JoinResultWire, JoinWire, MatchStats, TurretMags, TurretWireYaw } from '../../viewer/src/net/protocol';
import { SEAT_HOLD_MS_ADAPTATION } from '../../viewer/src/net/protocol';
import { LookGate, type LookGateMode } from '../../viewer/src/net/lookGate';
import { joinWire } from './joinState';
import { guarded } from './shotgunGuard';
import { bodyApplications, walkOrder } from './bodyWalk';
import { WorldDrops } from './worldDrops';
import { channelOf, hears, VoiceFloor, VOICE_CHANNEL_MAP_READING, VOICE_LATE_JOINER_READING, type VoiceAsk } from './voiceFloor';
import type { RoomRecorder } from './replay/recorder';
import type { ReplayRefusal } from './replay/format';
import { objectiveFields, type RoomRuleHost, type RuleEventInput, type RulePlayer, type RuleRoom, type RulesWire } from './creator/rules';   // FCW-31 (RULES_ADAPTATION)
import { LIMB_SPILL_PIERCING } from '../../viewer/src/net/damage';
import { actionPoints, carriesTeam, objectivePoints, statKind, teamCarry, type ObjectiveEvent } from '../../viewer/src/net/objectiveScore';
import { PITCH_HARD } from '../../viewer/src/look';
import { canMount, clampAim, gunLine, holdStep, mountClipOf, mountShape, MOUNT_WORD_BOUND_TICKS, muzzleAt, ReleaseTravel, SeatSteer, TURRET_RELEASE_WAIT_TICKS, TURRET_RETICLE_STANCE_READING, turretPour, turretReloadCountdown } from '../../viewer/src/net/emplacement';
import type { TurretPlacement } from '@s2u/scene';
import { noticeHeldAt, type KeptNotice } from './noticeHold';      // LATER 261: the host's restart notice, held for a welcome
import { botProfiler } from './bots/botProfile';   // BOP-1: the bot profiler (an instrument; null unless S2U_BOT_PROFILE=1)
import {
  arrivalBucket, freshSignals, noteCentring, roundResultOf, shownLeadBucket, shownMissOf, type HandOver, type MatchId, type RoomMatchResult, type RoomMatchSeat, type RoomRatingSeat, type RoundSignals,
  type SeatSignals, rewindAgeBucket, rttSummary, type RewindClass, rewindClassOf, type RewindRay, RTT_SAMPLES_MAX_ADAPTATION,
} from './stats/roomResults';

/**
 * One map's match (web sprint 3, M3/M6; rulings W3.R8-R13): the lobby, every player's mover run from its command
 * stream at the game's 60 Hz, the rounds on the original's clock, the game's damage, deaths, respawns, kills and
 * scores, and a snapshot to each client at 30 Hz. It knows nothing of sockets: a `Conn` sends frames, and the server
 * (`./server`) feeds it what arrives, so the tests drive it tick by tick.
 */

/**
 * A body the hit volumes are built from (`SimSkeleton`, or the page's own skeleton and idles in the loopback); LEAN-HIT:
 * `leans`, its lean clips (absent: a held peek is hit at the idle). HIT-POSE (research 217 s3.6): `motion`, the clips and
 * the table its live skeleton is posed with each tick (`../../viewer/src/net/hitPose`); absent (the loopback's bodies, a
 * disc without `motion.rdr`), the idle sets.
 */
export type HitBody = {
  skeleton: SimSkeleton['skeleton']; idles: SimSkeleton['idles']; leans?: SimSkeleton['leans']; character?: SimSkeleton['character'];
  motion?: SimSkeleton['motion'];
};
/**
 * Each side's hit bodies (2026-09-30), per character type since web sprint 5 S2: a list is the side's types in
 * `chartype.rdr` order (index 0 SEAL 1 / TERRORIST 1, R95.5; null for one that did not read), a single body stands for
 * every type of its side; null, that side has none.
 */
export interface TeamHitBodies {
  seal: HitBody | readonly (HitBody | null)[] | null; terrorist: HitBody | readonly (HitBody | null)[] | null;
  /**
   * HX-2 (web sprint 31; research 238 §1): the map's hostages' hit bodies, `chartype.rdr`'s `escortees` in order, each at
   * the No_weapon set's idles (`../../viewer/src/simMap` `TypeSkeletons.escortees`); absent or empty on a map with none.
   */
  escortees?: readonly (HitBody | null)[];
}

export interface Conn {
  /** Trusted in-process controller only. This is never read from a client event. */
  cpu?: true;
  send(frame: Uint8Array | string): void;
  close(code: number, reason: string): void;
  /**
   * SVC-20b-relay (W20.R7; constraint 7): a voice frame, skipped -- never queued, never a close -- once the socket's
   * backlog is past `VOICE_BACKLOG_SKIP_PLACEHOLDER` (`server.ts`, `limits.ts` `sendLossy`). Absent (the page's loopback,
   * a test's fake): the voice goes by `send`. VOICE-LATE (research 226 §3.2): its answer, when it gives one, is counted --
   * a 'skipped' frame is the room's `voice_skip` (`takeVoiceDrops`).
   */
  sendLossy?(frame: Uint8Array): 'sent' | 'skipped' | void;
}

/**
 * VOICE-LATE-3 (research 226 §3.3): one talker's voice frames at the relay (`Room.voiceCounts`). `received`: every voice
 * frame his connection sent; of them `bad` (malformed, no voice seat, or past `VOICE_FRAME_BYTES_MAX_PLACEHOLDER`),
 * `bucket` (past his `VOICE_FRAMES_PER_S_PLACEHOLDER` bucket), `floor` (not the holder of his channel's floor entry:
 * dropped, and counted nowhere before this), `relayed` (sent on to every member that hears him); and what the relayed
 * ones made: `sends`, one a listener the frame went to, and `skipped`, one a listener whose socket held past
 * `VOICE_BACKLOG_SKIP_PLACEHOLDER` (VOICE-LATE's `voice_skip`). A playtest instrument, no original.
 */
export interface VoiceTalkerCounts { received: number; bad: number; bucket: number; floor: number; relayed: number; sends: number; skipped: number }

/** SVC-12c (research 261 §5): a seated player's line of `RoundOverReport` -- its side and its match counters (PF-26, PF-14, HX-5). */
export interface RoundOverSeat {
  id: number; team: Team; kills: number; deaths: number; score: number; stats: MatchStats;
  /**
   * Its kills this round (`Player.roundKills`: counted with `kills` at the kill, zeroed by `startRound` before the round's
   * first kill, carried with the row by a takeover, TAKEOVER_ROW_READING) -- the results' round kills (research 264 §2).
   * Read only in a report: between an abandon or a match reset and the next `startRound` it still holds the last round's
   * while `kills` is 0, and no report is made in that gap. `kills` less the last round's is not one: a takeover's new seat
   * id carries the match's kills (game 3350, 2026-11-03).
   */
  roundKills: number;
}
/**
 * SVC-12c (research 261 §2, §5): what a round's end tells `RoomOptions.onRoundOver` -- the rounds played and each side's
 * wins (game +0x11c, +0x120, +0x124), the game over (net state 6), respawn (game +0xdc), the game type (+0x111), the
 * round's clock in ms (+0xe8, `MATCH_CLOCK_TOTAL_READING`) and every seated player's counters.
 */
export interface RoundOverReport {
  round: number; matchOver: boolean; respawn: boolean; gameType: number; wins: { seal: number; terrorist: number }; roundMs: number;
  seats: RoundOverSeat[];
  /**
   * SVC-12d (W22.R1; research 264 §1, research 155 §4.1-§4.2): the results handed over -- the round's `RoomRoundResult`,
   * or at the match's end its `RoomMatchResult` then the last round's -- only in a room whose every seat is an account
   * (`RoomOptions.handOver`); absent otherwise (a map's room, a guest's seat). The receiver only enqueues them.
   */
  results?: HandOver[];
  /** SVC-12d: each seat's round signals for SVC-23b (research 169 §4.2), read-outs only; the round's length is `roundMs`. */
  signals?: SeatSignals[];
  /** SVC-12d: the round a leave emptied a side of, reported before the abandon (research 169 §4.2); never `matchOver`. */
  emptied?: boolean;
}

/**
 * NCW-1: one seat of `Room.takeRewind` -- its rounds by `class:bucket`, its newest raw round trip and its smoothed ping;
 * NCW-17: with the lead buckets of its rounds that carried a displayed tick, and its misses at the claim, when any.
 */
export interface RewindTakeSeat {
  rounds: Record<string, number>; rttMs: number | null; ping: number | null;
  shownLead?: Record<string, number>; shownMiss?: number;
}

/** IP3 (`RoomOptions.onLoadEvent`): one step of the launch's load hold, ticks at `TICK_HZ`. */
export type RoomLoadEvent =
  | { kind: 'hold'; tick: number; seats: number[]; ceilingTicks: number }
  | { kind: 'loaded'; seat: number; tick: number; sinceHold: number | null; counted: boolean; pending: number }
  | { kind: 'passed'; tick: number; sinceHold: number; by: 'all' | 'ceiling'; waiting: number[] };

export interface RoomOptions {
  /**
   * NCW-1 (B-count; an instrument's switch, no original): false turns the rewind-outcome instrument off -- no second
   * read of a round at its `viewTick`, no `signals.rewind`, nothing for `takeRewind`. On by default; the scored round is
   * the same either way (`test/rewindOutcome.test.ts` pins it).
   */
  rewindOutcome?: boolean;
  /** Authored bot extension (FBA): trusted controller work before the ordinary tick/round spawn. */
  beforeStep?: () => void;
  beforeRoundStart?: (newMatch: boolean) => void;
  /** Extra queued human places reserved only for replacing current bots; spectators retain their own limit. */
  botReplacementSlots?: () => Partial<Record<Team, number>>;
  /** Server-owned bot lobby adaptation: choose a fresh human's side at the actual hello, not ticket admission. */
  humanJoinSide?: () => Team | undefined;
  /** Milliseconds now (the idle kick's clock). */
  now: () => number;
  random: () => number;
  /** W3.R13: the idle kick, held to 3-5 minutes. */
  idleKickMs: number;
  /** CREATE GAME's round length: classic 6 minutes, respawn 20 (research 348 §1). Tests may explicitly shorten it. */
  roundSeconds: number;
  /**
   * `mp_max_rounds`: classic's create-game default 11 (`MAX_ROUNDS`), respawn's 1 (`RESPAWN_MAX_ROUNDS`), also
   * carried to every page for its round-start banner (research 348 §1).
   */
  maxRounds: number;
  /** CREATE GAME's trusted EQlimit (GameStats byte 5); research 362 §2. Absent: unrestricted. */
  eqLimit?: number;
  /** The room's rules: `respawn` (W3.R11) or `classic` (respawn off, the create-game default). */
  rules: Rules;
  /**
   * The page's single-player match (`../../viewer/src/net/loopback`, offline): the one player is the host, a SEAL
   * (`FUN_002c5450` L166238-166262); no idle kick; classic's round starts with one side seated and runs to its clock,
   * a side with nobody on it never eliminated (SOLO_ROUND_PLACEHOLDER: the game launches only with both sides seated,
   * `FUN_002c3cf0` L165325-165352, so it has no one-player round of its own).
   */
  solo?: boolean;
  /**
   * RB-2 (the replay batch; OT.R114, RB.R4, RB.R6 -- a BROWSER ADAPTATION, no original): the look gate the room's movers
   * run (`../../viewer/src/net/lookGate` `LookGateMode`). Absent or 'law': the law (CTL.R2), every server room's. 'free':
   * the page's own offline room only (`solo`, `LoopbackMatch`), where keyboard and mouse are allowed -- a room that is
   * not `solo` runs the law whatever it is given (`roomLookGateMode`). A server room never passes it (a source pin,
   * `viewer/test/lookTuners.test.ts`).
   */
  lookRate?: LookGateMode;
  /**
   * FG-21 (the forge's NPCs, a browser adaptation): the page's own room only (`solo`) -- a seat the page names joins that
   * side (the forge's NPC seats, on the terrorist side); absent, or undefined for a seat, 'seal' as the solo room always
   * seated it. A server room never passes it.
   */
  soloSide?: (id: number) => Team | undefined;
  /**
   * The page's own room only (`solo`): the developer's kit (`&kit=`, `../../viewer/src/loadout` `PlayerLoadout.devKit`)
   * standing in for the page's player's character type's own, else null for the type's -- what the player spawns with
   * and what its `loadout` picks are replayed from. A network room never reads it: its kits are its own (W4.R6).
   */
  soloKit?: () => Loadout | null;
  /**
   * The launch countdown, seconds (`OWNER_LAUNCH_COUNTDOWN_S`, the owner's ruling of 2026-10-01): a classic room waiting
   * for both sides starts its first round this long after both are seated. The solo room has none.
   */
  launchCountdownS: number;
  /**
   * The match server's name, as its operator configured it (`SERVER_NAME`): the welcome's `server`, the ARMORY title
   * bar's `MEDIUS_LOBBY_NAME` (`serverNameOf`; ARMORY_SERVER_NAME_READING, "LOCAL" when unset).
   */
  serverName?: string;
  /**
   * The combat report (INT.R5, research 127): a PLAYTEST INSTRUMENT WITH NO ORIGINAL, off unless set (the server's
   * `COMBAT_REPORT=1`; the LAN playtest tool turns it on). On, the room tells the attacker and the target of each hit it
   * lays, and the requester of each miss and refused request, friendly fire's too (`Room.combat`); it changes
   * nothing the room does. Off, no `combat` event is ever sent.
   */
  combatReport?: boolean;
  /**
   * LCM-6a (the live cards plan; a product-track OBSERVER, no original -- the match record's assists and damage): told
   * (attacker, target, health taken) once per applied hit from an enemy that took health -- `combat`'s `lastHurt`
   * condition, health only, never armour -- after the room has written it. Its return is ignored and a throw dropped:
   * the room does the same with it absent (`test/roomCombatObserver.test.ts`). Absent: nothing.
   */
  onCombatApplied?: (attackerId: number, targetId: number, healthTaken: number) => void;
  /**
   * A development build's disc check (a browser adaptation, no original): told when a crane press is dropped `missed`,
   * with the room's faces at that tick (`craneActionMiss`). Absent, the room records nothing and the press is unchanged.
   */
  onActionMiss?: (detail: CraneActionMiss) => void;
  /**
   * PF-22 (research 219 s1; 192 G12-G13): the create-game FRIENDLY FIRE switch (`mp_friendly_fire`, `DAT_0044cdb8`; in
   * game bit 0x20 of the game-state byte `+0x19`, research 206 s1.1 V3), off by default ("Friendly Fire is disabled.",
   * W3.R11). Read only by `ffRefuses`. Its wire (the create-game row to the room) is the online lane's (ONL-13).
   */
  allowFriendlyFire?: boolean;
  /**
   * SVC-07a, a game's room (research 159 §2, §5; respawn too, research 350 §1): waits for its game lobby's launch
   * (`launch`, the bridge's, from `gameLobby.ts`) instead of starting its own countdown once both sides are seated, and kicks no one
   * idle while it waits (the original has no idle kick, V22, and the pages show the game lobby and send no commands);
   * its idle clock waits too, until round 1 starts.
   */
  heldLaunch?: boolean;
  /** SVC-07a: the seats' names are their accounts' (the server's, at the hello): a `name` event renames nothing. */
  fixedNames?: boolean;
  /**
   * CPS cell-alive (product track, a dev-only switch of the live perf cell; `./cellSeat.ts`, `S2U_CELL_DEATHLESS_SEAT`):
   * the one player, by the name the room keys its members by (`lobby.member(id).name` -- the hello's, a game's account
   * name), whose health no hit, blast or fall reduces and who is never killed by one. The hit is still resolved, told
   * (`hurt`, the combat report) and knocks as before. Absent (every room but the cell's): damage as before.
   */
  deathlessSeat?: string;
  /** SVC-07a: the game's limits, the players (its IN MAX) and the watchers (its spectator slots); the defaults else. */
  maxPlayers?: number;
  maxSpectators?: number;
  /**
   * FG-29 (web sprint 19, W19.R6; a product-track adaptation): a forge-made room's per-side limit -- OT.R52's forge
   * only (the owner's word 2026-10-14, "agreed on forge only cap"), passed by the forge's own rooms and by no other
   * caller (not the bridge, not the game's lobby path, not the test room). Absent, the `Lobby`'s default: the
   * original's 8 a side (`TEAM_SIZE`; `FUN_002bc620` D:L161357-161388, research 308 §4.2).
   */
  teamSize?: number;
  /** SVC-07a: told at each round's start (the bridge reports the game active at the first). */
  onRoundStart?: (round: number) => void;
  /** SVC-07a: told when the match is abandoned, a side left empty (`abandon`): the bridge ends the game or reopens its lobby. */
  onAbandon?: () => void;
  /**
   * ONL-20b (research 309 R309.1): told when a held room's full game has ended and the room is back in its lobby
   * (`returnToLobby`), before any of it is sent: the bridge reopens the game's lobby. Absent: nothing.
   */
  onMatchReturn?: () => void;
  /**
   * OBF-4 (OBF.R4, the owner 2026-10-30; a service adaptation with no original): asked when a held room's full game has
   * ended, once GAME COMPLETE's hold is over, before the return to its lobby (`returnToLobby`). True: the caller has closed
   * the room (its host's update pending, `MatchGame.updatePending`) and the return is not made; false or absent: the
   * return as before. Never asked while a round is played or between rounds.
   */
  closeAtMatchEnd?: () => boolean;
  /**
   * SVC-12c (W10.R1; research 261 §5): told at every round's end, as the original's MP exit state is entered at every
   * round's end and tests the game over inside (`FUN_00223970` D:L76078-76082): the bridge's game rooms hand it to the
   * results queue (SVC-12d's `results`; SVC-07's consumer, `stats/results.ts`, folds the match at the game over). Absent: nothing.
   */
  onRoundOver?: (report: RoundOverReport) => void;
  /**
   * SVC-23e (research 264 section 4): told the seat a passed team vote removes, as `applyVotes` removes it (the seat
   * still the room's): the bridge's game rooms have the lobby answer that account's later JoinGame to the game -972
   * (`RoomService.banFromGame`), as the original's server refuses the removed player's rejoin (`FUN_002edba0`
   * D:L190430). Not told for VOTE ALL's eject (no BanSelfFromGame on that path). Absent: nothing.
   */
  onRemoved?: (seat: number) => void;
  /**
   * SVC-12d (research 264 §1): a game made through the game list -- the room's id (the game's) for the match's id, and
   * the account each seat names now (null: none). Set (the bridge's game rooms), the reports carry the results when
   * every seat names an account; absent (the maps' rooms), never.
   */
  handOver?: { roomId: number; accountOf(seat: number): number | null };
  /**
   * ONL-18b (web research 221): the load barrier's ceiling, seconds. Set (the bridge's game rooms, its
   * `LOAD_BARRIER_TIMEOUT_PLACEHOLDER`), the launch holds round 1 until every seated non-spectator has sent `loaded` --
   * the original's host barrier (`FUN_002c4020` D:L165414-165441, waited on by `FUN_001f5e70` D:L55689-55707; research
   * 179 §6.22) -- or this long has passed. Absent (the dedicated and test rooms): round 1 starts at the launch.
   */
  loadBarrierS?: number;
  /** ONL-18b: told when the launch begins the load barrier's hold (the bridge reports the game launched from it). */
  onLoadHold?: () => void;
  /**
   * IP3 (card bbXnSJNH; a measurement instrument with no original, product track): each step of the launch's load hold
   * told -- the hold, each seat's first `loaded` since it began (counted or not, with its ticks after the hold began;
   * none before a hold, no repeat: a bot sends one every step) and the barrier's pass (every seat in, or the ceiling,
   * with the seats it did not wait for). The game's process logs them. Absent: nothing is
   * built; the room's frames are the same either way.
   */
  onLoadEvent?: (e: RoomLoadEvent) => void;
  /**
   * PT-02 (web sprint 33; spec 4.1; research 240 §4): the replay recorder, a playtest and replay instrument with no
   * original (REPLAY_ADAPTATION). Additive (PT.R2): told the omniscient snapshot (`snapshots`), each broadcast
   * (`broadcast`), the lobby's members after a change (`broadcastChanges`) and, when it has `command`, each command the
   * room runs (`aim`, W33.R1); the room's bytes to its connections are the same with it on or off. Absent: nothing.
   */
  recorder?: RoomRecorder;
  /**
   * FCW-31 (`./creator/rules`; RULES_ADAPTATION, a browser adaptation with no original): the creator rules host -- the page's
   * own room only until S5 (`onlineCreatorLayoutRefusal` refuses a rules pack online). Told the room's outcomes as typed
   * events (`ruleEvent`) and each step's end. Absent: no event is built, and no outcome path changes.
   */
  ruleHost?: RoomRuleHost;
}

// LATER 229: LATER 153's rule lives beside the page's own rules (`../../viewer/src/net/rules`), so the page keys its
// standing room by it too (`connectHost.ts` `roomKeyOf`) -- one implementation; re-exported here for its importers.
export { playedRules, RESPAWN_TYPE0_KEEPS_CHOICE_ADAPTATION } from '../../viewer/src/net/rules';

/**
 * RB-2 (`RoomOptions.lookRate`; RB.R4, RB.R6 -- a browser adaptation): the gate a room's movers run -- 'free' only for the
 * page's own room (`solo`) that asks for it, the law for every other room whatever it is given.
 */
export function roomLookGateMode(opts: { solo?: boolean; lookRate?: LookGateMode }): LookGateMode {
  return opts.solo && opts.lookRate === 'free' ? 'free' : 'law';
}

export const DEFAULT_OPTIONS: RoomOptions = {
  // Classic's CREATE GAME defaults; the constructor selects respawn's original clock/count after `playedRules`.
  now: () => Date.now(), random: Math.random, idleKickMs: 4 * 60_000, roundSeconds: 6 * 60, maxRounds: MAX_ROUNDS, rules: 'respawn',
  launchCountdownS: OWNER_LAUNCH_COUNTDOWN_S,
};

/** W3.R13: the idle kick's bounds (the owner's "3-5 minute kick timer"). */
export const IDLE_KICK_MIN_MS = 3 * 60_000, IDLE_KICK_MAX_MS = 5 * 60_000;

/**
 * IDLE_KICK_ADAPTATION (the online-parity sweep's RS-5; P33, a label: nothing here changes what a room does): the idle
 * kick is a network room's alone -- a seat with no activity (a stick, a button or a look on its commands, an accepted
 * kit change) for `idleKickMs` (W3.R13, the owner's 3-5 minutes, `IDLE_KICK_MIN_MS`-`IDLE_KICK_MAX_MS`) is moved to the
 * back of the queue when someone waits, else closed; a watcher heard from for none of it is closed (`idle`). The original
 * kicks no one for idling: no idle or lag kick, only the team vote at ROUND COMPLETE (research 91 section 17.2, "Idle /
 * inactivity kick"; research 186/187); W3.R13 kept when H90 asked (the three-maps plan's owner row 6: "the idle kick
 * stays as ruled"). A game's room counts it from round 1, not in its lobby's wait (OT.R41, the owner's answer, the
 * online-path plan's "Keep it from round 1"); the page's own room (`solo`) has none, as the original. Research 101 section 3, B13.
 */
export const IDLE_KICK_ADAPTATION = 'network-room' as const;

/**
 * DEDICATED_NEXT_MATCH_ADAPTATION (the online-parity sweep's RS-6; P33, a label: nothing here changes what a room
 * does): once GAME COMPLETE's hold ends, a room with no game lobby -- a dedicated (standing) room and the page's own
 * (`solo`) -- starts its next match on the same map at once (`clock` -> `startRound(true)`), where a held game returns to
 * its lobby (ONL-20b and RSP-4: `returnToLobby`, research 309 R309.1/R309.3, research 350 section 2). The original has no
 * game without a lobby: every game's host returns to it (`call_gamelobby`, WAIT 10, `return_to_gamelobby`; research 309
 * section 7.1). Kept as built by ONL-20b ("unheld dedicated rooms continue"; research 192 G23); research 101 section 3,
 * B14.
 */
export const DEDICATED_NEXT_MATCH_ADAPTATION = 'next-match' as const;

/** Research 91 section 4.1: the respawn press counts from 5 s dead, once the body has faded (1 -> 0 at 0.1/s: 10 s). */
export const RESPAWN_PRESS_S = 5, RESPAWN_FADE_S = 10;
/** Research 91 section 4.2: the respawn record is lifted a unit above its cell (`FUN_002b8100` L158793). */
const SPAWN_LIFT = 1;
/**
 * VOTE_BAN_SCOPE_PLACEHOLDER (see `Room.banned`; H-next d): a removed player's address refused for 10 minutes. The
 * original's server refuses the removed player's rejoin to "that game" -- JoinGame -972 `MediusPlayerBanned`
 * (`FUN_002edba0` D:L190430; UIMnLOC 443/444, research 91 section 17) -- on the victim's own MediusBanPlayer, its
 * account and the game's world with a field of 120 whose unit is not read (`FUN_002f95f0` D:L197800-197804; research
 * 179 sections 6.3-6.4, research 203 section 4: minutes believed, from an emulator's model). Kept on H-next d's default
 * (SVC-23, research 263 sections 5.3 and 6); settles: the owner, or ONL-32's transcript of a removed player's rejoin.
 */
export const VOTE_BAN_MS = 10 * 60_000;
/**
 * VOTE_KICK_POINT_READING (SVC-23d; research 263 section 5.2): the screens whose start removes a passed vote's target
 * -- ROUND COMPLETE's after a round, GAME COMPLETE's after a match's last; FINAL ROUND's never. Each screen's
 * `ExitOnStart` runs IF `HaveBeenBannedFromGame`: `BanSelfFromGame`, WAIT 0.5, `dlgNetBanned.rdr` (the victim's own
 * console; SOCOM II's `RUN/MPZANIM.ZAR`, the `dlgMultiplayerRound.rdr` set, and READERX's `dlgMultiplayerRound.rdr` /
 * `dlgMultiplayerFinalReally.rdr`; `dlgMultiplayerFinal.rdr` has none -- research 179 section 6.2 for the three;
 * research 187 section 7.1 read ROUND COMPLETE's again, not GAME COMPLETE's); the command row `HaveBeenBannedFromGame` is the pass test `FUN_002c3550` (research 179 section 6.2, the
 * `.data` table), computed then from the side and the flags present (research 179 section 6.5). The screen's start in
 * the room: ENGINE_READ_S after the result, and FINAL ROUND's seconds more at a match's end (`voteKickDelayS`). A
 * reading (the scripts read, not run); the recomp's vote run times it. R4B-08 (OT.R97; research 379 §2): kept in r0004 as
 * the second trigger -- r0004's package replaces the overlays only, so the screens' scripts are r0001's -- beside the kick
 * at the deciding vote's receipt (`VOTE_KICK_AT_ONCE_READING`), which it now catches only for a majority no vote's
 * receipt made (a side shrunk by a leave).
 */
export const VOTE_KICK_POINT_READING = ['roundComplete', 'gameComplete'] as const;
/**
 * VOTE_KICK_AT_ONCE_READING (R4B-08, OT.R97; research 379 §2): r0004's Voter receive (r4 0x2bbc10, r0001's
 * `FUN_002ba040` D:L159749-159790) branches on the pass test it calls after counting (`FUN_002c3550`, r4 0x2c51c0, called
 * at 0x2bbc84; r0001 calls it and drops the result, D:L159767): passed (0x2bbc8c), the target's console runs
 * `BanSelfFromGame`'s body at once (r4 0x316900 = r0001 `FUN_002f95f0`, its argument the lobby 0x452730, 0x2bbc94),
 * switches to dlgNetBanned.rdr (r4 0x2a5cb0 = r0001 `FUN_002a47b0`, 0x2bbca8) and clears the voice's talk flag (r4
 * 0x32bc60 = r0001 `FUN_0030e6e0` with 0, 0x2bbcb8); the broadcast follows as before. So the deciding vote removes its
 * target mid-round, with no 0.5 s WAIT. Here: on every vote the room counts, a pass removes that target at once
 * (`removeVoted`). r0001, superseded by r0004: the kick only at VOTE_KICK_POINT_READING's screens. A reading, pending
 * review; settles: a PCSX2 `--build r0004` game of three or more a side, the deciding vote cast mid-round.
 */
export const VOTE_KICK_AT_ONCE_READING = 'the deciding vote removes its target at its receipt' as const;
/**
 * VOTE_HUMAN_SEATS_ADAPTATION (VOTE-LOG, Trello d3xR0sr2 (1); product track, a browser/server adaptation: the original
 * has no online bots; the controller's call, 5d, 2026-11-02, logged in `plans/r0004-option-b.md` for the owner to
 * overturn): the team vote's threshold counts only the target's side's HUMAN seats. The original's part is kept: more
 * votes than half the target's side, the target counted (`FUN_002c3550` D:L165002 / D:L165078; research 263 section
 * 5.2) -- with no bots the rule is the original's, unchanged. The adaptation is the filter: a CPU seat (`Conn.cpu`)
 * never votes, so counted it could hold a kick out of reach. A CPU target is never voted out under it (the spec: whether
 * a bot is a vote target at all is the original's question, not asked here). Default: on; the old count is every seat.
 */
export const VOTE_HUMAN_SEATS_ADAPTATION = 'the vote threshold counts the target side\'s human seats, the target counted' as const;
/** VOTE-LOG: a side as the `[vote]` lines name it. */
const VOTE_SIDE: Record<Team, 'SEALS' | 'TERRORISTS'> = { seal: 'SEALS', terrorist: 'TERRORISTS' };
/**
 * The end of a round (research 91 section 18, the maps' `mission_timer2` / `success2` and the MPZANIM screens): at
 * 00:00 "TIME EXPIRED" and 15 s more play; the result 1 s after; the engine reads it 3 s later; then ROUND COMPLETE's
 * countdown (5 s) before the next round, or FINAL ROUND (10 s) and GAME COMPLETE (10 s, the host's wait) after a match.
 */
export const EXPIRED_PLAY_S = 15, RESULT_S = 1, ENGINE_READ_S = 3, ROUND_COMPLETE_S = 5, FINAL_ROUND_S = 10, GAME_COMPLETE_S = 10;
/**
 * SVC-23d: seconds from a round's result (`endRound`) to the start of the screen of `screens` that tests the votes
 * (VOTE_KICK_POINT_READING): the engine's read, then every screen before it.
 */
export function voteKickDelayS(screens: readonly { screen: string; seconds: number }[]): number {
  let s = ENGINE_READ_S;
  for (const x of screens) {
    if ((VOTE_KICK_POINT_READING as readonly string[]).includes(x.screen)) return s;
    s += x.seconds;
  }
  return s;
}
/**
 * SVC-23e (research 91 section 17 1.1; research 264 section 4): VOTE ALL's threshold -- the host ejects the spectators
 * once the votes standing exceed 0.6 x the players of both sides, `(SEALs + Terrorists) * 0.6 < votes` (`FUN_002c2e30`
 * D:L164516-164544, the compare at D:L164543; the side counts recomputed first by `FUN_002c4500`, D:L164526, which counts
 * no spectator). 8 players: 5 votes, not 4.
 */
export const VOTE_ALL_SHARE = 0.6;
/**
 * VOTE_ALL_LINE_PER_SPECTATOR_READING (SVC-23e; research 264 section 4): what one VOTE ALL toggle sends. The voter's
 * console flips its toggle (`FUN_0022f0f0` D:L81263) and walks its actors: for each spectator whose mark (the
 * spectator's slot record +0x49 on the voter's console, `FUN_002c3980` D:L81269) differs from the toggle, it sets the
 * mark (`FUN_002c39d0` D:L81271 -- the value's argument lost by the decompiler, read as the toggle) and sends one "Spec
 * Vote" to every console (`FUN_002b9b60` D:L159568), applied locally too (D:L159570). Each Spec Vote sets the voter's
 * flag (+0x4a, `FUN_002c2f50` D:L159589), prints its line on every console (D:L159591-159597) and has the host test the
 * threshold (D:L159598) -- so k spectators give k lines, and a passing toggle k "Reject"s, the host's test having no
 * guard. No spectator present, nothing is sent (the entry itself shown only then, `FUN_0022f210` D:L81282-81310). A
 * reading: the lost argument, and the loop's messages all leaving before the first Reject returns, are not measured.
 */
export const VOTE_ALL_LINE_PER_SPECTATOR_READING = 'a Spec Vote per spectator whose mark differs';
/**
 * SVC-23e: a spectator's join refused after VOTE ALL's eject, MaxSpectatorsValve 0 (`FUN_002b9bd0` D:L159602-159606).
 * The host refuses a spectator's join when the valve (8 when it is absent) is at most the spectators present
 * (`FUN_002bc620` D:L161396-161422, reason 2), and the joiner shows reason 2's text, S:0x3f24b0, through
 * MP_EJECT_SPECTATOR (S:0x3f2530; `FUN_002b9150` D:L159215, D:L159227; `FUN_002baf30` D:L160342, D:L160357).
 */
export const TOO_MANY_SPECTATORS = 'Too many spectators';
/**
 * CLAN-JOIN (research 308 §3.3): a playing joiner refused because the side a clan game's rule forces on it holds 8 --
 * the host's reason 3 (`FUN_002bc620` D:L161357-161388, the reason at D:L161378; the forced side never falls back to the
 * other), the joiner's text S:0x3f24d0 through MP_EJECT_SPECTATOR (`FUN_002b9150` D:L159211-159212, D:L159227). The
 * room's (`hello`'s `side` for a joiner, `Lobby.join`'s `forced`).
 */
export const TOO_MANY_PLAYERS = 'Too many players';
/**
 * CLAN-JOIN (research 308 §3.2): an outsider's playing join of a members-only clan game (affiliation 3) refused -- the
 * host's side 4 reason 4 (`FUN_002bc620` D:L161260-161284, the reason at D:L161274), the joiner's text S:0x3f24f0
 * through MP_EJECT_SPECTATOR (`FUN_002b9150` D:L159208-159209, D:L159227). The bridge's, before any seat (`clanSide`).
 */
export const CLOSED_CLAN_GAME = 'Closed clan game';
/**
 * A client's commands are run as its credit allows: a tick's worth each server tick, or the wall time's when the loop
 * stalled and dropped ticks (a GC pause, a busy host), so a stall's backlog is run once the server is back rather than
 * left in the queue for good; never more than a second's worth saved up (the speed guard: no client runs faster than
 * real time, past a one-second burst).
 */
export const CREDIT_MAX = 60;
/**
 * HIGH-1 of the netcode review of 2026-10-06 (web research 223 §2.1; OT.R26). The credit alone left a client stall past
 * its one-second burst as a backlog for good: after a 3 s stall 60 of the 180 commands ran, and with one arriving and
 * one run a tick the other 120 stayed -- the mover 2 s behind for the session. A backlog now drains: past the credit, a
 * player runs up to `CATCHUP_PER_TICK_PLACEHOLDER` more commands a tick while its unspent time in the last
 * `CATCHUP_WINDOW_TICKS_PLACEHOLDER` ticks allows (`Player.slack`: each step's credit less the commands run in it) --
 * so over any such window no client runs more commands than the window's ticks plus the burst, and a page sending
 * faster than real time has no unspent time to run them on. A backlog past `BACKLOG_BOUND_PLACEHOLDER` with neither
 * credit nor unspent time left (a stall longer than the window takes to drain, or a page sending faster than real
 * time) is dropped but its newest command, unrun and uncharged: the page's prediction is corrected by the snapshots.
 * Server tolerances, no game values (the game has no server: research 91 §15).
 */
export const CATCHUP_PER_TICK_PLACEHOLDER = 1;
/** HIGH-1: the window the unspent time is counted over (10 s, the queue's own bound: a 5 s stall drains in it). */
export const CATCHUP_WINDOW_TICKS_PLACEHOLDER = 600;
/** HIGH-1: the commands a queue holds with nothing left to run them on before its backlog is dropped (200 ms). */
export const BACKLOG_BOUND_PLACEHOLDER = 12;
/**
 * MEDIUM-3 of the netcode review of 2026-10-06 (web research 223 §2.3): the rows' changes (a join, a leave, a rename)
 * go out as one `score` at most each this many ticks (15: four a second) -- the first of a quiet spell at the next tick,
 * the rest coalesced -- so a join and leave churn is not amplified into a full score to every page each tick. A server
 * tolerance (the game has no server: research 91 §15); the round's own score events are not held by it.
 */
export const SCORE_EVERY_TICKS_PLACEHOLDER = 15;
/**
 * LOW-13 of the netcode review of 2026-10-06 (web research 223 §2.4): a player's `name` is taken at most once each this
 * many milliseconds (5 s) -- a rename broadcasts `renamed` to every page, and the text rate (40 a second) let one page
 * send forty. The page renames on its settings field's change (`main.ts`, W3.R12), a person's edit. A server tolerance;
 * a game's room takes no rename at all (`fixedNames`).
 */
export const RENAME_EVERY_MS_PLACEHOLDER = 5000;
/**
 * LOW-11, the review of NET-ROOM (web research 223 §2.5): a launched seat that leaves the load hold still loading keeps
 * its slot by its session token this many seconds (5), within the hold's ceiling, so a socket dropped and back is
 * waited for even when it was the last one loading. Past it the slot is skipped, as the original skips a slot with no
 * record (research 221 §1): a seat gone for good does not hold round 1 to the ceiling. A server adaptation.
 */
export const LOAD_REJOIN_GRACE_PLACEHOLDER = 5;
/**
 * ROUND1-COUNT (web research 166 §3, R166.3; research 322 (agent/parity-2 0d2d69644) §1.1): seconds from the launch's
 * load barrier passing -- the last `loaded`, or the ceiling -- to round 1's start. The original's host, its barrier
 * passed, writes `+0x112` = 2 and sends its game object at once (`FUN_001f5e70` D:L55693-55696), completes its own load
 * on that byte (`+0xd0`, D:L55704-55707), counts its load state's 0.5 s (D:L55748-55755, the counter zeroed at the load's
 * end, D:L55657-55659 online, D:L55603-55604 offline) and only then switches to the core state, whose init starts round 1 (`FUN_001ec480` D:L50946 ->
 * `FUN_002a7d40`, game state 3 under the host D:L149762). A client released on the barrier counts the same 0.5 s, so
 * every console leaves its loading screen as round 1 starts. Round 1 of a launch only: the later rounds' starts are the
 * round screens' timing. [reading]
 */
export const ROUND1_AFTER_BARRIER_S_READING = 0.5;
/**
 * SVC-20b-relay (web sprint 20; research 225 §4, §6; the plan's constraint 4): the largest voice frame a page may send,
 * bytes; one over it is a strike (`binary` answers false). The honest page's frame is four 20 ms Opus packets, about 70
 * bytes at sprint 20's 6 000 bit/s (V-WIRE's RED 4: 68 up at four 15-byte packets), about 128 at the 12 000 bit/s of
 * VOICE-2 (four 30-byte packets); the packet size is SVC-21's, owed to SVC-20b-page's observation, so the cap has headroom. No original: the DME library's voice framing is unread (research
 * 170 §10). Here, not in `limits.ts` beside D9 (the plan's constraint 4 put it there): `limits.ts` imports `node:crypto`,
 * and this room is the page's own too (`../../viewer/src/net/loopback`).
 */
export const VOICE_FRAME_BYTES_MAX_PLACEHOLDER = 256;
/**
 * SVC-20b-relay (constraint 4): the voice frames a connection's bucket refills a second -- twice the honest page's 12.5
 * (one frame each 80 ms, the original's cadence, R170.12). A frame the bucket has no token for is dropped and counted
 * (NET-RES-2e; was a strike: the binary rate and its bank bound a flood). Inside the
 * socket's own 120 binary frames a second (`server.ts` `RATE.binary`, which the commands' 60 share).
 */
export const VOICE_FRAMES_PER_S_PLACEHOLDER = 25;
/**
 * SVC-20b-relay (constraint 4): the voice bucket's size, frames -- two seconds of the honest page's, delivered at once
 * after a line's stall; full at the member's entry.
 */
export const VOICE_FRAMES_BURST_PLACEHOLDER = 25;
/**
 * SVC-20b-relay (research 225 §4): the base a member asks when it joins a room past its game lobby -- a dedicated
 * respawn room (`/testroom`'s, which has no lobby), a launched game's in-progress joiner, a promotion in play: the
 * round's start's base for a member who did not join late (TEAM, `FUN_001f6660` D:L55842-55846; spectators 10 by
 * `channelOf`). The original's joiner passes through the game lobby (9) and its game's start asks 3 for a late joiner
 * (`VOICE_LATE_JOINER_READING`, C11). SVC-20c (research 225 §5.1): a seat made in a classic round in play asks that 3
 * (`VOICE_LATE_JOINER_SEAT_READING`); this base is left only to a respawn room's joiner, whose room has no game lobby, so
 * that every seat of it joins a round in play -- the original's late joiner there is not mapped (225 §5.1).
 */
export const VOICE_JOIN_IN_PLAY_BASE_PLACEHOLDER = 0;
/** Ticks a gap in the command numbers is waited on before the queue goes on without the missing one (100 ms). */
export const GAP_WAIT = 6;
/**
 * SVC-23b (research 169 §7 measure 5 (a), weak point 7; OT.R26, OT.R27): the ticks of the room's own clock an honest
 * page's timed events may arrive out of their commands' spacing -- a server tolerance, no game value (the game has no
 * server: research 91 §15). Two uses, one number:
 *
 * - **The rate on the room's clock.** A round, a throw and a lock are also counted from the tick the room decides them
 *   (`Room.serverClock`, each event dated back by its line's stall: `FIRE_STALL_CREDIT_TICKS`), not only from the
 *   command they name: a round is taken no sooner than its weapon's cycle (the game's `FireWait`, less the page's tick,
 *   as the command clock's) less this many ticks after the room's schedule for it (`Player.fireClock`: max(its time,
 *   last + cycle)). The weapon's lock is the same: a round is refused while its time is more than this short of the
 *   lock's end (`Player.lockClock`).
 * - **The named command's age.** A round, a reload or a throw naming a command more than this many older than the last
 *   the room ran is refused (`stale`): the body's place, the cone and the clocks it is judged at are the room's latest.
 *
 * Three ticks, 50 ms at the game's 60 Hz: the page names the command it has just sent and the room decides the event
 * once the next has run (`due`: one tick); the room's step and the socket's arrival fall either side of a tick (one); and
 * one for the network's ordinary jitter between two packets a cycle apart. An honest page's event is one tick old when
 * decided (`due`), whatever its connection's delay, since its commands and events share one ordered socket; the
 * tolerance is for the spacing alone (a stall's burst is `FIRE_STALL_CREDIT_TICKS`'); the honest bot matches
 * (`bots.test.ts`) and the stalling page of `room.test.ts` refuse none.
 */
export const FIRE_ARRIVAL_JITTER_TICKS = 3;

/**
 * LATER 116: a network adaptation (beside `TURRET_RELEASE_SEQ_ADAPTATION`; no original -- the console acts on an input at
 * its own frame, with no wire between): the immediate asks -- `door`, `action`, `bombAction`, `pickup` -- are decided at
 * their command (`timed`; once its own command has run, as a throw -- they read the body, and a SWITCH's action the
 * camera's look at its command and the one before it, LATER 139: `due`), not on
 * arrival by the `seq` the page names: the body is the one that command left, its mounted state, the release's span
 * (LATER 109) and the stale bound (`FIRE_ARRIVAL_JITTER_TICKS`) judged then. What players see: an honest page with its
 * usual backlog sees no change (its command has run, or runs the same tick); a lagging one sees its door, switch, drop
 * or pickup at its command's frame, a tick or so later than its arrival. One edge (the fresh review, LATER 116): the
 * queue is in order, so an ask behind a waiting round or reload is decided one command late (about 16 ms, while firing).
 * LATER 124: a mount is judged at its own command -- taken at the first room step's top after that command has run
 * (`resolveMounts`; PF.R28's tie-break, the lower seat id, among the mounts taken at one step's top), so a door pressed
 * just before it is used, not refused 'mounted' (was: taken at the first step after its arrival, its command run or
 * not). The take lags its command by up to a step, `steer.after` the room's count at the take (at or past the mount's
 * `seq`): a mount is taken at the first room step after its command ran; asks run in the same catch-up step are judged
 * unmounted (several commands in one step: a burst on `CREDIT_MAX`, HIGH-1's catch-up, a drained backlog -- a door at
 * S + 3 used where, in command order, the body was mounted at S + 1); a dropped backlog's asks are decided at the drop
 * (`asksAt`), before a mount named in it is taken at the next step's top, so they are judged unmounted; and a round
 * decided around the take is ordered by step, not exactly by seq. The stale bound is judged at arrival, as before
 * (`MountAsk.staleAt`, the room's count when the ask came): a mount pressed inside a stall's burst is taken, and one named
 * in a dropped stretch that was not stale on arrival is taken after the drop (`steer.after` the drop's last command),
 * judged on the room's last real body -- the drop buys no movement, so `canMount`'s reach and facing read there, as for
 * the drop's own asks. The bound: a mount naming a command more than `PENDING_TICKS` ahead of the room's count at its
 * arrival is refused 'ahead', and one waiting longer than `PENDING_TICKS` is dropped 'its command never ran', as a
 * timed event is (`settle`).
 * LATER 123: a stalled page's asks named in a backlog the room drops
 * (`dropBacklog`) are decided at the drop, each at the dropped command it names (`asksAt`, its presses laid) -- the body
 * the room's last real one, the drop buying no movement, so a door the page walked up to during the stall may be out of
 * reach and refused by its handler; an ask that arrives after the drop, naming a dropped command, is refused 'stale' (its
 * command is gone); a pickup decided at the drop is judged by `WorldDrops` on the body the drop leaves (its newest
 * frame, `ShotCone.latest`: LATER 135, 2026-10-19 -- was refused 'stale' there, its command having no frame), as any
 * claim is judged on its frame as of its decision; the drops keep one claim a command a seat (a later one for the same
 * command replaces it: the page sends at most one `pickup` a command -- a bound, so a modified page cannot claim several
 * drops on one command); all of one drop's asks are decided on the same room tick,
 * so a door's swing and a switch's program do not advance between them -- a door opened then closed during the stall is
 * left open (the second use refused while it swings, `DoorSet.use`; a switch `'busy'`) -- and an ask is decided ahead of
 * a round that waits before it in `pending` (a round within the stale bound of the last dropped command still decided
 * after the drop, so an ask at L - 1 may run before a round at L - 2); the intake's flood cut (`QUEUE_MAX`, 10 s of
 * commands, `binary`) is dropped as a backlog at the next step's top (LATER 136, 2026-10-19: was thrown away before any
 * drop, its asks refused 'stale'), an ask arriving after its command was cut refused 'stale'; and a dismount pending across a dropped or cut stretch (`takeDismount` runs only from `run`, at the first command
 * above it) leaves the body mounted at the drop, so an ask the page sent after dismounting is refused 'mounted' -- the
 * release and its travel happen at the kept command, as before (the gameplay seat's to settle if it matters). What it leaves (named): a
 * forged pickup `seq` up to `FIRE_ARRIVAL_JITTER_TICKS` before the span's start, decided in the clip's first commands, still
 * passes (`WorldDrops` judges the seat's present `mounted`). Since LATER 172 and 174 a door, an action or a bomb drop named
 * there is refused 'mounted' and a round named there is the turret's: those commands ran mounted, and each is judged by
 * its own command's frame (`MOUNT_ASK_AT_COMMAND_ADAPTATION`, `DISMOUNT_ROUND_AT_COMMAND_ADAPTATION`). Was: every ask and
 * round named there passed, the same window (F-A: an ask is judged by its own command).
 */
export const ASK_AT_COMMAND_ADAPTATION = 'the immediate asks (door, action, bombAction, pickup) decided at their command, not on arrival' as const;
/**
 * SVC-23b (the stall check of 2026-10-04): the most ticks a timed event is dated back on the room's clock for its
 * connection's stall. A real line over TCP stalls, then delivers its held commands and events in one read; the room runs
 * them in one step from the credit the stall saved (`CREDIT_MAX`), so every round of the burst would be decided at one
 * `serverClock` and all but the first refused by the rate. Each event is therefore dated at its command's lateness
 * (`Room.eventClock`): on a steady line the room's clock less the command count is a constant (the latency and the
 * page's start), and a stall raises it by the stall's length; the event is dated back by how far it stands over its best
 * of the last few seconds (`LAG_FLOOR_WINDOW_TICKS`) -- at most this many. Not the unspent credit (a page that idled
 * before it began keeps a full bank at real time) nor the commands still queued (a burst that trickles in over two steps
 * shows only part of its lateness). 21 ticks, 350 ms, so that with `FIRE_ARRIVAL_JITTER_TICKS` 24 ticks (400 ms) of
 * lateness are honoured: the hiccups a WebSocket over TCP shows on an ordinary line run 100-300 ms, on top of the line's
 * own jitter (0-80 ms in the test); the honest page of `room.test.ts` ("a stalling, bursting connection": 250 and 300 ms
 * stalls, 0-80 ms of jitter) is refused nothing over every seed tried (30 a length on 2026-10-04; 18 ticks refused a
 * round in 3 of 30 at 300 ms). The cost, stated: a lag switch held 400 ms or more lands what an honest hiccup of that
 * length delivers -- at most (this + `FIRE_ARRIVAL_JITTER_TICKS`) / rate + 1 rounds in one tick, the rate the record's in
 * ticks (LATER 326; was `/ cycle`, the rate less a tick: 5 of the M4A1's burst, 9 of the Model 18's: 0.06 x 0.8 s, 2.88
 * ticks; was 13), and a reload's or after-shot's lock may end up to 24
 * ticks early after such a stall; over any window of W ticks the rounds stay within (W + this +
 * `FIRE_ARRIVAL_JITTER_TICKS`) / rate + 1 -- the weapon's own rate over time, a 400 ms burst at most at once (the
 * review's run was a second's: 6 rounds and more). A smaller number trades honest rounds for a smaller burst: the
 * owner's call (H89 D7), this its default.
 */
export const FIRE_STALL_CREDIT_TICKS = 21;
/**
 * HOTFIX grenade fuse (2026-11-02; research 85 §6.1): a network adaptation, no original (the console flies its grenade
 * and moves its bodies on one clock, the frame's: `FUN_003c9fb0`'s dt, `FUN_005a0e70` D:L459070 judging the blast at the
 * detonation's frame). The most ticks a hand throw (`throwGrenade`, `born`'s `dateBack`; any other new projectile is
 * flown at most its step's credit) is dated back for its command's lateness -- the room's clock less its command's count and the line's best
 * offset (`Player.lagFloor`, as `eventClock` dates it), past the time the room's own step credits it (`flyGrenades`,
 * `Flying.late`: one made inside a step already has that step's credit in its lateness; the review's F1) -- and flown
 * that much at once, so its fuse (`Timer1`, from the release, `SetProjectile`) runs from the page's release and not from
 * the room's decision. 60 ticks, one second: the
 * burst the bodies' credit runs at once (`CREDIT_MAX`), so a throw held by its line up to the stall a body is credited at
 * once is flown from where the page let it go; past it, the throw runs late by the rest. Above `FIRE_STALL_CREDIT_TICKS`
 * (21) because a 1 s hold of the line would otherwise put the room's blast 39 ticks after the page's (the owner's report,
 * 2026-11-02); that shared constant is the rate's and the locks' dating and is not raised. The date-back alone never
 * reaches the shortest hand fuse (the Mark141's 1.5 s); a throw still goes off at its first flight when the room's own
 * stall around its arrival covers its fuse -- at its true age, as the page's did. The owner's ruling (2026-11-02, Craig's
 * own word in the controller seat ef): 60, accepting that a page holding its line can fly its grenade up to 1 s early, which other
 * pages see as a full fuse (cooking; the original has none), until LATER 643 puts the throw's age on the wire.
 */
export const THROW_DATE_BACK_TICKS_ADAPTATION = 60;
/**
 * SVC-23b: the ticks over which a player's best offset between the room's clock and its command clock is kept
 * (`Player.lagFloor`, two halves of this, the older dropped as each fills): 300, 5 s -- longer than the gap between two
 * ordinary stalls, so each window holds a steady stretch to measure from; short enough that a page's clock drifting
 * against the room's (a few ms a minute) moves the floor with it. A server policy, no game value.
 */
export const LAG_FLOOR_WINDOW_TICKS = 300;
/** A command's stick past this, a button, or a turn counts as input for the idle kick. */
const ACTIVE_STICK = 0.05;
/**
 * The honest camera's pitch range, degrees either way (research 169 measure 5 (c), weak point 17; HARD-FLOOD): the
 * look's hard stop, `FUN_00594600`'s 1.4 rad (`0x3fb33333`, `look.ts` `PITCH_HARD`). The stance's aim limits are
 * tighter (-70..60 standing, -20..25 prone), but a stance change leaves the pitch outside them for a moment and brings
 * it back at 0.5 rad/s (`stepPitch`), so the hard stop is the bound no honest page passes. `codec.ts` decodes up to
 * +-327.67; a decoded pitch is held to this before the mover, the cone or a snapshot reads it (`binary`).
 */
export const HONEST_PITCH_DEG = (PITCH_HARD * 180) / Math.PI;
/**
 * A watcher closed for sending nothing for the room's idle time (research 169 measure 8, D9 (a): "watchers
 * idle-limited as players are"; HARD-FLOOD): a code of its own beside the player's 4001. A server policy with no
 * original: the original has no idle or lag kick, and its UIMn #539 follows a team vote's kick only, so no close of a
 * limit's is shown as #539; a page that surfaces one shows #365, disconnected (research wave, 2026-10-04).
 */
export const WATCHER_IDLE_CLOSE = { code: 4009, reason: 'Kicked for inactivity.' } as const;
/**
 * START_REACH_PLACEHOLDER (SVC-23b, research 169 §7 measure 5 (b), weak point 3; research 91 §16): units a round's
 * muzzle, a thrown grenade's hand and a launched round's or rocket's muzzle may stand from the server's own head at the
 * command (`headPoint`: the scope's eye over the feet, the stance's or the move's root, the peek), plus the root's slack
 * (`AimFrame.rootSlack`: `ROOT_POSE_SLACK_PLACEHOLDER`, and a posture change's span); a set charge's point, that far
 * across from the feet (its height is `chargeRests`'). The line from that head to the start must be clear of walls
 * too. It replaced `MUZZLE_SLACK` (40 units, 4 m, from a fixed eye height, and only the body's middle wall-tested).
 *
 * The server poses no skeleton, so the page's posed muzzle and hand are bounded, not computed: the farthest start the
 * tables put from that head is the prone throw's hand (`throwAnim`'s `Prone throw grenade` release point, (6.29, 15.05,
 * -0.97), 12.2 from the prone head -- `FUN_0029ae50`'s, 3.6 over the root and 4.9 ahead since PF-05; 14.8 from the old
 * estimate's 1.7), then the rifle's muzzle (the M4A1's `firepoint` 7.8 along the barrel and the
 * sight a unit ahead of the eye: about 9.3, research 79 §2 and §3.4's retired hold row), a charge under the right hand
 * (the page's stand-in hand 8 across, `grenade.ts` `placeCharge`); 16 is the old prone hand's 14.8 rounded up, kept
 * (PF-05 moved the head, not the hands: the reach only grew looser). What would settle
 * it: the posed muzzle and hand minus the server's head, measured in the page over every clip and weapon (a browser
 * capture), as the cone's tolerances are to be.
 */
export const START_REACH_PLACEHOLDER = 16;
/**
 * CHARGE_HAND_HEIGHT_PLACEHOLDER (SVC-23b, the re-review of 2026-10-04; research 91 §16): units over the feet of the
 * page's hand when it sets a charge down -- its column is taken at this point (`placeGround`, no lift: `FUN_005c2430`;
 * AD-4, was 1 over it) (`grenade.ts` `placeCharge`: the posed right hand, or without it the stand-in (2, 8, -8) in the
 * actor frame, 8 up). The room tests
 * the charge's path across at that height (`Room.startRefused`), so a charge cannot be set past cover the hand does not
 * clear. 8: the page's stand-in; the posed hand's height through `Place claymore` is not measured (a browser capture
 * settles it).
 */
export const CHARGE_HAND_HEIGHT_PLACEHOLDER = 8;
/**
 * The PERSON material's byte (`materialTable`: the two built-ins, then `materials.rdr`'s SOILS -- 13, research 89 §5's
 * row; `DAT_003e14f8`, looked up by name in `FUN_003d03d0` L323423): what a body's hit carries on the `shot`.
 */
const PERSON_BYTE = materialTable().findIndex((m) => m.name === 'PERSON');
/**
 * PF-24 (ruling PF.R42; research 219 s3, 179 s8.12): the `PENETRATION` a body meets a round with -- the PERSON
 * material's (`DAT_003e14f8`, D:L319391; its record's `+0x24` read at D:L319473-319518), 0.97 in `materials.rdr`'s SOILS
 * (research 84 s13), taken from the table by name, not a number of the room's own. A bullet that strikes a body goes on
 * with its range cut to `min(range, (range + range x piercing x 0.1) x BODY_PENETRATION)` (`../../viewer/src/accuracy`
 * `penetrate`): above a piercing of 0.31 a body leaves the whole range.
 */
export const BODY_PENETRATION = materialTable().find((m) => m.name === 'PERSON')!.penetration;
/**
 * BONE-BOXES (research 398 s13.1; reading, pending review): a launched round that goes off on a body leaves the walk at
 * its first record (`FUN_003c8920` D:L319477-319485), any bone's -- a hand's, a foot's, the root's -- and its direct hit
 * then goes to the exploding round's part routine (`FUN_005ab850` D:L464600-464620: `FUN_005ac070`, not read), which is
 * not `FUN_005abbc0`'s branch by bone [reading]. 'nothing': a first record on a bone with no damage part (`NO_PART`)
 * gives no direct hit (the round still goes off there, `bodyCast`); a damage bone's applies as before
 * (`IMPACT_HIT_READING`). Settles with `FUN_005ac070` read for a record whose node is not one of the thirteen.
 */
export const IMPACT_NO_PART_READING = 'nothing' as const;
/**
 * PF-24: a body the friendly-fire gate refuses (`ffRefuses`) is passed through as any other -- `FUN_003c8920` runs the
 * struck node's handler (D:L319418, `OnWeaponHit`'s gate inside it) before the continuation (D:L319473-319518), and the
 * continuation reads no result of it. An inference from the lines' order (179 s8.2, s8.12), not a capture. [reading]
 */
export const BODY_PASS_FRIENDLY_READING = 'through' as const;
/*
 * BONE-BOXES (owner ruling OT.R119; research 398; research 217 s3.6b; reading, pending review) -- was
 * `BODY_ONE_SURFACE_READING` 'per body' (one surface a body at its nearest capsule, the range cut once, a body damaged
 * once a round), retired: a body is one PERSON record for each bone box the round's line enters (`rewoundBodies`, the
 * viewer's `rayRecords`), every record cutting the range (`FUN_003c8920` D:L319506-319517) and handed to the victim's
 * handler in the walk's order (`./bodyWalk` `walkOrder`); a limb's damage leaves the round going on, a head or trunk hit
 * remembers it and spares the rest of that body (`./bodyWalk` `bodyApplications`; `FUN_005ab850` D:L464597,
 * `FUN_005abbc0` D:L464741-464757). `+0x78` (D:L319398) gates only the impact's effects, never the damage (research 398
 * s12.1).
 */
/**
 * PF-24 (ruling PF.R42): one `shot` a round to the other pages and the shooter's `impact`, both of the FIRST body the
 * round struck -- its point as `to`, the normal back along the round, the PERSON byte, `body` its id -- as before PF-24;
 * every body struck gets its own `hurt`, `flinch` or `kill` and combat report. The pages draw a round's impact at `to`
 * by its material (`../../viewer/src/netPage` `shot`). The wall marks past the bodies: since P12 the shooter's page walks
 * its round past every body (`../../viewer/src/fire` `BODY_PENETRATION`) and the others are told the world surfaces
 * (`SHOT_EVENT_THROUGH_READING`); since P12b the `shot` names the round's end beside the first body (`end`, additive,
 * absent when it is `to`), and the others' tracer runs to it, as the shooter's does. The later bodies' impacts and the
 * others' bullet marks are still drawn on no page (the original's consoles each walk the round, research 91 s23). [reading]
 */
export const SHOT_EVENT_BODIES_READING = 'first body' as const;
/**
 * P12 (the online-parity sweep's SW-3, = EP-6b; research 219 s3.2, 91 s23): the `shot` carries, beside `to`, every world
 * surface the round struck that `to` does not name, in the walk's order (`through`: point, normal, material byte;
 * bodies never) -- the surfaces it pierced and, when `to` is the first body, the one it stopped at past it. Every console
 * walks the shooter's round and plays an impact at each surface (`FUN_003c8920`: the material D:L319383, the impact
 * D:L319497-319500, no test of the damage); that a remote console walks it at all is read from the local-only damage
 * gate (`FUN_005abbc0` D:L464698), research 91 s23's inference -- so the field replays the room's walk on each page
 * rather than each page walking its own. Additive JSON (protocol 13 kept). [reading]
 */
export const SHOT_EVENT_THROUGH_READING = 'struck world surfaces' as const;
/**
 * NCW-1 (B-count; an instrument's adaptation, no original): the ticks of the bodies' past the room keeps so its
 * instrument can test a round at the shooter's own `viewTick` beyond the cap -- 72, 1.2 s at `TICK_HZ` 60: a rewind age
 * of up to 71 ticks, ~590 ms each way (the age is the round trip, the page's 6 ticks of interpolation and about one
 * more), past the 200 ms each way the measure runs to; an older `viewTick` is class `e`. The cost, measured: a kept pose
 * (`Past`: the tick, the feet's three-number array, yaw, posture, alive, the tilt's shared reference) is 168 bytes of
 * heap with its slot in the history array (node 24, 200 000 poses after a full GC), so 72 a body is ~12.1 kB where 24
 * were ~4.0 kB: ~8.1 kB more a body, ~129 kB more for 16 players (and as much more for each hostage). Nothing scored
 * reads past the cap: the clamped rewind is never older than the seat's cap (`rewindCapTicks`, since NCW-2 B-bound at
 * most `REWIND_CEILING_MS_ADAPTATION`, 24 ticks), inside both lengths, and `pastOf` answers it the same from either.
 * Research 223 §4.
 */
export const REWIND_PROBE_HISTORY_TICKS_ADAPTATION = 72;
/**
 * NCW-6 (an instrument's bound, no game value: an adaptation, research 223 §4): the most runs of dropped command numbers
 * a seat remembers (`dropStretch`, each run of consecutive numbers its first and last) for `signals.staleAfterDrop`, the
 * oldest forgotten past it. Nothing judged reads it.
 */
export const STALE_DROP_RANGES_MAX_ADAPTATION = 32;
/**
 * NCW-10 (an instrument's bound, no game value: an adaptation, research 223 §4): the longest page build the room keeps
 * from a hello's `build` for the seat's round signals -- characters of `[0-9a-z.-]` only (a short hash, `-dirty`, a
 * release tag); a longer or other one is none, never a refusal (`clientBuildOf`). Nothing judged reads it.
 */
export const CLIENT_BUILD_MAX_CHARS_ADAPTATION = 40;
const CLIENT_BUILD_PATTERN = new RegExp(`^[0-9a-z.-]{1,${CLIENT_BUILD_MAX_CHARS_ADAPTATION}}$`);
/** NCW-10: a hello's `build` as the room keeps it (`CLIENT_BUILD_MAX_CHARS_ADAPTATION`), or undefined; central's reader checks the same. */
export function clientBuildOf(raw: unknown): string | undefined {
  return typeof raw === 'string' && CLIENT_BUILD_PATTERN.test(raw) ? raw : undefined;
}
/** NCW-10: a hello's `builtAt` as the room keeps it (`BUILT_AT_PATTERN`, UTC to the minute), or undefined; central's reader checks the same. */
export function clientBuiltAtOf(raw: unknown): string | undefined {
  return typeof raw === 'string' && BUILT_AT_PATTERN.test(raw) ? raw : undefined;
}
/**
 * NCW-2 B-bound (the owner's OT.R105; simulation track, reading pending review; research 223 §4, LOW-9): the allowance,
 * ms, a seat's rewind cap (`rewindCapMs`) grants past the page's interpolation and its measured round trip. A round's
 * rewind age at the room is the round trip, the interpolation (`INTERP_DELAY_MS`) and the room's own wait and wander:
 * the round is decided once the command after it has run (`due`), the step and the socket's arrival fall either side of
 * a tick, and the line jitters -- exactly what the room already allows an honest event, `FIRE_ARRIVAL_JITTER_TICKS`
 * (3 ticks, 50 ms at `TICK_HZ` 60). No new measure; the same derivation as B-trade's `TRADE_ARRIVAL_JITTER_MS_ADAPTATION`.
 */
export const REWIND_LINE_ALLOWANCE_MS_ADAPTATION = (FIRE_ARRIVAL_JITTER_TICKS * 1000) / TICK_HZ;
/**
 * NCW-2 B-bound (OT.R105, "400 is acceptable yes"; the netcode wave's plan, section 4's B-bound row): how far back, ms,
 * the room rewinds the others for a seat's round -- as far as the seat's own measured line explains, never less than
 * today's `MAX_REWIND_MS` (200, the floor: a low-ping seat keeps what it had) and never past the owner's
 * `REWIND_CEILING_MS_ADAPTATION` (400): `INTERP_DELAY_MS` + `rttMs` + `REWIND_LINE_ALLOWANCE_MS_ADAPTATION`, clamped.
 * `rttMs` is the seat's smoothed heartbeat round trip (`Player.pingExact`, `noteRoundTrip`; 0 until the first pong:
 * then the floor). Why the heartbeat and not the commands' arrival offset (`Player.arrivalFloor`): that offset is the
 * arrival time less the command's number, whose zero is the page's own start -- it measures how much later than its
 * best a command arrives, a change in the line, never the line itself (its floor cancels a steady delay by design, for
 * the dated rate gate); the heartbeat's pong is the only absolute measure of the line the room has, and B-trade's
 * window reads it already. What a forger buys: a page cannot name an older tick than its own cap allows (a low-ping
 * seat stays at 200 ms whatever its `viewTick` or `shownTick`) -- but the measure itself is forgeable (B-bound's review
 * F5): `pongSentAt` (`server.ts`) takes any payload at or before now as the ping's send time, and the ws library emits
 * unsolicited pongs, so a non-browser client can send crafted pongs (or hold its pongs back) and move `pingExact` either
 * way in about 25 frames. What that buys stays bounded: at most the ceiling -- what an honest high-ping seat has -- and
 * the trade's 24 + 3 ticks (`tradeExpiryTicks`); OT.R105's accepted cost. LATER 717: accept only a pong that matches an
 * outstanding ping.
 */
export function rewindCapMs(rttMs: number): number {
  if (!(rttMs > 0)) return MAX_REWIND_MS;
  return Math.min(REWIND_CEILING_MS_ADAPTATION, Math.max(MAX_REWIND_MS, INTERP_DELAY_MS + rttMs + REWIND_LINE_ALLOWANCE_MS_ADAPTATION));
}
/**
 * LATER 853 (the owner's mega playtest, 2026-11-10; a browser adaptation, research 239 s8): a hostage order's pick meets
 * the hostages where the page drew them -- at the order's `viewTick`, the page's playout clock when it ordered
 * (`NetClient.viewTick`), clamped as a round's rewind is (`rewindCapTicks` back, never past the room's tick), each from
 * its kept past (`HostagePast`, `pastOf`) -- not at the room's present. The original picks on the issuer's own console
 * against the bodies it draws (`FUN_00591dc0` D:L451421-451426 -> `FUN_005aa690`) and the host applies the forwarded
 * order unchecked (`FUN_002bb8e0` D:L160706-160721; research 191 s12.4); the room's check is the port's own
 * (`ORDER_VALIDATION_READING`), and judged at the present it refused 'not aimed' a HOLD aimed at a WALKING follower the
 * page drew 100 ms + half the round trip behind: the prompt stayed HOLD POSITION and she kept following. An order with
 * no `viewTick` (an older page) is judged at the present, as before. The players stay at their present (open: the page
 * draws them on the same clock).
 */
export const ORDER_REWIND_ADAPTATION = 'the hostages at the order\'s viewTick, capped as a round\'s rewind' as const;
/** NCW-2 B-bound: a seat's rewind cap in whole ticks (`rewindCapMs`, rounded up; 12 at the floor, 24 at the ceiling). */
export function rewindCapTicks(rttMs: number): number {
  return Math.ceil((rewindCapMs(rttMs) / 1000) * TICK_HZ - 1e-9);
}
/**
 * Ticks of history kept for the rewind: the ceiling of any seat's cap (`REWIND_CEILING_MS_ADAPTATION`, NCW-2 B-bound;
 * was `MAX_REWIND_MS`) and a margin (36), or NCW-1's instrument's longer past (`REWIND_PROBE_HISTORY_TICKS_ADAPTATION`)
 * -- the larger: 72 today either way (`S2U_REWIND_PROBE=0` stops the probe's second read, not the history), and a
 * 400 ms rewind reads inside it.
 */
export const REWIND_HISTORY_TICKS = Math.max(Math.ceil((REWIND_CEILING_MS_ADAPTATION / 1000) * TICK_HZ) + 12, REWIND_PROBE_HISTORY_TICKS_ADAPTATION);
const HISTORY = REWIND_HISTORY_TICKS;
/**
 * JUMP-AIM-ROOT (research 80 s7, 2026-11-11; reading, pending review): the instant of the posed root a command's aim
 * frame takes (`Room.aimRootOf`). 'last-tick': the room's `HitPoser` as the last tick's `remember` left it -- the room
 * runs a tick's commands before it poses the tick (`HIT_POSE_CLOCK_READING`'s once-a-tick clock), so the root is one tick
 * behind the command in the ordinary case, and a burst of commands in one tick shares one root (the crouched jump's posed
 * root moves at most 0.52 u a tick, `test/jumpAimRoot.test.ts`'s A = B walk, inside `ROOT_POSE_SLACK_PLACEHOLDER`). The
 * page's camera reads its own animator after its own frame's step. 'command' would pose the body at each command's own clock (a pose a command, the cost HIT-POSE's perf
 * fold took off). Settles with a capture of the page's eye against the room's root through a crouched jump, or with the
 * pose stepped per command.
 */
export const JUMP_AIM_ROOT_CLOCK_READING: 'last-tick' | 'command' = 'last-tick';
/**
 * NCW-2 B-trade (the trade after death; simulation track, reading pending review; research 223 §4, research 193 §12.11):
 * the longest round trip, ms, the room lets a dead shooter's rounds ride on (`tradeWindowTicks`). The original has no
 * bound: its receiving console applies a dead attacker's `Hit` whenever it arrives in game state 3 (`FUN_002bbbd0`
 * D:L160819-160850; `FUN_005a1b80` D:L459519 asks only that the attacker resolves, never that he lives). The port's own
 * bound, the rewind's cap: a corpse's round is never older than a living shooter's may be -- and the bound on a page that
 * forges its round trip (held pongs, or crafted unsolicited ones, `rewindCapMs`'s note and LATER 717; `tradeWindowTicks`). Since NCW-2 B-bound (OT.R105) the cap is the seat's
 * own (`rewindCapMs` of its measured round trip), so this, the most it reaches, is the owner's ceiling
 * (`REWIND_CEILING_MS_ADAPTATION`, 400 ms; was `MAX_REWIND_MS`, 200). The window is bounded twice, in commands past the
 * last one run alive (`tradeWindowTicks`) and in the room's own time after the kill (`tradeExpiryTicks`, Codex's P1 on
 * PR #698), each by the seat's cap.
 */
export const TRADE_WINDOW_CAP_MS_ADAPTATION = REWIND_CEILING_MS_ADAPTATION;
/**
 * NCW-2 B-trade: how many commands, counted from the shooter's last command run alive (that one the 0th), his page sent
 * before it could have known of his death, by the room's own measure of his line -- `rttMs`, the seat's smoothed
 * heartbeat round trip (`Player.pingExact`, `noteRoundTrip`), capped at the seat's rewind cap (`rewindCapMs`, NCW-2
 * B-bound; at most `TRADE_WINDOW_CAP_MS_ADAPTATION`). The page
 * sends one command a tick (`TICK_HZ`); the last command run alive left it at least one way before the room's kill, and
 * the kill reaches it one way after: so a command fewer than a round trip's ticks after that one left before the page
 * could know. A lower bound -- that command may have waited in the room's queue, so the page knew later still -- and 0
 * with no measure (today's rule: refused `not alive`). "Sent before it could know" holds for an HONEST measure only:
 * the round trip is the page's pong (`server.ts`'s heartbeat), which a page can move by holding its pongs or sending
 * crafted unsolicited ones (`rewindCapMs`'s note; LATER 717) -- up to the cap, which is what bounds a forged one. What that buys is bounded too: rate-gated rounds from the frozen last
 * alive pose (`tradeFrame`), never older than a living shooter's rewind; each traded round is counted per seat
 * (`signals.trade`), so its use shows.
 */
export function tradeWindowTicks(rttMs: number): number {
  if (!(rttMs > 0)) return 0;
  return Math.ceil((Math.min(rttMs, rewindCapMs(rttMs), TRADE_WINDOW_CAP_MS_ADAPTATION) / 1000) * TICK_HZ - 1e-9);
}
/**
 * NCW-2 B-trade, Codex's P1 on PR #698 (an adaptation; research 223 §4): the slack, ms, the trade's expiry on the room's
 * clock (`tradeExpiryTicks`) allows past the seat's measured line. The original has no expiry (its console applies a
 * dead attacker's `Hit` whenever it arrives: `TRADE_WINDOW_CAP_MS_ADAPTATION`'s sources). Why a slack at all: the last
 * command an honest page sent before it could know of the death reaches the room at most about one round trip after the
 * kill (the kill's word one way down, that command one way up), but the round it carries is decided only once the
 * command after it has run (`due`: a command more, a tick at the page's rate), the line's arrivals bunch, and the
 * smoothed round trip (`pingExact`) lags the line's instant one. Its value is the room's own allowance for an honest
 * command's arrival wander, `FIRE_ARRIVAL_JITTER_TICKS` (3 ticks, 50 ms at `TICK_HZ` 60), which a living round's stale
 * bound already grants -- no new measure, and small beside the window it extends (at most 24 + 3 ticks: `tradeExpiryTicks` at the ceiling, NCW-2 B-bound).
 */
export const TRADE_ARRIVAL_JITTER_MS_ADAPTATION = (FIRE_ARRIVAL_JITTER_TICKS * 1000) / TICK_HZ;
/**
 * NCW-2 B-trade, Codex's P1 on PR #698: the room's ticks after the kill (`Player.diedAt`) within which a dead shooter's
 * round may still be decided as traded -- the seat's measured round trip in ticks, capped (`tradeWindowTicks`), plus
 * `TRADE_ARRIVAL_JITTER_MS_ADAPTATION`; 0 with no measure. The window is so bounded twice: in commands (`tradeWindowTicks`
 * past the last command run alive) AND in the room's own time, so a page that falls silent at its death and later sends
 * commands and a round named inside the command window, with a current `viewTick`, is refused `not alive`.
 */
export function tradeExpiryTicks(rttMs: number): number {
  const w = tradeWindowTicks(rttMs);
  return w > 0 ? w + Math.ceil((TRADE_ARRIVAL_JITTER_MS_ADAPTATION / 1000) * TICK_HZ - 1e-9) : 0;
}
/**
 * The most commands a batch may carry (PL-9/PL-16 of the launch review): the client repeats its last
 * `COMMAND_REDUNDANCY` (3) in each; the rest is room for a batch after a lost frame. A longer batch is dropped whole, so a
 * frame costs at most this many inserts.
 */
export const MAX_BATCH = 16;
/**
 * The commands a player's queue holds at most (10 s): a flood past it is cut off the queue's head and, LATER 136, dropped
 * as a backlog at the next step's top (`Player.cut`, at most this many kept, `dropStretch`).
 */
const QUEUE_MAX = 600;
/**
 * HOTFIX grenade fuse (2026-11-02; research 85 §6.1): a server guard, no original (the console never catches up: it
 * stretches one frame's dt, research 180 §0). The most game frames the room's flight runs in one step (`flyGrenades`,
 * on the step's credit): the queue's 10 s (`QUEUE_MAX` commands, 300 frames) -- no body is credited more than its queue
 * holds, the intake cutting the rest (LATER 136) -- so a stall's credit the bodies may yet run is flown, and a longer
 * one's surplus is dropped as the page's own accumulator drops a stalled tab's (`GAME_FRAME_MAX_STEPS`, the 30 the room
 * kept before: about a second, so a stall past it put the fuse behind the bodies for good).
 */
export const ROOM_FLIGHT_MAX_FRAMES_ADAPTATION = Math.ceil(QUEUE_MAX / TICK_HZ / GAME_FRAME_DT);
/**
 * The timed events (a round, a reload) waiting for their command to be run, at most; and how long one waits for it (the
 * queue's 10 s). A round is decided at its own command -- the mover, the cone and the clocks as they were then -- once
 * the command after it has run too (the page's look runs up to a tick ahead of the command it names).
 */
const PENDING_MAX = 32, PENDING_TICKS = QUEUE_MAX;
/**
 * The `loadout` requests a player may send (protocol 7; the review's guard, as the batches' and the rounds' are): a
 * burst of `LOADOUT_BURST`, then one each `LOADOUT_EVERY` ticks (a menu confirms once a press, one step a press); a
 * request past the budget changes nothing and is answered `rate` (the page pairs each answer with its request in order).
 */
export const LOADOUT_BURST = 8, LOADOUT_EVERY = 6;
/**
 * KEPT_RECONNECT_READING: how long a departed player's record (`Room.kept`: its type, its picks, the round it spawned
 * in) waits for its reconnect, ms. The game has no reconnect (a departure is a leave: `FUN_002bc530` D:L161109-161146,
 * research 315 §3.3), so this is a server policy, no game value: the page's rejoin after a drop comes at once, then
 * 2, 4, 8, then every 10 s (`../../viewer/src/netPage` `retryDelayMs`, 44 s through its seventh attempt): 60 s covers it. The record
 * is keyed by the page's session token alone (the hello's `session`, S2 round 4: one a tab, kept across a reload) --
 * never the address or the name -- and taken once; past the window the token is a new joiner's (research 95 §8). A
 * reconnect that comes while the old socket is still seated (an unclean drop: the heartbeat drops it only 20-25 s
 * later, `./server` `PEER_SILENCE_MS_PLACEHOLDER`) takes the seat over instead (`Room.hello`, `takeOver`) -- and, the
 * same account within `RECONNECT_ALIVE_WINDOW_MS_ADAPTATION` of its last frame with its body alive, takes the body
 * back alive under its old id (OT.R59, `handBack`).
 */
export const KEPT_RECONNECT_READING = 60_000;

/**
 * LATER 205 (research 215 §8.7; reading, pending review): a mount asked while a charge is being placed (the claymore's,
 * the PMN's, the satchel's, the bomb's or C4's clip and the kit's timer, D:L475321-475486). As read, neither the offer
 * (`FUN_005a88c0`), `FUN_005b4340(actor, 10)`, the press (`FUN_00546210`) nor the mount (`FUN_005463c0`) asks it, so
 * the room takes the mount (the take pops the clip and hands the timer over, A1's `mountPop`). Open: the turret's offer
 * vfunc `+0x5c` (D:L463034), whether `FUN_005c4600` / `FUN_005c6980` / `FUN_005c8a20` clear the kit's pending bit or
 * `+0x87c`, and whether a popped C4 clip runs its 0.45 callback `LAB_005bfe40` (`FUN_00589aa0` D:L446479-446731).
 */
export const MOUNT_DURING_PLACEMENT_READING = "taken: the grant's checks ask no placement (D:L412130-412166, D:L469307-469560)";
/**
 * LATER 205: the Detonator across a mount. Its fire is instant (`FUN_005be9a0` 0xc1 -> `FUN_005c0130`,
 * D:L475477-475478, D:L476010-476035) and a mounted body takes up no item (`FUN_005a8cb0` D:L463174), so the room judges
 * it at its command (`mountedRefused`). Open: its closing switch to the claymore's slot (`FUN_005c8a20(kit, 0x99)`
 * D:L476032, unread), which a mount after it saves (`+0xebc`, D:L412214-412215).
 */
export const DETONATOR_ACROSS_MOUNT_READING = "judged at its command, instant: no clip or timer for a mount to cut";
/**
 * LATER 205: the Action button's C4 on a just-mounted body online. Online the builder posts the C4 offer during the
 * first 1250 after a mount (`FUN_005a8850` D:L462983-462992 against `+0x22c`, D:L412212; the offer D:L452383-452409),
 * gated by `FUN_005a7de0(actor, 1, 1)`'s action-flag walk (D:L462698-462706, unread under "Stand -> Turret"); the room
 * refuses every equipment from a mounted body (PF.R31, `mountedRefused`). Settled by that walk's read or a capture.
 */
export const MOUNT_ONLINE_C4_WINDOW_READING = "none: no equipment from a mounted body";

/**
 * RECONNECT_ALIVE_WINDOW_MS_ADAPTATION (OT.R59, the owner's "Keep it alive", 2026-10-16; RECONNECT-GHOST): how long
 * after the room's last frame from a seat's connection a newer hello of the same account (`hello`'s `as.account`, the
 * bridge's seat account) takes the body back where it stands, alive, under its old id (`handBack`, `resume`), ms. A
 * labelled adaptation with no original (the game has no reconnect: `KEPT_RECONNECT_READING`): the page's retries after
 * a reached match come at once, then 2 and 4 s apart (`../../viewer/src/netPage` `retryDelayMs`), so 10 s holds three attempts
 * and their handshakes, under the heartbeat's 20 s (`./server` `PEER_SILENCE_MS_PLACEHOLDER`), so the old connection
 * still holds the seat through it. Past it, today's takeover: a reconnect's ghost in a classic round in play. A seat
 * merely silent but still connected is not stepped (today's stall: frozen until its commands or its hello come, about
 * 1 s in the owner's log); only a parked seat (step 2, `leave`) takes the neutral steps (`PARKED_BODY_NEUTRAL_ADAPTATION`).
 * A page that leaves says `bye` first and is never parked; one whose `bye` never gets out (the browser kills the page
 * before its pagehide's send) stands parked up to the window, 10 s, then leaves as today. A page put in the back-forward
 * cache fires its pagehide (persisted) too, so it says `bye` and leaves at once, not parked; restored, it rejoins as
 * today (a reconnect's ghost in a classic round in play).
 */
export const RECONNECT_ALIVE_WINDOW_MS_ADAPTATION = 10_000;

/**
 * RECENT_HIT_DEATH_MS_ADAPTATION (NET-RES.R11 (a), the owner's ruling of 2026-10-24 in the deploy seat: "Credit the kill if
 * recently hit"; OT.R77, an adaptation under OT.R27 -- the original has no hold, a lost console is a leave): a body taken
 * out of the world (`takeAway`) whose last damage from an enemy (`Player.lastHurt`, laid by `combat`, the one path every
 * applied hit and blast passes -- an enemy attacker's only: its own damage, a fall's, or a teammate's credits nothing; the
 * re-read's N1) came no earlier than this long before its seat's last frame -- the drop -- dies credited to that enemy,
 * resolved by its session token at the takeaway (so a damager who reconnected still takes it; N2), through `kill` (the
 * kill, the score and the death, as any kill scores). Anchored on the drop, not on the takeaway: the
 * body's own hold (OT.R59, `RECONNECT_ALIVE_WINDOW_MS_ADAPTATION`) is not the player's choice, so a hit just before the
 * cable is pulled must count however long the frozen body then stands; a hit during that hold counts too (it is after
 * the drop). 10 s, the body's hold mirrored before the drop: the drop is the window's middle -- 10 s back for the hit
 * that provoked it, 10 s forward while the body stands. Credited only in a round (`inRound`: play, expired or decided),
 * never between rounds (the re-read's N5).
 */
export const RECENT_HIT_DEATH_MS_ADAPTATION = RECONNECT_ALIVE_WINDOW_MS_ADAPTATION;

/**
 * PING_FROM_HEARTBEAT_ADAPTATION (PT195-4, LATER 329; product track): the score row's `ping` is this server's smoothed
 * round trip for that seat, milliseconds. The original's SELECT board has the columns KILLS, DEATH and SCORE only
 * (research 87 §12, 91 §11: `FUN_0022a8b0` draws the board, `FUN_0022a290` its rows) and keeps no per-player round
 * trip, so the number is a labelled adaptation: the match server times its WebSocket heartbeat ping to the browser's
 * pong (`server.ts` `sweepHeartbeat`, `pongSentAt`) and folds the samples here (`smoothPing`), unrounded, the row
 * rounded from that (`pingRowMs`). It changes no rule of play. The row stays 0 until a sample has landed.
 */
export const PING_FROM_HEARTBEAT_ADAPTATION = 'the score row ping is the heartbeat ping/pong round trip, smoothed' as const;
/** How much of a new sample replaces the held ping (an eighth: a spike moves the row, it does not become the row). */
export const PING_EWMA_ALPHA_ADAPTATION = 1 / 8;
/** A sample past this is a stalled tab, not a round trip, and is left out. */
export const PING_SAMPLE_MAX_MS_ADAPTATION = 10_000;
/** The most the row carries. A longer accepted sample is shown as this. */
export const PING_ROW_MAX_MS_ADAPTATION = 999;
/**
 * PING_SCORE_RESEND_MS_ADAPTATION (NCW-7, the owner's word 2026-11-05 "build the scoreboard ping yeah"; product track):
 * the board's PING column is fed by the `score` rows, which go out only when the board changes (`scoreDirty`). Once a
 * heartbeat sweep (`Room.notePingSweep`, called by the match server before each sweep's pings), the board is marked
 * changed when a seat's shown ping moved this many whole ms or more from the value the room's last score broadcast
 * carried, or has its first reading. Why 5: a smaller drift is noise on a 1 ms-unit column, and the check runs once per
 * room per sweep, so the cost is at most one extra `score` message a room per heartbeat (5 s), whatever the number of
 * seats.
 */
export const PING_SCORE_RESEND_MS_ADAPTATION = 5;

/** A sample the row will fold, unrounded, or null when it is not a round trip. At least 1 ms, so a sub-millisecond loopback still reads. */
export function pingSampleMs(sampleMs: number): number | null {
  if (!Number.isFinite(sampleMs) || sampleMs < 0 || sampleMs > PING_SAMPLE_MAX_MS_ADAPTATION) return null;
  return Math.min(PING_ROW_MAX_MS_ADAPTATION, Math.max(1, sampleMs));
}

/**
 * The next smoothed ping, unrounded (the takeover review's F3: rounded at each step it stuck up to 4 ms off): the first
 * sample is taken whole; each later one moves an eighth of the way toward it. The row is `pingRowMs` of it.
 */
export function smoothPing(previous: number, sampleMs: number): number {
  const sample = pingSampleMs(sampleMs);
  if (sample === null) return previous;
  if (previous <= 0) return sample;
  const next = previous + PING_EWMA_ALPHA_ADAPTATION * (sample - previous);
  return Math.min(PING_ROW_MAX_MS_ADAPTATION, Math.max(1, next));
}

/** The score row's whole milliseconds for a smoothed ping: 0 (no sample yet) stays 0; otherwise rounded, 1 .. 999. */
export function pingRowMs(exact: number): number {
  return exact <= 0 ? 0 : Math.min(PING_ROW_MAX_MS_ADAPTATION, Math.max(1, Math.round(exact)));
}

/**
 * PARKED_BODY_NEUTRAL_ADAPTATION (OT.R59; RECONNECT-GHOST step 2, the gameplay seat's condition): a parked seat's body
 * (`Room.leave` on a close that may park) is stepped each tick with a neutral command -- the stick at rest, no buttons,
 * its last yaw and pitch, numbered on from the room's count -- so it falls and lands, its holds run out, its trigger is
 * let go, a traversal finishes and its clocks (a reload's) run, as a console whose pad is let go would. A parked seat
 * only: a silent seat still connected is never stepped (neutral commands under numbers its lagging client is about to
 * send would drop its real ones). The idle kick and the vote kick of a parked seat wait for the park's end (it has no
 * connection to close). A labelled adaptation: the original has no reconnect (`KEPT_RECONNECT_READING`).
 */
export const PARKED_BODY_NEUTRAL_ADAPTATION = 'a parked body stepped each tick: the stick at rest, no buttons, its last look' as const;

/**
 * RECONNECT_HELD_LAUNCHER_ADAPTATION (OT.R59; the gameplay seat's condition 4 (b), RECONNECT-GHOST): a resumed seat's
 * raised launcher comes back lowered, on the room and the page alike -- at once, as a spawn's kit lowers it (no lower
 * clip, no set, no firearm wait), so the new page's first trigger is the firearm's. A labelled adaptation: the original
 * has no reconnect (`KEPT_RECONNECT_READING`).
 */
export const RECONNECT_HELD_LAUNCHER_ADAPTATION = "a resumed seat's raised launcher comes back lowered, on the room and the page alike" as const;

/**
 * DEPARTED_CHARGES_READING (research 95 §8; a reading, open -- the S3 repair corrects its sourcing): a departed player's
 * charges and rounds stay in the room, no one's. What the source shows: `CZSealBody`'s destructor (0x5533e0,
 * L419187-419188) runs `FUN_003ccd90` (L321613-321640) over the placed list 0x4b5220, and `FUN_003c7d50`
 * (L318935-318955) clears, for an entry of kind 5 (`+10`), the field `+0x1c` that names the body in each 0x20-byte record
 * of the array at `(+0x28)->+0x48` (count `(+0x28)->+0x34`). It does not clear the field `FUN_003cc1f0` counts a
 * player's charges by (the entry's `+0xac`, L321194-321210), and no code read so far does on a departure: whether the
 * game's charges stay counted against, or set off by, a departed body is unread. The room's policy is the server's own:
 * it keeps its projectiles' thrower by the player object (`Flying.owner`), so an id the server hands on after a leave (a
 * new page) never inherits them: not counted against it, never passed over by its rounds (`claymoresDown`, `bodyCast`).
 * A kill by one is the orphan's line (`thrower`). A takeover is no departure (the second S3 repair): its projectiles pass
 * to the seat's new body (`TAKEOVER_ROW_READING`, `seat`).
 */
/**
 * TAKEOVER_ROW_READING (research 95 §8): a takeover -- the page's newer connection of its session token taking its seat
 * (`Room.takeOver`) -- is the same person, so its scoreboard row (kills, deaths, score, the round's score) goes with the
 * seat as its type and picks do -- and its charges and rounds in flight (the second S3 repair: their owner re-pointed to
 * the new body in `seat`, so they count against it, go off by its Detonator and kill as its own). The game has no
 * reconnect (research 91 §17): a server policy. A leave and a later reconnect is a new row, as a departure is in the game.
 */
export const TAKEOVER_ROW_READING = 'the row kept' as const;

/**
 * ARMORY_SEAT_READING (research 95 §8; web sprint 5, the S3 review's controller ruling under the owner's mandate): the
 * game's ARMORY is the lobby's, before the launch (research 95 §4.1), so a player spawns with what it chose there. The
 * viewer's stand-in (W5.R1) opens on a seat instead: a page that says so in its hello (`armory`) has the screen opened
 * on a first seat (a respawn room's, a classic ghost's, a waiting room's) and a promotion's -- never a takeover's or a
 * reconnect's, in any room (the S3 repair: the page was seated before -- the session's live connection taken over, or
 * its leave within `KEPT_RECONNECT_READING`, a record of its choices kept or not), nor under the round's lock (a type
 * spawned in this round, `spawnedThisRound`). One exception: a rejoin whose page still shows the screen (the hello's
 * `armoryOpen`: a drop or a takeover under the open ARMORY) is held as a first seat is, so its later changes are taken
 * and the spawn still waits for the screen to be left. The welcome and the promotion say so (`armory`); the seat's
 * first spawn waits (`Player.arming`) until the page's `ready` (the screen left) or the round's start, and until then
 * its requests are the ARMORY's -- taken as each change is made, for the spawn to come (not alive, not spawned in the
 * round: `loadout`'s gates pass them). Each accepted change is activity for the idle clock (`idle`, W3.R13).
 */
export const ARMORY_SEAT_READING = 'first and promoted seats, and a rejoin under the open screen; the spawn waits' as const;

/**
 * LATE_SEAT_ACTOR_READING (LATE-SPAWN-HANDOFF's review, row (d); LATER 85; research 322 §5.3): when the room makes a late
 * seat's body -- a seat the bridge marks late (`hello`'s `as.late`, its +0xcc: a console that joined a launched game and
 * has not loaded). The original makes a late console's actor only at that console's own load, dead: no console holds
 * it before (others make it from its `SealState`, published from the load state's tick after the load,
 * `FUN_001f5e70` D:L55680-55690 -> `FUN_002b7a90`), and `FUN_002b7d60` puts it dead at once (`FUN_00543d50`
 * D:L158634-158647). Both rooms await `loaded`: classic keeps a ghost until the next round; respawn enters dead with
 * alpha zero and can come up after its >5 s press gate (`FUN_00592560` D:L451699-451724), without an ordinary corpse's
 * fade. ONL-32's original-runtime capture is still owed. [reading, pending review]
 */
export const LATE_SEAT_ACTOR_READING = 'a late seat has no body until its load; classic keeps a ghost, respawn enters dead with alpha zero' as const;

export const DEPARTED_CHARGES_READING = 'no one\'s, where they lie' as const;

/**
 * [placeholder] MAP-10b (ruling PF.R31; research 215 s4): a manual turret takes no damage this sprint -- no health, no
 * destruction, no rounds or blasts held against it. The authored `HEALTH 30` is read (`TurretDef.health`,
 * D:L301657-301660), its damage path untraced (no `DESTROY_ANIM` run). Owed: the damage path's read, or capture B 13.
 */
export const TURRET_DAMAGE_PLACEHOLDER = 'indestructible' as const;

/**
 * [reading] MAP-10b, TURRET-CONE (research 215 s4, s8.2; reading, pending review): a turret round leaves the room's own
 * firepoint (`../../viewer/src/net/emplacement` `muzzleAt`; the turret's vfunc `+0x60`, `FUN_005be9a0` D:L475525) along
 * the claim's line, which must lie inside the occupant's cone -- the kit's on the turret record at
 * `TURRET_RETICLE_STANCE_READING`'s row (`ShotCone`, `AimMover.coneStance`), bloomed by each turret round -- about the
 * gun's own line at the command's clamped aim (`gunLine(clampAim(...))`; vfunc `+0x68`, D:L475600). The original
 * overwrites the converged direction with that line and rolls the cone on it (`FUN_00592260` through the controller's
 * `+0x74`, D:L475601-475602; D:L451531-451577), so no eye and no bind are asked (`ShotCone.checkLine`); the page rolls
 * (`TurretPage.round`), the room bounds, as the rifle's split. Was a placeholder, 'the gun line, no cone'. Owed:
 * capture B 13 (a burst's spread at range; an MGL round's line).
 */
export const TURRET_ROUND_LINE_READING = "the gun line, the kit's cone" as const;

/**
 * [adaptation] TURRET-CONE's review F1 (research 215 s4, s8.2; the network's, with no counterpart in the original): a
 * mounted round refused 'rate' on the room's event clock alone -- its command at the cadence (`frame.count - lastFire`
 * at least the cycle), its arrival bunched by the network (`FIRE_ARRIVAL_JITTER_TICKS`) -- blooms the occupant's cone as
 * the round's step would (`ShotCone.round`) when its claim lies inside the cone, and stands as the cadence's last round
 * (`TurretState.lastFire`); nothing is spent or fired. The console's own gate fired that round and bloomed it
 * (`FUN_005c0ae0` via `FUN_005c0fd0` D:L476569, D:L476638: one clock, the console's), so the page's kit has; without
 * this, two such drops in one burst leave the room's cone so far behind the page's that the rest is refused 'cone'. At
 * most one bloom per cycle of the occupant's commands (each sets `lastFire`), never for a claim outside the cone: a
 * spray of refused claims opens the cone no wider than an honest burst's.
 */
export const TURRET_JITTER_BLOOM_ADAPTATION = 'a round refused on the event clock alone blooms the cone, once a cycle' as const;

/**
 * [adaptation] LATER 105 (the network's, with no counterpart in the original; the rifle's twin of
 * `TURRET_JITTER_BLOOM_ADAPTATION`): a round on foot that passes every check but the room's own clock -- its command at
 * the cadence (`frame.count - lastFire` at least the cycle), its time on the room's clock early (`eventClock` against
 * `fireClock` less `FIRE_ARRIVAL_JITTER_TICKS`: after a stall past `FIRE_STALL_CREDIT_TICKS`, or a fall in the line's
 * latency mid-burst) -- is refused 'rate' as before, and blooms the room's cone as the round's step would
 * (`ShotCone.round`) and stands as the cadence's last round (`Player.lastFire`); nothing is spent, fired or scheduled
 * (`fireClock` kept). The console's own gate fired that round and bloomed it (`FUN_005c0ae0` via `FUN_005c0fd0`
 * D:L476569, D:L476638: one clock, the console's), so the page's kit has; without this, one or two such drops leave the
 * room's cone behind the page's and the rest of the burst is refused 'cone' (LATER 105's read). At most one round's
 * bloom per cycle of the commands, and only for a round inside the cone that no other check refuses (mid-swap, NoFire,
 * the binoculars, reloading or dry, the line). A shotgun's round is a pull: it blooms once a ray, as an accepted pull
 * (LATER 170 (3), the original's: `FUN_005be9a0`'s ray loop calls `FUN_005c5340` once a ray, D:L475604, which blooms,
 * `FUN_005c3360` D:L479542) -- the pull's first ray opens a refused volley (`Player.volley`, `refused`) and its later
 * rays, at most its pellets on that command (`ofVolley`'s bound), bloom and are refused the same; a forged spray of rays
 * past the pellets is refused without a bloom. The refused round is told to the page (`stale`, request 'fire', its
 * seq, once a round: its journal refunds the round it predicted, `netPage.ts` `case 'stale'`; LATER 170 (1), the
 * network's bookkeeping) and ends the throw's request as an accepted round does (`p.throwStart` cleared; LATER 170 (2),
 * THROW-INTERRUPT F1). A muzzle refusal blooms on its own terms, the same three with it (`REFUSED_ROUND_CONE_ADAPTATION`,
 * LATER 510). A spray of early claims blooms the cone at most once a `ceil(cycle - 1)` commands (with the one-tick
 * bloom) -- faster than an honest burst's cadence below the kit's cap, the same cap (the #475 takeover's review F2). A
 * refusal's reason when a round is both early and refused by a later check is that check's (was 'rate').
 */
export const RIFLE_JITTER_BLOOM_ADAPTATION = 'a rifle round refused on the room clock alone blooms the cone, once a cycle (a pull: once a ray), and is told stale' as const;

/**
 * [adaptation] LATER 326 (issue #455, PT195-1; the network's, with no counterpart in the original). One tick of the
 * command clock. The room's cycle is already `FireWait` (× 0.8 in burst and automatic, `FUN_005c09f0`) × `TICK_HZ`,
 * less one tick for the page's frame. A 30 Hz page packs two 60 Hz commands into a frame, so a held burst's gap is
 * sometimes one tick inside that cycle. `REFUSED_ROUND_CONE_ADAPTATION`.
 */
export const REFUSED_ROUND_BLOOM_TICKS = 1;

/**
 * [adaptation] LATER 326 (issue #455, PT195-1; #475, Fuse's, its room side taken over; reading, pending review -- the
 * growth per round is research 84 §3's transcription). A round on foot the room refuses either one tick inside
 * the cycle (`REFUSED_ROUND_BLOOM_TICKS`: `frame.count - lastFire` at least `cycle - 1` and under `cycle`) or at the
 * muzzle (`startRefused`, `muzzle far` or `muzzle walled`), and whose claim lies inside the cone, blooms the room's
 * cone as the round's step would (`ShotCone.round`) and stands as the cadence's last round (`Player.lastFire`).
 * Nothing is spent, fired or scheduled (`fireClock` kept). The console fired that round and bloomed it: each round
 * that leaves adds `Dilate × (1 + s)` (`FUN_005c3360` from `FUN_005c5340`, research 84 §3), and the
 * console has one clock (`FUN_005c0ae0` via `FUN_005c0fd0` D:L476569, the round leaves at D:L476638). The room's
 * count-rate and its muzzle check are the port's split of that clock, not a second gate in the original. Without
 * the bloom, the page's cone is a step ahead and the rest of the burst is refused `cone` (game 195: 84, 20 of 21
 * cone seconds after a rate or muzzle refusal). A claim further inside the cycle does not bloom, and a claim outside
 * the cone does not, nor an accepted shotgun volley's later ray (`ofVolley`: it skips the rate): a spray opens the cone
 * no wider than one round's step per `cycle - 1` commands. A shotgun pull refused one tick short of the cycle, or at
 * the muzzle, blooms once a ray, is told to the page (`stale`, once a round: the network's bookkeeping) and ends the
 * throw's request (THROW-INTERRUPT F1), as the early path's (`RIFLE_JITTER_BLOOM_ADAPTATION`, LATER 170; LATER 510 the
 * muzzle's): its later rays, at most its pellets, bloom and are refused the same (the original's per-ray bloom,
 * `FUN_005be9a0` D:L475604 -> `FUN_005c3360` D:L479542). The page's kit runs the
 * console's timer (`../../viewer/src/fire` `update`, LATER 326): an honest burst names a round one tick inside the
 * cycle only where its frames round a gap short (LATER 338: 20 fps), and this blooms it. Was (#475 as filed): the
 * page also held its trigger for the room's command count -- a gate the original does not have, left out.
 */
export const REFUSED_ROUND_CONE_ADAPTATION = 'a round refused one tick short of the cycle, or at the muzzle, blooms the cone once (a pull: once a ray), and is told stale' as const;

/**
 * ROOM_RAISE_TRUST_ADAPTATION (P13, the online-parity sweep's AR-3 = WK-4; an adaptation -- the room's trust, no original:
 * the game has no server, research 91 §15): the room models no raise envelope for a hand's round and leaves the raise's
 * refusal to the page. The original refuses a bullet-class round while the raise envelope `actor+0x1160` reads below 1
 * (`FUN_005c0ae0` D:L476420-476438; research 215 §8.3-8.4): from a cleared envelope (the body's start, the 5 s idle lower
 * D:L453600, a throw's lower D:L453488) the first round leaves 2 game frames after the press. The page holds it -- the
 * rifle's (LATER 180: `../../viewer/src/fire` `FireSource.raiseRefused` from `WeaponRaise`) and the rocket launcher's
 * (LATER 192: `../../viewer/src/matchThrow` `setItemRaise`) -- and the room judges a rifle round (`fireAt`) and a rocket
 * (`launchRocket`) with no raise test, so a forged page fires those frames early from a lowered rifle or launcher. What
 * the room holds is the launcher's take-up and the firearm's way back (`heldReadyAt`, `firearmReadyAt`). Honest play is
 * untouched. The build (LATER 641): a headless `WeaponRaise` per seat from the commands' Trigger bit, the swaps and the
 * lowers, refusing 'raise' at the round's frame -- mirroring the 5 s idle lower and the float32 step
 * (`RAISE_ENVELOPE_STEP_READING`, LATER 185) or carrying a one-frame named slack. Research 84 §11, research 215 §8.4.
 */
export const ROOM_RAISE_TRUST_ADAPTATION = "the room models no raise envelope: a round from a lowered rifle or launcher is the page's to refuse" as const;

/**
 * [adaptation] LATER 107 (the network's; research 215 s8.2): a round, or an R, named on a command the room ran before it
 * took the mount -- the ask's own command, or one before it arriving late (within `FIRE_ARRIVAL_JITTER_TICKS`) -- is the
 * hand's, judged on the hand's path: its magazine, rate, lock and cone, the hand's record lent to the cone for the check
 * and the turret's given back. The console fires the slot selected on the round's own frame (`FUN_005be9a0`
 * on the kit's `+0x824`: D:L475994, D:L476624, D:L476638), and the turret's slot is selected only when the mount runs
 * (`FUN_005463c0` D:L412217-412218; online on the new owner's arrival, `FUN_002c7d00` D:L168016-168019): one machine, no
 * judgement after the fact. LATER 178: the bloom lands at the round's own command, by the hand's record, and the commands
 * run mounted since (at most `FIRE_ARRIVAL_JITTER_TICKS`) are run again on the cone (`ShotCone.round`) -- was: on the
 * turret's kit after them, clamped to the hand's limits. Was: judged by `mounted` at the decision -- the round refused
 * 'before the mount' (TURRET-CONE's R1) and the R taken as the turret's reload.
 */
export const MOUNT_ROUND_AT_COMMAND_ADAPTATION = "a round or an R named before the room's mount is the hand's, judged at its command" as const;

/**
 * [adaptation] LATER 172 (the network's; research 215 s8.2, LATER 107's family): an equipment use (`throw`, every kind),
 * a throw's release request (`throwStart`), a hostage order, a door, a switch's action or a bomb drop is refused
 * 'mounted' (PF.R31) by the turret the body held after the command it names (`AimFrame.turret`, LATER 107's;
 * `mountedAt`), not by the room's `mounted` when it is judged. One named on a command the room ran before it took the
 * mount -- the mount ask's own command S, or one before it arriving late -- is judged unmounted; one named on a command
 * run mounted and judged after the room took the release (the dismount's own command d, or one before it) is refused.
 * The console asks on the frame it acts, one machine: the slot in the hand is the turret's from the mount's own frame
 * (`FUN_005463c0` D:L412214-412218) and the swap gate reads the actor's turret (`+0xeb8`) on the frame it is asked
 * (`FUN_005a8cb0` D:L463174). A command with no frame -- not yet run when an equipment use is judged at its arrival
 * (every kind but a throwable's, judged there), dropped in a backlog or a cut (LATER 123, 136), or past the history --
 * is judged by the present `mounted`, as before. The bound (the fresh review's F1): the frame is read only for a command
 * within `FIRE_ARRIVAL_JITTER_TICKS` of the body's newest run command (`decide`'s stale measure, `p.sim.seq - seq`); an
 * older one is judged by the present `mounted`, so a forged mounted page cannot name a pre-mount command still in the
 * history to set off a Detonator, lay a charge, launch a round or raise a launcher at once from the turret. Was: the
 * present `mounted` alone -- an honest ask on S arriving after the take refused 'mounted', and an ask forged on d
 * decided after the release taken.
 */
export const MOUNT_ASK_AT_COMMAND_ADAPTATION = "an ask is refused 'mounted' by the turret held at its command, not at its judgement" as const;

/**
 * [placeholder] A1 (LATER 218; research 215 s8.6, the push read): a bolt's or a pump's after-shot timer running at the take
 * is handed to the turret's slot with the kit's one timer `+0x820` (the take-up `FUN_005c4b10` zeroes `+0x810`, never it:
 * D:L478836, D:L478926), so the turret's trigger is not read until it ends (`FUN_005c0fd0` D:L476549-476563); at its end
 * the after-shot's flag runs `FUN_005c3000` (D:L476554-476558) on the slot in the hand, the turret's -- unread on a turret
 * slot. The room's stand-in: the turret refused to the timer's end and nothing lands (`Room.mountKit`, `mountKitLate`).
 * Settled by `FUN_005c3000`'s read on a class-0 turret slot, or a capture (a bolt's round, then a mount inside its
 * after-shot).
 */
export const MOUNT_CARRIED_AFTERSHOT_PLACEHOLDER = 'carried to its end on the turret, landing nothing' as const;

/**
 * [adaptation] LATER 174 (the network's; the dismount's mirror of `MOUNT_ROUND_AT_COMMAND_ADAPTATION`): a round named on
 * a command run mounted (its frame holds a turret) and decided after the room took the release -- the dismount's own
 * command d (the release is taken before d + 1, `TURRET_RELEASE_SEQ_ADAPTATION`), or one before it arriving late -- is
 * that turret's, judged at its command on the turret's path (`turretRound`: the turret's rounds, summed back onto it at
 * the release, its rate and its cone about the gun's line), the turret's record lent to the cone for the check and the
 * hand's given back (the bloom at the round's own command, by the turret's record, the commands since run again: LATER
 * 178, `ShotCone.round`); a round spent is told to every page (the turret's count, `turretWire`). A round named
 * inside the mount clip (its frame's `fire` false, the clip's `NoFire`) is refused 'nofire' first, as LATER 173's
 * mounted check refuses it (the fresh review's F2). The turret held by another since: refused 'released'. An R named
 * there is the turret's and arms nothing: the release that followed drops the kit slot's timer
 * (`TURRET_RELEASE_RELOAD_READING`, the port's choice -- settled the other way, both change together), so the rifle is
 * left alone. The console fires the slot selected on the round's own frame
 * (`FUN_005be9a0` on the kit's `+0x824`), which is the turret's until the release (`FUN_00545ee0`). Was: judged by
 * `mounted` at the decision -- an honest turret round down the rifle's path, refused 'muzzle walled' though the page drew
 * it; the R the rifle's reload; a forged rifle-shaped claim refused only by the muzzle's geometry.
 */
export const DISMOUNT_ROUND_AT_COMMAND_ADAPTATION = "a round or an R named on a mounted command is the turret's, judged at its command" as const;

/**
 * [reading] PAR-59 (research 215 s8): what a mounted MGL FRAG TURRET's round inherits at its launch -- none here. The kit's
 * fire hands the launch the actor's `+0x38` (`FUN_005be9a0` D:L475604 -> `FUN_005c5340` -> `FUN_003d2d70` ->
 * `FUN_003cb1a0`, added to MV x dir at D:L320731); the hold writes the body's place each frame and skips its move
 * (D:L413914-413919), and what `+0x38` holds then is unread. Owed: that read, or capture B 13 (an MGL round's arc).
 */
export const TURRET_LAUNCH_INHERIT_READING = 'none' as const;

/**
 * The combat report's refusals a player is told at most each tick (INT.R5; Chris's browser-beta-v5 cap of 4, d578f347):
 * a server policy of a playtest instrument, not a game value -- a flood of bad requests is still dropped and counted
 * (`Room.takeDrops`), only its reports past this are not sent.
 */
export const COMBAT_REPORT_REJECTIONS_PER_TICK = 4;
/** The combat report's reason for a hit or a blast friendly fire spared (W3.R11: off, the create-game default). */
const FRIENDLY_FIRE = 'friendly fire';

/** A name's longest before the lobby's own cut (the lobby trims to the game's; this refuses a flood first). */
const NAME_MAX = 256;

/** The kit a player is seated with, before its first spawn gives it its type's (a ghost's: it fires nothing). */
const SEATED_RECORDS = kitRecords(null, BAKED_LOADOUT);

/**
 * The throwables and charges without the disc's kit table (a test, a disc without `ZWEAPON.ZAR`): `@s2u/scene`'s
 * transcriptions and their rounds' `Piercing` (research 91 section 5, zweapon.rdr: the M67 4, the HE 1; the smoke,
 * the flash and the claymore 0). With the table, every record is the disc's (`KitTable.throwables`). What a player
 * carries of them is its loadout's pouch (`pouchOf`, web sprint 4 M7: POUCH_PLACEHOLDER and CLAYMORE_PLACEHOLDER
 * retired -- the claymore is in the match, placed by a `throw` of it and set off by its Detonator's).
 */
const BAKED_THROWN: ReadonlyMap<string, { record: ThrowableRecord; piercing: number }> = new Map([
  ['M67', { record: M67, piercing: 4 }], ['HE', { record: HE, piercing: 1 }], ['AN-M8', { record: AN_M8, piercing: 0 }],
  ['Mark141', { record: MARK141, piercing: 0 }], ['Claymore', { record: CLAYMORE, piercing: 0 }],
]);
/** The flashbang (`Mark141`, 123): a blast of no damage whose reach whites the screen out (`resolveBlast`'s `flash`). */
const FLASHBANG_ID = 123;
/** XR-08: the bomb's kit record (DEMOLITION and, since LATER 149, BREACH; item 154, research 94, 171 s4): its blast on the scene at the detonation. */
const MPBOMB_NAME = 'MPBOMB';
/**
 * SCENE_ROUND_OWNER_READING (research 386 §3.2; LATER 63; research 332 §1.1, §1.4): whose a scene program's `FIRE_WEAPON`
 * round is -- Blizzard's outhouse's `C4` at its toilet, Crossroads' bridges' and the bases' `MPBOMB`. `FUN_0025ccb0` makes
 * its owner the console's own SEAL (`FUN_002b3580`, D:L107285) unless the program's context holds a type-9 entry
 * (D:L107286-107297); each console fires its own and hurts its own SEAL with it, so the round that hurts a player is his
 * own, as the bomb's (`MPBOMB_BLAST_OWNER_READING`). A destructible's death starts its program with entries of types 2, 6
 * and 5 only (`FUN_00273a50` D:L121010-121060; research 386 §3.3): no type 9, so its round is the console's own SEAL's
 * [reading: whether a switch's press starts its program with a type-9 entry -- the presser -- is not traced; a capture of
 * a player killed by a bridge's blast (H421) settles it].
 */
export const SCENE_ROUND_OWNER_READING = 'victim' as const;
/**
 * MPBOMB_BLAST_HOSTAGE_OWNER_PLACEHOLDER (P20, TB-7; research 332 s5-s6): whose the bomb's blast is at a hostage. Read
 * this far: a hostage's hit is applied where it is local, on the host (research 237 s2.3: its controller `CSealCtrlAi`,
 * which `FUN_005ac070` D:L464826-464833 passes there), and the round there is owned by that console's own SEAL
 * (`FUN_002b3580` D:L107285, the bomb's program giving no type-9 context, `FUN_002c1c30` D:L163926), whom
 * `FUN_005a0e70` credits with the death (D:L459286-459300) -- so the host's SEAL, whose side counts the kill
 * (`FUN_0059ee20` D:L458123-458127). The room is the host (HX.R2) and has no SEAL of its own: until that is settled,
 * 'none' -- the blast at a hostage has no owner (`hostageRefuses` with none: the gate never refuses an escortee, the
 * rescued bit still does), and a hostage it kills is no one's kill, counted in no valve
 * (`WORLD_KILL_UNCOUNTED_READING`). No disc map holds a bomb and hostages both (research 332 s5). Settles it: which seat the room takes as the host for a
 * world blast, and a capture of a hostage killed by a detonation (none exists).
 */
export const MPBOMB_BLAST_HOSTAGE_OWNER_PLACEHOLDER = 'none' as const;
/**
 * M4: how far a launched round's speed may stand off its `Muzzle_Velocity` (`FUN_003cb1a0` L320727-320731: `MV x dir`,
 * the owner's inherited velocity aside), a fraction: the float of the page's direction times the speed (a server
 * tolerance, no game source).
 */
const ROUND_SPEED_SLACK_PLACEHOLDER = 0.01;
/**
 * M-8 of review 2: how far the event's launch may stand from the nearest launch the game's throw makes from that hand
 * at that frame (`throwLaunchAllowed`), as a fraction of the stance's fastest throw (`ComputeMaxVel` 0x5976e0): the
 * page lets go at its release on the posed hand, with the look a tick from the command's. THROW_SLACK_READING: a server
 * tolerance, no game source (the game has no server); 0.1 of the fastest (24 u/s standing).
 */
export const THROW_SLACK_READING = 0.1;
/** The family's sampling (`throwLaunchAllowed`): the power in fiftieths, the aim's clamp in degrees -- each step well inside the slack. */
const THROW_POWER_STEPS = 50, THROW_AIM_STEPS = 55;
/**
 * The soonest a hand lets go again (M-8): after a release the throw's clip plays out (`throwClipSeconds` less
 * `releaseSeconds`: `FUN_0028c4f0`, `FUN_005802b0`) and the next throw's clip runs to its own release -- the page's
 * `GrenadeThrower` holds its phase through both. The shortest tail and the shortest wind-up of `GetThrowAnim`'s table
 * (0x57fce0): 0.70 s. Counted on the command clock less a tick, as the fire rate is.
 */
export const THROW_REPEAT_S = Math.min(...Object.values(THROW_ANIMS).map((a) => throwClipSeconds(a) - releaseSeconds(a)))
  + Math.min(...Object.values(THROW_ANIMS).map((a) => releaseSeconds(a)));
/**
 * THROW-INTERRUPT (research 326 §2.4): the longest a hand throwable's release request waits for its hand to open -- the
 * kit's timer, the release fraction x playback x (n - 1) / n (`FUN_005802b0` D:L441904), over `GetThrowAnim`'s table and
 * the pistol hand's pairs (`releaseSeconds`): the pistol's toss, 1.334 s. A `throwStart` older on the command clock is
 * spent: no drop.
 */
const THROW_ROWS = Object.values(THROW_ANIMS);
/**
 * THROW-INTERRUPT (the review's F1): the soonest a release request may follow a hand opened -- the throw's clip played out
 * past its release, `throwClipSeconds` less `releaseSeconds` over `GetThrowAnim`'s table (`THROW_ANIMS`): the release
 * fractions `FUN_0057fce0` D:L441783-441856 (the standing throw's 0.46 at D:L441839 and D:L441856), the timer
 * `fraction x playback x (n - 1) / n` (`FUN_005802b0` D:L441904), the clip's whole play `playback x ((n - 1) / n)^2`
 * (`throwClipSeconds`: keys 0 to n - 1, `FUN_0028c4f0`), with each clip's `playback` from `motion.rdr` and its key count
 * `n` from `MOTION_P.ZAR`. The shortest is the left lean's toss, 1.2 x 27/28 x (27/28 - 0.87) = 0.109 s (the next, the
 * crouched throw, 0.258 s); `THROW_REPEAT_S`'s first term. Its inputs are a reading; the bound itself is a server
 * adaptation (the original has no server): not `THROW_REPEAT_S` whole, whose second term is the next clip's own release,
 * which comes after its request, so a page's honest quick re-throw would be refused. *Was: "the clip's length
 * `playback x (n - 1) / n` ... (1 - 0.87) x 1.2 x 27/28 = 0.150 s" -- not the formula the code takes (the narrow check).*
 */
export const THROW_TAIL_S = Math.min(...THROW_ROWS.map((a) => throwClipSeconds(a) - releaseSeconds(a)));
export const THROW_START_WINDOW_S = Math.max(...[...THROW_ROWS, ...THROW_ROWS.flatMap((a) => PISTOL_HAND_ANIMS[a.clip] ?? [])].map((a) => releaseSeconds(a)));
/** The dead's stick: at rest (the dead take no stick, `FUN_00592560`). */
const DEAD_STICK = { forward: 0, right: 0, boost: false } as const;
/** The head over the feet by posture, for the blast's line of sight to the head node (research 91 section 5). */
const HEAD_OVER: Readonly<Record<'stand' | 'crouch' | 'prone', number>> = { stand: 18.3, crouch: 11.1, prone: 1.7 };

/**
 * A projectile the room flies: its thrower (m-13 of review 2: the name a kill by a thrower who has since left is told
 * by; the side friendly fire spares is the thrower's at the hit, `ffRefuses`, not kept here), its kind (the record's name
 * on the wire) and its state; `facing` is a placed claymore's front (its cone's axis, `claymoreCone`) or a backblast's
 * axis (the firer's body's back, `backblastAxis`).
 */
interface Flying {
  owner: Player; name: string; kind: string; g: Grenade; facing?: V3; struck?: Set<Player>;
  /** HX-1: the hostages its direct hit has struck (once a body a round, as `struck`), by id; apart from PF-26's count. */
  struckHostages?: Set<number>;
  /** PF-28 (PF.R47): its stable id, the `grenade` event's and the join envelope's (`pidSerial`, PROJECTILE_ID_READING). */
  pid: number;
  /**
   * PF-36 (PF.R56): a resting `Volitile` charge damaged (`chargeHit`; `FUN_003c69c0` L318215-318216, state 3): its
   * `trigger` is set at the next game frame's start (`flyGrenades`, VOLATILE_CHAIN_TIMING_READING).
   */
  queued?: true;
  /**
   * HOTFIX grenade fuse (THROW_DATE_BACK_TICKS_ADAPTATION): a new projectile's age at its creation, in ticks of the room's
   * clock from its release (`commandAge`, uncapped and signed; `born`, every creation site), and whether it was made
   * inside a step's credit (`inStep`: in the step's burst, after the credit and before `flyGrenades` -- its age already
   * holds that step's credit, the review's F1), and whether it is dated back past the step's credit (`dateBack`: the hand
   * throw's alone, THROW_DATE_BACK_TICKS_ADAPTATION; the others are flown at most the step's credit). Settled at the next
   * `flyGrenades`; absent: none.
   */
  late?: { ticks: number; inStep: boolean; dateBack: boolean };
}

/**
 * PF-22 (research 179 s8.2 (a), 219 s1; ruling PF.R40): a projectile whose owner has left the room before it hits
 * `'lands'` on anyone, his former teammates included -- `FUN_005ac670` looks the owner up live by id
 * (`FUN_0029e4e0(0x4362e0, id)`), the lookup fails, and the friendly-fire gate does not apply. Overturns review 2's m-13
 * ("its teammate is spared", the side kept as it threw). Owed: a recomp capture of a grenade whose thrower quits before
 * the fuse, a teammate in its radius, friendly fire off.
 */
export const DEPARTED_OWNER_FF_READING = 'lands' as const;

/**
 * HX-1: a victim carrying the escortee bit (a hostage, `./extraction`): the friendly-fire gate never refuses it. Its
 * `team` is the shooter's: a hostage's 0xC0020000 shares bit 30 with the SEALs' mask and bit 31 with the Terrorists'
 * (research 190 s10.3), so to the gate every shooter is its teammate -- the escortee bit alone lets the hit through.
 */
export interface EscorteeVictim { readonly team: Team; readonly escortee: true }

/** Why `ffRefuses` drops a hit: the victim a spectator, friendly fire off, or the backblast on its own side. */
export type FfRefusal = 'spectator' | 'friendly fire' | 'backblast';

/**
 * PF-22 (research 219 s1; 179 s8.2, 192 G12): the friendly-fire gate of `CZSealBody::OnWeaponHit` (`FUN_005ac670`,
 * 0x5ac670, absent from the decomp: read by disassembly), in its order, in front of every hit the room applies to a body
 * -- a bullet, a volley, a launched round's direct hit, a blast (`FUN_005ab850`'s only caller); a fall is not one.
 * - Online, a spectator victim takes nothing (`FUN_002c2fd0`).
 * - Friendly fire off (`allow` false, `DAT_0044cdb8 == 0`), the owner found live by id (`FUN_0029e4e0(0x4362e0, id)`,
 *   `+0x10 == 2`), sharing a team bit with the victim (`victim+0xc8 & owner+0xc8`), and not the victim: dropped
 *   (0x5ac6b8-0x5ac750). The team is the owner's **at the hit**; a departed owner is not found, so the gate does not
 *   apply and the hit lands (`DEPARTED_OWNER_FF_READING`). `attacker` is that live owner, null when he has left.
 * - Whatever the switch, a hit of item 0x9f (the Backblast) from the victim himself or his side (0x5ac840-0x5ac8fc).
 * - HX-1 (`./extraction` `HOSTAGE_FF_READING`; research 199 s2, 0x5ac720-0x5ac74c): an escortee victim (`victim+0xc8 &
 *   0x20000`, a hostage) lets every hit through, a teammate's too -- `escortee` on the victim, no refusal at once.
 * Not built (research 219 s5, note only): the M67 / HE branch (0x79 / 0x7e dropped from one's own side when an
 * unidentified controller's `+0x42c & 0x400` is set). The departed owner's backblast is read as passing (no owner to
 * test); it goes off the tick after its launch, so the case is near-moot.
 */
export function ffRefuses<B extends { readonly team: Team }>(attacker: B | null, victim: B | EscorteeVictim, itemId: number, allow: boolean, spectator = false): FfRefusal | null {
  if ('escortee' in victim) return null;                        // HX-1: HOSTAGE_FF_READING
  if (spectator) return 'spectator';
  if (attacker === null) return null;
  const side = attacker === victim || attacker.team === victim.team;
  if (!allow && attacker !== victim && attacker.team === victim.team) return 'friendly fire';
  if (itemId === ITEM.BACKBLAST && side) return 'backblast';
  return null;
}

/**
 * A departed or replaced player's record (`Room.kept`, keyed by its session token): its side, its picks and the kit they
 * replayed to, its type, the round serial it last spawned in, when it was kept -- and, from a takeover only, its
 * scoreboard row (`TAKEOVER_ROW_READING`).
 */
interface KeptRecord {
  team: Team; picks: Pick[]; next: Loadout | null; char: number; spawnedIn: number; at: number;
  /** ARMORY-SAVE: the seat's own lobby choice (`Player.lobbyChoice`, the console's `IDFromBriefing`), kept with its type and picks. */
  lobbyChoice?: boolean;
  /** HX-5: `roundRescued` (this round's brought out) too, so the round's-end sum counts a taken-over seat's rescues. */
  row?: { kills: number; deaths: number; score: number; roundScore: number; roundKills: number; roundDeaths: number; roundRescued: number } & MatchCounters & ResultCounters;
  /** A takeover's older body (repair 2): its projectiles and charges are the new seat's (TAKEOVER_ROW_READING). */
  body?: Player;
}

/**
 * PF-26: the match counters a player keeps (`Player.shotsFired` ..), a takeover's row among them (`KeptRecord.row`);
 * PF-14 the objectives' two (`primaryObjs`, `bonusObjs`); HX-5 the hostages' two (`hostagesRescued`, `escorteesKilled`:
 * `hostages` -- an EXTRACTION room's `roundOver`, and every takeover's row).
 */
type MatchCounters = MatchStats;
const countersOf = (p: MatchCounters, hostages = true): MatchCounters => ({
  shotsFired: p.shotsFired, shotsHit: p.shotsHit, headshots: p.headshots, teamKills: p.teamKills, suicides: p.suicides,
  primaryObjs: p.primaryObjs, bonusObjs: p.bonusObjs,
  ...(hostages ? { hostagesRescued: p.hostagesRescued ?? 0, escorteesKilled: p.escorteesKilled ?? 0 } : {}),
});

/**
 * SVC-12d (research 264 §1): the match's counters and marks the results read beyond PF-26's -- the time played
 * (`SEAT_PLAYED_MS_READING`, from `seatedAt`), the rounds won, lost and drawn (`SEAT_ROUNDS_READING`), the bombs planted
 * and defused (PF-14b's transitions, `scoreObjective`), joined in progress (`JOIN_IN_PROGRESS_MARK_READING`) -- a
 * takeover's row among them (the same person, `TAKEOVER_ROW_READING`).
 */
interface ResultCounters {
  playedMs: number; roundsWon: number; roundsLost: number; roundsDrawn: number; bombsPlanted: number; bombsDefused: number;
  joinedInProgress: boolean; seatedAt: number;
}
const resultCountersOf = (p: ResultCounters): ResultCounters => ({
  playedMs: p.playedMs, roundsWon: p.roundsWon, roundsLost: p.roundsLost, roundsDrawn: p.roundsDrawn, bombsPlanted: p.bombsPlanted,
  bombsDefused: p.bombsDefused, joinedInProgress: p.joinedInProgress, seatedAt: p.seatedAt,
});

/** A body a round met along a tick's segment (`bodyCast`): whose (the player object, never its id: an id is handed on after a leave), which part, where. */
interface BodyHit { player: Player; part: number; point: V3 }
/** HX-1: a hostage a launched round met along a segment (`bodyCast`), which part, where. */
interface HostageBodyHit { hostage: Hostage; part: number; point: V3 }

/**
 * PRONE-TILT (`tilt`): the seat's skeleton-root tilt at the tick (`Walker.rootTilt`), what its idle boxes turn by.
 * LEAN-HIT (`peek`; issue #752, research 217 s3.6): the seat's held peek at the tick (`TraversalHooks.peeking`), the lean
 * set its idle boxes pose (`bodyVolumes`' `peek`); absent (a hostage's): none.
 */
interface Past {
  tick: number; feet: V3; yaw: number; posture: 'stand' | 'crouch' | 'prone'; alive: boolean; tilt?: readonly number[] | null; peek?: -1 | 0 | 1;
  /**
   * HIT-POSE (research 217 s3.6): the body's live skeleton as it was posed at the tick -- the poser (`HitPoser`) and the
   * stamp it kept that tick's pose under (`HitPoser.keep`; the perf fold, research 217 s3.6a: every boxed bone's matrix
   * in the poser's ring; BONE-BOXES, s3.6b). `pastBoxes` reads its bone boxes (`HitPoser.boxesAt`: views on the ring,
   * body frame: x right, y up, z behind, the soles at the origin; the root tilt and the lean in the pose) for a body a
   * round's ray reaches, placed at `feet` and `yaw` (`placedVolumes`), never turned by `tilt` or `peek` again. Absent (no
   * motion, a mounted gunner, a hostage's): the stance's idle set by `posture`, `tilt` and `peek` (`bodyVolumes`).
   */
  pose?: HitPoser;
  poseAt?: number;
}

/** HIT-POSE: a past's posed bone boxes (`Past.pose` at `poseAt`, the ring's own: no copy), or null -- the idle sets meet the round. */
function pastBoxes(past: Past): readonly BoneBox[] | null {
  return past.pose && past.poseAt ? past.pose.boxesAt(past.poseAt) : null;
}

/**
 * A body's pose at `tick` from its history (a player's, HX-1 a hostage's): the last entry at or before it, the feet
 * interpolated toward the next; the oldest when `tick` precedes them all; null with no history.
 */
function pastOf(h: readonly (Past | HostagePast)[], tick: number): Past | null {
  if (!h.length) return null;
  for (let i = h.length - 1; i >= 0; i--) {
    if (h[i]!.tick <= tick) {
      const a = h[i]!, b = h[i + 1];
      if (!b) return a;
      const t = (tick - a.tick) / (b.tick - a.tick);
      return { ...a, feet: [a.feet[0] + (b.feet[0] - a.feet[0]) * t, a.feet[1] + (b.feet[1] - a.feet[1]) * t, a.feet[2] + (b.feet[2] - a.feet[2]) * t] };
    }
  }
  return h[0]!;
}

/**
 * MAP-10b (PF.R31): one placed manual turret as the room holds it -- its placement (`SimMap.turrets`), its occupant's seat
 * or null, its rounds (`TURRET_RELOAD_READING`), its weapon's record (`KitTable.turretRecords`, null without the kit
 * tables), the occupant's last round on its own command clock and on the room's (`fire`'s rule), and whether the
 * occupant is owed its rounds this tick. PAR-59: `round`, the projectile a class-230 weapon launches (MGL FRAG TURRET's
 * own record, `KitTable.rounds`), else null: a line. PB-2c (research 215 s7.1): `gunYaw`, the gun's yaw (degrees, the body's)
 * -- its occupant's each mounted tick, kept after the release, the placement's facing before any -- the facing the next
 * mount records (`FUN_005463c0` D:L412268-412297: the gun part's world forward, flattened) and its steer turns toward.
 * TURRET-AMMO (issue #284, research 215 s8, `TURRET_RELOAD_READING`): `mags`, the occupant's kit slot holding the turret's
 * rounds while mounted -- ten magazines and the one in the weapon, poured at the mount (`turretPour`, `FUN_005bc5d0`) and
 * summed back onto `ammo` at the release (`FUN_005c3c10` D:L412003) -- else null (`ammo` the whole count, as the turret's
 * `+0x2a8`); `reloading`, the kit's reload timer armed (`FUN_005c32b0`), `lockUntil`, the occupant's command its timer
 * stops on -- the landing's, whose fire step is skipped too, so no round until the command after it (the review's fold,
 * F1: `turretReloadCountdown`, `FUN_005c0fd0` D:L476549-476563) -- and `lands`, false when that countdown stops on exactly
 * 0.0 and so lands nothing (D:L476553).
 */
interface TurretState {
  place: TurretPlacement; occupant: number | null; ammo: number; record: WeaponRecord | null; round: ThrowableRecord | null;
  lastFire: number; fireClock: number; ammoDirty: boolean; gunYaw: number;
  mags: MagazineRing | null; reloading: boolean; lockUntil: number; lands: boolean;
  /** LATER 219: the occupant's command the turret's own timer was armed on (`armTurret`); -1e9 for one carried or none. */
  lockFrom: number;
  /**
   * P3-room (AR-4; LATER 588 (a)): the console's period held over the hold's chain of rounds (`fireGate` `scheduleOpen`,
   * `scheduleAfter`), as `Player.fireSchedule` holds the hand's. Fresh at each mount (`takeMount`, beside `lastFire`); kept
   * through the release as `lastFire` and `fireClock` are, so a round of the last hold decided after it
   * (`DISMOUNT_ROUND_AT_COMMAND_ADAPTATION`) is held to the same schedule.
   */
  fireSchedule: number;
  /**
   * LATER 207: the last hold's magazines and timer end as the release left them, for a round named on a mounted command and
   * decided after it (`DISMOUNT_ROUND_AT_COMMAND_ADAPTATION`, `turretRound`); null while held, before any hold, and after
   * the round's start's refill.
   */
  released: { mags: MagazineRing; lockUntil: number; reloading: boolean; lands: boolean } | null;
  /** TURRET-CONE's re-review R1: the occupant's commands run (`Player.ran`) at the mount; a round of one no later is not the turret's. */
  mountCount: number;
  /** A1: occupied by a reservation not yet taken (`reserve`), and whether the hold was taken on its page's word (`takeMount`). */
  reserved: boolean; word: boolean;
}
/**
 * A mount asked, taken at the first step's top after its command has run, by the lower seat id (`resolveMounts`); `at`
 * the room tick it came on (LATER 124: dropped once it has waited `PENDING_TICKS`), `staleAt` the room's count then
 * (`sim.seq`: its stale bound judged at arrival).
 */
/** LATER 249: `n`, the ask's arrival on its seat (`Player.arrivals`), which `mountKitLocked` orders a same-command lock by. */
/** A1: `word`, the ask named its take (`mount`'s `word`): reserved and taken at the page's word; else taken at once. */
interface MountAsk { id: number; turret: number; seq: number; at: number; staleAt: number; n: number; word: boolean }

/** A round, a reload or a throw waiting for its command (`PENDING_MAX`): the event and the tick it came. */
type Timed = { ev: Extract<ClientEvent, { type: 'fire' | 'reload' | 'throw' | 'throwStart' | 'hostageOrder' | 'door' | 'action' | 'bombAction' | 'pickup' }>; at: number; n: number };

/**
 * LATER 109 (the review's F2; TURRET_RELEASE_ACTIONS_PLACEHOLDER): the presses a dismount's command loses through its reversed
 * clip with its stick -- the jump, the stance, the leans and the swap. The Action stays (the room reads it for the respawn and
 * the mover for the climb, which `climbLock` refuses meanwhile); the trigger, the aim and the views stay.
 */
const RELEASE_HELD_BUTTONS = Button.Jump | Button.Stance | Button.LeanLeft | Button.LeanRight | Button.Swap;

class Player {
  sim: MoverSim;
  /**
   * HIT-POSE (research 217 s3.6): the page's animator on this player's own skeleton, stepped once a tick while it lives
   * (`Room.hitPose`), and what it was made for -- its hit body and its seat's `sim` (a new `sim` is a spawn: the page's
   * copy is rebuilt there too, `REMOTE_RESPAWN_REBUILD_READING`); null while dead, away or without motion. `hitAt`, the
   * stamp its poser kept the last tick's pose under (`HitPoser.keep`), for the reads of the present (`bodyCast`,
   * `orderPick`: `liveVolumes` fits it for a body a ray reaches); 0, none (the idle sets).
   */
  poser: { pose: HitPoser; body: HitBody; sim: MoverSim } | null = null;
  hitAt = 0;
  readonly queue: Command[] = [];
  /**
   * LATER 136: the commands the intake's flood cut took off the queue's head (`binary`, past `QUEUE_MAX`), oldest first,
   * dropped as a backlog is at the next step's top (`dropStretch`). Bounded: at most `QUEUE_MAX`, its oldest discarded
   * past it (tallied 'command: flood', once an intake) -- the cut's protection against a flooding page kept.
   */
  readonly cut: Command[] = [];
  /** The command numbers in `queue` (PL-9: a batch's duplicates found at once, not by a walk of the queue). */
  readonly queued = new Set<number>();
  /** The tick a gap in the command numbers was first seen, or -1. */
  gapSince = -1;
  /**
   * LATER 157 (its review's F1): the room's clock at this seat's last spawn -- the look gate's skip report (`LookGate.skipped`)
   * is held to the ticks since it, so idle time banked before a spawn (`unran` counts from the first sync) buys no free look.
   */
  spawnClock = -Infinity;
  credit = CREDIT_MAX;
  /**
   * HIGH-1 (`CATCHUP_PER_TICK_PLACEHOLDER`): each of the last `CATCHUP_WINDOW_TICKS_PLACEHOLDER` steps' credit less the
   * commands run in it, by the step's tick, and their sum -- the unspent time a backlog may drain on.
   */
  readonly spent = new Float64Array(CATCHUP_WINDOW_TICKS_PLACEHOLDER);
  slack = 0;
  /**
   * Commands run: the player's own clock, one a 60 Hz tick of its mover (the credit holds it to real time). The fire
   * rate and the reload lock count on it -- the game's wait is a clock timer (`kit+0x8b8 -= dt`, `FUN_005c0fd0`
   * 476545-476547), not a number the client sends. Commands lost past `GAP_WAIT` count as run, each charged against
   * the credit (`run`; review 3 B1): the page ran them, so its locks went on through them.
   */
  ran = 0;
  /**
   * Round 3 of the review of NET-FIX2 (research 223 s6): the room's clock less `ran` when this player's numbers were
   * taken up (`synced`), and the clock ticks a dropped backlog has run on its mover since (`elapsed`): what the room
   * observed it not run is `Room.unran`, the bound on a drop's clocks and on how far ahead a command's number may be.
   */
  clockBase: number | null = null;
  elapsed = 0;
  /**
   * Review 4: whether this player's command numbers have been taken up. A new player (a join, a promotion) starts its
   * mover at 0 while the page's numbers already run on (its walk taps from the page's load, a demotion's fly mode
   * keeps them), so the first command run sets where the numbers start: that jump is no loss, and nothing is charged
   * for it -- `ran` stays the room's own count, never a number the client sends (research 91).
   */
  synced = false;
  lastActive: number;
  alive = false;
  health: Health = freshHealth();
  /**
   * NU-3c (research 321 section 4.2.1): the six part bytes the others hold of this body (`partHealthBytes`, the
   * SealObject's 0x82-0x87) as last published -- a new array at each publication, so a connection's last-sent copy
   * (`Room.healthSent`) is compared by identity -- and the tick each byte was (`partTold`): a byte goes again only
   * `PART_HEALTH_INTERVAL_TICKS_READING` after its own last (`FUN_0061a488`: each field its own time). Null before the
   * first publication, which is whole.
   */
  partBytes: number[] | null = null;
  readonly partTold = [0, 0, 0, 0, 0, 0];
  diedAt = -1;
  /**
   * NCW-2 B-trade: the command number the body had last run when `kill` took it (its last command run alive); -1 alive,
   * or dead by no kill. A dead shooter's round named within `tradeWindowTicks` commands of it is judged on its frame.
   */
  diedSeq = -1;
  /**
   * NCW-2 B-trade, Codex's P1 on PR #698: the rounds in each weapon's magazine (`mags[w].rounds()`, the magazine in the
   * weapon only) when `kill` took the body, read before its classic drop empties the rings (`worldDrops.death` ->
   * `dropsOf`). A traded round spends from these (`fireAt`), never from the rings; [0, 0] alive.
   */
  tradeRounds: [number, number] = [0, 0];
  /** LATER 266, research 322 §5.3: FUN_00543d50 D:L410440 zeroes alpha at load; no corpse or fade to wait for. */
  deadAtLoad = false;
  /**
   * PF-28 (research 231 s4): the death's clip and cause as `kill` told them, for a joiner's corpse (`joinWire`); null
   * from the spawn on (cleared at every spawn, the round's and the abandon's included).
   */
  deathClip: string | null = null;
  deathCause: number | null = null;
  /**
   * PF-10: the tick the body's character voice gate opens (`VOICE_GATE_S`, the actor's `+0x424`); -1 open. The room is
   * every player's console here: each console runs the gate on its copy of the actor, armed by the same health drops
   * (the victim's by the hit, the others' by the replicated parts, `FUN_005a5790` -> `FUN_005a54d0`).
   */
  voiceGateUntil = -1;
  kills = 0; deaths = 0; score = 0;
  /**
   * The round block (the actor's `+0x58c`; the match block `+0x544` is `kills` / `deaths` / `score`): this round's
   * score (+0x5c8: the kills' +2, the -2s, the +5 and +1 bonuses, `FUN_00545b10` / `FUN_00545b90` D:L411806-411844;
   * the side's total reads it before the bonuses), kills (+0x598) and deaths (+0x59e), zeroed at the exit state's exit
   * (`FUN_002232a0` D:L75817). ROUND COMPLETE's and FINAL ROUND's lists read this block (`RoundStatLbContents*` through
   * the getter 0x225fe0 = `+0x58c`, `FUN_00223680` D:L75946-75947; research 216 §8), GAME COMPLETE's the match block.
   */
  roundScore = 0; roundKills = 0; roundDeaths = 0;
  /**
   * PF-26 (research 216): the match counters GAME COMPLETE's YOUR STATS reads (`MatchStats`; `FUN_00225a00`
   * D:L76886-76933): shots and hits (`countShot`, `HIT_COUNT_READING`), headshots, team kills and suicides (`kill`).
   * Match totals, as `kills`: zeroed with the match (`resetMatch`), carried by a takeover (`TAKEOVER_ROW_READING`).
   */
  shotsFired = 0; shotsHit = 0; headshots = 0; teamKills = 0; suicides = 0;
  /**
   * PF-14 (research 214 s5): the objectives YOUR STATS lists, primary (+0x576) and bonus (+0x578), by
   * `OBJECTIVE_STAT_KIND_READING` (`scoreObjective`). Match totals, as the five above.
   */
  primaryObjs = 0; bonusObjs = 0;
  /**
   * HX-5 (research 239 s4): the match's brought out (`HOSTAGES_RESCUED_STAT_READING`, the round block's +0x1c summed)
   * and escortees killed (+0x18, `ESCORTEES_KILLED_STAT_READING`), zeroed with the match; and this round's brought out
   * (+0x5a8, which `FUN_00224d10` sums: `PRIMARY_OBJECTIVE_READING`), zeroed with the round.
   */
  hostagesRescued = 0; escorteesKilled = 0; roundRescued = 0;
  /**
   * SVC-12d (`ResultCounters`; research 264 §1): match totals, zeroed with the match (`resetMatch`) but `seatedAt`, the
   * tick the room seated it (`seat`). `playsRound`: the round serial it was seated at the start of (`startRound`) -- a
   * classic seat not seated at its round's start is a ghost of it (`ghostOf`; actor +0xfd2, D:L76148, D:L76717).
   * `signals`: the round's, for SVC-23b (research 169 §4.2), from zero at each round's start.
   */
  playedMs = 0; roundsWon = 0; roundsLost = 0; roundsDrawn = 0; bombsPlanted = 0; bombsDefused = 0;
  joinedInProgress = false; seatedAt = 0; playsRound = -1;
  /** LATER 85 (`LATE_SEAT_ACTOR_READING`): a classic late seat whose console has not loaded -- no body until its `loaded`. */
  awaitingLoad = false;
  /** LATER 274 (research 322 §5.3): a late seat loaded over the launch's hold -- a ghost of round 1, spawned at round 2. */
  ghostOfNextRound = false;
  /**
   * NET-RES-2b (NET-RES.R5; `SEAT_HOLD_MS_ADAPTATION`): a held seat past its body's hold -- no body in the world (none in
   * a snapshot, none spawned, no respawn), its seat, row, side and lobby place kept until its page is back or the hold ends.
   */
  away = false;
  /** NET-RES.R11 (a): the last damage an enemy dealt this body (`combat`): the enemy's session token, when (the room's clock), its item. */
  lastHurt: { session: string | null; at: number; weapon: number | null } | null = null;
  /** NET-RES.R11 (b): this body left the world alive (`takeAway`, no kill credited): its seat's return keeps its kit. */
  awayAlive = false;
  /** NET-RES.R11 (b): the body a returning respawn seat takes its health and kit from at its spawn (`seat`, `spawn`). */
  returnFrom: Player | null = null;
  /**
   * RC1/RC2 (the merge controller's provisional rulings, 2026-10-24; RC2 to the owner): a respawn seat back from a
   * hold whose body was dead -- dead at the drop, or credited dead (NET-RES.R11 (a)) -- comes back dead: no spawn at its
   * hello. N3 (NET-RES-2's re-read): a mark from its seating to its first `start` only, which enters it dead at load
   * (`enterDeadAtLoad`, #474's path) -- `deadAtLoad` is the one respawn gate (`respawnReady`: `FUN_00592560`
   * D:L451699-451724, no corpse fade to wait for -- its body is out of the world). A seat still loading takes that path at
   * its `loaded`; either way the entry clears the mark.
   */
  deadOnReturn = false;
  signals: RoundSignals = freshSignals();
  /** SIMDROP-INSTR: the `fire: cone: *` refusals logged in full this round (`REFUSAL_LINES_PER_ROUND`). */
  refusalsLogged = 0;
  /**
   * SIMDROP-INSTR (sim drop #3; an instrument): the least offset between the room's wall clock in ticks and a command's
   * number at its arrival, over `LAG_FLOOR_WINDOW_TICKS` (two halves, as `lagFloor`), that `signals.arrivalLate` counts
   * from; and the wall time of the seat's last command frame this round (-1: none yet), for `signals.arrivalGapMaxMs`.
   */
  arrivalFloor = { cur: Infinity, prev: Infinity, since: -Infinity };
  frameAt = -1;
  /**
   * NCW-6 (an instrument; nothing judged reads it): the room's clock (ms) at this round's start or the seat's seating, the
   * later, that `signals.wallMs` counts from; the runs of consecutive command numbers the room dropped unrun
   * (`dropStretch`, each run its first and last number -- a number the page skipped inside a stretch splits it, so it is
   * in none -- at most `STALE_DROP_RANGES_MAX_ADAPTATION` runs, the oldest forgotten), that `signals.staleAfterDrop`
   * reads; and the highest number an unsynced page's flood cut discarded (`binary`): any number at or under it is treated
   * as already received and not counted in `signals.commandsReceived` -- a re-sent copy, but also a number never received
   * that arrives late, out of order (queued, not counted) -- so the count, and central's `commandRate`, can only come out
   * low, never high.
   */
  roundFromMs = 0;
  readonly droppedRanges: [number, number][] = [];
  receivedFloor = -Infinity;
  /**
   * The sprint 31 fix-up (research 239 s9.2): the seq of this player's last well-shaped `hostageOrder`; an order at or
   * below it (a replay, one out of order) is dropped `'stale'`, as a stale timed event is (`timed`).
   */
  lastOrderSeq = Number.NEGATIVE_INFINITY;
  /** Whether the shell `countShot` last counted has counted its hit (a shotgun's rays are one shell, one hit). */
  shellHit = false;
  readonly history: Past[] = [];
  viewTick = 0;
  /**
   * The smoothed round trip, whole ms, the score row carries (`scoreEvent`): `pingRowMs(pingExact)`. 0 until
   * `noteRoundTrip` folds a sample (`PING_FROM_HEARTBEAT_ADAPTATION`). The original's SELECT board has no ping column
   * (research 87 §12, 91 §11); the port's draws it in NCW-7's PING column, a browser adaptation (research 87 §17,
   * `PING_SCORE_RESEND_MS_ADAPTATION`; the viewer's `SCORE_LAYOUT.ping`).
   */
  ping = 0;
  /** The smoothed round trip unrounded (`smoothPing`), so steady samples bring the row to them (PT195-4, review F3). */
  pingExact = 0;
  /** NCW-7 (`PING_SCORE_RESEND_MS_ADAPTATION`): the ping the last score rows broadcast to the room carried; 0 before any. */
  pingSent = 0;
  /**
   * The kit on the body (web sprint 4, M3/M4; `../../viewer/src/loadout`): five item ids, the character type's
   * `default_weapons` at each spawn (R94.7) -- and the records its two firearm slots hold, 2X applied, which every
   * per-weapon table below is read from: the rate, the reload's lock, the cone, the damage and its falloff.
   */
  loadout: Loadout = BAKED_LOADOUT;
  records: readonly [WeaponRecord, WeaponRecord] = SEATED_RECORDS;
  /**
   * Protocol 7 (web sprint 4, M9): the kit the player's character type holds for its next rebuild -- the weapon select's
   * picks as the room replayed them (`Room.loadout`; `FUN_0023e5e0` writes the type's kit on confirm, research 94 §B6),
   * null for the type's own. Applied at the next spawn (classic: the next round, R94.3), and every spawn after.
   */
  next: Loadout | null = null;
  /** The picks `next` was replayed from (the list a reconnect re-sends), empty for the type's own kit. */
  picks: Pick[] = [];
  /** The `loadout` requests left in the budget (`LOADOUT_BURST`, one back each `LOADOUT_EVERY` ticks). */
  loadoutCredit = LOADOUT_BURST;
  /**
   * ARMORY-SAVE (research 167 §7): a type and kit of the seat's own, taken in the game lobby (a `loadout` request while the
   * room is not launched) since its seat -- the original's `IDFromBriefing` 1 (`OnMp{Seal,Terr}BtnPress`, research 95 §3.2),
   * under which the lobby's `FromBriefing` loads no stored record over it (P:L7561). The launch's stored read
   * (`storedProfile`) leaves such a seat alone; a new seat (SWITCH TEAMS, a swap, a promotion) starts without it, as
   * `switch_teams_anim` re-arms from the record, while a takeover or a rejoin inside the reconnect window keeps it (the
   * same console: `KeptRecord`); the match's load clears it (`firstRound`), as the map's load drops the
   * TEMP `IDFromBriefing` (research 309 §2.3). [reading, pending review]
   */
  lobbyChoice = false;
  /**
   * Protocol 9 (web sprint 5 S2; research 95 §6, W5.R2): the character type the body was rebuilt as (`char`: its hit
   * volumes, the others' picture of it) and the one the next rebuild takes (`nextChar`: the ARMORY's
   * `ChangeCharacterType`, applied at the spawn as the kit is) -- the column within the side, SEAL 1 / TERRORIST 1 (0)
   * by default (R95.5).
   */
  char = 0;
  nextChar = 0;
  /**
   * The room's round serial (`Room.roundSerial`) this body last spawned in: a player seated as a ghost in a round has
   * not spawned in it, and its type may still change for the round's first spawn (W5.R1; `loadout`).
   */
  spawnedIn = -1;
  /**
   * The page's ARMORY open for this seat (web sprint 5, W5.R1 live; `ARMORY_SEAT_READING`): its first spawn waits for the
   * page's `ready` (the screen left) or the round's start; its type and picks are taken as each changes.
   */
  arming = false;
  /**
   * The magazines, per weapon: the game's ring (`magazines.ts`, research 84 §18) -- the page's `Fire` counts with the
   * same, so a reload here takes the magazine the page's did; the command count each last fired at (`ran`).
   */
  mags: [MagazineRing, MagazineRing] = [ringFor(SEATED_RECORDS[0]), ringFor(SEATED_RECORDS[1])];
  lastFire: [number, number] = [-1e9, -1e9];
  /**
   * LATER 588 (a) (reading, pending review): per weapon, the schedule of its chain of rounds on the command clock (`S`,
   * `../../viewer/src/net/fireGate`): a round no sooner than the console's period after it, less the page's slack.
   */
  fireSchedule: [number, number] = [FIRE_GATE_NONE, FIRE_GATE_NONE];
  /**
   * SVC-23b: per weapon, the room's clock (`Room.serverClock`) its last round was scheduled at -- max(the tick it was decided,
   * the one before + the cycle) -- so a burst of held rounds cannot outrun the cycle (`FIRE_ARRIVAL_JITTER_TICKS`).
   */
  fireClock: [number, number] = [-1e9, -1e9];
  /** SVC-23b: per weapon, the room's clock its lock (`reloadUntil`'s, on the command clock) ends at. */
  lockClock: [number, number] = [-1, -1];
  /** SVC-23b: the room's clock the last grenade was scheduled at (as `fireClock`). */
  throwClock = -1e9;
  /**
   * SVC-23b: the least `serverClock - ran` after a command run, over the last `LAG_FLOOR_WINDOW_TICKS` (two halves: the
   * current and the one before; `since` the current's start): the steady line's offset an event's lateness counts from.
   */
  lagFloor = { cur: Infinity, prev: Infinity, since: 0 };
  /**
   * Per weapon, the command count its lock ends at (MJ-1) -- a swap is refused under a reload's (M-3), and clears an
   * after-shot's (the page's `setWeapon` cancels it, `fire.ts`) -- M4: the kit's **one** timer
   * (`kit+0x820`, `FUN_005c32b0` L477653-477680: a reload's `ReloadDelay` or the bolt's/pump's after-shot lock, one
   * flag between them) and then the clip it starts (a reload action: `FUN_005a7ab0` holds the fire while it plays).
   * `lockTimer` is where the timer part ends (the clip begins), `lockKind` which kind set it. A reload asked during an
   * after-shot timer is refused, as the page's `Fire.reload` refuses it (PAR-88: `FUN_005a7ab0` answers on `kit+0x820`,
   * D:L462522-462523; was: it replaced the timer).
   */
  reloadUntil: [number, number] = [-1, -1];
  /** LATER 175 (the review's F1): per weapon, the command count its lock was armed at (`setLock`), the span's start. */
  lockStart: [number, number] = [-1, -1];
  /** LATER 249: per weapon, the arrival (`arrivals`) of the event whose decision armed the lock (`setLock`); -1 none or
   * unstamped, which covers as before. Read only on the ask's own command (`mountKitLocked`). */
  lockArrival: [number, number] = [-1, -1];
  /** LATER 249: this seat's arrival counter -- each mount ask and each timed event, stamped at receipt, in the page's send order. */
  arrivals = 0;
  /** LATER 249: the arrival of the event being decided now (`decide`; a launched round at its arrival), which `setLock` keeps. */
  armedBy = -1;
  lockTimer: [number, number] = [-1, -1];
  lockKind: [LockKind, LockKind] = [null, null];
  /**
   * PF-18 (ruling PF.R37; research 218 §2): per weapon, the reload's (or the after-shot's) still clip whose cut the room
   * watches on its own mover (`Room.cutAt`): its clip's first command (`lockTimer`'s) and its life; null when none is
   * watched (no clips, a moving start, cut, or played out).
   */
  reloadLife: [ReloadLife | null, ReloadLife | null] = [null, null];
  /**
   * PF-18: the last commands' cut axes (`reloadCutOf` after each ran), for a reload decided after its own command ran;
   * PAR-79: with the body in the air after each (`airborne`) or back on the floor on it by a clipless landing (`bare`).
   */
  cutLog: { count: number; push: boolean; airborne: boolean; bare: boolean }[] = [];
  /**
   * PF-18 (PF.R37; research 194 A03): the flinch as room state -- the victim's commands (seqs) from `flinchFrom` to before
   * `flinchUntil` lie inside its clip (`Room.flinchState`); a reload named at one is dropped `'flinch'`. -1: none.
   */
  flinchFrom = -1;
  flinchUntil = -1;
  /**
   * LATER 560 (its review F1): the command whose run heard a climb's start or a ladder's mount (`Room.watchMoves`); its
   * pop ends the flinch's window at that command, laid after the command (`Room.watchCut`). -1: none.
   */
  basePopAt = -1;
  /** PAR-60: the command of the latest flinch's push (its clip's first), which the stick's cut counts from (`Room.flinchCut`). */
  flinchAt = -1;
  /**
   * PAR-65, PAR-71: the command from which the fall covers the latest flinch until the body is back on the floor
   * (`Room.flinchLanding`) -- its push's first when pushed in the air, else the first command its body ran in the air
   * inside its window (a walk-off). -1: not covered.
   */
  flinchAir = -1;
  /**
   * DOORS (#485's review F1, F2; research 92 section 4): the one-shot slot the window above describes is the flinch's or,
   * since a door's `ai::ANIMATE` pushed `Open door` (`doorMotion`), the push's -- the page's own slot (`../../viewer/src/walk`
   * `setFlinchPose`). A push refuses the jump (`jumpRefused`), is cut by the stick (`flinchCut`) and covered by a fall
   * (`flinchLanding`) as the flinch is, but refuses no reload: it sets no motion flag 0x4 (`FUN_005b4340` D:L469494-469504).
   * `flinchGatesReload` false for a push; `flinchCutFrom` the first command its `NoInterrupt` lets the cut through (-1: none).
   */
  flinchGatesReload = true;
  flinchCutFrom = -1;
  /**
   * The door-open body hold (research 92 section 2, "The body under the door clip"; reading, pending review): the clip a
   * door's push laid in the slot (`doorMotion`, one of `PUSHED_CLIPS`), read only while the slot is a push's
   * (`flinchGatesReload` false): on top, it holds the body on its root (`watchMoves`' `pushedOnTop`). Null: none.
   */
  flinchClip: PushedClip | null = null;
  /**
   * #485's re-read, N1: the span of a flinch's refusal a door push cut short (`doorMotion`), kept when the push takes the
   * slot -- the flinch was the top up to the push (`FUN_005b4340` D:L469494-469504 reads the top's flag 0x4), so a reload
   * named on a command before it is still refused, as the page undoes it on the flinch's event. -1: none.
   */
  flinchKeptFrom = -1;
  flinchKeptUntil = -1;
  /**
   * LATER 363 (research 92 section 4, "A flinch under the push"): the flinch a door push covered without popping it --
   * its window's start (`flinchAt`) and end as at the push, and the push's first command (`at`), where it stopped
   * advancing (only the top advances). Handed back at the push's pop (`Room.flinchUncover`). Null: none.
   */
  flinchUnder: { start: number; until: number; at: number } | null = null;
  /** The command count the last grenade left the hand at (M-8: `THROW_REPEAT_S`). */
  lastThrow = -1e9;
  /**
   * THROW-INTERRUPT (research 326 §2.4): the hand throwable named at its release request (`throwStart`), kept to the hand's
   * opening -- cleared by the `throw` echoing its seq (`start`), any refusal, a new request, a weapon change and
   * `THROW_START_WINDOW_S` -- for the original's drop at a death before it (`deathDrop`). `count`: the request's command count.
   */
  throwStart: { seq: number; kind: string; count: number; slot?: number } | null = null;
  /** The event clock of the last `throwStart` taken (its rate: `THROW_REPEAT_S`, as the throw's). */
  throwStartClock = -1e9;
  /**
   * THROW-INTERRUPT (the review's F1): the command a throw's clip was last laid on (its hold's start, `Walker.holdStarts`),
   * -1 none; `deathDrop` asks one at or after the request's command. `holdStartsSeen`: the walker's count last read.
   */
  throwHoldSeq = -1;
  holdStartsSeen = 0;
  /**
   * LATER 144: a placing's start -- the command its hold was laid on (`noteThrowHold`), the feet there, the room's event
   * clock then (`at`, `eventClock`), and the camera's eye at that command's look once its frame is in the cone (read after
   * `aim`, in the run path): C4's aim moment
   * (`grenade.ts` `plantC4`), the cone's history (64 commands) being shorter than the plant's clip (1.098 s). A dropped
   * command's frame never is, so it banks no eye. Null none, or spent by a placing's throw (`placeCharge`). LATER 139: and
   * the cone's frames around that command (`frames`, banked with `eye`, never without it): the look the eye counts on.
   */
  placeStart: {
    seq: number; feet: V3; eye: V3 | null; frames: AimFrame[] | null; at: number; head: V3; serial: number; ran: number; weapon: 0 | 1;
    held: number | null;
    cut?: boolean; handOff?: boolean;
    /**
     * LATER 220 head 3's review F1: why the prompts' common gate was shut for the press that laid this placing (C4's offer,
     * judged on the command before its start), banked once the start's command has run and its events settled (`run`,
     * `bankPlaceGate`): the plant is decided about 66 commands later, past the cone's 64. Null: open; absent: not banked.
     */
    gate?: string | null;
  } | null = null;
  /** The weapon in hand as last seen (a change is a swap: the cone takes the record). */
  weapon: 0 | 1 = 0;
  /** The accuracy cone, run from the commands (OWNER-3, `ShotCone`). */
  cone = new ShotCone(SEATED_RECORDS[0]);
  /** Rounds and reloads waiting for their command. */
  readonly pending: Timed[] = [];
  trigger = false; aiming = false; boost = false; binoculars = false;
  /**
   * OBF-14 (research 364 s9; reading, pending review): an in-process AI controller's raise request -- the room's bots
   * (`./bots/matchBots` `BOT_RAISE_READING`), never a page's: the original's AI asks its rifle up when it engages
   * (`FUN_00563e10` D:L427799 `FUN_005dfe30(body, 1)`; CSealCtrlAi's tick calls `FUN_005cba20` at D:L432502, which calls
   * it at D:L482998), and another console's copy raises from that state (sent by `FUN_002bd640` from `FUN_005e0010`,
   * D:L161978; received by `FUN_002be150` from the SealObject byte 0x7e, D:L162310-162311). Since protocol 14 (ENEMY-RAISE
   * ER-2) the body carries it on `BodyFlag.Raised` (`body`), which a copy replays; it still rides the `Aiming` flag
   * beside it, which a replay recorded before 14 holds a copy's raise up by (`BodyFlag.Aiming` -> the copy's
   * `snap.aiming` -> `RaiseInput.aiming` in `../../viewer/src/weaponRaise`). Not `Button.Aim`: that is the
   * page's head view, which moves the shot cone's eye (`ShotCone` `lens`), and the AI's raise moves no eye.
   */
  raise = false;
  /**
   * ENEMY-RAISE ER-2 (protocol 14; reading, reviewed): the page's own raise state on its last command run
   * (`Command.raised`) -- its body's `FUN_005e0010`, which the original's owner packs into byte +0x7e every frame
   * (`FUN_002bd640` D:L161978). The room relays it on `BodyFlag.Raised` and computes nothing of it; never for the dead.
   */
  raised = false;
  /**
   * LATER 182: the view state 4 and up on the last command (`Button.Scope`, the page's `zoom.moveScale() < 1`): the
   * binoculars or a scope -- the same bit `ShotCone`'s `scoped` reads in `aim`.
   */
  scopeView = false;
  lastYaw = 0; lastPitch = 0;
  /** The last landing the fall's damage was read from (`fallDamage`): each landing of the mover is read once. */
  lastLanding: Landing | null = null;
  /** Each throwable/charge slot's own ring, reset at a spawn (research 361 §1). */
  equipmentSlots: EquipmentSlots = equipmentSlotsOf(BAKED_LOADOUT, null);
  /** Derived compatibility totals: no independent pooled ammunition counter. */
  get grenades(): Record<string, number> { return this.equipmentSlots.totals(); }
  /**
   * M7: the command count the kit's rate lets the next rocket go (`kit+0x8b8` with the round's `FireWait`, 3 s; the RPG's
   * after-shot lock, `ReloadDelayAfterShot` 1 s, feeds the next round inside it: `FUN_005c3000`, research 94 §C1.1).
   */
  rocketWaitUntil = -1;
  /**
   * M7: the rocket launcher in the hand (its item id), null for the firearm -- the kit's current item (`kit+0x824`), set
   * by the page's `throw` of the launcher (raise) or of the firearm (lower); the command count its raise is over at, and
   * the one the firearm may fire again at after it went down (`launcherLowerSeconds`).
   */
  held: number | null = null;
  heldReadyAt = -1;
  /**
   * NU-6 F1 (research 324 §6; the fresh review of 384b7d288): the item `held` takes on a later command -- a raise's
   * launcher, a still lower's null -- the command its clip begins (the event's seq + 1), so the body's item and the clip
   * change on one command (`heldOn`; `FUN_005a6d30` D:L462105-462126 pushes the raise and moves the launcher on one
   * frame, `FUN_005a6b70` D:L462045-462092 the lower); null when none waits. `set`: a waiting raise's `launcherSet` from
   * before it, put back if a swap refuses it first (`refuseRaise`, N1 of the re-review).
   */
  heldNext: { item: number | null; seq: number; set?: { start: number; until: number } | null } | null = null;
  firearmReadyAt = -1;
  /**
   * PAR-74 (research 251 section 12.5, "PAR-74"): the bomb's placement (its `sinceTick`) whose plant clip a command of this
   * player's has laid (`Room.placingPass`), -1 none -- one plant clip a placement.
   */
  plantClipSince = -1;
  /**
   * PAR-81 (research 230 section 5.2.6): the launcher's anim set on the body (`actor+0x528 = DAT_0044d408`, `FUN_0058c350`
   * D:L462105 at the raise), on the commands' seqs -- `start` the raise's own (the `throw` event's seq + 1), `until` the
   * lower's end (Infinity while up): `jumpRefused` refuses inside it (`flinchOnTop`'s bounds). Null: none.
   */
  launcherSet: { start: number; until: number } | null = null;
  /**
   * PAR-83 (research 230 section 5.2.8; PTW.R3 with `../../viewer/src/walk` `WalkMode.launcherUp`): the launcher up on the
   * commands' clock -- the first command its base (type 0x12) is on top, the one after the raise's end
   * (`launcherBaseCommand`), and the firearm it came from: the stick lowers it from there (`launcherStick`). Null: none up.
   */
  launcherUp: LauncherUp | null = null;
  /**
   * PAR-83, F1 of its review (PTW.R3 with `../../viewer/src/walk` `WalkMode.swapGate`): the first command the stick's
   * moving lower no longer lives on -- the stick's command + `launcherMovingLowerCommands`; before it a raise (by the
   * command it rides) and a swap are refused (`FUN_005a8cb0` -> `FUN_005a7de0` -> `FUN_005a7980` D:L462492-462499).
   */
  movingLowerUntil = -Infinity;
  /**
   * PAR-83, F1: a raise that arrived with the launcher still up in the room and its own command not yet run (`seq` past
   * `sim.seq`): the page may have lowered it by a stick on a command still queued (no event), so it is decided when that
   * command's `launcherStick` lowers it (`raiseLauncher` there, its life's refusal with it). Null: none.
   */
  raiseAfterStick: { name: string; seq: number } | null = null;
  /**
   * M4 (`../../viewer/src/firearms`): the kit's launcher-round slots, each its own ring (the page's `KitRounds`); the
   * command count the last round left at, and the count the round's lock and its after-shot clip end at.
   */
  rounds = new KitRounds(null, BAKED_LOADOUT);
  /**
   * M4: the command count the primary's rate lets the next shot go after a launched round -- the kit's one rate timer
   * (`kit+0x8b8`, `FUN_005c09f0` with the redirected round's `FireWait`), shared by the carrier's rifle and its rounds.
   */
  roundWaitUntil = -1;
  /**
   * M4: the shotgun's pull in progress (its weapon, command count, rays so far, and the victims it has hit once). LATER 170
   * (3), LATER 510: `refused`, a pull whose first ray the room refused ('rate' early or near, or at the muzzle) -- its
   * later rays bloom and are refused the same, under its word `why` (`Room.refuseRound`; LATER 510's review F2).
   */
  volley: {
    w: 0 | 1; count: number; rays: number; hit: Set<number>; refused?: boolean; why?: string;
    /**
     * NCW-1 (B-count): the pull's rewind reads so far -- each ray's (`RewindRay`), its age (the first ray's), whether it
     * is past the kept history (`e`), and `counted` once its class is final and counted (`Room.settleRewind`): a ray
     * after that changes nothing.
     */
    rewind?: { rays: RewindRay[]; age: number; e: boolean; counted: boolean; lead?: number };
  } | null = null;
  /**
   * NCW-1 (the lane seat's addition; an instrument): this round's heartbeat round-trip samples (ms, raw, in order; at
   * most `RTT_SAMPLES_MAX_ADAPTATION`), `noteRoundTrip`'s -- summarised into `signals.rtt` by `roundReport`; emptied at
   * a round's start with the signals. `rttLast`, the newest sample whatever the round (ms; -1 none yet), for the
   * per-second `rewind` line.
   */
  rttRound: number[] = [];
  rttLast = -1;
  /**
   * PF-37 (`./shotgunGuard`): the room tick a shotgun volley last landed on this body -- the victim's `+0x1048` memory
   * (`FUN_005abbc0` D:L464701-464737), cleared by its update (`FUN_00550ef0` D:L418081-418083) and by a new body
   * (`FUN_00553ea0` L419774; `spawn`). `-Infinity`: none.
   */
  qHitAt = -Infinity;
  /** MAP-10b (PF.R31): the turret this player holds (`TurretPlacement.id`), or null. Its mover is held while set (`run`). */
  mounted: number | null = null;
  /** The mount's steer onto the seat while it runs (`SeatSteer`, TURRET_SEAT_READING), or null. */
  seat: SeatSteer | null = null;
  /**
   * LATER 104 (`TURRET_RELEASE_SEQ_ADAPTATION`, research 215 s7.9): the dismount asked and not yet taken -- its `seq`, the
   * page's last command at the press -- taken before the first command above it the room runs (`takeDismount`); else null.
   */
  dismount: number | null = null;
  /**
   * LATER 104: the mount's window end in the page's numbering -- the broadcast's `after` + `SeatSteer.ends` (the 16 steer
   * steps and the hold's command, on which the page's own keyed clip comes off); a dismount below it is refused 'mounting'.
   * LATER 151 (TURRET_RELEASE_WAIT_READING): never before `after` + `TURRET_RELEASE_WAIT_TICKS` (75 at 60 Hz) -- the
   * release's offer (`FUN_005a8850` D:L462975-462993) -- with or without the clips. Null: no turret held.
   */
  seatOff: number | null = null;
  /**
   * A1 (LATER 239, 217, 218, 243; MOUNT_GRANT_CHECKS_ADAPTATION, MOUNT_WORD_BOUND_ADAPTATION): the turret reserved for this
   * seat at its ask's command `k` and not yet taken. `at` is the room tick of the grant (the bound's start), `m` the command
   * the page named its take on (`mountTake`; null until it comes), and `word` whether the ask carried it. The body runs on
   * foot until `run` takes it before command `m` (`takeMount`). Null otherwise.
   */
  reserved: { turret: number; k: number; at: number; m: number | null; word: boolean } | null = null;
  /**
   * LATER 109 (TURRET_RELEASE_TRAVEL_READING, research 215 s7.9): a dismount's reversed mount clip while it runs -- its 16
   * steps and the end's command -- or null. Set by `takeDismount` (the press's release alone; a death, a leave, the knock and
   * the round's start carry the body nowhere); cleared at its end, a spawn, a resume, a death and a mount.
   */
  release: ReleaseTravel | null = null;
  /**
   * LATER 72 (`FUN_005a7ab0` D:L469416, the kit's timer `kit+0x820` D:L462522-462523): the climb's offer refused through a
   * reload's delay timer, after its press's command (`reloadPress`) -- the weapon and its magazine ring (a claim into the
   * slot lays a new one, as the page's `takeWeapon` cancels its reload, the same record too; its review's F1), the press's command
   * (`from`: its own climb is taken, the Action read before the reload in `FUN_00594cf0`'s order) and the command number
   * the window ends before (`seq` + the record's `ReloadDelay` in commands), against the command run. Null: none.
   */
  pressLock: { weapon: 0 | 1; ring: Player['mags'][0]; from: number; until: number } | null = null;
  /**
   * LATER 109's re-review F-A (TURRET_RELEASE_ACTIONS_PLACEHOLDER): the commands, in the page's numbering, an ask is refused
   * 'releasing' for naming -- the dismount's seq + 1 through + `ReleaseTravel.ends` - 1 (+ 16 at 60 Hz): the page holds its
   * presses and its trigger from the press through the end's command (`TurretPage.travelling`), so its asks inside the clip
   * name these. Judged by the command an ask names, not by whether the room's own travel still runs when it arrives (the
   * room runs behind the page); kept past the travel's end so a late ask dated inside it is still refused. Null: none.
   */
  releaseSpan: { from: number; to: number } | null = null;

  constructor(readonly id: number, public team: Team, sim: MoverSim, now: number) {
    this.sim = sim;
    this.lastActive = now;
    this.roundFromMs = now;                                      // NCW-6: the seat's wall time in the round from its seating
  }
}

type RoundState =
  /**
   * Classic, before the match: a side has no player. The original launches only with players on both teams ("There must
   * be players on both teams to launch", `FUN_002c3cf0` L165325-165352, UIMnLOC 350/356); a dedicated room has no lobby,
   * so its players walk and respawn as in a respawn room until both sides are seated (CLASSIC_WAITING_PLACEHOLDER).
   */
  | {
    phase: 'waiting';
    /**
     * Both sides seated: the tick the first round starts at (the owner's launch countdown, `OWNER_LAUNCH_COUNTDOWN_S`),
     * else absent. Still the waiting room meanwhile -- no ghosts, the ARMORY's requests taken (`inRound` false).
     */
    launchAt?: number;
    /**
     * ONL-18b, launched (`loadBarrierS`): round 1 held until every seat in `pending` (the players seated at the launch;
     * a leaver drops out) has sent `loaded`, or the room's tick reaches `until` (`FUN_002c4020` D:L165414-165441).
     * LOW-11 (research 223 §2.5): `loading`, the session tokens of the seats launched and not yet loaded -- one of them
     * seated again over the hold (its socket dropped and back, not a takeover) is waited for under its new id, and one
     * whose seat left is waited for all the same until the tick in `away` (`LOAD_REJOIN_GRACE_PLACEHOLDER`).
     * ROUND1-COUNT: `startAt`, once the barrier has passed, the tick round 1 starts (`ROUND1_AFTER_BARRIER_S_READING`
     * later); the hold stands until then, a `loaded` after it counting for nothing.
     */
    hold?: { until: number; pending: Set<number>; loading: Set<string>; away: Map<string, number>; startAt?: number };
  }
  | { phase: 'play'; startedAt: number; endsAt: number }
  /** "TIME EXPIRED": the world plays on until `resultAt`. */
  | { phase: 'expired'; resultAt: number }
  /**
   * Classic: a side eliminated; the world plays on until `resultAt` (`eliminatedHoldS`: the map's), the clock still running.
   * LATER 155: `reason`, what decided the round -- the elimination's, a rescue's or the hostage kills' (`eliminated.reason`),
   * the clock's end (`timedOut`), the bomb's result -- the first: nothing re-decides a hold. The welcome names it (`decided`).
   */
  | { phase: 'decided'; resultAt: number; winner: Team; endsAt: number; reason: DecidedWire['reason'] }
  | { phase: 'over'; nextAt: number; matchOver: boolean };

/**
 * Research 303 (a network adaptation, no original: the console's request is a local call): the least time between two
 * `victory` requests a seat's page has evaluated, seconds. A press makes one; within this a request is answered with
 * the offer as it stood, so a page flooding requests costs the room a lookup, never an eligibility pass or a dance.
 */
export const VICTORY_REQUEST_GAP_ADAPTATION = 0.25;

/**
 * LATER 171 (research 303 s4.8): whether the dance's offer is refused over the air and the mover's actions the offer's
 * gate names no refusal over (`VICTORY_OFFER_ACTION_GATE`'s `'uncited'`) -- `'refused'`, the room's rule before the read.
 * The offer's frame (`FUN_00593500` D:L452225-452295 -> `FUN_005a7de0(actor, 1, 0)` D:L462594-462740 -> the prompt
 * `vtbl[0x80]` -> `FUN_0057ddf0`, `FUN_00589900`) passes over them (C4 held in a jump's or landing's clip aside), so the
 * offer reads as offered, and the press's first step is read (research 230 s5.2.4: `FUN_0058a4d0` pops to the stance's
 * base, the dance's push links over it, a fall covers it from the next driver tick); unread is the dance's clip under the
 * fall's cover and through a stance change. A capture of the prompt and its press during a jump, a stance change, a
 * flinch and a knock settles it -- each apart, so a read may split this.
 */
export const VICTORY_OFFER_BUSY_PLACEHOLDER: 'refused' | 'offered' = 'refused';

/**
 * LATER 509 (research 303 §4, research 369 §1, §4; reading): a placing's hold on top (C4's `Put on wall`, the claymore's
 * and the PMN's `Place claymore`) and the dance's offer. The dance's own tests ask no hold (`FUN_0057ddf0` D:L440618 on,
 * `FUN_00589900` D:L446425 on) and the common gate's throw term holds no placing, so whether the original offers the dance
 * over a placing's clip is unread (its top clip's posture byte, D:L462616, or `FUN_00589900`'s other branches may refuse
 * it); the port keeps its refusal. Settled by the dance's offer read with a placing on top (the clip table's posture
 * bytes for the placings), or a capture of the prompt beside a corpse while placing.
 */
export const VICTORY_PLACING_HOLD_READING = 'refused: as the port refused it' as const;

/**
 * LATER 171's review (F2) and its re-read (research 303 s4.8): each mover action against the offer's gate, exhaustive over
 * `MoverActionName` -- a new action fails to compile until it is filed. `'cited'`: the gate refuses it -- the get-ups
 * (`FUN_00587f90` D:L445664-445677, D:L462679), the swaps and the launcher's raise (`FUN_005a7980` D:L462484-462491,
 * D:L462638), the dead's landing (the state 8); refused whatever `VICTORY_OFFER_BUSY_PLACEHOLDER` says. `'uncited'`: on
 * none of its lists -- the jump's and the air's, the stance changes (0x11, 0x13, 0x19), an ordinary flinch (pushed in its
 * state, D:L460019), a living SEAL's knock family (pushed in stance 0 or 2, never 8: `FUN_005807d0` D:L442090-442104,
 * `FUN_005805b0` D:L442004-442020, prone cover D:L441012-441018 -- 8 only with `+0xe1` bit 4 clear or a remote
 * controller, which the offer's own predicate refuses, D:L440639, D:L440642), and the pick-up's `Swap rifle` (on neither
 * lock's list; the offer's gate runs no NoFire test, its third argument 0, D:L462695-462705); refused under the
 * placeholder.
 */
export const VICTORY_OFFER_ACTION_GATE: Readonly<Record<MoverActionName, 'cited' | 'uncited'>> = {
  jump: 'uncited', launch: 'uncited', fall: 'uncited', land: 'uncited', landHard: 'uncited',
  standToCrouch: 'uncited', crouchToProne: 'uncited', standToProne: 'uncited', hit: 'uncited', hitStomach: 'uncited',
  fallForward: 'uncited', fallBackwards: 'uncited', landBackwards: 'uncited', proneCover: 'uncited',
  swapRifleExchange: 'uncited', swapRifleClaim: 'uncited',
  getUp: 'cited', getUpBackwards: 'cited',
  swapStand: 'cited', swapCrouch: 'cited', swapProne: 'cited', rifleToLauncher: 'cited', pistolToLauncher: 'cited',
  landDeath: 'cited',
};

/**
 * SVC-20b-relay (research 225 §4): a member's voice state on the room. `base` is the base its last ask named, `active`
 * the radio's remembered ACTIVE CHANNEL (`+0xc4`, `FUN_0022f950`; asked again by the return to life, `voiceRespawn`),
 * `radioOff` RADIO OFF, `spectator` the role its last entry was asked as, `channel` its current channel (-1 before its
 * first), and `tokens` / `at` its frame bucket (constraint 4). SVC-20c: `ghost` stands for the original's game `+0xd2`
 * (`VOICE_GHOST_FLAG_READING`, research 225 §5.1): set at a seat's entry into a classic round in play, cleared at the
 * next round's start (the original's between rounds, D:L75846-75849; at a level start D:L55855).
 */
interface VoiceSeat {
  base: VoiceAsk['base']; active: 0 | 1 | 2; radioOff: boolean; spectator: boolean; channel: number; tokens: number; at: number;
  ghost: boolean;
}
/** The floor's channels whose entry changed, and the members who moved channel: who `voiceTell` tells. */
interface VoiceNews { changed: number[]; moved: Set<number> }

/**
 * SIMDROP-INSTR (sim drops #3 and #4; REFUSAL_RECORD_ADAPTATION -- an instrument with no original, it changes no verdict):
 * the `fire: cone: *` refusals a seat's log names in full a round (`Room.takeRefusals`, logged once a second beside the
 * drops); past them each is counted only. The replay's `refusal` record keeps every one.
 */
export const REFUSAL_LINES_PER_ROUND = 5;
export const REFUSAL_RECORD_ADAPTATION = 'a fire: cone: * refusal is recorded (replay-only) and logged with the room eye locus; nothing judged changes' as const;
/** SIMDROP-INSTR: a `fire: cone: *` refusal's log line (`Room.takeRefusals`): the replay record's fields and its tick. */
export type RefusalLine = ReplayRefusal & { tick: number };

export class Room {
  /**
   * Research 303: the VICTORY DANCE, the room's (additive under protocol 11: `victory` and `victoryOffer`, no body-state
   * bit -- `BodyState.flags` is full). The room offers it (`victoryStatus`, each tick, sent on a change), takes a request
   * (`requestVictory`: shaped, rising, `VICTORY_REQUEST_GAP_ADAPTATION` apart, checked again here), picks the variant
   * (`chooseVictory`, `FUN_005e5970`), starts it on the dancer's mover (`Walker.setVictoryMotion`: its root, its NoFire)
   * and tells every page; it stops it at its end, at a cut (the stick, an action, a hold, a death, a flinch, a reload, a
   * spawn, a leave) and tells every page again. A joiner hears the dances under way (`hello`).
   */
  private readonly victoryPlaying = new Map<number, { serial: number; clip: string; start: number; seconds: number }>();
  private readonly victoryOffers = new Map<number, VictoryEligibility>();
  private readonly victoryRequests = new Map<number, { request: number; at: number }>();
  private victorySerial = 0;

  /**
   * LATER 509: whether the walker's hold refuses the dance's offer -- a reload's (the common gate's term 5), a throw the gate's
   * throw term holds for the hand (`Walker.throwOnTop`: the pistol's standing throw and lean tosses do not), a placing's
   * (`VICTORY_PLACING_HOLD_READING`). Was: every hold.
   */
  private victoryHoldRefuses(p: Player): boolean {
    const h = p.sim.walker.holding;
    if (!h) return false;
    const family = holdFamily(h.clip);
    if (family === 'throw') return p.sim.walker.throwOnTop(p.sim.weapon === 1);
    return family !== 'place' || VICTORY_PLACING_HOLD_READING === 'refused: as the port refused it';
  }

  /**
   * The seat's offer now (research 303 s3, the supported subset): a living player's, the round not over, the map's
   * clips in, no dance playing; its body free -- on the floor, no action, refusing hold (`victoryHoldRefuses`, LATER 509), overlay, move, turret,
   * binoculars, swap or reload (`unsupported-state`: the original's other actor states are not mapped) -- and an enemy corpse within
   * 30 units (`victoryEligibility`), one the pages still draw (`corpseShownS`: a hidden body is offered to none). NU-4
   * (research 317 R317.1, R317.3, R317.4): the pages draw another seat's corpse until its seat is alive -- the whole round
   * in classic, until the respawn in a respawn game, a classic waiting room taking the respawn rule
   * (`CLASSIC_WAITING_PLACEHOLDER`); was: under `BODY_FADE_S` (10 s) old.
   */
  private victoryStatus(p: Player): VictoryEligibility {
    if (this.state.phase === 'over') return 'unsupported-state';
    if (!this.map.victory?.variants.length || !p.alive || p.arming
      || this.lobby.member(p.id)?.role !== 'player' || this.victoryPlaying.has(p.id)) return 'unavailable';
    const w = p.sim.walker, at = w.state;
    // LATER 171: the uncited (the air, `VICTORY_OFFER_ACTION_GATE`'s 'uncited') under the placeholder; the gate's own
    // actions and the binoculars (`FUN_00593500` returns on the kit's view state 4, `FUN_005b90f0` D:L452262) outside it.
    const act = w.action?.name ?? null, cited = act !== null && VICTORY_OFFER_ACTION_GATE[act] === 'cited';
    // BPN-6: allocation-free (F0043) -- the actor and the bodies are the room's scratch, refilled in place each call
    // (`victoryEligibility` neither keeps nor changes its inputs); every term and its order as before.
    const actor = this.victoryActor;
    actor.alive = p.alive; actor.team = p.team;
    actor.position[0] = at.x; actor.position[1] = at.y; actor.position[2] = at.z;
    actor.ready = (VICTORY_OFFER_BUSY_PLACEHOLDER === 'offered' || (!w.airborne && (act === null || cited)))
      && !cited && !p.binoculars && !p.scopeView   // LATER 182: FUN_00593500 returns under a scope too (FUN_005b9990, D:L452259)
      && !this.victoryHoldRefuses(p) && !w.overlay && !p.sim.moves?.pose() && p.mounted === null
      && !this.swapRefused(p, p.sim.seq + 1) && !p.reloadUntil.some((until) => p.ran < until);   // LATER 167: the prompt's gate FUN_005a7de0 asks the reload lock
    const bodies = this.victoryBodies;
    let n = 0;
    for (const q of this.players.values()) {
      if (q === p) continue;
      const t = q.sim.walker.state;
      const b = bodies[n] ??= { alive: false, team: q.team, position: [0, 0, 0], present: false };
      n++;
      b.alive = q.alive; b.team = q.team;
      b.position[0] = t.x; b.position[1] = t.y; b.position[2] = t.z;
      b.present = !q.arming && !q.deadAtLoad && !q.away && (q.alive || (q.diedAt >= 0 && (this.tick - q.diedAt) / TICK_HZ < corpseShownS(this.opts.rules, 'other', this.state.phase === 'waiting')));
    }
    if (bodies.length !== n) bodies.length = n;
    return victoryEligibility(actor, bodies);
  }
  /** BPN-6: `victoryStatus`'s reused actor and bodies (F0043); a body slot kept past a trim is rebuilt on regrowth. */
  private readonly victoryActor: { alive: boolean; team: Team; position: [number, number, number]; ready: boolean } = { alive: false, team: 'seal', position: [0, 0, 0], ready: false };
  private readonly victoryBodies: { alive: boolean; team: Team; position: [number, number, number]; present: boolean }[] = [];
  /** The seat's dance stopped (its mover's too), told to every page. */
  private stopVictory(id: number): void {
    const old = this.victoryPlaying.get(id);
    if (!old) return;
    this.victoryPlaying.delete(id);
    const p = this.players.get(id), w = p?.sim.walker;
    w?.stopVictoryMotion();                                      // PARITY-1 close: its own end, `stopped` (research 251 s9)
    this.broadcast({ type: 'victory', id, serial: old.serial, clip: null, elapsed: 0, ...(p ? { seq: p.sim.seq } : {}) });   // PAR-49: the start's seq
  }
  /**
   * A seat's `victory` request: only `{ type, request }`, `request` above its last; within `VICTORY_REQUEST_GAP_ADAPTATION`
   * of the last one taken it is answered with the offer as it stood, nothing evaluated. Refused, the seat hears its
   * offer (`victoryOffer`: its page's request is answered); taken, the variant starts after the seat's last command run
   * (`seq`) on the room's mover and every page hears it.
   */
  private requestVictory(id: number, ev: Record<string, unknown>): void {
    const p = this.players.get(id), request = ev.request, last = this.victoryRequests.get(id);
    if (!p || !Number.isSafeInteger(request) || (request as number) < 0
      || Object.keys(ev).some((k) => k !== 'type' && k !== 'request')
      || (request as number) <= (last?.request ?? -1)) return this.dropped('victory', 'shape', p);
    if (last && this.tick - last.at < VICTORY_REQUEST_GAP_ADAPTATION * TICK_HZ) {
      this.victoryRequests.set(id, { request: request as number, at: last.at });
      this.dropped('victory', 'rate', p);
      this.send(id, { type: 'victoryOffer', status: this.victoryOffers.get(id) ?? 'unavailable' });
      return;
    }
    this.victoryRequests.set(id, { request: request as number, at: this.tick });
    const status = this.victoryStatus(p);
    if (status !== 'available') { this.send(id, { type: 'victoryOffer', status }); return; }
    const variants = this.map.victory!.variants;
    const v = variants[chooseVictory(variants, this.opts.random())];
    if (!v?.motion.playback) return;
    p.sim.walker.setVictoryMotion(v.clip, v.motion);
    if (!p.sim.walker.victoryMotion) return;                       // no root keys: nothing played, nothing told
    const serial = ++this.victorySerial;
    this.victoryPlaying.set(id, { serial, clip: v.name, start: this.tick, seconds: oneShotSeconds(v.motion.playback, v.clip.frameCount) });
    this.broadcast({ type: 'victory', id, serial, clip: v.name, elapsed: 0, seq: p.sim.seq });
  }
  /** Once a tick, after the commands: a dance ended or cut stopped; each seat's offer sent when it changed. */
  private tickVictories(): void {
    for (const [id, dance] of this.victoryPlaying) {
      const p = this.players.get(id), w = p?.sim.walker;
      if (!p?.alive || !w || this.state.phase === 'over' || w.action || w.holding || p.sim.moves?.pose()
        || (this.tick - dance.start) / TICK_HZ >= dance.seconds) this.stopVictory(id);
    }
    for (const p of this.players.values()) {
      const status = this.victoryStatus(p);
      if (this.victoryOffers.get(p.id) === status) continue;
      this.victoryOffers.set(p.id, status);
      this.send(p.id, { type: 'victoryOffer', status });
    }
  }

  private readonly tauntRequests = new TauntRequests();
  private readonly communicationRequests = new CommunicationRequests();
  /** SVC-20b-relay (research 225 §4): the floor table, the room being the original's game host (research 170 §2.1). */
  private readonly voiceFloor = new VoiceFloor();
  /** SVC-20b-relay: each member's voice state (`VoiceSeat`), from its hello to its leave. */
  private readonly voice = new Map<number, VoiceSeat>();
  /** LATER 20: a takeover's frame bucket (`VoiceSeat.tokens` / `at`), carried from the old id to the new one's entry (`voiceEnter`). */
  private readonly voiceBuckets = new Map<number, { tokens: number; at: number }>();
  /** VOICE-LATE: the relay's voice drops since the server last asked (`takeVoiceDrops`). */
  private voiceDrops = { bucket: 0, skipped: 0 };
  /** VOICE-LATE-3: each talker's voice frames at the relay, from the room's start (`voiceCounts`). */
  private readonly voiceTalkers = new Map<number, VoiceTalkerCounts>();
  /** AD-14: the channel and member count each member was last told (`voiceMembersTell`), so only a change is told. */
  private readonly voiceMembersTold = new Map<number, { channel: number; members: number }>();
  tick = 0;
  readonly lobby: Lobby;
  private readonly conns = new Map<number, Conn>();
  /**
   * NET-WIRE (protocol 11; the owner's OT.R38 / H118): the environment each connection was last sent -- its welcome's, then
   * a snapshot's -- by revision and round epoch. A snapshot names the environment only to a connection whose pair differs
   * (`snapshots`); the transport is ordered and reliable (a WebSocket), so what was sent is what the page holds.
   */
  private readonly envSent = new Map<number, { revision: number; epoch: number }>();
  /**
   * NU-3c (research 321 section 4.2.1): the part bytes each connection was last sent, by the seat they are of
   * (`tellHealth`), kept as `envSent` is: the transport is ordered and reliable, so what was sent is what the page holds;
   * a page newly entitled to a seat's (a join, a promotion, a switch of sides) is sent the current ones on the next tick,
   * as a joining console takes the whole object (research 193 section 2.4).
   */
  private readonly healthSent = new Map<number, Map<number, readonly number[]>>();
  private readonly players = new Map<number, Player>();
  private readonly opts: RoomOptions;
  round = 1;
  /** Every round's start counts one (`startRound`): unlike `round`, never reset, so a spawn's round is unambiguous. */
  private roundSerial = 0;
  /**
   * SVC-12d (research 155 §4.2): the match's serial in this room and its start, the room's clock in ms (`startRound`'s
   * new match; an unheld respawn room's first at its construction); the round's leavers with their accounts
   * (`noteLeaver`), for `roundResultOf`'s `'counted'` branch; SVC-07: the match's leavers, each seat's match as it stood at its leave, for the
   * `RoomMatchResult` (`LEAVE_COST_OWNER`, OT.R33 call 7 (b)).
   */
  private matchSerial = 0;
  /** Transport/lobby adaptation: the same game keeps its result serial across map loads. */
  continueMatchSerial(serial: number): void {
    if (this.launched || this.matchSerial !== 0 || !Number.isSafeInteger(serial) || serial < 0) throw new Error('invalid map match serial');
    this.matchSerial = serial;
  }
  private matchStartedAt = 0;
  /** SVC-12d: the tick the match began; null until a held room's first launch, or an unheld respawn room's first seat. */
  private matchStartTick: number | null = null;
  private roundLeavers: RoomRatingSeat[] = [];
  private matchLeavers: RoomMatchSeat[] = [];
  /**
   * PF-28 (ruling PF.R47; research 231 s2): the next projectile's stable id (`flyer`), from 0 again with the air cleared
   * at each round's start and at the abandon (`clearAir`), never given twice in between (PROJECTILE_ID_READING).
   */
  private pidSerial = 0;
  /**
   * PF-28 (research 231 s3): the round's result as `endRound` sent it, with the tick it went (`at`), while the round
   * screens run; null from the next round's start (`startRound`) and at the abandon. A joiner's `join.result`.
   */
  private lastResult: JoinResultWire | null = null;
  /** NU-4 D1 (research 317 R317.8): the result the drops were swept for, once a result (DROP_SWEEP_AT_RESULT_READING). */
  private sweptFor: JoinResultWire | null = null;
  /** Protocol 10 (MAP-03): the tick the last `startRound` ran on; null before one (a respawn room's first round: tick 0). */
  private roundStartTick: number | null = null;
  readonly wins = { seal: 0, terrorist: 0 };
  private state: RoundState;
  private readonly polys;
  private creditStep = 1;
  /**
   * HOTFIX grenade fuse (the review's F1): true from this step's credit (`serverClock += creditStep`) to `flyGrenades` --
   * a throw decided then (its command run in the step's burst) already has the step's credit in its age (`Flying.late`).
   */
  private creditOpen = false;
  /** LOW-12: the steps taken, and the wall time of the first, for the credit (`step`). */
  private steps = 0;
  private firstStepAt: number | null = null;
  /**
   * SVC-23b: the room's own clock, in ticks: the steps' credit (a tick each, or the wall time's when the loop stalled and
   * dropped ticks -- LOW-12: the larger of the two counted from the first step, never both), so a stall's dropped ticks
   * count as the commands they let run do. The rate and the locks of the timed events are counted
   * on it as well as on the command clock (`FIRE_ARRIVAL_JITTER_TICKS`); no page sets it.
   */
  private serverClock = 0;
  /** The rows changed (a join, a leave, a rename): one score event goes out at the next tick, at most each SCORE_EVERY_TICKS_PLACEHOLDER. */
  private scoreDirty = false;
  /** LOW-13: when each player's last rename was taken (`RENAME_EVERY_MS_PLACEHOLDER`). */
  private readonly renamedAt = new Map<number, number>();
  /** MEDIUM-3: the tick the last coalesced `score` went out (`SCORE_EVERY_TICKS_PLACEHOLDER`). */
  private scoreSentAt = -Infinity;

  /**
   * The hit volumes (research 91 section 1.3), per side (2026-09-30) and per character type (web sprint 5 S2): each
   * type's own skeleton (`chartype.rdr`'s `navyseals` / `terrorists` in order, as the page's bodies are,
   * `../../viewer/src/teamBody`) at each posture's idle, built once here, and a player's are its body's type's
   * (`volumesOf`). The types' models share the 26 bones but not their bind poses or their parts' boxes -- Frostfire's
   * SEAL 2 (`seal_E_scuba`) has another head capsule than SEAL 1 (`seal_A_scuba`), research 95 §6 -- so each type
   * is hit on its own. A type without its own skeleton takes its side's first's, a side without one the SEAL's; null:
   * the placeholder capsules.
   */
  private readonly volumes: Readonly<Record<Team, readonly (StanceVolumes | null)[]>>;
  /** HIT-POSE: the hit bodies `volumes` was built from, in the same lists (`hitBodyOf`: the same pick as `volumesOf`). */
  private readonly hitBodies: Readonly<Record<Team, readonly (HitBody | null)[]>>;
  /** HX-2: the hostages' hit volumes, `TeamHitBodies.escortees`' (`volumesOf({ escortee })`). */
  private readonly botAppearances = new Map<number, string>();
  private readonly escorteeVolumes: readonly (StanceVolumes | null)[];
  /** HX-4a: each escortee body's `character.rdr` character (`SimSkeleton.character`), null when unread. */
  private readonly escorteeCharacters: readonly (string | null)[];
  /**
   * DOORS (socomlegacy/docs/research/92-doors.md): the map's doors, run here -- a client's `door` event asks, the reach is
   * checked, the swing turns the leaf's polygons in the hull every mover reads -- and sent in every snapshot.
   */
  readonly doors: DoorSet;
  /**
   * MAP-07 (`../../viewer/src/gates`, research 174 §5, 175 §5.3): Death Trap's and Enowapi's lever gates. A client's
   * `action` on one of their levers toggles the slide here; the pose is the tail of `Snapshot.doors`.
   */
  readonly gates: GateSet;
  /**
   * MAP-07: the press that last asked each gate to move. The slide starts after the program's 0.24 s wait, so the
   * close log reads it then; a later pull on another leaf must not replace it.
   */
  private readonly gatePull = new Map<number, { id: number; action: number; seq: number }>();
  /**
   * Chain Reaction's hooks (research 176 §9): run here, the same way the doors are. A SWITCH whose valve is one of
   * theirs pauses or resumes that hook and keeps the phase, and the room broadcasts the action so every client runs
   * the presentation program. There is no separate lever animation; the mesh swap is the lever, and the snapshot
   * carries the phase, the swing and those meshes (`Snapshot.cranes`).
   */
  readonly cranes: CraneSet;
  /**
   * The last crane press dropped `missed`, when `onActionMiss` is set (`__room.lastActionMiss`). Null until one is.
   * A development read: the press itself does not look at it.
   */
  lastActionMiss: CraneActionMiss | null = null;
  /** #337 takeover, point 4: the crane SWITCHes whose record scored this round (the record's `+0x3f` bit 1). */
  private readonly craneScored = new Set<number>();
  /**
   * MAP-02 (`../../viewer/src/worldState`, research 209 s8): the room's own world -- which placed nodes are active, on
   * this room's owners (`forkSimMap`) -- zAnim's initial state applied before anyone spawns, restored at every round's
   * start (`startRound`).
   */
  readonly world: WorldState;
  /**
   * NET-WIRE (protocol 11; research 224): the feet's origin in every snapshot -- the centre of the map's hull's bounds
   * (`feetOriginOf`), whole units -- from which the others' feet ride i16 at `FEET_STEP`. A wire step: the room's own
   * positions and its authority are unchanged.
   */
  readonly feetOrigin: [number, number, number];
  /**
   * XR-05 (`./bomb`, research 214): the bomb on a map of game type 2 with its two MPBOMB records and StartBomb -- and, since
   * LATER 149 (research 174 §2), of game type 1 with `terrorist_tent` alone --
   * else null. Its transitions are heard on `bomb.on(...)` (PF-14's scoring, XR-08's bases).
   */
  readonly bomb: BombAuthority | null;
  /** PF-14b: the planted bomb's planter as the player object (the detonation's actor), else null. */
  private bombPlanter: Player | null = null;
  /**
   * HX-1 (`./extraction`, research 237 s2-s3): EXTRACTION's three hostages and MP6's valves on a map of game type 4 with
   * its escortee starts, else null -- room-owned bodies (ids from 240) in the snapshot and the welcome, struck through
   * the body pipeline, never counted for the elimination; their rules read in `clock()` after the elimination.
   */
  readonly extraction: ExtractionAuthority | null;
  /**
   * HX-1: the round's total in seconds from its start (`opts.roundSeconds` at `startRound`), less a minute for each
   * observed rise of `mp_penalty` (`PENALTY_MINUTE_READING`): the clock's end is its start plus this.
   */
  private roundTotalS: number;
  /** LATER 152 (`DEFUSE_CLOCK_HELD_READING`): the round clock held at the defuse, seconds; null while it runs. */
  private clockHeldS: number | null = null;
  /** MAP-10b (PF.R31): the map's manual turrets (`SimMap.turrets`), the room the owner of each occupant. */
  private readonly turrets: TurretState[];
  /** MAP-10b: the mounts asked since the last step, at most one a seat (`turretRequest`). */
  private readonly mounts: MountAsk[] = [];

  /**
   * The kit tables (web sprint 4; `../../viewer/src/loadout` `SimKits`): the disc's `ZWEAPON.ZAR` read at the server's
   * start and the map's kits; null (a test, a disc without them) seats everyone with the baked pair (`BAKED_LOADOUT`).
   */
  constructor(readonly map: SimMap, readonly clips: SimClips | null, opts: Partial<RoomOptions> = {}, body: HitBody | TeamHitBodies | null = null,
    private readonly kits: SimKits | null = null) {
    const bodies: TeamHitBodies = !body ? { seal: null, terrorist: null } : 'skeleton' in body ? { seal: body, terrorist: null } : body;
    // One set of capsules a skeleton: types that share a body object share its volumes.
    const built = new Map<HitBody, StanceVolumes>();
    const side = (b: TeamHitBodies[Team]): (StanceVolumes | null)[] => (b === null ? [] : Array.isArray(b) ? b : [b as HitBody]).map((h) => {
      if (!h) return null;
      let v = built.get(h);
      if (!v) { v = stanceVolumes(h); built.set(h, v); }
      return v;
    });
    this.volumes = { seal: side(bodies.seal), terrorist: side(bodies.terrorist) };
    const list = (b: TeamHitBodies[Team]): (HitBody | null)[] => (b === null ? [] : Array.isArray(b) ? [...b] : [b as HitBody]);
    this.hitBodies = { seal: list(bodies.seal), terrorist: list(bodies.terrorist) };
    this.escorteeVolumes = side(bodies.escortees ?? null);
    this.escorteeCharacters = (bodies.escortees ?? []).map((b) => b?.character ?? null);
    this.doors = new DoorSet(map.doors ?? [], map.ground, {
      animate: (_door, type, actor) => this.doorMotion(type, actor),
      // DF-4 (viewer `DOOR_CALL_READING`): the door program's CALL into the map set runs on the room's world, the wire's.
      call: (door, anim) => { this.world.doorCall(door, anim); },
    });
    this.cranes = new CraneSet(map.cranes ?? [], map.ground);
    this.world = new WorldState(map.meta ?? bareMeta(map.stem), map.ground, map.grid);
    this.feetOrigin = feetOriginOf(map.ground.points);
    this.world.skipEffects = ROOM_SKIP_EFFECTS_READING;     // SUP-03: the deaths' effects are the pages'
    this.world.applyInitial();
    this.world.on({
      fire: (op, path) => this.sceneRound(op.weapon, op.f1, op.offset, path),   // research 386 §3.2
      // V13-3c (research 386 §3.5; viewer `SCENE_DEATH_ON_WIRE_READING` 'targetOffOrTold'): each death the room's world
      // ran, told to every page at once -- the one a target's state never shows (MP12's `ant_base1`) among them.
      died: (id) => this.broadcast({ type: 'sceneDeath', id, epoch: this.roundSerial & 0xffff }),
    });
    // MAP-07: `set_accessN` stays on the world (a destroyed gate). The lever valves live in the gate set. The `[gate]`
    // line is a server instrument (no original; the room's log only), naming the pull or the round reset that shut it.
    this.gates = new GateSet(map.gates ?? [], map.ground, {
      closing: (gate, why) => {
        const pull = why === 'use' ? this.gatePull.get(gate.index) : undefined;
        const by = pull ? ` action ${pull.action} by ${pull.id} seq ${pull.seq}` : '';
        console.info(`[gate] ${gate.node} closing: ${why}${by}`);
      },
    }, (name) => this.world.valve(name));
    this.bomb = BombAuthority.of(map, {
      tick: () => this.tick,
      live: () => this.state.phase === 'play' || this.state.phase === 'decided',   // LATER 145: DECIDED_HOLD_BOMB_READING (`./bomb`)
      actors: () => [...this.players.values()].map((p) => this.bombActor(p)),
      actor: (id) => { const p = this.players.get(id); return p && this.bombActor(p); },
      cast: () => this.hullCast(),
      send: (wire) => this.broadcast({ type: 'bomb', ...wire }),
    });
    // PF-14b (research 214 s5; 192 s3.6): the bomb's +2s on its transitions only -- the plant (FUN_005455d0) to the
    // planter, the defuse (FUN_00545650) to the defuser, the detonation (FUN_00545750) to the planter. The detonation's
    // planter is the player object kept at the plant, never its seat id: the bomb keeps a departed planter's id till the
    // reset and the server hands that id to the next page, which must not inherit it (as `thrower`); a takeover moves the
    // kept object to the seat's new body (`seat`). A departed actor scores no one (`scoreObjective`). A re-sent wire is
    // no transition and scores nothing.
    this.bomb?.on('planted', (e) => {
      this.bombPlanter = (e.by !== null && this.players.get(e.by)) || null;
      this.scoreObjective(this.bombPlanter, { kind: 'plant' });
      this.plantedClock();                                     // LATER 148: PLANTED_CLOCK_FUSE_READING
    });
    this.bomb?.on('defused', (e) => { this.scoreObjective(e.by, { kind: 'defuse' }); this.holdClock(); });   // LATER 152
    this.bomb?.on('detonated', () => { this.scoreObjective(this.bombPlanter, { kind: 'detonate' }); this.bombPlanter = null; });
    // XR-08 (research 213 s5): the detonation reaches the bases (`bombBlast`); BOMB-DAMAGE (research 332): the players too.
    this.bomb?.on('detonated', (e) => this.bombBlast(e.pos));
    // HX-1 (research 237 s2): the hostages, stepped while the level runs; the watch sees every seated living body.
    this.extraction = ExtractionAuthority.of(map, {
      clips: this.clips,
      tick: () => this.tick,
      live: () => this.state.phase === 'play' || this.state.phase === 'decided' || this.state.phase === 'expired',
      // LATER 131: what decided the round and for whom -- `start`'s branches stop VIPcheck, and its SEALs-eliminated ones SEALcheck (`./extraction`)
      decided: () => (this.state.phase === 'decided' ? { reason: this.state.reason, winner: this.state.winner } : null),
      random: () => this.opts.random(),
      bodies: () => [...this.players.values()].map((p) => {
        const w = p.sim.walker.state;
        const posture = p.sim.walker.stance;
        return { id: p.id, feet: [w.x, w.y, w.z] as V3, alive: p.alive, team: p.team === 'seal' ? SEAL_TEAM_MASK : TERRORIST_TEAM_MASK,
          yaw: w.yaw, velocity: [w.vx, w.vy, w.vz] as V3, topSpeed: stanceBody(posture).bands.forward,
          stance: posture === 'prone' ? 2 as const : posture === 'crouch' ? 1 as const : 0 as const };
      }),
      send: (ev) => this.broadcast(ev),
      // HX-4a (research 239 s9.1): the orders' seats, pick and tally.
      seat: (id) => {
        const p = this.players.get(id);
        if (!p) return undefined;
        const w = p.sim.walker.state;
        return { id, alive: p.alive, spectator: this.lobby.member(id)?.role === 'spectator', team: p.team, feet: [w.x, w.y, w.z] as V3 };
      },
      // HX-OBEY: the page's eye (the wire's, always given: `text()`'s shape check), trusted within a bound of the body's
      // camera locus and the walls (`orderPickTrusted`).
      pick: (issuer, eye, dir, seq, _target, viewTick) => this.orderPickTrusted(issuer, eye, dir, seq, viewTick),
      dropped: (why, issuer) => this.dropped('hostageOrder', why, this.players.get(issuer)),
    });
    // HX-5 (research 239 s4): a rescue credits its last leader when a SEAL (`RESCUE_CREDIT_READING`, `FUN_00545480`
    // D:L411554-411572: +3, brought out +1, the team carry); a Terrorist leader nothing (`TERRORIST_LEAD_RESCUE_READING`).
    // A hostage's kill costs its seated killer 2 and counts escortees killed (`FUN_00545390` D:L411524-411547); a world
    // kill (no seated killer) nothing (`WORLD_KILL_UNCOUNTED_READING`).
    this.extraction?.on('rescued', (e) => {
      const p = e.by && this.players.get(e.by.id);
      if (!p || p.team !== 'seal') return;
      p.hostagesRescued++; p.roundRescued++;
      this.scoreObjective(p, { kind: 'rescue' });
    });
    this.extraction?.on('killed', (e) => {
      const p = e.by && this.players.get(e.by.id);
      if (!p) return;
      p.escorteesKilled++;
      this.scoreObjective(p, { kind: 'hostageKill', killerTeam: p.team });
    });
    this.turrets = (map.turrets ?? []).map((place) => ({
      place, occupant: null, ammo: place.ammoInit ?? 0, record: this.turretRecord(place), round: this.turretLaunched(place), lastFire: -1e9, fireClock: -1e9, fireSchedule: FIRE_GATE_NONE, ammoDirty: false,
      gunYaw: place.facing, mags: null, reloading: false, lockUntil: -1e9, lockFrom: -1e9, released: null, lands: true, mountCount: -1e9, reserved: false, word: false,
    }));
    this.opts = { ...DEFAULT_OPTIONS, ...opts };
    this.opts.eqLimit = equipmentLimit(opts.eqLimit);
    // LATER 153: respawn is SUPPRESSION's alone -- `FUN_002a7560` (D:L149405-149431) sets the `Respawn` valve only with the
    // host option and game type 5 (research 91 §1, 192 §2.2) -- so a respawn room on another read type (DEMOLITION,
    // BREACH, ESCORT, EXTRACTION) plays classic, its bomb's clock (LATER 148, 152) a classic round's. Type 0 keeps the
    // room's choice (`RESPAWN_TYPE0_KEEPS_CHOICE_ADAPTATION`). Before anything reads the rules (the state, below).
    this.opts.rules = playedRules(this.opts.rules, map.gameType);
    if (this.opts.rules === 'respawn') {
      this.opts.roundSeconds = opts.roundSeconds ?? RESPAWN_ROUND_SECONDS;
      this.opts.maxRounds = opts.maxRounds ?? RESPAWN_MAX_ROUNDS;
    }
    this.opts.idleKickMs = Math.min(IDLE_KICK_MAX_MS, Math.max(IDLE_KICK_MIN_MS, this.opts.idleKickMs));
    this.polys = groundPolygons(map.ground);
    this.state = this.opts.rules === 'classic' || this.opts.heldLaunch ? { phase: 'waiting' } : { phase: 'play', startedAt: 0, endsAt: this.opts.roundSeconds * TICK_HZ };
    if (this.state.phase === 'play') this.newMatchId();           // SVC-12d: only an unheld respawn room starts here
    this.roundTotalS = this.opts.roundSeconds;
    this.lobby = new Lobby({ maxPlayers: this.opts.maxPlayers, maxSpectators: this.opts.maxSpectators, teamSize: this.opts.teamSize });
    // FCW-31: the rule host, attached once; an unheld respawn room is in play from here (no `startRound`), so its match and
    // round start are told here.
    this.ruleHost = this.opts.ruleHost ?? null;
    if (this.ruleHost) {
      this.ruleHost.attach(this.ruleView());
      if (this.state.phase === 'play') { this.ruleEvent({ name: 'match.start' }); this.ruleEvent({ name: 'round.start' }); }
    }
  }

  /** FCW-31: the creator rules host (`RoomOptions.ruleHost`), or null -- then no rule event is ever built. */
  private readonly ruleHost: RoomRuleHost | null;
  /** FCW-31: one of the room's outcomes told to the rule host (`./creator/rules` `RuleEventInput`); nothing without one. */
  private ruleEvent(input: RuleEventInput): void { this.ruleHost?.event(input); }
  /**
   * FCW-31: a hit on a seated player as `player.hit` -- the attacker (none for a departed thrower's), the weapon's name as
   * the kill line names it (`weaponName`), its class by the kit tables' id ranges (`itemClass`, `FUN_003d1a60`
   * L324331-324352, `@s2u/scene` `arsenal.ts`) and the damage the room lays, whole. Returns the factor the rules scale
   * the hit's damage by (`hit.scale`): 1 without a host, or with none of its rules scaling it.
   */
  private ruleHitEvent(attacker: Player | null, victim: Player, record: { readonly id: number; readonly name: string }, amount: number): number {
    if (!this.ruleHost) return 1;
    return this.ruleHost.hit({
      name: 'player.hit', ...(attacker ? { attacker: attacker.id } : {}), victim: victim.id,
      fields: { weapon: this.weaponName(record.id, record.name), weaponClass: itemClass(record.id), amount: Math.round(amount) },
    });
  }
  /** FCW-31: the seats a rule's `player.eliminate` put out of this round (no respawn until the next); empty without a host. */
  private readonly ruleOut = new Set<number>();
  /** FCW-31: a rule's `match.end` -- the round it ends ends the match. */
  private ruleMatchOver = false;
  /** FCW-31: the spawner a rule's `spawner.release` (re)spawns a seat from, for its `player.spawn`. */
  private ruleSpawner: string | null = null;
  /**
   * FCW-31 (spec §5: outcomes are the room's): the room as a rule host reads it -- the tick, the seated players -- and acts
   * on it, each action through the room's own path (`kill`, the score rows, `endRound`, the door set, `spawn`, `send`).
   */
  private ruleView(): RuleRoom {
    const room = this;
    const inPlay = (): boolean => this.state.phase === 'play';
    return {
      get tick(): number { return room.tick; },
      players: (): RulePlayer[] => [...this.players.values()].filter((p) => this.lobby.member(p.id)?.role !== 'spectator').map((p) => {
        const s = p.sim.walker.state;
        return { id: p.id, team: p.team, alive: p.alive, out: this.ruleOut.has(p.id) || (!p.alive && this.opts.rules === 'classic' && this.inRound()), feet: [s.x, s.y, s.z] };
      }),
      inRound: inPlay,
      // RULE_DAMAGE_ADAPTATION: a rule's damage is laid on the body as a limb's spill is, the armour out of it
      // (`LIMB_SPILL_PIERCING`, damage.ts `applyHit`); a death is the room's kill, no one's (`how` 'orphan', the cause named).
      damage: (id, amount, cause) => {
        const p = this.players.get(id);
        if (!p || !p.alive || !this.inRound() || !(amount > 0)) return;
        const was = overall(p.health);
        const died = applyHit(this.woundable(p), PART.BODY, amount, LIMB_SPILL_PIERCING) && !this.deathless(p);   // CPS cell-alive
        const s = p.sim.walker.state;
        this.send(p.id, { type: 'hurt', health: [...p.health.hp], from: [s.x, s.y, s.z], part: PART.BODY });
        if (died) this.kill(p, null, null, 'orphan', DEATH_CAUSE.FALL, null, cause);
        else this.hurtVoice(p, was);
      },
      eliminate: (id) => {
        const p = this.players.get(id);
        if (!p || !this.inRound() || this.ruleOut.has(id)) return;
        this.ruleOut.add(id);
        if (p.alive) this.kill(p, null, null, 'orphan', DEATH_CAUSE.FALL, null, 'rules');
        else if (this.opts.rules !== 'classic') this.ruleEvent({ name: 'player.eliminated', player: id });
      },
      award: (to, points) => {
        if ('player' in to) {
          const p = this.players.get(to.player);
          if (!p) return;
          p.score += points; p.roundScore += points;
        } else this.teamScore[to.team] += points;
        this.scoreDirty = true;
        this.scoreSentAt = -Infinity;
      },
      endRound: (winner) => this.ruleRoundEnd(winner),
      endMatch: (winner) => {
        if (this.state.phase === 'over') { this.state.matchOver = true; return; }
        this.ruleMatchOver = true;
        this.ruleRoundEnd(winner);
      },
      door: (id, open) => {
        const i = this.doors.specs.findIndex((d) => d.node === id);
        if (i < 0) return false;
        const st = this.doors.state(i);
        if (st.open === open || st.busy || !this.doors.use(i, null, 'self')) return false;
        this.broadcast({ type: 'doorUse', door: i, pick: 0 });
        return true;
      },
      respawn: (id, at, yaw, spawner) => {
        const p = this.players.get(id);
        if (!p || this.ruleOut.has(id) || !this.inRound()) return;
        this.ruleSpawner = spawner;
        try { this.spawn(p, 'respawn', { at, yaw }); } finally { this.ruleSpawner = null; }
      },
      tell: (ev: RulesWire, to?: number) => {
        const wire = ev as unknown as ServerEvent;                // additive types the page reads (FCW-32), outside ServerEvent
        if (to === undefined) this.broadcast(wire); else this.send(to, wire);
      },
      drop: (id, why) => this.dropped('rulePurchase', why, this.players.get(id)),
    };
  }

  /**
   * FCW-31: a rule's `round.end` -- in play, or in the expiry's hold, the round ends now through `endRound`, its win
   * counted first (as the elimination's is, `clock`); a round already decided keeps its own result.
   */
  private ruleRoundEnd(winner: Team | null): void {
    const st = this.state;
    if (st.phase !== 'play' && st.phase !== 'expired') return;
    if (winner) this.wins[winner]++;
    this.endRound(winner);
  }

  /** CPS cell-alive: whether `p` is the cell's deathless seat (`RoomOptions.deathlessSeat`); false without the option. */
  private deathless(p: Player): boolean {
    const seat = this.opts.deathlessSeat;
    return seat !== undefined && this.lobby.member(p.id)?.name === seat;
  }

  /**
   * CPS cell-alive: the health a hit on `p` is laid on -- its own, or for the deathless seat a copy the hit spends (its
   * own untouched); the caller's `died` is masked by `deathless` (a full-health copy can still die of one hit).
   */
  private woundable(p: Player): Health {
    return this.deathless(p) ? { ...p.health, hp: [...p.health.hp], armour: [...p.health.armour] } : p.health;
  }

  /**
   * FCW-31: a blast's hit scaled by the rules (`hit.scale`, only with a host): the body back to its health and armour
   * before the blast, and each fragment the blast drew laid again at its damage times the factor through `applyHit`, the
   * one the blast used (`resolveBlast`), so no random is drawn again. A factor of 0 lays no knock; another keeps the
   * knock the unscaled blast drew (RULE_BLAST_KNOCK_ADAPTATION).
   */
  private ruleBlastScaled(h: Health, out: NonNullable<ReturnType<typeof resolveBlast>>, scale: number, hp: readonly number[], armour: readonly number[], piercing: number): NonNullable<ReturnType<typeof resolveBlast>> {
    h.hp.splice(0, h.hp.length, ...hp);
    h.armour.splice(0, h.armour.length, ...armour);
    let died = false;
    const hits = out.hits.map((x) => ({ part: x.part, damage: x.damage * scale }));
    for (const x of hits) if (applyHit(h, x.part, x.damage, piercing)) died = true;
    return { ...out, hits, died, knock: scale === 0 ? null : out.knock };
  }

  /**
   * BOTPERSONA.R1: a trusted CPU appearance changes its model, never its assigned gamer tag. OT.R81 (BTL.R4): it is
   * presentation only -- the bot is hit on its type's volumes, as a human of that type (`volumesOf`).
   */
  setBotCharacter(id: number, key: string | null): boolean {
    if (this.conns.get(id)?.cpu !== true) return false;
    const member = this.lobby.member(id);
    if (!member?.team) return false;
    const choice = key === null ? null : this.map.characters?.choices.find((c) => c.key === key && c.team === member.team);
    if (key !== null && !choice) return false;
    if (key === null) this.botAppearances.delete(id); else this.botAppearances.set(id, key);
    this.broadcast({ type: 'botCharacter', id, character: key });
    return true;
  }

  /** CPU identity is owned by the in-process connection, never a client's name or hello payload. */
  private botMark(id: number): { bot?: true } { return this.conns.get(id)?.cpu === true ? { bot: true } : {}; }

  botCharacter(id: number): string | null { return this.botAppearances.get(id) ?? null; }

  get rules(): Rules { return this.opts.rules; }

  /**
   * BOTS-LAND (the merge controller's smoke ruling, OT.R81): where a smoke grenade pours now -- each thrown smoke
   * (`detonationOf`, the page's own rule) between its detonation (`Timer1`) and its removal (`Timer2`), the very window
   * the page smokes for (`GrenadeThrower.smokes`' `until`, the record's `removal - fuse`, as `stepGrenade` keeps it
   * here). A bot's sight reads it (`MatchBots`); no rule of the room's does: a round goes through smoke, as the
   * original's.
   */
  smokeSources(): readonly (readonly [number, number, number])[] {
    return this.detonations().filter((d) => d.kind === 'smoke').map((d) => d.at);
  }

  /**
   * What has gone off and not yet been removed (`stepGrenade`'s `'detonated'`, from `Timer1` to `Timer2`), as every page
   * reckons it from the throw it was sent: its id, its place, its kind (`detonationOf`, the page's rule). A bot reads it
   * for the flash's white-out (area (a)'s narrow check: its own feet and facing, as the page does) and the smoke's wall.
   */
  detonations(): readonly { pid: number; at: readonly [number, number, number]; kind: 'blast' | 'smoke' | 'flash' }[] {
    return this.flying.filter((f) => f.g.state === 'detonated')
      .map((f) => ({ pid: f.pid, at: [f.g.pos[0], f.g.pos[1], f.g.pos[2]] as const, kind: detonationOf(f.g.record) }));
  }

  /**
   * A player's hit volumes: its body's type's (web sprint 5 S2), else its side's first type's, else the SEAL's first
   * (the Terrorist models carry the same 26 bones), else null -- the placeholder capsules. HX-2 (research 238 §1): a
   * hostage's (`{ escortee }`, its index in `chartype.rdr`'s `escortees`) are its own skeleton's at its stance's idle, else
   * the first hostage's, else the SEAL's first (the hostages' models carry the same 26 bones).
   */
  private volumesOf(p: { id?: number; team: Team; char: number } | { escortee: number | string }): StanceVolumes | null {
    if ('escortee' in p) {
      // HX-4a (the review of HX-1): a hostage by its character, as the page keys its body (`./teamBody` `escorteeBody`);
      // an index stays an index.
      const i = typeof p.escortee === 'number' ? p.escortee : this.escorteeCharacters.indexOf(p.escortee);
      return (i >= 0 ? this.escorteeVolumes[i] : null) ?? this.escorteeVolumes[0] ?? this.volumes.seal[0] ?? null;
    }
    const side = this.volumes[p.team];
    return side[p.char] ?? side[0] ?? this.volumes.seal[0] ?? null;
  }

  /** HIT-POSE: a player's hit body, picked as `volumesOf` picks its volumes (its type's, its side's first's, the SEAL's). */
  private hitBodyOf(p: { team: Team; char: number }): HitBody | null {
    const side = this.hitBodies[p.team];
    return side[p.char] ?? side[0] ?? this.hitBodies.seal[0] ?? null;
  }

  /**
   * Protocol 9: a hello's character types, one a side, kept whole integers only (the room checks them against the
   * map when it seats the player, `seatType`).
   */
  private static helloTypes(raw: unknown): { seal?: number; terrorist?: number } {
    const out: { seal?: number; terrorist?: number } = {};
    if (typeof raw !== 'object' || raw === null) return out;
    const r = raw as Record<string, unknown>;
    if (isInt(r['seal'])) out.seal = r['seal'] as number;
    if (isInt(r['terrorist'])) out.terrorist = r['terrorist'] as number;
    return out;
  }

  /**
   * Classic: a player seated while a round is in play is a ghost until the next ("You are a ghost.  You will play the
   * next round as a real player.", 0x3e31c0/0x3e31f0, `FUN_001f97b0` L57047-57097; UIMnLOC 352-353: late joiners
   * "appear as a ghost ... wait until the next round"): not alive, not placed, not counted a living player.
   */
  private seatsGhosts(): boolean {
    return this.opts.rules === 'classic' && this.state.phase !== 'waiting';
  }

  // ---- the sessions ----

  /**
   * Seat a rule-released NPC and stand it at `at` (product track, a general room seam). The same checks as the host's
   * respawn (`ruleView`): the round is in play, the seat is not one a rule put out, and the body comes up through
   * `spawn`. Outside a round this does not join, so a release holds no seat until the round is in play. A match that
   * never releases an NPC never calls this; a hello on its own is unchanged.
   */
  seatRuleRelease(id: number, conn: Conn, ev: Extract<ClientEvent, { type: 'hello' }>, at: V3, yaw: number, side: Team, spawner: string | null = null): boolean {
    if (!this.inRound()) return false;
    const joined = this.hello(id, conn, ev);
    const p = this.players.get(id);
    if (!joined || !p || p.team !== side || this.ruleOut.has(id)) {
      if (this.lobby.member(id)) this.leave(id);
      return false;
    }
    this.ruleSpawner = spawner;
    try { this.spawn(p, 'respawn', { at, yaw }); } finally { this.ruleSpawner = null; }
    if (!this.players.get(id)?.alive) {
      if (this.lobby.member(id)) this.leave(id);
      return false;
    }
    return true;
  }

  /**
   * A client's hello: welcomed as a player or a spectator, or refused. Returns the id it was given, or null. `as` (a
   * game's seat, the bridge's): `host`, the game's host -- it takes `side` (SEALs when absent) while that side has room;
   * a joiner's `side` is the side a clan game's rule forces on it (CLAN-JOIN, `clanSide`), full -- refused
   * `TOO_MANY_PLAYERS`.
   */
  hello(id: number, conn: Conn, ev: Extract<ClientEvent, { type: 'hello' }>, address = '', as: { host?: boolean; side?: Team; account?: number; late?: boolean } = {}): boolean {
    this.settleUnparked();                                       // the review's F3: an earlier hello's park end, never left stale
    this.lastResumed = null;
    this.lastUnparked = null;
    if (address && (this.banned.get(address) ?? -Infinity) > this.opts.now()) { this.refuse(conn, 'You have been banned from that game. Please choose another.'); return false; }
    if (ev.version !== PROTOCOL_VERSION) { this.refuse(conn, versionRefusalText(ev.version, PROTOCOL_VERSION)); return false; }   // the page's one text (VERSION-ABORT)
    if (conn.cpu === true && this.opts.rules !== 'respawn' && !allMapsSwitch()) return false;   // H315 (the owner: "yes respawn only to start"): no CPU in a classic room; P537-L2: CREATE_GAME_ALL_MAPS=1 lifts it (a dev server)
    // S2 round 4: the page's session token (malformed: none). One a live connection of this room holds is a takeover --
    // the page's newer connection (a reconnect before the heartbeat dropped the old socket, a reload, a duplicated tab)
    // takes its place, name and side, and is seated from its state (`takeOver`); else a join.
    const session = isSessionToken(ev.session) ? ev.session : null;
    const holder = session !== null ? this.live.get(session) : undefined;
    this.lastReplaced = holder ?? null;
    // RECONNECT-GHOST's instrument (OT.R59): how long the connection taken over had been silent, by the room's own frames.
    this.lastSilentMs = holder !== undefined ? this.opts.now() - (this.heard.get(holder) ?? this.opts.now()) : null;
    // A takeover whose hello watches where the seat played, or plays where it watched, is the page's newer connection
    // too, but not the same seat: the old one is replaced and the new one joins afresh (`replace`).
    const watch = ev.watch === true;
    const takeover = holder !== undefined && session !== null && watch === this.lobby.watching(holder);
    // OT.R59 (RECONNECT-GHOST): the same account's takeover inside the window takes its body back alive, under its old id.
    const resumed = takeover && this.resumable(holder!, as.account) ? holder! : null;
    // SVC-23e (the review's F1): MaxSpectatorsValve 0 after VOTE ALL's eject -- a watching hello that is no takeover is
    // refused here, before `replace` could release its session's older seat: that seat stays (research 264 §4.2).
    if (this.spectatorsShut && watch && !takeover) { this.lastReplaced = null; this.refuse(conn, TOO_MANY_SPECTATORS); return false; }
    // CLAN-JOIN (research 308 §3.3): a joiner's forced side full -- refused before `replace` could release an older seat.
    // The FF adaptation balances humans separately from CPUs. Explicit clan sides, CPU joins, watchers and
    // session takeovers retain their existing rules. Read now so successive hellos see earlier reservations.
    const balancedSide = !as.host && !as.side && !watch && !takeover && conn.cpu !== true
      ? this.opts.humanJoinSide?.() : undefined;
    const forced = !as.host && !watch ? as.side ?? balancedSide : undefined;
    const replacements = this.opts.botReplacementSlots?.() ?? {};
    const replacingCpu = balancedSide !== undefined && this.lobby.canReplaceBot(balancedSide, replacements);
    if (forced && !takeover && this.lobby.sideFull(forced) && !this.lobby.canReplaceBot(forced, replacements)) { this.lastReplaced = null; this.refuse(conn, TOO_MANY_PLAYERS); return false; }
    // OT.R59 (step 2): a parked seat this hello takes -- resumed, or today's takeover -- is no longer parked; the server
    // fires its hook once the new socket is seated (`settleUnparked`).
    const park = holder !== undefined ? this.parked.get(holder) : undefined;
    if (park) {
      this.parked.delete(holder!);
      this.lastUnparked = holder!;
      this.unparkedEnd = { end: park.end, how: resumed !== null ? 'resumed' : 'taken' };
    }
    // RC4 (the controller's ruling on the narrow check's 3): a takeover keeps the port's late mark (`joinedLate`), read
    // before `takeOver` releases the older id -- a reload after the load carries the bridge's late flag false.
    const keptLate = takeover && resumed === null && this.joinedLate.has(holder!);
    const joined = resumed !== null ? this.handBack(resumed, conn)
      // solo: the page's own room seats its one player a SEAL, or the forge's NPC seat its side (SOLO_ROUND_PLACEHOLDER)
      : holder === undefined || session === null ? this.lobby.join(id, ev.name, this.opts.random, watch, this.opts.solo ? (this.opts.soloSide?.(id) ?? 'seal') : as.host ? (as.side ?? 'seal') : undefined, forced, replacements)
      : takeover ? this.takeOver(holder, id, session, ev.name) : this.replace(holder, id, session, ev.name, watch, forced);
    // WATCH-JOIN W2 (WATCH_SLOTS_HOST_REFUSAL_READING, server `lobby.ts`; research 314 §3.2): a watch the roster cannot
    // hold is past `maxSpectators` (the game's MaxSpectatorsValve), which the host refuses with reason 2 (`FUN_002bc620`
    // D:L161395-161424), "Too many spectators"; a playing hello past the players and the queue is "The game is full." as
    // before (a watch read that too until W2).
    // OT.R59 (the gameplay seat's condition): a refused hello took nothing -- a park it took ends as an unpark does.
    if (!joined) { this.failUnparked(); this.refuse(conn, watch ? TOO_MANY_SPECTATORS : 'The game is full.'); return false; }
    if (resumed !== null) id = resumed;                         // OT.R59: the seat's own id -- the others see no left / joined
    // SVC-23e: a playing hello the lobby queued as a spectator (the players full) is refused after its join; whatever
    // else the join changed (a replacement's older seat `left`, a promotion) still goes out, its own place never told.
    // The FF human's reserved CPU replacement is a temporary queue, not a request to watch. VOTE ALL still
    // refuses actual watchers above and full-human queues here; only a validated CPU reservation is exempt.
    if (this.spectatorsShut && !takeover && joined.member.role === 'spectator' && !replacingCpu) {
      this.lobby.leave(id);
      const rest = joined.changes.filter((c) => c.id !== id);
      if (rest.length) this.broadcastChanges(rest);
      this.failUnparked();
      this.refuse(conn, TOO_MANY_SPECTATORS);
      return false;
    }
    this.conns.set(id, conn);
    // Capture trusted CPU identity once at admission; human input cannot acquire a persona.
    if (!this.clientIndex.has(id)) this.clientIndex.set(id, this.freeClientIndex());   // a takeover's came with its seat
    this.heard.set(id, this.opts.now());                          // a watcher's idle clock starts at its hello (`idle`)
    if (address) this.addresses.set(id, address);
    if (session !== null) { this.sessions.set(id, session); this.live.set(session, id); }
    this.accounts.set(id, as.account ?? null);                  // OT.R59: the bridge's seat account, null a guest's
    this.types.set(id, Room.helloTypes(ev.types));
    // NCW-10 (an instrument): the page's build and build time for the seat's round signals; malformed or absent, none
    const build = clientBuildOf(ev.build), builtAt = clientBuiltAtOf(ev.builtAt);
    if (build !== undefined || builtAt !== undefined) this.builds.set(id, { ...(build !== undefined ? { build } : {}), ...(builtAt !== undefined ? { builtAt } : {}) });
    else this.builds.delete(id);
    if (ev.armory === true && !watch) this.armoryPages.add(id);
    if (ev.cranes === true) this.cranePages.add(id); else this.cranePages.delete(id);   // #337: watchers draw the hooks too
    const m = joined.member;
    const players = this.lobby.players().filter((p) => p.id !== id).map((p) => {
      const q = this.players.get(p.id);
      return { id: p.id, name: p.name, team: p.team!, ...this.botMark(p.id), ...(this.botCharacter(p.id) ? { character: this.botCharacter(p.id)! } : {}), ...(q ? { kit: [...q.loadout], char: q.char } : {}) };
    });
    const waiting = m.role === 'player' && this.waitingWith(m.team);
    // A spectator (seated by no one) is told only a countdown already running.
    const countdown = m.role === 'player' ? this.countdownWith(m.team) : this.state.phase === 'waiting' && this.state.launchAt !== undefined ? this.countdownWith(null) : null;
    // Seated before the welcome goes (S2 round 3), so the welcome names the type the room seated (`char`: the hello's,
    // or the one a reconnect under the round lock holds); the first spawn follows the welcome (`start`).
    // LATER 85: the bridge's late flag kept for the connection (a promotion reads it, F3); a resume keeps its own.
    if (as.late === true && resumed === null) { this.lateMembers.add(id); this.joinedLate.add(id); }   // RC4: kept past `loaded`
    else if (resumed === null) { this.lateMembers.delete(id); if (keptLate) this.joinedLate.add(id); else this.joinedLate.delete(id); }
    const seat = m.role === 'player' && resumed === null ? this.seat(id, m.team!) : null;   // OT.R59: a resumed body is not reseated
    const keptKit = seat !== null && this.lastSeatKeptPicks;      // KIT-HELD: told after the welcome (`tellKitHeld`)
    // LATER 85 / 266 (`LATE_SEAT_ACTOR_READING`): no body until the late console's load, under either rule.
    if (seat) seat.awaitingLoad = this.lateMembers.has(id);
    // The ARMORY on this seat (ARMORY_SEAT_READING): a page that opens it, on a first seat (a ghost's or a waiting one
    // included) -- never a takeover's or a reconnect's (seated before, a record of it taken or not), unless the page
    // still shows the screen (`armoryOpen`); never under the round's lock (a type spawned in this round).
    const screenOpen = ev.armoryOpen === true;
    if (seat) seat.arming = this.armoryPages.has(id) && !this.spawnedThisRound(seat) && (screenOpen || (!takeover && !this.lastSeatReturned));
    // LOW-11 (research 223 §2.5): a seat launched and still loading, seated again over the hold, is waited for again.
    const hold = this.state.phase === 'waiting' ? this.state.hold : undefined;
    if (seat && hold && session !== null && hold.loading.has(session)) hold.pending.add(id);
    this.toldCountdown(id, countdown);
    const env = this.world.wireAll(this.roundSerial);
    this.envSent.set(id, { revision: env.revision, epoch: env.epoch });   // NET-WIRE: the welcome's environment, whole
    this.send(id, {
      type: 'welcome', id, version: PROTOCOL_VERSION, map: this.map.stem, tick: this.tick, role: m.role, team: m.team,
      queue: this.lobby.queuePosition(id), name: m.name, players,
      rules: this.opts.rules, round: this.round, rounds: this.opts.maxRounds, ghost: m.role === 'player' && this.seatsGhosts() && resumed === null,
      ...(this.equipmentLimit() !== 0 ? { eqLimit: this.equipmentLimit() } : {}),
      ...(waiting ? { waiting: true } : {}), ...(seat ? { char: seat.nextChar } : resumed !== null ? { char: this.players.get(id)!.nextChar } : {}),
      ...(seat?.arming ? { armory: true } : {}), ...(resumed !== null ? { resumed: true as const } : {}),
      ...(countdown !== null ? { countdown } : {}), server: serverNameOf(this.opts.serverName),
      // Protocol 10 (MAP-03): the world whole, the round epoch, the tick the round began (absent while none has: a
      // classic room waiting; a respawn room's first round began at its construction, tick 0), the map's game type.
      env, epoch: this.roundSerial & 0xffff,
      // V13-3c (additive under protocol 13): the round's deaths so far, which the joiner takes silently.
      ...this.sceneDeadWire(),
      ...(this.state.phase !== 'waiting' ? { startTick: this.roundStartTick ?? 0 } : {}),
      // ONL-18b (additive under protocol 10): the room's state, for a joiner (`phase`; research 221).
      phase: this.wirePhase(),
      // LATER 155 (additive under protocol 11): in a decided hold, what decided the round (`DecidedWire`), for the page's
      // round audio and bomb -- a plant or a defuse there takes the hold's own rule.
      ...(this.state.phase === 'decided' ? { decided: { winner: this.state.winner, reason: this.state.reason } } : {}),
      join: this.joinWire(),                                    // PF-28 (research 231 s4.3): the join envelope, laid once
      ...(this.map.gameType !== undefined ? { gameType: this.map.gameType } : {}),
      ...(this.bomb ? { objective: this.bomb.wire() } : {}),   // XR-05: the bomb as it stands, for the joiner
      ...(this.extraction ? { hostages: this.extraction.wire() } : {}),   // HX-1: the hostages as they stand (191 s6)
      // RESUME-MOUNTED (PB-2c's review F1): the occupied turrets, and a free one whose gun was left turned, with its yaw.
      ...(this.turrets.some(welcomeTurret) ? { turrets: this.turrets.filter(welcomeTurret).map(turretWire) } : {}),
    });
    if (resumed !== null) this.send(id, this.resumeEvent(this.players.get(id)!));   // OT.R59: right after its welcome
    if (resumed !== null) this.tellMags(this.players.get(id)!);   // TURRET-AMMO: a resumed occupant's magazines, after its resume
    if (keptKit) this.tellKitHeld(seat!);                         // KIT-HELD: the kept record's picks, after the welcome
    for (const [dancer, dance] of this.victoryPlaying) this.send(id, {
      type: 'victory', id: dancer, serial: dance.serial, clip: dance.clip, elapsed: (this.tick - dance.start) / TICK_HZ,
    });
    // LATER 261 (SA-43c Part 2's gap; an adaptation of the transport): the host's restart notice still holding, to this
    // connection after its welcome -- a lead's minutes as they stand now (`noticeHeldAt`). Sent, never recorded.
    const notice = this.systemKept ? noticeHeldAt(this.systemKept, this.opts.now()) : null;
    if (notice) this.send(id, { type: 'system', severity: notice.severity, text: notice.text });
    if (seat) this.start(seat);
    this.broadcastChanges(joined.changes, id);
    this.send(id, this.scoreEvent());                          // the rows and the clock, for the joiner's HUD
    // SVC-20b-relay: the entry's ask, after the welcome. OT.R59 (the review's F1): a resumed seat keeps its voice -- no
    // entry asked (in a classic round in play that would put the living body on the dead channel), its own channel's
    // entry told to the new connection.
    if (resumed === null) this.voiceEnter(id);
    else {
      // The re-review's 1: a seat talking at the drop talks no more -- its talk ended, as a takeover's (its new page's
      // voice client starts with nothing sent, so its release would end nothing).
      this.voiceTell({ changed: this.voiceFloor.talkOff(id, this.opts.now()), moved: new Set() });
      this.voiceTold(id);
    }
    return true;
  }

  /**
   * The rounds and throws the room dropped since the server last asked, by why (`fire: cone: eye`, `throw: launch`...):
   * the server logs them once a second (2026-10-01: the owner's "shots do not register" was every round dropped at the
   * shape check, and nothing said so). Never sent to a page, but with the combat report on (INT.R5) the requester `p` is
   * told its own refusal (`combat`, status 'rejected', the same `why`). `logOnly` (HOTFIX DOOR-RESET, the review's F2): the
   * drop log alone -- a refusal an honest player meets in play (a door mid-swing, out of reach), named for the playtest
   * logs, kept out of the seat's `signals.refused` (central's moderation flag counts it), the profiler and the report.
   */
  private readonly drops = new Map<string, number>();
  private dropped(kind: string, why: string, p?: Player, logOnly = false): void {
    // NCW-2 B-trade (the review's F1): a traded round's refusal under its own word, apart from a living round's.
    if (kind === 'fire' && p && p === this.trading) { why = `trade: ${why}`; this.tradeRefused = true; }
    const key = `${kind}: ${why}`;
    this.drops.set(key, (this.drops.get(key) ?? 0) + 1);
    if (logOnly) return;
    if (p) p.signals.refused[key] = (p.signals.refused[key] ?? 0) + 1;   // SVC-12d: the seat's own tally (SVC-23b)
    if (p) botProfiler()?.refusal(p.id, this.conns.get(p.id)?.cpu === true);   // BOP-1: counted, bot vs human
    if (p) this.combat(p, null, { status: 'rejected', request: kind, reason: why });
  }

  // ---- the combat report (INT.R5, research 127: a playtest instrument with no original) ----

  private combatSerial = 0;
  /**
   * NCW-2 B-trade (the review's F1): the dead shooter whose traded round `fire` is deciding now, else null -- a `fire`
   * refusal of his while it is set goes under `trade: <reason>` (`dropped`) and sets `tradeRefused`.
   */
  private trading: Player | null = null;
  private tradeRefused = false;
  /**
   * NCW-2 B-trade (the review's F3): the living body whose command `run` is running now, and the command it had last
   * run before it -- a death inside that run (`fallDamage`, after the command's `aim`) leaves that one the last command
   * run alive (`kill`'s `diedSeq`), not the command it died in.
   */
  private ownRun: { p: Player; before: number } | null = null;
  private rejectionTick = -1;
  private readonly rejections = new Map<Player, number>();
  /**
   * One combat report (`CombatReport`), when the room's `combatReport` option is on; else nothing at all. An
   * `applied` report goes to the attacker and the target (once, when they are one player); a miss and a refusal -- a
   * friendly-fire one too -- to the attacker (the requester) only (INT.R5), never to a third page, which would learn
   * another's health. Only an `applied` report carries the target's health and armour. A refusal past
   * `COMBAT_REPORT_REJECTIONS_PER_TICK` this tick from the same player is not sent (a friendly-fire one is outside the
   * cap). The health and armour after are the target's as the room holds them now; `damageApplied` the six parts'
   * health before less after.
   */
  private combat(attacker: Player | null, target: Player | null, data: Partial<CombatReport> & { status: CombatReport['status']; request: string }): void {
    // NET-RES.R11 (a): an applied hit or blast from an enemy that took health or armour is the target's last damage
    // (RECENT_HIT_DEATH_MS_ADAPTATION); the re-read's N1: its own damage (a fall), and a teammate's, record nothing.
    if (data.status === 'applied' && target && attacker && attacker !== target && attacker.team !== target.team && data.healthBefore && data.armourBefore
      && (sum(data.healthBefore) > sum(target.health.hp) || sum(data.armourBefore) > sum(target.health.armour))) {
      target.lastHurt = { session: this.sessions.get(attacker.id) ?? null, at: this.opts.now(), weapon: data.weapon ?? null };
      const taken = sum(data.healthBefore) - sum(target.health.hp);   // LCM-6a: the observer, health only (an adaptation)
      if (taken > 0 && this.opts.onCombatApplied) try { this.opts.onCombatApplied(attacker.id, target.id, taken); } catch { /* the observer's own */ }
    }
    if (!this.opts.combatReport) return;
    const friendly = data.reason === FRIENDLY_FIRE;
    if (data.status === 'rejected' && !friendly && attacker) {
      if (this.rejectionTick !== this.tick) { this.rejectionTick = this.tick; this.rejections.clear(); }
      const n = this.rejections.get(attacker) ?? 0;
      if (n >= COMBAT_REPORT_REJECTIONS_PER_TICK) return;
      this.rejections.set(attacker, n + 1);
    }
    const toTarget = target !== null && data.status === 'applied';
    const healthBefore = data.healthBefore ?? null;
    const healthAfter = toTarget ? [...target.health.hp] : null;
    const distance = data.distance ?? null;
    const base: Omit<CombatReport, 'hitLocation' | 'hitLocationNames' | 'struckPartHealthChange' | 'totalBodyPartHealthChange'> = {
      type: 'combat', eventId: ++this.combatSerial, tick: this.tick, round: this.round, map: this.map.stem,
      status: data.status, request: data.request, reason: data.reason ?? null, weapon: data.weapon ?? null,
      attacker: attacker ? { id: attacker.id, team: attacker.team } : null, target: target ? { id: target.id, team: target.team } : null,
      part: data.part ?? null, hitLocations: data.hitLocations ?? null,
      distance, distanceMetres: distance === null ? null : distance / UNITS_PER_METRE,
      healthBefore: toTarget ? healthBefore : null, healthAfter,
      armourBefore: toTarget ? data.armourBefore ?? null : null, armourAfter: toTarget ? [...target.health.armour] : null,
      rawDamage: data.rawDamage ?? null,
      damageApplied: toTarget && healthBefore ? healthBefore.reduce((n, h, i) => n + h - healthAfter![i]!, 0) : 0,
      killed: data.killed ?? false, selfDamage: attacker !== null && attacker === target,
      friendlyFire: attacker !== null && target !== null && attacker !== target && attacker.team === target.team,
      point: data.point ?? null, direction: data.direction ?? null,
    };
    const e: CombatReport = { ...base, ...combatHealthSummary(base) };
    const to = new Set<Player>();
    if (attacker) to.add(attacker);
    if (toTarget) to.add(target);
    for (const q of to) if (this.players.get(q.id) === q) this.send(q.id, e);
  }
  /**
   * SIMDROP-INSTR (REFUSAL_RECORD_ADAPTATION; J-MOS game 3201 r7's replay held no refusal): a `fire: cone: *` refusal's
   * record -- the claim's eye and aim, the room's eye locus at the command's blend and the claim's distance from it
   * (`ShotCone.eyeLocus`), the body at that command (feet, floor normal's y, airborne, stance) -- to the recorder (a
   * replay-only `refusal`, never broadcast) and, the first `REFUSAL_LINES_PER_ROUND` of the seat's round, a log line
   * (`takeRefusals`); past them, counted. Reads only: no verdict, clock or cone changes.
   */
  private readonly refusalLines: RefusalLine[] = [];
  private readonly refusalsOver = new Map<number, number>();
  private noteRefusal(p: Player, ev: Extract<ClientEvent, { type: 'fire' }>, frame: AimFrame, why: string): void {
    // NCW-2 B-trade (the re-check's fold): a traded round's line and record under the tally's own key (`dropped`).
    if (p === this.trading && why.startsWith('fire: ')) why = `fire: trade: ${why.slice('fire: '.length)}`;
    const near = p.cone.eyeLocus(ev.seq, ev.eye);
    const r: ReplayRefusal = {
      seat: p.id, seq: ev.seq, why, eye: [...ev.eye], aim: [...ev.aim],
      locus: near ? [...near.locus] : null, distance: near ? near.distance : null, lens: near?.lens ?? frame.lens,
      feet: [...frame.feet], groundNormalY: frame.groundNormalY ?? 1, airborne: frame.airborne, stance: frame.posture,
    };
    this.opts.recorder?.refusal?.(this.tick, r);
    if (p.refusalsLogged < REFUSAL_LINES_PER_ROUND) { p.refusalsLogged++; this.refusalLines.push({ tick: this.tick, ...r }); }
    else this.refusalsOver.set(p.id, (this.refusalsOver.get(p.id) ?? 0) + 1);
  }

  /**
   * SIMDROP-INSTR: the `fire: cone: *` refusals' log lines since the last call and, by seat, those past the seat's round's
   * `REFUSAL_LINES_PER_ROUND` (counted only), or null when there were none; the server logs them once a second beside
   * `takeDrops`.
   */
  takeRefusals(): { lines: RefusalLine[]; over: Record<number, number> } | null {
    if (!this.refusalLines.length && !this.refusalsOver.size) return null;
    const out = { lines: this.refusalLines.splice(0), over: Object.fromEntries(this.refusalsOver) };
    this.refusalsOver.clear();
    return out;
  }

  /** The drops since the last call, by why, or null when there were none; the count starts again. */
  takeDrops(): Record<string, number> | null {
    if (!this.drops.size) return null;
    const out = Object.fromEntries(this.drops);
    this.drops.clear();
    return out;
  }

  /** The last hello this room refused, its reason (the server logs it: 2026-09-30). */
  lastRefusal: string | null = null;
  /** The id the last hello took over (its session's older connection, S2 round 4), else null (the server logs it). */
  lastReplaced: number | null = null;
  /** OT.R59 (RECONNECT-GHOST): the id the last hello resumed (its body alive, `handBack`), else null: the server seats the socket under it. */
  lastResumed: number | null = null;
  /** RECONNECT-GHOST's instrument (OT.R59): ms since the room's last frame from the connection the last hello took over, else null. */
  lastSilentMs: number | null = null;
  /**
   * OT.R59 (step 2): the seats parked by a close the room heard -- each to its window's end (`until`) or the round's end --
   * and the server's hook for the park's end (`whenUnparked`).
   */
  private readonly parked = new Map<number, { until: number; body: number | null; drop: number; end: ((how: 'resumed' | 'taken' | 'left') => void) | null }>();
  /** OT.R59 (step 2): the parked id the last hello took, else null; its hook fired by the server once seated (`settleUnparked`). */
  lastUnparked: number | null = null;
  private unparkedEnd: { end: ((how: 'resumed' | 'taken' | 'left') => void) | null; how: 'resumed' | 'taken' } | null = null;

  /** The connection an id holds now (the server's check that a socket's frames and close are still its seat's). */
  connOf(id: number): Conn | undefined {
    return this.conns.get(id);
  }

  /**
   * S2 round 4, the session takeover: the connection `old` holds `session`, and a newer one of the same page says
   * hello as `id`. The old one is told (`kicked` 'replaced') and closed (`SESSION_REPLACED_CLOSE`), its place in the
   * lobby handed to `id` whole -- the name (no "(2)"), the side, the place in the queue; nobody promoted -- and its
   * player's record (the type, the picks, the round it spawned in) kept under the token for the seat `hello` gives
   * next (`seat`: under the round's lock the type is held, W5.R1). The new seat is a reconnect's (a classic round in
   * play: a ghost), never alive where the old body stood -- outside OT.R59's window (`handBack`).
   */
  private takeOver(old: number, id: number, session: string, name: string): { member: Member; changes: LobbyChange[] } | null {
    const changes = this.lobby.rekey(old, id);
    if (!this.lobby.member(id)) return null;
    // The new hello's name when it differs and no other member holds it (a rename made in the other window, or a
    // guest's new draw), else the seat's own: never a "(2)" (`Lobby.renameIfFree`).
    changes.push(...this.lobby.renameIfFree(id, name));
    const member = this.lobby.member(id)!;
    const gone = this.players.get(old);
    this.bomb?.rekey(old, id);                                  // XR-05: the seat's bomb goes with it (a ghost's lies where it stood)
    this.extraction?.rekey(old, id);                            // HX-4a: its leads, its unit (seat + 0x20) and its count go with it
    // ONL-18b (research 221 §3): a seat still loading in the launch's hold is waited for under its new id.
    if (this.state.phase === 'waiting' && this.state.hold?.pending.delete(old)) this.state.hold.pending.add(id);
    // The same person: its scoreboard row goes with the seat (kills, deaths, score, the round's score), as its type, its
    // picks and its round do (research 95 §8, `TAKEOVER_ROW_READING`).
    // Its charges and rounds in flight go with it too (repair 2): the seat's new body is their thrower (`seat`).
    if (gone) this.kept.set(session, { ...this.recordOf(gone), row: { kills: gone.kills, deaths: gone.deaths, score: gone.score, roundScore: gone.roundScore, roundKills: gone.roundKills, roundDeaths: gone.roundDeaths, roundRescued: gone.roundRescued, ...countersOf(gone), ...resultCountersOf(gone) }, body: gone });
    else this.kept.delete(session);
    const index = this.clientIndex.get(old);                    // the seat's client index goes with it
    // LATER 20: the same talker -- its floor hold-off and re-press window, and its frame bucket, go to the new id.
    this.voiceFloor.takeOver(old, id, this.opts.now());
    const bucket = this.voice.get(old);
    this.release(old);
    if (bucket) this.voiceBuckets.set(id, { tokens: bucket.tokens, at: bucket.at });
    if (index !== undefined) this.clientIndex.set(id, index);
    return { member, changes };
  }

  /**
   * OT.R59 (RECONNECT-GHOST, a labelled adaptation): whether the seat `old`, which a newer hello of its session takes over,
   * is resumed -- the same account (a ticketless seat has none: never), a body alive (one dead or a ghost stays so: today's
   * takeover), and the room's last frame from its connection (`heard`) within `RECONNECT_ALIVE_WINDOW_MS_ADAPTATION`.
   */
  private resumable(old: number, account: number | undefined): boolean {
    if (account === undefined || this.accounts.get(old) !== account) return false;
    if (!this.players.get(old)?.alive) return false;
    const heard = this.heard.get(old);
    return heard !== undefined && this.opts.now() - heard <= RECONNECT_ALIVE_WINDOW_MS_ADAPTATION;
  }

  /**
   * OT.R59: the seat `old` handed back to its newer connection whole -- the body where it stands, alive, its kit, pouch,
   * health, row and projectiles untouched, its lobby place and id kept (no `left` / `joined`). The older connection is
   * told (`kicked` 'replaced') and closed (4006) as a takeover's. The command stream restarts for the new client: what
   * the old one queued or left waiting is dropped, and the new one numbers on from the room's count (`resume.seq`). A
   * throw in flight goes with the old client (the gameplay seat's condition 1): its release request, the clip's command
   * and the walker's hold count read now, so no death drop is made from a request the new page never sent.
   */
  private handBack(old: number, conn: Conn): { member: Member; changes: LobbyChange[] } {
    const was = this.conns.get(old);
    this.send(old, { type: 'kicked', reason: 'replaced' });
    if (was !== conn) was?.close(SESSION_REPLACED_CLOSE.code, SESSION_REPLACED_CLOSE.reason);
    const p = this.players.get(old)!;
    p.queue.length = 0; p.queued.clear(); p.cut.length = 0; p.gapSince = -1; p.pending.length = 0;   // LATER 136: the cut too
    p.dismount = null;                                           // LATER 104: the old page's ask goes with its commands
    const asked = this.mounts.findIndex((m) => m.id === old);    // LATER 124: and its waiting mount (the new page numbers on)
    if (asked >= 0) this.mounts.splice(asked, 1);
    if (p.reserved !== null) this.releaseTurret(this.turrets[p.reserved.turret]!);   // A1: the take word was the old page's to send
    p.release = null;                                            // LATER 109: the resumed page runs none of it
    p.releaseSpan = null;
    p.throwStart = null; p.throwHoldSeq = -1; p.holdStartsSeen = p.sim.walker.holdStarts; p.placeStart = null;
    // RECONNECT_HELD_LAUNCHER_ADAPTATION (condition 4 (b)): the launcher lowered at once, as the spawn's kit does.
    p.held = null; p.heldNext = null; p.heldReadyAt = -1; p.firearmReadyAt = -1;
    p.launcherSet = null; p.launcherUp = null; p.movingLowerUntil = -Infinity; p.raiseAfterStick = null;
    p.raise = false;                                             // OBF-14 review F1: a controller's raise is not the page's
    p.raised = false;                                            // ER-2: down until the page's next command says
    p.sim.launcherClips.clear(); p.sim.walker.dropLauncherClip();
    p.lastActive = this.opts.now();
    this.healthSent.delete(old);                                  // NU-3c: the new connection has been told no part bytes
    // LATER 327 (#456): a reload's page numbers its dance requests from 1 and has been told no offer (`drop`'s pair).
    this.victoryRequests.delete(old); this.victoryOffers.delete(old);
    this.lastResumed = old;
    return { member: this.lobby.member(old)!, changes: [] };
  }

  /**
   * OT.R59: the resumed seat's body as the room holds it, for its own page (`resume`): where it stands and its posture
   * (the snapshot's), its facing, the command count, the parts' health and armour, the live kit, both rings' slots, the
   * pouch by name (`grenades`), the firearm in the hand and the launcher held. RESUME-MOUNTED: the turret it holds
   * (`mounted`, or null) and, while the mount's steer runs, its ticks so far and its facing (`SeatSteer.steered`, `toward`).
   */
  private resumeEvent(p: Player): Extract<ServerEvent, { type: 'resume' }> {
    const s = p.sim.walker.state;
    return {
      type: 'resume', id: p.id, at: [s.x, s.y, s.z], yaw: s.yaw, posture: p.sim.walker.posture, seq: p.sim.seq,
      // OBF-20 (the review's F1): the Chat menu's last requests taken, which the reloaded page numbers on from -- the
      // others' pages still hold the ones they heard, so the seat is not renumbered at a resume (only at `resetMatch`).
      taunt: this.tauntRequests.last(p.id), communication: this.communicationRequests.last(p.id),
      health: [...p.health.hp], armour: [...p.health.armour], loadout: [...p.loadout],
      rounds: [p.mags[0].state().slots, p.mags[1].state().slots], pouch: p.grenades, equipmentSlots: p.equipmentSlots.state(), weapon: p.weapon, held: p.held,
      turret: p.mounted, ...(p.seat && p.mounted !== null ? { steer: { ticks: p.seat.steered(), toward: p.seat.toward } } : {}),
      // LATER 154: the mount's window end in the page's numbering (`seatOff`), so a resume inside the release's wait waits
      // to the room's own count, not 1.25 s from the welcome.
      ...(p.mounted !== null && p.seatOff !== null ? { seatOff: p.seatOff } : {}),
    };
  }

  /** The lowest client index no connection holds (research 179 section 9.2: DME gives a joiner the lowest free). */
  private freeClientIndex(): number {
    const held = new Set(this.clientIndex.values());
    let i = 0;
    while (held.has(i)) i++;
    return i;
  }

  /**
   * A takeover that is not the same seat (the S2 review's round-4 lows): the page's newer connection watches where its
   * older one played, or plays where it watched. The older connection is replaced as in `takeOver` -- told, closed, its
   * player's record kept under the token as a leave keeps it (`leave`) -- and its place left (a freed player slot
   * promotes the queue's head); then the newer one joins afresh, as a watcher or by the team rule. Null (the hello
   * refused) when the room has no place for it; the leave's changes go out either way.
   */
  private replace(old: number, id: number, session: string, name: string, watch: boolean, forced?: Team): { member: Member; changes: LobbyChange[] } | null {
    // A watcher's older connection has no player: a record kept from its last seat stays for the seat this one takes.
    const gone = this.players.get(old);
    if (gone) this.kept.set(session, this.recordOf(gone));
    this.release(old);
    const left = this.lobby.leave(old);
    // solo: the page's own room seats its one player a SEAL, or the forge's NPC seat its side (SOLO_ROUND_PLACEHOLDER)
    const joined = this.lobby.join(id, name, this.opts.random, watch, this.opts.solo ? (this.opts.soloSide?.(id) ?? 'seal') : undefined, forced, this.opts.botReplacementSlots?.() ?? {});
    if (!joined) { this.broadcastChanges(left); return null; }
    return { member: joined.member, changes: [...left, ...joined.changes] };
  }

  /** A player's record kept under its session token (`kept`): its type, picks and the round it spawned in, now. */
  private recordOf(p: Player): KeptRecord {
    return { team: p.team, picks: p.picks, next: p.next, char: p.nextChar, spawnedIn: p.spawnedIn, at: this.opts.now(), lobbyChoice: p.lobbyChoice };
  }

  /** An older connection of a session replaced by its newer one: told (`kicked` 'replaced'), its state gone, closed. */
  private release(old: number): void {
    const conn = this.conns.get(old);
    this.send(old, { type: 'kicked', reason: 'replaced' });
    const tagged = this.clans.has(old);                        // AD-13 (the review's F2): as `leave`
    this.drop(old);
    if (tagged) this.tellClans();                               // the set without the freed id, to the connections left
    conn?.close(SESSION_REPLACED_CLOSE.code, SESSION_REPLACED_CLOSE.reason);
  }

  private refuse(conn: Conn, reason: string): void {
    this.lastRefusal = reason;
    conn.send(JSON.stringify({ type: 'refused', reason } satisfies ServerEvent));
    conn.close(4000, reason);
  }

  /**
   * A client gone: its slot to the queue's head; a classic round with a side left empty is abandoned (`broadcastChanges`).
   * `conn`: the socket that closed (the server's) -- nothing happens when the id is no longer that socket's (its seat
   * taken over by its session's newer connection, the id perhaps handed to a new joiner since: S2 round 4).
   */
  leave(id: number, conn?: Conn, mayPark = false): boolean {
    if (!this.conns.has(id) || (conn !== undefined && this.conns.get(id) !== conn)) return false;
    // OT.R59 (step 2): `mayPark`, the server's (a close that is not the page's own 1000 / 1001): a parkable seat is parked.
    if (mayPark && conn !== undefined && this.parkable(id)) { this.park(id); return true; }
    this.depart(id);
    return false;
  }

  /**
   * NET-RES-2b (NET-RES.R5, R7; was OT.R59's living seat in a round in play only): an account's seat with its session, a
   * member of the room, alive or dead, its last frame within `SEAT_HOLD_MS_ADAPTATION`, in a launched match -- a round
   * in any phase, or the launch's load hold; not a room waiting in its lobby (a game lobby's seat, a classic room waiting
   * for both sides), where no match is there to resume and a held host would stop the lobby's hand-over (SVC-07b).
   */
  private parkable(id: number): boolean {
    const heard = this.heard.get(id);
    if (this.state.phase === 'waiting' && this.state.hold === undefined) return false;
    if (this.lobby.watching(id)) return false;                  // NET-RES-2's review F2: a watcher leaves at once
    return this.lobby.member(id) !== undefined && this.accounts.get(id) != null && this.sessions.has(id)
      && heard !== undefined && this.opts.now() - heard <= SEAT_HOLD_MS_ADAPTATION;
  }

  /** OT.R59 (step 2): the body's hold -- a living body in a round in play, its last frame within the window. */
  private bodyHoldable(id: number): boolean {
    const p = this.players.get(id), heard = this.heard.get(id);
    return !!p?.alive && this.inRound() && heard !== undefined && this.opts.now() - heard <= RECONNECT_ALIVE_WINDOW_MS_ADAPTATION;
  }

  /**
   * OT.R59 (step 2): parked -- no connection holds it (nothing is sent to it, no frame comes); its lobby place, session
   * and account stay, no `left` is told, the side is not emptied. NET-RES-2b (NET-RES.R5): the seat is held
   * `SEAT_HOLD_MS_ADAPTATION` from its last frame; its body, when OT.R59 holds one (`bodyHoldable`), stands and takes
   * the neutral steps (`step`) for `RECONNECT_ALIVE_WINDOW_MS_ADAPTATION`, then is out of the world (`takeAway`), as a
   * body none holds is at once.
   */
  private park(id: number): void {
    // The review's F4: a seat talking at the drop talks no more (as a takeover's and a resume's talk ends).
    this.voiceTell({ changed: this.voiceFloor.talkOff(id, this.opts.now()), moved: new Set() });
    const heard = this.heard.get(id)!;
    const body = this.bodyHoldable(id) ? heard + RECONNECT_ALIVE_WINDOW_MS_ADAPTATION : null;
    this.conns.delete(id);
    this.botAppearances.delete(id);
    this.envSent.delete(id);
    this.healthSent.delete(id);
    this.parked.set(id, { until: heard + SEAT_HOLD_MS_ADAPTATION, body, drop: heard, end: null });
    const p = this.players.get(id);
    if (p && body === null) this.takeAway(p, heard);
  }

  /**
   * NET-RES-2b (NET-RES.R5, the owner's ruling: past the body's hold the body "is removed while the seat is held"): a held
   * seat's body out of the world as a leave takes it -- its turret freed, a bomb it carries dropped where it stood, its
   * hostages released (`depart`'s) -- and not alive, with no death, score or event; the seat (`away`) keeps its row,
   * side, lobby place, session and account. Its page's hello takes it over (`takeOver`); the hold's end is the leave.
   */
  private takeAway(p: Player, drop: number): void {
    if (p.away) return;
    // NET-RES.R11 (a): a living body hurt within RECENT_HIT_DEATH_MS_ADAPTATION of its drop (or since) dies, credited.
    const hurt = p.lastHurt;
    if (p.alive && hurt && this.inRound() && hurt.at >= drop - RECENT_HIT_DEATH_MS_ADAPTATION) {
      // The re-read's N2: the enemy as it is seated now, by its session token (a reconnect's new id included); gone, no one's.
      const id = hurt.session !== null ? this.live.get(hurt.session) : undefined;
      const by = id !== undefined ? this.players.get(id) ?? null : null;
      const weapon = hurt.weapon !== null ? this.weaponName(hurt.weapon, '') || null : null;
      this.kill(p, by, weapon, by === null ? 'orphan' : 'weapon', DEATH_CAUSE.BULLET);
    }
    p.awayAlive = p.alive;                                       // NET-RES.R11 (b): left alive, its kit kept for its return
    if (p.mounted !== null) this.releaseTurret(this.turrets[p.mounted]!);
    else if (p.reserved !== null) this.releaseTurret(this.turrets[p.reserved.turret]!);
    if (p.alive) this.bomb?.dropped(p.id, p.team, this.bombActor(p).feet(), 'leave');
    this.extraction?.release(p.id);
    this.stopVictory(p.id);
    p.alive = false;
    p.away = true;
    p.queue.length = 0; p.queued.clear(); p.cut.length = 0; p.pending.length = 0;
    this.scoreDirty = true;
  }

  /** OT.R59 (step 2): the server's hook for a parked seat's end -- 'left' (its window or the round over), or a hello's. */
  whenUnparked(id: number, fn: (how: 'resumed' | 'taken' | 'left') => void): void {
    const k = this.parked.get(id);
    if (k) k.end = fn;
  }

  /** OT.R59 (step 2): the server, the new socket seated: the park the last hello took has ended -- its hook fired, once. */
  settleUnparked(): void {
    const u = this.unparkedEnd;
    this.unparkedEnd = null;
    u?.end?.(u.how);
  }

  /**
   * OT.R59 (step 2; the review's F1): the room is going (its game ended and the room dropped, a room that threw, a drained
   * room, the server's stop): every pending park ends 'left' -- the server's hook alone, once (the room is not stepped
   * again, so no `depart`) -- and a park a hello took and the server has not yet settled is settled.
   */
  endParks(): void {
    this.settleUnparked();
    for (const [id, k] of [...this.parked]) { this.parked.delete(id); k.end?.('left'); }
  }

  /**
   * OT.R59 (step 2; the re-review's low 2, the gameplay seat's condition): a hello that took a parked seat and was then
   * refused (`hello`) or threw (the server's catch): nothing took the seat, so it ends as an unpark does -- today's leave
   * when its body or lobby place is still there (a takeover refused before its release), then the server's hook
   * 'left' -- never a connectionless body no step unparks (the catch's own `leave` names the hello's new id).
   */
  failUnparked(): void {
    const id = this.lastUnparked, u = this.unparkedEnd;
    this.lastUnparked = null;
    this.unparkedEnd = null;
    if (id === null) return;
    if (this.players.has(id) || this.lobby.member(id)) this.depart(id);
    u?.end?.('left');
  }

  /** OT.R59 (step 2): a park past its window, or outside a round in play: today's leave, then the server told. */
  private unpark(id: number): void {
    const k = this.parked.get(id);
    if (!k) return;
    this.parked.delete(id);
    this.depart(id);
    k.end?.('left');
  }

  /**
   * PARKED_BODY_NEUTRAL_ADAPTATION (OT.R59, step 2): a parked body's neutral command for this tick, when none is queued
   * -- the stick at rest, no buttons, its last look, numbered on from the room's count; the commands' clock runs it.
   */
  private parkedStep(p: Player): void {
    if (p.queue.length) return;
    const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: p.lastYaw, pitch: p.lastPitch, turn: 0, buttons: 0, stance: 0, weapon: p.weapon };
    p.queue.push(cmd);
    p.queued.add(cmd.seq);
  }

  /** Today's leave: the body gone, the lobby told, a side left empty abandons or loses the round. */
  private depart(id: number): void {
    // Protocol 7: the type's picks stay with the page's session token (the character type is the seat's,
    // `FUN_0023e5e0`), so a reconnect seated alive may re-send them and have them land (`loadout`).
    const gone = this.players.get(id), session = this.sessions.get(id);
    // A player leaving with no picks clears what it kept: an older list must not come back (the M10 review). One that
    // spawned in this round is kept regardless: its type is held until the round ends (`seat`, W5.R1). A page without
    // a token keeps nothing.
    if (gone && gone.mounted !== null) this.releaseTurret(this.turrets[gone.mounted]!);   // MAP-10b: the leaver's turret freed
    else if (gone && gone.reserved !== null) this.releaseTurret(this.turrets[gone.reserved.turret]!);   // A1: a leave releases, every page told
    if (gone && session !== undefined) {
      const spawnedNow = this.spawnedThisRound(gone);
      const now = this.opts.now();
      for (const [k, r] of this.kept) if (now - r.at > KEPT_RECONNECT_READING) this.kept.delete(k);   // the stale go
      for (const [k, at] of this.returning) if (now - at > KEPT_RECONNECT_READING) this.returning.delete(k);
      if (gone.picks.length || gone.nextChar !== DEFAULT_ARMORY_TYPE[gone.team] || spawnedNow || gone.lobbyChoice) {
        this.kept.set(session, this.recordOf(gone));
      } else this.kept.delete(session);
      // Seated before, whatever was kept (the S3 repair): its reconnect is no first seat for the ARMORY.
      this.returning.set(session, now);
    }
    // XR-05: a carrier's leave drops the bomb where it stood (`FUN_002bef60` D:L162527) and cancels its placement.
    if (gone) this.bomb?.dropped(id, gone.team, this.bombActor(gone).feet(), 'leave');
    if (gone) this.noteLeaver(gone);                           // SVC-12d: before its seat's account is gone
    const tagged = this.clans.has(id);                         // AD-13: dropped with the seat (`drop`), told below
    this.drop(id);
    // HX-4a (`LEADER_RELEASE_READING`; FUN_005998b0 D:L455500-455536): the leaver's hostages released and the UnitTick's
    // HOLD with no seat left (the issuer null), after its seat is gone -- so the unit has no living member.
    this.extraction?.release(id);
    this.broadcastChanges(this.lobby.leave(id));
    if (tagged) this.tellClans();                               // AD-13: the set without it -- its id is the next seat's (`freeId`)
  }

  /** A connection's own state gone: a leave, or a takeover (whose lobby place the newer connection keeps). */
  private drop(id: number): void {
    this.stopVictory(id);
    this.victoryRequests.delete(id); this.victoryOffers.delete(id);
    this.tauntRequests.forget(id);
    this.communicationRequests.forget(id);
    const session = this.sessions.get(id);
    if (session !== undefined && this.live.get(session) === id) this.live.delete(session);
    this.sessions.delete(id);
    this.accounts.delete(id);
    this.conns.delete(id);
    this.botAppearances.delete(id);
    this.envSent.delete(id);
    this.healthSent.delete(id);
    for (const sent of this.healthSent.values()) sent.delete(id);   // NU-3c: a seat gone is told to no one again
    this.clientIndex.delete(id);
    this.heard.delete(id);
    const asked = this.mounts.findIndex((m) => m.id === id);     // LATER 124: a waiting mount goes with the seat (its id may
    if (asked >= 0) this.mounts.splice(asked, 1);                // be the next seat's, `freeId`)
    this.players.delete(id);
    this.addresses.delete(id);
    this.types.delete(id);
    this.builds.delete(id);                                      // NCW-10
    this.clans.delete(id);
    this.armoryPages.delete(id);
    this.cranePages.delete(id);
    // A voter's votes go with it; a target's with it too.
    this.votes.delete(id);
    for (const set of this.votes.values()) set.delete(id);
    // SVC-23e: a VOTE ALL voter's vote too (its slot record freed, `FUN_002c5750`), and the marks on a spectator.
    this.votesAll.delete(id); this.voteAllMarks.delete(id);
    for (const set of this.voteAllMarks.values()) set.delete(id);
    this.preTold.delete(id);
    this.loadTold.delete(id);                                    // IP3: a page back under this id is told again
    this.renamedAt.delete(id);
    this.lateMembers.delete(id);                                 // LATER 85
    this.joinedLate.delete(id);                                  // RC4
    // SVC-20b-relay (170 §2.3, "Leaving"): its entry freed at once and its channel's members told; its state forgotten.
    const freed = this.voiceFloor.drop(id);
    this.voice.delete(id);
    this.voiceBuckets.delete(id);
    this.voiceMembersTold.delete(id);                             // AD-14: its channel's members told below, it not
    this.voiceTell({ changed: freed, moved: new Set() });
  }

  /** A promotion's seat: the ARMORY opens on it for a page that opens it (ARMORY_SEAT_READING), then its first spawn. */
  private addPlayer(id: number, team: Team): Player {
    const p = this.seat(id, team);
    p.arming = this.armoryPages.has(id) && !this.spawnedThisRound(p);
    // RC4 (widened): a late joiner promoted after its page's `loaded` -- by `RoomBots.seatQueued` or by any leave --
    // enters a respawn game as one promoted before it does at its load (#474's path, `enterDeadAtLoad`); its page is
    // told, and its voice entry asked, after the promotion (`broadcastChanges`). One still loading takes that path at
    // its `loaded` (`awaitingLoad`).
    if (this.joinedLate.has(id) && !p.awaitingLoad && this.opts.rules === 'respawn') this.enterDeadAtLoad(p);
    this.start(p);
    return p;
  }

  /**
   * A player's seat, before its first spawn: its type and what it keeps.
   *
   * Protocol 9: seated as the hello's type for the side the room gave (the page's ARMORY record, research 95 §4.4),
   * else the type its record held on this side, else SEAL 1 / TERRORIST 1 (R95.5): a type the side does not offer
   * seats the default, never refuses the join (ARMORY_TYPE_FALLBACK_READING). The kept picks come back only with the
   * type they were replayed from.
   *
   * W5.R1's round gate across a reconnect (the S2 review, round 2): a player that spawned on this side in the round in
   * play keeps that type until the round ends -- the hello's type waits, as a request's would (`round` in `loadout`),
   * and the new seat counts as spawned in the round (ARMORY_OUTSIDE_ROUND_READING, research 95 §8). The record is the
   * page's own (round 4): its session token (the hello's `session`), within `KEPT_RECONNECT_READING` of the leave or
   * the takeover -- two tabs are two records whatever their address and names, and a page without a token is a new
   * joiner. A record is taken once.
   */
  private seat(id: number, team: Team): Player {
    const p = new Player(id, team, this.newSim(this.conns.get(id)?.cpu === true), this.opts.now());
    this.watchMoves(p);                                          // PAR-28: its mover's climbs and ladders
    const session = this.sessions.get(id), record = session !== undefined ? this.kept.get(session) : undefined;
    const kept = record && this.opts.now() - record.at <= KEPT_RECONNECT_READING ? record : undefined;
    if (session !== undefined && record) this.kept.delete(session);
    const left = session !== undefined ? this.returning.get(session) : undefined;
    if (session !== undefined) this.returning.delete(session);
    this.lastSeatReturned = kept !== undefined || (left !== undefined && this.opts.now() - left <= KEPT_RECONNECT_READING);
    const asked = this.types.get(id)?.[team];
    const held = kept && kept.team === team ? kept : undefined;
    const locked = held !== undefined && this.inRound() && held.spawnedIn === this.roundSerial && this.typeAllowed(team, held.char);
    p.nextChar = locked ? held!.char
      : this.typeAllowed(team, asked) ? asked! : held && this.typeAllowed(team, held.char) ? held.char : DEFAULT_ARMORY_TYPE[team];
    p.char = p.nextChar;
    if (locked) p.spawnedIn = held!.spawnedIn;
    if (held && held.char === p.nextChar) { p.picks = held.picks; p.next = held.next; p.lobbyChoice = held.lobbyChoice === true; }   // ARMORY-SAVE: the same console's IDFromBriefing
    // KIT-HELD: a kept record's picks restored -- its page is told them after its welcome or promotion (`tellKitHeld`).
    this.lastSeatKeptPicks = held !== undefined && held.char === p.nextChar && held.picks.length > 0;
    // SVC-12d: seated now, and in progress when its match had begun before (JOIN_IN_PROGRESS_MARK_READING): classic, its
    // first round started (the room left `waiting`); respawn, a tick after the match's start. Research 350 §1: a held
    // respawn room has no match while waiting; only an unheld one's first match begins with its first seat.
    p.seatedAt = this.tick;
    p.awaitingLoad = this.lateMembers.has(id);                  // LATER 85: a late member's seat (a promotion too, F3)
    if (this.opts.rules !== 'classic' && this.state.phase !== 'waiting' && this.matchStartTick === null) this.matchStartTick = this.tick;
    p.joinedInProgress = this.state.phase !== 'waiting' && (this.opts.rules === 'classic' || this.tick > this.matchStartTick!);
    if (held?.row) Object.assign(p, held.row);          // a takeover's row: the same person (TAKEOVER_ROW_READING)
    // Repair 2: and its projectiles -- the charges it set down count against it and go off by its Detonator, its
    // rounds' kills are its own (`claymoresDown`, `thrower`). A leave's are still no one's (DEPARTED_CHARGES_READING).
    if (held?.body) for (const f of this.flying) if (f.owner === held.body) f.owner = p;
    if (held?.body && this.bombPlanter === held.body) this.bombPlanter = p;   // PF-14b: and its planted bomb's detonation
    // NET-RES.R11 (b): a respawn seat back from a hold whose body left alive takes that body's health and kit at its spawn
    // (no free heal or refill); a classic seat returns a ghost and the next round's start gives every seat its full kit.
    // RC2 (one rule; to the owner): left alive and uncredited -> back alive at a respawn point with that kit;
    // dead, dead at load or credited dead -> back dead, a fresh Action past the gate revives it with a fresh kit (RC1).
    if (held?.body?.away && this.opts.rules === 'respawn') {
      if (held.body.awayAlive) p.returnFrom = held.body;
      else p.deadOnReturn = true;
    }
    this.players.set(id, p);
    return p;
  }

  /**
   * A seat's first spawn: at once, or a ghost until the next round (a classic round in play) -- or, the page's ARMORY
   * open on the seat (`arming`), when it is left (`ready`) or the round starts (ARMORY_SEAT_READING). A late seat whose
   * console has not loaded: none (`awaitingLoad`, LATE_SEAT_ACTOR_READING); after a respawn load only Action revives it.
   */
  private start(p: Player): void {
    if (p.awaitingLoad || p.deadAtLoad) { this.scoreDirty = true; return; } // LATER 85 / 266: no lobby body or automatic revival
    // RC1/RC2, N3 (NET-RES-2's re-read): a held respawn seat back dead enters on #474's dead-at-load path -- its walker
    // at a start slot, dead from now, its page told after its welcome (`deadAtLoad`) -- so one gate revives it
    // (`respawnReady`: a fresh Action past >5 s, never over the launch's load hold) and `startRound` keeps it as a load death.
    if (p.deadOnReturn) {
      p.deadOnReturn = false;
      if (!this.seatsGhosts()) { this.enterDeadAtLoad(p); this.tellLoadDeath(p); this.scoreDirty = true; return; }
    }
    // LOW-11 (research 223 §2.5): over the launch's load hold nobody is spawned -- round 1 spawns every seat (`startRound`).
    const held = this.state.phase === 'waiting' && this.state.hold !== undefined;
    if (this.seatsGhosts() || p.arming || held) { this.scoreDirty = true; return; }
    this.spawn(p, p.returnFrom ? 'respawn' : 'start');           // RC2: a seat back alive comes up at a respawn point
  }

  /**
   * The page left the ARMORY (`ready`). A seat it held (`arming`): the seat's first spawn, as `start` would have made it.
   * A living body in a room no round has started in -- waiting for the other side, or in the launch countdown -- is
   * rebuilt there and then with the choices (`rebuildWaiting`: the controller's ruling under the owner's mandate,
   * 2026-10-01); in a round a living body is never spawned again by it (repair 2).
   */
  private ready(id: number): void {
    const p = this.players.get(id);
    if (!p) return;
    if (p.arming) {
      p.arming = false;
      this.voiceReturn(id);                                     // SVC-20b-relay: back from the ARMORY's 11
      if (!p.alive) {
        p.lastActive = this.opts.now();
        this.start(p);
        return;
      }
    }
    if (p.alive && this.state.phase === 'waiting') this.rebuildWaiting(p);
  }

  /**
   * The controller's ruling under the owner's mandate (2026-10-01): a player waiting in a room with no round started
   * (alone, or in the launch countdown) who closes the ARMORY has its waiting body and kit rebuilt at once as the type
   * and kit chosen (`nextChar`, `next`), where it stands -- a spawn in place, every page told (`spawn`). Unchanged
   * choices rebuild nothing. The round's start rebuilds every body anyway (`startRound`), as the original's does.
   */
  private rebuildWaiting(p: Player): void {
    const kit = p.next ?? this.typeKit(p);
    if (p.char === p.nextChar && kit.length === p.loadout.length && kit.every((id, i) => id === p.loadout[i])) return;
    const st = p.sim.walker.state;
    p.lastActive = this.opts.now();
    this.spawn(p, 'start', { at: [st.x, st.y + SPAWN_LIFT, st.z], yaw: st.yaw });
  }

  /**
   * A mover for a seat. COMBINED-CUT (OT.R93): `ai` -- a CPU's seat (`Conn.cpu`) -- is the controller's `IsAi`
   * (`MoverSim.ai`): its stance transitions are never cut by the stick (`FUN_00587c20` D:L445536-445545), the player's in
   * either stance mode are.
   */
  private newSim(ai: boolean): MoverSim {
    const w = new Walker(this.map.grid);
    if (this.clips) w.actionRoots = this.clips.roots;
    const moves = new Traversal(this.map.grid, this.polys);
    if (this.clips) moves.setClips(this.clips.clips, this.clips.table);
    const sim = new MoverSim(w, moves);
    sim.ai = ai;
    // RB-2: the page's own room's open gate where it asked (`roomLookGateMode`); every other room keeps the law. RB-47
    // (RB.R6): the open gate is the player's mouse's (a browser adaptation, OT.R114); a CPU seat (`ai`) is no mouse, so its
    // mover keeps the law every room runs, and the bots turn and aim (the cone on the gated look) as in every room.
    sim.gate = new LookGate(ai ? 'law' : roomLookGateMode(this.opts));
    // SEGMENT-BODY part 4 (`WEAPON_LINE_BOTS_READING`): an AI seat's body casts no weapon line -- the AI controller's
    // vtable +0x2c answers 0 (D:L416630-416633) -- a respawn's new mover included (`spawn` passes the seat's `ai`).
    if (ai) w.weaponLineCast = WEAPON_LINE_BOTS_READING === 'cast';
    return sim;
  }

  private broadcastChanges(changes: LobbyChange[], except?: number): void {
    if (changes.length) this.scoreDirty = true;
    const enteredDead: number[] = [];                            // RC4: promotions that entered dead at load
    for (const c of changes) {
      if (c.kind === 'joined') {
        const m = this.lobby.member(c.id)!;
        if (c.role === 'player') this.broadcast({ type: 'joined', id: c.id, name: m.name, team: c.team!, ...this.botMark(c.id), ...(this.botCharacter(c.id) ? { character: this.botCharacter(c.id)! } : {}) }, except);
      } else if (c.kind === 'left') this.broadcast({ type: 'left', id: c.id });
      else if (c.kind === 'renamed') this.broadcast({ type: 'renamed', id: c.id, name: c.name });
      else if (c.kind === 'queue') this.send(c.id, { type: 'queue', position: c.position });
      else if (c.kind === 'promoted') {
        this.players.delete(c.id);
        // PL-8: a classic round in play seats it as a ghost (`addPlayer`), and it is told so, as the welcome tells a
        // late joiner (research 91 section 12, `FUN_001f97b0` L57047-57097).
        const ghost = this.seatsGhosts();
        const seat = this.addPlayer(c.id, c.team);
        const keptKit = this.lastSeatKeptPicks;                    // KIT-HELD: told after `promoted`
        // S2 round 3: the type the seat took (`char`), so the page holds the room's, not the one it last sent.
        const countdown = this.countdownWith(null);
        this.toldCountdown(c.id, countdown);
        this.send(c.id, {
          type: 'promoted', team: c.team, ghost, char: seat.nextChar, ...(this.waitingWith(null) ? { waiting: true } : {}), ...(seat.arming ? { armory: true } : {}),
          ...(countdown !== null ? { countdown } : {}),
        });
        if (keptKit) this.tellKitHeld(seat);
        this.broadcast({ type: 'joined', id: c.id, name: this.lobby.member(c.id)!.name, team: c.team, ...this.botMark(c.id) }, c.id);
        if (seat.deadAtLoad) { this.tellLoadDeath(seat); enteredDead.push(c.id); }   // RC4: after `promoted`, a player seat's
      }
    }
    if (changes.length) this.recordRoster();
    // A demoted player (W3.R13) is a spectator now: its mover goes.
    for (const id of [...this.players.keys()]) if (this.lobby.member(id)?.role !== 'player') { this.players.delete(id); this.broadcast({ type: 'left', id }); }
    this.voiceRoles();                                           // SVC-20b-relay: a promotion's or a demotion's ask
    for (const id of enteredDead) this.voiceLateEntry(id);       // RC4: then its late joiner's entry, as at a load
    this.abandonIfSideEmpty();
    this.callOffCountdown();
  }

  /**
   * The lobby's members to the replay recorder (`RoomRecorder.players`; REPLAY_ADAPTATION, the replay tool's, no original):
   * after `broadcastChanges`' changes, and since REPLAY-TEAM-SWAP (2026-11-09) after a re-seat to the other side too
   * (`switchTeam`, `swapSides`), so a replay's seek and the next match's file hold the side the player plays on. The
   * room's play and its connections' bytes are the same with it or without it.
   */
  private recordRoster(): void {
    this.opts.recorder?.players(this.tick, [...this.lobby.players(), ...this.lobby.spectators()].map((m) => ({ id: m.id, name: m.name, team: m.team, role: m.role, char: this.players.get(m.id)?.char ?? 0, ...this.botMark(m.id), ...(this.botCharacter(m.id) ? { character: this.botCharacter(m.id)! } : {}) })));
  }

  /**
   * M-7 of review 2: a classic round in play (or decided) with a side left empty -- by a leave, a kick, a demotion -- is
   * abandoned there and then -- the port's stand-in (`ABANDON_TRIGGER_READING`, CLASSIC_WAITING_PLACEHOLDER): the
   * original's departure handler `FUN_002bc530` (D:L161109-161146) counts the occupied slots with no side test and,
   * below three, abandons only a late joiner's console (+0xcc set, D:L161137-161141; research 315 §3.3, §12.1); what
   * its round does with a side emptied is not read. The room waits for both sides again, so the next visitor walks at
   * once rather than as a ghost of a round with nobody left to end it. (Was: "as the original abandons its game on the
   * leave itself (`FUN_002bc530` L161130-161140: the remaining slots counted on a departure, `dlgNetAbandoned`;
   * research 91 section 17.2)" -- research 315 §3.3's re-read, 2026-10-16.)
   */
  private abandonIfSideEmpty(): void {
    // solo: a side with nobody on it is the one-player match's, never abandoned (SOLO_ROUND_PLACEHOLDER)
    if (this.opts.rules !== 'classic' || this.opts.solo) return;
    const phase = this.state.phase;
    const held = this.state.phase === 'waiting' && this.state.hold !== undefined;     // ONL-18b: launched, loading
    if ((phase === 'play' || phase === 'decided' || held) && !this.sidesSeated()) {
      if (phase !== 'waiting') this.reportEmptied();             // SVC-12d: the emptied round, before the abandon
      this.abandon();
    }
  }

  /**
   * The match dropped: the room waits for both sides, everyone standing fresh at a start slot. The pages are told first
   * (`abandoned`, protocol 7, review 3 B2): the original's abandon leaves the level, whose teardown empties both decal
   * pools (`FUN_0031af70` 218218-218219, `markClip.ts`), so the page ends the round on it; the score follows.
   * Repair 2: a seat still held in its ARMORY (`arming`) stays held -- the waiting room is one the ARMORY opens on
   * (ARMORY_SEAT_READING), and the page keeps the screen open through the abandon (ARMORY_ABANDON_READING) -- so its
   * `ready` makes its one spawn (`start`), never a second over the abandon's.
   */
  private abandon(): void {
    this.resetMatch();
    this.round = 1;                                              // review 4: the waiting room's round, as the constructor's
    this.state = { phase: 'waiting' };
    this.lastResult = null;                                      // PF-28: no result stands over the waiting room
    this.clearAir();                                             // the level left (ROUND_START_PROJECTILES_READING)
    this.resetTurrets();                                         // MAP-10b: and its turrets with it
    this.broadcast({ type: 'abandoned' });
    this.lateMembers.clear();                                    // LATER 85: back in the lobby, +0xcc cleared
    this.joinedLate.clear();                                     // RC4
    for (const p of this.players.values()) { p.diedAt = -1; p.deadAtLoad = false; p.awaitingLoad = false; p.ghostOfNextRound = false; if (!p.arming && !p.away) this.spawn(p, 'start'); }   // LATER 85, 266, 274: back in the lobby, +0xcc cleared; NET-RES-2b: a held seat away is not
    this.voiceAskAll(VOICE_CHANNEL_MAP_READING.lobby);          // SVC-20b-relay: the lobby's return asks 9 (`FUN_0027c9f0`)
    this.broadcast(this.scoreEvent());
    this.opts.onAbandon?.();
    this.unparkAll();                                            // NET-RES-2's review F3: no hold outlives its match
  }

  /** NET-RES-2's review F3: every held seat's park ended as today's leave (the hook 'left'): the match it was held for is over. */
  private unparkAll(): void {
    for (const id of [...this.parked.keys()]) this.unpark(id);
  }

  /**
   * ONL-20b (research 309 R309.1, §2.1-§2.2; respawn too, research 350 §2): a game's held room at a full game's end,
   * once GAME COMPLETE's hold is over -- the host's `call_gamelobby` (WAIT 10, `GAME_COMPLETE_S`) and `return_to_gamelobby`
   * (`CloseAndSwitch(dlgGameLobby.rdr)`: on the online host the switch to the menu state and the game object re-sent,
   * `FUN_00281a70` D:L128122-128130), the clients leaving with it (research 179 §6.18) -- goes back to the same game's
   * lobby instead of starting its next match. The room waits as before its first launch, as `abandon` leaves it: the
   * match's counters zeroed, the level left (`clearAir`, `resetTurrets`), every seat at a start slot on the side it
   * held, the lobby's voice channel asked. The bridge is told first (`onMatchReturn`: the game's lobby reopened, every
   * seat told the view the pages leave the match on), and no `abandoned` is sent. The next match is the lobby's launch
   * (`launch`: the load barrier, `startRound(true)` -- `resetMatch`, `newMatchId`).
   */
  private returnToLobby(): void {
    this.resetMatch();
    this.opts.recorder?.matchReset?.(this.tick);                 // LATER 349: the finished match's replay file closes here
    this.round = 1;                                              // the waiting room's round, as the constructor's and `abandon`'s
    this.state = { phase: 'waiting' };
    this.lastResult = null;                                      // PF-28: no result stands over the waiting room
    this.clearAir();                                             // the level left (ROUND_START_PROJECTILES_READING)
    this.resetTurrets();                                         // MAP-10b
    this.opts.onMatchReturn?.();
    this.lateMembers.clear();                                    // LATER 85: back in the lobby, +0xcc cleared
    this.joinedLate.clear();                                     // RC4
    for (const p of this.players.values()) { p.diedAt = -1; p.deadAtLoad = false; p.awaitingLoad = false; p.ghostOfNextRound = false; if (!p.arming && !p.away) this.spawn(p, 'start'); }   // LATER 85, 266, 274: back in the lobby, +0xcc cleared; NET-RES-2b: a held seat away is not
    this.voiceAskAll(VOICE_CHANNEL_MAP_READING.lobby);          // SVC-20b-relay: the lobby's return asks 9 (`FUN_0027c9f0`)
    this.broadcast(this.scoreEvent());
    this.unparkAll();                                            // NET-RES-2's review F3: no hold outlives its match
  }

  // ---- what arrives ----

  /**
   * A binary frame: a command batch, or a voice frame (SVC-20b-relay: `voiceFrame`). NET-WIRE (protocol 11): its first
   * byte is its type (`Frame`); a frame of any other type -- a snapshot, an unknown type, an empty frame -- is dropped
   * before it is read, nothing thrown and no strike (true).
   */
  binary(id: number, bytes: Uint8Array): boolean {
    const kind = frameKind(bytes);
    if (kind === Frame.Voice) return this.voiceFrame(id, bytes);
    if (kind !== Frame.Commands) return true;
    if (this.conns.has(id)) this.heard.set(id, this.opts.now());
    const p = this.players.get(id);
    if (!p) return true;
    let batch;
    try { batch = decodeCommands(bytes); } catch { return true; }
    if (batch.commands.length > MAX_BATCH) return true;          // PL-9: a batch past the cap is dropped whole
    // Measure 5 (c): the pitch held to the honest camera's range (the wire carries +-327.67).
    for (const c of batch.commands) c.pitch = Math.max(-HONEST_PITCH_DEG, Math.min(HONEST_PITCH_DEG, c.pitch));
    // SIMDROP-INSTR (an instrument; nothing judged reads it): the largest gap between the seat's command frames this round.
    const arrivedAt = this.opts.now();
    if (p.frameAt >= 0) p.signals.arrivalGapMaxMs = Math.max(p.signals.arrivalGapMaxMs, Math.round(arrivedAt - p.frameAt));
    p.frameAt = arrivedAt;
    // #337 (the review's low 3): a non-finite clock (the wire's unchecked f32) is no page's -- kept as it stood, so one bad
    // batch cannot leave `viewTick` NaN for the session (its reader: the crane press's lag, CRANE_PRESS_SLACK_ADAPTATION).
    if (Number.isFinite(batch.viewTick)) p.viewTick = Math.max(p.viewTick, batch.viewTick);
    // Frames can arrive out of order (the jitter): every command not yet run and not yet queued goes in, in order.
    // Round 3 of the review of NET-FIX2 (research 223 s6): a number past the queue's bound, the burst and every tick the
    // room observed this player not run is no page's: refused, and the frame answered false (the server's strike).
    const ahead = QUEUE_MAX + CREDIT_MAX + this.unran(p);
    let honest = true;
    // LATER 136 (the fresh review's F1): until the next step drops the cut, its top is the intake's floor -- a frame at or
    // under it can only re-send what was cut (a modified page's reorder), refused as it was before LATER 136, so the cut
    // stays in order and the stretch never moves sim.seq back.
    const floor = p.cut.length ? p.cut[p.cut.length - 1]!.seq : p.sim.seq;
    for (const c of batch.commands) {
      if (c.seq <= floor || p.queued.has(c.seq)) continue;
      if (p.synced && c.seq - p.sim.seq > ahead) { honest = false; this.dropped('command', 'ahead'); continue; }
      let at = p.queue.length;
      while (at > 0 && p.queue[at - 1]!.seq > c.seq) at--;
      p.queue.splice(at, 0, c);
      p.queued.add(c.seq);
      this.noteArrival(p, c.seq, arrivedAt);                     // SIMDROP-INSTR: its lateness, by bucket
      if (c.seq > p.receivedFloor) p.signals.commandsReceived = (p.signals.commandsReceived ?? 0) + 1;   // NCW-6: received, its first copy queued
    }
    if (p.queue.length > QUEUE_MAX) {                            // a flood (10 s) is dropped, not queued
      const cut = p.queue.splice(0, p.queue.length - QUEUE_MAX);
      for (const c of cut) p.queued.delete(c.seq);
      if (!p.synced) p.receivedFloor = Math.max(p.receivedFloor, cut[cut.length - 1]!.seq);   // NCW-6: its copies counted once
      // LATER 136: kept aside for the next step's top (`dropStretch`: its presses laid, its asks decided), at most
      // QUEUE_MAX, the excess tallied once an intake (the merge controller's bound); a page not yet synced has no body to
      // lay them on (and a later sync would put sim.seq above them): discarded as before.
      if (!p.synced) this.dropped('command', 'flood');
      else {
        const keep = cut.length > QUEUE_MAX ? cut.slice(cut.length - QUEUE_MAX) : cut;
        for (const c of keep) p.cut.push(c);
        if (keep !== cut || p.cut.length > QUEUE_MAX) {
          if (p.cut.length > QUEUE_MAX) p.cut.splice(0, p.cut.length - QUEUE_MAX);
          this.dropped('command', 'flood');
        }
      }
    }
    return honest;
  }

  /**
   * A text frame: a JSON event. Its fields are the client's, so each is shape-checked before anything reads it (BL-2 of
   * the launch review: one `{"type":"fire"}` read `from[0]` of nothing and threw out of the socket's handler, taking the
   * process down): a malformed event is dropped, never thrown.
   */
  text(id: number, raw: ClientEvent): void {
    if (this.conns.has(id)) this.heard.set(id, this.opts.now());   // a watcher's idle clock (`idle`)
    const ev = raw as unknown as Record<string, unknown> | null;
    if (!ev || typeof ev !== 'object') return;
    // Research 303: the common actions' gate reads the playing leaf's NoFire (`FUN_005a7de0`): none while a seat dances.
    if (this.victoryPlaying.has(id) && ['door', 'action', 'mount', 'bombAction', 'pickup', 'hostageOrder'].includes(String(ev.type))) return;
    switch (ev.type) {
      case 'victory': this.requestVictory(id, ev); return;
      case 'communication': {
        // Web research 302 §3: TACTICAL ORDERS and MESSAGES. The sender's state, team, character and place are the
        // room's; the client names neither a recipient nor a sender. A living player's (the Chat menu's gate, as the
        // taunts'); a tactical order the game type refuses (`FUN_0022fa90`: DEFUSE in types 1-2, PROTECT in 3-4) is dropped.
        const p = this.players.get(id), member = this.lobby.member(id);
        if (!p?.alive || p.arming || member?.role !== 'player') return;
        if (ev.kind === 'tactical' && !tacticalAllowed(ev.command, this.map.gameType)) return;
        const request = this.communicationRequests.accept(id, ev, this.opts.now());
        if (!request) return;
        const event: Extract<ServerEvent, { type: 'communication' }> = {
          type: 'communication', sender: id, name: member.name, team: p.team, char: p.char, request: request.request,
          command: request.kind === 'tactical' ? request.command : null, text: request.kind === 'custom' ? request.text : null,
          at: [p.sim.walker.state.x, p.sim.walker.state.y, p.sim.walker.state.z],
        };
        // `FUN_0022fc00` 0022fc80..0022fca8: the sender's team (the sender among it: its echo), dead or alive; no other.
        for (const m of this.lobby.players()) if (m.team === p.team) this.send(m.id, event);
        return;
      }
      case 'taunt': {
        const p = this.players.get(id), member = this.lobby.member(id);
        // Original TCM's taunt branch is enabled for a living player; a spectator's root contains radio only.
        if (!p?.alive || p.arming || member?.role !== 'player') return;
        const request = this.tauntRequests.accept(id, ev, this.opts.now());
        if (!request) return;
        const event: Extract<ServerEvent, { type: 'taunt' }> = {
          type: 'taunt', sender: id, name: member.name, team: p.team, char: p.char, request: request.request,
          vocal: request.kind === 'vocal' ? Math.floor(this.opts.random() * 7) : null,
          text: request.kind === 'custom' ? request.text : null, at: [p.sim.walker.state.x, p.sim.walker.state.y, p.sim.walker.state.z],
        };
        // Opposing team plus the sender's local echo. A client cannot choose a destination or impersonate a sender.
        for (const m of this.lobby.players()) if (m.id === id || m.team !== p.team) this.send(m.id, event);
        return;
      }
      case 'ping':
        if (isNum(ev.t)) this.send(id, { type: 'pong', t: ev.t, tick: this.tick });
        return;
      // SVC-20b-relay (constraint 4): talk on / off, the only floor requests; the radio's ON / OFF and ACTIVE CHANNEL.
      case 'voiceTalk': if (typeof ev.on === 'boolean') this.voiceTalk(id, ev.on); return;
      case 'voiceRadio': this.voiceRadio(id, ev); return;
      case 'name':
        if (this.conns.get(id)?.cpu === true) return; // Assigned CPU gamer tags are stable for their seat.
        if (this.opts.fixedNames) return;                         // SVC-07a: the account's name, never the page's
        if (typeof ev.name === 'string' && ev.name.length <= NAME_MAX) {
          // LOW-13: one rename taken each RENAME_EVERY_MS_PLACEHOLDER per player. LOW-4 (research 223 s6): one held is
          // answered to its sender alone with the name the room keeps (`renamed`), so the page shows it back.
          const at = this.renamedAt.get(id), now = this.opts.now();
          if (at !== undefined && now - at < RENAME_EVERY_MS_PLACEHOLDER) {
            const kept = this.lobby.member(id)?.name;
            if (kept !== undefined) this.send(id, { type: 'renamed', id, name: kept });
            return;
          }
          const changes = this.lobby.rename(id, ev.name, this.opts.random);
          if (changes.length) this.renamedAt.set(id, now);
          this.broadcastChanges(changes);
        }
        return;
      case 'score': this.send(id, this.scoreEvent()); return;
      case 'fire':
        // `viewTick` is the page's interpolation clock (`NetClient.viewTick`), a fraction of a tick: a finite number, never
        // an integer check -- that dropped every page's round (the owner's play test of 2026-10-01; `past` interpolates).
        if (isInt(ev.seq) && isNum(ev.viewTick) && isV3(ev.from) && isV3(ev.dir) && isV3(ev.eye) && isV3(ev.aim)) this.timed(id, raw as Timed['ev']);
        else this.dropped('fire', 'shape', this.players.get(id));
        return;
      case 'reload':
        if (isInt(ev.seq)) this.timed(id, raw as Timed['ev']);
        return;
      case 'reloadPress': {                                        // LATER 72: the delay timer's press, for the climb lock
        const p = this.players.get(id);
        if (p && isInt(ev.seq)) this.reloadPress(p, ev.seq);    // at its arrival, dated by its numbers (never late by the queue)
        return;
      }
      case 'vote':
        if (isInt(ev.target) && typeof ev.remove === 'boolean') this.vote(id, ev.target, ev.remove);
        return;
      case 'voteAll':                                             // SVC-23e: VOTE ALL ON:OFF, its state
        if (typeof ev.on === 'boolean') this.voteAll(id, ev.on);
        return;
      case 'throw':
        if (this.victoryPlaying.has(id)) return;
        // PF-13: C4's optional `target` (whole) and `surface` (a path and a finite point), shaped or the throw is ignored.
        if (typeof ev.kind === 'string' && isInt(ev.seq) && isV3(ev.from) && isV3(ev.velocity)
          && (ev.target === undefined || isInt(ev.target)) && (ev.surface === undefined || isSurface(ev.surface))
          && (ev.start === undefined || isInt(ev.start)) && (ev.eye === undefined || isV3(ev.eye)) &&
          (ev.slot === undefined || (isInt(ev.slot) && ev.slot >= 2 && ev.slot <= 4))) {
          // M7: the throw message carries every equipment use, by the item's name (no new wire message) -- a throwable's
          // throw, a charge set down (`velocity` its facing), the Detonator's fire, a launcher's round or a rocket
          // (`velocity` its launch). A throwable's is decided at its command's frame (M-8 of review 2: `timed`).
          const e = raw as Extract<ClientEvent, { type: 'throw' }>;
          // LATER 205: the Detonator and the Action button's C4 across a mount (`DETONATOR_ACROSS_MOUNT_READING`, `MOUNT_ONLINE_C4_WINDOW_READING`).
          if (this.mountedRefused(id, 'throw', ev.seq)) return;   // MAP-10b: no equipment from a turret (PF.R31)
          const kind = this.kindOf(ev.kind);
          if (kind === 'throwable') this.timed(id, e);
          // LATER 220's third head: C4 judged once its command has run (`timed`, `decide`), as a rocket's round (LATER 501) --
          // the prompts' common gate on that command sees a lock named on it; the claymore's and the PMN's at arrival.
          else if (kind === 'c4') this.timed(id, e);
          else if (kind === 'placed') this.placeCharge(id, e);
          else if (kind === 'detonator') this.detonate(id);
          // LATER 501: a rocket's round is judged once its command has run (`timed`, `decide`), as the hand throw's -- the
          // page sends the throw naming its last command, which the room runs on its own tick. P4 (TB-10, WK-1): a
          // carrier's round (the M203's, the F2000's, the MGL's, the M79's) the same way. Was: judged at its arrival.
          else if (kind === 'round') this.timed(id, e);
          else if (kind === 'launcher') this.raiseLauncher(id, ev.kind, ev.seq);
          else this.lowerLauncher(id, ev.kind, ev.seq);
        }
        return;
      case 'throwStart':
        // THROW-INTERRUPT (research 326 §2.4): a hand throwable's release request, shaped, decided at its command (`timed`).
        if (this.victoryPlaying.has(id)) return;
        // LATER 172: the shape, then the mount (tallied once: a mounted or releasing request was also tallied 'shape').
        if (!(typeof ev.kind === 'string' && isInt(ev.seq) &&
          (ev.slot === undefined || (isInt(ev.slot) && ev.slot >= 2 && ev.slot <= 4)))) { this.dropped('throwStart', 'shape', this.players.get(id)); return; }
        if (this.mountedRefused(id, 'throwStart', ev.seq)) return;
        this.timed(id, raw as Timed['ev']);
        return;
      // LATER 116 (ASK_AT_COMMAND_ADAPTATION): the immediate asks -- a door, a switch's action, a bomb drop, a weapon
      // pickup -- shaped (a whole `seq` each), then decided at their command (`timed`, as a round is): the mounted body,
      // the release's span and the stale bound all judged at `decide`, by the ask's own command (an honest ask sent after
      // a release, arriving before the room has taken the dismount, is not refused 'mounted').
      case 'door':
        if (!isInt(ev.seq) || !isInt(ev.door)) { this.dropped('door', 'shape', this.players.get(id)); return; }
        this.timed(id, raw as Timed['ev']);
        return;
      case 'action':
        // XR-04: a whole index and a struck surface (a path and a finite point), shaped or the action is ignored.
        if (!isInt(ev.seq) || !isInt(ev.action) || !isSurface(ev.surface) || (ev.eye !== undefined && !isV3(ev.eye))) { this.dropped('action', 'shape', this.players.get(id)); return; }
        this.timed(id, raw as Timed['ev']);
        return;
      case 'mount':
      case 'dismount':
        // MAP-10b: a whole command number and a whole turret id, shaped or the request is ignored.
        if (isInt(ev.seq) && isInt(ev.turret)) this.turretRequest(id, ev.type, ev.seq, ev.turret, ev.type === 'mount' && ev.word === true);
        return;
      case 'mountTake':
        // A1 (MOUNT_WORD_BOUND_ADAPTATION): the page's take word -- a whole command number and a whole turret id, or ignored.
        if (isInt(ev.seq) && isInt(ev.turret)) this.mountWord(id, ev.seq, ev.turret);
        return;
      case 'bombAction':                                          // MAP-10b: not from a turret; LATER 116: at its command
        if (ev.action === 'aim') {                                // PLANT-AIM: the page's pick, kept and judged each tick (`plantAimSees`)
          const surface = ev.surface, eye = ev.eye;
          if (!isInt(ev.seq) || (surface !== null && !isSurface(surface)) || (eye !== undefined && !isV3(eye))) { this.dropped('bombAction', 'shape', this.players.get(id)); return; }
          if (this.players.has(id)) this.bomb?.aim(id, surface ? { surface, ...(eye ? { eye } : {}) } : null);
          return;
        }
        if (!isInt(ev.seq) || ev.action !== 'drop') { this.dropped('bombAction', 'shape', this.players.get(id)); return; }
        this.timed(id, raw as Timed['ev']);
        return;
      // PF-34: a weapon claim, shaped or ignored; judged at the step with the tick's others (`WorldDrops.step`), once its
      // command has run (LATER 116).
      case 'pickup':
        if (!isInt(ev.seq) || !isInt(ev.did)) { this.dropped('pickup', 'shape', this.players.get(id)); return; }
        this.timed(id, raw as Timed['ev']);
        return;
      // HX-4a (research 239 s3, s9.1): a hostage order -- the shape, not from a turret (PF.R31), then the room's test.
      case 'hostageOrder':
        if (!(isInt(ev.seq) && isInt(ev.hostage) && (ev.cmd === 4 || ev.cmd === 5) && isV3(ev.eye) && isV3(ev.dir)
          && (ev.viewTick === undefined || isNum(ev.viewTick)))) { this.dropped('hostageOrder', 'shape', this.players.get(id)); return; }
        if (this.mountedRefused(id, 'hostageOrder', ev.seq)) return;
        {
          // The fix-up (research 239 s9.2): a replayed or out-of-order order is dropped, tallied as the shape refusals.
          const p = this.players.get(id);
          if (p && ev.seq <= p.lastOrderSeq) { this.dropped('hostageOrder', 'stale', p); return; }
          if (p) p.lastOrderSeq = ev.seq;
        }
        // The fix-up's fourth and fifth reviews (research 239 s9.2): decided once the command after the one it names has
        // run (`timed`, as a round is), so the page's eye is judged against that command's frame or the next's (`orderPickTrusted`)
        // -- the page sends the order at the command it has just sent, which the room has only queued, and its look runs
        // up to a command past it. One whose commands never run is dropped after `PENDING_TICKS`, as a round.
        if (this.extraction) this.timed(id, raw as Timed['ev']);
        else this.dropped('hostageOrder', 'no hostages', this.players.get(id));
        return;
      case 'loadout': this.loadout(id, { picks: ev.picks, char: ev.char, types: (ev as { types?: unknown }).types }); return;
      case 'ready': this.ready(id); return;
      // Protocol 10: the page's loading screen released (ONL-18b): counted only by the launch's hold (`loaded`).
      case 'loaded': this.loaded(id); return;
      // FCW-31: a request for the rules (`rulePurchase`), the rule host's to check and answer; no host, as any unknown type.
      case 'rulePurchase': this.ruleHost?.request(id, ev); return;
      default: return;
    }
  }

  /**
   * A round, a reload, a throw or a hostage order: decided at its command (`seq`) -- a round, a reload and an order once
   * the command after it has run (the order's eye is judged against either frame: `orderPickTrusted`), a throw once its own
   * has (M-8: the page lets go after the command it names) -- at once when it has, else when it does (`run`). Kept in
   * order; at most `PENDING_MAX` wait, each at most `PENDING_TICKS`.
   */
  private timed(id: number, ev: Timed['ev']): void {
    const p = this.players.get(id);
    if (!p) return;
    // SIMDROP-INSTR (sim drop #3; an instrument): a round arriving already past the stale bound (`decide`'s measure, at its
    // arrival), counted; its decision, and its refusal's tally, are `decide`'s as before.
    if (ev.type === 'fire' && p.synced && p.sim.seq - ev.seq > FIRE_ARRIVAL_JITTER_TICKS) {
      p.signals.staleFires++;
      // NCW-6 (an instrument): and of those, the rounds whose command the room dropped unrun (`dropStretch`)
      if (p.droppedRanges.some(([from, to]) => ev.seq >= from && ev.seq <= to)) p.signals.staleAfterDrop = (p.signals.staleAfterDrop ?? 0) + 1;
    }
    const n = ++p.arrivals;                                      // LATER 249: its arrival, in the page's send order
    if (!p.pending.length && due(p, ev)) { this.decide(p, ev, n); return; }
    if (p.pending.length >= PENDING_MAX) { this.turretFireOwed(p, ev); return this.dropped(ev.type, 'too many waiting', p); }
    p.pending.push({ ev, at: this.tick, n });
  }

  /**
   * SIMDROP-INSTR (sim drop #3; an instrument with no original, nothing judged reads it): a command's arrival, the first
   * copy the room queued, counted by its lateness (`arrivalBucket`) -- the room's wall clock in ticks at `at` less the
   * command's number, over the line's best such offset in the last `LAG_FLOOR_WINDOW_TICKS` (`Player.arrivalFloor`), so
   * an honest line's commands are 0 and a stall's held ones the ticks each waited.
   */
  private noteArrival(p: Player, seq: number, at: number): void {
    const now = (at * TICK_HZ) / 1000, offset = now - seq, f = p.arrivalFloor;
    if (now - f.since >= LAG_FLOOR_WINDOW_TICKS / 2) p.arrivalFloor = { cur: Infinity, prev: f.cur, since: now };
    p.arrivalFloor.cur = Math.min(p.arrivalFloor.cur, offset);
    const late = Math.round(offset - Math.min(p.arrivalFloor.cur, p.arrivalFloor.prev));
    const key = arrivalBucket(late, FIRE_ARRIVAL_JITTER_TICKS);
    p.signals.arrivalLate[key] = (p.signals.arrivalLate[key] ?? 0) + 1;
  }

  /** The waiting events whose command has run (`due`), in order; the long-waiting ones dropped. */
  private settle(p: Player): void {
    while (p.pending.length) {
      const head = p.pending[0]!;
      if (due(p, head.ev)) { p.pending.shift(); this.decide(p, head.ev, head.n); continue; }
      if (this.tick - head.at > PENDING_TICKS) {
        p.pending.shift();
        this.turretFireOwed(p, head.ev);
        this.dropped(head.ev.type, 'its command never ran', p);
        continue;
      }
      break;
    }
  }

  /**
   * TURRET-AMMO's re-read, N1: a `fire` refused before `fire` runs -- 'stale' (`decide`), 'too many waiting' (`timed`),
   * 'its command never ran' (`settle`) -- from a mounted occupant owes it its magazines, as `turretDropped` does for the
   * refusals inside: the page's `stale` handler refunds only the rounds it holds in `sentFires`, and a turret round never
   * enters them (`matchActions.ts` sends it straight), so without the tell its predicted round stays spent. A body on
   * foot, or any other event, owes nothing; at most one tell a tick, to the occupant alone (`tellAmmo`).
   */
  private turretFireOwed(p: Player, ev: Timed['ev']): void {
    if (ev.type !== 'fire' || p.mounted === null) return;
    const t = this.turrets[p.mounted];
    if (t && t.occupant === p.id) t.ammoDirty = true;
  }

  private decide(p: Player, ev: Timed['ev'], n = -1): void {
    // SVC-23b: judged as of the room's latest command, never one the page picks from the history (`FIRE_ARRIVAL_JITTER_TICKS`).
    // LOW-2 (research 223 s6): the refusal told to the page alone, so its magazine and kit reconcile (`stale`).
    if (p.sim.seq - ev.seq > FIRE_ARRIVAL_JITTER_TICKS) {
      // An order, and an immediate ask (LATER 116), has nothing on the page to reconcile (no `stale` told): tallied only.
      if (ev.type === 'fire' || ev.type === 'reload' || ev.type === 'throw') this.send(p.id, { type: 'stale', request: ev.type, seq: ev.seq });
      if (ev.type === 'throwStart') p.throwStart = null;
      this.turretFireOwed(p, ev);                                // the re-read's N1: the page's `stale` refund misses a turret round
      return this.dropped(ev.type, 'stale', p);
    }
    if (ev.type === 'hostageOrder') {
      // LATER 220's fifth head (research 369 §2): a hostage's orders (0x4000, 0x8000) are built by `FUN_00593d00`
      // (D:L452494, D:L452498) past the prompts' common gate (D:L452277): refused by why at the order's command.
      const shut = this.actionGateShut(p, ev.seq, n);
      if (shut !== null) return this.dropped(ev.type, shut, p);
      // LATER 853 (ORDER_REWIND_ADAPTATION): with the page's playout clock when it ordered, where it drew the hostages.
      this.extraction?.order(p.id, { hostage: ev.hostage, cmd: ev.cmd, eye: ev.eye, dir: ev.dir, seq: ev.seq, ...(isNum(ev.viewTick) ? { viewTick: ev.viewTick } : {}) });
      return;
    }
    // LATER 116 (ASK_AT_COMMAND_ADAPTATION): an immediate ask at its command -- the body as that command left it: mounted
    // (MAP-10b, PF.R31: not from a turret; a pickup was never refused so) by the turret held after that command (LATER 172,
    // MOUNT_ASK_AT_COMMAND_ADAPTATION: `mountedAt`), then the release's span by its own command (LATER 109's F-A), then
    // its handler.
    if (ev.type === 'door' || ev.type === 'action' || ev.type === 'bombAction' || ev.type === 'pickup') {
      if (ev.type !== 'pickup' && this.mountedAt(p, ev.seq) !== null) return this.dropped(ev.type, 'mounted', p);
      // LATER 220 (research 369 §2): a door's, a switch's, a pickup's and the bomb's drop's offer are built past the prompts'
      // common gate, at the command (the pickup since the fourth head, the drop since the sixth: 0x40, D:L452457-452470).
      { const shut = this.actionGateShut(p, ev.seq, n); if (shut !== null) return this.dropped(ev.type, shut, p); }
      if (this.releaseRefused(p.id, ev.type, ev.seq)) return;
      if (ev.type === 'door') this.useDoor(p.id, ev.door, ev.press);
      else if (ev.type === 'action') this.useAction(p.id, ev);
      else if (ev.type === 'bombAction') this.bombAction(p.id, ev as unknown as Record<string, unknown>);
      // LATER 135: the claim's frame as of this decision -- its command's, or for one the drop never ran the body the
      // drop leaves (`ShotCone.latest`); the drops judge it on that frame at the tick, the stale bound already this one.
      else this.worldDrops.claim(p.id, ev.seq, ev.did, p.cone.frame(ev.seq) ?? p.cone.latest());
      return;
    }
    // LATER 109 (F-A; TURRET_RELEASE_ACTIONS_PLACEHOLDER, the clips' NoFire): a round named inside the release's span is
    // refused at its decision, whenever it arrived -- not by the room's own travel at its arrival.
    if (ev.type === 'fire' && this.releaseRefused(p.id, 'fire', ev.seq)) return;
    // LATER 206 (ASK_AT_COMMAND_ADAPTATION, LATER 173's family; the port's own): a throwable judged at its arrival on the
    // present body, decided at a command run mounted -- the page sent it before it heard the mount -- is refused here by
    // that command's frame (`mountedAt`), the page told `stale` as LATER 173's rounds are. After the stale bound above: a
    // throw both stale and mounted tallies 'stale'. With LATER 501 merged, a rocket round reaches here as a `throw` too;
    // with P4, a carrier's round.
    if ((ev.type === 'throw' || ev.type === 'throwStart') && this.mountedAt(p, ev.seq) !== null) {
      if (ev.type === 'throw') this.send(p.id, { type: 'stale', request: ev.type, seq: ev.seq });
      else p.throwStart = null;
      return this.dropped(ev.type, 'mounted', p);
    }
    p.armedBy = n;                                               // LATER 249: a lock this decision arms keeps its arrival
    if (ev.type === 'fire') this.fire(p, ev);
    else if (ev.type === 'reload') this.reload(p, ev.seq);
    else if (ev.type === 'throwStart') this.takeThrowStart(p, ev);
    else {
      const kind = this.kindOf(ev.kind);
      // LATER 501 (a rocket's round), P4 (a carrier's): at its command's frame (`launchRound`, `launchRocket`).
      if (kind === 'round') this.launchRound(p.id, ev);
      else if (kind === 'c4') this.placeCharge(p.id, ev, n);    // LATER 220's third head: at its command
      else this.throwGrenade(p, ev);
    }
  }

  // ---- the tick ----

  /** One 60 Hz step of the match. BOP-1 (an instrument): with `S2U_BOT_PROFILE=1`, timed whole and the minute's line flushed. */
  step(): void {
    const prof = botProfiler();
    if (!prof) { this.stepRoom(); return; }
    const t = prof.now();
    try { this.stepRoom(); } finally { prof.end('room', t); prof.maybeFlush(); }
  }

  private stepRoom(): void {
    this.opts.beforeStep?.();
    this.tick++;
    const now = this.opts.now();
    // The credit this step: a tick, or the wall time when that is more (a stall's dropped ticks). LOW-12 of the review of
    // 2026-10-06 (research 223 §2.2): counted from the first step, the larger of the steps taken and the wall time, so a
    // stall the server loop catches up on in several steps of one callback (`MatchServer.loop`, up to five) is credited
    // its wall time once -- its first step the stall, the steps after it nothing -- not its wall time and a tick a step.
    this.steps++;
    if (this.firstStepAt === null) this.firstStepAt = now;
    this.settleRewind();                                         // NCW-1: the pulls decided since the last step, counted
    const wall = Math.round((((now - this.firstStepAt) / 1000) * TICK_HZ + 1) * 1e6) / 1e6;   // float noise off a tick
    this.creditStep = Math.max(0, Math.max(this.steps, wall) - this.serverClock);
    this.serverClock += this.creditStep;
    this.creditOpen = true;                                      // HOTFIX grenade fuse (F1): closed by `flyGrenades`
    // LATER 136: the intake's cut, oldest first, dropped as a backlog is -- before the mounts, so a mount named in it is
    // taken at this step's top, before any queued command runs (as after a backlog drop: LATER 124). Once a step, at most
    // QUEUE_MAX commands a player.
    // The review's F2: its reserve, what this step's `run` will spend -- the charged commands (the credit) and the catch-up
    // extras past them (`CATCHUP_PER_TICK_PLACEHOLDER` a step on the slack; the gameplay seat's term).
    for (const p of this.players.values()) {
      if (!p.cut.length || !p.synced) continue;
      // The slack as `run` will see it this step (its own update: this step's credit in, the window's oldest slot out).
      const slack = p.slack + this.creditStep - p.spent[this.tick % CATCHUP_WINDOW_TICKS_PLACEHOLDER]!;
      const reserve = Math.floor(Math.min(CREDIT_MAX, p.credit + this.creditStep)) + Math.min(CATCHUP_PER_TICK_PLACEHOLDER, Math.floor(Math.max(0, slack)));
      this.dropStretch(p, p.cut.splice(0), 'cut', reserve);
    }
    this.resolveMounts();                                        // MAP-10b: before the commands, so the hold holds this tick's
    // NET-RES-2b (NET-RES.R5): a seat held past `SEAT_HOLD_MS_ADAPTATION` is today's leave; a body held past OT.R59's
    // window, or once the round is no longer in play, is out of the world (`takeAway`), the seat still held; a body
    // still held takes this tick's neutral command (PARKED_BODY_NEUTRAL_ADAPTATION).
    if (this.parked.size) {
      for (const [id, k] of [...this.parked]) {
        if (now > k.until) { this.unpark(id); continue; }
        const p = this.players.get(id);
        if (k.body !== null && (now > k.body || !this.inRound())) { k.body = null; if (p) this.takeAway(p, k.drop); }
        if (p && k.body !== null) this.parkedStep(p);
      }
    }
    for (const p of this.players.values()) {
      const ran = p.ran;
      this.run(p, now);
      p.signals.commands += p.ran - ran;                         // SVC-12d: the seat's commands run, and a step of
      if (p.ran - ran > 1) {                                     // more than one: a burst on the saved credit (CREDIT_MAX),
        p.signals.bursts++;                                      // SVC-23b: counted by its size (a stall-and-burst's flag)
        p.signals.burstSizes[p.ran - ran] = (p.signals.burstSizes[p.ran - ran] ?? 0) + 1;
      }
    }
    this.worldDrops.step(this.players, this.inRound());          // PF-34: the tick's claims, then the bundles walked over
    if (this.lastResult && this.sweptFor !== this.lastResult && this.tick - this.lastResult.at >= ENGINE_READ_S * TICK_HZ) { this.sweptFor = this.lastResult; this.worldDrops.sweep(); }   // NU-4 D1: DROP_SWEEP_AT_RESULT_READING
    if (this.tick % LOADOUT_EVERY === 0) for (const p of this.players.values()) p.loadoutCredit = Math.min(LOADOUT_BURST, p.loadoutCredit + 1);
    for (const p of this.players.values()) this.corpse(p);
    this.tickVictories();
    for (const p of this.players.values()) this.remember(p);
    this.extraction?.remember(this.tick, HISTORY);             // HX-1: the hostages' past, for the shooter's rewind
    this.doors.step(1 / TICK_HZ);
    this.gates.step(1 / TICK_HZ);                                 // MAP-07: the lever gates' slides
    this.cranes.step(1 / TICK_HZ);
    this.world.step(1 / TICK_HZ);
    this.fireSceneRounds();                                      // research 386 §3.2: the scene's FIRE_WEAPON rounds due
    this.flyGrenades();
    this.bomb?.step();                                          // XR-05: events before the clock (DEM_SAME_TICK_READING)
    this.extraction?.step();                                    // HX-1: the AI, the one-shots, SEALcheck before the clock
    this.tellAmmo();                                             // MAP-10b: each occupant its rounds, once a tick
    this.clock();
    this.ruleHost?.endStep();                                    // FCW-31: the tick's rule events handled (RULES_ADAPTATION)
    // SVC-20b-relay: the floor's tick -- the 10 s cut, the hold-off, the 15 s expiry, the 1 s re-ask (`VoiceFloor.sweep`).
    const swept = this.voiceFloor.sweep(now);
    if (swept.length) this.voiceTell({ changed: swept, moved: new Set() });
    // A game's room kicks no one while it waits for its lobby's launch or holds round 1 for the load, and the idle clock
    // waits with it (the 2026-10-06 playtest: a host 4 min in the game lobby was kicked on round 1's first tick, 4001,
    // and the game ended below three): it runs from the round's start.
    if (this.opts.heldLaunch && this.state.phase === 'waiting') for (const p of this.players.values()) p.lastActive = now;
    // solo: no idle kick, as the original (IDLE_KICK_ADAPTATION is a network room's alone)
    else if (!this.opts.solo) this.idle(now);
    if (this.scoreDirty && this.tick - this.scoreSentAt >= SCORE_EVERY_TICKS_PLACEHOLDER) {
      this.scoreDirty = false;
      this.scoreSentAt = this.tick;
      this.broadcast(this.scoreEvent());
    }
    this.tellHealth();                                           // NU-3c: the part bytes, after every change this tick
    if (this.tick % Math.round(TICK_HZ / SNAPSHOT_HZ) === 0) this.snapshots();
  }

  /** LATER 72: a reload's press window holds the climb's offer -- the same weapon and ring, the command run inside it. */
  private pressLocked(p: Player): boolean {
    return this.pressWindow(p, p.sim.seq);
  }

  /**
   * LATER 72 / 167: whether command `seq` lies inside a reload's press window (`pressLock`: the same weapon and ring, after
   * the press's own command and before its end) -- the climb's offer (`climbLock`) and the swap (`swapRefused`) refused there.
   */
  private pressWindow(p: Player, seq: number): boolean {
    const l = p.pressLock;
    return l !== null && p.sim.weapon === l.weapon && p.mags[l.weapon] === l.ring && seq > l.from && seq < l.until;
  }

  /**
   * LATER 220 (research 369; reading, pending review; `../../viewer/src/net/actionGate`): why the action prompts' common
   * gate (`FUN_005a7de0`, behind every offer: `FUN_00593500` D:L452277) is shut on the ask's command `seq` -- the kit's
   * lock (`mountKitLocked`: 'reload'), the walker's top recorded with that command (`AimFrame.gate`: 'reload', 'gate:
   * throw' / 'swap' / 'getUp'), or the stick's moving lower living on the command after it (`movingLowerUntil`, term 6
   * directly: `moving_rifle_to_launcher` / `moving_pistol_to_launcher` on the second layer, D:L462494-462495; 'gate:
   * swap') -- or null: open. Asked by the mount's grant, the doors', switches', pickups' and the bomb drop's asks (`decide`), a hostage's
   * orders (`decide`), the bomb's held commands (`run`), and C4: banked at its placing's start (`bankPlaceGate`) and read at
   * its plant (`placeCharge`).
   */
  private actionGateShut(p: Player, seq: number, n: number): string | null {
    const frameTop = p.cone.frame(seq)?.gate ?? null;
    const top = frameTop !== null ? frameTop : seq + 1 < p.movingLowerUntil ? 'swap' : null;
    return actionGateWhy(this.mountKitLocked(p, seq, n), top);
  }

  /**
   * LATER 175 (research 215 s8.6; reading, pending review): whether the kit's one lock holds at a mount ask's command
   * `seq` -- the mount is offered only past the prompt's common gate (`FUN_00593500` D:L452277 -> `FUN_005a7de0`
   * D:L462636 -> `FUN_005a7ab0` D:L462512-462560: `kit+0x820 > 0` by `FUN_005c2400` D:L477159, a reload's delay or a bolt's
   * or a pump's after-shot, or a reload or pump type on the stack), the offer set behind it (`FUN_005937c0`
   * D:L452472-452474) -- so a mount is never taken under it. Either weapon's lock spanning the command's count (from
   * `lockStart` to `reloadUntil`, the clip's and the after-shot's: a lock armed on a later command does not cover it, the
   * take testing no lock, `FUN_005463c0` D:L412130-412166; the review's F1), the reload's delay window (`pressWindow`,
   * LATER 72); a reload or a round named on or before the ask's command is waited for (`resolveMounts`), so none is
   * pending here (LATER 223's review, F1: the waiting reload's term dropped, dead since the paced half).
   * MOUNT_SAME_COMMAND_RELOAD_READING (a comment; research 215 s4, s8.6; LATER 223, reading, pending review): a lock
   * armed on the ask's own command K -- a reload's start or an after-shot's round -- covers it. The original's frame
   * (`FUN_001ebed0`) runs the controller's pre-tick (priority 1.0, D:L50922; the frame running them at D:L50801)
   * before the kit's post-tick (D:L50929) and builds the prompt's mask after both (D:L50856 -> D:L56695 -> D:L73390): a
   * press in frame f reads the mask built at the end of f - 1, so a lock armed on K is armed before K's mask and the
   * offer is refused. The page names an ask and R's press `lastSeq()` (`turretPage.ts`,
   * `netPage.ts` `fireEvent`), the command the last frame sent, and a reload's start and a round the command its own frame
   * has just sent: R pressed in the ask's frame starts on K + 1 or later, past the span. *Was:* a reload's span started
   * after its own command (`lockStart < count`), fitted to a test that named the reload on the ask's command by hand --
   * really R a frame before the ask.
   * LATER 249 (MOUNT_SAME_COMMAND_RELOAD_READING, research 215 s8.6; reading, pending review): on the ask's own command a
   * lock whose event arrived after the ask (`n`, `lockArrival`: the seat's arrivals, the page's send order) does not cover
   * it. A page above 60 Hz runs frames that send no command, whose lanes and `fireFrame` both name the command the last
   * sending frame sent, so an ask and a round or a reload's start sent after it share K; in the original's frame order
   * the press runs in the controller's pre-tick (D:L50922, the frame running them at D:L50801) before the kit's post-tick
   * arms a lock (D:L50929), and reads the mask built at the end of the frame before -- a lock armed in the ask's own frame
   * or later is not in it. A lock armed by an event that arrived before the ask on K covers it, as above.
   */
  private mountKitLocked(p: Player, seq: number, n: number): boolean {
    const count = p.cone.frame(seq)?.count ?? p.ran;
    return ([0, 1] as const).some((w) => p.lockStart[w] <= count && count < p.reloadUntil[w]
      && !(p.lockStart[w] === count && p.lockArrival[w] > n))
      || this.pressWindow(p, seq);
  }

  /** LATER 157 (its review's F1): the room's whole ticks since this seat's last spawn, the bound on the gate's skip report. */
  private sinceSpawn(p: Player): number {
    return Math.max(0, Math.floor(this.serverClock - p.spawnClock));
  }

  /** Round 3 (research 223 s6): the room's ticks this player has not run, less the clocks drops have run (`Player.clockBase`). */
  private unran(p: Player): number {
    return p.clockBase === null ? 0 : Math.max(0, Math.floor(this.serverClock - p.clockBase - p.ran - p.elapsed));
  }

  /**
   * THROW-INTERRUPT (the review's F1): the command a throw's clip is laid on -- a hold started since the walker's count was
   * last read (`Walker.holdStarts`) and of the throw family -- for `deathDrop`; read after each command the room runs and
   * after each dropped one `dropBacklog` lays (the narrow check's 2).
   */
  private noteThrowHold(p: Player, seq: number): void {
    const w = p.sim.walker;
    // LATER 122 (#398's review F1, its re-read F1): a placing's hold off before C4's callback (`C4_PLANT_SECONDS` in the
    // player's own command ticks, `ran`, as the mover runs the clip) -- a knock, a `replaced` -- hands its plant to the
    // kit's 99 s timer (`C4_FALLBACK_PLACEHOLDER`): `cut`, before the early return below, since an end starts no hold.
    // The re-read's F2: and anything taken into the hand since the start (the firearm swapped, a launcher up) leaves C4
    // out of it at the timer's end (`handOff`; D:L476887-476892 plants only with 0x97 the kit's current item).
    const ps = p.placeStart;
    if (ps && !ps.cut && !(w.holding && holdFamily(w.holding.clip) === 'place' && w.holdStarts === ps.serial)
      && p.ran - ps.ran < Math.ceil(C4_PLANT_SECONDS * TICK_HZ)) ps.cut = true;
    if (ps && (p.sim.weapon !== ps.weapon || p.held !== ps.held)) ps.handOff = true;
    if (w.holdStarts === p.holdStartsSeen) return;
    p.holdStartsSeen = w.holdStarts;
    const laid = w.holding;
    if (laid && holdFamily(laid.clip) === 'throw') { p.throwHoldSeq = seq; if (p.placeStart) p.placeStart.handOff = true; }   // a throwable in the hand
    // LATER 144: a placing's start; its eye is read once the command's frame is in the cone (after `aim`, in the run path)
    // -- a dropped command's never is, and it banks none.
    if (laid && holdFamily(laid.clip) === 'place') {
      // LATER 122: the start's head too (`startRefused`'s `headEye`), and the hold's serial, for the 99 s fallback.
      const s = p.sim.walker.state, b = this.startBody(p);
      p.placeStart = {
        seq, feet: [s.x, s.y, s.z], eye: null, frames: null, at: this.eventClock(p), head: headEye(this.map.grid, b.feet, headPoint(b), () => true),
        serial: w.holdStarts, ran: p.ran, weapon: p.sim.weapon, held: p.held,
      };
    }
  }

  /**
   * HIGH-1: a queue past `BACKLOG_BOUND_PLACEHOLDER` with nothing left to run it on (no credit, no unspent time in the
   * window) keeps only its newest command; the rest go unrun and uncharged (`ran` not advanced: the clock is not
   * bought), the mover's number moved past them so no gap is waited on. Their rounds, reloads and throws find their
   * command run and stale (`decide`; told to the page). LATER 123: their immediate asks (`ASK_AT_COMMAND_ADAPTATION`) are
   * decided at the drop, each at the dropped command it names (`asksAt`). Their one-shot presses are not lost (the review of NET-ROOM): the mover acts on a jump, an Action,
   * a swap, a stance change and the kit's hold (`HOLD_SHIFT`: a throw, the claymore, a still reload) only in the command
   * that carries it, and the page predicted them -- the snapshots reconcile the position, not the stance, the weapon
   * or the clip. LOW-1 (research 223 s6): each dropped command that pressed one is laid on the mover now, in its seq
   * order, as a zero-move command (`MoverSim.prepare`, no `Walker.tick`: no time and no movement bought, only its
   * presses, under its own look and held bits), so a prone then a jump is refused as the page's walk refused it --
   * not the one collapsed command's fixed order (jump before stance). After each dropped command the mover's clocks run
   * one tick, its body held (`Walker.elapse`; none while a traversal has the tick): a clip a press started runs out
   * before a later press as on the page. The ticks are the room's, never the client's numbers (round 3): a seq gap is
   * credited nothing, and all of a drop's ticks are at most what the room observed this player not run (`unran`),
   * spent once. No movement is credited; the rounds', reloads' and throws' timing is the room's event clock's
   * (`decide`, `p.ran`), which the drop leaves alone. The kept command runs with its own presses only.
   * A dead body's dropped respawn press (Action) is carried on the kept command; a mounted one takes no presses.
   */
  private dropBacklog(p: Player): void {
    if (p.queue.length <= BACKLOG_BOUND_PLACEHOLDER || !p.synced) return;
    const gone = p.queue.splice(0, p.queue.length - 1);
    for (const c of gone) p.queued.delete(c.seq);
    this.dropStretch(p, gone, 'backlog');
  }

  /**
   * HIGH-1 / LATER 136: a dropped stretch of commands, oldest first -- a backlog's (`dropBacklog`) or the intake's flood
   * cut's (`binary`, `Player.cut`, at the step's top): each command's presses laid, its clock within `unran`, its asks
   * decided at it (`asksAt`, LATER 123), the mover's number moved past the last, tallied `why` (one a stretch). The body
   * of what was `dropBacklog` after its splice, unchanged but for the respawn carry's guard (a cut may come with no
   * command queued). LATER 140: a command the page ran inside a dismount's reversed clip is laid with `run`'s strip.
   */
  private dropStretch(p: Player, gone: Command[], why: 'backlog' | 'cut', reserve = 0): void {
    const edges = Button.Jump | Button.Action | Button.Swap | Button.Stance | (0xf << HOLD_SHIFT);
    if (!p.alive) {
      if (p.queue.length && gone.some((c) => (c.buttons & Button.Action) !== 0)) p.queue[0] = { ...p.queue[0]!, buttons: p.queue[0]!.buttons | Button.Action };
      for (const c of gone) this.asksAt(p, c.seq);              // LATER 123: each ask at its command (a dead body's handlers refuse)
    } else if (p.mounted === null) {
      // Round 3 (BLOCKING): a command's number is the client's, so it decides no time. Each dropped command is one tick
      // of the page's (a seq gap is credited nothing), and all of them at most the ticks the room observed this player
      // not run (`unran`), spent once (`elapsed`).
      // LATER 136 (the review's F2): less the `reserve` -- the ticks this step's `run` will spend (a cut at the step's top) --
      // so the stretch and the run tick the mover's clocks once over the wall time (round 3); a backlog's is 0.
      let budget = Math.max(0, this.unran(p) - reserve);
      // NET-DIVE (research 223 s6.6): a dive already running (begun on the room's last real ticks) owns every dropped
      // tick (`TickDriver.owns`): `Walker.elapse` would run no clock and `busy` refuse each later press, while the page
      // ran it to its end with real ticks. It ends here as the page's ends (`Traversal.diveTick`: down, at rest, prone,
      // the move and its yaw lock released), its glide not credited: no movement and no tick spent.
      const moves = p.sim.moves, w = p.sim.walker;
      if (moves instanceof Traversal && moves.state().kind === 'dive' && !w.airborne) {
        moves.reset(w);
        w.state.vx = 0; w.state.vz = 0;
      }
      // NET-WIRE (protocol 11; NET-LOOK's design call, research 223 §8; research 224 §4): the dropped ticks buy the look
      // nothing (the cover is zero) -- the kept command is held to its own tick and the bank, the room turns on to the
      // page's look at the law, and the page takes the room's facing from the snapshot's own state (`../net/client`).
      // LATER 140 (TURRET_RELEASE_ACTIONS_PLACEHOLDER, TURRET_RELEASE_STICK_PLACEHOLDER): while a dismount's reversed clip
      // runs on the room's mover (`p.release`: a knock, a death or a mount ends it, as it ends `run`'s strip), a command the
      // page ran inside it is held as `run` holds one -- the stick zeroed, the jump, the stance, the leans and the swap
      // taken off (`RELEASE_HELD_BUTTONS`) -- judged by its own number against the clip's span in the page's numbering
      // (`releaseSpan`, as `releaseRefused` judges an ask), through the end's command (`to` + 1, the 17th at 60 Hz: the
      // stick and these presses are held through it, the asks to the 16th). The travel is not stepped here: it steps on
      // the commands `run` runs (as the mount's steer, LATER 96), the drop buying no movement.
      const span = p.release !== null ? p.releaseSpan : null;
      const from = p.elapsed;
      let prepared = 0;                                         // LATER 157: the dropped commands the gate stepped (their presses)
      for (let i = 0; i < gone.length; i++) {
        const g = gone[i]!;
        const c = span && g.seq >= span.from && g.seq <= span.to + 1 ? { ...g, forward: 0, right: 0, buttons: g.buttons & ~RELEASE_HELD_BUTTONS } : g;
        this.heldOn(p, c.seq);                                 // NU-6 F1: a raise's or a lower's item on its own command
        if (c.buttons & edges) {
          const swapOff = (c.buttons & Button.Swap) !== 0 && this.swapRefused(p, c.seq, c.weapon);
          // PARITY-1 D02, review F4: the jump asked at the count the room would have run this command at -- the next after
          // the last run, on by the drop's own clock ticks so far (`elapsed`; round 3: never the client's numbers).
          const jumpOff = (c.buttons & Button.Jump) !== 0 && this.jumpRefused(p, c.seq, p.ran + 1 + p.elapsed - from);
          // NET-FIX3 B2 (research 223 s6): a dropped prone is laid with the body at rest, so it is the still prone, never
          // the dive (`Traversal.dive` reads the speed): the walker's speed is the last command the room ran, not the
          // page's, and a dive the drop started would own the tick (`TickDriver.owns`), run no clock (`Walker.elapse`)
          // and so refuse every later dropped press (`busy`). Both end prone; the speed is put back for the kept command.
          const st = p.sim.walker.state, vx = st.vx, vz = st.vz;
          const prone = (c.buttons & Button.Stance) !== 0 && STANCE_CODES[c.stance] === 'prone';
          if (prone) { st.vx = 0; st.vz = 0; }
          p.sim.prepare({ ...c, forward: 0, right: 0, buttons: c.buttons & ~((swapOff ? Button.Swap : 0) | (jumpOff ? Button.Jump : 0)) });
          prepared++;
          if (prone) { st.vx = vx; st.vz = vz; }
          this.noteThrowHold(p, c.seq);                          // THROW-INTERRUPT (the narrow check's 2): a clip on a dropped command
        }
        // PAR-83: the launcher's stick lower on the dropped command's own stick, as the page ran it (the drop moves no
        // body, so the stick is read off the command: clamped, with the scope's 0.2, as `Walker.cutStick`); the jump on it
        // was asked above, before the lower, as the driver reads it (D:L418119-418150 before D:L418263).
        if (!p.sim.walker.airborne) this.launcherStick(p, c.seq, commandStick(c), p.ran + 1 + p.elapsed - from);
        // Round 2: the command's tick runs the mover's clocks, not its body (`Walker.elapse`; skipped while a traversal
        // has the tick, as `step60` skips them), so a clip this press started has run out by a later press as on the page.
        if (budget > 0) { budget--; p.elapsed++; p.sim.walker.elapse(1); }
        this.asksAt(p, c.seq);                                  // LATER 123: the asks naming this command, its presses laid
      }
      // LATER 157: the drop's unstepped commands, at most the ticks the room observed -- the look gate's grace reaches over them.
      p.sim.gate.skipped(Math.max(0, Math.min(gone.length, p.elapsed - from) - prepared), this.sinceSpawn(p));
    } else {
      // A mounted body: the ticks the room observed, spent once (`elapsed`), as above; no cover (protocol 11).
      p.elapsed += Math.min(gone.length, Math.max(0, this.unran(p) - reserve));
      for (const c of gone) this.asksAt(p, c.seq);              // LATER 123: refused 'mounted' at their command (a pickup claimed)
    }
    p.sim.seq = Math.max(p.sim.seq, gone[gone.length - 1]!.seq);   // LATER 136 (review F1's net): never back
    // NCW-6 (an instrument): the stretch remembered for `signals.staleAfterDrop`, the oldest forgotten past the bound
    for (let i = 0; i < gone.length;) {                          // each run of consecutive numbers, a skipped number in none
      let j = i;
      while (j + 1 < gone.length && gone[j + 1]!.seq === gone[j]!.seq + 1) j++;
      p.droppedRanges.push([gone[i]!.seq, gone[j]!.seq]);
      i = j + 1;
    }
    if (p.droppedRanges.length > STALE_DROP_RANGES_MAX_ADAPTATION) p.droppedRanges.splice(0, p.droppedRanges.length - STALE_DROP_RANGES_MAX_ADAPTATION);
    p.gapSince = -1;
    this.dropped('command', why);
  }

  /**
   * LATER 123: the immediate asks waiting for dropped command `seq` (`ASK_AT_COMMAND_ADAPTATION`), decided now, at that
   * command -- the mover's number moved to it, so `decide` judges each as `settle` would have had the command run: the
   * stale bound, mounted, the release's span, then its handler. In order; any other waiting event (a round, a reload, a
   * throw, an order) left where it waits: `settle` refuses it 'stale' and tells the page, as before.
   */
  private asksAt(p: Player, seq: number): void {
    p.sim.seq = seq;
    for (let i = 0; i < p.pending.length;) {
      const ev = p.pending[i]!.ev;
      const ask = ev.type === 'door' || ev.type === 'action' || ev.type === 'bombAction' || ev.type === 'pickup';
      if (ask && ev.seq <= seq) { p.pending.splice(i, 1); this.decide(p, ev); continue; }
      i++;
    }
  }

  /**
   * A dead SEAL's body, a tick on the room's clock: it goes on falling and playing its death (a thrown corpse lands, and
   * `Land forward` / `Land backwards` hold: `Walker.dead`) with the stick at rest and the facing it died with -- the
   * other screens draw it from the snapshots, and the page's locked walk ticks its own the same (`WalkMode.frame`).
   */
  private corpse(p: Player): void {
    if (p.alive || !p.sim.walker.dead) return;
    p.sim.walker.turn = 0;
    p.sim.walker.tick(DEAD_STICK);
  }

  /**
   * A player's commands, in order, as far as its credit goes -- and past it, a backlog drained on the window's unspent
   * time (HIGH-1, `CATCHUP_PER_TICK_PLACEHOLDER`); a backlog with nothing left to run on dropped (`dropBacklog`).
   */
  private run(p: Player, now: number): void {
    p.credit = Math.min(CREDIT_MAX, p.credit + this.creditStep);
    const slot = this.tick % CATCHUP_WINDOW_TICKS_PLACEHOLDER;
    p.slack += this.creditStep - p.spent[slot]!;
    p.spent[slot] = this.creditStep;
    let extra = 0;
    while (p.queue.length) {
      const charged = p.credit >= 1;
      if (!charged && p.slack < 1) { this.dropBacklog(p); break; }
      if (!charged && extra >= CATCHUP_PER_TICK_PLACEHOLDER) break;
      // Review 4: a new player's first command is where its numbers start, not a gap after 0 (`synced`).
      if (!p.synced) { p.synced = true; p.sim.seq = Math.max(p.sim.seq, p.queue[0]!.seq - 1); p.clockBase = this.serverClock - p.ran; }
      // A gap (a command lost past the redundancy, or still on its way): wait for it a while, then go on without it.
      // NET-LOOK round 6: the wait starts when the gap is first seen (it was read before it was set, so it never waited).
      if (p.queue[0]!.seq > p.sim.seq + 1) {
        if (p.gapSince < 0) p.gapSince = this.tick;
        if (p.gapSince + GAP_WAIT > this.tick) break;
      }
      p.gapSince = -1;
      const cmd = p.queue.shift()!;
      p.queued.delete(cmd.seq);
      // Review 3 B1: commands lost past the wait were ticks the page ran -- its fire rate, reload lock and throw clocks
      // went on through them -- so the clock counts them as run, each charged against the credit as a command run is.
      // A number skipped on purpose buys no more than the burst of commands the same credit would (`CREDIT_MAX`): the
      // clock stays the room's, never a number the client sends alone. Review 4: never charged below the commands still
      // queued behind it (the backlog the wait built), so a steady client drains its backlog rather than keeping it.
      // HIGH-1: a catch-up command (past the credit) buys no lost numbers and is charged to the window's unspent time.
      // NET-WIRE (protocol 11): lost numbers buy the look no cover (NET-LOOK round 3's, then option (c)'s, now zero).
      const lost = charged ? Math.max(0, Math.min(cmd.seq - p.sim.seq - 1, Math.floor(p.credit) - 1 - p.queue.length)) : 0;
      if (lost > 0) p.sim.gate.skipped(lost, this.sinceSpawn(p));   // LATER 157: numbers lost past the wait, charged against the credit
      if (charged) p.credit -= lost + 1; else extra++;
      p.slack -= lost + 1;
      p.spent[slot] -= lost + 1;
      p.ran += lost + 1;
      // SVC-23b: the line's best offset, for the stall's dating of the timed events (`eventClock`).
      if (this.serverClock - p.lagFloor.since >= LAG_FLOOR_WINDOW_TICKS / 2) p.lagFloor = { cur: Infinity, prev: p.lagFloor.cur, since: this.serverClock };
      p.lagFloor.cur = Math.min(p.lagFloor.cur, this.serverClock - p.ran);
      const active = Math.abs(cmd.forward) > ACTIVE_STICK || Math.abs(cmd.right) > ACTIVE_STICK || (cmd.buttons & ~Button.Boost) !== 0
        || Math.abs(shortTurn(p.lastYaw, cmd.yaw)) > 0.5 || Math.abs(cmd.pitch - p.lastPitch) > 0.5;
      if (active) { p.lastActive = now; p.signals.input = true; }   // SVC-12d: input sent this round (the idle kick's test)
      p.lastYaw = cmd.yaw; p.lastPitch = cmd.pitch;
      if (!p.alive) {
        p.sim.seq = cmd.seq;
        // The dead's controller (`FUN_00592560` L451642-451730) reads the respawn press alone: no stick, no look.
        if ((cmd.buttons & Button.Action) && this.respawnReady(p)) this.spawn(p, 'respawn');
        this.settle(p);
        continue;
      }
      this.ownRun = { p, before: p.sim.seq };                    // NCW-2 B-trade (F3): a death in this run keeps `before`
      p.trigger = (cmd.buttons & Button.Trigger) !== 0;
      p.aiming = (cmd.buttons & Button.Aim) !== 0;
      p.boost = (cmd.buttons & Button.Boost) !== 0;
      p.binoculars = (cmd.buttons & Button.Binoculars) !== 0;
      p.raised = cmd.raised === true;                            // ER-2: the owner's raise state, relayed (`body`)
      p.scopeView = (cmd.buttons & Button.Scope) !== 0;
      // LATER 104 (`TURRET_RELEASE_SEQ_ADAPTATION`, research 215 s7.9): a dismount is taken before the first command above its
      // `seq` the room runs (a parked seat's neutral ones too: `parkedStep` queues them), not at its arrival -- before this
      // command's steer step and hold, so the command runs released. While the steer still runs it is held (ruling (b)): the
      // step below ends the steer and the hold places the body on this command, and the next takes the dismount.
      if (p.dismount !== null && cmd.seq > p.dismount) this.takeDismount(p);
      // A1 (LATER 239, 217, 218, 243): a reserved body is taken before the command its page named (`takeMount`). The commands
      // below it ran on foot, as the page ran them; this one runs mounted (`onTurret`, the steer's first step), as the dismount above.
      if (p.reserved !== null && p.reserved.m !== null && cmd.seq >= p.reserved.m) this.takeMount(p, cmd.seq, true);
      // MAP-10b: a mounted body is held -- the command it runs carries no stick and no press but the look's, clamped --
      // after the mount's steer has carried it onto the seat through its own collision (`Walker.glide`, TURRET_SEAT_READING).
      // PB-2 (research 215 s7.1, `FUN_005b3340`): while the mount clip's steer runs it lays the body's facing (`seatTurn`,
      // the hold's facing on its last tick) -- the command's yaw is the steer's, let through the look gate as the mount's own
      // snap is (OT.R38); the page turns its own look alike (`TurretPage.frame`).
      const steered: { yaw: number | null } = { yaw: null };
      const sw = p.sim.walker;
      // PAR-44 (research 215 s7.5): past the mount's steer (at once in a room without the clips) the hold places the body
      // each tick -- after the command's move, at the aim the look gate let (`holdStep`). PB-2c (research 215 s7.1): the
      // clip comes off at the driver's end test before the tick's advance (`FUN_00550ef0` D:L418192-418203 ->
      // `FUN_0028c6e0`), and the hold runs that same tick (`FUN_00585cd0` D:L438897-438898): the steer's `step` answers it
      // first, laying the gun's facing and moving nothing, so the hold is asked after it (was: from the tick after).
      // T81-4 (research 215 s7.9; TURRET_STEER_WALLS_READING): the steer's move laid on the place with no collision -- the
      // turret anim set writes the move's unresolved displacement back (`FUN_005483d0` D:L413908-413918) -- handed the
      // walker's ground, and laid again after the command's move below, whose push-out (`Walker.pushOut`) would otherwise
      // undo it each tick of the clip (was: through `Walker.glide`, the turret's own hull stopping it 2.43 short). The step
      // stays before the command: its facing is this tick's command's yaw (PB-2, past the look gate by `allowSnap`).
      let seated: [number, number, number] | null = null;
      if (p.seat && (p.mounted === null || p.seat.step({ state: sw.state, grid: sw.grid, airborne: sw.airborne, setAirborne: (on) => sw.setAirborne(on), face: (yaw) => { steered.yaw = yaw; } }, 1 / TICK_HZ))) p.seat = null;
      else if (p.seat) seated = [sw.state.x, sw.state.y, sw.state.z];
      // LATER 109 (TURRET_RELEASE_TRAVEL_READING; research 215 s7.9): a dismount's reversed mount clip -- the release writes no
      // place (`FUN_00545ee0` D:L411941-412028) and the clip runs in the turret set, so its root's velocity moves the body
      // with no wall (`FUN_0057a330` D:L438910, `FUN_0054d9a0` D:L416515-416520, `FUN_005483d0` D:L413908-413918) -- stepped
      // before the command, as the seat's steer, and its place laid again after the command's move (the walk's push-out
      // undone); on the end's command (the 17th) nothing steps and the walls are back. The stick moves nothing through
      // the 17th (TURRET_RELEASE_STICK_PLACEHOLDER: no walk motion in the turret set, `FUN_00588bc0` D:L446077-446081).
      const releasing = p.release !== null;
      let travelled: [number, number, number] | null = null;
      // F-B: the end's command (the 17th) keeps the clip's refusals through its own run -- the climb's offer (`climbLock`) is
      // asked inside the command's move -- and lets the release go after it (the controller's tick asks the offer before the
      // driver's end test returns the set, D:L418091 before D:L418193).
      const releaseEnds = p.release !== null && p.release.step({ state: sw.state, grid: sw.grid, airborne: sw.airborne, setAirborne: (on) => sw.setAirborne(on) }, 1 / TICK_HZ);
      if (p.release && !releaseEnds) travelled = [sw.state.x, sw.state.y, sw.state.z];
      const holding = p.mounted !== null && !p.seat;
      if (steered.yaw !== null) p.sim.allowSnap();
      const c0 = p.mounted !== null ? this.onTurret(p, steered.yaw !== null ? { ...cmd, yaw: steered.yaw } : cmd) : cmd;
      // LATER 109 (the review's F2): the presses held with the stick through the clip -- the jump and the leans refused under
      // the turret set (`FUN_005b4340` D:L469466-469475, D:L469345-469346), the stance and the swap by
      // TURRET_RELEASE_ACTIONS_PLACEHOLDER's strict default (the climb's offer: `climbLock`).
      const c = releasing ? { ...c0, forward: 0, right: 0, buttons: c0.buttons & ~RELEASE_HELD_BUTTONS } : c0;   // TURRET_RELEASE_STICK_PLACEHOLDER
      // M-3 of review 2: the swap gate `FUN_005a8cb0` (463150-463160) passes only when `FUN_005a7de0(body,1,1)` does,
      // which refuses while `FUN_005a7ab0` answers (462594-462634) -- a reload's clip or a swap's. The swap asked under
      // either is taken off the command before the mover sees it (the page's `canSwap` never sends one).
      const swapOff = (c.buttons & Button.Swap) !== 0 && this.swapRefused(p, c.seq, c.weapon);
      // PARITY-1 D02 (research 251 s6): a jump under the still reload's clip is spent and refused (`jumpRefused`); PAR-78:
      // under the flinch's too.
      const jumpOff = (c.buttons & Button.Jump) !== 0 && this.jumpRefused(p, c.seq);
      // NET-LOOK (OT.R38 / H115, research 223 s3.1): the look held to the stick's law on the room's mover -- the weapon
      // in hand's scope and kick from its record -- and the turn derived from it (`MoverSim.gate`, the page's own gate).
      p.sim.lookContext ??= this.lookContextFor(p);
      // FALL-DEATH-LAND: the landing asks the fall's damage before its pick (`FUN_005af590` D:L466656-466664), as `fallDamage` will lay it.
      p.sim.walker.fallKills ??= (speed) => fallKills(p.health, speed) && !this.deathless(p);
      this.heldOn(p, c.seq);                                   // NU-6 F1: a raise's or a lower's item with its clip
      p.sim.apply(swapOff || jumpOff ? { ...c, buttons: c.buttons & ~((swapOff ? Button.Swap : 0) | (jumpOff ? Button.Jump : 0)) } : c);
      if (seated) { sw.state.x = seated[0]; sw.state.y = seated[1]; sw.state.z = seated[2]; sw.state.vx = 0; sw.state.vz = 0; }   // T81-4: the steer's place, the push-out undone
      if (travelled) { sw.state.x = travelled[0]; sw.state.y = travelled[1]; sw.state.z = travelled[2]; sw.state.vx = 0; sw.state.vz = 0; }   // LATER 109: the travel's place, walls off
      if (releaseEnds) p.release = null;                       // LATER 109 (F-B): let go after the end's command ran
      if (holding && p.mounted !== null) holdStep(this.turrets[p.mounted]!.place, sw);
      if (p.mounted !== null) this.turrets[p.mounted]!.gunYaw = sw.state.yaw;   // PB-2c: the gun's yaw, the occupant's aim
      this.noteThrowHold(p, c.seq);                            // THROW-INTERRUPT (the review's F1): a throw's clip laid on it
      const looked = p.sim.looked;
      if (looked.clampedYaw) this.dropped('look', 'turn');
      if (looked.clampedPitch) this.dropped('look', 'pitch');
      this.aim(p, { ...c, yaw: looked.yaw, pitch: looked.pitch, turn: looked.turn });   // the cone on the look the room let
      // LATER 144: the placing's start eye, from the frame `aim` just laid, never the level fallback.
      if (p.placeStart?.seq === c.seq && p.cone.frame(c.seq)) { p.placeStart.eye = this.orderOrigin(p, c.seq); p.placeStart.frames = p.cone.framesAround(c.seq); }   // LATER 139: its look too
      // PAR-83: the launcher's stick lower on the command's own stick (`Walker.cutStick`), after its jump was asked above.
      if (p.sim.walker.cutAsked) this.launcherStick(p, c.seq, p.sim.walker.cutStick);
      this.watchCut(p);                                        // PF-18: the reload clip's cut on this mover
      if (this.victoryPlaying.has(p.id) && !p.sim.walker.victoryMotion) this.stopVictory(p.id);
      // XR-05: the plant's and the defuse's holds, counted here (never from a turret: MAP-10b's `c`); LATER 220: behind the
      // prompts' common gate on this command, as `actionGateShut` judges it (no event's arrival order here: -1, `decide`'s).
      if (this.bomb) this.bomb.command({ ...this.bombActor(p), gateShut: this.actionGateShut(p, c.seq, -1) !== null }, c);
      const landing = p.sim.walker.landing;
      if (landing && landing !== p.lastLanding) {
        p.lastLanding = landing;
        this.fallDamage(p, landing);
        // PAR-28: a landing's clip pops the stack (FUN_005af590 D:L466692); PAR-82: any landing pops the m203's still clip
        // (FUN_005af930 D:L466897, D:L466900-466901), its family the hand's life's.
        if (landingPops(landing, p.reloadLife[p.sim.weapon]?.spec.family ?? null)) this.endStillReload(p, false);
      }
      this.settle(p);
      this.bankPlaceGate(p, c.seq);                            // LATER 220 head 3's review F1: the press's gate, while in the cone
      this.ownRun = null;
    }
  }

  /**
   * LATER 220 head 3's review F1: a placing laid on command `seq` (`noteThrowHold`) banks the prompts' common gate as its
   * press read it -- on the command before (the offer's mask built at that frame's end, D:L73390), after the events named
   * on it have been decided (`settle`) -- read at the plant (`placeCharge`), which comes about 66 commands later
   * (`C4_PLANT_SECONDS`, 1.098 s, at the 60 commands a second), past the cone's 64. The port's convention (its re-look,
   * low 1): `n` = Infinity -- the press has no arrival of its own to order against, so LATER 249's exception is off and
   * every lock armed on the command before covers it, as that frame's mask holds it (head 2's `n` = -1 for the bomb's
   * held command, whose own frame arms none). The edge (low 3): a reload named on that command arriving only after the
   * start's command ran is not armed at the bank and is never re-banked -- an out-of-order arrival only.
   */
  private bankPlaceGate(p: Player, seq: number): void {
    const ps = p.placeStart;
    if (ps && ps.seq === seq && ps.gate === undefined) ps.gate = this.actionGateShut(p, seq - 1, Infinity);
  }

  /**
   * NET-LOOK (OT.R38): the gate's context, the weapon in hand's record (`lookContextOf`). A pickup's claim (`worldDrops`
   * `take`) changes a record under the same mover, and the page learns of it a round trip later (`kit`): when the HELD
   * slot's record changes (by its id), the held weapon's old context is taken with the new, the looser
   * (`looserLookContext`), for that slot and `LOOK_KIT_LEAD_PLACEHOLDER` commands -- and a new window opens only a
   * window's length after the last one ended (round 4: a claim may come every tick, `WorldDrops.claim`, so re-picks
   * would otherwise keep a scope at the old record's rate).
   */
  private lookContextFor(p: Player): (w: 0 | 1) => LookContext {
    let seen = p.records;
    let window: { slot: 0 | 1; ctx: LookContext; until: number } | null = null;
    let nextOpen = -Infinity;
    return (w) => {
      if (p.records !== seen) {
        const held = p.sim.weapon;
        if (p.records[held].id !== seen[held].id && p.sim.seq >= nextOpen) {
          window = { slot: held, ctx: lookContextOf(seen[held]), until: p.sim.seq + LOOK_KIT_LEAD_PLACEHOLDER };
          nextOpen = window.until + LOOK_KIT_LEAD_PLACEHOLDER;
        }
        seen = p.records;
      }
      const cur = lookContextOf(p.records[w]);
      return window && w === window.slot && p.sim.seq <= window.until ? looserLookContext(cur, window.ctx) : cur;
    };
  }

  /**
   * The fall's damage (`FUN_005ac1f0` L464866-464960; research 151). The landing is the one the room's own mover
   * measured for this player -- its contact speed, the one quantity the landing's class, its sound (the page's
   * `GameAudio.onLand` by `@s2u/sound`'s `landingClass`; the hurt voice is not the landing's but the `hurt` below, the
   * damage reaction's, research 205 §2.2) and its damage are all read from -- a blast knock's landing
   * (`Landing.knocked`: `Fall forward` / `Fall backwards` on the ground) at the speed x 1.2 (`FUN_00580360` L441929,
   * `KNOCK_LANDING_SPEED_FACTOR`). The game runs it on the victim's own console (the
   * controller's `+0x34` false, L464928-464931); here the room is every player's console, so the page sends nothing for
   * a fall and nothing it could forge: the room's mover lands as the page's did, on the same commands (`MoverSim`).
   * A landing that took health (`applyFall`: `max x f` off every part, no armour) tells the victim's page as a round's
   * hit does -- `hurt` with the health left, from the feet, part 3: the reaction `FUN_005a54d0(actor, 3, 7)` (L464951)
   * names BODY and cause 7, a fall, which plays no flinch (L461402) and moves the health bar (`FUN_005477a0`); a
   * combat report when the option is on (research 127 §6: request `fall`, the player its own attacker, as the game sets
   * a fall's killer to the player, L464953-464957); and a death is the fall's (`kill`, how 'fall': "%s falls to their
   * death", cause 0xfd, a suicide's -2). Until 2026-10-03 the room applied the damage and told no one -- the owner's
   * "fall damage makes the fall damage sound but deals no damage": the page's bar learns its health from `hurt` alone.
   */
  private fallDamage(p: Player, landing: Landing): void {
    const speed = landing.knocked ? landing.speed * KNOCK_LANDING_SPEED_FACTOR : landing.speed;
    const f = fallDamageFraction(speed);
    if (!(f > 0)) return;
    const healthBefore = [...p.health.hp], armourBefore = [...p.health.armour];
    const was = overall(p.health);
    const died = applyFall(this.woundable(p), speed) && !this.deathless(p);   // CPS cell-alive: the deathless seat takes none
    const s = p.sim.walker.state, feet: V3 = [s.x, s.y, s.z];
    this.send(p.id, { type: 'hurt', health: [...p.health.hp], from: feet, part: PART.BODY });
    // The report's raw damage: what the loop takes before the clamp at 0 (`max x f` over the six parts); no armour step.
    this.combat(p, p, { request: 'fall', status: 'applied', part: PART.BODY, rawDamage: MP_HEALTH.reduce((n, m) => n + m * f, 0), healthBefore, armourBefore, killed: died, point: feet });
    if (died) this.kill(p, null, null, 'fall', DEATH_CAUSE.FALL);
    else this.hurtVoice(p, was);   // every page, the faller's too: its landing plays no voice (research 205 section 2.2)
  }

  /**
   * PF-10 fix round: the hurt voice. A health drop that leaves the body alive plays its character's `CHRSND_DAMAGE`
   * (`FUN_005a54d0` L461394-461396 -> `FUN_005477a0` L412828-412838 -> the controller's `+0x54`, `FUN_00597b00`: 0x3b at
   * 1.0), a bullet's, a blast's and a fall's alike (the flinch's cause test comes after, L461402), through the voice
   * gate (`FUN_0053b710` D:L405268-405290): while it runs nothing plays; else the voice plays and the gate runs
   * `VOICE_GATE_S`. Every page is told (`hurtVoice`), the body's own too, and plays it at the body.
   */
  private hurtVoice(victim: Player, was: number): void {
    if (!victim.alive || !(overall(victim.health) < was) || this.tick < victim.voiceGateUntil) return;
    victim.voiceGateUntil = this.tick + Math.round(VOICE_GATE_S * TICK_HZ);
    this.broadcast({ type: 'hurtVoice', id: victim.id });
  }

  /**
   * Whether a swap asked at command `seq` is refused (M-3): a reload's clip plays (either weapon's lock: `FUN_005a7ab0`
   * is the body's one action lock), a swap's clip plays, or a reload asked at an earlier command is still waiting to be
   * decided (it will lock the weapon from its own command, before this one). The swap's clip is the walker's own
   * (`Walker.swapProgress`), the state the page's kit ends its swap on (`kit.ts`): a standing swap cut by the stick
   * goes on as the moving overlay at the phase it reached (`mover.ts`, `FUN_00550ef0` 418226-418245) and ends before
   * the standing clip's length, so a count fixed at the swap's start outlasted the page's (review 3 B1). A bolt's or
   * pump's after-shot lock does not refuse it: the page's `canSwap` reads only the reload (`reloading`) and its
   * `setWeapon` cancels the after-shot (`Fire.cancelReload`), so the room clears that lock at the swap (`aim`).
   */
  private swapRefused(p: Player, seq: number, target?: number): boolean {
    if (target !== undefined) {
      if (target !== 0 && target !== 1) return true;
      if (!firearmSlotPresent(p.loadout, target)) return true;
    }
    if (this.victoryPlaying.has(p.id)) return true;
    // PAR-83, F1 of its review: the stick's moving lower live on this command (`FUN_005a8cb0` D:L463159 -> `FUN_005a7980`
    // D:L462492-462499) -- the page's `WalkMode.swapGate` refuses on the same commands.
    if (seq < p.movingLowerUntil) return true;
    const reloading = ([0, 1] as const).some((w) => p.lockKind[w] === 'reload' && p.ran < p.reloadUntil[w]);
    // LATER 167 (`FUN_005a7ab0` D:L462522-462523, `kit+0x820`): the reload's delay timer, from its press (`pressLock`, the
    // swap's own command) -- as the page's `kitFree` refuses it; the press's own command excluded (`FUN_00594cf0` reads
    // the swap, D:L453288-453312, before the reload's press, D:L453461-453463).
    return reloading || this.pressWindow(p, seq) || p.sim.walker.swapProgress() !== null
      || p.pending.some((t) => t.ev.type === 'reload' && t.ev.seq < seq);
  }

  /**
   * After a command: a swap on the server's mover (`MoverSim.weapon`) takes the other record into the cone; then one
   * tick of the cone (OWNER-3). The reload locks stand: a swap is refused while one holds (M-3, `swapRefused`).
   */
  private aim(p: Player, cmd: Command): void {
    const w = p.sim.weapon;
    if (w !== p.weapon) {
      p.weapon = w;
      p.throwStart = null;                                       // THROW-INTERRUPT: any weapon change ends the release request
      // PAR-83, F3 of PAR-81's review (research 230 section 5.2.8): a firearm taken with the launcher still in the hand is
      // the lower in the set (`FUN_005a64c0(actor, 4, firearm, 0)` -> `FUN_005a6b70` D:L462069-462082, the raise's clip
      // reversed by the firearm taken), pushed on this command: the set goes at that clip's end, never at once (the page's
      // `WalkMode.swapWeapon` the same). Unreachable from the page today: `kit.select`'s caller lowers first.
      if (p.held !== null) this.launcherDown(p, w, cmd.seq - 1);
      else if (p.heldNext !== null && p.heldNext.item !== null) this.refuseRaise(p, p.heldNext);   // NU-6 N1
      p.held = null; p.heldNext = null;                          // M7: a firearm swap puts the launcher away
      // TURRET-CONE: mounted, the cone keeps the turret record (the slot in the hand is the turret's, `FUN_005463c0` D:L412218).
      p.cone.setWeapon(p.mounted !== null ? this.turrets[p.mounted]?.record ?? p.records[w] : p.records[w]);
      // A bolt's or pump's after-shot lock goes with the swap, as the page's `setWeapon` cancels it (`Fire.cancelReload`);
      // a reload's never stands here -- the swap was refused under it (`swapRefused`).
      for (const x of [0, 1] as const) if (p.lockKind[x] === 'afterShot') { p.reloadUntil[x] = -1; p.lockClock[x] = -1; p.lockTimer[x] = -1; p.lockKind[x] = null; p.reloadLife[x] = null; }
    }
    const walker = p.sim.walker, s = walker.state, moves = p.sim.moves;
    // PF-17 (PF.R36): the fire's permission from the body's playing motion after this command, recorded with it.
    const table = this.clips?.table ?? null, cap = fireCapability(walker, moves, w === 1, table), motion = cap.motion;
    // LATER 173: the mount clip the seat's steer plays (`Stand -> Turret` / `Pistol stand -> Turret`, `seal_stand2turret` /
    // `seal_p_stand2turret`: a bare `NoFire ()` in motion.rdr, the only mount clips there) refuses every round through its
    // play (`FUN_005a7de0` D:L462612-462705, the clip on top) -- the steer is not the walker's, so `fireCapability` sees none.
    const fire = cap.fire && fireAllowed(p.seat ? { clip: mountClipOf(w), phase: p.seat.phase, reversed: false } : null, table);
    this.opts.recorder?.command?.(this.tick, p.id, cmd);
    // TURRET-CONE (research 215 s8.2): mounted, the cone runs the turret record at its stance row whatever the body's --
    // TURRET_RETICLE_STANCE_READING's 'stand' (`../../viewer/src/net/emplacement.ts`), as the page's `gunFrame` runs the kit.
    p.cone.tick(cmd, {
      feet: [s.x, s.y, s.z], velocity: [s.vx, s.vy, s.vz], airborne: walker.airborne, posture: walker.posture,
      stance: walker.stance, moveRoot: this.aimRootOf(p), peek: moves?.peek() ?? 0, weapon: w,   // JUMP-AIM-ROOT
      groundNormalY: walker.floorNormal[1],                      // PRONE-TILT-2 (2): the prone eye's +0x1348 (FUN_0029ae50)
      swapping: walker.swapProgress() !== null, motion, fire, turret: p.mounted, ...(p.mounted !== null ? { coneStance: TURRET_RETICLE_STANCE_READING } : {}),
      gate: walker.gateTop(w === 1),                             // LATER 220: the prompts' common gate's walker terms, the hand's
      // LATER 476: the throttle's own scale -- a scoped command's at the scope's least magnification (CONE_SCOPE_LEVEL_READING).
      lookScale: lookScaleOf(cmd.buttons, p.sim.lookContext?.(w) ?? OPEN_LOOK_CONTEXT),
    }, p.ran);
  }

  /**
   * JUMP-AIM-ROOT (the ghost-bullet report on live v0.4.18, game 4180; research 80 s7, 2026-11-11; reading, pending
   * review): the root the body's camera stands on now (`aimRoot`): a traversal move's, else a crouched body's posed root
   * in the jump and, the fold's blend-out (shadow's capture of the original, research 80 s7), whenever it stands above
   * the crouch root -- the room's own `HitPoser` (HIT-POSE: the page's `Animator` on the room's snapshot of the body,
   * A = B), which the page's camera rides through its own animator (`play.ts` `setPosedRoot`; research 80 s0: the
   * original's camera reads the posed root, `FUN_0029a950` via `FUN_002869d0`) -- else null. The page's start body
   * (`WalkMode.startBody`) takes the same rule on its own animator's root. `JUMP_AIM_ROOT_CLOCK_READING`: the pose the
   * poser kept at the last tick's end (`remember`), the command's own tick not yet posed. No poser (no motion), a poser
   * of another life (`sim`), a standing or prone body, a still crouch: as before.
   */
  private aimRootOf(p: Player): number | null {
    const w = p.sim.walker, poser = p.poser;
    return aimRoot(p.sim.moves?.rootY() ?? null, { action: w.action?.name ?? null, posture: w.posture },
      () => (JUMP_AIM_ROOT_CLOCK_READING === 'last-tick' && poser && poser.sim === p.sim ? poser.pose.rootY() : null));
  }

  private remember(p: Player): void {
    const s = p.sim.walker.state;
    const at = this.hitPose(p);                                  // HIT-POSE: the live skeleton's pose kept at this tick
    const past: Past = { tick: this.tick, feet: [s.x, s.y, s.z], yaw: s.yaw, posture: p.sim.walker.posture, alive: p.alive, tilt: p.sim.walker.rootTilt.q,
      peek: p.sim.moves?.peeking() ?? 0,                         // LEAN-HIT: the held peek, the body's lean set
      pose: at ? p.poser!.pose : undefined, poseAt: at };        // one shape for every entry, posed or not
    p.history.push(past);
    if (p.history.length > HISTORY) p.history.shift();
  }

  /**
   * HIT-POSE (research 217 s3.6; reading, pending review): the player's live pose this tick -- the page's `Animator`
   * (`../../viewer/src/net/hitPose` `HitPoser`) on its own skeleton, stepped by a tick (`HIT_POSE_CLOCK_READING`) on the
   * snapshot the room sends of the body (`hitPoseSnapshot` of `body`: what a page's copy plays) with the walker's root
   * tilt -- and keeps the pose it leaves (`HitPoser.keep`: every boxed bone's matrix in its ring of `HISTORY` poses; the
   * perf fold, research 217 s3.6a, s3.6b: the boxes are read only for a body a round's ray reaches, `pastBoxes`,
   * `liveVolumes`), returning its stamp. A living, present player on a hit body with motion; else 0 (the idle sets), and
   * 0 on a turret (`HIT_POSE_MOUNT_READING`, its poser stepped all the same). Made anew for a new hit body or a new seat
   * `sim` (a spawn), as the page rebuilds its copy.
   */
  private hitPose(p: Player): number {
    const body = p.alive && !p.away ? this.hitBodyOf(p) : null;
    if (!body?.motion) { p.poser = null; p.hitAt = 0; return 0; }
    if (!p.poser || p.poser.body !== body || p.poser.sim !== p.sim) p.poser = { pose: new HitPoser(body.skeleton, body.motion, HISTORY + 1), body, sim: p.sim };
    p.poser.pose.stepBody(1 / TICK_HZ, this.body(p), p.sim.walker.rootTilt.q);
    // HIT_POSE_MOUNT_READING 'idle': a mounted gunner is met on the idle set, as the page aims on it (the poser runs on)
    if (HIT_POSE_MOUNT_READING === 'idle' && p.mounted !== null) { p.hitAt = 0; return 0; }
    return p.hitAt = p.poser.pose.keep();
  }

  /**
   * A player's body where it stands now: its live pose's bone boxes (`hitAt`, the last tick's step, read from the ring:
   * no copy) placed at its feet and yaw, else its stance's idle set with its tilt (and `peek`, the held peek's lean set,
   * where the caller passes it). The ray's own cull (`rayRecords`: the body's cull box) runs before any box is tried.
   */
  private liveVolumes(q: Player, feet: V3, peek: -1 | 0 | 1 = 0): PlacedBody {
    const w = q.sim.walker;
    const boxes = q.hitAt && q.poser ? q.poser.pose.boxesAt(q.hitAt) : null;
    return boxes ? placedVolumes(feet, w.state.yaw, boxes) : bodyVolumes(feet, w.state.yaw, w.posture, this.volumesOf(q), w.rootTilt.q, peek);
  }

  // ---- spawns (research 91 section 4.2) ----

  private sideOf(team: Team): 0 | 1 {
    // Team words 0x40000001 (SEALs) take side 0 while the sides are not swapped (research 91 section 4.2, 7).
    return team === 'seal' ? 0 : 1;
  }

  /**
   * RSP-5 (research 353 section 2): r0004 `FUN_002b9a70` / `FUN_002b9c90` search only this connection's `count/24`
   * records in trailer order. Enemy bodies count alive or dead; a strict improvement wins, no enemy keeps the first.
   * Round-start keys 0/2 draw only inside that block, with no RNG when it has one record. The reader `FUN_0052e6e0`
   * wraps each requested record against its actual key count. Static code readings, independently source-reviewed.
   * RESPAWN_BLOCK_PLACEHOLDER remains for missing respawn data, custom starts below 24 records (the original's
   * zero-divisor edge is unread), and the native RNG stream for larger custom starts; existing fallbacks/RNG remain.
   */
  private pick(p: Player, kind: 'start' | 'respawn'): SpawnSlot | null {
    const side = this.sideOf(p.team);
    const pool = (kind === 'respawn' ? this.map.respawns : this.map.slots).filter((s) => s.side === side);
    const list = pool.length ? pool : this.map.slots.filter((s) => s.side === side);
    if (!list.length) return null;
    if (kind === 'start' && this.opts.rules === 'classic' && this.state.phase !== 'waiting') {
      // A non-respawn game's round start takes the player slot's own record (`+0xfc8`, L158760-158763), wrapped to
      // `index % count` (`FUN_0052b5c0` L395761-395763): the slot is the client index (research 179 section 9.2, which
      // resolved START_SLOT_LINK; owed: a two-console capture of `+0xfc8` against the start position).
      const ordered = [...list].sort((a, b) => a.index - b.index);
      return ordered[(this.clientIndex.get(p.id) ?? 0) % ordered.length]!;
    }
    const useBlock = this.opts.rules === 'respawn' && pool.length > 0;
    let candidates = list;
    if (useBlock) {
      const block = Math.trunc(list.length / 24), first = block * (this.clientIndex.get(p.id) ?? 0);
      const record = (index: number): SpawnSlot => list[(index >>> 0) % list.length]!;
      if (kind === 'start') {
        // RESPAWN_BLOCK_PLACEHOLDER's small/custom start fallback only; the original maps' 24/25 records use block 1.
        if (block === 0) return list[Math.floor(this.opts.random() * list.length)]!;
        return record(first + (block === 1 ? 0 : Math.floor(this.opts.random() * block)));
      }
      if (block === 0) return list[0]!;                         // original max-min loop has no candidates, returns index 0
      candidates = Array.from({ length: block }, (_, i) => record(first + i));
    }
    // Research 322 §5.3: a late console still loading has no actor in the original's scanned actor table.
    // NET-RES-2 (the #474 takeover review's F4): nor a held seat away -- its body is out of the world.
    const enemies = [...this.players.values()].filter((q) => q !== p && !q.awaitingLoad && !q.away && (useBlock || q.alive) && q.team !== p.team);
    if (kind === 'start' || !enemies.length) {
      return useBlock ? candidates[0]! : list[Math.floor(this.opts.random() * list.length)]!;
    }
    let best = candidates[0]!, bestD = -1;
    for (const s of candidates) {
      let near = Infinity;
      for (const e of enemies) {
        const st = e.sim.walker.state;
        near = Math.min(near, (st.x - s.position[0]) ** 2 + (st.y - s.position[1]) ** 2 + (st.z - s.position[2]) ** 2);
      }
      if (near > bestD) { bestD = near; best = s; }
    }
    return best;
  }

  /** A spawn at its slot (`pick`), or `place` given: the waiting room's rebuild in place (`rebuildWaiting`). */
  private spawn(p: Player, kind: 'start' | 'respawn', place?: { at: V3; yaw: number }): void {
    this.stopVictory(p.id);
    this.victoryOffers.delete(p.id);
    const slot = place ? null : this.pick(p, kind);
    const after = p.sim.seq;
    const sim = this.newSim(p.sim.ai);
    sim.seq = after;
    const at: V3 = place ? place.at : slot ? [slot.position[0], slot.position[1] + SPAWN_LIFT, slot.position[2]] : [0, 0, 0];
    // The facing: step k points along (sin 45k, -cos 45k); `Pose.yaw` faces (-sin yaw, -cos yaw).
    const yaw = place ? place.yaw : slot ? wrapYaw(-slot.step * 45) : 0;
    // PL-2: the floor is picked as the walking tick picks it -- the probe from the feet + `probeLiftOf('stand')`, the
    // tick's one origin (`FUN_005b0840`; research 86 s6.5) (`FUN_005b0420` ->
    // `FUN_005b5d40` L470230-470240: the highest hit at or under origin + 1; research 86 s6.3) -- on the record lifted a
    // unit (`FUN_002b8100` L158793). From the eye (feet + 16.4) it stood four Frostfire records on an object 12 up.
    // The page's respawn (`walk.ts` `respawn`) places from the same origin.
    sim.walker.place(at[0], at[1] + probeLiftOf('stand'), at[2]);
    sim.walker.state.yaw = yaw;
    p.sim = sim;
    p.spawnClock = this.serverClock;                             // LATER 157: the skip report held to the ticks since the spawn
    p.pressLock = null;                                          // LATER 72: a new body holds no reload's press
    this.watchMoves(p);                                          // PAR-28: the new mover's climbs and ladders
    p.alive = true;
    // OBF-16: the score rows carry `alive` (the board's dim, `FUN_0022a290` D:L79022-79024: the live +0xe1 bit 4, read at
    // each rebuild); a body made alive -- a respawn press, the ARMORY's ready, a rule's respawn -- re-sends them.
    this.scoreDirty = true;
    p.raise = false;                                             // OBF-14: a new body asks no raise until its controller does
    p.raised = false;                                            // ER-2: nor its page (the body is constructed down, D:L419662)
    p.deadAtLoad = false;
    p.diedSeq = -1;                                              // NCW-2 B-trade: a new life trades nothing of the last
    p.tradeRounds = [0, 0];                                      // nor spends its last life's rounds (Codex's P1, PR #698)
    p.deathClip = null; p.deathCause = null;                     // PF-28: no corpse once alive
    p.spawnedIn = this.roundSerial;
    p.health = freshHealth();
    // A full kit at every spawn, a round's start included: `FUN_00598b90(p, 0)` (the round's reload, `FUN_00223680`
    // L75931) rebuilds the actor through `FUN_00599b60` (L455604, called at L455158), whose `FUN_00599f00` (L455719,
    // called at L455674) gives the type's `default_weapons` at `Ammo_Capacity` x `NumMags` (research 91 section 4.3):
    // the type's kit (R94.7; the side's chosen type, SEAL 1 / TERRORIST 1 without one: R95.5), or in the page's own
    // room the page's developer kit.
    // Protocol 7: the type's kit as the weapon select last wrote it (`p.next`, `FUN_0023e5e0`), else its own.
    // Protocol 9: the body is rebuilt as the type chosen for it (`ChangeCharacterType`, research 95 §4.2 S1a).
    p.char = p.nextChar;
    const chosen = p.next ?? this.typeKit(p);
    p.loadout = chosen;                                          // OT.R81 (BTL.R4): a CPU's kit is a player's, its picks checked as theirs
    p.records = kitRecords(this.kits?.table ?? null, p.loadout);
    p.mags = [ringFor(p.records[0]), ringFor(p.records[1])];
    // A still reload's hold runs on the record's ReloadTime (`FUN_005a82e0` 462935-462940): `reloadHoldPeriod` over the
    // same `reloadSeconds` the page's `Fire` announced, so the room's mover holds exactly as long as the page's (research
    // 150 F2, review F-A); its family only gates the period, which no after-shot or round-mode record changes on the disc.
    p.sim.holdPeriod = (clip, w) => {
      if (!clip.includes('reload')) return undefined;
      const record = p.records[w], v = p.sim.walker.state;
      const family = reloadFamily({ item: w ? 'pistol' : 'rifle', id: record.id });
      return reloadHoldPeriod(family, reloadSeconds(this.clips?.clips ?? null, this.clips?.table ?? null, p.sim.walker.posture, reloadMoving(v.vx, v.vy, v.vz), family, record.reloadTime ?? 0));
    };
    p.sim.holdPass = () => this.placingPass(p);                 // PAR-74: `Place claymore`'s pass, from the room's bomb
    // The new body's kit is at rest: no reload playing, the rifle in hand, the cone at its floor (`Accuracy.reset`).
    p.reloadUntil = [-1, -1];
    p.lockClock = [-1, -1];
    p.lastThrow = -1e9;
    p.throwClock = -1e9;
    p.throwStart = null; p.throwStartClock = -1e9; p.throwHoldSeq = -1; p.holdStartsSeen = p.sim.walker.holdStarts; p.placeStart = null;
    p.dismount = null;                                           // LATER 104: none pending on a new body
    p.release = null;                                            // LATER 109: no reversed clip on a new body
    p.releaseSpan = null;
    p.lastFire = [-1e9, -1e9];
    p.fireSchedule = [FIRE_GATE_NONE, FIRE_GATE_NONE];          // LATER 588 (a): a new body's chain starts fresh
    p.fireClock = [-1e9, -1e9];
    p.weapon = initialFirearmSlot(this.kits?.table ?? null, p.loadout);
    sim.weapon = p.weapon; sim.walker.hand = p.weapon;
    p.cone = new ShotCone(p.records[p.weapon]);
    p.lastLanding = null;
    p.equipmentSlots = equipmentSlotsOf(p.loadout, this.kits?.table ?? null); // each slot's fresh ring, research 361 §1
    p.rounds = new KitRounds(this.kits?.table ?? null, p.loadout);   // M4: every round slot full
    p.rocketWaitUntil = -1;
    p.held = null; p.heldNext = null; p.heldReadyAt = -1; p.firearmReadyAt = -1;
    p.launcherSet = null;                                        // PAR-81: a new body holds no launcher's set
    p.launcherUp = null;                                         // PAR-83: nor a launcher up
    p.movingLowerUntil = -Infinity; p.raiseAfterStick = null;    // PAR-83, F1: nor its moving lower, nor a raise after it
    p.roundWaitUntil = -1;
    p.lockTimer = [-1, -1];
    p.lockKind = [null, null];
    p.reloadLife = [null, null];                                 // PF-18: no clip and no flinch on a new body
    p.flinchFrom = -1; p.flinchUntil = -1; p.flinchAir = -1; p.flinchGatesReload = true; p.flinchCutFrom = -1;
    p.flinchKeptFrom = -1; p.flinchKeptUntil = -1;                // N1: no cut flinch's span on a new body
    p.flinchUnder = null;                                         // LATER 363: nor a covered flinch
    p.volley = null;
    p.qHitAt = -Infinity;                                        // PF-37: the new body's memory clear (FUN_00553ea0 L419774)
    p.history.length = 0;
    const s = sim.walker.state;
    // NET-RES.R11 (b): a seat back from a hold, its body having left alive: its health and kit as that body left them --
    // the type, loadout, records, rings, round slots and each equipment slot's own ring (#481: the pouch is their total,
    // research 361 §1) -- over the fresh kit, the hand the restored kit's initial firearm (research 362 §2); its page told
    // them (`resume`).
    const back = p.returnFrom;
    if (back) {
      p.returnFrom = null;
      p.health = back.health; p.char = back.char; p.loadout = back.loadout; p.records = back.records;
      p.mags = back.mags; p.rounds = back.rounds; p.equipmentSlots = back.equipmentSlots;
      p.weapon = initialFirearmSlot(this.kits?.table ?? null, p.loadout);
      sim.weapon = p.weapon; sim.walker.hand = p.weapon;
      p.cone = new ShotCone(p.records[p.weapon]);
    }
    // SEGMENT-BODY part 4 (fresh review 1's F1): the weapon line's length is the kit's held model's (`FUN_0054e8f0`
    // D:L416869-416870), so the new body holds the kit's two firearm models (`heldWeaponModels`, by `slotModel`).
    sim.walker.heldModels = heldWeaponModels(this.kits?.table ?? null, p.loadout);
    p.lastHurt = null;                                           // NET-RES.R11 (a): a new body has taken no damage
    this.broadcast({ type: 'spawn', id: p.id, ...this.botMark(p.id), at: [s.x, s.y, s.z], yaw, after, kit: [...p.loadout], char: p.char, ...(this.botCharacter(p.id) ? { character: this.botCharacter(p.id)! } : {}) });
    if (back) this.send(p.id, this.resumeEvent(p));              // NET-RES.R11 (b): the page's health, kit, rounds and pouch
    if (kind === 'respawn') this.voiceRespawn(p.id);             // SVC-20c: event 0x23's ask, the remembered +0xc4
    this.ruleEvent({ name: 'player.spawn', player: p.id, ...(this.ruleSpawner !== null ? { id: this.ruleSpawner } : {}) });   // FCW-31
  }

  /**
   * The character type's own kit for a player (R94.7): its next type's (`nextChar`, or `char` when given; SEAL 1 /
   * TERRORIST 1 without a choice, R95.5) -- in the page's own room the page's developer kit when it asked for one
   * (`soloKit`) -- the kit a spawn gives when no pick is held, and the one the weapon select's picks are replayed from.
   */
  private typeKit(p: Player, char: number = p.nextChar): Loadout {
    // solo: the developer's `&kit=` (web sprint 4, an instrument) -- no row names it (P33's count, reported)
    const base = (this.opts.solo ? this.opts.soloKit?.() : null) ?? typeLoadout(this.kits?.map ?? null, p.team, char) ?? BAKED_LOADOUT;
    return equipmentLimitKit(base, this.kits?.map?.valves ?? new Map(), p.team, this.opts.eqLimit ?? 0);
  }

  /** The trusted created game's restriction, held across seats and rounds (research 362 §3). */
  equipmentLimit(): number { return this.opts.eqLimit ?? 0; }

  /** A central world report may refresh a staging room; no client request can call this or change a launched game. */
  setEquipmentLimit(limit: number): boolean {
    if (this.launched || this.inRound()) return false;
    const next = equipmentLimit(limit);
    if (next === this.equipmentLimit()) return false;
    this.opts.eqLimit = next;
    for (const p of this.players.values()) { p.next = null; p.picks = []; p.lobbyChoice = false; }
    return true;
  }

  /**
   * Protocol 9 (web sprint 5 S2): whether a player of `team` may be type `char` on this map -- one of its side's ARMORY
   * columns (`@s2u/scene` `armoryTypeAllowed`: the map's `chartype.rdr` types, at most four, the fourth where the
   * map's `InWhichAOP` is 0, R95.6 as corrected, and on 51-83 too by the owner's ruling OT.R91); without the map's kits
   * only the default.
   */
  private typeAllowed(team: Team, char: unknown): boolean {
    return armoryTypeAllowed(this.kits?.map ?? null, team, char);
  }

  /**
   * Whether a round is being played (`play`, `expired`, `decided`): the in-round WEAPON EXCHANGE's gate applies then
   * (`loadout`). Outside one -- a classic room waiting for both sides, the round-end interval -- the page's requests
   * are the ARMORY's, which W5.R1 opens on taking a seat (a join while the room waits or in the interval) -- no longer
   * for a seated player between rounds since the owner's ruling of 2026-10-02 (INT.R3) -- the game's being the
   * lobby's, outside a round (research 95 §4.1), for the next spawn (ARMORY_OUTSIDE_ROUND_READING).
   */
  private inRound(): boolean {
    return this.state.phase === 'play' || this.state.phase === 'expired' || this.state.phase === 'decided';
  }

  // ---- the weapon select's picks (protocol 7; web sprint 4 M9, W4.R6) ----

  /**
   * A `loadout` request: the page's confirmed picks, every one since its match began, replayed in order from the type's
   * own kit through the menu's rules (`applyPicks`: the slot, the id, `slotLocked`, `selectable` for the player's side
   * under the map's valves, `pick` with its dependants) -- the kit is computed here, never taken from the page. Kept as
   * the type's next kit (`next`: the next round's rebuild takes it, R94.3) and answered with the kit held; a refused list
   * changes nothing and is answered with why and where. A malformed list (not an array, a pick without a whole slot and
   * id, more than `MAX_LOADOUT_PICKS`) is refused as `slot` (BL-2: never thrown). Without the arsenal (a test, a disc
   * without `ZWEAPON.ZAR`) every item is `unknown`, and the kit is the baked one.
   *
   * Protocol 9 (web sprint 5 S2): `char`, the character type the picks replay from and the next spawn takes (the
   * ARMORY's `ChangeCharacterType`, research 95 §4.2 S1a) -- one of the side's columns on the map (`typeAllowed`), else
   * refused `type`; absent, the type held. The answer names the type held (`char`).
   *
   * A spectator's request (it has no kit, and is not answered) carries `types`, its ARMORY choice per side while it
   * waits: kept as its hello's were (`helloTypes`), so the seat a promotion gives it is the type chosen since (`seat`
   * checks it against the side then; W5.R1, the ARMORY before the first spawn). One that arrives after the promotion (a
   * player's request with `types` and no `char`: the page sends `types` only as a spectator) is `lateTypes`.
   */
  private loadout(id: number, ev: { picks: unknown; char?: unknown; types?: unknown }): void {
    const p = this.players.get(id);
    if (!p) {
      if (ev.types !== undefined && this.lobby.member(id)?.role === 'spectator') this.types.set(id, Room.helloTypes(ev.types));
      return;
    }
    if (ev.types !== undefined && ev.char === undefined) { this.lateTypes(p, ev.types); return; }
    // An accepted change is the player's activity (the S3 repair): a seat held in its ARMORY (`arming`, not alive) runs
    // no commands, and must not be idled out while it chooses (`idle`, ARMORY_SEAT_READING).
    const answer = (refused: { reason: LoadoutRefusal; at: number } | null): void => {
      if (refused === null) p.lastActive = this.opts.now();
      this.send(id, { type: 'loadout', kit: [...(p.next ?? this.typeKit(p))], refused, char: p.nextChar });
    };
    if (p.loadoutCredit < 1) { answer({ reason: 'rate', at: 0 }); return; }
    p.loadoutCredit--;
    const picks = picksOf(ev.picks);
    if (!picks) { answer({ reason: 'slot', at: 0 }); return; }
    const char = ev.char === undefined ? p.nextChar : ev.char;
    if (!this.typeAllowed(p.team, char)) { answer({ reason: 'type', at: 0 }); return; }
    const type = char as number;
    // The menu opens only dead or a ghost (`canOpen`, `FUN_001f7ff0` L56648-56661): a living player's request in a round
    // is refused -- but for the list and type already held (a reconnect's re-send, seated alive), answered as held.
    // Outside a round the request is the ARMORY's (`inRound`), taken for the next spawn.
    if (p.alive && this.inRound()) {
      const same = type === p.nextChar && picks.length === p.picks.length && picks.every((q, i) => q.slot === p.picks[i]!.slot && q.id === p.picks[i]!.id);
      answer(same ? null : { reason: 'alive', at: 0 });
      return;
    }
    // W5.R1: the ARMORY -- the type -- is outside a round only (a seat's: INT.R3, 2026-10-02); the dead player's in-round menu is WEAPON EXCHANGE, which
    // changes the kit, never the type (research 94 §B2): a player that has spawned in this round keeps its type until
    // the round is over (a respawn room's respawn included). A ghost seated in the round has not spawned in it, and
    // chooses its type as a joiner does (ARMORY_OUTSIDE_ROUND_READING).
    if (this.inRound() && p.spawnedIn === this.roundSerial && type !== p.nextChar) { answer({ reason: 'round', at: 0 }); return; }
    if (!this.kits) {
      if (picks.length) { answer({ reason: 'unknown', at: 0 }); return; }
      p.next = null;
      p.picks = [];
      p.nextChar = type;
      if (!this.launched) p.lobbyChoice = true;              // ARMORY-SAVE: the lobby's own choice (IDFromBriefing 1)
      answer(null);
      return;
    }
    const valves = equipmentLimitValves(this.kits.map?.valves ?? new Map<string, number>(), this.opts.eqLimit ?? 0);
    const out = applyPicks(this.kits.table.arsenal, valves, p.team, this.typeKit(p, type), picks);
    if ('refused' in out) { answer({ reason: out.refused, at: out.at }); return; }
    p.nextChar = type;
    p.next = picks.length ? out.loadout : null;
    p.picks = picks;
    if (!this.launched) p.lobbyChoice = true;                // ARMORY-SAVE: the lobby's own choice (IDFromBriefing 1)
    answer(null);
  }

  /**
   * A spectator's `types` arriving after the room promoted it (the S2 review, round 2): the page sent it while waiting
   * and, promoted, believes the room holds it -- its seat's re-send (`NetPage.resendPicks`) compares its type with the
   * types it last sent and sends nothing when they match. So the one for the player's side is taken as its type, as a
   * type-only request would be, under the same gates (a type the side offers; not alive in a round; not a type change
   * for a player that spawned in this round) -- but never answered: the page keeps no request for it, and an answer
   * would be handed to the wrong one (`NetPage.inFlight`, answers in order). A new type starts from its own kit (the
   * page's list went with its change, `PlayerLoadout.setType`); the type held keeps its picks. Ignoring it instead would
   * leave the room on the type seated at the promotion while the page, never told, replays its picks from another.
   * A gate that holds it back -- a respawn room's promotion spawns the seat alive at once; a classic one promoted in the
   * round-end interval spawns at the next round's start, before these may arrive -- is corrected on the page by the
   * promotion's `char` (the seat's type) and the request the page sends for its own type then, refused `round` or
   * `alive` through the normal path (S2 round 3; research 95 §8, ARMORY_OUTSIDE_ROUND_READING).
   */
  private lateTypes(p: Player, types: unknown): void {
    const char = Room.helloTypes(types)[p.team];
    if (char === undefined || !this.typeAllowed(p.team, char) || char === p.nextChar) return;
    if (this.inRound() && (p.alive || this.spawnedThisRound(p))) return;
    p.nextChar = char;
    p.picks = [];
    p.next = null;
  }

  /**
   * KIT-HELD (the player report of 2026-11-06, "the loadout resets to the default M4 after death"): the seat's own page
   * told what the room holds for its next spawn -- its type (`nextChar`), its picks (the list a `loadout` request
   * replays, the one the page's next confirm extends) and the kit they replay to (`next`, else the type's own) -- as
   * `kitHeld`, a unicast of its own: never an unsolicited `loadout`, whose answers the page pairs with its requests in
   * order. The front end's match page starts with no kit after the lobby's hand-off (the lobby ARMORY's answers went to
   * the lobby's socket; a stored record is applied here, `launchStored`), and without this its WEAPON EXCHANGE opened on
   * the type's own kit and its confirm replayed from it -- every lobby pick lost at the next spawn. The original keeps
   * the kit on the type across rounds and respawns (`FUN_0023e5e0` writes the confirm to the type's kit, `FUN_00599f00`
   * rebuilds the body from it at each spawn; research 94 §A6, R94.3); this tells the page that state, no more. Told at
   * the launch (`firstRound`), at the page's `loaded` (`loaded`: the match page's own, after the hand-off), at the load
   * hold's ceiling to each seat still loading (`barrierPassed`, LATER 726) and after the welcome or promotion of a seat
   * whose kept record restored its picks (`seat`). A CPU seat's controller is not told.
   */
  private tellKitHeld(p: Player): void {
    if (this.conns.get(p.id)?.cpu === true) return;
    this.send(p.id, { type: 'kitHeld', team: p.team, char: p.nextChar, picks: p.picks.map((q) => ({ slot: q.slot, id: q.id })), kit: [...(p.next ?? this.typeKit(p))] });
  }

  /** Whether the player spawned in the round in play (the ARMORY's type is held to the round's end then: W5.R1). */
  private spawnedThisRound(p: Player): boolean {
    return this.inRound() && p.spawnedIn === this.roundSerial;
  }

  /**
   * Protocol 7: each departed player's type picks (`leave` or `takeOver` -> `seat`, a reconnect); protocol 9 its type,
   * and the round serial it last spawned in (a type spawned in the round in play is held to its end: W5.R1). Keyed by
   * the page's session token alone (S2 round 4), each with the time it left (`at`: `KEPT_RECONNECT_READING`).
   */
  private readonly kept = new Map<string, KeptRecord>();
  /** S2 round 4: each connection's session token (its hello's, when well formed), and each token's live connection. */
  private readonly sessions = new Map<number, string>();
  /** OT.R59 (RECONNECT-GHOST): each connection's account (`hello`'s `as.account`, the bridge's seat account); null a guest's. */
  private readonly accounts = new Map<number, number | null>();
  /**
   * Each connection's client index (`+0xfc8`, DME's "get client ID" `FUN_0030d5a0`; research 179 section 9.2, V1 #6):
   * room-wide, the lowest free from 0 at the join, kept for the seat's life -- a takeover hands it on, a leave frees
   * it. The classic round start takes the side's record `clientIndex % count` (`pick`). A spectator holds one too, as
   * every DME client does; past 24 members (the room's queue, not the game's table) the next is 24 and up.
   */
  private readonly clientIndex = new Map<number, number>();
  private readonly live = new Map<string, number>();
  /** The connections whose hello said the page opens the ARMORY on its seats (`armory`, ARMORY_SEAT_READING). */
  private readonly armoryPages = new Set<number>();
  /** #337: the connections whose hello read the Cranes section (`cranes`); a page without it is sent none. */
  private readonly cranePages = new Set<number>();
  /**
   * The S3 repair: the session tokens whose player left (`leave`), each with the time it left -- a record of its choices
   * kept or not -- so a reconnect within `KEPT_RECONNECT_READING` is known as one (`seat`); taken once.
   */
  private readonly returning = new Map<string, number>();
  /**
   * Whether the last `seat` was a returning page's (a departed player's record taken, or its leave in `returning`): a
   * reconnect, no first seat for the ARMORY (ARMORY_SEAT_READING).
   */
  private lastSeatReturned = false;
  /** KIT-HELD: whether the last `seat` restored a kept record's picks (its page is told them: `tellKitHeld`). */
  private lastSeatKeptPicks = false;
  /** Protocol 9: each connection's hello types, one a side (`helloTypes`), read when the room seats it (`seat`). */
  private readonly types = new Map<number, { seal?: number; terrorist?: number }>();
  /** NCW-10 (an instrument): each connection's page build and build time, its hello's (`clientBuildOf`, `clientBuiltAtOf`), for `roundReport`'s signals. */
  private readonly builds = new Map<number, { build?: string; builtAt?: string }>();
  /**
   * LATER 85 / 266 (the review's F3): the connections the room was told are late (`hello`'s `as.late`, +0xcc), whatever
   * their role, until their `loaded` -- so a seat made later (a promotion) awaits its console's load too (`seat`).
   */
  private readonly lateMembers = new Set<number>();

  /**
   * RC4 (the merge controller's rulings RC3, RC4, Q1 and Q2 of 2026-10-24, logged for the owner in the BOTS-LAND
   * plan's Log): the port's own mark (not the original's `+0xcc`) of the connections that joined a launched game
   * (`hello`'s `as.late`), kept past their `loaded` -- unlike `lateMembers` -- and across a takeover (`hello`), so a late
   * joiner promoted after its page loaded (by `RoomBots.seatQueued`, BTL.R8, or by any leave) still enters a respawn
   * game dead at load (`addPlayer`), as #474's late joiner does. Cleared at its first entry dead at load, its leave,
   * the lobby's return and a new match's rebuild (`startRound`).
   */
  private readonly joinedLate = new Set<number>();

  /**
   * The name a kill line gives a weapon (research 91 §10: `FUN_003d19a0` L324284, the record whose `+0x7c` id matches,
   * its `DisplayName` at `+8`): the arsenal's item by id; without the arsenal's item, the record's own name.
   */
  private weaponName(itemId: number, fallback: string): string {
    return this.kits?.table.arsenal.items.get(itemId)?.displayName ?? fallback;
  }

  private respawnReady(p: Player): boolean {
    // Classic: no respawn -- the respawn option is off (`FUN_002a7560` L149405-149431); the dead spectate until the next
    // round (`FUN_005979a0` L454484-454489). Only the waiting room (CLASSIC_WAITING_PLACEHOLDER) lets one up.
    if (this.opts.rules === 'classic' && this.state.phase !== 'waiting') return false;
    if (this.ruleOut.has(p.id)) return false;                    // FCW-31: a rule put it out of this round (empty without a host)
    // LATER 266 (and N3: a held seat back dead, `start`): the load's death stamps the clock but has alpha zero already (research 322 §5.3); the original
    // controller's strict >5 s gate applies (`FUN_00592560` D:L451699-451724), without the ordinary death's fade.
    // Never over the launch's load hold (the takeover review's F1): round 1 starts from the level's init with no revival
    // before it (`FUN_002a7d40` D:L50946, LATER 274); `startRound` keeps the load death and its age for round 1.
    if (p.deadAtLoad) return this.state.phase !== 'over' && !(this.state.phase === 'waiting' && this.state.hold !== undefined) && p.diedAt >= 0 && (this.tick - p.diedAt) / TICK_HZ > RESPAWN_PRESS_S;
    return this.state.phase !== 'over' && p.diedAt >= 0 && (this.tick - p.diedAt) / TICK_HZ >= Math.max(RESPAWN_PRESS_S, RESPAWN_FADE_S);
  }

  // ---- the start of a round, a throw, a charge (SVC-23b) ----

  /**
   * SVC-23b: the room's clock an event of `p`'s is dated at -- the command just run's own arrival had the line not
   * stalled: its count (`Player.ran`) plus the player's best recent offset between the room's clock and its command
   * clock (`Player.lagFloor`, `LAG_FLOOR_WINDOW_TICKS`), held within `FIRE_STALL_CREDIT_TICKS` of `serverClock` and never
   * after it. Any dating in that range keeps the window bound, since the schedule (`fireClock`, `throwClock`) only moves
   * forward by the cycle; the dating decides only what an honest burst keeps.
   */
  private eventClock(p: Player): number {
    const floor = Math.min(p.lagFloor.cur, p.lagFloor.prev);
    return Math.min(this.serverClock, Math.max(this.serverClock - FIRE_STALL_CREDIT_TICKS, p.ran + floor));
  }

  /**
   * The body a non-timed start (a charge, a launcher's round, a rocket) is measured from: the server's mover now, the
   * root's slack of its last command (or the stance's alone before any).
   */
  private startBody(p: Player): StartBody {
    const s = p.sim.walker.state;
    return {
      feet: [s.x, s.y, s.z], yaw: s.yaw, posture: p.sim.walker.posture, moveRoot: this.aimRootOf(p), peek: p.sim.moves?.peek() ?? 0,
      groundNormalY: p.sim.walker.floorNormal[1],
      rootSlack: p.cone.frame(p.sim.seq)?.rootSlack ?? ROOT_POSE_SLACK_PLACEHOLDER,
    };
  }

  /**
   * SVC-23b (research 169 §7 measure 5 (b)): whether a start point is refused -- `far`, past `START_REACH_PLACEHOLDER`
   * (and the root's slack) from the body's head (`placed`: across from its feet); `walled`, a wall between that head
   * (kept on the body's side of a wall along the page's `headEye` line, PF-05) and it, or between the
   * body's look-at target and it (BL-3's, kept for a round and a throw). A set charge's point is the
   * page's cast down from the hand (`grenade.ts` `placeCharge`): for it the path runs from the head down to the hand's
   * height over the body, across at it, then down to the charge. Null: it may leave from there.
   */
  private startRefused(b: StartBody, from: readonly number[], placed = false, admits?: StartAdmits): 'far' | 'walled' | null {
    const exact = headPoint(b);
    const reach = START_REACH_PLACEHOLDER + b.rootSlack;
    const off = placed ? Math.hypot(from[0]! - b.feet[0], from[2]! - b.feet[2]) : Math.hypot(from[0]! - exact[0], from[1]! - exact[1], from[2]! - exact[2]);
    if (!(off <= reach)) return 'far';
    const to: V3 = [from[0]!, from[1]!, from[2]!];
    // PF-05 (defence in depth): the head stands off the body's axis (FUN_0029ae50: 2.5 ahead, 4.9 prone), and a body
    // pressed to a wall at BODY_RADIUS 3.5 has it past the face. PF-16's prone fan keeps a body crawled into a wall 8.0
    // off it, but it reaches along the travel, not the facing: strafing prone along a wall (3.12 off) or peeking, the
    // head still passes it (research 217 s2.4), so this line stays. For every
    // start, a placed charge's included, the head is kept off a wall along the page's own line (`headEye`, shared: level
    // at the head's height from the body's axis to the exact head), so the eye the page keeps short of a wall is the head
    // the room measures from, and every start is measured from where the body itself reaches. The room tests every
    // polygon on that line, not only the camera's (the re-check of c67c8747): a wall the camera skips would leave the head
    // past it, and the placed charge's path below has no other line from the body. The reach above stays measured from
    // the exact head; the axis at the look-at target's height is BL-3's second line, below. Owed (not PF-16's): the
    // room's line stands at the stance root's eye (prone 5.4), the page's at the posed root's (about 5.77), so a wall top
    // between the two is met by one and not the other. LATER 366 (OT.R80): the two lines are one source with the page's
    // (`net/startLine.ts`), which `Fire.ray` asks before a round leaves its muzzle: a walled one leaves from this head.
    if (placed) {
      const { head } = startLines(this.map.grid, b);
      // The page finds a charge by a cast straight down from its hand (`grenade.ts` `placeCharge`): the hand over the body
      // at `CHARGE_HAND_HEIGHT_PLACEHOLDER` (never above the head), the column at the hand (`placeGround`, no lift). So
      // the path is the page's: from the head down to that height over the body, across at it to the point over the
      // charge, then the drop to the charge. It takes a charge past a ledge's edge or under a low table, and refuses one
      // on the far side of cover the hand's height does not clear (the review and re-review of 2026-10-04).
      const top = Math.min(head[1], b.feet[1] + CHARGE_HAND_HEIGHT_PLACEHOLDER);
      const hand: V3 = [head[0], top, head[2]], over: V3 = [to[0], top, to[2]];
      const grid = this.map.grid;
      // AD-4: the charge sits on its surface (`FUN_005bc730`, no rest lift), so the drop stops the ground check's slack
      // short of the point, on the side it comes from (down from the hand, or up to a table over it): the surface it rests
      // on is `chargeRests`', not a wall. Level with the hand there is no drop: the line across ends on the point, in the
      // ledge's own plane (a drop started there would meet the ledge at once).
      const drop = top === to[1] ? null : [to[0], to[1] + (top > to[1] ? 1 : -1) * CHARGE_GROUND_SLACK_PLACEHOLDER, to[2]] as V3;
      return segmentHit(grid, head, hand) || segmentHit(grid, hand, over) || (drop !== null && segmentHit(grid, over, drop)) ? 'walled' : null;
    }
    // LEAN-WALLED (issue #752 defect 2, research 390): `admits`, a round's (`fireAt`): what its flight meets; else every polygon.
    return startWalled(this.map.grid, b, to, admits) ? 'walled' : null;
  }

  // ---- fire (W3.R4) ----

  /**
   * A round (W3.R4), decided at its command (`timed`): the weapon is the server's mover's (the kit's selected slot
   * `+0x824`, set only by the swap: `FUN_005c0fd0` 476592-476625, `FUN_005bd030` 474178), never the event's; its rate
   * and its reload's lock count on the player's own command clock (`Player.ran`); the round must leave from the body,
   * not through a wall; its eye and aim must be the page's camera's and inside the cone the server's own run of the
   * accuracy allows (`ShotCone`, OWNER-3).
   */
  private fire(p: Player, ev: Extract<ClientEvent, { type: 'fire' }>): void {
    if (this.victoryPlaying.has(p.id)) return;
    if (!p.alive || this.state.phase === 'over') {
      // NCW-2 B-trade: a round the dead shooter's page sent before it could know of the death is decided as if he lived,
      // on his last command run alive (`tradeFrame`); any other refused, as before.
      const traded = this.state.phase === 'over' ? null : this.tradeFrame(p, ev.seq);
      if (!traded) return this.dropped('fire', 'not alive', p);
      // The review's F1: a refusal of it under `trade: <reason>` (`dropped`); decided and refused counted per seat.
      this.trading = p; this.tradeRefused = false;
      try { this.fireAt(p, { ...ev, seq: p.diedSeq }, traded, undefined); } finally { this.trading = null; }
      const t = p.signals.trade ??= { decided: 0, refused: 0 };
      if (this.tradeRefused) t.refused++; else t.decided++;
      return;
    }
    const frame = p.cone.frame(ev.seq);
    const seat = p.mounted !== null ? this.turrets[p.mounted] : undefined;
    if (!frame) {                                                // not a command this body ran
      if (seat) seat.ammoDirty = true;                           // TURRET-AMMO F5: a dropped turret round re-syncs the page
      return this.dropped('fire', 'no frame', p);
    }
    // LATER 173: a round named while the mount's clip plays (its `NoFire`, recorded in the frame by `aim`) is refused before
    // anything is spent -- `turretRound` spends first -- and the page told (`stale`): its rifle round, sent before it heard the
    // mount, refunded (`sentFires`); a turret round re-synced (`turretFireOwed`). The original fires nothing through the clip.
    if (seat && (frame.turret ?? null) !== null && !frame.fire) {
      this.send(p.id, { type: 'stale', request: 'fire', seq: ev.seq });
      this.turretFireOwed(p, ev);
      return this.dropped('fire', 'nofire', p);
    }
    // LATER 107 (MOUNT_ROUND_AT_COMMAND_ADAPTATION): a round named on a command run before the mount (its frame holds no
    // turret) is the hand's, on the hand's path with its record lent to the cone; the turret's record given back after.
    if (seat && (frame.turret ?? null) === null) {
      p.cone.setWeapon(p.records[frame.weapon]);
      this.fireAt(p, ev, frame, undefined);
      p.cone.setWeapon(seat.record ?? p.records[p.weapon]);
      if (seat.word && frame.count <= seat.mountCount) this.mountKitLate(p, seat);   // A1 (LATER 218): its after-shot at the take
      return;
    }
    // LATER 174 (DISMOUNT_ROUND_AT_COMMAND_ADAPTATION): a round named on a command run mounted (its frame holds a turret),
    // decided after the room took the release, is that turret's, on its path with its record lent to the cone and the
    // hand's given back; held by another since, refused 'released'. A round spent is told to every page (no occupant to
    // tell its magazines: `tellAmmo`).
    const was = frame.turret ?? null;
    if (!seat && was !== null) {
      // The fresh review's F2: a round named inside the mount clip (its `NoFire`) is refused here too, before `turretRound`
      // spends, as LATER 173's check above refuses it while mounted (the turret's count untouched: nothing owed it).
      if (!frame.fire) {
        this.send(p.id, { type: 'stale', request: 'fire', seq: ev.seq });
        return this.dropped('fire', 'nofire', p);
      }
      const held = this.turrets[was];
      if (!held || held.occupant !== null) return this.dropped('fire', 'released', p);
      const ammo = held.ammo;
      if (held.record) p.cone.setWeapon(held.record);
      this.fireAt(p, ev, frame, held);
      p.cone.setWeapon(p.records[p.weapon]);
      held.ammoDirty = false;
      if (held.ammo !== ammo) this.broadcast({ type: 'turret', ...turretWire(held) });
      return;
    }
    this.fireAt(p, ev, frame, seat);
  }

  /**
   * NCW-2 B-trade (the trade after death; reading pending review; research 193 §12.11, research 223 §4
   * `TRADE_WINDOW_CAP_MS_ADAPTATION`): the frame a dead shooter's round named at command `seq` is judged on, or null
   * (refused `not alive`). The original's receiving console applies a dead attacker's `Hit` (`FUN_002bbbd0`
   * D:L160819-160850; `FUN_005a1b80` reads no alive bit of the attacker, D:L459519), so the trade after death was the
   * console's. The port's room decides a round only once the command after it has run (`due`), on the body as it stands,
   * and a round travels with its command, so every round in flight at the kill names a command the room ran on the dead
   * body (NCW-5, `refusalRepro.test.ts`). Taken: a round named at most `tradeWindowTicks(p.pingExact)` - 1 commands past
   * the last command run alive (`diedSeq`, `kill`'s) -- one the page sent before it could know, by the room's own measure
   * of the seat's round trip, never past the rewind's cap -- and decided no later than `tradeExpiryTicks` after the kill
   * on the room's own clock (`diedAt`; Codex's P1 on PR #698: a page silent since its death trades nothing late). Judged
   * on that last alive command's frame -- its feet, eye,
   * look, cone, posture and weapon (the corpse's commands, run dead, lay none: `run`) -- its count moved on by the
   * commands the page ran since, so the rate and the reload's lock count on the page's clock as a living round's do; not
   * from a turret (`kill` releases it). Everything after is a living round's (`fireAt`): the cone, the muzzle, the rate,
   * the magazine (the rounds in it as the death found them, `tradeRounds`: a classic death's drop empties the rings,
   * Codex's P1 on PR #698), the rewind and the victim's own rules (`bulletHit`: a victim already dead is a miss); a kill it makes is
   * the dead shooter's (`kill`'s credit, as `FUN_005a1b80` names the attacker the killer, D:L459597-459607). The round is
   * re-keyed to that command (`fire`), so a `stale` told for its refusal names it, not the page's own command: the page,
   * dead, refunds nothing it needs (its kit is new at the spawn). The frame takes neither the page's look nor movement
   * since, nor the bloom of the traded rounds before (its stored cone is that command's): a shooter who turned, moved or
   * fired on through the window may be refused at the cone, the eye or the muzzle -- under `trade: <reason>` (the
   * review's F1), counted in `signals.trade`; the cone is not loosened for it (the lane's question).
   */
  private tradeFrame(p: Player, seq: number): AimFrame | null {
    if (p.diedSeq < 0 || p.mounted !== null) return null;
    // Codex's P1 on PR #698: and in the room's time -- decided no later than `tradeExpiryTicks` after the kill (`diedAt`,
    // set in the same `kill` as `diedSeq`, which `spawn` clears), so a page silent since its death trades nothing late.
    if (p.diedAt < 0 || this.tick - p.diedAt > tradeExpiryTicks(p.pingExact)) return null;
    const past = seq - p.diedSeq;
    if (!(past >= 0 && past < tradeWindowTicks(p.pingExact))) return null;
    const f = p.cone.frame(p.diedSeq);
    if (!f || (f.turret ?? null) !== null) return null;
    return { ...f, count: f.count + past };
  }

  /**
   * LATER 170, LATER 510 (`RIFLE_JITTER_BLOOM_ADAPTATION`, `REFUSED_ROUND_CONE_ADAPTATION`): a round on foot the room
   * refuses ('rate' early or one tick short of the cycle, or `muzzle far` / `muzzle walled`) inside the cone -- the effects
   * in one place, so the paths cannot split again (LATER 510's review F1). Nothing spent, fired or scheduled. The cone
   * blooms (`ShotCone.round`) once a ray, the original's: `FUN_005be9a0`'s ray loop calls `FUN_005c5340` once a ray
   * (D:L475604), which blooms (`FUN_005c3360` D:L479542). `ride`, a later ray of a refused pull (`ofVolley`: at most its
   * pellets) -- counted, refused under the pull's word (`why`, LATER 510's review F2). Else the round: the cadence's last
   * round (`lastFire`); a shotgun's opens a refused volley its later rays ride; it ends the throw's request as an accepted
   * round's does (THROW-INTERRUPT F1); and the page, which predicted it, is told `stale` once (request 'fire': its journal
   * refunds it, `../../viewer/src/netPage` `case 'stale'` -- the network's bookkeeping, as a refused reload, LATER 194).
   * Returns the refusal's word.
   */
  private refuseRound(p: Player, seq: number, w: 0 | 1, count: number, pellets: number, why: string, ride: Player['volley']): string {
    p.cone.round(seq);
    if (ride) { ride.rays++; return ride.why ?? why; }
    p.lastFire[w] = count;
    p.volley = pellets > 1 ? { w, count, rays: 1, hit: new Set(), refused: true, why } : null;
    p.throwStart = null;
    this.send(p.id, { type: 'stale', request: 'fire', seq });
    return why;
  }

  /**
   * `fire` at the round's frame: from `turret` -- MAP-10b: the turret's weapon from its firepoint, never its kit's;
   * TURRET-CONE: along the claim's line inside the cone about the gun's own (`turretRound`) -- or, undefined, the hand's.
   */
  private fireAt(p: Player, ev: Extract<ClientEvent, { type: 'fire' }>, frame: AimFrame, turret: TurretState | undefined): void {
    const id = p.id;
    const aimed = turret ? this.turretRound(p, turret, frame, ev) : null;
    if (turret && !aimed) return;
    // M7: no round from the firearm while a rocket launcher is the item in the hand, nor before it has come back up.
    if (!aimed && (p.held !== null || frame.count < p.firearmReadyAt)) return this.dropped('fire', 'launcher', p);
    // ROOM_RAISE_TRUST_ADAPTATION (P13, AR-3): no raise refusal here -- the rifle's raise envelope is the page's (LATER 180).
    const w = frame.weapon;
    if (!aimed && !firearmSlotPresent(p.loadout, w)) return this.dropped('fire', 'no firearm', p);
    const record = aimed?.record ?? p.records[w];
    // BL-1: the rate is the weapon's fastest enabled mode -- `FUN_005c09f0` (476313-476335): `FireWait` in mode 1,
    // `FireWait` x 0.8 in burst and automatic (research 84 s6) -- less a tick for the page's frame-quantised clock. The
    // server does not know the page's mode; a slower mode only fires slower.
    const fastest = fastestWait(record);                         // `../../viewer/src/net/fireGate`: the page mirrors it
    // M4: a shotgun's pull is `NumProjectilesFired` rays at one command, one shell (`FUN_005be9a0` L475580-475677):
    // the rays after the first ride the volley the first opened -- no rate, no second shell.
    const pellets = pelletsOf(record);
    const v = p.volley;
    const ofVolley = pellets > 1 && v !== null && v.w === w && v.count === frame.count && v.rays < pellets;
    const rate = fastest * TICK_HZ;                              // LATER 326: the record's rate, in ticks
    const cycle = fireCycleTicks(record);                        // the gap gate's: the rate less a tick for the page's rounding
    const firedAt = this.eventClock(p);                          // SVC-23b: the round's time on the room's clock
    let early = false;                                           // RIFLE_JITTER_BLOOM_ADAPTATION: refused last, below
    let near = false;                                            // REFUSED_ROUND_CONE_ADAPTATION: one tick inside the cycle
    if (!ofVolley && !aimed) {
      const gap = frame.count - p.lastFire[w];
      // Further inside than one tick: refused, and not bloomed (LATER 105 (b), a spray). One tick inside waits for the
      // cone check below and blooms there (`near`).
      if (gap < cycle - REFUSED_ROUND_BLOOM_TICKS) return this.dropped('fire', 'rate', p);
      // LATER 588 (a) (reading, pending review): the console's period held over the chain (`fireGate` `scheduleOpen`:
      // 2 x `fireFrames` ticks, less FIRE_SCHEDULE_SLACK_ADAPTATION) -- the gap above holds a round only to the wait. A
      // round under it is refused without a bloom: the page's kit mirrors both bounds (`../../viewer/src/fire`
      // `pullRound`), so an honest page's round should not meet it -- after a refusal only the room makes (cone, muzzle or
      // early through `refuseRound`, nofire, reload or empty) the two can drift, the room the more lenient: tested by
      // `roomFireCadence.test.ts` 'AR-7 (P16)' (research 84 s11).
      if (!scheduleOpen(p.fireSchedule[w], record, frame.count)) return this.dropped('fire', 'rate', p);
      near = gap < cycle;
      // SVC-23b: the same cycle and lock on the room's own clock, whatever commands the rounds name.
      early = firedAt < p.fireClock[w] + cycle - FIRE_ARRIVAL_JITTER_TICKS;
      // NCW-2 B-trade (Codex's P1 on PR #698): a traded round's magazine is the one the death found (`tradeRounds`).
      const left = p === this.trading ? p.tradeRounds[w] : p.mags[w].rounds();
      if (frame.count < p.reloadUntil[w] || firedAt + FIRE_ARRIVAL_JITTER_TICKS < p.lockClock[w] || left <= 0) {
        return this.dropped('fire', 'reload or empty', p);
      }
      if (w === 0 && frame.count < p.roundWaitUntil) return this.dropped('fire', 'rate', p);   // M4: a launched round's FireWait
    }
    if (frame.swapping) return this.dropped('fire', 'swapping', p);   // M-3: `FUN_005a7de0` (452383) refuses mid-swap
    // PF-17 (PF.R36): the playing motion's `NoFire` at the command the round names (`FUN_005a7de0` D:L462612-462705).
    if (!frame.fire) return this.dropped('fire', 'nofire', p);
    if (frame.binoculars) return this.dropped('fire', 'binoculars', p);   // `FUN_005be9a0` 475305: nothing in view state 4
    if (aimed?.round) return this.turretLaunch(p, aimed.round, aimed.from, aimed.dir, ev.seq);   // PAR-59: the MGL's round, no line
    let from: V3, dir: V3;
    let centring: number | null = null;                          // SEC-F1: the claim's offset from the cone's centre, below
    if (aimed) ({ from, dir } = aimed);                          // TURRET_ROUND_LINE_READING: the room's muzzle, the claim's line
    else {
      from = ev.from;
      // SVC-23b: the muzzle within reach of the server's own head at the command, no wall between (BL-3's middle too).
      // LEAN-WALLED (issue #752 defect 2, research 390): a wall the round's own flight meets -- not a PENETRATION-1 face
      // (an r0004 INVISIBLE_DI wall) or one outside the round's query class -- over the material lookup `roundPath` takes.
      const start = this.startRefused(frame, from, false, roundStartAdmits((m) => surfaceMaterial(m ?? 0, this.map.defaultMaterial ?? '').penetration));
      const d = ev.dir;
      const len = Math.hypot(d[0], d[1], d[2]);
      if (!(len > 0.5 && len < 1.5)) {
        if (start) return this.dropped('fire', `muzzle ${start}`, p);
        return this.dropped('fire', 'dir', p);
      }
      dir = [d[0] / len, d[1] / len, d[2] / len];
      // OWNER-3: the eye, the aim inside the cone, and the round down the eye's ray. LATER 305: the hull the cone reproduces
      // a claimed eye on for the view line (`ShotCone.setGrid`), as it stands now.
      p.cone.setGrid(this.map.grid);
      const verdict = p.cone.check(ev.seq, { eye: ev.eye, aim: ev.aim, from, dir });
      // REFUSED_ROUND_CONE_ADAPTATION (LATER 326): the console bloomed this round (`FUN_005c3360`). The room's muzzle
      // check has no original. Inside the cone, bloom and keep the reason; outside, do not bloom. Not a volley's later
      // ray: those skip the rate and are counted only when taken (`v.rays`), so a bloom there would be unbounded -- K
      // forged rays at the shell's command took a Spas 12's burst from 1 to K + 1 for one shell (the takeover's review F1).
      // LATER 510, as LATER 170's early path (`refuseRound`): a refused pull's later rays (at most its pellets) bloom.
      if (start) {
        if (verdict === null && (!ofVolley || v!.refused === true)) {
          return this.dropped('fire', this.refuseRound(p, ev.seq, w, frame.count, pellets, `muzzle ${start}`, ofVolley ? v : null), p);
        }
        return this.dropped('fire', `muzzle ${start}`, p);
      }
      if (verdict !== null) {
        this.noteRefusal(p, ev, frame, `fire: cone: ${verdict}`);   // SIMDROP-INSTR: recorded and logged, nothing judged
        return this.dropped('fire', `cone: ${verdict}`, p);
      }
      // SEC-F1 (OT.R98 step 1; product track, a statistic -- it decides nothing): read at the cone the claim was checked
      // against, before this round's bloom; counted below only if the round is taken.
      centring = p.cone.centring(ev.seq, { eye: ev.eye, aim: ev.aim, from, dir });
    }
    // LATER 170 (3): a refused pull's later ray, at most its pellets (`ofVolley`'s bound) -- bloomed and refused as the first.
    const refusedRay = ofVolley && v!.refused === true;
    if ((early || near || refusedRay) && !aimed) {
      // RIFLE_JITTER_BLOOM_ADAPTATION (LATER 105) or one tick inside the cycle (LATER 326). Nothing spent or scheduled.
      return this.dropped('fire', this.refuseRound(p, ev.seq, w, frame.count, pellets, 'rate', refusedRay ? v : null), p);
    }
    if (ofVolley) v!.rays++;
    else if (!aimed) {
      p.lastFire[w] = frame.count;
      p.fireSchedule[w] = scheduleAfter(p.fireSchedule[w], record, frame.count);   // LATER 588 (a): on a period, or a new chain
      // LATER 326: the schedule advances by the record's rate (was `+ cycle`, the rate less a tick: a page naming a round
      // every cycle's commands kept ~15% over a rifle's rate -- the M4A1: 5 commands against 5.76 -- the gap gate passing
      // each); the tolerance a round has is unchanged (`early`: `cycle` less FIRE_ARRIVAL_JITTER_TICKS), so a page firing
      // on the console's whole frames (never
      // faster than the rate, `../../viewer/src/fire` `update`) is never early, and a faster one is held to the rate.
      p.fireClock[w] = Math.max(firedAt, p.fireClock[w] + rate);
      if (p === this.trading) p.tradeRounds[w]--;                // B-trade: from the rounds kept at the death, never the rings
      else p.mags[w].fire();
      p.throwStart = null;                                       // THROW-INTERRUPT (F1): its own round taken ends its request
      p.volley = pellets > 1 ? { w, count: frame.count, rays: 1, hit: new Set() } : null;
      // M4: the bolt's or the pump's lock (`FUN_005c5340` L479321-479343) and then its after-shot clip, which holds the
      // fire as a reload does (`FUN_005a7ab0`): the weapon's lock runs on to their end, on the command clock.
      const lock = afterShotLock(record.id, record, p === this.trading ? p.tradeRounds[w] : p.mags[w].rounds(), record.id);
      if (lock !== null) {
        const family = reloadFamily({ item: w ? 'pistol' : 'rifle', id: record.id, afterShot: true });
        const clip = this.clips ? reloadSeconds(this.clips.clips, this.clips.table, frame.posture, reloadMoving(...frame.velocity), family, record.reloadTime ?? 0) ?? 0 : 0;
        setLock(p, w, frame.count, lock, clip, 'afterShot', firedAt);
        this.lockLife(p, w, frame.posture, reloadMoving(...frame.velocity), family, clip);   // PF-18
      }
    }
    if (centring !== null) noteCentring(p.signals, centring);   // SEC-F1: an accepted round on foot, into the round's signals
    if (!aimed) p.cone.round(ev.seq);                            // a turret round's is `turretRound`'s (TURRET-CONE)
    const reach = record.maximumRange * UNITS_PER_METRE;
    // The rewind: the others where the shooter saw them, at most the seat's cap back (NCW-2 B-bound, OT.R105:
    // `rewindCapTicks` of its measured round trip -- MAX_REWIND_MS with none, at most REWIND_CEILING_MS_ADAPTATION).
    const earliest = this.tick - rewindCapTicks(p.pingExact);
    // NCW-2 B-shown (a browser adaptation, `shownOf`): at the round's displayed tick when it carries a valid one,
    // else at its `viewTick` as before -- the same cap either way.
    const shown = this.shownOf(ev, earliest);
    const at = shown?.at ?? Math.max(earliest, Math.min(this.tick, ev.viewTick));
    const extra = this.rewoundBodies(p, from, dir, reach, at);
    // PEN-MATERIAL: each world surface cuts the round by its own material's PENETRATION (`FUN_003c8920`: the byte
    // `FUN_002dc1d0` D:L319383, `DAT_0044f358` D:L319388, +0x24 D:L319473-319476, the cut D:L319510-319516; byte 0 the
    // map's DefaultMaterial), as the page's walk and `sceneBlast` take it. Was: a flat 0.5 for every surface.
    const penetration = (m: number | undefined): number => surfaceMaterial(m ?? 0, this.map.defaultMaterial ?? '').penetration;
    const path = roundPath(this.map.grid, [...from], dir, reach, penetration, record.piercing, extra);
    // NCW-1 (B-count; an instrument, nothing below reads it): the round classed against its own `viewTick`, a read only.
    if (this.opts.rewindOutcome !== false) {
      const bodyIds = (struck: readonly { tag?: unknown }[]): number[] => struck.flatMap((s2) => s2.tag !== undefined ? [(s2.tag as { id: number }).id] : []);
      this.noteRewind(p, ev.viewTick, at, ofVolley ? v : !aimed && pellets > 1 ? p.volley : null, ofVolley, bodyIds(path.struck), (when) => {
        const probe = this.rewoundBodies(p, from, dir, reach, when);
        return probe.length ? bodyIds(roundPath(this.map.grid, [...from], dir, reach, penetration, record.piercing, probe).struck)[0] ?? null : null;
      }, shown);                                                 // NCW-17: the page's displayed tick beside it (B-shown: `at`)
    }
    // MAP-06 (`FUN_003c7490`; research 209 s13): every world surface the round struck, in the walk's order, is a scene
    // destructible's maybe, and each is handed the hit (`hitAt`: the impact rating plus the weapon's modifier against its
    // shield). P11 (research 209 s13, reading, pending review): the hit ends nothing -- the original's walk goes on by
    // `FUN_003c8920`'s answer alone (`FUN_003c9b70` D:L320039, D:L320044-320055), which calls the struck node's handler and
    // discards its return (D:L319417-319418) and goes on by the polygon's PENETRATION cut alone (D:L319506-319518); the
    // destructibles' handler `FUN_00273a50` answers 0 on every path (D:L121065). So `roundPath`'s own walk (the material
    // cut) is the round: the bodies past a destructible that took the hit are struck, and `path.hit` / `path.end` (the
    // shot's end, `stopAt`) are the walk's. A second polygon of a target that died is a second call: `FUN_00273a50` at
    // HP <= 0 re-enters its death branch (D:L120980-120990) and asks `FUN_00270ef0` for an instance of the death's
    // animation, none while the first runs and the animation allows no second (D:L119142-119216; whether it reads busy
    // within the one walk is not traced, research 209 s13); here `hitAt` finds the record spent (its target off) and
    // changes nothing -- one death, one `actionDied`.
    // *Was* (MAP-06 to PEN-MATERIAL): the first destructible that applied cut `path` there, the bodies past it unstruck --
    // attributed to PF.R12, which rules only the geometry the round meets.
    for (const s2 of path.struck) {
      if (s2.tag !== undefined || s2.owner === undefined) continue;
      const target = this.world.health.at(s2.owner);
      // AD-5: the round's range falloff at the destructible, from the shot's start (ROUND_SCENE_FALLOFF_READING) in world
      // units (`FUN_003c7600` D:L318737-318760; Effective_Range / Maximum_Range x UNITS_PER_METRE, as `reach`).
      const hit = this.world.health.hitAt(s2.owner, {
        kind: 'impact', rating: record.impactDamage ?? 0, modifier: record.damageModifier ?? 0, point: s2.point, piercing: record.piercing,
        range: { from: [from[0], from[1], from[2]], effective: record.effectiveRange * UNITS_PER_METRE, maximum: record.maximumRange * UNITS_PER_METRE },
      });
      if (hit.died && target !== null) this.actionDied([target], p);   // PF-14: the shooter (ACTION_POINTS_ACTOR_READING)
    }
    // PF-24: every body record the round struck, in order (`BODY_PENETRATION`: it went on past each; BONE-BOXES: one a
    // bone box entered, research 398 s1).
    const bodies = path.struck.filter((s2) => s2.tag !== undefined);
    const first = bodies[0];
    const end = first ? first.point : path.hit ? path.hit.point : path.end;
    // INT-NET-2 (research 91 section 23): the original plays a round's impact by the struck node's material
    // (`FUN_003c8920`: `FUN_002dc1d0` L319383, the name `FUN_003d22e0` L319497, played L319500) on every console that
    // walks the round, with no test of the damage -- a body's material is PERSON (`DAT_003e14f8`, `FUN_003d03d0`
    // L323423), its impact `bullet_hit_person`. So a round that struck a body goes out with the first body's point, the
    // normal back along the round and the PERSON byte, to every page, and to the shooter's as an `impact` (its walk met no
    // body; an event of its own, which an older page ignores, never its own `shot`: review finding 1): an armour's whole
    // take, a team-mate's body, bleed as any other. PF-24: the first body's only (`SHOT_EVENT_BODIES_READING`).
    const body = first ? (first.tag as { id: number }).id : null;
    // P12 (SHOT_EVENT_THROUGH_READING): every other world surface struck, in order -- not a body, not the one `to` names.
    const named = first ? null : path.hit;
    const through = path.struck.filter((s2) => s2.tag === undefined && s2 !== named)
      .map((s2) => ({ point: [...s2.point] as V3, normal: [...s2.normal] as V3, material: s2.material ?? null }));
    const shot: Extract<ServerEvent, { type: 'shot' }> = {
      type: 'shot', id, weapon: record.id, from: [...from], to: [...end],
      normal: first ? first.normal : path.hit ? path.hit.normal : null, material: body !== null ? PERSON_BYTE : path.hit?.material ?? null,
      ...(body !== null ? { body } : {}),
    };
    // P12b (SHOT_EVENT_BODIES_READING's tracer half): the round's end, where the shooter's page draws its own tracer (the
    // walk's stop, else its range spent), beside `to` when `to` is the first body -- the others' tracer runs to it, every
    // console walking the round to its end (research 91 s23); the blood, the body hit and the report stay `to`'s.
    const roundEnd = path.hit ? path.hit.point : path.end;
    const past = first && roundEnd.some((v, i) => v !== end[i]) ? { end: [...roundEnd] as V3 } : {};
    this.broadcast({ ...shot, ...(through.length ? { through } : {}), ...past }, id);
    if (body !== null) this.send(id, { ...shot, type: 'impact', body });   // the shooter's page walked the rest itself
    // PF-36 (PF.R56; research 235 s4): the resting `Volitile` charges the round met (their damage interface, `FUN_003c8920`
    // D:L319417-319418) -- inside CHARGE_HIT_RADIUS_PLACEHOLDER's sphere, entered before where the walk stopped (the
    // surface it stopped at, else the range spent). No surface of the walk: the round goes on untouched to the next real
    // surface, which `shot.to` names (CHARGE_ROUND_PASS_READING). Each one's damage there by the round's law
    // (`bulletDamage`; null past Maximum_Range is 0) as GetDamage's base before its x14 (VOLATILE_MIN_DAMAGE_READING). No
    // hit of the shooter's (PF.R20: `countShot` counts bodies). Where it is now: a resting charge does not move.
    const stopAt = path.hit ? path.hit.distance : Math.hypot(path.end[0] - from[0], path.end[1] - from[1], path.end[2] - from[2]);
    const met: { f: Flying; t: number }[] = [];
    for (const f of this.flying) {
      if (!f.g.record.volatile || f.g.state !== 'rest') continue;
      const t = raySphere(from, dir, reach, f.g.pos, CHARGE_HIT_RADIUS_PLACEHOLDER);
      if (t !== null && t <= stopAt) met.push({ f, t });
    }
    for (const { f, t } of met.sort((a, b) => a.t - b.t)) this.chargeHit(f, (bulletDamage(record, t) ?? 0) / DAMAGE_SCALE, id);
    // INT.R5 (research 127): the combat report's account of the round -- nothing below changes for it.
    const report = { request: 'fire', weapon: record.id, direction: dir } as const;
    this.countShot(p, !ofVolley, undefined);                     // PF-26: the shot (HIT_COUNT_READING); its hit below
    if (!first) { this.combat(p, null, { ...report, status: 'miss', point: [end[0]!, end[1]!, end[2]!] }); return; }
    // BONE-BOXES (owner ruling OT.R119; research 398 s0, s3-s5; reading, pending review): each body record in the walk's
    // order goes to the victim's handler (D:L319417-319418); `bodyApplications` keeps the ones its part routine damages --
    // a limb's and then the first head or trunk hit of each body, which remembers the round (`+0x1048`, FUN_005ab850
    // D:L464597; FUN_005abbc0 D:L464741-464757) so the rest of that body is spared; a no-damage bone's none; a volley's ray
    // once a body (the 'Q' branch, D:L464703-464737). The damage of each is the port's own at its struck distance
    // (`bulletHit`; research 398 s12.5 a question, not built). The gate (PF-22) runs first in each, as the handler's does,
    // and a refused body is passed as any other (`BODY_PASS_FRIENDLY_READING`); one hit counted a shell whatever the
    // bodies (`countShot`, PF.R20). Was (PF-24 to BONE-BOXES): a body damaged once a round, at its nearest capsule.
    const applied = bodyApplications(bodies, pellets > 1);
    for (const struck of applied) {
      const { id: victimId, part, hostage } = struck.tag as { id: number; part: number; hostage?: true };
      if (hostage) this.hostageBulletHit(p, this.extraction!.hostage(victimId)!, part, struck.distance, record, pellets > 1);
      else this.bulletHit(p, victimId, part, struck, record, pellets > 1, from, report);
    }
    // INT.R5, BONE-BOXES' fold (the review's finding 2; a playtest instrument, it changes nothing the round did): a body
    // the round met whose every record was a bone that takes nothing (a hand, a foot, a scapula alone) had no part
    // routine run and wrote no report -- the round is then a `miss` on that body, 'no damage', at its first record.
    if (this.opts.combatReport) {
      for (const s2 of bodies) {
        const t = s2.tag as { id: number; hostage?: true };
        if (bodies.find((b) => sameBody(b.tag, t)) !== s2 || applied.some((b) => sameBody(b.tag, t))) continue;
        this.combat(p, t.hostage ? null : this.players.get(t.id) ?? null, {
          ...report, status: 'miss', reason: 'no damage', distance: s2.distance, point: [s2.point[0]!, s2.point[1]!, s2.point[2]!],
        });
      }
    }
  }

  /**
   * The rewind's bodies (W3.R4), each record a surface the round may strike: every other living player's and, HX-1,
   * every targetable hostage's bone boxes as they stood at `at` (their past), met by the ray within `reach` -- BONE-BOXES
   * (research 398 s1; reading, pending review): one record for each box the line enters from outside, at its entry, the
   * damaging bones' and the others' (`NO_PART`) alike, after the body's own cull (`rayRecords`, `bodyRecords`); returned in the
   * walk's order, nearest first, a record at the distance of the one before it dropped (`./bodyWalk` `walkOrder`,
   * `FUN_003c9b70` D:L319990; `BODY_RECORD_TIE_READING`). Lifted out of `fireAt` unchanged (NCW-1) so its instrument
   * reads the same bodies at another tick; it reads and changes nothing.
   */
  private rewoundBodies(p: Player, from: V3, dir: V3, reach: number, at: number): ExtraSurface[] {
    const extra: ExtraSurface[] = [];
    // PF-24 (PF.R42): each record is a PERSON surface the round strikes and goes on past (`BODY_PENETRATION`, 0.97 from
    // the materials table; FUN_003c8920 D:L319473-319518), its range cut at each.
    const push = (id: number, hostage: boolean) => (part: number, t: number, bone: number): void => {
      const point: V3 = [from[0] + dir[0] * t, from[1] + dir[1] * t, from[2] + dir[2] * t];
      extra.push({ distance: t, penetration: BODY_PENETRATION, point, normal: [-dir[0], -dir[1], -dir[2]], tag: hostage ? { id, part, bone, hostage: true } : { id, part, bone } });
    };
    for (const q of this.players.values()) {
      if (q === p || !q.alive) continue;
      const past = this.past(q, at);
      if (!past || !past.alive) continue;
      // HIT-POSE: the live skeleton as it was posed at `at` (`Past.pose`: the ring's boxes, no copy); without it,
      // PRONE-TILT; LEAN-HIT (issue #752): the stance's idle set, the held peek's lean set, as the body stood at `at`
      // (BONE-BOXES' fold, the review's finding 3: `bodyRecords` culls before it turns a tilted set's matrices, into owned
      // scratch -- the records `bodyVolumes` would give)
      const boxes = pastBoxes(past);
      if (boxes) rayRecords(from, dir, reach, placedVolumes(past.feet, past.yaw, boxes), push(q.id, false));
      else bodyRecords(from, dir, reach, past.feet, past.yaw, past.posture, this.volumesOf(q), past.tilt, past.peek ?? 0, push(q.id, false));
    }
    // HX-1 (research 237 s2): after the players, the hostages -- the same PERSON records, where the shooter saw them
    // (their own past), on their own skeleton's boxes at their stance (HX-2's `volumesOf({ escortee })`).
    for (const h of this.extraction?.hostages ?? []) {
      if (!this.extraction!.targetable(h)) continue;
      const past = pastOf(h.history, at);
      if (!past || !past.alive) continue;
      // PRONE-TILT-2 (5). The peek is the past's, as the page's `s.peek ?? 0` (`RemotePlayers.aimCast`): a hostage's
      // past has none, so 0 (P34 (A1), `roomLiteralArgs.test.ts`).
      bodyRecords(from, dir, reach, past.feet, past.yaw, past.posture, this.hostageVolumes(h), past.tilt, past.peek ?? 0, push(h.id, true));
    }
    return walkOrder(extra);
  }

  /**
   * NCW-1 (B-count, `docs/plans/2026-11-05-netcode-wave.md` sections 2, 4; an instrument with no original -- it decides
   * nothing, sends nothing, damages nothing): a taken round's class (`RewindClass`, `rewindClassOf`) by its rewind age
   * (`this.tick` less `viewTick`, ticks). `atStruck`, the ids of the bodies (players and hostages, before any
   * friendly-fire gate) the scored walk struck at the clamped rewind `at`; `probe(tick)`, the same walk, read only, with
   * the bodies at `tick` -- the id of the first body it strikes, else null. The unclamped tick is `min(tick, viewTick)`:
   * only the cap's clamp is undone; when it is `at` the two reads are one. A `viewTick` older than the kept history
   * (`HISTORY`) is class `e`, not probed. `a` and `b` compare the same body: a round whose body at the `viewTick` is not
   * struck at the clamped rewind is `b` even when a bystander is.
   *
   * A single round is counted at once. A shotgun's pull (`pull`, its first ray's or, `ofVolley`, a later one's) is one
   * round: its rays' reads are kept on the pull and counted once, when its class is final -- at the next step's top
   * (`settleRewind`; a page sends a pull's rays together, and the room decides them in one pass), or sooner when the
   * take or the round report asks -- so a count never moves and no total ever falls (the review's F4). A ray decided
   * after its pull was counted changes nothing.
   *
   * What it undercounts: a body not alive now is in neither read (`rewoundBodies` skips `!q.alive`) -- a target killed
   * since the `viewTick`, by this round's earlier rays or another's, is no hit at the `viewTick`; and a body respawned
   * since has its history cleared at the spawn (`Player.history`), so the probe finds it at its oldest pose, its spawn,
   * not where the shooter saw it.
   *
   * NCW-17: `shown`, the round's displayed tick checked (`shownOf`: the claim's lead over the picture and the tick held to
   * the cap), or null -- each ray also read there by the same `probe` (`RewindRay.shownFirst`), and the round's lead and
   * its miss at the claim counted with its class (`countRewind`). The same read only: it adds nothing to the scored walk.
   * NCW-2 B-shown: a round with a valid displayed tick is scored there (`at` is `shown.at`), so its `shownFirst` is the
   * scored walk's own and it is never a miss at the scored rewind -- `shownMiss` reads 0 for it, a tripwire; the round its
   * `viewTick` would have lost and the picture lands is NCW-1's class `d` (no hit at the `viewTick`, struck at `at`).
   */
  private noteRewind(p: Player, viewTick: number, at: number, pull: Player['volley'], ofVolley: boolean, atStruck: number[], probe: (tick: number) => number | null, shown: { lead: number; at: number } | null = null): void {
    const prior = ofVolley ? pull?.rewind : undefined;
    if (prior?.counted) return;
    const age = prior?.age ?? this.tick - viewTick;
    const e = prior?.e ?? age > HISTORY - 1;
    const view = Math.min(this.tick, viewTick);
    const rays = prior?.rays ?? [];
    // NCW-17: the same walk, read only, at the displayed tick (held to the cap) -- the scored read's own when it is `at`.
    const shownRead = shown === null ? {} : { shownFirst: shown.at === at ? atStruck[0] ?? null : probe(shown.at) };
    if (!e) rays.push({ viewFirst: view === at ? atStruck[0] ?? null : probe(view), atStruck, ...shownRead });
    const lead = prior ? prior.lead : shown?.lead;               // NCW-17: a pull's lead its first ray's
    if (!pull) { this.countRewind(p, e ? 'e' : rewindClassOf(rays), age, e ? undefined : lead, rays); return; }
    if (prior) return;
    pull.rewind = { rays, age, e, counted: false, ...(lead !== undefined ? { lead } : {}) };
    this.rewindOpen.push({ p, pull });
  }

  /**
   * NCW-17 (the claim-versus-picture instrument, `docs/plans/2026-11-05-netcode-wave.md` section 7; no original, it
   * decides nothing): a round's displayed tick (`fire`'s `shownTick`, `NetClient.shownTick`), checked -- a finite number
   * (the page's interpolated view tick while two snapshots bracket it: a fraction, as `viewTick` is), at most the round's
   * `viewTick` -- as the claim's lead over the picture (`viewTick - shownTick`,
   * ticks) and the tick the instrument rewinds to for it, `max(earliest, min(tick, shownTick))`: held to the scored
   * rewind's cap (`earliest`, the seat's cap back: `rewindCapTicks`, NCW-2 B-bound), as the scored read is. Null for a
   * round without one or with a bad one, which is ignored, never refused: the round is taken and scored as without it.
   *
   * NCW-2 B-shown (a browser adaptation; plan sections 4 and 7, Benny's §1): the scored rewind is this `at` when
   * there is one -- the bodies judged where the page drew them, not where its `viewTick` ran on to in a snapshot gap
   * (his real-room probe: a 150 ms gap, the claim at tick 27, the picture at 24; a miss at 27, a hit at 24). A browser
   * adaptation (the original had no rewind: the shooter's console sent the Hit it resolved on its own picture, and the
   * victim's owner applied it, research 193 §12.6) that moves the judged tick toward that picture. Only the bodies'
   * tick moves: the cone, eye and muzzle checks read the round's command frames as before, and the seat's cap is not
   * widened. A forged `shownTick` buys nothing a forged `viewTick` cannot already: it is held at most to `viewTick`,
   * and both are clamped by the one cap (`earliest`) to the same tick -- the oldest a page may ask for either way.
   * The review's F3: one older than the kept history is clamped to `earliest` too, as an equally old `viewTick` is, not
   * dropped -- dropping it judged the round at its `viewTick`, further from the picture than a slightly newer
   * `shownTick` clamped to the cap, so the rule was not monotonic. The clamp keeps every read inside the history, and a
   * forger who sends an ancient one gets `earliest`, which a `viewTick` at the cap already gets him. Without one, or a
   * bad one (not a finite number, or past `viewTick`), the round is judged at its `viewTick`.
   */
  private shownOf(ev: Extract<ClientEvent, { type: 'fire' }>, earliest: number): { lead: number; at: number } | null {
    const s = ev.shownTick as unknown;
    if (typeof s !== 'number' || !Number.isFinite(s) || s > ev.viewTick) return null;   // F3: an old one is clamped, below
    return { lead: ev.viewTick - s, at: Math.max(earliest, Math.min(this.tick, s)) };
  }

  /** NCW-1: the shotgun pulls read and not yet counted (`noteRewind`), counted by `settleRewind`. */
  private rewindOpen: { p: Player; pull: NonNullable<Player['volley']> }[] = [];

  /** NCW-1: every open pull counted now, its class final (`noteRewind`'s rule); called at each step's top, by the take and the round report. */
  private settleRewind(): void {
    if (!this.rewindOpen.length) return;
    const open = this.rewindOpen;
    this.rewindOpen = [];
    for (const { p, pull } of open) {
      const r = pull.rewind!;
      r.counted = true;
      this.countRewind(p, r.e ? 'e' : rewindClassOf(r.rays), r.age, r.e ? undefined : r.lead, r.rays);
    }
  }

  /**
   * NCW-1: one round's count under its class and age bucket, in the seat's round (and its largest age) and the room's
   * second. NCW-17: with a displayed tick's `lead` (a round that sent a valid one), its lead bucket too and, when its rays
   * miss at the claim and hit at the displayed tick (`shownMissOf`), the class's count.
   */
  private countRewind(p: Player, cls: RewindClass, age: number, lead?: number, rays: readonly RewindRay[] = []): void {
    const key = `${cls}:${rewindAgeBucket(age)}`;
    const own = p.signals.rewind ??= {};
    own[key] = (own[key] ?? 0) + 1;
    p.signals.rewindAgeMax = Math.max(p.signals.rewindAgeMax ?? 0, age);
    const seat = this.rewindSecond.get(p.id) ?? new Map<string, number>();
    seat.set(key, (seat.get(key) ?? 0) + 1);
    this.rewindSecond.set(p.id, seat);
    if (lead === undefined) return;
    const bucket = shownLeadBucket(lead), miss = shownMissOf(rays);
    const ownLead = p.signals.shownLead ??= {};
    ownLead[bucket] = (ownLead[bucket] ?? 0) + 1;
    if (miss) p.signals.shownMiss = (p.signals.shownMiss ?? 0) + 1;
    const second = this.shownSecond.get(p.id) ?? { lead: new Map<string, number>(), miss: 0 };
    second.lead.set(bucket, (second.lead.get(bucket) ?? 0) + 1);
    if (miss) second.miss++;
    this.shownSecond.set(p.id, second);
  }

  /** NCW-1: the rounds counted since the last `takeRewind`, by seat and `class:bucket` (each count one or more). */
  private readonly rewindSecond = new Map<number, Map<string, number>>();
  /** NCW-17: of them, the rounds with a displayed tick by seat and lead bucket, and the seat's misses at the claim. */
  private readonly shownSecond = new Map<number, { lead: Map<string, number>; miss: number }>();

  /**
   * NCW-1 (B-count; an instrument): the rounds classed since the last call, by seat and `class:bucket`, each seat with its
   * newest heartbeat round trip (`rttMs`, raw; null none yet) and the score row's smoothed `ping` -- for the server's
   * once-a-second `rewind` line and its `/metrics` series. Null when none was classed. A seat gone since is reported
   * with null round trips. The open pulls are counted first (`settleRewind`). NCW-17: a seat with rounds that carried a
   * displayed tick has their lead buckets (`shownLead`) and, with any, its misses at the claim (`shownMiss`).
   */
  takeRewind(): { seats: Record<number, RewindTakeSeat> } | null {
    this.settleRewind();
    if (!this.rewindSecond.size) return null;
    const seats: Record<number, RewindTakeSeat> = {};
    for (const [id, keys] of this.rewindSecond) {
      const rounds = Object.fromEntries(keys);
      const q = this.players.get(id);
      const shown = this.shownSecond.get(id);
      seats[id] = {
        rounds, rttMs: q && q.rttLast >= 0 ? Math.round(q.rttLast) : null, ping: q ? q.ping : null,
        ...(shown ? { shownLead: Object.fromEntries(shown.lead) } : {}), ...(shown?.miss ? { shownMiss: shown.miss } : {}),
      };
    }
    this.rewindSecond.clear();
    this.shownSecond.clear();
    return Object.keys(seats).length ? { seats } : null;
  }

  /**
   * HX-1: the friendly-fire gate on a hostage (`HOSTAGE_FF_READING`): every shooter its teammate, the escortee bit
   * through. R4B-04 (r0004, OT.R97): then the rescued bit's refusal (`./extraction` `RESCUED_HIT_READING`,
   * `rescuedRefuses`: every hit but a departed owner's Backblast), the same on each of the three hostage hits.
   */
  private hostageRefuses(attacker: Player | null, itemId: number, h: Hostage): boolean {
    if (ffRefuses(attacker, { team: attacker?.team ?? 'seal', escortee: true }, itemId, this.opts.allowFriendlyFire === true) !== null) return true;
    return rescuedRefuses(h, attacker !== null, itemId);
  }

  /**
   * HX-1 on HX-2's lookup (research 238 s1.8): a hostage's hit volumes, its own skeleton's (`volumesOf({ escortee })`) by
   * its record's index -- on Desert Glory the records' characters `mp_fem1-3` stand in `chartype.rdr`'s `escortees` in the
   * same order; else the first hostage's, else SEAL 1's.
   */
  private hostageVolumes(h: Hostage): StanceVolumes | null {
    return this.volumesOf({ escortee: h.character });
  }

  /**
   * HX-4a (research 239 s1.2, s9.1; `ORDER_PICK_READING`): the crosshair pick of an order -- along the page's `dir`,
   * `ORDER_PICK_REACH_READING` long: every living player's body but the issuer's (at its present: the page aims at
   * what it draws) and every targetable hostage's, on the capsules the room judges hits by, and the hull's surfaces
   * under the aim pick's blocking rule (`pickSurfaces`, the map's `DefaultMaterial`).
   *
   * The sprint 31 fix-up (research 239 s9.2, `ORDER_EYE_READING`): the original's pick leaves from the camera
   * (`FUN_005aa6e0(actor, cam+0xd8, cameraMatrix)` from the camera update, D:L142028), as the page's does (its camera
   * eye, `WalkMode.fireAim`). The room never takes the page's `eye` -- a modified page could place it past the jail's bars
   * (H129: the bars always block) -- but casts from its own camera eye at the command the order names (`seq`; the order
   * is decided on the timed path once the command after it has run), `orderOrigin`: `localCamera(...).eye` through
   * `toWorld`, as `ShotCone`'s rig builds it, pulled in toward the look-at target short of a wall. The page's `dir` is
   * the only thing the client gives. Built on the same frame, the page's line passes within 0.0038 u of that origin --
   * the wire's quantisation of the look alone (a yaw half-step of 0.00275 deg, u16; a pitch half-step of 0.005 deg,
   * i16 / 100; on a camera orbit of at most ~28.6 u), held under 0.004 u by `roomHostageOrders.test.ts` upright,
   * leaning, prone and after a turn. Open: a wall behind the issuer, where the page's camera pass and this clip stop at
   * different points on the same back axis. The page's look running a frame ahead of the command it names was closed by
   * the fix-up's either-frame rule, now `orderPickTrusted`'s frame-or-next. (Earlier origins: the head, 5.3 u under the
   * camera line; the look-at target, which a leaning page's line misses by 2.4-2.7 u; the last command run's eye, a
   * command or more behind a turning page.) HX-OBEY: this origin is no longer cast from for the wire's orders -- `origin`
   * is the page's trusted eye; without one (a test's probe) the room's own, as above.
   */
  private orderPick(issuer: number, dir: V3, seq?: number, origin?: V3, viewTick?: number): ReturnType<typeof crosshairPick> {
    const l = Math.hypot(dir[0], dir[1], dir[2]);
    const p = this.players.get(issuer);
    if (!(l > 0) || !p) return { picked: null, blocked: [] };
    // LATER 853 (ORDER_REWIND_ADAPTATION): the hostages where the page drew them -- at its playout clock when it ordered,
    // clamped as a round's rewind is (the seat's cap back, never ahead of the room); without one, at their present.
    const at = viewTick !== undefined && Number.isFinite(viewTick)
      ? Math.max(this.tick - rewindCapTicks(p.pingExact), Math.min(this.tick, viewTick)) : null;
    const eye = origin ?? this.orderOrigin(p, seq);
    const d: V3 = [dir[0] / l, dir[1] / l, dir[2] / l], reach = ORDER_PICK_REACH_READING;
    const bodies: PickBody[] = [];
    for (const q of this.players.values()) {
      if (q.id === issuer || !q.alive) continue;
      const w = q.sim.walker.state, feet: V3 = [w.x, w.y, w.z];
      // PRONE-TILT; LEAN-HIT (Codex P2 on #761): the held peek's lean set, as the round's (`rewoundBodies`) and the page's
      // `aimBodies` -- the original's pick queries the live nodes a round meets (`FUN_005aa6e0` D:L464118-464122); HIT-POSE:
      // the live pose's where the room has it (`liveVolumes`); BONE-BOXES: the nearest box the line enters, any bone's
      const hit = rayBody(eye, d, reach, this.liveVolumes(q, feet, q.sim.moves?.peeking() ?? 0));
      if (hit) bodies.push({ id: q.id, distance: hit.t });
    }
    for (const h of this.extraction?.hostages ?? []) {
      if (!this.extraction!.targetable(h)) continue;
      const past = at !== null ? pastOf(h.history, at) : null;
      if (past && !past.alive) continue;
      const hit = rayBody(eye, d, reach, past
        ? bodyVolumes(past.feet, past.yaw, past.posture, this.hostageVolumes(h), past.tilt)
        : bodyVolumes(h.at, h.yaw, this.extraction!.posture(h), this.hostageVolumes(h), h.motion?.rootTilt));
      if (hit) bodies.push({ id: h.id, distance: hit.t });
    }
    const far: V3 = [eye[0] + d[0] * reach, eye[1] + d[1] * reach, eye[2] + d[2] * reach];
    return crosshairPick(bodies, pickSurfaces(this.map.grid, eye, far, this.map.defaultMaterial ?? ''));
  }

  /**
   * HX-OBEY (research 239 s9.3; `ORDER_EYE_TRUST_READING`): the order's pick cast from the PAGE's eye along the page's
   * direction -- the line the page offered on -- once the eye is one the issuer's camera could have had: (1) within
   * `ORDER_EYE_BOUND` (1.57 u) of the body's camera locus at the order's command or the next (`ShotCone.eyeAt`: the head's
   * eye, or the third-person segment from the look-at target to `CAM_MARGIN` past the goal eye, swept straight up by the
   * root's slack and back along the facing by the lead probe's pull); (2) reachable from the body's own head: the line
   * from the head (`headPoint`) to the eye crosses no polygon (`segmentHit`, every polygon), so no eye sits past the jail's
   * bars or a wall -- the locus itself reaches 1-5 u past the bars from a body pressed to them, so this clip, not the
   * bound, is what shuts H129's hole (`roomHostageOrderEye.test.ts`: an eye 1 u and 2 u past the bars within the bound,
   * refused here). Either failing, the pick is refused `'eye'` -- never `'not aimed'`. The pick from a trusted eye keeps
   * the grate rule (`pickSurfaces`, `crosshairPick`). The original picks on the issuer's own console and the host applies
   * the forwarded order unchecked (`FUN_002bb8e0` D:L160706-160721; 191 s12.4): the room judges the line the page aimed,
   * bounded.
   *
   * Why not the fix-up's cast from the room's own camera eye (`orderPick` without `origin`, `orderOrigin`; research 239
   * s9.2): the owner's live room refused honest offers `'not aimed'` with the icon up. The demonstrated headless cause
   * is the page's pick shape (`aimBodies` on SEAL capsules: 28 of 127 offered looks, 5d6ce72b); the room's reconstructed
   * eye agrees with the page's line while the body stands still (the eye test's scan: every look taken under either
   * cast) and parts from it where the page's camera rides the animator's posed root, its pass and a look a frame ahead
   * -- the moving, turning case of the live log, held by the eye test's root-divergence case and closed by construction
   * here: the room casts the line the page cast.
   */
  private orderPickTrusted(issuer: number, eye: V3, dir: V3, seq?: number, viewTick?: number): ReturnType<typeof crosshairPick> {
    const p = this.players.get(issuer);
    if (!p) return { picked: null, blocked: [] };
    const at = seq ?? p.sim.seq;
    const within = p.cone.eyeAt(at, eye) || (p.cone.frame(at + 1) !== undefined && p.cone.eyeAt(at + 1, eye));
    if (!within) return { picked: null, blocked: [], eye: 'refused' };
    const f = p.cone.frame(at) ?? p.cone.frame(at + 1) ?? p.cone.frame(p.sim.seq);
    if (f && this.map.grid && segmentHit(this.map.grid, headPoint(f), eye)) return { picked: null, blocked: [], eye: 'refused' };
    return this.orderPick(issuer, dir, seq, eye, viewTick);
  }

  /**
   * LATER 305 (the merge controller's option (i), bf-reviewed): the page's eye a C4 plant's `throw` or a switch's `action`
   * carried, where it counts -- held as an order's eye is (`orderPickTrusted`: on the camera's locus of `frames`,
   * `ShotCone.eyeOnFrames`, and no wall between the head and it), the eye the room reproduces with the original's pass on
   * its hull (`lookFitsPoint` with the eye and the grid: a forged eye beside the target steers nothing), and its line, the
   * original's from that eye through the moved target (`FUN_005aa6e0` D:L142028; research 84 §19), passing the point --
   * else none.
   * Only ever ADDED to the room's own eyes: a forged, walled or off-line eye is unused and the claim keeps today's verdict,
   * so leaving the eye out gains nothing and a page without it is judged as before.
   */
  private pageEye(p: Player, frames: AimFrame[] | null, eye: V3 | undefined, point: V3): V3[] {
    if (!eye || !frames || frames.length === 0 || !p.cone.eyeOnFrames(frames, eye)) return [];
    const f = frames[Math.min(1, frames.length - 1)]!;
    if (this.map.grid && segmentHit(this.map.grid, headPoint(f), eye)) return [];
    return lookFitsPoint(frames, point, eye, this.map.grid) ? [eye] : [];
  }

  /**
   * The order pick's origin (`orderPick`, `ORDER_EYE_READING`): the camera's eye of the command `seq` (the order's or
   * the next, both run by then: `timed`; else the player's last command; before any, the mover's body looking level) -- its `AimFrame`:
   * feet, look, stance, root and peek. By `headEye`'s rule, every
   * polygon: the look-at target is kept off a wall on the line from the body's axis at its height, then the eye is cast
   * from that target and, past a wall, put `HEAD_EYE_WALL_BACK_PLACEHOLDER` short of it back toward the target -- the
   * line the page's camera pass pulls its own eye in along (the back axis), so a pulled-in page eye stays on it.
   */
  private orderOrigin(p: Player, seq?: number): V3 {
    const f = (seq !== undefined ? p.cone.frame(seq) : undefined) ?? p.cone.frame(p.sim.seq);
    const s = p.sim.walker.state;
    const b = f ?? { feet: [s.x, s.y, s.z] as V3, yaw: s.yaw, pitch: 0, posture: p.sim.walker.posture, moveRoot: this.aimRootOf(p), peek: p.sim.moves?.peek() ?? 0 };
    const local = localCamera(b.moveRoot ?? rootY(b.posture), b.pitch, b.peek);
    const target = headEye(this.map.grid, b.feet, toWorld(b.feet, b.yaw, local.target), () => true);
    const eye = toWorld(b.feet, b.yaw, local.eye);
    const hit = this.map.grid ? segmentHit(this.map.grid, target, eye) : null;
    if (!hit) return eye;
    const back = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]], n = Math.hypot(back[0]!, back[1]!, back[2]!) || 1;
    const k = HEAD_EYE_WALL_BACK_PLACEHOLDER / n;
    return [hit.point[0] + back[0]! * k, hit.point[1] + back[1]! * k, hit.point[2] + back[2]! * k];
  }

  /**
   * HX-1 (research 237 s2; 191 s2.3): a round on a hostage, applied by the room as the host applies it (`FUN_005a5a80`
   * D:L461598-461646; the hit message `FUN_002bbbd0` D:L160807-160846, `FUN_005a1b80` D:L459490-459618 -- in r0001 none
   * tests the rescued bit; r0004's receiver does, R4B-04): the friendly-fire gate never refuses it (`HOSTAGE_FF_READING`,
   * `hostageRefuses`), the rescued bit does (`RESCUED_HIT_READING`); a bullet's quantised
   * damage on its part, or a volley's pellets once a volley (`volleyHit`'s rule), on its own table
   * (`HOSTAGE_PARTS`, HX-2's `HOSTAGE_HEALTH_READING` read). No `hurt` (no page owns it), no flinch (HX-2's lists), no combat report, no hit counted
   * (PF-26's `countShot` counts players). Dead, it goes out through the authority (`killed`).
   */
  private hostageBulletHit(p: Player, h: Hostage, part: number, distance: number, record: WeaponRecord, volley: boolean): void {
    if (!this.extraction!.targetable(h) || this.hostageRefuses(p, record.id, h)) return;
    let died = false;
    if (volley) {
      if (!p.volley || p.volley.hit.has(h.id)) return;
      p.volley.hit.add(h.id);
      // Preserve the existing hostage path. Retail host-local and remote-hostage hits route differently;
      // the player receiver correction does not settle that separate parity question (research 94 C2.1).
      const raw = bulletDamage(record, distance);
      if (raw === null) return;
      const { damage, piercing } = quantiseHit(raw, record.piercing);
      const n = shotgunPellets(distance, this.opts.random);
      for (let i = 0; i < n && !died; i++) { part = fragmentPart(this.opts.random); died = applyHit(h.health, part, damage, piercing); }
    } else {
      const raw = bulletDamage(record, distance);
      if (raw === null) return;
      const { damage, piercing } = quantiseHit(raw, record.piercing);
      died = applyHit(h.health, part, damage, piercing);
    }
    if (died) this.hostageKilled(h, p, { weapon: this.weaponName(record.id, record.name), how: 'weapon', cause: deathCause('bullet', part), clip: deathClip('bullet', part, this.extraction!.posture(h), this.opts.random, 'teammate') });
  }

  /**
   * HX-1: a hostage's death, as `kill` is a player's -- but never through it (no `deaths++`, no score: HX-5's listener):
   * the authority's valves by the killer's side and its `kill` with `victimKind` 'hostage' (`HostageKillInfo`). The
   * killer counts only seated (`WORLD_KILL_UNCOUNTED_READING`).
   */
  private hostageKilled(h: Hostage, killer: Player | null, info: HostageKillInfo): void {
    const seated = killer !== null && this.players.get(killer.id) === killer ? killer : null;
    this.extraction!.killed(h, seated, info);
  }

  /**
   * PF-24: one body a bullet struck (`fire`'s walk) -- the gate, the volley's once-a-victim hit or the bullet's quantised
   * damage, the `hurt`, the combat report, the flinch or the kill. The body was living where the shooter saw it; a body
   * dead since is a miss ('not alive'). PF-37 (`./shotgunGuard`, research 236 s1): a volley the victim's own memory
   * refuses -- a class-Q hit while the last landed inside its update (`FUN_005abbc0` D:L464701-464737; the memory
   * cleared by `FUN_00550ef0` D:L418081-418083) -- is a 'guard' miss; a ray of a volley that already hit it rides the
   * shooter's set (`volleyHit`, M4) as before.
   */
  private bulletHit(
    p: Player, victimId: number, part: number, struck: { distance: number; point: readonly number[] }, record: WeaponRecord, volley: boolean, from: V3,
    report: { readonly request: 'fire'; readonly weapon: number; readonly direction: V3 },
  ): void {
    const victim = this.players.get(victimId);
    const onBody = { ...report, part, distance: struck.distance, point: [struck.point[0]!, struck.point[1]!, struck.point[2]!] as V3 };
    if (!victim || !victim.alive) { this.combat(p, null, { ...onBody, status: 'miss', reason: 'not alive' }); return; }
    // PF-22: the one friendly-fire gate (`ffRefuses`, FUN_005ac670; off by default, W3.R11).
    if (this.refuses(p, victim, record.id) !== null) {
      this.combat(p, victim, { ...onBody, status: 'rejected', reason: FRIENDLY_FIRE });
      return;
    }
    if (volley) {
      // The volley's answer for this victim is given once (its set): the guard's miss as the hit is.
      if (p.volley && !p.volley.hit.has(victim.id)) {
        if (guarded(this.tick, victim.qHitAt)) {
          p.volley.hit.add(victim.id);
          this.combat(p, victim, { ...onBody, status: 'miss', reason: 'guard' });
          return;
        }
        victim.qHitAt = this.tick;
      }
      this.volleyHit(p, victim, record, struck.distance, from, onBody); return;
    }
    const raw = bulletDamage(record, struck.distance);
    if (raw === null) { this.combat(p, victim, { ...onBody, status: 'miss', reason: 'beyond range' }); return; }
    // PF-22: the hit packet's bytes, as the victim's console applies them (`quantiseHit`, FUN_002bd220 D:L161655-161672).
    const { damage: dmg, piercing } = quantiseHit(raw, record.piercing);
    this.countShot(p, false, victim, false, part);               // PF-26: a hit, once the room resolves it
    const scale = this.ruleHitEvent(p, victim, record, dmg);     // FCW-31: before the damage is applied (`hit.scale`; 1 without a host)
    const laid = scale === 1 ? dmg : dmg * scale;
    const was = overall(victim.health);
    const healthBefore = [...victim.health.hp], armourBefore = [...victim.health.armour];
    const died = applyHit(this.woundable(victim), part, laid, piercing) && !this.deathless(victim);   // CPS cell-alive
    this.send(victimId, { type: 'hurt', health: [...victim.health.hp], from: [...from], part });
    this.combat(p, victim, { ...onBody, status: 'applied', rawDamage: laid, healthBefore, armourBefore, killed: died });
    if (died) this.kill(victim, p, this.weaponName(record.id, record.name), 'weapon', deathCause('bullet', part), deathClip('bullet', part, victim.sim.walker.posture, this.opts.random), undefined, part);
    else this.flinch(victim, part, was);
  }

  /**
   * The owner, 2026-10-02: "Other players do not see a hit animation on somebody." A round that leaves its victim alive
   * with less health flinches it (`FUN_005a54d0` L461394-461408: the overall health down, L461397; not a fall's nor a
   * blast's, cause 7 / 4, L461402) in a clip of the part's list for its stance (`flinchClip`, `FUN_005a0270`), played on
   * the victim's console and sent to every other as its motion (`FUN_005a2690` -> `FUN_00588ab0` L446015 ->
   * `FUN_002bbaf0` L160773, kind 0xf). The room draws the clip once and tells every page, the victim's own too
   * (MATCH-FIX-2: the game plays that same motion on the victim's own actor before it sends it, `FUN_00588bc0`
   * L460019): the others play it on the victim's body (`../../viewer/src/remotePlayers` `flinch`), the victim's page on
   * its own (`../../viewer/src/walk` `setFlinchPose`). The same event, not a clip on `hurt`: one draw for every page, a
   * `hurt` the armour wholly took carries none, and a page from before it ignores its own id's `flinch` as it always has.
   */
  private flinch(victim: Player, part: number, was: number): void {
    this.hurtVoice(victim, was);
    if (!victim.alive || !(overall(victim.health) < was)) return;
    // PF-21: FUN_005a2690's gate first (FLINCH_GATE_READING): a refused flinch sets no motion flag 0x4 (D:L460018-460025),
    // so it holds no reload window either; the row is a stance change's origin while under half done (FUN_005a0270
    // L458746-458775, FLINCH_STANCE_READING).
    if (this.flinchRefusedOn(victim)) return;
    this.stopVictory(victim.id);   // research 303: the accepted flinch clears the action stack (0x005a2ee0 -> FUN_0058a4d0)
    // NU-1b B7 (research 313 s4; `CLIMB_HIT_CANCELS_READING`; PTW.R3 with `../../viewer/src/walk` `setFlinchPose`): the
    // flinch taken pops a running climb first (`FUN_005a2690` D:L460018-460019) -- settled on the floor pick, `Stand ->
    // Hang` handed to the fall -- before the stance row is read (`flinchBodyOf`) and the window's air (`flinchState`).
    victim.sim.moves?.flinchPop?.(victim.sim.walker);
    const clip = flinchClip(part, flinchBodyOf(victim.sim.walker), this.opts.random);
    // PF-18: the flinch is room state (PF.R37); its window told with it, for the victim's page to undo a reload it sent
    // inside it before it knew (`../../viewer/src/net/flinchReload`).
    const held = this.flinchState(victim, clip);
    this.broadcast({ type: 'flinch', id: victim.id, clip, ...(held ? { from: victim.flinchFrom, until: victim.flinchUntil } : {}) });
  }

  /**
   * PF-21 (research 217 s4): whether `FUN_005a2690` (D:L459887-460017) refuses the victim's flinch now
   * (`flinchRefused`): its mover's action, overlay and traversal clip, and the launcher's raise or lower on its own clock
   * (`heldReadyAt` / `firearmReadyAt`, `Rifle -> Launcher` / `Pistol -> Launcher` playing).
   */
  private flinchRefusedOn(victim: Player): boolean {
    const w = victim.sim.walker;
    return flinchRefused({
      action: w.action, overlay: w.overlay, traversal: victim.sim.moves?.pose() ?? null,
      launcher: victim.ran < Math.max(victim.heldReadyAt, victim.firearmReadyAt),
    });
  }

  /**
   * PF-18 (ruling PF.R37; research 194 A03, 218 §2): the flinch held as the victim's state -- `FUN_005a2690` sets its
   * motion flag 0x4 (D:L460018-460025), on which `FUN_005b4340(actor, 3)` refuses a reload (D:L469494-469504) -- from the
   * victim's next command to its clip's pop at its last key on the one-shot clock, `T x ((n - 1) / n)^2` of its
   * `motion.rdr` playback T and `MOTION_P.ZAR` keys n (PAR-58, research 230 section 5.2 item 3: `FUN_00582540`'s end test,
   * `FUN_0028c6e0` D:L134283-134302, and `FUN_005870e0` D:L418203; the page's `flinchPose`), whole commands up, on the
   * commands' seqs (the `reload` event names one; the page's undo reads the same, `../../viewer/src/net/flinchReload`).
   * The stick's cut before it: `flinchCut` (PAR-60, research 230 section 5.2.1). A flinch over an open one keeps its start and
   * ends with the new clip (the events carry the merged window). Without `motion.rdr` or the clip's keys (a room started
   * without the clips) no flinch is held -- no length is guessed -- and false is returned.
   */
  private flinchState(victim: Player, clip: string): boolean {
    const playback = this.clips?.table?.get(clip)?.playback ?? null;
    const keys = this.clips?.clips.find((c) => c.name === clip)?.frameCount ?? null;
    if (playback === null || !(playback > 0) || keys === null) return false;
    // A flinch over an open one restarts the clip but the motion flag 0x4 never cleared: the window keeps its start (a
    // reload already dropped, or sent and undone on the page by the first event, stays inside) and runs to the new end.
    const next = victim.sim.seq + 1;
    if (!(victim.flinchUntil > next) || !victim.flinchGatesReload) victim.flinchFrom = next;   // #485 F1: a door clip's window is no refusal to keep
    victim.flinchGatesReload = true;
    victim.flinchUnder = null;                                    // LATER 363: `FUN_0058a4d0` pops the stack to its base first (D:L460018)
    victim.flinchCutFrom = -1;                                    // the six flinches carry no NoInterrupt
    victim.flinchAt = next;                                       // PAR-60: the new clip's push, which its stick's cut counts from
    victim.flinchUntil = next + flinchCommands(playback, keys);   // the NEW clip's end (the original pops the first flinch and plays the new one, FUN_0058a4d0); the start kept while the old window is open
    victim.flinchAir = victim.sim.walker.airborne ? next : -1;    // PAR-65: pushed in the air, the fall covers it from the next command (`flinchLanding`)
    return true;
  }

  /**
   * PF-18 (PF.R37; research 150 §3.7, 218 §2): a lock just set (`setLock`) follows its clip's life -- the still clip's
   * cut on this room's own mover ends it at the carried overlay's last key or at the cut (`./reloadLock`). The clip's
   * first command is the lock's timer end (`lockTimer`); the commands already run since (a reload is decided after the
   * command after its own) are read from `cutLog`, the rest as they run (`watchCut`). Without the clips: the start's length.
   */
  private lockLife(p: Player, w: 0 | 1, posture: AimFrame['posture'], moving: boolean, family: ReloadLifeSpec['family'], seconds: number): void {
    const spec = reloadLifeSpec(this.clips?.clips ?? null, this.clips?.table ?? null, posture, moving, family, seconds);
    p.reloadLife[w] = spec && !spec.moving ? { ...stillClipClock(p.lockTimer[w]), spec } : null;
    for (const e of p.cutLog) this.cutAt(p, w, e.count, e.push, e.airborne, e.bare);
  }

  /**
   * PARITY-1 D02 (research 251 s6): `FUN_0057e1b0` refuses the jump while the top of the body's stack is not looped
   * (D:L440805-440810) -- here the weapon in hand's still reload or after-shot clip on its life (`reloadLife`), from its
   * first command (the kit's timer puts nothing on the stack, D:L476550-476558) to its last key or its cut, which
   * `watchCut` reads after the command ran: the jump is read before the cut (`FUN_00550ef0` D:L418119-418130 before
   * D:L418174-418190). The page asks the same life (`../../viewer/src/stillReloadLife`). A move holding the mover takes
   * the press as its own (`MoverSim.jump`): the climb's start pops the stack before it pushes its own actions
   * (`FUN_00580b70` D:L442186-442214, D:L442288-442293), so the still clip is no longer the top, and the hang lets go under
   * its own looped top (`FUN_00581dc0(a, -1)`, D:L418136-418139; review F3, research 251 s6). Without the clips no life is
   * held and nothing is refused (research 251 s6). `count`: the command's own (review F4: a dropped backlog's command is
   * asked at the count the room would have run it at, its life not watched past the last command run -- so the life's
   * end is `cutAt`'s, read at the command before: `reloadEnded`, the driver's end test on the lagged clock, PAR-69 --
   * was its last key).
   *
   * PAR-78 (research 230 section 5.2.5; PTW.R3 with `../../viewer/src/walk` `WalkMode.jump`): the flinch is a one-shot on
   * top too (`FUN_005a2690` D:L460019; `motion.rdr` looped 0), so a jump on a command `seq` inside its window
   * (`flinchFrom` .. `flinchUntil`, `flinchOnTop`) is spent and refused the same way (D:L418119-418132) -- the pop's own
   * command too, cut (`flinchCut`, after it ran) or uncut (`flinchUntil`; review F1), the jump read before both pops. The
   * same `!busy()` clause holds. No flinch (`flinchFrom` -1): no window.
   *
   * PAR-81 (research 230 section 5.2.6; PTW.R3 with `../../viewer/src/walk` `WalkMode.jump`): under the launcher's anim set
   * (`launcherSet`, from the raise's command through the lower's end) `FUN_005b4340(actor, 0xb)` refuses the jump
   * (D:L469466-469471) at the press (`FUN_00594cf0` D:L453211-453213) and in `FUN_0057e1b0` (D:L440806) -- before the
   * `!busy()` clause, as the press gate is (`LAUNCHER_SET_MOVES_READING`).
   */
  private jumpRefused(p: Player, seq: number, count: number = p.ran): boolean {
    if (flinchOnTop(p.launcherSet, seq) && (LAUNCHER_SET_MOVES_READING === 'refused under a move' || !p.sim.moves?.busy())) return true;
    if (p.sim.moves?.busy()) return false;
    if (flinchOnTop(p.flinchFrom < 0 ? null : { start: p.flinchFrom, until: p.flinchUntil }, seq)) return true;
    const life = p.reloadLife[p.sim.weapon];
    if (life === null || count < life.start) return false;
    // PAR-79: covered by the fall (the mover refuses in the air first), or the command after a clipless landing's hand-back,
    // whose end the landing's command did not ask (`stillClipFlight`): on top for this command's read either way.
    if (life.air >= 0 || (life.back >= 0 && count - 1 === life.back)) return true;
    const before = count - 1 - life.start - life.stood;
    return before <= 0 || !reloadEnded(life.spec, before / TICK_HZ);
  }

  /** PF-18: after a command ran, its cut axes logged (`reloadCutOf` on the mover's cut stick and turn) and each watched clip asked. */
  private watchCut(p: Player): void {
    const push = reloadCutOf(p.sim.walker.cutStick, p.sim.turn, !p.sim.walker.cutAsked);   // PAR-64: the command's stick; none in the air (PAR-60 F2) nor on a bare landing (PAR-62)
    // PAR-79: the body in the air after the command, or back on the floor by a landing with no clip (this command's own,
    // `Player.lastLanding` not yet taken by `run`): the fall's cover and the clipless landing's hand-back (`cutAt`).
    const sw = p.sim.walker, landing = sw.landing;
    const airborne = sw.airborne, bare = !airborne && landing !== null && landing !== p.lastLanding && landing.clip === null;
    p.cutLog.push({ count: p.ran, push, airborne, bare });
    if (p.cutLog.length > CUT_LOG) p.cutLog.shift();
    this.cutAt(p, 0, p.ran, push, airborne, bare);
    this.cutAt(p, 1, p.ran, push, airborne, bare);
    this.basePopCut(p);                                          // LATER 560: a start's or a mount's pop, first (as the page's `basePopStep`)
    this.flinchLanding(p);                                      // PAR-65, PAR-71: the flinch covered by the fall, and at the body's return to the floor
    this.flinchCut(p, push);                                     // PAR-60: the flinch's cut on the same axes
    this.flinchUncover(p);                                       // LATER 363: the push's pop hands a covered flinch back
  }

  /**
   * LATER 560 (research 92 section 4, "LATER 560"; its review F1; reading, pending review; PTW.R3 with
   * `../../viewer/src/walk` `basePopStep`): a climb's start, a `Climb over` start or a ladder's mount heard inside command
   * `sim.seq`'s run (`basePopAt`, `watchMoves`) popped the flinch on top with the stack -- `FUN_00580b70`
   * D:L442186-442214, `FUN_00580a80` D:L442151-442163, `FUN_0057f880` D:L441547-441558 -- in the driver's pass
   * (`FUN_00550ef0` D:L418132). The window ends at that command, as the stick's cut in the same pass ends it at its own
   * (D:L418174-418190, `flinchCut`): the reload's flag 0x4 is asked after the pass, from the kit's frame `FUN_005c0fd0` in
   * the actor's post-tick (D:L417907; research 230, PAR-67), so a reload named at the command is no longer the flinch's.
   * Laid after the command, so the stance asked in its run still finds the flinch on top (`oneShotOnTop`; the original's
   * stance gate runs before the driver, LATER 543's reading). That ordering argument holds for the mechanism pins; a
   * real start owns the tick (`Walker.step60` returns on an owned tick before `retryStance`, mover.ts ~3228-3231;
   * `startClimb`/`touchLadder` own it), so `retryStance` waits for the climb's end (the re-look). Was: ended at
   * `sim.seq + 1` inside the run.
   */
  private basePopCut(p: Player): void {
    const seq = p.sim.seq;
    if (p.basePopAt === seq && p.flinchUntil > seq) { p.flinchUntil = seq; p.flinchAir = -1; }
    p.basePopAt = -1;
  }

  /**
   * LATER 363 (research 92 section 4, "A flinch under the push"; the original's rule): a door push covered a flinch
   * without popping it (`doorMotion`, `Player.flinchUnder`). The push's pop -- its clip's end (`FUN_00582540` D:L418193,
   * `FUN_005870e0` D:L418203) or the stick's cut (`flinchCut`) -- takes one play off (`FUN_00589aa0` D:L446479), and the
   * flinch below is the top again with its phase kept (`FUN_0028da00` D:L135098-135110) and its flag 0x4, which refuses a
   * reload (`FUN_005b4340` D:L469494-469504 on the top, `FUN_00555170` D:L419945): from the pop's command (the push's
   * window end, `flinchUntil`) for the commands it had left at the push, at least one -- PAR-71's hand-back count
   * (`flinchLanded`) -- its stick's cut counted from there. Asked after each command, once the next is past the push.
   */
  private flinchUncover(p: Player): void {
    const u = p.flinchUnder;
    if (!u || p.flinchGatesReload || p.sim.seq + 1 < p.flinchUntil) return;
    const back = flinchLanded({ start: u.start, until: u.until }, p.flinchUntil, true, u.at);
    p.flinchUnder = null;
    p.flinchFrom = back.start; p.flinchAt = back.start; p.flinchUntil = back.until;
    p.flinchGatesReload = true;
    p.flinchCutFrom = -1;                                         // the six flinches carry no NoInterrupt
    p.flinchAir = -1;                                             // on the floor or not, `flinchLanding` asks the cover from here
  }

  /**
   * PAR-65 (research 230 section 5.2.4; PTW.R3 with `../../viewer/src/walk`): a flinch pushed in the air (`flinchState`,
   * `Player.flinchAir`) replaced the launch or the fall (`FUN_0058a4d0` / `FUN_00588bc0` D:L460018-460019) and the fall
   * covers it from the next command (`FUN_005af930` D:L466956-466970); in the air its window is left as the event told
   * it (a reload there is refused as airborne first, `reload`; the stick cuts nothing there, `watchCut`). At the command
   * the body is back on the floor (`flinchLanded`): a landing with no clip (this command's own, `Player.lastLanding` not
   * yet taken by `run`) hands it back whole from this command -- its window and its stick's cut start again here
   * (`FUN_00589aa0` D:L466900-466901) -- unless this is the push's own first command; else it is popped here.
   *
   * PAR-71 (research 230 section 5.2.4, "PAR-71"): a flinch pushed on the floor is covered at the first command its body
   * runs in the air inside its window (`flinchCovered`: the fall pushed over it, `FUN_005af930` D:L466956-466970), at the
   * phase it reached (only the top advances, `FUN_0057a330` D:L438708); handed back by a clipless landing with its phase
   * kept (`FUN_0028da00` D:L135104-135107), its window runs the commands it had left from this command, its stick's cut
   * from here (`flinchLanded`). A clip landing pops it here, as above.
   */
  private flinchLanding(p: Player): void {
    const w = p.sim.walker;
    const window = { start: p.flinchAt, until: p.flinchUntil, ...(p.flinchCutFrom >= 0 ? { cutFrom: p.flinchCutFrom } : {}) };
    if (p.flinchAir < 0) {
      if (flinchCovered(window, p.sim.seq, w.airborne)) p.flinchAir = p.sim.seq;   // PAR-71: walked off mid-flinch
      return;
    }
    if (w.airborne) return;
    const landing = w.landing;
    const bare = landing !== null && landing !== p.lastLanding && landing.clip === null;
    const back = flinchLanded(window, p.sim.seq, bare, p.flinchAir);
    // LATER 363's review F1: a landing with a clip pops the stack to its base (`FUN_0058a5e0` D:L466897, `FUN_005af590`
    // D:L466691-466693) -- a flinch a door push covered goes with the push, nothing handed back at its pop.
    if (!bare) p.flinchUnder = null;
    p.flinchAir = -1;
    p.flinchAt = back.start;
    p.flinchUntil = back.until;
    p.flinchCutFrom = back.cutFrom ?? -1;
  }

  /**
   * PAR-60 (research 230 section 5.2.1; PTW.R3 with `../../viewer/src/walk` `WalkMode.setFlinchPose`): the stick's cut
   * of the flinch. Before its end test the ground driver `FUN_00550ef0` pops the top one-shot when a move axis or the turn
   * is past 0.1 (D:L418180-418185; `push`, the test `reloadCutOf` makes on this mover) and `FUN_00587c20` lets it -- the
   * phase past the clip's `NoInterrupt`, none on the six flinches (D:L445550-445556) -- from the second driver tick that
   * sees it (`FLINCH_CUT_DELAY_READING`: `flinchCutAt`; PAR-61, issue #160). The pop lifts the reload's refusal (0x4)
   * with it: the window ends at this command, the first a reload is taken at. The cut is not sent: the push was (kind
   * 0xf, `FUN_00588ab0`
   * D:L446015-446028), the pop sends nothing of its own (`FUN_005870e0` D:L445091-445251, `FUN_00589aa0`); the event
   * told at the hit keeps its window, which the victim's page cuts on its own commands as here. Only commands this room
   * runs are asked: one lost past `GAP_WAIT` or dropped with a backlog (`dropBacklog`) cuts on the page and not here
   * (review F1, a known gap under a degraded network: research 230 section 5.2.2).
   */
  private flinchCut(p: Player, push: boolean): void {
    const w = { start: p.flinchAt, until: p.flinchUntil, ...(p.flinchCutFrom >= 0 ? { cutFrom: p.flinchCutFrom } : {}) };
    if (push && flinchCutAt(w, p.sim.seq)) p.flinchUntil = p.sim.seq;
  }

  /**
   * PF-18: weapon `w`'s watched clip at the command of count `count` (`push`: its cut axes past 0.1). Played out
   * (`reloadEnded`: the driver's end test on the lagged clock, PAR-69 -- was its last key), it is no longer watched;
   * cut (`reloadCutAt`), the lock ends at `count` + the life left in whole commands up (never past the start's end),
   * and on the room's clock by the same shift. PAR-79 (research 251 section 12.3, "PAR-79"; PTW.R3 with
   * `../../viewer/src/stillReloadLife`): `airborne` / `bare` -- the fall covers the clip and a clipless landing hands it
   * back (`stillClipFlight`): its clock stands from the cover to the landing (`stillClipSeconds`), nothing is asked of it
   * in the air nor on the landing's command, and its cut waits a game frame past the landing (`stillClipCuttable`). The
   * lock (`reloadUntil`) is the start's length uncut, as before (research 218 s2.2's owed uncut lock).
   */
  private cutAt(p: Player, w: 0 | 1, count: number, push: boolean, airborne = false, bare = false): void {
    const life = p.reloadLife[w];
    if (!life || count <= life.start) return;
    if (!stillClipFlight(life, life.spec.family, count, airborne, bare)) return;
    const t = stillClipSeconds(life, count);
    if (reloadEnded(life.spec, t)) { p.reloadLife[w] = null; return; }
    if (!push || !stillClipCuttable(life, count)) return;
    const cut = reloadCutAt(life.spec, t);
    if (!cut) return;
    p.reloadLife[w] = null;
    const until = count + Math.ceil(cut.left * TICK_HZ - 1e-9);
    if (until >= p.reloadUntil[w]) return;
    p.lockClock[w] -= p.reloadUntil[w] - until;
    p.reloadUntil[w] = until;
  }

  /**
   * M4 (research 94 §C2.1, R94.10; research 91 §1.1): a shotgun's ray on a victim -- honoured **once a volley** (the
   * victim's `+0x1048` guard, `FUN_005abbc0` L464704-464737), whatever part it met: the receiver re-counts the pellets by
   * the range (`shotgunPellets`, `FUN_005a1620`), each to a part by the fragments' table (`fragmentPart`, `DAT_00650900`
   * / `DAT_006508f8`) at `pelletDamage`, the raw ammo's damage and piercing (research 94 C2.1); the last
   * pellet's part names the death. The push it sets (`FUN_0057ed10`) has no traced reader: `BLOWBACK_CONSUMER_READING`.
   */
  private volleyHit(p: Player, victim: Player, record: WeaponRecord, distance: number, from: V3, report: Partial<CombatReport> & { request: string }): void {
    const volley = p.volley;
    if (!volley || volley.hit.has(victim.id)) return;
    volley.hit.add(victim.id);
    const raw = pelletDamage(record, distance);
    if (raw === null) { this.combat(p, victim, { ...report, status: 'miss', reason: 'beyond range' }); return; }
    // FUN_005a1b80 D:L459543-459566: the packet gates the hit; each pellet reads the ammo's own floats.
    // Neither raw damage nor piercing passes through the packet quantiser here.
    const dmg = raw, piercing = record.piercing;
    this.countShot(p, false, victim);                            // PF-26: the shell's hit, once a shell
    const n = shotgunPellets(distance, this.opts.random);
    const scale = this.ruleHitEvent(p, victim, record, dmg * n); // FCW-31: the shell's pellets, before they are applied (`hit.scale`)
    const laid = scale === 1 ? dmg : dmg * scale;
    let part = -1, died = false;
    const was = overall(victim.health);
    const healthBefore = [...victim.health.hp], armourBefore = [...victim.health.armour];
    const hits: { part: number; rawDamage: number }[] = [];
    // CPS cell-alive (the batch-3 review, F4): one health the shell's pellets are laid on -- the victim's own, or the
    // deathless seat's one copy -- so its loop stops at the lethal pellet as a mortal seat's does; its death masked after
    const wounded = this.woundable(victim);
    let lethal = false;
    for (let i = 0; i < n && !lethal; i++) {
      part = fragmentPart(this.opts.random);
      hits.push({ part, rawDamage: laid });
      lethal = applyHit(wounded, part, laid, piercing);
    }
    died = lethal && !this.deathless(victim);
    if (part < 0) return;
    this.send(victim.id, { type: 'hurt', health: [...victim.health.hp], from: [...from], part });
    this.combat(p, victim, {
      ...report, status: 'applied', part: hits.length === 1 ? part : null, hitLocations: hits, rawDamage: laid * hits.length, healthBefore, armourBefore, killed: died,
    });
    if (died) this.kill(victim, p, this.weaponName(record.id, record.name), 'weapon', deathCause('bullet', part), deathClip('bullet', part, victim.sim.walker.posture, this.opts.random), undefined, part);
    else this.flinch(victim, part, was);
  }

  // ---- doors (socomlegacy/docs/research/92-doors.md) ----

  /**
   * PAR-74 (research 251 section 12.5, "PAR-74"; reading, pending review): the pass of the `Place claymore` push a command's
   * hold code stands for (`MoverSim.holdPass`, asked for that code alone). The code is the claymore's and the PMN's, pushed
   * after the frame's driver (the default), and the bomb's plant's, pushed before it (`../../viewer/src/bombPage`
   * `PLANT_PUSH_PASS`); the command carries the code alone, so the room tells them by its own bomb: while this player's
   * placement runs (`BombAuthority`'s, `PLACEMENT_S` -- the one the page hears and starts the plant's clip on, `bombPage`
   * `startOwnClip`), its first such code is the plant's (`'before'`), once a placement (`Player.plantClipSince`). A port
   * limit, not a reading [named in research 251 section 12.5, "PAR-74"]: a claymore's or a PMN's code on this player's
   * placement commands before the plant's clip, the plant's clip arriving after the placement's 2.25 s, or any placement
   * whose page lays no plant clip (its mover refusing it; a takeover mid-placement -- PAR-74's review), parts the
   * room's clock from the page's by a command or two. The manual drop's clip (`BOMB_DROP_PUSH_PASS_READING`, `'before'`)
   * is not derived here: the room names the manual drop since the online-parity sweep's P25 (`BombWire.dropWhy`) and the
   * dropper's page plays its clip on that pass, while this answers the plant's alone -- the drop's hold is laid on the
   * code's default, after the driver, two commands from the page's at its end (LATER 659).
   */
  private placingPass(p: Player): HoldPass | undefined {
    const h = this.bomb?.wire().hold;
    if (h?.kind !== 'place' || h.by !== p.id || h.sinceTick === p.plantClipSince) return undefined;
    p.plantClipSince = h.sinceTick;
    return 'before';
  }

  /** XR-05: a player as the bomb sees it (`./bomb` `BombActor`); B194: its facing and its hand, for the plant's hand. */
  private bombActor(p: Player): BombActor {
    const s = p.sim.walker.state;
    return { id: p.id, team: p.team, alive: p.alive, feet: () => [s.x, s.y, s.z], yaw: () => s.yaw, pistol: () => p.sim.walker.hand === 1, posture: () => p.sim.walker.posture, sees: (c) => this.plantAimSees(p, c) };
  }

  /**
   * PLANT-AIM (`PLANT_REACH_READING`; research 214 §2): the plant's pick the page named, re-picked on this tick as the
   * original re-picks every frame of the hold (`FUN_00594cf0` D:L453258, `FUN_005920c0` D:L451495) -- the surface the
   * room takes, or null. The re-pick is the page's own (`plantPickFrom`, `actionRayDetail`), from the camera, as the
   * original's leaves from it (`FUN_005aa6e0` with `cam+0xd8`, D:L142028): first along the newest command's look from the
   * room's eye (`orderOrigin`, toward that look's far point, `ShotCone.lookFar`) -- so a page that names its pick only when
   * it changes (`BombPage.aimed`) is judged on the look it has now -- then from the page's eye held to the camera's locus
   * (`pageEye`) through the named point. It must strike the named node; its point is the reach's (`holdKind`).
   */
  private plantAimSees(p: Player, c: PlantAim): PlantPick | null {
    const seq = p.sim.seq, point = c.surface.point, grid = this.map.grid, actions = this.world.meta.actions;
    const pick = (eye: readonly number[], far: readonly number[]) => plantPickFrom(grid, eye, far, c.surface, actions, (n) => surfaceMaterial(n, ''));
    // One frame for the eye and the look: the command's own, else the newest the cone holds (a dropped command's has none).
    const f = p.cone.frame(seq) ?? p.cone.latest(), far = f ? p.cone.lookFar(f.seq) : undefined;
    const own = f && far ? pick(this.orderOrigin(p, f.seq), far) : null;
    if (own) return own;
    for (const eye of this.pageEye(p, p.cone.framesAround(seq), c.eye, point)) {
      const got = pick(eye, [eye[0] + (point[0]! - eye[0]) * 2, eye[1] + (point[1]! - eye[1]) * 2, eye[2] + (point[2]! - eye[2]) * 2]);
      if (got) return got;
    }
    return null;
  }

  /**
   * XR-05: the bomb's manual drop (`bombAction` 'drop', action 6): from a living player, shaped (a whole `seq`, the
   * action 'drop') or dropped 'shape'; the bomb judges it (`BombAuthority.manualDrop`) and a refusal is dropped by why.
   * A spectator's, or one in a room without the bomb, is nothing.
   */
  private bombAction(id: number, ev: Record<string, unknown>): void {
    const p = this.players.get(id);
    if (!p || !this.bomb) return;
    if (!isInt(ev.seq) || ev.action !== 'drop') return this.dropped('bombAction', 'shape', p);
    if (!p.alive) return this.dropped('bombAction', 'not alive', p);
    const why = this.bomb.manualDrop(this.bombActor(p));
    if (why) this.dropped('bombAction', why, p);
  }

  /**
   * A client's action on the door under its reticle: taken from a living player within the door's reach of its leaf
   * (the client picked it as the game does, `pickDoor`; the server, which does not see the view, checks the reach);
   * `DoorSet.use` refuses it mid-swing, as `FUN_002b44e0` does. LATER 362: the animation is the room's pick from the
   * press the page chased and sent (`doorPick`: the kick at 0.5 or more on a two-animation door; the network's
   * bookkeeping, the room seeing no pad) -- clamped to [0, 1], missing or not a number an older page's: 0, the open --
   * and every page is told it (`doorUse`) for the swing it follows.
   */
  private useDoor(id: number, door: number, press?: unknown): void {
    // HOTFIX DOOR-RESET: each refusal named in the drop log (the server's per-second log only: `logOnly`); was silent.
    const p = this.players.get(id);
    if (!p) return;
    if (!Number.isInteger(door) || door < 0 || door >= this.doors.count) return this.dropped('door', 'shape', p, true);
    if (!p.alive) return this.dropped('door', 'dead', p, true);
    const s = p.sim.walker.state;
    if (!doorInReach(this.doors, door, [s.x, s.y, s.z])) return this.dropped('door', 'reach', p, true);
    // V13-3b (research 386 §4): a door whose node is off -- Blizzard's `door_outhouse1/2` once their outhouse blew
    // (`outhousedoor1/2`) -- is never picked: the pick's ray query (`FUN_0031e160` -> `FUN_002d4780`) passes only an
    // owner with `m_active` (D:L174789-174790), so `FUN_005aa240` never takes its action. The page's `pickDoor` is gated
    // the same way (`modelGate`); this refuses a late or forged packet the room would otherwise swing.
    const node = this.doors.specs[door]?.path;
    if (node !== undefined && !this.world.isActive(node)) return this.dropped('door', 'inactive', p, true);
    const level = typeof press === 'number' && Number.isFinite(press) ? Math.min(1, Math.max(0, press)) : 0;
    const spec = this.doors.specs[door];
    const pick = spec ? doorPick(spec, level) : 0;
    if (this.doors.use(door, [s.x, s.y, s.z], p.id, pick)) {
      this.broadcast({ type: 'doorUse', door, pick });
      if (spec) this.ruleEvent({ name: 'interact', player: p.id, id: spec.node });   // FCW-31: the door by its node's name
    } else {
      // `DoorSet.use`'s refusals: no program at the pick (nor a first), else mid-swing, else locked (valve 99).
      const why = spec && !(spec.programs[pick] ?? spec.programs[0]) ? 'noprogram' : this.doors.state(door).busy ? 'busy' : 'locked';
      this.dropped('door', why, p, true);
    }
  }

  /**
   * DOORS (research 92 section 2): the door program's `ai::ANIMATE` pushed anim `type` on the presser (`DoorHooks.animate`,
   * one tick after the use): `Open door`, the clip `seal_open_door` (`openDoorClip`). The original's push
   * (`FUN_00588bc0(actor, type, stance, 0, 0)`, D:L487256-487260) sends itself to every console (D:L446413-446414); here
   * the `motion` event goes to every page, the presser's own included, with the clip's window on the presser's commands
   * (as `flinchState` sizes a flinch's: PAR-58's one-shot end, whole commands up) and the first command its `NoInterrupt`
   * lets the stick cut it (`seal_open_door`'s 0.5, `motion.rdr`: `FUN_00587c20` D:L445550-445556; `noInterruptCommands`)
   * for the page's stick cut. #485's review F1: the room holds the clip as the page does, in the one-shot slot the
   * flinch uses (`flinchFrom` .. `flinchUntil`, `flinchAt`, `flinchAir`, with `flinchCutFrom` and `flinchGatesReload`
   * false) -- the push replaces whatever one-shot was on top, as `FUN_00588bc0` puts it on top -- so `jumpRefused` refuses
   * the jump under it (a one-shot on top, D:L418119-418132; research 230 section 5.2.5), `flinchCut` ends it at the stick
   * past its `NoInterrupt`, `flinchLanding` covers and hands it back, and a death or a new body clears it. No reload is
   * refused under it: the push sets no motion flag 0x4 (the flinch's `FUN_005a2690` does, D:L460021-460024; `FUN_005b4340`
   * D:L469494-469504 reads the top's), so a flinch's refusal still open ends at the push, as the page's gate drops
   * (`../walk` `setFlinchPose` `reloadGate` false); the flinch it covered is the top again at the push's pop, with its
   * refusal (LATER 363: `Player.flinchUnder`, `flinchUncover`). A flinch after the push takes the slot back (`flinchState`). Without the clips no window is
   * sized (none is guessed): the flinch's refusal still ends at the push.
   */
  private doorMotion(type: number, actor: DoorActor): void {
    if (typeof actor !== 'number') return;
    const p = this.players.get(actor);
    if (!p || !p.alive) return;
    const clip = openDoorClip(type, p.sim.weapon === 1);          // LATER 362: the kick's pistol pair (the open has none)
    if (!clip) return;
    const entry = this.clips?.table?.get(clip) ?? null;
    const keys = this.clips?.clips.find((c) => c.name === clip)?.frameCount ?? null;
    const from = p.sim.seq + 1;
    // LATER 363: a flinch still open is covered, not popped -- its window as it stands, for the push's pop to hand back.
    const under = p.flinchGatesReload && p.flinchFrom >= 0 && p.flinchUntil > from ? { start: p.flinchAt, until: p.flinchUntil, at: from } : null;
    if (p.flinchUntil > from) { p.flinchUntil = from; p.flinchAir = -1; }   // the flinch's refusal ends at the push
    const w = entry?.playback && entry.playback > 0 && keys !== null ? pushedWindow(from, entry.playback, keys, entry.noInterrupt ?? null) : null;
    if (w) {
      // N1: a flinch's refusal on top until now keeps its span to the push (`flinchUntil` was cut to `from` above).
      if (p.flinchGatesReload && p.flinchFrom >= 0 && p.flinchUntil > p.flinchFrom) { p.flinchKeptFrom = p.flinchFrom; p.flinchKeptUntil = p.flinchUntil; }
      p.flinchFrom = w.start; p.flinchAt = w.start; p.flinchUntil = w.until; p.flinchCutFrom = w.cutFrom;
      p.flinchGatesReload = false;
      p.flinchClip = isPushedClip(clip) ? clip : null;              // the door-open body hold: the push holds the body (`watchMoves`)
      p.flinchAir = p.sim.walker.airborne ? w.start : -1;           // pushed in the air: the fall covers it (`flinchLanding`)
      if (under) p.flinchUnder = under;                             // a push over a push keeps the flinch below both
    }
    this.broadcast({ type: 'motion', id: p.id, clip, ...(w ? { from: w.start, until: w.until, cutFrom: w.cutFrom } : {}) });
  }

  /**
   * PF-14 (TEAM_SCORE_READING; research 214 s5, 192 s3.6 G26): each side's team score, the objectives' carry
   * (`FUN_00544d60(scorer, 1)`, the game's +0x7c SEALs / +0x80 Terrorists): +1 per living player of the scorer's side,
   * the scorer included, on every objective event. Zeroed with the round (where the round scores are); on the `score`
   * event (`teamScore`, additive); nothing draws it and the respawn result does not read it yet.
   */
  private readonly teamScore = { seal: 0, terrorist: 0 };

  /**
   * PF-14 (research 214 s5, 192 s3.6 / s6.5): an objective event scored to its actor -- a player or its seat id; none
   * (null, or an id no player holds) scores nothing. Its points to the score and the round's score (`objectivePoints`:
   * the plant, defuse and detonation D:L411594-411655, an action's record's `points` `FUN_00545530`), its YOUR STATS
   * line (`statKind`, OBJECTIVE_STAT_KIND_READING) and the side's team carry (`teamCarry`, `FUN_00544d60`
   * D:L411236-411306), counted at the event's tick. Called once per event: by `useAction` beside `markUsed` (a switch),
   * by a destructible's death that runs an action with points (`actionDied`), and -- PF-14b -- by XR-05's bomb on its
   * state transitions only.
   */
  scoreObjective(who: Player | number | null, event: ObjectiveEvent): void {
    this.ruleEvent({ name: 'objective.change', fields: objectiveFields(event.kind) });   // FCW-31: scored or not, it happened
    const p = typeof who === 'number' ? this.players.get(who) : who;
    if (!p || this.players.get(p.id) !== p) return;
    const type = this.map.gameType ?? 0;
    const points = objectivePoints(event, type);
    if (event.kind === 'action' && points <= 0) return;
    p.score += points; p.roundScore += points;
    const kind = statKind(event, type);
    if (kind === 'primary') p.primaryObjs++; else if (kind === 'bonus') p.bonusObjs++;   // HX-5's two count apart ('none')
    // SVC-12d: the planter's +0x38 (FUN_005455d0 D:L411611-411613), the defuser's +0x36 (FUN_00545650 D:L411642).
    if (event.kind === 'plant') p.bombsPlanted++; else if (event.kind === 'defuse') p.bombsDefused++;
    if (carriesTeam(event)) this.teamScore[p.team] += teamCarry(p.team, this.players.values());
    this.scoreDirty = true;
    this.scoreSentAt = -Infinity;                                // MEDIUM-3: a point scored goes out at the next tick, never coalesced
  }

  /**
   * PF-14 (ACTION_POINTS_ACTOR_READING; research 214 s5, 210 s8): the destructibles that `died` (MAP-06's chain: a
   * death's `EXECUTE_ACTION` runs its action -- Vigilance's `access1` runs `set_access1`) each score their action's
   * points (`FUN_00545530`) once a round (`markUsed`, the record's `+0x3f` bit 1) to `actor` -- the charge's owner or a
   * blast's thrower, a round's shooter; none when the owner left (`thrower`).
   */
  private actionDied(died: readonly number[], actor: Player | null): void {
    const actions = this.world.meta.actions;
    for (const id of died) {
      const d = this.world.health.list[id];
      if (!d) continue;
      for (const seq of d.program.sequences) {
        for (const op of seq.ops) {
          if (op.op !== 'executeAction') continue;
          const v = op.anim.toLowerCase();
          const i = actions.findIndex((a) => a.valve.toLowerCase() === v);
          const a = actions[i];
          if (!a || actionPoints(a) <= 0 || this.world.actionUsed(i)) continue;
          this.world.markUsed(i);
          this.scoreObjective(actor, { kind: 'action', points: actionPoints(a) });
        }
      }
    }
  }

  /**
   * XR-04 (research 213 s4, 171 s3-s4): a player's action on a map switch -- Crossroads' `seal_callstrike_1` /
   * `terrorist_callstrike_1` -- the struck surface the page's aim named (as C4's, PF-13): alive; a SWITCH record (a door
   * goes by `door`, the bomb's tents by XR-05's); the struck node at or under the record's (`no action`); the record's own
   * strict reach from the point (`actionAtPick`, `FUN_005aa240` D:L463895/463898: `reach`); the head's line to the point
   * clear (`c4Line`: `walled` / `missed`); not used this round (`used`; `FUN_002b5510` clears it); then its program on the
   * room's silent world (`executeAction`; `busy` while it runs, `FUN_002b44e0` D:L156787). On success the use is marked,
   * every page told (`action`: it runs the program as presentation, PF.R26) and its points scored (PF-14). Its FIRE_WEAPONs
   * hurt nobody (BRIDGE_FIRE_WEAPON_READING, ruling PF.R32: the world's host ignores them).
   * MAP-07: a gate lever takes the same line as every switch (A5: the head's, and the camera's eye at the command only
   * where its look passed through the point; no page-sent eye), then leaves that path: it toggles for the whole round
   * (no `markUsed`, no `action` broadcast -- the page follows the snapshot, and does not re-run a program whose
   * `set_accessN` it does not have), it scores nothing, and it is refused `busy` while its program runs. Nothing to score:
   * every gate lever's record carries `points` 0 (`viewer/test/gatesDisc.test.ts`, MP11 and MP62 on the dev disc), and
   * the original's score after a use (`FUN_002bb5b0` D:L160627-160646, `FUN_00545530`) is reached only for a record
   * whose `+0x38` points are non-zero, so a lever never sets the record's `+0x3f` bit 1 either (research 174 §5.1).
   */
  private useAction(id: number, ev: Extract<ClientEvent, { type: 'action' }>): void {
    const p = this.players.get(id);
    if (!p) return;
    if (!p.alive || this.state.phase === 'over') return this.dropped('action', 'not alive', p);
    const a = this.world.meta.actions[ev.action];
    if (!a || a.typeCode !== ACTION_TYPE_CODES['SWITCH']) return this.dropped('action', 'no switch', p);
    const surface = ev.surface, s = p.sim.walker.state, feet: V3 = [s.x, s.y, s.z];
    if (!under(surface.path, a.path)) return this.dropped('action', 'no action', p);
    if (actionAtPick([a], surface, feet, (v) => this.world.valve(v)) === null) return this.dropped('action', 'reach', p);
    const b = this.startBody(p);
    const head = headEye(this.map.grid, b.feet, headPoint(b), () => true);
    // LATER 121, 139: the camera's eye where it looks; LATER 305: and the page's own eye at the press, where it counts
    // (`pageEye`: added, never in place of the room's).
    const eyes = [...(p.cone.lookAt(ev.seq, surface.point) ? [this.orderOrigin(p, ev.seq)] : []), ...this.pageEye(p, p.cone.framesAround(ev.seq), ev.eye, surface.point)];
    // A crane press names a point on the hook as the page drew it -- its newest snapshot plus one frame -- while this
    // hull is the room's now: the room is ahead by about the round trip plus the snapshot's age (the #337 review's F1).
    const crane = this.cranes.indexByValve(a.valve);
    // The hull is this grid as the previous tick's crane step left it (`room.step` runs the crane after the players).
    // Both hulls start from the disc rest (the page does not step before the room forks it). The slack on the line is
    // along the ray. A shallow look meets the moved face far from the named point; the face itself within that slack
    // is the press. A nearer face of the same node, entered before the point, stays missed.
    // CRANE_PRESS_SLACK_ADAPTATION: the press's lag from the page's view clock (its claim), clamped to `MAX_REWIND_MS`
    // (CRANE_PRESS_LAG_BOUND_ADAPTATION) -- a forged clock widens a crane press by that term at most. The press deliberately
    // keeps the 200 ms floor, not the shots' per-seat cap (NCW-2 B-bound, `rewindCapMs`): a high-ping seat's press counts
    // less of its lag than its shots do.
    const lag = Math.max(0, Math.min(MAX_REWIND_MS / 1000, (this.tick - p.viewTick) / TICK_HZ));
    const slack = crane >= 0 ? cranePressSlack(this.cranes.specs[crane]!, lag) : 0;
    let line = crane >= 0
      ? c4Line(this.map.grid, head, surface, this.map.defaultMaterial ?? '', eyes, slack)
      : c4Line(this.map.grid, head, surface, this.map.defaultMaterial ?? '', eyes);
    // The fallback reads the head's line only, not the camera eyes: `c4Line` keeps the head's first-hit rule whether or
    // not an eye looks (LATER 139), so it adds to a crane's press only the moved face within the slack, never an eye's.
    if (!line.clear && crane >= 0 && line.why === 'missed') {
      const near = craneSurfaceOffRay(this.map.grid, head, surface, slack, this.map.defaultMaterial ?? '');
      if (near) line = near;
    }
    if (!line.clear) {
      // Development builds only (`onActionMiss`): the faces the line just read, so a disc check can compare them
      // with the page's point. Nothing is recorded without it, and the drop is the same either way.
      if (crane >= 0 && line.why === 'missed' && this.opts.onActionMiss) {
        const detail = craneActionMiss(this.map.grid, head, surface, slack, this.cranes.state(crane).offset);
        this.opts.onActionMiss(detail);
        this.lastActionMiss = detail;
      }
      return this.dropped('action', line.why, p);
    }
    // Chain Reaction (research 176 §9.1): the control toggles the hook's translation and keeps the phase. It is not
    // the one-shot `markUsed` path the other switches take; it scores its record once a round (below). The action event is what every
    // client runs. There is no separate lever animation; the mesh swap is the lever. A presentation run changes no
    // node and writes no valve (PF.R26), and crane_onoff's set-2 commands 16, 20 and 5 are unread, so the control
    // meshes follow the snapshot rather than that run. The page copies this snapshot's valve before the next press.
    if (this.cranes.toggleByValve(a.valve)) {
      this.broadcast({ type: 'action', action: ev.action, by: id });
      this.ruleEvent({ name: 'interact', player: id, id: a.valve });   // FCW-31: the switch by its valve's name
      // #337 takeover, point 4: the record's points once a round -- the host's two callers of `FUN_00545530` (D:L160566 in
      // `FUN_002bb310`, D:L160645 in `FUN_002bb5b0`) score only while the record's `+0x3f` bit 1 is clear and points are
      // non-zero, then set it; the third (D:L160668, `FUN_002bb770`) is a peer applying the host's score message, unguarded;
      // `FUN_002b5510` clears the bit at the round. The room is the host. Kept apart from `markUsed`,
      // which would also refuse the hook's next press (`executeAction`'s once-a-round use, XR-04).
      if (!this.craneScored.has(ev.action)) {
        this.craneScored.add(ev.action);
        this.scoreObjective(p, { kind: 'action', points: actionPoints(a) });
      }
      return;
    }
    // MAP-07: a gate lever toggles all round. The snapshot's door tail carries the slide; marking it used would jam it open.
    if (this.gates.has(ev.action)) {
      // Refused while the lever's program runs (`GateSet.use`: FUN_002b44e0 D:L156787), and a refused press is not the
      // pull the close log names.
      if (!this.gates.use(ev.action)) return this.dropped('action', 'busy', p);
      const gateIndex = this.gates.indexOf(ev.action);
      if (gateIndex !== undefined) this.gatePull.set(gateIndex, { id, action: ev.action, seq: ev.seq });
      this.ruleEvent({ name: 'interact', player: id, id: a.valve });   // FCW-31
      return;
    }
    if (this.world.actionUsed(ev.action)) return this.dropped('action', 'used', p);
    if (!this.world.executeAction(a.valve)) return this.dropped('action', 'busy', p);
    this.world.markUsed(ev.action);
    this.broadcast({ type: 'action', action: ev.action, by: id });
    this.ruleEvent({ name: 'interact', player: id, id: a.valve });   // FCW-31
    this.scoreObjective(p, { kind: 'action', points: actionPoints(a) });   // PF-14: FUN_00545530, once (beside markUsed)
  }

  // ---- the manual turrets (MAP-10b; ruling PF.R31; research 215, 177 s2-s6, 193 s2.2/s4.3) ----

  /**
   * A placement's weapon record: the kit tables' `turretRecords` by the arsenal's id of its `WEAPON NAME` -- or PAR-59,
   * class 230's `turret2Records` (MGL FRAG TURRET: its rate, `FireWait` 1, SINGLE) -- or null.
   */
  private turretRecord(place: TurretPlacement): WeaponRecord | null {
    const table = this.kits?.table;
    const item = place.weapon !== null ? table?.arsenal.byName.get(place.weapon) : undefined;
    return item ? table?.turretRecords?.get(item.id) ?? table?.turret2Records?.get(item.id) ?? null : null;
  }

  /**
   * PAR-59 (research 215 s8): the round a placement's weapon launches, or null for a firearm's line -- class 230 (MGL FRAG
   * TURRET) is no bullet (`FUN_003d1e20` D:L324468-324483): the kit's fire (`FUN_005c5340`) hands its own record to
   * `FUN_003d2d70`, whose `FUN_003cb1a0` launches it at its `Muzzle_Velocity` along the line (D:L320727-320731), its timers
   * its `Timer1`/`Timer2` (D:L320736-320739), and the tick drops it by its `Gravity_Acceleration` (`FUN_003ca5a0`
   * D:L320348-320376). Its projectile record is `KitTable.rounds`' (`throwableRecord` of 230, its blast M203 FRAG Ammo's).
   */
  private turretLaunched(place: TurretPlacement): ThrowableRecord | null {
    const table = this.kits?.table;
    const item = place.weapon !== null ? table?.arsenal.byName.get(place.weapon) : undefined;
    return item && itemClass(item.id) === 'turret2' ? table?.rounds.get(item.id)?.record ?? null : null;
  }

  /**
   * A client's `mount` or `dismount` (shape-checked in `text`). A dismount of the turret it holds is kept and taken on the
   * first command above its `seq` the room runs (LATER 104, `takeDismount`: refused 'mounting' while the mount clip plays by
   * the page's count, `FUN_00545ee0` D:L411954-411966, TURRET_RELEASE_SEQ_ADAPTATION); a mount is kept until the first
   * step's top after its command has run (LATER 124, ASK_AT_COMMAND_ADAPTATION), one a seat (a later ask replaces an
   * earlier), and resolved there by the lower seat id (`resolveMounts`). A turret the map has none of is refused here, and
   * a mount naming a command more than `PENDING_TICKS` ahead of the room's count ('ahead').
   */
  private turretRequest(id: number, kind: 'mount' | 'dismount', seq: number, turret: number, word = false): void {
    const p = this.players.get(id);
    if (!p) return;
    const t = this.turrets[turret];
    if (!t) return this.dropped(kind, 'no turret', p);
    if (kind === 'dismount') {
      if (p.mounted !== turret) return this.dropped(kind, 'not mounted', p);
      // Issue #81: the release refuses while the mount clip plays -- `FUN_00545ee0`'s first test (D:L411954-411966;
      // research 215 s7.2). LATER 104 (`TURRET_RELEASE_SEQ_ADAPTATION`, research 215 s7.9): judged on the page's numbering
      // and taken on the first command above `seq` the room runs (`run` -> `takeDismount`), not here at the arrival (was:
      // refused while the room's own steer ran, else released at once -- before a command at or below `seq` still queued).
      // One pending a seat: a later ask replaces it when the pending one would be refused (inside the window), or when both
      // are past it and the later names an earlier command; else the pending one stands -- so a seq claimed ahead delays
      // only its own release, a press repeated neither doubles the release nor counts a second drop. A room without the
      // clips runs no steer but refuses inside the release's wait all the same (LATER 151, `seatOff`). The room's own
      // releases (death, leave, the knock, the round's start) go through `releaseTurret` directly, not this ask.
      const past = (s: number): boolean => p.seatOff === null || s >= p.seatOff;
      if (p.dismount === null || !past(p.dismount) || (past(seq) && seq < p.dismount)) p.dismount = seq;
      return;
    }
    // LATER 124: the bound a timed event waits within (`PENDING_TICKS`, the queue's 10 s: `QUEUE_MAX`), on the seq at arrival.
    if (seq - p.sim.seq > PENDING_TICKS) return this.dropped(kind, 'ahead', p);
    const at = this.mounts.findIndex((m) => m.id === id);
    if (at >= 0) this.mounts.splice(at, 1);
    this.mounts.push({ id, turret, seq, at: this.tick, staleAt: p.sim.seq, n: ++p.arrivals, word });
  }

  /**
   * LATER 104 (`TURRET_RELEASE_SEQ_ADAPTATION`, research 215 s7.9; reading, pending review): the seat's pending dismount, at
   * the first command above its `seq` the room runs (`run`, before the command's steer step). Released meanwhile (a death,
   * a leave, the round's reset): nothing. Its `seq` below the mount's window end (`seatOff`: the page's own clip still on by
   * its count; LATER 151: or the release not yet offered, TURRET_RELEASE_WAIT_READING) -- refused 'mounting'
   * (`FUN_00545ee0`'s first test, D:L411954-411966), the occupant told (its own `turret`
   * event, `refused: 'mounting'`: a page that predicted the release undoes it, `TurretPage.take`). The room's own steer
   * still running (a command lost mid-steer: LATER 96) -- held, the merge controller's ruling (b): the steer is never cut,
   * the hold places the body on this command, the next takes it. Else the release (`releaseTurret`), before this command.
   */
  private takeDismount(p: Player): void {
    if (p.mounted === null) { p.dismount = null; return; }
    const t = this.turrets[p.mounted]!;
    if (p.seatOff !== null && p.dismount! < p.seatOff) {
      p.dismount = null;
      this.dropped('dismount', 'mounting', p);
      this.send(p.id, { type: 'turret', ...turretWire(t), refused: 'mounting' });
      return;
    }
    if (p.seat) return;
    // LATER 219 (research 215 s8.6): the release (action 20, `FUN_005a8850`) is set past the prompt's common gate
    // (`FUN_00593500` D:L452277 -> `FUN_005a7de0` D:L462636 -> `FUN_005a7ab0`), which refuses while the kit's timer runs --
    // mounted, the turret's own `ReloadDelay` -- judged on the press's command (its occupant's count, as `turretRound`'s
    // gate), the occupant told as for 'mounting'. The forced release (the knock) is not this ask (`releaseTurret`). An R on
    // the press's own command covers it, as `MOUNT_SAME_COMMAND_RELOAD_READING` reads a lock armed on the ask's (the review's F3).
    const dcount = p.cone.frame(p.dismount!)?.count;
    if (dcount !== undefined ? dcount >= t.lockFrom && dcount <= t.lockUntil : t.reloading) {
      p.dismount = null;
      this.dropped('dismount', 'reload', p);
      this.send(p.id, { type: 'turret', ...turretWire(t), refused: 'reload' });
      return;
    }
    const dseq = p.dismount!;                                    // LATER 109 (F-A): the page's numbering of the press
    p.dismount = null;
    this.releaseTurret(t);
    // LATER 109 (TURRET_RELEASE_TRAVEL_READING): the mount clip reversed (`FUN_005a6eb0` D:L462136-462170), stepped from this
    // command on (`run`); none in a room without the clips.
    p.release = ReleaseTravel.start(mountShape(this.clips?.clips ?? null, this.clips?.table ?? null, p.sim.weapon));
    p.releaseSpan = p.release ? { from: dseq + 1, to: dseq + p.release.ends(1 / TICK_HZ) - 1 } : null;   // LATER 109 (F-A)
  }

  /**
   * The step's mounts (PF.R31; FIRST_REQUEST_WINS_READING, ruling PF.R28: the mounts taken at one step's top go to the
   * lower seat id, whatever order they came in), after an occupant no longer seated here (demoted, replaced) has let its
   * turret go. LATER 124 (ASK_AT_COMMAND_ADAPTATION): a mount is taken only once its own command has run (`sim.seq` at or
   * past its `seq`); else it waits for a later step's top, dropped 'its command never ran' past `PENDING_TICKS`.
   * Each is `FUN_003a90c0`'s test (`canMount`) on the room's own mover: alive, not stale (its command within
   * `FIRE_ARRIVAL_JITTER_TICKS` of the room's count when it came, `staleAt` -- one from the last round is not), holding
   * none, the turret free, no traversal move holding the body, within reach and facing the gun's way. Every page is told
   * the occupant. A1 (MOUNT_GRANT_CHECKS_ADAPTATION): these are the grant's checks, at the ask's command K; the granted turret
   * is reserved (`reserve`) -- an ask with `word` taken at its page's word or the bound (`takeMount`), one without at once.
   */
  private resolveMounts(): void {
    for (const t of this.turrets) {
      if (t.occupant === null) continue;
      const q = this.players.get(t.occupant);
      // A1: a reservation stands while its seat holds it (`Player.reserved`); a take, while its seat is mounted on it.
      if (t.reserved ? q?.reserved?.turret !== t.place.id : q?.mounted !== t.place.id) this.releaseTurret(t);
    }
    // A1 (MOUNT_WORD_BOUND_ADAPTATION): a reservation whose page named no take inside the ask's window is taken at the bound,
    // on the room's count, before this step's commands (`steer.after` the last command run).
    for (const p of this.players.values()) {
      if (p.reserved !== null && p.reserved.m === null && this.tick - p.reserved.at >= MOUNT_WORD_BOUND_TICKS) this.takeMount(p, p.sim.seq + 1, false);
    }
    if (!this.mounts.length) return;
    const ready: MountAsk[] = [];
    for (const ask of this.mounts.splice(0)) {
      const p = this.players.get(ask.id);
      if (!p) continue;
      // LATER 223 (the paced half): a reload or a round named on or before the ask's command is decided once the command
      // after it has run (`timed`); the ask waits for it, so the lock it arms on K is there when the gate is judged. The
      // cost: such a mount is judged once K + 1 has run, so its `after` is K + 1 (LATER 96's steer and LATER 236/237's
      // re-derive follow `after`), and a same-step tie with another asker may shift (PF.R28's lower id is per step).
      // The review's F2, the lossy link: one past its stale bound (`decide`'s, FIRE_ARRIVAL_JITTER_TICKS) arms nothing -- a
      // drop left it due and undecided -- so it holds nothing, unless it is stuck behind one not yet due (`settle` stops
      // there).
      const stuck = p.pending.findIndex((t) => !due(p, t.ev));
      // LATER 249: an event on the ask's own command that arrived after it cannot lock it (`mountKitLocked`), so it holds nothing.
      const held = p.pending.some((t, i) => (t.ev.type === 'reload' || t.ev.type === 'fire')
        && (t.ev.seq < ask.seq || (t.ev.seq === ask.seq && t.n < ask.n))
        && ((stuck >= 0 && i >= stuck) || p.sim.seq - t.ev.seq <= FIRE_ARRIVAL_JITTER_TICKS));
      if (p.sim.seq >= ask.seq && !held) ready.push(ask);
      // LATER 223's review F2: an ask the wait holds while the room runs past its command by more than the jitter waits on
      // an event stuck behind one named ahead (only an out-of-order page): refused 'stale', not taken late.
      else if (held && p.sim.seq - ask.seq > FIRE_ARRIVAL_JITTER_TICKS) this.dropped('mount', 'stale', p);
      else if (this.tick - ask.at > PENDING_TICKS) this.dropped('mount', 'its command never ran', p);
      else this.mounts.push(ask);
    }
    for (const ask of ready.sort((a, b) => a.id - b.id)) {
      const p = this.players.get(ask.id), t = this.turrets[ask.turret]!;
      if (!p) continue;
      if (!p.alive || this.state.phase === 'over') { this.dropped('mount', 'not alive', p); continue; }
      if (ask.staleAt - ask.seq > FIRE_ARRIVAL_JITTER_TICKS) { this.dropped('mount', 'stale', p); continue; }   // LATER 124: at arrival
      // A1 (MOUNT_GRANT_CHECKS_ADAPTATION): the grant's checks, at the ask's command K (LATER 223's wait and LATER 249's tie above).
      if (p.mounted !== null || p.reserved !== null) { this.dropped('mount', 'mounted', p); continue; }
      // A1 (the review's fold): a worded ask is refused as the asker's own ask refuses it (`FUN_00546210`) -- under a
      // knock-down fall (D:L412059-412062, no locality gate; `mountFallRefuses`) and while a `Stand -> Turret` clip plays,
      // forward or reversed (D:L412066-412069: the dismount's reversed clip, `Player.release`). An older page's ask is not
      // judged so: its path stays as before A1 (LATER 109 takes it over the reversed clip).
      if (ask.word && mountFallRefuses(p.sim.walker)) { this.dropped('mount', 'fall', p); continue; }
      if (ask.word && p.release !== null) { this.dropped('mount', 'mounting', p); continue; }
      if (t.occupant !== null) { this.dropped('mount', 'occupied', p); continue; }
      if (p.sim.moves?.busy()) { this.dropped('mount', 'busy', p); continue; }
      // LATER 205 (research 215 §8.7): the offer refuses the mount under the launcher's set -- raised, rising or lowering
      // (`FUN_005a88c0` -> `FUN_005b4340(actor, 10)` D:L463019, D:L469528-469531) -- judged at the ask's command K + 1, the
      // command the page's offer asks it on (`WalkMode.launcherSetOn`, taps + 1; the ask names taps) and the raise's own
      // convention (its set from its command + 1): the review's F1, one edge on both sides. A placement is not asked
      // (`MOUNT_DURING_PLACEMENT_READING`).
      if (flinchOnTop(p.launcherSet, ask.seq + 1)) { this.dropped('mount', 'launcher', p); continue; }
      // LATER 175: the offer's gate at its command; LATER 249: by arrival on it; LATER 220: the whole common gate.
      const shut = this.actionGateShut(p, ask.seq, ask.n);
      if (shut !== null) { this.dropped('mount', shut, p); continue; }
      const s = p.sim.walker.state;
      if (!canMount(t.place, [s.x, s.y, s.z], s.yaw, false)) { this.dropped('mount', 'reach', p); continue; }
      this.reserve(p, t, ask.seq, ask.word);
    }
  }

  /**
   * A1 (LATER 239, 217, 218, 243; MOUNT_GRANT_CHECKS_ADAPTATION; research 215 s8.6): the turret granted at the ask's command
   * `k`. The occupant is set, so every later ask is refused 'occupied' (`FUN_0061e6d0` D:L529427-529430: the master's first
   * grant wins), and every page is told at once (`reserved`, the original's one word: D:L529433 -> each peer
   * `FUN_0061e7f0` D:L529455-529466). The body runs on foot until its page's take (`mountWord`, `run` -> `takeMount`) or
   * the bound. An older page's ask (`word` false) is taken at once, exactly as before A1, with no reservation told.
   */
  private reserve(p: Player, t: TurretState, k: number, word: boolean): void {
    t.occupant = p.id;
    t.reserved = true;
    p.reserved = { turret: t.place.id, k, at: this.tick, m: null, word };
    if (!word) return this.takeMount(p, p.sim.seq + 1, false);
    this.broadcast({ type: 'turret', ...turretWire(t) });
  }

  /**
   * A1 (MOUNT_WORD_BOUND_ADAPTATION): the page's take word -- `m`, the command its take is on, for the turret reserved for
   * it. Refused when it names a command at or below the ask's ('stale') or past the seat's newest + FIRE_ARRIVAL_JITTER_TICKS
   * ('ahead'); the bound then stands. A word for a command already run is taken before the next (the room's count; the page
   * re-keys on the take's `steer.after`). One word a reservation.
   */
  private mountWord(id: number, m: number, turret: number): void {
    const p = this.players.get(id), r = p?.reserved;
    if (!p) return;
    if (!r || !r.word || r.turret !== turret || r.m !== null) return this.dropped('mountTake', 'not reserved', p);
    let newest = p.sim.seq;
    for (const c of p.queue) if (c.seq > newest) newest = c.seq;
    if (m <= r.k) return this.dropped('mountTake', 'stale', p);
    if (m > newest + FIRE_ARRIVAL_JITTER_TICKS) return this.dropped('mountTake', 'ahead', p);
    r.m = Math.max(m, p.sim.seq + 1);
  }

  /**
   * A1: the reserved body taken before command `seq`. This happens in `run`, before the command the page named (`inRun`),
   * or at a step's top: at once for an older page's ask (`reserve`), or at the bound (MOUNT_WORD_BOUND_ADAPTATION). The take
   * trusts the grant (`FUN_005463c0` D:L412095-412318: no occupancy, reach, facing or gate test). For a worded ask it refuses
   * only on its own terms: dead or dying (D:L412134-412139), or a knock-down fall on top (`FUN_00588030` D:L445700-445713,
   * `mountFallRefuses`). On a refusal the turret is released and every page told (`FUN_002c7a60(turret, 1)`
   * D:L412167-412186 -> each peer `FUN_00545ee0`). Holding none and no mount clip playing (D:L412130-412133,
   * D:L412151-412163) hold by construction. Taken, the kit (`mountKit`) and the body (`mountPop`; the push read,
   * `FUN_005a6fc0` D:L462175-462200 -> `FUN_0058c350` D:L447957-447994) are taken first; an older page's take is today's,
   * untouched. Then the hold, as the take always was. `seatOff`, `mountCount`, `steer.after` (the command before `seq`)
   * and the cone's record are all the take's.
   */
  private takeMount(p: Player, seq: number, inRun: boolean): void {
    const r = p.reserved!, t = this.turrets[r.turret]!;
    p.reserved = null;
    t.reserved = false;
    const count = inRun ? p.ran : p.ran + 1;                     // the count of command `seq` (`run` counted it already)
    let carry: { until: number; lands: boolean } | null = null;
    if (r.word) {
      if (!p.alive || this.state.phase === 'over' || mountFallRefuses(p.sim.walker)) {
        this.dropped('mount', p.alive && this.state.phase !== 'over' ? 'fall' : 'not alive', p);
        this.releaseTurret(t);
        return;
      }
      carry = this.mountKit(p, seq, count);
      mountPop(p.sim.walker, p.sim.moves);                       // MOUNT_TRAVERSAL_POP_READING
      p.flinchUnder = null;                                      // LATER 512: the stack to its base (D:L446796-446798), a covered flinch with it
      // LATER 523 (research 215 section 8.6, "The flinch at the take"; PTW.R3 with `../../viewer/src/walk` `mountTake`):
      // `FUN_0058c350`'s `FUN_0058a5e0(actor, 0, 1)` (D:L447984) pops every play (D:L446796-446798), the flinch on top (or a
      // door clip's push) too: its window ends at the take's command, as a push's start ends it (`doorMotion`); the
      // commands before it stay inside. Was: kept.
      if (p.flinchUntil > seq) { p.flinchUntil = seq; p.flinchAir = -1; }
    }
    const s = p.sim.walker.state;
    t.word = r.word;
    t.lastFire = -1e9; t.fireClock = -1e9; t.ammoDirty = false;
    t.fireSchedule = FIRE_GATE_NONE;                             // P3-room (LATER 588 (a)): a new hold's chain starts fresh
    t.mountCount = count - 1;                                    // R1: command `seq` on is the turret's (an older page's: this step's commands)
    // TURRET-AMMO: the turret's rounds poured into the kit slot's ten magazines, the first in the weapon (`FUN_005463c0`
    // D:L412214-412218 -> `FUN_005bc5d0` D:L473877-473906: `Ammo_Capacity` each, the rest last; 0 rounds: all empty).
    if (t.record) {
      t.mags = ringFor(t.record);
      t.mags.restore({ slots: turretPour(t.ammo, t.record.magazine), current: 0 });
    }
    t.reloading = false; t.lockUntil = -1e9; t.lockFrom = -1e9; t.lands = true; t.released = null;
    // A1 (LATER 218): the kit's timer carried onto the turret's slot (`mountKit`); its end is the turret's landing.
    if (carry !== null && t.mags) { t.reloading = true; t.lockUntil = carry.until; t.lands = carry.lands; t.ammoDirty = true; }
    p.mounted = t.place.id;
    if (t.record) p.cone.setWeapon(t.record);                  // TURRET-CONE: the kit's cone on the turret slot (D:L412214-412218)
    p.sim.allowSnap();                                         // OT.R38: the gun's arc sets the facing (`onTurret`)
    // The mount clip's steer onto the seat (`FUN_005463c0` D:L412260-412316; `FUN_005b3340`, the one-shot branch of
    // `FUN_0057a330` D:L439017-439020 -- not `FUN_005b2d20`, the looped one's: research 215 s7.1): the hand's clip's refPt,
    // toward the gun's yaw at the mount (PB-2c: `FUN_005463c0` D:L412268-412297; was the placement's rest facing).
    p.seat = SeatSteer.start(t.place, mountShape(this.clips?.clips ?? null, this.clips?.table ?? null, p.sim.weapon), [s.x, s.y, s.z], t.gunYaw);
    // TURRET-STEER-SEQ (LATER 96): `after`, the command before `seq` in the page's numbering (an older page's and the bound's:
    // the room's count at the send, `sim.seq`; a worded take in `run`: M - 1): the steer steps on each command `run` runs above it.
    const after = seq - 1;
    // LATER 104 (`TURRET_RELEASE_SEQ_ADAPTATION`): the window end in the page's numbering -- `after` +
    // `SeatSteer.ends` (the steer's own ticks and the hold's command), the command on which the page's own keyed clip comes off.
    // LATER 151 (TURRET_RELEASE_WAIT_READING; research 215 s7.11): and never before `after` + TURRET_RELEASE_WAIT_TICKS --
    // online the release is offered only 1250 ms after the mount (`FUN_005463c0` D:L412209-412213, `FUN_005a8850`
    // D:L462975-462993) -- with the clips or without (no steer: the wait alone).
    p.seatOff = after + Math.max(p.seat ? p.seat.ends(1 / TICK_HZ) : 0, TURRET_RELEASE_WAIT_TICKS);
    p.dismount = null;
    p.release = null;                                          // LATER 109: a mount over the reversed clip ends it
    // TURRET-STEER-TICK (LATER 91; research 215 s7.9): while a steer runs, its steps run by the send -- 0: this broadcast
    // precedes the commands above `after` (an older page's: `step`'s `resolveMounts` before `run`; a worded take: `run`,
    // before command `seq`'s step), whose first steps the steer later. A room without the clips runs none and sends none.
    this.broadcast({ type: 'turret', ...turretWire(t), ...(p.seat ? { steer: { ticks: p.seat.steered(), after } } : {}) });
  }

  /**
   * A1 (LATER 218; the push read; research 215 s8.6): the hand's kit at the take, before command `seq` (its count `count`).
   * The take pops the stack (`FUN_0058c350` D:L447983-447988): a reload's or an after-shot's clip ends, and a magazine already
   * in stays (`endKitLocks`). The kit's one timer `+0x820` is no clip -- the take-up zeroes `+0x810`, never it (`FUN_005c4b10`
   * D:L478836, D:L478926) -- so it runs on and ends on the slot in the hand, the turret's (`FUN_005c0fd0` D:L476549-476563 ->
   * `FUN_005c2a90`). A reload's delay (its press, `pressLock`, LATER 72) lands the turret's next magazine, and the rifle's
   * reload is lost; the timer ends where the room's own kit-timer model ends it -- from the press's count, the record's
   * `ReloadDelay` run down as `FUN_005c0fd0` runs it (`turretReloadCountdown`, D:L476549-476563: 61 commands for 1 s) --
   * not at the press window's end (LATER 72's rounding, 60). A bolt's or a pump's after-shot holds the turret's trigger to its end and lands nothing
   * (MOUNT_CARRIED_AFTERSHOT_PLACEHOLDER: `FUN_005c3000` on a turret slot unread). The throw's release request goes: nothing
   * thrown (the take-up's power 0, `FUN_00592d40` D:L478915). Returned: the count the turret's timer stops on and whether it
   * lands, or null.
   */
  private mountKit(p: Player, seq: number, count: number): { until: number; lands: boolean } | null {
    const w = p.sim.weapon, l = p.pressLock;
    let carry: { until: number; lands: boolean } | null = null;
    if (l !== null && l.weapon === w && p.mags[w] === l.ring && seq > l.from) {
      // The review's fold: the kit's timer from the press's command (its count; a command the history no longer holds
      // counted back from this one), run down by the room's own model, `turretReloadCountdown`, with its `lands`.
      const stop = turretReloadCountdown(reloadDelayOf(p.records[w])), until = (p.cone.frame(l.from)?.count ?? count - (seq - l.from)) + stop.commands;
      if (count < until) carry = { until, lands: stop.lands };
    }
    if (carry === null && p.lockKind[w] === 'afterShot' && count < p.lockTimer[w]) carry = { until: p.lockTimer[w], lands: false };
    this.endKitLocks(p, count);
    p.pressLock = null;
    p.throwStart = null;
    return carry;
  }

  /** A1: every lock and clip of either weapon ended at `count`, the take's: the clip cut, the timer handed over (`mountKit`). */
  private endKitLocks(p: Player, count: number): void {
    for (const x of [0, 1] as const) {
      if (!(count < p.reloadUntil[x])) continue;
      p.lockClock[x] -= p.reloadUntil[x] - count;
      p.reloadUntil[x] = count; p.lockTimer[x] = -1; p.lockKind[x] = null; p.reloadLife[x] = null;
    }
  }

  /**
   * A1 (LATER 218): a reload or a round named before a worded take and decided after it (`fire`'s and `reload`'s hand
   * paths; `due` once the next command ran). Its clip is cut and its after-shot carried at the take's count, as `mountKit`
   * does for those decided before it.
   */
  private mountKitLate(p: Player, t: TurretState): void {
    const count = t.mountCount + 1, w = p.sim.weapon;
    if (p.lockKind[w] === 'afterShot' && count < p.lockTimer[w] && t.mags && !t.reloading) {
      t.reloading = true; t.lockUntil = p.lockTimer[w]; t.lands = false; t.ammoDirty = true;
    }
    this.endKitLocks(p, count);
  }

  /**
   * The command a mounted body runs (PF.R31): no stick, no jump, stance, swap, lean, Action or kit hold -- the page's
   * locked walk sends none to its own mover (`../../viewer/src/walk` `setLocked`) -- and the look clamped to the turret's
   * limits (`clampAim`), so the body's yaw and pitch in every snapshot are the gun's aim. The trigger, the view from the
   * head and the binoculars pass; the scope does not (TURRET-CONE's review F2): the occupant never reaches view 4 or above
   * -- `FUN_005445b0` steps past first person only with the actor's `+0xeb8` empty (D:L410791-410806) and holds a
   * THERMAL turret's 2 (D:L410807-410809), the mount sets 1 or 2 (`FUN_005463c0` D:L412248-412254) -- so no mounted command
   * is scoped. A scope raised before the mount is legal (the mount sets the view from it): its frames are no turret round's
   * (`turretRound` refuses a claim dated before the mount, R1) and the mounted line's check takes no scoped frame
   * (`ShotCone.checkLine`). The mover goes only where the mount's steer takes it (`Player.seat`), then where the hold places
   * it each tick (`holdStep`, PAR-44), and is released there (TURRET_DISMOUNT_PLACE_READING).
   */
  private onTurret(p: Player, cmd: Command): Command {
    const aim = clampAim(this.turrets[p.mounted!]!.place, cmd.yaw, cmd.pitch);
    const keep = Button.Trigger | Button.Aim | Button.Binoculars;
    return { ...cmd, forward: 0, right: 0, yaw: aim.yaw, pitch: aim.pitch, buttons: cmd.buttons & keep };
  }

  /**
   * A mounted player's round (PF.R31): the turret's weapon record (PKM TURRET 205, LMG TURRET 207), one of its rounds
   * (from the occupant's magazines, `TurretState.mags`; refused 'reload' inside the reload's `ReloadDelay` and 'empty'
   * when dry: TURRET_RELOAD_READING), its rate (`fire`'s rule over its `FireWait`, on the occupant's command
   * clock and the room's), from the firepoint at the command's clamped aim along the claim's line, inside the turret
   * record's cone about the gun's own line (TURRET_ROUND_LINE_READING; refused 'dir', 'cone: cone' before anything is
   * spent), the cone bloomed by the round (`ShotCone.round` at 'stand': `FUN_005be9a0` D:L475604 -> `FUN_005c5340` ->
   * `FUN_005c3360`). Null: refused (told `dropped`). PAR-59: MGL FRAG TURRET (230) the same, its `round` launched on that
   * line by `fire` (`turretLaunch`). The review's fold, F5: every refusal here tells the occupant its magazines
   * (`turretDropped`): its page spent the round it asked for, so the room's word re-syncs its magazines (the tell carries
   * no cone). A 'rate' refusal on the event clock alone blooms the room's cone (TURRET_JITTER_BLOOM_ADAPTATION).
   */
  private turretRound(p: Player, t: TurretState, frame: AimFrame, ev: { seq: Extract<ClientEvent, { type: 'fire' }>['seq']; dir: Extract<ClientEvent, { type: 'fire' }>['dir'] }): { record: WeaponRecord; round: ThrowableRecord | null; from: V3; dir: V3 } | null {
    const record = t.record;
    if (!record) return this.turretDropped(p, t, 'no turret weapon');
    // TURRET-CONE's re-review R1: a command run before this mount is no turret round of it -- since LATER 107 one of an
    // earlier hold (a dismount and a remount); the hand's go `fire`'s hand path (MOUNT_ROUND_AT_COMMAND_ADAPTATION).
    if (frame.count <= t.mountCount) return this.turretDropped(p, t, 'before the mount');
    // `fire`'s own two gates, before anything is spent: mid-swap (M-3) and the binoculars (view state 4).
    if (frame.swapping || frame.binoculars) return this.turretDropped(p, t, frame.swapping ? 'swapping' : 'binoculars');
    // LATER 207: a round named on the last hold's commands, decided after its release (the dismount path,
    // `DISMOUNT_ROUND_AT_COMMAND_ADAPTATION`), is judged on that hold's magazines and timer (`released`), not the summed
    // count -- the weapon's magazine empty at d refuses it as it would have mounted; nothing armed or put in for it.
    const after = t.mags === null && t.released !== null ? t.released : null;
    const ring = after?.mags ?? t.mags;
    // TURRET-AMMO: while the reload's timer runs the trigger is not read, and on the frame it stops either (`FUN_005c0fd0`
    // D:L476549-476563: `bVar11 = false` for any frame entered non-zero, the landing's included; the review's fold, F1).
    // Past it the reload lands first if the tick's tell has not yet (`landTurret`).
    if (frame.count <= (after?.lockUntil ?? t.lockUntil)) return this.turretDropped(p, t, 'reload');
    if (t.reloading) this.landTurret(t);
    // LATER 207's re-look B-F1: a landing the release met still pending lands on the kept ring first, as mounted it would
    // have (`FUN_005c2a90` at the timer's end, D:L476553-476560); heard by none -- the hold is over.
    if (after?.reloading) { if (after.lands) after.mags.reload(); after.reloading = false; }
    if (ring ? ring.rounds() <= 0 : t.ammo <= 0) {
      // A dry pull (`FUN_005c0fd0` D:L476573-476633): with a magazine left the reload runs at once, no timer
      // (D:L476616-476622) -- not on class 230, whose `FUN_003d1e20` is 0 (D:L476590, D:L324477-324479). The pull fires
      // nothing. The put-in is `FUN_005c2a90`'s, so the others hear its `ReloadSound` (F4, `turretReloadHeard`).
      if (ring && !after && itemClass(record.id) !== 'turret2' && ring.reload()) this.turretReloadHeard(t);
      return this.turretDropped(p, t, 'empty');
    }
    // P3-room (AR-4; reading, pending review): the hand's two bounds (`fireAt`), one source (`../../viewer/src/net/fireGate`).
    // The gap (BL-1, LATER 326): the fastest enabled mode's wait (`FUN_005c09f0` D:L476323-476341) x TICK_HZ, less a tick.
    // The schedule (LATER 588 (a)): the console's period over the chain -- the turret's kit runs the same fire timer
    // `+0x81c` a game frame at a time (`FUN_005c0fd0` D:L476643-476647; the gate `FUN_005c0ae0` D:L476446-476448; the
    // page's `TurretTrigger`, LATER 588 (b)): 2 x `fireFrames` ticks, less FIRE_SCHEDULE_SLACK_ADAPTATION. Under either:
    // refused 'rate', no bloom. Was: a private copy of the gap alone (a forged PKM TURRET every 5 commands: 12 a second).
    const cycle = fireCycleTicks(record);
    const firedAt = this.eventClock(p);
    if (frame.count - t.lastFire < cycle) return this.turretDropped(p, t, 'rate');
    if (!scheduleOpen(t.fireSchedule, record, frame.count)) return this.turretDropped(p, t, 'rate');
    // TURRET-CONE (TURRET_ROUND_LINE_READING): the claim's line inside the cone about the gun's own line at the command's
    // clamped aim, the neighbouring commands' blended (`ShotCone.checkLine`) -- the page rolled it (`TurretPage.round`).
    const d = ev.dir, len = Math.hypot(d[0], d[1], d[2]);
    const dir: V3 | null = len > 0.5 && len < 1.5 ? [d[0] / len, d[1] / len, d[2] / len] : null;
    const verdict = dir ? p.cone.checkLine(ev.seq, dir, (f) => { const a = clampAim(t.place, f.yaw, f.pitch); return gunLine(a.yaw, a.pitch); }) : null;
    if (firedAt < t.fireClock + cycle - FIRE_ARRIVAL_JITTER_TICKS) {
      // TURRET_JITTER_BLOOM_ADAPTATION: early on the event clock alone -- the console fired and bloomed it; once a cycle.
      if (dir && verdict === null) { t.lastFire = frame.count; p.cone.round(ev.seq); }
      return this.turretDropped(p, t, 'rate');
    }
    if (!dir) return this.turretDropped(p, t, 'dir');
    if (verdict !== null) return this.turretDropped(p, t, `cone: ${verdict}`);
    t.lastFire = frame.count;
    t.fireSchedule = scheduleAfter(t.fireSchedule, record, frame.count);   // P3-room (LATER 588 (a)): on a period, or a new chain
    t.fireClock = Math.max(firedAt, t.fireClock + cycle);
    if (ring) {
      // The magazine's last round arms the reload (`FUN_005c5340` D:L479287-479294, D:L479318-479320: mounted, the
      // magazine holding 1 before the round is spent, D:L475621-475624); none of the turret items is on its exempt list.
      const last = ring.rounds() === 1;
      ring.fire();
      t.ammo = ring.total();
      if (last && !after) this.armTurret(t, record, frame.count);   // LATER 207: no timer for a released turret
    } else t.ammo--;
    t.ammoDirty = true;
    p.cone.round(ev.seq);                                        // the round's step on the turret record, after the roll (F2)
    const aim = clampAim(t.place, frame.yaw, frame.pitch);
    return { record, round: t.round, from: muzzleAt(t.place, aim.yaw, aim.pitch), dir };
  }

  /**
   * TURRET-AMMO's review fold, F5: a turret round refused for its occupant -- told `dropped`, and the occupant owed its
   * magazines (`ammoDirty`: `tellAmmo` sends them, at most once a tick). The page spends its own predicted round from the
   * magazine in the weapon until the next tell (`turretPage.ts` `round`); without this a round the room drops ('rate',
   * 'reload', 'empty', ...) left it a predicted count the room never had -- at worst a predicted 0 with the room's reload
   * never armed (the room never fired that last round), the trigger dead until R. Null, for `turretRound`'s caller.
   * The refusals that owe the tell: every one inside `turretRound` (here); `fire`'s 'no frame' for a mounted body; and,
   * before `fire` runs, 'stale', 'too many waiting' and 'its command never ran' (`turretFireOwed`, the re-read's N1).
   * Not one that owes none: `fire`'s refusals after `turretRound` has spent the round ('binoculars', the muzzle's), which
   * set the tell when it spent it. A mounted 'nofire' never reaches `turretRound` since LATER 173: `fire` refuses a mounted
   * frame with no fire first, nothing spent, and owes the tell itself (`turretFireOwed`; research 215 s8, s8.2).
   */
  private turretDropped(p: Player, t: TurretState, why: string): null {
    this.dropped('fire', why, p);
    t.ammoDirty = true;
    return null;
  }

  /**
   * TURRET-AMMO's review fold, F4: a put-in heard by the others -- `FUN_005c2a90` plays the slot record's `ReloadSound` at
   * the actor (`+0x1c`) right after writing the magazine index (D:L477483-477488), in the kit's frame, which the actor
   * update runs with no test of the controller's locality (`FUN_005506a0` D:L417907): the rifle's `reloadSound`
   * (REMOTE_RELOAD_SOUND_READING, `reload`), the item the turret's weapon, at the occupant's body, never to the
   * occupant's page (its own put-in plays it, `turretPage.ts` `tookMags`). Called only when the walk found a magazine
   * (the write and the sound sit in its found branch, D:L477478).
   */
  private turretReloadHeard(t: TurretState): void {
    const p = t.occupant !== null ? this.players.get(t.occupant) : undefined;
    if (!p || !t.record) return;
    const st = p.sim.walker.state;
    this.broadcast({ type: 'reloadSound', id: p.id, weapon: t.record.id, at: [st.x, st.y, st.z] }, p.id);
  }

  /**
   * PAR-59 (research 215 s8): a mounted MGL FRAG TURRET's round -- its projectile record launched from the firepoint at its
   * `Muzzle_Velocity` down the gun's line (`FUN_003cb1a0` D:L320727-320731: MV x dir; the occupant's own velocity, which
   * the kit's fire adds (`FUN_005be9a0` D:L475604, the actor's `+0x38`), is TURRET_LAUNCH_INHERIT_READING's), flown and its
   * blast dealt as a launcher's round (`flyGrenades`, `blast`: `thrown` by its name). One shot (PF-26, PF.R20). The others
   * are told; the occupant's page flies its own from the same line (`MatchFirearm.turretRound`), as a launcher's round.
   */
  private turretLaunch(p: Player, round: ThrowableRecord, from: V3, dir: V3, seq: number): void {
    this.countShot(p, true, undefined);
    const f = this.born(this.flyer(p, round.name, launchGrenade([...from], [...dir], round)), this.commandAge(p, seq));   // HOTFIX grenade fuse
    this.flying.push(f);
    const mv = round.muzzleVelocity, velocity: V3 = [dir[0] * mv, dir[1] * mv, dir[2] * mv];
    this.broadcast({ type: 'grenade', id: p.id, kind: round.name, from: [...from], velocity, pid: f.pid }, p.id);
  }

  /**
   * MAP-10b's fix round: an event that acts without a command -- a `throw` (every equipment use), a switch's `action`, a
   * `door` -- from a mounted body is dropped 'mounted' (true), as `onTurret` strips the same presses off its commands: the
   * occupant only aims, fires the turret and dismounts (PF.R31). False: not mounted, go on. LATER 172
   * (`MOUNT_ASK_AT_COMMAND_ADAPTATION`): mounted at the command `seq` names (`mountedAt`), not when it is judged.
   */
  private mountedRefused(id: number, kind: string, seq?: unknown): boolean {
    const p = this.players.get(id);
    if (!p || this.mountedAt(p, seq) === null) return this.releaseRefused(id, kind, seq);
    this.dropped(kind, 'mounted', p);
    return true;
  }

  /**
   * LATER 172 (`MOUNT_ASK_AT_COMMAND_ADAPTATION`): the turret the body held after command `seq` -- its frame's
   * (`AimFrame.turret`, LATER 107's) -- or, for a command with no frame (not yet run, dropped, past the history, or no
   * whole `seq`), the present `mounted`; null: none. The fresh review's F1: the frame is read only for a command within
   * `FIRE_ARRIVAL_JITTER_TICKS` of the body's newest run command (`decide`'s stale measure, `p.sim.seq - seq`); an older
   * one is judged by the present `mounted`, so a forged page cannot name a pre-mount command still in the history.
   */
  private mountedAt(p: Player, seq: unknown): number | null {
    const f = typeof seq === 'number' && p.sim.seq - seq <= FIRE_ARRIVAL_JITTER_TICKS ? p.cone.frame(seq) : undefined;
    return f ? f.turret ?? null : p.mounted;
  }

  /**
   * LATER 109 (the review's F2; TURRET_RELEASE_ACTIONS_PLACEHOLDER, strict): an ask without a command from a body whose
   * dismount's reversed clip still runs is dropped 'releasing' (true); false otherwise. A mount is not refused
   * (`FUN_005a6fc0` D:L462181-462190 pushes the forward clip over the reversed one).
   */
  private releaseRefused(id: number, kind: string, seq: unknown): boolean {
    const p = this.players.get(id), span = p?.releaseSpan;   // LATER 109 (F-A): the ask's own command, not its arrival
    if (!p || !span || typeof seq !== 'number' || seq < span.from || seq > span.to) return false;
    this.dropped(kind, 'releasing', p);
    return true;
  }

  /**
   * PF-19 (ruling PF.R38; research 218 s3, 194 A04): a knock laid on a body in `FUN_0057e770`'s order (D:L440981-441027):
   * a mounted body leaves its turret first (`FUN_00545ee0(actor, 1)` D:L411941-412032, ".RELEASE_TURRET": the `turret`
   * event, the occupant freed -- PF.R31 refuses a mounted body's own events, not the room's knock), then `applyKnock`:
   * the move released, a pending swap completed, the reaction laid (a fall, or alive and prone `Prone cover`). The knock
   * laid, or null when the mover refused it. The room's one knock path: `blast()` calls it, and PF-23's shotgun
   * blowback is to reuse it (one reaction event a knock: the caller's `blast`).
   */
  private layKnock(q: Player, knock: Knock): Knock | null {
    if (q.mounted !== null) this.releaseTurret(this.turrets[q.mounted]!);
    const laid = applyKnock(q.sim.walker, q.sim.moves, knock) ? knock : null;
    if (laid) this.endStillReload(q, true);                              // PAR-28: the second channel and the stack (FUN_0057e770)
    if (laid) q.release = null;                                          // LATER 109 (the review's F1): the knock pops the reversed clip
    if (laid) q.flinchUnder = null;                                      // LATER 363's review F1: to the base (`FUN_0058a4d0` D:L440997), the covered flinch too
    // LATER 555 (research 92 section 4, "LATER 551"; reading, pending review; PTW.R3 with `../../viewer/src/walk`
    // `knockPops`): the pop takes the flinch on top as well -- `FUN_0058a4d0(actor, 0)` pops while the stack holds more
    // than its base and the top is not Stand, Crouch or Prone (types 1, 0x12, 0x1a: D:L446762-446768), and a prone body's
    // pops again (D:L441003-441004) before `Prone cover` (D:L441017-441018) -- so a Prone cover knock ends the window (a
    // flinch's or a door push's) at the knock, after command `sim.seq`, its reload refusal and its slot with it. A fall's
    // knock leaves the window to the fall's cover and its landing's pop (`flinchLanding`; LATER 551). Was: kept to its end.
    if (laid?.fall === 'proneCover' && q.flinchUntil > q.sim.seq + 1) { q.flinchUntil = q.sim.seq + 1; q.flinchAir = -1; }
    return laid;
  }

  /**
   * PAR-19 D04, PAR-28 (research 251 s4.2, s12): the hand's reload or after-shot clip taken off the body -- its lock ends
   * at this command (`ran`), the magazine selected at its start kept (`FUN_005c2a90` D:L477479-477483), and its still
   * clip's life with it. `FUN_005a7ab0` (D:L462512-462560) answers no once no reload type is on the stack and the second
   * channel plays no moving reload -- unless the kit's timer still runs (`FUN_005c2400`, `kit+0x820 > 0`, D:L477159): an
   * after-shot's lock before its clip (`ran < lockTimer`) is left. `overlay`: the knock's, which clears the second
   * channel (`FUN_005a5da0` D:L440993; D:L461713-461714) and pops the stack (`FUN_0058a4d0` D:L440997) -- any clip under
   * way, still, moving or carried; else a pop of the stack alone (a climb's or a ladder's start, `watchMoves`; a
   * landing's clip, `run`), which ends only a still clip on it (`reloadLife`). The page's twin: `reloadPopped`.
   */
  private endStillReload(p: Player, overlay: boolean): void {
    const w = p.sim.weapon, life = p.reloadLife[w];
    // PAR-79's review F1: a still clip the fall covered outlives its lock (the uncut lock is the start's own timer, the life
    // stands through the flight): the pop takes it all the same, with no lock left to end -- the page's `reloadPopped`.
    if (life !== null && p.ran >= life.start && !(p.ran < p.reloadUntil[w])) { p.reloadLife[w] = null; return; }
    if (p.lockKind[w] === null || !(p.ran < p.reloadUntil[w]) || p.ran < p.lockTimer[w]) return;
    if (!overlay && (life === null || p.ran < life.start)) return;
    p.lockClock[w] -= p.reloadUntil[w] - p.ran;
    p.reloadUntil[w] = p.ran;
    p.reloadLife[w] = null;
  }

  /**
   * PAR-28 (PAR-47; research 251 s6, s12.2): a player's mover's climbs and ladders, heard as they start (inside the
   * command's run, `ran` its count): a climb's start pops the stack to its base (`FUN_005b2620` -> `FUN_00580b70`
   * D:L442186-442214, `FUN_00580a80` D:L442147-442163), and so does a ladder's mount (`FUN_0057f880` D:L441547-441558,
   * `FUN_0057f690` D:L441466-441477) -- the still clip goes, and its lock (`endStillReload`). Called for each new mover.
   * PAR-82 (research 251 s12.3; PTW.R3 with `../../viewer/src/walk` `attachMoves`): the mover's take-off covers no hold
   * standing in for `Rifle m203 reload` (`Walker.holdCovered`: the hand's still clip's family, `fallCovers`).
   */
  private watchMoves(p: Player): void {
    p.sim.walker.holdCovered = () => { const life = p.reloadLife[p.sim.weapon]; return life === null || fallCovers(life.spec.family); };
    // NU-1b B1 (research 313 s1.3; `CLIMB_OFFER_GATE_READING`; PTW.R3 with `../../viewer/src/walk` `climbLocked`): the
    // climb's offer refusals the mover does not carry (`Walker.climbLock`), asked inside the command's run (`ran` its count,
    // `sim.seq` its seq) -- the reload lock (`FUN_005a7ab0`, D:L469416: `reloadUntil`, the still clip's life within it),
    // the launcher's set (D:L469470-469472) and the turret's (`mounted`, D:L469473-469474).
    p.sim.walker.pistolHand = () => p.sim.weapon === 1;         // LATER 509: the hand, for the gate's throw term
    p.sim.walker.climbLock = () => p.ran < p.reloadUntil[p.sim.weapon] || this.pressLocked(p) || flinchOnTop(p.launcherSet, p.sim.seq) || p.mounted !== null || p.release !== null   // LATER 109: the reversed clip's turret set
      // LATER 220's last head: the moving lower (FUN_005a7980, D:L469412), asked while command C runs -- `sim.seq` is C
      // there (`MoverSim.prepare`), as the page's `taps + 1`; the form `swapRefused` uses (its review's F1: was `seq + 1`).
      || p.sim.seq < p.movingLowerUntil;
    p.sim.walker.launcherSetOn = () => flinchOnTop(p.launcherSet, p.sim.seq);   // LATER 504: the set kneels the room's mover too
    // LATER 512c (research 92 section 4, "LATER 512c's reading"; PTW.R3 with `../../viewer/src/walk` `oneShotOnTop`): the
    // flinch's slot -- the flinch, a door's `Open door` over it (`doorMotion`), the flinch handed back at its pop
    // (`flinchUncover`) -- on top on command `sim.seq`, read after the tick's pop (`[flinchFrom, flinchUntil)`), not while
    // the fall covers it (`flinchAir`): a stance request waits under it (`FUN_00552ec0` D:L418927-418930).
    p.sim.walker.oneShotOnTop = () => {
      const seq = p.sim.seq;
      if (p.flinchFrom < 0 || seq < p.flinchFrom || seq >= p.flinchUntil) return false;
      return !(p.flinchAir >= 0 && seq >= p.flinchAir);
    };
    // The door-open body hold (the owner, 2026-11-07: "u shouldnt be able to open then move right away"; research 92
    // section 2, "The body under the door clip"; reading, pending review; PTW.R3 with `../../viewer/src/walk` `pushedTop`):
    // a door's push (`doorMotion`) on top on command `sim.seq` -- the slot above, a push's (`flinchGatesReload` false) --
    // holds the body on its clip's root (`Walker.step60`; `FUN_00550ef0` D:L418171-418203, `FUN_0028c250` D:L438910): the
    // move commands in it are read, not obeyed, until the command whose stick may cut it (`cuttable`, `flinchCutAt`: past
    // its `NoInterrupt`, `FUN_00587c20` D:L445550-445556), which `flinchCut` ends the window at after the command.
    p.sim.walker.pushedOnTop = () => {
      const clip = p.flinchClip, seq = p.sim.seq;
      if (clip === null || p.flinchGatesReload || !p.sim.walker.oneShotOnTop?.()) return null;
      const window = { start: p.flinchAt, until: p.flinchUntil, ...(p.flinchCutFrom >= 0 ? { cutFrom: p.flinchCutFrom } : {}) };
      return { clip, t: (seq - p.flinchAt) / TICK_HZ, cuttable: flinchCutAt(window, seq) };
    };
    const moves = p.sim.moves;
    if (!(moves instanceof Traversal)) return;
    moves.on((e) => {
      if (p.sim.moves !== moves) return;
      if (e.type === 'climbStart' || e.type === 'ladderMount') {
        this.endStillReload(p, false);
        p.flinchUnder = null;                                    // LATER 363's review F1: popped to the base, the covered flinch with it
        // LATER 560 (research 92 section 4, "LATER 560"; reading, pending review; PTW.R3 with `../../viewer/src/walk`
        // `basePopStep`): the pop takes the flinch on top too (a door clip's window as well) -- `FUN_00580b70`
        // D:L442186-442214, `FUN_00580a80` D:L442151-442163, `FUN_0057f880` D:L441547-441558, the flinch above the base
        // (LATER 512b) -- and no gate on the start's path refuses it under a flinch. Heard inside command `sim.seq`'s run:
        // marked here, the window ended at that command by `watchCut` after the command (`basePopAt`). Was: kept to its
        // end; then (the first build) ended here at `sim.seq + 1`.
        p.basePopAt = p.sim.seq;
      }
    });
  }

  /** A turret freed (a dismount, its occupant's death or leave, the round's start): every page told. */
  private releaseTurret(t: TurretState, tell = true): void {
    const p = t.occupant !== null ? this.players.get(t.occupant) : undefined;
    if (p && p.mounted === t.place.id) { p.mounted = null; p.cone.setWeapon(p.records[p.weapon]); }   // TURRET-CONE: the hand's again (D:L412005)
    if (p) { p.dismount = null; p.seatOff = null; }              // LATER 104: none pending past the release
    if (p && p.reserved?.turret === t.place.id) p.reserved = null;   // A1: a reservation dropped (a refusal, a death, a leave, a resume)
    t.occupant = null;
    t.reserved = false; t.word = false;
    t.ammoDirty = false;
    // TURRET-AMMO: the kit slot's magazines summed back onto the turret (`FUN_00545ee0` D:L412001-412006: `FUN_005c3c10`
    // D:L412003, every one of the ten, 0 when all are empty). A reload's timer still running is dropped with the slot --
    // the port's choice, not a reading (the review's fold, F2; TURRET_RELEASE_RELOAD_READING): the timer `kit+0x820` is
    // the kit's and no writer of it is in the release path (`FUN_00545ee0` D:L411941-412024, `FUN_005c3c10`
    // D:L478128-478154, `FUN_005c4b10`, `FUN_005b9bb0`, `FUN_005a6eb0`, `FUN_005448a0`, `FUN_003aa020`, `FUN_003a9ea0`),
    // so the original's very likely runs on and lands on the rifle back in the hand (`FUN_005c2a90` walks `+0x824`,
    // D:L477411). Owed: a capture (a dismount within 0.5 s of the 250th round or of R).
    if (t.mags) t.ammo = t.mags.total();
    // LATER 207: the hold's magazines and timer kept for a round named on its last commands (`turretRound`).
    t.released = t.mags ? { mags: t.mags, lockUntil: t.lockUntil, reloading: t.reloading, lands: t.lands } : null;   // the re-look's B-F1: its landing too
    t.mags = null; t.reloading = false; t.lockUntil = -1e9; t.lockFrom = -1e9; t.lands = true;
    if (tell) this.broadcast({ type: 'turret', ...turretWire(t) });
  }

  /**
   * The round's start (`FUN_003aa9d0` D:L301315-301342): any occupant released (its magazines summed back), then each
   * turret's rounds restored (D:L301330-301337) -- the one refill a dry turret has (TURRET_RELOAD_READING) -- and the
   * release told with the restored count (the reset releases no one itself; the port's order keeps the refill).
   */
  private resetTurrets(): void {
    this.mounts.length = 0;
    for (const t of this.turrets) {
      const held = t.occupant !== null;
      if (held) this.releaseTurret(t, false);
      t.ammo = t.place.ammoInit ?? 0;
      t.released = null;                                         // LATER 207: the refill ends the last hold's magazines
      if (held) this.broadcast({ type: 'turret', ...turretWire(t) });
    }
  }

  /**
   * TURRET-AMMO: the reload armed (the magazine's last round, or R): the kit's one timer at the record's `ReloadDelay`
   * (`FUN_005c32b0` D:L477674-477676, R's `-1` D:L477661-477667; `FUN_003d2c40`), from the occupant's command `count`,
   * counted down as `FUN_005c0fd0` runs it (`turretReloadCountdown`, D:L476549-476563; the review's fold, F1): the timer
   * stops on `count` + 30 for 0.5 s, + 16 for 0.25 s, and the first round after is the command past that. R's arm is
   * counted as the last round's (where `FUN_00594cf0` falls against the kit update in the frame is unread:
   * TURRET_RELOAD_READING).
   */
  private armTurret(t: TurretState, record: WeaponRecord, count: number): void {
    const stop = turretReloadCountdown(reloadDelayOf(record));
    t.reloading = true;
    t.lockFrom = count;                                          // LATER 219: the release judged against it (`takeDismount`)
    t.lockUntil = count + stop.commands;
    t.lands = stop.lands;
    t.ammoDirty = true;
  }

  /**
   * TURRET-AMMO: the reload's landing (`FUN_005c2a90` at the timer's end, D:L476553-476560): the walk from the next
   * magazine to one with rounds (D:L477462-477483), heard by the others (F4, `turretReloadHeard`); none, nothing written
   * and nothing heard -- no network refill for the turret classes (D:L477490-477497). A countdown that stopped on exactly
   * 0.0 lands nothing (`lands`, D:L476553). Its gates pass in the hold (research 215 s8); the body plays no clip. Not
   * built (the review's fold, F3; TURRET_LANDING_FLINCH_READING): `FUN_005c2a90` refuses inside a flinch window
   * (`FUN_005b4340(actor, 3)` D:L469494-469504, asked at D:L477404) and the timer is cleared anyway (D:L476560), so that
   * reload is lost -- whether a mounted body flinches at all is unread (no `+0xeb8` test in `FUN_005a2690`
   * D:L459885-459959; the room's `flinchState` has no mounted case), so the room lands every time.
   */
  private landTurret(t: TurretState): void {
    t.reloading = false;
    if (t.lands && t.mags?.reload()) this.turretReloadHeard(t);
    t.ammoDirty = true;
  }

  /**
   * TURRET-AMMO: R from a mounted body (`FUN_00594cf0` D:L453460-453463: refused while the timer runs, `FUN_005a7ab0`;
   * no fullness test) arms the turret's reload, never the rifle's -- the slot in the hand is the turret's.
   */
  private reloadTurret(t: TurretState, count: number): void {
    if (!t.mags || !t.record || t.reloading || count < t.lockUntil) return;
    this.armTurret(t, t.record, count);
  }

  /** The occupant's magazines on the wire (`TurretMags`): all ten, the one in the weapon, the timer. */
  private magsWire(t: TurretState): TurretMags | null {
    if (!t.mags) return null;
    const { slots, current } = t.mags.state();
    return { rounds: slots, current, reloading: t.reloading };
  }

  /** TURRET-AMMO: a resumed seat on a turret told its magazines (after its welcome and its resume). */
  private tellMags(p: Player): void {
    const t = p.mounted !== null ? this.turrets[p.mounted] : undefined;
    const mags = t && t.occupant === p.id ? this.magsWire(t) : null;
    if (t && mags) this.send(p.id, { type: 'turret', ...turretWire(t), mags });
  }

  /**
   * Each occupant whose turret's rounds or magazines changed this tick -- a round, the reload's arm, its landing (the
   * occupant's command clock at `lockUntil`), a round the room dropped (the review's fold, F5) -- told them, to it alone
   * (PF.R31), once a tick, with its magazines.
   */
  private tellAmmo(): void {
    for (const t of this.turrets) {
      if (t.reloading && t.occupant !== null && (this.players.get(t.occupant)?.ran ?? -Infinity) >= t.lockUntil) this.landTurret(t);
      if (!t.ammoDirty) continue;
      t.ammoDirty = false;
      if (t.occupant === null) continue;
      const mags = this.magsWire(t);
      this.send(t.occupant, { type: 'turret', ...turretWire(t), ...(mags ? { mags } : {}) });
    }
  }

  /** For the tests: a turret's live state (its occupant, rounds and, mounted, the kit slot's magazines), or undefined. */
  turretState(id: number): { occupant: number | null; ammo: number; mags: MagazineRing | null } | undefined {
    return this.turrets[id];
  }

  // ---- grenades (research 85, 91 section 5) and the equipment (web sprint 4 M7, research 94 §C4-§C5) ----

  private readonly flying: Flying[] = [];
  /** V13-3c: the welcome's `sceneDead` -- the scene records whose death the room's world ran this round, none: absent. */
  private sceneDeadWire(): { sceneDead?: number[] } {
    const dead = this.world.scene.destructibles.filter((d) => this.world.health.isSpent(d.id)).map((d) => d.id);
    return dead.length ? { sceneDead: dead } : {};
  }

  /** Research 386 §3.2: the scene programs' `FIRE_WEAPON` rounds waiting out their fuse (`sceneRound`), by the tick they go off. */
  private readonly sceneRounds: { tick: number; kind: string; point: V3 }[] = [];
  /** PF-34 (ruling PF.R54; research 234 s6): the world drops -- a classic death's weapons and bundle, the claims, the walks. */
  private readonly worldDrops = new WorldDrops({
    broadcast: (ev) => this.broadcast(ev), send: (id, ev) => this.send(id, ev), refused: (why, id) => this.dropped('pickup', why, this.players.get(id)),
    // NU-5 X1 / research 324 P2: the pick-up's `Swap rifle` from the claim's command + 1, kept as PAR-84's raise is.
    swapRifle: (id, seq, clip) => { this.players.get(id)?.sim.launcherClips.keep({ name: clip, reversed: false, at: seq + 1 }); },
  }, {
    table: () => this.kits?.table ?? null, staleTicks: FIRE_ARRIVAL_JITTER_TICKS,
    // OBF-15 (OBF.R9, DROP_SETTLE_ADAPTATION): the walking tick's floor pick (`Walker.slideOrMove`) under the feet.
    floor: (x, y, z) => selectFloor(probeGround(this.map.grid, x, z), y + probeLiftOf('stand'), y)?.y ?? null,   // a standing body's lift (LATER 785)
  });
  /** Seats whose welcome or promotion announced a countdown the clock has yet to start (`toldCountdown`). */
  private readonly preTold = new Set<number>();
  /** IP3 (`RoomOptions.onLoadEvent`): the tick the launch's load hold began, for the instrument's `sinceHold`; null before one. */
  private loadHoldAt: number | null = null;
  /** IP3 (the load-log flood, 2026-11-04): the seats whose `loaded` the instrument has told since the hold began. */
  private readonly loadTold = new Set<number>();

  /**
   * ROUND_START_PROJECTILES_READING (research 95 §8): a round's start is a fresh level -- everything thrown, fired or
   * set down (grenades, launched rounds, rockets, backblasts, claymores, PMNs, C4) is gone, so nothing from the waiting
   * room, the countdown or the last round goes off in the new one. The game keeps them in the level's projectile
   * manager 0x4b5220, made empty at the level's load (`FUN_001ea720` L49727 `FUN_003d3980`) and emptied and freed at
   * its teardown (`FUN_001eb8c0` L50597-50599 `FUN_003ccbc0`, the count zeroed; L50613 `FUN_003d3930`); a round is
   * the round-end screen's `ReplayMission`, "reload of the round ... plus the load" (research 91 §18.2.4; `FUN_00223680`
   * L75913-75931 re-places every player). The reading: that this reload runs that teardown is read from research 91,
   * not traced call by call. An abandon leaves the level (the room's, `ABANDON_TRIGGER_READING`; the
   * original's `dlgNetAbandoned` is a late joiner's below three, `FUN_002bc530` D:L161137-161141, research 315 §3.3):
   * cleared too. The pages clear
   * their copies on `roundStart` and `abandoned` (`../../viewer/src/armoryGlue.ts`).
   */
  private clearAir(): void {
    this.flying.length = 0;
    this.sceneRounds.length = 0;                                 // research 386 §3.2: a scene round still on its fuse
    this.flight.reset();
    this.pidSerial = 0;                                          // PF-28: a new generation of projectile ids
    this.worldDrops.clear();                                     // PF-34: the drops and their ids go with it (DROP_LIFETIME_PLACEHOLDER)
  }
  /**
   * The room's credit into game frames: the flight steps once per game frame, as the page's (PF-04, PF.R8), on the
   * wall time the bodies are credited (HOTFIX grenade fuse, `flyGrenades`), at most ROOM_FLIGHT_MAX_FRAMES_ADAPTATION a step.
   */
  private readonly flight = new GameFrameAccumulator(ROOM_FLIGHT_MAX_FRAMES_ADAPTATION);
  private cast: HullCast | null = null;
  /**
   * The hull's cast for the grenades and the placed charges' ground: a polygon's material byte 0 is the map's
   * `DefaultMaterial` (`FUN_002dc1d0`; `SimMap.defaultMaterial`), as the page's cast reads it (viewer `grenade.ts`).
   */
  private hullCast(): HullCast {
    return this.cast ??= gridCast(this.map.grid, this.map.defaultMaterial ?? '');
  }

  /** An item's record by its name: the kit table's, else the baked transcriptions' (`BAKED_THROWN`); null for none. */
  private itemByName(name: string): { id: number } | null {
    const item = this.kits?.table.arsenal.byName.get(name);
    if (item) return item;
    const baked = BAKED_THROWN.get(name);
    return baked ? { id: baked.record.id } : name === 'Detonator' ? { id: ITEM.DETONATOR } : null;
  }

  /** What a `throw` of `name` is (`../../viewer/src/equipment` `equipmentKind`), 'none' for a name no record has. */
  private kindOf(name: string): ReturnType<typeof equipmentKind> {
    const item = this.itemByName(name);
    return item ? equipmentKind(item.id) : 'none';
  }

  /** A throwable's or a charge's record and piercing by name: the disc's (`KitTable.throwables`), else the baked. */
  private throwable(name: string): { record: ThrowableRecord; piercing: number } | null {
    const item = this.kits?.table.arsenal.byName.get(name);
    const t = item ? this.kits?.table.throwables?.get(item.id) : undefined;
    return t ?? BAKED_THROWN.get(name) ?? null;
  }

  /**
   * A throw, decided at its command's frame (`timed`; M-8 of review 2), as a round is: the hand within reach of the
   * frame's eye and on the body's side of the walls (BL-3); the launch one the game's throw makes from that hand at that
   * frame (`throwLaunchAllowed`); no sooner after the last than the throw clip lets the hand go again (`THROW_REPEAT_S`).
   */
  private throwGrenade(p: Player, ev: Extract<ClientEvent, { type: 'throw' }>): void {
    // THROW-INTERRUPT (research 326 §2.4): the hand opened -- the `throw` echoing its request's seq ends it, taken or refused;
    // an older page's names none, and any throwable's then ends it. A throw taken ends any request (the review's F1, below).
    const pending = p.throwStart && ev.start === p.throwStart.seq ? p.throwStart : null;
    if (p.throwStart && (ev.start === undefined || ev.start === p.throwStart.seq)) p.throwStart = null;
    if (this.victoryPlaying.has(p.id)) return;
    const t = this.throwable(ev.kind);
    if (!p.alive || this.state.phase === 'over') return this.dropped('throw', 'not alive', p);
    if (!t) return this.dropped('throw', 'unknown kind', p);
    if (pending && (pending.kind !== ev.kind || (ev.slot !== undefined && pending.slot !== undefined && ev.slot !== pending.slot))) return this.dropped('throw', 'slot', p);
    const slot = p.equipmentSlots.eligible(ev.kind, ev.slot ?? pending?.slot);
    if (slot === null) return this.dropped('throw', 'none left', p);
    const frame = p.cone.frame(ev.seq);
    if (!frame) return this.dropped('throw', 'no frame', p);     // not a command this body ran
    const repeat = THROW_REPEAT_S * TICK_HZ - 1;
    if (frame.count - p.lastThrow < repeat) return this.dropped('throw', 'rate', p);
    const at = this.eventClock(p);
    if (at < p.throwClock + repeat - FIRE_ARRIVAL_JITTER_TICKS) return this.dropped('throw', 'rate', p);   // SVC-23b
    // NET-CAP (research 312 §10): online, the sixth live projectile refuses the next use, before the release request's own
    // tests (`FUN_005c0ae0` D:L476470-476491 answers before `FUN_005be9a0` runs, `FUN_005c0fd0` D:L476569, D:L476637-476638).
    if (this.netCapRefused(p, t.record.id)) return this.dropped('throw', 'net cap', p);
    // SVC-23b: the hand within reach of the server's head at the command and on its side of the walls, as the muzzle.
    const start = this.startRefused(frame, ev.from);
    if (start) return this.dropped('throw', `hand ${start}`, p);
    if (!throwLaunchAllowed(frame.feet, frame.yaw, frame.posture, ev.from, ev.velocity)) return this.dropped('throw', 'launch', p);
    p.lastThrow = frame.count;
    p.throwClock = Math.max(at, p.throwClock + repeat);
    p.equipmentSlots.spend(ev.kind, slot);
    p.throwStart = null;                                         // THROW-INTERRUPT (F1): a throw taken ends any request, whatever its `start`
    const f = this.flyer(p, ev.kind, launchGrenade([...ev.from], [...ev.velocity], t.record));
    // HOTFIX grenade fuse: the fuse runs from the release (`SetProjectile`, research 85 §6), the page's own -- its age at
    // this decision settled at the next `flyGrenades` (THROW_DATE_BACK_TICKS_ADAPTATION).
    this.born(f, this.commandAge(p, ev.seq), true);
    this.flying.push(f);
    // LATER 643: the others' pages start their copies at the age the room flies its own from (`throwAge`).
    const age = f.late ? this.throwAge(f.late) : undefined;
    this.broadcast({ type: 'grenade', id: p.id, kind: ev.kind, from: [...ev.from], velocity: [...ev.velocity], pid: f.pid, ...(age !== undefined ? { age } : {}) }, p.id);
    this.send(p.id, { type: 'placed', pid: f.pid, kind: ev.kind, from: [...ev.from] });   // PF-36: OWN_PID_READING
  }

  /**
   * HOTFIX grenade fuse (THROW_DATE_BACK_TICKS_ADAPTATION): how many ticks of the room's clock the command `seq` of `p`'s
   * stands after its release -- the room's clock less that command's arrival had the line not stalled: its count
   * (`ShotFrame.count`; a command not run yet, as a launched round's decided at its arrival names, counted on from the
   * last run) plus the line's best offset (`Player.lagFloor`, as `eventClock` dates an event). Uncapped and signed: a
   * command still to run stands before the room's clock (`flyGrenades` settles it; the cap is on the part past the room's
   * own credit). Null before the line has an offset.
   */
  private commandAge(p: Player, seq: number): number | null {
    const floor = Math.min(p.lagFloor.cur, p.lagFloor.prev);
    if (!Number.isFinite(floor)) return null;
    const count = p.cone.frame(seq)?.count ?? p.ran + (seq - p.sim.seq);
    return this.serverClock - (count + floor);
  }

  /**
   * HOTFIX grenade fuse (the re-review's fold): every projectile the room creates goes through here -- its age at its
   * creation (`ticks`: `commandAge` of the command it left on; 0 for one the room makes with no command of its own, a
   * death's dropped grenade, flown from now) and whether it was made inside a step's credit (`creditOpen`: in the step's
   * burst, after the credit and before `flyGrenades`), settled at the next `flyGrenades` (`Flying.late`). Unstamped -- no
   * offset yet, or made between steps at age 0 -- it takes the step's frames as before the hotfix. `dateBack`: flown past
   * the step's credit too, up to THROW_DATE_BACK_TICKS_ADAPTATION -- the hand throw's alone (the owner's ruling covers it);
   * any other is flown its own age only where that falls inside the step's credit, never further on than before.
   */
  private born(f: Flying, ticks: number | null, dateBack = false): Flying {
    if (ticks !== null && (ticks !== 0 || this.creditOpen)) f.late = { ticks, inStep: this.creditOpen, dateBack };
    return f;
  }

  /**
   * HOTFIX grenade fuse (THROW_DATE_BACK_TICKS_ADAPTATION; `flyGrenades`): what the room flies a new projectile at once,
   * in ticks (`own`), and whether that alone, none of its step's frames (`alone`). Its age now: made inside this step
   * (`inStep`), its creation's (the step's credit already in it); made before, that and the step's credit -- a tick at
   * least, so a healthy room's takes the step's frames as before. Under the credit by a tick or more, its whole age alone;
   * else the part past the credit, the hand throw's alone (`Flying.late.dateBack`), capped, any other's none. The step's
   * credit (`creditStep`) is the deciding step's when the throw is decided inside it (`throwGrenade` and `flyGrenades` read
   * it in the same step); between steps they read different credits, and the result holds because `own` does not depend
   * on the credit for ticks >= 0, and ticks < 0 tells no age (`throwAge`).
   */
  private dateBack(late: NonNullable<Flying['late']>): { own: number; alone: boolean } {
    const age = Math.max(late.inStep ? late.ticks : late.ticks + this.creditStep, 1);
    if (this.creditStep - age >= 1) return { own: age, alone: true };
    return { own: late.dateBack ? Math.min(THROW_DATE_BACK_TICKS_ADAPTATION, Math.max(0, age - this.creditStep)) : 0, alone: false };
  }

  /** The game frames `flyGrenades` flies a new projectile's date-back (`dateBack`'s `own` ticks) at once. */
  private dateBackFrames(own: number): number {
    return Math.min(ROOM_FLIGHT_MAX_FRAMES_ADAPTATION, Math.round(own / TICK_HZ / GAME_FRAME_DT));
  }

  /**
   * LATER 643 (research 85 §6.1): a new hand throw's age at its decision on the room's clock, as the room flies it -- the
   * `grenade` event's `age`, whole ticks, made from the room's own frame count so the page's
   * `round(age / TICK_HZ / GAME_FRAME_DT)` is that count exactly (the fold's F1: rounding the unrounded age to ticks
   * first put the page a frame behind for an age in (2k + 1.03, 2k + 1.5) ticks). The frames: decided between steps, the
   * date-back's (`dateBackFrames`; the next step's are time still to come, both sides'); inside a step, the date-back's
   * and that step's credit's (its frames flown after it, the clock already holding them -- the step's own accumulator can
   * give a frame more or less than its credit rounds to, so this branch is within a frame), or the age's alone (`alone`,
   * exact). At most ROOM_FLIGHT_MAX_FRAMES_ADAPTATION, the page's own bound (the fold's F3: only past a stall of about
   * 9.5 s can the room fly more, when every hand fuse has burst). Undefined under a game frame (a healthy throw: a tick's
   * credit), so the event is as before.
   */
  private throwAge(late: NonNullable<Flying['late']>): number | undefined {
    const { own, alone } = this.dateBack(late);
    // Between steps and alone (a command still to run: an age under none), the room flies it less than the step to come:
    // no age past the room's clock to tell.
    let frames = !late.inStep && alone ? 0 : this.dateBackFrames(own);
    if (late.inStep && !alone) frames += Math.round(this.creditStep / TICK_HZ / GAME_FRAME_DT);
    frames = Math.min(ROOM_FLIGHT_MAX_FRAMES_ADAPTATION, frames);
    return frames >= 1 ? Math.round(frames * TICK_HZ * GAME_FRAME_DT) : undefined;
  }

  /**
   * THROW-INTERRUPT (research 326 §2.4): a hand throwable's release request, decided at its command's frame by the
   * request's own tests -- a living seat (`FUN_0059d830`, the alive bit, D:L457349); a throwable its kit holds, the
   * room's count above 0; on the floor (D:L457369-457371); not mid-swap and past the playing clip's `NoFire` (`FUN_005a7de0`,
   * D:L457365: the frame's `swapping` and `fire`, the round's own gates); not in the binoculars (D:L475305); no launcher
   * up; under NET-CAP's cap (`FUN_005c0ae0` before `FUN_005be9a0`, D:L476470-476491); no sooner than `THROW_REPEAT_S`
   * after the last taken, nor than `THROW_TAIL_S` after the last hand opened (the review's F1). A new request replaces the
   * old; a refused one clears it.
   */
  private takeThrowStart(p: Player, ev: Extract<ClientEvent, { type: 'throwStart' }>): void {
    p.throwStart = null;
    if (!p.alive || this.state.phase === 'over') return this.dropped('throwStart', 'not alive', p);
    const t = this.throwable(ev.kind);
    if (!t || this.kindOf(ev.kind) !== 'throwable') return this.dropped('throwStart', 'unknown kind', p);
    const slot = p.equipmentSlots.eligible(ev.kind, ev.slot);
    if (slot === null) return this.dropped('throwStart', 'none left', p);
    const frame = p.cone.frame(ev.seq);
    if (!frame) return this.dropped('throwStart', 'no frame', p);
    if (frame.airborne) return this.dropped('throwStart', 'airborne', p);
    if (frame.swapping) return this.dropped('throwStart', 'swapping', p);
    if (!frame.fire) return this.dropped('throwStart', 'nofire', p);
    if (frame.binoculars) return this.dropped('throwStart', 'binoculars', p);
    if (p.held !== null) return this.dropped('throwStart', 'launcher', p);
    const at = this.eventClock(p);
    if (at < p.throwStartClock + THROW_REPEAT_S * TICK_HZ - 1 - FIRE_ARRIVAL_JITTER_TICKS) return this.dropped('throwStart', 'rate', p);
    // The review's F1: no sooner after the last hand opened than its clip's tail (`THROW_TAIL_S`), on the command clock.
    if (frame.count - p.lastThrow < THROW_TAIL_S * TICK_HZ - 1) return this.dropped('throwStart', 'rate', p);
    if (this.netCapRefused(p, t.record.id)) return this.dropped('throwStart', 'net cap', p);
    p.throwStartClock = at;
    p.throwStart = { seq: ev.seq, kind: ev.kind, count: frame.count, slot };
  }

  /**
   * A projectile of `p`'s: its thrower and name kept from the moment it left (m-13 of review 2); PF-28, its stable id
   * (`pidSerial`), which the `grenade` event and the join envelope carry.
   */
  private flyer(p: Player, kind: string, g: Grenade, facing?: V3): Flying {
    return { owner: p, name: this.lobby.member(p.id)?.name ?? '', kind, g, ...(facing ? { facing } : {}), pid: this.pidSerial++ };
  }

  /** PF-22: `ffRefuses` for a hit of `itemId` from `attacker` (the live owner, or null) on `victim`, by the room's switch. */
  private refuses(attacker: Player | null, victim: Player, itemId: number): FfRefusal | null {
    return ffRefuses(attacker, victim, itemId, this.opts.allowFriendlyFire === true, this.lobby.member(victim.id)?.role === 'spectator');
  }

  /** m-13 of review 2: a projectile's thrower if it is still in the room (the same player, not a later one given its id). */
  private thrower(f: Flying): Player | null {
    return this.players.get(f.owner.id) === f.owner ? f.owner : null;
  }

  /**
   * PAR-96 (research 256 §8.1; R256.6): the claymores a player has down -- `FUN_003cc1f0` over the placed list 0x4b5220
   * (`facing`: a charge set down), by owner (the body, `+0xac`), of the entries marked `+0xc5`, the claymore's alone
   * (D:L474101), live (`countsTowardClaymoreLimit`, CLAYMORE_COUNT_LIVE_READING). Was `chargesDown`: every charge set
   * down, the PMN and C4 among them. By the player object, never its id: a departed player's charges are no one's, so
   * they never count against the next page handed the id -- the room's policy (`DEPARTED_CHARGES_READING`, open:
   * `CZSealBody`'s destructor clears another field, `+0x1c` of a kind-5 entry's records via `FUN_003c7d50`
   * L318935-318955, not this `+0xac`).
   */
  private claymoresDown(p: Player): number {
    return this.flying.filter((f) => f.owner === p && f.facing !== undefined && countsTowardClaymoreLimit(f.g)).length;
  }

  /**
   * NET-CAP (research 312 §10; `../../viewer/src/net/netCap`, NET_CAP_READING): every room is a network game and every
   * command it judges is its own console's, so `FUN_005c0ae0`'s network test (D:L476470-476491) holds for `p`'s use of
   * the record `itemId` in the hand: refused while `FUN_003cb8f0` (D:L320898-320952) counts more than five of `p`'s own
   * live projectiles of the four classes -- `flying`, a charge set down (`facing`, not the backblast; was "`chargesDown`'s
   * test", PAR-96) in the placed list and the rest in the pool, gone once `removed` -- and never while nothing is in the
   * pool (NET_CAP_EMPTY_POOL_READING). By the player object, as `claymoresDown`.
   */
  private netCapRefused(p: Player, itemId: number): boolean {
    const live = this.flying.filter((f) => f.g.state !== 'removed')
      .map((f) => ({ mine: f.owner === p, id: f.g.record.id, placed: f.facing !== undefined && f.kind !== 'Backblast' }));
    return netCapRefuses(itemId, netCapLive(live));
  }

  /**
   * M7 (research 94 §C5, research 85 §9.7): a charge set down -- the page's `throw` of the claymore, the PMN or C4 at the
   * point its placing found (`FUN_005c2430`), `velocity` the SEAL's facing (a unit vector: the claymore's cone). From a
   * living player whose pouch holds one, the claymore and the PMN under its hand (`START_REACH_PLACEHOLDER` across from the
   * feet) on the head's side of the walls, C4 at its validated target point (`FUN_005c1970` D:L476979-476985, PR #321);
   * the claymore and the PMN refused once `maxPlaced` claymores are down (`claymoresDown`, PAR-96), then wading deeper
   * than `CLAYMORE_RULES.maxWaterDepth` (`wadingDepth`; PF-13: never for moving, `FUN_005be9a0` D:L475310-475350); C4 only at the target the page names
   * (`throw.target`) at the node and point its aim struck (`throw.surface`): the destructible there taking the charge, in
   * reach (`c4TargetOf`), the line from the head to the point clear and its surface not `INVISIBLE_DI` (`c4Line`,
   * `C4_REFUSED_MATERIAL`; PF-13, ruling PF.R18 -- the 0.2 s settle is the page's, as the door's pick is). Laid at
   * rest: C4's `Timer1` (6 s) runs from here; the claymore's and the PMN's are held (`holdsFuse`). 2026-10-02 (ported
   * from Chris's browser-beta-v5, d578f347; research 85 §9.7.2): the claymore and the PMN only on a surface under the
   * point, above the feet less `placeDrop`, within the hand's reach (`chargeRests`: `FUN_005c2430`, the page's rule;
   * `CHARGE_GROUND_SLACK_PLACEHOLDER`) -- a charge in the air is refused (`dropped('throw', 'ground')`).
   */
  private placeCharge(id: number, ev: Extract<ClientEvent, { type: 'throw' }>, n = -1): void {
    // INT.R5 (the triage challenge's finding): each refusal is tallied by why (`dropped`) -- they were silent but the
    // ground's -- and, with the combat report on, told to the placer.
    const p = this.players.get(id), t = this.throwable(ev.kind);
    if (!p) return;
    // LATER 144: every placing's throw spends the start eye -- the claymore's and the PMN's too -- so an earlier charge's
    // eye never serves a later C4 whose own hold start the room did not see.
    const start = p.placeStart;
    p.placeStart = null;
    if (!p.alive || this.state.phase === 'over') return this.dropped('throw', 'not alive', p);
    if (!t) return this.dropped('throw', 'unknown kind', p);
    const slot = p.equipmentSlots.eligible(ev.kind, ev.slot);
    if (slot === null) return this.dropped('throw', 'none left', p);
    const facing = ev.velocity, l = Math.hypot(...facing);
    if (!(Math.abs(l - 1) <= 0.01)) return this.dropped('throw', 'facing', p);
    // NET-CAP (research 312 §10): before the placing's own tests -- the claymore's four, the wading, the ground
    // (`FUN_005c0ae0` D:L476470-476491 answers before `FUN_005be9a0`'s placing branches run). Never C4: its plant is the
    // Action button's (`FUN_00592d50` D:L452030-452055 -> `FUN_005c0020(..., 0x97)`), which goes straight to
    // `FUN_005be9a0` when `FUN_003d1e20` answers 0, as it does for C4 (D:L475985-475994): `FUN_005c0ae0` is never asked.
    if (t.record.id !== ITEM.C4 && this.netCapRefused(p, t.record.id)) return this.dropped('throw', 'net cap', p);
    // LATER 220's third head (research 369 §2): C4's offer (0x40000) is built past the prompts' common gate (D:L452383; its
    // press D:L452029): judged on the command the press read -- the one before its placing's start the room saw, else the
    // command the plant names (decided once it has run: `timed`; `n` its arrival, LATER 249's order) -- refused by why, the
    // charge kept. The claymore's and the PMN's are the kit's fire, not an
    // offer (`FUN_005c0ae0`'s own ask, D:L476442: not this head).
    if (t.record.id === ITEM.C4) {
      // The review's F1: an honest plant's start is out of the cone by now -- its verdict banked at the start (`bankPlaceGate`).
      const shut = start !== null && start.gate !== undefined ? start.gate : this.actionGateShut(p, start !== null ? start.seq - 1 : ev.seq, n);
      if (shut !== null) return this.dropped('throw', shut, p);
    }
    const s = p.sim.walker.state, feet: V3 = [s.x, s.y, s.z];
    let pos: V3 = [...ev.from];
    if (t.record.id === ITEM.C4) {
      // SUP-03, PF-13: the target is the bound destructible at the node the page's aim struck that takes the charge
      // (`FUN_002739b0`; C4_ACCEPT_DAMAGE_READING: the charge's Explosion_Damage) -- never a type-less action's node
      // (research 210 s8) -- the point in reach (C4_REACH_READING), seen from the head, not on INVISIBLE_DI (005c1970).
      const target = ev.target, surface = ev.surface, damage = t.record.explosionDamage;
      if (target === undefined || !surface || this.world.health.c4TargetAt(surface.path, damage) !== target) return this.dropped('throw', 'no c4 target', p);
      // LATER 122 (#398's review F1): the kit's 99 s fallback (`C4_KIT_TIMER_SECONDS`, `C4_FALLBACK_PLACEHOLDER`) -- the
      // hold off before its callback (`cut`), the throw C4_KIT_TIMER_SECONDS after the hold's start -- runs
      // `FUN_005c1970`'s same block (D:L476883-476905): no reach or line from where the SEAL is by then, the charge at the
      // saved point (D:L476979-476985). Judged as the plant's start saw it -- reach from its feet, the line from its head and
      // camera eye, the save's own tests (`FUN_005be9a0` D:L475399-475419). Its re-read F1: the 99 s counted in the player's
      // own command ticks -- run, and received and waiting (the throw is decided on arrival, its commands on credit; one
      // socket, so every command to its tick is in) -- as the page counts its kit timer on its mover's capped frame time.
      // The queue counted (up to about QUEUE_MAX + CREDIT_MAX + `unran`) makes the event clock's floor the only lower bound
      // (the narrow check's F1): a throw is taken at most FIRE_STALL_CREDIT_TICKS + FIRE_ARRIVAL_JITTER_TICKS (24 ticks)
      // short of the 99 s on the event clock -- about 45 ticks (0.75 s) in wall time, as `start.at` may sit up to
      // FIRE_STALL_CREDIT_TICKS under the server's clock -- and never sooner. F2: only with C4 still in the hand (`handOff`;
      // D:L476887-476892).
      const timer = Math.ceil(C4_KIT_TIMER_SECONDS * TICK_HZ), since = start ? p.ran + p.queue.length - start.ran : -1;
      const fallback = start?.cut === true && since >= timer - FIRE_ARRIVAL_JITTER_TICKS
        && since <= timer + C4_START_EYE_TICKS_PLACEHOLDER + FIRE_ARRIVAL_JITTER_TICKS
        && this.eventClock(p) - start.at >= timer - FIRE_STALL_CREDIT_TICKS - FIRE_ARRIVAL_JITTER_TICKS;
      if (fallback && start!.handOff) return this.dropped('throw', 'c4 hand', p);
      if (!c4InReach(fallback ? start!.feet : feet, surface.point)) return this.dropped('throw', 'c4 reach', p);
      let line: ReturnType<typeof c4Line>;
      // LATER 139: the start's camera eye only where its look passed through the point (`lookFitsPoint` on its frames).
      if (fallback) line = c4Line(this.map.grid, start!.head, surface, this.map.defaultMaterial ?? '', start!.eye && start!.frames && lookFitsPoint(start!.frames, surface.point) ? [start!.eye] : []);
      else {
        // The line from the head as `startRefused` stands it (PF-05: kept on the body's side of a wall along `headEye`).
        const b = this.startBody(p);
        // LATER 144: and the camera's eye at the placing's start (the page's aim), beside the send's -- for its own clip only:
        // the throw's arrival within the plant's clip plus C4_START_EYE_TICKS_PLACEHOLDER and FIRE_ARRIVAL_JITTER_TICKS of the
        // hold, on the room's event clock (`eventClock`), never the page's seq (the narrow re-review's F-A); the body within
        // C4_START_EYE_FEET_PLACEHOLDER of the hold's feet (the clip holds the mover).
        const own = start?.eye && this.eventClock(p) - start.at <= Math.ceil(C4_PLANT_SECONDS * TICK_HZ) + C4_START_EYE_TICKS_PLACEHOLDER + FIRE_ARRIVAL_JITTER_TICKS
          && Math.hypot(feet[0] - start.feet[0], feet[1] - start.feet[1], feet[2] - start.feet[2]) <= C4_START_EYE_FEET_PLACEHOLDER;
        // LATER 139: a camera eye counts only where its look passes through the point (the swept locus), at the send or the placing's start.
        // LATER 305: and the page's own eye at the placing's start (where it picked), where it counts (`pageEye`: added,
        // never in place of the room's) -- held on the start's banked frames, not `eyeAt(start.seq)`: the cone keeps 64
        // commands and the plant's clip runs ~66 (1.098 s), so that command is gone from it by the throw.
        const eyes = [
          ...(p.cone.lookAt(ev.seq, surface.point) ? [this.orderOrigin(p, ev.seq)] : []),
          ...(own && start!.frames && lookFitsPoint(start!.frames, surface.point) ? [start!.eye!] : []),
          ...(own ? this.pageEye(p, start!.frames, ev.eye, surface.point) : []),
        ];
        line = c4Line(this.map.grid, headEye(this.map.grid, b.feet, headPoint(b), () => true), surface, this.map.defaultMaterial ?? '', eyes);   // LATER 121, 144: the camera's eyes
      }
      if (!line.clear) return this.dropped('throw', `c4 ${line.why}`, p);
      if (line.material === C4_REFUSED_MATERIAL) return this.dropped('throw', 'c4 surface', p);
      // FUN_005c1970 D:L476979-476985: launch at the validated target-ray point (research 209 §16).
      pos = [...surface.point];
    } else if (this.claymoresDown(p) >= CLAYMORE_RULES.maxPlaced) return this.dropped('throw', 'charges down', p);
    // PAR-96 B3: the count before the water, as the claymore's and the PMN's fire (`FUN_005be9a0` D:L475307-475308, then
    // D:L475310-475320): the reason tallied is the first that refuses.
    else if (wadingDepth(this.map.grid, feet) > CLAYMORE_RULES.maxWaterDepth) return this.dropped('throw', 'wading', p);
    else if (!chargeRests(this.hullCast(), ev.from, s.y, s.y + EYE_HEIGHT)) return this.dropped('throw', 'ground', p);
    // SVC-23b: under the hand -- within reach across from the feet -- along the page's own path from the head (after the
    // ground's check, so a point no surface holds is refused for that).
    if (t.record.id !== ITEM.C4) {
      const start = this.startRefused(this.startBody(p), ev.from, true);
      if (start) return this.dropped('throw', `hand ${start}`, p);
    }
    p.equipmentSlots.spend(ev.kind, slot);
    const g = launchGrenade(pos, [0, 0, 0], t.record);
    g.state = 'rest';
    const f = this.born(this.flyer(p, ev.kind, g, [facing[0] / l, facing[1] / l, facing[2] / l]), this.commandAge(p, ev.seq));   // HOTFIX grenade fuse
    this.flying.push(f);
    this.broadcast({ type: 'grenade', id, kind: ev.kind, from: [...pos], velocity: [...ev.velocity], pid: f.pid }, id);
    this.send(id, { type: 'placed', pid: f.pid, kind: ev.kind, from: [...pos] });       // PF-36: OWN_PID_READING
  }

  /**
   * M7 (research 85 §9.7.1): the Detonator's fire -- `CZKit_DetonateRemoteExplosives` (0x5c0130) sets off every claymore
   * of this player's (`+0xc5`: never a PMN or C4) within `CLAYMORE_RULES.detonateRange` of the player (`+0x1c`), the
   * next tick (`trigger`, `+0xc4`). The others are told (a `grenade` of the Detonator from the player's feet), so their
   * pages set off their copies of his claymores within the same reach (`GrenadeThrower.launchRemote`).
   */
  private detonate(id: number): void {
    const p = this.players.get(id);
    if (!p) return;
    if (!p.alive || this.state.phase === 'over') return this.dropped('throw', 'not alive', p);
    // FUN_005c74e0 (D:L480156-480202): the Detonator is the kit's only with a claymore in it. INT.R5: tallied by why, as
    // the other refusals (they were silent). P38-room (research 85 §9.7.1): no `FireWait` between its fires -- the
    // original's Detonator branch of `FUN_005be9a0` (D:L475477-475478) calls `FUN_005c0130` alone and sets no fire
    // timer (`+0x81c` is written only at D:L475488 and D:L475517); its limits between presses are the page's -- one fire
    // a press (`+0x818` against `FUN_005c0940`, D:L476439) and the claymore's re-select (`FUN_005c8a20(0x99)`, D:L476031).
    if (!EQUIPMENT_SLOTS.some((i) => p.loadout[i] === CLAYMORE.id)) return this.dropped('throw', 'no claymore', p);
    const s = p.sim.walker.state;
    for (const f of this.flying) {
      if (f.owner !== p || f.g.record.id !== CLAYMORE.id || f.g.state !== 'rest') continue;
      if (Math.hypot(f.g.pos[0] - s.x, f.g.pos[1] - s.y, f.g.pos[2] - s.z) <= CLAYMORE_RULES.detonateRange) f.g.trigger = true;
    }
    this.broadcast({ type: 'grenade', id, kind: 'Detonator', from: [s.x, s.y, s.z], velocity: [0, 0, 0] }, id);
  }

  /**
   * M4 (research 94 §C4.2-§C4.3, R94.8): a launcher's round, the page's `throw` of it by name -- taken from a living
   * player whose primary is a carrier (`isCarrier`) in hand, the round one it fires (`roundFits`) with rounds left in a
   * kit slot (`KitRounds`, the redirect `FUN_005c6600`), leaving from the body's side of the walls at the round's
   * `Muzzle_Velocity` (the page lofts the direction, not the speed); the round's `FireWait` apart and past its lock and
   * after-shot clip (`afterShotLock`: the M203 rounds' 0.5 s then `Rifle m203 reload`; none on the MGL). One off its
   * slot; flown here as the grenades are (`launchGrenade`/`stepGrenade`: the fall, the arming dud, the impact) and its
   * blast dealt as theirs (`blast`). M7: a rocket's round goes to `launchRocket`.
   *
   * P4 (the online-parity sweep's TB-10 + WK-1; reading, pending review): judged at the command the round names, as the
   * rocket's since LATER 501 -- the `throw` case sends it through `timed` and `decide` (the stale bound, the mount at the
   * command), and every test here reads that command's frame (`p.cone.frame(ev.seq)`): the weapon in hand, its count for
   * the rifle's return, the lock, the round's wait and the rate, the swap's clip, the playing motion's NoFire and the
   * binoculars, and the start from that frame's head. The original's round gate runs before every round at the pull
   * (`FUN_005c0ae0` -> `FUN_005a7de0(actor, 1, ..)` D:L476442: the swap and reload families, the NoFire; research 218
   * §1.2; nothing fires in view state 4, `FUN_005be9a0` D:L475305), the carrier's included (research 94 §C4.2). Which
   * record `FUN_003d1e10` reads at D:L476375 for a redirected round mode is unread (`NOFIRE_EQUIPMENT_CLASS_READING`'s
   * classes 0x79/0x97 name neither the carrier nor a round, so the NoFire applies either way). Was: judged at its arrival
   * on the present body and count, with no swap, NoFire or binoculars test, every refusal silent.
   */
  private launchRound(id: number, ev: Extract<ClientEvent, { type: 'throw' }>): void {
    const p = this.players.get(id), item = this.kits?.table.arsenal.byName.get(ev.kind);
    if (item && itemClass(item.id) === 'rocketRound') { this.launchRocket(id, ev, item.id); return; }
    if (!p) return;
    // P4, the network's bookkeeping (LOW-2, LATER 503/511's `told`; no original): every refusal is told to the page
    // (`stale`, request 'throw', its seq: `../../viewer/src/matchThrow` `staleThrow` gives the round back on the firearm,
    // `Fire.refundRound`) and tallied `round …`, apart from the rocket's. They count toward the seat's refused signals and
    // the combat report's 'rejected' (LATER 511's F2): the room did refuse them.
    const told = (why: string): void => {
      this.send(p.id, { type: 'stale', request: 'throw', seq: ev.seq });
      this.dropped('throw', `round ${why}`, p);
    };
    if (!p.alive) return told('not alive');
    if (this.state.phase === 'over') return told('over');
    const frame = p.cone.frame(ev.seq);
    if (!frame) return told('no frame');                         // LATER 501's rule: no frame, no round
    const count = frame.count;
    if (frame.weapon !== 0) return told('weapon');               // the rifle in hand at its command (`fireAt`'s `frame.weapon`)
    // M7: the carrier is not the item in the hand (the hand is no frame field: the present, as `fireAt`), nor back up yet.
    if (p.held !== null) return told('hand');
    if (count < p.firearmReadyAt) return told('raise');
    const carrier = p.loadout[0];
    if (!item || !isCarrier(carrier) || !roundFits(carrier, item.id)) return told('carrier');
    const round = p.rounds.round(item.id), ring = p.rounds.ring(item.id);
    // P4, the review's F1: `fireAt`'s order -- the magazine and the kit's timer and lock, then the round gate, then the
    // start and the speed. The original's differs in the first two: `FUN_005c0ae0` asks the gate (`FUN_005a7de0`,
    // D:L476442) before the fire timer `+0x81c` (D:L476446) and the magazine (`FUN_005bd530`, D:L476449). Every one
    // refuses the round and is told, so only which tally a round refused twice over counts differs.
    if (!round || !ring || ring.rounds() <= 0) return told('empty');
    // M4: the kit's one lock (`kit+0x820`: a rifle reload, a round's after-shot) and its one rate timer (`kit+0x8b8`: the
    // rifle's last round at its fastest mode's wait, as `fire` rates it), shared with the carrier's rifle.
    // P3-room (AR-4; reading, pending review): the rifle slot's two bounds, as `fireAt` holds its next round -- the round's
    // fire sets the kit's one fire timer `+0x81c` as a rifle round's does (`FUN_005be9a0` D:L475513-475518, the branch
    // that leaves through `FUN_005bd6d0`, research 94 C4.2), and that timer runs down a game frame at a time
    // (`FUN_005c0fd0` D:L476643-476647): the gap (`fireCycleTicks`) and the console's period over the rifle's chain
    // (`scheduleOpen` on `fireSchedule[0]`, LATER 588 (a)). The round steps neither: its own wait is `roundWaitUntil`.
    // Was: a private copy of the gap alone.
    // P4: at its command's count (`frame.count`), each bound tallied by its own name.
    const rifle = p.records[0];
    if (count < p.reloadUntil[0]) return told('reload');
    if (count < p.roundWaitUntil) return told('wait');
    if (count - p.lastFire[0] < fireCycleTicks(rifle)) return told('rate');
    if (!scheduleOpen(p.fireSchedule[0], rifle, count)) return told('rate');
    // P4: the round gate at its command, in `fireAt`'s order -- the swap's clip (`FUN_005a7de0`'s swap family), the
    // playing motion's NoFire (D:L462612-462705; PF-17, PF.R36) and the binoculars (`FUN_005be9a0` D:L475305).
    if (frame.swapping) return told('swapping');
    if (!frame.fire) return told('nofire');
    if (frame.binoculars) return told('binoculars');
    // SVC-23b: the muzzle at the head of the body its command left (`throwGrenade`'s, `fireAt`'s), not the present body;
    // after the gate, as `fireAt` (a NoFire command's round is tallied 'round nofire' whatever its start).
    const start = this.startRefused(frame, ev.from);
    if (start) return told(`start ${start}`);
    const mv = round.record.muzzleVelocity, speed = Math.hypot(...ev.velocity);
    if (!(mv > 0) || !(Math.abs(speed - mv) <= mv * ROUND_SPEED_SLACK_PLACEHOLDER)) return told('speed');
    // LATER 249: the after-shot keeps the decision's arrival -- `decide` set `p.armedBy` (one arrival a round, `timed`).
    ring.fire();
    this.countShot(p, true, undefined);                          // PF-26: a launched round, one shot (PF.R20)
    p.roundWaitUntil = count + Math.round(round.fireWait * TICK_HZ) - 1;
    const lock = afterShotLock(carrier, round, ring.rounds(), carrier);
    if (lock !== null) {
      // P4: the clip by the body its command left (`fireAt`'s after-shot: `frame.posture`, `frame.velocity`).
      const moving = reloadMoving(...frame.velocity);
      const family = reloadFamily({ item: 'rifle', id: carrier, afterShot: true, roundMode: true });
      const clip = this.clips ? reloadSeconds(this.clips.clips, this.clips.table, frame.posture, moving, family) ?? 0 : 0;
      setLock(p, 0, count, lock, clip, 'afterShot', this.eventClock(p));
      this.lockLife(p, 0, frame.posture, moving, family, clip);   // PF-18
    }
    const dir: V3 = [ev.velocity[0] / mv, ev.velocity[1] / mv, ev.velocity[2] / mv];   // `launchGrenade` scales by MV
    const f = this.born(this.flyer(p, ev.kind, launchGrenade([...ev.from], dir, round.record)), this.commandAge(p, ev.seq));   // HOTFIX grenade fuse
    this.flying.push(f);
    this.broadcast({ type: 'grenade', id, kind: ev.kind, from: [...ev.from], velocity: [...ev.velocity], pid: f.pid }, id);
  }

  /**
   * M7 (research 94 §C4, R94.6/R94.9): a rocket -- the page's `throw` of the LAW HEAT or the RPG round. Taken from a
   * living player whose kit holds the launcher that fires it in an equipment slot (`rocketRoundOf`: the rockets are
   * equipment, SlotCost 2, the paired slot its round) with a round left (`KitRounds`: the LAW HEAT's one; the RPG's
   * slots fed one at a time, `FUN_005c3000`), from the eye's reach on the body's side of the walls, at the round's
   * `Muzzle_Velocity` (`ROCKET_LAUNCH_SPEED_READING`); the round's `FireWait` (3 s, `kit+0x8b8`) apart, which covers its
   * after-shot feed (`ReloadDelayAfterShot` 1 s). Flown here -- `AccelerationFactor` along the flight, no fall, the arming
   * dud inside 100 u, the impact blast (20 in 15 m) -- and its backblast fired at once from the muzzle backwards
   * (`FUN_003d2d70`: the `Backblast` record, 6 in 7 m, reaching only inside its cone: `blast`).
   */
  private launchRocket(id: number, ev: Extract<ClientEvent, { type: 'throw' }>, roundId: number): void {
    const p = this.players.get(id);
    if (!p || !p.alive || this.state.phase === 'over') return;
    // LATER 501: judged at the command the round names -- its frame, and its count (`AimFrame.count`, the room's
    // `p.ran` at that command), never the room's present count: a rocket decided commands later is not let through early.
    const frame = p.cone.frame(ev.seq);
    if (!frame) return this.dropped('throw', 'no frame', p);      // LATER 501: the firearm's rule -- no frame, no round
    const at = frame.count;
    // LATER 503, LATER 511 (2), the network's bookkeeping: a refusal an honest page can reach after it spent the round is
    // told (`stale`, request 'throw', its seq: its journal gives the round back, `../../viewer/src/rocket` `refund`) and
    // tallied by why, as `decide`'s stale bound and the mount's refusal tell a throw.
    const told = (why: string): void => {
      this.send(p.id, { type: 'stale', request: 'throw', seq: ev.seq });
      this.dropped('throw', why, p);
    };
    // M7: only from the launcher in the hand, its raise over (the kit fires its current item only, `kit+0x824`). LATER 511:
    // the hand (a raise NU-6's `refuseRaise` undid mid-swap), the raise's end (the page's clock against the commands).
    if (p.held === null || rocketRoundOf(p.held) !== roundId) return told('hand');
    if (at < p.heldReadyAt) return told('raise');
    // ROOM_RAISE_TRUST_ADAPTATION (P13, AR-3): the take-up's end only -- the body's raise envelope is the page's (LATER 192).
    if (!EQUIPMENT_SLOTS.some((i) => rocketRoundOf(p.loadout[i]!) === roundId)) return;
    const round = p.rounds.round(roundId), ring = p.rounds.ring(roundId);
    if (!round || !ring || ring.rounds() <= 0) return;
    // LATER 199: the playing motion's NoFire at the command the round names (`FUN_005c0ae0` -> `FUN_005a7de0(actor, 1, ..)`
    // D:L476442, after the raise; the launcher's class 0x91 as every bullet class), as the firearm's round (`fire`).
    // `FUN_005a7de0` (D:L462594) is a wider gate; only its NoFire part is held here, the rest ledgered (`NOFIRE_STATE_READING`, `LAUNCHER_STICK_LOWER_READING`).
    // LATER 503: NoFire told (`told`) -- the page fired this rocket and spent its round.
    if (!frame.fire) return told('nofire');
    const s = p.sim.walker.state;
    // SVC-23b: the muzzle at the body's head. LATER 511: told (a body the page and the room hold apart).
    const start = this.startRefused(this.startBody(p), ev.from);
    if (start) return told(`start ${start}`);
    // The speed: not told (LATER 511) -- an honest page sends the round's `Muzzle_Velocity` exactly (`rocketLaunch`).
    const mv = round.record.muzzleVelocity, speed = Math.hypot(...ev.velocity);
    if (!(mv > 0) || !(Math.abs(speed - mv) <= mv * ROUND_SPEED_SLACK_PLACEHOLDER)) return;
    if (at < p.rocketWaitUntil) return told('wait');             // LATER 501: at its command's count; LATER 511: told
    ring.fire();
    this.countShot(p, true, undefined);                          // PF-26: a rocket, one shot (PF.R20)
    p.rocketWaitUntil = at + Math.round(Math.max(round.fireWait, round.reloadAfterShot ? round.reloadDelayAfterShot : 0) * TICK_HZ) - 1;
    const dir: V3 = [ev.velocity[0] / mv, ev.velocity[1] / mv, ev.velocity[2] / mv];
    const age = this.commandAge(p, ev.seq);                      // HOTFIX grenade fuse: the rocket's and its backblast's
    const f = this.born(this.flyer(p, ev.kind, launchGrenade([...ev.from], dir, round.record)), age);
    this.flying.push(f);
    this.broadcast({ type: 'grenade', id, kind: ev.kind, from: [...ev.from], velocity: [...ev.velocity], pid: f.pid }, id);
    const back = round.record.hasBackblast ? this.backblastRecord() : null;
    if (back) {
      // BACKBLAST_ORIGIN_READING (`backblastLaunch`): the muzzle; MV 0 and Timer1 0 -- it goes off where it leaves, on the
      // next tick. PF-22 (BACKBLAST_CONE_AXIS_READING, research 181 s2.3): its cone's axis is the firer's body's back
      // (the 0x9f model takes the owner node's rotation, FUN_003cb1a0 0x3cb308-0x3cb35c), not the aim reversed.
      const axis = backblastAxis(s.yaw);
      this.flying.push(this.born(this.flyer(p, back.name, launchGrenade([...ev.from], [0, 0, 0], back), axis), age));
    }
  }

  /**
   * NU-6 F1: `held` becomes `item` on command `seq` (`heldNext`) -- at once when the room has run that command already,
   * as `launcherDown` then keeps no clip.
   */
  private holdFrom(p: Player, item: number | null, seq: number): void {
    p.throwStart = null;                                         // THROW-INTERRUPT: a launcher raised or lowered
    if (seq <= p.sim.seq) { p.held = item; p.heldNext = null; } else p.heldNext = { item, seq };
  }

  /**
   * NU-6 N1 (the re-review of d5d8edc99): a raise still waiting for its command when a firearm swap runs before it is
   * refused -- its press lands inside the swap's clip, where the take is refused (`FUN_005a8cb0` D:L463150 ->
   * `FUN_005a7de0(.., 1, 1)` D:L462594 -> `FUN_005a7ab0` D:L462512, D:L462636), so `FUN_005a6d30` never runs. What
   * `raiseLauncher` laid is undone: the set put back, nothing up, its kept clip refused (`LauncherClips.next` takes it
   * with no start on the mover: a start the mover never took holds nothing, `liveOn`). Was (NU-6 F1 as first built):
   * the raise dropped with its set left `until: Infinity` and its clip played on the swapped-to firearm.
   */
  private refuseRaise(p: Player, raise: { seq: number; set?: { start: number; until: number } | null }): void {
    p.launcherUp = null;
    p.raiseAfterStick = null;
    p.heldReadyAt = -1;
    p.launcherSet = raise.set ?? null;
    p.sim.launcherClips.next(raise.seq);
    this.dropped('throw', 'swapping', p);
  }

  /** NU-6 F1: a waiting item taken on command `seq`, before the mover runs it -- with the clip that command begins. */
  private heldOn(p: Player, seq: number): void {
    const n = p.heldNext;
    if (n && seq >= n.seq) { p.held = n.item; p.heldNext = null; }
  }

  /**
   * M7: the page's `throw` of a rocket launcher -- it is taken up (`FUN_005c4b10`): the kit's own launcher, in an
   * equipment slot, with a round it fires (`slotSelectable`, `FUN_005bdc30`); ready to fire after its raise
   * (`launcherRaiseSeconds` from the firearm in hand: `FUN_005a6d30`'s `seal_rifle2launcher` 1.4155 s or
   * `seal_pistol2launcher` 1.3776 s; PF-21), on the player's command clock. The others draw it (the body's item).
   * PF-37 (research 236 s3): not wading deeper than `LAUNCHER_BODY_READING.maxWadingDepth` 8.5 (`FUN_005857e0`
   * D:L444332-444360, `wadingDepth`) -- refused as 'throw: wading'; a launcher already up stays up (the take-up's test).
   */
  private raiseLauncher(id: number, name: string, seq: number): void {
    const p = this.players.get(id), item = this.itemByName(name);
    if (!p || !p.alive || !item) return;
    // PAR-83, F1 of its review: up in the room with the raise's own command not yet run -- a stick lower may come on a
    // queued command (the page sends none): decided there (`launcherStick`), so the room never ends down where the page is up.
    if ((p.heldNext ? p.heldNext.item : p.held) === item.id) { if (seq > p.sim.seq && p.launcherUp !== null) p.raiseAfterStick = { name, seq }; return; }
    // F1: the raise rides `seq + 1`; refused while the stick's moving lower lives there (`FUN_005a8cb0` -> `FUN_005a7de0`
    // -> `FUN_005a7980` D:L462492-462499), as the page's `WalkMode.swapGate` refuses the take on that command.
    if (seq + 1 < p.movingLowerUntil) return this.dropped('throw', 'moving lower', p);
    // PAR-84 (research 230 section 5.2.10): nor while the still lower's clip lives on that command (`FUN_005a8cb0` ->
    // `FUN_005a7980` D:L462484-462491), by the seqs (the room may run behind the event); the page's `swapGate` the same.
    if (p.sim.launcherClips.liveOn(seq + 1)) return this.dropped('throw', 'launcher clip', p);
    if (!EQUIPMENT_SLOTS.some((i) => p.loadout[i] === item.id)) return;
    const round = rocketRoundOf(item.id), ring = round === null ? null : p.rounds.ring(round);
    if (!ring || ring.rounds() <= 0) return;
    const s = p.sim.walker.state;
    if (wadingDepth(this.map.grid, [s.x, s.y, s.z]) > LAUNCHER_BODY_READING.maxWadingDepth) return this.dropped('throw', 'wading', p);
    this.holdFrom(p, item.id, seq + 1);                          // NU-6 F1: the item with the raise's clip, on seq + 1
    p.heldReadyAt = p.ran + Math.round(launcherRaiseSeconds(p.sim.weapon) * TICK_HZ);
    // PAR-81 (research 230 section 5.2.6): the launcher's set from the raise's own command, the one after the event's (the
    // last the page sent) -- pushed before the driver on its press's frame (`FUN_005a6d30` D:L462105); a lower still
    // under way keeps its start (the set never left the body).
    const set = p.launcherSet;
    p.launcherSet = { start: set !== null && set.until >= seq + 1 ? set.start : seq + 1, until: Infinity };
    if (p.heldNext !== null && p.heldNext.item === item.id) p.heldNext.set = set;   // NU-6 N1: put back if a swap refuses it
    // PAR-83 (research 230 section 5.2.8): its base on top from the command after the raise's end, the stick's from there.
    const from = p.sim.weapon;
    p.launcherUp = { base: launcherBaseCommand(seq, from === 1 ? LAUNCHER_RAISE_CLIPS.pistol : LAUNCHER_RAISE_CLIPS.rifle), from };
    // PAR-84 (research 230 section 5.2.10): the raise's clip held on the body from its own command, e + 1 -- started by
    // the mover's `prepare` on the first command run at or after it (`MoverSim.launcherClips`), the page's on the same.
    p.sim.launcherClips.keep({ name: launcherClipName(from), reversed: false, at: seq + 1 });
  }

  /**
   * M7: the page's `throw` of the firearm in its slot while a launcher is up: the launcher away, the firearm's raise --
   * `FUN_005a6b70`, the raise's clip reversed for the firearm taken back (`launcherLowerSeconds`; PF-21).
   *
   * PAR-81 (research 230 section 5.2.6): the launcher's set goes at the reversed clip's end (`FUN_00582540`
   * D:L443058-443062), on the driver's end test after the jump's read: the lower's `playedOutCommand`-th command from its
   * own (the event's seq + 1) -- `launcherSet.until`, refused through it.
   */
  private lowerLauncher(id: number, name: string, seq: number): void {
    const p = this.players.get(id);
    // PAR-83: a lower after the stick's finds `held` already null -- the stick's is laid once, on its own command.
    if (!p || (p.heldNext ? p.heldNext.item : p.held) === null || (name !== p.records[0].name && name !== p.records[1].name)) return;
    if (p.sim.launcherClips.liveOn(seq + 1)) return this.dropped('throw', 'launcher clip', p);   // PAR-84: inside the raise
    this.holdFrom(p, null, seq + 1);                             // NU-6 F1: the firearm's id with the still lower's clip
    this.launcherDown(p, name === p.records[0].name ? 0 : 1, seq);
  }

  /**
   * The still lower to the firearm `from` pushed on the command after `seq` (`FUN_005a6b70` in the launcher's set): the
   * firearm's clock (`launcherLowerSeconds`), and the set given back at the reversed clip's end, its `playedOutCommand`-th
   * command (PAR-81). The page's lower (`lowerLauncher`) and, PAR-83's F3, the mover's swap with the launcher up (`aim`).
   */
  private launcherDown(p: Player, from: 0 | 1, seq: number): void {
    p.launcherUp = null;
    p.raiseAfterStick = null;                                    // PAR-83, F1: lowered by the page, no raise waits on a stick
    p.firearmReadyAt = p.ran + Math.round(launcherLowerSeconds(from) * TICK_HZ);
    const clip = from === 1 ? LAUNCHER_RAISE_CLIPS.pistol : LAUNCHER_RAISE_CLIPS.rifle;
    p.launcherSet = { start: p.launcherSet?.start ?? seq + 1, until: seq + playedOutCommand(clip.playback, clip.frames) };
    // PAR-84 (research 230 section 5.2.10): the still lower's clip -- the raise's reversed -- held on the body from l + 1,
    // when that command is still to run (the page's lower). `aim`'s swap with the launcher up has run its command and
    // plays the firearm's swap there (research 230 section 5.2.10, step 8: F3's still lower in `prepare`, not built).
    if (seq + 1 > p.sim.seq) p.sim.launcherClips.keep({ name: launcherClipName(from), reversed: true, at: seq + 1 });
  }

  /**
   * PAR-83 (research 230 section 5.2.8; PTW.R3 with `../../viewer/src/walk` `WalkMode.launcherStickRan`): the launcher's
   * stick lower on command `seq` (counted `count` on the player's clock), decided from that command's own `stick`, after
   * its jump was asked (`jumpRefused`) -- as the ground driver's looped branch does it (`FUN_00550ef0` D:L418263-418278):
   * with the launcher up and its base on top (from `launcherUp.base`), a move axis past 0.1 (`launcherStickLowers`; the
   * turn not read) gives the set back on this command (`FUN_0058c4a0` D:L418270), the firearm in the hand
   * (D:L418269-418277), and plays the moving lower on the second channel (D:L418278 -> `FUN_005a6b70` D:L462073 /
   * D:L462082), whose life holds the firearm's round (`launcherMovingLowerSeconds`; `FUN_005a7980` D:L462492-462499).
   * The page sends no event for it. [reading: `FUN_005a7ab0`'s refusal under the RPG's feed, `FUN_005b4b40`'s contact
   * zero and the top's type (a one-shot over the base lowers nothing: F2 of PAR-83's review) are not held --
   * `LAUNCHER_STICK_LOWER_READING`, research 230 section 5.2.9]
   */
  private launcherStick(p: Player, seq: number, stick: { readonly forward: number; readonly right: number }, count: number = p.ran): void {
    const up = p.launcherUp, set = p.launcherSet;
    if (!p.alive || up === null || p.held === null || set === null || seq < up.base || !launcherStickLowers(stick)) return;
    p.held = null;
    p.launcherUp = null;
    p.launcherSet = { start: set.start, until: seq };
    p.firearmReadyAt = count + Math.round(launcherMovingLowerSeconds(up.from) * TICK_HZ);
    // PAR-83, F1 of its review: the moving lower's life on the commands (`launcherMovingLowerCommands`), the take and the
    // swap refused inside it; a raise that arrived before this command ran, at or after it, decided now (`raiseAfterStick`).
    p.movingLowerUntil = seq + launcherMovingLowerCommands(up.from);
    const after = p.raiseAfterStick;
    p.raiseAfterStick = null;
    if (after !== null && after.seq >= seq) this.raiseLauncher(p.id, after.name, after.seq);
  }

  /** The `Backblast` record (159) of the kit table, null without it. */
  private backblastRecord(): ThrowableRecord | null {
    return this.kits?.table.throwables?.get(ITEM.BACKBLAST)?.record ?? null;
  }

  /** What a flying `kind` goes off as: a throwable or charge (the kit table's, else baked), or a launcher round or rocket. */
  private thrown(kind: string): { record: ThrowableRecord; piercing: number; fragments: boolean } | null {
    const t = this.throwable(kind);
    if (t) return { ...t, fragments: t.record.explosionDamage > 0 };
    const item = this.kits?.table.arsenal.byName.get(kind);
    const round = item ? this.kits?.table.rounds.get(item.id) : undefined;
    return round ? { record: round.record, piercing: round.piercing, fragments: round.record.explosionDamage > 0 } : null;
  }

  /** A C4 still flying or at rest. The in-page clock's catch-up reads it (research 209 §18). */
  c4Pending(): boolean {
    return this.flying.some((f) => f.kind === 'C4' && f.g.state !== 'removed');
  }

  /**
   * Every grenade in the air stepped once per game frame elapsed this tick (PF-04, PF.R8: the projectile tick
   * `FUN_003c9fb0` runs once per game frame with its dt, research 179 §9.13 and 181 §6.4 X4; the frame is
   * `GAME_FRAME_DT` = 525/15734 s, research 208): the 60 Hz tick feeds a `GameFrameAccumulator`, as the page's
   * `GrenadeThrower.fly` does, so the two step the same frames; a blast's damage. M7:
   * an armed PMN is tripped by any living actor inside its `ProximityDistance` first (`proximityTripped`,
   * `FUN_00543930`; `PMN_FRIENDLY_READING`: its owner and his team too), and a round that goes off on impact meets the
   * bodies as well as the hull (`bodyCast`).
   * HOTFIX grenade fuse (research 85 §6.1): the frames are the step's credit (`creditStep`), not one tick a step -- the
   * wall time the bodies are credited (LOW-12, research 223 §2.2: a stall the server loop drops past five periods counted
   * once, at its first step, the steps after it nothing), so the fuse and the flight keep the clock the bodies move on,
   * as the original's one frame clock does (`FUN_003c9fb0`'s dt; `FUN_005a0e70` D:L459070 judging the blast at the
   * detonation's frame). Both, not the fuse alone: `PostTick` counts the timers by the same dt the flight steps by
   * (research 85 §5.1), and the page flies both on its wall time -- a fuse ahead of a lagging flight would go off where
   * no page's grenade is. At most `ROOM_FLIGHT_MAX_FRAMES_ADAPTATION` frames a step.
   * A projectile new since the last step (`Flying.late`, stamped at every creation by `born`: a hand throw, a launched
   * round, a rocket and its backblast, a turret's round, a charge set down, a death's dropped grenade) is flown its own
   * age, that projectile alone, before the step's frames. Made between steps, its age runs to the last step's clock (a
   * launched round's command may be still to run: less than none) and the step's credit is still to come; made inside
   * this step (`inStep`: in the step's burst, the room's clock already holding the step's credit; the review's F1), its
   * age is its creation's. Flown that age and no more: the part past the step's credit (the hand throw's alone, at most
   * THROW_DATE_BACK_TICKS_ADAPTATION; `dateBack`) then the step's frames; or, its age under the credit by a tick or more
   * (made late in a stall's burst), its age's frames alone and none of the step's. The age is floored at a tick, so in a healthy room
   * (a tick's credit) a new projectile takes the step's frames as before. One made while another is flown its own age (a
   * death's drop, `deathDrop`, at that projectile's kill; Codex P2 on PR #646) is flown beside it the frames after its
   * birth, then as that projectile is: alone, none of the step's; else the step's.
   */
  private flyGrenades(): void {
    this.creditOpen = false;
    if (!this.flying.length) { this.flight.reset(); return; }
    const frames = this.flight.advance(this.creditStep / TICK_HZ);
    const late = this.flying.filter((f) => f.late !== undefined);
    if (frames === 0 && !late.length) return;
    const hull = this.hullCast();
    const origins = [...this.players.values()].filter((q) => q.alive).map((q) => { const w = q.sim.walker.state; return [w.x, w.y, w.z] as const; });
    const alone = new Set<Flying>();
    for (const f of late) {
      const { own, alone: only } = this.dateBack(f.late!);
      delete f.late;
      if (only) alone.add(f);
      const n = this.dateBackFrames(own);                        // a hand throw's: the frames `throwAge` told the pages
      // Codex P2 on PR #646: a projectile made during this flight (a death's drop, its blast's or its hit's kill) is flown
      // the frames after its birth beside it, after it as the list orders them; then, as it: alone, none of the step's,
      // else the step's.
      const newborn: Flying[] = [];
      for (let k = 0; k < n; k++) {
        const was = this.flying.length, flown = newborn.length;
        this.flyFrame(f, hull, origins);
        for (let i = 0; i < flown; i++) this.flyFrame(newborn[i]!, hull, origins);
        for (let i = was; i < this.flying.length; i++) { const nb = this.flying[i]!; delete nb.late; newborn.push(nb); }
      }
      if (alone.has(f)) for (const nb of newborn) alone.add(nb);
    }
    for (let k = 0; k < frames; k++) {
      // PF-36: the charges damaged since the last frame (`chargeHit`) go off on this one (`+0xc4`, the Detonator's and
      // the proximity's queue; VOLATILE_CHAIN_TIMING_READING) -- whatever the list's order, so a chain is a frame a link.
      for (const f of this.flying) {
        if (!f.queued) continue;
        delete f.queued;
        if (f.g.state === 'rest') f.g.trigger = true;
      }
      for (const f of this.flying) if (!alone.has(f)) this.flyFrame(f, hull, origins);
    }
    for (let i = this.flying.length - 1; i >= 0; i--) if (this.flying[i]!.g.state === 'removed') this.flying.splice(i, 1);
  }

  /** One game frame of one projectile (`flyGrenades`): the proximity, the step, a direct hit, a blast. */
  private flyFrame(f: Flying, hull: HullCast, origins: readonly (readonly [number, number, number])[]): void {
    if (f.g.state === 'removed') return;
    if (f.g.record.proximity !== undefined) proximityTripped(f.g, origins);
    const bodies: (BodyHit | HostageBodyHit)[] = [];
    const cast = f.g.record.impact && f.g.state === 'flight' ? this.bodyCast(hull, f.owner, bodies) : hull;
    const start: V3 = [f.g.pos[0], f.g.pos[1], f.g.pos[2]];       // where the frame began (GRENADE_CONTACT_RANGE_READING)
    const events = stepGrenade(f.g, GAME_FRAME_DT, cast);
    // The body the round met this frame -- where it went off, or bounced as a dud -- takes its direct hit first.
    const met = events.find((e) => e.kind === 'explode' || e.kind === 'dud' || e.kind === 'bounce');
    const body = met && 'point' in met ? bodies.find((b) => b.point.every((v, i) => Math.abs(v - met.point[i]!) < 1e-6)) : undefined;
    if (body) { if ('hostage' in body) this.hostageDirectHit(f, body); else this.directHit(f, body); }
    // LATER 851: every contact this frame, bounce or pass, in the order met, is a hit on the struck node -- before the
    // frame's timers (`HandleIntersections` in `PostTick`, then `HandleTimers` 0x3c99a0).
    for (const e of events) if ((e.kind === 'bounce' || e.kind === 'pass') && e.owner !== undefined) this.sceneContact(f, e.owner, e.point, start);
    for (const e of events) if (e.kind === 'explode') {
      // C4's Timer1 and its blast are one frame (`HandleTimers` 0x3c99a0, then `FUN_003c7600`). The page's
      // copy waits for this `detonate` -- the owner included, no `except` -- instead of opening the barricade
      // on its own fuse while this room is still behind (research 209 §18).
      if (f.kind === 'C4') this.broadcast({ type: 'detonate', pid: f.pid, by: null });
      this.blast(f, e.point);
    }
  }

  /**
   * LATER 851 (research 85 §5.2): one contact of a bouncing projectile -- a bounce or a pass -- on the hull polygon of
   * `owner` (GRENADE_CONTACT_NODE_READING). `HandleBounce` (`FUN_003c8f50`) ends every contact by calling the struck
   * node's `+0x94` handler (D:L319747-319750); a scene destructible's is `FUN_00273a50` (research 209), which measures to
   * the target's bounds midpoint and hands `FUN_003c7490` the projectile -- in flight or at rest (state 1 or 2, never the
   * blast's 5 or 6), so its impact branch: `ImpactDamage` plus `Damage_Modifier` against the shield (D:L318606-318622),
   * `FUN_003c7600`'s range falloff (D:L318737-318760) from the projectile where the frame began
   * (GRENADE_CONTACT_RANGE_READING) with the weapon's `Effective_Range` and `Maximum_Range` (world units already:
   * `throwableRecord`), x14 (D:L318767), the armour step with the round's `Piercing` -- the M67's 0.2 x 14 = 2.8 kills a
   * health-1 pane, and any contact (a rating of 0 too) an HP-0 block. A record with no `ImpactDamage` over 0 (the
   * charges) hands 0. A death scores its action's points to the thrower (`actionDied`, ACTION_POINTS_ACTOR_READING), as
   * the blast's does. A second polygon of a target that died finds it spent (`hitAt`), as a round's does (P11).
   */
  private sceneContact(f: Flying, owner: string, point: V3, start: V3): void {
    const r = f.g.record;
    const target = this.world.health.at(owner);
    if (target === null) return;
    const hit = this.world.health.hitAt(owner, {
      kind: 'impact', rating: r.impactDamage ?? 0, modifier: r.damageModifier ?? 0, point: [...point], piercing: this.thrown(f.kind)?.piercing ?? 0,
      range: { from: start, effective: r.effectiveRange, maximum: r.maximumRange },
    });
    if (hit.died) this.actionDied([target], this.thrower(f));
  }

  /**
   * M7: the hull and the living bodies along a segment, nearest first -- a body met as the `PERSON` material (SOILS:
   * PENETRATION 0.97, a hit `HandleImpact` 0x3c8920 sets an explosive round off at, research 85 §5), through the same
   * bone boxes a round meets (`bodyVolumes`, `rayBody`; BONE-BOXES, research 398 s13.1: a round that goes off leaves the
   * walk at its first record, D:L319477-319485, its range 0 and the result 4 -- so each body gives its nearest box, any
   * bone's, and the flight takes the nearest of all). Only a round that goes off on impact asks it: the hand grenades
   * keep the hull (their bounce off a body, `DAT_003e14f8`, is not modelled here). The owner's own body is passed
   * over, as a bullet leaves its shooter's (`fire`: `q === p` skipped) -- the body itself, not its id: a departed
   * shooter's round meets the next page handed its id (`DEPARTED_CHARGES_READING`).
   */
  private bodyCast(hull: HullCast, owner: Player, met: (BodyHit | HostageBodyHit)[]): HullCast {
    const person = SOILS.find((m) => m.name === 'PERSON')!;
    return (a, b) => {
      const hits: HullHit[] = hull(a, b);
      const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], reach = Math.hypot(...d);
      if (!(reach > 0)) return hits;
      const dir: V3 = [d[0] / reach, d[1] / reach, d[2] / reach];
      for (const q of this.players.values()) {
        if (!q.alive || q === owner) continue;
        const w = q.sim.walker.state, feet: V3 = [w.x, w.y, w.z];
        const hit = rayBody(a, dir, reach, this.liveVolumes(q, feet));   // PRONE-TILT; HIT-POSE: the live pose's where held
        if (!hit) continue;
        const point: V3 = [a[0] + dir[0] * hit.t, a[1] + dir[1] * hit.t, a[2] + dir[2] * hit.t];
        hits.push({ point, normal: [-dir[0], -dir[1], -dir[2]], material: person, t: hit.t / reach });
        met.push({ player: q, part: hit.part, point });
      }
      // HX-1: after the players, the hostages where they stand (their own capsules at their stance).
      for (const h of this.extraction?.hostages ?? []) {
        if (!this.extraction!.targetable(h)) continue;
        const hit = rayBody(a, dir, reach, bodyVolumes(h.at, h.yaw, this.extraction!.posture(h), this.hostageVolumes(h), h.motion?.rootTilt));   // PRONE-TILT-2 (5)
        if (!hit) continue;
        const point: V3 = [a[0] + dir[0] * hit.t, a[1] + dir[1] * hit.t, a[2] + dir[2] * hit.t];
        hits.push({ point, normal: [-dir[0], -dir[1], -dir[2]], material: person, t: hit.t / reach });
        met.push({ hostage: h, part: hit.part, point });
      }
      return hits.sort((x, y) => x.t - y.t);
    };
  }

  /**
   * M7: a launched round striking a body (`HandleImpact` 0x3c8920 L319416-319418: the struck node's `+0x94` handler,
   * vtable `+8`, called before the arming test -- so a dud inside 10 m strikes too): the part takes the round's
   * `GetDamage` by its non-explosive branch (0x3c7600 L318730-318750: `ImpactDamage` + the weapon's `Damage_Modifier`, full
   * to `Effective_Range`, to 0 at `Maximum_Range`) at the bullet's x14 (`bulletDamage`, research 91 §1.1), the round's
   * piercing, once a body a round. IMPACT_HIT_READING: that the character's handler applies this damage as a bullet's hit
   * (on the part the capsule names) is read from the shared `GetDamage`, the handler itself not traced. Friendly fire off
   * spares the thrower's team at the hit, as the blast does (`ffRefuses`); the damage is the packet's integer (PF-22).
   */
  private directHit(f: Flying, body: BodyHit): void {
    const r = f.g.record, dmg0 = r.impactDamage ?? 0;
    const q = body.player, thrower = this.thrower(f);
    if (!(dmg0 > 0) || this.players.get(q.id) !== q || !q.alive || (f.struck ??= new Set()).has(q)) return;
    f.struck.add(q);
    if (body.part === NO_PART && IMPACT_NO_PART_READING === 'nothing') return;   // BONE-BOXES: a no-damage bone's box first
    const distance = Math.hypot(body.point[0] - f.g.launch[0], body.point[1] - f.g.launch[1], body.point[2] - f.g.launch[2]);
    const report = { request: 'impact', weapon: r.id, part: body.part, distance, point: [body.point[0], body.point[1], body.point[2]] as V3 };   // INT.R5
    if (this.refuses(thrower, q, r.id) !== null) {               // PF-22: the gate, the owner's side at the hit
      this.combat(thrower, q, { ...report, status: 'rejected', reason: FRIENDLY_FIRE });
      return;
    }
    // GetDamage's bullet branch (L318741-318759), `bulletDamage`: ImpactDamage + the weapon's Damage_Modifier, the range
    // falloff; at the floor (the character's hit passes 0, L459241) or under it nothing, else x14.
    const IMPACT_HIT_READING = { impactDamage: dmg0, damageModifier: r.damageModifier ?? 0, effectiveRange: r.effectiveRange / UNITS_PER_METRE, maximumRange: r.maximumRange / UNITS_PER_METRE };
    const raw = bulletDamage(IMPACT_HIT_READING, distance);
    if (raw === null || !(raw > 0)) { this.combat(thrower, q, { ...report, status: 'miss', reason: raw === null ? 'beyond range' : 'no damage' }); return; }
    // PF-26: a direct hit, once a flight (PF.R20) -- counted only when this is the flight's FIRST body: a flight whose first
    // body was refused (a teammate's, the thrower's own, beyond range) and whose next is a living enemy counts no hit
    // (HIT_COUNT_READING, research 216 s5; the review of 2026-10-05).
    if (f.struck.size === 1) this.countShot(f.owner, false, q, true, body.part);
    // PF-22: the hit packet's bytes (`quantiseHit`, FUN_002bd220 D:L161655-161672; a direct hit goes through FUN_005a5a80).
    const { damage: dmg, piercing } = quantiseHit(raw, this.thrown(f.kind)?.piercing ?? 0);
    const scale = this.ruleHitEvent(thrower, q, r, dmg);         // FCW-31: before the damage is applied (`hit.scale`; 1 without a host)
    const laid = scale === 1 ? dmg : dmg * scale;
    const was = overall(q.health);
    const healthBefore = [...q.health.hp], armourBefore = [...q.health.armour];
    const died = applyHit(this.woundable(q), body.part, laid, piercing) && !this.deathless(q);   // CPS cell-alive
    this.send(q.id, { type: 'hurt', health: [...q.health.hp], from: [...f.g.launch], part: body.part });
    this.combat(thrower, q, { ...report, status: 'applied', rawDamage: laid, healthBefore, armourBefore, killed: died });
    if (died) {
      const how: KillHow = q === f.owner ? 'suicide' : thrower ? 'weapon' : 'orphan';
      this.kill(q, thrower, this.weaponName(r.id, r.name), how, deathCause('bullet', body.part), deathClip('bullet', body.part, q.sim.walker.posture, this.opts.random), how === 'orphan' ? f.name : undefined);
    } else {
      // Alive, it flinches for the others as a bullet's hit does (`flinch`; FUN_005a54d0 L461397-461405): under
      // IMPACT_HIT_READING the hit is a bullet's (cause 5, as FUN_005abbc0 L464731 passes), not a blast's (cause 4,
      // FUN_005a0e70 L459285, which the gate skips).
      this.flinch(q, body.part, was);
    }
  }

  /**
   * HX-1: a launched round striking a hostage -- `directHit`'s rule (the round's `GetDamage` bullet branch at the part,
   * once a body a round, the packet's integer) with the hostage's gate (`HOSTAGE_FF_READING`: never refused) and its
   * table; a departed thrower's round kills uncounted (`WORLD_KILL_UNCOUNTED_READING`). No flinch, no count, no report.
   */
  private hostageDirectHit(f: Flying, body: HostageBodyHit): void {
    const r = f.g.record, dmg0 = r.impactDamage ?? 0, h = body.hostage, thrower = this.thrower(f);
    if (!(dmg0 > 0) || !this.extraction!.targetable(h) || (f.struckHostages ??= new Set()).has(h.id)) return;
    f.struckHostages.add(h.id);
    if (body.part === NO_PART && IMPACT_NO_PART_READING === 'nothing') return;   // BONE-BOXES: a no-damage bone's box first
    if (this.hostageRefuses(thrower, r.id, h)) return;
    const distance = Math.hypot(body.point[0] - f.g.launch[0], body.point[1] - f.g.launch[1], body.point[2] - f.g.launch[2]);
    const raw = bulletDamage({ impactDamage: dmg0, damageModifier: r.damageModifier ?? 0, effectiveRange: r.effectiveRange / UNITS_PER_METRE, maximumRange: r.maximumRange / UNITS_PER_METRE }, distance);
    if (raw === null || !(raw > 0)) return;
    const { damage, piercing } = quantiseHit(raw, this.thrown(f.kind)?.piercing ?? 0);
    if (applyHit(h.health, body.part, damage, piercing)) {
      this.hostageKilled(h, thrower, {
        weapon: this.weaponName(r.id, r.name), how: thrower ? 'weapon' : 'orphan', cause: deathCause('bullet', body.part),
        clip: deathClip('bullet', body.part, this.extraction!.posture(h), this.opts.random, 'teammate'), ...(thrower ? {} : { killerName: f.name }),
      });
    }
  }

  /**
   * A blast (`../../viewer/src/net/blast` `resolveBlast`; research 85 section 7, 91 section 5): each living SEAL it
   * reaches -- the thrower too; friendly fire off spares the thrower's team at the hit, the backblast its firer and his
   * side whatever the switch (`ffRefuses`, PF-22) -- rings, takes its fragments, and is knocked
   * (its mover here, and the page's prediction by the `blast` event). A SEAL killed by it is thrown too, as the game
   * throws the dead (`FUN_0057e770` L440981, state 8 at L441001; `blastKnock` with `died`): the knock is laid and sent
   * before the `kill`, so the page's own prediction lays it while still alive and then holds the landing down (`Walker.
   * dead`); prone, the corpse plays the BODY list's prone clip instead (L441013-441015, `deathClip('blast', ...)`).
   * M7 (`GetDamage` 0x3c7600 L318770-318826): a claymore's damage is a 32nd outside its cone (`claymoreCone` about its
   * facing); a backblast's is none outside its cone (`backblastReaches`, online). PF-35 (ruling PF.R55, research 235
   * §1): a round with `IgnoreExplosionDI` (C4's) reaches a head behind a surface -- `FUN_005a0e70` D:L459192-459193's
   * veto skipped -- and a destructible behind one (`sceneBlast`: `FUN_003c80e0` D:L319096-319143's material loop
   * skipped); nothing else here reads it. AD-5: the scene's destructibles take the round's `Piercing` (`sceneBlast`).
   */
  private blast(f: Flying, at: readonly number[]): void {
    const t = this.thrown(f.kind);
    if (!t) return;
    const thrower = this.thrower(f);
    const point: V3 = [at[0]!, at[1]!, at[2]!];
    this.blastPlayers(t, point, () => thrower, f.facing, f.name);
    this.blastHostages(t, point, f.facing, thrower, f.name);   // HX-1, LATER 354
    this.blastCharges(t, point, f.facing, () => thrower, f);   // PF-36
    // MAP-06: after the players, the scene's destructibles (`sceneBlast`). AD-5: the backblast's cone and the claymore's
    // are `GetDamage`'s factor after x14 at the target's midpoint -- the backblast's 0 outside its (D:L318784-318830; online,
    // `DAT_0045a0c1` `IsNetwork`, research 107; offline 0 everywhere, D:L318785-318786), the
    // claymore's 1/32 outside its (D:L318769-318782); was: outside either, no reach.
    const r = t.record;
    const died = this.sceneBlast(point, r, t.piercing, (to) => {
      if (f.facing && r.id === ITEM.BACKBLAST && !backblastReaches(point, f.facing, to, r.explosionRadius)) return 0;
      return f.facing && r.id === CLAYMORE.id && !claymoreCone([to[0] - point[0], to[1] - point[1], to[2] - point[2]], f.facing, r.explosionRadius) ? 1 / 32 : 1;
    });
    this.actionDied(died, thrower);                              // PF-14: the charge's owner (ACTION_POINTS_ACTOR_READING)
  }

  /**
   * HX-1 (research 237 s2): after the players, the hostages a blast of `t` at `point` reaches -- `blast()`'s and, since
   * P20, the bomb's (`bombBlast`) -- the same fragments and line to the head, the gate never refusing
   * (HOSTAGE_FF_READING); no ring. LATER 354: the knock too -- `FUN_0057e770` is the body's own, for the host's local
   * controller (`FUN_005a0e70` D:L459307-459311; research 237, corrected 2026-10-23), laid before the death as a
   * SEAL's is (`HostageFollow.knock`); a death counted by `thrower`'s side. `facing` the claymore's and the
   * backblast's cones; `name` a departed thrower's, told with an orphan kill as `killerName` -- none for the bomb's,
   * which has no thrower (`MPBOMB_BLAST_HOSTAGE_OWNER_PLACEHOLDER`): its orphan kill carries no `killerName`.
   */
  private blastHostages(t: { record: ThrowableRecord; piercing: number; fragments: boolean }, point: V3, facing: V3 | undefined, thrower: Player | null, name?: string): void {
    for (const h of this.extraction?.hostages ?? []) {
      if (!this.extraction!.targetable(h) || this.hostageRefuses(thrower, t.record.id, h)) continue;
      const feet: V3 = [h.at[0], h.at[1], h.at[2]], posture = this.extraction!.posture(h);
      let record = t.record;
      if (facing && record.id === ITEM.BACKBLAST && !backblastReaches(point, facing, feet, record.explosionRadius)) continue;
      if (facing && record.id === CLAYMORE.id && !claymoreCone([feet[0] - point[0], feet[1] - point[1], feet[2] - point[2]], facing, record.explosionRadius)) {
        record = { ...record, explosionDamage: record.explosionDamage / 32 };
      }
      const head: V3 = [feet[0], feet[1] + HEAD_OVER[posture], feet[2]];
      const seen = record.ignoreExplosionDI === true || blastExposed(this.map.grid, sightFrom(point, head), head, this.map.defaultMaterial ?? '');   // LATER 416; R4B-10
      const out = resolveBlast(h.health, { feet, posture, yaw: h.yaw }, point, { record, piercing: t.piercing, fragments: t.fragments, flash: record.id === FLASHBANG_ID }, this.opts.random, seen);
      if (out?.knock) h.motion?.knock(out.knock);
      if (!out?.died) continue;
      this.hostageKilled(h, thrower, {
        weapon: this.weaponName(t.record.id, t.record.name), how: thrower ? 'weapon' : 'orphan', cause: deathCause('blast', out.part),
        clip: deathClip('blast', out.part, posture, this.opts.random, 'teammate'), ...(thrower || name === undefined ? {} : { killerName: name }),
      });
    }
  }

  /**
   * PF-36 (PF.R56; research 235 s4): after the players, the resting `Volitile` charges a blast of `t` at `point`
   * reaches -- `blast()`'s (`self` its own round, never its own target) and, since P20, the bomb's (`bombBlast`): the
   * explosion's target walk (`FUN_003c7dd0` 0x3c7e74-0x3c7e8c) calls each one's interface once `FUN_003c80e0` finds
   * it visible: the players' line from the same lift (`sightFrom`), skipped for IgnoreExplosionDI as theirs is (PF-35).
   * The damage at it is GetDamage's explosion base, `Explosion_Damage + Damage_Modifier` by the radius falloff
   * (`fragmentDamage` over its x14; D:L318708-318736), at its 1.0 minimum (VOLATILE_MIN_DAMAGE_READING): the claymore's
   * 32nd behind it follows that minimum (D:L318770-318781) and leaves it nonzero, so it does not bind here; the
   * backblast's cone (about `facing`) zeroes it (D:L318784-318828, `backblastReaches`). Only queued: the chain's blast
   * runs on a later frame, never inside this one. `ownerOf` names `detonate`'s `by` for each charge: `blast()`'s
   * thrower; for the bomb, the charge's own owner (`bombBlast`).
   */
  private blastCharges(t: { record: ThrowableRecord; piercing: number; fragments: boolean }, point: V3, facing: V3 | undefined, ownerOf: (f2: Flying) => Player | null, self?: Flying): void {
    for (const f2 of this.flying) {
      if (f2 === self || !f2.g.record.volatile || f2.g.state !== 'rest') continue;
      const to = f2.g.pos, distance = Math.hypot(to[0] - point[0], to[1] - point[1], to[2] - point[2]);
      if (!(distance < t.record.explosionRadius)) continue;
      if (facing && t.record.id === ITEM.BACKBLAST && !backblastReaches(point, facing, to, t.record.explosionRadius)) continue;
      if (t.record.ignoreExplosionDI !== true && !blastSeen(this.map.grid, sightFrom(point, to), to)) continue;   // LATER 416
      const base = fragmentDamage(t.record.explosionDamage + (t.record.damageModifier ?? 0), t.record.explosionRadius, distance) / DAMAGE_SCALE;
      this.chargeHit(f2, base, ownerOf(f2)?.id ?? null);
    }
  }

  /**
   * PF-36 (ruling PF.R56; research 235 s3-s4): damage reaching a resting `Volitile` charge -- a round's (`fire`) or a
   * blast's (`blast`) -- through `CProjectileNodeEx`'s hit callback `FUN_003c69c0`: `base` is GetDamage's base at the
   * charge before its x14, nonzero at the 1.0 minimum (`volatileQueues`, L318206-318207); a charge already going off is
   * refused (states 5/6, L318208-318214: VOLATILE_STATE_GATE_READING); then state 3 / stage 2 (L318215-318216): queued
   * for the next frame (`queued`, VOLATILE_CHAIN_TIMING_READING) and told to every page with its pid and `by` (the
   * shooter, or the blast's owner). The online local-owner and sender gates (L318214, L318217-318221) are the room's own
   * authority here (`VOLATILE_SENDER_GATE_READING`, research 235 s3). Its blast is its own (`blast` with its `thrower`:
   * VOLATILE_CREDIT_READING), as a Detonator's.
   */
  private chargeHit(f: Flying, base: number, by: number | null): void {
    if (!f.g.record.volatile || !volatileQueues(base) || f.g.state !== 'rest' || f.g.trigger || f.queued) return;
    f.queued = true;
    this.broadcast({ type: 'detonate', pid: f.pid, by });
  }

  /**
   * MAP-06 (SCENE_BLAST_REACH_PLACEHOLDER, ruling PF.R11), a blast of `r` at `point` on the scene's destructibles --
   * `blast()`'s and the bomb's (`bombBlast`): each whose bounds come inside the radius, through `FUN_003c80e0`'s reach
   * gate on the line to its midpoint (`blastLine`, from the players' lift, `sightFrom`: the radius squared times each
   * other surface's material PENETRATION, `surfaceMaterial` with the map's default, against the line's length squared).
   * AD-5: what each takes is `blastAt`'s reading of `FUN_003c7490`/`FUN_003c7600` -- the rating plus modifier against
   * the shield, the falloff to the midpoint, the shield again, x14, `cone`'s factor at the midpoint (the claymore's 1/32,
   * the backblast's 0), the armour with the round's `piercing` (`ZAMMO` `+0x14`), the health floored at 0. Was: the full
   * rating plus modifier, and a line meeting nothing but the target (no material passed). The ids that died; their
   * deaths ran on the room's silent world. PF-35: a round with `IgnoreExplosionDI` skips the gate (`FUN_003c80e0`
   * D:L319096: its material loop skipped, eligible; IGNORE_EXPLOSION_DI_READING).
   */
  private sceneBlast(point: V3, r: ThrowableRecord, piercing: number, cone: (to: V3) => number = () => 1): number[] {
    const rating = r.explosionDamage + (r.damageModifier ?? 0);
    const penetration = (p: WorldPoly): number => surfaceMaterial(p.material, this.map.defaultMaterial ?? '').penetration;
    return this.world.health.blastAt(point, rating, r.explosionRadius, (to, target) =>
      r.ignoreExplosionDI === true || blastLine(this.map.grid, sightFrom(point, to), to, target, r.explosionRadius, penetration), { piercing, cone });
  }

  /**
   * BOMB-DAMAGE (research 332 s2): `blast()`'s player path, shared with the bomb's (`bombBlast`) -- each living SEAL the
   * blast of `t` at `point` reaches: the gate, the cones about `facing`, the line to the head, the fragments, the ring,
   * the knock, the kill (the doc above `blast`). `ownerOf` the blast's owner at the victim (the round's `+0xac`, which
   * `FUN_005a0e70` D:L459286-459300 credits): a projectile's live thrower, the same at every victim; the bomb's, the
   * victim himself (`MPBOMB_BLAST_OWNER_READING`). `name` the departed thrower's, told with an orphan kill.
   */
  private blastPlayers(t: { record: ThrowableRecord; piercing: number; fragments: boolean }, point: V3, ownerOf: (q: Player) => Player | null, facing: V3 | undefined, name: string): void {
    for (const q of [...this.players.values()]) {
      if (!q.alive) continue;
      const thrower = ownerOf(q);
      const s = q.sim.walker.state, posture = q.sim.walker.posture;
      const feet: V3 = [s.x, s.y, s.z];
      // INT.R5 (research 127): the combat report's account of the blast on this SEAL -- nothing here changes for it.
      const distance = Math.hypot(feet[0] - point[0], feet[1] - point[1], feet[2] - point[2]);
      const report = { request: 'blast', weapon: t.record.id, distance, point };
      // PF-22: the gate (`ffRefuses`): the thrower's side at the hit; a departed thrower's blast lands on anyone; the
      // backblast never on its firer or his side. Friendly fire is told the thrower inside the radius, as before.
      const refused = this.refuses(thrower, q, t.record.id);
      if (refused !== null) {
        if (refused === 'friendly fire' && distance < t.record.explosionRadius) this.combat(thrower, q, { ...report, status: 'rejected', reason: FRIENDLY_FIRE });
        continue;
      }
      let record = t.record;
      if (facing && record.id === ITEM.BACKBLAST && !backblastReaches(point, facing, feet, record.explosionRadius)) continue;
      // CLAYMORE_CONE_POINT_READING (research 85 §9.7.2): the cone is tested at the feet here, at the feet + 10 by the page's
      // own blast (`../../viewer/src/grenade.ts` `damageAt`); the point `GetDamage`'s callers pass is not settled. Unchanged.
      if (facing && record.id === CLAYMORE.id && !claymoreCone([feet[0] - point[0], feet[1] - point[1], feet[2] - point[2]], facing, record.explosionRadius)) {
        record = { ...record, explosionDamage: record.explosionDamage / 32 };
      }
      const kind = { record, piercing: t.piercing, fragments: t.fragments, flash: record.id === FLASHBANG_ID };
      const head: V3 = [s.x, s.y + HEAD_OVER[posture], s.z];
      // The line to the head (FUN_005ac070); PF-35: a blocking hit vetoes the queued ray only without the round's
      // IgnoreExplosionDI (FUN_005a0e70 D:L459192-459193, IGNORE_EXPLOSION_DI_READING) -- the radius and the rest hold.
      const seen = record.ignoreExplosionDI === true || blastExposed(this.map.grid, sightFrom(point, head), head, this.map.defaultMaterial ?? '');   // LATER 416; R4B-10
      const healthBefore = [...q.health.hp], armourBefore = [...q.health.armour];
      const was = overall(q.health);
      const wounded = this.woundable(q);   // CPS cell-alive: the deathless seat's blast spends a copy
      let out = resolveBlast(wounded, { feet, posture, yaw: s.yaw }, point, kind, this.opts.random, seen);
      if (!out) {
        // Chris's `blast-occluded` and `no-blast-damage`, as misses: the blast reached the radius and harmed no one.
        // The thrower's own body only: another's would tell the thrower of a SEAL behind cover in the radius, which
        // the original tells no one (a presence leak, research 127 sections 2 and 6).
        if (q === thrower && distance < record.explosionRadius) this.combat(thrower, q, { ...report, status: 'miss', reason: seen ? 'no damage' : 'occluded' });
        continue;
      }
      const scale = this.ruleHitEvent(thrower, q, t.record, out.hits.reduce((n, h) => n + h.damage, 0));   // FCW-31: the blast's fragments
      if (scale !== 1) out = this.ruleBlastScaled(wounded, out, scale, healthBefore, armourBefore, t.piercing);
      if (out.died && this.deathless(q)) out = { ...out, died: false };   // CPS cell-alive
      this.combat(thrower, q, {
        ...report, status: 'applied', part: out.hits.length === 1 ? out.part : null, hitLocations: out.hits.map((h) => ({ part: h.part, rawDamage: h.damage })),
        rawDamage: out.hits.reduce((n, h) => n + h.damage, 0), healthBefore, armourBefore, killed: out.died,
      });
      // PF-19: the knock through the room's one path (`layKnock`); a lethal blast on a SEAL in a move lays none --
      // `kill` releases it below (KNOCK_LETHAL_IN_MOVE_READING).
      const lethalInMove = out.died && KNOCK_LETHAL_IN_MOVE_READING === 'kill-releases' && (q.sim.moves?.busy() ?? false);
      const k = out.knock && !lethalInMove ? this.layKnock(q, out.knock) : null;
      // P2 (TB-1; research 85 s9.5): a flashbang's white-out only here, past the gate and the line (`FUN_005a5250`'s
      // slot 0 from `FUN_005a0e70` D:L459228 alone; FLASH_FRIENDLY_FIRE_READING): its level told the victim (`flash`).
      const flash = kind.flash ? blastFlashLevel({ feet, yaw: s.yaw }, point) : null;
      this.send(q.id, {
        type: 'blast', ring: out.ring ? { seconds: BLAST_RING_SECONDS, volume: BLAST_RING_VOLUME } : null,
        knock: k ? { velocity: [k.velocity[0], k.velocity[1], k.velocity[2]], fall: k.fall } : null, after: q.sim.seq, flash,
      });
      if (out.fragments > 0) this.send(q.id, { type: 'hurt', health: [...q.health.hp], from: point, part: out.part });
      if (!out.died) this.hurtVoice(q, was);   // a blast's health drop: the voice, no flinch (cause 4, L461402)
      if (out.died) {
        const how: KillHow = q === thrower ? 'suicide' : thrower ? 'weapon' : 'orphan';
        this.kill(q, thrower, this.weaponName(t.record.id, t.record.name), how, deathCause('blast', out.part), deathClip('blast', out.part, posture, this.opts.random), how === 'orphan' ? name : undefined);
      }
    }
  }

  /**
   * XR-08 (research 213 s5; 173 s3, 171 s4; rulings PF.R11, PF.R14): the planted bomb's detonation (state 5,
   * `BombAuthority`'s `detonated`) at its point, as the blast of MPBOMB's ZWEAPON record (154 / MPBOMB Ammo 19:
   * Explosion_Damage 50, Explosion_Radius 30 raw, 300 u) -- `base_explosion1`'s FIRE_WEAPON at the bomb's node
   * (`FUN_002c1c30` D:L163926). BOMB-DAMAGE (research 332 s1): that round goes off on every machine, online too
   * (`FUN_003c9fb0` D:L320128, `FUN_003c99a0` D:L319884-319901), and its explosion meets the bodies as a grenade's
   * (`FUN_003c7dd0` D:L318992 -> `FUN_005ac070` -> `FUN_005a0e70`): first the players (`blastPlayers`, each the blast's
   * owner at his own hit: `MPBOMB_BLAST_OWNER_READING` -- friendly fire spares no one, a death is the victim's own);
   * was PF.R32's no player hurt (2026-10-05 to 2026-10-16). Then the scene (`sceneBlast`; AD-5, research 209 s13): the
   * base around the planted tent passes `FUN_003c80e0`'s material gate on the line to its basedi's midpoint (18.89 u from
   * the bomb on MP72) and takes 50 x 14 there against its shield 21 and health 2, the health floored at 0, and its
   * `destroy_*_base` runs; a base falls out to 237 u (0.79 of the 300 u, where the falloff's rating meets the shield);
   * the other base is ~1465 u off. Was: PF.R11's reach with the full 50, the damage interface untraced (173 s3).
   * Scoring is the bomb's transition's (PF-14b),
   * not `actionDied`'s. P20 (TB-7; research 332 s5): the same walk (`FUN_003c7dd0` D:L318992; raw 0x3c7e74-0x3c7e8c)
   * reaches the hostages and the resting `Volitile` charges, as `blast()`'s does. A hostage takes the fragments
   * (`blastHostages`) with no owner (`MPBOMB_BLAST_HOSTAGE_OWNER_PLACEHOLDER`). A charge (`blastCharges`) is queued and
   * goes off on the next game frame (`VOLATILE_CHAIN_TIMING_READING`), its own blast its owner's
   * (`VOLATILE_CREDIT_READING`). Its hit callback runs on the console that owns the charge (`FUN_003c69c0` L318214),
   * where the bomb's round is that console's own SEAL's (`MPBOMB_BLAST_OWNER_READING`): `detonate`'s `by` is the
   * charge's owner. No cone (`facing` none), as for the players. Without the kit table (no MPBOMB record) it reaches
   * nothing.
   */
  /**
   * Research 386 §3.2 (LATER 63): a scene program's `FIRE_WEAPON` (`WorldHooks.fire`) -- `FUN_0025ccb0` (D:L107153-107326;
   * research 332 §1.1) starts a round of the named weapon at its node's world position (D:L107229-107244; the command's
   * offset through the node's matrix, `MapMeta.fireNodes`; no node: the offset itself), its fuse the command's first float
   * (+0x8c, D:L107312-107316; -1 the record's own), counted online too (`FUN_003c9fb0` D:L320127-320129, research 332
   * §1.2): queued, it goes off at the first tick the fuse has run (`fireSceneRounds`) -- out of the death that fired it, as
   * the original's round goes off on a later frame. A weapon the kit table does not hold, or a node no placement carries,
   * fires nothing. The weapon is matched case aside (the command names `c4`, the arsenal `C4`).
   */
  private sceneRound(weapon: string, fuse: number, offset: readonly number[] | undefined, path: string | null): void {
    const kind = this.sceneWeapon(weapon);
    if (kind === null) return;
    const world = path === null ? null : this.world.meta.fireNodes?.get(path);
    if (path !== null && !world) return;
    const off = offset ?? [0, 0, 0];
    const point: V3 = world ? apply4(world as number[], off[0]!, off[1]!, off[2]!) : [off[0]!, off[1]!, off[2]!];
    const seconds = fuse === -1 ? this.thrown(kind)!.record.fuse : fuse;
    this.sceneRounds.push({ tick: this.tick + Math.max(1, Math.ceil(seconds * TICK_HZ)), kind, point });
  }

  /** The arsenal's name for a `FIRE_WEAPON`'s weapon (`sceneRound`), case aside; null when the kit table has none. */
  private sceneWeapon(weapon: string): string | null {
    if (this.thrown(weapon)) return weapon;
    const w = weapon.toLowerCase();
    for (const name of this.kits?.table.arsenal.byName.keys() ?? []) if (name.toLowerCase() === w && this.thrown(name)) return name;
    return null;
  }

  /**
   * Research 386 §3.2 (LATER 63): each scene round whose fuse has run goes off -- its explosion meets the bodies, the
   * hostages, the resting charges and the scene as the bomb's does (`bombBlast`; research 332 §1.3), each player's hurt his
   * own (`SCENE_ROUND_OWNER_READING`) -- and every page is told it (`sceneRound`) for its effects and sound. A destructible
   * it kills scores its action to no one (no owner).
   */
  private fireSceneRounds(): void {
    for (let i = 0; i < this.sceneRounds.length;) {
      const r = this.sceneRounds[i]!;
      if (r.tick > this.tick) { i++; continue; }
      this.sceneRounds.splice(i, 1);
      const t = this.thrown(r.kind);
      if (!t) continue;
      this.broadcast({ type: 'sceneRound', kind: r.kind, at: [...r.point] });
      this.blastPlayers(t, r.point, (q) => q, undefined, '');
      this.blastHostages(t, r.point, undefined, null);
      this.blastCharges(t, r.point, undefined, (f2) => this.thrower(f2));
      this.actionDied(this.sceneBlast(r.point, t.record, t.piercing), null);
    }
  }

  private bombBlast(at: readonly number[]): void {
    const t = this.thrown(MPBOMB_NAME);
    if (!t) return;
    const point: V3 = [at[0]!, at[1]!, at[2]!];
    this.blastPlayers(t, point, (q) => q, undefined, '');
    this.blastHostages(t, point, undefined, null);                     // MPBOMB_BLAST_HOSTAGE_OWNER_PLACEHOLDER: 'none'
    this.blastCharges(t, point, undefined, (f2) => this.thrower(f2));  // `by` the charge's owner (L318214)
    this.sceneBlast(point, t.record, t.piercing);
  }

  /**
   * A reload, at its command. Refused while this weapon's reload still plays (`FUN_005c2a90` 477398: `FUN_005a7ab0`, true
   * while the reload's clip plays, 462527-462540). MJ-2: no fullness gate -- the game walks from `m_currentmag + 1` for
   * the first slot with rounds (477462-477483), so a full magazine reloads whenever another slot holds rounds. The lock
   * is the clip's length (MJ-1, `reloadLockSeconds`: `FUN_005a82e0`'s clip for the posture, moving or still, and the
   * item; `RELOAD_SECONDS_PLACEHOLDER` without the clips), per weapon, on the command clock, less a tick as the rate's.
   * Refused too mid-swap (M-3 of review 2: `FUN_005a7ab0` answers for the swap's clip) and in the air (m-7:
   * `FUN_005c2a90` D:L477395 (the air test; its refusal D:L477401; *was* cited 477392-477394) returns on the body's `+0x105e` bit 5; research 84 "The request"). NET-REFILL (research
   * 312): with no other magazine holding rounds, a pistol (and in a respawn room any primary but the MGL and the M79)
   * has the magazine in the weapon refilled and reloads as above (`../../viewer/src/net/netRefill`); others are refused.
   */
  /**
   * LATER 72 (research 313 s8.3): a reload's press -- its delay timer's window locks the climb's offer for the commands
   * after the press's own (`seq`) and before `seq` + the record's `ReloadDelay` in commands, taken at its arrival and dated
   * by its numbers alone, so the room refuses the same commands the page does whether it has run the press's command yet
   * or not. Mounted: none (the turret's reload is its own). A press whose window has passed locks nothing; nothing else of
   * the reload moves here (the clip's start, its checks and the magazine stay `reload`'s, at the command the page names).
   */
  private reloadPress(p: Player, seq: number): void {
    if (!p.alive || p.mounted !== null) return;
    const w = p.cone.frame(seq)?.weapon ?? p.sim.weapon;
    const ticks = Math.round(reloadDelayOf(p.records[w]) * TICK_HZ);
    p.pressLock = ticks > 0 && seq + ticks > p.sim.seq ? { weapon: w, ring: p.mags[w], from: seq, until: seq + ticks } : null;
  }

  private reload(p: Player, seq: number): void {
    if (!p.alive) return;
    const frame = p.cone.frame(seq);
    const w = frame?.weapon ?? p.sim.weapon;
    const count = frame?.count ?? p.ran;
    // TURRET-AMMO (research 215 s8): mounted, the slot in the hand is the turret's (`FUN_005463c0` D:L412218), so R is
    // its reload (`reloadTurret`) and the rifle's magazines are left alone. Was: the rifle reloaded (MAP-10b's note).
    // LATER 107 (MOUNT_ROUND_AT_COMMAND_ADAPTATION): R named on a command run before the mount (its frame holds no turret)
    // is the hand's reload, below. LATER 174 (DISMOUNT_ROUND_AT_COMMAND_ADAPTATION): R named on a command run on a turret
    // the body no longer holds is that turret's and arms nothing -- the release after it dropped the slot's timer
    // (TURRET_RELEASE_RELOAD_READING) -- the rifle left alone.
    if (frame && (frame.turret ?? null) !== null && frame.turret !== p.mounted) return;
    const mountedOn = p.mounted !== null && (!frame || (frame.turret ?? null) === p.mounted) ? this.turrets[p.mounted] : undefined;
    if (mountedOn) return this.reloadTurret(mountedOn, count);
    // M4: refused while a reload's timer or clip, or an after-shot clip, holds the weapon (`FUN_005a7ab0`, 477398).
    // PAR-88 (research 251 §12.3): and while a bolt's or pump's lock is still in its timer -- `FUN_005a7ab0` answers on
    // `kit+0x820` (D:L462522-462523), so R never rewrites it (`FUN_00594cf0` D:L453460-453463); was: replaced by the
    // reload's (`replacing`). The page's `Fire.reload` refuses it alike, so no page sends one.
    if (count < p.reloadUntil[w]) return;
    if (frame?.swapping ?? p.sim.walker.swapProgress() !== null) return;
    // LATER 194: refused in the air, as the original (`FUN_005c2a90` D:L477395 (the air test; its refusal D:L477401; *was* cited D:L477392-477394)) -- and the page told (`stale`,
    // its journal's `restoreReload`), tallied, as a refused round or throw is: the network's bookkeeping, not the game's
    // (was a bare return: the page kept the magazine its prediction took, the room its own).
    if (frame?.airborne ?? p.sim.walker.airborne) {
      this.send(p.id, { type: 'stale', request: 'reload', seq });
      return this.dropped('reload', 'airborne', p);
    }
    // NU-1b B5 (research 313 s5; `CLIMB_RELOAD_REFUSED_READING`; PTW.R3 with `../../viewer/src/fire` `FireSource.climbHolds`):
    // a climb's clip or the hang on the body at the command (its frame's motion) -- `FUN_005b4340(actor, 3)` D:L477404,
    // under a `UseVelY` top D:L469517, in state 4 D:L469460-469461 -- refused before any magazine moves.
    const move = frame ? frame.motion?.clip : p.sim.moves?.pose()?.clip;
    if (CLIMB_RELOAD_REFUSED_READING === 'refused' && climbHoldsBody(move)) return this.dropped('reload', 'climb', p);
    // PF-18 (PF.R37): inside the flinch's clip (`flinchState`): `FUN_005b4340(actor, 3)` D:L469494-469504, asked by
    // `FUN_005c2a90` D:L477394-477407 -- refused before any magazine moves.
    if (p.flinchGatesReload && seq >= p.flinchFrom && seq < p.flinchUntil) return this.dropped('reload', 'flinch', p);   // not a door clip's (#485 F1)
    if (seq >= p.flinchKeptFrom && seq < p.flinchKeptUntil) return this.dropped('reload', 'flinch', p);   // N1: the flinch a door push cut, before the push
    // PF-19 (KNOCK_COVER_RELOAD_READING): inside the knock's `Prone cover` at the command (its frame's motion, PF.R36),
    // refused before any magazine moves; the round is refused by the clip's `NoFire ()` (`fire`'s 'nofire').
    const covered = frame ? frame.motion?.clip === SEAL_ANIMS.proneCover : p.sim.walker.action?.name === 'proneCover';
    if (covered && KNOCK_COVER_RELOAD_READING === 'refused') return this.dropped('reload', 'proneCover', p);
    // WK-6 (the online parity sweep; research 312 s5): no round mode here -- the slot's ring and its record's delay. Holds
    // while no launched round has a second magazine and no carrier a `ReloadDelay` (`launcherRoundReload.test.ts`).
    const record = p.records[w];
    // NET-REFILL (research 312 §2, §5; NET_REFILL_READING): every room is a network game, so the walk finding no other
    // magazine with rounds (`FUN_005c2a90` D:L477490, D:L477517) refills the one in the weapon to `Ammo_Capacity` for a
    // record `netRefills` passes (D:L477491-477500, D:L477518-477527) and goes on as the ordinary reload: the clip and
    // the `ReloadSound` are the ordinary path's two calls (D:L477501-477509, D:L477528-477537). Else refused, as before.
    if (!p.mags[w].reload()) {
      if (!netRefills(record.id, { respawn: this.opts.rules === 'respawn' })) return;
      p.mags[w].refill();
    }
    this.stopVictory(p.id); // Accepted still reload clears the prior action (ISO FUN_005a86b4).
    const posture = frame?.posture ?? p.sim.walker.posture;
    const v = frame?.velocity ?? [p.sim.walker.state.vx, p.sim.walker.state.vy, p.sim.walker.state.vz];
    // M4 (research 94 §C1.1-§C1.2): the record's `ReloadDelay` before it lands (`FUN_005c32b0`), then its class's clip
    // (`reloadFamily`: the shotgun reload for the 870 and the bolts), over its `ReloadTime` still (`FUN_005a82e0`).
    const family = reloadFamily({ item: w ? 'pistol' : 'rifle', id: record.id });
    const seconds = reloadLockSeconds(this.clips?.clips ?? null, this.clips?.table ?? null, posture, reloadMoving(v[0], v[1], v[2]), family, record.reloadTime ?? 0);
    // PARITY-1 wave 4 (3c; research 251 s6): that delay is the kit's one timer (`FUN_005c32b0` sets it, `FUN_005c0fd0`
    // D:L476549-476561 runs it out into `FUN_005c2a90`), which the page runs (`Fire.reload` -> `beginReload`) and spends
    // before it sends this reload at its `reloadStart` (`NetPage.fireEvent`): the reload begins at the command it names,
    // so the room's lock has no timer part. Adding `reloadDelayOf(record)` here again started the Spas 12's and the
    // JACKHAMMER's lock and still clip 30 commands after the page's, the 870's 60 (`roomReloadDelay.test.ts`).
    setLock(p, w, count, 0, seconds, 'reload', this.eventClock(p));
    p.pressLock = null;                                          // LATER 72: the clip's lock takes the climb's over
    this.lockLife(p, w, posture, reloadMoving(v[0], v[1], v[2]), family, seconds);   // PF-18: the lock is the clip's life
    // A1 (LATER 218): a rifle reload named before a worded take and decided after it -- its clip cut at the take.
    const holding = p.mounted !== null ? this.turrets[p.mounted] : undefined;
    const late = holding?.word === true && count <= holding.mountCount;
    if (late && holding) this.mountKitLate(p, holding);
    // The others hear it (2026-10-02, ported from Chris's browser-beta-v5, d578f347): `FUN_005c2a90` plays the record's
    // `ReloadSound` at the actor (`+0x1c`) as it takes the magazine (477484-477537), in the kit's frame, which the actor
    // update runs with no test of the controller's locality (`FUN_005506a0` L417907; REMOTE_RELOAD_SOUND_READING, `viewer/src/netPage.ts`). The item by id, at
    // the body; not to the reloader's page, whose own reload played it.
    // REMOTE-RELOAD (REMOTE_RELOAD_MOTION_READING, `viewer/src/netPage.ts`; additive under protocol 14): with the take the
    // lock was set from -- the posture, moving, family and seconds above -- so the others start the body's reload clip, as
    // `FUN_005c2a90` starts the motion (`FUN_005a82e0`, D:L477479) in the step that plays the sound (D:L477484). The
    // review's F3: a reload cut at a worded take (`late`, above) sends no take -- its clip is gone at the take's count.
    const st = p.sim.walker.state;
    this.broadcast({
      type: 'reloadSound', id: p.id, weapon: record.id, at: [st.x, st.y, st.z],
      ...(late ? {} : { posture, moving: reloadMoving(v[0], v[1], v[2]), family, seconds }),
    }, p.id);
  }

  private past(q: Player, tick: number): Past | null {
    return pastOf(q.history, tick);
  }

  // ---- deaths and score (research 91 sections 3, 8) ----

  /**
   * THROW-INTERRUPT (research 326 §2.4): the death's drop (`FUN_005b8920` D:L471751-471870): a hand throwable asked and not
   * yet out (`throwStart`, within `THROW_START_WINDOW_S`, a throw's clip laid on a command at or after its own -- the
   * review's F1: the clip need not be on at the death, a knock having popped it) is spent from the room's own count and
   * launched at once at power
   * 0 (`FUN_005976a0(0)`, `FUN_00597630(.., 0)`: D:L471842, D:L471845) at the death frame's aim, from `GetThrowAnim`'s
   * table point for its stance (`DEATH_DROP_HAND_READING`: the room poses no hand), and told to every page, its
   * thrower's included.
   */
  private deathDrop(p: Player): void {
    const s = p.throwStart;
    p.throwStart = null;
    if (!s || p.ran - s.count > Math.round(THROW_START_WINDOW_S * TICK_HZ) + FIRE_ARRIVAL_JITTER_TICKS) return;
    // The review's F1: a throw's clip laid at or after the request (a knock after it keeps it) -- the re-review's F3: within
    // the command after it and the arrival jitter, one throw as the original's one frame; its F2: the request decided
    // before its next command ran, that command's queued hold code counts.
    const window = s.seq + 1 + FIRE_ARRIVAL_JITTER_TICKS;
    const queued = p.sim.seq <= s.seq && p.queue.some((q) => {
      const clip = q.seq > s.seq && q.seq <= window ? holdOf(q.buttons) : null;
      return clip !== null && holdFamily(clip) === 'throw';
    });
    const laid = (p.throwHoldSeq >= s.seq && p.throwHoldSeq <= window) || queued;
    if (!laid) return;
    const t = this.throwable(s.kind), frame = p.cone.frame(p.sim.seq);
    const slot = p.equipmentSlots.eligible(s.kind, s.slot);
    if (!t || !frame || slot === null) return;
    const aimSin = Math.sin((frame.pitch * Math.PI) / 180), stance = frame.posture;
    const anim = throwAnim(0, aimSin, stance);
    const launch = throwVelocity(0, aimSin, anim.offset, maxThrowDistance(stance));
    const from = actorToWorldPoint(frame.feet, frame.yaw, anim.offset), velocity = actorToWorldDir(frame.yaw, launch.velocity);
    p.equipmentSlots.spend(s.kind, slot);
    const f = this.born(this.flyer(p, s.kind, launchGrenade([...from], [...velocity], t.record)), 0);   // HOTFIX grenade fuse: from now
    this.flying.push(f);
    this.broadcast({ type: 'grenade', id: p.id, kind: s.kind, from: [...from], velocity: [...velocity], pid: f.pid });
  }

  /**
   * A death. The body leaves any move and any peek first (M-4 of review 2): the game's death state (8) replaces the
   * ladder (5), the hang (4) and the peek (3) -- entering it `FUN_005af590` (L466696-466699) calls `FUN_005a5da0`, the
   * hang/ladder release, as the blast's death does before state 8 (`FUN_0057e770` L440992-440993); research 86 s8 -- and
   * the lean and action buttons the last command held are let go, so the corpse's ticks (`corpse`) never take them up
   * again. `how` 'orphan' (m-13): a departed thrower's grenade -- scored to no one, `killerName` naming it. `cause` the
   * game's death cause (PF-10, `deathCause`: the actor's `+0xfb0`), told with the kill for the victim's death voice
   * (`FUN_005979a0`), which every page plays at the body.
   */
  private kill(victim: Player, killer: Player | null, weapon: string | null, how: KillHow, cause: number, clip: string | null = null, killerName?: string, part?: number): void {
    // NCW-2 B-trade (Codex's P1 on PR #698): the rounds in the weapons as the death found them, before anything below (a
    // classic death's drop, `worldDrops.death`) empties the rings -- what a traded round may still spend (`fireAt`).
    victim.tradeRounds = [victim.mags[0].rounds(), victim.mags[1].rounds()];
    this.deathDrop(victim);                                      // THROW-INTERRUPT: `FUN_005b8920` before the alive bit (D:L413023-413024)
    if (victim.mounted !== null) this.releaseTurret(this.turrets[victim.mounted]!);   // MAP-10b: freed before the kill is told
    else if (victim.reserved !== null) this.releaseTurret(this.turrets[victim.reserved.turret]!);   // A1: the take's refusal, at once
    victim.release = null;                                       // LATER 109: the death's clip, not the reversed one
    victim.alive = false;
    victim.flinchFrom = -1; victim.flinchUntil = -1; victim.flinchAir = -1; victim.flinchGatesReload = true; victim.flinchCutFrom = -1; victim.flinchKeptFrom = -1; victim.flinchKeptUntil = -1; victim.flinchUnder = null;   // PF-18: a death ends the flinch (and a door clip, and the span it cut) (FUN_005a2690 L459978: the death clip instead)
    victim.diedAt = this.tick;
    // NCW-2 B-trade: the last command run alive -- inside the victim's own run of a command (F3: a fall's death), the one
    // before it, which completed alive.
    victim.diedSeq = !victim.synced ? -1 : this.ownRun?.p === victim ? this.ownRun.before : victim.sim.seq;
    victim.deathClip = clip; victim.deathCause = cause;          // PF-28: a joiner's corpse (`joinWire`)
    const moves = victim.sim.moves;
    if (moves) {
      moves.lean(0);
      moves.holdAction?.(false);
      // Released from a ladder or a ledge the body falls from where it was (and lands dead); off a move it keeps its
      // own state -- a blast's corpse is already thrown (`applyKnock`). The release is the knock's too (PF-19).
      if (!releaseMove(victim.sim.walker, moves)) moves.reset();
    }
    victim.sim.walker.dead = true;                             // the body stays down: no get-up (`Walker.dead`)
    // XR-05: the carrier's death drops the bomb at the body (`FUN_00547af0` D:L413112) and cancels its placement.
    this.bomb?.dropped(victim.id, victim.team, this.bombActor(victim).feet(), 'death');
    this.extraction?.release(victim.id);                         // HX-4a: the leader's hostages released, HOLD at once (FUN_00547af0)
    if (this.opts.rules === 'classic' && this.inRound()) this.worldDrops.death(victim);   // PF-34: DROP_RESPAWN_RULE_READING
    victim.deaths++; victim.roundDeaths++;                        // +0x556 and the round block's +0x59e
    let line: KillHow = how;
    if (how === 'orphan') {
      // no one's: the victim is not charged a suicide, and nobody left in the room takes the kill
    } else if (!killer || killer === victim) {
      victim.score -= 2; victim.roundScore -= 2;                  // suicide or fall: -2
      victim.suicides++;                                          // PF-26: +0x14 (FUN_00545c90 L411872; a fall L464957-464959)
    } else if (killer.team === victim.team) {
      killer.score -= 2; killer.roundScore -= 2; line = 'teamkill';
      killer.teamKills++;                                         // PF-26: +0x16 / +0x5a2 (FUN_00545c10 L411850)
    } else {
      killer.kills++; killer.roundKills++; killer.score += 2; killer.roundScore += 2;   // FUN_00545290 on +0x58c: +0xc, +0x3c
    }
    // PF-26, HEADSHOT_COUNT_READING (research 216): a kill whose fatal part is the head (part 0, cause 3, research 91 s1
    // L464739-464743) counts its killer a headshot (+0x544); the writer of the round block's +0x58c was not traced.
    if (killer && killer !== victim && part === PART.HEAD) killer.headshots++;
    // The death voice through the gate (`FUN_0053b710`): withheld within `VOICE_GATE_S` of the body's last voice.
    const voiced = this.tick >= victim.voiceGateUntil;
    this.broadcast({ type: 'kill', killer: killer?.id ?? null, victim: victim.id, weapon, how: line, clip, ...(killerName !== undefined ? { killerName } : {}), cause, voiced });
    this.broadcast(this.scoreEvent());                         // the rows change: the scoreboard follows (research 91 §11)
    this.voiceDeath(victim.id);                                  // SVC-20c: the flag cleared; 0x22's ask without respawn or for a ghost
    if (this.ruleHost) {
      // FCW-31: the death, the kill it was (another's), and -- classic, where a death is the round's end for its body -- the
      // victim out of the round.
      const by = killer && killer !== victim && how !== 'orphan' ? { attacker: killer.id } : {};
      const named = weapon !== null ? { fields: { weapon } } : {};
      this.ruleEvent({ name: 'player.death', victim: victim.id, ...by, ...named });
      if ('attacker' in by) this.ruleEvent({ name: 'player.kill', attacker: by.attacker, victim: victim.id, ...named });
      if (this.opts.rules === 'classic' || this.ruleOut.has(victim.id)) this.ruleEvent({ name: 'player.eliminated', player: victim.id });
    }
  }

  // ---- the clock (W3.R11; classic: the maps' `objectives` script, research 91 section 18) ----

  private clock(): void {
    this.penaltyMinute();                                        // HX-1: before the clock is read (`FUN_002a9ee0`'s order)
    const st = this.state;
    const classic = this.opts.rules === 'classic';
    if (st.phase === 'waiting') {
      // The owner's launch countdown (OWNER_LAUNCH_COUNTDOWN_S, 2026-10-01): started when both sides are seated, told to
      // every page; a side emptied before it ran out puts the room back to waiting. The solo room starts at once.
      if (!this.sidesSeated()) { if (st.hold) this.abandon(); else this.callOffCountdown(); return; }
      if (st.hold) {
        // ROUND1-COUNT: the barrier passed, the host's own 0.5 s counts (`ROUND1_AFTER_BARRIER_S_READING`), then round 1.
        if (st.hold.startAt !== undefined) { if (this.tick >= st.hold.startAt) this.startRound(true); return; }
        // ONL-18b: the load barrier -- a leaver no longer counts; the last `loaded` (`loaded`) or the ceiling passes it.
        for (const id of st.hold.pending) if (!this.players.has(id) || this.players.get(id)!.away) st.hold.pending.delete(id);   // NET-RES-2's review F4: a held seat away too
        // LOW-11 (the review): a launched seat that left still loading (its token in `loading`, no seated socket holds
        // it) is waited for LOAD_REJOIN_GRACE_PLACEHOLDER more -- the clock drops its id, its token stays, and its rejoin
        // resumes the wait (`hello`); past the grace its slot is skipped.
        for (const token of st.hold.loading) {
          const id = this.live.get(token);
          if (id !== undefined && this.players.has(id) && !this.players.get(id)!.away) { st.hold.away.delete(token); continue; }   // F4: away is not here
          const by = st.hold.away.get(token);
          if (by === undefined) st.hold.away.set(token, this.tick + Math.round(LOAD_REJOIN_GRACE_PLACEHOLDER * TICK_HZ));
          else if (this.tick >= by) { st.hold.loading.delete(token); st.hold.away.delete(token); }
        }
        if ((st.hold.pending.size === 0 && st.hold.loading.size === 0) || this.tick >= st.hold.until) this.barrierPassed(st.hold, st.hold.pending.size === 0 && st.hold.loading.size === 0 ? 'all' : 'ceiling');
        return;
      }
      const wait = this.launchWaitS();
      if (this.opts.heldLaunch && st.launchAt === undefined) return;   // SVC-07a: the game lobby's launch, not the room's
      if (st.launchAt === undefined && wait > 0) {
        this.state = { phase: 'waiting', launchAt: this.tick + Math.round(wait * TICK_HZ) };
        // Announced once a page (the sprint-5 fix): a seat whose welcome or promotion already said it is left out.
        const text = JSON.stringify({ type: 'countdown', seconds: wait } satisfies ServerEvent);
        for (const [id, conn] of this.conns) if (!this.preTold.has(id)) conn.send(text);
        this.preTold.clear();
        return;
      }
      if (st.launchAt === undefined || this.tick >= st.launchAt) this.firstRound();
    } else if (st.phase === 'play') {
      if (!classic) {
        if (this.tick < st.endsAt) return;
        this.state = { phase: 'expired', resultAt: this.tick + (EXPIRED_PLAY_S + RESULT_S) * TICK_HZ };
        this.broadcast({ type: 'timeExpired' });
        return;
      }
      // PF-12 (research 192 s2.1): `start` watches the elimination and `mission_timer` the clock from the map's game
      // type's waits -- 15 s and 15 s on SUPPRESSION; 13 s on DEMOLITION; the clock from 5 s on ESCORT and BREACH.
      const mode = modeRules(this.map.gameType ?? 5);
      // XR-05 (PF.R27, research 214 s1): a bomb's outcome ends the round -- state 4 the defuser's side (`defuse` @1960),
      // state 5 the planting side's (`bomb_timer` @4596), its round win counted at once -- after the script's hold
      // (`BOMB_RESULT_DELAY_READING`); and while it is planted, `switch_timer` has stopped `start` and `mission_timer`:
      // no elimination and no time-out decide the round.
      const outcome = this.bomb?.result();
      if (outcome) {
        this.wins[outcome.winner]++;
        this.state = { phase: 'decided', resultAt: this.tick + resultHoldS(outcome.kind, this.map.gameType ?? 5) * TICK_HZ, winner: outcome.winner, endsAt: st.endsAt, reason: 'bomb' };   // LATER 149: BREACH's detonation 23 s
        return;
      }
      if (mode.plantedStopsClock && this.bomb?.planted) return;
      const since = this.tick - st.startedAt, watch = eliminationWatchS(mode);
      if (since < Math.min(watch, mode.timerWatchS) * TICK_HZ) return;
      // ESCORT (PR #331 F3): EndRescue stops `start` at an extraction (MP52 @4528, MP53 @4560, MP82 @4300) -- no
      // elimination decides the round after it; `hostages_rescued` does (`ExtractionAuthority.startStopped`).
      const watching = since >= watch * TICK_HZ && !this.extraction?.startStopped();
      // solo: a side with nobody on it is never eliminated (SOLO_ROUND_PLACEHOLDER; `eliminationWinner`'s `seated`)
      const winner = watching ? eliminationWinner(this.living(), this.opts.solo ? this.seated() : undefined) : null;
      if (winner) {
        // `mp_score00` / `mp_score08` += 1 and `mp_winner` at once, `mission_timer` stopped, the two lines posted.
        this.wins[winner]++;
        // LATER 126: on ESCORT the SEALs' elimination runs `escort_success` before `success` (2 + 5 + 20 + 1, a SEAL host).
        const hold = winner === 'seal' && this.map.gameType === 3 ? ESCORT_ELIMINATION_HOLD_READING : eliminatedHoldS(this.map.stem);
        this.state = { phase: 'decided', resultAt: this.tick + hold * TICK_HZ, winner, endsAt: st.endsAt, reason: 'elimination' };
        this.broadcast({ type: 'eliminated', winner });
        return;
      }
      // HX-1 (research 237 s3; 190 s4.2 C2): EXTRACTION's branches 3 and 4 of the same loop, after the elimination's --
      // two rescued with all three resolved, the SEALs after 25 s; two killed by SEALs, the Terrorists after 23 s.
      // ESCORT (game type 3) reads the same hook: one VIP extracted after the staging countdown, or three VIP kills
      // (research 175 §4).
      const ext = since >= watch * TICK_HZ ? this.extraction?.result() : null;
      if (ext) {
        this.wins[ext.winner]++;
        this.state = { phase: 'decided', resultAt: this.tick + ext.hold * TICK_HZ, winner: ext.winner, endsAt: st.endsAt, reason: ext.reason };
        this.broadcast({ type: 'eliminated', winner: ext.winner, reason: ext.reason });
        return;
      }
      // `mission_timer` at 00:00: `abort` -- `round_count` += 1, `mp_winner` = 99, a draw, no message, no hold -- on
      // SUPPRESSION, DEMOLITION and EXTRACTION; `mp_winner` = 0 on ESCORT, 8 on BREACH: that side's round win, counted
      // as an elimination's is. LATER 127 / 138: that win runs its mode's `*_success` -- its lines (the page's, on
      // `timedOut`: its own event, so no page reads it as an elimination), then its hold (`timeoutHoldS`); the draw ends
      // at once as before.
      if (since >= mode.timerWatchS * TICK_HZ && this.tick >= st.endsAt) {
        if (mode.timeoutWinner) this.wins[mode.timeoutWinner]++;
        const hold = timeoutHoldS(this.map.gameType ?? 5);
        if (mode.timeoutWinner && hold !== null) {
          this.state = { phase: 'decided', resultAt: this.tick + hold * TICK_HZ, winner: mode.timeoutWinner, endsAt: st.endsAt, reason: 'timeout' };
          this.broadcast({ type: 'timedOut', winner: mode.timeoutWinner });
        } else this.endRound(mode.timeoutWinner);
      }
    } else if (st.phase === 'expired') {
      if (this.tick >= st.resultAt) this.endRound();
    } else if (st.phase === 'decided') {
      if (this.tick >= st.resultAt) this.endRound(st.winner);
    } else {
      // SVC-23d: a passed vote's target removed as the screen that tests the votes starts (VOTE_KICK_POINT_READING).
      if (this.voteKickAt !== null && this.tick >= this.voteKickAt) { this.voteKickAt = null; this.applyVotes(); }
      if (this.tick < st.nextAt) return;
      if (classic && !this.sidesSeated()) {
        // A side emptied between rounds: the room abandons (its stand-in, `ABANDON_TRIGGER_READING`; the original
        // abandons only a late joiner below three, `FUN_002bc530` D:L161137-161141, research 315 §3.3); the room waits
        // for both sides again (CLASSIC_WAITING_PLACEHOLDER). In play, `leave` does.
        this.abandon();
        return;
      }
      // ONL-20b / RSP-4 (research 309 R309.1, R309.3; 350 §2): a held game returns to its lobby after a full game under
      // either ruleset. Unheld dedicated rooms continue with their next match as before (DEDICATED_NEXT_MATCH_ADAPTATION).
      // NET-RES-2's review F1: before the wait below -- a finished match never waits for a side away.
      if (st.matchOver && this.opts.heldLaunch) {
        if (this.opts.closeAtMatchEnd?.()) return;                 // OBF-4: closed for its host's update, no return
        this.returnToLobby();
        return;
      }
      // NET-RES-2b (NET-RES.R6, the owner's ruling: "a new classic round waits up to 3 min"): a side whose seats are all
      // held away starts no round; it waits for one back, or for the hold's end (the leave, then the abandon above).
      if (classic && !this.sidesPresent()) return;
      this.startRound(st.matchOver);
    }
  }

  /**
   * LATER 148 (`PLANTED_CLOCK_FUSE_READING`, research 214 §6): a plant restarts the round's clock at the fuse -- the commit
   * sets the game's clock length to `FUSE_S` and its base to now (`FUN_002c20c0` D:L164084-164088, `FUN_002a6ac0`
   * D:L148964), the clock every page's HUD draws (`FUN_001f6b60`, GameState @0xc) -- so the round's end is the fuse's
   * tick: `endsAt` and the total moved there, every page told (`roundTime`, as the penalty minute's) and the clock (`score`).
   * In play and in a decided hold alike (LATER 145). The time-out cannot follow while planted (`plantedStopsClock`).
   */
  private plantedClock(): void {
    const st = this.state, at = this.bomb?.wire().detonateTick ?? null;
    if ((st.phase !== 'play' && st.phase !== 'decided') || at === null) return;
    st.endsAt = at;
    this.roundTotalS = (at - (this.roundStartTick ?? 0)) / TICK_HZ;
    this.broadcast({ type: 'roundTime', seconds: this.roundTotalS });
    this.scoreDirty = true;
  }

  /** LATER 152: a defuse stops the round clock at its remainder (`FUN_002c1c30` D:L163937 clears +0xf5), every page told. */
  private holdClock(): void {
    this.clockHeldS = this.timeLeft();
    this.scoreDirty = true;
  }

  /**
   * HX-1 (research 237 s3): the minute -- on an observed rise of `mp_penalty` (`PENALTY_COALESCE_READING`: one minute
   * however many rises since the last look; D:L150711-150716) the round's total loses `PENALTY_MINUTE_READING.cut` 60 s
   * when above it, else becomes `floor` 1 s (`FUN_002a6960` D:L148936-148949); the clock's end is the round's start plus
   * the total, so a total already spent ends a round in play at once (the time-out's draw); every page told the total
   * (`roundTime`) and the clock (`score`). In a decided round's hold too: the host's update keeps running (only `start`
   * and `mission_timer` stopped).
   */
  private penaltyMinute(): void {
    const st = this.state;
    if (!this.extraction || (st.phase !== 'play' && st.phase !== 'decided') || !this.extraction.takePenalty()) return;
    const { cut, floor } = PENALTY_MINUTE_READING;
    this.roundTotalS = this.roundTotalS > cut ? this.roundTotalS - cut : this.roundTotalS > 0 ? floor : 0;
    st.endsAt = (this.roundStartTick ?? 0) + this.roundTotalS * TICK_HZ;
    this.broadcast({ type: 'roundTime', seconds: this.roundTotalS });
    this.scoreDirty = true;
  }

  // ---- SVC-07a: a game's launch, from its game lobby (research 159 §5) ----

  /**
   * NET-DRAIN (OT.R38 / H117; research 223 §7): whether a round is being played now (`play`, `expired`, `decided`) --
   * the round a server's drain lets finish. False in the waiting room, the launch's load hold and the round-end interval
   * (`over`): the drain closes the room then, before a next round starts.
   */
  get roundRunning(): boolean {
    return this.inRound();
  }

  /** Read-only kit data for trusted CPU controllers using the same legal loadout requests as players. */
  get botKits(): SimKits | null { return this.kits; }

  /** Whether the match has started: past the waiting room, or in the launch's load hold (a game reports itself active from then). */
  get launched(): boolean {
    return this.state.phase !== 'waiting' || this.state.hold !== undefined;
  }

  /**
   * ONL-18b (web research 221): the launch's round 1. With a load barrier (`loadBarrierS`) the room holds it -- every
   * player seated now must send `loaded` first (`FUN_002c4020` D:L165414-165441: the host passes when no launched
   * non-spectator is still loading; spectators are not waited for, research 179 §6.22) -- and tells the bridge
   * (`onLoadHold`), whose pages then load; else, or with no one to wait for, round 1 starts now.
   */
  private firstRound(): void {
    for (const p of this.players.values()) p.lobbyChoice = false;   // ARMORY-SAVE: the map's load drops IDFromBriefing (research 309 §2.3)
    for (const r of this.kept.values()) r.lobbyChoice = false;       // and a record kept for a rejoin
    for (const p of this.players.values()) this.tellKitHeld(p);      // KIT-HELD: each seat's held kit, the stored records' applied
    const ceiling = this.opts.loadBarrierS;
    if (ceiling === undefined || ceiling <= 0 || this.players.size === 0) { this.startRound(true); return; }
    const loading = new Set<string>();
    for (const id of this.players.keys()) { const t = this.sessions.get(id); if (t !== undefined) loading.add(t); }
    this.state = { phase: 'waiting', hold: { until: this.tick + Math.round(ceiling * TICK_HZ), pending: new Set(this.players.keys()), loading, away: new Map() } };
    this.preTold.clear();
    this.loadHoldAt = this.tick;                                     // IP3: the instrument's clock
    this.loadTold.clear();
    this.opts.onLoadEvent?.({ kind: 'hold', tick: this.tick, seats: [...this.players.keys()], ceilingTicks: Math.round(ceiling * TICK_HZ) });
    this.opts.onLoadHold?.();
  }

  /**
   * ONL-18b: a page's `loaded`. Counted only in the launch's hold and only from a seat it waits for: a spectator's, an
   * unseated socket's, a duplicate, or one outside a hold is ignored -- nothing thrown, nothing sent. The last passes the
   * barrier (ROUND1-COUNT: round 1 then starts `ROUND1_AFTER_BARRIER_S_READING` later); one after it counts for nothing.
   */
  private loaded(id: number): void {
    // LATER 85 / 266: a late console's load publishes its actor dead (`FUN_00543d50`, research 322 §5.3).
    const late = this.players.get(id);
    this.lateMembers.delete(id);
    // KIT-HELD: the page's load -- the front end's match page after the lobby's hand-off -- is told its seat's held kit,
    // on a `loaded` the room accepts only: a late seat's first (`awaitingLoad`), or a seat's first in the launch's hold,
    // the one the barrier counts. A spectator's, an unseated socket's, a duplicate, or one outside a hold or after the
    // ceiling tells nothing (ONL-18b: nothing sent).
    const hold0 = this.state.phase === 'waiting' ? this.state.hold : undefined;
    if (late && (late.awaitingLoad || (hold0 !== undefined && hold0.startAt === undefined && hold0.pending.has(id)))) this.tellKitHeld(late);
    if (late?.awaitingLoad) {
      late.awaitingLoad = false;
      this.scoreDirty = true;
      if (this.opts.rules === 'respawn') {
        this.enterDeadAtLoad(late);
        this.tellLoadDeath(late);
      }
      // LATER 274: loaded over the launch's hold, it is still a ghost of round 1 -- the original's round 1 starts from the
      // level's init with no revival (`FUN_002a7d40` D:L50946), its ghost flag cleared and its actor respawned only between
      // rounds (`FUN_002232a0` D:L75846-75849; `FUN_00223680`'s `FUN_00598b90` loop, D:L75925-75931). The hold itself, not the waiting room: a
      // late takeover across a lobby return (the bridge keeps +0xcc through a load, LATER 64) loads with no hold, and is no
      // ghost of the next round.
      if (this.opts.rules === 'classic' && this.state.phase === 'waiting' && this.state.hold !== undefined) late.ghostOfNextRound = true;
      // LATER 85: its console's level start, +0xcc set -- the late joiner's channel asked (`FUN_001f6660` D:L55848-55849,
      // `VOICE_LATE_JOINER_READING`), the ghost flag +0xd2 set (D:L55727), as `voiceEnter` asks it.
      // The narrow re-read's 2: only past the waiting room -- a load finished over the launch's hold keeps the lobby's
      // channel with every seat, and round 1's start asks theirs.
      this.voiceLateEntry(id);
    }
    const st = this.state;
    const counted = st.phase === 'waiting' && !!st.hold && st.hold.startAt === undefined && st.hold.pending.has(id);
    const tell = (): void => {   // IP3 (`onLoadEvent`): told after the count, so `pending` is what is left
      // The load-log flood (2026-11-04): a CPU seat's controller sends `loaded` every step (`MatchBots.step`); only a
      // seat's first since the hold began is a step of the hold -- none before a hold, no repeat -- told.
      if (this.loadHoldAt === null || this.loadTold.has(id)) return;
      if (this.opts.onLoadEvent) this.loadTold.add(id);
      const hold = st.phase === 'waiting' ? st.hold : undefined;   // `loadHoldAt` is set here; its null arm is the type's
      this.opts.onLoadEvent?.({ kind: 'loaded', seat: id, tick: this.tick, sinceHold: this.loadHoldAt === null ? null : this.tick - this.loadHoldAt, counted, pending: hold ? hold.pending.size : 0 });
    };
    if (st.phase !== 'waiting' || !st.hold || !st.hold.pending.delete(id)) { tell(); return; }
    const session = this.sessions.get(id);
    if (session !== undefined) st.hold.loading.delete(session);   // LOW-11: loaded; a later socket of it is not waited for
    tell();
    if (st.hold.startAt === undefined && st.hold.pending.size === 0 && st.hold.loading.size === 0) this.barrierPassed(st.hold, 'all');
  }

  /**
   * LATER 266: a late respawn seat's entry dead at load (research 322 §5.3). FUN_002b7d60 D:L158619-158628: key0/2 and
   * its transform before the at-load death. Use the same start picker, lift and floor probe as `spawn`, without its
   * living body, kit reset, score or wire event. RC4: its first entry clears its late mark (`joinedLate`).
   */
  private enterDeadAtLoad(p: Player): void {
    const slot = this.pick(p, 'start');
    const at: V3 = slot ? [slot.position[0], slot.position[1] + SPAWN_LIFT, slot.position[2]] : [0, 0, 0];
    p.sim.walker.place(at[0], at[1] + probeLiftOf('stand'), at[2]);
    p.sim.walker.state.yaw = slot ? wrapYaw(-slot.step * 45) : 0;
    p.deadAtLoad = true;
    p.diedAt = this.tick;
    p.deadOnReturn = false;                                      // N3: a held seat back dead has entered
    this.joinedLate.delete(p.id);
  }

  /**
   * LATER 85: a late console's level start, +0xcc set -- the late joiner's channel asked (`FUN_001f6660`
   * D:L55848-55849, `VOICE_LATE_JOINER_READING`), the ghost flag +0xd2 set for classic (D:L55727); only past the
   * waiting room (the narrow re-read's 2). RC4 (the controller's ruling): asked at the dead-at-load entry whichever
   * path got there -- its `loaded`, or a promotion after it (`broadcastChanges`, after `voiceRoles`' entry).
   */
  private voiceLateEntry(id: number): void {
    const seat = this.voice.get(id);
    if (!seat || seat.spectator || this.state.phase === 'waiting') return;
    seat.ghost = this.opts.rules === 'classic';
    const news: VoiceNews = { changed: [], moved: new Set() };
    this.voiceAsk(id, VOICE_LATE_JOINER_READING, news);
    this.voiceTell(news);
  }

  /** The actor already at its original start, with alpha zero; the page needs the same transform before death. */
  private tellLoadDeath(p: Player, age?: number): void {
    const s = p.sim.walker.state;
    this.send(p.id, { type: 'deadAtLoad', id: p.id, at: [s.x, s.y, s.z], yaw: s.yaw, ...(age !== undefined ? { age } : {}) });
  }

  /**
   * ROUND1-COUNT: the launch's load barrier passed (the last `loaded`, or the ceiling). The original's host counts its
   * load state's 0.5 s after it before its core state starts round 1 (`FUN_001f5e70` D:L55748-55755; `FUN_001ec480`
   * D:L50946), so round 1 starts `ROUND1_AFTER_BARRIER_S_READING` later (`clock`); the hold, and so the welcome's
   * `loading`, stands until then. The wire carries no `+0x112`: a page hears round 1's `roundStart`, and having counted
   * its own 0.5 s from its assets (viewer `loadingJoin.ts`, `CLIENT_ROUND_WAIT_READING`) leaves its loading screen on it.
   */
  private barrierPassed(hold: { startAt?: number; pending?: Set<number> }, by: 'all' | 'ceiling'): void {
    hold.startAt = this.tick + Math.round(ROUND1_AFTER_BARRIER_S_READING * TICK_HZ);
    // LATER 726 (KIT-HELD's ceiling gap; the port's own wire, an adaptation with no original): a seat still loading at
    // the ceiling heard the launch's tell on its lobby socket, before the hand-off, and its `loaded` after the pass is
    // refused (ONL-18b) -- so it is told here, once per hold on the socket that holds it now (a seat may also have heard the launch's tell on its lobby socket, or a welcome tell: the page takes each wholesale, `PlayerLoadout.held`) (a takeover's pending id is rekeyed,
    // `takeOver`); the match page's loader keeps an event that arrives mid-load for its replay (viewer `LobbyMatch`).
    if (by === 'ceiling') for (const id of hold.pending ?? []) { const p = this.players.get(id); if (p) this.tellKitHeld(p); }
    // IP3 (`onLoadEvent`): the pass, and the seats round 1 did not wait for.
    this.opts.onLoadEvent?.({ kind: 'passed', tick: this.tick, sinceHold: this.loadHoldAt === null ? 0 : this.tick - this.loadHoldAt, by, waiting: [...(hold.pending ?? [])] });
  }

  /** The welcome's `phase` (additive): the room's state, the launch's load hold read `loading`. */
  private wirePhase(): RoomPhase {
    const st = this.state;
    return st.phase === 'waiting' && st.hold ? 'loading' : st.phase;
  }

  /**
   * ONL-17 / SVC-24 (web research 167; OT.R36): the account's stored ARMORY record for the player's side on this map,
   * read by the server at the game's launch (`GameBridge`, `STORED_LOADOUT_AT_LAUNCH_ADAPTATION`) -- never from the
   * page. The record is re-chosen item by item as the client revalidates it (`readProfile`; the original's
   * `EquipCharacterProfileSeal/Merc` on the map's `Enable_` valves, research 182 §2.18): its column the next spawn's
   * type, the picks that reach its kit the type's next kit, as a `loadout` request's would be. False, and nothing
   * changed, for no record, an invalid one (mode 7), one of a column the side lacks, a seat that is no player, a room
   * without the map's kits or a round under way, or a seat whose own lobby choice stands (`lobbyChoice`).
   */
  storedProfile(id: number, profile: ArmoryProfile | null): boolean {
    const p = this.players.get(id), map = this.kits?.map;
    if (!p || !profile || !map || this.inRound() || p.lobbyChoice || equipmentLimit(this.opts.eqLimit) !== 0) return false;   // FromBriefing loads no profile under EQlimit
    const valves = map.valves;
    const got = readProfile({
      arsenal: this.kits!.table.arsenal, valves, side: p.team, kits: map.kits[p.team].map((k) => k.loadout),
      fourthOpen: fourthArmoryTypeOpen(valves), eqLimit: 0, comeFromLan: false,
    }, profile);
    if (!got || !this.typeAllowed(p.team, got.column)) return false;
    p.nextChar = got.column;
    p.picks = got.picks;
    p.next = got.picks.length ? got.kit : null;
    return true;
  }

  /**
   * The game lobby's launch with the seats' stored records (`STORED_LOADOUT_AT_LAUNCH_ADAPTATION`, `bridge.ts`): none on a
   * launched room; else each record handed to `storedProfile` and then `launch`, and when the launch is refused (a side
   * empty, a countdown already running) every seat's next type and kit put back as they were. Answers `launch`'s.
   */
  launchStored(seconds: number, profiles: ReadonlyMap<number, ArmoryProfile | null>): boolean {
    if (this.launched) return false;
    const undo = [...profiles.keys()].flatMap((id) => {
      const p = this.players.get(id);
      return p ? [{ p, nextChar: p.nextChar, picks: p.picks, next: p.next }] : [];
    });
    for (const [id, profile] of profiles) this.storedProfile(id, profile);
    if (this.launch(seconds)) return true;
    for (const u of undo) { u.p.nextChar = u.nextChar; u.p.picks = u.picks; u.p.next = u.next; }
    return false;
  }

  /**
   * The game lobby's launch: `seconds` 0 starts round 1 now (every player ready, `FUN_002c3cf0` D:L165373-165384); more
   * runs the countdown on the room's clock, every page told (`countdown`), round 1 at its end (`ForceMPLaunch`,
   * `FUN_0027cbf0` D:L125783-125785). `seconds` 0 while the countdown runs cuts it short: every player ready launches
   * at once, countdown or not (D:L165379-165384). Refused (false) once launched, a countdown asked while one runs, or
   * with a side empty ("There must be players on both teams to launch", UIMnLOC 356).
   */
  launch(seconds: number): boolean {
    const st = this.state;
    if (st.phase !== 'waiting' || st.hold || !this.sidesSeated()) return false;
    if (seconds <= 0) { this.firstRound(); return true; }
    if (st.launchAt !== undefined) return false;
    this.state = { phase: 'waiting', launchAt: this.tick + Math.round(seconds * TICK_HZ) };
    this.preTold.clear();
    this.broadcast({ type: 'countdown', seconds });
    return true;
  }

  /** The countdown called off (`ForceMPLaunch` again with more than 5 s left, D:L125806-125810): every page told. */
  cancelLaunch(): void {
    const st = this.state;
    if (st.phase !== 'waiting' || st.launchAt === undefined) return;
    this.state = { phase: 'waiting' };
    this.broadcast({ type: 'countdown', seconds: null });
  }

  /**
   * SWITCH TEAMS before the launch: the player to the other side when it has fewer than eight (`FUN_002c4290`
   * D:L165538-165568), seated there afresh and the others told (`left`, then `joined`). Returns the side, or null.
   */
  switchTeam(id: number): Team | null {
    if (this.state.phase !== 'waiting' || !this.players.has(id)) return null;
    const team = this.lobby.switchTeam(id);
    if (!team) return null;
    this.players.delete(id);
    this.broadcast({ type: 'left', id }, id);
    this.start(this.seat(id, team));
    this.broadcast({ type: 'joined', id, name: this.lobby.member(id)!.name, team, ...this.botMark(id) }, id);
    this.scoreDirty = true;
    this.recordRoster();                                         // REPLAY-TEAM-SWAP: the replay's roster on the new side
    return team;
  }

  /**
   * CLAN-SWAP (research 309 §5): "Alternate teams"' swap in the game's lobby a match returned to -- every player to the
   * other side together (`Lobby.swapSides`; the host's `FUN_002c0040` D:L162973-162982), spectators kept, each seated
   * afresh on its new side as SWITCH TEAMS seats one (`switchTeam`: `left` to the others, the seat, `joined`): every body
   * leaves first, then each is seated. Only while the room waits; false otherwise (the bridge's `PreMatch` asks first).
   */
  swapSides(): boolean {
    if (this.state.phase !== 'waiting') return false;
    const moved = this.lobby.swapSides().filter((m) => this.players.has(m.id));
    for (const { id } of moved) {
      this.players.delete(id);
      this.broadcast({ type: 'left', id }, id);
    }
    for (const { id, team } of moved) {
      this.start(this.seat(id, team));
      this.broadcast({ type: 'joined', id, name: this.lobby.member(id)!.name, team, ...this.botMark(id) }, id);
    }
    this.scoreDirty = true;
    this.recordRoster();                                         // REPLAY-TEAM-SWAP: the replay's roster on the swapped sides
    return true;
  }

  /** Both sides have a player (dead or alive, ghosts included). */
  /**
   * Whether a room still waits for both sides once a player of `joining` is seated (2026-09-30): the welcome's
   * and the promotion's `waiting`, so the page shows the waiting line and not the round's banner. The solo room starts
   * with its one player (`sidesSeated`), so it never waits.
   */
  private waitingWith(joining: Team | null): boolean {
    // solo: the one-player match never waits for a second side (SOLO_ROUND_PLACEHOLDER)
    if (this.state.phase !== 'waiting' || this.opts.solo) return false;
    let seal = joining === 'seal' ? 1 : 0, terrorist = joining === 'terrorist' ? 1 : 0;
    for (const p of this.players.values()) { if (p.team === 'seal') seal++; else terrorist++; }
    return seal === 0 || terrorist === 0;
  }

  /**
   * The launch countdown's seconds left for a page seated now on `joining` (null: already seated, a promotion), the
   * welcome's and the promotion's `countdown` (OWNER_LAUNCH_COUNTDOWN_S): the one running, or the whole of it when this
   * seat is the one that completes both sides (the clock starts it at the next tick); null when none runs or will.
   */
  private countdownWith(joining: Team | null): number | null {
    const st = this.state;
    const wait = this.launchWaitS();
    // None in a room that has none, or while a side is still empty (a countdown left over is off: `callOffCountdown`).
    if (st.phase !== 'waiting' || wait <= 0 || this.waitingWith(joining)) return null;
    if (st.launchAt !== undefined) return Math.max(0, (st.launchAt - this.tick) / TICK_HZ);
    return wait;
  }

  /**
   * The launch countdown's length in this room, seconds (0: none). The owner's ruling of 2026-10-01 is a classic room's
   * ("a 10 s countdown once a second player joins before the match begins"; research 91 §19's "launch countdown" row:
   * "once both sides have a player ... before round 1 starts"). An unheld respawn room plays from its first seat (the
   * constructor's `play`): it has no round 1 to wait for, so none -- the clock and the welcome's and promotion's
   * `countdownWith` both read it here (the sprint-5 fix: the clock counted down for any non-solo room, the welcome only
   * for a classic one). The solo room starts at once.
   */
  private launchWaitS(): number {
    if (this.opts.heldLaunch) return 0;                          // SVC-07a: the game lobby's countdown (`launch`)
    // solo: round 1 starts with the one player, no countdown (SOLO_ROUND_PLACEHOLDER)
    return this.opts.rules === 'classic' && !this.opts.solo && this.opts.launchCountdownS > 0 ? this.opts.launchCountdownS : 0;
  }

  /**
   * A welcome's or a promotion's `countdown` to a seat that completes both sides before the countdown runs (the clock
   * starts it at the next tick): that page is told by its welcome, so the tick's broadcast leaves it out and the line
   * is posted once (the sprint-5 fix: "GAME STARTS IN 10 SECONDS" twice on that seat's page).
   */
  private toldCountdown(id: number, countdown: number | null): void {
    if (countdown !== null && this.state.phase === 'waiting' && this.state.launchAt === undefined) this.preTold.add(id);
  }

  /**
   * A side emptied while waiting: a running countdown is called off at once (`countdown` null, the waiting line again),
   * and a seat a welcome told of one the clock never started is told it is off -- on the leave itself, not a tick
   * later (a page going sends its socket's close frame: a new pair's countdown never starts against a seat gone).
   */
  private callOffCountdown(): void {
    const st = this.state;
    if (st.phase !== 'waiting' || this.sidesSeated()) return;
    if (st.launchAt !== undefined) { this.state = { phase: 'waiting' }; this.broadcast({ type: 'countdown', seconds: null }); }
    else for (const id of this.preTold) this.send(id, { type: 'countdown', seconds: null });
    this.preTold.clear();
  }

  private sidesSeated(): boolean {
    // solo: one seat is both sides seated (SOLO_ROUND_PLACEHOLDER)
    if (this.opts.solo) return this.players.size > 0;
    let seal = 0, terrorist = 0;
    for (const p of this.players.values()) { if (p.team === 'seal') seal++; else terrorist++; }
    return seal > 0 && terrorist > 0;
  }

  /** NET-RES-2b (NET-RES.R6): both sides have a seat not held away (`away`): a classic round may start. */
  private sidesPresent(): boolean {
    // solo: no side is held away in the one-player match (SOLO_ROUND_PLACEHOLDER)
    if (this.opts.solo) return true;
    let seal = 0, terrorist = 0;
    for (const p of this.players.values()) { if (p.away) continue; if (p.team === 'seal') seal++; else terrorist++; }
    return seal > 0 && terrorist > 0;
  }

  /** Each side's players, dead or alive (the solo match's elimination test). */
  private seated(): { seal: number; terrorist: number } {
    const n = { seal: 0, terrorist: 0 };
    for (const p of this.players.values()) n[p.team]++;
    return n;
  }

  /** `aiteam_00` / `aiteam_08`: each side's living players. */
  private living(): { seal: number; terrorist: number } {
    const n = { seal: 0, terrorist: 0 };
    for (const p of this.players.values()) if (p.alive) n[p.team]++;
    return n;
  }

  private resetMatch(): void {
    this.round = 0; this.wins.seal = 0; this.wins.terrorist = 0;
    for (const p of this.players.values()) {
      p.kills = 0; p.deaths = 0; p.score = 0;
      p.shotsFired = 0; p.shotsHit = 0; p.headshots = 0; p.teamKills = 0; p.suicides = 0;   // PF-26: the match's counters
      p.primaryObjs = 0; p.bonusObjs = 0;                                                    // PF-14: the objectives'
      p.hostagesRescued = 0; p.escorteesKilled = 0;                                          // HX-5: the hostages'
      p.playedMs = 0; p.roundsWon = 0; p.roundsLost = 0; p.roundsDrawn = 0;                  // SVC-12d: the results'
      p.bombsPlanted = 0; p.bombsDefused = 0; p.joinedInProgress = false;
    }
    this.victoryRequests.clear();                                // LATER 327 (#456): the page numbers from 1 again at each match's mount
    this.tauntRequests.renumber(); this.communicationRequests.renumber();   // OBF-20: the Chat menu's sends, numbered from 1 by each mount too
    this.matchLeavers = [];                                      // SVC-07: the match's leavers go with its counters
  }

  /** SVC-12d: a new match's id (research 155 §4.2): the next serial in this room, its start on the room's clock. */
  private newMatchId(): void {
    this.matchSerial++;
    this.matchStartedAt = this.opts.now();
  }

  /** A round begins: the next, or a new match's first; everyone (the ghosts too) at a round-start slot with a full kit. */
  private startRound(newMatch: boolean): void {
    // The initial load hold revives no late actor (research 322 §5.3): classic stays a ghost; respawn keeps its
    // stamped death and alpha zero. A later match's normal rebuild still spawns every loaded respawn seat.
    const keepLoadDeaths = this.state.phase === 'waiting' && this.state.hold !== undefined;
    if (newMatch && !keepLoadDeaths) this.joinedLate.clear();   // RC4: a new match's rebuild, no longer a late entry
    this.opts.beforeRoundStart?.(newMatch);
    if (newMatch) { this.resetMatch(); this.newMatchId(); this.matchStartTick = this.tick; this.opts.recorder?.matchReset?.(this.tick); }   // LATER 349
    this.round++;
    this.roundSerial++;
    this.roundLeavers = [];                                      // SVC-12d
    this.state = { phase: 'play', startedAt: this.tick, endsAt: this.tick + this.opts.roundSeconds * TICK_HZ };
    this.ruleOut.clear(); this.ruleMatchOver = false;            // FCW-31: a rule's elimination and match end are the round's
    if (newMatch) this.ruleEvent({ name: 'match.start' });      // FCW-31: before the round's spawns
    this.ruleEvent({ name: 'round.start' });
    this.roundTotalS = this.opts.roundSeconds;                   // HX-1: the minute's total, whole again
    this.preTold.clear();
    this.lastResult = null;                                      // PF-28: the round screens are over
    this.clearAir();                                             // a fresh level (ROUND_START_PROJECTILES_READING)
    // MAP-02, PF.R10: the level as it opened (FUN_002ac0e0 D:L151976-151991), before anyone is spawned into it.
    this.world.reset();
    this.doors.reset();
    this.gates.reset();                                          // MAP-07: shut, the lever valves cleared (`set_accessN` is the world's)
    this.cranes.reset();
    this.craneScored.clear();                                    // FUN_002b5510: the records' +0x3f bit 1 cleared
    this.bomb?.reset();                                         // XR-05: StartBomb, state 1, every page told
    this.bombPlanter = null;   // LATER 145 (the gameplay seat's nit): a planted-then-defused hold no longer leaves it to the next round
    this.clockHeldS = null;    // LATER 152: the next round's clock runs
    this.extraction?.reset(false);                               // HX-1: `reset`'s valves, the hostages at their starts (told below)
    this.resetTurrets();                                         // MAP-10b: freed, their rounds restored (FUN_003aa9d0)
    // A seat still in its ARMORY is spawned too: the round's start closes the screen (W5.R1, ARMORY_SEAT_READING).
    this.teamScore.seal = 0; this.teamScore.terrorist = 0;     // PF-14: the round's carry (TEAM_SCORE_READING)
    const passedBy: number[] = [];                               // LATER 85: the seats this start passes by (`ghosts`)
    for (const p of this.players.values()) {
      p.signals = freshSignals();                                // SVC-12d: its signals from zero
      p.rttRound.length = 0;                                     // NCW-1: the round's round trips from zero
      p.refusalsLogged = 0;                                      // SIMDROP-INSTR: the round's refusal lines from zero
      p.frameAt = -1;                                            // SIMDROP-INSTR: the round's largest gap from its first frame
      p.roundFromMs = this.opts.now();                           // NCW-6: the seat's wall time in the round from its start
      p.roundScore = 0; p.roundKills = 0; p.roundDeaths = 0; p.roundRescued = 0; p.arming = false;
      if (!keepLoadDeaths || !p.deadAtLoad) p.diedAt = -1;
      // LATER 85: a late seat still loading stays without a body -- a ghost of the round (the review's F2: not in it for the
      // results, `ghostOf`), named to the pages (`ghosts`, F1); every other seat is in this round, spawned.
      if (p.awaitingLoad || p.ghostOfNextRound || p.away) { passedBy.push(p.id); continue; }   // LATER 274: and a ghost of this round; NET-RES-2b: a held seat away
      p.playsRound = this.roundSerial;
      if (keepLoadDeaths && p.deadAtLoad) continue;
      this.spawn(p, 'start');
    }
    // Protocol 10 (MAP-03): the round's epoch (its serial) and the tick it began on (ONL-18's countdown reads it).
    this.roundStartTick = this.tick;
    this.broadcast({
      type: 'roundStart', round: this.round, seconds: this.opts.roundSeconds, wins: { ...this.wins }, rounds: this.opts.maxRounds,
      epoch: this.roundSerial & 0xffff, startTick: this.roundStartTick, ...(passedBy.length ? { ghosts: passedBy } : {}),
    });
    // The page's round UI resets its help. Re-tell this existing death with its room age, never restart its wait.
    if (keepLoadDeaths) for (const p of this.players.values()) if (p.deadAtLoad) this.tellLoadDeath(p, this.tick - p.diedAt);
    this.voiceRoundStart(newMatch);                              // SVC-20b-relay / SVC-20c: the level's 0 or the rebuild's +0xc4
    for (const id of passedBy) { const s = this.players.get(id); if (s) s.ghostOfNextRound = false; }   // LATER 274: the round after spawns it
    // HX-4a (research 239 s3): the hostages' reset states after the `roundStart` -- a page forgets the units there, so a
    // reset's move back to 17 plays no YES.
    this.extraction?.tellAll();
    this.opts.onRoundStart?.(this.round);
    this.broadcast(this.scoreEvent());
  }

  /**
   * A round's result. Respawn (`decided` absent): the side with more round points wins, level is a draw (`success2`).
   * Classic: the elimination's winner (its round win already counted), or null for the clock's draw. Then the bonuses
   * of the MP exit state, the same under both rules (`FUN_00223970` D:L76146-76165 tests no respawn flag): +5 to each
   * player of `mp_winner`'s side (none on a draw), +1 to each living player. This inherited executable reading awaits
   * a fresh source re-read; research 348 §2 records that limit.
   */
  private endRound(decided?: Team | null): void {
    if (this.extraction) this.hostagePrimaryObjectives();
    const side = { seal: 0, terrorist: 0 };
    // Research 348 §2: `objectives/success2` compares the round points before the MP exit state's bonuses.
    for (const p of this.players.values()) side[p.team] += p.roundScore;
    let winner: Team | null;
    if (decided === undefined) {
      winner = side.seal > side.terrorist ? 'seal' : side.terrorist > side.seal ? 'terrorist' : null;
      if (winner) this.wins[winner]++;
    } else winner = decided;
    for (const p of this.players.values()) {
      if (p.alive) { p.score += 1; p.roundScore += 1; }         // +1 alive at the round's end, after the result
      if (p.team === winner) { p.score += 5; p.roundScore += 5; }   // +5 each on the winning side (FUN_00545b10: the round block's +0x3c, D:L411821)
    }
    // SVC-12d: each seat's time in the round (SEAT_PLAYED_MS_READING) and, a round it played, its result (SEAT_ROUNDS_READING).
    const began = this.roundStartTick ?? 0;
    for (const p of this.players.values()) {
      p.playedMs += Math.round(((this.tick - Math.max(began, p.seatedAt)) * 1000) / TICK_HZ);
      if (this.ghostOf(p)) continue;
      if (winner === null) p.roundsDrawn++; else if (winner === p.team) p.roundsWon++; else p.roundsLost++;
    }
    // FCW-31 (F1 of its review): the rules hear the round's end before it is told, so a `match.end` answering it makes this
    // round final; without a host, false and nothing called.
    const ruleFinal = this.ruleHost ? this.ruleHost.roundEnd({ name: 'round.end', fields: { winner: winner ?? 'none' } }) : false;
    const matchOver = isMatchOver(this.opts.rules, this.round, this.opts.maxRounds, this.wins) || this.ruleMatchOver || ruleFinal;   // FCW-31: false || false without a host
    const screens = matchOver
      ? [{ screen: 'finalRound' as const, seconds: FINAL_ROUND_S }, { screen: 'gameComplete' as const, seconds: GAME_COMPLETE_S }]
      : [{ screen: 'roundComplete' as const, seconds: ROUND_COMPLETE_S }];
    const hold = ENGINE_READ_S + screens.reduce((a, b) => a + b.seconds, 0);
    this.state = { phase: 'over', nextAt: this.tick + hold * TICK_HZ, matchOver };
    const over = { round: this.round, winner, wins: { ...this.wins }, matchOver, screens, stats: this.statsOf() };
    this.lastResult = { ...over, at: this.tick };                // PF-28: a joiner's result panel (RESULT_CLOCK_READING)
    if (matchOver) this.ruleEvent({ name: 'match.end', fields: { winner: this.wins.seal > this.wins.terrorist ? 'seal' : this.wins.terrorist > this.wins.seal ? 'terrorist' : 'none' } });
    this.broadcast({ type: 'roundOver', ...over });
    this.broadcast(this.scoreEvent());
    this.opts.onRoundOver?.(this.roundReport(winner, matchOver, over.stats));   // SVC-12c / SVC-12d (FUN_00223970)
    this.voteKickAt = this.tick + voteKickDelayS(screens) * TICK_HZ;   // SVC-23d: VOTE_KICK_POINT_READING's screen
  }

  /**
   * SVC-12c: the round's report to `onRoundOver` -- the rounds and wins, the game over, respawn, the game type, the round's
   * clock and every seated player's counters; SVC-12d (research 264 §1): each seat's signals, and the results
   * (`handOverOf`). `emptied`: a round a leave emptied a side of (`reportEmptied`).
   */
  private roundReport(winner: Team | null, matchOver: boolean, stats: Record<number, MatchStats>, emptied = false): RoundOverReport {
    this.settleRewind();                                         // NCW-1: the open pulls counted in this round's signals
    const results = this.handOverOf(winner, matchOver, emptied);
    return {
      round: this.round, matchOver, respawn: this.opts.rules === 'respawn', gameType: this.map.gameType ?? 0, wins: { ...this.wins },
      roundMs: Math.round(((this.tick - (this.roundStartTick ?? this.tick)) * 1000) / TICK_HZ),
      seats: [...this.players.values()].map((p) => ({ id: p.id, team: p.team, kills: p.kills, roundKills: p.roundKills, deaths: p.deaths, score: p.score, stats: stats[p.id]! })),
      signals: [...this.players.values()].map((p) => ({
        seat: p.id, ...p.signals, hitsByPart: { ...p.signals.hitsByPart }, refused: { ...p.signals.refused }, burstSizes: { ...p.signals.burstSizes },
        arrivalLate: { ...p.signals.arrivalLate },   // SIMDROP-INSTR: the page's health, its histogram a copy
        ...(p.signals.rewind ? { rewind: { ...p.signals.rewind } } : {}),   // NCW-1: the rounds by rewind class and age, a copy
        ...(p.signals.shownLead ? { shownLead: { ...p.signals.shownLead } } : {}),   // NCW-17: the claim's lead over the picture, a copy
        ...(rttSummary(p.rttRound) ? { rtt: rttSummary(p.rttRound)! } : {}),   // NCW-1: the round's heartbeat round trips
        // NCW-6 (instruments): the commands received and the seat's wall time in the round, with any received; of the stale
        // rounds, those on a dropped command, beside any stale count
        ...(p.signals.commandsReceived ? { commandsReceived: p.signals.commandsReceived, wallMs: Math.max(0, Math.round(this.opts.now() - p.roundFromMs)) } : {}),
        ...(p.signals.staleFires > 0 ? { staleAfterDrop: p.signals.staleAfterDrop ?? 0 } : {}),
        ...(p.signals.centring ? { centring: { ...p.signals.centring } } : {}),   // SEC-F1: the shot-centring statistic, a copy
        ...this.builds.get(p.id),                                // NCW-10: the page's build and build time, its hello's
        ...(p.signals.trade ? { trade: { ...p.signals.trade } } : {}),   // NCW-2 B-trade (F1): the traded rounds, a copy
      })),
      ...(results ? { results } : {}),
      ...(emptied ? { emptied } : {}),
    };
  }

  /**
   * SVC-12d (research 169 §4.2): a classic round in play whose side a leave emptied, reported before the room abandons
   * it -- the wins as they stand (a decided round's counted at its decision, a round in play's none), its winner the
   * decided one, else the side still seated (`roundResultOf`'s `'counted'` branch reads it).
   */
  private reportEmptied(): void {
    const st = this.state, seated = this.seated();
    const winner: Team | null = st.phase === 'decided' ? st.winner : seated.seal > 0 ? 'seal' : seated.terrorist > 0 ? 'terrorist' : null;
    this.opts.onRoundOver?.(this.roundReport(winner, false, this.statsOf(), true));
  }

  /** SVC-12d: a ghost of the round in play -- a classic seat not seated at its start (actor +0xfd2, D:L76148, D:L76717). */
  private ghostOf(p: Player): boolean {
    return this.opts.rules === 'classic' && p.playsRound !== this.roundSerial;
  }

  /** SVC-12d: a seat as the round's result carries it (SVC-13a's `RatingSeat` but the rating, the store's). */
  private ratingSeat(p: Player, account: number): RoomRatingSeat {
    return { id: String(account), account, side: p.team, score: p.score, joinedInProgress: p.joinedInProgress, spectator: false, ghost: this.ghostOf(p) };
  }

  /**
   * SVC-12d: a seat leaving a round in play, kept with its account for `roundResultOf`'s `'counted'` branch. SVC-07
   * (`LEAVE_COST_OWNER`, OT.R33 call 7 (b)): a seat leaving a begun match keeps it -- its match seat as it stands now (its
   * counters, its rounds and its time through its last round's end) -- for the match's `RoomMatchResult`.
   */
  private noteLeaver(p: Player): void {
    const account = this.opts.handOver?.accountOf(p.id) ?? null;
    if (account === null) return;
    if (this.inRound()) this.roundLeavers.push(this.ratingSeat(p, account));
    if (this.matchStartTick === null) return;
    const roundsPlayed = this.state.phase === 'play' || this.state.phase === 'expired' ? this.round - 1 : this.round;
    this.matchLeavers.push({ ...this.matchSeat(p, account), stood: { roundsPlayed: Math.max(0, roundsPlayed), sealRoundWins: this.wins.seal, terroristRoundWins: this.wins.terrorist } });
  }

  /** SVC-12d: a seat as the match's result carries it -- SVC-12a's match block from the room's counters. */
  private matchSeat(p: Player, account: number): RoomMatchSeat {
    return {
      account, side: p.team, joinedInProgress: p.joinedInProgress, playedMs: p.playedMs,
      roundsWon: p.roundsWon, roundsLost: p.roundsLost, roundsDrawn: p.roundsDrawn,
      block: {
        headShots: p.headshots, hits: p.shotsHit, shots: p.shotsFired, kills: p.kills, deaths: p.deaths, suicides: p.suicides,
        teamKills: p.teamKills, escorteesKilled: p.escorteesKilled, escorteesBroughtOut: p.hostagesRescued,
        primaryObjectives: p.primaryObjs, bonusObjectives: p.bonusObjs, bombsDefused: p.bombsDefused, bombsPlanted: p.bombsPlanted,
        score: p.score,
      },
    };
  }

  /**
   * SVC-07 (`LEAVE_COST_OWNER`): the match's seats -- every seat there at its end, then each account that left it and is
   * not seated now, its match as it stood when it left (`stood`); an account that left and sat again (a new seat, its
   * counters from zero) has its kept match added to its seat's, its side, join mark and match the seat's.
   */
  private matchSeats(players: readonly Player[], accounts: ReadonlyMap<number, number>): RoomMatchSeat[] {
    const seats = players.map((p) => this.matchSeat(p, accounts.get(p.id)!));
    for (const l of this.matchLeavers) {
      const same = seats.find((x) => x.account === l.account);
      if (!same) { seats.push({ ...l, block: { ...l.block } }); continue; }   // the leaver's match as it stood (`stood`)
      same.playedMs += l.playedMs; same.roundsWon += l.roundsWon; same.roundsLost += l.roundsLost; same.roundsDrawn += l.roundsDrawn;
      for (const k of Object.keys(same.block) as (keyof RoomMatchSeat['block'])[]) same.block[k] += l.block[k];
    }
    return seats;
  }

  /**
   * SVC-12d (W22.R1; research 155 §4.1-§4.2): the results of the round just ended -- its `RoomRoundResult`, and at the
   * match's end its `RoomMatchResult` first, then the round's (the original's order: the fold in the exit state's enter,
   * `FUN_00223970` D:L76078-76082, the rating in its leave, `FUN_002232a0` D:L75798-75805) -- or none when the room is
   * not a game's (`handOver` absent) or a seat, a player's or a watcher's, names no account (research 155 §4.1).
   */
  private handOverOf(winner: Team | null, matchOver: boolean, emptied: boolean): HandOver[] | undefined {
    const source = this.opts.handOver;
    if (!source) return undefined;
    const accounts = new Map<number, number>();
    for (const id of [...this.players.keys(), ...this.lobby.spectators().map((m) => m.id)]) {
      const account = source.accountOf(id);
      if (account === null) return undefined;
      accounts.set(id, account);
    }
    const match: MatchId = { room: source.roomId, serial: this.matchSerial, startedAt: this.matchStartedAt };
    const respawn = this.opts.rules === 'respawn';
    const players = [...this.players.values()];
    const round = roundResultOf({
      match, round: this.round, respawn, emptied, wins: { ...this.wins }, winner,
      seats: players.map((p) => this.ratingSeat(p, accounts.get(p.id)!)), leavers: this.roundLeavers,
    });
    if (!matchOver || emptied) return [round];
    const final: RoomMatchResult = {
      kind: 'match', match, gameType: this.map.gameType ?? 0, respawn, roundsPlayed: this.round,
      sealRoundWins: this.wins.seal, terroristRoundWins: this.wins.terrorist,
      seats: this.matchSeats(players, accounts),
    };
    return [final, round];
  }

  /**
   * PF-26 (research 216): every seat's match counters, by its id, for `roundOver` (GAME COMPLETE's YOUR STATS,
   * `FUN_00225a00` D:L76886-76933); PF-14 (research 214 s5) the primary and bonus objectives `scoreObjective` counted.
   */
  private statsOf(): Record<number, MatchStats> {
    const out: Record<number, MatchStats> = {};
    for (const p of this.players.values()) out[p.id] = countersOf(p, this.extraction !== null);
    return out;
  }

  /**
   * HX-5 (`PRIMARY_OBJECTIVE_READING`, `FUN_00224d10` D:L76467's EXTRACTION arm): at a round's end, +1 primary objective
   * to each living SEAL when the SEALs' brought out this round, every SEAL's summed, is above 1, and to each living
   * Terrorist when no SEAL is alive.
   */
  private hostagePrimaryObjectives(): void {
    let sealsAlive = 0, broughtOut = 0;
    for (const p of this.players.values()) if (p.team === 'seal') { broughtOut += p.roundRescued; if (p.alive) sealsAlive++; }
    for (const p of this.players.values()) {
      if (p.alive && (p.team === 'seal' ? broughtOut > 1 : sealsAlive === 0)) p.primaryObjs++;
    }
  }

  /**
   * PF-26, HIT_COUNT_READING (research 216; PF.R20): a round the room took and resolved is a shot (+0x54c) -- a
   * shotgun's shell once whatever its rays (`first`: the volley's opening ray), a launched round once, a rocket once
   * (`launchRound`, `launchRocket`); a shot whose ray met a living player's body the room did not refuse -- an enemy's,
   * friendly fire being off (W3.R11), and within the weapon's reach (counted after `bulletDamage` / `pelletDamage`) --
   * is a hit (+0x548), once a shell; a launched round's or a rocket's direct hit on one (`directHit`, `flight`) once a
   * flight. The original's writers of the round block's +0x590 / +0x594 were not traced (only the ratio's,
   * `FUN_00223970` D:L76064-76069). A blast counts neither.
   */
  private countShot(p: Player, first: boolean, met: Player | undefined, flight = false, part = -1): void {
    if (first) { p.shotsFired++; p.shellHit = false; p.signals.shots++; }
    if (!met?.alive || met.team === p.team) return;
    if (!flight && p.shellHit) return;
    p.shotsHit++;                                                // a launched round's or a rocket's own body, once a flight;
    if (!flight) p.shellHit = true;                              // a shell's first hit, once a shell
    // SVC-12d (SVC-23b's signals): the hit by the part met (`PART`), -1 a shell's (its pellets meet several).
    p.signals.hits++;
    p.signals.hitsByPart[part] = (p.signals.hitsByPart[part] ?? 0) + 1;
  }

  // ---- the vote to remove (W3.R13, research 91 section 17) ----
  //
  // SVC-23d (2026-10-10; research 263 section 5.2): read rule by rule against the original -- every rule kept but the
  // point, changed; a reading, pending review; the recomp's vote run and ONL-32 are the proven level, not claimed.
  // - Who votes: a player, living or dead, never a spectator -- the vote is in the online player's TCM only
  //   (`FUN_00232bc0` D:L83575-83640, the row under TEAMMATES > PLAYER n D:L83607-83631; a spectator's TCM has RADIO only,
  //   D:L83641-83644). No life test on its path (AD-10, research 227 §2.9): TEAMMATES carries no enable (D:L83793), the
  //   row's enable `FUN_0022f440` D:L81384-81396 asks a teammate selected, the toggle `FUN_0022f3c0` D:L81363-81370, the
  //   target's count `FUN_002ba040` D:L159762-159767 (the send `FUN_0030cef0` between them untraced). Was: "alive", on a
  //   misread of `FUN_0022f810`, which gates the NODEACTION ROOT, TAUNTS and RADIO roots. Here: a seat in `players` (a
  //   spectator has none).
  // - On whom: another player of the voter's side, not a spectator (`FUN_0022f5b0` D:L81460-81463, the menu's
  //   PLAYER 1..8). Here: a vote on oneself, on the other side or on a spectator is ignored (nothing sent, nothing kept).
  // - The toggle: the voter's flag flipped and its new state sent to the target's console only (`FUN_0022f3c0`
  //   D:L81365-81369; the "Voter" message, `FUN_002ba140` D:L159798). Here: the page sends the state (`remove`).
  // - Who counts: the target's console sets the voter's flag (`FUN_002c3a20`) and counts every set flag
  //   (`FUN_002c3920`), telling its player "Voting: You have %d votes against you." (S:0x3f26c0; `FUN_002ba040`
  //   D:L159763-159766). Here the server counts (OT.R27: the network ours, the look the original's) and tells the
  //   target `votes`. It counts a voter only while on the target's side; the original's count has no side test, its
  //   flag set by a teammate only -- whether a side switch (here only before the launch) clears it is not read.
  // - The threshold: more votes than half the target's side, the target counted -- `votes > side / 2.0`
  //   (`FUN_002c3550` D:L165002, D:L165078, both sides alike): 8 -> 5, 6 -> 4, 4 -> 3, 3 -> 2, 2 -> never; a tie fails.
  //   VOTE_HUMAN_SEATS_ADAPTATION (VOTE-LOG; the original has no online bots): `side` is the side's human seats, the
  //   target counted; a CPU target never passes. With no CPU on the side the count is the original's.
  // - The log (VOTE-LOG, Trello d3xR0sr2; a host instrument, no original, as the `[gate]` line): one `[vote]` line per
  //   vote cast or withdrawn, per vote ignored and per kick, keyed by the game's id (`handOver.roomId`, central's), the
  //   seats named by their JSON-quoted lobby names and ids -- never an address (`addresses` is the ban's only).
  // - No expiry, cooldown or prompt: a standing flag until retracted or its voter leaves (the leaver's slot record
  //   freed, `FUN_002c5750` D:L166323-166324; a joiner's flags cleared, `FUN_002c5830` D:L166376-166377). Here `drop`
  //   forgets the leaver's votes and those on it.
  // - When (R4B-08, OT.R97; research 379 §2): VOTE_KICK_AT_ONCE_READING -- r0004 removes the target on the vote that
  //   passes, mid-round (r4 0x2bbc8c; `vote` -> `removeVoted`); and, as in r0001, VOTE_KICK_POINT_READING -- as ROUND
  //   COMPLETE starts, or GAME COMPLETE after a match's last round, never FINAL ROUND (the screens' `ExitOnStart`;
  //   `voteKickAt`), which now catches a majority no vote's receipt made. r0001, superseded: that screen only. Changed
  //   before (SVC-23d): the room applied them at the result itself,
  //   3 s (13 s at a match's end) early. The removed: `kicked` 'vote' and the close 4002, which the page routes to UIMn
  //   #539's `dlgNetBanned.rdr` (`GAME_KICKED_DIALOG_READING`, `netPage.ts`; `MATCH_KICKED_DIALOG`, `lobbyMatch.ts`);
  //   the script's 0.5 s before it, and the screen's 539/541/540 and its 4 s, are the page's, not built here.
  // - The rejoin: the victim's console asks the ban itself -- `BanSelfFromGame` (`FUN_00278d30` D:L123707) sends
  //   MediusBanPlayer with its own account, 120 (unit not read) and the game's world (`FUN_002f95f0`
  //   D:L197800-197804) -- and the server refuses "that game" (-972, `FUN_002edba0` D:L190430). SVC-23e (research 264
  //   section 4): `applyVotes` tells `onRemoved` the removed seat, and the bridge's game rooms have the lobby answer
  //   that account's JoinGame to that game -972 (`RoomService.banFromGame`, for the game's life:
  //   GAME_BAN_LIFE_PLACEHOLDER). Beside it the room refuses the address, for VOTE_BAN_SCOPE_PLACEHOLDER's 10 minutes
  //   (H-next d), unchanged.
  // - Not here: the "Alert" each vote broadcasts (D:L159770-159780; its purpose not traced). The spectators' eject,
  //   VOTE ALL, is the next block's.

  /** Voter -> the teammates it votes to remove. */
  private readonly votes = new Map<number, Set<number>>();
  /** The tick the passed votes are applied at: VOTE_KICK_POINT_READING's screen's start after the last result, or null. */
  private voteKickAt: number | null = null;
  /**
   * Addresses refused a rejoin, until when (ms). The original refuses a rejoin to "that game" (research 91 section 17);
   * a dedicated room is never over, so VOTE_BAN_SCOPE_PLACEHOLDER: 10 minutes, two of the original's matches.
   */
  private readonly banned = new Map<string, number>();
  /** Each connection's last frame, the clock's milliseconds: a watcher's idle clock (`idle`). */
  private readonly heard = new Map<number, number>();
  private watcherIdle = 0;
  private readonly addresses = new Map<number, string>();

  private vote(id: number, target: number, remove: boolean): void {
    const p = this.players.get(id), t = this.players.get(target);
    // A player, living or dead, on a teammate (`FUN_0022f3c0`); each refusal one `[vote] ignored` line (VOTE-LOG).
    const why = !p || !t ? 'no-player' : p === t ? 'self' : p.team !== t.team ? 'other-side' : null;
    if (why !== null || !p || !t) { this.voteLog(`ignored voter=#${id} target=#${target} why=${why}`); return; }
    const mine = this.votes.get(id) ?? new Set<number>();
    if (remove) mine.add(target); else mine.delete(target);
    this.votes.set(id, mine);
    const tally = this.voteTally(target)!;
    this.send(target, { type: 'votes', count: tally.against });
    this.voteLog(`voter=${this.seatName(id)} target=${this.seatName(target)} side=${VOTE_SIDE[t.team]} remove=${remove ? 1 : 0}`
      + ` against=${tally.against} need=${tally.need ?? 'never'} humans=${tally.humans} seats=${tally.seats}`);
    // R4B-08: VOTE_KICK_AT_ONCE_READING -- r0004 tests the pass on every Voter received (r4 0x2bbc84) and acts on it
    // (0x2bbc8c); r0001 dropped the result (D:L159767).
    if (tally.passes) this.removeVoted(target, 'vote', tally);
  }

  /** VOTE-LOG: one `[vote]` line, keyed by the game's id (central's, `handOver.roomId`; `-` a room with none). */
  private voteLog(line: string): void {
    console.info(`[vote] game=${this.opts.handOver?.roomId ?? '-'} ${line}`);
  }

  /**
   * VOTE-LOG: a seat named as `"<lobby name>"#<id>` -- never its address. The name JSON-quoted (the review's F1): an
   * account's name may hold spaces, `=`, `#`, `"` and a backslash, and raw it could forge a key (`a kicked=B`).
   */
  private seatName(id: number): string {
    return `${JSON.stringify(this.lobby.member(id)?.name ?? '')}#${id}`;
  }

  private votesAgainst(target: number): number {
    const t = this.players.get(target);
    if (!t) return 0;
    let n = 0;
    for (const [voter, set] of this.votes) if (set.has(target) && this.players.get(voter)?.team === t.team) n++;
    return n;
  }

  /**
   * `FUN_002c3550` D:L165002 / D:L165078: passed when the votes exceed half the target's team, the target counted (the
   * original's). VOTE_HUMAN_SEATS_ADAPTATION: the team's human seats only (`humans`); a CPU target never passes
   * (`need` null). `seats` (every seat of the side) is the log's, the threshold's old input.
   */
  private voteTally(target: number): { against: number; need: number | null; humans: number; seats: number; passes: boolean } | null {
    const t = this.players.get(target);
    if (!t) return null;
    const side = [...this.players.values()].filter((q) => q.team === t.team);
    const humans = side.filter((q) => this.conns.get(q.id)?.cpu !== true).length;
    const against = this.votesAgainst(target);
    const need = this.conns.get(target)?.cpu === true ? null : Math.floor(humans / 2) + 1;
    return { against, need, humans, seats: side.length, passes: need !== null && against > humans / 2 };
  }

  /** The pass test (`FUN_002c3550`), over `voteTally`. */
  private votePasses(target: number): boolean {
    return this.voteTally(target)?.passes === true;
  }

  /**
   * The passed votes remove their targets, the side and the votes counted now (research 179 section 6.5): at the start
   * of VOTE_KICK_POINT_READING's screen (`voteKickAt`, set by `endRound`, run by `clock`).
   */
  private applyVotes(): void {
    // VOTE-LOG (the review's F2): each target's tally taken with the pass, before any removal changes the side or the votes.
    const out = [...this.players.keys()].filter((id) => this.votePasses(id)).map((id) => ({ id, tally: this.voteTally(id)! }));
    for (const { id, tally } of out) this.removeVoted(id, 'round-complete', tally);
  }

  /**
   * A passed vote's target removed: its address refused (VOTE_BAN_SCOPE_PLACEHOLDER), the room's owner told
   * (`onRemoved`), `kicked` 'vote' and the close 4002 -- at the screen's start (`applyVotes`) or, R4B-08, at the deciding
   * vote (`vote`, VOTE_KICK_AT_ONCE_READING). VOTE-LOG: one `[vote] kicked` line with `tally`, the count that passed it,
   * taken by the caller before any removal (`at`: `round-complete` covers GAME COMPLETE's start too, both
   * VOTE_KICK_POINT_READING's screens).
   */
  private removeVoted(id: number, at: 'vote' | 'round-complete', tally: { against: number; need: number | null }): void {
    const t = this.players.get(id);
    this.voteLog(`kicked=${this.seatName(id)} side=${t ? VOTE_SIDE[t.team] : '-'} against=${tally.against} need=${tally.need ?? 'never'} at=${at}`);
    const address = this.addresses.get(id);
    if (address) this.banned.set(address, this.opts.now() + VOTE_BAN_MS);
    this.opts.onRemoved?.(id);                                     // SVC-23e: the account's -972 for that game (the bridge's)
    this.send(id, { type: 'kicked', reason: 'vote' });
    const conn = this.conns.get(id);
    this.leave(id);
    conn?.close(4002, 'YOU HAVE BEEN KICKED FROM THIS GAME');
  }

  // ---- VOTE ALL, the spectators' eject (research 91 section 17 1.1; SVC-23e, research 264 section 4) ----
  //
  // A reading, pending review; the recomp's vote run and ONL-32 are the proven level, not claimed.
  // - Who votes: a player, living or dead, never a spectator -- "VOTE ALL ON:OFF" is under the online player's TCM
  //   SPECTATORS (`FUN_00232bc0` D:L83632-83633, bound D:L83805; the spectator's TCM has RADIO only, D:L83641-83644).
  //   No life test on its path (AD-10, research 227 §2.9): SPECTATORS carries no enable (D:L83794), its row's
  //   `FUN_0022f210` D:L81293-81313 asks a spectator present, its handler `FUN_0022f0f0` D:L81263-81277 (the send
  //   `FUN_0030cef0` untraced). Was: "alive", on a misread of `FUN_0022f810`. Here: a seat in `players`; else ignored.
  // - The toggle: VOTE_ALL_LINE_PER_SPECTATOR_READING -- one "Spec Vote" per spectator present whose mark differs, each
  //   to every console; none with no spectator present. The page sends the state (`on`), as for the team vote.
  // - Who counts: every console sets the voter's flag (+0x4a, `FUN_002c2f50`) and counts every set flag (`FUN_002c2ef0`
  //   D:L164547-164574), printing " %s voting against spectators: %d votes against." or " %s voting for spectators: %d
  //   votes against." (S:0x3f25e0 / S:0x3f2620, the leading space theirs; D:L159591-159597). Here the room counts and
  //   sends `spectatorVote` to every connection, which the page formats (`spectatorVoteText`) -- the path of the team
  //   vote's line (`votes`, which the page formats; the drawing of both is the page's).
  // - The decision: the host's, at every Spec Vote, a retraction's too: votes > VOTE_ALL_SHARE x (SEALs + Terrorists)
  //   (`FUN_002c2e30`; D:L159598). Here the room decides on the host's behalf -- a labelled adaptation (the server
  //   counts, OT.R27, as for the team vote): a game room's host and a dedicated room, which has none, alike.
  // - The eject: the host broadcasts "Reject" (D:L159600); every console prints "Spectators EJECTED from this game."
  //   (D:L159601; `FUN_002b9d80` D:L159625), sets MaxSpectatorsValve to 0 (D:L159602-159606; D:L159626-159630) and, a
  //   spectator, opens dlgNetBanned.rdr (D:L159607-159610; D:L159631-159634). Here: `spectatorsEjected` to every
  //   connection; each spectator `kicked` 'vote' and closed 4002, as the team vote's removed are (the page routes both to
  //   #539's dlgNetBanned.rdr -- the page's part); no address ban and no `onRemoved` (no BanSelfFromGame on this path);
  //   a later spectator refused TOO_MANY_SPECTATORS for the room's life (`hello`).
  // - No expiry: a standing flag until retracted or its voter leaves (`drop`; the slot record freed, `FUN_002c5750`).
  // - Not here: the game list's spectator slots after the eject -- the host's GameStats byte 4 reads the valve
  //   (`FUN_002f7c40` D:L196730-196731); the bridge's report keeps the created slots (VOTE_ALL_LISTED_SLOTS_PLACEHOLDER).

  /** VOTE ALL: the players whose vote against the spectators stands (every console's +0x4a on the voter's slot). */
  private readonly votesAll = new Set<number>();
  /** VOTE ALL: voter -> the spectators its toggle passed over (its console's +0x49 on each spectator's slot record). */
  private readonly voteAllMarks = new Map<number, Set<number>>();
  /** MaxSpectatorsValve 0: set by the eject, for the room's life. */
  private spectatorsShut = false;

  /** VOTE ALL ejected the spectators (MaxSpectatorsValve 0): a later spectator is refused (`hello`). */
  get spectatorsEjected(): boolean { return this.spectatorsShut; }

  private voteAll(id: number, on: boolean): void {
    const p = this.players.get(id), m = this.lobby.member(id);
    if (!p || !m || m.role !== 'player') return;      // a player, living or dead (`FUN_0022f0f0`: no life test)
    const marks = this.voteAllMarks.get(id) ?? new Set<number>();
    this.voteAllMarks.set(id, marks);
    // VOTE_ALL_LINE_PER_SPECTATOR_READING: the spectators present whose mark differs, each marked, each a Spec Vote.
    const over = this.lobby.spectators().map((s) => s.id).filter((s) => marks.has(s) !== on);
    for (const s of over) { if (on) marks.add(s); else marks.delete(s); }
    for (let i = 0; i < over.length; i++) {
      if (on) this.votesAll.add(id); else this.votesAll.delete(id);
      const count = this.votesAll.size;
      this.broadcast({ type: 'spectatorVote', name: m.name, against: on, count });
      if (VOTE_ALL_SHARE * this.players.size < count) this.ejectSpectators();   // the host's test (`FUN_002c2e30`)
    }
  }

  /** The eject: "Reject" -- the line to every connection, MaxSpectatorsValve 0, each spectator removed. */
  private ejectSpectators(): void {
    this.spectatorsShut = true;
    this.broadcast({ type: 'spectatorsEjected' });
    for (const s of [...this.lobby.spectators()]) {
      const conn = this.conns.get(s.id);
      this.send(s.id, { type: 'kicked', reason: 'vote' });
      this.leave(s.id);
      conn?.close(4002, 'YOU HAVE BEEN KICKED FROM THIS GAME');
    }
  }

  /**
   * CLAN-TAG-ROUND (research 275 §2.1): each seat's clan tag as the bridge told it at the seat (`tellClan`), the
   * published player state's +0x2e (`FUN_002c5450` D:L166281-166293); a seat with none has no entry. Dropped with the seat.
   */
  private readonly clans = new Map<number, string>();

  /**
   * CLAN-TAG-ROUND (research 275 §2.1; `CLAN_TAG_AT_SEAT_READING`): a seat's clan tag, the server's (the bridge reads the
   * account's at the seat, as SEAT-TOLD's pairs) -- never a page's: it is no `ClientEvent`. Kept for a member of the room
   * ('' forgets it); a change to a player's row is the rows' change, sent with the next coalesced score (MEDIUM-3).
   * AD-13 (research 275 §5): every change, a player's or a watcher's, is told as the room's whole set (`tellClans`); an
   * unchanged tag (an untagged seat's '') sends the seat alone the set -- an empty one too (the review's F1: a re-attach
   * on a freed id must clear the tags its page kept through the drop) -- as its own seat's first word of the others'.
   */
  tellClan(id: number, clan: string): void {
    if (this.lobby.member(id) === undefined) return;
    if ((this.clans.get(id) ?? '') === clan) { this.send(id, this.clansEvent()); return; }
    if (clan === '') this.clans.delete(id);
    else this.clans.set(id, clan);
    if (this.players.has(id)) this.scoreDirty = true;
    this.tellClans();
  }

  /**
   * AD-13 (research 275 §5; the clans' finish, wave 6b): the room's one transport for the tag of the account each seat
   * holds -- `seatClans`, the whole set, players' and watchers' alike (the original writes a watcher's +0x2e as a player's,
   * `FUN_002c5450` D:L166281-166293; read by the other spectators' speaker line, `FUN_00238ac0` D:L85680-85690, and the
   * game lobby's lists and bar, `FUN_002c5010` D:L166107-166151, `FUN_0027cbf0` D:L125668-125677) -- to every connection
   * and into the recording (`broadcast`). Not a field on the score and no row made for a watcher.
   */
  private tellClans(): void {
    this.broadcast(this.clansEvent());
  }

  private clansEvent(): ServerEvent {
    return { type: 'seatClans', seats: [...this.clans].map(([id, clan]) => ({ id, clan })) };
  }

  /**
   * SVC-07c SEAT-TOLD (research 264 §2; research 155 §2.3, §4.1, §4.4): each seat's rating and medal after a round's
   * result is applied and at a seat's join, as the bridge names them by seat (`GameBridge.seatsTold`, its join
   * refresh) -- one `seatTold` to every connection, players and spectators alike, as every console holds
   * every player's state (its +0x42 medal and +8 rating, `FUN_002c5360` D:L166200-166201, D:L166208-166209), and into
   * the recording (`broadcast`). A
   * seat no longer in the room is named in none; with none left, nothing is sent. The timing is the server's
   * (`SEAT_TOLD_BETWEEN_ROUNDS_READING`). No page can send it: it is no `ClientEvent` (research 169 §4).
   */
  tellRatings(seats: readonly { id: number; rating: number; medal: number }[]): void {
    const told = seats.filter((s) => this.lobby.member(s.id) !== undefined).map((s) => ({ id: s.id, rating: s.rating, medal: s.medal }));
    if (told.length > 0) this.broadcast({ type: 'seatTold', seats: told });
  }

  /** SVC-07c (the review's 3): the match in this room now -- its serial and start, as a result's `MatchId` names them. */
  currentMatch(): { serial: number; startedAt: number } {
    return { serial: this.matchSerial, startedAt: this.matchStartedAt };
  }

  /** Seconds left in the round, or null between rounds (and in a classic room waiting for its match). */
  timeLeft(): number | null {
    const st = this.state;
    if (st.phase !== 'play' && st.phase !== 'decided') return null;
    return this.clockHeldS ?? Math.max(0, (st.endsAt - this.tick) / TICK_HZ);   // LATER 152: held at the defuse
  }

  /**
   * PT195-4: fold one measured round trip into this seat's scoreboard ping. Null when the seat is not a player here,
   * or the sample is not a round trip (`pingSampleMs`).
   */
  noteRoundTrip(id: number, sampleMs: number): number | null {
    const p = this.players.get(id);
    if (!p || pingSampleMs(sampleMs) === null) return null;
    p.rttRound.push(sampleMs);                                   // NCW-1: the round's raw samples (an instrument)
    if (p.rttRound.length > RTT_SAMPLES_MAX_ADAPTATION) p.rttRound.shift();
    p.rttLast = sampleMs;
    p.pingExact = smoothPing(p.pingExact, sampleMs);
    p.ping = pingRowMs(p.pingExact);
    return p.ping;
  }

  /**
   * NCW-7 (`PING_SCORE_RESEND_MS_ADAPTATION`): once a heartbeat sweep, after the previous sweep's pongs are folded
   * (`noteRoundTrip`), mark the board changed when any seat's shown ping moved by the threshold from the value its
   * rows last broadcast to the room carried (`pingSent`, set by `broadcast`), or has its first reading. True when it
   * marked. A room with no players marks nothing.
   */
  notePingSweep(): boolean {
    const ps = [...this.players.values()];
    if (!ps.some((p) => (p.pingSent === 0 && p.ping > 0) || Math.abs(p.ping - p.pingSent) >= PING_SCORE_RESEND_MS_ADAPTATION)) return false;
    this.scoreDirty = true;
    return true;
  }

  scoreEvent(): ServerEvent {
    const rows: ScoreRow[] = [...this.players.values()].map((p) => ({
      id: p.id, name: this.lobby.member(p.id)?.name ?? '', team: p.team, kills: p.kills, deaths: p.deaths, score: p.score,
      alive: p.alive, ping: p.ping, ...this.botMark(p.id),
      roundKills: p.roundKills, roundDeaths: p.roundDeaths, roundScore: p.roundScore,   // the round block (additive): the round lists
      ...(this.clans.has(p.id) ? { clan: this.clans.get(p.id)! } : {}),   // CLAN-TAG-ROUND: additive (research 275 §2.1)
    }));
    const timeLeft = this.timeLeft();
    return {
      type: 'score', rows, timeLeft, spectators: this.lobby.spectators().map((m) => m.name), wins: { ...this.wins },
      teamScore: { ...this.teamScore },                          // PF-14: additive (TEAM_SCORE_READING)
      ...(this.clockHeldS !== null && timeLeft !== null ? { clockHeld: true as const } : {}),   // LATER 152: additive; never on a clockless score (the review's F1)
    };
  }

  // ---- the voice relay (web sprint 20, SVC-20b-relay; research 225 §4) ----

  /**
   * A voice frame (W20.R1, R2): the room relays it only from the holder of its own channel's floor entry to that
   * channel's other members, and keeps nothing (constraint 5: no `broadcast`, no `opts.recorder`). In order: the
   * connection is heard (W20.R8: the watcher's clock, `idle`), never `lastActive` (W20.R13); a malformed frame is dropped
   * (true); the caps, per connection (constraint 4) -- over `VOICE_FRAME_BYTES_MAX_PLACEHOLDER` a strike (false); no token
   * in its bucket (`VOICE_FRAMES_PER_S_PLACEHOLDER`, `VOICE_FRAMES_BURST_PLACEHOLDER`) dropped and counted (true;
   * NET-RES-2e, was a strike); a sender that
   * does not hold its channel's entry is dropped (true); else the room's frame, its speaker the connection's id, goes to
   * every member whose channel hears the sender's (`hears`: equal, never 11), the sender aside, by the lossy send.
   */
  private voiceFrame(id: number, bytes: Uint8Array): boolean {
    if (!this.conns.has(id)) return true;
    const now = this.opts.now();
    this.heard.set(id, now);
    const counts = this.voiceTalker(id);                          // VOICE-LATE-3: what reached the relay, and its outcome
    counts.received++;
    const up = decodeVoiceUp(bytes), seat = this.voice.get(id);
    if (!up || !seat) { counts.bad++; return true; }
    if (bytes.byteLength > VOICE_FRAME_BYTES_MAX_PLACEHOLDER) { counts.bad++; return false; }
    seat.tokens = Math.min(VOICE_FRAMES_BURST_PLACEHOLDER, seat.tokens + ((now - seat.at) / 1000) * VOICE_FRAMES_PER_S_PLACEHOLDER);
    seat.at = now;
    // NET-RES-2e (NET-RES.R10): past the bucket, dropped and counted, no strike -- every voice frame already counts against
    // the socket's binary rate and its bank (`server.ts` `RATE_BANK_ADAPTATION`), which bound a flood; the bucket bounds the
    // relay. A stall's flushed talk is so dropped, not a 4005.
    if (seat.tokens < 1) { this.voiceDrops.bucket++; counts.bucket++; return true; }   // VOICE-LATE: counted (`takeVoiceDrops`)
    seat.tokens -= 1;
    if (this.voiceFloor.holder(seat.channel)?.owner !== id) { counts.floor++; return true; }
    counts.relayed++;
    const down = encodeVoiceDown({ speaker: id, seq: up.seq, packets: up.packets });
    for (const [to, other] of this.voice) {
      if (to === id || !hears(other.channel, seat.channel)) continue;
      const conn = this.conns.get(to);
      if (!conn) continue;
      if (conn.sendLossy) {
        if (conn.sendLossy(down) === 'skipped') { this.voiceDrops.skipped++; counts.skipped++; } else counts.sends++;
      } else { conn.send(down); counts.sends++; }
    }
    return true;
  }

  /** VOICE-LATE-3: `id`'s line of `voiceCounts`, made at his first frame. */
  private voiceTalker(id: number): VoiceTalkerCounts {
    let c = this.voiceTalkers.get(id);
    if (!c) { c = { received: 0, bad: 0, bucket: 0, floor: 0, relayed: 0, sends: 0, skipped: 0 }; this.voiceTalkers.set(id, c); }
    return c;
  }

  /** The page's talk on / off (constraint 4: the original's types 1 and 2, `FUN_0030e8e0` D:L210896-210964) on its own channel. */
  private voiceTalk(id: number, on: boolean): void {
    const seat = this.voice.get(id);
    if (!seat) return;
    const now = this.opts.now();
    this.voiceTell({ changed: on ? this.voiceFloor.talkOn(id, seat.channel, now) : this.voiceFloor.talkOff(id, now), moved: new Set() });
  }

  /**
   * The radio (research 225 §5): RADIO OFF sets 11 (`FUN_0030e490` D:L210680, the flag cleared D:L210683); RADIO ON asks
   * 0, 10 for a spectator (`FUN_0022f880` D:L81543); the ACTIVE CHANNEL asks 0, 1 or 2 (validated 0..2 as
   * `FUN_0022f950` does, D:L81576-81592, W20.R4) and is remembered (`+0xc4`) only when the base reached stays 0..2. Anything else, and any of them in the game lobby
   * (the radio is the round's HUD, not drawn there) or from a seat in its ARMORY (on 11 until it leaves), is dropped --
   * but for the game lobby's ARMORY, whose two events the page carries as `voiceRadio` (`voiceLobbyArmory`).
   */
  private voiceRadio(id: number, ev: Record<string, unknown>): void {
    const seat = this.voice.get(id);
    if (!seat || this.players.get(id)?.arming) return;
    // LATER 85 (the narrow re-read's 1): a seat awaiting its load sits in its game lobby, whose ARMORY's return asks no
    // round channel -- it re-asks the channel it left (its last base), never the living team's; the entry is RADIO OFF's.
    if (ev.on === true && ev.active === undefined && this.state.phase !== 'waiting' && this.players.get(id)?.awaitingLoad) {
      if (seat.radioOff) {
        const back: VoiceNews = { changed: [], moved: new Set() };
        seat.radioOff = false;
        this.voiceAsk(id, null, back);
        this.voiceTell(back);
      }
      return;
    }
    if (this.state.phase === 'waiting') { this.voiceLobbyArmory(id, seat, ev); return; }
    const news: VoiceNews = { changed: [], moved: new Set() };
    if (typeof ev.on === 'boolean' && ev.active === undefined) {
      if (ev.on) this.voiceAsk(id, seat.spectator ? VOICE_CHANNEL_MAP_READING.spectators : VOICE_CHANNEL_MAP_READING.team, news);
      else { seat.radioOff = true; this.voiceAsk(id, null, news); }
    } else if (ev.on === undefined && (ev.active === 0 || ev.active === 1 || ev.active === 2)) {
      // `+0xc4` is kept only when the base the channel function reached is still 0..2 -- not a dead actor's 3 nor a
      // spectator's 10 (`FUN_0022f950` D:L81585-81588; the base `voice+0x2c` as `FUN_0030fcd0` stores it, D:L211584).
      const reached = this.voiceAsk(id, ev.active, news);
      if (reached === 0 || reached === 1 || reached === 2) seat.active = reached;
    } else return;
    this.voiceTell(news);
  }

  /**
   * The close review's F2 (W20.R12; research 225 §4.2, 227 §1): the game lobby's ARMORY, carried on the game socket.
   * The menu's lobby seat never sets `Player.arming` (the front end's match has no `armory` capability), so its page
   * sends the ARMORY's entry and exit as it sees the valve `GoneToArmory` go 1 and 0 (`GameLobbyVoice`), and in the
   * waiting phase -- where the radio is not drawn, so no other `voiceRadio` comes -- the room takes exactly these two:
   * `{on: false}`, the entry, from a seat not already off -- `InitializeOnlineArmory`'s `FUN_0027d8c0` clears the talk
   * flag (D:L126098) and sets RADIO OFF (`FUN_0030e490`, D:L126099): the seat on 11, a held talk ended, nothing heard
   * there -- and `{on: true}`, the return, only from that 11: the lobby's `FUN_0027c9f0` asks 9 again (D:L125568).
   * Anything else in the waiting phase is dropped, as before. The launch's ask (0) leaves the 11 as any ask does.
   */
  private voiceLobbyArmory(id: number, seat: VoiceSeat, ev: Record<string, unknown>): void {
    if (ev.active !== undefined || typeof ev.on !== 'boolean' || ev.on !== seat.radioOff) return;
    const news: VoiceNews = { changed: [], moved: new Set() };
    if (ev.on) this.voiceAsk(id, VOICE_CHANNEL_MAP_READING.lobby, news);
    else { seat.radioOff = true; this.voiceAsk(id, null, news); }
    this.voiceTell(news);
  }

  /**
   * A member's entry (its hello; a promotion or a demotion, `voiceRoles`): in the game lobby -- the waiting room, the
   * launch's load hold -- it asks 9 (`FUN_0027c9f0` D:L125568), past it `VOICE_JOIN_IN_PLAY_BASE_PLACEHOLDER`; a
   * spectator is put on 10 by the channel function, a seat in its ARMORY on 11.
   *
   * SVC-20c (research 225 §5.1): a seat made in a classic round in play -- the room's ghost (`seatsGhosts`) -- is the
   * original's late joiner (`VOICE_LATE_JOINER_SEAT_READING`): game `+0xcc` set by the join's reply to a game in progress
   * (`FUN_002b9150` D:L159282), so his own level start asks 3 instead of 0 (`FUN_001f6660` D:L55848-55849,
   * `VOICE_LATE_JOINER_READING`) -- on our server that start is this entry -- and the frame that clears `+0xcc`
   * (`FUN_001f5e70` D:L55716) sets the ghost flag `+0xd2` for a non-spectator (D:L55727; `VoiceSeat.ghost`).
   */
  private voiceEnter(id: number): void {
    let seat = this.voice.get(id);
    if (!seat) {
      const carried = this.voiceBuckets.get(id);              // a takeover's bucket, else a full one
      this.voiceBuckets.delete(id);
      seat = { base: VOICE_CHANNEL_MAP_READING.lobby, active: 0, radioOff: false, spectator: false, channel: -1, tokens: carried?.tokens ?? VOICE_FRAMES_BURST_PLACEHOLDER, at: carried?.at ?? this.opts.now(), ghost: false };
      this.voice.set(id, seat);
    }
    seat.spectator = this.lobby.member(id)?.role !== 'player';
    seat.ghost = !seat.spectator && this.seatsGhosts();
    const news: VoiceNews = { changed: [], moved: new Set() };
    this.voiceAsk(id, this.state.phase === 'waiting' ? VOICE_CHANNEL_MAP_READING.lobby
      : seat.ghost ? VOICE_LATE_JOINER_READING : VOICE_JOIN_IN_PLAY_BASE_PLACEHOLDER, news);
    this.voiceTell(news);
  }

  /**
   * OT.R59 (RECONNECT-GHOST; the review's F1): a resumed seat's new connection told its own channel's entry -- the
   * channel it holds and its floor's holder, as `voiceTell` tells a member -- with nothing asked or moved.
   */
  private voiceTold(id: number): void {
    const seat = this.voice.get(id);
    if (seat) this.send(id, { type: 'voiceFloor', channel: seat.channel, holder: this.voiceFloor.holder(seat.channel)?.owner ?? null });
    this.voiceMembersTold.delete(id);                             // AD-14: the new connection told its channel's count too
    this.voiceMembersTell();
  }

  /** A promotion or a demotion (ours, W3.R13's queue: the original has none) asks as an entry does. */
  private voiceRoles(): void {
    for (const [id, seat] of [...this.voice]) if ((this.lobby.member(id)?.role !== 'player') !== seat.spectator) this.voiceEnter(id);
  }

  /** Back from the ARMORY (`ready`): its remembered base asked again -- in the game lobby 9, the return's (`FUN_0027c9f0`). */
  private voiceReturn(id: number): void {
    const news: VoiceNews = { changed: [], moved: new Set() };
    this.voiceAsk(id, null, news);
    this.voiceTell(news);
  }

  /** Every member asks `base` (the lobby's return; the round's start, `voiceRoundStart`); told at once unless `tell` is false. */
  private voiceAskAll(base: VoiceAsk['base'], news: VoiceNews = { changed: [], moved: new Set() }, tell = true): void {
    for (const id of [...this.voice.keys()]) this.voiceAsk(id, base, news);
    if (tell) this.voiceTell(news);
  }

  /**
   * A round's start (research 225 §5, §5.1). `level`, the launch or a new match (`startRound(true)`): the level's start
   * (`FUN_001f6660` D:L55842-55846) -- every member asks 0 (a spectator is put on 10) and forgets its ACTIVE CHANNEL (the
   * level's 0x1f, `FUN_002b7d60` D:L158626-158631, which sets `+0xc4` to 0, D:L497717-497719). Any later round (no
   * level load between rounds, research 203 §11): the actors' rebuild sends 0x23 (`FUN_002a7d40` D:L75935 ->
   * `FUN_00553e60` D:L419395 -> `FUN_00597f50` D:L454601-454602), which asks the remembered `+0xc4` (D:L497733-497734); a
   * ghost's flag is cleared between rounds with a 0x1f (`FUN_002232a0` D:L75846-75849 -> `FUN_00543b90`
   * D:L410401-410403), so it asks 0 and forgets `+0xc4`. At the level's start only, every talk flag is then cleared --
   * even on the channel the member had (D:L55845) -- and the table (D:L55846). A later round clears neither
   * (`VOICE_ROUND_FLOOR_READING`, research 225 §5.1: `FUN_0030e7f0`'s only callers are the level's start and the host
   * handover, D:L161017): an ask that moves a member ends his hold (`setChannel`, `FUN_0030fcd0` D:L211589-211590), and a
   * holder whose channel does not move keeps it. Each member told its entry once. No seat is a late joiner here: the
   * original clears `+0xcc` in the late joiner's first round (D:L55716), whose own start asked his 3 (`voiceEnter`).
   */
  private voiceRoundStart(level: boolean): void {
    const news: VoiceNews = { changed: [], moved: new Set() };
    const now = this.opts.now();
    for (const [id, seat] of this.voice) {
      // LATER 85 (the re-read's voice finding): a seat this start passed by -- its console still loading, no body -- keeps
      // its late joiner's channel and ghost flag; its own level start is its load (`loaded`).
      // LATER 274: a ghost of this round -- its level's start asks 0 and its dead actor's step makes it the dead zone.
      if (this.players.get(id)?.ghostOfNextRound) {
        seat.ghost = true;
        seat.active = VOICE_CHANNEL_MAP_READING.team;
        this.voiceAsk(id, VOICE_CHANNEL_MAP_READING.team, news);
        continue;
      }
      if (this.players.get(id)?.awaitingLoad) continue;
      if (level || seat.ghost) seat.active = VOICE_CHANNEL_MAP_READING.team;
      seat.ghost = false;
      this.voiceAsk(id, seat.active, news);
    }
    if (level) {
      for (const id of this.voice.keys()) news.changed.push(...this.voiceFloor.talkOff(id, now));
      news.changed.push(...this.voiceFloor.clearAll());
    }
    this.voiceTell(news);
  }

  /**
   * SVC-20c, a death in a round (research 225 §5, §5.1): every online death of the player clears his talk flag, respawn
   * or not (the actor's death, `FUN_00547af0` D:L413092-413093; the review's F5). The OnDeath branch then asks the dead
   * zone only when the game has no respawn (game `+0xdc` 0) or the ghost flag `+0xd2` is set -- clearing the flag again
   * and sending event 0x22, which asks 3 (`FUN_005979a0` D:L454484-454492, the test D:L454485, the clear D:L454486;
   * `FUN_005e6e40` D:L497729-497730). Otherwise no channel is asked: the channel is kept (C3), the hold is not. The
   * room's "no respawn" is `opts.rules === 'classic'` (`VOICE_RESPAWN_RULE_READING`). The game lobby has no actor: a
   * death there asks nothing.
   */
  private voiceDeath(id: number): void {
    const seat = this.voice.get(id);
    if (!seat || this.state.phase === 'waiting') return;
    const news: VoiceNews = { changed: this.voiceFloor.talkOff(id, this.opts.now()), moved: new Set() };
    if (this.opts.rules === 'classic' || seat.ghost) this.voiceAsk(id, VOICE_CHANNEL_MAP_READING.deadZone, news);
    this.voiceTell(news);
  }

  /**
   * SVC-20c, a return to life in a round (research 225 §5): the respawn sends event 0x23 only while the ghost flag
   * `+0xd2` is clear (`FUN_00597f50` D:L454598-454603, the test D:L454601), and its handler asks the remembered ACTIVE
   * CHANNEL `+0xc4` (`FUN_005e6e40` D:L497732-497737; its 3 under `+0xd2`, D:L497737, is not reached from this sender) --
   * so a dead player who re-picked his radio (on 3 by the dead step) is back on his living channel (the relay review's
   * F1). A ghost's respawn asks nothing. The game lobby's own respawn (the classic waiting room's) asks nothing.
   */
  private voiceRespawn(id: number): void {
    const seat = this.voice.get(id);
    if (!seat || this.state.phase === 'waiting' || seat.ghost) return;
    const news: VoiceNews = { changed: [], moved: new Set() };
    this.voiceAsk(id, seat.active, news);
    this.voiceTell(news);
  }

  /**
   * One ask of the channel function (`FUN_002c2c20` through `channelOf`, then `FUN_0030fcd0` through `setChannel`):
   * `base` asked (null: the member's last base again), or 11 when the seat is in its ARMORY (`FUN_0027d8c0`) or its
   * radio is off (`FUN_0030e490`). The member is read as the function reads him now: a seat whose body lies dead in a
   * round (`Player.diedAt`, not yet respawned) is dead -- the dead step, D:L164432-164435; the game lobby has no actor
   * (`VOICE_DEAD_ACTOR_READING`, research 225 §5.1); a ghost (`VoiceSeat.ghost`) is read as a dead actor too. A death,
   * a respawn and a late joiner's entry ask through here (SVC-20c: `voiceDeath`, `voiceRespawn`, `voiceEnter`); a side
   * swap is the next ask's team. Returns the base reached after the dead and spectator steps (`voice+0x2c`,
   * D:L211584), or null on 11.
   */
  private voiceAsk(id: number, base: VoiceAsk['base'] | null, news: VoiceNews): number | null {
    const seat = this.voice.get(id);
    if (!seat) return null;
    if (base !== null) { seat.base = base; seat.radioOff = false; }
    const p = this.players.get(id), m = this.lobby.member(id);
    // A ghost counts as dead (the review's F2): whether the original's ghost actor has its alive bit is unread (225 §5.1).
    const actorDead = this.state.phase !== 'waiting' && (seat.ghost || (p !== undefined && !p.alive && p.diedAt >= 0));
    const off = p?.arming || seat.radioOff;
    const channel = off ? VOICE_CHANNEL_MAP_READING.radioOff : channelOf({
      base: seat.base, actorDead, spectator: seat.spectator,
      team: seat.spectator ? 'spectators' : m?.team === 'terrorist' ? 'terrorists' : 'seals',
    });
    news.changed.push(...this.voiceFloor.setChannel(id, channel, this.opts.now()));   // CLOSE-FIX-1 F1: a set that ends the flag starts its re-press window
    if (channel !== seat.channel) { seat.channel = channel; news.moved.add(id); }
    // The base after the dead and spectator steps, before the side bit (D:L164432-164440): `voiceRadio`'s `+0xc4` test.
    if (off) return null;
    return seat.spectator ? VOICE_CHANNEL_MAP_READING.spectators : actorDead ? VOICE_CHANNEL_MAP_READING.deadZone : seat.base;
  }

  /**
   * W20.R6: each member told its own channel's entry (the holder's id, or null) as a `send` -- never a broadcast -- when
   * it moved channel or its channel's entry changed. The original broadcast the twelve-entry table (R170.2). AD-14:
   * then each member's own channel's count (`voiceMembersTell`), after the entry that names the channel.
   */
  private voiceTell(news: VoiceNews): void {
    if (news.changed.length || news.moved.size) {
      const to = new Set(news.moved);
      if (news.changed.length) for (const [id, seat] of this.voice) if (news.changed.includes(seat.channel)) to.add(id);
      for (const id of to) {
        const seat = this.voice.get(id);
        if (seat) this.send(id, { type: 'voiceFloor', channel: seat.channel, holder: this.voiceFloor.holder(seat.channel)?.owner ?? null });
      }
    }
    this.voiceMembersTell();
  }

  /**
   * AD-14 (C92; research 227 §2.11): each member told its own voice channel's member count -- every member the room
   * holds on that channel (`VoiceSeat.channel`), itself included -- as a `send`, when its channel or that count changed
   * since it was last told (`voiceMembersTold`). The original's number beside the HUD's channel icon is `voice+0x5c`,
   * the network library's member count of the page's own channel: the voice tick (`FUN_0030ec10` D:L211004) asks it of
   * `FUN_00623ae8` (`FUN_006432c8` D:L556962-556990), which finds the channel among the library's (`FUN_0062bfd0` ->
   * `FUN_00611b08` D:L520677-520700, `FUN_00644c90` D:L558061-558095) and copies the count of its member collection
   * (`FUN_00624b88` D:L533720-533731, `FUN_0062a2e8` D:L537979-537983; a member added once,
   * `FUN_0062a218` D:L537919-537945, dropped by `FUN_0062a2f0` D:L537988-538010). A member is on one channel at a time
   * (`FUN_00611938` D:L520607-520640 leaves its last, then adds its own record, D:L520634 -> `FUN_00626658` D:L535027),
   * the page itself counted; radio off's 11 is joined as any channel (`FUN_0030e490` D:L210672-210681), so it counts
   * everyone on it; a departure drops the member (`FUN_00612138` D:L520999-521055). The original refreshed it at each
   * voice tick; the room tells it on the change.
   * A parked seat (OT.R59) keeps its channel, so it is counted, as it holds its entry; a member before its first ask
   * (channel -1) is neither counted nor told.
   */
  private voiceMembersTell(): void {
    const on = new Map<number, number>();
    for (const seat of this.voice.values()) if (seat.channel >= 0) on.set(seat.channel, (on.get(seat.channel) ?? 0) + 1);
    for (const [id, seat] of this.voice) {
      if (seat.channel < 0) continue;
      const members = on.get(seat.channel)!;
      const last = this.voiceMembersTold.get(id);
      if (last && last.channel === seat.channel && last.members === members) continue;
      this.voiceMembersTold.set(id, { channel: seat.channel, members });
      this.send(id, { type: 'voiceMembers', channel: seat.channel, members });
    }
  }

  // ---- the idle kick (W3.R13, IDLE_KICK_ADAPTATION) ----

  private idle(now: number): void {
    for (const p of [...this.players.values()]) {
      // Classic: the dead and the ghosts can only watch until the next round, so their idle clock waits.
      if (!p.alive && this.seatsGhosts()) { p.lastActive = now; continue; }
      if (now - p.lastActive < this.opts.idleKickMs) continue;
      const changes = this.lobby.demote(p.id);
      if (changes) {
        // PL-8: moved out to the back of the queue (W3.R13) -- a spectator now, told so (`demoted`, which its page turns
        // into the spectator's view and its client into a spectator's role); the others drop its body.
        this.players.delete(p.id);
        this.heard.set(p.id, now);                                // a watcher from now: its own idle time (below)
        this.broadcastChanges(changes.filter((c) => !(c.kind === 'queue' && c.id === p.id)));
        this.send(p.id, { type: 'demoted', position: this.lobby.queuePosition(p.id) });
        this.broadcast({ type: 'left', id: p.id }, p.id);
        continue;
      }
      this.send(p.id, { type: 'kicked', reason: 'idle' });
      const conn = this.conns.get(p.id);
      this.leave(p.id);
      conn?.close(4001, 'Kicked for inactivity.');
    }
    // Research 169 measure 8 (D9 (a)): a watcher -- a spectator place, the queue's included -- that has sent nothing at
    // all for the idle time is closed. It has no commands, so any frame is its sign of life; an honest page pings every
    // 2 s (`client.ts`), a socket that only answers the heartbeat's pings does not.
    for (const m of this.lobby.spectators()) {
      if (this.players.has(m.id)) continue;
      const heard = this.heard.get(m.id);
      if (heard === undefined) { this.heard.set(m.id, now); continue; }
      if (now - heard < this.opts.idleKickMs) continue;
      this.send(m.id, { type: 'kicked', reason: 'idle' });
      const conn = this.conns.get(m.id);
      this.leave(m.id);
      this.watcherIdle++;
      conn?.close(WATCHER_IDLE_CLOSE.code, WATCHER_IDLE_CLOSE.reason);
    }
  }

  /** The watchers closed idle since the last call (`MatchServer`'s limit counters). */
  takeWatcherIdle(): number {
    const n = this.watcherIdle;
    this.watcherIdle = 0;
    return n;
  }

  /**
   * VOICE-LATE (research 226 §3.2): the relay's voice drops since the server last asked -- `bucket`, a frame past its
   * sender's `VOICE_FRAMES_PER_S_PLACEHOLDER` bucket (no strike since NET-RES-2e); `skipped`, a frame not sent to a listener whose socket
   * held past `VOICE_BACKLOG_SKIP_PLACEHOLDER` -- or null when there were none; the count starts again. A playtest
   * instrument (no original), read once a second into `MatchServer`'s limit counters and its `voice` log line.
   */
  takeVoiceDrops(): { bucket: number; skipped: number } | null {
    const d = this.voiceDrops;
    if (d.bucket === 0 && d.skipped === 0) return null;
    this.voiceDrops = { bucket: 0, skipped: 0 };
    return d;
  }

  /**
   * VOICE-LATE-3 (research 226 §3.3; the owner's two-account test of 2026-10-12, whose `voice` lines counted no drop and
   * nothing received or relayed): each talker's voice frames at the relay, by member id, counted from the room's start
   * and never reset (the server takes the differences: its once-a-second `voice` line, a posted report's window). A
   * playtest instrument (no original); it changes nothing the relay does.
   */
  voiceCounts(): ReadonlyMap<number, Readonly<VoiceTalkerCounts>> {
    return this.voiceTalkers;
  }

  // ---- out ----

  /**
   * NU-3c (research 321 section 4.2.1): each seat's part health, as the original's other consoles hold it. Pass 1: each
   * byte (`partHealthBytes`, `FUN_002bd640` D:L161982-162034) is published when it differs from the last published and
   * its own last publication is `PART_HEALTH_INTERVAL_TICKS_READING` back (`FUN_0061a488` D:L526672-526674, D:L526693);
   * the first publication is whole. Pass 2: each connection is sent, one `health` event a seat, every seat's bytes it
   * does not hold yet that `healthTold` gives it (`TEAM_HEALTH_RECIPIENTS_ADAPTATION`: the seat's side and the
   * spectators), never its own seat's (its `hurt` holds them). Every connection here has its welcome: `hello` enters it
   * (`conns.set`) only past every refusal and sends the welcome in the same call, and `drop` takes it out. Sent, not
   * broadcast: a `.s2r` does not record it (no replay page reads it; research 321 section 4.2.1).
   */
  private tellHealth(): void {
    for (const p of this.players.values()) {
      const now = partHealthBytes(p.health);
      if (p.partBytes === null) { p.partBytes = now; p.partTold.fill(this.tick); continue; }
      let next: number[] | null = null;
      for (let i = 0; i < now.length; i++) {
        if (now[i] === p.partBytes[i] || this.tick - p.partTold[i]! < PART_HEALTH_INTERVAL_TICKS_READING) continue;
        (next ??= [...p.partBytes])[i] = now[i]!;
        p.partTold[i] = this.tick;
      }
      if (next) p.partBytes = next;
    }
    for (const [id, conn] of this.conns) {
      const me = this.players.get(id);
      let sent = this.healthSent.get(id);
      for (const s of this.players.values()) {
        if (s.id === id || s.partBytes === null || !healthTold(s.team, me ? me.team : null) || sent?.get(s.id) === s.partBytes) continue;
        if (!sent) this.healthSent.set(id, (sent = new Map()));
        sent.set(s.id, s.partBytes);
        const told = JSON.stringify({ type: 'health', id: s.id, parts: [...s.partBytes] } satisfies ServerEvent);
        conn.send(told);
        if (conn.cpu === true) botProfiler()?.cpuHealth(told.length);   // BOP-1: a CPU's received work, counted
      }
    }
  }

  private snapshots(): void {
    const bodies = new Map<number, BodyState>();
    for (const p of this.players.values()) if (!p.away) bodies.set(p.id, this.body(p));   // NET-RES-2b: a held seat away has none
    const list = [...bodies.values()];
    list.push(...this.extraction?.bodies() ?? []);              // HX-1: the hostages' bodies (ids from 240)
    const doorWire = this.doors.count ? this.doors.wire() : [];
    const gateWire = this.gates.count ? this.gates.wire() : [];
    // MAP-07: doors, then gates, one `DoorWire` array (protocol.ts `Snapshot.doors`). No version bump: the count is already a byte.
    const doors = doorWire.length + gateWire.length ? [...doorWire, ...gateWire] : undefined;
    const cranes = this.cranes.count ? this.cranes.wire() : undefined;
    // Protocol 10 (MAP-03): the world whole (never a delta: research 209 s8), the round epoch with it. Protocol 11
    // (NET-WIRE, OT.R38 / H118): named to a connection only when its revision or epoch differs from the one it was last
    // sent; the recorder's snapshot always has it (a replay seeks to any snapshot). Every connection, a spectator's too,
    // at the full `SNAPSHOT_HZ` (OT.R38: no interest filter, no slower spectator rate).
    const env = this.world.wireAll(this.roundSerial);
    if (this.extraction) this.opts.recorder?.hostages?.(this.tick, this.extraction.wire());   // RE-2 (W38.R2): the roster
    this.opts.recorder?.snapshot(this.tick, list, doors, env, cranes);
    for (const [id, conn] of this.conns) {
      const p = this.players.get(id);
      const own = p && p.alive ? (() => {
        const s = p.sim.walker.state;
        // Protocol 11: the facing after the acked command (the look gate's), which the page reconciles as the position.
        return { ack: p.sim.seq, x: s.x, y: s.y, z: s.z, vx: s.vx, vy: s.vy, vz: s.vz, facing: { yaw: s.yaw, pitch: s.pitch } };
      })() : null;
      const sent = this.envSent.get(id);
      const named: EnvWire | undefined = sent && sent.revision === env.revision && sent.epoch === env.epoch ? undefined : env;
      if (named) this.envSent.set(id, { revision: env.revision, epoch: env.epoch });
      const frame = encodeSnapshot({ tick: this.tick, own, bodies: p ? list.filter((b) => b.id !== id) : list, doors, ...(cranes && this.cranePages.has(id) ? { cranes } : {}), ...(named ? { env: named } : {}) }, this.feetOrigin);
      conn.send(frame);
      if (conn.cpu === true) botProfiler()?.cpuSnapshot(frame.byteLength);   // BOP-1: a CPU's received work, counted
    }
  }

  private body(p: Player): BodyState {
    const s: PlaySnapshot = p.sim.body();
    // Protocol 7: the item in the hand by id -- the slot's item on the body's kit (the character message's current item,
    // `FUN_005c89d0`, research 94 §A6), so the others draw, fire and hear what this body carries.
    const slot = p.sim.weapon;
    // ER-2 (protocol 14): the owner's raise state -- a page's command bit, or a bot's controller's (`raise`) -- relayed, and
    // forced down for a dead body (the copy's request off byte +0x7e, `FUN_002be150` D:L162310-162312).
    return bodyOf(p.id, s, {
      alive: p.alive, weapon: slot, item: p.held ?? p.loadout[slot], aiming: p.aiming || (p.alive && p.raise), trigger: p.trigger, boost: p.boost,
      binoculars: p.binoculars, raised: p.alive && (p.raised || p.raise),
    });
  }

  private send(id: number, ev: ServerEvent): void {
    this.conns.get(id)?.send(JSON.stringify(ev));
  }

  private broadcast(ev: ServerEvent, except?: number): void {
    // NCW-7 (the review F1, Codex P2): the ping the whole room was sent, from the rows themselves; a score built for one
    // page (the joiner's, a `score` request) is never broadcast and moves nothing.
    if (ev.type === 'score' && except === undefined) {
      for (const r of ev.rows) { const p = this.players.get(r.id); if (p) p.pingSent = r.ping; }
    }
    this.opts.recorder?.event(this.tick, ev);
    const text = JSON.stringify(ev);
    for (const [id, conn] of this.conns) {
      if (id === except) continue;
      conn.send(text);
      if (conn.cpu === true) botProfiler()?.cpuBroadcast(text.length);   // BOP-1: a CPU's received work, counted
    }
  }

  /** LATER 261: the latest restart notice told (`tellSystem`), at the room's clock; sent after each welcome while it holds. */
  private systemKept: KeptNotice | null = null;

  /**
   * SA-43c RESTART-NOTICE, Part 2 (an adaptation of the transport; `MatchServer.tellSystem`): the host's restart notice,
   * the room's `system` event, to every connection the room holds -- its players, its watchers, its queue -- once each.
   * Sent, never broadcast: the recorder never holds it (a replay of the match plays none), and it changes nothing the
   * room does. The page routes it as the original routes RT_MSG_SERVER_SYSTEM_MESSAGE (`FUN_0030dce0`, research 345).
   * LATER 261: kept too, the latest replacing the one before (a "now" a lead), with `restartAt` (a lead's restart, epoch
   * ms) -- `hello` sends it to each connection welcomed while it holds (`noticeHeldAt`: a lead until its restart, its
   * minutes recomputed; a "now" `NOTICE_NOW_KEPT_MS_ADAPTATION`).
   */
  tellSystem(severity: number, text: string, restartAt?: number): void {
    this.systemKept = { severity, text, at: this.opts.now(), ...(restartAt !== undefined ? { restartAt } : {}) };
    const frame = JSON.stringify({ type: 'system', severity, text } satisfies ServerEvent);
    for (const conn of this.conns.values()) conn.send(frame);
  }

  /**
   * PF-28 (ruling PF.R47; research 231 s1): the join envelope as the room stands now (`./joinState` `joinWire`) -- the
   * welcome's `join` (one line in `hello`'s welcome literal, held for the controller's wave 4: research 231 s4.3): the
   * projectiles flying or down, the standing result while the round screens run, the corpses and the ghosts.
   */
  joinWire(): JoinWire {
    return joinWire({
      tick: this.tick,
      flying: this.flying.map((f) => ({ pid: f.pid, owner: f.owner.id, kind: f.kind, g: f.g, ...(f.facing ? { facing: f.facing } : {}) })),
      result: this.state.phase === 'over' ? this.lastResult : null,
      // The load's death has alpha zero (322 §5.3): hydrate it through the existing invisible-ghost path, no corpse.
      seats: [...this.players.values()].map((p) => ({ id: p.id, alive: p.alive, diedAt: p.deadAtLoad ? -1 : p.diedAt, deathClip: p.deathClip, deathCause: p.deathCause })),
      drops: this.worldDrops.wire(),                             // PF-34 (research 234 s1)
    });
  }

  /** PT-02 (research 240 §4): the recording's end -- the recorder's `end` record and its flush (the server's and the loopback's call). */
  closeRecording(reason: string): void {
    this.opts.recorder?.close(reason);
  }

  /** For `/metrics`. */
  stats(): { players: number; spectators: number; tick: number; round: number; rules: Rules } {
    return { players: this.players.size, spectators: this.lobby.spectators().length, tick: this.tick, round: this.round, rules: this.opts.rules };
  }

  /**
   * Browser adaptation, `?devmode` only (`__viewer.kill`): ends this seat so a round reset can be checked.
   * Not a game rule. False when the seat is missing or already dead.
   */
  devKill(id: number): boolean {
    const p = this.players.get(id);
    if (!p || !p.alive) return false;
    this.kill(p, p, null, 'suicide', DEATH_CAUSE.BULLET);
    return true;
  }

  /** For the tests: a player's mover and state. */
  player(id: number): {
    sim: MoverSim; alive: boolean; health: Health; team: Team; score: number; kills: number; deaths: number;
    readonly mags: readonly [MagazineRing, MagazineRing]; readonly cone: ShotCone; readonly reloadUntil: readonly [number, number];
    readonly lockKind: readonly [LockKind, LockKind];
    readonly loadout: Loadout; readonly records: readonly [WeaponRecord, WeaponRecord]; readonly char: number; readonly nextChar: number;
    readonly queue: readonly Command[]; readonly queued: ReadonlySet<number>; readonly grenades: Readonly<Record<string, number>>;
    readonly equipmentSlots: EquipmentSlots;
    readonly ran: number; readonly credit: number; readonly pending: readonly unknown[]; readonly rounds: KitRounds;
    readonly flinchFrom: number; readonly flinchUntil: number; readonly spawnedIn: number; readonly away: boolean;
    /** The death's tick (+0xcc's stamp, -1 alive since the lobby); read by the late-load respawn gate and OBF-16's test. */
    readonly diedAt: number;
    /** CPU controller observation of the native launcher state; the Room still owns every transition and round. */
    readonly held: number | null; readonly heldReadyAt: number; readonly rocketWaitUntil: number;
    /** BOT-LAUNCHER-2: a launcher raise or lower waiting for its command (NU-6 F1, `holdFrom`); the firearm back up (M7). */
    readonly heldNext: { readonly item: number | null; readonly seq: number } | null; readonly firearmReadyAt: number;
    /** OBF-14: the in-process CPU controller's raise (`BOT_RAISE_READING`), written by the bots only. */
    raise: boolean;
  } | undefined {
    return this.players.get(id);
  }
}

/** A turret on the wire (`TurretWire`), with the gun's yaw (`TurretWireYaw`: RESUME-MOUNTED, PB-2c's review F1). */
function turretWire(t: TurretState): TurretWireYaw {
  return { id: t.place.id, occupant: t.occupant, ammo: t.ammo, gunYaw: t.gunYaw, ...(t.reserved ? { reserved: true as const } : {}) };
}

/**
 * RESUME-MOUNTED (PB-2c's review F1, research 215 s7.1): a turret the welcome lists -- occupied, or free with its gun
 * left turned off its placement's facing (`TurretState.gunYaw`), so a joiner's next mount steers toward it as the room's.
 */
function welcomeTurret(t: TurretState): boolean {
  return t.occupant !== null || t.gunYaw !== t.place.facing;
}

/** A finite number. */
function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Whether an event's command has run: a round's, a reload's or a hostage order's once the command after it has too
 * (the page's look runs a tick ahead of the command it names: the order's pick holds from either frame,
 * `ORDER_EYE_READING`), a throw's once its own has (M-8).
 */
function due(p: Player, ev: Timed['ev']): boolean {
  // LATER 116: an immediate ask, as a throw, once its own command has run -- it reads the body (reach, feet, eye), and a
  // C4 throw's or a SWITCH action's line the camera's look at that command and the one before (LATER 139: `framesAround`,
  // so the command's own frame must be in the cone, never the newest frame's fallback); a round waits for the command
  // after, the page's look running a tick ahead and the round reading it
  return ev.type === 'throw' || ev.type === 'throwStart' || ev.type === 'door' || ev.type === 'action' || ev.type === 'bombAction' || ev.type === 'pickup'
    ? p.sim.seq >= ev.seq : p.sim.seq > ev.seq;
}

/**
 * M-8 of review 2: whether `velocity` from the hand at `from` is a launch the game's throw makes from that hand, at a
 * body with its feet at `feet`, facing `yaw` (degrees), in `posture`. The game's launch is `throwVelocity`
 * (`CZKit_TickExplosives` 0x5c2134-0x5c22d8): the power 0..1, the aim's pitch clamped to `THROW_AIM_CLAMP` (0..55
 * degrees) plus the power's elevation, from the release point in the actor frame, at most `ComputeMaxVel` (0x5976e0)
 * for the stance's `max_distance` (0x5c1970: 600 standing, 300 otherwise -- a standing lean's toss takes 300, so a
 * standing body is allowed either), turned by the facing. The aim is not the frame's pitch: the page takes it at the
 * throw's start, a clip before the release. The event's launch must lie within `THROW_SLACK_READING` x the fastest
 * throw (units a second, as a vector) of some launch of that family.
 */
export function throwLaunchAllowed(
  feet: readonly number[], yaw: number, posture: 'stand' | 'crouch' | 'prone', from: readonly number[], velocity: readonly number[],
): boolean {
  const r = (yaw * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
  // The world into the actor frame (x right, y up, z behind): the inverse of `actorToWorldPoint`.
  const dx = from[0]! - feet[0]!, dz = from[2]! - feet[2]!;
  const hand: [number, number, number] = [dx * c - dz * sn, Math.max(0, from[1]! - feet[1]!), dx * sn + dz * c];
  const v = [velocity[0]! * c - velocity[2]! * sn, velocity[1]!, velocity[0]! * sn + velocity[2]! * c];
  const distances = posture === 'stand' ? [maxThrowDistance('stand'), maxThrowDistance('crouch')] : [maxThrowDistance('crouch')];
  for (const distance of distances) {
    const slack = maxThrowSpeed(distance, hand[1]).speed * THROW_SLACK_READING;
    for (let i = 0; i <= THROW_POWER_STEPS; i++) {
      for (let j = 0; j <= THROW_AIM_STEPS; j++) {
        const aim = THROW_AIM_CLAMP[0] + ((THROW_AIM_CLAMP[1] - THROW_AIM_CLAMP[0]) * j) / THROW_AIM_STEPS;
        const l = throwVelocity(i / THROW_POWER_STEPS, Math.sin(aim), hand, distance).velocity;
        if (Math.hypot(l[0] - v[0]!, l[1] - v[1]!, l[2] - v[2]!) <= slack) return true;
      }
    }
  }
  return false;
}

/**
 * IMPACT_SIGHT_READING (M4, research 94 §C4.3): where a blast's line to a head (`FUN_005ac070`) starts. A launched
 * round goes off where it struck (`HandleImpact` 0x3c8920: the hit point, on the surface), so a line from there finds
 * that surface at once and no one would be reached; the line starts `BOUNCE_LIFT` (0.1, the lift a bounce leaves a
 * projectile at, 0x3c8f50) toward the head. A grenade at rest, already 0.1 off its floor, is not changed in effect.
 */
const IMPACT_SIGHT_READING = BOUNCE_LIFT;
function sightFrom(point: V3, head: V3): V3 {
  const d: V3 = [head[0] - point[0], head[1] - point[1], head[2] - point[2]], l = Math.hypot(...d);
  if (!(l > IMPACT_SIGHT_READING)) return point;
  const k = IMPACT_SIGHT_READING / l;
  return [point[0] + d[0] * k, point[1] + d[1] * k, point[2] + d[2] * k];
}

/**
 * M4: a weapon's lock on the command clock -- the kit's timer (`ReloadDelay`, or the bolt's or pump's lock: whole ticks
 * the page's frames can have run it out by, rounded down) and then the clip that plays (its ticks), less a tick as the
 * rate's (the page's frame-quantised clock).
 */
function lockTicks(timer: number, clip: number): number {
  return Math.floor(timer * TICK_HZ + 1e-9) + Math.round(clip * TICK_HZ) - 1;
}

/** The body a start is measured from (SVC-23b): an `AimFrame`, or the mover now (`Room.startBody`). */
type StartBody = { feet: V3; yaw: number; posture: AimFrame['posture']; moveRoot: number | null; peek: number; groundNormalY?: number; rootSlack: number };

/** Which kind set a weapon's lock (the kit timer's flag bit, `kit+2 & 2`: after-shot or reload). */
type LockKind = 'reload' | 'afterShot' | null;

/**
 * PF-18: a reload's still clip the room watches for its cut: its first command (count) and its life (`./reloadLock`);
 * PAR-79: its clock covered by the fall and handed back (`StillClipClock`, the page's `StillReloadLife` holds the same).
 */
interface ReloadLife extends StillClipClock { spec: ReloadLifeSpec }

/**
 * PF-18: the commands' cut axes kept (`Player.cutLog`): a reload is decided once the command after it has run, a late
 * one within `FIRE_ARRIVAL_JITTER_TICKS` (older is dropped `'stale'`), so a few past that cover every command its clip
 * ran under before it was decided.
 */
const CUT_LOG = FIRE_ARRIVAL_JITTER_TICKS + 4;

/**
 * Sets a weapon's one lock (`kit+0x820` then its clip): its timer part and its end, on the command clock -- and its end on
 * the room's own clock too (SVC-23b: `clock`, the tick the room decided it).
 */
function setLock(p: Player, w: 0 | 1, count: number, timer: number, clip: number, kind: Exclude<LockKind, null>, clock: number): void {
  p.lockStart[w] = count;                                        // LATER 175 (F1): the span's start (`mountKitLocked`)
  p.lockArrival[w] = p.armedBy;                                  // LATER 249: the arming event's arrival
  p.lockTimer[w] = count + Math.floor(timer * TICK_HZ + 1e-9);
  p.reloadUntil[w] = count + lockTicks(timer, clip);
  p.lockClock[w] = clock + lockTicks(timer, clip);
  p.lockKind[w] = kind;
}

/**
 * PAR-83: a command's move axes as `Walker.cutStick` reads them on its tick (`Walker.step60`: each clamped to +-1, x the
 * scope's 0.2 under `Button.Scope`, `FUN_005966a0` D:L453818-453821) -- for a dropped command, whose tick moves no body.
 */
function commandStick(c: Command): { forward: number; right: number } {
  const k = (c.buttons & Button.Scope) !== 0 ? SCOPED_STICK : 1, clamp = (v: number): number => Math.max(-1, Math.min(1, v));
  return { forward: clamp(c.forward) * k, right: clamp(c.right) * k };
}

/** A whole number (a command number, a tick, an id). */
function isInt(v: unknown): v is number {
  return Number.isInteger(v);
}

/** Three finite numbers: a point or a direction off the wire. */
function isV3(v: unknown): v is V3 {
  return Array.isArray(v) && v.length === 3 && v.every(isNum);
}

/** PF-13: a `throw`'s `surface` off the wire -- the struck polygon owner's path and a finite point. */
function isSurface(v: unknown): v is { path: string; point: V3 } {
  return typeof v === 'object' && v !== null && typeof (v as { path?: unknown }).path === 'string' && isV3((v as { point?: unknown }).point);
}

/** A `loadout` request's picks off the wire: a list of at most `MAX_LOADOUT_PICKS` whole slots and ids, or null. */
function picksOf(raw: unknown): Pick[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_LOADOUT_PICKS) return null;
  const out: Pick[] = [];
  for (const v of raw) {
    const o = v as Record<string, unknown> | null;
    if (!o || typeof o !== 'object' || !isInt(o.slot) || !isInt(o.id)) return null;
    out.push({ slot: o.slot, id: o.id });
  }
  return out;
}

/** A dead body's `isDead` for the tests. */
export { isDead };

/** BONE-BOXES' fold: whether two body records' tags are one body (a player and a hostage of one id are two). */
function sameBody(a: unknown, b: { id: number; hostage?: true }): boolean {
  const t = a as { id: number; hostage?: true } | undefined;
  return !!t && t.id === b.id && !!t.hostage === !!b.hostage;
}

/** NET-RES.R11 (a): a health or armour array's total. */
function sum(a: readonly number[]): number {
  let n = 0;
  for (const v of a) n += v;
  return n;
}
