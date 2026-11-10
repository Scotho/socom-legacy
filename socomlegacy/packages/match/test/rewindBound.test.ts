import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CollisionOwner, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import {
  Button, cameraLook, centreClaim, faceToward, groundGrid, MoverSim, packGround, quantiseCommand, probeLiftOf, Walker, wrapYaw,
  type Command, type SimMap,
} from '../../viewer/src/sim';
import { INTERP_DELAY_MS, NetClient, type NetWalk, type WebSocketLike } from '../../viewer/src/net/client';
import { INTERP_DELAY_MS as PROTOCOL_INTERP_DELAY_MS, MAX_REWIND_MS, REWIND_CEILING_MS_ADAPTATION, TICK_HZ } from '../../viewer/src/net/protocol';
import {
  FIRE_ARRIVAL_JITTER_TICKS, REWIND_HISTORY_TICKS, REWIND_LINE_ALLOWANCE_MS_ADAPTATION, Room, rewindCapMs, rewindCapTicks,
} from '../src/room';

/**
 * NCW-2 B-bound (the owner's OT.R105, "400 is acceptable yes"; simulation track; the netcode wave's plan, section 4's
 * B-bound row): the room rewinds a round as far as the seat's own measured line explains -- the page's interpolation
 * (`INTERP_DELAY_MS`), the seat's smoothed heartbeat round trip (`Player.pingExact`) and a named allowance
 * (`REWIND_LINE_ALLOWANCE_MS_ADAPTATION`) -- never below today's `MAX_REWIND_MS` (200 ms) and never past
 * `REWIND_CEILING_MS_ADAPTATION` (400 ms). Unit-test evidence only: the real `Room` on a flat floor, the page's
 * `NetClient` on an in-memory socket; no browser, no box.
 */

describe('B-bound: the per-seat cap (`rewindCapMs`, `rewindCapTicks`)', () => {
  it("the ceiling is the owner's 400 ms; the floor is today's 200 ms; the allowance is the room's arrival jitter", () => {
    expect(REWIND_CEILING_MS_ADAPTATION).toBe(400);
    expect(MAX_REWIND_MS).toBe(200);
    expect(REWIND_LINE_ALLOWANCE_MS_ADAPTATION).toBe((FIRE_ARRIVAL_JITTER_TICKS * 1000) / TICK_HZ);   // 50 ms, 3 ticks
    // The interpolation the cap counts is the page's own (one constant, moved to the protocol).
    expect(PROTOCOL_INTERP_DELAY_MS).toBe(INTERP_DELAY_MS);
    expect(INTERP_DELAY_MS).toBe(100);
  });

  it('no measure keeps today\'s cap; a low-ping seat keeps today\'s; a high-ping seat grows to the ceiling, never past', () => {
    for (const none of [0, -5, Number.NaN]) {
      expect(rewindCapMs(none), `no measure (${none})`).toBe(MAX_REWIND_MS);
      expect(rewindCapTicks(none)).toBe(12);
    }
    expect(rewindCapMs(16)).toBe(MAX_REWIND_MS);                 // 100 + 16 + 50 = 166: the floor
    expect(rewindCapMs(20)).toBe(MAX_REWIND_MS);
    expect(rewindCapTicks(20)).toBe(12);
    expect(rewindCapMs(50)).toBe(MAX_REWIND_MS);                 // 200 exactly
    expect(rewindCapMs(100)).toBe(250);
    expect(rewindCapTicks(100)).toBe(15);
    expect(rewindCapMs(200)).toBe(350);
    expect(rewindCapTicks(200)).toBe(21);
    expect(rewindCapMs(250)).toBe(REWIND_CEILING_MS_ADAPTATION);  // 400 exactly
    expect(rewindCapMs(300)).toBe(REWIND_CEILING_MS_ADAPTATION);  // 450 capped
    expect(rewindCapTicks(300)).toBe(24);
    expect(rewindCapMs(5000)).toBe(REWIND_CEILING_MS_ADAPTATION);
    expect(rewindCapMs(Number.POSITIVE_INFINITY)).toBe(REWIND_CEILING_MS_ADAPTATION);
    // Monotonic in the measure.
    let prev = 0;
    for (let rtt = 0; rtt <= 1000; rtt += 5) { const c = rewindCapMs(rtt); expect(c).toBeGreaterThanOrEqual(prev); prev = c; }
  });

  it('the kept history holds the ceiling\'s rewind', () => {
    expect(REWIND_HISTORY_TICKS).toBeGreaterThanOrEqual(Math.ceil((REWIND_CEILING_MS_ADAPTATION / 1000) * TICK_HZ));
  });
});

/** A flat floor, two spawn slots 100 units apart along z (`rewindOutcome.test.ts`'s map, copied). */
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

/** A socket pair on no delay (`rewindOutcome.test.ts`'s `pair`, copied). */
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

/**
 * One round through the real room from seat 1, its heartbeat round trip fed as the server's sweep feeds it
 * (`noteRoundTrip`, `rttMs`; none when undefined), named at a `viewTick` (or `shownTick`) forged `backTicks` behind the
 * room's tick. Returns how far back the room's scored walk rewound the bodies (`rewoundBodies`' first read of the fire).
 */
