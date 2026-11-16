import { describe, expect, it } from 'vitest';
import {
  COMMAND_CLOCK_BASE_ADAPTATION, COMMAND_CLOCK_GAP_TICKS_ADAPTATION, COMMAND_CLOCK_HISTORY_TICKS_ADAPTATION,
  COMMAND_CLOCK_BURST_SLACK_ADAPTATION, COMMAND_CLOCK_IDLE_TICKS_ADAPTATION, COMMAND_CLOCK_STALL_TICKS_ADAPTATION, CommandClock,
} from '../src/net/commandClock';
import { PlayoutClock } from '../src/net/playoutClock';
import { INTERP_DELAY_MS, TICK_HZ } from '../src/net/protocol';
import { wrapYaw } from '../src/yaw';

/**
 * PV-4a (product track, a browser adaptation with no original; LATER 735, research 402 s3-s4): the subject's command
 * clock. A small deterministic room: the owner's page sends one command a 60 Hz tick, command k putting the body at
 * x = k (a unit a command) turning 3 degrees a command; the room runs 0, 1 or 2 queued commands a tick (15 % / 70 % /
 * 15 %, its credit: never more than are queued, two whenever more than three wait, so none is lost and the mean is one
 * a tick); a snapshot every second tick carries (tick, seq & 15, the body after the commands run), heard at
 * tick x 16.667 ms + 40 ms, or with 0-8 ms (the page's main thread) or 30-80 ms (TCP, in order) of seeded jitter.
 * A second room model, `uplink` (the fix round's 4c): the owner's commands leave his page at 60 a second, 12 ms after
 * each room tick's start, and reach the room after a seeded uplink delay (none, 0-8 ms, or 30-80 ms in order); the room
 * runs EVERY command that has arrived at each tick (as `match/src/room.ts` runs all queued up to its credit), so uplink
 * jitter gives 0, 1, 2, 3 or more commands in one tick; its snapshots come down at a fixed 40 ms, isolating the uplink.
 * A third, `both` (fix round 2's finding 3, the field case): the `uplink` room with the same jitter on the snapshots'
 * downlink too (0-8 ms on a 40 ms base, or 30-80 ms; seeded, in order).
 *
 * The measure is INV-SPECTATE's dTau (`spectateSmoothness.test.ts`): each frame's motion read as time at the run's
 * median speed, less the frame's duration -- zero for a uniformly moving picture.
 */

const TICK_MS = 1000 / TICK_HZ;
const DELAY_TICKS = (INTERP_DELAY_MS / 1000) * TICK_HZ;

interface Body { feet: readonly [number, number, number]; yaw: number; pitch: number; seq: number }
const bodyAt = (seq: number): Body => ({ feet: [seq, 0, 0], yaw: wrapYaw(seq * 3), pitch: 0, seq });

/** A seeded uniform [0, 1) (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Jitter = 'clean' | 'thread' | 'tcp';
type Model = 'credit' | 'uplink' | 'both';
interface Snap { at: number; tick: number; nibble: number; body: Body; spawns?: number }

/** The seeded delay on a link: none, 0-8 ms (a main thread) or 30-80 ms (TCP); in order is the caller's. */
function delay(jitter: Jitter, r: () => number): number {
  return jitter === 'thread' ? r() * 8 : jitter === 'tcp' ? 30 + r() * 50 : 0;
}

/**
 * `seconds` of the room's snapshots of the subject, in arrival order. `credit`: the room runs 0/1/2 queued commands a
 * tick, the jitter on the snapshots' downlink (40 ms base); `uplink`: the commands' uplink jittered, the room running all
 * arrived each tick, the downlink a fixed 40 ms; `both`: `uplink` with the downlink jittered as `credit`'s.
 */
function room(seconds: number, jitter: Jitter, seed = 7, seq0 = 5, model: Model = 'credit'): Snap[] {
  const r = rng(seed);
  const ticks = Math.ceil((seconds * 1000) / TICK_MS);
  let seq = seq0, queued = 0, lastAt = -Infinity, sent = 0, lastUp = -Infinity;
  const arrive: number[] = [];                                  // uplink: each command's arrival at the room, in order
  const out: Snap[] = [];
  for (let t = 1; t <= ticks; t++) {
    if (model === 'credit') {
      queued++;                                                 // the page's command for this tick has come
      const u = r();
      let run = u < 0.15 ? 0 : u < 0.85 ? 1 : 2;
      if (queued > 3) run = 2;
      run = Math.min(run, queued);
      queued -= run;
      seq += run;
    } else {
      while (sent * TICK_MS + 12 <= t * TICK_MS) {              // the page's commands sent by now
        lastUp = Math.max(lastUp, sent * TICK_MS + 12 + delay(jitter, r));
        arrive.push(lastUp);
        sent++;
      }
      while (queued < arrive.length && arrive[queued]! <= t * TICK_MS) { queued++; seq++; }   // all that have come
    }
    if (t % 2) continue;
    let at = t * TICK_MS + 40;
    if (model !== 'uplink') {
      if (jitter === 'thread') at += r() * 8;
      if (jitter === 'tcp') at = t * TICK_MS + 30 + r() * 50;
    }
    at = Math.max(at, lastAt);
    lastAt = at;
    out.push({ at, tick: t, nibble: seq & 15, body: bodyAt(seq) });
  }
  return out;
}

/** The body's x drawn at command time `c` (linear between the whole commands around it, as the rig's frame draws). */
function drawCmd(clock: CommandClock<Body>, c: number): number {
  const k = Math.floor(c);
  const a = clock.at(k)!;
  const b = clock.at(k + 1) ?? a;
  return a.feet[0] + (b.feet[0] - a.feet[0]) * (c - k);
}

/** `NetClient.bodies()`'s rule on the tick clock, replicated: the two snapshots around the view tick, lerped. */
function drawTick(snaps: Snap[], t: number): number {
  let b = snaps.length - 1;
  while (b > 0 && snaps[b - 1]!.tick > t) b--;
  const newer = snaps[b]!, older = b > 0 ? snaps[b - 1]! : null;
  if (!older || newer.tick <= t) return newer.body.feet[0];
  const f = Math.max(0, Math.min(1, (t - older.tick) / (newer.tick - older.tick)));
  return older.body.feet[0] + (newer.body.feet[0] - older.body.feet[0]) * f;
}

