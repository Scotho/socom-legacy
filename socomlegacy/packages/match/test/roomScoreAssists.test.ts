import { describe, expect, it } from 'vitest';
import { DEFAULT_RIFLE, HELD_SIDEARM, arsenalOf, type CollisionOwner, type GridParams, type Loadout, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import {
  cameraLook, centreClaim, encodeCommands, EYE_HEIGHT, faceToward, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ,
  type Command, type ServerEvent, type SimKits, type SimMap,
} from '../../viewer/src/sim';
import type { ScoreRow } from '../../viewer/src/net/protocol';
import { Room, type Conn, type RoomOptions } from '../src/room';
import { matchRecording, type RoomStreamSource } from '../src/stats/matchRecord';

/**
 * WM-DATA task 2 (a) (protocol 17; product track -- assists have no original, LCM-6a's adaptation, research 155 §3): the
 * room's `score` rows carry `assists` / `roundAssists` read from the match record through `RoomOptions.assistsOf` -- the
 * room counts none itself (one count). Wired as `game.ts` wires it: the recorder is the room's `recorder`, fed by the
 * room's `onCombatApplied`. Freshness: the recorder credits an assist at the `kill` it observes in the room's broadcast,
 * and the room builds the death's `score` right after that broadcast (`Room.kill`), so the score sent with the death
 * already carries it. A room without the option sends no field (not 0); a null read leaves that row without one. A
 * synthetic flat floor and a one-rifle kit, as `roomCombatObserver.test.ts`; no game data.
 */

type V3 = [number, number, number];
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, 1000, 1000, 0, 1000, 1000, 0, -1000, -1000, 0, -1000]),
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
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.frames.push(frame); }
  close(): void { /* not used */ }
  events(): ServerEvent[] { return this.frames.map((f) => JSON.parse(f) as ServerEvent); }
}

const tok = (tab: number): string => `tab${tab}`.padEnd(22, '_');
/** Players 1 (T), 2 (S), 3 (S), 4 (T) -- the join rule -- at fixed spots. */
const AT: readonly V3[] = [[0, 0, 0], [0, 0, -200], [0, 0, 600], [100, 0, 0]];

/** A recorder as `game.ts` makes one (`MatchGame.recorded`): every seat an account (`acct<id>`). */
function recording() {
  const source = {
    game: 7, match: () => ({ serial: 1, startedAt: 0 }), map: () => 'MP99', gameType: () => 2,
    settings: () => ({ roundSeconds: 60, maxRounds: 3, friendlyFire: false, maxPlayers: 8, teamSize: 8, eqLimit: 0 }),
    lobbyName: () => '', host: () => '', accountOf: (id: number) => `acct${id}`, seats: () => [], now: () => 0,
  } as unknown as RoomStreamSource;
  // SA-7a: a live record -- enabled, and its match opened as at round 1's start (this room fights in its staging and starts
  // no round, so the open is told here) -- for `assistsOf` reads only a live record's assists
  const rec = matchRecording(source, () => undefined, () => true);
  rec.stream.event(0, { type: 'roundStart', round: 1, seconds: 60, wins: { seal: 0, terrorist: 0 }, rounds: 3, epoch: 1, startTick: 0 });
  rec.onRoundStart(1);
  return rec;
}

/** Player 4 hits the enemy 2 once, then player 1 shoots 2 until he falls; then the room runs on. */
function script(opts: Partial<RoomOptions>) {
  let seed = 1;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const room = new Room(map(), null, { now: () => 0, random, ...opts }, null, kits());
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
  const target: V3 = [0, 12, -200];
  face(4, target); shoot(4, target); drive(4, 0.5);                           // the assist's hit
  face(1, target);
  for (let i = 0; i < 6 && room.player(2)!.alive; i++) { shoot(1, target); drive(1, 0.5); }   // the kill
  for (let i = 0; i < 30; i++) room.step();
  return { room, cs };
}

/** The `score` event a page received right after the room's `kill` of `victim`, and the last one before it. */
function aroundKill(c: Client, victim: number): { before: ScoreRow[]; after: ScoreRow[] } {
  const evs = c.events();
  const k = evs.findIndex((e) => e.type === 'kill' && e.victim === victim);
  expect(k, 'the script killed the victim').toBeGreaterThan(-1);
  const score = (e: ServerEvent | undefined): ScoreRow[] => (e as Extract<ServerEvent, { type: 'score' }>).rows;
  return {
    before: score(evs.slice(0, k).reverse().find((e) => e.type === 'score')),
    after: score(evs.slice(k + 1).find((e) => e.type === 'score')),
  };
}

describe('WM-DATA (a): the score row\'s assists, read from the match record', () => {
  it('with assistsOf: the score sent with the death carries the assist (match and round); the one before does not', () => {
    const record = recording();
    const hits: [number, number][] = [];
    const run = script({
      recorder: record.stream,
      onCombatApplied: (a, t, h) => { hits.push([a, t]); record.combatApplied(a, t, h); },
      assistsOf: (id) => record.assistsOf(id),
    });
    expect(hits.some(([a, t]) => a === 4 && t === 2), 'player 4 hit the enemy').toBe(true);
    expect(run.room.player(2)!.alive).toBe(false);
    for (const c of run.cs) {
      const { before, after } = aroundKill(c, 2);
      expect(before.find((r) => r.id === 4)).toMatchObject({ assists: 0, roundAssists: 0 });
      expect(after.find((r) => r.id === 4)).toMatchObject({ assists: 1, roundAssists: 1 });
      expect(after.find((r) => r.id === 1)).toMatchObject({ kills: 1, assists: 0, roundAssists: 0 });   // the killer: his kill, no assist
      expect(after.find((r) => r.id === 2)).toMatchObject({ assists: 0, roundAssists: 0 });
    }
  });

  it('without the option: no row carries either field (not 0)', () => {
    const run = script({});
    for (const c of run.cs) {
      const rows = c.events().filter((e): e is Extract<ServerEvent, { type: 'score' }> => e.type === 'score').flatMap((e) => e.rows);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.some((r) => 'assists' in r || 'roundAssists' in r)).toBe(false);
    }
  });

  it('a null read leaves that row without the fields; a throwing read leaves every row without them and the room unchanged', () => {
    const run = script({ assistsOf: (id) => (id === 4 ? { match: 3, round: 2 } : null) });
    const rows = (run.room.scoreEvent() as Extract<ServerEvent, { type: 'score' }>).rows;
    expect(rows.find((r) => r.id === 4)).toMatchObject({ assists: 3, roundAssists: 2 });
    for (const r of rows.filter((x) => x.id !== 4)) expect('assists' in r || 'roundAssists' in r).toBe(false);
    const plain = script({});
    const throwing = script({ assistsOf: () => { throw new Error('the reader\'s own trouble'); } });
    expect(throwing.cs.map((c) => c.frames)).toEqual(plain.cs.map((c) => c.frames));
  });
});
