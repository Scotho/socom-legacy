import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetClient, type NetWalk, type WebSocketLike } from '../src/net/client';
import { BodyFlag, TICK_HZ, type BodyState, type Command, type ServerEvent } from '../src/net/protocol';
import { encodeSnapshot, FEET_RANGE } from '../src/net/codec';
import { COMMAND_CLOCK_GAP_TICKS_ADAPTATION } from '../src/net/commandClock';
import { shortTurn, wrapYaw } from '../src/yaw';

/**
 * PV-4b (the player's-view lane; product track, a browser adaptation with no original -- LATER 735, research 402 s4): the
 * command clock wired into the live client. One watched body has its owner's command clock kept (`setCommandClockBody`),
 * and only while the page says so (`drawn`) is that body's feet, yaw and pitch in `bodies()` taken from it. The harness of
 * `netClientShownTick.test.ts` (an in-memory socket, `performance.now` stubbed), run TWICE side by side: a control client
 * that never calls this task's methods, and a subject client that does -- the same snapshots delivered to both at the
 * same times, the same reads and the same commands at each frame -- and every read compared value for value, so
 * "nothing changes for a page not in the view" is held by running the same script through both, not by a pin.
 *
 * The room models are `spectateSmoothness.test.ts`'s four (`ideal`, `main-thread`, `tcp-jitter`, `bursty-input`); the
 * watched body's command number advances by what the room ran (one a tick, or 0/1/2 a tick for `bursty-input`) and its
 * low four bits ride in `BodyState.clock` (protocol 16, research 402 s3).
 */

const TICK_MS = 1000 / TICK_HZ;
const WATCHED = 7, OTHER = 8, HOSTAGE = 9;

