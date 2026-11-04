import { describe, expect, it } from 'vitest';
import {
  AN_M8, CLAYMORE, DEFAULT_RIFLE, HELD_SIDEARM, M67, arsenalOf, type CollisionOwner, type EffectProgram, type GridParams, type Loadout,
  type SpawnSlot, type ThrowableRecord, type WorldPoly,
} from '@s2u/scene';
import {
  Button, encodeCommands, EYE_HEIGHT, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type ClientEvent, type Command, type MapMeta,
  type ServerEvent, type SimKits, type SimMap,
} from '../../viewer/src/sim';
import { JOIN_STATE_VERSION, type JoinWire } from '../../viewer/src/net/protocol';
import { DEPARTED_OWNER_FF_READING, Room, type Conn } from '../src/room';
import { PROJECTILE_ID_READING, SMOKE_PHASE_ON_WIRE_READING } from '../src/joinState';

/**
 * PF-28 (ruling PF.R47; web research 231, 195 s4-s6, 198 s4.4): a page joining mid-round is told what the event stream
 * cannot rebuild for it -- the live projectiles and charges with their stable `pid`, the standing result with the tick it
 * was sent at, the corpses with their clip and age -- in one versioned envelope (`Room.joinWire`, the welcome's `join`),
 * and nothing is replayed to it. The original sends every owned object whole to a new client (`FUN_0061ba10`
 * D:L527450-527468) but replicates no fuse age nor death time: the ages here are the room's clock.
 *
 * The welcome's `join` member is `Room.joinWire()` at the hello's tick (the one line in `hello`'s welcome literal, wave 4,
 * research 231 s4.3; pinned on the first case); these tests read the envelope from the room at the joiner's hello.
 *
 * The synthetic floor and the `Client` capture of `roomLoadBarrier.test.ts`; the kit table and the C4 barrier of
 * `roomEquipment.test.ts` (copied, not imported).
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};
const BARRIER = 'worldmodel/access1/good_parts/di_good';

/** The flat floor with a C4 target across z 330 (x -40..40): Vigilance's access barrier in miniature (roomEquipment's). */
function world(): SimMap {
  const wall: WorldPoly = { ...FLOOR, path: BARRIER, ditype: 2, points: Float32Array.from([-40, 0, 330, 40, 0, 330, 40, 60, 330, -40, 60, 330]) };
  const polys = [FLOOR, wall];
  const owners: CollisionOwner[] = polys.map((q, i) => (q.path === BARRIER
    ? { modelName: 'worldmodel', path: BARRIER, first: i, count: 1, flags: 0x1001 }
    : { modelName: 'worldmodel', path: `${q.path}0`, first: i, count: 1 }));
  const ground = packGround(PARAMS, polys, owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  const respawns = [0, 1].flatMap((i) => [slot(0, i, -600, -500 + i * 500), slot(1, i, 600, -500 + i * 500)]);
  const paths = ['worldmodel/access1', 'worldmodel/access1/good_parts', BARRIER];
  const instances = paths.map((path, id) => ({ id, path, node: path.split('/').pop()!, modelName: 'worldmodel', root: path }));
  const access: EffectProgram = {
    name: 'access1', root: 1, flags: 0x2b, nodes: ['NA', 'access1', 'di_good'],
    sequences: [{ name: 'NA', activation: 1, ops: [{ op: 'executeAction', anim: 'set_access1' }] }],
  };
  const meta: MapMeta = {
    stem: 'MP99', instances, instanceByPath: new Map(instances.map((i) => [i.path, i.id])), diagnostics: [], actions: [],
    initial: [{ path: BARRIER, deactivate: false, saveActive: true, saveTransform: false, saveParent: false }],
    scene: {
      programs: [],
      destructibles: [{
        id: 0, key: 'access1#0@worldmodel/access1', anim: 'access1', instance: 0, root: 'worldmodel/access1', targetPath: BARRIER,
        health: 1, armor: 0, shield: 17, program: access, nodes: [null, 'worldmodel/access1', BARRIER],
      }],
    },
  };
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns, notes: [], meta };
}

