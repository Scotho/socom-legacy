import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { CollisionOwner, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import {
  Button, cameraLook, centreClaim, faceToward, groundGrid, holdBits, MoverSim, moverSnapshot, packGround, PROTOCOL_VERSION,
  quantiseCommand, Walker, wrapYaw,
  type Command, type SimMap,
} from '../../viewer/src/sim';
import { NetClient, type NetWalk, type WebSocketLike } from '../../viewer/src/net/client';
import { TICK_HZ } from '../../viewer/src/net/protocol';
import { ROUND_SCREENS_AFTER_S } from '../../viewer/src/roundScreens';
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
    points: Float32Array.from([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0]),
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
  /** L208 (option (ii) review F7): the last spawn's `told`, as NetClient passed it (undefined: a page-initiated spawn). */
  lastTold: { seed?: readonly [number, number, number] } | undefined = undefined;
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
  /**
   * LATER 580: the round screens' hold, as the page lays it (opt-in, `holdRounds`). `NetPage` lays `screenUp` on its
   * walk (`netPage.ts` ~:1018, `deps.walk.setRoundHold`): up from `ROUND_SCREENS_AFTER_S` after the `roundOver` ARRIVES
   * at the page (`case 'roundOver'` sets `screens.start` to the page's now; `roundScreensElapsed`) until a `roundStart`,
   * a welcome or an `abandoned` clears it. Under it `WalkMode` (`walk.ts` `setRoundHold` ~:1138, `heldFrame` ~:2696)
   * steps no mover and sends one EMPTY command a tick at the facing held: no stick, no button, no stance.
   */
  private screensFrom: number | null = null;
  constructor(readonly grid: ReturnType<typeof groundGrid>, readonly snapLook = false) {}
  holdRounds(client: NetClient): void {
    client.on((ev) => {
      if (ev.type === 'roundOver') this.screensFrom = ev.screens.length ? performance.now() + ROUND_SCREENS_AFTER_S * 1000 : null;
      else if (ev.type === 'roundStart' || ev.type === 'welcome' || ev.type === 'abandoned') this.screensFrom = null;
    });
  }
  /** Whether the page's round screens are up (`NetPage.screenUp`), so its walk is held. */
  held(): boolean { return this.screensFrom !== null && performance.now() >= this.screensFrom; }
  setNetTap(tap: typeof this.tap): void { this.tap = tap; this.taps = 0; }
  setLocked(on: boolean): void { this.locked = on; }
  respawn(at: readonly [number, number, number], yaw: number, replay: readonly Command[] = [], told?: { seed?: readonly [number, number, number] }): boolean {
    this.sim = new MoverSim(new Walker(this.grid), null);
    this.lastTold = told;
    // `walk.ts` respawn (L208): a seeded spawn re-run from its seed; an unseeded told body adopted; a page-initiated seeded.
    const seedAt = told ? told.seed : at;
    if (seedAt) { this.sim.walker.seed(seedAt[0], seedAt[1], seedAt[2]); this.sim.walker.state.yaw = yaw; this.sim.walker.runSeedFrame(); }
    else { this.sim.walker.adopt(at[0], at[1], at[2]); this.sim.walker.state.yaw = yaw; }
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
    if (this.sim && this.held()) {
      // `walk.ts` `heldFrame`: the empty command at the facing held, the mover not stepped.
      const s = this.sim.walker.state;
      const cmd = quantiseCommand({ seq, forward: 0, right: 0, yaw: s.yaw, pitch: s.pitch, turn: 0, buttons: 0, stance: 0, weapon: 0 });
      this.tap?.(cmd, [s.x, s.y, s.z], [s.yaw, s.pitch]);
      return;
    }
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

describe('L208 (option (ii) review F7): NetClient passes the room seed through to the walk', () => {
  it('the own record spawn of the page reaches the walk with the seed the first frame of the room ran from', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
    const m = map();
    const room = new Room(m, null, { now: () => Date.now() });
    const page = new PageWalk(m.grid);
    const client = new NetClient({ url: 'mem', map: 'MP99', name: 'Seed', socket: pair(room, 1) }, page);
    for (let t = 0; t < 120 && page.lastTold === undefined; t++) { room.step(); vi.advanceTimersByTime(1000 / 60); }
    expect(page.lastTold, 'the walk was told the spawn').toBeDefined();
    expect(page.lastTold!.seed, 'with its seed').toBeDefined();
    const w = room.player(1)!.sim.walker.state, p = page.sim!.walker.state;
    expect([p.x, p.y, p.z], 'the page re-ran the frame of the room: the same body').toEqual([w.x, w.y, w.z]);
    // The hand-off (glance N2; F1): a rebind to a new walk re-stands the last spawn with its kept seed.
    const next = new PageWalk(m.grid);
    client.rebind(next);
    expect(next.lastTold?.seed, 'the rebind passes the kept seed').toBeDefined();
    const q = next.sim!.walker.state;
    expect([q.x, q.y, q.z], 'the rebound walk: the same body').toEqual([w.x, w.y, w.z]);
    client.close();
    vi.useRealTimers();
  });
});

/**
 * THROTTLE-FRAME (finding 17; MISSION R8.1): fast strafe reversals -- a mid-travel sample, a sample at the centre -- at
 * shifting game-frame phases (an odd period). The snap's game frames end by the command's number (`Walker`
 * `throttleFrames`, `throttleFrameEnds`), alike on both ends, so the page's prediction and the room must still agree
 * with no correction.
 */
function flickScript(t: number, yaw: number): Omit<Command, 'seq'> {
  const k = ((t % 47) + 47) % 47, odd = Math.floor(t / 47) % 2 === 1;
  const right = k < 20 ? 1 : k === 20 ? (odd ? 0 : -0.6) : k < 40 ? -1 : k === 40 ? (odd ? 0.01 : 0.5) : 1;
  return { forward: k < 10 ? 0.4 : 0, right, yaw, pitch: -5, turn: 0, buttons: 0, stance: 0, weapon: 0 };
}

describe.each([0, 100])('THROTTLE-FRAME: strafe flicks at %i ms each way, 2 %% loss', (latency) => {
  it('predicts the flicks exactly as the server runs them: no correction, the same feet', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
    const m = map();
    const room = new Room(m, null, { now: () => Date.now() });
    const page = new PageWalk(m.grid);
    let seed = 42;                                                 // the prediction case's seed (its spawn heard in time at 100 ms)
    const client = new NetClient({
      url: 'mem', map: 'MP99', name: 'Flick', socket: pair(room, 1), simulate: { latencyMs: latency, jitterMs: latency / 5, loss: 0.02 },
      random: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; },
    }, page);
    let yaw = 0;
    client.on((ev) => { if (ev.type === 'spawn') yaw = ev.yaw; });
    // Box ft1 (da0f756c8e, 100 ms, seed 7): the page had no mover yet when the script ended -- its spawn not heard. So the
    // script waits for the page's mover (`respawn` on the spawn the client hears), at most 10 s of still commands, then runs.
    const still = { forward: 0, right: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
    for (let t = 0; t < 600 && !page.sim; t++) { page.play({ ...still, yaw }); room.step(); vi.advanceTimersByTime(1000 / 60); }
    expect(page.sim, 'the page stood its mover (the spawn heard)').not.toBeNull();
    for (let t = 0; t < 30; t++) { page.play({ ...still, yaw }); room.step(); vi.advanceTimersByTime(1000 / 60); }
    for (let t = 0; t < 400; t++) {
      page.play(flickScript(t, yaw));
      room.step();
      vi.advanceTimersByTime(1000 / 60);
    }
    for (let t = 0; t < 60; t++) { page.play({ forward: 0, right: 0, yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 }); room.step(); vi.advanceTimersByTime(1000 / 60); }
    expect(client.role).toBe('player');
    expect(client.corrections).toEqual({ small: 0, snapped: 0, largest: 0, facing: 0, largestFacing: 0 });
    const s = room.player(1)!.sim.walker, p = page.sim!.walker;
    expect([s.state.x, s.state.y, s.state.z]).toEqual([p.state.x, p.state.y, p.state.z]);
    expect(s.stickSnaps).toBe(p.stickSnaps);
    expect(p.stickSnaps).toBeGreaterThan(4);                        // the script did flick
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
      // On the deck, short of its edge (x -100, a 30 drop): at the edge the server makes the original's one move a game
      // frame -- the tick before the take-off holds and the frame end crosses whole (LATER 1148, research 444 s9.3) --
      // and a snapshot of that held tick is a step this smoothness test is not about (LATER 1152 names the draw side). The
      // cut drops the drawn fall and landing too: this test checks the drawn run on the deck only, not an airborne other.
      if (t > 120 && other && other.feet[0] < -104) xs.push(other.feet[0]);
    }
    expect(xs.length).toBeGreaterThan(80);
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

  // LATER 1148 (research 444 s9.3, the sill fault's hold): the run above leaves the deck at its edge (x -100, a 30 drop)
  // as the original makes it, one move a game frame -- the tick between two frame ends holds at the last frame end's
  // position, since its floor is a drop the frame end decides, and the frame end takes the frame's whole move and the
  // take-off. The port's own sequence, a regression pin, on the SERVER's mover (the room's walker, which the snapshots
  // come from) and on B's page prediction alike: a frame end at -100.125, the next 60 Hz step held there on the deck, the
  // one after it two ticks' move (2.167) on and airborne. (The steps are this loop's; a frame end is decided on the
  // command's sequence number, research 444.) The drawn hitch this makes is the draw side's (LATER 1152), not this test's.
  it('the server leaves the deck in one frame-end move: the tick before holds at the edge (LATER 1148)', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
    const m = map();
    const room = new Room(m, null, { now: () => Date.now() });
    const a = new PageWalk(m.grid), b = new PageWalk(m.grid);
    const ca = new NetClient({ url: 'mem', map: 'MP99', name: 'A', socket: pair(room, 1), simulate: { latencyMs: 50 } }, a);
    const cb = new NetClient({ url: 'mem', map: 'MP99', name: 'B', socket: pair(room, 2) }, b);
    type Row = { x: number; y: number; air: boolean };
    const rows: Row[] = [], page: Row[] = [];
    for (let t = 0; t < 240; t++) {
      a.play({ forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 });
      b.play({ forward: t > 30 ? 1 : 0, right: 0, yaw: 270, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 });
      room.step();
      vi.advanceTimersByTime(1000 / 60);
      const w = room.player(2)!.sim.walker, p = b.sim!.walker;
      rows.push({ x: w.state.x, y: w.state.y, air: w.airborne });
      page.push({ x: p.state.x, y: p.state.y, air: p.airborne });
    }
    for (const [who, r] of [['server', rows], ['page', page]] as const) {
      const off = r.findIndex((q) => q.air);
      expect(off, who).toBeGreaterThan(3);
      const [before, lastEnd, held, frameEnd] = [r[off - 3]!, r[off - 2]!, r[off - 1]!, r[off]!];
      // a frame end: the last position on the deck, within one frame's move (2.167) of its edge. Pinned by its place, not
      // its x: -100.125 before LATER 1164's ramp lead moved every position from rest (-101.795 since).
      expect(lastEnd.x, who).toBeLessThan(-100);
      expect(lastEnd.x, who).toBeGreaterThan(-100 - 2.167);
      expect(lastEnd.x - before.x, who).toBeCloseTo(1.083, 3);         // the run's own step into it
      expect(held.air, who).toBe(false);
      expect(held.y, who).toBe(30);                                    // still on the deck
      expect(held.x, who).toBe(lastEnd.x);                             // HELD at the last frame end's position
      expect(frameEnd.x - held.x, who).toBeCloseTo(2.167, 3);         // the frame's whole move at its end
      expect(frameEnd.x, who).toBeGreaterThan(-100);                   // past the edge
      expect(frameEnd.y, who).toBe(30);                                // the take-off: the fall starts after it
      // Every other grounded step of the run moves (no other hold on open floor), from the run's tenth moving step.
      const go = r.findIndex((q, t) => t > 0 && q.x !== r[t - 1]!.x) + 10;
      const holds = r.slice(go, off - 1).filter((q, k) => q.x === r[go + k - 1]!.x).length;
      expect(holds, `${who}: steps held on open floor`).toBe(0);
    }
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

/** Corrections the page counted, by kind (`NetClient.corrections`, its counts only). */
type CorrectionCount = { small: number; snapped: number; facing: number };

/**
 * W3.R11's run: one SEAL through a 2 s match, its round screens and the next match's start, its page held under the screens
 * as the page holds (`PageWalk.holdRounds`). The counts at the room's hold start (`room.ts` `roundScreensUp`, private: a
 * test's peek, as NCW-3's at the seat's signals), at the next match's spawn, and at the end.
 */
function nextMatchRun(): {
  latencyMs: number; spawns: number; pageHeld: boolean;
  beforeHold: NetClient['corrections'] | null; atRoomHold: CorrectionCount | null; atRespawn: CorrectionCount | null; atEnd: CorrectionCount;
} {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
  const m = map();
  const room = new Room(m, null, { now: () => Date.now(), roundSeconds: 2 });
  const latencyMs = 30;
  const a = new PageWalk(m.grid, true);                            // LATER 14: its stick snaps to each spawn's facing
  const ca = new NetClient({ url: 'mem', map: 'MP99', name: 'A', socket: pair(room, 1), simulate: { latencyMs } }, a);
  a.holdRounds(ca);                                                // LATER 580: held under the round screens, as the page is
  const count = (): CorrectionCount => ({ small: ca.corrections.small, snapped: ca.corrections.snapped, facing: ca.corrections.facing });
  const roomHeld = (): boolean => (room as unknown as { roundScreensUp(): boolean }).roundScreensUp();
  let spawns = 0, pageHeld = false;
  let beforeHold: NetClient['corrections'] | null = null, atRoomHold: CorrectionCount | null = null, atRespawn: CorrectionCount | null = null;
  ca.on((ev) => { if (ev.type === 'spawn' && ++spawns === 2) atRespawn = count(); });
  for (let t = 0; t < (2 + 16 + 23 + 3) * 60; t++) {
    a.play({ forward: 1, right: (t % 200) < 100 ? 0.4 : -0.4, yaw: t * 0.5, pitch: 0, turn: 0.1, buttons: 0, stance: 0, weapon: 0 });
    pageHeld ||= a.held();
    room.step();
    if (atRoomHold === null && roomHeld()) { atRoomHold = count(); beforeHold = { ...ca.corrections }; }
    vi.advanceTimersByTime(1000 / 60);
  }
  const atEnd = count();
  ca.close();
  return { latencyMs, spawns, pageHeld, beforeHold, atRoomHold, atRespawn, atEnd };
}

const lessCount = (x: CorrectionCount, y: CorrectionCount): CorrectionCount =>
  ({ small: x.small - y.small, snapped: x.snapped - y.snapped, facing: x.facing - y.facing });

/**
 * LATER 580's F3 adaptation cost, the bound: the room holds from `lastResult.at + ENGINE_READ_S` on its clock, the page
 * from its first screen frame, `ROUND_SCREENS_AFTER_S` after the `roundOver` arrives -- about a round trip later (`walk.ts`
 * `setRoundHold`'s doc: "the network's cost ... the room's place is the one restored"), and the reconcile lays that much
 * walk back under the first screen. At most a round trip's ticks of corrections, from the run's own latency (LATER 580
 * reopened for a wire flag that would align the two holds).
 */
// One round trip in ticks (2 x the one-way latency, at TICK_HZ), rounded up, + 1 for the tick phase: the page's first held
// frame and the room's tick that acks it need not share a tick boundary -- not slack (the netcode re-read's F1).
const roundTripTicks = (latencyMs: number): number => Math.ceil((2 * latencyMs / 1000) * TICK_HZ) + 1;

describe('a new match stands everyone at the start (M6, W3.R11)', () => {
  it('takes no correction when the server re-spawns a living player at the next match', () => {
    const r = nextMatchRun();
    expect(r.spawns).toBe(2);                                   // the first match's, and the next's
    expect(r.atRoomHold, 'the room held under the round screens').not.toBeNull();
    expect(r.pageHeld, 'the page held under the round screens').toBe(true);
    // The first match's play, up to the room's hold: no correction at all.
    expect(r.beforeHold).toEqual({ small: 0, snapped: 0, largest: 0, facing: 0, largestFacing: 0 });
    // W3.R11, exact: from the next match's start (the re-spawn) on, no correction at all.
    expect(lessCount(r.atEnd, r.atRespawn!)).toEqual({ small: 0, snapped: 0, facing: 0 });
    // LATER 580's F3 cost (`roundTripTicks`): the page's walk past the room's frozen body, laid back under the first
    // screen -- position corrections, none snapped, at most a round trip's ticks of them.
    const screenStart = lessCount(r.atRespawn!, r.atRoomHold!);
    expect(screenStart.snapped).toBe(0);
    expect(screenStart.small, `the screen-start position corrections ${JSON.stringify(screenStart)}`).toBeLessThanOrEqual(roundTripTicks(r.latencyMs));
  });

  // GAP (for the controller to file under LATER 580): the FACING is not laid back under the hold. The room holds the
  // facing it froze at (176.0 here); the page holds its own, a round trip's turn further (178.0), and sends it in each held
  // command. Each ack's facing differs past `FACING_FLOOR_DEG`, so `NetClient.reconcileFacing` counts a correction --
  // and, the held commands carrying no look-log step (`walk.ts` `heldFrame` records none, so `WalkMode.reconcileFacing`
  // has no record of the ack), falls back on the client's shadow, which steps the gate toward each held command's own yaw
  // and so turns the page by about nothing: one facing correction every held tick (600 at this run), the 2 degrees
  // never closed until the respawn. Measured with this test's model of the page (`PageWalk` has no `reconcileFacing` of
  // its own: the shadow path, the one the real walk takes for a held ack too -- source inspection, not a browser run).
  // Turns green (and this test red: drop `.fails`) once the page lays the room's facing under the hold.
  it.fails('GAP (LATER 580): the facing too is laid back under the round screens within a round trip', () => {
    const r = nextMatchRun();
    expect(r.atRoomHold).not.toBeNull();
    const screenStart = lessCount(r.atRespawn!, r.atRoomHold!);
    expect(screenStart.facing, `the screen-start facing corrections ${JSON.stringify(screenStart)}`).toBeLessThanOrEqual(roundTripTicks(r.latencyMs));
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
 * Re-pinned 2026-11-07 for INV-SPECTATE fix A (the watcher's view tick on the slewed playout clock,
 * `viewer/src/net/playoutClock.ts`; product track), dash/held against the "were" below. The dash falls on 19 of the 23
 * line rows (0 ms none 2.03 -> 1.07, 150 ms none 3.26 -> 2.54, 400 ms none 4.71 -> 3.51; the no-jitter long lines
 * 2.17/2.20 -> 1.08/1.07) and is unchanged on four: 100 ms stalls up 8.95, 150 ms stalls up 10.45, 300 ms stalls up
 * 10.95, 400 ms stalls down 4.47. The hold falls one frame on 16 rows (all the "none" and "down" rows but 300 ms
 * none and 400 ms none -- 16.7 -> 0 at 0 and 50 ms and on both no-jitter lines -- and 0 ms and 400 ms stalls up,
 * 266.7 -> 250 and 333.3 -> 316.7), is unchanged on three (50 ms stalls up 316.7, 100 ms stalls up 250, 300 ms none
 * 83.3) and rises one frame on four: 150 ms stalls up 300 -> 316.7, 200 ms stalls up 366.7 -> 383.3, 300 ms stalls up
 * 300 -> 316.7, 400 ms none 66.7 -> 83.3. The hitch rows, re-pinned again the same day for review A1's starvation
 * guard (the clock stops on the newest snapshot, and drops the stale floor, rather than running past it for up to
 * 5 s): 0 ms 2.17/16.7 -> 1.06/0; 260 ms 16.40/200 -> 8.87/200 (ac3ddfe95, the clock without the guard: 17.93/283.3);
 * 500 ms 32.47/416.7 -> 16.09/416.7 (30.65/416.7); 800 ms 40.71/700 -> 24.93/716.7 (47.49/716.7). The line rows did
 * not move with the guard. Were, line rows:
 * 2.03/16.7, 10.70/266.7, 2.16/16.7, 3.03/16.7, 11.28/316.7, 2.79/16.7, 3.14/33.3, 8.95/250, 3.41/33.3, 3.26/33.3,
 * 10.45/300, 3.42/33.3, 4.31/66.7, 16.39/366.7, 4.04/66.7, 4.91/83.3, 10.95/300, 5.14/100, 4.71/66.7, 14.12/333.3,
 * 4.47/100, 2.17/16.7, 2.20/16.7; hitch rows 2.17/16.7, 16.40/200, 32.47/416.7, 40.71/700. The corrections are unchanged.
 * Re-pinned 2026-11-25 for SEAT_CLAIM_ADAPTATION (`Room.tellSeats`): the room tells a watcher the seats a claim could
 * take (`seats`) at its welcome -- a frame more down the watcher's line (two when its hello lands before the mover's,
 * whose join changes the open seats), whose jitter draws from the run's one seeded random, so every later draw of
 * every line moves (the stall windows, the jitter) and with them the rows. No netcode changed: the same tree with
 * `tellSeats`' send left out holds the earlier pins on all 27 rows (re-run so by a fresh review, 2026-11-25). The two
 * no-jitter rows' totals had already moved on main inside their margin (6.06 and 8.55 with or without the send, against
 * the pins' 6.46 and 8.13) and are re-pinned with the rest. Were (dash/held):
 * 1.07/0.0, 9.45/250.0, 1.05/0.0, 1.56/0.0, 10.94/316.7, 1.54/0.0, 2.04/16.7, 8.95/250.0, 2.49/16.7, 2.54/16.7,
 * 10.45/316.7, 2.55/16.7, 3.49/50.0, 12.40/383.3, 3.16/50.0, 3.52/83.3, 10.95/316.7, 3.53/83.3, 3.51/83.3, 11.42/316.7,
 * 4.47/83.3, 1.08/0.0, 1.07/0.0; hitch rows 1.06/0.0, 8.87/200.0, 16.09/416.7, 24.93/716.7; the corrections (count, max,
 * total) were 300 ms 6/0.94/3.04, 6/1.20/4.11, 5/1.83/4.12; 400 ms 6/3.00/7.14, 5/1.84/6.10, 5/2.56/6.10; no jitter
 * 10/2.24/6.46, 10/2.03/8.13.
 */
const NCW_BASELINE: Record<string, NcwRow> = {
  '0 ms, stalls none': { dash: 1.08, held: 0.0, count: 0, max: 0, total: 0 },
  '0 ms, stalls up': { dash: 11.44, held: 316.7, count: 0, max: 0, total: 0 },
  '0 ms, stalls down': { dash: 1.07, held: 0.0, count: 0, max: 0, total: 0 },
  '50 ms, stalls none': { dash: 1.55, held: 0.0, count: 0, max: 0, total: 0 },
  '50 ms, stalls up': { dash: 11.96, held: 316.7, count: 0, max: 0, total: 0 },
  '50 ms, stalls down': { dash: 1.57, held: 0.0, count: 0, max: 0, total: 0 },
  '100 ms, stalls none': { dash: 2.50, held: 16.7, count: 0, max: 0, total: 0 },
  '100 ms, stalls up': { dash: 10.97, held: 316.7, count: 0, max: 0, total: 0 },
  '100 ms, stalls down': { dash: 2.51, held: 16.7, count: 0, max: 0, total: 0 },
  '150 ms, stalls none': { dash: 2.53, held: 16.7, count: 0, max: 0, total: 0 },
  '150 ms, stalls up': { dash: 11.43, held: 350.0, count: 0, max: 0, total: 0 },
  '150 ms, stalls down': { dash: 2.53, held: 16.7, count: 0, max: 0, total: 0 },
  '200 ms, stalls none': { dash: 3.49, held: 50.0, count: 0, max: 0, total: 0 },
  '200 ms, stalls up': { dash: 11.44, held: 350.0, count: 0, max: 0, total: 0 },
  '200 ms, stalls down': { dash: 3.03, held: 50.0, count: 0, max: 0, total: 0 },
  '300 ms, stalls none': { dash: 4.04, held: 50.0, count: 3, max: 0.16, total: 0.21 },
  '300 ms, stalls up': { dash: 9.96, held: 350.0, count: 9, max: 2.53, total: 9.73 },
  '300 ms, stalls down': { dash: 3.54, held: 50.0, count: 4, max: 2.30, total: 4.47 },
  '400 ms, stalls none': { dash: 4.03, held: 83.3, count: 6, max: 2.66, total: 5.60 },
  '400 ms, stalls up': { dash: 11.87, held: 350.0, count: 1, max: 5.59, total: 5.59 },
  '400 ms, stalls down': { dash: 5.00, held: 83.3, count: 6, max: 3.03, total: 6.53 },
  '300 ms, no jitter, stalls none': { dash: 1.06, held: 0.0, count: 10, max: 2.24, total: 6.06 },
  '400 ms, no jitter, stalls none': { dash: 1.06, held: 0.0, count: 10, max: 2.03, total: 8.55 },
  '128 ms steady, room hitch 0 ms': { dash: 1.07, held: 0.0, count: 0, max: 0, total: 0 },
  '128 ms steady, room hitch 260 ms': { dash: 8.36, held: 183.3, count: 0, max: 0, total: 0 },
  '128 ms steady, room hitch 500 ms': { dash: 16.09, held: 416.7, count: 0, max: 0, total: 0 },
  '128 ms steady, room hitch 800 ms': { dash: 24.93, held: 716.7, count: 0, max: 0, total: 0 },
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
