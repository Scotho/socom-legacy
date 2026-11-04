import { describe, expect, it } from 'vitest';
import {
  arsenalOf, DEFAULT_RIFLE, EMPTY_ITEM, HELD_RIFLE, HELD_SIDEARM, M67, type CollisionOwner, type GridParams, type Loadout, type SpawnSlot,
  type WorldPoly,
} from '@s2u/scene';
import {
  ACTION_CODES, Button, encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type BodyState, type Command, type ServerEvent, type SimKits,
  type SimMap,
} from '../../viewer/src/sim';
import { KitRounds } from '../../viewer/src/firearms';
import { equipmentSlotsOf, type EquipmentSlots } from '../../viewer/src/equipment';
import { ACTION_CLIPS, playedOutCommand } from '../../viewer/src/mover';
import { clipsFromPack } from '../../viewer/src/motionTable';
import { simClipsFromBytes, type SimClips } from '../../viewer/src/simMap';
import { remoteBodyAction } from '../../viewer/src/remotePlayers';
import { PICKUP_LAUNCHER_ROUND_SLOT_PLACEHOLDER } from '../../viewer/src/net/pickupRules';
import { parseRdr, rdrGet, Zar, type RdrNode } from '@s2u/archive';
import { fixture } from '../../archive/test/fixtures';
import { DROP_SAME_TICK_READING, PICKUP_MOTION_GATE_READING, PICKUP_REACH_READING, PICKUP_SPEED_READING } from '../../viewer/src/net/pickupRules';
import type { DropWire, JoinWire } from '../../viewer/src/net/protocol';
import { DROP_PLACEMENT_PLACEHOLDER, DROP_RESPAWN_RULE_READING, WEAPON_DROP_AMMO_READING } from '../src/pickups';
import { DROP_LIFETIME_READING, DROP_OWNER_DEPARTURE_PLACEHOLDER, DROP_SETTLE_ADAPTATION, DROP_SWEEP_AT_RESULT_READING, PICKUP_LAUNCHER_CLIP_GATE_PLACEHOLDER, type DropSeat, type WorldDrops } from '../src/worldDrops';
import { ENGINE_READ_S, FINAL_ROUND_S, GAME_COMPLETE_S, Room, type Conn } from '../src/room';

/**
 * PF-34 in the room (ruling PF.R54; web research 234 s1-s4, 194 s2): a classic death lays its weapons and one bundle of
 * its exact remaining magazines, once, at the death's edge (`FUN_00547af0` D:L413052 sets `+0x1061 & 0x10`,
 * `FUN_00547350` D:L412694-412696 consumes it and calls `FUN_005a0040`); a respawn game's lays nothing (`FUN_002a7560`
 * D:L149415-149433). The room is the one arbiter of every claim (`PICKUP_ROUTE_READING`): a weapon claim in reach, under
 * the speed, by a command that may fire, replaces the same-family slot (the old one dropped at the taker's feet); a
 * bundle is taken by walking within 20 units, whole entries into free ring slots; no round is created anywhere.
 *
 * The synthetic floor and the `Client` capture of `roomLoadBarrier.test.ts` (copied, not imported); the kit table in the
 * shape of `roomJoin.test.ts`'s. A frame's gate fields (`fire`, `swapping`, `velocity`) are set on the recorded frame
 * where a test needs a command that may not fire: the gate reads the frame (PF-17's), and `roomCapability.test.ts` pins
 * how a clip makes one.
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
  const respawns = [0, 1].flatMap((i) => [slot(0, i, -600, -500 + i * 500), slot(1, i, 600, -500 + i * 500)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns, notes: [] };
}

class Client implements Conn {
  events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* nothing */ }
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] { return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[]; }
}

const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
const item = (name: string, id: number): unknown[] => ['InternalName', [name], 'ID', [String(id)], 'Ammo_Capacity', ['1'], 'NumMags', ['1'], 'AMMO_TYPES', [[]]];
const arsenal = arsenalOf(['ZAMMO', [], 'ZWEAPON', [item('M67', 121), item('LAW', 145), item('LAW HEAT', 185)] as never]);
/** The Terrorist carries the M4A1 SD (62) and the Mark 23 (15); the SEAL the M4A1 (54) and the Mark 23. */
const TERRORIST = kit(HELD_RIFLE.id, HELD_SIDEARM.id, 121, EMPTY_ITEM, EMPTY_ITEM), SEAL = kit(DEFAULT_RIFLE.id, HELD_SIDEARM.id, 121, EMPTY_ITEM, EMPTY_ITEM);
function kits(): SimKits {
  return {
    table: {
      arsenal, records: new Map([DEFAULT_RIFLE, HELD_RIFLE, HELD_SIDEARM].map((x) => [x.id, x])), rounds: new Map(),
      throwables: new Map([[M67.id, { record: M67, piercing: 4 }]]),
    },
    map: {
      valves: new Map(), selectable: { seal: [], terrorist: [] },
      kits: { seal: [{ type: 'S', character: 's', loadout: SEAL }], terrorist: [{ type: 'T', character: 't', loadout: TERRORIST }] },
    },
  };
}

type V3 = [number, number, number];
interface Seat { next: Loadout | null; mounted: number | null; weapon: 0 | 1 }

