import { expect, test, type Page } from '@playwright/test';

/**
 * LATER 176 (the merge controller's product-track call, 2026-10-21): on a narrow touch screen the forge's docks are
 * drawers over the viewport (`../src/forge/forge.css`, the 760 px block), and the overlay's touch Menu, pushed below the
 * toolbar (`header.fx-top`, `data-mu-top-bar`; `../src/modern/overlay/index.ts` `measureMenu`), sat over the left dock's
 * assets heading and palette select. The docks now start below the pushed Menu (`--mu-touch-menu-clear`), the toolbar
 * stays clear, and the docks still reach the status strip. Wide screens are unchanged. A browser adaptation (OT.R28).
 */
test.use({ storageState: { cookies: [], origins: [] } });

type Box = { x: number; y: number; width: number; height: number };
const hit = (a: Box, b: Box): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

async function boxes(page: Page): Promise<{ menu: Box; top: Box; left: Box; right: Box; inner: number; status: number }> {
  await expect(page.locator('.mu-touch-menu')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.fx-left')).toBeVisible();
  await page.waitForTimeout(200);
  const b = async (s: string): Promise<Box> => (await page.locator(s).boundingBox())!;
  return {
    menu: await b('.mu-touch-menu'), top: await b('header.fx-top'), left: await b('.fx-left'), right: await b('.fx-right'),
    inner: await page.evaluate(() => innerHeight),
    status: await page.evaluate(() => parseFloat(getComputedStyle(document.body).getPropertyValue('--fx-status')) || 26),
  };
}

for (const size of [{ width: 390, height: 844 }, { width: 360, height: 640 }, { width: 700, height: 900 }]) {
  test.describe(`the forge on a narrow touch screen, ${size.width}x${size.height}`, () => {
    test.use({ hasTouch: true, isMobile: true, viewport: size });

    test('the touch Menu clears the toolbar and both docks; the docks start under it and reach the status strip', async ({ page }) => {
      await page.goto('/forge');
      // A narrow window opens on the viewport, the docks a press away (`../src/forge/page.ts`, `setDocks`): H here, the
      // toolbar's Docks button scrolled to and tapped being `./forgeToolbar.spec.ts`' case (LATER 226).
      await expect(page.locator('.mu-touch-menu')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('.fx-left')).toBeHidden();
      await page.keyboard.press('KeyH');
      const m = await boxes(page);
      await expect(page.locator('body')).toHaveClass(/(^|\s)mu-menu-below-bar(\s|$)/);
      expect(hit(m.menu, m.top), 'the Menu over the toolbar').toBe(false);
      expect(hit(m.menu, m.left), `the Menu over the left dock ${JSON.stringify(m.menu)} vs ${JSON.stringify(m.left)}`).toBe(false);
      expect(hit(m.menu, m.right), 'the Menu over the right dock').toBe(false);
      for (const d of [m.left, m.right]) expect(d.y + d.height, 'a dock reaches the status strip').toBeCloseTo(m.inner - m.status, 0);
    });
  });
}

test.describe('the forge on a wide touch screen', () => {
  const size = { width: 1280, height: 800 };
  test.use({ hasTouch: true, viewport: size });

  test('is as it was: the docks start under the toolbar', async ({ page }) => {
    await page.goto('/forge');
    const m = await boxes(page);
    expect(m.left.y).toBeCloseTo(m.top.y + m.top.height, 0);
    expect(m.right.y).toBeCloseTo(m.top.y + m.top.height, 0);
  });
});
