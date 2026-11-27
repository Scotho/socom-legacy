import { describe, expect, it } from 'vitest';
import type { CollisionOwner, EffectOp, EffectProgram, GridParams, WorldPoly } from '@s2u/scene';
import { leadIns } from '../../viewer/src/gates';
import {
  ACTION_TYPE_CODES, bareMeta, decodeSnapshot, encodeCommands, faceToward, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ,
  type Command, type GateSpec, type MapAction, type ServerEvent, type SimMap,
} from '../../viewer/src/sim';
import { Room, type Conn } from '../src/room';

/**
 * LATER 1381 (research 174 s5.1, 175 s5.3; reading, pending review): the lever gate's slide in the room starts after the
 * handle's 0.5 s turn, not at the 0.24 s wait. The program in the disc's shape (all four MP11 / MP62 lever programs,
 * both branches; `gateLever.devdisc.test.ts`): the presser's `ai::ANIMATE` (type 281, waits 0 / 0), the lever's valve,
 * `WAIT` 0.24, `.SWITCH_SMALL` at `gatehand`, `gatehand`'s `OBJECT_MOTION_FROM_TO` (flags 96, 0.5 s), then
 * `IF set_access1 == 0` / `CALL_SEQUENCE gateopen` (the 3 s slide). The stepper holds the sequence on a timed command
 * until its time has passed (the tick 0x260520 r0004, the dispatcher 0x26b2b0, the stepper 0x26a970;
 * D:L114896-114903, D:L115199-115211); `gatehand` resolves beneath `lever_N` (pilot/kill/keyjob-307-f1-reread.md s2).
 * The capture (LEVER-1381-PC3b, r0004, 3 pulls on Death Trap gate 2, read by a fresh reader): the leaf's first step
 * at 0.817-0.834 s after the release, the first tick at or after ~0.807 s; the lever free ~3.77 s after the program's
 * start (the turn ends at 0.773 s + the 3.00 s slide).
 */

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
type Q = [number, number, number, number];
const Q0: Q = [0, 0, 0, 1];
const Q1: Q = [-0.7660444378852844, 0, 0, 0.6427876353263855];

function program(valve: string, delta: [number, number, number]): EffectProgram {
  const slide = (to: [number, number, number]): EffectOp => ({
    op: 'fromTo', node: 2, flags: 9, seconds: 3, from: [1, 1, 1], to: [1, 1, 1],
    translation: { from: null, to, rate: to.map((v) => v / 3) as [number, number, number] },
  });
  const turn = (from: Q, to: Q): EffectOp => ({ op: 'fromTo', node: 1, flags: 96, seconds: 0.5, from: [0, 0, 0], to: [0, 0, 0], rotation: { from, to } });
  const presser: EffectOp = { op: 'aiAnimate', type: 281, prewait: 0, postwait: 0, blocking: false, select: 0 };
  const wait: EffectOp = { op: 'wait', seconds: 0.24, range: 0, frames: null };
  const click: EffectOp = { op: 'sound', sound: '.SWITCH_SMALL', node: 1, volume: 1, flags: 130, newPlay: true };
  const free: EffectOp = { op: 'if', conditions: [{ kind: 'valve', valve: 'set_access1', operation: 2, operand: 0 }] };
  const neg: [number, number, number] = [-delta[0], -delta[1], -delta[2]];
  return {
    name: 'gate_openclose1', root: 0, flags: 0, nodes: ['lever_1', 'gatehand', 'gate_move1'],
    sequences: [
      { name: 'main', activation: 1, ops: [
        { op: 'if', conditions: [{ kind: 'valve', valve, operation: 2, operand: 0, context: true }] },
        presser, { op: 'valve', valve, operation: 0x0b, operand: 1, context: true }, wait, click, turn(Q0, Q1),
        free, { op: 'callSequence', sequence: 'gateopen' }, { op: 'endif' },
        { op: 'else' },
        presser, { op: 'valve', valve, operation: 0x0b, operand: 0, context: true }, wait, click, turn(Q1, Q0),
        free, { op: 'callSequence', sequence: 'gateclose' }, { op: 'endif' },
        { op: 'endif' },
      ] },
      { name: 'gateopen', activation: 2, ops: [slide(delta)] },
      { name: 'gateclose', activation: 2, ops: [slide(neg)] },
    ],
  };
}

