import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Rgba } from '@s2u/gs';
import type { UiDrawItem, UiModelTriangle } from '@s2u/ui';
import { rasterizeUiDrawList } from '../src/uiCompositorView';
import { UI_GPU_BASE_STEPS, GpuUiPresenter, divideTransparentFrame, uiGpuFrameFallbackOptions, upscaleFrameNearest } from '../src/uiGpuPresenter';
import { UI_GPU_CONTEXT_ATTRIBUTES_ADAPTATION, UI_GPU_TIMER_PENDING_ADAPTATION, UiGpuBackend, createUiGpuBackend } from '../src/uiGpuWebgl2';
import { clearBytes } from '../src/uiRasterRules';
import { executeFramePlanOnTwin } from '../src/uiGpuTwin';
import { UI_GPU_FRAME_FALLBACK_SCALE_ADAPTATION, planFrame, type UiFramePlan } from '../src/uiFramePlan';
import { GL, fakeGl, type Fake } from './uiGpuFakeGl';
import {
  UI_RASTER_CASES, UI_RASTER_CASE_MODES, UI_RASTER_CASE_SCALES, UI_RASTER_PREDIVIDE_CASES, UI_SEAM_CLEAR, UI_SEAM_TEXEL, caseRasterInputs, caseRunKey,
  seamPixels, seamSquares, solid,
} from './uiRasterCases';

// GM-11a-1 (plan 2026-11-01-gpu-menus; research 380 P15, "Frame conventions"): the WebGL2 base -- the context, the frame
// FBO, the clear, the present blit, the software-frame upload and `readPixels` -- held here by its CALL CONTRACT on a
// fake WebGL2 context (Node has no GPU; no browser runs on this host). The fake records every call and keeps the images
// a real context would (textures, the default framebuffer), with the state that changes their bytes honoured (scissor,
// colour mask, rasterizer discard, the unpack flip and premultiply), so a missing state reset fails a byte test here.
// What the fake cannot say -- how a real GPU converts `k / 255` to a byte, the real blit -- is the browser smoke spec's
// (`e2e/uiGpuHarness.spec.ts`, written, run on the box: GM-11b's seat). Evidence kind: unit test.

// The fake WebGL2 context is shared with GM-11a-2's tests (`./uiGpuFakeGl.ts`, moved there unchanged in what it keeps).

const backendOn = (f: Fake, transparent = false): UiGpuBackend => {
  const b = createUiGpuBackend(f.canvas as unknown as HTMLCanvasElement, { transparent });
  if (!b) throw new Error('no backend');
  return b;
};
const seeded = (n: number, seed: number): Uint8ClampedArray => {
  const d = new Uint8ClampedArray(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = s >>> 24; }
  return d;
};
const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
  if (a.length !== b.length) return -1;
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
};
const clearItem = (rgb: [number, number, number]): UiDrawItem => ({ kind: 'clear', rgb });
const CASE_9 = UI_RASTER_CASES.find((c) => c.id === 9)!;
/**
 * GM-15a: a list's models moved behind the eye (every vertex's `invW` negated, so <= 0): a plan the GPU still leaves L1,
 * named by the planner (the depth's clear to 0 cannot hold the software's "0 = empty"; GM-15b's) -- the L1 frame these
 * tests need now that the model cases are drawn on the GPU.
 */
const behindTheEye = (items: readonly UiDrawItem[]): UiDrawItem[] => items.map((it) => (it.kind === 'models' && it.triangles
  ? { ...it, triangles: it.triangles.map((t) => ({ ...t, a: { ...t.a, invW: -t.a.invW }, b: { ...t.b, invW: -t.b.invW }, c: { ...t.c, invW: -t.c.invW } })) }
  : it));

