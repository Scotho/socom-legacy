import type { Rgba } from '@s2u/gs';
import { rasterizeUiDrawList } from './uiCompositorView';
import { decodeChannel, type UiFramePlan, type UiPlanQuad, type UiPlanRect, type UiPlanTriangle } from './uiFramePlan';
import { wrap } from './uiRasterRules';

/**
 * GM-08 (the GPU menus plan, `docs/plans/2026-11-01-gpu-menus.md`; GM.R4, GM.R5, GM.R7; research 380 §1, §2): the f32
 * twin of the GPU drawer. It runs a `UiFramePlan` the way the shaders and the fixed-function blender will (GM-11a-2,
 * GM-15): every operation rounded to f32 (`Math.fround`, the shader's `highp float`), in the software's operand order
 * (`uiCompositorView.ts`, the lines in `UI_GPU_TWIN_STEPS`), each step tagged S1-S13 (quads) and T1-T12 (models), the
 * tags the GLSL will carry (`test/uiGpuShaderTwin.test.ts` holds the two together). It is a test instrument for the
 * shaders, not a drawer: the order of proofs (GM.R5) is the f64 executor equal to the software (GM-06a/b, GM-07), then
 * this twin's statistics against the software, then the GPU against the twin.
 *
 * **No rule here is new.** Each step reproduces a line of the software drawer, which carries the rule and its citation
 * in the original (research 380 §2, the P and M rows, and the readings each step names). What the twin adds is the
 * GPU's precision: the plan's numbers as a GPU receives them (colours, axis weights and vertices as f32; axis indices
 * and texels as integers), each operation rounded once to f32, correctly rounded (a real GPU may contract into FMA or
 * divide within 2.5 ULP, ESSL 3.00 §4.5.1: the plan's risk 4, measured against the GPU in GM-11b/GM-27, not here).
 *
 * **Two paths, as the plan routes each quad (GM.R6).** `prog`: the shader computes the software's formula in f32 from the
 * destination (its batch's copy, or the live frame under `sequential`), and stores `roundEven(clamp(v, 0, 255))` (S12).
 * `ff`: the shader outputs the source colour and the blender finishes the pixel -- modelled as GL ES 3.00's
 * fixed-function blend on a fixed-point buffer (outputs clamped to [0, 1], `SRC_ALPHA, ONE_MINUS_SRC_ALPHA` or
 * `ONE, ONE` for RGB, `ONE_MINUS_DST_ALPHA, ONE` for the frame's alpha -- on an opaque frame too, see below), computed in f32 and converted to the byte once, to nearest, ties to even (`UI_GPU_TWIN_UNORM_ADAPTATION`). The models
 * are fixed-function (GM-06b: `model-ff-src`, `model-ff-add`, the alpha masked, M7), their depth `DEPTH_COMPONENT32F`
 * with `GEQUAL` (GM-15d; `GREATER` before), `invW` times a power-of-two scale (GM.R10; the plan's `UiPlanPass.depthScale`, GM-15a, read by
 * `twinDepthScale`).
 *
 * **The exact class (research 380 §1 E/E\*).** The twin marks each pixel whose bytes it claims equal to the software's:
 * a clear sets every pixel in the class; an untextured quad whose colour channels and alpha byte are f32-exact integers
 * (or a non-finite code) -- and, on `ff`, whose alpha byte is 0 or 128 or a code, checked here and not left to
 * `quadRoute`'s `fade` rule (GM-08 review F3) -- is exact (every intermediate an integer or an integer times 2^-7 below 2^24) and keeps each
 * pixel's class -- or puts it in, when it overwrites it wholly (source blend, alpha byte 128); a textured quad (P5-P8: B)
 * and a model triangle's box (M2-M5: B; whether models under `exact` join the class is the controller's ruling owed by
 * GM-06b review F1) take their pixels out; a movie picture's RGB copy leaves the class as it was (its alpha is
 * untouched). Equality is asserted on that class; the rest is counted (`twinStats`, B).
 *
 * The transparent frame's divide (P22) is the software's, in f64, applied to the twin's bytes (`divide`, on by default)
 * so it is compared with the reference as it stands; a GPU frame is presented premultiplied and compared before the
 * divide (GM-09's option).
 */

const f = Math.fround;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * UI_GPU_TWIN_UNORM_ADAPTATION: the twin's model of the fixed-function blender -- a browser adaptation (no original:
 * the GS blends in its own unit, research 380 P10-P12), and a model, not a measurement. The fragment's output clamped to
 * [0, 1], the blend computed in f32, the result converted to the byte once, to nearest, ties to even. A GPU may keep
 * more or fewer bits or round otherwise (GL ES 3.00 §2.1.6 leaves the tie implementation-defined); GM-11b and GM-27
 * measure the GPU against the twin per backend.
 */
export const UI_GPU_TWIN_UNORM_ADAPTATION = 'f32 blend of [0, 1] values, one round to nearest even' as const;

/**
 * The twin's B record on GM-04's corpus (GM-08; the twin's leg of GM.R5's provisional bound, which GM-11b completes with
 * SwiftShader's and GM-27 pins on real GPUs -- not a tolerance by itself). Per scale and blend table: the worst channel
 * |Δ| against the software and the pixels at |Δ| >= 1 in parts per million of the pixels compared, over everything and
 * outside every model box (`quads*`: the 2D rounding apart from the models' edges and depth ties). Measured by
 * `test/uiGpuTwin.disc.test.ts` in its default sample (1x every distinct frame; 2x and 4x sampled, its comment) on the
 * dev disc at 0e0cc6e44, the ppm rounded up at the second decimal; the test holds every later run at most at these. Changed
 * only by a Log entry naming the run that moved it (never widened by feel, GM.R5). **Re-pinned 2026-11-06 (the plan's Log,
 * GM-15b land):** the ppm and quadsPpm now as measured on origin/main 13cdc9a48 (the tally on the host, the twin on box
 * s1f), the same excess on GM-15b's branch; the cause is CPS-4b's VIDEO OPTIONS rows (40e037620, 10ff4f3a8): more 2D
 * quads, unchanged model columns, 0 differing pixels, exact class 0 bytes. These pins are readings of the port's own
 * output, not the original's. The max |Δ| values are unchanged.
 */
