import { expect, test } from '@playwright/test';
import type { measureEdges } from './rendererAntialiasScene';

// Browser adaptation: a compatibility choice must bypass WebGPU even when its API exists. WEBGPU-DEFAULT (WG-7, LATER 708):
// Automatic asks WebGPU first again, so the automatic and webgpu addresses each ask once (the stub answers null: WebGL2).
for (const source of ['address', 'saved setting', 'automatic address', 'webgpu address', 'Xbox preset'] as const) {
  test(`graphics selection from ${source} draws with the expected adapter requests`, async ({ page }) => {
    await page.addInitScript((saved) => {
      const state = window as unknown as { gpuRequests: number };
      state.gpuRequests = 0;
      Object.defineProperty(navigator, 'gpu', { configurable: true, value: {
        requestAdapter: async () => { state.gpuRequests++; return null; },
      } });
      if (saved !== 'address') localStorage.setItem('s2u.viewer.graphicsBackend', saved === 'Xbox preset' ? 'xbox' : 'webgl2');
    }, source);
    await page.route(/\/__graphics-compatibility(?:\?|$)/, route => route.fulfill({
      contentType: 'text/html', body: '<!doctype html><body></body>',
    }));
    await page.goto('/__graphics-compatibility' + (source === 'address' ? '?renderer=webgl2' : source === 'automatic address' ? '?renderer=auto' : source === 'webgpu address' ? '?renderer=webgpu' : ''));
    const result = await page.evaluate(async () => {
      const path = '/e2e/rendererAntialiasScene.ts';
      const fixture = await import(/* @vite-ignore */ path) as { measureEdges: typeof measureEdges };
      const result = await fixture.measureEdges(1);
      return { ...result, requests: (window as unknown as { gpuRequests: number }).gpuRequests };
    });
    expect(result.requests).toBe(source === 'webgpu address' || source === 'automatic address' ? 1 : 0);
    expect(result.backend).toBe('webgl2');
    expect(result.native.antialias).toBe(source !== 'Xbox preset');
    expect(result.restored.antialias).toBe(source !== 'Xbox preset');
    for (const frame of [result.native, result.ps2, result.restored]) {
      expect(frame.white).toBeGreaterThan(1000);
      expect(frame.error).toBe(0);
    }
  });
}
