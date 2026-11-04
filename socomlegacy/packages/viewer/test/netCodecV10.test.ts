import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeSnapshotV10 } from '../src/net/codec';

/**
 * NET-WIRE (protocol 11; research 224; requirement 3 of the merge controller's list, sprint 33's PT-01b): protocol 10's
 * snapshot decoder frozen as `decodeSnapshotV10`, so a `.s2r` recorded under 10 still plays. The fixture is 166 bytes
 * encoded by protocol 10's own `encodeSnapshot` (2026-10-07, before the bump) and committed; nothing here re-encodes it,
 * so a change to the frozen decoder or to the bytes fails the test.
 */
const FIXTURE = Uint8Array.from(Buffer.from(readFileSync(new URL('./fixtures/snapshot-v10.hex', import.meta.url), 'utf8').trim(), 'hex'));

describe('protocol 10\'s snapshot, frozen (decodeSnapshotV10)', () => {
  it('decodes the committed v10 bytes: the own state, a body, a hostage (id 240), the doors and the environment', () => {
    expect(FIXTURE.byteLength).toBe(166);
    expect(FIXTURE[0]).toBe(2);                                  // protocol 10's Frame.Snapshot
    const s = decodeSnapshotV10(FIXTURE);
    expect(s.tick).toBe(123456);
    expect(s.own).toEqual({ ack: 4242, x: 100.5, y: 20.25, z: -300.75, vx: 1.5, vy: -2, vz: 0.25 });
    expect(s.bodies).toEqual([
      {
        id: 2, feet: [1234.5, 67.25, -890.125], yaw: 90, pitch: -12.5, vx: 10.5, vy: -3.25, vz: 0, flags: 0x7ff,
        stance: 1, landing: 2, ground: 2, weapon: 54, slot: 1, stickSnaps: 1, jumps: 7, groundForward: 1, groundRight: -63 / 127, groundCls: 3,
        action: 4, actionSerial: 200, actionT: 0.25, actionSeconds: 1.5, overlay: 3, overlayT: 0.125, overlaySeconds: 0.5,
        turnRate: -1.25, trav: 2, travFrame: 12.5, travRootY: 3.75, travBlend: 1, travBlendWeight: 1, peek: -1,
      },
      {
        id: 240, feet: [0, 0, 600], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, flags: 64,
        stance: 0, landing: 0, ground: 0, weapon: 255, slot: 0, stickSnaps: 0, jumps: 0, groundForward: 0, groundRight: 0, groundCls: -1,
        action: 0, actionSerial: 0, actionT: -1, actionSeconds: -1, overlay: 0, overlayT: -1, overlaySeconds: 0,
        turnRate: 0, trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0,
      },
    ]);
    expect(s.doors).toEqual([{ valve: 1, phase: 255 }, { valve: 0, phase: 9 }]);
    expect(s.env).toEqual({ revision: 70000, epoch: 3, states: [{ id: 2, active: true }, { id: 513, active: false }] });
  });

  it('refuses a cut or padded v10 frame, as protocol 10 did', () => {
    expect(() => decodeSnapshotV10(FIXTURE.subarray(0, FIXTURE.byteLength - 1))).toThrow(/too short/);
    expect(() => decodeSnapshotV10(Uint8Array.from([...FIXTURE, 0]))).toThrow(/trailing/);
    expect(() => decodeSnapshotV10(Uint8Array.from([1, ...FIXTURE.subarray(1)]))).toThrow(/not a snapshot/);
  });
});
