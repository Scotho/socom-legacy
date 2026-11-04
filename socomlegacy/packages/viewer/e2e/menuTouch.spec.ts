import { existsSync } from 'node:fs';
import { chromium, expect, test as base, type Page } from '@playwright/test';
import { seen, until } from './frontEndWalk';
import { e2eRenderer } from './renderer';

// A normal profile has enough OPFS quota for the retail assets; an incognito context does not.
const test = base.extend<{ page: Page }>({
  page: async ({ baseURL }, use, info) => {
    const context = await chromium.launchPersistentContext(info.outputPath('phone-profile'), {
      baseURL, hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 },
      args: e2eRenderer(process.env.S2U_E2E_RENDERER).args,
      executablePath: process.env.PW_CHROMIUM || undefined,
    });
    try { await use(context.pages()[0] ?? await context.newPage()); }
    finally { await context.close(); }
  },
});

const ISO = process.env.SOCOM_ISO ?? '';
test.skip(!ISO || !existsSync(ISO), 'SOCOM_ISO absent');
test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
test.setTimeout(240_000);

test('ISO start through Online with only the visible touch pad, portrait and landscape', async ({ page }) => {
  const errors: string[] = [], maps: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (/\/maps\//.test(r.url())) maps.push(r.url()); });
  await page.goto('/');
  await page.setInputFiles('#disc-page-file', ISO);
  // LR-23 (LR.R22): the ready fact is the legend's status chip, "Disc ready" (was LR-13's green dot on Play); START's pill is
  // gone from Home ("Start game, gone"): a tap on Play is its Cross, which launches when ready.
  await expect(page.locator('#legend .cx-mark[data-mark="disc"].is-ready .cx-mark__word')).toHaveText('Disc ready', { timeout: 120_000 });   // LR-24: the disc mark (was: the chip)
  await expect(page.locator('#overlay .cx-extract')).toHaveCount(0);
  await page.locator('#stage .cx-list [data-act="item"][data-i="0"]').tap();
  await expect(page.locator('#front-end')).toBeVisible();
  const pad = page.locator('#menu-touch');
  await expect(pad.locator('#tw-start')).toBeVisible();
  const tap = async (id: string) => { await pad.locator(`#${id}`).tap(); await page.waitForTimeout(400); };
  await until(page, 'intro menu', (s) => s.dialog === 'dlgIntroScreen.rdr');
  // Tapped until the main menu, on a time budget, not a count (LATER 198): SONY448 plays whole through its presses, as the
  // original's does (web research 98 sections 1 and 5: its presses "did not skip SONY448"), now that the movies
  // decode (OT.R66), so a count of taps runs out before INTRO_2, which a press does skip.
  for (const end = Date.now() + 60_000; Date.now() < end;) {
    const s = await seen(page);
    if (s?.dialog === 'dlgMenu.rdr' && s.ready && !s.popup) break;
    await tap(s?.popup ? 'tw-cross' : 'tw-start');
  }
  await until(page, 'main menu', (s) => s.dialog === 'dlgMenu.rdr' && s.ready && !s.popup);
  await page.screenshot({ path: test.info().outputPath('menu-portrait.png') });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(pad.locator('#tw-down')).toBeVisible();
  for (let i = 0; i < 8; i++) {
    const s = await seen(page);
    if (s?.focused === 'multiplayer_button') break;
    await tap('tw-down');
  }
  await page.screenshot({ path: test.info().outputPath('menu-landscape.png') });
  expect((await seen(page))?.focused).toBe('multiplayer_button');
  // A position saved in Mobile settings must move the actual menu hit target too.
  await page.evaluate(() => {
    const key = 's2u.viewer.mobileLayout.v1';
    localStorage.setItem(key, JSON.stringify({ version: 1, portrait: {}, landscape: { 'tw-cross': { x: 0.65, y: 0.65 } } }));
    window.dispatchEvent(new StorageEvent('storage', { key }));
  });
  await expect.poll(async () => (await pad.locator('#tw-cross').boundingBox())?.x ?? 0).toBeLessThan(600);
  expect((await pad.locator('#tw-cross').boundingBox())!.x).toBeGreaterThan(500);
  await tap('tw-cross');
  await until(page, 'Online connection menu', (s) => s.dialog === 'dlgNetLogin.rdr' || s.dialog === 'dlgMPswitch.rdr');
  console.log('TOUCH_ONLINE', await seen(page));
  expect(maps).toEqual([]); expect(errors).toEqual([]);
});
