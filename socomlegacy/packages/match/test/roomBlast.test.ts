import { describe, expect, it } from 'vitest';
import { arsenalOf, CLAYMORE, DEFAULT_RIFLE, HELD_SIDEARM, launchGrenade, M67, MARK141 } from '@s2u/scene';
import type { CollisionOwner, EffectProgram, GridParams, Loadout, SpawnSlot, ThrowableRecord, WorldPoly } from '@s2u/scene';
import {
  encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, ROUND_WATCH_S, TICK_HZ, type ClientEvent, type MapMeta, type ServerEvent, type SimKits,
  type SimMap,
} from '../../viewer/src/sim';
import { FLASH_FRIENDLY_FIRE_READING } from '../../viewer/src/net/blast';
import { Room, type Conn } from '../src/room';

/**
 * The room's blasts (web research 85 section 7, 91 section 5; `../../viewer/src/net/blast`) and its single-player match
 * (`solo`, the page's offline loopback: `../../viewer/src/net/loopback`), on a synthetic floor, as `room.test.ts` does.
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};

/** The flat map; with `wall`, a wall across x = 30 from z -200 to 200, 80 high (between a blast at 0 and x 60). */
function map(wall = false): SimMap {
  const polys: WorldPoly[] = [FLOOR];
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  if (wall) {
    polys.push({ ...FLOOR, path: 'worldmodel/wall', ditype: 2, points: Float32Array.from([30, 0, -200, 30, 0, 200, 30, 80, 200, 30, 80, -200]) });
    owners.push({ modelName: 'worldmodel', path: 'worldmodel/wall0', first: 1, count: 1 });
  }
  const ground = packGround(PARAMS, polys, owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [] };
}

class Client implements Conn {
  readonly events: ServerEvent[] = [];
  readonly frames: Uint8Array[] = [];
  closed: { code: number; reason: string } | null = null;
  send(frame: Uint8Array | string): void {
    if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent);
    else this.frames.push(frame);
  }
  close(code: number, reason: string): void { this.closed = { code, reason }; }
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] {
    return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[];
  }
}

