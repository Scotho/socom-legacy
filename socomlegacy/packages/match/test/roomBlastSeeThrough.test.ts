import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import { encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import { Room, type Conn } from '../src/room';

/**
 * R4B-10 (research 388; LATER 615, then G6): the room's blast on a SEAL behind a face, judged by the body's exposure
 * test (`blastExposed`: r0001 `FUN_005a0e70` D:L459177-459189, r0004 r4 0x5a6b00-0x5a6bc8). The flat map and the drop
 * are `roomBlast.test.ts`' (copied, not imported): a wall across x = 30 between an M67 at 0 and a SEAL at 60, its
 * material the case's.
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};
const wallAt = (x: number, material: number, path: string): WorldPoly => ({
  ...FLOOR, path, ditype: 2, material, points: Float32Array.from([x, 0, -200, x, 0, 200, x, 80, 200, x, 80, -200]),
});

/** The flat map with walls of `materials` at x 30, 35, ... (the first nearest the blast); `defaultMaterial` its root's. */
function map(materials: readonly number[], defaultMaterial?: string): SimMap {
  const polys: WorldPoly[] = [FLOOR, ...materials.map((m, i) => wallAt(30 + 5 * i, m, `worldmodel/wall${i}`))];
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: 'worldmodel', path: `${p.path}#${i}`, first: i, count: 1 }));
  const ground = packGround(PARAMS, polys, owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  return {
    stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [],
    ...(defaultMaterial !== undefined ? { defaultMaterial } : {}),
  };
}

class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void {}
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] {
    return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[];
  }
}

const FUSE_TICKS = 3.2 * TICK_HZ;

/** An M67 dropped at x 0 by a Terrorist, a SEAL at x 60 behind the walls: the SEAL's blast events. */
function blastBehind(m: SimMap): { blasts: number; hurt: number } {
  let seed = 1;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const room = new Room(m, null, { now: () => 0, random });
  const join = (id: number): Client => {
    const c = new Client();
    room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99' }, `10.0.0.${id}`);
    return c;
  };
  join(1);
  const s = join(2);
  room.step();
  room.player(1)!.sim.walker.place(0, 20, 0);
  room.player(2)!.sim.walker.place(60, 20, 0);
  for (let i = 0; i < 60; i++) {
    const p = room.player(1)!;
    room.binary(1, encodeCommands({ viewTick: room.tick, commands: [{ seq: p.sim.seq + 1, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 }] }));
    room.step();
  }
  const p = room.player(1)!, st = p.sim.walker.state;
  room.text(1, { type: 'throw', seq: p.sim.seq, kind: 'M67', from: [st.x, st.y + 15.4, st.z], velocity: [0, 0, 0] });
  room.player(1)!.sim.walker.place(-600, 20, 0);
  for (let i = 0; i < FUSE_TICKS; i++) room.step();
  return { blasts: s.of('blast').length, hurt: s.of('hurt').length };
}

describe("R4B-10: the room's blast on a SEAL behind a face (FUN_005a6920's exposure test)", () => {
  it('a METAL_THICK wall (25) shelters him, as before', () => {
    expect(blastBehind(map([25]))).toEqual({ blasts: 0, hurt: 0 });
  });

  it('G6 (r0004): a METAL_GRATE (28) or INVISIBLE_DI (3) wall does not -- he is hurt as in the open', () => {
    expect(blastBehind(map([28]))).toEqual({ blasts: 1, hurt: 1 });
    expect(blastBehind(map([3]))).toEqual({ blasts: 1, hurt: 1 });
  });

  it('LATER 615 (r0001): a WATER (11, LIQUID) or ITEM (33, PICKUP) face does not shelter him either', () => {
    expect(blastBehind(map([11]))).toEqual({ blasts: 1, hurt: 1 });
    expect(blastBehind(map([33]))).toEqual({ blasts: 1, hurt: 1 });
  });

  it('the walk goes on: a grate before a METAL_THICK wall still shelters him', () => {
    expect(blastBehind(map([28, 25]))).toEqual({ blasts: 0, hurt: 0 });
  });

  it("a face of byte 0 is the map's DefaultMaterial: METAL_GRATE does not shelter, none (UNKNOWN) does", () => {
    expect(blastBehind(map([0], 'METAL_GRATE'))).toEqual({ blasts: 1, hurt: 1 });
    expect(blastBehind(map([0]))).toEqual({ blasts: 0, hurt: 0 });
  });
});
