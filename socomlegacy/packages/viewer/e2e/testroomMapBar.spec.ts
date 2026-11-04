import { expect, test, type Page } from '@playwright/test';
import { cleanStorageWithLocalPort, localPort } from './ports';
import { TEST_ROOM, TEST_ROOM_PAST_SHEET } from './urls';

/**
 * TR-1 (the test room's maps plan, TR.R2; the owner's playtest, 2026-10-12: "Please make /testroom have a dropdown for
 * map selection."; `../src/testroomMapBar.ts`): the test room's bar carries a map dropdown over the served tree. Choosing
 * a map reloads the room with `?map=<archive>`, the other parameters kept (`&fly` bare, `devmode`), and the room comes
 * up on it, the panel's picker on the same map. Without the served tree (no `?devmode`: the visitor's disc only) the
 * dropdown is not shown. A test instrument's adaptation; only the `page` fixture is used (no context of its own).
 */
// A first visit's storage, but for this worker's Local port (LATER 495: `./ports`, the run's per-worker ports).
test.use({ storageState: async ({ baseURL }, use) => { await use(cleanStorageWithLocalPort(new URL(baseURL!).origin)); } });

const params = (page: Page): URLSearchParams => new URL(page.url()).searchParams;

test('the bar\'s dropdown lists the served maps and reloads the room on the one chosen, the address kept', async ({ page }) => {
  await page.goto(`${TEST_ROOM}?devmode&fly`);
  await expect(page.locator('#status')).toContainText(/triangles|tris/);
  const bar = page.locator('#site-links #map-bar');
  await expect(bar).toBeVisible();
  await expect.poll(() => params(page).get('map')).toBeTruthy();
  const first = params(page).get('map')!;
  await expect(bar).toHaveValue(first);                               // the room's map selected
  const values = await bar.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  expect(values.length).toBeGreaterThan(1);
  const second = values.includes('MP6') && first !== 'MP6' ? 'MP6' : values.find((v) => v !== first)!;
  const entries = await page.evaluate(() => history.length);

  await Promise.all([
    page.waitForURL((url) => url.searchParams.get('map') === second),
    bar.selectOption(second),
  ]);
  await expect(page.locator('#status')).toContainText(/triangles|tris/);
  await expect(page.locator('#status')).toContainText(second);
  await expect(page.locator('#map-bar')).toHaveValue(second);
  await expect(page.locator('#maps')).toHaveValue(`RUN/${second}.ZDB`);   // the panel's picker follows the room
  expect(page.url()).toMatch(/[?&]fly(&|$)/);                          // the developer's parameters as they were
  expect(params(page).has('devmode')).toBe(true);
  expect(await page.evaluate(() => history.length)).toBe(entries);   // replaced, never pushed (`updateAddress`'s rule)
});

test("a closed dropdown's arrow or letter is undone: the room is not reloaded, the room's map still shown", async ({ page }) => {
  await page.goto(`${TEST_ROOM}?devmode&fly`);
  await expect(page.locator('#status')).toContainText(/triangles|tris/);
  await expect.poll(() => params(page).get('map')).toBeTruthy();
  const url = page.url();
  const bar = page.locator('#map-bar');
  await expect(bar).toBeVisible();                                     // or the keys below test nothing
  const before = await bar.inputValue();
  await bar.focus();
  await expect(bar).toBeFocused();
  for (const key of ['ArrowDown', 'f', 'b']) await page.keyboard.press(key);
  await page.waitForTimeout(500);
  expect(page.url()).toBe(url);
  await expect(bar).toHaveValue(before);
});

test('a closed dropdown\'s letter alone (its first-letter search moves it) is undone: no reload, the focus given back', async ({ page }) => {
  await page.goto(`${TEST_ROOM}?devmode&fly`);
  await expect(page.locator('#status')).toContainText(/triangles|tris/);
  await expect.poll(() => params(page).get('map')).toBeTruthy();
  const url = page.url();
  const bar = page.locator('#map-bar');
  await expect(bar).toBeVisible();
  const before = await bar.inputValue();
  // The first letter of another option's label, one the room's own label does not start with, so the search moves the
  // select: a letter and nothing before it (an arrow first would blur the bar and leave the letter testing nothing).
  const labels = await bar.locator('option').evaluateAll((os) => os.map((o) => ({ value: (o as HTMLOptionElement).value, text: (o.textContent ?? '').trim() })));
  const own = labels.find((l) => l.value === before)!.text[0]!.toLowerCase();
  const other = labels.find((l) => l.value !== before && /^[a-z]$/i.test(l.text[0] ?? '') && l.text[0]!.toLowerCase() !== own);
  // With every served label starting with the room's own letter, the closest is that letter: the search then moves to the
  // next option starting with it, which still moves the select.
  const letter = other ? other.text[0]!.toLowerCase() : own;
  await bar.focus();
  await expect(bar).toBeFocused();
  await page.keyboard.press(letter);
  await page.waitForTimeout(500);
  expect(page.url()).toBe(url);
  await expect(bar).toHaveValue(before);
  await expect(bar).not.toBeFocused();                                 // the select moved, so the guard blurred it
});