/** A room with a scripted draw: `script` is spent first, then a seeded one. */
function setup(opts: ConstructorParameters<typeof Room>[2] = {}, m: SimMap = map()) {
  let now = 0, seed = 1;
  const script: number[] = [];
  const random = (): number => {
    if (script.length) return script.shift()!;
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const room = new Room(m, null, { now: () => now, random, ...opts });
  const join = (id: number): Client => {
    const c = new Client();
    room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99' }, `10.0.0.${id}`);
    return c;
  };
  /**
   * Each of `ids` sends a command at rest and the room steps, `n` times: the bodies land, and the thrower's command has
   * its frame (M-8: a throw is decided at the command it names).
   */
  const settle = (ids: readonly number[], n = 60): void => {
    for (let i = 0; i < n; i++) {
      for (const id of ids) {
        const p = room.player(id);
        if (!p) continue;
        const seq = p.sim.seq + 1;
        room.binary(id, encodeCommands({ viewTick: room.tick, commands: [{ seq, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 }] }));
      }
      room.step();
    }
  };
  /** The page's drop at `id`'s feet from its eye: an M67 let go at rest (a toss's launch at power 0, near enough). */
  const drop = (id: number, kind = 'M67'): void => {
    const p = room.player(id)!, st = p.sim.walker.state;
    room.text(id, { type: 'throw', seq: p.sim.seq, kind, from: [st.x, st.y + 15.4, st.z], velocity: [0, 0, 0] });
  };
  return { room, join, script, settle, drop, advance: (ms: number) => { now += ms; } };
}

const FUSE_TICKS = 3.2 * TICK_HZ;

/** P2: `owner`'s Mark141 lying at `at` with its fuse run out: it goes off on the room's next game frame (`stepGrenade`). */
function flashAt(room: Room, owner: number, at: [number, number, number]): void {
  const g = launchGrenade(at, [0, 0, 0], MARK141);
  g.state = 'rest'; g.vel = [0, 0, 0]; g.fuse = 0;
  (room as unknown as { flying: unknown[] }).flying.push({ owner: room.player(owner)!, name: `P${owner}`, kind: MARK141.name, g, pid: 4242 });
}

describe('the room\'s blast (FUN_005a0e70)', () => {
  it('knocks a survivor: the blast event carries the knock, and the server\'s mover leaves the ground with it', () => {
    const { room, join, script, settle, drop } = setup();
    const t = join(1), s = join(2);                               // a Terrorist throws, a SEAL 120 off survives
    void t;
    room.step();
    room.player(1)!.sim.walker.place(0, 20, 0);
    room.player(2)!.sim.walker.place(120, 20, 0);
    settle([1]); drop(1);
    room.player(1)!.sim.walker.place(-600, 20, 0);                // the thrower walks off before the fuse
    let knocked = false;
    for (let i = 0; i < FUSE_TICKS; i++) {
      if (i === FUSE_TICKS - 30) script.push(0.5, 0.0, 0.65);     // 13 close -> 0.81 -> 1 fragment, on the left arm
      room.step();
      if (s.of('blast').length && !knocked) { knocked = true; expect(room.player(2)!.sim.walker.airborne).toBe(true); }
    }
    const b = s.of('blast');
    expect(b).toHaveLength(1);
    expect(b[0]!.ring).toEqual({ seconds: 5, volume: 0.35 });
    expect(b[0]!.knock).not.toBeNull();
    expect(b[0]!.knock!.velocity[0]).toBeGreaterThan(0);          // away from the blast
    expect(b[0]!.after).toBe(room.player(2)!.sim.seq);
    expect(s.of('hurt')).toHaveLength(1);
    expect(room.player(2)!.alive).toBe(true);
    expect(t.of('flinch')).toEqual([]);                           // a blast knocks, it does not flinch (cause 4, L461402)
    expect(s.of('flinch')).toEqual([]);                           // nor on the victim's own page (MATCH-FIX-2)
    // PF-10 fix round (B1): no flinch, but its health dropped: the hurt voice plays (FUN_005477a0 runs before the
    // flinch's cause test, L461396-461402) to every page, and closes the gate (FUN_0053b710 D:L405268-405290).
    expect(t.of('hurtVoice')).toEqual([{ type: 'hurtVoice', id: 2 }]);
    expect(s.of('hurtVoice')).toEqual([{ type: 'hurtVoice', id: 2 }]);
  });

  it('hurts the thrower as anyone: an M67 at the thrower\'s own feet kills it, a suicide', () => {
    const { room, join, settle, drop } = setup();
    const t = join(1);
    join(2);
    room.step();
    room.player(1)!.sim.walker.place(0, 20, 0);
    room.player(2)!.sim.walker.place(600, 20, 0);
    settle([1]); drop(1);
    for (let i = 0; i < FUSE_TICKS; i++) room.step();
    expect(t.of('hurt')).toHaveLength(1);
    expect(t.of('blast')).toHaveLength(1);
    expect(room.player(1)!.alive).toBe(false);
    expect(t.of('kill')[0]).toMatchObject({ victim: 1, how: 'suicide', weapon: 'M67', cause: 4 });   // PF-10: a blast's cause
  });

  it('throws the SEAL it kills (FUN_0057e770 L440981: inside the radius or dead) and the corpse stays down', () => {
    const { room, join, settle, drop } = setup();
    const t = join(1);
    join(2);
    room.step();
    room.player(1)!.sim.walker.place(0, 20, 0);
    room.player(2)!.sim.walker.place(600, 20, 0);
    settle([1]); drop(1);
    for (let i = 0; i < FUSE_TICKS; i++) room.step();
    const b = t.of('blast');
    expect(b).toHaveLength(1);
    expect(b[0]!.knock).not.toBeNull();                              // CORPSE_KNOCK_PLACEHOLDER retired
    expect(t.of('kill')[0]).toMatchObject({ victim: 1, clip: null }); // standing: no death clip, the knock's fall
    // The blast event comes before the kill, so the page lays the knock on its prediction while still alive.
    const order = t.events.map((e) => e.type).filter((k) => k === 'blast' || k === 'kill');
    expect(order).toEqual(['blast', 'kill']);
    const w = room.player(1)!.sim.walker;
    expect(w.dead).toBe(true);
    const seen: string[] = [];
    for (let i = 0; i < 4 * TICK_HZ; i++) {                          // no commands come: the room's clock ticks the body
      room.step();
      const n = w.action?.name ?? 'none';
      if (seen[seen.length - 1] !== n) seen.push(n);
    }
    expect(['landDeath', 'landBackwards']).toContain(seen[seen.length - 1]);
    expect(seen.some((n) => n.startsWith('getUp'))).toBe(false);
    expect(w.airborne).toBe(false);
  });

  it('a prone SEAL it kills is not thrown: the prone death clip of the BODY list (L441013-441015)', () => {
    const { room, join, settle, drop } = setup();
    const t = join(1);
    join(2);
    room.step();
    room.player(1)!.sim.walker.place(0, 20, 0);
    room.player(1)!.sim.walker.changeStance('prone');
    for (let i = 0; i < 2 * TICK_HZ; i++) room.player(1)!.sim.walker.tick({ forward: 0, right: 0, boost: false });
    expect(room.player(1)!.sim.walker.posture).toBe('prone');
    room.player(2)!.sim.walker.place(600, 20, 0);
    settle([1]); drop(1);
    for (let i = 0; i < FUSE_TICKS; i++) room.step();
    expect(room.player(1)!.alive).toBe(false);
    expect(t.of('blast')[0]!.knock).toBeNull();
    expect(t.of('kill')[0]).toMatchObject({ victim: 1, clip: 'death_prone_chest01' });
  });

  it('a wall between the blast and the head: no hurt, no blast event (FUN_005ac070)', () => {
    const { room, join, settle, drop } = setup({}, map(true));
    join(1);
    const s = join(2);
    room.step();
    room.player(1)!.sim.walker.place(0, 20, 0);
    room.player(2)!.sim.walker.place(60, 20, 0);
    settle([1]); drop(1);
    room.player(1)!.sim.walker.place(-600, 20, 0);
    for (let i = 0; i < FUSE_TICKS; i++) room.step();
    expect(s.of('hurt')).toHaveLength(0);
    expect(s.of('blast')).toHaveLength(0);
    expect(room.player(2)!.alive).toBe(true);
  });

  // P2 (the online-parity sweep's TB-1; research 85 s9.5, s12): the white-out is reached only inside the queued blast --
  // `FUN_005a5250`'s slot 0 (`{`, the flashbang) is called from `FUN_005a0e70` D:L459228 alone, after the line's veto
  // (D:L459192-459193) and the reach factor (D:L459227); its other callers (D:L458970, D:L458981) pass '}' and 'z'. So
  // the room sends the level it resolved (`blast.flash`, `flashLevel` from the feet and facing), and none where the
  // blast never reached the SEAL.
  it('P2: a Mark141 in the open, faced close, sends the victim blast.flash 3; turned away, 1', () => {
    for (const [yaw, level] of [[90, 3], [270, 1]] as const) {
      const { room, join } = setup();
      join(1);
      const s = join(2);                                          // T throws, a SEAL 60 off
      room.step();
      room.player(1)!.sim.walker.place(-600, 20, 0);
      room.player(2)!.sim.walker.place(60, 20, 0);
      for (let i = 0; i < 30; i++) room.step();                   // the bodies land
      room.player(2)!.sim.walker.state.yaw = yaw;                 // 90: forward (-1, 0, 0), toward the flash
      flashAt(room, 1, [0, 1, 0]);
      for (let i = 0; i < 5; i++) room.step();
      const b = s.of('blast');
      expect(b, `yaw ${yaw}`).toHaveLength(1);
      expect(b[0]!.flash, `yaw ${yaw}`).toBe(level);
      expect(b[0]!.knock).toBeNull();                             // no fragments, no push (research 85 s12)
    }
  });

  it('P2: a Mark141 behind the wall sends the SEAL nothing -- no blast, so no white-out (FUN_005a0e70 D:L459192-459193)', () => {
    const { room, join } = setup({}, map(true));
    join(1);
    const s = join(2);
    room.step();
    room.player(1)!.sim.walker.place(-600, 20, 0);
    room.player(2)!.sim.walker.place(60, 20, 0);
    for (let i = 0; i < 30; i++) room.step();
    room.player(2)!.sim.walker.state.yaw = 90;
    flashAt(room, 1, [0, 1, 0]);
    for (let i = 0; i < 5; i++) room.step();
    expect(s.of('blast')).toHaveLength(0);
  });

  it('P2: friendly fire off, a teammate\'s Mark141 in the open sends nothing (the PF-22 gate; FLASH_FRIENDLY_FIRE_READING)', () => {
    expect(FLASH_FRIENDLY_FIRE_READING).toBe('spared');
    const { room, join } = setup();
    join(1); const enemy = join(2); join(3); const mate = join(4);  // T, S, S, T (the join rule)
    room.step();
    room.player(1)!.sim.walker.place(-600, 20, 0);
    room.player(2)!.sim.walker.place(60, 20, 20);
    room.player(3)!.sim.walker.place(600, 20, 0);
    room.player(4)!.sim.walker.place(60, 20, -20);
    for (let i = 0; i < 30; i++) room.step();
    room.player(2)!.sim.walker.state.yaw = 90;
    room.player(4)!.sim.walker.state.yaw = 90;
    flashAt(room, 1, [0, 1, 0]);
    for (let i = 0; i < 5; i++) room.step();
    expect(mate.of('blast')).toHaveLength(0);
    expect(enemy.of('blast').map((b) => b.flash)).toEqual([3]);
  });

  // m-13 (review 2): the grenade keeps its thrower's name, and a kill by a thrower who has left is no one's -- not the
  // victim's suicide (-2, research 91 s3). PF-22 (PF.R40; research 179 s8.2 (a), DEPARTED_OWNER_FF_READING): the gate
  // looks the owner up live by id (FUN_005ac670 0x5ac6b8-0x5ac750); a departed one is not found, so the gate does not
  // apply and his former teammate is hurt as anyone (review 2's "spared" was the room's convenience, not the original).
  it('the thrower leaves before the fuse: the gate finds no live owner, so its teammate is hurt as anyone; the enemy it kills pays nothing; the line names it', () => {
    const { room, join, settle, drop } = setup();
    join(1); const enemy = join(2); join(3); const mate = join(4);  // T, S, S, T (the join rule)
    expect([1, 2, 3, 4].map((id) => room.player(id)!.team)).toEqual(['terrorist', 'seal', 'seal', 'terrorist']);
    room.step();
    room.player(1)!.sim.walker.place(0, 20, 0);
    room.player(2)!.sim.walker.place(4, 20, 0);
    room.player(3)!.sim.walker.place(600, 20, 0);
    room.player(4)!.sim.walker.place(-4, 20, 0);
    settle([1, 2, 4]);
    drop(1);
    expect(enemy.of('grenade')).toHaveLength(1);
    room.leave(1);
    for (let i = 0; i < FUSE_TICKS; i++) room.step();
    expect(mate.of('hurt').length).toBeGreaterThan(0);
    expect(mate.of('blast')).toHaveLength(1);
    expect(enemy.of('blast')).toHaveLength(1);
    expect(room.player(2)!.alive).toBe(false);
    const kill = enemy.of('kill').find((k) => k.victim === 2)!;
    expect(kill).toMatchObject({ killer: null, how: 'orphan', killerName: 'P1', weapon: 'M67' });
    expect(room.player(2)!.score).toBe(0);
    expect(room.player(2)!.deaths).toBe(1);
  });

  it('m-13: a new player given the departed thrower\'s id is not taken for the thrower', () => {
    const { room, join, settle, drop } = setup();
    join(1); const enemy = join(2);
    room.step();
    room.player(1)!.sim.walker.place(0, 20, 0);
    room.player(2)!.sim.walker.place(4, 20, 0);
    settle([1, 2]);
    drop(1);
    room.leave(1);
    join(1);                                                      // the id handed out again, a Terrorist again
    room.player(1)!.sim.walker.place(900, 20, 0);
    for (let i = 0; i < FUSE_TICKS; i++) room.step();
    expect(room.player(2)!.alive).toBe(false);
    expect(enemy.of('kill').find((k) => k.victim === 2)).toMatchObject({ killer: null, how: 'orphan' });
    expect(room.player(1)!.score).toBe(0);
    expect(room.player(1)!.kills).toBe(0);
  });
});

/**
 * PF-35 (research 235 §1-§2, 194 §7 A11; ruling PF.R55): C4's `IgnoreExplosionDI` in the room's player blast. The flat
 * floor and a C4 target across z 330 (x -40..40, 60 high: health 1, shield 17 -- `roomEquipment.test.ts`' `barrierMap`,
 * copied, not imported); the charge planted 10 short of it, a SEAL's head on the far side. C4 and its records as the
 * room tests write them (`roomBarriers.test.ts`), the flagged one carrying the bit the disc's `C4 Ammo` carries
 * (`throwableRecord`, `projectile.test.ts`).
 */
const C4_WALL = 'worldmodel/access1/good_parts/di_good';
function c4Map(): SimMap {
  const wall: WorldPoly = { ...FLOOR, path: C4_WALL, ditype: 2, points: Float32Array.from([-40, 0, 330, 40, 0, 330, 40, 60, 330, -40, 60, 330]) };
  // Research 386 §3.2: the blast's line to a head is one-sided (`blastSeen`), so the wall has both faces, as MP83's `access1`
  // barrier it copies has on the disc (`di_good` at z 1593.37, -z, and 1593.75, +z; review 3) -- its face toward the
  // charge (normal -z) the one that stops the M67's line. Many disc faces have no back face (386 §3.2).
  const back: WorldPoly = { ...wall, points: Float32Array.from([-40, 60, 330, 40, 60, 330, 40, 0, 330, -40, 0, 330]) };
  const polys: WorldPoly[] = [FLOOR, wall, back];
  const owners: CollisionOwner[] = [
    { modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 },
    { modelName: 'worldmodel', path: C4_WALL, first: 1, count: 2, flags: 0x1001 },
  ];
  const ground = packGround(PARAMS, polys, owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  const paths = ['worldmodel/access1', 'worldmodel/access1/good_parts', C4_WALL, 'worldmodel/access1/access_action1'];
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
    initial: [{ path: C4_WALL, deactivate: false, saveActive: true, saveTransform: false, saveParent: false }],
    scene: {
      programs: [{ program: destroy, search: [0, 0, 1] }],
      destructibles: [{
        id: 0, key: 'access1#0@worldmodel/access1', anim: 'access1', instance: 0, root: 'worldmodel/access1', targetPath: C4_WALL,
        health: 1, armor: 0, shield: 17, program: access, nodes: [null, 'worldmodel/access1', C4_WALL],
      }],
    },
  };
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [], meta };
}

