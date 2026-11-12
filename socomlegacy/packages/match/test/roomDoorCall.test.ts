import { describe, expect, it } from 'vitest';
import { type CollisionOwner, type EffectProgram, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import type { DoorSpec } from '../../viewer/src/doors';
import type { MapMeta } from '../../viewer/src/mapMeta';
import { pickSurfaces } from '../src/hostageOrders';
import { Room, type Conn } from '../src/room';

/**
 * DF-4 (research 175 s5.1, 239 s1.2; MP6's `cdoor1`): a door program's `CALL_ANIMATION` runs the map set's program on the
 * room's world -- the room authoritative, the nodes' flags on its `EnvWire` -- as the original's one command-45 handler
 * runs every animation's call (`FUN_0025bc20` D:L106909 registers `FUN_0025d5c0`; the callee started at
 * D:L107763-107769). Desert Glory's shape in miniature, no disc data: the cell door's program sets its valve and, under
 * `IF cell == 1`, calls `okfor` (the grate off, the invisible set on); the close's `IF cell == 0` calls `notok`. The
 * two bar sets are the same face in 28 METAL_GRATE and 3 INVISIBLE_DI (research 199 s6), both active at the opening and
 * both saved (bit 28), as MP6's `nohostagerescue` / `okhostagerescue` are.
 */

class Client implements Conn {
  events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* nothing */ }
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] { return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[]; }
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const NO = 'worldmodel/bars_no', OK = 'worldmodel/bars_ok';

const DOOR_PROGRAM: EffectProgram = {
  name: 'singleDoor_test', root: 0, flags: 0xa2, nodes: [],
  sequences: [
    { name: 'seq_0', activation: 1, ops: [
      { op: 'if', conditions: [{ kind: 'valve', valve: 'NA', operation: 2, operand: 0, context: true }] },
      { op: 'callSequence', sequence: 'open' }, { op: 'else' }, { op: 'callSequence', sequence: 'close' }, { op: 'endif' },
    ] },
    { name: 'open', activation: 2, ops: [
      { op: 'valve', valve: 'NA', operation: 0x0b, operand: 1, context: true },
      { op: 'if', conditions: [{ kind: 'valve', valve: 'cell', operation: 2, operand: 1 }] }, { op: 'call', anim: 'okfor' }, { op: 'endif' },
    ] },
    { name: 'close', activation: 2, ops: [
      { op: 'valve', valve: 'NA', operation: 0x0b, operand: 0, context: true },
      { op: 'if', conditions: [{ kind: 'valve', valve: 'cell', operation: 2, operand: 0 }] }, { op: 'call', anim: 'notok' }, { op: 'endif' },
    ] },
  ],
};
const swap = (name: string, no: boolean): EffectProgram => ({
  name, root: 0, flags: 0x22, nodes: ['NA', 'bars_no', 'bars_ok'],
  sequences: [{ name: 'open', activation: 1, ops: [{ op: 'active', node: 1, on: no }, { op: 'active', node: 2, on: !no }] }],
});

function cellMap(): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const poly = (path: string, ditype: number, material: number, points: number[]): WorldPoly => ({
    modelName: 'worldmodel', path, region: 0, ditype, material, ptcount: 4, cameratype: 0, points: Float32Array.from(points),
  });
  const bars = [100, 0, -100, 100, 0, 100, 100, 60, 100, 100, 60, -100];               // across x 100, as the jail's
  const polys = [
    poly('worldmodel/floor', 3, 25, [-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
    poly(NO, 2, 28, bars), poly(OK, 2, 3, bars),
  ];
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: 'worldmodel', path: p.path, first: i, count: 1, flags: 0x1001 }));
  const ground = packGround(params, polys, owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, -500, -200 + i * 50)]);
  const door: DoorSpec = {
    index: 0, node: 'cell', path: 'worldmodel/cell', valve: 'cell', range: 2000, elevation: -1, programs: [DOOR_PROGRAM],
    local: IDENTITY, parent: IDENTITY, owners: [], sweep: { minX: -10, minZ: -10, maxX: 10, maxZ: 10 },
  };
  const placed = ['worldmodel/floor', NO, OK, 'worldmodel/cell'];
  const instances = placed.map((path, id) => ({ id, path, node: path.split('/').pop()!, modelName: 'worldmodel', root: path }));
  const meta: MapMeta = {
    stem: 'MP99', actions: [], instances, instanceByPath: new Map(instances.map((i) => [i.path, i.id])), diagnostics: [],
    initial: [NO, OK].map((path) => ({ path, deactivate: false, saveActive: true, saveTransform: false, saveParent: false })),
    scene: { destructibles: [], programs: [{ program: swap('okfor', false), search: [0, 3, 3] }, { program: swap('notok', true), search: [0, 3, 3] }] },
  };
  return { stem: 'MP99', name: 'CELL', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [], doors: [door], meta };
}

function setup() {
  let now = 0;
  const map = cellMap();
  const room = new Room(map, null, { now: () => now, random: () => 0.5, launchCountdownS: 0 });
  const tick = (n = 1): void => { for (let k = 0; k < n; k++) { now += 1000 / TICK_HZ; room.step(); } };
  const join = (id: number): Client => {
    const c = new Client();
    room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: `p${id}`, map: 'MP99' }, `10.0.0.${id}`);
    return c;
  };
  const live = (path: string): boolean => {
    const o = map.ground.owners.find((x) => x.path === path)!;
    return o.flags === undefined || (o.flags & 1) !== 0;
  };
  const near = (): string[] => pickSurfaces(map.grid, [0, 30, 0], [600, 30, 0], '').filter((h) => h.distance < 150).map((h) => h.material.name).sort();
  const use = (): void => { expect(room.doors.use(0, null, 'self')).toBe(true); tick(30); expect(room.doors.state(0).busy).toBe(false); };
  return { room, map, tick, join, live, near, use };
}

describe("DF-4: a door program's CALL_ANIMATION runs the map set's program on the room's world", () => {
  it('the open turns the grate off and the invisible set on -- the pick passes -- the close the inverse; both whole at the reset', () => {
    const s = setup();
    // The opening (MP6's data: no bit 31 on either reference, `cdoor1`'s autostart sets only the valve): both active.
    expect([s.live(NO), s.live(OK)]).toEqual([true, true]);
    expect(s.near()).toEqual(['INVISIBLE_DI', 'METAL_GRATE']);
    s.use();
    expect(s.room.doors.state(0).open).toBe(true);
    expect([s.room.world.isActive(NO), s.room.world.isActive(OK)]).toEqual([false, true]);
    expect([s.live(NO), s.live(OK)]).toEqual([false, true]);
    expect(s.near()).toEqual(['INVISIBLE_DI']);
    s.use();
    expect(s.room.doors.state(0).open).toBe(false);
    expect([s.live(NO), s.live(OK)]).toEqual([true, false]);
    expect(s.near()).toEqual(['METAL_GRATE']);
    s.use();
    s.room.world.reset();                                        // FUN_002ac0e0: both saved references back
    expect([s.live(NO), s.live(OK)]).toEqual([true, true]);
  });

  it("the state rides the EnvWire: a late joiner's welcome names the grate off after the open", () => {
    const s = setup();
    s.use();
    const c = s.join(7);
    const { env } = c.of('welcome')[0]!;
    expect(env?.states).toEqual([{ id: 1, active: false }]);       // bars_no off; bars_ok on, as at its opening
  });
});
