import { DEFAULT_RIFLE, HELD_SIDEARM, arsenalOf, type CollisionOwner, type GridParams, type Loadout, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import {
  cameraLook, centreClaim, encodeCommands, EYE_HEIGHT, faceToward, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ,
  type Command, type ServerEvent, type SimKits, type SimMap,
} from '../../../viewer/src/sim';
import type { CombatReport } from '../../../viewer/src/net/protocol';
import { damagePoints } from '../../../viewer/src/net/damagePoints';
import { Room, type Conn, type RoomOptions } from '../../src/room';
import type { RoomRecorder } from '../../src/replay/recorder';

/**
 * WM-DATA task 3 (the damage report, `DAMAGE_REPORT_ADAPTATION`; product track, an adaptation with no original): one
 * scripted two-round respawn room on a synthetic flat floor with a one-rifle kit (as `roomCombatObserver.test.ts`; no
 * game data), four players and a watcher, a recorder taking every event the room hands it. `silent` stubs the room's
 * report send on the instance (the same room, the same script, no report) so a test can compare every stream with and
 * without the report byte for byte (the round report and, WM-DATA task 3b, the respawn room's life report). The room
 * plays respawn rules (the options' default): the two deaths of 2 and the death of 3 are each followed by a life report.
 *
 * Players 1 (T), 2 (S), 3 (S), 4 (T) -- the join rule -- at fixed spots; friendly fire on, so a teammate's round lands.
 * Round 1: 1 hits his teammate 4 once; 1 hits 3 once (3 lives); 1 shoots 2 until he falls (life 1); 2 is respawned
 * where he stood and 1 shoots him until he falls again (life 2); 3 shoots 1 until one hit lands; the clock runs out.
 * Round 2 (a respawn match is one round: the next match's round 1): 1 shoots 3 until he falls; the clock runs out.
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

export class Client implements Conn {
  readonly frames: string[] = [];
  /** Called with each text frame as it arrives (a test reads the room's state at that moment). */
  onText: ((frame: string) => void) | null = null;
  send(frame: Uint8Array | string): void {
    if (typeof frame === 'string') { this.frames.push(frame); this.onText?.(frame); } else this.frames.push(`bin:${Buffer.from(frame).toString('base64')}`);
  }
  close(): void { /* not used */ }
  events(): ServerEvent[] { return this.frames.filter((f) => !f.startsWith('bin:')).map((f) => JSON.parse(f) as ServerEvent); }
}

export type DamageReport = Extract<ServerEvent, { type: 'damageReport' }>;
export const isReport = (e: ServerEvent): e is DamageReport => (e as { type: string }).type === 'damageReport';
export const isReportFrame = (f: string): boolean => !f.startsWith('bin:') && (JSON.parse(f) as { type: string }).type === 'damageReport';

const tok = (tab: number): string => `tab${tab}`.padEnd(22, '_');
export const AT: readonly V3[] = [[0, 0, 0], [0, 0, -200], [0, 0, 600], [100, 0, 0]];
export const WATCHER = 9;

export interface Run {
  room: Room;
  /** Players 1-4 at indices 0-3. */
  cs: Client[];
  watcher: Client;
  recorded: ServerEvent[];
  /** What player 1's page saw, in order: every applied enemy-or-not combat report and every kill and round edge. */
  timeline: ServerEvent[];
}

export interface Hooks {
  /** Called once the room and its connections exist, before anything is played. */
  ready?: (room: Room, cs: Client[], watcher: Client) => void;
}

/** The room, its four players' and the watcher's connections, and the recorder's stream; nothing played yet. */
export function seatedRoom(silent: boolean, opts: Partial<RoomOptions> = {}): { room: Room; cs: Client[]; watcher: Client; recorded: ServerEvent[] } {
  let seed = 1;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const recorded: ServerEvent[] = [];
  const recorder: RoomRecorder = { snapshot: () => { /* bodies: not read */ }, event: (_t, ev) => { recorded.push(ev); }, players: () => { /* not read */ }, close: () => { /* not read */ } };
  const room = new Room(map(), null, { now: () => 0, random, allowFriendlyFire: true, combatReport: true, roundSeconds: 15, maxRounds: 3, recorder, ...opts }, null, kits());
  if (silent) {
    const r = room as unknown as Record<string, unknown>;
    r.reportRoundDamage = (): void => { /* silent */ };
    r.reportLifeDamage = (): void => { /* silent (WM-DATA task 3b: the respawn room's life report too) */ };
  }
  const cs = AT.map((_, i) => {
    const c = new Client();
    room.hello(i + 1, c, { type: 'hello', version: PROTOCOL_VERSION, name: `P${i + 1}`, map: 'MP99', session: tok(i + 1) }, `10.0.0.${i + 1}`);
    return c;
  });
  const watcher = new Client();
  room.hello(WATCHER, watcher, { type: 'hello', version: PROTOCOL_VERSION, name: 'W', map: 'MP99', session: tok(WATCHER), watch: true }, `10.0.0.${WATCHER}`);
  return { room, cs, watcher, recorded };
}

