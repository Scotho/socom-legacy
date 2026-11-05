import { beforeEach, describe, expect, it } from 'vitest';
import type { Rgba } from '@s2u/gs';
import { MovieLayer, type MoviePicture, type UiDrawItem } from '@s2u/ui';
import { rasterizeUiDrawList } from '../src/uiCompositorView';
import { movieFramePicture } from '../src/frontEndMovies';
import { executeFramePlanOnCpu } from '../src/uiFramePlanCpu';
import { planFrame, type UiFramePlan } from '../src/uiFramePlan';
import { executeFramePlanOnTwin } from '../src/uiGpuTwin';
import { GpuUiPresenter } from '../src/uiGpuPresenter';
import {
  UI_GPU_MOVIE_FRAGMENT_SOURCE, UI_GPU_MOVIE_TEXTURES_ADAPTATION, UI_GPU_MOVIE_UNIT, UI_GPU_MOVIE_VERTEX_SOURCE,
} from '../src/uiGpuMovie';
import { UiGpuBackend, createUiGpuBackend } from '../src/uiGpuWebgl2';
import { GL, fakeGl, type Fake } from './uiGpuFakeGl';
import { UI_RASTER_CASES, UI_RASTER_CASE_MODES, UI_RASTER_CASE_SCALES, caseRasterInputs, caseRunKey } from './uiRasterCases';

// GM-11a-3 (plan 2026-11-01-gpu-menus, row GM-11a-3; research 380 P16, P17; u2 §8): the movie on the GPU. A picture is
// a `movie` step of the plan (GM-06b): its RGB copied at the origin, nearest s x s, the frame's alpha untouched (P17,
// `MOVIE_RECT_READING`). On the GPU the picture is an `RGBA8UI` texture (one of `UI_GPU_MOVIE_TEXTURES_ADAPTATION`)
// drawn by the `movie` program (`texelFetch(u_movie, p / u_scale)`), blending off, the colour mask RGB only.
//
// The row's timing contract, held here on the fake GL (unit test; a real GPU's is the box's, GM-11b case 8):
// - the picture is uploaded **in the render that first shows it** -- not when the player presents it to the layer,
//   not before, not after -- and **keyed on the picture object** (`MoviePicture`), not on the `Rgba` view the planner's
//   `movie` option makes of it afresh each render (`movieFramePicture`);
// - **a released (detached) buffer is never touched**: once the worker has its buffer back the picture is black by
//   the software (P16 through `movieFramePicture`'s null) and no call reads it;
// - **the same picture is never re-uploaded** while its texture holds it;
// - **at most one picture per tick**: the player presents one a tick (R110.1), so a render uploads at most one.
// Evidence kind: unit test (fake GL), source inspection (the GLSL lint). The GLSL compiled and run on a GPU: GM-11b.

const backendOn = (f: Fake, transparent = false): UiGpuBackend => {
  const b = createUiGpuBackend(f.canvas as unknown as HTMLCanvasElement, { transparent });
  if (!b) throw new Error('no backend');
  return b;
};
const diff = (a: ArrayLike<number>, b: ArrayLike<number>): number => {
  if (a.length !== b.length) return -1;
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
};
const CASE_8 = UI_RASTER_CASES.find((c) => c.id === 8)!;
const code = (src: string): string => src.replace(/\/\/[^\n]*/g, '');

/** A decoded picture as the worker hands it (`MovieFrame`): its own transferable buffer, seeded bytes. */
function frame(index: number, width = 6, height = 4): MoviePicture {
  const rgba = new ArrayBuffer(width * height * 4), d = new Uint8Array(rgba);
  let s = (index * 2654435761) >>> 0;
  for (let i = 0; i < d.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = s >>> 24; }
  return { width, height, image: { kind: 'picture', index, width, height, rgba } };
}
/** The worker takes the picture's buffer back (a transfer): the `ArrayBuffer` is detached, 0 bytes. */
function release(p: MoviePicture): ArrayBuffer {
  const buf = (p.image as { rgba: ArrayBuffer }).rgba;
  structuredClone(buf, { transfer: [buf] });
  expect(buf.byteLength).toBe(0);
  return buf;
}
const bufferOf = (p: MoviePicture): ArrayBuffer => (p.image as { rgba: ArrayBuffer }).rgba;