export const UI_GPU_TWIN_CORPUS_B = Object.freeze({
  '1x exact': { maxAbs: 123, ppm: 1932.11, quadsMaxAbs: 3, quadsPpm: 1928.21 },
  '1x ff': { maxAbs: 123, ppm: 5476.74, quadsMaxAbs: 3, quadsPpm: 5472.58 },
  '2x exact': { maxAbs: 29, ppm: 3113.04, quadsMaxAbs: 2, quadsPpm: 3106.06 },
  '2x ff': { maxAbs: 29, ppm: 6234.77, quadsMaxAbs: 2, quadsPpm: 6227.12 },
  '4x exact': { maxAbs: 82, ppm: 3105.70, quadsMaxAbs: 2, quadsPpm: 3098.61 },
  '4x ff': { maxAbs: 82, ppm: 6249.70, quadsMaxAbs: 2, quadsPpm: 6241.86 },
} as const);

// ---- the quad steps (S1-S13): the software's `fillQuad` (uiCompositorView.ts :208-318), in f32 ----------------------
// S1 (the integer pixel), S2 (the destination read), S4 and S5 (the axis entries) are reads, tagged where they happen.

/** S3: the alpha byte over 128 (`rgba[3] / 128`, :220; a power of two: exact). */
export function S3_alpha(byte: number): number { return f(byte / 128); }
/** S6: one source row's horizontal lerp, `d[l]·ix + d[r]·fx` (:270). */
export function S6_horizontal(dl: number, dr: number, ix: number, fx: number): number { return f(f(dl * ix) + f(dr * fx)); }
/** S7: the vertical lerp, `top·iy + lower·fy` (:296). */
export function S7_vertical(top: number, lower: number, iy: number, fy: number): number { return f(f(top * iy) + f(lower * fy)); }
/** S8: the modulate, `min(255, (t·c)/128)` (:301; T9 for the models, :440). */
export function S8_modulate(t: number, c: number): number { return Math.min(255, f(f(t * c) / 128)); }
/** S9: the alpha modulate, `(ta/255)·alpha`, unclamped (:302). */
export function S9_modulateAlpha(ta: number, alpha: number): number { return f(f(ta / 255) * alpha); }
/** S10: the frame alpha, `A + (255 − A)·min(1, a)` (:228, :308; P14). */
export function S10_frameAlpha(A: number, a: number): number { return f(A + f(f(255 - A) * Math.min(1, a))); }
/** S11: the source blend 0x44, `C + (c − C)·a` (:314; P10). */
export function S11_source(C: number, c: number, a: number): number { return f(C + f(f(c - C) * a)); }
/** S11: the additive blend 0x48, `C + c·a` (:310; P11). */
export function S11_additive(C: number, c: number, a: number): number { return f(C + f(c * a)); }
/** S12: the store -- `roundEven(clamp(v, 0, 255))`, NaN to 0: the `Uint8ClampedArray`'s (P12, `GS_BLEND_ROUNDING_READING`). */
export function S12_store(v: number): number { if (!(v > 0)) return 0; if (v >= 255) return 255; const r = Math.round(v); return r - v === 0.5 && (r & 1) === 1 ? r - 1 : r; }
/** S13: a colour channel as the GPU receives it: the plan's number, its code (P23) decoded to the IEEE value, in f32. */
export function S13_channel(value: number, code: number): number { return f(decodeChannel(value, code)); }

// The fixed-function blender (`ff`; UI_GPU_TWIN_UNORM_ADAPTATION): what the shader outputs, and what the blender does.
/**
 * S10 (ff): the frame's alpha, `ONE_MINUS_DST_ALPHA, ONE` over the source alpha `oa = clamp(a, 0, 1)` -- on the opaque
 * frame as well as the transparent one. Research 380 P14 plans the opaque frame's alpha masked (`colorMask` off) on the
 * ground that it stays 255; it does not after a quad whose alpha is NaN or infinite (P23: the software stores its
 * alpha 0, and later quads raise it again by `A + (255 − A)·min(1, a)`), which a mask cannot follow (GM-08's seeded
 * lists: alpha |Δ| up to 223 masked). Over A = 255 the blend gives 255 exactly, so it costs the common frame nothing.
 * A finding for GM-11a-2 and research 380 P14 (the GM-08 Log entry), modelled here as the fix.
 */
export function S10ff_alpha(oa: number, A: number): number { const d = f(A / 255); return f(f(oa * f(1 - d)) + d); }
/** S11 (ff): the source blend's output colour, `c / 255`, clamped by the fixed-point buffer. */
export function S11ff_sourceOut(c: number): number { return clamp01(f(c / 255)); }
/** S11 (ff): the additive blend's output colour, `min(1, c·a / 255)` (P11), clamped. */
export function S11ff_additiveOut(c: number, a: number): number { return clamp01(Math.min(1, f(f(c * a) / 255))); }
/** S11 (ff): `SRC_ALPHA, ONE_MINUS_SRC_ALPHA` over the destination byte `D`. */
export function S11ff_source(o: number, oa: number, D: number): number { const d = f(D / 255); return f(f(o * oa) + f(d * f(1 - oa))); }
/** S11 (ff): `ONE, ONE` over the destination byte `D`. */
export function S11ff_additive(o: number, D: number): number { return f(o + f(D / 255)); }
/** S12 (ff): the unorm conversion to the byte, once, to nearest even. */
export function S12ff_unorm(v: number): number { return S12_store(f(clamp01(v) * 255)); }

