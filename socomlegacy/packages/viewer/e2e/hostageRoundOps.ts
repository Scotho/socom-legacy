/**
 * DF-12 (product track: a test instrument; nothing the game does changes): the pure parts of the hostage ops the two-client
 * Extraction round specs drive a page with (`./desertGloryRound.spec.ts` MP6, `./fishHookRound.spec.ts` MP71) -- the
 * order's tap and aim as `./hostageOrder.spec.ts` makes them, the walk's waypoints off the room's own route
 * (`./sceneRoundHarness` `route`: the hostages' planner on the map's AI grid), and the readers of a page's HUD marks
 * (`../src/hostageMarks` `hostageMarks`) and hostage list (`window.__viewer.net().hostages`). The page-driving ops
 * (`./sceneRoundRig` `orderFollow`, `walkTo`, `walkRoute`, `waitRescued`, `zoneOf`) build on these; the unit test is
 * `../test/e2eHostageRoundOps.test.ts`.
 */

import { FOLLOW_RULES_READING, FOLLOW_SLOTS_READING } from '../../match/src/hostageFollow';

export type V3 = [number, number, number];

/** The order commands on the wire (`hostageOrder.cmd`, research 239 s3): FOLLOW! and HOLD POSITION. */
export const ORDER_FOLLOW = 4;
export const ORDER_HOLD = 5;
/** The hostage AI's top states the specs read (research 239): 9 follows its leader, 0x11 rescued. */
export const HOSTAGE_FOLLOW_STATE = 9;
export const HOSTAGE_RESCUED_STATE = 0x11;

/** The action the order rides on the development keyboard (`./hostageOrder.spec.ts` `tapX`), held for two frames. */
export const ORDER_KEY = 'KeyX';
const ORDER_TAP_MS = 32;

export type KeyStep = { down: string } | { wait: number } | { up: string };
/** The order's tap: X down, 32 ms, X up -- a tap, as a player taps it (the room takes an order on the press). */
export function orderTap(): KeyStep[] {
  return [{ down: ORDER_KEY }, { wait: ORDER_TAP_MS }, { up: ORDER_KEY }];
}

/**
 * The aim's pitch steps, degrees: level, then down by 3 to -69 -- `./hostageOrder.spec.ts`'s sweep, each a turn under the
 * look's law (`./turnWithinLaw` `turnTo`), until the page offers the order on the hostage.
 */
export const ORDER_PITCH_SWEEP: readonly number[] = Array.from({ length: 24 }, (_, i) => (i ? -3 * i : 0));

/** The look's yaw from `from` toward `to`, degrees, in the walk's convention (`faceToward`: 0 faces -z, 90 faces -x). */
export function yawToward(from: readonly number[], to: readonly number[]): number {
  return (Math.atan2(-(to[0]! - from[0]!), -(to[2]! - from[2]!)) * 180) / Math.PI;
}

/** The horizontal distance between two points. */
export const flat = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!);

/**
 * How near its point a body that has passed it along the walk's leg must be to count as having reached it
 * (`reachedAlongLeg`): 12 u, twice `walkRoute`'s default window for an inner point. A test instrument's tolerance (product
 * track), not a game value.
 */
export const WALKTO_PASSED_REACH = 12;

/**
 * `walkTo`'s arrival: the feet within `within` of `to` (horizontal), or past the line through `to` square to the leg from
 * `from` (where the walk began) and within `reach` of `to`. The reads come every 40 ms plus a round trip -- on a busy host
 * far apart (desertGloryRound.spec.ts's best reads of 6.6-7.1 off a 14-u leg mean two or three reads on it) -- so a
 * window of 3 can be stepped over between two of them: its deck point on the east edge, (1690, 30, 1440), was passed,
 * the body dropped off the edge between reads (shadow's A4500, 9 of 9, 2026-11-10), and the point was left 30 above it.
 * Passing the point's square line near it is reaching it, at any read rate, whatever the leg's start; the reach bounds
 * how far past still counts (a body that slid or was moved well beyond is not "at" the point). A leg with no length (the
 * walk began on the point) is judged by the window alone.
 */
export function reachedAlongLeg(from: readonly number[], to: readonly number[], feet: readonly number[], within: number, reach = WALKTO_PASSED_REACH): boolean {
  const d = flat(feet, to);
  if (d <= within) return true;
  const lx = to[0]! - from[0]!, lz = to[2]! - from[2]!, len2 = lx * lx + lz * lz;
  if (len2 < 1e-6) return false;
  const fx = feet[0]! - from[0]!, fz = feet[2]! - from[2]!;
  return (fx * lx + fz * lz) / len2 >= 1 && d <= reach;
}

