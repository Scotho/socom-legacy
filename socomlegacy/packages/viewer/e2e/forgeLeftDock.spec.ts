import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { expectBase } from './forgeBase';

/**
 * R6 (round 4's review; a browser adaptation, FG.R2 -- the game has no editor): the left dock's first row is on screen,
 * inside the dock, at the desktop widths the toolbar spec holds. FUI-22 (D5, FUI.R21; D3): the pin moved from dot's
 * Assets panel (its grid gone) to the movable Assets tab's one list -- its filter row whole (the today shot's row was
 * clipped at its top), its first row inside the dock, the list scrolling in its own box; nothing runs past the window. Needs a served
 * archive for a palette (`socomlegacy/public/maps`); without one it is skipped, not passed.
 */
const MAPS = fileURLToPath(new URL('../../../public/maps', import.meta.url));
const HAVE = existsSync(join(MAPS, 'index.json')) && existsSync(join(MAPS, 'RUN', 'MP2.ZDB'));

test.skip(!HAVE, 'needs socomlegacy/public/maps/index.json and RUN/MP2.ZDB (not committed)');
test.setTimeout(240_000);

for (const size of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
  test(`the one asset list's filter row and first row are inside the open left dock at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/forge?devmode');
    await expectBase(page);                                              // OT.R112: the base named (`./forgeBase`)
    const first = page.locator('.fx-left [data-forge-panel="asset-browser"] ul.fx-assets > li[data-asset]').first();
    await expect(first).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('.fx-left > details.fx-panel[data-forge-panel="asset-browser"]')).toHaveCount(1);
    await expect(page.locator('.fx-left > [data-forge-tabs] [data-forge-tab="assets"]')).toHaveAttribute('draggable', 'true');
    const dock = await page.locator('.fx-left').boundingBox();
    const filters = await page.locator('.fx-left [data-forge-panel="asset-browser"] .fx-asset-filters').boundingBox();
    const row = await first.boundingBox();
    if (!dock || !filters || !row) throw new Error('the dock, the filter row or the row has no box');
    // The filter row whole: its chips' full height drawn, not shrunk by the column (the today shot's clip).
    for (const chip of await page.locator('.fx-left [data-forge-panel="asset-browser"] .fx-asset-filters .fx-chip').all()) {
      const b = await chip.boundingBox();
      if (!b) throw new Error('a filter chip has no box');
      expect(b.y).toBeGreaterThanOrEqual(filters.y - 0.5);
      expect(b.y + b.height).toBeLessThanOrEqual(filters.y + filters.height + 0.5);
      expect(b.height).toBeGreaterThanOrEqual(23);
    }
    expect(row.y).toBeGreaterThanOrEqual(dock.y);
    expect(row.y + row.height).toBeLessThanOrEqual(dock.y + dock.height + 0.5);
    expect(row.y + row.height).toBeLessThanOrEqual(size.height);
    // The dock itself does not run past the window: the list scrolls inside it.
    expect(dock.y + dock.height).toBeLessThanOrEqual(size.height + 0.5);
    // `scroll`, not `auto`: the Overhaul (36ddf4282) gave the list an always-drawn scrollbar with a stable gutter
    // (`../src/forge/forge.css` `.fx-assets`: overflow-y scroll, scrollbar-gutter stable); it still scrolls in its own box.
    expect(await page.locator('.fx-left [data-forge-panel="asset-browser"] ul.fx-assets').evaluate((el) => getComputedStyle(el).overflowY)).toBe('scroll');
  });
}
