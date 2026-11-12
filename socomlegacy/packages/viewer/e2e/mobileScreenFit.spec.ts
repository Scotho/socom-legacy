import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type {} from '../src/hook';
import { holdReleased } from './loadHold';
import { until } from './frontEndWalk';

// The menus (dlgMenu.rdr) and the test room (MP2) are read from the served tree; a host without it skips, as
// ./menuflow.spec.ts does.
const HAVE = existsSync(fileURLToPath(new URL('../../../public/maps/index.json', import.meta.url)));
test.skip(!HAVE, 'maps absent: run npm run extract-maps');

// CSS viewport sizes, not a claim of testing physical devices or their native browser bars.
const phones = [
  { name: 'iPhone SE', width: 667, height: 375 },
  { name: 'iPhone 14', width: 844, height: 390 },
  { name: 'Pixel 7', width: 915, height: 412 },
  { name: 'iPad', width: 1024, height: 768 },
  { name: 'iPad Pro', width: 1366, height: 1024 },
  { name: 'short browser viewport', width: 667, height: 295 },
];
test.use({ hasTouch: true, isMobile: true, storageState: { cookies: [], origins: [] } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] }));
});
const ids = ['tw-l1', 'tw-l2', 'tw-r1', 'tw-r2', 'tw-up', 'tw-down', 'tw-left', 'tw-right', 'tw-triangle', 'tw-square', 'tw-circle', 'tw-cross', 'tw-l3', 'tw-r3', 'tw-select', 'tw-start', 'stick-rest', 'aim-rest'];
async function padFits(page: Page, root: string, match = false) {
  const size = page.viewportSize()!;
  const boxes = [];
  const targets = [...ids.map(id => ({ id, el: page.locator(`${root} [id="${id}"]`) })),
    { id: 'Menu', el: page.getByRole('button', { name: 'Open in-game settings' }) },
    ...(match ? [{ id: 'Fullscreen', el: page.locator('#fullscreen') }] : [])];
  for (const { id, el } of targets) {
    await expect(el, id).toBeVisible();
    const b = (await el.boundingBox())!; boxes.push({ id, ...b });
    expect(b.x, id).toBeGreaterThanOrEqual(0);
    if (!match || (id !== 'Menu' && id !== 'Fullscreen')) expect(b.y, id).toBeGreaterThanOrEqual(size.height - (size.width > size.height ? 190 : 300));
    expect(b.x + b.width, id).toBeLessThanOrEqual(size.width + 1);
    expect(b.y + b.height, id).toBeLessThanOrEqual(size.height + 1);
    expect(Math.min(b.width, b.height), id).toBeGreaterThanOrEqual(36);
  }
  for (let i = 0; i < boxes.length; i++) for (const b of boxes.slice(i + 1)) {
    const a = boxes[i]!;
    expect(a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1 && a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1, `${a.id} overlaps ${b.id}`).toBe(false);
  }
}
for (const size of phones) test(`${size.name}: menu controls stay at the bottom through rotation`, async ({ page }) => {
  await page.setViewportSize(size);
  await page.goto('/setup?devmode&menuflow=dlgMenu.rdr');
  await expect(page.locator('#tw-cross')).toBeVisible();
  await expect(page.locator('#stick-rest')).toBeVisible(); // present during the initial asset read too
  await until(page, 'main menu drawn', (s) => s.dialog === 'dlgMenu.rdr' && s.ready);
  await padFits(page, '#menu-touch');
  await page.screenshot({ path: test.info().outputPath('landscape.png') });
  const canvas = (await page.locator('#front-end').boundingBox())!;
  expect(canvas.y + canvas.height).toBeLessThanOrEqual(size.height);
  expect(canvas.height, 'menus use the full available canvas height behind touch controls').toBeCloseTo(size.height, 0);
  await page.setViewportSize({ width: size.height, height: size.width });
  await padFits(page, '#menu-touch');
  await page.screenshot({ path: test.info().outputPath('portrait.png') });
});

