import { describe, expect, it, vi } from 'vitest';
import { holdBits } from '../../viewer/src/net/protocol';
import { HOLD_CODES } from '../../viewer/src/mover';
import { lookAllowance, OPEN_LOOK_CONTEXT } from '../../viewer/src/net/lookGate';
import { shortTurn, wrapYaw } from '../../viewer/src/yaw';
import { type CollisionOwner, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import {
  Button, encodeCommands, groundGrid, groundPolygons, MoverSim, packGround, PROTOCOL_VERSION, TICK_HZ, Traversal, Walker, type Command, type ServerEvent, type SimMap,
} from '../../viewer/src/sim';
import { BACKLOG_BOUND_PLACEHOLDER, CREDIT_MAX, GAP_WAIT, MAX_BATCH, RENAME_EVERY_MS_PLACEHOLDER, Room, SCORE_EVERY_TICKS_PLACEHOLDER, type Conn } from '../src/room';

/**
 * NET-ROOM (web research 223): the netcode review of 2026-10-06's room findings, held -- a client's stall drains
 * (HIGH-1), the credit is the room's steps' or the wall time's, never both (LOW-12), the score's broadcast coalesced
 * (MEDIUM-3), a rename's rate (LOW-13). Server tolerances, no game values (the game has no server: research 91 §15).
 * On a synthetic floor (the room tests' convention), so it runs without the disc.
 */

function flatMap(): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(params, [floor], owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [] };
}

class Client implements Conn {
  events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* nothing */ }
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] { return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[]; }
}

const TICK_MS = 1000 / TICK_HZ;

function setup(opts: ConstructorParameters<typeof Room>[2] = {}) {
  let now = 0;
  let seed = 1;
  const room = new Room(flatMap(), null, {
    now: () => now, random: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }, launchCountdownS: 0, ...opts,
  });
  const clients = new Map<number, Client>();
  const join = (id: number, name = ''): Client => {
    const c = new Client();
    clients.set(id, c);
    room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name, map: 'MP99' }, `10.0.0.${id}`);
    return c;
  };
  const seqs = new Map<number, number>();
  /**
   * The page's next command (its own clock: one a tick it ran), facing its last spawn's yaw as an honest page does
   * (LATER 14: `walk.ts` `respawn` snaps the camera to it; a stale look is held by the room's grace).
   */
  const cmd = (id: number): Command => {
    const seq = (seqs.get(id) ?? 0) + 1;
    seqs.set(id, seq);
    const yaw = clients.get(id)?.of('spawn').filter((e) => e.id === id).at(-1)?.yaw ?? 0;
    return { seq, forward: 1, right: 0, yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
  };
  /** Commands as the page sends them: in batches of at most `MAX_BATCH`, with the page's redundancy left out. */
  const send = (id: number, commands: Command[]): void => {
    for (let i = 0; i < commands.length; i += MAX_BATCH) room.binary(id, encodeCommands({ viewTick: room.tick, commands: commands.slice(i, i + MAX_BATCH) }));
  };
  /** One server tick on the wall clock. */
  const tick = (): void => { now += TICK_MS; room.step(); };
  const advance = (ms: number): void => { now += ms; };
  return { room, join, cmd, send, tick, advance, clients };
}

describe('LATER 157: the room tells the gate what it skipped -- its flood cut at a spawn', () => {
  /** A seat that ran 20 commands (synced), then idled `idle` ticks, then was given a new mover (its grace, nothing run). */
  function respawned(idle: number) {
    const s = setup();
    s.join(1);
    for (let t = 0; t < 20; t++) { s.send(1, [s.cmd(1)]); s.tick(); }
    for (let t = 0; t < idle; t++) s.tick();
    const p = s.room.player(1)!;
    s.room['spawn'](p as never, 'respawn');
    return { ...s, p, spawnYaw: p.sim.walker.state.yaw, tick1: lookAllowance(1, OPEN_LOOK_CONTEXT).yaw };
  }
  const drain = (s: ReturnType<typeof respawned>): void => {
    const q = s.p as unknown as { queue: unknown[] };
    for (let t = 0; t < 3000 && q.queue.length; t++) s.tick();
    expect(q.queue.length).toBe(0);
  };

  it("an honest page's upstream stall past the queue across the spawn (stale looks, its snap, the stick): the cut drops its snap, the room arms on the next and ends on the page's facing (e3's pin)", () => {
    const s = respawned(0);
    // The page heard the spawn at once (the downstream is fine) but its commands are held upstream 700 ticks: three on its
    // old look, then the snap and the full stick a tick a command. They arrive at once: the intake cuts the oldest.
    const held: Command[] = [];
    for (let k = 0; k < 700; k++) {
      held.push({ ...s.cmd(1), forward: 0, yaw: k < 3 ? wrapYaw(s.spawnYaw + 120) : wrapYaw(s.spawnYaw + (k - 3) * s.tick1) });
      s.tick();
    }
    s.room.takeDrops();
    s.send(1, held);
    s.tick();
    expect(s.room.takeDrops()).toMatchObject({ 'command: cut': 1 });
    drain(s);
    expect(Math.abs(shortTurn(s.p.sim.walker.state.yaw, held[held.length - 1]!.yaw))).toBeLessThan(0.01);
  });

  it("the review's F1: a page that idled before the spawn and floods at it buys no free look -- the report is held to the ticks since the spawn", () => {
    const s = respawned(180);                                                  // 3 s idle: the room's `unran` banked
    const far = wrapYaw(s.spawnYaw + 150);
    s.room.takeDrops();
    s.send(1, Array.from({ length: 700 }, () => ({ ...s.cmd(1), forward: 0, yaw: far })));
    s.tick(); s.tick();
    // Never the far look laid as given: held through the grace, then turned by the stick's law a command -- the burst's
    // own commands at the law (the credit's tolerance), each held turn counted.
    expect(Math.abs(shortTurn(far, s.p.sim.walker.state.yaw))).toBeGreaterThan(30);
    expect(s.room.takeDrops()?.['look: turn'] ?? 0).toBeGreaterThan(0);
  });
});

