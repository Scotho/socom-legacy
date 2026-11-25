import { expect, type Locator, type Page } from '@playwright/test';

/**
 * OT.R112 (the owner, 2026-11-07: the Forge's UI is its contributor's, public PR #1). Two of his changes the Forge's
 * specs waited on: the viewport's label (`.fx-vp-label`, "Perspective · <base>") is gone -- his view menu
 * (`.fx-camera-view`) took its place -- and the toolbar's base list is gone: New asks for the base on a card
 * (`../src/forge/page.ts` `chooseNewBase`, a select labelled "New layout"), a preset then for the disc map it is built
 * from ("...: built from which map?", Create), and over work it would drop, "Save this layout first?". The base open is
 * named on the forge menu's New layout row (`page.ts`: `optionLabel(baseSel)`). Test plumbing only (product track).
 *
 * FC2-4 (product track: a test harness; the Forge has no original, FG.R2): the contributor's editor shell (`e8acb4d970`)
 * replaced the toolbar's New / Open / Saves, its menu button and the old docks. Every helper here reaches his UI the way a
 * person does -- his File / Edit / Window menu bar, Controls > "Forge menu (M)", his dock tabs -- under the names the specs
 * already called; where his UI has no such thing the helper throws an Error naming the row of
 * `../test/forge/helpers/EDITOR-MAP.md` (the unit tests' map, `../test/forge/helpers/editor.ts` its jsdom form). Nothing
 * here clicks an element his page does not draw, and nothing reaches into the page's internals to fake a press.
 */

/** An Error naming the EDITOR-MAP row (`../test/forge/helpers/EDITOR-MAP.md`) of a thing his UI does not have. */
export class EditorMapError extends Error {
  constructor(row: string, words: string) {
    super(`EDITOR-MAP ${row}: ${words}`);
    this.name = 'EditorMapError';
  }
}

/** A press as the spec's device makes it. */
export type Press = 'click' | 'tap';

/* ---------------- the forge menu (EDITOR-MAP T1, M1-M3) ---------------- */

/**
 * EDITOR-MAP T1: the old toolbar's forge-menu button (`header.fx-top button[data-forge="menu"]`) is built but never put on
 * his page (`../src/forge/page.ts` `top.append`, "the menu button and Reset layout off the page (M and START open the
 * menu ...)"). A pointer's way in is `pressForgeMenu` / `openMenu`; its `is-on` and `aria-expanded` are on the detached
 * button, which no spec can read -- the menu's own card (`forgeMenu`) says whether it is open.
 */
export function menuButton(_page: Page): never {
  throw new EditorMapError('T1', "his toolbar has no forge-menu button: pressForgeMenu (Controls > 'Forge menu (M)') or the M key");
}

/** EDITOR-MAP T9: the toolbar's Controls button (`.fx-group--help`, an icon tool named by its aria-label). */
export const controlsButton = (page: Page): Locator => page.locator('header.fx-top button[aria-label="Controls"]');

/** The Controls card shown (`page.ts` `help`, a `.fx-modal` holding `.fx-card.fx-help`). */
const helpCard = (page: Page): Locator => page.locator('.fx-modal:not([hidden]) > .fx-card.fx-help');

/**
 * EDITOR-MAP M1: the forge menu's card while the menu is open. Its host (`page.ts` `menuHost`, `.fx-modal.fx-padmenu`) is
 * hidden when the menu shuts but keeps its last card, so the card alone does not say the menu is open.
 */
export const forgeMenu = (page: Page): Locator => page.locator('.fx-padmenu:not([hidden]) .fx-menu');

/**
 * EDITOR-MAP T1, M3: the pointer's way to the forge menu in his UI -- Controls, then the card's "Forge menu (M)"
 * (`page.ts` `help`'s click handler: the card shut, then the detached menu button pressed) -- the same toggle as the old
 * toolbar button (a second press shuts the menu), its pointer's hint, and its refusal while a walk holds that button
 * disabled. One press each, nothing retried: the caller asserts what it did.
 */
export async function pressForgeMenu(page: Page, press: Press = 'click'): Promise<void> {
  await controlsButton(page)[press]();
  const card = helpCard(page);
  await expect(card, "Controls opened its card (EDITOR-MAP T1: the forge menu's pointer way in)").toBeVisible({ timeout: 5_000 });
  await card.locator('footer button[data-help-menu]')[press]();
}

/**
 * EDITOR-MAP M1: the forge menu opened by the pointer's way (`pressForgeMenu`), retried until it shows. Before the page
 * has wired the menu's button, the card's press is held and pressed at the release (FC2-6: `earlyPresses.press`), so one
 * press is enough; a retry made before the release holds a second press, which shuts the menu at the release, and the
 * next retry, the page wired, opens it. Pressed only while the menu is shut, so a retry after the release never shuts it.
 */
