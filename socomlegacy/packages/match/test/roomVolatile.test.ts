import { describe, expect, it, vi } from 'vitest';
import {
  CLAYMORE, DEFAULT_RIFLE, HELD_SIDEARM, launchGrenade, M67, arsenalOf, type CollisionOwner, type Grenade, type GridParams, type Loadout,
  type SpawnSlot, type ThrowableRecord, type WeaponRecord, type WorldPoly,
} from '@s2u/scene';
import {
  cameraLook, centreClaim, encodeCommands, EYE_HEIGHT, faceToward, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type Command,
  type ServerEvent, type SimKits, type SimMap,
} from '../../viewer/src/sim';
import { Room, type Conn } from '../src/room';

/**
 * PF-36 (web sprint 30; research 235 s3-s4, 194 s9 A21; ruling PF.R56): `Volitile` -- a resting claymore or PMN that
 * takes damage queues its own detonation (`FUN_003c69c0`: `GetDamage(1.0, incoming, target+0x54)` nonzero
 * L318206-318207, the target not already going off L318208-318214, then state 3 / stage 2 L318215-318216). The room's
 * two damage dispatches reach it -- a round's walk (`FUN_003c8920` D:L319417-319418) and a blast's target walk
 * (`FUN_003c7dd0` 0x3c7e74-0x3c7e8c) -- through `chargeHit`; the charge goes off on the next game frame
 * (VOLATILE_CHAIN_TIMING_READING), its kills its owner's (VOLATILE_CREDIT_READING). On a synthetic floor and a hand-built
 * kit table, as `roomEquipment.test.ts` (the placed charges) and `roomPenetration.test.ts` (the aimed round).
 */

type V3 = [number, number, number];
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};
/** The flat floor and a wall across x = 100 over z 400..600, 80 high (the blast's obstructed case, far from the rest). */
function map(): SimMap {
  const polys: WorldPoly[] = [FLOOR, { ...FLOOR, path: 'worldmodel/wall', ditype: 2, points: Float32Array.from([100, 0, 400, 100, 0, 600, 100, 80, 600, 100, 80, 400]) }];
  const owners: CollisionOwner[] = polys.map((q, i) => ({ modelName: 'worldmodel', path: `${q.path}0`, first: i, count: 1 }));
  const ground = packGround(PARAMS, polys, owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [] };
}

const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
const round = (over: Partial<ThrowableRecord>): ThrowableRecord => ({ ...M67, ...over });
/** The disc's PMN and its `PMN Ammo` (Volitile, ProximityDistance 1 m), as `roomEquipment.test.ts` transcribes them. */
const PMN = round({ ...CLAYMORE, name: 'PMN Mine', id: 158, fuse: 8, removal: 10, explosionDamage: 6.5, explosionRadius: 40, proximity: 10, volatile: true });
/** C4 and its `C4 Ammo`: IgnoreExplosionDI, never Volitile (research 194 s9: Claymore Ammo 17 and PMN Ammo 44 alone). */
const C4 = round({ ...CLAYMORE, name: 'C4', id: 151, fuse: 6, removal: 0.1, explosionDamage: 18, explosionRadius: 50, ignoreExplosionDI: true, volatile: undefined });
/**
 * A test rifle reaching 100 units (Effective_Range 5 m, Maximum_Range 10 m), the M4A1's 2.3 + 0.3 a round: at the charge
 * the base is 2.6 to 50 units, under GetDamage's 1.0 minimum past 80.8, and the ray ends at 100.
 */
const SHORT: WeaponRecord = { ...DEFAULT_RIFLE, name: 'SHORT', id: 900, fireModes: [1], maxFireMode: 1, effectiveRange: 5, maximumRange: 10 };
/**
 * A test rifle with no piercing reaching 100 units at full damage: a PERSON-like surface (0.97) at ~90 would cut what is
 * left of its range to 97, short of a wall at 98 -- so a charge that were a surface of the walk would stop it there.
 */