const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
/** PF-35: with the bit the disc's `C4 Ammo` carries (`IgnoreExplosionDI`, `throwableRecord`; `projectile.test.ts`). */
const C4 = { ...CLAYMORE, name: 'C4', id: 151, fuse: 6, removal: 0.1, explosionDamage: 18, explosionRadius: 50, ignoreExplosionDI: true } satisfies ThrowableRecord;
const item = (name: string, id: number): unknown[] => ['InternalName', [name], 'ID', [String(id)], 'Ammo_Capacity', ['1'], 'NumMags', ['1'], 'AMMO_TYPES', [[]]];
const arsenal = arsenalOf(['ZAMMO', [], 'ZWEAPON', [
  item('C4', 151), item('Claymore', 153), item('M67', 121), item('AN-M8', 122), item('Detonator', 193),
] as never]);
/** The Terrorist's kit: an M67, an AN-M8 and a claymore; the SEAL's: an M67, a claymore and C4. */
const TERRORIST = kit(62, 15, 121, 122, 153), SEAL = kit(62, 15, 121, 153, 151);
function kits(): SimKits {
  return {
    table: {
      arsenal, records: new Map([DEFAULT_RIFLE, HELD_SIDEARM].map((x) => [x.id, x])), rounds: new Map(),
      throwables: new Map([M67, AN_M8, CLAYMORE, C4].map((x) => [x.id, { record: x, piercing: x.id === 121 ? 4 : 0 }])),
    },
    map: {
      valves: new Map(), selectable: { seal: [], terrorist: [] },
      kits: { seal: [{ type: 'S', character: 's', loadout: SEAL }], terrorist: [{ type: 'T', character: 't', loadout: TERRORIST }] },
    },
  };
}

class Client implements Conn {
  events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* nothing */ }
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] { return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[]; }
}

type V3 = [number, number, number];
interface FlyingView { pid: number; owner: { id: number }; kind: string; g: { pos: V3; vel: V3; state: string; age: number; fuse: number; removal: number; bounces: number; dud: boolean; trigger?: boolean } }

function setup(opts: Partial<ConstructorParameters<typeof Room>[2]> = {}) {
  let now = 0, seed = 1;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const room = new Room(world(), null, { now: () => now, random, launchCountdownS: 0, ...opts }, null, kits());
  const join = (id: number, watch = false): Client => {
    const c = new Client();
    room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99', ...(watch ? { watch: true } : {}) }, `10.0.0.${id}`);
    return c;
  };
  const step = (n = 1): void => { for (let i = 0; i < n; i++) { now += 1000 / TICK_HZ; room.step(); } };
  const run = (seconds: number): void => step(Math.round(seconds * TICK_HZ));
  /** `seconds` of player `id`'s commands at rest (its own clock; a throw is decided at the command it names). */
  const drive = (id: number, seconds: number, buttons = 0): void => {
    for (let i = 0; i < Math.round(seconds * TICK_HZ); i++) {
      const p = room.player(id)!;
      const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons, stance: 0, weapon: 0 };
      room.binary(id, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
      step();
    }
  };
  const place = (id: number, at: V3): void => { room.player(id)!.sim.walker.place(at[0], at[1] + 20, at[2]); };
  const send = (id: number, kind: string, from: V3, velocity: V3, extra: object = {}): void =>
    room.text(id, { type: 'throw', seq: room.player(id)!.sim.seq, kind, from, velocity, ...extra } as ClientEvent);
  /** The page's drop at `id`'s feet from its eye: let go at rest (a toss at power 0, near enough). */
  const drop = (id: number, kind: string): void => {
    const st = room.player(id)!.sim.walker.state;
    send(id, kind, [st.x, st.y + 15.4, st.z], [0, 0, 0]);
  };
  const flying = (): FlyingView[] => (room as unknown as { flying: FlyingView[] }).flying;
  /** The envelope the joiner's welcome carries: `Room.joinWire()` at its hello's tick (the held line, research 231 s4.3). */
  const envelope = (): JoinWire => room.joinWire();
  return { room, join, step, run, drive, place, send, drop, flying, envelope };
}

/** A room of a Terrorist (1) and a SEAL (2) on the floor, each driven a little so its commands have frames. */
function twoSeated(opts: Partial<ConstructorParameters<typeof Room>[2]> = {}) {
  const s = setup(opts);
  const a = s.join(1), b = s.join(2);
  s.step();
  return { ...s, a, b };
}