describe('GM-11a-1: the context', () => {
  it('asks for WebGL2 with the attributes the plan names (UI_GPU_CONTEXT_ATTRIBUTES_ADAPTATION)', () => {
    for (const transparent of [false, true]) {
      const f = fakeGl();
      backendOn(f, transparent);
      expect(f.calls[0]![0]).toBe('getContext');
      expect(f.calls[0]![1]).toBe('webgl2');
      expect(f.attrs()).toEqual(UI_GPU_CONTEXT_ATTRIBUTES_ADAPTATION(transparent));
      // The plan: `#front-end-gpu` opaque, the overlay `alpha: true, premultipliedAlpha: true`; no MSAA (a blit into a
      // multisampled default framebuffer is an INVALID_OPERATION), no depth or stencil on the canvas (the frame FBO's).
      expect(f.attrs()).toMatchObject({ alpha: transparent, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    }
  });

  it('gives null where the browser has no WebGL2 (the caller stays on the software path)', () => {
    const f = fakeGl({ noContext: true });
    expect(createUiGpuBackend(f.canvas as unknown as HTMLCanvasElement, { transparent: false })).toBeNull();
  });
});

describe('GM-11a-1: the frame FBO', () => {
  it('is one RGBA8 texture of the frame size (texStorage2D, NEAREST, CLAMP), attached and checked complete', () => {
    const f = fakeGl(), b = backendOn(f);
    b.begin(640, 448, false);
    const n = f.names();
    expect(n.filter((x) => x === 'createTexture')).toHaveLength(1);
    expect(f.calls.find((c) => c[0] === 'texStorage2D')).toEqual(['texStorage2D', GL.TEXTURE_2D, 1, GL.RGBA8, 640, 448]);
    expect(f.calls).toContainEqual(['texParameteri', GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST]);
    expect(f.calls).toContainEqual(['texParameteri', GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.NEAREST]);
    const tex = f.textures[0]!;
    expect(f.calls).toContainEqual(['framebufferTexture2D', GL.FRAMEBUFFER, GL.COLOR_ATTACHMENT0, GL.TEXTURE_2D, tex.id, 0]);
    expect(n).toContain('checkFramebufferStatus');
    expect(b.frameSize).toEqual({ width: 640, height: 448 });
  });

  it('is kept across frames of one size, and replaced (the old deleted) when the size changes', () => {
    const f = fakeGl(), b = backendOn(f);
    b.begin(640, 448, false);
    b.begin(640, 448, false);
    expect(f.textures).toHaveLength(1);
    expect(f.framebuffers).toHaveLength(1);
    b.begin(1280, 896, false);
    expect(f.textures).toHaveLength(2);
    expect(f.textures[0]!.deleted).toBe(true);
    expect(f.framebuffers[0]!.deleted).toBe(true);
    expect(b.frameSize).toEqual({ width: 1280, height: 896 });
  });

  it('throws on an incomplete framebuffer, deleting what it made', () => {
    const f = fakeGl({ incomplete: true }), b = backendOn(f);
    expect(() => b.begin(640, 448, false)).toThrow(/incomplete/);
    expect(f.textures.every((t) => t.deleted)).toBe(true);
    expect(f.framebuffers.every((x) => x.deleted)).toBe(true);
  });

  it('starts each frame as the software does: opaque (0, 0, 0, 255), transparent all zero', () => {
    for (const transparent of [false, true]) {
      const f = fakeGl(), b = backendOn(f, transparent);
      b.begin(640, 448, transparent);
      const ref = rasterizeUiDrawList([], () => null, { transparent }).frame;
      expect(diff(b.readPixels().data, ref.data)).toBe(0);
    }
  });

  it('refuses a frame whose transparency is not the canvas\'s (an opaque canvas would show a transparent frame wrong)', () => {
    const f = fakeGl(), b = backendOn(f, false);
    expect(() => b.begin(640, 448, true)).toThrow(/transparent/);
  });
});

describe('GM-11a-1: the clear (P15)', () => {
  it('writes clearColor(k / 255) under a state that cannot change it: no scissor, dither or discard, every channel', () => {
    const f = fakeGl(), b = backendOn(f);
    // Hostile state left by someone else: every bit the clear honours, set against it.
    f.gl.enable(GL.SCISSOR_TEST); f.gl.scissor(0, 0, 1, 1); f.gl.colorMask(false, false, false, false); f.gl.enable(GL.RASTERIZER_DISCARD);
    b.begin(640, 448, false);
    b.clear([10, 20, 30, 255]);
    const last = f.clears.at(-1)!;
    expect(last.target).toBe('fbo');
    expect(last.color).toEqual([10 / 255, 20 / 255, 30 / 255, 1]);
    expect(last.mask).toEqual([true, true, true, true]);
    for (const cap of [GL.SCISSOR_TEST, GL.DITHER, GL.RASTERIZER_DISCARD]) expect(last.enabled).not.toContain(cap);
    expect(diff(b.readPixels().data, rasterizeUiDrawList([clearItem([10, 20, 30])], () => null).frame.data)).toBe(0);
  });

  it('every byte value 0..255 on every channel round-trips (the fake rounds to nearest; the box shows the GPU)', () => {
    const f = fakeGl(), b = backendOn(f);
    b.begin(640, 448, false);
    for (let k = 0; k < 256; k++) {
      const rgb: [number, number, number] = [k, 255 - k, (k * 37) % 256];
      b.clear([...clearBytes(rgb)]);
      const px = b.readPixels().data;
      expect([px[0], px[1], px[2], px[3]]).toEqual([...clearBytes(rgb)]);
    }
  }, 30_000);   // GM-12a: 256 whole-frame clears and read-backs on the fake take ~3 s alone; vitest's 5 s default timed out under a parallel run

  it('refuses bytes that are not whole bytes (the plan carries the packed bytes, never a colour)', () => {
    const f = fakeGl(), b = backendOn(f);
    b.begin(640, 448, false);
    expect(() => b.clear([1.5, 0, 0, 255])).toThrow(/byte/);
    expect(() => b.clear([256, 0, 0, 255])).toThrow(/byte/);
  });
});

describe('GM-11a-1: the software-frame upload and readPixels', () => {
  it('round-trips every byte, top row first, unflipped and not premultiplied, whatever unpack state was left', () => {
    for (const scale of [1, 2, 4]) for (const transparent of [false, true]) {
      const f = fakeGl(), b = backendOn(f, transparent);
      f.gl.pixelStorei(GL.UNPACK_FLIP_Y_WEBGL, true); f.gl.pixelStorei(GL.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); f.gl.pixelStorei(GL.PACK_ALIGNMENT, 8);
      const W = 640 * scale, H = 448 * scale;
      const frame: Rgba = { width: W, height: H, data: seeded(W * H * 4, scale * 7 + (transparent ? 1 : 0)) };
      b.uploadFrame(frame, transparent);
      const back = b.readPixels();
      expect([back.width, back.height]).toEqual([W, H]);
      expect(diff(back.data, frame.data)).toBe(0);
    }
  });

  it('uploads the frame\'s own bytes in one texSubImage2D (no copy), after the unpack state is set', () => {
    const f = fakeGl(), b = backendOn(f);
    const frame: Rgba = { width: 640, height: 448, data: seeded(640 * 448 * 4, 3) };
    b.uploadFrame(frame, false);
    const up = f.calls.filter((c) => c[0] === 'texSubImage2D');
    expect(up).toHaveLength(1);
    const [, target, level, x, y, w, h, fmt, type, src] = up[0]!;
    expect([target, level, x, y, w, h, fmt, type]).toEqual([GL.TEXTURE_2D, 0, 0, 0, 640, 448, GL.RGBA, GL.UNSIGNED_BYTE]);
    expect((src as Uint8Array).buffer).toBe(frame.data.buffer);
    const at = f.calls.indexOf(up[0]!);
    const before = f.calls.slice(0, at);
    for (const [p, v] of [[GL.UNPACK_FLIP_Y_WEBGL, false], [GL.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false], [GL.UNPACK_COLORSPACE_CONVERSION_WEBGL, GL.NONE],
      [GL.UNPACK_ALIGNMENT, 1], [GL.UNPACK_ROW_LENGTH, 0], [GL.UNPACK_SKIP_ROWS, 0], [GL.UNPACK_SKIP_PIXELS, 0]] as const) {
      expect(before).toContainEqual(['pixelStorei', p, v]);
    }
    expect(before).toContainEqual(['bindBuffer', GL.PIXEL_UNPACK_BUFFER, null]);
  });

  it('sizes the frame target to the uploaded frame (an L1 frame at 1x under HD, scaled, is GM-14a\'s), and refuses a short buffer', () => {
    const f = fakeGl(), b = backendOn(f);
    b.begin(1280, 896, false);
    expect(() => b.uploadFrame({ width: 641, height: 448, data: new Uint8ClampedArray(641 * 448 * 4) }, false)).not.toThrow();
    expect(b.frameSize).toEqual({ width: 641, height: 448 });
    expect(() => b.uploadFrame({ width: 640, height: 448, data: new Uint8ClampedArray(10) }, false)).toThrow(/bytes/);
  });

  it('reads the frame FBO (not the canvas) whole, row y = GL row y, PACK_ALIGNMENT 1, no pack buffer', () => {
    const f = fakeGl(), b = backendOn(f);
    b.begin(640, 448, false);
    b.readPixels();
    const at = f.calls.findIndex((c) => c[0] === 'readPixels');
    expect(f.calls[at]).toEqual(['readPixels', 0, 0, 640, 448, GL.RGBA, GL.UNSIGNED_BYTE]);
    const before = f.calls.slice(0, at);
    expect(before).toContainEqual(['bindFramebuffer', GL.READ_FRAMEBUFFER, f.framebuffers[0]!.id]);
    expect(before).toContainEqual(['readBuffer', GL.COLOR_ATTACHMENT0]);
    expect(before).toContainEqual(['pixelStorei', GL.PACK_ALIGNMENT, 1]);
    expect(before).toContainEqual(['bindBuffer', GL.PIXEL_PACK_BUFFER, null]);
  });

  it('reads nothing before the first frame', () => {
    const f = fakeGl(), b = backendOn(f);
    expect(() => b.readPixels()).toThrow(/no frame/);
  });
});

describe('GM-11a-1: the present blit', () => {
  it('sizes the canvas to the frame and blits it 1:1, NEAREST, flipped once (frame row 0 at the top)', () => {
    const f = fakeGl(), b = backendOn(f);
    const frame: Rgba = { width: 640, height: 448, data: seeded(640 * 448 * 4, 11) };
    b.uploadFrame(frame, false);
    b.present();
    expect([f.canvas.width, f.canvas.height]).toEqual([640, 448]);
    const at = f.calls.findIndex((c) => c[0] === 'blitFramebuffer');
    expect(f.calls[at]).toEqual(['blitFramebuffer', 0, 0, 640, 448, 0, 448, 640, 0, GL.COLOR_BUFFER_BIT, GL.NEAREST]);
    const before = f.calls.slice(0, at);
    expect(before).toContainEqual(['bindFramebuffer', GL.READ_FRAMEBUFFER, f.framebuffers[0]!.id]);
    expect(before).toContainEqual(['bindFramebuffer', GL.DRAW_FRAMEBUFFER, null]);
    // The default framebuffer's GL row H - 1 (the page's top row) is the frame's row 0.
    const shown = f.backbuffer();
    for (const y of [0, 1, 223, 447]) {
      const glRow = 447 - y;
      expect(diff(new Uint8ClampedArray(shown.data.subarray(glRow * 640 * 4, (glRow + 1) * 640 * 4)), frame.data.subarray(y * 640 * 4, (y + 1) * 640 * 4))).toBe(0);
    }
  });

  it('blits under a full colour mask and no scissor, and leaves the canvas size alone when it already fits', () => {
    const f = fakeGl(), b = backendOn(f);
    b.begin(640, 448, false);
    b.present();
    f.gl.colorMask(false, true, true, true); f.gl.enable(GL.SCISSOR_TEST);
    const widthSets: number[] = [];
    let w = f.canvas.width;
    Object.defineProperty(f.canvas, 'width', { get: () => w, set: (v: number) => { widthSets.push(v); w = v; }, configurable: true });
    b.present();
    expect(widthSets).toEqual([]);
    expect(f.st.mask).toEqual([true, true, true, true]);
    expect(f.st.enabled.has(GL.SCISSOR_TEST)).toBe(false);
  });

  // GM-11b box fold (the box at 5650fe4fc: uiGpuHarness.spec.ts:132 read 856809 of 860160 RGB bytes differing at 1x --
  // exactly the seeded frame's non-zero bytes, an all-zero canvas -- and every GPU frame of uiGpuLoss.spec.ts black):
  // under `preserveDrawingBuffer: false` the composited canvas owes a clear that a blit does not pay, so the next read
  // wipes the blit. The present pays it first with a clear of the default framebuffer, which the blit then covers.
  it('a present after the page composited still shows the frame (the owed clear paid before the blit, not after it)', () => {
    const f = fakeGl(), b = backendOn(f);
    b.uploadFrame({ width: 640, height: 448, data: seeded(640 * 448 * 4, 5) }, false);
    b.present();
    f.composite();
    const frame: Rgba = { width: 640, height: 448, data: seeded(640 * 448 * 4, 2001) };
    b.uploadFrame(frame, false);
    f.gl.enable(GL.RASTERIZER_DISCARD);                  // left by another draw: the present's clear must not be ignored
    b.present();
    const shown = f.backbuffer();
    let differ = 0;
    for (let y = 0; y < 448; y++) {
      const glRow = 447 - y;
      differ += diff(new Uint8ClampedArray(shown.data.subarray(glRow * 640 * 4, (glRow + 1) * 640 * 4)), frame.data.subarray(y * 640 * 4, (y + 1) * 640 * 4));
    }
    expect(differ).toBe(0);
    const last = (pred: (c: unknown[], i: number) => boolean, before = f.calls.length): number => {
      for (let i = before - 1; i >= 0; i--) if (pred(f.calls[i]!, i)) return i;
      return -1;
    };
    const at = last((c) => c[0] === 'blitFramebuffer');
    const clearAt = last((c) => c[0] === 'clear', at);
    expect(clearAt).toBeGreaterThan(last((c) => c[0] === 'bindFramebuffer' && c[1] === GL.DRAW_FRAMEBUFFER && c[2] === null, at));
    expect(f.clears.at(-1)!.target).toBe('default');
  });

  it('presents nothing before the first frame', () => {
    const f = fakeGl(), b = backendOn(f);
    expect(() => b.present()).toThrow(/no frame/);
  });
});

describe('GM-11a-1: dispose', () => {
  it('deletes the frame target; a disposed backend refuses work', () => {
    const f = fakeGl(), b = backendOn(f);
    b.begin(640, 448, false);
    b.dispose();
    expect(f.textures.every((t) => t.deleted)).toBe(true);
    expect(f.framebuffers.every((x) => x.deleted)).toBe(true);
    expect(() => b.begin(640, 448, false)).toThrow(/disposed/);
    expect(() => b.dispose()).not.toThrow();
  });
});

describe('GM-11a-1: GpuUiPresenter over the base', () => {
  const presenterOn = (transparent: boolean) => {
    const f = fakeGl();
    const p = new GpuUiPresenter(backendOn(f, transparent));
    return { f, p };
  };

  it('draws a plan of clears on the GPU: case 9\'s clear at 1/2/4, both modes, equal to the software (E)', () => {
    const rgb = (CASE_9.data().items.find((i) => i.kind === 'clear') as Extract<UiDrawItem, { kind: 'clear' }>).rgb;
    for (const scale of UI_RASTER_CASE_SCALES) for (const mode of UI_RASTER_CASE_MODES) {
      const transparent = mode === 'transparent';
      const { f, p } = presenterOn(transparent);
      const items = [clearItem([rgb[0], rgb[1], rgb[2]])];
      const ref = rasterizeUiDrawList(items, () => null, { scale, transparent });
      const out = p.present(items, () => null, { scale, transparent });
      expect(p.last?.path).toBe('gpu');
      expect(f.names()).not.toContain('texSubImage2D');
      // GM-19a re-pin: a transparent frame reaches its canvas by the premultiplied present's draw
      // (`UI_GPU_PREMULTIPLIED_PRESENT_ADAPTATION`, `test/uiGpuPremultipliedPresent.test.ts`); an opaque one by the blit.
      if (transparent) expect(f.calls).toContainEqual(['drawArrays', GL.TRIANGLES, 0, 3]);
      else expect(f.names()).toContain('blitFramebuffer');
      expect([out.width, out.height]).toEqual([ref.frame.width, ref.frame.height]);
      expect(diff(p.readFrame()!.data, ref.frame.data)).toBe(0);
    }
  });

  /** The plan the presenter draws for these inputs (its own call, `GpuUiPresenter.present`). */
  const planOf = (items: readonly UiDrawItem[], textures: Parameters<typeof planFrame>[1], options: Parameters<GpuUiPresenter['present']>[2] = {}) =>
    planFrame(items, textures, { scale: options.scale, transparent: options.transparent === true, hd: options.hd, movie: options.movie, uiSampling: options.uiSampling });

  // GM-13: split per case (as GM-11a-2's every-case test was, `uiGpuShaders.test.ts`): run whole it held the worker ~40 s
  // and vitest's "Timeout calling onTaskUpdate" came back in a wide run; a macrotask between cases lets the worker answer.
  const tally = { gpu: 0, software: 0, runs: 0 };
  // GM-14a (GM.R9): an L1 frame under HD is the software at 1x (UI_GPU_FRAME_FALLBACK_SCALE_ADAPTATION), each pixel s x s.
  const l1Frame = (items: readonly UiDrawItem[], textures: Parameters<typeof rasterizeUiDrawList>[1], options: Parameters<typeof rasterizeUiDrawList>[2] & object, at: number, preDivide = false): Rgba => {
    const scale = options.scale ?? 1;
    const f = rasterizeUiDrawList(items, textures, { ...uiGpuFrameFallbackOptions(options, at), ...(preDivide ? { preDivide: true } : {}) }).frame;
    return upscaleFrameNearest(f, scale / at);
  };
  describe('draws every GM-03 case at 1/2/4, both modes: on the GPU equal to the twin and to the software on the twin exact class, else L1 equal to the software (at 1x under HD, GM-14a)', () => {
    beforeEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    it.each(UI_RASTER_CASES.map((c, i) => [c.id, i] as const))('case %i (entry %i)', (_id, index) => {
      const c = UI_RASTER_CASES[index]!;
      for (const scale of UI_RASTER_CASE_SCALES) for (const mode of UI_RASTER_CASE_MODES) {
        const { items, textures, options } = caseRasterInputs(c, scale, mode);
        const { p } = presenterOn(mode === 'transparent');
        const ref = rasterizeUiDrawList(items, textures, options);
        const out = p.present(items, textures, options);
        const got = p.readFrame()!, key = caseRunKey(c, scale, mode);
        tally.runs++;
        if (p.last!.path === 'gpu') {
          tally.gpu++;
          // GM-11a-2: the fake's programs run the twin's arithmetic, so the GPU frame is the twin's, byte for byte; the
          // software's bytes hold on the twin's exact class (research 380 §1, E/E*); the rest is B, the box's to bound.
          const twin = executeFramePlanOnTwin(planOf(items, textures, options));
          expect(diff(got.data, twin.frame.data), key).toBe(0);
          let exactDiffering = 0;
          for (let q = 0; q < twin.exact.length; q++) {
            if (!twin.exact[q]) continue;
            for (let k = 0; k < 4; k++) if (got.data[q * 4 + k] !== ref.frame.data[q * 4 + k]) { exactDiffering++; break; }
          }
          expect(exactDiffering, `${key}: the exact class`).toBe(0);
        } else {
          tally.software++;
          expect(p.last!.drawnAt, key).toBe(UI_GPU_FRAME_FALLBACK_SCALE_ADAPTATION.scale);
          expect(diff(got.data, l1Frame(items, textures, options, p.last!.drawnAt!).data), key).toBe(0);
          expect([out.width, out.height], key).toEqual([ref.frame.width, ref.frame.height]);
          expect(p.last!.why.length).toBeGreaterThan(0);
          // GM-13: no case waits on the per-frame upload budget (its textures are far below it)
          expect(p.last!.why.join(' '), key).not.toMatch(/HD_UI_UPLOAD_BYTES_PER_FRAME_ADAPTATION/);
        }
        expect(out.undrawn).toEqual(ref.undrawn);
        expect(p.undrawn()).toEqual(ref.undrawn);
      }
    }, 120_000);
    it('every case ran at every scale and mode, every one on the GPU (GM-15a: the model cases too)', (ctx) => {
      // GM-14a re-review (2): this closer reads the pieces' tally, so it means nothing unless every piece ran first.
      ctx.skip(tally.runs !== UI_RASTER_CASES.length * 6, `needs every case piece to run first: ${tally.runs} of ${UI_RASTER_CASES.length * 6} ran (the file run alone, or -t)`);
      // GM-11a-2 draws the clears and quads, GM-11a-3 the movie pictures, GM-15a the models: no case is L1 now. The L1
      // path through this presenter is held by the next test (a model behind the eye: the planner's named L1).
      expect(tally.runs).toBe(UI_RASTER_CASES.length * 6);
      expect(tally.gpu + tally.software).toBe(UI_RASTER_CASES.length * 6);
      expect(tally.gpu).toBe(UI_RASTER_CASES.length * 6);
      expect(tally.software).toBe(0);
    });
  });

  it('names why a frame went to the software (L1): case 2\'s models behind the eye (invW <= 0, the planner\'s named L1), the frame the software\'s', () => {
    for (const scale of UI_RASTER_CASE_SCALES) {
      const { p } = presenterOn(false);
      const { items: drawn, textures, options } = caseRasterInputs(UI_RASTER_CASES.find((c) => c.id === 2)!, scale, 'opaque');
      const items = behindTheEye(drawn);
      p.present(items, textures, options);
      expect(p.last!.path, `${scale}x`).toBe('software');
      expect(p.last!.why.join(' '), `${scale}x`).toMatch(/invW <= 0/);
      expect(p.last!.drawnAt, `${scale}x`).toBe(UI_GPU_FRAME_FALLBACK_SCALE_ADAPTATION.scale);
      expect(diff(p.readFrame()!.data, l1Frame(items, textures, options, p.last!.drawnAt!).data), `${scale}x`).toBe(0);
      // The same case in front of the eye is drawn on the GPU (GM-15a).
      const { p: q } = presenterOn(false);
      q.present(drawn, textures, options);
      expect(q.last!.path, `${scale}x in front`).toBe('gpu');
    }
  });

  // GM-14a review F1: split per case and scale (as the every-case test above, GM-13): whole it ran 5.0-5.4 s, at the 5 s
  // default, once L1 under HD added the 1x raster and the scaled reference; a macrotask between pieces lets the worker answer.
  const transparentTally = { l1: 0, gpu: 0 };
  const TRANSPARENT_RUNS = UI_RASTER_PREDIVIDE_CASES.flatMap((c) => UI_RASTER_CASE_SCALES.map((scale) => [c.key, scale] as const));
  // GM-15a: case 17's model is drawn on the GPU now; its L1 leg is the same list with the model behind the eye (`l1`).
  type TransparentPiece = readonly [string, (typeof UI_RASTER_CASE_SCALES)[number], 'as listed' | 'l1'];
  const L1_RUNS: TransparentPiece[] = UI_RASTER_CASE_SCALES.map((scale) => ['17', scale, 'l1'] as const);
  const TRANSPARENT_PIECES: TransparentPiece[] = [...TRANSPARENT_RUNS.map(([key, scale]): TransparentPiece => [key, scale, 'as listed']), ...L1_RUNS];
  describe('a transparent frame is held before its divide -- L1 uploaded so (case 17 behind the eye), drawn so on the GPU (cases 4, 17, 19) -- and readFrame divides it (P22)', () => {
    beforeEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    it.each(TRANSPARENT_PIECES)('case %s at %ix (%s)', (key, scale, variant) => {
      const c = UI_RASTER_PREDIVIDE_CASES.find((x) => x.key === key)!;
      const { f, p } = presenterOn(true);
      const inputs = caseRasterInputs(c, scale, 'transparent'), { textures, options } = inputs;
      const items = variant === 'l1' ? behindTheEye(inputs.items) : inputs.items;
      p.present(items, textures, options);
      if (variant === 'l1') expect(p.last!.path, 'the model behind the eye is L1').toBe('software');
      if (p.last!.path === 'software') {
        transparentTally.l1++;
        // GM-14a: the frame uploaded is the 1x software's before its divide; the target holds it s x s.
        const at = p.last!.drawnAt!;
        const pre = rasterizeUiDrawList(items, textures, { ...uiGpuFrameFallbackOptions(caseRasterInputs(c, scale, 'transparent', true).options, at) }).frame;
        const up = f.calls.find((x) => x[0] === 'texSubImage2D')!;
        expect(diff(new Uint8ClampedArray((up[9] as Uint8Array).buffer), pre.data)).toBe(0);
        expect(diff(p.backend.readPixels().data, upscaleFrameNearest(pre, scale / at).data)).toBe(0);
        expect(diff(p.readFrame()!.data, l1Frame(items, textures, options, at).data)).toBe(0);
      } else {
        transparentTally.gpu++;
        const plan = planOf(items, textures, options);
        expect(diff(p.backend.readPixels().data, executeFramePlanOnTwin(plan, { divide: false }).frame.data)).toBe(0);
        expect(diff(p.readFrame()!.data, executeFramePlanOnTwin(plan).frame.data)).toBe(0);
      }
    });
    it('both paths taken', (ctx) => {
      // GM-14a re-review (2): this closer reads the pieces' tally, so it means nothing unless every piece ran first.
      const ran = transparentTally.l1 + transparentTally.gpu, runs = TRANSPARENT_RUNS.length + L1_RUNS.length;
      ctx.skip(ran !== runs, `needs every case-and-scale piece to run first: ${ran} of ${runs} ran (the file run alone, or -t)`);
      expect(transparentTally.l1 + transparentTally.gpu).toBe(runs);
      // GM-15a: the listed cases on the GPU, every one; the L1 runs are the behind-the-eye legs.
      expect(transparentTally.l1).toBe(L1_RUNS.length);
      expect(transparentTally.gpu).toBe(TRANSPARENT_RUNS.length);
    });
  });

  it('divideTransparentFrame is the software\'s P22 divide, byte for byte (uiCompositorView rasterizeUiDrawList\'s tail)', () => {
    for (const c of UI_RASTER_PREDIVIDE_CASES) for (const scale of UI_RASTER_CASE_SCALES) {
      const pre = caseRasterInputs(c, scale, 'transparent', true), post = caseRasterInputs(c, scale, 'transparent');
      const a = rasterizeUiDrawList(pre.items, pre.textures, pre.options).frame.data;
      divideTransparentFrame(a);
      expect(diff(a, rasterizeUiDrawList(post.items, post.textures, post.options).frame.data)).toBe(0);
    }
    const all = new Uint8ClampedArray(256 * 256 * 4);
    for (let a = 0; a < 256; a++) for (let v = 0; v < 256; v++) { const i = (a * 256 + v) * 4; all[i] = v; all[i + 1] = v; all[i + 2] = v; all[i + 3] = a; }
    const mine = all.slice(); divideTransparentFrame(mine);
    const theirs = all.slice();
    for (let i = 0; i < theirs.length; i += 4) { const a = theirs[i + 3]! / 255; if (a > 0 && a < 1) { theirs[i] = theirs[i]! / a; theirs[i + 1] = theirs[i + 1]! / a; theirs[i + 2] = theirs[i + 2]! / a; } }
    expect(diff(mine, theirs)).toBe(0);
  });

  it('refuses preDivide (a comparison frame, as the CPU presenter does) and reads nothing before the first present', () => {
    const { p } = presenterOn(true);
    expect(p.readFrame()).toBeNull();
    expect(p.undrawn()).toEqual([]);
    expect(() => p.present([clearItem([1, 2, 3])], () => null, { transparent: true, preDivide: true })).toThrow(/preDivide/);
  });

  it('times the frame through the probe: the draw (plan + GPU or raster + upload) and the present apart', () => {
    const { p } = presenterOn(false);
    let t = 0;
    const seen: number[][] = [];
    p.present([clearItem([1, 2, 3])], () => null, {}, { now: () => (t += 1), rendered: (a, b) => seen.push([a, b]) });
    expect(seen).toEqual([[1, 1]]);
  });

  it('names itself `gpu` and lists the steps the backend draws (clears; copies and quads from GM-11a-2; movie pictures from GM-11a-3; the models\' pass and triangles from GM-15a)', () => {
    const { p } = presenterOn(false);
    expect(p.kind).toBe('gpu');
    expect([...UI_GPU_BASE_STEPS]).toEqual(['clear', 'copy', 'quads', 'movie', 'pass', 'triangles']);
  });
});

describe('GM-11a-1: nothing changes for players', () => {
  const SRC = resolve(fileURLToPath(import.meta.url), '../../src');
  it('no source module imports the WebGL2 base, the GPU presenter or the GPU movie statically (the plan: reached by import() only)', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = resolve(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.tsx?$/.test(e.name) || /uiGpu(Webgl2|Presenter|Movie)\.ts$/.test(e.name)) continue;
        const text = readFileSync(p, 'utf8');
        if (/^\s*import\s[^;]*from\s+['"][./]*[^'"]*uiGpu(Webgl2|Presenter|Movie)['"]/m.test(text)) offenders.push(p);
      }
    };
    walk(SRC);
    expect(offenders).toEqual([]);
  });
});

