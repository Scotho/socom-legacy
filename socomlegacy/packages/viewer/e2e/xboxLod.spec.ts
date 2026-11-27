import { expect, test } from '@playwright/test';
import type { probeXboxLod } from './xboxLodScene';

test('raw LOD crosses bands with the current fade and unfaded alpha mask', async ({ page }) => {
  await page.route('/__xbox-lod', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
  await page.goto('/__xbox-lod');
  const results = await page.evaluate(async () => {
    const path = '/e2e/xboxLodScene.ts';
    const probe = await import(/* @vite-ignore */ path) as { probeXboxLod: typeof probeXboxLod };
    return probe.probeXboxLod();
  });
  for (const result of results) {
    for (let channel = 0; channel < 3; channel++) expect(Math.abs(result.pixel[channel]! - result.expected[channel]!), JSON.stringify(result)).toBeLessThanOrEqual(1);
    expect(result.stats.geometryBuffers).toBe(2);
    expect(result.stats.drawCalls).toBe(result.shared ? (result.distance === 110 ? 3 : 2) : result.distance === 110 || result.magnification === 9 ? 2 : 1);
  }
});
