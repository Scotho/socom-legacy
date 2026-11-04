/**
 * BOP-1 (2026-10-28-bot-performance.md): the bot profiler -- a PRODUCT-TRACK INSTRUMENT with no original. It measures
 * where `MatchBots.step()` and the room spend the match process's time and counts the BOP.R8 floors (engagements,
 * view-to-first-shot, kills, by the target's kind), and writes one JSON line a minute (`msg: 'botProfile'`) through the
 * match's log. It never changes what a bot or the room does: every hook only reads values the caller already has.
 *
 * Off unless `S2U_BOT_PROFILE=1` at process start. Off, `botProfiler()` returns null and every hook is behind that one
 * null check at its call site: no profiler object, no timer, no allocation per tick.
 */
/**
 * The process samplers (event-loop delay, GC, CPU, memory) need Node; they live in `botProfileNode.ts`, which
 * `server.ts` attaches, so this module -- in the page's import graph through `room.ts` -- imports no `node:` module.
 */
export interface ProfileSamplers {
  read(): Record<string, unknown>;
  reset(): void;
  stop(): void;
}
/** A monotonic ns clock without importing Node (`process.hrtime` where present, else `performance.now`). */
const hrClock = (): bigint => {
  const pr = (globalThis as unknown as { process?: { hrtime?: { bigint?: () => bigint } } }).process;
  return pr?.hrtime?.bigint ? pr.hrtime.bigint() : BigInt(Math.round(performance.now() * 1e6));
};

/** The timed phases (hrtime, per minute: sum, count, max, histogram). `step` is `MatchBots.step()` whole; `room` is `Room.step()` whole. */
export const BOT_PROFILE_PHASES = ['step', 'loaded', 'hearing', 'perception', 'tactics', 'planner', 'route', 'smooth',
  'space', 'steer', 'command', 'doors', 'room', 'navJobs'] as const;
export type BotProfilePhase = typeof BOT_PROFILE_PHASES[number];
/** Who asked `WalkingNavigation.canWalk` (counted only; the glide itself is untouched). */
export const CAN_WALK_CALLERS = ['steer', 'smooth', 'space', 'route', 'other'] as const;
export type CanWalkCaller = typeof CAN_WALK_CALLERS[number];
/** The histogram's upper edges in microseconds; the last bucket is everything above the last edge. */
export const BOT_PROFILE_BUCKETS_US = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 100000] as const;
/** The match's tick rate for view-to-first-shot in ms (`protocol.ts TICK_HZ`, 60). */
const TICK_MS = 1000 / 60;
const STUCK_TICKS = 5 * 60;   // the brief's 5 s at 60 Hz
const MINUTE_NS = 60_000_000_000n;

type Kind = 'bot' | 'human';
interface Life { seen: Map<number, number>; engaged: Set<number> }
interface Stuck { x: number; z: number; since: number; flagged: boolean }

export class BotProfiler {
  private readonly phaseIndex = new Map<BotProfilePhase, number>(BOT_PROFILE_PHASES.map((p, i) => [p, i]));
  readonly sum = new Float64Array(BOT_PROFILE_PHASES.length);    // ns
  readonly count = new Float64Array(BOT_PROFILE_PHASES.length);
  readonly max = new Float64Array(BOT_PROFILE_PHASES.length);    // ns
  readonly hist = BOT_PROFILE_PHASES.map(() => new Uint32Array(BOT_PROFILE_BUCKETS_US.length + 1));
  canWalk: Record<CanWalkCaller, number> = { steer: 0, smooth: 0, space: 0, route: 0, other: 0 };
  /** The caller `canWalk` is counted under while a phase runs (set by the phase hooks). */
  caller: CanWalkCaller = 'other';
  routeCalls = 0; routeExpanded = 0;
  cpu = { snapshots: 0, snapshotBytes: 0, health: 0, healthBytes: 0, broadcasts: 0, broadcastBytes: 0 };
  refused = new Map<number, { bot: boolean; n: number }>();
  stuck = 0;
  r8 = { engagements: { bot: 0, human: 0 }, kills: { bot: 0, human: 0 },
    viewToShot: { bot: { sum: 0, n: 0, max: 0 }, human: { sum: 0, n: 0, max: 0 } } };
  private lives = new Map<number, Life>();
  private stuckState = new Map<number, Stuck>();
  private minuteStart: bigint;
  /** The process samplers, attached by the server (absent, the minute line carries none of their fields). */
  samplers: ProfileSamplers | null = null;
  /** Where the minute line goes (the server sets its log; absent, nothing is written). */
  sink: ((entry: Record<string, unknown>) => void) | null = null;

  // The second argument keeps the tests' call shape; the process samplers are attached by the server (`samplers`).
  constructor(private readonly clock: () => bigint = hrClock, _process = false) {
    this.minuteStart = this.clock();
  }

  now(): bigint { return this.clock(); }

