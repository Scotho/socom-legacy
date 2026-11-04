import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * FG-50 (a browser adaptation, no original): on a blank floor, Play from here stands the local player under the
 * camera, and leaving Play puts the camera, the selection and the tool back. The blank floor's library is a served
 * archive (`socomlegacy/public/maps`); without one the forge never opens, and the spec is skipped, not passed. Not a
 * disc capture.
 */
const MAPS = fileURLToPath(new URL('../../../public/maps', import.meta.url));
const HAVE = existsSync(join(MAPS, 'index.json')) && existsSync(join(MAPS, 'RUN', 'MP2.ZDB'));

test.skip(!HAVE, 'needs socomlegacy/public/maps/index.json and RUN/MP2.ZDB, the blank floor\'s library (not committed)');
test.setTimeout(240_000);

const camOf = (page: Page): Promise<string> => page.locator('.fx-status .fx-cell', { hasText: /^cam / }).innerText();

test('Play from here on a blank floor stands under the camera and returns to the same place', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/forge?devmode');
  const base = page.locator('select.fx-select').filter({ has: page.locator('option[value="blank"]') });
  await expect(base.locator('option[value="blank"]')).toHaveCount(1, { timeout: 120_000 });
  await expect(page.locator('.fx-vp-label')).toContainText('·', { timeout: 120_000 });

  await base.selectOption('blank');
  // Under 1440px the tool's label is hidden, so its name is the title.
  await page.locator('button[title="Start a new layout on this base"]').click();
  await expect(page.locator('.fx-vp-label')).toHaveText('Perspective · Blank floor', { timeout: 120_000 });
  const asset = page.locator('.fx-assets .fx-asset-name').first();
  await expect(asset).toBeVisible({ timeout: 120_000 });
  await asset.click();
  await expect(page.locator('.fx-status .fx-cell').first()).toHaveText('PLACE');
  const input = page.locator('.fx-input');
  const box = await input.boundingBox();
  if (!box) throw new Error('the viewport has no box');
  await input.click({ position: { x: box.width / 2, y: box.height / 2 } });
  const selected = page.locator('.fx-outliner li.is-on');
  await expect(selected).toHaveCount(1, { timeout: 30_000 });
  const selectedText = (await selected.innerText()).replace(/\s+/g, ' ').trim();

  // Strafe, then wait out the status line (it rewrites every 500 ms) until the camera has stopped. Two reads
  // inside one rewrite can agree while the glide is still running.
  const opened = await camOf(page);
  const strafe = async (): Promise<void> => {
    // A focused field eats the key (the fly camera ignores a key whose target is an input), and a click would place.
    await page.evaluate(() => { const a = document.activeElement; if (a instanceof HTMLElement) a.blur(); });
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(600);
    await page.keyboard.up('KeyD');
  };
  await strafe();
  const settled = async (): Promise<string> => {
    let last = '';
    let same = 0;
    for (let i = 0; i < 40; i++) {
      const now = await camOf(page);
      same = now === last && now !== '' ? same + 1 : 0;
      last = now;
      if (same >= 3 && now !== opened) return now;
      await page.waitForTimeout(600);
    }
    return last;
  };
  let before = await settled();
  if (before === opened) {
    await strafe();
    before = await settled();
  }
  expect(before).not.toBe(opened);
  const at = before.match(/cam (-?\d+), (-?\d+), (-?\d+)/);
  expect(at).not.toBeNull();
  const [, cx, , cz] = at!;

  await page.locator('button.fx-play').click();
  await expect.poll(async () => page.evaluate(() => {
    const match = (globalThis as { __forgeMatch?: { seats?: () => { feet?: number[] }[] } }).__forgeMatch;
    const feet = match?.seats?.()[0]?.feet;
    return feet ? feet.join(',') : '';
  }), { timeout: 90_000 }).not.toBe('');
  const feet = await page.evaluate(() => {
    const match = (globalThis as { __forgeMatch?: { seats?: () => { feet?: number[] }[] } }).__forgeMatch;
    return match!.seats!()[0]!.feet!;
  });
  expect(Math.abs(feet[0]! - Number(cx))).toBeLessThan(20);
  expect(Math.abs(feet[2]! - Number(cz))).toBeLessThan(20);

  // The back button has to be the thing under the pointer: the match canvas is z-index 1000.
  await page.locator('.fx-match-back').click();
  await expect(page.locator('.fx-match')).toBeHidden();
  await expect.poll(async () => camOf(page)).toBe(before);
  await expect(selected).toHaveCount(1);
  expect((await selected.innerText()).replace(/\s+/g, ' ').trim()).toBe(selectedText);
  await expect(page.locator('.fx-status .fx-cell').first()).toHaveText('PLACE');
  expect(errors).toEqual([]);
});