// ---- the model steps (T1-T12): the software's `drawModels` (uiCompositorView.ts :401-472), in f32 --------------------

/** T2: a barycentric weight at the integer point, `((b.x − x)(c.y − y) − (c.x − x)(b.y − y))·inv` (`modelDepthF32`, :440). */
export function T2_weight(bx: number, by: number, cx: number, cy: number, x: number, y: number, inv: number): number { return f(f(f(f(bx - x) * f(cy - y)) - f(f(cx - x) * f(by - y))) * inv); }
/** T2: an edge function at the integer point, `(b.x − x)(c.y − y) − (c.x − x)(b.y − y)` (GM-15d; `modelEdgeF32`; T2_weight is it times `inv`). */
export function T2_edge(bx: number, by: number, cx: number, cy: number, x: number, y: number): number { return f(f(f(bx - x) * f(cy - y)) - f(f(cx - x) * f(by - y))); }
/** T2: the third weight, `1 − w0 − w1`. */
export function T2_third(w0: number, w1: number): number { return f(f(1 - w0) - w1); }
/** T3: one edge by the top-left rule, `modelEdgeOwns` in f32 (`s` ±1, so `s·e` is exact; M2, `UI_MODEL_EDGE_RULE_READING`). */
export function T3_owns(e: number, gx: number, gy: number, s: number): boolean { return f(s * e) > 0 || (e === 0 && (f(s * gx) > 0 || (gx === 0 && f(s * gy) > 0))); }
/** T3: inside by the top-left rule -- the three edges b c, c a, a b, each's gradient from the f32 vertices, `s` inv's sign (GM-15d). */
export function T3_inside(e0: number, e1: number, e2: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number, s: number): boolean { return T3_owns(e0, f(by - cy), f(cx - bx), s) && T3_owns(e1, f(cy - ay), f(ax - cx), s) && T3_owns(e2, f(ay - by), f(bx - ax), s); }
/** T4: `invW = w0·a.invW + w1·b.invW + w2·c.invW` (`modelDepthF32`, :440). */
export function T4_invW(w0: number, w1: number, w2: number, aw: number, bw: number, cw: number): number { return f(f(f(w0 * aw) + f(w1 * bw)) + f(w2 * cw)); }
/** T5: the depth written and tested, `invW` times the pass's power-of-two scale, clamped to [0, 1] (`gl_FragDepth`). */
export function T5_depth(invW: number, scale: number): number { return clamp01(f(invW * scale)); }
/** T5: `GEQUAL` against the stored depth (0 = cleared): an equal depth passes, the later drawn wins (M3; GM-15d, `TEST_1` ZTST GEQUAL). */
export function T5_depthPasses(z: number, stored: number): boolean { return z >= stored; }
/** T6: a perspective-corrected weight, `w·(v.invW / invW)` (:448; M4, `UI_MODEL_GOURAUD_READING`). */
export function T6_perspective(w: number, vw: number, invW: number): number { return f(w * f(vw / invW)); }
/** T7: an attribute, `w0·a + w1·b + w2·c` (:450-455). */
export function T7_lerp(w0: number, w1: number, w2: number, a: number, b: number, c: number): number { return f(f(f(w0 * a) + f(w1 * b)) + f(w2 * c)); }
/** T8: `sample`'s own lerp, `a·(1 − fx) + b·fx` (:180; M5). */
export function T8_lerp(a: number, b: number, fx: number): number { return f(f(a * f(1 - fx)) + f(b * fx)); }
/** T9: the model's alpha modulate, `(s.a/255)·(rgba.a/128)` (:456). */
export function T9_modulateAlpha(sa: number, ra: number): number { return f(f(sa / 255) * f(ra / 128)); }
/** T10: no colour and no depth at `al <= 0` (:458; M6, `UI_MODEL_ZWRITE_READING`). */
export function T10_discard(al: number): boolean { return al <= 0; }

/** One step of the twin: its tag, what it does, the rule rows it reproduces, the software line (and a text it holds), its readings. */
export interface UiGpuTwinStep { tag: string; does: string; rules: string[]; software: string; line: string; readings: string[] }

