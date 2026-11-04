import { expect, test, type Page } from '@playwright/test';
import { RAIL_ORDER } from './launcherRail';

/**
 * LATER 335 (Craig's ask, 2026-10-22: "scroll wheel anywhere on the core launcher ui should go between tabs at a graceful
 * pace ... except for when scrolling scrollable regions that have overflowed content ..., and for areas like settings or
 * any submenus like replays etc."), rendered: the console launcher's wheel (`src/console/wheelTabs.ts`, attached by
 * `src/console/input.ts`) with a real mouse wheel (`page.mouse.wheel`), on the live page (`/`; no disc, no server: the
 * crossbar needs neither) at 1280x720 (`test/console/wheelTabsSpec.test.ts` holds this spec to the page's rules). The tab is read off the page's own drawing: the crossbar's current
 * category (`#stage .cx-cat.is-current`), as `consoleCrossbar.spec.ts` reads it; no hook.
 *
 * 1. over the crossbar one notch down is the next tab and one notch up the previous;
 * 2. the ends stop, as the shoulders do (LR.R3, the owner, 2026-10-26, superseding CX.R12's wrap): up on the first
 *    (Profile, LR.R2) stays there, down on the last (Experiments) stays there;
 * 3. a spin -- several notches inside one gesture -- moves exactly one tab; a notch after the pause moves the next;
 * 4. over Settings' Home list (LR-23, LR.R22: above the phone rule it slides by the focused row and never scrolls) the
 *    wheel moves the tab -- a list that can scroll keeps it, `test/console/wheelInput.test.ts`;
 * 5. Settings' pushed page (an item of the Settings tab opens the Options screen): the wheel never moves a tab there --
 *    back on Home (Circle, the keymap's Backspace) the tab is still Settings.
 *
 * A browser adaptation with no original (the project's own launcher page, OT.R28): nothing of the game runs. A rendered
 * browser run: the host's lock rules apply, and it runs in the controller's slot.
 */
test.use({ actionTimeout: 15_000 });
test.setTimeout(3 * 60_000);

const ROOT = '/';
/** Past the wheel's cooldown (300 ms) and a gesture's idle end (150 ms): the next notch is a fresh gesture. */
const PAUSE_MS = 600;

const current = (page: Page) => page.locator('#stage .cx-cat.is-current .cx-cat__label');

/** The launcher up at 1280x720: the crossbar drawn, its labels in order. */
async function open(page: Page): Promise<string[]> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(ROOT);
  await expect(page.locator('#stage .cx-cat.is-current')).toHaveCount(1);
  return page.locator('#stage .cx-cat .cx-cat__label').allTextContents();
}

/** The mouse over the crossbar's middle. */
async function overCrossbar(page: Page): Promise<void> {
  const b = (await page.locator('#stage .cx-crossbar').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
}

/** One notch (Chromium's 100 px), then the pause that ends its gesture. */
async function notch(page: Page, dy: number): Promise<void> {
  await page.mouse.wheel(0, dy);
  await page.waitForTimeout(PAUSE_MS);
}

test('LATER 335: the wheel over the crossbar moves one tab a notch, stops at the ends, and a spin is one tab', async ({ page }) => {
  const names = await open(page);
  expect(names).toEqual([...RAIL_ORDER]);                                 // LR.R2
  const last = names.length - 1;
  const home = names.indexOf('Home');
  await expect(current(page)).toHaveText('Home');                         // LR.R2: Home the default
  await overCrossbar(page);
  await notch(page, 100);
  await expect(current(page)).toHaveText(names[home + 1]!);              // 1. down: the next
  await notch(page, -100);
  await expect(current(page)).toHaveText(names[home]!);                  // up: the previous
  for (let i = home - 1; i >= 0; i--) {
    await notch(page, -100);
    await expect(current(page)).toHaveText(names[i]!);
  }
  await notch(page, -100);
  await expect(current(page)).toHaveText(names[0]!);                     // 2. up on the first: stays (LR.R3, L1's bump)
  for (let i = 1; i <= last; i++) {
    await notch(page, 100);
    await expect(current(page)).toHaveText(names[i]!);
  }
  await notch(page, 100);
  await expect(current(page)).toHaveText(names[last]!);                  // down on the last: stays (LR.R3, R1's bump)
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -100);           // 3. a spin: one gesture
  await page.waitForTimeout(PAUSE_MS);
  await expect(current(page)).toHaveText(names[last - 1]!);              // one tab, not six
  await notch(page, -100);
  await expect(current(page)).toHaveText(names[last - 2]!);              // the next gesture, the next tab
  await expect(page.locator('html')).toHaveAttribute('data-input', 'pointer');
});

test("LATER 335 under LR.R22: Settings' Home list slides and never scrolls at 1280x720; the wheel over it moves the tab", async ({ page }) => {
  const names = await open(page);
  const at = names.indexOf('Settings');
  expect(at).toBeGreaterThan(0);
  await page.locator('#stage .cx-cat').nth(at).click();                   // a click on a category makes it current
  await expect(current(page)).toHaveText('Settings');
  const list = page.locator('#stage .cx-list[data-key="list-options"]');
  const geo = () => list.evaluate((el) => ({ top: el.scrollTop, oy: getComputedStyle(el).overflowY }));
  const g0 = await geo();
  // 4. LR-23 (LR.R22, the owner, 2026-10-27): above the phone rule the list slides by the focused row and is no scroll box
  // (`overflow: visible`, test/console/lr23Home.test.ts), so nothing under the wheel takes it: CX-LEGEND's scrolling list,
  // which this test first read, is gone at this size. The scroll box's own exclusion is test/console/wheelInput.test.ts's.
  expect(g0.oy).toBe('visible');
  expect(g0.top).toBe(0);
  const b = (await list.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 40));
  await notch(page, 100);                                                 // over the list: the tabs' wheel
  expect(at).toBeLessThan(names.length - 1);                              // LR.R2: a tab right of Settings (no wrap, LR.R3)
  await expect(current(page)).toHaveText(names[at + 1]!);
});

test("LATER 335: on Settings' pushed page the wheel never moves a tab", async ({ page }) => {
  const names = await open(page);
  const at = names.indexOf('Settings');
  await page.locator('#stage .cx-cat').nth(at).click();
  await expect(current(page)).toHaveText('Settings');
  await page.locator('#stage .cx-list[data-key="list-options"] .cx-item').first().click();   // opens the Options screen
  await expect(page.locator('#stage h1.cx-title')).toHaveCount(1);
  const title = await page.locator('#stage h1.cx-title').textContent();
  await expect(page.locator('#stage .cx-cat')).toHaveCount(0);            // the crossbar is Home's: not drawn here
  const s = (await page.locator('#stage').boundingBox())!;
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  for (const dy of [100, 100, -100, -100]) await notch(page, dy);
  await expect(page.locator('#stage h1.cx-title')).toHaveText(title!);    // 5. still the Options screen
  await page.getByRole('button', { name: 'Back to Settings' }).click();   // the pointer's back (as Circle): to Home
  await expect(current(page)).toHaveText('Settings');                     // the tab never moved
});
