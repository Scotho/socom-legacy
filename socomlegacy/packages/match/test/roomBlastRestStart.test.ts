import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import { encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import { blastLine } from '../../viewer/src/sceneHealth';
import { surfaceMaterial } from '@s2u/scene';
import { Room, type Conn } from '../src/room';

/**
 * WM-29 (report 107, "grenades through walls"; research 430; simulation track, reading, pending review): where a
 * RESTING round's blast lines start. The original's body line runs from the round's own `+0x48` with no offset
 * (`FUN_005ac070` D:L464853 via `FUN_0031dd90`; research 179 s8.9, PARTIAL / BELIEVED), and line 1 from the same
 * point (research 400 s8, s11). The room started every line `BOUNCE_LIFT` 0.1 toward its end (`sightFrom`,
 * IMPACT_SIGHT_READING) -- meant for an impact detonation whose point lies on the struck surface. A grenade that comes
 * to rest within 0.1 of a wall's face then starts both lines past that face, the far face is met from behind (the
 * one-sided rule), and the blast reaches the room behind the wall: a recording of the port shows it once (MP12, an
 * M67 resting 0.037 from a stone wall, a death 105.7 u away behind 11.5 u of stone; research 430 s2).
 *
 * The flat map and the drop are `roomBlastLine1.test.ts`' (copied): an M67 dropped at x 0 comes to rest on the floor
 * at x 0; a SEAL stands at x 30 behind a STONE-like solid wall whose near face (wound toward the round) stands at x
 * `near` and whose far face (wound away from it, met from behind) at x 11.5.
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, 1000, 1000, 0, 1000, 1000, 0, -1000, -1000, 0, -1000]),
};
/** A face across x = `x` from height 0 to 80: 'a' wound with its normal toward -x, 'b' toward +x. */
function face(x: number, side: 'a' | 'b', path: string, material = METAL_THICK): WorldPoly {
  const pts = side === 'a'
    ? [x, 0, -200, x, 0, 200, x, 80, 200, x, 80, -200]
    : [x, 0, -200, x, 80, -200, x, 80, 200, x, 0, 200];
  return { ...FLOOR, path, ditype: 2, material, points: Float32Array.from(pts) };
}
/** The wall: its near face at x `near` toward the round, its far face at x 11.5 away from it. */
const wall = (near: number): WorldPoly[] => [face(near, 'a', 'worldmodel/wall_near'), face(11.5, 'b', 'worldmodel/wall_far')];

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
const METAL_THICK = 25;

/** An M67 dropped at x 0 (it rests there), a SEAL standing at x `seal`: the SEAL's blast events. */
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
  room.player(1)!.sim.walker.place(-0.5, 20, 0);
  room.player(2)!.sim.walker.place(seal, 20, 0);
  for (let i = 0; i < 60; i++) {
    const p = room.player(1)!;
    room.binary(1, encodeCommands({ viewTick: room.tick, commands: [{ seq: p.sim.seq + 1, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 }] }));
    room.step();
  }
  const p = room.player(1)!, st = p.sim.walker.state;
  room.text(1, { type: 'throw', seq: p.sim.seq, kind: 'M67', from: [0, st.y + 15.4, st.z], velocity: [0, 0, 0] });
  room.player(1)!.sim.walker.place(-600, 20, 0);
  for (let i = 0; i < FUSE_TICKS; i++) room.step();
  expect(s.of('grenade').length).toBe(1);                       // the throw was taken (the control is not a refusal)
  return { blasts: s.of('blast').length, hurt: s.of('hurt').length };
}

const HURT = { blasts: 1, hurt: 1 }, SPARED = { blasts: 0, hurt: 0 };

describe('WM-29: a resting round\'s blast lines start at its own point, not 0.1 toward the body (synthetic, no game data)', () => {
  it('control: in the open, 30 u away, he is hurt', () => {
    expect(blastAt(map([]), 30)).toEqual(HURT);
  });

  it('control: the same wall with its near face 0.5 off the round shelters him', () => {
    expect(blastAt(map(wall(0.5)), 30)).toEqual(SPARED);
  });

  it('RED: the round rests 0.05 from the wall\'s near face -- the wall still shelters him (the trunk started both lines past that face)', () => {
    expect(blastAt(map(wall(0.05)), 30)).toEqual(SPARED);
  });
});

/**
 * The guard 8f's second read asks before the impact offset goes (research 430 s3): an impact detonation's point is the
 * intersection itself, ON the struck plane (`FUN_003c8920` r0001 0x3c8964, r0004 0x3eaaf4), then +1.0 in y -- so on a
 * wall its lifted start still lies on the wall's plane. The original's hull query (its VU0 micro 288-333) hits only a
 * start in front (to within 0.00001) and an end behind: from the struck face a body in FRONT is reached, a body BEHIND
 * is not. The room's line test is asked from such a start (`blastLines`, private, called as the room calls it); and the
 * scene's line (`blastLine`, two-sided by BLAST_REACH_LINE_SIDES_READING) to a destructible in front.
 */