describe('HIGH-1: a client stall past the burst drains to normal latency; the speed guard holds', () => {
  /** An honest page: a command a tick, a stall of `stallTicks` (nothing sent), then the stall's commands at once. */
  function stalled(stallTicks: number) {
    const s = setup();
    s.join(1);
    for (let t = 0; t < 240; t++) { s.send(1, [s.cmd(1)]); s.tick(); }
    const held: Command[] = [];
    for (let t = 0; t < stallTicks; t++) { held.push(s.cmd(1)); s.tick(); }
    s.send(1, held);
    const queue: number[] = [];
    let last = 0;
    for (let t = 0; t < 600; t++) { const c = s.cmd(1); last = c.seq; s.send(1, [c]); s.tick(); queue.push(s.room.player(1)!.queue.length); }
    return { ...s, queue, last };
  }

  for (const [label, ticks, within] of [['2 s', 2 * TICK_HZ, 2 * TICK_HZ], ['5 s', 5 * TICK_HZ, 5 * TICK_HZ]] as const) {
    it(`a ${label} stall: the backlog is gone within ${within / TICK_HZ} s, every command run, nothing refused`, () => {
      const s = stalled(ticks);
      expect(Math.max(...s.queue.slice(within))).toBeLessThanOrEqual(1);
      expect(s.room.player(1)!.sim.seq).toBe(s.last);
      expect(s.room.takeDrops()).toBeNull();
    });
  }

  it('a stall longer than the catch-up window still ends at normal latency (the backlog past it dropped)', () => {
    const s = stalled(9 * TICK_HZ);
    expect(Math.max(...s.queue.slice(9 * TICK_HZ))).toBeLessThanOrEqual(1);
  });

  it('a crouch and a swap pressed inside a dropped backlog still take effect on the server (the presses carried)', () => {
    const s = setup();
    s.join(1);
    for (let t = 0; t < 240; t++) { s.send(1, [s.cmd(1)]); s.tick(); }
    const held: Command[] = [];
    for (let t = 0; t < 9 * TICK_HZ; t++) { held.push({ ...s.cmd(1), forward: 0 }); s.tick(); }
    s.send(1, held);
    // The 9 s stall drains on the window's unspent time until it runs out, about 4.5 s on: the queue then holds the
    // commands sent since, and is dropped but its newest. A crouch and a swap pressed 1.7 s and 2 s after the stall
    // are in the dropped part.
    for (let t = 0; t < 9 * TICK_HZ; t++) {
      const c = { ...s.cmd(1), forward: 0, weapon: t >= 120 ? 1 : 0, stance: t >= 100 ? 1 : 0 };
      if (t === 100) c.buttons |= Button.Stance;
      if (t === 120) c.buttons |= Button.Swap;
      s.send(1, [c]);
      s.tick();
    }
    expect(s.room.takeDrops()).toEqual({ 'command: backlog': 1 });
    expect(s.room.player(1)!.sim.walker.stance).toBe('crouch');
    expect(s.room.player(1)!.sim.weapon).toBe(1);
  });

  /** A 9 s stall, then the page's commands with `press(t, c)` laid on each: presses near t = 100 fall in the dropped part. */
  function droppedPresses(press: (t: number, c: Command) => void) {
    const s = setup();
    s.join(1);
    for (let t = 0; t < 240; t++) { s.send(1, [s.cmd(1)]); s.tick(); }
    const held: Command[] = [];
    for (let t = 0; t < 9 * TICK_HZ; t++) { held.push({ ...s.cmd(1), forward: 0 }); s.tick(); }
    s.send(1, held);
    const holds: string[] = [];
    const walker = s.room.player(1)!.sim.walker;
    const hold = walker.hold.bind(walker);
    vi.spyOn(walker, 'hold').mockImplementation((clip, period) => { holds.push(clip); return hold(clip, period); });
    for (let t = 0; t < 9 * TICK_HZ; t++) {
      const c = { ...s.cmd(1), forward: 0 };
      press(t, c);
      s.send(1, [c]);
      s.tick();
    }
    expect(s.room.takeDrops()).toEqual({ 'command: backlog': 1 });
    return { ...s, holds };
  }

  it('LOW-1 (research 223 s6): prone, then a jump 5 ticks later, both dropped: the server ends prone and never jumped, as the page', () => {
    const s = droppedPresses((t, c) => {
      c.stance = t >= 100 ? 2 : 0;
      if (t === 100) c.buttons |= Button.Stance;
      if (t === 105) c.buttons |= Button.Jump;                   // the page's walk refuses it: the prone's clip runs
    });
    const p = s.room.player(1)!;
    expect(p.sim.walker.stance).toBe('prone');
    expect(p.sim.jumps).toBe(0);
  });

  it('LOW-1 round 2: prone, stand 70 ticks later, a jump 80 after that, all dropped (t 60-269): the server stands and jumps, as the page', () => {
    // Each 1 s clip (`standToProne`, and back) is done on the page before the next press: the room's clocks run the
    // ticks between the dropped presses (their seq gaps), so its stand and its jump land after the clips, too.
    const s = droppedPresses((t, c) => {
      c.stance = t >= 170 ? 0 : t >= 100 ? 2 : 0;
      if (t === 100 || t === 170) c.buttons |= Button.Stance;
      if (t === 250) c.buttons |= Button.Jump;                   // the page's clips are long done: it jumps
    });
    const p = s.room.player(1)!;
    expect(p.sim.walker.stance).toBe('stand');
    expect(p.sim.jumps).toBe(1);
  });

  // Round 3 of the review (BLOCKING): a seq is the client's (a u32), so it never decides elapsed time. The clocks a drop
  // runs are bounded by the ticks the room observed this player not run, each gap at most GAP_WAIT; a seq implausibly
  // far ahead is refused in `binary` (a strike, its answer false).
  it('LOW-1 round 3: a burst 2^28 seqs apart is refused (a strike), costs milliseconds, and runs no clock', () => {
    const s = setup();
    s.join(1);
    for (let t = 0; t < 240; t++) { s.send(1, [{ ...s.cmd(1), forward: 0 }]); s.tick(); }
    const p = s.room.player(1)!;
    const prone = { ...s.cmd(1), forward: 0, stance: 2, buttons: Button.Stance };
    s.send(1, [prone]); s.tick();
    expect(p.sim.walker.action?.name).toBe('standToProne');
    const at = p.sim.walker.action!.t;
    const last = prone.seq;
    const burst: Command[] = Array.from({ length: 14 }, (_, i) => ({ ...prone, seq: last + 1 + i * 2 ** 28, buttons: Button.Jump }));
    const started = performance.now();
    expect(s.room.binary(1, encodeCommands({ viewTick: s.room.tick, commands: burst }))).toBe(false);   // a strike
    s.tick();
    expect(performance.now() - started).toBeLessThan(200);
    expect(p.queue.every((c) => c.seq - last < 2 ** 20)).toBe(true);
    expect(p.sim.walker.action?.name).toBe('standToProne');                  // its clock: one tick on, no more
    expect(p.sim.walker.action!.t).toBeCloseTo(at + 1 / TICK_HZ, 6);
    expect(s.room.takeDrops()).toMatchObject({ 'command: ahead': 13 });
  });

  it('LOW-1 round 3: fake seq gaps inside a dropped backlog buy no clock: a second jump 15 real ticks on is refused, as the page', () => {
    // The stall of `droppedPresses`; the jump at t = 100 and another at t = 115, the 15 commands between sent 6 seqs
    // apart (90 ticks of seq, 15 real): the jump's clip (about 63 ticks) still runs at the second on the page.
    let shift = 0;
    const s = droppedPresses((t, c) => {
      if (t > 100 && t <= 115) shift += 5;
      c.seq += shift;
      if (t === 100 || t === 115) c.buttons |= Button.Jump;
    });
    expect(s.room.player(1)!.sim.jumps).toBe(1);
  });

  it('LOW-1: a throw\'s one-shot hold (HOLD_SHIFT) in a dropped backlog plays once on the server, not never and not twice', () => {
    const clip = HOLD_CODES[0]!;
    const s = droppedPresses((t, c) => { if (t === 100) c.buttons |= holdBits(clip); });
    expect(s.holds).toEqual([clip]);
  });

  /**
   * NET-FIX3 B2 (research 223 s6): a run, a 9 s stall still running, then (t after the stall) the stick let go and prone
   * at t = 100 -- the page's walk, moving, dives (`Traversal.dive`) -- with `press(t, c)` laid on each command after.
   * The page's prediction is the same commands through the shared `MoverSim` on its own mover, every one with its real
   * movement (`MoverSim.apply`, as `WalkMode` runs them); the room's dropped part (t 60-269) has no movement to give.
   */
  function runProneDropped(press: (t: number, c: Command) => void) {
    const s = setup();
    s.join(1);
    const p = s.room.player(1)!;
    const page = new MoverSim(new Walker(groundGrid(s.room.map.ground)), new Traversal(groundGrid(s.room.map.ground), groundPolygons(s.room.map.ground)));
    const st = p.sim.walker.state;
    page.walker.place(st.x, st.y, st.z);
    page.walker.state.yaw = st.yaw;
    let pageDived = false;
    const sent: Command[] = [];
    const go = (c: Command): Command => { sent.push(c); page.apply(c); return c; };
    for (let t = 0; t < 240; t++) { s.send(1, [go(s.cmd(1))]); s.tick(); }
    const held: Command[] = [];
    for (let t = 0; t < 9 * TICK_HZ; t++) { held.push(go(s.cmd(1))); s.tick(); }
    s.send(1, held);
    // The room's mover as the drop leaves it, and the page's after the same command (the dropped part's last).
    const room = s.room as unknown as { dropBacklog(q: typeof p): void };
    const drop = room.dropBacklog.bind(room);
    let atDrop: { room: [string, boolean]; seq: number } | null = null;
    vi.spyOn(room, 'dropBacklog').mockImplementation((q) => {
      const before = q.sim.seq;
      drop(q);
      if (!atDrop && q.sim.seq !== before) atDrop = { room: [q.sim.walker.stance, q.sim.moves!.busy()], seq: q.sim.seq };
    });
    const pageAt = new Map<number, [string, boolean]>();
    for (let t = 0; t < 9 * TICK_HZ; t++) {
      const c = s.cmd(1);
      if (t >= 100) { c.forward = 0; c.stance = 2; }
      if (t === 100) c.buttons |= Button.Stance;
      press(t, c);
      go(c);
      pageAt.set(c.seq, [page.walker.stance, page.moves!.busy()]);
      if (t === 100) pageDived = page.moves!.busy();
      s.send(1, [c]);
      s.tick();
    }
    expect(s.room.takeDrops()).toEqual({ 'command: backlog': 1 });
    expect(pageDived).toBe(true);                                  // the page dived: it was running at the press
    const at = atDrop as { room: [string, boolean]; seq: number } | null;
    expect(at).not.toBeNull();
    return { p, page, atDrop: at!.room, pageAtDrop: pageAt.get(at!.seq)! };
  }

  it('NET-FIX3 B2: a run-prone dive inside a dropped backlog: the room ends prone and free, as the page', () => {
    const { p, page, atDrop, pageAtDrop } = runProneDropped(() => {});
    // At the drop (the dropped part's last command): the page's dive long over, prone and free; the room's the same --
    // not a dive started from the last real speed that no dropped tick can end.
    expect(pageAtDrop).toEqual(['prone', false]);
    expect(atDrop).toEqual(pageAtDrop);
    expect([p.sim.walker.stance, p.sim.moves!.busy()]).toEqual([page.walker.stance, page.moves!.busy()]);
  });

  it('NET-FIX3 B2: the run-prone dive, then a stand 70 ticks later, both dropped: the room stands, as the page', () => {
    const { p, page } = runProneDropped((t, c) => {
      if (t >= 170) c.stance = 0;
      if (t === 170) c.buttons |= Button.Stance;
    });
    expect(page.walker.stance).toBe('stand');
    expect(p.sim.walker.stance).toBe(page.walker.stance);
  });

  it('NET-FIX3 B2: the run-prone dive, the stand, then a swap to the pistol, all dropped: standing with the pistol, as the page', () => {
    const { p, page } = runProneDropped((t, c) => {
      if (t >= 170) c.stance = 0;
      if (t === 170) c.buttons |= Button.Stance;
      if (t >= 250) c.weapon = 1;
      if (t === 250) c.buttons |= Button.Swap;
    });
    expect([page.walker.stance, page.weapon]).toEqual(['stand', 1]);
    expect([p.sim.walker.stance, p.sim.weapon]).toEqual([page.walker.stance, page.weapon]);
  });

  /**
   * NET-DIVE (research 223 s6.6): a run with no stall in its commands' presses, a 9 s stall still running, and the dive
   * pressed `lead` commands before the last one the room runs before its drop -- so the room's dive, begun on real ticks,
   * is still running when the drop starts and owns its ticks (`TickDriver.owns`): `Walker.elapse` runs no clock and
   * `busy()` refuses every later dropped press. `press(k, c)` lays presses on each command, `k` its seq less the last
   * run's. The page's prediction is the same commands through the shared `MoverSim` with their real movement.
   */
  function diveAtDrop(lead: number, press: (k: number, c: Command) => void) {
    const scenario = (pressAt: (seq: number, c: Command) => void) => {
      const s = setup();
      s.join(1);
      const p = s.room.player(1)!;
      const grid = groundGrid(s.room.map.ground);
      const page = new MoverSim(new Walker(grid), new Traversal(grid, groundPolygons(s.room.map.ground)));
      const st = p.sim.walker.state;
      page.walker.place(st.x, st.y, st.z);
      page.walker.state.yaw = st.yaw;
      const go = (c: Command): Command => { pressAt(c.seq, c); page.apply(c); return c; };
      for (let t = 0; t < 240; t++) { s.send(1, [go(s.cmd(1))]); s.tick(); }
      const held: Command[] = [];
      for (let t = 0; t < 9 * TICK_HZ; t++) { held.push(go(s.cmd(1))); s.tick(); }
      s.send(1, held);
      const room = s.room as unknown as { dropBacklog(q: typeof p): void };
      const drop = room.dropBacklog.bind(room);
      let atDrop: { last: number; kind: string; before: [number, number]; after: [number, number]; busy: boolean } | null = null;
      vi.spyOn(room, 'dropBacklog').mockImplementation((q) => {
        const last = q.sim.seq, w = q.sim.walker.state;
        const kind = (q.sim.moves as Traversal).state().kind, before: [number, number] = [w.x, w.z];
        drop(q);
        if (!atDrop && q.sim.seq !== last) atDrop = { last, kind, before, after: [w.x, w.z], busy: q.sim.moves!.busy() };
      });
      for (let t = 0; t < 9 * TICK_HZ; t++) { s.send(1, [go(s.cmd(1))]); s.tick(); }
      expect(s.room.takeDrops()).toEqual({ 'command: backlog': 1 });
      const at = atDrop as { last: number; kind: string; before: [number, number]; after: [number, number]; busy: boolean } | null;
      expect(at).not.toBeNull();
      return { p, page, at: at! };
    };
    // The probe: the last command the room runs before its drop (the credit's, not the commands' presses).
    const { at: probe } = scenario(() => {});
    const dive = probe.last - lead;
    const run = scenario((seq, c) => {
      if (seq >= dive) { c.forward = 0; c.stance = 2; }
      if (seq === dive) c.buttons |= Button.Stance;
      press(seq - probe.last, c);
    });
    expect(run.at.last).toBe(probe.last);
    expect(run.at.kind).toBe('dive');                              // the room's dive still runs at the drop's start
    return run;
  }

  for (const lead of [20, 40]) {
    it(`NET-DIVE: a dive pressed ${lead} ticks before the drop, then a stand and a swap dropped: standing with the pistol, as the page`, () => {
      const { p, page, at } = diveAtDrop(lead, (k, c) => {
        if (k >= 70) c.stance = 0;
        if (k === 70) c.buttons |= Button.Stance;
        if (k >= 160) c.weapon = 1;
        if (k === 160) c.buttons |= Button.Swap;
      });
      expect([page.walker.stance, page.weapon]).toEqual(['stand', 1]);
      expect([p.sim.walker.stance, p.sim.weapon]).toEqual([page.walker.stance, page.weapon]);
      // The dive's glide not credited: the drop moved the body nowhere, and left it free.
      expect(at.after).toEqual(at.before);
      expect(at.busy).toBe(false);
    });
  }

  it('NET-DIVE: a dive running at the drop with nothing pressed after it ends prone, at rest and free, as the page', () => {
    const { p, page, at } = diveAtDrop(30, () => {});
    expect(at.busy).toBe(false);
    expect(at.after).toEqual(at.before);
    expect([page.walker.stance, page.moves!.busy()]).toEqual(['prone', false]);
    expect([p.sim.walker.stance, p.sim.moves!.busy()]).toEqual([page.walker.stance, page.moves!.busy()]);
  });

  it('an honest page on a jittery line (bursts of up to 0.4 s) is refused nothing and keeps no backlog', () => {
    const s = setup();
    s.join(1);
    let rand = 7;
    const r = (): number => { rand = (rand * 16807) % 2147483647; return rand / 2147483647; };
    let held: Command[] = [];
    let release = 0;
    for (let t = 0; t < 1800; t++) {
      held.push(s.cmd(1));
      if (t >= release) { s.send(1, held); held = []; release = t + 1 + Math.floor(r() < 0.05 ? r() * 24 : 0); }
      s.tick();
    }
    s.send(1, held);
    for (let t = 0; t < 30; t++) s.tick();
    expect(s.room.player(1)!.sim.seq).toBe(1800);
    expect(s.room.player(1)!.queue.length).toBe(0);
    expect(s.room.takeDrops()).toBeNull();
  });

  it('a page sending at twice real time is held to real time (past the one-second burst), its queue bounded', () => {
    const s = setup();
    s.join(1);
    for (let t = 0; t < 240; t++) { s.send(1, [s.cmd(1)]); s.tick(); }
    const ran0 = s.room.player(1)!.ran;
    for (let t = 0; t < 1200; t++) { s.send(1, [s.cmd(1), s.cmd(1)]); s.tick(); }
    expect(s.room.player(1)!.ran - ran0).toBeLessThanOrEqual(1200 + CREDIT_MAX);
    expect(s.room.player(1)!.queue.length).toBeLessThanOrEqual(BACKLOG_BOUND_PLACEHOLDER + 2);
  });

  it('idle, then twice real time: over the catch-up window it gains no more than the window held (no speed past it)', () => {
    const s = setup();
    s.join(1);
    for (let t = 0; t < 1200; t++) s.tick();                     // 20 s idle: the window full of unspent time
    const ran0 = s.room.player(1)!.ran;
    for (let t = 0; t < 1800; t++) { s.send(1, [s.cmd(1), s.cmd(1)]); s.tick(); }
    // 30 s at twice real time: at most the 30 s, the burst and one catch-up window's unspent time.
    expect(s.room.player(1)!.ran - ran0).toBeLessThanOrEqual(1800 + CREDIT_MAX + 600);
  });
});

