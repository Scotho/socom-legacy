import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * LATER 230 (the merge controller's product-track call, 2026-10-21): the forge's menu had no way in but the pad's START.
 * The toolbar's menu button (at its left, after FORGE: on screen without a scroll) opens it; a tap on a value's › turns
 * it, a tap on a row runs it, a tap outside closes it; walking, the button is disabled (START stops the walk). The match's
 * Back button names the pad's chord only with a pad. A browser adaptation (OT.R28). Not a disc capture.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const MAPS = fileURLToPath(new URL('../../../public/maps', import.meta.url));
const HAVE_MAPS = existsSync(join(MAPS, 'index.json')) && existsSync(join(MAPS, 'RUN', 'MP2.ZDB'));

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
/** `./forgeEditor.spec.ts`' layout: a blank floor and one missing piece, so Play asks "Play anyway". */
const LAYOUT = JSON.stringify({
  forge: 1, name: 'Night op', base: { kind: 'blank', library: 'floor' },
  pieces: [{ asset: 'MP2:does_not_exist', m: IDENTITY }], spawns: [], camera: { x: 10, y: 80, z: 40, yaw: 15, pitch: -20 },
});
const seed = (page: Page) => page.addInitScript((layout) => {
  if (!sessionStorage.getItem('s2u-forge-e2e-seeded')) {
    localStorage.setItem('s2u-forge-layout', layout);
    sessionStorage.setItem('s2u-forge-e2e-seeded', '1');
  }
}, LAYOUT);
const padStub = (page: Page, connected: boolean) => page.addInitScript((on) => {
  const pad = on ? { id: 'Test pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) } : null;
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => (pad ? [pad] : []) });
}, connected);

const menuBtn = (page: Page) => page.locator('header.fx-top button[data-forge="menu"]');
const menu = (page: Page) => page.locator('.fx-menu');
const row = (page: Page, label: string) => menu(page).locator('li').filter({ has: page.locator('.fx-menu-label', { hasText: new RegExp(`^${label}$`) }) });

async function playAnyway(page: Page): Promise<void> {
  await page.locator('button.fx-play').scrollIntoViewIfNeeded();
  await page.locator('button.fx-play').click();
  const card = page.locator('.fx-check-card');
  await expect.poll(async () => (await page.locator('body').evaluate((b) => b.classList.contains('is-matching'))) ? 'match' : (await card.isVisible()) ? 'card' : '', { timeout: 30_000 }).not.toBe('');
  if (await card.isVisible()) await page.getByRole('button', { name: 'Play anyway' }).click();
  await expect(page.locator('body')).toHaveClass(/is-matching/, { timeout: 60_000 });
}

