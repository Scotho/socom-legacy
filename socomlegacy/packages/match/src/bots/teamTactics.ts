/**
 * Authored multiplayer extension: randomized map-knowledge openings and limited sound investigation. This is
 * our coordination policy, not recovered campaign AI. The Room still owns sensing, walking, fire and damage.
 * Profiles and local candidate stations are prepared once; live updates scan at most the sixteen CPU seats.
 */
import type { Team } from '../../../viewer/src/net/protocol';
import { TICK_HZ } from '../../../viewer/src/net/protocol';
import { WalkingNavigation, type Point } from './navigation';

export type TacticalRole = 'rush' | 'hold' | 'flank';
export type TacticalPhase = 'staging' | 'moving' | 'holding' | 'contact' | 'investigating' | 'dead';
export interface OpeningLane { lane: string; roles: TacticalRole[]; via: Point[]; goals: Point[] }
export type OpeningProfile = Record<Team, OpeningLane[]>;
export interface TacticalUnit { id: number; team: Team; at: Point; alive: boolean }
export interface TacticalAssignment {
  id: number; team: Team; role: TacticalRole; lane: string; goal: Point; phase: TacticalPhase;
  waypoint: Point | null; round: string;
}
export interface TacticalIntent { goal: Point; hold: boolean; watch: Point }
interface Assignment extends TacticalAssignment {
  checkpoints: Point[]; checkpoint: number; depart: number; started: number; dwell: number;
  until: number | null; interruptUntil: number;
  investigation: { contact: Point; approach: Point; reached: boolean } | null;
}

/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. User-authorized first coordination profile; all values are authored, not retail readings. NPB-9's holdChance 0.2, holdSeconds 6 and holdVariation 6 are proposed, held pending the owner's word; main's 0.4, 14 and 10 stand until then. */
export const TEAM_TACTICS_ADAPTATION = {
  groupMax: 3, tunnelChance: 0.45, holdChance: 0.4, memberStagger: 0.45, groupStagger: 0.65, staggerVariation: 0.5,
  arrival: 10, verticalArrival: 12, holdSeconds: 14, holdVariation: 10, advanceDwell: 6, advanceVariation: 6,
  travelSeconds: 120, contactSeconds: 8, immediateRange: 100, nearSound: 70, investigators: 2,
  stationRadius: 48, stationSpacing: 18, stationCandidates: 16, approachRadius: 42,
  genericHoldProgress: 0.28, genericViaProgress: 0.5, genericAdvanceProgress: 0.7, lowerViaProgress: 0.4, genericWidth: 0.3, lowerFloor: 15,
};
const horizontal = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[2] - b[2]);
const clone = (p: Point): Point => [...p];

export class TeamTactics {
  static async prepare(navigation: WalkingNavigation, random: () => number, profile: OpeningProfile | undefined, yieldWork: () => Promise<void>): Promise<TeamTactics> {
    const resolved = profile ?? TeamTactics.deriveProfile(navigation);
    const stations = new Map<Point, Point[]>();
    for (const _ of TeamTactics.prepareStations(navigation, resolved, stations)) await yieldWork();
    return new TeamTactics(navigation, random, resolved, stations);
  }
  private round = '';
  private readonly assigned = new Map<number, Assignment>();
  private readonly profile: OpeningProfile | undefined;
  private readonly stations: Map<Point, Point[]>;
  private units: readonly TacticalUnit[] = [];
  /**
   * P537-L3 pursuit (Fuse's 7a2b34909; `../botGates` `botBehaviours`, set by `MatchBots` for its room): a seat whose
   * assignment died is assigned again at once when it lives again. Off: main's (it waits for its old assignment's end).
   */
  pursuit = false;

  constructor(private readonly navigation: WalkingNavigation, private readonly random: () => number, profile?: OpeningProfile, stations?: Map<Point, Point[]>) {
    this.profile = profile ?? TeamTactics.deriveProfile(navigation);
    this.stations = stations ?? new Map();
    if (!stations) for (const _ of TeamTactics.prepareStations(navigation, this.profile, this.stations)) { /* synchronous fixture preparation */ }
  }

