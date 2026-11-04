import { expect, test } from '@playwright/test';

/**
 * The forge's map check (a browser adaptation, no original): before Play, a blank floor whose spawn is not on the
 * floor lists the problems, Jump looks at that spawn, and Go back leaves the editor. No disc and no served tree:
 * the page opens the blank floor on its own.
 */

const LAYOUT = JSON.stringify({
  forge: 1,
  base: { kind: 'blank', library: 'MP2' },
  pieces: [],
  spawns: [
    { team: 'A', p: [0, 80, 0], yaw: 0 },
    { team: 'B', p: [40, 0, 0], yaw: 0 },
  ],
});

test('a blank floor lists its problems before Play, and Jump looks at the spawn', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((layout) => {
    localStorage.setItem('s2u-forge-layout', layout);
  }, LAYOUT);
  await page.goto('/forge');
  await expect(page.locator('.fx-status-msg')).toHaveText(/layout open/, { timeout: 60_000 });

  await page.locator('.fx-play').click();
  const card = page.locator('.fx-check-card');
  await expect(card.locator('h2')).toHaveText('This map has problems');
  const floor = card.locator('li[data-kind="spawn-floor"]');
  await expect(floor).toContainText('not on a floor');
  await expect(floor.getByRole('button', { name: 'Jump' })).toBeVisible();

  await floor.getByRole('button', { name: 'Jump' }).click();
  await expect(page.locator('.fx-status .fx-cell', { hasText: /^cam / })).toHaveText('cam 120, 160, 120', { timeout: 5_000 });
  await expect(page.locator('.fx-outliner li.is-on')).toContainText('Spawn A');
  const scrim = await page.locator('.fx-modal.fx-check-modal').evaluate((el) => {
    const s = getComputedStyle(el);
    return { background: s.backgroundColor, filter: s.backdropFilter };
  });
  expect(scrim.background).toBe('rgba(0, 0, 0, 0)');
  expect(scrim.filter).toBe('none');

  await card.getByRole('button', { name: 'Go back' }).click();
  await expect(card).toBeHidden();
  await expect(page.locator('.fx-match')).toBeHidden();

  await page.locator('button.fx-tool', { hasText: 'Check' }).click();
  await expect(page.locator('.fx-check-card h2')).toHaveText('This map has problems');
  await page.screenshot({ path: test.info().outputPath('forge-map-check.png') });
  await page.locator('.fx-check-card').getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.fx-check-card')).toBeHidden();
  expect(errors).toEqual([]);
});
