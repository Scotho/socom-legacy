import { describe, expect, it } from 'vitest';
import {
  CLAYMORE, CLAYMORE_RULES, DEFAULT_RIFLE, GAME_FRAME_DT, HELD_RIFLE, HELD_SIDEARM, M67, arsenalOf, materialTable, segmentHits, type CollisionOwner, type EffectProgram, type GridParams, type Loadout,
  type SpawnSlot, type ThrowableRecord, type WorldPoly,
} from '@s2u/scene';
import {
  BodyFlag, Button, centreClaim, encodeCommands, EYE_HEIGHT, launcherRaiseSeconds, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type ClientEvent, type Command, type MapMeta, type ServerEvent, type SimKits, type SimMap,
} from '../../viewer/src/sim';
import { MAX_PITCH_RATE } from '../../viewer/src/look';
import { climbOffered, Traversal } from '../../viewer/src/traversal';
import { wadingDepth } from '../../viewer/src/equipment';
import { GrenadeThrower, type GrenadeSource } from '../../viewer/src/grenade';
import { moverSnapshot } from '../../viewer/src/mover';
import { NetClient, type NetWalk } from '../../viewer/src/net/client';
import { LOOPBACK_STALL_MS_ADAPTATION, LoopbackMatch } from '../../viewer/src/net/loopback';
import { WorldState } from '../../viewer/src/worldState';
import { RECONNECT_HELD_LAUNCHER_ADAPTATION, Room, throwAimFloor, type Conn } from '../src/room';
import { JOIN_ORPHAN_OWNER } from '../src/joinState';
import { Hud } from '../../viewer/src/hud';
import { NetPage, type NetPageDeps } from '../../viewer/src/netPage';
import type { WebSocketLike } from '../../viewer/src/net/client';
import type { RemotePlayers } from '../../viewer/src/remotePlayers';
import type { PlaySnapshot, WalkMode } from '../../viewer/src/walk';
import { simSkeletonsFromBytes } from '../../viewer/src/simMap';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';

/**
 * The equipment in the match (web sprint 4, M7; research 94 §C4-§C5, research 85 §9): the room flies the rockets and
 * deals both their blasts, sets the placed charges down and off -- the claymore by its Detonator, the PMN by an actor
 * once armed, C4 at its timer on a C4 target only -- and takes the pouch from the loadout. On a synthetic floor and a
 * hand-built kit table, as `roomBlast.test.ts`.
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, 1000, 1000, 0, 1000, 1000, 0, -1000, -1000, 0, -1000]),   // its front UP (the grenade query is one-sided)
};
/** A level slab at height `y` over x0..x1, z0..z1: a ledge, a platform; `material` its byte (the floor's by default). */
const slab = (y: number, x0: number, x1: number, z0: number, z1: number, material = FLOOR.material): WorldPoly =>
  ({ ...FLOOR, material, path: `worldmodel/slab${y}`, points: Float32Array.from([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0]) });
/** `WATER`'s material byte: SOILS entry 9 after the two built-ins (`@s2u/scene` `materialTable`), LIQUID. */
const WATER_BYTE = 11;
/**
 * The flat map and a wall across x = 600 (the rockets' stop); no C4 target (SUP-03: C4's targets are the scene's
 * destructibles, `barrierMap`). `slabs`: two more, far from
 * the rest -- a ledge 4 up (x -800..-700, z 500..600) and a platform 15 up (x -800..-700, z 700..800). `extra`: more.
 * `floor`: false leaves the floor out (AD-4's case with nothing under the hand; `extra` lays its own).
 */
function map(slabs = false, extra: readonly WorldPoly[] = [], floor = true): SimMap {
  const polys: WorldPoly[] = [...(floor ? [FLOOR] : []), { ...FLOOR, path: 'worldmodel/wall', ditype: 2, points: Float32Array.from([600, 0, -400, 600, 0, 400, 600, 200, 400, 600, 200, -400]) }];
  if (slabs) polys.push(slab(4, -800, -700, 500, 600), slab(15, -800, -700, 700, 800));
  polys.push(...extra);
  const owners: CollisionOwner[] = polys.map((q, i) => ({ modelName: 'worldmodel', path: `${q.path}0`, first: i, count: 1 }));
  const ground = packGround(PARAMS, polys, owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  return {
    stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [],
  };
}

/**
 * MAP-06 (research 209 s13): `map()` with Vigilance's access barrier in miniature across z 330 (x -40..40, 60 high) --
 * `access1`'s block health 1, shield 17 on `di_good`, its sequence `EXECUTE_ACTION set_access1`; the type-less action
 * `access_action1` (at z 300) on that valve runs `destroy_access1`, which turns the wall off. SUP-03: the barrier is
 * C4's target (PF-13: the page names it and the struck point, `throw.target`/`throw.surface`; the room checks it takes
 * the charge, within the hip gate (|point - hip|^2 < 396, LATER 1139), the line from the head clear, the surface not
 * `INVISIBLE_DI`). `material`: the wall's byte (the floor's, METAL_THICK; 3 is INVISIBLE_DI); `extra`: more polygons;
 * `height`: the wall's (AD-5: 24 where a blast must open it -- Vigilance's barriers stand 20.8-30.7 high, `access1`
 * 22.7, and a blast is measured to the target's midpoint, FUN_00273a50 D:L120968-120978); `health`: the block's.
 */
const BARRIER = 'worldmodel/access1/good_parts/di_good';
function barrierMap(shield = 17, material = FLOOR.material, extra: readonly WorldPoly[] = [], height = 60, health = 1): SimMap {
  const h = height;
  const wall: WorldPoly = { ...FLOOR, path: BARRIER, ditype: 2, material, points: Float32Array.from([-40, 0, 330, 40, 0, 330, 40, h, 330, -40, h, 330]) };
  const base = map(false, [wall, ...extra]);
  // `map()` names each owner after its polygon with a 0; the barrier's owner is its node.
  const owners = base.ground.owners.map((o) => (o.path === `${BARRIER}0` ? { ...o, path: BARRIER, flags: 0x1001 } : o));
  const ground = { ...base.ground, owners };
  const paths = ['worldmodel/access1', 'worldmodel/access1/good_parts', BARRIER, 'worldmodel/access1/access_action1'];
  const instances = paths.map((path, id) => ({ id, path, node: path.split('/').pop()!, modelName: 'worldmodel', root: path }));
  const destroy: EffectProgram = {
    name: 'destroy_access1', root: 1, flags: 0x22, nodes: ['NA', 'access1', 'di_good'],
    sequences: [{ name: 'NA', activation: 1, ops: [
      { op: 'if', conditions: [{ kind: 'valve', valve: 'NA', operation: 2, operand: 0, context: true }] },
      { op: 'active', node: 2, on: false },
      { op: 'valve', valve: 'NA', operation: 0x0b, operand: 1, context: true },
      { op: 'endif' },
    ] }],
  };
  const access: EffectProgram = {
    name: 'access1', root: 1, flags: 0x2b, nodes: ['NA', 'access1', 'di_good'],
    sequences: [{ name: 'NA', activation: 1, ops: [{ op: 'executeAction', anim: 'set_access1' }] }],
  };
  const meta: MapMeta = {
    stem: 'MP99', instances, instanceByPath: new Map(instances.map((i) => [i.path, i.id])), diagnostics: [],
    actions: [{
      node: 'access_action1', path: 'worldmodel/access1/access_action1', at: [0, 0, 300], type: '', typeCode: 8, valve: 'set_access1',
      anims: ['destroy_access1'], team: null, range: 32, elevation: -1, points: 2, bitmap: '',
    }],
    initial: [{ path: BARRIER, deactivate: false, saveActive: true, saveTransform: false, saveParent: false }],
    scene: {
      programs: [{ program: destroy, search: [0, 0, 1] }],
      destructibles: [{
        id: 0, key: 'access1#0@worldmodel/access1', anim: 'access1', instance: 0, root: 'worldmodel/access1', targetPath: BARRIER,
        health, armor: 0, shield, program: access, nodes: [null, 'worldmodel/access1', BARRIER],
      }],
    },
  };
  return { ...base, ground, grid: groundGrid(ground), meta };
}

const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
/** The records as `kitTableOf` reads them off the disc (research 94 §C11); the room reads them by id. */
const round = (over: Partial<ThrowableRecord>): ThrowableRecord => ({ ...M67, ...over });
const HEAT = round({ name: 'LAW HEAT', id: 185, muzzleVelocity: 200, acceleration: 980, armingDistance: 100, impact: true, hasBackblast: true, fuse: 20, removal: 20.1, capacity: 1, explosionDamage: 20, explosionRadius: 150, impactDamage: 20, effectiveRange: 3500, maximumRange: 100000 });
const RPG = round({ ...HEAT, name: 'RPG', id: 186, muzzleVelocity: 400 });
/** The LAW HEAT's `Damage_Modifier` (the disc's is absent: 0), set by a test. */
const HEAT_MOD = { value: 0 };
Object.defineProperty(HEAT, 'damageModifier', { get: () => HEAT_MOD.value, enumerable: true });
/** The LAW HEAT's `Maximum_Range` as built above (100000), captured before a test sets it shorter; restored to it. */
const HEAT_REACH_BUILT = HEAT.maximumRange;
const HEAT_REACH = { value: HEAT_REACH_BUILT };
Object.defineProperty(HEAT, 'maximumRange', { get: () => HEAT_REACH.value, enumerable: true });
const BACKBLAST = round({ name: 'Backblast', id: 159, muzzleVelocity: 0, fuse: 0, removal: 0.1, capacity: 1, explosionDamage: 6, explosionRadius: 70 });
const PMN = round({ ...CLAYMORE, name: 'PMN Mine', id: 158, fuse: 8, removal: 10, explosionDamage: 6.5, explosionRadius: 40, proximity: 10 });
// WM-29 (the controller's ruling (a), 2026-11-15): the disc's own C4 -- its round, `C4 Ammo`, carries IgnoreExplosionDI in
// every file that holds it (`scene/test/c4IgnoreExplosionDIDisc.test.ts`, dev-disc; `projectile.test.ts` on the committed
// copy), so its blast asks no line. Was unflagged: a round the disc does not have, set exactly on its target's face
// (the pin of that case: `roomBlast.test.ts`, BLAST_ON_FACE_START_READING).
const C4 = round({ ...CLAYMORE, name: 'C4', id: 151, fuse: 6, removal: 0.1, explosionDamage: 18, explosionRadius: 50, ignoreExplosionDI: true });
const item = (name: string, id: number, extra: unknown[] = []): unknown[] => ['InternalName', [name], 'ID', [String(id)], 'Ammo_Capacity', ['1'], 'NumMags', ['1'], 'AMMO_TYPES', [[]], ...extra];
const arsenal = arsenalOf(['ZAMMO', [], 'ZWEAPON', [
  item('LAW', 145, ['SlotCost', ['2']]), item('LAW HEAT', 185), item('RPG LAUNCHER', 146, ['SlotCost', ['2']]), item('RPG', 186),
  item('C4', 151), item('Claymore', 153), item('PMN Mine', 158), item('Backblast', 159), item('M67', 121), item('Detonator', 193),
] as never]);
function kits(terrorist: Loadout, seal: Loadout): SimKits {
  const r = (x: ThrowableRecord) => ({ record: x, piercing: 0, fireWait: 3, reloadAfterShot: true, reloadDelayAfterShot: 1, icon: null });
  return {
    table: {
      arsenal, records: new Map([DEFAULT_RIFLE, HELD_SIDEARM].map((x) => [x.id, x])),
      rounds: new Map([[185, r(HEAT)], [186, r(RPG)]]),
      throwables: new Map([M67, CLAYMORE, PMN, C4, BACKBLAST].map((x) => [x.id, { record: x, piercing: x.id === 121 ? 4 : 0 }])),
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

type V3 = [number, number, number];
/** A page's session token (the hello's `session`, S2 round 4): one a tab; the same token is the same page's. */
const tok = (tab: number | string): string => `tab${tab}`.padEnd(22, '_');
/** Player 1 (a Terrorist) and player 2 (a SEAL) on the floor at `t` and `s`, each with its side's kit. */
function setup(terrorist: Loadout, seal: Loadout, t: V3, s: V3, world: SimMap = map(), opts: { combatReport?: boolean } = {}) {
  let seed = 1;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const room = new Room(world, null, { now: () => 0, random, ...opts }, null, kits(terrorist, seal));
  const join = (id: number): Client => {
    const c = new Client();
    room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99', session: tok(id) }, `10.0.0.${id}`);
    return c;
  };
  const a = join(1), b = join(2);
  room.step();
  room.player(1)!.sim.walker.place(t[0], t[1] + 20, t[2]);
  room.player(2)!.sim.walker.place(s[0], s[1] + 20, s[2]);
  for (let i = 0; i < 30; i++) room.step();
  const eye = (id: number): V3 => { const w = room.player(id)!.sim.walker.state; return [w.x, w.y + EYE_HEIGHT, w.z]; };
  const feet = (id: number): V3 => { const w = room.player(id)!.sim.walker.state; return [w.x, w.y, w.z]; };
  const send = (id: number, kind: string, from: V3, velocity: V3): void => room.text(id, { type: 'throw', seq: room.player(id)!.sim.seq, kind, from, velocity });
  /** PF-13: the page's C4 plant -- the charge at `from`, facing `velocity`, naming the destructible and the struck point. */
  const plant = (id: number, from: V3, velocity: V3, target: unknown, surface: unknown): void =>
    room.text(id, { type: 'throw', seq: room.player(id)!.sim.seq, kind: 'C4', from, velocity, target, surface } as unknown as ClientEvent);
  const run = (seconds: number): void => { for (let i = 0; i < Math.round(seconds * TICK_HZ); i++) room.step(); };
  /** `seconds` of player `id`'s commands, standing still: its own clock (`Player.ran`), which the kit's rate counts on. */
  const drive = (id: number, seconds: number): void => {
    for (let i = 0; i < Math.round(seconds * TICK_HZ); i++) {
      const p = room.player(id)!;
      const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
      room.binary(id, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
      room.step();
    }
  };
  /** The page's `fire` of the firearm in hand at the last command run, down the cone's centre (as room.test's `gunner`). */
  const shoot = (id: number): void => {
    const p = room.player(id)!, seq = p.sim.seq, f = p.cone.frame(seq)!;
    const c = centreClaim(f, [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]], 200);
    room.text(id, { type: 'fire', seq, from: c.from, dir: c.dir, eye: c.eye, aim: c.aim, weapon: 0, viewTick: room.tick });
  };
  /** The launcher raised (`true`) or the firearm back (`false`): the page's `throw` of the item now in the hand. */
  const hold = (id: number, name: string): void => send(id, name, eye(id), [0, 0, 0]);
  return { room, a, b, eye, feet, send, plant, run, drive, shoot, hold };
}

describe('MLS-EQ: authoritative equipment slots (research 361)', () => {
  const DUPLICATES = kit(62, 15, 121, 121, 255);

  it('refuses a supplied slot whose trusted kit item is not the requested throwable', () => {
    const s = setup(DUPLICATES, DUPLICATES, [0, 0, 700], [0, 0, 0]);
    const p = s.room.player(2)!;
    s.drive(2, 0.5);
    expect(p.grenades.M67).toBe(6);
    s.room.text(2, { type: 'throw', seq: p.sim.seq, kind: 'M67', slot: 4, from: s.eye(2), velocity: [0, 0, 0] } as ClientEvent);
    expect(p.grenades.M67).toBe(6);
    expect(s.a.of('grenade')).toHaveLength(0);
  });

  it('spends only the requested duplicate and refuses it when empty while another full stack remains', () => {
    const s = setup(DUPLICATES, DUPLICATES, [0, 0, 700], [0, 0, 0]);
    const p = s.room.player(2)!;
    s.drive(2, 0.5);
    const toss = (slot?: number) => s.room.text(2, {
      type: 'throw', seq: p.sim.seq, kind: 'M67', ...(slot === undefined ? {} : { slot }), from: s.eye(2), velocity: [0, 0, 0],
    } as ClientEvent);
    for (let n = 0; n < 3; n++) { toss(3); s.drive(2, 0.8); }
    expect(p.grenades.M67).toBe(3);
    const before = s.a.of('grenade').length;
    toss(3);
    expect(p.grenades.M67).toBe(3);
    expect(s.a.of('grenade')).toHaveLength(before);
    toss();
    expect(p.grenades.M67).toBe(2);
    expect(s.a.of('grenade')).toHaveLength(before + 1);
  });

  it.each([-1, 1, 5, 2.5, null, '3', Number.NaN])('rejects malformed slot metadata %s without spending ammunition', slot => {
    const s = setup(DUPLICATES, DUPLICATES, [0, 0, 700], [0, 0, 0]);
    const p = s.room.player(2)!;
    s.drive(2, 0.5);
    s.room.text(2, { type: 'throw', seq: p.sim.seq, kind: 'M67', slot, from: s.eye(2), velocity: [0, 0, 0] } as unknown as ClientEvent);
    expect(p.grenades.M67).toBe(6);
    expect(s.a.of('grenade')).toHaveLength(0);
  });

  it('validates throw-start slot identity and spends that pending duplicate at death, once', () => {
    const s = setup(DUPLICATES, DUPLICATES, [0, 0, 700], [0, 0, 0]);
    const p = s.room.player(2)!;
    const pending = p as unknown as { throwStart: { slot?: number } | null; throwHoldSeq: number };
    s.drive(2, 0.5);
    s.room.text(2, { type: 'throwStart', seq: p.sim.seq, kind: 'M67', slot: 4 });
    expect(pending.throwStart).toBeNull();
    s.room.text(2, { type: 'throwStart', seq: p.sim.seq, kind: 'M67', slot: 3 });
    expect(pending.throwStart?.slot).toBe(3);
    // The existing roomThrowInterrupt suite exercises real clip/death timing; here its recorded clip isolates slot identity.
    pending.throwHoldSeq = p.sim.seq;
    s.room['kill'](p as never, null, null, 'suicide', 0);
    expect(p.equipmentSlots.magazine(2)?.rounds).toBe(3);
    expect(p.equipmentSlots.magazine(3)?.rounds).toBe(2);
    expect(s.a.of('grenade')).toHaveLength(1);
    s.room['deathDrop'](p as never);
    expect(s.a.of('grenade')).toHaveLength(1);
    s.room['spawn'](p as never, 'respawn');
    expect(p.grenades.M67).toBe(6);
    expect(p.equipmentSlots.state().map(r => r.rounds[0])).toEqual([3, 3]);
  });

  it('refuses an echoed throw-start that names a different duplicate at release', () => {
    const s = setup(DUPLICATES, DUPLICATES, [0, 0, 700], [0, 0, 0]);
    const p = s.room.player(2)!;
    s.drive(2, 0.5);
    s.room.text(2, { type: 'throwStart', seq: p.sim.seq, kind: 'M67', slot: 3 });
    s.room.text(2, { type: 'throw', seq: p.sim.seq, kind: 'M67', slot: 2, start: p.sim.seq, from: s.eye(2), velocity: [0, 0, 0] });
    expect(p.grenades.M67).toBe(6);
    expect(s.a.of('grenade')).toHaveLength(0);
  });

  it('a placed charge spends the selected duplicate slot alone', () => {
    const charges = kit(62, 15, 153, 153, 255);
    const s = setup(DUPLICATES, charges, [0, 0, 700], [0, 0, 0]);
    const p = s.room.player(2)!;
    s.drive(2, 0.5);
    s.room.text(2, { type: 'throw', seq: p.sim.seq, kind: 'Claymore', slot: 3, from: [0, 0.1, 0], velocity: [1, 0, 0] });
    expect(p.equipmentSlots.magazine(2)?.rounds).toBe(4);
    expect(p.equipmentSlots.magazine(3)?.rounds).toBe(3);
    expect(p.grenades.Claymore).toBe(7);
    expect(s.a.of('grenade')).toHaveLength(1);
  });

  it('a reconnect carries exact duplicate states and the same derived pouch total without a refill', () => {
    const s = setup(DUPLICATES, DUPLICATES, [0, 0, 700], [0, 0, 0]);
    const p = s.room.player(2)!;
    s.drive(2, 0.5);
    s.room.text(2, { type: 'throw', seq: p.sim.seq, kind: 'M67', slot: 3, from: s.eye(2), velocity: [0, 0, 0] });
    (s.room as unknown as { accounts: Map<number, number | null> }).accounts.set(2, 102);
    const back = new Client();
    s.room.hello(3, back, { type: 'hello', version: PROTOCOL_VERSION, name: 'P2', map: 'MP99', session: tok(2) }, '', { account: 102 });
    const r = back.of('resume')[0]!;
    expect(r.pouch).toEqual({ M67: 5 });
    expect(r.equipmentSlots?.map(s => [s.slot, s.kind, s.rounds[0], s.current])).toEqual([[2, 'M67', 3, 0], [3, 'M67', 2, 0]]);
    expect(p.grenades.M67).toBe(5);
  });
});

describe('the rockets on the server (research 94 §C4, R94.6/R94.9)', () => {
  const LAW_KIT = kit(62, 15, 145, 185, 255);

  it('the LAW\'s rocket: taken as a throw of its round, flown straight at 980 u/s^2 with no fall, gone off at the wall, one shot', () => {
    const s = setup(kit(62, 15, 121, 126, 255), LAW_KIT, [560, 0, 0], [0, 0, 0]);
    s.hold(2, 'LAW'); s.drive(2, launcherRaiseSeconds(0) + 0.05);
    const from = s.eye(2);
    s.send(2, 'LAW HEAT', from, [200, 0, 0]);
    expect(s.a.of('grenade')).toEqual([expect.objectContaining({ id: 2, kind: 'LAW HEAT' })]);
    const r = s.room.player(2)!;
    expect(r.rounds.ring(185)!.rounds()).toBe(0);                          // the LAW HEAT one shot
    const f = (s.room as unknown as { flying: { g: { pos: V3; vel: V3; age: number } }[] }).flying.find((x) => x.g.vel[0] > 0)!;
    s.run(0.25);
    expect(f.g.pos[1]).toBeCloseTo(from[1], 6);                             // no fall
    // A quarter second of room ticks is 7 game frames (PF-04: the flight steps at GAME_FRAME_DT, research 208).
    expect(f.g.age).toBeCloseTo(7 * GAME_FRAME_DT, 12);
    expect(f.g.vel[0]).toBeCloseTo(200 + 980 * f.g.age, 6);                 // AccelerationFactor x10 along the flight
    s.run(1.5);
    expect(s.a.of('hurt').length).toBeGreaterThan(0);                       // 20 in 15 m at the wall, player 1 40 off it
    s.send(2, 'LAW HEAT', s.eye(2), [200, 0, 0]);
    expect(s.a.of('grenade')).toHaveLength(1);                              // none left
  });

  it('a direct hit: the body the rocket strikes takes its ImpactDamage x14 (GetDamage 0x3c7600, the bullet branch) -- a dud inside 10 m too', () => {
    // Player 1 six metres east: inside the arming distance, so no blast (FUN_003c8920 L319439-319462) -- yet the struck
    // body's hit (the node's `+0x94` handler, L319416-319418, before the arming test) takes 20 x 14 = 280: a kill.
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 145, 185, 255), [60, 0, 0], [0, 0, 0]);
    s.hold(2, 'LAW'); s.drive(2, launcherRaiseSeconds(0) + 0.05);
    const from = s.eye(2), at = s.feet(1);
    const d: V3 = [at[0] - from[0], at[1] + 10 - from[1], at[2] - from[2]], l = Math.hypot(...d);
    s.send(2, 'LAW HEAT', from, [d[0] / l * 200, d[1] / l * 200, d[2] / l * 200]);
    s.run(1);
    expect(s.a.of('blast')).toHaveLength(0);                                // a dud: no blast
    expect(s.a.of('hurt').length).toBeGreaterThan(0);
    expect(s.room.player(1)!.alive).toBe(false);
    expect(s.a.of('kill')[0]).toMatchObject({ victim: 1, weapon: 'LAW HEAT' });
  });

  // LATER 199: `FUN_005c0ae0` asks the playing motion's NoFire after the raise (`FUN_005a7de0` D:L476442), for the
  // launcher's class too: the room judges the frame of the command the round names (`AimFrame.fire`), as the firearm's.
  it("RED: LATER 199 -- a rocket at a command whose playing motion carries NoFire flies nothing and keeps its round", () => {
    const s = setup(kit(62, 15, 121, 126, 255), LAW_KIT, [560, 0, 0], [0, 0, 0]);
    s.hold(2, 'LAW'); s.drive(2, launcherRaiseSeconds(0) + 0.05);
    const p = s.room.player(2)!;
    const cone = p.cone as unknown as { frame(seq: number): { fire: boolean } | null };
    const frame = cone.frame.bind(cone);
    cone.frame = (seq: number) => { const f = frame(seq); return f ? { ...f, fire: false } : f; };
    s.send(2, 'LAW HEAT', s.eye(2), [200, 0, 0]);
    expect(s.a.of('grenade')).toEqual([]);                                  // today: the rocket flies
    expect(p.rounds.ring(185)!.rounds()).toBe(1);
    cone.frame = frame;
    s.send(2, 'LAW HEAT', s.eye(2), [200, 0, 0]);
    expect(s.a.of('grenade')).toHaveLength(1);
  });

  // LATER 503 (the network's bookkeeping): a rocket the room refuses in `launchRocket` after the page spent it -- here at a
  // NoFire command (LATER 199) -- is told to the page (`stale`, request 'throw', its seq), as `decide`'s stale bound and the
  // mount's refusal tell a throw, so the page gives its round back.
  it("RED: LATER 503 -- a rocket refused 'nofire' is told to the page (stale, request 'throw', its seq) and keeps its round", () => {
    const s = setup(kit(62, 15, 121, 126, 255), LAW_KIT, [560, 0, 0], [0, 0, 0]);
    s.hold(2, 'LAW'); s.drive(2, launcherRaiseSeconds(0) + 0.05);
    const p = s.room.player(2)!;
    const cone = p.cone as unknown as { frame(seq: number): { fire: boolean } | null };
    const frame = cone.frame.bind(cone);
    cone.frame = (seq: number) => { const f = frame(seq); return f ? { ...f, fire: false } : f; };
    const seq = p.sim.seq;
    s.send(2, 'LAW HEAT', s.eye(2), [200, 0, 0]);
    expect(s.a.of('grenade')).toEqual([]);
    expect(p.rounds.ring(185)!.rounds()).toBe(1);
    expect(s.b.of('stale')).toEqual([expect.objectContaining({ request: 'throw', seq })]);   // today: not told
  });

  // LATER 511 (2), the network's bookkeeping: `launchRocket`'s refusals an honest page can reach are told to the page
  // (`stale`, request 'throw', its seq) and tallied by why -- the hand, the raise's end, the wait, the start.
  const told511 = (setupHold: 'none' | 'raising' | 'ready', poke: (s: ReturnType<typeof setup>) => V3): { stale: boolean; drops: string[] } => {
      const s = setup(kit(62, 15, 121, 126, 255), LAW_KIT, [560, 0, 0], [0, 0, 0]);
      if (setupHold !== 'none') s.hold(2, 'LAW');
      s.drive(2, setupHold === 'ready' ? launcherRaiseSeconds(0) + 0.05 : 0.1);   // commands run: the rocket's frame there
      const p = s.room.player(2)!;
      const from = poke(s);
      s.room.takeDrops();
      const seq = p.sim.seq;
      s.send(2, 'LAW HEAT', from, [200, 0, 0]);
      expect(s.a.of('grenade')).toEqual([]);
      expect(p.rounds.ring(185)!.rounds()).toBe(1);
      return {
        stale: s.b.of('stale').some((e) => e.request === 'throw' && e.seq === seq),
        drops: Object.keys(s.room.takeDrops() ?? {}).filter((k) => k.startsWith('throw')),
      };
  };
  it("RED: LATER 511 (2) -- a rocket with no launcher in the hand is told stale and tallied 'hand'", () => {
    expect(told511('none', (s) => s.eye(2))).toEqual({ stale: true, drops: ['throw: hand'] });          // today: silent
  });
  it("RED: LATER 511 (2) -- a rocket named before the raise's end is told stale and tallied 'raise'", () => {
    expect(told511('raising', (s) => s.eye(2))).toEqual({ stale: true, drops: ['throw: raise'] });
  });
  it("RED: LATER 511 (2) -- a rocket inside the round's wait is told stale and tallied 'wait'", () => {
    expect(told511('ready', (s) => { (s.room.player(2)! as unknown as { rocketWaitUntil: number }).rocketWaitUntil = 1e9; return s.eye(2); }))
      .toEqual({ stale: true, drops: ['throw: wait'] });
  });
  it("RED: LATER 511 (2) -- a rocket started past the head's reach is told stale and tallied 'start far'", () => {
    expect(told511('ready', (s) => { const e = s.eye(2); return [e[0] + 80, e[1], e[2]]; })).toEqual({ stale: true, drops: ['throw: start far'] });
  });

  // LATER 501, reworked (review-later-501.md): the page sends its command batch, then the throw naming its last command,
  // and the room runs that command on its own tick -- so a rocket is judged once its command has run (`timed`, the hand
  // throw's path), with the NoFire check at that frame (LATER 199); one whose command never runs is dropped.
  it("RED: LATER 501 -- a rocket sent ahead of its command, as the page sends it, flies once the command runs", () => {
    const s = setup(kit(62, 15, 121, 126, 255), LAW_KIT, [560, 0, 0], [0, 0, 0]);
    s.hold(2, 'LAW'); s.drive(2, launcherRaiseSeconds(0) + 0.05);
    const p = s.room.player(2)!;
    s.room.takeDrops();
    s.room.text(2, { type: 'throw', seq: p.sim.seq + 1, kind: 'LAW HEAT', from: s.eye(2), velocity: [200, 0, 0] });
    expect(s.a.of('grenade')).toEqual([]);                                  // its command not run yet
    s.drive(2, 1 / TICK_HZ);                                                // the command runs: the rocket is judged
    expect(s.a.of('grenade')).toHaveLength(1);                              // today: dropped 'no frame'
    expect(p.rounds.ring(185)!.rounds()).toBe(0);
    expect(s.room.takeDrops() ?? {}).toEqual({});
  });

  // LATER 501's review F2: a rocket decided after later commands ran is judged on its own command's count (the raise
  // and the rocket's wait), not the room's present count (`p.ran`).
  it("RED: LATER 501 -- a rocket named before the raise is over, decided two commands later, flies nothing", () => {
    const s = setup(kit(62, 15, 121, 126, 255), LAW_KIT, [560, 0, 0], [0, 0, 0]);
    s.hold(2, 'LAW');
    const p = s.room.player(2)!;
    const P = p as unknown as { heldReadyAt: number; ran: number };
    while (P.ran < P.heldReadyAt - 2) s.drive(2, 1 / TICK_HZ);           // two commands short of the raise's end
    const named = p.sim.seq;
    expect(P.ran).toBeLessThan(P.heldReadyAt);
    s.drive(2, 2 / TICK_HZ);                                               // two more commands run: the raise is over now
    expect(P.ran).toBeGreaterThanOrEqual(P.heldReadyAt);
    s.room.takeDrops();
    s.room.text(2, { type: 'throw', seq: named, kind: 'LAW HEAT', from: s.eye(2), velocity: [200, 0, 0] });
    expect(s.a.of('grenade')).toEqual([]);                                  // today: it flies (judged on p.ran)
    expect(p.rounds.ring(185)!.rounds()).toBe(1);
  });

  it("LATER 501: a rocket whose command never runs flies nothing, keeps its round and is dropped", () => {
    const s = setup(kit(62, 15, 121, 126, 255), LAW_KIT, [560, 0, 0], [0, 0, 0]);
    s.hold(2, 'LAW'); s.drive(2, launcherRaiseSeconds(0) + 0.05);
    const p = s.room.player(2)!;
    s.room.takeDrops();
    s.room.text(2, { type: 'throw', seq: p.sim.seq + 1000, kind: 'LAW HEAT', from: s.eye(2), velocity: [200, 0, 0] });
    s.drive(2, 21);                                                         // 630 commands: past the queue's 600 ticks (PENDING_TICKS), short of seq + 1000
    expect(s.a.of('grenade')).toEqual([]);
    expect(p.rounds.ring(185)!.rounds()).toBe(1);
    expect(Object.keys(s.room.takeDrops() ?? {}).filter((k) => k.startsWith('throw'))).toEqual(['throw: its command never ran']);
  });

  // LATER 504 (reading, research 215 §8.5): the raise `FUN_005a6d30` calls `FUN_0058c350(actor, DAT_0044d408, 0x12, 1, 0)`
  // (D:L462105): the set's "Crouch" row `seal_launcher` at posture 1, the stance request crouch (D:L447957-447995); under
  // the set the stand state asks crouch every frame (`FUN_00586570` D:L444853-444855); either lower gives the set back
  // through `FUN_0058c4a0(actor, previous set, 0)` -- the "Stand" row at posture 0, the request 0 (still lower's end
  // `FUN_005a60d0(.., 4)` D:L461769-461771; the stick's D:L418268-418272).
  it("LATER 504: the room's mover kneels at the raise and stands at the lower's end, as the page's", () => {
    const s = setup(kit(62, 15, 121, 126, 255), LAW_KIT, [560, 0, 0], [0, 0, 0]);
    const w = s.room.player(2)!.sim.walker;
    s.drive(2, 0.2);
    expect(w.stance).toBe('stand');
    s.hold(2, 'LAW'); s.drive(2, launcherRaiseSeconds(0) - 0.1);
    expect(w.stance, 'R4P-247: the raise still on: standing').toBe('stand');
    s.drive(2, 0.2);
    expect(w.stance, 'the raise popped: crouched').toBe('crouch');
    s.hold(2, 'M4A1 SD'); s.drive(2, launcherRaiseSeconds(0) + 0.2);
    expect(w.stance, "the lower's end: standing").toBe('stand');
  });

  it('the rocket only from the launcher raised and past its raise; the rifle not while it is up, nor before it is down', () => {
    const s = setup(kit(62, 15, 121, 126, 255), LAW_KIT, [0, 0, 500], [0, 0, 0]);
    const fireRocket = (): void => s.send(2, 'LAW HEAT', s.eye(2), [200, 0, 0]);
    s.drive(2, 0.5);
    fireRocket();                                                           // the rifle in the hand: refused
    expect(s.a.of('grenade')).toHaveLength(0);
    s.hold(2, 'LAW');
    s.drive(2, 1 / TICK_HZ);                                                // NU-6 F1: the item is taken with its clip, on the event's seq + 1
    expect((s.room as unknown as { body(p: unknown): { weapon: number } }).body(s.room.player(2)).weapon).toBe(145);                               // the others draw the launcher
    s.drive(2, launcherRaiseSeconds(0) - 0.1);
    fireRocket();                                                           // mid-raise: refused
    expect(s.a.of('grenade')).toHaveLength(0);
    s.shoot(2); s.drive(2, 0.1);                                            // the rifle while the launcher is up: refused
    expect(s.a.of('shot')).toHaveLength(0);
    s.hold(2, 'M4A1 SD');                                                   // the firearm back ...
    s.drive(2, 1 / TICK_HZ);                                                // NU-6 F1: the item is taken with its clip, on the event's seq + 1
    s.shoot(2); s.drive(2, 0.05);                                           // ... not before its raise is over
    expect(s.a.of('shot')).toHaveLength(0);
    s.drive(2, launcherRaiseSeconds(0));
    s.shoot(2); s.drive(2, 0.05);
    expect(s.a.of('shot')).toHaveLength(1);
    s.drive(2, 0.5);
    fireRocket();                                                           // the launcher down again: refused
    expect(s.a.of('grenade')).toHaveLength(0);
  });

  // PF-21 (research 179 s11.15, research 217 s4; ruling PF.R45): the raise is `FUN_005a6d30`'s clip from the firearm in
  // hand -- `seal_rifle2launcher` (35 keys) from the rifle, `seal_pistol2launcher` (24) from the pistol, playback 1.5,
  // NoFire -- and the lower `FUN_005a6b70` the same clip reversed: 1.4155 s and 1.3776 s, on the player's own clock.
  it("the room holds the first rocket 1.4155 s after a raise from the rifle and 1.3776 s from the pistol; the firearm's first round the same after the lower", () => {
    for (const [from, seconds] of [[0, 1.4155], [1, 1.3776]] as const) {
      const s = setup(kit(62, 15, 121, 126, 255), LAW_KIT, [0, 0, 500], [0, 0, 0]);
      const p = s.room.player(2)!;
      /** `n` commands of player 2 standing still with the firearm `from` in hand (the pistol swapped to first). */
      let swapped = false;
      const step = (n: number): void => {
        for (let i = 0; i < n; i++) {
          const buttons = swapped ? 0 : Button.Swap;                       // the swap pressed once, the weapon held after
          swapped = true;
          const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons, stance: 0, weapon: from };
          s.room.binary(2, encodeCommands({ viewTick: s.room.tick, commands: [cmd] }));
          s.room.step();
        }
      };
      const rocket = (): void => s.send(2, 'LAW HEAT', s.eye(2), [200, 0, 0]);
      const round = (): void => {
        const seq = p.sim.seq, f = p.cone.frame(seq)!;
        const c = centreClaim(f, [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]], 200);
        s.room.text(2, { type: 'fire', seq, from: c.from, dir: c.dir, eye: c.eye, aim: c.aim, weapon: from, viewTick: s.room.tick });
      };
      step(Math.round(2 * TICK_HZ));                                         // the swap to the pistol played out
      expect(p.sim.weapon).toBe(from);
      const ticks = Math.round(seconds * TICK_HZ);
      s.hold(2, 'LAW');
      step(ticks - 1);
      rocket();                                                             // a tick short of the raise: refused
      expect(s.a.of('grenade'), `from ${from}`).toHaveLength(0);
      step(1);
      rocket();                                                             // the raise over: the first rocket
      expect(s.a.of('grenade'), `from ${from}`).toHaveLength(1);
      step(30);
      s.hold(2, p.records[from].name);                                      // the lower: the same clip reversed
      step(ticks - 2);
      round(); step(1);                                                     // decided once the next command ran
      expect(s.a.of('shot'), `from ${from}`).toHaveLength(0);
      step(1);
      round(); step(1);
      expect(s.a.of('shot'), `from ${from}`).toHaveLength(1);
    }
  });

  it('refuses raising a launcher the kit does not hold', () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 121, 185, 255), [0, 0, 500], [0, 0, 0]);
    s.hold(2, 'LAW');
    expect((s.room as unknown as { body(p: unknown): { weapon: number } }).body(s.room.player(2)).weapon).not.toBe(145);
  });

  it('a direct hit adds the round weapon\'s Damage_Modifier (L318741-318759), and nothing at or under the floor 0', () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 145, 185, 255), [60, 0, 0], [0, 0, 0]);
    HEAT_MOD.value = -20;                                                   // ImpactDamage 20 - 20 = 0: under the floor
    try {
      s.hold(2, 'LAW'); s.drive(2, launcherRaiseSeconds(0) + 0.05);
      const from = s.eye(2), at = s.feet(1);
      const d: V3 = [at[0] - from[0], at[1] + 10 - from[1], at[2] - from[2]], l = Math.hypot(...d);
      s.send(2, 'LAW HEAT', from, [d[0] / l * 200, d[1] / l * 200, d[2] / l * 200]);
      s.run(1);
      expect(s.a.of('grenade')).toHaveLength(1);
      expect(s.a.of('hurt')).toHaveLength(0);
      expect(s.room.player(1)!.alive).toBe(true);
    } finally { HEAT_MOD.value = 0; }
  });

  it('a non-lethal direct hit flinches the body for the others, as a bullet\'s does (FUN_005a54d0 L461397-461405; IMPACT_HIT_READING)', () => {
    // The owner, 2026-10-02: "Other players do not see a hit animation on somebody." The struck body's hit is read as a
    // bullet's (GetDamage's bullet branch; bullets reach FUN_005a54d0 as cause 5, L464731), not a blast's (cause 4,
    // FUN_005a0e70 L459285): it flinches when it lives.
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 145, 185, 255), [60, 0, 0], [0, 0, 0]);
    // (20 - 18) x 14 = 28 at the legs: 3 through their armour 25 (MP_ARMOUR, piercing 0) -- a hit, not a kill. Under the
    // armour (7) the health would not drop and the gate (L461397) rightly plays nothing.
    HEAT_MOD.value = -18;
    try {
      s.hold(2, 'LAW'); s.drive(2, launcherRaiseSeconds(0) + 0.05);
      const from = s.eye(2), at = s.feet(1);
      const d: V3 = [at[0] - from[0], at[1] + 10 - from[1], at[2] - from[2]], l = Math.hypot(...d);
      s.send(2, 'LAW HEAT', from, [d[0] / l * 200, d[1] / l * 200, d[2] / l * 200]);
      s.run(1);
      expect(s.a.of('hurt')).toHaveLength(1);
      expect(s.room.player(1)!.alive).toBe(true);
      expect(s.b.of('flinch')).toEqual([{ type: 'flinch', id: 1, clip: expect.stringMatching(/^seal_/) }]);
      expect(s.a.of('flinch')).toEqual(s.b.of('flinch'));                   // the victim's own page the same clip (MATCH-FIX-2)
    } finally { HEAT_MOD.value = 0; }
  });

  it.each([
    ['a kit with no LAW', kit(62, 15, 121, 185, 255), 'LAW HEAT', 200],
    ['the RPG\'s round from a LAW', LAW_KIT, 'RPG', 400],
    ['a rocket leaving faster than its Muzzle_Velocity', LAW_KIT, 'LAW HEAT', 400],
  ] as const)('refuses %s', (_what, loadout, kind, speed) => {
    const s = setup(kit(62, 15, 121, 126, 255), loadout, [560, 0, 0], [0, 0, 0]);
    s.hold(2, 'LAW'); s.drive(2, launcherRaiseSeconds(0) + 0.05);
    s.send(2, kind, s.eye(2), [speed, 0, 0]);
    expect(s.a.of('grenade')).toHaveLength(0);
  });

  // LATER 1365 (reading, pending review; research 84 s6): the round's FireWait x 1.2 (r0004 0x5c76f0, modes 4 and up) and,
  // for the RPG round alone, its 1 s lock on top (r0004 0x5cd330-0x5cd338, r0001 `FUN_005c5340` D:L479339-479342; the
  // lock's frames skip the wait's run-down, r0004 0x5c7d94-0x5c7e20): the room's `rocketWaitTicks`, 275 ticks (RPG) and
  // 215 (LAW). Was 179 for both: the unscaled 3 s, the RPG's lock inside it.
  it('the RPG-7 is fed one round at a time: FireWait x 1.2 and its 1 s lock between rockets (two RPG slots, two rockets)', () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 146, 186, 186), [0, 0, 500], [0, 0, 0]);
    s.hold(2, 'RPG LAUNCHER'); s.drive(2, launcherRaiseSeconds(0) + 0.05);
    s.send(2, 'RPG', s.eye(2), [400, 0, 0]);                                // east, at the wall: away from everyone
    s.drive(2, 1);
    s.send(2, 'RPG', s.eye(2), [400, 0, 0]);
    expect(s.a.of('grenade')).toHaveLength(1);
    s.drive(2, 3.5);                                                        // 4.5 s (270 ticks): inside 275
    s.send(2, 'RPG', s.eye(2), [400, 0, 0]);
    expect(s.a.of('grenade')).toHaveLength(1);
    s.drive(2, 0.15);                                                       // 4.65 s (279 ticks)
    s.send(2, 'RPG', s.eye(2), [400, 0, 0]);
    expect(s.a.of('grenade')).toHaveLength(2);
  });

  it('the LAW: FireWait x 1.2 between rockets, no lock on top (two LAW slots, two rockets)', () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 145, 185, 185), [0, 0, 500], [0, 0, 0]);
    s.hold(2, 'LAW'); s.drive(2, launcherRaiseSeconds(0) + 0.05);
    s.send(2, 'LAW HEAT', s.eye(2), [200, 0, 0]);                           // east, at the wall: away from everyone
    expect(s.a.of('grenade')).toHaveLength(1);
    s.drive(2, 3.5);                                                        // 3.5 s (210 ticks): inside 215
    s.send(2, 'LAW HEAT', s.eye(2), [200, 0, 0]);
    expect(s.a.of('grenade')).toHaveLength(1);
    s.drive(2, 0.15);                                                       // 3.65 s (219 ticks)
    s.send(2, 'LAW HEAT', s.eye(2), [200, 0, 0]);
    expect(s.a.of('grenade')).toHaveLength(2);
  });

  it.each([
    // where player 1 stands (the SEAL fires east from the origin, up the sky so the rocket's own blast reaches no one)
    ['behind the shooter, 3 m: the backblast hurts (6 in 7 m, 45 degrees)', [-30, 0, 0], true],
    ['beside the shooter, 3 m: outside its cone', [0, 0, 30], false],
    ['behind, 8 m: past its radius', [-80, 0, 0], false],
  ] as const)('%s', (_what, at, hurt) => {
    const s = setup(kit(62, 15, 121, 126, 255), LAW_KIT, at as unknown as V3, [0, 0, 0]);
    s.hold(2, 'LAW'); s.drive(2, launcherRaiseSeconds(0) + 0.05);
    s.send(2, 'LAW HEAT', s.eye(2), [200 * Math.cos(0.3), 200 * Math.sin(0.3), 0]);
    s.run(0.2);
    expect(s.a.of('blast').length > 0).toBe(hurt);
    expect(s.b.of('blast')).toHaveLength(0);                                // the shooter is under its cone, not in it
  });
});

