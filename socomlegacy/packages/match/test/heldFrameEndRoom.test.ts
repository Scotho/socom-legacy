import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CollisionOwner, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import { groundGrid, MoverSim, packGround, probeLiftOf, quantiseCommand, Walker, type Command, type SimMap } from '../../viewer/src/sim';
import { NetClient, type NetWalk, type WebSocketLike } from '../../viewer/src/net/client';
import { Room } from '../src/room';

/**
 * LATER 1148 (research 444 s9.2): the room ACCEPTS the ground walk's frame-end step. A run reaching a floorless crack
 * can hold one tick's move (`groundFrameMove`, GROUND_FRAME_TICKS_READING: the tick between two frame ends that would
 * end over no floor) and take it with its own on the tick that ends the game frame -- the body still for one command,
 * then two run ticks' move (2 x 65 / 60 = 2.17) on the next. The room has no move refusal to meet it with: it re-runs
 * each command on its own `Walker` (`room.ts`, `p.sim.apply`), and the page reconciles against the room's state
 * (`net/client.ts`, `SNAP_DISTANCE`, `CORRECTION_FLOOR`). This holds that the room's mover takes the same still command
 * and the same 2.17 step, and the page takes no correction. The harness is `netcode.test.ts`'s (the page's `NetClient`
 * against the `Room` over an in-memory socket), no latency and no loss.
 */

/** A square floor of half-side `h` round the spawn, a floorless moat `gap` wide, floor beyond: every heading meets it. */
function moat(h: number, gap: number): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor = (x0: number, z0: number, x1: number, z1: number): WorldPoly => ({
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([x0, 0, z1, x1, 0, z1, x1, 0, z0, x0, 0, z0]),
  });
  const o = h + gap;
  const polys = [floor(-h, -h, h, h), floor(-1000, -1000, -o, 1000), floor(o, -1000, 1000, 1000), floor(-o, -1000, o, -o), floor(-o, o, o, 1000)];
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  const ground = packGround(params, polys, owners);
  const slot = (side: 0 | 1, x: number, z: number): SpawnSlot => ({ side, index: 0, position: [x, 0, z], onFloor: true, step: 2, facing: [1, 0], loc: { map: 0, x: 0, z: 0 } });
  return { stem: 'MP99', name: 'MOAT', ground, grid: groundGrid(ground), spawns: null, slots: [slot(0, 0, 0), slot(1, 0, 10)], respawns: [], notes: [] };
}

/** `WalkMode` as the net client drives it (`netcode.test.ts`'s `PageWalk`, without the look's offset). */
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
  nudgeFacing(dyaw: number, dpitch: number): void { const s = this.sim!.walker.state; s.yaw += dyaw; s.pitch += dpitch; }
  play(input: Omit<Command, 'seq'>): void {
    const seq = ++this.taps;
    if (!this.sim || this.locked) { this.tap?.({ ...input, forward: 0, right: 0, buttons: 0 }, [0, 0, 0]); return; }
    const cmd = quantiseCommand({ ...input, seq });
    this.sim.apply(cmd);
    const s = this.sim.walker.state;
    this.tap?.(cmd, [s.x, s.y, s.z], [s.yaw, s.pitch]);
  }
}

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

/** The run's step a tick: `seal_run` 65 u/s (scene/src/tuning.ts, SEAL_LOCOMOTION) at the 60 Hz tick. */
const RUN_TICK_STEP = 65 / 60;