test('without the served tree (the visitor\'s disc only) the bar has no map dropdown', async ({ page }) => {
  await page.goto(TEST_ROOM_PAST_SHEET);
  await expect(page.locator('#disc-page')).toBeVisible();
  await expect(page.locator('#map-bar')).toBeHidden();
});

/**
 * TR-2 (TR.R3; research 307; `../src/servedMaps.ts`): with Online = Local the room reads its server's `GET /maps` before
 * joining, and the bar marks each map the server does not play -- never hides one. No server is started: the spec answers
 * the run's own Local port's `/maps` itself (`page.route`, as `playersOnline.spec.ts` answers `/rooms`) with the owner's
 * run's set (`MAPS=MP2,MP51,MP72`); the page's socket to Local finds nobody and retries, which is the Online line's
 * business, not this spec's.
 */
test("Online = Local: the bar marks the maps the server's /maps does not name, every map still listed", async ({ page }) => {
  let asked = 0;
  await page.route(`http://localhost:${localPort()}/maps`, (route) => {
    asked++;
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=10' },
      body: JSON.stringify({ maps: ['MP2', 'MP51', 'MP72'] }),
    });
  });
  await page.addInitScript(() => { localStorage.setItem('s2u.viewer.online', 'local'); });
  await page.goto(`${TEST_ROOM}?devmode&fly&map=MP2`);
  await expect(page.locator('#status')).toContainText(/triangles|tris/);
  const bar = page.locator('#site-links #map-bar');
  await expect(bar).toBeVisible();
  await expect(bar).toHaveValue('MP2');                                // the room's map still selected
  const marked = bar.locator('option', { hasText: 'not on this server' });
  await expect.poll(() => marked.count()).toBeGreaterThan(0);
  const options = await bar.locator('option').evaluateAll((os) => os.map((o) => ({ value: (o as HTMLOptionElement).value, text: o.textContent ?? '' })));
  for (const o of options) expect(o.text.includes('not on this server'), o.value).toBe(!['MP2', 'MP51', 'MP72'].includes(o.value));
  expect(options.length).toBeGreaterThan(1);                            // marked, never hidden
  expect(asked).toBeGreaterThanOrEqual(1);
});

/**
 * TR-2's review (59848254f, FAIL high): the bar's `/maps` re-read listened to the Online switch before the page's own
 * handler, pressed the button first, and the page's then found it pressed and returned -- no choice written, the address
 * unchanged, the room never moved to the chosen server. This case loads with Online Off and switches to Local in the panel:
 * the page's own handler runs (the choice remembered, `online=local` in the address, the Online line off "single player"),
 * and the re-read asks `/maps` and marks the bar.
 */
test('Online Off -> Local in the panel: the room moves to Local, and /maps is asked and marks the bar', async ({ page }) => {
  let asked = 0;
  await page.route(`http://localhost:${localPort()}/maps`, (route) => {
    asked++;
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=10' },
      body: JSON.stringify({ maps: ['MP2', 'MP51', 'MP72'] }),
    });
  });
  await page.addInitScript(() => { localStorage.setItem('s2u.viewer.panelOpen', '1'); localStorage.setItem('s2u.viewer.online', 'off'); });
  await page.goto(`${TEST_ROOM}?devmode&fly&map=MP2`);
  await expect(page.locator('#status')).toContainText(/triangles|tris/);
  const bar = page.locator('#site-links #map-bar');
  await expect(bar).toBeVisible();
  await expect(page.locator('#online [data-online="off"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#online-text')).toHaveText('single player: no server');
  expect(asked).toBe(0);                                                // Online Off: no server to ask
  await expect(bar.locator('option', { hasText: 'not on this server' })).toHaveCount(0);

  await page.locator('#online [data-online="local"]').click();
  await expect(page.locator('#online [data-online="local"]')).toHaveAttribute('aria-pressed', 'true');
  // The page's own handler ran: the choice remembered and written into the address, the room joining Local.
  await expect.poll(() => new URL(page.url()).searchParams.get('online')).toBe('local');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('s2u.viewer.online'))).toBe('local');
  await expect(page.locator('#online-text')).not.toHaveText('single player: no server');
  // The bar's re-read ran too: /maps asked at the Local server, the maps it does not name marked.
  await expect.poll(() => asked).toBeGreaterThanOrEqual(1);
  await expect(bar.locator('option[value="MP2"]')).not.toContainText('not on this server');
  await expect.poll(() => bar.locator('option', { hasText: 'not on this server' }).count()).toBeGreaterThan(0);
  await expect(bar).toHaveValue('MP2');
});
