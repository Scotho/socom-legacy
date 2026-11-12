import { describe, expect, it } from 'vitest';
import { sampleClip, transformPoint, type CollisionOwner, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import {
  Button, cameraLook, centreClaim, encodeCommands, EYE_HEIGHT, faceToward, groundGrid, packGround, PROTOCOL_VERSION,
  type Command, type ServerEvent, type SimMap,
} from '../../viewer/src/sim';
import { PART } from '../../viewer/src/net/damage';
import { writePose } from '../../viewer/src/animator';
import { bodyVolumes, leanHeldKey, LEAN_HIT_POSE_READING, rayBody, type StanceVolumes } from '../../viewer/src/net/hitVolumes';
import { scopePeekShift } from '../../viewer/src/cameraRig';
import { simSkeletonsFromBytes, type SimSkeleton } from '../../viewer/src/simMap';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { rewindCapTicks, Room, type Conn } from '../src/room';

/**
 * LEAN-HIT (issue #752, LATER 775; the scope's section 4; reading, pending review): the room judges a round against the
 * body as it stood -- under a held peek, the lean clip's held key (`FUN_0057d810` D:L440437-440510 holds the clip;
 * `FUN_005abbc0` D:L464672-464803 meets the live skeleton's nodes; research 217 s3.6). Two seats in a room on a flat
 * floor with the SEAL's own skeleton and its six lean clips (the fixture disc's MP2, `MOTION_P.ZAR`, `READERC.ZAR`);
 * B peeks right; A's rounds at B's leaned head and at where B's upright head would be. Unit-test evidence only.
 */

const MP2 = fixture('RUN/MP2.ZDB'), PACK = fixture('RUN/MOTION_P.ZAR'), READERC = fixture('RUN/READERC.ZAR');
type V3 = [number, number, number];

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};
function map(): SimMap {
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(PARAMS, [FLOOR], owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [] };
}

class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* not used */ }
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] {
    return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[];
  }
}

const tok = (tab: number): string => `tab${tab}`.padEnd(22, '_');
/** A at the origin, B 100 units along +x facing A (yaw 90: forward (-1, 0), its right -z), on the SEAL's skeleton. */
function setup(skeletons: { seal: (SimSkeleton | null)[]; terrorist: (SimSkeleton | null)[] }) {
  let seed = 1;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const room = new Room(map(), null, { now: () => 0, random, combatReport: true }, { seal: skeletons.seal, terrorist: skeletons.seal });
  const cs = [0, 1].map((i) => {
    const c = new Client();
    room.hello(i + 1, c, { type: 'hello', version: PROTOCOL_VERSION, name: `P${i + 1}`, map: 'MP99', session: tok(i + 1) }, `10.0.0.${i + 1}`);
    return c;
  });
  room.step();
  const at: V3[] = [[0, 0, 0], [100, 0, 0]];
  at.forEach((p, i) => room.player(i + 1)!.sim.walker.place(p[0], p[1] + 20, p[2]));
  for (let i = 0; i < 30; i++) room.step();
  const look = new Map<number, { yaw: number; pitch: number }>([[2, { yaw: 90, pitch: 0 }]]);
  const buttons = new Map<number, number>();
  const feet = (id: number): V3 => { const w = room.player(id)!.sim.walker.state; return [w.x, w.y, w.z]; };
  /** `ticks` of every seat's commands at rest, at its look and its held buttons, one room step each. */
  const drive = (ticks: number): void => {
    for (let i = 0; i < ticks; i++) {
      for (const id of [1, 2]) {
        const p = room.player(id)!;
        const l = look.get(id) ?? { yaw: p.sim.walker.state.yaw, pitch: 0 };
        const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: l.yaw, pitch: l.pitch, turn: 0, buttons: buttons.get(id) ?? 0, stance: 0, weapon: 0 };
        room.binary(id, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
      }
      room.step();
    }
  };
  const face = (id: number, point: V3): void => {
    look.set(id, faceToward({ feet: feet(id), posture: room.player(id)!.sim.walker.posture }, point));
    room.player(id)!.sim.allowSnap();
    drive(30);
  };
  room.player(2)!.sim.allowSnap();                               // B turned to face A (LATER 14: staged as the room would)
  drive(30);
  const yaw = (id: number): number => room.player(id)!.sim.walker.state.yaw;
  /** A's round at its last command down the cone's centre to `point`, named at `viewTick` (now by default). */
  const shoot = (point: V3, viewTick = room.tick): void => {
    const p = room.player(1)!, seq = p.sim.seq, f = p.cone.frame(seq)!;
    const { eye: e } = cameraLook(f);
    const c = centreClaim(f, [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]], Math.hypot(point[0] - e[0], point[1] - e[1], point[2] - e[2]));
    room.text(1, { type: 'fire', seq, from: c.from, dir: c.dir, eye: c.eye, aim: c.aim, weapon: 0, viewTick });
    drive(1);
  };
  /** The parts A's rounds struck on B, as the combat report applied them. */
  const struck = (): (number | null)[] => cs[0]!.of('combat').filter((e) => e.status === 'applied' && e.request === 'fire').map((e) => e.part);
  return { room, feet, yaw, drive, face, shoot, struck, buttons };
}

