import { expect, test, type Page } from '@playwright/test';

/**
 * LR-38 (the owner, 2026-10-29, the launcher on a phone; a browser adaptation: the launcher's layout, pointer and touch,
 * nothing of the game -- no disc, game or server needed). The rendered half of the unit tests'
 * (`../test/console/lr38{Rail,SignIn,LaunchCheck,Touch}.test.ts`):
 * 1, 2. at the phone rule the page's rail scrolls sideways by itself, draws no bar, the stage never scrolls sideways; a flick
 *    settles on a category (the snap), a tap on one selects it and brings it to the centre;
 * 3. the sign-in fits the visible viewport at portrait and landscape phone sizes: inside the window, centred, no legend
 *    reserve under it, no scrollbar drawn; where it must scroll it takes the whole room first;
 * 4. "Before you deploy" is the mockup's side panel: on the window's right edge, top to bottom, min(660px, 64%) wide (the
 *    window's width on a portrait phone), its type at the mockup's pixels;
 * 5. a slider's track takes a tap and a drag.
 * Each case attaches its numbers and a screenshot for the owner's eye.
 */
const SAMPLE = '/console?sample';
test.setTimeout(45_000);
test.use({ actionTimeout: 10_000 });

const current = (page: Page) => page.locator('#stage .cx-cat.is-current');
async function open(page: Page, path = SAMPLE): Promise<void> {
  await page.goto(path);
  await expect(page.locator('#stage .cx-crossbar, #stage .cx-screen').first()).toBeVisible();
}
/** The current category's centre against the rail strip's, in px (0: centred). */
const offCentre = (page: Page): Promise<number> => page.evaluate(() => {
  const strip = document.querySelector<HTMLElement>('#stage .cx-crossbar__strip')!.getBoundingClientRect();
  const cat = document.querySelector<HTMLElement>('#stage .cx-cat.is-current')!.getBoundingClientRect();
  return Math.abs((cat.left + cat.width / 2) - (strip.left + strip.width / 2));
});

for (const size of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
  test.describe(`LR-38 (1, 2) the phone rail at ${size.width}x${size.height}`, () => {
    test.use({ viewport: size, hasTouch: true, isMobile: true });

    test('the rail scrolls by itself with no bar; the stage never scrolls sideways', async ({ page }, testInfo) => {
      await open(page);
      const m = await page.evaluate(() => {
        const strip = document.querySelector<HTMLElement>('#stage .cx-crossbar__strip')!;
        const stage = document.getElementById('stage')!;
        const cs = getComputedStyle(strip);
        return {
          stripScrolls: strip.scrollWidth > strip.clientWidth + 1, overflowX: cs.overflowX, bar: cs.scrollbarWidth, snap: cs.scrollSnapType,
          stageSideways: stage.scrollWidth > stage.clientWidth + 1, pageSideways: document.documentElement.scrollWidth > innerWidth,
          barHeight: strip.offsetHeight - strip.clientHeight,
        };
      });
      await testInfo.attach('rail', { contentType: 'application/json', body: JSON.stringify(m) });
      expect(m.stripScrolls, 'the five categories overflow the phone and the strip scrolls them').toBe(true);
      expect(m.overflowX).toBe('auto');
      expect(m.bar).toBe('none');
      expect(m.barHeight, 'no scrollbar drawn under the rail').toBe(0);
      expect(m.snap).toContain('mandatory');
      expect(m.stageSideways, 'the stage does not scroll sideways').toBe(false);
      expect(m.pageSideways).toBe(false);
      expect(await offCentre(page), 'Home starts centred').toBeLessThan(3);
      await page.screenshot({ path: testInfo.outputPath(`rail-${size.width}x${size.height}.png`) });
    });

    test('a tap on a category selects it and centres it smoothly; a flick settles on a category', async ({ page }, testInfo) => {
      await open(page);
      const last = page.locator('#stage .cx-cat').last();
      await last.scrollIntoViewIfNeeded();
      await last.tap();
      await expect(current(page)).toHaveAttribute('aria-label', (await last.getAttribute('aria-label'))!);
      await expect.poll(() => offCentre(page), { timeout: 3000 }).toBeLessThan(3);
      // a flick: the strip moved by hand, then left to settle -- the snap puts a category's centre on the strip's
      await page.locator('#stage .cx-crossbar__strip').evaluate((el) => { el.scrollBy({ left: -170, behavior: 'instant' as ScrollBehavior }); });
      await expect.poll(() => page.evaluate(() => {
        const strip = document.querySelector<HTMLElement>('#stage .cx-crossbar__strip')!.getBoundingClientRect();
        const mid = strip.left + strip.width / 2;
        return Math.min(...[...document.querySelectorAll<HTMLElement>('#stage .cx-cat')].map((c) => { const r = c.getBoundingClientRect(); return Math.abs(r.left + r.width / 2 - mid); }));
      }), { timeout: 3000 }).toBeLessThan(3);
      // LR-40 (2; the close run's F2: the strip rested on an unselected Home, the selection out of view): the category the
      // flick settles on is selected, so the current one is the centred one (LP.R13: the selection stays centred)
      await expect.poll(() => offCentre(page), { timeout: 3000 }).toBeLessThan(3);
      await page.screenshot({ path: testInfo.outputPath(`rail-tap-${size.width}x${size.height}.png`) });
    });
  });
}

