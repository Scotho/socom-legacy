import { expect, test, type Page } from '@playwright/test';
import {
  OUTLINER_USER_ROW, openOutlinerFilter, openSaves, outlinerFilter, outlinerFilterKind, outlinerSearch, placingTool, pressDelete, pressDuplicate,
} from './forgeBase';
import { forgeStoredList } from './forgeStore';

/**
 * FORGE quick fixes, without a disc (a browser adaptation). The served tree is an empty index, so the editor opens on
 * its own blank floor. A rendered browser run: place, multi-select, undo and redo keeping the selection, duplicate and
 * multi-delete restoring the selection by identity, a missing piece saved and reopened, and Play entered and left by
 * P and by the button, and a camera move kept when the page reloads before the save's debounce.
 */
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const LAYOUT = JSON.stringify({
  forge: 1,
  name: 'Night op',
  base: { kind: 'blank', library: 'floor' },
  pieces: [{ asset: 'MP2:does_not_exist', m: IDENTITY }],
  spawns: [],
  camera: { x: 10, y: 80, z: 40, yaw: 15, pitch: -20 },
});

/**
 * OT.R112 (the owner, 2026-11-07: the Forge's keys are its contributor's): the editor's camera flies on W only while
 * the right mouse button is held over the viewport (`../src/camera.ts` `update`: `keyboardMove = !this.forgeKbm ||
 * (perspective && this.rightMouseHeld)`; `onPointerDown` sets `rightMouseHeld` on button 2); a bare W is the gizmo's
 * translate. So the fly is W with the right button held over `.fx-input`, `during` read while both are down. Letting
 * the right button go stops the fly (`onPointerUp` clears the fly keys and the velocity).
 */
async function flyForward(page: Page, during: () => Promise<void>): Promise<void> {
  const box = await page.locator('.fx-input').boundingBox();
  if (!box) throw new Error('the forge viewport is not up');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: 'right' });
  await page.keyboard.down('w');
  try {
    await during();
  } finally {
    await page.keyboard.up('w');
    await page.mouse.up({ button: 'right' });
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((layout) => {
    const flag = 's2u-forge-e2e-seeded';
    if (!sessionStorage.getItem(flag)) {
      localStorage.setItem('s2u-forge-layout', layout);
      sessionStorage.setItem(flag, '1');
    }
  }, LAYOUT);
});

