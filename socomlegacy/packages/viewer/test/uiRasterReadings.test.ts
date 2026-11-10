import { describe, expect, it } from 'vitest';
import type { Rgba } from '@s2u/gs';
import type { UiDrawItem, UiModelTriangle, UiModelVertex } from '@s2u/ui';
import {
  GS_BILINEAR_WEIGHT_READING, GS_BLEND_ROUNDING_READING, GS_SPRITE_SUBPIXEL_READING, UI_2D_QUAD_Z_READING,
  UI_MODEL_DEPTH_FORMAT_READING, UI_MODEL_DEPTH_QUANTISE_READING, UI_MODEL_EDGE_RULE_READING, UI_MODEL_GOURAUD_READING, UI_QUAD_ALPHA_RANGE_READING,
  UI_TEXTURE_WRAP_READING, columnAxis, coverageBounds, rowAxis, wrap,
} from '../src/uiRasterRules';
import { rasterizeUiDrawList } from '../src/uiCompositorView';

/**
 * GM-05b (plan 2026-11-01-gpu-menus; research 380 §4): the nine readings the software drawer already made without a
 * source, named. Each constant's value says what today's software does; each test drives that software and shows the
 * behaviour the value names (and, where the GS would differ, the byte the GS's rule would give instead), so a change to
 * either side fails here. Nothing in the drawer changes: the values are today's behaviour.
 * GM-15d (the plan's Log, R1 resolved by (a)): the edge and depth readings take the GS's rules -- top-left fill and
 * `TEST_1` GEQUAL against an f32 store -- and a tenth, `UI_MODEL_DEPTH_QUANTISE_READING`, names the Z16S store the port
 * does not model.
 */

type Q4 = [number, number, number, number];
const px = (f: Rgba, x: number, y: number): number[] => [...f.data.subarray((y * f.width + x) * 4, (y * f.width + x) * 4 + 4)];
const draw = (items: UiDrawItem[]): Rgba => rasterizeUiDrawList(items, () => null).frame;
const black: UiDrawItem = { kind: 'clear', rgb: [0, 0, 0] };
const fill = (x0: number, y0: number, x1: number, y1: number, rgba: Q4): UiDrawItem =>
  ({ kind: 'sprite', node: 'f', texture: null, x0, y0, x1, y1, u0: 0, v0: 0, u1: 1, v1: 1, rgba, clip: null });
const vtx = (x: number, y: number, invW: number, rgba: Q4): UiModelVertex => ({ x, y, invW, u: 0, v: 0, rgba });
/** The triangle (0,0), (0,8), (8,0): counter-clockwise on the frame, so a culling mesh keeps it. */
const corner = (invW: number, rgba: Q4, invWc = invW, rgbaC: Q4 = rgba): UiModelTriangle =>
  ({ node: 'm', texture: null, cull: true, a: vtx(0, 0, invW, rgba), b: vtx(0, 8, invW, rgba), c: vtx(8, 0, invWc, rgbaC) });
const models = (...triangles: UiModelTriangle[]): UiDrawItem => ({ kind: 'models', triangles } as UiDrawItem);

