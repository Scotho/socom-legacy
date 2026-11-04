import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { emptyLayout } from '../src/forge/layout';
import { forgeStoredList } from './forgeStore';

/**
 * LATER 215 (the merge controller's pairing with 213, 2026-10-21): a lobby joiner's return to its own layout. The join
 * opens the host's layout with the autosave off; back from the lobby the autosave came on again, and an own autosave
 * this build cannot read was not opened, so the host's layout stayed open and its next write replaced it -- the
 * player's text gone. Now it is set aside first, as it was (LATER 193's rule, `../src/forge/boot.ts`
 * `ownLayoutOnReturn`). A browser adaptation (OT.R28).
 *
 * The page is real -- its join, its lobby window, LEAVE, the edit and its autosave in this browser's own storage -- and
 * the lobby's server is not: its two requests (`GET /lobby/forge/lobby/<id>`, the guest pass) are answered here, and
 * its socket (`/ws`) is held open saying nothing, which the join needs no more than (the window mounts at the join).
 * The join reads the served maps (`socomlegacy/public/maps`, not committed); without them it is skipped, not passed.
 */
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 720 } });

const MAPS = fileURLToPath(new URL('../../../public/maps', import.meta.url));
const HAVE_MAPS = existsSync(join(MAPS, 'index.json')) && existsSync(join(MAPS, 'RUN', 'MP2.ZDB'));

const ID = 'later215';
const UNREADABLE = 'a hand edit {';                                   // not JSON: no build reads it (`autosaveUnreadable`)

async function lobbyServer(page: Page): Promise<void> {
  const lobby = {
    id: ID, name: 'Yard', base: 'MP2', players: 1, max: 16, settings: {}, created: 0, listed: false, inMatch: false,
    layout: emptyLayout({ kind: 'map', archive: 'MP2' }), missing: 0,
    state: { seats: [{ id: 1, name: 'Host', team: null, ready: false, host: true }], countdown: null, launched: false },
  };
  await page.route(`**/lobby/forge/lobby/${ID}`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(lobby) }));
  await page.route(`**/lobby/forge/lobby/${ID}/guest`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ guest: null }) }));
  await page.routeWebSocket((url) => url.pathname === '/ws', () => { /* held open, silent: the lobby's room is not this spec's */ });
}

test('LATER 215: a joiner back from the lobby keeps an unreadable autosave aside before the next write replaces it', async ({ page }) => {
  test.skip(!HAVE_MAPS, 'needs socomlegacy/public/maps/index.json and RUN/MP2.ZDB, the served maps as bases (not committed)');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((text) => {
    if (sessionStorage.getItem('later215-seeded')) return;
    sessionStorage.setItem('later215-seeded', '1');
    localStorage.setItem('s2u-forge-layout', text);
  }, UNREADABLE);
  await lobbyServer(page);
  await page.goto(`/forge?devmode&lobby=${ID}`);
  await expect(page.locator('.fx-status-msg')).toHaveText(/in the lobby Yard/, { timeout: 90_000 });
  // R3-B: the page's saves store (`./forgeStore`); '' for a list never written.
  const stored = async (): Promise<{ layout: string; aside: string }> =>
    ({ layout: await forgeStoredList(page, 'autosave'), aside: await forgeStoredList(page, 'autosaveAside') });
  // R7-A (the Forge batch's first rendered pass, case 5): a join opens no saves store -- the localStorage lists move into
  // it at the return (`../src/forge/page.ts` `ownLayoutBack`, after LEAVE), not at a joiner's load. So at the join the
  // seeded text is still where it was seeded, and the store's autosave was never written: nothing over it.
  expect(await page.evaluate(() => localStorage.getItem('s2u-forge-layout')), 'the join writes nothing over it').toBe(UNREADABLE);
  expect((await stored()).layout, 'the join writes no autosave of the host\'s layout').toBe('');

  await page.locator('.fx-lobby-btn', { hasText: /^LEAVE$/ }).click();
  await expect(page.locator('.fx-lobby-btn', { hasText: /^LEAVE$/ })).toHaveCount(0);

  // The next write: an edit of the layout left open (the host's), autosaved after its 300 ms.
  await page.getByRole('button', { name: /team A spawn/ }).click();
  await page.locator('.fx-input').click();
  await expect(page.locator('.fx-outliner')).toContainText('Spawn A');
  // The edit itself, not merely "readable": the store held '' at the join, so a poll for "not UNREADABLE" would pass at once.
  await expect.poll(async () => (await stored()).layout, { timeout: 10_000, message: 'the edit was autosaved (the write this spec is about)' }).toContain('["A",');

  const after = await stored();
  expect(JSON.parse(after.aside || '[]'), 'the unreadable autosave kept aside, as it was').toEqual([UNREADABLE]);
  expect(errors).toEqual([]);
});