// GM-11a-3 (plan row GM-11a-3; the performance table's "GPU per frame" row, kept as "recorded where the timer query
// exists" by GM-02b): the GPU time of each drawn frame through `EXT_disjoint_timer_query_webgl2`, a perf instrument and
// a browser adaptation that changes no pixel. Held on the fake GL's model of the extension (unit test); a real GPU's
// numbers are the box's and GM-16's ring's.
describe('GM-11a-3: GPU time per frame (EXT_disjoint_timer_query_webgl2)', () => {
  const timed = (f: Fake): UiGpuBackend => {
    const b = createUiGpuBackend(f.canvas as unknown as HTMLCanvasElement, { transparent: false, timeQueries: true });
    if (!b) throw new Error('no backend');
    return b;
  };
  const plan = planFrame([clearItem([10, 20, 30]), { kind: 'sprite', node: 'n', texture: null, x0: 0, y0: 0, x1: 8, y1: 8, u0: 0, v0: 0, u1: 0, v1: 0, rgba: [200, 100, 50, 64], clip: null } as UiDrawItem], () => null, {});

  it('is off unless asked: no extension looked up, no query made', () => {
    const f = fakeGl({ timerQuery: true }), b = backendOn(f);
    b.draw(plan);
    expect(b.timer).toBeNull();
    expect(f.names()).not.toContain('getExtension');
    expect(f.names()).not.toContain('createQuery');
  });

  it('asked where the extension is missing: unavailable ("unmeasured"), no query made, nothing to take', () => {
    const f = fakeGl(), b = timed(f);
    b.draw(plan);
    expect(b.timer!.available).toBe(false);
    expect(f.names()).not.toContain('createQuery');
    expect(b.timer!.takeMs()).toEqual([]);
  });

  it('wraps each draw: the query begun before its first GL call that writes the frame, ended after its last; none left active', () => {
    const f = fakeGl({ timerQuery: true }), b = timed(f);
    b.draw(plan);
    const names = f.names(), begin = names.indexOf('beginQuery'), end = names.lastIndexOf('endQuery');
    expect(begin).toBeGreaterThan(-1);
    expect(begin).toBeLessThan(names.indexOf('clear'));
    expect(end).toBeGreaterThan(names.lastIndexOf('drawArrays'));
    expect(f.calls[begin]![1]).toBe(GL.TIME_ELAPSED_EXT);
    expect(f.activeQuery()).toBeNull();
    expect(diff(b.readPixels().data, executeFramePlanOnTwin(plan, { divide: false }).frame.data)).toBe(0);   // no byte changed
  });

  it('reads a result only once it is available (never a stall), in order, as milliseconds', () => {
    const f = fakeGl({ timerQuery: true }), b = timed(f);
    b.draw(plan); b.draw(plan); b.draw(plan);
    expect(b.timer!.takeMs()).toEqual([]);              // nothing available yet: polled, not waited on
    f.timer.resolve(2_000_000);
    b.draw(plan);                                        // each draw polls first
    expect(b.timer!.takeMs()).toEqual([2]);
    f.timer.resolve(500_000); f.timer.resolve(1_250_000);
    b.timer!.poll();
    expect(b.timer!.takeMs()).toEqual([0.5, 1.25]);
    expect(f.queries.every((q) => q.readEarly === 0)).toBe(true);
    expect(b.timer!.stats).toMatchObject({ timed: 3, disjoint: 0 });
  });

  it('a disjoint report drops every pending result (the GPU\'s clock is not to be trusted across it)', () => {
    const f = fakeGl({ timerQuery: true }), b = timed(f);
    b.draw(plan); b.draw(plan);
    f.timer.resolve(1e6); f.timer.resolve(1e6);
    f.timer.disjoint = true;
    b.timer!.poll();
    expect(b.timer!.takeMs()).toEqual([]);
    expect(b.timer!.stats.disjoint).toBe(2);
    expect(f.queries.filter((q) => !q.deleted).length).toBe(0);
  });

  it("a disjoint reported while nothing is pending is cleared at that poll: the later frames' results kept (review F2)", () => {
    const f = fakeGl({ timerQuery: true }), b = timed(f);
    f.timer.disjoint = true;
    b.draw(plan);                                        // polls first, nothing pending: the flag is read and cleared here
    f.timer.resolve(1e6);
    b.timer!.poll();
    expect(b.timer!.takeMs()).toEqual([1]);
    expect(b.timer!.stats).toMatchObject({ timed: 1, disjoint: 0 });
  });

  it('holds at most UI_GPU_TIMER_PENDING_ADAPTATION queries: frames past it are not timed, and say so', () => {
    const f = fakeGl({ timerQuery: true }), b = timed(f);
    for (let k = 0; k < 10; k++) b.draw(plan);
    expect(f.queries.length).toBe(UI_GPU_TIMER_PENDING_ADAPTATION);
    expect(b.timer!.stats).toMatchObject({ skipped: 10 - UI_GPU_TIMER_PENDING_ADAPTATION, pending: UI_GPU_TIMER_PENDING_ADAPTATION });
  });

  it('a disposed backend refuses a draw before the timer is touched: no query made, none left pending (review F3)', () => {
    const f = fakeGl({ timerQuery: true }), b = timed(f);
    b.dispose();
    expect(() => b.draw(plan)).toThrow(/disposed/);
    expect(f.queries.length).toBe(0);
    expect(b.timer!.stats.pending).toBe(0);
  });

  it('dispose deletes every query', () => {
    const f = fakeGl({ timerQuery: true }), b = timed(f);
    b.draw(plan); b.draw(plan);
    b.dispose();
    expect(f.queries.every((q) => q.deleted)).toBe(true);
  });
});

