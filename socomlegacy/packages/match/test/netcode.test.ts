import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { CollisionOwner, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import {
  Button, cameraLook, centreClaim, faceToward, groundGrid, holdBits, MoverSim, moverSnapshot, packGround, PROTOCOL_VERSION, STEP_PROBE_LIFT_READING,
  quantiseCommand, Walker, wrapYaw,
  type Command, type SimMap,
} from '../../viewer/src/sim';
import { NetClient, type NetWalk, type WebSocketLike } from '../../viewer/src/net/client';
import { Room } from '../src/room';
import { dashRatio, heldMs, Line, lineSocket, nudgeTally, ownCorrections, ServerLoop, type LineSpec, type V3 } from './helpers/netMeasure';

/**
 * The netcode end to end (web sprint 3, M4; the bar's item 1): the page's `NetClient` against the server's `Room`
 * over an in-memory socket, under the injector's latency and loss, the page's mover driven as `WalkMode` drives it
 * networked -- presses applied at once, each tick on the quantised command. The prediction must agree with the server
 * with no correction at all, at every latency; and the others must be drawn between snapshots, behind the server.
 */

function map(deck = 30): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor = (x0: number, z0: number, x1: number, z1: number, y: number): WorldPoly => ({
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1]),
  });
  // A floor with a raised deck: the run crosses its edge, so the script walks off it and lands (the air, the landing).
  const polys = [floor(-1000, -1000, 1000, 1000, 0), floor(-400, -300, -100, 300, deck)];
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  const ground = packGround(params, polys, owners);
  const slot = (side: 0 | 1, x: number, z: number): SpawnSlot => ({ side, index: 0, position: [x, deck, z], onFloor: true, step: 2, facing: [1, 0], loc: { map: 0, x: 0, z: 0 } });
  return { stem: 'MP99', name: 'DECK', ground, grid: groundGrid(ground), spawns: null, slots: [slot(0, -300, 0), slot(1, -300, 100)], respawns: [], notes: [] };
}

/** `WalkMode` as the net client drives it: a press applied at once, the ticks on the quantised command. */
class PageWalk implements NetWalk {
  sim: MoverSim | null = null;
  tap: ((cmd: Omit<Command, 'seq'>, feet: [number, number, number], facing?: readonly [number, number]) => void) | null = null;
  locked = true;
  /**
   * The ticks tapped since the tap was set: the next one is command `taps + 1`, the number the client gives it
   * (`WalkMode` keeps the same count, so the page's tick draws on the seq the server's will: LANDING_HIT_DRAW_READING).
   */
  private taps = 0;
  /**
   * LATER 14: the look as an honest page's: `WalkMode.respawn` snaps the camera to the spawn's yaw (`walk.ts`), and the
   * script's stick turns on from there -- its yaw offset at the first command after the spawn so that command faces it.
   * Opt-in (`snapLook`): a script whose look is a turning stick; an absolute aim (a shooter's at a body) is not offset.
   */
  private snapTo: number | null = null;
  private yawOffset = 0;
  constructor(readonly grid: ReturnType<typeof groundGrid>, readonly snapLook = false) {}
  setNetTap(tap: typeof this.tap): void { this.tap = tap; this.taps = 0; }
  setLocked(on: boolean): void { this.locked = on; }
  respawn(at: readonly [number, number, number], yaw: number, replay: readonly Command[] = []): boolean {
    this.sim = new MoverSim(new Walker(this.grid), null);
    this.sim.walker.place(at[0], at[1] + STEP_PROBE_LIFT_READING, at[2]);   // `walk.ts` respawn: the tick's pick (PL-2)
    this.sim.walker.state.yaw = yaw;
    for (const c of replay) this.sim.apply(c);
    this.snapTo = yaw;
    return true;
  }
  nudge(dx: number, dy: number, dz: number): void { const s = this.sim!.walker.state; s.x += dx; s.y += dy; s.z += dz; }
  /** Protocol 11 (NET-WIRE): the room's facing correction, laid on the mover where the gate's next step starts. */
  nudgeFacing(dyaw: number, dpitch: number): void { const s = this.sim!.walker.state; s.yaw = wrapYaw(s.yaw + dyaw); s.pitch += dpitch; }
  /** One tick of play: the press, then the quantised tick, then the tap. */
  play(input: Omit<Command, 'seq'>): void {
    // Locked (dead, or not yet stood anywhere) the page sends no stick and no presses -- but the Action press, the
    // respawn's (`WalkMode.action`).
    const seq = ++this.taps;
    if (this.snapLook && this.snapTo !== null && this.sim && !this.locked) { this.yawOffset = this.snapTo - input.yaw; this.snapTo = null; }
    input = { ...input, yaw: wrapYaw(input.yaw + this.yawOffset) };
    if (!this.sim || this.locked) { this.tap?.({ ...input, forward: 0, right: 0, buttons: input.buttons & Button.Action }, [0, 0, 0]); return; }
    const cmd = quantiseCommand({ ...input, seq });
    this.sim.apply(cmd);
    const s = this.sim.walker.state;
    this.tap?.(cmd, [s.x, s.y, s.z], [s.yaw, s.pitch]);                 // protocol 11: the facing, reconciled too
  }
}

