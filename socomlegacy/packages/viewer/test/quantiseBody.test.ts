import { describe, expect, it } from 'vitest';
import { decodeSnapshot, encodeSnapshot, FEET_RANGE, quantiseBody } from '../src/net/codec';
import type { BodyState } from '../src/net/protocol';

/**
 * HIT-POSE's perf fold (research 217 s3.6a): the room's poser takes a body as the wire carries it to a page without the
 * encode / decode round trip -- `quantiseBody` writes, into a body the poser keeps, every field through the quantiser
 * and the width `encodeSnapshot` writes it at, read back as `decodeSnapshot` reads it. Held here equal (Object.is on
 * every number: -0, NaN, the masks' wraps) to the real round trip on a body alone (`wireBody`'s frame, the origin from
 * the body), over the fields' ranges and past them. A wire step, no reading.
 */

let seed = 11;
const rand = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const between = (lo: number, hi: number): number => lo + rand() * (hi - lo);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
/** A value now and then off the field's range: negative zero, NaN, the infinities, a wrap past the width. */
const odd = (v: number): number => (rand() < 0.15 ? pick([-0, Number.NaN, Infinity, -Infinity, 1e9, -1e9, 0.49999, -0.5]) : v);
const int = (lo: number, hi: number): number => Math.floor(between(lo, hi));

function body(id: number): BodyState {
  return {
    id: odd(id), feet: [odd(between(-FEET_RANGE - 50, FEET_RANGE + 50)), odd(between(-300, 900)), odd(between(-4000, 4000))],
    yaw: odd(between(-720, 720)), pitch: odd(between(-100, 100)),
    vx: odd(between(-600, 600)), vy: odd(between(-600, 600)), vz: odd(between(-100, 100)), flags: odd(int(-5, 2 ** 32 + 5)),
    stance: odd(int(0, 6)), landing: odd(int(0, 6)), jumps: odd(int(0, 600)), ground: odd(int(0, 6)),
    groundForward: odd(between(-1.3, 1.3)), groundRight: odd(between(-1.3, 1.3)), groundCls: odd(int(-200, 200)),
    action: odd(int(0, 300)), actionSerial: odd(int(-10, 600)), actionT: odd(between(-1, 70)), actionSeconds: odd(rand() < 0.3 ? -1 : between(0, 70)),
    overlay: odd(int(0, 300)), overlayT: odd(between(-1, 70)), overlaySeconds: odd(between(-1, 70)),
    turnRate: odd(between(-40, 40)),
    trav: odd(int(0, 300)), travFrame: odd(between(0, 90)), travRootY: rand() < 0.3 ? Number.NaN : odd(between(-20, 20)),
    travBlend: odd(int(0, 300)), travBlendWeight: odd(between(-0.2, 1.2)),
    peek: odd(int(-200, 200)), weapon: odd(int(0, 300)), slot: odd(int(0, 3)),
    ...(rand() < 0.8 ? { stickSnaps: odd(int(0, 3)) } : {}),
  };
}

const roundTrip = (b: BodyState): BodyState => decodeSnapshot(encodeSnapshot({ tick: 0, own: null, bodies: [b] })).bodies[0]!;
const blank = (): BodyState => ({
  id: 0, feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, flags: 0, stance: 0, landing: 0, jumps: 0, ground: 0,
  groundForward: 0, groundRight: 0, groundCls: 0, action: 0, actionSerial: 0, actionT: 0, actionSeconds: 0, overlay: 0,
  overlayT: 0, overlaySeconds: 0, turnRate: 0, trav: 0, travFrame: 0, travRootY: 0, travBlend: 0, travBlendWeight: 0, peek: 0,
  weapon: 0, slot: 0, stickSnaps: 0,
});

describe('quantiseBody: a body as the wire carries it, in place (HIT-POSE perf fold)', () => {
  it('equals encodeSnapshot -> decodeSnapshot on the body alone, every field, over 5000 bodies in range and past it', () => {
    const out = blank(), feet = out.feet;
    for (let i = 0; i < 5000; i++) {
      const b = body(i % 256);
      const got = quantiseBody(b, out);
      expect(got).toBe(out);                                   // written in place: the poser's own body, no new object
      expect(got.feet).toBe(feet);                             // and its own feet
      expect({ ...got, feet: [...got.feet] }, `body ${i}: ${JSON.stringify(b)}`).toEqual(roundTrip(b));
    }
  });

  it('leaves its source untouched', () => {
    const b = body(3), copy = { ...b, feet: [...b.feet] };
    quantiseBody(b, blank());
    expect(b).toEqual(copy);
  });
});
