import { SEAL_TUNING, type AiLoc, type Grid } from '@s2u/scene';
import { Traversal, TRAVERSAL_CLIP } from '../../viewer/src/traversal';
import type { SimClips } from '../../viewer/src/simMap';
import { ACTION_FAMILY, Walker, type MoverAction } from '../../viewer/src/mover';
import type { TiltQuat } from '../../viewer/src/rootTilt';
import { applyKnock, type Knock } from '../../viewer/src/net/blast';
import { HOSTAGE_TOP_SPEED_READING } from '../../viewer/src/locomotion';
import { HostageObstacleRecord, recoveryRequest, recoverySuffix, recoveryTarget, selectRecoveryRay, HOSTAGE_AVOIDANCE_READING, type RecoveryRay, HostageRouteProbe, type RouteProbeSample } from './hostageAvoidance';
import { HostageSteering, HOSTAGE_STEERING_READING, passedRoutePoint, routeProjection, steeringDirection } from './hostageSteering';
import { HOSTAGE_YIELD_SEED_PLACEHOLDER, HostageYieldRandom, actorProbeEligible, resolveProbeActor, type HostageActorWorld } from './hostageActors';

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
const same = (a: AiLoc, b: AiLoc) => a.map === b.map && a.x === b.x && a.z === b.z;
const xyCells = (a: AiLoc, b: AiLoc) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
const cells = (a: AiLoc, b: AiLoc) => a.map === b.map ? xyCells(a, b) : Infinity;
const distance = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Newest first, original AddSnakePoint FUN_00524d50 D:L392372-392496. Owned per room/leader, never on shared map. */
export class FollowTrail {
  readonly points: (AiLoc & { width: number })[] = [];
  heading: [number, number] | null = null;
  private runningMs = 0;
  /** FUN_005fc970 D:L509297-509347: sustained forward run takes velocity heading, otherwise facing. */
  updateHeading(dt: number, leader: FollowLeader): void {
    const yaw = leader.yaw * Math.PI / 180, x = -Math.sin(yaw), z = -Math.cos(yaw);
    const speed = Math.hypot(leader.velocity[0], leader.velocity[2]);
    if (speed * speed > FOLLOW_RULES_READING.headingSpeedSq && (x * leader.velocity[0] + z * leader.velocity[2]) / speed > FOLLOW_RULES_READING.headingCos)
      this.runningMs += Math.trunc(dt * 1000);
    else this.runningMs = 0;
    this.heading = this.runningMs > FOLLOW_RULES_READING.headingMs ? [leader.velocity[0] / speed, leader.velocity[2] / speed] : [x, z];
  }
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

  private readonly traversal: Traversal | null;
  private bodyCommand: { forward: number; side: number } | null = null;
  private traversalReleased = false;
  private lateralUpdated = false;
  private controlVelocity: V3 = [0, 0, 0];

