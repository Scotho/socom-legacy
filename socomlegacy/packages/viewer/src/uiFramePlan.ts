import type { Rgba } from '@s2u/gs';
import { UI_FRAME, type MoviePicture, type UiClip, type UiDrawItem, type UiModelVertex } from '@s2u/ui';
import type { UiSamplingSettings } from './experimentalUiSampling';
import { GS_ALPHA_FRAME_START_READING, type UiBitmap, type UiBlend, type UiHdTextures, type UiTextures } from './uiCompositorView';
import {
  MOVIE_NO_PICTURE_BLEND, blendAfterBind, clearBytes, columnAxis, coverageBounds, pickBitmap, rasterScale, rowAxis, scaleAt, scaleClip,
} from './uiRasterRules';

/**
 * GM-06a/b (the GPU menus plan, `docs/plans/2026-11-01-gpu-menus.md`; research 380 §2.1, §2.2): the frame planner. Pure:
 * it turns a draw list into a `UiFramePlan` -- the steps a drawer runs, in the list's order (P1), each 2D quad as an
 * integer rectangle (P3, P4), its colour as a GPU can carry it (P23: finite values, a closed code table, `zeroMask`),
 * its texels through f64 axis tables (GM.R3; P5, P6), its blend as the register stands (P2, P16, P20) and its path,
 * fixed-function or programmable, by the blend table (GM.R6; P10, P11, P13). Programmable quads are grouped into
 * batches whose quads do not overlap, each read from one copy of the destination taken before it (GM.R7). The f64 CPU
 * executor (`uiFramePlanCpu.ts`) runs a plan and must give `rasterizeUiDrawList`'s bytes; the f32 twin (GM-08) and
 * the GPU (GM-11b) run the same plan.
 *
 * **No rule here is new.** Every rule a step carries is the software drawer's, taken from the same code
 * (`uiRasterRules.ts`, GM-05; `GS_ALPHA_FRAME_START_READING` in `uiCompositorView.ts`), and each is cited to the
 * original, at its level, in research 380 §2 and the readings it names (§4). What this module adds decides only *how* a
 * GPU reproduces those bytes -- the routing, the runs, the batches, the encodings -- and changes no pixel: the executor's
 * equality with the software on every case (`test/uiFramePlan.test.ts`) holds it. The routing is a browser
 * implementation choice under GM.R6 (`UI_GPU_BLEND_ADAPTATION`), not a game value.
 *
 * **2D quads keep no depth** (`UI_2D_QUAD_Z_READING`, today's behaviour): no step gives a 2D quad a depth buffer or a
 * depth test, and none will share the models' depth buffer until `DAT_004a44e0` is read and that reading is settled
 * (the original sends a Z with every 2D quad, `FUN_003643b0` D:L261681-261691, under the bind packets' ZTE 1 GEQUAL;
 * GM-05b review F3).
 *
 * **The models (GM-06b; research 380 M1-M7).** A `models` item with triangles is a *pass*: a `pass` step (a depth
 * buffer of its own, cleared to 0 = empty, `UI_MODEL_DEPTH_FORMAT_READING`; never shared with a 2D quad, GM-05b review
 * F3) and runs of `triangles` steps in list order (P1), each triangle as the software draws it (`drawModels` in
 * `uiCompositorView.ts`): its vertices on the target's grid (x, y times the scale), its signed area, its integer box
 * `ceil(min) .. ceil(max)` clipped to the frame (M2), its texture (the HD pick, `pickBitmap`) and the `ALPHA_1` it is
 * drawn under. A zero-area triangle, a culled back face and a missing bitmap are not drawn and bind nothing (M1,
 * `UI_MESH_BIND_READING`); a drawn one binds. The per-pixel rules -- the GS's top-left edges at the integer point (M2,
 * `UI_MODEL_EDGE_RULE_READING`), the f32 depth tested GEQUAL against the f32 store (M3; both in the GPU's f32
 * arithmetic, `modelEdgeF32`, `modelDepthF32`; GM-15d), the perspective-correct texel and colour (M4,
 * `UI_MODEL_GOURAUD_READING`), `sample`'s lerp at `(u W, (1 - v) H)` (M5, `UI_MODEL_TEXTURE_ROWS_READING`), no write at
 * `al <= 0` (M6, `UI_MODEL_ZWRITE_READING`), the frame alpha untouched (M7) -- are the drawer's, run from these numbers.
 * A triangle the fixed-function blend cannot take (`triangleRoute`), a vertex not finite, or one at `invW <= 0` (the
 * GPU clamps a negative `gl_FragDepth` to 0, which passes GEQUAL over the clear, where the software's negative depth
 * fails it) gives the verdict `software`, named (GM.R10:
 * the first L1 until GM-26). GM-15a: every other pass is drawn on the GPU (`model-ff-src`, `model-ff-add`), its depth
 * `invW` times the pass's `depthScale` (`passDepthScale`). GM-15b adds two refusals, both `software`, named, where a
 * GPU's numbers leave the range the shader's arithmetic is defined in: a pass whose depth leaves f32's normal range
 * (`UI_GPU_MODEL_DEPTH_FLOOR`), and a textured triangle whose texel coordinate leaves the int range of T8's floor
 * (`UI_GPU_MODEL_TEXEL_RANGE`). Neither changes a byte: an L1 frame is the software's.
 *
 * **The movie (GM-06b; P16, P17).** A picture is a `movie` step: an RGB copy at the origin over the picture's size
 * times the scale (clipped to the frame), each pixel the picture's at `p / s` (nearest), the alpha untouched, the
 * register untouched (`MOVIE_RECT_READING`). The no-picture movie stays the black untextured quad by source (P16).
 * A picture's pixels are not hashed (`volatile`); its size is.
 *
 * A pass and a movie step end the open programmable batch and run: a batch's copy is taken after them.
 */

/**
 * UI_GPU_FRAME_FALLBACK_SCALE_ADAPTATION: no original; bounds the browser's work on a frame the GPU does not draw (L1,
 * GM.R9, GM-14a): under HD (scale 2 or 4) the software draws that frame at **this scale** -- 1, the original frame, with
 * no HD lookup and no quad cache (both are the HD scale's) -- and the GPU shows it at the HD size, each pixel `s x s`
 * (one NEAREST blit, `UiGpuBackend.uploadFrame`), so the 65-87 ms 4x software path (a Node microbench, GM.R9) never
 * reaches a player's frame. The owner's question O2 (H375) asks whether the HD menus may drop to 1x so; the default
 * meanwhile is yes. At scale 1 it changes nothing.
 */