for (const size of [{ width: 390, height: 844 }, { width: 375, height: 667 }, { width: 844, height: 390 }, { width: 667, height: 375 }]) {
  test.describe(`LR-38 (3) the sign-in at ${size.width}x${size.height}`, () => {
    test.use({ viewport: size, hasTouch: true, isMobile: true });

    test('inside the window, centred, no legend reserve under it, no bar; scrolling only once it has the whole room', async ({ page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await open(page);
      // signed out by the prototype's states (P, Down, Cross), then Triangle's sign-in (the keyboard map's T), as
      // launcherPolish.spec's sign-in fit does
      await page.keyboard.press('p');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      await page.keyboard.press('t');
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const m = await dialog.evaluate((el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        const scrim = el.parentElement!.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, h: r.height, vh: innerHeight, vvh: visualViewport?.height ?? innerHeight, scrimTop: scrim.top, scrimH: scrim.height,
          scrolls: el.scrollHeight > el.clientHeight + 1, bar: getComputedStyle(el).scrollbarWidth, barW: el.offsetWidth - el.clientWidth };
      });
      await testInfo.attach('signin', { contentType: 'application/json', body: JSON.stringify(m) });
      expect(m.scrimH, 'the scrim is the visible viewport').toBeCloseTo(m.vvh, 0);
      expect(m.top).toBeGreaterThanOrEqual(0);
      expect(m.bottom).toBeLessThanOrEqual(m.vh + 1);
      expect(Math.abs(m.top - (m.vh - m.bottom)), 'centred: the same room over and under it').toBeLessThan(3);
      expect(m.bar).toBe('none');
      expect(m.barW, 'no scrollbar drawn beside it').toBeLessThanOrEqual(2);   // its 1px border each side
      if (m.scrolls) expect(m.h, 'it scrolls only once it fills the room (the safe areas or 12px each side)').toBeGreaterThanOrEqual(m.vvh - 2 * 12 - 2);
      // the password field, tapped, is in the dialog's view
      await dialog.locator('.cx-field__box').last().tap();
      await expect.poll(() => dialog.evaluate((el) => {
        const box = el.querySelectorAll<HTMLElement>('.cx-field__box');
        const r = box[box.length - 1]!.getBoundingClientRect();
        const d = el.getBoundingClientRect();
        return r.top >= d.top - 1 && r.bottom <= d.bottom + 1;
      })).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`signin-${size.width}x${size.height}.png`) });
    });
  });
}

