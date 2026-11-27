import { describe, expect, it } from 'vitest';
import {
  arsenalOf, CLAYMORE, DEFAULT_RIFLE, HELD_SIDEARM, M67, SOILS, type CollisionOwner, type EffectProgram, type GridParams, type Loadout,
  type SpawnSlot, type ThrowableRecord, type WorldPoly,
} from '@s2u/scene';
import {
  encodeCommands, PROTOCOL_VERSION, TICK_HZ, groundGrid, packGround, type Command, type MapMeta, type ServerEvent, type SimKits, type SimMap,
} from '../../viewer/src/sim';
import { rootY } from '../../viewer/src/mover';
import { Button, holdBits, STANCE_CODES } from '../../viewer/src/net/protocol';
import { C4_PLANT_CLIP } from '../../viewer/src/equipment';
import { C4_HIP_CAPTURE, caseHipSq, caseUp, HIP_CASES, HIP_REACH_SQ, PLACES_REFUSED, PLACES_TAKEN, type HipCase } from '../../viewer/test/helpers/c4HipReach';
import { Room, type Conn } from '../src/room';

/**
 * LATER 1139 in the room (research 440 s8; the table: `viewer/test/helpers/c4HipReach.ts`, which the page's
 * `viewer/test/c4HipReach.test.ts` drives through `c4TargetOf` and `GrenadeThrower`): `placeCharge` takes C4 only while the
 * squared 3-D distance from the hip (`hipPoint`, the page's same call) to the named point is under 396 (`FUN_005be9a0`
 * D:L475400-475405; proven on r0004 by the capture later1139-c4reach), else 'c4 reach', the charge kept. The hip is the
 * placing's start's when the start is this plant's (the plant clip `seal_put_onwall` carries the root 1.8 u).
 */

type V3 = [number, number, number];
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const STONE = SOILS.findIndex((m) => m.name === 'STONE') + 2, GLASS = SOILS.findIndex((m) => m.name === 'GLASS') + 2;
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, 1000, 1000, 0, 1000, 1000, 0, -1000, -1000, 0, -1000]),
};
const ROOT = 'worldmodel/access1', REAL = `${ROOT}=access1`, DI = `${REAL}/good_parts/di_good`, PANE = 'worldmodel/pane';
/** The barrier's face (z 330, x -40..40, 0..40 high); the planter's feet stand `along` in front of it, facing +z. */
const FACE_Z = 330;
const wallZ = (path: string, z: number, h: number, material = STONE): WorldPoly =>
  ({ ...FLOOR, path, ditype: 2, material, points: Float32Array.from([-40, 0, z, 40, 0, z, 40, h, z, -40, h, z]) });

/** The floor, the barrier (shield 17: C4's 18 takes it) and, with `pane`, a GLASS pane 3 u in front of it. */
function hipMap(pane: boolean): SimMap {
  const polys = [FLOOR, wallZ(DI, FACE_Z, 40), ...(pane ? [wallZ(PANE, FACE_Z - 3, 40, GLASS)] : [])];
  const owners: CollisionOwner[] = polys.map((q, i) => ({ modelName: 'worldmodel', path: q.path, first: i, count: 1, flags: 0x1001 }));
  const ground = packGround(PARAMS, polys, owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -600, -200 + i * 50), slot(1, i, 600, -200 + i * 50)]);
  const paths = ['worldmodel/floor', ROOT, REAL, DI, ...(pane ? [PANE] : [])];
  const instances = paths.map((path, id) => ({ id, path, node: path.split(/[/=]/).pop()!, modelName: 'worldmodel', root: path }));
  const access: EffectProgram = { name: 'access1', root: 1, flags: 0x2b, nodes: ['NA', 'access1', 'di_good'], sequences: [{ name: 'NA', activation: 1, ops: [] }] };
  const meta: MapMeta = {
    stem: 'MP99', instances, instanceByPath: new Map(instances.map((i) => [i.path, i.id])), diagnostics: [], actions: [],
    initial: [{ path: DI, deactivate: false, saveActive: true, saveTransform: false, saveParent: false }],
    scene: {
      programs: [],
      destructibles: [{ id: 0, key: `access1#0@${ROOT}`, anim: 'access1', instance: 1, root: ROOT, targetPath: DI, health: 1, armor: 0, shield: 17, program: access, nodes: [null, ROOT, DI] }],
    },
  };
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [], meta };
}

