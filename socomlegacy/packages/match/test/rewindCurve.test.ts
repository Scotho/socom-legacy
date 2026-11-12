import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEAL_LOCOMOTION, type CollisionOwner, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import {
  Button, cameraLook, centreClaim, faceToward, groundGrid, MoverSim, packGround, quantiseCommand, probeLiftOf, Walker, wrapYaw,
  type Command, type SimMap,
} from '../../viewer/src/sim';
import { INTERP_DELAY_MS, NetClient, type NetWalk, type WebSocketLike } from '../../viewer/src/net/client';
import { MAX_REWIND_MS, REWIND_CEILING_MS_ADAPTATION, TICK_HZ } from '../../viewer/src/net/protocol';
import { REWIND_LINE_ALLOWANCE_MS_ADAPTATION, Room, rewindCapMs, rewindCapTicks } from '../src/room';
import type { RewindClass } from '../src/stats/roomResults';
import { Line, lineSocket } from './helpers/netMeasure';

/**
 * LOW-9 (the netcode wave, `docs/plans/2026-11-05-netcode-wave.md` section 4's B-cap / B-bound; NCW-1's harness): the
 * curve for the owner's decision on the rewind budget -- a test instrument, measurement only: it changes nothing in
 * `src` and reads the room's own NCW-1 classes. A MODEL SWEEP on in-order lines under fake timers, not a field share.
 *
 * The grid: one-way latency 25..250 ms in 25 ms steps, jitter none or +-30 ms, a target strafing at full stick (turning
 * back every `LEG` ticks) or standing still. The shooter's commands, events and snapshots ride NCW-3's TCP-like `Line`
 * each way (`./helpers/netMeasure`: in order, jitter bunches and never reorders -- the page's `?lag=` injector, which
 * reorders commands and events, is not used). The target's page has no delay. Each round is aimed at the target's chest
 * where the shooter's page draws it and names that page's `viewTick` (`NetClient.viewTick`).
 *
 * Per round the room's own class and rewind age are read where the room counts them (a spy on its private
 * `countRewind(p, class, age)`, called once a round -- NCW-1). Per cell: the share of on-screen hits (classes a + b)
 * lost to the cap, b / (a + b), and the median rewind age.
 *
 * The candidate ceilings: a cap of `INTERP_DELAY_MS` + a budget (200..400 ms). The review's F1: read EXACTLY, as each
 * round is decided -- a spy on the room's private `noteRewind` takes the round's own read-only probe (NCW-1's
 * `rewoundBodies` + `roundPath` walk with the bodies at a given tick, the first body struck; no damage, no event) and asks
 * it at each candidate's clamp, `at_C = max(tick - capTicks(C), min(tick, viewTick))`. A round lost to today's cap (b) is
 * recovered by C when the body first struck at its `viewTick` is the body first struck at `at_C` (one target here: the
 * same body). The earlier lower bound (recovered only when the whole age fits C) is printed beside it as a note. The
 * behind-cover cost: how far a low-ping victim running at full stick moves in the rewind time the candidate adds over
 * today's cap -- the run speed times (cap - `MAX_REWIND_MS`), the stated maximum -- and in the candidate's whole cap,
 * which leaves out the victim's own up-line delay and the body's width.
 *
 * The model has no aim error: every round is aimed where the page draws the target, so class d (struck only at the
 * clamped rewind) is not measured -- a larger cap could turn such rounds into misses, a cost this sweep cannot see.
 */

/** The caveat the controller asked to head the printed table (2026-11-05). */
const CAVEAT = "A model sweep on in-order lines, not a field share; the live share accrues from NCW-6's audit after it lands.";

/**
 * The run speed, units a second: `SEAL_LOCOMOTION`'s `seal_run` band's `maxVelocity` (`packages/scene/src/tuning.ts`,
 * `READERC.ZAR/motion.rdr` transcribed and pinned by its fixture test; W2.R2: 65 forward at full stick).
 */
const RUN_SPEED = SEAL_LOCOMOTION.find((b) => b.clip === 'seal_run')!.maxVelocity;

