import { afterEach, describe, expect, it, vi } from 'vitest';
import { INTERP_DELAY_MS, NetClient, type NetWalk, type WebSocketLike } from '../src/net/client';
import { TICK_HZ, type BodyState, type ServerEvent } from '../src/net/protocol';
import { encodeSnapshot } from '../src/net/codec';

/**
 * INV-SPECTATE (an instrument, product track; no game behaviour changes): why a followed body -- and the follow camera
 * rigidly placed on it (`matchNet.ts` `spectateFollow` -> `PlayerCamera`, FUN_00296f10's rig with no easing) -- moves
 * less smoothly than the page's own walk. The client alone, on an in-memory socket with a stubbed clock (the harness of
 * `netClientShownTick.test.ts`): a body moving at a constant speed, snapshots every second 60 Hz tick (`SNAPSHOT_HZ`),
 * their arrival times under four models, frames at 60 and 144 Hz drawn by `NetClient.bodies(now)`.
 *
 * The measure is the drawn body's *presentation time error*: where it is drawn, read back as the time a perfectly
 * smooth body would be there (x / V), minus the frame's time. A smooth picture keeps it constant (the interpolation
 * delay); its frame-to-frame step `dTau` is the judder, in milliseconds of motion, whatever the speed (a yaw turning at a
 * constant rate has the same `dTau`, `bodies()` lerping yaw as it lerps the feet). A frame is *starved* when `bodies()`
 * holds the newest snapshot (`viewTick()` at or past the newest tick heard -- since review A1's guard the playout clock
 * stops on the newest snapshot rather than running past it, so `shownTick() !== viewTick()` no longer tells it), *on arrival* when a snapshot arrived since the frame before (before
 * fix A the view clock restarted from the newest snapshot's arrival, so every big step fell on such a frame).
 *
 * Fix A (2026-11-07, product track): `viewTick` reads the slewed playout clock (`net/playoutClock.ts`); this file's
 * sketch of it is retired and the runs below measure the real client, which must hold `dTau` p99 under 1 ms under
 * the main-thread and TCP jitter models. `bursty-input` stays uneven: that is the room's own path (fix B, the owner's).
 *
 * The models (unit evidence, synthetic; the browser run's instrument is kept beside its report, `agent-mail/evidence/spectate-smoothness/instrument/`):
 * - `ideal`: every snapshot arrives exactly 33.3 ms after the one before;
 * - `main-thread`: each arrival waits 0-8 ms for the page's main thread (a message event runs between frames);
 * - `tcp-jitter`: a one-way delay of 30-80 ms, in order (TCP never reorders: a late frame holds the ones behind it);
 * - `bursty-input`: ideal arrivals, but the room ran the followed player's commands 0, 1 or 2 a tick (its credit,
 *   `room.ts` `run`) while the player's page sent them one a tick on average: the body's own server path uneven.
 */

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

afterEach(() => { vi.restoreAllMocks(); });

/** A seeded uniform [0, 1) (mulberry32), so every run measures the same stream. */
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

const TICK_MS = 1000 / TICK_HZ;
/** Units a tick: 1, so a tick's worth of motion is 1 unit and V = 60 units a second (the feet stay well inside i16 at 1/8). */
const V_PER_MS = 1 / TICK_MS;

type Model = 'ideal' | 'main-thread' | 'tcp-jitter' | 'bursty-input';

interface Run { model: Model; hz: number; frames: number; dTauRmsMs: number; dTauP99Ms: number; bigSteps: number; backward: number; starved: number; bigOnArrival: number }

/** The followed body's server path (its x at each tick) and each even tick's snapshot arrival on the page, under `model`. */
function stream(model: Model, seconds: number, seed: number): { xAt: number[]; arrivals: { at: number; tick: number }[] } {
  const r = rng(seed);
  // The server's path: the body's position at each tick. `bursty-input` runs 0, 1 or 2 commands a tick (15 % / 70 % /
  // 15 %), mean 1 -- the room's credit absorbing a page's uneven sends; every other model one a tick.
  const ticks = Math.ceil((seconds * 1000 + 1000) / TICK_MS);
  const xAt: number[] = [0];
  for (let k = 1; k <= ticks; k++) {
    const u = r();
    const ran = model === 'bursty-input' ? (u < 0.15 ? 0 : u < 0.85 ? 1 : 2) : 1;
    xAt.push(xAt[k - 1]! + ran);
  }
  const arrivals: { at: number; tick: number }[] = [];
  let lastAt = -Infinity;
  for (let k = 2; k <= ticks; k += 2) {
    const sent = k * TICK_MS;
    let at = sent + 40;                                          // a fixed one-way delay: irrelevant to smoothness alone
    if (model === 'main-thread') at += r() * 8;
    if (model === 'tcp-jitter') at = sent + 30 + r() * 50;
    at = Math.max(at, lastAt);                                   // in order
    lastAt = at;
    arrivals.push({ at, tick: k });
  }
  return { xAt, arrivals };
}