describe('the placed charges on the server (research 94 §C5, research 85 §9.7)', () => {
  it('the claymore: set down by the throw of it, gone off only by its Detonator, its cone full in front and a 32nd behind', () => {
    // FRAG-COUNT (FUN_005a18b0 D:L459428-459431): past 30 u the count is the extra alone x 900/d^2, so player 1 stands 22 u
    // in front of the claymore (at 30) where its 8 + extra fragments land. Was at 150 (142 u off: the old count's 2-3
    // fragments there, the original's usually none) -- the case is the Detonator and the cone, not the reach.
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 121, 153, 255), [30, 0, 0], [0, 0, 0]);
    s.send(2, 'Claymore', [8, 0, 0], [1, 0, 0]);                         // facing east, at the SEAL's hand
    expect(s.a.of('grenade')).toEqual([expect.objectContaining({ id: 2, kind: 'Claymore' })]);
    expect(s.room.player(2)!.grenades.Claymore).toBe(3);
    s.run(30);
    expect(s.a.of('blast')).toHaveLength(0);                                // no fuse: Timer1 held (+0xc5)
    s.room.player(2)!.sim.walker.place(-100, 20, 0);                        // back off behind it, then fire the Detonator
    s.run(0.5);
    s.send(2, 'Detonator', s.eye(2), [0, 0, 0]);
    // The others hear the Detonator's fire (a `grenade` of it, from the SEAL's feet): their copies of the claymore go too.
    expect(s.a.of('grenade').at(-1)).toMatchObject({ id: 2, kind: 'Detonator', velocity: [0, 0, 0] });
    s.run(0.1);
    expect(s.a.of('blast')).toHaveLength(1);
    expect(s.a.of('hurt').length).toBeGreaterThan(0);                       // 16 in 25 m, player 1 in its cone
  });

  /**
   * The charge rests on the ground (2026-10-02, ported from Chris's browser-beta-v5, d578f347, his room's `placeCharge`;
   * research 85 §9.7.2): the page sets it on the highest surface at or under the hand no lower than the feet less
   * `placeDrop` (`FUN_005c2430`, `FUN_005be9a0` 476883-477015), so the room takes it only on a surface under the point
   * (`CHARGE_GROUND_SLACK_PLACEHOLDER`), not below the feet less `placeDrop`, not above the hand's reach -- a raised one
   * under the hand is the original's too (the challenge's correction of his feet+1 ceiling). Refused: nothing spent,
   * no one told.
   */
  it('a charge in the air is refused, nothing spent and no one told; one on the floor is set down', () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [0, 0, 0]);
    s.send(2, 'Claymore', [8, EYE_HEIGHT, 0], [1, 0, 0]);                  // at the eye, over open floor
    s.send(2, 'Claymore', [8, 5, 0], [1, 0, 0]);                            // a little up: no ground under it
    s.send(2, 'PMN Mine', [8, 3, 2], [1, 0, 0]);
    expect(s.a.of('grenade')).toHaveLength(0);
    expect(s.room.player(2)!.grenades).toEqual({ Claymore: 8, 'PMN Mine': 4 });
    s.send(2, 'Claymore', [8, 0, 0], [1, 0, 0]);                          // on the floor
    expect(s.a.of('grenade')).toHaveLength(1);
  });

  it('a charge on a ledge under the hand is set down; one past placeDrop below the feet is refused', () => {
    // SVC-23b: the body 13 short of the point (START_REACH_PLACEHOLDER: under the hand, not 25 out as before).
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [-750, 0, 492], map(true));
    s.send(2, 'Claymore', [-750, 4, 505], [0, 0, 1]);                     // the ledge 4 up, in reach
    expect(s.a.of('grenade')).toHaveLength(1);
    s.room.player(2)!.sim.walker.place(-705, 35, 750);                      // on the platform 15 up, by its edge
    s.run(0.5);
    expect(s.feet(2)[1]).toBeCloseTo(15, 0);
    s.send(2, 'Claymore', [-690, 0, 750], [1, 0, 0]);                     // the floor, 15 below the feet: past placeDrop
    expect(s.a.of('grenade')).toHaveLength(1);
    s.send(2, 'Claymore', [-712, 15, 750], [1, 0, 0]);                    // the platform itself
    expect(s.a.of('grenade')).toHaveLength(2);
  });

  it('PF-05 fix: a prone SEAL pressed to a wall sets a claymore on its side and none behind the wall (SVC-23b measure 5 (b))', () => {
    // The fresh review of PF-05: the prone eye 4.9 ahead (FUN_0029ae50) stands past a wall the body is nearer than 4.9,
    // so the room took a claymore behind the wall and refused one on the body's own side. The room tests the body's axis
    // to the head and keeps the head on the body's side (`startRefused`). PF-16: crawled straight in, the prone fan stops
    // the body 8.0 off; crawled in 60 degrees aslant it slides along the wall 8 x cos 60 = 4.0 off, and facing the wall
    // then its eye is 0.9 past the face.
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [580, 0, 0]);
    const yaw = -90;                                                         // facing +x: the wall at x 600 ahead
    const aslant = yaw + 60;                                                 // the crawl 60 degrees off the wall's normal
    s.room.player(2)!.sim.walker.state.yaw = aslant;
    const step = (over: Partial<Command>): void => {
      const p = s.room.player(2)!;
      const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: aslant, pitch: 0, turn: 0, buttons: 0, stance: 2, weapon: 0, ...over };
      s.room.binary(2, encodeCommands({ viewTick: s.room.tick, commands: [cmd] }));
      s.room.step();
    };
    step({ buttons: Button.Stance });
    for (let i = 0; i < 150; i++) step({});
    for (let i = 0; i < 300; i++) step({ forward: 1 });
    for (let i = 0; i < 30; i++) step({ yaw });                              // then turns to face the wall
    expect(s.room.player(2)!.sim.walker.posture).toBe('prone');
    // SEGMENT-BODY: the crawl stops where the prone side lines (3.12 across, 11.2 ahead, D:L415582-415621) reach the wall
    // aslant, 8.31 off (600 - 8.31); was the disc fan's 8 cos 60 = 4.0 off. The eye is then short of the wall, so the
    // guarded case -- the eye past it -- is re-staged by placing the prone body at the old x 596 facing the wall (a prone
    // still body's deep hit is the jam, never a push, D:L413602-413611).
    expect(s.feet(2)[0]).toBeCloseTo(591.69, 2);
    s.room.player(2)!.sim.walker.place(596, 20, s.feet(2)[2]);
    for (let i = 0; i < 10; i++) step({ yaw });
    const [x, , z] = s.feet(2);
    expect(x).toBeCloseTo(600 - 8 * Math.cos(Math.PI / 3), 2);
    s.room.takeDrops();
    s.send(2, 'Claymore', [606, 0, z], [1, 0, 0]);                         // behind the wall
    expect(s.a.of('grenade')).toHaveLength(0);
    expect(s.room.takeDrops()).toEqual({ 'throw: hand walled': 1 });
    s.send(2, 'Claymore', [x + 3, 0.1, z], [1, 0, 0]);                       // on the body's side, under the eye
    expect(s.a.of('grenade')).toHaveLength(1);
  });

  it('PF-05 fix 2: prone in a 6-wide corridor the body stays between its walls, and a claymore past a wall is refused', () => {
    // The review of f0986ab1 (its corridor start): walls x -503 and -497, the SEAL at x -498 facing along the corridor.
    // FUN_00552ec0's segments run ahead and behind (along it): no hit, it lies down. The radius 8 cannot clear both walls,
    // so no push is taken (the crossing guard) and the crawl along it never leaves it; a charge outside a wall is walled.
    const wallAt = (x: number): WorldPoly => ({ ...FLOOR, path: `worldmodel/corridor${x}`, ditype: 2, points: Float32Array.from([x, 0, -100, x, 0, 100, x, 22, 100, x, 22, -100]) });
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [-498, 0, 50], map(false, [wallAt(-503), wallAt(-497)]));
    const yaw = 0;                                                           // facing -z, along the corridor
    s.room.player(2)!.sim.walker.state.yaw = yaw;
    const step = (over: Partial<Command>): void => {
      const p = s.room.player(2)!;
      const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw, pitch: 0, turn: 0, buttons: 0, stance: 2, weapon: 0, ...over };
      s.room.binary(2, encodeCommands({ viewTick: s.room.tick, commands: [cmd] }));
      s.room.step();
    };
    step({ buttons: Button.Stance });
    for (let i = 0; i < 150; i++) step({});
    expect(s.room.player(2)!.sim.walker.posture).toBe('prone');
    for (let i = 0; i < 120; i++) step({ forward: 1 });
    for (let i = 0; i < 10; i++) step({});
    const [x, , z] = s.feet(2);
    expect(x).toBeGreaterThan(-503);
    expect(x).toBeLessThan(-497);
    s.room.takeDrops();
    s.send(2, 'Claymore', [-494, 0, z - 3], [0, 0, -1]);                  // outside the right wall
    expect(s.a.of('grenade')).toHaveLength(0);
    expect(s.room.takeDrops()).toEqual({ 'throw: hand walled': 1 });
    s.send(2, 'Claymore', [-499, 0, z - 3], [0, 0, -1]);                  // in the corridor, ahead
    expect(s.a.of('grenade')).toHaveLength(1);
  });

  it('a charge on a surface it cannot rest on (restsOn; here a LIQUID one) is refused', () => {
    // A tank of WATER 14 up (x -600..-500, z 500..600): only the water lies under the point. The point is 1 inside its
    // edge and 16 across from the feet (SVC-23b: within START_REACH_PLACEHOLDER), the head (15.9) over the edge, so the
    // sight line passes over it (the room's `segmentHit` lets it through) and only `restsOn` refuses it.
    const world = map(false, [slab(14, -600, -500, 500, 600, WATER_BYTE)]);
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [-550, 0, 485], world);
    s.send(2, 'Claymore', [-550, 14, 501], [0, 0, 1]);                     // on the water
    expect(s.a.of('grenade')).toHaveLength(0);
    expect(s.room.player(2)!.grenades.Claymore).toBe(8);
    expect(s.room.takeDrops()).toEqual({ 'throw: ground': 1 });            // the surface's, not the reach or a wall
    s.send(2, 'Claymore', [-550, 0, 480], [0, 0, 1]);                      // the floor beside it
    expect(s.a.of('grenade')).toHaveLength(1);
  });

  it('AD-4: a charge set on an ACTION, INVISIBLE_DI or ITEM face rests there (FUN_005c2430 D:L477228-477230 has no penetration test)', () => {
    // The same reach as the tank's (16 across from the feet, 1 inside the slab's edge), a slab 1 up of each material in
    // turn: before AD-4 `restsOn`'s `penetration !== 1` refused all three (PENETRATION 1), and the floor under it lay
    // past the slack, so the room said 'ground'.
    for (const name of ['ACTION', 'INVISIBLE_DI', 'ITEM']) {
      const byte = materialTable().findIndex((m) => m.name === name);
      expect(materialTable()[byte]!.penetration).toBe(1);
      const world = map(false, [slab(1, -600, -500, 500, 600, byte)]);
      const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [-550, 0, 485], world);
      s.send(2, 'Claymore', [-550, 1, 501], [0, 0, 1]);                      // on the face itself: no rest lift (AD-4)
      expect(s.room.takeDrops(), name).toBeNull();                           // nothing refused
      expect(s.a.of('grenade'), name).toHaveLength(1);
      expect(s.room.player(2)!.grenades.Claymore, name).toBe(7);
    }
  });

  it('byte 0 is the map\'s DefaultMaterial in the room\'s check too (FUN_002dc1d0), as on the page (grenade.ts gridCast)', () => {
    // The same tank, its byte 0, on a map whose DefaultMaterial is WATER: the page refuses it (its cast reads WATER),
    // so the room must; read as UNKNOWN it would take a charge a modified page sent there.
    const world: SimMap = { ...map(false, [slab(14, -600, -500, 500, 600, 0)]), defaultMaterial: 'WATER' };
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [-550, 0, 470], world);
    s.send(2, 'Claymore', [-550, 14, 501], [0, 0, 1]);
    expect(s.a.of('grenade')).toHaveLength(0);
    expect(s.room.player(2)!.grenades.Claymore).toBe(8);
  });

  it('a charge on a surface above the hand\'s reach (over the eye, the floor under it) is refused', () => {
    // A slab 17 up (x -600..-500, z 700..800): over the standing eye (15.4), with the floor under it -- the column's
    // lowest surface, so `placeGround` never picks the slab from any hand at or under the eye (AD-4; was: "by more than the
    // cast's lift (1)", `PLACE_CAST_LIFT_READING`, retired). The point is 1 inside its edge and 16 across from the feet (SVC-23b: within START_REACH_PLACEHOLDER), the path from the
    // head (15.9) at the hand's height under the slab, so no wall refuses it and only the ground check's ceiling does.
    const world = map(false, [slab(17, -600, -500, 700, 800)]);
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [-550, 0, 685], world);
    s.send(2, 'Claymore', [-550, 17, 701], [0, 0, 1]);                     // on the high slab
    expect(s.a.of('grenade')).toHaveLength(0);
    expect(s.room.player(2)!.grenades.Claymore).toBe(8);
    expect(s.room.takeDrops()).toEqual({ 'throw: ground': 1 });            // the ceiling's, not the reach or a wall
  });

  it('AD-4: a charge on a ledge exactly at the hand\'s height (feet + CHARGE_HAND_HEIGHT_PLACEHOLDER) is taken, not walled by its own ledge', () => {
    // A slab 8 up (x -600..-500, z 500..600), the SEAL on the floor at z 485: the hand path runs across at 8, in the
    // ledge's own plane, to the point over the charge, which is the charge; no drop is left to meet the ledge.
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [-550, 0, 485], map(false, [slab(8, -600, -500, 500, 600)]));
    expect(s.feet(2)[1]).toBe(0);
    s.send(2, 'Claymore', [-550, 8, 501], [0, 0, 1]);
    expect(s.room.takeDrops()).toBeNull();
    expect(s.a.of('grenade')).toHaveLength(1);
  });

  it('AD-4: nothing at or under the hand -- the table over it (the column\'s lowest accepted surface, FUN_005c2430 D:L477247-477249) takes the charge', () => {
    // No floor across x -560..-500; the SEAL stands on the floor west of it (x -565), a table 17 up spans the gap at z
    // 500..600. The charge 13 across, on the table: over the eye (15.4), and the column's lowest surface. The hand path
    // rises from the hand's height (8) to the slack under the table: the table it rests on is no wall. Was: walled by it.
    const world = map(false, [slab(0, -1000, -560, -1000, 1000), slab(0, -500, 1000, -1000, 1000), slab(17, -560, -500, 500, 600)], false);
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [-565, 0, 550], world);
    expect(s.feet(2)[1]).toBe(0);
    s.send(2, 'Claymore', [-552, 17, 550], [1, 0, 0]);
    expect(s.room.takeDrops()).toBeNull();
    expect(s.a.of('grenade')).toHaveLength(1);
  });

  it('another player\'s Detonator never sets off this one\'s claymores (owner-scoped, CZKit_DetonateRemoteExplosives +0xac)', () => {
    const s = setup(kit(62, 15, 153, 126, 255), kit(62, 15, 153, 153, 158), [40, 0, 0], [0, 0, 0]);
    s.send(2, 'Claymore', [8, 0, 0], [1, 0, 0]);
    s.send(1, 'Claymore', [48, 0, 0], [1, 0, 0]);
    s.send(1, 'Detonator', s.eye(1), [0, 0, 0]);
    const flying = (s.room as unknown as { flying: { owner: unknown; g: { trigger?: boolean } }[] }).flying;
    expect(flying.filter((f) => f.g.trigger).map((f) => f.owner)).toEqual([s.room.player(1)]);
  });

  /**
   * P38-room (research 85 §9.7.1): the original sets no fire timer on the Detonator's fire -- `FUN_005be9a0`'s Detonator
   * branch (D:L475477-475478) calls only `FUN_005c0130`, and only D:L475488 and D:L475517 write the timer `+0x81c`; its
   * limits between presses are the page's (the per-press count `+0x818` against `FUN_005c0940`, D:L476439, and the
   * claymore's re-select, `FUN_005c8a20(0x99)` D:L476031). So the room takes a detonate at each command it names.
   */
  it('the Detonator only with a claymore in the kit (FUN_005c74e0), and no FireWait between its fires (P38-room)', () => {
    const s = setup(kit(62, 15, 153, 158, 255), kit(62, 15, 121, 158, 255), [300, 0, 0], [0, 0, 0]);
    s.send(2, 'Detonator', s.eye(2), [0, 0, 0]);                             // no claymore in the SEAL's kit
    expect(s.a.of('grenade')).toHaveLength(0);
    s.room.takeDrops();
    s.send(1, 'Detonator', s.eye(1), [0, 0, 0]);
    s.drive(1, 1 / TICK_HZ);                                                 // the next room tick, one command on
    s.send(1, 'Detonator', s.eye(1), [0, 0, 0]);                             // taken: no FireWait in the original
    expect(s.b.of('grenade').filter((g) => g.kind === 'Detonator')).toHaveLength(2);
    expect(Object.keys(s.room.takeDrops() ?? {}).filter((k) => k.startsWith('throw'))).toEqual([]);
  });

  /**
   * PAR-96 B2 (research 256 §8.1-§8.2, R256.6): `FUN_003cc1f0` counts the owner's placed entries marked `+0xc5` -- set
   * for the claymore alone (D:L474101) -- `< 4` (D:L475308, D:L475340), asked by the claymore's and the PMN's fire. Was:
   * "a fifth charge down is refused (FUN_003cc1f0 < 4): claymores and PMNs count together" (the room's `chargesDown`).
   */
  it('PAR-96: a claymore with three claymores and a PMN down is set down -- the four counts claymores only', () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [0, 0, 0]);
    for (const [i, kind] of (['Claymore', 'Claymore', 'PMN Mine', 'Claymore', 'Claymore'] as const).entries()) {
      s.send(2, kind, [8, 0.1, i * 2], [1, 0, 0]);
    }
    expect(s.a.of('grenade')).toHaveLength(5);
    expect(s.room.player(2)!.grenades).toEqual({ Claymore: 4, 'PMN Mine': 3 });
    expect(s.room.takeDrops()).toBeNull();
    s.send(2, 'Claymore', [8, 0, 10], [1, 0, 0]);                          // a fifth claymore: four of them down
    expect(s.a.of('grenade')).toHaveLength(5);
    expect(s.room.takeDrops()).toEqual({ 'throw: charges down': 1 });
  });

  it('PAR-96: a claymore with two C4 and two PMNs down is set down (C4 is never marked +0xc5, D:L474101)', () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 151, 158, 153), [30, 0, 300], [0, 0, 316], barrierMap()); // LATER 1139: restaged from 30 u to 14 u (the hip gate, 19.9 u)
    for (let i = 0; i < 2; i++) s.plant(2, [0, 0.1, 318], [0, 0, 1], 0, { path: BARRIER, point: [0, 12, 330] });
    for (let i = 0; i < 2; i++) s.send(2, 'PMN Mine', [8, 0, 314 - i * 2], [1, 0, 0]);
    expect(s.a.of('grenade').map((g) => g.kind)).toEqual(['C4', 'C4', 'PMN Mine', 'PMN Mine']);
    s.send(2, 'Claymore', [8, 0, 308], [1, 0, 0]);
    expect(s.a.of('grenade').map((g) => g.kind)).toEqual(['C4', 'C4', 'PMN Mine', 'PMN Mine', 'Claymore']);
    expect(s.room.takeDrops()).toBeNull();
  });

  it('PAR-96 controls: four claymores down, a PMN is refused (the claymores limit it, D:L475338-475340); C4 is planted (its fire asks no count)', () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 158, 151), [30, 0, 300], [0, 0, 316], barrierMap()); // LATER 1139: restaged from 30 u to 14 u (the hip gate, 19.9 u)
    for (let i = 0; i < 4; i++) s.send(2, 'Claymore', [8, 0, 314 - i * 2], [1, 0, 0]);
    expect(s.a.of('grenade')).toHaveLength(4);
    s.send(2, 'PMN Mine', [8, 0, 306], [1, 0, 0]);
    expect(s.a.of('grenade')).toHaveLength(4);
    expect(s.room.takeDrops()).toEqual({ 'throw: charges down': 1 });
    s.plant(2, [0, 0.1, 318], [0, 0, 1], 0, { path: BARRIER, point: [0, 12, 330] });
    expect(s.a.of('grenade').map((g) => g.kind)).toEqual(['Claymore', 'Claymore', 'Claymore', 'Claymore', 'C4']);
    expect(s.room.takeDrops()).toBeNull();
  });

  it('a departed player\'s charges are no one\'s (FUN_003ccd90 from CZSealBody\'s destructor): never counted against the next holder of its id', () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [0, 0, 0]);
    for (const [i, kind] of (['Claymore', 'Claymore', 'PMN Mine', 'Claymore'] as const).entries()) s.send(2, kind, [8, 0.1, i * 2], [1, 0, 0]);
    expect(s.a.of('grenade')).toHaveLength(4);
    s.room.leave(2);
    // A new page handed the id the SEAL left: its own first charge goes down (the four are no one's now), and the
    // departed SEAL's charges stay where they lie.
    const c = new Client();
    s.room.hello(2, c, { type: 'hello', version: PROTOCOL_VERSION, name: 'Next', map: 'MP99' }, '192.0.2.9');
    const p = s.room.player(2)!;
    p.sim.walker.place(0, 20, 0);
    s.run(0.5);
    s.send(2, 'Claymore', [8, 0, 1], [1, 0, 0]);
    expect(s.a.of('grenade')).toHaveLength(5);
    const flying = (s.room as unknown as { flying: { owner: unknown }[] }).flying;
    expect(flying).toHaveLength(5);
    expect(flying.filter((f) => f.owner === p)).toHaveLength(1);
  });

  it('repair 2: a takeover is the same person (TAKEOVER_ROW_READING): its charges come with the seat, counted and set off by it', () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [0, 0, 0]);
    for (const [i, kind] of (['Claymore', 'Claymore', 'PMN Mine', 'Claymore'] as const).entries()) s.send(2, kind, [8, 0.1, i * 2], [1, 0, 0]);
    expect(s.a.of('grenade')).toHaveLength(4);
    const old = s.room.player(2)!;
    // The same tab's newer connection (a reload under an unclean drop) takes the seat over as id 7.
    const c = new Client();
    s.room.hello(7, c, { type: 'hello', version: PROTOCOL_VERSION, name: 'P2', map: 'MP99', session: tok(2) }, '192.0.2.2');
    expect(s.room.lastReplaced).toBe(2);
    const p = s.room.player(7)!;
    expect(p).not.toBe(old);
    const flying = (s.room as unknown as { flying: { owner: unknown }[] }).flying;
    expect(flying.filter((f) => f.owner === p)).toHaveLength(4);             // the four are its own still
    expect(flying.filter((f) => f.owner === old)).toHaveLength(0);
    p.sim.walker.place(0, 20, 0);
    s.run(0.5);
    // PAR-96: the four counts claymores only (D:L474101): its three and a fourth taken, a fifth refused -- the cap counts
    // the seat's own. (Was: "a fifth: the cap counts its four", the PMN counted among them.)
    s.send(7, 'Claymore', [8, 0, 9], [1, 0, 0]);
    expect(s.a.of('grenade')).toHaveLength(5);
    s.room.takeDrops();
    s.send(7, 'Claymore', [8, 0, 11], [1, 0, 0]);
    expect(s.a.of('grenade')).toHaveLength(5);
    expect(s.room.takeDrops()).toEqual({ 'throw: charges down': 1 });       // refused by the count, not another rule (the review's F2)
    s.send(7, 'Detonator', s.eye(7), [0, 0, 0]);                             // its Detonator sets off its claymores
    const set = (s.room as unknown as { flying: { owner: unknown; kind: string; g: { trigger?: boolean } }[] }).flying.filter((f) => f.g.trigger);
    expect(set.map((f) => f.kind)).toEqual(['Claymore', 'Claymore', 'Claymore', 'Claymore']);   // the PMN by an actor only
  });

  /**
   * LATER 931's fix after review B-F1: the join envelope names a charge's owner only while its thrower is that live seat
   * (`thrower`, the room's own rule, DEPARTED_CHARGES_READING); a departed player's charge is sent as no one's
   * (`JOIN_ORPHAN_OWNER`), so a new page handed the leaver's recycled id never reads them as its own
   * (`netPage.joinSinks`' `owner === self`). A takeover's re-pointed charges still name the seat (TAKEOVER_ROW_READING).
   */
  it("LATER 931 B-F1: a new page handed a departed player's id is not named the owner of his claymore and PMN in its welcome's join envelope", () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [0, 0, 0]);
    s.send(2, 'Claymore', [8, 0.1, 0], [1, 0, 0]);
    s.send(2, 'PMN Mine', [8, 0.1, 4], [1, 0, 0]);
    expect(s.a.of('grenade').map((g) => g.kind)).toEqual(['Claymore', 'PMN Mine']);
    s.room.leave(2);
    const c = new Client();
    s.room.hello(2, c, { type: 'hello', version: PROTOCOL_VERSION, name: 'Next', map: 'MP99' }, '192.0.2.9');
    const join = c.of('welcome')[0]!.join!;
    expect(join.projectiles.map((p) => p.kind)).toEqual(['Claymore', 'PMN Mine']);   // still where they lie
    expect(join.projectiles.map((p) => p.owner)).not.toContain(2);           // was [2, 2]: the leaver's recycled id
    expect(join.projectiles.map((p) => p.owner)).toEqual([JOIN_ORPHAN_OWNER, JOIN_ORPHAN_OWNER]);
  });

  it("LATER 931 B-F1 control: a takeover's welcome names the seat's new id as the owner of its claymore and PMN (re-pointed, TAKEOVER_ROW_READING)", () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [0, 0, 0]);
    s.send(2, 'Claymore', [8, 0.1, 0], [1, 0, 0]);
    s.send(2, 'PMN Mine', [8, 0.1, 4], [1, 0, 0]);
    const c = new Client();
    s.room.hello(7, c, { type: 'hello', version: PROTOCOL_VERSION, name: 'P2', map: 'MP99', session: tok(2) }, '192.0.2.2');
    expect(s.room.lastReplaced).toBe(2);
    const join = c.of('welcome')[0]!.join!;
    expect(join.projectiles.map((p) => [p.kind, p.owner])).toEqual([['Claymore', 7], ['PMN Mine', 7]]);
  });

  it("LATER 931 F4 control: a resumed seat's welcome (handBack: the same Player, the same id) names its own id as the owner of its claymore and PMN", () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [0, 0, 0]);
    s.send(2, 'Claymore', [8, 0.1, 0], [1, 0, 0]);
    s.send(2, 'PMN Mine', [8, 0.1, 4], [1, 0, 0]);
    (s.room as unknown as { accounts: Map<number, number | null> }).accounts.set(2, 102);   // seated as an account's (the bridge's)
    const back = new Client();
    s.room.hello(3, back, { type: 'hello', version: PROTOCOL_VERSION, name: 'P2', map: 'MP99', session: tok(2) }, '', { account: 102 });
    expect((s.room as unknown as { lastResumed?: number | null }).lastResumed).toBe(2);
    const welcome = back.of('welcome')[0]!;
    expect(welcome.id).toBe(2);
    expect(welcome.join!.projectiles.map((p) => [p.kind, p.owner])).toEqual([['Claymore', 2], ['PMN Mine', 2]]);
  });

  /**
   * LATER 931's re-review F3: B-F1's two halves joined -- the room's own welcome for a recycled id, sent through the
   * page's own path (`NetPage` -> `applyJoinState` -> `joinSinks`, `owner === self`) into a `GrenadeThrower`: the
   * departed's claymores are drawn, none is the page's (`claymoresDown()` 0) and the Detonator is refused.
   */
  it("LATER 931 B-F1 joined: the room's welcome for a recycled id, laid by the page, counts none of the departed's claymores down and refuses the Detonator", () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [0, 0, 0]);
    s.send(2, 'Claymore', [8, 0.1, 0], [1, 0, 0]);
    s.send(2, 'Claymore', [8, 0.1, 4], [1, 0, 0]);
    s.room.leave(2);
    const c = new Client();
    s.room.hello(2, c, { type: 'hello', version: PROTOCOL_VERSION, name: 'Next', map: 'MP99' }, '192.0.2.9');
    const welcome = c.of('welcome')[0]!;
    expect(welcome.id).toBe(2);
    const snap = { feet: [0, 50, 0], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null, jumps: 0 } as unknown as PlaySnapshot;
    const g = new GrenadeThrower({ grid: () => null, snapshot: () => snap, view: () => 'third' });
    let socket: WebSocketLike | null = null;
    const walk = {
      setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
      setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'walk',
    } as unknown as WalkMode;
    // The remote bodies, every method a no-op (the room's real welcome names its players, their types and kits).
    const remote = new Proxy({}, { get: () => () => undefined }) as unknown as RemotePlayers;
    const roundAudio = Object.fromEntries((['roundStart', 'eliminated', 'timeExpired', 'roundOver', 'reset', 'frame'] as const)
      .map((k) => [k, () => undefined])) as unknown as NonNullable<NetPageDeps['roundAudio']>;
    const deps: NetPageDeps = {
      walk, remote, hud: new Hud(), clips: () => null, spectate: () => undefined, roundAudio,
      remoteGrenade: (kind, from, velocity, owner, pid, phase) => g.launchRemote(kind, from, velocity, owner, pid === undefined ? undefined : { pid, ...phase }),
      ownProjectiles: () => g.ownLive(),
      respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
      socket: () => { socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike; return socket; },
    };
    new NetPage(deps, 'ws://test/ws', 'MP99', 'Next', undefined, false, 'classic');
    socket!.onopen?.({} as Event);
    socket!.onmessage?.({ data: JSON.stringify(welcome) } as MessageEvent);
    expect(g.stats().live.map((l) => l.owner)).toEqual([JOIN_ORPHAN_OWNER, JOIN_ORPHAN_OWNER]);   // drawn where they lie
    expect(g.claymoresDown()).toBe(0);
    expect(g.ownLive()).toBe(false);
    expect(g.select('Detonator')).toBe(false);
  });

  it('a departed player\'s rocket meets the body of the next holder of its id (the owner passed over by the body, not the id)', () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 145, 185, 255), [0, 0, 500], [0, 0, 0]);
    s.hold(2, 'LAW'); s.drive(2, launcherRaiseSeconds(0) + 0.05);
    s.send(2, 'LAW HEAT', s.eye(2), [200, 0, 0]);                            // east, at the wall 600 u off
    s.room.leave(2);
    const c = new Client();
    s.room.hello(2, c, { type: 'hello', version: PROTOCOL_VERSION, name: 'Next', map: 'MP99' }, '192.0.2.9');
    s.room.player(2)!.sim.walker.place(150, 20, 0);                          // the new page stands in its path
    const flying = (s.room as unknown as { flying: { g: { vel: V3; state: string } }[] }).flying;
    const rocket = flying.find((f) => f.g.vel[0] > 0)!;
    s.run(0.9);                                                             // it would reach the wall at about 1.2 s
    expect(rocket.g.state).not.toBe('flight');
    expect((rocket.g as unknown as { pos: V3 }).pos[0]).toBeLessThan(160);   // gone off at the body, x 150
  });

  it('the Detonator sets off only the SEAL\'s own claymores, within 500 u, never a PMN', () => {
    const s = setup(kit(62, 15, 153, 158, 255), kit(62, 15, 121, 153, 255), [60, 0, 60], [0, 0, 0]);
    s.send(1, 'PMN Mine', [60, 0, 40], [0, 0, 1]);                         // the Terrorist's mine, 20 u from him
    s.send(2, 'Detonator', s.eye(2), [0, 0, 0]);                             // the SEAL has no claymore down
    s.run(0.2);
    s.send(1, 'Detonator', s.eye(1), [0, 0, 0]);                             // the Terrorist's Detonator: the PMN is no claymore
    s.run(0.2);
    expect(s.b.of('blast')).toHaveLength(0);
    expect(s.a.of('blast')).toHaveLength(0);
  });

  it('the PMN: unarmed for its Timer1 (8 s), then an actor inside ProximityDistance (10 u) sets it off', () => {
    const s = setup(kit(62, 15, 153, 158, 255), kit(62, 15, 121, 126, 255), [0, 0, 0], [300, 0, 0]);
    s.send(1, 'PMN Mine', [8, 0, 0], [1, 0, 0]);
    s.room.player(1)!.sim.walker.place(-300, 20, 0);                         // the Terrorist walks off
    s.room.player(2)!.sim.walker.place(8, 20, 0);                            // the SEAL stands on it at once
    s.run(7.5);
    expect(s.b.of('blast')).toHaveLength(0);                                // not armed yet
    s.run(1);
    expect(s.b.of('blast')).toHaveLength(1);                                // armed at 8 s: tripped
    expect(s.b.of('hurt').length).toBeGreaterThan(0);                       // 6.5 in 4 m
  });

  it('PMN_FRIENDLY_READING: its owner trips his own mine too (no team test in FUN_00543930)', () => {
    const s = setup(kit(62, 15, 153, 158, 255), kit(62, 15, 121, 126, 255), [0, 0, 0], [300, 0, 0]);
    s.send(1, 'PMN Mine', [8, 0, 0], [1, 0, 0]);
    s.run(8.5);
    expect(s.a.of('blast')).toHaveLength(1);
  });

  /**
   * MINES-ROOM (research 235 §8; H1 of the mines investigation of 2026-11-12): the PMN's trip is told to every
   * page, as C4's going off is. The original has one authority per mine -- the owner's console tests it
   * (`FUN_005bc730` D:L474105-474108, `FUN_00543930` D:L410281-410305) and sends the trip on the wire (`FUN_003c7170`
   * D:L318487-318496) -- and here the room is that authority. Was: the room tripped and blasted, and broadcast nothing; a
   * page then tripped its own copy only against a body its snapshot showed alive, so the others, a spectator and the
   * replay mostly saw no explosion and a ghost mine stayed drawn.
   */
  describe('the PMN\'s trip is broadcast as `detonate` (research 235 §8)', () => {
    /** Player 1's PMN at [8, 0, 0], armed (8 s) with both players away; a spectator (9) watching; player 2 then on it. */
    const tripped = (tough: boolean) => {
      const recorded: ServerEvent[] = [];                                     // the replay's recorder (`RoomRecorder.event`)
      const recorder = { snapshot: () => undefined, players: () => undefined, event: (_tick: number, ev: ServerEvent) => { recorded.push(ev); } };
      const s = setup(kit(62, 15, 153, 158, 255), kit(62, 15, 121, 126, 255), [0, 0, 0], [300, 0, 0], map(), { recorder } as never);
      const w = new Client();
      s.room.hello(9, w, { type: 'hello', version: PROTOCOL_VERSION, name: 'P9', map: 'MP99', watch: true }, '');
      expect(w.of('welcome')[0]!.role).toBe('spectator');
      s.send(1, 'PMN Mine', [8, 0, 0], [1, 0, 0]);
      const pid = s.a.of('placed').find((e) => e.kind === 'PMN Mine')!.pid;
      s.room.player(1)!.sim.walker.place(-300, 20, 0);
      s.run(8.5);                                                             // armed, no one near
      expect(s.b.of('blast')).toHaveLength(0);
      if (tough) { const h = s.room.player(2)!.health; h.hp = h.hp.map(() => 1e6); h.max = h.hp.map(() => 1e6); }
      s.room.player(2)!.sim.walker.place(8, 20, 0);                            // the SEAL walks onto it
      s.run(1);
      expect(s.b.of('blast')).toHaveLength(1);
      return { s, w, pid, recorded };
    };

    it('a lethal walk-in: both players, the spectator and the replay record get `detonate {pid, by: null}` once, before the kill', () => {
      const { s, w, pid, recorded } = tripped(false);
      expect(s.room.player(2)!.alive).toBe(false);
      for (const events of [s.a.events, s.b.events, w.events, recorded]) {
        expect(events.filter((e) => e.type === 'detonate')).toEqual([{ type: 'detonate', pid, by: null }]);
        const det = events.findIndex((e) => e.type === 'detonate');
        const kill = events.findIndex((e) => e.type === 'kill' && e.victim === 2);
        expect(det).toBeGreaterThanOrEqual(0);
        expect(kill).toBeGreaterThan(det);
      }
    });

    it('a trip that does not kill: the same `detonate`, to every page', () => {
      const { s, w, pid } = tripped(true);
      expect(s.room.player(2)!.alive).toBe(true);
      for (const c of [s.a, s.b, w]) expect(c.of('detonate')).toEqual([{ type: 'detonate', pid, by: null }]);
    });

    it('a claymore is no proximity trip: walked over, nothing; set off by its Detonator, no `detonate` (the pages run the Detonator)', () => {
      expect(CLAYMORE.proximity).toBeUndefined();
      const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 121, 153, 255), [300, 0, 0], [0, 0, 0]);
      s.send(2, 'Claymore', [8, 0, 0], [1, 0, 0]);
      s.room.player(1)!.sim.walker.place(8, 20, 5);                            // the Terrorist stands on it
      s.run(10);
      expect(s.a.of('blast')).toHaveLength(0);
      s.room.player(1)!.sim.walker.place(150, 20, 0);
      s.room.player(2)!.sim.walker.place(-100, 20, 0);                        // back off behind it, then fire the Detonator
      s.run(0.5);
      s.send(2, 'Detonator', s.eye(2), [0, 0, 0]);
      s.run(0.5);
      expect(s.a.of('blast')).toHaveLength(1);
      expect(s.a.of('detonate')).toEqual([]);
      expect(s.b.of('detonate')).toEqual([]);
    });
  });

  it('C4: refused away from a C4 target; at one, still, set down and gone off at its Timer1 (6 s), 18 in 5 m', () => {
    const away = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 121, 126, 151), [0, 0, 0], [0, 0, -300], barrierMap());
    away.plant(2, [0, 0.1, -290], [0, 0, 1], 0, { path: BARRIER, point: [0, 12, 330] });
    expect(away.a.of('grenade')).toHaveLength(0);
    expect(away.room.player(2)!.grenades.C4).toBe(4);
    const at = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 121, 126, 151), [30, 0, 300], [0, 0, 316], barrierMap()); // LATER 1139: restaged from 30 u to 14 u (the hip gate, 19.9 u)
    at.plant(2, [0, 0.1, 318], [0, 0, 1], 0, { path: BARRIER, point: [0, 12, 330] });
    expect(at.a.of('grenade')).toHaveLength(1);
    expect(at.room.player(2)!.grenades.C4).toBe(3);
    at.room.player(2)!.sim.walker.place(0, 20, -300);                        // the SEAL gets clear
    at.run(5.8);
    expect(at.a.of('blast')).toHaveLength(0);
    at.run(0.4);
    expect(at.a.of('blast')).toHaveLength(1);                               // player 1, 30 u off: inside 50
  });

  it('C4 fuse expiry destroys the barrier, tells the owner detonate, and hurts an in-range player in that one tick', () => {
    // Health 1, armour 0, shield 17, C4 damage 18 (research 209 §13, §18): one charge, the blast frame, no timer.
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 121, 126, 151), [10, 0, 300], [0, 0, 324], barrierMap()); // LATER 1139: restaged from 30 u to 6 u (the point 18.5 over the hip)
    const point: V3 = [0, 30, 330];
    s.plant(2, [0, 0, 326], [0, 0, 1], 0, { path: BARRIER, point });
    const pid = s.b.of('placed').find((e) => e.kind === 'C4')!.pid;
    s.room.player(2)!.sim.walker.place(0, 20, -400);                 // the planter leaves the radius
    const sum = (id: number): number => s.room.player(id)!.health.hp.reduce((n, v) => n + v, 0);
    let hp = sum(1);
    let saw = false;
    for (let i = 0; i < 8 * TICK_HZ && !saw; i++) {
      const active = s.room.world.isActive(BARRIER);
      const spent = s.room.world.health.isSpent(0);
      const detonates = s.b.of('detonate').length;
      const blasts = s.a.of('blast').length;
      const before = hp;
      s.room.step();
      hp = sum(1);
      if (s.b.of('detonate').length === detonates) {
        expect(active).toBe(true);
        expect(spent).toBe(false);
        expect(hp).toBe(before);
        continue;
      }
      expect(s.b.of('detonate').at(-1)).toEqual({ type: 'detonate', pid, by: null });
      expect(s.a.of('detonate').at(-1)).toEqual({ type: 'detonate', pid, by: null });
      expect(s.room.world.isActive(BARRIER)).toBe(false);
      expect(s.room.world.health.isSpent(0)).toBe(true);
      expect(s.room.world.health.hp(0)).toBe(0);
      expect(hp).toBeLessThan(before);
      expect(s.a.of('blast').length).toBe(blasts + 1);
      saw = true;
    }
    expect(saw).toBe(true);
  });

  it('a stall longer than the fuse is followed by the blast and the gate removal in the same frame', () => {
    // The page's copy counts the room's tick (`simTick`), not the stalled frame's wall time. The wall update
    // spends the fuse and does not explode; the room's catch-up then removes the gate and the page's blast
    // is that same sample (research 209 §18).
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 121, 126, 151), [10, 0, 300], [0, 0, 324], barrierMap()); // LATER 1139: restaged from 30 u to 6 u (the point 18.5 over the hip)
    const point: V3 = [0, 30, 330];
    s.plant(2, [0, 0, 326], [0, 0, 1], 0, { path: BARRIER, point });
    const pid = s.b.of('placed').find((e) => e.kind === 'C4')!.pid;
    const g = new GrenadeThrower({
      grid: () => s.room.map.grid, snapshot: () => null, view: () => 'third',
      online: () => true, simTick: () => s.room.tick,
    });
    g.setRecords([C4]);
    const booms: string[] = [];
    g.on('explode', (e) => booms.push(e.item));
    g.launchRemote('C4', point, [0, 0, 1], 2, { pid, state: 'rest', fuse: C4.fuse });
    let page = 0;
    while (page < C4.fuse + 2) { g.update(0.25); page += 0.25; }
    let frame = 0;
    let blastAt = -1;
    let gateAt = -1;
    const sample = (): void => {
      frame += 1;
      if (blastAt < 0 && booms.length > 0) blastAt = frame;
      if (gateAt < 0 && !s.room.world.isActive(BARRIER)) gateAt = frame;
    };
    sample();
    expect(booms).toEqual([]);
    expect(s.room.world.isActive(BARRIER)).toBe(true);
    s.run(C4.fuse + 1);
    g.detonateRemote(pid);
    g.update(GAME_FRAME_DT);
    sample();
    expect(blastAt).toBe(gateAt);
    expect(blastAt).toBe(frame);
    expect(booms).toEqual(['C4']);
    expect(s.room.world.isActive(BARRIER)).toBe(false);
  });

  it('a timer wake holds the blast, and the next frame draws it with the gate', async () => {
    // The in-page clock steps between frames. That wake must not publish: the page's world and `detonate` wait for
    // `drain`, and the charge explodes in that same frame even when the frame is shorter than a game frame.
    const sim = barrierMap();
    const page = new WorldState(sim.meta!, sim.ground, sim.grid);
    page.applyInitial();
    const match = new LoopbackMatch(sim, null, {
      auto: false, world: page, kits: kits(kit(62, 15, 121, 126, 255), kit(62, 15, 121, 126, 151)),
      soloKit: () => kit(62, 15, 121, 126, 151),
    });
    const walk: NetWalk = { setNetTap() {}, respawn() { return true; }, nudge() {}, setLocked() {} };
    const client = new NetClient({ url: 'loopback:', map: 'MP99', name: 'Solo', socket: match.socket }, walk);
    const g = new GrenadeThrower({
      grid: () => match.room.map.grid, snapshot: () => null, view: () => 'third',
      online: () => true, simTick: () => match.room.tick,
    });
    g.setRecords([C4]);
    const booms: string[] = [];
    g.on('explode', (e) => booms.push(e.item));
    client.on((ev) => {
      if (ev.type === 'placed' && ev.kind === 'C4') g.launchRemote('C4', ev.from, [0, 0, 1], client.id ?? 1, { pid: ev.pid, state: 'rest', fuse: C4.fuse });
      else if (ev.type === 'detonate') g.detonateRemote(ev.pid);
    });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    const t0 = performance.now();
    match.drain(t0);
    const id = client.id!;
    for (let i = 0; i < 120; i++) match.step();
    const body = match.room.player(id)!;
    body.sim.walker.place(0, 20, 324); // LATER 1139: 6 u off (was 30)
    for (let i = 0; i < 30; i++) match.step();
    const point: V3 = [0, 30, 330];
    match.room.text(id, { type: 'throw', seq: body.sim.seq, kind: 'C4', from: [0, 0, 326], velocity: [0, 0, 1], target: 0, surface: { path: BARRIER, point } });
    const charges = (): { g: { fuse: number } }[] =>
      (match.room as unknown as { flying: { kind: string; g: { fuse: number } }[] }).flying.filter((f) => f.kind === 'C4');
    for (let i = 0; i < 500; i++) {
      const charge = charges()[0];
      if (charge && charge.g.fuse < 0.15) break;
      match.step();
    }
    for (let i = 0; i < 8; i++) await Promise.resolve();
    const feet = body.sim.walker.state;
    expect(charges(), `feet ${feet.x},${feet.z}`).toHaveLength(1);
    expect(match.room.world.isActive(BARRIER)).toBe(true);
    expect(page.isActive(BARRIER)).toBe(true);
    match.timerWake(performance.now() + 400);
    expect(match.room.world.isActive(BARRIER)).toBe(false);
    expect(page.isActive(BARRIER)).toBe(true);
    expect(booms).toEqual([]);
    let frame = 0;
    let blastAt = -1;
    let gateAt = -1;
    const sample = (): void => {
      frame += 1;
      if (blastAt < 0 && booms.length > 0) blastAt = frame;
      if (gateAt < 0 && !page.isActive(BARRIER)) gateAt = frame;
    };
    sample();
    match.drain();
    g.update(0);
    sample();
    expect(blastAt).toBe(gateAt);
    expect(blastAt).toBe(frame);
    expect(booms).toEqual(['C4']);
    expect(page.isActive(BARRIER)).toBe(false);
    client.close();
    match.stop();
  });

  /** A resting C4 inside its last 0.15 s, the page drained at `t0`, so the next timer wake can hold the blast. */
  async function primedBlast() {
    const sim = barrierMap();
    const page = new WorldState(sim.meta!, sim.ground, sim.grid);
    page.applyInitial();
    const match = new LoopbackMatch(sim, null, {
      auto: false, world: page, kits: kits(kit(62, 15, 121, 126, 255), kit(62, 15, 121, 126, 151)),
      soloKit: () => kit(62, 15, 121, 126, 151),
    });
    const walk: NetWalk = { setNetTap() {}, respawn() { return true; }, nudge() {}, setLocked() {} };
    const events: ServerEvent[] = [];
    const client = new NetClient({ url: 'loopback:', map: 'MP99', name: 'Solo', socket: match.socket }, walk);
    const g = new GrenadeThrower({
      grid: () => match.room.map.grid, snapshot: () => null, view: () => 'third',
      online: () => true, simTick: () => match.room.tick,
    });
    g.setRecords([C4]);
    client.on((ev) => events.push(ev));
    client.on((ev) => {
      if (ev.type === 'placed' && ev.kind === 'C4') g.launchRemote('C4', ev.from, [0, 0, 1], client.id ?? 1, { pid: ev.pid, state: 'rest', fuse: C4.fuse });
      else if (ev.type === 'detonate') g.detonateRemote(ev.pid);
    });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    const t0 = performance.now();
    match.drain(t0);
    const id = client.id!;
    for (let i = 0; i < 120; i++) match.step();
    match.room.player(id)!.sim.walker.place(0, 20, 324); // LATER 1139: 6 u off (was 30)
    for (let i = 0; i < 30; i++) match.step();
    const body = match.room.player(id)!;
    match.room.text(id, { type: 'throw', seq: body.sim.seq, kind: 'C4', from: [0, 0, 326], velocity: [0, 0, 1], target: 0, surface: { path: BARRIER, point: [0, 30, 330] } });
    const charges = (): { g: { fuse: number } }[] =>
      (match.room as unknown as { flying: { kind: string; g: { fuse: number } }[] }).flying.filter((f) => f.kind === 'C4');
    for (let i = 0; i < 500; i++) {
      const charge = charges()[0];
      if (charge && charge.g.fuse < 0.15) break;
      match.step();
    }
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(charges()).toHaveLength(1);
    expect(page.isActive(BARRIER)).toBe(true);
    return { match, client, g, page, events, t0 };
  }

  it('a direct reply waits behind a held detonate, and the next frame still draws the blast with the gate', async () => {
    const { match, client, g, page, events, t0 } = await primedBlast();
    const booms: string[] = [];
    g.on('explode', (e) => booms.push(e.item));
    match.timerWake(t0 + 400);
    expect(match.room.world.isActive(BARRIER)).toBe(false);
    expect(page.isActive(BARRIER)).toBe(true);
    expect(events.some((e) => e.type === 'detonate')).toBe(false);
    const scores = events.filter((e) => e.type === 'score').length;
    client.send({ type: 'score' });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(events.filter((e) => e.type === 'score').length).toBe(scores);
    expect(events.some((e) => e.type === 'detonate')).toBe(false);
    expect(booms).toEqual([]);
    let frame = 0;
    let blastAt = -1;
    let gateAt = -1;
    const sample = (): void => {
      frame += 1;
      if (blastAt < 0 && booms.length > 0) blastAt = frame;
      if (gateAt < 0 && !page.isActive(BARRIER)) gateAt = frame;
    };
    sample();
    match.drain(t0 + 400);
    let det = -1;
    let lastScore = -1;
    events.forEach((e, i) => {
      if (e.type === 'detonate' && det < 0) det = i;
      if (e.type === 'score') lastScore = i;
    });
    expect(det).toBeGreaterThanOrEqual(0);
    expect(lastScore).toBeGreaterThan(det);
    g.update(0);
    sample();
    expect(blastAt).toBe(gateAt);
    expect(blastAt).toBe(frame);
    expect(booms).toEqual(['C4']);
    expect(page.isActive(BARRIER)).toBe(false);
    client.close();
    match.stop();
  });

  it('a page that has stopped drawing publishes the held blast, so the queue does not keep growing', async () => {
    const { match, client, events, t0 } = await primedBlast();
    match.timerWake(t0 + 400);
    expect(events.some((e) => e.type === 'detonate')).toBe(false);
    match.timerWake(t0 + LOOPBACK_STALL_MS_ADAPTATION + 1);
    expect(events.some((e) => e.type === 'detonate')).toBe(true);
    const before = events.length;
    client.send({ type: 'score' });
    client.send({ type: 'score' });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(events.length).toBe(before + 2);
    expect(events.at(-1)?.type).toBe('score');
    expect(events.at(-2)?.type).toBe('score');
    client.close();
    match.stop();
  });

  it('plants C4 at its validated wall hit, even when the hand-ground point cannot breach the shield', () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 121, 126, 151), [0, 0, -300], [0, 0, 324], barrierMap()); // LATER 1139: restaged from 30 u to 6 u (the point 18.5 over the hip)
    const point: V3 = [0, 30, 330];
    s.plant(2, [0, 0, 326], [0, 0, 1], 0, { path: BARRIER, point });
    expect(s.a.of('grenade')).toEqual([expect.objectContaining({ kind: 'C4', from: point })]);
    expect(s.b.of('placed')).toEqual([expect.objectContaining({ kind: 'C4', from: point })]);
    expect(s.room.player(2)!.grenades.C4).toBe(3);
    s.run(6.2);
    expect(s.room.world.health.hp(0)).toBe(0);
    expect(s.room.world.isActive(BARRIER)).toBe(false);
  });

  it('C4 on a dead barrier or a shield-21 target is refused by c4TargetAt (FUN_002739b0): nothing planted, the charge kept; forAction binds the action\'s valve to its destructible', () => {
    const seal = kit(62, 15, 121, 126, 151);
    // access_action1's valve binds it to access1's block (forAction, the death's chain); the SEAL stands 14 from the wall (LATER 1139: was 30).
    const hard = setup(kit(62, 15, 121, 126, 255), seal, [30, 0, 300], [0, 0, 316], barrierMap(21));
    expect(hard.room.world.health.forAction('set_access1')?.anim).toBe('access1');
    expect(hard.room.world.health.forAction('SET_ACCESS1')?.id).toBe(0);                 // the valve's case aside
    expect(hard.room.world.health.forAction('set_access2')).toBeNull();
    // Shield 21 over C4's 18: refused, the charge kept, nothing told.
    hard.plant(2, [0, 0.1, 318], [0, 0, 1], 0, { path: BARRIER, point: [0, 12, 330] });
    expect(hard.room.player(2)!.grenades.C4).toBe(4);
    expect(hard.a.of('grenade')).toHaveLength(0);
    // A barrier already down (health spent, its wall off): no destructible there to take it.
    const dead = setup(kit(62, 15, 121, 126, 255), seal, [30, 0, 300], [0, 0, 316], barrierMap());
    expect(dead.room.world.health.hitAt(BARRIER, { kind: 'explosion', rating: 20, modifier: 0, point: [0, 20, 330] })).toEqual({ applied: true, died: true });
    expect(dead.room.world.isActive(BARRIER)).toBe(false);
    dead.plant(2, [0, 0.1, 318], [0, 0, 1], 0, { path: BARRIER, point: [0, 12, 330] });
    expect(dead.room.player(2)!.grenades.C4).toBe(4);
    expect(dead.a.of('grenade')).toHaveLength(0);
    // The same place with the barrier standing (shield 17): planted.
    const live = setup(kit(62, 15, 121, 126, 255), seal, [30, 0, 300], [0, 0, 316], barrierMap());
    live.plant(2, [0, 0.1, 318], [0, 0, 1], 0, { path: BARRIER, point: [0, 12, 330] });
    expect(live.room.player(2)!.grenades.C4).toBe(3);
    expect(live.a.of('grenade')).toHaveLength(1);
  });

  it('a blast reaches a scene destructible inside its radius along a line clear to its midpoint: C4 opens a shield-17 wall, an M67 leaves it (SCENE_BLAST_REACH_PLACEHOLDER)', () => {
    // AD-5: the line runs to the wall's midpoint; the wall 24 high (its midpoint (0, 12, 330)); was 60 (midpoint 30 up).
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 121, 126, 151), [30, 0, 300], [0, 0, 290], barrierMap(17, FLOOR.material, [], 24));
    const through = (): string[] => segmentHits(s.room.map.grid, [0, 20, 320], [0, 20, 340]).map((h) => h.owner.path);
    expect(through()).toEqual([BARRIER]);
    // An M67 (10, 15 m) at the SEAL's feet, 40 short of the wall: in reach, under its shield (17). The throw is decided
    // at the command it names (M-8): the SEAL's commands first.
    s.drive(2, 0.5);
    s.send(2, 'M67', [0, 15.4 + 0.1, 290], [0, 0, 0]);
    s.room.player(2)!.sim.walker.place(0, 20, -300);
    s.run(3.6);
    expect(s.a.of('blast')).toHaveLength(1);
    expect(s.room.world.isActive(BARRIER)).toBe(true);
    expect(s.room.world.health.hp(0)).toBe(1);
    // C4 (18, 5 m) 12 short of the wall: the access barrier's sequence runs EXECUTE_ACTION set_access1, the action's
    // destroy program turns the wall off; the segment through it is clear. AD-5: the charge at z 318 is 16.9 u from the
    // midpoint, inside half its 50 u -- the whole 18 over the shield 17 (FUN_003c7600 D:L318730-318735, D:L318763; a
    // shield-17 wall opens to 0.528 of the radius, 26.4 u). Was 28 short (z 302): 41 u from the 60-high wall's
    // midpoint, 18 x (1 - (0.82 - 0.5) x 2) = 6.5 under the shield -- it stood.
    s.room.player(2)!.sim.walker.place(0, 20, 316);
    s.run(0.5);
    s.plant(2, [0, 0.1, 318], [0, 0, 1], 0, { path: BARRIER, point: [0, 12, 330] });
    expect(s.room.player(2)!.grenades.C4).toBe(3);
    s.room.player(2)!.sim.walker.place(0, 20, -300);
    s.run(6.2);
    expect(s.room.world.isActive(BARRIER)).toBe(false);
    expect(s.room.world.valve('set_access1')).toBe(1);
    expect(through()).toEqual([]);
  });

  /**
   * PF-13 (research 181 s6.2, s9.2; 206 s1.2; 210 s9): the claymore's and the PMN's test reads `+0xf88`, the water's depth
   * over the feet, never the speed (D:L475310-475350): refused only wading deeper than `CLAYMORE_RULES.maxWaterDepth` 3.2.
   * A pool of WATER 5 deep over x -800..-600, z 400..600.
   */
  it('a claymore set down on the move is accepted; one in water past 3.2 u is refused; a PMN the same', () => {
    const pool = slab(5, -800, -600, 400, 600, WATER_BYTE);
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [0, 0, 0], map(false, [pool]));
    // On the move (60 u/s, a run): taken -- the claymore's maxSpeed 3.2 was never the game's.
    s.room.player(2)!.sim.walker.state.vx = 60;
    s.send(2, 'Claymore', [8, 0, 0], [1, 0, 0]);
    s.send(2, 'PMN Mine', [8, 0, 4], [1, 0, 0]);
    expect(s.a.of('grenade').map((g) => g.kind)).toEqual(['Claymore', 'PMN Mine']);
    // Wading 5 deep (> 3.2): refused, nothing spent, for the depth.
    s.room.player(2)!.sim.walker.place(-700, 20, 500);
    s.run(0.5);
    s.room.player(2)!.sim.walker.state.vx = 0;
    s.send(2, 'Claymore', [-692, 0, 500], [1, 0, 0]);
    s.send(2, 'PMN Mine', [-692, 0, 504], [1, 0, 0]);
    expect(s.a.of('grenade')).toHaveLength(2);
    expect(s.room.player(2)!.grenades).toEqual({ Claymore: 7, 'PMN Mine': 3 });
    expect(s.room.takeDrops()).toEqual({ 'throw: wading': 2 });
  });

  it('PAR-96 B3: the count before the water (FUN_005be9a0 D:L475307-475320): four claymores down and wading, a claymore is refused for the count', () => {
    const pool = slab(5, -800, -600, 400, 600, WATER_BYTE);
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [0, 0, 0], map(false, [pool]));
    for (let i = 0; i < 4; i++) s.send(2, 'Claymore', [8, 0, i * 2], [1, 0, 0]);
    expect(s.a.of('grenade')).toHaveLength(4);
    s.room.player(2)!.sim.walker.place(-700, 20, 500);
    s.run(0.5);
    s.send(2, 'Claymore', [-692, 0, 500], [1, 0, 0]);
    expect(s.a.of('grenade')).toHaveLength(4);
    expect(s.room.takeDrops()).toEqual({ 'throw: charges down': 1 });
  });

  /**
   * PF-37 (research 236 s3; 181 s2.6): the launcher's take-up reads the same `+0xf88` as the crouch entry
   * (`FUN_005857e0` D:L444332-444360): refused wading deeper than 8.5 (`LAUNCHER_BODY_READING`). A pool 9 deep over
   * x -800..-600, z 400..600 and one 8 deep over x -800..-600, z -600..-400.
   */
  it("the room refuses a launcher raise wading deeper than 8.5 (dropped 'throw: wading') and allows it at 8; a raise already up is not lowered by the water", () => {
    const deep = slab(9, -800, -600, 400, 600, WATER_BYTE), shallow = slab(8, -800, -600, -600, -400, WATER_BYTE);
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 145, 185, 255), [300, 0, 300], [0, 0, 0], map(false, [deep, shallow]));
    const p = s.room.player(2)! as unknown as { held: number | null; sim: { walker: { place(x: number, y: number, z: number): void } } };
    p.sim.walker.place(-700, 20, 500);
    s.drive(2, 0.5);
    expect(wadingDepth(s.room.map.grid, s.feet(2))).toBeCloseTo(9, 3);
    s.hold(2, 'LAW');
    s.drive(2, 1 / TICK_HZ);                                    // NU-6 F1: the item is taken with its clip, on the event's seq + 1
    expect(p.held).toBeNull();
    expect(s.room.takeDrops()).toEqual({ 'throw: wading': 1 });
    // 8 deep: taken up.
    p.sim.walker.place(-700, 20, -500);
    s.drive(2, 0.5);
    expect(wadingDepth(s.room.map.grid, s.feet(2))).toBeCloseTo(8, 3);
    s.hold(2, 'LAW');
    s.drive(2, 1 / TICK_HZ);                                    // NU-6 F1: the item is taken with its clip, on the event's seq + 1
    expect(p.held).toBe(145);
    expect(s.room.takeDrops()).toBeNull();
    // Up, then into the deep water: the launcher stays up (the gate is the take-up's), and a second 'LAW' is no raise.
    p.sim.walker.place(-700, 20, 500);
    s.drive(2, 0.5);
    s.hold(2, 'LAW');
    s.drive(2, 1 / TICK_HZ);                                    // NU-6 F1: the item is taken with its clip, on the event's seq + 1
    expect(p.held).toBe(145);
    expect(s.room.takeDrops()).toBeNull();
  });

  it('C4 on a surface named exactly INVISIBLE_DI is refused (005c1970); on another surface the remaining checks decide; the name alone authorises nothing', () => {
    const at = (material?: number, extra: readonly WorldPoly[] = []) =>
      setup(kit(62, 15, 121, 126, 255), kit(62, 15, 121, 126, 151), [30, 0, -300], [0, 0, 316], barrierMap(17, material, extra)); // LATER 1139: restaged from 30 u to 14 u (the hip gate, 19.9 u)
    const face = { path: BARRIER, point: [0, 12, 330] };
    // INVISIBLE_DI (byte 3, the ELF's 0x65f8c8 string, a case-sensitive compare): refused before the placement call.
    const invisible = at(3);
    invisible.plant(2, [0, 0.1, 318], [0, 0, 1], 0, face);
    expect(invisible.room.player(2)!.grenades.C4).toBe(4);
    expect(invisible.room.takeDrops()).toEqual({ 'throw: c4 surface': 1 });
    // The same barrier of METAL_THICK: planted.
    const metal = at();
    metal.plant(2, [0, 0.1, 318], [0, 0, 1], 0, face);
    expect(metal.room.player(2)!.grenades.C4).toBe(3);
    expect(metal.a.of('grenade')).toHaveLength(1);
    // Not INVISIBLE_DI is no licence: the target the page names must be the destructible at the struck node, in reach,
    // seen from the head; a request without a target or a surface plants nothing.
    const rest = at();
    rest.plant(2, [0, 0.1, 318], [0, 0, 1], undefined, undefined);
    rest.plant(2, [0, 0.1, 318], [0, 0, 1], 1, face);                             // another id than the node's
    rest.plant(2, [0, 0.1, 318], [0, 0, 1], 0, { path: 'worldmodel/floor0', point: [0, 0, 320] });   // the floor: no destructible
    rest.plant(2, [0, 0.1, 318], [0, 0, 1], 0, { path: BARRIER, point: [0, 12, 330.0] });
    expect(rest.room.player(2)!.grenades.C4).toBe(3);                              // only the last
    expect(rest.room.takeDrops()).toEqual({ 'throw: no c4 target': 3 });
    // Out of reach (LATER 1139): the point 32 along the ground, past the hip gate (|point - hip|^2 < 396, FUN_005be9a0
    // D:L475400-475405; proven on r0004 by the capture agent-mail/evidence/later1139-c4reach, 2026-11-18).
    const far = at();
    far.room.player(2)!.sim.walker.place(0, 20, 298);
    far.run(0.5);
    far.plant(2, [0, 0.1, 300], [0, 0, 1], 0, face);
    expect(far.room.player(2)!.grenades.C4).toBe(4);
    expect(far.room.takeDrops()).toEqual({ 'throw: c4 reach': 1 });
    // A wall between the head and the point (a pillar across z 320): refused, as startRefused refuses a round.
    const pillar: WorldPoly = { ...FLOOR, path: 'worldmodel/pillar', ditype: 2, points: Float32Array.from([-10, 0, 320, 10, 0, 320, 10, 60, 320, -10, 60, 320]) };
    const walled = at(undefined, [pillar]);
    walled.plant(2, [0, 0.1, 318], [0, 0, 1], 0, face);
    expect(walled.room.player(2)!.grenades.C4).toBe(4);
    expect(walled.room.takeDrops()).toEqual({ 'throw: c4 walled': 1 });
  });

  // C4-TOLD (an online adaptation, product track; the original has no server refusal -- its planter's console decides alone): a C4
  // plant the room refuses after the page set its charge down and spent it is told to the planter (`stale`, request
  // 'throw', its seq), as LATER 929's claymore refusals are, so the page takes its copy back and gives the charge back.
  // The refusals' own rules and why strings are unchanged.
  it("RED: C4-TOLD -- a C4 refused 'c4 reach' or 'no c4 target' is told to the planter (stale, request 'throw', its seq)", () => {
    const at = () => setup(kit(62, 15, 121, 126, 255), kit(62, 15, 121, 126, 151), [30, 0, -300], [0, 0, 316], barrierMap(17));
    const face = { path: BARRIER, point: [0, 12, 330] };
    const far = at();
    far.room.player(2)!.sim.walker.place(0, 20, 298);
    far.run(0.5);
    far.room.takeDrops();
    const seq = far.room.player(2)!.sim.seq;
    far.plant(2, [0, 0.1, 300], [0, 0, 1], 0, face);
    expect(far.room.takeDrops()).toEqual({ 'throw: c4 reach': 1 });
    expect(far.b.of('stale')).toEqual([{ type: 'stale', request: 'throw', seq }]);   // today: not told
    expect(far.a.of('stale')).toEqual([]);
    const none = at();
    none.room.takeDrops();
    const seq2 = none.room.player(2)!.sim.seq;
    none.plant(2, [0, 0.1, 318], [0, 0, 1], 1, face);                               // another id than the node's
    expect(none.room.takeDrops()).toEqual({ 'throw: no c4 target': 1 });
    expect(none.b.of('stale')).toEqual([{ type: 'stale', request: 'throw', seq: seq2 }]);   // today: not told
    // An accepted plant is not told.
    const ok = at();
    ok.plant(2, [0, 0.1, 318], [0, 0, 1], 0, face);
    expect(ok.room.player(2)!.grenades.C4).toBe(3);
    expect(ok.b.of('stale')).toEqual([]);
  });

  it('a C4 throw with a malformed target or surface is ignored as a malformed throw is: nothing planted, nothing tallied (roomFuzz, roomHostile)', () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 121, 126, 151), [30, 0, -300], [0, 0, 316], barrierMap()); // LATER 1139: restaged from 30 u to 14 u (the hip gate, 19.9 u)
    const face = { path: BARRIER, point: [0, 12, 330] };
    for (const [target, surface] of [
      [0.5, face], ['0', face], [0, { path: 3, point: [0, 12, 330] }], [0, { path: BARRIER, point: [0, Number.NaN, 330] }],
      [0, { path: BARRIER, point: [0, 12] }], [0, { path: BARRIER }], [0, 'worldmodel/access1'], [0, null],
    ] as const) s.plant(2, [0, 0.1, 318], [0, 0, 1], target, surface);
    expect(s.room.player(2)!.grenades.C4).toBe(4);
    expect(s.a.of('grenade')).toHaveLength(0);
    expect(s.room.takeDrops()).toBeNull();                                            // no refusal tallied: ignored
    s.plant(2, [0, 0.1, 318], [0, 0, 1], 0, face);                                  // the well-shaped one: planted
    expect(s.room.player(2)!.grenades.C4).toBe(3);
  });

  it('the pouch follows the loadout (POUCH_PLACEHOLDER retired): the throw of an item the kit does not hold is refused', () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 121, 153, 158), [300, 0, 0], [0, 0, 0]);
    expect(s.room.player(2)!.grenades).toEqual({ M67: 3, Claymore: 4, 'PMN Mine': 4 });
    expect(s.room.player(1)!.grenades).toEqual({ M67: 3, HE: 3 });
    s.send(1, 'Claymore', [300, 0, 8], [1, 0, 0]);
    expect(s.b.of('grenade')).toHaveLength(0);
  });
});