const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
const C4 = { ...M67, ...CLAYMORE, name: 'C4', id: 151, fuse: 6, removal: 0.1, explosionDamage: 18, explosionRadius: 50, ignoreExplosionDI: true } as ThrowableRecord;
const item = (name: string, id: number): unknown[] => ['InternalName', [name], 'ID', [String(id)], 'Ammo_Capacity', ['1'], 'NumMags', ['1'], 'AMMO_TYPES', [[]]];
const arsenal = arsenalOf(['ZAMMO', [], 'ZWEAPON', [item('M4A1 SD', 62), item('Mark 23', 15), item('M67', 121), item('HE', 126), item('C4', 151)] as never]);
const VALVES = new Map([['Enable_c4', 9], ['Enable_M4A1_SD', 1], ['Enable_Mark23', 1], ['Enable_frag', 9], ['Enable_HEgren', 9]]);
const SEAL_C4 = kit(62, 15, 121, 126, 151), NO_C4 = kit(62, 15, 121, 126, 255);
function kits(): SimKits {
  return {
    table: {
      arsenal, records: new Map([DEFAULT_RIFLE, HELD_SIDEARM].map((x) => [x.id, x])), rounds: new Map(),
      throwables: new Map([M67, C4].map((x) => [x.id, { record: x, piercing: x.id === 121 ? 4 : 0 }])),
    },
    map: {
      valves: VALVES, selectable: { seal: [], terrorist: [] },
      kits: { seal: [{ type: 'S', character: 's', loadout: SEAL_C4 }], terrorist: [{ type: 'T', character: 't', loadout: NO_C4 }] },
    },
  };
}
class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* not used */ }
}