describe('LOW-2 (research 223 s6): a fire, reload or throw refused stale is told to its page alone', () => {
  it('a reload, a round and a throw naming commands long run: each answered `stale` with its seq, to the sender only', () => {
    const s = setup();
    const a = s.join(1), b = s.join(2);
    for (let t = 0; t < 240; t++) { s.send(1, [s.cmd(1)]); s.send(2, [s.cmd(2)]); s.tick(); }
    const v: [number, number, number] = [0, 0, 0];
    s.room.text(1, { type: 'reload', seq: 10 });
    s.room.text(1, { type: 'fire', seq: 11, viewTick: s.room.tick, from: v, dir: [0, 0, 1], eye: v, aim: v } as never);
    s.room.text(1, { type: 'throw', kind: 'M67', seq: 12, from: v, velocity: v } as never);
    expect(a.of('stale')).toEqual([{ type: 'stale', request: 'reload', seq: 10 }, { type: 'stale', request: 'fire', seq: 11 }, { type: 'stale', request: 'throw', seq: 12 }]);
    expect(b.of('stale')).toEqual([]);
  });

  it('a reload decided in time is not answered', () => {
    const s = setup();
    const a = s.join(1);
    for (let t = 0; t < 240; t++) { s.send(1, [s.cmd(1)]); s.tick(); }
    s.room.text(1, { type: 'reload', seq: s.room.player(1)!.sim.seq - 1 });
    expect(a.of('stale')).toEqual([]);
  });
});

