import { describe, expect, it } from 'vitest';
import type { Rgba } from '@s2u/gs';
import { rasterizeUiDrawList } from '../src/uiCompositorView';
import { GpuUiPresenter } from '../src/uiGpuPresenter';
import {
  UI_GPU_PREMULTIPLIED_PRESENT_ADAPTATION, UI_GPU_PROGRAMS, UiGpuBackend, createUiGpuBackend, uiGpuPremultipliedPresent,
} from '../src/uiGpuWebgl2';
import { GL, fakeGl, type Fake } from './uiGpuFakeGl';
import { UI_RASTER_CASES, caseRasterInputs } from './uiRasterCases';

// GM-19a (plan 2026-11-01-gpu-menus, row GM-19a; GM-11a-1 review F3; research 380 §5 `UI_GPU_PREMULTIPLIED_PRESENT_ADAPTATION`):
// the Settings overlay's GPU canvas is `premultipliedAlpha: true` (`UI_GPU_CONTEXT_ATTRIBUTES_ADAPTATION`), and the frame
// target holds the software's bytes BEFORE its divide (P14/P22), where a pixel's RGB may exceed its alpha (the software's
// premultiplied accumulation clamps each channel on its own). A premultiplied canvas given RGB > A composites it
// undefined (WebGL 1.0 §5.2.1, `premultipliedAlpha`). The present makes it defined before it reaches the page: each colour
// channel shown is min(channel, alpha) -- what the 2D canvas composites of the software's straight frame (RGB divided and
// clamped at 255, then multiplied back by the browser) -- while the frame target, which `readPixels` and the parity spec
// read, keeps the pre-divide bytes. An opaque surface (`#front-end-gpu`) is presented by the blit as before. A browser
// adaptation; evidence kind: unit test on the fake WebGL2 context (`./uiGpuFakeGl.ts`, not a GPU); the real composite is
// the GPU boxes' (`e2e/uiGpuParity.spec.ts`'s overlay leg, written, not run here).

const backendOn = (f: Fake, transparent: boolean): UiGpuBackend => {
  const b = createUiGpuBackend(f.canvas as unknown as HTMLCanvasElement, { transparent });
  if (!b) throw new Error('no backend');
  return b;
};
/** The default framebuffer's GL rows turned back to the frame's top-first rows (the present flips once). */
const shownTopFirst = (f: Fake, W: number, H: number): Uint8ClampedArray => {
  const back = f.backbuffer(), out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) out.set(back.data.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  return out;
};
const overAlpha = (d: ArrayLike<number>): number => {
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i]! > d[i + 3]! || d[i + 1]! > d[i + 3]! || d[i + 2]! > d[i + 3]!) n++;
  return n;
};
/** A small frame holding every kind of pixel the rule meets: RGB over alpha, RGB under it, alpha 0 with colour, opaque. */
const mixed = (): Rgba => {
  const W = 8, H = 4, data = new Uint8ClampedArray(W * H * 4);
  const px: [number, number, number, number][] = [[200, 10, 90, 64], [30, 20, 10, 64], [255, 255, 255, 0], [12, 250, 7, 255], [64, 64, 64, 64], [65, 0, 0, 64], [1, 2, 3, 1], [0, 0, 0, 0]];
  for (let i = 0; i < W * H; i++) data.set(px[i % px.length]!, i * 4);
  return { width: W, height: H, data };
};
/** min(channel, alpha) per pixel: the rule, written out. */
const clamped = (d: Uint8ClampedArray): Uint8ClampedArray => {
  const o = d.slice();
  for (let i = 0; i < o.length; i += 4) for (let c = 0; c < 3; c++) o[i + c] = Math.min(o[i + c]!, o[i + 3]!);
  return o;
};

describe('GM-19a: UI_GPU_PREMULTIPLIED_PRESENT_ADAPTATION -- the rule', () => {
  it('is defined, a browser adaptation with no original, and uiGpuPremultipliedPresent clamps each colour channel to the alpha in place', () => {
    expect(UI_GPU_PREMULTIPLIED_PRESENT_ADAPTATION).toBeDefined();
    expect(Object.isFrozen(UI_GPU_PREMULTIPLIED_PRESENT_ADAPTATION)).toBe(true);
    const f = mixed(), d = f.data.slice();
    uiGpuPremultipliedPresent(d);
    expect([...d]).toEqual([...clamped(f.data)]);
    expect(overAlpha(d)).toBe(0);
    // Every (value, alpha) pair: the alpha never changes; a channel at or under the alpha is left as it is.
    const all = new Uint8ClampedArray(256 * 256 * 4);
    for (let a = 0; a < 256; a++) for (let v = 0; v < 256; v++) all.set([v, v, v, a], (a * 256 + v) * 4);
    const mine = all.slice();
    uiGpuPremultipliedPresent(mine);
    expect([...mine]).toEqual([...clamped(all)]);
  });

  it('equals, at every (value, alpha) with value <= 255, what the 2D canvas keeps of the software\'s straight pixel within 1 (the browser premultiplies it back)', () => {
    // The 2D canvas stores a straight pixel premultiplied: round(s * a / 255) for s = the software's divide, clamped.
    let worst = 0;
    for (let a = 1; a < 255; a++) for (let v = 0; v < 256; v++) {
      const s = Math.min(255, Math.round(v / (a / 255)));
      const kept = Math.round((s * a) / 255);
      worst = Math.max(worst, Math.abs(kept - Math.min(v, a)));
    }
    expect(worst).toBeLessThanOrEqual(1);
  });
});

