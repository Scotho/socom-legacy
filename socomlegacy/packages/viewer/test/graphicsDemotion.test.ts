// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BEACON_MIN_GAP_MS_ADAPTATION, ClientErrorBeacon, installClientErrorBeacon, resetPageClientErrorBeaconForTest, type BeaconReport } from '../src/clientErrorBeacon';
import { GRAPHICS_BACKEND_KEY, saveGraphicsBackend } from '../src/graphicsBackend';
import { GRAPHICS_DEMOTED_KEY, armGraphicsDemotion, readGraphicsDemoted, resetGraphicsDemotionForTest } from '../src/graphicsDemotion';
import { onGraphicsEvent, resetGraphicsRecordForTest, watchGraphicsErrors, watchGraphicsLost } from '../src/graphicsLost';
import { PAGE_SETTING_KEYS } from '../src/pageStore';

/**
 * WG-7, W5 (product track, a browser adaptation; investigation B §6 criterion 5): with Automatic asking WebGPU first, a
 * WebGPU page that loses its device or reports its first uncaptured GPU error saves WebGL2 under the
 * Graphics mode key, with a one-line reason, once; the page says so and asks for a reload, and the beacon is told once.
 * An address override (`?renderer=`) and an explicit WebGPU choice are the player's own and are never overwritten.
 */
const here = dirname(fileURLToPath(import.meta.url));
const AT = new Date(Date.UTC(2026, 10, 7, 3, 30, 43));

function webgpuRenderer() {
  const r = { onError: (_i: unknown) => undefined, onDeviceLost: (_i: unknown) => undefined };
  watchGraphicsErrors(r, document, () => AT);
  watchGraphicsLost(r, document, () => AT);
  return r;
}

beforeEach(() => { localStorage.clear(); history.replaceState(null, '', '/'); });
afterEach(() => {
  vi.restoreAllMocks(); localStorage.clear(); history.replaceState(null, '', '/');
  resetGraphicsDemotionForTest(); resetGraphicsRecordForTest(); resetPageClientErrorBeaconForTest(); document.body.innerHTML = '';
});