const kitOf = (...ids: number[]): Loadout => ids as unknown as Loadout;
/** The room tests' C4 (`roomBarriers.test.ts`), unflagged; `C4_FLAGGED` with the bit the disc's `C4 Ammo` carries. */
const C4_PLAIN: ThrowableRecord = { ...M67, ...CLAYMORE, name: 'C4', id: 151, fuse: 6, removal: 0.1, explosionDamage: 18, explosionRadius: 50 };
const C4_FLAGGED: ThrowableRecord = { ...C4_PLAIN, ignoreExplosionDI: true };
const c4Item = (name: string, id: number): unknown[] => ['InternalName', [name], 'ID', [String(id)], 'Ammo_Capacity', ['1'], 'NumMags', ['1'], 'AMMO_TYPES', [[]]];
const C4_ARSENAL = arsenalOf(['ZAMMO', [], 'ZWEAPON', [c4Item('C4', 151), c4Item('M67', 121), c4Item('HE', 126)]] as never);
function c4Kits(c4: ThrowableRecord): SimKits {
  const terrorist = kitOf(62, 15, 121, 126, 255), seal = kitOf(62, 15, 121, 126, 151);
  return {
    table: {
      arsenal: C4_ARSENAL, records: new Map([DEFAULT_RIFLE, HELD_SIDEARM].map((x) => [x.id, x])), rounds: new Map(),
      throwables: new Map([M67, c4].map((x) => [x.id, { record: x, piercing: x.id === 121 ? 4 : 0 }])),
    },
    map: {
      valves: new Map(), selectable: { seal: [], terrorist: [] },
      kits: { seal: [{ type: 'S', character: 's', loadout: seal }], terrorist: [{ type: 'T', character: 't', loadout: terrorist }] },
    },
  };
}

