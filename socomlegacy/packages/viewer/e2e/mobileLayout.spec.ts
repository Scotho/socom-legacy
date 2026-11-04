import { expect, test, type FrameLocator, type Locator, type Page } from '@playwright/test';
import type {} from '../src/hook';
import { holdReleased } from './loadHold';

test.use({ hasTouch: true, isMobile: true, actionTimeout: 15_000 });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] }));
});
test.setTimeout(90_000);
const KEY = 's2u.viewer.mobileLayout.v1';
const sizes = [{ width: 812, height: 375 }, { width: 915, height: 412 }, { width: 375, height: 812 }];
async function editor(menu: Page | FrameLocator): Promise<FrameLocator> {
  // A reload keeps the launcher's page (CX-34..36, `../src/console/history.ts`; LATER 198): back on Options > Mobile the
  // roller is shown already. From Home: the rail's Settings, tapped (LR-0: every category its own target; LR-24: the
  // page's rail has no L1/R1 "Next category" chips), then Launcher and its Mobile tab (#595's layout A, H363: the Settings
  // list holds Game, Launcher and Theme; Mobile is a Launcher tab, shown where touch exists).
  const row = menu.locator('[data-key="options"] [data-act="optrow"]').filter({ hasText: 'Touch layout' });   // LR-5: LR-1's row
  const settings = menu.getByRole('button', { name: 'Settings', exact: true });
  await expect(row.or(settings).first()).toBeVisible();
  if (!(await row.isVisible())) {
    await settings.tap();
    await menu.locator('.cx-item').filter({ has: menu.locator('.cx-item__title', { hasText: /^Launcher$/ }) }).tap();
    await menu.locator('.cx-tabs').getByRole('button', { name: 'Mobile', exact: true }).tap();
  }
  await row.tap();
  await expect(menu.locator('[data-mobile-editor]')).toHaveAttribute('data-ready', 'true');
  return menu.frameLocator('[data-mobile-editor] iframe');
}
async function drag(page: Page, target: Locator, x: number, y: number): Promise<void> {
  const b = (await target.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: b.x + b.width / 2, y: b.y + b.height / 2 }] });
    for (let step = 1; step <= 5; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: b.x + b.width / 2 + (x - b.x - b.width / 2) * step / 5, y: b.y + b.height / 2 + (y - b.y - b.height / 2) * step / 5 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await cdp.detach(); }
}
for (const size of sizes) test(`home: touch drag, reload, cancel and reset at ${size.width}x${size.height}`, async ({ page }) => {
  await page.setViewportSize(size);
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  let edit = await editor(page);
  const target = edit.locator('#tw-r1');
  await drag(page, target, size.width * 0.57, size.height * 0.53);
  const placed = (await target.boundingBox())!;
  expect(Math.abs(placed.x + placed.width / 2 - size.width * 0.57)).toBeLessThan(3);
  await page.screenshot({ path: test.info().outputPath(`mobile-layout-editor-${size.width}x${size.height}.png`) }); // B61 review F4: Playwright's own output folder
  await edit.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(page.locator('[data-mobile-editor]')).toHaveCount(0, { timeout: 5000 });
  const saved = await page.evaluate((k) => localStorage.getItem(k), KEY);
  expect(saved).not.toBeNull();
  await page.reload();
  edit = await editor(page);
  expect((await edit.locator('#tw-r1').boundingBox())!.x).toBeCloseTo(placed.x, 0);
  await drag(page, edit.locator('#tw-start'), size.width * 0.4, size.height * 0.4);
  const start = (await edit.locator('#tw-start').boundingBox())!;
  expect(Math.abs(start.x + start.width / 2 - size.width * 0.4)).toBeLessThan(3);
  await edit.getByRole('button', { name: 'Cancel', exact: true }).tap();
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(saved);
  await page.reload(); edit = await editor(page);
  await edit.getByRole('button', { name: 'Reset', exact: true }).tap();
  expect((await edit.locator('#tw-r1').boundingBox())!.x).not.toBeCloseTo(placed.x, 0);
  await edit.getByRole('button', { name: 'Save', exact: true }).tap();
  const profile = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!);
  expect(profile[size.width > size.height ? 'landscape' : 'portrait']).toEqual({});
  expect(errors).toEqual([]);
});