function setup(opts: Partial<ConstructorParameters<typeof Room>[2]> = {}, clips: SimClips | null = null) {
  let now = 0;
  const room = new Room(flatMap(), clips, { now: () => now, random: () => 0.5, launchCountdownS: 0, rules: 'classic', ...opts }, null, kits());
  const clients = new Map<number, Client>();
  const join = (id: number): Client => {
    const c = new Client();
    clients.set(id, c);
    room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99' }, `10.0.0.${id}`);
    return c;
  };
  const step = (n = 1): void => { for (let i = 0; i < n; i++) { now += 1000 / TICK_HZ; room.step(); } };
  /** `ticks` of player `id`'s commands at rest, each one run (its frames recorded). */
  const drive = (id: number, ticks = 6): void => {
    for (let i = 0; i < ticks; i++) {
      const p = room.player(id)!;
      const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
      room.binary(id, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
      step();
    }
  };
  const place = (id: number, at: V3): void => { room.player(id)!.sim.walker.place(at[0], at[1] + 20, at[2]); };
  const feet = (id: number): V3 => { const s = room.player(id)!.sim.walker.state; return [s.x, s.y, s.z]; };
  const kill = (id: number): void => {
    (room as unknown as { kill(v: unknown, k: null, w: null, how: string, cause: number): void }).kill(room.player(id), null, null, 'fall', 0);
  };
  const claim = (id: number, did: number, seq = room.player(id)!.sim.seq): void => room.text(id, { type: 'pickup', seq, did });
  const seat = (id: number): Seat => room.player(id) as unknown as Seat;
  return { room, join, step, drive, place, feet, kill, claim, seat, clients };
}

/**
 * A classic round in play with four seats (1, 4 Terrorists; 2, 3 SEALs: the room's seating), each driven so its commands have frames: seat 1
 * at the origin (the body to be), seat 2 ten units off it, seats 3 and 4 far (out of every bundle's reach).
 */
/**
 * The room's seat as NU-5's cases write it (the type check, not the behaviour): `Room.player()`'s declared type
 * (room.ts `player`) is readonly and names no `held` / `heldNext`; the `Player` it returns has them, writable -- the
 * sibling tests' `TestPlayer` cast (roomSpawnPose.test.ts, victory.test.ts).
 */
type WritableSeat = Omit<NonNullable<ReturnType<Room['player']>>, 'loadout' | 'rounds' | 'equipmentSlots'> & {
  loadout: Loadout; rounds: KitRounds; equipmentSlots: EquipmentSlots; held: number | null; heldNext: { item: number | null; seq: number } | null;
};
const writable = (room: Room, id: number): WritableSeat => room.player(id)! as unknown as WritableSeat;

function fourInRound(opts: Partial<ConstructorParameters<typeof Room>[2]> = {}, clips: SimClips | null = null) {
  const s = setup(opts, clips);
  const c = [1, 2, 3, 4].map((id) => s.join(id));
  s.step();
  for (let i = 0; i < 10 * TICK_HZ && c[0]!.of('roundStart').length === 0; i++) s.step();
  expect(c[0]!.of('roundStart')).toHaveLength(1);
  expect([1, 2, 3, 4].map((id) => s.room.player(id)!.team)).toEqual(['terrorist', 'seal', 'seal', 'terrorist']);
  s.place(1, [0, 0, 0]); s.place(2, [10, 0, 0]); s.place(3, [-300, 0, 300]); s.place(4, [-300, 0, -300]);
  for (const id of [1, 2, 3, 4]) s.drive(id, 4);
  return { ...s, a: c[0]!, b: c[1]!, c3: c[2]!, d: c[3]! };
}

/** Sets a ring to exactly `slots` (the ten), the magazine in the weapon `current`. */
const setRing = (room: Room, id: number, slot: 0 | 1, slots: number[], current = 0): void => {
  room.player(id)!.mags[slot].restore({ slots: [...slots, ...new Array<number>(10 - slots.length).fill(0)], current });
};
const total = (room: Room, ids: number[]): number => ids.reduce((n, id) => n + room.player(id)!.mags[0].total() + room.player(id)!.mags[1].total(), 0);
const sumDrops = (ds: readonly DropWire[]): number => ds.reduce((n, d) => n + (d.entries ?? []).reduce((m, e) => m + e.rounds.reduce((a, b) => a + b, 0), 0), 0);

describe('PF-34: death drops and in-round pickup in the room (PF.R54; research 234)', () => {
  it("a classic death lays its drops once (00547af0 D:L413052 -> 00547350 L412694-412696, the edge): a drop event per weapon and one bundle with the victim's exact remaining rounds at the body (DROP_PLACEMENT_PLACEHOLDER); the corpse's next ticks lay nothing", () => {
    expect(DROP_PLACEMENT_PLACEHOLDER).toBe("at the feet, the body's yaw");
    const g = fourInRound();
    g.place(2, [200, 0, 0]); g.drive(2, 2);                      // nobody in the bundle's reach
    setRing(g.room, 1, 0, [0, 17, 30, 0, 4], 1);
    setRing(g.room, 1, 1, [3, 0, 12]);
    const at = g.feet(1), yaw = g.room.player(1)!.sim.walker.state.yaw;
    g.kill(1);
    const drops = g.b.of('drop');
    expect(drops).toEqual([
      { type: 'drop', did: 0, kind: 'ammo', entries: [{ item: HELD_RIFLE.id, rounds: [17, 30, 4] }, { item: HELD_SIDEARM.id, rounds: [3, 12] }], at, yaw, from: 1 },
      { type: 'drop', did: 1, kind: 'weapon', item: HELD_RIFLE.id, at, yaw, from: 1 },
      { type: 'drop', did: 2, kind: 'weapon', item: HELD_SIDEARM.id, at, yaw, from: 1 },
    ]);
    // Every page is told the same, the victim's too; the body keeps no round.
    for (const c of [g.a, g.c3, g.d]) expect(c.of('drop')).toEqual(drops);
    expect(total(g.room, [1])).toBe(0);
    // The corpse's ticks lay nothing more.
    g.step(2 * TICK_HZ);
    expect(g.b.of('drop')).toHaveLength(3);
    expect(g.room.joinWire().drops?.map((d) => d.did)).toEqual([0, 1, 2]);
  });

  it("OBF-15 (OBF.R9, the owner's ruled departure: DROP_SETTLE_ADAPTATION): a death in the air lays its drops on the floor below the feet, by the room's own floor pick; x, z and the yaw are the body's", () => {
    const g = fourInRound();
    g.place(2, [200, 0, 0]); g.drive(2, 2);
    const s = g.room.player(1)!.sim.walker.state;
    s.y = 34;                                                    // mid-jump: the feet 34 over the flat floor (y 0)
    const yaw = s.yaw;
    g.kill(1);
    const drops = g.b.of('drop');
    expect(drops.length).toBeGreaterThan(0);
    for (const d of drops) expect(d.at).toEqual([s.x, 0, s.z]);
    for (const d of drops) expect(d.yaw).toBe(yaw);
    expect(DROP_SETTLE_ADAPTATION).toBe('the floor below, else where it fell');
  });

  it("OBF-15: a standing death's drops are where they were, at the feet (DROP_PLACEMENT_PLACEHOLDER unchanged)", () => {
    const g = fourInRound();
    g.place(2, [200, 0, 0]); g.drive(2, 2);
    const at = g.feet(1);
    expect(at[1]).toBe(0);
    g.kill(1);
    for (const d of g.b.of('drop')) expect(d.at).toEqual(at);
  });

  it("a respawn game's death lays no drop (002a7560 D:L149415-149433: game +0xdc; DROP_RESPAWN_RULE_READING)", () => {
    expect(DROP_RESPAWN_RULE_READING).toBe('classic only');
    const g = setup({ rules: 'respawn' });
    const a = g.join(1); g.join(2);
    g.step();
    g.drive(1, 4);
    g.kill(1);
    g.step(TICK_HZ);
    expect(a.of('kill')).toHaveLength(1);
    expect(a.of('drop')).toEqual([]);
    expect(g.room.joinWire().drops).toBeUndefined();
    // A classic room's waiting room (one side unseated) plays as a respawn room: no drop either.
    const w = setup();
    const c = w.join(1);
    w.step(); w.drive(1, 4);
    w.kill(1);
    expect(c.of('drop')).toEqual([]);
  });

  it("a pickup of a same-family weapon within 20 u under 32 u/s by a living player whose command may fire is accepted once: his slot, record and ring are the drop's (the empty ring, WEAPON_DROP_AMMO_READING), his old weapon drops at his feet with its ring, the room tells kit to him and taken (with his kit) to all; the saved pick (next) is unchanged", () => {
    expect(PICKUP_REACH_READING).toBe(20);
    expect(PICKUP_SPEED_READING).toBe(32);
    expect(WEAPON_DROP_AMMO_READING).toBe('empty ring');
    const g = fourInRound();
    setRing(g.room, 1, 0, []); setRing(g.room, 1, 1, []);        // a dry body: no bundle
    g.kill(1);                                                   // the M4A1 SD (did 0) and the Mark 23 (did 1) at the body
    setRing(g.room, 2, 0, [30, 12]);
    const before = total(g.room, [2]) + sumDrops(g.room.joinWire().drops ?? []);
    const next = g.seat(2).next;
    const marks = [g.a, g.b, g.c3, g.d].map((c) => c.events.length);
    g.claim(2, 0);
    g.step();
    const p = g.room.player(2)!;
    expect(p.loadout).toEqual([HELD_RIFLE.id, HELD_SIDEARM.id, 121, EMPTY_ITEM, EMPTY_ITEM]);
    expect(p.records[0]).toBe(HELD_RIFLE);
    expect(p.mags[0].total()).toBe(0);
    expect(p.mags[0].capacity).toBe(HELD_RIFLE.magazine);
    expect(g.seat(2).next).toBe(next);
    const after = [g.a, g.b, g.c3, g.d].map((c, i) => c.events.slice(marks[i]));
    const taken = { type: 'taken', did: 0, by: 2, kit: [HELD_RIFLE.id, HELD_SIDEARM.id, 121, EMPTY_ITEM, EMPTY_ITEM] };
    const at = g.feet(2), yaw = p.sim.walker.state.yaw;
    const laid = [
      { type: 'drop', did: 2, kind: 'ammo', entries: [{ item: DEFAULT_RIFLE.id, rounds: [30, 12] }], at, yaw, from: 2 },
      { type: 'drop', did: 3, kind: 'weapon', item: DEFAULT_RIFLE.id, at, yaw, from: 2 },
    ];
    for (const evs of after) {
      expect(evs.filter((e) => e.type === 'taken')).toEqual([taken]);
      expect(evs.filter((e) => e.type === 'drop')).toEqual(laid);
    }
    // The kit to the taker alone: his loadout, the slot, both rings' ten slots exactly.
    expect(after[1]!.filter((e) => e.type === 'kit')).toEqual([
      { type: 'kit', loadout: taken.kit, slot: 0, rounds: [new Array<number>(10).fill(0), p.mags[1].state().slots] },
    ]);
    for (const i of [0, 2, 3]) expect(after[i]!.filter((e) => e.type === 'kit')).toEqual([]);
    // Once: the same claim again is refused, nothing changes; no round was created.
    g.claim(2, 0);
    g.step();
    expect(g.room.takeDrops()).toEqual({ 'pickup: taken': 1 });
    expect(g.room.player(2)!.loadout[0]).toBe(HELD_RIFLE.id);
    expect(total(g.room, [2]) + sumDrops(g.room.joinWire().drops ?? [])).toBe(before);
    expect(g.room.joinWire().drops?.map((d) => d.did)).toEqual([1, 2, 3]);
  });

  // LATER 204 (ASK_AT_COMMAND_ADAPTATION, the port's own -- the original judges a pickup at its press, with no command to
  // name): a claim is judged by the mount its command's frame holds (`AimFrame.turret`, as LATER 172's `mountedAt`), not
  // the seat's present one.
  it("LATER 204: a pickup is judged by its command's mount -- unmounted then and mounted now, taken; mounted then and released now, refused", () => {
    const g = fourInRound();
    setRing(g.room, 1, 0, [5]); setRing(g.room, 1, 1, []);
    g.kill(1);
    g.room.takeDrops();
    g.place(2, [10, 0, 0]); g.drive(2, 4);
    const p = g.room.player(2)!;
    // (b) mounted at its command, released now: refused 'mounted'.
    p.cone.frame(p.sim.seq)!.turret = 0;
    g.seat(2).mounted = null;
    g.claim(2, 1);
    g.step();
    expect(g.room.takeDrops()).toEqual({ 'pickup: mounted': 1 });   // today: taken
    g.drive(2, 1);
    // (a) unmounted at its command, mounted now (the room took the mount after): taken.
    g.seat(2).mounted = 0;
    g.claim(2, 1);
    g.step();
    g.seat(2).mounted = null;
    expect(g.room.takeDrops() ?? {}).toEqual({});                     // today: 'mounted'
    expect(g.room.joinWire().drops?.some((d) => d.did === 1) ?? false).toBe(false);
  });

  // LATER 220's fourth head (research 369 §2): the pickup's offers (0x10, 0x20) are built past the prompts' common gate
  // (`FUN_00593500` D:L452277): a claim named on a command under the kit's reload lock is refused 'reload', nothing taken.
  it("LATER 220: a claim named on the command a reload was named on (arrived before it) is refused 'reload' -- nothing taken; on an open command, taken", () => {
    const g = fourInRound();
    setRing(g.room, 1, 0, []); setRing(g.room, 1, 1, []);
    g.kill(1);
    setRing(g.room, 2, 0, [30, 12]);
    const S = g.room.player(2)!.sim.seq;
    g.room.takeDrops();
    g.room.text(2, { type: 'reload', seq: S });
    g.claim(2, 0, S);
    g.drive(2, 1);                                                // S + 1 runs: the reload decided, then the claim behind it
    expect(g.room.takeDrops()?.['pickup: reload']).toBe(1);
    expect(g.room.player(2)!.loadout[0], 'nothing taken').toBe(DEFAULT_RIFLE.id);
    g.drive(2, 240);                                              // the reload over
    g.claim(2, 0);
    g.step();
    expect(g.room.player(2)!.loadout[0], 'taken on an open command').toBe(HELD_RIFLE.id);
  });

  it("a dead taker, one out of reach, one over 32 u/s, one whose command cannot fire (nofire, swapping, mounted), a drop already taken and a did of the last round are refused with their why (PICKUP_REACH_READING, PICKUP_SPEED_READING, PICKUP_MOTION_GATE_READING)", () => {
    expect(PICKUP_MOTION_GATE_READING).toBe('fire capability');
    const g = fourInRound();
    setRing(g.room, 1, 0, [5]); setRing(g.room, 1, 1, []);       // a bundle of the M4A1 SD's 5 (did 0): seat 2 carries none
    g.kill(1);
    g.room.takeDrops();
    const kit0 = [...g.room.player(2)!.loadout];
    const refused = (id: number, why: string, did = 1, seq?: number): void => {
      g.claim(id, did, seq);
      g.step();
      expect(g.room.takeDrops()).toEqual({ [`pickup: ${why}`]: 1 });
      expect(g.room.joinWire().drops?.some((d) => d.did === did) ?? false).toBe(did === 1);
    };
    // Out of reach: 21 units off the drop (feet to the drop's point).
    g.place(2, [21, 0, 0]); g.drive(2, 4);
    refused(2, 'reach');
    g.place(2, [10, 0, 0]); g.drive(2, 4);
    // Over 32 u/s at the named command (the frame's velocity, squared 3D).
    const p = g.room.player(2)!;
    p.cone.frame(p.sim.seq)!.velocity = [30, 0, 15];
    refused(2, 'speed');
    g.drive(2, 1);
    // The command may not fire (PF-17's frame), is swapping, or the seat is mounted.
    p.cone.frame(p.sim.seq)!.fire = false;
    refused(2, 'nofire');
    g.drive(2, 1);
    p.cone.frame(p.sim.seq)!.swapping = true;
    refused(2, 'swapping');
    g.drive(2, 1);
    p.cone.frame(p.sim.seq)!.turret = 0;                             // LATER 204: mounted at its command
    refused(2, 'mounted');
    g.drive(2, 1);
    // A command too old for the frames, or past the jitter: stale (a claim from the last round is one).
    refused(2, 'stale', 1, p.sim.seq - 10);
    // A did not laid this round (a did of the last round, its serial reset): gone.
    refused(2, 'gone', 40);
    // A bundle is not claimed: it is taken by walking.
    g.claim(2, 0); g.step();
    expect(g.room.takeDrops()).toEqual({ 'pickup: kind': 1 });
    // A dead taker (a SEAL: his side still stands).
    g.kill(3);
    g.room.takeDrops();
    refused(3, 'not alive');
    // None of it changed the kit; the claim in reach still lands, and a second is 'taken'.
    expect([...g.room.player(2)!.loadout]).toEqual(kit0);
    g.claim(2, 1); g.step();
    expect(g.room.player(2)!.loadout[0]).toBe(HELD_RIFLE.id);
    g.room.takeDrops();
    g.place(4, [5, 0, 0]); g.drive(4, 4);
    g.claim(4, 1); g.step();
    expect(g.room.takeDrops()).toEqual({ 'pickup: taken': 1 });
  });

  it("two players claiming one drop on one tick: the lower seat id takes it (DROP_SAME_TICK_READING), the other is refused 'taken'; a replayed accept changes nothing", () => {
    expect(DROP_SAME_TICK_READING).toBe('lower seat id');
    const g = fourInRound();
    g.place(3, [12, 0, 4]); g.drive(3, 4);
    setRing(g.room, 1, 0, []); setRing(g.room, 1, 1, []);        // a dry body: the M4A1 SD is did 0
    g.kill(1);
    g.room.takeDrops();
    // Seat 3 asks first, seat 2 after it, inside one tick: seat 2 takes the M4A1 SD.
    g.claim(3, 0);
    g.claim(2, 0);
    g.step();
    expect(g.room.player(2)!.loadout[0]).toBe(HELD_RIFLE.id);
    expect(g.room.player(3)!.loadout[0]).toBe(DEFAULT_RIFLE.id);
    expect(g.room.takeDrops()).toEqual({ 'pickup: taken': 1 });
    expect(g.b.of('taken').filter((t) => t.did === 0)).toEqual([{ type: 'taken', did: 0, by: 2, kit: [...g.room.player(2)!.loadout] }]);
    // The accept replayed (the same claim sent again): refused, no event, no kit change.
    const n = g.b.events.length;
    const kit2 = [...g.room.player(2)!.loadout], ring2 = g.room.player(2)!.mags[0].state();
    g.claim(2, 0);
    g.step();
    expect(g.room.takeDrops()).toEqual({ 'pickup: taken': 1 });
    expect(g.b.events.slice(n).filter((e) => e.type === 'taken' || e.type === 'drop' || e.type === 'kit')).toEqual([]);
    expect([...g.room.player(2)!.loadout]).toEqual(kit2);
    expect(g.room.player(2)!.mags[0].state()).toEqual(ring2);
  });

  it("a bundle within 20 u is taken by walking: entries for the carried weapons fill free ring slots, the residual stays and is told as the entry list shrinks, the bundle's taken goes out when it empties; no round is created (fire.ts's fill is not the room's)", () => {
    const g = fourInRound();
    g.place(2, [200, 0, 0]);                                     // nobody near the body
    g.drive(2, 4);
    setRing(g.room, 1, 0, [17, 30]);
    setRing(g.room, 1, 1, [5]);
    g.kill(1);                                                   // the bundle: M4A1 SD [17, 30], Mark 23 [5]
    // Seat 4 (a Terrorist: the M4A1 SD and the Mark 23): one free rifle slot, the pistol ring full.
    setRing(g.room, 4, 0, [30, 30, 30, 30, 30, 30, 30, 30, 30, 0]);
    setRing(g.room, 4, 1, [12, 12, 12, 12, 12, 12, 12, 12, 12, 12]);
    const before = total(g.room, [4]) + sumDrops(g.room.joinWire().drops ?? []);
    const marks = g.d.events.length, seen = g.b.events.length;
    g.place(4, [15, 0, 0]);                                      // 15 units off the body: in reach
    g.drive(4, 2);
    // The 17 into the rifle's free slot; the 30 and the 5 stay: told again under the same did, the list shorter.
    expect(g.room.player(4)!.mags[0].state().slots[9]).toBe(17);
    const kits = g.d.events.slice(marks).filter((e) => e.type === 'kit');
    expect(kits[0]).toEqual({
      type: 'kit', loadout: [...TERRORIST], rounds: [g.room.player(4)!.mags[0].state().slots, g.room.player(4)!.mags[1].state().slots],
      filled: [[9], []],                                         // only the slot the transfer wrote: the page leaves the rest as it fired them
    });
    const told = g.b.events.slice(seen).filter((e) => e.type === 'drop');
    expect(told).toEqual([{ type: 'drop', did: 0, kind: 'ammo', entries: [{ item: HELD_RIFLE.id, rounds: [30] }, { item: HELD_SIDEARM.id, rounds: [5] }], at: expect.any(Array), yaw: expect.any(Number), from: 1 }]);
    expect(total(g.room, [4]) + sumDrops(g.room.joinWire().drops ?? [])).toBe(before);
    // Standing on it with no free slot moves nothing and tells nothing more.
    g.drive(4, 3);
    expect(g.b.events.slice(seen).filter((e) => e.type === 'drop')).toHaveLength(1);
    // A magazine spent frees its slot: the 30 goes in next; then a pistol slot: the 5. The bundle empties: taken.
    setRing(g.room, 4, 0, [30, 30, 30, 30, 30, 30, 30, 30, 0, 17], 0);
    g.drive(4, 1);
    setRing(g.room, 4, 1, [12, 12, 12, 12, 12, 12, 12, 12, 12, 0]);
    const was = total(g.room, [4]) + sumDrops(g.room.joinWire().drops ?? []);
    g.drive(4, 1);
    expect(g.b.of('taken')).toEqual([{ type: 'taken', did: 0, by: 4 }]);
    expect(g.room.joinWire().drops?.some((d) => d.did === 0)).toBe(false);
    expect(total(g.room, [4])).toBe(was);
    expect(g.room.player(4)!.mags[1].state().slots[9]).toBe(5);
    // Out of reach (21 units) a bundle is not touched.
    const h = fourInRound();
    h.place(2, [200, 0, 0]); h.place(4, [21, 0, 0]);
    for (const id of [2, 4]) h.drive(id, 2);
    setRing(h.room, 4, 0, [30]);
    h.kill(1);
    h.drive(4, 3);
    expect(h.room.player(4)!.mags[0].total()).toBe(30);
    expect(h.b.of('taken')).toEqual([]);
  });

  it("a joiner's welcome carries join.drops as the room has them (did, kind, item, entries, at, yaw); a new round and an abandon clear every drop and reset the serial (DROP_LIFETIME_PLACEHOLDER 'round')", () => {
    expect(DROP_LIFETIME_READING).toBe('round');                // research 317 R317.6 (was DROP_LIFETIME_PLACEHOLDER)
    const g = fourInRound({ roundSeconds: 2 });
    g.place(3, [-300, 0, 300]);
    g.kill(1);
    const told = g.b.of('drop').map(({ type: _t, ...d }) => d);
    const joiner = g.join(9);
    const w = joiner.of('welcome')[0]! as unknown as { join: JoinWire };
    expect(w.join.drops).toEqual(told);
    expect(g.room.joinWire().drops).toEqual(told);
    // The next round: cleared, and the serial starts again at 0.
    const rounds = g.a.of('roundStart').length;
    for (let i = 0; i < 60 * TICK_HZ && g.a.of('roundStart').length === rounds; i++) g.step();
    expect(g.a.of('roundStart')).toHaveLength(rounds + 1);
    expect(g.room.joinWire().drops).toBeUndefined();
    g.place(1, [0, 0, 0]); g.drive(1, 2);
    const mark = g.b.events.length;
    g.kill(1);
    expect(g.b.events.slice(mark).filter((e) => e.type === 'drop').map((e) => (e as DropWire).did)).toEqual([0, 1, 2]);
    // An abandon (a side emptied: the SEALs and the joiner leave) clears them too.
    g.room.leave(9); g.room.leave(2); g.room.leave(3);
    expect(g.a.of('abandoned')).toHaveLength(1);
    expect(g.room.joinWire().drops).toBeUndefined();
  });

  it("a departed dropper's drops stay and are claimable (DROP_OWNER_DEPARTURE_PLACEHOLDER)", () => {
    expect(DROP_OWNER_DEPARTURE_PLACEHOLDER).toBe('stays');
    const g = fourInRound();
    g.kill(1);
    g.room.leave(1);
    expect(g.room.player(1)).toBeUndefined();
    expect(g.room.joinWire().drops?.map((d) => [d.did, d.from])).toEqual([[0, 1], [1, 1], [2, 1]]);
    g.claim(2, 1);
    g.step();
    expect(g.room.player(2)!.loadout[0]).toBe(HELD_RIFLE.id);
    expect(g.b.of('taken').filter((t) => t.did === 1)).toEqual([{ type: 'taken', did: 1, by: 2, kit: [...g.room.player(2)!.loadout] }]);
  });
});

/**
 * NU-5 P1 (research 323 R323.1, R323.7-R323.9, §7 P1; NU.R1): the rules across deaths and rounds, pinned before L1 and X1
 * touch the same functions. No side test anywhere on the claim's path (§1.1: `FUN_00593da0` D:L452538-452575,
 * `FUN_00541d40` D:L409226-409267, `FUN_0059f610` D:L458314-458334, `FUN_0059f0c0` D:L458174-458297); a picked-up weapon
 * drops at its carrier's death like the kit's own, its ring's entries in the one bundle laid first (`FUN_005a0040`
 * D:L458646-458706 finding the slots by class, `FUN_005c7230` D:L480057-480069, `FUN_005c71a0` D:L480032-480044); it is
 * lost at the next round (`FUN_00223680` D:L75925-75931 -> `FUN_00599b60` D:L455158 -> `FUN_00599f00` D:L455791-455830
 * refilling from the chosen list, which a claim never writes); a respawn game lays nothing to take (D:L458659). No
 * behaviour change: these pass on the room as it stood.
 */
describe('NU-5 P1: the pick-up rules across deaths and rounds (research 323 §7 P1)', () => {
  const laidBy = (g: ReturnType<typeof fourInRound>, from: number, item: number): number =>
    g.b.of('drop').find((d) => d.from === from && d.kind === 'weapon' && d.item === item)!.did;

  it("either side takes the other's weapon: a SEAL the Terrorist's rifle, a Terrorist the SEAL's pistol (R323.1: no side read)", () => {
    const g = fourInRound();
    setRing(g.room, 1, 0, []); setRing(g.room, 1, 1, []);
    g.kill(1);                                                   // the Terrorist's M4A1 SD and Mark 23 at the origin
    g.claim(2, laidBy(g, 1, HELD_RIFLE.id)); g.step();
    expect([g.room.player(2)!.team, g.room.player(2)!.loadout[0]]).toEqual(['seal', HELD_RIFLE.id]);
    // The Terrorist seat 4 over the SEAL seat 3's corpse: the SEAL's M4A1, then his Mark 23.
    setRing(g.room, 3, 0, []); setRing(g.room, 3, 1, []);
    g.place(4, [-290, 0, 300]); g.drive(4, 4);
    g.kill(3);
    g.claim(4, laidBy(g, 3, DEFAULT_RIFLE.id)); g.step();
    expect([g.room.player(4)!.team, g.room.player(4)!.loadout[0]]).toEqual(['terrorist', DEFAULT_RIFLE.id]);
    g.claim(4, laidBy(g, 3, HELD_SIDEARM.id)); g.step();
    expect(g.room.takeDrops()).toBeNull();                       // the pistol too: nothing refused (the 3 s hold is the page prompt's)
    expect(g.b.of('taken').filter((t) => t.by === 4 && t.kit).map((t) => t.did)).toEqual([laidBy(g, 3, DEFAULT_RIFLE.id), laidBy(g, 3, HELD_SIDEARM.id)]);
  });

  it("the carrier's death lays the taken weapon like the kit's own: the one bundle first with its ring's entries, then the taken weapon, empty (R323.7)", () => {
    const g = fourInRound();
    setRing(g.room, 1, 0, []); setRing(g.room, 1, 1, []);
    g.kill(1);
    g.claim(2, laidBy(g, 1, HELD_RIFLE.id)); g.step();
    g.place(2, [200, 0, 0]); g.drive(2, 2);                      // away from the exchange's drops
    setRing(g.room, 2, 0, [30, 7]);                              // as a bundle walked over would leave it
    setRing(g.room, 2, 1, [12]);
    const mark = g.b.events.length;
    const at = g.feet(2), yaw = g.room.player(2)!.sim.walker.state.yaw;
    g.kill(2);
    const laid = g.b.events.slice(mark).filter((e) => e.type === 'drop').map(({ did: _d, ...d }) => d as unknown);
    expect(laid).toEqual([
      { type: 'drop', kind: 'ammo', entries: [{ item: HELD_RIFLE.id, rounds: [30, 7] }, { item: HELD_SIDEARM.id, rounds: [12] }], at, yaw, from: 2 },
      { type: 'drop', kind: 'weapon', item: HELD_RIFLE.id, at, yaw, from: 2 },
      { type: 'drop', kind: 'weapon', item: HELD_SIDEARM.id, at, yaw, from: 2 },
    ]);
    expect(total(g.room, [2])).toBe(0);
  });

  it("the next round's spawn gives the chosen kit, not the taken weapon, a survivor's too (R323.8: p.next ?? typeKit; the claim never writes next)", () => {
    const g = fourInRound({ roundSeconds: 2 });
    setRing(g.room, 1, 0, []); setRing(g.room, 1, 1, []);
    g.kill(1);
    g.claim(2, laidBy(g, 1, HELD_RIFLE.id)); g.step();
    expect(g.room.player(2)!.loadout[0]).toBe(HELD_RIFLE.id);
    expect(g.seat(2).next).toBeNull();
    const rounds = g.a.of('roundStart').length;
    for (let i = 0; i < 60 * TICK_HZ && g.a.of('roundStart').length === rounds; i++) g.step();
    expect(g.a.of('roundStart')).toHaveLength(rounds + 1);
    expect(g.room.player(2)!.alive).toBe(true);
    expect([...g.room.player(2)!.loadout]).toEqual([...SEAL]);  // the type's kit: the M4A1 back, the taken M4A1 SD gone
    expect(g.room.player(2)!.records[0]).toBe(DEFAULT_RIFLE);
  });

  it("a respawn room lays nothing to take (R323.9): a death lays no drop and a claim finds none", () => {
    const g = setup({ rules: 'respawn' });
    const a = g.join(1); g.join(2);
    g.step();
    g.place(1, [0, 0, 0]); g.place(2, [10, 0, 0]);
    g.drive(1, 4); g.drive(2, 4);
    g.kill(1);
    g.drive(2, 2);
    const kit = [...g.room.player(2)!.loadout];
    g.room.takeDrops();
    g.claim(2, 0); g.step();
    expect(a.of('drop')).toEqual([]);
    expect(Object.keys(g.room.takeDrops()!)).toEqual(['pickup: gone']);
    expect([...g.room.player(2)!.loadout]).toEqual(kit);
  });
});

/**
 * NU-4 D1 (research 317 R317.8, §3, §5 D1; `DROP_SWEEP_AT_RESULT_READING`): the original clears every pickup at the
 * result's sweep, 3 s after the round's end state -- the host when its 3.0 s wait ends (`FUN_002a9b30`
 * D:L150617-150626, D:L150629-150668), a client when the host's game state +0x113 = 4 or 6 arrives (`FUN_002aa490`
 * D:L151127-151131); the clearing is `FUN_002aa910`'s `FUN_00542e50(0)` (D:L151241, D:L409867-409914). The bodies stay.
 * The room sweeps once `lastResult` is `ENGINE_READ_S` old, once a result (its identity: `sweptFor`), keeping the
 * serial; the next round's start (`clearAir`) still restarts it.
 */
describe('NU-4 D1: the drops swept ENGINE_READ_S after the round\'s result (research 317 R317.8)', () => {
  /** The room's sweeps counted: the room's `worldDrops.sweep` wrapped (absent before D1: none counted). */
  const counted = (room: Room): { n: number } => {
    const wd = (room as unknown as { worldDrops: WorldDrops }).worldDrops as unknown as { sweep?: () => void };
    const out = { n: 0 };
    const sweep = wd.sweep?.bind(wd);
    wd.sweep = () => { out.n++; sweep?.(); };
    return out;
  };
  const welcomeDrops = (c: Client): DropWire[] => (c.of('welcome')[0] as unknown as { join: JoinWire }).join.drops ?? [];

  it("a classic death's drops lie until ENGINE_READ_S after roundOver and are gone then: a joiner told them before, none after; a claim after the sweep finds no drop; the serial is kept (no did twice in the round), the round's start restarts it", () => {
    const g = fourInRound();
    g.place(2, [200, 0, 0]); g.drive(2, 2);                      // nobody in a bundle's reach
    g.kill(1); g.kill(4);                                        // the Terrorists eliminated: the round decided
    const laid = g.room.joinWire().drops?.map((d) => d.did);
    expect(laid).toEqual([0, 1, 2, 3, 4, 5]);
    for (let i = 0; i < 60 * TICK_HZ && g.a.of('roundOver').length === 0; i++) g.step();
    expect(g.a.of('roundOver')).toHaveLength(1);                 // endRound ran on this tick (`lastResult.at`)
    const sweeps = counted(g.room);
    g.step(ENGINE_READ_S * TICK_HZ - 1);
    expect(g.room.joinWire().drops?.map((d) => d.did)).toEqual(laid);   // one tick short of the 3 s: still lying
    expect(welcomeDrops(g.join(8)).map((d) => d.did)).toEqual(laid);
    expect(sweeps.n).toBe(0);
    g.step();
    expect(sweeps.n).toBe(1);
    expect(g.room.joinWire().drops).toBeUndefined();             // swept: the room's set empty
    expect(welcomeDrops(g.join(9))).toEqual([]);                 // a joiner told none
    // A claim after the sweep finds no drop: refused, the kit unchanged, nothing taken.
    g.room.takeDrops();
    const kit = [...g.room.player(2)!.loadout];
    g.claim(2, 1); g.step();
    expect(g.room.takeDrops()).toEqual({ 'pickup: over': 1 });
    expect([...g.room.player(2)!.loadout]).toEqual(kit);
    expect(g.b.of('taken')).toEqual([]);
    // The serial is kept: a drop laid after the sweep in the same round takes the next did, never a swept one's.
    const wd = (g.room as unknown as { worldDrops: WorldDrops }).worldDrops;
    wd.death(g.room.player(3)! as unknown as DropSeat);
    expect(g.room.joinWire().drops?.[0]?.did).toBe(6);
    // The later ticks of the screens sweep no more (the drop just laid stays), and the round's start restarts the serial.
    const rounds = g.a.of('roundStart').length;
    for (let i = 0; i < 60 * TICK_HZ && g.a.of('roundStart').length === rounds; i++) g.step();
    expect(g.a.of('roundStart')).toHaveLength(rounds + 1);
    expect(sweeps.n).toBe(1);
    expect(g.room.joinWire().drops).toBeUndefined();             // the round's start's clear (`clearAir`)
    g.place(1, [0, 0, 0]); g.drive(1, 2);
    const mark = g.b.events.length;
    g.kill(1);
    expect(g.b.events.slice(mark).filter((e) => e.type === 'drop').map((e) => (e as DropWire).did)).toEqual([0, 1, 2]);
    expect(DROP_SWEEP_AT_RESULT_READING).toBe('3 s after the end state');
    expect(ENGINE_READ_S).toBe(3);
  });

  it("the sweep runs once a result: not on the later ticks of FINAL ROUND and GAME COMPLETE, nor in the lobby a held room's full game returns to (returnToLobby clears lastResult); the next match's result sweeps again", () => {
    let returned = 0;
    const g = setup({ heldLaunch: true, maxRounds: 1, onMatchReturn: () => { returned++; } });
    const a = g.join(1); [2, 3, 4].forEach((id) => g.join(id));
    g.step();
    const sweeps = counted(g.room);
    const match = (): void => {
      expect(g.room.launch(0)).toBe(true);
      const over = a.of('roundOver').length;
      g.kill(1); g.kill(4);
      expect(g.room.joinWire().drops?.length ?? 0).toBeGreaterThan(0);
      for (let i = 0; i < 60 * TICK_HZ && a.of('roundOver').length === over; i++) g.step();
      expect(a.of('roundOver').at(-1)).toMatchObject({ matchOver: true, screens: [{ screen: 'finalRound' }, { screen: 'gameComplete' }] });
    };
    match();
    g.step(ENGINE_READ_S * TICK_HZ);
    expect([sweeps.n, g.room.joinWire().drops]).toEqual([1, undefined]);
    g.step((FINAL_ROUND_S + GAME_COMPLETE_S) * TICK_HZ - 1);    // FINAL ROUND and GAME COMPLETE, to their last tick
    expect([sweeps.n, returned]).toEqual([1, 0]);
    g.step();
    expect([sweeps.n, returned]).toEqual([1, 1]);                // the game's lobby (ONL-20b): lastResult cleared
    g.step(60 * TICK_HZ);
    expect(sweeps.n).toBe(1);                                    // never again in the lobby
    match();                                                     // the lobby's launch: a new match, a new result
    expect(sweeps.n).toBe(1);
    g.step(ENGINE_READ_S * TICK_HZ);
    expect([sweeps.n, g.room.joinWire().drops]).toEqual([2, undefined]);
    g.step((FINAL_ROUND_S + GAME_COMPLETE_S) * TICK_HZ + 10 * TICK_HZ);
    expect([sweeps.n, returned]).toEqual([2, 2]);
  });
});

/**
 * NU-6 P1 in the room (research 324 §1.4, §5.1, §6 P1; NU.R1): what the others draw a taker by, pinned per side -- the
 * body's item is the hand's slot's item on the live kit (`room.ts` `body`: `p.held ?? p.loadout[slot]`, the character
 * message's current item, `FUN_005c89d0`), the hand kept at the accept (research 323 R323.3; `PICKUP_HAND_READING`, was `PICKUP_HAND_PLACEHOLDER`):
 * a claim into the hand's slot makes the next body's item the taken weapon, the slot unchanged; a claim into the stowed
 * slot leaves the item; `taken.kit` is the live kit (`FUN_0059f0c0` runs on every console at the accept). No behaviour
 * change: these pass on the room as it stood.
 */
describe('NU-6 P1: a taker\'s body item after a pick-up, for a SEAL and a Terrorist (research 324 §6 P1)', () => {
  const bodyOf = (g: ReturnType<typeof fourInRound>, id: number): BodyState =>
    (g.room as unknown as { body(p: unknown): BodyState }).body(g.room.player(id));
  /** The seat's swap to the pistol pressed, then run to its clip's end (the room's mover, `MoverSim.prepare`). */
  const toPistol = (g: ReturnType<typeof fourInRound>, id: number): void => {
    const p = g.room.player(id)!;
    const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: Button.Swap, stance: 0, weapon: 1 };
    g.room.binary(id, encodeCommands({ viewTick: g.room.tick, commands: [cmd] }));
    g.step();
    for (let i = 0; i < 4 * TICK_HZ && p.sim.walker.swapProgress() !== null; i++) g.drive(id, 1);
    g.drive(id, 2);
    expect(p.sim.weapon).toBe(1);
  };
  /** The weapon `item` the corpse of `from` laid: its did. */
  const laidBy = (g: ReturnType<typeof fourInRound>, from: number, item: number): number =>
    g.b.of('drop').find((d) => d.from === from && d.kind === 'weapon' && d.item === item)!.did;

  it('a SEAL takes a Terrorist\'s M4A1 SD into the hand\'s slot (the rifle in hand): the body\'s item is the taken rifle, slot 0; a Terrorist with his pistol in hand takes a SEAL\'s M4A1 into the stowed slot: the item stays the pistol, slot 1; taken.kit the live kit', () => {
    const g = fourInRound();
    setRing(g.room, 1, 0, []); setRing(g.room, 1, 1, []);
    g.kill(1);                                                   // the Terrorist's M4A1 SD and Mark 23 at the origin
    expect([bodyOf(g, 2).weapon, bodyOf(g, 2).slot]).toEqual([DEFAULT_RIFLE.id, 0]);
    g.claim(2, laidBy(g, 1, HELD_RIFLE.id)); g.step();
    expect(g.room.player(2)!.loadout[0]).toBe(HELD_RIFLE.id);
    expect([bodyOf(g, 2).weapon, bodyOf(g, 2).slot]).toEqual([HELD_RIFLE.id, 0]);
    expect(g.b.of('taken').at(-1)).toEqual({ type: 'taken', did: laidBy(g, 1, HELD_RIFLE.id), by: 2, kit: [...g.room.player(2)!.loadout] });
    // The Terrorist (seat 4), the pistol in hand, over the SEAL seat 3's corpse.
    setRing(g.room, 3, 0, []); setRing(g.room, 3, 1, []);
    g.place(4, [-290, 0, 300]); g.drive(4, 4);
    toPistol(g, 4);
    g.kill(3);
    const did = laidBy(g, 3, DEFAULT_RIFLE.id);
    g.claim(4, did); g.step();
    expect(g.room.player(4)!.loadout[0]).toBe(DEFAULT_RIFLE.id);
    expect([bodyOf(g, 4).weapon, bodyOf(g, 4).slot]).toEqual([HELD_SIDEARM.id, 1]);
    expect(g.b.of('taken').at(-1)).toEqual({ type: 'taken', did, by: 4, kit: [DEFAULT_RIFLE.id, HELD_SIDEARM.id, 121, EMPTY_ITEM, EMPTY_ITEM] });
  });

  it('a Terrorist takes a SEAL\'s M4A1 into the hand\'s slot: the item is the taken rifle, slot 0; a SEAL with his pistol in hand takes a Terrorist\'s M4A1 SD into the stowed slot: the item stays the pistol, slot 1; taken.kit the live kit', () => {
    const g = fourInRound();
    setRing(g.room, 3, 0, []); setRing(g.room, 3, 1, []);
    g.place(4, [-290, 0, 300]); g.drive(4, 4);
    g.kill(3);
    expect([bodyOf(g, 4).weapon, bodyOf(g, 4).slot]).toEqual([HELD_RIFLE.id, 0]);
    const did = laidBy(g, 3, DEFAULT_RIFLE.id);
    g.claim(4, did); g.step();
    expect([bodyOf(g, 4).weapon, bodyOf(g, 4).slot]).toEqual([DEFAULT_RIFLE.id, 0]);
    expect(g.b.of('taken').at(-1)).toEqual({ type: 'taken', did, by: 4, kit: [...g.room.player(4)!.loadout] });
    // The SEAL (seat 2), the pistol in hand, over the Terrorist seat 1's corpse.
    toPistol(g, 2);
    setRing(g.room, 1, 0, []); setRing(g.room, 1, 1, []);
    g.kill(1);
    const sd = laidBy(g, 1, HELD_RIFLE.id);
    g.claim(2, sd); g.step();
    expect(g.room.player(2)!.loadout[0]).toBe(HELD_RIFLE.id);
    expect([bodyOf(g, 2).weapon, bodyOf(g, 2).slot]).toEqual([HELD_SIDEARM.id, 1]);
    expect(g.b.of('taken').at(-1)).toEqual({ type: 'taken', did: sd, by: 2, kit: [HELD_RIFLE.id, HELD_SIDEARM.id, 121, EMPTY_ITEM, EMPTY_ITEM] });
  });
});

