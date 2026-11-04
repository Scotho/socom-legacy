import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import {
  Button, cameraLook, centreClaim, encodeCommands, EYE_HEIGHT, faceToward, groundGrid, packGround, PROTOCOL_VERSION, readMotionTable,
  STANCE_CODES, type ClientEvent, type Command, type ServerEvent, type SimClips, type SimMap,
} from '../../viewer/src/sim';
import { fireCapability } from '../../viewer/src/net/fireCapability';
import { GATE_MOTION_RECORDS } from '../../viewer/test/helpers/gateTable';
import { Room, type Conn } from '../src/room';

/**
 * PF-17 in the room (research 194 A02, 218 s1; ruling PF.R36): the fire's permission is recorded at each command
 * (`AimFrame.fire`, from `fireCapability` on the room's own mover after the command ran) and a round is refused
 * `'nofire'` against the frame of the command it names -- never the body's present. On `room.test.ts`'s synthetic floor
 * with `motion.rdr`'s records for the clips in play (`GATE_MOTION_RECORDS`, the disc's values, pinned against the fixture
 * by `motionTable.test.ts`); no pack (the mover's clocks are `ACTION_CLIPS`').
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};
function flatMap(): SimMap {
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(PARAMS, [FLOOR], owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [] };
}

const TABLE = readMotionTable(GATE_MOTION_RECORDS);
const CLIPS: SimClips = { clips: [], table: TABLE, roots: new Map() };

class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void {}
}

type V3 = [number, number, number];
type Fire = Extract<ClientEvent, { type: 'fire' }>;

/** A room with two players seated and launched; player 1 the shooter, looking at a point 200 ahead. */
function duel() {
  let seed = 1;
  const room = new Room(flatMap(), CLIPS, { now: () => 0, random: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }, launchCountdownS: 0 }, null, null);
  for (const id of [1, 2]) room.hello(id, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: '', map: 'MP99' }, `10.0.0.${id}`);
  room.step();
  const p = room.player(1)!;
  p.sim.walker.place(0, 20, 0);
  let seq = p.sim.seq;
  let look = { yaw: p.sim.walker.state.yaw, pitch: 0 };
  const point: V3 = [0, 12, -200];
  /** One command run (with `extra` laid over the look). */
  const run = (n = 1, extra: Partial<Command> = {}): void => {
    for (let i = 0; i < n; i++) {
      const cmd: Command = { seq: ++seq, forward: 0, right: 0, ...look, turn: 0, buttons: 0, stance: 0, weapon: 0, ...extra };
      room.binary(1, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
      room.step();
    }
  };
  const feet = (): V3 => { const s = p.sim.walker.state; return [s.x, s.y, s.z]; };
  // The facing staged as the room would set it (`allowSnap`, as roomHostageOrderEye does): an instant turn toward the
  // point is past the stick's law, and LATER 14's grace no longer lays a new mover's far look as given.
  const face = (): void => { look = faceToward({ feet: feet(), posture: p.sim.walker.posture }, point); p.sim.allowSnap(); run(2); };
  /** The page's round named for command `at` (the last run by default), down the cone's centre at the point. */
  const claim = (at = p.sim.seq): Fire => {
    const f = p.cone.frame(at)!;
    const from: V3 = [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]];
    const { eye } = cameraLook(f);
    const c = centreClaim(f, from, Math.hypot(point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]));
    return { type: 'fire', seq: at, from: c.from, dir: c.dir, eye: c.eye, aim: c.aim, weapon: 0, viewTick: room.tick };
  };
  const shoot = (ev: Fire = claim()): void => room.text(1, ev);
  const rounds = (): number => p.mags[0].rounds();
  /** One command carrying the stance press. */
  const press = (stance: 'stand' | 'crouch' | 'prone'): void => run(1, { buttons: Button.Stance, stance: STANCE_CODES.indexOf(stance) });
  return { room, p, run, face, claim, shoot, rounds, press };
}
type Duel = ReturnType<typeof duel>;

/** Runs commands until the body is settled (no action, no hold) in its stance. */
function settle(d: Duel): void {
  for (let i = 0; i < 200 && (d.p.sim.walker.action || d.p.sim.walker.holding || d.p.sim.walker.airborne); i++) d.run(1);
  d.run(12);                                                       // past the rate of any round before
}