/** A socket pair: the page's end (`WebSocketLike`) and the server's `Conn`. */
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

afterEach(() => { vi.useRealTimers(); });

function script(t: number, yaw: number): Omit<Command, 'seq'> {
  return {
    forward: t < 240 ? 1 : 0.4, right: t > 150 && t < 300 ? 0.6 : 0, yaw: yaw + (t < 200 ? t * 0.3 : 60 - t * 0.1), pitch: -5, turn: t < 200 ? 0.09 : -0.03,
    buttons: t === 90 || t === 330 ? Button.Jump : t === 260 || t === 380 ? Button.Stance : 0, stance: t === 260 ? 1 : 0, weapon: 0,
  };
}

describe.each([0, 50, 100, 150])('the netcode at %i ms each way, 2 %% loss (bar 1)', (latency) => {
  it('predicts the local SEAL exactly as the server runs it: no correction, the same feet at the same command', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
    const m = map();
    const room = new Room(m, null, { now: () => Date.now() });
    const page = new PageWalk(m.grid);
    let seed = 42;
    const client = new NetClient({
      url: 'mem', map: 'MP99', name: 'Pred', socket: pair(room, 1), simulate: { latencyMs: latency, jitterMs: latency / 5, loss: 0.02 },
      random: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; },
    }, page);
    let yaw = 0;
    client.on((ev) => { if (ev.type === 'spawn') yaw = ev.yaw; });
    for (let t = 0; t < 600; t++) {
      page.play(script(t - 30, yaw));
      room.step();
      vi.advanceTimersByTime(1000 / 60);
    }
    for (let t = 0; t < 60; t++) { page.play({ forward: 0, right: 0, yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 }); room.step(); vi.advanceTimersByTime(1000 / 60); }
    expect(client.role).toBe('player');
    expect(client.corrections).toEqual({ small: 0, snapped: 0, largest: 0, facing: 0, largestFacing: 0 });
    const server = room.player(1)!.sim;
    // The server has run every command the page sent (the last 60 are standing still: the feet agree).
    const s = server.walker.state, p = page.sim!.walker.state;
    expect([s.x, s.y, s.z]).toEqual([p.x, p.y, p.z]);
    expect(Math.hypot(p.x + 300, p.z)).toBeGreaterThan(100);       // it went somewhere
    client.close();
  });
});

describe('a heavy landing: the hit clip is the same on both ends (review 2, M-2: LANDING_HIT_DRAW_READING)', () => {
  it('walks off a deck high enough for a class-2 landing and takes no correction; the page and the server land one clip', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
    // 100 over the floor at g 235: about 216.8 a second at contact, between the heavy (206.8) and the deadly (237.5).
    const m = map(100);
    let seed = 7;
    const clips = new Set<string>();
    for (let run = 0; run < 4; run++) {
      const room = new Room(m, null, { now: () => Date.now() });
      const page = new PageWalk(m.grid);
      const client = new NetClient({
        url: 'mem', map: 'MP99', name: `Heavy${run}`, socket: pair(room, 1), simulate: { latencyMs: 50, loss: 0.02 },
        random: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; },
      }, page);
      let yaw = 0;
      client.on((ev) => { if (ev.type === 'spawn') yaw = ev.yaw; });
      // A different number of idle ticks before the run each time: the landing falls on another command.
      for (let t = 0; t < 900; t++) {
        page.play({ forward: t > 30 + run * 7 && t < 600 ? 1 : 0, right: 0, yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 });
        room.step();
        vi.advanceTimersByTime(1000 / 60);
      }
      const server = room.player(1)!.sim.walker, mine = page.sim!.walker;
      expect(mine.landing?.cls).toBe(2);
      expect(server.landing?.clip).toBe(mine.landing?.clip);
      expect(client.corrections).toEqual({ small: 0, snapped: 0, largest: 0, facing: 0, largestFacing: 0 });
      expect([server.state.x, server.state.y, server.state.z]).toEqual([mine.state.x, mine.state.y, mine.state.z]);
      clips.add(mine.landing!.clip!);
      client.close();
    }
    expect([...clips].sort()).toEqual(['hit', 'hitStomach']);    // both of the game's clips came up
  });
});

