import { expect, type Page } from '@playwright/test';

/**
 * OT.R112 (the owner, 2026-11-07: the Forge's UI is its contributor's, public PR #1). Two of his changes the Forge's
 * specs waited on: the viewport's label (`.fx-vp-label`, "Perspective · <base>") is gone -- his view menu
 * (`.fx-camera-view`) took its place -- and the toolbar's base list is gone: New asks for the base on a card
 * (`../src/forge/page.ts` `chooseNewBase`, a select labelled "New layout"), a preset then for the disc map it is built
 * from ("...: built from which map?", Create), and over work it would drop, "Save this layout first?". The base open is
 * named on the forge menu's New layout row (`page.ts`: `optionLabel(baseSel)`). Test plumbing only (product track).
 */

const menuButton = (page: Page) => page.locator('header.fx-top button[data-forge="menu"]');

/**
 * The forge menu open (FG-18/FUI-3) is a modal over the whole page (`../src/forge/page.ts` `menuHost`,
 * `.fx-modal.fx-padmenu`), so it intercepts a second click on the menu button: the e2e reds of agent/mega 394ac3273
 * (forgeBase.ts:51, the click retried behind the modal until the 120 s ran out). It is closed as the page offers: Esc
 * (its legend's "Esc · Close"), else a press on the backdrop itself (`menuHost`'s click handler: `e.target === menuHost`).
 */
async function closeMenu(page: Page): Promise<void> {
  if ((await menuButton(page).getAttribute('aria-expanded')) !== 'true') return;
  await page.keyboard.press('Escape');
  if ((await menuButton(page).getAttribute('aria-expanded')) === 'true') {
    await page.locator('.fx-modal.fx-padmenu').click({ position: { x: 2, y: 2 }, timeout: 2_000 });
  }
}

/**
 * OT.R112: a placing tool by its shown label. The placing tools sit on a row of their own under the toolbar
 * (`../src/forge/page.ts` `toolsRow`, `nav.fx-tools-row`) and wear their names at every width (`../src/forge/forge.css`
 * `.fx-tools-row .fx-tool > span { display: inline; }`), so a tool's accessible name is its label ('Spawn SEAL',
 * 'Spawn Terrorist', 'Bomb', 'Site SEAL', 'Site Terrorist': `modeBtns`), not its title ("Place a team A spawn...").
 */
export const placingTool = (page: Page, label: string) =>
  page.locator('nav.fx-tools-row').getByRole('button', { name: label, exact: true });

/**
 * OT.R112: the Outliner is a tree (`../src/forge/page.ts` `drawOutliner`: roots Map Data and User Data, their branches
 * each an `li.fx-tree-branch` holding a `ul.fx-outliner-children`), so a bare `.fx-outliner li` also matches every branch
 * above a row. A row is an `li` that is not a branch.
 */
export const OUTLINER_ROW = '.fx-outliner li:not(.fx-tree-branch)';

/** A row the layout places (`drawOutliner`'s `userRows`: `li[data-user-prop]`, in the layout's order within a branch). */
export const OUTLINER_USER_ROW = '.fx-outliner li[data-user-prop]';

/**
 * Waits until the forge has a base open whose name -- the forge menu's New layout row -- matches `name` (any name by
 * default: the old label's `·`), the loading card gone. The menu is opened to read the row and closed again.
 */
export async function expectBase(page: Page, name: string | RegExp = /\S/, timeout = 120_000): Promise<void> {
  // The view menu's summary only: the Snap settings' summary wears `.fx-camera-view` too (`../src/forge/page.ts`
  // `snapSettingsSummary`, 'fx-camera-view fx-viewport-snap-summary'), so the bare class is two elements; the view menu's
  // is the one in `details.fx-camera-views` and the one with `data-view` (`viewMenuSummary.dataset['view']`).
  await expect(page.locator('.fx-camera-views > .fx-camera-view[data-view]')).toBeVisible({ timeout });
  // The page's own first open done and nothing loading (`../src/forge/page.ts` `__forgeHide.ready()`: a base open, not
  // busy; a development build's test instrument). The loading card alone is no proof: it is hidden in the gap between the
  // maps' listing and the first open, and the base row already names the list's first row then -- the e2e-mega lost
  // press (aws-20261109t2209z: forgeRules pressed Save as, and opened a file, while the boot's MP2 still decoded).
  await expect.poll(() => page.evaluate(() => (globalThis as { __forgeHide?: { ready(): boolean } }).__forgeHide?.ready() ?? false),
    { timeout, message: 'the page\'s first open done' }).toBe(true);
  const value = page.locator('.fx-menu li[data-forge-menu-row="base"] .fx-menu-value');
  await expect(async () => {
    await expect(page.locator('.fx-loading')).toBeHidden({ timeout: 1_000 });
    await menuButton(page).click({ timeout: 2_000 });
    try {
      await expect(value).toContainText(name, { timeout: 2_000 });
    } finally {
      await closeMenu(page);
    }
  }).toPass({ timeout });
  await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false');
}

/** A card of the page's own by its heading (`.fx-modal .fx-card h2`). */
const card = (page: Page, heading: string | RegExp) => page.locator('.fx-modal .fx-card').filter({ has: page.locator('h2', { hasText: heading }) });

/**
 * New, on the base `value` (a row of New's list: `blank:<type>` a preset, or a disc map's stem): a preset built from
 * `from` (default: the card's first), and the layout now open dropped unsaved when the page asks.
 */
export async function newLayoutOn(page: Page, value: string, from?: string): Promise<void> {
  await page.locator('header.fx-top button[title^="Start a new layout"]').click();
  const choose = card(page, /^New layout$/);
  await expect(choose).toBeVisible({ timeout: 30_000 });
  await choose.locator('select[aria-label="New layout"]').selectOption(value);
  await choose.getByRole('button', { name: 'Next' }).click();
  const built = card(page, /built from which map\?$/);
  const saveFirst = card(page, /^Save this layout first\?$/);
  if (value.startsWith('blank:')) {
    await expect(built).toBeVisible({ timeout: 30_000 });
    if (from) await built.locator('select').selectOption(from);
    await built.getByRole('button', { name: 'Create' }).click();
  }
  // Over work the new layout drops, the page asks first; on an empty one it does not.
  await expect(async () => {
    if (await saveFirst.isVisible()) await saveFirst.getByRole('button', { name: /^Don.t save$/ }).click();
    // A shown dialog's cards only: the Controls card (`../src/forge/page.ts` `help`, a hidden `.fx-modal`) and the pad
    // menu's card once it has opened (`menuHost`) stay in the DOM under a hidden host, so a bare count is never 0.
    await expect(page.locator('.fx-modal:not([hidden]) .fx-card')).toHaveCount(0, { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
}
