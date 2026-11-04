import { expect, test } from '@playwright/test';
import type {} from '../src/hook';
import { DEV_PANEL_KEY } from '../src/devTools';               // not ../src/devPanel: its stylesheet import is the page's
import { TEST_ROOM } from './urls';

/**
 * The test room's developer panel (`../src/devPanel`). A browser adaptation: F2 (`DEV_PANEL_KEY`) opens it with
 * `?devmode` on a development build, and the page has no panel without that switch. It does not need a map.
 */
test('F2 opens the developer panel with devmode, and the panel is absent without it', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  await page.goto(`${TEST_ROOM}?devmode`);
  await page.waitForFunction(() => typeof window.__viewer?.mode === 'function');
  const panel = page.locator('#dev-panel');
  await expect(panel).toBeAttached();
  await expect(panel).toBeHidden();
  await page.keyboard.press(DEV_PANEL_KEY);
  await expect(panel).toBeVisible();
  await expect(page.locator('#dev-panel-fly')).toBeVisible();
  await expect(page.locator('#dev-panel-spawn')).toHaveText('Own spawn');
  await expect(page.locator('#dev-panel-marks')).toBeVisible();
  await expect(page.locator('#dev-panel-fps')).toBeVisible();
  // G is the page's fly/walk key. The panel stays open and does not take the key: with no floor the walk stays in
  // fly, and with a floor G may enter the walk, which is the page's own rule.
  const modeBeforeG = await page.evaluate(() => window.__viewer.mode());
  await page.keyboard.press('g');
  await expect(panel).toBeVisible();
  const modeAfterG = await page.evaluate(() => window.__viewer.mode());
  expect(modeBeforeG === 'fly' || modeBeforeG === 'walk').toBe(true);
  expect(modeAfterG === 'fly' || modeAfterG === 'walk').toBe(true);
  await page.locator('#dev-panel-marks').check();
  await expect(page.locator('#dev-panel-marks')).toBeChecked();
  const openSection = async (id: string): Promise<void> => {
    await page.locator(`#${id} > summary`).click();
    await expect(page.locator(`#${id}`)).toHaveAttribute('open', '');
  };
  await openSection('dev-panel-time');
  await expect(page.locator('#dev-panel-pause')).toBeVisible();
  await page.locator('#dev-panel-pause').click();
  await expect(page.locator('#dev-panel-clock')).toHaveText('paused');
  await openSection('dev-panel-readout');
  await expect(page.locator('#dev-panel-live')).toContainText('explore · fly');
  await expect(page.locator('#dev-panel-copy')).toBeVisible();
  await openSection('dev-panel-teleport');
  await expect(page.locator('#dev-panel-places')).toBeVisible();
  await expect(page.locator('#dev-panel-map')).toBeVisible();
  await openSection('dev-panel-visual');
  await expect(page.locator('#dev-panel-los')).toContainText('not drawn');
  await openSection('dev-panel-cheats');
  await expect(page.locator('#dev-panel-god')).toContainText('not available');
  await expect(page.locator('#dev-panel-health')).toContainText('not available');
  await expect(page.locator('#dev-panel-ammo')).toBeVisible();
  await openSection('dev-panel-round');
  await expect(page.locator('#dev-panel-hostages')).toContainText('not available');
  await expect(page.locator('#dev-panel-timer')).toContainText('not available');
  await openSection('dev-panel-bots');
  await expect(page.locator('#dev-panel-bots-view')).toContainText('nothing is drawn');
  await page.keyboard.press(DEV_PANEL_KEY);
  await expect(panel).toBeHidden();

  await page.goto(`${TEST_ROOM}?launch=off`);
  await page.waitForFunction(() => typeof window.__viewer?.mode === 'function');
  await expect(page.locator('#dev-panel')).toHaveCount(0);
  await page.keyboard.press(DEV_PANEL_KEY);
  await expect(page.locator('#dev-panel')).toHaveCount(0);
  expect(await page.evaluate(() => window.__viewer.mode())).toBe('fly');
  expect(problems).toEqual([]);
});
