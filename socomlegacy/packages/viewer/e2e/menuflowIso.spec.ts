import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type {} from '../src/hook';
import type { FrontEndWindowHook } from '../src/frontEnd';
import { FRONT_END } from './urls';

/**
 * OT.R14 (the owner, 2026-10-03 ~13:30Z: "We need to read everything from the disk from the iso as a rule, devmode is
 * just a convenience"; web research 148): on the front end's page (the base path, OT.R19) without `?devmode` the page offers the visitor's disc image on
 * its own disc page (`#disc-page`, `#disc-page-file`; `../src/pageEntry.ts`, `../src/discPrompt.ts`) and asks nothing of
 * the served tree. From OT.R28 (2026-10-04) to CX-9b that page was the SOCOM II Legacy setup page, whose START ran the
 * front end once the image opened; since CX-9b (CX.R8: the old launcher's layout removed) it is the plain disc page
 * again, at `/setup` (`FRONT_END`), and the image that opens runs the front end at once -- the loader's screens, the
 * opener's dialogs, a deep link to LOGIN. `?devmode` reads the served tree as before. A rendered browser run over the retail image
 * (`SOCOM_ISO`, skipped cleanly without it, as `iso.spec.ts` skips without its fixtures): the canvas is sampled for its
 * mean luma, nothing of the game is scored.
 */
const HAVE_MAPS = existsSync(fileURLToPath(new URL('../../../public/maps/index.json', import.meta.url)));
test.skip(!HAVE_MAPS, 'maps absent: the run\'s web server waits on maps/index.json (playwright.config.ts)');
const ISO = process.env.SOCOM_ISO ?? '';
const HAVE_ISO = ISO !== '' && existsSync(ISO);

type Hooked = Window & { __frontEnd?: FrontEndWindowHook };

/** Every request under the served tree (`maps/`). */
function mapsRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (r) => { if (/\/maps\//.test(r.url())) urls.push(r.url()); });
  return urls;
}

/**
 * The front end's frame, its mean luma (Rec. 601 weights) over the frame. GM-09: read through the page's presenter
 * (`FrontEndSession.readFrame`, the frame the canvas shows), not the canvas's 2D context, which a GPU canvas has not;
 * -1 before the session's first frame.
 */
const luma = (page: Page): Promise<number> => page.evaluate(() => {
  const d = (window as Hooked).__frontEnd?.session.readFrame()?.data;
  if (!d) return -1;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
  return sum / (d.length / 4);
});

/** The session's frames have drawn over the mount's status line: the hook is up and a tick's draw list is in. */
const sessionUp = (page: Page): Promise<boolean> => page.evaluate(() => {
  const h = (window as Hooked).__frontEnd;
  return !!h && h.session.last.length > 0;
});

test('the game page: the disc page is offered, and nothing is asked of the served tree', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const maps = mapsRequests(page);
  await page.goto(FRONT_END);
  await expect(page.locator('#disc-page')).toBeVisible();
  await expect(page.locator('#disc-page-file')).toHaveCount(1);
  await expect(page.locator('#disc-state')).toHaveText('waiting for a disc image');
  await expect(page.locator('#startup-start')).toHaveCount(0);           // CX-9b: no START between the image and the game
  await page.waitForTimeout(3_000);
  expect(await page.evaluate(() => ({
    children: [...document.body.children].map((e) => `${e.tagName.toLowerCase()}#${e.id}`),
    frontEnd: document.getElementById('front-end'),
    viewer: typeof (window as unknown as { __viewer?: unknown }).__viewer,
  }))).toEqual({ children: ['main#disc-page'], frontEnd: null, viewer: 'undefined' });   // the disc page alone (CX-9b)
  expect(maps).toEqual([]);
  expect(errors).toEqual([]);
});

test.describe('the base path over the visitor\'s image (SOCOM_ISO)', () => {
  test.skip(!HAVE_ISO, 'SOCOM_ISO absent');
  test.setTimeout(300_000);

  test('the opener runs from the image: the loader\'s screens draw, the dialogs come; no request under maps/', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const maps = mapsRequests(page);
    await page.goto(FRONT_END);
    await page.locator('#disc-page-file').setInputFiles(ISO);              // CX-9b: the image that opens runs the game
    await expect(page.locator('canvas#front-end')).toHaveCount(1, { timeout: 60_000 });
    await expect(page.locator('#disc-page')).toHaveCount(0);
    await expect.poll(() => sessionUp(page), { timeout: 60_000 }).toBe(true);
    // The loader's raw screens (BOOT-02, `RUN/RAW/*.RAW` off the image): the frame is not black.
    let loaderLuma = 0;
    await expect.poll(async () => (loaderLuma = await luma(page)), { timeout: 60_000 }).toBeGreaterThan(0);
    const loaderPhases = await page.evaluate(() => (window as Hooked).__frontEnd!.events.filter((e) => e.kind === 'loader').map((e) => (e as { phase: string }).phase));
    // The game's boot dialogs, built off the image's READERC.ZAR (BOOT-04).
    await expect.poll(() => page.evaluate(() => (window as Hooked).__frontEnd!.events.filter((e) => e.kind === 'dialog').map((e) => (e as { name: string }).name)), { timeout: 120_000 })
      .toContain('dlgIntroScreen.rdr');
    const dialogs = await page.evaluate(() => (window as Hooked).__frontEnd!.events.filter((e) => e.kind === 'dialog').map((e) => (e as { name: string }).name));
    console.log(`MENUFLOW_ISO opener ${JSON.stringify({ loaderLuma: Math.round(loaderLuma * 100) / 100, loaderPhases, dialogs })}`);
    expect(maps).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('?menuflow=dlgNetLogin.rdr after opening the image: LOGIN is up and drawn', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const maps = mapsRequests(page);
    await page.goto(`${FRONT_END}?menuflow=dlgNetLogin.rdr`);
    await page.locator('#disc-page-file').setInputFiles(ISO);              // CX-9b: the image that opens runs the game
    await expect.poll(() => sessionUp(page), { timeout: 60_000 }).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as Hooked).__frontEnd!.session.machine.shell()?.currentName), { timeout: 60_000 })
      .toBe('dlgNetLogin.rdr');
    let loginLuma = 0;
    await expect.poll(async () => (loginLuma = await luma(page)), { timeout: 60_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(2_000);                                   // the banks come in asynchronously (`../src/frontEndAssets.ts`)
    loginLuma = await luma(page);
    console.log(`MENUFLOW_ISO login ${JSON.stringify({ luma: Math.round(loginLuma * 100) / 100, path: new URL(page.url()).pathname })}`);
    expect(loginLuma).toBeGreaterThan(0);
    expect(maps).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test('?devmode: the served tree, no disc page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const maps = mapsRequests(page);
  await page.goto(`${FRONT_END}?devmode`);
  await expect(page.locator('canvas#front-end')).toHaveCount(1);
  await expect(page.locator('#disc-page')).toHaveCount(0);
  await expect.poll(() => maps.some((u) => /\/maps\/RUN\/UI\/READERC\.ZAR/.test(u)), { timeout: 30_000 }).toBe(true);
  expect(errors).toEqual([]);
});
