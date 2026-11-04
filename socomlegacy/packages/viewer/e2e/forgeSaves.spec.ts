import { expect, test, type Page } from '@playwright/test';
import { recordOfLayout } from '../src/forge/record';
import { encodeShare } from '../src/forge/share';

/**
 * FORGE: named saves and a share link on a blank floor (a browser adaptation, no original). No disc: the palette is
 * empty, so the placed objects are spawn markers, which the floor can hold without an archive. A prop's geometry is
 * the disc's and is not what this run draws. `?floor` pins that blank floor when a disc is linked too.
 */

test.use({ viewport: { width: 1280, height: 720 } });

async function ready(page: Page): Promise<void> {
  await page.goto('/forge?floor');
  await expect(page.locator('.fx-status-msg')).toHaveText(/layout open/, { timeout: 60_000 });
  await expect(page.locator('.fx-loading')).toBeHidden();
  await expect(page.locator('.fx-top select.fx-select')).toHaveValue('blank');
}

/**
 * R3-B (FCW-07a part 2): a list as the page's saves store holds it now -- IndexedDB `s2u-forge`, one `{generation, text}`
 * record per list under `current` (`../src/forge/savesStore`); '' when never written. The page writes its autosave and
 * its named saves there, never to localStorage (whose lists move there once, at the first load).
 */
async function storedList(page: Page, name: 'saves' | 'autosave' | 'autosaveAside'): Promise<string> {
  return page.evaluate((list) => new Promise<string>((done) => {
    const req = indexedDB.open('s2u-forge');
    req.onerror = () => done('');
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(list)) { db.close(); done(''); return; }
      const get = db.transaction(list, 'readonly').objectStore(list).get('current');
      get.onsuccess = () => { db.close(); done((get.result as { text?: string } | undefined)?.text ?? ''); };
      get.onerror = () => { db.close(); done(''); };
    };
  }), name);
}

async function place(page: Page, team: 'A' | 'B', x: string, y: string, z: string, yaw: string): Promise<void> {
  // Under 1440px the toolbar hides the label, so the accessible name is the title.
  await page.getByRole('button', { name: new RegExp(`team ${team} spawn`) }).click();
  await page.locator('.fx-input').click();
  const fields = page.locator('.fx-fields input');
  const values = [x, y, z, yaw];
  for (let i = 0; i < values.length; i++) {
    await fields.nth(i).fill(values[i]!);
    await fields.nth(i).blur();
  }
  await expect(page.locator('.fx-outliner')).toContainText(`Spawn ${team}`);
}

async function marker(page: Page, label: string): Promise<string> {
  await page.locator('.fx-outliner li', { hasText: label }).click();
  const fields = page.locator('.fx-fields input');
  const parts: string[] = [];
  for (let i = 0; i < 4; i++) parts.push(await fields.nth(i).inputValue());
  return parts.join(',');
}

