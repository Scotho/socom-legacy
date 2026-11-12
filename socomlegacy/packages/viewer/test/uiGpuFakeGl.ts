import {
  S3_alpha, S6_horizontal, S7_vertical, S8_modulate, S9_modulateAlpha, S10_frameAlpha, S11_additive, S11_source, S11ff_additiveOut,
  S11ff_sourceOut, S12_store, S12ff_unorm, T2_edge, T2_third, T2_weight, T3_inside, T4_invW, T5_depth, T5_depthPasses, T6_perspective, T7_lerp, T8_lerp,
  T9_modulateAlpha, T10_discard,
} from '../src/uiGpuTwin';
import { UI_GPU_AXIS_WIDTH, UI_GPU_QUAD_VERTEX_SOURCE, UI_GPU_SHADER_SOURCES, UI_GPU_TEXTURE_UNITS } from '../src/uiGpuShaders';
import { UI_GPU_MODEL_VERTEX_SOURCE } from '../src/uiGpuModels';
import { UI_GPU_MOVIE_FRAGMENT_SOURCE, UI_GPU_MOVIE_UNIT, UI_GPU_MOVIE_VERTEX_SOURCE } from '../src/uiGpuMovie';
import { UI_GPU_PREMULTIPLIED_PRESENT_ADAPTATION, UI_GPU_PRESENT_FRAGMENT_SOURCE, UI_GPU_PRESENT_VERTEX_SOURCE } from '../src/uiGpuWebgl2';

// GM-11a-1, GM-11a-2 (plan 2026-11-01-gpu-menus): a fake WebGL2 context for Node, where no GPU and no browser run on
// this host. It records every call and keeps the images a real context keeps (textures by format, the default
// framebuffer), honouring the state that changes their bytes (scissor, colour mask, rasterizer discard, dither, cull,
// blending, the unpack flip and premultiply), and refuses what a real context refuses (a format and type that do not
// match, an integer or float texture that is not NEAREST, a sampler of the wrong type, a texture sampled while it is
// drawn into, a uniform set on a program not in use).
//
// **Its programs are models, not GLSL.** A program links only when its sources are exactly `uiGpuShaders.ts`'s, and a
// draw runs that program's arithmetic as the f32 twin writes it (`uiGpuTwin.ts`'s step functions, S1-S13), from the
// uniforms and textures the backend set; the blender is GL ES 3.00's equation with the factors the backend chose, in
// f32, converted once to the byte (`UI_GPU_TWIN_UNORM_ADAPTATION`). So a fake frame equal to the twin's proves the
// backend's driving -- uniforms, textures, units, copies, blend state, order -- not the GLSL: the GLSL is held to the
// twin by the source lint and the drift guard (`uiGpuShaders.test.ts`, `uiGpuShaderTwin.test.ts`), and on a GPU by the
// box (GM-11b). Evidence kind: unit test.
//
// GM-11a-3: **instancing**. A quad program's per-quad inputs are vertex attributes read once per instance
// (`vertexAttribIPointer` / `vertexAttribPointer`, divisor 1, from an `ARRAY_BUFFER`) and handed to the fragment shader
// as flat varyings; the fake keeps each vertex array's attribute state and buffers' bytes, and `drawArraysInstanced`
// reads every instance's attributes from them as a real context does (type, size, stride, offset, divisor checked), maps
// them to the varyings the quad vertex shader assigns (`QUAD_VARYINGS`, checked against its source), and draws the
// instances in order, each recorded as one `DrawSeen` (its `uniforms` holding the program's uniforms and the instance's
// varyings by their GLSL names).
//
// GM-11a-3: `EXT_disjoint_timer_query_webgl2` (with `timerQuery`): queries begun and ended as a real context allows
// (one active per target, a result read only of an ended query), their results available only when the test says
// (`timer.resolve`: a real context makes them available on a later task, never in the frame that ended them), and the
// disjoint flag the test sets (`timer.disjoint`), cleared on read as a real context clears it.
//
// GM-11a-3: the `movie` program (`uiGpuMovie.ts`) is modelled the same way: a draw copies the `RGBA8UI` picture's texel
// at (x / s, y / s) (integer division, the GLSL's `p / u_scale`) as `t / 255` in f32, and the blender (off) and the
// colour mask (RGB only) decide what reaches the frame.
//
// GM-15a: **the models**. A framebuffer may carry a depth renderbuffer (`DEPTH_COMPONENT32F`, a `Float32Array` image,
// GL row 0 first); `clearBufferfv(DEPTH, 0, [v])` and `clear(DEPTH_BUFFER_BIT)` fill it under the depth mask and the
// scissor. The `model-ff-src` / `model-ff-add` programs link only with `uiGpuShaders.ts`'s and `uiGpuModels.ts`'s exact
// sources and run the twin's T steps (`T2_edge`, `T2_weight` .. `T10_discard`, `T5_depth`, `T5_depthPasses`, and `T8_lerp` within
// the GLSL's own REPEAT) over each instance's box at the integer point, from the per-instance attributes the vertex
// shader hands on flat (`MODEL_VARYINGS`). A discarded fragment writes nothing; one that survives is tested against the
// bound depth only while `DEPTH_TEST` is on and the framebuffer has a depth attachment (GL ES 3.0 section 4.1.6), with
// `GEQUAL` the one function modelled (GM-15d; `GREATER` before), and writes its depth only under the depth mask; its colour goes through the
// S11ff/S12ff blender and the colour mask as a quad's does. A depth test on a draw that writes no `gl_FragDepth` (a quad,
// the movie) is refused: a 2D quad never tests the models' depth (`UI_2D_QUAD_Z_READING`).

const f = Math.fround;
/** Every fragment source a program may link with, by program name, and the vertex source each pairs with. */
// GM-19a: `present`, the transparent frame's premultiplied present (`UI_GPU_PREMULTIPLIED_PRESENT_ADAPTATION`).
const FRAGMENTS: Record<string, string> = { ...UI_GPU_SHADER_SOURCES, movie: UI_GPU_MOVIE_FRAGMENT_SOURCE, present: UI_GPU_PRESENT_FRAGMENT_SOURCE };
const isModel = (name: string): boolean => name.startsWith('model-');
const VERTEX_OF = (name: string): string => (name === 'movie' ? UI_GPU_MOVIE_VERTEX_SOURCE : name === 'present' ? UI_GPU_PRESENT_VERTEX_SOURCE
  : isModel(name) ? UI_GPU_MODEL_VERTEX_SOURCE : UI_GPU_QUAD_VERTEX_SOURCE);
/** GM-15a: the model programs' REPEAT, as their GLSL writes it (`wrapRepeat`: no `%` on a negative operand). */
const wrapRepeat = (i: number, n: number): number => (i >= 0 ? i % n : (n - 1) - ((-i - 1) % n));
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export const GL = {
  COLOR_BUFFER_BIT: 0x4000, TEXTURE_2D: 0x0de1, RGBA8: 0x8058, RGBA: 0x1908, UNSIGNED_BYTE: 0x1401,
  FRAMEBUFFER: 0x8d40, READ_FRAMEBUFFER: 0x8ca8, DRAW_FRAMEBUFFER: 0x8ca9, COLOR_ATTACHMENT0: 0x8ce0,
  FRAMEBUFFER_COMPLETE: 0x8cd5, FRAMEBUFFER_INCOMPLETE_ATTACHMENT: 0x8cd6, NEAREST: 0x2600, LINEAR: 0x2601,
  TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800, TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803, CLAMP_TO_EDGE: 0x812f,
  SCISSOR_TEST: 0x0c11, BLEND: 0x0be2, DITHER: 0x0bd0, DEPTH_TEST: 0x0b71, STENCIL_TEST: 0x0b90, RASTERIZER_DISCARD: 0x8c89,
  CULL_FACE: 0x0b44, SAMPLE_COVERAGE: 0x80a0, SAMPLE_ALPHA_TO_COVERAGE: 0x809e, POLYGON_OFFSET_FILL: 0x8037,
  PACK_ALIGNMENT: 0x0d05, UNPACK_ALIGNMENT: 0x0cf5, PACK_ROW_LENGTH: 0x0d02, PACK_SKIP_ROWS: 0x0d03, PACK_SKIP_PIXELS: 0x0d04,
  UNPACK_ROW_LENGTH: 0x0cf2, UNPACK_SKIP_ROWS: 0x0cf3, UNPACK_SKIP_PIXELS: 0x0cf4,
  UNPACK_FLIP_Y_WEBGL: 0x9240, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241, UNPACK_COLORSPACE_CONVERSION_WEBGL: 0x9243, NONE: 0,
  PIXEL_PACK_BUFFER: 0x88eb, PIXEL_UNPACK_BUFFER: 0x88ec, BACK: 0x0405, TEXTURE0: 0x84c0,
  // GM-11a-2
  VERTEX_SHADER: 0x8b31, FRAGMENT_SHADER: 0x8b30, COMPILE_STATUS: 0x8b81, LINK_STATUS: 0x8b82, TRIANGLE_STRIP: 0x0005, TRIANGLES: 0x0004,
  FUNC_ADD: 0x8006, ZERO: 0, ONE: 1, SRC_ALPHA: 0x0302, ONE_MINUS_SRC_ALPHA: 0x0303, DST_ALPHA: 0x0304, ONE_MINUS_DST_ALPHA: 0x0305,
  RGBA32F: 0x8814, RGBA8UI: 0x8d7c, RGBA_INTEGER: 0x8d99, FLOAT: 0x1406, MAX_TEXTURE_SIZE: 0x0d33,
  // GM-11a-3
  QUERY_RESULT: 0x8866, QUERY_RESULT_AVAILABLE: 0x8867, TIME_ELAPSED_EXT: 0x88bf, GPU_DISJOINT_EXT: 0x8fbb,
  ARRAY_BUFFER: 0x8892, DYNAMIC_DRAW: 0x88e8, STREAM_DRAW: 0x88e0, STATIC_DRAW: 0x88e4, INT: 0x1404,
  // GM-12a
  RENDERER: 0x1f01, UNMASKED_RENDERER_WEBGL: 0x9246, COMPLETION_STATUS_KHR: 0x91b1, NO_ERROR: 0, CONTEXT_LOST_WEBGL: 0x9242,
  // GM-16: the guard's asynchronous read-back (a pack buffer and a fence)
  STREAM_READ: 0x88e1, SYNC_GPU_COMMANDS_COMPLETE: 0x9117, SYNC_STATUS: 0x9114, SIGNALED: 0x9119, UNSIGNALED: 0x9118,
  OBJECT_TYPE: 0x9112, SYNC_FENCE: 0x9116, ALREADY_SIGNALED: 0x911a, TIMEOUT_EXPIRED: 0x911b,
  // GM-15a: the models' depth
  DEPTH_COMPONENT32F: 0x8cac, DEPTH_ATTACHMENT: 0x8d00, DEPTH_BUFFER_BIT: 0x0100, DEPTH: 0x1801, RENDERBUFFER: 0x8d41,
  GREATER: 0x0204, GEQUAL: 0x0206, LESS: 0x0201,
} as const;