/** A flat floor, two spawn slots 100 units apart along z (`rewindOutcome.test.ts`'s map, copied, not imported). */
function map(): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: floor.modelName, path: `${floor.path}0`, first: 0, count: 1 }];
  const ground = packGround(params, [floor], owners);
  const slot = (side: 0 | 1, x: number, z: number): SpawnSlot => ({ side, index: 0, position: [x, 0, z], onFloor: true, step: 2, facing: [1, 0], loc: { map: 0, x: 0, z: 0 } });
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots: [slot(0, -300, 0), slot(1, -300, 100)], respawns: [], notes: [] };
}

/** `WalkMode` as the net client drives it (`rewindOutcome.test.ts`'s `PageWalk`, copied). */
class PageWalk implements NetWalk {
  sim: MoverSim | null = null;
  tap: ((cmd: Omit<Command, 'seq'>, feet: [number, number, number], facing?: readonly [number, number]) => void) | null = null;
  locked = true;
  private taps = 0;
  constructor(readonly grid: ReturnType<typeof groundGrid>) {}
  setNetTap(tap: typeof this.tap): void { this.tap = tap; this.taps = 0; }
  setLocked(on: boolean): void { this.locked = on; }
  respawn(at: readonly [number, number, number], yaw: number, replay: readonly Command[] = []): boolean {
    this.sim = new MoverSim(new Walker(this.grid), null);
    this.sim.walker.place(at[0], at[1] + probeLiftOf('stand'), at[2]);
    this.sim.walker.state.yaw = yaw;
    for (const c of replay) this.sim.apply(c);
    return true;
  }
  nudge(dx: number, dy: number, dz: number): void { const s = this.sim!.walker.state; s.x += dx; s.y += dy; s.z += dz; }
  nudgeFacing(dyaw: number, dpitch: number): void { const s = this.sim!.walker.state; s.yaw = wrapYaw(s.yaw + dyaw); s.pitch += dpitch; }
  play(input: Omit<Command, 'seq'>): void {
    const seq = ++this.taps;
    if (!this.sim || this.locked) { this.tap?.({ ...input, forward: 0, right: 0, buttons: input.buttons & Button.Action }, [0, 0, 0]); return; }
    const cmd = quantiseCommand({ ...input, seq });
    this.sim.apply(cmd);
    const s = this.sim.walker.state;
    this.tap?.(cmd, [s.x, s.y, s.z], [s.yaw, s.pitch]);
  }
}

