import type { AiLoc } from '@s2u/scene';

/** FUN_00557f60 / 005582c0 / 00556370; research334 section6, reading pending review. */
export const HOSTAGE_AVOIDANCE_READING = {
  reentryLimit: 15, // FUN_00603950 D:L512759; RAM0x651010 (integer).
  hullWeight: 0.10000000149011612, contactMoveSq: 100, idleFrames: 5, decay: 0.44999998807907104,
  hullSeconds: 3, fastSeconds: 1, slowSeconds: 3, neighborDistance: 2,
  routeClearance: 3, rayLimit: 10, retainedRadius: 3, rayRadius: 5, probeDistance: 30, probeFacing: 0.9,
  // Research334 §10: RAM66b2c8 is0; mutable producer unread, named in FOLLOW_STEERING_PLACEHOLDER.
  actorProbeDisabled: false,
  actorDelay: 0.10000000149011612, actorGoalDistance: 1, actorMovingSq: 25,
  yieldWait: 0.5, yieldRandomRange: 1.5, yieldAlignedDot: 0.5,
  // FUN_00601f80 D:L511953; RAM66bbb8=0, producer remains a named research334 residual.
  yieldDefaultWait: 0,
} as const;
const cells = (a: AiLoc, b: AiLoc) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
export interface PersistentObstacle { type: 2 | 4; cell: AiLoc; point: readonly [number, number, number] | null }

/** The original controller contact record; game time is independent of accumulated event weight. */
export class HostageObstacleRecord {
  type: 0 | 1 | 2 | 4 = 0;
  private actorId: number | null = null;
  private probe = false;
  private time = 0;
  private start = 0;
  private weight = 0;
  private frames = 0;
  private cell: AiLoc | null = null;
  private point: readonly [number, number, number] | null = null;
  clear(): void { this.actorId = null; this.probe = false; this.type = 0; this.weight = 0; this.start = this.time; this.cell = null; this.point = null; this.frames = 0; }
  private seed(type: 1 | 2 | 4, amount: number, cell: AiLoc): void {
    this.type = type; this.start = this.time; this.weight = amount; this.frames = 0; this.cell = { ...cell };
  }
  /** FUN_00558440 D:L421739–421768. Eligibility and actor identity resolution precede this event. */
  actor(id: number, cell: AiLoc, amount: number, probe: boolean): void {
    if (this.type > 1) return;
    if (this.type === 1) {
      this.weight += amount; this.frames = 0;
      if (this.actorId === id) { if (!probe) this.probe = false; return; }
      // D:L421747 explicitly resets type0 and does not restore1 for a changed identity.
      this.clear(); this.weight = amount; this.cell = { ...cell };
    } else this.seed(1, amount, cell);
    this.actorId = id; this.probe = probe; this.point = null;
  }
  /** FUN_00556370 D:L420724–420742: remove stale/nonliving actor references. */
  retainActor(alive: (id: number) => boolean): void {
    if (this.type === 1 && this.actorId !== null && !alive(this.actorId)) this.clear();
  }
  /** FUN_00567900 D:L429626–429635: weight, not elapsed contact time. */
  actorStops(): boolean { return this.type === 1 && this.frames === 0 && this.weight < 1; }
  /** FUN_005483d0 D:L413930–413938: low event bit suppresses AI-map correction. */
  get suppressesCorrection(): boolean { return this.type === 1; }
  /** Snapshot before decay: FUN_00556370 D:L420744–420816. */
  actorResponse(dt: number): { id: number; age: number; probe: boolean } | null {
    return this.type === 1 && this.actorId !== null ? { id: this.actorId, age: this.time + dt - this.start, probe: this.probe } : null;
  }
  consumeActorProbe(): void { this.probe = false; }
  /** FUN_005582c0 D:L421686-421725: first hull contact, horizontal displacement resets at >=100. */
  hull(point: readonly [number, number, number], cell: AiLoc): void {
    const r = HOSTAGE_AVOIDANCE_READING;
    if (this.type !== 4 || !this.point || (point[0] - this.point[0]) ** 2 + (point[2] - this.point[2]) ** 2 >= r.contactMoveSq) {
      this.seed(4, r.hullWeight, cell); this.point = [...point];
    } else { this.weight += r.hullWeight; this.frames = 0; }
  }
  /** Physical map collision and forward probes: FUN_00558030 D:L421563-421638. */
  ai(cell: AiLoc, dt: number, probe = false): void {
    if (this.type > 2) return;
    // FUN_00558030 D:L421570-421628: a probe cannot refresh physical contact; a repeated probe clears.
    if (this.type === 2 && probe) { if (this.probe) this.clear(); return; }
    const r = HOSTAGE_AVOIDANCE_READING, changed = this.cell && cells(this.cell, cell) !== 0;
    if (this.type !== 2 || this.probe || (changed && (cells(this.cell!, cell) >= r.neighborDistance))) {
      this.seed(2, dt, cell); this.point = null; this.probe = probe;
    } else { this.weight += dt; this.frames = 0; }
  }
  /** FUN_00556370 D:L420651-420721/420883-420893, before the state-machine update. */
  tick(dt: number, raw: AiLoc, forward: number, lateral: number): PersistentObstacle | null {
    this.time += dt;
    const r = HOSTAGE_AVOIDANCE_READING, axis = Math.max(forward, lateral);
    const threshold = this.type === 4 ? r.hullSeconds : r.fastSeconds * axis + r.slowSeconds * (1 - axis);
    let event: PersistentObstacle | null = null;
    if ((this.type === 2 || this.type === 4) && this.cell && this.time - this.start > threshold) {
      if (this.type === 4 || cells(raw, this.cell) < r.neighborDistance) event = { type: this.type, cell: { ...this.cell }, point: this.point };
      else this.clear();
    }
    if (this.type && this.frames >= r.idleFrames) {
      this.weight -= dt * r.decay;
      if (this.weight <= 0) this.clear();
    }
    this.frames++;
    return event;
  }
}

