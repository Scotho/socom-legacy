/**
 * BOP-S (`docs/plans/2026-10-28-bot-performance.md`): time-sliced bot navigation. Authored multiplayer bot extension
 * (OT.R81): the original had no bots, so nothing here has an original value; every number is the port's own.
 *
 * A bot's deferrable navigation (a route, a patrol, a cover choice, a search's angles, a recovery) runs as a job: the
 * query's resumable steps (`NavSteps`) under a work budget counted in `WalkingNavigation.work` (per mover glide of a
 * walk test its ground length in samples, at least 1; one per 16 A* expansions), never a clock, so a run stays
 * seed-deterministic. `submit` runs a job first at its call site within its bot's budget for the tick; what is left
 * continues in `tick`, before any bot's turn, and the job's `done` receives the answer then. With an infinite budget
 * every job ends at its call site and nothing here changes what a bot does.
 *
 * - One job per bot and slot, reused while its `key` stands; another key replaces it.
 * - Each bot's budget per tick is `perBot` units, doubled for each tick its oldest pending job has waited (at most
 *   `doublings` times: the starvation guard), less its share of the last tick's reactive work (the walk tests bots make
 *   at once, outside jobs: charged first), never under `minimumShare` of `perBot`.
 * - The fair queue (`tick`): pending jobs resume oldest first (`startTick`); jobs of the same age in a round-robin over
 *   their bots (sorted ids, the start turned by the tick), then by slot. Deterministic.
 * - A job older than `ageCap` ticks ends as its failure (`fail`, else `[]`): counted as starved.
 * - A door change (`WalkingNavigation.revision`) makes a job's steps stale (they may hold a graph edge list the change
 *   replaced): on resume it is asked again from where its bot stands (`remake`), or dropped when it cannot be.
 * - A job that ends after its bot has walked more than `restartDistance` from where it asked restarts once.
 */
import type { NavSteps, Point } from './navigation';

/**
 * OT.R81 (BOP-S task (a)): the port's invention -- the budget in glide samples, measured locally on MP2 (15 bots, no
 * human, seeds 41 and 7, 18,000 ticks each): one bot's navigation-job time in one tick (the scheduler's resumptions and
 * call-site runs, wall clock), p99 / max over the bot-ticks that ran job work -- 8: 6.8 / 25.0 and 6.8 / 17.3 ms, jobs
 * starved (3 and 6, the oldest at the 120-tick cap); 12: 9.8 / 23.7 and 10.4 / 21.2 ms, none starved (oldest 95 and
 * 105 ticks); 16: 13.1 / 21.0 and 13.4 / 24.2 ms, none starved (oldest 70 and 105). The aim, ~8 ms for one bot on the
 * reference box (S1), read as ~16 ms here (this shared host runs ~2x slower): 16 is the largest value whose p99 stays
 * under it (~6.5 ms on S1). A finding, open: no budget brings one bot's per-tick job-nav MAX under ~8 ms (local
 * maxima 17-25 ms at 8, 12 and 16; read as this host's noise -- 8's came from ticks of 2-7 units -- to be checked on S1
 * at the milestone cells). The slower jobs at 12 broke three behaviour pins (the crowd's passing bay at both orders,
 * LF3's ladder leg) and at 8 one (the moving teammates' traffic stops); 16 holds them all. A single-host value: S1
 * confirms or re-sets it. (S5's 8 was in glides, before a glide counted its length.)
 */
export const BOT_ROUTE_WORK_MEASURED_ADAPTATION = 16;
/**
 * OT.R81 (BOP-S): the port's invention, no original value -- a performance adaptation, not a game behaviour. The work
 * units one bot's deferrable navigation may spend per tick: per mover glide of a walk test its ground length in the
 * walk test's 2.5-unit samples, at least 1 (task (a), `glideSamples`), and one per 16 A* expansions, both counted by
 * `WalkingNavigation.work`. The measured budget (since the cover deadlock's fix: a bot a hair off its hide point on
 * the exposed side no longer stands there for good; re-measured in samples by task (a)); MatchBots'
 * `navWork: Infinity` makes the scheduler inert -- every job ends where it is asked, so nothing is deferred. That is
 * not the base's play: the bots' own play changes (the cover deadlock, the ladders, the stall detector) apply at any
 * budget.
 */
