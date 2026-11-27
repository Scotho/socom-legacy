import { describe, expect, it } from 'vitest';
import type { AiLoc } from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';
import { encodeCommands, PROTOCOL_VERSION, simMapFromBytes, TICK_HZ, type ClientEvent, type Command, type SimMap } from '../../viewer/src/sim';
import { ExtractionAuthority, type ExtractionHost } from '../src/extraction';
import type { HostageWorldBody } from '../src/hostageAi';
import { FollowTrail } from '../src/hostageFollow';
import { onCommand } from '../src/hostageOrders';
import { HostagePathPlanner } from '../src/hostagePath';
import { Room, type Conn } from '../src/room';

/**
 * HOSTAGE-TRAIL-START (LATER 960; the v0.4.21 plan's V21.R2; simulation track, a reading, pending review). The start
 * gate is the same in the original and the port: a follower stands until its leader's trail measures 8 cells
 * (`FUN_005fb1c0`'s window r1 0x5fb42c-0x5fb48c, its r0004 twin r4 0x602c0c; `FollowTrail.length`, `trailStart`). What
 * the port got wrong is the TRAIL: it made a leader's trail empty at the first follow and deleted it with the last
 * follower. The original's human trail is on from the body's build (slot `+0x40` of CSealCtrl, r1 0x597e80 -> the
 * enable `FUN_00546c40`, from the build `FUN_00599f00` D:L455842) and its entries are zeroed at each placement of the
 * body (`FUN_00525200` D:L392488, from the body's slots `+0x3c` / `+0x40`: `FUN_00546e40` D:L412556, `FUN_00546cf0`
 * D:L412512); research 404 s26, read twice from both builds' bytes.
 *
 * The two follows are the Shadow PC rig's on the original (r0004, MP71, n = 1 each, 2026-11-12;
 * `agent-mail/evidence/v0420/fishhook-hostages/README.md`, outside git):
 * - follow 1A: the order given with the leader's trail running back to his spawn -- the gate byte [G+0x76] 0 at 0.42 s,
 *   and the follower moved;
 * - follow 2: the leader PLACED, then the order with a trail count of 2 -- the gate byte 1 through a 31 s stand, and the
 *   follower never moved.
 * Scored as V21.R2 asks: when the follower first moves, against the leader's cells since his last placement.
 */

const MP71 = fixture('RUN/MP71.ZDB');
type V3 = [number, number, number];
const LEADER = 1;
/** The leader's walk speed in the scenarios: 60 units a second, a cell every ten room ticks (every cell is visited). */
const WALK = 60;
const same = (a: AiLoc, b: AiLoc | null): boolean => !!b && a.map === b.map && a.x === b.x && a.z === b.z;

/** A cell-by-cell walk of `depth` cells from `from` over traversable, travellable, self-locating 4-neighbours (BFS). */
function walkFrom(planner: HostagePathPlanner, from: AiLoc, depth: number): AiLoc[] {
  const key = (c: AiLoc) => `${c.x}:${c.z}`;
  const parent = new Map<string, AiLoc | null>([[key(from), null]]);
  let ring: AiLoc[] = [from];
  for (let d = 0; d < depth && ring.length; d++) {
    const next: AiLoc[] = [];
    for (const c of ring) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = { map: c.map, x: c.x + dx, z: c.z + dz };
      if (parent.has(key(n)) || !planner.traversable(n) || !planner.canTravel(c, n)) continue;
      if (!same(n, planner.locate(planner.point(n)))) continue;
      parent.set(key(n), c); next.push(n);
    }
    ring = next;
  }
  const end = ring[0];
  if (!end) throw new Error('no walk of that depth from the hostage');
  const out: AiLoc[] = [];
  for (let c: AiLoc | null | undefined = end; c; c = parent.get(key(c))) out.push(c);
  return out.reverse();
}

/** The leader's cells since his last placement, measured as the gate measures a trail (`FUN_00527e70`, research 404 s24.2). */
function cellsSince(walked: readonly AiLoc[]): number {
  let n = 0;
  for (let i = 1; i < walked.length; i++) n += Math.hypot(walked[i]!.x - walked[i - 1]!.x, walked[i]!.z - walked[i - 1]!.z);
  return n;
}

