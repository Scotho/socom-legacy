import { TRAVERSAL_CLIPS } from '../../viewer/src/traversal';
import type { SimClips } from '../../viewer/src/simMap';
import { HostageObstacles } from './hostageObstacles';
import { HostageYieldRandom, HOSTAGE_YIELD_SEED_PLACEHOLDER, type HostageActor } from './hostageActors';
import { aiCellOf, GameFrameAccumulator, GAME_FRAME_DT, ITEM, zoneContains, zonesOfKind, type AiGrid, type AiLoc, type AiMaps, type AiZone, type EscorteeStart } from '@s2u/scene';
import { BodyFlag, TICK_HZ, type BodyState, type ServerEvent, type SimMap, type Team } from '../../viewer/src/sim';
import type { Health } from '../../viewer/src/net/damage';
import { HOSTAGE_KILL_WIN_HOLD_READING, RESCUE_WIN_HOLD_READING } from '../../viewer/src/net/rules';
import { ACTION_CODES, type HostageStateWire, type HostageWire, type KillHow } from '../../viewer/src/net/protocol';
import { HostageAi, type HostageWorldBody } from './hostageAi';
import { FollowTrail, HostageFollow, type FollowLeader } from './hostageFollow';
import { HOSTAGE_PATH_SLICE_BUDGET_PLACEHOLDER, HostagePathPlanner } from './hostagePath';
import {
  HostageLeaders, onCommand, orderRefusal, releaseLeader, unitOfSeat, unitTick, PLAYER_TEAM_MASKS, type HostageCommand, type OrderPick,
  type OrderRefusal,
} from './hostageOrders';

/**
 * HX-1, EXTRACTION's rules in the room (web sprint 31; socomlegacy/docs/research/237-extraction-as-built.md s2-s5; research
 * 190 s4 C, s4.2 C2, s4.3 C3, s4.6 C6; 191 s2.3, s2.6; 199 s2; rulings HX.R2, HX.R6, HX.R7, proposed). The bomb's shape
 * (`./bomb`): the room builds one on a map of game type 4 (EXTRACTION) or 3 (ESCORT) with escortee starts
 * (`SimMap.escortees`, HX-0b), steps it once a tick before its clock, resets it at every round's start, reads `result()`
 * in its clock's play arm after the elimination, and `takePenalty()` for the minute. ESCORT's VIPs are the same
 * escortee records (research 175 §2.1: `VIP1`–`VIP3`, team 0x40020000) and the same follow orders; its round rules are
 * research 175 §4, not MP6's extraction chain.
 *
 * The room is the host (HX.R2): the original's session master spawns the escortees (`FUN_002b2e50` D:L156005, no double
 * spawn D:L156021-156031), runs their AI (`CSealCtrlAi`) and applies the hits on them (`FUN_005a5a80` D:L461598-461646);
 * here the three hostages are the room's bodies -- ids from `HOSTAGE_ID_BASE`, one more `BodyState` each in the snapshot,
 * the welcome's `hostages` -- with HX-3's `HostageAi` stepped at the game frame (`AI_FRAME_READING`) and their state told
 * in a reliable `hostageState` on change (`HOSTAGE_STATE_RATE_READING`).
 *
 * The rules are MP6's `objectives` script (HX.R6; 190 s4, decoded twice -- H2's listing and V2's raw read, 190 s10.7):
 * the map valves `rescuecount`, `freecount`, `killcount`, `rescuecheck`, the game's `mp_penalty` (+0x40),
 * `mp_hostages_by_seals` (+0x38) and `_turds` (+0x3c); the one-shots HostKill1-3 and SealKill1-3 and SEALcheck; `start`'s
 * chain after the room's own elimination (`result`). The orders are HX-4a's. HX-5 (research 239 s4): the escortee
 * post-tick's rescue test each game frame (`rescueTest`), Rescue1-3's valves (`RESCUE_VALVE_READING`), the `rescued`
 * event the room scores (`on('rescued')`, `on('killed')`); Lead1-3 are the page's lines (research 239 s6).
 */

type V3 = [number, number, number];

/**
 * The first hostage's body id (HX.R2): the hostages are bodies 240, 241, 242 in the snapshot's list. A port rule, not a
 * game value: the original's entity id is the net object's index on every console (191 s1, D:L455453). A member's id is
 * the server's `freeId`, capped at `MEMBER_ID_CAP` = 239 (`server.ts`; the sprint 31 fix-up, research 239 s9.2): a game
 * lobby's room takes its spectator slots from the host's GameStats byte (`bridge.ts` `roomOptions`, up to 255), so the
 * seats alone do not keep a member's u8 id below 240; the cap does, and a joiner past it is refused as the full room's.
 */
export const HOSTAGE_ID_BASE = 240;

/**
 * A hostage's part health: the values HX-2's read gives (`@s2u/scene` `healthOf` on `HOSTAGE_HEALTH_READING`,
 * `mp_hostage_extract` through `mp_fem1-3`'s base chain; research 238 s1.7, pinned on the MP6 fixture by
 * `character.test.ts`): head 8, body 40, arms 10/10, legs 15/15, armour 0 on every part (189 #9, s5, s14.11). The
 * part-damage pipeline applies (`FUN_005a5830` D:L461469-461547), nothing hostage-specific in it, and its body-hit cap
 * reads these maxima (`Health.max`). The room does not read `character.rdr` itself yet (no table reaches it): this
 * table stands for that read (research 237 s7).
 */
export const HOSTAGE_PARTS = { head: 8, body: 40, arms: 10, legs: 15, armor: 0 } as const;

/**
 * Friendly fire off never spares a hostage: the contact handler drops a projectile whose live shooter shares a team bit
 * with the victim, except when the victim carries the escortee bit 0x20000 or is the shooter (disassembly
 * 0x5ac720-0x5ac74c, research 199 s2, V5 s12.3 "exact"). A hostage's 0xC0020000 shares a bit with both sides, so this
 * exception is what keeps it shootable: the room's `ffRefuses` returns no refusal for an escortee victim, at once (the
 * spectator test and the backblast branch 0x5ac840-0x5ac8fc test a player's seat and side, which a hostage has not).
 * [reading]
 */
export const HOSTAGE_FF_READING = 'always hittable';

/**
 * Hostages never count for the elimination: `FUN_002b23a0` (D:L155569) counts an online SEAL to `aiteam_00`, a
 * Terrorist to `aiteam_08`, and any other actor to one valve per set bit of its +200 -- a hostage to 17, 30 and 31
 * (190 C2 "Who counts", V2 #14; the 2026-09-17 capture's `aiteam_00 = aiteam_08 = 1` in a 1v1). The room's `living()`
 * counts its players only; the hostages are not players. [reading]
 */
export const HOSTAGE_ELIMINATION_READING = 'never counted';

/**
 * The minute (`FUN_002a6960(game, 0x3c)` D:L148936-148949, on the host byte `DAT_0045a0c0`): the round's total in whole
 * seconds (game +0xe0 ms x 0.001, truncated) above `cut` 60 becomes total - 60; else a nonzero total becomes `floor` 1 s
 * (1000 ms); 0 stays. Called from the game-state update when the `mp_penalty` valve's u16 exceeds the value last seen
 * (D:L150711-150716, D:L163051-163056); the remaining time is total - elapsed (D:L151085-151093), so a late kill runs the
 * clock out at once. 190 C3.5, V2 claim 10. [reading]
 */
export const PENALTY_MINUTE_READING = { cut: 60, floor: 1 } as const;

/**
 * One minute per OBSERVED change of `mp_penalty`: the update compares the valve with the value it last saw and calls
 * `FUN_002a6960` once (D:L150711-150716) -- two increments between two updates cost 60 s, not 120 (190 C3.5, BELIEVED;
 * capture C2's game +0xe0 around a double SEAL kill settles it, research 237 s7). The room reads the valve once a tick
 * (`takePenalty`). [reading]
 */
export const PENALTY_COALESCE_READING = 'one minute per observed change';

/**
 * `rescuecheck`: SEALcheck sets it (and stops) when `freecount == 3`, or `freecount == 2 AND killcount == 1`, or
 * `freecount == 1 AND killcount == 2`, or `killcount == 3` -- all three hostages resolved, rescued or dead (190 s4 C's
 * table; V2 s10.7 decoded the four branches from the raw bytes). Built as the four equality tests, polled once a tick:
 * a sum past three without passing one of them (a rescued hostage killed in its fade, counted twice) sets nothing. [reading]
 */
export const RESCUECHECK_READING = 'all three resolved';

/**
 * The script's one-shots HostKill1-3 and SealKill1-3 (190 s4 C's table): SOUND, MESSAGE, WAIT 2, MESSAGE, then the valves
 * (`rescuecount`/`killcount` += 1, or `mp_penalty`/`killcount` += 1) -- the valves move 2 s after the kill, so the minute
 * lands then. The script's frames are approximated by the room's ticks. [reading]
 */
export const ONE_SHOT_WAIT_READING = 2;

/**
 * The radio chatter a hostage's death plays locally on every console (`FUN_005e7f20(victim, 0x44, 0)`,
 * CMD_MP_HOSTAGE_KILLED -> SND_HOSTAGE_KILLED, 191 s2.3 step 7): the port has no radio chatter; the script's lines and
 * streams are HX-5's. Placeholder.
 */
export const HOSTAGE_KILL_RADIO_PLACEHOLDER = 'unplayed';