/** The step table (GM.R4): research 380's rows by tag, the line of `uiCompositorView.ts` each reproduces, the readings it names. */
export const UI_GPU_TWIN_STEPS: readonly UiGpuTwinStep[] = Object.freeze([
  { tag: 'S1', does: 'the integer pixel of the quad\'s rectangle', rules: ['P3', 'P4'], software: 'uiCompositorView.ts:232', line: 'coverageBounds(x0, y0, x1, y1, W, H, clip)', readings: ['GS_SPRITE_COVERAGE_READING', 'GS_SPRITE_SUBPIXEL_READING'] },
  { tag: 'S2', does: 'the destination read: the batch\'s copy (prog) or the frame (ff, sequential)', rules: ['P10', 'P11', 'P14'], software: 'uiCompositorView.ts:323', line: 'frame[i + 3] = frame[i + 3]!', readings: [] },
  { tag: 'S3', does: 'the alpha byte over 128, unclamped', rules: ['P9'], software: 'uiCompositorView.ts:235', line: 'alpha = rgba[3]! / 128', readings: ['UI_QUAD_ALPHA_RANGE_READING'] },
  { tag: 'S4', does: 'the column entry (left, right, fx, ix), f64 on the CPU, received as f32', rules: ['P5', 'P6'], software: 'uiCompositorView.ts:276', line: 'columnAxis(xs, xe, x0, dx, uv[0], du, width, nearest, left, right, fraction)', readings: ['GS_BILINEAR_WEIGHT_READING', 'UI_TEXTURE_WRAP_READING', 'UV_REPEAT_READING'] },
  { tag: 'S5', does: 'the row entry (top, bottom, fy, iy), f64 on the CPU, received as f32', rules: ['P5', 'P6'], software: 'uiCompositorView.ts:293', line: 'rowAxis(y, y0, dy, uv[1], dv, height, width, nearest, axis)', readings: ['GS_BILINEAR_WEIGHT_READING', 'UI_TEXTURE_WRAP_READING'] },
  { tag: 'S6', does: 'a source row\'s horizontal lerp d[l]·ix + d[r]·fx', rules: ['P6'], software: 'uiCompositorView.ts:285', line: 'row[i] = data[l]! * ix + data[r]! * fx', readings: ['UI_TEXTURE_FILTER_READING'] },
  { tag: 'S7', does: 'the vertical lerp top·iy + lower·fy', rules: ['P6'], software: 'uiCompositorView.ts:311', line: 'r = topRow[i]! * iy + lowerRow[i]! * fy', readings: ['UI_TEXTURE_FILTER_READING'] },
  { tag: 'S8', does: 'the modulate min(255, (t·c)/128); untextured, the colour as it stands', rules: ['P8', 'P9'], software: 'uiCompositorView.ts:316', line: 'r = Math.min(255, (r * red) / 128)', readings: ['GS_MODULATE_BLEND_READING'] },
  { tag: 'S9', does: 'the alpha modulate (ta/255)·alpha, unclamped', rules: ['P8'], software: 'uiCompositorView.ts:317', line: 'a = (a / 255) * alpha', readings: ['GS_MODULATE_BLEND_READING', 'UI_QUAD_ALPHA_RANGE_READING'] },
  { tag: 'S10', does: 'the frame alpha A + (255 − A)·min(1, a); ff: masked (opaque) or ONE_MINUS_DST_ALPHA, ONE', rules: ['P14'], software: 'uiCompositorView.ts:323', line: '(255 - frame[i + 3]!) * Math.min(1, a)', readings: [] },
  { tag: 'S11', does: 'the blend: source C + (c − C)·a, additive C + c·a; ff: the blender', rules: ['P10', 'P11'], software: 'uiCompositorView.ts:324', line: '0x48: Cd + Cs x As', readings: ['GS_MODULATE_BLEND_READING', 'GS_ALPHA_FRAME_START_READING'] },
  { tag: 'S12', does: 'the store roundEven(clamp(v, 0, 255)); ff: the unorm conversion', rules: ['P12'], software: 'uiCompositorView.ts:325', line: 'frame[i] = frame[i]! + r * a', readings: ['GS_BLEND_ROUNDING_READING'] },
  { tag: 'S13', does: 'the non-finite codes: a NaN channel stored 0 (zeroMask), ±∞ carried as IEEE values', rules: ['P23'], software: 'uiCompositorView.ts:235', line: 'const red = rgba[0]!', readings: ['GS_BLEND_ROUNDING_READING'] },
  { tag: 'T1', does: 'the integer pixel of the triangle\'s box ceil(min)..ceil(max)', rules: ['M2'], software: 'uiCompositorView.ts:437', line: 'Math.ceil(Math.min(a.x, b.x, c.x))', readings: ['UI_MODEL_EDGE_RULE_READING'] },
  { tag: 'T2', does: 'the edge functions and the barycentric weights at the integer point', rules: ['M2'], software: 'uiCompositorView.ts:447', line: 'const e0 = modelEdgeF32(bx, by, cx, cy, x, y)', readings: ['UI_MODEL_EDGE_RULE_READING'] },
  { tag: 'T3', does: 'inside by the top-left rule (GM-15d)', rules: ['M2'], software: 'uiCompositorView.ts:448', line: 'if (!modelEdgeOwns(e0, g0x, g0y, sign)', readings: ['UI_MODEL_EDGE_RULE_READING'] },
  { tag: 'T4', does: 'invW from the weights', rules: ['M3'], software: 'uiCompositorView.ts:449', line: 'z = modelDepthF32(e0, e1, finv, aw, bw, cw)', readings: ['UI_MODEL_DEPTH_FORMAT_READING'] },
  { tag: 'T5', does: 'the depth test, GEQUAL on the f32 store, 0 empty: GEQUAL on depth32f (GM-15d)', rules: ['M3'], software: 'uiCompositorView.ts:450', line: 'if (z < depth[i]!) continue', readings: ['UI_MODEL_DEPTH_FORMAT_READING'] },
  { tag: 'T6', does: 'the perspective-corrected weights', rules: ['M4'], software: 'uiCompositorView.ts:457', line: 'w0 *= a.invW / invW', readings: ['UI_MODEL_GOURAUD_READING'] },
  { tag: 'T7', does: 'u, v and the colour from the weights', rules: ['M4'], software: 'uiCompositorView.ts:459', line: 'w0 * a.rgba[ch]! + w1 * b.rgba[ch]! + w2 * c.rgba[ch]!', readings: ['UI_MODEL_GOURAUD_READING'] },
  { tag: 'T8', does: 'sample() at (u·W, (1 − v)·H), REPEAT, its own lerp form', rules: ['M5'], software: 'uiCompositorView.ts:463', line: 'sample(tex, u * tex.width, (1 - v) * tex.height, s)', readings: ['UI_MODEL_TEXTURE_ROWS_READING', 'UV_REPEAT_READING', 'UI_TEXTURE_FILTER_READING'] },
  { tag: 'T9', does: 'the modulate; untextured, the colour as it stands', rules: ['M5', 'P8'], software: 'uiCompositorView.ts:465', line: 'al = (s[3]! / 255) * (rgba[3]! / 128)', readings: ['GS_MODULATE_BLEND_READING'] },
  { tag: 'T10', does: 'no colour and no depth at al <= 0', rules: ['M6'], software: 'uiCompositorView.ts:467', line: 'if (al <= 0) continue', readings: ['UI_MODEL_ZWRITE_READING'] },
  { tag: 'T11', does: 'the blend (ff: the blender), the frame alpha untouched', rules: ['M7', 'P10', 'P11'], software: 'uiCompositorView.ts:470', line: 'if (additive) {', readings: ['UI_MESH_BIND_READING'] },
  { tag: 'T12', does: 'the depth written', rules: ['M3'], software: 'uiCompositorView.ts:468', line: 'depth[i] = z', readings: ['UI_MODEL_DEPTH_FORMAT_READING'] },
] as UiGpuTwinStep[]);