export const UI_GPU_FRAME_FALLBACK_SCALE_ADAPTATION = Object.freeze({ scale: 1 } as const);
/**
 * UI_GPU_DEV_SAMPLING_FALLBACK_ADAPTATION: no original; bounds the browser's dev preview (GM.R9's exception): a frame
 * under dev `uiSampling` other than bilinear (P7 nearest, `integer`, `sharpen`; `?expMenu`, reachable only under
 * `devSwitches(search).tools` in a development build, `parseMenuSampling`) is drawn by the software at the **shown**
 * scale, so the preview does not silently change scale.
 */
export const UI_GPU_DEV_SAMPLING_FALLBACK_ADAPTATION = Object.freeze({ scale: 'shown' } as const);

/** Fixed-function (`ff`) or programmable (`prog`): how a GPU blends one quad. */
export type UiPlanPath = 'ff' | 'prog';
/** The blend table's value for a surface at a scale (GM.R6; `UI_GPU_BLEND_ADAPTATION`, `uiGpuSwitch.ts`). */
export type UiPlanBlendMode = 'ff' | 'exact';
/**
 * Why a quad is programmable: `exact` the blend table routes every quad so; under `ff`, the first of P23 `colour`
 * (a non-finite value, a negative RGB, an untextured RGB over 255), P10/P11 `negative` (an alpha under 0), P10 `over1`
 * (a source-blend alpha over 1, `rgba[3] > 128`), P13 `fade` (an untextured quad whose alpha is not whole: neither 0
 * nor 128 -- MENUFADER's 254 under the roller's additive included, GM-04 review F1).
 */
export type UiPlanWhy = 'exact' | 'colour' | 'negative' | 'over1' | 'fade';

/**
 * The closed code table for a colour channel a GPU cannot carry as a number (P23): the plan's value is then 0 and the
 * code names what the software computes with. A shader branches on the code; the CPU executor decodes it.
 */
export const UI_PLAN_CODE = Object.freeze({ finite: 0, nan: 1, posInf: 2, negInf: 3 } as const);
export type UiPlanCode = (typeof UI_PLAN_CODE)[keyof typeof UI_PLAN_CODE];
/** A channel's value from its encoded number and code (the table's inverse). */
export function decodeChannel(value: number, code: number): number {
  return code === UI_PLAN_CODE.finite ? value : code === UI_PLAN_CODE.nan ? NaN : code === UI_PLAN_CODE.posInf ? Infinity : -Infinity;
}

/** Integer pixels `xs <= x < xe`, `ys <= y < ye` on the target. */
export interface UiPlanRect { xs: number; ys: number; xe: number; ye: number }

/** A texture the plan samples: the bitmap the list names, or its HD replacement (`pickBitmap`), with its bind's blend. */
export interface UiPlanTexture {
  name: string;
  width: number;
  height: number;
  /** HD-3: the pack's replacement was picked. */
  hd: boolean;
  blend: UiBlend;
  /** The factors on a glyph's texel coordinates (the replacement's size over the bitmap's; 1 without one). */
  su: number;
  sv: number;
  /** The pixels, top row first: a handle for the drawer, not part of the plan's hash (the texture cache owns contents). */
  image: Rgba;
}

/** One drawn 2D quad. */
export interface UiPlanQuad {
  node: string;
  /** The draw-list item it came from. */
  item: number;
  /** The pixels it covers (P3, P4): `coverageBounds` at the target's scale. */
  rect: UiPlanRect;
  /** The corners on the target's grid, as the axis tables take them. */
  x0: number; y0: number; x1: number; y1: number;
  /** Index into `textures`; null: untextured. */
  texture: number | null;
  /** Texel coordinates `[u0, v0, u1, v1]` on the planned texture; zeros when untextured. */
  uv: [number, number, number, number];
  /** `rgba` as numbers a GPU can carry: a non-finite channel is 0 here and named in `codes`. */
  colour: [number, number, number, number];
  codes: [UiPlanCode, UiPlanCode, UiPlanCode, UiPlanCode];
  /**
   * The output channels the software stores as 0 whatever the pixel (bit 0..2 R, G, B; bit 3 every channel): a NaN
   * colour channel is NaN after the modulate and the blend, and a NaN alpha makes all four NaN (`Uint8ClampedArray`
   * stores NaN as 0, `GS_BLEND_ROUNDING_READING`).
   */
  zeroMask: number;
  /** The `ALPHA_1` it is drawn under (P2). */
  blend: UiBlend;
  path: UiPlanPath;
  /** Why it is programmable; null on `ff`. */
  why: UiPlanWhy | null;
  /** Its programmable batch; null on `ff`. */
  batch: number | null;
  /** Offsets into `axis` of its column entries (one per covered column) and row entries; null when untextured. */
  axis: { column: number; row: number } | null;
}

/** One drawn model triangle (research 380 M1-M7), as the software's `drawModels` takes it. */
export interface UiPlanTriangle {
  node: string;
  /** The draw-list item (the models item) and its pass. */
  item: number;
  pass: number;
  /** The vertices on the target's grid: x and y times the scale (as stated at 1), invW, u, v and the colour as given. */
  a: UiModelVertex; b: UiModelVertex; c: UiModelVertex;
  /** The signed area `(b.x - a.x)(c.y - a.y) - (c.x - a.x)(b.y - a.y)` on the target's grid, f64: never 0 here. */
  area: number;
  /** The integer box `ceil(min) .. ceil(max)` per axis, clipped to the frame (M2); may be empty. */
  box: UiPlanRect;
  /** Index into `textures`; null: untextured (the colour as interpolated). */
  texture: number | null;
  /** The `ALPHA_1` it is drawn under: its bind's, or the register as it stands when untextured. */
  blend: UiBlend;
  /** `ff` (the hardware blend, alpha masked: M7) or `prog` (GM-26's; until then the frame is software). */
  path: UiPlanPath;
  why: Exclude<UiPlanWhy, 'exact' | 'fade'> | null;
}

/**
 * A models item: its own depth buffer, its drawn triangles in order, and (GM-15a) the power-of-two scale its depth is
 * written at (`passDepthScale`; 1 for a pass that draws nothing).
 */
export interface UiPlanPass { id: number; item: number; triangles: number[]; depthScale: number }

