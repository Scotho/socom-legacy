/**
 * GM-11a-2 (the GPU menus plan, `docs/plans/2026-11-01-gpu-menus.md`, "The quad shader"; GM.R3, GM.R4, GM.R6; research
 * 380 §2, the P rows): the GLSL ES 3.00 sources of the menus' quad programs -- `quad-ff-src`, `quad-ff-add` (the
 * fixed-function blender finishes the pixel) and `quad-prog` (the shader computes the software's formula from the
 * batch's destination copy and stores `roundEven(clamp(v))`).
 *
 * **No rule here is new.** Every step is a line of the software drawer (`fillQuad`, `uiCompositorView.ts`), carried in
 * the f32 twin's operand order (`uiGpuTwin.ts`, GM-08) and tagged with the twin's step tags S1-S13. Each tag's comment
 * names its rule rows (research 380 §2) and the readings the twin's step table names for it
 * (`UI_GPU_TWIN_STEPS`); `test/uiGpuShaders.test.ts` (the source lint) and `test/uiGpuShaderTwin.test.ts` (the drift
 * guard) refuse a source that drifts from the twin: a tag out of order, a reading not named, a `texture(` or `mix(`
 * (hardware filtering and a reordered lerp, GM.R4), a rounding other than `roundEven` on `prog`.
 *
 * **What the GPU reproduces and how** (the plan, "The quad shader"):
 * - Each quad is the plan's integer rectangle, drawn as a four-vertex strip whose corners are pixel edges, so no pixel
 *   centre lies on an edge and no fill rule is involved (P3, P4). The pixel is `ivec2(gl_FragCoord.xy)` (S1).
 * - GM-11a-3: a run of quads is one instanced draw (`drawArraysInstanced`), each quad an instance whose inputs are
 *   per-instance attributes carried flat to the fragment (`UI_GPU_QUAD_VERTEX_SOURCE`). The instances of a draw are
 *   drawn in order (ES 3.0 §2.9.3: as the draws of each instance in turn), so P1's order holds within a run as across
 *   runs, and a programmable batch's quads never overlap (GM.R7).
 * - Texels come from `texelFetch` on an `RGBA8UI` texture (`usampler2D`): no filtering, no wrap by the sampler. The
 *   indices and weights come from the f64 axis tables the planner computed on the CPU (GM.R3; P5, P6), uploaded as an
 *   `RGBA32F` texture `UI_GPU_AXIS_WIDTH` entries wide (S4, S5).
 * - The lerps, the modulate and the blend are the software's expressions in its operand order (GM.R4).
 * - **`prog`** reads the destination from the batch's copy (an `RGBA8` scratch texture; the frame target cannot be
 *   sampled while it is drawn into), computes in f32 and stores `roundEven(clamp(v, 0, 255)) / 255` into the RGBA8
 *   frame (P12, `GS_BLEND_ROUNDING_READING`). Its numbers may be non-finite (P23: the plan's codes; a GLSL ES GPU need
 *   not carry infinities or NaN, ESSL 3.00 §4.5.1), so `prog` carries each value as a finite float and a kind and
 *   decides every operation on a non-finite operand as IEEE 754 decides it -- the software's JavaScript numbers.
 *   Not tracked as a kind: a product or sum of two finite operands that overflows f32 (`mulX`, `addX` keep it finite,
 *   `k = 0`); such a value is left to the driver (an infinity or a clamped ±max-float). No such overflow meets a zero
 *   or an opposite infinity on the way to the store (the alpha it is multiplied by stays finite), so either result
 *   stores the twin's byte, 0 or 255 -- a reasoning from the steps, not a measurement: GM-11b's case-5 leg draws a
 *   finite overflow through `quad-prog` on the box (GM-11a-2 review F2).
 * - **`ff`** outputs the source colour and the blender finishes the pixel: `SRC_ALPHA, ONE_MINUS_SRC_ALPHA` (`quad-ff-src`)
 *   or `ONE, ONE` (`quad-ff-add`) for RGB, `ONE_MINUS_DST_ALPHA, ONE` for the frame's alpha on both frames
 *   (`UI_GPU_FF_BLEND`; the twin's `S10ff_alpha`). The planner sends to `prog` every quad the blender cannot finish as
 *   the software does (`quadRoute`): no `ff` quad carries a code or a `zeroMask`.
 *
 * A GPU may contract a multiply-add into an FMA, or divide within 2.5 ULP (ESSL 3.00 §4.5.1; the plan's risk 4): that
 * is the B class's, measured against the twin per backend (GM-11b, GM-27), never assumed away here.
 *
 * Nothing changes for players: these sources are compiled only by `UiGpuBackend` (`uiGpuWebgl2.ts`), which nothing
 * constructs outside tests and the harness, behind the switch (`uiGpuSwitch.ts`) that keeps every surface `off`.
 */