describe('WG-7 W5: a WebGPU error demotes Automatic to WebGL2, once', () => {
  it('a lost WebGPU device: webgl2 saved under the existing key with a one-line reason, the reload notice shown', () => {
    armGraphicsDemotion(document, '', () => AT);
    const r = webgpuRenderer();
    r.onDeviceLost({ api: 'WebGPU', message: 'D3D12 device removed\nDXGI_ERROR_DEVICE_REMOVED', reason: 'unknown' } as never);
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('webgl2');
    const why = localStorage.getItem(GRAPHICS_DEMOTED_KEY)!;
    expect(why).toBe('WebGPU device lost at 03:30:43Z: D3D12 device removed / DXGI_ERROR_DEVICE_REMOVED');
    expect(why).not.toContain('\n');
    expect(readGraphicsDemoted()).toBe(why);
    const note = document.querySelector('[data-graphics-demoted]')!;
    expect(note.textContent).toBe('Graphics mode set to WebGL2 after a WebGPU error. Reload the page to continue.');
    expect(note.classList.contains('s2u-notice')).toBe(true);
  });

  it('the first uncaptured error demotes; later errors and a later loss write nothing more', () => {
    armGraphicsDemotion(document, '', () => AT);
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const r = webgpuRenderer();
    r.onError({ api: 'WebGPU', type: 'ValidationError', message: 'Destroyed buffer used in submit.' } as never);
    r.onError({ api: 'WebGPU', type: 'ValidationError', message: 'again' } as never);
    r.onDeviceLost({ api: 'WebGPU', message: 'lost', reason: null } as never);
    expect(set.mock.calls.filter(([k]) => k === GRAPHICS_BACKEND_KEY)).toEqual([[GRAPHICS_BACKEND_KEY, 'webgl2']]);
    expect(set.mock.calls.filter(([k]) => k === GRAPHICS_DEMOTED_KEY).length).toBe(1);
    expect(localStorage.getItem(GRAPHICS_DEMOTED_KEY)).toBe('WebGPU ValidationError at 03:30:43Z: Destroyed buffer used in submit.');
  });

  it('arming twice (a page that makes more than one renderer) still demotes once', () => {
    const seen: string[] = [];
    onGraphicsEvent((k) => { seen.push(k); });
    armGraphicsDemotion(document, '', () => AT);
    armGraphicsDemotion(document, '', () => AT);
    webgpuRenderer().onDeviceLost({ api: 'WebGPU', message: 'lost', reason: null } as never);
    expect(seen.filter((k) => k === 'gpudemoted')).toEqual(['gpudemoted']);
  });

  it('an address override is never overwritten: ?renderer=auto and ?renderer=webgpu write nothing', () => {
    for (const search of ['?renderer=auto', '?renderer=webgpu']) {
      saveGraphicsBackend('auto');
      armGraphicsDemotion(document, search, () => AT);
      webgpuRenderer().onDeviceLost({ api: 'WebGPU', message: 'lost', reason: null } as never);
      expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('auto');
      expect(localStorage.getItem(GRAPHICS_DEMOTED_KEY)).toBeNull();
      expect(document.querySelector('[data-graphics-demoted]')).toBeNull();
      resetGraphicsDemotionForTest(); resetGraphicsRecordForTest();
    }
  });

  it('an explicit WebGPU choice is the player\'s own: not overwritten', () => {
    saveGraphicsBackend('webgpu');
    armGraphicsDemotion(document, '', () => AT);
    webgpuRenderer().onError({ api: 'WebGPU', type: 'ValidationError', message: 'x' } as never);
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('webgpu');
    expect(localStorage.getItem(GRAPHICS_DEMOTED_KEY)).toBeNull();
  });

  it('a lost WebGL context (three\'s WebGL fallback) is not a WebGPU error: nothing demoted', () => {
    armGraphicsDemotion(document, '', () => AT);
    webgpuRenderer().onDeviceLost({ api: 'WebGL', message: 'context lost', reason: null } as never);
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBeNull();
    expect(readGraphicsDemoted()).toBeNull();
  });

  it('the reason is read only while WebGL2 is still the saved choice', () => {
    localStorage.setItem(GRAPHICS_DEMOTED_KEY, 'WebGPU device lost at 03:30:43Z: lost');
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'auto');
    expect(readGraphicsDemoted()).toBeNull();
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'webgl2');
    expect(readGraphicsDemoted()).toBe('WebGPU device lost at 03:30:43Z: lost');
  });

  it('the reason key is one of the page\'s registered keys', () => {
    expect(GRAPHICS_DEMOTED_KEY).toBe('s2u.viewer.graphicsDemoted');
    expect(PAGE_SETTING_KEYS).toContain(GRAPHICS_DEMOTED_KEY);
  });

  it('createRenderer arms the demotion only on a page that asked WebGPU and got an adapter', () => {
    const text = readFileSync(resolve(here, '../src/renderer.ts'), 'utf-8');
    expect(text).toContain('if (webgpu) armGraphicsDemotion();');
  });
});

describe('WG-7 W5: the beacon is told of a demotion once, past the send gap', () => {
  it('the error and the demotion both send, the demotion once, with nothing personal beyond the reason', () => {
    const sent: BeaconReport[] = [];
    const b = new ClientErrorBeacon({ context: () => ({ release: 'v0.4.13', builtAt: null, backend: 'webgpu', adapter: null, map: 'MP2', matchElapsedMs: 10 }), send: (body) => { sent.push(JSON.parse(body) as BeaconReport); }, now: () => 0, enabled: () => true, pageId: 'page-1' });
    const off = installClientErrorBeacon(window, b);
    armGraphicsDemotion(document, '', () => AT);
    const r = webgpuRenderer();
    r.onError({ api: 'WebGPU', type: 'ValidationError', message: 'Destroyed buffer used in submit.' } as never);
    r.onError({ api: 'WebGPU', type: 'ValidationError', message: 'again' } as never);
    expect(BEACON_MIN_GAP_MS_ADAPTATION).toBeGreaterThan(0);                 // the two reports came at the same instant
    expect(sent.map((s) => s.kind)).toEqual(['gpuuncapturederror', 'gpudemoted']);
    expect(sent[1]).toMatchObject({ kind: 'gpudemoted', backend: 'webgpu', message: 'WebGPU ValidationError at 03:30:43Z: Destroyed buffer used in submit.', count: 1 });
    expect(b.record().counts.gpudemoted).toBe(1);
    off();
  });
});
