import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test as base, type Page } from '@playwright/test';

/**
 * DX-4 (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, FI.R6's second revision; the owner,
 * 2026-10-16: "we also need single player maps for forge"): the campaign's twelve map archives are in the read set, so
 * the forge lists and opens a campaign map from the browser's storage with no disc this visit. The disc is extracted
 * once through the console launcher (`./discExtract.spec.ts`'s first step), then `/forge?disc` (the release's path in a
 * development build) starts from the kept extraction: its palette lists the Campaign group, and a campaign map opens
 * (its props listed). Over the retail image (`SOCOM_ISO`; skipped, and said, without it). A rendered browser run, the
 * product track.
 */
const ISO = process.env.SOCOM_ISO ?? '';
const HAVE_ISO = ISO !== '' && existsSync(ISO);

/** A persistent Chromium profile in a temporary directory, deleted at the end (the gigabyte's room; nothing left). */
const test = base.extend<{ page: Page }>({
  page: async ({ baseURL }, use) => {
    const dir = mkdtempSync(join(tmpdir(), 's2u-dx4-'));
    const context = await chromium.launchPersistentContext(dir, { baseURL, viewport: { width: 1280, height: 720 } });
    try {
      await use(context.pages()[0] ?? await context.newPage());
    } finally {
      await context.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
});

test.skip(!HAVE_ISO, 'SOCOM_ISO absent: the extraction needs the retail image (skipped, not passed)');
test.setTimeout(15 * 60_000);
test.use({ actionTimeout: 15_000 });

test('the forge lists the campaign maps and opens one from storage, with no disc this visit', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // The extraction, once, through the console launcher.
  await page.goto('/');
  await expect(page.locator('#stage .cx-cat.is-current')).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await page.setInputFiles('#disc-page-file', ISO);
  await expect(page.locator('#overlay .cx-extract')).toHaveClass(/is-done/, { timeout: 10 * 60_000 });
  await expect(page.locator('#overlay .cx-extract')).toHaveCount(0, { timeout: 30_000 });

  // The forge, from storage: no chooser.
  let chooser = false;
  page.on('filechooser', () => { chooser = true; });
  await page.goto('/forge?disc');
  const palette = page.locator('select.fx-select').filter({ hasNot: page.locator('option[value="blank"]') }).first();
  await expect(palette.locator('optgroup[label="Campaign"] option')).toHaveCount(12, { timeout: 120_000 });
  // The forge's first map opened (its `setBase` sets the palette to it at the end): a pick before then is undone
  // (DX-4's review F1).
  await expect(page.locator('.fx-status-msg')).toHaveText(/layout open|not found on this disc/, { timeout: 120_000 });
  expect(await palette.locator('optgroup[label="Campaign"] option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value)))
    .toEqual(['M51', 'M52', 'M53', 'M61', 'M62', 'M63', 'M71', 'M72', 'M73', 'M81', 'M82', 'M83']);
  await palette.selectOption('M51');
  await expect(page.locator('.fx-status-msg')).toHaveText(/\(M51\): \d+ props/, { timeout: 120_000 });
  await expect(page.locator('.fx-status-msg')).not.toHaveClass(/is-bad/);
  // The frame: the forge with the campaign map's palette open (a native select's open list is not in a screenshot; its
  // twelve Campaign options are asserted above).
  await page.waitForTimeout(500);
  await page.screenshot({ path: test.info().outputPath('forge-palette-m51.png') });
  expect(chooser).toBe(false);
  expect(errors).toEqual([]);
});
