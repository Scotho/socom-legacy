import type { UiPlanStep } from './uiFramePlan';
import type { UiGpuModelProgram } from './uiGpuShaders';

/**
 * GM-15a (the GPU menus plan, `docs/plans/2026-11-01-gpu-menus.md`, row GM-15; research 380 M1-M7, §2.2; GM.R10): the
 * models pass's GPU side beside its fragment programs (`model-ff-src`, `model-ff-add` in `uiGpuShaders.ts`, which carry
 * the per-pixel rules, their citations and the twin's T tags): the vertex shader, the per-instance layout, which program
 * a run takes, and the blender's state.
 *
 * **No rule here is new.** The rules are the software's `drawModels` (`uiCompositorView.ts`), cited to the original in
 * research 380 §2.2 (M1-M7) and the readings each tag names; what this module adds decides how a GPU is driven to
 * reproduce them -- one instance a triangle, the box as a strip, the numbers carried flat -- and no byte. As the quads'
 * (GM-11a-3): a run of triangles (a `triangles` step: one program, blend and texture) is one `drawArraysInstanced`, its
 * triangles the instances in the run's order (ES 3.0 section 2.9.3: instance by instance, so P1's order holds, and the
 * depth test sees each triangle after the ones before it, as the software's loop does).
 *
 * The depth (M3; `UI_MODEL_DEPTH_FORMAT_READING`): a `DEPTH_COMPONENT32F` attachment on the frame target, cleared to 0 at
 * each `pass` (the software's "empty"), tested `GEQUAL` (GM-15d: an equal depth passes, the later drawn wins; every
 * planned depth is above the clear's 0, so "empty" passes as the software's does), written where the test passes; `gl_FragDepth = clamp(invW * depthScale, 0, 1)` with the pass's power-of-two
 * `depthScale` (`UiPlanPass.depthScale`): a GM.R10 design choice that decides no byte -- a power of two scales an f32
 * exactly unless it underflows -- so it is no adaptation constant (research 380 §5 says so). GM-15b: the scale brings
 * every vertex to at most 1/2, so no depth reaches the clamp at 1, and the plan refuses (L1, named) a pass with a depth
 * under `UI_GPU_MODEL_DEPTH_FLOOR` (a 0 or a subnormal the GPU may flush) and a textured triangle past
 * `UI_GPU_MODEL_TEXEL_RANGE` (T8's int range): the clamp at 0 never acts either.
 * GEQUAL is the original's test -- the bind packets' `TEST_1` 0x5000c, ZTE 1, ZTST GEQUAL (research 185 §3.1, re-read
 * §11.3) -- which GM-15d put in the software reference (`UI_MODEL_DEPTH_FORMAT_READING`, `uiRasterRules.ts`; the plan's
 * Log, R1 resolved by (a)); before it the software and this pass kept the first of two equal depths (a strict `>`), and
 * the software's f64 compare against its f32 store made R1's double adds. The GPU follows the software (GM.R5). The
 * edges likewise take the GS's top-left rule (`UI_MODEL_EDGE_RULE_READING`, the model programs' `owns`).
 *
 * Nothing changes for players: `UiGpuBackend` (`uiGpuWebgl2.ts`) draws with this behind the switch, which keeps every
 * surface `off`.
 */

/**
 * The triangle's per-instance attributes and the locations the backend binds before the link: the integer box; a and b
 * (x, y each, on the target's grid); c with the f64 area's reciprocal (`Math.fround(1 / area)`, the twin's `inv`); the
 * three `invW` and the textured flag; u; v; the three vertex colours as given.
 */
export const UI_GPU_MODEL_ATTRIBUTES = Object.freeze({ a_box: 0, a_ab: 1, a_c: 2, a_w: 3, a_u: 4, a_v: 5, a_ca: 6, a_cb: 7, a_cc: 8 } as const);

/**
 * One triangle's instance record, 136 bytes, little-endian as the platform's typed arrays write it (WebGL is
 * little-endian), mirroring `UI_GPU_INSTANCE_LAYOUT`: `a_box` 4 x i32 (xs, ys, xe, ye); `a_ab` 4 x f32 (a.x, a.y, b.x,
 * b.y); `a_c` 4 x f32 (c.x, c.y, inv, 0); `a_w` 4 x f32 (a.invW, b.invW, c.invW, textured 0 or 1); `a_u`, `a_v` 3 x f32
 * each (a, b, c); `a_ca`, `a_cb`, `a_cc` 4 x f32 each (RGBA). Byte offsets. Each number reaches the GPU as its nearest
 * f32 (`Float32Array`'s conversion), as the twin's `Math.fround` takes it.
 */
