import { describe, expect, it } from 'vitest';
import { UI_PERF_NATIVE_GL_ARGS, popupSlotFor, uiPerfGlRefusal, uiPerfLaunchArgs } from '../e2e/uiPerfLeg';

const SWIFT = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

describe('GM-02 perf leg: the launch flags per requested GL', () => {
  it('keeps the main config\'s renderer flags unless native GL is asked', () => {
    expect(uiPerfLaunchArgs({}, SWIFT)).toEqual(SWIFT);
    expect(uiPerfLaunchArgs({ S2U_UI_PERF_GL: 'swiftshader' }, SWIFT)).toEqual(SWIFT);
  });
  it('asks ANGLE for desktop GL (Mesa llvmpipe under xvfb) on the native leg, past the GPU blocklist', () => {
    expect(UI_PERF_NATIVE_GL_ARGS).toEqual(['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist']);
    expect(uiPerfLaunchArgs({ S2U_UI_PERF_GL: 'native' }, SWIFT)).toEqual(UI_PERF_NATIVE_GL_ARGS);
  });
  it('takes the box\'s own flags for the native leg when given', () => {
    expect(uiPerfLaunchArgs({ S2U_UI_PERF_GL: 'native', S2U_UI_PERF_GL_ARGS: '--use-gl=egl  --ignore-gpu-blocklist' }, SWIFT))
      .toEqual(['--use-gl=egl', '--ignore-gpu-blocklist']);
    expect(uiPerfLaunchArgs({ S2U_UI_PERF_GL: 'native', S2U_UI_PERF_GL_ARGS: ' ' }, SWIFT)).toEqual(UI_PERF_NATIVE_GL_ARGS);
  });
});

describe('GM-02 perf leg: the native leg\'s precondition', () => {
  it('refuses a native leg that still got SwiftShader, or no WebGL at all', () => {
    expect(uiPerfGlRefusal('native', 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)'))
      .toMatch(/native GL.*SwiftShader/);
    expect(uiPerfGlRefusal('native', null)).toMatch(/no WebGL/);
  });
  it('passes llvmpipe, and never refuses the SwiftShader leg', () => {
    expect(uiPerfGlRefusal('native', 'ANGLE (Mesa, llvmpipe (LLVM 19.1.1 256 bits), OpenGL 4.5)')).toBeNull();
    expect(uiPerfGlRefusal(undefined, 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)')).toBeNull();
    expect(uiPerfGlRefusal('swiftshader', null)).toBeNull();
  });
});

describe('GM-02 walk: the popup button answering YES', () => {
  it('reads the slot off the buttons\' captions', () => {
    expect(popupSlotFor(['NO', 'YES'], 'YES')).toEqual({ slot: 2, by: 'caption' });
    expect(popupSlotFor([' yes ', 'NO'], 'YES')).toEqual({ slot: 1, by: 'caption' });
  });
  it('falls back to the record\'s slot 2 (research 118 section 4: the 246 / 253 records, NO first)', () => {
    expect(popupSlotFor(['', ''], 'YES')).toEqual({ slot: 2, by: 'record' });
    expect(popupSlotFor([], 'YES')).toEqual({ slot: 2, by: 'record' });
  });
});