/** The axis texture's width in entries (texels): ES 3.00's minimum `MAX_TEXTURE_SIZE`, so every WebGL2 holds it. */
export const UI_GPU_AXIS_WIDTH = 2048;

/** The texture units the quad programs sample: the quad's texture, the axis table, the batch's destination copy. */
export const UI_GPU_TEXTURE_UNITS = Object.freeze({ tex: 0, axis: 1, dest: 2 } as const);

/** The quad programs, by the plan's names ("Architecture"). */
export const UI_GPU_QUAD_PROGRAMS = Object.freeze(['quad-ff-src', 'quad-ff-add', 'quad-prog'] as const);
export type UiGpuQuadProgram = (typeof UI_GPU_QUAD_PROGRAMS)[number];
/**
 * GM-15a: the model programs, by the plan's names: the fixed-function blend only, as `triangleRoute` routes every model
 * triangle under both blend tables (GM-06b; a `prog` triangle keeps the frame L1 until GM-26). Their vertex shader,
 * per-instance layout and blender state are `uiGpuModels.ts`'s.
 */
export const UI_GPU_MODEL_PROGRAMS = Object.freeze(['model-ff-src', 'model-ff-add'] as const);
export type UiGpuModelProgram = (typeof UI_GPU_MODEL_PROGRAMS)[number];
/** Every fragment program of `UI_GPU_SHADER_SOURCES`. */
export type UiGpuShaderProgram = UiGpuQuadProgram | UiGpuModelProgram;

/**
 * The blender's state per `ff` program (`blendFuncSeparate(srcRGB, dstRGB, srcAlpha, dstAlpha)`, `FUNC_ADD`): the
 * twin's model of P10, P11 and P14 (`S11ff_source`, `S11ff_additive`, `S10ff_alpha`). The frame's alpha is blended
 * `ONE_MINUS_DST_ALPHA, ONE` on the opaque frame too -- the twin's model, adopted from GM-08's finding 2 (an opaque
 * frame's alpha is not always 255 after a NaN or infinite alpha, P23); research 380 P14's GPU column still says
 * `colorMask` alpha off, and the controller's ruling on finding 2 (GM-08 review F1) settles the two together.
 * `quad-prog` blends nothing: blending is off and the shader writes all four channels.
 */
export type UiGpuBlendFactor = 'ONE' | 'SRC_ALPHA' | 'ONE_MINUS_SRC_ALPHA' | 'ONE_MINUS_DST_ALPHA';
export const UI_GPU_FF_BLEND: Readonly<Record<Exclude<UiGpuQuadProgram, 'quad-prog'>, readonly [UiGpuBlendFactor, UiGpuBlendFactor, UiGpuBlendFactor, UiGpuBlendFactor]>> = Object.freeze({
  'quad-ff-src': ['SRC_ALPHA', 'ONE_MINUS_SRC_ALPHA', 'ONE_MINUS_DST_ALPHA', 'ONE'],
  'quad-ff-add': ['ONE', 'ONE', 'ONE_MINUS_DST_ALPHA', 'ONE'],
} as const);

/**
 * The twin's quad steps an `ff` program does not carry, and why (the drift guard's exception, GM-08's
 * `uiGpuShaderTwin.test.ts`: "the `ff` programs omit the steps the fixed-function blender does").
 */
export const UI_GPU_FF_OMITS: Readonly<Record<string, string>> = Object.freeze({
  S2: 'the destination is read by the blender, not the shader',
  S12: 'the conversion to the byte is the blender\'s (a fixed-point buffer), not the shader\'s',
  S13: 'an ff quad carries no code and no zeroMask: quadRoute sends a non-finite colour to prog (P23 `colour`)',
});