test('a named save survives a reload, and a share link opens the same markers', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page);
  await place(page, 'A', '100', '0', '200', '0');
  await place(page, 'B', '-50', '0', '80', '90');
  expect(await marker(page, 'Spawn A')).toBe('100,0,200,0');
  expect(await marker(page, 'Spawn B')).toBe('-50,0,80,90');

  await page.locator('[data-forge="saves"]').click();
  await page.locator('.fx-modal').getByRole('button', { name: 'Save as' }).click();
  await page.locator('.fx-modal input').fill('Yard');
  await page.locator('.fx-modal').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.fx-saves-list')).toContainText('Yard');
  await page.locator('.fx-modal').getByRole('button', { name: 'Close' }).click();

  // The autosave is a different slot: move a marker, reload, then open the named save.
  await marker(page, 'Spawn A');
  await page.locator('.fx-fields input').nth(0).fill('1');
  await page.locator('.fx-fields input').nth(0).blur();
  await expect.poll(() => storedList(page, 'autosave')).toContain('["A",1,');
  await page.reload();
  await expect(page.locator('.fx-status-msg')).toHaveText(/layout open/, { timeout: 60_000 });
  await expect(page.locator('.fx-loading')).toBeHidden();
  expect(await marker(page, 'Spawn A')).toBe('1,0,200,0');

  await page.locator('[data-forge="saves"]').click();
  await page.locator('.fx-saves-list li', { hasText: 'Yard' }).getByRole('button', { name: 'Open' }).click();
  await expect(page.locator('.fx-toast')).toHaveText('Opened Yard');
  expect(await marker(page, 'Spawn A')).toBe('100,0,200,0');
  expect(await marker(page, 'Spawn B')).toBe('-50,0,80,90');

  await page.locator('[data-forge="saves"]').click();
  await page.locator('.fx-modal').getByRole('button', { name: 'Share link' }).click();
  const link = page.locator('[data-share-link]');
  await expect(link).not.toHaveValue('', { timeout: 15_000 });
  const url = await link.inputValue();
  expect(url).toContain('#forge=');
  await page.locator('.fx-modal').getByRole('button', { name: 'Close' }).click();

  await marker(page, 'Spawn A');
  await page.locator('.fx-fields input').nth(0).fill('7');
  await page.locator('.fx-fields input').nth(0).blur();

  const shared = await page.context().newPage();
  const sharedErrors: string[] = [];
  shared.on('pageerror', (e) => sharedErrors.push(e.message));
  await shared.goto(url);
  await shared.locator('.fx-modal').getByRole('button', { name: 'Open the link' }).click();
  await expect(shared).not.toHaveURL(/#forge=/);
  await expect(shared.locator('.fx-status-msg')).toHaveText(/layout open/, { timeout: 60_000 });
  await expect(shared.locator('.fx-loading')).toBeHidden();
  expect(await marker(shared, 'Spawn A')).toBe('100,0,200,0');
  expect(await marker(shared, 'Spawn B')).toBe('-50,0,80,90');
  await shared.screenshot({ path: test.info().outputPath('forge-share-open.png') });
  await page.screenshot({ path: test.info().outputPath('forge-named-save.png') });
  expect(errors).toEqual([]);
  expect(sharedErrors).toEqual([]);
});

// R3-B (FCW-07a part 2): the lists this browser kept in localStorage move into the saves store at the first load -- a
// rename: the store holds them, the old keys are cleared, each kept once under its recovery key.
test('the lists kept in localStorage move into the saves store once, at the first load', async ({ page }) => {
  const kept = recordOfLayout({
    forge: 1,
    base: { kind: 'blank', library: 'floor' },
    pieces: [],
    spawns: [{ team: 'B', p: [40, 0, 60], yaw: 0 }],
  }, 'Moved');
  const list = JSON.stringify({ v: 1, saves: [{ id: 'moved-id', name: 'Moved', savedAt: 1, record: kept }] });
  await page.addInitScript(([layout, saves]) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('s2u-forge-layout', layout!); localStorage.setItem('s2u-forge-saves', saves!); sessionStorage.setItem('seeded', '1');
    }
  }, [JSON.stringify(kept), list]);
  await ready(page);
  expect(await marker(page, 'Spawn B')).toBe('40,0,60,0');
  await page.locator('[data-forge="saves"]').click();
  await expect(page.locator('.fx-saves-list')).toContainText('Moved');
  expect(await storedList(page, 'saves')).toBe(list);
  expect(await page.evaluate(() => [localStorage.getItem('s2u-forge-saves'), localStorage.getItem('s2u-forge-layout')])).toEqual([null, null]);
  expect(await page.evaluate(() => localStorage.getItem('s2u-forge-saves-recovered-v3'))).toBe(list);
  await page.locator('.fx-modal').getByRole('button', { name: 'Close' }).click();
  await page.reload();                                                // moved once: the store is read, nothing moves again
  await expect(page.locator('.fx-status-msg')).toHaveText(/layout open/, { timeout: 60_000 });
  expect(await marker(page, 'Spawn B')).toBe('40,0,60,0');
});