export const BOT_ROUTE_WORK_PER_TICK_ADAPTATION = BOT_ROUTE_WORK_MEASURED_ADAPTATION;
/** OT.R81 (BOP-S): the port's invention -- the scheduler's guards (ticks; shares of the budget; world units). */
export const BOT_NAV_JOB_ADAPTATION = { doublings: 2, ageCap: 120, minimumShare: 0.25, restartDistance: 6 };

/**
 * OT.R81 (BOP-S S4): the port's invention, no original value -- a bot behaviour, so a play change, behind its own
 * switch. At a door change a bot's route is dropped at once only when it passes through a door's sweep box; any other
 * route is kept until the bot's own replan slot (`doorReplanDue`), at most 14 ticks. The mover still blocks a shut
 * door, so a stale route is safe meanwhile. Off: every route is dropped at the change, as before BOP-S.
 */
export const BOT_DOOR_STAGGER_ADAPTATION = false;
/** The door stagger's slot: this bot drops a door-stale route on this tick (`every`: matchBots' replan stagger, 15). */
export function doorReplanDue(tick: number, bot: number, every = 15): boolean { return tick % every === bot % every; }

/** What `movingHullStamp` reads of the room: its lever gates, its cranes, the world's revision. */
export interface HullParts {
  gates: { readonly count: number; readonly specs: readonly { readonly levers: readonly { readonly action: number }[] }[];
    offset(i: number): readonly number[]; busy(action: number): boolean };
  cranes: { readonly count: number; state(i: number): { paused: boolean; offset: readonly number[] } };
  gridRevision: number;
}

/**
 * BOP-S (the review's F1): the non-door collision that moves, as one stamp -- null while a lever gate's program runs
 * or a crane is not paused (its hull moves every tick), otherwise the gates' and paused cranes' offsets and the world's
 * revision. A different stamp, or null, means the hull may have moved since the last tick (doors are the doors' state).
 */
export function movingHullStamp(p: HullParts): string | null {
  const parts: string[] = [String(p.gridRevision)];
  for (let i = 0; i < p.gates.count; i++) {
    if (p.gates.specs[i]?.levers.some((l) => p.gates.busy(l.action))) return null;
    parts.push(p.gates.offset(i).join(','));
  }
  for (let i = 0; i < p.cranes.count; i++) {
    const c = p.cranes.state(i);
    if (!c.paused) return null;
    parts.push(c.offset.join(','));
  }
  return parts.join('|');
}

/** A footprint on the ground: a door's sweep (`DoorSpec.sweep`). */
export interface SweepBox { minX: number; maxX: number; minZ: number; maxZ: number }

/** Whether the walk from `feet` along `route` passes through any sweep box (ground plane, X and Z). */
export function routeCrossesDoor(feet: Point, route: readonly Point[], sweeps: readonly SweepBox[]): boolean {
  let from = feet;
  for (const to of route) {
    for (const s of sweeps) if (segmentMeetsBox(from, to, s)) return true;
    from = to;
  }
  return false;
}

/** Liang-Barsky clip of the segment's XZ projection against the box. */
function segmentMeetsBox(a: Point, b: Point, s: SweepBox): boolean {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dz = b[2] - a[2];
  for (const [p, q] of [[-dx, a[0] - s.minX], [dx, s.maxX - a[0]], [-dz, a[2] - s.minZ], [dz, s.maxZ - a[2]]] as const) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}

export type Slot = 'route' | 'cover' | 'search';
const SLOTS: readonly Slot[] = ['route', 'cover', 'search'];

export interface NavJob<T> {
  bot: number; slot: Slot; key: string; revision: number; startTick: number; steps: NavSteps<T>;
  /** Receives the answer: at the call site when the job ends there, else in a later `tick`. */
  done(result: T): void;
  /** Where the bot asked from, and how to ask again from elsewhere (a door change, a moved body). Optional. */
  from?: Point; remake?: (from: Point) => NavSteps<T>;
  /** The answer at the age cap (default `[]`). */
  fail?: T;
}

/** What the scheduler reads of the navigation: its work counter and its door revision. */
export interface NavWork { readonly work: number; readonly revision: number }