/**
 * GM-15a, GM-15b (GM.R10; research 380 M3, §5): a pass's depth scale -- the largest power of two `2^-k`, k >= 0, that
 * brings every vertex's f32 `invW` (the value the GPU receives) to at most 1/2, so `gl_FragDepth = clamp(invW *
 * depthScale, 0, 1)` keeps the software's order (`drawModels`' f32 depth, `uiCompositorView.ts`:437, :450). A design
 * choice of GM.R10 that decides no byte: a power of two scales an f32 exactly unless it underflows
 * (`UI_GPU_MODEL_DEPTH_FLOOR` refuses that edge, GM-06b review F3), so no comparison changes.
 *
 * GM-15b, the clamp above 1: a pixel's f32 `invW` (T4) is a convex combination of its vertices', rounded three times,
 * and can exceed the largest vertex's by an ulp (`uiFramePlan.test.ts` holds a witness at 0.75); a scale that brought
 * the largest vertex to 1 could so put a depth past 1, where the clamp would tie two depths the software keeps apart. At
 * most 1/2 (GM-15a's scale halved), a pixel's depth stays below 1 by a factor near 2, so the clamp's upper bound is
 * never reached (`uiGpuTwin.test.ts` sweeps every pixel of the cases and of seeded passes). A vertex whose f32 is
 * infinite (a finite f64 past f32's range) gives 0, which the depth floor refuses.
 *
 * The f32 twin's model, moved here from `twinDepthScale` so the twin and the GPU read one value. Not hashed: it is a
 * function of the vertices, which are.
 */
export function passDepthScale(triangles: readonly UiPlanTriangle[], pass: readonly number[]): number {
  let max = 0;
  for (const i of pass) { const t = triangles[i]!; max = Math.max(max, Math.fround(t.a.invW), Math.fround(t.b.invW), Math.fround(t.c.invW)); }
  if (!Number.isFinite(max)) return 0;
  let scale = 1;
  while (max * scale > 0.5) scale /= 2;   // exact: max is a finite f32, scale a power of two
  return scale;
}

/**
 * GM-15b (GM-06b review F3; the GM-15 row's "a positive invW reaching 0 or a subnormal" and "0 = empty"): the smallest
 * depth a pass may put on the GPU, 2^-100 -- each vertex's f32 `invW` times the pass's `depthScale` -- with the scale
 * itself at least f32's smallest normal, 2^-126. Not a game value and no adaptation: the edge of the range in which the
 * GPU's f32 arithmetic is the twin's. Below it the pass's frame is the software's (L1, the reference's bytes), named.
 *
 * Why: the software's depth is a `Float32Array` (`drawModels`, `uiCompositorView.ts`), its f32 depth `z`
 * (`modelDepthF32`) tested `z < depth[i]` to skip (GEQUAL, GM-15d) and written `depth[i] = z`. A positive `invW` whose
 * f32 is 0 is drawn at depth 0, so a farther triangle draws over it (0 >= 0); a subnormal one is stored, so a farther
 * triangle under it fails. The GPU clears its depth to 0 and tests `GEQUAL` too, but ESSL 3.00 section 4.5.1 lets highp
 * arithmetic (and the depth buffer) flush a subnormal to 0, after which a farther triangle passes where the software's
 * fails -- the GPU's bytes would not be the software's. The margin above 2^-126 covers T4's three products, each of which may be flushed when it alone is
 * subnormal: their loss, under 3 x 2^-126, is below an ulp of any depth at or above 2^-100.
 */
export const UI_GPU_MODEL_DEPTH_FLOOR = 2 ** -100;
/** f32's smallest normal number: a `depthScale` under it could reach the shader as a flushed 0 (GM-15b). */
const F32_MIN_NORMAL = 2 ** -126;

/**
 * GM-15b (GM-15a review F2): the bound on a textured triangle's texel coordinate, `|u W|` and `|(1 - v) H|` at each
 * vertex (W x H the sampled image: the HD replacement where one is picked), exclusive: 2^30. Not a game value and no
 * adaptation: the int range of T8 (`model-ff-*`, `uiGpuShaders.ts`) -- `int x0 = int(floor(U - 0.5))` has no defined
 * result past the int range (ESSL 3.00 section 5.4.1 defines the conversion by dropping the fraction, for a value an
 * int holds), and `wrapRepeat`'s `-i - 1` overflows at INT_MIN. The software's `sample` (`uiCompositorView.ts`:178-190)
 * floors in f64 and wraps any value. The bound is 2^30, not 2^31: the GPU receives u as f32 (2^31 - 1 rounds to 2^31),
 * and a pixel's perspective-correct u is a convex combination of the vertices' with a few ulps of rounding, so the
 * vertices' bound keeps a factor of 2 under INT_MAX. At or past it the frame is the software's (L1), named.
 */
export const UI_GPU_MODEL_TEXEL_RANGE = 2 ** 30;

/**
 * A movie picture the plan draws: a handle for the drawer, not hashed (`volatile`). `picture` is the layer's picture
 * object the `movie` option was given -- the GPU's key for the upload (GM-11a-3: one upload per picture, in the render
 * that first shows it; `uiGpuMovie.ts`) -- and `image` the option's view of its pixels.
 */
export interface UiPlanMovie { width: number; height: number; image: Rgba; picture: MoviePicture }

export type UiPlanStep =
  /** P15: every pixel `bytes` (alpha 255), as one packed fill. Ends a batch. */
  | { kind: 'clear'; bytes: [number, number, number, number] }
  /** P17: the picture's RGB at the origin over `rect`, nearest `p / s`; alpha untouched. Ends a batch. */
  | { kind: 'movie'; movie: number; rect: UiPlanRect }
  /** A models item's depth buffer, cleared (0 = empty): the start of a pass that draws. Ends a batch. */
  | { kind: 'pass'; pass: number }
  /** A run of a pass's triangles with the same path, blend and texture, in order, tested against the pass's depth. */
  | { kind: 'triangles'; pass: number; path: UiPlanPath; blend: UiBlend; texture: number | null; depth: 'pass'; triangles: number[] }
  /** A programmable batch's destination copy over `rect`, before its first quad. */
  | { kind: 'copy'; batch: number; rect: UiPlanRect }
  /** A run: consecutive quads with the same path, blend, texture and batch (P1: never reordered). No depth, ever. */
  | { kind: 'quads'; path: UiPlanPath; blend: UiBlend; texture: number | null; batch: number | null; depth: 'none'; quads: number[] };

/** A programmable batch: quads that do not overlap, read from one destination copy (`layered === sequential`). */
export interface UiPlanBatch { id: number; copy: UiPlanRect; quads: number[] }

