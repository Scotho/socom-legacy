import { describe, expect, it } from 'vitest';
import {
  CLAYMORE, DEFAULT_RIFLE, HELD_SIDEARM, M67, arsenalOf, segmentHits, type CollisionOwner, type EffectProgram, type Grid, type GridParams, type Loadout,
  type SpawnSlot, type ThrowableRecord, type WeaponRecord, type WorldPoly,
} from '@s2u/scene';
import {
  cameraLook, centreClaim, EYE_HEIGHT, faceToward, launcherRaiseSeconds, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, encodeCommands,
  type ClientEvent, type Command, type MapMeta, type ServerEvent, type SimKits, type SimMap,
} from '../../viewer/src/sim';
import { localCamera, toWorld } from '../../viewer/src/cameraRig';
import { rootY } from '../../viewer/src/mover';
import { Button, holdBits } from '../../viewer/src/net/protocol';
import { ORDER_EYE_BOUND, reproducedEye, type AimFrame } from '../../viewer/src/net/shotCone';
import { C4_PLANT_CLIP } from '../../viewer/src/equipment';
import { FIRE_ARRIVAL_JITTER_TICKS, MAX_BATCH, Room, type Conn } from '../src/room';

/**
 * SUP-03 in the room (research 210 s8; research 176 s7, 174 s3): Vigilance's access barrier in miniature -- `access1`'s
 * block (health 1, shield 17) on `good_parts/di_good`, its sequence `EXECUTE_ACTION set_access1`, the type-less action
 * `access_action1` on that valve running `destroy_access1` -- beside a Crossroads-style base (health 2, shield 21). The
 * C4 target is the bound destructible the page names, in reach, seen (PF-13: `throw.target`/`surface`; the heuristic
 * `c4Targets` and SUP-03's nearest-in-reach `c4PlantNear` retired); its blast (18) and
 * the RPG's (20) open the barrier through `blastAt`; the M67's (10) does not; once a round, the next restores it. A
 * Terrorist plants too (`Enable_c4 = 9`).
 */

type V3 = [number, number, number];
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};
const ROOT = 'worldmodel/access1', REAL = `${ROOT}=access1`, GOOD = `${REAL}/good_parts`, DI = `${GOOD}/di_good`;
const LEFT = `${REAL}/whats_left`, BAD = `${REAL}/bad_parts`, ACTION = `${REAL}/access_action1`;
const BASE = 'worldmodel/terrorist_base', BASEDI = `${BASE}/healthy/basedi`;
/**
 * A wall across z (x0..x1, 0..24 high). AD-5: Vigilance's barriers stand 20.8-30.7 high (`access1` 22.7: its di_good's
 * box on the disc, `accessBarriers.test.ts`), and a blast is measured to the target's midpoint (FUN_00273a50
 * D:L120968-120978) with the falloff past half its radius (FUN_003c7600 D:L318730-318735) and the shield again after
 * it (D:L318763): C4's 18 opens a shield-17 barrier from within 0.528 of its 50 u (26.4 u) of the midpoint. Was 60 high
 * (its midpoint 30 up), with the charges at z 302: 41 u off, 18 x (1 - (0.82 - 0.5) x 2) = 6.5 under the shield.
 */
const wallZ = (path: string, z: number, x0: number, x1: number, h = 24): WorldPoly =>
  ({ ...FLOOR, path, ditype: 2, points: Float32Array.from([x0, 0, z, x1, 0, z, x1, h, z, x0, h, z]) });
/** LATER 121: a top face across z0..z1 at height h (x0..x1). */
const topZ = (path: string, z0: number, z1: number, x0: number, x1: number, h: number): WorldPoly =>
  ({ ...FLOOR, path, ditype: 2, points: Float32Array.from([x0, h, z0, x1, h, z0, x1, h, z1, x0, h, z1]) });
/** LATER 121: a SWITCH (type 2) with a body, two faces at z -94 and -100 and a top 18 high; no program (`busy` once past the line). */
const SWITCH = 'worldmodel/switch1';
/** LATER 305: the walls `barrierMap`'s `camera` puts behind and over a SEAL's camera. */
const CAMWALL = 'worldmodel/camwall';

/**
 * The flat map, the barrier across z 330 (x -40..40) and the base across z -330 (x -40..40); the spawn slots far off
 * either side. `roundSeconds` short rounds come from the room's options. PF-35: `kerb`, a low wall across z 324 (x
 * -40..40, 10 high) between a charge at z 318 and the barrier's foot, under the planter's line to the struck point;
 * `shield`, the barrier's (17 on Vigilance). AD-5: the charges at z 318, 16.9 u from the barrier's midpoint (0, 12, 330):
 * the whole 18 (was z 302 and the kerb at z 316).
 */
const KERB = 'worldmodel/kerb';
function barrierMap(opts: { kerb?: boolean; shield?: number; kerbMaterial?: number; thick?: number; top?: number; switch?: boolean; camera?: { back: number; ceiling: number } } = {}): SimMap {
  const kerb: WorldPoly = { ...FLOOR, path: KERB, ditype: 2, material: opts.kerbMaterial ?? FLOOR.material, points: Float32Array.from([-40, 0, 324, 40, 0, 324, 40, 10, 324, -40, 10, 324]) };
  // LATER 121: `thick`, the barrier's far face `thick` behind its near one (z 330 + thick), the same node; `top`, both faces
  // that high and a top face between them; `switch`, `SWITCH`'s body.
  const h = opts.top ?? 24, far = opts.thick ? 330 + opts.thick : 0;
  const polys = [FLOOR, wallZ(DI, 330, -40, 40, h), ...(opts.thick && opts.top ? [topZ(DI, 330, far, -40, 40, h)] : []), ...(opts.thick ? [wallZ(DI, far, -40, 40, h)] : []),
    wallZ(BASEDI, -330, -40, 40), ...(opts.kerb ? [kerb] : []),
    ...(opts.switch ? [wallZ(SWITCH, -94, -10, 10, 18), topZ(SWITCH, -100, -94, -10, 10, 18), wallZ(SWITCH, -100, -10, 10, 18)] : []),
    // LATER 305: `camera`, a wall across z `back` behind a SEAL at the switch (x -10..10, 60 high), which pulls its camera
    // in, and a ceiling at `ceiling` from 2 in front of it, which pushes the pulled-in eye down (the pass's up probe).
    ...(opts.camera ? [wallZ(CAMWALL, opts.camera.back, -10, 10, 60), topZ(CAMWALL, opts.camera.back - 2, opts.camera.back, -10, 10, opts.camera.ceiling)] : [])];
  const owners: CollisionOwner[] = [];
  polys.forEach((q, i) => {
    const last = owners.at(-1);
    if (last?.path === q.path) owners[owners.length - 1] = { ...last, count: last.count + 1 };
    else owners.push({ modelName: 'worldmodel', path: q.path, first: i, count: 1, flags: 0x1001 });
  });
  const ground = packGround(PARAMS, polys, owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -600, -200 + i * 50), slot(1, i, 600, -200 + i * 50)]);
  const paths = ['worldmodel/floor', ROOT, REAL, GOOD, DI, BAD, LEFT, ACTION, BASE, `${BASE}/healthy`, BASEDI, ...(opts.switch ? [SWITCH] : []), ...(opts.camera ? [CAMWALL] : [])];
  const instances = paths.map((path, id) => ({ id, path, node: path.split(/[/=]/).pop()!, modelName: 'worldmodel', root: path }));
  const destroy: EffectProgram = {
    name: 'destroy_access1', root: 1, flags: 0x22, nodes: ['NA', 'access1', 'good_parts', 'di_good', 'whats_left', 'bad_parts'],
    sequences: [
      { name: 'NA', activation: 1, ops: [
        { op: 'if', conditions: [{ kind: 'valve', valve: 'NA', operation: 2, operand: 0, context: true }] },
        { op: 'callSequence', sequence: 'access_destroy' },
        { op: 'valve', valve: 'NA', operation: 0x0b, operand: 1, context: true },
        { op: 'endif' },
      ] },
      { name: 'access_destroy', activation: 2, ops: [
        { op: 'active', node: 2, on: false }, { op: 'active', node: 3, on: false }, { op: 'active', node: 4, on: true },
        { op: 'if', conditions: [{ kind: 'valve', valve: 'skip_effects', operation: 2, operand: 0 }] },
        { op: 'active', node: 5, on: true },
        { op: 'endif' },
      ] },
    ],
  };
  const access: EffectProgram = {
    name: 'access1', root: 1, flags: 0x2b, nodes: ['NA', 'access1', 'di_good'],
    sequences: [{ name: 'NA', activation: 1, ops: [{ op: 'executeAction', anim: 'set_access1' }] }],
  };
  const base: EffectProgram = {
    name: 'destroy_terrorist_base', root: 1, flags: 0x23, nodes: ['NA', 'terrorist_base', 'basedi'],
    sequences: [{ name: 'NA', activation: 1, ops: [{ op: 'active', node: 2, on: false }] }],
  };
  const save = (path: string, deactivate = false) => ({ path, deactivate, saveActive: true, saveTransform: false, saveParent: false });
  const meta: MapMeta = {
    stem: 'MP99', instances, instanceByPath: new Map(instances.map((i) => [i.path, i.id])), diagnostics: [],
    actions: [{
      node: 'access_action1', path: ACTION, at: [0, 0, 300], type: '', typeCode: 8, valve: 'set_access1',
      anims: ['destroy_access1'], team: null, range: 32, elevation: -1, points: 2, bitmap: '',
    }, ...(opts.switch ? [{
      node: 'switch1', path: SWITCH, at: [0, 0, -94] as V3, type: 'SWITCH', typeCode: 2, valve: 'switch1',
      anims: [], team: null, range: 32, elevation: -1, points: 0, bitmap: '',
    }] : [])],
    initial: [save(GOOD), save(DI), save(BAD, true), save(LEFT, true), save(BASEDI)],
    scene: {
      programs: [{ program: destroy, search: [0, 0, 1, 1, 1, 1] }],
      destructibles: [
        { id: 0, key: `access1#0@${ROOT}`, anim: 'access1', instance: 1, root: ROOT, targetPath: DI, health: 1, armor: 0, shield: opts.shield ?? 17, program: access, nodes: [null, ROOT, DI] },
        { id: 1, key: `destroy_terrorist_base#0@${BASE}`, anim: 'destroy_terrorist_base', instance: 8, root: BASE, targetPath: BASEDI, health: 2, armor: 0, shield: 21, program: base, nodes: [null, BASE, BASEDI] },
      ],
    },
  };
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [], meta };
}

