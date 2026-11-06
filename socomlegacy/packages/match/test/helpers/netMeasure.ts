import { encodeSnapshot } from '../../../viewer/src/net/codec';
import { NetClient, type NetWalk, type WebSocketLike } from '../../../viewer/src/net/client';
import { PROTOCOL_VERSION, TICK_HZ, type Snapshot } from '../../../viewer/src/net/protocol';

/**
 * NCW-3 (the netcode wave's Case A measure, `docs/plans/2026-11-05-netcode-wave.md` sections 1 and 5): a test
 * instrument, product track -- it measures and changes nothing the game does. What a player calls rubber banding, put in
 * numbers:
 *
 * - **the dash ratio**: the largest per-frame horizontal step of a watched body as a watcher's page draws it (the page's
 *   own `NetClient.bodies()` interpolation, sampled on a 60 fps frame clock), over the body's run speed times the frame's
 *   time -- 1 is a body drawn running, 10 a body drawn covering ten frames of running in one;
 * - **the held time**: the longest stretch the drawn body stands still while its player is commanding movement;
 * - **the own corrections**: the mover's page's corrections (`NetClient.corrections`, its count and largest) and their
 *   total -- the distance the corrections moved the page's mover (`NetWalk.nudge`, a snap at once and a smoothing in its
 *   steps), what the player sees pulled back.
 *
 * The delivery models (`Line`, `ServerLoop`) are the test rig's network and the server's clock, faithful as a test can
 * hold them: a TCP line (in order, a stall holds every later frame -- head-of-line blocking, nothing reordered), and the
 * match server's 60 Hz loop with its catch-up rule (`ServerLoop`). Nothing here imports vitest: `tools/mp-bots.ts` takes
 * `Line` and `lineSocket` for its `--stall-ms`, and the frame metrics.
 */

export type V3 = readonly [number, number, number];

/** The horizontal step between two drawn positions (the run is horizontal; a fall or a landing is not a dash). */
function flatStep(a: V3, b: V3): number {
  return Math.hypot(b[0] - a[0], b[2] - a[2]);
}

/**
 * The dash ratio of a drawn track (one position a frame, null where the body was not drawn): the largest step between
 * two consecutive drawn frames over `runSpeed` (units a second) times the frame's time. 0 for a track with no step.
 */
export function dashRatio(track: readonly (V3 | null)[], runSpeed: number, frameMs: number): number {
  const unit = runSpeed * frameMs / 1000;
  let most = 0;
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1], b = track[i];
    if (a && b) most = Math.max(most, flatStep(a, b) / unit);
  }
  return most;
}

/**
 * The held time of a drawn track: the longest run of consecutive frames, ms, whose step from the frame before is no more
 * than `still` units while `commanding[i]` holds (the mover is commanding movement at frame i). A frame not drawn, or
 * not commanding, ends a run.
 */
export function heldMs(track: readonly (V3 | null)[], commanding: readonly boolean[], frameMs: number, still = 0.01): number {
  let run = 0, most = 0;
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1], b = track[i];
    if (a && b && commanding[i] && flatStep(a, b) <= still) { run++; most = Math.max(most, run); }
    else run = 0;
  }
  return most * frameMs;
}

/**
 * The same two measures on a real clock (`tools/mp-bots.ts`: its frames are its loop's callbacks, not a fixed 1/60 s):
 * each watcher's drawn position of each body, sampled with the time it was drawn at. A step is taken over its frame's
 * own time (`fastest`, units a second; the dash ratio over the run speed at the report). A hold is the test rig's rule
 * (`netcode.test.ts` NCW-3: from the first frame the drawn body moves): a stretch of `commanding` frames counts its still
 * frames only once the drawn body has moved in it -- so a start from rest, drawn behind the stick, is no hold -- and a
 * frame not commanding ends the stretch. What "commanding" is, is the caller's (`tools/mp-bots.ts`: the body's bot's OWN
 * walker moved at the watcher's drawn tick, `OwnTrail.movedAt` -- a room freeze counts, a push into a wall does not). A second sample at the same time is the same frame; a body not drawn (`null`:
 * gone, dead, just respawned) is forgotten, so its next drawing is no step.
 */