test('keeps an unknown piece through save and reopen, and names the file', async ({ page }) => {
  await page.goto('/forge');
  await expect(page.locator('.fx-status-msg')).toHaveText('1 piece not found on this disc', { timeout: 30_000 });
  const missing = page.locator('.fx-outliner li.fx-missing');
  await expect(missing).toHaveCount(1, { timeout: 30_000 });
  await expect(missing).toContainText('does_not_exist');
  await expect(missing).toContainText('missing');
  // FC2-4 (EDITOR-MAP O6): his Outliner has no type select; its Filter dropdown has a switch and a Solo per kind
  // (`../src/forge/panels/outlinerPanel.ts` `OUTLINER_KINDS`). The old select's Missing is Missing pieces' Solo, Spawns
  // the Spawns kind's Solo, and All that Solo pressed again ("press again to list every kind", `page.ts`).
  await openOutlinerFilter(page);
  await outlinerFilterKind(page, 'Missing pieces').getByRole('button', { name: 'Solo' }).click();
  await expect(missing).toHaveCount(1);
  await outlinerFilterKind(page, 'Spawns').getByRole('button', { name: 'Solo' }).click();
  // OT.R112 / FC2-4 (EDITOR-MAP O2): the tree's sections are two rows, User Objects and Map Objects, the rows one level
  // under each; with nothing the Filter shows, User Objects' one row is the page's own empty line (`page.ts`
  // `drawOutliner`: "Nothing the Filter shows" while something is placed) -- the old Spawns branch's own words are gone.
  await expect(missing).toHaveCount(0);
  await expect(page.locator('.fx-outliner > li.fx-outliner-section[data-outliner-section="user"] + li.fx-empty'))
    .toHaveText('Nothing the Filter shows');
  await outlinerFilterKind(page, 'Spawns').getByRole('button', { name: 'Solo' }).click();
  await expect(missing).toHaveCount(1);
  await outlinerFilter(page).locator(':scope > summary').click();     // the dropdown shut again
  await outlinerSearch(page).fill('does_not');
  await expect(missing).toHaveCount(1);
  await openSaves(page);                                                // FC2-4 (EDITOR-MAP T4): File > Saves...
  const downloadPromise = page.waitForEvent('download');
  await page.locator('.fx-modal').getByRole('button', { name: 'Download' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('Night op.json');
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('.fx-outliner li.fx-missing')).toContainText('does_not_exist', { timeout: 30_000 });
  await expect(page.getByLabel('Layout name')).toHaveValue('Night op');
});

test('places, multi-selects, and keeps the selection across undo and redo', async ({ page }) => {
  await page.goto('/forge');
  await expect(page.locator('.fx-outliner li.fx-missing')).toHaveCount(1, { timeout: 30_000 });
  const view = page.locator('.fx-input');
  await placingTool(page, 'Spawn SEAL').click();
  await view.click({ position: { x: 200, y: 240 } });
  await placingTool(page, 'Spawn Terrorist').click();
  await view.click({ position: { x: 420, y: 300 } });
  const spawns = page.locator('.fx-outliner li.fx-team-a, .fx-outliner li.fx-team-b');
  await expect(spawns).toHaveCount(2);
  await spawns.nth(0).click();
  await spawns.nth(1).click({ modifiers: ['Shift'] });
  await expect(page.locator('.fx-outliner li.is-on')).toHaveCount(2);
  const x = page.locator('.fx-inspector .fx-field input').first();
  const before = await x.inputValue();
  await x.fill('400');
  await x.blur();
  await expect(x).toHaveValue('400');
  await page.locator('header.fx-top button[data-forge="undo"]').click();
  await expect(page.locator('.fx-outliner li.is-on')).toHaveCount(2);
  await expect(x).toHaveValue(before);
  await page.locator('header.fx-top button[data-forge="redo"]').click();
  await expect(page.locator('.fx-outliner li.is-on')).toHaveCount(2);
  await expect(x).toHaveValue('400');
});

test('duplicate undo selects the original, and redo selects the copy in its own row', async ({ page }) => {
  await page.goto('/forge');
  await expect(page.locator('.fx-outliner li.fx-missing')).toHaveCount(1, { timeout: 30_000 });
  const view = page.locator('.fx-input');
  await placingTool(page, 'Spawn SEAL').click();
  await view.click({ position: { x: 200, y: 240 } });
  await placingTool(page, 'Spawn Terrorist').click();
  await view.click({ position: { x: 420, y: 300 } });
  await page.locator('.fx-outliner li.fx-missing').click();
  await pressDuplicate(page);                                           // FC2-4 (EDITOR-MAP T7): Edit > Duplicate
  // OT.R112: the placed rows are `li[data-user-prop]` (`./forgeBase` `OUTLINER_USER_ROW`). FC2-4 (EDITOR-MAP O2): his tree
  // has no Props branch to hold the original then its copy -- its User Objects rows are every placement in the layout's
  // order (`../src/forge/page.ts` `outlineSorted`), the spawns among them -- so the copy's row is the second missing row
  // (a copy is placed after its original), not the second placed row.
  const rows = page.locator(`${OUTLINER_USER_ROW}.fx-missing`);
  await expect(page.locator('.fx-outliner li.fx-missing')).toHaveCount(2);
  await expect(rows.nth(1)).toHaveClass(/fx-missing/);
  await expect(rows.nth(1)).toHaveClass(/is-on/);
  await expect(page.locator('.fx-outliner li.fx-team-a.is-on, .fx-outliner li.fx-team-b.is-on')).toHaveCount(0);
  await page.locator('header.fx-top button[data-forge="undo"]').click();
  await expect(page.locator('.fx-outliner li.fx-missing')).toHaveCount(1);
  await expect(page.locator('.fx-outliner li.fx-missing.is-on')).toHaveCount(1);
  await expect(page.locator('.fx-outliner li.fx-team-a.is-on, .fx-outliner li.fx-team-b.is-on')).toHaveCount(0);
  await page.locator('header.fx-top button[data-forge="redo"]').click();
  await expect(page.locator('.fx-outliner li.fx-missing')).toHaveCount(2);
  await expect(rows.nth(1)).toHaveClass(/fx-missing/);
  await expect(rows.nth(1)).toHaveClass(/is-on/);
  await expect(page.locator('.fx-outliner li.fx-team-b.is-on')).toHaveCount(0);
  await expect(page.locator('.fx-status-msg')).not.toContainText('Opening the archive');
});

test('multi-delete undo selects every restored item, and redo selects nothing', async ({ page }) => {
  await page.goto('/forge');
  await expect(page.locator('.fx-outliner li.fx-missing')).toHaveCount(1, { timeout: 30_000 });
  const view = page.locator('.fx-input');
  await placingTool(page, 'Spawn SEAL').click();
  await view.click({ position: { x: 200, y: 240 } });
  await placingTool(page, 'Spawn Terrorist').click();
  await view.click({ position: { x: 420, y: 300 } });
  await page.locator('.fx-outliner li.fx-missing').click();
  await page.locator('.fx-outliner li.fx-team-a').click({ modifiers: ['Shift'] });
  await expect(page.locator('.fx-outliner li.is-on')).toHaveCount(2);
  await pressDelete(page);                                              // FC2-4 (EDITOR-MAP T7): Edit > Delete
  await expect(page.locator('.fx-outliner li.fx-missing')).toHaveCount(0);
  await expect(page.locator('.fx-outliner li.fx-team-a')).toHaveCount(0);
  await expect(page.locator('.fx-outliner li.fx-team-b')).toHaveCount(1);
  await page.locator('header.fx-top button[data-forge="undo"]').click();
  await expect(page.locator('.fx-outliner li.fx-missing.is-on')).toHaveCount(1);
  await expect(page.locator('.fx-outliner li.fx-team-a.is-on')).toHaveCount(1);
  await expect(page.locator('.fx-outliner li.fx-team-b.is-on')).toHaveCount(0);
  await page.locator('header.fx-top button[data-forge="redo"]').click();
  await expect(page.locator('.fx-outliner li.is-on')).toHaveCount(0);
  await expect(page.locator('.fx-outliner li.fx-missing')).toHaveCount(0);
  await expect(page.locator('.fx-outliner li.fx-team-a')).toHaveCount(0);
  await expect(page.locator('.fx-outliner li.fx-team-b')).toHaveCount(1);
});

test('remembers the camera, and Play leaves on P and on the button', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/forge');
  const cam = page.locator('.fx-status .fx-cell').nth(2);
  await expect(cam).toHaveText('cam 10, 80, 40', { timeout: 30_000 });
  await page.locator('.fx-input').click();
  await flyForward(page, async () => {
    await expect(cam).not.toHaveText('cam 10, 80, 40', { timeout: 8_000 });
  });
  // The status line redraws every 500 ms, so two equal readings that far apart are the camera after it has stopped.
  await expect.poll(async () => {
    const a = await cam.innerText();
    await page.waitForTimeout(650);
    return (await cam.innerText()) === a ? a : '';
  }, { timeout: 8_000 }).not.toBe('');
  const moved = await cam.innerText();
  await page.reload();
  await expect(cam).toHaveText(moved, { timeout: 30_000 });

  // The seeded piece is missing on this disc, so the check lists it. The layout sets no player cap, so the count is not
  // why the card opens. Play anyway is how this layout still starts the match.
  const play = async (): Promise<void> => {
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(async () => {
      if (await page.locator('body').evaluate((b) => b.classList.contains('is-matching'))) return 'match';
      if (await page.locator('.fx-check-card').isVisible()) return 'card';
      return '';
    }, { timeout: 30_000 }).not.toBe('');
    const card = page.locator('.fx-check-card');
    if (await card.isVisible()) {
      await expect(card).toContainText('not on this disc');
      await expect(card).not.toContainText('a side');
      await page.getByRole('button', { name: 'Play anyway' }).click();
    }
    await expect(page.locator('body')).toHaveClass(/is-matching/, { timeout: 30_000 });
  };
  await play();
  await page.keyboard.press('p');
  await expect(page.locator('body')).not.toHaveClass(/is-matching/, { timeout: 10_000 });
  await play();
  await page.getByRole('button', { name: /Back to the forge/ }).click();
  await expect(page.locator('body')).not.toHaveClass(/is-matching/, { timeout: 10_000 });
  expect(errors).toEqual([]);
});