  /** Closes a phase begun at `t0` (from `now()`). */
  end(phase: BotProfilePhase, t0: bigint): void {
    const i = this.phaseIndex.get(phase)!, ns = Number(this.clock() - t0);
    this.sum[i] = this.sum[i]! + ns; this.count[i] = this.count[i]! + 1; if (ns > this.max[i]!) this.max[i] = ns;
    const us = ns / 1000, h = this.hist[i]!;
    let b = 0; while (b < BOT_PROFILE_BUCKETS_US.length && us > BOT_PROFILE_BUCKETS_US[b]!) b++;
    h[b] = h[b]! + 1;
  }

  countCanWalk(): void { this.canWalk[this.caller]++; }

  cpuSnapshot(bytes: number): void { this.cpu.snapshots++; this.cpu.snapshotBytes += bytes; }
  cpuHealth(bytes: number): void { this.cpu.health++; this.cpu.healthBytes += bytes; }
  cpuBroadcast(bytes: number): void { this.cpu.broadcasts++; this.cpu.broadcastBytes += bytes; }

  refusal(seat: number, bot: boolean): void {
    const r = this.refused.get(seat);
    if (r) { r.n++; r.bot = bot; } else this.refused.set(seat, { bot, n: 1 });
  }

  /** A bot's new life: its engagements and first sightings start over. */
  life(bot: number): void { this.lives.set(bot, { seen: new Map(), engaged: new Set() }); this.stuckState.delete(bot); }

  /** After a perception tick: the bot sees `target` (first time this life records the tick). */
  saw(bot: number, target: number, tick: number): void {
    let l = this.lives.get(bot);
    if (!l) { l = { seen: new Map(), engaged: new Set() }; this.lives.set(bot, l); }
    if (!l.seen.has(target)) l.seen.set(target, tick);
  }

  /** The bot fires at `target`: the first time this life is an engagement, and its view-to-first-shot is taken. */
  fired(bot: number, target: number, tick: number, kind: Kind): void {
    let l = this.lives.get(bot);
    if (!l) { l = { seen: new Map(), engaged: new Set() }; this.lives.set(bot, l); }
    if (l.engaged.has(target)) return;
    l.engaged.add(target);
    this.r8.engagements[kind]++;
    const seen = l.seen.get(target);
    if (seen !== undefined) {
      const ms = (tick - seen) * TICK_MS, v = this.r8.viewToShot[kind];
      v.sum += ms; v.n++; if (ms > v.max) v.max = ms;
    }
  }

  kill(kind: Kind): void { this.r8.kills[kind]++; }

  /** Each tick per live bot: one with a route that has not moved a body width in 5 s counts once as stuck. */
  stuckSample(bot: number, x: number, z: number, hasRoute: boolean, tick: number, bodyWidth: number): void {
    const s = this.stuckState.get(bot);
    if (!s || !hasRoute || Math.hypot(x - s.x, z - s.z) > bodyWidth) {
      if (s) { s.x = x; s.z = z; s.since = tick; s.flagged = false; } else this.stuckState.set(bot, { x, z, since: tick, flagged: false });
      return;
    }
    if (!s.flagged && tick - s.since >= STUCK_TICKS) { s.flagged = true; this.stuck++; }
  }

  /** Writes the minute's line when a minute has passed (called from `Room.step`). */
  maybeFlush(): void {
    if (this.clock() - this.minuteStart >= MINUTE_NS) this.flush();
  }

  /** The minute's line; every accumulator restarts. */
  flush(): Record<string, unknown> {
    const now = this.clock();
    const phases: Record<string, unknown> = {};
    BOT_PROFILE_PHASES.forEach((p, i) => {
      phases[p] = { ms: this.sum[i]! / 1e6, count: this.count[i], maxMs: this.max[i]! / 1e6, hist: [...this.hist[i]!] };
    });
    const room = this.sum[this.phaseIndex.get('room')!]!, bots = this.sum[this.phaseIndex.get('step')!]!;
    const refused: Record<string, number> = {};
    let refusedBot = 0, refusedHuman = 0;
    for (const [seat, r] of this.refused) { refused[seat] = r.n; if (r.bot) refusedBot += r.n; else refusedHuman += r.n; }
    const entry: Record<string, unknown> = { level: 'info', msg: 'botProfile', windowMs: Number(now - this.minuteStart) / 1e6,
      phases, simMs: Math.max(0, room - bots) / 1e6, histUs: BOT_PROFILE_BUCKETS_US,
      canWalk: { ...this.canWalk }, route: { calls: this.routeCalls, expanded: this.routeExpanded }, cpuConn: { ...this.cpu },
      ...(this.samplers?.read() ?? { loopDelayMs: null }),
      refused, refusedBot, refusedHuman, stuck: this.stuck, r8: JSON.parse(JSON.stringify(this.r8)) };
    this.sink?.(entry);
    this.minuteStart = now; this.samplers?.reset();
    this.sum.fill(0); this.count.fill(0); this.max.fill(0); for (const h of this.hist) h.fill(0);
    this.canWalk = { steer: 0, smooth: 0, space: 0, route: 0, other: 0 };
    this.routeCalls = 0; this.routeExpanded = 0;
    this.cpu = { snapshots: 0, snapshotBytes: 0, health: 0, healthBytes: 0, broadcasts: 0, broadcastBytes: 0 };
    this.refused.clear(); this.stuck = 0;
    this.r8 = { engagements: { bot: 0, human: 0 }, kills: { bot: 0, human: 0 },
      viewToShot: { bot: { sum: 0, n: 0, max: 0 }, human: { sum: 0, n: 0, max: 0 } } };
    return entry;
  }