describe('LOW-12: a stall\'s credit is its wall time once, not again for each step the loop catches up with', () => {
  const clock = (room: Room): number => (room as unknown as { serverClock: number }).serverClock;

  it('a 100 ms stall caught up in six steps of one callback credits six ticks, not ten', () => {
    const s = setup();
    s.join(1);
    for (let t = 0; t < 120; t++) s.tick();
    const before = clock(s.room);
    s.advance(100);                                              // the loop held 100 ms: six ticks' time
    for (let i = 0; i < 6; i++) s.room.step();                   // `MatchServer.loop` steps them in one callback
    expect(clock(s.room) - before).toBeCloseTo(6, 6);
    for (let t = 0; t < 60; t++) s.tick();                       // and the steady ticks after it are one each
    expect(clock(s.room) - before).toBeCloseTo(66, 6);
  });

  it('a stall the loop drops (past its five steps) is still credited its wall time (the existing rule)', () => {
    const s = setup();
    s.join(1);
    for (let t = 0; t < 120; t++) s.tick();
    const before = clock(s.room);
    s.advance(700);
    s.room.step();
    expect(clock(s.room) - before).toBeCloseTo(42, 6);
  });
});

describe('MEDIUM-3: join and leave churn is not amplified into a score broadcast a tick', () => {
  it('60 joins and leaves in a second send the others at most four score events, the last one current', () => {
    const s = setup();
    const a = s.join(1, 'Alpha');
    s.join(2, 'Bravo');
    for (let t = 0; t < 60; t++) s.tick();
    const mark = a.events.length;
    for (let t = 0; t < 60; t++) { s.join(100 + t, `Churn${t}`); s.room.leave(100 + t); s.tick(); }
    const during = a.events.slice(mark).filter((e) => e.type === 'score');
    expect(during.length).toBeGreaterThanOrEqual(1);
    expect(during.length).toBeLessThanOrEqual(4);
    s.join(300, 'Stays');
    for (let t = 0; t < 15; t++) s.tick();
    expect(SCORE_EVERY_TICKS_PLACEHOLDER).toBe(15);              // four a second at most
    const last = a.of('score').at(-1)! as Extract<ServerEvent, { type: 'score' }>;
    expect(last.rows.map((r) => r.name).sort()).toEqual(['Alpha', 'Bravo', 'Stays']);
  });

  it('a single change still goes out at the next tick (the first of a quiet spell is not delayed)', () => {
    const s = setup();
    const a = s.join(1, 'Alpha');
    for (let t = 0; t < 60; t++) s.tick();
    const mark = a.events.length;
    s.join(2, 'Bravo');
    s.tick();
    expect(a.events.slice(mark).filter((e) => e.type === 'score')).toHaveLength(1);
  });
});