/**
 * Each row's bounds, from the measured run with a small margin (the report's table): the most held frames (the command
 * clock standing on the newest), the command clock's dTau p99 ceiling, and the tick clock's dTau rms and p99 floors (so
 * the test fails if the command clock is bypassed). Null floors: the control row, where both clocks are uniform.
 */
const BOTH_HELD_THREAD_60 = 2, BOTH_HELD_TCP_60 = 16, BOTH_HELD_THREAD_144 = 2, BOTH_HELD_TCP_144 = 32;   // measured 0, 11, 0, 24
const BOTH_P99_THREAD = 1, BOTH_P99_TCP = 1;   // measured 0.518 / 0.347 and 0.833 / 0.347 (60 / 144 Hz)
const ROWS: Record<string, { held: number; cmdP99: number; tickRms: number | null; tickP99: number | null }> = {
  'credit clean 60': { held: 2, cmdP99: 1, tickRms: 3, tickP99: 5 },
  'credit thread 60': { held: 2, cmdP99: 1, tickRms: 3, tickP99: 5 },
  'credit tcp 60': { held: 12, cmdP99: 2, tickRms: 3, tickP99: 5 },
  'credit clean 144': { held: 2, cmdP99: 1, tickRms: 1.5, tickP99: 5 },
  'credit thread 144': { held: 2, cmdP99: 1, tickRms: 1.5, tickP99: 5 },
  'credit tcp 144': { held: 18, cmdP99: 2, tickRms: 1.5, tickP99: 5 },
  'uplink clean 60': { held: 2, cmdP99: 1, tickRms: null, tickP99: null },
  'uplink thread 60': { held: 2, cmdP99: 1, tickRms: 3, tickP99: 5 },
  'uplink tcp 60': { held: 2, cmdP99: 1, tickRms: 3, tickP99: 5 },
  'uplink clean 144': { held: 2, cmdP99: 1, tickRms: null, tickP99: null },
  'uplink thread 144': { held: 2, cmdP99: 1, tickRms: 1.5, tickP99: 3 },      // measured 3.472: this row only
  'uplink tcp 144': { held: 2, cmdP99: 1, tickRms: 1.5, tickP99: 5 },
  'both thread 60': { held: BOTH_HELD_THREAD_60, cmdP99: BOTH_P99_THREAD, tickRms: 3, tickP99: 5 },
  'both tcp 60': { held: BOTH_HELD_TCP_60, cmdP99: BOTH_P99_TCP, tickRms: 3, tickP99: 5 },
  'both thread 144': { held: BOTH_HELD_THREAD_144, cmdP99: BOTH_P99_THREAD, tickRms: 1.5, tickP99: 3 },
  'both tcp 144': { held: BOTH_HELD_TCP_144, cmdP99: BOTH_P99_TCP, tickRms: 1.5, tickP99: 5 },
};

interface Measure { rms: number; p99: number; max: number; cmdBackward: number; nulls: number; starved: number }

function stats(xs: number[], period: number): { rms: number; p99: number; max: number } {
  const dx = xs.slice(1).map((x, i) => x - xs[i]!);
  const med = [...dx].sort((a, b) => a - b)[Math.floor(dx.length / 2)]! / period;
  const d = dx.map((v) => v / med - period);
  const abs = d.map(Math.abs).sort((a, b) => a - b);
  return { rms: Math.sqrt(d.reduce((s, v) => s + v * v, 0) / d.length), p99: abs[Math.floor(abs.length * 0.99)]!, max: abs[abs.length - 1]! };
}

/** Frames at `hz` from 1 s to `seconds`, the same arrivals drawn on the command clock and on the tick clock. */
function measure(model: Model, jitter: Jitter, hz: number, seconds = 20): { cmd: Measure; tick: Measure } {
  const snaps = room(seconds, jitter, 7, 5, model);
  const clock = new CommandClock<Body>();
  const ticks = new PlayoutClock();
  const heard: Snap[] = [];
  const period = 1000 / hz;
  const xc: number[] = [], xt: number[] = [];
  let next = 0, lastCmd = -Infinity, cmdBackward = 0, nulls = 0, starved = 0;
  for (let now = 1000 + 0.37; now < seconds * 1000 - 200; now += period) {
    while (next < snaps.length && snaps[next]!.at <= now) {
      const s = snaps[next++]!;
      clock.hear(s.at, s.tick, s.nibble, s.body);
      ticks.hear(s.at, s.tick);
      heard.push(s);
    }
    const c = clock.cmd(now);
    if (c === null) { nulls++; continue; }
    if (c < lastCmd - 1e-9) cmdBackward++;                    // a float's rounding is not a step
    if (c >= clock.newest()! - 1e-9) starved++;               // standing on the newest: nothing newer heard
    lastCmd = c;
    xc.push(drawCmd(clock, c));
    xt.push(drawTick(heard, Math.max(0, ticks.tick(now) - DELAY_TICKS)));
  }
  return { cmd: { ...stats(xc, period), cmdBackward, nulls, starved }, tick: { ...stats(xt, period), cmdBackward: 0, nulls: 0, starved: 0 } };
}

describe('PV-4a: the command clock draws the subject uniformly (the point of the task)', () => {
  const rows: string[] = [];
  for (const model of ['credit', 'uplink', 'both'] as const) {
    for (const hz of [60, 144]) {
      for (const jitter of model === 'both' ? (['thread', 'tcp'] as const) : (['clean', 'thread', 'tcp'] as const)) {
        it(`${model} ${jitter} at ${hz} Hz: command clock smooth, tick clock uneven`, () => {
          const bound = ROWS[`${model} ${jitter} ${hz}`]!;
          const m = measure(model, jitter, hz);
          rows.push(`${model} ${jitter.padEnd(7)} ${String(hz).padStart(3)}  cmd rms ${m.cmd.rms.toFixed(3)} p99 ${m.cmd.p99.toFixed(3)} max ${m.cmd.max.toFixed(2)} held ${m.cmd.starved}  |  tick rms ${m.tick.rms.toFixed(3)} p99 ${m.tick.p99.toFixed(3)} max ${m.tick.max.toFixed(2)}`);
          expect(m.cmd.nulls).toBe(0);
          expect(m.cmd.cmdBackward).toBe(0);
          expect(m.cmd.starved).toBeLessThanOrEqual(bound.held);
          expect(m.cmd.p99).toBeLessThan(bound.cmdP99);
          if (bound.tickRms === null || bound.tickP99 === null) {
            // One command a tick exactly: both clocks are uniform; the control row.
            expect(m.tick.p99).toBeLessThan(1);
            return;
          }
          // The same snapshots on the tick clock: the room's cadence shows (so the test fails if the clock is bypassed).
          expect(m.tick.rms).toBeGreaterThan(bound.tickRms);
          expect(m.tick.p99).toBeGreaterThan(bound.tickP99);
        });
      }
    }
  }
  it('prints the table', () => {
    // eslint-disable-next-line no-console
    console.log(['dTau ms (each frame\'s motion at the median speed, less the frame):', ...rows].join('\n'));
    expect(rows.length).toBe(16);
  });
});

