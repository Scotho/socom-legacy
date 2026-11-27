import { SEAL_TUNING, type AiLoc, type Grid } from '@s2u/scene';
import { Traversal, TRAVERSAL_CLIP } from '../../viewer/src/traversal';
import type { SimClips } from '../../viewer/src/simMap';
import { ACTION_FAMILY, Walker, type MoverAction } from '../../viewer/src/mover';
import type { TiltQuat } from '../../viewer/src/rootTilt';
import { applyKnock, type Knock } from '../../viewer/src/net/blast';
import { HOSTAGE_TOP_SPEED_READING } from '../../viewer/src/locomotion';
import { WEAPON_LINE_BOTS_READING } from '../../viewer/src/weaponLine';
import { HostageObstacleRecord, recoveryRequest, recoverySuffix, recoveryTarget, selectRecoveryRay, HOSTAGE_AVOIDANCE_READING, type RecoveryRay, HostageRouteProbe, type RouteProbeSample } from './hostageAvoidance';
import { HostageSteering, HOSTAGE_STEERING_READING, passedRoutePoint, routeProjection, steeringDirection } from './hostageSteering';
import { HOSTAGE_YIELD_SEED_PLACEHOLDER, HostageYieldRandom, actorProbeEligible, resolveProbeActor, type HostageActorWorld } from './hostageActors';
import { DOOR_MOVE_ARRIVE_READING, DOOR_MOVE_FACE_READING, DOOR_MOVE_TIMEOUT_READING } from '../../viewer/src/doors';
import { HOSTAGE_DOOR_ACTION_READING } from './hostageDoors';

/** Research334: No_weapon GLOBAL climb types and motion.rdr NoTurn membership. */
export const HOSTAGE_CLIMB_READING: { required: readonly string[]; noTurn: readonly string[] } = {
  required: [TRAVERSAL_CLIP.toHang, TRAVERSAL_CLIP.toLadder, TRAVERSAL_CLIP.offLadder,
    TRAVERSAL_CLIP.climbMed, TRAVERSAL_CLIP.climbLow, TRAVERSAL_CLIP.stepUp],
  noTurn: [TRAVERSAL_CLIP.climbLow, TRAVERSAL_CLIP.climbMed, TRAVERSAL_CLIP.toHang,
    TRAVERSAL_CLIP.hangUp, TRAVERSAL_CLIP.hang],
};

type V3 = [number, number, number];
export interface FollowPoint extends AiLoc { link: boolean; action: boolean; width: number }
export interface FollowPlanner {
  locate(feet: readonly [number, number, number], preferredMap?: number): AiLoc | null;
  point(loc: AiLoc): V3;
  canTravel(a: AiLoc, b: AiLoc): boolean;
  /** Candidate-only soil predicate FUN_0052a090; deliberately not a travel-line test. */
  traversable(loc: AiLoc): boolean;
  correctMotion?(loc: AiLoc, proposed: readonly [number, number, number]): V3;
  correctMotionWithContact?(loc: AiLoc, proposed: readonly [number, number, number]): { feet: V3; obstacle: AiLoc | null };
  markObstacle?(raw: AiLoc, direction: readonly [number, number], contact: AiLoc): void;
  routeProbeCells?(raw: AiLoc, target: AiLoc, visit: (sample: RouteProbeSample) => boolean): boolean;
  yieldRoute?(route: FollowPoint[], from: AiLoc, feet: V3, other: AiLoc): boolean;
  recoveryRays?(raw: AiLoc): readonly RecoveryRay[] | null;
  width?(loc: AiLoc): number;
  plan(a: AiLoc, b: AiLoc, options?: { corridor?: (loc: AiLoc) => boolean }): { points: FollowPoint[]; cost: number } | null;
  /** The queued request (research 333 §4), `stops` start first; null is a refused registration. Absent, `plan` answers. */
  request?(stops: readonly AiLoc[], options?: { corridor?: (loc: AiLoc) => boolean }): FollowTicket | null;
  extend?(points: readonly AiLoc[], from: AiLoc, goal: AiLoc, options?: { corridor?: (loc: AiLoc) => boolean; trail?: readonly (AiLoc & { width: number })[] }): FollowPoint[] | null;
}
/** A request's answer (`HostagePathTicket`): pending while queued or searching. */
export interface FollowTicket {
  readonly state: 'pending' | 'done' | 'failed' | 'cancelled';
  readonly path: { points: FollowPoint[]; cost: number } | null;
  cancel(): void;
}
const answered = (points: FollowPoint[], cost = 0): FollowTicket => ({ state: 'done', path: { points, cost }, cancel() {} });
export interface FollowLeader { id: number; feet: V3; yaw: number; velocity: V3; topSpeed: number; stance: 0 | 1 | 2 }

/** Research 334 §1; FUN_005fb1c0 D:L508635-509081 and FUN_005fdf80 D:L510065-510069. Independently source-reviewed. */
export const FOLLOW_RULES_READING = {
  capacity: 75, loopWindow: 5, trailStart: 8, radius: 15, arrival: 1.25, matchRadius: 4.5,
  leaderFactor: 1.2, floor: 0.25, retry: 2.5, cell: 10, fallbackVelocity: 0.65,
  staleNear: 10, staleGoal: 15, replanNear: 7, shortcut: 3, idleMove: 1,
  headingSpeedSq: 800, headingCos: 0.82, headingMs: 2000,
} as const;
/** FUN_005eb910 formation 1 table; research 189 §2 / 334 §1. Independently source-reviewed. */
export const FOLLOW_SLOTS_READING = [[2, 2], [3, -2], [4, -3], [5, -2], [6, 3], [7, 5], [8, -4], [9, -5]] as const;
/** Research 334 §3: remaining special controller states and contact/action integrations. */
export const FOLLOW_STEERING_PLACEHOLDER = 'special aim/strafe and alert states, physical actor contacts, non-route Yield modes, Yield default-wait producer, neighbor ordering and actor-probe disable producer, airborne climb entry, ladder reservations and special action controllers';
/**
 * The velocity a leader's follow heading tests while he is AIRBORNE (research 435 s10): the original's +0x38 x/z then is
 * the carried take-off / walk-off velocity (+0x1350 / +0x1358; FUN_0054d9a0's air branch D:L416523-416527, the walk-off's
 * save D:L466972-466974, the tail's copy D:L413963-413965), cut only by walls. The room feeds the follow heading the
 * walker's pre-wall velocity (`Walker.preWallVelocity`) and, airborne where that is null, falls back to the walker's
 * w.vx / w.vz -- its carried velocity, at most one tick's wall cut apart. [reading]
 */
export const FOLLOW_LEADER_VELOCITY_AIR_READING = 'airborne: the carried velocity (the walker w.vx / w.vz)';
/**
 * FOLLOW_ACTION_CELL_READING (DF-10; research 334 §14, 200 §3.1) [reading, pending review]: what the path follower does
 * at a route point whose cell carries an AI marker (`FUN_00567900`'s action dispatch). The marker's type is its u16 at
 * +6, bits 7-11 (the marker word's bits 23-27); the eight-entry jump table at 0x65c990 (disassembly 0x567c28-0x567c54,
 * which the decompilation lost at D:L429545-429551) sends type 1 to 0x567ee8, types 4 and 7 to 0x567ce8 and 0x567c60, and
 * types 0, 2, 3, 5, 6 and 8 up to the plain steering at 0x5682c0. At 0x567ee8-0x567f18 the marker's action id (word bits
 * 4-19) is looked up in the map's action list (`FUN_002b4d80` D:L157171-157185, by each action's +0x3c, its load index:
 * D:L157310); no action, plain steering; the action's valve (+0x18, then its u16 at +4) nonzero, plain steering; zero,
 * `FUN_005f5c00(actor, 0xb, 0 or 3)` (0x567f1c-0x567fb4): a push of AI state 0xb, `CAiSAction` (the factory
 * `FUN_005f6550` D:L506016-506025; its vtable 0x669660's type names "CAiSAction" at 0x662890), which `FUN_005f0180`
 * (D:L502697-502761) aims at that action. A FOLLOW stack [9, 0x17] admits 0xb (`FUN_005f5cd0`: the masks' AND
 * 0x1ffffdfe & 0x190f4bc0 = 0x190f49c0 keeps bit 11); a second test at 0x567f04 (`$s0`) is not transcribed. So a
 * follower meets a shut door with plain steering -- the leaf's collision stops it, as the MP6 jail door does -- unless the
 * door's marker binds an action. The markers DO bind: the binder `FUN_002a8140` writes each door marker's action id at
 * load, after the AI maps' reset to 0xffff (research 418 s22.10, read twice from the bytes; measured on MP71, research
 * 404 s30; built in `hostageDoors.ts` `bindDoorMarkers`, research 428 s4; the placeholder that said none binds retired
 * 2026-11-18, LATER 958). Types 4 and 7 are not read here: 'unread'.
 */
export const FOLLOW_ACTION_CELL_READING = 'type 1 with a bound action whose valve is 0 pushes CAiSAction; else plain steering';

/**
 * WM-HOSTAGE task 2 (research 428 s5 item 2): the doors a follower may use, lent by the room's extraction. `at` is the
 * door (its index in the room's door set) a bound type-1 marker on cell `loc` names, else null (`followDoorCells`);
 * `valve` that door's valve now; `use` the room's own use of it with pick 0, by this hostage (true when it started).
 */
