import { performance } from 'node:perf_hooks';
import { Skeleton, transformPoint, type CollisionOwner, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import {
  Button, encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, STANCE_CODES, TICK_HZ, type Command, type ServerEvent, type SimMap,
} from '../../../viewer/src/sim';
import { Animator, PLAY_CLIPS, type MoverSnapshot } from '../../../viewer/src/animator';
import { bodyOf, snapshotOf } from '../../../viewer/src/net/body';
import { decodeSnapshot, encodeSnapshot } from '../../../viewer/src/net/codec';
import type { clipsFromPack, motionTableFromArchive } from '../../../viewer/src/motionTable';
import { TRAVERSAL_CLIPS } from '../../../viewer/src/traversal';
import type { SimSkeleton } from '../../../viewer/src/simMap';
import { Room, type Conn } from '../../src/room';

/**
 * HIT-POSE's room (`../hitPoseRewind.test.ts`, `../hitPoseAnimated.test.ts`): two seats on a flat floor, on the SEAL's
 * skeleton with its motion, and B's copy as the shooter's page draws it -- the page's own `Animator`, headless, on its
 * own instance of the skeleton, fed once a room tick B's body as a page receives it: the room's `BodyState` of B's
 * `Walker` (`../../../viewer/src/net/body.ts` `bodyOf`) encoded as the room's snapshot frame encodes it (`encodeSnapshot`
 * on the room's `feetOrigin`), decoded as the page decodes it (`decodeSnapshot`) and turned as `RemotePlayers` turns it
 * (`snapshotOf`), its root tilt beside it (the page runs its own, `remoteTilt`). Not the page's: its frame clock, the
 * 30 Hz snapshots and the interpolation between them (`HIT_POSE_CLOCK_READING`), and the layers its `Play` adds
 * (`HIT_POSE_LAYERS_READING`).
 */

export type V3 = [number, number, number];

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};
function map(perSide = 4): SimMap {
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(PARAMS, [FLOOR], owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = Array.from({ length: perSide }, (_, i) => i).flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [] };
}

class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* not used */ }
}

const tok = (tab: number): string => `tab${tab}`.padEnd(22, '_');
/** What the body's animator does not read (`bodyOf`'s extras): the same for the page's copy and the room's. */
export const EXTRAS = { alive: true, weapon: 0 as const, aiming: false, trigger: false, boost: false };
/**
 * A crouch-walk's stick: under the crouch run's 12.4 / 14.8 (`../../../viewer/src/mover` `CROUCH_RUN`, `FUN_00584c60`),
 * past which a crouched body stands and runs.
 */
export const CROUCH_WALK = 0.6;
/** The clips the page draws a copy with (`PLAY_CLIPS` and the traversal moves'). */
export const PAGE_CLIPS = [...new Set([...PLAY_CLIPS, ...TRAVERSAL_CLIPS])];

type Surface = { distance: number; tag?: { id: number; part: number } };
type Rewind = { rewoundBodies(p: unknown, from: V3, dir: V3, reach: number, at: number): Surface[] };

