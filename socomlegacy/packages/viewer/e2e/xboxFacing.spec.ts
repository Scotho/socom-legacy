import { expect, test } from '@playwright/test';
import type { probeXboxFacing } from './xboxFacingScene';

test('raw facades match current turns, including pole collapse and recovery', async ({ page }) => {
  await page.route('/__xbox-facing', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
  await page.goto('/__xbox-facing');
  const results = await page.evaluate(async () => {
    const path = '/e2e/xboxFacingScene.ts';
    const probe = await import(/* @vite-ignore */ path) as { probeXboxFacing: typeof probeXboxFacing };
    return probe.probeXboxFacing();
  });
  for (const result of results) {
    expect(result.differences, JSON.stringify(result)).toBe(0);
    if (result.eye[1] === 100) { expect(result.lit).toBe(0); expect(result.stats.collapsedFacades).toBe(1); }
    else expect(result.lit).toBeGreaterThan(100);
    expect(result.stats.geometryBuffers).toBe(2);
  }
});
