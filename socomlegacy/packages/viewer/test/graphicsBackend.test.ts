// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_GRAPHICS_BACKEND_ADAPTATION, GRAPHICS_BACKEND_KEY, asksForWebGPU, graphicsBackendOverride, readGraphicsBackend, saveGraphicsBackend } from '../src/graphicsBackend';

beforeEach(() => { localStorage.clear(); history.replaceState(null, '', '/'); });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); history.replaceState(null, '', '/'); });

describe('browser graphics compatibility preference', () => {
  it('defaults to automatic and ignores invalid saved values', () => {
    expect(readGraphicsBackend()).toBe('auto');
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'unexpected');
    expect(readGraphicsBackend()).toBe('auto');
  });
  it('persists the compatibility choice independently of picture mode and can restore automatic', () => {
    localStorage.setItem('s2u.viewer.picture', 'ps2');
    saveGraphicsBackend('webgl2');
    expect(readGraphicsBackend()).toBe('webgl2');
    expect(localStorage.getItem('s2u.viewer.picture')).toBe('ps2');
    saveGraphicsBackend('auto');
    expect(readGraphicsBackend()).toBe('auto');
  });
  it('the address overrides the saved choice without rewriting it', () => {
    saveGraphicsBackend('webgl2');
    expect(readGraphicsBackend('?renderer=auto')).toBe('auto');
    expect(readGraphicsBackend('?renderer=invalid')).toBe('webgl2');
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('webgl2');
    saveGraphicsBackend('auto');
    expect(readGraphicsBackend('?renderer=webgl2')).toBe('webgl2');
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('auto');
    expect(graphicsBackendOverride('?renderer=invalid')).toBeNull();
  });
  it('the explicit compatibility address still works when browser storage is denied', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readGraphicsBackend('?renderer=webgl2')).toBe('webgl2');
    expect(() => saveGraphicsBackend('webgl2')).not.toThrow();
  });
});


it('keeps an explicit Xbox preset across reload reads, with a temporary address override', () => {
  localStorage.setItem(GRAPHICS_BACKEND_KEY, 'xbox');
  expect(readGraphicsBackend()).toBe('xbox');
  expect(readGraphicsBackend('?renderer=auto')).toBe('auto');
  expect(readGraphicsBackend('?renderer=webgl2')).toBe('webgl2');
  expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('xbox');
  expect(readGraphicsBackend('?renderer=xbox')).toBe('xbox');
});

// WEBGL2-DEFAULT (the owner's word, 2026-11-05; a browser adaptation, product track): Automatic -- no address, no saved
// choice, or ?renderer=auto -- resolves to WebGL2 while the WebGPU black world is open (PR #684); ?renderer=webgpu and a
// saved 'webgpu' ask for WebGPU as Automatic did before (adapterWait's bound still applies). LATER 708 flips it back.
describe('WEBGL2-DEFAULT: the default backend is WebGL2; WebGPU is an explicit choice', () => {
  it('the default is one named constant, WebGL2', () => {
    expect(DEFAULT_GRAPHICS_BACKEND_ADAPTATION).toBe('webgl2');
  });
  it('no parameter and no saved value resolve to WebGL2', () => {
    expect(asksForWebGPU(readGraphicsBackend())).toBe(false);
  });
  it('?renderer=auto resolves to WebGL2; ?renderer=webgl2 and ?renderer=xbox too', () => {
    expect(asksForWebGPU(readGraphicsBackend('?renderer=auto'))).toBe(false);
    expect(asksForWebGPU(readGraphicsBackend('?renderer=webgl2'))).toBe(false);
    expect(readGraphicsBackend('?renderer=xbox')).toBe('xbox');
    expect(asksForWebGPU(readGraphicsBackend('?renderer=xbox'))).toBe(false);
  });
  it('?renderer=webgpu asks for WebGPU without rewriting the saved choice', () => {
    saveGraphicsBackend('webgl2');
    expect(graphicsBackendOverride('?renderer=webgpu')).toBe('webgpu');
    expect(readGraphicsBackend('?renderer=webgpu')).toBe('webgpu');
    expect(asksForWebGPU(readGraphicsBackend('?renderer=webgpu'))).toBe(true);
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('webgl2');
  });
  it('a saved webgpu preference is honoured across reads, as webgl2 and xbox are', () => {
    saveGraphicsBackend('webgpu');
    expect(readGraphicsBackend()).toBe('webgpu');
    expect(asksForWebGPU(readGraphicsBackend())).toBe(true);
    expect(readGraphicsBackend('?renderer=auto')).toBe('auto');
  });
  it('renderer.ts asks the adapter only when the choice resolves to WebGPU (adapterWait bound kept)', () => {
    const text = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/renderer.ts'), 'utf-8');
    expect(text).toContain('const webgpu = asksForWebGPU(graphics) && await webgpuAnswers(');
    expect(text).not.toContain("graphics === 'auto' && await webgpuAnswers(");
  });
});
