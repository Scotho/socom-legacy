import { describe, expect, it } from 'vitest';
import { M67, type CollisionOwner, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import { BLAST_POINT_LIFT_READING, blastPoint, resolveBlast } from '../../viewer/src/net/blast';
import { fragmentDamage, freshHealth } from '../../viewer/src/net/damage';
import { Room, type Conn } from '../src/room';

/**
 * LATER 992 (research 400 s10-s11; simulation track, reading, pending review): the round's detonation `FUN_003c8330`
 * lifts its point `+0x48` 1.0 in y as its last statement (D:L319266), after the effects (D:L319246); the target list was
 * filled in state 3 from the unlifted point (`FUN_0031dc90` D:L316805 / D:L320416); both projectile updaters run it on
 * state 4 (`FUN_003c5310` D:L316877, `FUN_003c9fb0` D:L320105). The walk's lines start at the lifted point (`FUN_003c7ee0`
 * D:L319056, `FUN_005ac070` D:L464853); GetDamage's falloff stays at the round's node (`FUN_003c7600` D:L318711-318716). The rig read it on r0004: a resting
 * M67's `+0x48` y up by exactly 1.0 on the detonation frame, two natural throws (n = 2; impact, in-air and the other
 * round kinds not measured). The port blasted at the rest point (the floor + 0.1). Red on the base.
 *
 * The flat map and the drop are `roomBlastLine1.test.ts`' (copied, not imported).
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};
/** A face across x = `x` from height `y0` to `y1`, `material`; `side` 'both' lays it twice, wound each way. */
function band(x: number, y0: number, y1: number, material: number, path: string, side: 'a' | 'b' | 'both' = 'both'): WorldPoly[] {
  const a: WorldPoly = { ...FLOOR, path, ditype: 2, material, points: Float32Array.from([x, y0, -200, x, y0, 200, x, y1, 200, x, y1, -200]) };
  const b: WorldPoly = { ...a, path: `${path}b`, points: Float32Array.from([x, y0, -200, x, y1, -200, x, y1, 200, x, y0, 200]) };
  return side === 'a' ? [a] : side === 'b' ? [b] : [a, b];
}

function map(faces: readonly WorldPoly[]): SimMap {
  const polys: WorldPoly[] = [FLOOR, ...faces];
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: 'worldmodel', path: `${p.path}#${i}`, first: i, count: 1 }));
  const ground = packGround(PARAMS, polys, owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [] };
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

/** An M67 dropped at x 0, a SEAL standing at x `seal` (z 0): the SEAL's blast events. */
function blastAt(m: SimMap, seal: number): { blasts: number; hurt: number } {
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
  room.player(2)!.sim.walker.place(seal, 20, 0);
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

const HURT = { blasts: 1, hurt: 1 }, SPARED = { blasts: 0, hurt: 0 };
const METAL_THICK = 25;

describe('LATER 992: the blast point lifted 1.0 at the detonation (synthetic, no game data)', () => {
  it('blastPoint lifts y by the reading, x and z kept', () => {
    expect(BLAST_POINT_LIFT_READING).toBe(1);
    expect(blastPoint([3, 0.1, -4])).toEqual([3, 1.1, -4]);
  });

  it('RED: a METAL_THICK lip 2.4 high at x 10 between a resting M67 and a SEAL at 60 -- the lines from the rest point pass under its top, from the lifted point over it -- hurt', () => {
    // From the rest point (~0.1 up, then `sightFrom`'s 0.1 toward the end) line 1 to the root (11.48) stands ~2.0 at x 10,
    // under the lip; from the lifted point (~1.1) ~2.8, over it, and line 2 (15.88) ~3.6. The base: spared.
    expect(blastAt(map(band(10, 0, 2.4, METAL_THICK, 'worldmodel/lip')), 60)).toEqual(HURT);
  });

  it('control: a METAL_THICK wall 13 high at x 54 still shelters him from the lifted point (line 1, NADE-BLAST)', () => {
    // From ~1.1 up line 1 stands ~10.4 at x 54, still under 13; line 2 ~14.4, over it.
    expect(blastAt(map(band(54, 0, 13, METAL_THICK, 'worldmodel/low')), 60)).toEqual(SPARED);
  });

  it("RED (review F1): GetDamage's falloff stays at the round's node -- a SEAL 80 straight over it takes the node's 80, not the lifted point's 79", () => {
    // `FUN_003c7600` D:L318711-318716 measures from `*(round+0x20)+0x30`, the node the lift does not move; the count and the
    // radius factor read the lifted `+0x48` (D:L459417, D:L459214-459226). In the falloff band (past 75) 1.0 is 1.87 a fragment.
    // FRAG-COUNT: past 30 the count is the extra alone x 900/d^2 -- the extra 7 (a first draw of 0.99) x 900/6241 = 1.01 -> 1.
    const random = (): number => 0.99;
    const node = [0, 0.1, 0], lifted = blastPoint(node);
    const out = resolveBlast(freshHealth(), { feet: [0, 80.1, 0], posture: 'stand', yaw: 0 }, lifted, { record: M67, piercing: 4, fragments: true }, random, true, node);
    expect(out).not.toBeNull();
    expect(out!.fragments).toBeGreaterThan(0);
    for (const h of out!.hits) expect(h.damage).toBe(fragmentDamage(M67.explosionDamage, M67.explosionRadius, 80));
  });
});