  /** The synchronous and cooperative factories run the same native checks in the same candidate order. */
  private static *prepareStations(navigation: WalkingNavigation, profile: OpeningProfile | undefined, stations: Map<Point, Point[]>): Generator<void> {
    const attachments = new Map<string, number | null>();
    /** LATER 521 (product track, a server timing adaptation): `navigation.nearest` with a yield before each walk test, the same
     * candidates in the same order (`nearestCandidates`), so one attach never holds the event loop past one `canWalk` (held by `teamTacticsSlices.test.ts`,
     * `TEAM_TACTICS_SLICE_ADAPTATION`: 50 ms at the 99th percentile on the MP2 hull). */
    const nearest = function* (at: Point): Generator<void, number | null> {
      const key = at.join(',');
      if (!attachments.has(key)) {
        let found: number | null = null;
        for (const id of navigation.nearestCandidates(at)) {
          yield;
          if (navigation.canWalk(at, navigation.nodes[id]!.at)) { found = id; break; }
        }
        attachments.set(key, found);
      }
      return attachments.get(key)!;
    };
    // This cache exists only while preparing one unchanged lobby hull, never during live door movement.
    for (const team of ['seal', 'terrorist'] as const) for (const lane of profile?.[team] ?? []) for (const goal of lane.goals) {
      const component = yield* nearest(goal);
      const candidates: Point[] = [];
      for (const p of navigation.nearby(goal, TEAM_TACTICS_ADAPTATION.stationRadius, TEAM_TACTICS_ADAPTATION.stationCandidates)) {
        const attached = yield* nearest(p);
        if (component !== null && attached !== null && navigation.nodes[component]!.component === navigation.nodes[attached]!.component) {
          yield;
          if (navigation.canWalk(goal, p)) candidates.push(p);
        }
      }
      stations.set(goal, [goal, ...candidates]);
    }
  }