describe("a toss from a held peek leaves the peek as it is on the server (review 3, A1: FUN_005b4340's state-3 bypass, 469345)", () => {
  it('a command carrying the lean toss while the lean is held: the snapshot keeps the lean clip, the peek and no action', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
    const m = map();
    const room = new Room(m, null, { now: () => Date.now() });
    const page = new PageWalk(m.grid);
    const client = new NetClient({ url: 'mem', map: 'MP99', name: 'Peek', socket: pair(room, 1) }, page);
    let yaw = 0;
    client.on((ev) => { if (ev.type === 'spawn') yaw = ev.yaw; });
    const step = (buttons: number): void => {
      page.play({ forward: 0, right: 0, yaw, pitch: 0, turn: 0, buttons, stance: 0, weapon: 0 });
      room.step();
      vi.advanceTimersByTime(1000 / 60);
    };
    for (let t = 0; t < 120; t++) step(0);
    for (let t = 0; t < 60; t++) step(Button.LeanRight);
    const server = room.player(1)!.sim;
    const snap = (): ReturnType<typeof moverSnapshot> => moverSnapshot(server.walker, server.moves, 0, 0);
    const before = snap();
    expect(before.peek).toBe(1);
    expect(before.traversal?.clip).toBe('seal_stand2rlean');
    expect(before.action).toBeNull();
    step(Button.LeanRight | holdBits('seal_toss_rlean'));
    expect(server.walker.holding?.clip).toBe('seal_toss_rlean');     // the server took the toss
    let ticks = 0;
    while (server.walker.holding !== null && ticks < 200) {
      const now = snap();
      expect(now.peek).toBe(1);
      expect(now.traversal).toEqual(before.traversal);
      expect(now.action).toBeNull();
      expect(server.moves!.peek()).toBeGreaterThan(0.99);
      step(Button.LeanRight);
      ticks++;
    }
    expect(ticks).toBeGreaterThan(60);                                 // the toss ran out under the held peek
    expect(snap().traversal).toEqual(before.traversal);
    expect(client.corrections).toEqual({ small: 0, snapped: 0, largest: 0, facing: 0, largestFacing: 0 });
    client.close();
  });
});

describe('the others, drawn behind the server (M4)', () => {
  it('interpolates a running body between snapshots, 100 ms behind, smoothly', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
    const m = map();
    const room = new Room(m, null, { now: () => Date.now() });
    const a = new PageWalk(m.grid), b = new PageWalk(m.grid);
    const ca = new NetClient({ url: 'mem', map: 'MP99', name: 'A', socket: pair(room, 1), simulate: { latencyMs: 50 } }, a);
    const cb = new NetClient({ url: 'mem', map: 'MP99', name: 'B', socket: pair(room, 2) }, b);
    const xs: number[] = [];
    for (let t = 0; t < 240; t++) {
      a.play({ forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 });
      b.play({ forward: t > 30 ? 1 : 0, right: 0, yaw: 270, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 });
      room.step();
      vi.advanceTimersByTime(1000 / 60);
      const other = ca.bodies().find((x) => x.id === 2);
      if (t > 120 && other) xs.push(other.feet[0]);
    }
    // B runs toward +x at a steady speed: A draws it moving every frame, no step backwards, no frozen pair.
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThan(xs[i - 1]!);
    const steps = xs.slice(1).map((x, i) => x - xs[i]!);
    expect(Math.max(...steps) / Math.min(...steps)).toBeLessThan(1.6);
    // Drawn behind B's own mover by about the delay and the latency.
    const lag = b.sim!.walker.state.x - xs[xs.length - 1]!;
    expect(lag).toBeGreaterThan(0);
    expect(ca.snapshotRate()).toBeGreaterThan(25);
    ca.close(); cb.close();
  });
});