const BARE: WeaponRecord = { ...DEFAULT_RIFLE, name: 'BARE', id: 901, fireModes: [1], maxFireMode: 1, piercing: 0, effectiveRange: 10, maximumRange: 10 };
const item = (name: string, id: number): unknown[] => ['InternalName', [name], 'ID', [String(id)], 'Ammo_Capacity', ['1'], 'NumMags', ['1'], 'AMMO_TYPES', [[]]];
const arsenal = arsenalOf(['ZAMMO', [], 'ZWEAPON', [
  item('C4', 151), item('Claymore', 153), item('PMN Mine', 158), item('M67', 121), item('Detonator', 193),
] as never]);
function kits(terrorist: Loadout, seal: Loadout): SimKits {
  return {
    table: {
      arsenal, records: new Map([DEFAULT_RIFLE, HELD_SIDEARM, SHORT, BARE].map((x) => [x.id, x])), rounds: new Map(),
      throwables: new Map([M67, CLAYMORE, PMN, C4].map((x) => [x.id, { record: x, piercing: x.id === 121 ? 4 : 0 }])),
    },
    map: {
      valves: new Map(), selectable: { seal: [], terrorist: [] },
      kits: { seal: [{ type: 'S', character: 's', loadout: seal }], terrorist: [{ type: 'T', character: 't', loadout: terrorist }] },
    },
  };
}

class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* not used */ }
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] {
    return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[];
  }
}

/** What the tests read of the room's flying list (private): the projectile's id, kind, owner and `Grenade`. */
interface Fly { pid: number; kind: string; owner: { id: number }; name: string; g: Grenade; facing?: V3 }

const tok = (tab: number): string => `tab${tab}`.padEnd(22, '_');
const RIFLE = kit(DEFAULT_RIFLE.id, 15, 121, 255, 255);
const CHARGES = kit(DEFAULT_RIFLE.id, 15, 153, 158, 121);
/**
 * Players 1 (T), 2 (S), 3 (S) -- the join rule -- at `at[i]` (feet on the floor); the Terrorist's kit `terrorist`, the
 * SEALs' the claymore, the PMN and the M67.
 */