export const UI_GPU_TRIANGLE_LAYOUT = Object.freeze({ stride: 136, a_box: 0, a_ab: 16, a_c: 32, a_w: 48, a_u: 64, a_v: 76, a_ca: 88, a_cb: 104, a_cc: 120 } as const);

/**
 * The model programs' vertex shader: the triangle's integer box (the plan's, M2) as a four-vertex strip whose corners
 * are pixel edges (as `UI_GPU_QUAD_VERTEX_SOURCE`: no vertex positions, the corners from `gl_VertexID`), so every pixel
 * of the box is shaded once and decided by the fragment program at its integer point. Every other input is handed on as
 * a **flat** varying: the provoking vertex's value, never interpolated (ESSL 3.00 section 4.3.9), bit for bit what the
 * backend wrote.
 */
export const UI_GPU_MODEL_VERTEX_SOURCE = `#version 300 es
precision highp float;
precision highp int;
// The frame's size; the triangle's box xs <= x < xe, ys <= y < ye (frame row y is GL row y).
uniform vec2 u_size;
in ivec4 a_box;
in vec4 a_ab;
in vec4 a_c;
in vec4 a_w;
in vec3 a_u;
in vec3 a_v;
in vec4 a_ca;
in vec4 a_cb;
in vec4 a_cc;
flat out vec4 t_ab;
flat out vec4 t_c;
flat out vec4 t_w;
flat out vec3 t_u;
flat out vec3 t_v;
flat out vec4 t_ca;
flat out vec4 t_cb;
flat out vec4 t_cc;
void main() {
  t_ab = a_ab;
  t_c = a_c;
  t_w = a_w;
  t_u = a_u;
  t_v = a_v;
  t_ca = a_ca;
  t_cb = a_cb;
  t_cc = a_cc;
  // A strip over the box: (xs, ys) (xe, ys) (xs, ye) (xe, ye), from gl_VertexID.
  int v = gl_VertexID;
  float x = float((v & 1) == 0 ? a_box.x : a_box.z);
  float y = float(v < 2 ? a_box.y : a_box.w);
  gl_Position = vec4(vec2(x, y) / u_size * 2.0 - 1.0, 0.0, 1.0);
}
`;

/**
 * The program a run of triangles is drawn with: by its blend (`ALPHA_1` 0x44 source, 0x48 additive; M7, P10, P11). Only
 * the fixed-function path exists (GM-06b's `triangleRoute`); a `prog` run -- which keeps its frame L1 by the plan's
 * verdict -- is GM-26's and throws here.
 */
export function modelProgramFor(step: Pick<Extract<UiPlanStep, { kind: 'triangles' }>, 'path' | 'blend'>): UiGpuModelProgram {
  if (step.path !== 'ff') throw new Error('modelProgramFor: a programmable model run is GM-26\'s');
  return step.blend === 'additive' ? 'model-ff-add' : 'model-ff-src';
}

/** The blender's factors as `blendFuncSeparate` takes them (`FUNC_ADD` both). */
export type UiGpuModelBlendFactor = 'ONE' | 'ZERO' | 'SRC_ALPHA' | 'ONE_MINUS_SRC_ALPHA';

/**
 * The blender's state per model program (`blendFuncSeparate(srcRGB, dstRGB, srcAlpha, dstAlpha)`, `FUNC_ADD`): the
 * twin's `S11ff_source` (`SRC_ALPHA, ONE_MINUS_SRC_ALPHA`: the software's `C + (c - C) al`, P10) and `S11ff_additive`
 * (`ONE, ONE` over `min(1, c al / 255)`: `C + c al`, P11). The frame's alpha is untouched (M7): the colour mask writes
 * RGB only, and the alpha factors `ZERO, ONE` would keep it besides.
 */
export const UI_GPU_MODEL_FF_BLEND: Readonly<Record<UiGpuModelProgram, readonly [UiGpuModelBlendFactor, UiGpuModelBlendFactor, UiGpuModelBlendFactor, UiGpuModelBlendFactor]>> = Object.freeze({
  'model-ff-src': ['SRC_ALPHA', 'ONE_MINUS_SRC_ALPHA', 'ZERO', 'ONE'],
  'model-ff-add': ['ONE', 'ONE', 'ZERO', 'ONE'],
} as const);

/**
 * The twin's model steps a model program does not carry, and why (the drift guard's exception,
 * `uiGpuShaderTwin.test.ts`: the `model-*` programs carry T1-T12 less T11).
 */
export const UI_GPU_MODEL_FF_OMITS: Readonly<Record<string, string>> = Object.freeze({
  T11: 'the blend is the fixed-function blender\'s (UI_GPU_MODEL_FF_BLEND), the frame alpha masked (M7)',
});
