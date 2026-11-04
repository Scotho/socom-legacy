import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RIFLE, HELD_SIDEARM, ITEM, M67, arsenalOf, type CollisionOwner, type GridParams, type Loadout, type SpawnSlot, type ThrowableRecord,
  type WeaponRecord, type WorldPoly,
} from '@s2u/scene';
import {
  cameraLook, centreClaim, encodeCommands, EYE_HEIGHT, faceToward, groundGrid, launcherRaiseSeconds, packGround, PROTOCOL_VERSION, TICK_HZ,
  type Command, type ServerEvent, type SimKits, type SimMap,
} from '../../viewer/src/sim';
import { applyHit, freshHealth, quantiseHit } from '../../viewer/src/net/damage';
import { VOICE_GATE_S } from '../../viewer/src/net/deaths';
import { ffRefuses, Room, type Conn } from '../src/room';
import type { RoomRuleHost, RuleRoom } from '../src/creator/rules';
import { simSkeletonsFromBytes } from '../../viewer/src/simMap';
import { stanceVolumes, type StanceVolumes } from '../../viewer/src/net/hitVolumes';
import { PART } from '../../viewer/src/net/damage';
import { fixture } from '../../archive/test/fixtures';

/**
 * PF-22 (web sprint 28; research 219 s1, 179 s8.2-s8.3, 192 G12, 181 s2.3): damage as the victim's console applies it.
 * A bullet's, a volley's pellets' and a launched round's direct hit are the hit packet's integer (`FUN_002bd220`
 * D:L161655-161672: `(int)` clamped [0, 255]); a blast's fragments and a fall are applied from the victim's own copy,
 * float (`FUN_005a0e70`, `FUN_005ac1f0`). One friendly-fire predicate (`ffRefuses`) transcribes `CZSealBody::OnWeaponHit`
 * (`FUN_005ac670` 0x5ac670, by disassembly): the owner's team read live at the hit, a departed owner's hit landing, a
 * spectator taking nothing, the backblast never hurting its firer or his side. On a synthetic floor and a hand-built
 * kit table, as `roomEquipment.test.ts`.
 */

type V3 = [number, number, number];
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};
function map(): SimMap {
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(PARAMS, [FLOOR], owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [] };
}

