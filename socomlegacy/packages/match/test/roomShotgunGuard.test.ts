import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RIFLE, HELD_SIDEARM, M67, arsenalOf, type CollisionOwner, type GridParams, type Loadout, type SpawnSlot,
  type WeaponRecord, type WorldPoly,
} from '@s2u/scene';
import {
  cameraLook, centreClaim, encodeCommands, EYE_HEIGHT, faceToward, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type Command,
  type ServerEvent, type SimKits, type SimMap,
} from '../../viewer/src/sim';
import { Button } from '../../viewer/src/net/protocol';
import { Room, RESPAWN_FADE_S, type Conn } from '../src/room';
import { guarded, SHOTGUN_GUARD_SCOPE_READING, SHOTGUN_GUARD_TICKS, SHOTGUN_GUARD_WINDOW_READING } from '../src/shotgunGuard';

/**
 * PF-37 (web sprint 30; research 236 s1; ruling PF.R57): the shotgun's hit guard is the VICTIM's. `FUN_005abbc0`
 * (D:L464701-464737) skips a class-'Q' hit while the victim's remembered last projectile (`+0x1048`) is also 'Q', and
 * remembers the one it applies; `CZSealBody`'s update (`FUN_00550ef0` D:L418081-418083, retail 0x550f9c
 * `sw zero,0x1048(s5)`) clears the memory once an update. The port: the victim's `qHitAt` tick, a second shotgun
 * volley refused inside one game frame (`SHOTGUN_GUARD_TICKS`, `SHOTGUN_GUARD_WINDOW_READING`), the shooter's
 * once-a-victim volley set kept (M4). On the synthetic floor of `roomPenetration.test.ts` (the pattern copied, not
 * imported). Not `roomShotgun.test.ts` (PF-23's, parked: PF.R58).
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
/** An 870 whose pellet is 2.45 x 14 = 34.3 (the room's 'scaled' pellet), four rays a shell: it kills at 40 u. */
const SHOTGUN = rec({ name: '870', id: 84, fireWait: 0.75, magazine: 8, mags: 5, reloadAfterShot: true, reloadDelay: 1, pellets: 4, impactDamage: 2.45, damageModifier: 0, effectiveRange: 41, maximumRange: 84, piercing: 6 });
/** A light 12-gauge (a pellet 0.15 x 14 = 2.1, the packet's 2): a volley never kills, so a second one shows. */
const LIGHT = rec({ name: 'LIGHT870', id: 901, fireWait: 0.75, magazine: 8, mags: 5, reloadAfterShot: true, reloadDelay: 1, pellets: 4, impactDamage: 0.15, damageModifier: 0, effectiveRange: 41, maximumRange: 84, piercing: 0 });
const arsenal = arsenalOf(['ZAMMO', [], 'ZWEAPON', [] as never]);
const M4 = kit(DEFAULT_RIFLE.id, 15, 255, 255, 255);
function kits(terrorist: Loadout, seal: Loadout): SimKits {
  return {
    table: {
      arsenal, records: new Map([DEFAULT_RIFLE, HELD_SIDEARM, SHOTGUN, LIGHT].map((x) => [x.id, x])),
      rounds: new Map(), throwables: new Map([M67].map((x) => [x.id, { record: x, piercing: 0 }])),
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
 * Players 1 (T), 2 (S), 3 (S), 4 (T) -- the join rule -- at `at[i]`, the Terrorists' kit `terrorist`; the combat
 * report on. `pull` queues `id`'s rays at its last command (decided when the next command runs: `due`); `tick` runs
 * one command of every player named and ONE room step, so two shooters' pulls are decided on the same room tick.
 */
function setup(at: readonly V3[], terrorist: Loadout) {
  let seed = 1;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const room = new Room(map(), null, { now: () => 0, random, combatReport: true }, null, kits(terrorist, M4));
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
  const tick = (ids: readonly number[], n = 1, buttons = 0): void => {
    for (let i = 0; i < n; i++) {
      for (const id of ids) {
        const p = room.player(id)!;
        const l = look.get(id) ?? { yaw: p.sim.walker.state.yaw, pitch: 0 };
        const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: l.yaw, pitch: l.pitch, turn: 0, buttons, stance: 0, weapon: 0 };
        room.binary(id, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
      }
      room.step();
    }
  };
  const face = (id: number, point: V3): void => {
    look.set(id, faceToward({ feet: feet(id), posture: room.player(id)!.sim.walker.posture }, point));
    room.player(id)!.sim.allowSnap();   // staged as the room would set it (LATER 14: no free turn after a spawn)
    tick([id], 30);
  };
  const pull = (id: number, point: V3, n = 4): void => {
    const p = room.player(id)!, seq = p.sim.seq, f = p.cone.frame(seq)!;
    const { eye: e } = cameraLook(f);
    const c = centreClaim(f, [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]], Math.hypot(point[0] - e[0], point[1] - e[1], point[2] - e[2]));
    for (let i = 0; i < n; i++) room.text(id, { type: 'fire', seq, from: c.from, dir: c.dir, eye: c.eye, aim: c.aim, weapon: 0, viewTick: room.tick });
  };
  const on = (c: Client, target: number) => c.of('combat').filter((e) => e.request === 'fire' && e.target?.id === target);
  /** The room's own player record (its view hides these): the victim's memory, the kit's records. */
  const own = (id: number) => room.player(id) as unknown as { qHitAt: number; records: readonly [WeaponRecord, WeaponRecord] };
  /** `id` made hard to kill (every part 1000): the volleys' count shows, not a death (a head's 8 falls to four pellets). */
  const tough = (id: number): void => { room.player(id)!.health.hp.fill(1000); };
  return { room, c: cs, tick, face, pull, on, tough, own };
}

describe('PF-37: the shotgun guard is the victim\'s, once a victim update (research 236 s1; ruling PF.R57)', () => {
  it("two shooters' volleys on one victim on the same tick land once: the second is a 'guard' miss (005abbc0 D:L464701-464737: a Q hit skipped while the remembered one is Q; SHOTGUN_GUARD_WINDOW_READING); a volley two ticks later lands (00550ef0 D:L418081-418083 clears +0x1048 each update: no latch)", () => {
    expect(SHOTGUN_GUARD_WINDOW_READING).toBe('victim update (one game frame)');
    expect(SHOTGUN_GUARD_TICKS).toBe(2);                                         // one game frame on the 60 Hz transport
    expect([guarded(10, 10), guarded(11, 10), guarded(12, 10), guarded(0, -Infinity)]).toEqual([true, true, false, false]);
    // 1 (T) and 4 (T) either side of the line to 2 (S) at 60 u; 3 (S) away. The light 12-gauge on a tough body: no volley kills.
    const target: V3 = [60, 12, 0];
    const s = setup([[0, 0, -20], target, [0, 0, 600], [0, 0, 20]], kit(LIGHT.id, 15, 255, 255, 255));
    s.face(1, target); s.face(4, target);
    s.tough(2);
    s.pull(1, target); s.pull(4, target);
    s.tick([1, 4]);                                                              // both decided on this room tick
    const t0 = s.room.tick;
    expect(s.c[1]!.of('hurt')).toHaveLength(1);
    expect(s.on(s.c[0]!, 2).map((e) => e.status)).toEqual(['applied']);
    expect(s.on(s.c[3]!, 2).map((e) => [e.status, e.reason])).toEqual([['miss', 'guard']]);
    expect(s.own(2).qHitAt).toBe(t0);
    expect(s.room.player(2)!.alive).toBe(true);
    // One tick later is still the same game frame: guarded.
    s.tick([1, 4], 50);                                                          // the pump's FireWait (0.75 s) past
    s.pull(1, target);
    s.tick([1, 4]);
    s.pull(4, target);
    s.tick([1, 4]);
    expect(s.c[1]!.of('hurt')).toHaveLength(2);
    expect(s.on(s.c[3]!, 2).map((e) => e.reason)).toEqual(['guard', 'guard']);
    // Two ticks later: the next frame's update has cleared the memory -- the volley lands (no permanent latch).
    s.tick([1, 4], 50);
    s.pull(1, target);
    s.tick([1, 4]);
    s.tick([1, 4]);
    s.pull(4, target);
    s.tick([1, 4]);
    expect(s.c[1]!.of('hurt')).toHaveLength(4);
    expect(s.on(s.c[3]!, 2).map((e) => e.status)).toEqual(['miss', 'miss', 'applied']);
    expect(s.room.player(2)!.alive).toBe(true);
  });

  it("one volley's rays hit a victim once (the shooter's volley set, M4) and two victims each once; a rifle round on a victim just hit by a volley lands (SHOTGUN_GUARD_SCOPE_READING: class Q only)", () => {
    expect(SHOTGUN_GUARD_SCOPE_READING).toBe('class Q only');
    // 2 (S) at 40, 3 (S) at 70 behind it: the shell's rays pass both (PF-24), each victim hurt once, no 'guard'.
    const s = setup([[0, 0, 0], [40, 0, 0], [70, 0, 0], [0, 0, 600]], kit(LIGHT.id, 15, 255, 255, 255));
    s.face(1, [40, 12, 0]);
    s.tough(2); s.tough(3);
    s.pull(1, [40, 12, 0], 4);
    s.tick([1]);
    expect(s.c[1]!.of('hurt')).toHaveLength(1);
    expect(s.c[2]!.of('hurt')).toHaveLength(1);
    expect(s.on(s.c[0]!, 2).map((e) => e.status)).toEqual(['applied']);
    expect(s.on(s.c[0]!, 3).map((e) => e.status)).toEqual(['applied']);
    expect(s.c[0]!.of('combat').some((e) => e.reason === 'guard')).toBe(false);
    // 4 (T) with the M4A1 on the same tick as a volley on 2: the rifle round is not class Q, it lands.
    const r = setup([[0, 0, -20], [60, 0, 0], [0, 0, 600], [0, 0, 20]], kit(LIGHT.id, 15, 255, 255, 255));
    // Player 4's kit is the Terrorists' too: give it the rifle (the kit table's records, its firearm 0).
    const p4 = r.own(4);
    p4.records = [DEFAULT_RIFLE, p4.records[1]];
    r.face(1, [60, 12, 0]); r.face(4, [60, 12, 0]);
    r.tough(2);
    r.pull(1, [60, 12, 0]); r.pull(4, [60, 12, 0], 1);
    r.tick([1, 4]);
    expect(r.on(r.c[0]!, 2).map((e) => e.status)).toEqual(['applied']);
    expect(r.on(r.c[3]!, 2).map((e) => e.status)).toEqual(['applied']);
    expect(r.c[1]!.of('hurt')).toHaveLength(2);
  });

  it("a kill by the first volley makes the second a 'not alive' miss, never a 'guard'; a new life clears the victim's memory", () => {
    // The full 870 at 40 u kills 2 (S); 4's volley on the same tick finds no living body: the room's walk passes the
    // dead (`fire`: `!q.alive`), so the miss names no target ('not alive' is `bulletHit`'s for a body dead since struck).
    const target: V3 = [40, 12, 0];
    const s = setup([[0, 0, -15], [40, 0, 0], [0, 0, 600], [0, 0, 15]], kit(SHOTGUN.id, 15, 255, 255, 255));
    s.face(1, target); s.face(4, target);
    s.pull(1, target); s.pull(4, target);
    s.tick([1, 4]);
    const t0 = s.room.tick;
    expect(s.room.player(2)!.alive).toBe(false);
    expect(s.on(s.c[0]!, 2).map((e) => [e.status, e.killed])).toEqual([['applied', true]]);
    const second = s.c[3]!.of('combat').filter((e) => e.request === 'fire');
    expect(second.length).toBeGreaterThan(0);
    expect(second.every((e) => e.status === 'miss' && (e.reason == null || e.reason === 'not alive'))).toBe(true);
    expect(second.some((e) => e.reason === 'guard')).toBe(false);
    expect(s.own(2).qHitAt).toBe(t0);
    // The respawn (the dead's Action past the fade, `respawnReady`): a new body, the memory cleared (the constructor
    // `FUN_00553ea0` D:L419774 clears +0x1048 too).
    s.tick([2], Math.round((RESPAWN_FADE_S + 0.5) * TICK_HZ), 0x0);
    s.tick([2], 2, Button.Action);
    expect(s.room.player(2)!.alive).toBe(true);
    expect(s.own(2).qHitAt).toBe(-Infinity);
  });
});