/** An EXTRACTION authority on MP71 with one SEAL seat, the leader, moved by the test as a room moves a body. */
function scene() {
  const map: SimMap = { ...simMapFromBytes(MP71!, 'RUN/MP71.ZDB'), gameType: 4 };
  const lead: HostageWorldBody = { id: LEADER, feet: [0, 0, 0], alive: true, team: 1, yaw: 0, velocity: [0, 0, 0], topSpeed: 65, stance: 0 };
  const host: ExtractionHost = { tick: () => 0, live: () => true, random: () => 0.5, bodies: () => [lead], send: () => {},
    seat: (id) => ({ id, feet: lead.feet, alive: true, spectator: false, team: 'seal' }) };
  const ext = ExtractionAuthority.of(map, host)!;
  const planner = new HostagePathPlanner(map.ai!);
  const h = ext.hostages[0]!;
  const home = planner.locate(h.at)!;
  /** A placement of the leader's body (a spawn, a respawn, a teleport): a new stamp, as `Walker.place` gives one. */
  const place = (cell: AiLoc): void => {
    lead.feet = planner.point(cell); lead.velocity = [0, 0, 0];
    lead.placement = (lead.placement ?? 0) + 1;
    ext.step();
  };
  /** The leader walks the cells in order at `WALK`, a room tick a step. */
  const walk = (cells: readonly AiLoc[]): void => {
    for (let i = 1; i < cells.length; i++) {
      const a = planner.point(cells[i - 1]!), b = planner.point(cells[i]!), run = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const ticks = Math.max(1, Math.ceil(run / (WALK / TICK_HZ)));
      lead.yaw = (Math.atan2(-(b[0] - a[0]), -(b[2] - a[2])) * 180) / Math.PI;
      lead.velocity = [((b[0] - a[0]) / run) * WALK, 0, ((b[2] - a[2]) / run) * WALK];
      for (let k = 1; k <= ticks; k++) {
        const t = k / ticks;
        lead.feet = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        ext.step();
      }
    }
    lead.velocity = [0, 0, 0];
  };
  /** The port's start gate, open (`HostageFollow`'s start flag: the original's [G+0x76] cleared, research 404 s24.1). */
  const gateOpen = (): boolean => (h.motion as unknown as { started: boolean }).started;
  /**
   * The order (OnCommand case 4), then the leader stands `seconds`: when the gate opened and when the follower first
   * moved more than 0.5 u (the review's F2: two measures), each null if never.
   */
  const orderAndWatch = (seconds: number): { gate: number | null; moved: number | null } => {
    onCommand(h, 4, { id: LEADER, alive: true }, ext.leaders);
    const at: V3 = [h.at[0], h.at[1], h.at[2]];
    let gate: number | null = null, moved: number | null = null;
    for (let k = 1; k <= seconds * TICK_HZ && moved === null; k++) {
      ext.step();
      if (gate === null && gateOpen()) gate = k / TICK_HZ;
      if (Math.hypot(h.at[0] - at[0], h.at[2] - at[2]) > 0.5) moved = k / TICK_HZ;
    }
    return { gate, moved };
  };
  const orderAndStand = (seconds: number): number | null => orderAndWatch(seconds).moved;
  return { ext, planner, h, home, place, walk, orderAndStand, orderAndWatch, gateOpen };
}