/**
 * The players of `at` joined in order (the join rule: T, S, S, T), each placed at its point; player 2 (a SEAL) plants.
 * `charge`: the kit table's C4. `plantC4`: the page's plant 2 ahead of the planter's feet, naming the wall (PF-13's
 * `target`/`surface`); `dropM67`: an M67 let go at the planter's feet. After either the planter walks off.
 */
function c4Setup(charge: ThrowableRecord, at: Record<number, [number, number, number]>) {
  let seed = 1;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const room = new Room(c4Map(), null, { now: () => 0, random, roundSeconds: 60 }, null, c4Kits(charge));
  const clients = new Map<number, Client>();
  for (const id of Object.keys(at).map(Number)) {
    const c = new Client();
    room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99', session: `tab${id}`.padEnd(22, '_') }, `10.0.0.${id}`);
    clients.set(id, c);
  }
  room.step();
  for (const [id, p] of Object.entries(at)) room.player(Number(id))!.sim.walker.place(p[0], p[1] + 20, p[2]);
  const run = (seconds: number): void => { for (let i = 0; i < Math.round(seconds * TICK_HZ); i++) room.step(); };
  // Half a second of commands at rest from everyone: the bodies land, and a throw has its command's frame (M-8).
  for (let i = 0; i < 30; i++) {
    for (const id of clients.keys()) {
      const p = room.player(id)!;
      room.binary(id, encodeCommands({ viewTick: room.tick, commands: [{ seq: p.sim.seq + 1, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 }] }));
    }
    room.step();
  }
  const away = (): void => { room.player(2)!.sim.walker.place(0, 20, -300); };
  const plantC4 = (): void => {
    const s = room.player(2)!.sim.walker.state;
    room.text(2, { type: 'throw', seq: room.player(2)!.sim.seq, kind: 'C4', from: [s.x, 0.1, s.z + 2], velocity: [0, 0, 1], target: 0, surface: { path: C4_WALL, point: [0, 12, 330] } } as unknown as ClientEvent);
    away();
  };
  const dropM67 = (): void => {
    const s = room.player(2)!.sim.walker.state;
    room.text(2, { type: 'throw', seq: room.player(2)!.sim.seq, kind: 'M67', from: [s.x, s.y + 15.4, s.z], velocity: [0, 0, 0] });
    away();
  };
  return { room, of: (id: number): Client => clients.get(id)!, run, plantC4, dropM67 };
}

