import { expect, test, type Page } from '@playwright/test';
import { RAIL_ORDER, expectRailStops, walkRailTo } from './launcherRail';

/**
 * The console launcher page (`/console`; the S2U Briefing design system's "Console launcher", CX-7's browser half): what
 * only a browser shows of it -- the controller grammar driven by the keyboard map (a development build's, OT.R29: the run's
 * dev server is one), the input mode on `<html data-input>`, the patched-in-place screens, the fit rule's root
 * font-size and no horizontal scroll at the two reference sizes, and the live page's honest empty states with no server
 * behind it. A browser adaptation with no original (the project's own launcher page, OT.R28): nothing of the game runs.
 *
 * The sample cases open `/console?sample` (the prototype's sample adapters, `src/console/sampleAdapters.ts`: the same
 * rooms, values and persona every run); the live case opens `/console` against the run's dev server, which answers the
 * lobby's routes 404 (no match server is started). Each case uses the `page` fixture alone (no `browser.newContext`,
 * so nothing to register with `OpenedContexts`); the viewports are set on that page. The keys are the prototype's map:
 * arrows the D-pad, Enter Cross, Escape Circle, F Square, T Triangle, Q / E L1 / R1, O the OPTIONS button, P the
 * prototype's states panel.
 */
const SAMPLE = '/console?sample';
/** The rail's resting opacity for a category that is not current: console.css `.cx-cat { opacity: 0.34 }` (LR-1; the current is 1). */
const RAIL_REST_OPACITY = 0.34;
const LIVE = '/console';
/** CX-9a (CX.R8, the owner, 2026-10-12: the console "becomes the new launcher default"): the base path is the console's. */
const ROOT = '/';

/** The page up and drawn: the crossbar's current category is there. */
async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.locator('#stage .cx-cat.is-current')).toHaveCount(1);
}
const current = (page: Page) => page.locator('#stage .cx-cat.is-current .cx-cat__label');
const titles = (page: Page) => page.locator('#stage .cx-item__title');
/**
 * LR-24 (LR.R23 (b)): the Disc step is the bottom row's disc mark (the mockup's round mark with its dot): its word and
 * line in a visually hidden span (`.cx-mark__word`, `.cx-mark__line`), CX-16's name in its aria-label; a click on it
 * opens the disc source's menu (no cog), an option there the source and its chooser. Was (LR-23): the legend's status
 * chip (`.cx-chip`, its word drawn) and its cog beside it (`.cx-chipsrc .cx-srcbtn`); (LR-13) Play's panel's disc check.
 */
const chip = (page: Page) => page.locator('#legend .cx-mark[data-mark="disc"]');
const chipCog = chip;

/** The prototype's states panel (sample adapters only): flips row `i` (0 the disc, 1 the sign-in, 2 the pad), then closes. */
async function flip(page: Page, i: number): Promise<void> {
  await page.keyboard.press('p');
  await expect(page.locator('#overlay .cx-toggle')).toHaveCount(3);
  for (let k = 0; k < i; k++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.locator('#overlay .cx-dialog')).toHaveCount(0);
}