/** The front end's list for a tick with a movie background and a quad over it (the layer is the bottom of the list). */
const listFor = (picture: MoviePicture | null): UiDrawItem[] => [
  { kind: 'movie', picture, x0: 0, y0: 0, x1: 640, y1: 448 },
];
const OPTIONS = { scale: 2 as const, movie: movieFramePicture };

/** The texture uploads (`texSubImage2D`) of RGBA8UI data the fake saw, with the source each read. */
const movieUploads = (f: Fake, from = 0): { at: number; src: Uint8Array }[] =>
  f.calls.flatMap((c, at) => (at >= from && c[0] === 'texSubImage2D' && c[7] === GL.RGBA_INTEGER ? [{ at, src: c[9] as Uint8Array }] : []));
const movieDraws = (f: Fake) => f.draws.filter((d) => d.program === 'movie');

describe('GM-11a-3: the movie program (source lint; P17)', () => {
  it('is GLSL ES 3.00 at high precision, its vertex shader the rectangle strip', () => {
    for (const src of [UI_GPU_MOVIE_VERTEX_SOURCE, UI_GPU_MOVIE_FRAGMENT_SOURCE]) {
      expect(src.startsWith('#version 300 es\n')).toBe(true);
      expect(src).toContain('precision highp float;');
      expect(src).toContain('precision highp int;');
    }
    expect(UI_GPU_MOVIE_VERTEX_SOURCE).toContain('uniform ivec4 u_rect;');
  });
  it('fetches the picture by texelFetch at p / s (nearest s x s, integer division), no filtered lookup, no rounding', () => {
    const c = code(UI_GPU_MOVIE_FRAGMENT_SOURCE);
    expect(c).toContain('uniform usampler2D u_movie;');
    expect(c).toContain('ivec2 p = ivec2(gl_FragCoord.xy);');
    expect(c).toContain('texelFetch(u_movie, p / u_scale, 0)');
    expect(c).not.toMatch(/\b(texture|textureLod|textureProj|textureGrad|mix|roundEven|round|floor|ceil|trunc|fract)\s*\(/);
    expect(c).toContain('o_colour = vec4(t) / 255.0;');
  });
  it('names its rule rows and readings (P17, MOVIE_RECT_READING) beside the copy', () => {
    expect(UI_GPU_MOVIE_FRAGMENT_SOURCE).toMatch(/\/\/ .*P17.*MOVIE_RECT_READING/);
  });
});

describe('GM-11a-3: case 8 on the fake GL (P17: RGB at the origin, nearest s x s, alpha untouched)', () => {
  beforeEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  it('is drawn on the GPU at 1/2/4, both modes, under ff and exact: equal to the twin, the executor and the software (E)', () => {
    for (const scale of UI_RASTER_CASE_SCALES) for (const mode of UI_RASTER_CASE_MODES) for (const blend of ['ff', 'exact'] as const) {
      const { items, textures, options } = caseRasterInputs(CASE_8, scale, mode), key = `${caseRunKey(CASE_8, scale, mode)}/${blend}`;
      const plan = planFrame(items, textures, { scale, transparent: mode === 'transparent', movie: options.movie, blend });
      const f = fakeGl(), b = backendOn(f, mode === 'transparent');
      expect(b.refusal(plan), key).toBeNull();
      b.draw(plan);
      const got = b.readPixels().data;
      expect(diff(got, executeFramePlanOnTwin(plan, { divide: false }).frame.data), key).toBe(0);
      expect(diff(got, executeFramePlanOnCpu(plan).frame.data), key).toBe(0);   // case 8 keeps alpha 0 or 255: no divide
      expect(diff(got, rasterizeUiDrawList(items, textures, { ...options, preDivide: mode === 'transparent' }).frame.data), key).toBe(0);
      const [d] = movieDraws(f);
      expect(movieDraws(f).length, key).toBe(1);
      expect(f.calls.filter((c) => c[0] === 'drawArrays').length, `${key}: the movie is one plain draw`).toBe(1);
      expect(d!.blend, key).toBe(false);
      expect(d!.mask, key).toEqual([true, true, true, false]);
      expect(d!.uniforms.u_scale, key).toEqual([scale]);
      expect(d!.uniforms.u_movie, key).toEqual([UI_GPU_MOVIE_UNIT]);
      const step = plan.steps.find((s) => s.kind === 'movie')!;
      expect(d!.uniforms.u_rect, key).toEqual(step.kind === 'movie' ? [step.rect.xs, step.rect.ys, step.rect.xe, step.rect.ye] : []);
    }
  });

  it('through GpuUiPresenter: case 8 takes the GPU path (no longer L1), its frame the software\'s', () => {
    for (const scale of UI_RASTER_CASE_SCALES) for (const mode of UI_RASTER_CASE_MODES) {
      const { items, textures, options } = caseRasterInputs(CASE_8, scale, mode);
      const p = new GpuUiPresenter(backendOn(fakeGl(), mode === 'transparent'));
      p.present(items, textures, options);
      expect(p.last!.path, caseRunKey(CASE_8, scale, mode)).toBe('gpu');
      expect(diff(p.readFrame()!.data, rasterizeUiDrawList(items, textures, options).frame.data)).toBe(0);
    }
  });

  it('uploads the picture as RGBA8UI, top row first, its bytes as they are (unflipped, not premultiplied, whatever was left)', () => {
    const { items, textures, options } = caseRasterInputs(CASE_8, 1, 'opaque');
    const plan = planFrame(items, textures, { scale: 1, movie: options.movie });
    const f = fakeGl(), b = backendOn(f), g = f.gl;
    g.pixelStorei(GL.UNPACK_FLIP_Y_WEBGL, true); g.pixelStorei(GL.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); g.pixelStorei(GL.UNPACK_ALIGNMENT, 8);
    b.draw(plan);
    const tex = f.textures.find((t) => t.format === GL.RGBA8UI && t.w === 4 && t.h === 3)!;
    expect(tex.min).toBe(GL.NEAREST);
    expect(diff(tex.data!, plan.movies[0]!.image.data)).toBe(0);
  });
});

describe('GM-11a-3: the movie\'s timing on the fake GL (u2 §8)', () => {
  it('the plan carries the picture object it was given (the key), beside the Rgba view the option made', () => {
    const pic = frame(1);
    const a = planFrame(listFor(pic), () => null, OPTIONS), b = planFrame(listFor(pic), () => null, OPTIONS);
    expect(a.movies[0]!.picture).toBe(pic);
    expect(a.movies[0]!.image).not.toBe(b.movies[0]!.image);     // movieFramePicture: a fresh view each render
    expect(a.hash).toBe(b.hash);
  });

  it('uploads in the render that first shows a picture: not at the layer\'s present, once in that render, before its draw', () => {
    const layer = new MovieLayer(), f = fakeGl(), p = new GpuUiPresenter(backendOn(f));
    const a = frame(1);
    layer.present(a);                                   // the player presents it: nothing on the GPU yet
    expect(movieUploads(f).length).toBe(0);
    const before = f.calls.length;
    p.present(listFor(layer.picture()), () => null, OPTIONS);
    const ups = movieUploads(f, before);
    expect(ups.length).toBe(1);
    expect(ups[0]!.src.buffer).toBe(bufferOf(a));     // the picture's own buffer, no copy
    expect(ups[0]!.at).toBeLessThan(movieDraws(f)[0]!.at);
    expect(diff(p.readFrame()!.data, rasterizeUiDrawList(listFor(a), () => null, OPTIONS).frame.data)).toBe(0);
  });

  it('keys on the picture object: the same picture over many renders is uploaded once; an equal-bytes new picture is its own upload', () => {
    const f = fakeGl(), p = new GpuUiPresenter(backendOn(f));
    const a = frame(1);
    for (let t = 0; t < 5; t++) p.present(listFor(a), () => null, OPTIONS);
    expect(movieUploads(f).length).toBe(1);
    expect(movieDraws(f).length).toBe(5);
    const twin: MoviePicture = { ...a, image: { ...(a.image as object), rgba: bufferOf(a).slice(0) } };
    p.present(listFor(twin), () => null, OPTIONS);
    expect(movieUploads(f).length).toBe(2);
    expect(diff(p.readFrame()!.data, rasterizeUiDrawList(listFor(twin), () => null, OPTIONS).frame.data)).toBe(0);
  });

  it('never touches a released buffer: a picture handed back is black by the software (P16) and read by no call', () => {
    const f = fakeGl(), p = new GpuUiPresenter(backendOn(f));
    const a = frame(1), b = frame(2);
    p.present(listFor(a), () => null, OPTIONS);
    const gone = release(a);
    // The layer still holds `a` (no successor out yet): the planner's movieFramePicture gives null -- the black quad.
    const from = f.calls.length;
    p.present(listFor(a), () => null, OPTIONS);
    expect(p.last!.path).toBe('gpu');
    expect(movieUploads(f, from).length).toBe(0);
    expect(diff(p.readFrame()!.data, rasterizeUiDrawList(listFor(a), () => null, OPTIONS).frame.data)).toBe(0);
    // Its successor: uploaded; no call anywhere read the released buffer after it was released.
    p.present(listFor(b), () => null, OPTIONS);
    expect(movieUploads(f, from).map((u) => u.src.buffer)).toEqual([bufferOf(b)]);
    for (const c of f.calls.slice(from)) for (const arg of c) if (ArrayBuffer.isView(arg)) expect(arg.buffer).not.toBe(gone);
    expect(diff(p.readFrame()!.data, rasterizeUiDrawList(listFor(b), () => null, OPTIONS).frame.data)).toBe(0);
  });

  it('a plan whose picture was released after it was planned is refused (never uploaded, never drawn)', () => {
    const f = fakeGl(), b = backendOn(f);
    const a = frame(1), plan = planFrame(listFor(a), () => null, OPTIONS);
    release(a);
    expect(b.refusal(plan)).toMatch(/released/);
    expect(() => b.draw(plan)).toThrow(/released/);
    expect(movieUploads(f).length).toBe(0);
  });

  it('at most one picture per tick: a 29.97 Hz movie under a 59.94 Hz render uploads each picture once, in its first render', () => {
    const layer = new MovieLayer(), f = fakeGl(), p = new GpuUiPresenter(backendOn(f));
    const shown: MoviePicture[] = [];
    let previous: MoviePicture | null = null;
    for (let tick = 0; tick < 60; tick++) {
      if (tick % 2 === 0) {                              // one new picture every other render tick
        const next = frame(tick / 2);
        layer.present(next);
        if (previous) release(previous);                 // the worker takes the last one's buffer back
        previous = next;
        shown.push(next);
      }
      const from = f.calls.length;
      p.present(listFor(layer.picture()), () => null, OPTIONS);
      const ups = movieUploads(f, from);
      expect(ups.length, `tick ${tick}`).toBe(tick % 2 === 0 ? 1 : 0);
      if (ups.length) expect(ups[0]!.src.buffer).toBe(bufferOf(layer.picture()!));
      expect(diff(p.readFrame()!.data, rasterizeUiDrawList(listFor(layer.picture()), () => null, OPTIONS).frame.data), `tick ${tick}`).toBe(0);
    }
    expect(movieUploads(f).length).toBe(shown.length);
    // The pictures share the movie's textures: as many as UI_GPU_MOVIE_TEXTURES_ADAPTATION, never one per picture.
    expect(f.textures.filter((t) => t.format === GL.RGBA8UI && t.w === 6 && t.h === 4).length).toBe(UI_GPU_MOVIE_TEXTURES_ADAPTATION);
    expect(p.backend.movieStats).toEqual({ uploads: 30, uploadsLastFrame: 0, maxUploadsInAFrame: 1, textures: UI_GPU_MOVIE_TEXTURES_ADAPTATION });
   }, 120_000);   // 60 renders, each drawn on the fake and rastered by the software at 2x

  it('a new picture goes to the texture the last frame did not draw from; the one shown before it is kept and not re-uploaded', () => {
    const f = fakeGl(), p = new GpuUiPresenter(backendOn(f));
    const a = frame(1), b = frame(2);
    p.present(listFor(a), () => null, OPTIONS);
    p.present(listFor(b), () => null, OPTIONS);
    const [da, db] = movieDraws(f);
    expect(db!.units[UI_GPU_MOVIE_UNIT]).not.toBe(da!.units[UI_GPU_MOVIE_UNIT]);
    p.present(listFor(a), () => null, OPTIONS);        // a still live and still held: drawn from its texture
    expect(movieUploads(f).length).toBe(2);
    expect(movieDraws(f)[2]!.units[UI_GPU_MOVIE_UNIT]).toBe(da!.units[UI_GPU_MOVIE_UNIT]);
    expect(diff(p.readFrame()!.data, rasterizeUiDrawList(listFor(a), () => null, OPTIONS).frame.data)).toBe(0);
  });

  it('a picture of a new size re-makes its texture (immutable storage), the old deleted', () => {
    const f = fakeGl(), p = new GpuUiPresenter(backendOn(f));
    p.present(listFor(frame(1)), () => null, OPTIONS);
    p.present(listFor(frame(2)), () => null, OPTIONS);
    p.present(listFor(frame(3, 8, 5)), () => null, OPTIONS);
    const movies = f.textures.filter((t) => t.format === GL.RGBA8UI && t.w > 1);
    expect(movies.filter((t) => !t.deleted).map((t) => `${t.w}x${t.h}`).sort()).toEqual(['6x4', '8x5']);
    expect(movies.filter((t) => t.deleted).map((t) => `${t.w}x${t.h}`)).toEqual(['6x4']);
    expect(diff(p.readFrame()!.data, rasterizeUiDrawList(listFor(frame(3, 8, 5)), () => null, OPTIONS).frame.data)).toBe(0);
  });

  it('refuses a plan with more distinct pictures than the movie\'s textures, or a picture past MAX_TEXTURE_SIZE (L1, named)', () => {
    const many: UiDrawItem[] = Array.from({ length: UI_GPU_MOVIE_TEXTURES_ADAPTATION + 1 }, (_, k) => listFor(frame(k))[0]!);
    const b = backendOn(fakeGl());
    expect(b.refusal(planFrame(many, () => null, OPTIONS))).toMatch(/UI_GPU_MOVIE_TEXTURES_ADAPTATION/);
    // The frame (640 x 448 at 1) fits a 650 limit; a 700-wide picture does not.
    const big = backendOn(fakeGl({ maxTexture: 650 }));
    expect(big.refusal(planFrame(listFor(frame(1, 700, 2)), () => null, { scale: 1, movie: movieFramePicture }))).toMatch(/picture .*MAX_TEXTURE_SIZE/);
  });

  it('dispose deletes the movie\'s textures and program', () => {
    const f = fakeGl(), b = backendOn(f);
    b.draw(planFrame(listFor(frame(1)), () => null, OPTIONS));
    b.draw(planFrame(listFor(frame(2)), () => null, OPTIONS));
    b.dispose();
    expect(f.textures.filter((t) => !t.deleted).length).toBe(0);
    expect(f.programs.filter((x) => x.name === 'movie').every((x) => x.deleted)).toBe(true);
  });

  it('a hidden tick draws nothing and uploads nothing: the picture presented meanwhile is uploaded by the render that shows it', () => {
    const layer = new MovieLayer(), f = fakeGl(), p = new GpuUiPresenter(backendOn(f));
    layer.present(frame(1));
    layer.present(frame(2));                            // two ticks presented while no render ran (GM.R17: hidden)
    const plan: UiFramePlan = planFrame(listFor(layer.picture()), () => null, OPTIONS);
    expect(plan.movies.length).toBe(1);
    p.present(listFor(layer.picture()), () => null, OPTIONS);
    expect(movieUploads(f).map((u) => u.src.buffer)).toEqual([bufferOf(layer.picture()!)]);
    expect((movieFramePicture(layer.picture()!) as Rgba).width).toBe(6);
  });
});