describe('a death and a respawn in the stream (M6)', () => {
  it('takes no snapped correction through a kill, the wait and the respawn', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
    const m = map();
    m.respawns.push(...m.slots.map((s) => ({ ...s })));
    const room = new Room(m, null, { now: () => Date.now() });
    const a = new PageWalk(m.grid), b = new PageWalk(m.grid, true);   // LATER 14: B's stick snaps to each spawn's facing
    const ca = new NetClient({ url: 'mem', map: 'MP99', name: 'A', socket: pair(room, 1), simulate: { latencyMs: 40 } }, a);
    const cb = new NetClient({ url: 'mem', map: 'MP99', name: 'B', socket: pair(room, 2), simulate: { latencyMs: 40 } }, b);
    let look = { yaw: 0, pitch: 0 };
    for (let t = 0; t < 14 * 60; t++) {
      const firing = t >= 60 && t < 100 && a.sim !== null && room.player(2) !== undefined;
      const pb = room.player(2)?.sim.walker.state ?? { x: 0, y: 0, z: 0 };
      // A turns to B as the server has it (the test is about the stream, not the aim).
      if (firing) {
        const sa = a.sim!.walker.state;
        look = faceToward({ feet: [sa.x, sa.y, sa.z], posture: a.sim!.walker.posture }, [pb.x, pb.y + 12, pb.z]);
      }
      a.play({ forward: 0, right: 0, yaw: look.yaw, pitch: look.pitch, turn: 0, buttons: 0, stance: 0, weapon: 0 });
      // B runs about, and presses Action every second (the respawn's press once dead).
      b.play({ forward: 1, right: t % 120 < 60 ? 0.5 : -0.5, yaw: 90 + (t % 360), pitch: 0, turn: 0.1, buttons: t % 60 === 0 ? Button.Action : 0, stance: 0, weapon: 0 });
      if (firing && t % 9 === 0) {
        // A's round down its look (protocol 5: the eye and the aim at the cone's centre), at the command just sent.
        const sa = a.sim!.walker.state;
        const body = { feet: [sa.x, sa.y, sa.z], yaw: sa.yaw, pitch: sa.pitch, posture: a.sim!.walker.posture };
        const { eye } = cameraLook(body);
        const claim = centreClaim(body, [sa.x, sa.y + 15.4, sa.z], Math.hypot(pb.x - eye[0], pb.y + 12 - eye[1], pb.z - eye[2]));
        room.text(1, { type: 'fire', seq: ca.lastSeq(), ...claim, weapon: 0, viewTick: room.tick });
      }
      room.step();
      vi.advanceTimersByTime(1000 / 60);
    }
    expect(room.player(2)!.deaths).toBeGreaterThanOrEqual(1);
    expect(room.player(2)!.alive).toBe(true);
    expect(cb.corrections).toEqual({ small: 0, snapped: 0, largest: 0, facing: 0, largestFacing: 0 });
    ca.close(); cb.close();
  });
});

describe('a new match stands everyone at the start (M6, W3.R11)', () => {
  it('takes no correction when the server re-spawns a living player at the next match', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
    const m = map();
    const room = new Room(m, null, { now: () => Date.now(), roundSeconds: 2 });
    const a = new PageWalk(m.grid, true);                          // LATER 14: its stick snaps to each spawn's facing
    const ca = new NetClient({ url: 'mem', map: 'MP99', name: 'A', socket: pair(room, 1), simulate: { latencyMs: 30 } }, a);
    let spawns = 0;
    ca.on((ev) => { if (ev.type === 'spawn') spawns++; });
    for (let t = 0; t < (2 + 16 + 23 + 3) * 60; t++) {
      a.play({ forward: 1, right: (t % 200) < 100 ? 0.4 : -0.4, yaw: t * 0.5, pitch: 0, turn: 0.1, buttons: 0, stance: 0, weapon: 0 });
      room.step();
      vi.advanceTimersByTime(1000 / 60);
    }
    expect(spawns).toBe(2);                                   // the first match's, and the next's
    expect(ca.corrections).toEqual({ small: 0, snapped: 0, largest: 0, facing: 0, largestFacing: 0 });
    ca.close();
  });
});

