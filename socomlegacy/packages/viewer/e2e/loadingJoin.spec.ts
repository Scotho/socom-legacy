import { test, expect } from '@playwright/test';
import type {} from '../src/hook';
import { OpenedContexts } from './openedContexts';
import { TEST_ROOM } from './urls';

/** The contexts this spec opens on the worker's browser, closed after each test -- a failed one's too (issues #91, #117). */
const opened = new OpenedContexts();
test.afterEach(() => opened.closeAll());

/** Private ISO, two normal joins. A delayed welcome is test-only: it verifies readiness rather than imposing a delay. */
test('Frostfire original loading screen covers preparation, blocks input, and releases two ready clients', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const iso = process.env.SOCOM_ISO;
  const server = process.env.LOADING_E2E_SERVER;
  test.skip(!iso || !server, 'requires a private SOCOM_ISO and a dedicated local Frostfire server');
  const clients = [];
  for (let i = 0; i < 2; i++) {
    const context = opened.add(await browser.newContext());
    const page = await context.newPage();
    await page.addInitScript(() => {
      const pad = { id: 'Loading regression pad', index: 0, connected: true, mapping: 'standard', timestamp: 0,
        axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
      Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value: () => [pad, null, null, null] });
      window.addEventListener('loading-test-pad', event => {
        const active = (event as CustomEvent<boolean>).detail;
        pad.axes = active ? [0, -1, 1, 0] : [0, 0, 0, 0];
        pad.buttons.forEach((button, index) => { button.pressed = active && [0, 5, 9].includes(index); button.touched = button.pressed; button.value = button.pressed ? 1 : 0; });
        pad.timestamp = performance.now();
      });
    });
    let release = (): void => {};
    await page.routeWebSocket(server!, route => {
      const upstream = route.connectToServer();
      const held: (string | Buffer)[] = [];
      let pending = true;
      upstream.onMessage(message => { if (pending) held.push(message); else route.send(message); });
      release = () => { pending = false; for (const message of held) route.send(message); held.length = 0; };
    });
    await page.goto(`${TEST_ROOM}?mode=play&map=MP2&server=${encodeURIComponent(server!)}&devmode`);   // the match page lives at /testroom (OT.R19)
    await page.waitForFunction(() => '__viewer' in window);           // main.ts has run (a dynamic import since OT.R12: after `load`)
    await page.locator('#disc-page-file').setInputFiles(iso!);
    await expect.poll(() => page.evaluate(() => window.__viewer.loading().picture), { timeout: 120_000 }).toBe('ld_mp2_prog.tif');
    await expect.poll(() => page.evaluate(() => window.__viewer.links().warmed.world), { timeout: 120_000 }).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__viewer.loading().blocked)).toBe(true);
    const pose = await page.evaluate(() => window.__viewer.pose());
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('loading-test-pad', { detail: true })));
    await page.keyboard.press('Enter');
    await page.keyboard.down('KeyW');
    await page.mouse.click(200, 200);
    await page.waitForTimeout(1_600);
    await page.keyboard.up('KeyW');
    expect(await page.evaluate(() => window.__viewer.loading())).toMatchObject({ visible: true, blocked: true, missing: [] });
    expect(await page.evaluate(() => window.__viewer.armory().committed)).toBeNull(); // no welcome, no Armory confirmation
    expect(await page.evaluate(() => window.__viewer.fire().shots)).toBe(0);
    const heldPose = await page.evaluate(() => window.__viewer.pose());
    expect(heldPose.x).toBeCloseTo(pose.x, 5);
    expect(heldPose.z).toBeCloseTo(pose.z, 5);
    expect(heldPose.yaw).toBeCloseTo(pose.yaw, 5);
    // Evidence remains private, outside the source tree and Git; no attachment uploads original bitmaps.
    if (process.env.LOADING_REVIEW_SCREENSHOT) await page.screenshot({ path: `${process.env.LOADING_REVIEW_SCREENSHOT}-${i}.png` });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('loading-test-pad', { detail: false })));
    release();
    await expect.poll(() => page.evaluate(() => window.__viewer.loading().blocked), { timeout: 30_000 }).toBe(false);
    expect(await page.evaluate(() => window.__viewer.loading().visible)).toBe(false);
    // The first seat must reach its pregame Armory. The second seat can arrive in the existing launch countdown,
    // whose original pull-out/round-start callbacks close that menu while the covered map is still preparing.
    if (i === 0) await expect.poll(() => page.evaluate(() => window.__viewer.armory().open), { timeout: 15_000 }).toBe(true);
    expect(await page.evaluate(() => window.__viewer.net?.()?.state)).toBe('open');
    clients.push({ context, page });
  }
  // Both clients have finished loading before either confirms the Armory.
  for (const { page } of clients) {
    if (!await page.evaluate(() => window.__viewer.armory().open)) continue; // round start already closed this menu
    await expect.poll(() => page.evaluate(() => window.__viewer.armory().taking), { timeout: 15_000 }).toBe(true);
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.__viewer.armory().taking), { timeout: 15_000 }).toBe(true);
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => window.__viewer.armory().screen), { timeout: 15_000 }).toBe('done');
    await expect.poll(() => page.evaluate(() => window.__viewer.armory().taking), { timeout: 15_000 }).toBe(true);
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.__viewer.armory().open), { timeout: 15_000 }).toBe(false);
  }
  for (const { page } of clients) {
    await expect.poll(() => page.evaluate(() => window.__viewer.net?.()?.waiting), { timeout: 30_000 }).toBe(false);
  }
});
