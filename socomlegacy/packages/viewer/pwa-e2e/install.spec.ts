import { expect, test } from '@playwright/test';

/**
 * PWA-7: the shell is installable (manifest, 192 and 512 icons, a fetch handler) and a new release reloads only
 * outside a match. `beforeinstallprompt` is not required: Chromium does not fire it for every page. No disc.
 */

test('the manifest, the icons and the worker are served, and Range and HEAD reach the server', async ({ page, request }) => {
  await request.post('/release', { data: 'build-a' });
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.headers()['content-type']).toContain('application/manifest+json');
  const body = await manifest.json() as { name: string; display: string; display_override: string[]; icons: { sizes: string; purpose: string }[]; screenshots: { src: string }[] };
  expect(body.name).toBe('SOCOM II Legacy');
  expect(body.display).toBe('fullscreen');
  expect(body.display_override).toEqual(['fullscreen', 'standalone']);
  expect(body.icons.some((i) => i.sizes === '192x192' && i.purpose === 'any')).toBe(true);
  expect(body.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
  for (const src of ['/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', ...body.screenshots.map((s) => s.src)]) {
    const icon = await request.get(src);
    expect(icon.status(), src).toBe(200);
    expect(icon.headers()['content-type'], src).toContain('image/png');
    expect((await icon.body()).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  }
  const sw = await request.get('/sw.js');
  expect(await sw.text()).toContain('"build-a"');

  await page.goto('/install.html');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  const ready = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
    const script = reg.active?.scriptURL ?? '';
    return script.endsWith('/sw.js');
  });
  expect(ready).toBe(true);
  const before = await (await request.get('/hits')).json() as { hits: number };
  const ranged = await page.evaluate(async () => {
    const res = await fetch('/maps/piece.zdb', { headers: { Range: 'bytes=0-1' } });
    const head = await fetch('/maps/piece.zdb', { method: 'HEAD' });
    return { status: res.status, head: head.status, bytes: (await res.arrayBuffer()).byteLength };
  });
  expect(ranged).toEqual({ status: 206, head: 200, bytes: 2 });
  const after = await (await request.get('/hits')).json() as { hits: number };
  expect(after.hits).toBeGreaterThanOrEqual(before.hits + 2);
});

test('a new release reloads outside a match and waits through one', async ({ page, request }) => {
  await request.post('/release', { data: 'build-a' });
  await page.goto('/update.html?rev=build-a');
  await page.waitForFunction(() => (window as unknown as { __pwa?: { reloads: number } }).__pwa !== undefined);
  await page.waitForTimeout(400);
  expect(page.url()).not.toContain('reloaded=1');

  await request.post('/release', { data: 'build-b' });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForURL(/reloaded=1/);

  await request.post('/release', { data: 'build-b' });
  await page.goto('/update.html?rev=build-a&match=1');
  await page.waitForFunction(() => (window as unknown as { __pwa?: { reloads: number } }).__pwa !== undefined);
  await page.waitForTimeout(500);
  expect(page.url()).not.toContain('reloaded=1');
  await page.evaluate(() => (window as unknown as { __setMatch: (on: boolean) => void }).__setMatch(false));
  await page.waitForURL(/reloaded=1/);
});

test('a first visit does not reload when the worker claims, including a match link', async ({ page, request }) => {
  await request.post('/release', { data: 'build-a' });
  await page.goto('/live.html?match=1');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  expect(await page.evaluate(() => sessionStorage.getItem('pwa-loads'))).toBe('1');
  await page.waitForTimeout(2500);
  expect(page.url()).not.toContain('reloaded=1');
  expect(await page.evaluate(() => sessionStorage.getItem('pwa-loads'))).toBe('1');
});

test('a match in another tab is not reloaded when the launcher takes the new worker', async ({ page, request }) => {
  await request.post('/release', { data: 'build-a' });
  const match = page;
  await match.goto('/live.html?match=1');
  await match.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await match.goto('/live.html?match=1');
  await match.waitForFunction(() => sessionStorage.getItem('pwa-loads') === '2');
  expect(match.url()).not.toContain('reloaded=1');

  const launcher = await match.context().newPage();
  await launcher.goto('/live.html');
  await launcher.waitForFunction(() => (window as unknown as { __checkUpdate?: unknown }).__checkUpdate !== undefined);

  await request.post('/release', { data: 'build-b' });
  await launcher.evaluate(() => (window as unknown as { __checkUpdate: () => Promise<void> }).__checkUpdate());
  await launcher.waitForURL(/reloaded=1/);

  await match.waitForTimeout(2000);
  expect(match.url()).not.toContain('reloaded=1');
  expect(await match.evaluate(() => sessionStorage.getItem('pwa-loads'))).toBe('2');

  await match.evaluate(() => (window as unknown as { __setMatch: (on: boolean) => void }).__setMatch(false));
  await match.waitForURL(/reloaded=1/);
});