test.describe('a phone, 390x844, no pad', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('the menu button is on screen unscrolled; a tap opens the menu, › turns a value, a row runs, outside closes', async ({ page }) => {
    await padStub(page, false);
    await page.goto('/forge');
    await expect(menuBtn(page)).toBeVisible({ timeout: 30_000 });
    const b = (await menuBtn(page).boundingBox())!;
    expect(b.x + b.width, 'on screen without a scroll').toBeLessThanOrEqual(390);
    await menuBtn(page).tap();
    await expect(menu(page)).toBeVisible();
    await expect(menuBtn(page)).toHaveClass(/(^|\s)is-on(\s|$)/);
    await expect(menu(page).locator('header .fx-dim')).toHaveText('tap a row · ‹ › change · outside closes');
    const snap = row(page, 'Snap');
    // R7-A (the Forge batch's first rendered pass, case 6): the menu's list scrolls on a phone and Snap may sit below its
    // fold, where elementFromPoint meets no step; it is brought into view before its arrow is measured, as Rounds is below.
    await snap.scrollIntoViewIfNeeded();
    // The review's F1: the arrow's 44 px touch area is the arrow's -- 15 px above, below and outside its glyph a tap
    // still meets the step, never the row (whose tap would run it).
    const prev = (await snap.locator('.fx-menu-step', { hasText: '‹' }).boundingBox())!;
    const hits = await page.evaluate(({ x, y }) => [[x, y - 15], [x, y + 15], [x - 15, y]]
      .map(([a, b]) => document.elementFromPoint(a!, b!)?.closest('.fx-menu-step')?.textContent ?? 'none'), { x: prev.x + prev.width / 2, y: prev.y + prev.height / 2 });
    expect(hits).toEqual(['‹', '‹', '‹']);
    const before = await snap.locator('.fx-menu-value').innerText();
    await snap.locator('.fx-menu-step', { hasText: '›' }).tap();
    await expect(snap.locator('.fx-menu-value')).not.toHaveText(before);
    await expect(menu(page)).toBeVisible();
    await expect(page.locator('.fx-left')).toBeHidden();
    await row(page, 'Docks').tap();
    await expect(page.locator('.fx-left')).toBeVisible();
    // LATER 234 (the review's F2): a greyed row tapped runs nothing -- on this blank floor "NPC character" is greyed (no
    // characters), and the cursor's row would otherwise run (Play the layout's check card, or the match).
    const npc = row(page, 'NPC character');
    await expect(npc).toHaveClass(/(^|\s)is-off(\s|$)/);
    await npc.locator('.fx-menu-label').tap();                             // the row itself, not its greyed steps (which take nothing)
    await page.waitForTimeout(500);
    await expect(menu(page)).toBeVisible();
    await expect(page.locator('.fx-left'), 'the cursor\'s row (Docks) not run again').toBeVisible();
    await expect(page.locator('.fx-check-card')).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/is-matching/);
    await page.mouse.click(5, 840);                                       // the backdrop, outside the card
    await expect(menu(page)).toBeHidden();
    await expect(menuBtn(page)).not.toHaveClass(/(^|\s)is-on(\s|$)/);
  });

  // The re-review's G1 and G2: on a one-character value (Rounds) the ‹'s and the ›'s touch areas do not meet -- the ‹'s
  // inner half is the ‹'s -- and each lies inside its own row, so a tap at a row's edge is never the next row's arrow.
  test('the arrows\' touch areas: never over each other on a one-character value, inside their own row', async ({ page }) => {
    await padStub(page, false);
    await page.goto('/forge');
    await expect(menuBtn(page)).toBeVisible({ timeout: 30_000 });
    await menuBtn(page).tap();
    const rounds = row(page, 'Rounds');
    await rounds.scrollIntoViewIfNeeded();
    // A single digit first (the default may be 10 or more): stepped down on the ‹ itself, not at a point.
    for (let n = 0; n < 12 && !/^\d$/.test(await rounds.locator('.fx-menu-text').innerText()); n++) {
      await rounds.locator('.fx-menu-step', { hasText: '‹' }).dispatchEvent('click');
    }
    await expect(rounds.locator('.fx-menu-text')).toHaveText(/^\d$/);
    // Found by this case: each step redraws the card, and its list came back scrolled to its top, so a lower row stepped
    // on a phone left the screen at every tap. The list keeps its place, and the lit row is in view.
    await expect(rounds).toBeInViewport();
    const r = (await rounds.boundingBox())!;
    for (const glyph of ['‹', '›']) {
      const s = (await rounds.locator('.fx-menu-step', { hasText: glyph }).boundingBox())!;
      expect(s.y, `${glyph}: its area starts inside its row`).toBeGreaterThanOrEqual(r.y - 0.5);
      expect(s.y + s.height, `${glyph}: its area ends inside its row`).toBeLessThanOrEqual(r.y + r.height + 0.5);
      expect(s.height, `${glyph}: 44 px tall`).toBeGreaterThanOrEqual(43.5);
      expect(s.width, `${glyph}: 44 px wide`).toBeGreaterThanOrEqual(43.5);
    }
    const prev = (await rounds.locator('.fx-menu-step', { hasText: '‹' }).boundingBox())!;
    const next = (await rounds.locator('.fx-menu-step', { hasText: '›' }).boundingBox())!;
    expect(prev.x + prev.width, 'the two areas apart').toBeLessThanOrEqual(next.x + 0.5);
    const inner = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.fx-menu-step')?.textContent ?? 'none',
      { x: prev.x + prev.width / 2 + 3, y: prev.y + prev.height / 2 });
    expect(inner, 'the ‹ glyph\'s right half is the ‹').toBe('‹');
  });

  test('walking, the menu button is disabled; the walk stopped, it is back', async ({ page }) => {
    test.skip(!HAVE_MAPS, 'needs socomlegacy/public/maps/index.json and RUN/MP2.ZDB, the blank floor\'s library (not committed)');
    await padStub(page, false);
    await page.goto('/forge?devmode');
    await expect(page.locator('.fx-vp-label')).toContainText('·', { timeout: 120_000 });
    // The review's F5: the walk started from the menu's own row closes the menu, and the button waits.
    await menuBtn(page).tap();
    await row(page, 'Walk the layout').tap();
    await expect(page.locator('body')).toHaveClass(/(^|\s)is-playing(\s|$)/, { timeout: 120_000 });
    await expect(menu(page)).toBeHidden();
    await expect(menuBtn(page)).toBeDisabled();
    const walk = page.locator('header.fx-top button[title^="Walk the layout"]');
    await walk.scrollIntoViewIfNeeded();
    // A development build locks the mouse for the walk's look (`lockMouse`, OT.R38: a development build's), and the locked
    // pointer takes the tap; a release has no lock, so the lock is let go first. Under the Walk button's centre is the
    // Walk button, walking too (elementFromPoint, the seat's diagnosis).
    await page.evaluate(() => document.exitPointerLock());
    await walk.tap();
    await expect(page.locator('body')).not.toHaveClass(/(^|\s)is-playing(\s|$)/);
    await expect(menuBtn(page)).toBeEnabled();
  });

  test('the match\'s Back button reads its words alone, and a tap goes back', async ({ page }) => {
    await padStub(page, false);
    await seed(page);
    await page.goto('/forge');
    await expect(page.locator('.fx-outliner li.fx-missing')).toHaveCount(1, { timeout: 30_000 });
    await playAnyway(page);
    await expect(page.locator('.fx-match-back')).toHaveText('Back to the forge');
    await page.locator('.fx-match-back').tap();
    await expect(page.locator('body')).not.toHaveClass(/is-matching/, { timeout: 10_000 });
  });
});