const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
const round = (over: Partial<ThrowableRecord>): ThrowableRecord => ({ ...M67, ...over });
const HEAT = round({ name: 'LAW HEAT', id: 185, muzzleVelocity: 200, acceleration: 980, armingDistance: 100, impact: true, hasBackblast: true, fuse: 20, removal: 20.1, capacity: 1, explosionDamage: 20, explosionRadius: 150, impactDamage: 20, effectiveRange: 3500, maximumRange: 100000 });
const RPG = round({ ...HEAT, name: 'RPG', id: 186, muzzleVelocity: 400 });
const BACKBLAST = round({ name: 'Backblast', id: 159, muzzleVelocity: 0, fuse: 0, removal: 0.1, capacity: 1, explosionDamage: 6, explosionRadius: 70 });
/** PF-35: with the bit the disc's `C4 Ammo` carries (`IgnoreExplosionDI`, `throwableRecord`; `projectile.test.ts`). */
const C4 = round({ ...CLAYMORE, name: 'C4', id: 151, fuse: 6, removal: 0.1, explosionDamage: 18, explosionRadius: 50, ignoreExplosionDI: true });
const item = (name: string, id: number, extra: unknown[] = []): unknown[] => ['InternalName', [name], 'ID', [String(id)], 'Ammo_Capacity', ['1'], 'NumMags', ['1'], 'AMMO_TYPES', [[]], ...extra];
const arsenal = arsenalOf(['ZAMMO', [], 'ZWEAPON', [
  item('M4A1 SD', 62), item('Mark 23', 15), item('Sig 552', 57), item('M9', 5),
  item('RPG LAUNCHER', 146, ['SlotCost', ['2']]), item('RPG', 186), item('C4', 151), item('Claymore', 153), item('Backblast', 159), item('M67', 121), item('HE', 126),
] as never]);
/** Vigilance's `Enable_c4 = 9` (176 s7.3): C4 for both sides; the rest each side's own. */
const VALVES = new Map([['Enable_c4', 9], ['Enable_M4A1_SD', 1], ['Enable_Mark23', 1], ['Enablesig_commando', 8], ['Enable_beretta_m9', 8], ['Enable_frag', 9], ['Enable_HEgren', 9], ['Enable_RPG', 9]]);
function kits(terrorist: Loadout, seal: Loadout, records: readonly WeaponRecord[] = [DEFAULT_RIFLE, HELD_SIDEARM]): SimKits {
  const r = (x: ThrowableRecord) => ({ record: x, piercing: 0, fireWait: 3, reloadAfterShot: true, reloadDelayAfterShot: 1, icon: null });
  return {
    table: {
      arsenal, records: new Map(records.map((x) => [x.id, x])),
      rounds: new Map([[185, r(HEAT)], [186, r(RPG)]]),
      throwables: new Map([M67, C4, BACKBLAST, CLAYMORE].map((x) => [x.id, { record: x, piercing: x.id === 121 ? 4 : 0 }])),
    },
    map: {
      valves: VALVES, selectable: { seal: [], terrorist: [] },
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
const tok = (tab: number | string): string => `tab${tab}`.padEnd(22, '_');

/** Player 1 (a Terrorist) and player 2 (a SEAL) at `t` and `s` (roomEquipment.test.ts' `setup`, rounds of 2 s). */
function setup(terrorist: Loadout, seal: Loadout, t: V3, s: V3, world: SimMap = barrierMap(), records?: readonly WeaponRecord[], roundSeconds = 30) {
  let seed = 1;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const room = new Room(world, null, { now: () => 0, random, roundSeconds }, null, kits(terrorist, seal, records));
  const join = (id: number): Client => {
    const c = new Client();
    room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99', session: tok(id) }, `10.0.0.${id}`);
    return c;
  };
  const a = join(1), b = join(2);
  room.step();
  const place = (id: number, at: V3): void => { room.player(id)!.sim.walker.place(at[0], at[1] + 20, at[2]); };
  place(1, t); place(2, s);
  for (let i = 0; i < 30; i++) room.step();
  const eye = (id: number): V3 => { const w = room.player(id)!.sim.walker.state; return [w.x, w.y + EYE_HEIGHT, w.z]; };
  const send = (id: number, kind: string, from: V3, velocity: V3): void => room.text(id, { type: 'throw', seq: room.player(id)!.sim.seq, kind, from, velocity });
  /** PF-13: the page's C4 plant, naming the destructible (`target`) and the struck node and point (`surface`). */
  const plant = (id: number, from: V3, velocity: V3, target: number, surface: { path: string; point: V3 }): void =>
    room.text(id, { type: 'throw', seq: room.player(id)!.sim.seq, kind: 'C4', from, velocity, target, surface });
  const run = (seconds: number): void => { for (let i = 0; i < Math.round(seconds * TICK_HZ); i++) room.step(); };
  /** `pitch`, degrees (LATER 139: an honest page looks where it names). */
  const drive = (id: number, seconds: number, pitch = 0): void => {
    for (let i = 0; i < Math.round(seconds * TICK_HZ); i++) {
      const p = room.player(id)!;
      const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch, turn: 0, buttons: 0, stance: 0, weapon: 0 };
      room.binary(id, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
      room.step();
    }
  };
  /** The witness segment through the barrier (z 320 -> 340) and through the base (z -320 -> -340): the hulls met. */
  const through = (): string[] => segmentHits(room.map.grid, [0, 20, 320], [0, 20, 340]).map((h) => h.owner.path);
  const base = (): string[] => segmentHits(room.map.grid, [0, 20, -320], [0, 20, -340]).map((h) => h.owner.path);
  /** The next round: the clock run out, the round's end held, the next round's start. */
  const nextRound = (): void => { const n = a.of('roundStart').length; for (let i = 0; i < 120 * TICK_HZ && a.of('roundStart').length === n; i++) room.step(); };
  return { room, a, b, join, eye, send, plant, run, drive, through, base, place, nextRound };
}

const NO_C4 = kit(62, 15, 121, 126, 255), SEAL_C4 = kit(62, 15, 121, 126, 151);
/** The launcher in the room's hand (`Player.held`), which the player's public view does not carry. */
const heldOf = (p: unknown): number | null => (p as { held: number | null }).held;
/** LATER 144: the room's placing start, which the player's public view does not carry (`Room.player`). */
const placeStartOf = (p: unknown): { seq: number; eye: V3 | null; frames?: unknown[] | null } | null | undefined =>
  (p as { placeStart?: { seq: number; eye: V3 | null; frames?: unknown[] | null } | null }).placeStart;
/** LATER 139: the room's cone, for its look at a command (`ShotCone.lookAt`), which the public view does not carry. */
const coneOf = (p: unknown): { lookAt(seq: number, point: readonly number[]): boolean } => (p as { cone: { lookAt(seq: number, point: readonly number[]): boolean } }).cone;

/**
 * LATER 139: the pitch (degrees) at which a standing body at `feet` facing `yaw` aims its camera's ray -- `localCamera`'s eye
 * toward its look's far point, as the room's `aimRays` -- through `point`: what an honest page's look is when it names
 * that point. Bisection on the ray's height at the point's distance (it rises with the pitch).
 */
function aimingPitch(feet: V3, yaw: number, point: V3): number {
  const miss = (pitch: number): number => {
    const local = localCamera(rootY('stand'), pitch, 0);
    const eye = toWorld(feet, yaw, local.eye);
    const far = toWorld(feet, yaw, [local.target[0] + local.ahead[0] * 1000, local.target[1] + local.ahead[1] * 1000, local.target[2] + local.ahead[2] * 1000]);
    const flat = (q: readonly number[]): number => Math.hypot(q[0]! - eye[0], q[2]! - eye[2]);
    return eye[1] + (far[1] - eye[1]) * (flat(point) / flat(far)) - point[1];
  };
  let lo = -89, hi = 89;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (miss(mid) > 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}

describe('the access barriers in the room (SUP-03)', () => {
  it('C4 at a shield-17 barrier is accepted and opens it at its Timer1; at a shield-21 base the plant is refused; an M67 at the barrier leaves it', () => {
    const s = setup(NO_C4, SEAL_C4, [600, 0, 0], [0, 0, 300]);
    expect(s.through()).toEqual([DI]);
    // An M67 (10, 15 m) at the SEAL's feet, 30 short of the wall: in reach, under its shield.
    s.drive(2, 0.5);
    s.send(2, 'M67', [0, 15.4 + 0.1, 300], [0, 0, 0]);
    s.place(2, [0, 0, -100]);
    s.run(3.6);
    expect(s.a.of('grenade').filter((g) => g.kind === 'M67')).toHaveLength(1);   // thrown, gone off (3.5 s) by now
    expect(s.room.player(2)!.grenades.M67).toBe(2);
    expect(s.through()).toEqual([DI]);
    expect(s.room.world.health.hp(0)).toBe(1);
    // At the base (21 over C4's 18): refused, the charge kept, nothing told.
    s.place(2, [0, 0, -300]);
    s.run(0.5);
    s.plant(2, [0, 0.1, -302], [0, 0, -1], 1, { path: BASEDI, point: [0, 12, -330] });
    expect(s.room.player(2)!.grenades.C4).toBe(4);
    expect(s.a.of('grenade').filter((g) => g.kind === 'C4')).toHaveLength(0);
    // At the barrier, 14 from it, still: planted; off at its Timer1 (6 s), the barrier opens -- not before. AD-5: the
    // charge at z 318, 16.9 u from the midpoint (0, 12, 330), takes the whole 18 (was 30 from it, the charge at z 302).
    s.place(2, [0, 0, 316]);
    s.run(0.5);
    s.plant(2, [0, 0.1, 318], [0, 0, 1], 0, { path: DI, point: [0, 12, 330] });
    expect(s.room.player(2)!.grenades.C4).toBe(3);
    expect(s.a.of('grenade').filter((g) => g.kind === 'C4')).toHaveLength(1);
    s.place(2, [0, 0, -100]);
    s.run(5.8);
    expect(s.through()).toEqual([DI]);
    s.run(0.4);
    expect(s.through()).toEqual([]);
    expect(s.room.world.isActive(LEFT)).toBe(true);
    expect(s.room.world.valve('set_access1')).toBe(1);
    expect(s.base()).toEqual([BASEDI]);
  });

  // LATER 220's third head (research 369 §2): C4's offer (0x40000) is built past the prompts' common gate (D:L452383, and
  // its press D:L452029): a plant named on a command the gate shuts -- here under the rifle's reload named on it -- is
  // refused by why, the charge kept. Was: planted.
  it("LATER 220: C4 named on a command a reload was named on (arrived before it) is refused 'reload', the charge kept; on an open command, planted", () => {
    const s = setup(NO_C4, SEAL_C4, [600, 0, 0], [0, 0, 316]);
    s.drive(2, 0.5);
    const S = s.room.player(2)!.sim.seq;
    s.room.takeDrops();
    s.room.text(2, { type: 'reload', seq: S });
    s.plant(2, [0, 0.1, 318], [0, 0, 1], 0, { path: DI, point: [0, 12, 330] });
    s.drive(2, 0.2);                                                           // decided once its command has run (timed)
    expect(s.room.player(2)!.grenades.C4, 'the charge kept').toBe(4);
    expect(s.room.takeDrops()?.['throw: reload']).toBe(1);
    s.drive(2, 3);                                                             // the reload over
    s.plant(2, [0, 0.1, 318], [0, 0, 1], 0, { path: DI, point: [0, 12, 330] });
    s.drive(2, 0.2);
    expect(s.room.player(2)!.grenades.C4, 'planted on an open command').toBe(3);
  });

  // LATER 121 (`c4Line`): the named point is where the line from the head first meets the barrier. A forged page naming
  // the far face of a barrier 6 thick (past the slack) is refused -- since #321 the point is the blast's centre, which it
  // would have moved through the barrier; the honest near face is planted.
  it("LATER 121: C4 named on a thick barrier's far face is refused 'c4 missed', the charge kept; on its near face it is planted", () => {
    const s = setup(NO_C4, SEAL_C4, [600, 0, 0], [0, 0, 300], barrierMap({ thick: 6 }));
    s.place(2, [0, 0, 316]);
    s.run(0.5);
    s.room.takeDrops();
    s.plant(2, [0, 0.1, 318], [0, 0, 1], 0, { path: DI, point: [0, 12, 336] });
    expect(s.room.takeDrops()).toEqual({ 'throw: c4 missed': 1 });
    expect(s.room.player(2)!.grenades.C4).toBe(4);
    expect(s.a.of('grenade').filter((g) => g.kind === 'C4')).toHaveLength(0);
    s.plant(2, [0, 0.1, 318], [0, 0, 1], 0, { path: DI, point: [0, 12, 330] });
    expect(s.room.player(2)!.grenades.C4).toBe(3);
    expect(s.a.of('grenade').filter((g) => g.kind === 'C4')).toHaveLength(1);
  });

  // The review's F1: the page picks from its camera (28 behind, 5.6 above the head at pitch 0), so a plant on the barrier's
  // top face the camera strikes first over the near edge is honest, though the head's line meets the near face first.
  // The room judges it along the camera's eye at the ask's command (`orderOrigin(p, ev.seq)`) as well as the head's.
  it("LATER 121 (F1): C4 on a barrier's top face, the camera's first hit over its near edge, is planted; its far face is still refused", () => {
    const s = setup(NO_C4, SEAL_C4, [600, 0, 0], [0, 0, 300], barrierMap({ thick: 6, top: 18 }));
    s.place(2, [0, 0, 316]);
    s.room.player(2)!.sim.walker.state.yaw = 180;                                        // facing +z, the barrier
    s.drive(2, 0.5);
    // LATER 139: each point named at the pitch whose camera ray passes through it -- an honest page's look.
    const aimAt = (point: V3): void => { const w = s.room.player(2)!.sim.walker.state; s.drive(2, 0.25, aimingPitch([w.x, w.y, w.z], w.yaw, point)); };
    s.room.takeDrops();
    aimAt([0, 6, 336]);
    s.room.takeDrops();
    s.plant(2, [0, 0.1, 318], [0, 0, 1], 0, { path: DI, point: [0, 6, 336] });
    expect(s.room.takeDrops()).toEqual({ 'throw: c4 missed': 1 });
    aimAt([0, 18, 334]);
    s.room.takeDrops();
    s.plant(2, [0, 0.1, 318], [0, 0, 1], 0, { path: DI, point: [0, 18, 334] });
    expect(s.room.takeDrops()).toBeNull();
    expect(s.room.player(2)!.grenades.C4).toBe(3);
  });

  it("LATER 121 (F1): a SWITCH pressed on its far face is refused 'missed'; on its top face, the camera's first hit, its line passes", () => {
    const s = setup(NO_C4, SEAL_C4, [600, 0, 0], [0, 0, -84], barrierMap({ switch: true }));
    s.room.player(2)!.sim.walker.state.yaw = 0;                                          // facing -z, the switch
    s.drive(2, 0.5);
    const i = s.room.world.meta.actions.findIndex((x) => x.node === 'switch1');
    // LATER 139: each press at the pitch whose camera ray passes through its point -- an honest page's look.
    const press = (point: V3): void => {
      const w = s.room.player(2)!.sim.walker.state;
      s.drive(2, 0.25, aimingPitch([w.x, w.y, w.z], w.yaw, point));
      s.room.takeDrops();
      s.room.text(2, { type: 'action', seq: s.room.player(2)!.sim.seq, action: i, surface: { path: SWITCH, point } });
    };
    s.room.takeDrops();
    press([0, 9, -100]);
    expect(s.room.takeDrops()).toEqual({ 'action: missed': 1 });
    press([0, 18, -96]);
    expect(s.room.takeDrops()).toEqual({ 'action: busy': 1 });                        // past the line: no program to run
    press([0, 9, -94]);
    expect(s.room.takeDrops()).toEqual({ 'action: busy': 1 });                        // the near face: honest, as before
  });

  // LATER 139 (its second fix; the merge controller's approved plan, 2026-10-21): the camera's eye counts only where its
  // look passes through the point -- judged on the swept camera locus (`ShotCone` `lookFitsPoint`: the blends, the root's
  // slack, the lead probe; the page's side probes shift the eye and its view re-aims at a far point 1000 out, so every
  // honest aim line runs along the look), at the placing's start and at the send. Pressed against an open-topped barrier
  // 6 thick at -80, the camera over the gap sees the far face's inside first, but its look runs down past it.
  it("LATER 139: a far face's inside, seen from a steep camera over an open-topped barrier but off its look, is refused 'c4 missed'", () => {
    const s = setup(NO_C4, SEAL_C4, [600, 0, 0], [0, 0, 300], barrierMap({ thick: 6 }));
    s.place(2, [0, 0, 325]);
    s.room.player(2)!.sim.walker.state.yaw = 180;                                        // facing +z, the barrier
    s.drive(2, 0.5, -80);
    // The far face's inside near its top: seen first from the camera over the gap, but over 3 off its look's line.
    const point: V3 = [0, 22, 336], w = s.room.player(2)!.sim.walker.state, local = localCamera(rootY('stand'), -80, 0);
    const eye = toWorld([w.x, w.y, w.z], w.yaw, local.eye), d = toWorld([0, 0, 0], w.yaw, local.ahead);
    const v = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]], along = v[0]! * d[0] + v[1]! * d[1] + v[2]! * d[2];
    expect(Math.hypot(v[0]! - d[0] * along, v[1]! - d[1] * along, v[2]! - d[2] * along), 'off the look').toBeGreaterThan(3);
    s.room.takeDrops();
    s.plant(2, [0, 0.1, 326], [0, 0, 1], 0, { path: DI, point });
    expect(s.room.takeDrops()).toEqual({ 'throw: c4 missed': 1 });
    expect(s.room.player(2)!.grenades.C4).toBe(4);
  });

  it("LATER 139: the same steep camera's honest pick -- the point its look strikes -- is planted", () => {
    const s = setup(NO_C4, SEAL_C4, [600, 0, 0], [0, 0, 300], barrierMap({ thick: 6 }));
    s.place(2, [0, 0, 325]);
    s.room.player(2)!.sim.walker.state.yaw = 180;
    s.drive(2, 0.5, -80);
    // Where the look's line meets the far face (z 336): the point an honest page at -80 names there.
    const w = s.room.player(2)!.sim.walker.state, local = localCamera(rootY('stand'), -80, 0);
    const eye = toWorld([w.x, w.y, w.z], w.yaw, local.eye), d = toWorld([0, 0, 0], w.yaw, local.ahead);
    const t = (336 - eye[2]) / d[2], point: V3 = [eye[0] + d[0] * t, eye[1] + d[1] * t, 336];
    expect(point[1]).toBeGreaterThan(0);
    expect(point[1]).toBeLessThan(24);                                                  // on the face, under its top
    s.room.takeDrops();
    s.plant(2, [0, 0.1, 326], [0, 0, 1], 0, { path: DI, point });
    expect(s.room.takeDrops()).toBeNull();
    expect(s.room.player(2)!.grenades.C4).toBe(3);
  });

  // LATER 139 (LATER 121's re-review, L1): the camera's eye counts only where its look passes through the point. Pressed
  // against an open-topped barrier 6 thick, looking down at -80, the camera sits over the gap (35.5 high, 5.4 ahead of the
  // feet) and sees the far face's inside first -- but its aim ray runs down past it, so a page naming that point forges.
  // LATER 144 (LATER 139's review): the page saves its C4 aim at the placing's start (`grenade.ts` `plantC4`) and sends the
  // throw at the clip's end, C4_PLANT_SECONDS (1.098 s) on; LATER 121 judged the camera's eye at the send's command only,
  // so a top-face plant aimed at -12 and pitched up past about +7.5 mid-clip -- its camera eye lowered under the near
  // edge's line -- was refused 'c4 missed'. The eye at the placing's start counts too (`placeStart`), for its own clip only.
  /**
   * `claymore`: a claymore placed between the plant's hold and its throw, the C4's own hold start then unseen. `after`:
   * seconds more at `sendPitch` past the clip before the throw (LATER 144's re-review: the start eye's window). `forge`:
   * the throw names the start's seq plus this, whatever the room ran (the narrow re-review's F-A); `jitter`: room ticks
   * with no command between the clip and the throw's arrival.
   */
  const plantDrifted = (point: V3, startPitch: number, sendPitch: number, claymore = false, after = 0, more: { forge?: number; jitter?: number; lockBefore?: boolean } = {}) => {
    const s = setup(NO_C4, claymore ? kit(62, 15, 121, 153, 151) : SEAL_C4, [600, 0, 0], [0, 0, 300], barrierMap({ thick: 6, top: 18 }));
    s.place(2, [0, 0, 316]);
    s.room.player(2)!.sim.walker.state.yaw = 180;                                        // facing +z, the barrier
    s.drive(2, 0.5, startPitch);
    s.room.takeDrops();
    const p = s.room.player(2)!;                                                          // the placing's hold laid at the aim
    // LATER 220 head 3's review F1: a reload named on the command before the press (K - 1), arrived before it.
    if (more.lockBefore) s.room.text(2, { type: 'reload', seq: p.sim.seq });
    const start: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: startPitch, turn: 0, buttons: holdBits(C4_PLANT_CLIP), stance: 0, weapon: 0 };
    s.room.binary(2, encodeCommands({ viewTick: s.room.tick, commands: [start] }));
    s.room.step();
    // The clip's 1.1 s, the look pitched up at an even rate (about 25 deg/s, under the stick's full ~49) -- the room's own
    // look-rate cap passes it unclamped.
    const n = Math.round(1.1 * TICK_HZ);
    for (let i = 1; i <= n; i++) s.drive(2, 1 / TICK_HZ, startPitch + (sendPitch - startPitch) * (i / n));
    if (after > 0) s.drive(2, after, sendPitch);
    expect(s.room.takeDrops()).toBeNull();                                               // the look unclamped throughout
    if (claymore) {
      s.room.takeDrops();
      const held = s.room.player(2)!.grenades.Claymore!;
      s.send(2, 'Claymore', [0, 0, 314], [0, 0, 1]);                                     // set down at the hand, facing +z
      expect(s.room.takeDrops()).toBeNull();
      expect(s.room.player(2)!.grenades.Claymore).toBe(held - 1);                        // placed
    }
    s.room.takeDrops();
    for (let i = 0; i < (more.jitter ?? 0); i++) s.room.step();
    if (more.forge === undefined) s.plant(2, [0, 0.1, 318], [0, 0, 1], 0, { path: DI, point });
    else s.room.text(2, { type: 'throw', seq: start.seq + more.forge, kind: 'C4', from: [0, 0.1, 318], velocity: [0, 0, 1], target: 0, surface: { path: DI, point } });
    return s;
  };
  // LATER 220 head 3's review F1: the honest plant reaches `decide` about 66 commands after its press, past the cone's
  // 64 -- the gate is judged when the placing's start command runs (`placeStart.gate`, banked there) and read at the
  // plant: a press read under the rifle's reload named on K - 1 is refused 'reload', the charge kept.
  it("LATER 220 (head 3's review F1): a C4 placing pressed under a reload named on the command before it is refused 'reload' at its plant, the charge kept", () => {
    const w: V3 = [0, 0, 316], point: V3 = [0, 18, 334];
    // The plant sent once the reload's lock has ended (`after`): judged at the plant's end the lock is gone; at its press
    // it held.
    const s = plantDrifted(point, aimingPitch(w, 180, point), 15, false, 3, { lockBefore: true });
    expect(s.room.takeDrops()).toEqual({ 'throw: reload': 1 });
    expect(s.room.player(2)!.grenades.C4).toBe(4);
  });

  it("LATER 220 (head 3's review F1): the gate's verdict is banked on the placing's start while its command runs ('reload' under a lock on K - 1; null on an open one)", () => {
    for (const lock of [true, false]) {
      const s = setup(NO_C4, SEAL_C4, [600, 0, 0], [0, 0, 300], barrierMap({ thick: 6, top: 18 }));
      s.place(2, [0, 0, 316]);
      s.drive(2, 0.5);
      const p = s.room.player(2)!;
      if (lock) s.room.text(2, { type: 'reload', seq: p.sim.seq });
      const start: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: holdBits(C4_PLANT_CLIP), stance: 0, weapon: 0 };
      s.room.binary(2, encodeCommands({ viewTick: s.room.tick, commands: [start] }));
      s.room.step();
      const ps = (p as unknown as { placeStart: { seq: number; gate?: string | null } | null }).placeStart;
      expect(ps?.seq, 'the start noted').toBe(start.seq);
      expect(ps?.gate, `banked, lock ${lock}`).toBe(lock ? 'reload' : null);
    }
  });

  it("LATER 144: a top-face plant aimed at -12 and pitched up to +15 during its clip is planted (the placing's start eye counts)", () => {
    const w: V3 = [0, 0, 316], point: V3 = [0, 18, 334];
    const s = plantDrifted(point, aimingPitch(w, 180, point), 15);
    expect(s.room.takeDrops()).toBeNull();
    expect(s.room.player(2)!.grenades.C4).toBe(3);
  });
  it("LATER 139 (the merge controller's pin): the drifted plant's send-time look misses the point, its start's fits -- planted from the start eye alone", () => {
    // The look drifted down to -35 over the clip (about 20 deg/s, under the room's look-rate cap): at the send it runs
    // well under the top face (at +15 it still passes near it within the root's slack -- LATER 144's refusal there is the
    // eye under the near edge, not the look).
    const w: V3 = [0, 0, 316], point: V3 = [0, 18, 334];
    const d = plantDrifted(point, aimingPitch(w, 180, point), -35);
    const p = d.room.player(2)!;
    expect(coneOf(p).lookAt(p.sim.seq, point), 'the send\'s look at -35').toBe(false);
    expect(d.room.takeDrops()).toBeNull();
    expect(p.grenades.C4).toBe(3);
  });
  it("LATER 144 (pin): the far face, named after the same drift, is still refused 'c4 missed'", () => {
    const w: V3 = [0, 0, 316], point: V3 = [0, 6, 336];
    const s = plantDrifted(point, aimingPitch(w, 180, point), 15);
    expect(s.room.takeDrops()).toEqual({ 'throw: c4 missed': 1 });
    expect(s.room.player(2)!.grenades.C4).toBe(4);
  });

  // LATER 144's re-review (F1): the start eye is the camera's at the start command's own look, never the level fallback --
  // a look held at +15 through the whole clip puts the eye at 15.2, under the near edge, from either moment.
  it("LATER 144 (re-review F1): the start eye is the camera's at the start command's own look, within ORDER_EYE_BOUND", () => {
    const s = setup(NO_C4, SEAL_C4, [600, 0, 0], [0, 0, 300], barrierMap({ thick: 6, top: 18 }));
    s.place(2, [0, 0, 316]);
    s.room.player(2)!.sim.walker.state.yaw = 180;
    const pitch = aimingPitch([0, 0, 316], 180, [0, 18, 334]);
    s.drive(2, 0.5, pitch);
    const p = s.room.player(2)!;
    const start: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch, turn: 0, buttons: holdBits(C4_PLANT_CLIP), stance: 0, weapon: 0 };
    s.room.binary(2, encodeCommands({ viewTick: s.room.tick, commands: [start] }));
    s.room.step();
    const w = p.sim.walker.state, want = toWorld([w.x, w.y, w.z], w.yaw, localCamera(rootY('stand'), pitch, 0).eye);
    const level = toWorld([w.x, w.y, w.z], w.yaw, localCamera(rootY('stand'), 0, 0).eye);
    const got = placeStartOf(p)?.eye;
    expect(placeStartOf(p)?.seq).toBe(start.seq);
    expect(got).toBeTruthy();
    // LATER 139 (the merge controller's pin): the look's frames banked with the eye, so the start eye is never dropped for want of them.
    expect(placeStartOf(p)?.frames?.length ?? 0).toBeGreaterThan(0);
    expect(Math.hypot(got![0] - want[0], got![1] - want[1], got![2] - want[2])).toBeLessThanOrEqual(ORDER_EYE_BOUND);
    expect(Math.hypot(got![0] - level[0], got![1] - level[1], got![2] - level[2])).toBeGreaterThan(ORDER_EYE_BOUND);   // never the level fallback
  });

  it("LATER 144 (re-review F1): a look held at +15 through the whole clip is refused 'c4 missed' on the top face", () => {
    const s = plantDrifted([0, 18, 334], 15, 15);
    expect(s.room.takeDrops()).toEqual({ 'throw: c4 missed': 1 });
    expect(s.room.player(2)!.grenades.C4).toBe(4);
  });

  it("LATER 144 (re-review F2): a throw past the start's clip gets no start eye -- the drifted plant sent 0.5 s late is refused", () => {
    const w: V3 = [0, 0, 316], point: V3 = [0, 18, 334];
    const s = plantDrifted(point, aimingPitch(w, 180, point), 15, false, 0.5);
    expect(s.room.takeDrops()).toEqual({ 'throw: c4 missed': 1 });
    expect(s.room.player(2)!.grenades.C4).toBe(4);
  });

  // LATER 144's narrow re-review (F-A): the window is the room's own event clock (`eventClock`), never the seq the page
  // names -- a throw naming the start's seq plus the clip, sent 5 s late, was planted on the banked eye.
  // LATER 220's third head: C4 is decided at its command (`timed`, `decide`), so 5 s late it meets `decide`'s stale bound
  // (FIRE_ARRIVAL_JITTER_TICKS) before `placeCharge`'s start-eye test. *Was* 'c4 missed' (judged at arrival, no start eye,
  // the line from the present head off the barrier). Either way refused, the charge kept (research 369 §3).
  it("LATER 144 (re-review F-A): a throw naming a seq inside the clip but arriving 5 s late is refused, the charge kept ('stale' since LATER 220; was 'c4 missed')", () => {
    const w: V3 = [0, 0, 316], point: V3 = [0, 18, 334];
    const s = plantDrifted(point, aimingPitch(w, 180, point), 15, false, 5, { forge: Math.round(1.1 * TICK_HZ) });
    expect(s.room.takeDrops()).toEqual({ 'throw: stale': 1 });
    expect(s.room.player(2)!.grenades.C4).toBe(4);
  });
  it("LATER 144 (pin): the honest drifted plant whose throw arrives FIRE_ARRIVAL_JITTER_TICKS late is still planted", () => {
    const w: V3 = [0, 0, 316], point: V3 = [0, 18, 334];
    const s = plantDrifted(point, aimingPitch(w, 180, point), 15, false, 0, { jitter: FIRE_ARRIVAL_JITTER_TICKS });
    expect(s.room.takeDrops()).toBeNull();
    expect(s.room.player(2)!.grenades.C4).toBe(3);
  });

  // LATER 144's re-review (F2): a hold laid on the barrier's far side, the body then on the near side -- the far face named
  // from there was planted through the barrier on the stale eye. Past the clip (the window) and inside it (the feet).
  const farSideHold = (wait: number, back: number) => {
    const s = setup(NO_C4, SEAL_C4, [600, 0, 0], [0, 0, 300], barrierMap({ thick: 6, top: 18 }));
    s.place(2, [0, 0, 350]);
    s.room.player(2)!.sim.walker.state.yaw = 0;                                          // facing -z, the far face's outside
    s.drive(2, 0.5);
    const p = s.room.player(2)!;
    const start: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: holdBits(C4_PLANT_CLIP), stance: 0, weapon: 0 };
    s.room.binary(2, encodeCommands({ viewTick: s.room.tick, commands: [start] }));
    s.room.step();
    expect(placeStartOf(p)?.eye).toBeTruthy();                                               // an eye banked on the far side
    if (wait > 0) s.drive(2, wait);
    s.place(2, [0, 0, 316]);
    s.room.player(2)!.sim.walker.state.yaw = 180;                                        // on the near side
    s.drive(2, back);
    s.room.takeDrops();
    s.plant(2, [0, 0.1, 318], [0, 0, 1], 0, { path: DI, point: [0, 6, 336] });
    return s;
  };
  it("LATER 144 (re-review F2): a start eye banked on the barrier's far side does not pass a far-face plant from the near side, past its clip", () => {
    const s = farSideHold(3, 5);
    expect(s.room.takeDrops()).toEqual({ 'throw: c4 missed': 1 });
    expect(s.room.player(2)!.grenades.C4).toBe(4);
  });
  it("LATER 144 (re-review F2): nor inside its clip once the feet have left the hold's spot (C4_START_EYE_FEET_PLACEHOLDER)", () => {
    const s = farSideHold(0, 0.5);
    expect(s.room.takeDrops()).toEqual({ 'throw: c4 missed': 1 });
    expect(s.room.player(2)!.grenades.C4).toBe(4);
  });

  // LATER 122 (#398's fresh review, F1): a C4 plant knocked before its clip's callback falls to the kit's 99 s timer
  // (`C4_KIT_TIMER_SECONDS`, `C4_FALLBACK_PLACEHOLDER`), which runs `FUN_005c1970`'s same block (D:L476883-476905): it
  // asks only gone, refusing and moved (D:L476938-476940) and sets the charge at the saved point (D:L476979-476985) --
  // no reach or line from where the SEAL is by then. The page does so (`grenade.ts` `placeCharge`); the room judged the
  // feet and the head of that moment and refused 'c4 reach', so the page showed a charge the match did not have.
  /**
   * `knock`: the hold knocked 0.3 s into the clip (before the callback's 1.098 s); `at`: the throw's arrival, seconds
   * after the hold's start command (the fallback's 99, or another); `from`: the feet the hold is laid at (z; the near
   * face's point [0, 12, 330]); `away`: seconds walked off (-z) after the get-up. `slow`: the page's frames take 0.12 s of
   * wall time for 0.1 s of its ticks (its step capped at 0.1 s: `main.ts`, `matchMount.ts`), so the room's wall clock
   * runs 1.2 times its commands -- `at` is then the page's own seconds. `swap`: the firearm swapped (the command's weapon
   * 1) while walking off, C4 no longer in the hand.
   */
  // LATER 139: `map`, `point` and `pitch` (the start's look) for the fallback's forged case; absent, the honest plant.
  const fallbackPlant = (o: { knock?: boolean; at?: number; from?: number; away?: number; slow?: boolean; swap?: boolean; launcher?: boolean; stuff?: number;
    map?: ReturnType<typeof barrierMap>; point?: V3; pitch?: number } = {}) => {
    const s = setup(NO_C4, o.launcher ? kit(62, 15, 146, 186, 151) : SEAL_C4, [600, 0, 0], [0, 0, 300], o.map ?? barrierMap(), undefined, 200);
    const feet: V3 = [0, 0, o.from ?? 316], point: V3 = o.point ?? [0, 12, 330], pitch = o.pitch ?? aimingPitch(feet, 180, point);
    s.place(2, feet);
    s.room.player(2)!.sim.walker.state.yaw = 180;                                        // facing +z, the barrier
    s.drive(2, 0.5, pitch);
    const p = s.room.player(2)!;
    if (o.launcher) {
      // The page's own order: the RPG raised; C4's plant equips C4, which lowers the launcher (`matchThrow.ts` `equip`:
      // `rocket.lower()`, its firearm `throw` on the last command sent), and the placing's hold rides the next command.
      s.send(2, 'RPG LAUNCHER', s.eye(2), [0, 0, 0]);
      s.drive(2, launcherRaiseSeconds(0) + 0.05, pitch);
      expect(heldOf(p)).toBe(146);
      s.send(2, 'M4A1 SD', s.eye(2), [0, 0, 0]);                                       // the kit's primary (62) back
    }
    const start: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch, turn: 0, buttons: holdBits(C4_PLANT_CLIP), stance: 0, weapon: 0 };
    s.room.binary(2, encodeCommands({ viewTick: s.room.tick, commands: [start] }));
    s.room.step();
    expect(placeStartOf(p)?.eye).toBeTruthy();
    if (o.launcher) expect(heldOf(p)).toBeNull();                                           // lowered on the hold's command
    let ticks = 0, wall = 0, weapon: 0 | 1 = 0;
    const step = (forward: number, yaw: number, pitchNow: number, buttons = 0): void => {
      const cmd: Command = { seq: p.sim.seq + 1, forward, right: 0, yaw, pitch: pitchNow, turn: 0, buttons, stance: 0, weapon };
      s.room.binary(2, encodeCommands({ viewTick: s.room.tick, commands: [cmd] }));
      ticks++;
      for (wall += o.slow ? 1.2 : 1; wall >= 1; wall--) s.room.step();
    };
    for (let i = 0; i < Math.round(0.3 * TICK_HZ); i++) step(0, 180, pitch);
    if (o.knock !== false) expect(p.sim.walker.knock([0, 0, -60], 'fallBackwards')).toBe(true);   // a blast's knock
    for (let i = 0; i < Math.round(4 * TICK_HZ); i++) step(0, 180, 0);                    // the fall and the get-up
    s.room.player(2)!.sim.walker.state.yaw = 0;                                          // turned away (-z)
    if (o.swap) { weapon = 1; step(0, 0, 0, Button.Swap); }                              // the sidearm taken: C4 out of the hand
    for (let i = 0; i < Math.round((o.away ?? 3) * TICK_HZ); i++) step(1, 0, 0);
    // `stuff`: the last seconds' commands sent at once with the throw (a forged page's burst): run on the saved credit
    // (`CREDIT_MAX`) or counted received (`since`), they reach the 99 s, so only the event clock's floor holds the throw.
    const stuffed = Math.round((o.stuff ?? 0) * TICK_HZ);
    while (ticks < Math.round((o.at ?? 99) * TICK_HZ) - stuffed) step(0, 0, 0);
    if (stuffed > 0) {
      const cmds: Command[] = [];
      for (let i = 1; i <= stuffed; i++) cmds.push({ seq: p.sim.seq + i, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon });
      for (let i = 0; i < cmds.length; i += MAX_BATCH) s.room.binary(2, encodeCommands({ viewTick: s.room.tick, commands: cmds.slice(i, i + MAX_BATCH) }));
      const q = p as unknown as { ran: number; queue: unknown[]; placeStart: { ran: number } | null };
      expect(q.ran + q.queue.length - q.placeStart!.ran).toBeGreaterThanOrEqual(Math.ceil(99 * TICK_HZ));
    }
    const w = p.sim.walker.state;
    s.room.takeDrops();
    s.plant(2, [0, 0.1, 318], [0, 0, 1], 0, { path: DI, point });
    return { s, feet: [w.x, w.y, w.z] as V3, point };
  };
  it("LATER 122 (#398's review F1): a plant knocked mid-clip, its SEAL walked out of reach, is planted at the saved point by the 99 s fallback", () => {
    const { s, feet, point } = fallbackPlant();
    expect(Math.hypot(point[0] - feet[0], point[2] - feet[2])).toBeGreaterThan(32);     // out of C4_REACH_READING by then
    expect(s.room.takeDrops()).toBeNull();
    expect(s.room.player(2)!.grenades.C4).toBe(3);
    expect(s.b.of('placed').at(-1)).toMatchObject({ kind: 'C4', from: point });
  });
  // LATER 139 x LATER 122 (the merge controller's pins): the fallback's start eye counts only where its banked look passed
  // through the point -- the honest knocked plant above still plants; a far face's inside named through the fallback from a
  // steep camera over an open-topped barrier, off its start's look, is refused.
  // The gameplay seat's case: an honest fallback whose head line is walled (the top face behind the near edge) plants only
  // through the start's camera eye, so the start must bank its frames with its eye and its look must count.
  it("LATER 139 x 122: an honest knocked plant on the top face, seen only from the start's camera, still plants at 99 s", () => {
    const { s, point } = fallbackPlant({ map: barrierMap({ thick: 6, top: 18 }), point: [0, 18, 334] });
    expect(s.room.takeDrops()).toBeNull();
    expect(s.room.player(2)!.grenades.C4).toBe(3);
    expect(s.b.of('placed').at(-1)).toMatchObject({ kind: 'C4', from: point });
  });
  it("LATER 139 x 122: a forged far-face point through the 99 s fallback, off the start's look, is refused 'c4 missed'", () => {
    const { s } = fallbackPlant({ map: barrierMap({ thick: 6 }), from: 325, point: [0, 22, 336], pitch: -80 });
    expect(s.room.takeDrops()).toEqual({ 'throw: c4 missed': 1 });
    expect(s.room.player(2)!.grenades.C4).toBe(4);
  });
  it("LATER 122 (#398's re-read F1): a page whose frames run slower than wall time (0.12 s for its 0.1 s) is still planted at its own 99 s", () => {
    const { s, point } = fallbackPlant({ slow: true });
    expect(s.room.takeDrops()).toBeNull();
    expect(s.room.player(2)!.grenades.C4).toBe(3);
    expect(s.b.of('placed').at(-1)).toMatchObject({ kind: 'C4', from: point });
  });
  it("LATER 122 (#398's re-read F2): the firearm swapped before the timer's end plants nothing -- C4 not in the hand (D:L476887-476892)", () => {
    const { s } = fallbackPlant({ swap: true });
    expect(s.room.player(2)!.sim.weapon).toBe(1);
    expect(s.room.takeDrops()).toEqual({ 'throw: c4 hand': 1 });
    expect(s.room.player(2)!.grenades.C4).toBe(4);
  });
  it("LATER 122 (#398's narrow check F2, pin): a plant started with the launcher up -- lowered by C4's equip, as the page sends it -- is planted by the fallback", () => {
    const { s, point } = fallbackPlant({ launcher: true });
    expect(s.room.takeDrops()).toBeNull();
    expect(s.room.player(2)!.grenades.C4).toBe(3);
    expect(s.b.of('placed').at(-1)).toMatchObject({ kind: 'C4', from: point });
  });
  it("LATER 122 (#398's narrow check F1, pin): a stuffed queue with the throw 1 s early on the event clock is refused (the event clock's floor)", () => {
    const { s } = fallbackPlant({ stuff: 1 });
    expect(s.room.takeDrops()).toEqual({ 'throw: c4 reach': 1 });
    expect(s.room.player(2)!.grenades.C4).toBe(4);
  });
  it("LATER 122 (pins): the fallback's window and its start -- no knock, 50 s, or a hold laid out of reach -- are refused 'c4 reach'", () => {
    for (const o of [{ knock: false }, { at: 50 }, { from: 250, away: 0 }]) {
      const { s } = fallbackPlant(o);
      expect(s.room.takeDrops(), JSON.stringify(o)).toEqual({ 'throw: c4 reach': 1 });
      expect(s.room.player(2)!.grenades.C4).toBe(4);
    }
  });

  it("LATER 144 (the merge controller's case): a claymore's throw spends the start eye -- a later C4 whose own hold start the room did not see gets none", () => {
    const w: V3 = [0, 0, 316], point: V3 = [0, 18, 334];
    const s = plantDrifted(point, aimingPitch(w, 180, point), 15, true);
    expect(s.room.takeDrops()).toEqual({ 'throw: c4 missed': 1 });
    expect(s.room.player(2)!.grenades.C4).toBe(4);
  });

  // LATER 139's withdrawn first fix's open case (held here as `it.fails`) is the passing case above, since its second fix.

  // LATER 417 (2): B139's union lets one plant `throw` carry LATER 305's `eye` beside MLS-EQ's `slot` (research 361 §3);
  // the room's shape check takes both. Planted as without them (the eye only ever adds, LATER 305), spent from the named
  // slot's own ring once; the same plant naming a slot that does not hold C4 is refused, its eye no help.
  it("LATER 417: a C4 plant carrying both the page's eye and its kit slot is planted from that slot; a wrong slot with an eye is refused", () => {
    const s = setup(NO_C4, SEAL_C4, [600, 0, 0], [0, 0, 316]);
    s.run(0.5);
    const p = s.room.player(2)!;
    const c4 = (): number[] => p.equipmentSlots.state().filter((x) => x.kind === 'C4').map((x) => x.slot);
    expect(c4()).toEqual([4]);                                             // SEAL_C4: C4 in kit slot 4
    /** Slot 4's own ring: the rounds it holds. */
    const ring = (): number => p.equipmentSlots.state().find((x) => x.slot === 4)!.rounds.reduce((a, b) => a + b, 0);
    expect(ring()).toBe(4);
    const plant = (slot: number): void => s.room.text(2, {
      type: 'throw', seq: p.sim.seq, kind: 'C4', from: [0, 0.1, 318], velocity: [0, 0, 1], target: 0,
      surface: { path: DI, point: [0, 12, 330] }, eye: s.eye(2), slot,
    } as ClientEvent);
    s.room.takeDrops();
    plant(3);                                                              // slot 3 holds no C4
    expect(s.room.takeDrops()).toEqual({ 'throw: none left': 1 });
    expect(p.grenades.C4).toBe(4);
    expect(ring()).toBe(4);
    plant(4);
    expect(s.room.takeDrops()).toBeNull();                                 // nothing refused
    expect(p.grenades.C4).toBe(3);
    expect(s.a.of('grenade').filter((g) => g.kind === 'C4')).toHaveLength(1);
    expect(ring()).toBe(3);                                                // the named slot's own ring, spent once
  });

  it('C4 away from any destructible is refused: the type-less action alone is no target (C4_TARGET_READING retired)', () => {
    const s = setup(NO_C4, SEAL_C4, [600, 0, 0], [0, 0, 250]);
    // 80 from the wall, 50 from access_action1's own node: the heuristic's target in reach, no destructible.
    s.plant(2, [0, 0.1, 252], [0, 0, 1], 0, { path: ACTION, point: [0, 12, 300] });
    expect(s.room.player(2)!.grenades.C4).toBe(4);
    expect(s.room.takeDrops()).toMatchObject({ 'throw: no c4 target': 1 });
  });

  it("an RPG round opens the barrier (rating 20 through blastAt); once a round a C4 at the open barrier is refused; the next round restores it, geometry and health, and the room's death leaves the debris to the page", () => {
    const s = setup(NO_C4, kit(62, 15, 146, 186, 151), [600, 0, 0], [0, 0, 100]);
    s.send(2, 'RPG LAUNCHER', s.eye(2), [0, 0, 0]);
    s.drive(2, launcherRaiseSeconds(0) + 0.05);
    // From 230 short (past the arming 100), level at the wall.
    s.send(2, 'RPG', s.eye(2), [0, 0, 400]);
    s.run(1.5);
    expect(s.through()).toEqual([]);
    expect(s.room.world.isActive(LEFT)).toBe(true);
    expect(s.room.world.isActive(BAD)).toBe(false);                         // ROOM_SKIP_EFFECTS_READING: the debris is the page's
    // A late joiner's welcome carries the barrier open.
    const late = s.join(3);
    const welcome = late.of('welcome')[0] as unknown as { env: { states: { id: number; active: boolean }[] } };
    const off = welcome.env.states.filter((x) => !x.active).map((x) => s.room.world.meta.instances[x.id]!.path);
    expect(off).toEqual(expect.arrayContaining([GOOD, DI]));
    // Once a round: at the open barrier no destructible takes C4.
    s.place(2, [0, 0, 300]);
    s.run(0.5);
    s.plant(2, [0, 0.1, 302], [0, 0, 1], 0, { path: DI, point: [0, 12, 330] });
    expect(s.room.player(2)!.grenades.C4).toBe(4);
    // The next round: the barrier stands again and takes a charge.
    s.nextRound();
    expect(s.through()).toEqual([DI]);
    expect(s.room.world.health.hp(0)).toBe(1);
    expect(s.room.world.isActive(LEFT)).toBe(false);
    expect(s.room.world.valve('set_access1')).toBe(0);
    expect(s.room.world.health.c4TargetAt(DI, 18)).toBe(0);
  });

  it('a Terrorist with C4 (Enable_c4 = 9) plants on a shield-17 barrier end to end and it opens at the Timer1', () => {
    const s = setup(NO_C4, SEAL_C4, [600, 0, 0], [-600, 0, 0]);
    // The armoury's pick, replayed by the room (applyPicks under the map's valves): C4 into the Terrorist's slot 4.
    const p = s.room.player(1)! as unknown as { alive: boolean };
    p.alive = false;
    s.room.text(1, { type: 'loadout', picks: [{ slot: 4, id: 151 }] } as unknown as ClientEvent);
    p.alive = true;
    const answer = s.a.of('loadout').at(-1)!;
    expect(answer).toMatchObject({ refused: null });
    expect((answer as unknown as { kit: number[] }).kit[4]).toBe(151);
    s.nextRound();
    expect(s.room.player(1)!.grenades.C4).toBe(4);
    s.place(1, [0, 0, 316]);                                                 // AD-5: was z 300, the charge at z 302
    s.place(2, [-600, 0, 0]);
    s.run(0.5);
    s.plant(1, [0, 0.1, 318], [0, 0, 1], 0, { path: DI, point: [0, 12, 330] });
    expect(s.room.player(1)!.grenades.C4).toBe(3);
    s.place(1, [0, 0, -100]);
    s.run(6.2);
    expect(s.through()).toEqual([]);
    expect(s.room.world.isActive(LEFT)).toBe(true);
  });

  // PF-35 (research 235 §1, 194 §7 A11; ruling PF.R55). The barrier at shield 10 so the M67's rating (10) is eligible and
  // the kerb's line is all that differs; the charge and the grenade go off at the same point, 2 ahead of the SEAL.
  it("a C4's blast reaches a destructible whose line from the blast is blocked by another surface (003c80e0 D:L319096-319143: the material loop skipped with the bit); a grenade's blast at the same point does not (SCENE_BLAST_REACH_PLACEHOLDER's clear line)", () => {
    const world = (): SimMap => barrierMap({ kerb: true, shield: 10 });
    // AD-5: the charge and the grenade at z 318 (was 302), the kerb at z 324 (was 316): see `barrierMap`.
    const c4 = setup(NO_C4, SEAL_C4, [600, 0, 0], [0, 0, 316], world());
    expect(segmentHits(c4.room.map.grid, [0, 1, 318], [0, 1, 329]).map((h) => h.owner.path)).toEqual([KERB]);
    c4.run(0.5);
    c4.plant(2, [0, 0.1, 318], [0, 0, 1], 0, { path: DI, point: [0, 12, 330] });
    expect(c4.room.player(2)!.grenades.C4).toBe(3);                        // planted over the kerb
    c4.place(2, [0, 0, -100]);
    c4.run(6.3);
    expect(c4.through()).toEqual([]);
    expect(c4.room.world.isActive(LEFT)).toBe(true);
    // The M67 at the same point: the kerb blocks its line, the barrier stands.
    const m67 = setup(NO_C4, SEAL_C4, [600, 0, 0], [0, 0, 316], world());
    m67.drive(2, 0.5);
    m67.send(2, 'M67', [0, 15.4 + 0.1, 318], [0, 0, 0]);
    m67.place(2, [0, 0, -100]);
    m67.run(3.6);
    expect(m67.room.player(2)!.grenades.M67).toBe(2);                      // thrown, gone off
    expect(m67.through()).toEqual([DI]);
    expect(m67.room.world.health.hp(0)).toBe(1);
    // Without the kerb the same M67 opens it: the line is the difference.
    const open = setup(NO_C4, SEAL_C4, [600, 0, 0], [0, 0, 316], barrierMap({ shield: 10 }));
    open.drive(2, 0.5);
    open.send(2, 'M67', [0, 15.4 + 0.1, 318], [0, 0, 0]);
    open.place(2, [0, 0, -100]);
    open.run(3.6);
    expect(open.through()).toEqual([]);
  });
});

