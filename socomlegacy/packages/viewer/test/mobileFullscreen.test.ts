// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { mountMenuTouch } from '../src/menuTouch';
import { applyMobileLayout, decodeLayout, readMobileLayout, saveMobileLayout } from '../src/mobileLayout';

let dispose = () => {};
afterEach(() => {
  dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); document.body.innerHTML = '';
  for (const key of ['exitFullscreen', 'fullscreenElement', 'webkitExitFullscreen', 'webkitFullscreenElement']) Reflect.deleteProperty(document, key);
  for (const key of ['requestFullscreen', 'webkitRequestFullscreen']) Reflect.deleteProperty(document.documentElement, key);
});
function menu() {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  const canvas = document.createElement('canvas'); document.body.append(canvas);
  const mounted = mountMenuTouch(canvas, window); dispose = mounted.dispose;
  const button = document.querySelector<HTMLButtonElement>('#fullscreen');
  expect(button, 'fullscreen is available on the phone menu before a match').not.toBeNull();
  return button!;
}

it('offers fullscreen on the mobile menu, enters/exits on tap, and removes its listener on disposal', async () => {
  const request = vi.fn().mockResolvedValue(undefined), exit = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: request });
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
  const button = menu();
  button.click(); await Promise.resolve(); await Promise.resolve();
  expect(request).toHaveBeenCalledTimes(1);
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.documentElement });
  document.dispatchEvent(new Event('fullscreenchange'));
  expect(button.getAttribute('aria-label')).toBe('Exit fullscreen');
  button.click(); await Promise.resolve(); await Promise.resolve();
  expect(exit).toHaveBeenCalledTimes(1);
  dispose(); button.click();
  expect(exit).toHaveBeenCalledTimes(1);
  expect(document.querySelector('#fullscreen')).toBeNull();
});

it('saves fullscreen placement independently for both orientations and resets the actual hit target', () => {
  const button = menu();
  const layout = decodeLayout(JSON.stringify({ version: 1,
    landscape: { fullscreen: { x: 0.25, y: 0.3 } }, portrait: { fullscreen: { x: 0.8, y: 0.7 } } }));
  expect(layout.landscape).toEqual({ fullscreen: { x: 0.25, y: 0.3 } });
  expect(saveMobileLayout(layout)).toBe(true);
  expect(readMobileLayout()).toEqual(layout);
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({ width: 44, height: 44 } as DOMRect);
  const bounds = { left: 8, top: 64, width: 800, height: 300 };
  applyMobileLayout(document.body, layout.landscape, bounds);
  expect(button.style.left).toBe('197px');
  applyMobileLayout(document.body, {}, bounds);
  expect(button.style.left).toBe('');
});

it('reports an unavailable or refused fullscreen request without breaking touch controls', async () => {
  const button = menu();
  button.click(); await Promise.resolve(); await Promise.resolve();
  expect(document.querySelector('[data-fullscreen-status]')?.textContent).toContain('not available');
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: vi.fn().mockRejectedValue(new Error('refused')) });
  button.click(); await Promise.resolve(); await Promise.resolve();
  expect(document.querySelector<HTMLElement>('[data-fullscreen-status]')?.hidden).toBe(false);
});

it('uses the prefixed request and exit with their correct receivers', async () => {
  const request = vi.fn(function (this: HTMLElement) { expect(this).toBe(document.documentElement); });
  const exit = vi.fn(function (this: Document) { expect(this).toBe(document); });
  Object.defineProperty(document.documentElement, 'webkitRequestFullscreen', { configurable: true, value: request });
  Object.defineProperty(document, 'webkitExitFullscreen', { configurable: true, value: exit });
  const button = menu(); button.click(); await Promise.resolve(); await Promise.resolve();
  expect(request).toHaveBeenCalledTimes(1);
  Object.defineProperty(document, 'webkitFullscreenElement', { configurable: true, value: document.documentElement });
  document.dispatchEvent(new Event('webkitfullscreenchange'));
  expect(button.getAttribute('aria-label')).toBe('Exit fullscreen');
  button.click(); await Promise.resolve();
  expect(exit).toHaveBeenCalledTimes(1);
});