describe('PV-4a: unwrapping', () => {
  for (const [model, jitter] of [['credit', 'tcp'], ['uplink', 'thread'], ['uplink', 'tcp'], ['both', 'tcp']] as const) {
    it(`a long ordinary run (${model}, ${jitter}): the corrected count equals the true count at every sample`, () => {
      const snaps = room(120, jitter, 13, 5, model);
      const clock = new CommandClock<Body>();
      const seq0 = snaps[0]!.body.seq;
      for (const s of snaps) {
        clock.hear(s.at, s.tick, s.nibble, s.body);
        expect(clock.newest()! - (COMMAND_CLOCK_BASE_ADAPTATION + (seq0 & 15))).toBe(s.body.seq - seq0);
      }
      expect(clock.epoch).toBe(0);
    });
  }

  it('follows the number across many wraps of the nibble, deltas 0-4', () => {
    const snaps = room(30, 'clean');
    const clock = new CommandClock<Body>();
    const deltas = new Set<number>();
    const seq0 = snaps[0]!.body.seq;
    for (let i = 0; i < snaps.length; i++) {
      const s = snaps[i]!;
      if (i) deltas.add(s.body.seq - snaps[i - 1]!.body.seq);
      clock.hear(s.at, s.tick, s.nibble, s.body);
      expect(clock.newest()! - (COMMAND_CLOCK_BASE_ADAPTATION + (seq0 & 15))).toBe(s.body.seq - seq0);
      expect(clock.at(clock.newest()!)).toBe(s.body);
    }
    expect(snaps[snaps.length - 1]!.body.seq - seq0).toBeGreaterThan(16 * 50);   // wrapped many times
    for (const d of [0, 1, 2, 3, 4]) expect(deltas.has(d)).toBe(true);
    // Every whole command in the kept history is known, and lies where the owner put it.
    const top = clock.newest()!;
    for (let k = top - 90; k <= top; k++) expect(clock.at(k)!.feet[0]).toBeCloseTo(k - COMMAND_CLOCK_BASE_ADAPTATION - (seq0 & 15) + seq0, 9);
  });
});

/** Hand-made samples every 2 ticks, heard 40 ms after their tick: `seqs[i]` the subject's command number at the i-th. */
function feed(seqs: number[], tick0 = 2): Snap[] {
  return seqs.map((seq, i) => {
    const tick = tick0 + 2 * i;
    return { at: tick * TICK_MS + 40, tick, nibble: seq & 15, body: bodyAt(seq) };
  });
}

/** Frames at 60 Hz over the samples, each heard at its time; cmd per frame (null kept). */
function play(clock: CommandClock<Body>, snaps: Snap[], from: number, to: number, hz = 60): { now: number; c: number | null; newest: number | null }[] {
  const out: { now: number; c: number | null; newest: number | null }[] = [];
  let next = 0;
  for (let now = from; now < to; now += 1000 / hz) {
    while (next < snaps.length && snaps[next]!.at <= now) { const s = snaps[next++]!; clock.hear(s.at, s.tick, s.nibble, s.body); }
    out.push({ now, c: clock.cmd(now), newest: clock.newest() });
  }
  return out;
}