/**
 * A hostage's death counts in a valve only when its killer is a type-2 entity (`FUN_0059ee20` D:L458078: the actor
 * looked up by the death's killer id, kept only when `+0x10 == 2`): a fall, a world kill, a departed thrower's round
 * counts in no valve -- the room's killer is a seated player or none. [reading]
 */
export const WORLD_KILL_UNCOUNTED_READING = 'no valve';

/**
 * The hostage's state on the wire: a reliable `hostageState` when any field changes (the AI word's state, leader,
 * rescuer, the opacity nibble, the unit, the life), against the original's AI-word field sent at most every 100 ms on
 * change (191 s3.1-3.2, V3 (a); 199 s9). The opacity travels as the word's nibble: 15 when the node is inactive or its
 * opacity <= 0, else `(1 - opacity) x 15` through `FUN_001b3648` (read as a truncation) (writer D:L432905-432913); the
 * reader's opacity is `1 - n / 15` (D:L432833). [reading]
 */
export const HOSTAGE_STATE_RATE_READING = 'on change';

/**
 * A hostage killed inside its rescued fade (research 238 s2.6, HX-3's review): a dead hostage's AI is no longer stepped,
 * so the fade's tick -- the only caller of the node's `SetActive` (D:L422207) -- stops and the node's opacity stays where
 * it was, the node active. The room keeps such a body in the snapshot, dead (`Alive` off), its `hostageState` at the
 * frozen opacity (the state left as it stood); one already hidden (opacity 0) stays out of the snapshot. What the
 * original's console draws then is owed to capture C2 (research 237 s7). [reading]
 */
export const DEAD_IN_FADE_READING = 'a corpse at its frozen opacity';

/**
 * HX-5 (research 239 s4; 190 C4; 191 s2.4): the escortee post-tick (`FUN_0056f970`, CSealCtrlAi vt +0x3c, D:L432926)
 * rescues a hostage when its last leader is set (`ctrl+0x5d8` != -1, initialised -1 at D:L434764 / D:L435187), its body
 * carries the escortee bit (`+200 & 0x20000`, always) and `FUN_0052a200(map, 1, body+0xe4)` finds a kind-1 zone holding
 * its AI-map cell (D:L432964-432966) -- the room's `aiCellOf` on sub-map 0 (`ZONE_CONTAINS_READING`, the `+0xe4`
 * stand-in) against every kind-1 zone (`zonesOfKind`): then the leader's id is looked up (`FUN_0029e4e0`, a type-2
 * entity) and `FUN_005f5ba0(ctrl, 0x11)` -- refused while 0x11 is on top, so no credit each frame -- records the zone and
 * the rescuer (+0x58, +0x5c) and credits the leader (`FUN_00545480`, D:L432975-432983). Run for every living hostage
 * after its AI's step. [reading]
 */
export const RESCUE_TEST_READING = 'led (lastLeader resolves), on a kind-1 zone cell';

/**
 * The rescue's credit (`FUN_00545480` D:L411554-411572; 190 C4, C5): only offline or for a SEAL leader (`FUN_002c31d0`):
 * brought out +1 (round block +0x1c: the round's `Player.roundRescued`, the match's `hostagesRescued`) and +3 (+0x3c) on
 * the leader's console, then `FUN_00544d60(leader, 1)` -- the team carry (`TEAM_CARRY_RESCUE_READING`). The room's
 * `on('rescued')` listener applies it. [reading]
 */
export const RESCUE_CREDIT_READING = 'the last leader, a SEAL: +3, brought out +1';

/**
 * A dead leader still credited (D:L432967-432973): the lookup `FUN_0029e4e0(0x4362e0, +0x5d8)` finds any entity of type
 * 2 by its id, alive or not, so a dead but seated leader is credited; a departed one's id resolves to nothing: `+0x5d8`
 * reset to -1 and no rescue (`lastLeader` null here). C2's leader-killed row settles it. [reading]
 */
export const RESCUE_DEAD_LEADER_READING = 'credited while the id resolves';

/**
 * A Terrorist's lead (HX.R3; 190 U6, V2 s14.12): the post-tick enters 0x11 whatever the leader's side; `FUN_00545480`
 * credits only a SEAL, so a Terrorist leader is a rescuer with no points and no carry, while the script's Rescue one-shot
 * (`RESCUE_VALVE_READING`, no leader test) counts the hostage for the SEALs. [reading]
 */
export const TERRORIST_LEAD_RESCUE_READING = 'a SEAL rescue, no points';

/**
 * MP6's Rescue1-3 (190 s4 C's table; re-read off the MP6 fixture 2026-10-06): `IF ( ai::INREGION(HostageN) ) OR ( )` ->
 * `^PH_0013`, "A HOSTAGE HAS BEEN RESCUED", `rescuecount` += 1, `freecount` += 1, stop -- once per hostage, with no
 * state or leader test (the empty `( )` is the left operand's, 190 U9). Built as the zone test on the hostage's cell,
 * polled once a tick for each hostage; whether INREGION reads a dead actor is unread (a hostage cannot reach the zone
 * dead). [reading]
 */
export const RESCUE_VALVE_READING = 'INREGION once per hostage, no leader test';

/**
 * R4B-04 (G12; OT.R97, research 377 §2): r0004's escortee post-tick credits a hostage once. Its twin of `FUN_0056f970`
 * samples body `+0x105c` bit 3 before the Replace by 0x11 (r4 0x574e8c-0x574eb0) -- the bit `CAiSRescued::OnSignal(0)`
 * sets online and nothing clears (`FUN_005594b0` D:L422314, r4 0x55e870-0x55e884; `HostageAi.rescued`) -- still enters
 * 0x11 and records the zone and the rescuer, and calls the credit (`FUN_00545480`, r4 0x549ea0) only when the bit was
 * clear (r4 0x574f00-0x574f0c). The client's twin of `FUN_0056f4c0` tests and sets the same bit round its credit (r4
 * 0x574970-0x5749e4): the room credits every seat itself, so that twin is this one credit. r0001 credited every
 * re-entry (research 199 §1, owner call 1, HX.R5) -- superseded by r0004 (OT.R97). [reading]
 */
export const RESCUE_CREDIT_ONCE_READING = 'once: body +0x105c bit 3 clear before the push';

/**
 * R4B-04 (research 377 §2): r0004's post-tick skips the whole rescue test -- the leader's lookup, its reset of a departed
 * one (`+0x5d8` = -1) and the Replace -- while 0x11 is anywhere on the stack (`ctrl+0x42c & 0x20000`, the OR of
 * `1 << id`, D:L506573; r4 0x574e40-0x574e4c). r0001 looked the leader up each frame (D:L432967-432973) and only the
 * Replace's gate refused 0x11 on top. [reading]
 */
export const RESCUE_STACK_GATE_READING = 'no rescue test while 0x11 is on the stack';

/**
 * R4B-04 (G12; research 377 §3): r0004 refuses every hit on a hostage whose body carries the rescued bit (`+0x105c`
 * bit 3), at both of its gates. The online hit receiver (`FUN_005a1b80`'s twin, r4 0x5a7660) returns at once for a
 * victim whose controller is an AI's (`IsAi`, vt+0x30) with the bit set (r4 0x5a76d8-0x5a7718), before any damage,
 * count or knock: a client shooter's rounds. `CZSealBody::OnWeaponHit` (`FUN_005ac670`'s twin, r4 0x5b2360) drops it
 * before the damage dispatch and the blast queue (r4 0x5b2600-0x5b261c) on the arm an AI victim reaches (vt+0x38 is
 * `this` for `CSealCtrlAi`, r4 0x57afd0; r0001 0x575bf0) for every item but 0x9f, the Backblast: the host's own rounds
 * and every blast. The Backblast's arm (r4 0x5b25b0-0x5b25fc, as r0001 0x5ac8b0-0x5ac8fc) drops a hit whose owner is
 * found and the victim or sharing a team bit -- on a hostage (0xC0020000) every found owner -- so a departed owner's
 * Backblast is the one hit that lands (`rescuedRefuses`). r0001 tested no rescued state in damage (research 199 §2:
 * a kill inside the fade counted rescued and killed, owner call 2, HX.R5; its reading retired, research 377 §5) --
 * superseded by r0004 (OT.R97). [reading]
 */
export const RESCUED_HIT_READING = "every hit refused but a departed owner's Backblast";

/**
 * Whether r0004 refuses a hit on hostage `h` for its rescued bit (`RESCUED_HIT_READING`): the bit set and the item not
 * a Backblast whose owner has left (`ownerLive` false: `FUN_0029e4e0` finds no one). The room asks it beside the
 * friendly-fire gate (`Room.hostageRefuses`) on each of its hostage hits: a bullet or a volley, a launched round's
 * direct hit, a blast.
 */
export function rescuedRefuses(h: { readonly ai: { readonly rescued: boolean } }, ownerLive: boolean, itemId: number): boolean {
  return h.ai.rescued && (ownerLive || itemId !== ITEM.BACKBLAST);
}

/**
 * The primary objective at a round's end (`FUN_00224d10` D:L76467, called D:L76026; its EXTRACTION arm D:L76550-76558):
 * +0x32 += 1 for a living SEAL when the SEALs' brought out this round (+0x5a8, summed over every SEAL, alive or not) is
 * above 1; for a living Terrorist when no SEAL is alive. Each console its own player; the room counts every seat
 * (`Player.primaryObjs`). [reading]
 */
export const PRIMARY_OBJECTIVE_READING = "a living SEAL with the side's brought out > 1; a living Terrorist with no SEAL alive";