test('a share link asks before it replaces a layout, and leaves the autosave when cancelled', async ({ page }) => {
  const kept = recordOfLayout({
    forge: 1,
    base: { kind: 'blank', library: 'floor' },
    pieces: [],
    spawns: [{ team: 'A', p: [100, 0, 200], yaw: 0 }],
  }, 'Kept');
  const shared = recordOfLayout({
    forge: 1,
    base: { kind: 'blank', library: 'floor' },
    pieces: [],
    spawns: [{ team: 'A', p: [1, 0, 1], yaw: 0 }],
  }, 'Shared');
  await page.addInitScript((layout) => { localStorage.setItem('s2u-forge-layout', layout); }, JSON.stringify(kept));
  const code = await encodeShare(shared);
  await page.goto(`/forge?floor#forge=${code}`);
  await page.locator('.fx-modal').getByRole('button', { name: 'Cancel' }).click();
  await expect(page).not.toHaveURL(/#forge=/);
  await expect(page.locator('.fx-status-msg')).toHaveText(/layout open/, { timeout: 60_000 });
  await page.locator('.fx-outliner li', { hasText: 'Spawn A' }).click();
  await expect(page.locator('.fx-fields input').nth(0)).toHaveValue('100');
});

// LATER 193: an autosave this build cannot read is set aside, not replaced; the share link opens with no question.
test('a share link over an autosave this build cannot read sets it aside and opens the link', async ({ page }) => {
  const unreadable = JSON.stringify({ v: 99, rows: [[1, 2, 3]] });
  const shared = recordOfLayout({
    forge: 1,
    base: { kind: 'blank', library: 'floor' },
    pieces: [],
    spawns: [{ team: 'A', p: [7, 0, 9], yaw: 0 }],
  }, 'Shared');
  await page.addInitScript((layout) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('s2u-forge-layout', layout); sessionStorage.setItem('seeded', '1'); } }, unreadable);
  const code = await encodeShare(shared);
  await page.goto(`/forge?floor#forge=${code}`);
  await expect(page.locator('.fx-status-msg')).toHaveText(/kept aside/, { timeout: 60_000 });
  await expect(page.locator('.fx-modal').filter({ hasText: 'Open this shared layout?' })).toBeHidden();   // no question asked
  expect(JSON.parse((await storedList(page, 'autosaveAside')) || '[]')).toEqual([unreadable]);
  await page.locator('.fx-outliner li', { hasText: 'Spawn A' }).click();
  await expect(page.locator('.fx-fields input').nth(0)).toHaveValue('7');
});