describe('PF-28: the join envelope, one versioned member of the welcome (ruling PF.R47; research 231)', () => {
  it("a spectator joining while an M67 flies is welcomed with join.projectiles: the grenade's pid, kind, position, velocity, fuse left and age on the room's clock (JOIN_STATE_VERSION 1); every other page got the grenade event with the same pid (the room tells all but the thrower) (FUN_0061ba10 D:L527450-527468: the original sends every object whole)", () => {
    const s = twoSeated();
    s.place(1, [0, 0, 0]); s.place(2, [300, 0, 0]);
    s.drive(1, 0.5);
    s.drop(1, 'M67');
    const told = s.b.of('grenade');
    expect(told).toHaveLength(1);
    s.step(12);                                                   // 0.2 s: still falling from the hand (15.4 u)
    const f = s.flying()[0]!;
    expect(f.g.state).toBe('flight');
    const watcher = s.join(9, true);
    expect(watcher.of('welcome')[0]!.role).toBe('spectator');
    expect(watcher.of('welcome')[0]!.join).toEqual(s.room.joinWire());   // wave 4: hello's welcome sends it (research 231 s4.3)
    const w = s.envelope();
    expect(w.v).toBe(JOIN_STATE_VERSION);
    expect(w.v).toBe(1);
    expect(w.projectiles).toHaveLength(1);
    const p = w.projectiles[0]!;
    expect(p).toEqual({
      pid: f.pid, owner: 1, kind: 'M67', pos: f.g.pos, vel: f.g.vel, state: 'flight',
      age: f.g.age * TICK_HZ, fuse: f.g.fuse * TICK_HZ, removal: f.g.removal * TICK_HZ, bounces: 0, dud: false,
    });
    expect(p.age).toBeGreaterThan(0);
    expect(p.fuse).toBeLessThan(M67.fuse * TICK_HZ);
    // The others' page (and every page after) names the same projectile by the same pid.
    expect(told[0]!.pid).toBe(p.pid);
  });

  it("a claymore set down and a C4 placed are in join.projectiles at rest with their facing and owner id; a joiner's Detonator of another's charge is refused as today", () => {
    const s = twoSeated();
    s.place(1, [-300, 0, 0]); s.place(2, [0, 0, 300]);
    s.run(0.5);
    s.send(2, 'Claymore', [8, 0.1, 300], [1, 0, 0]);
    s.send(2, 'C4', [0, 0.1, 302], [0, 0, 1], { target: 0, surface: { path: BARRIER, point: [0, 12, 330] } });
    const told = s.a.of('grenade');
    expect(told.map((g) => g.kind)).toEqual(['Claymore', 'C4']);
    s.run(0.5);                                                   // C4's Timer1 (6 s) running
    const joiner = s.join(3);                                     // a player: the Terrorists' (the join rule), a claymore in his kit
    void joiner;
    const w = s.envelope();
    const byKind = new Map(w.projectiles.map((p) => [p.kind, p]));
    expect(byKind.get('Claymore')).toMatchObject({ owner: 2, state: 'rest', pos: [8, 0.1, 300], facing: [1, 0, 0], pid: told[0]!.pid });
    // C4-PLACE: the validated wall hit, not the submitted hand-ground point, is hydrated for late joiners.
    expect(byKind.get('C4')).toMatchObject({ owner: 2, state: 'rest', pos: [0, 12, 330], facing: [0, 0, 1], pid: told[1]!.pid });
    // C4's Timer1 runs from the placing, on the room's game frames (PF.R8): the room's own fuse left, in ticks.
    expect(byKind.get('C4')!.fuse).toBe(s.flying().find((f) => f.kind === 'C4')!.g.fuse * TICK_HZ);
    expect(byKind.get('C4')!.fuse).toBeLessThan(C4.fuse * TICK_HZ);
    // The joiner's Detonator sets off his own claymores only (CZKit_DetonateRemoteExplosives +0xac), as before PF-28.
    s.step();
    s.place(3, [0, 0, 280]);
    s.send(3, 'Detonator', [0, EYE_HEIGHT, 280], [0, 0, 0]);
    expect(s.a.of('grenade').at(-1)).toMatchObject({ id: 3, kind: 'Detonator' });
    expect(s.flying().filter((f) => f.g.trigger)).toEqual([]);
    expect(s.envelope().projectiles.map((p) => p.state)).toEqual(['rest', 'rest']);
  });

  it("an AN-M8 past its fuse stays in the room's flying list until its removal: a joiner's envelope carries it detonated with its age (SMOKE_PHASE_ON_WIRE_READING)", () => {
    expect(SMOKE_PHASE_ON_WIRE_READING).toBe('flying until removal');
    const s = twoSeated();
    s.place(1, [0, 0, 0]); s.place(2, [300, 0, 0]);
    s.drive(1, 0.5);
    s.drop(1, 'AN-M8');
    s.run(AN_M8.fuse + 2);                                        // 2 s of smoke
    const f = s.flying()[0]!;
    expect(f.g.state).toBe('detonated');
    s.join(9, true);
    const p = s.envelope().projectiles;
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ kind: 'AN-M8', state: 'detonated', age: f.g.age * TICK_HZ, removal: f.g.removal * TICK_HZ });
    // The smoke's phase is on the wire: seconds since the detonation (-fuse) and to the removal (Timer2 - Timer1 = 37 s).
    expect(-p[0]!.fuse / TICK_HZ).toBeGreaterThan(1.9);
    expect(-p[0]!.fuse / TICK_HZ + p[0]!.removal / TICK_HZ).toBeCloseTo(AN_M8.removal - AN_M8.fuse, 1);
    // Still there just before its Timer2 (40 s), gone after it.
    s.run(AN_M8.removal - AN_M8.fuse - 2 - 0.5);
    expect(s.envelope().projectiles.map((q) => q.state)).toEqual(['detonated']);
    s.run(1);
    expect(s.envelope().projectiles).toEqual([]);
  });

  it('a joiner in the over phase gets join.result: the roundOver\'s round, winner, wins, screens and stats with the tick it was sent (RESULT_CLOCK_READING); none in play; a new round clears it', () => {
    const s = twoSeated({ roundSeconds: 1 });
    expect(s.envelope().result).toBeUndefined();                  // in play
    let at = -1;
    for (let i = 0; i < 40 * TICK_HZ && at < 0; i++) { s.step(); if (s.a.of('roundOver').length) at = s.room.tick; }
    expect(at).toBeGreaterThan(0);
    const over = s.a.of('roundOver')[0]!;
    s.run(2);
    s.join(9, true);
    const { type: _type, ...payload } = over;
    void _type;
    expect(s.envelope().result).toEqual({ ...payload, at });
    // The next round (a new match: respawn is one round) clears it.
    for (let i = 0; i < 40 * TICK_HZ && s.a.of('roundStart').length === 0; i++) s.step();
    expect(s.a.of('roundStart')).toHaveLength(1);
    expect(s.envelope().result).toBeUndefined();
  });

  it('a joiner 5 s after a kill gets join.corpses with the victim\'s clip, cause and age in ticks; a ghost seated this round has no corpse entry; a respawn, an abandon and a new round clear the list', () => {
    // Respawn: an M67 at the Terrorist's own feet; 5 s on, a joiner; then the respawn.
    const r = twoSeated();
    r.place(1, [0, 0, 0]); r.place(2, [600, 0, 0]);
    r.drive(1, 0.5);
    r.drop(1, 'M67');
    let diedAt = -1;
    for (let i = 0; i < 4 * TICK_HZ && diedAt < 0; i++) { r.step(); if (r.a.of('kill').length) diedAt = r.room.tick; }
    const kill = r.a.of('kill')[0]!;
    expect(kill.victim).toBe(1);
    r.step(5 * TICK_HZ);
    r.join(9, true);
    expect(r.envelope().corpses).toEqual([{ id: 1, clip: kill.clip, cause: kill.cause, age: 5 * TICK_HZ }]);
    expect(r.envelope().ghosts).toEqual([]);
    r.run(5.5);                                                   // past the press (5 s) and the fade (10 s)
    r.drive(1, 0.1, Button.Action);
    expect(r.room.player(1)!.alive).toBe(true);
    expect(r.envelope().corpses).toEqual([]);

    // Classic: the Terrorist's suicide; a third seated in the round is a ghost, no corpse; the next round clears both.
    const c = twoSeated({ rules: 'classic' });
    c.place(1, [0, 0, 0]); c.place(2, [600, 0, 0]);
    c.drive(1, 0.5);
    c.drop(1, 'M67');
    c.run(4);
    expect(c.room.player(1)!.alive).toBe(false);
    const ghost = c.join(3);
    expect(ghost.of('welcome')[0]!.ghost).toBe(true);
    const w = c.envelope();
    expect(w.corpses.map((k) => k.id)).toEqual([1]);
    expect(w.ghosts).toEqual([3]);
    for (let i = 0; i < 60 * TICK_HZ && c.a.of('roundStart').length < 2; i++) c.step();
    expect(c.a.of('roundStart')).toHaveLength(2);
    expect(c.envelope()).toMatchObject({ corpses: [], ghosts: [] });
    // Round 2: the Terrorist down again; the SEALs leave: the side emptied abandons, and the list goes with it.
    c.place(1, [0, 0, 0]);
    c.drive(1, 0.5);
    c.drop(1, 'M67');
    c.run(4);
    expect(c.envelope().corpses.map((k) => k.id)).toEqual([1]);
    c.room.leave(2); c.room.leave(3);
    expect(c.a.of('abandoned')).toHaveLength(1);
    expect(c.envelope()).toMatchObject({ corpses: [], ghosts: [] });
  });

  it('the envelope replays nothing: the joiner\'s socket receives no kill, hurt, blast or roundOver for what it hydrates, only the welcome, the score and the events after', () => {
    const s = twoSeated({ roundSeconds: 1 });
    s.place(1, [0, 0, 0]); s.place(2, [600, 0, 0]);
    s.drive(1, 0.5);
    s.drop(1, 'M67');
    s.run(4);                                                     // the blast, the hurt, the kill: all told to the two
    expect(s.a.of('kill')).toHaveLength(1);
    expect(s.a.of('blast')).toHaveLength(1);
    for (let i = 0; i < 40 * TICK_HZ && s.a.of('roundOver').length === 0; i++) s.step();
    expect(s.a.of('roundOver')).toHaveLength(1);
    s.run(1);
    const joiner = s.join(9, true);
    const w = s.envelope();
    expect(w.result).toBeDefined();
    expect(w.corpses.map((k) => k.id)).toEqual([1]);
    expect(joiner.events.map((e) => e.type)).toEqual(['welcome', 'score', 'voiceFloor', 'voiceMembers']);   // SVC-20b-relay: its voice entry (W20.R6); AD-14 its channel's count
    s.run(1);
    const replayed = new Set(['kill', 'hurt', 'blast', 'roundOver', 'grenade', 'flinch', 'hurtVoice']);
    expect(joiner.events.filter((e) => replayed.has(e.type))).toEqual([]);
  });

  it('pids are per round generation and never reused within it (PROJECTILE_ID_READING); a departed owner\'s charge keeps its pid and owner id, and the friendly-fire gate still reads the owner live (DEPARTED_OWNER_FF_READING unchanged)', () => {
    expect(PROJECTILE_ID_READING).toBe('per round, never reused');
    expect(DEPARTED_OWNER_FF_READING).toBe('lands');
    const s = twoSeated({ roundSeconds: 2 });
    s.place(1, [0, 0, 0]); s.place(2, [0, 0, 300]);
    s.drive(1, 0.5);
    s.send(2, 'Claymore', [8, 0.1, 300], [1, 0, 0]);
    s.drop(1, 'M67');
    s.place(1, [-600, 0, 0]);                                     // the thrower walks off before the fuse
    s.run(3.5);                                                   // the M67 gone off and removed
    expect(s.flying().map((f) => f.kind)).toEqual(['Claymore']);
    s.drive(1, 1);
    s.drop(1, 'AN-M8');
    const pids = [...s.a.of('grenade'), ...s.b.of('grenade')].map((g) => g.pid).sort();
    expect(pids).toEqual([0, 1, 2]);                              // the removed M67's 1 is not given again
    // The SEAL leaves: his claymore stays down under his pid and id; the room's owner is the departed player, whom the
    // friendly-fire gate looks up live and does not find (PF-22, PF.R40).
    const claymore = s.flying().find((f) => f.kind === 'Claymore')!;
    s.room.leave(2);
    expect(s.room.player(2)).toBeUndefined();
    expect(s.envelope().projectiles.find((p) => p.kind === 'Claymore')).toMatchObject({ pid: claymore.pid, owner: 2 });
    expect(claymore.owner.id).toBe(2);
    // The next round: the air cleared, the serial from 0 again (the pages clear theirs on roundStart).
    const seen = s.a.of('roundStart').length;
    for (let i = 0; i < 60 * TICK_HZ && s.a.of('roundStart').length === seen; i++) s.step();
    expect(s.envelope().projectiles).toEqual([]);
    s.place(1, [0, 0, 0]);
    s.drive(1, 0.5);
    s.join(4);
    s.drop(1, 'M67');
    expect(s.flying().map((f) => f.pid)).toEqual([0]);
  });

  // PF-35 (research 235 §2; 194 §7's acceptance row "reset/rejoin of a live flagged projectile"; ruling PF.R55): the
  // joiner's copy of a resting C4 is the claymore's shape; the room's blast reads the bit off the record it flies.
  it("a joiner's envelope carries a resting C4 as any charge; its flag is the record's, not the wire's -- nothing new on the envelope", () => {
    const s = twoSeated();
    s.place(1, [-300, 0, 0]); s.place(2, [0, 0, 300]);
    s.run(0.5);
    s.send(2, 'Claymore', [8, 0.1, 300], [1, 0, 0]);
    s.send(2, 'C4', [0, 0.1, 302], [0, 0, 1], { target: 0, surface: { path: BARRIER, point: [0, 12, 330] } });
    s.run(0.5);
    s.join(3);
    const wire = new Map(s.envelope().projectiles.map((p) => [p.kind, Object.keys(p).sort()]));
    const flown = (s.flying().find((f) => f.kind === 'C4') as unknown as { g: { record: ThrowableRecord } } | undefined)?.g.record;
    expect({ c4: wire.get('C4'), flag: flown?.ignoreExplosionDI }).toEqual({ c4: wire.get('Claymore'), flag: true });
  });
});

