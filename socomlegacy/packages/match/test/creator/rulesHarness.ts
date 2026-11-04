/**
 * FCW-31's room harness for the creator rules tests (a test instrument, no original): the synthetic floor and kit table
 * of `../roomDamage.test.ts` (a flat MP99 floor, the M4A1, the Mark 23, an M67), a seeded `RoomOptions.random`
 * (Park-Miller, as `roomDamage.test.ts`'s), one scripted input record and a recorder that keeps everything the room
 * records (its broadcasts, its players, its omniscient snapshots) and every round report. The room is the real `Room`.
 */
import { DEFAULT_RIFLE, HELD_SIDEARM, M67, arsenalOf, type CollisionOwner, type GridParams, type Loadout, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import {
  cameraLook, centreClaim, encodeCommands, EYE_HEIGHT, faceToward, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ,
  type Command, type ServerEvent, type SimKits, type SimMap,
} from '../../../viewer/src/sim';
import { Room, type Conn, type RoomOptions, type RoundOverReport } from '../../src/room';
import type { RoomRecorder } from '../../src/replay/recorder';
import { LoopbackMatch } from '../../../viewer/src/net/loopback';

export type V3 = [number, number, number];

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};

/** The flat floor with four slots a side (`roomDamage.test.ts`'s `map`). */
export function flatMap(): SimMap {
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(PARAMS, [FLOOR], owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [] };
}

const item = (name: string, id: number): unknown[] => ['InternalName', [name], 'ID', [String(id)], 'Ammo_Capacity', ['1'], 'NumMags', ['1'], 'AMMO_TYPES', [[]]];
/** Both sides: the M4A1 (36.4 a round), the Mark 23, an M67 (`roomDamage.test.ts`'s kit, its launcher left out). */
export const KIT = [DEFAULT_RIFLE.id, 15, 255, 121, 255] as unknown as Loadout;
export function flatKits(): SimKits {
  const arsenal = arsenalOf(['ZAMMO', [], 'ZWEAPON', [item('M67', 121)] as never]);
  return {
    table: {
      arsenal, records: new Map([DEFAULT_RIFLE, HELD_SIDEARM].map((x) => [x.id, x])), rounds: new Map(),
      throwables: new Map([[M67.id, { record: M67, piercing: 4 }]]),
    },
    map: {
      valves: new Map(), selectable: { seal: [], terrorist: [] },
      kits: { seal: [{ type: 'S', character: 's', loadout: KIT }], terrorist: [{ type: 'T', character: 't', loadout: KIT }] },
    },
  };
}

/** The seeded `RoomOptions.random` (Park-Miller, `roomDamage.test.ts`'s): the parity proof's one injected difference from main's default. */
export function seededRandom(seed = 1): () => number {
  let s = seed;
  return (): number => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

export class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* not used */ }
  of<T extends string>(type: T): Record<string, unknown>[] {
    return (this.events as unknown as Record<string, unknown>[]).filter((e) => e['type'] === type);
  }
}

/** Everything the room records, as JSON lines in order, and every round report. */
export class KeepAll implements RoomRecorder {
  readonly lines: string[] = [];
  snapshot(tick: number, bodies: readonly unknown[], doors: unknown, env: unknown, cranes?: unknown): void { this.lines.push(JSON.stringify(['snap', tick, bodies, doors ?? null, env, cranes ?? null])); }
  event(tick: number, ev: ServerEvent): void { this.lines.push(JSON.stringify(['event', tick, ev])); }
  players(tick: number, players: readonly unknown[]): void { this.lines.push(JSON.stringify(['players', tick, players])); }
  command(tick: number, id: number, command: Command): void { this.lines.push(JSON.stringify(['command', tick, id, command])); }
  matchReset(tick: number): void { this.lines.push(JSON.stringify(['matchReset', tick])); }
  close(reason: string): void { this.lines.push(JSON.stringify(['close', reason])); }
}

const tok = (tab: number): string => `tab${tab}`.padEnd(22, '_');

/**
 * One entry of the scripted input record: at the room's tick `at`, seat `id` faces seat `target`, or fires at it, or (a
 * test's teleport, the walker placed as `place` does) moves to `to`.
 */
export type ScriptStep = { at: number; id: number; do: 'face' | 'fire'; target: number } | { at: number; id: number; do: 'move'; to: V3 };

/**
 * A room on the flat floor with a seat for each of `at` (1 T, 2 S, 3 S, 4 T: the join rule), each placed at `at[i]` once
 * the room has seated it and again at each round's start, and the driver of one scripted input record: every seat sends a
 * command at rest each tick (its look as the record last set it), a `fire` step sends a round down the cone's centre at
 * its target's chest. `loopback`: the page's own room (`viewer/src/net/loopback.ts` `LoopbackMatch`, solo, stepped by
 * the test) instead of a bare `Room`, its seats' sides by `soloSide` (absent: the join rule's).
 */
