import { expect, test } from '@playwright/test';
import { makeZip } from '../test/zipFixture';
import { TEST_ROOM_PAST_SHEET } from './urls';

/**
 * Test-room mods (`src/mods/panel.ts`, `TEST_ROOM_MODS_ADAPTATION`). A synthetic zip, no disc: the panel reports the
 * mod, an overridden read returns the mod's bytes only while mods are enabled, and this browser keeps the package.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const manifest = (id: string, name: string): string => JSON.stringify({
  format: 's2u-mod', formatVersion: 1, id, name, version: '0.1.0', author: 'Dustin',
  description: 'Synthetic test mod.', target: 'socom2-us-r0001',
  files: [{ path: 'NOTES/HELLO.TXT', file: 'HELLO.TXT' }],
});

const zip = (id: string, name: string, body: string): Buffer => Buffer.from(makeZip([
  { name: 'mod.json', data: manifest(id, name), method: 0 },
  { name: 'HELLO.TXT', data: body, method: 0 },
]));

test('the test room loads a synthetic mod and an overridden read returns its bytes', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });

  await page.goto(TEST_ROOM_PAST_SHEET);
  await page.locator('#mods').waitFor({ state: 'attached' });
  if (await page.locator('#panel').evaluate((el) => el.classList.contains('is-folded'))) await page.locator('#panel-toggle').click();
  await expect(page.locator('#mods')).toBeVisible();
  await page.locator('#mod-zip').setInputFiles({ name: 'hello.zip', mimeType: 'application/zip', buffer: zip('hello-notes', 'Hello notes', 'hello from the mod') });
  const row = page.locator('#mod-list li[data-mod-id="hello-notes"]');
  await expect(row).toContainText('loaded');
  await expect(row).toContainText('Hello notes');
  await expect(row).toContainText('NOTES/HELLO.TXT added');
  await expect(page.locator('#mod-read')).toHaveAttribute('data-from', 'none');
  await expect(page.locator('#mod-read')).toContainText('No active override.');
  await expect(page.locator('#mod-reload')).toContainText('Reload map to apply');

  await page.locator('#mods-enabled').check();
  await expect(page.locator('#mod-read')).toHaveAttribute('data-from', 'mod');
  await expect(page.locator('#mod-read')).toContainText('NOTES/HELLO.TXT');
  await expect(page.locator('#mod-read')).toContainText('hello from the mod');

  await page.locator('#mod-zip').setInputFiles({ name: 'other.zip', mimeType: 'application/zip', buffer: zip('other-notes', 'Other notes', 'from the other mod') });
  await expect(page.locator('#mod-conflicts')).toContainText('Conflict NOTES/HELLO.TXT: other-notes wins over hello-notes');
  await expect(page.locator('#mod-read')).toContainText('from the other mod');

  await page.locator('#mod-list li[data-mod-id="other-notes"] input[type="checkbox"]').uncheck();
  await expect(page.locator('#mod-list li[data-mod-id="other-notes"]')).toHaveAttribute('data-state', 'off');
  await expect(page.locator('#mod-read')).toHaveAttribute('data-from', 'mod');
  await expect(page.locator('#mod-read')).toContainText('hello from the mod');

  await page.locator('#mod-reload-map').click();
  await expect(page.locator('#mod-reload')).toBeHidden();

  await page.reload();
  await page.locator('#mods').waitFor({ state: 'attached' });
  if (await page.locator('#panel').evaluate((el) => el.classList.contains('is-folded'))) await page.locator('#panel-toggle').click();
  await expect(row).toContainText('loaded');
  await expect(page.locator('#mod-read')).toContainText('hello from the mod');
  await expect(page.locator('#mod-reload')).toBeHidden();

  await row.locator('button', { hasText: 'Remove' }).click();
  await expect(row).toHaveCount(0);
  await page.reload();
  await page.locator('#mods').waitFor({ state: 'attached' });
  await expect(page.locator('#mod-list li[data-mod-id="hello-notes"]')).toHaveCount(0);

  await page.locator('#mods-enabled').uncheck();
  await page.locator('#mod-zip').setInputFiles({ name: 'bad.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip') });
  await expect(page.locator('#mod-list li[data-state="invalid"]')).toContainText('invalid:');
  expect(problems).toEqual([]);
});