/**
 * HX-1's fix round (the review of 288f2752, finding 2; research 237 s4): a joiner's welcome names a dead hostage with
 * its death as the join envelope names a corpse (research 231 s4: the clip and the age in room ticks since the kill),
 * so the joiner lays a corpse, never a standing hostage; a living one carries neither.
 */
describe('HX-1: a dead hostage in the welcome', () => {
  it("a joiner's welcome.hostages carries a dead hostage's deathClip and age in ticks (as JoinCorpseWire), a living one's neither", () => {
    const starts = [0, 1, 2].map((i) => ({
      name: `Hostage${i ? i + 1 : ''}`, character: `mp_fem${i + 1}`, loc: { map: 0, x: 0, z: 0 }, at: [0, 0, 200 + 100 * i] as [number, number, number], yaw: 0, team: 0xc0020000,
    }));
    let now = 0;
    const room = new Room({ ...world(), gameType: 4, escortees: starts }, null, { now: () => now, random: () => 0.5, launchCountdownS: 0, rules: 'classic' }, null, kits());
    const join = (id: number): Client => {
      const c = new Client();
      room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99' }, `10.0.0.${id}`);
      return c;
    };
    const step = (n: number): void => { for (let i = 0; i < n; i++) { now += 1000 / TICK_HZ; room.step(); } };
    join(1); join(2);
    step(2);
    const ext = room.extraction!;
    ext.killed(ext.hostages[1]!, { id: 1, team: 'terrorist' }, { weapon: 'M4A1', how: 'weapon', clip: 'teammate_die_back', cause: 5 });
    step(90);
    const listed = join(3).of('welcome')[0]!.hostages!;
    expect(listed[1]).toMatchObject({ id: 241, alive: false, deathClip: 'teammate_die_back', age: 90 });
    for (const i of [0, 2]) expect(['deathClip' in listed[i]!, 'age' in listed[i]!, listed[i]!.alive]).toEqual([false, false, true]);
  });
});