export class DrawWatch {
  private readonly last = new Map<string, { feet: V3; at: number; held: number; moved: boolean }>();
  /** The fastest drawn step, units a second, and the longest hold, ms. */
  fastest = 0; heldMs = 0;
  sample(watcher: number, id: number, feet: V3 | null, now: number, commanding: boolean, still = 0.01): void {
    const key = `${watcher}:${id}`;
    if (!feet) { this.last.delete(key); return; }
    const was = this.last.get(key);
    if (!was) { this.last.set(key, { feet, at: now, held: 0, moved: false }); return; }
    const dt = now - was.at;
    if (dt <= 0) return;
    const step = flatStep(was.feet, feet);
    this.fastest = Math.max(this.fastest, step / dt * 1000);
    const moving = step > still;
    const moved = commanding && (was.moved || moving);
    const held = commanding && !moving && was.moved ? was.held + dt : 0;
    this.heldMs = Math.max(this.heldMs, held);
    this.last.set(key, { feet, at: now, held, moved });
  }
  /** The fastest drawn step over `runSpeed` (units a second); 0 without a run speed. */
  dashRatio(runSpeed: number): number { return runSpeed > 0 ? this.fastest / runSpeed : 0; }
}

/**
 * The step back of an `OwnTrail` key that is a new clock, not jitter (a test instrument's bound, no original): 60 ticks,
 * a second -- far past a jittered arrival (a line's jitter, tens of ms) or a round trip's change between two pings, and
 * short of a reconnect's or a new room's clock, which steps back by the whole session.
 */
export const OWN_TRAIL_RESET_TICKS = 60;

/**
 * The re-check's F1: whether a body's OWN walker (its player's predicted mover) moved at a given room tick -- the
 * "commanding" a live hold is judged by. A room freeze counts (the own walker ran on, the room's copy stood); a push
 * into a wall does not (the own walker stood too: the walker's velocity is the stick's and is not zeroed at a wall,
 * `mover.ts` `move`, so the room's snapshot velocity cannot tell the two apart). A ring of (key, position), the key the
 * room tick the position's command runs at (the caller's estimate); `movedAt(k, span)` compares the positions at or
 * before `k` and `k - span` horizontally against the walker's own still bound, 20 units a second (`mover.ts`
 * `vx * vx + vz * vz + vy * vy <= 400`) over the span. False with nothing recorded at or before either key.
 */
export class OwnTrail {
  private readonly ring: { key: number; pos: V3 }[] = [];
  constructor(private readonly size = 600) {}
  /**
   * The key is kept monotonic: `serverTick + rtt` steps back by a tick or two at an uneven snapshot arrival (the page's
   * server clock restarts at each one, `client.ts` `serverTick`) or a smaller round trip read at the next ping, and such a
   * key is taken at the newest key. Only a step back past `OWN_TRAIL_RESET_TICKS` (a new clock: a reconnect, a new room)
   * starts the trail again.
   */
  record(key: number, pos: V3): void {
    const last = this.ring[this.ring.length - 1];
    if (last && key < last.key - OWN_TRAIL_RESET_TICKS) this.ring.length = 0;
    else if (last && key < last.key) key = last.key;
    this.ring.push({ key, pos });
    if (this.ring.length > this.size) this.ring.shift();
  }
  private at(key: number): V3 | null {
    for (let i = this.ring.length - 1; i >= 0; i--) if (this.ring[i]!.key <= key) return this.ring[i]!.pos;
    return null;
  }
  movedAt(key: number, span: number): boolean {
    const now = this.at(key), then = this.at(key - span);
    return !!now && !!then && flatStep(then, now) > 20 * span / TICK_HZ;
  }
}