/**
 * The combat report on the placed charges (INT.R5, research 127; ported from Chris's browser-beta-v5,
 * chris/browser-beta-integration d578f347: his 'records confirmed claymore damage' case, through this room's claymore
 * path -- a `throw` of it and its Detonator's). His build reported the charges' refusals as its own reasons; here they
 * are the room's `dropped('throw', ...)` reasons, which were silent before (the triage challenge's finding).
 */
describe('the combat report on the charges (a playtest instrument, off by default)', () => {
  const ON = { combatReport: true };

  it('a claymore set off by its Detonator: the SEAL and the Terrorist it hurts are told the same report', () => {
    // FRAG-COUNT: the Terrorist 22 u in front of the claymore (at 30), inside the count's 30 u (was at 150, 142 u off).
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 121, 153, 255), [30, 0, 0], [0, 0, 0], map(), ON);
    s.send(2, 'Claymore', [8, 0, 0], [1, 0, 0]);
    s.room.player(2)!.sim.walker.place(-100, 20, 0);
    s.run(0.5);
    s.send(2, 'Detonator', s.eye(2), [0, 0, 0]);
    s.run(0.1);
    const e = s.b.of('combat').find((x) => x.target?.id === 1)!;
    expect(e).toMatchObject({ status: 'applied', request: 'blast', weapon: CLAYMORE.id, attacker: { id: 2, team: 'seal' }, target: { id: 1, team: 'terrorist' } });
    expect(e.damageApplied).toBeGreaterThan(0);
    expect(s.a.of('combat')).toEqual([e]);
  });

  it('a claymore refused is reported to its placer with the room\'s reason; with the option off, to no one', () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [0, 0, 0], map(), ON);
    s.send(2, 'Claymore', [8, 5, 0], [1, 0, 0]);                            // no ground under it
    s.send(2, 'Claymore', [8, 0, 0], [0, 0, 0]);                          // no facing
    s.send(2, 'Claymore', [500, 0, 0], [1, 0, 0]);                        // out of the hand's reach
    expect(s.b.of('combat').map((e) => [e.status, e.request, e.reason])).toEqual([
      ['rejected', 'throw', 'ground'], ['rejected', 'throw', 'facing'], ['rejected', 'throw', 'hand far'],
    ]);
    expect(s.a.of('combat')).toEqual([]);
    expect(s.room.takeDrops()).toEqual({ 'throw: ground': 1, 'throw: facing': 1, 'throw: hand far': 1 });
    const off = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [0, 0, 0]);
    off.send(2, 'Claymore', [8, 5, 0], [1, 0, 0]);
    expect(off.b.of('combat')).toEqual([]);
    expect(off.room.takeDrops()).toEqual({ 'throw: ground': 1 });
  });

  it('a Detonator with no claymore in the kit is refused with a reason (it was silent)', () => {
    const s = setup(kit(62, 15, 153, 158, 255), kit(62, 15, 121, 158, 255), [300, 0, 0], [0, 0, 0], map(), ON);
    s.send(2, 'Detonator', s.eye(2), [0, 0, 0]);
    expect(s.b.of('combat').map((e) => [e.status, e.request, e.reason])).toEqual([['rejected', 'throw', 'no claymore']]);
    expect(s.room.takeDrops()).toEqual({ 'throw: no claymore': 1 });
  });

  // INT.R5: a miss is the requester's only, even one that names the body it met -- the struck page would learn the
  // shooter's id, the round's direction and its distance. A launched round's direct hit (`directHit`) is the one path a
  // body-naming miss is reachable from: a bullet's ray stops at its Maximum_Range (`fire`'s reach), so its own
  // 'beyond range' (and a volley's) cannot meet a body past it.
  it.each([
    ['no damage', () => { HEAT_MOD.value = -20; }],                         // ImpactDamage 20 - 20 = 0: under the floor
    ['beyond range', () => { HEAT_REACH.value = 10; }],                     // the body 60 off, the reach 10
  ] as const)('a rocket\'s direct hit that misses (%s) is the shooter\'s only, never the body\'s it names', (reason, set) => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 145, 185, 255), [60, 0, 0], [0, 0, 0], map(), ON);
    set();
    try {
      s.hold(2, 'LAW'); s.drive(2, launcherRaiseSeconds(0) + 0.05);
      const from = s.eye(2), at = s.feet(1);
      const d: V3 = [at[0] - from[0], at[1] + 10 - from[1], at[2] - from[2]], l = Math.hypot(...d);
      s.send(2, 'LAW HEAT', from, [d[0] / l * 200, d[1] / l * 200, d[2] / l * 200]);
      s.run(1);
      expect(s.a.of('hurt')).toHaveLength(0);
      expect(s.b.of('combat').map((e) => [e.status, e.request, e.reason, e.target?.id])).toEqual([['miss', 'impact', reason, 1]]);
      expect(s.a.of('combat')).toEqual([]);                                 // the body named: told nothing
    } finally { HEAT_MOD.value = 0; HEAT_REACH.value = HEAT_REACH_BUILT; }
  });

  it("the LAW HEAT's reach is its record's again after the tests that shorten it", () => {
    expect(HEAT.maximumRange).toBe(HEAT_REACH_BUILT);
  });
});