const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
const rec = (over: Partial<WeaponRecord>): WeaponRecord => ({ ...DEFAULT_RIFLE, fireModes: [1], maxFireMode: 1, ...over });
/** An 870 whose pellet is 2.45 x 14 = 34.3 (the room's 'scaled' pellet: `pelletDamage`), four rays a shell. */
const SHOTGUN = rec({ name: '870', id: 84, fireWait: 0.75, magazine: 8, mags: 5, reloadAfterShot: true, reloadDelay: 1, pellets: 4, impactDamage: 2.45, damageModifier: 0, effectiveRange: 41, maximumRange: 84, piercing: 6 });
const round = (over: Partial<ThrowableRecord>): ThrowableRecord => ({ ...M67, ...over });
/** A LAW HEAT whose direct hit is 1.85 x 14 = 25.9 (not a kill), armed at 100 u (so a body at 60 is a dud's hit, no blast). */
const HEAT = round({ name: 'LAW HEAT', id: 185, muzzleVelocity: 200, acceleration: 980, armingDistance: 100, impact: true, hasBackblast: true, fuse: 20, removal: 20.1, capacity: 1, explosionDamage: 20, explosionRadius: 150, impactDamage: 1.85, damageModifier: 0, effectiveRange: 3500, maximumRange: 100000 });
const BACKBLAST = round({ name: 'Backblast', id: ITEM.BACKBLAST, muzzleVelocity: 0, fuse: 0, removal: 0.1, capacity: 1, explosionDamage: 6, explosionRadius: 70 });
const item = (name: string, id: number, extra: unknown[] = []): unknown[] => ['InternalName', [name], 'ID', [String(id)], 'Ammo_Capacity', ['1'], 'NumMags', ['1'], 'AMMO_TYPES', [[]], ...extra];
const arsenal = arsenalOf(['ZAMMO', [], 'ZWEAPON', [
  item('LAW', ITEM.LAW, ['SlotCost', ['2']]), item('LAW HEAT', 185), item('Backblast', ITEM.BACKBLAST), item('M67', 121),
] as never]);
/** Both sides: the M4A1 (36.4 a round), the Mark 23, the LAW and its round, an M67. */
const KIT = kit(DEFAULT_RIFLE.id, 15, ITEM.LAW, 185, 121);
function kits(terrorist: Loadout, seal: Loadout): SimKits {
  return {
    table: {
      arsenal, records: new Map([DEFAULT_RIFLE, HELD_SIDEARM, SHOTGUN].map((x) => [x.id, x])),
      rounds: new Map([[185, { record: HEAT, piercing: 0, fireWait: 3, reloadAfterShot: true, reloadDelayAfterShot: 1, icon: null }]]),
      throwables: new Map([M67, BACKBLAST].map((x) => [x.id, { record: x, piercing: x.id === 121 ? 4 : 0 }])),
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

const tok = (tab: number): string => `tab${tab}`.padEnd(22, '_');
/**
 * Players 1 (T), 2 (S), 3 (S), 4 (T) -- the join rule -- at `at[i]` (feet on the floor), each side's kit; the combat
 * report on (it changes nothing the room does) so the applied damage can be read.
 */
function setup(at: readonly V3[], opts: { allowFriendlyFire?: boolean; deathlessSeat?: string; ruleHost?: RoomRuleHost } = {}, terrorist: Loadout = KIT, seal: Loadout = KIT) {
  let seed = 1;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const room = new Room(map(), null, { now: () => 0, random, combatReport: true, ...opts }, null, kits(terrorist, seal));
  const cs = at.map((_, i) => {
    const c = new Client();
    room.hello(i + 1, c, { type: 'hello', version: PROTOCOL_VERSION, name: `P${i + 1}`, map: 'MP99', session: tok(i + 1) }, `10.0.0.${i + 1}`);
    return c;
  });
  room.step();
  at.forEach((p, i) => room.player(i + 1)!.sim.walker.place(p[0], p[1] + 20, p[2]));
  for (let i = 0; i < 30; i++) room.step();
  const look = new Map<number, { yaw: number; pitch: number }>();
  const feet = (id: number): V3 => { const w = room.player(id)!.sim.walker.state; return [w.x, w.y, w.z]; };
  const eye = (id: number): V3 => { const f = feet(id); return [f[0], f[1] + EYE_HEIGHT, f[2]]; };
  /** `seconds` of `id`'s commands at rest, at its look (its own clock: the kit's waits count on it). */
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
  /** `id` turns to look at `point` (room.test's `gunner.face`). */
  const face = (id: number, point: V3): void => {
    look.set(id, faceToward({ feet: feet(id), posture: room.player(id)!.sim.walker.posture }, point));
    room.player(id)!.sim.allowSnap();   // staged as the room would set it (LATER 14: no free turn after a spawn)
    drive(id, 0.5);
  };
  /** `id`'s round at its last command, down the cone's centre to `point` (`n` rays at the one command: a volley). */
  const shoot = (id: number, point: V3, n = 1): void => {
    const p = room.player(id)!, seq = p.sim.seq, f = p.cone.frame(seq)!;
    const { eye: e } = cameraLook(f);
    const c = centreClaim(f, [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]], Math.hypot(point[0] - e[0], point[1] - e[1], point[2] - e[2]));
    for (let i = 0; i < n; i++) room.text(id, { type: 'fire', seq, from: c.from, dir: c.dir, eye: c.eye, aim: c.aim, weapon: 0, viewTick: room.tick });
    drive(id, 1 / TICK_HZ);
  };
  const send = (id: number, kind: string, from: V3, velocity: V3): void => room.text(id, { type: 'throw', seq: room.player(id)!.sim.seq, kind, from, velocity });
  /** The LAW raised and past its raise, the body at `yaw` (degrees; yaw 0 faces -z, -90 faces +x). */
  const raise = (id: number, yaw?: number): void => {
    if (yaw !== undefined) look.set(id, { yaw, pitch: 0 });
    drive(id, 0.1);
    send(id, 'LAW', eye(id), [0, 0, 0]);
    drive(id, launcherRaiseSeconds(0) + 0.05);
  };
  /** The LAW HEAT from `from` (the eye) toward `to` at its muzzle velocity. */
  const rocket = (id: number, to: V3, from: V3 = eye(id)): void => {
    const d: V3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]], l = Math.hypot(...d);
    send(id, 'LAW HEAT', from, [d[0] / l * 200, d[1] / l * 200, d[2] / l * 200]);
  };
  /** The page's drop at `id`'s feet from its hand: an M67 let go at rest. */
  const drop = (id: number): void => send(id, 'M67', [feet(id)[0], feet(id)[1] + 15.4, feet(id)[2]], [0, 0, 0]);
  const fuse = (): void => run(3.3);
  const applied = (c: Client, request: string) => c.of('combat').filter((e) => e.status === 'applied' && e.request === request);
  return { room, c: cs, feet, eye, drive, run, face, shoot, send, raise, rocket, drop, fuse, applied };
}

