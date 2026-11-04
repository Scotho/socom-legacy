import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { CollisionOwner, EffectProgram, GridParams, WorldPoly } from '@s2u/scene';
import { CAM_FAR, headEye, localCamera, toWorld } from '../../viewer/src/cameraRig';
import { rootY, type Stance } from '../../viewer/src/mover';
import { headPoint } from '../../viewer/src/net/shotCone';
import {
  ACTION_TYPE_CODES, aimPick, bareMeta, decodeSnapshot, encodeCommands, faceToward, groundGrid, groundPolygons, packGround, PROTOCOL_VERSION, TICK_HZ,
  type Command, type DoorSpec, type GateSpec, type MapAction, type ServerEvent, type SimMap,
} from '../../viewer/src/sim';
import type { ClientEvent } from '../../viewer/src/net/protocol';
import { Room, type Conn } from '../src/room';

/**
 * MAP-07 in the room: two players see one lever gate slide, a player out of range is refused, a second pull closes
 * it, and `set_access1` keeps a later pull from moving it. The door wire stays the head of the snapshot.
 */

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** The lever program the audits describe: flip, wait 0.24 s, slide only while `set_access1` is 0. */
function program(valve: string, delta: [number, number, number]): EffectProgram {
  const slide = (to: [number, number, number]) => ({
    op: 'fromTo' as const, node: 1, flags: 9, seconds: 3, from: [1, 1, 1] as [number, number, number], to: [1, 1, 1] as [number, number, number],
    translation: { from: null, to, rate: to.map((v) => v / 3) as [number, number, number] },
  });
  const neg: [number, number, number] = [-delta[0], -delta[1], -delta[2]];
  return {
    name: 'gate_openclose1', root: 0, flags: 0, nodes: ['gatehand', 'gate_move1'],
    sequences: [
      { name: 'main', activation: 1, ops: [
        { op: 'if', conditions: [{ kind: 'valve', valve, operation: 2, operand: 0, context: true }] },
        { op: 'valve', valve, operation: 0x0b, operand: 1, context: true },
        { op: 'wait', seconds: 0.24, range: 0, frames: null },
        { op: 'if', conditions: [{ kind: 'valve', valve: 'set_access1', operation: 2, operand: 0 }] },
        { op: 'callSequence', sequence: 'gateopen' },
        { op: 'endif' },
        { op: 'else' },
        { op: 'valve', valve, operation: 0x0b, operand: 0, context: true },
        { op: 'wait', seconds: 0.24, range: 0, frames: null },
        { op: 'if', conditions: [{ kind: 'valve', valve: 'set_access1', operation: 2, operand: 0 }] },
        { op: 'callSequence', sequence: 'gateclose' },
        { op: 'endif' },
        { op: 'endif' },
      ] },
      { name: 'gateopen', activation: 2, ops: [slide(delta)] },
      { name: 'gateclose', activation: 2, ops: [slide(neg)] },
    ],
  };
}

