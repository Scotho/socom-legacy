import { expect, test, type Page } from '@playwright/test';
// `src/hook.ts` is types only; its `declare global` is what makes `window.__viewer` exist inside `page.evaluate`.
import type {} from '../src/hook';
import { TEST_ROOM } from './urls';

/**
 * The settings panel on a phone held sideways (the open issue from round 3): opened, it docks in the top middle band --
 * right of the left edge's fullscreen and peek buttons, left of the zoom row under the compass, above the stick's zone
 * and the kit's row -- and scrolls inside itself, so no touch control is under it, flying or walking. Held upright it is
 * as it was: the full width under the bar.
 */

test.use({ storageState: { cookies: [], origins: [] } });

type Rect = { x: number; y: number; width: number; height: number };
const hit = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/**
 * Every touch button on the screen now, and the fullscreen button, with their rects. The two stick zones are open ground
 * (a half of the screen each while walking): the panel lies over them, and a thumb on the panel is the panel's.
 */
function controls(page: Page): Promise<Array<{ id: string } & Rect>> {
  return page.evaluate(() => {
    const els = [...document.querySelectorAll<HTMLElement>('#touch button, #fullscreen')];
    return els
      .map((e) => { const r = e.getBoundingClientRect(); return { id: e.id, x: r.x, y: r.y, width: r.width, height: r.height, shown: getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' }; })
      .filter((c) => c.shown && c.width > 0 && c.height > 0)
      .map(({ shown: _, ...c }) => c);
  });
}

async function openPanel(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await page.goto(`${TEST_ROOM}?mode=play&fly&devmode`);
  await expect(page.locator('#status')).toContainText(/triangles|tris/);
  await expect(page.locator('#panel')).toBeHidden();
  await page.locator('#panel-toggle').click();
  await expect(page.locator('#panel')).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.evaluate(() => document.getElementById('mobile-tip-close')?.click());   // the first visit's tip
}

/** Whether an element is wholly on the screen. */
async function onScreen(page: Page, selector: string, size: { width: number; height: number }): Promise<void> {
  const b = (await page.locator(selector).boundingBox())!;
  expect(b, selector).toBeTruthy();
  expect(b.x, selector).toBeGreaterThanOrEqual(0);
  expect(b.y, selector).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width, selector).toBeLessThanOrEqual(size.width + 0.5);
  expect(b.y + b.height, selector).toBeLessThanOrEqual(size.height + 0.5);
}

for (const size of [{ width: 812, height: 375 }, { width: 667, height: 375 }, { width: 915, height: 412 }]) {
  test.describe(`the panel on a phone held sideways, ${size.width}x${size.height}`, () => {
    test.use({ hasTouch: true, isMobile: true, viewport: size });

    test('open, it covers no touch control, flying or walking, and still scrolls to its end', async ({ page }) => {
      await openPanel(page, size);
      for (const mode of ['fly', 'walk'] as const) {
        expect(await page.evaluate((m) => window.__viewer.setMode(m), mode)).toBe(true);
        await expect(page.locator(mode === 'walk' ? '#tw-r1' : '#touch-lift')).toBeVisible();
        await page.waitForTimeout(100);
        const panel = (await page.locator('#panel').boundingBox())!;
        // On the screen, and a usable size.
        expect(panel.x).toBeGreaterThanOrEqual(0);
        expect(panel.y).toBeGreaterThanOrEqual(0);
        expect(panel.x + panel.width).toBeLessThanOrEqual(size.width);
        expect(panel.y + panel.height).toBeLessThanOrEqual(size.height);
        expect(panel.width, 'the panel is wide enough to read').toBeGreaterThanOrEqual(240);
        expect(panel.height, 'the panel is tall enough to use').toBeGreaterThanOrEqual(110);
        const shown = await controls(page);
        expect(shown.length, `${mode}: the touch controls are there`).toBeGreaterThan(mode === 'walk' ? 7 : 2);
        for (const c of shown) expect(hit(panel, c), `${mode}: the panel over #${c.id} ${JSON.stringify(c)} vs ${JSON.stringify(panel)}`).toBe(false);
        // The body scrolls to its last section: nothing in it is out of reach.
        const reach = await page.evaluate(() => {
          const body = document.getElementById('panel-body')!;
          body.scrollTop = body.scrollHeight;
          return Math.abs(body.scrollHeight - body.clientHeight - body.scrollTop) <= 1;
        });
        expect(reach).toBe(true);
      }
      // Folded, nothing of it shows.
      await page.locator('#panel-toggle').click();
      await expect(page.locator('#panel')).toBeHidden();
    });

    // LATER 209 (the merge controller's product-track call, 2026-10-21): with a pad connected the touch layer is not drawn
    // (`.pad-on`, `../src/styles.css`), so the touch Menu stays under the bar and the opened panel keeps the height the
    // Menu leaves (`../src/modern/overlay/overlay.css`), not the 55vh floor that only clears the touch layer's bottom row.
    // The pad unplugged with the panel open, the touch layer's row is cleared again and the panel's left and width hold:
    // the Menu docks again (LATER 198), so the class drops and the floor there is the page's own (`../src/styles.css`'s
    // sideways block); overlay.css's `:not(.pad-on)` block itself is held by `../test/modern/overlayTouchMenu.test.ts`.
    test('with a pad connected, the panel keeps the height under the touch Menu; unplugged, the floor is back in place', async ({ page }) => {
      await page.addInitScript(() => {
        const w = window as unknown as { __pad: unknown };
        w.__pad = {
          id: 'Test pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
          buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
        };
        Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [w.__pad] });
      });
      await openPanel(page, size);
      await expect(page.locator('body')).toHaveClass(/(^|\s)pad-on(\s|$)/);
      await expect(page.locator('body')).toHaveClass(/(^|\s)mu-menu-below-bar(\s|$)/);
      const measure = (): Promise<{ max: number; clear: number; inner: number }> => page.evaluate(() => ({
        max: parseFloat(getComputedStyle(document.getElementById('panel-body')!).maxHeight),
        clear: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mu-touch-menu-clear')),
        inner: window.innerHeight,
      }));
      const on = await measure();
      expect(on.max, 'pad on: the height the touch Menu leaves').toBeCloseTo(on.inner - on.clear - 16, 0);
      const before = (await page.locator('#panel').boundingBox())!;
      await page.evaluate(() => { (window as unknown as { __pad: unknown }).__pad = null; });
      await expect(page.locator('body')).not.toHaveClass(/(^|\s)pad-on(\s|$)/);
      await page.waitForTimeout(100);
      const off = await measure();
      expect(off.max, 'unplugged: the touch layer\'s row cleared again').toBeLessThanOrEqual(0.55 * off.inner);
      const after = (await page.locator('#panel').boundingBox())!;
      expect(after.x, 'the panel\'s left holds').toBeCloseTo(before.x, 0);
      expect(after.width, 'the panel\'s width holds').toBeCloseTo(before.width, 0);
      const shown = await controls(page);
      for (const c of shown) expect(hit(after, c), `unplugged: the panel over #${c.id}`).toBe(false);
    });

    test('the Mode and Online settings, the Controls popover and the bar all fit', async ({ page }) => {
      await openPanel(page, size);
      for (const id of ['#recom', '#online', '#site-links']) {
        await page.locator(id).scrollIntoViewIfNeeded();
        await onScreen(page, id, size);
      }
      await page.locator('#panel-toggle').click();
      await page.locator('#controls-toggle').click();
      await expect(page.locator('#controls')).toBeVisible();
      await onScreen(page, '#controls', size);
      await onScreen(page, '#controls-tabs', size);
      await page.locator('#controls-tab-pad').click();
      await expect(page.locator('#pad-list')).toBeVisible();
      await onScreen(page, '#controls', size);
    });

    test('the disc page fits, its card and its button on the screen', async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto(`${TEST_ROOM}?mode=play`);                                          // no ?devmode: the player's own disc
      await expect(page.locator('#disc-page')).toBeVisible();
      await onScreen(page, '#disc-page', size);
      await page.locator('#disc-pick').scrollIntoViewIfNeeded();
      await onScreen(page, '#disc-pick', size);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      expect(wide, 'nothing scrolls sideways').toBe(true);
    });
  });
}