/** A body at `x` along the floor, alive, every other field at rest; `over` replaces any field. */
function body(id: number, x: number, over: Partial<BodyState> = {}): BodyState {
  return {
    id, feet: [x, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, flags: BodyFlag.Alive, stance: 0, landing: 0, jumps: 0, ground: 0,
    groundForward: 0, groundRight: 0, groundCls: -1, action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
    overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0, trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0,
    travBlendWeight: 0, peek: 0, weapon: 0, slot: 0, ...over,
  };
}

/** The watched body after its owner's command `n` (x = n, turning 3 degrees a command, the pitch a triangle), the nibble n's. */
const watchedAt = (n: number, over: Partial<BodyState> = {}): BodyState =>
  body(WATCHED, n, { yaw: wrapYaw(n * 3), pitch: Math.abs((n % 40) - 20) - 10, clock: (5 + n) & 15, ...over });

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

type Model = 'ideal' | 'main-thread' | 'tcp-jitter' | 'bursty-input';
const MODELS: readonly Model[] = ['ideal', 'main-thread', 'tcp-jitter', 'bursty-input'];
interface Arrival { at: number; tick: number; bodies: BodyState[] }

/**
 * `spectateSmoothness.test.ts` `stream`'s models: the commands the room ran by each tick (one a tick; `bursty-input` 0, 1
 * or 2, 15/70/15 %), a snapshot every second tick heard 40 ms on (plus 0-8 ms, or 30-80 ms in order). Each snapshot
 * holds the watched body after the commands run and another body walking backward with its own nibble; `shape` may
 * rewrite a snapshot's bodies (a death, an absence); `runs` may rewrite what the room ran at a tick.
 */
function script(
  model: Model, seconds: number, seed = 11, shape?: (tick: number, bodies: BodyState[]) => BodyState[], runs?: (tick: number, run: number) => number,
): Arrival[] {
  const r = rng(seed);
  const ticks = Math.ceil((seconds * 1000 + 1000) / TICK_MS);
  const ran: number[] = [0];
  for (let k = 1; k <= ticks; k++) {
    const u = r();
    const run = model === 'bursty-input' ? (u < 0.15 ? 0 : u < 0.85 ? 1 : 2) : 1;
    ran.push(ran[k - 1]! + (runs ? runs(k, run) : run));
  }
  const out: Arrival[] = [];
  let lastAt = -Infinity;
  for (let k = 2; k <= ticks; k += 2) {
    let at = k * TICK_MS + 40;
    if (model === 'main-thread') at += r() * 8;
    if (model === 'tcp-jitter') at = k * TICK_MS + 30 + r() * 50;
    at = Math.max(at, lastAt);
    lastAt = at;
    const bodies = [watchedAt(ran[k]!), body(OTHER, -k / 2, { yaw: wrapYaw(k), clock: k & 15 })];
    out.push({ at, tick: k, bodies: shape ? shape(k, bodies) : bodies });
  }
  return out;
}

const CMD: Omit<Command, 'seq'> = { forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
type Role = 'player' | 'spectator';

/** One client on its own in-memory socket: what it sent (bytes copied), its walk's tap, and a delivery. */
interface Side { c: NetClient; sent: unknown[]; tap(): void; deliver(bytes: Uint8Array): void; event(ev: ServerEvent): void }
function side(role: Role): Side {
  const sent: unknown[] = [];
  let tap: Parameters<NetWalk['setNetTap']>[0] = null;
  const walk: NetWalk = { setNetTap: (t) => { tap = t; }, respawn: () => true, nudge: () => undefined, setLocked: () => undefined, setDead: () => undefined };
  const socket: WebSocketLike = {
    binaryType: 'blob', readyState: 1, send: (d) => { sent.push(typeof d === 'string' ? d : Array.from(d)); }, close: () => undefined,
    onopen: null, onclose: null, onmessage: null, onerror: null,
  };
  const c = new NetClient({ url: 'mem', map: 'SYN', name: 'A', socket: () => socket, ...(role === 'spectator' ? { watch: true } : {}) }, walk);
  socket.onopen?.({});
  socket.onmessage?.({ data: JSON.stringify({ type: 'welcome', id: 3, version: 11, map: 'SYN', tick: 0, role, team: role === 'player' ? 'seal' : null, queue: 0, epoch: 0, env: { revision: 0, epoch: 0, states: [] } } as unknown as ServerEvent) });
  return { c, sent, tap: () => { tap?.(CMD, [0, 0, 0]); }, deliver: (bytes) => { socket.onmessage?.({ data: bytes }); }, event: (ev) => { socket.onmessage?.({ data: JSON.stringify(ev) }); } };
}

/** The page's clock, stubbed: both clients read it. */
function stubClock(): { now: number } {
  const clock = { now: 0 };
  vi.spyOn(performance, 'now').mockImplementation(() => clock.now);
  return clock;
}

afterEach(() => { vi.restoreAllMocks(); });

type Mode = 'none' | 'watched' | 'drawn';
interface Frame { now: number; a: BodyState[]; b: BodyState[] }

/**
 * The same script through a control client (`a`, never told of the clock) and a subject (`b`, told `mode` every frame, as
 * the page would): each frame the two clients' `bodies()`, `viewTick()` and `shownTick()` are read in the same order
 * and the walk taps one command on each (a player sends it); `each` sees the subject at the frame.
 */
function twin(arrivals: Arrival[], role: Role, mode: Mode, hz = 60, each?: (b: NetClient, f: Frame) => void): { a: Side; b: Side; frames: Frame[] } {
  const clock = stubClock();
  const a = side(role), b = side(role);
  const end = arrivals[arrivals.length - 1]!.at;
  const frames: Frame[] = [];
  let next = 0;
  for (let now = 1000 + 0.37; now < end; now += 1000 / hz) {
    while (next < arrivals.length && arrivals[next]!.at <= now) {
      const s = arrivals[next++]!;
      clock.now = s.at;
      const bytes = encodeSnapshot({ tick: s.tick, own: null, bodies: s.bodies });
      a.deliver(bytes);
      b.deliver(bytes);
    }
    clock.now = now;
    if (mode === 'none') b.c.setCommandClockBody(null);
    else b.c.setCommandClockBody(WATCHED, mode === 'drawn');
    const f: Frame = { now, a: a.c.bodies(), b: b.c.bodies() };
    expect(b.c.viewTick()).toBe(a.c.viewTick());
    expect(b.c.shownTick()).toBe(a.c.shownTick());
    a.tap();
    b.tap();
    frames.push(f);
    each?.(b.c, f);
  }
  return { a, b, frames };
}

/** The entry with `id`, else undefined. */
const of = (list: readonly BodyState[], id: number): BodyState | undefined => list.find((x) => x.id === id);
/** `x` with `y`'s feet, yaw and pitch: what the substitution may change. */
const withPose = (x: BodyState, y: BodyState): BodyState => ({ ...x, feet: y.feet, yaw: y.yaw, pitch: y.pitch });

describe('PV-4b: a page not in the player\'s view sees and sends what it does today', () => {
  for (const role of ['spectator', 'player'] as const) {
    for (const model of MODELS) {
      it(`nothing watched (${model}, ${role}): bodies, viewTick, shownTick and the frames sent equal the control's`, () => {
        const { a, b, frames } = twin(script(model, 12), role, 'none', 60, (c) => { expect(c.commandClock()).toBeNull(); expect(c.bodyAtCommand(1030)).toBeNull(); });
        expect(frames.length).toBeGreaterThan(600);
        for (const f of frames) expect(f.b).toEqual(f.a);
        expect(b.sent).toEqual(a.sent);
        expect(a.sent.length).toBeGreaterThan(role === 'player' ? 600 : 3);
      });

      it(`watched, not drawn (${model}, ${role}): the same, the watched body included, while the clock answers the rig`, () => {
        let answered = 0;
        const { a, b, frames } = twin(script(model, 12), role, 'watched', 60, (c) => {
          const cc = c.commandClock();
          if (cc === null) return;
          answered++;
          expect(Number.isFinite(cc.cmd)).toBe(true);
          expect(c.bodyAtCommand(Math.floor(cc.cmd))).not.toBeNull();
        });
        for (const f of frames) expect(f.b).toEqual(f.a);
        expect(b.sent).toEqual(a.sent);
        expect(answered).toBeGreaterThan(frames.length - 10);
      });
    }
  }
});

describe('PV-4b: drawn, only the watched body\'s feet, yaw and pitch move', () => {
  for (const model of MODELS) {
    it(`${model}: every other body, the view tick, the shown tick and the frames equal; the watched one's discrete state too`, () => {
      let moved = 0;
      const { a, b, frames } = twin(script(model, 12), 'player', 'drawn', 60);
      for (const f of frames) {
        expect(f.b.map((x) => x.id)).toEqual(f.a.map((x) => x.id));
        for (const x of f.a) {
          const y = of(f.b, x.id)!;
          if (x.id !== WATCHED) { expect(y).toEqual(x); continue; }
          expect(withPose(y, x)).toEqual(x);                    // all but feet, yaw, pitch: today's
          if (y.feet[0] !== x.feet[0]) moved++;
          expect(y.feet[1]).toBe(x.feet[1]);
        }
      }
      expect(b.sent).toEqual(a.sent);
      // Under the uneven cadence the body is drawn at its owner's command time, not the room's tick: it differs from
      // today's. (One command a tick, `ideal`, the two clocks draw the same place, a float's rounding apart -- once the
      // clock, bound at the first frame, has played out its delay: until then it stands on its oldest sample.)
      if (model === 'bursty-input') expect(moved).toBeGreaterThan(frames.length / 2);
      if (model === 'ideal') {
        for (const f of frames.slice(30)) expect(of(f.b, WATCHED)!.feet[0]).toBeCloseTo(of(f.a, WATCHED)!.feet[0], 6);
      }
    });
  }

  it('drawn switched off: the very next bodies() is today\'s; on again: on the clock again', () => {
    const clock = stubClock();
    const a = side('spectator'), b = side('spectator');
    const arrivals = script('bursty-input', 6);
    let next = 0, frame = 0, offFrames = 0, onAfter = 0;
    for (let now = 1000.37; now < arrivals[arrivals.length - 1]!.at; now += 1000 / 60, frame++) {
      while (next < arrivals.length && arrivals[next]!.at <= now) {
        const s = arrivals[next++]!;
        clock.now = s.at;
        const bytes = encodeSnapshot({ tick: s.tick, own: null, bodies: s.bodies });
        a.deliver(bytes); b.deliver(bytes);
      }
      clock.now = now;
      const drawn = !(frame >= 150 && frame < 160);
      b.c.setCommandClockBody(WATCHED, drawn);
      const x = a.c.bodies(), y = b.c.bodies();
      if (!drawn) { expect(y).toEqual(x); offFrames++; }
      else if (frame >= 160 && of(y, WATCHED)!.feet[0] !== of(x, WATCHED)!.feet[0]) onAfter++;
    }
    expect(offFrames).toBe(10);
    expect(onAfter).toBeGreaterThan(50);
  });

  it('the drawn entry is the clock\'s own body at its command time: bodyAtCommand(cmd)', () => {
    let checked = 0;
    twin(script('bursty-input', 6), 'spectator', 'drawn', 60, (c, f) => {
      const cc = c.commandClock(f.now);
      const y = of(f.b, WATCHED)!;
      const at = cc === null ? null : c.bodyAtCommand(cc.cmd);
      if (at === null) { expect(y).toEqual(of(f.a, WATCHED)); return; }   // no clock (yet): today's entry
      checked++;
      expect(y.feet[0]).toBeCloseTo(at.feet[0], 9);
      expect(y.yaw).toBeCloseTo(at.yaw, 9);
      expect(y.pitch).toBeCloseTo(at.pitch, 9);
    });
    expect(checked).toBeGreaterThan(200);
  });
});

describe('PV-4b: the rig\'s reads (`commandClock`, `bodyAtCommand`)', () => {
  it('bodyAtCommand at a fractional k is the lerp of the whole commands around it (the rig asks whole, bodies() the fraction)', () => {
    let checked = 0;
    twin(script('bursty-input', 6), 'spectator', 'watched', 60, (c) => {
      const cc = c.commandClock();
      if (cc === null) return;
      const k = Math.floor(cc.cmd) - 3;
      const lo = c.bodyAtCommand(k), hi = c.bodyAtCommand(k + 1), mid = c.bodyAtCommand(k + 0.37);
      if (!lo || !hi) return;
      expect(mid).not.toBeNull();
      for (let i = 0; i < 3; i++) expect(mid!.feet[i]).toBeCloseTo(lo.feet[i]! + (hi.feet[i]! - lo.feet[i]!) * 0.37, 9);
      expect(mid!.pitch).toBeCloseTo(lo.pitch + (hi.pitch - lo.pitch) * 0.37, 9);
      expect(mid!.yaw).toBeCloseTo(wrapYaw(lo.yaw + shortTurn(lo.yaw, hi.yaw) * 0.37), 9);
      checked++;
    });
    expect(checked).toBeGreaterThan(100);
  });

  it('another id and back restarts the clock (the epoch rises); the same id again, or only drawn changed, does not', () => {
    const clock = stubClock();
    const s = side('spectator');
    const feed = (from: number, to: number): void => {
      for (let tick = from; tick <= to; tick += 2) {
        clock.now = tick * TICK_MS + 40;
        s.deliver(encodeSnapshot({ tick, own: null, bodies: [watchedAt(tick), body(OTHER, 0, { clock: tick & 15 })] }));
      }
    };
    expect(s.c.commandClock()).toBeNull();
    s.c.setCommandClockBody(WATCHED);
    feed(2, 40);
    const e0 = s.c.commandClock()!.epoch;
    s.c.setCommandClockBody(WATCHED);
    s.c.setCommandClockBody(WATCHED, true);
    s.c.setCommandClockBody(WATCHED, false);
    expect(s.c.commandClock()!.epoch).toBe(e0);
    s.c.setCommandClockBody(OTHER);
    feed(42, 50);
    expect(s.c.commandClock()!.epoch).toBe(e0 + 1);
    s.c.setCommandClockBody(WATCHED);
    expect(s.c.commandClock()).toBeNull();                       // fresh: nothing heard yet for it
    feed(52, 60);
    expect(s.c.commandClock()!.epoch).toBe(e0 + 2);
    s.c.setCommandClockBody(null);
    expect(s.c.commandClock()).toBeNull();
    expect(s.c.bodyAtCommand(1030)).toBeNull();
  });
});

describe('PV-4b: the cases that keep today\'s entry', () => {
  /** A drawn twin on `shape`d snapshots: every frame's lists equal (the watched entry included). */
  function today(shape: (tick: number, bodies: BodyState[]) => BodyState[], id = WATCHED): { frames: Frame[] } {
    const clock = stubClock();
    const a = side('spectator'), b = side('spectator');
    const arrivals = script('bursty-input', 5, 11, shape);
    const frames: Frame[] = [];
    let next = 0;
    for (let now = 1000.37; now < arrivals[arrivals.length - 1]!.at; now += 1000 / 60) {
      while (next < arrivals.length && arrivals[next]!.at <= now) {
        const s = arrivals[next++]!;
        clock.now = s.at;
        const bytes = encodeSnapshot({ tick: s.tick, own: null, bodies: s.bodies });
        a.deliver(bytes); b.deliver(bytes);
      }
      clock.now = now;
      b.c.setCommandClockBody(id, true);
      const f = { now, a: a.c.bodies(), b: b.c.bodies() };
      expect(f.b).toEqual(f.a);
      frames.push(f);
    }
    return { frames };
  }

  it('a dead watched body: today\'s entry (a corpse moves on the room\'s ticks), though its clock runs', () => {
    const { frames } = today((_t, bodies) => bodies.map((x) => (x.id === WATCHED ? { ...x, flags: 0 } : x)));
    expect(frames.length).toBeGreaterThan(200);
  });

  it('a hostage (its nibble always 0): today\'s entry, and no command clock', () => {
    const clock = stubClock();
    const s = side('spectator');
    s.c.setCommandClockBody(HOSTAGE, true);
    for (let tick = 2; tick <= 200; tick += 2) {
      clock.now = tick * TICK_MS + 40;
      s.deliver(encodeSnapshot({ tick, own: null, bodies: [body(HOSTAGE, tick, { clock: 0 })] }));
      clock.now += 5;
      expect(s.c.commandClock()).toBeNull();
    }
    today((t, bodies) => [...bodies, body(HOSTAGE, t, { clock: 0 })], HOSTAGE);
  });

  it('a body absent from the snapshots, then back after 20 ticks: nothing thrown, a reset and a fresh start', () => {
    const gone = (t: number): boolean => t > 120 && t <= 140;     // absent for ticks 122..140: back 20 ticks after 120
    expect(20).toBeGreaterThan(COMMAND_CLOCK_GAP_TICKS_ADAPTATION);
    const clock = stubClock();
    const a = side('spectator'), b = side('spectator');
    const arrivals = script('ideal', 4, 11, (t, bodies) => (gone(t) ? bodies.filter((x) => x.id !== WATCHED) : bodies));
    let next = 0, epochBefore = -1, epochAfter = -1, nullAfterReturn = 0, onAgain = 0;
    for (let now = 1000.37; now < arrivals[arrivals.length - 1]!.at; now += 1000 / 60) {
      let returned = false;
      while (next < arrivals.length && arrivals[next]!.at <= now) {
        const s = arrivals[next++]!;
        clock.now = s.at;
        const bytes = encodeSnapshot({ tick: s.tick, own: null, bodies: s.bodies });
        a.deliver(bytes); b.deliver(bytes);
        if (s.tick === 142) returned = true;
      }
      clock.now = now;
      b.c.setCommandClockBody(WATCHED, true);
      const x = a.c.bodies(), y = b.c.bodies();
      for (const o of x) if (o.id !== WATCHED) expect(of(y, o.id)).toEqual(o);
      if (!of(x, WATCHED)) expect(of(y, WATCHED)).toBeUndefined();
      const cc = b.c.commandClock();
      if (next > 0 && arrivals[next - 1]!.tick <= 120 && cc) epochBefore = cc.epoch;
      if (returned) {
        expect(cc).toBeNull();                                   // one number since the reset
        expect(of(y, WATCHED)).toEqual(of(x, WATCHED));
        nullAfterReturn++;
      } else if (cc && arrivals[next - 1]!.tick > 150) { epochAfter = cc.epoch; onAgain++; }
    }
    expect(nullAfterReturn).toBe(1);
    expect(epochAfter).toBe(epochBefore + 1);
    expect(onAgain).toBeGreaterThan(30);
  });
});

describe('PV-4b review fold 2: a respawn -- the substitution is made only when the clock\'s own sample is alive', () => {
  /**
   * The watched body lives 120 ticks of each 180, then lies dead 60 (its corpse at the place it died, its seat's commands
   * still advancing the number: research 402 s3), then respawns 1 500 units on (life `l` walks on from x = -3 000 + 1 500 l,
   * every place within the wire's feet range, `codec.ts` `FEET_RANGE`, so none is clamped). The
   * room's `spawn` event is heard after the last dead snapshot and before the first alive one, as the room sends it
   * (`markSpawn`): the clock sees the spawn count change between those two samples. Under the uneven cadence the command
   * time can still sit at or before the last dead sample when the drawn (newer) snapshot is already alive: there `at(k)`
   * is the corpse, and the substitution must not draw an alive body at its corpse's feet. To put the command time there
   * at each respawn, the room runs two of the seat's commands a tick over the last 12 ticks of the death (a queue
   * drained on the credit): the clock slews after the number, behind it, as the respawn is drawn.
   */
  const CYCLE = 180, DEAD_FROM = 120, SPAN = 1_500, ORIGIN = -3_000;
  /** Life `l`'s spawn point. */
  const spawnOf = (l: number): number => ORIGIN + SPAN * l;
  function lives(seed: number): { arrivals: Arrival[]; corpses: number[]; spawnAfter: Set<number> } {
    const corpses: number[] = [];
    const spawnAfter = new Set<number>();
    const n0: number[] = [];                                     // the number at each life's first tick
    const drain = (tick: number, run: number): number => (tick % CYCLE >= CYCLE - 12 ? 2 : run);
    const arrivals = script('bursty-input', 12, seed, (tick, bodies) => bodies.map((x) => {
      if (x.id !== WATCHED) return x;
      const l = Math.floor(tick / CYCLE), into = tick % CYCLE;
      n0[l] ??= x.feet[0];
      const at = spawnOf(l) + x.feet[0] - n0[l]!;
      expect(Math.abs(at)).toBeLessThan(FEET_RANGE);
      if (into < DEAD_FROM) return { ...x, feet: [at, 0, 0] };
      if (into === DEAD_FROM) corpses[l] = at;
      if (into === CYCLE - 2) spawnAfter.add(tick);
      return { ...x, flags: 0, feet: [corpses[l]!, 0, 0] };
    }), drain);
    return { arrivals, corpses, spawnAfter };
  }

  for (const seed of [11, 12, 13, 14]) {
    it(`seed ${seed}: on no frame is an alive watched entry drawn at a corpse's feet or between a corpse and its respawn`, () => {
      const clock = stubClock();
      const a = side('spectator'), b = side('spectator');
      const { arrivals, corpses, spawnAfter } = lives(seed);
      let next = 0, onClock = 0, respawned = 0;
      for (let now = 1000.37; now < arrivals[arrivals.length - 1]!.at; now += 1000 / 60) {
        while (next < arrivals.length && arrivals[next]!.at <= now) {
          const s = arrivals[next++]!;
          clock.now = s.at;
          const bytes = encodeSnapshot({ tick: s.tick, own: null, bodies: s.bodies });
          a.deliver(bytes); b.deliver(bytes);
          if (spawnAfter.has(s.tick)) {
            const ev = { type: 'spawn', id: WATCHED, at: [0, 0, 0], yaw: 0, after: 0 } as unknown as ServerEvent;
            a.event(ev); b.event(ev);
          }
        }
        clock.now = now;
        b.c.setCommandClockBody(WATCHED, true);
        const x = of(a.c.bodies(), WATCHED), y = of(b.c.bodies(), WATCHED);
        if (!x || !y) continue;
        if (!(y.flags & BodyFlag.Alive) || y.feet[0] === x.feet[0]) continue;
        onClock++;
        const l = Math.floor((x.feet[0] - ORIGIN) / SPAN);         // the life today's (alive) entry is in
        if (l < 1) continue;
        respawned++;
        for (const c of corpses) expect(Math.abs(y.feet[0] - c)).toBeGreaterThan(1e-6);   // never at a corpse's feet
        const corpse = corpses[l - 1]!;
        expect(y.feet[0] > corpse + 1e-6 && y.feet[0] < spawnOf(l) - 1e-6).toBe(false);  // never slid from the corpse
      }
      expect(corpses.length).toBeGreaterThanOrEqual(4);
      expect(onClock).toBeGreaterThan(300);
      expect(respawned).toBeGreaterThan(100);
    });
  }
});