describe('LOW-13: a player renames at most once each five seconds', () => {
  it('40 renames in a second are one `renamed`; the next after five seconds is taken', () => {
    const s = setup();
    s.join(1, 'Alpha');
    const b = s.join(2, 'Bravo');
    s.tick();
    for (let i = 0; i < 40; i++) { s.room.text(1, { type: 'name', name: `Alpha${i}` }); s.advance(25); }
    expect(b.of('renamed').map((e) => e.name)).toEqual(['Alpha0']);
    s.advance(5000 - 40 * 25);
    s.room.text(1, { type: 'name', name: 'Charlie' });
    expect(b.of('renamed').map((e) => e.name)).toEqual(['Alpha0', 'Charlie']);
    expect(RENAME_EVERY_MS_PLACEHOLDER).toBe(5000);
  });

  it('LOW-4 (research 223 s6): a rename held by the limit is answered to its sender alone with the name the room keeps', () => {
    const s = setup();
    const a = s.join(1, 'Alpha');
    const b = s.join(2, 'Bravo');
    s.tick();
    s.room.text(1, { type: 'name', name: 'Echo' });
    s.advance(1000);
    s.room.text(1, { type: 'name', name: 'Golf' });                // inside the five seconds: held
    expect(a.of('renamed').map((e) => [e.id, e.name])).toEqual([[1, 'Echo'], [1, 'Echo']]);   // the page reverts to Echo
    expect(b.of('renamed').map((e) => [e.id, e.name])).toEqual([[1, 'Echo']]);                // nobody else is told
  });

  it("the limit is per player: another player's rename is not held by it", () => {
    const s = setup();
    s.join(1, 'Alpha'); s.join(2, 'Bravo');
    const c = s.join(3, 'Delta');
    s.room.text(1, { type: 'name', name: 'Echo' });
    s.room.text(2, { type: 'name', name: 'Foxtrot' });
    expect(c.of('renamed').map((e) => e.name)).toEqual(['Echo', 'Foxtrot']);
  });
});

