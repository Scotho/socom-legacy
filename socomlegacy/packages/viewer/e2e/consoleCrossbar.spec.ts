import { expect, test, type Page } from '@playwright/test';
import { RAIL_ORDER, expectRailStops, walkRailTo } from './launcherRail';

/** LP.R13/R15: a fixed Home carousel, active icon and label, bounded at both ends.
 * LR-25 (F3, the LR-24 review; LR.R22): on the page above the phone rule (width > 760px and height > 550px) the rail is
 * the mockup's -- its current column at the window's centre (LR-34, LR.R28; the mockup's 36%, line 49, moved to the middle), no L1 / R1 chips -- and the
 * list beside it at calc(50% - 33px); the phones keep the centred rail (LR-17). Was: the rail centred at every size.
 * Rendered evidence, separate from the unit translation contract. No game is launched.
 */
const current = (page: Page) => page.locator('#stage .cx-cat.is-current');
// LR-25: the distance of the current icon's centre from where the rail puts it -- the window's centre on the wide layout,
// the rail's centre on the phones.
const centerError = (page: Page) => page.evaluate(() => {
  const rail = document.querySelector('.cx-crossbar')!.getBoundingClientRect();
  const icon = document.querySelector('.cx-cat.is-current .cx-ico')!.getBoundingClientRect();
  const wide = innerWidth > 760 && innerHeight > 550;
  const want = wide ? innerWidth * 0.5 : (rail.left + rail.right) / 2;
  return Math.abs((icon.left + icon.right) / 2 - want);
});

for (const [width, height] of [[412, 915], [1280, 720], [1366, 768], [1920, 1080]] as const) {
  test(`at ${width}x${height} the active category stays in its column (centred on a wide window, centred on a phone), with bounded shoulder navigation`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/console?sample');
    const cats = page.locator('#stage .cx-cat');
    const labels = await cats.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label')!));
    // LR-24 (LR.R23 (a)): the page's rail draws no L1 / R1 chips (the mockup's draws none); L1 / R1 are the keymap's q / e
    // and the pad's shoulders. Was: the chips' buttons ("Previous category", "Next category"), disabled at the ends.
    await expect(page.locator('#stage .cx-crossbar__hint')).toHaveCount(0);
    const previous = { click: () => page.keyboard.press('q') };
    const next = { click: () => page.keyboard.press('e') };
    expect(labels).toEqual([...RAIL_ORDER]);                                // LR.R2
    await expect(current(page)).toHaveAttribute('aria-label', 'Home');      // LR.R2: Home the default
    // Walk to the first endpoint by the rail's buttons before exercising the complete rail.
    await walkRailTo(page, RAIL_ORDER[0], (dir) => (dir < 0 ? previous : next).click());
    await expect(current(page)).toHaveAttribute('aria-label', RAIL_ORDER[0]!);   // LR-24 (was: the L1 chip disabled)
    await expectRailStops(page, 'left');                                    // LR.R3: L1 at the end bumps, no wrap
    for (let i = 0; i < labels.length; i++) {
      if (i > 0) await next.click();
      await expect(current(page)).toHaveAttribute('aria-label', labels[i]!);
      await expect.poll(() => centerError(page)).toBeLessThan(1);
      await expect.poll(() => current(page).locator('.cx-cat__label').evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
      const fit = await page.evaluate(() => {
        const rail = document.querySelector('.cx-crossbar')!.getBoundingClientRect();
        const strip = document.querySelector('.cx-crossbar__strip')!.getBoundingClientRect();
        // LR-24: no chips to clear (was: the strip between the L1 / R1 chips); the strip spans the rail.
        return { centered: innerWidth > 760 && innerHeight > 550 ? 0 : Math.abs((rail.left + rail.right) / 2 - innerWidth / 2), clear: strip.left >= rail.left - 1 && strip.right <= rail.right + 1, noOverflow: document.documentElement.scrollWidth <= innerWidth };
      });
      expect(fit.centered).toBeLessThan(1); expect(fit.clear).toBe(true); expect(fit.noOverflow).toBe(true);
    }
    await expect(current(page)).toHaveAttribute('aria-label', RAIL_ORDER[RAIL_ORDER.length - 1]!);   // LR-24 (was: the R1 chip disabled)
    await expectRailStops(page, 'right');                                   // LR.R3: R1 at the end bumps, no wrap
    await expectRailStops(page, 'right', () => page.keyboard.press('ArrowRight'));
    for (let i = labels.length - 2; i >= 0; i--) {
      await previous.click();
      await expect(current(page)).toHaveAttribute('aria-label', labels[i]!);
      await expect.poll(() => centerError(page)).toBeLessThan(1);
    }
    await expect(current(page)).toHaveAttribute('aria-label', labels[0]!);   // LR-24 (was: the L1 chip disabled)
    if (width > 760 && height > 550) {
      // LR-25: the list's left edge is the mockup's calc(50% - 33px) (LR-34) (line 60), its width min(560px, 64vw - 40px).
      const error = await page.locator('.cx-home__body').evaluate((e) => Math.abs(e.getBoundingClientRect().left - (innerWidth * 0.5 - 33)));
      expect(error).toBeLessThan(2);
    }
  });
}
