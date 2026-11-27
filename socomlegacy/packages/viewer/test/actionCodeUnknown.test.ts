import { describe, expect, it } from 'vitest';
import { decodeSnapshot, encodeSnapshot } from '../src/net/codec';
import { snapshotOf } from '../src/net/body';
import { ACTION_CODES, type BodyState } from '../src/net/protocol';

/**
 * LATER 1188 (the main controller's condition 1, 2026-11-18): ACTION_CODES gains the cower codes APPENDED, with no
 * protocol bump. That holds only if a page that predates them -- v0.4.26's, whose table ends at `swapRifleClaim` (24) --
 * reads a code past its table as NO action, safely. The codec carries `action` as a plain byte with no range test
 * (`../src/net/codec.ts`), and `snapshotOf` maps a code its table lacks to null. Here a code past this page's own table
 * stands in for a v0.4.26 page receiving 25-28: the same path.
 */

function body(action: number): BodyState {
  return {
    id: 7, feet: [1, 2, 3], yaw: 30, pitch: 0, vx: 0, vy: 0, vz: 0, flags: 1, stance: 0, landing: 0, jumps: 0, ground: 0,
    groundForward: 0, groundRight: 0, groundCls: 0, action, actionSerial: 3, actionT: 0.5, actionSeconds: 4.9, overlay: 0,
    overlayT: 0, overlaySeconds: 0, turnRate: 0, trav: 0, travFrame: 0,
  } as unknown as BodyState;
}

describe('LATER 1188: a page ignores an action code past its table (no protocol bump for appended codes)', () => {
  it('v0.4.26\'s table is this one\'s first 24 codes: every earlier byte where it was', () => {
    expect(ACTION_CODES.indexOf('swapRifleClaim') + 1).toBe(24);
    expect(ACTION_CODES.slice(24)).toEqual(['cowerStand', 'cowerStand2', 'cowerCrouch', 'cowerCrouch2']);
  });

  it('a code past the table crosses the wire as its byte and reads as no action, the rest of the body intact', () => {
    const unknown = ACTION_CODES.length + 1;
    const frame = decodeSnapshot(encodeSnapshot({ tick: 9, own: null, bodies: [body(unknown)] }));
    const b = frame.bodies[0]!;
    expect(b.action).toBe(unknown);
    const s = snapshotOf(b);
    expect(s.action).toBeNull();
    expect(s.feet).toEqual([1, 2, 3]);
    expect(s.yaw).toBeCloseTo(30, 1);
  });

  it('as v0.4.26 would see a cower: its table cut at 24, the cower codes read as unknown', () => {
    const v0426 = ACTION_CODES.slice(0, 24) as readonly string[];
    for (const name of ['cowerStand', 'cowerStand2', 'cowerCrouch', 'cowerCrouch2'] as const) {
      const code = ACTION_CODES.indexOf(name) + 1;
      expect(code).toBeGreaterThan(24);
      expect(v0426[code - 1]).toBeUndefined();               // `ACTION_CODES[b.action - 1]` in v0.4.26's `snapshotOf`
    }
  });
});
