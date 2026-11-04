import { describe, expect, it } from 'vitest';
import { engineCodes, f32, HUD_TEXT_ROWS, layoutText, measureText, penAdvance, type GlyphQuad, type TextStyle } from '../../src/index';
import { textFace } from './fixtures';

// Web research 111 §3. The expected numbers are worked by hand from the decompiled formulas (FUN_00362b70,
// FUN_00363c20, FUN_00361bd0, FUN_003625e0, FUN_00362900), in single precision rounded toward zero
// (EE_FPU_ROUNDING_READING); none was produced by running the layout.

const f = textFace();
const plain: TextStyle = { scale: 1, color: [128, 128, 128], alpha: 128 };
const box = (q: GlyphQuad): number[] => [q.left, q.top, q.right, q.bottom];

describe('FUN_00362b70: the measure', () => {
  it('sums int(w + S x (W - 1) + 0.5) + xspacing over the glyphs', () => {
    expect(measureText(f, engineCodes('AB'), 1)).toEqual({ width: 19, breaks: 0, lastLine: 19 });
  });
  it('a text of several lines measures as the SUM of its lines; a space opening a later line is skipped', () => {
    expect(measureText(f, engineCodes('A\n B'), 1)).toEqual({ width: 19, breaks: 1, lastLine: 9 });
  });
  it('#B is measured as two glyphs; a code with no glyph (0x0D) adds nothing', () => {
    expect(measureText(f, engineCodes('A#BA'), 1).width).toBe(36);   // 10, +int(7.5), +int(9.5), +int(10.5)
    expect(measureText(f, engineCodes('A\rB'), 1).width).toBe(19);
  });
  it('rounds toward zero (EE_FPU_ROUNDING_READING): W 6 at SCALE 0.9 is int(4.4999995 + 0.5) = 4, not 5', () => {
    expect(measureText(f, engineCodes('C'), f32(0.9)).width).toBe(4);
  });
  it('FUN_00363c20: the pen\'s step int((W - 1) x S + 0.5) + xspacing', () => {
    expect([penAdvance(f, 65, 1), penAdvance(f, 66, 1), penAdvance(f, 166, 1), penAdvance(f, 166, f32(0.9))]).toEqual([10, 9, 21, 19]);
  });
});