const sum = (xs: readonly number[]): number => xs.reduce((n, x) => n + x, 0);
/** A body as `ffRefuses` reads it: its side. */
type Side = { readonly team: 'seal' | 'terrorist' };

describe('PF-22: damage as the victim\'s console applies it (research 219 s1)', () => {
  it('the room applies integer damage to bullets, volleys and launched-round direct hits; a blast\'s fragments and a fall stay float (FUN_005a5a80 D:L461619-461629; FUN_005a0e70, FUN_005ac1f0)', () => {
    // A bullet: the M4A1's 36.4 at 100 u arrives as the byte 36.
    {
      const s = setup([[0, 0, 0], [100, 0, 0]]);
      s.face(1, [100, 12, 0]); s.shoot(1, [100, 12, 0]);
      const [hit] = s.applied(s.c[0]!, 'fire');
      expect(hit).toBeDefined();
      expect(hit!.rawDamage).toBe(36);
      const want = freshHealth();
      applyHit(want, hit!.part!, 36, DEFAULT_RIFLE.piercing);
      expect(s.room.player(2)!.health.hp).toEqual(want.hp);
      expect(s.room.player(2)!.health.armour).toEqual(want.armour);
    }
    // A volley: each pellet's 34.3 is 34.
    {
      const s = setup([[0, 0, 0], [100, 0, 0]], {}, kit(84, 15, 255, 255, 255));
      s.face(1, [100, 12, 0]); s.shoot(1, [100, 12, 0], 4);
      const [hit] = s.applied(s.c[0]!, 'fire');
      expect(hit).toBeDefined();
      expect(hit!.hitLocations!.length).toBeGreaterThan(0);
      expect(hit!.hitLocations!.every((h) => h.rawDamage === 34)).toBe(true);
    }
    // A launched round's direct hit: 1.85 x 14 = 25.9 is 25.
    {
      const s = setup([[60, 0, 0], [0, 0, 0]]);
      s.raise(2);
      const at = s.feet(1);
      s.rocket(2, [at[0], at[1] + 10, at[2]]);
      s.run(1);
      const [hit] = s.applied(s.c[1]!, 'impact');
      expect(hit).toBeDefined();
      expect(hit!.rawDamage).toBe(25);
      expect(s.room.player(1)!.alive).toBe(true);
    }
    // A blast's fragments: 140 x (1 - 5/75) = 130.67 at 80 u, float.
    {
      const s = setup([[0, 0, 0], [80, 0, 0]]);
      s.drive(1, 0.2); s.drop(1);
      s.room.player(1)!.sim.walker.place(-600, 20, 0);
      s.fuse();
      const [hit] = s.applied(s.c[1]!, 'blast');
      expect(hit).toBeDefined();
      expect(hit!.hitLocations!.some((h) => !Number.isInteger(h.rawDamage))).toBe(true);
    }
    // A fall: a 90-unit drop takes a fraction of every part's maximum, float.
    {
      const s = setup([[0, 0, 0], [400, 0, 0]]);
      const w = s.room.player(1)!.sim.walker;
      w.state.y += 90; w.setAirborne(true);                                   // as roomFall.test.ts's `drop`
      s.drive(1, 1.5);
      const hp = s.room.player(1)!.health.hp;
      expect(sum(hp)).toBeLessThan(178);
      expect(hp.some((h) => !Number.isInteger(h))).toBe(true);
    }
  });

  it('friendly fire off: a teammate\'s round, launched round and blast are refused by one gate reading the owner\'s team at the hit; the thrower\'s own blast hurts him (FUN_005ac670 0x5ac6b8-0x5ac750)', () => {
    // A round: 1 (T) into 4 (T) -- refused, the shooter told.
    {
      const s = setup([[0, 0, 0], [0, 0, -600], [0, 0, 600], [100, 0, 0]]);
      s.face(1, [100, 12, 0]); s.shoot(1, [100, 12, 0]);
      expect(s.c[0]!.of('combat').filter((e) => e.request === 'fire').map((e) => [e.status, e.reason])).toEqual([['rejected', 'friendly fire']]);
      expect(s.c[3]!.of('hurt')).toHaveLength(0);
      expect(s.room.player(4)!.health.hp).toEqual(freshHealth().hp);
    }
    // A launched round's direct hit: 1 (T) into 4 (T) at 60 u -- refused.
    {
      const s = setup([[0, 0, 0], [0, 0, -600], [0, 0, 600], [60, 0, 0]]);
      s.raise(1);
      const at = s.feet(4);
      s.rocket(1, [at[0], at[1] + 10, at[2]]);
      s.run(1);
      expect(s.c[0]!.of('combat').filter((e) => e.request === 'impact').map((e) => [e.status, e.reason])).toEqual([['rejected', 'friendly fire']]);
      expect(s.c[3]!.of('hurt')).toHaveLength(0);
    }
    // A blast: 1 (T) drops an M67 between itself, 4 (T) and 2 (S): its teammate spared, the enemy and the thrower hurt.
    {
      const s = setup([[0, 0, 0], [6, 0, 0], [0, 0, -600], [-6, 0, 0]]);
      s.drive(1, 0.2); s.drop(1);
      s.fuse();
      expect(s.c[3]!.of('hurt')).toHaveLength(0);
      expect(s.c[3]!.of('blast')).toHaveLength(0);
      expect(s.c[1]!.of('hurt').length).toBeGreaterThan(0);
      expect(s.c[0]!.of('hurt').length).toBeGreaterThan(0);                  // his own blast: owner == victim passes
      expect(s.room.player(1)!.alive).toBe(false);
    }
    // The owner's team is read at the hit (`owner+0xc8`, looked up live by id), not as he threw.
    {
      const s = setup([[0, 0, 0], [6, 0, 0], [0, 0, -600], [-6, 0, 0]]);
      s.drive(1, 0.2); s.drop(1);
      s.room.player(1)!.sim.walker.place(-600, 20, 0);
      s.room.player(1)!.team = 'seal';                                        // his side when it goes off
      s.fuse();
      expect(s.c[1]!.of('hurt')).toHaveLength(0);                             // 2 (S): now his side, spared
      expect(s.c[3]!.of('hurt').length).toBeGreaterThan(0);                   // 4 (T): now the other side, hurt
    }
  });

  it('a grenade from a player who leaves before it explodes damages his former teammate (the lookup by id fails: the gate does not apply; DEPARTED_OWNER_FF_READING)', () => {
    const s = setup([[0, 0, 0], [0, 0, -600], [0, 0, 600], [-6, 0, 0]]);
    s.drive(1, 0.2); s.drop(1);
    s.room.leave(1);
    s.fuse();
    expect(s.c[3]!.of('blast')).toHaveLength(1);
    expect(s.c[3]!.of('hurt').length).toBeGreaterThan(0);
    expect(sum(s.room.player(4)!.health.hp)).toBeLessThan(178);
  });

  it('the backblast never hurts its firer nor his side, friendly fire on or off (0x5ac840-0x5ac8fc); an enemy behind the launcher is hurt', () => {
    for (const allowFriendlyFire of [false, true]) {
      // 2 (S) at the origin facing east (yaw -90) fires up the sky; 3 (S) and 1 (T) 30 behind him, inside the cone.
      const s = setup([[-30, 0, -5], [0, 0, 0], [-30, 0, 5], [0, 0, 600]], { allowFriendlyFire });
      s.raise(2, -90);
      // The muzzle 10 ahead of the feet and 5 over them (inside the head's reach): the firer's own feet are in its cone.
      const f = s.feet(2), from: V3 = [f[0] + 10, f[1] + 5, f[2]];
      s.rocket(2, [from[0] + 200 * Math.cos(0.3), from[1] + 200 * Math.sin(0.3), from[2]], from);
      expect(s.c[0]!.of('grenade').filter((g) => g.kind === 'LAW HEAT'), `allow ${allowFriendlyFire}`).toHaveLength(1);
      s.run(0.2);
      expect(s.c[0]!.of('blast'), `allow ${allowFriendlyFire}: the enemy`).toHaveLength(1);
      expect(s.c[2]!.of('blast'), `allow ${allowFriendlyFire}: his side`).toHaveLength(0);
      expect(s.c[1]!.of('blast'), `allow ${allowFriendlyFire}: the firer`).toHaveLength(0);
      expect(s.room.player(2)!.health.hp).toEqual(freshHealth().hp);
      expect(s.room.player(3)!.health.hp).toEqual(freshHealth().hp);
    }
    // The cone follows the body (BACKBLAST_CONE_AXIS_READING 'body-back'), not the round: 2 faces north (yaw 0, -z) and
    // fires east -- 1 (T) 30 behind his body (south) is hurt, 4 (T) 30 west, behind the round's flight, is not.
    {
      const s = setup([[0, 0, 30], [0, 0, 0], [0, 0, -600], [-30, 0, 0]]);
      s.raise(2, 0);
      const from = s.eye(2);
      s.rocket(2, [from[0] + 200 * Math.cos(0.3), from[1] + 200 * Math.sin(0.3), from[2]], from);
      s.run(0.2);
      expect(s.c[0]!.of('blast'), 'behind the body').toHaveLength(1);
      expect(s.c[3]!.of('blast'), 'behind the round').toHaveLength(0);
    }
    // The predicate itself: the backblast from the firer on himself or his side, whatever the switch.
    const t: Side = { team: 'terrorist' }, mate: Side = { team: 'terrorist' }, enemy: Side = { team: 'seal' };
    for (const allow of [false, true]) {
      expect(ffRefuses(t, t, ITEM.BACKBLAST, allow)).toBe('backblast');
      expect(ffRefuses(t, mate, ITEM.BACKBLAST, allow)).toBe(allow ? 'backblast' : 'friendly fire');
      expect(ffRefuses(t, enemy, ITEM.BACKBLAST, allow)).toBeNull();
      expect(ffRefuses(t, t, M67.id, allow)).toBeNull();                      // his own grenade passes
    }
  });

  it('friendly fire on (allowFriendlyFire): a teammate\'s round lands; the backblast\'s own-side refusal stands', () => {
    const s = setup([[0, 0, 0], [0, 0, -600], [0, 0, 600], [100, 0, 0]], { allowFriendlyFire: true });
    s.face(1, [100, 12, 0]); s.shoot(1, [100, 12, 0]);
    const [hit] = s.applied(s.c[0]!, 'fire');
    expect(hit).toMatchObject({ status: 'applied', friendlyFire: true, rawDamage: 36 });
    expect(s.c[3]!.of('hurt')).toHaveLength(1);
    const t: Side = { team: 'terrorist' }, mate: Side = { team: 'terrorist' };
    expect(ffRefuses(t, mate, DEFAULT_RIFLE.id, true)).toBeNull();
    expect(ffRefuses(t, mate, M67.id, true)).toBeNull();
    expect(ffRefuses(t, mate, ITEM.BACKBLAST, true)).toBe('backblast');
  });

  /**
   * Craig's report (2026-11-02): "the 'hurt' sound can be heard amongst allies". The original sounds every body's hurt grunt
   * on every console (research 81 section 14: the replicated part ratios, research 193 row 12, reach the health setter
   * `FUN_005477a0`, whose only test is a change on a live body, D:L412826-412833, and its controller's `+0x54` plays 0x3b
   * at the body); its one team test is the friendly-fire gate (`FUN_005ac670`, research 219). These pin the room's
   * `hurtVoice` behind that gate: off, a teammate's round makes no grunt on any page; on, every page hears one, the
   * victim's and a third player's alike, and the voice gate (`VOICE_GATE_S`, `FUN_0053b710` D:L405268-405290) holds back a
   * second within it.
   */
  it('the hurt voice: friendly fire off, a teammate\'s round sounds on no page (FUN_005ac670)', () => {
    const s = setup([[0, 0, 0], [0, 0, -600], [0, 0, 600], [100, 0, 0]]);
    s.face(1, [100, 12, 0]); s.shoot(1, [100, 12, 0]);
    s.drive(1, 0.2);
    expect(s.c[3]!.of('hurt')).toHaveLength(0);
    for (const c of s.c) expect(c.of('hurtVoice')).toEqual([]);
  });

  it('the hurt voice: friendly fire on, a teammate\'s round is heard once on every page, the victim\'s and a third player\'s', () => {
    const s = setup([[0, 0, 0], [0, 0, -600], [0, 0, 600], [100, 0, 0]], { allowFriendlyFire: true });
    s.face(1, [100, 12, 0]); s.shoot(1, [100, 12, 0]);
    s.drive(1, 0.2);
    expect(s.c[3]!.of('hurt')).toHaveLength(1);
    expect(s.c[3]!.of('hurtVoice')).toEqual([{ type: 'hurtVoice', id: 4 }]);   // the victim's own page
    expect(s.c[1]!.of('hurtVoice')).toEqual([{ type: 'hurtVoice', id: 4 }]);   // a third player, of the other side
    expect(s.c[0]!.of('hurtVoice')).toEqual([{ type: 'hurtVoice', id: 4 }]);   // the shooter
  });

  it('the hurt voice: a second round inside VOICE_GATE_S hurts again and sounds on no page (FUN_0053b710 D:L405268-405290)', () => {
    const s = setup([[0, 0, 0], [0, 0, -600], [0, 0, 600], [100, 0, 0]], { allowFriendlyFire: true });
    s.face(1, [100, 12, 0]); s.shoot(1, [100, 12, 0]);
    s.drive(1, 0.5);
    s.shoot(1, [100, 12, 0]);
    s.drive(1, 0.2);
    expect(VOICE_GATE_S).toBeGreaterThan(0.8);
    expect(s.room.player(4)!.alive).toBe(true);
    expect(s.c[3]!.of('hurt')).toHaveLength(2);
    for (const c of s.c) expect(c.of('hurtVoice')).toEqual([{ type: 'hurtVoice', id: 4 }]);
  });

  it('a spectator takes nothing from any projectile (FUN_002c2fd0)', () => {
    const t: Side = { team: 'terrorist' }, s: Side = { team: 'seal' };
    for (const id of [DEFAULT_RIFLE.id, SHOTGUN.id, 185, M67.id, ITEM.BACKBLAST]) {
      for (const allow of [false, true]) {
        for (const attacker of [t, s, null]) expect(ffRefuses(attacker, s, id, allow, true), `${id} ${allow}`).toBe('spectator');
      }
    }
    expect(ffRefuses(null, s, M67.id, false)).toBeNull();                      // a departed owner's hit, on a player, lands
  });
});