describe('GM-05b: the nine readings, each equal to the software\'s behaviour', () => {
  it('GS_BLEND_ROUNDING_READING: a Float64 blend stored round-half-even and clamped, not the GS\'s >> 7', () => {
    expect(GS_BLEND_ROUNDING_READING).toBe('float64 blend, stored round-half-even, clamped 0..255');
    // alpha 64 = 0.5 over black: 0.5, 1.5, 2.5 store as 0, 2, 2 (half to even); the GS's (C x 64) >> 7 gives 0, 1, 2.
    expect(px(draw([black, fill(0, 0, 4, 4, [1, 3, 5, 64])]), 1, 1)).toEqual([0, 2, 2, 255]);
    // 300 x 1 clamps at 255; -20 at 0.
    expect(px(draw([black, fill(0, 0, 4, 4, [300, -20, 7, 128])]), 1, 1)).toEqual([255, 0, 7, 255]);
  });

  it('GS_BILINEAR_WEIGHT_READING: the bilinear fraction is the full Float64 one, not a 1/16 step', () => {
    expect(GS_BILINEAR_WEIGHT_READING).toBe('float64 weights');
    const left = new Float64Array(3), right = new Float64Array(3), fraction = new Float64Array(3);
    columnAxis(0, 3, 0, 3, 0, 1, 2, false, left, right, fraction);
    // u = 1/3 at x = 1: tx = 1/3 - 0.5, base -1, fraction 5/6 (the GS's 1/16 steps hold 13/16 or 14/16, never 5/6).
    expect(fraction[1]).toBe((1 / 3 - 0.5) - -1);
    expect(fraction[1]! * 16 % 1).not.toBe(0);
    const row = rowAxis(1, 0, 3, 0, 1, 2, 2, false);
    expect(row.fy).toBe((1 / 3 - 0.5) - -1);
    expect(row.iy).toBe(1 - row.fy);
  });

  it('GS_SPRITE_SUBPIXEL_READING: a quad\'s corners stay Float64; no 1/16 truncation before the fill rule', () => {
    expect(GS_SPRITE_SUBPIXEL_READING).toBe('float corners');
    // x0 0.03: ceil gives 1. Truncated to 1/16 (0.48 -> 0) the corner would be 0 and cover column 0.
    expect(coverageBounds(0.03, 0, 4, 1, 640, 448, null)).toEqual({ xs: 1, ys: 0, xe: 4, ye: 1 });
    const f = draw([black, fill(0.03, 0, 4, 1, [200, 0, 0, 128])]);
    expect(px(f, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(px(f, 1, 0)).toEqual([200, 0, 0, 255]);
  });

  it('UI_MODEL_EDGE_RULE_READING: the GS\'s top-left rule -- a pixel on a left or top edge is the triangle\'s, on a right or bottom edge it is not (GM-15d)', () => {
    expect(UI_MODEL_EDGE_RULE_READING).toBe('top-left: a pixel on a left or top edge in, on a right or bottom edge out');
    const red: Q4 = [128, 0, 0, 128];
    const f = draw([black, models(corner(1, red))]);
    // x = 0 is the corner's left edge and y = 0 its top edge: in. The hypotenuse x + y = 8 is its right-and-bottom edge: out.
    for (const [x, y] of [[0, 0], [0, 4], [4, 0], [1, 6], [6, 1], [3, 3]] as const) expect(px(f, x, y), `${x},${y} in`).toEqual([128, 0, 0, 255]);
    for (const [x, y] of [[4, 4], [7, 1], [1, 7], [5, 4]] as const) expect(px(f, x, y), `${x},${y} out`).toEqual([0, 0, 0, 255]);
    // The rule follows the edge, not the winding: the same triangle wound clockwise (a mesh that does not cull) covers
    // the same pixels.
    const cw: UiModelTriangle = { ...corner(1, red), cull: false, b: vtx(8, 0, 1, red), c: vtx(0, 8, 1, red) };
    expect(draw([black, models(cw)]).data).toEqual(f.data);
    // A shared edge is drawn once: the square (0,0)-(8,8) split along x + y = 8, additive, at an invW whose f32 rounds
    // down (0.7) -- each pixel of the diagonal is the second triangle's (its left edge), never both.
    const add = (x: number, y: number): UiModelVertex => vtx(x, y, 0.7, [60, 60, 60, 128]);
    const glow = { width: 1, height: 1, data: new Uint8ClampedArray([128, 128, 128, 255]), blend: 'additive' as const };
    const sq = rasterizeUiDrawList([{ kind: 'clear', rgb: [10, 10, 10] }, models(
      { node: 'm', texture: 'g.tif', cull: true, a: add(0, 0), b: add(0, 8), c: add(8, 0) },
      { node: 'm', texture: 'g.tif', cull: true, a: add(8, 0), b: add(0, 8), c: add(8, 8) })], (n) => (n === 'g.tif' ? glow : null)).frame;
    for (let k = 1; k < 8; k++) expect(px(sq, k, 8 - k)[0], `diagonal ${k},${8 - k} drawn once`).toBe(10 + 60);
  });

  it('UI_MODEL_DEPTH_FORMAT_READING: depth is invW stored in Float32 and tested GEQUAL against the Float32 store, the later of two equal depths winning (TEST_1 ZTST GEQUAL; ZBUF_1 PSMZ16S) (GM-15d)', () => {
    expect(UI_MODEL_DEPTH_FORMAT_READING).toBe('float32 invW, GEQUAL (the later of two equal depths wins), 0 empty');
    const red: Q4 = [128, 0, 0, 128], green: Q4 = [0, 128, 0, 128];
    // Equal invW: the later drawn wins (GEQUAL).
    expect(px(draw([black, models(corner(0.5, red), corner(0.5, green))]), 1, 1)).toEqual([0, 128, 0, 255]);
    // The second is farther in Float64 (0.5 - 1e-9 < 0.5) but its Float32 is the store's 0.5: f32 against f32, a tie,
    // so it draws. An f64 compare would keep red (the port artefact R1 counted).
    expect(px(draw([black, models(corner(0.5, red), corner(0.5 - 1e-9, green))]), 1, 1)).toEqual([0, 128, 0, 255]);
    // Farther by more than a Float32 step: hidden.
    expect(px(draw([black, models(corner(0.5, red), corner(0.25, green))]), 1, 1)).toEqual([128, 0, 0, 255]);
  });

  it('UI_MODEL_DEPTH_QUANTISE_READING: no quantisation -- the Float32 invW is the depth, where the GS stores a 16-bit Z at an unread scale (GM-15d)', () => {
    expect(UI_MODEL_DEPTH_QUANTISE_READING).toBe('none: the float32 invW compared as it stands; the Z16S store and the menus\' Z scale unread');
    const red: Q4 = [128, 0, 0, 128], green: Q4 = [0, 128, 0, 128];
    // 0.5 + 2^-20 and 0.5 are distinct Float32 values: the farther green is hidden. A 16-bit Z at any scale that maps
    // both to one unit would tie them, and GEQUAL would draw green.
    expect(Math.fround(0.5 + 2 ** -20)).not.toBe(Math.fround(0.5));
    expect(px(draw([black, models(corner(0.5 + 2 ** -20, red), corner(0.5, green))]), 1, 1)).toEqual([128, 0, 0, 255]);
  });

  it('UI_MODEL_GOURAUD_READING: a model\'s colour is interpolated perspective-correctly, not screen-linearly', () => {
    expect(UI_MODEL_GOURAUD_READING).toBe('perspective-correct colour');
    // On the edge a (0,0) invW 1 red 0 -> c (8,0) invW 0.25 red 200, at x = 4: screen-linear 100; by 1/w
    // 0.5 x 0.25 / (0.5 + 0.5 x 0.25) = 0.2 of c, so 40.
    const f = draw([black, models(corner(1, [0, 0, 0, 128], 0.25, [200, 0, 0, 128]))]);
    expect(px(f, 4, 0)).toEqual([40, 0, 0, 255]);
  });

  it('UI_2D_QUAD_Z_READING: a 2D quad carries no depth -- one drawn after the 3D pass covers its nearest triangle', () => {
    expect(UI_2D_QUAD_Z_READING).toBe('unread, unused: list order only');
    const quad = fill(0, 0, 8, 8, [0, 128, 0, 128]);
    expect(Object.keys(quad)).not.toContain('z');
    expect(px(draw([black, models(corner(1e6, [128, 0, 0, 128])), quad]), 1, 1)).toEqual([0, 128, 0, 255]);
  });

  it('UI_TEXTURE_WRAP_READING: every bitmap repeats at its edges (no per-texture clamp)', () => {
    expect(UI_TEXTURE_WRAP_READING).toBe('repeat for every bitmap');
    expect([wrap(-1, 4), wrap(4, 4), wrap(-5, 4)]).toEqual([3, 0, 3]);
    const left = new Float64Array(1), right = new Float64Array(1), fraction = new Float64Array(1);
    columnAxis(0, 1, 0, 1, 0, 1, 4, false, left, right, fraction);
    expect([left[0], right[0]]).toEqual([12, 0]);                // u 0 - 0.5 takes the last column, not a clamped column 0
    const top = rowAxis(0, 0, 1, 0, 1, 4, 4, false);
    expect([top.top, top.bottom]).toEqual([3 * 4 * 4, 0]);
  });

  it('UI_QUAD_ALPHA_RANGE_READING: an alpha byte is taken as it stands (rgba[3] / 128, up to 255 and fractional), unclamped; the menus send 0 .. 254 (GM-04)', () => {
    expect(UI_QUAD_ALPHA_RANGE_READING).toBe('rgba[3] / 128 as it stands, unclamped; the menus send 0 .. 254, fractional on three paths');
    // 255 / 128 over black: 100 x 1.9921875 = 199.2 -> 199 (clamped to 1 it would be 100). The tally's largest is 254,
    // dlgMenu's MENUFADER under 0 packed (research 380 §3).
    expect(px(draw([black, fill(0, 0, 4, 4, [100, 100, 100, 255])]), 1, 1)).toEqual([199, 199, 199, 255]);
    // A fractional byte: 128 x 64.5 / 128 = 64.5 -> 64. The menus do send such bytes (research 380 §3): the ARMORY's quads
    // (`armoryLayout.ts`, alpha x 128 unpacked), the TELETYPE cursor (`@s2u/ui` drawList, TELETYPE_CURSOR_READING) and
    // the loader screens' PMODE fade (`loaderScreens.ts`).
    expect(px(draw([black, fill(0, 0, 4, 4, [128, 128, 128, 64.5])]), 1, 1)).toEqual([64, 64, 64, 255]);
  });
});