/**
 * NU-5 L1, X1 and research 324 P2's room half (research 323 R323.4, R323.5, §1.5, §1.6, §7 L1 and X1; research 324 §1.4
 * step 3, §6 P2), through the room's event path -- the `pickup` event (`room.text`), the commands (`binary` -> `step`).
 * - L1: a rocket launcher (class 0x91) is claimed by a kit carrying no launcher-list item with a slot 2-4 free or
 *   replaceable (`FUN_005bac30` D:L473023-473084), into `FUN_005bae60`'s slot, its round beside it with one round
 *   (`FUN_0059f0c0` D:L458238-458292); no exchange (no drop at the taker's feet); `'family'` otherwise, and in the port's
 *   five slots without an empty one for the round (`PICKUP_LAUNCHER_ROUND_SLOT_PLACEHOLDER`, decision (i)).
 * - X1: an exchange pushes `Swap rifle` (`DAT_003dec78`: NoFire, NoInterrupt; research 211) on the taker
 *   (`FUN_00588bc0` D:L458209-458211, the taker's own console, D:L458199) -- `swapRifleExchange` on the room's mover from
 *   the claim's command + 1, a fire under it refused (its `NoFire ()` bare, over the tracked `motion.rdr`); none when
 *   nothing was exchanged.
 * - P2: a launcher claim pushes the same clip on every console, the copy included (D:L458199-458206, under
 *   `FUN_00589900`: `PICKUP_LAUNCHER_CLIP_GATE_PLACEHOLDER`) -- `swapRifleClaim`, on the body every page draws.
 * - A raise inside either is refused (`LauncherClips.liveOn`): the original's take is refused by the `NoFire` phase test
 *   (`FUN_005a8cb0` D:L463157 -> `FUN_005a7de0(actor, 1, 1)` D:L462695-462705 -> `FUN_0058a8c0`), though `DAT_003dec78`
 *   is in neither `FUN_005a7ab0`'s list (D:L462523-462549) nor `FUN_005a7980`'s (D:L462484-462491).
 */
