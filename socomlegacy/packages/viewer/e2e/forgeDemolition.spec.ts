import { expect, test, type Page } from '@playwright/test';

/**
 * FG-51 (a browser adaptation, no original): on the blank floor, a bomb start, two plant sites and Demolition.
 * Play's HUD then names Demolition -- the layout's type, not the library map's rank. Undo and a save that reopens
 * keep the markers and the type. Needs the served tree (`public/maps`, `?devmode`); skipped, and said, without it.
 */

/** A point on the floor. Separate clicks: the gizmo on the marker just placed swallows a click on the same spot. */
async function clickFloor(page: Page, xFrac: number): Promise<void> {
  const box = await page.locator('.fx-input').boundingBox();
  if (!box) throw new Error('the forge viewport is not up');
  await page.mouse.click(box.x + box.width * xFrac, box.y + box.height * 0.62);
}

/** Every toolbar control, Play included, lies inside the window, nothing scrolled. A control past the edge is the bug at 1280. */
async function expectToolbarInside(page: Page): Promise<void> {
  const size = page.viewportSize();
  if (!size) throw new Error('no viewport');
  const boxes = await page.locator('.fx-top').locator('a, button, select, input').evaluateAll((els) => els.flatMap((el) => {
    for (let at: Element | null = el; at; at = at.parentElement) {
      if ((at as HTMLElement).hidden) return [];
      const style = getComputedStyle(at);
      if (style.display === 'none' || style.visibility === 'hidden') return [];
    }
    const r = el.getBoundingClientRect();
    const name = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48);
    return [{ name, x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }];
  }));
  expect(boxes.length).toBeGreaterThan(8);
  for (const b of boxes) {
    expect(b.width, b.name).toBeGreaterThan(0);
    expect(b.height, b.name).toBeGreaterThan(0);
    expect(b.x, b.name).toBeGreaterThanOrEqual(0);
    expect(b.y, b.name).toBeGreaterThanOrEqual(0);
    expect(b.right, b.name).toBeLessThanOrEqual(size.width + 0.5);
    expect(b.bottom, b.name).toBeLessThanOrEqual(size.height + 0.5);
  }
}

/**
 * R7-1: below the row's width (LATER 226: about 1260 px, so a 1024 px window) the toolbar scrolls sideways by design;
 * there every control can be brought into view and then lies wholly on the screen, and the row keeps its 46 px
 * (`./forgeToolbar.spec.ts`' reachability check, the same rule).
 */
async function expectToolbarReachable(page: Page): Promise<void> {
  const size = page.viewportSize();
  if (!size) throw new Error('no viewport');
  const controls = page.locator('header.fx-top').locator('a, button, select, input').filter({ visible: true });
  const n = await controls.count();
  expect(n, 'the toolbar\'s controls').toBeGreaterThan(15);
  for (let i = 0; i < n; i++) {
    const c = controls.nth(i);
    await c.scrollIntoViewIfNeeded();
    const b = (await c.boundingBox())!;
    const name = (await c.getAttribute('aria-label')) ?? (await c.getAttribute('title')) ?? `control ${i}`;
    expect(b.x, `${name}: its left on the screen`).toBeGreaterThanOrEqual(-0.5);
    expect(b.x + b.width, `${name}: its right on the screen`).toBeLessThanOrEqual(size.width + 0.5);
  }
  const top = (await page.locator('header.fx-top').boundingBox())!;
  expect(top.height, 'the row\'s height').toBeCloseTo(46, 0);
  await page.locator('header.fx-top').evaluate((e) => { e.scrollLeft = 0; });
}

test('the blank floor plays Demolition from a placed bomb start and two sites', async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  const index = await page.request.get(new URL('/maps/index.json', baseURL!).href);
  test.skip(!index.ok(), 'no served maps (socomlegacy/public/maps): skipped, not passed');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/forge?devmode');
  // The opening layout finishes before the base is changed: its load writes the select back.
  await expect(page.locator('.fx-vp-label')).toContainText(/frostfire/i, { timeout: 120_000 });
  // Default Playwright window is 1280: there the whole row lies inside the window, nothing scrolled. R7-1: a laptop at
  // 1024 scrolls the row by design (LATER 226) -- every control can be scrolled to; then the rest runs at 1280.
  await page.setViewportSize({ width: 1024, height: 720 });
  await expectToolbarReachable(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expectToolbarInside(page);
  const base = page.locator('select.fx-select').first();
  await base.selectOption('blank');
  await page.getByRole('button', { name: 'Start a new layout' }).click();
  await expect(page.locator('.fx-vp-label')).toContainText('Blank floor', { timeout: 120_000 });

  // Settings is under the World tab; the Outliner under Object.
  await page.locator('.fx-right [data-forge-tab="world"]').click();
  await page.getByLabel('Game type').selectOption('2');
  await page.locator('.fx-right [data-forge-tab="object"]').click();
  await page.getByRole('button', { name: "Place the bomb's start" }).click();
  await expect(page.getByText('BOMB', { exact: true })).toBeVisible();
  await clickFloor(page, 0.5);
  await page.getByRole('button', { name: 'Place the site the SEALs plant at' }).click();
  await expect(page.getByText('SITE SEAL', { exact: true })).toBeVisible();
  await clickFloor(page, 0.32);
  await page.getByRole('button', { name: 'Place the site the Terrorists plant at' }).click();
  await expect(page.getByText('SITE TERRORIST', { exact: true })).toBeVisible();
  await clickFloor(page, 0.68);
  await expect(page.locator('.fx-outliner')).toContainText('Bomb start');
  await expect(page.locator('.fx-outliner')).toContainText('Site · SEAL');
  await expect(page.locator('.fx-outliner')).toContainText('Site · Terrorist');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.fx-outliner')).not.toContainText('Site · Terrorist');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.locator('.fx-outliner')).toContainText('Site · Terrorist');

  // The download sits in the saves dialog since #350's toolbar (as `forgeEditor.spec.ts` reaches it).
  await page.locator('[data-forge="saves"]').click();
  const download = page.waitForEvent('download');
  await page.locator('.fx-modal').getByRole('button', { name: 'Download' }).click();
  const file = await (await download).path();
  if (!file) throw new Error('the layout file was not downloaded');
  await page.locator('.fx-modal').getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Start a new layout' }).click();
  await page.getByRole('button', { name: 'Start new' }).click();
  await expect(page.locator('.fx-outliner')).toContainText('Nothing placed yet');
  await expect(page.getByLabel('Game type')).toHaveValue('');
  await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles(file);
  await expect(page.locator('.fx-outliner')).toContainText('Bomb start');
  await expect(page.locator('.fx-outliner')).toContainText('Site · SEAL');
  await expect(page.locator('.fx-outliner')).toContainText('Site · Terrorist');
  await expect(page.getByLabel('Game type')).toHaveValue('2');

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => page.evaluate(() => {
    const hook = (window as unknown as { __frontEndMatch?: { hud(): { model: { game: { type: string } } } } }).__frontEndMatch;
    return hook?.hud().model.game.type ?? '';
  }), { timeout: 120_000 }).toBe('DEMOLITION');
  expect(errors, errors.join('\n')).toEqual([]);
});
