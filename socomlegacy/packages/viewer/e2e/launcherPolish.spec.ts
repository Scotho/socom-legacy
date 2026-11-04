import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { releaseVersion } from '../releaseVersion';
import { RAIL_ORDER, expectRailStops, walkRailTo } from './launcherRail';

// Browser launcher adaptation: no game, disc or server is needed for these presentation/navigation checks.
const SAMPLE = '/console?sample';
test.setTimeout(45_000);
test.use({ actionTimeout: 10_000 });
// LR-40 (6): the badge's version is the build's (`../releaseVersion.ts`: the nearest release tag, else the package's), read here
// the same way from the same tree (was: the package's alone, which read v0.1.0 against the release's v0.3.34).
const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as { version: string };
const version = releaseVersion((...args: string[]) => execFileSync('git', args, { cwd: fileURLToPath(new URL('../../..', import.meta.url)), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }), process.env, pkg.version);
const profileOrder = ['Service record', 'Replays', 'Loadouts', 'Profiles', 'Sign out'];
const current = (page: Page) => page.locator('#stage .cx-cat.is-current');
const action = (page: Page, name: string) => page.locator('#stage .cx-item').filter({ has: page.locator('.cx-item__title', { hasText: new RegExp(`^${name}$`) }) });
/** LR-4: a row of a Profile screen drawn in LR-1's row kinds (render/rows.ts), by its label (the side chooser's SEAL / Terrorist). */
const lxRow = (page: Page, name: string) => page.locator('#stage .cx-rlist .cx-r').filter({ has: page.locator('.cx-r__label', { hasText: new RegExp(`^${name}$`) }) });

async function open(page: Page): Promise<void> {
  await page.goto(SAMPLE);
  await expect(current(page)).toHaveAttribute('aria-label', 'Home');
}

async function installStandardPad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false }));
    const pad = { id: 'Launcher acceptance controller', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons };
    (window as unknown as { __launcherPad: typeof pad }).__launcherPad = pad;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
  });
}
/**
 * One tap: the button goes down, comes up on the frame the launcher marks it (`data-press`, CX-54), and the press must be
 * `logical`. The mark is watched in the page, not polled from here: it lives 140 ms, and a hold kept until a backed-off
 * poll saw it ran past the 400 ms repeat (`REPEAT_DELAY`), so a held L1 / R1 stepped the rail more than once.
 */
async function padPress(page: Page, index: number, logical: string): Promise<void> {
  await expect(page.locator('html')).not.toHaveAttribute('data-press');
  const seen = await page.evaluate(async ([i, want]) => {
    const b = (window as unknown as { __launcherPad: { buttons: { pressed: boolean; value: number }[] } }).__launcherPad.buttons[i]!;
    const root = document.documentElement;
    const marks: string[] = [];
    const marked = new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        const mark = root.dataset['press'];
        if (mark === undefined) return;
        marks.push(mark);
        if (mark === want) { observer.disconnect(); resolve(); }
      });
      observer.observe(root, { attributes: true, attributeFilter: ['data-press', 'data-press-phase'] });
      setTimeout(() => { observer.disconnect(); resolve(); }, 3000);
    });
    b.pressed = true; b.value = 1;
    await marked;
    b.pressed = false; b.value = 0;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return marks;
  }, [index, logical] as const);
  expect(seen, `pad button ${index} pressed as ${logical}, once`).toEqual([logical]);
}

