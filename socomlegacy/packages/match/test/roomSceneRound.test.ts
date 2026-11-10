import { describe, expect, it } from 'vitest';
import { type CollisionOwner, type EffectProgram, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type Command, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import { bareMeta } from '../../viewer/src/worldState';
import { Room, SCENE_ROUND_OWNER_READING, type Conn } from '../src/room';

/**
 * Research 386 §3.2 (LATER 63): a scene program's `FIRE_WEAPON` -- `FUN_0025ccb0` (D:L107153-107326; research 332 §1.1)
 * starts a round of the named weapon at its node's world position (D:L107229-107244), its fuse the command's first float
 * (D:L107312-107316), counted online too (`FUN_003c9fb0`, 332 §1.2) -- goes off in the room as the bomb's does: it meets
 * the players (each hurt his own: `SCENE_ROUND_OWNER_READING`) and every page is told it (`sceneRound`) for its effects.
 * Was `BRIDGE_FIRE_WEAPON_READING` (PF.R32): nothing. Synthetic map, made-up names, the baked M67 (no disc).
 */

class Client implements Conn {
  events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* nothing */ }
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] { return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[]; }
}

const POST = 'worldmodel/hut/post';
/** The post's world matrix (row-major): a translation to (100, 0, 0). */
const AT_POST = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 100, 0, 0, 1];

function map(): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(params, [floor], owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  const meta = { ...bareMeta('MP99'), fireNodes: new Map([[POST, AT_POST]]) };
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [], meta };
}

const PROGRAM: EffectProgram = {
  name: 'blow', root: 0, flags: 0, nodes: ['NA'],
  sequences: [{ name: 'NA', activation: 1, ops: [{ op: 'fireWeapon', weapon: 'M67', ammo: 'M67 Ammo', node: 1, f1: 0.001, f2: 0.01 }] }],
};

function setup() {
  let now = 0;
  const room = new Room(map(), null, { now: () => now, random: () => 0.5, launchCountdownS: 0 });
  const client = new Client();
  room.hello(1, client, { type: 'hello', version: PROTOCOL_VERSION, name: 'p1', map: 'MP99' }, '192.0.2.1');
  let seq = 0;
  const step = (): void => {
    const c: Command = { seq: ++seq, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
    room.binary(1, encodeCommands({ viewTick: room.tick, commands: [c] }));
    now += 1000 / TICK_HZ;
    room.step();
  };
  for (let t = 0; t < 10; t++) step();
  const player = (room as unknown as { players: Map<number, { alive: boolean; sim: { walker: { state: { x: number; y: number; z: number } } } }> }).players.get(1)!;
  return { room, client, step, player };
}

describe("research 386 §3.2 (LATER 63): a scene program's FIRE_WEAPON goes off in the room", () => {
  it('RED: the round goes off at its node a tick on, every page told it, and a player standing there is killed -- his own death', () => {
    const s = setup();
    expect(s.player.alive).toBe(true);
    Object.assign(s.player.sim.walker.state, { x: 100, y: 0, z: 0 });
    s.room.world.runProgram(PROGRAM, { root: null, nodes: [null, POST], caller: null, valve: null, silent: true });
    expect(s.client.of('sceneRound')).toEqual([]);              // on its fuse: not yet
    s.step();
    expect(s.client.of('sceneRound')).toEqual([{ type: 'sceneRound', kind: 'M67', at: [100, 0, 0] }]);
    expect(s.player.alive).toBe(false);
    const kill = s.client.of('kill').at(-1) as unknown as { victim: number; killer: number | null };
    expect([kill.victim, kill.killer]).toEqual([1, 1]);
    expect(SCENE_ROUND_OWNER_READING).toBe('victim');
  });

  it('a page\'s presentation run fires nothing; a node no placement carries fires nothing; the round reset drops a round on its fuse', () => {
    const s = setup();
    s.room.world.runProgram(PROGRAM, { root: null, nodes: [null, POST], caller: null, valve: null, silent: false, presentation: true });
    s.room.world.runProgram(PROGRAM, { root: null, nodes: [null, 'worldmodel/elsewhere'], caller: null, valve: null, silent: true });
    for (let k = 0; k < 5; k++) s.step();
    expect(s.client.of('sceneRound')).toEqual([]);
    const fuse: EffectProgram = { ...PROGRAM, sequences: [{ name: 'NA', activation: 1, ops: [{ op: 'fireWeapon', weapon: 'M67', ammo: 'M67 Ammo', node: 1, f1: 1, f2: 0.01 }] }] };
    s.room.world.runProgram(fuse, { root: null, nodes: [null, POST], caller: null, valve: null, silent: true });
    (s.room as unknown as { clearAir(): void }).clearAir();
    for (let k = 0; k < 2 * TICK_HZ; k++) s.step();
    expect(s.client.of('sceneRound')).toEqual([]);
  });
});