test('a locked spawn survives a reload and a share link', async ({ page }) => {
  await ready(page);
  await place(page, 'A', '100', '0', '200', '0');
  const row = page.locator('.fx-outliner li', { hasText: 'Spawn A' });
  await row.getByRole('button', { name: 'Lock' }).click();
  await expect(row).toContainText('locked');
  await expect(row.getByRole('button', { name: 'Unlock' })).toBeVisible();
  await expect.poll(() => storedList(page, 'autosave')).toContain(',true]');

  await page.reload();
  await expect(page.locator('.fx-status-msg')).toHaveText(/layout open/, { timeout: 60_000 });
  await expect(page.locator('.fx-loading')).toBeHidden();
  const kept = page.locator('.fx-outliner li', { hasText: 'Spawn A' });
  await expect(kept).toContainText('locked');
  await expect(kept.getByRole('button', { name: 'Unlock' })).toBeVisible();

  await page.locator('[data-forge="saves"]').click();
  await page.locator('.fx-modal').getByRole('button', { name: 'Share link' }).click();
  const link = page.locator('[data-share-link]');
  await expect(link).not.toHaveValue('', { timeout: 15_000 });
  const url = await link.inputValue();
  await page.locator('.fx-modal').getByRole('button', { name: 'Close' }).click();

  const shared = await page.context().newPage();
  await shared.goto(url);
  await shared.locator('.fx-modal').getByRole('button', { name: 'Open the link' }).click();
  await expect(shared).not.toHaveURL(/#forge=/);
  await expect(shared.locator('.fx-status-msg')).toHaveText(/layout open/, { timeout: 60_000 });
  const opened = shared.locator('.fx-outliner li', { hasText: 'Spawn A' });
  await expect(opened).toContainText('locked');
  await expect(opened.getByRole('button', { name: 'Unlock' })).toBeVisible();
});

test('a share link says how many pieces this disc does not have', async ({ page }) => {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const record = recordOfLayout({
    forge: 1,
    base: { kind: 'blank', library: 'floor' },
    pieces: [
      { asset: 'MP2:no_such_prop', m: identity },
      { asset: 'MP2:also_missing', m: identity },
    ],
    spawns: [],
  }, 'Shared');
  const code = await encodeShare(record);
  await page.goto(`/forge?floor#forge=${code}`);
  await expect(page.locator('.fx-status-msg')).toHaveText('2 pieces not found on this disc', { timeout: 60_000 });
  await expect(page.locator('.fx-outliner li.fx-missing')).toHaveCount(2);
});

// #348's re-review: only a spawn's lock was taken through a reload; a piece's and an NPC's go through the page's own write.
test("a locked piece and a locked NPC survive a reload through the page's own autosave", async ({ page }) => {
  test.setTimeout(240_000);                                         // MP2 opens twice, as the map-based forge specs allow
  const seeded = recordOfLayout({
    forge: 1,
    base: { kind: 'map', archive: 'MP2' },
    pieces: [{ asset: 'MP2:does_not_exist', m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 20, 1], locked: true }],
    spawns: [],
    npcs: [{ side: 'seal', type: 0, p: [30, 0, 40], yaw: 0, locked: true }],
  }, 'Locks');
  // Seeded once: a reload must read what the page itself wrote.
  await page.addInitScript((layout) => {
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem('s2u-forge-layout', layout); sessionStorage.setItem('seeded', '1'); }
  }, JSON.stringify(seeded));
  await page.goto('/forge');
  await expect(page.locator('.fx-status-msg')).toHaveText(/layout open|not found on this disc/, { timeout: 60_000 });
  await expect(page.locator('.fx-loading')).toBeHidden();
  const piece = (): ReturnType<Page['locator']> => page.locator('.fx-outliner li', { hasText: 'does_not_exist' });
  const npc = (): ReturnType<Page['locator']> => page.locator('.fx-outliner li', { hasText: 'NPC ·' });
  await expect(piece()).toContainText('locked');
  await expect(npc()).toContainText('locked');
  await place(page, 'A', '100', '0', '200', '0');                    // an edit: the page writes the autosave itself
  // R7-A (the Forge batch's first rendered pass, case 10): "changed" can be met by a write before the spawn's (the reload
  // then read a layout without it). Polled until the stored record holds the team-A spawn (its `SpawnRow`,
  // `["A", x, y, z, yaw]`, `@s2u/creator-contracts` layout.ts, as the named-save case's own poll reads it).
  await expect.poll(() => storedList(page, 'autosave'), { timeout: 10_000 }).toContain('["A",');

  await page.reload();
  await expect(page.locator('.fx-status-msg')).toHaveText(/layout open|not found on this disc/, { timeout: 60_000 });
  await expect(page.locator('.fx-loading')).toBeHidden();
  await expect(page.locator('.fx-outliner')).toContainText('Spawn A');
  await expect(piece()).toContainText('locked');
  await expect(npc()).toContainText('locked');
  await expect(npc().getByRole('button', { name: 'Unlock' })).toBeVisible();
});

