import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test as base, type Page } from '@playwright/test';
import { walkRailTo } from './launcherRail';
import { installPadStub } from './padStub';

/**
 * DX-3 (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, FI.R6, FI.R7; the owner's DISC-EXTRACT:
 * "extract assets from disc instead of reading directly on the first page load"): the console launcher over the retail
 * image (`SOCOM_ISO`; skipped, and said, without it). A rendered browser run, the product track: nothing of the game is
 * scored.
 *
 * 1. the image picked on the hidden `#disc-page-file`; the popover appears, shows the files, the bytes and the backend,
 *    and completes (the read set, 95 files and 1.34 GB on the retail disc since FI.R6's second revision, with OPFS's quota);
 * 2. a reload: the launcher is ready from storage, with no chooser; START reaches the game's title, the opener's movie
 *    (SONY448) playing from storage (its meter on the page's hook, `window.__frontEnd.movies`);
 * 3. Options' "Delete the kept disc", confirmed: the chooser asks again.
 *
 * Beside it, the popover under reduced motion (`emulateMedia`), and its frames at 1280x720 and 412x915 saved to
 * `test-results`. One page each: OPFS and IndexedDB are the context's, kept across its reloads. The movie part needs the
 * built decoder (`packages/fmv/wasm/build.sh`); without it the title is still reached and the movie's check is skipped,
 * and said. Heavy (a browser, minutes, a gigabyte written): the host's lock rules apply.
 */
/**
 * A persistent Chromium profile in a temporary directory, deleted at the end (the merge controller's condition for this
 * run, 2026-10-16): the default context is off the record, and its storage quota would refuse a gigabyte; the profile's
 * OPFS holds the extraction across the test's reloads and leaves nothing on the host.
 */