test('icon navigation, account disclosure and the single Loadouts entry share the new hierarchy', async ({ page }) => {
  await open(page);
  const categories = page.locator('#stage .cx-cat');
  await expect(categories).toHaveCount(5);
  expect(await categories.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))).toEqual([...RAIL_ORDER]); // LR.R2
  await expect(current(page).locator('.cx-cat__label')).toHaveCSS('opacity', '1');
  for (const label of await page.locator('#stage .cx-cat:not(.is-current) .cx-cat__label').all()) {
    await expect(label).toHaveCSS('opacity', '0');
  }
  await expect(page.getByText(`v${version}`, { exact: true })).toBeVisible();
  await page.locator('.cx-account-menu .cx-player').click();
  await expect(page.locator('.cx-account-menu nav button')).toHaveText(profileOrder);
  await page.locator('.cx-account-menu nav button').filter({ hasText: /^Loadouts$/ }).click();
  await expect(page.locator('#stage h1')).toHaveText('Loadouts');
  await expect(page.locator('#stage .cx-rlist .cx-r__label')).toHaveText(['SEAL', 'Terrorist']);
  await lxRow(page, 'Terrorist').hover();
  await expect(lxRow(page, 'Terrorist')).toHaveClass(/is-focused/);
  await expect(page).toHaveURL(/\/profile\/armory\?sample$/);
  await page.locator('#stage .cx-back').click();
  await expect(current(page)).toHaveAttribute('aria-label', 'Profile');
  await expect(page.locator('#stage .cx-item__title')).toHaveText(profileOrder);
  await action(page, 'Replays').click();
  await expect(page.locator('#stage h1')).toHaveText('Your matches');
  await page.locator('#stage .cx-back').click();
  await expect(current(page)).toHaveAttribute('aria-label', 'Profile');
});

test('the account menu survives a redraw and dismisses on Escape, outside click and selection', async ({ page }) => {
  await open(page);
  const toggle = page.locator('.cx-account-menu .cx-player');
  const menu = page.locator('.cx-account-menu nav');
  await toggle.click();
  await expect(menu).toBeVisible();
  await page.setViewportSize({ width: 1281, height: 720 });
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(current(page)).toHaveAttribute('aria-label', 'Home');
  await toggle.click();
  await page.locator('.cx-brand').click();
  await expect(menu).toBeHidden();
  await toggle.click();
  await menu.getByRole('button', { name: 'Replays', exact: true }).click();
  await expect(menu).toBeHidden();
  await expect(page.locator('#stage h1')).toHaveText('Your matches');
});

test('the current category sits at the window\'s centre (LR-34, was the mockup\'s 36%), the list\'s icons under it; navigation stops at either end', async ({ page }) => {
  // LR-34 (LR.R28): the anchor is the window's centre now (was 36%, in the text below).
  // LR-23 (LR.R22, "adopted wholesale", no repositioning from the mockup): the current category's column at the centre of the
  // window (S2 Launcher v2.dc.html line 49, `left:36%`) and the list's 66px icon column centred under it (line 60,
  // `left:calc(36% - 33px)`), no readout beside it. Was (LP.R13 / LP.R15): the rail centred on the window and the list and
  // the right panel centred as a group.
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page);
  const centered = async (): Promise<void> => {
    await expect.poll(async () => {
      const icon = await current(page).locator('.cx-ico').boundingBox();
      return Math.abs(icon!.x + icon!.width / 2 - 0.5 * 1280);
    }).toBeLessThan(2);
    await expect(current(page).locator('.cx-cat__label')).toHaveCSS('opacity', '1');
    const select = page.locator('#legend .cx-prompts [data-b="cross"] .cx-label');
    if (await select.count()) await expect(select).toHaveText(/^(Select|Play SOCOM II)$/); // Play's Cross launches (LR-23); inert experiment rows have none.
  };
  await centered();
  await expect(page.locator('.cx-home__body .cx-readout')).toHaveCount(0);
  const icon = await page.locator('.cx-home__body .cx-list .cx-item__icon').first().boundingBox();
  expect(Math.abs(icon!.x + icon!.width / 2 - 0.5 * 1280)).toBeLessThan(2);
  // LR.R2: every category left of Home, then every one to its right, centred at each step; LR.R3: both ends stop.
  const home = RAIL_ORDER.indexOf('Home');
  for (const name of RAIL_ORDER.slice(0, home).reverse()) {
    await page.keyboard.press('q');
    await expect(current(page)).toHaveAttribute('aria-label', name);
    await centered();
  }
  await expectRailStops(page, 'left');
  await expectRailStops(page, 'left', () => page.keyboard.press('ArrowLeft'));
  for (const name of RAIL_ORDER.slice(1)) {
    await page.keyboard.press('e');
    await expect(current(page)).toHaveAttribute('aria-label', name);
    await centered();
  }
  await expectRailStops(page, 'right');
  await expectRailStops(page, 'right', () => page.keyboard.press('ArrowRight'));
  await walkRailTo(page, 'Profile');
  const profiles = await action(page, 'Profiles').boundingBox();
  const signout = await action(page, 'Sign out').boundingBox();
  expect(signout!.y - profiles!.y - profiles!.height).toBeLessThan(60);
});