  stop(): void { this.samplers?.stop(); }
}

/** The flag's one reading: a profiler when `S2U_BOT_PROFILE` is `1`, else null (no object at all). */
export function createBotProfiler(env: Record<string, string | undefined>): BotProfiler | null {
  return env.S2U_BOT_PROFILE === '1' ? new BotProfiler() : null;
}

const proc = (globalThis as unknown as { process?: Record<string, Record<string, string | undefined> | undefined> }).process;
// read once, at load (no `process` in the page: off). A ternary, not optional chaining: the page bundles this module,
// and the chained form minified reads to the artifact leak check as a dotenv file's name (botProfileBundle.test.ts).
let active: BotProfiler | null = createBotProfiler((proc ? proc['env'] : undefined) ?? {});

/** The process's profiler, or null when `S2U_BOT_PROFILE` is not `1` (every hook's one check). */
export function botProfiler(): BotProfiler | null { return active; }

/** Tests only: install (or remove, with null) the process's profiler. */
export function setBotProfiler(p: BotProfiler | null): void { active?.stop(); active = p; }

/** Tests only: the singleton as a process started with `env` would have it (independent of the run's real env). */
export function resetBotProfilerForTest(env: Record<string, string | undefined>): void { setBotProfiler(createBotProfiler(env)); }

/**
 * BOP-1: counting wrappers on ONE navigation instance (installed only when the profiler is on at construction):
 * `canWalk` and `canWalkSteps` counted by the current caller, routes counted once, A*'s node expansions counted.
 * Resumable routes time only active next/return/throw calls: the phase count/histogram describes resumptions, not
 * whole jobs including their waits. Synchronous drains remain one timed call, without counting their generators
 * again. Each wrapper preserves the original's yields, result, errors and cancellation cleanup.
 */
export function instrumentNavigation(nav: object): void {
  const n = nav as Record<string, unknown>;
  const canWalk = n.canWalk as (...a: unknown[]) => unknown;
  const route = n.route as (...a: unknown[]) => unknown;
  const neighbours = n.neighbours as ((...a: unknown[]) => unknown) | undefined;
  let routing = 0, walking = 0;
  const measureWalk = <T>(call: () => T, first: boolean): T => {
    const prof = active;
    if (!prof) return call();
    if (first && walking === 0) prof.countCanWalk();
    walking++;
    try { return call(); } finally { walking--; }
  };
  const measureRoute = <T>(call: () => T, first: boolean): T => {
    const prof = active;
    if (!prof) return call();
    const outer = routing === 0, caller = prof.caller, t = outer ? prof.now() : 0n;
    if (first && outer) prof.routeCalls++;
    prof.caller = 'route'; routing++;
    try { return call(); } finally {
      routing--; prof.caller = caller;
      if (outer) prof.end('route', t);
    }
  };
  type Steps = Generator<unknown, unknown, unknown>;
  type Result = IteratorResult<unknown, unknown>;
  const instrumentSteps = (steps: Steps, measure: (call: () => Result, first: boolean) => Result): Steps => {
    const next = steps.next, close = steps.return, fail = steps.throw;
    let started = false, finished = false;
    const resume = (call: () => Result, starts: boolean): Result => {
      const invoke = (): Result => {
        try { const result = call(); finished = !!result.done; return result; }
        catch (error) { finished = true; throw error; }
      };
      // Closing a generator before its first next runs no body. Calls after completion run no work either.
      if (finished || (!started && !starts)) return invoke();
      const first = !started; started = true;
      return measure(invoke, first);
    };
    // Keep the native iterator object/prototype (including its iterator/disposal protocol).
    steps.next = function (this: Steps, ...args) { return resume(() => next.apply(this, args), true); };
    steps.return = function (this: Steps, value) { return resume(() => close.call(this, value), false); };
    steps.throw = function (this: Steps, error) { return resume(() => fail.call(this, error), false); };
    return steps;
  };
  n.canWalk = function (this: unknown, ...a: unknown[]) { return measureWalk(() => canWalk.apply(this, a), true); };
  n.route = function (this: unknown, ...a: unknown[]) { return measureRoute(() => route.apply(this, a), true); };
  const canWalkSteps = n.canWalkSteps as ((...a: unknown[]) => Steps) | undefined;
  if (canWalkSteps) n.canWalkSteps = function (this: unknown, ...a: unknown[]) {
    return instrumentSteps(canWalkSteps.apply(this, a), measureWalk);
  };
  const routeSteps = n.routeSteps as ((...a: unknown[]) => Steps) | undefined;
  if (routeSteps) n.routeSteps = function (this: unknown, ...a: unknown[]) {
    return instrumentSteps(routeSteps.apply(this, a), measureRoute);
  };
  if (neighbours) n.neighbours = function (this: unknown, ...a: unknown[]) {
    if (routing && active) active.routeExpanded++;
    return neighbours.apply(this, a);
  };
}