test('home Mobile settings and editor fit phone and tablet viewports', async ({ page }) => {
  test.setTimeout(180_000);
  for (const size of phones) {
    await page.setViewportSize(size);
    await page.goto('/');
    // The rail's Settings, tapped (LR-0: every category its own target; LR-24: no L1/R1 chips on the page's rail), then
    // Launcher and its Mobile tab (#595's layout A, H363), as `./mobileLayout.spec.ts` reaches it.
    await page.getByRole('button', { name: 'Settings', exact: true }).tap();
    await page.locator('.cx-item').filter({ has: page.locator('.cx-item__title', { hasText: /^Launcher$/ }) }).tap();
    await page.locator('.cx-tabs').getByRole('button', { name: 'Mobile', exact: true }).tap();
    const row = page.locator('[data-key="options"] [data-act="optrow"]').filter({ hasText: 'Touch layout' });   // LR-5: LR-1's row
    await row.scrollIntoViewIfNeeded();
    const b = (await row.boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.y + b.height).toBeLessThanOrEqual(size.height);
    await page.screenshot({ path: test.info().outputPath(`options-${size.name}.png`) });
    await row.tap();
    await expect(page.locator('[data-mobile-editor]')).toHaveAttribute('data-ready', 'true');
    const edit = page.frameLocator('[data-mobile-editor] iframe');
    for (const id of ids) {
      const target = (await edit.locator(`#${id}`).boundingBox())!;
      expect(target.y + target.height, id).toBeLessThanOrEqual(size.height + 1);
    }
    await edit.getByRole('button', { name: 'Cancel', exact: true }).tap();
  }
});

