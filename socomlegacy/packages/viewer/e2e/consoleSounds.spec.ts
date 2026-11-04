import { existsSync } from 'node:fs';
import { chromium, expect, test as base, type Page } from '@playwright/test';
import { e2eRenderer } from './renderer';

/**
 * CX-51 / CX-52 (CX.R19; the owner's second word, 2026-10-20: "the sound effect pack doesn't match. please select
 * something else more subtle and or socom-like"): rendered, on the live launcher. The launcher plays the original's own
 * menu sounds off the player's disc (LAUNCHER_UI_SOUNDS_FROM_DISC_ADAPTATION) and is silent until a disc is there; the
 * build serves no sound file of its own. Web Audio is stood in for in the page (its context counts the buffers it
 * starts), so the run checks the page's own wiring. A browser adaptation; nothing of the game. Level: a rendered
 * browser run (the disc case with SOCOM_ISO only).
 */

// A normal profile has enough OPFS quota for the retail assets; an incognito context does not (`./menuTouch.spec.ts`).
const test = base.extend<{ page: Page }>({
  page: async ({ baseURL }, use, info) => {
    const context = await chromium.launchPersistentContext(info.outputPath('profile'), {
      baseURL, viewport: { width: 1280, height: 720 },
      args: e2eRenderer(process.env.S2U_E2E_RENDERER).args,
      executablePath: process.env.PW_CHROMIUM || undefined,
    });
    try { await use(context.pages()[0] ?? await context.newPage()); }
    finally { await context.close(); }
  },
});

async function stubAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __started: number; __longest: number; AudioContext: unknown };
    w.__started = 0;
    w.__longest = 0;
    class FakeContext {
      state = 'running';
      destination = {};
      resume(): Promise<void> { return Promise.resolve(); }
      close(): Promise<void> { return Promise.resolve(); }
      createBuffer(channels: number, length: number, sampleRate: number): unknown {
        const data = Array.from({ length: channels }, () => new Float32Array(length));
        return { numberOfChannels: channels, length, sampleRate, getChannelData: (i: number) => data[i] };
      }
      createGain(): unknown { return { gain: { value: 1 }, connect: () => {} }; }
      createBufferSource(): unknown {
        const n = { buffer: null as { length: number } | null, connect: () => {}, start: () => { w.__started += 1; w.__longest = Math.max(w.__longest, n.buffer?.length ?? 0); } };
        return n;
      }
    }
    w.AudioContext = FakeContext;
  });
}

const started = (page: Page) => page.evaluate(() => (window as unknown as { __started: number }).__started);
const longest = (page: Page) => page.evaluate(() => (window as unknown as { __longest: number }).__longest);

test('no disc: the first key unlocks, a move is silent, and no sound file is requested', async ({ page }) => {
  const sounds: string[] = [];
  // An audio file's request (the dev server's own modules under `sounds/` are code, not sound).
  page.on('request', (r) => { if (/\.(wav|ogg|mp3|m4a|vag|bnk)(\?|$)/i.test(r.url())) sounds.push(r.url()); });
  await stubAudio(page);
  await page.goto('/');
  await expect(page.locator('#stage .cx-cat.is-current')).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(500);
  expect(await started(page)).toBe(0);
  expect(sounds).toEqual([]);
});

const ISO = process.env.SOCOM_ISO ?? '';
test('with the disc: a move plays HUDUI\'s own sound, rendered off the disc', async ({ page }) => {
  test.skip(!ISO || !existsSync(ISO), 'SOCOM_ISO absent');
  test.setTimeout(240_000);
  await stubAudio(page);
  await page.goto('/');
  await page.setInputFiles('#disc-page-file', ISO);
  // LR-23 (LR.R22): the Disc step is the legend's status chip; READY is its "Disc ready" (was LR-13's disc check of Play's panel).
  await expect(page.locator('#legend .cx-mark[data-mark="disc"] .cx-mark__word')).toHaveText('Disc ready', { timeout: 120_000 });   // LR-24: the disc mark (was: the chip)
  // The disc's own copy (DX-3) may be offered or refused here; the opened image is the disc either way, so its dialog is
  // closed and the sounds come off the image.
  const extract = page.locator('#overlay .cx-extract');
  if (await extract.count()) { await extract.getByRole('button', { name: 'Close', exact: true }).last().click(); await expect(extract).toHaveCount(0); }
  await page.keyboard.press('ArrowDown');                           // the first gesture: the context made
  await expect.poll(async () => {
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    return started(page);
  }, { timeout: 30_000 }).toBeGreaterThan(0);
  expect(await longest(page)).toBeGreaterThan(1000);                // a rendered sound, not an empty buffer
});