test.describe('a desktop window, 1280x800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('a click opens the menu, a click outside closes it', async ({ page }) => {
    await padStub(page, false);
    await page.goto('/forge');
    await menuBtn(page).click({ timeout: 30_000 });
    await expect(menu(page)).toBeVisible();
    await page.mouse.click(5, 795);
    await expect(menu(page)).toBeHidden();
  });

  test('with a pad, the match\'s Back button names the pad\'s chord', async ({ page }) => {
    await padStub(page, true);
    await seed(page);
    await page.goto('/forge');
    await expect(page.locator('.fx-outliner li.fx-missing')).toHaveCount(1, { timeout: 30_000 });
    await playAnyway(page);
    await expect(page.locator('.fx-match-back')).toHaveText('Back to the forge · hold SELECT + START');
    await page.locator('.fx-match-back').click();
    await expect(page.locator('body')).not.toHaveClass(/is-matching/, { timeout: 10_000 });
  });
});

/**
 * FUI-3 (the review's PAD-5, PAD-6, PAD-7, PAD-11; FUI.R6; OT.R87's basic paths; a browser adaptation, FG.R2): the menu
 * in sections, its Outliner and Props sub-screens driving the selection and the placement from a pad stub, and the
 * legend strip at 760 px with nothing hidden. Written and type-checked with FUI-3; its rendered run is the 5c pass's.
 */
