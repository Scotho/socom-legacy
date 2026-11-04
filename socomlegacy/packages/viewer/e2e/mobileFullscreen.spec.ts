import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ hasTouch: true, isMobile: true, storageState: { cookies: [], origins: [] } });
const sizes = [
  { width: 667, height: 375 }, { width: 844, height: 390 }, { width: 915, height: 412 },
  { width: 1024, height: 768 }, { width: 1366, height: 1024 }, { width: 667, height: 295 },
];
async function drag(page: Page, target: Locator, x: number, y: number) {
  const box = (await target.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  try {
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, ...from }] });
    for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: from.x + (x - from.x) * i / 5, y: from.y + (y - from.y) * i / 5 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await cdp.detach(); }
}

// A disc-free browser harness mounts the production menu pad and editor, including the real CSS and storage.
// Gameplay rendering is covered by the existing mobileMatchOverlay/mobileScreenFit specs.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] }));
  await page.route('**/mobile-fullscreen-check', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/src/ds/index.css"><link rel="stylesheet" href="/src/styles.css">
    <button id="edit" style="position:fixed;top:0;left:0;z-index:2000">Edit touch layout</button><canvas id="menu"></canvas>
    <button id="start-match" style="position:fixed;top:0;right:0;z-index:2000">Start match</button>
    <script type="module">
      import { mountMenuTouch } from '/src/menuTouch.ts';
      import { openMobileLayoutEditor } from '/src/mobileLayoutEditor.ts';
      import { mountTouch } from '/src/matchTouch.ts';
      const menu = mountMenuTouch(document.getElementById('menu'), window);
      document.getElementById('edit').onclick = () => openMobileLayoutEditor(document, () => {});
      window.disposeMenu = menu.dispose;
      document.getElementById('start-match').onclick = async () => {
        document.getElementById('menu').hidden = true;
        await new Promise(requestAnimationFrame); // the menu parks its nodes before the match mounts
        const canvas = document.createElement('canvas');
        canvas.id = 'match-canvas';
        canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100dvh;z-index:1000;background:#123';
        document.body.append(canvas);
        const match = mountTouch(document.body, {
          stance() {}, fire() {}, cancelAction() {}, covered: () => false,
          exchange: { menu: { touchButton() {} }, refresh() {}, gate() {}, isOpen: () => false, prompt: null },
          build: { zIndex: 1001 },
        });
        match.pageState(true, false);
      };
    </script>` }));
});

for (const size of sizes) test(`fullscreen: drag, save, reload, rotate and reset at ${size.width}x${size.height}`, async ({ page }) => {
  await page.setViewportSize(size);
  await page.goto('/mobile-fullscreen-check');
  const button = page.locator('#fullscreen');
  await expect(button).toBeVisible();
  const original = (await button.boundingBox())!;
  expect(original.x).toBeGreaterThanOrEqual(0);
  expect(original.y + original.height).toBeLessThanOrEqual(size.height);
  for (const control of await page.locator('#menu-touch [data-pad], #menu-touch .touch-stick-rest').all()) {
    const box = (await control.boundingBox())!;
    expect(original.x < box.x + box.width && original.x + original.width > box.x && original.y < box.y + box.height && original.y + original.height > box.y,
      `fullscreen clears ${await control.getAttribute('id')}`).toBe(false);
  }
  await page.getByRole('button', { name: 'Edit touch layout' }).tap();
  await expect(page.locator('[data-mobile-editor]')).toHaveAttribute('data-ready', 'true');
  let editor = page.frameLocator('[data-mobile-editor] iframe');
  await drag(page, editor.locator('#fullscreen'), size.width * 0.5, size.height * 0.45);
  const moved = (await editor.locator('#fullscreen').boundingBox())!;
  expect(moved.x + moved.width / 2).toBeCloseTo(size.width * 0.5, 0);
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false); // editing never activates fullscreen
  await editor.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect.poll(async () => (await button.boundingBox())!.x).toBeCloseTo(moved.x, 0);
  await page.reload();
  await expect(button).toBeVisible();
  await expect.poll(async () => (await button.boundingBox())!.x).toBeCloseTo(moved.x, 0);
  await page.setViewportSize({ width: size.height, height: size.width });
  await expect.poll(async () => { const b = (await button.boundingBox())!; return b.x + b.width; }).toBeLessThanOrEqual(size.height);
  await expect.poll(async () => { const b = (await button.boundingBox())!; return b.y + b.height; }).toBeLessThanOrEqual(size.width);
  await page.getByRole('button', { name: 'Edit touch layout' }).tap();
  await expect(page.locator('[data-mobile-editor]')).toHaveAttribute('data-ready', 'true');
  editor = page.frameLocator('[data-mobile-editor] iframe');
  await drag(page, editor.locator('#fullscreen'), size.height * 0.4, size.width * 0.4);
  await editor.getByRole('button', { name: 'Save', exact: true }).tap();
  await page.setViewportSize(size);
  await expect.poll(async () => (await button.boundingBox())!.x).toBeCloseTo(moved.x, 0);
  await page.getByRole('button', { name: 'Edit touch layout' }).tap();
  await expect(page.locator('[data-mobile-editor]')).toHaveAttribute('data-ready', 'true');
  editor = page.frameLocator('[data-mobile-editor] iframe');
  await editor.getByRole('button', { name: 'Reset', exact: true }).tap();
  await editor.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect.poll(async () => (await button.boundingBox())!.x).toBeCloseTo(original.x, 0);
  await page.screenshot({ path: test.info().outputPath('fullscreen-default.png') });
});

test('a real tap enters and exits browser fullscreen', async ({ page }) => {
  await page.setViewportSize(sizes[1]!);
  await page.goto('/mobile-fullscreen-check');
  await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).tap();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).tap();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
});

test('the normal match fullscreen target is above its canvas and receives taps', async ({ page }) => {
  await page.setViewportSize(sizes[1]!);
  await page.goto('/mobile-fullscreen-check');
  await page.getByRole('button', { name: 'Start match', exact: true }).tap();
  const fullscreen = page.getByRole('button', { name: 'Enter fullscreen', exact: true });
  await expect(fullscreen).toHaveCount(1);
  await expect(page.locator('#match-canvas')).toBeVisible();
  expect(await fullscreen.evaluate(el => {
    const r = el.getBoundingClientRect();
    return el.contains(el.ownerDocument.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  }), 'the fullscreen target receives the tap above the match canvas').toBe(true);
  await fullscreen.tap();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).tap();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
});
