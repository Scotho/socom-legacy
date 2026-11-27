import { describe, expect, it } from 'vitest';
import { LIGHT_MAP_ROW, lightMapColour, nightColour, nightRow, nightVisionRow, setNightVision } from '../src/nightVision';

/** `LensFX_NVG` on every night map. */
const LENS: [number, number, number, number] = [0.2, 0.898, 0.2, 0.24];

describe('nightVision: VU1 command 0x5c (research 84 section 14)', () => {
  it('builds FUN_003b78d0\'s row: 0.33 x the lens\'s colour, 3.0303 x its alpha', () => {
    const r = nightRow(LENS);
    expect(r[0]).toBeCloseTo(0.066, 6);
    expect(r[1]).toBeCloseTo(0.29634, 6);
    expect(r[2]).toBeCloseTo(0.066, 6);
    expect(r[3]).toBeCloseTo(0.727273, 5);
  });

  it('turns a lit colour into row.rgb x (R + G + B + row.a), alpha kept (the 0x4d8 routine)', () => {
    // A night-lit grey at a third of unity: the green channel near its old brightness, red and blue a fifth of it.
    const [r, g, b, a] = nightColour([1 / 3, 1 / 3, 1 / 3, 0.5], LENS);
    const sum = 1 + 0.727273 / 128;
    expect(g).toBeCloseTo(0.29634 * sum, 6);
    expect(r).toBeCloseTo(0.066 * sum, 6);
    expect(b).toBe(r);
    expect(a).toBe(0.5);
    // Monochrome: two colours of the same sum come out the same.
    expect(nightColour([0.9, 0.05, 0.05, 1], LENS)).toEqual(nightColour([0.05, 0.05, 0.9, 1], LENS));
  });

  it('reports the row while the goggles are on, and none after', () => {
    setNightVision(LENS);
    const row = nightVisionRow()!;
    expect(row[1]).toBeCloseTo(0.29634, 5);
    expect(row[3]).toBeCloseTo(0.727273, 4);
    setNightVision(null);
    expect(nightVisionRow()).toBeNull();
  });
});

describe('nightVision: the light map\'s EE fold (VuLightMap FUN_003b54e0, LATER 1544)', () => {
  // r0001 0x3b568c-0x3b569c (= r0004 0x3d77dc-0x3d77ec), read from the bytes: vmulax / vmadday / vmaddaz.xyz ACC,
  // vf4 (the row), vf7 (the light's colour quad +0xd8, +0xdc, +0xe0, +0xd4); vmaddz.xyz vf7, vf4, vf4.z. The constant
  // term is the row's z (not 0x5c's w), and the quad's w (the opacity) is kept.
  it('turns a light colour into row.rgb x (R + G + B + row.z) in 0..255 units, the opacity kept', () => {
    const r = nightRow(LENS);
    const [cr, cg, cb] = lightMapColour([255, 200, 120], [LENS, LENS, LENS, LENS], 0);
    const sum = 255 + 200 + 120 + r[2];
    expect(cr).toBeCloseTo(r[0] * sum, 6);
    expect(cg).toBeCloseTo(r[1] * sum, 6);
    expect(cb).toBeCloseTo(r[2] * sum, 6);
    // Green: an orange blast's spot comes out lens-green, red and blue a fifth of its green.
    expect(cg).toBeGreaterThan(cr * 4);
  });

  it('a CMesh (visual type 1) takes row 2 (0x4b4c90), any other visual row 0 (0x4b4c70)', () => {
    const cold: [number, number, number, number] = [0.1, 0.1, 0.9, 0];
    const hot: [number, number, number, number] = [0.9, 0.9, 0.1, 0];
    const rows = [cold, cold, hot, hot];
    const r2 = nightRow(hot), r0 = nightRow(cold);
    expect(lightMapColour([128, 128, 128], rows, 2)[0]).toBeCloseTo(r2[0] * (384 + r2[2]), 6);
    expect(lightMapColour([128, 128, 128], rows, 0)[0]).toBeCloseTo(r0[0] * (384 + r0[2]), 6);
    expect(LIGHT_MAP_ROW).toEqual({ mesh: 2, other: 0 });
  });

  it('leaves the colour as it is with no lens on (the flag 0x4b4a68 down)', () => {
    expect(lightMapColour([255, 200, 120], null, 0)).toEqual([255, 200, 120]);
  });
});
