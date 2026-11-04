import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import {
  Button, encodeCommands, groundGrid, groundPolygons, MoverSim, packGround, PROTOCOL_VERSION, quantiseCommand, Traversal, Walker, type Command, type SimMap,
} from '../../viewer/src/sim';
import { rotateByQuat, worldToBody } from '../../viewer/src/rootTilt';
import { aimPitchLimitsOf } from '../../viewer/src/net/lookGate';
import { headPoint } from '../../viewer/src/net/shotCone';
import { Room, type Conn } from '../src/room';

/**
 * PRONE-TILT in the room (research 217 s7; reading, pending review): the room's seat is a `Walker` run by its `MoverSim`
 * on the commands, and `FUN_00548090`'s root tilt runs in the Walker's tick -- so a page's Walker given the same commands
 * from the same spot gives the same tilt, tick for tick (A = B). A synthetic 20-degree slope, uphill toward -z.
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const RAD = (20 * Math.PI) / 180;
const NORMAL = [0, Math.cos(RAD), Math.sin(RAD)] as const;
const slopeY = (x: number, z: number): number => -(NORMAL[0] * x + NORMAL[2] * z) / NORMAL[1];
function slopeMap(extra: WorldPoly[] = []): SimMap {
  const corners = [[-1000, 1000], [1000, 1000], [1000, -1000], [-1000, -1000]] as const;
  const slope: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/slope', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from(corners.flatMap(([x, z]) => [x, slopeY(x, z), z])),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/slope0', first: 0, count: 1 },
    ...extra.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i + 1}`, first: i + 1, count: 1 }))];
  const ground = packGround(PARAMS, [slope, ...extra], owners);
  const slot = (side: 0 | 1, x: number, z: number): SpawnSlot => ({
    side, index: 0, position: [x, slopeY(x, z), z], onFloor: true, step: 2, facing: [0, -1], loc: { map: 0, x: 0, z: 0 },
  });
  return { stem: 'MP99', name: 'SLOPE', ground, grid: groundGrid(ground), spawns: null, slots: [slot(0, 0, 0), slot(1, 300, 0)], respawns: [], notes: [] };
}

class Client implements Conn {
  send(): void {}
  close(): void {}
}

const deg = (a: readonly number[], b: readonly number[]): number =>
  (Math.acos(Math.min(1, (a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) / (Math.hypot(...a) * Math.hypot(...b)))) * 180) / Math.PI;

describe('PRONE-TILT: the room\'s seat and a page\'s Walker on the same commands give the same root tilt (A = B)', () => {
  it('prone on a 20-degree slope, crawling and turning: the same quaternion every command, settling on the floor\'s normal', () => {
    const map = slopeMap();
    const room = new Room(map, null, { now: () => 0, random: () => 0.5, launchCountdownS: 0 }, null, null);
    room.hello(1, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: '', map: 'MP99' });
    room.step();
    const p = room.player(1)!;
    const at = [40, slopeY(40, 0) + 5, 0] as const;
    p.sim.walker.place(at[0], at[1], at[2]);
    p.sim.walker.state.yaw = 0;
    // the page's mover as the room's own (`Room.newSim`): a Walker and the traversal moves on the map's ground
    const grid = groundGrid(map.ground);
    const page = new MoverSim(new Walker(grid), new Traversal(grid, groundPolygons(map.ground)));
    page.walker.place(at[0], at[1], at[2]);
    page.walker.state.yaw = 0;
    let seq = p.sim.seq;
    page.seq = seq;
    let tilted = 0;
    for (let i = 0; i < 480; i++) {
      const cmd: Command = quantiseCommand({
        seq: ++seq, forward: i >= 200 && i < 260 ? 1 : 0, right: 0, yaw: i >= 300 ? Math.min(i - 300, 40) * 0.5 : 0, pitch: 0, turn: 0,
        buttons: i === 10 ? Button.Stance : 0, stance: i === 10 ? 2 : 0, weapon: 0,
      });                                                          // the wire's own values, as the page sends them
      room.binary(1, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
      room.step();
      page.apply(cmd);
      const r = p.sim.walker, w = page.walker;
      expect([r.state.x, r.state.y, r.state.z, r.state.yaw, r.posture], `command ${i}`).toEqual([w.state.x, w.state.y, w.state.z, w.state.yaw, w.posture]);
      expect(r.rootTilt, `command ${i}`).toEqual(w.rootTilt);
      if (r.rootTilt.q && Math.abs(r.rootTilt.q[3]) < 0.999) tilted++;
    }
    const r = p.sim.walker;
    expect(r.posture).toBe('prone');
    expect(tilted).toBeGreaterThan(200);
    expect(deg(r.rootTilt.up, worldToBody(r.state.yaw, NORMAL))).toBeLessThan(1e-3);
    expect(deg(rotateByQuat(r.rootTilt.q!, [0, 1, 0]), [0, 1, 0])).toBeCloseTo(20, 3);
  });
});

describe('PRONE-TILT-2 (1): the prone aim limits lean the same in the room and on the page (A = B)', () => {
  it('prone on the 20-degree slope, turning from uphill to downhill: the same leaned limits and the same pitch every command', () => {
    const map = slopeMap();
    const room = new Room(map, null, { now: () => 0, random: () => 0.5, launchCountdownS: 0 }, null, null);
    room.hello(1, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: '', map: 'MP99' });
    room.step();
    const p = room.player(1)!;
    const at = [40, slopeY(40, 0) + 5, 0] as const;
    p.sim.walker.place(at[0], at[1], at[2]);
    p.sim.walker.state.yaw = 0;
    const grid = groundGrid(map.ground);
    const page = new MoverSim(new Walker(grid), new Traversal(grid, groundPolygons(map.ground)));
    page.walker.place(at[0], at[1], at[2]);
    page.walker.state.yaw = 0;
    let seq = p.sim.seq;
    page.seq = seq;
    let uphill: [number, number] | null = null, downhill: [number, number] | null = null;
    for (let i = 0; i < 700; i++) {
      // prone at 10; pitch up to 40 (past the level pair's 25) and back down to -10; then a slow half turn to face downhill.
      // P13 (AR-5): the way down ramps on to -10 (was: a 10.5 degree step at 300, inside the gate's allowance only while
      // the rifle's kick rode an unscoped command).
      const yaw = i >= 300 ? Math.min((i - 300) * 0.5, 180) : 0;
      const pitch = i < 120 ? 0 : i < 220 ? Math.min((i - 120) * 0.6, 40) : Math.max(40 - (i - 220) * 0.5, -10);
      const cmd: Command = quantiseCommand({
        seq: ++seq, forward: 0, right: 0, yaw, pitch, turn: 0,
        buttons: i === 10 ? Button.Stance : 0, stance: i === 10 ? 2 : 0, weapon: 0,
      });
      room.binary(1, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
      room.step();
      page.apply(cmd);
      const r = p.sim.walker, w = page.walker;
      expect(aimPitchLimitsOf(r), `command ${i}`).toEqual(aimPitchLimitsOf(w));
      expect([r.state.yaw, r.state.pitch], `command ${i}`).toEqual([w.state.yaw, w.state.pitch]);
      if (i === 200) uphill = aimPitchLimitsOf(r);
      if (i === 699) downhill = aimPitchLimitsOf(r);
    }
    expect(p.sim.walker.posture).toBe('prone');
    expect(uphill![0]).toBeCloseTo(-20 + 20, 3);
    expect(uphill![1]).toBeCloseTo(25 + 20, 3);
    expect(downhill![0]).toBeCloseTo(-20 - 20, 3);
    expect(downhill![1]).toBeCloseTo(25 - 20, 3);
  });
});

describe("PRONE-TILT-2 (2): the prone eye on the slope, the room's head and the page's (A = B)", () => {
  it("prone on the 20-degree slope: the room's frame carries the saved normal's y and its head is the page's from the same walker", () => {
    const map = slopeMap();
    const room = new Room(map, null, { now: () => 0, random: () => 0.5, launchCountdownS: 0 }, null, null);
    room.hello(1, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: '', map: 'MP99' });
    room.step();
    const p = room.player(1)!;
    const at = [40, slopeY(40, 0) + 5, 0] as const;
    p.sim.walker.place(at[0], at[1], at[2]);
    p.sim.walker.state.yaw = 0;
    const grid = groundGrid(map.ground);
    const page = new MoverSim(new Walker(grid), new Traversal(grid, groundPolygons(map.ground)));
    page.walker.place(at[0], at[1], at[2]);
    page.walker.state.yaw = 0;
    let seq = p.sim.seq;
    page.seq = seq;
    for (let i = 0; i < 120; i++) {
      const cmd: Command = quantiseCommand({
        seq: ++seq, forward: i >= 60 && i < 90 ? 1 : 0, right: 0, yaw: 0, pitch: 0, turn: 0,
        buttons: i === 10 ? Button.Stance : 0, stance: i === 10 ? 2 : 0, weapon: 0,
      });
      room.binary(1, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
      room.step();
      page.apply(cmd);
      const f = p.cone.frame(cmd.seq)!;
      const w = page.walker, s = w.state;
      expect(f.groundNormalY, `command ${i}`).toBe(w.floorNormal[1]);
      const pageHead = headPoint({ feet: [s.x, s.y, s.z], yaw: s.yaw, posture: w.posture, moveRoot: page.moves?.rootY() ?? null, peek: page.moves?.peek() ?? 0, groundNormalY: w.floorNormal[1] });
      expect(headPoint(f), `command ${i}`).toEqual(pageHead);
    }
    const f = p.cone.frame(seq)!;
    expect(f.posture).toBe('prone');
    expect(f.groundNormalY).toBeCloseTo(NORMAL[1], 6);
    const flat = headPoint({ ...f, groundNormalY: 1 });
    expect(headPoint(f)[1] - flat[1]).toBeCloseTo(3.6 / NORMAL[1] - 3.6, 3);
  });
});

describe("PRONE-TILT-2 (3): the prone low line tilted, the room's seat and the page's mover cross the same fin (A = B)", () => {
  it("crawling up the 20-degree slope to a fin 1.5 over the ground: the same position every command, and both crawl over it", () => {
    const finY = slopeY(40, -40);
    const fin: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/fin', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-100, finY - 1, -40, 200, finY - 1, -40, 200, finY + 1.5, -40, -100, finY + 1.5, -40]),
    };
    const map = slopeMap([fin]);
    const room = new Room(map, null, { now: () => 0, random: () => 0.5, launchCountdownS: 0 }, null, null);
    room.hello(1, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: '', map: 'MP99' });
    room.step();
    const p = room.player(1)!;
    const at = [40, slopeY(40, 0) + 5, 0] as const;
    p.sim.walker.place(at[0], at[1], at[2]);
    p.sim.walker.state.yaw = 0;
    const grid = groundGrid(map.ground);
    const page = new MoverSim(new Walker(grid), new Traversal(grid, groundPolygons(map.ground)));
    page.walker.place(at[0], at[1], at[2]);
    page.walker.state.yaw = 0;
    let seq = p.sim.seq;
    page.seq = seq;
    for (let i = 0; i < 900; i++) {
      const cmd: Command = quantiseCommand({
        seq: ++seq, forward: i >= 100 ? 1 : 0, right: 0, yaw: 0, pitch: 0, turn: 0,
        buttons: i === 10 ? Button.Stance : 0, stance: i === 10 ? 2 : 0, weapon: 0,
      });
      room.binary(1, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
      room.step();
      page.apply(cmd);
      const r = p.sim.walker, w = page.walker;
      expect([r.state.x, r.state.y, r.state.z, r.posture], `command ${i}`).toEqual([w.state.x, w.state.y, w.state.z, w.posture]);
    }
    expect(p.sim.walker.posture).toBe('prone');
    expect(p.sim.walker.state.z).toBeLessThan(-50);                                // over the fin, as the tilted line lets it
  });
});

describe("PRONE-TILT-2 (4): a dead body knocked on the slope, the room's seat and the page's mover (A = B)", () => {
  it("knocked high: the same root tilt every command through the fall in the air (its 0.8 / 0.99 window)", () => {
    const map = slopeMap();
    const room = new Room(map, null, { now: () => 0, random: () => 0.5, launchCountdownS: 0 }, null, null);
    room.hello(1, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: '', map: 'MP99' });
    room.step();
    const p = room.player(1)!;
    const at = [40, slopeY(40, 0) + 5, 0] as const;
    p.sim.walker.place(at[0], at[1], at[2]);
    p.sim.walker.state.yaw = 0;
    const grid = groundGrid(map.ground);
    const page = new MoverSim(new Walker(grid), new Traversal(grid, groundPolygons(map.ground)));
    page.walker.place(at[0], at[1], at[2]);
    page.walker.state.yaw = 0;
    let seq = p.sim.seq;
    page.seq = seq;
    let airWritten = 0;
    for (let i = 0; i < 400; i++) {
      if (i === 5) {
        p.sim.walker.dead = true; page.walker.dead = true;          // the room's walker made dead, as its kill does
        p.sim.walker.knock([0, 260, 0], 'fallForward'); page.walker.knock([0, 260, 0], 'fallForward');
      }
      const cmd: Command = quantiseCommand({ seq: ++seq, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 });
      room.binary(1, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
      room.step();
      page.apply(cmd);
      const r = p.sim.walker, w = page.walker;
      if (i > 5 && !r.airborne && !w.airborne) break;                // the landing: the room's fall damage is its own
      expect([r.state.x, r.state.y, r.state.z, r.airborne], `command ${i}`).toEqual([w.state.x, w.state.y, w.state.z, w.airborne]);
      expect(r.rootTilt, `command ${i}`).toEqual(w.rootTilt);
      if (r.airborne && r.rootTilt.q) airWritten++;
    }
    expect(airWritten).toBeGreaterThan(5);
  });
});