/**
 * HX-2 (web sprint 31; research 238 §1): a hostage is hit on its own skeleton's capsules at its stance -- the server's
 * `TypeSkeletons.escortees` (`chartype.rdr`'s `escortees`, at the No_weapon set's idles) -- never a SEAL type's. The hit
 * path that asks for them is HX-1's (`extraction.ts`); this pins the room's lookup it will call.
 */
const HX2_MP6 = fixture('RUN/MP6.ZDB'), HX2_READERC = fixture('RUN/READERC.ZAR'), HX2_PACK = fixture('RUN/MOTION_P.ZAR');
describe.skipIf(!HX2_MP6 || !HX2_READERC || !HX2_PACK)('a hostage\'s hit volumes (HX-2; fixtures MP6, READERC, MOTION_P)', () => {
  it("a hostage's hit volumes are its own skeleton's at its stance (TypeSkeletons.escortees): a head capsule at the thai_wife's idle, not SEAL 1's", () => {
    const skeletons = simSkeletonsFromBytes(HX2_MP6!, HX2_READERC!, HX2_PACK!);
    const room = new Room(map(), null, {}, skeletons);
    const volumesOf = (who: Parameters<Room['volumesOf']>[0]) => room['volumesOf'](who);
    const wife = stanceVolumes(skeletons.escortees[2]!), seal = stanceVolumes(skeletons.seal[0]!);
    const head = (v: StanceVolumes | null, stance: 'stand' | 'crouch') => v![stance].find((c) => c.part === PART.HEAD)!;
    for (const stance of ['stand', 'crouch'] as const) {
      expect(head(volumesOf({ escortee: 2 }), stance), stance).toEqual(head(wife, stance));
      expect(head(volumesOf({ escortee: 2 }), stance), stance).not.toEqual(head(seal, stance));
    }
    expect(head(volumesOf({ escortee: 0 }), 'stand')).toEqual(head(stanceVolumes(skeletons.escortees[0]!), 'stand'));
    // a hostage index the map does not list: the first escortee's; no escortee at all: SEAL 1's (the same 26 bones)
    expect(volumesOf({ escortee: 7 })).toBe(volumesOf({ escortee: 0 }));
    const bare = new Room(map(), null, {}, { seal: skeletons.seal, terrorist: skeletons.terrorist });
    expect(bare['volumesOf']({ escortee: 1 })).toBe(bare['volumesOf']({ team: 'seal', char: 0 }));
    // the players' are untouched
    expect(volumesOf({ team: 'seal', char: 0 })).toEqual(seal);
  });
});

