import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type {} from '../src/hook';
import { TEST_ROOM } from './urls';
import { holdReleased } from './loadHold';

// Browser adaptation: loading must stop holding dynamic resolution once the scene is ready.
// Exercise the page's actual loading/frame wiring; the AdaptiveRatio unit tests alone cannot catch a stuck hold.
test.use({ deviceScaleFactor: 2, viewport: { width: 960, height: 540 } });
test('testroom resumes adaptive resolution after world and props warm-up', async ({ page }) => {
  test.skip(!existsSync(fileURLToPath(new URL('../../../public/maps/RUN/MP2.ZDB', import.meta.url))), 'needs extracted Frostfire');
  test.setTimeout(180_000);
  // CPS (the render scale, CPS.R7): the Balanced default caps the buffer at CSS pixels, so at deviceScaleFactor 2 this
  // page would start at the loading hold's 0.75 with no 2x above it. This test is about the hold and the trade, not the
  // cap: it runs at Quality (no cap), the numbers the test was written against. The keeper reads the page store at load.
  await page.addInitScript(() => { try { localStorage.setItem('s2u.viewer.video', JSON.stringify({ renderScale: 'quality', shadows: true })); } catch { /* no store: the default */ } });
  await page.goto(`${TEST_ROOM}?map=MP2&mode=play&view=modern&online=off&devmode&noarmory&nomatch`);
  await page.waitForFunction(() => (window.__viewer?.links().warmed['world'] ?? 0) > 0);
  await holdReleased(page);
  const initial = await page.locator('#view').evaluate((c) => (c as HTMLCanvasElement).width / c.clientWidth);
  expect(initial, 'loading must finish with room to reduce resolution').toBeGreaterThan(0.75);
  // A repeatable slow browser frame, with the real clock and renderer. No game settings or simulation values change.
  await page.evaluate(() => {
    const until = performance.now() + 12_000;
    const slow = (): void => {
      if (performance.now() >= until) return;
      const end = performance.now() + 35;
      while (performance.now() < end) { /* deliberate test-only main-thread load */ }
      requestAnimationFrame(slow);
    };
    requestAnimationFrame(slow);
  });
  await expect.poll(() => page.locator('#view').evaluate((c) => (c as HTMLCanvasElement).width / c.clientWidth), { timeout: 10_000 }).toBeLessThan(initial - 0.1);
  // PS2 presentation is intentionally fixed, even during the same slow frames.
  await page.locator('[data-look="ps2"]').click({ force: true });
  await expect.poll(() => page.locator('#view').evaluate(c => [(c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height])).toEqual([640, 448]);
  await page.waitForTimeout(2500);
  expect(await page.locator('#view').evaluate(c => [(c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height])).toEqual([640, 448]);
});