/**
 * The online record's HOSTAGES RESCUED (+0x24) takes the match's brought out in every type but ESCORT (`FUN_00225070`
 * D:L76619-76632; 190 s1 #19, C5): the room sends it as `MatchStats.hostagesRescued` from an EXTRACTION room; no screen
 * of the port draws it (the stats record, research 155, owed). [reading]
 */
export const HOSTAGES_RESCUED_STAT_READING = '+0x24 from the match brought out, not in ESCORT';

/**
 * Escortees killed (+0x18, `FUN_00545390` D:L411546): kept by the room, sent as `MatchStats.escorteesKilled`, drawn
 * nowhere -- YOUR STATS reads +0x576 / +0x578 only (research 216) and the online record keeps +0x18 only in ESCORT.
 * [reading]
 */
export const ESCORTEES_KILLED_STAT_READING = 'carried, drawn nowhere';

/**
 * HX-4a (the review of d8d8487c): a led hostage's death frees its leader's count (`+0x520`) and its lead (`leader`
 * null, `lastLeader` kept). The path is read in pieces: a dead body's ClearStack pops the whole stack
 * (`FUN_005f5f20` D:L505663-505679: `force` or dead) and state 9's end runs `ControlHostageAction(ai, 0)` (199 s1's
 * replay; `FUN_005fcf10` D:L509487-509493); which call clears a dying hostage's stack is unread -- so the room releases it
 * at the death itself. Without it the count would hold +1 to the round's end. Reading.
 */
export const LED_HOSTAGE_DEATH_COUNT_READING = 'released at the death';

/** A player as the hostages see it: the killer of a hostage, a body the watch looks at. */
export interface ExtractionActor { readonly id: number; readonly team: Team }

/** What the room lends the hostages. */
export interface ExtractionHost {
  /** Disc motion data supplied to the original AI contact-climb driver. */
  readonly clips?: SimClips | null;
  /** The room's tick. */
  tick(): number;
  /** The level runs (a round in play, a decided round's hold, the time-expired play-on): the AI and the script step. */
  live(): boolean;
  /** U[0, 1): the room's seeded random (`opts.random`), for the AI's stance delay. */
  random(): number;
  /** Every seated player's body as the watch sees it (`HostageWorldBody`: id, feet, alive, its team mask). */
  bodies(): readonly HostageWorldBody[];
  /** Every page told (a `hostageState`, a hostage's `kill`, LATER 131's `escort`). */
  send(ev: ServerEvent): void;
  /**
   * LATER 131: what decided the round and for whom (the room's decided state), else null. ESCORT's VIPcheck is stopped by
   * every decision: every branch of `start` stops it (MP52 @824 ... @2632), and after the time-out `killcount` stands still
   * (the kill one-shots stopped: MP53 `mission_timer` @7068-@7108, MP52 `escort_success` @7120-@7160, MP82 @6532-@6572).
   * `start`'s SEALs-eliminated branches -- the Terrorists' elimination win -- stop SEALcheck too (MP52 @1248 / @1520 /
   * @1792, MP82 @1228 / @1492 / @1756). Absent: in play.
   */
  decided?(): { reason: string | undefined; winner: Team } | null;
  /**
   * HX-4a (research 239 s9.1): a seat as the orders read it -- alive, a spectator or a player, its side, its feet -- or
   * undefined when no such seat is in the room (a departed leader). Absent: no seat resolves (no order is taken).
   */
  seat?(id: number): OrderSeat | undefined;
  /**
   * HX-4a: the crosshair pick along `dir` (`ORDER_PICK_READING`): every living body's `rayBody` but the issuer's, and
   * the hull's surfaces under the aim pick's rule (`crosshairPick`, `pickSurfaces`). The room's casts from the issuer's
   * camera eye as it holds it, not from the page's `eye` (the sprint 31 fix-up, `ORDER_EYE_READING`, research 239
   * s9.2): from the frame of the command the order names (`seq`) or the next, so `target` (the hostage ordered) is
   * the pick if it is from either.
   */
  pick?(issuer: number, eye: V3, dir: V3, seq?: number, target?: number): OrderPick;
  /** HX-4a: an order refused, by why (the room's tally, INT.R5's report to the issuer). */
  dropped?(why: OrderRefusal | 'unknown hostage', issuer: number): void;
}

/** HX-4a: a seat as the orders read it (`ExtractionHost.seat`). */
export interface OrderSeat { id: number; alive: boolean; spectator: boolean; team: Team | null; feet: V3 }

/** HX-4a: the order as the room takes it off the wire (`hostageOrder`, its shape checked by `Room.text`). */
/** An order as the room hands it on; `seq` the command it names (the room's pick is cast from that command's frame or the next's). */
export interface HostageOrderEvent { hostage: number; cmd: HostageCommand; eye: V3; dir: V3; seq?: number }

/** A hostage's death as the room tells it: the `kill` event's fields beside its killer. */
export interface HostageKillInfo { weapon: string | null; how: KillHow; clip: string | null; cause: number; killerName?: string }

/** One tick of a hostage's past (`Room`'s `Past`: the shooter's rewind applies to it as to a player). */
export interface HostagePast {
  tick: number; feet: V3; yaw: number; posture: 'stand' | 'crouch' | 'prone'; alive: boolean;
  /** PRONE-TILT-2 (5): the root's tilt while a knock owns the body (`HostageFollow.rootTilt`), else null. */
  tilt?: readonly number[] | null;
}

/** One hostage in the room. */
export interface Hostage {
  /** Its body id (`HOSTAGE_ID_BASE` + its record's index). */
  readonly id: number;
  /** The record's `name` (the actor's scene name, which the script finds it by). */
  readonly name: string;
  /** The record's `character` (`mp_fem1`): HX-2 draws it by this. */
  readonly character: string;
  /** Its start, copied from the map's (never the shared tuple). */
  readonly start: Readonly<EscorteeStart>;
  /** The physical feet, moved through the map's hulls by the shared follower. */
  at: V3;
  motion: HostageFollow | null;
  yaw: number;
  alive: boolean;
  /** Its parts (`HOSTAGE_PARTS`, the maxima in `max`). */
  health: Health;
  /** HX-3's AI, a fresh one each round (no `reset()` of its own). */
  ai: HostageAi;
  /** The leader's seat id while state 9 holds it (HX-4a writes it), else null. */
  leader: number | null;
  /** The last leader's seat id (the rescue's credit, HX-5), else null. */
  lastLeader: number | null;
  /** The tick it died on, -1 alive. */
  diedAt: number;
  /** The death's clip and cause as `kill` told them. */
  deathClip: string | null;
  deathCause: number | null;
  /** The shooter's rewind (`Room`'s `HISTORY` ticks). */
  readonly history: HostagePast[];
}

/** The script's valves this module holds (190 A2, C3; V2 claim 10). */
export interface ExtractionValves {
  rescuecount: number; freecount: number; killcount: number; rescuecheck: number;
  /** `mp_penalty` (game +0x40). */
  penalty: number;
  /** `mp_hostages_by_seals` (game +0x38). */
  bySeals: number;
  /** `mp_hostages_by_turds` (game +0x3c). */
  byTurds: number;
}

export type ExtractionEventKind = 'state' | 'killed' | 'rescued';
export interface ExtractionEvent { kind: ExtractionEventKind; hostage: Hostage; by: ExtractionActor | null }

/** SEALcheck's four branches (`RESCUECHECK_READING`): all three hostages resolved. */
export function sealCheck(freecount: number, killcount: number): boolean {
  return freecount === 3 || (freecount === 2 && killcount === 1) || (freecount === 1 && killcount === 2) || killcount === 3;
}

/** One ESCORT map's script, as the room plays it: SEALcheck's wait and the zones, by name, each step tests. */
export interface EscortScript {
  /** SEALcheck's WAIT between its gate and the promotions, in seconds. */
  readonly countdownS: number;
  /** The zones RescueN's `INREGION` latches a VIP in (`rescuecount`). */
  readonly stage: readonly string[];
  /** The zones SEALcheck's two `ai::MAP` make kind 1 (EXTRACT_ZONE) after the wait, whichever holds a VIP. */
  readonly promote: readonly string[];
  /** The zones EndRescueN's `INREGION` extracts a living VIP in, once SEALcheck has called them. */
  readonly extract: readonly string[];
}

/**
 * [reading, pending review] SEALcheck's wait on each ESCORT map (research 175 §4 item 3; `objectives` read with
 * `tools/probe-npc-maps.ts --section commands`; PR #331's review F5): its two branches' WAIT -- 30 s on The Mixer
 * (MP52 @5644, @6060) and Foxhunt (MP53 @5676, @6092), 20 s on Guidance (MP82 @5184, @5472).
 */
export const ESCORT_COUNTDOWN_READING: Readonly<Record<string, number>> = { MP52: 30, MP53: 30, MP82: 20 };

