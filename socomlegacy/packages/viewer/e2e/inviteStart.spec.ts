import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test as base, type Page } from '@playwright/test';
import { installPadStub } from './padStub';

/**
 * INVITE-START (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, FI.R8; the product track, OT.R53): an
 * invite address auto-STARTs the console launcher. Over the retail image (`SOCOM_ISO`; skipped, and said, without it),
 * in a persistent Chromium profile of its own (DX-3's spec's, deleted at the end), with a stub pad standing in for the
 * controller (`./padStub`) so nothing on the page is a user activation -- no key, no click, START never pressed:
 *
 * 1. a fresh browser at `main/online?invite=...&game=...&universe=...`: the console, its Disc item saying the invite
 *    waits for the disc; the image given to the hidden `#disc-page-file`; the extraction's popover runs to its end
 *    (FI.R8 b); then the console STARTs by itself to the front end, the address still the invite's;
 * 2. the same address again, the extraction now kept: the console STARTs by itself to the front end, with no chooser;
 * 3. a plain visit (`/`): the console stays, READY, nothing started (FI.R8 a).
 *
 * A rendered browser run (heavy: a browser, minutes, a gigabyte written into OPFS): the host's lock rules apply, and it
 * runs in the controller's slot. Nothing of the game is scored.
 */
const test = base.extend<{ page: Page }>({
  page: async ({ baseURL }, use) => {
    const dir = mkdtempSync(join(tmpdir(), 's2u-invite-start-'));
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

/** The extraction of the read set into a headless Chromium's OPFS (DX-3's spec's bound). */
const EXTRACT_TIMEOUT = 20 * 60_000;
test.setTimeout(30 * 60_000);
/** A stuck action fails in seconds, not the slot (INVITE-START review F3; as DX-3's spec). */
test.use({ actionTimeout: 15_000 });

/** A generated invite (no server answers it here: the front end's LOGIN is where it leads, not what this checks). */
const INVITE = '/main/online?invite=1234&game=Bravo%20Team&universe=US%20East';
/** `src/console/adapters/invite.ts` `INVITE_WAITING_LINE`. */
const WAITING = 'Your invite is waiting for your disc.';

/** LR-24 (LR.R23 (b)): the chip is the disc mark, its word and line in hidden spans (`.cx-mark__word`, `.cx-mark__line`). LR-23 (LR.R22): the Disc step is the legend's status chip -- its word ("Disc ready", "Choose disc", "Check disc") and its line (`.cx-chip__line`, visually hidden); was LR-13's disc check of Play's panel (gone). */
const discItem = (page: Page) => page.locator('#legend .cx-mark[data-mark="disc"]');   // LR-24: the disc mark (was: the chip)
const popover = (page: Page) => page.locator('#overlay .cx-extract');

test('an invite address STARTs by itself: after the chooser and the extraction, then from storage with no chooser; a plain visit does not', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let chooser = false;
  page.on('filechooser', () => { chooser = true; });
  await installPadStub(page);

  // 1. A fresh browser: the console, the invite's line, the disc given, the extraction, then START by itself.
  await page.goto(INVITE);
  await expect(page.locator('#stage .cx-cat.is-current')).toHaveCount(1);
  await expect(discItem(page).locator('.cx-mark__word')).toHaveText('Choose disc', { timeout: 30_000 });   // LR-24: the disc mark (was: the chip)
  await expect(discItem(page).locator('.cx-mark__line')).toContainText(WAITING);   // LR-24: the disc mark (was: the chip)
  await page.setInputFiles('#disc-page-file', ISO);
  await expect(popover(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#front-end')).toHaveCount(0);                    // not while the extraction runs
  await expect(popover(page)).toHaveClass(/is-done/, { timeout: EXTRACT_TIMEOUT });
  await expect(page.locator('#front-end')).toHaveCount(1, { timeout: 60_000 });
  expect(new URL(page.url()).pathname).toMatch(/\/main\/online$/);
  expect(new URL(page.url()).searchParams.get('invite')).toBe('1234');

  // 2. The same address again, the extraction kept: START by itself from storage, no chooser, no popover.
  chooser = false;
  await page.goto(INVITE);
  await expect(page.locator('#front-end')).toHaveCount(1, { timeout: 60_000 });
  expect(chooser).toBe(false);
  await expect(popover(page)).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('game')).toBe('Bravo Team');

  // 3. A plain visit: the console stays, ready from storage, and nothing starts by itself.
  await page.goto('/');
  await expect(discItem(page).locator('.cx-mark__word')).toHaveText('Disc ready', { timeout: 30_000 });   // LR-24: the disc mark (was: the chip)
  await expect(discItem(page).locator('.cx-mark__line')).toHaveText('Your disc, kept in this browser');   // LR-24: the disc mark (was: the chip)
  await page.waitForTimeout(3_000);
  await expect(page.locator('#front-end')).toHaveCount(0);
  await expect(page.locator('#stage .cx-cat.is-current')).toHaveCount(1);
  expect(chooser).toBe(false);
  expect(errors).toEqual([]);
});