/** The order the quad routine carries the S tags in: the order the quad programs' GLSL must carry them (GM-11a-2). */
export const UI_GPU_TWIN_QUAD_ORDER = Object.freeze(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12', 'S13'] as const);
/** The order the triangle routine carries the T tags in (GM-15). */
export const UI_GPU_TWIN_MODEL_ORDER = Object.freeze(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'] as const);

export interface UiGpuTwinOptions {
  /** Programmable quads read the live frame instead of their batch's copy: equal bytes prove the batches (GM.R7). */
  sequential?: boolean;
  /** P22: divide a transparent frame back to straight RGB, as the software does (default true; a GPU does not). */
  divide?: boolean;
}

export interface UiGpuTwinFrame {
  frame: Rgba;
  undrawn: string[];
  /** Per pixel: 1 in the exact class (the twin claims the software's bytes), 0 bounded. */
  exact: Uint8Array;
  /** Per pixel: 1 inside a drawn model triangle's box (the models' B: edges and depth ties, research 380 M2, M3). */
  models: Uint8Array;
  /** The plan's verdict was `software`: the reference drew it (L1), every pixel in the class. */
  software: boolean;
}

/**
 * GM.R10's depth scale for a pass: the plan's (`UiPlanPass.depthScale`, `passDepthScale` in `uiFramePlan.ts`; GM-15a
 * settled it there), so the twin and the GPU's `u_depthScale` read one value. The largest power of two `2^-k`, k >= 0,
 * that brings every vertex's f32 `invW` to at most 1/2 (GM-15b: no pixel's depth reaches the clamp at 1); a power of
 * two changes no comparison unless it underflows, which the plan refuses (`UI_GPU_MODEL_DEPTH_FLOOR`, GM-15b).
 */
export function twinDepthScale(plan: UiFramePlan, pass: number): number {
  return plan.passes[pass]!.depthScale;
}

/** The plan run on the twin (see the module's comment). Pure in the plan: its inputs are read, never written. */
export function executeFramePlanOnTwin(plan: UiFramePlan, opts: UiGpuTwinOptions = {}): UiGpuTwinFrame {
  if (plan.verdict === 'software') {
    const { items, textures, options } = plan.source;
    const { frame, undrawn } = rasterizeUiDrawList(items, textures, options);
    return { frame, undrawn, exact: new Uint8Array(frame.width * frame.height).fill(1), models: new Uint8Array(frame.width * frame.height), software: true };
  }
  const { width: W, height: H, transparent } = plan.target;
  const data = new Uint8ClampedArray(W * H * 4);
  const exact = new Uint8Array(W * H).fill(1), models = new Uint8Array(W * H);
  if (!transparent) for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const copies = new Map<number, { rect: UiPlanRect; bytes: Uint8ClampedArray }>();
  let depth: Float32Array | null = null, depthScale = 1;
  for (const step of plan.steps) {
    if (step.kind === 'clear') {
      for (let i = 0; i < data.length; i += 4) { data[i] = step.bytes[0]; data[i + 1] = step.bytes[1]; data[i + 2] = step.bytes[2]; data[i + 3] = step.bytes[3]; }
      exact.fill(1);
      continue;
    }
    if (step.kind === 'movie') { drawMovie(plan, step.movie, step.rect, data, W); continue; }
    if (step.kind === 'pass') { if (depth) depth.fill(0); else depth = new Float32Array(W * H); depthScale = twinDepthScale(plan, step.pass); continue; }
    if (step.kind === 'triangles') { for (const i of step.triangles) drawTriangleTwin(plan, plan.triangles[i]!, data, W, depth!, depthScale, exact, models); continue; }
    if (step.kind === 'copy') {
      if (opts.sequential) continue;
      const r = step.rect, rw = r.xe - r.xs, bytes = new Uint8ClampedArray(rw * (r.ye - r.ys) * 4);
      for (let y = r.ys; y < r.ye; y++) bytes.set(data.subarray((y * W + r.xs) * 4, (y * W + r.xe) * 4), (y - r.ys) * rw * 4);
      copies.set(step.batch, { rect: r, bytes });
      continue;
    }
    for (const i of step.quads) {
      const q = plan.quads[i]!;
      // The quad's colour as the GPU receives it: f32 numbers, each code (P23) decoded to its IEEE value (S13's half).
      const rgba = [S13_channel(q.colour[0], q.codes[0]), S13_channel(q.colour[1], q.codes[1]), S13_channel(q.colour[2], q.codes[2]), S13_channel(q.colour[3], q.codes[3])];
      drawQuadTwin(plan, q, rgba, data, W, q.path === 'prog' && !opts.sequential ? copies.get(q.batch!)! : null, exact);
    }
  }
  if (transparent && opts.divide !== false) for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]! / 255;
    if (a > 0 && a < 1) { data[i] = data[i]! / a; data[i + 1] = data[i + 1]! / a; data[i + 2] = data[i + 2]! / a; }
  }
  return { frame: { width: W, height: H, data }, undrawn: plan.undrawn.slice(), exact, models, software: false };
}