export interface NavJobStats {
  maxAge: number; p99Age: number; starved: number;
  /** The same over the jobs that waited at least one tick. */
  deferred: number; p99DeferredAge: number;
  jobs: number; redone: number; dropped: number; moved: number;
  /** Answers handed over computed under an older door revision: must stay 0. */
  stale: number;
  /**
   * The job instrument (product track: counters only, nothing a bot does depends on them). `completed`: jobs ended
   * by their answer (`starved`: by the age cap). `lateApplied`: answers a caller applied after the tick it asked
   * (`noteApplied`); `staleApplied`: those whose target was no longer the bot's current one when they landed.
   */
  completed: number; lateApplied: number; staleApplied: number;
}

/** `next`: the glide (its samples) the job stopped short of, paid first when it resumes (task (a)); 0 for none. */
interface Entry { job: NavJob<unknown>; restarted: boolean; next: number }

const count = (histogram: number[], at: number): void => {
  while (histogram.length <= at) histogram.push(0);
  histogram[at]!++;
};
const percentile = (histogram: readonly number[], p: number, from = 0): number => {
  let total = 0;
  for (let i = from; i < histogram.length; i++) total += histogram[i]!;
  let seen = 0;
  for (let i = from; i < histogram.length; i++) { seen += histogram[i]!; if (total && seen >= total * p) return i; }
  return 0;
};

export class NavScheduler {
  private readonly jobs = new Map<number, Map<Slot, Entry>>();
  private now = -1;
  private tickStart = 0;
  private jobWork = 0;
  private reactiveShare = 0;
  private readonly allow = new Map<number, number>();
  private readonly spent = new Map<number, number>();
  private readonly ages: number[] = [];
  private starved = 0; private redone = 0; private dropped = 0; private moved = 0; private stale = 0;
  private completed = 0; private lateApplied = 0; private staleApplied = 0;

  constructor(private readonly nav: NavWork, private readonly perBot = BOT_ROUTE_WORK_PER_TICK_ADAPTATION,
    private readonly guard = BOT_NAV_JOB_ADAPTATION, private readonly feetOf: (bot: number) => Point | null = () => null) {}

  /**
   * Run the job at its call site within its bot's remaining budget. 'done': its `done` has had the answer; 'pending':
   * it continues in later ticks (the caller keeps its old route, or stands).
   */
  submit<T>(job: NavJob<T>): 'done' | 'pending' {
    const slots = this.jobs.get(job.bot) ?? new Map<Slot, Entry>();
    this.jobs.set(job.bot, slots);
    const held = slots.get(job.slot);
    if (held && held.job.key === job.key) return 'pending';
    const entry: Entry = { job: job as NavJob<unknown>, restarted: false, next: 0 };
    slots.set(job.slot, entry);
    return this.advance(entry, job.from ?? null) ? 'done' : 'pending';
  }

  /** Once per tick, before any bot's turn: the budgets, then the pending jobs in the fair queue's order. */
  tick(tick: number): void {
    const reactive = Math.max(0, this.nav.work - this.tickStart - this.jobWork);
    this.now = tick; this.tickStart = this.nav.work; this.jobWork = 0;
    this.spent.clear(); this.allow.clear();
    const bots = [...this.jobs.keys()].sort((a, b) => a - b);
    this.reactiveShare = bots.length ? reactive / bots.length : 0;
    const pending: Entry[] = [];
    for (const slots of this.jobs.values()) for (const entry of slots.values()) pending.push(entry);
    if (!pending.length) return;
    const rank = new Map(bots.map((id, i) => [id, ((i - tick) % bots.length + bots.length) % bots.length]));
    pending.sort((a, b) => a.job.startTick - b.job.startTick || rank.get(a.job.bot)! - rank.get(b.job.bot)!
      || SLOTS.indexOf(a.job.slot) - SLOTS.indexOf(b.job.slot));
    for (const entry of pending) if (!this.allow.has(entry.job.bot))   // the oldest of each bot's comes first
      this.allow.set(entry.job.bot, this.budget(Math.min(tick - entry.job.startTick, this.guard.doublings)));
    for (const entry of pending) {
      const job = entry.job;
      if (this.jobs.get(job.bot)?.get(job.slot) !== entry) continue;
      if (tick - job.startTick >= this.guard.ageCap) {
        this.starved++;
        this.end(entry, 'fail' in job ? job.fail : []);
        continue;
      }
      if (job.revision !== this.nav.revision) {
        const feet = this.feetOf(job.bot) ?? job.from;
        if (!job.remake || !feet) { this.dropped++; this.cancel(job.bot, job.slot); continue; }
        this.redone++;
        this.restart(entry, feet);
      }
      this.advance(entry, this.feetOf(job.bot));
    }
  }

