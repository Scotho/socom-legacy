import { describe, expect, it } from 'vitest';
import { e2eRenderer } from '../e2e/renderer';
import { UI_GPU_GL_NATIVE_ARGS, uiGpuGlLeg, uiGpuGlRefusal, uiGpuLaunchOptions } from '../e2e/uiGpuGl';
import { UI_PERF_NATIVE_GL_ARGS } from '../e2e/uiPerfLeg';

/**
 * GM-11b (product track: the GPU specs' renderer, a browser-test adaptation; nothing of the game changes): the renderer
 * the GPU specs' Chromium is launched on, chosen by env -- SwiftShader by default (the main config's flags), the host's
 * desktop GL (llvmpipe under xvfb on a Linux box) on the native leg -- as `uiGpuPerf.spec.ts`'s config does.
 */

const SWIFT = e2eRenderer(undefined, 'linux').args;
const LLVMPIPE = 'ANGLE (Mesa, llvmpipe (LLVM 19.1.1 256 bits), OpenGL 4.5)';
const SWIFTSHADER = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';

describe('GM-11b: the GPU specs\' renderer by env', () => {
  it('defaults to the main config\'s SwiftShader flags', () => {
    expect(uiGpuGlLeg({}, 'linux')).toEqual({ gl: 'config', requested: 'swiftshader', args: SWIFT });
    expect(uiGpuGlLeg({ S2U_UI_GPU_GL: '' }, 'linux').args).toEqual(SWIFT);
    expect(uiGpuGlLeg({ S2U_UI_GPU_GL: 'swiftshader' }, 'linux').args).toEqual(SWIFT);
  });
  it('the native leg is the perf leg\'s flags: ANGLE on desktop GL past the GPU blocklist', () => {
    expect(UI_GPU_GL_NATIVE_ARGS).toEqual(['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist']);
    expect(UI_GPU_GL_NATIVE_ARGS).toEqual(UI_PERF_NATIVE_GL_ARGS);
    expect(uiGpuGlLeg({ S2U_UI_GPU_GL: 'native' }, 'linux')).toEqual({
      gl: 'native', requested: 'native GL (--use-gl=angle --use-angle=gl --ignore-gpu-blocklist)', args: UI_GPU_GL_NATIVE_ARGS,
    });
  });
  it('takes the box\'s own native flags, space- or comma-separated; blank is the default flags', () => {
    expect(uiGpuGlLeg({ S2U_UI_GPU_GL: 'native', S2U_UI_GPU_GL_ARGS: '--use-gl=egl, --ignore-gpu-blocklist' }, 'linux').args)
      .toEqual(['--use-gl=egl', '--ignore-gpu-blocklist']);
    expect(uiGpuGlLeg({ S2U_UI_GPU_GL: 'native', S2U_UI_GPU_GL_ARGS: '  ' }, 'linux').args).toEqual(UI_GPU_GL_NATIVE_ARGS);
  });
  it('reads the perf leg\'s names when its own are unset; its own win', () => {
    expect(uiGpuGlLeg({ S2U_UI_PERF_GL: 'native' }, 'linux').gl).toBe('native');
    expect(uiGpuGlLeg({ S2U_UI_PERF_GL: 'native', S2U_UI_PERF_GL_ARGS: '--use-gl=egl' }, 'linux').args).toEqual(['--use-gl=egl']);
    expect(uiGpuGlLeg({ S2U_UI_GPU_GL: 'swiftshader', S2U_UI_PERF_GL: 'native' }, 'linux').gl).toBe('config');
  });
  it('S2U_E2E_RENDERER still chooses the config leg\'s backend (d3d11 on Windows only)', () => {
    expect(uiGpuGlLeg({ S2U_E2E_RENDERER: 'd3d11' }, 'win32')).toEqual({ gl: 'config', requested: 'd3d11', args: e2eRenderer('d3d11', 'win32').args });
    expect(() => uiGpuGlLeg({ S2U_E2E_RENDERER: 'd3d11' }, 'linux')).toThrow(/Windows/);
  });
  it('refuses a value it does not know, rather than falling back silently', () => {
    for (const v of ['llvmpipe', 'NATIVE', 'gl', 'hardware']) expect(() => uiGpuGlLeg({ S2U_UI_GPU_GL: v }, 'linux'), v).toThrow(/S2U_UI_GPU_GL.*native.*swiftshader/);
  });
  it('the launch options: the leg\'s args and the host\'s PW_CHROMIUM, as the main config gives them', () => {
    expect(uiGpuLaunchOptions({}, 'linux')).toEqual({ args: SWIFT, executablePath: undefined });
    expect(uiGpuLaunchOptions({ S2U_UI_GPU_GL: 'native', PW_CHROMIUM: '/opt/chromium' }, 'linux'))
      .toEqual({ args: UI_GPU_GL_NATIVE_ARGS, executablePath: '/opt/chromium' });
  });
});

describe('GM-11b: the native leg\'s precondition, read off the renderer string', () => {
  it('refuses a native leg that still runs on SwiftShader, or got no WebGL', () => {
    const native = uiGpuGlLeg({ S2U_UI_GPU_GL: 'native' }, 'linux');
    expect(uiGpuGlRefusal(native, SWIFTSHADER)).toMatch(/native.*SwiftShader/);
    expect(uiGpuGlRefusal(native, null)).toMatch(/no WebGL/);
    expect(uiGpuGlRefusal(native, LLVMPIPE)).toBeNull();
  });
  it('never refuses the config leg', () => {
    expect(uiGpuGlRefusal(uiGpuGlLeg({}, 'linux'), SWIFTSHADER)).toBeNull();
    expect(uiGpuGlRefusal(uiGpuGlLeg({}, 'linux'), LLVMPIPE)).toBeNull();
  });
});