/**
 * AD-5 in the room (research 209 s13-s14): what the room hands the scene's damage. A round's range falloff from the
 * shot's start to the target's midpoint (`FUN_003c7600` D:L318737-318760; `ROUND_SCENE_FALLOFF_READING`), and the
 * blast's reach gate on the map's materials (`FUN_003c80e0` D:L319096-319143; `blastLine`).
 */
describe('AD-5: the room hands the scene the round\'s range and the materials\' gate', () => {
  /** Player `id` faces `at`, sends two commands with that look, and fires its primary down the cone's centre at it. */
  const shootAt = (s: ReturnType<typeof setup>, id: number, at: V3): void => {
    const p = s.room.player(id)!;
    const st = p.sim.walker.state;
    const look = faceToward({ feet: [st.x, st.y, st.z], posture: p.sim.walker.posture }, at);
    p.sim.allowSnap();                                                     // staged: the test sets the facing (OT.R38)
    const step = (): void => {
      const c: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: look.yaw, pitch: look.pitch, turn: 0, buttons: 0, stance: 0, weapon: 0 };
      s.room.binary(id, encodeCommands({ viewTick: s.room.tick, commands: [c] }));
      s.room.step();
    };
    step(); step();
    const seq = p.sim.seq, f = p.cone.frame(seq)!;
    const { eye } = cameraLook(f);
    const c = centreClaim(f, [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]], Math.hypot(at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]));
    s.room.text(id, { type: 'fire', seq, from: c.from, dir: c.dir, eye: c.eye, aim: c.aim, weapon: 0, viewTick: s.room.tick } as ClientEvent);
    step(); step();
  };

  it("a round past Effective_Range takes the falloff's rating to the midpoint: under the shield it leaves the barrier, inside Effective_Range it opens it (was: the full rating at any range)", () => {
    // The M4A1 SD (62) with its ranges cut to 10 m / 30 m (100 / 300 u: `UNITS_PER_METRE`), the barrier at shield 2 so
    // its 2.3 + 0.15 = 2.45 qualifies; the barrier's midpoint (0, 12, 330).
    const SHORT: WeaponRecord = { ...DEFAULT_RIFLE, id: 62, name: 'M4A1 SD', impactDamage: 2.3, damageModifier: 0.15, effectiveRange: 10, maximumRange: 30 };
    const MID: V3 = [0, 12, 330];
    const far = setup(NO_C4, NO_C4, [600, 0, 0], [0, 0, 130], barrierMap({ shield: 2 }), [SHORT, HELD_SIDEARM]);
    shootAt(far, 2, MID);
    // ~200 u from the muzzle: 2.45 x (1 - (200 - 100) / (300 - 100)) = 1.2 under the shield 2 (D:L318763): nothing.
    expect(far.room.world.isActive(DI)).toBe(true);
    expect(far.room.world.health.hp(0)).toBe(1);
    const near = setup(NO_C4, NO_C4, [600, 0, 0], [0, 0, 280], barrierMap({ shield: 2 }), [SHORT, HELD_SIDEARM]);
    shootAt(near, 2, MID);
    // ~50 u: inside Effective_Range, the whole 2.45 x 14.
    expect(near.room.world.isActive(DI)).toBe(false);
  });

  it("the room's reach gate reads the materials: an M67 opens a shield-10 barrier through a WOOD_THIN kerb (PENETRATION 0.25: 150^2 x 0.25 over the line's 16.6^2), not through a METAL_THICK one (0) -- was: any surface blocked it", () => {
    const run = (kerbMaterial: number): boolean => {
      const s = setup(NO_C4, SEAL_C4, [600, 0, 0], [0, 0, 316], barrierMap({ kerb: true, shield: 10, kerbMaterial }));
      s.drive(2, 0.5);
      s.send(2, 'M67', [0, 15.4 + 0.1, 318], [0, 0, 0]);
      s.place(2, [0, 0, -100]);
      s.run(3.6);
      expect(s.room.player(2)!.grenades.M67).toBe(2);                    // thrown, gone off
      return s.room.world.isActive(DI);
    };
    expect(run(20)).toBe(false);                                          // WOOD_THIN (byte 20): reached, opened
    expect(run(25)).toBe(true);                                           // METAL_THICK (25, the floor's): refused
  });
});

