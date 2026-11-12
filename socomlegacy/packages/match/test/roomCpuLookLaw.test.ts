import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, PROTOCOL_VERSION, type ClientEvent, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import { Room, type Conn, type RoomOptions } from '../src/room';

/**
 * RB-47 (the replay batch; OT.R114, RB.R4, RB.R6 -- reviewed as the SIMULATION track): the page's own offline room may
 * open its movers' look gates (RB-2, `RoomOptions.lookRate: 'free'`, `roomLookGateMode`), a browser adaptation for the
 * player's mouse. A CPU seat (`Conn.cpu`, the controller's `IsAi`, `MoverSim.ai`) is no mouse: its mover keeps the look
 * law every room runs (`viewer/src/net/lookGate.ts` 'law', OT.R72 CTL.R2), so the bots of a free room turn and aim as
 * they do in every other room, the room's shot cone following the gated look (`room.ts` `Room` step's `aim`). The
 * player's seat in the same room runs the open gate; a room that does not ask, or a server's room, runs the law for all.
 */
function flatMap(): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(params, [floor], owners);
  const slot = (side: 0 | 1, index: number, x: number): SpawnSlot => ({
    side, index, position: [x, 0, 0], onFloor: true, step: 0, facing: [0, -1], loc: { map: 0, x: 0, z: 0 },
  });
  return {
    stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null,
    slots: [slot(0, 0, -400), slot(1, 0, 400), slot(1, 1, 300)], respawns: [slot(0, 0, -300), slot(1, 0, 300)], notes: [],
  };
}

class Client implements Conn {
  readonly events: ServerEvent[] = [];
  constructor(readonly cpu?: true) {}
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void {}
}

function seat(room: Room, id: number, cpu: boolean): void {
  const conn = cpu ? new Client(true) : new Client();
  room.hello(id, conn, { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99', session: `tab${id}`.padEnd(22, '_') } as Extract<ClientEvent, { type: 'hello' }>, `10.0.0.${id}`);
}

function room(opts: Partial<RoomOptions>): Room {
  return new Room(flatMap(), null, { now: () => 0, random: () => 0.5, rules: 'respawn', launchCountdownS: 0, ...opts });
}

describe("RB-47: a CPU seat keeps the look law in the page's free room; the player's seat runs the open gate", () => {
  it("a solo room with lookRate 'free' and one CPU seat: the bot's gate is 'law', the player's 'free'", () => {
    const r = room({ solo: true, lookRate: 'free' });
    seat(r, 1, false);
    seat(r, 2, true);
    expect(r.player(1)?.sim.ai).toBe(false);
    expect(r.player(2)?.sim.ai).toBe(true);                   // the seat is a CPU's: the test is not empty
    expect(r.player(1)?.sim.gate.mode).toBe('free');
    expect(r.player(2)?.sim.gate.mode).toBe('law');
  });

  it('a solo room that does not ask: the law for the player and the bot', () => {
    const r = room({ solo: true });
    seat(r, 1, false);
    seat(r, 2, true);
    expect([1, 2].map((id) => r.player(id)?.sim.gate.mode)).toEqual(['law', 'law']);
  });

  it("a server's room given 'free' (never passed, a source pin): the law for every seat", () => {
    const r = room({ lookRate: 'free' });
    seat(r, 1, false);
    seat(r, 2, true);
    expect([1, 2].map((id) => r.player(id)?.sim.gate.mode)).toEqual(['law', 'law']);
  });
});