/**
 * SVC-23b, research 169 §7 measure 5 (b), weak point 3: a launched round's and a set charge's start is measured from the
 * server's own body (`START_REACH_PLACEHOLDER`), not anywhere within 4 m of a fixed eye height.
 */
describe('SVC-23b measure 5 (b): a rocket and a charge start at the body', () => {
  it('a rocket starting 3.9 m above the eye is refused; from the eye it goes', () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 145, 185, 255), [560, 0, 0], [0, 0, 0]);
    s.hold(2, 'LAW'); s.drive(2, launcherRaiseSeconds(0) + 0.05);
    const eye = s.eye(2);
    s.send(2, 'LAW HEAT', [eye[0], eye[1] + 39, eye[2]], [200, 0, 0]);
    expect(s.a.of('grenade')).toHaveLength(0);
    s.send(2, 'LAW HEAT', eye, [200, 0, 0]);
    expect(s.a.of('grenade')).toHaveLength(1);
  });

  it('a claymore set 3 m out on open floor is refused (inside the 4 m slack); one under the hand is set down', () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [0, 0, 0]);
    s.send(2, 'Claymore', [30, 0, 0], [1, 0, 0]);
    expect(s.a.of('grenade')).toHaveLength(0);
    expect(s.room.player(2)!.grenades.Claymore).toBe(8);
    s.send(2, 'Claymore', [8, 0, 0], [1, 0, 0]);
    expect(s.a.of('grenade')).toHaveLength(1);
  });

  it('a claymore set through a full-height wall within reach is refused as walled (the review of 2026-10-04, mutant (c))', () => {
    const wall = { ...FLOOR, path: 'worldmodel/fullwall', ditype: 2, points: Float32Array.from([-50, 0, 5, 50, 0, 5, 50, 200, 5, -50, 200, 5]) };
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [0, 0, 0], map(false, [wall]));
    s.room.takeDrops();
    s.send(2, 'Claymore', [0, 0, 10], [0, 0, 1]);                         // 10 across, the wall at 5 between
    expect(s.a.of('grenade')).toHaveLength(0);
    expect(s.room.player(2)!.grenades.Claymore).toBe(8);
    expect(s.room.takeDrops()).toEqual({ 'throw: hand walled': 1 });
  });

  it('a claymore set on the floor just past a ledge\'s edge from the ledge is taken (the review of 2026-10-04, (e))', () => {
    // The page casts down from its hand, 8 ahead, past the edge (`grenade.ts` `placeCharge`): its charge rests on the
    // floor below. The line from the head straight to the charge meets the ledge's own top; the room tests the head's
    // line across to the point above the charge, then the drop to it -- the page's cast.
    const world = map(false, [slab(8, -600, -500, 500, 600)]);
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [-550, 8, 593], world);
    s.run(0.5);
    expect(s.feet(2)[1]).toBeCloseTo(8, 0);
    s.room.takeDrops();
    s.send(2, 'Claymore', [-550, 0, 601], [0, 0, 1]);
    expect(s.room.takeDrops()).toBeNull();
    expect(s.a.of('grenade')).toHaveLength(1);
  });

  it('a claymore on the far side of cover lower than the head but over the hand is refused (the re-review of 2026-10-04)', () => {
    // A wall 15 high at z 9, the claymore on the floor at z 12: the page's cast falls from its hand (feet + 8, + the lift)
    // and its reach across meets the wall -- the page cannot set it there, so the room does not take it.
    const wall = { ...FLOOR, path: 'worldmodel/lowwall', ditype: 2, points: Float32Array.from([-50, 0, 9, 50, 0, 9, 50, 15, 9, -50, 15, 9]) };
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [0, 0, 0], map(false, [wall]));
    s.room.takeDrops();
    s.send(2, 'Claymore', [0, 0, 12], [0, 0, 1]);
    expect(s.a.of('grenade')).toHaveLength(0);
    expect(s.room.player(2)!.grenades.Claymore).toBe(8);
    expect(s.room.takeDrops()).toEqual({ 'throw: hand walled': 1 });
  });

  // LATER 929 (H2 of the mines investigation of 2026-11-12): a placed charge the room refuses after the page set it down
  // and spent it -- here 'hand walled' -- is told to the placer (`stale`, request 'throw', its seq), as a rocket's
  // refusals are (LATER 503), so the page takes its drawn copy back and gives the charge back. Product track: the telling
  // only; the refusals' own rules are unchanged.
  it("RED: LATER 929 -- a claymore refused 'hand walled' is told to the placer (stale, request 'throw', its seq)", () => {
    const wall = { ...FLOOR, path: 'worldmodel/lowwall', ditype: 2, points: Float32Array.from([-50, 0, 9, 50, 0, 9, 50, 15, 9, -50, 15, 9]) };
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [0, 0, 0], map(false, [wall]));
    s.room.takeDrops();
    const seq = s.room.player(2)!.sim.seq;
    s.send(2, 'Claymore', [0, 0, 12], [0, 0, 1]);
    expect(s.room.takeDrops()).toEqual({ 'throw: hand walled': 1 });
    expect(s.b.of('stale')).toEqual([expect.objectContaining({ request: 'throw', seq })]);   // today: not told
  });

  it("LATER 929 -- a claymore past the four down is told (stale); an accepted one is not", () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [0, 0, 0]);
    for (let i = 0; i < 4; i++) s.send(2, 'Claymore', [0, 0, 6], [0, 0, 1]);
    expect(s.b.of('stale')).toEqual([]);
    expect(s.b.of('placed')).toHaveLength(4);
    s.room.takeDrops();
    const seq = s.room.player(2)!.sim.seq;
    s.send(2, 'Claymore', [0, 0, 6], [0, 0, 1]);
    expect(s.room.takeDrops()).toEqual({ 'throw: charges down': 1 });
    expect(s.b.of('stale')).toEqual([expect.objectContaining({ request: 'throw', seq })]);
  });

  it('a claymore dropped from a ledge onto the floor under a lower slab is refused (the drop leg, the re-review of 2026-10-04)', () => {
    // On a ledge 8 up (z 500..600); a slab 4 up beyond its edge (z 600..640); the claymore on the floor under that slab:
    // the reach across at the hand's height clears both, the drop to the charge meets the slab at 4.
    const world = map(false, [slab(8, -600, -500, 500, 600), slab(4, -600, -500, 600, 640)]);
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [-550, 8, 593], world);
    s.run(0.5);
    expect(s.feet(2)[1]).toBeCloseTo(8, 0);
    s.room.takeDrops();
    s.send(2, 'Claymore', [-550, 0, 601], [0, 0, 1]);
    expect(s.a.of('grenade')).toHaveLength(0);
    expect(s.room.takeDrops()).toEqual({ 'throw: hand walled': 1 });
  });

  it('a claymore under a low table, the hand reaching in under its edge, is taken (the re-review of 2026-10-04)', () => {
    // A table top 10 up over z 6..50: the page's hand (8, the cast from 9) is under it, so its cast finds the floor.
    const world = map(false, [slab(10, -50, 50, 6, 50)]);
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 153, 158), [300, 0, 300], [0, 0, 0], world);
    s.room.takeDrops();
    s.send(2, 'Claymore', [0, 0, 10], [0, 0, 1]);
    expect(s.room.takeDrops()).toBeNull();
    expect(s.a.of('grenade')).toHaveLength(1);
  });
});

