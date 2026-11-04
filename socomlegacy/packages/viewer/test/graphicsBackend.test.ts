// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GRAPHICS_BACKEND_KEY, graphicsBackendOverride, readGraphicsBackend, saveGraphicsBackend } from '../src/graphicsBackend';

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