export interface FollowDoors {
  at(loc: AiLoc): number | null;
  valve(door: number): number;
  use(door: number, feet: V3): boolean;
}

/**
 * HOSTAGE_FLIGHT_DOOR_HOLD_PLACEHOLDER (LATER 1208; research 445 s5.9): a door goal pushed over the flight (0x1b's run, the
 * walker in movement state 3) holds the run -- the room's 0x1b frame is told it still moves, so its sub-state stands -- and on
 * the goal's end the run goes on along its route, the follow's state untouched. What 0x1b does when 0xb is pushed over it
 * and on its resume (its signal slot; whether it re-plans) is unread. The port's 0x1b frame still runs under the hold
 * (`ExtractionAuthority`'s `flee`): the object's loss during it ends the flight's run and drops the door goal at once
 * (`motion.stop`), where the original's driver ticks only the top goal and 0xb would finish first (the review's F3).
 * Settles: a read of 0x1b's suspend and resume, and the L1208 capture (the door on the run's line).
 */
export const HOSTAGE_FLIGHT_DOOR_HOLD_PLACEHOLDER = 'the run held under the door goal; resumed on its route after' as const;

/**
 * HOSTAGE_YIELD_MOVEMENT_STATE_READING (SHOTS-1208 r58, review 1 F2; research 445 s5.10; reading, pending review): the walker's
 * movement state +0x3f4 while a yield (AI state 3, pushed above follow by `FUN_00556370` D:L420802) stands. The follow tick
 * `FUN_005fae70` with a top that is not 9 (D:L508399-508404) calls `FUN_0056d090`, which restores the previous state through
 * `FUN_0056cbf0` -- whose force to 6 (D:L431676-431687) needs follow on top -- and the yield's own tick `FUN_00601f80` sets 4
 * (D:L511960, D:L511979); 6 comes back only on follow's resume (`FUN_005fdf80` D:L510104). Which yield sub-state the port's
 * `yielding` stands for is not tracked, so the port takes 4, the yield tick's own. In state 4 the original's dispatcher takes
 * its case 4 (D:L432578-432581), which does not call `FUN_00567900`: whether the route is walked under a yield at all is
 * UNREAD, and the port's walk of its route while yielding is its earlier model, not this reading. Passing 4 keeps that
 * model braking at the last point (`FUN_00567900` D:L429556-429559), the conservative outcome (SHOTS-1208 review 2 F1).
 */
export const HOSTAGE_YIELD_MOVEMENT_STATE_READING = 4;

/** The follower's dispatch at an action cell (`FOLLOW_ACTION_CELL_READING`). */
export type FollowActionDispatch = 'steer' | 'action' | 'unread';

/**
 * The action a marker binds: its id (word bits 4-19, written at load by `FUN_002a8140`; 0xffff on the disc) when an action
 * of the map answers it -- the actions' ids are 0 .. `actionCount` - 1 in load order -- else null (0xffff answers none).
 */
export function markerAction(markerWord: number, actionCount: number): number | null {
  const id = (markerWord >>> 4) & 0xffff;
  return id < actionCount ? id : null;
}

/**
 * `FUN_00567900`'s dispatch at a route point's marker (`FOLLOW_ACTION_CELL_READING`): `actionValve` is the bound action's
 * valve (its u16 at +4), null when the marker binds none (`markerAction`).
 */
export function followActionDispatch(markerWord: number, actionValve: number | null): FollowActionDispatch {
  const type = (markerWord >>> 23) & 0x1f;
  if (type === 4 || type === 7) return 'unread';
  if (type !== 1 || actionValve === null || actionValve !== 0) return 'steer';
  return 'action';
}
/**
 * AI_CORRECTION_ENABLE_READING (research 434 s1, s4, s8; reading, pending review): the hostage controller's +0x171 bit 7,
 * which gates the AI-map correction in the body's move `FUN_005483d0` (D:L413920-413922, r1 0x549740-0x549774: the
 * correction `FUN_00516f10` D:L413925 runs only with the bit set and +0x172 bit 0 clear, `DAT_0066b000` being 0). Its
 * writers the port's follower holds (`HostageFollow`):
 * - SET at spawn -- the AI reset's 1 (`FUN_00573130` D:L434856), measured idle 0x88 on the host (research 434 s8);
 * - CLEAR on follow's enter or resume (`FUN_005fdf80` D:L510064, D:L510111), SET on its suspend or exit (D:L510089,
 *   D:L510099);
 * - CLEAR at the end of each follow tick with follow the top goal, online (`FUN_005fae70` D:L508484; the 1-branch needs
 *   the multiplayer flag clear, D:L508425), and nothing on a tick whose top goal is another (D:L508399-508404);
 * - SET when an obstacle record of type 2, 4 or 1 matures (`FUN_00556370` D:L420662, D:L420688, D:L420745);
 * - every write while movement state +0x3f4 is 7 stores 0 (`CSealCtrlAi`'s setter r1 0x557ee0-0x557ef0;
 *   `correctionEnableWrite`), and leaving state 7 restores nothing for this class (research 434 s4).
 */
export const AI_CORRECTION_ENABLE_READING = 'set at spawn; clear on follow enter/resume and each follow tick on top; set on suspend/exit and a maturing record; 0 in movement state 7';

/** The order within a frame of the gate's reader and the AI tick's writers (`AI_CORRECTION_FRAME_ORDER_PLACEHOLDER`). */
export type AiCorrectionFrameOrder = 'ai-tick-then-move' | 'move-then-ai';
/**
 * AI_CORRECTION_FRAME_ORDER_PLACEHOLDER (research 434 s8, s9): the order within a frame of the body's move (the gate's
 * reader, `FUN_005483d0` from `CZSealBody` slot +0x20 `FUN_005506a0`) and the controller's AI tick (`CSealCtrlAi` slot
 * +0xc `FUN_0056de10`, the bit's writers). The frame loop calling both is unread. The interim order is
 * 'ai-tick-then-move': the move sees the bit as the frame's AI tick left it -- a reason, not a reading (research 434 s8).
 * Under either order one set event gives one corrected move, a frame apart, when the next tick is a follow tick; while
 * another goal (the port's state 16) stays on top no follow tick writes (D:L508399-508404), so each frame's move is corrected.
 */
export const AI_CORRECTION_FRAME_ORDER_PLACEHOLDER = 'ai-tick-then-move' as AiCorrectionFrameOrder;

/**
 * AI_CORRECTION_UNCOVERED_STATES_PLACEHOLDER (research 434 s8, s9): the bit for a hostage halted, rescued or dead is
 * unread. The port keeps the behaviour it had before the gate for them, 'ungated' (the correction subject only to the
 * cell and the obstacle record). Of the three the follower sees only a dead body (`Walker.dead`); a halted or rescued
 * hostage is not stepped through `HostageFollow.step` by the room (extraction steps only follow, state 9).
 */
export const AI_CORRECTION_UNCOVERED_STATES_PLACEHOLDER = 'ungated' as 'ungated' | 'gated';

/**
 * `CSealCtrlAi`'s slot +0xb4 setter (r1 0x557ee0, research 434 s1 and s3): bit 7 takes the argument's low bit, forced 0
 * while movement state +0x3f4 is 7 (r1 0x557ee0-0x557ef0). Returns the bit's new value.
 */
export function correctionEnableWrite(value: boolean, movementState7: boolean): boolean {
  return movementState7 ? false : value;
}