test('in-game: Menu opens Mobile, saved target fires, rotation stays on screen and inputs release', async ({ page }) => {
  await page.setViewportSize({ width: 812, height: 375 });
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/testroom?mode=play&fly&devmode&kit=62,15,121,126,255');
  await expect(page.locator('#status')).toContainText(/triangles|tris/);
  await holdReleased(page);
  const settings = page.getByRole('button', { name: 'settings', exact: true });
  if (await settings.getAttribute('aria-expanded') === 'true') await settings.tap();
  await page.evaluate(() => { document.getElementById('mobile-tip-close')?.click(); window.__viewer.setMode('walk'); });
  await page.addStyleTag({ content: '#playtest-overlay { display:none!important }' });
  const opening = await page.context().newCDPSession(page);
  const heldFire = (await page.locator('#tw-r1').boundingBox())!;
  const menuBox = (await page.getByRole('button', { name: 'Open in-game settings' }).boundingBox())!;
  const held = { id: 21, x: heldFire.x + heldFire.width / 2, y: heldFire.y + heldFire.height / 2 };
  await opening.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [held] });
  await expect.poll(() => page.evaluate(() => window.__viewer.pad().input.fire)).toBe(true);
  await opening.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [held, { id: 22, x: menuBox.x + menuBox.width / 2, y: menuBox.y + menuBox.height / 2 }] });
  // CDP touchEnd lists the point being released, not the point that remains held.
  await opening.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ id: 22, x: menuBox.x + menuBox.width / 2, y: menuBox.y + menuBox.height / 2 }] });
  await expect(page.locator('.mu-overlay-frame')).toBeVisible({ timeout: 5000 });
  await expect.poll(() => page.evaluate(() => window.__viewer.pad().input.fire), { timeout: 5000 }).toBe(false);
  await opening.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await opening.detach();
  const menu = page.frameLocator('.mu-overlay-frame');
  const edit = await editor(menu);
  await drag(page, edit.locator('#tw-r1'), 450, 215);
  await drag(page, edit.locator('#stick-rest'), 500, 280); // move still moves on the default look side, clear of the face buttons
  const movedStick = (await edit.locator('#stick-rest').boundingBox())!;
  expect(Math.abs(movedStick.x + movedStick.width / 2 - 500)).toBeLessThan(3);
  const placed = (await edit.locator('#tw-r1').boundingBox())!;
  await edit.getByRole('button', { name: 'Save', exact: true }).tap();
  // Back from rows, then categories, then the console Home, then into the game.
  for (let i = 0; i < 3; i++) await menu.locator('[data-overlay-close]').tap();
  await expect(page.locator('.mu-overlay-frame')).toBeHidden();
  await expect.poll(async () => (await page.locator('#tw-r1').boundingBox())!.x).toBeCloseTo(placed.x, 0);
  const cdp = await page.context().newCDPSession(page);
  const button = (await page.locator('#tw-r1').boundingBox())!;
  const stick = (await page.locator('#stick-rest').boundingBox())!;
  const firePoint = { id: 1, x: button.x + button.width / 2, y: button.y + button.height / 2 };
  const movePoint = { id: 2, x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 };
  await page.screenshot({ path: test.info().outputPath('mobile-layout-ingame.png') });
  expect(await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.closest('button')?.id, firePoint)).toBe('tw-r1');
  expect(await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.id, movePoint)).toBe('stick-zone');
  const shots = await page.evaluate(() => window.__viewer.fire().shots);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [firePoint, movePoint] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [firePoint, { ...movePoint, y: movePoint.y - 25 }] });
  await expect.poll(() => page.evaluate(() => window.__viewer.pad().input.fire)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__viewer.fire().shots)).toBeGreaterThan(shots);
  await expect.poll(() => page.evaluate(() => window.__viewer.pad().input.moveY)).not.toBe(0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => window.__viewer.pad().input.fire)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__viewer.pad().input.moveY)).toBe(0);
  await cdp.detach();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator('#tw-r1')).toBeVisible();
  for (const target of ['tw-r1', 'tw-start', 'stick-rest', 'aim-rest']) {
    // Polled, as the landscape check below: the controls are laid out again a frame or more after the resize.
    await expect.poll(async () => {
      const r = (await page.locator(`#${target}`).boundingBox())!;
      return r.x >= 0 && r.y >= 0 && r.x + r.width <= 375 && r.y + r.height <= 812;
    }, { message: `#${target} inside the 375 x 812 screen after the rotation` }).toBe(true);
    const b = (await page.locator(`#${target}`).boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0); expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(375); expect(b.y + b.height).toBeLessThanOrEqual(812);
  }
  await page.setViewportSize({ width: 812, height: 375 });
  await expect.poll(async () => (await page.locator('#tw-r1').boundingBox())!.x).toBeCloseTo(placed.x, 0);
  expect(errors).toEqual([]);
});

// LATER 133 (`../src/mobileLayout` `LAYOUT_NOTICE_TEXT`, its two marks): a layout saved before the controls strip -- a
// saved position, no strip mark -- is told once on the phone tip's line, in the tip's place; the next visit's start
// shows the tip as before. The phone: 360 high, held sideways.
const NOTICE = 'Your saved touch layout predates the controls strip. Options > Mobile > Touch layout: Reset, then Save, restores the defaults.';
const NOTICE_KEY = 's2u.viewer.mobileLayout.stripNoticeShown';
const PRE_STRIP = JSON.stringify({ version: 1, landscape: { 'tw-r1': { x: 1, y: 1 } }, portrait: {} });
test('LATER 133: a layout saved before the strip is told once on the tip\'s line, which fits a 360-high phone', async ({ page }) => {
  const size = { width: 640, height: 360 };
  await page.setViewportSize(size);
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v); } catch { /* none */ } }, [KEY, PRE_STRIP] as const);
  await page.goto('/testroom?mode=play&fly&devmode&kit=62,15,121,126,255');
  await expect(page.locator('#status')).toContainText(/triangles|tris/);
  const tip = page.locator('#mobile-tip'), words = page.locator('#mobile-tip-text');
  await expect(tip).toBeVisible();
  await expect(words).toHaveText(NOTICE);
  const box = (await tip.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(size.width); expect(box.y + box.height).toBeLessThanOrEqual(size.height);
  expect(await words.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);   // no line cut off at the side
  await page.screenshot({ path: test.info().outputPath('mobile-layout-strip-notice-640x360.png') });
  expect(await page.evaluate((k) => localStorage.getItem(k), NOTICE_KEY)).toBe('1');
  await page.reload();
  await expect(page.locator('#status')).toContainText(/triangles|tris/);
  await expect(tip).toBeVisible();
  await expect(words).toHaveText(/^Best with a controller/);                              // the tip's own line, never the notice again
  expect(errors).toEqual([]);
});