test.describe('the console launcher (sample adapters)', () => {
  test('the crossbar: L1 / R1 move the category and the list swaps; one focus; the input mode follows the device', async ({ page }) => {
    await open(page, SAMPLE);
    await expect(page.locator('html')).toHaveAttribute('data-input', 'pointer');
    await expect(current(page)).toHaveText('Home');
    await expect(titles(page).first()).toHaveText('Play SOCOM II');                  // LR-13 (LR.R17)
    await walkRailTo(page, 'Online');                                       // R1: Online is right of Home (LR.R2)
    await expect(current(page)).toHaveText('Online');
    await expect(titles(page).first()).toHaveText('Browse rooms');
    await expect(page.locator('html')).toHaveAttribute('data-input', 'pad');
    await expect(page.locator('#stage .is-focused')).toHaveCount(1);
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#stage .cx-item.is-focused .cx-item__title')).toHaveText('Server Information');   // LR-37 (7): Browse rooms, Server Information, Sign In
    await walkRailTo(page, 'Home');                                         // L1: back to Home
    await expect(current(page)).toHaveText('Home');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Profile', exact: true }).click(); // a click on a neighboring category makes it current
    await expect(page.locator('html')).toHaveAttribute('data-input', 'pointer');
    await expect(current(page)).toHaveText('Profile');
    await expect(page.locator('#stage .is-focused')).toHaveCount(1);
  });

  test('Browse rooms: Cross opens it, the D-pad walks the rows, Cross picks and clears the launch target, Circle returns', async ({ page }) => {
    await open(page, SAMPLE);
    await walkRailTo(page, 'Online');
    await page.keyboard.press('Enter');                                     // Browse rooms
    await expect(page.locator('#stage h1.cx-title')).toHaveText('Browse rooms');
    const focused = page.locator('#stage .cx-room.is-focused .cx-room__name');
    await expect(focused).toHaveText('Bravo');                              // the prototype opens on its second row
    await page.keyboard.press('ArrowDown');
    await expect(focused).toHaveText('Charlie');
    await expect(page.locator('#stage .is-focused')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(page.locator('#stage .cx-room.is-selected .cx-room__name')).toHaveText('Charlie');
    await expect(page.locator('#legend .cx-start')).toHaveText('Launch · Charlie');
    await page.keyboard.press('Enter');
    await expect(page.locator('#stage .cx-room.is-selected')).toHaveCount(0);
    await expect(page.locator('#legend .cx-start')).toHaveText('Start game');
    await page.keyboard.press('Escape');
    await expect(page.locator('#stage .cx-crossbar')).toHaveCount(1);
    await expect(current(page)).toHaveText('Online');
  });

  test('Options: a roller steps with right / left, Square resets it, the aside names it', async ({ page }) => {
    await open(page, SAMPLE);
    await walkRailTo(page, 'Settings');                                     // LR.R2: Settings is left of Home
    await expect(current(page)).toHaveText('Settings');
    await page.keyboard.press('Enter');                                     // Display
    await expect(page.locator('#stage h1.cx-title')).toHaveText('Display');
    const value = page.locator('#stage [data-act="optrow"].is-focused .cx-r__choice');   // LR-5: a choice is LR-1's select row
    await expect(page.locator('#stage .cx-aside .cx-readout__head')).toHaveText('Internal resolution');
    await expect(value).toHaveText('3× · 1080p');
    await page.keyboard.press('ArrowRight');
    await expect(value).toHaveText('4× · 1440p');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(value).toHaveText('2× · 720p');
    await expect(page.locator('#stage .cx-aside__note')).toContainText('Default: 3× · 1080p.');
    await page.keyboard.press('f');                                         // Square: reset
    await expect(value).toHaveText('3× · 1080p');
    await expect(page.locator('#toast .cx-toast')).toHaveText('Internal resolution reset to 3× · 1080p');
  });

  test('CX-11: at 1600x600 the Options list scrolls inside the stage: the pad keeps the focused row in view, the wheel scrolls it, a re-render keeps it', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 600 });               // the fit rule's floor (0.8): seven rollers overflow
    await open(page, SAMPLE);
    await walkRailTo(page, 'Settings');
    await page.keyboard.press('Enter');                                     // Display: seven rollers
    await expect(page.locator('#stage h1.cx-title')).toHaveText('Display');
    const rows = page.locator('#stage .cx-rows');
    const box = await rows.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight, oy: getComputedStyle(el).overflowY }));
    expect(box.oy).toBe('auto');
    expect(box.sh).toBeGreaterThan(box.ch);                                 // the list does overflow at this size
    const stageTop = () => page.locator('#stage').evaluate((el) => el.getBoundingClientRect().top);
    const top0 = await stageTop();
    const scrollTop = () => rows.evaluate((el) => el.scrollTop);
    const inside = () => page.evaluate(() => {
      const list = document.querySelector('#stage .cx-rows')!.getBoundingClientRect();
      const row = document.querySelector('#stage [data-act="optrow"].is-focused')!.getBoundingClientRect();
      return row.top >= list.top - 0.5 && row.bottom <= list.bottom + 0.5;
    });
    for (let k = 0; k < 6; k++) await page.keyboard.press('ArrowDown');
    await expect(page.locator('#stage .cx-aside .cx-readout__head')).toHaveText('Backdrop motion');
    expect(await inside()).toBe(true);                                      // the last row brought into view
    expect(await scrollTop()).toBeGreaterThan(0);
    expect(await stageTop()).toBe(top0);                                    // the list scrolled, not the stage
    await rows.hover();                                                     // a mouseover: no pointerdown, the mode stays pad
    await page.mouse.wheel(0, -2000);
    await expect.poll(scrollTop).toBe(0);                                   // the wheel scrolls the list
    await page.keyboard.press('ArrowLeft');                                 // a re-render with the same row focused
    await expect(page.locator('#stage [data-act="optrow"].is-focused')).toHaveAttribute('aria-checked', 'false');   // LR-5: the toggle's Off
    expect(await scrollTop()).toBe(0);                                      // patched in place: the scroll is kept
    await page.keyboard.press('ArrowUp');                                   // a move: the focused row kept in view again
    expect(await inside()).toBe(true);
    expect(await stageTop()).toBe(top0);
  });

  test('sign-in: Triangle signed out opens the dialog on the keyboard; Circle closes it and the focus returns', async ({ page }) => {
    await open(page, SAMPLE);
    await flip(page, 1);                                                    // signed out
    await expect(page.locator('#header .cx-player__name')).toHaveText('Sign in');
    await page.keyboard.press('t');
    await expect(page.locator('#overlay .cx-dialog__title')).toHaveText('Sign in');
    await expect(page.locator(':focus')).toHaveClass(/cx-osk__key/);
    await expect(page.locator(':focus')).toHaveText('t');                   // the prototype's start key, row 1 column 4
    await expect(page.locator('#legend .cx-cluster')).toHaveCount(0);        // under the keyboard the cluster hides
    await page.keyboard.press('Escape');
    await expect(page.locator('#overlay .cx-dialog')).toHaveCount(0);
    await expect(page.locator(':focus')).toHaveClass(/cx-item/);
    await expect(page.locator('#stage .cx-item.is-focused')).toBeFocused();
  });

  test('START with no disc is blocked: the OPTIONS button shows the legend\'s one warn line', async ({ page }) => {
    await open(page, SAMPLE);
    await flip(page, 0);                                                    // the disc out
    await expect(chip(page)).toHaveClass(/is-empty/);                     // LR-24: the disc mark (was: the chip)
    await page.keyboard.press('o');
    await expect(page.locator('#legend .cx-legend__error')).toHaveText('Choose your disc image first: Cross on Play, or the disc mark.');   // LR-24 (was: Home, then Disc)
    // LR-23 (LR.R22, "Start game, gone"): Home draws no START pill (was: its aria-disabled "true"); Play's Cross names the need.
    await expect(page.locator('#legend .cx-start')).toHaveCount(0);
    await expect(page.locator('#legend .cx-prompt').first()).toContainText('Play SOCOM II: disc needed');
    await expect(page.locator('#overlay .cx-launch')).toHaveCount(0);
  });

  test('CX-16: one disc control with a settings icon; Square opens the source dropdown; Disc folder made the source, the chip reads the sample folder', async ({ page }) => {
    await open(page, SAMPLE);
    // LR-23 (LR.R22): Home's list is Play / Server status / Discord (LR-37 (4): the Memory card gone), no sub-lines drawn; the Disc step is the
    // legend's chip, its cog beside it (was LR-13: Play's panel's disc check and its cog, reached by Cross and three Ups).
    await expect(titles(page)).toHaveText(['Play SOCOM II', 'Server status', 'Discord', 'GitHub']);   // no second folder action; Discord is LATER 291
    const gear = chipCog(page);
    await expect(gear).toHaveCount(1);
    await expect(gear).toBeVisible();
    await expect(gear).toHaveAttribute('aria-label', /Disc source: DISC ISO/);   // LR-24: the mark's name holds CX-16's (was: the cog's whole name)
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');                                   // the pad's focus on Play
    await expect(page.locator('#legend .cx-prompt').first()).toContainText('Play');
    await page.keyboard.press('f');                                         // Square on Play: the chip's cog
    const opts = page.locator('#legend .cx-srcopt');
    await expect(opts).toHaveText(['DISC ISO', 'RETAIL DISC']);
    await expect(opts.nth(0)).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#legend .cx-prompt').first()).toContainText('Choose');
    await page.keyboard.press('ArrowDown');
    // LR-24: the folder becomes the source and its chooser opens, the sample folder (was LR-23: the source alone, the
    // chip's click after it the chooser; the sample image kept "Disc ready" in between).
    await page.keyboard.press('Enter');
    await expect(opts).toHaveCount(0);
    await expect(gear).toHaveAttribute('aria-label', /Disc source: RETAIL DISC/);
    await expect(chip(page)).toHaveClass(/is-reading/);
    // The sample folder (SAMPLE DATA, `src/console/sampleAdapters.ts` SAMPLE_FOLDER) reads in the prototype's 1.2 s.
    await expect(chip(page).locator('.cx-mark__word')).toHaveText('Disc ready');
    await expect(chip(page).locator('.cx-mark__line')).toHaveText('the disc folder SOCOM2');
    await expect(page.locator('#toast .cx-toast')).toHaveText('Disc ready: SOCOM2');
    await expect(page.locator('#legend .cx-prompt').first()).toContainText('Play');   // Cross's verb on Play, ready
    // The pointer: a click on the mark opens the dropdown, a click on an option picks it.
    await gear.click();
    await page.locator('#legend .cx-srcopt').nth(0).click();
    await expect(gear).toHaveAttribute('aria-label', /Disc source: DISC ISO/);
  });

  test('CX-16 / LR-24: at 390x844 the disc mark is the menu\'s control, inside the viewport', async ({ page }) => {
    // LR-24 (LR.R23 (b)): no cog; the mark itself (was LR-23: the cog to the chip's right).
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, SAMPLE);
    const gear = chipCog(page);
    await expect(gear).toBeVisible();
    await expect(page.locator('#legend .cx-srcbtn')).toHaveCount(0);
    const g = (await gear.boundingBox())!;
    expect(g.x).toBeGreaterThanOrEqual(0);
    expect(g.x + g.width).toBeLessThanOrEqual(390);
  });

  for (const [w, h] of [[1280, 720], [1024, 768], [390, 844]] as const) {
    test(`CX-19 / LR-24: at ${w}x${h} the legend's disc mark opens the dropdown upward, inside the window, and closes it`, async ({ page }) => {
      // LR-24 (LR.R23 (b)): the mockup's round disc mark (40px, its 8px dot) is the control (was LR-23: the cog beside the chip).
      // LR-23 (LR.R22, "The bottom row? the new mockup UI"): the cog left the Disc row's split box (CX-19, then LR-13's disc
      // check in Play's panel, both gone) for the legend's bar, beside the status chip; its states and dropdown are CX-19's.
      // Was: the split box's geometry (the cog inside the row's frame, the divider, the lit ::after frame) -- no split box
      // is drawn on the launcher page any more (the overlay's Disc item keeps it, over a game page only).
      await page.setViewportSize({ width: w, height: h });
      await open(page, SAMPLE);
      const cog = chipCog(page);
      await expect(cog).toBeVisible();
      await expect(cog.locator('.cx-mark__dot')).toHaveCount(1);                       // was: the cog's hub (icons.ts P.cog)
      const c = (await cog.boundingBox())!;
      expect(Math.round(c.width)).toBe(40);                                            // the mockup's 40px round mark
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x + c.width).toBeLessThanOrEqual(w);
      expect(c.y + c.height).toBeLessThanOrEqual(h);
      await cog.click();
      const menu = page.locator('#legend .cx-srcmenu');
      await expect(page.locator('#legend .cx-srcopt')).toHaveText(['DISC ISO', 'RETAIL DISC']);
      await expect(cog).toHaveClass(/is-open/);
      const m = (await menu.boundingBox())!;
      expect(m.y + m.height, 'the dropdown opens upward, over the bar').toBeLessThanOrEqual(c.y + 0.5);
      expect(m.y).toBeGreaterThanOrEqual(0);
      expect(m.x + m.width).toBeLessThanOrEqual(w);
      await cog.click();
      await expect(page.locator('#legend .cx-srcopt')).toHaveCount(0);
      await expect(cog).not.toHaveClass(/is-open/);
    });
  }

  for (const [w, h] of [[1280, 720], [1024, 768], [834, 1112]] as const) {
    test(`CX-17 / LR-24: at ${w}x${h}, the rail draws no L1 / R1 chips; every category is a click target; L1 / R1 still step it`, async ({ page }) => {
      // LR-24 (LR.R23 (a), the dispatcher's reading of LR.R22; the owner may overturn): the mockup draws no chips, so the
      // page's rail has none and its strip neither clips nor fades. Was (CX-17, LP.R13): no category drawn under a chip,
      // the strip between the two hints, walked end to end with the arrows.
      await page.setViewportSize({ width: w, height: h });
      await open(page, SAMPLE);
      await expect(page.locator('#stage .cx-crossbar__hint')).toHaveCount(0);
      const strip = await page.evaluate(() => {
        const cs = getComputedStyle(document.querySelector('#stage .cx-crossbar__strip')!);
        return { overflow: cs.overflowX, mask: cs.maskImage || cs.webkitMaskImage || 'none' };
      });
      expect(strip).toEqual({ overflow: 'visible', mask: 'none' });
      for (const label of RAIL_ORDER) {
        await page.locator(`#stage .cx-cat[aria-label="${label}"]`).click();
        await expect(current(page)).toHaveText(label);
        await page.waitForTimeout(300);                                     // the track's slide settles
        const cur = await page.evaluate(() => { const b = document.querySelector('#stage .cx-cat.is-current')!.getBoundingClientRect(); return { l: b.left, r: b.right }; });
        expect(cur.l, `${label}: the current category whole in the window`).toBeGreaterThanOrEqual(-0.5);
        expect(cur.r).toBeLessThanOrEqual(w + 0.5);
      }
      await walkRailTo(page, RAIL_ORDER[0]);                                // the left end (LR.R2: Profile)
      for (let k = 1; k < RAIL_ORDER.length; k++) {
        await page.keyboard.press('e');                                     // R1 (the keymap's `e`)
        await expect(current(page)).toHaveText(RAIL_ORDER[k]!);
      }
      for (let k = RAIL_ORDER.length - 2; k >= 0; k--) {
        await page.keyboard.press('q');                                     // L1 (`q`)
        await expect(current(page)).toHaveText(RAIL_ORDER[k]!);
      }
    });
  }

  test('LP.R13: at 390x844 the selected category remains in view; no wrap', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, SAMPLE);
    const arrow = (dir: -1 | 1) => page.keyboard.press(dir < 0 ? 'ArrowLeft' : 'ArrowRight');
    await walkRailTo(page, RAIL_ORDER[RAIL_ORDER.length - 1]!, arrow);     // the right end (LR.R2: Experiments)
    await expectRailStops(page, 'right', arrow);                            // LR.R3: no wrap
    await page.waitForTimeout(250);
    // `offRule`: the categories not at the rail's rule (the current at 1, the others at the resting opacity, console.css).
    const seenNow = () => page.evaluate((rest) => {
      const bar = document.querySelector('#stage .cx-crossbar__strip')!.getBoundingClientRect();
      const cur = document.querySelector('#stage .cx-cat.is-current')!.getBoundingClientRect();
      const offRule = [...document.querySelectorAll('#stage .cx-cat')].filter((c) => Math.abs(Number(getComputedStyle(c).opacity) - (c.classList.contains('is-current') ? 1 : rest)) >= 0.005).length;
      return { inView: cur.left >= bar.left - 1 && cur.right <= bar.right + 1, offRule, scrollX: document.documentElement.scrollWidth <= window.innerWidth };
    }, RAIL_REST_OPACITY);
    await expect.poll(seenNow, { timeout: 3000 }).toEqual({ inView: true, offRule: 0, scrollX: true });
  });

  test('LP.R13: a held R1 reaches the last category and stops; L1 moves back without wrapping', async ({ page }) => {
    // A standard-mapping pad the page polls (the sample adapters read `navigator.getGamepads`): R1 is button 5.
    await page.addInitScript(() => {
      const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false }));
      const pad = { id: 'e2e pad', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons };
      (window as unknown as { __pad: typeof pad }).__pad = pad;
      Object.defineProperty(navigator, 'getGamepads', { value: () => [pad], configurable: true });
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page, SAMPLE);
    await page.evaluate(() => {
      const w = window as unknown as { __seen: string[] };
      w.__seen = [];
      new MutationObserver(() => {
        const t = document.querySelector('#stage .cx-cat.is-current .cx-cat__label')?.textContent ?? '';
        if (t && t !== w.__seen.at(-1)) w.__seen.push(t);
      }).observe(document.getElementById('stage')!, { subtree: true, attributes: true, attributeFilter: ['class'] });
    });
    const r1 = (down: boolean) => page.evaluate((d) => {
      const b = (window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }).__pad.buttons[5]!;
      b.pressed = d;
      b.value = d ? 1 : 0;
    }, down);
    const rightOfHome = RAIL_ORDER.slice(RAIL_ORDER.indexOf('Home') + 1);
    await r1(true);
    // Once at the press, then after 400 ms every 100 ms (input.ts REPEAT_DELAY, REPEAT_EVERY): past the right end.
    await expect.poll(() => page.evaluate(() => (window as unknown as { __seen: string[] }).__seen), { timeout: 3000 })
      .toEqual(expect.arrayContaining(rightOfHome));
    await r1(false);
    const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
    expect(seen).toEqual(rightOfHome);                                      // LR.R2: Online, Experiments; LR.R3: no wrap
    await expectRailStops(page, 'right');
    await walkRailTo(page, RAIL_ORDER[0]);                                  // L1 back to the left end, no wrap on the way
    await expectRailStops(page, 'left');
    // The current icon's growth glides over dur-base: its computed transition names the transform.
    const tr = await page.locator('#stage .cx-cat.is-current .cx-ico').evaluate((e) => getComputedStyle(e).transitionProperty);
    expect(tr).toContain('transform');
  });

  for (const [w, h, px] of [[1440, 900, '12.8px'], [375, 812, '10.71px']] as const) {
    test(`at ${w}x${h}: no horizontal scroll, the root font-size the fit rule's ${px}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await open(page, SAMPLE);
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe(px);
      const fits = (): Promise<boolean> => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      expect(await fits()).toBe(true);
      await walkRailTo(page, 'Online');
      await page.keyboard.press('Enter');                                   // the widest screen: the room table and its drawer
      await expect(page.locator('#stage h1.cx-title')).toHaveText('Browse rooms');
      expect(await fits()).toBe(true);
    });
  }
});

test.describe('the console launcher (live adapters, no server)', () => {
  test('the room list says Server unavailable with its retry; no page error but the server\'s own refusals', async ({ page }) => {
    const errors: string[] = [];
    // The lobby's, the universe's and the account's routes answer 404 on the bare dev server: those are the server's
    // refusals the page reports as "Server unavailable". Anything else is a page error.
    const SERVER = /^https?:\/\/[^/]+\/(rooms|texts|lobby|modern|account|replays)\b/;
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const url = m.location().url ?? '';
      if (SERVER.test(url)) return;                                       // the server's routes, anchored at the origin
      errors.push(`console: ${m.text()} (${url})`);
    });
    await open(page, LIVE);
    await expect(page.locator('#header .cx-proto')).toHaveCount(0);       // no sample marker on the live page
    await walkRailTo(page, 'Online');
    await page.keyboard.press('Enter');                                     // Browse rooms
    const empty = page.locator('#stage .cx-empty');
    await expect(empty).toContainText('Server unavailable');
    await expect(empty).toContainText('Press Square to try again.');
    await expect(page.locator('#stage .cx-room')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(titles(page).first()).toHaveText('Browse rooms');
    await expect(page.locator('#stage .cx-item__sub').first()).toContainText('Server unavailable');
    expect(errors).toEqual([]);
  });
});

test.describe('CX-9a: the console launcher is the base path (CX.R8)', () => {
  test('/ shows the console launcher, as its alias /console does; neither is the old setup page', async ({ page }) => {
    for (const url of [ROOT, LIVE]) {
      await open(page, url);
      await expect(page).toHaveTitle('SOCOM II Legacy Launcher');
      await expect(page.locator('html')).toHaveAttribute('data-console', '');
      await expect(current(page)).toHaveText('Home');
      await expect(page.locator('#disc-page')).toHaveCount(0);                // the old page's setup page (at /setup since CX-9a)
    }
  });
});
