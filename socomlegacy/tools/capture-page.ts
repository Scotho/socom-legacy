/**
 * The page side of the capture harness (PLAT-30; web research 108 §7): the viewer's 640x448 PS2 frame, captured in
 * Playwright, and -- with a step script -- driven by drive.py's vocabulary into a run directory the gate reads.
 *
 *   npx tsx tools/capture-page.ts <out-dir> [--port 5301] [--map MP2] [--script steps.txt] [--settle 1.5] [--tail 8]
 *
 * Dev host only, and lock-bound: a browser is CPU-heavy, so it asks the PC project's `scripts/loop_lock.sh check`
 * first (`SOCOM_PC_ROOT`, else `C:/Projects/socom_pc`: `captureLock.ts`) and refuses (exit 3) unless the answer begins
 * with FREE -- also when the lock cannot be asked (no script found, bash not run). It starts its own Vite
 * server on `--port` (default 5301; the developer's 5181 and 8787 are refused, `packages/viewer/e2e/ports.ts`), serving
 * the extracted tree under `socomlegacy/public/maps/` as the e2e run does.
 *
 * The frame: the PS2 presentation resizes the renderer's drawing buffer to 640x448 (`packages/viewer/src/main.ts`
 * `fit`, PS2_FRAME) and the page stretches it to 4:3 with CSS. The capture pins the canvas's CSS box to 640x448 at a
 * device scale of 1, so the element screenshot is the drawing buffer pixel for pixel, and refuses any other size.
 * Without `--script` it writes `<out>/page.png`; with one, the run's `sNN_*.png`, `wNN_*.png`, `final.png` and
 * `manifest.json`. The page draws the map viewer today, not the front end: PLAT-05..PLAT-17 bring the screens the title
 * scripts expect, so a title script run here reaches no menu (research 108 §7).
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { decodePng, type Rgb } from './captureImage';
import { askHostLock } from './captureLock';
import { FRAME } from './captureScore';
import { manifestJson, parseSteps, runSteps, type FrameDriver } from './captureSteps';
import { readPng, writePng } from './captureRun';
import { e2ePort } from '../packages/viewer/e2e/ports';
import { testRoomUrl } from './pageUrls';

/**
 * PAGE_KEYS_READING: the PC key the page reads for each PS2 button a step script presses -- the ARMORY's menu keys
 * (`packages/viewer/src/armory.ts` ARMORY_MENU_KEYS_READING: the arrows the d-pad, Enter Cross, Backspace Triangle,
 * R Circle, V Square), the only menu keys the page has. START and SELECT have none there; a script that presses one is
 * refused. The front end's own keyboard map is PLAT-11's.
 */
export const PAGE_KEYS_READING: Readonly<Record<string, string>> = {
  CROSS: 'Enter', TRIANGLE: 'Backspace', CIRCLE: 'KeyR', SQUARE: 'KeyV',
  UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight',
};

const args = process.argv.slice(2);
const opt = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const out = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!out) {
  console.error('usage: npx tsx tools/capture-page.ts <out-dir> [--port 5301] [--map MP2] [--script steps.txt] [--settle 1.5] [--tail 8]');
  process.exit(2);
}

// The lock: one CPU-heavy job at a time on this host; a lock that cannot be asked refuses too (captureLock.ts).
const pcRoot = process.env.SOCOM_PC_ROOT;
const lock = askHostLock();
if (!lock.free) {
  console.error(`capture-page: the host lock is not free (${lock.line}); refusing to start a browser`);
  process.exit(3);
}

const port = e2ePort('--port', opt('port', '5301'), 5301);
const map = opt('map', 'MP2').toUpperCase();
const redotcom = resolve(import.meta.dirname, '..');
mkdirSync(out, { recursive: true });

const vite = spawn(`npx vite --config packages/viewer/vite.config.ts --port ${port} --strictPort`,
  { cwd: redotcom, shell: true, stdio: 'ignore', env: { ...process.env, VITE_S2U_ROOMS: 'off' } });
const base = `http://localhost:${port}`;
const stop = (): void => {
  if (process.platform === 'win32' && vite.pid) spawnSync('taskkill', ['/pid', String(vite.pid), '/T', '/F']);
  else vite.kill();
};

async function ready(): Promise<void> {
  for (let i = 0; i < 240; i++) {
    try { if ((await fetch(`${base}/maps/index.json`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`capture-page: no server at ${base}/maps/index.json after 120 s (is public/maps/ extracted?)`);
}

/** The canvas as drawn, 640x448, pixel for pixel. */
async function grab(page: Page): Promise<Rgb> {
  const img = decodePng(await page.locator('#view').screenshot());
  if (img.width !== FRAME.width || img.height !== FRAME.height) {
    throw new Error(`capture-page: the canvas captured ${img.width}x${img.height}, not ${FRAME.width}x${FRAME.height}`);
  }
  return img;
}

try {
  await ready();
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    executablePath: process.env.PW_CHROMIUM || undefined,
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${testRoomUrl(base)}?mode=play&fly&map=${map}&devmode`);
  await page.locator('#status').filter({ hasText: 'triangles' }).waitFor({ state: 'attached', timeout: 180_000 });
  await page.locator('#ps2look').evaluate((el) => {
    const box = el as HTMLInputElement;
    if (!box.checked) { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.addStyleTag({ content: `#view { width: ${FRAME.width}px !important; height: ${FRAME.height}px !important; }` });
  await page.waitForTimeout(1500);

  const script = opt('script', '');
  if (!script) {
    const img = await grab(page);
    writePng(join(out, 'page.png'), img);
    console.log(`capture-page: ${join(out, 'page.png')} (${img.width}x${img.height}, ${map})`);
  } else {
    const t0 = Date.now();
    const driver: FrameDriver = {
      grab: () => grab(page),
      press: async (b, hold) => {
        const key = PAGE_KEYS_READING[b];
        if (!key) throw new Error(`capture-page: no page key for ${b} (PAGE_KEYS_READING)`);
        if (hold) { await page.keyboard.down(key); await page.waitForTimeout(hold * 1000); await page.keyboard.up(key); }
        else await page.keyboard.press(key);
      },
      now: () => (Date.now() - t0) / 1000,
      sleep: (s) => page.waitForTimeout(s * 1000),
      save: async (name, img) => writePng(join(out, name), img),
      loadRef: async (p) => readPng(resolve(pcRoot ?? resolve(redotcom, '..'), p)),
      log: (line) => console.log(line),
    };
    const manifest = await runSteps(parseSteps(readFileSync(script, 'utf8')), driver,
      { settle: Number(opt('settle', '1.5')), tail: Number(opt('tail', '8')) });
    writeFileSync(join(out, 'manifest.json'), manifestJson(manifest));
    console.log(`capture-page: ${manifest.length} steps written to ${out}`);
  }
  await browser.close();
} finally {
  stop();
}
