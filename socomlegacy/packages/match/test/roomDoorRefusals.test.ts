import { describe, expect, it } from 'vitest';
import { type CollisionOwner, type EffectProgram, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type Command, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import type { DoorSpec } from '../../viewer/src/doors';
import { Room, type Conn } from '../src/room';

/**
 * HOTFIX DOOR-RESET (the owner's Vigilance playtests, 2026-11-02): the room's refusals of a page's `door` event were
 * silent -- a dead presser, one out of the door's reach, a door mid-swing or locked -- so a playtest's log could not say
 * why a door never opened. Each is now named in the room's `dropped` tally (`Room.takeDrops`, logged by the server each
 * second; the seat's own `signals.refused`), as the room's other refusals are: `door: dead`, `door: reach`, `door: busy`
 * (`door: locked` for a locked valve), `door: shape` for an index the map has no door at. A diagnostic, no behaviour
 * changed: every one of them was refused before. Synthetic floor and doors (as `roomDoorKick.test.ts`).
 */

class Client implements Conn {
  events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* nothing */ }
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

/**
 * Door 0 in everyone's reach; door 1 at the same place with a range of 10 (the spawns stand 400 off); door 2's program
 * locks it (its valve set to 99, `VALVE_LOCKED`), so a second press finds it locked; door 3 has no program.
 */
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
  const lock: EffectProgram = {
    name: 'lock', root: 0, flags: 0xa2, nodes: ['NA'],
    sequences: [{ name: 'seq_0', activation: 1, ops: [{ op: 'valve', valve: '', operation: 0x0b, operand: 99, context: true }] }],
  };
  const door = (index: number, range: number, programs: EffectProgram[] = [program('singleDoor_left', 63)]): DoorSpec => ({
    index, node: `door${index}`, path: `worldmodel/door${index}`, valve: `door${index}`, range, elevation: -1,
    programs,
    local: IDENTITY, parent: IDENTITY, owners: [], sweep: { minX: -10, minZ: -10, maxX: 10, maxZ: 10 },
  });
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [], doors: [door(0, 2000), door(1, 10), door(2, 2000, [lock]), door(3, 2000, [])] };
}

function setup() {
  let now = 0, seed = 1;
  const room = new Room(doorMap(), null, {
    now: () => now, random: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }, launchCountdownS: 0,
  });
  for (const id of [1, 2]) room.hello(id, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: `p${id}`, map: 'MP99' }, `10.0.0.${id}`);
  let seq = 0;
  const cmd = (): Command => ({ seq: ++seq, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 });
  const tick = (): void => { now += TICK_MS; room.step(); };
  const steps = (n: number): void => { for (let t = 0; t < n; t++) { room.binary(1, encodeCommands({ viewTick: room.tick, commands: [cmd()] })); tick(); } };
  steps(10);
  room.takeDrops();
  /** Player 1 asks for door `door` on its next command; the room stepped `after` ticks. */
  const use = (door: number, after = 2): void => {
    const c = cmd();
    room.binary(1, encodeCommands({ viewTick: room.tick, commands: [c] }));
    room.text(1, { type: 'door', seq: c.seq, door } as never);
    steps(after);
  };
  const p1 = (): { alive: boolean; signals: { refused: Record<string, number> } } =>
    (room as unknown as { players: Map<number, { alive: boolean; signals: { refused: Record<string, number> } }> }).players.get(1)!;
  return { room, use, p1 };
}

describe('HOTFIX DOOR-RESET: the room names its door refusals in its dropped tally', () => {
  it('a door in reach and at rest: taken, nothing tallied', () => {
    const s = setup();
    s.use(0);
    expect(s.room.doors.state(0).busy).toBe(true);
    expect(s.room.takeDrops()).toBeNull();
  });

  it("mid-swing: 'door: busy'", () => {
    const s = setup();
    s.use(0);
    s.use(0);
    expect(s.room.takeDrops()).toEqual({ 'door: busy': 1 });
  });

  it("out of the door's range: 'door: reach'", () => {
    const s = setup();
    s.use(1);
    expect(s.room.doors.state(1).busy).toBe(false);
    expect(s.room.takeDrops()).toEqual({ 'door: reach': 1 });
  });

  it("a dead presser: 'door: dead'", () => {
    const s = setup();
    s.p1().alive = false;
    s.use(0);
    expect(s.room.doors.state(0).busy).toBe(false);
    expect(s.room.takeDrops()).toMatchObject({ 'door: dead': 1 });
  });

  it("a locked door: 'door: locked'", () => {
    const s = setup();
    s.use(2);
    expect(s.room.doors.state(2)).toMatchObject({ busy: false, valve: 99 });
    s.use(2);
    expect(s.room.takeDrops()).toEqual({ 'door: locked': 1 });
  });

  it("a door with no program: 'door: noprogram', not 'locked' (the review's F3)", () => {
    const s = setup();
    s.use(3);
    expect(s.room.takeDrops()).toEqual({ 'door: noprogram': 1 });
  });

  it("the review's F2: ten presses refused mid-swing go to the drop log, never to the seat's moderation tally (signals.refused)", () => {
    const s = setup();
    s.use(0);
    for (let k = 0; k < 10; k++) s.use(0, 1);                     // one tick apart, inside the swing's ~17
    expect(s.room.takeDrops()).toMatchObject({ 'door: busy': 10 });
    // central's `refused` flag counts every key of `signals.refused` (FLAG_REFUSED_PLACEHOLDER, a seat a round).
    expect(Object.keys(s.p1().signals.refused).filter((k) => k.startsWith('door: '))).toEqual([]);
    s.p1().alive = false;
    s.use(0); s.use(1); s.use(7);
    expect(Object.keys(s.p1().signals.refused).filter((k) => k.startsWith('door: '))).toEqual([]);
  });

  it("an index the map has no door at: 'door: shape'", () => {
    const s = setup();
    s.use(7);
    expect(s.room.takeDrops()).toEqual({ 'door: shape': 1 });
  });
});