describe('NET-LOOK (OT.R38): ticks the room has no command for are ticks the look turned through, not a snap to clamp', () => {
  /** The page's look turning left at 40% of the full stick, a command a tick: its yaw after `n` ticks from `yaw0`. */
  // 40% of the fastest stick a player can set (OT.R72: SEAL or the LOOK SPEED slider's top, the gate's own tick), honest.
  const RATE = 0.4 * lookAllowance(1, OPEN_LOOK_CONTEXT).yaw;
  const turning = (s: ReturnType<typeof setup>, yaw0: number) => {
    let yaw = yaw0;
    return (): Command => { yaw = (yaw + RATE) % 360; return { ...s.cmd(1), forward: 0, yaw }; };
  };

  it("a 9 s stall while turning at 40%: past the drop the room catches up with the page's look and faces it", () => {
    const s = setup();
    s.join(1);
    const next = turning(s, s.room.player(1)!.sim.walker.state.yaw);
    for (let t = 0; t < 240; t++) { s.send(1, [next()]); s.tick(); }
    const held: Command[] = [];
    for (let t = 0; t < 9 * TICK_HZ; t++) { held.push(next()); s.tick(); }
    s.send(1, held);
    const sent = new Map<number, number>();
    const p = s.room.player(1)!;
    let lastHeld = -1, held0 = -1;
    for (let t = 0; t < 9 * TICK_HZ; t++) {
      const c = next(); sent.set(c.seq, c.yaw); s.send(1, [c]); s.tick();
      if (p.sim.looked.clampedYaw) { lastHeld = t; if (held0 < 0) held0 = t; }
    }
    // The ruling (option (c)): the drop's cover is the ruling's formula, which reads 0 here (the room ran a command this
    // tick), so the kept command of a 9 s stall is held -- the room then turns on to the page's look at the law (60% of
    // the stick spare at 40%) and faces it again: the holds end within about a second of the first.
    const drops = s.room.takeDrops()!;
    expect(drops['command: backlog']).toBe(1);
    expect(drops['look: turn'] ?? 0).toBeLessThanOrEqual(TICK_HZ + 10);
    expect(lastHeld - held0).toBeLessThanOrEqual(TICK_HZ + 10);
    expect(p.sim.walker.state.yaw).toBeCloseTo(sent.get(p.sim.seq)!, 2);   // facing the page's look at the command it ran
  });

  it('a number skipped on purpose buys no look: one command 59 past the last, facing +125, turns the waited ticks and the bank', () => {
    const s = setup();
    s.join(1);
    const p = s.room.player(1)!;
    const yaw0 = p.sim.walker.state.yaw;
    for (let t = 0; t < 240; t++) { s.send(1, [{ ...s.cmd(1), forward: 0, yaw: yaw0 }]); s.tick(); }
    s.room.takeDrops();
    let c = s.cmd(1);
    for (let k = 0; k < 58; k++) c = s.cmd(1);                       // 58 numbers never sent: the 59th past the last
    s.send(1, [{ ...c, forward: 0, yaw: (yaw0 + 125) % 360 }]);
    const before = p.sim.seq;
    for (let t = 0; t < GAP_WAIT - 1; t++) { s.tick(); expect(p.sim.seq, `tick ${t}`).toBe(before); }   // the gap waited on
    for (let t = 0; t < 10; t++) s.tick();
    expect(p.sim.seq).toBe(c.seq);
    const moved = Math.abs(((p.sim.walker.state.yaw - yaw0 + 540) % 360) - 180);
    const step = lookAllowance(1, OPEN_LOOK_CONTEXT).yaw;        // the gate's tick (OT.R72: the fastest settable gain's, 3.285 deg)
    // NET-WIRE (protocol 11): the cover is zero -- its own tick and the bank, the gap's wait buys nothing.
    expect(moved).toBeLessThan(step * (1 + 4) + 0.01);
    expect(s.room.takeDrops()).toMatchObject({ 'look: turn': 1 });
  });

  it('a command that arrives ahead of its predecessor is waited on (GAP_WAIT) and both are run in order', () => {
    const s = setup();
    s.join(1);
    const p = s.room.player(1)!;
    for (let t = 0; t < 240; t++) { s.send(1, [{ ...s.cmd(1), forward: 0 }]); s.tick(); }
    s.room.takeDrops();
    const a = { ...s.cmd(1), forward: 0 }, b = { ...s.cmd(1), forward: 0, buttons: Button.Stance, stance: 1 };
    const order: number[] = [];
    const prepare = p.sim.prepare.bind(p.sim);
    p.sim.prepare = (c, out) => { order.push(c.seq); return prepare(c, out); };
    s.send(1, [b]);                                                   // the later one first
    s.tick(); s.tick();
    expect(p.sim.seq).toBe(a.seq - 1);                                 // waited: neither run
    s.send(1, [a]);                                                   // within GAP_WAIT
    s.tick(); s.tick();
    expect(order.filter((q) => q === a.seq || q === b.seq)).toEqual([a.seq, b.seq]);
    expect(p.sim.walker.stance).toBe('crouch');
    expect(s.room.takeDrops()).toBeNull();
  });

  /**
   * NET-LOOK's lag-switch probes, re-run on protocol 11 (NET-WIRE, research 224 §4): the cover is zero, so a skip after any
   * prelude earns its own tick and the bank (`LOOK_SLACK_TICKS_PLACEHOLDER`, 4) and nothing more -- NET-LOOK's interim
   * bound (option (c)) let it 15 ticks more.
   */
  const skipAfter = (prelude: (s: ReturnType<typeof setup>, yaw0: number) => void): number => {
    const s = setup();
    s.join(1);
    const p = s.room.player(1)!;
    const yaw0 = p.sim.walker.state.yaw;
    for (let t = 0; t < 240; t++) { s.send(1, [{ ...s.cmd(1), forward: 0, yaw: yaw0 }]); s.tick(); }
    prelude(s, yaw0);
    let c = s.cmd(1);
    for (let k = 0; k < 58; k++) c = s.cmd(1);                       // 58 numbers never sent: the 59th past the last
    s.send(1, [{ ...c, forward: 0, yaw: (yaw0 + 125) % 360 }]);
    for (let t = 0; t < 10; t++) s.tick();
    return Math.abs(((p.sim.walker.state.yaw - yaw0 + 540) % 360) - 180);
  };
  const STEP = lookAllowance(1, OPEN_LOOK_CONTEXT).yaw;           // the gate's tick (OT.R72: the fastest settable gain's)
  const MOST = STEP * (1 + 4) + 0.01;                               // its own tick and the bank: a skip earns nothing
  for (const [label, prelude] of [
    ['59 Hz for 60 s', (s: ReturnType<typeof setup>, y: number) => { for (let t = 0; t < 60 * TICK_HZ; t++) { if (t % 60 !== 59) s.send(1, [{ ...s.cmd(1), forward: 0, yaw: y }]); s.tick(); } }],
    ['50 Hz for 60 s', (s: ReturnType<typeof setup>, y: number) => { for (let t = 0; t < 60 * TICK_HZ; t++) { if (t % 6 !== 5) s.send(1, [{ ...s.cmd(1), forward: 0, yaw: y }]); s.tick(); } }],
    ['a 1 s silence', (s: ReturnType<typeof setup>) => { for (let t = 0; t < TICK_HZ; t++) s.tick(); }],
    ['a 30-tick stall', (s: ReturnType<typeof setup>) => { for (let t = 0; t < 30; t++) s.tick(); }],
  ] as const) {
    it(`${label}, then a skip of 59 facing +125: its own tick and the bank, nothing more (the cover is zero)`, () => {
      expect(skipAfter(prelude)).toBeLessThan(MOST);
    });
  }

  it('a 200 ms stall while turning at 40% (the commands sent late, at once): never held', () => {
    const s = setup();
    s.join(1);
    const next = turning(s, s.room.player(1)!.sim.walker.state.yaw);
    for (let t = 0; t < 240; t++) { s.send(1, [next()]); s.tick(); }
    s.room.takeDrops();
    const held: Command[] = [];
    for (let t = 0; t < 12; t++) { held.push(next()); s.tick(); }
    s.send(1, held);
    let last: Command = held[held.length - 1]!;
    for (let t = 0; t < 60; t++) { last = next(); s.send(1, [last]); s.tick(); }
    expect(s.room.takeDrops()).toBeNull();
    expect(s.room.player(1)!.sim.gate.clamps).toBe(0);
  });

  it('13 commands lost past GAP_WAIT while turning at 40%: the room holds the turn the lost ticks made, then faces the page\'s look again (protocol 11: the page takes the room\'s facing)', () => {
    const s = setup();
    s.join(1);
    const next = turning(s, s.room.player(1)!.sim.walker.state.yaw);
    for (let t = 0; t < 240; t++) { s.send(1, [next()]); s.tick(); }
    s.room.takeDrops();
    for (let t = 0; t < 13; t++) { next(); s.tick(); }               // sent, and lost on the way
    let last: Command = next();
    s.send(1, [last]);
    for (let t = 0; t < 10; t++) { s.tick(); }                        // the gap waited out, then run
    const p = s.room.player(1)!;
    // NET-WIRE: no cover -- the 13 lost ticks' turn (17.1 degrees and the command's own) is past its tick and the bank.
    expect(p.sim.looked.clampedYaw).toBe(true);
    for (let t = 0; t < 30; t++) { last = next(); s.send(1, [last]); s.tick(); }
    const drops = s.room.takeDrops()!;
    expect(drops['look: turn']).toBeGreaterThanOrEqual(1);
    expect(drops['look: turn']).toBeLessThanOrEqual(3);              // the 60% of the stick spare closes it in a tick or two
    expect(p.sim.walker.state.yaw).toBeCloseTo(last.yaw, 2);
  });
});

/**
 * LATER 123 (`ASK_AT_COMMAND_ADAPTATION`): a stalled page's immediate asks named in a dropped backlog are decided at the
 * drop, each at the dropped command it names (`asksAt`, after that command's presses are laid) -- not lost 'stale' at the
 * next `settle` with nothing told. Rounds, reloads and throws in the stretch are refused 'stale' and told, as before.
 * `useDoor` and `worldDrops.claim` are watched (the room's handlers; the flat map has no door, so a decision is seen by
 * its call, whatever the handler then does).
 */