export async function openMenu(page: Page, press: Press = 'click', timeout = 30_000): Promise<Locator> {
  const menu = forgeMenu(page);
  await expect(async () => {
    if (await menu.isVisible()) return;
    if (await helpCard(page).isVisible()) await helpCard(page).locator('footer button.fx-primary').click({ timeout: 2_000 });
    await pressForgeMenu(page, press);
    await expect(menu).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout });
  return menu;
}

/**
 * The forge menu open (FG-18/FUI-3) is a modal over the whole page (`../src/forge/page.ts` `menuHost`,
 * `.fx-modal.fx-padmenu`), so it intercepts a press behind it: the e2e reds of agent/mega 394ac3273 (the click retried
 * behind the modal until the 120 s ran out). It is closed as the page offers: Esc (its legend's "Esc · Close"), else a
 * press on the backdrop itself (`menuHost`'s click handler: `e.target === menuHost`).
 */
export async function closeMenu(page: Page): Promise<void> {
  if (!(await forgeMenu(page).isVisible())) return;
  await page.keyboard.press('Escape');
  if (await forgeMenu(page).isVisible()) {
    await page.locator('.fx-modal.fx-padmenu').click({ position: { x: 2, y: 2 }, timeout: 2_000 });
  }
  await expect(forgeMenu(page)).toBeHidden({ timeout: 2_000 });
}

/* ---------------- the menu bar: File, Edit, Window (EDITOR-MAP T2-T4, T7, T12, D11) ---------------- */

/**
 * EDITOR-MAP T12: a menu bar row (File, Edit, Window), its menu opened first if it is shut; the row returned, unpressed.
 * An open menu's list is drawn in the page's body (`page.ts`: `.fx-menubar-list.fx-menubar-floating`, labelled by its
 * menu's title), each row a `.fx-menubar-row` whose `.fx-menubar-label` is its word (the icon before it is aria-hidden).
 */
export async function menubarRow(page: Page, menu: string, label: string, press: Press = 'click'): Promise<Locator> {
  const title = page.locator('header.fx-top .fx-menubar summary.fx-menubar-title').filter({ hasText: new RegExp(`^${menu}$`) });
  if (!(await title.count())) throw new EditorMapError('T12', `his menu bar has no menu '${menu}'`);
  const list = page.locator(`body > .fx-menubar-list.fx-menubar-floating[aria-label="${menu}"]`);
  if (!(await list.isVisible())) await title[press]();
  await expect(list, `the ${menu} menu opened`).toBeVisible({ timeout: 5_000 });
  const exact = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return list.locator('.fx-menubar-row').filter({ has: page.locator('.fx-menubar-label', { hasText: new RegExp(`^${exact}$`) }) });
}

/** EDITOR-MAP T12: a menu bar row pressed (a greyed row is waited for, as Playwright waits for any disabled button). */
export async function pressMenubar(page: Page, menu: string, label: string, press: Press = 'click'): Promise<void> {
  await (await menubarRow(page, menu, label, press))[press]();
}

/** EDITOR-MAP T2, C2: New (the old toolbar's "Start a new layout" button): File > New... */
export const pressNew = (page: Page, press: Press = 'click'): Promise<void> => pressMenubar(page, 'File', 'New…', press);

/** EDITOR-MAP T3, C3: Open (the old toolbar's "Open a layout file" button): File > Open... */
export const pressOpen = (page: Page, press: Press = 'click'): Promise<void> => pressMenubar(page, 'File', 'Open…', press);

/** EDITOR-MAP T4, C1: Saves (the old toolbar's `[data-forge="saves"]`): File > Saves..., the same button's listener. */
export const openSaves = (page: Page, press: Press = 'click'): Promise<void> => pressMenubar(page, 'File', 'Open…', press);

/** EDITOR-MAP T7: Duplicate (the old toolbar's `button[title^="Duplicate"]`): Edit > Duplicate. */
export const pressDuplicate = (page: Page, press: Press = 'click'): Promise<void> => pressMenubar(page, 'Edit', 'Duplicate', press);

/** EDITOR-MAP T7: Delete (the old toolbar's `button[title^="Delete"]`): Edit > Delete. */
export const pressDelete = (page: Page, press: Press = 'click'): Promise<void> => pressMenubar(page, 'Edit', 'Delete', press);

/** EDITOR-MAP D11: Reset layout (the old toolbar's `[data-forge="reset-layout"]`): Window > Reset layout. */
export const pressResetLayout = (page: Page, press: Press = 'click'): Promise<void> => pressMenubar(page, 'Window', 'Reset layout', press);