for (const upright of [{ width: 360, height: 640 }, { width: 375, height: 812 }, { width: 412, height: 915 }]) {
  test.describe(`the touch pad on a phone held upright, ${upright.width}x${upright.height}`, () => {
    test.use({ hasTouch: true, isMobile: true, viewport: upright });

    test('folded, the panel leaves the walk\'s pad: every touch control on the screen, none over another (MP-1)', async ({ page }) => {
      await openPanel(page, upright);
      await page.locator('#panel-toggle').click();
      await expect(page.locator('#panel')).toBeHidden();
      expect(await page.evaluate(() => window.__viewer.setMode('walk'))).toBe(true);
      await expect(page.locator('#tw-r1')).toBeVisible();
      await page.waitForTimeout(100);
      const shown = await controls(page);
      expect(shown.length, 'the pad\'s sixteen and the fullscreen button').toBeGreaterThanOrEqual(17);
      for (const c of shown) {
        expect(c.x, c.id).toBeGreaterThanOrEqual(0);
        expect(c.y, c.id).toBeGreaterThanOrEqual(0);
        expect(c.x + c.width, c.id).toBeLessThanOrEqual(upright.width);
        expect(c.y + c.height, c.id).toBeLessThanOrEqual(upright.height);
      }
      for (const [i, a] of shown.entries()) for (const c of shown.slice(i + 1)) expect(hit(a, c), `#${a.id} over #${c.id}`).toBe(false);
    });
  });
}

test.describe('the panel on a phone held upright', () => {
  const size = { width: 375, height: 812 };
  test.use({ hasTouch: true, isMobile: true, viewport: size });

  test('is as it was: the full width under the bar', async ({ page }) => {
    await openPanel(page, size);
    const panel = (await page.locator('#panel').boundingBox())!;
    expect(panel.x).toBeCloseTo(8, 0);
    // Under the bar, or under the touch Menu pushed below it (SITE-LINKS-MENU F2, `--mu-touch-menu-clear`; LATER 198).
    const clear = await page.evaluate(() => (document.body.classList.contains('mu-menu-below-bar')
      ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mu-touch-menu-clear')) : 60));
    expect(panel.y).toBeCloseTo(clear, 0);
    expect(panel.width).toBeCloseTo(size.width - 16, 0);
    for (const id of ['#recom', '#online']) {
      await page.locator(id).scrollIntoViewIfNeeded();
      await onScreen(page, id, size);
    }
  });

  test('the disc page and the Controls popover fit upright too', async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto(`${TEST_ROOM}?mode=play`);
    await expect(page.locator('#disc-page')).toBeVisible();
    await onScreen(page, '#disc-page', size);
    await page.locator('#controls-toggle').click();
    await expect(page.locator('#controls')).toBeVisible();
    await onScreen(page, '#controls', size);
  });
});