  private shuffled<T>(values: readonly T[]): T[] {
    const out = [...values];
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; }
    return out;
  }

  /** Generic map/spawn knowledge fallback; a measured map profile can replace these coarse actual graph nodes. */
  private static deriveProfile(nav: WalkingNavigation): OpeningProfile | undefined {
    const result: OpeningProfile = { seal: [], terrorist: [] };
    if (!nav.nodes.length) return undefined;
    for (const [team, side] of [['seal', 0], ['terrorist', 1]] as const) {
      const own = nav.map.slots.find((s) => s.side === side && s.onFloor)?.position;
      const other = nav.map.slots.find((s) => s.side !== side && s.onFloor)?.position;
      if (!own || !other) return undefined;
      const from: Point = [...own], to: Point = [...other], start = nav.nearest(from);
      if (start === null) return undefined;
      const component = nav.nodes[start]!.component, length = horizontal(from, to) || 1;
      const fx = (to[0] - from[0]) / length, fz = (to[2] - from[2]) / length;
      const candidates = nav.nodes.filter((n) => n.edges?.length && n.component === component);
      const nearest = (progress: number, lateral: number, lower = false): Point | null => {
        const x = from[0] + fx * length * progress - fz * length * lateral;
        const z = from[2] + fz * length * progress + fx * length * lateral;
        let best: Point | null = null, score = Infinity;
        for (const n of candidates) {
          const low = n.at[1] < Math.min(from[1], to[1]) - TEAM_TACTICS_ADAPTATION.lowerFloor;
          if (low !== lower) continue;
          const d = Math.hypot(n.at[0] - x, n.at[2] - z);
          if (d < score) { best = n.at; score = d; }
        }
        return best && clone(best);
      };
      for (const [lane, lateral] of [['left', -TEAM_TACTICS_ADAPTATION.genericWidth], ['centre', 0], ['right', TEAM_TACTICS_ADAPTATION.genericWidth]] as const) {
        const hold = nearest(TEAM_TACTICS_ADAPTATION.genericHoldProgress, lateral), via = nearest(TEAM_TACTICS_ADAPTATION.genericViaProgress, lateral);
        const goal = nearest(TEAM_TACTICS_ADAPTATION.genericAdvanceProgress, lateral);
        if (hold) result[team].push({ lane, roles: ['hold'], via: [], goals: [hold] });
        if (via && goal) result[team].push({ lane, roles: lane === 'centre' ? ['rush'] : ['rush', 'flank'], via: [via], goals: [goal] });
      }
      const lowerVia = nearest(TEAM_TACTICS_ADAPTATION.lowerViaProgress, 0, true), lowerGoal = nearest(TEAM_TACTICS_ADAPTATION.genericAdvanceProgress, 0, true);
      if (lowerVia && lowerGoal) result[team].push({ lane: 'tunnels', roles: ['flank'], via: [lowerVia], goals: [lowerGoal] });
    }
    return result.seal.length && result.terrorist.length ? result : undefined;
  }

  /** A match serial plus real round number, never a character's lifetime, defines a fresh team opening. */
  begin(round: string, tick: number, units: readonly TacticalUnit[]): void {
    this.units = units;
    if (round !== this.round) { this.round = round; this.assigned.clear(); }
    const ids = new Set(units.map((u) => u.id));
    for (const [id, a] of this.assigned) if (!ids.has(id)) this.assigned.delete(id); else if (!units.find((u) => u.id === id)!.alive) {
      a.phase = 'dead'; a.investigation = null;
    }
    for (const team of ['seal', 'terrorist'] as const) {
      const pending = units.filter((u) => u.team === team && u.alive && (!this.assigned.has(u.id) || (this.pursuit && this.assigned.get(u.id)!.phase === 'dead')
        || (this.assigned.get(u.id)!.until !== null && tick >= this.assigned.get(u.id)!.until!
          && tick >= this.assigned.get(u.id)!.interruptUntil && !this.assigned.get(u.id)!.investigation)
        || tick - this.assigned.get(u.id)!.started > TEAM_TACTICS_ADAPTATION.travelSeconds * TICK_HZ));
      if (pending.length) this.plan(team, tick, pending);
    }
  }

  private plan(team: Team, tick: number, units: readonly TacticalUnit[]): void {
    const profile = this.profile?.[team];
    if (!profile?.length) return;
    const replacing = new Set(units.map((u) => u.id));
    const reserved = [...this.assigned.values()].filter((a) => a.team === team && !replacing.has(a.id) && a.phase !== 'dead');
    const capacity = (lane: string): number => TEAM_TACTICS_ADAPTATION.groupMax - reserved.filter((a) => a.lane === lane).length;
    let lanes = [...new Set(profile.map((p) => p.lane))].filter((l) => capacity(l) > 0);
    const surface = lanes.filter((l) => l !== 'tunnels');
    if (surface.reduce((sum, l) => sum + capacity(l), 0) >= units.length && this.random() >= TEAM_TACTICS_ADAPTATION.tunnelChance) lanes = surface;
    lanes = this.shuffled(lanes);
    const minimum = Math.min(lanes.length, Math.ceil(units.length / TEAM_TACTICS_ADAPTATION.groupMax));
    const maximum = Math.min(lanes.length, units.length);
    let groups = minimum + Math.floor(this.random() * (maximum - minimum + 1));
    while (groups < lanes.length && lanes.slice(0, groups).reduce((sum, l) => sum + capacity(l), 0) < units.length) groups++;
    lanes = lanes.slice(0, groups);
    const members = this.shuffled(units), used = reserved.map((a) => a.goal);
    const holderGroups = lanes.map((lane, i) => ({ lane, i })).filter(({ lane }) => profile.some((p) => p.lane === lane && p.roles.includes('hold')));
    const holdGroup = units.length >= 3 || this.random() < TEAM_TACTICS_ADAPTATION.holdChance
      ? holderGroups[Math.floor(this.random() * holderGroups.length)]?.i ?? -1 : -1;
    let cursor = 0;
    for (let group = 0; group < groups && cursor < members.length; group++) {
      const lane = lanes[group]!, remaining = members.length - cursor;
      const laterCapacity = lanes.slice(group + 1).reduce((sum, l) => sum + capacity(l), 0);
      const minimumCount = Math.max(1, remaining - laterCapacity);
      const maximumCount = Math.min(capacity(lane), remaining - (groups - group - 1));
      const count = minimumCount + Math.floor(this.random() * (maximumCount - minimumCount + 1));
      const choices = profile.filter((p) => p.lane === lane);
      const wantHold = group === holdGroup || (group !== (holdGroup + 1) % groups && this.random() < TEAM_TACTICS_ADAPTATION.holdChance);
      const holds = choices.filter((p) => p.roles.includes('hold'));
      const advances = choices.filter((p) => p.roles.some((r) => r !== 'hold'));
      const pool = wantHold && holds.length ? holds : advances.length ? advances : choices;
      const entry = pool[Math.floor(this.random() * pool.length)]!;
      const roles = entry.roles.filter((r) => wantHold ? r === 'hold' : r !== 'hold');
      const role = roles.length ? roles[Math.floor(this.random() * roles.length)]! : entry.roles[0]!;
      for (let i = 0; i < count; i++) {
        const unit = members[cursor++]!, goals = this.shuffled(entry.goals);
        const candidates = goals.flatMap((g) => this.stations.get(g) ?? [g]);
        const goal = candidates.find((g) => used.every((p) => horizontal(p, g) >= TEAM_TACTICS_ADAPTATION.stationSpacing)) ?? goals[i % goals.length]!;
        used.push(goal);
        const checkpoints = role === 'hold' ? [clone(goal)] : [...entry.via.map(clone), clone(goal)];
        this.assigned.set(unit.id, { id: unit.id, team, role, lane, goal: clone(goal), phase: 'staging', round: this.round,
          waypoint: clone(checkpoints[0]!), checkpoints, checkpoint: 0, started: tick,
          depart: tick + Math.round((group * TEAM_TACTICS_ADAPTATION.groupStagger + i * TEAM_TACTICS_ADAPTATION.memberStagger
            + this.random() * TEAM_TACTICS_ADAPTATION.staggerVariation) * TICK_HZ), until: null, interruptUntil: 0, investigation: null,
          dwell: TICK_HZ * (role === 'hold' ? TEAM_TACTICS_ADAPTATION.holdSeconds + this.random() * TEAM_TACTICS_ADAPTATION.holdVariation
            : TEAM_TACTICS_ADAPTATION.advanceDwell + this.random() * TEAM_TACTICS_ADAPTATION.advanceVariation) });
      }
    }
  }

  /** Only near sight or an actual hit/near miss interrupts a route. Far sight still permits ordinary aiming/fire. */
  contact(id: number, tick: number): void {
    const a = this.assigned.get(id); if (!a) return;
    a.interruptUntil = tick + TEAM_TACTICS_ADAPTATION.contactSeconds * TICK_HZ;
    a.investigation = null; a.phase = 'contact';
  }

  release(id: number): void {
    const a = this.assigned.get(id); if (a) { a.investigation = null; a.interruptUntil = 0; }
  }

  /** One persistent team-wide budget, ranked independently of seat iteration. Near sounds remain immediate. */
  investigate(id: number, at: Point, tick: number, range = Infinity, available: (id: number) => boolean = () => true): boolean {
    const a = this.assigned.get(id), unit = this.units.find((u) => u.id === id);
    if (!a || !unit) return true;
    if (horizontal(unit.at, at) <= TEAM_TACTICS_ADAPTATION.nearSound) { this.contact(id, tick); return true; }
    if (a.investigation) return true;
    const active = [...this.assigned.values()].filter((p) => p.team === a.team && p.investigation && p.phase !== 'dead');
    if (active.length >= TEAM_TACTICS_ADAPTATION.investigators) return false;
    const eligible = this.units.filter((u) => u.team === a.team && u.alive && available(u.id) && !this.assigned.get(u.id)?.investigation
      && Math.hypot(u.at[0] - at[0], u.at[1] - at[1], u.at[2] - at[2]) <= range)
      .sort((x, y) => {
        const rank = (u: TacticalUnit): number => this.assigned.get(u.id)?.role === 'rush' ? 0 : this.assigned.get(u.id)?.role === 'flank' ? 1 : 2;
        return rank(x) - rank(y) || horizontal(x.at, at) - horizontal(y.at, at) || x.id - y.id;
      }).slice(0, TEAM_TACTICS_ADAPTATION.investigators - active.length);
    if (!eligible.some((u) => u.id === id)) return false;
    const direction = active.length ? 1 : -1, length = horizontal(unit.at, at) || 1;
    const dx = (at[0] - unit.at[0]) / length, dz = (at[2] - unit.at[2]) / length;
    const approach = this.navigation.offset(at, -dz * direction, dx * direction, TEAM_TACTICS_ADAPTATION.approachRadius) ?? clone(at);
    a.investigation = { contact: clone(at), approach, reached: false }; a.phase = 'investigating';
    return true;
  }

  intent(id: number, at: Point, tick: number): TacticalIntent | null {
    const a = this.assigned.get(id); if (!a || a.phase === 'dead') return null;
    if (tick < a.interruptUntil) { a.phase = 'contact'; return null; }
    const near = (p: Point): boolean => horizontal(at, p) <= TEAM_TACTICS_ADAPTATION.arrival && Math.abs(at[1] - p[1]) <= TEAM_TACTICS_ADAPTATION.verticalArrival;
    if (a.investigation) {
      a.phase = 'investigating';
      if (near(a.investigation.approach)) a.investigation.reached = true;
      a.waypoint = a.investigation.reached ? null : clone(a.investigation.approach);
      return a.investigation.reached ? null : { goal: clone(a.investigation.approach), hold: false, watch: clone(a.investigation.contact) };
    }
    if (tick < a.depart) { a.phase = 'staging'; return { goal: clone(a.checkpoints[a.checkpoint]!), hold: true, watch: clone(a.goal) }; }
    while (a.checkpoint < a.checkpoints.length - 1 && near(a.checkpoints[a.checkpoint]!)) a.checkpoint++;
    const goal = a.checkpoints[a.checkpoint]!;
    a.waypoint = clone(goal);
    const arrived = a.checkpoint === a.checkpoints.length - 1 && near(goal);
    if (arrived && a.until === null) a.until = tick + a.dwell; // Travel never consumes the hold's dwell.
    a.phase = arrived ? 'holding' : 'moving';
    return { goal: clone(goal), hold: arrived, watch: clone(a.goal) };
  }

  assignments(): readonly TacticalAssignment[] {
    return [...this.assigned.values()].map((a) => ({ id: a.id, team: a.team, role: a.role, lane: a.lane,
      goal: clone(a.goal), phase: a.phase, waypoint: a.waypoint && clone(a.waypoint), round: a.round }));
  }

  dispose(): void { this.assigned.clear(); this.units = []; }
}
