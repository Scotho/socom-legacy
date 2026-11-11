import { describe, expect, it } from 'vitest';
import {
  decodeCommands, decodeSnapshot, encodeCommands, encodeSnapshot, FEET_RANGE, FEET_STEP, feetOriginOf, frameKind, quantiseCommand,
} from '../src/net/codec';
import { bodyOf, snapshotOf } from '../src/net/body';
import { ACTION_CODES, BodyFlag, bodyHoldBits, bodyHoldOf, Button, Frame, PROTOCOL_VERSION, type BodyState, type Command } from '../src/net/protocol';
import { ACTION_CLIPS, HOLD_CODES, moverSnapshot, Walker, type MoverActionName } from '../src/mover';
import { buildGrid, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { TRAVERSAL_CLIPS } from '../src/traversal';

/** The wire (web sprint 3, M3): what goes in comes out, to the quantisers' steps; a snapshot's size is as budgeted. */

let seed = 7;
const rand = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const between = (lo: number, hi: number): number => lo + rand() * (hi - lo);

function command(seq: number): Command {
  return {
    seq, forward: between(-1, 1), right: between(-1, 1), yaw: between(-720, 720), pitch: between(-90, 90), turn: between(-8, 8),
    buttons: Math.floor(rand() * 1024), stance: Math.floor(rand() * 3), weapon: Math.floor(rand() * 2),
  };
}

function body(id: number): BodyState {
  return {
    id, feet: [between(-4000, 4000), between(-200, 800), between(-4000, 4000)], yaw: between(0, 360), pitch: between(-60, 60),
    vx: between(-100, 100), vy: between(-240, 80), vz: between(-100, 100), flags: Math.floor(rand() * 1024),
    stance: Math.floor(rand() * 3), landing: Math.floor(rand() * 4), jumps: Math.floor(rand() * 256), ground: Math.floor(rand() * 4),
    groundForward: between(-1, 1), groundRight: between(-1, 1), groundCls: Math.floor(rand() * 5) - 1,
    action: Math.floor(rand() * 16), actionSerial: Math.floor(rand() * 256), actionT: between(0, 3), actionSeconds: rand() < 0.3 ? -1 : between(0, 3),
    overlay: Math.floor(rand() * 256), overlayT: between(0, 1), overlaySeconds: between(0, 1), turnRate: between(-10, 10),
    trav: Math.floor(rand() * (TRAVERSAL_CLIPS.length + 1)), travFrame: between(0, 60), travRootY: rand() < 0.5 ? Number.NaN : between(0, 20),
    travBlend: Math.floor(rand() * 4), travBlendWeight: rand(), peek: Math.floor(rand() * 3) - 1,
    weapon: Math.floor(rand() * 256), slot: Math.floor(rand() * 2),
  };
}

const angle = (a: number, b: number): number => Math.abs(((a - b) % 360 + 540) % 360 - 180);

describe('the command frame (M3)', () => {
  it('round-trips a batch to the quantisers\' steps, and quantiseCommand is exactly what the server reads', () => {
    for (let trial = 0; trial < 200; trial++) {
      const cmds = [command(trial * 3 + 1), command(trial * 3 + 2), command(trial * 3 + 3)];
      const bytes = encodeCommands({ viewTick: trial * 1.5, commands: cmds });
      expect(frameKind(bytes)).toBe(Frame.Commands);
      expect(bytes.byteLength).toBe(6 + 15 * 3);
      const back = decodeCommands(bytes);
      expect(back.viewTick).toBeCloseTo(trial * 1.5, 3);
      back.commands.forEach((c, i) => {
        const a = cmds[i]!;
        expect(c.seq).toBe(a.seq);
        expect(Math.abs(c.forward - a.forward)).toBeLessThanOrEqual(0.5 / 127 + 1e-12);
        expect(angle(c.yaw, a.yaw)).toBeLessThanOrEqual(360 / 65536);
        expect(Math.abs(c.pitch - a.pitch)).toBeLessThanOrEqual(0.005 + 1e-9);
        expect([c.buttons, c.stance, c.weapon]).toEqual([a.buttons, a.stance, a.weapon]);
        expect(c).toEqual(quantiseCommand(a));
      });
    }
  });

  it('carries every button bit', () => {
    const all = Object.values(Button).reduce((a, b) => a | b, 0);
    const back = decodeCommands(encodeCommands({ viewTick: 0, commands: [{ ...command(1), buttons: all }] }));
    expect(back.commands[0]!.buttons).toBe(all);
  });
});

describe('the snapshot frame (M3; protocol 11, NET-WIRE)', () => {
  const facing = { yaw: 123.456, pitch: -7.25 };
  it('round-trips the own state exactly (float32, its facing too) and every body to its steps, 52 bytes a body (protocol 11)', () => {
    for (let trial = 0; trial < 50; trial++) {
      const bodies = Array.from({ length: 15 }, (_, i) => body(i + 1));
      const own = { ack: trial * 7, x: between(-4000, 4000), y: between(0, 500), z: between(-4000, 4000), vx: 1.5, vy: -3.25, vz: 0, facing };
      const bytes = encodeSnapshot({ tick: 1000 + trial, own, bodies });
      // Protocol 11: the frame type, the tick, the sections, the feet's origin (3 x i16); the own state with its facing;
      // 52 bytes a body (the feet i16, the flags u32); the door count; no environment (none named).
      expect(bytes.byteLength).toBe(1 + 4 + 1 + 6 + 36 + 1 + 52 * 15 + 1);
      const back = decodeSnapshot(bytes);
      expect(back.tick).toBe(1000 + trial);
      expect(back.own!.ack).toBe(own.ack);
      expect(back.own!.x).toBe(Math.fround(own.x));
      expect(back.own!.facing).toEqual({ yaw: Math.fround(facing.yaw), pitch: Math.fround(facing.pitch) });
      expect(back.env).toBeUndefined();
      back.bodies.forEach((b, i) => {
        const a = bodies[i]!;
        for (let k = 0; k < 3; k++) expect(Math.abs(b.feet[k]! - a.feet[k]!)).toBeLessThanOrEqual(FEET_STEP / 2 + 1e-9);
        expect(angle(b.yaw, a.yaw)).toBeLessThanOrEqual(360 / 65536);
        expect(Math.abs(b.vy - a.vy)).toBeLessThanOrEqual(1 / 128 + 1e-9);
        expect([b.flags, b.stance, b.landing, b.ground, b.jumps, b.action, b.actionSerial, b.overlay, b.trav, b.travBlend, b.peek, b.weapon, b.slot, b.groundCls])
          .toEqual([a.flags, a.stance, a.landing, a.ground, a.jumps, a.action, a.actionSerial, a.overlay, a.trav, a.travBlend, a.peek, a.weapon, a.slot, a.groundCls]);
        expect(Math.abs(b.actionT - a.actionT)).toBeLessThanOrEqual(0.0005 + 1e-9);
        if (a.actionSeconds < 0) expect(b.actionSeconds).toBe(-1);
        expect(Number.isNaN(b.travRootY)).toBe(Number.isNaN(a.travRootY));
      });
    }
  });

  // Protocol 11 (NET-WIRE, research 224): 6 bytes of header more (the feet's origin), 8 of own state more (its facing), 4 a
  // body fewer (the feet 12 -> 6, the flags 2 -> 4); the environment only when the room names it (its revision changed).
  // Protocol 10 measured 884 / 890 / 890 here.
  it("the budget re-measured: 15 bodies, Frostfire's three doors, the environment only when named", () => {
    const bodies = Array.from({ length: 15 }, (_, i) => ({ ...body(i + 1), weapon: [54, 15, 62, 57, 255][i % 5]!, slot: i % 2 }));
    const own = { ack: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, facing: { yaw: 0, pitch: 0 } };
    const doors = [{ valve: 0, phase: 255 }, { valve: 1, phase: 0 }, { valve: 0, phase: 9 }];
    expect(encodeSnapshot({ tick: 1, own, bodies }).byteLength).toBe(830);
    expect(encodeSnapshot({ tick: 1, own, bodies, doors }).byteLength).toBe(836);
    expect(encodeSnapshot({ tick: 1, own, bodies, doors, env: { revision: 41, epoch: 3, states: [] } }).byteLength).toBe(844);
    const back = decodeSnapshot(encodeSnapshot({ tick: 1, own, bodies }));
    expect(back.bodies.map((b) => [b.weapon, b.slot])).toEqual(bodies.map((b) => [b.weapon, b.slot]));
    // bodyOf / snapshotOf: the server's held item and slot to the wire and back to the animator's extras.
    const sim = snapshotOf(back.bodies[2]!);
    expect([sim.weapon, sim.item]).toEqual([0, 62]);
    expect(PROTOCOL_VERSION).toBe(15);                           // PROTO-15's bump (V19.R10: the mover's rules); 14 ER-2's, 13 PLANT-AIM's, 12 SEP-POP's; this part unchanged
  });

  it('a spectator\'s snapshot has no own state (and no environment unless one is named)', () => {
    const back = decodeSnapshot(encodeSnapshot({ tick: 5, own: null, bodies: [] }));
    expect(back).toEqual({ tick: 5, own: null, bodies: [] });
  });

  it('carries the doors, two bytes each, after the bodies (protocol 2)', () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(2);         // 3 added the scope and the hold bits (moverHold.test.ts)
    const doors = [{ valve: 0, phase: 255 }, { valve: 1, phase: 17 }, { valve: 1, phase: 255 }];
    const plain = encodeSnapshot({ tick: 5, own: null, bodies: [body(1)] });
    const bytes = encodeSnapshot({ tick: 5, own: null, bodies: [body(1)], doors });
    expect(bytes.length - plain.length).toBe(6);
    expect(decodeSnapshot(bytes).doors).toEqual(doors);
    // Out of range values are clamped to the byte, not wrapped.
    expect(decodeSnapshot(encodeSnapshot({ tick: 5, own: null, bodies: [], doors: [{ valve: 300, phase: -4 }] })).doors).toEqual([{ valve: 255, phase: 0 }]);
    expect(() => decodeSnapshot(bytes.subarray(0, bytes.length - 1))).toThrow();
  });

  it('protocol 11: the environment rides only a snapshot that names it (the room sends it when its revision changed), after the doors', () => {
    expect(PROTOCOL_VERSION).toBe(15);                           // PROTO-15's bump (V19.R10: the mover's rules); 14 ER-2's, 13 PLANT-AIM's, 12 SEP-POP's; this part unchanged
    const doors = [{ valve: 1, phase: 255 }, { valve: 0, phase: 7 }];
    const env = { revision: 70_000, epoch: 3, states: [{ id: 2, active: true }, { id: 513, active: false }] };
    const bare = encodeSnapshot({ tick: 5, own: null, bodies: [body(1)], doors });
    const bytes = encodeSnapshot({ tick: 5, own: null, bodies: [body(1)], doors, env });
    // u32 revision, u16 epoch, u16 count, then u16 id + u8 state an instance: 8 bytes, 3 more an instance -- only when named.
    expect(bytes.length - bare.length).toBe(8 + 2 * 3);
    expect(bytes[5]! & 2).toBe(2);                                // the sections byte: bit 1, the environment
    expect(bare[5]! & 2).toBe(0);
    const at = bytes.length - (8 + 2 * 3);
    expect(Array.from(bytes.subarray(at - 4, at))).toEqual([1, 255, 0, 7]);                 // the doors just before it
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect([v.getUint32(at, true), v.getUint16(at + 4, true), v.getUint16(at + 6, true)]).toEqual([70_000, 3, 2]);
    expect([v.getUint16(at + 8, true), v.getUint8(at + 10), v.getUint16(at + 11, true), v.getUint8(at + 13)]).toEqual([2, 1, 513, 0]);
    const back = decodeSnapshot(bytes), backBare = decodeSnapshot(bare);
    expect(back.env).toEqual(env);
    expect(back.doors).toEqual(doors);
    expect(backBare.env).toBeUndefined();
    expect(() => decodeSnapshot(bytes.subarray(0, bytes.length - 1))).toThrow(/too short/);
    expect(() => decodeSnapshot(Uint8Array.from([...bytes, 0]))).toThrow(/trailing/);
    // A section bit this protocol does not know is a frame of another version: refused.
    // Bit 2 (value 4) is Chain Reaction's hooks, and only when the snapshot names them (research 176 §9).
    const odd = Uint8Array.from(bare); odd[5] = odd[5]! | 8;
    expect(() => decodeSnapshot(odd)).toThrow(/sections/);
    // The epoch is the round serial to 16 bits, the revision to 32.
    const wrapped = decodeSnapshot(encodeSnapshot({ tick: 5, own: null, bodies: [], env: { revision: 2 ** 32 + 5, epoch: 65_537, states: [] } }));
    expect([wrapped.env?.revision, wrapped.env?.epoch]).toEqual([5, 1]);
  });

  it('protocol 11: a frame-type byte heads every binary frame -- the snapshot 0, the voice 1 (reserved), the commands 2', () => {
    expect([Frame.Snapshot, Frame.Voice, Frame.Commands]).toEqual([0, 1, 2]);
    expect(frameKind(encodeSnapshot({ tick: 1, own: null, bodies: [] }))).toBe(Frame.Snapshot);
    expect(frameKind(encodeCommands({ viewTick: 0, commands: [command(1)] }))).toBe(Frame.Commands);
    expect(frameKind(new Uint8Array(0))).toBeNull();
    // Each decoder refuses the other's frame, and a protocol 10 snapshot (its kind byte 2 is the commands' now).
    expect(() => decodeSnapshot(encodeCommands({ viewTick: 0, commands: [] }))).toThrow(/not a snapshot/);
    expect(() => decodeCommands(encodeSnapshot({ tick: 1, own: null, bodies: [] }))).toThrow(/not a command/);
    expect(() => decodeSnapshot(Uint8Array.from([Frame.Voice, 0, 0]))).toThrow(/not a snapshot/);
  });

  it('protocol 11: the feet are i16 at 1/8 unit from the frame\'s origin (the room\'s map bounds), 1/16 the worst error, clamped past the range', () => {
    expect(FEET_STEP).toBe(1 / 8);
    expect(FEET_RANGE).toBe(32767 / 8);
    const origin: [number, number, number] = [660, 140, 802];
    const b = { ...body(1), feet: [660 - 4095.99, 140 + 0.03, 802 + 4095.81] as [number, number, number] };
    const bytes = encodeSnapshot({ tick: 1, own: null, bodies: [b] }, origin);
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect([v.getInt16(6, true), v.getInt16(8, true), v.getInt16(10, true)]).toEqual(origin);   // the origin, whole units
    const back = decodeSnapshot(bytes).bodies[0]!;
    expect(back.feet[0]).toBe(660 - FEET_RANGE - 1 / 8);        // -32768 steps: the i16's floor
    expect(back.feet[1]).toBe(140);                              // 0.03 rounds to the origin
    expect(back.feet[2]).toBe(802 + 4095.75);
    // Past the range a foot is clamped to its edge, never wrapped.
    const far = decodeSnapshot(encodeSnapshot({ tick: 1, own: null, bodies: [{ ...b, feet: [660 + 9000, 140 - 9000, 802] }] }, origin)).bodies[0]!;
    expect(far.feet).toEqual([660 + FEET_RANGE, 140 - FEET_RANGE - 1 / 8, 802]);
    // No origin given: the bodies' own bounds' centre, whole units (a replay's snapshot, a test's).
    const free = encodeSnapshot({ tick: 1, own: null, bodies: [{ ...b, feet: [5000, 0, -100] }, { ...b, feet: [5101, 20, 100] }] });
    const fv = new DataView(free.buffer, free.byteOffset, free.byteLength);
    expect([fv.getInt16(6, true), fv.getInt16(8, true), fv.getInt16(10, true)]).toEqual([5051, 10, 0]);
    expect(decodeSnapshot(free).bodies.map((x) => x.feet)).toEqual([[5000, 0, -100], [5101, 20, 100]]);
  });

  it('feetOriginOf: the centre of a hull\'s points\' bounds, whole units', () => {
    expect(feetOriginOf(Float32Array.from([120, 40, 323, 1200, 241, 1280, 600, 100, 700]))).toEqual([660, 141, 802]);
    expect(feetOriginOf(new Float32Array(0))).toEqual([0, 0, 0]);
  });

  it('protocol 11: the flags are a u32 -- bits 0-10 the flags, 11-14 the hold code, 15 the hold serial, room past them -- each bit kept', () => {
    for (const flags of [0x7ff, 0x7800, 0x8000, 0xffff, 1 << 16, 1 << 20, 0x7fffffff, 0xffffffff]) {
      expect(decodeSnapshot(encodeSnapshot({ tick: 1, own: null, bodies: [{ ...body(1), flags }] })).bodies[0]!.flags).toBe(flags >>> 0);
    }    // The equip-anim fix's hold (main 2e392bc8): the code in bits 11-14 and its start parity in bit 15, read back by name.
    for (const clip of HOLD_CODES) {
      const flags = BodyFlag.Alive | BodyFlag.Binoculars | bodyHoldBits(clip) | BodyFlag.HoldSerial;
      const back = decodeSnapshot(encodeSnapshot({ tick: 1, own: null, bodies: [{ ...body(1), flags }] })).bodies[0]!.flags;
      expect([bodyHoldOf(back), back & BodyFlag.HoldSerial, back & 0x7ff]).toEqual([clip, BodyFlag.HoldSerial, BodyFlag.Alive | BodyFlag.Binoculars]);
    }
  });

  it('protocol 11: hostage bodies keep their ids from 240 in the body list (the u8 id, no range reserved)', () => {
    const ids = [1, 16, 48, 239, 240, 241, 242, 255];
    expect(decodeSnapshot(encodeSnapshot({ tick: 1, own: null, bodies: ids.map((id) => body(id)) })).bodies.map((b) => b.id)).toEqual(ids);
  });

  it('refuses a truncated frame', () => {
    const bytes = encodeSnapshot({ tick: 5, own: null, bodies: [body(1)] });
    expect(() => decodeSnapshot(bytes.subarray(0, bytes.length - 3))).toThrow();
  });
});