export function rulesRoom(at: readonly V3[], opts: Partial<RoomOptions> = {}, how: { loopback?: boolean } = {}) {
  const recorder = new KeepAll();
  const reports: RoundOverReport[] = [];
  // A classic round stands its seats on the slots, 800 apart: each round's start places them where the record wants them.
  const onRoundStart = (round: number): void => { place(); opts.onRoundStart?.(round); };
  const full: Partial<RoomOptions> = { now: () => 0, random: seededRandom(1), recorder, onRoundOver: (r) => reports.push(r), ...opts, onRoundStart };
  const room = how.loopback
    ? new LoopbackMatch(flatMap(), null, { auto: false, kits: flatKits(), soloSide: (id) => (id === 1 || id === 4 ? 'terrorist' : 'seal'), ...full }).room
    : new Room(flatMap(), null, full, null, flatKits());
  const clients = at.map((_, i) => {
    const c = new Client();
    room.hello(i + 1, c, { type: 'hello', version: PROTOCOL_VERSION, name: `P${i + 1}`, map: 'MP99', session: tok(i + 1) }, `10.0.0.${i + 1}`);
    return c;
  });
  const look = new Map<number, { yaw: number; pitch: number }>();
  const feet = (id: number): V3 => { const w = room.player(id)!.sim.walker.state; return [w.x, w.y, w.z]; };
  let placedAt = -1;
  function place(): void { placedAt = room.tick; at.forEach((p, i) => room.player(i + 1)?.sim.walker.place(p[0], p[1] + 20, p[2])); }
  /** One tick: each seated seat's command at rest, then the room's step. */
  const tick = (): void => {
    for (let id = 1; id <= at.length; id++) {
      const p = room.player(id);
      if (!p) continue;
      const l = look.get(id) ?? { yaw: p.sim.walker.state.yaw, pitch: 0 };
      const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: l.yaw, pitch: l.pitch, turn: 0, buttons: 0, stance: 0, weapon: 0 };
      room.binary(id, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
    }
    room.step();
  };
  const face = (id: number, target: number): void => {
    const t = feet(target);
    look.set(id, faceToward({ feet: feet(id), posture: room.player(id)!.sim.walker.posture }, [t[0], t[1] + 12, t[2]]));
    room.player(id)!.sim.allowSnap();
  };
  const fire = (id: number, target: number): void => {
    const p = room.player(id)!, seq = p.sim.seq, f = p.cone.frame(seq);
    if (!f || !p.alive) return;
    const t = feet(target), point: V3 = [t[0], t[1] + 12, t[2]];
    const { eye: e } = cameraLook(f);
    const c = centreClaim(f, [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]], Math.hypot(point[0] - e[0], point[1] - e[1], point[2] - e[2]));
    room.text(id, { type: 'fire', seq, from: c.from, dir: c.dir, eye: c.eye, aim: c.aim, weapon: 0, viewTick: room.tick });
  };
  /** Runs the record to the room's tick `until`, placing the seats after the first step. */
  const run = (script: readonly ScriptStep[], until: number, onTick?: (tick: number) => void): void => {
    if (room.tick === 0) { room.step(); if (placedAt !== room.tick) place(); }   // a round started on this step placed them already
    while (room.tick < until) {
      onTick?.(room.tick);
      for (const s of script) {
        if (s.at !== room.tick) continue;
        if (s.do === 'move') room.player(s.id)?.sim.walker.place(s.to[0], s.to[1] + 20, s.to[2]);
        else (s.do === 'face' ? face : fire)(s.id, s.target);
      }
      tick();
    }
  };
  return { room, clients, recorder, reports, feet, tick, face, fire, run, place };
}

/** Seconds as the room's ticks. */
export const ticks = (seconds: number): number => Math.round(seconds * TICK_HZ);

/**
 * The scripted input record of the parity proof: seat 1 (T) faces seat 2 (S) and fires every 12 ticks from 1 s to 4 s,
 * seat 2 faces seat 1 at 2 s and fires back every 15 ticks from 2.5 s to 5 s -- hits and a kill (seat 2 dies
 * before it fires; no page presses its respawn), within a short round. `from`: seconds the whole record is moved by (a classic round's countdown).
 */
export function duelScript(from = 0): ScriptStep[] {
  const o = ticks(from);
  const steps: ScriptStep[] = [{ at: o + ticks(0.9), id: 1, do: 'face', target: 2 }, { at: o + ticks(2), id: 2, do: 'face', target: 1 }];
  for (let t = ticks(1); t <= ticks(4); t += 12) steps.push({ at: o + t, id: 1, do: 'fire', target: 2 });
  for (let t = ticks(2.5); t <= ticks(5); t += 15) steps.push({ at: o + t, id: 2, do: 'fire', target: 1 });
  return steps;
}