const noClips = fixture('RUN/MOTION_P.ZAR') === null || fixture('RUN/READERC.ZAR') === null;
const tableClips = (): SimClips => simClipsFromBytes(fixture('RUN/MOTION_P.ZAR')!, fixture('RUN/READERC.ZAR')!);
describe('NU-5 L1, X1 and 324 P2: the launcher taken, the exchange\'s clip, the launcher claim\'s clip (research 323 §7)', () => {
  const laidBy = (g: ReturnType<typeof fourInRound>, from: number, item: number): number =>
    g.b.of('drop').find((d) => d.from === from && d.kind === 'weapon' && d.item === item)!.did;
  const bodyOf = (g: ReturnType<typeof fourInRound>, id: number): BodyState =>
    (g.room as unknown as { body(p: unknown): BodyState }).body(g.room.player(id));
  /** Seat 1 (a Terrorist at the origin) carrying the LAW with its round, killed: its LAW lies at the origin. */
  const lawCorpse = (g: ReturnType<typeof fourInRound>): number => {
    const p = writable(g.room, 1);
    p.loadout = kit(HELD_RIFLE.id, HELD_SIDEARM.id, 145, 185, EMPTY_ITEM);
    p.rounds = new KitRounds(kits().table, p.loadout);
    p.equipmentSlots = equipmentSlotsOf(p.loadout, kits().table);
    setRing(g.room, 1, 0, []); setRing(g.room, 1, 1, []);
    g.kill(1);
    return laidBy(g, 1, 145);
  };
  const codeOf = (name: string): number => (ACTION_CODES as readonly string[]).indexOf(name) + 1;
  /** Seat 2's raise of the LAW at its last command (the page's `throw`, `room.text` -> `raiseLauncher`). */
  const raise = (g: ReturnType<typeof fourInRound>): void => {
    const p = g.room.player(2)!, w = p.sim.walker.state;
    g.room.text(2, { type: 'throw', seq: p.sim.seq, kind: 'LAW', from: [w.x, w.y + 60, w.z], velocity: [0, 0, 0] });
  };

  it("L1: a SEAL with no launcher and two empty slots takes the LAW into FUN_005bae60's slot, the LAW HEAT beside it with one round; no exchange is laid; the kit to him (no firearm slot, no ring written) and taken to all", () => {
    const g = fourInRound();
    const did = lawCorpse(g);
    const marks = g.b.events.length;
    g.claim(2, did); g.step();
    expect(g.room.takeDrops()).toBeNull();
    const p = g.room.player(2)!;
    // The SEAL's kit: the M4A1, the Mark 23, the M67 (its grenades left: kept), two empty slots -- the LAW into 3, its round into 4.
    expect([...p.loadout]).toEqual([DEFAULT_RIFLE.id, HELD_SIDEARM.id, 121, 145, 185]);
    expect(p.rounds.ring(185)?.total()).toBe(1);
    const after = g.b.events.slice(marks);
    expect(after.filter((e) => e.type === 'taken')).toEqual([{ type: 'taken', did, by: 2, kit: [...p.loadout] }]);
    expect(after.filter((e) => e.type === 'drop')).toEqual([]);          // no exchange: nothing at his feet
    expect(after.filter((e) => e.type === 'kit')).toEqual([{ type: 'kit', loadout: [...p.loadout], rounds: [p.mags[0].state().slots, p.mags[1].state().slots], filled: [[], []] }]);
  });

  it("L1: refused 'family' to a kit carrying an M203 rifle, the MGL or a LAW, to one with no slot 2-4 free or replaceable, and (PICKUP_LAUNCHER_ROUND_SLOT_PLACEHOLDER) to one with a slot for the launcher and none for its round; the LAW stays", () => {
    expect(PICKUP_LAUNCHER_ROUND_SLOT_PLACEHOLDER).toBe('the first empty slot 2-4; none: refused');
    for (const k of [kit(61, HELD_SIDEARM.id, 121, EMPTY_ITEM, EMPTY_ITEM), kit(142, HELD_SIDEARM.id, 121, EMPTY_ITEM, EMPTY_ITEM),
      kit(DEFAULT_RIFLE.id, HELD_SIDEARM.id, 145, 185, EMPTY_ITEM), kit(DEFAULT_RIFLE.id, HELD_SIDEARM.id, 121, 121, 121),
      kit(DEFAULT_RIFLE.id, HELD_SIDEARM.id, 121, 121, EMPTY_ITEM)]) {
      const g = fourInRound();
      const did = lawCorpse(g);
      const p = writable(g.room, 2);
      p.loadout = k;
      p.rounds = new KitRounds(kits().table, k);
      p.equipmentSlots = equipmentSlotsOf(k, kits().table);
      g.room.takeDrops();
      g.claim(2, did); g.step();
      expect(g.room.takeDrops(), k.join(',')).toEqual({ 'pickup: family': 1 });
      expect([...p.loadout]).toEqual([...k]);
      expect(g.room.joinWire().drops?.some((d) => d.did === did)).toBe(true);
    }
  });

  it('MLS-EQ: a spent duplicate slot accepts the launcher and preserves the other stack without refilling it', () => {
    const g = fourInRound(), did = lawCorpse(g), p = writable(g.room, 2);
    p.loadout = kit(DEFAULT_RIFLE.id, HELD_SIDEARM.id, 121, 121, EMPTY_ITEM);
    p.rounds = new KitRounds(kits().table, p.loadout);
    p.equipmentSlots = equipmentSlotsOf(p.loadout, kits().table);
    for (let n = 0; n < 3; n++) p.equipmentSlots.spend('M67', 2);
    p.equipmentSlots.spend('M67', 3);
    g.room.takeDrops();
    g.claim(2, did); g.step();
    expect(g.room.takeDrops()).toBeNull();
    expect([...p.loadout]).toEqual([DEFAULT_RIFLE.id, HELD_SIDEARM.id, 145, 121, 185]);
    expect(p.equipmentSlots.state().map(s => [s.slot, s.kind, s.rounds[0]])).toEqual([[3, 'M67', 2]]);
    expect(p.grenades.M67).toBe(2);
  });

  it.skipIf(noClips)("X1: an exchange lays swapRifleExchange on the taker's mover from the claim's command + 1: a fire under it is refused (NoFire bare) until its end; a claim into an empty slot lays none", () => {
    const g = fourInRound({}, tableClips());
    setRing(g.room, 1, 0, []); setRing(g.room, 1, 1, []);
    g.kill(1);
    const p = writable(g.room, 2);
    const seq = p.sim.seq;
    g.claim(2, laidBy(g, 1, HELD_RIFLE.id), seq); g.step();
    expect(p.loadout[0]).toBe(HELD_RIFLE.id);                    // the M4A1 exchanged for the M4A1 SD
    g.drive(2, 1);
    expect(p.sim.seq).toBe(seq + 1);
    expect(p.sim.walker.action?.name).toBe('swapRifleExchange');
    expect(p.cone.frame(p.sim.seq)?.fire).toBe(false);
    expect(bodyOf(g, 2).action).toBe(codeOf('swapRifleExchange'));
    expect(remoteBodyAction(p.sim.walker.action)).toBeNull();     // another page draws none of it
    const life = playedOutCommand(ACTION_CLIPS.swapRifleExchange.playback, ACTION_CLIPS.swapRifleExchange.frames);
    g.drive(2, life + 1);
    expect(p.sim.walker.action?.name).not.toBe('swapRifleExchange');
    expect(p.cone.frame(p.sim.seq)?.fire).toBe(true);
    // The pistol into an empty slot: nothing exchanged, no clip, the next command may fire.
    p.loadout = kit(HELD_RIFLE.id, EMPTY_ITEM, 121, EMPTY_ITEM, EMPTY_ITEM);
    g.claim(2, laidBy(g, 1, HELD_SIDEARM.id)); g.step();
    expect(p.loadout[1]).toBe(HELD_SIDEARM.id);
    g.drive(2, 1);
    expect(p.sim.walker.action?.name ?? null).toBeNull();
    expect(p.cone.frame(p.sim.seq)?.fire).toBe(true);
  });

  it("324 P2: a LAW claim lays swapRifleClaim on the taker's mover from the claim's command + 1, so the body every page draws carries code 24 (PICKUP_LAUNCHER_CLIP_GATE_PLACEHOLDER: no action on the body); a firearm claim with no exchange lays none", () => {
    expect(PICKUP_LAUNCHER_CLIP_GATE_PLACEHOLDER).toBe('no action on the body');
    const g = fourInRound();
    const did = lawCorpse(g);
    const p = g.room.player(2)!;
    const seq = p.sim.seq;
    g.claim(2, did, seq); g.step();
    g.drive(2, 1);
    expect(p.sim.walker.action?.name).toBe('swapRifleClaim');
    expect(bodyOf(g, 2).action).toBe(codeOf('swapRifleClaim'));
    expect(codeOf('swapRifleClaim')).toBe(24);
    expect(bodyOf(g, 2).weapon).toBe(DEFAULT_RIFLE.id);          // the item in hand unchanged: nothing for a snapshot to split
    // A firearm claimed into an empty slot: no exchange, no clip on the body.
    const h = fourInRound();
    setRing(h.room, 1, 0, []); setRing(h.room, 1, 1, []);
    h.kill(1);
    writable(h.room, 2).loadout = kit(DEFAULT_RIFLE.id, EMPTY_ITEM, 121, EMPTY_ITEM, EMPTY_ITEM);
    h.claim(2, laidBy(h, 1, HELD_SIDEARM.id)); h.step();
    h.drive(2, 1);
    expect(bodyOf(h, 2).action).not.toBe(codeOf('swapRifleClaim'));
    expect(bodyOf(h, 2).action).not.toBe(codeOf('swapRifleExchange'));
  });

  it("the read of point 2: a raise of the taken LAW inside swapRifleClaim is refused (throw: launcher clip), as FUN_005a8cb0's NoFire test refuses the take; after the clip it is taken", () => {
    const g = fourInRound();
    const did = lawCorpse(g);
    g.claim(2, did); g.step();
    g.drive(2, 1);
    expect(g.room.player(2)!.sim.walker.action?.name).toBe('swapRifleClaim');
    g.room.takeDrops();
    raise(g); g.step();
    expect(g.room.takeDrops()).toEqual({ 'throw: launcher clip': 1 });
    expect(writable(g.room, 2).heldNext?.item ?? writable(g.room, 2).held).toBeNull();
    g.drive(2, playedOutCommand(ACTION_CLIPS.swapRifleClaim.playback, ACTION_CLIPS.swapRifleClaim.frames) + 1);
    raise(g); g.drive(2, 2);
    expect(g.room.takeDrops()).toBeNull();
    expect(writable(g.room, 2).held).toBe(145);
  });
});