describe('LATER 1148: the room and the frame end\'s held move', () => {
  it('a run into a floorless moat: the room\'s mover takes a still command then a 2.17 step, as the page did, with no correction', () => {
    let doubles = 0;
    for (let k = 0; k < 8; k++) {                                  // the moat's place over the frame end's phases (2.17 / 8 apart)
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
      const m = moat(40 + k * (2 * RUN_TICK_STEP) / 8, 1.0);
      const room = new Room(m, null, { now: () => Date.now() });
      const page = new PageWalk(m.grid);
      const client = new NetClient({ url: 'mem', map: 'MP99', name: 'Moat', socket: pair(room, 1) }, page);
      let yaw = 0;
      client.on((ev) => { if (ev.type === 'spawn') yaw = ev.yaw; });
      const still = { forward: 0, right: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
      for (let t = 0; t < 600 && !page.sim; t++) { page.play({ ...still, yaw }); room.step(); vi.advanceTimersByTime(1000 / 60); }
      expect(page.sim, 'the page stood its mover (the spawn heard)').not.toBeNull();
      for (let t = 0; t < 30; t++) { page.play({ ...still, yaw }); room.step(); vi.advanceTimersByTime(1000 / 60); }
      // The room's mover, command by command (`room.ts` runs each through `p.sim.apply`).
      const sim = room.player(1)!.sim;
      const seen: { seq: number; x: number; z: number }[] = [];
      const apply = sim.apply.bind(sim);
      sim.apply = (c: Command) => { const r = apply(c); seen.push({ seq: c.seq, x: sim.walker.state.x, z: sim.walker.state.z }); return r; };
      for (let t = 0; t < 90; t++) { page.play({ ...still, forward: 1, yaw }); room.step(); vi.advanceTimersByTime(1000 / 60); }
      for (let t = 0; t < 30; t++) { page.play({ ...still, yaw }); room.step(); vi.advanceTimersByTime(1000 / 60); }
      expect(client.corrections, `moat ${k}`).toEqual({ small: 0, snapped: 0, largest: 0, facing: 0, largestFacing: 0 });
      const s = sim.walker.state, p = page.sim!.walker.state;
      expect([s.x, s.y, s.z], `moat ${k}`).toEqual([p.x, p.y, p.z]);
      for (let i = 2; i < seen.length; i++) {
        const a = seen[i - 2]!, b = seen[i - 1]!, c = seen[i]!;
        if (b.seq !== a.seq + 1 || c.seq !== b.seq + 1) continue;
        const still1 = Math.hypot(b.x - a.x, b.z - a.z), step = Math.hypot(c.x - b.x, c.z - b.z);
        expect(step, `moat ${k}, command ${c.seq}`).toBeLessThanOrEqual(2 * RUN_TICK_STEP + 1e-6);
        if (still1 === 0 && Math.abs(step - 2 * RUN_TICK_STEP) < 1e-3) doubles++;
      }
      client.close();
      vi.useRealTimers();
    }
    expect(doubles, 'the sweep meets a still command then a 2.17 step on the room\'s mover').toBeGreaterThan(0);
  });

  it('a run into a floorless moat on a THREE-tick frame: the room takes two still commands, then a 3.25 step, with no correction', () => {
    // GROUND_FRAME_TICKS_READING: a game frame is 2.002 ticks, so about one frame in 500 spans three (throttleFrameEnds:
    // the ends at n 983 and 986, the next at 1971). The room numbers its ticks by the command (`moverSim.ts` sets
    // `commandSeq` from `cmd.seq`), so a placing does not restart the count there -- the first frame after a placing is
    // three ticks only on the Walker's own count -- and the frame of seqs 984-986 is the room's cheap three-tick frame.
    // A dry run with the moat far off finds the body's place at seq 983's end (p); the moat's edge is put 0.5 past it, 2.0
    // wide: seq 984's move (p + 1.08) and 985's (p + 2.17) end over the moat and are held, 986 ends the frame at p + 3.25
    // over the floor beyond and takes the three ticks' move (3 x 65 / 60).
    const FIRST = 984, END = 986;
    const run = (h: number, gap: number): { seen: Map<number, [number, number]>; corrections: unknown; same: boolean } => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
      const m = moat(h, gap);
      const room = new Room(m, null, { now: () => Date.now() });
      const page = new PageWalk(m.grid);
      const client = new NetClient({ url: 'mem', map: 'MP99', name: 'Moat', socket: pair(room, 1) }, page);
      let yaw = 0;
      client.on((ev) => { if (ev.type === 'spawn') yaw = ev.yaw; });
      const still = { forward: 0, right: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
      const tick = (forward: number): void => { page.play({ ...still, forward, yaw }); room.step(); vi.advanceTimersByTime(1000 / 60); };
      for (let t = 0; t < 600 && !page.sim; t++) tick(0);
      expect(page.sim, 'the page stood its mover (the spawn heard)').not.toBeNull();
      const sim = room.player(1)!.sim;
      const seen = new Map<number, [number, number]>();
      let last = 0;
      const apply = sim.apply.bind(sim);
      sim.apply = (c: Command) => { const r = apply(c); last = c.seq; seen.set(c.seq, [sim.walker.state.x, sim.walker.state.z]); return r; };
      for (let t = 0; t < 1200 && last < FIRST - 45; t++) tick(0);   // still to seq 939; the run's ramp is done by 984
      for (let t = 0; t < 1200 && last < END + 10; t++) tick(1);
      for (let t = 0; t < 30; t++) tick(0);
      const s = sim.walker.state, p = page.sim!.walker.state;
      const out = { seen, corrections: client.corrections, same: s.x === p.x && s.y === p.y && s.z === p.z };
      client.close();
      vi.useRealTimers();
      return out;
    };
    const dry = run(500, 1.0).seen;
    const [bx, bz] = dry.get(Math.min(...dry.keys()))!;           // the body before the run
    const [px, pz] = dry.get(FIRST - 1)!;
    expect(Math.min(Math.abs(px - bx), Math.abs(pz - bz)), 'the run is along an axis, as the moat\'s square').toBeLessThan(1e-6);
    const p = Math.abs(px - bx) > Math.abs(pz - bz) ? Math.abs(px) : Math.abs(pz);   // the moat's edges are at +-h on each axis
    const [qx, qz] = dry.get(FIRST)!;
    expect(Math.hypot(qx - px, qz - pz), 'at the run\'s whole speed by seq 984').toBeCloseTo(RUN_TICK_STEP, 6);
    const r = run(p + 0.5, 2.0);
    expect(r.corrections).toEqual({ small: 0, snapped: 0, largest: 0, facing: 0, largestFacing: 0 });
    expect(r.same, 'the room\'s body is the page\'s').toBe(true);
    const at = (seq: number): [number, number] => r.seen.get(seq)!;
    const d = (a: number, b: number): number => Math.hypot(at(b)[0] - at(a)[0], at(b)[1] - at(a)[1]);
    expect(d(FIRST - 1, FIRST), 'seq 984 still').toBe(0);
    expect(d(FIRST, FIRST + 1), 'seq 985 still').toBe(0);
    expect(d(END - 1, END), 'seq 986: the three ticks\' move').toBeCloseTo(3 * RUN_TICK_STEP, 6);
  });
});
