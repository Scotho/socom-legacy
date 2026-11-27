import { expect, test, type Page } from '@playwright/test';
import { dockOf } from './forgeBase';

/**
 * LATER 176 (the merge controller's product-track call, 2026-10-21): on a narrow touch screen the forge's docks are
 * drawers over the viewport (`../src/forge/forge.css`, the 760 px block), and the overlay's touch Menu, pushed below the
 * toolbar (`header.fx-top`, `data-mu-top-bar`; `../src/modern/overlay/index.ts` `measureMenu`), sat over the left dock's
 * assets heading and palette select. The docks now start below the pushed Menu (`--mu-touch-menu-clear`), the toolbar
 * stays clear, and the docks still reach the status strip. Wide screens are unchanged. A browser adaptation (OT.R28).
 *
 * FC2-4 (OT.R112: the Forge's UI is its contributor's; product track): his editor hides the overlay's touch Menu while
 * editing (`../src/forge/forge.css`: `body.forge-page:not(.is-playing) > .mu-touch-menu { display: none; }`, "the
 * toolbar's menu button opens the forge menu. Under Play it shows again"), so in the editor no Menu lies over the toolbar
 * or a dock -- held here as his page draws it: the Menu on the page and hidden. His docks are no drawers but his dock
 * shell's groups in a workbench under the toolbar and its tools row, down to the status strip (`forge.css`
 * `.fx-workbench`: top `var(--fx-top)`, bottom `var(--fx-status)`): the old left dock is his Assets group, the old right
 * dock his column of the Object / Map / Content / Agent group over the Inspector's (`../src/forge/page.ts`
 * `DEFAULT_DOCK`; EDITOR-MAP D1, D2), so the dock reaching the status strip on the right is the Inspector's.
 * The drawer's push below the Menu (`body.mu-menu-below-bar`, `--mu-touch-menu-clear`) has no Menu to clear in his editor:
 * that assertion is dropped (EDITOR-MAP D4: the old `.fx-dock` it moved is gone).
 */
test.use({ storageState: { cookies: [], origins: [] } });

type Box = { x: number; y: number; width: number; height: number };

type Boxes = { top: Box; tools: Box; left: Box; right: Box; inspector: Box; inner: number; status: number };

/** One reading of every box, or null while any of them has none (not laid out, or its element just redrawn). */
async function readBoxes(page: Page): Promise<Boxes | null> {
  const b = (l: ReturnType<Page['locator']>): Promise<Box | null> => l.boundingBox();
  const top = await b(page.locator('header.fx-top')), tools = await b(page.locator('nav.fx-tools-row'));
  const left = await b(dockOf(page, 'assets')), right = await b(dockOf(page, 'object')), inspector = await b(dockOf(page, 'inspector'));
  if (!top || !tools || !left || !right || !inspector) return null;
  return {
    top, tools, left, right, inspector,
    inner: await page.evaluate(() => innerHeight),
    status: await page.evaluate(() => parseFloat(getComputedStyle(document.body).getPropertyValue('--fx-status')) || 26),
  };
}

/** Two animation frames of the page's own, so its frame loop has run once between two readings. */
const nextFrames = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

/**
 * The docks' boxes: the Assets group (the old left dock), the Object group (the right column's top) and the Inspector's.
 * LATER 1045 (the gate hygiene sweep; a test of a browser adaptation): measured once the layout has settled, not after a
 * fixed 200 ms. The dock shell draws its groups anew on the docks' show (`../src/forge/shell/dockShell.ts` `refresh` ->
 * `render`, whose `canvas.replaceChildren()` puts new `.fx-dg-group` elements in) and again on its next frame (`frame`:
 * `maximized()` flipped against `lastMaximized` -> `render`), so a box read across that frame was null -- the element
 * the locator had found replaced before its box was taken (each render is one synchronous pass: no frame is painted
 * without the docks). The wait is on the page's state: every box present and the same across a frame of its own.
 */