/** A body-frame point (x right, y up, z behind) to the world at the feet and yaw (`play.ts` `actorToWorld`). */
export function toWorld(feet: V3, yaw: number, v: V3): V3 {
  const r = (yaw * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [feet[0] + v[0] * c + v[2] * s, feet[1] + v[1], feet[2] - v[0] * s + v[2] * c];
}

/**
 * A at the origin, B 100 units along +x facing A, both on the SEAL's skeleton with its motion; `page`, B's copy as the
 * shooter's page draws it -- rebuilt when B's seat is rebuilt (a new `sim`, as the page's copy is at a spawn), stepped by
 * a tick after every room step while B lives.
 */
export function hitPoseRoom(seal: SimSkeleton, clips: ReturnType<typeof clipsFromPack>, table: ReturnType<typeof motionTableFromArchive>) {
  let seed = 1;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const room = new Room(map(), null, { now: () => 0, random }, { seal: [seal], terrorist: [seal] });
  [0, 1].forEach((i) => {
    room.hello(i + 1, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: `P${i + 1}`, map: 'MP99', session: tok(i + 1) }, `10.0.0.${i + 1}`);
  });
  let page: { sim: unknown; skeleton: Skeleton; anim: Animator } | null = null;
  const snap = (): MoverSnapshot => {
    const p = room.player(2)!;
    const origin = (room as unknown as { feetOrigin: [number, number, number] }).feetOrigin;
    const frame = encodeSnapshot({ tick: room.tick, own: null, bodies: [bodyOf(2, p.sim.body(), EXTRAS)] }, origin);
    return { ...snapshotOf(decodeSnapshot(frame).bodies[0]!), rootTilt: p.sim.walker.rootTilt.q };
  };
  const after = (): void => {
    const p = room.player(2)!;
    if (!p.alive) { page = null; return; }
    // The copy steps when the room's own poser did this step (its `sim` the seat's: a spawn late in a step makes the
    // room's at the next), so both start on the same tick; a room without posers (before HIT-POSE), on the seat's `sim`.
    const roomPoser = (p as unknown as { poser?: { sim: unknown } | null }).poser;
    if (roomPoser !== undefined && roomPoser?.sim !== p.sim) { page = null; return; }
    if (!page || page.sim !== p.sim) {
      const sk = seal.skeleton, skeleton = new Skeleton(sk.model, sk.modelMatrix, sk.parts);
      page = { sim: p.sim, skeleton, anim: new Animator(skeleton, clips, table, { random: () => 0 }) };
    }
    page.anim.step(1 / TICK_HZ, snap());
  };
  room.step();
  after();
  const at: V3[] = [[0, 0, 0], [100, 0, 0]];
  at.forEach((p, i) => room.player(i + 1)!.sim.walker.place(p[0], p[1] + 20, p[2]));
  const held = new Map<number, Partial<Command>>();
  /** `ticks` room steps, each seat's command its held stick and buttons (A still, looking along +x; B facing A). */
  const run = (ticks: number, once: Partial<Command> = {}): void => {
    for (let i = 0; i < ticks; i++) {
      for (const id of [1, 2]) {
        const p = room.player(id)!;
        const base: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: id === 2 ? 90 : 270, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
        const cmd: Command = { ...base, ...held.get(id), ...(id === 2 && i === 0 ? once : {}), seq: base.seq };
        room.binary(id, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
      }
      room.step();
      after();
    }
  };
  room.player(2)!.sim.allowSnap();
  run(30);
  const stick = (forward: number): void => { held.set(2, { forward }); };
  const press = (stance: 'stand' | 'crouch' | 'prone'): void => run(1, { buttons: Button.Stance, stance: STANCE_CODES.indexOf(stance) });
  /** B's bone as the page draws it now: its bbox middle through the copy's pose, in the world at B's feet and yaw. */
  const drawn = (bone: string): V3 => {
    const s = room.player(2)!.sim.walker.state, sk = page!.skeleton, p = sk.part(bone);
    const v = transformPoint(sk.world[p.index]!, (p.bbox[0]! + p.bbox[3]!) / 2, (p.bbox[1]! + p.bbox[4]!) / 2, (p.bbox[2]! + p.bbox[5]!) / 2);
    return toWorld([s.x, s.y, s.z], s.yaw, v);
  };
  /** The part of B a ray through `point` meets in the room's rewind at `at` (now by default): from B's front, or his left. */
  const part = (point: V3, from: 'front' | 'side', at = room.tick): number | null => {
    const y = (room.player(2)!.sim.walker.state.yaw * Math.PI) / 180;
    const fwd: V3 = [-Math.sin(y), 0, -Math.cos(y)], right: V3 = [Math.cos(y), 0, -Math.sin(y)];
    const d: V3 = from === 'front' ? [-fwd[0], -fwd[1], -fwd[2]] : right;
    const o: V3 = [point[0] - d[0] * 30, point[1] - d[1] * 30, point[2] - d[2] * 30];
    const hits = (room as unknown as Rewind).rewoundBodies(room.player(1)!, o, d, 60, at).filter((h) => h.tag?.id === 2);
    hits.sort((a, b) => a.distance - b.distance);
    return hits[0]?.tag?.part ?? null;
  };
  const clip = (): string => page?.anim.stats().clip ?? '(none)';
  /** B's copy's skeleton as last drawn (null before B lives), and the snapshot the copy was last fed. */
  const pageSkeleton = (): Skeleton | null => page?.skeleton ?? null;
  return { room, run, stick, press, drawn, part, clip, pageSkeleton, snap };
}

/**
 * HIT-POSE's perf fold (research 217 s3.6a): a full room's step, measured -- 16 seats on the flat floor (8 a side), every
 * seat moving each tick (the odd ones running, the even ones crouch-walking), each turning on a circle so the stick and
 * the yaw change every tick as a played round's do. `step()` runs `ticks` room steps and returns each step's
 * milliseconds; the commands are given before the clock starts. An instrument (no original): nothing judged.
 */
/** A seat's body: the SEAL's skeleton, with its motion (the live poses) or without it (the idle sets). */
export type CrowdBody = Omit<SimSkeleton, 'motion'> & Partial<Pick<SimSkeleton, 'motion'>>;
export function crowdRoom(seal: CrowdBody, seats = 16) {
  let seed = 1;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const room = new Room(map(Math.ceil(seats / 2)), null, { now: () => 0, random }, { seal: [seal], terrorist: [seal] });
  const ids = Array.from({ length: seats }, (_, i) => i + 1);
  for (const id of ids) {
    room.hello(id, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99', session: tok(id) }, `10.0.${id >> 8}.${id & 255}`);
  }
  const first = performance.now();
  room.step();                                                     // the seats' first step: their spawns (timed apart, `spawnMs`)
  const spawnMs = performance.now() - first;
  let n = 0;
  const step = (ticks: number): number[] => {
    const ms: number[] = [];
    for (let i = 0; i < ticks; i++, n++) {
      for (const id of ids) {
        const p = room.player(id);
        if (!p) continue;
        const crouch = id % 2 === 0;
        const cmd: Command = {
          seq: p.sim.seq + 1, forward: crouch ? CROUCH_WALK : 1, right: 0, yaw: (id * 40 + n * 1.5) % 360, pitch: 0, turn: 0,
          buttons: crouch && n === 0 ? Button.Stance : 0, stance: crouch ? STANCE_CODES.indexOf('crouch') : 0, weapon: 0,
        };
        room.binary(id, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
      }
      const t0 = performance.now();
      room.step();
      ms.push(performance.now() - t0);
    }
    return ms;
  };
  return { room, step, spawnMs, alive: (): number => ids.filter((id) => room.player(id)?.alive).length };
}
