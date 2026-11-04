import { describe, expect, it } from 'vitest';
import { type CollisionOwner, type EffectProgram, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type Command, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import type { DoorSpec } from '../../viewer/src/doors';
import { MAX_BATCH, Room, type Conn } from '../src/room';

/**
 * LATER 362 (research 92 section 6, "Read 2026-10-27"): the room picks the door's animation from the press the page chased
 * and sent on its `door` event (the network's bookkeeping: the room sees no pad) -- `FUN_005ec4e0`'s 1 (the kick) when
 * the record holds two animations and the press is at least 0.5 (`DAT_00650ae8`, D:L500537), the side allowed meanwhile
 * (`KICK_SIDE_PLACEHOLDER`) -- runs it, pushes its `ai::ANIMATE` (284, `seal_kickopendoor`) as the `motion` clip, and
 * tells every page the pick (`doorUse`), so a page following the swing runs the same program. A press missing, not a
 * number or out of range is clamped to [0, 1] (an older page's event: the open). Synthetic floor and door.
 */

class Client implements Conn {
  events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* nothing */ }
  of(type: string): Record<string, unknown>[] { return this.events.filter((e) => e.type === type) as unknown as Record<string, unknown>[]; }
}

const TICK_MS = 1000 / TICK_HZ;
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const program = (name: string, type: number): EffectProgram => ({
  name, root: 0, flags: 0xa2, nodes: ['NA'],
  sequences: [{
    name: 'seq_0', activation: 1,
    ops: [
      { op: 'aiAnimate', type, prewait: 0, postwait: 0.25, blocking: false, select: 0 },
      { op: 'valve', valve: '', operation: 0x0b, operand: 1, context: true },
    ],
  }],
});

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
  const door: DoorSpec = {
    index: 0, node: 'door1', path: 'worldmodel/door1', valve: 'door1', range: 2000, elevation: -1,
    programs: [program('singleDoor_left', 63), program('kick_door', 284)],
    local: IDENTITY, parent: IDENTITY, owners: [], sweep: { minX: -10, minZ: -10, maxX: 10, maxZ: 10 },
  };
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [], doors: [door] };
}

function setup() {
  let now = 0, seed = 1;
  const room = new Room(doorMap(), null, {
    now: () => now, random: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }, launchCountdownS: 0,
  });
  const clients = new Map<number, Client>();
  for (const id of [1, 2]) {
    const c = new Client();
    clients.set(id, c);
    room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: `p${id}`, map: 'MP99' }, `10.0.0.${id}`);
  }
  let seq = 0;
  const cmd = (): Command => ({ seq: ++seq, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 });
  const tick = (): void => { now += TICK_MS; room.step(); };
  for (let t = 0; t < 10; t++) { room.binary(1, encodeCommands({ viewTick: room.tick, commands: [cmd()] })); tick(); }
  /** Player 1 uses the door on its next command with `press` (absent: the field left out); `motion` and `doorUse` after. */
  const use = (press?: unknown): { clip: unknown; picks: unknown[] } => {
    const c = cmd();
    room.binary(1, encodeCommands({ viewTick: room.tick, commands: [c] }));
    room.text(1, { type: 'door', seq: c.seq, door: 0, ...(press === undefined ? {} : { press }) } as never);
    for (let k = 0; k < 10; k++) { room.binary(1, encodeCommands({ viewTick: room.tick, commands: [cmd()] })); tick(); }
    return { clip: clients.get(1)!.of('motion').at(-1)?.clip, picks: clients.get(2)!.of('doorUse').map((e) => e.pick) };
  };
  void MAX_BATCH;
  return { room, use };
}

describe('LATER 362: the room picks the kick from the press the page sent', () => {
  it("RED: a press of 0.8 on a two-animation door kicks it -- the kick's clip on the presser, the pick told to every page", () => {
    expect(setup().use(0.8)).toEqual({ clip: 'seal_kickopendoor', picks: [1] });   // today: seal_open_door, no doorUse
  });
  it('RED: a press under 0.5 opens it, the pick told', () => {
    expect(setup().use(0.3)).toEqual({ clip: 'seal_open_door', picks: [0] });
  });
  it("RED: the press clamped to [0, 1] -- an older page's event (none), NaN and a negative open; 7 kicks", () => {
    expect(setup().use(undefined).picks).toEqual([0]);
    expect(setup().use('x').picks).toEqual([0]);
    expect(setup().use(-3).picks).toEqual([0]);
    expect(setup().use(7).picks).toEqual([1]);
  });
});
