import { describe, expect, it } from 'vitest';
import { DEFAULT_RIFLE, HELD_SIDEARM, arsenalOf, type CollisionOwner, type GridParams, type Loadout, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import {
  cameraLook, centreClaim, encodeCommands, EYE_HEIGHT, faceToward, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ,
  type Command, type ServerEvent, type SimKits, type SimMap,
} from '../../viewer/src/sim';
import type { CombatReport } from '../../viewer/src/net/protocol';
import { Room, type Conn, type RoomOptions } from '../src/room';

/**
 * LCM-6a (the live cards plan, `docs/plans/2026-11-09-live-cards-and-match-pages.md`; simulation-track review for this
 * one line): `RoomOptions.onCombatApplied`, an OBSERVER in `Room.combat()`'s applied branch -- told (attacker, target,
 * health taken) for an enemy's applied hit that took health, the same condition that sets `lastHurt` (NET-RES.R11),
 * health only, never armour. It changes nothing the room does: the same scripted hits with the option absent, present,
 * and throwing give the same room state and the same bytes to every connection. A synthetic flat floor and a one-rifle
 * kit, as `roomDamage.test.ts`; no game data.
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
const KIT = [DEFAULT_RIFLE.id, 15, 255, 255, 255] as unknown as Loadout;
function kits(): SimKits {
  return {
    table: { arsenal: arsenalOf(['ZAMMO', [], 'ZWEAPON', [] as never]), records: new Map([DEFAULT_RIFLE, HELD_SIDEARM].map((x) => [x.id, x])), rounds: new Map(), throwables: new Map() },
    map: { valves: new Map(), selectable: { seal: [], terrorist: [] }, kits: { seal: [{ type: 'S', character: 's', loadout: KIT }], terrorist: [{ type: 'T', character: 't', loadout: KIT }] } },
  };
}

class Client implements Conn {
  readonly frames: string[] = [];
  send(frame: Uint8Array | string): void { this.frames.push(typeof frame === 'string' ? frame : `bin:${Buffer.from(frame).toString('base64')}`); }
  close(): void { /* not used */ }
  events(): ServerEvent[] { return this.frames.filter((f) => !f.startsWith('bin:')).map((f) => JSON.parse(f) as ServerEvent); }
}

const tok = (tab: number): string => `tab${tab}`.padEnd(22, '_');
/** Players 1 (T), 2 (S), 3 (S), 4 (T) -- the join rule -- at fixed spots; friendly fire on so a teammate's round lands. */
const AT: readonly V3[] = [[0, 0, 0], [0, 0, -200], [0, 0, 600], [100, 0, 0]];

/**
 * One scripted sequence: player 1 shoots his teammate 4 once, then the enemy 2 until he falls; then the room runs on.
 * Returns every connection's frames and each player's state at the end.
 */
function script(opts: Partial<RoomOptions>) {
  let seed = 1;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const room = new Room(map(), null, { now: () => 0, random, allowFriendlyFire: true, ...opts }, null, kits());
  const cs = AT.map((_, i) => {
    const c = new Client();
    room.hello(i + 1, c, { type: 'hello', version: PROTOCOL_VERSION, name: `P${i + 1}`, map: 'MP99', session: tok(i + 1) }, `10.0.0.${i + 1}`);
    return c;
  });
  room.step();
  AT.forEach((p, i) => room.player(i + 1)!.sim.walker.place(p[0], p[1] + 20, p[2]));
  for (let i = 0; i < 30; i++) room.step();
  const look = new Map<number, { yaw: number; pitch: number }>();
  const feet = (id: number): V3 => { const w = room.player(id)!.sim.walker.state; return [w.x, w.y, w.z]; };
  const drive = (id: number, seconds: number): void => {
    for (let i = 0; i < Math.max(1, Math.round(seconds * TICK_HZ)); i++) {
      const p = room.player(id)!;
      const l = look.get(id) ?? { yaw: p.sim.walker.state.yaw, pitch: 0 };
      const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: l.yaw, pitch: l.pitch, turn: 0, buttons: 0, stance: 0, weapon: 0 };
      room.binary(id, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
      room.step();
    }
  };
  const face = (id: number, point: V3): void => {
    look.set(id, faceToward({ feet: feet(id), posture: room.player(id)!.sim.walker.posture }, point));
    room.player(id)!.sim.allowSnap();
    drive(id, 0.5);
  };
  const shoot = (id: number, point: V3): void => {
    const p = room.player(id)!, seq = p.sim.seq, f = p.cone.frame(seq)!;
    const { eye: e } = cameraLook(f);
    const c = centreClaim(f, [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]], Math.hypot(point[0] - e[0], point[1] - e[1], point[2] - e[2]));
    room.text(id, { type: 'fire', seq, from: c.from, dir: c.dir, eye: c.eye, aim: c.aim, weapon: 0, viewTick: room.tick });
    drive(id, 1 / TICK_HZ);
  };
  face(1, [100, 12, 0]); shoot(1, [100, 12, 0]); drive(1, 0.5);              // the teammate
  face(1, [0, 12, -200]);
  for (let i = 0; i < 4 && room.player(2)!.alive; i++) { shoot(1, [0, 12, -200]); drive(1, 0.5); }   // the enemy, until he falls
  for (let i = 0; i < 60; i++) room.step();
  const state = [1, 2, 3, 4].map((id) => {
    const p = room.player(id)!;
    return { id, alive: p.alive, team: p.team, hp: [...p.health.hp], armour: [...p.health.armour], lastHurt: (p as unknown as { lastHurt: unknown }).lastHurt ?? null, feet: feet(id) };
  });
  return { room, cs, state, frames: cs.map((c) => c.frames) };
}