test('equipment cues distinguish a missing disc or controller from optional microphone status and collapse to icons on mobile', async ({ page }) => {
  await open(page);
  // LR-24 (LR.R23 (b)): the bottom row's three round marks, their state in the dot (`data-tone`) and the status class
  // (was: the device marks `[data-device]` with their labels, the chip with its words).
  const pad = page.locator('#legend .cx-mark[data-mark="pad"]');
  const mic = page.locator('#legend .cx-mark[data-mark="mic"]');
  const disc = page.locator('#legend .cx-mark[data-mark="disc"]');
  await expect(pad).toHaveClass(/cx-status--ready/);
  await expect(disc).toHaveClass(/cx-status--ready/);
  await expect(mic).toHaveClass(/cx-status--warning/);
  await page.keyboard.press('p');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.keyboard.press('p');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(pad).toHaveClass(/cx-status--danger/);
  await expect(disc).toHaveClass(/cx-status--danger/);
  // LR-23 (LR.R22): no panel and no dot on Home (was LR-13's disc check, not ok, and Play's yellow dot): Play's Cross names
  // what it needs, the chip above its status.
  await expect(page.locator('#stage .cx-item__dot')).toHaveCount(0);
  await expect(page.locator('#legend .cx-prompts [data-b="cross"] .cx-label')).toHaveText('Play SOCOM II: disc needed');
  // The dots: the missing controller the gold (warn), the optional microphone off at 28% white (was: the icons' colours).
  const dots = await page.locator('#legend .cx-marks .cx-mark__dot').evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
  expect(dots[1]).not.toBe(dots[2]);
  await expect(pad).toHaveAttribute('data-tone', 'warn');
  await expect(mic).toHaveAttribute('data-tone', 'off');
  await page.setViewportSize({ width: 412, height: 915 });
  // No word is drawn at any size (was: the labels hidden on mobile only). LR-26: the line the mark keeps for a reader is `.sr-only`
  // (1 x 1 px, clipped), which Playwright's `toBeHidden` counts as visible (a non-empty box): read the drawn box instead.
  const drawn = await disc.locator('.cx-mark__text').evaluate((el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height, pos: getComputedStyle(el).position }; });
  expect(drawn.w <= 1 && drawn.h <= 1 && drawn.pos === 'absolute').toBe(true);
  await expect(pad).toHaveAttribute('aria-label', /controller/i);
  await expect(mic).toHaveAttribute('aria-label', /optional/i);
});

test('native Tab visits the selected category without scrolling the clipped rail away from center', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await open(page);
  const reached: string[] = [];
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    const focusedCategory = await page.locator('#stage .cx-cat:focus').count();
    if (!focusedCategory) continue;
    reached.push((await page.locator('#stage .cx-cat:focus').getAttribute('aria-label'))!);
    await expect(page.locator('#stage .cx-cat:focus')).toHaveAttribute('aria-current', 'true', { timeout: 3000 });
    // LR-38 (LR.R31): the phone rail is its own sideways scroller and centres the current category by scrolling it, so its
    // scrollLeft is no longer 0 (was: the translated track's, never scrolled); the centre below is the check.
    const centerError = async () => page.locator('.cx-crossbar').evaluate((rail) => {
      const box = rail.getBoundingClientRect();
      const icon = rail.querySelector('.cx-cat.is-current .cx-ico')!.getBoundingClientRect();
      return Math.abs((icon.left + icon.right - box.left - box.right) / 2);
    });
    await expect.poll(centerError, { timeout: 3000 }).toBeLessThan(2);
    if (reached.length === 5) break;
  }
  expect(reached).toEqual([...RAIL_ORDER]); // LR.R2: the DOM order is the rail's
});