describe('WM-29 guard: an impact on a wall -- its start on the struck plane (synthetic, no game data)', () => {
  type Lines = { blastLines(point: V3, feet: V3, posture: 'stand' | 'crouch' | 'prone', radius: number): boolean; map: SimMap };
  type V3 = [number, number, number];
  const onFace: V3 = [0.05, 1.1 + 20, 0];                       // the struck point on the near face (x 0.05), +1.0 lifted, mid-wall
  const room = (): Lines => new Room(map(wall(0.05)), null, { now: () => 0, random: () => 0.5 }) as unknown as Lines;

  it('(i) a body in front of the struck wall, in the open, is reached', () => {
    expect(room().blastLines(onFace, [-30, 0, 0], 'stand', 150)).toBe(true);
  });

  it('(ii) a body behind the struck wall is not', () => {
    expect(room().blastLines(onFace, [30, 0, 0], 'stand', 150)).toBe(false);
  });

  it('(i, the scene) a destructible in front of the struck wall is reached by the scene\'s line', () => {
    const r = room();
    expect(blastLine(r.map.grid, onFace, [-30, 20, 0], 'worldmodel/target', 150, (p) => surfaceMaterial(p.material, '').penetration)).toBe(true);
  });

  it('control (the scene): a destructible BEHIND the struck wall is still refused', () => {
    const r = room();
    expect(blastLine(r.map.grid, onFace, [30, 20, 0], 'worldmodel/target', 150, (p) => surfaceMaterial(p.material, '').penetration)).toBe(false);
  });

  it('control (the scene): a resting round 0.05 from the wall -- the scene\'s line to a destructible behind it is still refused', () => {
    const r = room();
    const resting: V3 = [0, 0.1 + 1, 0];                       // the floor + BOUNCE_LIFT, lifted 1.0 (research 430 s3)
    expect(blastLine(r.map.grid, resting, [30, 20, 0], 'worldmodel/target', 150, (p) => surfaceMaterial(p.material, '').penetration)).toBe(false);
  });
});

/**
 * WM-29, the controller's (B): the original's ray query as 8f read its VU0 microprogram (instructions 288-333; research
 * 430 s3 and its micro addendum) -- per polygon, with n the UNNORMALISED (p2-p1)x(p0-p1), ds = n.(start-p1),
 * de = n.(end-p1): one-sided a hit iff ds + 9.99999975e-6 >= 0 and de + 1.0013580322e-5 < 0; two-sided also iff the
 * start sum < 0 and the end sum >= 0; t used as computed. An impact's lifted point "on" a ONE-faced wall's plane (its
 * face wound toward the round, n = (-32000, 0, 0)) is decided by the float32 residual of the wall's x -- in the original
 * too (its arithmetic is float32; how the PS2's falls is the rig's, research 430 s5). Each x's ds is stated and the RULE's
 * answer asserted, not "front reached, behind refused" everywhere:
 * - x 0.05: f32(x) - x = +7.45e-10, ds = +2.38e-5 -- in front: front reached, behind refused (players and scene).
 * - x 0.7: f32(x) - x = -1.19e-8, ds = -3.81e-4 -- behind, past the band: the one-sided lines meet nothing (a body
 *   behind is REACHED); the scene's two-sided line hits from behind toward a destructible in front (REFUSED) and meets
 *   nothing toward one behind (REACHED). The original's rule as read: named open in research 430 s5.
 * - x 0.01: f32(x) - x = -2.24e-10, ds = -7.15e-6 -- behind by the residual but inside the start's inclusive band: in
 *   front, as 0.05 (the case `h.t === 0` got wrong both ways).
 * - x 123.4: f32(x) - x = +1.53e-6, ds = +4.88e-2 -- in front, as 0.05.
 */
const RAW_NX = -32000;                                            // (p2-p1)x(p0-p1) of `face(x, 'a', ..)`: (0,80,0)x(0,0,-400)
describe.each([
  { x: 0.05, front: true, behind: false, sceneFront: true, sceneBehind: false },
  // x 0.7 tests the RULE on the port's double inputs, not a prediction of the original at that spot (8f's check, note 6):
  // in the original a start at the wall's own single-precision x has ds = 0 (in front), and an impact point's side is set
  // by its own rounding (~1e-3 raw here, far outside the band) -- the rig's (research 430 s5). LATER 1087 (b): the scene
  // line is one-sided, the players' rule, so sceneFront is the original's as decoded: reached. A/B at the same head:
  // two-sided ('blast-scene', the departure retired) false; one-sided true.
  { x: 0.7, front: true, behind: true, sceneFront: true, sceneBehind: true },
  { x: 0.01, front: true, behind: false, sceneFront: true, sceneBehind: false },
  { x: 123.4, front: true, behind: false, sceneFront: true, sceneBehind: false },
])('WM-29 (B): an impact on a one-faced wall at x $x -- the micro\'s rule on the port\'s float32 residual (synthetic)', ({ x, front, behind, sceneFront, sceneBehind }) => {
  type V3 = [number, number, number];
  type Lines = { blastLines(point: V3, feet: V3, posture: 'stand' | 'crouch' | 'prone', radius: number): boolean; map: SimMap };
  const room = (): Lines => new Room(map([face(x, 'a', 'worldmodel/wall_one')]), null, { now: () => 0, random: () => 0.5 }) as unknown as Lines;
  const on: V3 = [x, 21.1, 0];
  const scene = (r: Lines, to: V3): boolean => blastLine(r.map.grid, on, to, 'worldmodel/target', 150, (p) => surfaceMaterial(p.material, '').penetration);

  it('the start\'s side as the micro reckons it (ds + 9.99999975e-6 >= 0: in front)', () => {
    const ds = RAW_NX * (x - Math.fround(x));
    expect(ds + 9.99999975e-6 >= 0).toBe(x !== 0.7);
  });
  it('the players: a body in front', () => { expect(room().blastLines(on, [x - 30, 0, 0], 'stand', 150)).toBe(front); });
  it('the players (ii): a body behind', () => { expect(room().blastLines(on, [x + 30, 0, 0], 'stand', 150)).toBe(behind); });
  it('the scene: a destructible in front', () => { expect(scene(room(), [x - 30, 20, 0])).toBe(sceneFront); });
  it('the scene: a destructible behind the one-faced wall', () => { expect(scene(room(), [x + 30, 20, 0])).toBe(sceneBehind); });
});
