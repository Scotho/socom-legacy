import type { Rgba } from '@s2u/gs';
import { UI_PLAN_CODE, type UiFramePlan, type UiPlanQuad, type UiPlanRect, type UiPlanStep } from './uiFramePlan';
import {
  UI_GPU_AXIS_WIDTH, UI_GPU_FF_BLEND, UI_GPU_MODEL_PROGRAMS, UI_GPU_QUAD_ATTRIBUTES, UI_GPU_QUAD_PROGRAMS, UI_GPU_QUAD_VERTEX_SOURCE, UI_GPU_SHADER_SOURCES,
  UI_GPU_TEXTURE_UNITS, type UiGpuModelProgram, type UiGpuQuadProgram, type UiGpuShaderProgram,
} from './uiGpuShaders';
import { UI_GPU_MODEL_ATTRIBUTES, UI_GPU_MODEL_FF_BLEND, UI_GPU_MODEL_VERTEX_SOURCE, UI_GPU_TRIANGLE_LAYOUT, modelProgramFor } from './uiGpuModels';
import type { UiGpuCaps } from './uiGpuSwitch';
import {
  UI_GPU_MOVIE_FRAGMENT_SOURCE, UI_GPU_MOVIE_TEXTURES_ADAPTATION, UI_GPU_MOVIE_UNIT, UI_GPU_MOVIE_VERTEX_SOURCE, UiGpuMovieTextures, releasedMovie,
  type UiGpuMovieStats,
} from './uiGpuMovie';
import {
  UiGpuTextureCache, uiGpuOversizeRefusal, uiGpuOversized, type UiGpuHdKeys, type UiGpuTextureOptions, type UiGpuTextureStats,
} from './uiGpuTextures';

/**
 * GM-11a-1 (the GPU menus plan, `docs/plans/2026-11-01-gpu-menus.md`, "Architecture" and "Frame conventions"; research
 * 380 P15): the WebGL2 base of the menus' GPU drawer -- the context, the frame target (an RGBA8 texture in a
 * framebuffer, the frame's size), the clear, the software-frame upload, the present blit onto the canvas, and
 * `readPixels`. The quad and model programs (GM-11a-2, GM-11a-3), the lifecycle and loss (GM-12a) and the texture
 * cache (GM-13) build on it.
 *
 * **No rule of the game is here.** The bytes a clear writes are the plan's (`clearBytes`, `uiRasterRules.ts`: the
 * software's packed fill, P15, cited to the original in research 380 §2); this module only carries them to the GPU
 * unchanged. Everything else is a browser adaptation that changes no pixel, held by `test/uiGpuWebgl2.test.ts` (a fake
 * GL's call contract and bytes) and, on a real GPU, by `e2e/uiGpuHarness.spec.ts`:
 * - **The frame target**: frame row `y` is GL row `y` (no flip on upload or on `readPixels`); bitmaps and frames are
 *   uploaded top row first, not premultiplied, no colour conversion; the present blit flips once (`blitFramebuffer`,
 *   `NEAREST`, 1:1) so frame row 0 is the page's top row.
 * - **A frame starts as the software's** (`rasterizeUiDrawList`): opaque (0, 0, 0, 255), transparent all zero.
 * - **The clear** writes `clearColor(k / 255)` for the plan's whole bytes `k`, under a state that cannot alter a byte:
 *   no scissor, no dither, no rasterizer discard, every channel written. A real GPU's conversion of `k / 255` back to
 *   `k` is the box's to show (the harness sweeps every byte value; GM-11b).
 * - **A transparent frame** (the Settings overlay) is held before the software's divide (P22: premultiplied over black,
 *   as the canvas composites it, `premultipliedAlpha: true`); the presenter divides it on `readFrame`. GM-19a: it reaches
 *   the canvas through the premultiplied present (`UI_GPU_PREMULTIPLIED_PRESENT_ADAPTATION`: each channel at most its
 *   alpha), never a blit of RGB over A.
 * - **Nothing changes for players**: no module imports this one statically (the plan: the GPU modules are reached by
 *   `import()` only), and the switch (`uiGpuSwitch.ts`) keeps every surface `off`.
 *
 * **GM-11a-2: the quads** (`draw`). A plan of `clear`, `copy` and `quads` steps is drawn on the GPU in the plan's order
 * (P1): each quad as one four-vertex strip over its integer rectangle, through `quad-ff-src`, `quad-ff-add` or
 * `quad-prog` (`uiGpuShaders.ts`, which carries the rules and their citations, tagged with the f32 twin's steps); the
 * plan's f64 axis tables uploaded once a frame as an `RGBA32F` texture (GM.R3); each programmable batch's destination
 * copied (`copyTexSubImage2D`) into an `RGBA8` scratch texture before its first quad (GM.R7: the plan's batches never
 * overlap inside); each bitmap uploaded as `RGBA8UI`, top row first, read by `texelFetch` only. What this module adds
 * decides how the GPU is driven, never a byte: the bytes are the programs' and the blender's, and
 * `test/uiGpuShaders.test.ts` holds the call sequence on a fake GL whose programs run the twin's arithmetic, frame for
 * frame equal to `executeFramePlanOnTwin` over GM-03's cases. The bitmap textures are GM-13's texture cache's
 * (`uiGpuTextures.ts`): content keys, residency across frames, the per-frame upload budget (`stageTextures`) and the
 * VRAM LRU.
 *
 * **GM-11a-3: the movie** (`draw`'s `movie` steps; P17). The picture is held in one of the movie's `RGBA8UI` textures
 * (`uiGpuMovie.ts`: uploaded in the render that first shows it, keyed on the picture object, a released buffer never
 * touched) and copied by the `movie` program over the step's rectangle -- `texelFetch(u_movie, p / s)`, blending off,
 * the colour mask RGB only (the frame's alpha untouched).
 *
 * **GM-15a: the models** (`draw`'s `pass` and `triangles` steps; research 380 M1-M7). The frame target gets a
 * `DEPTH_COMPONENT32F` renderbuffer when the plan's `target.depth` is set; each `pass` clears it to 0 (the software's
 * "empty"); each run of triangles is one `drawArraysInstanced` through `model-ff-src` or `model-ff-add`
 * (`uiGpuShaders.ts`, the per-pixel rules; `uiGpuModels.ts`, the vertex shader, the instance layout and the blender),
 * a triangle an instance, under `DEPTH_TEST` with `GEQUAL` (GM-15d, `TEST_1` ZTST GEQUAL), the depth mask on, the colour mask RGB only (M7), and the
 * pass's power-of-two `depthScale` as `u_depthScale`. A quad never tests or writes that depth: `drawState` turns the
 * depth test off for every quad and the movie (`UI_2D_QUAD_Z_READING`).
 *
 * **GM-11a-3: instancing.** Each run of quads (a `quads` step: one program, blend, texture and batch) is one
 * `drawArraysInstanced`, its quads the instances in the run's order (ES 3.0 §2.9.3: instance by instance, so P1's order
 * holds). Every quad's inputs -- the rectangle, the colour (`gpuChannel`'s f32 number and code), the axis base, the
 * textured flag, the zero mask and the additive flag, the very values GM-11a-2 set as uniforms -- are written once a
 * frame into one instance buffer (`UI_GPU_INSTANCE_LAYOUT`) and read per instance (divisor 1), carried flat to the
 * fragment shader. The batch's destination origin and the frame size stay uniforms (one a run).
 */

/**
 * GM-11a-3: one quad's instance record, 72 bytes, little-endian as the platform's typed arrays write it (WebGL is
 * little-endian): `a_rect` 4 x i32, `a_colour` 4 x f32, `a_codes` 4 x i32, `a_axis` (axis base x, y, textured, 0)
 * 4 x i32, `a_flags` (zero mask, additive) 2 x i32. Byte offsets.
 */
export const UI_GPU_INSTANCE_LAYOUT = Object.freeze({ stride: 72, a_rect: 0, a_colour: 16, a_codes: 32, a_axis: 48, a_flags: 64 } as const);

/** The plan steps `UiGpuBackend.draw` draws (GM-11a-1 the clear; GM-11a-2 the copies and quads; GM-11a-3 the movie; GM-15a the models' pass and triangles). */
export const UI_GPU_DRAWN_STEPS: ReadonlySet<UiPlanStep['kind']> = new Set<UiPlanStep['kind']>(['clear', 'copy', 'quads', 'movie', 'pass', 'triangles']);

/**
 * Every program the backend links: the quads' (GM-11a-2), the models' (GM-15a) and the movie's (GM-11a-3); GM-19a: a
 * transparent backend links the premultiplied present's too (`uiGpuProgramsFor`).
 */
export type UiGpuProgram = UiGpuShaderProgram | 'movie' | 'present';
export const UI_GPU_PROGRAMS: readonly UiGpuProgram[] = Object.freeze([...UI_GPU_QUAD_PROGRAMS, ...UI_GPU_MODEL_PROGRAMS, 'movie'] as const);
const UI_GPU_TRANSPARENT_PROGRAMS: readonly UiGpuProgram[] = Object.freeze([...UI_GPU_PROGRAMS, 'present'] as const);

