import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  decodeCommands, decodeCommandsV15, decodeSnapshot, decodeSnapshotV15, dqSway, encodeCommands, encodeSnapshot, qSway, quantiseBody, quantiseCommand,
  VIEW_SWAY_STEP_ADAPTATION, viewState,
} from '../src/net/codec';
import { BodyFlag, bodyHoldBits, Button, PROTOCOL_VERSION, RAISED_SINCE_PROTOCOL, VIEW_SINCE_PROTOCOL, type BodyState, type Command } from '../src/net/protocol';
import { HOLD_CODES } from '../src/mover';
// The frozen pre-#337 snapshot writer: its body is protocol 15's 52 bytes (the same `writeBody`), so with no hooks named
// it writes a protocol-15 snapshot exactly (`cranes.test.ts`, the #337 takeover's pin).
import { encodeSnapshot as encodeSnapshotV15 } from './fixtures/codecPre337';

/**
 * WIRE-16 (PV-1, the player's view's lane; PV.R4 and PV.R9 of `docs/plans/2026-11-11-players-view.md`; research 402
 * section 3, the layout byte for byte): protocol 16 carries the player's view's six bytes -- a command 15 -> 18 (`view`
 * u8, `swayX` i8, `swayY` i8), a body 52 -> 55 (`view` u8: bits 0-3 the view state, bits 4-7 the command number's low
 * four bits, `clock`; `swayX` i8, `swayY` i8). A browser adaptation with no original: the wire is ours. The codec writes
 * what it is given; who fills the fields (the page, PV-3) and who gets a zeroed tail (the room, PV-2) are not here.
 * `BodyFlag` bit 17 stays reserved, defined by nothing (PV.R4; the fog of war's lane), and survives the codec untouched.
 * The frozen `codecV15` reads a protocol-15 frame (the bytes of `./fixtures/codecPre337`'s snapshot writer, whose body
 * is 15's, and a command frame's hex as 15's encoder writes it) with the four fields 0.
 */

const body = (id: number, over: Partial<BodyState> = {}): BodyState => ({
  id, feet: [100 + id, 20, -300], yaw: 45, pitch: -10, vx: 1.5, vy: 0, vz: -2, flags: BodyFlag.Alive | BodyFlag.Raised, stance: 1, landing: 0,
  jumps: 3, ground: 2, groundForward: 0.5, groundRight: -0.25, groundCls: 1, action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
  overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0.5, trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0,
  peek: 0, weapon: 62, slot: 0, stickSnaps: 0, ...over,
});
const command = (seq: number, over: Partial<Command> = {}): Command => ({
  seq, forward: 1, right: -63 / 127, yaw: 90, pitch: -12.5, turn: 1.25, buttons: Button.Aim | Button.Scope, stance: 2, weapon: 1, separate: true, raised: true, ...over,
});
const one = (b: BodyState): BodyState => decodeSnapshot(encodeSnapshot({ tick: 1, own: null, bodies: [b] })).bodies[0]!;
const tail = (b: BodyState): number[] => [b.view!, b.clock!, b.swayX!, b.swayY!];
/** View values that are no state 0-12 (`zoom.ts`): each is no view, 0, at every point (research 402 s3, the PV-1 fold). */
const NOT_A_STATE = [13, 15, 200, -1, 2.5, Number.NaN];

describe('WIRE-16: protocol 16 and the frames\' sizes (research 402 s3)', () => {
  it('the version is 16, the first whose bodies and commands carry the view (VIEW_SINCE_PROTOCOL); the raise came with 14', () => {
    expect(PROTOCOL_VERSION).toBe(16);
    expect(VIEW_SINCE_PROTOCOL).toBe(16);
    expect(RAISED_SINCE_PROTOCOL).toBe(14);
  });

  it('a command is 18 bytes, a batch of three 60 with its header (u8 kind, f32 view tick, u8 count)', () => {
    expect(encodeCommands({ viewTick: 1, commands: [command(1)] }).byteLength).toBe(6 + 18);
    expect(encodeCommands({ viewTick: 1, commands: [command(1), command(2), command(3)] }).byteLength).toBe(60);
  });

  it('a body is 55 bytes: a snapshot of n bodies and no own state is 12 + 1 + 55n + 1', () => {
    for (const n of [1, 2, 15]) {
      expect(encodeSnapshot({ tick: 1, own: null, bodies: Array.from({ length: n }, (_, i) => body(i + 1)) }).byteLength).toBe(12 + 1 + 55 * n + 1);
    }
  });
});