const test = base.extend<{ page: Page }>({
  page: async ({ baseURL }, use) => {
    const dir = mkdtempSync(join(tmpdir(), 's2u-dx3-'));
    const context = await chromium.launchPersistentContext(dir, { baseURL, viewport: { width: 1280, height: 720 } });
    try {
      await use(context.pages()[0] ?? await context.newPage());
    } finally {
      await context.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
});

const ISO = process.env.SOCOM_ISO ?? '';
const HAVE_ISO = ISO !== '' && existsSync(ISO);
test.skip(!HAVE_ISO, 'SOCOM_ISO absent: the extraction needs the retail image (skipped, not passed)');
const WASM = fileURLToPath(new URL('../../fmv/wasm/out/libmpeg2.wasm', import.meta.url));
const HAVE_WASM = existsSync(WASM);

/** The read set's extraction, written into a headless Chromium's OPFS: generous, it is a gigabyte. */
const EXTRACT_TIMEOUT = 20 * 60_000;
test.setTimeout(30 * 60_000);
/** A stuck action fails in seconds, not after the test's half hour of host time (the merge controller, 2026-10-16). */
test.use({ actionTimeout: 15_000 });

/** The run's steps timed, for the report: printed as `[discExtract] <step>: <s> s`. */
const timed = (label: string, since: number): void => { console.log(`[discExtract] ${label}: ${((Date.now() - since) / 1000).toFixed(1)} s`); };

/** The console up and drawn; a key pressed so a development build counts the keyboard for START (OT.R29). */
async function open(page: Page): Promise<void> {
  await installPadStub(page);                                           // LR-31: START needs a connected controller; a key no longer counts
  await page.goto('/');
  await expect(page.locator('#stage .cx-cat.is-current')).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
}

const popover = (page: Page) => page.locator('#overlay .cx-extract');
/** LR-24 (LR.R23 (b)): the chip is the disc mark, its word and line in hidden spans (`.cx-mark__word`, `.cx-mark__line`). LR-23 (LR.R22): the Disc step is the legend's status chip -- its word ("Disc ready", "Choose disc", "Check disc") and its line (`.cx-chip__line`, visually hidden); was LR-13's disc check of Play's panel (gone). */
const discItem = (page: Page) => page.locator('#legend .cx-mark[data-mark="disc"]');   // LR-24: the disc mark (was: the chip)

test('pick, extract, reload, start from storage with no chooser, then delete the kept disc and be asked again', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await expect(discItem(page).locator('.cx-mark__word')).toHaveText('Choose disc');   // LR-24: the disc mark (was: the chip)

  // 1. The pick, the popover, its figures, its end.
  const t0 = Date.now();
  await page.setInputFiles('#disc-page-file', ISO);
  await expect(popover(page)).toBeVisible({ timeout: 60_000 });
  await expect(popover(page).locator('[data-extract="files"]')).toHaveText(/^\d+ of \d+$/, { timeout: 60_000 });
  await expect(popover(page).locator('[data-extract="bytes"]')).toHaveText(/of \d+\.\d+ GB$/);
  await expect(popover(page).locator('[data-extract="where"]')).toHaveText(/the origin private file system|IndexedDB/);
  const count = Number((await popover(page).locator('[data-extract="files"]').textContent())!.split(' of ')[1]);
  expect(count).toBeGreaterThan(0);
  await expect(popover(page)).toHaveClass(/is-done/, { timeout: EXTRACT_TIMEOUT });
  timed('1. the pick to the extraction done', t0);
  await expect(popover(page).locator('[data-extract="files"]')).toHaveText(`${count} of ${count}`);
  await expect(popover(page)).toHaveCount(0, { timeout: 30_000 });
  await expect(discItem(page).locator('.cx-mark__word')).toHaveText('Disc ready');   // LR-24: the disc mark (was: the chip)

  // 2. A reload: ready from storage, no chooser; START to the title, the opener's movie from storage.
  const t1 = Date.now();
  await page.reload();
  await expect(page.locator('#stage .cx-cat.is-current')).toHaveCount(1);
  await expect(discItem(page).locator('.cx-mark__line')).toHaveText('Your disc, kept in this browser', { timeout: 30_000 });   // LR-24: the disc mark (was: the chip)
  await expect(discItem(page).locator('.cx-mark__word')).toHaveText('Disc ready');   // LR-24: the disc mark (was: the chip)
  await expect(page.locator('#legend .cx-mark[data-mark="disc"]')).toHaveClass(/is-ready/);   // LR-24: the disc mark (was: the chip)
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  let chooser = false;
  page.on('filechooser', () => { chooser = true; });
  await page.keyboard.press('o');                                       // OPTIONS: START (the console's keymap)
  await expect(page.locator('#front-end')).toHaveCount(1, { timeout: 60_000 });
  timed('2. the reload to the front end from storage', t1);
  expect(chooser).toBe(false);
  await expect(page.locator('#overlay .cx-extract')).toHaveCount(0);
  if (HAVE_WASM) {
    await expect.poll(() => page.evaluate(() => {
      const h = (window as unknown as { __frontEnd?: { movies: { pictures: { budgets: { report(): { movie: string; pictures: number } }[] } } | null } }).__frontEnd;
      const b = h?.movies?.pictures.budgets.map((x) => x.report()) ?? [];
      return b.find((r) => /SONY448/i.test(r.movie))?.pictures ?? 0;
    }), { timeout: 60_000 }).toBeGreaterThan(0);
  } else {
    test.info().annotations.push({ type: 'skipped', description: 'the opener movie check: no built decoder (packages/fmv/wasm/out/libmpeg2.wasm)' });
  }

  // 3. Back to the launcher, delete the kept disc in Options (confirmed), and the chooser asks again.
  const t2 = Date.now();
  await open(page);
  await expect(discItem(page).locator('.cx-mark__word')).toHaveText('Disc ready', { timeout: 30_000 });   // LR-24: the disc mark (was: the chip)
  await walkRailTo(page, 'Settings', async (dir) => { await page.keyboard.press(dir < 0 ? 'ArrowLeft' : 'ArrowRight'); });   // LR.R2: Settings is left of Home, found by label
  await expect(page.locator('#stage .cx-cat.is-current .cx-cat__label')).toHaveText('Settings');
  // By the pad's grammar, as the console is driven (at 1280x720 a mouse cannot reach a row the legend lies over): the
  // focus walked down to App (LR-5: the kept disc's row is Settings > App; the list is System Settings, App, Theme (LR-13),
  // found by name), then Cross (Enter), then down the App tab's rows to "Remove downloaded content", then Cross.
  const focused = async (): Promise<string> => ((await page.locator('#stage .cx-item.is-focused .cx-item__title').textContent().catch(() => '')) ?? '').trim();   // the text as written (the CSS upper-cases what it draws)
  for (let i = 0; i < 10 && (await focused()) !== 'Launcher'; i++) await page.keyboard.press('ArrowDown');
  expect(await focused()).toBe('Launcher');
  await page.keyboard.press('Enter');
  await page.locator('#stage .cx-tab[data-cat="app"]').click();
  await expect(page.locator('#stage .cx-title')).toHaveText('App');
  const focusedRow = async (): Promise<string> => ((await page.locator('#stage [data-key="options"] .cx-r.is-focused .cx-r__label').first().textContent().catch(() => '')) ?? '').trim();
  for (let i = 0; i < 12 && (await focusedRow()) !== 'Remove downloaded content'; i++) await page.keyboard.press('ArrowDown');
  expect(await focusedRow()).toBe('Remove downloaded content');
  await page.keyboard.press('Enter');
  await expect(page.locator('#overlay .cx-scrim[data-key="confirm-kept"]')).toBeVisible();
  await page.keyboard.press('ArrowDown');                               // No first and focused; Yes
  await page.keyboard.press('Enter');
  await expect(page.locator('#toast')).toHaveText(/Downloaded content removed/);   // the toast's words since #509 (c01e19d49)
  await page.reload();
  await expect(page.locator('#stage .cx-cat.is-current')).toHaveCount(1);
  await expect(discItem(page).locator('.cx-mark__word')).toHaveText('Choose disc', { timeout: 30_000 });   // LR-24: the disc mark (was: the chip)
  timed('3. the delete to the disc asked again', t2);
  expect(errors).toEqual([]);
});

/** The popover inside the viewport, no horizontal overflow (the merge controller's check at 412x915, 2026-10-16). */
async function fits(page: Page): Promise<void> {
  const box = (await popover(page).boundingBox())!;
  const width = await page.evaluate(() => window.innerWidth);
  expect(box.x, 'the popover starts inside the viewport').toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, 'the popover ends inside the viewport').toBeLessThanOrEqual(width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal overflow').toBe(true);
}

test('the popover with motion and under reduced motion, its frames at 1280x720 and 412x915, fitted at a phone\'s width', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page);
  await page.setInputFiles('#disc-page-file', ISO);
  await expect(popover(page)).toHaveClass(/is-copy/, { timeout: 120_000 });
  // With motion: the disc turns and the file chips stream along the lane while a file is copied (part I).
  expect(await page.locator('#overlay .cx-extract__disc').evaluate((el) => getComputedStyle(el).animationName)).not.toBe('none');
  expect(await page.locator('#overlay .cx-extract__chip').first().evaluate((el) => getComputedStyle(el).display)).toBe('block');
  await page.screenshot({ path: test.info().outputPath('extract-motion-1280x720.png') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Reduced motion: the disc stands still and the chips are not drawn (`shared/ds/components.css`, part I).
  expect(await page.locator('#overlay .cx-extract__disc').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  expect(await page.locator('#overlay .cx-extract__chip').first().evaluate((el) => getComputedStyle(el).display)).toBe('none');
  await page.screenshot({ path: test.info().outputPath('extract-1280x720.png') });
  await page.setViewportSize({ width: 412, height: 915 });
  await page.waitForTimeout(300);
  await fits(page);
  await page.screenshot({ path: test.info().outputPath('extract-412x915.png') });
  // Circle cancels: what is done is kept; Resume and Close are offered, without unlocking disc fallback.
  await page.keyboard.press('Escape');
  await expect(popover(page)).toHaveClass(/is-error/, { timeout: 60_000 });
  await expect(page.locator('#overlay .cx-dialog__title')).toHaveText('EXTRACTION PAUSED');
  await fits(page);
  await page.screenshot({ path: test.info().outputPath('extract-paused-412x915.png') });
  await page.locator('#overlay [data-act="extract"][data-i="1"]').click();
  await expect(popover(page)).toHaveCount(0);
});