/**
 * [reading, pending review] The zones each ESCORT map's script tests (PR #331's review F1; research 175 §4, 334 §2).
 * The script names a zone by its corner cell (a location word in the `ai::MAP` and `INREGION` operands); the port finds
 * it by its name, and `escort.test.ts` holds, on the disc, that each named zone sits at the script's word.
 * - stage: RescueN's `INREGION` -- MP52 Rescue1 @3764 and MP53 @3796 Safety OR Safety2; MP82 @3696 Safety.
 * - promote: SEALcheck's two `ai::MAP` after the wait, run whichever zone holds a VIP -- MP52 @5656/@5676 (and
 *   @6072/@6092 in its second branch), MP53 @5688/@5708 (@6104/@6124), MP82 @5196/@5216 (@5484/@5504): Safety and
 *   Safety2 on all three. The IF / ELSEIF before them (MP52 @5360/@5488, MP53 @5392/@5520) chooses only the
 *   helicopter's animation (MP52 @5468 `chopper_rescue2` for Safety, @5596 `chopper_rescue1` for Safety2), which the
 *   room does not play.
 * - extract: EndRescueN's `INREGION` -- MP52 EndRescue1 @4400 and MP53 @4432 Safety OR Safety2 (and the VIP alive);
 *   MP82 @4224 Safety only.
 * `INREGION` is positional (`FUN_005ced60` D:L484773-484944; its actor mode D:L484861-484903): the actor's cell's
 * sub-map and the rectangle (`FUN_0052d950` D:L397080 finds the region), not the zone's kind. The kind the promotion
 * sets is what the AI's own rescue test reads (`rescueTest`, kind 1).
 */
export const ESCORT_ZONES_READING: Readonly<Record<string, Omit<EscortScript, 'countdownS'>>> = {
  MP52: { stage: ['Safety', 'Safety2'], promote: ['Safety', 'Safety2'], extract: ['Safety', 'Safety2'] },
  MP53: { stage: ['Safety', 'Safety2'], promote: ['Safety', 'Safety2'], extract: ['Safety', 'Safety2'] },
  MP82: { stage: ['Safety'], promote: ['Safety', 'Safety2'], extract: ['Safety'] },
};

/**
 * The script of a game-type-3 map that is not one of the disc's three ESCORT maps (a test's, a forge map): none is
 * read, so it plays The Mixer's and Foxhunt's shape -- the 30 s wait, Safety and Safety2 staging, promoted and
 * extracting -- and Foxhunt's kill stops (LATER 131, `ESCORT_KILLS_STOPPED_READING`), where the page reads that map's own
 * script (`stopsKills`), so the two can differ there. Not a game value; settled only by reading that map's own
 * `objectives`.
 */
export const ESCORT_UNREAD_MAP_PLACEHOLDER: EscortScript = { countdownS: 30, ...ESCORT_ZONES_READING.MP53! };

/**
 * [reading, pending review] ESCORT's hold from an extraction's decision to the round's end state (PR #331's review F2),
 * on the host's console, a SEAL's -- the room's convention for whose script it plays (`ELIMINATION_PERSPECTIVE_READING`,
 * as `modeRules`' 5 + 2 + 10): EndRescue's `hostages_rescued` sets `mp_winner = 0` (MP52 @6348, MP53 @6380, MP82
 * @5760); `escort_success` leaves its WHILE, WAIT 2 (MP52 @7208, MP53 @7240, MP82 @6620), `mp_score00 += 1`, WAIT 5
 * (@7268, @7300, @6680), and on a SEAL's console calls `success`: WAIT 20 (@7436, @7468, @6848), `round_count` and
 * `game_over`, WAIT 1 (@7472, @7504, @6884), then `mission_complete`. 2 + 5 + 20 + 1 = 28 s.
 */
export const ESCORT_RESCUE_HOLD_READING = 2 + 5 + 20 + 1;

/**
 * [reading, pending review] ESCORT's hold after the Terrorists' three VIP kills: `start`'s `killcount >= 3` branch on a
 * SEAL's console calls `success` itself, with no WAIT before it (MP52 @1984 -> @2192, MP53 @1984 -> @2224, MP82 @1940
 * -> @2140): WAIT 20 and WAIT 1, 21 s.
 */
export const ESCORT_KILLS_HOLD_READING = 20 + 1;

/**
 * [reading, pending review] LATER 131: VIPcheck against `start` inside one frame. Two VIP kills whose WAIT 2 end in the
 * same tick take `killcount` from 1 to 3 at once: the room tells VIPcheck's `escort` 'aborted' (its WHILE `killcount < 2`
 * left, MP52 @6684) and decides `hostageKills` in the same tick (`start`'s `killcount >= 3` branch, which stops VIPcheck,
 * @1984 / @2032), and the page's decision drops VIPcheck's pending lines: its first line posted, the rest not. The
 * original's order inside a frame is not read: if the zAnim interpreter steps an animation's running sequences in record
 * order (`start` @408, the kill one-shots @2672-@3568, VIPcheck @6644), VIPcheck's first line posts in that frame and
 * `start` stops it the next, as here; another order posts none. Settled by the interpreter's per-frame walk of an
 * animation's sequences, or a capture of two VIP kills inside one frame of each other.
 */
export const ESCORT_VIPCHECK_FRAME_ORDER_READING = 'record order: start, the kill one-shots, VIPcheck';

/** LATER 131: a deciding path that stops ESCORT's kill one-shots (`ESCORT_KILLS_STOPPED_READING`). */
export type EscortKillStop = 'terroristElimination' | 'sealWin' | 'timeout';

/**
 * [reading, pending review] LATER 131 (its re-check's finding 1; research 175 §4 "Who stops the kill one-shots", the
 * disc's MP52, MP53, MP82 `objectives` re-read 2026-10-20 through `tools/probe-npc-maps.ts`): the decisions whose path
 * stops HostKill1-3 / SealKill1-3, after which a kill adds nothing to `killcount` -- one waiting out its WAIT 2 is
 * stopped with it. `start`'s SEALs-eliminated branches on all three maps (MP52 and MP53 @1368-@1408, @1640-@1680,
 * @1912-@1952; MP82 @1348-@1388, @1612-@1652, @1876-@1916); `escort_success`, which runs on every SEAL win (`mp_winner
 * == 0`: the SEALs' elimination, the time-out, the rescue), on The Mixer (@7120-@7160) and Guidance (@6532-@6572), not on
 * Foxhunt, whose `mission_timer` stops them at the time-out (@7068-@7108). `start`'s `killcount >= 3` branches stop none.
 * A map none is read for plays Foxhunt's (`ESCORT_UNREAD_MAP_PLACEHOLDER`'s shape).
 */
export const ESCORT_KILLS_STOPPED_READING: Readonly<Record<string, readonly EscortKillStop[]>> = {
  MP52: ['terroristElimination', 'sealWin'], MP53: ['terroristElimination', 'timeout'], MP82: ['terroristElimination', 'sealWin'],
};

/** LATER 131: the paths a decision takes that may stop the kill one-shots (`ESCORT_KILLS_STOPPED_READING`). */
function killStopsOf(d: { reason: string | undefined; winner: Team }): EscortKillStop[] {
  if (d.winner === 'terrorist') return d.reason === 'elimination' ? ['terroristElimination'] : [];
  return d.reason === 'timeout' ? ['sealWin', 'timeout'] : ['sealWin'];
}

/** The ESCORT script the room plays on `stem`: the read one, else `ESCORT_UNREAD_MAP_PLACEHOLDER`. */
export function escortScriptOf(stem: string): EscortScript {
  const s = stem.toUpperCase();
  const zones = ESCORT_ZONES_READING[s], countdownS = ESCORT_COUNTDOWN_READING[s];
  return zones && countdownS !== undefined ? { countdownS, ...zones } : ESCORT_UNREAD_MAP_PLACEHOLDER;
}

/** The parts' table of `HOSTAGE_PARTS`, in `PART` order (head, rarm, larm, body, rleg, lleg). */
function hostageHealth(): Health {
  const r = HOSTAGE_PARTS;
  const max = [r.head, r.arms, r.arms, r.body, r.legs, r.legs];
  return { hp: [...max], armour: max.map(() => r.armor), max };
}

const POSTURES = ['stand', 'crouch', 'prone'] as const;

/** The wire's opacity: the AI word's nibble (`HOSTAGE_STATE_RATE_READING`, D:L432905-432913, read back D:L432833). */
function wireOpacity(ai: HostageAi): number {
  const n = ai.hidden || ai.opacity <= 0 ? 15 : Math.min(15, Math.trunc((1 - ai.opacity) * 15));
  return 1 - n / 15;
}