/** FUN_00556370 D:L420870-420903, RAM0x650508=3. */
export function recoverySuffix<T extends AiLoc>(route: readonly T[], obstacle: AiLoc): T[] {
  const index = route.findIndex(p => cells(p, obstacle) > HOSTAGE_AVOIDANCE_READING.routeClearance);
  return index < 0 ? route.slice() : route.slice(index);
}
/** FUN_00603950 D:L512898-512928; FUN_0052c5c0 D:L396351 sequential waypoint requests. */
/**
 * FUN_00603950 D:L512917-512926: the saved pair is registered as ONE request (FUN_0052c5c0, `stops` start first); only a
 * refused registration falls back to the next point alone. A search that fails later ends recovery in phase 6
 * (D:L512950-512951) -- there is no fallback after a failed search (research 333 §4, 334).
 */
export function recoveryRequest<T>(from: AiLoc, previous: AiLoc, next: AiLoc, register: (stops: readonly AiLoc[]) => T | null): T | null {
  return register([from, previous, next]) ?? register([from, next]);
}

/** The scan retains its last valid cell when no distant point exists (D:L420873-420905). */
export function recoveryTarget<T extends AiLoc>(route: readonly T[], obstacle: AiLoc): T | undefined {
  return route.find(p => cells(p, obstacle) > HOSTAGE_AVOIDANCE_READING.routeClearance) ?? route.at(-1);
}

export interface RecoveryRay { cell: AiLoc; distance: number; height: number | null }
/** FUN_00603950 D:L512786-512821: nearer first, tied larger drop, or positive drop after a negative one. */
export function selectRecoveryRay(rays: readonly RecoveryRay[], actorY: number): AiLoc | null {
  let selected: RecoveryRay | null = null, distance = 10000, drop = -999;
  for (const ray of rays) {
    if (ray.distance >= HOSTAGE_AVOIDANCE_READING.rayLimit) continue;
    const nextDrop = ray.height === null ? -999 : actorY - ray.height;
    if (ray.distance < distance || (ray.distance === distance && nextDrop > drop) || (drop < 0 && nextDrop > 0)) {
      selected = ray; distance = ray.distance; drop = nextDrop;
    }
  }
  // FUN_0056dba0 D:L432125-432158 refuses a target whose world-point lookup fails.
  return selected && selected.height !== null ? selected.cell : null;
}

export interface RouteProbeSample {
  loc: AiLoc; word: number; previousWord: number | null; distance: number; fraction: number;
  direction: readonly [number, number, number]; height: number | null;
}
/** FUN_0056a2e0 D:L430383-430458, online FOLLOW (the state9 steep-slope branch requires IsNetwork=0).
 * Actor identity is resolved by the follower (research334 section10); vehicle overlap remains a residual.
 */
export class HostageRouteProbe {
  obstacle: AiLoc | null = null;
  actor: AiLoc | null = null;
  private facingDot = 1;
  constructor(private readonly from: AiLoc, private readonly target: AiLoc, private readonly facing: readonly [number, number, number]) {}
  visit(sample: RouteProbeSample): boolean {
    const r = HOSTAGE_AVOIDANCE_READING;
    if (cells(sample.loc, this.from) === 0) {
      this.facingDot = this.facing[0] * sample.direction[0] + this.facing[1] * sample.direction[1] + this.facing[2] * sample.direction[2];
      return true;
    }
    if (cells(sample.loc, this.target) === 0 || sample.distance >= r.probeDistance || (sample.word & 256) !== 0) return false;
    if ((sample.word & 32) !== 0) { this.actor = sample.loc; return false; }
    const soil = sample.word & 31;
    const blocked = soil === 0 || soil === 8 || soil === 9 || soil === 10;
    if (!blocked && !(this.facingDot < r.probeFacing && ((sample.word & 128) !== 0 || soil === 6))) return true;
    this.obstacle = sample.loc;
    return false;
  }
}