/**
 * GM-15a: the model vertex shader's varyings, each from the attribute it copies whole (checked against its source, as
 * `QUAD_VARYINGS`); the instance's box (`a_box`) is read straight from its attribute, as the strip's corners.
 */
export const MODEL_VARYINGS: Readonly<Record<string, { attribute: string; from: number; count: number; line: string }>> = Object.freeze({
  t_ab: { attribute: 'a_ab', from: 0, count: 4, line: 't_ab = a_ab;' },
  t_c: { attribute: 'a_c', from: 0, count: 4, line: 't_c = a_c;' },
  t_w: { attribute: 'a_w', from: 0, count: 4, line: 't_w = a_w;' },
  t_u: { attribute: 'a_u', from: 0, count: 3, line: 't_u = a_u;' },
  t_v: { attribute: 'a_v', from: 0, count: 3, line: 't_v = a_v;' },
  t_ca: { attribute: 'a_ca', from: 0, count: 4, line: 't_ca = a_ca;' },
  t_cb: { attribute: 'a_cb', from: 0, count: 4, line: 't_cb = a_cb;' },
  t_cc: { attribute: 'a_cc', from: 0, count: 4, line: 't_cc = a_cc;' },
});

/**
 * The quad vertex shader's varyings, each from the attribute component(s) it copies: the fake checks the source carries
 * exactly these assignments, so a varying fed from the wrong attribute fails here before it fails a byte.
 */
export const QUAD_VARYINGS: Readonly<Record<string, { attribute: string; from: number; count: number; line: string }>> = Object.freeze({
  q_rect: { attribute: 'a_rect', from: 0, count: 4, line: 'q_rect = a_rect;' },
  q_colour: { attribute: 'a_colour', from: 0, count: 4, line: 'q_colour = a_colour;' },
  q_codes: { attribute: 'a_codes', from: 0, count: 4, line: 'q_codes = a_codes;' },
  q_axisBase: { attribute: 'a_axis', from: 0, count: 2, line: 'q_axisBase = a_axis.xy;' },
  q_textured: { attribute: 'a_axis', from: 2, count: 1, line: 'q_textured = a_axis.z;' },
  q_zeroMask: { attribute: 'a_flags', from: 0, count: 1, line: 'q_zeroMask = a_flags.x;' },
  q_additive: { attribute: 'a_flags', from: 1, count: 1, line: 'q_additive = a_flags.y;' },
});

export interface Tex { id: number; w: number; h: number; format: number; data: Uint8Array | Float32Array | null; min: number; mag: number; deleted: boolean }
/** GM-15a: a renderbuffer (the depth attachment), its image as floats. */
export interface Rb { id: number; w: number; h: number; format: number; data: Float32Array | null; deleted: boolean }
export interface Fb { id: number; color: Tex | null; deleted: boolean; depth?: Rb | null }
export type Call = [string, ...unknown[]];

/** The state a clear ran under, for the contract tests. */
export interface ClearSeen { target: 'fbo' | 'default'; color: number[]; enabled: number[]; mask: boolean[] }

interface Shader { id: number; type: number; source: string; compiled: boolean; deleted: boolean }
interface Program {
  id: number; shaders: Shader[]; linked: boolean; name: string | null; uniforms: Map<string, number[]>; declared: Set<string>; deleted: boolean;
  /** GM-11a-3: `bindAttribLocation`s before the link, and the vertex shader's `in` attributes (name -> GLSL type). */
  bound: Map<string, number>; attributes: Map<string, string>;
  /** GM-12a: the link has completed (`KHR_parallel_shader_compile`'s `COMPLETION_STATUS_KHR`); always true without it. */
  complete: boolean;
}
interface Buf {
  id: number; data: Uint8Array; deleted: boolean;
  /** GM-16: a `readPixels` into this pack buffer not yet covered by a fence; the fence that covers the last one. */
  packed?: boolean; fence?: SyncSeen;
}
interface Attrib { enabled: boolean; buffer: Buf | null; size: number; type: number; integer: boolean; normalized: boolean; stride: number; offset: number; divisor: number }
interface Vao { id: number; attribs: Map<number, Attrib>; deleted: boolean }
interface Loc { program: Program; name: string }

/** One draw as the fake saw it: the program, its uniforms, the blend state and the textures on the sampled units. */
export interface DrawSeen {
  program: string;
  uniforms: Record<string, number[]>;
  blend: boolean;
  /** `blendFuncSeparate`'s four factors and `blendEquationSeparate`'s two modes, as set. */
  func: number[];
  equation: number[];
  /** Texture ids on units 0..2 (`UI_GPU_TEXTURE_UNITS`). */
  units: (number | null)[];
  /** Index into the calls log. */
  at: number;
  /** The colour mask the draw ran under (GM-11a-3: the movie writes RGB only). */
  mask: boolean[];
  /** GM-11a-3: the instance this draw is of an instanced call (0 for a plain draw), and how many the call drew. */
  instance: number;
  instances: number;
  /** GM-15a: the depth state the draw ran under: the test on, its function, the depth mask, and a depth attached. */
  depthTest: boolean;
  depthFunc: number;
  depthMask: boolean;
  depthAttached: boolean;
}

/** A copy into a texture (`copyTexSubImage2D`), as the fake saw it. */
export interface CopySeen { texture: number; x: number; y: number; w: number; h: number; at: number }

export interface FakeGlOptions {
  alphaCanvas?: boolean; incomplete?: boolean; noContext?: boolean; maxTexture?: number; failCompile?: string; failLink?: boolean; timerQuery?: boolean;
  /** GM-12a: `KHR_parallel_shader_compile` offered; a program's link completes only when the test says (`compile.finish`). */
  parallelCompile?: boolean;
  /** GM-12a: `WEBGL_debug_renderer_info` offered with this `UNMASKED_RENDERER_WEBGL`; absent, the extension is not offered. */
  unmaskedRenderer?: string;
  /** GM-12a: the plain `RENDERER` string (a browser masks it: "WebKit WebGL"). */
  renderer?: string;
  /** GM-12a: `WEBGL_lose_context` withheld (offered unless false). */
  loseContext?: boolean;
}

/** GM-12a: an event the fake's canvas dispatches (`webglcontextlost`, `webglcontextrestored`). */
export interface FakeContextEvent { type: string; defaultPrevented: boolean; preventDefault(): void; statusMessage: string }

/** GM-16: a fence as the fake keeps it: signalled only when the test says (`fences.signal`), as a later task would find it. */
export interface SyncSeen { id: number; signaled: boolean; deleted: boolean }

/** A timer query as the fake keeps it (GM-11a-3). */
export interface QuerySeen { id: number; ended: boolean; available: boolean; ns: number; deleted: boolean; readEarly: number }

/**
 * A fake WebGL2 context and its canvas. Images are kept as a real context keeps them: a texture's level 0 bytes (or
 * floats), GL row 0 first; the default framebuffer at the canvas's size. `clear` converts each `clearColor` channel as
 * an f32 to a byte by round-to-nearest (ES 3.0, section 2.1.6, its preferred rule: what a real GPU does is the box's).
 */