/** GM-19a: the programs a backend links -- `UI_GPU_PROGRAMS`, and on a transparent surface the present's as well. */
export function uiGpuProgramsFor(transparent: boolean): readonly UiGpuProgram[] {
  return transparent ? UI_GPU_TRANSPARENT_PROGRAMS : UI_GPU_PROGRAMS;
}

/**
 * UI_GPU_PREMULTIPLIED_PRESENT_ADAPTATION (GM-19a; GM-11a-1 review F3; research 380 §5): no original; bounds the
 * browser's composite of a transparent frame. The overlay's canvas is `premultipliedAlpha: true`
 * (`UI_GPU_CONTEXT_ATTRIBUTES_ADAPTATION`) and its frame target holds the software's bytes before the divide (P14/P22),
 * where a channel may exceed the alpha (the software clamps each channel of its premultiplied sum on its own, P12); a
 * premultiplied canvas composites such a pixel undefined (WebGL 1.0 §5.2.1). So a transparent frame is presented by a
 * draw, not a blit: one triangle over the canvas through the `present` program, each colour channel shown
 * `min(channel, alpha)` (`uiGpuPremultipliedPresent`, the same rule on the CPU), the alpha as it is, flipped once as the
 * blit flips -- what the 2D canvas composites of the software's straight frame (each channel divided and clamped at
 * 255, then multiplied back by the browser), within the browser's own rounding of 1. The frame target, which
 * `readPixels`, `readFrame` and the parity spec read, keeps the pre-divide bytes. `unit` is the texture unit the
 * present samples the frame on (none of the frame's programs uses it). An opaque frame is blitted as before.
 */
export const UI_GPU_PREMULTIPLIED_PRESENT_ADAPTATION = Object.freeze({ rule: 'min(rgb, a)', unit: 3 } as const);

/** GM-19a: `UI_GPU_PREMULTIPLIED_PRESENT_ADAPTATION`'s rule on the CPU, in place: each colour channel at most the pixel's alpha. */
export function uiGpuPremultipliedPresent(data: Uint8ClampedArray | Uint8Array): void {
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]!;
    if (data[i]! > a) data[i] = a;
    if (data[i + 1]! > a) data[i + 1] = a;
    if (data[i + 2]! > a) data[i + 2] = a;
  }
}

/** GM-19a: the present's vertex shader -- one triangle over the whole viewport from `gl_VertexID`, no attributes. */
export const UI_GPU_PRESENT_VERTEX_SOURCE = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/**
 * GM-19a: the present's fragment shader -- the frame target's texel fetched flipped once (the canvas's GL row `y` is the
 * frame's row `H - 1 - y`, as the blit's flip), each colour channel at most its alpha
 * (`UI_GPU_PREMULTIPLIED_PRESENT_ADAPTATION`). The RGBA8 texel reads `k / 255` and is written back as `k` (the clear's
 * conversion, GM-11a-1); `min` of two such values is one of them, so no byte is made that the target does not hold.
 */
export const UI_GPU_PRESENT_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D u_frame;
out vec4 o_colour;
void main() {
  ivec2 size = textureSize(u_frame, 0);
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(u_frame, ivec2(p.x, size.y - 1 - p.y), 0);
  o_colour = vec4(min(c.rgb, vec3(c.a)), c.a);
}
`;

/**
 * A quad's colour channel as the program receives it: the plan's number, or its code (P23). A finite number past f32's
 * range reaches the GPU as an infinity, which a GLSL ES GPU need not carry (ESSL 3.00 §4.5.1): it is sent as the
 * infinity's code with the number 0, as the twin receives it (`S13_channel`: `Math.fround` of the number).
 */
export function gpuChannel(value: number, code: number): [number, number] {
  return [gpuChannelValue(value, code), gpuChannelCode(value, code)];
}

/** GM-32: `gpuChannel`'s number alone (no array: the instance upload writes it straight into its record). */
export function gpuChannelValue(value: number, code: number): number {
  if (code !== UI_PLAN_CODE.finite) return 0;
  const v = Math.fround(value);
  return v === Infinity || v === -Infinity ? 0 : value;
}

/** GM-32: `gpuChannel`'s code alone. */
export function gpuChannelCode(value: number, code: number): number {
  if (code !== UI_PLAN_CODE.finite) return code;
  const v = Math.fround(value);
  return v === Infinity ? UI_PLAN_CODE.posInf : v === -Infinity ? UI_PLAN_CODE.negInf : UI_PLAN_CODE.finite;
}

/** GM-32: the first `n` f32s of `a` and `b` equal bit for bit (a NaN's payload and a zero's sign included). */
function sameWords(a: Float32Array, b: Float32Array, n: number): boolean {
  if (a.length < n || b.length < n) return false;
  const x = new Uint32Array(a.buffer, a.byteOffset, n), y = new Uint32Array(b.buffer, b.byteOffset, n);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return false;
  return true;
}

/** The program a run of quads is drawn with: its path and, on `ff`, its blend (P10, P11; GM.R6). */
export function quadProgramFor(step: { path: UiPlanQuad['path']; blend: UiPlanQuad['blend'] }): UiGpuQuadProgram {
  return step.path === 'prog' ? 'quad-prog' : step.blend === 'additive' ? 'quad-ff-add' : 'quad-ff-src';
}

interface QuadProgram { program: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }

const QUAD_UNIFORMS = ['u_size', 'u_destOrigin'] as const;
const MOVIE_UNIFORMS = ['u_rect', 'u_size', 'u_scale'] as const;
const MODEL_UNIFORMS = ['u_size', 'u_depthScale'] as const;

const isModel = (name: UiGpuProgram): name is UiGpuModelProgram => (UI_GPU_MODEL_PROGRAMS as readonly string[]).includes(name);

/** A program's sources, its uniforms, its samplers' units and its attributes' locations (bound before the link). */
function programParts(name: UiGpuProgram): {
  vs: string; fs: string; uniforms: readonly string[]; samplers: readonly (readonly [string, number])[]; attributes: Readonly<Record<string, number>>;
} {
  if (name === 'movie') return { vs: UI_GPU_MOVIE_VERTEX_SOURCE, fs: UI_GPU_MOVIE_FRAGMENT_SOURCE, uniforms: MOVIE_UNIFORMS, samplers: [['u_movie', UI_GPU_MOVIE_UNIT]], attributes: {} };
  if (name === 'present') {
    return { vs: UI_GPU_PRESENT_VERTEX_SOURCE, fs: UI_GPU_PRESENT_FRAGMENT_SOURCE, uniforms: [], samplers: [['u_frame', UI_GPU_PREMULTIPLIED_PRESENT_ADAPTATION.unit]], attributes: {} };
  }
  if (isModel(name)) {
    return { vs: UI_GPU_MODEL_VERTEX_SOURCE, fs: UI_GPU_SHADER_SOURCES[name], uniforms: MODEL_UNIFORMS, samplers: [['u_tex', UI_GPU_TEXTURE_UNITS.tex]], attributes: UI_GPU_MODEL_ATTRIBUTES };
  }
  return {
    vs: UI_GPU_QUAD_VERTEX_SOURCE, fs: UI_GPU_SHADER_SOURCES[name], uniforms: QUAD_UNIFORMS,
    samplers: [['u_tex', UI_GPU_TEXTURE_UNITS.tex], ['u_axis', UI_GPU_TEXTURE_UNITS.axis], ['u_dest', UI_GPU_TEXTURE_UNITS.dest]],
    attributes: UI_GPU_QUAD_ATTRIBUTES,
  };
}

/**
 * The context's attributes (a browser adaptation, GM-11a-1): `alpha` only on a transparent surface (the overlay;
 * `#front-end-gpu` is opaque), `premultipliedAlpha` (the plan's overlay context), no MSAA (a blit into a multisampled
 * default framebuffer is an INVALID_OPERATION, and nothing here is anti-aliased), no depth or stencil on the canvas (the
 * models' depth is the frame target's, GM-11a-3), the drawing buffer not preserved (every present blits a whole frame).
 */
export function UI_GPU_CONTEXT_ATTRIBUTES_ADAPTATION(transparent: boolean): WebGLContextAttributes {
  return { alpha: transparent, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false };
}

/** The canvas the backend draws onto: an `HTMLCanvasElement` or an `OffscreenCanvas`. */
export interface UiGpuCanvas {
  width: number;
  height: number;
  getContext(contextId: 'webgl2', options?: WebGLContextAttributes): unknown;
}

export interface UiGpuBackendOptions {
  /** The surface's frame is transparent (the Settings overlay; P14, P22): the canvas keeps an alpha channel. */
  transparent: boolean;
  /** GM-11a-3: time each drawn frame on the GPU (`UiGpuTimer`; a perf instrument). Off unless asked. */
  timeQueries?: boolean;
  /** GM-13: the texture cache's budgets (`uiGpuTextures.ts`); absent, its adaptations' values. */
  textures?: UiGpuTextureOptions;
}

/**
 * No original; bounds the browser's timer queries in flight. GM-11a-3: the timer queries a backend keeps pending at once. A result is read only once the GPU has it (a later
 * task), so a few frames are in flight; a frame drawn while this many wait is not timed (`stats.skipped`). A browser
 * adaptation of a perf instrument: no pixel depends on it.
 */
export const UI_GPU_TIMER_PENDING_ADAPTATION = 4;