test('Settings owns app installation and storage; nested backs have no duplicate eyebrow', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('#stage .cx-item__title')).toHaveText(['Game', 'Launcher', 'Theme']);
  await action(page, 'Launcher').click();
  await expect(page.locator('#stage .cx-tabs')).toBeVisible();
  await expect(page.locator('#stage .cx-screenhead .cx-eyebrow')).toHaveCount(0);
  await expect(page.locator('#stage .cx-back__pad')).toHaveCount(0);
  await page.locator('#stage .cx-tabs').getByRole('button', { name: 'App', exact: true }).click();
  await expect(page.locator('#stage [data-act="optrow"]').filter({ hasText: 'Remove downloaded content' })).toBeVisible();   // LR-5: LR-1's rows
  await page.locator('#stage [data-act="optrow"]').filter({ hasText: 'Install app' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Install app');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('#stage .cx-back').click();
  await walkRailTo(page, 'Home'); // LR.R2: Home is right of Settings
  await expect(page.locator('#stage .cx-item__title').filter({ hasText: 'Install app' })).toHaveCount(0);
});

// LR-23 (LR.R22, the owner: "they don't include extra subtitles"): Home's rows draw no line under their title at any
// size -- the line is visually hidden (a reader still hears it); was LR-21 (P8): every line drawn, 0.7 idle and 1 lit.
test('idle row titles center on their icons, no description drawn under them (read, not shown), reduced motion is respected', async ({ page }) => {
  await open(page);
  await page.mouse.move(5, 5);
  await expect(page.locator('.cx-version')).not.toHaveCSS('animation-name', 'none');
  const row = action(page, 'Server status');                             // an idle Home row
  const subtitle = row.locator('.cx-item__sub');
  const hidden = async (): Promise<boolean> => subtitle.evaluate((el) => { const b = el.getBoundingClientRect(); return b.width <= 1 && b.height <= 1 && getComputedStyle(el).position === 'absolute'; });
  expect(await hidden()).toBe(true);
  await expect(subtitle).not.toHaveText('');                             // the line is there for a reader
  const centers = await row.evaluate((el) => {
    const icon = el.querySelector('.cx-item__icon')!.getBoundingClientRect();
    const title = el.querySelector('.cx-item__title')!.getBoundingClientRect();
    return { icon: (icon.top + icon.bottom) / 2, title: (title.top + title.bottom) / 2 };
  });
  expect(Math.abs(centers.icon - centers.title)).toBeLessThan(3);
  await row.hover();
  expect(await hidden()).toBe(true);
  await expect.poll(async () => row.evaluate((el) => {
    const icon = el.querySelector('.cx-item__icon')!.getBoundingClientRect();
    const title = el.querySelector('.cx-item__title')!.getBoundingClientRect();
    return Math.abs((icon.top + icon.bottom - title.top - title.bottom) / 2);
  })).toBeLessThan(3);
  await page.mouse.move(5, 5);
  // LR-26 (LR.R22 / LR-24): above the phone rule Home's list slides by the focused row, so the hover above moved no focus
  // (`input.ts` `mouseover`); the focus is still on Play, the first row. One Down lands on Server status (LR-37 (4): the
  // Memory card row gone) and makes the mode the pad's. Was: the hover had moved the focus to Server status and one Up landed on Memory card.
  await expect(action(page, 'Play SOCOM II')).toHaveClass(/is-focused/);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('html')).toHaveAttribute('data-input', 'pad');
  const focusedRow = action(page, 'Server status');
  await expect(focusedRow).toHaveClass(/is-focused/);
  expect(await focusedRow.locator('.cx-item__sub').evaluate((el) => el.getBoundingClientRect().height <= 1)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.cx-home__body .cx-list')).toHaveCSS('transition-duration', '0s');
  await expect(page.locator('.cx-version')).toHaveCSS('animation-name', 'none');
  await expect(current(page).locator('.cx-cat__label')).toHaveCSS('transition-duration', '0s');
});

