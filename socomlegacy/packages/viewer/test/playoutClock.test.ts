import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PlayoutClock, PLAYOUT_SLEW_ADAPTATION, PLAYOUT_SNAP_MS_ADAPTATION, PLAYOUT_WINDOW_MS_ADAPTATION,
} from '../src/net/playoutClock';
import { INTERP_DELAY_MS, NetClient, type NetWalk, type WebSocketLike } from '../src/net/client';
import { TICK_HZ, type BodyState, type ServerEvent } from '../src/net/protocol';
import { encodeSnapshot } from '../src/net/codec';

/**
 * INV-SPECTATE fix A (product track, the netcode lane; a browser adaptation with no original -- the port's own netcode):
 * the page's playout clock for remote bodies (`net/playoutClock.ts`). `NetClient.serverTick` restarts from the newest
 * snapshot's arrival, so the drawn time jumped at every arrival by 33.3 ms less the arrival's own interval (backward
 * for a late one); the playout clock runs at the frame's pace and is slewed toward the least-delayed arrivals' offset,
 * never re-anchored, snapping only past `PLAYOUT_SNAP_MS_ADAPTATION`. `viewTick` (what `bodies()` and `shownTick`
 * draw and name, what the room's rewind is asked for) reads it. Unit tests, synthetic arrivals, a stubbed clock.
 */

const TICK_MS = 1000 / TICK_HZ;
const DELAY_TICKS = (INTERP_DELAY_MS / 1000) * TICK_HZ;

afterEach(() => { vi.restoreAllMocks(); });

describe('PlayoutClock: the constants (adaptations, the port\'s own)', () => {
  it('a one-second floor window, a 5 % slew, a 250 ms snap', () => {
    expect(PLAYOUT_WINDOW_MS_ADAPTATION).toBe(1000);
    expect(PLAYOUT_SLEW_ADAPTATION).toBe(0.05);
    expect(PLAYOUT_SNAP_MS_ADAPTATION).toBe(250);
  });
});

