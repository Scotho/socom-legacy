import { existsSync } from 'node:fs';
import { chromium, expect, test } from '@playwright/test';
import type { FrontEndWindowHook } from '../src/frontEnd';
import { OpenedContexts } from './openedContexts';
import { installPadStub } from './padStub';
import { e2eRenderer } from './renderer';

/** Browser adaptation regression: real retail ISO and OPFS, with the reported iPhone handle-clone refusal injected.
 * Chromium touch emulation is not a physical iPhone/Chrome test. SOCOM_ISO stays local and is never uploaded.
 * The persistent profile is inside ignored test-results; a restart proves the disc survives the browser closing.
 */
const iso = process.env.SOCOM_ISO ?? '';
test.skip(!iso || !existsSync(iso), 'SOCOM_ISO absent: retail extraction skipped');
test.setTimeout(25 * 60_000);
/** Issue #91: every context this file opens -- the shared browser's and the persistent profile's -- closes after each test. */
const opened = new OpenedContexts();
test.afterEach(() => opened.closeAll());

test('disc fallback is hidden for two failed attempts and offered after the third', async ({ browser, baseURL }, info) => {
  const context = opened.add(await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true }));
  await context.addInitScript(() => {
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message: unknown, ...args: unknown[]) {
      if (message && typeof message === 'object' && 'kind' in message && message.kind === 'file') {
        throw new DOMException('Simulated storage failure for retry test', 'DataCloneError');
      }
      return Reflect.apply(post, this, [message, ...args]);
    };
  });
  const page = await context.newPage();
  await page.goto('/');
  const picker = page.waitForEvent('filechooser');
  await page.locator('#legend .cx-mark[data-mark="disc"]').tap().then(() => page.locator('#legend .cx-srcopt[data-i="0"]').tap());   // LR-24: the disc mark, then its menu's DISC ISO opens the chooser (was: the chip's tap)
  await (await picker).setFiles(iso);
  const dialog = page.locator('#overlay .cx-extract');
  const second = dialog.locator('[data-act="extract"][data-i="1"]');
  for (let attempt = 1; attempt <= 3; attempt++) {
    await expect(dialog).toHaveClass(/is-error/);
    await expect(second).toHaveText(attempt < 3 ? 'Close' : 'Continue from the disc');
    if (attempt < 3) {
      await expect(page.locator('#legend')).not.toContainText('Continue from the disc');
      await expect(dialog).not.toContainText('The game can still run from the disc');
      if (attempt === 1) await page.screenshot({ path: info.outputPath('first-failure-retry.png') });
      await dialog.locator('[data-act="extract"][data-i="0"]').tap();
    }
  }
  await page.screenshot({ path: info.outputPath('third-failure-disc-fallback.png') });
  await second.tap();
  await expect(dialog).toHaveCount(0);
});

