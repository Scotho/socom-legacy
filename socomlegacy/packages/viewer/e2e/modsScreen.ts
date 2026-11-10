import { expect, type Locator, type Page } from '@playwright/test';
import { focusItem, walkRailTo } from './launcherRail';

/**
 * B206 ML-9 (plan 2026-11-06-mods-loader, ML.R6; OT.R110): Home > Experiments > Mods as the specs drive it -- the
 * launcher's live page (`/`), the rail walked to Experiments, its Mods row opened, a pack handed to the screen's
 * file input (`../src/console/adapters/mods.ts` `MODS_FILE_INPUT_ID`, the drop zone's "choose a file"), its switch and
 * Remove pressed. Since ML-7 the test room's mods panel is one line (`#mods-line`) and Reload map: the packs are added,
 * switched and removed here. A browser adaptation: nothing of the game.
 */
export const MODS_FILE_INPUT = '#mods-file';

/** The MODS screen on the stage. */
export const modsScreen = (page: Page): Locator => page.locator('#stage [data-key="mods"]');

/** One installed pack's row by its registry id (`mod:<id>`, `hd:<packId>`, ...). */
export const modsRow = (page: Page, id: string): Locator => modsScreen(page).locator(`.cx-mods__pack[data-id="${id}"]`);

/** The screen's outcome or refusal line. */
export const modsMessage = (page: Page): Locator => modsScreen(page).locator('[data-key="mods-message"]');

const quieted = new WeakSet<Page>();
/**
 * Home polls the universe (`POST /texts/universe`, its Server status line); the run's dev server has no central, so
 * each poll is a 404 the specs' console checks would read. Answered here with no universe (`./consoleHomePlayers.spec.ts`
 * answers it the same way, with one).
 */
async function quietHome(page: Page): Promise<void> {
  if (quieted.has(page)) return;
  quieted.add(page);
  await page.route('**/texts/universe', async (route) => {
    if (route.request().method() !== 'POST') { await route.fallback(); return; }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ universes: [], news: [] }) });
  });
}

/** Opens the launcher at Home and walks Home > Experiments > Mods (L1 / R1, the D-pad, Cross). */
export async function openMods(page: Page, url = '/'): Promise<void> {
  await quietHome(page);
  await page.goto(url);
  await expect(page.locator('#stage .cx-cat.is-current')).toHaveCount(1, { timeout: 60_000 });
  await walkRailTo(page, 'Experiments');
  await focusItem(page, 'Mods');
  await page.keyboard.press('Enter');
  await expect(modsScreen(page)).toBeVisible();
  await expect(modsScreen(page).locator('h1.cx-title')).toHaveText('Mods');
  // The registry is read at the screen's first open: the list's "Reading..." line gives way to the list or its empty line.
  await expect(modsScreen(page)).not.toContainText('Reading what is installed');
}

/** Hands one pack to the drop zone's file input and waits for its outcome line. */
export async function dropPack(page: Page, file: { name: string; buffer: Buffer } | string): Promise<void> {
  const input = page.locator(MODS_FILE_INPUT);
  await input.waitFor({ state: 'attached' });
  if (typeof file === 'string') await input.setInputFiles(file);
  else await input.setInputFiles({ name: file.name, mimeType: 'application/zip', buffer: file.buffer });
}

/** A pack's switch (`role=switch`): pressed until it reads `on`. */
export async function setPackOn(page: Page, id: string, on: boolean): Promise<void> {
  const sw = modsRow(page, id).locator('[role="switch"]');
  if ((await sw.getAttribute('aria-checked')) !== String(on)) await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', String(on));
}
