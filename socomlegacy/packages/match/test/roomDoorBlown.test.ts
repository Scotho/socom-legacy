import { describe, expect, it } from 'vitest';
import { type CollisionOwner, type EffectProgram, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type Command, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import type { DoorSpec } from '../../viewer/src/doors';
import { MAX_BATCH, Room, type Conn } from '../src/room';

/**
 * V13-3b (research 386 §4): a door whose action node a scene death turned off is never used. The original's action
 * button takes the node under the reticle (`FUN_005aa240` D:L463830-463905) from the crosshair pick (`FUN_005aa6e0`,
 * its ray query `FUN_0031e160` D:L220105-220119 -> `FUN_002d4780` D:L220118), whose visitor passes only an owner with
 * `m_active` (`+0x5c` bit 0) and `m_hasDI` (D:L174789-174790; research 230 §5.2.5): so once Blizzard's `outhouse1`
 * runs `outhousedoor1` (`door_outhouse1` off) no pick reaches the door, and no console swings it. The page's pick is gated
 * already (`pickDoor`'s `segmentHits` takes `modelGate`); the room, which sees no view, refused nothing until now.
 * Synthetic floor and door (made-up names, no disc data), as `roomDoorHold.test.ts`.
 */

class Client implements Conn {
  events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* nothing */ }
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] { return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[]; }
}

const TICK_MS = 1000 / TICK_HZ;
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const DOOR_PROGRAM: EffectProgram = {
  name: 'singleDoor_test', root: 0, flags: 0xa2, nodes: ['NA'],
  sequences: [{ name: 'seq_0', activation: 1, ops: [{ op: 'valve', valve: '', operation: 0x0b, operand: 1, context: true }] }],
};

function doorMap(): SimMap {
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
  const door = (n: number): DoorSpec => ({
    index: n - 1, node: `door${n}`, path: `worldmodel/hut${n}/door${n}`, valve: `door${n}`, range: 2000, elevation: -1, programs: [DOOR_PROGRAM],
    local: IDENTITY, parent: IDENTITY, owners: [], sweep: { minX: -10, minZ: -10, maxX: 10, maxZ: 10 },
  });
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [], doors: [door(1), door(2)] };
}

function setup() {
  let now = 0;
  const room = new Room(doorMap(), null, { now: () => now, random: () => 0.5, launchCountdownS: 0 });
  const client = new Client();
  room.hello(1, client, { type: 'hello', version: PROTOCOL_VERSION, name: 'p1', map: 'MP99' }, '192.0.2.1');
  let seq = 0;
  const step = (door?: number): void => {
    const c: Command = { seq: ++seq, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
    room.binary(1, encodeCommands({ viewTick: room.tick, commands: [c].slice(0, MAX_BATCH) }));
    if (door !== undefined) room.text(1, { type: 'door', seq: c.seq, door } as never);
    now += TICK_MS;
    room.step();
  };
  for (let t = 0; t < 10; t++) step();
  const drops = (): number => (room as unknown as { drops: Map<string, number> }).drops.get('door: inactive') ?? 0;
  return { room, client, step, drops };
}

describe('V13-3b: a door whose node is off is never used (the pick passes only an active owner)', () => {
  it('RED: a door packet on a door turned off is refused, named in the drop log; the other door still swings', () => {
    const s = setup();
    s.room.world.setActive('worldmodel/hut1/door1', false);
    s.step(0);
    expect(s.client.of('doorUse').filter((e) => e.door === 0)).toEqual([]);
    expect(s.drops()).toBe(1);
    for (let k = 0; k < 5; k++) s.step();
    s.step(1);
    expect(s.client.of('doorUse').filter((e) => e.door === 1)).toHaveLength(1);
  });

  it('an ancestor turned off is the same refusal; the round reset (the node back on) gives the door back', () => {
    const s = setup();
    s.room.world.setActive('worldmodel/hut1', false);
    s.step(0);
    expect(s.client.of('doorUse')).toEqual([]);
    s.room.world.setActive('worldmodel/hut1', true);
    s.step(0);
    expect(s.client.of('doorUse').filter((e) => e.door === 0)).toHaveLength(1);
  });
});