for (const size of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
  test(`LR-38 (4) "Before you deploy" at ${size.width}x${size.height}: the mockup's side panel, edge to edge, readable`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // the real page (no disc here, no pad headless): Play opens the check on its disc row (consoleRows.spec's LR-36 fold);
    // the sample adapters hold a pad and a disc, where Play would launch
    await open(page, '/');
    await page.locator('#stage .cx-item--play').click();
    const panel = page.locator('#stage [data-panel="launch"]');
    await expect(panel).toBeVisible();
    const m = await panel.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const px = (sel: string, p: 'fontSize' | 'height' = 'fontSize') => { const e = el.querySelector<HTMLElement>(sel); return e ? parseFloat(getComputedStyle(e)[p]) : null; };
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, vw: innerWidth, vh: innerHeight,
        title: px('.cx-title'), crumb: px('.cx-crumb'), label: px('.cx-r__label'), hint: px('.cx-r__hint'), chip: px('.cx-r__chip', 'height'), ring: px('.cx-r__ring', 'height'),
        rowsFit: [...el.querySelectorAll<HTMLElement>('.cx-r[data-id]')].every((row) => { const b = row.getBoundingClientRect(); return b.right <= innerWidth + 1 && b.left >= -1; }) };
    });
    await testInfo.attach('launch-check', { contentType: 'application/json', body: JSON.stringify(m) });
    expect(m.right, 'on the window\'s right edge').toBeCloseTo(m.vw, 0);
    expect(m.top, 'from the window\'s top').toBeCloseTo(0, 0);
    expect(m.bottom, 'to the window\'s bottom').toBeCloseTo(m.vh, 0);
    if (size.width <= 760 && size.height > size.width) expect(m.width, 'a portrait phone: the whole width').toBeCloseTo(m.vw, 0);
    else expect(m.width).toBeCloseTo(Math.min(660, 0.64 * m.vw), 0);
    // LR-46: the launcher's text is its design size times `--cx-text-scale` (console.css; 1.08 at LR-46), read from the page
    // so a later value of the token holds here (was: 34, 12, 17 and 13 px exactly).
    const scale = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cx-text-scale')));
    expect(scale, 'the type token is set').toBeGreaterThan(0);
    expect(m.title).toBeCloseTo(34 * scale, 1);
    expect(m.crumb).toBeCloseTo(12 * scale, 1);
    expect(m.label).toBeCloseTo(17 * scale, 1);
    expect(m.hint).toBeCloseTo(13 * scale, 1);
    expect(m.chip).toBe(30);
    expect(m.ring).toBe(56);
    expect(m.rowsFit).toBe(true);
    // the focused row is in the panel's view (it scrolls its rows under the head where they do not fit)
    expect(await panel.locator('.cx-r.is-focused').evaluate((row) => {
      const list = row.closest<HTMLElement>('.cx-rlist')!.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      return r.top >= list.top - 1 && r.bottom <= list.bottom + 1;
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`launch-check-${size.width}x${size.height}.png`) });
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  });
}

test.describe('LR-38 (5) a slider takes a tap and a drag at 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a tap on the track sets the value at the point; a drag moves it', async ({ page }, testInfo) => {
    await open(page, '/settings/audio?sample');
    if (await page.locator('#stage [role="slider"]').count() === 0) await open(page, '/console/settings/audio?sample');
    const row = page.locator('#stage [role="slider"]').first();
    await expect(row).toBeVisible();
    await row.scrollIntoViewIfNeeded();
    const track = row.locator('.cx-r__track');
    const box = (await track.boundingBox())!;
    const now = async () => Number(await row.getAttribute('aria-valuenow'));
    const min = Number(await row.getAttribute('aria-valuemin'));
    const max = Number(await row.getAttribute('aria-valuemax'));
    await page.touchscreen.tap(box.x + 2, box.y + box.height / 2);
    await expect.poll(now).toBe(min);
    await page.touchscreen.tap(box.x + box.width - 2, box.y + box.height / 2);
    await expect.poll(now).toBe(max);
    // a drag by the pointer (a mouse here: Playwright's touchscreen has no move), from the left end to the middle
    await page.mouse.move(box.x + 1, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    const mid = await now();
    expect(Math.abs(mid - (min + max) / 2)).toBeLessThanOrEqual((max - min) / 10 + 0.001);
    const hit = await track.evaluate((el) => parseFloat(getComputedStyle(el, '::after').height));
    expect(hit, 'its hit area is at least 44px tall').toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath('slider-390x844.png') });
  });
});