export class ExtractionAuthority {
  readonly hostages: Hostage[];
  readonly valves: ExtractionValves = { rescuecount: 0, freecount: 0, killcount: 0, rescuecheck: 0, penalty: 0, bySeals: 0, byTurds: 0 };
  /** A hook run once a game frame for every living hostage, after its AI's step and the rescue test (`rescueTest`). None here. */
  onFrame: ((h: Hostage) => void) | null = null;
  /** The one-shots fired this round (HostKill1-3, SealKill1-3: each once; Rescue1-3 by hostage id). */
  private fired = { hostKill: 0, sealKill: 0, rescue: new Set<number>() };
  /** HX-5: the map's kind-1 zones (EXTRACT_ZONE), tested on the hostages' sub-map-0 cells (HX-4a's `cells`). */
  private readonly zones: readonly AiZone[];
  /** The one-shots' valve moves waiting out their WAIT 2 (`ONE_SHOT_WAIT_READING`). */
  private pending: { at: number; kind: 'hostKill' | 'sealKill' }[] = [];
  /** `mp_penalty` as the game-state update last saw it (game +0xc0, D:L150711-150716). */
  private penaltySeen = 0;
  private readonly frames = new GameFrameAccumulator();
  /** Each hostage's last `hostageState`, by id: one goes out when it changes. */
  private readonly told = new Map<number, string>();
  private readonly listeners = new Map<ExtractionEventKind, Set<(e: ExtractionEvent) => void>>();
  /** HX-4a (research 239 s2): the leaders' counts (`+0x520`, `HOSTAGES_CONTROLLED_READING`). */
  readonly leaders = new HostageLeaders();
  /** HX-4a: sub-map 0's grid, the order's cells (`ORDER_CELL_FIELD_READING`); null without the AI maps (no order). */
  private readonly cells: AiGrid | null;
  private readonly planner: HostagePathPlanner | null;
  private readonly obstacles = new HostageObstacles();
  private readonly yieldRandom = new HostageYieldRandom(HOSTAGE_YIELD_SEED_PLACEHOLDER);
  private readonly occupiedActors = new Set<number>();
  private readonly trails = new Map<number, FollowTrail>();
  private frameBodies: readonly HostageWorldBody[] = [];
  /**
   * EXTRACTION (game type 4) or ESCORT (game type 3). Escort plays research 175 §4 with the map's script
   * (`escortScriptOf`): a staging latch, SEALcheck's wait, then the promotion and the extraction zones.
   */
  readonly mode: 'extraction' | 'escort';
  /** ESCORT's script on this map (`ESCORT_COUNTDOWN_READING`, `ESCORT_ZONES_READING`). */
  private readonly escort: EscortScript;
  /** LATER 131: the deciding paths that stop this map's kill one-shots (`ESCORT_KILLS_STOPPED_READING`). */
  private readonly killsStoppedBy: readonly EscortKillStop[];
  /** The zones RescueN latches a VIP in (`EscortScript.stage`). */
  private readonly stageZones: readonly AiZone[];
  /** The zones SEALcheck makes kind 1 after its wait (`EscortScript.promote`): the AI's rescue test reads them then. */
  private readonly promoteZones: readonly AiZone[];
  /** The zones EndRescueN extracts a living VIP in (`EscortScript.extract`). */
  private readonly extractZones: readonly AiZone[];
  /** The VIPs RescueN latched. Leaving does not clear one; its death does. */
  private readonly latched = new Set<number>();
  /** Whether SEALcheck's wait has ended: the promotions made and EndRescue1-3 running. */
  private promoted = false;
  private countdownAt: number | null = null;
  private truecount = 0;
  private escortKillsFired = 0;
  private readonly escortPending: { at: number; kind: 'kill' | 'extract'; hostage?: number }[] = [];
  /** LATER 131: whether VIPcheck still waits for `killcount >= 2` (its lines told once, then it ends). */
  private vipCheck: 'running' | 'stopped' = 'running';
  private readonly extractedIds = new Set<number>();

  /**
   * The room's escortees on EXTRACTION (game type 4, `missionlist.rdr` TYPE, `FUN_002c9540` D:L168883) or ESCORT
   * (game type 3, the same function: TYPE `ESCORT` -> 3; research 192 §1 lists MP52, MP53, MP82) when the map has
   * escortee starts (`SimMap.escortees`, HX-0b). Null on any other type, or on a map with none.
   */
  static of(map: SimMap, host: ExtractionHost): ExtractionAuthority | null {
    if ((map.gameType !== 4 && map.gameType !== 3) || !map.escortees?.length) return null;
    return new ExtractionAuthority(map.escortees, host, map);
  }

  private constructor(starts: readonly EscorteeStart[], private readonly host: ExtractionHost, private readonly map: SimMap) {
    const ai = map.ai;
    this.mode = map.gameType === 3 ? 'escort' : 'extraction';
    this.escort = escortScriptOf(map.stem);
    this.killsStoppedBy = ESCORT_KILLS_STOPPED_READING[map.stem.toUpperCase()] ?? ESCORT_KILLS_STOPPED_READING.MP53!;
    const zones = ai ? ai.maps.flatMap((sub) => sub.zones) : [];
    const named = (names: readonly string[]): AiZone[] => {
      const want = new Set(names.map((n) => n.toLowerCase()));
      return zones.filter((zone) => want.has(zone.name.toLowerCase()));
    };
    this.stageZones = named(this.escort.stage);
    this.promoteZones = named(this.escort.promote);
    this.extractZones = named(this.escort.extract);
    // Research 333 §4: the room's planner queue, served once a game frame in `step` (HOSTAGE_PATH_SLICE_READING).
    this.planner = ai ? new HostagePathPlanner(ai, this.obstacles, HOSTAGE_PATH_SLICE_BUDGET_PLACEHOLDER.expansions) : null;
    this.cells = ai?.maps[0] ?? null;
    this.zones = ai ? zonesOfKind(ai, 1).map((z) => z.zone) : [];
    // HX-0b's review: the starts' `at` tuples are shared by reference across the map's rooms -- copied, every one.
    this.hostages = starts.map((s, i) => {
      const start: EscorteeStart = { ...s, loc: { ...s.loc }, at: [s.at[0], s.at[1], s.at[2]] };
      return {
        id: HOSTAGE_ID_BASE + i, name: s.name, character: s.character, start, at: [...start.at], yaw: s.yaw, alive: true,
        health: hostageHealth(), ai: null as unknown as HostageAi, motion: this.planner ? new HostageFollow(this.planner, map.grid, [...start.at], s.yaw, map.defaultMaterial, host.clips ?? null,
          { id: HOSTAGE_ID_BASE + i, actors: () => this.probeActors(), yieldRandom: () => this.yieldRandom.next() }) : null, leader: null, lastLeader: null, diedAt: -1,
        deathClip: null, deathCause: null, history: [],
      };
    });
    for (const h of this.hostages) h.ai = this.newAi(h);
    for (const h of this.hostages) this.told.set(h.id, JSON.stringify(this.stateOf(h)));
  }

  /** Research334 §10. Live identities and retained navigation, independent of occupancy bit32.
   * Exact original neighbor sorting/global actor-probe disable remain FOLLOW_STEERING_PLACEHOLDER.
   * This room has online players and hostage AI only; Yield identity is live; ctrl265 exclusion producers remain absent.
   */
  private probeActors(): HostageActor[] {
    const players: HostageActor[] = this.frameBodies.filter(b => b.velocity !== undefined).map(b => ({
      id: b.id, alive: b.alive, cell: this.obstacles.actorCell(b.id), velocity: b.velocity!, position: b.feet, rawCell: this.planner?.locate(b.feet) ?? null, ai: false,
      stance: b.stance ?? 0, excluded: false, yieldTo: null, probeRefused: false,
    }));
    return [...players, ...this.hostages.map(h => ({
      id: h.id, alive: h.alive && !h.ai.hidden, cell: this.obstacles.actorCell(h.id), velocity: h.motion?.bodyVelocity ?? [0, 0, 0] as V3,
      position: h.at, rawCell: this.planner?.locate(h.at) ?? null, ai: true, stance: h.ai.stance, excluded: false, yieldTo: h.motion?.yieldTo ?? null,
      // FUN_00573130 D:L434883–434914: team10000000 sets refusal; escortee80000000 does so only offline.
      probeRefused: (h.start.team & 0x10000000) !== 0,
    }))];
  }

  /**
   * A fresh AI for `h`, with Follow's end wired (HX-4a, `createOrderedHostage`'s rule): state 9 ended by signal 1 -- HOLD's
   * unwind, the rescue's Replace, the driver's pop after a release -- releases the leader (`ControlHostageAction(ai, 0)`,
   * the count -1, `lastLeader` kept; research 199 s1).
   */
  private newAi(h: Hostage): HostageAi {
    return new HostageAi({
      id: h.id, random: () => this.host.random(),
      signal: (state, signal) => {
        if (state.id === 9 && (signal === 1 || signal === 2)) h.motion?.stop();
        if (state.id === 9 && signal === 1 && h.leader !== null) {
          const old = h.leader;
          this.leaders.controlHostageAction(h, null);
          if (!this.hostages.some(other => other !== h && other.alive && other.leader === old)) this.trails.delete(old);
        }
      },
      follow: (dt, id) => {
        const body = this.frameBodies.find(b => b.id === id && b.alive), trail = this.trails.get(id);
        if (!h.motion || !body || !trail || body.yaw === undefined || !body.velocity || body.topSpeed === undefined) {
          if (h.motion) { h.motion.stop(); if (h.motion.physics(dt)) h.at = h.motion.feet; h.yaw = h.motion.yaw; }
          return null;
        }
        const leader: FollowLeader = { id, feet: body.feet, yaw: body.yaw, velocity: body.velocity, topSpeed: body.topSpeed, stance: body.stance ?? 0 };
        // Individual FOLLOW explicitly assigns slot 0: FUN_0058fbe0 D:L450398-450399.
        h.motion.step(dt, leader, trail, 0);
        h.at = h.motion.feet; h.yaw = h.motion.yaw;
        return h.motion;
      },
    });
  }

  /** A listener; returns its removal. */
  on(kind: ExtractionEventKind, listener: (e: ExtractionEvent) => void): () => void {
    let set = this.listeners.get(kind);
    if (!set) this.listeners.set(kind, set = new Set());
    set.add(listener);
    return () => set.delete(listener);
  }

  /** HX-5's rescue (and HX-4a's orders) tell the room's listeners through this. */
  emit(e: ExtractionEvent): void {
    for (const l of this.listeners.get(e.kind) ?? []) l(e);
  }

  /** The hostage of body id `id`, or undefined. */
  hostage(id: number): Hostage | undefined {
    return this.hostages[id - HOSTAGE_ID_BASE];
  }

