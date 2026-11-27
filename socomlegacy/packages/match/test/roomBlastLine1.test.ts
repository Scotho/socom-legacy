import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import { encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import { Room, type Conn } from '../src/room';

/**
 * NADE-BLAST (V21-AA; research 400; the owner's reports of 2026-11-11 and 2026-11-13: "alot of deaths from nades thru
 * walls and windows"). Simulation track, reading, pending review.
 *
 * The original hurts a SEAL only when two lines from the blast are both clear:
 * - LINE 1, the explosion's own (`FUN_003c7dd0` D:L318974-318992 -> `FUN_003c80e0` D:L319096-319143), from the round's
 *   point to the midpoint of one of the body's node boxes (`FUN_003c7ee0` D:L319049-319056; which node is unread:
 *   capture C1, `BLAST_LINE1_END_PLACEHOLDER`), judged by the radius squared times each face's PENETRATION against the
 *   line's length squared (one under 0.0001 refuses outright);
 * - LINE 2, the body's own (`FUN_005ac070` D:L464841-464853 -> `FUN_005a0e70`), to the posed head bone, vetoed by the
 *   first face that is cover (`blastExposed`, research 388).
 * The port tested line 2 alone, to a head 18.3 / 11.1 over the feet (`HEAD_OVER`), above the posed eye (15.88 / 9.90,
 * research 180 s1.3) that stands in for the head bone. Red on the base: line 1 is missing and the head is high.
 *
 * The flat map and the drop are `roomBlastSeeThrough.test.ts`' (copied, not imported): an M67 dropped at x 0 by a
 * Terrorist comes to rest on the floor; a SEAL stands at x `seal`, faces across x = `x` between them.
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, 1000, 1000, 0, 1000, 1000, 0, -1000, -1000, 0, -1000]),
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
const METAL_THICK = 25, METAL_GRATE = 28, ITEM = 33;

describe('NADE-BLAST: line 1 and the posed head on a standing SEAL (synthetic, no game data)', () => {
  it('control: in the open he is hurt', () => {
    expect(blastAt(map([]), 60)).toEqual(HURT);
  });

  it('RED (line 1): a METAL_THICK wall 13 high, 6 in front of him: the line to his head clears its top, the line to the body midpoint does not -- spared', () => {
    // From the round at rest (~0.1 up) at x 0 to x 60: at x 54 the head line (15.88 up) stands at ~14.3, over the top;
    // the line to the root height (`BLAST_LINE1_END_PLACEHOLDER` standing, 11.48) at ~10.3, under it. The base: hurt.
    expect(blastAt(map(band(54, 0, 13, METAL_THICK, 'worldmodel/low')), 60)).toEqual(SPARED);
  });

  it('RED (the head): a METAL_THICK band from 12.5 to 16 at x 54: under the old head line, over the line 1 end, across the posed head line -- spared', () => {
    // At x 54: the old head line (18.3) at ~16.5 passes over the band; the posed head line (15.88) at ~14.3 meets it;
    // line 1 (11.48) at ~10.3 passes under it. The base: hurt.
    expect(blastAt(map(band(54, 12.5, 16, METAL_THICK, 'worldmodel/lintel')), 60)).toEqual(SPARED);
  });

  it('RED (line 1, the reach): a METAL_GRATE (0.4) at x 30, the SEAL at 105 -- past 150 x sqrt(0.4) = 94.9 -- spared; through an ITEM face (1.0) the blast reaches him', () => {
    // Line 2 sees through both (research 388); line 1's product 150^2 x 0.4 = 9000 is under the line's ~105.6^2. FRAG-COUNT:
    // at 105 u the count is the extra alone x 900/105^2 (at most 0.57: one fragment or none by the second draw), so the
    // ITEM control holds the blast reaching him (the ring, `blast`), not a fragment's hurt; the grate shuts it whole.
    expect(blastAt(map(band(30, 0, 80, ITEM, 'worldmodel/item')), 105).blasts).toBe(1);
    expect(blastAt(map(band(30, 0, 80, METAL_GRATE, 'worldmodel/grate')), 105)).toEqual(SPARED);
  });

  it('line 1 is one-sided, as read: the 13-high wall laid as one face shelters him from one side only', () => {
    const a = blastAt(map(band(54, 0, 13, METAL_THICK, 'worldmodel/low', 'a')), 60);
    const b = blastAt(map(band(54, 0, 13, METAL_THICK, 'worldmodel/low', 'b')), 60);
    expect([a, b]).toContainEqual(SPARED);
    expect([a, b]).toContainEqual(HURT);
  });
});