export interface UiFramePlanOptions {
  /** HD-3: the whole factor the frame is drawn at (`rasterScale`). */
  scale?: number;
  /** The transparent overlay's frame (P14, P22). */
  transparent?: boolean;
  hd?: UiHdTextures;
  movie?: (picture: MoviePicture) => Rgba | null;
  /** Dev sampling (P7): anything but bilinear is drawn by the software at the shown scale (GM.R9). */
  uiSampling?: UiSamplingSettings;
  /** The blend table's value (GM.R6); absent: `exact` at scale 1, `ff` at HD. */
  blend?: UiPlanBlendMode;
}

export interface UiFramePlan {
  /** `depth`: a pass draws (a depth buffer for the models; never tested by a 2D quad). */
  target: { width: number; height: number; scale: number; transparent: boolean; depth: boolean };
  blend: UiPlanBlendMode;
  /** `gpu`: the steps draw the frame. `software`: L1, the reference draws it (the reasons in `why`). */
  verdict: 'gpu' | 'software';
  why: string[];
  /**
   * GM-14a (GM.R9): the scale the software draws this frame at when it is L1 -- for any reason, the plan's or the
   * backend's -- `UI_GPU_FRAME_FALLBACK_SCALE_ADAPTATION` (`frame`), or the shown scale under dev sampling other than
   * bilinear (`dev-sampling`, `UI_GPU_DEV_SAMPLING_FALLBACK_ADAPTATION`).
   */
  fallback: { scale: number; why: 'frame' | 'dev-sampling' };
  steps: UiPlanStep[];
  quads: UiPlanQuad[];
  triangles: UiPlanTriangle[];
  passes: UiPlanPass[];
  movies: UiPlanMovie[];
  batches: UiPlanBatch[];
  textures: UiPlanTexture[];
  /** Per textured quad: `(left, right, fx, ix)` per covered column, then `(top, bottom, fy, iy)` per covered row (GM.R3). */
  axis: Float64Array;
  /** The `ALPHA_1` the list leaves (P2). */
  registerAfter: UiBlend;
  /** What the software leaves undrawn, as it names it, in order. */
  undrawn: string[];
  /** A movie picture is drawn: its pixels are not in the hash, so the frame is redrawn whatever the hash says. */
  volatile: boolean;
  /** 16 hex digits over everything that decides the frame's pixels but texture contents and movie pictures. */
  hash: string;
  stats: { quads: number; ff: number; prog: number; runs: number; batches: number; copyPixels: number; axisEntries: number; triangles: number; passes: number; movies: number };
  /** The inputs, for the reference when the verdict is `software` (L1). */
  source: { items: readonly UiDrawItem[]; textures: UiTextures; options: Omit<UiFramePlanOptions, 'blend'> };
}

const finite = (v: readonly number[]): boolean => v.every(Number.isFinite);

/**
 * A drawn quad's path under the blend table (research 380 P10, P11, P13, P23; GM.R6). Under `exact` every quad is
 * programmable. Under `ff` the fixed-function blend takes a quad only where its result is the software's formula:
 * a finite, non-negative colour the output does not clamp before the blend, an alpha that is not negative, a source
 * alpha at most 1 (`SRC_ALPHA, ONE_MINUS_SRC_ALPHA`; an additive one is `ONE, ONE` over `min(1, r a / 255)`, P11), and
 * not an untextured fade (P13: always programmable, at every scale). The first reason that holds is returned.
 */
export function quadRoute(q: { textured: boolean; rgba: readonly number[]; blend: UiBlend }, mode: UiPlanBlendMode): UiPlanWhy | null {
  if (mode === 'exact') return 'exact';
  const [r, g, b, a] = q.rgba as [number, number, number, number];
  if (!finite(q.rgba) || r < 0 || g < 0 || b < 0 || (!q.textured && (r > 255 || g > 255 || b > 255))) return 'colour';
  if (a < 0) return 'negative';
  if (q.blend === 'source' && a > 128) return 'over1';
  if (!q.textured && a > 0 && a !== 128) return 'fade';
  return null;
}

/**
 * A drawn model triangle's path (research 380 M1-M7; GM.R10). The fixed-function blend (`model-ff-src`,
 * `model-ff-add`, the alpha masked: M7) takes it where its result is the software's formula over every pixel: the
 * interpolated colour is a convex combination of the three vertices' (the perspective-corrected weights are not
 * negative and sum to 1), so the quads' rules are applied to each vertex -- P23 `colour` (a non-finite value, a
 * negative RGB, an untextured RGB over 255), `negative` (an alpha under 0), `over1` (a source-blend alpha over 1). No
 * `fade` rule: a model's fractional alpha is a texel-weighted value on either path. The blend table's `exact` does not
 * apply (GM.R6 names quads; the models' class is B, M2-M5). Null: fixed-function. The tally
 * (`uiGpuTally.disc.test.ts`, research 380 §3) routes model triangles through this function (GM-06b review F2).
 */
export function triangleRoute(t: { textured: boolean; rgba: readonly (readonly number[])[]; blend: UiBlend }): Exclude<UiPlanWhy, 'exact' | 'fade'> | null {
  for (const c of t.rgba) if (!finite(c) || c[0]! < 0 || c[1]! < 0 || c[2]! < 0 || (!t.textured && (c[0]! > 255 || c[1]! > 255 || c[2]! > 255))) return 'colour';
  if (t.rgba.some((c) => c[3]! < 0)) return 'negative';
  if (t.blend === 'source' && t.rgba.some((c) => c[3]! > 128)) return 'over1';
  return null;
}

/** P23: a colour's finite numbers, codes and the channels stored 0 whatever the pixel. */
function encodeColour(rgba: readonly number[]): Pick<UiPlanQuad, 'colour' | 'codes' | 'zeroMask'> {
  const colour = [0, 0, 0, 0] as UiPlanQuad['colour'], codes = [0, 0, 0, 0] as UiPlanQuad['codes'];
  let zeroMask = 0;
  for (let c = 0; c < 4; c++) {
    const v = rgba[c]!;
    if (Number.isFinite(v)) { colour[c] = v; continue; }
    codes[c] = Number.isNaN(v) ? UI_PLAN_CODE.nan : v > 0 ? UI_PLAN_CODE.posInf : UI_PLAN_CODE.negInf;
    if (Number.isNaN(v)) zeroMask |= c === 3 ? 0b1111 : 1 << c;
  }
  return { colour, codes, zeroMask };
}

const overlaps = (a: UiPlanRect, b: UiPlanRect): boolean => a.xs < b.xe && b.xs < a.xe && a.ys < b.ye && b.ys < a.ye;

/**
 * The f64 table's first size: the last plan's table length (GM-29), so a frame like the last one allocates its table once
 * and never grows it; at least 1024 entries. A module-level hint, not a cache: no value of a plan carries over.
 */
let axisSizeHint = 1024;

