import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type {} from '../src/hook';
import { TEST_ROOM } from './urls';

// Browser adaptation (PR #631): a lost WebGL context -- what the Xbox's white game area looked like -- puts the browser's
// reason on the page (`../src/graphicsLost.ts`), on the Xbox preset's WebGL2 path. The loss is the browser's own
// WEBGL_lose_context, on the page's real renderer; no game value changes.
test('a lost WebGL context shows the graphics-stopped notice', async ({ page }) => {
  test.skip(!existsSync(fileURLToPath(new URL('../../../public/maps/RUN/MP2.ZDB', import.meta.url))), 'needs extracted Frostfire');
  test.setTimeout(180_000);
  await page.goto(`${TEST_ROOM}?map=MP2&mode=play&view=modern&online=off&devmode&noarmory&nomatch&renderer=xbox`);
  await page.waitForFunction(() => (window.__viewer?.links().warmed['world'] ?? 0) > 0);
  await expect(page.locator('[data-graphics-lost]')).toHaveCount(0);
  await page.locator('#view').evaluate((c) => {
    (c as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
  });
  await expect(page.locator('[data-graphics-lost]')).toContainText(/Graphics stopped at \d\d:\d\d:\d\dZ \(WebGL: /);
});