test.describe('FUI-3: the pad menu\'s sections, sub-screens and the legend', () => {
  const livePad = (page: Page) => page.addInitScript(() => {
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
  const CROSS = 0, CIRCLE = 1, SQUARE = 2, R1 = 5, START = 9, UP = 12, DOWN = 13, RIGHT = 15;
  const onRow = (page: Page) => page.locator('.fx-menu li.is-on');
  const crumb = (page: Page) => page.locator('.fx-menu header h2');
  async function ready(page: Page): Promise<void> {
    await page.goto('/forge?floor');
    await expect(page.locator('.fx-status-msg')).toHaveText(/layout open/, { timeout: 60_000 });
    await expect(page.locator('.fx-loading')).toBeHidden();
  }
  /** START, then the d-pad up to the row of `id` (the list wraps). */
  async function menuTo(page: Page, id: string): Promise<void> {
    await press(page, START);
    await expect(page.locator('.fx-menu')).toBeVisible();
    for (let n = 0; n < 80 && (await onRow(page).getAttribute('data-forge-menu-row')) !== id; n++) await press(page, UP);
    await expect(onRow(page)).toHaveAttribute('data-forge-menu-row', id);
  }

  test.describe('a desktop window, 1280x800', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('R1 pages the sections; the Outliner screen selects a spawn, Square locks it, Circle pops before it closes', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await livePad(page);
      await ready(page);
      await page.getByRole('button', { name: /team A spawn/ }).click();
      await page.locator('.fx-input').click();
      await expect(page.locator('.fx-outliner')).toContainText('Spawn A');
      await page.keyboard.press('Digit1');                              // the Select tool (OT.R68: every build's keys)

      await press(page, START);
      const lit = page.locator('.fx-menu header [data-forge-menu-section][aria-current="true"]');
      await expect(lit).toHaveAttribute('data-forge-menu-section', 'play');
      await press(page, R1);
      await expect(lit).toHaveAttribute('data-forge-menu-section', 'build');
      // R7-A R2: the viewport's strip (the menu header's prompts are the inline form, never a second `.fx-legend`).
      await expect(page.locator('.fx-viewport .fx-legend')).toContainText('Section');
      await press(page, START);
      await expect(page.locator('.fx-menu')).toBeHidden();

      await menuTo(page, 'outliner-screen');
      await press(page, CROSS);
      await expect(crumb(page)).toHaveText('Forge › Outliner');
      await expect(onRow(page)).toContainText('Spawn A');
      await press(page, CROSS);                                         // selects it and looks at it; the menu closes
      await expect(page.locator('.fx-menu')).toBeHidden();
      await expect(page.locator('.fx-outliner li.is-on')).toContainText('Spawn A');

      await menuTo(page, 'outliner-screen');
      await press(page, CROSS);
      await press(page, SQUARE);                                        // locks it; the screen stays
      await expect(onRow(page).locator('.fx-menu-value')).toHaveText('Locked');
      await expect(page.locator('.fx-outliner li.is-locked')).toContainText('Spawn A');
      await press(page, CIRCLE);
      await expect(crumb(page)).toHaveText('Forge');
      await expect(page.locator('.fx-menu')).toBeVisible();
      await press(page, CIRCLE);
      await expect(page.locator('.fx-menu')).toBeHidden();
      expect(errors).toEqual([]);
    });

    test('the Props screen: a grid in pages, Cross chooses a prop and the Place tool takes it', async ({ page }) => {
      test.skip(!HAVE_MAPS, 'needs socomlegacy/public/maps/index.json and RUN/MP2.ZDB, the blank floor\'s library (not committed)');
      await livePad(page);
      await ready(page);
      await menuTo(page, 'props');
      await press(page, CROSS);
      await expect(crumb(page)).toHaveText('Forge › Props');
      await expect(page.locator('.fx-menu ul.fx-menu-list')).toHaveClass(/(^|\s)is-grid(\s|$)/);
      // R7-A (the rendered pass's case 8): `?floor`'s blank floor is not an archive, so the palette starts empty and the
      // screen has no cell ("No props on this palette"). Right on Palette (the cursor's first row) loads the palette's next
      // archive; its props are the cells once it has loaded (its status line), read at the next press.
      await expect(onRow(page)).toHaveAttribute('data-forge-menu-row', 'props-palette');
      await press(page, RIGHT);
      await expect(page.locator('.fx-status-msg')).toHaveText(/\(\w+\): \d+ props/, { timeout: 120_000 });
      await press(page, DOWN);
      await press(page, DOWN);                                          // past Palette and Show to the first cell
      const cell = onRow(page);
      await expect(cell).toHaveClass(/(^|\s)is-cell(\s|$)/);
      const model = (await cell.locator('.fx-menu-label').innerText()).trim();
      await press(page, CROSS);
      await expect(page.locator('.fx-menu')).toBeHidden();
      await expect(page.locator('.fx-status .fx-cell').first()).toHaveText('PLACE');
      await expect(page.locator('.fx-viewport .fx-legend')).toContainText('Place');
      await menuTo(page, 'props');
      await expect(onRow(page).locator('.fx-menu-value')).toHaveText(model);
    });
  });

  test.describe('a narrow window, 760x800', () => {
    test.use({ viewport: { width: 760, height: 800 } });

    test('the legend shows every prompt of the Select tool on screen, the system\'s glyphs, the Circle red', async ({ page }) => {
      await livePad(page);
      await ready(page);
      const legend = page.locator('.fx-viewport ul.s2u-prompts.fx-legend.is-pad');
      await expect(legend).toBeVisible();
      const prompts = legend.locator('.s2u-prompt');
      const n = await prompts.count();
      expect(n).toBeGreaterThanOrEqual(6);
      for (let i = 0; i < n; i++) {
        const b = (await prompts.nth(i).boundingBox())!;
        expect(b, `prompt ${i} drawn`).not.toBeNull();
        expect(b.x, `prompt ${i} inside on the left`).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width, `prompt ${i} inside on the right`).toBeLessThanOrEqual(760);
      }
      await page.getByRole('button', { name: /team A spawn/ }).click();
      await page.locator('.fx-input').click();
      await page.keyboard.press('Digit1');                              // the Select tool: its legend with a selection
      // The docks are drawers at 760 px (folded): the spawn is selected the pad's way, from the menu's Outliner screen.
      await menuTo(page, 'outliner-screen');
      await press(page, CROSS);
      await press(page, CROSS);
      await expect(page.locator('.fx-menu')).toBeHidden();
      const circle = legend.locator('.s2u-prompt__glyph--circle').first();
      await expect(circle).toBeVisible();
      const stroke = await circle.evaluate((g) => getComputedStyle(g).stroke);
      const red = await page.evaluate(() => {
        const probe = document.createElement('i');
        probe.style.color = 'var(--s2u-glyph-circle)';
        document.body.append(probe);
        const c = getComputedStyle(probe).color;
        probe.remove();
        return c;
      });
      expect(stroke).toBe(red);
      await page.screenshot({ path: test.info().outputPath('forge-legend-760.png') });
    });
  });
});