describe('IgnoreExplosionDI in the room\'s player blast (PF-35, FUN_005a0e70)', () => {
  it('a C4 going off behind a wall hurts the SEAL whose head the blast cannot see (005a0e70 D:L459192-459193: the queued ray\'s veto skipped with the bit, IGNORE_EXPLOSION_DI_READING); the M67 at the same point and the same SEAL is occluded, as before', () => {
    // The charge at z 320 (10 short of the wall), the Terrorist's feet at z 338: 18 from the blast; the line from it to
    // his head (18.3 up) meets the wall about 10 up its 60.
    const c4 = c4Setup(C4_FLAGGED, { 1: [0, 0, 338], 2: [0, 0, 318] });
    c4.plantC4();
    expect(c4.room.player(2)!.grenades.C4).toBe(3);                          // planted
    c4.run(6.3);
    expect(c4.of(1).of('blast')).toHaveLength(1);
    expect(c4.of(1).of('hurt')).toHaveLength(1);
    // The M67 from the same feet, at the same SEAL: no hurt, no blast event (FUN_005ac070's line, unchanged).
    const m67 = c4Setup(C4_FLAGGED, { 1: [0, 0, 338], 2: [0, 0, 318] });
    m67.dropM67();
    expect(m67.of(1).of('grenade').filter((g) => g.kind === 'M67')).toHaveLength(1);   // thrown
    m67.run(3.6);
    expect(m67.of(1).of('blast')).toHaveLength(0);
    expect(m67.of(1).of('hurt')).toHaveLength(0);
    expect(m67.room.player(1)!.alive).toBe(true);
  });

  it('the bit changes nothing else: a flagged blast outside its radius hurts no one, friendly fire off still spares the planter\'s side, the fragments\' law and the knock are the unflagged ones at the same distance', () => {
    // 1: a Terrorist 18 off in the open; 3: the planter's mate behind the wall, 18 off; 4: a Terrorist behind the wall
    // 62 off (the charge's Explosion_Radius 50).
    const at: Record<number, [number, number, number]> = { 1: [-18, 0, 320], 2: [0, 0, 318], 3: [0, 0, 338], 4: [0, 0, 382] };
    const flagged = c4Setup(C4_FLAGGED, at), plain = c4Setup(C4_PLAIN, at);
    expect([1, 2, 3, 4].map((id) => flagged.room.player(id)!.team)).toEqual(['terrorist', 'seal', 'seal', 'terrorist']);
    for (const s of [flagged, plain]) { s.plantC4(); s.run(6.3); }
    expect(flagged.room.player(2)!.grenades.C4).toBe(3);
    expect(flagged.of(4).of('hurt')).toEqual([]);                            // outside the radius
    expect(flagged.of(4).of('blast')).toEqual([]);
    expect(flagged.of(3).of('hurt')).toEqual([]);                            // the planter's side, friendly fire off
    expect(flagged.of(3).of('blast')).toEqual([]);
    expect(flagged.room.player(3)!.alive).toBe(true);
    // In the open the flag decides nothing: the unflagged charge's fragments and knock, to the draw.
    expect(plain.of(1).of('blast')).toHaveLength(1);
    expect(flagged.of(1).of('blast')).toEqual(plain.of(1).of('blast'));
    expect(flagged.of(1).of('hurt')).toEqual(plain.of(1).of('hurt'));
    expect(flagged.room.player(1)!.health.hp).toEqual(plain.room.player(1)!.health.hp);
  });
});