describe('PlayoutClock alone', () => {
  it('reads 0 before an arrival (as `serverTick` with no snapshot)', () => {
    expect(new PlayoutClock().tick(5000)).toBe(0);
  });

  it('ideal arrivals: exactly the re-anchored clock (tick + time since the newest arrival)', () => {
    const p = new PlayoutClock();
    let newest = { at: 0, tick: 0 };
    for (let k = 2, now = 1000; k < 600; k += 2) {
      const at = 1000 + 40 + k * TICK_MS;
      while (now < at) {
        if (newest.at) expect(p.tick(now)).toBeCloseTo(newest.tick + (now - newest.at) / TICK_MS, 9);
        now += 1000 / 144;
      }
      p.hear(at, k);
      newest = { at, tick: k };
    }
  });

  it('a +100 ms latency step converges with no backward frame, in at most 100 ms / 5 % past the first late arrival', () => {
    const p = new PlayoutClock();
    let prev = -Infinity, k = 2, now = 0, newest = -Infinity;
    const frame = 1000 / 60;
    const stepAt = 5000;
    const late = (tick: number): number => tick * TICK_MS + 40 + (tick * TICK_MS >= stepAt ? 100 : 0);
    let converged: number | null = null;
    for (; now < 12000; now += frame) {
      while (late(k) <= now) { p.hear(late(k), k); newest = k; k += 2; }
      if (k === 2) continue;                                   // nothing heard yet
      const t = p.tick(now);
      expect(t, `frame at ${now.toFixed(1)} ms`).toBeGreaterThanOrEqual(prev);
      // Monotone at a rate within the slew: each frame advances 95-105 % of a frame's ticks -- slower only where the
      // starvation guard holds the drawn tick (`t` less the delay) on the newest snapshot, the step's first late one.
      if (prev > -Infinity) {
        if (t - DELAY_TICKS < newest - 1e-9) expect(t - prev).toBeGreaterThanOrEqual((frame / TICK_MS) * (1 - PLAYOUT_SLEW_ADAPTATION) - 1e-9);
        expect(t - prev).toBeLessThanOrEqual((frame / TICK_MS) * (1 + PLAYOUT_SLEW_ADAPTATION) + 1e-9);
      }
      prev = t;
      const settled = (now - 140) / TICK_MS;                 // the new offset's clock
      if (now > stepAt && converged === null && Math.abs(t - settled) < 1e-6) converged = now;
    }
    expect(converged).not.toBeNull();
    // The first late arrival (140 ms after the step) drops the stale floor at once (review A1's guard); the guard has
    // already taken up a third of the 100 ms, the rest at 5 %: within 140 ms + 100 ms / 5 %, not the window first.
    expect(converged! - stepAt).toBeLessThanOrEqual(140 + 100 / PLAYOUT_SLEW_ADAPTATION + 2 * frame);
  });

  it('a -100 ms latency step (the line got faster) converges forward, no backward frame', () => {
    const p = new PlayoutClock();
    let prev = -Infinity, k = 2;
    const late = (tick: number): number => tick * TICK_MS + (tick * TICK_MS >= 5000 ? 40 : 140);
    for (let now = 0; now < 9000; now += 1000 / 60) {
      while (late(k) <= now) { p.hear(late(k), k); k += 2; }
      const t = p.tick(now);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
    expect(prev).toBeCloseTo((9000 - 1000 / 60 - 40) / TICK_MS, 0);
  });

  it('a stall that recovers (a 400 ms hole, the backlog then drained) never snaps and never steps back', () => {
    const p = new PlayoutClock();
    let prev = -Infinity, k = 2;
    // Every send between 3000 and 3400 ms is held to 3440 (TCP: delivered in order at the stall's end).
    const late = (tick: number): number => { const s = tick * TICK_MS; return s >= 3000 && s < 3400 ? 3440 : s + 40; };
    for (let now = 0; now < 6000; now += 1000 / 60) {
      while (late(k) <= now) { p.hear(late(k), k); k += 2; }
      const t = p.tick(now);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });

  it('a lasting shift past 250 ms (a stall the line never recovers): the guard holds, no backward frame, then the new offset', () => {
    // Was (ac3ddfe95): one snap back by the shift, a second after it (the stale floor). The guard holds the drawn tick on
    // the newest snapshot until the late one comes and drops the stale floor; the offset then slews the rest at 5 %.
    const p = new PlayoutClock();
    let prev = -Infinity, k = 2, backs = 0;
    const late = (tick: number): number => tick * TICK_MS + 40 + (tick * TICK_MS >= 3000 ? 400 : 0);
    for (let now = 0; now < 8000; now += 1000 / 60) {
      while (late(k) <= now) { p.hear(late(k), k); k += 2; }
      const t = p.tick(now);
      if (t < prev - 1e-9) backs++;
      prev = t;
    }
    expect(backs).toBe(0);
    expect(prev).toBeCloseTo((8000 - 1000 / 60 - 440) / TICK_MS, 6);   // on the new offset
  });

  it('a -300 ms step (the line got faster past the snap) snaps forward, never back, and the stall is held on the newest', () => {
    const p = new PlayoutClock();
    let prev = -Infinity, k = 2, jumps = 0, held = 0, newest = -Infinity;
    // A stall from 1000 ms holds every send to 3440 (the line's floor then 340), and the line comes back at 40 at 5000.
    const late = (tick: number): number => { const s = tick * TICK_MS; return s < 1000 || s >= 5000 ? s + 40 : Math.max(3440, s + 340); };
    for (let now = 0; now < 9000; now += 1000 / 60) {
      while (late(k) <= now) { p.hear(late(k), k); newest = k; k += 2; }
      if (newest < 0) continue;                                          // nothing heard yet
      const t = p.tick(now);
      expect(t).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(t - DELAY_TICKS).toBeLessThanOrEqual(newest + 1e-9);         // the guard: never past the newest
      if (t - DELAY_TICKS >= newest - 1e-9) held++;
      if (prev > -Infinity && t - prev > 2 * (1000 / 60) / TICK_MS) jumps++;
      prev = t;
    }
    // Two forward snaps: at the stall's end (the backlog's floor 2 s before the guard-held offset; the re-anchored clock
    // jumps there too), and when the line comes back 300 ms faster.
    expect(jumps).toBe(2);
    expect(held).toBeGreaterThan(100);                                   // the stall itself: 2.4 s with nothing new
    expect(prev).toBeCloseTo((9000 - 1000 / 60 - 40) / TICK_MS, 6);
  });

  it('a room whose ticks restart on the same socket is followed at once: never past the newest, settled within the delay', () => {
    const p = new PlayoutClock();
    let k = 2, newest = -Infinity;
    // Ticks 2..~300 from 0 ms, then a new count from 2 at 5000 ms (each 40 ms one way).
    const arrivals: { at: number; tick: number }[] = [];
    for (; k * TICK_MS < 5000; k += 2) arrivals.push({ at: k * TICK_MS + 40, tick: k });
    for (let j = 2; 5000 + j * TICK_MS < 8000; j += 2) arrivals.push({ at: 5000 + j * TICK_MS + 40, tick: j });
    let next = 0, settledAt: number | null = null;
    for (let now = 0; now < 8000; now += 1000 / 60) {
      while (next < arrivals.length && arrivals[next]!.at <= now) { p.hear(arrivals[next]!.at, arrivals[next]!.tick); newest = arrivals[next]!.tick; next++; }
      if (newest < 0) continue;
      const t = p.tick(now);
      expect(t - DELAY_TICKS, `${now.toFixed(1)} ms`).toBeLessThanOrEqual(newest + 1e-9);
      if (now > 5000 && settledAt === null && Math.abs(t - (now - 5040) / TICK_MS) < 1e-6) settledAt = now;
    }
    expect(settledAt).not.toBeNull();
    expect(settledAt! - 5040).toBeLessThanOrEqual(INTERP_DELAY_MS + 1000 / 60);
  });

  it('a call at an earlier time (a frame stamp behind the last read) moves nothing: one offset a frame', () => {
    const p = new PlayoutClock();
    p.hear(1000, 0); p.hear(1040, 0);                                   // a late duplicate: the floor stays 1000
    const a = p.tick(1100), b = p.tick(1050), c = p.tick(1100);
    expect(a).toBeCloseTo(100 / TICK_MS, 9);
    expect(b).toBeCloseTo(50 / TICK_MS, 9);
    expect(c).toBe(a);
  });
});

const IDLE: NetWalk = { setNetTap: () => undefined, respawn: () => true, nudge: () => undefined, setLocked: () => undefined, setDead: () => undefined };

function body(id: number, x: number): BodyState {
  return {
    id, feet: [x, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, flags: 0, stance: 0, landing: 0, jumps: 0, ground: 0,
    groundForward: 0, groundRight: 0, groundCls: -1, action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
    overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0, trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0,
    travBlendWeight: 0, peek: 0, weapon: 0, slot: 0,
  };
}

function client(): { c: NetClient; snap(tick: number, x: number): void; clock: { now: number } } {
  const clock = { now: 0 };
  vi.spyOn(performance, 'now').mockImplementation(() => clock.now);
  const socket: WebSocketLike = {
    binaryType: 'blob', readyState: 1, send: () => undefined, close: () => undefined,
    onopen: null, onclose: null, onmessage: null, onerror: null,
  };
  const c = new NetClient({ url: 'mem', map: 'SYN', name: 'A', socket: () => socket, watch: true }, IDLE);
  socket.onopen?.({});
  socket.onmessage?.({ data: JSON.stringify({ type: 'welcome', id: 3, version: 11, map: 'SYN', tick: 0, role: 'spectator', team: null, queue: 0, epoch: 0, env: { revision: 0, epoch: 0, states: [] } } as unknown as ServerEvent) });
  return { c, clock, snap: (tick, x) => { socket.onmessage?.({ data: encodeSnapshot({ tick, own: null, bodies: [body(7, x)] }) }); } };
}

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

describe('NetClient on the playout clock', () => {
  it('ideal arrivals: viewTick is the re-anchored clock less the interpolation delay, as before', () => {
    const { c, snap, clock } = client();
    let newest: { at: number; tick: number } | null = null;
    let k = 2;
    for (let now = 1000; now < 6000; now += 1000 / 60) {
      while (1040 + k * TICK_MS <= now) { clock.now = 1040 + k * TICK_MS; snap(k, k); newest = { at: clock.now, tick: k }; k += 2; }
      clock.now = now;
      if (!newest) continue;
      expect(c.viewTick()).toBeCloseTo(Math.max(0, newest.tick + (now - newest.at) / TICK_MS - DELAY_TICKS), 9);
      expect(c.serverTick()).toBeCloseTo(newest.tick + (now - newest.at) / TICK_MS, 9);
    }
  });

  it('serverTick keeps its meaning (re-anchored at the newest arrival: the bomb page\'s and the replay\'s clock)', () => {
    const { c, snap, clock } = client();
    clock.now = 1000; snap(10, 10);
    clock.now = 1050; snap(12, 12);                                     // 17 ms late
    clock.now = 1060;
    expect(c.serverTick()).toBeCloseTo(12 + 10 / TICK_MS, 9);
    expect(c.viewTick()).toBeCloseTo(10 + 60 / TICK_MS - DELAY_TICKS, 9);   // the floor: tick 10's arrival
  });

  it('under 30-80 ms jitter: the shown tick names the picture drawn at every frame, and never runs past viewTick', () => {
    const { c, snap, clock } = client();
    const r = rng(5);
    const arrivals: { at: number; tick: number }[] = [];
    let last = -Infinity;
    for (let k = 2; k < 600; k += 2) { last = Math.max(last, k * TICK_MS + 30 + r() * 50); arrivals.push({ at: last, tick: k }); }
    let next = 0, frames = 0;
    for (let now = 500; now < 9000; now += 1000 / 60) {
      while (next < arrivals.length && arrivals[next]!.at <= now) { clock.now = arrivals[next]!.at; snap(arrivals[next]!.tick, arrivals[next]!.tick * 4); next++; }
      clock.now = now;
      const shown = c.shownTick();
      if (shown === null || now < 1500) continue;            // past the join's first snapshots
      frames++;
      // The body moves 4 units a tick on every snapshot, so the picture's tick is its x / 4.
      expect(c.bodies()[0]!.feet[0] / 4).toBeCloseTo(shown, 6);
      expect(shown).toBeLessThanOrEqual(c.viewTick() + 1e-9);
    }
    expect(frames).toBeGreaterThan(400);
  });
});

/**
 * Review A1 (2026-11-07): starvation -- the time a run's frames hold the newest snapshot, `viewTick` at or past it
 * (`drawnAt` holds `newer`: the body steps at each arrival, no interpolation). The re-anchored clock (`serverTick` less
 * the delay, read from the same client) holds only while an arrival is more than `INTERP_DELAY_MS` overdue; the slewed
 * clock of ac3ddfe95 aimed at the least-delayed arrival of the last second and moved 5 %, so after a lasting rise of the
 * line (a latency step, or a room hitch: `ServerLoop` runs at most 5 catch-up steps and drops the rest, so a hitch of H
 * moves the tick timeline by about H less 83 ms for good) it ran past the newest snapshot for seconds. The guard holds it
 * to the re-anchored clock's held time, plus one frame, with no backward frame.
 */
const FRAME_MS = 1000 / 60;

/** Even ticks' arrivals (40 ms one way) with every send from `stepAt` on `step` ms later (a lasting latency rise). */
function stepArrivals(endMs: number, step: number, stepAt = 5000): { at: number; tick: number }[] {
  const out: { at: number; tick: number }[] = [];
  for (let k = 2; k * TICK_MS < endMs; k += 2) out.push({ tick: k, at: k * TICK_MS + 40 + (k * TICK_MS >= stepAt ? step : 0) });
  return out;
}

/**
 * Even ticks' arrivals (40 ms one way) from the room's loop as `match/test/helpers/netMeasure.ts` `ServerLoop` runs it: a
 * step of `hitchMs` every `everyMs` from `everyMs` (its snapshot leaves at its end), then at most 5 catch-up steps at
 * once, the rest of the periods dropped.
 */
function hitchArrivals(endMs: number, hitchMs: number, everyMs = 3000): { at: number; tick: number }[] {
  const out: { at: number; tick: number }[] = [];
  let next = 0, tick = 0, hitches = 0, now = 0;
  while (now < endMs) {
    if (next <= now && everyMs + hitches * everyMs <= now) {
      hitches++; now += hitchMs; tick++; out.push({ tick, at: now + 40 }); next += TICK_MS;
      continue;
    }
    for (let s = 0; next <= now && s < 5; s++) { tick++; out.push({ tick, at: now + 40 }); next += TICK_MS; }
    if (next < now - TICK_MS * 5) next = now;
    now = Math.max(next, now);
  }
  return out.filter((a) => a.tick % 2 === 0);
}

/** Runs the arrivals through a client, frames at 60 Hz: the held time on the playout clock and on the re-anchored one. */
function starvation(arrivals: { at: number; tick: number }[], endMs: number): { heldMs: number; oldHeldMs: number; backward: number } {
  const { c, snap, clock } = client();
  let next = 0, newest = -Infinity, held = 0, oldHeld = 0, backward = 0, prev = -Infinity;
  for (let now = 1000 + 0.37; now < endMs; now += FRAME_MS) {
    while (next < arrivals.length && arrivals[next]!.at <= now) {
      clock.now = arrivals[next]!.at; snap(arrivals[next]!.tick, arrivals[next]!.tick); newest = Math.max(newest, arrivals[next]!.tick); next++;
    }
    clock.now = now;
    const v = c.viewTick();
    if (v < prev - 1e-9) backward++;
    prev = v;
    if (v >= newest - 1e-9) held++;
    if (c.serverTick() - DELAY_TICKS >= newest - 1e-9) oldHeld++;
  }
  return { heldMs: held * FRAME_MS, oldHeldMs: oldHeld * FRAME_MS, backward };
}

describe('PlayoutClock: starvation after a lasting rise of the line (review A1)', () => {
  const END = 16000;
  const rows: string[] = [];
  const cases: [string, { at: number; tick: number }[]][] = [
    ...[100, 150, 200, 240].map((s): [string, { at: number; tick: number }[]] => [`latency +${s} ms at 5 s`, stepArrivals(END, s)]),
    ...[260, 500, 800].map((h): [string, { at: number; tick: number }[]] => [`a ${h} ms hitch every 3 s`, hitchArrivals(END, h)]),
  ];
  for (const [name, arrivals] of cases) {
    it(`${name}: held no longer than the re-anchored clock plus one frame, never backward`, () => {
      const r = starvation(arrivals, END);
      rows.push(`${name.padEnd(26)} ${r.oldHeldMs.toFixed(0).padStart(8)} ${r.heldMs.toFixed(0).padStart(8)}`);
      expect(r.heldMs).toBeLessThanOrEqual(r.oldHeldMs + FRAME_MS + 1e-6);
      expect(r.backward).toBe(0);
    });
  }
  it('prints the table', () => {
    // eslint-disable-next-line no-console
    console.log([`starvation over ${END / 1000 - 1} s at 60 Hz, ms held   re-anchored  playout`, ...rows].join('\n'));
    expect(rows.length).toBe(cases.length);
  });
});

describe('PlayoutClock: a snap back is measured from the guarded position (re-review finding 1, 2026-11-07)', () => {
  it('a lasting rise heard across one long frame never steps the view tick back (swept: rise 250-450 ms, the long frame 150-300 ms)', () => {
    const T = 1000 / TICK_HZ;
    let worst = 0;
    for (const pause of [0, 100]) for (let rise = 250; rise <= 450; rise += 25) for (let lastRead = 1100; lastRead < 1400; lastRead += 7) for (let gap = 150; gap <= 300; gap += 25) {
      const p = new PlayoutClock();
      const arr: { tick: number; at: number }[] = [];
      for (let k = 2; k * T < 3000; k += 2) {
        const sent = k * T;
        arr.push({ tick: k, at: sent < 1000 ? sent + 40 : sent < 1000 + pause ? 1000 + pause + 40 + rise : sent + 40 + rise });
      }
      for (let j = 1; j < arr.length; j++) arr[j]!.at = Math.max(arr[j]!.at, arr[j - 1]!.at);
      const reads: number[] = [];
      for (let t = 0.5; t < lastRead; t += T) reads.push(t);
      reads.push(lastRead);
      for (let t = lastRead + gap; t < 3000; t += T) reads.push(t);
      let j = 0, prev = -Infinity;
      for (const now of reads) {
        while (j < arr.length && arr[j]!.at <= now) { p.hear(arr[j]!.at, arr[j]!.tick); j++; }
        const v = p.tick(now);
        if (prev - v > worst) worst = prev - v;
        prev = v;
      }
    }
    expect(worst).toBe(0);
  });
});
