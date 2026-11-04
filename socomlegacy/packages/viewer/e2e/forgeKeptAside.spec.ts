import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { forgeStoredList } from './forgeStore';

/**
 * LATER 214 (the merge controller's product-track call on the words, 2026-10-21): what the forge kept aside -- an
 * autosave this build could not read (LATER 193, 215), a saved list (`setAsideSaves`) -- is given back in the Saves
 * card under "Kept aside": each copy downloads as a file, as it was, from a blob link clicked in place (no new window,
 * so a phone's browser takes it too), and deletes behind a confirm, the rest kept. A browser adaptation (OT.R28). The
 * floor (`?floor`) needs no disc.
 */
const AUTOSAVES = ['a hand edit {', 'another {'];
const SAVED_LIST = 'broken list';

async function seeded(page: Page): Promise<void> {
  await page.addInitScript(([autosaves, list]) => {
    if (sessionStorage.getItem('later214-seeded')) return;
    sessionStorage.setItem('later214-seeded', '1');
    localStorage.setItem('s2u-forge-layout-aside', autosaves as string);
    localStorage.setItem('s2u-forge-saves-aside', list as string);
  }, [JSON.stringify(AUTOSAVES), SAVED_LIST]);
  await page.goto('/forge?floor');
  await expect(page.locator('.fx-status-msg')).toHaveText(/layout open/, { timeout: 60_000 });
  await expect(page.locator('.fx-loading')).toBeHidden();
}

async function walk(page: Page, press: 'click' | 'tap'): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const opened: string[] = [];
  page.context().on('page', (p) => opened.push(p.url()));
  await seeded(page);
  await page.locator('[data-forge="saves"]')[press]();
  const kept = page.locator('[data-kept-aside]');
  await expect(kept.locator('h3')).toHaveText('Kept aside');
  await expect(kept.locator('li .fx-save-name')).toHaveText(['Earlier autosave 1', 'Earlier autosave 2', 'Earlier saved list']);
  await expect(kept.locator('li .fx-dim').first()).toHaveText(/^not readable here · 1 KB$/);

  // Each copy downloads as it was.
  for (const [name, text, file] of [
    ['Earlier autosave 2', AUTOSAVES[1]!, 'forge-earlier-autosave-2.txt'],
    ['Earlier saved list', SAVED_LIST, 'forge-earlier-saved-list.txt'],
  ] as const) {
    const row = kept.locator('li', { hasText: name });
    const [dl] = await Promise.all([page.waitForEvent('download'), row.getByRole('button', { name: 'Download' })[press]()]);
    expect(dl.suggestedFilename()).toBe(file);
    expect(readFileSync((await dl.path())!, 'utf8'), name).toBe(text);
    await expect(page.locator('.fx-toast')).toHaveText(`Saved ${file}`);
  }

  // Delete asks first; Cancel keeps it; Delete removes that one alone.
  const first = (): ReturnType<Page['locator']> => page.locator('[data-kept-aside] li', { hasText: 'Earlier autosave 1' });
  await first().getByRole('button', { name: 'Delete' })[press]();
  await expect(page.getByRole('heading', { name: 'Delete this kept copy?' })).toBeVisible();   // the help card's h2 is the other .fx-modal's
  await page.locator('.fx-modal').getByRole('button', { name: 'Cancel' })[press]();
  await expect(first()).toHaveCount(1);
  await first().getByRole('button', { name: 'Delete' })[press]();
  await page.locator('.fx-modal').getByRole('button', { name: 'Delete', exact: true })[press]();
  await expect(page.locator('.fx-toast')).toHaveText('Deleted Earlier autosave 1');
  await expect(page.locator('[data-kept-aside] li .fx-save-name')).toHaveText(['Earlier autosave 1', 'Earlier saved list']);
  // R3-B: the lists moved to the page's saves store at the load (`./forgeStore`)
  const stored = [await forgeStoredList(page, 'autosaveAside'), await forgeStoredList(page, 'savesAside')];
  expect(JSON.parse(stored[0]!), 'the other autosave kept').toEqual([AUTOSAVES[1]]);
  expect(stored[1]).toBe(SAVED_LIST);

  expect(opened, 'no new window or tab').toEqual([]);
  expect(errors).toEqual([]);
}

test.describe('a desktop window', () => {
  test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 720 }, acceptDownloads: true });
  test('LATER 214: kept copies are listed, download as they were, and delete behind a confirm', async ({ page }) => {
    await walk(page, 'click');
  });
});

test.describe('a phone', () => {
  test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 412, height: 915 }, hasTouch: true, acceptDownloads: true });
  test('LATER 214: the same by touch on a phone: the download is a blob link in place, no popup', async ({ page }) => {
    await walk(page, 'tap');
  });
});
