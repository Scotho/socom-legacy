import { describe, expect, it } from 'vitest';
import { APPLE_CHROMIUM_GRAPHICS_ADAPTATION, APPLE_GPU_RENDERER_ADAPTATION, APPLE_GRAPHICS_ADAPTATION, appleGpu, appleGraphics, chromiumBrowser } from '../src/deviceClass';
import type { GraphicsBackendPreference } from '../src/graphicsBackend';

/**
 * MAC-FLOOR step 1 (INTAKE I-3, tier 1 row 18; player report B-64; product track, a browser adaptation with no original):
 * on an Apple GPU, Automatic draws on WebGL2. A tester's M1 Pro (Chrome 157, 2026-11-21, agent-mail
 * evidence/floor-flicker-mac-2026-11-21/RESULTS.md) showed the world's detail pass missing in 32 px tiles on WebGPU on
 * every map tried and clean on WebGL2, same poses. A player's own WebGPU (saved, handed in, or `?renderer=webgpu`) is kept;
 * only 'auto' changes. Unit test (the table and the renderer strings).
 */

const CHOICES: readonly GraphicsBackendPreference[] = ['auto', 'webgpu', 'webgl2', 'xbox'];

describe('MAC-FLOOR: an Apple GPU is read from the WebGL renderer string', () => {
  it.each([
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)',   // the tester's Chrome (RESULTS.md, chrome-gpu.txt)
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)',
    'Apple M2',                                                               // Firefox on Apple silicon
    'Apple GPU',                                                              // Safari's masked string (macOS, iOS, iPadOS)
    'Apple A17 Pro GPU',
  ])('an Apple GPU: %s', (s) => {
    expect(appleGpu(s)).toBe(true);
  });

  it.each([
    null,
    '',
    'ANGLE (Intel, ANGLE Metal Renderer: Intel(R) Iris(TM) Plus Graphics, Unspecified Version)',   // an Intel Mac: not Apple's tiled GPU
    'ANGLE (AMD, ANGLE Metal Renderer: AMD Radeon Pro 5500M, Unspecified Version)',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
    'Apple Paravirtual device',
  ])('not an Apple GPU: %s', (s) => {
    expect(appleGpu(s)).toBe(false);
  });

  it('the token is named as an adaptation', () => {
    expect(APPLE_GPU_RENDERER_ADAPTATION).toBeInstanceOf(RegExp);
    expect(APPLE_GRAPHICS_ADAPTATION).toBe('webgl2');
  });
});

describe('MAC-FLOOR: appleGraphics, the backend a resolved choice asks for on an Apple GPU', () => {
  it('on an Apple GPU only Automatic changes, to WebGL2; a player\'s WebGPU, WebGL2 and the Xbox pick are kept', () => {
    expect(Object.fromEntries(CHOICES.map((g) => [g, appleGraphics(g, true)]))).toEqual({ auto: 'webgl2', webgpu: 'webgpu', webgl2: 'webgl2', xbox: 'xbox' });
  });

  it('off an Apple GPU every choice is itself', () => {
    for (const g of CHOICES) expect(appleGraphics(g, false), g).toBe(g);
  });
});

/**
 * MAC-AUTO-WEBGPU (the controller's order 2026-11-23, on the owner's standing word: "if it comes back that webgpu works, we
 * can go back to allowing auto to use webgpu where appropriate"): a tester's M1 Pro (Lightspeed, PR #870's comment
 * 2026-11-23T04:03Z; Chrome 157, WebGPU adapter apple/metal-3, v0.4.30 fecc6ba05d; a rendered browser run, 120 poses a
 * check) drew Fish Hook on WebGPU with the invariant mark alone 1 of 120 flagged (33 before), the held pose 0 of 30 (30
 * before), within one edge of WebGL2 on four maps. So in a CHROMIUM browser (Chrome, Edge) Automatic draws WebGPU on an
 * Apple GPU again; Safari (and any other browser on an Apple GPU) stays WebGL2 until tested. A player's own choice wins.
 */
describe('MAC-AUTO-WEBGPU: Automatic on an Apple GPU draws WebGPU in Chromium, WebGL2 elsewhere', () => {
  it('in Chromium only Automatic changes, to WebGPU; a player\'s WebGPU, WebGL2 and the Xbox pick are kept', () => {
    expect(Object.fromEntries(CHOICES.map((g) => [g, appleGraphics(g, true, true)]))).toEqual({ auto: 'webgpu', webgpu: 'webgpu', webgl2: 'webgl2', xbox: 'xbox' });
  });
  it('in Safari (not Chromium) Automatic stays WebGL2; the player\'s choices kept', () => {
    expect(Object.fromEntries(CHOICES.map((g) => [g, appleGraphics(g, true, false)]))).toEqual({ auto: 'webgl2', webgpu: 'webgpu', webgl2: 'webgl2', xbox: 'xbox' });
  });
  it('off an Apple GPU every choice is itself, in any browser', () => {
    for (const g of CHOICES) { expect(appleGraphics(g, false, true), g).toBe(g); expect(appleGraphics(g, false, false), g).toBe(g); }
  });
  it('a Chromium browser: its client-hint brands name Chromium (Chrome, Edge), or its renderer string is ANGLE\'s Metal one', () => {
    const brands = (...b: string[]) => ({ userAgentData: { brands: b.map((brand) => ({ brand, version: '157' })) } });
    expect(chromiumBrowser(brands('Chromium', 'Google Chrome', 'Not=A?Brand'), null)).toBe(true);
    expect(chromiumBrowser(brands('Chromium', 'Microsoft Edge'), null)).toBe(true);
    // an insecure page (a LAN address) has no client hints: Chrome's renderer string still names ANGLE's Metal renderer
    expect(chromiumBrowser({}, 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)')).toBe(true);
  });
  it('not Chromium: Safari (no client hints, the masked "Apple GPU") and Firefox ("Apple M2")', () => {
    expect(chromiumBrowser({}, 'Apple GPU')).toBe(false);
    expect(chromiumBrowser({ userAgentData: undefined }, 'Apple M2')).toBe(false);
    expect(chromiumBrowser(undefined, null)).toBe(false);
  });
  it('the Safari value is still named (WebGL2) and the Chromium value is WebGPU', () => {
    expect(APPLE_GRAPHICS_ADAPTATION).toBe('webgl2');
    expect(APPLE_CHROMIUM_GRAPHICS_ADAPTATION).toBe('webgpu');
  });
});