function gateMap(extra: WorldPoly[] = []): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
  };
  const panel: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/epanel_di1', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    // Normal toward the stand at z 10. The action ray keeps a face only from the front.
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
  if (extra.length > 0) owners.push({ modelName: 'worldmodel', path: extra[0]!.path, first: 3, count: extra.length });
  const ground = packGround(params, [floor, panel, gate, ...extra], owners);
  const delta: [number, number, number] = [-20, 0, 0];
  const lever: MapAction = {
    node: 'epanel_di1', type: 'SWITCH', typeCode: ACTION_TYPE_CODES.SWITCH!, valve: 'gate1', anims: ['gate_openclose1'],
    team: null, range: 30, elevation: -1, points: 0, bitmap: 'action_pull_lever.tif',
    path: 'worldmodel/epanel_di1', at: [4, 12, 25],
  };
  const gates: GateSpec[] = [{
    index: 0, node: 'gate_move1', path: gate.path, local: IDENTITY, parent: IDENTITY, owners: [2], sweep,
    open: delta, seconds: 3,
    levers: [{ action: 0, node: lever.node, path: lever.path, valve: 'gate1', program: program('gate1', delta) }],
  }];
  const doors: DoorSpec[] = [{
    index: 0, node: 'door_1', path: 'worldmodel/door_1', valve: 'door_1_valve', range: 30, elevation: -1,
    programs: [], local: IDENTITY, parent: IDENTITY, owners: [], sweep: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
  }];
  const slot = (side: 0 | 1, index: number, x: number, z: number) => ({
    side, index, position: [x, 0, z] as [number, number, number], onFloor: true, step: side === 0 ? 2 : 6,
    facing: (side === 0 ? [1, 0] : [-1, 0]) as [number, number], loc: { map: 0, x: 0, z: 0 },
  });
  return {
    stem: 'MP11', name: 'DEATH TRAP', ground, grid: groundGrid(ground), spawns: null,
    slots: [slot(0, 0, -400, 0), slot(1, 0, 400, 0)], respawns: [], doors, gates, notes: [],
    meta: { ...bareMeta('MP11'), actions: extra.length > 0 ? [lever, { ...lever, valve: 'other', anims: [] }] : [lever] },
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

function setup(extra: WorldPoly[] = []) {
  let now = 0;
  const room = new Room(gateMap(extra), null, { now: () => now, random: () => 0.5, launchCountdownS: 0, roundSeconds: 60 });
  const join = (id: number): Client => {
    const c = new Client();
    room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: '', map: 'MP11' }, `10.0.0.${id}`);
    return c;
  };
  return { room, join, step(n = 1) { for (let i = 0; i < n; i++) { now += 1000 / TICK_HZ; room.step(); } } };
}

const POINT: [number, number, number] = [4, 12, 25];
const STAND: Stance = 'stand';
const FEET: [number, number, number] = [4, 0, 10];

function rayFar(eye: readonly number[], point: readonly number[]): [number, number, number] {
  const d = [point[0]! - eye[0]!, point[1]! - eye[1]!, point[2]! - eye[2]!];
  const n = Math.hypot(d[0]!, d[1]!, d[2]!) || 1;
  return [eye[0]! + (d[0]! / n) * CAM_FAR, eye[1]! + (d[1]! / n) * CAM_FAR, eye[2]! + (d[2]! / n) * CAM_FAR];
}

function standCam(): { head: [number, number, number]; cam: [number, number, number] } {
  const look = faceToward({ feet: FEET, posture: STAND }, POINT);
  const head = headEye(null, FEET, headPoint({ feet: FEET, yaw: look.yaw, posture: STAND, moveRoot: null, peek: 0 }), () => true);
  const cam = toWorld(FEET, look.yaw, localCamera(rootY(STAND), look.pitch, 0).eye);
  return { head, cam };
}

function rayX(from: readonly number[], z: number): number {
  const dz = POINT[2] - from[2]!;
  return from[0]! + (POINT[0] - from[0]!) * ((z - from[2]!) / dz);
}

function strip(path: string, x: number, z: number, half: number): WorldPoly {
  return {
    modelName: 'worldmodel', path, region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    // Normal toward -z, the side the stand looks from. A back face would not block the action ray.
    points: Float32Array.from([x - half, 0.5, z, x - half, 40, z, x + half, 40, z, x + half, 0.5, z]),
  };
}

/** A thin jamb on the head's line and the back-axis camera's, clear of a camera shifted 0.8 on X. */
function centerJamb(): WorldPoly {
  const { head, cam } = standCam();
  const z = head[2] + Math.sign(POINT[2] - head[2]) * 0.8;
  const x = (rayX(head, z) + rayX(cam, z)) / 2;
  const side = rayX([cam[0] + 0.8, cam[1], cam[2]], z);
  const sep = Math.abs(side - x);
  if (sep < 0.2) throw new Error(`side ray only ${sep} off the jamb`);
  return strip('worldmodel/jamb', x, z, Math.min(0.06, sep * 0.25));
}

function promptEye(p: NonNullable<ReturnType<Room['player']>>): [number, number, number] {
  const f = p.cone.frame(p.sim.seq);
  if (!f) throw new Error('no aim frame');
  const cam = toWorld(f.feet, f.yaw, localCamera(f.moveRoot ?? rootY(f.posture), f.pitch, f.peek).eye);
  return [cam[0] + 0.8, cam[1], cam[2]];
}