describe.skipIf(!MP71)('HOSTAGE-TRAIL-START: the leader\'s trail lives from the build and each placement (MP71, dev-disc)', () => {
  it('follow 1A: a leader who has walked more than eight cells since his placement orders, and the follower moves at once', () => {
    const s = scene();
    const route = walkFrom(s.planner, s.home, 14);
    s.place(route[1]!);
    s.walk(route.slice(1));
    const since = cellsSince(route.slice(1));
    const { gate, moved } = s.orderAndWatch(10);
    const at = (t: number | null) => (t === null ? 'never (10 s)' : `${t.toFixed(3)} s`);
    console.log(`HTS 1A: the leader's cells since his placement ${since.toFixed(2)}; the gate opened at ${at(gate)}; the follower first moved at ${at(moved)}`);
    expect(since).toBeGreaterThanOrEqual(8);
    // The rig read the original's gate byte 0 at 0.42 s after the order (a snapshot: a bound, not the moment).
    expect(gate).not.toBeNull();
    expect(gate!).toBeLessThanOrEqual(0.42);
    expect(moved).not.toBeNull();                                // the first move: reported, not scored (s35)
  });

  it('follow 2 (a control): the leader placed, two cells walked, then the order: the follower stands the 31 s the leader stands', () => {
    const s = scene();
    const route = walkFrom(s.planner, s.home, 14);
    s.walk(route.slice(1, 10));                                    // the leader's walk before the placement: no count after it
    s.place(route[12]!);
    s.walk(route.slice(12, 15));
    const since = cellsSince(route.slice(12, 15));
    const { gate, moved } = s.orderAndWatch(31);
    const at = (t: number | null) => (t === null ? 'never (31 s)' : `${t.toFixed(3)} s`);
    console.log(`HTS 2: the leader's cells since his placement ${since.toFixed(2)}; the gate opened at ${at(gate)}; the follower first moved at ${at(moved)}`);
    expect(since).toBeLessThan(8);
    expect(gate).toBeNull();                                     // the gate byte 1 through the stand, as the rig read
    expect(moved).toBeNull();
  });

  it('the trail is kept through followers coming and going: no new wait at a second order after a HOLD', () => {
    const s = scene();
    const route = walkFrom(s.planner, s.home, 14);
    s.place(route[1]!);
    s.walk(route.slice(1));
    expect(s.orderAndStand(10)).not.toBeNull();
    onCommand(s.h, 5, { id: LEADER, alive: true }, s.ext.leaders);  // HOLD: the last follower gone
    for (let k = 0; k < TICK_HZ; k++) s.ext.step();
    const trail = (s.ext as unknown as { trails: Map<number, FollowTrail> }).trails.get(LEADER);
    expect(trail?.length ?? 0).toBeGreaterThanOrEqual(8);         // the original never switches a human's trail off
  });

  // SHOTS-1208 r152 (research 445 s5.10; review 1 item 3): +0x76 is set only on the follow's enter (`FUN_005fdf80` event 0,
  // D:L510077), so a HOLD (the follow's exit) leaves the gate open, and the next order -- state 9 entered again, signal 0,
  // the room's `enter()` -- re-arms it: with a short trail since the leader's placement the follower then stands.
  it('SHOTS-1208 r152: a new order after a HOLD re-arms the start gate, so a short trail holds the follower', () => {
    const s = scene();
    const route = walkFrom(s.planner, s.home, 14);
    s.place(route[1]!);
    s.walk(route.slice(1));
    expect(s.orderAndWatch(10).gate).not.toBeNull();
    onCommand(s.h, 5, { id: LEADER, alive: true }, s.ext.leaders);  // HOLD: the follow ends (signal 1)
    for (let k = 0; k < TICK_HZ; k++) s.ext.step();
    expect(s.gateOpen(), 'the exit leaves +0x76 as it was').toBe(true);
    s.place(route[12]!);                                           // a placement zeroes the trail's entries
    s.walk(route.slice(12, 15));
    const { gate, moved } = s.orderAndWatch(5);
    expect(s.h.ai.state, 'reached: the follow entered again').toBe(9);
    expect(gate, 'the enter re-armed the gate').toBeNull();
    expect(moved).toBeNull();
  });
});

class Quiet implements Conn { send(): void { /* nothing */ } close(): void { /* nothing */ } }