/**
 * GM-11a-3: the quad's per-instance attributes and the locations the backend binds them to before the link. A run of
 * quads is one instanced draw; each quad is one instance, its inputs read once from the instance buffer (divisor 1).
 */
export const UI_GPU_QUAD_ATTRIBUTES = Object.freeze({ a_rect: 0, a_colour: 1, a_codes: 2, a_axis: 3, a_flags: 4 } as const);

/**
 * The quad programs' vertex shader: the plan's integer rectangle as a four-vertex strip, corners on pixel edges.
 * GM-11a-3: instanced -- the quad comes from its instance's attributes (the rectangle, the colour as f32 numbers and
 * their codes, the axis entries' base and whether it is textured, the zero mask and the additive flag), handed to the
 * fragment shader as **flat** varyings: a flat varying is the provoking vertex's value, never interpolated (ESSL 3.00
 * §4.3.9), so the fragment receives the f32 numbers and integers the backend wrote, bit for bit -- the uniforms' values
 * of GM-11a-2, by another road.
 */
export const UI_GPU_QUAD_VERTEX_SOURCE = `#version 300 es
precision highp float;
precision highp int;
// The quad's integer pixels xs <= x < xe, ys <= y < ye (the plan's rectangle, P3, P4) and the frame's size. Frame row y
// is GL row y; the corners are pixel edges, so every covered pixel's centre is half a pixel inside them.
uniform vec2 u_size;
// One instance a quad: its rectangle, colour, codes, axis base and textured flag (x, y, textured, 0), zero mask and additive.
in ivec4 a_rect;
in vec4 a_colour;
in ivec4 a_codes;
in ivec4 a_axis;
in ivec2 a_flags;
flat out ivec4 q_rect;
flat out vec4 q_colour;
flat out ivec4 q_codes;
flat out ivec2 q_axisBase;
flat out int q_textured;
flat out int q_zeroMask;
flat out int q_additive;
void main() {
  q_rect = a_rect;
  q_colour = a_colour;
  q_codes = a_codes;
  q_axisBase = a_axis.xy;
  q_textured = a_axis.z;
  q_zeroMask = a_flags.x;
  q_additive = a_flags.y;
  // A strip: (xs, ys) (xe, ys) (xs, ye) (xe, ye). No vertex positions: the corners come from gl_VertexID.
  int v = gl_VertexID;
  float x = float((v & 1) == 0 ? a_rect.x : a_rect.z);
  float y = float(v < 2 ? a_rect.y : a_rect.w);
  gl_Position = vec4(vec2(x, y) / u_size * 2.0 - 1.0, 0.0, 1.0);
}
`;

const HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp usampler2D;
const int AXIS_W = ${UI_GPU_AXIS_WIDTH};
// The quad (the plan's UiPlanQuad, one instance): its rectangle, its colour as f32 numbers, whether it is textured, and
// where its column and row entries start in the axis table (entry indices) -- flat from the vertex shader.
flat in ivec4 q_rect;
flat in vec4 q_colour;
flat in int q_textured;
flat in ivec2 q_axisBase;
uniform usampler2D u_tex;
uniform sampler2D u_axis;
out vec4 o_colour;
`;

/**
 * The texel fetches both quad paths share: the column and row entries from the axis table, then the four texels at
 * (left, top), (right, top), (left, bottom), (right, bottom), as numbers. Inlined into each program's S4-S5 span.
 */
const AXIS_AND_TEXELS = `    int ce = q_axisBase.x + (p.x - q_rect.x);
    vec4 col = texelFetch(u_axis, ivec2(ce % AXIS_W, ce / AXIS_W), 0);
    int re = q_axisBase.y + (p.y - q_rect.y);
    vec4 row = texelFetch(u_axis, ivec2(re % AXIS_W, re / AXIS_W), 0);
    int left = int(col.x), right = int(col.y), top = int(row.x), bottom = int(row.y);
    float fx = col.z, ix = col.w, fy = row.z, iy = row.w;
    vec4 tl = vec4(texelFetch(u_tex, ivec2(left, top), 0));
    vec4 tr = vec4(texelFetch(u_tex, ivec2(right, top), 0));
    vec4 bl = vec4(texelFetch(u_tex, ivec2(left, bottom), 0));
    vec4 br = vec4(texelFetch(u_tex, ivec2(right, bottom), 0));
