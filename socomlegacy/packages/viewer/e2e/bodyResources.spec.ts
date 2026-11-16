import { test, expect } from '@playwright/test';
import type { compareBodyResources } from './bodyResourcesScene';

test('shared body resources draw the same pixels before and after other players leave', async ({ page }) => {
  await page.route(/\/__body-resources(?:\?|$)/, route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><body></body>',
  }));
  await page.goto('/__body-resources?renderer=xbox');
  const result = await page.evaluate(async () => {
    const path = '/e2e/bodyResourcesScene.ts';
    const fixture = await import(/* @vite-ignore */ path) as { compareBodyResources: typeof compareBodyResources };
    return fixture.compareBodyResources();
  });
  expect(result.backend).toBe('webgl2');
  expect(result.separate).toEqual({ geometry: 16, textures: 16 });
  expect(result.shared).toEqual({ geometry: 1, textures: 1 });
  expect(result.firstLit).toBeGreaterThan(100);
  expect(result.remainingLit).toBeGreaterThan(100);
  expect(result.remainingLit).toBeLessThan(result.firstLit);
  expect(result.firstDifferences).toBe(0);
  expect(result.removalDifferences).toBe(0);
});
