import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { expectBase, newLayoutOn } from './forgeBase';

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
  await expectBase(page);                                              // OT.R112: the base named (`./forgeBase`)

  // OT.R112: the contributor's New asks for the base on a card; no blank floor without a type -- Suppression's preset.
  await newLayoutOn(page, 'blank:5');
  await expectBase(page, /New Empty Map/);
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
    // OT.R112: the editor's camera flies on its keys only while the right button is held over the viewport
    // (`../src/camera.ts` `update`'s `keyboardMove`; `./forgeEditor.spec.ts` `flyForward`); the right button places nothing.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down({ button: 'right' });
    try {
      await page.keyboard.down('KeyD');
      await page.waitForTimeout(600);
      await page.keyboard.up('KeyD');
    } finally {
      await page.mouse.up({ button: 'right' });
      // The right button also captures the mouse for the look (`lockMouse`, OT.R68): let go, so Play's button takes the click.
      await page.evaluate(() => { if (document.pointerLockElement) document.exitPointerLock(); });
    }
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
  // The Suppression preset stands a spawn each side of the centre (`../src/forge/blankPresets.ts` `presetLayout`,
  // daed4f539) and the piece placed at the viewport's centre sits between them, so the check finds "A straight walk from
  // team A did not reach team B" and Play asks first (the run's card): played anyway, as `./forgeMenuPointer.spec.ts` does.
  const card = page.locator('.fx-check-card');
  await expect.poll(async () => (await page.locator('body').evaluate((b) => b.classList.contains('is-matching'))) ? 'match' : (await card.isVisible()) ? 'card' : '', { timeout: 30_000 }).not.toBe('');
  if (await card.isVisible()) await page.getByRole('button', { name: 'Play anyway' }).click();
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