// LATER 305 (the merge controller's option (i), bf-reviewed): a switch's `action` (and C4's plant `throw`) may carry the
// page's eye; the room ADDS it to its own eyes only where it reproduces it (the original's pass on its hull) and its line,
// from that eye through the moved target, passes the point (`room.ts` `pageEye`). The four pins: no eye, today's verdict;
// a forged eye unused (today's verdict); a claim today clears stays cleared with any eye; an honest eye today's miss.
describe('LATER 305: the page eye on a switch press is only ever added', () => {
  type Cone = { frame(seq: number): AimFrame | undefined; framesAround(seq: number): AimFrame[] };
  const coneFrames = (p: unknown): Cone => (p as { cone: Cone }).cone;
  /** Where the view line from `eye` through frame `f`'s moved target first strikes the hull, if on the switch; else null. */
  const viewPoint = (grid: Grid, f: AimFrame, eye: V3): V3 | null => {
    const local = localCamera(f.moveRoot ?? rootY(f.posture), f.pitch, f.peek);
    const ge = toWorld(f.feet, f.yaw, local.eye), gt = toWorld(f.feet, f.yaw, local.target);
    const gf = toWorld(f.feet, f.yaw, [local.target[0] + local.ahead[0] * 1000, local.target[1] + local.ahead[1] * 1000, local.target[2] + local.ahead[2] * 1000]);
    const l = Math.hypot(gf[0] - ge[0], gf[1] - ge[1], gf[2] - ge[2]), dd = Math.hypot(ge[0] - gt[0], ge[1] - gt[1], ge[2] - gt[2]);
    const moved: V3 = [ge[0] + ((gf[0] - ge[0]) / l) * dd, ge[1] + ((gf[1] - ge[1]) / l) * dd, ge[2] + ((gf[2] - ge[2]) / l) * dd];
    const d = [moved[0] - eye[0], moved[1] - eye[1], moved[2] - eye[2]], n = Math.hypot(d[0]!, d[1]!, d[2]!);
    const hit = segmentHits(grid, eye, [eye[0] + (d[0]! / n) * 200, eye[1] + (d[1]! / n) * 200, eye[2] + (d[2]! / n) * 200])[0];
    return hit && hit.owner.path.startsWith(SWITCH) ? [hit.point[0], hit.point[1], hit.point[2]] : null;
  };
  const scene = (camera?: { back: number; ceiling: number }, pitch = -20) => {
    const s = setup(NO_C4, SEAL_C4, [600, 0, 0], [0, 0, -84], barrierMap({ switch: true, ...(camera ? { camera } : {}) }));
    s.room.player(2)!.sim.walker.state.yaw = 0;
    s.drive(2, 1, pitch);
    const p = s.room.player(2)!, seq = p.sim.seq, f = coneFrames(p).frame(seq)!;
    const i = s.room.world.meta.actions.findIndex((x) => x.node === 'switch1');
    const press = (point: V3, eye?: V3): Record<string, number> | null => {
      s.room.takeDrops();
      // The body stands still, so every command's frame is this one: each press names the latest (no stale ask).
      s.room.text(2, { type: 'action', seq: s.room.player(2)!.sim.seq, action: i, surface: { path: SWITCH, point }, ...(eye ? { eye } : {}) } as ClientEvent);
      s.drive(2, 0.05, pitch);
      return s.room.takeDrops();
    };
    return { s, f, seq, press, eye: reproducedEye(f, s.room.map.grid!) };
  };

  it("no eye: today's verdicts; a forged, far-off or walled eye: unused, the same verdicts; a press today clears stays cleared with any eye", () => {
    const r = scene();
    const beside: V3 = [r.eye[0], r.eye[1] - 2, r.eye[2] - 6];               // near the moved target, steering anywhere
    const forged: V3[] = [beside, [0, 60, 0], [0, 9, -110]];                 // beside the target, far off, past the switch's wall
    const near: V3 = [0, 9, -94], farFace: V3 = [0, 9, -100];
    // Pin 4: the near face, which the head's own line clears today, stays cleared with any eye -- the honest one too.
    expect(r.press(near)).toEqual({ 'action: busy': 1 });
    for (const eye of [...forged, r.eye]) expect(r.press(near, eye), `eye ${eye.join(',')}`).toEqual({ 'action: busy': 1 });
    // Pins 1 and 3: the far face, which today's rule refuses, keeps that verdict with no eye and with a forged one.
    const today = r.press(farFace);
    expect(today).not.toEqual({ 'action: busy': 1 });
    for (const eye of forged) expect(r.press(farFace, eye), `eye ${eye.join(',')}`).toEqual(today);
  });

  it("pin 2, at the room: an honest page eye pulled in by a wall behind and pushed down by a ceiling is taken with its eye", () => {
    // The page eye is the room's own reproduction (as an honest page's, `reproducedEye`), its view line struck at the switch's
    // top. On this map today's swept rule (C4_LOOK_BOUND_PLACEHOLDER, 1.62 u) already takes such points too, so the case
    // where only the page eye's line takes the point is pinned at the rule itself (`shotConeViewLine.test.ts`, C4's line);
    // here the room is shown to take the honest eye's claim through `pageEye` end to end.
    const r = scene({ back: -80, ceiling: 22.6 }, -18);
    expect(r.eye[2]).toBeGreaterThan(-81.5);                                  // pulled in short of the back wall
    const pt = viewPoint(r.s.room.map.grid!, r.f, r.eye);
    expect(pt, 'the view line strikes the switch').not.toBeNull();
    expect(r.press(pt!, r.eye)).toEqual({ 'action: busy': 1 });
  });
});