const same = (a: AiLoc, b: AiLoc) => a.map === b.map && a.x === b.x && a.z === b.z;
const xyCells = (a: AiLoc, b: AiLoc) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
const cells = (a: AiLoc, b: AiLoc) => a.map === b.map ? xyCells(a, b) : Infinity;
const distance = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Newest first, original AddSnakePoint FUN_00524d50 D:L392372-392496. Owned per room/leader, never on shared map. */
export class FollowTrail {
  readonly points: (AiLoc & { width: number })[] = [];
  heading: [number, number] | null = null;
  private runningMs = 0;
  /** The leader's saved heading (+0x4f4) and its latch byte (+0x515); `updateHeading`. */
  private saved: [number, number] | null = null;
  private latched = false;
  /**
   * FUN_005fc970 D:L509297-509358 (research 334 s1, `FOLLOW_RULES_READING`'s heading rows; the latch: research 435 s2,
   * reading pending review). A sustained forward run (branch A, D:L509312-509329: more than headingMs of |v|^2 >
   * headingSpeedSq within headingCos of the facing) sets heading and saved to the velocity's unit; otherwise (branch B,
   * D:L509337-509350) an unlatched leader's heading and saved take his current facing, a latched one's heading takes the
   * saved; every update then latches (+0x515 = 1, D:L509357). So a leader's heading stays his facing at the first update
   * of a lead -- measured on the rig (r0004, MP71, run C5, n = 1: +0x4e8 constant through a turn and a run east).
   */
  updateHeading(dt: number, leader: FollowLeader): void {
    const yaw = leader.yaw * Math.PI / 180, x = -Math.sin(yaw), z = -Math.cos(yaw);
    // D:L509310-509312: the squared speed is the sum of squares compared with 800.0 -- not a length squared again (a
    // velocity of exactly 800 must fail the strict test; hypot(...)^2 rounds 800 above it).
    const speedSq = leader.velocity[0] * leader.velocity[0] + leader.velocity[2] * leader.velocity[2], speed = Math.sqrt(speedSq);
    if (speedSq > FOLLOW_RULES_READING.headingSpeedSq && (x * leader.velocity[0] + z * leader.velocity[2]) / speed > FOLLOW_RULES_READING.headingCos)
      this.runningMs += Math.trunc(dt * 1000);
    else this.runningMs = 0;
    const saved: [number, number] = this.runningMs > FOLLOW_RULES_READING.headingMs ? [leader.velocity[0] / speed, leader.velocity[2] / speed]
      : this.latched && this.saved ? this.saved : [x, z];
    this.saved = saved;
    this.heading = [saved[0], saved[1]];
    this.latched = true;
  }
  /**
   * FUN_005fcc40 D:L509375-509376: the tick clears +0x515 only while the body's follower count +0x520 is below 1 --
   * called each frame for a body that leads no living hostage (research 435 s2, reading pending review).
   */
  release(): void { this.latched = false; }
  add(loc: AiLoc, width = 0): void {
    // The source compares x/z only, through inclusive index DAT_00650928 (5), D:L392414-392423.
    const loop = this.points.slice(0, FOLLOW_RULES_READING.loopWindow + 1).findIndex(p => p.x === loc.x && p.z === loc.z);
    if (loop >= 0) this.points.splice(0, loop);
    else this.points.unshift({ ...loc, width });
    this.points[0]!.width = width;
    this.points.length = Math.min(this.points.length, FOLLOW_RULES_READING.capacity);
  }
  get length(): number {
    let n = 0;
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1]!, b = this.points[i]!;
      if (a.map === b.map) n += Math.hypot(a.x - b.x, a.z - b.z);
    }
    return n;
  }
  contains(loc: AiLoc): boolean { return this.points.some(p => cells(p, loc) <= p.width); }
}

/**
 * The formation goal's cell, FUN_005fd790 D:L509786-509897 (research 435; research 334 s1): the trail point at index
 * `depth` is the base; then lateral steps i = 1..|lateral| from that base, (x + trunc(0.5 - hz*i*sign), z + trunc(0.5 +
 * hx*i*sign)), each kept only while the trail contains it (FUN_00524760, `FollowTrail.contains`) and its soil is
 * walkable (FUN_0052a090, `traversable`); the first failure stops. Null when the trail has no point at `depth` -- the
 * caller's fallback (`HostageFollow.control`) then applies.
 */
export function formationGoalCell(trail: FollowTrail, heading: readonly [number, number], slot: readonly [number, number],
  planner: Pick<FollowPlanner, 'traversable'>): (AiLoc & { width: number }) | null {
  const [depth, lateral] = slot;
  const [fx, fz] = heading;
  const origin = trail.points[depth];
  if (!origin) return null;
  let goal: AiLoc & { width: number } = origin;
  const sign = Math.sign(lateral);
  for (let i = 1; i <= Math.abs(lateral); i++) {
    const next = { map: origin.map, x: origin.x + Math.trunc(0.5 - fz * sign * i), z: origin.z + Math.trunc(0.5 + fx * sign * i) };
    // FUN_005fd790 D:L509862-509875 checks this candidate's soil, not the intervening slope/line.
    if (!trail.contains(next) || !planner.traversable(next)) break;
    goal = { ...next, width: 0 };
  }
  return goal;
}

/** FUN_005fb1c0 D:L508938-508948: conversion is through the LEADER controller's speed table. */
export function followThrottle(goalDistance: number, leaderSpeed: number, leaderTop: number): number {
  if (goalDistance > FOLLOW_RULES_READING.matchRadius * FOLLOW_RULES_READING.radius) return 1;
  return Math.min(1, Math.max(FOLLOW_RULES_READING.floor, leaderTop > 0 ? FOLLOW_RULES_READING.leaderFactor * leaderSpeed / leaderTop : 0));
}

/** Dedicated-room CAiSFollow: no host-local CSealCtrl exists, so its rear-probe/turn (sub 5) and WAIT_UP gates never run. */
export class HostageFollow {
  sub = 0;
  goal: V3 | null = null;
  velocity: V3 = [0, 0, 0];
  stance: 0 | 1 | 2 = 0;
  private readonly walker: Walker;
  private route: FollowPoint[] = [];
  private ticket: FollowTicket | null = null;
  /** SHOTS-1208 r108: a request was registered by the last sub 0 (its answer becomes the route); false after an untraversable target. */
  private requested = false;
  private waiting = 0;
  private started = false;
  private leaderId: number | null = null;
  private arrivedLeader: AiLoc | null = null;
  private location: AiLoc | null = null;
  private previousLocation: AiLoc | null = null;
  private readonly steering = new HostageSteering();
  private segmentStart: V3 | null = null;
  private previousDot = 0;
  private throttle = 1;
  private directTarget: V3 | null = null;
  private directRadius: number = HOSTAGE_AVOIDANCE_READING.retainedRadius;
  private yielding: { remaining: number; actor: number } | null = null;
  private readonly yieldRandom = new HostageYieldRandom(HOSTAGE_YIELD_SEED_PLACEHOLDER);
  get yieldTo(): number | null { return this.yielding?.actor ?? null; }
  private readonly obstacle = new HostageObstacleRecord();
  private recovery: { phase: 0 | 1 | 4 | 5 | 6; reentries: number; replace?: boolean; rays?: readonly RecoveryRay[]; previous: AiLoc; target: AiLoc; ticket: FollowTicket | null } | null = null;
  /**
   * The pushed `CAiSAction` on a shut door (`HOSTAGE_DOOR_ACTION_READING`): its door, its stage (0, 6, 7), and whether it
   * was pushed over the flight (LATER 1208: `run`'s walker) rather than over the follow.
   */
  private doorAction: { door: number; stage: 0 | 6 | 7; flight: boolean } | null = null;
  /**
   * LATER 1206: the door program's `ai::MOVE` goal on this body (`doorMove`): its point and facing, the seconds it has
   * left (`DOOR_MOVE_TIMEOUT_READING`), and `done` once arrived or timed out -- what the door program waits on.
   */
  private doorGoal: { point: V3; facing: V3; left: number; arrived: boolean; done: boolean } | null = null;

  private readonly traversal: Traversal | null;
  private bodyCommand: { forward: number; side: number } | null = null;
  private traversalReleased = false;
  private lateralUpdated = false;
  private controlVelocity: V3 = [0, 0, 0];
  /** The controller's +0x171 bit 7 (`AI_CORRECTION_ENABLE_READING`): SET at spawn, the AI reset's 1 (`FUN_00573130` D:L434856). */
  private correctionEnable = true;
  /** The bit as it stood before this frame's AI tick: the move's under 'move-then-ai' (`AI_CORRECTION_FRAME_ORDER_PLACEHOLDER`). */
  private correctionEnableBeforeTick = true;
  /**
   * Movement state +0x3f4 is 7 (`FUN_0056af50`, the physical action mode). The port's follower has no movement state 7
   * (a ladder needs mode 7 and a reservation, and the port's normal entry starts none: viewer `traversal.ts`), so nothing
   * sets it; every write of the bit honours it (`correctionEnableWrite`).
   */
  private actionMode7 = false;