/**
 * NU-5: the `Swap rifle` clip as the disc holds it, through the repository's readers over the tracked fixtures (as
 * PAR-84 read the launcher's): `motion.rdr`'s row (playback 1.1, `NoInterrupt ()` and `NoFire ()` bare, no
 * `BlendOverlay`), `MOTION_P.ZAR`'s keys and root (`ACTION_CLIPS.swapRifleExchange` / `swapRifleClaim`), and its
 * anim-set row in `animset.rdr` (SOLDIER's `Swap rifle` -> `seal_swaprifle`) carrying no `network_log` -- the keyword the
 * loader turns into the type's flag bit 0 (D:L496507-496511), without which `FUN_002bbaf0` sends no Push Blend
 * (D:L160789-160790): the others see no exchange clip (`PICKUP_CLIP_NETWORK_LOG_READING`, research 324 §7).
 */
describe.skipIf(noClips)('NU-5 the Swap rifle clip on the disc: its row, its root, and no network_log', () => {
  it("seal_swaprifle: playback 1.1, NoInterrupt and NoFire bare, 31 keys, the root (0.12, 0.05): ACTION_CLIPS' two rows", () => {
    const m = tableClips().table!.get('seal_swaprifle')!;
    expect([m.looped, m.blendOverlay, m.noFire, m.noInterrupt, m.playback]).toEqual([false, false, 1, 1, 1.1]);
    const [clip] = clipsFromPack(fixture('RUN/MOTION_P.ZAR')!, ['seal_swaprifle']);
    expect(clip?.frameCount).toBe(31);
    const root = clip!.parts.find((q) => q.name === 'skel_root')!.translations, last = 3 * 30;
    for (const name of ['swapRifleExchange', 'swapRifleClaim'] as const) {
      const row = ACTION_CLIPS[name];
      expect([row.playback, row.frames, row.noInterrupt], name).toEqual([1.1, 31, 1]);
      expect(root[last]! - root[0]!).toBeCloseTo(row.travel[0], 1);
      expect(root[last + 2]! - root[2]!).toBeCloseTo(row.travel[1], 1);
    }
  });

  it("SOLDIER's Swap rifle row names seal_swaprifle and carries no network_log; Throw grenade's does (the control)", () => {
    const zar = Zar.parse(fixture('RUN/READERC.ZAR')!);
    const flat = (n: RdrNode): RdrNode[] => (Array.isArray(n) && n.length === 1 && Array.isArray(n[0]) ? flat(n[0]) : n as RdrNode[]);
    const rows: { set: string; type: string; clip: unknown; logged: boolean }[] = [];
    for (const set of flat(parseRdr(zar.data(zar.find('animset.rdr')!)))) {
      for (const a of (rdrGet(set, 'anim_set_anims') ?? []) as RdrNode[]) {
        const type = rdrGet(a, 'type_name');
        if (typeof type === 'string') rows.push({ set: String(rdrGet(set, 'anim_set_name')), type, clip: rdrGet(a, 'anim_name'), logged: Array.isArray(a) && a.includes('network_log') });
      }
    }
    expect(rows.filter((r) => r.type === 'Swap rifle').map((r) => [r.set, r.clip, r.logged])).toEqual([['SOLDIER', 'seal_swaprifle', false]]);
    expect(rows.find((r) => r.type === 'Throw grenade')?.logged).toBe(true);
  });
});