/** `EXT_disjoint_timer_query_webgl2`'s tokens this module uses. */
interface TimerQueryExt { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

/**
 * GM-11a-3 (the plan's performance table, "GPU per frame": recorded where the timer query exists, GM-02b): the GPU time
 * of each drawn frame, by `EXT_disjoint_timer_query_webgl2`. A perf instrument and a browser adaptation that changes no
 * pixel and never waits on the GPU: a frame's query is begun before its first call that writes the frame and ended
 * after its last; results are polled (`QUERY_RESULT_AVAILABLE`) at the next draw or on `poll()`, never read before
 * they are there; a disjoint report (`GPU_DISJOINT_EXT`: the GPU's clock jumped) drops every result pending. Where the
 * browser has no such extension -- the gate's software renderers have none (research 380 §6.1) -- `available` is false
 * and the time is "unmeasured". The L1 path's upload is not timed (it draws nothing on the GPU).
 */
export class UiGpuTimer {
  readonly available: boolean;
  private readonly ext: TimerQueryExt | null;
  private pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  private results: number[] = [];
  private counts = { timed: 0, skipped: 0, disjoint: 0 };

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.ext = (gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerQueryExt | null) ?? null;
    this.available = this.ext !== null;
  }

  /** Frames timed (results taken), frames not timed (too many pending), results dropped by a disjoint report, and pending. */
  get stats(): { timed: number; skipped: number; disjoint: number; pending: number } { return { ...this.counts, pending: this.pending.length }; }

  /** The frame's query begun (when one may be: the extension there, fewer than the cap pending). */
  begin(): void {
    if (!this.ext || this.active) return;
    if (this.pending.length >= UI_GPU_TIMER_PENDING_ADAPTATION) { this.counts.skipped++; return; }
    const q = this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }

  /** The frame's query ended; its result is polled later. */
  end(): void {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  /**
   * The results the GPU has, oldest first, without waiting; all pending dropped on a disjoint report. The flag is read
   * (and so cleared) at every poll, pending or not, so a disjoint seen with nothing pending drops no later frame.
   */
  poll(): void {
    if (!this.ext) return;
    const gl = this.gl;
    if (gl.getParameter(this.ext.GPU_DISJOINT_EXT)) {
      this.counts.disjoint += this.pending.length;
      for (const q of this.pending) gl.deleteQuery(q);
      this.pending = [];
      return;
    }
    while (this.pending.length && gl.getQueryParameter(this.pending[0]!, gl.QUERY_RESULT_AVAILABLE)) {
      const q = this.pending.shift()!;
      const ns = Number(gl.getQueryParameter(q, gl.QUERY_RESULT));
      gl.deleteQuery(q);
      this.results.push(ns / 1e6);
      this.counts.timed++;
    }
  }

  /** The GPU milliseconds of the frames whose results came in since the last take, oldest first. */
  takeMs(): number[] {
    const out = this.results;
    this.results = [];
    return out;
  }

  /** GM-12a: after a context loss, every query let go and no GL call made (the queries went with the context). */
  abandon(): void {
    this.pending = []; this.active = null; this.results = [];
  }

  dispose(): void {
    if (this.active && this.ext) { this.gl.endQuery(this.ext.TIME_ELAPSED_EXT); this.pending.push(this.active); this.active = null; }
    for (const q of this.pending) this.gl.deleteQuery(q);
    this.pending = [];
  }
}

/** GM-12a: the WebGL tokens and extension names the lifecycle reads (constants of the specs, no original). */
export const UI_GPU_GL = Object.freeze({
  RENDERER: 0x1f01, UNMASKED_RENDERER_WEBGL: 0x9246, COMPLETION_STATUS_KHR: 0x91b1,
  KHR_PARALLEL: 'KHR_parallel_shader_compile', DEBUG_RENDERER: 'WEBGL_debug_renderer_info', LOSE_CONTEXT: 'WEBGL_lose_context',
} as const);

/**
 * GM-12a (GM-10 review F3): what a made context reports, for the capability gate (`uiGpuSwitch.ts` `uiGpuCapability`).
 * The renderer is `UNMASKED_RENDERER_WEBGL` (`WEBGL_debug_renderer_info`) where the browser gives it -- the string that
 * names SwiftShader, llvmpipe or the Basic Render Driver. **Its absence is handled so:** the plain `RENDERER` is read
 * instead and `rendererSource` says `renderer`; a browser that masks it ("WebKit WebGL") names no adapter, so the gate
 * cannot see a software adapter there and does not refuse on it -- the readout carries `rendererSource` so a run (and the
 * guard's records, GM.R11) says the adapter was unknown, never that it was a GPU. No string at all: `none`, null.
 * `programsLinked` is the caller's (the link is asked later, `UiGpuBackend.programsSettled`).
 */
export function readUiGpuCaps(gl: WebGL2RenderingContext, programsLinked: boolean): UiGpuCaps {
  let renderer: string | null = null;
  let rendererSource: UiGpuCaps['rendererSource'] = 'none';
  const debug = gl.getExtension(UI_GPU_GL.DEBUG_RENDERER) as { UNMASKED_RENDERER_WEBGL: number } | null;
  const unmasked = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) as unknown : null;
  if (typeof unmasked === 'string' && unmasked !== '') { renderer = unmasked; rendererSource = 'unmasked'; }
  else {
    const plain = gl.getParameter(UI_GPU_GL.RENDERER) as unknown;
    if (typeof plain === 'string' && plain !== '') { renderer = plain; rendererSource = 'renderer'; }
  }
  return { webgl2: true, renderer, rendererSource, maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0, programsLinked };
}

/**
 * GM-16 (GM.R11; the guard, `./uiGpuGuard`): a frame's asynchronous read-back -- `readPixels` into a pixel pack buffer,
 * then a fence (`fenceSync`) and a flush, issued in the frame; the bytes taken (`getBufferSubData`) only once the fence
 * reports signalled (`getSyncParameter(SYNC_STATUS)`, which never waits), so the page never stalls on the GPU (WebGL 2.0
 * §5.14: a sync's status changes between tasks, never inside one). A browser adaptation of an instrument: it reads
 * what the frame target holds and changes no pixel. On a lost context it answers `lost` and makes no GL call.
 */
export class UiGpuReadback {
  private buffer: WebGLBuffer | null;
  private sync: WebGLSync | null;
  private done = false;

  constructor(private readonly gl: WebGL2RenderingContext, readonly width: number, readonly height: number, buffer: WebGLBuffer | null, sync: WebGLSync | null) {
    this.buffer = buffer;
    this.sync = sync;
  }

  /** The frame, top row first, once the GPU has it; `pending` before; `lost` with the context (or a read never made). */
  poll(): Rgba | 'pending' | 'lost' {
    if (this.done) return 'lost';
    const gl = this.gl;
    if (gl.isContextLost() || !this.buffer || !this.sync) { this.drop(false); return 'lost'; }
    if (gl.getSyncParameter(this.sync, gl.SYNC_STATUS) !== gl.SIGNALED) return 'pending';
    const out = new Uint8Array(this.width * this.height * 4);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.buffer);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, out);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.drop(true);
    return { width: this.width, height: this.height, data: new Uint8ClampedArray(out.buffer) };
  }

  /** Let go unread: the buffer and the fence deleted (no GL call on a lost context). */
  cancel(): void { if (!this.done) this.drop(!this.gl.isContextLost()); }

  private drop(live: boolean): void {
    if (live) {
      if (this.buffer) this.gl.deleteBuffer(this.buffer);
      if (this.sync) this.gl.deleteSync(this.sync);
    }
    this.buffer = null; this.sync = null; this.done = true;
  }
}

/** A WebGL2 context on `canvas` and the base on it; null where the browser gives no WebGL2 (the caller stays on the software). */
export function createUiGpuBackend(canvas: UiGpuCanvas, o: UiGpuBackendOptions): UiGpuBackend | null {
  const gl = canvas.getContext('webgl2', UI_GPU_CONTEXT_ATTRIBUTES_ADAPTATION(o.transparent)) as WebGL2RenderingContext | null;
  return gl ? new UiGpuBackend(gl, canvas, o.transparent, o.timeQueries === true, o.textures) : null;
}

