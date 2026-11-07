// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { CollisionOwner, EffectProgram, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { FlyCamera } from '../src/camera';
import type { DoorSpec } from '../src/doors';
import { flinchCutWindow } from '../src/net/flinchReload';
import type { PlayClips } from '../src/play';
import { flinchPose } from '../src/remotePlayers';
import { encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, simClipsFromBytes, TICK_HZ, type ServerEvent, type SimMap } from '../src/sim';
import { TICK, WalkMode, type WalkInput } from '../src/walk';
import { Room } from '../../match/src/room';

/**
 * The door-open body hold, page against room (PTW.R3; research 92 section 2, "The body under the door clip"): the page's
 * own `WalkMode` sends its commands to a `Room` running the same map, the room pushes `Open door` on the presser and holds
 * its mover's body for the window, and the page hears the room's `motion` event a round trip late -- `pushHeard` runs the
 * commands since again under the window. After it, and on every command after, the page's feet are the room's: nothing
 * for the reconcile to pull back. The disc's clips (the tracked `MOTION_P.ZAR` and `READERC.ZAR`): `seal_open_door`'s
 * root keys move both bodies alike.
 */

const PACK = fixture('RUN/MOTION_P.ZAR'), READERC = fixture('RUN/READERC.ZAR');
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const DOOR_PROGRAM: EffectProgram = {
  name: 'singleDoor_test', root: 0, flags: 0xa2, nodes: ['NA'],
  sequences: [{ name: 'seq_0', activation: 1, ops: [
    { op: 'aiAnimate', type: 63, prewait: 0, postwait: 0.25, blocking: false, select: 0 },
    { op: 'valve', valve: '', operation: 0x0b, operand: 1, context: true },
  ] }],
};
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];

function doorMap(): SimMap {
  const ground = packGround(PARAMS, [FLOOR], OWNERS);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  const door: DoorSpec = {
    index: 0, node: 'door1', path: 'worldmodel/door1', valve: 'door1', range: 2000, elevation: -1, programs: [DOOR_PROGRAM],
    local: IDENTITY, parent: IDENTITY, owners: [], sweep: { minX: -10, minZ: -10, maxX: 10, maxZ: 10 },
  };
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [], doors: [door] };
}

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
  return c;
};
const made: WalkMode[] = [];
afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });

describe.skipIf(!PACK || !READERC)(`the page and the room agree on the held body${PACK && READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  for (const late of [0, 6, 15]) {
    it(`the event heard ${late} commands after it was sent: the page's feet are the room's on every command after the re-run`, () => {
      const sim = simClipsFromBytes(PACK!, READERC!);
      const clips: PlayClips = { clips: sim.clips, table: sim.table ? [...sim.table.entries()] : null };
      let now = 0;
      const room = new Room(doorMap(), sim, { now: () => now, random: () => 0.5, launchCountdownS: 0 });
      const events: ServerEvent[] = [];
      room.hello(1, { send: (f) => { if (typeof f === 'string') events.push(JSON.parse(f) as ServerEvent); }, close: () => undefined },
        { type: 'hello', version: PROTOCOL_VERSION, name: 'p1', map: 'MP99' }, '');
      room.step();
      const p = room.player(1)!;
      const at = p.sim.walker.state;
      // The page stood where the room stood it, facing as it does; its commands to the room, one a room step.
      const fly = new FlyCamera(canvas());
      fly.setScale(0.1);
      const stick: { v: WalkInput } = { v: { forward: 0, right: 0, boost: false } };
      (fly as unknown as { groundWish: () => WalkInput }).groundWish = () => stick.v;
      const page = new WalkMode(fly, () => undefined);
      made.push(page);
      page.setGround(packGround(PARAMS, [FLOOR], OWNERS), null);
      page.setActionRoots(sim.roots);
      const pageFeet = new Map<number, [number, number, number]>(), roomFeet = new Map<number, [number, number, number]>();
      let seq = p.sim.seq;
      page.setNetTap((cmd) => {
        const s = ++seq;
        room.binary(1, encodeCommands({ viewTick: room.tick, commands: [{ ...cmd, seq: s }] }));
        now += 1000 / TICK_HZ;
        room.step();
        roomFeet.set(s, [p.sim.walker.state.x, p.sim.walker.state.y, p.sim.walker.state.z]);
      }, seq);
      expect(page.respawn([at.x, at.y, at.z], at.yaw)).toBe(true);
      const frame = (): void => {
        page.frame(TICK);
        const f = page.feet()!;
        pageFeet.set(seq, [f[0], f[1], f[2]]);
      };
      for (let k = 0; k < 10; k++) frame();
      // The press: the door event names the last command sent, as `DoorPage.action` does; the room pushes a frame on.
      room.text(1, { type: 'door', seq, door: 0 } as never);
      stick.v = { forward: 1, right: 0, boost: false };
      let motion: Extract<ServerEvent, { type: 'motion' }> | null = null;
      for (let k = 0; k < 10 && !motion; k++) { frame(); motion = events.find((e): e is Extract<ServerEvent, { type: 'motion' }> => e.type === 'motion') ?? null; }
      expect(motion).not.toBeNull();
      expect(motion!.from).toBeGreaterThan(0);
      for (let k = 0; k < late; k++) frame();                       // the round trip: the page walks on meanwhile
      const cut = flinchCutWindow(motion!, motion!.clip, clips);
      page.setFlinchPose(() => flinchPose(motion!.clip, 0, clips), cut, { reloadGate: false, pushed: true, clip: motion!.clip });
      const replayed: number[] = [];
      page.pushHeard(cut, (after) => replayed.push(after));
      if (motion!.from! <= seq) expect(replayed).toEqual([motion!.from! - 1]);
      const now0 = page.feet()!, room0 = roomFeet.get(seq)!;
      expect(now0[0]).toBeCloseTo(room0[0], 3);
      expect(now0[2]).toBeCloseTo(room0[2], 3);
      // The window and past it: command for command, the page's feet are the room's.
      for (let k = 0; k < 60; k++) {
        frame();
        const a = pageFeet.get(seq)!, b = roomFeet.get(seq)!;
        expect(a[0], `command ${seq}`).toBeCloseTo(b[0], 3);
        expect(a[2], `command ${seq}`).toBeCloseTo(b[2], 3);
      }
      // And the body was held: from the push to the cut it moved by the clip's root alone (a run is ~0.35 a command).
      const pushAt = roomFeet.get(motion!.from! - 1)!, cutAt = roomFeet.get(cut!.cutFrom! - 1)!;
      expect(Math.hypot(cutAt[0] - pushAt[0], cutAt[2] - pushAt[2])).toBeLessThan(6);
      const after = roomFeet.get(seq)!;
      expect(Math.hypot(after[0] - cutAt[0], after[2] - cutAt[2])).toBeGreaterThan(5);
    });
  }
});
