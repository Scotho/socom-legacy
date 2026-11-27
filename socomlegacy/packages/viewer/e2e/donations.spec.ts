import { expect, test, type Page } from '@playwright/test';

/** Product adaptation; synthetic public totals, no payment or provider request. */
/**
 * `shown`: central's show/hide flag (DATA_DIR/donations.show, the owner's word of 2026-11-18) on every reply; the cases
 * above the flag's own are the shown box's. A function is read at each request, so a case can flip it live.
 */
async function open(page: Page, raisedCents: number | null, shown: boolean | (() => boolean | undefined) = true) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' }).formatToParts(Date.now());
  const month = `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}`;
  await page.route('**/api/donations/progress', (route) => route.fulfill({
    status: raisedCents === null ? 503 : 200, contentType: 'application/json',
    body: JSON.stringify({ available: raisedCents !== null, goalCents: 12500, raisedCents: raisedCents ?? 0, currency: 'USD', month, timezone: 'America/Chicago', shown: typeof shown === 'function' ? shown() : shown }),
  }));
  await page.route('https://www.paypal.com/**', (route) => route.abort());
  await page.goto('/console?sample');
  if ((typeof shown === 'function' ? shown() : shown) === true) await expect(page.locator('#header [data-donate-open]')).toBeVisible();
}
test('desktop: header total, keyboard modal, focus trap and restoration', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await open(page, 5000);
  await expect(page.locator('#header [data-donation-total]')).toContainText('$50 of $125');
  await expect(page.locator('#header [data-donation-percent]')).toHaveText('40% reached');
  const donate = page.locator('[data-donate-open]'); await donate.focus(); await page.keyboard.press('Enter');
  const modal = page.getByRole('dialog', { name: 'Support server hosting' }); await expect(modal).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Close donation panel' })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(modal.getByRole('link', { name: /Continue to PayPal/ })).toBeFocused();
  await expect(modal.getByRole('link')).toHaveAttribute('href', 'https://www.paypal.com/donate/?hosted_button_id=CJ83NLJM7GPHW');
  await page.screenshot({ path: info.outputPath('donations-desktop.png') });
  await page.keyboard.press('Escape'); await expect(modal).toHaveCount(0); await expect(donate).toBeFocused();
});
test('phone: no horizontal overflow; over-goal total with bounded bar', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page, 15000);
  await expect(page.locator('#header [data-donation-percent]')).toHaveText('120% reached');
  await expect(page.locator('#header progress')).toHaveAttribute('value', '100');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('[data-donate-open]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: info.outputPath('donations-phone.png') });
  await page.getByRole('button', { name: 'Close donation panel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('unavailable: no invented zero or percent, checkout still reachable', async ({ page }) => {
  await open(page, null);
  await expect(page.locator('#header [data-donation-total]')).toContainText('Total unavailable');
  await expect(page.locator('#header [data-donation-percent]')).toBeEmpty();
  await expect(page.locator('#header progress')).toBeHidden();
  await page.locator('[data-donate-open]').click();
  await expect(page.getByRole('dialog')).toContainText('Choose your amount on PayPal');
});

/** The owner's show/hide flag: hidden until central says shown, hidden again live; the header's items never move for it. */
test('hidden by default (no flag from central): unseen and not clickable; a wide header keeps its place, a phone gives it no row', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  // The review F3: hidden after central's reply, not only by the markup's own hidden state before one.
  const answered = page.waitForResponse('**/api/donations/progress');
  await open(page, 5000, () => undefined);
  await answered;
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));   // its render after the reply
  const box = page.locator('#header [data-donations]');
  await expect(box).toBeHidden();
  await expect(box).toHaveAttribute('inert', '');
  expect(await box.evaluate((el) => el.getBoundingClientRect().width), 'a wide header: the hidden box keeps its place').toBeGreaterThan(0);
  await page.setViewportSize({ width: 412, height: 915 });
  expect(await box.evaluate((el) => el.getBoundingClientRect().height), 'a phone: the hidden box takes no row').toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('flipped live: shown, then hidden on the next reply (the dialog closed with it), without a reload', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  let shown = true;
  await open(page, 5000, () => shown);
  const box = page.locator('#header [data-donations]');
  const header = page.locator('#header');
  const before = await header.boundingBox();
  await expect(box).toBeVisible();
  await page.locator('[data-donate-open]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  shown = false;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));   // the module's own refresh on visibility
  await expect(box).toBeHidden();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await header.boundingBox(), 'the header did not move as the box hid').toEqual(before);
});