/**
 * The walk's waypoints off a route whose first point is where the walker stands: each point at least `step` u from the
 * last kept, the route's end always kept; a one-point route is that point.
 */
export function waypoints(route: readonly V3[], step: number): V3[] {
  if (route.length <= 1) return route.map((p) => [p[0], p[1], p[2]]);
  const out: V3[] = [];
  let last = route[0]!;
  for (let i = 1; i < route.length; i++) {
    const p = route[i]!;
    if (i === route.length - 1 || flat(p, last) >= step) { out.push([p[0], p[1], p[2]]); last = p; }
  }
  return out;
}

/**
 * Where the leader stands to order a hostage: the point `d` u (horizontal) along a route from its first point -- the
 * hostage's feet, the route toward the zone -- its height between the segment's ends; the route's end when it is
 * shorter. The point lies on the hostage's own route, so on its walkable cells and clear of its line; 15 u keeps the
 * third-person look on a kneeling body (`./hostageOrder.spec.ts`: under ~9 u it cannot reach one).
 */
export function standOn(route: readonly V3[], d: number): V3 {
  let left = d;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!, b = route[i]!, run = flat(a, b);
    if (run >= left && run > 0) {
      const t = left / run;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
    left -= run;
  }
  const end = route.at(-1)!;
  return [end[0], end[1], end[2]];
}

/**
 * A route's steepest rise over run between consecutive points (the run at least 1 u): a ladder's or a link's jump reads
 * high, a stair or a ramp under ~1. The specs refuse a route a walk could not take before they walk it.
 */
export function climbOf(route: readonly V3[]): number {
  let most = 0;
  for (let i = 1; i < route.length; i++) most = Math.max(most, Math.abs(route[i]![1] - route[i - 1]![1]) / Math.max(1, flat(route[i]!, route[i - 1]!)));
  return most;
}

/**
 * The HUD's compass marks of EXTRACTION counted apart (`../src/hostageMarks`): `ret_hostage.tif` -- one per living hostage
 * not rescued (HOSTAGE_MARK_READING, MARK_REMOVED_ON_RESCUE_READING) -- and `ret_extraction.tif`, one per kind-1 zone
 * (EXTRACTION_MARK_READING).
 */
export function markCounts(marks: readonly { bitmap: string }[] | undefined): { hostage: number; extraction: number } {
  const list = marks ?? [];
  return { hostage: list.filter((m) => m.bitmap === 'ret_hostage.tif').length, extraction: list.filter((m) => m.bitmap === 'ret_extraction.tif').length };
}

/** A page's rescue count off its hostage list: the living ones whose AI top state is 0x11. */
export function rescuedCount(hostages: readonly { ai: number; alive: boolean }[]): number {
  return hostages.filter((h) => h.alive && h.ai === HOSTAGE_RESCUED_STATE).length;
}

/**
 * The farthest a following hostage in formation `slot` rests from its leader by the room's own rules (match
 * `hostageFollow.ts`): its goal is the leader's trail point `depth` cells back, moved `lateral` cells aside
 * (`FOLLOW_SLOTS_READING`), each cell at most a diagonal (`FOLLOW_RULES_READING.cell` x sqrt 2), the leader anywhere in his
 * own cell (half a diagonal), and it stops within its arrival radius (`arrival` x `radius`, 18.75) -- then idles (its
 * sub-state 7) until the leader is more than `idleMove` cell off where he stood (`hostageFollow.ts` around :482), so a
 * leader may step one cell on and stop with the follower still put (one cell more). The bound assumes the leader on
 * traversable cells, where the room lays his trail (`extraction.ts`); off them the trail's points can lie farther apart.
 */
export function followRestReach(slot: number): number {
  const [depth, lateral] = FOLLOW_SLOTS_READING[slot % FOLLOW_SLOTS_READING.length]!;
  const c = FOLLOW_RULES_READING.cell, diagonal = c * Math.SQRT2;
  return (Math.abs(depth) + Math.abs(lateral)) * diagonal + diagonal / 2 + FOLLOW_RULES_READING.arrival * FOLLOW_RULES_READING.radius
    + FOLLOW_RULES_READING.idleMove * c;
}