`;

/** `quad-ff-src` and `quad-ff-add`: the source colour for the blender (`UI_GPU_FF_BLEND`). */
function ffSource(additive: boolean): string {
  const out = additive
    ? `  // S11: the additive blend's output colour, min(1, c * a / 255), clamped; the blender adds it (ONE, ONE) -- P10, P11; GS_MODULATE_BLEND_READING, GS_ALPHA_FRAME_START_READING
  vec3 o = clamp(min(vec3(1.0), (vec3(r, g, b) * a) / 255.0), 0.0, 1.0);`
    : `  // S11: the source blend's output colour, c / 255, clamped; the blender takes C + (c - C) a as SRC_ALPHA, ONE_MINUS_SRC_ALPHA -- P10, P11; GS_MODULATE_BLEND_READING, GS_ALPHA_FRAME_START_READING
  vec3 o = clamp(vec3(r, g, b) / 255.0, 0.0, 1.0);`;
  return `${HEADER}
void main() {
  // S1: the integer pixel of the quad's rectangle -- P3, P4; GS_SPRITE_COVERAGE_READING, GS_SPRITE_SUBPIXEL_READING
  ivec2 p = ivec2(gl_FragCoord.xy);
  float red = q_colour.r, green = q_colour.g, blue = q_colour.b;
  // S3: the alpha byte over 128, unclamped -- P9; UI_QUAD_ALPHA_RANGE_READING
  float alpha = q_colour.a / 128.0;
  float r = red, g = green, b = blue, a = alpha;
  if (q_textured != 0) {
    // S4: the column entry (left, right, fx, ix), f64 on the CPU, received as f32 -- P5, P6; GS_BILINEAR_WEIGHT_READING, UI_TEXTURE_WRAP_READING, UV_REPEAT_READING
    // S5: the row entry (top, bottom, fy, iy), f64 on the CPU, received as f32 -- P5, P6; GS_BILINEAR_WEIGHT_READING, UI_TEXTURE_WRAP_READING
${AXIS_AND_TEXELS}    // S6: each source row's horizontal lerp, d[l] * ix + d[r] * fx -- P6; UI_TEXTURE_FILTER_READING
    vec4 upper = tl * ix + tr * fx;
    vec4 lower = bl * ix + br * fx;
    // S7: the vertical lerp, top * iy + lower * fy -- P6; UI_TEXTURE_FILTER_READING
    vec4 t = upper * iy + lower * fy;
    // S8: the modulate, min(255, (t * c) / 128) -- P8, P9; GS_MODULATE_BLEND_READING
    r = min(255.0, (t.r * red) / 128.0);
    g = min(255.0, (t.g * green) / 128.0);
    b = min(255.0, (t.b * blue) / 128.0);
    // S9: the alpha modulate, (ta / 255) * alpha, unclamped -- P8; GS_MODULATE_BLEND_READING, UI_QUAD_ALPHA_RANGE_READING
    a = (t.a / 255.0) * alpha;
  }
  // S10: the frame alpha: the source alpha clamp(a, 0, 1) for the blender's ONE_MINUS_DST_ALPHA, ONE (A + (255 - A) min(1, a)) -- P14
  float oa = clamp(a, 0.0, 1.0);
${out}
  o_colour = vec4(o, oa);
}
`;
}

/** `quad-prog`: the software's formula from the batch's destination copy, stored roundEven(clamp(v)). */
const PROG = `${HEADER}flat in ivec4 q_codes;
flat in int q_zeroMask;
flat in int q_additive;
uniform ivec2 u_destOrigin;
uniform sampler2D u_dest;