/**
 * A face sitting on the head's line to the panel and off the third-person camera's. The prompt is the camera's hit, so
 * it would be showing; the head's line is the one the room used to refuse the first press (MP11 gate1).
 */
function headLip(): WorldPoly {
  const feet: [number, number, number] = [4, 0, 10];
  const look = faceToward({ feet, posture: STAND }, POINT);
  const head = headEye(null, feet, headPoint({ feet, yaw: look.yaw, posture: STAND, moveRoot: null, peek: 0 }), () => true);
  const cam = toWorld(feet, look.yaw, localCamera(rootY(STAND), look.pitch, 0).eye);
  const sample = (from: readonly number[], z: number): [number, number] | null => {
    const dz = POINT[2] - from[2]!;
    if (Math.abs(dz) < 1e-6) return null;
    const t = (z - from[2]!) / dz;
    if (t <= 0.02 || t >= 0.98) return null;
    return [from[0]! + (POINT[0] - from[0]!) * t, from[1]! + (POINT[1] - from[1]!) * t];
  };
  let best: { z: number; x: number; y: number; gap: number } | null = null;
  const z0 = Math.min(head[2]!, POINT[2]), z1 = Math.max(head[2]!, POINT[2]);
  for (let z = z0 + 0.3; z < z1 - 0.3; z += 0.25) {
    const h = sample(head, z), c = sample(cam, z);
    if (!h || !c) continue;
    const gap = Math.hypot(h[0] - c[0], h[1] - c[1]);
    if (!best || gap > best.gap) best = { z, x: h[0], y: h[1], gap };
  }
  if (!best || best.gap < 1.2) throw new Error(`head and camera stay within ${best?.gap ?? 0} of each other`);
  const s = 0.45;
  const { x, y, z } = best;
  return {
    modelName: 'worldmodel', path: 'worldmodel/lip', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([x - s, y - s, z, x + s, y - s, z, x + s, y + s, z, x - s, y + s, z]),
  };
}