describe('GM-19a: the transparent present (the overlay\'s canvas)', () => {
  it('a frame with RGB over its alpha reaches the canvas as min(RGB, A), flipped once; the frame target keeps the pre-divide bytes', () => {
    const f = fakeGl(), b = backendOn(f, true), frame = mixed();
    expect(overAlpha(frame.data)).toBeGreaterThan(0);
    b.uploadFrame(frame, true);
    b.present();
    expect([f.canvas.width, f.canvas.height]).toEqual([frame.width, frame.height]);
    const shown = shownTopFirst(f, frame.width, frame.height);
    expect(overAlpha(shown)).toBe(0);
    expect([...shown]).toEqual([...clamped(frame.data)]);
    expect([...b.readPixels().data]).toEqual([...frame.data]);            // the target: the pre-divide bytes, untouched
  });

  it('draws one full-viewport triangle through the present program into the default framebuffer -- no blit, no blend, no scissor, no dither -- after the owed clear', () => {
    const f = fakeGl(), b = backendOn(f, true);
    b.uploadFrame(mixed(), true);
    f.gl.enable(GL.BLEND); f.gl.enable(GL.SCISSOR_TEST); f.gl.enable(GL.DITHER); f.gl.colorMask(true, false, true, true);
    const from = f.calls.length;
    b.present();
    const calls = f.calls.slice(from);
    expect(calls.map((c) => c[0])).not.toContain('blitFramebuffer');
    const draw = calls.findIndex((c) => c[0] === 'drawArrays');
    expect(calls[draw]).toEqual(['drawArrays', GL.TRIANGLES, 0, 3]);
    expect(calls.findIndex((c) => c[0] === 'clear')).toBeLessThan(draw);
    expect(f.clears.at(-1)!.target).toBe('default');
    expect([...f.st.enabled].filter((x) => x === GL.BLEND || x === GL.SCISSOR_TEST || x === GL.DITHER)).toEqual([]);
    expect(f.st.mask).toEqual([true, true, true, true]);
  });

  it('a present after the page composited still shows the frame (the draw pays the owed clear, as the blit\'s clear did)', () => {
    const f = fakeGl(), b = backendOn(f, true), frame = mixed();
    b.uploadFrame(frame, true);
    b.present();
    f.composite();
    b.uploadFrame(frame, true);
    b.present();
    expect([...shownTopFirst(f, frame.width, frame.height)]).toEqual([...clamped(frame.data)]);
  });

  it('a transparent backend links the present program beside the others; an opaque one does not', () => {
    for (const transparent of [false, true]) {
      const f = fakeGl(), b = backendOn(f, transparent);
      b.startPrograms();
      expect(b.programsSettled(null)).toEqual({ state: 'linked' });
      expect(f.calls.filter((c) => c[0] === 'linkProgram')).toHaveLength(UI_GPU_PROGRAMS.length + (transparent ? 1 : 0));
    }
  });
});

describe('GM-19a: an opaque surface is presented as before (`#front-end-gpu`)', () => {
  it('the blit, 1:1, flipped, NEAREST, no draw, every byte as uploaded', () => {
    const f = fakeGl(), b = backendOn(f, false);
    const frame: Rgba = { width: 8, height: 4, data: mixed().data.map((v, i) => (i % 4 === 3 ? 255 : v)) };
    b.uploadFrame(frame, false);
    const from = f.calls.length;
    b.present();
    const calls = f.calls.slice(from);
    expect(calls).toContainEqual(['blitFramebuffer', 0, 0, 8, 4, 0, 4, 8, 0, GL.COLOR_BUFFER_BIT, GL.NEAREST]);
    expect(calls.map((c) => c[0])).not.toContain('drawArrays');
    expect([...shownTopFirst(f, 8, 4)]).toEqual([...frame.data]);
  });
});

describe('GM-19a: the L1 present on the premultiplied canvas (GM-11a-1 review F3)', () => {
  // A case whose transparent software frame, before its divide, holds a pixel with RGB over its alpha.
  const over = UI_RASTER_CASES.find((c) => {
    const { items, textures, options } = caseRasterInputs(c, 1, 'transparent', true);
    return overAlpha(rasterizeUiDrawList(items, textures, options).frame.data) > 0;
  });

  it('a GM-03 case gives such a frame (or the test means nothing)', () => {
    expect(over, 'no transparent case whose pre-divide frame has RGB over A').toBeDefined();
  });

  it('an L1 frame whose pre-divide bytes have RGB over A reaches the page defined (no RGB > A), its readFrame the software\'s straight frame', () => {
    const c = over!;
    const f = fakeGl(), backend = backendOn(f, true), p = new GpuUiPresenter(backend);
    backend.refusal = () => 'test: the frame forced to L1';
    const { items, textures, options } = caseRasterInputs(c, 1, 'transparent');
    const pre = caseRasterInputs(c, 1, 'transparent', true);
    const preFrame = rasterizeUiDrawList(pre.items, pre.textures, pre.options).frame;
    p.present(items, textures, options);
    expect(p.last!.path).toBe('software');
    expect([...backend.readPixels().data]).toEqual([...preFrame.data]);   // the target holds the pre-divide bytes
    const shown = shownTopFirst(f, preFrame.width, preFrame.height);
    expect(overAlpha(shown)).toBe(0);
    expect([...shown]).toEqual([...clamped(preFrame.data)]);
    expect([...p.readFrame()!.data]).toEqual([...rasterizeUiDrawList(items, textures, options).frame.data]);
  });
});