test('saves the camera when the page reloads before the debounce', async ({ page }) => {
  await page.goto('/forge');
  const cam = page.locator('.fx-status .fx-cell').nth(2);
  await expect(cam).toHaveText('cam 10, 80, 40', { timeout: 30_000 });
  await page.locator('.fx-input').click();
  // R3-B: the autosave is in the page's saves store (IndexedDB, `./forgeStore`); the pagehide's flush is an awaited
  // write there, so the move is read back after the reload, not inside the pagehide.
  const storedCam = async (): Promise<string> => {
    const raw = await forgeStoredList(page, 'autosave');
    const camera = raw ? (JSON.parse(raw) as { camera?: { x: number; y: number; z: number } }).camera : undefined;
    return camera ? `cam ${Math.round(camera.x)}, ${Math.round(camera.y)}, ${Math.round(camera.z)}` : '';
  };
  await flyForward(page, async () => {
    await expect(cam).not.toHaveText('cam 10, 80, 40', { timeout: 8_000 });
    expect(await storedCam()).toBe('cam 10, 80, 40');
  });
  await page.reload();
  await expect.poll(storedCam, { timeout: 30_000, message: 'the move the pagehide flushed, kept across the reload' }).not.toBe('cam 10, 80, 40');
  const moved = await storedCam();
  expect(moved).not.toBe('');
  await expect(cam).toHaveText(moved, { timeout: 30_000 });
});