/** A snapshot as a watcher's page receives it: `at` ms after the replay's start. */
export interface Arrival { at: number; snap: Snapshot }

/**
 * The real interpolation over hand-made arrivals: a watcher `NetClient` on a socket that is fed `arrivals` at their
 * times, its `bodies()` sampled for body `id` at every frame `k * frameMs` (k = 1..count). The clock is the caller's:
 * `advance(ms)` moves it (vitest's fake timers, `performance` faked), and `performance.now()` reads it.
 */
export function drawnTrack(arrivals: readonly Arrival[], id: number, count: number, frameMs: number, advance: (ms: number) => void): (V3 | null)[] {
  let page: WebSocketLike | null = null;
  const idle: NetWalk = { setNetTap: () => undefined, respawn: () => true, nudge: () => undefined, setLocked: () => undefined };
  const client = new NetClient({
    url: 'mem', map: 'MP99', name: 'Watch', watch: true, socket: () => {
      page = { binaryType: 'arraybuffer', readyState: 1, onopen: null, onclose: null, onmessage: null, onerror: null, send: () => undefined, close: () => undefined };
      return page;
    },
  }, idle);
  const start = performance.now();
  page!.onopen?.({});
  page!.onmessage?.({ data: JSON.stringify({ type: 'welcome', id: 99, version: PROTOCOL_VERSION, map: 'MP99', tick: 0, role: 'spectator', team: null, queue: 0, name: 'Watch', players: [], rules: 'respawn', round: 1, rounds: 11, ghost: false }) });
  const sorted = [...arrivals].sort((a, b) => a.at - b.at);
  const track: (V3 | null)[] = [];
  let next = 0;
  const to = (t: number): void => { const d = start + t - performance.now(); if (d > 0) advance(d); };
  for (let k = 1; k <= count; k++) {
    const frame = k * frameMs;
    while (next < sorted.length && sorted[next]!.at <= frame) {
      const a = sorted[next++]!;
      to(a.at);
      page!.onmessage?.({ data: encodeSnapshot(a.snap).slice().buffer });
    }
    to(frame);
    const b = client.bodies(performance.now()).find((x) => x.id === id);
    track.push(b ? [b.feet[0], b.feet[1], b.feet[2]] : null);
  }
  client.close();
  return track;
}

/** The distance the page's corrections moved its mover: wraps `walk.nudge`, summing each nudge's length. */
export function nudgeTally(walk: Pick<NetWalk, 'nudge'>): { total: number } {
  const tally = { total: 0 };
  const nudge = walk.nudge.bind(walk);
  walk.nudge = (dx, dy, dz, ack) => { tally.total += Math.hypot(dx, dy, dz); nudge(dx, dy, dz, ack); };
  return tally;
}

/** The own page's corrections: the count (small and snapped), the snapped, the largest and the total moved. */
export interface OwnCorrections { count: number; snapped: number; largest: number; total: number }
export function ownCorrections(client: NetClient, tally: { total: number }): OwnCorrections {
  const c = client.corrections;
  return { count: c.small + c.snapped, snapped: c.snapped, largest: c.largest, total: tally.total };
}

// ---- the line ----------------------------------------------------------------------------------------------------

/**
 * A TCP-like stall: from `firstMs` after the line is made, every `everyMs`, the line holds every delivery for a
 * duration drawn uniformly in [`minMs`, `maxMs`], then releases them in order (a retransmission's head-of-line block).
 */
export interface StallSpec { everyMs: number; minMs: number; maxMs: number; firstMs: number }

/** One direction of a line: its one-way latency, its jitter (uniform +-), and its stalls (none when absent). */
export interface LineSpec { latencyMs: number; jitterMs?: number; stall?: StallSpec | null }