describe('LCM-6a: Room.combat()\'s onCombatApplied observer changes nothing the room does', () => {
  it('the same hits with the option absent, present and throwing: the same room state and the same bytes to every connection', () => {
    const calls: [number, number, number][] = [];
    const absent = script({});
    const present = script({ onCombatApplied: (a, t, h) => { calls.push([a, t, h]); } });
    let thrown = 0;
    const throwing = script({ onCombatApplied: () => { thrown++; throw new Error('an observer\'s own trouble'); } });
    expect(absent.state.find((s) => s.id === 2)!.alive).toBe(false);          // the script did kill the enemy
    expect(absent.state.find((s) => s.id === 4)!.hp).not.toEqual(absent.state.find((s) => s.id === 3)!.hp);   // ... and hurt the teammate
    expect(calls.length).toBeGreaterThan(0);
    expect(thrown).toBe(calls.length);                                         // the throwing observer was called each time
    for (const run of [present, throwing]) {
      expect(JSON.stringify(run.state)).toBe(JSON.stringify(absent.state));
      expect(run.room.tick).toBe(absent.room.tick);
      expect(run.frames).toEqual(absent.frames);
    }
  });

  it('called once per applied enemy hit that took health, with that health; never for a teammate\'s hit', () => {
    const calls: [number, number, number][] = [];
    // The combat report (a playtest instrument, INT.R5) on beside it only to read what the room applied.
    const run = script({ combatReport: true, onCombatApplied: (a, t, h) => { calls.push([a, t, h]); } });
    const applied = (run.cs[0]!.events().filter((e) => e.type === 'combat') as CombatReport[]).filter((e) => e.status === 'applied');
    expect(applied.some((e) => e.friendlyFire && e.damageApplied > 0)).toBe(true);   // a teammate's hit landed ...
    const enemy = applied.filter((e) => !e.friendlyFire && !e.selfDamage && e.damageApplied > 0);
    expect(enemy.length).toBeGreaterThan(1);
    // ... and told nothing; each enemy hit told once, its health the report's (summed in another order: to 1e-9)
    expect(calls.map(([a, t]) => [a, t])).toEqual(enemy.map((e) => [e.attacker!.id, e.target!.id]));
    calls.forEach(([, , h], i) => expect(h).toBeCloseTo(enemy[i]!.damageApplied, 9));
    expect(calls.every(([, t]) => t === 2)).toBe(true);
  });

  it('called with the instrument off (production) the same as with it on', () => {
    const off: [number, number, number][] = [], on: [number, number, number][] = [];
    script({ onCombatApplied: (a, t, h) => { off.push([a, t, h]); } });
    script({ combatReport: true, onCombatApplied: (a, t, h) => { on.push([a, t, h]); } });
    expect(off.length).toBeGreaterThan(0);
    expect(off).toEqual(on);
  });
});