/**
 * A growable f64 table. GM-29 (the T4 profile, `agent-mail/evidence/gpu-menus/gm-f1-t4p/PROFILE.md`: `reserve` and `done`
 * 126 ms over the cold switch's 2x window): it starts at the last plan's size and `done` hands out a view of its own
 * array -- each plan has its own table, written by nobody after -- where it doubled from 1024 and copied it out every
 * frame. The values, their order and the table's length are unchanged.
 */
class AxisTable {
  data = new Float64Array(axisSizeHint);
  length = 0;
  reserve(n: number): number {
    if (this.length + n > this.data.length) {
      let size = this.data.length;
      while (this.length + n > size) size *= 2;
      const next = new Float64Array(size); next.set(this.data.subarray(0, this.length)); this.data = next;
    }
    const at = this.length; this.length += n; return at;
  }
  done(): Float64Array {
    axisSizeHint = Math.max(1024, this.length);
    return this.length === this.data.length ? this.data : this.data.subarray(0, this.length);
  }
}

/**
 * GM-32 (the T4 profile at `82ef1260f`: `addQuad` 221.2 ms self, `rowAxis` 31.5, `wrapIndex` 19.5, `columnAxis` 17.0 over
 * the 4x cold switch; a Node microbench puts the axis build at most of `planFrame`): a quad's column entries (or its row
 * entries), kept from one plan to the next and handed out again where **every input that decides them is the same, bit
 * for bit** -- columns: `xs`, `xe`, `x0`, `dx`, `u0`, `du` and the texture's width; rows: `ys`, `ye`, `y0`, `dy`, `v0`,
 * `dv`, the texture's height and width. The entries are a function of those numbers alone (`columnAxis` and `rowAxis` are
 * pure, `nearest` is always false here), so a kept run is the run the planner would write: the table's values, order and
 * length are unchanged (`test/uiFramePlanStable.test.ts` pins every GM-03 plan's axis bytes). A cost, not a rule.
 *
 * Two generations: what this plan and the plan before it used; a plan's start drops the older one. So it holds at most two
 * plans' tables (about 1.7 MB of f64 each for a 4x dlgOptions_Menu frame) and a dialog's frames -- a fade, the roller --
 * find the quads that did not move. Each kept run is its own copy, never a view of a plan's table.
 */
class AxisMemo {
  private cur = new Map<number, { key: Uint32Array; run: Float64Array }[]>();
  private prev = new Map<number, { key: Uint32Array; run: Float64Array }[]>();
  private readonly f = new Float64Array(9);
  private readonly u = new Uint32Array(this.f.buffer);
  private h = 0;
  hits = 0;
  misses = 0;
  /** The runs held now, both generations (a run filed in both counted once a generation). */
  get runs(): number { let n = 0; for (const g of [this.cur, this.prev]) for (const l of g.values()) n += l.length; return n; }
  /** A plan starts: the plan before it becomes the older generation. */
  begin(): void { this.prev = this.cur; this.cur = new Map(); }
  /** The run kept for these nine numbers (a column: its seven, 0, 0; a row: its eight, 1), or null; `keep` files the run made then. */
  find(a: number, b: number, c: number, d: number, e: number, g: number, w: number, x: number, y: number): Float64Array | null {
    const f = this.f, u = this.u;
    f[0] = a; f[1] = b; f[2] = c; f[3] = d; f[4] = e; f[5] = g; f[6] = w; f[7] = x; f[8] = y;
    let h = 0x811c9dc5 | 0;
    for (let i = 0; i < 18; i++) { h = Math.imul(h ^ u[i]!, 0x01000193); h ^= h >>> 15; }
    this.h = h;
    const got = this.match(this.cur.get(h));
    if (got) { this.hits++; return got.run; }
    const old = this.match(this.prev.get(h));
    if (old) { this.file(old); this.hits++; return old.run; }
    this.misses++;
    return null;
  }
  /** The run just made for the numbers `find` was last given (a copy: the plan's table is the plan's). */
  keep(run: Float64Array): void { this.file({ key: this.u.slice(), run }); }
  private match(list: { key: Uint32Array; run: Float64Array }[] | undefined): { key: Uint32Array; run: Float64Array } | null {
    if (!list) return null;
    const u = this.u;
    outer: for (const e of list) {
      for (let i = 0; i < 18; i++) if (e.key[i] !== u[i]) continue outer;
      return e;
    }
    return null;
  }
  private file(e: { key: Uint32Array; run: Float64Array }): void {
    const list = this.cur.get(this.h);
    if (list) { if (!list.includes(e)) list.push(e); } else this.cur.set(this.h, [e]);
  }
}
const axisMemo = new AxisMemo();

/**
 * GM-32 review F2: lets the planner's kept axis runs go (both generations), so they are not held while the front end's GPU
 * surface is released (a match) or after the page stops. The next plan is planned cold: the same bytes, computed.
 */
export function releaseUiFramePlanMemo(): void { axisMemo.begin(); axisMemo.begin(); }

/** GM-32: the axis memo's hits and misses since the module loaded, and the runs it holds now (a test's and the microbench's count). */
export function uiFramePlanAxisMemoCounts(): { hits: number; misses: number; runs: number } {
  return { hits: axisMemo.hits, misses: axisMemo.misses, runs: axisMemo.runs };
}

/** Two 32-bit lanes (FNV-1a and a Murmur-style multiply), finished by Murmur3's fmix: a dirty check, not a signature. */
class PlanHasher {
  private a = 0x811c9dc5 | 0;
  private b = 0x9747b28c | 0;
  private readonly f = new Float64Array(1);
  private readonly u = new Uint32Array(this.f.buffer);
  word(w: number): void {
    this.a = Math.imul(this.a ^ w, 0x01000193);
    this.b = Math.imul(this.b ^ w, 0x5bd1e995); this.b ^= this.b >>> 15;
  }
  num(v: number): void { this.f[0] = v; this.word(this.u[0]!); this.word(this.u[1]!); }
  str(s: string): void { this.word(s.length); for (let i = 0; i < s.length; i++) this.word(s.charCodeAt(i)); }
  nums(v: readonly number[]): void { for (let i = 0; i < v.length; i++) this.num(v[i]!); }
  hex(): string {
    const fmix = (h: number): number => {
      h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0;
    };
    return fmix(this.a).toString(16).padStart(8, '0') + fmix(this.b ^ this.a).toString(16).padStart(8, '0');
  }
}