describe("LATER 123: a dropped backlog's immediate asks are decided at the drop, each at its own command", () => {
  /** A 9 s stall, then the page's commands; `at(t, seq)` asks for the command sent at t (t = 100: in the dropped part). */
  function stalledAsks(at: (t: number, seq: number, s: ReturnType<typeof setup>) => void, before?: (s: ReturnType<typeof setup>) => void) {
    const s = setup();
    const c1 = s.join(1);
    for (let t = 0; t < 240; t++) { s.send(1, [s.cmd(1)]); s.tick(); }
    before?.(s);
    const doors: number[] = [], claims: number[] = [];
    const r = s.room as unknown as { useDoor(id: number, door: number): void; worldDrops: { claim(id: number, seq: number, did: number, frame?: unknown): unknown } };
    const useDoor = r.useDoor.bind(s.room);
    r.useDoor = (id: number, door: number): void => { doors.push(s.room.tick); useDoor(id, door); };
    const claim = r.worldDrops.claim.bind(r.worldDrops);
    r.worldDrops.claim = (id: number, seq: number, did: number, frame?: unknown) => { claims.push(seq); return claim(id, seq, did, frame as never); };
    const held: Command[] = [];
    for (let t = 0; t < 9 * TICK_HZ; t++) { held.push({ ...s.cmd(1), forward: 0 }); s.tick(); }
    s.send(1, held);
    for (let t = 0; t < 9 * TICK_HZ; t++) {
      const c = { ...s.cmd(1), forward: 0 };
      s.send(1, [c]);
      at(t, c.seq, s);
      s.tick();
    }
    return { ...s, c1, doors, claims, drops: s.room.takeDrops() };
  }
  const door = (s: ReturnType<typeof setup>, seq: number): void => { s.room.text(1, { type: 'door', seq, door: 0 } as never); };
  const v: [number, number, number] = [0, 0, 0];

  it("a door named in the dropped stretch is decided (used) at the drop -- not refused 'stale' (was: lost, nothing told)", () => {
    const s = stalledAsks((t, seq, x) => { if (t === 100) door(x, seq); });
    // The setup map has no doors, so the handler refuses door 0 as out of range: HOTFIX DOOR-RESET's tally
    // ('door: shape', `useDoor`, room.ts; was silent). The point -- decided at the drop, not 'stale' -- is unchanged.
    expect(s.drops).toEqual({ 'command: backlog': 1, 'door: shape': 1 });
    expect(s.doors).toHaveLength(1);
  });

  it("a round queued before a door in the same stretch: the door used, the round still refused 'stale' and told (the order within pending changes no outcome)", () => {
    const s = stalledAsks((t, seq, x) => {
      if (t === 99) x.room.text(1, { type: 'fire', seq, viewTick: x.room.tick, from: v, dir: [0, 0, 1], eye: v, aim: v } as never);
      if (t === 100) door(x, seq);
    });
    expect(s.doors).toHaveLength(1);
    // The setup map has no doors, so the handler refuses door 0 as out of range: HOTFIX DOOR-RESET's tally
    // ('door: shape', `useDoor`, room.ts; was silent). The point -- decided at the drop, not 'stale' -- is unchanged.
    expect(s.drops).toEqual({ 'command: backlog': 1, 'door: shape': 1, 'fire: stale': 1 });
    expect(s.c1.of('stale').map((e) => e.request)).toEqual(['fire']);
  });

  it("a pickup named in the dropped stretch reaches its claim at the drop, at its own seq, and the drops judge it on the body the drop leaves -- past the stale gate (LATER 135; was 'pickup: stale'): on the flat map no drop lies, so 'gone'", () => {
    let named = 0;
    const s = stalledAsks((t, seq, x) => { if (t === 100) { named = seq; x.room.text(1, { type: 'pickup', seq, did: 1 } as never); } });
    expect(s.claims).toEqual([named]);
    expect(s.drops).toEqual({ 'command: backlog': 1, 'pickup: gone': 1 });
  });

  it("a dead body's door in the dropped stretch is decided after the respawn carry, and refused by the handler as today (no 'stale')", () => {
    const s = stalledAsks((t, seq, x) => { if (t === 100) door(x, seq); }, (x) => {
      const r = x.room as unknown as { kill(p: unknown, k: null, w: null, how: string, cause: number, clip: string): void };
      r.kill(x.room.player(1)!, null, null, 'suicide', 5, 'death_stand_chest01');
    });
    expect(s.room.player(1)!.alive).toBe(false);
    expect(s.doors).toHaveLength(1);                             // decided: the handler reached, which refuses it
    // (on the doorless setup map as 'door: shape', HOTFIX DOOR-RESET's tally, before its dead-body check)
    expect(s.drops?.['door: stale']).toBeUndefined();
  });

  it("an ask arriving after the drop, naming a dropped command, is still refused 'stale' (its command is gone: the named residue)", () => {
    let late = 0;
    const s = stalledAsks((t, seq, x) => {
      if (t === 100) late = seq;
      if (t === 8 * TICK_HZ) door(x, late);                      // long after the drop, naming the dropped command
    });
    expect(s.doors).toHaveLength(0);
    expect(s.drops).toEqual({ 'command: backlog': 1, 'door: stale': 1 });
  });
});

/**
 * LATER 136: the intake's flood cut (`binary`, past `QUEUE_MAX`) is dropped as a backlog is -- kept aside (`Player.cut`,
 * at most `QUEUE_MAX`, the excess tallied 'command: flood' once an intake) and laid at the next step's top before the
 * mounts (`dropStretch`): its presses laid, its asks decided at their commands, the mover's number moved past it (no gap
 * waited on). A page not yet synced has no body: its cut discarded and tallied, as before.
 */