/**
 * BOMB-DAMAGE (research 332 §3): C4 is a placed charge, its `Timer1` (6 s) counted from the plant (the placed tick
 * `FUN_003c5310` D:L316893-316905 sets `+0xc4` at its end; `FUN_003c8740` -> state 3, the explosion as any round's), and
 * its blast reaches the players through `blast()`'s player path -- already so before this task; this pins it at the
 * fuse's end.
 */
describe("C4's blast on a seat in reach at its fuse's end (BOMB-DAMAGE)", () => {
  it('a Terrorist 18 off in the open is untouched to just short of Timer1 and hurt at it: the blast event and his health', () => {
    const s = c4Setup(C4_PLAIN, { 1: [-18, 0, 320], 2: [0, 0, 318] });
    s.plantC4();
    expect(s.room.player(2)!.grenades.C4).toBe(3);                           // planted
    const hp = [...s.room.player(1)!.health.hp];
    s.run(5.8);
    expect(s.of(1).of('blast')).toEqual([]);
    expect(s.of(1).of('hurt')).toEqual([]);
    expect([...s.room.player(1)!.health.hp]).toEqual(hp);
    s.run(0.4);
    expect(s.of(1).of('blast')).toHaveLength(1);
    expect(s.of(1).of('hurt')).toHaveLength(1);
    const q = s.room.player(1)!;
    expect(!q.alive || q.health.hp.some((v, i) => v < hp[i]!)).toBe(true);
  });
});