/**
 * LATER 135: a claim is judged on its frame as of its decision -- its command's (`decide`, LATER 116's stale bound judged
 * there), or for a command a dropped backlog never ran the body the drop leaves (`ShotCone.latest`) -- not looked up at
 * the tick's end against the seat's latest command, which refused a claim decided in time 'stale' once the tick ran more
 * than 3 commands past it. One claim a command a seat (the page sends at most one `pickup` a command): a later one for
 * the same command replaces it; claims for different commands are all judged, in seq order.
 */
describe("LATER 135: a pickup judged on its frame as of its decision", () => {
  /** Seat 2's commands at rest, `n` of them, the next seqs on from its latest (none run yet). */
  const burst = (g: ReturnType<typeof fourInRound>, n: number): Command[] => {
    const p = g.room.player(2)!;
    return Array.from({ length: n }, (_, i) => ({ seq: p.sim.seq + 1 + i, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 }));
  };
  /** A dry body at seat 1 (its M4A1 SD did 0, its Mark 23 did 1), seat 2 at rest beside it with credit saved for a burst. */
  const dropsBeside = () => {
    const g = fourInRound();
    setRing(g.room, 1, 0, []); setRing(g.room, 1, 1, []);
    g.kill(1);
    g.room.takeDrops();
    g.step(30);                                                   // seat 2 sends nothing: its credit saved (CREDIT_MAX)
    return g;
  };

  it("a catch-up tick: a pickup decided at its command, then 7 more commands run in the same tick -- taken (was 'stale' at the tick's end)", () => {
    const g = dropsBeside();
    const cmds = burst(g, 8);
    g.room.binary(2, encodeCommands({ viewTick: g.room.tick, commands: cmds }));
    g.claim(2, 0, cmds[0]!.seq);
    g.step();
    expect(g.room.player(2)!.sim.seq).toBe(cmds[7]!.seq);         // the whole burst ran in the one tick
    expect(g.room.takeDrops()).toBeNull();
    expect(g.room.player(2)!.loadout[0]).toBe(HELD_RIFLE.id);
  });

  it('two claims for the same command keep the last; two claims for two commands in one tick are both judged, in seq order', () => {
    const g = dropsBeside();
    const cmds = burst(g, 8);
    g.room.binary(2, encodeCommands({ viewTick: g.room.tick, commands: cmds }));
    g.claim(2, 0, cmds[1]!.seq);
    g.claim(2, 1, cmds[1]!.seq);                                  // the same command: this one stands
    g.step();
    expect(g.room.joinWire().drops?.some((d) => d.did === 0)).toBe(true);
    expect(g.room.joinWire().drops?.some((d) => d.did === 1)).toBe(false);
    // Two commands, one tick: both claims judged, the earlier command's first.
    const h = dropsBeside();
    const more = burst(h, 8);
    h.room.binary(2, encodeCommands({ viewTick: h.room.tick, commands: more }));
    h.claim(2, 1, more[1]!.seq);
    h.claim(2, 0, more[3]!.seq);
    h.step();
    expect(h.room.takeDrops()).toBeNull();
    expect(h.room.joinWire().drops?.some((d) => d.did === 0 || d.did === 1)).toBe(false);
    expect(h.room.player(2)!.loadout[0]).toBe(HELD_RIFLE.id);
  });

  it("a claim given no frame (a caller that names none) is judged as before, against the seat's latest command", () => {
    const g = dropsBeside();
    g.drive(2, 8);
    const p = g.room.player(2)!;
    (g.room as unknown as { worldDrops: WorldDrops }).worldDrops.claim(2, p.sim.seq - 5, 0);
    g.step();
    expect(g.room.takeDrops()).toEqual({ 'pickup: stale': 1 });
  });
});