// PAR-81 (research 230 section 5.2.6; PTW.R3 with walk.test's "PAR-81"): the launcher's raise (`FUN_005a6d30`) takes the
// launcher's anim set (`FUN_0058c350` D:L462105: `actor+0x528 = DAT_0044d408`) before the driver on its press's own frame
// (D:L418611 -> D:L494228 -> D:L476734 -> D:L461886), and `FUN_005b4340(actor, 0xb)` -- the jump's press gate
// (`FUN_00594cf0` D:L453211-453213) and `FUN_0057e1b0`'s (D:L440806) -- refuses under that set (D:L469466-469471). The
// set stays through the raise and the launcher up; the lower (`FUN_005a6b70`, the raise reversed in the set, D:L462069-462070)
// gives it back only at its own end (`FUN_00582540` D:L443058-443062 -> `FUN_005a60d0` D:L461769-461771), on the driver's
// end test after the jump's read: the 84th command from the rifle's clip, the 82nd from the pistol's (`playedOutCommand`).
// The room holds the set on the commands' seqs, from the `throw` event's (the last command the page sent).
describe("PAR-81: the launcher's anim set refuses the jump, from the raise to the lower's end (FUN_005b4340 D:L469466-469471)", () => {
  const LAW_KIT = kit(62, 15, 145, 185, 255);
  /** One command of player 2 standing still, the firearm `weapon` in hand, the jump pressed: whether its mover took a jump. */
  const jump = (s: ReturnType<typeof setup>, weapon: 0 | 1 = 0): boolean => {
    const p = s.room.player(2)!, before = p.sim.jumps;
    const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: Button.Jump, stance: 0, weapon };
    s.room.binary(2, encodeCommands({ viewTick: s.room.tick, commands: [cmd] }));
    s.room.step();
    return p.sim.jumps > before;
  };
  /** `n` commands of player 2 standing still with `weapon` in hand (`swap`: the swap pressed on the first). */
  const step = (s: ReturnType<typeof setup>, n: number, weapon: 0 | 1 = 0, swap = false): void => {
    const p = s.room.player(2)!;
    for (let i = 0; i < n; i++) {
      const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: swap && i === 0 ? Button.Swap : 0, stance: 0, weapon };
      s.room.binary(2, encodeCommands({ viewTick: s.room.tick, commands: [cmd] }));
      s.room.step();
    }
  };

  it("refused on the raise's own command (the event's seq + 1) and on every command while the launcher is up; taken before the raise (the control)", () => {
    const s = setup(kit(62, 15, 121, 126, 255), LAW_KIT, [0, 0, 500], [0, 0, 0]);
    const p = s.room.player(2)!;
    step(s, 30);
    expect(jump(s)).toBe(true);                                             // the control: no launcher, the jump taken
    step(s, 120);                                                           // landed, its lock run out
    s.hold(2, 'LAW');                                                       // the raise, at the last command run
    const e = p.sim.seq;
    expect(jump(s)).toBe(false);                                            // e + 1: the raise pushed before the driver
    expect(p.sim.seq).toBe(e + 1);
    step(s, 40);
    expect(jump(s)).toBe(false);                                            // mid-raise
    step(s, 60);
    expect(jump(s)).toBe(false);                                            // the raise over, the launcher up
    step(s, 300);
    expect(jump(s)).toBe(false);                                            // still up: the set stays
  });

  it("the lower to the rifle: refused through its end's own command (the 84th, its seq + 84), taken on the next; to the pistol through the 82nd", () => {
    for (const [from, end] of [[0, 84], [1, 82]] as const) {
      const s = setup(kit(62, 15, 121, 126, 255), LAW_KIT, [0, 0, 500], [0, 0, 0]);
      const p = s.room.player(2)!;
      step(s, Math.round(2 * TICK_HZ), from, from === 1);                    // the swap to the pistol played out
      expect(p.sim.weapon).toBe(from);
      s.hold(2, 'LAW');
      step(s, 120, from);
      s.hold(2, p.records[from].name);                                      // the lower: the raise's clip reversed
      const l = p.sim.seq;
      step(s, end - 1, from);
      expect(jump(s, from), `from ${from}: its end's own command`).toBe(false);
      expect(p.sim.seq).toBe(l + end);
      expect(jump(s, from), `from ${from}: the next`).toBe(true);
    }
  });

  it('a raise the room refuses (no LAW in the kit) holds no set: the jump taken', () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 121, 185, 255), [0, 0, 500], [0, 0, 0]);
    step(s, 30);
    s.hold(2, 'LAW');
    expect(jump(s)).toBe(true);
  });
});