/** The base: one frame target, cleared, uploaded into, presented and read back. One per canvas. */
export class UiGpuBackend {
  private texture: WebGLTexture | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  private size: { width: number; height: number } | null = null;
  // GM-14a: an L1 frame drawn at a lower scale than shown (1x under HD), uploaded here and blitted up to the frame target.
  private small: { texture: WebGLTexture; framebuffer: WebGLFramebuffer; width: number; height: number } | null = null;
  private disposed = false;
  // GM-11a-2: the quad programs, the empty vertex array, the axis table, the batch copy, the bitmaps, the unit fillers.
  private programs = new Map<UiGpuProgram, QuadProgram>();
  // GM-12a: programs whose link `startPrograms` began and nobody has asked about yet.
  private linking = new Map<UiGpuProgram, { program: WebGLProgram; vs: WebGLShader; fs: WebGLShader }>();
  private vao: WebGLVertexArrayObject | null = null;
  // GM-11a-3: the quads' vertex array (the instance attributes) and the instance buffer, with its CPU staging bytes.
  private quadVao: WebGLVertexArrayObject | null = null;
  private instanceBuffer: { buffer: WebGLBuffer; bytes: number } | null = null;
  private staging = new ArrayBuffer(0);
  private runFirst = new Map<UiPlanStep, number>();
  // GM-15a: the frame target's depth (DEPTH_COMPONENT32F), the triangles' vertex array and instance buffer, their staging.
  private depth: WebGLRenderbuffer | null = null;
  private modelVao: WebGLVertexArrayObject | null = null;
  private triangleBuffer: { buffer: WebGLBuffer; bytes: number } | null = null;
  private triangleStaging = new ArrayBuffer(0);
  private triangleFirst = new Map<UiPlanStep, number>();
  // GM-32: `uploaded` the f32s the texture holds from the last upload, 0 for none (a new texture); `axisPrev` those f32s,
  // so a frame whose table is bit for bit the last one's uploads nothing.
  private axis: { texture: WebGLTexture; rows: number; uploaded: number } | null = null;
  private axisBuffer = new Float32Array(0);
  private axisPrev = new Float32Array(0);
  private readonly axisCounts = { uploads: 0, kept: 0 };
  private scratch: { texture: WebGLTexture; width: number; height: number } | null = null;
  private copied: { batch: number; rect: UiPlanRect } | null = null;
  // GM-13: the bitmaps, by content key, resident across frames under the cache's budgets.
  private readonly textures: UiGpuTextureCache;
  private fillers: { tex: WebGLTexture; axis: WebGLTexture; dest: WebGLTexture } | null = null;
  private maxTexture = 0;
  // GM-11a-3: the movie's textures.
  private readonly movie: UiGpuMovieTextures;

  /** GM-11a-3: the GPU time of each drawn frame, when asked (`UiGpuBackendOptions.timeQueries`); null otherwise. */
  readonly timer: UiGpuTimer | null;
  /** GM-19a: the programs this backend links (`uiGpuProgramsFor`: the present's too on a transparent surface). */
  private readonly programList: readonly UiGpuProgram[];

  constructor(readonly gl: WebGL2RenderingContext, readonly canvas: UiGpuCanvas, readonly transparent: boolean, timeQueries = false, textures: UiGpuTextureOptions = {}) {
    this.movie = new UiGpuMovieTextures(gl, { storage: (format, w, h) => this.storage(format, w, h), unpackState: () => this.unpackState() });
    this.textures = new UiGpuTextureCache({ gl, storage: (format, w, h) => this.storage(format, w, h), unpackState: () => this.unpackState() }, textures);
    this.timer = timeQueries ? new UiGpuTimer(gl) : null;
    this.programList = uiGpuProgramsFor(transparent);
  }

  /** The movie's upload counts (GM-11a-3: one upload per picture, at most one a tick). */
  get movieStats(): UiGpuMovieStats { return this.movie.counts; }

  /** GM-13: the texture cache's counts (uploads, residency, evictions, the budgets). */
  get textureStats(): UiGpuTextureStats { return this.textures.stats; }

  /** GM-32: the axis table's uploads, and the frames whose table the texture held already (bit for bit): nothing uploaded. */
  get axisStats(): { uploads: number; kept: number } { return { ...this.axisCounts }; }

  /** GM-13: the HD lookup whose keys name HD replacements (`HdMenuTextures`); null with HD off. */
  setHdKeys(hd: UiGpuHdKeys | null): void { this.textures.setHd(hd); }

  /** GM-13: the plan's textures' content keys (the presenter's dirty check compares them, GM-12a review F4). */
  textureKeys(plan: UiFramePlan): string[] { return this.textures.keysOf(plan.textures); }

  /**
   * GM-13: the plan's missing textures uploaded within one frame's budget (`HD_UI_UPLOAD_BYTES_PER_FRAME_ADAPTATION`);
   * `pending` bytes left mean the frame is not drawn on the GPU yet (the presenter draws it L1).
   */
  stageTextures(plan: UiFramePlan, keys?: readonly string[]): { uploaded: number; pending: number } {
    this.live();
    return this.textures.stage(plan.textures, keys);
  }

  /** The frame target's size; null before the first frame. */
  get frameSize(): { width: number; height: number } | null { return this.size ? { ...this.size } : null; }

  /**
   * A new frame: the target at this size (made or re-made), bound, and set to the software's starting bytes. GM-15a:
   * `depth` gives the target its depth attachment (a plan's `target.depth`: a pass draws); each pass clears it.
   */
  begin(width: number, height: number, transparent: boolean, depth = false): void {
    this.target(width, height, transparent, depth);
    const gl = this.gl;
    this.fillState();
    gl.clearColor(0, 0, 0, transparent ? 0 : 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** P15: every pixel of the frame these four bytes (the plan's `clear` step: whole bytes, alpha 255). */
  clear(bytes: readonly number[]): void {
    this.live();
    if (!this.size) throw new Error('UiGpuBackend.clear: no frame begun');
    if (bytes.length !== 4 || !bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) {
      throw new Error(`UiGpuBackend.clear: not four whole bytes (${bytes.join(', ')})`);
    }
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    this.fillState();
    gl.clearColor(bytes[0]! / 255, bytes[1]! / 255, bytes[2]! / 255, bytes[3]! / 255);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /**
   * The software's frame (L1, L2) as the frame target's bytes, whole: the target sized to it, one `texSubImage2D` of
   * the frame's own buffer, top row first, not flipped, not premultiplied, no colour conversion. A transparent frame
   * is handed in before its divide (`RasterOptions.preDivide`), as the GPU holds one.
   *
   * GM-14a (GM.R9, `UI_GPU_FRAME_FALLBACK_SCALE_ADAPTATION`): at `scale` s > 1 (an L1 frame drawn at 1x under HD) the
   * target is s times the frame's size; the frame goes up once into a texture of its own size (kept per size) and one
   * `blitFramebuffer`, NEAREST, whole-number magnification, fills the target -- each pixel `s x s`, no filtering, no
   * flip (the present's blit flips once, as for every frame) -- under a full colour mask and no scissor, as the present.
   */
  uploadFrame(frame: Rgba, transparent: boolean, scale = 1): void {
    const { width: W, height: H, data } = frame;
    if (!(Number.isInteger(scale) && scale >= 1)) throw new Error(`UiGpuBackend.uploadFrame: scale ${scale} is not a whole number >= 1`);
    if (data.length !== W * H * 4) throw new Error(`UiGpuBackend.uploadFrame: ${data.length} bytes for ${W} x ${H}`);
    this.target(W * scale, H * scale, transparent);
    const gl = this.gl, bytes = new Uint8Array(data.buffer, data.byteOffset, data.length);
    if (scale === 1) {
      this.unpackState();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      return;
    }
    const small = this.smallFrame(W, H);
    this.unpackState();
    gl.bindTexture(gl.TEXTURE_2D, small.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, small.framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.framebuffer);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.colorMask(true, true, true, true);
    gl.blitFramebuffer(0, 0, W, H, 0, 0, W * scale, H * scale, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
  }

  /** GM-14a: the small frame's texture and framebuffer at `width` x `height` (RGBA8, as the target), kept per size. */
  private smallFrame(width: number, height: number): { texture: WebGLTexture; framebuffer: WebGLFramebuffer } {
    if (this.small && this.small.width === width && this.small.height === height) return this.small;
    this.releaseSmall();
    const gl = this.gl, texture = gl.createTexture()!, framebuffer = gl.createFramebuffer()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(framebuffer); gl.deleteTexture(texture);
      throw new Error(`UiGpuBackend: the small frame is incomplete (status 0x${status.toString(16)}, ${width} x ${height})`);
    }
    this.small = { texture, framebuffer, width, height };
    return this.small;
  }

  private releaseSmall(): void {
    if (!this.small) return;
    const gl = this.gl;
    gl.deleteFramebuffer(this.small.framebuffer);
    gl.deleteTexture(this.small.texture);
    this.small = null;
  }

  /**
   * The frame onto the canvas: its drawing buffer sized to the frame (left alone when it fits), the frame blitted 1:1,
   * `NEAREST`, flipped once so frame row 0 is the page's top row. The canvas's CSS box scales it for the page.
   *
   * GM-11b box fold: the default framebuffer is **cleared first**, then blitted over whole. Under
   * `preserveDrawingBuffer: false` a composited canvas owes a clear that Chromium pays at the next clear, draw or read
   * of the default framebuffer, and a blit does not pay it -- so a bare blit was wiped by the next read (the box at
   * 5650fe4fc: the canvas read all zero after the present; every GPU frame black through `drawImage`). The clear pays
   * it; the blit then covers every pixel (the canvas is sized to the frame), so it changes no byte shown.
   *
   * GM-19a (`UI_GPU_PREMULTIPLIED_PRESENT_ADAPTATION`): a transparent frame is drawn onto the canvas, not blitted -- each
   * colour channel at most its alpha, so the premultiplied canvas is never given a pixel it composites undefined; the
   * frame target keeps the pre-divide bytes. The draw pays the owed clear too; the clear before it is kept.
   */
  present(): void {
    this.live();
    const size = this.size;
    if (!size) throw new Error('UiGpuBackend.present: no frame to present');
    const gl = this.gl, { width: W, height: H } = size;
    if (this.canvas.width !== W) this.canvas.width = W;
    if (this.canvas.height !== H) this.canvas.height = H;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.colorMask(true, true, true, true);
    gl.clearColor(0, 0, 0, this.transparent ? 0 : 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.transparent) { this.presentPremultiplied(W, H); return; }
    gl.blitFramebuffer(0, 0, W, H, 0, H, W, 0, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  }

  /**
   * GM-19a: the transparent frame onto the canvas (bound as DRAW_FRAMEBUFFER by `present`) through the `present` program --
   * one triangle over the viewport, the frame target's texture on `UI_GPU_PREMULTIPLIED_PRESENT_ADAPTATION.unit`, under a
   * state that cannot alter a byte (no blend, dither, scissor, cull, depth or stencil; every channel written); the unit
   * let go after, so the frame target is never left bound where a later draw into it could sample it.
   */
  private presentPremultiplied(W: number, H: number): void {
    const gl = this.gl, p = this.program('present');
    gl.viewport(0, 0, W, H);
    gl.disable(gl.DITHER);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.disable(gl.SAMPLE_COVERAGE);
    gl.useProgram(p.program);
    if (!this.vao) this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.bindUnit(UI_GPU_PREMULTIPLIED_PRESENT_ADAPTATION.unit, this.texture!);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
  }

  /**
   * The frame target's bytes, top row first (frame row `y` = GL row `y`, no flip), as the GPU holds them -- a
   * transparent frame before its divide. A test aid: a read-back stalls the pipeline (the guard's is `beginReadback`).
   */
  readPixels(): Rgba {
    this.live();
    const size = this.size;
    if (!size) throw new Error('UiGpuBackend.readPixels: no frame to read');
    const gl = this.gl, { width: W, height: H } = size;
    const out = new Uint8Array(W * H * 4);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.framebuffer);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.PACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.PACK_SKIP_ROWS, 0);
    gl.pixelStorei(gl.PACK_SKIP_PIXELS, 0);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return { width: W, height: H, data: new Uint8ClampedArray(out.buffer) };
  }

  /**
   * GM-16: the frame target's bytes read back asynchronously (`UiGpuReadback`): the read and its fence issued now, in
   * the command stream after the frame's draw, so a later frame's draw does not reach them; nothing waits.
   */
  beginReadback(): UiGpuReadback {
    this.live();
    const size = this.size;
    if (!size) throw new Error('UiGpuBackend.beginReadback: no frame to read');
    const gl = this.gl, { width: W, height: H } = size;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.framebuffer);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, W * H * 4, gl.STREAM_READ);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.PACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.PACK_SKIP_ROWS, 0);
    gl.pixelStorei(gl.PACK_SKIP_PIXELS, 0);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    return new UiGpuReadback(gl, W, H, buffer, sync);
  }