/**
 * CPS cell-alive (2026-11-03; product track, a dev-only switch of the live perf cell, `tools/perf/cpf/live.ts`): window 2's
 * runs were not comparable -- the seat's fake pad walked it into 15 bots and it was dead or spectating most of the 60 s
 * window in several. `RoomOptions.deathlessSeat` (central reads it from `S2U_CELL_DEATHLESS_SEAT`, `../src/cellSeat.ts`)
 * names one player, by the name the room keys its members by (`lobby.member(id).name`: the hello's, a game's account
 * name), whose health no hit, blast or fall reduces; the hit itself is resolved, told (`hurt`, the combat report) and
 * knocks as before. Absent (every room but the cell's), the damage is applied exactly as before.
 */
describe('CPS cell-alive: the deathless seat (RoomOptions.deathlessSeat)', () => {
  const fresh = freshHealth();

  it('without the option a bullet reduces the victim\'s health; with it the named seat\'s health is untouched, the hit still resolved and told', () => {
    {
      const s = setup([[0, 0, 0], [100, 0, 0]]);
      s.face(1, [100, 12, 0]); s.shoot(1, [100, 12, 0]);
      expect(s.applied(s.c[0]!, 'fire')).toHaveLength(1);
      expect(sum(s.room.player(2)!.health.hp)).toBeLessThan(sum(fresh.hp));
    }
    {
      const s = setup([[0, 0, 0], [100, 0, 0]], { deathlessSeat: 'P2' });
      s.face(1, [100, 12, 0]); s.shoot(1, [100, 12, 0]);
      const [hit] = s.applied(s.c[0]!, 'fire');
      expect(hit).toMatchObject({ status: 'applied', rawDamage: 36, killed: false });
      expect(s.room.player(2)!.health.hp).toEqual(fresh.hp);
      expect(s.room.player(2)!.health.armour).toEqual(fresh.armour);
      expect(s.c[1]!.of('hurt').map((e) => e.health)).toEqual([fresh.hp]);           // told, at its untouched health
    }
    // another name: P2 is not spared
    {
      const s = setup([[0, 0, 0], [100, 0, 0]], { deathlessSeat: 'P9' });
      s.face(1, [100, 12, 0]); s.shoot(1, [100, 12, 0]);
      expect(sum(s.room.player(2)!.health.hp)).toBeLessThan(sum(fresh.hp));
    }
  });

  it('only the named seat: its own rounds still hurt the others', () => {
    const s = setup([[0, 0, 0], [100, 0, 0]], { deathlessSeat: 'P2' });
    s.face(2, [0, 12, 0]); s.shoot(2, [0, 12, 0]);
    expect(s.applied(s.c[1]!, 'fire')).toHaveLength(1);
    expect(sum(s.room.player(1)!.health.hp)).toBeLessThan(sum(fresh.hp));
  });

  it('a stream of rounds that kills without the option leaves the named seat alive at full health', () => {
    const volley = (opts: { deathlessSeat?: string }) => {
      const s = setup([[0, 0, 0], [100, 0, 0]], opts);
      s.face(1, [100, 12, 0]);
      for (let i = 0; i < 12 && s.room.player(2)!.alive; i++) { s.shoot(1, [100, 12, 0]); s.drive(1, 0.3); }
      return s;
    };
    const mortal = volley({});
    expect(mortal.room.player(2)!.alive).toBe(false);
    const spared = volley({ deathlessSeat: 'P2' });
    expect(spared.room.player(2)!.alive).toBe(true);
    expect(spared.room.player(2)!.health.hp).toEqual(fresh.hp);
    expect(spared.applied(spared.c[0]!, 'fire').length).toBeGreaterThanOrEqual(4);
    expect(spared.applied(spared.c[0]!, 'fire').every((e) => e.killed === false)).toBe(true);
  });

  it('a blast at its feet: lethal without the option, nothing taken with it; the blast still reaches it', () => {
    const blast = (opts: { deathlessSeat?: string }) => {
      const s = setup([[0, 0, 0], [10, 0, 0]], opts);
      s.drive(1, 0.2); s.drop(1);
      s.room.player(1)!.sim.walker.place(-600, 20, 0);
      s.fuse();
      return s;
    };
    const mortal = blast({});
    expect(mortal.room.player(2)!.alive).toBe(false);
    const spared = blast({ deathlessSeat: 'P2' });
    expect(spared.room.player(2)!.alive).toBe(true);
    expect(spared.room.player(2)!.health.hp).toEqual(fresh.hp);
    expect(spared.applied(spared.c[1]!, 'blast').length + spared.c[1]!.of('blast').length).toBeGreaterThan(0);
  });

  it('a fall: a lethal drop kills without the option and takes nothing with it', () => {
    const fall = (opts: { deathlessSeat?: string }) => {
      const s = setup([[0, 0, 0], [400, 0, 0]], opts);
      const w = s.room.player(2)!.sim.walker;
      w.state.y += 400; w.setAirborne(true);
      s.drive(2, 3);
      return s;
    };
    const mortal = fall({});
    expect(mortal.room.player(2)!.alive).toBe(false);
    const spared = fall({ deathlessSeat: 'P2' });
    expect(spared.room.player(2)!.alive).toBe(true);
    expect(spared.room.player(2)!.health.hp).toEqual(fresh.hp);
  });

  // the batch-3 review (part B), F4: a copy per fragment let every one of a shell's pellets land on the deathless seat
  it("a shotgun shell: the deathless seat's pellets stop at the lethal one, as a mortal seat's do; the default path applies them as before", () => {
    const shell = (opts: { deathlessSeat?: string }) => {
      const s = setup([[0, 0, 0], [50, 0, 0]], opts, kit(84, 15, 255, 255, 255));   // 50 u: 9-15 pellets of 34
      s.face(1, [50, 12, 0]); s.shoot(1, [50, 12, 0], 4);
      const hits = s.applied(s.c[0]!, 'fire');
      expect(hits).toHaveLength(1);
      return { s, hit: hits[0]! };
    };
    const mortal = shell({});
    expect(mortal.hit.killed).toBe(true);
    expect(mortal.s.room.player(2)!.alive).toBe(false);
    // the default path: the pellets laid one by one on the victim's own health, the last one lethal and none before it
    const replay = freshHealth(), piercing = quantiseHit(34, SHOTGUN.piercing).piercing;
    const deaths = mortal.hit.hitLocations!.map((h) => applyHit(replay, h.part, h.rawDamage, piercing));
    expect(deaths.at(-1)).toBe(true);
    expect(deaths.slice(0, -1).every((d) => !d)).toBe(true);
    expect(mortal.hit.rawDamage).toBe(34 * mortal.hit.hitLocations!.length);
    // the deathless seat: the same pellets (the same draws), no more, unharmed and not killed
    const spared = shell({ deathlessSeat: 'P2' });
    expect(spared.hit.hitLocations).toEqual(mortal.hit.hitLocations);
    expect(spared.hit.rawDamage).toBe(mortal.hit.rawDamage);
    expect(spared.hit.killed).toBe(false);
    expect(spared.s.room.player(2)!.alive).toBe(true);
    expect(spared.s.room.player(2)!.health.hp).toEqual(fresh.hp);
    expect(spared.s.room.player(2)!.health.armour).toEqual(fresh.armour);
  });

  it("a launched round's direct hit: it lays its 25 without the option; with it the named seat's health is untouched, the hit still reported", () => {
    const direct = (opts: { deathlessSeat?: string }) => {
      const s = setup([[60, 0, 0], [0, 0, 0]], opts);
      s.raise(2);
      const at = s.feet(1);
      s.rocket(2, [at[0], at[1] + 10, at[2]]);
      s.run(1);
      return s;
    };
    const mortal = direct({});
    expect(mortal.applied(mortal.c[1]!, 'impact')).toHaveLength(1);
    const h = mortal.room.player(1)!.health;
    expect({ hp: h.hp, armour: h.armour }).not.toEqual({ hp: fresh.hp, armour: fresh.armour });   // laid (on the armour, at 25)
    const spared = direct({ deathlessSeat: 'P1' });
    const [hit] = spared.applied(spared.c[1]!, 'impact');
    expect(hit).toMatchObject({ status: 'applied', rawDamage: 25, killed: false });
    expect(spared.room.player(1)!.alive).toBe(true);
    expect(spared.room.player(1)!.health.hp).toEqual(fresh.hp);
    expect(spared.room.player(1)!.health.armour).toEqual(fresh.armour);
  });

  it("a rule's damage (RULE_DAMAGE_ADAPTATION): lethal without the option; with it the named seat lives at full health, told", () => {
    const ruled = (opts: { deathlessSeat?: string }) => {
      let rules: RuleRoom | null = null;
      const ruleHost: RoomRuleHost = {
        attach: (r) => { rules = r; }, event: () => undefined, hit: () => 1, roundEnd: () => false, request: () => undefined, endStep: () => undefined,
      };
      const s = setup([[0, 0, 0], [100, 0, 0]], { ...opts, ruleHost });
      expect(rules!.inRound()).toBe(true);
      rules!.damage(2, 500, 'hazard');
      return s;
    };
    const mortal = ruled({});
    expect(mortal.room.player(2)!.alive).toBe(false);
    const spared = ruled({ deathlessSeat: 'P2' });
    expect(spared.room.player(2)!.alive).toBe(true);
    expect(spared.room.player(2)!.health.hp).toEqual(fresh.hp);
    expect(spared.c[1]!.of('hurt').map((e) => e.health)).toEqual([fresh.hp]);
  });
});
