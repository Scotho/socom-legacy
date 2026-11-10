import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { recordOfLayout } from '../src/forge/record';
import { expectBase } from './forgeBase';

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

test('a static starter previews, imports once, undoes, and survives download/reopen', async ({ page, baseURL }, info) => {
  test.setTimeout(180_000);
  const index = await page.request.get(new URL('/maps/index.json', baseURL!).href);
  test.skip(!index.ok(), 'No served source: rendered starter acceptance is skipped, not passed.');
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/forge?devmode');
  await expect(page.locator('.fx-status-msg')).toHaveText(/layout open/i, { timeout: 120_000 });
  await expectBase(page, /frostfire/i);                                 // OT.R112: the base named (`./forgeBase`)
  // The name field is shown, not typed, since the owner's 2026-11-06 ruling (`../src/forge/page.ts` `layoutNameIn.readOnly`,
  // daed4f539): the layout is named as a file opened names it -- its own name, the undo's start (`openLayout` resets the
  // history) -- on the same base. Saves > Save as names it too, but records no step for Undo to come back to.
  const name = page.getByLabel('Layout name');
  const before = info.outputPath('before-starter.json');
  mkdirSync(info.outputPath(), { recursive: true });
  writeFileSync(before, JSON.stringify(recordOfLayout({ forge: 1, base: { kind: 'map', archive: 'MP2' }, pieces: [], spawns: [] }, 'Before starter')));
  await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles(before);
  await expect(name).toHaveValue('Before starter');
  await expectBase(page, /frostfire/i);
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
  // Renamed by Saves > Save as (the field is read-only), so the file's open below has a name to put back.
  await page.locator('[data-forge="saves"]').click();
  await page.locator('.fx-modal').getByRole('button', { name: 'Save as' }).click();
  await page.locator('.fx-modal form.fx-card input').fill('After export');
  await page.locator('.fx-modal').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.fx-saves-list')).toContainText('After export');
  await page.locator('.fx-modal').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(name).toHaveValue('After export');
  await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles(file);
  await expect(name).toHaveValue('Static dusk settings');
  expect(errors).toEqual([]);
});