describe('a body from the mover and back (M3/M5)', () => {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];

  it('carries what the animator reads through a run, a jump and a stance change', () => {
    const w = new Walker(buildGrid(params, [], [], [floor], owners));
    w.place(0, 20, 0);
    let jumps = 0;
    for (let t = 0; t < 180; t++) {
      if (t === 40 && w.jump()) jumps++;
      if (t === 120) w.changeStance('crouch');
      w.tick({ forward: t < 100 ? 1 : 0, right: 0.3, boost: false });
      const s = moverSnapshot(w, null, jumps, 0.5);
      const back = snapshotOf(decodeSnapshot(encodeSnapshot({ tick: t, own: null, bodies: [bodyOf(3, s, { alive: true, weapon: 0, aiming: false, trigger: false, boost: false })] })).bodies[0]!);
      expect(back.stance).toBe(s.stance);
      expect(back.airborne).toBe(s.airborne);
      expect(back.ground.state).toBe(s.ground.state);
      expect(back.ground.cls).toBe(s.ground.cls);
      expect(back.action?.name ?? null).toBe(s.action?.name ?? null);
      expect(back.landing).toBe(s.landing);
      expect(back.jumps).toBe(s.jumps);
      expect(back.alive).toBe(true);
      for (let k = 0; k < 3; k++) expect(Math.abs(back.feet[k]! - s.feet[k]!)).toBeLessThanOrEqual(FEET_STEP / 2 + 1e-9);   // protocol 11: i16 at 1/8
    }
  });

  it("a remote body's snapshot cuts on its replicated ground stick (PAR-64's review F2: the wire carries no pad copy)", () => {
    // `Play.frame` asks `reloadCut` of a remote body's snapshot too (its victory dance, its holds): with no `cutStick` it
    // would cut on the turn alone. The wire's ground stick stands in, as it did before PAR-64.
    const w = new Walker(buildGrid(params, [], [], [floor], owners));
    w.place(0, 20, 0);
    for (let t = 0; t < 30; t++) w.tick({ forward: 1, right: 0, boost: false });
    const s = moverSnapshot(w, null, 0, 0.5);
    const back = snapshotOf(decodeSnapshot(encodeSnapshot({ tick: 30, own: null, bodies: [bodyOf(3, s, { alive: true, weapon: 0, aiming: false, trigger: false, boost: false })] })).bodies[0]!);
    expect(back.cutStick).toEqual({ forward: back.ground.forward, right: back.ground.right });
    expect(back.cutStick!.forward).toBeGreaterThan(0.1);
  });

  // The merge review's item 4: what the other screens draw by -- the posture (C tapped to crouch, held to prone, and back),
  // a jump on a slope, the aim and the trigger (any view from the head is the aim: first person, the scope) -- survives the wire.
  it('carries the stances, a jump on a slope, the aim and the trigger', () => {
    const slope: WorldPoly = { ...floor, points: Float32Array.from([-200, -40, -200, 200, -40, -200, 200, 40, 200, -200, 40, 200]) };
    const w = new Walker(buildGrid(params, [], [], [slope], owners));
    expect(w.place(0, 60, -100)).toBe(true);
    let jumps = 0, sawAir = false, sawProne = false, sawCrouch = false;
    const actions = new Set<string>();
    for (let t = 0; t < 480; t++) {
      if (t === 40 && w.jump()) jumps++;
      if (t === 150) w.changeStance('crouch');
      if (t === 240) w.changeStance('prone');
      if (t === 360) w.changeStance('stand');
      w.tick({ forward: t < 100 ? 1 : 0, right: 0, boost: false });
      const s = moverSnapshot(w, null, jumps, 0.25);
      const extras = { alive: true, weapon: 0 as const, aiming: t % 3 === 0, trigger: t % 5 === 0, boost: false };
      const back = snapshotOf(decodeSnapshot(encodeSnapshot({ tick: t, own: null, bodies: [bodyOf(3, s, extras)] })).bodies[0]!);
      expect(back.stance).toBe(s.stance);
      expect(back.crouched).toBe(s.crouched);
      expect(back.airborne).toBe(s.airborne);
      expect(back.ground.state).toBe(s.ground.state);
      expect(back.action?.name ?? null).toBe(s.action?.name ?? null);
      expect(back.action?.reversed ?? null).toBe(s.action?.reversed ?? null);
      if (s.action && s.action.seconds !== null) expect(back.action!.t).toBeCloseTo(s.action.t, 2);
      expect(back.vy).toBeCloseTo(s.vy, 1);
      expect(back.aiming).toBe(extras.aiming);
      expect(back.trigger).toBe(extras.trigger);
      for (let k = 0; k < 3; k++) expect(Math.abs(back.feet[k]! - s.feet[k]!)).toBeLessThanOrEqual(FEET_STEP / 2 + 1e-9);   // protocol 11: i16 at 1/8
      sawAir ||= s.airborne;
      sawProne ||= s.stance === 'prone';
      sawCrouch ||= s.stance === 'crouch';
      if (s.action) actions.add(s.action.name);
    }
    expect(sawAir && sawProne && sawCrouch).toBe(true);
    expect(actions.has('standToCrouch') && actions.has('crouchToProne')).toBe(true);
  });

  it('knows every action the mover has', () => {
    expect([...ACTION_CODES].sort()).toEqual((Object.keys(ACTION_CLIPS) as MoverActionName[]).concat(['jump', 'launch', 'fall'] as MoverActionName[]).filter((v, i, a) => a.indexOf(v) === i).sort());
  });

  it('carries the blast\'s knock actions in the codes they took (protocol 6)', () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(6);
    const knock = ['fallForward', 'fallBackwards', 'landBackwards', 'getUpBackwards'] as const;
    // Appended after the protocol 5 codes, so the earlier codes keep their bytes.
    const at = ACTION_CODES.indexOf('swapProne') + 1;
    expect(ACTION_CODES.slice(at, at + knock.length)).toEqual([...knock]);
    expect(at).toBe(15);
  });

  it('appends Prone cover after every earlier code: proneCover is code 20, the knock\'s and the earlier codes keep their bytes (PF-19, PF.R38: protocol 10)', () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(10);
    expect(ACTION_CODES.slice(0, 20)).toEqual([                    // PAR-84 appends after it (the test below)
      'jump', 'launch', 'fall', 'land', 'landHard', 'standToCrouch', 'crouchToProne', 'standToProne',
      'hit', 'hitStomach', 'landDeath', 'getUp', 'swapStand', 'swapCrouch', 'swapProne',
      'fallForward', 'fallBackwards', 'landBackwards', 'getUpBackwards', 'proneCover',
    ]);
    expect(ACTION_CODES.indexOf('proneCover') + 1).toBe(20);       // the wire's byte: index + 1
  });

  // PAR-84 (research 230 section 5.2.10, route (a); the online seat's go, 2026-10-14): the launcher's raise and its still
  // lower ride the body's existing action field -- `rifleToLauncher` (`seal_rifle2launcher`) and `pistolToLauncher`
  // (`seal_pistol2launcher`), the still lower the same code with `BodyFlag.ActionReversed`: the pair the original's Push
  // Blend carries, the type and its reverse (`FUN_00588bc0` D:L446408-446416). Appended after `proneCover`, as PF.R38's:
  // no codec field, width or byte changes and no protocol bump; an older page indexes past its table and draws no action.
  it("PAR-84: appends rifleToLauncher (code 21) and pistolToLauncher (22) after proneCover; both round-trip, reversed or not, and the frame's other fields keep their bytes (protocol 11 kept)", () => {
    expect(PROTOCOL_VERSION).toBe(15);                           // PROTO-15's bump (V19.R10: the mover's rules); 14 ER-2's, 13 PLANT-AIM's, 12 SEP-POP's; this part unchanged
    expect(ACTION_CODES.slice(0, 20)).toEqual([
      'jump', 'launch', 'fall', 'land', 'landHard', 'standToCrouch', 'crouchToProne', 'standToProne',
      'hit', 'hitStomach', 'landDeath', 'getUp', 'swapStand', 'swapCrouch', 'swapProne',
      'fallForward', 'fallBackwards', 'landBackwards', 'getUpBackwards', 'proneCover',
    ]);
    expect(ACTION_CODES.indexOf('rifleToLauncher' as MoverActionName) + 1).toBe(21);
    expect(ACTION_CODES.indexOf('pistolToLauncher' as MoverActionName) + 1).toBe(22);
    expect(ACTION_CODES.slice(20, 22)).toEqual(['rifleToLauncher', 'pistolToLauncher']);   // NU-5 appends after them (below)
    const w = new Walker(buildGrid(params, [], [], [floor], owners));
    w.place(0, 20, 0);
    w.tick({ forward: 0, right: 0, boost: false });
    const still = moverSnapshot(w, null, 0, 0.25);
    for (const name of ['rifleToLauncher', 'pistolToLauncher'] as MoverActionName[]) {
      for (const reversed of [false, true]) {
        const s = { ...still, action: { name, serial: 9, t: 0.5, seconds: 1.4155, reversed } };
        const frame = decodeSnapshot(encodeSnapshot({ tick: 40, own: null, bodies: [bodyOf(3, s, { alive: true, weapon: 0, aiming: false, trigger: false, boost: false })] }));
        const b = frame.bodies[0]!, back = snapshotOf(b);
        expect(b.action, `${name} ${reversed}`).toBe(ACTION_CODES.indexOf(name) + 1);
        expect(back.action?.name, `${name} ${reversed}`).toBe(name);
        expect(back.action?.reversed, `${name} ${reversed}`).toBe(reversed);
        expect(back.action?.serial).toBe(9);
        expect(back.action?.t).toBeCloseTo(0.5, 2);
        expect(back.action?.seconds).toBeCloseTo(1.4155, 2);
        expect(back.turnRate).toBeCloseTo(0.25, 2);                      // the fields after the action's read where they were
        expect(back.alive).toBe(true);
      }
    }
  });

  // NU-5 X1 and research 324 P2 (research 323 §1.5; the online seat's terms, relayed 2026-10-14): the pick-up's `Swap
  // rifle` (`seal_swaprifle`) rides the body's existing action field under two codes -- `swapRifleExchange` (the
  // taker's own console only, `FUN_00588bc0` D:L458209-458211; SOLDIER's `Swap rifle` row carries no `network_log`, so
  // no Push Blend: another page drops it, `remoteBodyAction`) and `swapRifleClaim` (every console, `FUN_0059f0c0`
  // D:L458199-458206). Appended after `pistolToLauncher`, as PF.R38's and PAR-84's: protocol 11 kept, no byte moves.
  it("NU-5: appends swapRifleExchange (code 23) and swapRifleClaim (24) after pistolToLauncher; every earlier code keeps its index; both round-trip in the action field (protocol 11 kept)", () => {
    expect(PROTOCOL_VERSION).toBe(15);                           // PROTO-15's bump (V19.R10: the mover's rules); 14 ER-2's, 13 PLANT-AIM's, 12 SEP-POP's; this part unchanged
    expect(ACTION_CODES.slice(0, 22)).toEqual([
      'jump', 'launch', 'fall', 'land', 'landHard', 'standToCrouch', 'crouchToProne', 'standToProne',
      'hit', 'hitStomach', 'landDeath', 'getUp', 'swapStand', 'swapCrouch', 'swapProne',
      'fallForward', 'fallBackwards', 'landBackwards', 'getUpBackwards', 'proneCover', 'rifleToLauncher', 'pistolToLauncher',
    ]);
    expect(ACTION_CODES.indexOf('swapRifleExchange' as MoverActionName) + 1).toBe(23);
    expect(ACTION_CODES.indexOf('swapRifleClaim' as MoverActionName) + 1).toBe(24);
    expect(ACTION_CODES).toHaveLength(24);
    const w = new Walker(buildGrid(params, [], [], [floor], owners));
    w.place(0, 20, 0);
    w.tick({ forward: 0, right: 0, boost: false });
    const still = moverSnapshot(w, null, 0, 0.25);
    for (const name of ['swapRifleExchange', 'swapRifleClaim'] as MoverActionName[]) {
      const s = { ...still, action: { name, serial: 7, t: 0.3, seconds: 1.0645, reversed: false } };
      const frame = decodeSnapshot(encodeSnapshot({ tick: 40, own: null, bodies: [bodyOf(3, s, { alive: true, weapon: 0, aiming: false, trigger: false, boost: false })] }));
      const b = frame.bodies[0]!, back = snapshotOf(b);
      expect(b.action, name).toBe(ACTION_CODES.length - (name === 'swapRifleClaim' ? 0 : 1));   // the field holds the table's length
      expect(back.action?.name, name).toBe(name);
      expect(back.action?.serial).toBe(7);
      expect(back.action?.t).toBeCloseTo(0.3, 2);
      expect(back.turnRate).toBeCloseTo(0.25, 2);
    }
  });

  it("PAR-84: an older page's table (protocol 11 before the append, 20 codes) decodes the frame and finds no name for 21 or 22: it draws no action, the body's ground as the room sends it (PF.R38's precedent)", () => {
    const older = ACTION_CODES.slice(0, 20);
    const w = new Walker(buildGrid(params, [], [], [floor], owners));
    w.place(0, 20, 0);
    w.tick({ forward: 0, right: 0, boost: false });
    const still = moverSnapshot(w, null, 0, 0);
    for (const name of ['rifleToLauncher', 'pistolToLauncher'] as MoverActionName[]) {
      const s = { ...still, action: { name, serial: 1, t: 0.2, seconds: 1.4155, reversed: false } };
      const b = decodeSnapshot(encodeSnapshot({ tick: 41, own: null, bodies: [bodyOf(4, s, { alive: true, weapon: 0, aiming: false, trigger: false, boost: false })] })).bodies[0]!;
      expect(b.action).toBeGreaterThan(older.length);
      expect(older[b.action - 1]).toBeUndefined();                     // `snapshotOf`'s lookup on the older table: no action
      expect(b.ground).toBe(0);                                         // the ground the room's mover ran: idle under the clip
    }
  });
  it("NU-5: a page with PAR-84's table (22 codes) decodes 23 and 24 past it and draws no action for them (PF.R38's precedent)", () => {
    const older = ACTION_CODES.slice(0, 22);
    const w = new Walker(buildGrid(params, [], [], [floor], owners));
    w.place(0, 20, 0);
    w.tick({ forward: 0, right: 0, boost: false });
    const still = moverSnapshot(w, null, 0, 0);
    for (const name of ['swapRifleExchange', 'swapRifleClaim'] as MoverActionName[]) {
      const s = { ...still, action: { name, serial: 1, t: 0.2, seconds: 1.0645, reversed: false } };
      const b = decodeSnapshot(encodeSnapshot({ tick: 41, own: null, bodies: [bodyOf(4, s, { alive: true, weapon: 0, aiming: false, trigger: false, boost: false })] })).bodies[0]!;
      expect(b.action, name).toBeGreaterThan(older.length);
      expect(older[b.action - 1]).toBeUndefined();
    }
  });
});