// PAR-83 (research 230 section 5.2.8; PTW.R3 with walk.test's and matchThrow.test's "PAR-83"): with the launcher's set on
// (`actor+0x528 = DAT_0044d408`) and its base (type 0x12, a looped top: the branch asks it) on top -- the raise popped at
// its own end, the 84th command from the rifle's clip, the 82nd from the pistol's (PAR-81) -- the ground driver's looped branch
// (`FUN_00550ef0` D:L418263-418278) lowers it when a move axis (`+0x240` / `+0x244`, never the turn `+0x23c`) is past 0.1
// and `FUN_005a7ab0` does not answer: the set given back at once (`FUN_0058c4a0` D:L418270), the firearm in the hand and
// the kit (D:L418269-418277), the moving lower on the second channel (`FUN_005a64c0(actor, 4, item, 0)` D:L418278 ->
// `FUN_005a6b70` D:L462073 / D:L462082). The jump is read earlier in that frame (D:L418119-418150, and the press gate
// before the driver), so it is refused on the stick's own command and taken on the next. The room decides it from the
// command's own stick, as the page does; no event carries it.
describe("PAR-83: the launcher's stick lower (FUN_00550ef0 D:L418263-418278)", () => {
  const LAW_KIT = kit(62, 15, 145, 185, 255);
  /** One command of player 2 (standing still, the rifle, unless `over` says); whether its mover took a jump on it. */
  const cmd = (s: ReturnType<typeof setup>, over: Partial<Command> = {}): boolean => {
    const p = s.room.player(2)!, before = p.sim.jumps;
    const c: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0, ...over };
    s.room.binary(2, encodeCommands({ viewTick: s.room.tick, commands: [c] }));
    s.room.step();
    return p.sim.jumps > before;
  };
  const steps = (s: ReturnType<typeof setup>, n: number, over: Partial<Command> = {}): void => { for (let i = 0; i < n; i++) cmd(s, over); };
  /** Player 2 with the firearm `from` in hand (the swap to the pistol played out first), the LAW raised at the event `e`. */
  const raised = (from: 0 | 1 = 0) => {
    const s = setup(kit(62, 15, 121, 126, 255), LAW_KIT, [0, 0, 500], [0, 0, 0]);
    const p = s.room.player(2)!;
    cmd(s, { weapon: from, buttons: from === 1 ? Button.Swap : 0 });
    steps(s, Math.round(2 * TICK_HZ), { weapon: from });
    expect(p.sim.weapon).toBe(from);
    s.hold(2, 'LAW');
    const e = p.sim.seq;
    cmd(s, { weapon: from });                                              // NU-6 F1: the item comes with the raise's clip, on e + 1
    expect(held(p)).toBe(145);
    return { s, p, e };
  };
  /** The private side of the player the tests read (`Player.launcherSet`, `Player.firearmReadyAt`). */
  const set = (p: unknown): { start: number; until: number } | null => (p as { readonly launcherSet: { start: number; until: number } | null }).launcherSet;
  const held = (p: unknown): number | null => (p as { readonly held: number | null }).held;
  const readyAt = (p: unknown): number => (p as { readonly firearmReadyAt: number }).firearmReadyAt;

  // LATER 504: the stick's lower gives the set back and writes the request 0 (D:L418268-418272): the room's kneeling
  // mover stands on the next command, as the page's -- the port's frame order (the original pushes it in that frame, D:L418270).
  it("LATER 504: the stick's lower stands the room's kneeling mover on the next command", () => {
    const { s, p } = raised(0);
    steps(s, 120);
    expect(p.sim.walker.stance).toBe('crouch');
    cmd(s, { forward: 1 });                                                 // the stick's own command: the set given back
    cmd(s, { forward: 1 });
    expect(p.sim.walker.stance).toBe('stand');
  });

  it("a stick past 0.1 lowers it on its own command: the set given back there (the jump on it refused), the jump taken on the next; the firearm fires after the moving lower (87 commands from the rifle, 86 from the pistol)", () => {
    for (const [from, ready] of [[0, 87], [1, 86]] as const) {
      const { s, p, e } = raised(from);
      steps(s, 120, { weapon: from });                                       // the raise over: its base on top
      expect(held(p), `from ${from}: still up`).toBe(145);
      const u = p.sim.seq + 1;
      expect(cmd(s, { forward: 1, weapon: from, buttons: Button.Jump }), `from ${from}: the stick's own command`).toBe(false);
      expect(p.sim.seq).toBe(u);
      expect(held(p), `from ${from}`).toBeNull();
      expect(set(p), `from ${from}`).toEqual({ start: e + 1, until: u });
      expect(readyAt(p) - p.ran, `from ${from}: seal_mv_*2launcher on the second channel`).toBe(ready);
      expect(cmd(s, { forward: 1, weapon: from, buttons: Button.Jump }), `from ${from}: the next`).toBe(true);
    }
  });

  it("the stick held from the raise does not cut it (NoInterrupt bare): lowered on the command after the raise's end, e + 85 from the rifle, e + 83 from the pistol", () => {
    for (const [from, end] of [[0, 84], [1, 82]] as const) {
      const { s, p, e } = raised(from);
      // NU-6 (N3 of the re-review): `raised()` runs e + 1 with the stick at rest (the raise's item comes with its clip
      // there), so the stick here is held from e + 2.
      while (p.sim.seq < e + end) {
        cmd(s, { forward: 0.3, weapon: from });
        expect(held(p), `from ${from}: command ${p.sim.seq - e} of the raise`).toBe(145);
      }
      cmd(s, { forward: 0.3, weapon: from });
      expect(p.sim.seq).toBe(e + end + 1);
      expect(held(p), `from ${from}: the base's first command`).toBeNull();
      expect(set(p)?.until, `from ${from}`).toBe(e + end + 1);
    }
  });

  it('the turn alone does not lower it, nor a move axis at 0.1 or under (12/127 on the wire); either axis past it (13/127) does', () => {
    const { s, p } = raised();
    steps(s, 120);
    for (let i = 0; i < 30; i++) cmd(s, { yaw: p.sim.walker.state.yaw + 3 });
    expect(p.sim.walker.turn).not.toBe(0);
    steps(s, 10, { forward: 12 / 127, right: -12 / 127 });
    expect(held(p)).toBe(145);
    cmd(s, { right: -13 / 127 });
    expect(held(p)).toBeNull();
  });

  it("the page's lower arriving after the stick's is not laid twice: the set stays given back on the stick's command, the firearm's clock the moving lower's", () => {
    const { s, p } = raised();
    steps(s, 120);
    cmd(s, { forward: 1 });
    const u = p.sim.seq, ready = readyAt(p);
    s.hold(2, p.records[0].name);
    expect(set(p)?.until).toBe(u);
    expect(readyAt(p)).toBe(ready);
  });

  it("a stick lower inside a dropped backlog is laid on its own command, as the page ran it (the room's mover runs none of the drop's sticks)", () => {
    const { s, p } = raised();
    steps(s, 120);
    for (let i = 0; i < 20; i++) s.room.step();                             // a stall: the room's ticks, none of this player's
    const from = p.sim.seq + 1;
    const cmds = Array.from({ length: 14 }, (_, i): Command => ({ seq: from + i, forward: i === 1 ? 1 : 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 }));
    s.room.binary(2, encodeCommands({ viewTick: s.room.tick, commands: cmds }));
    (s.room as unknown as { dropBacklog(q: typeof p): void }).dropBacklog(p);
    expect(held(p)).toBeNull();
    expect(set(p)?.until).toBe(from + 1);
  });

  // F3 of PAR-81's review: a firearm taken with the launcher still in the hand is `FUN_005a64c0(actor, 4, firearm, 0)` ->
  // `FUN_005a6b70`, the lower in the set (the raise's clip reversed by the firearm taken, D:L462069-462082): the set goes
  // at its end, never at once. Unreachable from the page today (`kit.select`'s caller lowers first).
  it("F3: the mover's swap with the launcher still up lowers it to the firearm taken: the set given back at that clip's end (the swap's seq - 1 + 82 to the pistol)", () => {
    const { s, p } = raised();
    steps(s, 120);
    cmd(s, { buttons: Button.Swap, weapon: 1 });
    const w = p.sim.seq;
    expect(p.sim.weapon).toBe(1);
    expect(held(p)).toBeNull();
    expect(set(p)?.until).toBe(w - 1 + 82);
  });

  // F1 of PAR-83's review (research 230 section 5.2.8): the stick's moving lower refuses the take while it lives -- a slot's
  // take (the launcher's among them) and the swap both ask `FUN_005a8cb0` (D:L453289-453310, D:L72691), which asks
  // `FUN_005a7de0(actor, 1, 1)` (D:L463159), which refuses while `FUN_005a7980(actor, 1)` answers (D:L462636-462638): the
  // second channel holding `DAT_003df0f0` / `DAT_003df0f8` (D:L462492-462499). Its life on the commands' clock is the
  // firearm's (`firearmReadyAt`): 87 commands from the rifle, 86 from the pistol, counted from the stick's command u -- a
  // raise or a swap riding u + 1 .. u + life - 1 refused, riding u + life taken, as the page's `WalkMode.swapGate` refuses
  // it (walk.test's "F1"). A raise rides the command after its event's seq.
  it("F1: a raise arriving inside the stick's moving lower is refused, riding the life's end taken (87 commands from the rifle, 86 from the pistol)", () => {
    for (const [from, life] of [[0, 87], [1, 86]] as const) {
      const { s, p } = raised(from);
      steps(s, 120, { weapon: from });
      cmd(s, { forward: 1, weapon: from });
      const u = p.sim.seq;
      expect(held(p), `from ${from}: the stick's lower`).toBeNull();
      while (p.sim.seq + 1 < u + life) {
        s.hold(2, 'LAW');                                                     // rides p.sim.seq + 1
        expect(held(p), `from ${from}: riding u + ${p.sim.seq + 1 - u}`).toBeNull();
        expect(set(p)?.until, `from ${from}: the set stays given back`).toBe(u);
        cmd(s, { weapon: from });
      }
      expect(p.sim.seq + 1).toBe(u + life);
      s.hold(2, 'LAW');
      cmd(s, { weapon: from });                                              // NU-6 F1: u + life run, the raise's item with its clip
      expect(held(p), `from ${from}: riding u + ${life}`).toBe(145);
      expect(set(p)?.start, `from ${from}`).toBe(u + life);
    }
  });

  it("F1: a swap inside the stick's moving lower is refused (the same FUN_005a8cb0), taken on the command its life ends", () => {
    for (const [from, life] of [[0, 87], [1, 86]] as const) {
      const { s, p } = raised(from);
      steps(s, 120, { weapon: from });
      cmd(s, { forward: 1, weapon: from });
      const u = p.sim.seq, to = from === 0 ? 1 : 0;
      steps(s, life - 2, { weapon: from });
      cmd(s, { buttons: Button.Swap, weapon: to });                            // rides u + life - 1
      expect(p.sim.seq).toBe(u + life - 1);
      expect(p.sim.weapon, `from ${from}: inside the life`).toBe(from);
      cmd(s, { buttons: Button.Swap, weapon: to });                            // rides u + life
      expect(p.sim.weapon, `from ${from}: the life's end`).toBe(to);
    }
  });

  // The reviewer's order: the page lowers by the stick on u (no event), takes the launcher again, and its `throw` arrives
  // before the room has run u -- `held(p)` still on, so the raise found the launcher up and did nothing, then u lowered it:
  // the room down while the page had it up. The page refuses a take inside the life (walk.test's "F1"); one riding its
  // end is the room's to take once u has lowered it, so the room and the page agree on every order.
  it("F1, the reviewer's order: the raise applied before the stick's command runs -- inside the life refused (down, as the page), riding its end taken once that command lowers it (up, as the page)", () => {
    for (const [from, life] of [[0, 87], [1, 86]] as const) {
      for (const late of [false, true]) {
        const { s, p } = raised(from);
        steps(s, 120, { weapon: from });
        const u = p.sim.seq + 1;                                               // the stick's command
        const e = late ? u + life - 1 : u + life - 2;                          // the raise rides e + 1
        const yaw = p.sim.walker.state.yaw;
        const cmds = Array.from({ length: e - u + 1 }, (_, i): Command => ({ seq: u + i, forward: i === 0 ? 1 : 0, right: 0, yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: from }));
        for (let i = 0; i < cmds.length; i += 16) s.room.binary(2, encodeCommands({ viewTick: s.room.tick, commands: cmds.slice(i, i + 16) }));
        s.room.text(2, { type: 'throw', seq: e, kind: 'LAW', from: s.eye(2), velocity: [0, 0, 0] });
        expect(p.sim.seq, `from ${from}: applied before u runs`).toBe(u - 1);
        expect(held(p)).toBe(145);
        for (let i = 0; i < 600 && p.sim.seq < e; i++) s.room.step();
        expect(p.sim.seq).toBe(e);
        // NU-6 F1: the raise's item is taken with its clip on e + 1 (`Player.heldNext`), so the command e + 1 is run
        // before the item is read; the order is the same -- the raise arrived before u, found the launcher up and waited
        // on u's stick lower (`raiseAfterStick`), which refused it inside the life and took it riding its end.
        s.room.binary(2, encodeCommands({ viewTick: s.room.tick, commands: [{ seq: e + 1, forward: 0, right: 0, yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: from }] }));
        s.room.step();
        expect(p.sim.seq).toBe(e + 1);
        if (late) {
          expect(held(p), `from ${from}: riding u + ${life}, taken`).toBe(145);
          expect(set(p)?.start, `from ${from}`).toBe(e + 1);
        } else {
          expect(held(p), `from ${from}: riding u + ${life - 1}, refused`).toBeNull();
          expect(set(p)?.until, `from ${from}`).toBe(u);
        }
      }
    }
  });
});

// PAR-84 (research 230 section 5.2.10, build step 5; PTW.R3 with walk.test's "PAR-84"): the raise (`FUN_005a6d30` pushes
// `Rifle -> Launcher` / `Pistol -> Launcher`, D:L462112-462116) and the still lower (the same type reversed, `FUN_005a6b70`
// D:L462069-462070, D:L462078-462079) are full-body one-shots on the stack, `NoInterrupt` bare: no ground state runs under
// them (`FUN_00550ef0` D:L418171-418203) and the stick never cuts them, so the SEAL stands, moved by the clip's root alone,
// from the clip's own command (the `throw` event's seq + 1) until the driver's end test takes it off on the 84th (rifle)
// / 82nd (pistol) command, where the ground state runs again. While either is on top `FUN_005a7980` answers
// (D:L462484-462491), so every take is refused (`FUN_005a8cb0` D:L463159): no lower begins under the raise and no raise
// under the still lower. The body carries the clip to the others as the action's code (`ACTION_CODES` 21 / 22, the lower
// with `BodyFlag.ActionReversed`), as the original's push carries the type and its reverse.
describe("PAR-84: the room's body held through the launcher's raise and still lower (FUN_00550ef0 D:L418171-418203)", () => {
  const LAW_KIT = kit(62, 15, 145, 185, 255);
  const cmd = (s: ReturnType<typeof setup>, over: Partial<Command> = {}): void => {
    const p = s.room.player(2)!;
    const c: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0, ...over };
    s.room.binary(2, encodeCommands({ viewTick: s.room.tick, commands: [c] }));
    s.room.step();
  };
  const steps = (s: ReturnType<typeof setup>, n: number, over: Partial<Command> = {}): void => { for (let i = 0; i < n; i++) cmd(s, over); };
  const held = (p: unknown): number | null => (p as { readonly held: number | null }).held;
  /** NU-6 F1: the item waiting for its clip's command (`Player.heldNext`). */
  const heldNext = (p: unknown): { item: number | null; seq: number } | null => (p as { readonly heldNext: { item: number | null; seq: number } | null }).heldNext;
  const set = (p: unknown): { start: number; until: number } | null => (p as { readonly launcherSet: { start: number; until: number } | null }).launcherSet;
  const body = (s: ReturnType<typeof setup>): { action: number; flags: number } =>
    (s.room as unknown as { body(p: unknown): { action: number; flags: number } }).body(s.room.player(2));
  const drops = (s: ReturnType<typeof setup>, key: string): number => (s.room as unknown as { drops: Map<string, number> }).drops.get(key) ?? 0;
  /** Player 2 at rest with the firearm `from` in hand (the swap to the pistol played out first). */
  const ready = (from: 0 | 1 = 0) => {
    const s = setup(kit(62, 15, 121, 126, 255), LAW_KIT, [0, 0, 500], [0, 0, 0]);
    const p = s.room.player(2)!;
    cmd(s, { weapon: from, buttons: from === 1 ? Button.Swap : 0 });
    steps(s, Math.round(2 * TICK_HZ), { weapon: from });
    expect(p.sim.weapon).toBe(from);
    return { s, p };
  };
  const CLIPS = [[0, 84, 21], [1, 82, 22]] as const;

  it("the raise: a stick held from e + 1 moves the body only by the clip's root through e + 83 (rifle) / e + 81 (pistol), the body carrying the code; off on e + 84 / e + 82 (the ground state again)", () => {
    for (const [from, end, code] of CLIPS) {
      const { s, p } = ready(from);
      s.hold(2, 'LAW');
      const e = p.sim.seq, w = p.sim.walker, x0 = w.state.x, z0 = w.state.z;
      expect(heldNext(p)).toMatchObject({ item: 145, seq: e + 1 });             // NU-6 F1: taken on e + 1, with the clip
      while (p.sim.seq < e + end - 1) {
        cmd(s, { forward: 1, weapon: from });
        const k = p.sim.seq - e;
        expect(held(p), `from ${from}: command e + ${k}`).toBe(145);
        expect(w.action?.name, `from ${from}: command e + ${k}`).toBe(from === 1 ? 'pistolToLauncher' : 'rifleToLauncher');
        expect(w.ground.state, `from ${from}: command e + ${k}`).toBe('idle');
        expect(body(s).action, `from ${from}: command e + ${k}`).toBe(code);
        expect(body(s).flags & BodyFlag.ActionReversed).toBe(0);
      }
      // The root's own path (no pack here: its mean travel, 2.9 units over the clip), never the walk's ~1.4 s at a run.
      expect(Math.hypot(w.state.x - x0, w.state.z - z0), `from ${from}`).toBeLessThan(3.5);
      cmd(s, { forward: 1, weapon: from });
      expect(p.sim.seq).toBe(e + end);
      expect(w.action, `from ${from}: off on its own end`).toBeNull();
      expect(body(s).action).toBe(0);
    }
  });

  it('the still lower: the same, reversed (BodyFlag.ActionReversed), from l + 1 to its end on l + 84 / l + 82', () => {
    for (const [from, end, code] of CLIPS) {
      const { s, p } = ready(from);
      s.hold(2, 'LAW');
      steps(s, 120, { weapon: from });                                     // the raise over, the stick at rest
      const w = p.sim.walker;
      expect(w.action).toBeNull();
      s.hold(2, p.records[from].name);                                     // the lower
      const l = p.sim.seq, x0 = w.state.x, z0 = w.state.z;
      expect(heldNext(p)).toEqual({ item: null, seq: l + 1 });            // NU-6 F1: let go on l + 1, with the clip
      while (p.sim.seq < l + end - 1) {
        cmd(s, { forward: 1, weapon: from });
        expect(held(p), `from ${from}: command l + ${p.sim.seq - l}`).toBeNull();
        expect(w.action, `from ${from}: command l + ${p.sim.seq - l}`).toMatchObject({ name: from === 1 ? 'pistolToLauncher' : 'rifleToLauncher', reversed: true });
        expect(w.ground.state).toBe('idle');
        expect(body(s).action).toBe(code);
        expect(body(s).flags & BodyFlag.ActionReversed).not.toBe(0);
      }
      expect(Math.hypot(w.state.x - x0, w.state.z - z0), `from ${from}`).toBeLessThan(3.5);
      cmd(s, { forward: 1, weapon: from });
      expect(w.action, `from ${from}: off on l + ${end}`).toBeNull();
      expect(set(p)?.until).toBe(l + end);                                 // PAR-81's set given back on the same command
    }
  });

  it("a lower riding inside the raise is refused ('throw: launcher clip'), the launcher kept up; one riding past its end taken -- and a raise inside the still lower the same", () => {
    for (const [from, end] of CLIPS) {
      const { s, p } = ready(from);
      s.hold(2, 'LAW');
      const e = p.sim.seq;
      steps(s, end - 1, { weapon: from });
      expect(p.sim.seq + 1).toBe(e + end);                                 // a lower now rides the raise's last command
      s.hold(2, p.records[from].name);
      cmd(s, { weapon: from });                                            // NU-6 F1: its command run (e + end) before the item is read
      expect(held(p), `from ${from}: refused inside the raise`).toBe(145);
      expect(set(p)).toEqual({ start: e + 1, until: Infinity });
      expect(drops(s, 'throw: launcher clip')).toBe(1);
      s.hold(2, p.records[from].name);                                     // rides e + end + 1: taken
      const l = p.sim.seq;
      cmd(s, { weapon: from });                                            // NU-6 F1: l + 1, the still lower's clip and the item
      expect(held(p), `from ${from}: taken past the raise`).toBeNull();
      steps(s, end - 2, { weapon: from });
      s.hold(2, 'LAW');                                                     // rides l + end: inside the still lower
      cmd(s, { weapon: from });                                            // NU-6 F1: l + end run before the item is read
      expect(held(p), `from ${from}: a raise inside the still lower`).toBeNull();
      expect(drops(s, 'throw: launcher clip')).toBe(2);
      s.hold(2, 'LAW');                                                     // rides l + end + 1
      cmd(s, { weapon: from });                                            // NU-6 F1: the item is taken with its clip, on the event's seq + 1
      expect(held(p), `from ${from}: a raise past it`).toBe(145);
    }
  });

  it("a raise whose clip's command is dropped with a backlog (no press on it) starts on the next command run, its clock caught up", () => {
    const { s, p } = ready(0);
    s.hold(2, 'LAW');
    const e = p.sim.seq;
    for (let i = 0; i < 20; i++) s.room.step();                             // a stall: the room's ticks, none of this player's
    const cmds = Array.from({ length: 14 }, (_, i): Command => ({ seq: e + 1 + i, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 }));
    s.room.binary(2, encodeCommands({ viewTick: s.room.tick, commands: cmds }));
    (s.room as unknown as { dropBacklog(q: typeof p): void }).dropBacklog(p);
    expect(p.sim.seq).toBe(e + 13);
    s.room.step();                                                          // the kept command, e + 14
    expect(p.sim.seq).toBe(e + 14);
    expect(p.sim.walker.action?.name).toBe('rifleToLauncher');
    expect(p.sim.walker.action!.t).toBeCloseTo(14 / TICK_HZ, 6);            // as if started on e + 1
  });

  // F1 of PAR-84's review (2026-10-14): the room's refusal follows the walker's action, as the page's `swapGate` does
  // (`Walker.swapping`) -- a clip a knock took off the body refuses no take after it, where the seqs' window alone still
  // ran to the clip's 84th command. A kept clip whose command has not run yet is refused on the seqs. The knock is the
  // room's own path (`layKnock` -> `applyKnock`, `FUN_0057e770`): `Fall forward`, its landing and get-up replace the clip.
  it("F1: a knock at e + 5 takes the raise off -- a lower riding e + 70 is taken; inside an unknocked raise refused; the still lower the same", () => {
    const knock = (s: ReturnType<typeof setup>, p: unknown): void => {
      (s.room as unknown as { layKnock(q: unknown, k: unknown): unknown }).layKnock(p, { velocity: [0, 30, 0], fall: 'fallForward' });
    };
    for (const knocked of [true, false]) {
      // The raise.
      const { s, p } = ready(0);
      s.hold(2, 'LAW');
      const e = p.sim.seq;
      steps(s, 5);
      if (knocked) knock(s, p);
      steps(s, 1);
      expect(p.sim.walker.action?.name ?? null, `knocked ${knocked}`).toBe(knocked ? 'fallForward' : 'rifleToLauncher');
      steps(s, e + 69 - p.sim.seq);
      expect(p.sim.seq + 1).toBe(e + 70);
      s.hold(2, p.records[0].name);                                         // rides e + 70
      steps(s, 1);                                                          // NU-6 F1: the item is taken with its clip, on the event's seq + 1
      expect(held(p), `knocked ${knocked}: a lower riding e + 70`).toBe(knocked ? null : 145);
      expect(drops(s, 'throw: launcher clip'), `knocked ${knocked}`).toBe(knocked ? 0 : 1);
    }
    for (const knocked of [true, false]) {
      // The still lower.
      const { s, p } = ready(0);
      s.hold(2, 'LAW');
      steps(s, 120);
      s.hold(2, p.records[0].name);
      const l = p.sim.seq;
      steps(s, 5);
      if (knocked) knock(s, p);
      steps(s, l + 69 - p.sim.seq);
      s.hold(2, 'LAW');                                                     // rides l + 70
      steps(s, 1);                                                          // NU-6 F1: the item is taken with its clip, on the event's seq + 1
      expect(held(p), `knocked ${knocked}: a raise riding l + 70`).toBe(knocked ? 145 : null);
      expect(drops(s, 'throw: launcher clip'), `knocked ${knocked}`).toBe(knocked ? 0 : 1);
    }
  });
});

/**
 * PAR-96 B5 (research 256 §8.4): the claymore's four, room and page on the same command -- the page's `GrenadeThrower` on
 * the room's own body (`moverSnapshot` of the room's walker, the room's grid), its placings sent as `matchThrow.ts` sends
 * them (the `place` event's item, point and facing), as `roomNetCap.test.ts`'s bridge. `FUN_003cc1f0` counts the owner's
 * claymores only (`+0xc5`, D:L474101), asked by the claymore's and the PMN's fire (D:L475306-475369).
 */
