import { expect, test } from '@playwright/test';
import type {} from '../src/hook';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildIso } from '../../archive/test/isoImage';
import { SETUP, TEST_ROOM_PAST_SHEET } from './urls';

/**
 * The game page at `SETUP` (`/setup`) and the test room's disc page. Until CX-9b this spec held the SOCOM II Legacy setup
 * page of OT.R28 (`../src/startup.ts` `Startup`) and its launcher frame (LU-1..LS-1: the top bar, the shelf, the
 * sections, the action bar and START); CX-9b (CX.R8, the owner, 2026-10-12: the console layout "becomes the new launcher
 * default disposing of the old layout entirely but keeping the plumbing beneath it where useful") removed that layout,
 * and the launcher is the console's (`console.spec.ts`). What stays is the plain disc page (`../setup/index.html`
 * `#disc-page`): an image chosen or dropped on it opens and mounts the front end at once (`../src/pageEntry.ts`
 * `offerDisc`, OT.R14's order), a refused one is said on its line; the test room keeps its direct path.
 *
 * Retired with the old layout, one by one (the plan's CX-9 Log): the visual presets (the Visuals cards); the controls'
 * fit at 320-1280px; the microphone's permission, unavailable and default-alias cases and its pad-driven test; the
 * controller's selection, diagram, remapping and unsupported-pad cases; the help tips; the backdrop's reduced motion;
 * the pad walks of the page and of the bar to START; the mobile controller and microphone settings; the launch gate on
 * the controller and the dev keyboard (OT.R29's any-key stand-in); the launcher's frame, tiles and L1 / R1; the summary
 * home's fit at 1440 x 900 and 375 x 812; the live chrome (LS-1) and its fit.
 */

/** A disc image holding the front end's first dialog archive, which `openFrontEndImage` checks for (tracked fixture). */
const FRONT_END_FIXTURE = fileURLToPath(new URL('../../../test-fixtures/RUN/UI/READERC.ZAR', import.meta.url));
const frontEndIso = (): Buffer => Buffer.from(buildIso([{ path: 'RUN/UI/READERC.ZAR', bytes: new Uint8Array(readFileSync(FRONT_END_FIXTURE)) }], 'SCUS_97275'));

test('the plain game page (CX-9b): the disc prompt alone, no launcher, no page error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(SETUP);
  await expect(page).toHaveTitle('SOCOM II Legacy');
  await expect(page.locator('#disc-page')).toBeVisible();
  await expect(page.locator('#disc-page-file')).toHaveCount(1);
  await expect(page.locator('#disc-state')).toHaveText('waiting for a disc image');
  await expect(page.locator('.s2u-topbar, .s2u-shelf, .s2u-actionbar, #startup-start')).toHaveCount(0);
  await expect(page.locator('#site-links')).toHaveCount(0);                // the entry keeps the disc page alone
  await expect(page.locator('canvas#front-end')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the first choose-disc click opens the native picker and explains an invalid file', async ({ page }) => {
  await page.goto(SETUP);
  const picking = page.waitForEvent('filechooser');
  await page.locator('#disc-pick').click();
  const picker = await picking;
  await picker.setFiles({ name: 'not-a-disc.iso', mimeType: 'application/octet-stream', buffer: Buffer.alloc(40 * 2048) });
  await expect(page.locator('#disc-state')).toContainText('not an ISO9660 image');
  await expect(page.locator('#disc-page')).toBeVisible();
  await expect(page.locator('canvas#front-end')).toHaveCount(0);
});

test('the order (OT.R14, CX-9b): a refused image is said; the next image mounts the front end at once and the disc page goes', async ({ page }) => {
  test.skip(!existsSync(FRONT_END_FIXTURE), 'RUN/UI/READERC.ZAR fixture absent');
  await page.goto(SETUP);
  await expect(page.locator('#disc-page')).toBeVisible();
  await expect(page.locator('canvas#front-end')).toHaveCount(0);
  await page.locator('#disc-page-file').setInputFiles({ name: 'wrong.iso', mimeType: 'application/octet-stream', buffer: Buffer.alloc(40 * 2048) });
  await expect(page.locator('#disc-state')).toContainText('not an ISO9660 image');
  await expect(page.locator('canvas#front-end')).toHaveCount(0);
  await page.locator('#disc-page-file').setInputFiles({ name: 'frontend.iso', mimeType: 'application/octet-stream', buffer: frontEndIso() });
  await expect(page.locator('canvas#front-end')).toHaveCount(1);
  await expect(page.locator('#disc-page')).toHaveCount(0);
});

test('the test room keeps its direct path: the disc page, no START, no launcher', async ({ page }) => {
  await page.goto(TEST_ROOM_PAST_SHEET);
  await expect(page.locator('#disc-page')).toBeVisible();
  await expect(page.locator('body')).toContainClass('test-room');      // its regex had control bytes for word boundaries
  await expect(page.locator('#disc-page-file')).toHaveCount(1);
  await expect(page.locator('#startup-start')).toHaveCount(0);
  await expect(page.locator('#disc-page .s2u-shelf__tile')).toHaveCount(0);
});