test('game viewport and controls fit the phone/tablet sizes and rotation', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(phones[1]!);
  // The Menu-over-compass centring below (to half a pixel) was written when the page drew at Balanced, 100% of its
  // pixels. Since v0.4.17 the default is Automatic (VS-1, afd74b5b3f), which on the gate's software class resolves to
  // Performance -- 75% of the pixels, at most 720 lines (`../src/autoQuality.ts`) -- and the v0.4.19 gate's browser view
  // read the Menu 0.585 px off the compass's centre at 295x667 there. The preset this spec was written against is seeded (`s2u.viewer.video2`, `../src/videoSettings.ts`), so the
  // layout is measured on every renderer at the same scale.
  await page.addInitScript(() => localStorage.setItem('s2u.viewer.video2', JSON.stringify({ preset: 'balanced' })));
  await page.goto('/testroom?mode=play&fly&devmode&map=MP2');
  await expect(page.locator('#status')).toContainText(/triangles|tris/);
  await holdReleased(page);
  await page.evaluate(() => { document.getElementById('mobile-tip-close')?.click(); window.__viewer.setMode('walk'); });
  await page.addStyleTag({ content: '#playtest-overlay { display:none !important }' });
  // The weapon box draws once the spawn's fade is up (`SPAWN_FADE`: 1 s held, 0.5 s ramp); the readouts below are
  // measured after it.
  await expect.poll(() => page.evaluate(() => !!window.__viewer.hud().rects.rounds), { timeout: 10_000, message: 'the weapon box drawn' }).toBe(true);
  for (const size of phones) for (const portrait of [false, true]) {
    await page.setViewportSize(portrait ? { width: size.height, height: size.width } : size);
    await padFits(page, 'body', true);
    const b = (await page.locator('#view').boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(b.y).toBeGreaterThanOrEqual(-1);
    expect(b.y + b.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(b.height, 'the game extends behind the touch controls').toBeCloseTo(viewport.height, 0);
    expect(b.width).toBeCloseTo(viewport.width, 0);
    const menu = (await page.getByRole('button', { name: 'Open in-game settings' }).boundingBox())!;
    const fullscreen = (await page.locator('#fullscreen').boundingBox())!;
    const compass = await page.evaluate(() => {
      const hud = window.__viewer.hud(), rect = hud.rects.compass!;
      const canvas = document.getElementById('view')!.getBoundingClientRect();
      return { bottom: canvas.y + (rect.y + rect.height) * canvas.height / hud.frame.height,
        centre: canvas.x + (rect.x + rect.width / 2) * canvas.width / hud.frame.width };
    });
    expect(menu.y, 'Menu clears the compass').toBeGreaterThanOrEqual(compass.bottom);
    expect(menu.x + menu.width / 2).toBeCloseTo(compass.centre, 0);
    expect(fullscreen.y).toBeGreaterThanOrEqual(menu.y + menu.height);
    expect(fullscreen.x + fullscreen.width / 2).toBeCloseTo(menu.x + menu.width / 2, 0);
    for (const id of ids) {
      const control = (await page.locator(`#${id}`).boundingBox())!;
      expect(control.y + control.height, `${id} overlays the game`).toBeLessThanOrEqual(b.y + b.height + 1);
    }
    // MTO.R1's condition, "if usable" (the owner's word, MSFIT.R3): the overlaid controls cover none of the HUD's
    // readouts -- the ammo (rounds, mags, the weapon's icon, the fire mode), the compass (the radar), the info box (the
    // health bar, the timer, the range) and the reticle. Measured at every size and attached for the record (JSON and
    // screenshot), not asserted: at the iPhone 14's 844x390 landscape the controls cover the ammo box and the info box,
    // and no raise clears them inside the layout's own bounds (2026-10-23); the owner judged it usable as it is (H311,
    // answered 2026-10-23: "Yes"), so the covers stay a record. A browser adaptation's check: no game value.
    const readouts = await page.evaluate(() => {
      const hud = window.__viewer.hud(), ret = window.__viewer.reticle();
      const canvas = document.getElementById('view')!.getBoundingClientRect();
      const out: { name: string; x: number; y: number; w: number; h: number }[] = [];
      const put = (name: string, r: { x: number; y: number; width: number; height: number }, fw: number, fh: number): void => {
        out.push({ name, x: canvas.x + r.x * canvas.width / fw, y: canvas.y + r.y * canvas.height / fh, w: r.width * canvas.width / fw, h: r.height * canvas.height / fh });
      };
      for (const name of ['rounds', 'mags', 'icon', 'firemode', 'compass', 'bar', 'timer', 'range'] as const) {
        const r = hud.rects[name];
        if (r) put(name, r, hud.frame.width, hud.frame.height);
      }
      if (ret.visible && ret.rect) put('reticle', ret.rect, ret.frame.width, ret.frame.height);
      return out;
    });
    const controls = [...ids.map((id) => `#${id}`), '#fullscreen'];
    const covers: string[] = [];
    for (const sel of controls) {
      const c = (await page.locator(sel).first().boundingBox())!;
      for (const r of readouts) {
        const w = Math.min(c.x + c.width, r.x + r.w) - Math.max(c.x, r.x), h = Math.min(c.y + c.height, r.y + r.h) - Math.max(c.y, r.y);
        if (w > 0.5 && h > 0.5) covers.push(`${sel} over ${r.name}`);
      }
    }
    const menuBox = (await page.getByRole('button', { name: 'Open in-game settings' }).boundingBox())!;
    for (const r of readouts) {
      const w = Math.min(menuBox.x + menuBox.width, r.x + r.w) - Math.max(menuBox.x, r.x), h = Math.min(menuBox.y + menuBox.height, r.y + r.h) - Math.max(menuBox.y, r.y);
      if (w > 0.5 && h > 0.5) covers.push(`Menu over ${r.name}`);
    }
    const label = `${size.name}-${portrait ? 'portrait' : 'landscape'}`;
    await test.info().attach(`hud-readouts-${label}`, { body: JSON.stringify({ readouts, covers }, null, 2), contentType: 'application/json' });
    expect(readouts.map((r) => r.name), `${label}: the readouts are drawn`).toEqual(expect.arrayContaining(['rounds', 'compass', 'timer', 'reticle']));
    await page.screenshot({ path: test.info().outputPath(`game-${label}.png`) });
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [{ id: 'dimension-test-pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }] });
  });
  await expect(page.locator('#tw-cross')).toBeHidden();
  await expect.poll(async () => (await page.locator('#view').boundingBox())!.height).toBe(390);
  await page.evaluate(() => Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] }));
  await expect(page.locator('#tw-cross')).toBeVisible();
  await expect.poll(async () => (await page.locator('#view').boundingBox())!.height).toBe(390);
});
