import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * FUI-22 (the owner, 2026-10-27: "The Asset Viewer should dissapear, but keep the object preview and add it as a tooltip
 * overlay on any of the hovered or active Assets"; "In that pass, include a right panel UI refresh and a left panel
 * polish pass."; a browser adaptation, FG.R2 -- the game has no editor): the rendered pass. The tooltip on a hovered
 * tile (after its delay, beside the tile, never over it, its canvas drawn), on the active one (the `]` prop step, no
 * hover) and on a touch long press; the right dock's tabs each showing their own sections; the left and right panels at
 * 1280x720 and at a narrow width. Screenshots go to `FORGE_SHOTS_DIR` (beside the "today" ones) or the test's output.
 * Needs a served archive (`socomlegacy/public/maps`); without one it is skipped, not passed.
 */
const MAPS = fileURLToPath(new URL('../../../public/maps', import.meta.url));
const HAVE = existsSync(join(MAPS, 'index.json')) && existsSync(join(MAPS, 'RUN', 'MP2.ZDB'));

test.skip(!HAVE, 'needs socomlegacy/public/maps/index.json and RUN/MP2.ZDB (not committed)');
test.setTimeout(240_000);

const shot = async (page: Page, name: string, out: string): Promise<void> => {
  const dir = process.env['FORGE_SHOTS_DIR'] ?? out;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `fui22-${name}.png`) });
};
const open = async (page: Page, size: { width: number; height: number }): Promise<void> => {
  await page.setViewportSize(size);
  await page.goto('/forge?devmode');
  await expect(page.locator('.fx-vp-label')).toContainText('·', { timeout: 120_000 });
  // At 760 px and under the docks are closed drawers (forge.css, LATER 176; the page opens on the viewport): the Docks button
  // opens both, the left list and the right dock's tabs with them.
  if (size.width <= 760) await page.locator('.fx-top button[aria-label="Docks"]').click();
  await expect(page.locator('.fx-left > ul.fx-assets > li[data-asset]').first()).toBeVisible({ timeout: 120_000 });
};
const apart = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean =>
  a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;

for (const size of [{ width: 1280, height: 720 }, { width: 760, height: 720 }]) {
  test(`the tooltip on a hovered and an active tile, and the two docks, at ${size.width}x${size.height}`, async ({ page }, info) => {
    await open(page, size);
    const out = info.outputPath();
    await shot(page, `left-${size.width}`, out);
    const tip = page.locator('.fx-asset-tip');
    await expect(tip).toBeHidden();
    const tile = page.locator('.fx-left > ul.fx-assets > li[data-asset]').nth(1);
    await tile.locator('.fx-asset-name').hover();
    await expect(tip).toBeVisible({ timeout: 5_000 });
    await expect(tip.locator('.fx-preview-name')).not.toHaveText('', { timeout: 30_000 });
    await expect(tip.locator('canvas')).toBeVisible({ timeout: 30_000 });
    const [t, r] = [await tip.boundingBox(), await tile.boundingBox()];
    if (!t || !r) throw new Error('the tooltip or the tile has no box');
    expect(apart(t, r), 'the tooltip never covers its tile').toBe(true);
    expect(t.x + t.width).toBeLessThanOrEqual(size.width + 0.5);
    await shot(page, `hover-${size.width}`, out);
    await page.mouse.move(size.width / 2, size.height / 2);
    await expect(tip).toBeHidden();
    // The active tile: the prop step picks the next prop, its tooltip at once.
    await page.keyboard.press(']');
    await expect(tip).toBeVisible();
    await expect(page.locator('.fx-left > ul.fx-assets > li.is-on')).toHaveCount(1);
    await shot(page, `active-${size.width}`, out);
    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();
    // The right dock: each tab its own sections.
    for (const [tab, panels] of [['edit', ['inspector', 'outliner', 'rules', 'settings']], ['world', ['view', 'starters']], ['agent', ['agent']], ['content', ['creator-assets']]] as const) {
      const button = page.locator(`.fx-right [data-forge-tab="${tab}"]`);
      if (!(await button.count())) continue;
      if (size.width <= 760 && !(await button.isVisible())) continue;
      await button.click();
      await expect(page.locator('.fx-right > details.fx-panel:not([hidden])')).toHaveCount(panels.length);
      for (const id of panels) await expect(page.locator(`.fx-right > details.fx-panel[data-forge-panel="${id}"]`)).toBeVisible();
      await shot(page, `right-${tab}-${size.width}`, out);
      // Found against main 600eb91bd: PF.R60's detail distance drew as the 28x14 switch pill; it is a slider wider than one.
      if (tab === 'world') {
        const range = page.locator('.fx-right .fx-detail-distance input[type=range]');
        await range.scrollIntoViewIfNeeded();
        expect((await range.boundingBox())?.width ?? 0).toBeGreaterThan(60);
        await page.locator('.fx-right .fx-detail-distance').screenshot({ path: join(process.env['FORGE_SHOTS_DIR'] ?? out, `fui22-detail-distance-${size.width}.png`) });
      }
    }
  });
}

test.describe('touch', () => {
  test.use({ hasTouch: true, viewport: { width: 1280, height: 720 } });
  test('a long press shows the tooltip; the lift keeps it; the next tap hides it', async ({ page }, info) => {
    await open(page, { width: 1280, height: 720 });
    const tip = page.locator('.fx-asset-tip');
    const name = page.locator('.fx-left > ul.fx-assets > li[data-asset]').first().locator('.fx-asset-name');
    await name.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, bubbles: true });
    await page.waitForTimeout(700);
    await expect(tip).toBeVisible();
    await name.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, bubbles: true });
    await expect(tip).toBeVisible();
    await shot(page, 'touch-1280', info.outputPath());
    const other = page.locator('.fx-left > ul.fx-assets > li[data-asset]').nth(2).locator('.fx-asset-name');
    await other.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, bubbles: true });
    await expect(tip).toBeHidden();
  });
});
