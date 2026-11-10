import { describe, expect, it } from 'vitest';
import { decodeEffectOp, ZCMD } from '../src/index';

/**
 * DF-9 (research 387 §12, Fish Hook's boats and shoreline): two command forms the decoder did not read.
 *
 * - `SCROLL_MOTION` (command 24; `FUN_0025bc20`'s 24th registration, D:L106888: begin `FUN_00260fb0` D:L109681-109703,
 *   tick `FUN_00260b40` D:L109507-109676): the visuals under the node at +6 have their texture coordinates moved by the
 *   distance the node at +7 travels along the axis at +0x14 (that node's frame), times (+0x38, +0x3c); flag 1 ends it
 *   after the seconds at +0x44, flag 8 measures the travel projected through the first node's matrix (the point at
 *   +0x20, with flag 0x10 the axis at +0x2c). Was decoded as `other`.
 * - `OBJECT_MOTION_FROM_TO`'s speed profile (flags 0x800 / 0x1000; begin `FUN_0025fe70` D:L109097-109098 and
 *   D:L109263-109289, tick `FUN_0025f9b0` D:L108997 -> `FUN_002606f0` D:L109348-109434): the block at the u16
 *   +0x0e -- three speeds (start, cruise, end), the acceleration and the deceleration, and the three phases' times.
 */

/** A command's bytes: the header (type, size) then `payload`, `size` bytes in all. */
function cmd(type: number, size: number, write: (v: DataView) => void): { set: number; cmd: number; bytes: Uint8Array } {
  const bytes = new Uint8Array(size);
  const v = new DataView(bytes.buffer);
  v.setUint32(0, (type & 0xffff) | (size << 18), true);
  write(v);
  return { set: 0, cmd: type & 0xff, bytes };
}

describe('SCROLL_MOTION (command 24)', () => {
  it('reads the scrolled node, the moving node, the axis, the texture rates and the timed form', () => {
    // MP71's washup1 (72 bytes): node 1 (`water_wash`) scrolled by node 2 (`water_node`) along (-1, 0, 0), (-0.2, 1).
    const wash = cmd(24, 72, (v) => {
      v.setUint8(4, 0); v.setUint8(6, 1); v.setUint8(7, 2);
      v.setFloat32(0x14, -1, true); v.setFloat32(0x38, -0.2, true); v.setFloat32(0x3c, 1, true);
    });
    expect(decodeEffectOp(wash, ['NA', 'water_wash', 'water_node'])).toEqual({
      op: 'scroll', node: 1, mover: 2, flags: 0, axis: [-1, 0, 0], uv: [expect.closeTo(-0.2, 6), 1], seconds: null,
    });
    // The common `bullet_advance` (flag 1): 0.1 s, (0.2, 0) along (0, -1, 0) of `bulletmover` (4), on `bullet_scroll` (3).
    const belt = cmd(24, 72, (v) => {
      v.setUint8(4, 1); v.setUint8(6, 3); v.setUint8(7, 4);
      v.setFloat32(0x18, -1, true); v.setFloat32(0x38, 0.2, true); v.setFloat32(0x44, 0.1, true);
    });
    expect(decodeEffectOp(belt, ['NA'])).toMatchObject({ op: 'scroll', node: 3, mover: 4, flags: 1, axis: [0, -1, 0], seconds: expect.closeTo(0.1, 6) });
  });

  it('flag 8: the projected form carries its point and its axis (flag 0x10), else the axis is up', () => {
    const projected = cmd(24, 72, (v) => {
      v.setUint8(4, 0x18); v.setInt8(6, -7); v.setUint8(7, 2);
      v.setFloat32(0x20, 5, true); v.setFloat32(0x2c, 1, true);
    });
    expect(decodeEffectOp(projected, ['NA'])).toMatchObject({ op: 'scroll', node: -7, projected: { point: [5, 0, 0], axis: [1, 0, 0] } });
    const up = cmd(24, 72, (v) => { v.setUint8(4, 0x08); v.setUint8(6, 1); v.setUint8(7, 2); });
    expect(decodeEffectOp(up, ['NA'])).toMatchObject({ projected: { point: [0, 0, 0], axis: [0, 1, 0] } });
    expect(decodeEffectOp(cmd(24, 72, () => {}), ['NA'])).not.toHaveProperty('projected');
  });
});

describe('OBJECT_MOTION_FROM_TO: the speed profile (flags 0x800 / 0x1000)', () => {
  /** MP71's washup1 first stroke: P at +0x70 (start 0, target (1, 0, 0)), the profile at +0x38. */
  const stroke = (flags: number) => cmd(ZCMD.OBJECT_MOTION_FROM_TO, 156, (v) => {
    v.setUint16(4, flags, true); v.setUint8(6, 2); v.setUint16(0x0c, 0x70, true); v.setUint16(0x0e, 0x38, true);
    v.setFloat32(0x34, 2.75, true);
    [0, 0.5, 0, 0.5, -1, 1, 1.25, 0.5].forEach((x, i) => v.setFloat32(0x38 + 4 * i, x, true));
    v.setFloat32(0x80, 1, true); v.setFloat32(0x8c, 1, true);
  });

  it('reads the three speeds, the two rates and the three times', () => {
    expect(decodeEffectOp(stroke(0x180a), ['NA'])).toMatchObject({
      op: 'fromTo', node: 2, flags: 0x180a, seconds: 2.75,
      translation: { from: [0, 0, 0], to: [1, 0, 0], rate: [1, 0, 0] },
      profile: { speeds: [0, 0.5, 0], accel: 0.5, decel: -1, times: [1, 1.25, 0.5] },
    });
    expect(decodeEffectOp(stroke(0x080a), ['NA'])).toHaveProperty('profile');
    expect(decodeEffectOp(stroke(0x100a), ['NA'])).toHaveProperty('profile');
  });

  it('none without either flag (the rate form); a 0 offset is read at the command itself, as the original does', () => {
    expect(decodeEffectOp(stroke(0x000a), ['NA'])).not.toHaveProperty('profile');
    // FUN_0025fe70 takes param_1 + u16(+0x0e) with no check of the offset (D:L109097-109098).
    const zero = cmd(ZCMD.OBJECT_MOTION_FROM_TO, 156, (v) => { v.setUint16(4, 0x1800, true); });
    expect(decodeEffectOp(zero, ['NA'])).toHaveProperty('profile');
  });
});