test('touch picker extracts to disk without cloning handles, then starts after browser restart without the ISO', async ({ baseURL }, info) => {
  const profile = info.outputPath('profile');
  const options = { baseURL, viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true,
    args: e2eRenderer(process.env.S2U_E2E_RENDERER).args };
  let context = opened.add(await chromium.launchPersistentContext(profile, options));
  await context.addInitScript(() => {
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message: unknown, ...args: unknown[]) {
      if (message && typeof message === 'object' && 'kind' in message && message.kind === 'file' &&
          'target' in message && message.target instanceof FileSystemFileHandle) {
        throw new DOMException('The object can not be cloned.', 'DataCloneError');
      }
      return Reflect.apply(post, this, [message, ...args]);
    };
  });
  let page = context.pages()[0] ?? await context.newPage();
  await page.goto('/');
  await expect(page.locator('#legend .cx-mark[data-mark="disc"]')).toBeVisible();   // LR-24: the disc mark (was: the chip)
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#legend .cx-mark[data-mark="disc"]').tap().then(() => page.locator('#legend .cx-srcopt[data-i="0"]').tap());   // LR-24: the disc mark, then its menu's DISC ISO opens the chooser (was: the chip's tap)
  await (await chooser).setFiles(iso);
  const started = Date.now();
  const popover = page.locator('#overlay .cx-extract');
  await expect(popover).toBeVisible();
  await expect(popover.locator('[data-extract="where"]')).toContainText('origin private file system');
  // The ended dialog is read in the same turn that sees it end: done, it stands only EXTRACT_DONE_HOLD_MS_ADAPTATION
  // (1.2 s, `../src/discStart.ts`) before the start path takes it down, and a read after the screenshot can miss it. The
  // gate at d66580851 (LR-37's Backdrop motion On by default): the extraction ended in 21.4 s; most likely (inferred, not timed) the screenshot of the
  // drifting backdrop outlasted the hold, and the later `textContent` waited 25 min on a dialog already gone.
  const ended = await page.waitForFunction(() => {
    const dialog = document.querySelector('#overlay .cx-extract');
    if (!dialog || !(dialog.classList.contains('is-error') || dialog.classList.contains('is-done'))) return null;
    return { text: dialog.textContent ?? '', done: dialog.classList.contains('is-done'), files: dialog.querySelector('[data-extract="files"]')?.textContent?.trim() ?? '' };
  }, undefined, { timeout: 20 * 60_000 }).then((h) => h.jsonValue());
  await page.screenshot({ path: info.outputPath('extraction-result.png') });
  expect(ended!.text, 'extraction must complete, not offer ISO fallback').not.toContain('The extraction failed');
  expect(ended!.done, 'the dialog ended done').toBe(true);
  expect(ended!.files).toBe('95 of 95');
  console.log(`[discExtractMobile] full extraction: ${((Date.now() - started) / 1000).toFixed(1)} seconds`);
  await expect(popover).toHaveCount(0);
  await context.close();
  context = opened.add(await chromium.launchPersistentContext(profile, options));
  page = context.pages()[0] ?? await context.newPage();
  let reopenedPicker = false;
  page.on('filechooser', () => { reopenedPicker = true; });
  await installPadStub(page);                                            // LR-31: START needs a connected controller (the coarse-pointer path is not verified here)
  await page.goto('/');
  const disc = page.locator('#legend .cx-mark[data-mark="disc"]');   // LR-23 (LR.R22): the legend's status chip (was LR-13's disc check of Play's panel)
  await expect(disc.locator('.cx-mark__line')).toHaveText('Your disc, kept in this browser');   // LR-24: the disc mark (was: the chip)
  await expect(disc.locator('.cx-mark__word')).toHaveText('Disc ready');   // LR-24: the disc mark (was: the chip)
  await page.screenshot({ path: info.outputPath('ready-after-browser-restart.png') });
  // Read back every saved byte after restarting, not merely the record or in-memory source from the picker.
  const verified = await page.evaluate(async () => {
    const modulePath = '/src/discExtract.ts';
    const extraction = await import(/* @vite-ignore */ modulePath) as typeof import('../src/discExtract');
    const record = await extraction.storedExtraction();
    const result = await extraction.verifyExtraction();
    return { count: result.checked.length, bad: result.bad, total: record?.total, backend: record?.backend };
  });
  expect(verified).toMatchObject({ count: 95, bad: [], backend: 'opfs' });
  console.log(`[discExtractMobile] disk readback after restart: ${JSON.stringify(verified)}`);
  const networkAssets: string[] = [];
  page.on('request', (r) => { if (/\/maps\//.test(r.url())) networkAssets.push(r.url()); });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('o');
  await expect(page.locator('#front-end')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => {
    const h = (window as Window & { __frontEnd?: FrontEndWindowHook }).__frontEnd;
    return h?.events.filter((e) => e.kind === 'dialog').map((e) => (e as { name: string }).name) ?? [];
  }), { timeout: 120_000 }).toContain('dlgIntroScreen.rdr');
  expect(reopenedPicker).toBe(false);
  expect(networkAssets).toEqual([]);
  await page.screenshot({ path: info.outputPath('front-end-from-disk.png') });
});
