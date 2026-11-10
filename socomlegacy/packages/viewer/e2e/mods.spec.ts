import { expect, test, type Page } from '@playwright/test';
import { makeZip } from '../test/zipFixture';
import { dropPack, modsMessage, modsRow, modsScreen, openMods, setPackOn } from './modsScreen';
import { TEST_ROOM_PAST_SHEET } from './urls';

/**
 * Mods (`src/mods/`, `TEST_ROOM_MODS_ADAPTATION`), since B206 ML-7 added, switched and removed in Home > Experiments >
 * Mods (`./modsScreen`) and applied by the test room at a map's load (its panel one line, `#mods-line`, and Reload map).
 * A synthetic zip, no disc: the screen lists the mod, the test room counts it on and answers an overridden read with the
 * mod's bytes only while it is on, the later of two mods wins a conflict, this browser keeps the package across a reload,
 * Remove forgets it, and a broken zip is refused in words. A browser adaptation: nothing of the game.
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

/** The test room's line and its override table's answer for the mod's path (the page's own module, as Vite serves it). */
async function testRoom(page: Page): Promise<{ line: string; read: string | null }> {
  await page.goto(TEST_ROOM_PAST_SHEET);
  const line = page.locator('#mods-line');
  await line.waitFor({ state: 'attached' });
  await expect(line).toContainText('Home > Experiments > Mods');
  const read = await page.evaluate(async (url) => {
    const m = await import(/* @vite-ignore */ url) as { modOverrideBytes(path: string): Uint8Array | null };
    const bytes = m.modOverrideBytes('NOTES/HELLO.TXT');
    return bytes ? new TextDecoder().decode(bytes) : null;
  }, '/src/mods/override.ts');
  return { line: (await line.textContent()) ?? '', read };
}

test('Home > Experiments > Mods keeps a synthetic mod; the test room applies it while it is on', async ({ page }) => {
  test.setTimeout(240_000);
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
  page.on('response', (r) => { if (r.status() === 404) problems.push(`404: ${r.url()}`); });

  await openMods(page);
  await expect(modsScreen(page)).toContainText('Nothing installed yet.');
  await dropPack(page, { name: 'hello.zip', buffer: zip('hello-notes', 'Hello notes', 'hello from the mod') });
  await expect(modsMessage(page)).toContainText('Hello notes added.');
  const hello = modsRow(page, 'mod:hello-notes');
  await expect(hello).toContainText('Hello notes');
  await expect(hello).toContainText('The test room');
  await expect(hello.locator('[role="switch"]')).toHaveAttribute('aria-checked', 'false');

  // Off: the test room counts none on and reads the disc's own path (no override).
  expect(await testRoom(page)).toEqual({ line: expect.stringContaining('Mods: 0 on'), read: null });

  // On: the test room counts it and an overridden read is the mod's bytes.
  await openMods(page);
  await setPackOn(page, 'mod:hello-notes', true);
  expect(await testRoom(page)).toEqual({ line: expect.stringContaining('Mods: 1 on'), read: 'hello from the mod' });

  // A second mod on the same path: the later wins the conflict.
  await openMods(page);
  await dropPack(page, { name: 'other.zip', buffer: zip('other-notes', 'Other notes', 'from the other mod') });
  await expect(modsRow(page, 'mod:other-notes')).toContainText('Other notes');
  await setPackOn(page, 'mod:other-notes', true);
  let room = await testRoom(page);
  expect(room.line).toContain('Mods: 2 on');
  expect(room.line).toContain('NOTES/HELLO.TXT, other-notes wins over hello-notes');
  expect(room.read).toBe('from the other mod');

  // The other one off: the first one's bytes again.
  await openMods(page);
  await setPackOn(page, 'mod:other-notes', false);
  room = await testRoom(page);
  expect(room.line).toContain('Mods: 1 on');
  expect(room.read).toBe('hello from the mod');

  // Kept across a reload of Home; Remove forgets it, and it stays forgotten after a reload.
  await openMods(page);
  await expect(hello.locator('[role="switch"]')).toHaveAttribute('aria-checked', 'true');
  // RB-5 (`../src/console/grammar.ts` `modsRemoveAsk`): Remove asks first, in the toast; the second press removes it.
  await hello.locator('button', { hasText: 'Remove' }).click();
  await expect(page.locator('#toast .cx-toast')).toHaveText('Remove Hello notes? Press Remove again to remove it.');
  await expect(hello).toHaveCount(1);
  await hello.locator('button', { hasText: 'Remove' }).click();
  await expect(modsMessage(page)).toContainText('Hello notes removed.');
  await expect(hello).toHaveCount(0);
  await openMods(page);
  await expect(hello).toHaveCount(0);
  await expect(modsRow(page, 'mod:other-notes')).toHaveCount(1);
  expect((await testRoom(page)).read).toBeNull();

  // A broken zip is refused in words, nothing kept.
  await openMods(page);
  await dropPack(page, { name: 'bad.zip', buffer: Buffer.from('not a zip') });
  await expect(modsMessage(page)).toHaveClass(/is-bad/);
  await expect(modsScreen(page).locator('.cx-mods__pack')).toHaveCount(1);
  expect(problems).toEqual([]);
});
