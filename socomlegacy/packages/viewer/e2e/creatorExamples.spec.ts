import { expect, test, type Page } from '@playwright/test';

/** The existing START menu: menuView.ts section/row hooks, as exercised by forgeMenuPointer.spec.ts. */
async function openStarters(page: Page): Promise<void> {
  await page.locator('header.fx-top button[data-forge="menu"]').click();
  const menu = page.locator('.fx-menu');
  await expect(menu).toBeVisible();
  await menu.locator('[data-forge-menu-section="panels"]').click();
  await menu.locator('[data-forge-menu-row="panel-starters"]').click();
  await expect(menu).toBeHidden();
  await expect(page.locator('[data-creator-examples]')).toBeVisible();
}

/** Creator adaptation. Browser execution is the controller's slot; these checks never teleport or force a game outcome. */
test('starter discovery names missing sources and never applies a partial layout', async ({ page }) => {
  await page.route('**/maps/index.json', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));
  await page.goto('/forge?floor');
  await expect(page.locator('.fx-status-msg')).toHaveText(/layout open/i, { timeout: 60_000 });
  await openStarters(page);
  const panel = page.locator('[data-creator-examples]');
  await expect(panel.locator('[data-starter-id]')).toHaveCount(6);
  await panel.locator('[data-starter-id="arena"]').click();
  await expect(panel.getByRole('status')).toContainText(/Load a map from your own source|loaded archive|Open a campaign room/);
  await expect(panel.locator('[data-apply-starter]')).toBeDisabled();
});

test('a static starter previews, imports once, undoes, and survives download/reopen', async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  const index = await page.request.get(new URL('/maps/index.json', baseURL!).href);
  test.skip(!index.ok(), 'No served source: rendered starter acceptance is skipped, not passed.');
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/forge?devmode');
  await expect(page.locator('.fx-status-msg')).toHaveText(/layout open/i, { timeout: 120_000 });
  await expect(page.locator('.fx-vp-label')).toContainText(/frostfire/i, { timeout: 120_000 });
  const name = page.getByLabel('Layout name'); await name.fill('Before starter'); await name.blur();
  await openStarters(page);
  const panel = page.locator('[data-creator-examples]');
  await panel.locator('[data-starter-id="static-mood"]').click();
  await expect(panel.getByRole('status')).toContainText('ready to apply');
  await expect(name).toHaveValue('Before starter');
  await panel.locator('[data-apply-starter]').click();
  await expect(panel.getByRole('status')).toContainText('Starter applied');
  await panel.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(name).toHaveValue('Static dusk settings');
  await page.locator('header.fx-top').getByRole('button', { name: /^Undo\b/ }).click();
  await expect(name).toHaveValue('Before starter');
  await page.locator('header.fx-top').getByRole('button', { name: /^Redo\b/ }).click();
  await expect(name).toHaveValue('Static dusk settings');
  await page.locator('[data-forge="saves"]').click();
  const download = page.waitForEvent('download');
  await page.locator('.fx-modal').getByRole('button', { name: 'Download', exact: true }).click();
  const file = await (await download).path();
  if (!file) throw new Error('Layout download did not produce a file.');
  await page.locator('.fx-modal').getByRole('button', { name: 'Close', exact: true }).click();
  await name.fill('After export'); await name.blur();
  await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles(file);
  await expect(name).toHaveValue('Static dusk settings');
  expect(errors).toEqual([]);
});