describe('FUN_003635c0: a line\'s quads', () => {
  const run = layoutText(f, engineCodes('AB'), 100, 200, plain);

  it('per glyph the drop shadow first (offset 1,1 x S, colour 0, alpha min(128, int(0.75 x 128))), then the glyph', () => {
    expect(run.quads.map((q) => [q.code, q.shadow])).toEqual([[65, true], [65, false], [66, true], [66, false]]);
    expect(box(run.quads[0]!)).toEqual([101, 177, 111, 201]);
    expect(run.quads[0]!.rgba).toEqual([0, 0, 0, 96]);
    expect(box(run.quads[1]!)).toEqual([100, 176, 110, 200]);
    expect(run.quads[1]!.rgba).toEqual([128, 128, 128, 128]);
  });

  it('the cell hangs from the pen\'s y: top (baseline + DispPos.y - h) x S, h = LR.y - UL.y - 1; texels from UL.y + 1', () => {
    expect(run.quads[1]).toMatchObject({ texture: 't.tif', u0: 2, u1: 12 + 15 / 16, v0: 1, v1: 25 });
  });

  it('the pen moves by FUN_00363c20\'s step; DispPos.x shifts the quad, not the pen', () => {
    expect(box(run.quads[2]!)).toEqual([110, 177, 120, 201]);
    expect(box(run.quads[3]!)).toEqual([109, 176, 119, 200]);
    expect(run.pen).toEqual({ x: 119, y: 200 });
    expect(run.measure.width).toBe(19);
  });

  it('HCENTERED takes int(width x 0.5) off the pen, RIGHT_JUSTIFIED the width', () => {
    expect(layoutText(f, engineCodes('AB'), 100, 200, { ...plain, hcentered: true }).quads[1]!.left).toBe(90);
    expect(layoutText(f, engineCodes('AB'), 100, 200, { ...plain, rightJustified: true }).quads[1]!.left).toBe(81);
  });

  it('a break returns the pen to the node\'s x and moves it down int(pitch); a TEXT\'s pitch is 0', () => {
    const two = layoutText(f, engineCodes('A\n B'), 100, 200, { ...plain, linePitch: 19 });
    expect(box(two.quads[3]!)).toEqual([99, 195, 109, 219]);
    expect(layoutText(f, engineCodes('A\nB'), 100, 200, plain).quads[3]!.bottom).toBe(200);
    // Centred: the first line starts half the SUM of the widths left; the second at the node's x, uncentred.
    const c = layoutText(f, engineCodes('A\nB'), 100, 200, { ...plain, hcentered: true, linePitch: 19 });
    expect([c.quads[1]!.left, c.quads[3]!.left]).toEqual([90, 99]);
  });

  it('#B toggles the bright alpha (x 1.5) and the glyph before it advances by the B\'s width (FUN_003625e0)', () => {
    const b = layoutText(f, engineCodes('A#BA'), 100, 200, plain);
    expect(b.quads.map((q) => [q.left, q.rgba[3]])).toEqual([[101, 96], [100, 128], [110, 96], [109, 192]]);
    expect(layoutText(f, engineCodes('#BA'), 100, 200, plain).quads.map((q) => q.rgba[3])).toEqual([96, 192]);
  });

  it('the colour words reach the GS as the low bytes of a PACKED RGBAQ: an alpha under 0 is 256 + int(alpha) (FUN_00361bd0, BOOT-06)', () => {
    // FUN_003635c0's colour words are int(float) (D:L260695-260705), copied into a PACKED packet whose registers are
    // 0x531 (RGBAQ, UV, XYZ2; D:L260266-260269), which keeps bits 7:0 of each word: -6.14 -> -6 -> 250 (research 141 section 2).
    const n = layoutText(f, engineCodes('A#BA'), 100, 200, { ...plain, alpha: -6.14 });
    expect(n.quads.map((q) => [q.shadow, q.rgba[3]])).toEqual([[true, 250], [false, 250], [true, 250], [false, 247]]);
    expect(layoutText(f, engineCodes('A'), 100, 200, { ...plain, alpha: -0.9 }).quads.map((q) => q.rgba[3])).toEqual([0, 0]);
  });

  it('a glyph with `color` is drawn in it at the text\'s alpha, with no shadow, from its own texture', () => {
    const c = layoutText(f, [166], 100, 200, { ...plain, alpha: 90 });
    expect(c.quads).toHaveLength(1);
    expect(c.quads[0]).toMatchObject({ texture: 'special.tif', shadow: false, rgba: [150, 150, 150, 90] });
    // HorScale 0.9: right int(100 + (22.499998 - 1) + 0.5) = 121; VertScale 0.9: foot int(200 - 2.4000015 + 0.5) = 198.
    expect(box(c.quads[0]!)).toEqual([100, 176, 121, 198]);
  });

  it('0x0D draws and advances nothing', () => {
    expect(layoutText(f, engineCodes('A\rB'), 100, 200, plain).quads.map(box)).toEqual(run.quads.map(box));
  });

  it('a glyph of several elements (a code listed twice) draws each, its shadow before it; baseline lifts the cell', () => {
    const g = layoutText(f, [96], 100, 200, plain);
    expect(g.quads.map((q) => [q.shadow, q.u1])).toEqual([[true, 126 + 15 / 16], [false, 126 + 15 / 16], [true, 125 + 15 / 16], [false, 125 + 15 / 16]]);
    expect([g.quads[1]!.top, g.quads[1]!.bottom]).toEqual([178, 202]);
    expect(g.pen.x).toBe(107);
  });

  it('the HUD\'s corner terms (5 at the foot, 6 at the head) move a glyph\'s rows; the front end\'s are 0', () => {
    const h = layoutText(f, engineCodes('A'), 100, 200, { ...plain, rows: HUD_TEXT_ROWS });
    expect([h.quads[1]!.top, h.quads[1]!.bottom]).toEqual([182, 205]);
  });
});