describe('WIRE-16: the command\'s tail (bytes 15-17)', () => {
  it('round-trips view, swayX and swayY; the bytes sit after the stance byte, in the layout\'s order', () => {
    for (const view of [0, 1, 4, 5, 12]) {
      const c = command(7, { view, swayX: 59.5, swayY: -60 });
      const bytes = encodeCommands({ viewTick: 1, commands: [c] });
      const at = 6 + 15;                                          // after the frame's header and today's 15 bytes
      expect([bytes[at], new Int8Array(bytes.buffer, bytes.byteOffset + at + 1, 2)[0], new Int8Array(bytes.buffer, bytes.byteOffset + at + 1, 2)[1]]).toEqual([view, 119, -120]);
      const back = decodeCommands(bytes).commands[0]!;
      expect([back.view, back.swayX, back.swayY]).toEqual([view, 59.5, -60]);
      expect([back.seq, back.stance, back.weapon, back.separate, back.raised]).toEqual([7, 2, 1, true, true]);   // today's fields where they were
    }
  });

  it('a zero tail round-trips as zero; a command without the fields (a bot\'s, the room\'s, a test\'s) is a zero tail', () => {
    for (const c of [command(1, { view: 0, swayX: 0, swayY: 0 }), command(2)]) {
      const bytes = encodeCommands({ viewTick: 1, commands: [c] });
      expect(Array.from(bytes.subarray(bytes.byteLength - 3))).toEqual([0, 0, 0]);
      const back = decodeCommands(bytes).commands[0]!;
      expect([back.view, back.swayX, back.swayY]).toEqual([0, 0, 0]);
    }
  });

  it('a view that is no state 0-12 is no view (research 402 s3: "read as 0"): the encoder writes 0, quantiseCommand carries 0, 12 stays 12', () => {
    for (const view of NOT_A_STATE) {
      const bytes = encodeCommands({ viewTick: 1, commands: [command(1, { view })] });
      expect(bytes[bytes.byteLength - 3], `the byte for ${view}`).toBe(0);
      expect(decodeCommands(bytes).commands[0]!.view, `the round trip of ${view}`).toBe(0);
      expect(quantiseCommand(command(1, { view })).view, `quantiseCommand of ${view}`).toBe(0);
    }
    const twelve = encodeCommands({ viewTick: 1, commands: [command(1, { view: 12 })] });
    expect([twelve[twelve.byteLength - 3], decodeCommands(twelve).commands[0]!.view, quantiseCommand(command(1, { view: 12 })).view]).toEqual([12, 12, 12]);
  });

  it('the decoder reads a byte past 12 as 0, the sway as the bytes hold', () => {
    for (const byte of [13, 15, 200, 255]) {
      const bytes = encodeCommands({ viewTick: 1, commands: [command(1)] });
      bytes[bytes.byteLength - 3] = byte; bytes[bytes.byteLength - 2] = 0x80;
      const back = decodeCommands(bytes).commands[0]!;
      expect([back.view, back.swayX], `the byte ${byte}`).toEqual([0, -128 * VIEW_SWAY_STEP_ADAPTATION]);
    }
  });
});