/**
 * One direction of a TCP-like connection: each frame is delivered `latencyMs` +- `jitterMs` after it is sent but never
 * before the frame sent before it (in order: jitter does not reorder, it bunches), and a frame whose delivery falls in a
 * stall waits for the stall's end. One queue drained by one timer (as the page's own injector keeps its reliable
 * messages, `client.ts` `pumpReliable`), so equal times keep the send order.
 */
export class Line {
  private readonly q: { due: number; run: () => void }[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private last = Number.NEGATIVE_INFINITY;
  private readonly born: number;
  private readonly windows: [number, number][] = [];
  /** The stalls the line has held a frame in, and the frames it held. */
  stalls = 0; held = 0;
  private lastWindow = -1;
  constructor(readonly spec: LineSpec, private readonly random: () => number) {
    this.born = performance.now();
  }

  /** The stall window `k` (made in order, so the draws are the same run to run). */
  private window(k: number): [number, number] {
    const s = this.spec.stall!;
    while (this.windows.length <= k) {
      const i = this.windows.length;
      const start = this.born + s.firstMs + i * s.everyMs;
      this.windows.push([start, start + s.minMs + this.random() * (s.maxMs - s.minMs)]);
    }
    return this.windows[k]!;
  }

  /** `due` moved past the stall it falls in, if any. */
  private unstalled(due: number): number {
    const s = this.spec.stall;
    if (!s) return due;
    const k = Math.floor((due - this.born - s.firstMs) / s.everyMs);
    if (k < 0) return due;
    const [a, b] = this.window(k);
    if (due < a || due >= b) return due;
    this.held++;
    if (k !== this.lastWindow) { this.lastWindow = k; this.stalls++; }
    return b;
  }

  send(run: () => void): void {
    const now = performance.now();
    const jitter = this.spec.jitterMs ? (this.random() * 2 - 1) * this.spec.jitterMs : 0;
    const due = this.unstalled(Math.max(now + Math.max(0, this.spec.latencyMs + jitter), this.last));
    this.last = due;
    this.q.push({ due, run });
    if (this.timer === null) this.pump(false);
  }

  private pump(fired: boolean): void {
    const q = this.q;
    // Fired for the head: its due has come on the timer's own clock (the page's injector's rule, `pumpReliable`).
    const at = fired && q.length ? Math.max(performance.now(), q[0]!.due) : performance.now();
    while (q.length && q[0]!.due <= at) q.shift()!.run();
    if (q.length && this.timer === null) {
      this.timer = setTimeout(() => { this.timer = null; this.pump(true); }, Math.max(0, Math.ceil(q[0]!.due - performance.now())));
    }
  }
}

/**
 * A socket behind a line each way: what the page sends goes up `up`, what comes to it comes down `down` (the open and
 * the close too, in order with the frames). `inner` is the real or in-memory socket.
 */
export function lineSocket(inner: WebSocketLike, up: Line, down: Line): WebSocketLike {
  const outer: WebSocketLike = {
    binaryType: 'arraybuffer',
    get readyState() { return inner.readyState; },
    send: (d) => up.send(() => { if (inner.readyState === 1) inner.send(d); }),
    close: (code, reason) => inner.close(code, reason),
    onopen: null, onclose: null, onmessage: null, onerror: null,
  };
  inner.onopen = (ev) => down.send(() => outer.onopen?.(ev));
  inner.onmessage = (ev) => down.send(() => outer.onmessage?.(ev));
  inner.onclose = (ev) => down.send(() => outer.onclose?.(ev));
  inner.onerror = (ev) => outer.onerror?.(ev);
  return outer;
}

// ---- the server's clock ------------------------------------------------------------------------------------------

/** A room hitch: from `firstMs`, every `everyMs`, the server's event loop is blocked for `ms` (a step that ran long). */
export interface HitchSpec { everyMs: number; ms: number; firstMs: number }

/**
 * The match server's 60 Hz clock as `MatchServer.loop` runs it (`packages/match/src/server.ts:951-990` at d8a9c2ec2): a
 * callback steps the room while its slot is due, at most 5 steps a callback; a stall longer than 5 periods is dropped,
 * not replayed (`next = now`); the next callback is set for the next slot. The room's own work is `step` (`stepRoom` is
 * `room.step()` for a room with anyone in it).
 *
 * A hitch (`HitchSpec`) is a step that runs long (the review's F2): the slot's callback starts its step and the event
 * loop is blocked until the step completes -- so its sends (the snapshot) leave at the hitch's END, and no frame reaches
 * the room meanwhile (a socket's data waits for a blocked loop). The callback's `while` then re-reads its own `now`
 * (taken before the step), so it runs no catch-up and drops nothing, and arms `setTimeout(run, 0)` (`next` is past); the
 * poll phase hands the room the frames held during the hitch; then the next callback catches up by the rule above: five
 * steps, the rest dropped. Order: the long step, the frames, five steps.
 *
 * The re-check's F2: the room reads its clock on entry to its step (`room.ts` `stepRoom`, `const now = this.opts.now()`),
 * before the long work -- so the long step runs on the hitch's START time and completes at its end, and the hitch's wall
 * time is credited at the first catch-up step, after the frames. The room's `now` is the loop's `roomNow()`: the wall
 * clock (`Date.now()`), but the long step's start while that step runs.
 */
export class ServerLoop {
  private next = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly held: (() => void)[] = [];
  private hitchK = 0;
  private blockedFrom = Number.POSITIVE_INFINITY;
  private blockedUntil = Number.NEGATIVE_INFINITY;
  private startedAt: number | null = null;
  private pinned: number | null = null;
  private readonly born: number;
  /** The steps run, the periods dropped, and the hitches taken. */
  steps = 0; dropped = 0; hitches = 0;
  constructor(private readonly step: () => void, private readonly hitch: HitchSpec | null = null) {
    this.born = performance.now();
  }