/** An f32-exact integer channel, or a non-finite one carried by its code (P23): the exact class's colour. */
const exactChannel = (v: number, code: number): boolean => code !== 0 || (Number.isInteger(v) && f(v) === v);

/** One quad, as its program and (on `ff`) the blender draw it: S1-S13 in the shader's order. */
function drawQuadTwin(plan: UiFramePlan, q: UiPlanQuad, rgba: readonly number[], frame: Uint8ClampedArray, W: number,
  copy: { rect: UiPlanRect; bytes: Uint8ClampedArray } | null, exact: Uint8Array): void {
  // S1: the pixels xs <= x < xe, ys <= y < ye -- the plan's integer rectangle (P3, P4), no fill rule involved.
  const { xs, ys, xe, ye } = q.rect;
  // S2: the destination: the batch's copy for a programmable quad, else the frame as it stands (ff: the blender's).
  const src = copy ? copy.bytes : frame;
  const cw = copy ? copy.rect.xe - copy.rect.xs : 0;
  const at = (x: number, y: number): number => (copy ? ((y - copy.rect.ys) * cw + (x - copy.rect.xs)) * 4 : (y * W + x) * 4);
  const red = rgba[0]!, green = rgba[1]!, blue = rgba[2]!;
  // S3: the alpha byte over 128.
  const alpha = S3_alpha(rgba[3]!);
  const additive = q.blend === 'additive', prog = q.path === 'prog', zero = q.zeroMask;
  const tex = q.texture === null ? null : plan.textures[q.texture]!;
  // The exact class (research 380 §1): see the module's comment.
  // On `ff` the class also asks the alpha byte be 0 or 128 (or a code) itself, not through quadRoute's `fade` rule
  // (P13; GM-08 review F3): the blender's unorm model and the software's f64 part at other alpha bytes.
  const inClass = !tex && q.codes.every((c, k) => exactChannel(q.colour[k]!, c))
    && (prog || q.codes[3] !== 0 || q.colour[3] === 0 || q.colour[3] === 128);
  const overwrites = inClass && !additive && zero === 0 && q.codes[3] === 0 && q.colour[3] === 128;
  const axis = plan.axis;
  // S4: the column entries (left, right, fx, ix) as the axis texture (RGBA32F) holds them: indices exact, weights f32.
  const cols = xe - xs, column = tex ? new Float32Array(cols * 4) : null;
  if (tex) for (let k = 0; k < cols * 4; k++) column![k] = axis[q.axis!.column + k]!;
  const d = tex ? tex.image.data : null;
  const out = [0, 0, 0, 0];
  for (let y = ys; y < ye; y++) {
    let top = 0, bottom = 0, fy = 0, iy = 0;
    // S5: the row entry (top, bottom, fy, iy): rows as texel rows (the plan's row index times the width), weights f32.
    if (tex) { const o = q.axis!.row + (y - ys) * 4; top = f(axis[o]!) * tex.width; bottom = f(axis[o + 1]!) * tex.width; fy = f(axis[o + 2]!); iy = f(axis[o + 3]!); }
    for (let x = xs; x < xe; x++) {
      const i = (y * W + x) * 4, j = at(x, y), p = y * W + x;
      let r: number, g: number, b: number, a: number;
      if (d) {
        const o = (x - xs) * 4, l = column![o]!, rt = column![o + 1]!, fx = column![o + 2]!, ix = column![o + 3]!;
        const tl = (top + l) * 4, tr = (top + rt) * 4, bl = (bottom + l) * 4, br = (bottom + rt) * 4;
        // S6 (each source row) then S7 -- the software's horizontal-then-vertical order, f32 at every operation.
        const t0 = S6_horizontal(d[tl]!, d[tr]!, ix, fx), t1 = S6_horizontal(d[tl + 1]!, d[tr + 1]!, ix, fx);
        const t2 = S6_horizontal(d[tl + 2]!, d[tr + 2]!, ix, fx), t3 = S6_horizontal(d[tl + 3]!, d[tr + 3]!, ix, fx);
        const l0 = S6_horizontal(d[bl]!, d[br]!, ix, fx), l1 = S6_horizontal(d[bl + 1]!, d[br + 1]!, ix, fx);
        const l2 = S6_horizontal(d[bl + 2]!, d[br + 2]!, ix, fx), l3 = S6_horizontal(d[bl + 3]!, d[br + 3]!, ix, fx);
        r = S7_vertical(t0, l0, iy, fy); g = S7_vertical(t1, l1, iy, fy); b = S7_vertical(t2, l2, iy, fy); a = S7_vertical(t3, l3, iy, fy);
        // S8 and S9 -- the modulate.
        r = S8_modulate(r, red); g = S8_modulate(g, green); b = S8_modulate(b, blue);
        a = S9_modulateAlpha(a, alpha);
      } else { r = red; g = green; b = blue; a = alpha; }   // S8 (untextured): the colour as it stands
      const A = src[j + 3]!, C0 = src[j]!, C1 = src[j + 1]!, C2 = src[j + 2]!;
      if (prog) {
        // S10, S11 and S12 -- the software's formula in the shader, stored roundEven(clamp(v)).
        const nA = S10_frameAlpha(A, a);
        const n0 = additive ? S11_additive(C0, r, a) : S11_source(C0, r, a);
        const n1 = additive ? S11_additive(C1, g, a) : S11_source(C1, g, a);
        const n2 = additive ? S11_additive(C2, b, a) : S11_source(C2, b, a);
        out[0] = S12_store(n0); out[1] = S12_store(n1); out[2] = S12_store(n2); out[3] = S12_store(nA);
      } else {
        // S11 (ff): the shader's output, then the blender; S10 (ff): the alpha blended, opaque or transparent (S10ff_alpha).
        const oa = clamp01(a);
        if (additive) { out[0] = S12ff_unorm(S11ff_additive(S11ff_additiveOut(r, a), C0)); out[1] = S12ff_unorm(S11ff_additive(S11ff_additiveOut(g, a), C1)); out[2] = S12ff_unorm(S11ff_additive(S11ff_additiveOut(b, a), C2)); }
        else { out[0] = S12ff_unorm(S11ff_source(S11ff_sourceOut(r), oa, C0)); out[1] = S12ff_unorm(S11ff_source(S11ff_sourceOut(g), oa, C1)); out[2] = S12ff_unorm(S11ff_source(S11ff_sourceOut(b), oa, C2)); }
        out[3] = S12ff_unorm(S10ff_alpha(oa, A));
      }
      // S13: a NaN channel stored 0 whatever the pixel (zeroMask; bit 3: all four).
      if (zero & 0b1000) { out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 0; }
      else { if (zero & 1) out[0] = 0; if (zero & 2) out[1] = 0; if (zero & 4) out[2] = 0; }
      frame[i] = out[0]!; frame[i + 1] = out[1]!; frame[i + 2] = out[2]!; frame[i + 3] = out[3]!;
      if (!inClass) exact[p] = 0; else if (overwrites) exact[p] = 1;
    }
  }
}