// The software's numbers are IEEE 754 doubles; the twin and this program carry them as f32. A GLSL ES GPU need not keep
// infinities or NaN (ESSL 3.00 section 4.5.1), so a value here is a finite float v and a kind k -- 0 finite, 1 NaN,
// 2 +infinity, 3 -infinity (the plan's code table, UI_PLAN_CODE) -- and an operation with a non-finite operand is decided
// as IEEE 754 decides it. An operation on two finite values is the float operation itself.
struct X { float v; int k; };
X fin(float v) { return X(v, 0); }
X nanX() { return X(0.0, 1); }
X infX(int s) { if (s > 0) return X(0.0, 2); return X(0.0, 3); }
int sgnX(X a) {
  if (a.k == 2) return 1;
  if (a.k == 3) return -1;
  if (a.v > 0.0) return 1;
  if (a.v < 0.0) return -1;
  return 0;
}
X negX(X a) {
  if (a.k == 2) return X(0.0, 3);
  if (a.k == 3) return X(0.0, 2);
  return X(-a.v, a.k);
}
// a + b: NaN in, NaN out; infinity plus a finite value is that infinity; +infinity plus -infinity is NaN.
X addX(X a, X b) {
  if (a.k == 1 || b.k == 1) return nanX();
  if (a.k == 0 && b.k == 0) return fin(a.v + b.v);
  if (a.k == 0) return b;
  if (b.k == 0) return a;
  if (a.k == b.k) return a;
  return nanX();
}
// a - b.
X subX(X a, X b) {
  if (a.k == 0 && b.k == 0) return fin(a.v - b.v);
  return addX(a, negX(b));
}
// a * b: infinity times zero is NaN; otherwise an infinity carries the product's sign.
X mulX(X a, X b) {
  if (a.k == 1 || b.k == 1) return nanX();
  if (a.k == 0 && b.k == 0) return fin(a.v * b.v);
  int s = sgnX(a) * sgnX(b);
  if (s == 0) return nanX();
  return infX(s);
}
// a / d for a positive finite constant d: an infinity or NaN stays as it is.
X divX(X a, float d) {
  if (a.k != 0) return a;
  return fin(a.v / d);
}
// Math.min(m, a) for a finite m: NaN if a is NaN.
X minX(float m, X a) {
  if (a.k == 1) return a;
  if (a.k == 2) return fin(m);
  if (a.k == 3) return a;
  return fin(min(m, a.v));
}
// The Uint8ClampedArray's store: NaN 0, +infinity 255, -infinity 0, a finite value clamped and rounded half to even.
float storeX(X v) {
  if (v.k == 2) return 255.0;
  if (v.k != 0) return 0.0;
  return roundEven(clamp(v.v, 0.0, 255.0));
}
// A colour channel as the plan carries it: a finite number, or its code with the number 0.
X chan(float v, int k) {
  if (k == 0) return fin(v);
  return X(0.0, k);
}