describe("LATER 136: the intake's flood cut dropped as a backlog", () => {
  /** An 11 s stall: page 1 sends nothing, then its 660 held commands at once (past QUEUE_MAX: the first 60 cut). */
  function flooded(press?: (i: number, c: Command) => void) {
    const s = setup();
    const c1 = s.join(1);
    for (let t = 0; t < 240; t++) { s.send(1, [s.cmd(1)]); s.tick(); }
    const doors: number[] = [];
    const r = s.room as unknown as { useDoor(id: number, door: number): void };
    const useDoor = r.useDoor.bind(s.room);
    r.useDoor = (id: number, door: number): void => { doors.push(s.room.tick); useDoor(id, door); };
    const held: Command[] = [];
    for (let t = 0; t < 11 * TICK_HZ; t++) { const c = { ...s.cmd(1), forward: 0 }; press?.(t, c); held.push(c); s.tick(); }
    s.room.takeDrops();
    s.send(1, held);
    const p = s.room.player(1)! as unknown as { cut: Command[]; queue: Command[]; sim: { seq: number } };
    return { ...s, c1, doors, held, p };
  }
  const door = (s: ReturnType<typeof setup>, seq: number): void => { s.room.text(1, { type: 'door', seq, door: 0 } as never); };

  it("a door named in the cut part is decided at its command at the next step's top (was: refused 'stale', nothing told); the cut tallied 'command: cut'; no gap waited on", () => {
    const f = flooded();
    expect(f.p.cut.map((c) => c.seq)).toEqual(f.held.slice(0, 60).map((c) => c.seq));   // the 60 oldest kept aside
    door(f, f.held[30]!.seq);
    f.tick();
    expect(f.doors).toHaveLength(1);
    const drops = f.room.takeDrops() ?? {};
    expect(drops['command: cut']).toBe(1);
    expect(drops['door: stale'] ?? 0).toBe(0);
    expect(f.p.cut).toHaveLength(0);
    expect(f.p.sim.seq, 'the queue ran on in the same step (no GAP_WAIT)').toBeGreaterThan(f.held[59]!.seq);
  });

  it('a crouch pressed in the cut part takes effect on the server (the presses laid, as a dropped backlog\'s)', () => {
    const f = flooded((t, c) => { c.stance = t >= 40 ? 1 : 0; if (t === 40) c.buttons |= Button.Stance; });
    f.tick();
    expect(f.room.player(1)!.sim.walker.stance).toBe('crouch');
  });

  it("an ask arriving after its command was cut is refused 'stale' (its command gone: the named residue)", () => {
    const f = flooded();
    f.tick();
    f.room.takeDrops();
    door(f, f.held[30]!.seq);
    f.tick();
    expect(f.doors).toHaveLength(0);
    expect(f.room.takeDrops()?.['door: stale']).toBe(1);
  });

  it("the merge controller's bound: a flood far past QUEUE_MAX keeps the cut at QUEUE_MAX, the excess tallied once per intake that discards, no throw; the next step drops at most that", () => {
    const s = setup();
    s.join(1);
    for (let t = 0; t < 240; t++) { s.send(1, [s.cmd(1)]); s.tick(); }
    // A 30 s silence: the room's ticks not run grow (`unran`), so the intake's 'ahead' bound (QUEUE_MAX + CREDIT_MAX +
    // unran) admits a flood far past the queue -- without it, 'ahead' alone holds a flood to ~QUEUE_MAX + CREDIT_MAX.
    for (let t = 0; t < 30 * TICK_HZ; t++) s.tick();
    s.room.takeDrops();
    const p = s.room.player(1)! as unknown as { cut: Command[]; queue: Command[]; sim: { seq: number } };
    const ahead = 600 + CREDIT_MAX + (s.room as unknown as { unran(p: unknown): number }).unran(p);
    const cmds = Array.from({ length: 4000 }, () => ({ ...s.cmd(1), forward: 0 }));
    // What the rule gives, read by read (MAX_BATCH a read): 'ahead' past the bound, the queue held at 600, the cut at 600,
    // one 'flood' a read that discards past it.
    let queue = 0, cut = 0, floods = 0, aheads = 0;
    for (let i = 0; i < cmds.length; i += MAX_BATCH) {
      for (const c of cmds.slice(i, i + MAX_BATCH)) { if (c.seq - p.sim.seq > ahead) aheads++; else queue++; }
      if (queue > 600) { cut += queue - 600; queue = 600; if (cut > 600) { cut = 600; floods++; } }
    }
    expect(floods, 'the case reaches past the cut\'s bound').toBeGreaterThan(0);
    expect(() => s.send(1, cmds)).not.toThrow();
    expect(p.cut).toHaveLength(600);
    expect(p.queue).toHaveLength(600);
    expect(s.room.takeDrops()).toEqual({ 'command: flood': floods, ...(aheads ? { 'command: ahead': aheads } : {}) });
    s.tick();
    expect(p.cut).toHaveLength(0);
    expect(s.room.takeDrops()?.['command: cut']).toBe(1);
  });

  /** The review's F1: a stall's held commands, sent less one (`skip`); the cut and the room's view of seat 1. */
  function floodLess(skip: number) {
    const s = setup();
    s.join(1);
    for (let t = 0; t < 240; t++) { s.send(1, [s.cmd(1)]); s.tick(); }
    const held: Command[] = [];
    for (let t = 0; t < 11 * TICK_HZ; t++) { held.push({ ...s.cmd(1), forward: 0 }); s.tick(); }
    s.room.takeDrops();
    s.send(1, held.filter((c) => c.seq !== skip));
    const p = s.room.player(1)! as unknown as { cut: Command[]; sim: { seq: number } };
    return { ...s, held, p };
  }
  const ascending = (seqs: number[]): boolean => seqs.every((q, i) => i === 0 || q > seqs[i - 1]!);

  it("the review's F1: a late lower command under the cut's highest is refused at intake -- the cut stays in order, sim.seq never goes back", () => {
    const f = floodLess(250);
    const top = f.p.cut[f.p.cut.length - 1]!.seq;
    f.send(1, [f.held.find((c) => c.seq === 250)!]);                // a modified page's late 250, under the cut's top
    expect(ascending(f.p.cut.map((c) => c.seq))).toBe(true);
    expect(f.p.cut[f.p.cut.length - 1]!.seq).toBe(top);
    f.tick();
    expect(f.p.sim.seq).toBeGreaterThanOrEqual(top);
  });

  it("the review's F1: a re-sent cut command is refused at intake -- no duplicate in the cut", () => {
    const f = floodLess(-1);
    const again = f.held.find((c) => c.seq === f.p.cut[20]!.seq)!;
    f.send(1, [again]);
    const seqs = f.p.cut.map((c) => c.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(ascending(seqs)).toBe(true);
  });

  it("e3's guard: an honest redundant resend after a cut (the page's last 16 commands, all above the cut's top) goes in as before -- the floor refuses only what it must", () => {
    const f = floodLess(-1);
    const top = f.p.cut[f.p.cut.length - 1]!.seq;
    const q = f.room.player(1)! as unknown as { queue: Command[]; queued: Set<number> };
    // The page's next commands, then its redundancy: the last 16 again with one new one -- the new one queued, nothing refused.
    const fresh = Array.from({ length: 16 }, () => ({ ...f.cmd(1), forward: 0 }));
    f.send(1, fresh);
    const before = q.queue.length;
    const one = { ...f.cmd(1), forward: 0 };
    const honest = f.room.binary(1, encodeCommands({ viewTick: f.room.tick, commands: [...fresh.slice(1), one] }));
    expect(honest).toBe(true);
    expect(fresh.every((c) => c.seq > top)).toBe(true);
    expect(q.queued.has(one.seq)).toBe(true);
    expect(q.queue.length).toBeLessThanOrEqual(Math.max(before + 1, 600));
  });

  it("the review's F2: a cut dropped at the step's top spends its ticks once -- the mover never ticks more than the room's clock", () => {
    const s = setup();
    s.join(1);
    for (let t = 0; t < 240; t++) { s.send(1, [s.cmd(1)]); s.tick(); }
    for (let t = 0; t < TICK_HZ; t++) s.tick();                     // a 1 s silence: unran ~60, the credit full
    const cmds = Array.from({ length: 720 }, () => ({ ...s.cmd(1), forward: 0 }));
    s.send(1, cmds);
    const r = s.room as unknown as { serverClock: number };
    const p = s.room.player(1)! as unknown as { cut: Command[]; clockBase: number; ran: number; elapsed: number };
    expect(p.cut.length).toBeGreaterThan(0);
    const unspent = r.serverClock + 1 - p.clockBase - p.ran - p.elapsed;   // this step's wall time not yet run (its credit in)
    const elapsed0 = p.elapsed, ran0 = p.ran;
    s.tick();
    // The step's run spends the credit and a catch-up extra (HIGH-1's own allowance: the window's ticks plus the burst);
    // the cut's stretch adds clock ticks only out of what that leaves -- here none (was: the whole `unran` again, 60).
    expect(p.ran - ran0, "the run's charged commands and its catch-up").toBeGreaterThan(0);
    expect(p.elapsed - elapsed0, "the cut's clock ticks: what the run leaves of the unspent time").toBe(Math.max(0, Math.floor(unspent) - (p.ran - ran0)));
  });

  it("a page not yet synced has no body: its first intake's cut is discarded and tallied, never kept (a later sync would move sim.seq backward)", () => {
    const s = setup();
    s.join(1);
    const cmds = Array.from({ length: 700 }, () => ({ ...s.cmd(1), forward: 0 }));
    s.send(1, cmds);
    const p = s.room.player(1)! as unknown as { cut: Command[]; queue: Command[]; sim: { seq: number } };
    expect(p.cut).toHaveLength(0);
    expect(s.room.takeDrops()?.['command: flood']).toBeGreaterThanOrEqual(1);
    const at = p.sim.seq;
    for (let i = 0; i < 5; i++) s.tick();
    expect(p.sim.seq).toBeGreaterThan(at);                          // runs on from its queue, never backward
  });
});
