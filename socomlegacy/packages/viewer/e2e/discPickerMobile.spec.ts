import { devices, expect, test } from '@playwright/test';

// Android Chrome emulation tests the page's picker request and file delivery, not Android's native Files UI.
test.use({ ...devices['Pixel 7'] });

test('Android: touch opens the ISO picker and selected files reach disc validation', async ({ page }) => {
  await page.goto('/');
  const input = page.locator('#disc-page-file');
  await expect(input).toHaveAttribute('type', 'file');
  expect(await input.getAttribute('accept')).toBeNull();
  const [picker] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('#legend .cx-mark[data-mark="disc"]').tap().then(() => page.locator('#legend .cx-srcopt[data-i="0"]').tap()),   // LR-24: the disc mark, then its menu's DISC ISO opens the chooser (was: the chip's tap)
  ]);
  expect(picker.isMultiple()).toBe(false);
  await picker.setFiles({ name: 'invalid-disc.iso', mimeType: 'application/octet-stream', buffer: Buffer.alloc(40 * 2048) });
  // LR-23 (LR.R22): the Disc step is the legend's status chip: CHECK DISC is its word, the reader's words its line (was
  // LR-13's disc check of Play's panel, "Disc needed" and its hint).
  const disc = page.locator('#legend .cx-mark[data-mark="disc"]');   // LR-24: the disc mark (was: the chip)
  await expect(disc.locator('.cx-mark__word')).toHaveText('Check disc');   // LR-24: the disc mark (was: the chip)
  await expect(disc.locator('.cx-mark__line')).toContainText('not an ISO9660 image');   // LR-24: the disc mark (was: the chip)
  // Selection can be retried through the same visible control after the reader's refusal.
  const [again] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#legend .cx-mark[data-mark="disc"]').tap().then(() => page.locator('#legend .cx-srcopt[data-i="0"]').tap())]);   // LR-24: the disc mark, then its menu's DISC ISO opens the chooser (was: the chip's tap)
  expect(again.isMultiple()).toBe(false);
});