describe('the single-player match (solo: the page\'s offline loopback)', () => {
  it('seats the one player as the host, a SEAL (FUN_002c5450), and starts classic\'s round at once', () => {
    const { room, join } = setup({ rules: 'classic', solo: true });
    const c = join(1);
    expect(c.of('welcome')[0]).toMatchObject({ role: 'player', team: 'seal', ghost: false });
    room.step();
    expect(c.of('roundStart')[0]).toMatchObject({ round: 1, rounds: 11 });
    expect(room.timeLeft()).toBeGreaterThan(359);
    expect(room.player(1)!.alive).toBe(true);
  });

  it('runs the round to its clock alone: no side is eliminated with nobody on it', () => {
    const { room, join } = setup({ rules: 'classic', solo: true, roundSeconds: 30 });
    const c = join(1);
    for (let i = 0; i < 29 * TICK_HZ; i++) room.step();
    expect(c.of('eliminated')).toHaveLength(0);
    for (let i = 0; i < 2 * TICK_HZ; i++) room.step();
    expect(c.of('roundOver')[0]).toMatchObject({ round: 1, winner: null });   // `mission_timer` at 00:00: a draw
  });

  it('a lone SEAL dead in classic: its side is eliminated, the Terrorists win the round', () => {
    const { room, join, settle, drop } = setup({ rules: 'classic', solo: true });
    const c = join(1);
    room.step();
    room.player(1)!.sim.walker.place(0, 20, 0);
    settle([1]); drop(1);
    for (let i = 0; i < (ROUND_WATCH_S + 1) * TICK_HZ; i++) room.step();
    expect(room.player(1)!.alive).toBe(false);
    expect(c.of('eliminated')).toEqual([{ type: 'eliminated', winner: 'terrorist' }]);
  });

  it('no idle kick in a match of one (the page left open is not a seat taken from anyone)', () => {
    const { room, join, advance } = setup({ solo: true });
    const c = join(1);
    for (let i = 0; i < 20; i++) { advance(60_000); room.step(); }
    expect(c.closed).toBeNull();
    expect(c.of('kicked')).toHaveLength(0);
  });
});