describe('lever gates in the room (MAP-07)', () => {
  it('devKill marks the local seat dead and refuses an unknown or already-dead id', () => {
    const { room, join, step } = setup();
    expect(room.devKill(9)).toBe(false);
    join(1);
    step(2);
    expect(room.player(1)?.alive).toBe(true);
    expect(room.devKill(1)).toBe(true);
    expect(room.player(1)?.alive).toBe(false);
    expect(room.devKill(1)).toBe(false);
  });

  it("devKill is a dev instrument no client event reaches: the protocol dispatch (text, binary) never calls it, no room method does, and only the page's ?devmode hook does", () => {
    // A source pin (product track; research 174 §5.1, the dev instruments): the room's members that read the wire are
    // `binary` (command and voice frames) and `text` (every `ClientEvent`); the instrument is called from neither, nor
    // from any other room method, so no event a client sends ends a seat through it.
    const PACKAGES = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    const roomSource = readFileSync(join(PACKAGES, 'match/src/room.ts'), 'utf8');
    const member = (src: string, signature: string): string => {
      const at = src.indexOf(signature);
      if (at < 0) throw new Error(`no ${signature.trim()} in room.ts`);
      const end = src.indexOf('\n  }\n', at);
      return src.slice(at, end < 0 ? undefined : end);
    };
    /** Every call of the instrument in a source: `devKill(` not at its own definition. */
    const calls = (src: string): number => (src.match(/\.devKill\(/g) ?? []).length;
    for (const sig of ['  binary(id: number, bytes: Uint8Array): boolean {', '  text(id: number, raw: ClientEvent): void {']) {
      expect(member(roomSource, sig), sig.trim()).not.toMatch(/devKill/);
    }
    expect(roomSource.match(/devKill/g), 'room.ts names it at its definition only').toHaveLength(1);
    expect(roomSource).toMatch(/\n {2}devKill\(id: number\): boolean \{/);
    // The pin bites: the same reads over a dispatch that did call it.
    const doctored = roomSource.replace('    switch (ev.type) {\n', '    if (ev.type === \'kill\') this.devKill(id);\n    switch (ev.type) {\n');
    expect(doctored).not.toBe(roomSource);
    expect(member(doctored, '  text(id: number, raw: ClientEvent): void {')).toMatch(/devKill/);
    // Outside the room: one caller in every package's sources, the page's `__viewer.kill`, inside its `DEV.tools` block.
    const sources = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (name === 'node_modules' || name === 'dist') return [];
      return statSync(p).isDirectory() ? sources(p) : /\.(ts|tsx|js|mjs)$/.test(name) ? [p] : [];
    });
    const callers = readdirSync(PACKAGES).flatMap((pkg) => {
      const src = join(PACKAGES, pkg, 'src');
      try { if (!statSync(src).isDirectory()) return []; } catch { return []; }
      return sources(src).filter((f) => calls(readFileSync(f, 'utf8')) > 0).map((f) => relative(PACKAGES, f).replace(/\\/g, '/'));
    });
    expect(callers).toEqual(['viewer/src/main.ts']);
    const main = readFileSync(join(PACKAGES, 'viewer/src/main.ts'), 'utf8');
    expect(calls(main)).toBe(1);
    const call = main.indexOf('.devKill(');
    const open = main.lastIndexOf('...(DEV.tools ? {', call);
    expect(open, 'inside the DEV.tools block').toBeGreaterThan(0);
    expect(main.slice(open, call)).not.toContain('} : {})');
  });

  it('both players see the slide, a far pull is refused, the next pull closes, and a destroyed gate stays shut', () => {
    const { room, join, step } = setup();
    const a = join(1), b = join(2);
    step(2);
    room.player(1)!.sim.walker.place(4, 0, 10);
    room.player(2)!.sim.walker.place(4, 0, 400);
    step(5);
    const press = (id: number): void => {
      const p = room.player(id)!;
      const feet: [number, number, number] = [p.sim.walker.state.x, p.sim.walker.state.y, p.sim.walker.state.z];
      const look = faceToward({ feet, posture: p.sim.walker.posture }, POINT);
      p.sim.allowSnap();
      const command: Command = {
        seq: p.sim.seq + 1, forward: 0, right: 0, yaw: look.yaw, pitch: look.pitch, turn: 0, buttons: 0, stance: 0, weapon: 0,
      };
      room.binary(id, encodeCommands({ viewTick: room.tick, commands: [command] }));
      step(1);
      room.text(id, { type: 'action', seq: p.sim.seq, action: 0, surface: { path: 'worldmodel/epanel_di1', point: POINT } });
    };
    expect(a.last().doors).toEqual([{ valve: 0, phase: 255 }, { valve: 0, phase: 255 }]);
    press(2);
    expect(room.takeDrops()).toEqual({ 'action: reach': 1 });
    expect(b.last().doors![1]).toEqual({ valve: 0, phase: 255 });
    press(1);
    step(10);
    expect(a.last().doors![0]).toEqual({ valve: 0, phase: 255 });
    expect(a.last().doors![1]).toEqual({ valve: 0, phase: 255 });
    step(95);
    const mid = b.last().doors![1]!;
    expect(mid.valve).toBe(1);
    expect(mid.phase).toBeGreaterThan(0);
    expect(mid.phase).toBeLessThan(255);
    expect(a.last().doors![1]).toEqual(mid);
    step(100);
    expect(a.last().doors).toEqual([{ valve: 0, phase: 255 }, { valve: 1, phase: 255 }]);
    expect(b.last().doors).toEqual(a.last().doors);
    const pts = groundPolygons(room.map.ground)[2]!.points;
    const gx = (): number[] => [0, 3, 6, 9].map((i) => pts[i]!);
    expect(gx().map((x) => Math.round(x))).toEqual([-20, -20, -12, -12]);
    press(1);
    step(210);
    expect(a.last().doors![1]).toEqual({ valve: 0, phase: 255 });
    expect(gx().map((x) => Math.round(x * 100) / 100)).toEqual([0, 0, 8, 8]);
    room.world.setValve('set_access1', 1);
    press(1);
    step(210);
    expect(room.gates.offset(0)).toEqual([0, 0, 0]);
    expect(room.gates.valve('gate1')).toBe(1);
    expect(a.last().doors![1]).toEqual({ valve: 0, phase: 255 });
  });

  it('a pull while the lever runs is dropped busy and the gate opens to its end (FUN_002b44e0 D:L156787)', () => {
    const { room, join, step } = setup();
    const a = join(1);
    step(2);
    room.player(1)!.sim.walker.place(4, 0, 10);
    step(5);
    const press = (): void => {
      const p = room.player(1)!;
      const feet: [number, number, number] = [p.sim.walker.state.x, p.sim.walker.state.y, p.sim.walker.state.z];
      const look = faceToward({ feet, posture: p.sim.walker.posture }, POINT);
      p.sim.allowSnap();
      const command: Command = {
        seq: p.sim.seq + 1, forward: 0, right: 0, yaw: look.yaw, pitch: look.pitch, turn: 0, buttons: 0, stance: 0, weapon: 0,
      };
      room.binary(1, encodeCommands({ viewTick: room.tick, commands: [command] }));
      step(1);
      room.text(1, { type: 'action', seq: p.sim.seq, action: 0, surface: { path: 'worldmodel/epanel_di1', point: POINT } });
    };
    press();
    expect(room.takeDrops()).toBeNull();
    step(90);                                                     // 1.5 s: past the 0.24 s lead-in, mid-slide
    expect(a.last().doors![1]!.phase).toBeLessThan(255);
    press();
    expect(room.takeDrops()).toEqual({ 'action: busy': 1 });
    step(150);
    expect(a.last().doors![1]).toEqual({ valve: 1, phase: 255 });
    expect(room.gates.offset(0)).toEqual([-20, 0, 0]);
  });

  it("the close's log names the pull that ran, not a refused press in its lead-in", () => {
    const { room, join, step } = setup();
    join(1); join(2);
    step(2);
    room.player(1)!.sim.walker.place(4, 0, 10);
    room.player(2)!.sim.walker.place(5, 0, 10);
    step(5);
    const press = (id: number): void => {
      const p = room.player(id)!;
      const feet: [number, number, number] = [p.sim.walker.state.x, p.sim.walker.state.y, p.sim.walker.state.z];
      const look = faceToward({ feet, posture: p.sim.walker.posture }, POINT);
      p.sim.allowSnap();
      const command: Command = {
        seq: p.sim.seq + 1, forward: 0, right: 0, yaw: look.yaw, pitch: look.pitch, turn: 0, buttons: 0, stance: 0, weapon: 0,
      };
      room.binary(id, encodeCommands({ viewTick: room.tick, commands: [command] }));
      step(1);
      room.text(id, { type: 'action', seq: p.sim.seq, action: 0, surface: { path: 'worldmodel/epanel_di1', point: POINT } });
    };
    press(1);
    step(240);                                                    // open, at rest
    expect(room.takeDrops()).toBeNull();
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'info').mockImplementation((line: unknown) => { lines.push(String(line)); });
    try {
      press(1);                                                   // the close
      press(2);                                                   // refused: the lever's program runs
      expect(room.takeDrops()).toEqual({ 'action: busy': 1 });
      step(30);
    } finally {
      spy.mockRestore();
    }
    expect(lines.filter((l) => l.startsWith('[gate]'))).toEqual([expect.stringMatching(/closing: use action 0 by 1 /)]);
  });

  /**
   * A5 (the merge controller's call; LATER 139): a gate lever takes every switch's line (`c4Line`): the head's line to
   * the point must be clear (PF.R18, `walled`), and the point must be the node's first hit from the head or from the
   * camera's eye at the command (`orderOrigin`), that eye counted only where the command's look passed through the point
   * (`cone.lookAt`; `missed`). No page-sent eye: an `eye` on the event is not read. PR #427 had let a gate through on
   * the camera's own line when the head's was walled; that goes.
   */
  const pressAt = (room: Room, step: (n?: number) => void, opts: { pitchOff?: number; eye?: [number, number, number] } = {}): number => {
    const p = room.player(1)!;
    const feet: [number, number, number] = [p.sim.walker.state.x, p.sim.walker.state.y, p.sim.walker.state.z];
    const look = faceToward({ feet, posture: p.sim.walker.posture }, POINT);
    p.sim.allowSnap();
    const command: Command = {
      seq: p.sim.seq + 1, forward: 0, right: 0, yaw: look.yaw, pitch: look.pitch + (opts.pitchOff ?? 0), turn: 0, buttons: 0, stance: 0, weapon: 0,
    };
    room.binary(1, encodeCommands({ viewTick: room.tick, commands: [command] }));
    step(1);
    const seq = room.player(1)!.sim.seq;
    const eye = opts.eye === undefined ? {} : { eye: opts.eye };
    room.text(1, { type: 'action', seq, action: 0, surface: { path: 'worldmodel/epanel_di1', point: POINT }, ...eye } as ClientEvent);
    return seq;
  };

  it("A5 0: nothing between, the command looking at the lever: taken", () => {
    const { room, join, step } = setup();
    join(1);
    step(2);
    room.player(1)!.sim.walker.place(FEET[0], FEET[1], FEET[2]);
    step(5);
    const seq = pressAt(room, step);
    expect(room.player(1)!.cone.lookAt(seq, POINT)).toBe(true);
    expect(room.takeDrops()).toBeNull();
    expect(room.gates.valve('gate1')).toBe(1);
  });

  it("A5 1: the head's line walled, the command looking at the lever: refused walled -- the camera's eye does not rescue it", () => {
    const { room, join, step } = setup([headLip()]);
    join(1);
    step(2);
    room.player(1)!.sim.walker.place(FEET[0], FEET[1], FEET[2]);
    step(5);
    const seq = pressAt(room, step);
    expect(room.player(1)!.cone.lookAt(seq, POINT)).toBe(true);
    expect(room.takeDrops()).toEqual({ 'action: walled': 1 });
    expect(room.gates.valve('gate1')).toBe(0);
  });

  it("A5 2: the head walled, the command looking 35 degrees above the lever: refused walled, the camera's eye not taken", () => {
    const { room, join, step } = setup([headLip()]);
    join(1);
    step(2);
    room.player(1)!.sim.walker.place(FEET[0], FEET[1], FEET[2]);
    step(5);
    const seq = pressAt(room, step, { pitchOff: 35 });
    expect(room.player(1)!.cone.lookAt(seq, POINT)).toBe(false);
    expect(room.takeDrops()).toEqual({ 'action: walled': 1 });
    expect(room.gates.valve('gate1')).toBe(0);
  });

  it('A5 3: an eye the page sends is not read -- the same refused press with a trusted eye that sees the lever stays walled', () => {
    const { room, join, step } = setup([headLip()]);
    join(1);
    step(2);
    room.player(1)!.sim.walker.place(FEET[0], FEET[1], FEET[2]);
    step(5);
    // The page's eye this command could have had (0.8 off the camera), whose ray meets the panel.
    pressAt(room, step, { pitchOff: 35 });
    expect(room.takeDrops()).toEqual({ 'action: walled': 1 });
    const eye = promptEye(room.player(1)!);
    expect(aimPick(room.map.grid, eye, rayFar(eye, POINT), '')?.path).toBe('worldmodel/epanel_di1');
    const seq = pressAt(room, step, { pitchOff: 35, eye });
    expect(room.player(1)!.cone.lookAt(seq, POINT)).toBe(false);
    expect(room.takeDrops()).toEqual({ 'action: walled': 1 });
    expect(room.gates.valve('gate1')).toBe(0);
  });

  it("A5 4 (MP11 gate1's stand): the head's line and the camera's both walled, the look on the lever: refused walled by the head's line, not by lookAt", () => {
    // `lookAt` holds; the drop is c4Line's head-line test (PF.R18), which no camera eye relaxes -- not the first-hit test.
    const { room, join, step } = setup([centerJamb()]);
    join(1);
    step(2);
    room.player(1)!.sim.walker.place(FEET[0], FEET[1], FEET[2]);
    step(5);
    const seq = pressAt(room, step);
    expect(room.player(1)!.cone.lookAt(seq, POINT)).toBe(true);
    expect(room.takeDrops()).toEqual({ 'action: walled': 1 });
    expect(room.gates.valve('gate1')).toBe(0);
  });
});