export function fakeGl(o: FakeGlOptions = {}) {
  const calls: Call[] = [];
  const clears: ClearSeen[] = [];
  const draws: DrawSeen[] = [];
  const copies: CopySeen[] = [];
  let next = 1;
  const textures: Tex[] = [], framebuffers: Fb[] = [], programs: Program[] = [], shaders: Shader[] = [];
  // GM-15a: renderbuffers, and each depth clear as the fake saw it (the value, the mask, the call's index).
  const renderbuffers: Rb[] = [];
  const depthClears: { value: number; mask: boolean; fb: number | null; at: number }[] = [];
  const queries: QuerySeen[] = [];
  const buffers: Buf[] = [], vaos: Vao[] = [];
  const defaultVao: Vao = { id: 0, attribs: new Map(), deleted: false };
  const vaoNow = (): Vao => st.vao ?? defaultVao;
  const attrib = (loc: number): Attrib => {
    const v = vaoNow();
    let a = v.attribs.get(loc);
    if (!a) { a = { enabled: false, buffer: null, size: 4, type: GL.FLOAT, integer: false, normalized: false, stride: 0, offset: 0, divisor: 0 }; v.attribs.set(loc, a); }
    return a;
  };
  let activeQuery: QuerySeen | null = null;
  const timer = {
    disjoint: false,
    /** The oldest ended, unresolved query's result made available (as a later task would find it). */
    resolve(ns: number): QuerySeen | null {
      const q = queries.find((x) => x.ended && !x.available && !x.deleted) ?? null;
      if (q) { q.available = true; q.ns = ns; }
      return q;
    },
  };
  // GM-16: fences (`fenceSync`), signalled only when the test says -- a real context signals one on a later task, never in
  // the call that made it -- and the pack-buffer reads made before their fence signalled (a stall a real context makes).
  const syncs: SyncSeen[] = [];
  const fences = {
    /** Every fence made so far signalled (the GPU has caught up); how many. */
    signal(): number { let n = 0; for (const x of syncs) if (!x.signaled && !x.deleted) { x.signaled = true; n++; } return n; },
    /** `getBufferSubData` of a pack buffer whose read was not yet fenced and signalled: each one a stall. */
    readEarly: 0,
    /** `clientWaitSync` with a timeout other than 0: a wait on the GPU. */
    waits: 0,
    list: syncs,
  };
  const timerExt = { TIME_ELAPSED_EXT: GL.TIME_ELAPSED_EXT, GPU_DISJOINT_EXT: GL.GPU_DISJOINT_EXT, TIMESTAMP_EXT: 0x8e28, QUERY_COUNTER_BITS_EXT: 0x8864 };
  const units = new Map<number, Tex | null>();
  const st = {
    read: null as Fb | null, draw: null as Fb | null, unit: 0, clear: [0, 0, 0, 0],
    get tex(): Tex | null { return units.get(this.unit) ?? null; },
    enabled: new Set<number>([GL.DITHER]), mask: [true, true, true, true], scissor: [0, 0, 1, 1], viewport: [0, 0, 0, 0],
    store: new Map<number, number | boolean>([[GL.UNPACK_ALIGNMENT, 4], [GL.PACK_ALIGNMENT, 4]]), readBuffer: GL.BACK as number,
    packBuffer: null as unknown, unpackBuffer: null as unknown, lost: false,
    program: null as Program | null, vao: null as Vao | null, arrayBuffer: null as Buf | null,
    func: [GL.ONE, GL.ZERO, GL.ONE, GL.ZERO] as number[], equation: [GL.FUNC_ADD, GL.FUNC_ADD] as number[],
    // GM-15a: GL's defaults -- LESS, the mask on, the clear depth 1 -- so a backend that sets nothing is caught.
    depthFunc: GL.LESS as number, depthMask: true, clearDepth: 1, renderbuffer: null as Rb | null,
  };
  // GM-12a: the canvas's listeners, and the context events queued as a browser queues them (a task later: `events.flush`).
  const listeners = new Map<string, Set<(e: FakeContextEvent) => void>>();
  const queued: FakeContextEvent[] = [];
  const canvas = {
    width: 300, height: 150,
    getContext: (id: string, attrs?: WebGLContextAttributes): unknown => { calls.push(['getContext', id, attrs]); attrsSeen = attrs ?? null; return o.noContext || id !== 'webgl2' ? null : gl; },
    addEventListener: (type: string, l: (e: FakeContextEvent) => void) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type)!.add(l); },
    removeEventListener: (type: string, l: (e: FakeContextEvent) => void) => { listeners.get(type)?.delete(l); },
  };
  const listening = (type: string): number => listeners.get(type)?.size ?? 0;
  /** GM-12a: the context's loss, as a browser has it: lost at once (calls are no-ops), the event queued. */
  let lossPrevented = false;
  const loss = {
    /** Every object made before the last restore: a real context refuses them (they belong to the lost context). */
    stale: new WeakSet<object>(),
    /** Calls made on the context while it was lost (a real context ignores them). */
    whileLost: [] as string[],
    restores: 0,
    lose(statusMessage = 'fake: the GPU went away'): void {
      if (st.lost) return;
      st.lost = true; lossPrevented = false;
      const e: FakeContextEvent = { type: 'webglcontextlost', defaultPrevented: false, statusMessage, preventDefault() { e.defaultPrevented = true; lossPrevented = true; } };
      queued.push(e);
    },
    /** The browser restores only a context whose loss event was default-prevented (WebGL 1.0 §5.15.3). */
    restore(): boolean {
      if (!st.lost || !lossPrevented) return false;
      st.lost = false; loss.restores++;
      for (const list of [textures, framebuffers, programs, shaders, buffers, vaos, queries, renderbuffers] as object[][]) for (const x of list) loss.stale.add(x);
      units.clear(); st.read = null; st.draw = null; st.program = null; st.vao = null; st.arrayBuffer = null; st.renderbuffer = null;
      // GM-11b box fold: the restored context is a new one, its extensions disabled until asked again (`getExtension`);
      // `WEBGL_lose_context` alone survives a loss it did not force (Chromium keeps it, so a page can restore through it).
      for (const name of [...enabled]) if (name !== 'WEBGL_lose_context') enabled.delete(name);
      const e: FakeContextEvent = { type: 'webglcontextrestored', defaultPrevented: false, statusMessage: '', preventDefault() { e.defaultPrevented = true; } };
      queued.push(e);
      return true;
    },
  };
  const events = {
    /** Dispatch every queued context event, in order (a browser's later task). */
    flush(): FakeContextEvent[] {
      const out = queued.splice(0);
      for (const e of out) for (const l of [...(listeners.get(e.type) ?? [])]) l(e);
      return out;
    },
    pending: () => queued.length,
  };
  /** GM-12a: the next call of `name` throws (a GL error surfaced as an exception, or an invariant inside `present`). */
  const faults = new Map<string, number>();
  const failNext = (name: string, times = 1): void => { faults.set(name, times); };
  // GM-12a: KHR_parallel_shader_compile -- links complete when the test says; LINK_STATUS read before is a stall, counted.
  const compile = {
    blockingQueries: 0,
    /** Every program linked so far completes. */
    finish(): void { for (const p of programs) (p as Program & { complete?: boolean }).complete = true; },
  };
  const enabled = new Set<string>();
  const loseExt = { loseContext: () => { rec('loseContext'); loss.lose('fake: loseContext()'); }, restoreContext: () => { rec('restoreContext'); if (!st.lost) throw new Error('fake: restoreContext on a live context (INVALID_OPERATION)'); loss.restore(); } };
  let attrsSeen: WebGLContextAttributes | null = null;
  let back = { w: 0, h: 0, data: new Uint8Array(0) };
  const bufferNow = (): typeof back => {
    if (back.w !== canvas.width || back.h !== canvas.height) back = { w: canvas.width, h: canvas.height, data: new Uint8Array(canvas.width * canvas.height * 4) };
    return back;
  };
  // GM-11b box fold: the drawing buffer as Chromium's WebGL keeps it under `preserveDrawingBuffer: false`. Once the page
  // is composited the buffer owes a clear (`composite()`), paid by the next clear, draw or read of the default
  // framebuffer (Blink's `ClearIfComposited`) -- and NOT by `blitFramebuffer`, which Blink lets through without paying
  // it: a blit into a composited buffer is wiped by the next read (`readPixels`, `drawImage` -- `backbuffer()` here).
  // The box's run at 5650fe4fc read an all-zero canvas after the present blit (856809 of 860160 RGB bytes = exactly the
  // seeded frame's non-zero bytes); this models that behaviour, not a GPU.
  let clearOwed = false;
  const payClear = (): void => { if (clearOwed) { clearOwed = false; bufferNow().data.fill(0); } };
  const backbuffer = (): typeof back => { payClear(); return bufferNow(); };
  const toByte = (v: number): number => Math.round(Math.min(1, Math.max(0, Math.fround(v))) * 255);
  const image = (fb: Fb | null, pay = true): { w: number; h: number; data: Uint8Array } => {
    if (fb) { const t = fb.color!; return { w: t.w, h: t.h, data: t.data as Uint8Array }; }
    return pay ? backbuffer() : bufferNow();
  };
  const rec = (name: string, ...args: unknown[]): void => { calls.push([name, ...args]); };
  /** GM-15a: the draw framebuffer's depth filled with `v` clamped to [0, 1], under the depth mask, the scissor and discard. */
  const fillDepth = (v: number): void => {
    const d = st.draw?.depth;
    if (!d || !d.data || !st.depthMask || st.enabled.has(GL.RASTERIZER_DISCARD)) return;
    const [sx, sy, sw, sh] = st.enabled.has(GL.SCISSOR_TEST) ? st.scissor : [0, 0, d.w, d.h];
    const z = f(Math.min(1, Math.max(0, v)));
    for (let y = Math.max(0, sy!); y < Math.min(d.h, sy! + sh!); y++) for (let x = Math.max(0, sx!); x < Math.min(d.w, sx! + sw!); x++) d.data[y * d.w + x] = z;
  };

  /** The texture a program samples on `unit`, checked as a real draw checks it. */
  const sampled = (unit: number, format: number, what: string): Tex => {
    const t = units.get(unit) ?? null;
    if (!t || t.deleted || !t.data) throw new Error(`fake: ${what} on unit ${unit} has no texture`);
    if (t.format !== format) throw new Error(`fake: ${what} on unit ${unit} is format 0x${t.format.toString(16)}, the sampler wants 0x${format.toString(16)}`);
    if ((format === GL.RGBA8UI || format === GL.RGBA32F) && (t.min !== GL.NEAREST || t.mag !== GL.NEAREST)) throw new Error(`fake: ${what} is incomplete (an integer or float texture filtered)`);
    if (st.draw && st.draw.color === t) throw new Error(`fake: ${what} is the texture being drawn into (a feedback loop)`);
    return t;
  };

  /** One fragment of a quad program, as the twin's step functions compute it: the output colour, four floats. */
  const fragment = (name: string, u: Map<string, number[]>, x: number, y: number): number[] => {
    if (name === 'movie') {
      // GM-11a-3: texelFetch(u_movie, p / u_scale) as t / 255 (P17's nearest s x s).
      const tex = sampled(UI_GPU_MOVIE_UNIT, GL.RGBA8UI, 'u_movie'), s = u.get('u_scale')![0]!;
      if (!(Number.isInteger(s) && s > 0)) throw new Error(`fake: u_scale ${s}`);
      const tx = Math.trunc(x / s), ty = Math.trunc(y / s);
      if (tx >= tex.w || ty >= tex.h) throw new Error(`fake: a movie texel (${tx}, ${ty}) outside ${tex.w} x ${tex.h}`);
      const i = (ty * tex.w + tx) * 4, d = tex.data as Uint8Array;
      return [d[i]!, d[i + 1]!, d[i + 2]!, d[i + 3]!].map((v) => f(v / 255));
    }
    const rect = u.get('q_rect')!, colour = u.get('q_colour')!, textured = u.get('q_textured')![0] !== 0, base = u.get('q_axisBase')!;
    const prog = name === 'quad-prog';
    const codes = prog ? u.get('q_codes')! : [0, 0, 0, 0];
    const chan = (c: number): number => (codes[c] === 0 ? colour[c]! : codes[c] === 1 ? NaN : codes[c] === 2 ? Infinity : -Infinity);
    const red = chan(0), green = chan(1), blue = chan(2);
    const alpha = S3_alpha(chan(3));
    let r = red, g = green, b = blue, a = alpha;
    if (textured) {
      const axis = sampled(UI_GPU_TEXTURE_UNITS.axis, GL.RGBA32F, 'u_axis'), tex = sampled(UI_GPU_TEXTURE_UNITS.tex, GL.RGBA8UI, 'u_tex');
      const entry = (e: number): number[] => {
        const ex = e % UI_GPU_AXIS_WIDTH, ey = Math.floor(e / UI_GPU_AXIS_WIDTH);
        if (e < 0 || ey >= axis.h) throw new Error(`fake: an axis entry ${e} outside the table`);
        const i = (ey * axis.w + ex) * 4, d = axis.data as Float32Array;
        return [d[i]!, d[i + 1]!, d[i + 2]!, d[i + 3]!];
      };
      const col = entry(base[0]! + (x - rect[0]!)), row = entry(base[1]! + (y - rect[1]!));
      const left = Math.trunc(col[0]!), right = Math.trunc(col[1]!), fx = col[2]!, ix = col[3]!;
      const top = Math.trunc(row[0]!), bottom = Math.trunc(row[1]!), fy = row[2]!, iy = row[3]!;
      const texel = (tx: number, ty: number): number => {
        if (tx < 0 || ty < 0 || tx >= tex.w || ty >= tex.h) throw new Error(`fake: a texel (${tx}, ${ty}) outside ${tex.w} x ${tex.h}`);
        return (ty * tex.w + tx) * 4;
      };
      const d = tex.data as Uint8Array, tl = texel(left, top), tr = texel(right, top), bl = texel(left, bottom), br = texel(right, bottom);
      const t = [0, 1, 2, 3].map((c) => S7_vertical(S6_horizontal(d[tl + c]!, d[tr + c]!, ix, fx), S6_horizontal(d[bl + c]!, d[br + c]!, ix, fx), iy, fy));
      r = S8_modulate(t[0]!, red); g = S8_modulate(t[1]!, green); b = S8_modulate(t[2]!, blue);
      a = S9_modulateAlpha(t[3]!, alpha);
    }
    if (!prog) {
      const oa = clamp01(a);
      const out = name === 'quad-ff-add' ? [S11ff_additiveOut(r, a), S11ff_additiveOut(g, a), S11ff_additiveOut(b, a)] : [S11ff_sourceOut(r), S11ff_sourceOut(g), S11ff_sourceOut(b)];
      return [...out, oa];
    }
    const dest = sampled(UI_GPU_TEXTURE_UNITS.dest, GL.RGBA8, 'u_dest'), origin = u.get('u_destOrigin')!;
    const dx = x - origin[0]!, dy = y - origin[1]!;
    if (dx < 0 || dy < 0 || dx >= dest.w || dy >= dest.h) throw new Error(`fake: a destination read (${dx}, ${dy}) outside the copy texture`);
    const j = (dy * dest.w + dx) * 4, D = dest.data as Uint8Array;
    const A = D[j + 3]!, C = [D[j]!, D[j + 1]!, D[j + 2]!];
    const additive = u.get('q_additive')![0] !== 0, zero = u.get('q_zeroMask')![0]!;
    const n = [r, g, b].map((v, c) => (additive ? S11_additive(C[c]!, v, a) : S11_source(C[c]!, v, a)));
    const out = [S12_store(n[0]!), S12_store(n[1]!), S12_store(n[2]!), S12_store(S10_frameAlpha(A, a))];
    if (zero & 8) out.fill(0);
    else { if (zero & 1) out[0] = 0; if (zero & 2) out[1] = 0; if (zero & 4) out[2] = 0; }
    return out.map((v) => f(v / 255));
  };

  /**
   * GM-15a: one fragment of a model program at the integer point (x, y), as the twin's T steps compute it (the order of
   * `drawTriangleTwin`): the output colour and `gl_FragDepth`, or null where it discards (T3 outside, T10 `al <= 0`).
   */
  const modelFragment = (name: string, u: Map<string, number[]>, x: number, y: number): { out: number[]; z: number } | null => {
    const [ax, ay, bx, by] = u.get('t_ab')! as [number, number, number, number];
    const [cx, cy, inv] = u.get('t_c')! as [number, number, number];
    const [aw, bw, cw, textured] = u.get('t_w')! as [number, number, number, number];
    const tu = u.get('t_u')!, tv = u.get('t_v')!, ca = u.get('t_ca')!, cb = u.get('t_cb')!, cc = u.get('t_cc')!;
    const scale = u.get('u_depthScale')![0]!;
    // T2, T3
    const e0 = T2_edge(bx, by, cx, cy, x, y), e1 = T2_edge(cx, cy, ax, ay, x, y), e2 = T2_edge(ax, ay, bx, by, x, y);
    let w0 = T2_weight(bx, by, cx, cy, x, y, inv), w1 = T2_weight(cx, cy, ax, ay, x, y, inv), w2 = T2_third(w0, w1);
    if (!T3_inside(e0, e1, e2, ax, ay, bx, by, cx, cy, inv < 0 ? -1 : 1)) return null;   // GM-15d: the top-left rule
    // T4, T5 (gl_FragDepth; the test is the raster's, against the bound depth)
    const invW = T4_invW(w0, w1, w2, aw, bw, cw), z = T5_depth(invW, scale);
    // GM-15b: a GPU may flush a subnormal to 0 (ESSL 3.00 section 4.5.1), where the software would store it; the plan
    // refuses such a pass (UI_GPU_MODEL_DEPTH_FLOOR), so a drawn fragment below f32's normal range is a bug here.
    if (!(z >= 2 ** -126)) throw new Error(`fake: a model fragment's depth ${z} under f32's normal range (a GPU may flush it; the plan refuses it)`);
    // T6, T7
    w0 = T6_perspective(w0, aw, invW); w1 = T6_perspective(w1, bw, invW); w2 = T6_perspective(w2, cw, invW);
    const rgba = [0, 1, 2, 3].map((k) => T7_lerp(w0, w1, w2, ca[k]!, cb[k]!, cc[k]!));
    let r = rgba[0]!, g = rgba[1]!, b = rgba[2]!, al = f(rgba[3]! / 128);
    if (textured !== 0) {
      const U = T7_lerp(w0, w1, w2, tu[0]!, tu[1]!, tu[2]!), V = T7_lerp(w0, w1, w2, tv[0]!, tv[1]!, tv[2]!);
      // T8: textureSize, x = U W - 0.5, floor, the GLSL's REPEAT, four texelFetch taps, the lerp written out.
      const tex = sampled(UI_GPU_TEXTURE_UNITS.tex, GL.RGBA8UI, 'u_tex'), d = tex.data as Uint8Array;
      const sx = f(f(U * tex.w) - 0.5), sy = f(f(f(1 - V) * tex.h) - 0.5);
      const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = f(sx - x0), fy = f(sy - y0);
      // GM-15b: GLSL's int(floor()) is undefined past the int range and wrapRepeat's -i - 1 overflows at INT_MIN; the
      // plan refuses such a triangle (UI_GPU_MODEL_TEXEL_RANGE), so a drawn one here is a bug.
      for (const i of [x0, y0]) if (!(i > -(2 ** 31) && i + 1 <= 2 ** 31 - 1)) throw new Error(`fake: T8's texel index ${i} past the int range (undefined on a GPU; the plan refuses it)`);
      const xa = wrapRepeat(x0, tex.w), xb = wrapRepeat(x0 + 1, tex.w), ya = wrapRepeat(y0, tex.h), yb = wrapRepeat(y0 + 1, tex.h);
      const at = (tx: number, ty: number): number => {
        if (tx < 0 || ty < 0 || tx >= tex.w || ty >= tex.h) throw new Error(`fake: a texel (${tx}, ${ty}) outside ${tex.w} x ${tex.h}`);
        return (ty * tex.w + tx) * 4;
      };
      const pa = at(xa, ya), pb = at(xb, ya), pe = at(xa, yb), pg = at(xb, yb);
      const s = [0, 1, 2, 3].map((k) => f(f(T8_lerp(d[pa + k]!, d[pb + k]!, fx) * f(1 - fy)) + f(T8_lerp(d[pe + k]!, d[pg + k]!, fx) * fy)));
      // T9
      r = S8_modulate(s[0]!, rgba[0]!); g = S8_modulate(s[1]!, rgba[1]!); b = S8_modulate(s[2]!, rgba[2]!);
      al = T9_modulateAlpha(s[3]!, rgba[3]!);
    }
    // T10
    if (T10_discard(al)) return null;
    const oa = clamp01(al);
    const out = name === 'model-ff-add' ? [S11ff_additiveOut(r, al), S11ff_additiveOut(g, al), S11ff_additiveOut(b, al)] : [S11ff_sourceOut(r), S11ff_sourceOut(g), S11ff_sourceOut(b)];
    return { out: [...out, oa], z };
  };

  const factor = (k: number, sa: number, da: number): number => {
    switch (k) {
      case GL.ZERO: return 0;
      case GL.ONE: return 1;
      case GL.SRC_ALPHA: return sa;
      case GL.ONE_MINUS_SRC_ALPHA: return f(1 - sa);
      case GL.DST_ALPHA: return da;
      case GL.ONE_MINUS_DST_ALPHA: return f(1 - da);
      default: throw new Error(`fake: blend factor 0x${k.toString(16)} not modelled`);
    }
  };

  const gl = {
    ...GL,
    canvas,
    get drawingBufferWidth() { return canvas.width; },
    get drawingBufferHeight() { return canvas.height; },
    isContextLost: () => st.lost,
    getError: () => 0,
    createTexture: (): Tex => { const t: Tex = { id: next++, w: 0, h: 0, format: 0, data: null, min: 0x2702, mag: GL.LINEAR, deleted: false }; textures.push(t); rec('createTexture', t.id); return t; },
    deleteTexture: (t: Tex | null) => { rec('deleteTexture', t?.id ?? null); if (t) t.deleted = true; },
    bindTexture: (target: number, t: Tex | null) => { rec('bindTexture', target, t?.id ?? null); units.set(st.unit, t); },
    activeTexture: (u: number) => { rec('activeTexture', u); st.unit = u - GL.TEXTURE0; },
    texParameteri: (target: number, p: number, v: number) => {
      rec('texParameteri', target, p, v);
      const t = st.tex;
      if (t && p === GL.TEXTURE_MIN_FILTER) t.min = v;
      if (t && p === GL.TEXTURE_MAG_FILTER) t.mag = v;
    },
    texStorage2D: (target: number, levels: number, fmt: number, w: number, h: number) => {
      rec('texStorage2D', target, levels, fmt, w, h);
      const t = st.tex!;
      if (t.data) throw new Error('fake: texStorage2D on an immutable texture');
      t.w = w; t.h = h; t.format = fmt;
      t.data = fmt === GL.RGBA32F ? new Float32Array(w * h * 4) : new Uint8Array(w * h * 4);
    },
    texSubImage2D: (target: number, level: number, x: number, y: number, w: number, h: number, fmt: number, type: number, src: ArrayBufferView) => {
      rec('texSubImage2D', target, level, x, y, w, h, fmt, type, src);
      if (st.unpackBuffer) throw new Error('fake: an unpack buffer is bound');
      const t = st.tex!;
      const ok = (t.format === GL.RGBA8 && fmt === GL.RGBA && type === GL.UNSIGNED_BYTE && src instanceof Uint8Array)
        || (t.format === GL.RGBA8UI && fmt === GL.RGBA_INTEGER && type === GL.UNSIGNED_BYTE && src instanceof Uint8Array)
        || (t.format === GL.RGBA32F && fmt === GL.RGBA && type === GL.FLOAT && src instanceof Float32Array);
      if (!ok) throw new Error(`fake: texSubImage2D of 0x${fmt.toString(16)}/0x${type.toString(16)} into 0x${t.format.toString(16)}`);
      if (x < 0 || y < 0 || x + w > t.w || y + h > t.h) throw new Error('fake: texSubImage2D outside the texture');
      const values = src as Uint8Array | Float32Array;
      if (values.length < w * h * 4) throw new Error('fake: texSubImage2D source too short');
      const flip = st.store.get(GL.UNPACK_FLIP_Y_WEBGL) === true, pre = st.store.get(GL.UNPACK_PREMULTIPLY_ALPHA_WEBGL) === true;
      for (let row = 0; row < h; row++) {
        const from = (flip ? h - 1 - row : row) * w * 4;
        for (let i = 0; i < w * 4; i++) {
          let v = values[from + i]!;
          if (pre && i % 4 !== 3) v = t.format === GL.RGBA32F ? v * values[from + (i - (i % 4)) + 3]! : Math.round(v * values[from + (i - (i % 4)) + 3]! / 255);
          t.data![((y + row) * t.w + x) * 4 + i] = v;
        }
      }
    },
    copyTexSubImage2D: (target: number, level: number, xo: number, yo: number, x: number, y: number, w: number, h: number) => {
      rec('copyTexSubImage2D', target, level, xo, yo, x, y, w, h);
      const t = st.tex!, src = image(st.read);
      if (t.format !== GL.RGBA8) throw new Error('fake: copyTexSubImage2D into a texture that is not RGBA8');
      if (st.read?.color === t) throw new Error('fake: copyTexSubImage2D from the texture it writes');
      if (x < 0 || y < 0 || x + w > src.w || y + h > src.h || xo + w > t.w || yo + h > t.h) throw new Error('fake: copyTexSubImage2D outside');
      for (let j = 0; j < h; j++) (t.data as Uint8Array).set(src.data.subarray(((y + j) * src.w + x) * 4, ((y + j) * src.w + x + w) * 4), ((yo + j) * t.w + xo) * 4);
      copies.push({ texture: t.id, x, y, w, h, at: calls.length - 1 });
    },
    createFramebuffer: (): Fb => { const fb: Fb = { id: next++, color: null, deleted: false }; framebuffers.push(fb); rec('createFramebuffer', fb.id); return fb; },
    deleteFramebuffer: (fb: Fb | null) => { rec('deleteFramebuffer', fb?.id ?? null); if (fb) fb.deleted = true; if (st.read === fb) st.read = null; if (st.draw === fb) st.draw = null; },
    bindFramebuffer: (target: number, fb: Fb | null) => {
      rec('bindFramebuffer', target, fb?.id ?? null);
      if (target === GL.FRAMEBUFFER || target === GL.READ_FRAMEBUFFER) st.read = fb;
      if (target === GL.FRAMEBUFFER || target === GL.DRAW_FRAMEBUFFER) st.draw = fb;
    },
    framebufferTexture2D: (target: number, att: number, tt: number, t: Tex, level: number) => {
      rec('framebufferTexture2D', target, att, tt, t.id, level);
      const fb = target === GL.READ_FRAMEBUFFER ? st.read : st.draw;
      fb!.color = t;
    },
    checkFramebufferStatus: (target: number) => {
      rec('checkFramebufferStatus', target);
      if (o.incomplete) return GL.FRAMEBUFFER_INCOMPLETE_ATTACHMENT;
      // GM-15a: a depth attachment of another size or without storage makes the framebuffer incomplete, as a real one.
      const fb = target === GL.READ_FRAMEBUFFER ? st.read : st.draw;
      if (fb?.depth && (!fb.depth.data || !fb.color || fb.depth.w !== fb.color.w || fb.depth.h !== fb.color.h)) return GL.FRAMEBUFFER_INCOMPLETE_ATTACHMENT;
      return GL.FRAMEBUFFER_COMPLETE;
    },
    // ---- GM-15a: the depth renderbuffer, its state and its clears ---------------------------------------------------
    createRenderbuffer: (): Rb => { const r: Rb = { id: next++, w: 0, h: 0, format: 0, data: null, deleted: false }; renderbuffers.push(r); rec('createRenderbuffer', r.id); return r; },
    bindRenderbuffer: (target: number, r: Rb | null) => { rec('bindRenderbuffer', target, r?.id ?? null); if (target !== GL.RENDERBUFFER) throw new Error('fake: bindRenderbuffer target'); st.renderbuffer = r; },
    renderbufferStorage: (target: number, fmt: number, w: number, h: number) => {
      rec('renderbufferStorage', target, fmt, w, h);
      const r = st.renderbuffer;
      if (target !== GL.RENDERBUFFER || !r) throw new Error('fake: renderbufferStorage with no renderbuffer bound');
      if (fmt !== GL.DEPTH_COMPONENT32F) throw new Error(`fake: renderbuffer format 0x${fmt.toString(16)} not modelled (DEPTH_COMPONENT32F only)`);
      r.w = w; r.h = h; r.format = fmt; r.data = new Float32Array(w * h);
    },
    framebufferRenderbuffer: (target: number, att: number, rbTarget: number, r: Rb | null) => {
      rec('framebufferRenderbuffer', target, att, rbTarget, r?.id ?? null);
      if (att !== GL.DEPTH_ATTACHMENT || rbTarget !== GL.RENDERBUFFER) throw new Error('fake: only a depth renderbuffer is modelled');
      const fb = target === GL.READ_FRAMEBUFFER ? st.read : st.draw;
      if (!fb) throw new Error('fake: framebufferRenderbuffer on the default framebuffer');
      fb.depth = r;
    },
    deleteRenderbuffer: (r: Rb | null) => { rec('deleteRenderbuffer', r?.id ?? null); if (r) r.deleted = true; if (st.renderbuffer === r) st.renderbuffer = null; },
    depthFunc: (fn: number) => { rec('depthFunc', fn); st.depthFunc = fn; },
    depthMask: (m: boolean) => { rec('depthMask', m); st.depthMask = m; },
    clearDepth: (v: number) => { rec('clearDepth', v); st.clearDepth = v; },
    clearBufferfv: (buffer: number, drawbuffer: number, values: ArrayLike<number>) => {
      rec('clearBufferfv', buffer, drawbuffer, Array.from(values));
      if (buffer !== GL.DEPTH || drawbuffer !== 0) throw new Error('fake: clearBufferfv is modelled for DEPTH, draw buffer 0, only');
      depthClears.push({ value: values[0]!, mask: st.depthMask, fb: st.draw?.id ?? null, at: calls.length - 1 });
      fillDepth(values[0]!);
    },
    readBuffer: (b: number) => { rec('readBuffer', b); st.readBuffer = b; },
    enable: (cap: number) => { rec('enable', cap); st.enabled.add(cap); },
    disable: (cap: number) => { rec('disable', cap); st.enabled.delete(cap); },
    colorMask: (r: boolean, g: boolean, b: boolean, a: boolean) => { rec('colorMask', r, g, b, a); st.mask = [r, g, b, a]; },
    scissor: (x: number, y: number, w: number, h: number) => { rec('scissor', x, y, w, h); st.scissor = [x, y, w, h]; },
    viewport: (x: number, y: number, w: number, h: number) => { rec('viewport', x, y, w, h); st.viewport = [x, y, w, h]; },
    pixelStorei: (p: number, v: number | boolean) => { rec('pixelStorei', p, v); st.store.set(p, typeof v === 'number' && (p === GL.UNPACK_FLIP_Y_WEBGL || p === GL.UNPACK_PREMULTIPLY_ALPHA_WEBGL) ? v !== 0 : v); },
    bindBuffer: (target: number, b: unknown) => { rec('bindBuffer', target, b); if (target === GL.PIXEL_PACK_BUFFER) st.packBuffer = b; if (target === GL.PIXEL_UNPACK_BUFFER) st.unpackBuffer = b; if (target === GL.ARRAY_BUFFER) { if ((b as Buf | null)?.deleted) throw new Error('fake: bindBuffer of a deleted buffer'); st.arrayBuffer = b as Buf | null; } },
    clearColor: (r: number, g: number, b: number, a: number) => { rec('clearColor', r, g, b, a); st.clear = [r, g, b, a]; },
    clear: (bits: number) => {
      rec('clear', bits);
      clears.push({ target: st.draw ? 'fbo' : 'default', color: st.clear.slice(), enabled: [...st.enabled].sort(), mask: st.mask.slice() });
      if (bits & GL.DEPTH_BUFFER_BIT) { depthClears.push({ value: st.clearDepth, mask: st.depthMask, fb: st.draw?.id ?? null, at: calls.length - 1 }); fillDepth(st.clearDepth); }
      if (!(bits & GL.COLOR_BUFFER_BIT) || st.enabled.has(GL.RASTERIZER_DISCARD)) return;
      const img = image(st.draw);
      const [sx, sy, sw, sh] = st.enabled.has(GL.SCISSOR_TEST) ? st.scissor : [0, 0, img.w, img.h];
      for (let y = Math.max(0, sy!); y < Math.min(img.h, sy! + sh!); y++) for (let x = Math.max(0, sx!); x < Math.min(img.w, sx! + sw!); x++) {
        for (let c = 0; c < 4; c++) if (st.mask[c]) img.data[(y * img.w + x) * 4 + c] = toByte(st.clear[c]!);
      }
    },
    blitFramebuffer: (sx0: number, sy0: number, sx1: number, sy1: number, dx0: number, dy0: number, dx1: number, dy1: number, mask: number, filter: number) => {
      rec('blitFramebuffer', sx0, sy0, sx1, sy1, dx0, dy0, dx1, dy1, mask, filter);
      const src = image(st.read), dst = image(st.draw, false);   // a blit does not pay the composited buffer's clear
      if (Math.abs(sx1 - sx0) !== Math.abs(dx1 - dx0) || Math.abs(sy1 - sy0) !== Math.abs(dy1 - dy0)) {
        // GM-14a: a magnifying blit (the L1 frame at 1x under HD): NEAREST, a whole-number factor, both rectangles upright
        // from the origin, from one framebuffer to another; each destination pixel the source's at floor(d / s) (ES 3.0
        // §4.3.3: the source pixel holding the destination pixel's centre mapped back).
        const sw = sx1 - sx0, sh = sy1 - sy0, dw = dx1 - dx0, dh = dy1 - dy0;
        if (filter !== GL.NEAREST) throw new Error('fake: a scaled blit here is NEAREST only');
        if (st.read === st.draw) throw new Error('fake: a scaled blit within one framebuffer');
        if (sx0 !== 0 || sy0 !== 0 || dx0 !== 0 || dy0 !== 0 || sw <= 0 || sh <= 0 || dw % sw !== 0 || dh % sh !== 0 || dw / sw !== dh / sh) throw new Error('fake: only whole-number, upright magnifying blits from the origin');
        const k = dw / sw;
        for (let y = 0; y < Math.min(dh, dst.h); y++) for (let x = 0; x < Math.min(dw, dst.w); x++) {
          const s0 = (Math.floor(y / k) * src.w + Math.floor(x / k)) * 4, d0 = (y * dst.w + x) * 4;
          for (let c = 0; c < 4; c++) if (st.mask[c]) dst.data[d0 + c] = src.data[s0 + c]!;
        }
        return;
      }
      const w = Math.abs(dx1 - dx0), h = Math.abs(dy1 - dy0);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const dx = dx0 < dx1 ? dx0 + i : dx0 - 1 - i, dy = dy0 < dy1 ? dy0 + j : dy0 - 1 - j;
        const sx = sx0 < sx1 ? sx0 + i : sx0 - 1 - i, sy = sy0 < sy1 ? sy0 + j : sy0 - 1 - j;
        if (dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h) continue;
        for (let c = 0; c < 4; c++) if (st.mask[c]) dst.data[(dy * dst.w + dx) * 4 + c] = src.data[(sy * src.w + sx) * 4 + c]!;
      }
    },
    readPixels: (x: number, y: number, w: number, h: number, fmt: number, type: number, out: ArrayBufferView | number) => {
      rec('readPixels', x, y, w, h, fmt, type);
      if (st.packBuffer) {
        // GM-16: into the bound pack buffer at the byte offset `out` -- the bytes the frame holds now, in the order a real
        // context runs its commands (a later draw does not reach them).
        const pb = st.packBuffer as Buf;
        if (typeof out !== 'number') throw new Error('fake: readPixels into a pack buffer takes an offset, not an array');
        if (fmt !== GL.RGBA || type !== GL.UNSIGNED_BYTE) throw new Error('fake: a pack read here is RGBA / UNSIGNED_BYTE');
        if (st.store.get(GL.PACK_ALIGNMENT) !== 1 && (w * 4) % (st.store.get(GL.PACK_ALIGNMENT) as number) !== 0) throw new Error('fake: pack alignment pads rows');
        if (out < 0 || out + w * h * 4 > pb.data.length) throw new Error('fake: readPixels past the pack buffer');
        const img = image(st.read);
        for (let row = 0; row < h; row++) pb.data.set(img.data.subarray(((y + row) * img.w + x) * 4, ((y + row) * img.w + x + w) * 4), out + row * w * 4);
        pb.packed = true; delete pb.fence;
        return;
      }
      if (typeof out === 'number') throw new Error('fake: readPixels to an offset with no pack buffer bound');
      if (st.store.get(GL.PACK_ALIGNMENT) !== 1 && (w * 4) % (st.store.get(GL.PACK_ALIGNMENT) as number) !== 0) throw new Error('fake: pack alignment pads rows');
      const img = image(st.read), o8 = new Uint8Array(out.buffer, out.byteOffset, w * h * 4);
      for (let row = 0; row < h; row++) o8.set(img.data.subarray(((y + row) * img.w + x) * 4, ((y + row) * img.w + x + w) * 4), row * w * 4);
    },
    getParameter: (p: number) => {
      if (p === GL.GPU_DISJOINT_EXT) { if (!o.timerQuery) throw new Error('fake: GPU_DISJOINT_EXT without the extension'); const d = timer.disjoint; timer.disjoint = false; rec('getParameter', p); return d; }
      if (p === GL.RENDERER) return o.renderer ?? 'WebKit WebGL';
      if (p === GL.UNMASKED_RENDERER_WEBGL) { if (o.unmaskedRenderer === undefined || !enabled.has('WEBGL_debug_renderer_info')) throw new Error('fake: UNMASKED_RENDERER_WEBGL without its extension (INVALID_ENUM)'); return o.unmaskedRenderer; }
      return p === GL.MAX_TEXTURE_SIZE ? o.maxTexture ?? 4096 : st.store.get(p) ?? null;
    },

    // ---- GM-11a-3: EXT_disjoint_timer_query_webgl2 --------------------------------------------------------------------
    getExtension: (name: string) => {
      rec('getExtension', name);
      // GM-11b box fold: a lost context gives no extension (the box's "no WEBGL_lose_context" at restore): a page
      // restores through the object it took while the context was live.
      if (st.lost) return null;
      const ext = name === 'EXT_disjoint_timer_query_webgl2' && o.timerQuery ? timerExt
        : name === 'KHR_parallel_shader_compile' && o.parallelCompile ? { COMPLETION_STATUS_KHR: GL.COMPLETION_STATUS_KHR }
          : name === 'WEBGL_debug_renderer_info' && o.unmaskedRenderer !== undefined ? { UNMASKED_VENDOR_WEBGL: 0x9245, UNMASKED_RENDERER_WEBGL: GL.UNMASKED_RENDERER_WEBGL }
            : name === 'WEBGL_lose_context' && o.loseContext !== false ? loseExt : null;
      if (ext) enabled.add(name);
      return ext;
    },
    createQuery: (): QuerySeen => { const q: QuerySeen = { id: next++, ended: false, available: false, ns: 0, deleted: false, readEarly: 0 }; queries.push(q); rec('createQuery', q.id); return q; },
    deleteQuery: (q: QuerySeen | null) => { rec('deleteQuery', q?.id ?? null); if (q) { if (activeQuery === q) throw new Error('fake: deleteQuery of the active query'); q.deleted = true; } },
    beginQuery: (target: number, q: QuerySeen) => {
      rec('beginQuery', target, q.id);
      if (target !== GL.TIME_ELAPSED_EXT) throw new Error('fake: only TIME_ELAPSED_EXT is modelled');
      if (activeQuery) throw new Error('fake: beginQuery while a query is active (INVALID_OPERATION)');
      if (q.deleted || q.ended) throw new Error('fake: beginQuery of a used or deleted query');
      activeQuery = q;
    },
    endQuery: (target: number) => {
      rec('endQuery', target);
      if (!activeQuery) throw new Error('fake: endQuery with no query active (INVALID_OPERATION)');
      activeQuery.ended = true; activeQuery = null;
    },
    getQueryParameter: (q: QuerySeen, p: number) => {
      rec('getQueryParameter', q.id, p);
      if (q === activeQuery || !q.ended || q.deleted) throw new Error('fake: getQueryParameter of an active, unended or deleted query (INVALID_OPERATION)');
      if (p === GL.QUERY_RESULT_AVAILABLE) return q.available;
      if (p === GL.QUERY_RESULT) { if (!q.available) { q.readEarly++; throw new Error('fake: QUERY_RESULT read before it is available (a stall)'); } return q.ns; }
      throw new Error(`fake: query parameter 0x${p.toString(16)}`);
    },

    // ---- GM-16: fences and the pack buffer's read --------------------------------------------------------------------
    fenceSync: (condition: number, flags: number): SyncSeen => {
      rec('fenceSync', condition, flags);
      if (condition !== GL.SYNC_GPU_COMMANDS_COMPLETE || flags !== 0) throw new Error('fake: fenceSync(SYNC_GPU_COMMANDS_COMPLETE, 0) only (ES 3.0 §5.2)');
      const x: SyncSeen = { id: next++, signaled: false, deleted: false };
      syncs.push(x);
      for (const b of buffers) if (b.packed && !b.deleted) { b.fence = x; b.packed = false; }
      return x;
    },
    getSyncParameter: (x: SyncSeen, p: number) => {
      rec('getSyncParameter', x.id, p);
      if (x.deleted) throw new Error('fake: getSyncParameter of a deleted sync (INVALID_OPERATION)');
      if (p === GL.SYNC_STATUS) return x.signaled ? GL.SIGNALED : GL.UNSIGNALED;
      if (p === GL.OBJECT_TYPE) return GL.SYNC_FENCE;
      throw new Error(`fake: sync parameter 0x${p.toString(16)}`);
    },
    clientWaitSync: (x: SyncSeen, flags: number, timeout: number) => {
      rec('clientWaitSync', x.id, flags, timeout);
      if (timeout !== 0) fences.waits++;
      return x.signaled ? GL.ALREADY_SIGNALED : GL.TIMEOUT_EXPIRED;
    },
    deleteSync: (x: SyncSeen | null) => { rec('deleteSync', x?.id ?? null); if (x) x.deleted = true; },
    flush: () => { rec('flush'); },
    getBufferSubData: (target: number, offset: number, dst: ArrayBufferView, dstOffset = 0, length = 0) => {
      rec('getBufferSubData', target, offset);
      if (target !== GL.PIXEL_PACK_BUFFER) throw new Error('fake: getBufferSubData is modelled on PIXEL_PACK_BUFFER only');
      const pb = st.packBuffer as Buf | null;
      if (!pb || pb.deleted) throw new Error('fake: getBufferSubData with no PIXEL_PACK_BUFFER bound');
      if (pb.packed || !pb.fence || !pb.fence.signaled) fences.readEarly++;
      const d8 = new Uint8Array(dst.buffer, dst.byteOffset + dstOffset, length || dst.byteLength - dstOffset);
      if (offset < 0 || offset + d8.length > pb.data.length) throw new Error('fake: getBufferSubData past the buffer');
      d8.set(pb.data.subarray(offset, offset + d8.length));
    },

    // ---- GM-11a-2: shaders, programs, uniforms, vertex arrays, blending, draws --------------------------------------
    createShader: (type: number): Shader => { const s: Shader = { id: next++, type, source: '', compiled: false, deleted: false }; shaders.push(s); rec('createShader', type); return s; },
    shaderSource: (s: Shader, source: string) => { rec('shaderSource', s.id); s.source = source; },
    compileShader: (s: Shader) => { rec('compileShader', s.id); s.compiled = s.source.startsWith('#version 300 es\n') && !(o.failCompile && s.source.includes(o.failCompile)); },
    getShaderParameter: (s: Shader, p: number) => (p === GL.COMPILE_STATUS ? s.compiled : null),
    getShaderInfoLog: (s: Shader) => (s.compiled ? '' : 'fake: ERROR: 0:1: not compiled'),
    deleteShader: (s: Shader | null) => { rec('deleteShader', s?.id ?? null); if (s) s.deleted = true; },
    createProgram: (): Program => { const p: Program = { id: next++, shaders: [], linked: false, name: null, uniforms: new Map(), declared: new Set(), deleted: false, bound: new Map(), attributes: new Map(), complete: true }; programs.push(p); rec('createProgram', p.id); return p; },
    bindAttribLocation: (p: Program, loc: number, name: string) => { rec('bindAttribLocation', p.id, loc, name); p.bound.set(name, loc); },
    attachShader: (p: Program, s: Shader) => { rec('attachShader', p.id, s.id); p.shaders.push(s); },
    linkProgram: (p: Program) => {
      rec('linkProgram', p.id);
      p.complete = !o.parallelCompile;
      const vs = p.shaders.find((s) => s.type === GL.VERTEX_SHADER), fs = p.shaders.find((s) => s.type === GL.FRAGMENT_SHADER);
      const name = fs ? Object.entries(FRAGMENTS).find(([, src]) => src === fs.source)?.[0] ?? null : null;
      p.linked = !o.failLink && !!vs && !!fs && vs.compiled && fs.compiled && name !== null && vs.source === VERTEX_OF(name);
      p.name = name;
      for (const s of [vs, fs]) for (const m of (s?.source ?? '').matchAll(/^uniform \w+ (\w+);/gm)) p.declared.add(m[1]!);
      for (const m of (vs?.source ?? '').matchAll(/^in (\w+) (\w+);/gm)) p.attributes.set(m[2]!, m[1]!);
      // Every flat input of the fragment shader needs the vertex shader's flat output of that name and type (a link rule).
      const outs = new Map([...(vs?.source ?? '').matchAll(/^flat out (\w+) (\w+);/gm)].map((m) => [m[2]!, m[1]!]));
      for (const m of (fs?.source ?? '').matchAll(/^flat in (\w+) (\w+);/gm)) if (outs.get(m[2]!) !== m[1]) p.linked = false;
      // Every attribute has the location bound before the link (the backend binds them all; nothing left to the linker).
      for (const a of p.attributes.keys()) if (!p.bound.has(a)) p.linked = false;
    },
    getProgramParameter: (p: Program, q: number) => {
      rec('getProgramParameter', p.id, q);
      if (q === GL.COMPLETION_STATUS_KHR) { if (!enabled.has('KHR_parallel_shader_compile')) throw new Error('fake: COMPLETION_STATUS_KHR without its extension (INVALID_ENUM)'); return p.complete; }
      if (q === GL.LINK_STATUS) { if (!p.complete) { compile.blockingQueries++; p.complete = true; } return p.linked; }
      return null;
    },
    getProgramInfoLog: (p: Program) => (p.linked ? '' : 'fake: link failed'),
    deleteProgram: (p: Program | null) => { rec('deleteProgram', p?.id ?? null); if (p) p.deleted = true; },
    getUniformLocation: (p: Program, name: string): Loc | null => (p.linked && p.declared.has(name) ? { program: p, name } : null),
    useProgram: (p: Program | null) => { rec('useProgram', p?.id ?? null); if (p && !p.linked) throw new Error('fake: useProgram of an unlinked program'); st.program = p; },
    createVertexArray: (): Vao => { const v: Vao = { id: next++, attribs: new Map(), deleted: false }; vaos.push(v); rec('createVertexArray', v.id); return v; },
    bindVertexArray: (v: Vao | null) => { rec('bindVertexArray', v?.id ?? null); if (v?.deleted) throw new Error('fake: bindVertexArray of a deleted array'); st.vao = v; },
    deleteVertexArray: (v: Vao | null) => { rec('deleteVertexArray', v?.id ?? null); if (v) v.deleted = true; if (st.vao === v) st.vao = null; },
    // ---- GM-11a-3: buffers and attributes (instancing) ---------------------------------------------------------------
    createBuffer: (): Buf => { const b: Buf = { id: next++, data: new Uint8Array(0), deleted: false }; buffers.push(b); rec('createBuffer', b.id); return b; },
    deleteBuffer: (b: Buf | null) => { rec('deleteBuffer', b?.id ?? null); if (b) b.deleted = true; if (st.arrayBuffer === b) st.arrayBuffer = null; },
    bufferData: (target: number, src: number | ArrayBufferView, usage: number) => {
      rec('bufferData', target, typeof src === 'number' ? src : src.byteLength, usage);
      if (target === GL.PIXEL_PACK_BUFFER) {
        // GM-16: the guard's read-back buffer, sized for one frame.
        const pb = st.packBuffer as Buf | null;
        if (!pb || pb.deleted) throw new Error('fake: bufferData with no PIXEL_PACK_BUFFER bound');
        if (typeof src !== 'number') throw new Error('fake: a pack buffer is sized, not filled');
        pb.data = new Uint8Array(src); pb.packed = false; delete pb.fence;
        return;
      }
      if (target !== GL.ARRAY_BUFFER || !st.arrayBuffer) throw new Error('fake: bufferData with no ARRAY_BUFFER bound');
      st.arrayBuffer.data = typeof src === 'number' ? new Uint8Array(src) : new Uint8Array(src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength));
    },
    bufferSubData: (target: number, offset: number, src: ArrayBufferView, srcOffset = 0, length = 0) => {
      rec('bufferSubData', target, offset, src, srcOffset, length);
      const b = st.arrayBuffer;
      if (target !== GL.ARRAY_BUFFER || !b) throw new Error('fake: bufferSubData with no ARRAY_BUFFER bound');
      const el = (src as unknown as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1;
      const bytes = new Uint8Array(src.buffer, src.byteOffset + srcOffset * el, (length || (src.byteLength / el - srcOffset)) * el);
      if (offset < 0 || offset + bytes.length > b.data.length) throw new Error('fake: bufferSubData past the buffer');
      b.data.set(bytes, offset);
    },
    vertexAttribIPointer: (loc: number, size: number, type: number, stride: number, offset: number) => {
      rec('vertexAttribIPointer', loc, size, type, stride, offset);
      if (!st.arrayBuffer) throw new Error('fake: an attribute pointer with no ARRAY_BUFFER bound');
      Object.assign(attrib(loc), { buffer: st.arrayBuffer, size, type, integer: true, normalized: false, stride, offset });
    },
    vertexAttribPointer: (loc: number, size: number, type: number, normalized: boolean, stride: number, offset: number) => {
      rec('vertexAttribPointer', loc, size, type, normalized, stride, offset);
      if (!st.arrayBuffer) throw new Error('fake: an attribute pointer with no ARRAY_BUFFER bound');
      Object.assign(attrib(loc), { buffer: st.arrayBuffer, size, type, integer: false, normalized, stride, offset });
    },
    vertexAttribDivisor: (loc: number, d: number) => { rec('vertexAttribDivisor', loc, d); attrib(loc).divisor = d; },
    enableVertexAttribArray: (loc: number) => { rec('enableVertexAttribArray', loc); attrib(loc).enabled = true; },
    disableVertexAttribArray: (loc: number) => { rec('disableVertexAttribArray', loc); attrib(loc).enabled = false; },
    blendFuncSeparate: (a: number, b: number, c: number, d: number) => { rec('blendFuncSeparate', a, b, c, d); st.func = [a, b, c, d]; },
    blendEquationSeparate: (a: number, b: number) => { rec('blendEquationSeparate', a, b); st.equation = [a, b]; },
    drawArrays: (mode: number, first: number, count: number) => {
      rec('drawArrays', mode, first, count);
      const p = st.program;
      if (!p || !p.name) throw new Error('fake: drawArrays without a linked program');
      if (p.name === 'present') { present(p, mode, first, count); return; }
      if (p.name !== 'movie') throw new Error(`fake: ${p.name} draws its quads instanced (drawArraysInstanced)`);
      if (mode !== GL.TRIANGLE_STRIP || first !== 0 || count !== 4) throw new Error('fake: a quad is a four-vertex strip');
      if (!st.vao) throw new Error('fake: drawArrays without a vertex array bound');
      for (const n of ['u_rect', 'u_size', 'u_scale']) if (!p.uniforms.has(n)) throw new Error(`fake: ${n} never set on ${p.name}`);
      raster(p, p.uniforms, p.uniforms.get('u_rect')!, 0, 1);
    },
    drawArraysInstanced: (mode: number, first: number, count: number, instances: number) => {
      rec('drawArraysInstanced', mode, first, count, instances);
      const p = st.program;
      if (!p || !p.name) throw new Error('fake: drawArraysInstanced without a linked program');
      if (p.name === 'movie') throw new Error('fake: the movie is one plain draw');
      if (mode !== GL.TRIANGLE_STRIP || first !== 0 || count !== 4) throw new Error('fake: a quad is a four-vertex strip');
      if (!st.vao) throw new Error('fake: drawArraysInstanced without a vertex array bound');
      if (!(Number.isInteger(instances) && instances > 0)) throw new Error(`fake: ${instances} instances`);
      const model = isModel(p.name);
      for (const n of ['u_size', ...(p.name === 'quad-prog' ? ['u_destOrigin'] : []), ...(model ? ['u_depthScale'] : [])]) if (!p.uniforms.has(n)) throw new Error(`fake: ${n} never set on ${p.name}`);
      const vs = p.shaders.find((s) => s.type === GL.VERTEX_SHADER)!.source;
      const VARYINGS = model ? MODEL_VARYINGS : QUAD_VARYINGS;
      for (const v of Object.values(VARYINGS)) if (!vs.includes(v.line)) throw new Error(`fake: the ${model ? 'model' : 'quad'} vertex shader does not carry \`${v.line}\``);
      // Each attribute the vertex shader reads, as the bound vertex array holds it: enabled, a buffer, one per instance.
      const read = new Map<string, (i: number) => number[]>();
      for (const [name, type] of p.attributes) {
        const loc = p.bound.get(name)!, a = vaoNow().attribs.get(loc);
        if (!a || !a.enabled || !a.buffer || a.buffer.deleted) throw new Error(`fake: attribute ${name} (location ${loc}) not enabled on a buffer`);
        if (a.divisor !== 1) throw new Error(`fake: attribute ${name} divisor ${a.divisor}, not 1 (one value per quad)`);
        const integer = type.startsWith('ivec') || type === 'int', size = type.endsWith('vec4') ? 4 : type.endsWith('vec3') ? 3 : type.endsWith('vec2') ? 2 : 1;
        if (a.integer !== integer || a.size !== size || a.type !== (integer ? GL.INT : GL.FLOAT) || a.normalized) throw new Error(`fake: attribute ${name} (${type}) pointed as ${a.integer ? 'integer' : 'float'} ${a.size} x 0x${a.type.toString(16)}`);
        const view = new DataView(a.buffer.data.buffer, a.buffer.data.byteOffset, a.buffer.data.byteLength), stride = a.stride || size * 4;
        read.set(name, (i) => {
          const at = a.offset + (first + i) * stride;
          if (at + size * 4 > view.byteLength) throw new Error(`fake: attribute ${name} of instance ${i} past its buffer`);
          return Array.from({ length: size }, (_, k) => (integer ? view.getInt32(at + k * 4, true) : view.getFloat32(at + k * 4, true)));
        });
      }
      for (let i = 0; i < instances; i++) {
        const u = new Map(p.uniforms);
        for (const [varying, v] of Object.entries(VARYINGS)) {
          const r = read.get(v.attribute);
          if (!r) throw new Error(`fake: the vertex shader declares no ${v.attribute}`);
          u.set(varying, r(i).slice(v.from, v.from + v.count));
        }
        if (model) {
          // GM-15a: the strip's corners are the instance's box (the vertex shader's `a_box`), kept under its GLSL name.
          const box = read.get('a_box');
          if (!box) throw new Error('fake: the model vertex shader declares no a_box');
          u.set('a_box', box(i));
        }
        raster(p, u, model ? u.get('a_box')! : u.get('q_rect')!, i, instances);
      }
    },
  };
  /**
   * GM-19a: the premultiplied present (`UI_GPU_PREMULTIPLIED_PRESENT_ADAPTATION`) as its GLSL writes it -- one triangle over
   * the viewport into the default framebuffer, each pixel the frame texture's texel at the flipped row, each colour
   * channel at most its alpha. The state a real draw would honour is refused rather than modelled (blend, scissor, a
   * partial colour mask, discard, cull, depth); dither on changes a byte as the quads' does.
   */
  const present = (p: Program, mode: number, first: number, count: number): void => {
    if (mode !== GL.TRIANGLES || first !== 0 || count !== 3) throw new Error('fake: the present is one three-vertex triangle');
    if (!st.vao) throw new Error('fake: drawArrays without a vertex array bound');
    if (st.draw) throw new Error('fake: the present draws into the default framebuffer');
    const unit = UI_GPU_PREMULTIPLIED_PRESENT_ADAPTATION.unit;
    if (p.uniforms.get('u_frame')?.[0] !== unit) throw new Error(`fake: u_frame not on unit ${unit}`);
    const t = sampled(unit, GL.RGBA8, 'u_frame');
    for (const cap of [GL.BLEND, GL.SCISSOR_TEST, GL.RASTERIZER_DISCARD, GL.CULL_FACE, GL.DEPTH_TEST]) if (st.enabled.has(cap)) throw new Error(`fake: the present drawn with 0x${cap.toString(16)} on`);
    if (!st.mask.every(Boolean)) throw new Error('fake: the present drawn under a partial colour mask');
    const img = image(null), src = t.data as Uint8Array;
    const [vx, vy, vw, vh] = st.viewport;
    if (vx !== 0 || vy !== 0 || vw !== img.w || vh !== img.h) throw new Error('fake: the viewport is not the canvas');
    if (t.w !== img.w || t.h !== img.h) throw new Error(`fake: the frame (${t.w} x ${t.h}) is not the canvas's size (${img.w} x ${img.h})`);
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      const s0 = ((t.h - 1 - y) * t.w + x) * 4, d0 = (y * img.w + x) * 4, a = src[s0 + 3]!;
      const bytes = [Math.min(src[s0]!, a), Math.min(src[s0 + 1]!, a), Math.min(src[s0 + 2]!, a), a];
      if (st.enabled.has(GL.DITHER) && (x + y) % 2 === 1) for (let c = 0; c < 4; c++) bytes[c] = bytes[c]! ^ 1;
      for (let c = 0; c < 4; c++) img.data[d0 + c] = bytes[c]!;
    }
  };
  /** One drawn quad or picture: its program's inputs `u`, over the integer rectangle `rect`. */
  const raster = (p: Program, u: Map<string, number[]>, rect: number[], instance: number, instances: number): void => {
    {
      const samplers = [['u_tex', UI_GPU_TEXTURE_UNITS.tex, GL.RGBA8UI], ['u_axis', UI_GPU_TEXTURE_UNITS.axis, GL.RGBA32F], ['u_dest', UI_GPU_TEXTURE_UNITS.dest, GL.RGBA8], ['u_movie', UI_GPU_MOVIE_UNIT, GL.RGBA8UI]] as const;
      for (const [sampler, unit] of samplers) {
        if (p.declared.has(sampler) && u.get(sampler)?.[0] !== unit) throw new Error(`fake: ${sampler} not on unit ${unit}`);
      }
      // Every sampler the program declares is checked as a real draw checks it, sampled or not.
      for (const [sampler, unit, format] of samplers) if (p.declared.has(sampler)) sampled(unit, format, sampler);
      const blend = st.enabled.has(GL.BLEND);
      const model = isModel(p.name!), depthBuf = st.draw?.depth ?? null;
      draws.push({
        program: p.name!, uniforms: Object.fromEntries([...u].map(([k, v]) => [k, v.slice()])), blend, func: st.func.slice(), equation: st.equation.slice(),
        units: [0, 1, 2].map((k) => units.get(k)?.id ?? null), at: calls.length - 1, mask: st.mask.slice(), instance, instances,
        depthTest: st.enabled.has(GL.DEPTH_TEST), depthFunc: st.depthFunc, depthMask: st.depthMask, depthAttached: !!depthBuf,
      });
      if (st.enabled.has(GL.RASTERIZER_DISCARD) || st.enabled.has(GL.CULL_FACE)) return;   // the fake culls pessimistically
      if (blend && (st.equation[0] !== GL.FUNC_ADD || st.equation[1] !== GL.FUNC_ADD)) throw new Error('fake: only FUNC_ADD is modelled');
      // GM-15a: the depth test runs only with the test on and a depth attached (ES 3.0 section 4.1.6); a quad or the movie
      // writes no gl_FragDepth, and a 2D quad never tests the models' depth: refused.
      const testing = st.enabled.has(GL.DEPTH_TEST) && !!depthBuf;
      if (testing && !model) throw new Error(`fake: ${p.name} drawn with DEPTH_TEST on (a 2D quad keeps no depth, UI_2D_QUAD_Z_READING)`);
      if (testing && st.depthFunc !== GL.GEQUAL) throw new Error(`fake: depthFunc 0x${st.depthFunc.toString(16)} not modelled (GEQUAL only)`);
      if (depthBuf && (depthBuf.deleted || !depthBuf.data)) throw new Error('fake: a draw into a framebuffer whose depth has no storage');
      const img = image(st.draw);
      // The vertex shader's strip: the corners are pixel edges, so the covered pixels are the rectangle's (centres inside).
      const [xs, ys, xe, ye] = rect, size = u.get('u_size')!;
      if (size[0] !== img.w || size[1] !== img.h) throw new Error(`fake: u_size ${size} on a ${img.w} x ${img.h} target`);
      const [vx, vy, vw, vh] = st.viewport;
      if (vx !== 0 || vy !== 0 || vw !== img.w || vh !== img.h) throw new Error('fake: the viewport is not the frame');
      let [x0, y0, x1, y1] = [Math.max(0, xs!), Math.max(0, ys!), Math.min(img.w, xe!), Math.min(img.h, ye!)];
      if (st.enabled.has(GL.SCISSOR_TEST)) { const [sx, sy, sw, sh] = st.scissor; x0 = Math.max(x0, sx!); y0 = Math.max(y0, sy!); x1 = Math.min(x1, sx! + sw!); y1 = Math.min(y1, sy! + sh!); }
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        let out: number[];
        if (model) {
          const frag = modelFragment(p.name!, u, x, y);
          if (!frag) continue;                                     // discarded: no colour, no depth
          if (testing) {
            const at = y * depthBuf!.w + x;
            if (!T5_depthPasses(frag.z, depthBuf!.data![at]!)) continue;   // GEQUAL failed: nothing written
            if (st.depthMask) depthBuf!.data![at] = f(frag.z);
          }
          out = frag.out;
        } else out = fragment(p.name!, u, x, y);
        const i = (y * img.w + x) * 4;
        const bytes = [0, 0, 0, 0];
        if (blend) {
          const sa = clamp01(f(out[3]!)), da = f(img.data[i + 3]! / 255);
          for (let c = 0; c < 4; c++) {
            const s = clamp01(f(out[c]!)), d = f(img.data[i + c]! / 255);
            const sf = factor(st.func[c < 3 ? 0 : 2]!, sa, da), df = factor(st.func[c < 3 ? 1 : 3]!, sa, da);
            bytes[c] = S12ff_unorm(f(f(s * sf) + f(d * df)));
          }
        } else for (let c = 0; c < 4; c++) bytes[c] = toByte(out[c]!);
        // Dither left on may change a byte (ES 3.0 §4.1.10): the fake changes the low bit of odd pixels.
        if (st.enabled.has(GL.DITHER) && (x + y) % 2 === 1) for (let c = 0; c < 4; c++) bytes[c] = bytes[c]! ^ 1;
        for (let c = 0; c < 4; c++) if (st.mask[c]) img.data[i + c] = bytes[c]!;
      }
    }
  };
  // GM-12a: a lost context ignores every call (create* give null, queries give null) but the few a page asks it after a
  // loss; an object from before a restore is refused (it belonged to the lost context); a fault set by `failNext` throws.
  const LOST_OK = new Set(['isContextLost', 'getError', 'getExtension']);
  const wrap = (target: Record<string, unknown>): void => {
    for (const k of Object.keys(target)) {
      const fn = target[k];
      if (typeof fn !== 'function') continue;
      target[k] = (...args: unknown[]): unknown => {
        const left = faults.size ? faults.get(k) : undefined;
        if (left !== undefined) { if (left <= 1) faults.delete(k); else faults.set(k, left - 1); throw new Error(`fake: ${k} failed (an injected GL error)`); }
        if (st.lost && !LOST_OK.has(k)) { loss.whileLost.push(k); return k.startsWith('create') || k.startsWith('get') || k === 'checkFramebufferStatus' ? (k === 'checkFramebufferStatus' ? 0 : null) : undefined; }
        if (loss.restores) for (const a of args) if (a && typeof a === 'object' && loss.stale.has(a)) throw new Error(`fake: ${k} given an object from before the restore (INVALID_OPERATION)`);
        return (fn as (...a: unknown[]) => unknown)(...args);
      };
    }
  };
  const uniform = (kind: 'i' | 'f') => (loc: Loc | null, ...v: number[]) => {
    rec(`uniform${v.length}${kind}`, loc?.name ?? null, ...v);
    if (!loc) return;
    if (loc.program !== st.program) throw new Error(`fake: ${loc.name} set on a program not in use`);
    if (kind === 'i' && !v.every(Number.isInteger)) throw new Error(`fake: ${loc.name} given a non-integer`);
    loc.program.uniforms.set(loc.name, kind === 'f' ? v.map(Math.fround) : v.slice());
  };
  Object.assign(gl, { uniform1i: uniform('i'), uniform2i: uniform('i'), uniform4i: uniform('i'), uniform1f: uniform('f'), uniform2f: uniform('f'), uniform4f: uniform('f') });
  wrap(gl as unknown as Record<string, unknown>);
  return {
    gl, canvas, calls, clears, draws, copies, textures, framebuffers, programs, shaders, st, attrs: () => attrsSeen, backbuffer, queries, timer, buffers, vaos,
    renderbuffers, depthClears,
    loss, events, listening, failNext, compile, loseExt, fences,
    /** The page composited (a task ended): the drawing buffer owes its clear (`preserveDrawingBuffer: false`). */
    composite: (): void => { clearOwed = true; },
    activeQuery: () => activeQuery,
    names: () => calls.map((c) => c[0]),
  };
}
export type Fake = ReturnType<typeof fakeGl>;