/** P17: the picture's RGB at the origin over `rect`, nearest `p / s`; alpha untouched (integers: the executor's own). */
function drawMovie(plan: UiFramePlan, index: number, rect: UiPlanRect, frame: Uint8ClampedArray, W: number): void {
  const s = plan.target.scale, pic = plan.movies[index]!.image, pw = pic.width, d = pic.data;
  for (let y = rect.ys; y < rect.ye; y++) {
    const sy = Math.floor(y / s);
    for (let x = rect.xs; x < rect.xe; x++) {
      const sx = Math.floor(x / s), p = (sy * pw + sx) * 4, o = (y * W + x) * 4;
      frame[o] = d[p]!; frame[o + 1] = d[p + 1]!; frame[o + 2] = d[p + 2]!;
    }
  }
}

/** T8: `sample` at (U, V) texel coordinates in f32: `x = U − .5`, `floor`, REPEAT in integers, its own lerp form. */
function sampleTwin(t: Rgba, U: number, V: number, out: number[]): void {
  const x = f(U - 0.5), y = f(V - 0.5);
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = f(x - x0), fy = f(y - y0);
  const xa = wrap(x0, t.width), xb = wrap(x0 + 1, t.width), ya = wrap(y0, t.height), yb = wrap(y0 + 1, t.height);
  const d = t.data;
  for (let c = 0; c < 4; c++) {
    const a = d[(ya * t.width + xa) * 4 + c]!, b = d[(ya * t.width + xb) * 4 + c]!;
    const e = d[(yb * t.width + xa) * 4 + c]!, g = d[(yb * t.width + xb) * 4 + c]!;
    out[c] = f(f(T8_lerp(a, b, fx) * f(1 - fy)) + f(T8_lerp(e, g, fx) * fy));
  }
}