  constructor(private readonly planner: FollowPlanner, grid: Grid, feet: V3, yaw: number, private readonly defaultMaterial = '', clips: SimClips | null = null,
    private readonly actorWorld?: HostageActorWorld, private readonly doors?: FollowDoors) {
    this.walker = new Walker(grid);
    this.walker.onlineAi = true;                                  // R4P-104: `CSealCtrlAi` online: class 0's landing clip (r0004 0x5b2168-0x5b21a4)
    this.walker.idleFrame = false;                                // IDLE-FRAME's BOT ADAPTATION: a hostage's stick is its AI's, no pad (LATER 1053)
    this.walker.weaponLineCast = WEAPON_LINE_BOTS_READING === 'cast';   // SEGMENT-BODY (review 2 F3): an AI body (`CSealCtrlAi`, +0x2c 0)
    // FUN_005b2620 D:L468322–468347 requires these six anim-set motions before dispatch.
    const required = HOSTAGE_CLIMB_READING.required;
    const available = (name: string) => !!clips?.table?.has(name) && clips.clips.some(c => c.name === name);
    const originalEntry = required.every(available);
    // Browser missing-data adaptation: preload all possible continuation roots; never use synthetic shapes.
    // The original missing-motion push retains its prior top (FUN_00588bc0 D:L446077-446094).
    const playbackReady = [TRAVERSAL_CLIP.hang, TRAVERSAL_CLIP.hangUp, TRAVERSAL_CLIP.hangDown, TRAVERSAL_CLIP.over].every(available);
    this.traversal = originalEntry && playbackReady ? new Traversal(grid, []) : null;
    if (this.traversal && clips) this.traversal.setClips(clips.clips, clips.table);
    Object.assign(this.walker.state, { x: feet[0], y: feet[1], z: feet[2], yaw });
    this.location = planner.locate(feet);
  }
  /** Original actor+0x38 velocity; snapshot displacement also includes map correction. */
  get bodyVelocity(): V3 { const s = this.walker.state; return [s.vx, s.vy, s.vz]; }
  get feet(): V3 { const s = this.walker.state; return [s.x, s.y, s.z]; }
  get traversalPose() { return this.traversal?.pose() ?? null; }
  get yaw(): number { return this.walker.state.yaw; }
  /** The controller's +0x171 bit 7 as it stands (`AI_CORRECTION_ENABLE_READING`); read-only. */
  get aiCorrectionEnabled(): boolean { return this.correctionEnable; }
  rekey(old: number, id: number): void { if (this.leaderId === old) this.leaderId = id; }
  /**
   * LATER 354: the blast's knock laid on the body (`FUN_005a0e70` calls the knock `FUN_0057e770` for a local controller,
   * D:L459307-459311 -- on the host a hostage's `CSealCtrlAi`, research 191; its body a `CZSealBody`, 193 s8.1, of the
   * SEAL's mass, `actor+0xf84` L419803, divided in `FUN_0057e770` D:L441053): the room's own `applyKnock` (`../../viewer/src/net/blast`), a climb popped as a
   * SEAL's is, then the throw by side -- Fall forward or backwards, Land, a get-up alive (`Walker.knock`). True when laid.
   */
  knock(k: Knock): boolean { return applyKnock(this.walker, this.traversal, k); }
  /** LATER 354: the body dead -- a thrown corpse's landing held down, no get-up (`FUN_0057e770` kind 8, D:L440999-441001). */
  set dead(on: boolean) { this.walker.dead = on; }
  /** The body's action (`Walker.action`): the snapshot's (LATER 354: a knock's Fall, Land and get-up). */
  get action(): MoverAction | null { return this.walker.action; }
  get airborne(): boolean { return this.walker.airborne; }
  /**
   * PRONE-TILT-2 (5) (research 217 s7.10): the root's tilt `FUN_00548090` wrote while a knock owns the body (`thrown`: its
   * walker runs the rule in `physics`), else null -- the No_weapon set's own clips have no `Normalize`, so the body is
   * level. The room's hostage capsules turn by it (`Room` `hostageVolumes`' callers, `HostagePast.tilt`).
   */
  get rootTilt(): TiltQuat | null { return this.thrown ? this.walker.rootTilt.q : null; }
  /**
   * LATER 354: a knock's clip owns the body (its Fall, Land, get-up or `Prone cover`), or it is thrown in the air -- not
   * once a corpse's Land is held on the floor at its last key (`Walker.dead`'s landing, kind 8): at rest, no longer
   * stepped (the review's F6).
   */
  get thrown(): boolean {
    const w = this.walker, a = w.action;
    if (w.airborne) return true;
    if (!a || (ACTION_FAMILY[a.name] !== 'reaction' && ACTION_FAMILY[a.name] !== 'getUp')) return false;
    return !(w.dead && (a.name === 'landDeath' || a.name === 'landBackwards') && a.seconds !== null && a.t >= a.seconds);
  }
  stop(): void {
    // Follow's suspend or exit writes 1 (`FUN_005fdf80` signals 1 and 2, D:L510089 / D:L510099; AI_CORRECTION_ENABLE_READING).
    // The room ends follow through here (extraction's signal hook for state 9's signals 1 and 2, and each frame a hostage
    // is not in follow); its other callers -- a leader lost mid-follow, a release, a death -- take the same write.
    this.writeCorrectionEnable(true);
    this.yielding = null;
    // The port drops a stopped follower's queued request (its owner's cancel, FUN_005107b0); the original's stop path is unread.
    this.ticket?.cancel(); this.recovery?.ticket?.cancel();
    this.sub = 0; this.route = []; this.ticket = null; this.requested = false; this.waiting = 0;
    // SHOTS-1208 r152: the start gate (`started`, the follow state's +0x76 cleared) is NOT re-armed here: `FUN_005fdf80`
    // writes +0x76 only on event 0, the enter (D:L510077, its one store in D:L510042-510125; r4 0x6058a8) -- `enter`; suspend (2), resume
    // (3) and exit (1) leave it, and the follow tick's clear (r1 0x5fb470 / r4 0x602c50) is `control`'s `started = true`.
    this.goal = null; this.leaderId = null; this.arrivedLeader = null;
    this.directTarget = null; this.steering.reset(); this.obstacle.clear(); this.recovery = null; this.segmentStart = null; this.previousDot = 0;
    this.doorAction = null;
    if (this.doorGoal) this.doorGoal.done = true;
    this.doorGoal = null;
    // Stopping the AI never cancels the physical fall's momentum (FUN_0059b440 D:L456496-456512).
    if (!this.walker.airborne) {
      this.velocity = [0, 0, 0];
      this.walker.state.vx = this.walker.state.vy = this.walker.state.vz = 0;
    }
  }

  /**
   * SHOTS-1208 r152 (research 445 s5.10; reading, pending review): the follow goal's enter (`FUN_005fdf80` event 0) sets
   * +0x76, the start gate, so the follower stands again until its leader's trail measures `trailStart` cells. The room calls
   * it on state 9's signal 0 (`ExtractionAuthority`'s AI hook); a resume (signal 3) does not.
   */
  enter(): void { this.started = false; }

  /** Body physics runs even when route planning fails, an AI location is absent, or FOLLOW has ended. */
  physics(dt: number): boolean {
    const before = this.feet;
    this.traversalReleased = false;
    if (this.traversal?.state().kind === 'hang') this.steering.hang();
    this.walker.turn = HOSTAGE_CLIMB_READING.noTurn.includes(this.traversalPose?.clip ?? '') ? 0 : this.steering.turn * SEAL_TUNING.turnMaxRate;
    if (this.traversal?.active) this.traversalReleased = !this.traversal.tickAi(this.walker, { forward: this.steering.forward, right: this.steering.side, boost: false }, dt);
    // LATER 354: a knock's clips play on the floor too (Land, get-up): the body's own, no command (`thrown`).
    if (this.thrown && (!this.traversal?.active || this.traversalReleased)) this.walker.tick({ forward: 0, right: 0, boost: false }, dt);
    this.recordVelocity(before, dt);
    return this.velocity.some(v => v !== 0);
  }
  /** LATER 1170: the flight's route (`run`): the cell it runs to and the planner's points left; null when not running. */
  private fleeRoute: { goal: AiLoc; points: FollowPoint[] } | null = null;

  /**
   * LATER 1170 (research 445 s5; `HOSTAGE_FLEE_MOVE_PLACEHOLDER`): `CAiSGrenade`'s move child 0x18 at throttle 1.0
   * (D:L423275-423282), whose own tick is unread -- the body's physics, then the planner's route from the hostage's cell to
   * `goal` (planned once a goal), each point steered at on the follower's direct steering at throttle 1 and moved as a
   * follow moves (`move`). Whether it still runs: false once the route is spent (it stands at the cell) or none was found.
   * Follow's own state is not touched; `stopRun` drops the route.
   */
  run(dt: number, goal: AiLoc): boolean {
    const before = this.feet;
    this.physics(dt);
    const raw = this.planner.locate(this.feet, this.location?.map);
    if (raw && this.planner.traversable(raw)) this.location = raw;
    // LATER 1208: a door goal pushed over the flight is the top goal; in the original 0x1b does not tick under it. The
    // room's 0x1b frame still runs and is told the run moves, so its sub-state stands (`HOSTAGE_FLIGHT_DOOR_HOLD_PLACEHOLDER`).
    if (this.doorAction?.flight) {
      this.doorTick(dt, raw, this.thrown || this.traversal?.active === true);
      // The door program's MOVE may walk the body (`doorGoalTick`): its velocity is zeroed only when it stood (review F2).
      const moved = this.feet;
      if (moved[0] === before[0] && moved[2] === before[2] && !this.walker.airborne) this.walker.state.vx = this.walker.state.vz = 0;
      this.recordVelocity(before, dt);
      return true;
    }
    const here = this.location;
    let moving = false;
    if (here) {
      const route = this.fleeRoute;
      if (!route || route.goal.map !== goal.map || route.goal.x !== goal.x || route.goal.z !== goal.z) {
        const plan = this.planner.plan(here, goal);
        this.fleeRoute = { goal, points: plan ? [...plan.points] : [] };
      }
      const points = this.fleeRoute!.points;
      while (points.length && xyCells(points[0]!, here) === 0 && points.length > 1) points.shift();
      // LATER 1208: the run walks the walker in movement state 3 (the run child's tick `FUN_005f1160` routes through
      // `FUN_00562790`, D:L503231 / D:L503263; `FUN_0056de10` D:L432565-432567 runs `FUN_00567900` in state 3; Q24c M2
      // measured +0x3f4 = 3 through the run), so its type-1 dispatch is the follower's: a shut door's marker cell ahead
      // pushes `CAiSAction`, admitted over 0x1b (its mask's bit 11; its veto 0x555390, the follow's always-allow).
      if (this.doorDispatch(points, true)) {
        this.recordVelocity(before, dt);
        return true;
      }
      const next = points[0];
      if (next) {
        const at = this.feet, to = this.planner.point(next);
        // The normal route steering (follow's `steering.step`, D:L431374-431420 / D:L429851-429874) at throttle 1: turn
        // toward the point and run; the point passed within the follow's arrival (`FOLLOW_RULES_READING.arrival` cells).
        const dx = to[0] - at[0], dz = to[2] - at[2];
        // The run's movement state is 3 (Q24c M2, above), so its last point zeroes the throttle (D:L429556-429559; SHOTS-1208 r58).
        const command = this.steering.step(dt, { yaw: this.yaw, dx, dz, throttle: 1, final: points.length === 1, movementState: 3, link: false });
        this.walker.state.yaw = command.yaw;
        this.bodyCommand = { forward: command.forward, side: 0 };
        this.move(dt, command.forward, 0, raw, here);
        if (Math.hypot(dx, dz) <= FOLLOW_RULES_READING.arrival * FOLLOW_RULES_READING.cell) points.shift();
        moving = true;
      }
    }
    if (!moving && !this.walker.airborne) this.walker.state.vx = this.walker.state.vz = 0;
    this.recordVelocity(before, dt);
    return moving;
  }