test('a file-picked disc shows a restart notice, Restart loads once, and START GAME stays clickable', async ({ page, request }) => {
  await request.post('/release', { data: 'build-a' });
  await page.goto('/live.html?disc=1&rev=build-a');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.goto('/live.html?disc=1&rev=build-a');
  await page.waitForFunction(() => (window as unknown as { __checkUpdate?: unknown }).__checkUpdate !== undefined);
  expect(await page.evaluate(() => sessionStorage.getItem('pwa-loads'))).toBe('2');
  await page.evaluate(() => {
    const w = window as unknown as { __cc?: number };
    w.__cc = 0;
    navigator.serviceWorker.addEventListener('controllerchange', () => { w.__cc = (w.__cc ?? 0) + 1; });
  });
  // Let the startup revision check finish against build A before the release moves.
  await page.waitForTimeout(300);

  await request.post('/release', { data: 'build-b' });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('[data-pwa-update]')).toContainText('New version available, restart');
  // The new worker stays waiting. Taking over now would delete this page's cached chunks.
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg?.waiting != null && ((window as unknown as { __cc?: number }).__cc ?? 0) === 0;
  });
  expect(page.url()).not.toContain('reloaded=');
  expect(await page.evaluate(() => sessionStorage.getItem('pwa-loads'))).toBe('2');

  const start = page.getByRole('button', { name: 'START GAME' });
  const noticeBox = await page.locator('[data-pwa-update]').boundingBox();
  const startBox = await start.boundingBox();
  expect(noticeBox && startBox && noticeBox.y + noticeBox.height <= startBox.y).toBe(true);
  await start.evaluate((el) => { el.addEventListener('click', () => { (window as unknown as { __started?: boolean }).__started = true; }); });
  await start.click();
  expect(await page.evaluate(() => (window as unknown as { __started?: boolean }).__started)).toBe(true);

  await page.locator('[data-pwa-restart]').click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get('reloaded') === '1');
  await page.waitForTimeout(3500);
  expect(new URL(page.url()).searchParams.get('reloaded')).toBe('1');
  expect(await page.evaluate(() => sessionStorage.getItem('pwa-reloads'))).toBe('1');
  expect(await page.evaluate(() => sessionStorage.getItem('pwa-loads'))).toBe('3');
});

test('forge Play and Save stay clickable while the notice is up', async ({ page, request }) => {
  await request.post('/release', { data: 'build-a' });
  await page.goto('/forge?notice=1');
  const notice = page.locator('[data-pwa-update]');
  await expect(notice).toBeVisible();
  await expect(notice.getByRole('button', { name: 'Restart' })).toBeVisible();
  await expect(notice.getByRole('button', { name: 'Later' })).toBeVisible();
  const bar = await page.locator('.fx-top').boundingBox();
  const toast = await notice.boundingBox();
  expect(bar && toast && toast.y >= bar.y + bar.height).toBe(true);
  const play = page.locator('.fx-play');
  const save = page.getByRole('button', { name: 'Save' });
  for (const control of [play, save]) {
    const box = await control.boundingBox();
    expect(box).toBeTruthy();
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.fx-top') != null, {
      x: box!.x + box!.width / 2,
      y: box!.y + box!.height / 2,
    });
    expect(hit).toBe(true);
  }
  await play.evaluate((el) => { el.addEventListener('click', () => { (window as unknown as { __play?: boolean }).__play = true; }); });
  await save.evaluate((el) => { el.addEventListener('click', () => { (window as unknown as { __save?: boolean }).__save = true; }); });
  await play.click();
  await save.click();
  expect(await page.evaluate(() => ({
    play: (window as unknown as { __play?: boolean }).__play === true,
    save: (window as unknown as { __save?: boolean }).__save === true,
  }))).toEqual({ play: true, save: true });
  await notice.locator('[data-pwa-later]').click();
  await expect(notice).toBeHidden();
});

test('the launcher header stays unclipped while the notice is up; the game page keeps it (CX.R18), a match hides it', async ({ page, request }) => {
  await request.post('/release', { data: 'build-a' });
  await page.goto('/launcher?notice=1');
  const notice = page.locator('[data-pwa-update]');
  await expect(notice).toBeVisible();
  const header = page.locator('.cx-header');
  const box = await header.boundingBox();
  const toast = await notice.boundingBox();
  expect(box && toast && (toast.y >= box.y + box.height || toast.y + toast.height <= box.y)).toBe(true);
  for (const x of [box!.x + 8, box!.x + box!.width / 2, box!.x + box!.width - 8]) {
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.cx-header') != null, {
      x, y: box!.y + 8,
    });
    expect(hit).toBe(true);
  }
  await page.evaluate(() => {
    document.documentElement.removeAttribute('data-console');
    document.body.classList.add('ps2-look');
    // The front end's canvas as the page mounts it (`frontEnd.ts`): a fixed full-window layer at z-index 1000.
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;z-index:1000;width:100vw;height:100vh;background:#000';
    document.body.append(canvas);
  });
  await expect(notice).toBeVisible();                        // CX.R18: the front end shows it; the update waits for Restart
  const over = await notice.boundingBox();                   // the joint review's F1: drawn over the canvas, not under it
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-pwa-update]') != null, {
    x: over!.x + over!.width / 2, y: over!.y + over!.height / 2,
  })).toBe(true);
  await page.evaluate(() => { document.body.classList.add('is-matching'); });   // a match (the forge's mark)
  await expect(notice).toBeHidden();
});

test('the running page still loads its own chunk after the next build is deployed', async ({ page, request }) => {
  await request.post('/release', { data: 'build-a' });
  await page.goto('/live.html?disc=1&rev=build-a');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.goto('/live.html?disc=1&rev=build-a');
  await page.waitForFunction(() => sessionStorage.getItem('pwa-loads') === '2');
  await page.waitForFunction(async () => {
    const keys = await caches.keys();
    for (const key of keys) {
      if (await (await caches.open(key)).match('/assets/index-a.js')) return true;
    }
    return false;
  });
  await request.post('/release', { data: 'build-b' });
  expect((await request.get('/assets/index-a.js')).status()).toBe(404);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.waiting != null);
  expect(page.url()).not.toContain('reloaded=');
  expect(await page.evaluate(async () => {
    const res = await fetch('/assets/index-a.js');
    return { status: res.status, text: await res.text() };
  })).toEqual({ status: 200, text: 'chunk-a' });
});