/** The room with the SEAL (player 2) standing `along` in front of the barrier, facing it, in `posture`. */
function stage(along: number, posture: HipCase['posture'], pane = false) {
  let seed = 1;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const room = new Room(hipMap(pane), null, { now: () => 0, random, roundSeconds: 200 }, null, kits());
  for (const id of [1, 2]) room.hello(id, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99', session: `tab${id}`.padEnd(22, '_') }, `10.0.0.${id}`);
  room.step();
  room.player(1)!.sim.walker.place(600, 20, 0);
  room.player(2)!.sim.walker.place(0, 20, FACE_Z - along);
  for (let i = 0; i < 30; i++) room.step();
  const p = room.player(2)!;
  p.sim.walker.state.yaw = 180;                                                          // facing +z, the barrier
  const command = (extra: Partial<Command> = {}): void => {
    const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0, ...extra };
    room.binary(2, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
    room.step();
  };
  const run = (seconds: number, extra: Partial<Command> = {}): void => { for (let i = 0; i < Math.round(seconds * TICK_HZ); i++) command(extra); };
  if (posture !== 'stand') {
    command({ buttons: Button.Stance, stance: STANCE_CODES.indexOf(posture) });
    for (let i = 0; i < 300 && (p.sim.walker.action || p.sim.walker.posture !== posture); i++) command({ stance: STANCE_CODES.indexOf(posture) });
  }
  run(0.5, { stance: STANCE_CODES.indexOf(posture) });
  expect(p.sim.walker.posture).toBe(posture);
  // The stance change's clips carry the body: stood back at the case's spot in the settled posture.
  p.sim.walker.state.x = 0; p.sim.walker.state.z = FACE_Z - along;
  run(0.2, { stance: STANCE_CODES.indexOf(posture) });
  const feet = (): V3 => { const s = p.sim.walker.state; return [s.x, s.y, s.z]; };
  /** The page's plant naming the barrier at `point` (no placing start: judged from the body now). */
  const plant = (point: V3): void =>
    room.text(2, { type: 'throw', seq: p.sim.seq, kind: 'C4', from: [point[0], point[1], point[2] - 1], velocity: [0, 0, 1], target: 0, surface: { path: DI, point } });
  return { room, p, feet, plant, command, run };
}

/** The case's point on the barrier's face, at the case's height over the room's own feet; the staged feet checked. */
function caseRun(c: HipCase) {
  const s = stage(c.along, c.posture, c.pane === true);
  const f = s.feet();
  expect(FACE_Z - f[2]).toBeCloseTo(c.along, 6);                                         // the feet where the case puts them
  const point: V3 = [f[0], f[1] + caseUp(c), FACE_Z];
  s.room.takeDrops();
  const before = s.p.grenades.C4!;
  s.plant(point);
  s.run(0.1);
  return { taken: s.p.grenades.C4 === before - 1, drops: s.room.takeDrops() };
}

describe(`LATER 1139: one hip gate in the room, |point - hip|^2 < 396 (${C4_HIP_CAPTURE})`, () => {
  it.each(HIP_CASES)('placeCharge: $name', (c) => {
    expect(caseHipSq(c) < HIP_REACH_SQ).toBe(c.taken);
    const r = caseRun(c);
    expect(r.taken).toBe(c.taken);
    if (!c.taken) expect(r.drops).toEqual({ 'throw: c4 reach': 1 });
  });

  it.each(PLACES_REFUSED)('research 440 s4: $map $target behind $front, $gap u: refused c4 reach, through a pane or plain', ({ gap }) => {
    for (const pane of [true, false]) {
      const r = caseRun({ name: '', posture: 'stand', along: gap, up: 'hip', pane, taken: false });
      expect(r.taken, `pane ${pane}`).toBe(false);
      expect(r.drops, `pane ${pane}`).toEqual({ 'throw: c4 reach': 1 });
    }
  });

  // The room's body cannot stand closer to the barrier than its wall probe, so the rows under 6 u (0.0, 1.4) are staged
  // at 6 u with no pane (still far inside the gate) and say so; 12.3 and 16.5 stand at their gap, through the pane.
  it.each(PLACES_TAKEN)('research 440 s4: $map $target behind $front, $gap u: taken (rows under 6 u staged at 6 u)', ({ gap }) => {
    const r = caseRun({ name: '', posture: 'stand', along: Math.max(gap, 6), up: 'hip', pane: gap >= 6, taken: true });
    expect(r.taken).toBe(true);
  });

  it('a plant started at 19.5 u that the clip\'s travel carries past 19.9 is still taken: judged at the placing\'s start', () => {
    const s = stage(19.5, 'stand');
    const start = s.feet();
    s.command({ buttons: holdBits(C4_PLANT_CLIP) });                                     // the placing's hold laid at the aim
    s.run(1.1);
    const end = s.feet();
    const travelled = Math.hypot(end[0] - start[0], end[2] - start[2]);
    expect(travelled).toBeGreaterThan(0.4);                                              // the clip carried the body
    s.room.takeDrops();
    const before = s.p.grenades.C4!;
    // The point at the start's hip height on the face, past 19.9 u from the hip where the body now stands.
    const point: V3 = [start[0], start[1] + rootY('stand'), FACE_Z];
    expect((point[0] - end[0]) ** 2 + (point[2] - end[2]) ** 2).toBeGreaterThan(HIP_REACH_SQ);
    s.plant(point);
    s.run(0.1);
    expect(s.room.takeDrops()).toBeNull();
    expect(s.p.grenades.C4).toBe(before - 1);
  });
});