void main() {
  // S1: the integer pixel of the quad's rectangle -- P3, P4; GS_SPRITE_COVERAGE_READING, GS_SPRITE_SUBPIXEL_READING
  ivec2 p = ivec2(gl_FragCoord.xy);
  // S2: the destination read: the batch's copy, taken before its first quad, as whole bytes -- P10, P11, P14
  vec4 C = roundEven(texelFetch(u_dest, p - u_destOrigin, 0) * 255.0);
  X red = chan(q_colour.r, q_codes.x);
  X green = chan(q_colour.g, q_codes.y);
  X blue = chan(q_colour.b, q_codes.z);
  // S3: the alpha byte over 128, unclamped -- P9; UI_QUAD_ALPHA_RANGE_READING
  X alpha = divX(chan(q_colour.a, q_codes.w), 128.0);
  X r = red;
  X g = green;
  X b = blue;
  X a = alpha;
  if (q_textured != 0) {
    // S4: the column entry (left, right, fx, ix), f64 on the CPU, received as f32 -- P5, P6; GS_BILINEAR_WEIGHT_READING, UI_TEXTURE_WRAP_READING, UV_REPEAT_READING
    // S5: the row entry (top, bottom, fy, iy), f64 on the CPU, received as f32 -- P5, P6; GS_BILINEAR_WEIGHT_READING, UI_TEXTURE_WRAP_READING
${AXIS_AND_TEXELS}    // S6: each source row's horizontal lerp, d[l] * ix + d[r] * fx -- P6; UI_TEXTURE_FILTER_READING
    vec4 upper = tl * ix + tr * fx;
    vec4 lower = bl * ix + br * fx;
    // S7: the vertical lerp, top * iy + lower * fy -- P6; UI_TEXTURE_FILTER_READING
    vec4 t = upper * iy + lower * fy;
    // S8: the modulate, min(255, (t * c) / 128) -- P8, P9; GS_MODULATE_BLEND_READING
    r = minX(255.0, divX(mulX(fin(t.r), red), 128.0));
    g = minX(255.0, divX(mulX(fin(t.g), green), 128.0));
    b = minX(255.0, divX(mulX(fin(t.b), blue), 128.0));
    // S9: the alpha modulate, (ta / 255) * alpha, unclamped -- P8; GS_MODULATE_BLEND_READING, UI_QUAD_ALPHA_RANGE_READING
    a = mulX(fin(t.a / 255.0), alpha);
  }
  // S10: the frame alpha, A + (255 - A) * min(1, a) -- P14
  X nA = addX(fin(C.a), mulX(fin(255.0 - C.a), minX(1.0, a)));
  // S11: the blend: source C + (c - C) * a, additive C + c * a -- P10, P11; GS_MODULATE_BLEND_READING, GS_ALPHA_FRAME_START_READING
  X n0;
  X n1;
  X n2;
  if (q_additive != 0) {
    n0 = addX(fin(C.r), mulX(r, a));
    n1 = addX(fin(C.g), mulX(g, a));
    n2 = addX(fin(C.b), mulX(b, a));
  } else {
    n0 = addX(fin(C.r), mulX(subX(r, fin(C.r)), a));
    n1 = addX(fin(C.g), mulX(subX(g, fin(C.g)), a));
    n2 = addX(fin(C.b), mulX(subX(b, fin(C.b)), a));
  }
  // S12: the store, roundEven(clamp(v, 0, 255)), NaN 0 -- P12; GS_BLEND_ROUNDING_READING
  vec4 o = vec4(storeX(n0), storeX(n1), storeX(n2), storeX(nA));
  // S13: the non-finite codes: a NaN channel stored 0 whatever the pixel (zeroMask; bit 3: all four) -- P23; GS_BLEND_ROUNDING_READING
  if ((q_zeroMask & 8) != 0) {
    o = vec4(0.0);
  } else {
    if ((q_zeroMask & 1) != 0) o.r = 0.0;
    if ((q_zeroMask & 2) != 0) o.g = 0.0;
    if ((q_zeroMask & 4) != 0) o.b = 0.0;
  }
  o_colour = o / 255.0;
}
`;

/**
 * GM-15a (research 380 M2-M7, §2.2; GM.R4, GM.R10): `model-ff-src` and `model-ff-add`, the software's `drawModels`
 * (`uiCompositorView.ts`) per pixel in the f32 twin's order (`drawTriangleTwin`, T1-T12; T11, the blend, is the
 * blender's: `UI_GPU_MODEL_FF_OMITS`). The vertex shader draws the triangle's integer box (the plan's `box`,
 * `ceil(min) .. ceil(max)` clipped, M2) as a four-vertex strip whose corners are pixel edges; this program decides each
 * pixel of the box at its integer point (x, y) -- the software's point, not the pixel's centre -- by its three edge
 * functions under the GS's top-left rule (T2, T3; GM-15d, `UI_MODEL_EDGE_RULE_READING`), and writes `gl_FragDepth` on
 * every path it does not discard (T5) against a `DEPTH_COMPONENT32F` buffer tested `GEQUAL` (GM-15d, `TEST_1` ZTST
 * GEQUAL: the later of two equal depths wins; the pass's clear to 0 is the software's "empty", and every planned depth
 * is above it, `UI_GPU_MODEL_DEPTH_FLOOR`).
 *
 * The top-left flags are derived here from the vertices, not carried in the triangle record (GM-15d's choice): each
 * edge's gradient is a difference of two f32 vertex coordinates (its sign and its zero exact) and the winding is inv's
 * sign, the same f32 numbers the edge functions use -- so the decision on a shared edge is consistent between its two
 * triangles by construction, the record (`UI_GPU_TRIANGLE_LAYOUT`) and its writer stay as they are, and the cost is a
 * handful of compares a fragment. The twin's `T3_inside` and `T3_owns` are this, step for step.
 *
 * **The caveat (GM-15d review F2): "by construction" holds only while `e0` .. `e2` are evaluated as written, each product
 * rounded.** The two walks of a shared edge compute `a b - c d` and `c d - a b`, exact negatives in IEEE arithmetic; a
 * compiler that contracts either into an FMA (`fma(a, b, -c d)`) keeps one product unrounded, the two results stop being
 * negatives, and a pixel on the edge can be owned by both triangles (a double add) or by neither (a hole). GLSL ES 3.00
 * gives no way to forbid the contraction here: `precise` is GLSL ES 3.20 (and `EXT_gpu_shader5`), not WebGL 2's
 * language, and `invariant` constrains an output's value across programs, not how an expression is evaluated; no
 * contraction-proof structure is relied on here, none being guaranteed by the spec. GM-27 therefore measures the model
 * seams on real GPUs on purpose (the plan's row: the seam pixels of the roller and ARMORY cases, double writes and holes
 * counted).
 * `sample` (T8) is `texelFetch` on the `RGBA8UI` bitmap, its lerp written out (no `texture(`, no `mix(`), REPEAT in
 * integers without a `%` on a negative operand (undefined, ESSL 3.00 section 5.9).
 */
function modelSource(additive: boolean): string {
  const out = additive
    ? `  vec3 o = clamp(min(vec3(1.0), (vec3(r, g, b) * al) / 255.0), 0.0, 1.0);`
    : `  vec3 o = clamp(vec3(r, g, b) / 255.0, 0.0, 1.0);`;
  return `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
// The triangle (the plan's UiPlanTriangle, one instance), flat from the vertex shader: a and b on the target's grid; c,
// the f64 signed area's reciprocal as f32; the three invW and the textured flag; u; v; the three colours.
flat in vec4 t_ab;
flat in vec4 t_c;
flat in vec4 t_w;
flat in vec3 t_u;
flat in vec3 t_v;
flat in vec4 t_ca;
flat in vec4 t_cb;
flat in vec4 t_cc;
uniform usampler2D u_tex;
// The pass's power-of-two depth scale (UiPlanPass.depthScale, GM.R10): every vertex's invW times it is at most 1/2 and,
// the plan refusing the rest, at least 2^-100 (GM-15b): the clamp below never acts on a planned pass.
uniform float u_depthScale;
out vec4 o_colour;

// REPEAT in integers, the software's wrap ((i % n) + n) % n; a negative i is folded before its remainder is taken.
int wrapRepeat(int i, int n) {
  return i >= 0 ? i % n : (n - 1) - ((-i - 1) % n);
}

// The top-left rule for one edge (the twin's owns step of T3; modelEdgeOwns): the triangle owns the pixel when its edge function
// e times the winding s is positive, or e is 0 on a left edge (s gx > 0) or a top one (gx 0, s gy > 0). One owner per
// shared-edge pixel holds only if e0..e2 are not contracted into FMAs (see the program's doc; GM-27 measures it).
bool owns(float e, float gx, float gy, float s) {
  return s * e > 0.0 || (e == 0.0 && (s * gx > 0.0 || (gx == 0.0 && s * gy > 0.0)));
}

void main() {
  // T1: the integer pixel of the triangle's box ceil(min) .. ceil(max), taken at its integer point (x, y) -- M2; UI_MODEL_EDGE_RULE_READING
  ivec2 p = ivec2(gl_FragCoord.xy);
  float x = float(p.x);
  float y = float(p.y);
  float ax = t_ab.x, ay = t_ab.y, bx = t_ab.z, by = t_ab.w, cx = t_c.x, cy = t_c.y, inv = t_c.z;
  // T2: the edge functions at the integer point, (b.x - x)(c.y - y) - (c.x - x)(b.y - y) for b c, c a, a b; the weights e inv, then 1 - w0 - w1 -- M2; UI_MODEL_EDGE_RULE_READING
  float e0 = ((bx - x) * (cy - y)) - ((cx - x) * (by - y));
  float e1 = ((cx - x) * (ay - y)) - ((ax - x) * (cy - y));
  float e2 = ((ax - x) * (by - y)) - ((bx - x) * (ay - y));
  float w0 = e0 * inv;
  float w1 = e1 * inv;
  float w2 = (1.0 - w0) - w1;
  // T3: inside by the top-left rule, the winding from inv's sign, each edge's gradient from the vertices -- M2; UI_MODEL_EDGE_RULE_READING
  float wind = inv < 0.0 ? -1.0 : 1.0;
  if (!(owns(e0, by - cy, cx - bx, wind) && owns(e1, cy - ay, ax - cx, wind) && owns(e2, ay - by, bx - ax, wind))) discard;
  // T4: invW from the weights, (w0 a.invW + w1 b.invW) + w2 c.invW -- M3; UI_MODEL_DEPTH_FORMAT_READING
  float invW = ((w0 * t_w.x) + (w1 * t_w.y)) + (w2 * t_w.z);
  // T5: the depth, invW times the pass's scale, clamped; GEQUAL on depth32f: the later of two equal depths wins, the clear's 0 empty -- M3; UI_MODEL_DEPTH_FORMAT_READING
  gl_FragDepth = clamp(invW * u_depthScale, 0.0, 1.0);
  // T6: the perspective-corrected weights, w (v.invW / invW) -- M4; UI_MODEL_GOURAUD_READING
  w0 = w0 * (t_w.x / invW);
  w1 = w1 * (t_w.y / invW);
  w2 = w2 * (t_w.z / invW);
  // T7: u, v and the colour from the weights, (w0 a + w1 b) + w2 c -- M4; UI_MODEL_GOURAUD_READING
  vec4 rgba = ((w0 * t_ca) + (w1 * t_cb)) + (w2 * t_cc);
  float u = ((w0 * t_u.x) + (w1 * t_u.y)) + (w2 * t_u.z);
  float v = ((w0 * t_v.x) + (w1 * t_v.y)) + (w2 * t_v.z);
  bool textured = t_w.w != 0.0;
  vec4 s = vec4(0.0);
  if (textured) {
    // T8: sample() at (u W, (1 - v) H): x = U - 0.5, its floor, REPEAT in integers, (a (1 - fx) + b fx)(1 - fy) + (e (1 - fx) + g fx) fy -- M5; UI_MODEL_TEXTURE_ROWS_READING, UV_REPEAT_READING, UI_TEXTURE_FILTER_READING
    ivec2 size = textureSize(u_tex, 0);
    float U = u * float(size.x);
    float V = (1.0 - v) * float(size.y);
    float sx = U - 0.5;
    float sy = V - 0.5;
    int x0 = int(floor(sx));
    int y0 = int(floor(sy));
    float fx = sx - float(x0);
    float fy = sy - float(y0);
    int xa = wrapRepeat(x0, size.x);
    int xb = wrapRepeat(x0 + 1, size.x);
    int ya = wrapRepeat(y0, size.y);
    int yb = wrapRepeat(y0 + 1, size.y);
    vec4 ta = vec4(texelFetch(u_tex, ivec2(xa, ya), 0));
    vec4 tb = vec4(texelFetch(u_tex, ivec2(xb, ya), 0));
    vec4 te = vec4(texelFetch(u_tex, ivec2(xa, yb), 0));
    vec4 tg = vec4(texelFetch(u_tex, ivec2(xb, yb), 0));
    s = (((ta * (1.0 - fx)) + (tb * fx)) * (1.0 - fy)) + (((te * (1.0 - fx)) + (tg * fx)) * fy);
  }
  // T9: the modulate, min(255, (s c) / 128) and (s.a / 255)(c.a / 128); untextured, the colour as it stands -- M5, P8; GS_MODULATE_BLEND_READING
  float r = rgba.r, g = rgba.g, b = rgba.b;
  float al = rgba.a / 128.0;
  if (textured) {
    r = min(255.0, (s.r * rgba.r) / 128.0);
    g = min(255.0, (s.g * rgba.g) / 128.0);
    b = min(255.0, (s.b * rgba.b) / 128.0);
    al = (s.a / 255.0) * (rgba.a / 128.0);
  }
  // T10: no colour and no depth at al <= 0 -- M6; UI_MODEL_ZWRITE_READING
  if (al <= 0.0) discard;
  // The blend is the blender's (UI_GPU_MODEL_FF_BLEND, the frame's alpha masked, M7): the source colour out, clamped.
${out}
  o_colour = vec4(o, clamp(al, 0.0, 1.0));
  // T12: the depth written: the hardware stores gl_FragDepth where GEQUAL passed, the depth mask on -- M3; UI_MODEL_DEPTH_FORMAT_READING
}
`;
}

/** The fragment sources by program name (GM-08's drift guard reads `quad-*` for the S tags, `model-*` for the T tags). */
export const UI_GPU_SHADER_SOURCES: Readonly<Record<UiGpuShaderProgram, string>> = Object.freeze({
  'quad-ff-src': ffSource(false),
  'quad-ff-add': ffSource(true),
  'quad-prog': PROG,
  'model-ff-src': modelSource(false),
  'model-ff-add': modelSource(true),
});