describe.skipIf(!MP71)('HOSTAGE-TRAIL-START: the room tells the extraction of a body\'s placement (MP71, dev-disc)', () => {
  it('every seated body has a trail before any order, and a respawn or a teleport (`Walker.place`) zeroes its entries', () => {
    const map: SimMap = { ...simMapFromBytes(MP71!, 'RUN/MP71.ZDB'), gameType: 4 };
    let now = 0;
    const room = new Room(map, null, { now: () => now, random: () => 0.01, launchCountdownS: 0, rules: 'classic', roundSeconds: 360 }, null);
    const seqs = new Map<number, number>();
    for (const id of [1, 2]) room.hello(id, new Quiet(), { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP71' } as Extract<ClientEvent, { type: 'hello' }>, `10.0.0.${id}`);
    const tick = (): void => {
      for (const id of [1, 2]) {
        const p = room.player(id)!, seq = Math.max(seqs.get(id) ?? 0, p.sim.seq) + 1;
        seqs.set(id, seq);
        const c: Command = { seq, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
        room.binary(id, encodeCommands({ viewTick: room.tick, commands: [c] }));
      }
      now += 1000 / TICK_HZ;
      room.step();
    };
    for (let i = 0; i < 8; i++) tick();
    const trails = (room as unknown as { extraction: { trails: Map<number, FollowTrail> } }).extraction.trails;
    const seal = [1, 2].find((id) => room.player(id)!.team === 'seal')!;
    expect(trails.has(seal)).toBe(true);                         // on from the build, no follower yet
    const trail = trails.get(seal)!;
    for (const x of [1, 2, 3, 4]) trail.add({ map: 0, x, z: 1 });
    expect(trail.points.length).toBeGreaterThan(1);
    const p = room.player(seal)!, w = p.sim.walker.state;
    (room as unknown as { spawn(p: unknown, kind: 'respawn', place: { at: V3; yaw: number }): void }).spawn(p, 'respawn', { at: [w.x, w.y, w.z], yaw: w.yaw });
    tick(); tick();                                                // a game frame is every other room tick
    expect(trails.get(seal)!.points.length).toBeLessThanOrEqual(1);   // the placement zeroes the entries (FUN_00525200)
    for (const x of [1, 2, 3, 4]) trails.get(seal)!.add({ map: 0, x, z: 1 });
    expect(trails.get(seal)!.points.length).toBeGreaterThan(1);
    const s = room.player(seal)!.sim.walker.state;
    room.player(seal)!.sim.walker.place(s.x, s.y + 5, s.z);         // a teleport: the harnesses' `put`
    tick(); tick();
    expect(trails.get(seal)!.points.length).toBeLessThanOrEqual(1);
  });
});

/**
 * The cost (product-track instrument, no assertion; run with S2U_TRAIL_BENCH=1): the extraction's step, where the
 * per-frame trail work runs, with every seated body walking and no hostage led -- before this change no trail work ran
 * there, after it every living body's runs. Timed on the box; a timing, not a pass.
 */
describe.skipIf(!MP71 || !process.env.S2U_TRAIL_BENCH)('HOSTAGE-TRAIL-START: the extraction step\'s time with every body\'s trail (bench)', () => {
  it.each([2, 16])('%i seated bodies walking', (n) => {
    const map: SimMap = { ...simMapFromBytes(MP71!, 'RUN/MP71.ZDB'), gameType: 4 };
    const planner = new HostagePathPlanner(map.ai!);
    const bodies: HostageWorldBody[] = Array.from({ length: n }, (_, i) => ({ id: i + 1, feet: [0, 0, 0] as V3, alive: true, team: 1, yaw: 0, velocity: [0, 0, 0] as V3, topSpeed: 65, stance: 0 as const }));
    const host: ExtractionHost = { tick: () => 0, live: () => true, random: () => 0.5, bodies: () => bodies, send: () => {},
      seat: (id) => ({ id, feet: [0, 0, 0], alive: true, spectator: false, team: 'seal' }) };
    const ext = ExtractionAuthority.of(map, host)!;
    const route = walkFrom(planner, planner.locate(ext.hostages[0]!.at)!, 14).map((c) => planner.point(c));
    const at = (i: number, k: number): V3 => {
      const len = route.length - 1, u = ((k / 10 + i * 3) % (2 * len)), j = u <= len ? u : 2 * len - u;
      const a = route[Math.floor(j)]!, b = route[Math.min(len, Math.floor(j) + 1)]!, t = j - Math.floor(j);
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    };
    const ticks = 60 * TICK_HZ, times: number[] = [];
    for (let k = 0; k < ticks; k++) {
      for (let i = 0; i < n; i++) bodies[i]!.feet = at(i, k);
      const t0 = performance.now();
      ext.step();
      times.push(performance.now() - t0);
    }
    const warm = times.slice(TICK_HZ).sort((a, b) => a - b);
    const mean = warm.reduce((a, b) => a + b, 0) / warm.length;
    console.log(`HTS BENCH n=${n}: extraction step mean ${(mean * 1000).toFixed(1)} us, p50 ${(warm[warm.length >> 1]! * 1000).toFixed(1)} us, p99 ${(warm[Math.floor(warm.length * 0.99)]! * 1000).toFixed(1)} us over ${warm.length} ticks`);
    expect(warm.length).toBeGreaterThan(0);
  });
});
