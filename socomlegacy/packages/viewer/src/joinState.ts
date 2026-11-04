import { corpseShownS } from './net/deaths';
import { JOIN_STATE_VERSION, TICK_HZ, type DropWire, type JoinResultWire, type JoinWire, type MatchStats, type Rules, type Team } from './net/protocol';

/**
 * PF-28 (ruling PF.R47; web research 231 s2-s4): the page's half of the join envelope (`welcome.join`, the room's
 * `joinWire`). Pure: the page hands in its sinks -- the round screens, the grenade page, the others' bodies -- and
 * `applyJoinState` lays each thing once, silently: no kill line, hurt, blast, score or round audio is replayed (the
 * welcome's world precedent, `JOIN_SILENT_READING`). The ages arrive in room ticks (`JOIN_CLOCK_UNIT`) and leave in
 * seconds. `NetPage`'s welcome calls it (one line and its sinks, held for the controller's wave 4: research 231 s4.3).
 */

/**
 * The joiner's result panel runs on the room's clock: its `roundOver` clock is started `(tick - at) / TICK_HZ` seconds
 * before the welcome arrived -- `tick` the welcome's, `at` the tick the room sent the result at -- so the panel and its
 * seconds left are an existing observer's (who started the same clock at the `roundOver`'s arrival). Which panel the
 * original shows a late joiner is a capture gate (`FUN_002c0850` D:L163312-163353 applies the clock's length, start and
 * packed state whole; research 195 s5). The welcome's own transit is not counted, as the `roundOver`'s is not. [reading]
 */
export const RESULT_CLOCK_READING = 'room tick' as const;

/**
 * A joiner's corpse is laid in its death clip at the age the room counted (`deadFor` = the age: the pose at that point of
 * the clip, held on its last key once played), and one past the rules' corpse rule (`corpseShownS`) is hidden at once,
 * its clip not handed on (nothing to replay) -- NU-4 (research 317 R317.1, R317.3): none is, another seat's corpse lying
 * until its seat is alive under both rules; was: "one past `BODY_FADE_S` is hidden at once". The original replicates no
 * death time (`FUN_002be150` D:L162596-162602, research 195 s6); its late-join look is a capture gate. [reading]
 */
export const CORPSE_HYDRATE_READING = 'pose at age' as const;

/**
 * A ghost -- a seat dead with no death (seated in a classic round in play, never spawned in it) -- is drawn as nothing
 * until it is alive: the original's ghost is not placed in the round (research 91 s12; `FUN_002be150`'s state 8 is the
 * dead's, D:L162386-162395). Before PF-28 a joiner drew it as a fresh body for `BODY_FADE_S`. [reading]
 */
export const GHOST_BODY_READING = 'nothing' as const;

/**
 * A projectile's phase for the grenade page (`GrenadeThrower.launchRemote`'s hydrate): its state, age and timers in
 * seconds, its bounces so far and whether it has dudded (the room's `Grenade`'s, so the copy steps as the room's does).
 */
export interface ProjectilePhase { state: 'flight' | 'rest' | 'detonated'; age: number; fuse: number; removal: number; bounces: number; dud: boolean }

/** Where the envelope goes: the page's round screens, its grenade page and its others' bodies. */
export interface JoinSinks {
  /** The round screens: their clock's start (`performance.now()` ms), the list, the winner, the wins and the counters. */
  screens(start: number, list: JoinResultWire['screens'], winner: Team | null, wins: { seal: number; terrorist: number }, stats?: Record<number, MatchStats>): void;
  /** A projectile laid at its phase (`velocity`: a placed charge's facing); replaced, never doubled, by its `pid`. */
  projectile(kind: string, from: [number, number, number], velocity: [number, number, number], owner: number, pid: number, phase: ProjectilePhase): void;
  /** A corpse: its clip (null past the corpse rule, `corpseShownS`, or none chosen) and its age in seconds. */
  corpse(id: number, clip: string | null, ageS: number): void;
  /** A ghost: no body drawn until it is alive. */
  ghost(id: number): void;
  /**
   * PF-34 (research 234 s1; the review's rejoin fix): the world drops lying, the envelope's whole set, each `did` once
   * (`../drops` `WorldDrops.replaceAll`: a rejoin's set replaces the page's, so a drop taken meanwhile goes). Called with
   * every envelope, an empty set when none lie. Optional: a page wired before PF-34 reads the envelope as before.
   */
  drops?(all: readonly DropWire[]): void;
}

/**
 * Lays the envelope `join` on the page through `sinks`, `nowMs` the page's clock and `tick` the welcome's room tick: the
 * result panel's clock started in the past (RESULT_CLOCK_READING), each projectile once by its pid (a duplicate in one
 * envelope dropped; a second envelope's replaces it at the sink), each corpse at its age (CORPSE_HYDRATE_READING) by
 * the room's `rules` (the welcome's; NU-4, `corpseShownS`), each ghost, the world drops as one set, each once by its
 * `did` (PF-34). An envelope of another version is not read.
 */
export function applyJoinState(join: JoinWire, nowMs: number, tick: number, sinks: JoinSinks, rules: Rules): void {
  if (join.v !== JOIN_STATE_VERSION) return;
  const r = join.result;
  if (r) sinks.screens(nowMs - ((tick - r.at) / TICK_HZ) * 1000, r.screens, r.winner, r.wins, r.stats);
  const seen = new Set<number>();
  for (const p of join.projectiles) {
    if (seen.has(p.pid)) continue;
    seen.add(p.pid);
    const phase: ProjectilePhase = {
      state: p.state, age: p.age / TICK_HZ, fuse: p.fuse / TICK_HZ, removal: p.removal / TICK_HZ, bounces: p.bounces ?? 0, dud: p.dud === true,
    };
    sinks.projectile(p.kind, [...p.pos], p.facing ? [...p.facing] : [...p.vel], p.owner, p.pid, phase);
  }
  for (const c of join.corpses) {
    const ageS = c.age / TICK_HZ;
    sinks.corpse(c.id, ageS < corpseShownS(rules, 'other') ? c.clip : null, ageS);
  }
  for (const id of join.ghosts) sinks.ghost(id);
  const laid = new Set<number>();
  sinks.drops?.((join.drops ?? []).filter((d) => !laid.has(d.did) && laid.add(d.did)));
}