/**
 * How near the follower is held at each waypoint of a led walk (the specs' `follow`): slot 0's rest reach, 92.39 -- every
 * follower is stepped in slot 0 (match `extraction.ts`). It was 60, under the follower's own rest: Desert Glory's Hostage
 * rested 60.1 u from a still SEAL for 25 s, following (shadow's A4500, 2026-11-10). A test instrument's bound (product
 * track), derived from the room's readings, not a game value of its own.
 */
export const FOLLOW_NEAR = followRestReach(0);
/**
 * DF-13 box 2: how long the "not yet started" allowance lasts, in the leader's trail cells since the order: the
 * follower's start, `FOLLOW_RULES_READING.trailStart` 8 cells (match `hostageFollow.ts`, `FUN_005fb1c0`), and a margin of
 * 2 for the spec's sampling (`leaderTrail` reads the feet at waypoints, so a cell crossed between two reads can be missed,
 * and the room's trail is laid on its own tick) -- an instrument's margin, not the game's.
 */
export const FOLLOW_START_ALLOWANCE = 8 + 2;

/** The leader's trail since the order as the spec samples it: the 10 u cells (`FOLLOW_RULES_READING.cell`) his feet are read in. */
export function leaderTrail(): { add(feet: readonly number[]): number; cells(): number } {
  const seen = new Set<string>();
  return {
    add(feet) { seen.add(`${Math.floor(feet[0]! / 10)},${Math.floor(feet[2]! / 10)}`); return seen.size; },
    cells() { return seen.size; },
  };
}

/**
 * DF-13 box 2: the follower kept at a waypoint of a led walk -- rescued; or following (state 9) and within `FOLLOW_NEAR`
 * of the SEAL; or following, not yet off the spot it was ordered at (`from`, within a unit), and the leader's trail
 * since the order (`trailCells`, `leaderTrail`) under `FOLLOW_START_ALLOWANCE`. A led hostage starts only once that trail
 * holds 8 AI cells, so at the walk's first waypoints it stands still: Fish Hook's Hostage2 stood 60.6 u off a SEAL
 * waiting at waypoint 0 and never started (the box run of 2026-11-09). Past the allowance it must have moved, and then
 * `FOLLOW_NEAR` holds -- a hostage that never follows fails at the first waypoint after it.
 */
export function followerKept(x: { at: readonly number[]; ai: number; rescued: boolean }, seal: readonly number[], from: readonly number[], trailCells: number): boolean {
  if (x.rescued) return true;
  if (x.ai !== HOSTAGE_FOLLOW_STATE) return false;
  return flat(x.at, seal) < FOLLOW_NEAR || (flat(x.at, from) <= 1 && trailCells < FOLLOW_START_ALLOWANCE);
}

/**
 * The walk's stall clock (`./sceneRoundRig` `walkTo`; a test instrument, nothing the game does changes): the walk is
 * stalled when its feet have not gained more than 1 u on the point for `stallMs`. A standing turn (`turnTo`) is no
 * walking: the walk calls `restart` once the turn is done and `walking` when W is next held, and each restarts the clock,
 * the gain then measured from the last read (the feet stand through a turn). The box run of 2026-11-09 (20261109T0252Z, Desert Glory's
 * round) had one `turnTo` take 4.2 s on a stalled host and the old clock, set at the first read only, fire after 1.4 s
 * of W. It counts how long W was held, overall and since the last restart, for the stall's message.
 */
export function walkStallClock(stallMs: number, now: number): {
  progress(d: number, now: number): void; restart(now: number): void; walking(now: number): void; standing(now: number): void;
  stalled(now: number): boolean; best(): number; heldMs(now: number): number; heldSinceRestartMs(now: number): number;
} {
  let base = Infinity, last = Infinity, overall = Infinity, at = now, held = 0, downAt: number | null = null, sinceRestart = 0, restartAt = now;
  const restart = (t: number): void => { at = t; restartAt = t; sinceRestart = 0; base = last; };
  return {
    progress(d, t) {
      overall = Math.min(overall, d);
      last = d;
      if (d < base - 1) { base = d; at = t; }
    },
    restart,
    walking(t) {
      if (downAt !== null) return;
      restart(t);
      downAt = t;
    },
    standing(t) {
      if (downAt === null) return;
      held += t - downAt;
      sinceRestart += t - Math.max(downAt, restartAt);
      downAt = null;
    },
    stalled: (t) => t - at > stallMs,
    best: () => overall,
    heldMs: (t) => held + (downAt === null ? 0 : t - downAt),
    heldSinceRestartMs: (t) => sinceRestart + (downAt === null ? 0 : t - Math.max(downAt, restartAt)),
  };
}