function gateMap(): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, 1000, 1000, 0, 1000, 1000, 0, -1000, -1000, 0, -1000]),
  };
  const panel: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/epanel_di1', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([2, 8, 25, 2, 20, 25, 6, 20, 25, 6, 8, 25]),
  };
  const gate: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/access1/gate_move1', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([0, 0, 40, 0, 30, 40, 8, 30, 40, 8, 0, 40]),
  };
  const sweep = { minX: -40, maxX: 40, minZ: 0, maxZ: 80 };
  const owners: CollisionOwner[] = [
    { modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 },
    { modelName: 'worldmodel', path: panel.path, first: 1, count: 1 },
    { modelName: 'worldmodel', path: gate.path, first: 2, count: 1, sweep },
  ];
  const ground = packGround(params, [floor, panel, gate], owners);
  const delta: [number, number, number] = [-20, 0, 0];
  const lever: MapAction = {
    node: 'epanel_di1', type: 'SWITCH', typeCode: ACTION_TYPE_CODES.SWITCH!, valve: 'gate1', anims: ['gate_openclose1'],
    team: null, range: 30, elevation: -1, points: 0, bitmap: 'action_pull_lever.tif', path: 'worldmodel/epanel_di1', at: [4, 12, 25],
  };
  const hand = { node: 1, path: 'worldmodel/lever_1/gateswitch=gateswitch/gatehand', local: IDENTITY, parent: IDENTITY };
  const gates: GateSpec[] = [{
    index: 0, node: 'gate_move1', path: gate.path, local: IDENTITY, parent: IDENTITY, owners: [2], sweep, open: delta, seconds: 3,
    levers: [{ action: 0, node: lever.node, path: lever.path, valve: 'gate1', program: program('gate1', delta), handles: [hand] }],
  }];
  const slot = (side: 0 | 1, index: number, x: number, z: number) => ({
    side, index, position: [x, 0, z] as [number, number, number], onFloor: true, step: side === 0 ? 2 : 6,
    facing: (side === 0 ? [1, 0] : [-1, 0]) as [number, number], loc: { map: 0, x: 0, z: 0 },
  });
  return {
    stem: 'MP11', name: 'DEATH TRAP', ground, grid: groundGrid(ground), spawns: null,
    slots: [slot(0, 0, -400, 0), slot(1, 0, 400, 0)], respawns: [], doors: [], gates, notes: [],
    meta: { ...bareMeta('MP11'), actions: [lever] },
  };
}

class Client implements Conn {
  readonly events: ServerEvent[] = [];
  readonly frames: Uint8Array[] = [];
  send(frame: Uint8Array | string): void {
    if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent);
    else this.frames.push(frame);
  }
  close(): void {}
  last() { return decodeSnapshot(this.frames[this.frames.length - 1]!); }
}

const POINT: [number, number, number] = [4, 12, 25];