describe('a watcher (the map viewer Online setting, 2026-09-29)', () => {
  it('joins as a spectator outside the queue, drives no walk, sees the players, and is never promoted', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
    const m = map();
    const room = new Room(m, null, { now: () => Date.now() });
    const a = new PageWalk(m.grid), w = new PageWalk(m.grid);
    w.locked = false;
    const hellos: unknown[] = [];
    const watchSocket = (url: string): WebSocketLike => {
      const s = pair(room, 2)(url);
      const send = s.send.bind(s);
      s.send = (data) => { if (typeof data === 'string') hellos.push(JSON.parse(data)); send(data); };
      return s;
    };
    const ca = new NetClient({ url: 'mem', map: 'MP99', name: 'A', socket: pair(room, 1) }, a);
    const cw = new NetClient({ url: 'mem', map: 'MP99', name: 'W', socket: watchSocket, watch: true }, w);
    expect(w.tap).toBeNull();                                        // the walk is not driven
    expect(w.locked).toBe(false);
    for (let t = 0; t < 120; t++) {
      a.play({ forward: t > 30 ? 1 : 0, right: 0, yaw: 270, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 });
      room.step();
      vi.advanceTimersByTime(1000 / 60);
    }
    expect(hellos[0]).toMatchObject({ type: 'hello', watch: true });
    expect(cw.role).toBe('spectator');
    expect(cw.queue).toBe(0);
    expect(ca.role).toBe('player');
    expect(cw.bodies().map((b) => b.id)).toEqual([1]);              // it sees the player
    expect(room.lobby.watching(2)).toBe(true);
    expect(room.lobby.spectators().map((s) => s.id)).toEqual([2]);
    ca.close();                                                     // the only player leaves: the watcher stays one
    room.step();
    expect(room.lobby.member(2)?.role).toBe('spectator');
    expect(room.lobby.players()).toEqual([]);
    cw.close();
    expect(w.tap).toBeNull();
    expect(w.locked).toBe(false);
  });
});

