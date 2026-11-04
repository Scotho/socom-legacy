import { describe, expect, it } from 'vitest';
import { LinearSRGBColorSpace, NoColorSpace } from 'three';
import { GlowFrame, glowTargetOptions, mainPassOf, type MainPass } from '../src/glowTarget';

/**
 * The flashbang glow's world target (PF-07b review, findings 1 and 2): in the native picture the world is drawn into it
 * while a glow runs, so it must be the main pass's twin -- the canvas's colour format, sample count, depth format and
 * colour space -- for three to reuse every pipeline the canvas already linked (`WebGPUBackend.needsRenderUpdate` keys
 * on them), and it is sized once at a flash's start, kept through it and released when the glow ends.
 */

const WEBGPU: MainPass = { samples: 4, stencil: false, outputColorSpace: LinearSRGBColorSpace, canvasFormat: 'bgra8unorm' };

describe('the glow target matches the main pass', () => {
  it('takes the renderer\'s samples, stencil, output colour space and, under WebGPU, the canvas\'s format', () => {
    expect(glowTargetOptions(WEBGPU)).toEqual({
      samples: 4, depthBuffer: true, stencilBuffer: false, colorSpace: LinearSRGBColorSpace, internalFormat: 'bgra8unorm',
    });
    // No multisampling where the main pass has none; WebGL2 keys no pipeline on a format: no internal format forced.
    expect(glowTargetOptions({ samples: 0, stencil: true, outputColorSpace: LinearSRGBColorSpace, canvasFormat: null }))
      .toMatchObject({ samples: 0, stencilBuffer: true, internalFormat: null });
  });

  it('reads the main pass off three\'s renderer: samples, stencil, output colour space, the backend\'s preferred format', () => {
    const webgpu = { samples: 4, stencil: false, outputColorSpace: LinearSRGBColorSpace, backend: { isWebGPUBackend: true, utils: { getPreferredCanvasFormat: () => 'rgba8unorm' } } };
    expect(mainPassOf(webgpu)).toEqual({ samples: 4, stencil: false, outputColorSpace: LinearSRGBColorSpace, canvasFormat: 'rgba8unorm' });
    const webgl = { samples: 4, stencil: false, outputColorSpace: LinearSRGBColorSpace, backend: { isWebGLBackend: true } };
    expect(mainPassOf(webgl).canvasFormat).toBeNull();
  });

  it('the target it makes is that twin: format, samples, depth, stencil and colour space as the main pass\'s', () => {
    const f = new GlowFrame(WEBGPU);
    const t = f.acquire(800, 600);
    expect(t.samples).toBe(WEBGPU.samples);
    expect(t.texture.internalFormat).toBe('bgra8unorm');
    expect(t.texture.colorSpace).toBe(LinearSRGBColorSpace);
    expect(t.texture.colorSpace).not.toBe(NoColorSpace);
    expect(t.depthBuffer).toBe(true);
    expect(t.stencilBuffer).toBe(WEBGPU.stencil);
  });
});

describe('the glow target\'s life: one size a flash, released at its end', () => {
  it('is not allocated before a flash; sized at its start; the same target at the same size through it', () => {
    const f = new GlowFrame(WEBGPU);
    expect(f.held()).toBeNull();
    const t = f.acquire(1280, 720);
    expect([t.width, t.height]).toEqual([1280, 720]);
    const again = f.acquire(2560, 1440);                              // the pixel ratio stepped mid-flash
    expect(again).toBe(t);
    expect([again.width, again.height]).toEqual([1280, 720]);         // finished at the old size
  });

  it('released when the glow ends (disposed: its GPU memory freed), and the next flash takes the size then', () => {
    const f = new GlowFrame(WEBGPU);
    const t = f.acquire(1280, 720);
    let disposed = 0;
    t.addEventListener('dispose', () => { disposed++; });
    f.release();
    expect(disposed).toBe(1);
    expect(f.held()).toBeNull();
    f.release();                                                      // nothing held: nothing to free
    expect(disposed).toBe(1);
    const next = f.acquire(2560, 1440);
    expect([next.width, next.height]).toEqual([2560, 1440]);
  });
});