  /**
   * A round's start: `reset`'s valves to 0 (`rescue`, `rescuecount`, `rescuecheck`, `freecount`, `killcount`,
   * `mp_penalty`; 190 s4 C) and the game's `mp_hostages_by_seals` / `_turds` (`FUN_002a6c50` D:L149084-149097); every
   * one-shot armed again; the three hostages at their starts, alive, healthy, a fresh AI in 0x17 sub-state 3 in the
   * escortee unit (`FUN_00573130` D:L434903-434915; the level is a reload, research 91 s18.2.4) -- every page told.
   */
  reset(tell = true): void {
    for (const k of Object.keys(this.valves) as (keyof ExtractionValves)[]) this.valves[k] = 0;
    this.leaders.clear();
    this.trails.clear(); this.frameBodies = [];
    this.obstacles.clear(); this.occupiedActors.clear();
    this.fired = { hostKill: 0, sealKill: 0, rescue: new Set() };
    this.pending = [];
    this.penaltySeen = 0;
    this.latched.clear();
    this.promoted = false;
    this.countdownAt = null;
    this.truecount = 0;
    this.escortKillsFired = 0;
    this.escortPending.length = 0;
    this.vipCheck = 'running';
    this.extractedIds.clear();
    this.frames.reset();
    this.planner?.cancelAll();
    for (const h of this.hostages) {
      h.at = [...h.start.at];
      h.yaw = h.start.yaw;
      h.alive = true;
      h.health = hostageHealth();
      h.motion = this.planner ? new HostageFollow(this.planner, this.map.grid, [...h.start.at], h.start.yaw, this.map.defaultMaterial, this.host.clips ?? null,
        { id: h.id, actors: () => this.probeActors(), yieldRandom: () => this.yieldRandom.next() }) : null;
      h.ai = this.newAi(h);
      h.leader = h.lastLeader = null;
      h.diedAt = -1;
      h.deathClip = null; h.deathCause = null;
      h.history.length = 0;
    }
    if (tell) this.publish(true);
  }

  /** Every hostage's state to every page now (the room's round start, after its `roundStart`: research 239 s3). */
  tellAll(): void {
    this.publish(true);
  }

  /**
   * One room tick, before the room's clock (as the bomb's): while the level runs, each living hostage's AI at the game
   * frame (`AI_FRAME_READING`: the 60 Hz tick into whole `GAME_FRAME_DT` frames), HX-5's `onFrame` after it; the
   * one-shots due; SEALcheck; then every changed state told.
   */
  step(): void {
    if (!this.host.live()) { this.publish(); return; }
    const frames = this.frames.advance(1 / TICK_HZ);
    if (frames > 0) {
      const players = this.host.bodies();
      this.frameBodies = players;
      for (let k = 0; k < frames; k++) {
        this.unitTick();                                          // HX-4a: the UnitTick (FUN_005e8060), every frame online
        for (const id of new Set(this.hostages.filter(h => h.alive && h.leader !== null).map(h => h.leader!))) {
          const leader = players.find(p => p.id === id && p.alive);
          const loc = leader && this.planner?.locate(leader.feet);
          if (!loc) continue;
          let trail = this.trails.get(id);
          if (!trail) this.trails.set(id, trail = new FollowTrail());
          if (leader.yaw !== undefined && leader.velocity && leader.topSpeed !== undefined)
            trail.updateHeading(GAME_FRAME_DT, { id, feet: leader.feet, yaw: leader.yaw, velocity: leader.velocity, topSpeed: leader.topSpeed, stance: leader.stance ?? 0 });
          // FUN_005b7ba0 D:L471291-471324: a trail point only on a traversable cell (FUN_0052a090); a blocked frame adds nothing.
          if (this.planner!.traversable(loc)) trail.add(loc, this.planner!.width(loc));
        }
        for (const id of this.trails.keys()) if (!this.hostages.some(h => h.alive && h.leader === id)) this.trails.delete(id);
        const bodies: HostageWorldBody[] = [...players, ...this.hostages.map((h) => ({ id: h.id, feet: h.at, alive: h.alive, team: h.start.team }))];
        // FUN_005b7ba0 updates the last navigable actor cell; raw blocked cells retain the old stamp.
        const active = new Set(bodies.filter(b => b.alive).map(b => b.id));
        for (const id of this.occupiedActors) if (!active.has(id)) {
          this.obstacles.removeActor(id); this.occupiedActors.delete(id);
        }
        for (const body of bodies) if (body.alive) {
          const loc = this.planner?.locate(body.feet);
          if (loc && this.planner!.traversable(loc)) {
            this.obstacles.moveActor(body.id, loc); this.occupiedActors.add(body.id);
          }
        }
        for (const h of this.hostages) {
          if (!h.alive) {
            // LATER 354: a corpse the blast threw is stepped until its Land is held on the floor (`thrown`; no AI).
            if (h.motion?.thrown) { h.motion.physics(GAME_FRAME_DT); h.at = h.motion.feet; h.yaw = h.motion.yaw; }
            continue;
          }
          h.ai.step(GAME_FRAME_DT, { feet: h.at, bodies });
          if (h.ai.state !== 9 && h.motion) {
            h.motion.stop();
            if (h.motion.physics(GAME_FRAME_DT)) h.at = h.motion.feet;
            h.yaw = h.motion.yaw;
          }
          const at = this.planner?.locate(h.at);
          if (at && this.planner!.traversable(at)) this.obstacles.moveActor(h.id, at);
          this.rescueTest(h);
          this.onFrame?.(h);
        }
        // The planner task after the unit tick in the frame (priorities 10.5 and 0.8, D:L50931, D:L50920; research 333 §4).
        this.planner?.slice();
      }
    }
    this.script();
    this.publish();
  }

  /** Whether a hostage's cell lies in a kind-1 zone: the map's own, or (escort, after the wait) one SEALcheck promoted. */
  inZone(h: Hostage): boolean {
    return this.cellIn(h.at, this.zones) || (this.promoted && this.cellIn(h.at, this.promoteZones));
  }

  /**
   * The cell the zone test reads. EXTRACTION keeps sub-map 0 (`aiCellOf`, the `+0xe4` stand-in, research 237 §1.5).
   * ESCORT uses the follower's locator so a zone on another sub-map (The Mixer's Safety on sub-map 7, research 175
   * §5.5) is not credited to a body on the floor below it.
   */
  private locOf(at: V3): AiLoc | null {
    if (this.mode === 'escort') return this.planner?.locate(at) ?? null;
    if (!this.cells) return null;
    return aiCellOf(this.cells, at[0], at[2]);
  }

  private cellIn(at: V3, zones: readonly AiZone[]): boolean {
    if (!zones.length) return false;
    const loc = this.locOf(at);
    return loc !== null && zones.some((z) => zoneContains(z, loc));
  }

  /**
   * The escortee post-tick's rescue (`RESCUE_TEST_READING`, `FUN_0056f970` D:L432964-432985): a last leader set and the
   * cell in the zone; the leader looked up through the room's seats (`ExtractionHost.seat`: a departed one forgotten, `RESCUE_DEAD_LEADER_READING`); 0x11 replacing the
   * top with the leader as rescuer (HX-3's `rescue`, refused while 0x11 is on top); then `rescued` to the listeners (the
   * room's credit, `RESCUE_CREDIT_READING`). R4B-04 (r0004, OT.R97): no test while 0x11 is on the stack
   * (`RESCUE_STACK_GATE_READING`), and the credit only when the rescued bit was clear before the Replace
   * (`RESCUE_CREDIT_ONCE_READING`): a hostage that leaves 0x11 (HX-3's `hold`; r0004's order test no longer offers a
   * HOLD in 0x11, `RESCUED_REORDER_READING`) re-enters it with no credit. r0001 credited again (owner call 1, HX.R5;
   * superseded).
   */
  private rescueTest(h: Hostage): void {
    if (h.lastLeader === null || !this.inZone(h)) return;
    if (h.ai.stack.has(0x11)) return;                                                   // r4 0x574e40-0x574e4c
    const seat = this.host.seat?.(h.lastLeader);
    if (!seat || seat.spectator || seat.team === null) { h.lastLeader = null; return; }   // D:L432971-432972: +0x5d8 = -1
    const credit = !h.ai.rescued;                                                       // r4 0x574e8c-0x574eb0: sampled before the push
    if (!h.ai.rescue(seat.id)) return;
    // The Replace ended a state 9 (Follow's end, `newAi`'s signal: the lead released); a lead left by any other way is
    // released as a death releases it -- the leader's count -1, `lastLeader` kept (research 239 s2.3).
    if (h.leader !== null) this.leaders.controlHostageAction(h, null);
    if (credit) this.emit({ kind: 'rescued', hostage: h, by: { id: seat.id, team: seat.team } });   // r4 0x574f00-0x574f0c
  }

  /**
   * The script's one-shots and SEALcheck (polled once a tick): HostKillN at `byTurds >= N`, SealKillN at `bySeals >= N`,
   * RescueN on its hostage in the zone (`RESCUE_VALVE_READING`).
   */
  private script(): void {
    if (this.mode === 'escort') { this.scriptEscort(); return; }
    const now = this.host.tick(), wait = Math.round(ONE_SHOT_WAIT_READING * TICK_HZ);
    for (const h of this.hostages) {
      if (this.fired.rescue.has(h.id) || !this.inZone(h)) continue;
      this.fired.rescue.add(h.id);
      this.valves.rescuecount++;                                 // "A HOSTAGE HAS BEEN RESCUED"
      this.valves.freecount++;
    }
    while (this.fired.hostKill < Math.min(3, this.valves.byTurds)) { this.fired.hostKill++; this.pending.push({ at: now + wait, kind: 'hostKill' }); }
    while (this.fired.sealKill < Math.min(3, this.valves.bySeals)) { this.fired.sealKill++; this.pending.push({ at: now + wait, kind: 'sealKill' }); }
    const due = this.pending.filter((p) => p.at <= now);
    this.pending = this.pending.filter((p) => p.at > now);
    for (const p of due) {
      if (p.kind === 'hostKill') this.valves.rescuecount++;      // "THE SEALS HAVE BEEN CREDITED WITH RESCUING THAT HOSTAGE"
      else this.valves.penalty++;                                // "ONE MINUTE HAS BEEN DEDUCTED FROM THE MISSION TIMER"
      this.valves.killcount++;
    }
    if (!this.valves.rescuecheck && sealCheck(this.valves.freecount, this.valves.killcount)) this.valves.rescuecheck = 1;
  }