/** A socket pair: the page's end (`WebSocketLike`) and the server's `Conn` (`rewindOutcome.test.ts`'s `pair`, copied). */
function pair(room: Room, id: number): (url: string) => WebSocketLike {
  return () => {
    const page: WebSocketLike = {
      binaryType: 'arraybuffer', readyState: 0, onopen: null, onclose: null, onmessage: null, onerror: null,
      send(data) {
        if (typeof data === 'string') {
          const ev = JSON.parse(data);
          if (ev.type === 'hello') room.hello(id, conn, ev);
          else room.text(id, ev);
        } else room.binary(id, data);
      },
      close() { room.leave(id); },
    };
    const conn = {
      send: (frame: Uint8Array | string) => page.onmessage?.({ data: typeof frame === 'string' ? frame : frame.slice().buffer }),
      close: () => page.onclose?.({ code: 1000, reason: '' }),
    };
    setTimeout(() => { page.readyState = 1; page.onopen?.({}); }, 0);
    return page;
  };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

/** Rounds a cell: one every `GAP` ticks, fewer than a rifle's magazine (no reload). */
const ROUNDS = 26;
const GAP = 12;
/** Ticks the strafing target runs one way before it turns back (NCW-1's strafe). */
const LEG = 45;

/**
 * One round as the room counted it: its class, its rewind age (ticks, the room's tick less its `viewTick`), and by each
 * candidate cap (ms) whether the body first struck at its `viewTick` is the body first struck at that cap's clamp.
 */
interface RoundRead { cls: RewindClass; age: number; byCap: Record<number, boolean> }

/**
 * One cell of the grid: the shooter's rounds read, behind `latency` ms each way with `jitter` ms (+-) on its lines. NCW-2
 * B-bound: `rttMs`, when given, is fed to the room as the server's heartbeat sweep feeds it (`Room.noteRoundTrip`, the
 * smoothed `pingExact` the per-seat cap reads) as soon as the shooter is seated -- the model of a heartbeat already
 * converged on the line's round trip (the server's first sample comes within `HEARTBEAT_MS`, 5 s, of the join, and the
 * first sample is taken whole, `smoothPing`); none, the room has no measure (today's cap, the floor).
 */
function cell(latency: number, jitter: number, strafing: boolean, rttMs?: number): RoundRead[] {
  vi.useRealTimers();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'], now: 1_000_000 });
  let seed = 11;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const m = map();
  const room = new Room(m, null, { now: () => Date.now(), random });
  const reads: RoundRead[] = [];
  // NCW-1's read of a round (`Room.noteRewind`, its probe) and its one count (`Room.countRewind`), read here; the room's
  // own calls run on unchanged. A single round's count follows its read synchronously (a rifle: no pull held open).
  type Probe = (tick: number) => number | null;
  const inner = room as unknown as {
    tick: number;
    noteRewind(p: { id: number }, viewTick: number, at: number, pull: unknown, ofVolley: boolean, atStruck: number[], probe: Probe): void;
    countRewind(p: { id: number }, cls: RewindClass, age: number): void;
  };
  const note = inner.noteRewind.bind(room), count = inner.countRewind.bind(room);
  let byCap: Record<number, boolean> | null = null;
  inner.noteRewind = (p, viewTick, at, pull, ofVolley, atStruck, probe) => {
    byCap = null;
    if (p.id === 1) {
      const tick = inner.tick, view = Math.min(tick, viewTick), first = probe(view);
      byCap = Object.fromEntries([MAX_REWIND_MS, ...CAPS_MS].map((c) => {
        const atC = Math.max(tick - Math.round((c / 1000) * TICK_HZ), view);
        return [c, first !== null && probe(atC) === first];
      }));
    }
    note(p, viewTick, at, pull, ofVolley, atStruck, probe);
  };
  inner.countRewind = (p, cls, age) => { if (p.id === 1) reads.push({ cls, age, byCap: byCap ?? {} }); count(p, cls, age); };
  const a = new PageWalk(m.grid), b = new PageWalk(m.grid);
  const up = new Line({ latencyMs: latency, jitterMs: jitter }, random), down = new Line({ latencyMs: latency, jitterMs: jitter }, random);
  const ca = new NetClient({ url: 'mem', map: 'MP99', name: 'Shooter', socket: (url) => lineSocket(pair(room, 1)(url), up, down) }, a);
  const cb = new NetClient({ url: 'mem', map: 'MP99', name: 'Target', socket: pair(room, 2) }, b);
  let look = { yaw: 0, pitch: 0 };
  let sent = 0, start = -1, teamed = false;
  let fed = rttMs === undefined;
  for (let t = 0; t < 60 * 14 && sent < ROUNDS; t++) {
    const pa = room.player(1), pb = room.player(2);
    if (!fed && pa) { room.noteRoundTrip(1, rttMs!); fed = true; }
    // One side, friendly fire off: the target is struck, never damaged, so every round meets it alive.
    if (!teamed && pa && pb) { pb.team = pa.team; teamed = true; }
    let byaw = 0;
    if (b.sim) {
      const s = b.sim.walker.state;
      const dir = Math.floor(t / LEG) % 2 === 0 ? 1 : -1;
      byaw = faceToward({ feet: [s.x, s.y, s.z], posture: b.sim.walker.posture }, [s.x + dir * 100, s.y, s.z]).yaw;
    }
    b.play({ forward: strafing ? 1 : 0, right: 0, yaw: byaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 });
    const drawn = a.sim && pa?.alive && pb?.alive ? ca.bodies().find((x) => x.id === 2) : undefined;
    if (drawn && start < 0) start = t + 60;
    const firing = drawn !== undefined && start >= 0 && t >= start && (t - start) % GAP === 0;
    if (drawn) {
      const sa = a.sim!.walker.state;
      look = faceToward({ feet: [sa.x, sa.y, sa.z], posture: a.sim!.walker.posture }, [drawn.feet[0], drawn.feet[1] + 12, drawn.feet[2]]);
    }
    a.play({ forward: 0, right: 0, yaw: look.yaw, pitch: look.pitch, turn: 0, buttons: 0, stance: 0, weapon: 0 });
    if (firing) {
      const sa = a.sim!.walker.state;
      const body = { feet: [sa.x, sa.y, sa.z], yaw: sa.yaw, pitch: sa.pitch, posture: a.sim!.walker.posture };
      const { eye } = cameraLook(body);
      const aim = [drawn!.feet[0], drawn!.feet[1] + 12, drawn!.feet[2]];
      const claim = centreClaim(body, [sa.x, sa.y + 15.4, sa.z], Math.hypot(aim[0]! - eye[0], aim[1]! - eye[1], aim[2]! - eye[2]));
      ca.send({ type: 'fire', seq: ca.lastSeq(), ...claim, weapon: 0, viewTick: ca.viewTick() });
      sent++;
    }
    room.step();
    vi.advanceTimersByTime(1000 / 60);
  }
  for (let t = 0; t < 60; t++) {
    b.play({ forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 });
    a.play({ forward: 0, right: 0, yaw: look.yaw, pitch: look.pitch, turn: 0, buttons: 0, stance: 0, weapon: 0 });
    room.step();
    vi.advanceTimersByTime(1000 / 60);
  }
  ca.close(); cb.close();
  return reads;
}

const median = (xs: readonly number[]): number => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
/** b / (a + b): the share of on-screen hits lost to the cap (NaN with no on-screen hit). */
const lostShare = (r: readonly RoundRead[]): number => {
  const a = r.filter((x) => x.cls === 'a').length, b = r.filter((x) => x.cls === 'b').length;
  return a + b ? b / (a + b) : NaN;
};
/** The share of the rounds lost to today's cap (b) the candidate `capMs` recovers: the same body struck at its clamp (exact). */
const recovered = (r: readonly RoundRead[], capMs: number): number => {
  const lost = r.filter((x) => x.cls === 'b');
  return lost.length ? lost.filter((x) => x.byCap[capMs] === true).length / lost.length : NaN;
};
/** The earlier lower bound (a note): recovered only when the whole rewind age fits `capTicks`. */
const recoveredBound = (r: readonly RoundRead[], capTicks: number): number => {
  const lost = r.filter((x) => x.cls === 'b');
  return lost.length ? lost.filter((x) => x.age <= capTicks).length / lost.length : NaN;
};
const countOf = (r: readonly RoundRead[], c: RewindClass): number => r.filter((x) => x.cls === c).length;
const pct = (v: number): string => (Number.isNaN(v) ? '-' : `${Math.round(v * 100)}%`);

const LATENCIES = [25, 50, 75, 100, 125, 150, 175, 200, 225, 250];
const JITTERS = [0, 30];
const BUDGETS = [200, 250, 300, 350, 400];
/** The candidate caps, ms: `INTERP_DELAY_MS` + each budget (300..500). */
const CAPS_MS = BUDGETS.map((b) => INTERP_DELAY_MS + b);
const RECOVER_AT = [100, 150, 200];

describe('LOW-9: the rewind-cap curve (a model sweep; measurement only)', () => {
  it('prints the lost share and the median age by latency, jitter and target, and the candidate ceilings re-read from the same rounds', () => {
    const grid = new Map<string, RoundRead[]>();
    const key = (l: number, j: number, s: boolean): string => `${l}/${j}/${s ? 'strafe' : 'still'}`;
    for (const s of [true, false]) for (const j of JITTERS) for (const l of LATENCIES) grid.set(key(l, j, s), cell(l, j, s));

    const todayTicks = Math.round((MAX_REWIND_MS / 1000) * TICK_HZ);
    const lines: string[] = [CAVEAT, ''];
    lines.push(`Today's cap: MAX_REWIND_MS ${MAX_REWIND_MS} ms = ${todayTicks} ticks (the page's interpolation INTERP_DELAY_MS ${INTERP_DELAY_MS} ms inside it).`);
    // The plateau, from the grid (the re-check: never a number the table can disagree with): the strafe cells at 150 ms and up.
    const plateau = LATENCIES.filter((l) => l >= 150).flatMap((l) => JITTERS.map((j) => lostShare(grid.get(key(l, j, true))!)));
    lines.push(`The strafe: full stick, turning back every LEG ${LEG} ticks; a round every GAP ${GAP} ticks, ${ROUNDS} a cell. The ${pct(Math.min(...plateau))}-${pct(Math.max(...plateau))} plateau of the strafing target (lost, 150 ms and up, both jitters) depends on that pattern (how often a round meets the turn).`);
    lines.push('The model has no aim error: class d (struck only at the clamped rewind) is not measured -- a bigger cap could turn such rounds into misses, a cost this sweep cannot see.');
    lines.push('Per cell: n = a + b (the rounds that hit where the shooter saw the target); lost = b / n; c, d, e the other classes; age = median rewind age, ticks.');
    lines.push('');
    lines.push(['one-way ms', 'jitter ms', 'target', 'n', 'lost', 'c', 'd', 'e', 'age'].join(' | '));
    for (const s2 of [true, false]) for (const j of JITTERS) for (const l of LATENCIES) {
      const r = grid.get(key(l, j, s2))!;
      lines.push([l, j, s2 ? 'strafe' : 'still', countOf(r, 'a') + countOf(r, 'b'), pct(lostShare(r)), countOf(r, 'c'), countOf(r, 'd'), countOf(r, 'e'), median(r.map((x) => x.age)).toFixed(1)].join(' | '));
    }
    lines.push('');
    lines.push(`Candidate caps = INTERP_DELAY_MS (${INTERP_DELAY_MS} ms) + budget. rec = share of today's lost rounds (b) of the strafing target that the candidate recovers, read EXACTLY at the candidate's clamp (the same body struck there); (lb) = the earlier lower bound, the whole age within the cap, a note.`);
    lines.push(`Behind cover, RUN_SPEED ${RUN_SPEED} u/s (SEAL_LOCOMOTION seal_run maxVelocity, scene/src/tuning.ts, motion.rdr), a low-ping victim at full stick: '+u' = run speed x (cap - today's ${MAX_REWIND_MS} ms), the stated maximum it adds; 'whole cap u' = run speed x the whole cap, EXCLUDING the victim's own up-line delay and the body's width.`);
    lines.push(['budget ms', 'cap ms', 'cap ticks', ...RECOVER_AT.flatMap((l) => JITTERS.map((j) => `rec ${l} ms j${j} (lb)`)), 'behind cover +u', 'whole cap u (excl. up-line, width)'].join(' | '));
    const candidates: { budget: number; capTicks: number; rec: Record<string, number>; extra: number }[] = [];
    for (const budget of BUDGETS) {
      const capMs = INTERP_DELAY_MS + budget, capTicks = Math.round((capMs / 1000) * TICK_HZ);
      const rec: Record<string, number> = {};
      const row = [String(budget), String(capMs), String(capTicks)];
      for (const l of RECOVER_AT) for (const j of JITTERS) {
        const r = grid.get(key(l, j, true))!;
        rec[`${l}/${j}`] = recovered(r, capMs);
        row.push(`${pct(rec[`${l}/${j}`]!)} (${pct(recoveredBound(r, capTicks))})`);
      }
      const extra = RUN_SPEED * Math.max(0, capMs - MAX_REWIND_MS) / 1000;
      row.push(extra.toFixed(1), (RUN_SPEED * capMs / 1000).toFixed(1));
      lines.push(row.join(' | '));
      candidates.push({ budget, capTicks, rec, extra });
    }
    console.log(lines.join('\n'));

    // Every round classed in each cell (26 a cell), none past the kept history at these latencies.
    for (const [k, r] of grid) {
      expect(r.length, `rounds at ${k}`).toBe(ROUNDS);
      expect(r.some((x) => x.cls === 'e'), `class e at ${k}`).toBe(false);
    }
    // Loose pins on today's numbers, so a change shows (not a specification).
    for (const j of JITTERS) {
      // The standing target is never lost to the cap.
      for (const l of LATENCIES) expect(grid.get(key(l, j, false))!.filter((x) => x.cls === 'b').length, `still, ${l} ms, j${j}`).toBe(0);
      // The strafing target: nothing lost at 25 ms; most of it lost at 250 ms.
      expect(lostShare(grid.get(key(25, j, true))!), `strafe 25 ms j${j}`).toBe(0);
      expect(lostShare(grid.get(key(250, j, true))!), `strafe 250 ms j${j}`).toBeGreaterThan(0.5);
      // The age grows with the line: a 25 ms step each way adds 50 ms of round trip, 3 ticks (27.5 over the nine steps).
      const age25 = median(grid.get(key(25, j, true))!.map((x) => x.age)), age250 = median(grid.get(key(250, j, true))!.map((x) => x.age));
      expect(age250 - age25, `age growth j${j}`).toBeGreaterThan(20);
      expect(age250 - age25, `age growth j${j}`).toBeLessThan(35);
    }
    // A larger budget never recovers less; the largest (400 ms beyond the interpolation) recovers every lost round at 100 ms.
    for (let i = 1; i < candidates.length; i++) for (const k of Object.keys(candidates[i]!.rec)) {
      const now = candidates[i]!.rec[k]!, before = candidates[i - 1]!.rec[k]!;
      if (!Number.isNaN(now) && !Number.isNaN(before)) expect(now).toBeGreaterThanOrEqual(before);
    }
    for (const j of JITTERS) expect(candidates.at(-1)!.rec[`100/${j}`]).toBe(1);
    // The spy's read at today's cap agrees with the room's own class, round by round (a: kept, b: lost) -- the hook reads
    // what the room reads.
    for (const [k, r] of grid) for (const x of r) if (x.cls === 'a' || x.cls === 'b') expect(x.byCap[MAX_REWIND_MS], `today's cap at ${k}`).toBe(x.cls === 'a');
    // The exact read is never below the earlier lower bound (a round whose whole age fits is read at its own viewTick).
    for (const c of candidates) for (const l of RECOVER_AT) for (const j of JITTERS) {
      const r = grid.get(key(l, j, true))!, exact = recovered(r, INTERP_DELAY_MS + c.budget), bound = recoveredBound(r, c.capTicks);
      if (!Number.isNaN(exact)) expect(exact, `${c.budget} at ${l} ms j${j}`).toBeGreaterThanOrEqual(bound);
    }
    expect(candidates.map((c) => c.extra)).toEqual(BUDGETS.map((b) => RUN_SPEED * (INTERP_DELAY_MS + b - MAX_REWIND_MS) / 1000));
  });
});

/**
 * NCW-2 B-bound (the owner's OT.R105, "400 is acceptable yes"): the same model, the room's own per-seat cap at work
 * (`rewindCapMs` of the seat's heartbeat round trip, fed as the server's sweep feeds it: the line's nominal round trip,
 * 2 x one-way). "Before" is the same cell with no measure, which B-bound leaves at today's 200 ms cap (the floor) --
 * the room's classes count both, no spy re-reads. Recovered = the share of the before's lost rounds (b) the after does
 * not lose, over the whole grid's on-screen hits (a + b). The behind-cover cost is the extra rewind the seat's cap adds
 * over today's (`rewindCapMs(rtt) - MAX_REWIND_MS`) times the run speed: how far a low-ping victim at full stick can be
 * hit behind the edge of cover by this shooter, the stated maximum (excluding the victim's own up-line delay and the
 * body's width).
 */
describe('NCW-2 B-bound: the per-seat cap, recovered share by latency (a model sweep)', () => {
  it('prints and asserts the lost share before and after at 100, 150 and 200 ms one way, the low-ping control, and the behind-cover cost', () => {
    const LAT = [25, 50, 100, 150, 200];
    const rows: { l: number; j: number; s: boolean; before: RoundRead[]; after: RoundRead[] }[] = [];
    for (const s of [true, false]) for (const j of JITTERS) for (const l of LAT) rows.push({ l, j, s, before: cell(l, j, s), after: cell(l, j, s, 2 * l) });
    const out: string[] = [CAVEAT, ''];
    out.push(`B-bound: cap(seat) = min(REWIND_CEILING_MS_ADAPTATION ${REWIND_CEILING_MS_ADAPTATION} ms, max(MAX_REWIND_MS ${MAX_REWIND_MS} ms, INTERP_DELAY_MS ${INTERP_DELAY_MS} + rtt + REWIND_LINE_ALLOWANCE_MS_ADAPTATION ${REWIND_LINE_ALLOWANCE_MS_ADAPTATION.toFixed(1)} ms)); the seat's rtt fed = 2 x one-way.`);
    out.push(['one-way ms', 'jitter ms', 'target', 'rtt fed', 'cap ms', 'cap ticks', 'n before', 'lost before', 'n after', 'lost after', 'recovered', 'age med after', 'behind cover +u'].join(' | '));
    for (const r of rows) {
      const capMs = rewindCapMs(2 * r.l), extra = RUN_SPEED * (capMs - MAX_REWIND_MS) / 1000;
      const bBefore = countOf(r.before, 'b'), bAfter = countOf(r.after, 'b');
      out.push([r.l, r.j, r.s ? 'strafe' : 'still', 2 * r.l, capMs.toFixed(1), rewindCapTicks(2 * r.l), countOf(r.before, 'a') + bBefore, pct(lostShare(r.before)),
        countOf(r.after, 'a') + bAfter, pct(lostShare(r.after)), bBefore ? pct((bBefore - bAfter) / bBefore) : '-', median(r.after.map((x) => x.age)).toFixed(1), extra.toFixed(1)].join(' | '));
    }
    out.push('');
    out.push(`Behind cover at the ceiling: RUN_SPEED ${RUN_SPEED} u/s x (${REWIND_CEILING_MS_ADAPTATION} - ${MAX_REWIND_MS}) ms = ${(RUN_SPEED * (REWIND_CEILING_MS_ADAPTATION - MAX_REWIND_MS) / 1000).toFixed(1)} units more than today, ${(RUN_SPEED * REWIND_CEILING_MS_ADAPTATION / 1000).toFixed(1)} units in the whole cap.`);
    console.log(out.join('\n'));

    const at = (l: number, j: number, s: boolean): (typeof rows)[number] => rows.find((r) => r.l === l && r.j === j && r.s === s)!;
    for (const r of rows) {
      expect(r.after.length, `rounds at ${r.l}/${r.j}`).toBe(ROUNDS);
      // The same aim, the same on-screen hits: the cap changes only which are scored.
      expect(countOf(r.after, 'a') + countOf(r.after, 'b'), `on-screen hits at ${r.l}/${r.j}/${r.s}`).toBe(countOf(r.before, 'a') + countOf(r.before, 'b'));
      // Never worse than today's cap.
      expect(countOf(r.after, 'b'), `lost after at ${r.l}/${r.j}/${r.s}`).toBeLessThanOrEqual(countOf(r.before, 'b'));
      // The standing target is never lost.
      if (!r.s) expect(countOf(r.after, 'b')).toBe(0);
    }
    for (const j of JITTERS) {
      // Today's cap loses most of the strafe's on-screen hits at 100, 150, 200 ms (NCW-1's 69% / 85% / 85%, no jitter).
      for (const l of [100, 150, 200]) expect(lostShare(at(l, j, true).before), `before ${l} j${j}`).toBeGreaterThan(0.5);
      // B-bound: every one recovered at 100 ms (the age, ~20 ticks, inside the seat's 21); fewer lost at 150 and 200 ms,
      // where the age (~26 and ~32 ticks) passes the ceiling's 24 and only what the clamp still strikes is kept.
      expect(lostShare(at(100, j, true).after), `after 100 j${j}`).toBe(0);
      for (const l of [150, 200]) expect(lostShare(at(l, j, true).after), `after ${l} j${j}`).toBeLessThan(lostShare(at(l, j, true).before));
      // The low-ping control: 25 ms one way (rtt 50, the cap at the floor, 200 ms) -- the same class, round by round.
      expect(at(25, j, true).after.map((x) => x.cls), `control 25 j${j}`).toEqual(at(25, j, true).before.map((x) => x.cls));
      expect(at(25, j, false).after.map((x) => x.cls), `control 25 still j${j}`).toEqual(at(25, j, false).before.map((x) => x.cls));
    }
    // Pinned (the model's exact answer, so a change shows): the strafe at 150 ms recovers every lost round, with no jitter
    // (the 2 ticks past the ceiling still strike) and with +-30 ms. At 200 ms 19 (no jitter) and 17 (+-30 ms) of 26 stay
    // lost: the ceiling binds. INV-SPECTATE fix A (2026-11-07) moved the jittered pins (were 5 and 18): the page's view
    // tick is now on the slewed playout clock (`viewer/src/net/playoutClock.ts`), set by the least-delayed arrivals, not
    // restarted at the newest, so under jitter a round's rewind age is about a tick shorter (the median at 150 ms +-30 ms
    // 26.3 -> 24.6 ticks) and fewer rounds pass the ceiling; the no-jitter cells are unchanged.
    expect(countOf(at(150, 0, true).after, 'b')).toBe(0);
    expect(countOf(at(150, 30, true).after, 'b')).toBe(0);
    expect(countOf(at(200, 0, true).after, 'b')).toBe(19);
    expect(countOf(at(200, 30, true).after, 'b')).toBe(17);
    // The cost, named: at the ceiling a low-ping victim can be struck up to 13 units further behind cover than today.
    expect(RUN_SPEED * (REWIND_CEILING_MS_ADAPTATION - MAX_REWIND_MS) / 1000).toBeCloseTo(13, 9);
  });
});