describe('PV-4a: a stall, a burst', () => {
  it('a stall holds on the newest, never steps back, and at() is right after the catch-up', () => {
    const seqs: number[] = [];
    let seq = 3;
    for (let i = 0; i < 60; i++) seqs.push(seq += 2);           // 2 s of steady commands
    for (let i = 0; i < 6; i++) seqs.push(seq);                 // a stall: 14 ticks to the next sample, no command ran
    seqs.push(seq += 13);                                       // the catch-up, within 15 commands
    for (let i = 0; i < 60; i++) seqs.push(seq += 2);
    const snaps = feed(seqs);
    const clock = new CommandClock<Body>();
    const frames = play(clock, snaps, 200, snaps[snaps.length - 1]!.at + 500);
    let last = -Infinity;
    for (const f of frames) {
      if (f.c === null) continue;
      expect(Number.isFinite(f.c)).toBe(true);
      expect(f.c).toBeGreaterThanOrEqual(last - 1e-9);          // a float's rounding at the guard is not a step
      expect(f.c).toBeLessThanOrEqual(f.newest! + 1e-9);
      last = f.c;
    }
    // Inside the stall the clock stood on the newest number.
    const stallEnd = snaps[60 + 5]!.at;
    const inStall = frames.filter((f) => f.now > stallEnd - 50 && f.now < stallEnd);
    expect(inStall.length).toBeGreaterThan(0);
    for (const f of inStall) { expect(f.c).not.toBeNull(); expect(f.c!).toBeCloseTo(f.newest!, 6); }
    const top = clock.newest()!;
    const seqTop = seqs[seqs.length - 1]!;
    for (let k = top - 60; k <= top; k++) expect(clock.at(k)!.feet[0]).toBeCloseTo(seqTop - (top - k), 9);
  });

  /**
   * The realistic burst (fix round 2): the owner's uplink stalls for `stall` ticks -- the number constant while the
   * room's ticks run on, a sample every 2 -- then the room runs the `burst` queued commands in one step.
   */
  function stallBurst(stall: number, burst: number): { snaps: Snap[]; before: number; after: number } {
    const snaps: Snap[] = [];
    const put = (tick: number, seq: number): void => { snaps.push({ at: tick * TICK_MS + 40, tick, nibble: seq & 15, body: bodyAt(seq) }); };
    let seq = 3, tick = 0;
    for (let i = 0; i < 60; i++) put(tick += 2, seq += 2);      // 2 s of steady commands; the last advance at `tick`
    const before = seq, t0 = tick;
    for (tick += 2; tick < t0 + stall; tick += 2) put(tick, seq);   // the stall: the number constant, the ticks running on
    tick = t0 + stall;
    put(tick, seq += burst);                                     // `stall` ticks after the last advance
    const after = seq;
    for (let i = 0; i < 60; i++) put(tick += 2, seq += 2);
    return { snaps, before, after };
  }

  for (const [stall, burst] of [[18, 17], [20, 20], [30, 31], [30, 30], [6, 6]] as const) {
    it(`a ${stall}-tick stall then a burst of ${burst}: the true count, cmd monotonic, drawn at the owner's speed`, () => {
      const { snaps, before, after } = stallBurst(stall, burst);
      const clock = new CommandClock<Body>();
      const frames: { c: number | null; x: number | null; newest: number }[] = [];
      const off = (snaps[0]!.body.seq & 15) + COMMAND_CLOCK_BASE_ADAPTATION - snaps[0]!.body.seq;   // n - seq
      let next = 0, burstN = -1;
      for (let now = 200; now < snaps[snaps.length - 1]!.at + 300; now += 1000 / 60) {
        while (next < snaps.length && snaps[next]!.at <= now) {
          const s = snaps[next++]!;
          clock.hear(s.at, s.tick, s.nibble, s.body);
          if (s.body.seq === after && burstN < 0) {
            burstN = clock.newest()!;
            // Every whole command across the burst lies where the owner put it: the lerp spans the true count.
            for (let k = before + off; k <= after + off; k++) expect(clock.at(k)!.feet[0]).toBeCloseTo(k - off, 9);
          }
        }
        const c = clock.cmd(now);
        frames.push({ c, x: c === null ? null : drawCmd(clock, c), newest: clock.newest()! });
      }
      // The number after the burst is `burst` past the one before it.
      expect(burstN).toBe(after + off);
      expect(clock.newest()!).toBe(snaps[snaps.length - 1]!.body.seq + off);
      // cmd monotonic, never NaN; the drawn x is the owner's own path (x = seq) at every frame: his speed, not burst/raw.
      let last = -Infinity;
      for (const f of frames) {
        if (f.c === null) continue;
        expect(Number.isFinite(f.c)).toBe(true);
        expect(f.c).toBeGreaterThanOrEqual(last - 1e-9);
        expect(f.c).toBeLessThanOrEqual(f.newest + 1e-9);
        expect(f.x!).toBeCloseTo(f.c - off, 6);
        last = f.c;
      }
      expect(clock.epoch).toBe(0);
    });
  }

  /** Frames at 60 Hz over `snaps`; per frame the cmd, the epoch and whether a sample came since the frame before. */
  function framesOf(clock: CommandClock<Body>, snaps: Snap[], onHear?: (s: Snap) => void): { c: number | null; epoch: number; tick: number }[] {
    const out: { c: number | null; epoch: number; tick: number }[] = [];
    let next = 0;
    for (let now = 200; now < snaps[snaps.length - 1]!.at + 300; now += 1000 / 60) {
      while (next < snaps.length && snaps[next]!.at <= now) { const s = snaps[next++]!; clock.hear(s.at, s.tick, s.nibble, s.body); onHear?.(s); }
      const c = clock.cmd(now);
      if (c !== null) { expect(Number.isFinite(c)).toBe(true); drawCmd(clock, c); }
      out.push({ c, epoch: clock.epoch, tick: clock.newest() === null ? -1 : snaps[next - 1]!.tick });
    }
    return out;
  }

  for (const [stall, burst] of [[40, 30], [31, 31], [40, 40], [60, 61]] as const) {
    it(`a ${stall}-tick stall then ${burst} (past ${COMMAND_CLOCK_STALL_TICKS_ADAPTATION} ticks): a reset, no count, null until two numbers, no lerp across`, () => {
      const { snaps, after } = stallBurst(stall, burst);
      const clock = new CommandClock<Body>();
      let afterTick = -1;
      const frames = framesOf(clock, snaps, (s) => {
        if (s.body.seq !== after || afterTick >= 0) return;
        afterTick = s.tick;
        expect(clock.epoch).toBe(1);
        expect(clock.oldest()).toBe(COMMAND_CLOCK_BASE_ADAPTATION + (after & 15));
        expect(clock.newest()).toBe(clock.oldest());
        expect(clock.at(clock.oldest()! - 1)).toBeNull();        // nothing before the reset: no lerp across it
        expect(clock.at(clock.oldest()!)!.feet[0]).toBe(after);
      });
      expect(afterTick).toBeGreaterThan(0);
      // Null from the reset's sample until the next (which advances), then a clock again, monotonic within the epoch.
      for (const f of frames) if (f.tick === afterTick) expect(f.c).toBeNull();
      let last = -Infinity;
      for (const f of frames) if (f.epoch === 1 && f.c !== null) { expect(f.c).toBeGreaterThanOrEqual(last - 1e-9); last = f.c; }
      expect(last).toBeGreaterThan(-Infinity);
      expect(clock.epoch).toBe(1);
      expect(clock.newest()! - (COMMAND_CLOCK_BASE_ADAPTATION + (after & 15))).toBe(snaps[snaps.length - 1]!.body.seq - after);
    });
  }

  it('a throttled page (one command every 60 ticks, five times): five resets, never a count of ~65, null throughout', () => {
    const snaps: Snap[] = [];
    const put = (tick: number, seq: number): void => { snaps.push({ at: tick * TICK_MS + 40, tick, nibble: seq & 15, body: bodyAt(seq) }); };
    let seq = 3, tick = 0;
    for (let i = 0; i < 60; i++) put(tick += 2, seq += 2);
    const t0 = tick, firstWake = t0 + 60;
    for (tick = t0 + 2; tick <= t0 + 5 * 60 + 20; tick += 2) put(tick, (tick - t0) % 60 === 0 ? ++seq : seq);
    const clock = new CommandClock<Body>();
    const frames = framesOf(clock, snaps, (s) => {
      if (s.tick >= firstWake) expect(clock.newest()).toBe(clock.oldest());   // one number: never counted ~65
    });
    for (const f of frames) if (f.tick >= firstWake) expect(f.c).toBeNull();
    expect(clock.epoch).toBe(5);
  });

  it('a 2 s uplink stall then the room\'s drain (61 in one step, then 2 a tick): one reset, then an ordinary clock', () => {
    const snaps: Snap[] = [];
    let seq = 3, queued = 0;
    const t0 = 120, wake = t0 + 120;
    for (let t = 1; t <= wake + 120; t++) {
      if (t <= t0) seq++;                                        // steady: one a tick
      else if (t < wake) queued++;                               // the uplink stalled: the page's commands wait
      else {
        queued++;
        const run = Math.min(queued, t === wake ? 61 : 2);      // CREDIT_MAX + 1 in the step, then 2 a tick
        queued -= run;
        seq += run;
      }
      if (t % 2 === 0) snaps.push({ at: t * TICK_MS + 40, tick: t, nibble: seq & 15, body: bodyAt(seq) });
    }
    expect(queued).toBe(0);                                      // drained inside the run
    const clock = new CommandClock<Body>();
    let resetSeq = -1;
    const frames = framesOf(clock, snaps, (s) => {
      if (s.tick === wake) { resetSeq = s.body.seq; expect(clock.epoch).toBe(1); }
      if (s.tick >= wake) expect(clock.newest()! - (COMMAND_CLOCK_BASE_ADAPTATION + (resetSeq & 15))).toBe(s.body.seq - resetSeq);
    });
    expect(clock.epoch).toBe(1);
    let last = -Infinity, live = 0;
    for (const f of frames) if (f.epoch === 1 && f.c !== null) { expect(f.c).toBeGreaterThanOrEqual(last - 1e-9); last = f.c; live++; }
    expect(live).toBeGreaterThan(60);
  });

  it('exactly 16 after a 16-tick stall reads as 0 (the nibble cannot tell it from a stall): the body jumps at one number', () => {
    const { snaps, before } = stallBurst(16, 16);
    const clock = new CommandClock<Body>();
    const off = (snaps[0]!.body.seq & 15) + COMMAND_CLOCK_BASE_ADAPTATION - snaps[0]!.body.seq;
    for (const s of snaps.slice(0, 60 + 8)) clock.hear(s.at, s.tick, s.nibble, s.body);   // to the burst's sample
    expect(clock.newest()).toBe(before + off);                  // unchanged: read as no command
    expect(clock.at(before + off)!.feet[0]).toBe(before + 16);  // the newest state with that number
    let last = -Infinity;
    for (const f of play(new CommandClock<Body>(), snaps, 200, snaps[snaps.length - 1]!.at + 300)) {
      if (f.c === null) continue;
      expect(Number.isFinite(f.c)).toBe(true);
      expect(f.c).toBeGreaterThanOrEqual(last - 1e-9);
      last = f.c;
    }
  });
});