describe("PAR-96 bridged: the page predicts the room's claymore count (research 256 §8.4 B5)", () => {
  function bridge() {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 153, 158, 158), [300, 0, 300], [0, 0, 0]);
    const body = s.room.player(2)!;
    const src = { grid: () => s.room.map.grid, snapshot: () => moverSnapshot(body.sim.walker, null, 0, 0), view: () => 'third' as const, actors: () => [] };
    const g = new GrenadeThrower(src as GrenadeSource);
    g.setRecords([CLAYMORE, PMN]);
    g.setKit(['Claymore', 'PMN Mine', 'PMN Mine']);
    const sent: string[] = [], refused: string[] = [];
    g.on('place', (e) => {
      sent.push(e.item);
      s.room.text(2, { type: 'throw', seq: body.sim.seq, kind: e.item, from: [...e.pos], velocity: [...e.facing] });
    });
    g.on('refuse', (r) => refused.push(r.text));
    const place = (item: 'Claymore' | 'PMN Mine'): void => {
      g.select(item);
      g.pull();
      for (let i = 0; i < 180; i++) g.update(1 / 60);
    };
    return { ...s, g, sent, refused, place };
  }

  it('a claymore with four PMNs down: the page places it and the room takes it', () => {
    const s = bridge();
    for (let i = 0; i < 4; i++) s.place('PMN Mine');
    s.place('Claymore');
    expect(s.refused).toEqual([]);
    expect(s.sent).toEqual(['PMN Mine', 'PMN Mine', 'PMN Mine', 'PMN Mine', 'Claymore']);
    expect(s.b.of('placed').map((e) => e.kind)).toEqual(s.sent);
    expect(s.room.takeDrops()).toBeNull();
  });

  it('a PMN with four claymores down: the page refuses it with the message; the same PMN sent the room is refused (`charges down`)', () => {
    const s = bridge();
    for (let i = 0; i < 4; i++) s.place('Claymore');
    expect(s.sent).toEqual(['Claymore', 'Claymore', 'Claymore', 'Claymore']);
    s.place('PMN Mine');
    expect(s.sent).toHaveLength(4);
    expect(s.refused).toEqual([CLAYMORE_RULES.maxPlacedMessage]);
    expect(s.room.takeDrops()).toBeNull();
    s.send(2, 'PMN Mine', [8, 0, 6], [1, 0, 0]);
    expect(s.b.of('placed')).toHaveLength(4);
    expect(s.room.takeDrops()).toEqual({ 'throw: charges down': 1 });
  });
});

/**
 * AD-5 in the room (research 209 s13-s14): `GetDamage`'s own factor on the scene's destructibles, after x14 -- the
 * claymore's 1/32 outside its cone (D:L318769-318782), the backblast's 0 outside its (D:L318784-318830). Was: outside
 * either cone the destructible was not reached at all.
 */
describe("AD-5: the claymore's 32nd and the backblast's 0 outside their cones reach the scene", () => {
  const LAW_KIT = kit(62, 15, 145, 185, 255);

  it('a claymore facing away from a shield-0 wall (health 1) still opens it: 16 x 14 / 32 = 7 at its midpoint, 32 u off (was: no reach, it stood)', () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 121, 153, 255), [600, 0, 0], [0, 0, 292], barrierMap(0, FLOOR.material, [], 24));
    s.send(2, 'Claymore', [0, 0, 300], [0, 0, -1]);                       // facing away from the wall at z 330
    expect(s.room.player(2)!.grenades.Claymore).toBe(3);
    s.room.player(2)!.sim.walker.place(-100, 20, 300);
    s.run(0.5);
    s.send(2, 'Detonator', s.eye(2), [0, 0, 0]);
    expect(s.a.of('grenade').at(-1)).toMatchObject({ id: 2, kind: 'Detonator' });
    s.run(0.1);
    expect(s.room.world.isActive(BARRIER)).toBe(false);
  });

  it("a backblast beside a health-0 wall (outside its cone, 30 u off) deals it 0 and still runs its death, as any qualifying hit does (FUN_00273a50 D:L120980); a health-1 wall stands (was: no reach, both stood)", () => {
    const fire = (health: number): boolean => {
      const s = setup(kit(62, 15, 121, 126, 255), LAW_KIT, [600, 0, -300], [0, 0, 300], barrierMap(0, FLOOR.material, [], 24, health));
      s.hold(2, 'LAW'); s.drive(2, launcherRaiseSeconds(0) + 0.05);
      s.send(2, 'LAW HEAT', s.eye(2), [200 * Math.cos(0.3), 200 * Math.sin(0.3), 0]);   // east and up: the wall to the north
      s.run(0.2);
      expect(s.a.of('grenade').filter((g) => g.kind === 'LAW HEAT')).toHaveLength(1);
      return s.room.world.isActive(BARRIER);
    };
    expect(fire(0)).toBe(false);
    expect(fire(1)).toBe(true);
  });
});

/**
 * OT.R59 (RECONNECT-GHOST; the gameplay seat's condition 4 (b)): `RECONNECT_HELD_LAUNCHER_ADAPTATION` -- a seat resumed
 * with its launcher raised at the drop comes back lowered, at once (`Room.handBack`, as a spawn's kit lowers it): the
 * room's `held` null, the resume's `held` null, and its first round is the firearm's (no 'fire: launcher').
 */
describe('OT.R59 (RECONNECT-GHOST, condition 4 (b)): a resumed seat\'s raised launcher comes back lowered', () => {
  it('the LAW raised at the drop: held null in the room and in the resume, the first round the firearm\'s', () => {
    expect(RECONNECT_HELD_LAUNCHER_ADAPTATION).toBe("a resumed seat's raised launcher comes back lowered, on the room and the page alike");
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 145, 185, 255), [560, 0, 0], [0, 0, 0]);
    (s.room as unknown as { accounts: Map<number, number | null> }).accounts.set(2, 102);   // seated as an account's (the bridge's)
    s.hold(2, 'LAW'); s.drive(2, launcherRaiseSeconds(0) + 0.05);
    const inside = () => (s.room as unknown as { players: Map<number, { held: number | null }> }).players.get(2)!;
    expect(inside().held).toBe(145);
    const back = new Client();
    (s.room.hello as (id: number, c: Conn, ev: Extract<ClientEvent, { type: 'hello' }>, address: string, as: Record<string, unknown>) => boolean)(
      3, back, { type: 'hello', version: PROTOCOL_VERSION, name: 'P2', map: 'MP99', session: tok(2) }, '', { account: 102 });
    expect((s.room as unknown as { lastResumed?: number | null }).lastResumed).toBe(2);
    const resume = back.of('resume' as ServerEvent['type'])[0] as unknown as { held: number | null } | undefined;
    expect(resume?.held).toBeNull();
    expect(inside().held).toBeNull();
    s.drive(2, 0.2);
    s.room.takeDrops();
    s.shoot(2);
    s.drive(2, 0.05);
    expect(s.room.takeDrops()?.['fire: launcher']).toBeUndefined();
    expect(s.a.of('shot').some((e) => e.id === 2)).toBe(true);
  });
});

describe("LATER 181: the slot's last hand grenade arms no firearm reload (THROW_LAST_GRENADE_RELOAD_READING, research 326 s7)", () => {
  it("every M67 thrown, the last taking the slot to 0: the rifle's lock and magazine untouched, no reloadSound told (the original's arm refused under the throw, FUN_005a7d10 D:L477397)", () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 121, 126, 151), [560, 0, 0], [0, 0, 0]);
    const p = s.room.player(2)!;
    const n = p.grenades.M67!, lock = [...p.reloadUntil], rounds = p.mags[0].rounds();
    expect(n, 'the pouch holds M67s').toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      p.sim.walker.place(0, 20, 0);
      s.drive(2, 0.5);
      s.send(2, 'M67', s.eye(2), [0, 0, 0]);
      s.drive(2, 0.1);
      p.sim.walker.place(0, 20, -600);                               // clear of its own blast
      s.drive(2, 4);
    }
    expect(p.grenades.M67, 'the slot spent').toBe(0);
    expect(p.alive).toBe(true);
    expect([...p.reloadUntil], 'no lock armed').toEqual(lock);
    expect(p.mags[0].rounds(), "the rifle's magazine as it was").toBe(rounds);
    expect(s.a.of('reloadSound').filter((e) => e.id === 2), 'no reload heard').toHaveLength(0);
  });
});