describe.skipIf(!MP2 || !PACK || !READERC)(`LEAN-HIT: the room's round meets the leaning body${MP2 && PACK && READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const skeletons = MP2 && PACK && READERC ? simSkeletonsFromBytes(MP2, READERC, PACK) : { seal: [], terrorist: [], escortees: [] };
  /** The SEAL's skeleton, read when a test runs (BL-7: a skipped factory dereferences no absent fixture at collection). */
  const seal = (): SimSkeleton => skeletons.seal[0]!;
  /** B's head (the `head` bone's bbox middle) at world feet `f`, facing `yaw` (degrees), posed at `clip`'s key `frame`. */
  const headAt = (f: V3, yaw: number, clip: SimSkeleton['idles']['stand'], frame: number): V3 => {
    const sk = seal().skeleton, p = sk.part('head');
    if (clip) {
      // the pose the animator writes (`writePose` of the sampled key), read here off the clip itself
      writePose(sk, sampleClip(clip, frame / clip.rate, { loop: false }).parts);
    }
    const b = transformPoint(sk.world[p.index]!, (p.bbox[0]! + p.bbox[3]!) / 2, (p.bbox[1]! + p.bbox[4]!) / 2, (p.bbox[2]! + p.bbox[5]!) / 2);
    sk.resetToBind();
    // body frame (x right, y up, z behind) to the world at the yaw (`play.ts` actorToWorld)
    const r = (yaw * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
    return [f[0] + b[0] * c + b[2] * sn, f[1] + b[1], f[2] - b[0] * sn + b[2] * c];
  };
  type Seat = { feet(id: number): V3; yaw(id: number): number };
  const leanHead = (t: Seat): V3 => headAt(t.feet(2), t.yaw(2), seal().leans.stand.r, leanHeldKey(seal().leans.stand.r!));
  const idleHead = (t: Seat): V3 => headAt(t.feet(2), t.yaw(2), seal().idles.stand, 0);

  it('the reading is named: the held key for the whole peek', () => {
    expect(LEAN_HIT_POSE_READING).toBe('held');
    expect(seal().leans.stand.r?.name).toBe('seal_stand2rlean');
  });

  it("B peeking right: a round at B's leaned head hits HEAD; at B's upright head's place it misses", () => {
    const s = setup(skeletons);
    s.buttons.set(2, Button.LeanRight);
    s.drive(60);
    expect(s.room.player(2)!.sim.moves!.peeking()).toBe(1);
    expect(s.yaw(2)).toBeCloseTo(90, 0);                         // B faces A: its right is -z
    const head = leanHead(s);
    // The leaned head sits to B's right about where the peek's eye goes (`scopePeekShift(1)`, 4.35).
    expect(s.feet(2)[2] - head[2]).toBeGreaterThan(scopePeekShift(1) - 1);
    expect(s.feet(2)[2] - head[2]).toBeLessThan(scopePeekShift(1) + 1);
    s.face(1, head);
    s.shoot(head);
    expect(s.struck()).toEqual([PART.HEAD]);
    const t = setup(skeletons);
    t.buttons.set(2, Button.LeanRight);
    t.drive(60);
    t.face(1, idleHead(t));
    t.shoot(idleHead(t));
    expect(t.room.player(2)!.sim.moves!.peeking()).toBe(1);
    expect(t.struck()).toEqual([]);
  });

  it("B not peeking: the same round at the leaned head's place misses", () => {
    const s = setup(skeletons);
    s.drive(60);
    expect(s.room.player(2)!.sim.moves!.peeking()).toBe(0);
    const head = leanHead(s);
    s.face(1, head);
    s.shoot(head);
    expect(s.struck()).toEqual([]);
  });

  it('the rewind: B leaned 300 ms ago and has stood up since; a round named at then hits the leaned head (the history keeps the peek)', () => {
    const run = (named: 'then' | 'now'): (number | null)[] => {
      const s = setup(skeletons);
      s.room.noteRoundTrip(1, 250);                              // a line whose rewind cap reaches 300 ms (18 ticks)
      s.buttons.set(2, Button.LeanRight);
      s.drive(60);
      const head = leanHead(s);
      s.face(1, head);
      expect(s.room.player(2)!.sim.moves!.peeking()).toBe(1);
      const then = s.room.tick;
      s.buttons.set(2, 0);
      s.drive(18);
      expect(s.room.player(2)!.sim.moves!.peeking()).toBe(0);
      const pa = (s.room as unknown as { players: Map<number, { pingExact: number }> }).players.get(1)!;
      expect(rewindCapTicks(pa.pingExact)).toBeGreaterThanOrEqual(s.room.tick - then);
      s.shoot(head, named === 'then' ? then : s.room.tick);
      return s.struck();
    };
    expect(run('then')).toEqual([PART.HEAD]);
    expect(run('now')).toEqual([]);                           // named now, B upright: the same aim misses
  });

  it("the hostage order's pick (`orderPick`) meets B on the body the round meets: leaning, the leaned head's line is blocked and the upright head's is not; upright, the converse (Codex P2 on #761)", () => {
    // The original's order pick is the camera's ray query over the scene's live nodes (`FUN_005aa6e0` D:L464118-464122
    // -> `FUN_0031e160`, the issuer's own node switched off around it; research 199, the aim pick's query), the nodes a round meets
    // (research 217 s3.6): under a held peek, the lean set. The page's `aimBodies` casts `bodyVolumes(.., peek)` on the
    // snapshot's peek (`remoteAim.test.ts` "LEAN-HIT"); the room's pick takes the same shape. Reading, pending review.
    type Picker = { orderPick(i: number, d: V3, s?: number, o?: V3): { picked: number | null }; volumesOf(p: unknown): StanceVolumes | null };
    const along = (s: ReturnType<typeof setup>, head: V3): { picked: number | null; page: boolean } => {
      const room = s.room as unknown as Picker, b = s.room.player(2)!;
      const eye: V3 = [s.feet(2)[0] - 60, head[1], head[2]], dir: V3 = [1, 0, 0];
      const page = rayBody(eye, dir, 600, bodyVolumes(s.feet(2), s.yaw(2), b.sim.walker.posture, room.volumesOf(b), b.sim.walker.rootTilt.q, b.sim.moves!.peeking())) !== null;
      return { picked: room.orderPick(1, dir, undefined, eye).picked, page };
    };
    const s = setup(skeletons);
    s.buttons.set(2, Button.LeanRight);
    s.drive(60);
    expect(s.room.player(2)!.sim.moves!.peeking()).toBe(1);
    const leaned = along(s, leanHead(s)), upright = along(s, idleHead(s));
    expect(leaned).toEqual({ picked: 2, page: true });         // the leaned head blocks the line
    expect(upright).toEqual({ picked: null, page: false });    // the idle head's place is open: the hostage behind is exposed
    const t = setup(skeletons);
    t.drive(60);
    expect(t.room.player(2)!.sim.moves!.peeking()).toBe(0);
    expect(along(t, leanHead(t))).toEqual({ picked: null, page: false });
    expect(along(t, idleHead(t))).toEqual({ picked: 2, page: true });
  });
});