describe('PV-4a: a respawn between two samples (NU-12 D6, as `bodies()`)', () => {
  it('at() between samples whose spawn counts differ is the newer body whole; with the same count, the lerp', () => {
    const B = COMMAND_CLOCK_BASE_ADAPTATION;
    const clock = new CommandClock<Body>();
    const dead: Body = { feet: [0, 0, 0], yaw: 10, pitch: 0, seq: 0 };
    const spawned: Body = { feet: [500, 20, -300], yaw: 200, pitch: 5, seq: 2 };
    const on: Body = { feet: [502, 20, -300], yaw: 202, pitch: 5, seq: 4 };
    clock.hear(100, 2, 0, dead, 3);
    clock.hear(133, 4, 2, spawned, 4);
    clock.hear(166, 6, 4, on, 4);
    expect(clock.at(B + 1)).toBe(spawned);                       // no midpoint across the map
    expect(clock.at(B + 2)).toBe(spawned);
    expect(clock.at(B + 3)!.feet[0]).toBeCloseTo(501, 9);       // same spawn count: lerped
    const p = new CommandClock<Body>();
    p.prime([{ at: 100, tick: 2, nibble: 0, body: dead, spawns: 3 }, { at: 133, tick: 4, nibble: 2, body: spawned, spawns: 4 }]);
    expect(p.at(B + 1)).toBe(spawned);
  });

  it('PV-15: lifeAt(k) is the spawn count of the body at(k) gives -- the newer sample of the bracket; null where at(k) is null', () => {
    const B = COMMAND_CLOCK_BASE_ADAPTATION;
    const clock = new CommandClock<Body>();
    const dead: Body = { feet: [0, 0, 0], yaw: 10, pitch: 0, seq: 0 };
    const spawned: Body = { feet: [500, 20, -300], yaw: 200, pitch: 5, seq: 2 };
    const on: Body = { feet: [502, 20, -300], yaw: 202, pitch: 5, seq: 4 };
    expect(clock.lifeAt(B)).toBeNull();                          // nothing kept
    clock.hear(100, 2, 0, dead, 3);
    clock.hear(133, 4, 2, spawned, 4);
    clock.hear(166, 6, 4, on, 4);
    expect(clock.lifeAt(B)).toBe(3);                             // the sample itself
    expect(clock.lifeAt(B + 1)).toBe(4);                         // between a death and a spawn: the newer body, its life
    expect(clock.lifeAt(B + 2)).toBe(4);
    expect(clock.lifeAt(B + 3)).toBe(4);                         // a lerp inside one life
    expect(clock.lifeAt(B + 4)).toBe(4);
    expect(clock.lifeAt(B + 5)).toBeNull();                      // ahead of the newest, as at()
    expect(clock.lifeAt(B - 1)).toBeNull();                      // older than the oldest kept, as at()
    expect(clock.at(B + 5)).toBeNull();
    expect(clock.at(B - 1)).toBeNull();
  });

  it('PV-15: a stall across the spawn (the spawned body heard before its seat runs a command) gives that number the new life', () => {
    const B = COMMAND_CLOCK_BASE_ADAPTATION;
    const clock = new CommandClock<Body>();
    const dead: Body = { feet: [0, 0, 0], yaw: 10, pitch: 0, seq: 0 };
    const spawned: Body = { feet: [500, 20, -300], yaw: 200, pitch: 5, seq: 2 };
    clock.hear(100, 2, 0, dead, 3);
    clock.hear(133, 4, 2, dead, 3);
    clock.hear(166, 6, 2, spawned, 4);                           // the same number: the newest state with it
    expect(clock.at(B + 2)).toBe(spawned);
    expect(clock.lifeAt(B + 2)).toBe(4);
    expect(clock.lifeAt(B + 1)).toBe(4);                         // at(B + 1) is the newer whole: the spawned body
    expect(clock.at(B + 1)).toBe(spawned);
    expect(clock.lifeAt(B)).toBe(3);
  });
});