async function boxes(page: Page): Promise<Boxes> {
  await expect(dockOf(page, 'assets')).toBeVisible({ timeout: 30_000 });
  const settled: { boxes: Boxes | null } = { boxes: null };
  await expect.poll(async () => {
    const before = await readBoxes(page);
    if (!before) return false;
    await nextFrames(page);
    const after = await readBoxes(page);
    if (!after || JSON.stringify(after) !== JSON.stringify(before)) return false;
    settled.boxes = after;
    return true;
  }, { message: 'the toolbar, its tools row and the three docks laid out, unchanged across a frame', timeout: 30_000 }).toBe(true);
  return settled.boxes!;
}

/** His editor's touch Menu: on the page (the overlay's, on a touch device) and hidden while editing (`forge.css`). */
async function touchMenuHidden(page: Page): Promise<void> {
  const menu = page.locator('.mu-touch-menu');
  await expect(menu, 'the overlay\'s touch Menu on the page').toHaveCount(1, { timeout: 30_000 });
  await expect(menu, 'hidden in the editor (forge.css: body.forge-page:not(.is-playing) > .mu-touch-menu)').toBeHidden();
}

for (const size of [{ width: 390, height: 844 }, { width: 360, height: 640 }, { width: 700, height: 900 }]) {
  test.describe(`the forge on a narrow touch screen, ${size.width}x${size.height}`, () => {
    test.use({ hasTouch: true, isMobile: true, viewport: size });

    test('the touch Menu clears the toolbar and both docks; the docks start under it and reach the status strip', async ({ page }) => {
      await page.goto('/forge');
      // A narrow window opens on the viewport, the docks a press away (`../src/forge/page.ts`, `setDocks`): H here, the
      // toolbar's Docks button scrolled to and tapped being `./forgeToolbar.spec.ts`' case (LATER 226).
      await touchMenuHidden(page);
      await expect(dockOf(page, 'assets')).toBeHidden();
      await page.keyboard.press('KeyH');
      const m = await boxes(page);
      await touchMenuHidden(page);                                       // the docks shown, still no Menu over them
      // The docks clear the toolbar and its tools row: they start at or under the row's foot.
      for (const [name, d] of [['the left dock', m.left], ['the right dock', m.right]] as const) {
        expect(d.y, `${name} under the toolbar's tools row`).toBeGreaterThanOrEqual(m.tools.y + m.tools.height - 0.5);
        expect(d.y, `${name} under the toolbar`).toBeGreaterThanOrEqual(m.top.y + m.top.height - 0.5);
      }
      for (const [name, d] of [['the left dock', m.left], ['the right column\'s foot (the Inspector)', m.inspector]] as const) {
        expect(d.y + d.height, `${name} reaches the status strip`).toBeCloseTo(m.inner - m.status, 0);
      }
    });
  });
}

test.describe('the forge on a wide touch screen', () => {
  const size = { width: 1280, height: 800 };
  test.use({ hasTouch: true, viewport: size });

  test('is as it was: the docks start under the toolbar and its tools row', async ({ page }) => {
    await page.goto('/forge');
    await touchMenuHidden(page);
    const m = await boxes(page);
    // OT.R112: the placing tools' row sits under the toolbar (`../src/forge/forge.css` `.fx-tools-row`: top
    // `var(--fx-top-bar)`, 46 px; height 40 px) and the docks start under both (`--fx-top: 86px`; the page's
    // `fitToolbar` sets it to the toolbar's height plus the row's), so their top is the row's bottom, not the toolbar's.
    expect(m.tools.y, 'the tools row under the toolbar').toBeCloseTo(m.top.y + m.top.height, 0);
    expect(m.left.y).toBeCloseTo(m.tools.y + m.tools.height, 0);
    expect(m.right.y).toBeCloseTo(m.tools.y + m.tools.height, 0);
  });
});