function setup(at: readonly V3[], terrorist: Loadout = RIFLE) {
  let seed = 1;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const room = new Room(map(), null, { now: () => 0, random }, null, kits(terrorist, CHARGES));
  const cs = at.map((_, i) => {
    const c = new Client();
    room.hello(i + 1, c, { type: 'hello', version: PROTOCOL_VERSION, name: `P${i + 1}`, map: 'MP99', session: tok(i + 1) }, `10.0.0.${i + 1}`);
    return c;
  });
  room.step();
  at.forEach((p, i) => room.player(i + 1)!.sim.walker.place(p[0], p[1] + 20, p[2]));
  for (let i = 0; i < 30; i++) room.step();
  const flying = (): Fly[] => (room as unknown as { flying: Fly[] }).flying;
  const byPid = (pid: number): Fly | undefined => flying().find((f) => f.pid === pid);
  const look = new Map<number, { yaw: number; pitch: number }>();
  const feet = (id: number): V3 => { const w = room.player(id)!.sim.walker.state; return [w.x, w.y, w.z]; };
  const eye = (id: number): V3 => { const f = feet(id); return [f[0], f[1] + EYE_HEIGHT, f[2]]; };
  const drive = (id: number, seconds: number): void => {
    for (let i = 0; i < Math.max(1, Math.round(seconds * TICK_HZ)); i++) {
      const p = room.player(id)!;
      const l = look.get(id) ?? { yaw: p.sim.walker.state.yaw, pitch: 0 };
      const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: l.yaw, pitch: l.pitch, turn: 0, buttons: 0, stance: 0, weapon: 0 };
      room.binary(id, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
      room.step();
    }
  };
  const run = (seconds: number): void => { for (let i = 0; i < Math.round(seconds * TICK_HZ); i++) room.step(); };
  /** `id` moved to `to` (feet) and landed. */
  const move = (id: number, to: V3): void => { room.player(id)!.sim.walker.place(to[0], to[1] + 20, to[2]); run(0.5); };
  const face = (id: number, point: V3): void => {
    look.set(id, faceToward({ feet: feet(id), posture: room.player(id)!.sim.walker.posture }, point));
    room.player(id)!.sim.allowSnap();                            // staged: the test sets the facing, as the room would (OT.R38)
    drive(id, 0.5);
  };
  /**
   * `id`'s round down the cone's centre to `point`, at the command before its last: decided at once (`due`: the
   * command after it has run), before any step -- so the test sees the room's state between the hit and the next frame.
   */
  const shoot = (id: number, point: V3): void => {
    const p = room.player(id)!, seq = p.sim.seq - 1, f = p.cone.frame(seq)!;
    const { eye: e } = cameraLook(f);
    const c = centreClaim(f, [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]], Math.hypot(point[0] - e[0], point[1] - e[1], point[2] - e[2]));
    room.text(id, { type: 'fire', seq, from: c.from, dir: c.dir, eye: c.eye, aim: c.aim, weapon: 0, viewTick: room.tick });
  };
  const send = (id: number, kind: string, from: V3, velocity: V3): void => room.text(id, { type: 'throw', seq: room.player(id)!.sim.seq, kind, from, velocity });
  /** SEAL `id` sets a `kind` down at `point` facing `facing`, from feet 8 units short of it along x (its hand's reach). */
  const place = (id: number, kind: string, point: V3, facing: V3 = [1, 0, 0]): number => {
    move(id, [point[0] - 8, 0, point[2]]);
    const before = flying().length;
    send(id, kind, point, facing);
    expect(flying().length, `${kind} at ${point.join(',')} set down`).toBe(before + 1);
    return flying().at(-1)!.pid;
  };
  /**
   * The ticks (from now) at which each projectile at rest now went off, stepping `seconds`: its state left 'rest' --
   * 'detonated', or 'removed' and gone from the list in the same step when its `Timer2` had already run out at rest.
   */
  const watch = (seconds: number, from = room.tick): Map<number, number> => {
    const off = new Map<number, number>();
    const resting = flying().filter((f) => f.g.state === 'rest').map((f) => f.pid);
    for (let i = 0; i < Math.round(seconds * TICK_HZ); i++) {
      room.step();
      for (const pid of resting) if (!off.has(pid) && byPid(pid)?.g.state !== 'rest') off.set(pid, room.tick - from);
    }
    return off;
  };
  /** The room's blasts by projectile id so far (a spy on its `blast`, from this call on). */
  const blasts = (): (() => Map<number, number>) => {
    const spy = vi.spyOn(room as unknown as { blast: (f: Fly, at: readonly number[]) => void }, 'blast');
    return () => {
      const n = new Map<number, number>();
      for (const [f] of spy.mock.calls) n.set(f.pid, (n.get(f.pid) ?? 0) + 1);
      return n;
    };
  };
  const detonates = (c: Client, pid: number) => c.of('detonate').filter((e) => e.pid === pid);
  return { room, cs, flying, byPid, feet, eye, drive, run, move, face, shoot, send, place, watch, blasts, detonates };
}