describe('PV-4a: the epoch', () => {
  it('each reset path bumps it once; an ordinary sample does not', () => {
    const clock = new CommandClock<Body>();
    expect(clock.epoch).toBe(0);
    for (const s of feed([2, 4, 6, 8])) clock.hear(s.at, s.tick, s.nibble, s.body);
    expect(clock.epoch).toBe(0);
    clock.reset();
    expect(clock.epoch).toBe(1);
    for (const s of feed([2, 4, 6, 8])) clock.hear(s.at, s.tick, s.nibble, s.body);
    const t = 8 + COMMAND_CLOCK_GAP_TICKS_ADAPTATION + 1;        // the gap rule
    clock.hear(t * TICK_MS + 40, t, 1, bodyAt(1));
    expect(clock.epoch).toBe(2);
    clock.hear(1, 2, 3, bodyAt(3));                              // a tick backward
    expect(clock.epoch).toBe(3);
    clock.hear(50, 4, 5, bodyAt(5));
    expect(clock.epoch).toBe(3);
  });
});

describe('PV-4a: a gap in the room\'s ticks, a tick backward', () => {
  it('a gap past the limit resets: a fresh clock from that sample', () => {
    const clock = new CommandClock<Body>();
    for (const s of feed([2, 4, 6, 8, 10, 12, 14])) clock.hear(s.at, s.tick, s.nibble, s.body);
    expect(clock.cmd(14 * TICK_MS + 60)).not.toBeNull();
    const t = 14 + COMMAND_CLOCK_GAP_TICKS_ADAPTATION + 1;
    clock.hear(t * TICK_MS + 40, t, 9, bodyAt(41));
    expect(clock.newest()).toBe(COMMAND_CLOCK_BASE_ADAPTATION + 9);
    expect(clock.oldest()).toBe(COMMAND_CLOCK_BASE_ADAPTATION + 9);
    expect(clock.at(COMMAND_CLOCK_BASE_ADAPTATION + 9)!.feet[0]).toBe(41);
    expect(clock.cmd(t * TICK_MS + 50)).toBeNull();             // one number in hand
    clock.hear((t + 2) * TICK_MS + 40, t + 2, 11, bodyAt(43));
    expect(clock.cmd((t + 2) * TICK_MS + 50)).not.toBeNull();
  });

  it('a gap at the limit does not reset', () => {
    const clock = new CommandClock<Body>();
    for (const s of feed([2, 4, 6])) clock.hear(s.at, s.tick, s.nibble, s.body);
    const t = 6 + COMMAND_CLOCK_GAP_TICKS_ADAPTATION;
    clock.hear(t * TICK_MS + 40, t, 21 & 15, bodyAt(21));
    expect(clock.oldest()).toBe(COMMAND_CLOCK_BASE_ADAPTATION + 2);
    expect(clock.newest()).toBe(COMMAND_CLOCK_BASE_ADAPTATION + 21);
  });

  it('a tick backward resets', () => {
    const clock = new CommandClock<Body>();
    for (const s of feed([2, 4, 6, 8, 10])) clock.hear(s.at, s.tick, s.nibble, s.body);
    clock.hear(400, 4, 3, bodyAt(99));
    expect(clock.newest()).toBe(COMMAND_CLOCK_BASE_ADAPTATION + 3);
    expect(clock.oldest()).toBe(COMMAND_CLOCK_BASE_ADAPTATION + 3);
    expect(clock.at(COMMAND_CLOCK_BASE_ADAPTATION + 3)!.feet[0]).toBe(99);
  });
});

describe('PV-4a: no usable clock -> null (rule 5)', () => {
  it('null with one number; not null with two different', () => {
    const clock = new CommandClock<Body>();
    expect(clock.cmd(0)).toBeNull();
    clock.hear(100, 2, 5, bodyAt(5));
    clock.hear(133, 4, 5, bodyAt(5));
    expect(clock.cmd(140)).toBeNull();
    clock.hear(166, 6, 6, bodyAt(6));
    expect(clock.cmd(170)).not.toBeNull();
  });

  it('a constant nibble for over a second -> null; an advance -> a reset (past 30 ticks), then resumes', () => {
    const seqs: number[] = [];
    let seq = 0;
    for (let i = 0; i < 30; i++) seqs.push(seq += 2);
    const idleSamples = COMMAND_CLOCK_IDLE_TICKS_ADAPTATION / 2 + 2;
    for (let i = 0; i < idleSamples; i++) seqs.push(seq);
    seqs.push(seq += 2);
    seqs.push(seq += 2);
    const snaps = feed(seqs);
    const clock = new CommandClock<Body>();
    for (let i = 0; i < 30 + idleSamples; i++) { const s = snaps[i]!; clock.hear(s.at, s.tick, s.nibble, s.body); }
    const lastIdle = snaps[30 + idleSamples - 1]!;
    expect(clock.cmd(lastIdle.at + 1)).toBeNull();
    // The advance after more than COMMAND_CLOCK_STALL_TICKS_ADAPTATION ticks resets (fix round 2): one number, null.
    const a = snaps[snaps.length - 2]!;
    clock.hear(a.at, a.tick, a.nibble, a.body);
    expect(clock.epoch).toBe(1);
    expect(clock.cmd(a.at + 1)).toBeNull();
    const s = snaps[snaps.length - 1]!;
    clock.hear(s.at, s.tick, s.nibble, s.body);
    const c = clock.cmd(s.at + 1);
    expect(c).not.toBeNull();
    expect(Number.isFinite(c!)).toBe(true);
  });

  it('a protocol-15-style feed (nibble always 0) is always null', () => {
    const clock = new CommandClock<Body>();
    for (let t = 2; t < 300; t += 2) {
      clock.hear(t * TICK_MS + 40, t, 0, bodyAt(t));
      expect(clock.cmd(t * TICK_MS + 45)).toBeNull();
    }
  });
});

