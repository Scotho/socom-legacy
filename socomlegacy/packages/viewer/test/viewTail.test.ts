import { describe, expect, it } from 'vitest';
import { encodeSnapshot } from '../src/net/codec';
import { BodyFlag, type BodyState } from '../src/net/protocol';
import { encodeSnapshot as encodeSnapshotPre337 } from './fixtures/codecPre337';
import { BODY_BYTES_V15, VIEW_TAIL_BYTES, withoutViewTails, withoutViewTailsUnchecked } from './fixtures/viewTail';

/**
 * WIRE-16 (PV-1's fold; research 402 s3): `withoutViewTails` cuts each body's three tail bytes out of a protocol-16
 * snapshot so a byte pin can compare it with protocol 15's writer (`cranes.test.ts`, match `test/replayFormat.test.ts`).
 * The pins prove those bytes only if the helper looks at them: it refuses a frame whose cut byte is not zero. A test
 * helper's test, no game data.
 */

const body = (id: number, over: Partial<BodyState> = {}): BodyState => ({
  id, feet: [10 * id, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, flags: BodyFlag.Alive, stance: 0, landing: 0, jumps: 0, ground: 1,
  groundForward: 0, groundRight: 0, groundCls: 0, action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1, overlay: 0, overlayT: 0,
  overlaySeconds: -1, turnRate: 0, trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: 255, slot: 0,
  ...over,
});
const own = { ack: 41, x: 1, y: 2, z: 3, vx: 0, vy: 0, vz: 0, facing: { yaw: 90, pitch: -5 } };

describe('withoutViewTails: the cut tails are proved zero', () => {
  it('a frame whose tails are all zero is cut to protocol 15\'s bytes, with and without the own state', () => {
    for (const s of [{ tick: 3, own: null, bodies: [body(1), body(2)] }, { tick: 4, own, bodies: [body(3)] }, { tick: 5, own: null, bodies: [] }]) {
      expect(Buffer.from(withoutViewTails(encodeSnapshot(s))).toString('hex')).toBe(Buffer.from(encodeSnapshotPre337(s)).toString('hex'));
    }
  });

  it('a frame with one non-zero tail byte is refused, whichever body and whichever of the three bytes', () => {
    for (const s of [{ tick: 3, own: null, bodies: [body(1), body(2)] }, { tick: 4, own, bodies: [body(1), body(2)] }]) {
      const frame = encodeSnapshot(s);
      const first = 12 + (s.own ? 36 : 0) + 1;                   // the head, the own state, the count
      for (let k = 0; k < s.bodies.length; k++) {
        for (let j = 0; j < VIEW_TAIL_BYTES; j++) {
          const bad = frame.slice();
          bad[first + k * (BODY_BYTES_V15 + VIEW_TAIL_BYTES) + BODY_BYTES_V15 + j] = 1;
          expect(() => withoutViewTails(bad), `body ${k}, tail byte ${j}`).toThrow(/view tail/);
        }
      }
    }
    expect(() => withoutViewTails(encodeSnapshot({ tick: 1, own: null, bodies: [body(1, { clock: 1 })] }))).toThrow(/view tail/);
    expect(() => withoutViewTails(encodeSnapshot({ tick: 1, own: null, bodies: [body(1, { swayY: -0.5 })] }))).toThrow(/view tail/);
  });
});

describe('withoutViewTailsUnchecked (PV-2): the same cut, the tails not looked at', () => {
  it('cuts a frame with non-zero tails to the bytes of the same frame with zero tails cut by the strict helper', () => {
    for (const own0 of [null, own]) {
      const tails = { tick: 6, own: own0, bodies: [body(1, { view: 7, clock: 9, swayX: 3, swayY: -2 }), body(2, { clock: 15 })] };
      const zero = { tick: 6, own: own0, bodies: [body(1), body(2)] };
      expect(() => withoutViewTails(encodeSnapshot(tails))).toThrow(/view tail/);
      expect(Buffer.from(withoutViewTailsUnchecked(encodeSnapshot(tails))).toString('hex')).toBe(Buffer.from(withoutViewTails(encodeSnapshot(zero))).toString('hex'));
    }
  });
});