function setup() {
  let now = 0;
  const room = new Room(gateMap(), null, { now: () => now, random: () => 0.5, launchCountdownS: 0, roundSeconds: 60 });
  const c = new Client();
  room.hello(1, c, { type: 'hello', version: PROTOCOL_VERSION, name: '', map: 'MP11' }, '192.0.2.1');
  const step = (n = 1): void => { for (let i = 0; i < n; i++) { now += 1000 / TICK_HZ; room.step(); } };
  step(2);
  room.player(1)!.sim.walker.place(4, 0, 10);
  step(5);
  /** The pull: the look command, a tick, then the `action` event -- taken there (the release, as the room acts on it). */
  const press = (): void => {
    const p = room.player(1)!;
    const feet: [number, number, number] = [p.sim.walker.state.x, p.sim.walker.state.y, p.sim.walker.state.z];
    const look = faceToward({ feet, posture: p.sim.walker.posture }, POINT);
    p.sim.allowSnap();
    const command: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: look.yaw, pitch: look.pitch, turn: 0, buttons: 0, stance: 0, weapon: 0 };
    room.binary(1, encodeCommands({ viewTick: room.tick, commands: [command] }));
    step(1);
    room.text(1, { type: 'action', seq: p.sim.seq, action: 0, surface: { path: 'worldmodel/epanel_di1', point: POINT } });
  };
  return { room, c, step, press };
}

/** The capture's window for the leaf's first step after the release (LEVER-1381-PC3b: observed 0.817-0.834 s). */
const FIRST_AT = 0.807;

describe('LATER 1381: the lever gate slides after the handle\'s turn (the room)', () => {
  it("the slide's first moving tick: after ~0.807 s from the release (the turn held), not at the 0.24 s wait", () => {
    const { room, step, press } = setup();
    press();
    expect(room.takeDrops()).toBeNull();
    let first: number | null = null;
    for (let k = 1; k <= 120 && first === null; k++) {
      step(1);
      if (room.gates.offset(0)[0] !== 0) first = k / TICK_HZ;
    }
    expect(first).not.toBeNull();
    expect(first!).toBeGreaterThanOrEqual(FIRST_AT);
    // The r0004 capture (LEVER-1381-PC3b) puts the leaf's first step at 0.817-0.834 s after the release; the port's is
    // room tick 50 at 60 Hz, 0.8333 s, inside that window. LATER 1426 (research 89 s1.1; reading, pending review) took one
    // of the two room ticks it stood at before (51, 0.850 s): the shared runner's WAIT now accrues from its begin tick and
    // hands its leftover on, and the 0.5 s turn's end is the exact rule's (WAIT_EQUALITY_HOLD_READING), no float edge. The
    // tick left above the ideal 0.8167 s is leverHold's own presser arm (gates.ts): it counts game frames of 525/15734 s
    // against the 1/60 room tick, two frames end ~67 us after tick 4, so it ends on tick 5 (the doors' counting, PF.R8).
    expect(first!).toBeCloseTo(50 / TICK_HZ, 9);
  });

  it("the lever is busy until the program's end (the slide's 3 s after the turn), then a pull is taken", () => {
    const { room, step, press } = setup();
    press();
    expect(room.takeDrops()).toBeNull();
    step(Math.round(3.7 * TICK_HZ) - 1);                          // 3.7 s after the release: the slide still running
    expect(room.gates.busy(0)).toBe(true);
    press();
    expect(room.takeDrops()).toEqual({ 'action: busy': 1 });
    step(Math.round(0.3 * TICK_HZ));                              // ~4.0 s: the program run out
    expect(room.gates.busy(0)).toBe(false);
    expect(room.gates.offset(0)).toEqual([-20, 0, 0]);
    press();
    expect(room.takeDrops()).toBeNull();
  });

  it("P8's lead-in follows the room: the dry run's open and close lead-ins are the room's, past the turn", () => {
    const map = gateMap();
    const g = map.gates![0]!;
    const [open, close] = leadIns(g, g.levers[0]!);
    expect(open!).toBeGreaterThan(0.24 + 0.5);
    expect(close!).toBeCloseTo(open!, 6);
    const { room, step, press } = setup();
    press();
    let begun: number | null = null;
    for (let k = 1; k <= 120 && begun === null; k++) {
      step(1);
      if (room.gates.wire()[0]!.phase < 255) begun = k / TICK_HZ;
    }
    expect(Math.abs(begun! - open!)).toBeLessThanOrEqual(1 / TICK_HZ + 1e-9);
  });
});