describe('PF-36: Volitile -- damage on a resting charge queues one detonation (research 235 s3-s4; ruling PF.R56)', () => {
  it('a round into a resting claymore within CHARGE_HIT_RADIUS_PLACEHOLDER queues its detonation (003c69c0 L318215-318216: state 3 / stage 2 -> the port\'s trigger), the room tells detonate with its pid and the shooter, and the charge goes off on the next game frame (VOLATILE_CHAIN_TIMING_READING) with the owner credited for its kills (VOLATILE_CREDIT_READING)', () => {
    const s = setup([[60, 0, 0], [0, 0, 0]]);
    const [a, b] = s.cs as [Client, Client];
    const pid = s.place(2, 'Claymore', [8, 0.1, 0]);              // facing east, the Terrorist 52 in front of it
    s.move(2, [-300, 0, 0]);                                       // its owner well behind it, outside its 250
    s.face(1, [8, 0.1, 0]);
    s.run(20);
    expect(s.byPid(pid)!.g.state).toBe('rest');                    // held: no fuse of its own (+0xc5)
    s.shoot(1, [8, 0.1, 0]);                                       // the M4A1 at ~50 u: 2.6 at the charge, over the 1.0
    // Queued, told to every page with its pid and the shooter -- not gone off within the hit.
    expect(a.of('detonate')).toEqual([{ type: 'detonate', pid, by: 1 }]);
    expect(b.of('detonate')).toEqual([{ type: 'detonate', pid, by: 1 }]);
    expect(s.byPid(pid)!.g.state).toBe('rest');
    const off = s.watch(0.5);
    // The next game frame (GAME_FRAME_DT = 525/15734 s, 2.002 ticks): within three ticks of the hit.
    expect(off.get(pid)).toBeGreaterThanOrEqual(1);
    expect(off.get(pid)).toBeLessThanOrEqual(3);
    // Its fragments killed the Terrorist in its cone: the claymore's owner's kill by it, never the shooter's suicide.
    expect(a.of('kill')).toEqual([expect.objectContaining({ killer: 2, victim: 1, weapon: 'Claymore', how: 'weapon' })]);
    expect(s.room.player(1)!.alive).toBe(false);
  });

  it('a round whose damage at the charge is 0 -- beyond its maximum range -- queues nothing (GetDamage(1.0, ...) nonzero, L318206-318207; VOLATILE_MIN_DAMAGE_READING); a round past a C4 (unflagged) or a grenade in flight strikes neither', () => {
    const s = setup([[150, 0, 0], [0, 0, 0]], kit(SHORT.id, 15, 121, 255, 255));
    const [a] = s.cs as [Client];
    const pid = s.place(2, 'Claymore', [8, 0.1, 0]);
    s.move(2, [-300, 0, 0]);
    // 150 out: the 100-unit round never reaches the charge (bulletDamage null past Maximum_Range).
    s.face(1, [8, 0.1, 0]);
    s.shoot(1, [8, 0.1, 0]);
    s.run(0.2);
    // 92 out: it reaches it, but at ~88 units its base is 2.6 x (1 - 38/50) = 0.6, under GetDamage's 1.0 minimum
    // (FUN_003c7600 D:L318763-318764 returns 0): a nonzero raw damage that resolves to zero queues nothing.
    s.move(1, [100, 0, 0]);
    s.face(1, [8, 0.1, 0]);
    s.shoot(1, [8, 0.1, 0]);
    s.run(0.2);
    expect(a.of('detonate')).toEqual([]);
    expect(s.byPid(pid)!.g.state).toBe('rest');
    expect(s.byPid(pid)!.g.trigger).toBeUndefined();
    // 47 out, the full 2.6: through a resting C4 on the floor in the round's path and a PMN still in the air above it --
    // neither is struck (C4 Ammo has no Volitile; a projectile in flight is no charge at rest) -- into the claymore.
    s.move(1, [55, 0, 0]);
    s.face(1, [8, 0.1, 0]);
    const owner = s.room.player(2)! as unknown as Fly['owner'];   // the room's Player (its id is a field of the class)
    const c4: Fly = { owner, name: 'P2', kind: 'C4', g: { ...launchGrenade([14, 0.1, 0], [0, 0, 0], C4), state: 'rest' }, facing: [1, 0, 0], pid: 100 };
    const air: Fly = { owner, name: 'P2', kind: 'PMN Mine', g: launchGrenade([42, 10.2, 0], [0, 0, 0], PMN), pid: 101 };
    s.flying().push(c4, air);
    s.shoot(1, [8, 0.1, 0]);
    expect(a.of('detonate')).toEqual([{ type: 'detonate', pid, by: 1 }]);
    expect([c4.g.trigger, air.g.trigger]).toEqual([undefined, undefined]);
  });

  it('a blast reaching a resting PMN inside its radius with the line clear queues it; one outside the radius or behind a wall does not, one behind a claymore\'s back still does (its 32nd follows GetDamage\'s 1.0 minimum, D:L318763-318781); two claymores a metre apart chain: the first\'s blast queues the second, which goes off one frame later, each once', () => {
    // The open floor: a claymore facing east, a PMN 100 in front, one 100 behind, one 300 out (past its 250).
    const open = setup([[-700, 0, 700], [0, 0, 0]]);
    const [oa] = open.cs as [Client];
    const clay = open.place(2, 'Claymore', [8, 0.1, 0]);
    const front = open.place(2, 'PMN Mine', [108, 0.1, 0]);
    const back = open.place(2, 'PMN Mine', [-92, 0.1, 0]);
    const far = open.place(2, 'PMN Mine', [308, 0.1, 0]);
    open.move(2, [0, 0, -400]);                                    // in the Detonator's 500, out of every blast and trip
    open.send(2, 'Detonator', open.eye(2), [0, 0, 0]);
    const off = open.watch(1);
    expect(oa.of('detonate').map((e) => [e.pid, e.by])).toEqual([[front, 2], [back, 2]]);   // the charge's owner's blast
    expect(off.get(front)! - off.get(clay)!).toBeGreaterThanOrEqual(2);                    // one game frame later
    expect(off.get(back)! - off.get(clay)!).toBeLessThanOrEqual(3);
    expect(off.has(far)).toBe(false);
    expect(open.byPid(far)!.g.state).toBe('rest');
    // Behind the wall at x = 100: 80 from the claymore, the line from its blast to the PMN blocked.
    const walled = setup([[-700, 0, 700], [0, 0, 300]]);
    const [wa] = walled.cs as [Client];
    walled.place(2, 'Claymore', [60, 0.1, 500]);
    const hid = walled.place(2, 'PMN Mine', [140, 0.1, 500]);
    walled.move(2, [0, 0, 150]);
    walled.send(2, 'Detonator', walled.eye(2), [0, 0, 0]);
    walled.watch(1);
    expect(wa.of('detonate')).toEqual([]);
    expect(walled.byPid(hid)!.g.state).toBe('rest');
    // The chain: two claymores 10 apart (a metre), facing north; the Terrorist shoots the first, its blast queues the second.
    const chain = setup([[-60, 0, 0], [0, 0, 0]]);
    const [ca] = chain.cs as [Client];
    const counts = chain.blasts();
    const first = chain.place(2, 'Claymore', [8, 0.1, 0], [0, 0, 1]);
    const second = chain.place(2, 'Claymore', [8, 0.1, 10], [0, 0, 1]);   // 10 north: off the round's line
    chain.move(2, [0, 0, -400]);
    chain.face(1, [8, 0.1, 0]);
    chain.shoot(1, [8, 0.1, 0]);
    const went = chain.watch(1);
    expect(ca.of('detonate').map((e) => [e.pid, e.by])).toEqual([[first, 1], [second, 2]]);
    expect(went.get(second)! - went.get(first)!).toBeGreaterThanOrEqual(2);              // not the same frame
    expect(went.get(second)! - went.get(first)!).toBeLessThanOrEqual(3);
    expect([...counts()]).toEqual([[first, 1], [second, 1]]);
  });

  it('a charge already going off is not requeued and scores no second blast: a round and a blast on the same frame, a Detonator plus a round, a proximity trip plus a blast (VOLATILE_STATE_GATE_READING)', () => {
    // A round and a blast on the same frame: the PMN shot (queued), the claymore's Detonator fired at once -- the
    // claymore's blast meets the PMN already queued.
    const one = setup([[160, 0, 40], [0, 0, 0]]);
    const [a1] = one.cs as [Client];
    const n1 = one.blasts();
    const clay1 = one.place(2, 'Claymore', [8, 0.1, 0]);
    const pmn1 = one.place(2, 'PMN Mine', [108, 0.1, 0]);
    one.move(2, [0, 0, -400]);
    one.face(1, [108, 0.1, 0]);
    one.shoot(1, [108, 0.1, 0]);
    one.send(2, 'Detonator', one.eye(2), [0, 0, 0]);
    one.watch(1);
    expect(one.detonates(a1, pmn1)).toEqual([{ type: 'detonate', pid: pmn1, by: 1 }]);
    expect(one.detonates(a1, clay1)).toEqual([]);
    expect([...n1()].sort((x, y) => x[0] - y[0])).toEqual([[clay1, 1], [pmn1, 1]]);
    // A Detonator plus a round: the claymore set off by its owner, then shot before the frame -- nothing more.
    const two = setup([[60, 0, 0], [0, 0, 0]]);
    const [a2] = two.cs as [Client];
    const n2 = two.blasts();
    const clay2 = two.place(2, 'Claymore', [8, 0.1, 0]);
    two.move(2, [-300, 0, 0]);
    two.face(1, [8, 0.1, 0]);
    two.send(2, 'Detonator', two.eye(2), [0, 0, 0]);
    two.shoot(1, [8, 0.1, 0]);
    two.watch(1);
    expect(a2.of('detonate')).toEqual([]);
    expect([...n2()]).toEqual([[clay2, 1]]);
    expect(a2.of('kill')).toHaveLength(1);                         // one blast, one death
    // A proximity trip plus a blast: the armed PMN (laid first) stepped on, the claymore's Detonator fired the same tick.
    const three = setup([[-700, 0, 700], [0, 0, 0]]);
    const [a3] = three.cs as [Client];
    const n3 = three.blasts();
    const pmn3 = three.place(2, 'PMN Mine', [108, 0.1, 0]);
    const clay3 = three.place(2, 'Claymore', [8, 0.1, 0]);
    three.move(2, [0, 0, -400]);
    three.run(8.5);                                                // the PMN armed (Timer1 8 s)
    three.room.player(1)!.sim.walker.place(108, 0, 0);             // the Terrorist on it
    three.send(2, 'Detonator', three.eye(2), [0, 0, 0]);
    three.watch(1);
    // MINES-ROOM (research 235 §8): the trip is told, once, as the room's own (`by` null); the claymore's blast finds the
    // PMN gone off already and queues nothing (no second `detonate`). Was: `[]` -- the room told no trip (H1).
    expect(a3.of('detonate')).toEqual([{ type: 'detonate', pid: pmn3, by: null }]);
    expect([...n3()].sort((x, y) => x[0] - y[0])).toEqual([[pmn3, 1], [clay3, 1]].sort((x, y) => x[0]! - y[0]!));
  });

  it('MINES-ROOM (research 235 §8): a PMN queued by chargeHit and tripped by proximity in the same frame is told once -- chargeHit\'s, with its by -- the claymore laid first', () => {
    // (a) The claymore laid FIRST, then the PMN: the claymore's blast (earlier in the frame's walk) queues the PMN, whose
    // own frame then finds the Terrorist on it. One `detonate` for the PMN, the chargeHit's (by its owner, 2), one blast.
    const a = setup([[-700, 0, 700], [0, 0, 0]]);
    const [ca] = a.cs as [Client];
    const na = a.blasts();
    const clay = a.place(2, 'Claymore', [8, 0.1, 0]);
    const pmn = a.place(2, 'PMN Mine', [108, 0.1, 0]);
    a.move(2, [0, 0, -400]);
    a.run(8.5);                                                    // the PMN armed (Timer1 8 s)
    a.room.player(1)!.sim.walker.place(108, 0, 0);                 // the Terrorist on it
    a.send(2, 'Detonator', a.eye(2), [0, 0, 0]);
    a.watch(1);
    expect(a.detonates(ca, pmn)).toEqual([{ type: 'detonate', pid: pmn, by: 2 }]);
    expect(na().get(pmn)).toBe(1);
    expect(na().get(clay)).toBe(1);
  });

  it('MINES-ROOM (research 235 §8): two armed PMNs tripped by one walk-in in one frame are told once each -- the first\'s trip (by null), the second\'s chargeHit (by its owner)', () => {
    // (b) Two armed PMNs 6 apart, one body walking onto both: the first trips (by null), its blast queues the second
    // (by its owner), which its own frame also finds tripped -- told once, the chargeHit's. One `detonate` per pid.
    const b = setup([[-700, 0, 700], [0, 0, 0]]);
    const [cb] = b.cs as [Client];
    const nb = b.blasts();
    const p0 = b.place(2, 'PMN Mine', [108, 0.1, 0]);
    const p1 = b.place(2, 'PMN Mine', [114, 0.1, 0]);
    b.move(2, [0, 0, -400]);
    b.run(8.5);
    b.room.player(1)!.sim.walker.place(111, 0, 0);                 // the Terrorist between them, inside both trips
    b.watch(1);
    expect(b.detonates(cb, p0)).toHaveLength(1);
    expect(b.detonates(cb, p1)).toHaveLength(1);
    expect(cb.of('detonate').map((e) => [e.pid, e.by])).toEqual([[p0, null], [p1, 2]]);
    expect(nb().get(p0)).toBe(1);
    expect(nb().get(p1)).toBe(1);
  });

  it('the placer alone is told placed with the room\'s pid for his throw and his charge (OWN_PID_READING); the grenade broadcast still skips him', () => {
    const s = setup([[-700, 0, 700], [0, 0, 0]]);
    const [a, b] = s.cs as [Client, Client];
    const pid = s.place(2, 'Claymore', [8, 0.1, 0]);
    expect(b.of('placed')).toEqual([{ type: 'placed', pid, kind: 'Claymore', from: [8, 0.1, 0] }]);
    expect(a.of('placed')).toEqual([]);
    expect(a.of('grenade')).toEqual([expect.objectContaining({ id: 2, kind: 'Claymore', pid })]);
    expect(b.of('grenade')).toEqual([]);
    s.drive(2, 1);
    const from: V3 = [s.feet(2)[0], s.feet(2)[1] + 15.4, s.feet(2)[2]];
    s.send(2, 'M67', from, [0, 0, 0]);                              // a drop at the feet from the eye, a throw at power 0
    const thrown = s.flying().at(-1)!;
    expect(thrown.kind).toBe('M67');
    expect(b.of('placed').at(-1)).toEqual({ type: 'placed', pid: thrown.pid, kind: 'M67', from });
    expect(a.of('placed')).toEqual([]);
    expect(a.of('grenade').at(-1)).toMatchObject({ id: 2, kind: 'M67', pid: thrown.pid });
    expect(b.of('grenade')).toEqual([]);
  });

  it('a departed owner\'s claymore shot by another goes off with no one credited (how \'orphan\', as its own blast would be); a new round clears the queue with the air', () => {
    const s = setup([[60, 0, 0], [0, 0, 0], [0, 0, -500]]);
    const [a] = s.cs as [Client];
    const pid = s.place(2, 'Claymore', [8, 0.1, 0]);
    s.move(2, [-300, 0, 0]);
    s.room.leave(2);                                               // its owner gone; the other SEAL keeps the side
    s.face(1, [8, 0.1, 0]);
    s.shoot(1, [8, 0.1, 0]);
    expect(a.of('detonate')).toEqual([{ type: 'detonate', pid, by: 1 }]);
    s.watch(0.5);
    expect(a.of('kill')).toEqual([expect.objectContaining({ killer: null, victim: 1, weapon: 'Claymore', how: 'orphan', killerName: 'P2' })]);
    // Queued, then a new round before its frame: the air goes and the charge with it -- no blast.
    const r = setup([[60, 0, 0], [0, 0, 0]]);
    const [ra] = r.cs as [Client];
    const n = r.blasts();
    const q = r.place(2, 'Claymore', [8, 0.1, 0]);
    r.move(2, [-300, 0, 0]);
    r.face(1, [8, 0.1, 0]);
    r.shoot(1, [8, 0.1, 0]);
    expect(ra.of('detonate')).toEqual([{ type: 'detonate', pid: q, by: 1 }]);
    (r.room as unknown as { startRound(newMatch: boolean): void }).startRound(false);
    r.run(1);
    expect(r.flying()).toEqual([]);
    expect([...n()]).toEqual([]);
    expect(ra.of('kill')).toEqual([]);
  });

  it('a round that hits a charge continues to the wall behind it; the shot event\'s to is the wall (CHARGE_ROUND_PASS_READING: no surface of the walk, the range uncut); a muzzle inside the radius facing away misses', () => {
    const s = setup([[2, 0, 500], [0, 0, 0]], kit(BARE.id, 15, 121, 255, 255));
    const [, b] = s.cs as [Client, Client];
    const owner = s.room.player(2)! as unknown as Fly['owner'];
    s.face(1, [100, 15.4, 500]);                                   // the wall at x = 100, ~98 from the muzzle
    // A claymore resting just short of the wall on the round's line (entered at ~90): were it a 0.97 surface of the
    // walk, BARE's range would be cut to 97 there and the round would end at the charge, short of the wall at 98.
    const clay: Fly = { owner, name: 'P2', kind: 'Claymore', g: { ...launchGrenade([95, 15.4, 500], [0, 0, 0], CLAYMORE), state: 'rest' }, facing: [1, 0, 0], pid: 200 };
    s.flying().push(clay);
    s.shoot(1, [100, 15.4, 500]);
    expect(b.of('detonate')).toEqual([{ type: 'detonate', pid: 200, by: 1 }]);
    const shot = b.of('shot').at(-1)!;
    expect(shot.to[0]).toBeCloseTo(100, 6);                        // the wall, not the charge
    expect(shot.material).not.toBeNull();
    // Inside the sphere, facing away: the prone shooter at his own charge fires the other way -- nothing.
    const s2 = setup([[0, 0, -300], [0, 0, 0]]);
    const [a2] = s2.cs as [Client];
    const own = s2.room.player(1)! as unknown as Fly['owner'];
    const f1 = s2.feet(1);
    const near: Fly = { owner: own, name: 'P1', kind: 'Claymore', g: { ...launchGrenade([f1[0] + 1, f1[1] + 15.4, f1[2] + 2], [0, 0, 0], CLAYMORE), state: 'rest' }, facing: [1, 0, 0], pid: 201 };
    s2.flying().push(near);
    s2.face(1, [f1[0], f1[1], f1[2] - 200]);                       // facing -z, away from the charge 2 behind the muzzle
    s2.shoot(1, [f1[0], f1[1], f1[2] - 200]);
    expect(a2.of('detonate')).toEqual([]);
    s2.face(1, [f1[0] + 20, f1[1], f1[2] + 40]);                   // turned toward it: struck from inside
    s2.shoot(1, [f1[0] + 20, f1[1], f1[2] + 40]);
    expect(a2.of('detonate')).toEqual([{ type: 'detonate', pid: 201, by: 1 }]);
  });

  // The regression of sprint 30's browser gate (remoteCombat.spec.ts:422; research 235 s7): three seats, as the spec.
  it('three seats: CHARLIE\'s Detonator sets off his own claymore only -- BRAVO\'s, beyond his blast\'s reach, gets no detonate and still rests -- and BRAVO\'s own Detonator fires it (CZKit_DetonateRemoteExplosives, by owner)', () => {
    const s = setup([[-700, 0, 700], [0, 0, 0], [300, 0, 0]]);
    const [alpha] = s.cs as [Client];
    const mine = s.place(2, 'Claymore', [8, 0.1, 0]);              // BRAVO's
    const theirs = s.place(3, 'Claymore', [308, 0.1, 0]);          // CHARLIE's, 300 off: past its own 250
    s.move(2, [-100, 0, 0]);
    s.move(3, [300, 0, -50]);                                       // CHARLIE 296 from BRAVO's: inside his Detonator's 500
    s.send(3, 'Detonator', s.eye(3), [0, 0, 0]);
    const off = s.watch(1);
    expect(off.has(theirs)).toBe(true);
    expect(off.has(mine)).toBe(false);
    expect(s.detonates(alpha, mine)).toEqual([]);
    expect(s.byPid(mine)!.g.state).toBe('rest');
    s.send(2, 'Detonator', s.eye(2), [0, 0, 0]);                    // BRAVO's own press
    expect(s.watch(1).has(mine)).toBe(true);
    expect(s.detonates(alpha, mine)).toEqual([]);                    // the Detonator's path, not a queued detonation
  });

  it('three seats, the gate\'s layout: BRAVO and CHARLIE 30 apart, their claymores set down facing away from each other; CHARLIE\'s Detonator fires his own, whose blast (BRAVO\'s ~40 behind its back, the line clear: the 32nd, nonzero) queues BRAVO\'s -- a chain told by detonate, by CHARLIE (PF.R56), not his Detonator', () => {
    const s = setup([[-700, 0, 700], [0, 0, 0], [30, 0, 0]]);
    const [alpha] = s.cs as [Client];
    const mine = s.place(2, 'Claymore', [-5, 0.1, 0], [-1, 0, 0]);  // BRAVO's, facing away from CHARLIE
    s.move(2, [0, 0, -300]);
    s.room.player(3)!.sim.walker.place(27, 20, 0); s.run(0.5);
    s.send(3, 'Claymore', [35, 0.1, 0], [1, 0, 0]);                  // CHARLIE's, facing away from BRAVO
    const theirs = s.flying().at(-1)!.pid;
    expect(theirs).not.toBe(mine);
    s.move(3, [30, 0, -300]);
    s.send(3, 'Detonator', s.eye(3), [0, 0, 0]);
    const off = s.watch(1);
    expect(s.detonates(alpha, mine)).toEqual([{ type: 'detonate', pid: mine, by: 3 }]);
    expect(off.get(mine)! - off.get(theirs)!).toBeGreaterThanOrEqual(2);  // a frame after CHARLIE's: the chain
  });
});