  /**
   * ESCORT's watchers (research 175 §4), on the map's script (`escortScriptOf`). RescueN latches a living VIP the first
   * time its cell is in a staging zone; leaving does not undo it, and that VIP's death decrements `rescuecount`.
   * SEALcheck starts once `rescuecount` is 3, or 2 with `killcount` already 1, waits (`ESCORT_COUNTDOWN_READING`), then
   * promotes its zones and starts EndRescue1-3: whichever zone the VIPs staged in, the extraction zones are the
   * script's (`ESCORT_ZONES_READING`: Safety or Safety2 on The Mixer and Foxhunt, Safety only on Guidance). A living
   * VIP in one sets `truecount` and, after EndRescue's WAIT 2, `rescuecheck`. A kill by either side adds `killcount`
   * after the same WAIT 2 and never `mp_penalty`. LATER 131: every page told each script line's moment (`escort`) --
   * RescueN's latch (MP52 @3836-@3852), VIPcheck's `killcount >= 2` while it runs (@6684-@6740: SEALcheck stops it at its
   * gate, @5624 / @6040, and every decision does, `ExtractionHost.decided`), EndRescueN's `truecount += 1` (@4512-@4536)
   * -- naming the VIP by its record's name. After the Terrorists' elimination win SEALcheck is stopped: no countdown starts
   * and a running one promotes nothing (its review's F2). Two kills due in one tick: VIPcheck's told, then `start`'s
   * decision (`ESCORT_VIPCHECK_FRAME_ORDER_READING`).
   */
  private scriptEscort(): void {
    const now = this.host.tick(), wait = Math.round(ONE_SHOT_WAIT_READING * TICK_HZ);
    const decided = this.host.decided?.() ?? null;
    // The kill one-shots the deciding path stopped (`ESCORT_KILLS_STOPPED_READING`; its re-check's finding 1): a WAIT 2
    // still running adds nothing, nor a later kill.
    const killsStopped = decided !== null && killStopsOf(decided).some((k) => this.killsStoppedBy.includes(k));
    const due = this.escortPending.filter((p) => p.at <= now);
    for (let i = this.escortPending.length - 1; i >= 0; i--) if (this.escortPending[i]!.at <= now) this.escortPending.splice(i, 1);
    for (const p of due) {
      if (p.kind === 'kill') { if (!killsStopped) this.valves.killcount++; }
      else this.valves.rescuecheck++;
    }
    for (const h of this.hostages) {
      if (!h.alive || this.latched.has(h.id) || !this.cellIn(h.at, this.stageZones)) continue;
      this.latched.add(h.id);
      this.valves.rescuecount++;
      this.host.send({ type: 'escort', kind: 'staged', vip: h.name });         // "A VIP IS IN THE EXTRACTION ZONE"
    }
    // VIPcheck before SEALcheck's gate: killcount 2 cannot open the gate in the same tick (it needs killcount 1, or three
    // living VIPs staged). Stopped by every decision (its review's F1): `start`'s branches stop it, and the time-out the
    // kill one-shots, so `killcount` never reaches its test after it.
    if (this.countdownAt !== null || decided !== null) this.vipCheck = 'stopped';
    // SEALcheck: stopped by `start`'s SEALs-eliminated branches (MP52 @1248 / @1520 / @1792) -- no countdown, no promotion.
    const sealCheck = !(decided?.reason === 'elimination' && decided.winner === 'terrorist');
    if (this.vipCheck === 'running' && this.valves.killcount >= 2) {
      this.vipCheck = 'stopped';
      this.host.send({ type: 'escort', kind: 'aborted' });                    // "... TWO OF THE THREE VIPS HAVE BEEN KILLED."
    }
    const gate = this.valves.rescuecount === 3 || (this.valves.rescuecount === 2 && this.valves.killcount === 1);
    if (this.countdownAt === null && gate && sealCheck) this.countdownAt = now;
    const countdown = Math.round(this.escort.countdownS * TICK_HZ);
    if (!this.promoted && sealCheck && this.countdownAt !== null && now >= this.countdownAt + countdown) this.promoted = true;
    const deaths = Math.min(3, this.valves.bySeals + this.valves.byTurds);
    while (this.escortKillsFired < deaths) {
      this.escortKillsFired++;
      if (!killsStopped) this.escortPending.push({ at: now + wait, kind: 'kill' });
    }
    if (this.promoted) {
      for (const h of this.hostages) {
        if (!h.alive || this.extractedIds.has(h.id) || !this.cellIn(h.at, this.extractZones)) continue;
        this.extractedIds.add(h.id);
        this.truecount++;
        this.host.send({ type: 'escort', kind: 'extracted', vip: h.name });  // "A VIP HAS BEEN EXTRACTED"
        this.escortPending.push({ at: now + wait, kind: 'extract', hostage: h.id });
      }
    }
  }

  /** Each living hostage's past, once a tick after the movers (`Room.remember`), at most `keep` ticks. */
  remember(tick: number, keep: number): void {
    for (const h of this.hostages) {
      h.history.push({ tick, feet: [...h.at], yaw: h.yaw, posture: POSTURES[h.ai.stance], alive: h.alive && !h.ai.hidden, tilt: h.motion?.rootTilt ?? null });
      if (h.history.length > keep) h.history.shift();
    }
  }

  /**
   * Whether a hostage is a body the picks and the rounds meet now: alive and not hidden by its fade (the node inactive,
   * D:L422207). Inside the fade it is; whether a hit on it does anything is the room's gate (`rescuedRefuses`, R4B-04).
   */
  targetable(h: Hostage): boolean {
    return h.alive && !h.ai.hidden;
  }

  /** The posture its hit volumes take: the AI's stance (its own skeleton's idles, the room's `volumesOf({ escortee })`). */
  posture(h: Hostage): 'stand' | 'crouch' | 'prone' {
    return POSTURES[h.ai.stance];
  }

  /**
   * A hostage's death (`FUN_0059ee20` D:L458059, its escortee branch D:L458083-458145, online): its body down, its AI
   * stopped (`DEAD_IN_FADE_READING`); a seated killer's side counted -- a Terrorist `mp_hostages_by_turds` += 1
   * (D:L458127), a SEAL `mp_hostages_by_seals` += 1 (D:L458123) -- none for a death with no seated killer
   * (`WORLD_KILL_UNCOUNTED_READING`); the script's one-shots follow (`step`). Every page told a `kill` of a hostage
   * (`victimKind`, no line: `HOSTAGE_KILL_LINE_READING`), then the listeners (HX-5's score, `FUN_00545390`). Nobody kicked.
   */
  killed(h: Hostage, by: ExtractionActor | null, info: HostageKillInfo): void {
    if (!h.alive) return;
    h.alive = false;
    h.motion?.stop();
    if (h.motion) {
      h.motion.dead = true;                      // LATER 354: a thrown corpse lands and stays down
      h.motion.velocity = [0, 0, 0];             // A corpse is stepped only while thrown; never retain a moving snapshot forever.
    }
    if (h.leader !== null) this.leaders.controlHostageAction(h, null);   // LED_HOSTAGE_DEATH_COUNT_READING
    h.ai.alive = false;
    h.diedAt = this.host.tick();
    h.deathClip = info.clip; h.deathCause = info.cause;
    if (by) {
      if (by.team === 'terrorist') this.valves.byTurds++;
      else this.valves.bySeals++;
    }
    // Research 175 §4 item 1: a staged VIP's death decrements the latch. It does not touch Extraction's minute.
    if (this.mode === 'escort' && this.latched.delete(h.id)) this.valves.rescuecount = Math.max(0, this.valves.rescuecount - 1);
    this.host.send({
      type: 'kill', killer: by?.id ?? null, victim: h.id, weapon: info.weapon, how: info.how, clip: info.clip, cause: info.cause,
      voiced: true, victimKind: 'hostage', ...(info.killerName !== undefined ? { killerName: info.killerName } : {}),
    });
    this.emit({ kind: 'killed', hostage: h, by });
    this.publish();
  }

  /**
   * `start`'s chain after the room's elimination (branches 1-2; 190 s4.2 C2), in order: `rescuecount >= 2 AND
   * rescuecheck == 1` -- the SEALs after `RESCUE_WIN_HOLD_READING`; `mp_hostages_by_seals >= 2` -- the Terrorists after
   * `HOSTAGE_KILL_WIN_HOLD_READING`; else null (the time-out is the room's: a draw).
   */
  result(): { winner: Team; hold: number; reason: 'rescue' | 'hostageKills' } | null {
    if (this.mode === 'escort') return this.escortResult();
    if (this.valves.rescuecount >= 2 && this.valves.rescuecheck === 1) return { winner: 'seal', hold: RESCUE_WIN_HOLD_READING, reason: 'rescue' };
    if (this.valves.bySeals >= 2) return { winner: 'terrorist', hold: HOSTAGE_KILL_WIN_HOLD_READING, reason: 'hostageKills' };
    return null;
  }