/** The draw list into a plan (see the module's comment). Pure: the inputs are read, never written. */
export function planFrame(items: readonly UiDrawItem[], textures: UiTextures, o: UiFramePlanOptions = {}): UiFramePlan {
  const s = rasterScale(o.scale);
  const W = UI_FRAME.width * s, H = UI_FRAME.height * s;
  const mode: UiPlanBlendMode = o.blend ?? (s === 1 ? 'exact' : 'ff');
  const at = scaleAt(s), clipAt = scaleClip(s);
  const why: string[] = [];
  const say = (reason: string): void => { if (!why.includes(reason)) why.push(reason); };
  const devSampling = o.uiSampling?.enabled === true && o.uiSampling.mode !== 'bilinear';
  if (devSampling) say(`dev sampling (${o.uiSampling!.mode}): drawn by the software at the shown scale (GM.R9)`);
  const fallback: UiFramePlan['fallback'] = devSampling ? { scale: s, why: 'dev-sampling' } : { scale: UI_GPU_FRAME_FALLBACK_SCALE_ADAPTATION.scale, why: 'frame' };

  const steps: UiPlanStep[] = [], quads: UiPlanQuad[] = [], batches: UiPlanBatch[] = [], planned: UiPlanTexture[] = [];
  const triangles: UiPlanTriangle[] = [], passes: UiPlanPass[] = [], movies: UiPlanMovie[] = [];
  const byBitmap = new Map<UiBitmap, number>();
  const undrawn: string[] = [];
  const axis = new AxisTable();
  axisMemo.begin();
  let left = new Float64Array(0), right = new Float64Array(0), fraction = new Float64Array(0);
  let volatile = false;
  let reg: UiBlend = GS_ALPHA_FRAME_START_READING;
  let run: Extract<UiPlanStep, { kind: 'quads' }> | null = null;
  let batch: UiPlanBatch | null = null;
  const hasher = new PlanHasher();

  const texture = (bitmap: UiBitmap, name: string): number => {
    let i = byBitmap.get(bitmap);
    if (i === undefined) {
      const { tex, su, sv } = pickBitmap(o.hd, bitmap);
      i = planned.length;
      planned.push({ name, width: tex.width, height: tex.height, hd: tex !== bitmap, blend: blendAfterBind(tex), su, sv, image: tex });
      byBitmap.set(bitmap, i);
    }
    return i;
  };
  const endBatch = (): void => { batch = null; };

  const addQuad = (item: number, node: string, x0: number, y0: number, x1: number, y1: number, clip: UiClip | null,
    tex: number | null, uv: [number, number, number, number] | null, rgba: readonly number[], blend: UiBlend): void => {
    const b = coverageBounds(x0, y0, x1, y1, W, H, clip);
    if (!b) return;
    // GM-29: the four tests written out (the same tests in the same order; no array per quad).
    if (!(Number.isInteger(b.xs) && Number.isInteger(b.ys) && Number.isInteger(b.xe) && Number.isInteger(b.ye))) {
      // A NaN corner covers nothing in the software (its loops never run); a clip off the pixel grid covers fractional
      // positions the GPU's integer rectangles cannot: the reference draws that frame.
      if (Number.isNaN(b.xs) || Number.isNaN(b.ys) || Number.isNaN(b.xe) || Number.isNaN(b.ye)) return;
      say('a clip that is not whole pixels: drawn by the software');
      // The quad is not in the plan, so it is hashed here: two frames that differ only in it must not share a hash
      // (GM-06a review F1; the dirty check by hash, GM-12a, would otherwise keep the old pixels).
      hasher.str('offgrid'); hasher.str(node); hasher.str(tex !== null ? planned[tex]!.name : '');
      hasher.nums([x0, y0, x1, y1]); hasher.nums(clip ? [clip.x0, clip.y0, clip.x1, clip.y1] : [-1]);
      hasher.nums(uv ?? [-1]); hasher.nums(rgba); hasher.str(blend);
      return;
    }
    const textured = tex !== null && uv !== null;
    // P9: an untextured quad with a finite colour and alpha exactly 0 is not drawn (the register is the caller's).
    if (!textured && Number.isFinite(rgba[0]) && Number.isFinite(rgba[1]) && Number.isFinite(rgba[2]) && rgba[3]! / 128 === 0) return;
    const route = quadRoute({ textured, rgba, blend }, mode);
    const path: UiPlanPath = route ? 'prog' : 'ff';
    const rect: UiPlanRect = b;                                       // `coverageBounds`' own fresh {xs, ys, xe, ye}
    let axisAt: UiPlanQuad['axis'] = null;
    if (textured) {
      const t = planned[tex]!;
      const cols = rect.xe - rect.xs, rows = rect.ye - rect.ys;
      // GM.R3: the software's own axis functions, f64, multiply then divide; stored as texel indices. GM-32: a run kept
      // for the same inputs (`AxisMemo`) is copied in instead.
      const column = axis.reserve(cols * 4);
      const keptColumn = axisMemo.find(rect.xs, rect.xe, x0, x1 - x0, uv[0], uv[2] - uv[0], t.width, 0, 0);
      if (keptColumn) axis.data.set(keptColumn, column);
      else {
        if (left.length < cols) { left = new Float64Array(cols); right = new Float64Array(cols); fraction = new Float64Array(cols); }
        columnAxis(rect.xs, rect.xe, x0, x1 - x0, uv[0], uv[2] - uv[0], t.width, false, left, right, fraction);
        for (let k = 0; k < cols; k++) {
          const o4 = column + k * 4;
          axis.data[o4] = left[k]! / 4; axis.data[o4 + 1] = right[k]! / 4; axis.data[o4 + 2] = fraction[k]!; axis.data[o4 + 3] = 1 - fraction[k]!;
        }
        axisMemo.keep(axis.data.slice(column, column + cols * 4));
      }
      const row = axis.reserve(rows * 4);
      const keptRow = axisMemo.find(rect.ys, rect.ye, y0, y1 - y0, uv[1], uv[3] - uv[1], t.height, t.width, 1);
      if (keptRow) axis.data.set(keptRow, row);
      else {
        const stride = t.width * 4, r = { top: 0, bottom: 0, fy: 0, iy: 0 };
        for (let y = rect.ys; y < rect.ye; y++) {
          rowAxis(y, y0, y1 - y0, uv[1], uv[3] - uv[1], t.height, t.width, false, r);
          const o4 = row + (y - rect.ys) * 4;
          axis.data[o4] = r.top / stride; axis.data[o4 + 1] = r.bottom / stride; axis.data[o4 + 2] = r.fy; axis.data[o4 + 3] = r.iy;
        }
        axisMemo.keep(axis.data.slice(row, row + rows * 4));
      }
      axisAt = { column, row };
    }
    const index = quads.length;
    let batchId: number | null = null;
    if (path === 'prog') {
      const open = batch as UiPlanBatch | null;
      if (!open || open.quads.some((i) => overlaps(quads[i]!.rect, rect))) {
        const id = batches.length;
        const fresh: UiPlanBatch = { id, copy: { ...rect }, quads: [] };
        batches.push(fresh);
        batch = fresh;
        steps.push({ kind: 'copy', batch: id, rect: fresh.copy });
        run = null;
      }
      const current = batch as unknown as UiPlanBatch;
      const c = current.copy;
      c.xs = Math.min(c.xs, rect.xs); c.ys = Math.min(c.ys, rect.ys); c.xe = Math.max(c.xe, rect.xe); c.ye = Math.max(c.ye, rect.ye);
      current.quads.push(index);
      batchId = current.id;
    } else endBatch();
    const { colour, codes, zeroMask } = encodeColour(rgba);
    quads.push({
      node, item, rect, x0, y0, x1, y1, texture: textured ? tex : null, uv: textured ? uv : [0, 0, 0, 0], colour, codes, zeroMask,
      blend, path, why: route, batch: batchId, axis: axisAt,
    });
    const t = textured ? tex : null;
    if (run && run.path === path && run.blend === blend && run.texture === t && run.batch === batchId) run.quads.push(index);
    else { run = { kind: 'quads', path, blend, texture: t, batch: batchId, depth: 'none', quads: [index] }; steps.push(run); }
  };

  items.forEach((it, item) => {
    switch (it.kind) {
      case 'clear':
        endBatch(); run = null;
        steps.push({ kind: 'clear', bytes: [...clearBytes(it.rgb)] as [number, number, number, number] });
        break;
      case 'movie': {
        const pic = it.picture ? o.movie?.(it.picture) ?? null : null;
        if (!pic) {
          // P16: black there at alpha 128 by source, not a GS quad: the register is not touched.
          addQuad(item, 'movie', at(it.x0), at(it.y0), at(it.x1), at(it.y1), null, null, null, [0, 0, 0, 128], MOVIE_NO_PICTURE_BLEND);
          break;
        }
        // P17: an RGB copy at the origin, nearest s x s, the picture's own size (the item's rectangle is not used).
        volatile = true;
        endBatch(); run = null;
        const rect: UiPlanRect = { xs: 0, ys: 0, xe: Math.min(W, pic.width * s), ye: Math.min(H, pic.height * s) };
        movies.push({ width: pic.width, height: pic.height, image: pic, picture: it.picture! });
        steps.push({ kind: 'movie', movie: movies.length - 1, rect });
        hasher.str('movie'); hasher.nums([pic.width, pic.height, it.x0, it.y0, it.x1, it.y1]);
        break;
      }
      case 'sprite': {
        if (it.texture === null) { addQuad(item, it.node, at(it.x0), at(it.y0), at(it.x1), at(it.y1), clipAt(it.clip), null, null, it.rgba, reg); break; }
        const bitmap = textures(it.texture);
        if (!bitmap) { undrawn.push(`${it.node}: no bitmap ${it.texture}`); break; }
        reg = blendAfterBind(bitmap);
        const i = texture(bitmap, it.texture), t = planned[i]!;
        addQuad(item, it.node, at(it.x0), at(it.y0), at(it.x1), at(it.y1), clipAt(it.clip), i,
          [it.u0 * t.width, it.v0 * t.height, it.u1 * t.width, it.v1 * t.height], it.rgba, reg);
        break;
      }
      case 'glyphs':
        for (const q of it.quads) {
          const bitmap = textures(q.texture);
          if (!bitmap) { undrawn.push(`${it.node}: no bitmap ${q.texture}`); continue; }
          reg = blendAfterBind(bitmap);
          const i = texture(bitmap, q.texture), t = planned[i]!;
          const uv: [number, number, number, number] = t.su === 1 && t.sv === 1 ? [q.u0, q.v0, q.u1, q.v1] : [q.u0 * t.su, q.v0 * t.sv, q.u1 * t.su, q.v1 * t.sv];
          addQuad(item, it.node, at(q.left), at(q.top), at(q.right), at(q.bottom), clipAt(it.clip), i, uv, q.rgba, reg);
        }
        break;
      case 'widget':
        undrawn.push(`widget ${it.node} (${it.record.type ?? 'untyped'})`);
        break;
      case 'models': {
        if (!it.triangles) { undrawn.push('models'); break; }
        // The software's `drawModels`, triangle by triangle (M1): the register as the pass leaves it
        // (UI_MESH_BIND_READING) -- a drawn triangle binds; a zero-area one, a culled back face (clockwise on the frame,
        // y down) and a missing bitmap set nothing; a missing bitmap is named once per node of the pass.
        const pass: UiPlanPass = { id: passes.length, item, triangles: [], depthScale: 1 };
        passes.push(pass);
        const missing = new Set<string>();
        const grid = (p: UiModelVertex): UiModelVertex => (s === 1 ? p : { ...p, x: p.x * s, y: p.y * s });
        let tri: Extract<UiPlanStep, { kind: 'triangles' }> | null = null;
        for (const t of it.triangles) {
          hasher.str(t.node); hasher.str(t.texture ?? ''); hasher.num(t.cull ? 1 : 0);
          for (const v of [t.a, t.b, t.c]) { hasher.nums([v.x, v.y, v.invW, v.u, v.v]); hasher.nums(v.rgba); }
          const a = grid(t.a), b = grid(t.b), c = grid(t.c);
          const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
          if (area === 0 || (t.cull && area > 0)) continue;
          const bitmap = t.texture === null ? null : textures(t.texture);
          if (t.texture !== null && !bitmap) { if (!missing.has(t.node)) { missing.add(t.node); undrawn.push(`${t.node}: no bitmap ${t.texture}`); } continue; }
          let tex: number | null = null;
          if (bitmap) { tex = texture(bitmap, t.texture!); reg = blendAfterBind(bitmap); }
          const blend = reg;
          if (![a, b, c].every((v) => finite([v.x, v.y, v.invW, v.u, v.v]))) say('a model vertex not finite (position, invW or texel): drawn by the software');
          else if ([a, b, c].some((v) => v.invW <= 0)) say('a model vertex at invW <= 0 (the GPU clamps a negative depth to 0, which passes GEQUAL over the clear, where the software\'s fails): drawn by the software');
          const route = triangleRoute({ textured: bitmap !== null, rgba: [a.rgba, b.rgba, c.rgba], blend });
          if (route) say('a model triangle needing the programmable path: drawn by the software until GM-26 (GM.R10)');
          // GM-15b (GM-15a review F2): T8's int range, on the sampled image's size (UI_GPU_MODEL_TEXEL_RANGE).
          if (tex !== null && [a, b, c].every((v) => finite([v.u, v.v]))) {
            const { width: tw, height: th } = planned[tex]!;
            if ([a, b, c].some((v) => !(Math.abs(v.u * tw) < UI_GPU_MODEL_TEXEL_RANGE && Math.abs((1 - v.v) * th) < UI_GPU_MODEL_TEXEL_RANGE))) {
              say('a model texel coordinate |u W| or |(1 - v) H| at or past UI_GPU_MODEL_TEXEL_RANGE (2^30; T8\'s int floor and REPEAT): drawn by the software');
            }
          }
          const path: UiPlanPath = route ? 'prog' : 'ff';
          const box: UiPlanRect = {
            xs: Math.max(0, Math.ceil(Math.min(a.x, b.x, c.x))), xe: Math.min(W, Math.ceil(Math.max(a.x, b.x, c.x))),
            ys: Math.max(0, Math.ceil(Math.min(a.y, b.y, c.y))), ye: Math.min(H, Math.ceil(Math.max(a.y, b.y, c.y))),
          };
          const index = triangles.length;
          triangles.push({ node: t.node, item, pass: pass.id, a, b, c, area, box, texture: tex, blend, path, why: route });
          if (!pass.triangles.length) { endBatch(); run = null; steps.push({ kind: 'pass', pass: pass.id }); }
          pass.triangles.push(index);
          if (tri && tri.path === path && tri.blend === blend && tri.texture === tex) tri.triangles.push(index);
          else { tri = { kind: 'triangles', pass: pass.id, path, blend, texture: tex, depth: 'pass', triangles: [index] }; steps.push(tri); }
        }
        // GM-15a: the pass's depth scale, once its triangles are known (GM.R10).
        pass.depthScale = passDepthScale(triangles, pass.triangles);
        // GM-15b: every depth the pass puts on the GPU in f32's normal range, at or above UI_GPU_MODEL_DEPTH_FLOOR; a
        // vertex at invW <= 0 or not finite has its own why above.
        const shallow = (v: UiModelVertex): boolean => v.invW > 0 && Number.isFinite(v.invW) && !(Math.fround(v.invW) * pass.depthScale >= UI_GPU_MODEL_DEPTH_FLOOR);
        if (pass.triangles.length && (!(pass.depthScale >= F32_MIN_NORMAL) || pass.triangles.some((i) => [triangles[i]!.a, triangles[i]!.b, triangles[i]!.c].some(shallow)))) {
          say('a model pass whose depth leaves f32\'s normal range -- a vertex\'s f32 invW times the pass\'s depthScale under UI_GPU_MODEL_DEPTH_FLOOR (2^-100), or the scale under 2^-126 (the GPU may flush it to 0, its clear\'s "empty"): drawn by the software');
        }
        break;
      }
    }
  });

  const verdict = why.length ? 'software' : 'gpu';
  const target = { width: W, height: H, scale: s, transparent: !!o.transparent, depth: steps.some((x) => x.kind === 'pass') };
  hasher.str('GM-06b plan 2');
  hasher.nums([W, H, s, target.transparent ? 1 : 0]); hasher.str(mode); hasher.str(verdict);
  for (const w of why) hasher.str(w);
  hasher.str(reg);
  for (const u of undrawn) hasher.str(u);
  for (const t of planned) { hasher.str(t.name); hasher.nums([t.width, t.height, t.hd ? 1 : 0, t.su, t.sv]); hasher.str(t.blend); }
  for (const st of steps) {
    hasher.str(st.kind);
    if (st.kind === 'clear') hasher.nums(st.bytes);
    else if (st.kind === 'copy') hasher.nums([st.batch, st.rect.xs, st.rect.ys, st.rect.xe, st.rect.ye]);
    else if (st.kind === 'movie') hasher.nums([st.movie, st.rect.xs, st.rect.ys, st.rect.xe, st.rect.ye]);
    else if (st.kind === 'pass') hasher.num(st.pass);
    else if (st.kind === 'triangles') { hasher.str(st.path); hasher.str(st.blend); hasher.nums([st.pass, st.texture ?? -1]); hasher.nums(st.triangles); }
    else { hasher.str(st.path); hasher.str(st.blend); hasher.nums([st.texture ?? -1, st.batch ?? -1]); hasher.nums(st.quads); }
  }
  for (const t of triangles) {
    hasher.nums([t.item, t.pass, t.area, t.box.xs, t.box.ys, t.box.xe, t.box.ye, t.texture ?? -1]); hasher.str(t.blend); hasher.str(t.path);
    for (const v of [t.a, t.b, t.c]) { hasher.nums([v.x, v.y, v.invW, v.u, v.v]); hasher.nums(v.rgba); }
  }
  for (const m of movies) hasher.nums([m.width, m.height]);
  for (const q of quads) {
    // GM-29: the eleven numbers written out (the same words in the same order as the array this read before).
    const r = q.rect;
    hasher.num(r.xs); hasher.num(r.ys); hasher.num(r.xe); hasher.num(r.ye); hasher.num(q.x0); hasher.num(q.y0); hasher.num(q.x1); hasher.num(q.y1);
    hasher.num(q.texture ?? -1); hasher.num(q.zeroMask); hasher.num(q.batch ?? -1);
    hasher.nums(q.uv); hasher.nums(q.colour); hasher.nums(q.codes); hasher.str(q.blend); hasher.str(q.path); hasher.str(q.why ?? '');
  }
  if (o.uiSampling?.enabled) hasher.str(JSON.stringify(o.uiSampling));

  const prog = quads.filter((q) => q.path === 'prog').length;
  const { blend: _blend, ...options } = o;
  return {
    target, blend: mode, verdict, why, fallback, steps, quads, triangles, passes, movies, batches, textures: planned, axis: axis.done(), registerAfter: reg, undrawn, volatile,
    hash: hasher.hex(),
    stats: {
      quads: quads.length, ff: quads.length - prog, prog, runs: steps.filter((x) => x.kind === 'quads').length, batches: batches.length,
      copyPixels: batches.reduce((n, b) => n + (b.copy.xe - b.copy.xs) * (b.copy.ye - b.copy.ys), 0), axisEntries: axis.length / 4,
      triangles: triangles.length, passes: steps.filter((x) => x.kind === 'pass').length, movies: movies.length,
    },
    source: { items, textures, options },
  };
}
