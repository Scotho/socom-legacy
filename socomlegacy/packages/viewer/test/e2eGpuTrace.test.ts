import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bufferFailScript, glTexelBytes, gpuTexelBytes, gpuTraceEnv, gpuTraceScript, gpuTraceTag, summarizeGpuTrace, type GpuTrace,
} from '../e2e/gpuTrace';

/** The page script run in Node on stub WebGL2 contexts: the calls three.js makes, the live bytes the trace keeps. */
const STUB_GLOBALS = ['WebGL2RenderingContext', 'HTMLCanvasElement', 'requestAnimationFrame', '__gpuTrace'] as const;
function stubPage(): { gl: Record<string, (...a: unknown[]) => unknown>; liveBytes(): number } {
  const g = globalThis as unknown as Record<string, unknown>;
  class WebGL2RenderingContext {}
  for (const m of ['activeTexture', 'bindTexture', 'bindBuffer', 'bindRenderbuffer', 'texImage2D', 'texStorage2D', 'texStorage3D',
    'texImage3D', 'compressedTexImage2D', 'generateMipmap', 'deleteTexture', 'bufferData', 'deleteBuffer', 'renderbufferStorage',
    'renderbufferStorageMultisample', 'deleteRenderbuffer', 'framebufferTexture2D']) {
    (WebGL2RenderingContext.prototype as Record<string, unknown>)[m] = (): void => undefined;
  }
  class HTMLCanvasElement { getContext(): null { return null; } }
  g['WebGL2RenderingContext'] = WebGL2RenderingContext;
  g['HTMLCanvasElement'] = HTMLCanvasElement;
  g['requestAnimationFrame'] = (): number => 0;
  new Function(gpuTraceScript())();
  const gl = Object.assign(new WebGL2RenderingContext(), { canvas: null }) as unknown as Record<string, (...a: unknown[]) => unknown>;
  const T = g['__gpuTrace'] as { live: Map<string, { bytes: number }> };
  return { gl, liveBytes: () => [...T.live.values()].reduce((s, r) => s + r.bytes, 0) };
}
const TEXTURE_2D = 0x0DE1, CUBE = 0x8513, RGBA8 = 0x8058, RGBA = 0x1908, UNSIGNED_BYTE = 0x1401;

