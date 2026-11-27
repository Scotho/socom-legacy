import { test, expect } from '@playwright/test';
import type { compareStableSkin } from './stableSkinScene';

/** LATER 1168: one WebGL2 program per skinned model, and the draw byte-identical with three's own text (`./stableSkinScene`). */
test('a world and 16 two-material bodies under fog, night vision off and on: fewer links, the same pixels', async ({ page }) => {
  await page.route(/\/__stable-skin(?:\?|$)/, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
  await page.goto('/__stable-skin?renderer=xbox');
  const result = await page.evaluate(async () => {
    const path = '/e2e/stableSkinScene.ts';
    const fixture = await import(/* @vite-ignore */ path) as { compareStableSkin: typeof compareStableSkin };
    return fixture.compareStableSkin();
  });
  console.log(`STABLE_SKIN ${JSON.stringify(result)}`);
  expect(result.backend).toBe('webgl2');
  expect(result.night.lit).toBeGreaterThanOrEqual(result.day.lit / 2);   // the night frame drew the scene, lens-tinted
  expect(result.dayVsNight).toBeGreaterThan(result.day.lit / 4);         // and night vision took effect: unlike the day's
  for (const [k, r] of [['day', result.day], ['night', result.night]] as const) {
    expect(r.lit, k).toBeGreaterThan(100);
    // The scene rendered, not a flat fill. By day the textures, fog and fades (PC 2 c35c86cc4c: 2081 colours). Night vision
    // tints the frame to a few lens shades (the same run: 4 colours, lit 27291 as by day), so at night at least 2 shades,
    // lit at least half the day's, and the frame unlike the day's (below).
    expect(r.colours, k).toBeGreaterThan(k === 'day' ? 8 : 1);
    expect(r.worldDrew[0], k).toBeGreaterThan(500);              // the world's materials drew pixels (the re-review's F1)
    expect(r.worldDrew[1], k).toBe(r.worldDrew[0]);
    expect(r.differences, k).toBe(0);                          // byte-identical: the product track's condition
    expect(r.linksOn, k).toBeLessThan(r.linksOff);
    expect(r.linksOff - r.linksOn, k).toBeGreaterThanOrEqual(15);   // 16 bodies' skinned programs (x2 materials) -> 1 each
  }
});