  constructor(private readonly planner: FollowPlanner, grid: Grid, feet: V3, yaw: number, private readonly defaultMaterial = '', clips: SimClips | null = null,
    private readonly actorWorld?: HostageActorWorld) {
    this.walker = new Walker(grid);
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
    this.yielding = null;
    // The port drops a stopped follower's queued request (its owner's cancel, FUN_005107b0); the original's stop path is unread.
    this.ticket?.cancel(); this.recovery?.ticket?.cancel();
    this.sub = 0; this.route = []; this.ticket = null; this.waiting = 0;
    this.goal = null; this.started = false; this.leaderId = null; this.arrivedLeader = null;
    this.directTarget = null; this.steering.reset(); this.obstacle.clear(); this.recovery = null; this.segmentStart = null; this.previousDot = 0;
    // Stopping the AI never cancels the physical fall's momentum (FUN_0059b440 D:L456496-456512).
    if (!this.walker.airborne) {
      this.velocity = [0, 0, 0];
      this.walker.state.vx = this.walker.state.vy = this.walker.state.vz = 0;
    }
  }

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
    if (this.leaderId !== leader.id) { this.stop(); this.leaderId = leader.id; }
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
    const here = this.location;
    if (!here || !there) return; // no valid AI location: never straight-line through an unread map.
    this.location = here;
    const actors = this.actorWorld?.actors() ?? [];
    this.obstacle.retainActor(id => actors.some(a => a.id === id && a.alive));
    // Controller contact handling precedes the state machine (FUN_0056e9d0 D:L432512-432513).
    const response = this.obstacle.actorResponse(dt);
    const event = this.obstacle.tick(dt, raw ?? here, this.steering.forward, this.steering.side);
    // FUN_00556370 D:L420744–420819; normal completed route (movement mode3).
    const r = HOSTAGE_AVOIDANCE_READING;
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
    if (this.directTarget) { this.moveDirect(dt, raw, here, falling); return; }
    let arrived = false, goalDistance = 0;
    const leaderSpeed = Math.hypot(...leader.velocity);
    // State3 suspends FOLLOW decisions, but not movement mode3 route steering.
    if (!yieldActive) {
      const formation = FOLLOW_SLOTS_READING[slot % FOLLOW_SLOTS_READING.length]!;
      const [depth, lateral] = formation;
      const yaw = leader.yaw * Math.PI / 180;
      const [fx, fz] = trail.heading ?? [-Math.sin(yaw), -Math.cos(yaw)];
      let goal = trail.points[depth];
      if (goal) {
        const origin = goal;
        for (let i = 1; i <= Math.abs(lateral); i++) {
          const sign = Math.sign(lateral);
          const next = { map: origin.map, x: origin.x + Math.trunc(0.5 - fz * sign * i), z: origin.z + Math.trunc(0.5 + fx * sign * i) };
          // FUN_005fd790 D:L509862-509875 checks this candidate's soil, not the intervening slope/line.
          if (!trail.contains(next) || !this.planner.traversable(next)) break;
          goal = { ...next, width: 0 };
        }
        this.goal = this.planner.point(goal);
      } else {
        const c = FOLLOW_RULES_READING.cell;
        this.goal = [leader.feet[0] - FOLLOW_RULES_READING.fallbackVelocity * leader.velocity[0] - depth * c * fx + lateral * c * fz,
          leader.feet[1], leader.feet[2] - FOLLOW_RULES_READING.fallbackVelocity * leader.velocity[2] - depth * c * fz - lateral * c * fx];
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
        // FUN_005fb1c0 D:L508814-508816, FUN_005623b0 D:L426859-426868: the old request cancelled, the route emptied
        // (FUN_00527310 D:L393385-393410), then the request. The room supplies live actor occupancy (research335).
        this.ticket?.cancel(); this.route = [];
        this.ticket = this.register([here, target], trail.contains(here) ? { corridor: p => trail.contains(p) } : undefined);
        this.sub = 2;
        return;
      }
      if (this.sub === 2) {
        // D:L508825: while the request is queued or searching the follower has no route and stands.
        if (this.ticket?.state === 'pending') return;
        const points = this.ticket?.state === 'done' ? this.ticket.path?.points ?? null : null;
        this.ticket = null;
        if (!points?.length) { this.sub = 8; this.waiting = FOLLOW_RULES_READING.retry; return; }
        this.route = points.slice(); this.sub = 3;
        this.segmentStart = this.feet; this.previousDot = 0;
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
      // Point-cell arrival is FUN_00567900 D:L429574-429592; width=0 for the original follower app flags 3.
      while (this.route.length && same(here, this.route[0]!)) this.advancePoint();
      const next = this.route[0];
      if (!next) { this.sub = arrived ? 4 : 0; return; }
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
      const command = this.steering.step(dt, { yaw: this.yaw, dx, dz, throttle, final: this.route.length === 1 || next.action, link: next.link, hanging: this.traversal?.state().kind === 'hang' });
      const side = this.lateral(dt, projection ? [projection.point[0] - old[0], projection.point[1] - old[2]] : null);
      if (!HOSTAGE_CLIMB_READING.noTurn.includes(this.traversalPose?.clip ?? '')) this.walker.state.yaw = command.yaw;
      this.bodyCommand = { forward: command.forward, side };
      if (!falling) this.move(dt, command.forward, side, raw, here);
      return;
    }
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
    // Normal AI setup enables this correction; physical action mode7 disables it (raw FUN_00557ee0).
    const valid = raw && Math.abs(raw.x - here.x) <= 1 && Math.abs(raw.z - here.z) <= 1;
    const correct = (at: readonly [number, number, number]): V3 => {
      if (!valid || this.obstacle.suppressesCorrection) return [...at];
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