  /** Drop a bot's job in `slot`, or all its jobs: their `done` is never called. */
  cancel(bot: number, slot?: Slot): void {
    if (slot === undefined) { this.jobs.delete(bot); return; }
    this.jobs.get(bot)?.delete(slot);
  }

  pending(bot: number, slot: Slot): boolean { return !!this.jobs.get(bot)?.has(slot); }

  pendingCount(): number {
    let n = 0;
    for (const slots of this.jobs.values()) n += slots.size;
    return n;
  }

  stats(): NavJobStats {
    let jobs = 0, deferred = 0, maxAge = 0;
    this.ages.forEach((n, age) => { jobs += n; if (age) deferred += n; if (n) maxAge = age; });
    return { maxAge, p99Age: percentile(this.ages, 0.99), starved: this.starved, deferred,
      p99DeferredAge: percentile(this.ages, 0.99, 1), jobs, redone: this.redone, dropped: this.dropped, moved: this.moved, stale: this.stale,
      completed: this.completed, lateApplied: this.lateApplied, staleApplied: this.staleApplied };
  }

  /** The instrument: a caller applied a late answer; `stale` when its target was no longer current. Counting only. */
  noteApplied(stale: boolean): void { this.lateApplied++; if (stale) this.staleApplied++; }

  private budget(doublings: number): number {
    if (this.perBot === Infinity) return Infinity;
    return Math.max(this.perBot * this.guard.minimumShare, this.perBot * 2 ** doublings - this.reactiveShare);
  }

  /** Steps the job within its bot's remaining budget; true when it ended (its `done` called). */
  private advance(entry: Entry, feet: Point | null): boolean {
    const job = entry.job, allowance = this.allow.get(job.bot) ?? this.budget(0);
    const before = this.nav.work, spent = this.spent.get(job.bot) ?? 0;
    const charge = (): void => {
      const used = this.nav.work - before;
      this.spent.set(job.bot, spent + used); this.jobWork += used;
    };
    if (spent >= allowance || (entry.next > 0 && spent > 0 && spent + entry.next > allowance)) return false;
    for (;;) {
      const r = job.steps.next();
      if (r.done) {
        if (feet && job.from && job.remake && !entry.restarted && job.startTick !== this.now
          && Math.hypot(feet[0] - job.from[0], feet[2] - job.from[2]) > this.guard.restartDistance) {
          this.moved++;
          entry.restarted = true;
          this.restart(entry, feet);
          continue;
        }
        charge();
        this.completed++;
        if (job.revision !== this.nav.revision) this.stale++;
        this.end(entry, r.value);
        return true;
      }
      // Task (a): a step before a glide yields that glide's work; the job stops short of a glide it cannot pay, unless
      // its bot has spent nothing yet this tick (a glide longer than the whole allowance still runs, alone).
      const used = spent + this.nav.work - before, next = typeof r.value === 'number' ? r.value : 0;
      entry.next = next;                                          // its first step on resuming is that glide
      if (used >= allowance || (next > 0 && used > 0 && used + next > allowance)) { charge(); return false; }
    }
  }

  private restart(entry: Entry, from: Point): void {
    const job = entry.job;
    job.from = [...from]; job.revision = this.nav.revision; job.steps = job.remake!(job.from); entry.next = 0;
  }

  private end(entry: Entry, value: unknown): void {
    const job = entry.job;
    if (this.jobs.get(job.bot)?.get(job.slot) === entry) this.jobs.get(job.bot)!.delete(job.slot);
    count(this.ages, Math.max(0, this.now - job.startTick));
    job.done(value);
  }
}