describe('WIRE-16: the body\'s tail (bytes 52-54)', () => {
  it('round-trips view, clock, swayX and swayY; byte 52 is view | clock << 4', () => {
    for (const [view, clock] of [[0, 0], [5, 15], [12, 9], [4, 1]] as const) {
      const b = body(3, { view, clock, swayX: -12.5, swayY: 63.5 });
      const bytes = encodeSnapshot({ tick: 1, own: null, bodies: [b] });
      const at = 12 + 1 + 52;                                     // the head, the count, today's 52 bytes
      expect(bytes[at]).toBe(view | (clock << 4));
      expect(Array.from(new Int8Array(bytes.buffer, bytes.byteOffset + at + 1, 2))).toEqual([-25, 127]);
      expect(tail(one(b))).toEqual([view, clock, -12.5, 63.5]);
    }
  });

  it('a zero tail round-trips as zero; a body without the fields (a hostage\'s, a test\'s) is a zero tail', () => {
    for (const b of [body(1, { view: 0, clock: 0, swayX: 0, swayY: 0 }), body(2)]) {
      const bytes = encodeSnapshot({ tick: 1, own: null, bodies: [b] });
      expect(Array.from(bytes.subarray(bytes.byteLength - 4, bytes.byteLength - 1))).toEqual([0, 0, 0]);   // the door count after it
      expect(tail(one(b))).toEqual([0, 0, 0, 0]);
    }
  });

  it('a view that is no state 0-12 is no view: the encoder writes 0 beside the clock, quantiseBody carries 0, 12 stays 12', () => {
    for (const view of NOT_A_STATE) {
      const b = body(1, { view, clock: 5 });
      const bytes = encodeSnapshot({ tick: 1, own: null, bodies: [b] });
      expect(bytes[12 + 1 + 52], `the byte for ${view}`).toBe(5 << 4);
      expect(tail(one(b)), `the round trip of ${view}`).toEqual([0, 5, 0, 0]);
      expect(tail(quantiseBody(b, body(0))), `quantiseBody of ${view}`).toEqual([0, 5, 0, 0]);
    }
    const twelve = body(1, { view: 12, clock: 5 });
    expect([tail(one(twelve)), tail(quantiseBody(twelve, body(0)))]).toEqual([[12, 5, 0, 0], [12, 5, 0, 0]]);
  });

  it('the clock is masked to four bits; the decoder reads a nibble past 12 as view 0, the clock untouched', () => {
    expect(tail(one(body(1, { view: 3, clock: 16 })))).toEqual([3, 0, 0, 0]);
    expect(tail(one(body(1, { view: 3, clock: 17 })))).toEqual([3, 1, 0, 0]);
    expect(tail(one(body(1, { view: 3, clock: -1 })))).toEqual([3, 15, 0, 0]);
    for (const [byte, view, clock] of [[0xfd, 0, 15], [0xff, 0, 15], [0x0d, 0, 0], [0x3e, 0, 3], [0xec, 12, 14], [0x00, 0, 0]] as const) {
      const bytes = encodeSnapshot({ tick: 1, own: null, bodies: [body(1)] });
      bytes[12 + 1 + 52] = byte;
      expect(tail(decodeSnapshot(bytes).bodies[0]!).slice(0, 2), `the byte 0x${byte.toString(16)}`).toEqual([view, clock]);
    }
  });

  it('every other field reads as the body without the tail would (the tail moves nothing before it)', () => {
    const plain = one(body(4)), viewed = one(body(4, { view: 7, clock: 3, swayX: 10, swayY: -10 }));
    expect({ ...viewed, view: 0, clock: 0, swayX: 0, swayY: 0 }).toEqual(plain);
  });

  it('quantiseBody carries the tail as the round trip does (the room\'s poser takes the wire\'s body)', () => {
    for (const b of [body(1, { view: 7, clock: 9, swayX: 3.2, swayY: -60 }), body(2, { view: 14, clock: 33, swayX: 1e9, swayY: Number.NaN }), body(3)]) {
      const out = quantiseBody(b, body(0, { view: 1, clock: 1, swayX: 1, swayY: 1 }));
      expect(tail(out)).toEqual(tail(one(b)));
    }
    expect(tail(quantiseBody(body(1, { view: 7, clock: 9, swayX: 3.2, swayY: -60 }), body(0)))).toEqual([7, 9, 3, -60]);
  });
});

describe('WIRE-16: VIEW_SWAY_STEP_ADAPTATION, the sway\'s i8 step (PS2 pixels a unit; the wire is ours, no original)', () => {
  it('is 0.5: the smallest round step under which every SniperDistLimit the pinned weapon records hold fits in +-127', () => {
    // The pin `@s2u/scene` test/golden/weapon-records.json is `readKitTable(ZWEAPON.ZAR).records` (its `_source`), each
    // stance's `SniperDistLimitX`/`Y` as `swayLimitX`/`Y`; `Accuracy.swayLimit` is that x (0.8 cur + 0.2), cur <= 1, and the
    // sway is held inside it. The disc itself is re-walked by `viewSwayStep.disc.test.ts`.
    const pinned = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../scene/test/golden/weapon-records.json'), 'utf8')) as {
      records: Record<string, { name: string; stances: Record<string, { swayLimitX: number; swayLimitY: number }> }>;
    };
    let largest = 0;
    for (const r of Object.values(pinned.records)) for (const s of Object.values(r.stances)) largest = Math.max(largest, Math.abs(s.swayLimitX), Math.abs(s.swayLimitY));
    expect(largest).toBe(60);                                    // the M82A1A's and the M87ELR's stand, SniperDistLimitX
    expect(VIEW_SWAY_STEP_ADAPTATION).toBe(0.5);
    expect(largest).toBeLessThanOrEqual(127 * VIEW_SWAY_STEP_ADAPTATION);
    expect(largest).toBeGreaterThan(127 * (VIEW_SWAY_STEP_ADAPTATION / 2));   // the next round step down, 0.25, would clip it
  });

  it('the encode: to the nearest step, clamped to +-127 steps, 0 (and -0, NaN) to 0', () => {
    expect([qSway(0), qSway(-0), qSway(Number.NaN)]).toEqual([0, 0, 0]);
    expect(Object.is(qSway(-0), 0) && Object.is(qSway(-0.2), 0)).toBe(true);
    expect([qSway(0.2), qSway(0.3), qSway(0.5), qSway(-0.5), qSway(-0.8), qSway(59.9), qSway(60)]).toEqual([0, 1, 1, -1, -2, 120, 120]);
    expect([qSway(63.5), qSway(64), qSway(1e9), qSway(Infinity), qSway(-63.5), qSway(-1e9), qSway(-Infinity)]).toEqual([127, 127, 127, 127, -127, -127, -127]);
    expect([dqSway(0), dqSway(127), dqSway(-127), dqSway(1)]).toEqual([0, 63.5, -63.5, 0.5]);
  });

  it('viewState: an integer 0-12 is itself; anything else -- past 12, negative, a fraction, NaN, not a number -- is 0, no view', () => {
    const states = Array.from({ length: 13 }, (_, i) => i);
    expect(states.map(viewState)).toEqual(states);
    expect(NOT_A_STATE.map(viewState)).toEqual(NOT_A_STATE.map(() => 0));
    expect([Infinity, -Infinity, -0, 12.5, 1e9, '5', undefined, null, true, {}].map(viewState)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(Object.is(viewState(-0), 0)).toBe(true);
  });
});