/**
 * ENEMY-RAISE ER-2 (SCOPE.md s3.4 test 13; reading, pending review): the owner's raise state on the wire, the original's one
 * field (`FUN_002bd640` packs `FUN_005e0010` into byte +0x7e, D:L161978; `FUN_002be150` replays it, D:L162310-162312).
 * Page to room: the command's last byte's bit 7 (`Command.raised`), the weapon narrowed to its three bits below (its
 * codes 0 and 1); room to pages: `BodyFlag.Raised`, bit 16 of the u32. A per-tick binary field bumps the version (PF.R33):
 * protocol 14, a 13 peer refused at the hello (`Room.hello`); a 13 command never set bit 7, so a 13 recording reads
 * through the live decoders with no raise.
 */
describe('ER-2: protocol 14 -- the command\'s raise bit and BodyFlag.Raised', () => {
  it('RED 13: protocol 14; the command\'s bit 7 round-trips beside the weapon, and a 13 command (bit 7 clear) reads as not raised', () => {
    expect(PROTOCOL_VERSION).toBe(15);                           // PROTO-15's bump (V19.R10: the mover's rules, the frames 14's); 14 ER-2's (the raise bit), 13 PLANT-AIM's, 12 SEP-POP's
    for (const weapon of [0, 1]) for (const raised of [false, true]) {
      const cmd: Command = { seq: 3, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: Button.Trigger, stance: 2, weapon, separate: true, raised };
      const bytes = encodeCommands({ viewTick: 1, commands: [cmd] });
      expect(bytes.byteLength).toBe(6 + 15);                     // no byte added
      expect(bytes[bytes.byteLength - 1]).toBe(2 | 0x08 | (weapon << 4) | (raised ? 0x80 : 0));
      const back = decodeCommands(bytes).commands[0]!;
      expect([back.weapon, back.stance, back.separate, back.raised === true]).toEqual([weapon, 2, true, raised]);
    }
    // A protocol-13 command's bytes (stance | separate << 3 | weapon << 4, bit 7 never set): weapon 1, no raise.
    const old = encodeCommands({ viewTick: 1, commands: [{ seq: 1, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 1, weapon: 1 }] });
    expect(old[old.byteLength - 1]).toBe(0x11);
    const read = decodeCommands(old).commands[0]!;
    expect([read.weapon, read.raised === true]).toEqual([1, false]);
  });

  it('RED 13: BodyFlag.Raised is bit 16, clear of every flag and the hold code; a body carries it to the copy\'s snapshot', () => {
    expect(BodyFlag.Raised).toBe(1 << 16);
    for (const f of Object.values(BodyFlag)) if (f !== BodyFlag.Raised) expect(f & BodyFlag.Raised).toBe(0);
    for (const clip of HOLD_CODES) expect(bodyHoldBits(clip) & BodyFlag.Raised).toBe(0);
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
    const s = moverSnapshot(new Walker(buildGrid(params, [], [], [], [])), null, 0, 0.25);
    for (const raised of [true, false]) {
      const extras = { alive: true, weapon: 0 as const, aiming: false, trigger: false, boost: false, raised };
      const b = decodeSnapshot(encodeSnapshot({ tick: 1, own: null, bodies: [bodyOf(3, s, extras)] })).bodies[0]!;
      expect([(b.flags & BodyFlag.Raised) !== 0, snapshotOf(b).raised]).toEqual([raised, raised]);
    }
    // A room before 14 never sets it: the body reads as down (a 13 recording's copy keeps the inference, `RemotePlayers`).
    const old = decodeSnapshot(encodeSnapshot({ tick: 1, own: null, bodies: [bodyOf(3, s, { alive: true, weapon: 0, aiming: true, trigger: false, boost: false })] })).bodies[0]!;
    expect(snapshotOf(old).raised).toBe(false);
  });
});
