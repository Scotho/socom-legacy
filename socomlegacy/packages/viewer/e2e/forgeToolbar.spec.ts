import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { emptyLayout } from '../src/forge/layout';
import { expectBase } from './forgeBase';

/**
 * LATER 226 (the merge controller's product-track call, 2026-10-21): the forge's toolbar is one row about 1112-1271 px
 * wide; below that its right end lay past the screen's edge and could not be reached (a phone lost most of the row, a
 * 1024 px window Docks, Walk, Check, Create lobby and Play). It scrolls sideways at every width where it overflows
 * (`../src/forge/forge.css` `.fx-top`): every control can be brought on screen, Docks can be tapped on a phone, the row
 * keeps its 46 px height (the docks' top), and where the row fits nothing scrolls. A browser adaptation (OT.R28).
 */
test.use({ storageState: { cookies: [], origins: [] } });

// The base ask's case changes the base to a served map (`socomlegacy/public/maps`, not committed); without them it is
// skipped, not passed (`./forgePlayFromHere.spec.ts`' guard; the fold's review).
const MAPS = fileURLToPath(new URL('../../../public/maps', import.meta.url));
const HAVE_MAPS = existsSync(join(MAPS, 'index.json')) && existsSync(join(MAPS, 'RUN', 'MP2.ZDB'));

/** Every shown control of the toolbar, by index. */
const controls = (page: Page) => page.locator('header.fx-top').locator('a, button, select, input').filter({ visible: true });

async function open(page: Page): Promise<void> {
  await page.goto('/forge');
  await expect(page.locator('header.fx-top')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('button.fx-play')).toBeAttached();
}

/** Each control brought into view lies wholly on the screen. */
async function everyReachable(page: Page, width: number): Promise<void> {
  const n = await controls(page).count();
  expect(n, 'the toolbar\'s controls').toBeGreaterThan(15);
  for (let i = 0; i < n; i++) {
    const c = controls(page).nth(i);
    await c.scrollIntoViewIfNeeded();
    const b = (await c.boundingBox())!;
    const name = (await c.getAttribute('title')) ?? (await c.getAttribute('aria-label')) ?? `control ${i}`;
    expect(b.x, `${name}: its left on the screen`).toBeGreaterThanOrEqual(-0.5);
    expect(b.x + b.width, `${name}: its right on the screen`).toBeLessThanOrEqual(width + 0.5);
  }
}

for (const size of [{ width: 390, height: 844 }, { width: 760, height: 900 }]) {
  test.describe(`a narrow touch screen, ${size.width}x${size.height}`, () => {
    test.use({ hasTouch: true, isMobile: true, viewport: size });

    test('every toolbar control can be scrolled to, and Docks tapped opens the docks', async ({ page }) => {
      await open(page);
      await everyReachable(page, size.width);
      await expect(page.locator('.fx-left')).toBeHidden();
      const docks = page.locator('button.fx-tool[title^="Show or hide the docks"]');
      await docks.scrollIntoViewIfNeeded();
      await docks.tap({ timeout: 5_000 });
      await expect(page.locator('.fx-left')).toBeVisible();
    });

    // The review's F2 (the merge controller's word: folded into LATER 226): a base change asked on a phone has its
    // buttons on the screen untouched. OT.R112: the contributor's toolbar has no base list and no inline ask -- New asks
    // for the base on a card (`./forgeBase`); its Next and Cancel are what must be on the screen.
    test('a base changed: New\'s card has its Next and Cancel on the screen without a drag', async ({ page }) => {
      test.skip(size.width !== 390, 'one phone width is enough');
      test.skip(!HAVE_MAPS, 'needs socomlegacy/public/maps/index.json and RUN/MP2.ZDB, the served maps as bases (not committed)');
      await page.goto('/forge?devmode');                                    // the served maps as bases (`./forgePlayFromHere.spec.ts`)
      await expectBase(page);
      await page.locator('header.fx-top button[title^="Start a new layout"]').click();
      const card = page.locator('.fx-modal .fx-card').filter({ has: page.locator('select[aria-label="New layout"]') });
      await expect(card).toBeVisible({ timeout: 30_000 });
      const next = card.getByRole('button', { name: 'Next' });
      const cancel = card.getByRole('button', { name: 'Cancel' });
      for (const b of [next, cancel]) {
        const r = (await b.boundingBox())!;
        expect(r.x, 'its left on the screen').toBeGreaterThanOrEqual(-0.5);
        expect(r.x + r.width, 'its right on the screen').toBeLessThanOrEqual(size.width + 0.5);
      }
      await cancel.tap();
      await expect(card).toBeHidden();
    });
  });
}

test.describe('a 1024 px window', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('every toolbar control can be scrolled to; scrolled to Play the row keeps its 46 px and the docks\' top', async ({ page }) => {
    await open(page);
    await everyReachable(page, 1024);
    await page.locator('button.fx-play').scrollIntoViewIfNeeded();
    const top = (await page.locator('header.fx-top').boundingBox())!;
    expect(top.height, 'the row\'s height').toBeCloseTo(46, 0);
    // OT.R112: the docks start under the toolbar's 46 px and the placing tools' 40 px row under it
    // (`../src/forge/forge.css`: `--fx-top: 86px`, `--fx-top-bar: 46px`, `.fx-tools-row` height 40px).
    const tools = (await page.locator('nav.fx-tools-row').boundingBox())!;
    expect(tools.y, 'the tools row\'s top').toBeCloseTo(46, 0);
    expect(tools.height, 'the tools row\'s height').toBeCloseTo(40, 0);
    const left = (await page.locator('.fx-left').boundingBox())!;
    expect(left.y, 'the docks\' top').toBeCloseTo(86, 0);
  });
});