describe('PV-4a: at(k)', () => {
  const B = COMMAND_CLOCK_BASE_ADAPTATION;
  it('exact at the samples, interpolated between (feet linear, yaw the short way, pitch linear), null outside', () => {
    const clock = new CommandClock<Body>();
    const a: Body = { feet: [0, 10, -4], yaw: 359, pitch: 0, seq: 0 };
    const b: Body = { feet: [4, 14, 0], yaw: 1, pitch: 8, seq: 4 };
    clock.hear(100, 2, 0, a);
    clock.hear(133, 4, 4, b);
    expect(clock.at(B)).toBe(a);
    expect(clock.at(B + 4)).toBe(b);
    const mid = clock.at(B + 2)!;
    expect(mid.feet).toEqual([2, 12, -2]);
    expect(mid.yaw).toBeCloseTo(0, 9);
    expect(mid.pitch).toBeCloseTo(4, 9);
    expect(mid.seq).toBe(4);                                    // the rest from the newer
    expect(clock.at(B + 1)!.yaw).toBeCloseTo(359.5, 9);
    expect(clock.at(B + 3)!.yaw).toBeCloseTo(0.5, 9);
    expect(clock.at(B + 5)).toBeNull();
    expect(clock.at(B - 1)).toBeNull();
  });

  it('two samples sharing a number: the later wins', () => {
    const clock = new CommandClock<Body>();
    clock.hear(100, 2, 3, bodyAt(3));
    clock.hear(133, 4, 7, bodyAt(7));
    const later: Body = { feet: [70, 0, 0], yaw: 0, pitch: 0, seq: 7 };
    clock.hear(166, 6, 7, later);
    expect(clock.at(B + 7)).toBe(later);
    expect(clock.at(B + 5)!.feet[0]).toBeCloseTo(3 + (70 - 3) / 2, 9);
  });
});

describe('PV-4a: prime, history', () => {
  it('prime() equals the same samples through hear()', () => {
    const snaps = room(5, 'tcp', 3);
    const p = new CommandClock<Body>(), h = new CommandClock<Body>();
    p.prime(snaps);
    for (const s of snaps) h.hear(s.at, s.tick, s.nibble, s.body);
    expect(p.newest()).toBe(h.newest());
    expect(p.oldest()).toBe(h.oldest());
    const end = snaps[snaps.length - 1]!.at;
    for (let now = end; now < end + 300; now += 7) expect(p.cmd(now)).toBe(h.cmd(now));
    for (let k = p.oldest()! - 2; k <= p.newest()! + 2; k++) expect(p.at(k)).toEqual(h.at(k));
    // 2 s of history: the rig's warm-up 90 commands back is known.
    expect(p.at(p.newest()! - 90)).not.toBeNull();
  });

  it('a 10-minute feed keeps about 2 s, and misses stay cheap and right', () => {
    const snaps = room(600, 'thread', 9);
    const clock = new CommandClock<Body>();
    let maxSpan = 0;
    for (const s of snaps) {
      clock.hear(s.at, s.tick, s.nibble, s.body);
      maxSpan = Math.max(maxSpan, clock.newest()! - clock.oldest()!);
    }
    // At most the kept ticks' commands (two a tick at the most) plus one sample's step.
    expect(maxSpan).toBeLessThanOrEqual(2 * COMMAND_CLOCK_HISTORY_TICKS_ADAPTATION + 4);
    expect(clock.at(clock.newest()! - 90)).not.toBeNull();
    const t0 = Date.now();
    let misses = 0;
    for (let r = 0; r < 1000; r++) for (let k = clock.oldest()! - 91; k < clock.oldest()!; k++) if (clock.at(k) === null) misses++;
    for (let r = 0; r < 1000; r++) if (clock.at(clock.newest()! + 1 + r) === null) misses++;
    expect(misses).toBe(92000);
    expect(Date.now() - t0).toBeLessThan(500);
  });
});

/**
 * PV-10f (research 402 s2, the second rendered run's ladder; product track): the burst rule never counts more commands
 * than the room's ticks since the last advance plus `COMMAND_CLOCK_BURST_SLACK_ADAPTATION`. A page's frame is capped at
 * 0.1 s (`main.ts`, `matchMount.ts`), so a page hitch of H ms runs at most 6 commands where the room ran about H / 16.7
 * ticks: fewer commands than ticks, which the old rule read 16 high from T - raw >= 8.
 */