const LEAN_MP2 = fixture('RUN/MP2.ZDB'), LEAN_PACK = fixture('RUN/MOTION_P.ZAR'), LEAN_READERC = fixture('RUN/READERC.ZAR');
const LEAN_DISC = !!(LEAN_MP2 && LEAN_PACK && LEAN_READERC);
describe.skipIf(!LEAN_DISC)(`LATER 1178 (ii) under r0004: a leaning throw is cast like any other -- refused by a wall its ray enters, taken past one its hand already reaches${LEAN_DISC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  // r0001 let a LEANING release go before its clearance test (r0001 `FUN_005499e0` returns 1 for state 3, D:L414037-414039;
  // superseded under OT.R97), which this describe pinned as "the original's lean exemption". r0004 -- the specification (OT.R97) -- has no such
  // return: its clearance (`0x54e6f0`) never reads the state and casts the lean's ray from the lean's own hand point
  // (r0004 0x585740-0x58580c; research 256 s5, "the r0004 clearance"; the second reader's correction (f)). So a lean is
  // refused by a wall its 25-unit ray enters from the front, and a wall nearer than its hand (the right lean's 5.31
  // ahead) is passed from behind, as for any state. The room's SVC-23b reach (no original; anti-cheat) stays for every throw.
  // The lean needs the SEAL's skeleton and lean clips (the fixture disc's, as `roomLeanHit.test.ts`).
  // Read lazily, on the first test's call (BL-7, tools/test/skipIfFactories.test.ts): never at collection.
  let read: ReturnType<typeof simSkeletonsFromBytes> | null = null;
  const skeletons = (): ReturnType<typeof simSkeletonsFromBytes> => (read ??= simSkeletonsFromBytes(LEAN_MP2!, LEAN_READERC!, LEAN_PACK!));
  // The wall is wound with its front toward the body (the clearance is one-sided, front entries, LATER 250).
  const wallAt = (z: number) => ({ ...FLOOR, path: `worldmodel/leanwall${z}`, ditype: 2, points: Float32Array.from([50, 0, z, -50, 0, z, -50, 200, z, 50, 200, z]) });
  /** Player 2 at the origin facing +z (the wall `wallZ` ahead), held `buttons` for 60 ticks; its throw from `ahead` across. */
  const run = (buttons: number, ahead: number, releasedFor = 0, wallZ = 5): { drops: Record<string, number> | null; thrown: number; peek: number } => {
    let seed = 1;
    const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const room = new Room(map(false, [wallAt(wallZ)]), null, { now: () => 0, random }, { seal: skeletons().seal, terrorist: skeletons().seal }, kits(kit(62, 15, 121, 126, 255), kit(62, 15, 121, 126, 255)));
    const cs = [1, 2].map((id) => { const c = new Client(); room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99', session: tok(id) }, `10.0.0.${id}`); return c; });
    room.step();
    room.player(1)!.sim.walker.place(300, 20, 300);
    room.player(2)!.sim.walker.place(0, 20, 0);
    for (let i = 0; i < 30; i++) room.step();
    room.player(2)!.sim.allowSnap();
    for (let i = 0; i < 90 + releasedFor; i++) {
      const p = room.player(2)!;
      const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: 180, pitch: 0, turn: 0, buttons: i >= 30 && i < 90 ? buttons : 0, stance: 0, weapon: 0 };
      room.binary(2, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
      room.step();
    }
    const p = room.player(2)!;
    const peek = p.cone.frame(p.sim.seq)?.peek ?? 0;
    room.takeDrops();
    const w = p.sim.walker.state;
    room.text(2, { type: 'throw', seq: p.sim.seq, kind: 'M67', from: [w.x, w.y + EYE_HEIGHT, w.z + ahead], velocity: [0, 0, 0] });
    return { drops: room.takeDrops(), thrown: cs[0]!.of('grenade').length, peek };
  };

  it('the stage: yaw 180 faces +z, so the wall (z 5) stands between the head and a start 8 across', () => {
    expect(run(0, 8).peek).toBe(0);
  });

  it('leaning, the wall 5 ahead: taken -- the lean’s hand (5.31 ahead) is already past the wall, its ray meets no front', () => {
    const r = run(Button.LeanRight, 8);
    expect(r.peek).not.toBe(0);
    expect(r.drops).toBeNull();
    expect(r.thrown).toBe(1);
  });

  // EXPECTED FAIL, LATER 1294 (the room's own throw aim is owed): since the review of c5629fb494's B1 the room tries a pair
  // at the launch clamp's bound at every aim past it to the cone (`throwRelease`), and a zero velocity matches a power-0
  // toss at every aim, 55 degrees included -- a near-vertical 25 u ray that meets no wall. Only the body's own aim tells
  // this lean apart; the capture's leg T (no toss faces a wall at 10-10.5 u) and leg T2 (a standing tap refused at 9.0, 10.25 and 12 u, 3/5/3 times; SUMMARY.md) bears on the toss window. Assertions unchanged.
  it.fails('GAP (LATER 1294): leaning, the wall 8 ahead and the throw from 4 ahead: REFUSED as `unclear` -- r0004 casts the lean (r0001 exempted it)', () => {
    const r = run(Button.LeanRight, 4, 0, 8);
    expect(r.peek).not.toBe(0);
    expect(r.drops).toEqual({ 'throw: unclear': 1 });
    expect(r.thrown).toBe(0);
  });

  // EXPECTED FAIL, LATER 1294: this describe's ORIGINAL expectation (before B-06), restored (the main controller's ruling:
  // an old expectation is not given up on a reading). The zero-velocity throw matches a toss the room cannot rule out
  // without the body's own aim; the capture's leg T (no toss faces a wall at 10-10.5 u) and leg T2 (a standing tap refused at 9.0, 10.25 and 12 u, 3/5/3 times; SUMMARY.md) is the nearest evidence.
  it.fails('GAP (LATER 1294): upright: the same throw is still refused as `hand walled` (the SVC-23b guard kept)', () => {
    const r = run(0, 8);
    expect(r.drops).toEqual({ 'throw: hand walled': 1 });
    expect(r.thrown).toBe(0);
  });

  it('upright, the wall 5 ahead: the same zero-velocity throw is taken too -- it matches a toss, whose unclamped hand (10.5 ahead) is past the wall (r0004; was `unclear` under r0001)', () => {
    const r = run(0, 8);
    expect(r.drops).toBeNull();
    expect(r.thrown).toBe(1);
  });

  // EXPECTED FAIL, LATER 1294: the review F1's ORIGINAL expectation, restored, as the case above.
  it.fails('GAP (LATER 1294): the review F1: just after the lean is let go (the camera’s peek still easing back) the walls are asked again', () => {
    const r = run(Button.LeanRight, 8, 4);
    expect(r.peek).not.toBe(0);                                  // the eased value is still off 0 ...
    expect(r.drops).toEqual({ 'throw: hand walled': 1 });         // ... but the body no longer leans: the original's state
    expect(r.thrown).toBe(0);
  });

  it('the review F1: just after the lean is let go (the camera’s peek still easing back) the body’s state decides, not the eased value', () => {
    // The wall 8 ahead: the lean's ray enters it (refused, above); the upright toss's hand (10.5 ahead) is past it.
    expect(run(0, 4, 0, 8).drops).toBeNull();
    const r = run(Button.LeanRight, 4, 4, 8);
    expect(r.peek).not.toBe(0);                                  // the eased value is still off 0 ...
    expect(r.drops).toBeNull();                                  // ... the body no longer leans: the upright answer, not the lean's
    expect(r.thrown).toBe(1);
  });

  it('leaning, but past the reach: still refused as `hand far` (the remaining adaptation, START_REACH_PLACEHOLDER)', () => {
    const r = run(Button.LeanRight, 60);
    expect(r.peek).not.toBe(0);
    expect(r.drops).toEqual({ 'throw: hand far': 1 });
  });
});

describe('LANE-KILL item 1 (B-06): a standing throw square to a wall at the right shoulder, cleared by the release request, is not dropped by the room', async () => {
  // The original refuses a release only through its clearance (written against r0001 `FUN_005499e0` D:L413977-414063,
  // asked by `FUN_005be9a0` D:L475490-475498 -- superseded under OT.R97 by r0004's `0x54e6f0`, asked at 0x5c5d6c; research
  // 256 s5, D12): r0001's one-sided segment from the throw clip's hand point to the stance's far point. A body standing square to a wall at its right shoulder
  // passes it (the segment runs from 3.34 right away from the wall), so the release goes and the throw clip plays. The room's SVC-23b gate (`throwGrenade` -> `startRefused`; no original) draws a
  // two-sided line from the head to that hand and drops the throw as `hand walled`: the thrower sees the clip and no
  // grenade. C3 (the owner, 2026-11-21): a server check stands only where a test shows it refuses no honest input.
  // The launch is staged from the page's POSED hand (below), which reaches 4.24 to the right at release: past a wall
  // 3.6 off when standing square to it. Still a HYPOTHESIS for the reports until a served run agrees (PLAN-2 s4): the
  // hand moves about 4 units a frame there, so a one-frame clock offset changes the answer.
  const { actorToWorldDir, actorToWorldPoint, maxThrowDistance, throwAnim, throwVelocity } = await import('@s2u/scene');
  const { throwClear } = await import('../../viewer/src/throwCommit');
  const AWAY = 0;                                                  // square: facing along the wall on the right
  /**
   * The page's POSED right hand at the standing throw's release (`launchOf` with `handPoint('rhand', RELEASE_POINT)`),
   * in the actor frame, computed on the fixture disc's SEAL with the page's `Animator` and `ThrowPose`: release 0.710 s,
   * read at the 0.717 s frame (agent-mail pilot/kill/item-1-posed-hand.md; a dev-disc computation, not a served run).
   */
  const POSED_STAND_THROW_HAND: V3 = [4.24, 23.236, -6.407];
  const WALL_X = 103.6;                                            // 3.6 right of the body's axis (BODY_RADIUS 3.5)
  const wall: WorldPoly = { ...FLOOR, path: 'worldmodel/rightwall', ditype: 2, points: Float32Array.from([WALL_X, 0, -100, WALL_X, 0, 300, WALL_X, 80, 300, WALL_X, 80, -100]) };

  // The room's candidates (LATER 1428, ruling B: the render-grid table until the page half).
  const { ROOM_START_TIE_RENDER_GRID_ADAPTATION } = await import('@s2u/scene');
  /** The honest square stand at the right-shoulder wall, its throw sent from `hand` (actor frame): taken. */
  const squareThrow = (hand: V3, past: boolean): void => {
    const world = map(false, [wall]);
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 121, 126, 255), [-300, 0, -300], [100, 0, 100], world);
    const step = (): void => {
      const p = s.room.player(2)!;
      const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: AWAY, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
      s.room.binary(2, encodeCommands({ viewTick: s.room.tick, commands: [cmd] }));
      s.room.step();
    };
    s.room.player(2)!.sim.walker.state.yaw = AWAY;
    for (let i = 0; i < 30; i++) step();
    const feet = s.feet(2), yaw = s.room.player(2)!.sim.walker.state.yaw;
    const power = 0.895, aimSin = 0;
    const from = actorToWorldPoint(feet, yaw, hand);
    expect(from[0] > WALL_X, 'the hand past the wall').toBe(past);
    const velocity = actorToWorldDir(yaw, throwVelocity(power, aimSin, hand, maxThrowDistance('stand')).velocity);
    s.room.takeDrops();
    s.send(2, 'M67', from, velocity);
    expect(s.room.takeDrops()).toBeNull();
    expect(s.a.of('grenade')).toHaveLength(1);
  };
  const posed = ROOM_START_TIE_RENDER_GRID_ADAPTATION.standThrow!;
  it("the start-tie: the square stand's throw from each of the posed hand's three frames (before, release, after) is taken", () => {
    expect(posed[1]).toEqual(POSED_STAND_THROW_HAND);              // the release frame is this describe's own reading
    squareThrow([...posed[0]], true);                              // the frame before: 6.3 right, past the wall
    squareThrow([...posed[1]], true);                              // the release frame: 4.24 right, past it
    squareThrow([...posed[2]], true);                              // the frame after: 3.96 right, past it
  });
  it("the start-tie: the same throw from the TABLE hand (`GetThrowAnim`'s point, a page with no posed body) is taken", () => {
    squareThrow([...throwAnim(0.895, 0, 'stand').offset], false);  // 3.34 right: short of the wall
  });
  it('the start-tie: a forged start within reach past a wall the body faces (12 ahead; the start 15 ahead) is refused as `hand walled`', () => {
    const world = map(false, [wallAhead(12)]);
    const { s } = stage(world);
    const feet = s.feet(2), yaw = s.room.player(2)!.sim.walker.state.yaw;
    const hand: V3 = [0, EYE_HEIGHT, -15];                          // 15 ahead at the eye's height: within the reach, past the wall
    const from = actorToWorldPoint(feet, yaw, hand);
    expect(from[2]).toBeLessThan(100 - 12);
    // Every candidate hand of a full throw is short of the wall: the table's, the three poses' (at most 9.9 ahead).
    for (const h of [throwAnim(0.895, 0, 'stand').offset, ...posed]) expect(-h[2]).toBeLessThan(12);
    const velocity = actorToWorldDir(yaw, throwVelocity(0.895, 0, hand, maxThrowDistance('stand')).velocity);
    s.room.takeDrops();
    s.send(2, 'M67', from, velocity);
    expect(s.room.takeDrops()).toEqual({ 'throw: hand walled': 1 });
    expect(s.a.of('grenade')).toHaveLength(0);
  });

  it('RED until the gate is fixed: the page clears it; the room takes it', () => {
    const world = map(false, [wall]);
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 121, 126, 255), [-300, 0, -300], [100, 0, 100], world);
    const step = (): void => {
      const p = s.room.player(2)!;
      const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: AWAY, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
      s.room.binary(2, encodeCommands({ viewTick: s.room.tick, commands: [cmd] }));
      s.room.step();
    };
    s.room.player(2)!.sim.walker.state.yaw = AWAY;
    for (let i = 0; i < 30; i++) step();
    const feet = s.feet(2), yaw = s.room.player(2)!.sim.walker.state.yaw;
    expect(yaw).toBeCloseTo(AWAY, 2);
    expect(WALL_X - feet[0]).toBeGreaterThanOrEqual(3.5 - 1e-6);   // the body itself is clear of the wall
    const power = 0.895, aimSin = 0;
    expect(throwAnim(power, aimSin, 'stand').clip).toBeTruthy();
    const from = actorToWorldPoint(feet, yaw, POSED_STAND_THROW_HAND);
    expect(from[0]).toBeGreaterThan(WALL_X);                       // the hand point is past the wall's face
    const snap = { feet: [...feet], yaw, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null, jumps: 0 };
    expect(throwClear(world.grid, snap as never, power, aimSin)).toBe(true);   // the release request lets it go
    const velocity = actorToWorldDir(yaw, throwVelocity(power, aimSin, POSED_STAND_THROW_HAND, maxThrowDistance('stand')).velocity);
    s.room.takeDrops();
    s.send(2, 'M67', from, velocity);
    expect(s.room.takeDrops()).toBeNull();                         // today: { 'throw: hand walled': 1 }
    expect(s.a.of('grenade')).toHaveLength(1);
  });

  // The fix ("D", the main controller's ruling, 2026-11-21): the room asks the original's own clearance (`throwClear`,
  // r0004 `0x54e6f0`; r0001's `FUN_005499e0` superseded under OT.R97) at the release request's body for every launch
  // matching the throw, in place of the wall lines.
  /**
   * Player 2 standing at (100, 0, 100) facing `yaw` (0: ahead is -z, the right +x) for 30 ticks, in `world`, each command
   * looking at camera pitch `pitch` (degrees; the AimFrame's `pitch`, which THROW_AIM_FLOOR_ADAPTATION reads).
   */
  const stage = (world: SimMap, yaw = AWAY, pitch = 0) => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 121, 126, 255), [-300, 0, -300], [100, 0, 100], world);
    const step = (y: number): void => {
      const p = s.room.player(2)!;
      const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: y, pitch, turn: 0, buttons: 0, stance: 0, weapon: 0 };
      s.room.binary(2, encodeCommands({ viewTick: s.room.tick, commands: [cmd] }));
      s.room.step();
    };
    s.room.player(2)!.sim.walker.state.yaw = yaw;
    for (let i = 0; i < 30; i++) step(yaw);
    return { s, step };
  };
  /** A wall across x 0..200 at `ahead` in front of the stage's body (z 100 - ahead), its front facing the body. */
  const wallAhead = (ahead: number): WorldPoly => {
    const z = 100 - ahead;
    return { ...FLOOR, path: `worldmodel/frontwall${ahead}`, ditype: 2, points: Float32Array.from([0, 0, z, 200, 0, z, 200, 80, z, 0, 80, z]) };
  };
  const snapOf = (feet: readonly number[], yaw: number) => ({ feet: [...feet], yaw, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null, jumps: 0 });

  it('a throw from past a wall 5 ahead (8 ahead, a launch matching from there) is TAKEN under r0004: a toss matching it starts past the wall (the toss window of the room, LATER 1294)', () => {
    const world = map(false, [wallAhead(5)]);
    const { s } = stage(world);
    const feet = s.feet(2), yaw = s.room.player(2)!.sim.walker.state.yaw;
    const hand: V3 = [0, EYE_HEIGHT, -8];                           // 8 ahead at the eye's height: past the wall
    const from = actorToWorldPoint(feet, yaw, hand);
    expect(from[2]).toBeLessThan(95);
    // r0004 (OT.R97, research 256 s5): the throw's ray (hand behind the feet) enters the wall's front; the toss's (power
    // under 0.6: its unclamped hand 10.5 ahead, already past a wall 5 ahead) meets nothing from the front and clears --
    // r0004's prediction for a toss square to a wall nearer than 10.5 (leg T; leg T2 refused a standing tap at 9.0, 10.25 and 12 u).
    for (const power of [0.6, 0.895, 1]) expect(throwClear(world.grid, snapOf(feet, yaw) as never, power, 0), `power ${power}`).toBe(false);
    for (const power of [0, 0.3]) expect(throwClear(world.grid, snapOf(feet, yaw) as never, power, 0), `power ${power}`).toBe(true);
    // So the room, which tries every launch of the family matching the velocity (THROW_CLEARANCE_PAIRS_ADAPTATION), finds
    // a toss whose table hand (10.5 ahead) is tied to the start 8 ahead and clears: TAKEN. The same toss window as
    // central room.test's BL-3 / LEAN-WALLED honest reds; the capture's legs T and T2 bear on it. Was `unclear` under r0001's
    // clamped hand, and `hand walled` before B-06.
    const velocity = actorToWorldDir(yaw, throwVelocity(0.6, 0, hand, maxThrowDistance('stand')).velocity);
    s.room.takeDrops();
    s.send(2, 'M67', from, velocity);
    expect(s.room.takeDrops()).toBeNull();
    expect(s.a.of('grenade')).toHaveLength(1);
  });

  // The main controller's ruling (2026-11-21): an old expectation is not given up on a reading. The case above, with its
  // ORIGINAL assertion, kept as a named honest red: r0004's unclamped toss hand puts this in the toss window.
  // EXPECTED FAIL, LATER 1294 (the room's own throw aim is owed; the controller's option A): the capture's leg T (no toss
  // faces a wall at 10-10.5 u) and leg T2 (a standing tap refused at 9.0, 10.25 and 12 u, 3/5/3 times; SUMMARY.md) is the nearest evidence. Assertions unchanged.
  it.fails("GAP (LATER 1294): the forged throw from past a wall 5 ahead, its original expectation (HONEST RED under r0004's clearance until the capture's leg T rules on the toss window)", () => {
    const world = map(false, [wallAhead(5)]);
    const { s } = stage(world);
    const feet = s.feet(2), yaw = s.room.player(2)!.sim.walker.state.yaw;
    const hand: V3 = [0, EYE_HEIGHT, -8];
    const from = actorToWorldPoint(feet, yaw, hand);
    for (const power of [0, 0.3, 0.6, 0.895, 1]) expect(throwClear(world.grid, snapOf(feet, yaw) as never, power, 0), `power ${power}`).toBe(false);
    const velocity = actorToWorldDir(yaw, throwVelocity(0.6, 0, hand, maxThrowDistance('stand')).velocity);
    s.room.takeDrops();
    s.send(2, 'M67', from, velocity);
    expect(s.room.takeDrops()).toEqual({ 'throw: unclear': 1 });
    expect(s.a.of('grenade')).toHaveLength(0);
  });

  // Was EXPECTED FAIL (LATER 1294) while B1 tried a pair at the clamp's 0-degree bound at every aim below it to the cone:
  // a steep-down 25 u ray ended short of a wall 10 ahead. Since THROW_AIM_FLOOR_ADAPTATION (the controller's ruling (ii),
  // 2026-11-21) the aims below 0 stop at the lowest rest aim the capture logged, whose ray enters the wall: refused again,
  // as the capture's legs T (no toss faces a wall at 10-10.5 u) and T2 (a standing tap refused at 9.0, 10.25 and 12 u,
  // 3/5/3 times; SUMMARY.md) bear. Assertions unchanged.
  it("a standing throw at a wall 10 ahead, its posed hand short of the wall, is refused as `unclear`: the original's segment enters the face from the front", () => {
    const world = map(false, [wallAhead(10)]);
    const { s } = stage(world);
    const feet = s.feet(2), yaw = s.room.player(2)!.sim.walker.state.yaw;
    const power = 0.895, aimSin = 0;
    const from = actorToWorldPoint(feet, yaw, POSED_STAND_THROW_HAND);
    expect(from[2]).toBeGreaterThan(90);                            // the hand short of the wall: no head or axis line meets it
    expect(throwClear(world.grid, snapOf(feet, yaw) as never, power, aimSin)).toBe(false);   // the release request refuses it
    const velocity = actorToWorldDir(yaw, throwVelocity(power, aimSin, POSED_STAND_THROW_HAND, maxThrowDistance('stand')).velocity);
    s.room.takeDrops();
    s.send(2, 'M67', from, velocity);
    expect(s.room.takeDrops()).toEqual({ 'throw: unclear': 1 });   // was null: the room let it fly
    expect(s.a.of('grenade')).toHaveLength(0);
  });

  // Was EXPECTED FAIL (LATER 1294), as the case above: its second half (the throw's body facing the wall 12 ahead) was
  // taken through an aim steeply below the clamp's 0-degree bound; green again under THROW_AIM_FLOOR_ADAPTATION.
  // Assertions unchanged.
  it("the clearance is asked at the release request's body (`start`), not the throw's; a page naming none, at the throw's", () => {
    // r0004 (OT.R97): the throw is a FULL standing throw from its table hand (it was a zero-velocity one from the eye):
    // a zero velocity matches, among the family's pairs, some that clear facing the wall under r0004 (a toss's unclamped
    // hand 10.5 ahead; which pair cleared at 12 was not traced). The wall 12 ahead (was 8): the full
    // throw's ray from behind the feet reaches 21 ahead and enters it.
    const world = map(false, [wallAhead(12)]);
    const hand = throwAnim(0.895, 0, 'stand').offset;
    const run = (named: boolean): Record<string, number> | null => {
      const { s, step } = stage(world, 180);                      // at the request: facing away from the wall (+z)
      const p = s.room.player(2)!;
      const request = p.sim.seq;
      s.room.text(2, { type: 'throwStart', seq: request, kind: 'M67' });
      expect((p as unknown as { throwStart: unknown }).throwStart, 'the request taken').not.toBeNull();
      p.sim.walker.state.yaw = AWAY;                                // then turns to face the wall
      for (let i = 0; i < 5; i++) step(AWAY);
      expect(p.sim.walker.state.yaw).toBeCloseTo(AWAY, 2);
      s.room.takeDrops();
      const feet = s.feet(2), from = actorToWorldPoint(feet, AWAY, hand);
      const velocity = actorToWorldDir(AWAY, throwVelocity(0.895, 0, hand, maxThrowDistance('stand')).velocity);
      s.room.text(2, { type: 'throw', seq: p.sim.seq, kind: 'M67', ...(named ? { start: request } : {}), from, velocity });
      return s.room.takeDrops();
    };
    expect(run(true), "the request's body faced away: clear").toBeNull();
    expect(run(false), "no request named: the throw's body, facing the wall").toEqual({ 'throw: unclear': 1 });
  });

  // EXPECTED FAIL, LATER 1294 (the room's own throw aim is owed): the capture's leg T (no toss faces a wall at 10-10.5 u) and leg T2 (a standing tap refused at 9.0, 10.25 and 12 u, 3/5/3 times; SUMMARY.md)
  // is the nearest evidence. Assertions unchanged.
  it.fails("GAP (LATER 1294): the request's body against the throw's, its ORIGINAL input -- a zero-velocity throw from the eye, the wall 8 ahead (HONEST RED under r0004's clearance until the capture's leg T rules on the toss window)", () => {
    const world = map(false, [wallAhead(8)]);
    const run = (named: boolean): Record<string, number> | null => {
      const { s, step } = stage(world, 180);
      const p = s.room.player(2)!;
      const request = p.sim.seq;
      s.room.text(2, { type: 'throwStart', seq: request, kind: 'M67' });
      p.sim.walker.state.yaw = AWAY;
      for (let i = 0; i < 5; i++) step(AWAY);
      s.room.takeDrops();
      s.room.text(2, { type: 'throw', seq: p.sim.seq, kind: 'M67', ...(named ? { start: request } : {}), from: s.eye(2), velocity: [0, 0, 0] });
      return s.room.takeDrops();
    };
    expect(run(true), "the request's body faced away: clear").toBeNull();
    expect(run(false), "no request named: the throw's body, facing the wall").toEqual({ 'throw: unclear': 1 });
  });

  // The review of c5629fb494, B1: pressed to a tall wall the page's aim (`throwAimVector` at rest, r0004 `0x5e6690`) is
  // 72-76 degrees up, past the launch's 0..55-degree clamp (`THROW_AIM_CLAMP`, r0004 0x5c9640-0x5c9680), and its 25 u ray
  // (the request's `throwClear`, the hand-open's `handOpenClear`) ends short of the wall's top: the page plays the clip and
  // lets go. The room recovers the aim from the velocity, which only holds the clamped elevation, so it must also try the
  // aims past the clamp's bound up to the stance's cone (`THROW_AIM_CONE_READING`): else `unclear`, the clip and no grenade.
  const { PlayerCamera, INIT_AIM_PITCH, viewFar } = await import('../../viewer/src/playerCamera');
  const { rootY } = await import('../../viewer/src/mover');
  const { throwAimVector, throwAimReach, throwAimKept } = await import('../../viewer/src/throwAim');
  const { handOpenClear } = await import('../../viewer/src/throwCommit');
  const tallWall = (ahead: number, height: number): WorldPoly => {
    const z = 100 - ahead;
    return { ...FLOOR, path: `worldmodel/tallwall${ahead}x${height}`, ditype: 2, points: Float32Array.from([0, 0, z, 200, 0, z, 200, height, z, 0, height, z]) };
  };
  /**
   * The page's honest standing throw at camera pitch `pitch` (the rest pitch unless given; its commands carry it), power
   * `power`, at a wall `ahead` u off and `height` tall; the M67 selected at the posture `latch` (the aim's origin height,
   * THROW_AIM_ORIGIN_LATCH_READING: stand 13.11, crouch 8.76), the body standing at the throw.
   */
  const pressedThrow = (ahead: number, height: number, pitch: number = INIT_AIM_PITCH, power = 0.895, latch: 'stand' | 'crouch' = 'stand') => {
    const world = map(false, [tallWall(ahead, height)]);
    const { s, step } = stage(world, AWAY, pitch);
    // The room moves its pitch toward the command's at the look's rate: run until its frame holds the pitch.
    const cone = (s.room.player(2) as unknown as { cone: { frame(seq: number): { pitch: number } | null } }).cone;
    for (let i = 0; i < 600 && !(Math.abs((cone.frame(s.room.player(2)!.sim.seq)?.pitch ?? NaN) - pitch) <= 0.005); i++) step(AWAY);
    expect(Math.abs(cone.frame(s.room.player(2)!.sim.seq)!.pitch - pitch), "the room's pitch (the wire holds 0.01 degree)").toBeLessThanOrEqual(0.005);
    const feet = s.feet(2), yaw = s.room.player(2)!.sim.walker.state.yaw;
    const cam = new PlayerCamera(world.grid);
    for (let i = 0; i < 120; i++) cam.tick(feet, yaw, pitch, rootY('stand'));
    cam.settle();
    const v = cam.view(1);
    const ray = { eye: [...v.aim.eye], far: [...viewFar(v.aim.eye, v.aim.target, v.far)] };
    const aim = throwAimVector(world.grid, { ...ray, reach: throwAimReach(M67.maximumRange), kept: throwAimKept(world.defaultMaterial ?? '') }, { feet, yaw, stance: 'stand', latch }).aim;
    const snap = { ...snapOf(feet, yaw), pitch };
    const pageClears = throwClear(world.grid, snap as never, power, aim) && handOpenClear(world.grid, snap as never, power, aim);
    // `launchOf` from the table hand (a page with no posed body): the velocity holds only the clamped elevation of aim[1].
    const hand = throwAnim(power, aim[1], 'stand', 0).offset;
    const from = actorToWorldPoint(feet, yaw, hand);
    const velocity = actorToWorldDir(yaw, throwVelocity(power, aim[1], hand, maxThrowDistance('stand')).velocity);
    s.room.takeDrops();
    s.send(2, 'M67', from, velocity);
    return { elevation: (Math.asin(aim[1]) * 180) / Math.PI, pageClears, drops: s.room.takeDrops(), thrown: s.a.of('grenade').length };
  };
  const GRID: readonly [number, number][] = [
    [35, 3.6], [35, 4.5], [35, 5.5], [40, 3.6], [40, 4.5], [40, 5.5], [60, 3.6], [60, 4.5], [200, 3.6], [200, 4.5],
  ];
  // LANE-KILL B-06 (893dd1be9d, THROW_AIM_ORIGIN_LATCH_READING): the aim's origin is the height latched at the M67's
  // select, not a fitted 8.808 at the throw. (i) Selected STANDING (13.11): the origin 4.35 u higher than the old fit puts
  // the page's 25 u request / hand-open ray over the wall's top on only one grid point (35 tall, 3.6 ahead); on the other
  // nine it enters the face and the page REFUSES the throw itself -- nothing reaches the room. The stand latch's refusal
  // is a capture of the original: KILL-LATCH-PC2 (r0004 under PCSX2 2.8.2, 2026-11-21; record
  // D:/s2u-records/KILL-LATCH-PC2/KILL-LATCH-PC2.zip, sha256
  // 5bcf4f60b800abcb29c421056a687fa17efce098c6579275d1457fc62670ccc0; summary
  // agent-mail/evidence/weekend-mega-2026-11-14/rig/KILL-LATCH-PC2/RESULTS.md s1-s2): the latch kept from the select, and
  // a standing select at 20 u, the default look, refused 3/3 before any throw clip. The capture's pose is that 20 u leg
  // (`throwAimCapture.disc.test.ts`); these tall-wall points are the same latch and the same request cast, not captured
  // poses, and the cast's own margin was not measured. (ii) Selected CROUCHED, then stood (8.76, near the old fit's
  // height but with no 0.453 ahead): the page lets seven go and refuses three (40 tall at 5.5, 60 and 200 tall at 4.5);
  // the room TAKES all ten when sent (0 drops), so no throw the page lets go is dropped by the room.
  const STAND_LATCH_PAGE_CLEARS: ReadonlySet<string> = new Set(['35@3.6']);
  const CROUCH_LATCH_PAGE_REFUSES: ReadonlySet<string> = new Set(['40@5.5', '60@4.5', '200@4.5']);
  for (const [height, ahead] of GRID) {
    const clears = STAND_LATCH_PAGE_CLEARS.has(`${height}@${ahead}`);
    it(`B1 (i), the stand latch: pressed to a wall ${height} u tall, ${ahead} u ahead, the page's honest throw at rest ${clears ? 'clears, so the room TAKES it' : 'is REFUSED by the page itself: the latch model at an uncaptured pose (a reading; KILL-LATCH captured the 20 u default-look pose)'}`, () => {
      const r = pressedThrow(ahead, height);
      console.log(`B1 (i) stand latch, wall ${height} at ${ahead}: aim ${r.elevation.toFixed(1)} deg, page clears ${r.pageClears}, drops ${JSON.stringify(r.drops)}, thrown ${r.thrown}`);
      if (!clears) {
        // The latch model at an uncaptured pose (a reading); KILL-LATCH-PC2 s2 (sha256 5bcf4f60...ccc0) captured the
        // stand latch's refusal at the 20 u default-look pose only.
        expect(r.pageClears, 'the page refuses it (request or hand-open): the latch model at an uncaptured pose (a reading; KILL-LATCH captured the 20 u default-look pose)').toBe(false);
        return;
      }
      expect(r.pageClears, 'the page lets it go (request and hand-open)').toBe(true);
      expect(r.drops).toBeNull();
      expect(r.thrown).toBe(1);
    });
    const crouchClears = !CROUCH_LATCH_PAGE_REFUSES.has(`${height}@${ahead}`);
    it(`B1 (ii), the crouch latch (selected crouched, then stood): pressed to a wall ${height} u tall, ${ahead} u ahead, the page's honest throw at rest (its aim past the 55-degree clamp) ${crouchClears ? 'clears' : 'is refused by the page (the latch, KILL-LATCH-PC2; this pose not captured)'}; the room TAKES it`, () => {
      const r = pressedThrow(ahead, height, INIT_AIM_PITCH, 0.895, 'crouch');
      console.log(`B1 (ii) crouch latch, wall ${height} at ${ahead}: aim ${r.elevation.toFixed(1)} deg, page clears ${r.pageClears}, drops ${JSON.stringify(r.drops)}, thrown ${r.thrown}`);
      expect(r.pageClears, crouchClears ? 'the page lets it go (request and hand-open)'
        : 'the page refuses it: the crouch latch (KILL-LATCH-PC2 s1), this pose not captured').toBe(crouchClears);
      expect(r.drops).toBeNull();
      expect(r.thrown).toBe(1);
    });
  }

  // The review of afd246dfe3, B1 (C3): the stick held down to camera pitch -60, a wall 40 u tall 19 u ahead, power 0.895.
  // The page's aim (`throwAimVector`) is steeply down, its request and hand-open clear and the launch is clamped level; the
  // room under the FIXED floor (sine -0.1915) tried no aim that steep and refused `unclear`. The floor is per throw now,
  // from the command's pitch (THROW_AIM_FLOOR_ADAPTATION, THROW_AIM_FLOOR_MARGIN_ADAPTATION): taken.
  it("B1 of afd246dfe3's review: standing, camera pitch -60, a wall 40 u tall 19 u ahead, power 0.895 -- the page's honest throw is TAKEN", () => {
    const r = pressedThrow(19, 40, -60, 0.895);
    console.log(`B1 pitch -60, wall 40 at 19: aim ${r.elevation.toFixed(1)} deg, page clears ${r.pageClears}, drops ${JSON.stringify(r.drops)}`);
    expect(r.elevation, 'the page aims below the old fixed floor').toBeLessThan((Math.asin(-0.191536) * 180) / Math.PI);
    expect(r.pageClears, 'the page lets it go (request and hand-open)').toBe(true);
    expect(r.drops).toBeNull();
    expect(r.thrown).toBe(1);
  });

  // The delta review of 7bf7ac69cf, F1: a forged FULL-POWER LEVEL throw from past a thin wall (80 u tall, 6 ahead), its
  // start the posed stand-throw's after-frame (9.889 ahead, 22 up) or 14 ahead. The room at c5629fb494 refused it as
  // `unclear`; with B1's aims below the clamp's 0-degree bound tried to the cone's -85 degrees a steep-down 25 u ray met
  // no wall and it was taken (7bf7ac69cf). The controller's ruling (ii), 2026-11-21: the aims below 0 go down only to
  // THROW_AIM_FLOOR_ADAPTATION (sin of the command's camera pitch less the margin, at pitch 0 -0.0475), where the ray
  // still enters the wall: refused.
  // Not a toss lob: a full-strength throw through about 6 u of wall.
  it('a forged full-power level throw through a thin wall is refused as `unclear`: B1\'s aims below 0 deg stop at THROW_AIM_FLOOR_ADAPTATION', () => {
    const world = map(false, [wallAhead(6)]);
    for (const ahead of [posed[2][2], -14]) {
      for (const power of [0.895, 1]) {
        const { s } = stage(world);
        const feet = s.feet(2), yaw = s.room.player(2)!.sim.walker.state.yaw;
        const hand: V3 = [posed[2][0], posed[2][1], ahead];
        const from = actorToWorldPoint(feet, yaw, hand);
        expect(from[2], 'the start past the wall').toBeLessThan(100 - 6);
        const velocity = actorToWorldDir(yaw, throwVelocity(power, 0, hand, maxThrowDistance('stand')).velocity);
        s.room.takeDrops();
        s.send(2, 'M67', from, velocity);
        expect(s.room.takeDrops(), `${-ahead} ahead, power ${power}`).toEqual({ 'throw: unclear': 1 });
        expect(s.a.of('grenade')).toHaveLength(0);
      }
    }
  });

  // The review of 77da3bbe1b, N6: throwAimFloor's values pinned (THROW_AIM_FLOOR_ADAPTATION: sin(pitch) less the posture's
  // margin, within the cone's `down`, and nothing below 0 when that is at or above 0).
  it('throwAimFloor: sin(pitch) less the margin within the cone; at or above 0 it tries no aim below 0', () => {
    const rad = (d: number): number => (d * Math.PI) / 180;
    const m = (3 * MAX_PITCH_RATE) / 60;                          // three commands of RECRUIT's full stick: 0.0475 (to 4 places)
    expect(m).toBeCloseTo(0.0475, 3);
    expect(throwAimFloor(0, 'stand'), 'standing, pitch 0').toBeCloseTo(Math.asin(0 - m), 12);
    expect(throwAimFloor(0, 'crouch'), 'crouched, pitch 0').toBeCloseTo(Math.asin(0 - m), 12);
    expect(throwAimFloor(-60, 'stand'), 'standing, pitch -60').toBeCloseTo(Math.asin(Math.sin(rad(-60)) - m), 12);
    expect(throwAimFloor(-60, 'crouch'), 'crouched, pitch -60').toBeCloseTo(Math.asin(Math.sin(rad(-60)) - m), 12);
    for (const pitch of [-20, 0, 25]) {
      expect(Math.sin(throwAimFloor(pitch, 'prone')), `prone, pitch ${pitch}: the cone's -20 degrees`).toBeCloseTo(Math.sin(rad(-20)), 12);
    }
    for (const posture of ['stand', 'crouch'] as const) {   // prone's margin 2 never reaches 0: always the cone
      expect(throwAimFloor(10, posture), `${posture}: above 0 -> no aim below 0`).toBe(0);
      expect(throwAimFloor(60, posture), `${posture}: looking up -> no aim below 0`).toBe(0);
    }
  });

  // The delta review of 7bf7ac69cf, F2: the request's body decides the clearance, at an aim inside the clamp (sine 0.5,
  // 30 degrees, where B1's leniency adds no aim). A full standing throw at power 0.895, the wall 12 ahead.
  it("the clearance is asked at the release request's body (`start`): at aim sine 0.5 a named request facing away is taken, no named request `unclear`", () => {
    const world = map(false, [wallAhead(12)]);
    const power = 0.895, aimSin = 0.5;
    const hand = throwAnim(power, aimSin, 'stand').offset;
    const run = (named: boolean): Record<string, number> | null => {
      const { s, step } = stage(world, 180);                      // at the request: facing away from the wall (+z)
      const p = s.room.player(2)!;
      const request = p.sim.seq;
      s.room.text(2, { type: 'throwStart', seq: request, kind: 'M67' });
      expect((p as unknown as { throwStart: unknown }).throwStart, 'the request taken').not.toBeNull();
      p.sim.walker.state.yaw = AWAY;                                // then turns to face the wall
      for (let i = 0; i < 5; i++) step(AWAY);
      expect(p.sim.walker.state.yaw).toBeCloseTo(AWAY, 2);
      s.room.takeDrops();
      const feet = s.feet(2), from = actorToWorldPoint(feet, AWAY, hand);
      const velocity = actorToWorldDir(AWAY, throwVelocity(power, aimSin, hand, maxThrowDistance('stand')).velocity);
      s.room.text(2, { type: 'throw', seq: p.sim.seq, kind: 'M67', ...(named ? { start: request } : {}), from, velocity });
      return s.room.takeDrops();
    };
    expect(run(true), "the request's body faced away: clear").toBeNull();
    expect(run(false), "no request named: the throw's body, facing the wall").toEqual({ 'throw: unclear': 1 });
  });
});

/**
 * R4P-243 (ATLAS L367; research 313 s8.24; reading, pending review; capture IQ-179 queued): the room's wiring of the hand
 * gate -- `watchMoves` sets `Traversal.handRefusesClimb` to `Room.handRefusesClimb`, which asks `slotSelectable`
 * (r0004's isSelectableItem 0x5c47e0) of the item in hand on the command run now: the Detonator (0xc1, the page's
 * `hand`) with no claymore down refuses the climb's and the ladder's offer (r0004 `FUN_00598d30` D4:L493145-493148,
 * D4:L493164-493168); one claymore down, the offer stands.
 */
describe('R4P-243: the room refuses the climb offer with the Detonator in hand and no claymore down', () => {
  it('the Detonator up with no claymore down refuses the offer; with a claymore down it stands; the firearm refuses nothing', () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 121, 153, 255), [0, 0, 700], [0, 0, 0]);
    const p = s.room.player(2)!;
    const t = p.sim.moves as Traversal;
    expect(t).toBeInstanceOf(Traversal);
    s.drive(2, 0.2);
    expect(t.handRefusesClimb?.() ?? false, 'the firearm in hand').toBe(false);
    expect(climbOffered(p.sim.walker, t.handRefusesClimb), 'the firearm in hand: offered').toBe(true);
    s.room.text(2, { type: 'hand', seq: p.sim.seq, item: 193 } as unknown as ClientEvent);   // the Detonator up
    s.drive(2, 0.2);
    expect(t.handRefusesClimb?.() ?? false, 'the Detonator, no claymore down').toBe(true);
    expect(climbOffered(p.sim.walker, t.handRefusesClimb), 'refused').toBe(false);
    s.send(2, 'Claymore', [8, 0, 0], [1, 0, 0]);                          // one claymore set down
    s.drive(2, 0.2);
    expect(s.room.player(2)!.grenades.Claymore).toBe(3);
    expect(t.handRefusesClimb?.() ?? false, 'the Detonator, a claymore down').toBe(false);
    expect(climbOffered(p.sim.walker, t.handRefusesClimb), 'offered').toBe(true);
  });

  // Seat-walls' check (page against room): with a claymore placed, the launcher's answer is its round alone -- the
  // claymores down are read by `slotSelectable` for the Detonator only -- and the Detonator's is the placed count. The
  // same sequence as `matchThrow.test.ts`'s twin, the same answers: [launcher, a round] false, [launcher, none] true,
  // [the Detonator, a claymore down] false.
  it('page and room alike: a claymore placed, then the launcher with a round, emptied, and the Detonator in hand', () => {
    const s = setup(kit(62, 15, 121, 126, 255), kit(62, 15, 145, 185, 153), [0, 0, 700], [0, 0, 0]);
    const p = s.room.player(2)!;
    const t = p.sim.moves as Traversal;
    s.send(2, 'Claymore', [8, 0, 0], [1, 0, 0]);                          // one claymore set down
    s.drive(2, 0.2);
    const answers: boolean[] = [];
    s.hold(2, 'LAW'); s.drive(2, launcherRaiseSeconds(0) + 0.05);
    expect(p.held).toBe(145);
    expect(p.rounds.ring(185)!.rounds()).toBe(1);
    answers.push(t.handRefusesClimb!());                                  // the launcher up, a round
    s.send(2, 'LAW HEAT', s.eye(2), [200, 0, 0]);
    s.drive(2, 0.1);
    expect(p.rounds.ring(185)!.rounds()).toBe(0);
    answers.push(t.handRefusesClimb!());                                  // the launcher up, emptied
    s.hold(2, 'M4A1 SD'); s.drive(2, 2);                                    // the firearm back
    expect(p.held).toBeNull();
    s.room.text(2, { type: 'hand', seq: p.sim.seq, item: 193 } as unknown as ClientEvent);
    s.drive(2, 0.2);
    answers.push(t.handRefusesClimb!());                                  // the Detonator, a claymore down
    expect(answers).toEqual([false, true, false]);
  });
});