/**
 * The toolbar's controls a person reaches (`header.fx-top`'s links, buttons, selects and fields) and, EDITOR-MAP T12, his
 * menu bar's three titles (`summary.fx-menubar-title`: File, Edit, Window), which hold what the old row's buttons did.
 */
export const TOOLBAR_CONTROLS = 'a, button, select, input, summary';

/**
 * The fewest controls his toolbar shows (FC2-4; the reachability checks' "the toolbar was found" floor, never a layout
 * rule). The old floor (more than 15) counted New, Open, Saves (T2-T4), Duplicate, Delete (T7), the menu button (T1) and
 * Reset layout (D11), all off his row; the runner's record at b5b37ed00 counted his row's 12 (a lobby's joiner 13, Save
 * map shown: `../src/forge/page.ts` `top.append`), and his File, Edit and Window titles make 15.
 */
export const TOOLBAR_CONTROLS_FLOOR = 15;

/* ---------------- the docks: his dock shell (EDITOR-MAP D1-D9) ---------------- */

/**
 * EDITOR-MAP D6: a dock tab's button (`.fx-dg-tab[data-forge-tab]`, `../src/forge/shell/dockShell.ts` `tabButton`). The old
 * right dock's World tab is his Map tab (World's panels carry `tab: 'Map'`).
 */
export function dockTab(page: Page, key: string): Locator {
  if (key === 'world') throw new EditorMapError('D6', "his dock has no World tab: World's panels are under the Map tab (key 'map')");
  return page.locator(`.fx-dg-tab[data-forge-tab="${key}"]`);
}

/**
 * EDITOR-MAP D6: a dock tab pressed (its group then shows it), on its word -- not on its close (`.fx-dg-tab-close`, at the
 * tab's end, its own press closing the tab).
 */
export async function showTab(page: Page, key: string, press: Press = 'click'): Promise<void> {
  await dockTab(page, key).locator(':scope > span:not(.fx-dg-tab-close):not(.fx-dg-tab-icon)')[press]();
  await expect(dockTab(page, key)).toHaveAttribute('aria-selected', 'true');
}

/**
 * EDITOR-MAP D1, D3: the dock group holding a tab (`.fx-dg-group`): `assets` is the old left dock (`.fx-left`), `object` the
 * old right dock's top (his column holds the Object / Map / Content / Agent group over the Inspector's), `viewport` the
 * old centre. Absent from the page while the docks are off (only the viewport is drawn then, `page.ts` `maximized`).
 */
export const dockOf = (page: Page, key: string): Locator =>
  page.locator('.fx-dg-group').filter({ has: page.locator(`.fx-dg-tabs > .fx-dg-tab[data-forge-tab="${key}"]`) });

/** EDITOR-MAP D2: the old right dock has no one element in his shell -- reach a panel by `panel` / `showPanel`. */
export function rightDock(_page: Page): never {
  throw new EditorMapError('D2', 'his dock shell has no one right dock: reach a panel by panel(page, id) or showPanel(page, id)');
}

/** Each panel's dock tab (its `tab` slugged, else its id; EDITOR-MAP, "The panels and their tabs"). */
export const PANEL_TAB: Readonly<Record<string, string>> = {
  'asset-browser': 'assets', viewport: 'viewport', outliner: 'object', inspector: 'inspector',
  settings: 'map', environment: 'map', rules: 'map', starters: 'map', 'creator-assets': 'content', agent: 'agent',
};

/**
 * EDITOR-MAP D8: a panel's host (`details.fx-panel[data-forge-panel]`) drawn in its tab's body (`.fx-dg-body`) -- a panel
 * whose tab is not its group's active one waits in the hidden stash (`.fx-dg-stash`) and is not matched.
 */
export const panel = (page: Page, id: string): Locator => page.locator(`.fx-dg-body > details.fx-panel[data-forge-panel="${id}"]`);

/** EDITOR-MAP D6, D8: a panel's tab pressed, then its host (drawn). */
export async function showPanel(page: Page, id: string, press: Press = 'click'): Promise<Locator> {
  const key = PANEL_TAB[id];
  if (!key) throw new EditorMapError('D8', `no tab is known for the panel '${id}'`);
  await showTab(page, key, press);
  return panel(page, id);
}

/* ---------------- the outliner (EDITOR-MAP O1-O6) ---------------- */

/**
 * OT.R112: a placement's or a map object's row of the Outliner (`../src/forge/page.ts` `drawOutliner`). EDITOR-MAP O2:
 * his tree is two section rows -- `li.fx-outliner-section`, User Objects and Map Objects, each folding the rows under it
 * -- with the rows one level in, so a row is an `li` that is not a section row (nor an old tree's branch).
 */
