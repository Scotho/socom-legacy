import { expect, test } from '@playwright/test';
import type { measureEdges } from './rendererAntialiasScene';

test.use({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

for (const ratio of [1.5, 0.75]) {
  test(`native WebGL smooths edges at phone ratio ${ratio}, PS2 stays unsmoothed`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined }));
    await page.route('**/__renderer-antialias', route => route.fulfill({
      contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><body></body>',
    }));
    await page.goto('/__renderer-antialias');
    const result = await page.evaluate(async ({ ratio, modulePath }) => {
      const fixture = await import(/* @vite-ignore */ modulePath) as { measureEdges: typeof measureEdges };
      return fixture.measureEdges(ratio);
    }, { ratio, modulePath: '/e2e/rendererAntialiasScene.ts' });
    await testInfo.attach('framebuffer-measurements', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    expect(errors).toEqual([]);
    expect(result.backend).toBe('webgl2');
    for (const frame of [result.native, result.restored]) {
      expect(frame.width).toBe(Math.floor(844 * ratio));
      expect(frame.height).toBe(Math.floor(390 * ratio));
      expect(frame.antialias).toBe(true);
      expect(frame.samples).toBeGreaterThan(0);
      expect(frame.intermediate).toBeGreaterThan(100);
      expect(frame.white).toBeGreaterThan(1000);
      expect(frame.error).toBe(0);
    }
    expect(result.ps2.width).toBe(640);
    expect(result.ps2.height).toBe(448);
    expect(result.ps2.white).toBeGreaterThan(1000);
    expect(result.ps2.intermediate).toBe(0);
    expect(result.ps2.error).toBe(0);
  });
}