  /** `MAX_TEXTURE_SIZE`, read once. */
  get maxTextureSize(): number {
    if (!this.maxTexture) this.maxTexture = Number(this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE)) || 0;
    return this.maxTexture;
  }

  /**
   * Why `draw` cannot take this plan (the presenter then draws the frame L1 and names the reason), or null: a software
   * verdict, a step it does not draw yet, a frame, bitmap or axis table past `MAX_TEXTURE_SIZE` (a bitmap or HD image past
   * it takes GM-14b's route, `UI_GPU_OVERSIZE_ROUTE_ADAPTATION`: `uiGpuOversizeRefusal`, counted under one key), or an
   * `ff` quad whose colour is past f32's range (the blender would receive an infinity, `gpuChannel`);
   * GM-11a-3: a movie picture past `MAX_TEXTURE_SIZE`, more distinct pictures than the movie's textures, or a picture
   * whose buffer is released (never touched). GM-15a: a model run that is not fixed-function (GM-26's; the plan's
   * verdict already keeps it L1), or a triangle a number of which is past f32's range (the GPU would receive an infinity,
   * as `gpuChannel` refuses for an `ff` quad); a triangle's bitmap is one of `plan.textures`, checked with the rest.
   */
  refusal(plan: UiFramePlan): string | null {
    if (plan.verdict !== 'gpu') return `the plan's verdict is software (${plan.why.join('; ')})`;
    const other = [...new Set(plan.steps.map((s) => s.kind).filter((k) => !UI_GPU_DRAWN_STEPS.has(k)))];
    if (other.length) return `steps not drawn on the GPU (${other.join(', ')})`;
    for (const s of plan.steps) if (s.kind === 'triangles' && s.path !== 'ff') return 'a programmable model run: GM-26 (GM.R10)';
    for (const t of plan.triangles) {
      if (!Number.isFinite(Math.fround(1 / t.area))) return `a model triangle's area reciprocal past f32 (${t.node})`;
      for (const v of [t.a, t.b, t.c]) {
        if (![v.x, v.y, v.invW, v.u, v.v, ...v.rgba].every((n) => Number.isFinite(Math.fround(n)))) return `a model vertex past f32 (${t.node})`;
      }
    }
    const max = this.maxTextureSize, { width, height } = plan.target;
    if (width > max || height > max) return `the frame ${width} x ${height} is past MAX_TEXTURE_SIZE ${max}`;
    // GM-14b: the large-image route -- the frame L1 at its fallback scale, nothing past the limit made; one read-out key.
    // Review F2: the refusal names each image (its HD key, size and the limit); the read-out counts it under the one reason.
    const over = plan.textures.filter((t) => t.width > max || t.height > max);
    if (over.length) return uiGpuOversizeRefusal(uiGpuOversized(over, max), max, (i) => (over[i]!.hd ? this.textures.hdKeyOf(over[i]!.image) : null));
    for (const m of plan.movies) if (m.width > max || m.height > max) return `a movie picture (${m.width} x ${m.height}) is past MAX_TEXTURE_SIZE ${max}`;
    const pictures = new Set(plan.movies.map((m) => m.picture));
    if (pictures.size > UI_GPU_MOVIE_TEXTURES_ADAPTATION) return `${pictures.size} movie pictures in one frame: more than UI_GPU_MOVIE_TEXTURES_ADAPTATION (${UI_GPU_MOVIE_TEXTURES_ADAPTATION})`;
    if (plan.movies.some(releasedMovie)) return 'a movie picture released since the plan was made (its buffer is back with the worker): never touched';
    const rows = Math.ceil(plan.axis.length / 4 / UI_GPU_AXIS_WIDTH);
    if (rows > max) return `the axis table (${plan.axis.length / 4} entries) is past MAX_TEXTURE_SIZE ${max} rows`;
    for (const q of plan.quads) {
      if (q.path === 'ff' && q.colour.some((v, c) => gpuChannel(v, q.codes[c]!)[1] !== UI_PLAN_CODE.finite)) return `an ff quad's colour is past f32 (${q.node})`;
    }
    return null;
  }

  /**
   * GM-11a-2: a plan of clears, copies and quads drawn into the frame target in the plan's order (P1). Throws on a plan
   * `refusal` names. The frame is left in the target for `present` and `readPixels`.
   */
  draw(plan: UiFramePlan, textureKeys?: readonly string[]): void {
    this.live();
    const refused = this.refusal(plan);
    if (refused) throw new Error(`UiGpuBackend.draw: ${refused}`);
    const { width, height, transparent } = plan.target;
    this.timer?.poll();
    this.timer?.begin();
    const keys = this.textures.begin(plan.textures, textureKeys);
    try {
      this.begin(width, height, transparent, plan.target.depth);
      this.copied = null;
      this.movie.beginFrame();
      if (plan.axis.length) this.uploadAxis(plan.axis);
      this.uploadInstances(plan);
      this.uploadTriangles(plan);
      for (const step of plan.steps) {
        if (step.kind === 'clear') this.clear(step.bytes);
        else if (step.kind === 'copy') this.copy(step.batch, step.rect);
        else if (step.kind === 'quads') this.quads(plan, step, keys);
        else if (step.kind === 'movie') this.drawMovie(plan, step);
        else if (step.kind === 'pass') this.pass();
        else if (step.kind === 'triangles') this.triangles(plan, step, keys);
      }
    } finally {
      this.timer?.end();   // a draw that throws leaves no query active
    }
    // GM-13: residency and the VRAM cap applied; the frame's own textures kept.
    this.textures.end(keys);
  }

  /** Every program compiled and linked now (the presenter's `ready`, GM-12a, waits on it); idempotent. */
  compilePrograms(): void {
    this.live();
    for (const name of this.programList) this.program(name);
  }

  /**
   * GM-12a: every program's compile and link begun, nothing asked of the driver after (no status, no log, no uniform):
   * under `KHR_parallel_shader_compile` the driver links them off the page's thread, and `programsSettled` asks when.
   * Idempotent.
   */
  startPrograms(): void {
    this.live();
    for (const name of this.programList) {
      if (this.programs.has(name) || this.linking.has(name)) continue;
      const gl = this.gl, parts = programParts(name);
      const vs = this.startShader(gl.VERTEX_SHADER, parts.vs), fs = this.startShader(gl.FRAGMENT_SHADER, parts.fs);
      const program = gl.createProgram()!;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      for (const [attribute, loc] of Object.entries(parts.attributes)) gl.bindAttribLocation(program, loc, attribute);
      gl.linkProgram(program);
      this.linking.set(name, { program, vs, fs });
    }
  }

  /**
   * GM-12a: whether the programs `startPrograms` began are linked. With `KHR_parallel_shader_compile` (`completion`,
   * its `COMPLETION_STATUS_KHR`) a program still linking answers `pending` and nothing else is asked of it -- a
   * `LINK_STATUS` read before completion would wait on the driver. Without the extension the link status is read at
   * once (the synchronous path: the driver may hold this call until it links). `failed` names the first program that
   * did not compile or link; `linked` once every program is ready to draw (its samplers set).
   */
  programsSettled(completion: number | null): { state: 'pending' } | { state: 'linked' } | { state: 'failed'; why: string } {
    this.live();
    if (completion !== null) for (const l of this.linking.values()) if (!this.gl.getProgramParameter(l.program, completion)) return { state: 'pending' };
    try {
      for (const name of [...this.linking.keys()]) this.program(name);
    } catch (e) {
      return { state: 'failed', why: e instanceof Error ? e.message : String(e) };
    }
    return this.programs.size === this.programList.length ? { state: 'linked' } : { state: 'pending' };
  }

  /**
   * GM-12a: the backend let go after its context was lost: every reference dropped and no GL call made (the lost
   * context's objects are gone with it, and a restored context refuses them). The backend refuses work after.
   */
  abandon(): void {
    this.programs.clear(); this.linking.clear();
    this.vao = null; this.quadVao = null; this.instanceBuffer = null; this.runFirst.clear();
    this.modelVao = null; this.triangleBuffer = null; this.triangleFirst.clear();
    this.axis = null; this.scratch = null; this.copied = null; this.textures.abandon(); this.fillers = null;
    this.texture = null; this.framebuffer = null; this.depth = null; this.size = null; this.small = null;
    this.movie.abandon();
    this.timer?.abandon();
    this.disposed = true;
  }

  /** Everything the backend made deleted; the backend refuses work after. The context itself is the lifecycle's (GM-12a). */
  dispose(): void {
    if (this.disposed) return;
    this.release();
    this.releaseSmall();
    const gl = this.gl;
    for (const p of this.programs.values()) gl.deleteProgram(p.program);
    this.programs.clear();
    for (const l of this.linking.values()) { gl.deleteShader(l.vs); gl.deleteShader(l.fs); gl.deleteProgram(l.program); }
    this.linking.clear();
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.quadVao) gl.deleteVertexArray(this.quadVao);
    if (this.instanceBuffer) gl.deleteBuffer(this.instanceBuffer.buffer);
    this.quadVao = null; this.instanceBuffer = null; this.runFirst.clear();
    if (this.modelVao) gl.deleteVertexArray(this.modelVao);
    if (this.triangleBuffer) gl.deleteBuffer(this.triangleBuffer.buffer);
    this.modelVao = null; this.triangleBuffer = null; this.triangleFirst.clear();
    if (this.axis) gl.deleteTexture(this.axis.texture);
    if (this.scratch) gl.deleteTexture(this.scratch.texture);
    this.scratch = null; this.copied = null;
    this.textures.dispose();
    if (this.fillers) { gl.deleteTexture(this.fillers.tex); gl.deleteTexture(this.fillers.axis); gl.deleteTexture(this.fillers.dest); }
    this.vao = null; this.axis = null; this.fillers = null;
    this.movie.dispose();
    this.timer?.dispose();
    this.disposed = true;
  }

  private live(): void {
    if (this.disposed) throw new Error('UiGpuBackend: disposed');
  }

  /** Uploads read the source as written: no unpack buffer, no flip, no premultiply, no colour conversion, tight rows. */
  private unpackState(): void {
    const gl = this.gl;
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
  }

  /** A texture of `format` at `width` x `height`, sampled by `texelFetch` only: NEAREST (an integer or float texture is complete only so), CLAMP. */
  private storage(format: number, width: number, height: number): WebGLTexture {
    const gl = this.gl, t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, format, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  /**
   * GM.R3: the plan's f64 axis table as an `RGBA32F` texture, `UI_GPU_AXIS_WIDTH` entries a row, entry `e` at
   * (`e % width`, `e / width`): each f64 rounded to the nearest f32 (`Float32Array`'s conversion, the twin's). The
   * texture is kept and grown by powers of two in rows; the rows a frame uses are uploaded whole.
   *
   * GM-32 (the T4 profile at `82ef1260f`: `uploadAxis` 31.0 ms and `texSubImage2D` 47.9 ms over the 4x cold switch): a
   * frame whose rows are, as f32 bits, the ones the texture holds from the last upload uploads nothing -- the texture's
   * contents are those bits either way (a fade changes the quads' colours, not their texels). A new or re-made texture
   * holds nothing (`uploaded` 0), so its first frame uploads.
   */
  private uploadAxis(axis: Float64Array): void {
    const gl = this.gl, W = UI_GPU_AXIS_WIDTH, rows = Math.ceil(axis.length / 4 / W);
    if (!this.axis || this.axis.rows < rows) {
      if (this.axis) gl.deleteTexture(this.axis.texture);
      let cap = 1;
      while (cap < rows) cap *= 2;
      cap = Math.max(rows, Math.min(cap, this.maxTextureSize));
      this.axis = { texture: this.storage(gl.RGBA32F, W, cap), rows: cap, uploaded: 0 };
    }
    const n = rows * W * 4;
    if (this.axisBuffer.length < n) this.axisBuffer = new Float32Array(n);
    const next = this.axisBuffer;
    next.set(axis);
    next.fill(0, axis.length, n);
    if (this.axis.uploaded === n && sameWords(next, this.axisPrev, n)) { this.axisCounts.kept++; return; }
    this.unpackState();
    gl.bindTexture(gl.TEXTURE_2D, this.axis.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, rows, gl.RGBA, gl.FLOAT, next.subarray(0, n));
    this.axis.uploaded = n;
    this.axisCounts.uploads++;
    // The uploaded f32s are the next frame's comparison; the other buffer is written next.
    this.axisBuffer = this.axisPrev;
    this.axisPrev = next;
  }

  /**
   * GM.R7: a programmable batch's destination, the frame's pixels under `rect` as they stand before the batch's first
   * quad, copied to the scratch texture's origin (the frame target cannot be sampled while it is drawn into).
   */
  private copy(batch: number, rect: UiPlanRect): void {
    const gl = this.gl, size = this.size!;
    if (!this.scratch || this.scratch.width !== size.width || this.scratch.height !== size.height) {
      if (this.scratch) gl.deleteTexture(this.scratch.texture);
      this.scratch = { texture: this.storage(gl.RGBA8, size.width, size.height), width: size.width, height: size.height };
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.framebuffer);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindTexture(gl.TEXTURE_2D, this.scratch.texture);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, rect.xs, rect.ys, rect.xe - rect.xs, rect.ye - rect.ys);
    this.copied = { batch, rect: { ...rect } };
  }

  /** A plan texture as an `RGBA8UI` texture, top row first, its bytes as they are: the cache's (GM-13), by its key. */
  private bitmap(plan: UiFramePlan, index: number, keys: readonly string[]): WebGLTexture {
    return this.textures.texture(plan.textures[index]!, keys[index]!);
  }

  /** 1 x 1 textures of each sampler's type, bound where a program samples nothing (a unit never left on the frame target). */
  private unitFillers(): { tex: WebGLTexture; axis: WebGLTexture; dest: WebGLTexture } {
    if (!this.fillers) {
      const gl = this.gl;
      this.fillers = { tex: this.storage(gl.RGBA8UI, 1, 1), axis: this.storage(gl.RGBA32F, 1, 1), dest: this.storage(gl.RGBA8, 1, 1) };
    }
    return this.fillers;
  }

  private bindUnit(unit: number, texture: WebGLTexture): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  }

  /** A program, compiled and linked on first use (or its begun link finished, GM-12a); its samplers set to their units. */
  private program(name: UiGpuProgram): QuadProgram {
    const kept = this.programs.get(name);
    if (kept) return kept;
    const gl = this.gl, parts = programParts(name);
    const begun = this.linking.get(name);
    let program: WebGLProgram;
    if (begun) {
      // GM-12a: the shaders' status is read only now, after the link completed (a failed compile fails the link too).
      this.linking.delete(name);
      program = begun.program;
      for (const [s, type] of [[begun.vs, gl.VERTEX_SHADER], [begun.fs, gl.FRAGMENT_SHADER]] as const) {
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
          const log = gl.getShaderInfoLog(s);
          gl.deleteShader(begun.vs); gl.deleteShader(begun.fs); gl.deleteProgram(program);
          throw new Error(`UiGpuBackend: ${name}'s ${type === gl.VERTEX_SHADER ? 'vertex' : 'fragment'} shader did not compile: ${log ?? ''}`);
        }
      }
      gl.deleteShader(begun.vs);
      gl.deleteShader(begun.fs);
    } else {
      const vs = this.shader(gl.VERTEX_SHADER, parts.vs, name);
      const fs = this.shader(gl.FRAGMENT_SHADER, parts.fs, name);
      program = gl.createProgram()!;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      for (const [attribute, loc] of Object.entries(parts.attributes)) gl.bindAttribLocation(program, loc, attribute);
      gl.linkProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    }
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`UiGpuBackend: ${name} did not link: ${log ?? ''}`);
    }
    const u: QuadProgram['u'] = {};
    for (const n of parts.uniforms) u[n] = gl.getUniformLocation(program, n);
    gl.useProgram(program);
    for (const [sampler, unit] of parts.samplers) {
      const at = gl.getUniformLocation(program, sampler);
      if (at) gl.uniform1i(at, unit);
    }
    const made = { program, u };
    this.programs.set(name, made);
    return made;
  }

  /** GM-12a: a shader's compile begun, its status left for after the link (`program`). */
  private startShader(type: number, source: string): WebGLShader {
    const gl = this.gl, s = gl.createShader(type)!;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    return s;
  }

  private shader(type: number, source: string, name: string): WebGLShader {
    const gl = this.gl, s = gl.createShader(type)!;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(`UiGpuBackend: ${name}'s ${type === gl.VERTEX_SHADER ? 'vertex' : 'fragment'} shader did not compile: ${log ?? ''}`);
    }
    return s;
  }

  /**
   * The state a draw depends on, set so nothing left by another draw can change a byte (the fill's, and no cull, depth or
   * stencil). The depth test stays off for every quad and the movie (`UI_2D_QUAD_Z_READING`: a 2D quad never tests or
   * writes the models' depth); GM-15a's `triangles` turns it on for its own run after this.
   */
  private drawState(): void {
    const gl = this.gl;
    this.fillState();
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.disable(gl.SAMPLE_COVERAGE);
  }

  /**
   * GM-11a-3: every run's quads written into the instance buffer in the plan's step order -- one upload a frame -- each
   * record the values GM-11a-2 set as uniforms (`gpuChannel`'s f32 number and code per channel). Checks the planner's
   * invariants the GPU depends on as it writes: no `ff` quad carries a code or a zero mask; a `prog` run's quads are
   * all of its batch.
   */
  private uploadInstances(plan: UiFramePlan): void {
    this.runFirst.clear();
    let n = 0;
    for (const step of plan.steps) if (step.kind === 'quads') { this.runFirst.set(step, n); n += step.quads.length; }
    if (!n) return;
    const L = UI_GPU_INSTANCE_LAYOUT, bytes = n * L.stride;
    if (this.staging.byteLength < bytes) { let cap = 1024; while (cap < bytes) cap *= 2; this.staging = new ArrayBuffer(cap); }
    const i32 = new Int32Array(this.staging), f32 = new Float32Array(this.staging);
    // GM-32 (the T4 profile: `uploadInstances` 18.2 ms over the 4x cold switch): the record's words written one by one --
    // the same values in the same places as the arrays this built per quad (`gpuChannelValue`, `gpuChannelCode`:
    // `gpuChannel`'s two halves).
    const rect = L.a_rect / 4, colour = L.a_colour / 4, codes = L.a_codes / 4, axisAt = L.a_axis / 4, flags = L.a_flags / 4;
    for (const step of plan.steps) {
      if (step.kind !== 'quads') continue;
      let at = this.runFirst.get(step)! * (L.stride / 4);
      for (const i of step.quads) {
        const q = plan.quads[i]!;
        let coded = false;
        for (let k = 0; k < 4; k++) if (gpuChannelCode(q.colour[k]!, q.codes[k]!) !== UI_PLAN_CODE.finite) coded = true;
        if (step.path !== 'prog' && (q.zeroMask !== 0 || coded)) throw new Error(`UiGpuBackend.draw: an ff quad with a code (${q.node})`);
        if (step.path === 'prog' && q.batch !== step.batch) throw new Error(`UiGpuBackend.draw: quad ${i} of batch ${q.batch} in batch ${step.batch}'s run`);
        const r = q.rect;
        i32[at + rect] = r.xs; i32[at + rect + 1] = r.ys; i32[at + rect + 2] = r.xe; i32[at + rect + 3] = r.ye;
        for (let k = 0; k < 4; k++) {
          f32[at + colour + k] = gpuChannelValue(q.colour[k]!, q.codes[k]!);
          i32[at + codes + k] = gpuChannelCode(q.colour[k]!, q.codes[k]!);
        }
        i32[at + axisAt] = q.axis ? q.axis.column / 4 : 0; i32[at + axisAt + 1] = q.axis ? q.axis.row / 4 : 0;
        i32[at + axisAt + 2] = q.texture === null ? 0 : 1; i32[at + axisAt + 3] = 0;
        i32[at + flags] = q.zeroMask; i32[at + flags + 1] = q.blend === 'additive' ? 1 : 0;
        at += L.stride / 4;
      }
    }
    const gl = this.gl;
    if (!this.instanceBuffer || this.instanceBuffer.bytes < bytes) {
      if (this.instanceBuffer) gl.deleteBuffer(this.instanceBuffer.buffer);
      let cap = 1024;
      while (cap < bytes) cap *= 2;
      const buffer = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, cap, gl.DYNAMIC_DRAW);
      this.instanceBuffer = { buffer, bytes: cap };
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Uint8Array(this.staging, 0, bytes));
  }

  /**
   * GM-15a: every run's triangles written into the triangle buffer in the plan's step order -- one upload a frame -- each
   * record `UI_GPU_TRIANGLE_LAYOUT`'s: the plan's integer box and its numbers as f32 (the twin's `Math.fround`: `inv` is
   * the f64 area's reciprocal rounded once). Checks as it writes that every run is fixed-function (`refusal` holds it).
   */
  private uploadTriangles(plan: UiFramePlan): void {
    this.triangleFirst.clear();
    let n = 0;
    for (const step of plan.steps) if (step.kind === 'triangles') { this.triangleFirst.set(step, n); n += step.triangles.length; }
    if (!n) return;
    const L = UI_GPU_TRIANGLE_LAYOUT, bytes = n * L.stride;
    if (this.triangleStaging.byteLength < bytes) { let cap = 1024; while (cap < bytes) cap *= 2; this.triangleStaging = new ArrayBuffer(cap); }
    const i32 = new Int32Array(this.triangleStaging), f32 = new Float32Array(this.triangleStaging);
    for (const step of plan.steps) {
      if (step.kind !== 'triangles') continue;
      if (step.path !== 'ff') throw new Error(`UiGpuBackend.draw: a programmable model run (pass ${step.pass}): GM-26`);
      let at = this.triangleFirst.get(step)! * (L.stride / 4);
      for (const i of step.triangles) {
        const t = plan.triangles[i]!, { a, b, c, box } = t;
        i32.set([box.xs, box.ys, box.xe, box.ye], at + L.a_box / 4);
        f32.set([a.x, a.y, b.x, b.y], at + L.a_ab / 4);
        f32.set([c.x, c.y, Math.fround(1 / t.area), 0], at + L.a_c / 4);
        f32.set([a.invW, b.invW, c.invW, t.texture === null ? 0 : 1], at + L.a_w / 4);
        f32.set([a.u, b.u, c.u], at + L.a_u / 4);
        f32.set([a.v, b.v, c.v], at + L.a_v / 4);
        f32.set(a.rgba.slice(0, 4), at + L.a_ca / 4);
        f32.set(b.rgba.slice(0, 4), at + L.a_cb / 4);
        f32.set(c.rgba.slice(0, 4), at + L.a_cc / 4);
        at += L.stride / 4;
      }
    }
    const gl = this.gl;
    if (!this.triangleBuffer || this.triangleBuffer.bytes < bytes) {
      if (this.triangleBuffer) gl.deleteBuffer(this.triangleBuffer.buffer);
      let cap = 1024;
      while (cap < bytes) cap *= 2;
      const buffer = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, cap, gl.DYNAMIC_DRAW);
      this.triangleBuffer = { buffer, bytes: cap };
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.triangleBuffer.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Uint8Array(this.triangleStaging, 0, bytes));
  }

  /** GM-15a: the triangles' vertex array: the nine instance attributes enabled, one value an instance (divisor 1). */
  private modelArray(): WebGLVertexArrayObject {
    const gl = this.gl;
    if (!this.modelVao) {
      this.modelVao = gl.createVertexArray();
      gl.bindVertexArray(this.modelVao);
      for (const loc of Object.values(UI_GPU_MODEL_ATTRIBUTES)) { gl.enableVertexAttribArray(loc); gl.vertexAttribDivisor(loc, 1); }
    }
    return this.modelVao!;
  }

  /**
   * GM-15a: a pass begins -- its depth cleared to 0 (the software's "empty", `drawModels`' fresh `Float32Array`), under
   * the fill's state (no scissor, no rasterizer discard) and the depth mask on, which `clearBufferfv` honours.
   */
  private pass(): void {
    const gl = this.gl;
    if (!this.depth) throw new Error('UiGpuBackend.draw: a pass on a frame target with no depth');
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    this.fillState();
    gl.depthMask(true);
    gl.clearBufferfv(gl.DEPTH, 0, [0]);
  }

  /**
   * GM-15a: one run of triangles (P1: in the plan's order) -- one instanced strip over each triangle's box through the
   * run's model program, a triangle an instance -- tested `GEQUAL` against the pass's depth and written where it passes
   * (M3), the colour mask RGB only (M7), the blender's `UI_GPU_MODEL_FF_BLEND`, the pass's `depthScale`.
   */
  private triangles(plan: UiFramePlan, step: Extract<UiPlanStep, { kind: 'triangles' }>, keys: readonly string[]): void {
    const gl = this.gl, name = modelProgramFor(step), p = this.program(name), { width: W, height: H } = this.size!;
    const fill = this.unitFillers();
    const texture = step.texture === null ? fill.tex : this.bitmap(plan, step.texture, keys);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    this.drawState();
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.GEQUAL);   // GM-15d: TEST_1 ZTST GEQUAL (UI_MODEL_DEPTH_FORMAT_READING)
    gl.depthMask(true);
    gl.colorMask(true, true, true, false);
    gl.useProgram(p.program);
    gl.bindVertexArray(this.modelArray());
    // The run's records: the attribute pointers at its first instance (WebGL 2 has no base instance).
    const L = UI_GPU_TRIANGLE_LAYOUT, base = this.triangleFirst.get(step)! * L.stride, A = UI_GPU_MODEL_ATTRIBUTES;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.triangleBuffer!.buffer);
    gl.vertexAttribIPointer(A.a_box, 4, gl.INT, L.stride, base + L.a_box);
    gl.vertexAttribPointer(A.a_ab, 4, gl.FLOAT, false, L.stride, base + L.a_ab);
    gl.vertexAttribPointer(A.a_c, 4, gl.FLOAT, false, L.stride, base + L.a_c);
    gl.vertexAttribPointer(A.a_w, 4, gl.FLOAT, false, L.stride, base + L.a_w);
    gl.vertexAttribPointer(A.a_u, 3, gl.FLOAT, false, L.stride, base + L.a_u);
    gl.vertexAttribPointer(A.a_v, 3, gl.FLOAT, false, L.stride, base + L.a_v);
    gl.vertexAttribPointer(A.a_ca, 4, gl.FLOAT, false, L.stride, base + L.a_ca);
    gl.vertexAttribPointer(A.a_cb, 4, gl.FLOAT, false, L.stride, base + L.a_cb);
    gl.vertexAttribPointer(A.a_cc, 4, gl.FLOAT, false, L.stride, base + L.a_cc);
    const [sr, dr, sa, da] = UI_GPU_MODEL_FF_BLEND[name];
    gl.enable(gl.BLEND);
    gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
    gl.blendFuncSeparate(gl[sr], gl[dr], gl[sa], gl[da]);
    this.bindUnit(UI_GPU_TEXTURE_UNITS.tex, texture);
    gl.uniform2f(p.u.u_size!, W, H);
    gl.uniform1f(p.u.u_depthScale!, plan.passes[step.pass]!.depthScale);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, step.triangles.length);
  }

  /** The quads' vertex array: the five instance attributes enabled, one value an instance (divisor 1). */
  private quadArray(): WebGLVertexArrayObject {
    const gl = this.gl;
    if (!this.quadVao) {
      this.quadVao = gl.createVertexArray();
      gl.bindVertexArray(this.quadVao);
      for (const loc of Object.values(UI_GPU_QUAD_ATTRIBUTES)) { gl.enableVertexAttribArray(loc); gl.vertexAttribDivisor(loc, 1); }
    }
    return this.quadVao!;
  }

  /** One run of quads (P1: in the plan's order): one instanced four-vertex strip through the run's program, a quad an instance. */
  private quads(plan: UiFramePlan, step: Extract<UiPlanStep, { kind: 'quads' }>, keys: readonly string[]): void {
    const gl = this.gl, name = quadProgramFor(step), p = this.program(name), { width: W, height: H } = this.size!;
    const prog = step.path === 'prog';
    const fill = this.unitFillers();
    const texture = step.texture === null ? fill.tex : this.bitmap(plan, step.texture, keys);
    if (prog && (!this.copied || this.copied.batch !== step.batch)) throw new Error(`UiGpuBackend.draw: batch ${step.batch}'s quads before its copy`);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    this.drawState();
    gl.useProgram(p.program);
    gl.bindVertexArray(this.quadArray());
    // The run's records: the attribute pointers at its first instance (WebGL 2 has no base instance).
    const L = UI_GPU_INSTANCE_LAYOUT, base = this.runFirst.get(step)! * L.stride, A = UI_GPU_QUAD_ATTRIBUTES;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer!.buffer);
    gl.vertexAttribIPointer(A.a_rect, 4, gl.INT, L.stride, base + L.a_rect);
    gl.vertexAttribPointer(A.a_colour, 4, gl.FLOAT, false, L.stride, base + L.a_colour);
    gl.vertexAttribIPointer(A.a_codes, 4, gl.INT, L.stride, base + L.a_codes);
    gl.vertexAttribIPointer(A.a_axis, 4, gl.INT, L.stride, base + L.a_axis);
    gl.vertexAttribIPointer(A.a_flags, 2, gl.INT, L.stride, base + L.a_flags);
    if (prog) gl.disable(gl.BLEND);
    else {
      const [sr, dr, sa, da] = UI_GPU_FF_BLEND[name as Exclude<UiGpuQuadProgram, 'quad-prog'>];
      gl.enable(gl.BLEND);
      gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
      gl.blendFuncSeparate(gl[sr], gl[dr], gl[sa], gl[da]);
    }
    this.bindUnit(UI_GPU_TEXTURE_UNITS.tex, texture);
    this.bindUnit(UI_GPU_TEXTURE_UNITS.axis, this.axis ? this.axis.texture : fill.axis);
    this.bindUnit(UI_GPU_TEXTURE_UNITS.dest, prog ? this.scratch!.texture : fill.dest);
    gl.uniform2f(p.u.u_size!, W, H);
    if (prog) gl.uniform2i(p.u.u_destOrigin!, this.copied!.rect.xs, this.copied!.rect.ys);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, step.quads.length);
  }

  /**
   * GM-11a-3, P17: the picture's RGB over the step's rectangle, each pixel the picture's texel at `p / s`; blending
   * off and the colour mask RGB only, so the frame's alpha is untouched. The picture's texture is uploaded here, in the
   * render that first shows it (`UiGpuMovieTextures.texture`). An empty rectangle draws and uploads nothing.
   */
  private drawMovie(plan: UiFramePlan, step: Extract<UiPlanStep, { kind: 'movie' }>): void {
    const { xs, ys, xe, ye } = step.rect;
    if (xe <= xs || ye <= ys) return;
    const gl = this.gl, movie = plan.movies[step.movie]!, { width: W, height: H } = this.size!;
    const texture = this.movie.texture(movie);
    const p = this.program('movie');
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    this.drawState();
    gl.colorMask(true, true, true, false);
    gl.disable(gl.BLEND);
    gl.useProgram(p.program);
    if (!this.vao) this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.bindUnit(UI_GPU_MOVIE_UNIT, texture);
    gl.uniform2f(p.u.u_size!, W, H);
    gl.uniform4i(p.u.u_rect!, xs, ys, xe, ye);
    gl.uniform1i(p.u.u_scale!, plan.target.scale);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** The state a fill (clear) depends on, set so nothing left by another draw can change a byte. */
  private fillState(): void {
    const gl = this.gl;
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.DITHER);
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.colorMask(true, true, true, true);
    gl.viewport(0, 0, this.size!.width, this.size!.height);
  }

  /**
   * The frame target at `width` x `height`, made or re-made, bound to FRAMEBUFFER. GM-15a: with `depth`, it carries a
   * `DEPTH_COMPONENT32F` renderbuffer (M3, `UI_MODEL_DEPTH_FORMAT_READING`), added to a target made without one and kept
   * with it (a quad never tests it: `drawState`); the framebuffer's completeness is checked again after.
   */
  private target(width: number, height: number, transparent: boolean, depth = false): void {
    this.live();
    if (transparent !== this.transparent) {
      throw new Error(`UiGpuBackend: a ${transparent ? 'transparent' : 'opaque'} frame on a ${this.transparent ? 'transparent' : 'opaque'} canvas`);
    }
    if (!(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0)) throw new Error(`UiGpuBackend: frame ${width} x ${height}`);
    const gl = this.gl;
    if (this.size && this.size.width === width && this.size.height === height) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      if (depth && !this.depth) {
        this.attachDepth(width, height);
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
          this.release();
          throw new Error(`UiGpuBackend: the frame target with its depth is incomplete (status 0x${status.toString(16)}, ${width} x ${height})`);
        }
      }
      return;
    }
    this.release();
    const texture = gl.createTexture(), framebuffer = gl.createFramebuffer();
    this.texture = texture; this.framebuffer = framebuffer;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (depth) this.attachDepth(width, height);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      this.release();
      throw new Error(`UiGpuBackend: the frame target is incomplete (status 0x${status.toString(16)}, ${width} x ${height})`);
    }
    this.size = { width, height };
  }

  /** GM-15a: a `DEPTH_COMPONENT32F` renderbuffer at the target's size, on the bound framebuffer's depth attachment. */
  private attachDepth(width: number, height: number): void {
    const gl = this.gl, rb = gl.createRenderbuffer();
    this.depth = rb;
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT32F, width, height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
  }

  private release(): void {
    const gl = this.gl;
    if (this.framebuffer) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(this.framebuffer); }
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.depth) gl.deleteRenderbuffer(this.depth);
    this.framebuffer = null; this.texture = null; this.depth = null; this.size = null;
  }
}