export const OUTLINER_ROW = '.fx-outliner li:not(.fx-tree-branch):not(.fx-outliner-section)';

/** A row the layout places (`drawOutliner`'s `userRows`: `li[data-user-prop]`, in the layout's order). */
export const OUTLINER_USER_ROW = '.fx-outliner li[data-user-prop]';

/** EDITOR-MAP O2, O3: one of the tree's two section rows -- 'user' (User Objects) or 'map' (Map Objects); its press folds it. */
export const outlinerSection = (page: Page, id: 'user' | 'map'): Locator =>
  page.locator(`.fx-outliner > li.fx-outliner-section[data-outliner-section="${id}"]`);

/** EDITOR-MAP O2: the old tree's branch by kind -- his tree has none. */
export function treeBranch(_page: Page, kind: string): never {
  throw new EditorMapError('O2', `his outliner has no branch '${kind}' (no row sets data-tree-branch): its tree is two section rows, outlinerSection(page, 'user' | 'map')`);
}

/**
 * EDITOR-MAP O6: the Outliner's Filter (`details.fx-outliner-filter`, its summary the word Filter), where the old type
 * select was: a switch per kind (`../src/forge/panels/outlinerPanel.ts` `OUTLINER_KINDS`, each labelled by its word) and a
 * Solo beside each (`page.ts`: that kind alone; pressed again, every kind).
 */
export const outlinerFilter = (page: Page): Locator => page.locator('.fx-outliner-tools > details.fx-outliner-filter');

/** EDITOR-MAP O6: the Filter opened (its summary pressed while shut); the dropdown returned. */
export async function openOutlinerFilter(page: Page): Promise<Locator> {
  const filter = outlinerFilter(page);
  if (!(await filter.evaluate((d) => (d as HTMLDetailsElement).open))) await filter.locator(':scope > summary').click();
  return filter;
}

/** EDITOR-MAP O6: a kind's row of the open Filter by its word ('Spawns', 'Missing pieces', ...): its switch and its Solo. */
export const outlinerFilterKind = (page: Page, label: string): Locator =>
  outlinerFilter(page).locator('label.fx-toggle').filter({ has: page.locator(`input[aria-label="${label}"]`) });

/** The Outliner's search (`outlinerPanel.ts` `buildOutliner`: the tools' search field, beside the Filter). */
export const outlinerSearch = (page: Page): Locator => page.locator('.fx-outliner-tools input[type="search"]');

/* ---------------- the placing tools and the base (unchanged by FC2-4) ---------------- */

/**
 * OT.R112: a placing tool by its shown label. The placing tools sit on a row of their own under the toolbar
 * (`../src/forge/page.ts` `toolsRow`, `nav.fx-tools-row`) and wear their names at every width (`../src/forge/forge.css`
 * `.fx-tools-row .fx-tool > span { display: inline; }`), so a tool's accessible name is its label ('Spawn SEAL',
 * 'Spawn Terrorist', 'Bomb', 'Site SEAL', 'Site Terrorist': `modeBtns`), not its title ("Place a team A spawn...").
 */
export const placingTool = (page: Page, label: string) =>
  page.locator('nav.fx-tools-row').getByRole('button', { name: label, exact: true });

/**
 * Waits until the forge has a base open whose name -- the forge menu's New layout row -- matches `name` (any name by
 * default), the loading card gone. The menu is opened by the pointer's way (`pressForgeMenu`) to read the row and closed
 * again.
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
  const value = forgeMenu(page).locator('li[data-forge-menu-row="base"] .fx-menu-value');
  await expect(async () => {
    await expect(page.locator('.fx-loading')).toBeHidden({ timeout: 1_000 });
    if (await helpCard(page).isVisible()) await helpCard(page).locator('footer button.fx-primary').click({ timeout: 2_000 });
    if (!(await forgeMenu(page).isVisible())) await pressForgeMenu(page);
    try {
      await expect(value).toContainText(name, { timeout: 2_000 });
    } finally {
      await closeMenu(page);
    }
  }).toPass({ timeout });
  await expect(forgeMenu(page)).toBeHidden();
}

/** A card of the page's own by its heading (`.fx-modal .fx-card h2`). */
const card = (page: Page, heading: string | RegExp) => page.locator('.fx-modal .fx-card').filter({ has: page.locator('h2', { hasText: heading }) });

/**
 * New, on the base `value` (a row of New's list: `blank:<type>` a preset, or a disc map's stem): a preset built from
 * `from` (default: the card's first), and the layout now open dropped unsaved when the page asks. EDITOR-MAP T2: New is
 * File > New... (`pressNew`).
 */
export async function newLayoutOn(page: Page, value: string, from?: string): Promise<void> {
  await pressNew(page);
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