// #348's re-review: a share link naming a map this disc lacks used to open a fallback whose autosave replaced the earlier work.
test('a share link to a map this disc lacks opens the earlier layout and keeps it', async ({ page }) => {
  const kept = recordOfLayout({
    forge: 1,
    base: { kind: 'blank', library: 'floor' },
    pieces: [],
    spawns: [{ team: 'A', p: [100, 0, 200], yaw: 0 }],
  }, 'Kept');
  const shared = recordOfLayout({
    forge: 1,
    base: { kind: 'map', archive: 'ZZ9' },
    pieces: [],
    spawns: [{ team: 'A', p: [1, 0, 1], yaw: 0 }],
  }, 'Elsewhere');
  await page.addInitScript((layout) => {
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem('s2u-forge-layout', layout); sessionStorage.setItem('seeded', '1'); }
  }, JSON.stringify(kept));
  const code = await encodeShare(shared);
  await page.goto(`/forge#forge=${code}`);
  await page.locator('.fx-modal').getByRole('button', { name: 'Open the link' }).click();
  await expect(page).not.toHaveURL(/#forge=/);
  await expect(page.locator('.fx-status-msg')).toContainText('earlier layout', { timeout: 60_000 });
  await expect(page.locator('.fx-loading')).toBeHidden();
  expect(await marker(page, 'Spawn A')).toBe('100,0,200,0');
  await page.waitForTimeout(800);                                    // past the autosave's 300 ms
  await page.reload();
  await expect(page.locator('.fx-status-msg')).toHaveText(/layout open/, { timeout: 60_000 });
  expect(await marker(page, 'Spawn A')).toBe('100,0,200,0');
});


/**
 * PAD-1 (FUI.R2; the review's IA-2; a browser adaptation, FG.R2): the Saves card is no pad dead end. A standard-mapping
 * pad stub (as forgeMenuPointer.spec.ts stubs one), its buttons pressed for real animation frames: START > Saves opens
 * the card, Cross on it changes nothing, Circle closes it, START closes it, Esc closes it.
 */