// R7-1 (the rendered pass 2: 1491 px at 1440; the UI seat's ruling): the row's natural width is at most 1260 px, so the
// 1280 default window fits it as 1440 does -- nothing scrolls, and every control lies wholly on the screen untouched.
// The round 7 review: the full row with labels is ~2150-2240 px, so the compact row holds to 2200 px; 1920 fits too.
for (const size of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
  test.describe(`a window the row fits, ${size.width}x${size.height}`, () => {
    test.use({ viewport: size });

    test('nothing scrolls', async ({ page }) => {
      await open(page);
      const w = await page.locator('header.fx-top').evaluate((e) => ({ scroll: e.scrollWidth, client: e.clientWidth }));
      expect(w.scroll).toBeLessThanOrEqual(w.client);
      const n = await controls(page).count();
      for (let i = 0; i < n; i++) {
        const b = (await controls(page).nth(i).boundingBox())!;
        expect(b.x + b.width, `control ${i}: its right on the screen, unscrolled`).toBeLessThanOrEqual(size.width + 0.5);
      }
    });
  });
}

// LATER 470 (round 7's review, finding 2): a lobby's joiner has one tool more, Save map (`../src/forge/page.ts`
// `drawLobbyBtn`: shown for a joiner of an open lobby with a layout), 24 px and a 2 px gap in the compact row
// (`../src/forge/forge.css`, `@media (max-width: 2200px)`), which the cases above never show. By the CSS sum with the
// hosted faces' advances (`shared/fonts`) the joiner's row is about 1260 px with the base select and the name at their
// floors (112 px, 96 px), so 1280 should fit it as it fits the host's -- this case is the rendered judge. The join is the
// page's own (`/forge?lobby=<id>`), its server answered here as `./forgeJoinerAutosave.spec.ts` answers it: the lobby's
// read, the guest pass, a silent socket. The join reads the served maps (not committed); without them it is skipped,
// not passed. A browser adaptation (OT.R28).
const JOIN_ID = 'later470';

async function joinerLobbyServer(page: Page): Promise<void> {
  const lobby = {
    id: JOIN_ID, name: 'Yard', base: 'MP2', players: 1, max: 16, settings: {}, created: 0, listed: false, inMatch: false,
    layout: emptyLayout({ kind: 'map', archive: 'MP2' }), missing: 0,
    state: { seats: [{ id: 1, name: 'Host', team: null, ready: false, host: true }], countdown: null, launched: false },
  };
  await page.route(`**/lobby/forge/lobby/${JOIN_ID}`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(lobby) }));
  await page.route(`**/lobby/forge/lobby/${JOIN_ID}/guest`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ guest: null }) }));
  await page.routeWebSocket((url) => url.pathname === '/ws', () => { /* held open, silent: the lobby's room is not this spec's */ });
}

test.describe('a lobby\'s joiner at 1280x720 (LATER 470)', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the Save-map tool shown: nothing scrolls, wraps or is clipped, every control on the screen', async ({ page }) => {
    test.skip(!HAVE_MAPS, 'needs socomlegacy/public/maps/index.json and RUN/MP2.ZDB, the served maps as bases (not committed)');
    const W = 1280;
    await joinerLobbyServer(page);
    await page.goto(`/forge?devmode&lobby=${JOIN_ID}`);
    await expect(page.locator('.fx-status-msg')).toHaveText(/in the lobby Yard/, { timeout: 90_000 });
    const saveMap = page.locator('header.fx-top button[data-forge="save-map"]');
    await expect(saveMap, 'the joiner\'s Save-map tool').toBeVisible();
    // The row measured in the hosted faces, not their fallbacks (`font-display: swap`).
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const top = page.locator('header.fx-top');
    const w = await top.evaluate((e) => ({ scroll: e.scrollWidth, client: e.clientWidth, left: e.scrollLeft }));
    expect(w.scroll, 'the row\'s width within the window: nothing to scroll').toBeLessThanOrEqual(w.client);
    expect(w.left, 'the row unscrolled').toBe(0);
    const bar = (await top.boundingBox())!;
    expect(bar.height, 'one row, its 46 px: nothing wrapped').toBeCloseTo(46, 0);
    const n = await controls(page).count();
    expect(n, 'the toolbar\'s controls').toBeGreaterThan(15);
    for (let i = 0; i < n; i++) {
      const c = controls(page).nth(i);
      const b = (await c.boundingBox())!;
      const name = (await c.getAttribute('aria-label')) ?? (await c.getAttribute('title')) ?? `control ${i}`;
      expect(b.x, `${name}: its left on the screen, unscrolled`).toBeGreaterThanOrEqual(-0.5);
      expect(b.x + b.width, `${name}: its right on the screen, unscrolled`).toBeLessThanOrEqual(W + 0.5);
      expect(b.y, `${name}: its top inside the row, not clipped`).toBeGreaterThanOrEqual(bar.y - 0.5);
      expect(b.y + b.height, `${name}: its foot inside the row, not clipped`).toBeLessThanOrEqual(bar.y + bar.height + 0.5);
    }
    const play = (await page.locator('button.fx-play').boundingBox())!;
    expect(play.x + play.width, 'Play, the row\'s last control, on the screen').toBeLessThanOrEqual(W + 0.5);
  });
});