describe('GM-11a-3: the timer survives a draw that throws', () => {
  it('a draw that throws mid-frame leaves no query active, and the next frame is timed', () => {
    const f = fakeGl({ timerQuery: true });
    const b = createUiGpuBackend(f.canvas as unknown as HTMLCanvasElement, { transparent: false, timeQueries: true })!;
    const bad = planFrame([clearItem([1, 2, 3])], () => null, {});
    const broken = { ...bad, steps: [...bad.steps, { kind: 'copy', batch: 0, rect: { xs: 0, ys: 0, xe: 9999, ye: 1 } }] } as typeof bad;
    expect(() => b.draw(broken)).toThrow();
    expect(f.activeQuery()).toBeNull();
    b.draw(bad);
    expect(f.queries.length).toBe(2);
  });
});

// ---- GM-15b: the models pass's edges on the fake GL (the GM-15 row's 15b; research 380 M2, M3, M5) ----------------------

describe('GM-15b: the models pass\'s edges on the fake GL -- seams and ties drawn as the software draws them; what the plan refuses is L1, named', () => {
  type Q4 = [number, number, number, number];
  const DYADIC = [0.5, 0.75, 1, 1.5, 2, 0.375];
  const ONCE = UI_SEAM_CLEAR + UI_SEAM_TEXEL;
  const depthOf = (f: Fake) => f.framebuffers.find((fb) => !fb.deleted && fb.depth)!.depth!;
  /** The corner triangle (0,0), (0,16), (16,0), every vertex at one invW, u, v and colour; textured by `a.tif` when asked. */
  const corner = (invW: number, rgba: Q4, texture: string | null = null, u = 0, v = 0): UiModelTriangle => {
    const vx = (x: number, y: number) => ({ x, y, invW, u, v, rgba });
    return { node: 'n', texture, cull: false, a: vx(0, 0), b: vx(0, 16), c: vx(16, 0) };
  };
  const RED: Q4 = [128, 0, 0, 128], GREEN: Q4 = [0, 128, 0, 128], GREY: Q4 = [128, 128, 128, 128];
  const tex = solid(4, 4, [50, 60, 70, 255]);
  const list = (...triangles: UiModelTriangle[]): UiDrawItem[] => [clearItem([0, 0, 0]), { kind: 'models', triangles }];

  it('a seam at dyadic depths: drawn, the frame the twin\'s and the software\'s, every seam pixel once, its depth invW x depthScale, at 1, 2 and 4', () => {
    const { items, textures, squares } = seamSquares(Array.from({ length: 24 }, (_, k) => DYADIC[k % DYADIC.length]!));
    for (const scale of UI_RASTER_CASE_SCALES) {
      const p = planFrame(items, textures, { scale, blend: 'ff' }), f = fakeGl(), b = backendOn(f);
      expect(p.passes.map((x) => x.depthScale), `${scale}x`).toEqual([0.25]);   // the largest invW 2, to 1/2
      expect(b.refusal(p), `${scale}x`).toBeNull();
      b.draw(p);
      const got = b.readPixels(), want = rasterizeUiDrawList(items, textures, { scale }).frame;
      expect(diff(got.data, executeFramePlanOnTwin(p, { divide: false }).frame.data), `${scale}x: the twin`).toBe(0);
      expect(diff(got.data, want.data), `${scale}x: the software`).toBe(0);
      const depth = depthOf(f);
      let notOnce = 0, depthOff = 0;
      for (const sq of squares) for (const [x, y] of seamPixels(sq, scale)) {
        const o = (y * got.width + x) * 4;
        if (got.data[o] !== ONCE || got.data[o + 1] !== ONCE || got.data[o + 2] !== ONCE) notOnce++;
        if (depth.data![y * depth.w + x] !== sq.invW * 0.25) depthOff++;
      }
      expect(notOnce, `${scale}x: seam pixels not drawn once`).toBe(0);
      expect(depthOff, `${scale}x: seam depths not invW x 1/4`).toBe(0);
    }
  });

  it('a tie (case 3): the later triangle\'s colour and depth on every pixel the two share (GEQUAL, UI_MODEL_DEPTH_FORMAT_READING; GM-15d, GREATER kept the first), the software\'s bytes, at 1, 2 and 4', () => {
    const c = UI_RASTER_CASES.find((x) => x.key === '3')!;
    for (const scale of UI_RASTER_CASE_SCALES) {
      const { items, textures, options } = caseRasterInputs(c, scale, 'opaque');
      const p = planFrame(items, textures, { scale, blend: 'ff' }), f = fakeGl(), b = backendOn(f);
      b.draw(p);
      const got = b.readPixels();
      expect(diff(got.data, rasterizeUiDrawList(items, textures, options).frame.data), `${scale}x`).toBe(0);
      for (const [x, y] of [[1, 1], [7, 7], [0, 15]] as const) {
        const o = (y * scale * got.width + x * scale) * 4;
        expect([...got.data.subarray(o, o + 4)], `${scale}x (${x}, ${y})`).toEqual([0, 128, 0, 255]);
        expect(depthOf(f).data![y * scale * got.width + x * scale], `${scale}x (${x}, ${y})`).toBe(0.5);   // invW 1, depthScale 1/2
      }
    }
  });

  it('the passes the plan refuses -- a depth under UI_GPU_MODEL_DEPTH_FLOOR (0, subnormal, after the scale), a texel past UI_GPU_MODEL_TEXEL_RANGE -- are L1, named, the frame the software\'s, no model drawn', () => {
    const rows: [string, UiDrawItem[], RegExp][] = [
      ['invW 1e-46 (f32 0)', list(corner(1e-46, RED), corner(1e-47, GREEN)), /UI_GPU_MODEL_DEPTH_FLOOR/],
      ['invW 1e-40 (f32 subnormal)', list(corner(1e-40, RED), corner(1e-41, GREEN)), /UI_GPU_MODEL_DEPTH_FLOOR/],
      ['invW 2^-100 beside invW 1 (2^-101 after the scale)', list(corner(1, RED), corner(2 ** -100, GREEN)), /UI_GPU_MODEL_DEPTH_FLOOR/],
      ['u W = 2^30', list(corner(1, GREY, 'a.tif', 2 ** 28)), /UI_GPU_MODEL_TEXEL_RANGE/],
      ['(1 - v) H = -2^31', list(corner(1, GREY, 'a.tif', 0, 1 + 2 ** 29)), /UI_GPU_MODEL_TEXEL_RANGE/],
    ];
    for (const [what, items, re] of rows) {
      const f = fakeGl(), pr = new GpuUiPresenter(backendOn(f));
      pr.present(items, () => tex, {});
      expect(pr.last!.path, what).toBe('software');
      expect(pr.last!.why.join(' '), what).toMatch(re);
      expect(diff(pr.readFrame()!.data, rasterizeUiDrawList(items, () => tex).frame.data), what).toBe(0);
      expect(f.draws.filter((d) => d.program.startsWith('model-')), what).toEqual([]);
    }
    // Their neighbours inside the range are drawn on the GPU.
    for (const items of [list(corner(1, RED), corner(2 ** -99, GREEN)), list(corner(1, GREY, 'a.tif', (2 ** 30 - 1) / 4))]) {
      const pr = new GpuUiPresenter(backendOn(fakeGl()));
      pr.present(items, () => tex, {});
      expect(pr.last!.path).toBe('gpu');
    }
  });

  it('were such a plan drawn, the fake GL throws where a GPU is undefined or flushes: T8\'s int conversion past the int range, a depth under f32\'s normal range', () => {
    const forced = (p: UiFramePlan): UiFramePlan => ({ ...p, verdict: 'gpu', why: [] });
    const texel = planFrame(list(corner(1, GREY, 'a.tif', 2 ** 29)), () => tex, {});
    expect(texel.verdict).toBe('software');
    expect(() => backendOn(fakeGl()).draw(forced(texel))).toThrow(/T8/);
    const zero = planFrame(list(corner(1e-46, RED)), () => null, {});
    expect(zero.verdict).toBe('software');
    expect(() => backendOn(fakeGl()).draw(forced(zero))).toThrow(/depth/);
    const subnormal = planFrame(list(corner(1e-40, RED)), () => null, {});
    expect(() => backendOn(fakeGl()).draw(forced(subnormal))).toThrow(/depth/);
  });
});
