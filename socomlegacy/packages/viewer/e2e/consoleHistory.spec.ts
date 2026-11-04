import { expect, test, type Page } from '@playwright/test';

/**
 * CX-38 (CX.R16): the launcher's own history. A category switch replaces one entry; Audio and Browse rooms still
 * push, and Back returns to the category. Forward re-opens the nested page. A refresh of `/settings/audio` opens
 * that page. The header Back acts as Circle. `page.goBack` is the mouse back button's history action. A browser
 * adaptation (OT.R28). The sample page is `/console?sample` (quiet until a page is pushed or a category is chosen).
 */
const SAMPLE = '/console?sample';
/** A category by its label, not its place on the rail (LR.R2 reordered it, 2026-10-26). */
const cat = (page: Page, label: string) => page.locator(`#stage .cx-cat[aria-label="${label}"]`);

async function open(page: Page): Promise<void> {
  await page.goto(SAMPLE);
  await expect(page.locator('#stage .cx-cat.is-current')).toContainText('Home');
}

test.describe('launcher Back and Forward (sample adapters)', () => {
  test('a category switch replaces; Audio and Browse rooms still push, and Back returns to the category', async ({ page }) => {
    await open(page);
    const len = (): Promise<number> => page.evaluate(() => history.length);
    const home = await len();
    await cat(page, 'Settings').click();
    await expect(page.locator('#stage .cx-cat.is-current')).toHaveText(/Settings/);
    await expect(page).toHaveURL(/\/settings\?sample$/);
    expect(await len()).toBe(home);

    await page.locator('#stage .cx-item__title', { hasText: 'Game' }).click();
    await page.locator('#stage .cx-tab', { hasText: 'Audio' }).click();
    await expect(page.locator('#stage h1.cx-title')).toHaveText('Audio');
    await expect(page).toHaveURL(/\/settings\/audio\?sample$/);
    expect(await len()).toBe(home + 1);

    await page.goBack();
    await expect(page.locator('#stage .cx-cat.is-current')).toHaveText(/Settings/);
    await expect(page).toHaveURL(/\/settings\?sample$/);
    await page.goForward();
    await expect(page.locator('#stage h1.cx-title')).toHaveText('Audio');
    await page.goBack();
    await page.goBack();
    await expect(page).not.toHaveURL(/sample/);

    await open(page);
    const again = await len();
    await cat(page, 'Online').click();
    await expect(page.locator('#stage .cx-cat.is-current')).toHaveText(/Online/);
    await expect(page).toHaveURL(/\/online\?sample$/);
    expect(await len()).toBe(again);
    await page.locator('#stage .cx-item__title', { hasText: 'Browse rooms' }).click();
    await expect(page.locator('#stage h1.cx-title')).toHaveText('Browse rooms');
    await expect(page).toHaveURL(/\/online\/rooms\?sample$/);
    expect(await len()).toBe(again + 1);
    await page.goBack();
    await expect(page.locator('#stage .cx-cat.is-current')).toHaveText(/Online/);
    await expect(page).toHaveURL(/\/online\?sample$/);
  });

  test('a refresh of /settings/audio opens Audio, and the header Back returns to Settings', async ({ page }) => {
    await page.goto('/settings/audio?sample');
    await expect(page.locator('#stage h1.cx-title')).toHaveText('Audio');
    await expect(page.locator('#stage .cx-back')).toHaveAttribute('aria-label', 'Back to Settings');
    await page.locator('#stage .cx-back').click();
    await expect(page.locator('#stage .cx-cat.is-current')).toContainText('Settings');
    await expect(page).toHaveURL(/\/settings\?sample$/);
  });

  test('Browse rooms header Back returns to Online in one press', async ({ page }) => {
    await open(page);
    await cat(page, 'Online').click();
    await page.locator('#stage .cx-item__title', { hasText: 'Browse rooms' }).click();
    await expect(page.locator('#stage h1.cx-title')).toHaveText('Browse rooms');
    await expect(page.locator('#stage .cx-back')).toHaveAttribute('aria-label', 'Back to Play online');
    await page.locator('#stage .cx-back').click();
    await expect(page.locator('#stage .cx-cat.is-current')).toHaveText(/Online/);
  });
});