  /** LATER 1170: the flight's route dropped (0x1b ended or suspended); LATER 1208: with any door goal it pushed. */
  stopRun(): void {
    if (this.doorAction?.flight) this.doorDone();
    this.fleeRoute = null;
  }

  step(dt: number, leader: FollowLeader, trail: FollowTrail, slot: number): void {
    const before = this.feet, falling = this.thrown || this.traversal?.active === true;   // LATER 354: a knock owns it
    this.controlVelocity = this.bodyVelocity;
    this.bodyCommand = null;
    if (this.traversal?.active) {
      // Controller command precedes active body advance (FUN_00551ec0 D:L418613-418615).
      this.controlTick(dt, leader, trail, slot, true);
      this.physics(dt);
      const command = this.bodyCommand as { forward: number; side: number } | null;
      if (this.traversalReleased && command && !this.walker.airborne) {
        const raw = this.planner.locate(this.feet), here = this.location;
        if (here) this.move(dt, command.forward, command.side, raw, here, true);
      }
    } else {
      this.physics(dt);
      this.controlTick(dt, leader, trail, slot, falling);
    }
    this.recordVelocity(before, dt);
  }
  private recordVelocity(before: V3, dt: number): void {
    const after = this.feet;
    this.velocity = [(after[0] - before[0]) / dt, (after[1] - before[1]) / dt, (after[2] - before[2]) / dt];
  }
  private lateral(dt: number, toLine: readonly [number, number] | null): number {
    this.lateralUpdated = true;
    return this.steering.lateral(dt, this.yaw, toLine);
  }
  private controlTick(dt: number, leader: FollowLeader, trail: FollowTrail, slot: number, falling: boolean): void {
    this.correctionEnableBeforeTick = this.correctionEnable;
    this.lateralUpdated = false;
    this.control(dt, leader, trail, slot, falling);
    // FUN_0056fd00 D:L433132-433169 and FUN_0054d9a0 D:L416463-416467:
    // independent perturbation still decays and moves the body on controller early returns.
    if (!this.lateralUpdated) {
      const side = this.lateral(dt, null);
      this.bodyCommand = { forward: 0, side };
      // FUN_0054d9a0 D:L416463-416467 constructs body velocity from command and perturbation.
      // A grounded zero command still writes zero velocity; no synthetic displacement/correction.
      if (!falling && side === 0) this.walker.state.vx = this.walker.state.vz = 0;
      if (!falling && side !== 0 && this.location) this.move(dt, 0, side, this.planner.locate(this.feet), this.location);
    }
  }
  private control(dt: number, leader: FollowLeader, trail: FollowTrail, slot: number, falling: boolean): void {
    if (this.leaderId !== leader.id) {
      this.stop(); this.leaderId = leader.id;
      // Follow's enter or resume writes 0 (`FUN_005fdf80` signals 0 and 3, D:L510064 / D:L510111; AI_CORRECTION_ENABLE_READING):
      // the port's first follow tick under a leader after `stop()`.
      this.writeCorrectionEnable(false);
    }
    // A follow tick before the trail starts the follower still ends writing 0 (D:L508484).
    if (!this.started && trail.length < FOLLOW_RULES_READING.trailStart) this.followTickWrite();
    if (!this.started) {
      if (trail.length < FOLLOW_RULES_READING.trailStart) { this.stance = leader.stance; return; }
      this.started = true;
    }
    this.stance = 0; // escortee bit: FUN_005fc590, D:L509156-509211.
    const raw = this.planner.locate(this.feet, this.location?.map), there = this.planner.locate(leader.feet);
    // FUN_005b7ba0 D:L471288-471318: blocked soil updates raw +e4, retains last navigable +e8.
    if (raw && this.planner.traversable(raw)) {
      // FUN_005b7ba0 D:L471307-471318: previous navigable cell is independent of route segment origin.
      if (this.location && xyCells(raw, this.location) !== 0) this.previousLocation = this.location;
      this.location = raw;
    }
    // HOSTAGE_DOOR_ACTION_READING: a pushed CAiSAction is the top goal; the follow goal does not tick under it.
    if (this.doorAction) { this.doorTick(dt, raw, falling); return; }
    const here = this.location;
    if (!here || !there) { this.followTickWrite(); return; } // no valid AI location: never straight-line through an unread map.
    this.location = here;
    const actors = this.actorWorld?.actors() ?? [];
    this.obstacle.retainActor(id => actors.some(a => a.id === id && a.alive));
    // Controller contact handling precedes the state machine (FUN_0056e9d0 D:L432512-432513).
    const response = this.obstacle.actorResponse(dt);
    const event = this.obstacle.tick(dt, raw ?? here, this.steering.forward, this.steering.side);
    // FUN_00556370 D:L420744–420819; normal completed route (movement mode3).
    const r = HOSTAGE_AVOIDANCE_READING;
    // A record maturing writes 1 (AI_CORRECTION_ENABLE_READING): type 2 or 4 past its threshold (`FUN_00556370` D:L420662,
    // D:L420688; `event`), type 1 with its actor older than DAT_006504f0 (D:L420745; `actorDelay`). The 1 holds until the
    // next writer. A type 2 that matures out of reach is cleared inside `HostageObstacleRecord.tick` with no event, so its
    // 1 (written before the reach test, D:L420662) is not seen here (research 434 s8, the port's gap).
    if (event || (response && response.age > r.actorDelay)) this.writeCorrectionEnable(true);
    let yieldEntered = false;
    const yieldActive = this.yielding !== null;
    // FUN_00556370 D:L420744–420795; FUN_00524d00 pops exactly one head.
    // FUN_005fd460 D:L509706–509720 resolves the normal route's current point.
    if (!this.recovery && response && response.age > r.actorDelay && this.route.length) {
      const actor = actors.find(a => a.id === response.id && a.alive);
      const head = this.route[0]!;
      if (actor?.cell && actor.velocity.reduce((sum, v) => sum + v * v, 0) <= r.actorMovingSq &&
          xyCells(actor.cell, head) <= r.actorGoalDistance && this.planner.point(head).every(Number.isFinite)) {
        // Mode3 leaves the response flag clear: delayed Yield processing still follows.
        this.advancePoint();
      }
    }
    if (!this.yielding && !this.recovery && response?.probe && response.age > r.actorDelay && this.route.length) {
      const actor = actors.find(a => a.id === response.id && a.alive);
      const axis = Math.max(this.steering.forward, this.steering.side);
      if (actor && response.age > r.fastSeconds * axis + r.slowSeconds * (1 - axis)) {
        const rawOther = actor.rawCell ?? actor.cell;
        if (rawOther) {
          const dot = this.controlVelocity[0] * actor.velocity[0] + this.controlVelocity[2] * actor.velocity[2];
          const random = () => this.actorWorld?.yieldRandom?.() ?? this.yieldRandom.next();
          // FUN_00602270 D:L512098–512105: rear moving-aligned contacts leave phase0.
          const facing = steeringDirection(this.yaw, 1, 0);
          const position = actor.position ?? this.planner.point(rawOther);
          const front = facing[0] * (position[0] - this.feet[0]) + facing[1] * (position[2] - this.feet[2]);
          const forwardSpeed = facing[0] * this.controlVelocity[0] + facing[1] * this.controlVelocity[2];
          const remaining = front < 0 && forwardSpeed > 0 && dot > 0 ? r.yieldDefaultWait : dot > r.yieldAlignedDot ? random() :
            this.planner.yieldRoute?.(this.route, here, this.feet, rawOther) ? r.yieldWait : random() * r.yieldRandomRange + r.yieldWait;
          yieldEntered = true;
          this.yielding = { actor: actor.id, remaining };
          this.obstacle.consumeActorProbe();
        }
      }
    }
    if (this.yielding) {
      this.yielding.remaining -= dt;
      if (this.yielding.remaining <= 0 || !actors.some(a => a.id === this.yielding!.actor && a.alive)) {
        this.yielding = null; this.obstacle.clear();
      }
      if (yieldEntered) {
        // Contact entry selects movement mode4 for this tick only (D:L432547).
        this.steering.forward = this.steering.side = this.steering.turn = 0; return;
      }
    }
    // FUN_00556370 D:L420831-420849: a retained contact can request state16 again each tick.
    if (event && this.recovery) this.recovery.reentries++;
    if (event?.type === 4 && raw) {
      this.planner.markObstacle?.(raw, steeringDirection(this.yaw, this.steering.forward, this.steering.side), event.cell);
    }
    if (!this.recovery && event && raw && this.route.length) {
      const previous = this.previousLocation ?? here, savedTarget = recoveryTarget(this.route, event.cell)!;
      this.route = recoverySuffix(this.route, event.cell);
      this.obstacle.clear();
      if (this.route.length) {
        this.recovery = { phase: 0, reentries: 0, previous, target: savedTarget, ticket: null };
        // FUN_00604490 D:L513034-513040 / FUN_00567840: clear command axes, not lateral perturbation.
        this.steering.forward = this.steering.side = this.steering.turn = 0;
      }
      else { this.sub = 0; return; }
    }
    if (this.recovery) {
      const state = this.recovery, next = state.target;
      // FUN_00603950 D:L512758-512761: strict limit, before dispatch; direct requests survive state exit.
      if (state.reentries > HOSTAGE_AVOIDANCE_READING.reentryLimit || !next) { state.ticket?.cancel(); this.recovery = null; return; }
      if (state.phase === 0) {
        if (!raw || xyCells(raw, here) === 0) { state.phase = 5; return; }
        // FUN_00603950 D:L512765-512779: priority6 direct movement toward retained navigation, radius3.
        if (Math.abs(raw.x - here.x) <= 1 && Math.abs(raw.z - here.z) <= 1) {
          this.directTarget = this.planner.point(here); this.directRadius = HOSTAGE_AVOIDANCE_READING.retainedRadius; state.phase = 4;
        } else {
          const rays = this.planner.recoveryRays?.(raw);
          if (rays) { state.rays = rays; state.phase = 1; }
          return;
        }
      }
      if (state.phase === 1) {
        const selected = selectRecoveryRay(state.rays ?? [], this.feet[1]);
        if (selected) {
          this.directTarget = this.planner.point(selected); this.directRadius = HOSTAGE_AVOIDANCE_READING.rayRadius;
          this.obstacle.clear();
        }
        // D:L512822-512830: case1 exits state16; its priority6 controller request remains active.
        this.recovery = null;
        this.moveDirect(dt, raw, here, falling);
        return;
      }
      if (state.phase === 4) {
        if (raw && xyCells(raw, here) === 0) { this.directTarget = null; state.phase = 5; return; }
        if (this.directTarget) this.moveDirect(dt, raw, here, falling);
        else if (raw) {
          const rays = this.planner.recoveryRays?.(raw);
          if (rays) { state.rays = rays; state.phase = 1; }
        }
        return;
      }
      if (state.phase === 5) {
        // FUN_00603950 D:L512876-512945: the completed controller route's original destination is retained.
        const destination = this.route.at(-1);
        if (!destination || xyCells(here, next) === 0) { this.recovery = null; return; }
        if (!this.planner.traversable(next)) {
          // Missing or blocked saved endpoint: clear old route, then replace it through FUN_005623b0.
          this.route = []; state.replace = true;
          state.ticket = xyCells(here, destination) === 0 ? answered([])
            : this.planner.traversable(destination) ? this.register([here, destination]) : null;
        } else {
          state.ticket = recoveryRequest(here, state.previous, next, stops => this.register(stops));
        }
        if (state.ticket) state.phase = 6;
        else this.recovery = null; // Case5 starts with exit7; both refused registrations do not enter phase6.
        return;
      }
      // D:L512950: phase 6 waits while its request is queued or searching; a failed search ends recovery (D:L512951).
      if (state.ticket?.state === 'pending') return;
      const pending = state.ticket?.state === 'done' ? state.ticket.path?.points ?? null : null;
      // D:L512950-512971: prefix excludes the saved endpoint already present in the retained route.
      if (state.replace) this.route = pending ?? [];
      else if (pending?.length) this.route = [...pending.slice(0, -1), ...this.route];
      this.recovery = null; this.segmentStart = this.feet; this.previousDot = 0;
      return;
    }
    // Follow on top again (no state 16, no state 3): this tick is the follow tick, and it ends writing 0 (D:L508484).
    this.followTickWrite();
    if (this.directTarget) { this.moveDirect(dt, raw, here, falling); return; }
    let arrived = false, goalDistance = 0;
    const leaderSpeed = Math.hypot(...leader.velocity);
    // State3 suspends FOLLOW decisions, but not movement mode3 route steering.
    if (!yieldActive) {
      const formation = FOLLOW_SLOTS_READING[slot % FOLLOW_SLOTS_READING.length]!;
      const [depth, lateral] = formation;
      const yaw = leader.yaw * Math.PI / 180;
      const [fx, fz] = trail.heading ?? [-Math.sin(yaw), -Math.cos(yaw)];
      const goal = formationGoalCell(trail, [fx, fz], formation, this.planner);
      if (goal) {
        this.goal = this.planner.point(goal);
      } else {
        // SHOTS-1208 r11 (research 445 s5.10; reading, pending review): FUN_005fb1c0 D:L508700-508703 scales the leader's
        // velocity (+0x38) by DAT_00650c30 (0x3f266666 = +0.65, `fallbackVelocity`) on all three axes (FUN_00309180
        // D:L207463-207469) and ADDS it to his position (+0xa4; FUN_00309240 D:L207510-207515); then the slot offset, y 0
        // (D:L508712-508718). The port subtracted it, on x and z only.
        const c = FOLLOW_RULES_READING.cell, k = FOLLOW_RULES_READING.fallbackVelocity;
        this.goal = [leader.feet[0] + k * leader.velocity[0] - depth * c * fx + lateral * c * fz,
          leader.feet[1] + k * leader.velocity[1], leader.feet[2] + k * leader.velocity[2] - depth * c * fz - lateral * c * fx];
      }
      const target = this.planner.locate(this.goal, there.map);
      if (!target) return;
      goalDistance = distance(this.feet, this.goal); arrived = goalDistance <= FOLLOW_RULES_READING.arrival * FOLLOW_RULES_READING.radius;
      // FUN_005fc7d0 D:L509239-509258 extracts x/z only; a changed submap is not an infinite distance.
      if (this.sub === 7 && !arrived && this.arrivedLeader && xyCells(there, this.arrivedLeader) > FOLLOW_RULES_READING.idleMove) this.sub = 0;
      if (this.sub === 8) {
        this.waiting -= dt;
        if (this.waiting <= 0) this.sub = 0;
        return;
      }
      if (this.sub === 7) return;
      if (this.sub === 4) { this.arrivedLeader = { ...there }; this.sub = 7; this.route = []; return; }
      if (this.sub === 0) {
        if (arrived) { this.sub = 4; return; }
        // SHOTS-1208 r108 (research 445 s5.10; reading, pending review): FUN_005623b0 D:L426850-426871 re-plans only
        // when the target cell's soil passes (FUN_0052a180 / FUN_0052a090, D:L426851-426857); an untraversable target
        // leaves the old request, its answer and the route untouched. Either way the state goes to 2 (D:L508814-508816).
        if (this.planner.traversable(target)) {
          // D:L426858-426868: the old request cancelled, the route emptied (FUN_00527310 D:L393385-393410), then the
          // request. The room supplies live actor occupancy (research335).
          this.ticket?.cancel(); this.route = [];
          this.ticket = this.register([here, target], trail.contains(here) ? { corridor: p => trail.contains(p) } : undefined);
          this.requested = true;
        }
        this.sub = 2;
        return;
      }
      if (this.sub === 2) {
        // D:L508825: while the request is queued or searching the follower has no route and stands.
        if (this.ticket?.state === 'pending') return;
        // SHOTS-1208 r108 (review 1 F1): case 2 (D:L508825-508835) waits 2.5 s when the live route holds no node (+0x508,
        // the remaining count: `FUN_00524d00` pops a node by decrementing it) or the request is not done (+0x4ec != 4);
        // else it walks at once (state 3) -- `FUN_00526540` (D:L393116-393163) rebuilds only the sub-map list from the
        // nodes still held. After a new request the live route is its answer; after an untraversable target (no request)
        // it is what is left of the old route, walked on from where it stands. `ticket` stays as the last request (its
        // state is the +0x4ec the test reads). Held at r0004 by the key job (0x6029a0; 0x5676f0).
        if (this.requested) {
          this.requested = false;
          const points = this.ticket?.state === 'done' ? this.ticket.path?.points ?? null : null;
          if (!points?.length) { this.sub = 8; this.waiting = FOLLOW_RULES_READING.retry; return; }
          this.route = points.slice();
          this.segmentStart = this.feet; this.previousDot = 0;
        } else if (!this.route.length || this.ticket?.state !== 'done') {
          this.sub = 8; this.waiting = FOLLOW_RULES_READING.retry; return;
        }
        this.sub = 3;
      }
      const end = this.route.at(-1);
      if (!end) { this.sub = arrived ? 4 : 0; return; }
      if (arrived && (xyCells(here, end) === 0 || leaderSpeed < 10)) { this.sub = 4; this.route = []; return; }
      // FUN_005fb1c0 D:L508898-508933: shortcut; stale end extension; replan only within seven cells if extension fails.
      let length = 0;
      for (let i = 1; i < this.route.length; i++) {
        const a = this.route[i - 1]!, b = this.route[i]!;
        if (a.map === b.map) length += Math.hypot(a.x - b.x, a.z - b.z);
      }
      // D:L508918 converts GetLength's floating result to int before comparing the integer cell margin.
      if (here.map === target.map && xyCells(here, target) + FOLLOW_RULES_READING.shortcut < Math.trunc(length) && this.planner.canTravel(here, target)) { this.sub = 0; return; }
      // D:L508840-508895 / 508924: these packed-cell deltas omit the map bits, unlike the explicit shortcut gate.
      if (xyCells(end, target) !== 0 && (xyCells(here, end) <= FOLLOW_RULES_READING.staleNear || xyCells(end, target) >= FOLLOW_RULES_READING.staleGoal)) {
        const patched = this.planner.extend?.(this.route, here, target, trail.contains(here) ? { corridor: p => trail.contains(p), trail: trail.points } : undefined);
        if (patched) this.route = patched;
        else if (xyCells(here, end) <= FOLLOW_RULES_READING.replanNear) { this.sub = 0; return; }
      }
    }
    // Original recursion consumes each reached point without a stationary frame.
    while (this.route.length) {
      // FUN_00567900 D:L429515: the action dispatch reads the point steered to before its arrival (HOSTAGE_DOOR_ACTION_READING).
      if (this.doorDispatch()) return;
      // Point-cell arrival is FUN_00567900 D:L429574-429592; width=0 for the original follower app flags 3.
      if (same(here, this.route[0]!)) {
        this.advancePoint();
        if (!this.route.length) { this.sub = arrived ? 4 : 0; return; }
        continue;
      }
      const next = this.route[0]!;
      const aim = this.planner.point(next), old = this.feet, dx = aim[0] - old[0], dz = aim[2] - old[2], d = Math.hypot(dx, dz);
      const radians = this.yaw * Math.PI / 180;
      const dot = d ? (-Math.sin(radians) * dx - Math.cos(radians) * dz) / d : 0;
      const projection = this.segmentStart && routeProjection([this.segmentStart[0], this.segmentStart[2]], [aim[0], aim[2]], [old[0], old[2]]);
      const after = this.route[1];
      // FUN_00567900 D:L429692-429719. Width is zero for FOLLOW's app flags3, but retain the actual gate.
      if (d < HOSTAGE_STEERING_READING.pointRadius ||
          (projection && d * HOSTAGE_STEERING_READING.cellInverse < next.width && projection.distance <= HOSTAGE_STEERING_READING.corridorRadius) ||
          passedRoutePoint(this.previousDot, dot, xyCells(here, next), !!after && this.planner.canTravel(here, after))) {
        this.advancePoint(); continue;
      }
      // FUN_00567900 D:L429595-429624: inspect ahead before computing the route steering command.
      if (raw && raw.map === next.map && this.planner.routeProbeCells) {
        const probe = new HostageRouteProbe(raw, next, [-Math.sin(radians), 0, -Math.cos(radians)]);
        this.planner.routeProbeCells(raw, next, sample => probe.visit(sample));
        if (probe.obstacle) this.obstacle.ai(probe.obstacle, dt, true);
        else if (probe.actor && this.actorWorld && !HOSTAGE_AVOIDANCE_READING.actorProbeDisabled) {
          const target = resolveProbeActor(this.actorWorld.id, probe.actor, actors);
          const source = actors.find(a => a.id === this.actorWorld!.id);
          if (source && target?.cell && actorProbeEligible(source, target)) this.obstacle.actor(target.id, target.cell, dt, true);
        }
      }
      if (this.obstacle.actorStops()) {
        // FUN_00567900 D:L429631–429634 zeroes axes, not the independent lateral perturbation.
        this.steering.forward = this.steering.side = this.steering.turn = 0;
        // FUN_0056fd00 D:L433132–433169 still decays the independent velocity perturbation;
        // FUN_0054d9a0 D:L416463–416467 adds it to body motion despite zero controller axes.
        const side = this.lateral(dt, null);
        this.bodyCommand = { forward: 0, side };
        if (!falling) this.move(dt, 0, side, raw, here);
        return;
      }
      this.previousDot = dot;
      const throttle = this.throttle = yieldActive ? this.throttle : followThrottle(goalDistance, leaderSpeed, leader.topSpeed);
      // SHOTS-1208 r58: the follower walks in movement state 6 (`FUN_0056cbf0` forces 6 while follow is on top,
      // D:L431676-431687), so its last point keeps the follow throttle (`FUN_00567900` D:L429556-429559); under a yield
      // it is not 6 (`HOSTAGE_YIELD_MOVEMENT_STATE_READING`), so the last point brakes.
      const movementState = yieldActive ? HOSTAGE_YIELD_MOVEMENT_STATE_READING : 6;
      const command = this.steering.step(dt, { yaw: this.yaw, dx, dz, throttle, final: this.route.length === 1, action: next.action, movementState, link: next.link, hanging: this.traversal?.state().kind === 'hang' });
      const side = this.lateral(dt, projection ? [projection.point[0] - old[0], projection.point[1] - old[2]] : null);
      if (!HOSTAGE_CLIMB_READING.noTurn.includes(this.traversalPose?.clip ?? '')) this.walker.state.yaw = command.yaw;
      this.bodyCommand = { forward: command.forward, side };
      if (!falling) this.move(dt, command.forward, side, raw, here);
      return;
    }
  }
  /**
   * `FUN_00567900`'s type-1 dispatch (D:L429515; r1 0x567ee8-0x568150, research 418 s22.4; `HOSTAGE_DOOR_ACTION_READING`):
   * the point steered to lies on a bound door marker's cell with more than one point left, and the door's valve is 0 --
   * the push of `CAiSAction`, admitted (`HOSTAGE_DOOR_PUSH_GATE_READING`), and the walker returns without steering
   * (`HOSTAGE_DOOR_STAND_PLACEHOLDER`). True when it pushed.
   */
  private doorDispatch(route: readonly FollowPoint[] | readonly AiLoc[] = this.route, flight = false): boolean {
    const doors = this.doors, next = route[0];
    if (!doors || !next || route.length < 2) return false;
    const door = doors.at(next);
    if (door === null || doors.valve(door) !== 0) return false;   // r1 0x567f0c-0x567f14: valve non-zero (open, locked 99) steers
    this.steering.forward = this.steering.side = this.steering.turn = 0;
    this.doorAction = { door, stage: 0, flight };
    return true;
  }
  /**
   * `CAiSAction`'s tick `FUN_005efa50` on the door (`HOSTAGE_DOOR_ACTION_READING`), the body standing
   * (`HOSTAGE_DOOR_STAND_PLACEHOLDER`) but while the door program's MOVE holds a goal on it (`doorMove`, LATER 1206):
   * complete at the top of the tick when the valve reads the wanted state (D:L502499-502504); stage 0 -> 6
   * (D:L502508-502528); stage 6 the use with pick 0 (D:L502654), refused complete at once (D:L502655-502656), accepted
   * stage 7; stage 7 waits with no timeout (D:L502665-502667; `HOSTAGE_DOOR_USE_COUNT_PLACEHOLDER`). Not built: the shut
   * behind (`HOSTAGE_DOOR_SHUT_BEHIND_READING`).
   */
  private doorTick(dt: number, raw: AiLoc | null, falling: boolean): void {
    const action = this.doorAction!, doors = this.doors!;
    if (this.doorGoal && !this.doorGoal.done) { this.doorGoalTick(dt, raw, falling); return; }
    this.steering.forward = this.steering.side = this.steering.turn = 0;
    if (doors.valve(action.door) === HOSTAGE_DOOR_ACTION_READING.wanted) { this.doorDone(); return; }
    if (action.stage === 0) { action.stage = 6; return; }
    if (action.stage === 6) {
      if (doors.use(action.door, this.feet)) action.stage = 7;
      else this.doorDone();
    }
  }
  /**
   * LATER 1206 (research 428 s8.4-s8.5; reading, pending review): the door program's `ai::MOVE` on this body
   * (`DoorHooks.move` through the room's `doorMove`): the goal `point` and `facing` its begin gave the controller
   * (`FUN_0056daa0`, `FUN_0056d920`, D:L488972-488977), held until the body is within `DOOR_MOVE_ARRIVE_READING` of the
   * point (`FUN_00566dc0` D:L429158-429161) AND faces the goal within `DOOR_MOVE_FACE_READING` (the facing bit, D:L429178-
   * 429185; the review's F1), or `DOOR_MOVE_TIMEOUT_READING` has passed (its timer `+0x1c0`, counted down by the frame's
   * dt, D:L429080-429098). Answers the program's "done?": true once the goal is gone either way. Called
   * from the door's use inside the action's stage 6 (`doorTick`); with no door action, nothing to walk: done at once.
   */
  doorMove(point: readonly [number, number, number], facing: readonly [number, number, number]): () => boolean {
    if (!this.doorAction) return () => true;
    const goal = { point: [point[0], point[1], point[2]] as V3, facing: [facing[0], facing[1], facing[2]] as V3, left: DOOR_MOVE_TIMEOUT_READING, arrived: false, done: false };
    this.doorGoal = goal;
    return () => goal.done;
  }
  /**
   * One tick of the MOVE's goal (`doorMove`): the timer counted down by `dt` (`FUN_00566dc0` D:L429080-429098), the
   * arrival tested on the flat distance (D:L429158-429161), else the body steered at the point by the follower's own direct
   * steering (`HostageSteering.directStep`, as `moveDirect`) -- HOSTAGE_DOOR_MOVE_STEER_PLACEHOLDER: the goal driver's own
   * gains (its sticks at `+8` / `+0xc`, D:L429100-429150) are not transcribed. The facing is held and not turned to
   * (HOSTAGE_DOOR_MOVE_FACING_PLACEHOLDER): once arrived the body stands, and the goal stays until its yaw faces the goal
   * within `DOOR_MOVE_FACE_READING` -- which, not turned, it reaches only by chance -- else until the timeout (the original's
   * tick holds on the facing bit too: the review's F1). The goal gone, the body stands for the rest of the action.
   */
  private doorGoalTick(dt: number, raw: AiLoc | null, falling: boolean): void {
    const goal = this.doorGoal!, at = this.feet, here = this.location;
    goal.left -= dt;
    const dx = goal.point[0] - at[0], dz = goal.point[2] - at[2];
    // Arrival is LATCHED: the original clears the position bit once (D:L429160) and tests the distance only while it is
    // set (D:L429121) -- once arrived the body only turns (the 1206 delta review's N1).
    if (!goal.arrived && Math.hypot(dx, dz) <= DOOR_MOVE_ARRIVE_READING) goal.arrived = true;
    const arrived = goal.arrived;
    // The facing goal's residual: the body's yaw against the facing's (forward is (-sin, -cos) of the yaw, degrees).
    const want = Math.atan2(-goal.facing[0], -goal.facing[2]), have = (this.yaw * Math.PI) / 180;
    const faced = Math.abs(Math.atan2(Math.sin(want - have), Math.cos(want - have))) <= DOOR_MOVE_FACE_READING;
    if ((arrived && faced) || goal.left <= 1e-9 || !here) {
      goal.done = true;
      this.steering.forward = this.steering.side = this.steering.turn = 0;
      return;
    }
    if (arrived) { this.steering.forward = this.steering.side = this.steering.turn = 0; this.bodyCommand = { forward: 0, side: 0 }; return; }
    const command = this.steering.directStep(dt, { yaw: this.yaw, dx, dz, throttle: this.throttle, radius: DOOR_MOVE_ARRIVE_READING });
    if (!HOSTAGE_CLIMB_READING.noTurn.includes(this.traversalPose?.clip ?? '')) this.walker.state.yaw = command.yaw;
    this.bodyCommand = { forward: command.forward, side: command.side * HOSTAGE_TOP_SPEED_READING.strafe + this.lateral(dt, null) };
    if (!falling) this.move(dt, this.bodyCommand.forward, this.bodyCommand.side, raw, here);
  }
  /**
   * The action's completion: the follow goal's event 3 resets its state to INIT (research 404 s24.1, D:L510103-510112),
   * the route emptied for its new request; the start gate (`started`) is not re-armed (research 428 s2, review 1 finding 11).
   * LATER 1208: over the flight, the goal under it is 0x1b, not the follow: the follow's state is left as it was and the
   * run goes on along its route (`HOSTAGE_FLIGHT_DOOR_HOLD_PLACEHOLDER`: what 0x1b does on its resume is unread).
   */
  private doorDone(): void {
    const flight = this.doorAction?.flight === true;
    this.doorAction = null;
    if (this.doorGoal) this.doorGoal.done = true;
    this.doorGoal = null;
    if (flight) return;
    this.ticket?.cancel(); this.ticket = null; this.requested = false;
    this.sub = 0; this.route = [];
  }
  private moveDirect(dt: number, raw: AiLoc | null, here: AiLoc, falling: boolean): void {
    if (!this.directTarget) return;
    const at = this.feet, to = this.directTarget;
    const command = this.steering.directStep(dt, { yaw: this.yaw, dx: to[0] - at[0], dz: to[2] - at[2], throttle: this.throttle, radius: this.directRadius });
    if (!HOSTAGE_CLIMB_READING.noTurn.includes(this.traversalPose?.clip ?? '')) this.walker.state.yaw = command.yaw;
    this.bodyCommand = { forward: command.forward, side: command.side * HOSTAGE_TOP_SPEED_READING.strafe + this.lateral(dt, null) };
    if (!falling) this.move(dt, this.bodyCommand.forward, this.bodyCommand.side, raw, here);
    if (command.arrived) this.directTarget = null;
  }
  private move(dt: number, forward: number, side: number, raw: AiLoc | null, here: AiLoc, resumed = false): void {
    if (!resumed && !this.recovery && this.traversal?.tickAi(this.walker, { forward, right: this.steering.side, boost: false }, dt)) return;
    const old = this.feet;
    // No_weapon anim set direction-specific bands (research199 section 3; FUN_005e0450).
    const top = forward < 0 ? HOSTAGE_TOP_SPEED_READING.back : HOSTAGE_TOP_SPEED_READING.forward;
    const travel = top * forward * dt, heading = this.yaw * Math.PI / 180;
    const proposed: V3 = [old[0] - Math.sin(heading) * travel + Math.cos(heading) * side * dt, old[1],
      old[2] - Math.cos(heading) * travel - Math.sin(heading) * side * dt];
    // FUN_005b7ba0 D:L471292-471306: a blocked raw cell invalidates navigation beyond one cell on either axis.
    // FUN_005483d0 D:L413920-413922: the correction runs only with the controller's +0x171 bit 7 set
    // (AI_CORRECTION_ENABLE_READING; `correctionOpen`).
    const valid = raw && Math.abs(raw.x - here.x) <= 1 && Math.abs(raw.z - here.z) <= 1;
    const open = this.correctionOpen();
    const correct = (at: readonly [number, number, number]): V3 => {
      if (!valid || !open || this.obstacle.suppressesCorrection) return [...at];
      const result = this.planner.correctMotionWithContact?.(raw, at);
      if (result) { if (result.obstacle) this.obstacle.ai(result.obstacle, dt); return result.feet; }
      return this.planner.correctMotion?.(raw, at) ?? [...at];
    };
    // FUN_0054d9a0 D:L416524-416530: the fall inherits current horizontal body velocity.
    this.walker.state.vx = (proposed[0] - old[0]) / dt;
    this.walker.state.vz = (proposed[2] - old[2]) / dt;
    this.walker.glideAi(proposed[0] - old[0], proposed[2] - old[2], correct, this.defaultMaterial);
    const hit = this.walker.wallHits()[0];
    if (hit) {
      const at: V3 = [hit.x, hit.y, hit.z], cell = this.planner.locate(at);
      if (cell) this.obstacle.hull(at, cell);
    }
  }
  /** A write of the +0x171 bit 7 through `CSealCtrlAi`'s setter (r1 0x557ee0): 0 in movement state 7, never a restore. */
  private writeCorrectionEnable(value: boolean): void {
    this.correctionEnable = correctionEnableWrite(value, this.actionMode7);
  }
  /**
   * The follow tick's own write (`FUN_005fae70` D:L508484): 0 online, and only when follow is the top goal -- not while
   * the port's state 16 (`recovery`) or state 3 (`yielding`) sits above it, when the tick writes nothing
   * (D:L508399-508404, `FUN_0056d090`).
   */
  private followTickWrite(): void {
    if (this.recovery || this.yielding) return;
    this.writeCorrectionEnable(false);
  }
  /**
   * Whether the body's move corrects (`FUN_005483d0` D:L413920-413922): the bit as the frame order gives it to the move
   * (`AI_CORRECTION_FRAME_ORDER_PLACEHOLDER`), and a dead body as before the gate (`AI_CORRECTION_UNCOVERED_STATES_PLACEHOLDER`).
   * +0x172 bit 0 (the cell locate's, research 434 s5) is left to the move's existing `valid` cell test, as before;
   * `DAT_0066b000` is 0.
   */
  private correctionOpen(): boolean {
    const bit = AI_CORRECTION_FRAME_ORDER_PLACEHOLDER === 'ai-tick-then-move' ? this.correctionEnable : this.correctionEnableBeforeTick;
    return bit || (this.walker.dead && AI_CORRECTION_UNCOVERED_STATES_PLACEHOLDER === 'ungated');
  }
  /** FUN_005623b0 / FUN_0052c5c0's registration through the room's queue; a planner without `request` answers at once
   * through `plan`, leg by leg (any failing leg reads as a refusal). */
  private register(stops: readonly AiLoc[], options?: { corridor?: (loc: AiLoc) => boolean }): FollowTicket | null {
    if (this.planner.request) return this.planner.request(stops, options);
    let points: FollowPoint[] = [], cost = 0;
    for (let i = 0; i < stops.length - 1; i++) {
      const leg = this.planner.plan(stops[i]!, stops[i + 1]!, options);
      if (!leg) return null;
      points = points.length ? [...points.slice(0, -1), ...leg.points] : leg.points;
      cost += leg.cost;
    }
    return answered(points, cost);
  }
  private advancePoint(): void {
    const point = this.route.shift();
    if (point) this.segmentStart = this.planner.point(point);
    this.previousDot = 0;
  }
}
