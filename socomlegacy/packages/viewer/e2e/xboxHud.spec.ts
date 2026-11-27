import { expect, test } from '@playwright/test';
import type { compareXboxHud, compareXboxReticle } from './xboxHudScene';

test('raw HUD matches current HUD for walking, scoreboard and spectator layouts', async ({ page }) => {
  await page.route(/\/__xbox-hud(?:\?|$)/, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
  await page.goto('/__xbox-hud?renderer=xbox');
  const result = await page.evaluate(async () => {
    const path = '/e2e/xboxHudScene.ts';
    const probe = await import(/* @vite-ignore */ path) as { compareXboxHud: typeof compareXboxHud };
    return probe.compareXboxHud();
  });
  for (const phase of result.results) {
    expect(phase.lit, phase.phase).toBeGreaterThan(1000);
    expect(phase.differences, JSON.stringify(phase)).toBe(0);
  }
  expect(result.stats).toMatchObject({ buffers: 1, programs: 1 });
  expect(result.remainingPayload).toBe(0);
});

test('raw firearm reticles match the original rifle, pistol and shotgun quads', async ({ page }) => {
  await page.route('/__xbox-reticle', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
  await page.goto('/__xbox-reticle');
  const result = await page.evaluate(async () => {
    const path = '/e2e/xboxHudScene.ts';
    const probe = await import(/* @vite-ignore */ path) as { compareXboxReticle: typeof compareXboxReticle };
    return probe.compareXboxReticle();
  });
  for (const phase of result.results) {
    expect(phase.lit).toBeGreaterThan(100);
    expect(phase.differences, JSON.stringify(phase)).toBe(0);
  }
  expect(result.stats).toMatchObject({ buffers: 1, programs: 1 });
  expect(result.remainingPayload).toBe(0);
});