describe('WIRE-16: BodyFlag bit 17 reserved (PV.R4: the fog of war\'s lane), defined by nothing, carried untouched', () => {
  const RESERVED = 1 << 17;                                       // a raw number: no member names it

  it('no BodyFlag member and no hold code is bit 17', () => {
    for (const f of Object.values(BodyFlag)) expect(f & RESERVED).toBe(0);
    for (const clip of HOLD_CODES) expect(bodyHoldBits(clip) & RESERVED).toBe(0);
  });

  it('a body whose flags hold bit 17 round-trips with the bit set and every other field as given (encodeSnapshot / decodeSnapshot)', () => {
    for (const flags of [RESERVED, RESERVED | BodyFlag.Alive | BodyFlag.Raised | BodyFlag.HoldSerial | bodyHoldBits(HOLD_CODES[0]!)]) {
      const b = body(5, { flags, view: 5, clock: 11, swayX: -30, swayY: 2.5 });
      const back = one(b), without = one({ ...b, flags: flags & ~RESERVED });
      expect(back.flags).toBe(flags >>> 0);
      expect((back.flags & RESERVED) !== 0).toBe(true);
      expect({ ...back, flags: without.flags }).toEqual(without);
      expect(tail(back)).toEqual([5, 11, -30, 2.5]);
    }
  });
});

describe('WIRE-16: the frozen protocol-15 decoders (codecV15), decode only', () => {
  const own = { ack: 41, x: 1, y: 2, z: 3, vx: 0, vy: 0, vz: 0, facing: { yaw: 90, pitch: -5 } };
  const env = { revision: 9, epoch: 2, states: [{ id: 4, active: true }, { id: 7, active: false }] };

  it('decodeSnapshotV15 reads a protocol-15 snapshot (52-byte bodies) as the live codec reads the same snapshot at 16, the four fields 0', () => {
    for (const s of [
      { tick: 321, own: null, bodies: [body(1), body(2, { flags: (1 << 17) | BodyFlag.Alive })], doors: [{ valve: 1, phase: 3 }], env },
      { tick: 7, own, bodies: [body(3)], doors: [] },
      { tick: 8, own: null, bodies: [] },
    ]) {
      const fifteen = encodeSnapshotV15(s);
      expect(fifteen.byteLength).toBe(encodeSnapshot(s).byteLength - 3 * s.bodies.length);
      const read = decodeSnapshotV15(fifteen);
      expect(read).toEqual(decodeSnapshot(encodeSnapshot(s)));
      for (const b of read.bodies) expect(tail(b)).toEqual([0, 0, 0, 0]);
    }
    expect(decodeSnapshotV15(encodeSnapshotV15({ tick: 1, own: null, bodies: [body(2, { flags: 1 << 17 })] })).bodies[0]!.flags).toBe(1 << 17);
  });

  it('decodeCommandsV15 reads a protocol-15 command frame (15 bytes a command) with view and sway 0; the live decoder refuses it', () => {
    // One command as protocol 15's `encodeCommands` laid it out, by hand (match `test/replayFormat.test.ts`'s V11_COMMAND
    // with the stance byte's bits 3 and 7): kind 2, f32 view tick 4242, count 1, u32 seq 777, i8 stick 127 / -63, u16 yaw
    // 0x4000 (90), i16 pitch -1250, i16 turn 1250, u16 buttons 0x0223, u8 stance 2 | separate 0x08 | weapon 1 << 4 | raised 0x80.
    const V15_COMMAND = Uint8Array.from(Buffer.from('020090844501090300007fc100401efbe20423029a', 'hex'));
    const read = decodeCommandsV15(V15_COMMAND);
    expect(read).toEqual({ viewTick: 4242, commands: [{ seq: 777, forward: 1, right: -63 / 127, yaw: 90, pitch: -12.5, turn: 1.25, buttons: 0x223, stance: 2, weapon: 1, separate: true, raised: true, view: 0, swayX: 0, swayY: 0 }] });
    expect(() => decodeCommands(V15_COMMAND)).toThrow(/too short/);   // 18 bytes a command now: the live decoder cannot read 15's
  });
});