/** The GPU trace instrument's byte rule, tag and report (`../e2e/gpuTrace.ts`; a test-only instrument, product track). */
describe('the GPU trace instrument', () => {
  it('counts WebGL2 texels by internal format, and RGBA by its type', () => {
    expect(glTexelBytes(0x8058)).toBe(4);            // RGBA8
    expect(glTexelBytes(0x881A)).toBe(8);            // RGBA16F
    expect(glTexelBytes(0x8814)).toBe(16);           // RGBA32F
    expect(glTexelBytes(0x8229)).toBe(1);            // R8
    expect(glTexelBytes(0x88F0)).toBe(4);            // DEPTH24_STENCIL8
    expect(glTexelBytes(0x1908, 0x1401)).toBe(4);    // RGBA, UNSIGNED_BYTE
    expect(glTexelBytes(0x1908, 0x1406)).toBe(16);   // RGBA, FLOAT
    expect(glTexelBytes(0x1908, 0x140B)).toBe(8);    // RGBA, HALF_FLOAT
    expect(glTexelBytes(0x8815)).toBe(12);           // RGB32F
    expect(glTexelBytes(0x881B)).toBe(6);            // RGB16F
    expect(glTexelBytes(0xFFFF)).toBe(4);            // unknown: 4
  });

  it('counts WebGPU texels by format', () => {
    expect(gpuTexelBytes('rgba8unorm')).toBe(4);
    expect(gpuTexelBytes('bgra8unorm')).toBe(4);
    expect(gpuTexelBytes('rgba16float')).toBe(8);
    expect(gpuTexelBytes('rg16float')).toBe(4);
    expect(gpuTexelBytes('r16float')).toBe(2);
    expect(gpuTexelBytes('rgba32float')).toBe(16);
    expect(gpuTexelBytes('r32float')).toBe(4);
    expect(gpuTexelBytes('depth32float')).toBe(4);
    expect(gpuTexelBytes('r8unorm')).toBe(1);
    expect(gpuTexelBytes('rg8unorm')).toBe(2);
    expect(gpuTexelBytes('bc3-rgba-unorm')).toBe(1);
  });

  it('tags a record by its page-source file, coarsely', () => {
    expect(gpuTraceTag(null)).toBe('three (lazy, no page frame)');
    expect(gpuTraceTag('charShadow.ts')).toBe('shadow map');
    expect(gpuTraceTag('uiGpuSurface.ts')).toBe('menu/lobby raster');
    expect(gpuTraceTag('hud.ts')).toBe('hud');
    expect(gpuTraceTag('remotePlayers.ts')).toBe('player models');
    expect(gpuTraceTag('matchRenderer.ts')).toBe('render targets/post');
    expect(gpuTraceTag('somethingElse.ts')).toBe('other:somethingElse.ts');
  });

  describe("the page script on stub contexts (the review's F1)", () => {
    afterEach(() => { for (const k of STUB_GLOBALS) delete (globalThis as unknown as Record<string, unknown>)[k]; });

    it("counts an immutable texture's chain once: texStorage2D of every level, then generateMipmap, as three.js r186 does", () => {
      const { gl, liveBytes } = stubPage();
      gl['bindTexture']!(TEXTURE_2D, {});
      gl['texStorage2D']!(TEXTURE_2D, 11, RGBA8, 1024, 1024);
      let chain = 0; for (let l = 0; l < 11; l++) chain += (1024 >> l) * (1024 >> l) * 4;
      expect(liveBytes()).toBe(chain);
      gl['generateMipmap']!(TEXTURE_2D);
      expect(liveBytes()).toBe(chain);
    });

    it('adds a third of level 0 when generateMipmap follows an uploaded level', () => {
      const { gl, liveBytes } = stubPage();
      gl['bindTexture']!(TEXTURE_2D, {});
      gl['texImage2D']!(TEXTURE_2D, 0, RGBA, 256, 256, 0, RGBA, UNSIGNED_BYTE, null);
      expect(liveBytes()).toBe(256 * 256 * 4);
      gl['generateMipmap']!(TEXTURE_2D);
      expect(liveBytes()).toBe(256 * 256 * 4 + Math.round(256 * 256 * 4 / 3));
    });

    it("adds a third of every face's level 0 for a cube uploaded face by face", () => {
      const { gl, liveBytes } = stubPage();
      gl['bindTexture']!(CUBE, {});
      for (let f = 0; f < 6; f++) gl['texImage2D']!(0x8515 + f, 0, RGBA, 64, 64, 0, RGBA, UNSIGNED_BYTE, null);
      expect(liveBytes()).toBe(6 * 64 * 64 * 4);
      gl['generateMipmap']!(CUBE);
      expect(liveBytes()).toBe(6 * 64 * 64 * 4 + Math.round(6 * 64 * 64 * 4 / 3));
    });
  });

  it("checks its switches, and never writes inside test-results (the review's F2, F4)", () => {
    const web = join(tmpdir(), 'web');
    const d = gpuTraceEnv({}, web);
    expect(d).toEqual({ out: join(tmpdir(), 's2u-gpu-trace'), backend: 'xbox', video: null, playSeconds: 30, args: [], fault: 'none', exit: 'abort' });
    expect(gpuTraceEnv({ S2U_GPU_TRACE_ARGS: ' --a  --b ', S2U_GPU_TRACE_FAULT: 'bufferfail', S2U_GPU_TRACE_EXIT: 'stop', S2U_GPU_TRACE_PLAY_S: '8' }, web))
      .toMatchObject({ args: ['--a', '--b'], fault: 'bufferfail', exit: 'stop', playSeconds: 8 });
    expect(() => gpuTraceEnv({ S2U_GPU_TRACE_OUT: 'test-results/gpu-trace' }, web)).toThrow(/Playwright empties/);
    expect(() => gpuTraceEnv({ S2U_GPU_TRACE_OUT: join(web, 'test-results') }, web)).toThrow(/Playwright empties/);
    expect(gpuTraceEnv({ S2U_GPU_TRACE_OUT: 'test-results-kept' }, web).out).toBe(join(web, 'test-results-kept'));
    expect(() => gpuTraceEnv({ S2U_GPU_TRACE_PLAY_S: 'abc' }, web)).toThrow(/PLAY_S/);
    expect(() => gpuTraceEnv({ S2U_GPU_TRACE_PLAY_S: '0' }, web)).toThrow(/PLAY_S/);
    expect(() => gpuTraceEnv({ S2U_GPU_TRACE_FAULT: 'boom' }, web)).toThrow(/FAULT/);
    expect(() => gpuTraceEnv({ S2U_GPU_TRACE_EXIT: 'quit' }, web)).toThrow(/EXIT/);
    expect(() => gpuTraceEnv({ S2U_GPU_TRACE_BACKEND: 'metal' }, web)).toThrow(/BACKEND/);
    expect(() => gpuTraceEnv({ S2U_GPU_TRACE_VIDEO: '{bad' }, web)).toThrow(/VIDEO/);
  });

  it("runs when a keepNames transform built the functions (tsx, esbuild: their __name calls have no helper in the page)", () => {
    // The module as tsx compiles it: esbuild with keepNames wraps each named arrow in `__name(fn, "name")`, a helper that
    // lives at the module's top -- so a function's toString() carries the calls but not the helper.
    const src = readFileSync(fileURLToPath(new URL('../e2e/gpuTrace.ts', import.meta.url)), 'utf8');
    const js = transformSync(src, { loader: 'ts', format: 'esm', keepNames: true }).code
      .replace(/^import .*$/gm, '').replace(/^export \{[^}]*\};?$/gm, '').replace(/^export /gm, '');
    const built = new Function(`${js}\nreturn { trace: gpuTraceScript(), fail: bufferFailScript() };`)() as { trace: string; fail: string };
    expect(built.trace).toContain('__name(');   // the transform did what tsx does
    const g = globalThis as unknown as Record<string, unknown>;
    class GPUDevice { createBuffer(): object { return { destroy: (): void => undefined }; } }
    g['WebGL2RenderingContext'] = class {}; g['HTMLCanvasElement'] = class { getContext(): null { return null; } };
    g['requestAnimationFrame'] = (): number => 0; g['GPUDevice'] = GPUDevice;
    try {
      expect(() => new Function(built.fail)()).not.toThrow();
      expect(() => new Function(built.trace)()).not.toThrow();
      expect(typeof g['__gpuTrace']).toBe('object');
      expect(typeof g['__armBufferFail']).toBe('function');
    } finally {
      for (const k of [...STUB_GLOBALS, 'GPUDevice', '__armBufferFail', '__bufferFailLeft']) delete g[k];
    }
  });

  it('builds init scripts that are plain JavaScript (no TypeScript left in the serialized functions)', () => {
    expect(() => new Function(gpuTraceScript())).not.toThrow();
    expect(() => new Function(bufferFailScript())).not.toThrow();
  });

  it('reports the marks, the peak, the heap and the losses of a collected trace', () => {
    const mb = 1048576;
    const trace: GpuTrace = {
      frames: [
        { t: 0, total: 0, rt: 0, byTag: {}, byCtx: {}, heap: 100 * mb, n: 0, ctxs: 0 },
        { t: 1000, total: 30 * mb, rt: 10 * mb, byTag: { map: 20 * mb, hud: 10 * mb }, byCtx: { webgpu: 30 * mb }, heap: 500 * mb, n: 12, ctxs: 1 },
        { t: 2000, total: 25 * mb, rt: 10 * mb, byTag: { map: 15 * mb, hud: 10 * mb }, byCtx: { webgpu: 25 * mb }, heap: 300 * mb, n: 10, ctxs: 1 },
      ],
      marks: [{ t: 990, label: 'in-match' }],
      live: [{ ctx: 'webgpu', kind: 'gpu-texture', tag: 'map', file: 'world.ts', bytes: 15 * mb, w: 2048, h: 2048, rt: false }],
      contexts: [{ t: 10, type: 'webgl2', name: 'match#960x640', w: 960, h: 640, antialias: true, alive: false }],
      lost: [{ t: 1500, name: 'match#960x640', msg: '' }],
    };
    const lines = summarizeGpuTrace(trace);
    expect(lines[0]).toBe('marks: in-match@1.0s=30.0 MB');
    expect(lines[1]).toBe('peak 30.0 MB at 1.0s (render targets 10.0 MB, 12 live objects); by tag: map 20.0 MB; hud 10.0 MB; by context: webgpu 30.0 MB');
    expect(lines[2]).toBe('end 25.0 MB at 2.0s; by tag: map 15.0 MB; hud 10.0 MB');
    expect(lines[3]).toBe('JS heap: min 100.0 MB, max 500.0 MB, end 300.0 MB');
    expect(lines).toContain('context webgl2 match#960x640 aa=true created 0.0s LOST');
    expect(lines).toContain('lost match#960x640 at 1.5s');
    expect(lines.at(-1)).toBe('biggest live: gpu-texture:map 2048x2048 15.0 MB');
    expect(summarizeGpuTrace({ ...trace, frames: [] })).toEqual(['no frames recorded']);
  });
});
