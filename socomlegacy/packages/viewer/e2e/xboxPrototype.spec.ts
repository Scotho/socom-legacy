import { test, expect, chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Dev-disc experiment: separate browser processes, same source/map/camera and animation.
// Captures are local artifacts, never fixtures or assets to publish.
test('compare real map and animated player on both WebGL2 paths', async ({}, testInfo) => {
  test.skip(!process.env.SOCOM_ISO, 'SOCOM_ISO is required for this dev-disc comparison');
  test.setTimeout(360000);
  let separatePixels: Buffer | undefined, unculledPixels: Buffer | undefined, unculledDraws = 0;
  for (const variant of ['raw-unculled', 'raw-separate', 'raw', 'current']) {
    const backend = variant.startsWith('raw') ? 'raw' : variant;
    const browser = await chromium.launch({ ...testInfo.project.use.launchOptions,
      channel: process.env.XBOX_TEST_BROWSER ?? testInfo.project.use.channel, headless: true });
    try {
      const cdp = await browser.newBrowserCDPSession();
      const gpu = (await cdp.send('SystemInfo.getInfo')).gpu;
      const memory: { atMs: number; privateBytes: number }[] = [];
      const begin = Date.now();
      const sample = async () => {
        if (process.platform !== 'win32') return;
        const info = await cdp.send('SystemInfo.getProcessInfo');
        const ids = info.processInfo.map(p => Math.trunc(p.id)).filter(id => id > 0);
        const script = `$p=Get-Process -Id ${ids.join(',')} -ErrorAction SilentlyContinue; ($p | Measure-Object -Property PrivateMemorySize64 -Sum).Sum`;
        const bytes = Number(execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 10000 }).trim());
        if (!Number.isFinite(bytes) || bytes <= 0) throw new Error('Browser process memory sample unavailable');
        memory.push({ atMs: Date.now() - begin, privateBytes: bytes });
      };
      const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
      const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
      let substituted = false;
      if (variant === 'raw-unculled') await page.route('**/src/xboxPrototype/visibility.ts*', async route => {
        const response = await page.request.get(`${testInfo.project.use.baseURL}/e2e/xboxUnculled.ts`);
        expect(response.ok()).toBe(true); substituted = true; await route.fulfill({ response });
      });
      if (variant === 'raw-separate') await page.route('**/src/xboxPrototype/bufferArena.ts*', async route => {
        const response = await page.request.get(`${testInfo.project.use.baseURL}/e2e/xboxSeparateBuffers.ts`);
        expect(response.ok()).toBe(true); substituted = true; await route.fulfill({ response });
      });
      await page.goto(`${testInfo.project.use.baseURL}/xbox-renderer/index.html?backend=${backend}&capture=120`);
      await page.locator('#disc').setInputFiles(process.env.SOCOM_ISO!);
      await sample();
      await page.locator('#start').click();
      let report: Record<string, unknown> = {};
      const deadline = Date.now() + 100000;
      while (Date.now() < deadline) {
        await sample();
        report = await page.evaluate(() => (window as unknown as { xboxPrototypeReport(): Record<string, unknown> }).xboxPrototypeReport());
        if (report.stage === 'failed' || Number(report.frames) >= 120) break;
        await page.waitForTimeout(500);
      }
      const resultPath = testInfo.outputPath(`${variant}-report.json`);
      await writeFile(resultPath, JSON.stringify({ variant, report, browserVersion: browser.version(),
        gpu: { devices: gpu.devices, auxAttributes: gpu.auxAttributes },
        memory: { metric: 'Sum of Windows PrivateMemorySize64 for CDP-reported browser process IDs; sampled, not total system or Xbox usage',
          baselineBytes: memory[0]?.privateBytes ?? null, peakBytes: memory.length ? Math.max(...memory.map(m => m.privateBytes)) : null, samples: memory } }, null, 2));
      await testInfo.attach(`${variant}-report`, { path: resultPath, contentType: 'application/json' });
      const capture = await page.locator('#view').screenshot({ path: testInfo.outputPath(`${variant}.png`) });
      const pixels = await sharp(capture).removeAlpha().raw().toBuffer();
      const colors = new Set<number>();
      for (let i = 0; i < pixels.length; i += 3) colors.add((pixels[i]! << 16) | (pixels[i + 1]! << 8) | pixels[i + 2]!);
      expect(colors.size, 'a blank or solid-color canvas is not a rendered map').toBeGreaterThan(100);
      expect(report.error).toBe(''); expect(Number(report.frames)).toBe(120);
      expect(report.poseChanged).toBe(true); expect(errors).toEqual([]);
      if (variant === 'raw-separate') { expect(substituted).toBe(true); separatePixels = pixels; }
      if (variant === 'raw-unculled') {
        expect(substituted).toBe(true); unculledPixels = pixels;
        unculledDraws = (report.resources as { drawCalls: number }).drawCalls;
      }
      if (variant === 'raw') {
        expect((report.resources as { buffers: number }).buffers).toBe(2);
        expect(pixels.equals(separatePixels!), 'packing GPU buffers must preserve every captured pixel').toBe(true);
        expect(pixels.equals(unculledPixels!), 'off-screen rejection must preserve every captured pixel').toBe(true);
        const resources = report.resources as { drawCalls: number; culledBatches: number };
        expect(resources.culledBatches).toBeGreaterThan(0);
        expect(resources.drawCalls).toBeLessThan(unculledDraws);
      }
      await page.locator('#stop').click();
      await expect(page.locator('#status')).toContainText('stopped');
    } finally { await browser.close(); }
  }
});