  start(): void {
    this.next = performance.now();
    this.timer = setTimeout(() => this.run(), 0);
  }

  stop(): void { if (this.timer !== null) clearTimeout(this.timer); this.timer = null; }

  /** The room's clock (its `now` option): the wall clock, but the long step's start time while that step runs. */
  roomNow(): number { return this.pinned ?? Date.now(); }

  /** A frame for the room: taken now, or after the hitch blocking the loop. */
  inbound(run: () => void): void {
    const now = performance.now();
    if (now >= this.blockedFrom && now < this.blockedUntil) this.held.push(run);
    else run();
  }

  private run(): void {
    const period = 1000 / TICK_HZ;
    const now = performance.now();
    if (this.hitch && this.next <= now && this.born + this.hitch.firstMs + this.hitchK * this.hitch.everyMs <= now) {
      // This callback's first step is the long one: the loop is blocked from now until it completes.
      this.blockedFrom = now;
      this.blockedUntil = now + this.hitch.ms;
      this.startedAt = Date.now();                               // the room reads its clock here, on the step's entry
      this.hitchK++; this.hitches++;
      this.timer = setTimeout(() => this.longStepEnds(), this.hitch.ms);
      return;
    }
    let steps = 0;
    while (this.next <= now && steps < 5) { this.step(); this.steps++; this.next += period; steps++; }
    if (this.next < now - period * 5) { this.dropped += (now - this.next) / period; this.next = now; }
    this.timer = setTimeout(() => this.run(), Math.max(0, this.next - performance.now()));
  }

  /** The long step completes (its snapshot leaves now); `setTimeout(run, 0)`; the poll phase's held frames; then `run`. */
  private longStepEnds(): void {
    this.pinned = this.startedAt;
    try { this.step(); } finally { this.pinned = null; this.startedAt = null; }
    this.steps++; this.next += 1000 / TICK_HZ;
    this.timer = setTimeout(() => this.run(), 0);
    const held = this.held.splice(0);
    for (const r of held) r();
  }
}