describe('the fire permission at the command, in the room (PF-17; PF.R36)', () => {
  it("a round at a command inside stand -> prone is dropped 'nofire' and consumes no round; the first command past crouch -> prone's 0.8 fires", () => {
    const d = duel();
    d.face();
    const before = d.rounds();
    d.press('prone');
    expect(d.p.sim.walker.action?.name).toBe('standToProne');
    expect(d.p.cone.frame(d.p.sim.seq)!.fire).toBe(false);
    d.shoot(); d.run(1);
    expect(d.room.takeDrops()).toEqual({ 'fire: nofire': 1 });
    expect(d.rounds()).toBe(before);
    // Through the rest of the clip: every command refused.
    while (d.p.sim.walker.action?.name === 'standToProne') { d.shoot(); d.run(1); }
    expect(Object.keys(d.room.takeDrops() ?? {})).toEqual(['fire: nofire']);
    expect(d.rounds()).toBe(before);

    // Crouched, then down: the rounds before 0.8 refused, the first command past it takes the round.
    d.press('crouch'); settle(d);
    d.face();
    expect(d.p.sim.walker.stance).toBe('crouch');
    d.press('prone');
    expect(d.p.sim.walker.action?.name).toBe('crouchToProne');
    let refused = 0;
    for (let i = 0; i < 120 && d.rounds() === before; i++) {
      d.shoot(); d.run(1);
      if (d.rounds() === before) refused++;
    }
    expect(d.rounds()).toBe(before - 1);
    const drops = d.room.takeDrops();
    expect(drops).toEqual({ 'fire: nofire': refused });
    const taken = d.p.sim.seq - 1;                                // the round named the command before the last run
    const f = d.p.cone.frame(taken)!, prev = d.p.cone.frame(taken - 1)!;
    expect(f.motion).toMatchObject({ clip: 'seal_crouch2prone', reversed: false });
    expect(f.motion!.phase).toBeGreaterThan(0.8);
    expect(prev.motion!.phase).toBeLessThanOrEqual(0.8);
    expect([f.fire, prev.fire]).toEqual([true, false]);
  });

  it('a round at a command during the jump or the soft landing is taken; during seal_land_hard before 0.3 dropped, after taken', () => {
    const d = duel();
    d.face();
    let left = d.rounds();
    // The standing jump: a round mid-clip is taken.
    d.run(1, { buttons: Button.Jump });
    expect(d.p.sim.walker.action?.name).toBe('jump');
    d.run(10);
    expect(d.p.sim.walker.action?.name).toBe('jump');
    d.shoot(); d.run(1);
    expect(d.rounds()).toBe(--left);
    settle(d);
    // The soft landing: a short drop, the stick at rest -- the landing's own command takes the round.
    d.p.sim.walker.state.y = 6;
    d.p.sim.walker.setAirborne(true);
    for (let i = 0; i < 60 && d.p.sim.walker.action?.name !== 'land'; i++) d.run(1);
    expect(d.p.sim.walker.action?.name).toBe('land');
    d.shoot(); d.run(1);
    expect(d.rounds()).toBe(--left);
    settle(d);
    // The hard landing: refused at its phase 0.3 or under, taken past it while the clip still plays.
    d.p.sim.walker.state.y = 40;
    d.p.sim.walker.setAirborne(true);
    for (let i = 0; i < 90 && d.p.sim.walker.action?.name !== 'landHard'; i++) d.run(1);
    expect(d.p.sim.walker.action?.name).toBe('landHard');
    d.room.takeDrops();
    d.shoot(); d.run(1);
    expect(d.room.takeDrops()).toEqual({ 'fire: nofire': 1 });
    expect(d.rounds()).toBe(left);
    while ((d.p.cone.frame(d.p.sim.seq)!.motion?.phase ?? 1) <= 0.3) d.run(1);
    expect(d.p.sim.walker.action?.name).toBe('landHard');
    d.shoot(); d.run(1);
    expect(d.room.takeDrops()).toBeNull();
    expect(d.rounds()).toBe(--left);
    expect(d.p.alive).toBe(true);
  });

  it('the permission is the command\'s, not the present: a round named for a command before the transition, arriving after it began, is taken (PF.R36)', () => {
    const d = duel();
    d.face();
    const before = d.rounds();
    const early = d.claim();                                       // standing, still: the command's frame allows it
    d.press('prone');
    d.run(1);
    expect(d.p.sim.walker.action?.name).toBe('standToProne');
    expect(fireCapability(d.p.sim.walker, d.p.sim.moves, false, TABLE).fire).toBe(false);   // the present refuses
    d.shoot(early); d.run(1);
    expect(d.room.takeDrops()).toBeNull();
    expect(d.rounds()).toBe(before - 1);
    // And the other way: a round named for a command under crouch -> prone's 0.8, arriving once the body is past it.
    settle(d);
    d.press('crouch'); settle(d);
    d.face();
    d.press('prone');
    while (!(d.p.cone.frame(d.p.sim.seq)!.motion!.phase > 0.75)) d.run(1);
    const late = d.claim();
    expect(d.p.cone.frame(late.seq)!.fire).toBe(false);
    d.run(3);                                                      // 3 commands on: inside FIRE_ARRIVAL_JITTER_TICKS
    expect(fireCapability(d.p.sim.walker, d.p.sim.moves, false, TABLE).fire).toBe(true);     // the present allows
    d.shoot(late); d.run(1);
    expect(d.room.takeDrops()).toEqual({ 'fire: nofire': 1 });
    expect(d.rounds()).toBe(before - 1);
  });
});