/**
 * Runs `seconds` of a body at constant speed through the client under `model`, frames at `hz`, and measures the drawn
 * body's presentation-time steps, drawn by `NetClient.bodies(now)`. `bigMs`: a step past it counts as a visible jerk
 * (a quarter of a 60 Hz frame).
 */
function measure(model: Model, hz: number, seconds = 20, bigMs = 4, seed = 11): Run {
  const { c, snap, clock: stub } = client();
  const { xAt, arrivals } = stream(model, seconds, seed);
  const period = 1000 / hz;
  const out: { tau: number; arrived: boolean; starved: boolean }[] = [];
  let next = 0, newest = -Infinity;
  for (let now = 1000 + 0.37; now < seconds * 1000; now += period) {
    let arrived = false;
    while (next < arrivals.length && arrivals[next]!.at <= now) {
      const a = arrivals[next]!;
      stub.now = a.at;
      snap(a.tick, xAt[a.tick]!);
      newest = Math.max(newest, a.tick);
      next++;
      arrived = true;
    }
    stub.now = now;
    const x = c.bodies()[0]!.feet[0]!;
    const starved = c.viewTick() >= newest - 1e-9;
    // For `bursty-input` the smooth reference is the mean path (1 unit a tick); the server's own path is the uneven one.
    out.push({ tau: x / V_PER_MS - now, arrived, starved });
  }
  const steps: number[] = [];
  let bigSteps = 0, backward = 0, starved = 0, bigOnArrival = 0;
  for (let i = 1; i < out.length; i++) {
    const d = out[i]!.tau - out[i - 1]!.tau;
    steps.push(d);
    if (Math.abs(d) > bigMs) { bigSteps++; if (out[i]!.arrived) bigOnArrival++; }
    if (d + period < -1e-6) backward++;                          // drawn behind where it stood a frame ago
    if (out[i]!.starved) starved++;
  }
  const sorted = steps.map(Math.abs).sort((a, b) => a - b);
  return {
    model, hz, frames: steps.length,
    dTauRmsMs: Math.sqrt(steps.reduce((s, d) => s + d * d, 0) / steps.length),
    dTauP99Ms: sorted[Math.floor(sorted.length * 0.99)]!,
    bigSteps, backward, starved, bigOnArrival,
  };
}

describe('INV-SPECTATE: the followed body as `NetClient.bodies()` draws it (an instrument)', () => {
  const runs: Run[] = [];
  for (const hz of [60, 144]) {
    for (const model of ['ideal', 'main-thread', 'tcp-jitter', 'bursty-input'] as const) {
      it(`${model} at ${hz} Hz`, () => {
        const run = measure(model, hz);
        runs.push(run);
        expect(run.starved).toBe(0);
        if (model === 'ideal') {
          // Constant speed, regular arrivals: the lerp is exact -- the 30 Hz segments alone make no judder (suspect 1).
          expect(run.dTauRmsMs).toBeLessThan(0.05);
        } else if (model === 'bursty-input') {
          // The room's own uneven path (suspect 6): no clock smooths it (fix B, the owner's call).
          expect(run.dTauRmsMs).toBeGreaterThan(0.5);
        } else {
          // Fix A: arrival jitter no longer reaches the picture -- no step on arrival, none backward.
          expect(run.dTauP99Ms).toBeLessThan(1);
          expect(run.backward).toBe(0);
          expect(run.bigOnArrival).toBe(0);
        }
      });
    }
  }
  it('prints the table', () => {
    // eslint-disable-next-line no-console
    console.log(['model              Hz  frames  dTau rms ms  dTau p99 ms  >4ms steps  on arrival  backward  starved',
      ...runs.map((r) => `${r.model.padEnd(18)} ${String(r.hz).padStart(3)} ${String(r.frames).padStart(7)} ${r.dTauRmsMs.toFixed(2).padStart(12)} ${r.dTauP99Ms.toFixed(2).padStart(12)} ${String(r.bigSteps).padStart(11)} ${String(r.bigOnArrival).padStart(11)} ${String(r.backward).padStart(9)} ${String(r.starved).padStart(8)}`),
      `(INTERP_DELAY_MS ${INTERP_DELAY_MS})`].join('\n'));
    expect(runs.length).toBe(8);
  });
});