describe('PV-10f: a page hitch sends fewer commands than the ticks it lasted', () => {
  /** 60 samples of steady play (a command a tick, a sample every 2), then `stall` ticks to a sample `burst` further on. */
  function hitch(stall: number, burst: number): { snaps: Snap[]; before: number; after: number; off: number } {
    const snaps: Snap[] = [];
    const put = (tick: number, seq: number): void => { snaps.push({ at: tick * TICK_MS + 40, tick, nibble: seq & 15, body: bodyAt(seq) }); };
    let seq = 3, tick = 0;
    for (let i = 0; i < 60; i++) put(tick += 2, seq += 2);
    const before = seq, t0 = tick;
    for (tick += 2; tick < t0 + stall; tick += 2) put(tick, seq);
    put(tick = t0 + stall, seq += burst);
    const after = seq;
    for (let i = 0; i < 30; i++) put(tick += 2, seq += 2);
    return { snaps, before, after, off: (snaps[0]!.body.seq & 15) + COMMAND_CLOCK_BASE_ADAPTATION - snaps[0]!.body.seq };
  }
  /** What the clock reads the burst as (its number after the burst's sample less the one before), and at the end. */
  function read(stall: number, burst: number): { burst: number; endError: number; epoch: number } {
    const { snaps, before, after, off } = hitch(stall, burst);
    const clock = new CommandClock<Body>();
    let got = NaN;
    for (const s of snaps) {
      clock.hear(s.at, s.tick, s.nibble, s.body);
      if (s.body.seq === after && Number.isNaN(got)) got = clock.newest()! - (before + off);
    }
    return { burst: got, endError: clock.newest()! - (snaps[snaps.length - 1]!.body.seq + off), epoch: clock.epoch };
  }

  it('the slack is 4 commands (its derivation is the constant\'s doc)', () => {
    expect(COMMAND_CLOCK_BURST_SLACK_ADAPTATION).toBe(4);
  });

  it('the recorded case: a 15-tick hitch that ran 6 commands reads 6, and every number after it is exact', () => {
    const r = read(15, 6);
    expect(r).toEqual({ burst: 6, endError: 0, epoch: 0 });
  });

  // A capped page: 6 commands (one 0.1 s frame) after a hitch of T ticks; exact while 22 > T + slack (T <= 17).
  for (let stall = 9; stall <= 17; stall++) {
    it(`a ${stall}-tick hitch then 6 commands: exact`, () => { expect(read(stall, 6)).toEqual({ burst: 6, endError: 0, epoch: 0 }); });
  }
  // One command (a page that woke for one tick): exact while 17 > T + slack (T <= 12).
  for (let stall = 9; stall <= 12; stall++) {
    it(`a ${stall}-tick hitch then 1 command: exact`, () => { expect(read(stall, 1)).toEqual({ burst: 1, endError: 0, epoch: 0 }); });
  }

  // The uplink stall: about T commands in one step, from T - 4 to T + slack.
  for (let stall = 9; stall <= 30; stall++) {
    it(`an uplink stall of ${stall} ticks then ${stall - 4} to ${stall + 4} commands in one step: exact`, () => {
      for (let e = -4; e <= 4; e++) {
        if ((stall + e) % 16 === 0) continue;                    // exactly 16 or 32 reads as a stall (the test above)
        expect(read(stall, stall + e)).toEqual({ burst: stall + e, endError: 0, epoch: 0 });
      }
    });
  }

  it('the alias that remains: a burst of raw is read as raw + 16 when raw + 16 lies within T + slack and nearer T', () => {
    // 6 commands after 18 to 30 ticks (a capped page's hitch of about 300 to 500 ms) cannot be told from 22 -- the four
    // bits hold only raw, and an uplink stall of that length runs about T: read 16 high, and the playout clock snaps.
    for (let stall = 18; stall <= 30; stall++) expect(read(stall, 6).burst).toBe(22);
    for (let stall = 13; stall <= 28; stall++) expect(read(stall, 1).burst).toBe(17);
    expect(read(29, 1).burst).toBe(33);                         // 33 within 29 + 4, nearer 29 than 17
    expect(read(22, 6).burst).toBe(read(22, 22).burst);        // indistinguishable: the same nibble after the same ticks
  });

  /**
   * The recorded hitch, modelled (the second run's owner dump has his frames, no room tick): his page's frames around
   * command 10261 -- each frame's time (ms) and the last command it ran, the 251 ms frame running 6 -- each command sent
   * at its frame's time, reaching the room 12 ms later and run at the room's first tick at or after it (a tick every
   * 16.667 ms from a phase), a sample every second tick heard 40 ms after its tick. Over every phase the numbers are the
   * true count; the old rule read 16 high at most phases.
   */
  it('the second run\'s hitch at command 10261, modelled over the room\'s phase: the true count at every sample', () => {
    const frames: [number, number][] = [[178500.9, 10236], [178517, 10237], [178549.2, 10238], [178583.2, 10240], [178597.3, 10241],
      [178622.5, 10243], [178638.1, 10244], [178668.6, 10246], [178718, 10248], [178742.2, 10250], [178763.7, 10252], [178797, 10253],
      [178822.4, 10255], [178878.2, 10258], [178900.8, 10260], [178919.8, 10261], [179171.4, 10267], [179196.8, 10271], [179221.7, 10273],
      [179243.7, 10274], [179262.9, 10275], [179280.4, 10277], [179293.2, 10278], [179303.7, 10278], [179324.9, 10279], [179338.3, 10280],
      [179353.7, 10281], [179376.3, 10282], [179400.7, 10283]];
    const sent: [number, number][] = [];                        // (arrival at the room, command)
    for (let i = 1; i < frames.length; i++) for (let k = frames[i - 1]![1] + 1; k <= frames[i]![1]; k++) sent.push([frames[i]![0] + 12, k]);
    let maxStep = 0;
    for (let phase = 0; phase < 2 * TICK_MS; phase += 2) {
      const snaps: Snap[] = [];
      const first = Math.ceil((frames[0]![0] - phase) / TICK_MS / 2) * 2;
      for (let j = first; phase + j * TICK_MS < frames[frames.length - 1]![0] + 100; j += 2) {
        const t = phase + j * TICK_MS;
        let seq = frames[0]![1];
        for (const [a, k] of sent) if (a <= t) seq = Math.max(seq, k);
        snaps.push({ at: t + 40, tick: j, nibble: seq & 15, body: bodyAt(seq) });
      }
      const clock = new CommandClock<Body>();
      const seq0 = snaps[0]!.body.seq;
      for (const s of snaps) {
        clock.hear(s.at, s.tick, s.nibble, s.body);
        expect(clock.newest()! - (COMMAND_CLOCK_BASE_ADAPTATION + (seq0 & 15)), `phase ${phase} tick ${s.tick}`).toBe(s.body.seq - seq0);
      }
      expect(clock.epoch).toBe(0);
      // What the rig is asked to step in one 60 Hz frame (`povCamera.ts` ticks one per whole command crossed): played over
      // the same samples, never more than the hitch's own 6 commands (the old rule's snap asked about 17).
      const played = new CommandClock<Body>();
      let next = 0, last: number | null = null;
      for (let now = snaps[0]!.at; now < snaps[snaps.length - 1]!.at + 200; now += 1000 / 60) {
        while (next < snaps.length && snaps[next]!.at <= now) { const s = snaps[next++]!; played.hear(s.at, s.tick, s.nibble, s.body); }
        const c = played.cmd(now);
        if (c !== null && last !== null) maxStep = Math.max(maxStep, Math.floor(c) - Math.floor(last));
        if (c !== null) last = c;
      }
    }
    console.log(`PV-10f modelled hitch: the most whole commands crossed in one frame ${maxStep}`);
    expect(maxStep).toBeLessThanOrEqual(6);
  });
});