test.describe('the Saves card on a pad', () => {
  const padStub = (page: Page) => page.addInitScript(() => {
    const pad = { id: 'Test pad', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    (globalThis as unknown as { __forgePad: typeof pad }).__forgePad = pad;
  });
  /** A press held for a few frames, then let go for a few (Circle's tap is read at its release). */
  const press = (page: Page, button: number) => page.evaluate(async (b) => {
    const frames = (n: number) => new Promise<void>((done) => { const step = (k: number): void => { if (k <= 0) done(); else requestAnimationFrame(() => step(k - 1)); }; step(n); });
    const pad = (globalThis as unknown as { __forgePad: { buttons: { pressed: boolean; value: number }[] } }).__forgePad;
    pad.buttons[b]!.pressed = true; pad.buttons[b]!.value = 1;
    await frames(3);
    pad.buttons[b]!.pressed = false; pad.buttons[b]!.value = 0;
    await frames(3);
  }, button);
  const CROSS = 0, CIRCLE = 1, START = 9, UP = 12;
  const saves = (page: Page) => page.locator('.fx-modal .fx-saves');
  const menuRow = (page: Page) => page.locator('.fx-menu li.is-on .fx-menu-label');
  async function openByPad(page: Page): Promise<void> {
    await press(page, START);
    await expect(page.locator('.fx-menu')).toBeVisible();
    for (let n = 0; n < 60 && (await menuRow(page).innerText()) !== 'Saves'; n++) await press(page, UP);
    await expect(menuRow(page)).toHaveText('Saves');
    await press(page, CROSS);
    await expect(saves(page)).toBeVisible();
  }

  test('START > Saves opens it; Cross keeps it; Circle, START and Esc close it', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await padStub(page);
    await ready(page);
    await page.locator('[data-forge="saves"]').click();             // one named save, so Cross has something to spare
    await page.locator('.fx-modal').getByRole('button', { name: 'Save as' }).click();
    await page.locator('.fx-modal input').fill('Yard');
    await page.locator('.fx-modal').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.fx-saves-list')).toContainText('Yard');
    await page.locator('.fx-modal').getByRole('button', { name: 'Close' }).click();
    await expect(saves(page)).toBeHidden();

    await openByPad(page);
    await press(page, CROSS);
    await expect(saves(page)).toBeVisible();
    await expect(page.locator('.fx-saves-list')).toContainText('Yard');
    await press(page, CIRCLE);
    await expect(saves(page)).toBeHidden();
    await expect(page.locator('.fx-menu')).toBeHidden();

    await openByPad(page);
    await press(page, START);
    await expect(saves(page)).toBeHidden();
    await expect(page.locator('.fx-menu')).toBeHidden();

    await page.locator('[data-forge="saves"]').click();
    await expect(saves(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(saves(page)).toBeHidden();
    expect(errors).toEqual([]);
  });

  // FUI-2 (the review's IA-2, IA-13, PAD-2, PAD-4; a browser adaptation, FG.R2): the card stack and the pad's walker.
  const SQUARE = 2, TRIANGLE = 3, DOWN = 13;
  test('FUI-2: the d-pad walks the rows; Square renames over it and Circle comes back; Triangle asks, Cancel first, Cross keeps it', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await padStub(page);
    await ready(page);
    await page.locator('[data-forge="saves"]').click();
    await page.locator('.fx-modal').getByRole('button', { name: 'Save as' }).click();
    await page.locator('.fx-modal input').fill('Yard');
    await page.locator('.fx-modal').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.fx-saves-list')).toContainText('Yard');
    await page.locator('.fx-modal').getByRole('button', { name: 'Close' }).click();

    await openByPad(page);
    await expect(saves(page)).toHaveAttribute('role', 'dialog');
    await expect(saves(page)).toHaveAttribute('aria-modal', 'true');
    await press(page, DOWN);
    const row = page.locator('.fx-saves-list li.is-pad-focused');
    await expect(row).toContainText('Yard');
    await press(page, SQUARE);
    await expect(page.getByRole('dialog', { name: 'Rename this save' })).toBeVisible();
    await expect(saves(page)).toHaveCount(0);                          // covered: out of the host, one card in it
    await press(page, CIRCLE);
    await expect(saves(page)).toBeVisible();
    await expect(row).toContainText('Yard');
    await press(page, TRIANGLE);
    await expect(page.getByRole('dialog', { name: 'Delete this save?' })).toBeVisible();
    await expect(page.locator(':focus')).toHaveText('Cancel');
    await press(page, CROSS);
    await expect(saves(page)).toBeVisible();
    await expect(page.locator('.fx-saves-list')).toContainText('Yard');
    await press(page, CIRCLE);
    await expect(saves(page)).toBeHidden();
    await page.screenshot({ path: test.info().outputPath('forge-saves-pad-walk.png') });
    expect(errors).toEqual([]);
  });

  test('FUI-2 (PAD-2): START > Base, Cross, Cross keeps the layout -- the question starts on Cancel', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await padStub(page);
    await ready(page);
    await place(page, 'A', '100', '0', '200', '0');
    await press(page, START);
    await expect(page.locator('.fx-menu')).toBeVisible();
    for (let n = 0; n < 60 && (await menuRow(page).innerText()) !== 'Base'; n++) await press(page, UP);
    await expect(menuRow(page)).toHaveText('Base');
    await press(page, CROSS);
    const ask = page.getByRole('dialog', { name: 'Start a new layout?' });
    await expect(ask).toBeVisible();
    await expect(page.locator(':focus')).toHaveText('Cancel');
    await press(page, CROSS);
    await expect(ask).toBeHidden();
    await expect(page.locator('.fx-outliner')).toContainText('Spawn A');
    expect(errors).toEqual([]);
  });
});