/** One model triangle as `model-ff-*` draws it against the pass's depth: T1-T12 in the shader's order. */
function drawTriangleTwin(plan: UiFramePlan, t: UiPlanTriangle, frame: Uint8ClampedArray, W: number, depth: Float32Array, depthScale: number, exact: Uint8Array, models: Uint8Array): void {
  // T1: the integer box ceil(min) .. ceil(max), clipped (the plan's); the vertices as f32 attributes.
  const { box } = t;
  const ax = f(t.a.x), ay = f(t.a.y), bx = f(t.b.x), by = f(t.b.y), cx = f(t.c.x), cy = f(t.c.y);
  const aw = f(t.a.invW), bw = f(t.b.invW), cw = f(t.c.invW);
  const inv = f(1 / t.area);   // the f64 area's reciprocal, uploaded as f32
  const sign = inv < 0 ? -1 : 1;   // the winding, from inv's sign (the shader's s)
  const tex = t.texture === null ? null : plan.textures[t.texture]!.image;
  const additive = t.blend === 'additive';
  const s = [0, 0, 0, 0];
  const va = [...t.a.rgba].map(f), vb = [...t.b.rgba].map(f), vc = [...t.c.rgba].map(f);
  const ua = f(t.a.u), ub = f(t.b.u), uc = f(t.c.u), wa = f(t.a.v), wb = f(t.b.v), wc = f(t.c.v);
  for (let y = box.ys; y < box.ye; y++) {
    for (let x = box.xs; x < box.xe; x++) {
      exact[y * W + x] = 0; models[y * W + x] = 1;   // the box is class B (M2-M5): the twin and the software may part at an edge or a tie
      // T2 and T3 -- the edge functions and the weights at the integer point, inside by the top-left rule.
      const e0 = T2_edge(bx, by, cx, cy, x, y), e1 = T2_edge(cx, cy, ax, ay, x, y), e2 = T2_edge(ax, ay, bx, by, x, y);
      let w0 = T2_weight(bx, by, cx, cy, x, y, inv), w1 = T2_weight(cx, cy, ax, ay, x, y, inv), w2 = T2_third(w0, w1);
      if (!T3_inside(e0, e1, e2, ax, ay, bx, by, cx, cy, sign)) continue;
      // T4 and T5 -- invW, and the depth test against the pass's depth (GEQUAL; 0 = cleared).
      const invW = T4_invW(w0, w1, w2, aw, bw, cw);
      const i = y * W + x, z = T5_depth(invW, depthScale);
      if (!T5_depthPasses(z, depth[i]!)) continue;
      // T6 and T7 -- perspective-correct weights, then the attributes.
      w0 = T6_perspective(w0, aw, invW); w1 = T6_perspective(w1, bw, invW); w2 = T6_perspective(w2, cw, invW);
      const r0 = T7_lerp(w0, w1, w2, va[0]!, vb[0]!, vc[0]!), r1 = T7_lerp(w0, w1, w2, va[1]!, vb[1]!, vc[1]!);
      const r2 = T7_lerp(w0, w1, w2, va[2]!, vb[2]!, vc[2]!), r3 = T7_lerp(w0, w1, w2, va[3]!, vb[3]!, vc[3]!);
      let r: number, g: number, bl: number, al: number;
      if (tex) {
        const u = T7_lerp(w0, w1, w2, ua, ub, uc), v = T7_lerp(w0, w1, w2, wa, wb, wc);
        // T8: the texel at (u W, (1 - v) H).
        sampleTwin(tex, f(u * tex.width), f(f(1 - v) * tex.height), s);
        // T9: the modulate (S8's form for the colour).
        r = S8_modulate(s[0]!, r0); g = S8_modulate(s[1]!, r1); bl = S8_modulate(s[2]!, r2);
        al = T9_modulateAlpha(s[3]!, r3);
      } else { r = r0; g = r1; bl = r2; al = f(r3 / 128); }   // T9 (untextured): the colour as it stands
      // T10: nothing written at al <= 0.
      if (T10_discard(al)) continue;
      // T11: the fixed-function blend (model-ff-src / model-ff-add), the frame alpha masked (M7).
      const o = i * 4;
      if (additive) {
        frame[o] = S12ff_unorm(S11ff_additive(S11ff_additiveOut(r, al), frame[o]!));
        frame[o + 1] = S12ff_unorm(S11ff_additive(S11ff_additiveOut(g, al), frame[o + 1]!));
        frame[o + 2] = S12ff_unorm(S11ff_additive(S11ff_additiveOut(bl, al), frame[o + 2]!));
      } else {
        const oa = clamp01(al);
        frame[o] = S12ff_unorm(S11ff_source(S11ff_sourceOut(r), oa, frame[o]!));
        frame[o + 1] = S12ff_unorm(S11ff_source(S11ff_sourceOut(g), oa, frame[o + 1]!));
        frame[o + 2] = S12ff_unorm(S11ff_source(S11ff_sourceOut(bl), oa, frame[o + 2]!));
      }
      // T12: the depth written.
      depth[i] = z;
    }
  }
}

/** B statistics of a twin frame against the reference (research 380 §1): per channel max |Δ|, pixels at |Δ| >= 1, 2, 3. */
export interface UiGpuTwinStats {
  pixels: number;
  /** Pixels with any channel differing. */
  differing: number;
  maxAbs: [number, number, number, number];
  /** Pixels whose largest channel |Δ| is at least 1, 2, 3. */
  atLeast: [number, number, number];
  /** Pixels in the twin's exact class, and those of them that differ (asserted 0: E/E\*). */
  exactPixels: number;
  /** The same B statistics outside every model box (the quads' rounding apart from the models' edges and ties). */
  quads: { maxAbs: [number, number, number, number]; atLeast: [number, number, number] };
  exactDiffering: number;
}

export function twinStats(got: Rgba, want: Rgba, exact: Uint8Array, models?: Uint8Array): UiGpuTwinStats {
  const a = got.data, b = want.data, n = got.width * got.height;
  if (a.length !== b.length || exact.length !== n) throw new Error(`twinStats: frames ${got.width}x${got.height} and ${want.width}x${want.height}`);
  const maxAbs: [number, number, number, number] = [0, 0, 0, 0], atLeast: [number, number, number] = [0, 0, 0];
  let differing = 0, exactPixels = 0, exactDiffering = 0;
  const quads: UiGpuTwinStats['quads'] = { maxAbs: [0, 0, 0, 0], atLeast: [0, 0, 0] };
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    let m = 0;
    for (let c = 0; c < 4; c++) { const dd = Math.abs(a[i + c]! - b[i + c]!); if (dd > maxAbs[c]!) maxAbs[c] = dd; if (dd > m) m = dd; }
    if (exact[p]) exactPixels++;
    if (m === 0) continue;
    differing++;
    if (m >= 1) atLeast[0]++;
    if (m >= 2) atLeast[1]++;
    if (m >= 3) atLeast[2]++;
    if (exact[p]) exactDiffering++;
    if (models?.[p]) continue;
    for (let c = 0; c < 4; c++) { const dd = Math.abs(a[i + c]! - b[i + c]!); if (dd > quads.maxAbs[c]!) quads.maxAbs[c] = dd; }
    if (m >= 1) quads.atLeast[0]++;
    if (m >= 2) quads.atLeast[1]++;
    if (m >= 3) quads.atLeast[2]++;
  }
  return { pixels: n, differing, maxAbs, atLeast, exactPixels, exactDiffering, quads };
}