export function damageScript(silent: boolean, hooks: Hooks = {}, opts: Partial<RoomOptions> = {}): Run {
  const { room, cs, watcher, recorded } = seatedRoom(silent, opts);
  hooks.ready?.(room, cs, watcher);
  room.step();
  const settle = (): void => {
    AT.forEach((p, i) => room.player(i + 1)!.sim.walker.place(p[0], p[1] + 20, p[2]));
    for (let i = 0; i < 30; i++) room.step();
  };
  settle();
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
  const chest = (i: number): V3 => [AT[i]![0], 12, AT[i]![2]];
  const applied = (target: number): number => cs[0]!.events().filter((e) => e.type === 'combat' && e.status === 'applied' && e.target?.id === target && e.damageApplied > 0).length;
  const shootUntil = (id: number, target: number, done: () => boolean): void => {
    face(id, chest(target - 1));
    for (let i = 0; i < 12 && !done(); i++) { shoot(id, chest(target - 1)); drive(id, 0.5); }
  };
  const roundOvers = (): number => cs[0]!.events().filter((e) => e.type === 'roundOver').length;
  const roundStarts = (): number => cs[0]!.events().filter((e) => e.type === 'roundStart').length;

  // ---- round 1 ----
  face(1, chest(3)); shoot(1, chest(3)); drive(1, 0.5);                      // the teammate
  const h3 = applied(3); shootUntil(1, 3, () => applied(3) > h3);            // 3, once
  shootUntil(1, 2, () => !room.player(2)!.alive);                             // 2's first life
  (room as unknown as { spawn(p: unknown, kind: 'respawn', place: { at: V3; yaw: number }): void }).spawn(room.player(2)!, 'respawn', { at: [AT[1]![0], AT[1]![1] + 20, AT[1]![2]], yaw: 0 });
  for (let i = 0; i < 30; i++) room.step();
  shootUntil(1, 2, () => !room.player(2)!.alive);                             // 2's second life
  const h1 = applied(1); shootUntil(3, 1, () => applied(1) > h1);            // 3 hits 1, once
  for (let i = 0; i < 60 * TICK_HZ && roundOvers() < 1; i++) room.step();
  // ---- round 2 ----
  const starts = roundStarts();
  for (let i = 0; i < 60 * TICK_HZ && roundStarts() === starts; i++) room.step();
  settle();
  shootUntil(1, 3, () => !room.player(3)!.alive);
  for (let i = 0; i < 60 * TICK_HZ && roundOvers() < 2; i++) room.step();

  const timeline = cs[0]!.events().filter((e) => (e.type === 'combat' && e.status === 'applied') || e.type === 'kill' || e.type === 'roundStart' || e.type === 'roundOver');
  return { room, cs, watcher, recorded, timeline };
}

export interface Tally { hits: number; health: number }

/**
 * The expected ledger from player 1's timeline: each applied enemy hit that took health (the combat report's
 * `damageApplied`), by (attacker, victim), between the events `from` and `to` (indices into the timeline); `health` the
 * hits' DMG points (intake item 2, option (C): `damagePoints` of the report's six parts before and after).
 */
export function tallies(timeline: ServerEvent[], from = 0, to = timeline.length): Map<string, Tally> {
  const out = new Map<string, Tally>();
  for (const e of timeline.slice(from, to)) {
    if (e.type !== 'combat') continue;
    const c = e as CombatReport;
    if (c.friendlyFire || c.selfDamage || !(c.damageApplied > 0) || !c.attacker || !c.target || c.attacker.team === c.target.team) continue;
    const k = `${c.attacker.id}>${c.target.id}`;
    const t = out.get(k) ?? { hits: 0, health: 0 };
    t.hits++; t.health += damagePoints(c.healthBefore!, c.healthAfter!);
    out.set(k, t);
  }
  return out;
}

/** Health to six places, so the room's sum and the reports' sum (another order) compare exactly. */
export const six = (x: number): number => Math.round(x * 1e6) / 1e6;
