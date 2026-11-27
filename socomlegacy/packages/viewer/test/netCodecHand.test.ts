import { describe, expect, it } from 'vitest';
import { decodeSnapshot, decodeSnapshotV16, encodeSnapshot, quantiseBody } from '../src/net/codec';
import { bodyOf } from '../src/net/body';
import { BodyFlag, HAND_SINCE_PROTOCOL, PROTOCOL_VERSION, VIEW_SINCE_PROTOCOL, type BodyState } from '../src/net/protocol';
import { moverSnapshot, Walker } from '../src/mover';
import { buildGrid, type GridParams } from '@s2u/scene';
import { BODY_BYTES_V16, withoutHands, withoutHandsUnchecked } from './fixtures/viewTail';

/**
 * WM-DATA-17 (protocol 17; WM.R11, the controller seat redotcom-8f): the body grows 55 -> 56 by one u8 after the sway
 * bytes, `BodyState.hand` -- the item id in the owner's hand when it is neither the firearm nor the launcher (a grenade, a
 * charge, the gear), else 0. A browser adaptation for the player's view (HAND_WIRE_ADAPTATION, `../src/net/protocol`):
 * nothing the room simulates reads it, `weapon` keeps its meaning. The command is unchanged. A protocol-16 frame (the live
 * frame with each hand byte cut, `./fixtures/viewTail` `withoutHands`) reads through the frozen `codecV16` with `hand` 0
 * and every other field as the live codec reads the same snapshot.
 */

const body = (id: number, over: Partial<BodyState> = {}): BodyState => ({
  id, feet: [100 + id, 20, -300], yaw: 45, pitch: -10, vx: 1.5, vy: 0, vz: -2, flags: BodyFlag.Alive | BodyFlag.Raised, stance: 1, landing: 0,
  jumps: 3, ground: 2, groundForward: 0.5, groundRight: -0.25, groundCls: 1, action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
  overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0.5, trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0,
  peek: 0, weapon: 62, slot: 0, stickSnaps: 0, ...over,
});
const one = (b: BodyState): BodyState => decodeSnapshot(encodeSnapshot({ tick: 1, own: null, bodies: [b] })).bodies[0]!;
/** The hand byte's place: the head, the count, the body's first 55 bytes. */
const HAND_AT = 12 + 1 + 55;

describe('WM-DATA-17: protocol 17 and the body\'s width', () => {
  it('the version is 17, the first whose bodies carry the hand (HAND_SINCE_PROTOCOL); the view came with 16', () => {
    expect(PROTOCOL_VERSION).toBe(19);   // LATER 1141 (the round's `at`, research 441)
    expect(HAND_SINCE_PROTOCOL).toBe(17);
    expect(VIEW_SINCE_PROTOCOL).toBe(16);
  });

  it('a body is 56 bytes: a snapshot of n bodies and no own state is 12 + 1 + 56n + 1', () => {
    for (const n of [1, 2, 15]) {
      expect(encodeSnapshot({ tick: 1, own: null, bodies: Array.from({ length: n }, (_, i) => body(i + 1)) }).byteLength).toBe(12 + 1 + 56 * n + 1);
    }
  });
});

describe('WM-DATA-17: the hand byte (byte 55)', () => {
  it('a body with hand 61 round-trips; the byte sits after the sway bytes; every other field as without it', () => {
    const b = body(3, { hand: 61, view: 5, clock: 9, swayX: -12.5, swayY: 63.5 });
    const bytes = encodeSnapshot({ tick: 1, own: null, bodies: [b] });
    expect(bytes[HAND_AT]).toBe(61);
    expect(bytes[HAND_AT - 3]).toBe(5 | (9 << 4));               // the view tail before it, where it was
    const back = one(b);
    expect(back.hand).toBe(61);
    expect({ ...back, hand: 0 }).toEqual(one({ ...b, hand: 0 }));
  });

  it('a body without the field (a hostage\'s, a test\'s) and a body with 0 carry 0; the byte is masked to eight bits', () => {
    expect([one(body(1)).hand, one(body(1, { hand: 0 })).hand]).toEqual([0, 0]);
    expect(encodeSnapshot({ tick: 1, own: null, bodies: [body(1)] })[HAND_AT]).toBe(0);
    expect([one(body(1, { hand: 255 })).hand, one(body(1, { hand: 256 })).hand, one(body(1, { hand: 256 + 61 })).hand]).toEqual([255, 0, 61]);
  });

  it('quantiseBody carries the hand as the round trip does', () => {
    for (const b of [body(1, { hand: 61 }), body(2, { hand: 256 + 121 }), body(3)]) {
      expect(quantiseBody(b, body(0, { hand: 9 })).hand).toBe(one(b).hand);
    }
  });

  it('bodyOf takes the hand in its extras; absent is 0', () => {
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
    const s = moverSnapshot(new Walker(buildGrid(params, [], [], [], [])), null, 0, 0);   // binoculars.test.ts's flat floor
    expect(bodyOf(4, s, { alive: true, weapon: 0, item: 62, aiming: false, trigger: false, boost: false, hand: 121 }).hand).toBe(121);
    expect(bodyOf(4, s, { alive: true, weapon: 0, item: 62, aiming: false, trigger: false, boost: false }).hand).toBe(0);
  });
});

describe('WM-DATA-17: the frozen protocol-16 decoder (codecV16), decode only', () => {
  const own = { ack: 41, x: 1, y: 2, z: 3, vx: 0, vy: 0, vz: 0, facing: { yaw: 90, pitch: -5 } };
  const env = { revision: 9, epoch: 2, states: [{ id: 4, active: true }, { id: 7, active: false }] };
  const snapshots = [
    { tick: 321, own: null, bodies: [body(1, { view: 7, clock: 3, swayX: 2, swayY: -1 }), body(2, { flags: (1 << 17) | BodyFlag.Alive })], doors: [{ valve: 1, phase: 3 }], env },
    { tick: 7, own, bodies: [body(3, { hand: 61 })], doors: [] },
    { tick: 8, own: null, bodies: [] },
  ];
  const handless = (s: (typeof snapshots)[number]) => ({ ...s, bodies: s.bodies.map((b) => ({ ...b, hand: 0 })) });

  it('reads a protocol-16 frame (55-byte bodies) as the live codec reads the same snapshot at 17, hand 0', () => {
    for (const s of snapshots) {
      const sixteen = withoutHandsUnchecked(encodeSnapshot(s));
      expect(sixteen.byteLength).toBe(encodeSnapshot(s).byteLength - s.bodies.length);
      expect(Buffer.from(sixteen).equals(Buffer.from(withoutHands(encodeSnapshot(handless(s)))))).toBe(true);
      const read = decodeSnapshotV16(sixteen);
      expect(read).toEqual(decodeSnapshot(encodeSnapshot(handless(s))));
      for (const b of read.bodies) expect(b.hand).toBe(0);
    }
    expect(BODY_BYTES_V16).toBe(55);
  });

  it('the live decoder refuses a protocol-16 frame; the frozen one refuses a protocol-17 frame', () => {
    const s = { tick: 1, own: null, bodies: [body(1)] };
    expect(() => decodeSnapshot(withoutHands(encodeSnapshot(s)))).toThrow(/too short/);
    expect(() => decodeSnapshotV16(encodeSnapshot(s))).toThrow(/trailing/);
  });
});