/** LATER 135's fresh review (F2, F3): the frame's cone, a real drop at a dropped backlog, and the claims' seq order. */
describe("LATER 135 (the review): the decided frame's cone, a dropped backlog over a real drop, the seq order", () => {
  type Frame = NonNullable<ReturnType<NonNullable<ReturnType<Room['player']>>['cone']['frame']>>;
  const drops = (g: ReturnType<typeof fourInRound>) => (g.room as unknown as { worldDrops: WorldDrops }).worldDrops;
  const dryBody = () => {
    const g = fourInRound();
    setRing(g.room, 1, 0, []); setRing(g.room, 1, 1, []);
    g.kill(1);
    g.room.takeDrops();
    return g;
  };

  it("F2: a decided frame counts only while it is the seat's own cone's (a respawn's new cone, a copy): else judged 'stale'", () => {
    const g = dryBody();
    g.drive(2, 4);
    const p = g.room.player(2)!;
    const copy = { ...p.cone.frame(p.sim.seq)! } as Frame;           // the same values, not the cone's own frame
    drops(g).claim(2, p.sim.seq, 0, copy);
    g.step();
    expect(g.room.takeDrops()).toEqual({ 'pickup: stale': 1 });
    drops(g).claim(2, p.sim.seq, 0, p.cone.frame(p.sim.seq));       // the cone's own: taken
    g.step();
    expect(g.room.takeDrops()).toBeNull();
    expect(g.room.player(2)!.loadout[0]).toBe(HELD_RIFLE.id);
  });

  it("F3: one seat's claims are judged in seq order, whatever order they came in", () => {
    const g = dryBody();
    g.drive(2, 4);
    const p = g.room.player(2)!, s = p.sim.seq;
    p.cone.frame(s - 1)!.fire = false;                               // the earlier command cannot fire
    drops(g).claim(2, s, 0, p.cone.frame(s));                        // the later command's claim first
    drops(g).claim(2, s - 1, 0, p.cone.frame(s - 1));
    g.step();
    // Seq order: s - 1 refused 'nofire', then s takes it (arrival order would give the take, then 'taken').
    expect(g.room.takeDrops()).toEqual({ 'pickup: nofire': 1 });
    expect(g.room.player(2)!.loadout[0]).toBe(HELD_RIFLE.id);
  });

  /** Seat 2 stalls 9 s, then its held commands and 9 s more; a pickup of did 0 named 100 commands after the stall. */
  function stalledClaim(at: V3) {
    const g = dryBody();
    g.place(2, at); g.drive(2, 4);
    const p = g.room.player(2)!;
    const held: Command[] = [];
    const next = (): Command => ({ seq: (held.at(-1)?.seq ?? p.sim.seq) + 1, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 });
    for (let t = 0; t < 9 * TICK_HZ; t++) { held.push(next()); g.step(); }
    for (let i = 0; i < held.length; i += 16) g.room.binary(2, encodeCommands({ viewTick: g.room.tick, commands: held.slice(i, i + 16) }));
    let last = held.at(-1)!.seq;
    for (let t = 0; t < 9 * TICK_HZ; t++) {
      const c: Command = { seq: ++last, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
      g.room.binary(2, encodeCommands({ viewTick: g.room.tick, commands: [c] }));
      if (t === 100) g.claim(2, 0, c.seq);
      g.step();
    }
    return g;
  }

  it("F3: a pickup named in a dropped backlog is judged on the body the drop leaves: in its reach, taken", () => {
    const g = stalledClaim([10, 0, 0]);
    const tally = g.room.takeDrops() ?? {};
    expect(tally['command: backlog']).toBe(1);
    expect(tally['pickup: stale'] ?? 0).toBe(0);
    expect(g.room.player(2)!.loadout[0]).toBe(HELD_RIFLE.id);
  });

  it("F3: ... and out of its reach, refused 'reach' (the drop buys no movement: the room's last real frame)", () => {
    const g = stalledClaim([25, 0, 0]);
    const tally = g.room.takeDrops() ?? {};
    expect(tally['command: backlog']).toBe(1);
    expect(tally['pickup: reach']).toBe(1);
    expect(g.room.player(2)!.loadout[0]).toBe(DEFAULT_RIFLE.id);
  });
});
