import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, PROTOCOL_VERSION, type ClientEvent, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import { Room, type Conn } from '../src/room';

/**
 * FG-21 (the forge's NPCs; the owner, 2026-10-13: "add hostile npcs as a new entity type that can die in play mode"): the
 * page's own room (`solo`) seats every joiner a SEAL (`room.ts` hello and rejoin); `RoomOptions.soloSide` lets the page
 * name a seat's side -- the forge's NPC seats on the terrorist side. Absent, every seat a SEAL, as before. A browser
 * adaptation's seam only: a server room never passes it.
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
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots: [slot(0, 0, -400), slot(1, 0, 400), slot(1, 1, 300)], respawns: [], notes: [] };
}

class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void {}
}

function seat(room: Room, id: number): void {
  room.hello(id, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99', session: `tab${id}`.padEnd(22, '_') } as Extract<ClientEvent, { type: 'hello' }>, `10.0.0.${id}`);
}

describe('FG-21: the solo room seats a side the page names', () => {
  it('with soloSide: the seats it names join that side; the others are SEALs', () => {
    const room = new Room(flatMap(), null, { now: () => 0, random: () => 0.5, rules: 'classic', launchCountdownS: 0, solo: true, soloSide: (id) => (id >= 2 ? 'terrorist' : undefined) });
    seat(room, 1);
    seat(room, 2);
    seat(room, 3);
    expect([1, 2, 3].map((id) => room.player(id)?.team)).toEqual(['seal', 'terrorist', 'terrorist']);
  });

  it('without it: every seat a SEAL, as the page’s own room always seated them', () => {
    const room = new Room(flatMap(), null, { now: () => 0, random: () => 0.5, rules: 'classic', launchCountdownS: 0, solo: true });
    seat(room, 1);
    seat(room, 2);
    expect([1, 2].map((id) => room.player(id)?.team)).toEqual(['seal', 'seal']);
  });
});