test('face buttons, shoulders and D-pad hints bump on their actions and stay still with reduced motion', async ({ page }) => {
  await installStandardPad(page);
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __glyphBumps: string[] }).__glyphBumps = seen;
    document.addEventListener('animationstart', (event) => {
      const e = event as AnimationEvent;
      if (!e.animationName.startsWith('cx-glyph-bump-')) return;
      const glyph = e.target as HTMLElement;
      seen.push(glyph.dataset['menuGlyph'] ?? glyph.dataset['menuAxis'] ?? '');
    });
  });
  await page.goto('/settings/audio?sample');
  await expect(page.locator('#stage h1')).toHaveText('Audio');
  // Sign out in sample state so Triangle opens the keyboard, where all four face-button hints are present.
  await page.keyboard.press('p');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.keyboard.press('t');
  await expect(page.locator('#overlay .cx-dialog__title')).toHaveText('Sign in');
  const bumps = () => page.evaluate(() => (window as unknown as { __glyphBumps: string[] }).__glyphBumps);
  for (const [index, logical, glyph] of [[0, 'cross', 'cross'], [3, 'triangle', 'triangle'], [2, 'square', 'square'], [1, 'circle', 'circle'], [5, 'r1', 'r1'], [5, 'r1', 'r1'], [4, 'l1', 'l1'], [15, 'right', 'h']] as const) {
    const before = (await bumps()).length;
    await padPress(page, index, logical);
    await expect.poll(async () => (await bumps()).slice(before)).toContain(glyph);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.keyboard.press('e');
  await expect(page.locator('#legend [data-menu-glyph="r1"]')).toHaveCSS('animation-name', 'none');
});

