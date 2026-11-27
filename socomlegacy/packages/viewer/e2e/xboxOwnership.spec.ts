import { expect, test } from '@playwright/test';

test('walking keeps its rig but releases decoded GPU upload sources', async ({ page }) => {
  test.skip(!process.env.SOCOM_ISO, 'Requires SOCOM_ISO');
  test.setTimeout(90000);
  // Weak references observe reachability, not a browser memory allowance. Explicit
  // test-only GC makes this independent of the browser's normal collection schedule.
  await page.addInitScript(() => {
    const observed: { name: string; ref: WeakRef<object> }[] = [];
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', ({ data }) => {
          if (data.kind !== 'map') return;
          const map = data.map;
          const watch = (name: string, value: object | undefined) => { if (value) observed.push({ name, ref: new WeakRef(value) }); };
          watch('map', map);
          const positions = map.body?.subMeshes[0]?.positions;
          const pixels = (Object.values(map.textures)[0] as { data: Uint8Array } | undefined)?.data;
          watch('body geometry', positions); watch('body backing buffer', positions?.buffer);
          watch('texture pixels', pixels); watch('texture backing buffer', pixels?.buffer);
        });
      }
    };
    Object.assign(window, { xboxUploadReachability: () => observed.map(({ name, ref }) => ({ name, retained: !!ref.deref() })) });
  });
  await page.goto('/xbox-renderer/index.html?mode=walk');
  await page.locator('#disc').setInputFiles(process.env.SOCOM_ISO!);
  await page.locator('#start').click();
  await expect(page.locator('#status')).toContainText('rendering', { timeout: 60000 });
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('HeapProfiler.collectGarbage');
    const retained = await page.evaluate(() => (window as unknown as {
      xboxUploadReachability(): { name: string; retained: boolean }[];
    }).xboxUploadReachability());
    expect(retained.map(entry => entry.name)).toEqual(['map', 'body geometry', 'body backing buffer', 'texture pixels', 'texture backing buffer']);
    expect(retained.filter(entry => entry.retained)).toEqual([]);
    await page.bringToFront(); await page.locator('#view').focus();
    // Let the runtime's focus gate resume input before sending the first keydown.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.keyboard.down('KeyW');
    try { await expect.poll(async () => page.evaluate(() => {
      const r = (window as unknown as { xboxPrototypeReport(): { movement: { velocity: number[] } } }).xboxPrototypeReport();
      return Math.hypot(r.movement.velocity[0]!, r.movement.velocity[2]!);
    })).toBeGreaterThan(1); } finally { await page.keyboard.up('KeyW'); }
    await page.locator('#stop').click();
  } finally { await cdp.detach().catch(() => undefined); }
});
