import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import { Room, type Conn } from '../src/room';
import { MatchBots } from '../src/bots/matchBots';
import type { NavigationData } from '../src/bots/navigation';

/**
 * NPB-3 (docs/plans/2026-10-24-forge-npc-brains.md): a Forge NPC is a seat its own connection holds, in a classic
 * room (the Forge's Play mode). The lobby bots' brain must drive such a seat without seating it, and keep driving it
 * through a classic round's end and the next round's start -- the case lobby bots (respawn rules, H315) never met.
 * Adaptation (the Forge's instrument): no original behaviour is claimed; this pins the seam only.
 */
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
function flat(): SimMap {
  const floor: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25,
    ptcount: 4, cameratype: 0, points: Float32Array.from([-400, 0, -400, 400, 0, -400, 400, 0, 400, -400, 0, 400]) };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: floor.path, first: 0, count: 1 }];
  const ground = packGround(PARAMS, [floor], owners);
  const slots: SpawnSlot[] = [0, 1].flatMap((side) => Array.from({ length: 8 }, (_, index) => ({ side, index,
    position: [side ? 100 : -100, 0, -140 + index * 40], onFloor: true, step: side ? 6 : 2,
    facing: side ? [-1, 0] : [1, 0], loc: { map: 0, x: 0, z: 0 } } as SpawnSlot)));
  return { stem: 'MP99', name: 'ADOPT TEST', ground, grid: groundGrid(ground), slots, respawns: [], spawns: null, notes: [] };
}
class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* no transport */ }
}

function classicRoom(rules: 'classic' | 'respawn' = 'classic') {
  let now = 0, seed = 1;
  const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  const room = new Room(flat(), null, { rules, heldLaunch: true, now: () => now, random }, null, null);
  const hello = (id: number, side: 'seal' | 'terrorist', host: boolean) =>
    room.hello(id, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99' }, '', { host, side });
  expect(hello(1, 'seal', true)).toBe(true);
  // The NPC: an ordinary seat on a connection that is not the bots' own (not `cpu`), as the Forge's NetClient holds one.
  expect(hello(2, 'terrorist', false)).toBe(true);
  const navigation: NavigationData = { version: 2, map: 'MP99', nodes: [] };
  const bots = new MatchBots(room, { random, navigation, kits: null });
  const step = (ticks = 1) => { for (let i = 0; i < ticks; i++) { now += 1000 / TICK_HZ; bots.step(); room.step(); } };
  return { room, bots, step };
}

const feet = (room: Room, id: number): [number, number] => { const s = room.player(id)!.sim.walker.state; return [s.x, s.z]; };

describe('NPB-3: the lobby bot brain drives a seat it did not seat, across a classic round', () => {
  it('adopts a seated player without seating anyone, refuses a stranger, and leaves it seated on dispose', () => {
    const { room, bots } = classicRoom();
    const seats = room.lobby.players().length;
    expect(bots.adopt(99)).toBeNull();
    expect(bots.adopt(2)).toBeTypeOf('function');
    expect(bots.adopt(2)).toBeNull();
    expect(room.lobby.players()).toHaveLength(seats);
    expect(bots.botIds()).toContain(2);
    // The roster's count never trims or replaces an adopted seat.
    bots.setRoster({ seal: 0, terrorist: 0 });
    expect(room.lobby.member(2)).toBeTruthy();
    bots.dispose();
    expect(room.lobby.member(2)).toBeTruthy();
  });

  it('forgets an adopted seat that vanished, so its id can be re-seated as the brain\'s own lobby bot', () => {
    // A respawn room: the one where the roster seats lobby bots mid-match (H315).
    const { room, bots, step } = classicRoom('respawn');
    // 239 is the first id the roster seats a lobby bot on.
    expect(room.hello(239, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: 'P239', map: 'MP99' }, '', { side: 'terrorist' })).toBe(true);
    expect(bots.adopt(239)).toBeTypeOf('function');
    expect(room.launch(0)).toBe(true);
    step(2);
    // The seat's own connection goes; the brain drops it at its next step.
    room.leave(239);
    step();
    expect(bots.botIds()).not.toContain(239);
    bots.setRoster({ seal: 0, terrorist: 1 });
    expect(bots.botIds()).toContain(239);
    // A seat of the brain's own now: dispose releases it, as any lobby bot.
    bots.dispose();
    expect(room.lobby.member(239)).toBeFalsy();
  });

  it('fights in round 1, and fights again in round 2 once its first round has ended', () => {
    const { room, bots, step } = classicRoom();
    expect(bots.adopt(2)).toBeTypeOf('function');
    expect(room.launch(0)).toBe(true);
    step(2);
    const spawn1 = feet(room, 2);
    // Round 1: the brain, unaided, kills the SEAL (the human here sends nothing).
    for (let t = 0; t < 30 * TICK_HZ && room.player(1)!.alive; t++) step();
    expect(room.player(1)!.alive, 'round 1: the NPC killed the SEAL').toBe(false);
    // The round runs out its clock; the seam under test is the next round's start.
    for (let t = 0; t < 120 * TICK_HZ && room.round < 2; t++) step();
    expect(room.round, 'round 2 began').toBe(2);
    for (let t = 0; t < 60 * TICK_HZ && !room.roundRunning; t++) step();
    expect(room.roundRunning).toBe(true);
    expect(room.player(1)!.alive, 'round 2: the SEAL is back').toBe(true);
    expect(room.player(2)!.alive, 'round 2: the NPC is back').toBe(true);
    const spawn2 = feet(room, 2), seq2 = room.player(2)!.sim.seq;
    expect(Math.hypot(spawn1[0] - spawn2[0], spawn1[1] - spawn2[1]), 'round 2 starts at its spawn again').toBeLessThan(60);
    for (let t = 0; t < 30 * TICK_HZ && room.player(1)!.alive; t++) step();
    expect(room.player(2)!.sim.seq, 'the brain kept sending commands').toBeGreaterThan(seq2);
    expect(room.player(1)!.alive, 'round 2: the NPC killed the SEAL again').toBe(false);
  });
});