for (const [width, height] of [[1280, 720], [1920, 1080], [412, 915]] as const) {
  test(`header, Home's list and account menu fit at ${width}x${height} (LR.R22: no right panel)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByText(`v${version}`, { exact: true })).toBeVisible();
    await expect(page.locator('header .cx-lampword')).toHaveCount(0);
    if (width > 760) {
      // LR-23 (LR.R22): Home has no right panel (was: the readout fitting above the legend); its list ends above the legend.
      await expect(page.locator('.cx-readout')).toHaveCount(0);
      // LR-24 (the box's matrix-4 at 97f5822e3: 'y' of null): the last row DRAWN -- Discord's row is hidden above the phone
      // rule (its stop is the header's icon, LATER 291), so its box is null (was: the last li).
      const last = await page.locator('.cx-home__body .cx-list > li').filter({ visible: true }).last().boundingBox();
      const footer = await page.locator('#legend').boundingBox();
      expect(last!.y + last!.height).toBeLessThan(footer!.y);
    }
    await page.locator('.cx-account-menu .cx-player').click();
    const menu = await page.locator('.cx-account-menu nav').boundingBox();
    expect(menu).not.toBeNull();
    expect(menu!.x).toBeGreaterThanOrEqual(0);
    expect(menu!.x + menu!.width).toBeLessThanOrEqual(width);
    await page.locator('.cx-account-menu .cx-player').click();
    await page.screenshot({ path: testInfo.outputPath(`launcher-${width}.png`), fullPage: true });
  });
}

for (const [width, height] of [[390, 844], [360, 640], [844, 390]] as const) {
  test(`sign-in fits at ${width}x${height}, with its focused controller key and touch close reachable`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page.keyboard.press('p');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await page.keyboard.press('t');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await testInfo.attach('dialog-layout', { contentType: 'application/json', body: JSON.stringify(await dialog.evaluate((el) => ({
      dialog: el.getBoundingClientRect().toJSON(), width: getComputedStyle(el).width, maxWidth: getComputedStyle(el).maxWidth,
      scrim: el.parentElement!.getBoundingClientRect().toJSON(), columns: getComputedStyle(el.parentElement!).gridTemplateColumns,
    }))) });
    const box = (await dialog.boundingBox())!;
    if (width <= 760) expect(box.width).toBeGreaterThanOrEqual(width - 32); // Phone keyboards use the available width.
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => page.locator('#overlay .is-focused').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`signin-${width}x${height}.png`), fullPage: true });
    await dialog.locator('.cx-dialog__close').click();
    await expect(dialog).toHaveCount(0);
  });
}

for (const [width, height] of [[1280, 720], [390, 844]] as const) {
  test(`a standard controller reaches launcher menus, nested settings and safe modal actions at ${width}x${height}`, async ({ page }) => {
    test.setTimeout(90_000);
    await installStandardPad(page);
    await page.setViewportSize({ width, height });
    await open(page);
    const press = (index: number, logical: string) => padPress(page, index, logical);
    const cross = () => press(0, 'cross'); const circle = () => press(1, 'circle');
    const down = () => press(13, 'down'); const next = () => press(5, 'r1'); const prev = () => press(4, 'l1');
    const shoulder = (dir: -1 | 1) => (dir < 0 ? prev() : next());
    await walkRailTo(page, 'Settings', shoulder); await cross();
    await expect(page.locator('#stage h1')).toHaveText('Display');
    const value = page.locator('#stage [data-act="optrow"].is-focused').locator('.cx-r__choice, .cx-r__ctl .cx-r__value');   // LR-5
    const before = await value.textContent();
    await press(15, 'right'); await expect(value).not.toHaveText(before!);
    await next(); await expect(page.locator('#stage h1')).toHaveText('Audio');
    // Layout A (#595; the owner's H363, "Confirm layout A" / "Layout A as is"; LR.R31): Settings is Game, Launcher, Theme,
    // and Launcher opens on Controller (was: Down from System Settings to App). This page is the sample adapters, whose
    // categories carry no family, so their tabs stay the adapter's one strip (`optTabs`, src/console/state.ts: Display,
    // Audio, Controller, Network, Account, App, Appearance) -- R1 three times to App; the live adapter's Launcher tabs
    // (Controller, Appearance, App, ...) are test/console/lr2LauncherWalk.test.ts's. App is at the same depth as before,
    // so the circles below back out as they did.
    await circle(); await circle(); await down(); await cross(); // Rows -> Settings tabs -> launcher menu -> Launcher.
    await expect(page.locator('#stage h1')).toHaveText('Controller');
    await next(); await expect(page.locator('#stage h1')).toHaveText('Network');
    await next(); await expect(page.locator('#stage h1')).toHaveText('Account');
    await next(); await expect(page.locator('#stage h1')).toHaveText('App');
    await cross(); await expect(page.getByRole('dialog')).toContainText('Install app');
    await circle(); await circle(); await circle(); // Close install, leave rows, leave Settings.
    await walkRailTo(page, 'Profile', shoulder);
    await down(); await cross();
    await expect(page.locator('#stage h1')).toHaveText('Your matches');
    await press(2, 'square'); await circle(); await down(); await cross();
    await expect(page.locator('#stage .cx-rlist .cx-r__label')).toHaveText(['SEAL', 'Terrorist']);
    await down(); await cross();
    await expect(lxRow(page, 'Terrorist')).toHaveClass(/is-focused/); // Sample adapters have no account loadout store.
    await circle(); await down(); await down(); await cross();
    await expect(page.getByRole('dialog')).toContainText('Sign out');
    await cross(); // No is the safe initial selection.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await walkRailTo(page, 'Online', shoulder);
    await cross(); await expect(page.locator('#stage h1')).toHaveText('Browse rooms');
    // LR-37 (6, 7, 9): Online is Browse rooms (the custom matches inside it), Server Information, Sign In; no Server news
    // row (its news is the Server screen's), no Custom matches row.
    await down(); await circle(); await down(); await cross(); await expect(page.locator('#stage h1')).toHaveText('Server Information');
    await circle(); await walkRailTo(page, 'Experiments', shoulder);
    await down(); await expect(action(page, 'Test room')).toHaveClass(/is-focused/);
    await walkRailTo(page, 'Home', shoulder);
    await expect(page.locator('.cx-account-menu nav')).toBeHidden();
  });
}