describe('PL-8: the client of an idler moved out (protocol 5 `demoted`)', () => {
  it('turns spectator: no commands go up after it, the mover is held', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
    const sent: (string | Uint8Array)[] = [];
    let page: WebSocketLike | null = null;
    const walk = new PageWalk(map().grid);
    const client = new NetClient({
      url: 'mem', map: 'MP99', name: 'Idle', socket: () => {
        page = {
          binaryType: 'arraybuffer', readyState: 1, onopen: null, onclose: null, onmessage: null, onerror: null,
          send: (d) => { sent.push(d); }, close: () => undefined,
        };
        return page;
      },
    }, walk);
    page!.onopen?.({});
    page!.onmessage?.({ data: JSON.stringify({ type: 'welcome', id: 1, version: PROTOCOL_VERSION, map: 'MP99', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Idle', players: [], rules: 'respawn', round: 1, rounds: 11, ghost: false }) });
    page!.onmessage?.({ data: JSON.stringify({ type: 'spawn', id: 1, at: [0, 0, 0], yaw: 0, after: 0 }) });
    walk.play({ forward: 1, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 });
    expect(sent.some((d) => typeof d !== 'string')).toBe(true);
    page!.onmessage?.({ data: JSON.stringify({ type: 'demoted', position: 2 }) });
    expect(client.role).toBe('spectator');
    expect(client.queue).toBe(2);
    expect(walk.locked).toBe(true);
    const before = sent.length;
    for (let i = 0; i < 5; i++) walk.play({ forward: 1, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 });
    expect(sent.slice(before).filter((d) => typeof d !== 'string')).toHaveLength(0);
  });
});

// ---- NCW-3: Case A measured past 150 ms (docs/plans/2026-11-05-netcode-wave.md sections 1 and 5) ---------------------

/**
 * NCW-3 (a test instrument, product track: it measures and changes nothing the game does). A mover runs a fixed
 * circle; a watcher 50 ms away (jitter 10) draws it through its own `NetClient.bodies()`; the mover's own page counts its
 * corrections. The network is a TCP-like line each way (`Line`: in order, jitter bunching, never reordering; no loss --
 * on TCP a loss is a stall), the room stepped by the match server's own loop rule (`ServerLoop`, `server.ts:951-990`).
 * Rows: the mover's one-way latency (jitter latency/5) x its stalls (none; up, its commands held 150-400 ms every 2 s;
 * down, its snapshots held so); and room hitches (ef's dossier via the lane seat: the server's loop blocked 260, 500 or
 * 800 ms every 3 s) under a steady mover at 128 ms one way, no jitter.
 */
type StallDir = 'none' | 'up' | 'down';
interface NcwCase { label: string; latency: number; jitter: number; stall: StallDir; hitch: number }
interface NcwRow { dash: number; held: number; count: number; max: number; total: number }
/** The room's own signals for the mover over the run (read, not pinned): its multi-command steps and dropped stretches. */
interface NcwSignals {
  bursts: number; largestBurst: number; drops: Record<string, number>;
  /** The re-check's F3: the own page's facing corrections, and the frame each own position correction came at. */
  facing: number; frames: number[];
}

const NCW_FRAMES = 780, NCW_RUN = [60, 660] as const;
const NCW_STALL = { firstMs: 1500, everyMs: 2000, minMs: 150, maxMs: 400 };
const NCW_HITCH = { firstMs: 1500, everyMs: 3000 };

/** A page's socket to the room behind a line each way; the room takes its frames through the server's loop. */
function linePair(room: Room, id: number, loop: ServerLoop, up: Line, down: Line): (url: string) => WebSocketLike {
  return () => {
    const inner: WebSocketLike = {
      binaryType: 'arraybuffer', readyState: 0, onopen: null, onclose: null, onmessage: null, onerror: null,
      send(data) {
        loop.inbound(() => {
          if (typeof data === 'string') {
            const ev = JSON.parse(data);
            if (ev.type === 'hello') room.hello(id, conn, ev);
            else room.text(id, ev);
          } else room.binary(id, data);
        });
      },
      close() { room.leave(id); },
    };
    const conn = {
      send: (frame: Uint8Array | string) => inner.onmessage?.({ data: typeof frame === 'string' ? frame : frame.slice().buffer }),
      close: () => inner.onclose?.({ code: 1000, reason: '' }),
    };
    setTimeout(() => { inner.readyState = 1; inner.onopen?.({}); }, 0);
    return lineSocket(inner, up, down);
  };
}

function measureCase(c: NcwCase): NcwRow & { signals: NcwSignals } {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
  let seed = 4242 + c.latency * 7 + c.hitch * 13 + (c.stall === 'up' ? 1 : c.stall === 'down' ? 2 : 0);
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const m = map(0);
  // The room's clock is the server loop's (the re-check's F2: a long step reads the hitch's start).
  let clock: ServerLoop | null = null;
  const room = new Room(m, null, { now: () => clock?.roomNow() ?? Date.now() });
  const loop = clock = new ServerLoop(() => room.step(), c.hitch ? { ...NCW_HITCH, ms: c.hitch } : null);
  const spec = (stalled: boolean): LineSpec => ({ latencyMs: c.latency, jitterMs: c.jitter, stall: stalled ? NCW_STALL : null });
  const page = new PageWalk(m.grid), eye = new PageWalk(m.grid);
  const tally = nudgeTally(page);
  const mover = new NetClient({
    url: 'mem', map: 'MP99', name: 'Mover',
    socket: linePair(room, 1, loop, new Line(spec(c.stall === 'up'), random), new Line(spec(c.stall === 'down'), random)),
  }, page);
  const watcher = new NetClient({
    url: 'mem', map: 'MP99', name: 'Watch', watch: true,
    socket: linePair(room, 2, loop, new Line({ latencyMs: 50, jitterMs: 10 }, random), new Line({ latencyMs: 50, jitterMs: 10 }, random)),
  }, eye);
  let yaw = 0;
  mover.on((ev) => { if (ev.type === 'spawn') yaw = ev.yaw; });
  loop.start();
  const T = 1000 / 60;
  const track: (V3 | null)[] = [];
  const steps: number[] = [], speeds: number[] = [], frames: number[] = [];
  let last: V3 | null = null;
  for (let t = 0; t < NCW_FRAMES; t++) {
    const running = t >= NCW_RUN[0] && t < NCW_RUN[1];
    // The fixed path: a circle at full stick, the look turned a degree a tick; held where it ends once the stick lets go.
    page.play({ forward: running ? 1 : 0, right: 0, yaw: yaw + Math.max(0, Math.min(t, NCW_RUN[1] - 1) - NCW_RUN[0]), pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 });
    vi.advanceTimersByTime(T);
    const s = page.sim?.walker.state;
    if (s) {
      const here: V3 = [s.x, s.y, s.z];
      if (last && running && t >= NCW_RUN[0] + 60) { steps.push(Math.hypot(here[0] - last[0], here[2] - last[2])); speeds.push(Math.hypot(s.vx, s.vz)); }
      last = here;
    }
    const n = mover.corrections.small + mover.corrections.snapped;
    while (frames.length < n) frames.push(t);                     // the frame each own position correction came at
    const b = watcher.bodies().find((x) => x.id === 1);
    track.push(b ? [b.feet[0], b.feet[1], b.feet[2]] : null);
  }
  loop.stop();
  expect(mover.role).toBe('player');
  // The run speed: the mover's own prediction's median step a tick (60 ticks a second), at full stick.
  steps.sort((a, b) => a - b);
  const runSpeed = steps[steps.length >> 1]! * 60;
  expect(runSpeed).toBeGreaterThan(50);
  // The walker's own velocity is that speed in units a second (`tools/mp-bots.ts` takes its run speed from it).
  speeds.sort((a, b) => a - b);
  expect(Math.abs(speeds[speeds.length >> 1]! - runSpeed) / runSpeed).toBeLessThan(0.05);
  // Commanding as the watcher can draw it: from the first frame the drawn body moves to the frame the stick lets go.
  const moved = (i: number): boolean => !!(track[i - 1] && track[i] && Math.hypot(track[i]![0] - track[i - 1]![0], track[i]![2] - track[i - 1]![2]) > 0.01);
  let first = NCW_RUN[0];
  while (first < NCW_RUN[1] && !moved(first)) first++;
  expect(first).toBeLessThan(NCW_RUN[1] - 120);
  const commanding = track.map((_, i) => i >= first && i < NCW_RUN[1]);
  const own = ownCorrections(mover, tally);
  // The review's F3: the room's signals for the mover (SVC-23b's `bursts`/`burstSizes`, a test's peek at the seat) and
  // its drop log (`takeDrops`: `command: backlog` a dropped backlog, `command: cut` a flood cut).
  const seat = (room as unknown as { players: Map<number, { signals: { bursts: number; burstSizes: Record<number, number> } }> }).players.get(1)!.signals;
  const signals: NcwSignals = { bursts: seat.bursts, largestBurst: Math.max(0, ...Object.keys(seat.burstSizes).map(Number)), drops: room.takeDrops() ?? {},
    facing: mover.corrections.facing, frames };
  mover.close(); watcher.close();
  vi.useRealTimers();
  return { dash: dashRatio(track.slice(NCW_RUN[0]), runSpeed, T), held: heldMs(track, commanding, T), count: own.count, max: own.largest, total: own.total, signals };
}

const NCW_CASES: NcwCase[] = [
  ...[0, 50, 100, 150, 200, 300, 400].flatMap((latency) => (['none', 'up', 'down'] as const).map((stall) => ({
    label: `${latency} ms, stalls ${stall}`, latency, jitter: latency / 5, stall, hitch: 0,
  }))),
  // The review's F3: the long lines again with no jitter, to part the latency's own effect from the jitter's. The table
  // prints, beside each row, the room's bursts and drops and the own page's facing corrections and the frame of each
  // position correction (the stick goes at frame 60): what the corrections come with is read there, not asserted.
  ...[300, 400].map((latency) => ({ label: `${latency} ms, no jitter, stalls none`, latency, jitter: 0, stall: 'none' as const, hitch: 0 })),
  ...[0, 260, 500, 800].map((hitch) => ({ label: `128 ms steady, room hitch ${hitch} ms`, latency: 128, jitter: 0, stall: 'none' as const, hitch })),
];

/**
 * Today's "before" numbers (measured at d8a9c2ec2 on this rig; deterministic -- the seeds and the fake clocks are fixed),
 * for NCW-4 to tighten: each row is pinned both ways within its margin, so a fix shows as a change to re-pin here and a
 * regression as a failure. dash: the ratio; held: ms; count: corrections; max, total: units. The hitch rows re-pinned
 * for the review's F2 (the long step, then the held frames, then five steps): they were 7.47/167, 15.33/400, 29.84/733.
 */
const NCW_BASELINE: Record<string, NcwRow> = {
  '0 ms, stalls none': { dash: 2.03, held: 16.7, count: 0, max: 0, total: 0 },
  '0 ms, stalls up': { dash: 10.70, held: 266.7, count: 0, max: 0, total: 0 },
  '0 ms, stalls down': { dash: 2.16, held: 16.7, count: 0, max: 0, total: 0 },
  '50 ms, stalls none': { dash: 3.03, held: 16.7, count: 0, max: 0, total: 0 },
  '50 ms, stalls up': { dash: 11.28, held: 316.7, count: 0, max: 0, total: 0 },
  '50 ms, stalls down': { dash: 2.79, held: 16.7, count: 0, max: 0, total: 0 },
  '100 ms, stalls none': { dash: 3.14, held: 33.3, count: 0, max: 0, total: 0 },
  '100 ms, stalls up': { dash: 8.95, held: 250.0, count: 0, max: 0, total: 0 },
  '100 ms, stalls down': { dash: 3.41, held: 33.3, count: 0, max: 0, total: 0 },
  '150 ms, stalls none': { dash: 3.26, held: 33.3, count: 0, max: 0, total: 0 },
  '150 ms, stalls up': { dash: 10.45, held: 300.0, count: 0, max: 0, total: 0 },
  '150 ms, stalls down': { dash: 3.42, held: 33.3, count: 0, max: 0, total: 0 },
  '200 ms, stalls none': { dash: 4.31, held: 66.7, count: 0, max: 0, total: 0 },
  '200 ms, stalls up': { dash: 16.39, held: 366.7, count: 0, max: 0, total: 0 },
  '200 ms, stalls down': { dash: 4.04, held: 66.7, count: 0, max: 0, total: 0 },
  '300 ms, stalls none': { dash: 4.91, held: 83.3, count: 6, max: 0.94, total: 3.04 },
  '300 ms, stalls up': { dash: 10.95, held: 300.0, count: 6, max: 1.20, total: 4.11 },
  '300 ms, stalls down': { dash: 5.14, held: 100.0, count: 5, max: 1.83, total: 4.12 },
  '400 ms, stalls none': { dash: 4.71, held: 66.7, count: 6, max: 3.00, total: 7.14 },
  '400 ms, stalls up': { dash: 14.12, held: 333.3, count: 5, max: 1.84, total: 6.10 },
  '400 ms, stalls down': { dash: 4.47, held: 100.0, count: 5, max: 2.56, total: 6.10 },
  '300 ms, no jitter, stalls none': { dash: 2.17, held: 16.7, count: 10, max: 2.24, total: 6.46 },
  '400 ms, no jitter, stalls none': { dash: 2.20, held: 16.7, count: 10, max: 2.03, total: 8.13 },
  '128 ms steady, room hitch 0 ms': { dash: 2.17, held: 16.7, count: 0, max: 0, total: 0 },
  '128 ms steady, room hitch 260 ms': { dash: 16.40, held: 200.0, count: 0, max: 0, total: 0 },
  '128 ms steady, room hitch 500 ms': { dash: 32.47, held: 416.7, count: 0, max: 0, total: 0 },
  '128 ms steady, room hitch 800 ms': { dash: 40.71, held: 700.0, count: 0, max: 0, total: 0 },
};

/** Within the margin: 15 % of the pin, or the absolute slack, whichever is wider. */
function pinned(value: number, pin: number, slack: number): boolean {
  return Math.abs(value - pin) <= Math.max(0.15 * Math.abs(pin), slack);
}

describe('NCW-3: Case A past 150 ms -- the watched dash, the hold and the own corrections (a measure)', () => {
  const rows: [string, NcwRow & { signals: NcwSignals }][] = [];
  afterAll(() => {
    const f = (x: number, d: number): string => x.toFixed(d);
    console.log(['', '| mover line | dash ratio | held ms | own corrections | largest | total | room bursts | largest burst | room drops | facing corrections | correction frames |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...rows.map(([l, r]) => `| ${l} | ${f(r.dash, 2)} | ${f(r.held, 0)} | ${r.count} | ${f(r.max, 2)} | ${f(r.total, 2)} | ${r.signals.bursts} | ${r.signals.largestBurst} | ${JSON.stringify(r.signals.drops)} | ${r.signals.facing} | ${r.signals.frames.join(' ') || '-'} |`)].join('\n'));
  });
  it.each(NCW_CASES)('$label', (c) => {
    const r = measureCase(c);
    rows.push([c.label, r]);
    const pin = NCW_BASELINE[c.label];
    expect(pin, `no pin for ${c.label}: ${JSON.stringify(r)}`).toBeDefined();
    expect(pinned(r.dash, pin!.dash, 0.25), `dash ${r.dash} against ${pin!.dash}`).toBe(true);
    expect(pinned(r.held, pin!.held, 2 * 1000 / 60), `held ${r.held} against ${pin!.held}`).toBe(true);
    // The review's F3: a row pinned at no correction stays at none; the slack is a non-zero row's only.
    if (pin!.count === 0) expect(r.count, `count ${r.count} against 0`).toBe(0);
    else expect(pinned(r.count, pin!.count, 2), `count ${r.count} against ${pin!.count}`).toBe(true);
    expect(pinned(r.max, pin!.max, 1), `largest ${r.max} against ${pin!.max}`).toBe(true);
    expect(pinned(r.total, pin!.total, 2), `total ${r.total} against ${pin!.total}`).toBe(true);
  }, 120_000);
});