  /**
   * ESCORT's `hostages_rescued` and `start` (research 175 §4 items 5-6). One living VIP extracted after the staging
   * gate (`truecount >= 1` and `rescuecheck >= 1`) wins for the SEALs after `ESCORT_RESCUE_HOLD_READING` (EndRescue's
   * WAIT 2 has already elapsed). `killcount >= 3` wins for the Terrorists after `ESCORT_KILLS_HOLD_READING`, but only
   * while `start` runs: EndRescue stops it (`startStopped`), and it is `start` that makes the Terrorist award.
   */
  private escortResult(): { winner: Team; hold: number; reason: 'rescue' | 'hostageKills' } | null {
    if (this.truecount >= 1 && this.valves.rescuecheck >= 1) return { winner: 'seal', hold: ESCORT_RESCUE_HOLD_READING, reason: 'rescue' };
    if (!this.startStopped() && this.valves.killcount >= 3) return { winner: 'terrorist', hold: ESCORT_KILLS_HOLD_READING, reason: 'hostageKills' };
    return null;
  }

  /**
   * Whether the map's script has stopped its `start` watcher -- the one that awards the round on an elimination and on
   * `killcount >= 3`. ESCORT's EndRescueN stops it as it raises `truecount`, before its WAIT 2 (MP52 @4512/@4528, MP53
   * @4544/@4560, MP82 @4284/@4300), so from an extraction on only `hostages_rescued` decides the round (research 175 §4
   * item 4). The room asks it before its elimination. Never on EXTRACTION.
   */
  startStopped(): boolean {
    return this.mode === 'escort' && this.truecount >= 1;
  }

  /** Whether `mp_penalty` rose since the last look (`PENALTY_COALESCE_READING`: one minute however many rises). */
  takePenalty(): boolean {
    if (this.valves.penalty <= this.penaltySeen) return false;
    this.penaltySeen = this.valves.penalty;
    return true;
  }

  /** A hostage's state as `hostageState` carries it. */
  stateOf(h: Hostage): HostageStateWire {
    const rescued = h.ai.stack.find(0x11);
    return {
      id: h.id, alive: h.alive, ai: h.ai.state ?? 0, leader: h.leader, rescuer: rescued && rescued.owner >= 0 ? rescued.owner : null,
      opacity: wireOpacity(h.ai), unit: h.ai.unit,
    };
  }

  /** The hostages as the welcome carries them (`welcome.hostages`), for a joiner: each in its current state (191 s6). */
  wire(): HostageWire[] {
    const tick = this.host.tick();
    return this.hostages.map((h) => ({
      name: h.name, character: h.character, at: [...h.at], yaw: h.yaw, ...this.stateOf(h),
      // A dead one's death as the join envelope's corpses carry it (research 231 s4): its clip and its age in ticks.
      ...(!h.alive && h.diedAt >= 0 ? { deathClip: h.deathClip, age: tick - h.diedAt } : {}),
    }));
  }

  /**
   * The hostages' bodies for the snapshot: one `BodyState` each -- `weapon` 255 (no item), `slot` 0, the AI's stance,
   * `Alive` while alive, the rest at rest; a hidden one (the fade's end, opacity 0) left out (`DEAD_IN_FADE_READING`).
   */
  bodies(): BodyState[] {
    return this.hostages.filter((h) => !h.ai.hidden).map((h) => {
      const stance = h.ai.stance, pose = h.alive ? h.motion?.traversalPose : null, a = h.motion?.action ?? null;
      return {
        id: h.id, feet: [...h.at], yaw: h.yaw, pitch: 0,
        vx: h.motion?.velocity[0] ?? 0, vy: h.motion?.velocity[1] ?? 0, vz: h.motion?.velocity[2] ?? 0,
        flags: (h.alive ? BodyFlag.Alive : 0) | (stance === 1 ? BodyFlag.Crouched : 0)
          | (pose?.loop ? BodyFlag.TravLoop : 0) | (pose?.holdRootTurn ? BodyFlag.TravHoldRootTurn : 0)
          | (h.motion?.airborne ? BodyFlag.Airborne : 0) | (a?.reversed ? BodyFlag.ActionReversed : 0),
        stance, landing: 0, jumps: 0, ground: 0, groundForward: 0, groundRight: 0, groundCls: 0,
        // LATER 354: the body's action (a knock's Fall, Land, get-up), as `net/body.ts` `bodyOf` codes it.
        action: a ? ACTION_CODES.indexOf(a.name) + 1 : 0, actionSerial: a ? a.serial & 0xff : 0, actionT: a?.t ?? 0,
        actionSeconds: a?.seconds ?? -1, overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0,
        // Existing browser snapshot encoding, identical to net/body.ts bodyOf.
        trav: pose ? TRAVERSAL_CLIPS.indexOf(pose.clip) + 1 : 0, travFrame: pose?.frame ?? 0,
        travRootY: pose?.rootY ?? Number.NaN, travBlend: pose?.blend ? TRAVERSAL_CLIPS.indexOf(pose.blend.clip) + 1 : 0,
        travBlendWeight: pose?.blend?.weight ?? 0, peek: 0, weapon: 255, slot: 0,
      };
    });
  }

  /**
   * HX-4a (research 239 s1-s2, s9.1): a player's order (`hostageOrder`) -- the issuer's console's test run by the room
   * (`orderRefusal`, `ORDER_VALIDATION_READING`) on sub-map 0's cells and the room's pick; refused, the room's tally
   * (`dropped`) and nothing else; taken, OnCommand's case (`onCommand`: FOLLOW or HOLD) and every page told. The refusal
   * or null.
   */
  order(issuerId: number, ev: HostageOrderEvent): OrderRefusal | 'unknown hostage' | null {
    const h = this.hostage(ev.hostage);
    const issuer = this.host.seat?.(issuerId);
    const why = !h ? 'unknown hostage' : !issuer || !this.host.pick ? 'not alive' : orderRefusal({
      cmd: ev.cmd,
      issuer: { id: issuer.id, alive: issuer.alive, spectator: issuer.spectator, team: issuer.team ? PLAYER_TEAM_MASKS[issuer.team] : 0, feet: issuer.feet },
      hostage: { id: h.id, alive: h.alive, team: h.start.team, feet: h.at, unit: h.ai.unit, hidden: h.ai.hidden, rescued: h.ai.state === 0x11 },
      eye: ev.eye, dir: ev.dir,
    }, {
      cellOf: (f) => (this.cells ? aiCellOf(this.cells, f[0]!, f[2]!) : null),
      pick: (eye, dir) => this.host.pick!(issuerId, [eye[0]!, eye[1]!, eye[2]!], [dir[0]!, dir[1]!, dir[2]!], ev.seq, h!.id),
    });
    if (why || !h || !issuer) { this.host.dropped?.(why ?? 'not alive', issuerId); return why ?? 'not alive'; }
    onCommand(h, ev.cmd, { id: issuer.id, alive: issuer.alive }, this.leaders);
    this.publish();
    return null;
  }

  /**
   * HX-4a (`LEADER_RELEASE_READING`): a seat's death or departure releases every hostage it leads (`releaseLeader`), and
   * the UnitTick's HOLD follows at once (`UNIT_TICK_HOLD_READING`): back in unit 17 with YES -- every page told.
   */
  release(seat: number): void {
    for (const h of releaseLeader(this.hostages.filter((h) => h.alive), seat, this.leaders)) (h as Hostage).motion?.stop();
    this.trails.delete(seat);
    this.unitTick();
    this.publish();
  }

  /** HX-4a: the UnitTick (`unitTick`, `FUN_005e8060`): a seat's unit with no living member gives its escortees HOLD. */
  private unitTick(): void {
    unitTick(this.hostages, (id) => {
      const s = this.host.seat?.(id);
      return s ? { id: s.id, alive: s.alive } : undefined;
    });
  }

  /**
   * A session takeover (`Room.takeOver`): a leader's, a last leader's, a rescuer's or a unit's old seat id moves to `id`
   * -- the unit by its number, the seat's id + 0x20 (`unitOfSeat`; HX-1 compared the raw seat id), and the leader's count.
   */
  rekey(old: number, id: number): void {
    this.leaders.rekey(old, id);
    const trail = this.trails.get(old);
    if (trail) { this.trails.delete(old); this.trails.set(id, trail); }
    for (const h of this.hostages) {
      h.motion?.rekey(old, id);
      if (h.leader === old) h.leader = id;
      if (h.lastLeader === old) h.lastLeader = id;
      if (h.ai.unit === unitOfSeat(old)) h.ai.unit = unitOfSeat(id);
      for (const s of [h.ai.stack.find(9), h.ai.stack.find(0x11), h.ai.stack.find(0x17)]) {
        if (s && s.leader === old) s.leader = id;
        if (s && s.owner === old) s.owner = id;
      }
    }
    this.publish();
  }

  /** Every changed hostage's `hostageState` to every page (`HOSTAGE_STATE_RATE_READING`); `force` tells all three. */
  private publish(force = false): void {
    for (const h of this.hostages) {
      const w = this.stateOf(h);
      const key = JSON.stringify(w);
      if (!force && key === this.told.get(h.id)) continue;
      this.told.set(h.id, key);
      this.host.send({ type: 'hostageState', ...w });
    }
  }
}