function forged(rttMs: number | undefined, backTicks: number, field: 'viewTick' | 'shownTick' = 'viewTick'): number {
  vi.useRealTimers();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'], now: 1_000_000 });
  let seed = 11;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const m = map();
  const room = new Room(m, null, { now: () => Date.now(), random });
  const reads: { at: number; tick: number }[] = [];
  const held = room as unknown as { rewoundBodies: (...a: unknown[]) => unknown };
  const rewound = held.rewoundBodies.bind(room);
  held.rewoundBodies = (...a: unknown[]) => { reads.push({ at: a[4] as number, tick: room.tick }); return rewound(...a); };
  const a = new PageWalk(m.grid), b = new PageWalk(m.grid);
  const ca = new NetClient({ url: 'mem', map: 'MP99', name: 'Shooter', socket: pair(room, 1) }, a);
  const cb = new NetClient({ url: 'mem', map: 'MP99', name: 'Target', socket: pair(room, 2) }, b);
  const idle = { forward: 0, right: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
  let look = { yaw: 0, pitch: 0 }, fed = false;
  const step = (): void => { room.step(); vi.advanceTimersByTime(1000 / 60); };
  for (let t = 0; t < 150; t++) {
    if (!fed && rttMs !== undefined && room.player(1)) { room.noteRoundTrip(1, rttMs); fed = true; }
    b.play({ ...idle, yaw: 0 });
    const seen = a.sim && room.player(1)?.alive ? ca.bodies().find((x) => x.id === 2) : undefined;
    if (seen) { const sa = a.sim!.walker.state; look = faceToward({ feet: [sa.x, sa.y, sa.z], posture: a.sim!.walker.posture }, [seen.feet[0], seen.feet[1] + 12, seen.feet[2]]); }
    a.play({ ...idle, yaw: look.yaw, pitch: look.pitch });
    step();
  }
  if (rttMs !== undefined) expect(fed, 'the round trip fed').toBe(true);
  // The round as the page names it (`shownTick.test.ts`'s claim): aimed at the target's chest where the page draws it;
  // only the tick forged.
  const drawn = ca.bodies().find((x) => x.id === 2)!;
  const sa = a.sim!.walker.state;
  look = faceToward({ feet: [sa.x, sa.y, sa.z], posture: a.sim!.walker.posture }, [drawn.feet[0], drawn.feet[1] + 12, drawn.feet[2]]);
  b.play({ ...idle, yaw: 0 });
  a.play({ ...idle, yaw: look.yaw, pitch: look.pitch });
  const body = { feet: [sa.x, sa.y, sa.z], yaw: sa.yaw, pitch: sa.pitch, posture: a.sim!.walker.posture };
  const { eye } = cameraLook(body);
  const aim = [drawn.feet[0], drawn.feet[1] + 12, drawn.feet[2]];
  const claim = centreClaim(body, [sa.x, sa.y + 15.4, sa.z], Math.hypot(aim[0]! - eye[0], aim[1]! - eye[1], aim[2]! - eye[2]));
  const viewTick = field === 'viewTick' ? room.tick - backTicks : ca.viewTick();
  const extra = field === 'shownTick' ? { shownTick: room.tick - backTicks } : {};
  ca.send({ type: 'fire', seq: ca.lastSeq(), ...claim, weapon: 0, viewTick, ...extra } as never);
  for (let t = 0; t < 6 && !reads.length; t++) { b.play({ ...idle, yaw: 0 }); a.play({ ...idle, yaw: look.yaw, pitch: look.pitch }); step(); }
  ca.close(); cb.close();
  expect(reads.length, 'the round was decided and walked').toBeGreaterThan(0);
  return reads[0]!.tick - reads[0]!.at;
}

describe('B-bound: a forged viewTick buys no more than the seat\'s own measured line', () => {
  const back = Math.round((350 / 1000) * TICK_HZ);               // 21 ticks: 350 ms behind the room

  it('a seat measured at 20 ms round trip forging a viewTick 350 ms back is clamped at its own cap (today\'s 12 ticks)', () => {
    expect(forged(20, back)).toBe(rewindCapTicks(20));
    expect(forged(20, back)).toBe(12);
  });

  it('no measure yet: today\'s cap', () => {
    expect(forged(undefined, back)).toBe(12);
  });

  it('a seat measured at 300 ms round trip asking 350 ms back is judged there (inside its cap); 700 ms back is clamped at the ceiling', () => {
    // The round is decided a step after it is named (`due`), so its age at the room is one tick more than asked.
    expect(forged(300, back)).toBe(back + 1);
    expect(forged(300, 42)).toBe(24);
  });

  it('a pong held back (the measure inflated to 5 s) buys the ceiling and no more -- what an honest high-ping seat has', () => {
    expect(forged(5000, 60)).toBe(Math.ceil((REWIND_CEILING_MS_ADAPTATION / 1000) * TICK_HZ));
  });

  it('a forged shownTick (B-shown) is held by the same per-seat cap', () => {
    expect(forged(20, back, 'shownTick')).toBe(12);
    expect(forged(300, 42, 'shownTick')).toBe(24);
  });
});
