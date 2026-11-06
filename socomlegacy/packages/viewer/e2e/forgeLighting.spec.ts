import { expect, test } from '@playwright/test';
import { forgeStoredList } from './forgeStore';

/** Product adaptation: normal saved Forge controls, no prototype query or overlay.
 * Blank-floor guide colours are editor instruments; Play's floor takes the shared grade.
 */
test.use({ viewport: { width: 1440, height: 900 } });
test('normal Settings saves Night, reloads it, and passes it to Play; Original restores authored lighting', async ({ page }) => {
  const startPlay = async () => {
    await page.locator('button.fx-play').click();
    await expect.poll(async () => {
      if (await page.locator('body').evaluate(b => b.classList.contains('is-matching'))) return 'match';
      return await page.locator('.fx-check-card').isVisible() ? 'card' : '';
    }, { timeout: 30_000 }).not.toBe('');
    if (await page.locator('.fx-check-card').isVisible()) await page.getByRole('button', { name: 'Play anyway', exact: true }).click();
    await expect(page.locator('body')).toHaveClass(/is-matching/);
  };
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/forge?floor');
  await expect(page.locator('.fx-status-msg')).toHaveText(/layout open/, { timeout: 60_000 });
  await expect(page.locator('.fx-loading')).toBeHidden();
  // Left-click remains an ordinary placement action.
  await page.getByRole('button', { name: /team A spawn/ }).click();
  await page.locator('.fx-input').click();
  await expect(page.locator('.fx-outliner')).toContainText('Spawn A');
  const settingsPanel = page.locator('details.fx-panel').filter({ has: page.locator('summary', { hasText: /^Settings$/ }) });
  if (!(await settingsPanel.evaluate(d => (d as HTMLDetailsElement).open))) await settingsPanel.locator('summary').click();
  const slider = page.getByLabel('Night to day', { exact: true });
  const bounds = await slider.boundingBox();
  if (!bounds) throw new Error('Night to day slider is not visible');
  await slider.click({ position: { x: bounds.width - 2, y: bounds.height / 2 } });
  await expect(page.locator('.fx-setting-value').first()).toHaveText('100%');
  await slider.focus(); await page.keyboard.press('Home');
  await expect(slider).toHaveValue('0');
  await expect(page.getByRole('region', { name: 'Lighting experiment' })).toHaveCount(0);
  await expect(page.getByText('LIGHTING STUDY', { exact: true })).toHaveCount(0);
  // R3-B: the autosave is in the page's saves store (IndexedDB, `./forgeStore`), not localStorage.
  await expect.poll(async () => JSON.parse((await forgeStoredList(page, 'autosave')) || '{}').settings?.timeOfDay).toBe(0);
  // Use the normal named-save panel too; its record keeps the same numeric zero.
  await page.locator('[data-forge="saves"]').click();
  await page.locator('.fx-modal').getByRole('button', { name: 'Save as', exact: true }).click();
  await page.locator('.fx-modal input').fill('Night lighting');
  await page.locator('.fx-modal').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.fx-saves-list')).toContainText('Night lighting');
  await page.locator('.fx-modal').getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await expect(slider).toHaveValue('0', { timeout: 60_000 });
  await expect(page.locator('.fx-loading')).toBeHidden();
  await startPlay();
  await expect.poll(() => page.evaluate(() => (globalThis as { __forgeMatch?: { lighting?: { timeOfDay: number } | null } }).__forgeMatch?.lighting?.timeOfDay), { timeout: 60_000 }).toBe(0);
  await expect(page.locator('.fx-match canvas').first()).toBeVisible();
  await page.locator('.fx-match-back').click();
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await expect(page.locator('.fx-setting-value').first()).toHaveText('Original');
  // Original is an edit (`resetLighting`), so its autosave clears the stored time.
  await expect.poll(async () => JSON.parse((await forgeStoredList(page, 'autosave')) || '{}').settings?.timeOfDay ?? null).toBeNull();
  await startPlay();
  await expect.poll(() => page.evaluate(() => (globalThis as { __forgeMatch?: { lighting?: unknown } }).__forgeMatch?.lighting), { timeout: 60_000 }).toBeNull();
  await page.locator('.fx-match-back').click();
  expect(errors).toEqual([]);
});
