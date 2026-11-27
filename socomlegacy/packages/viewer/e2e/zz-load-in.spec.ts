import { execSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { OpenedContexts } from './openedContexts';

/**
 * **WM-37, the direct link's load-in and the launcher's hand-over** (the owner's "12 b approved on both", 2026-11-15;
 * a capture kit, product track: it drives the page's own modules and changes nothing the game does). Modelled on the
 * look prototype's `e2e/zz-mega-mock-12.spec.ts` (`agent/spc-mega-mock-launch` d16e9705b4), with no look switch: the
 * build's own drawing.
 *
 * 1. The cover (`../src/lobbyLinkCover.ts` `showLobbyLinkCover`, the module the dev server serves) over the launcher's
 *    page (`/`; the cover is opaque over the whole window), fed STAGED stages through its own `draw` and `stage` -- the
 *    calls `../src/frontEnd.ts` makes each frame with the hidden path's screen -- nothing drawn by the spec:
 *    `load-in-1-disc-<size>.png` (`LOAD_IN_DISC`, the hand-over's stage), `load-in-2-load-<size>.png` (the boot,
 *    `stage(null)`), `load-in-3-connect-<size>.png` (`stage('dlgNetConnect.rdr')`), `load-in-4-lobby-<size>.png`
 *    (`stage('dlgGameLobby.rdr')`); then `hide`, the fade, the element gone. The sound hold is not exercised here (no
 *    front end runs, so no output is passed to `stage`): `../test/loadIn.test.ts` holds it, the condition included.
 * 2. The launcher's own DEPLOYING hand-over on its sample page (`/console?sample`: START opens the hand-over and mounts
 *    nothing), the OPTIONS button (START) pressed: `load-in-handover-<size>.png`, the shared panel with its Back.
 *
 * At 1920x1080 (desktop) and 400x860 (phone), device scale 1, into `S2U_LOAD_IN_OUT` (the test's output directory
 * without it), with a JSON line a capture in its `captures.jsonl`. Kept out of the gate's `--e2e` by the guard below. On
 * request, from `socomlegacy/`:
 *   S2U_LOAD_IN_CAPTURE=1 S2U_LOAD_IN_OUT=<dir> node node_modules/@playwright/test/cli.js test packages/viewer/e2e/zz-load-in.spec.ts
 */
test.skip(!process.env['S2U_LOAD_IN_CAPTURE'], 'the WM-37 load-in captures run on request: S2U_LOAD_IN_CAPTURE=1');

const opened = new OpenedContexts();
test.afterEach(() => opened.closeAll());

const SIZES = { desktop: { width: 1920, height: 1080 }, phone: { width: 400, height: 860 } } as const;
const COVER = '#lobby-link-cover';
/** The page's own modules as the dev server serves them. */
const MODULES = { cover: '/src/lobbyLinkCover.ts', loadIn: '/src/loadIn.ts' } as const;
const SETTLE_MS = 900;                                      // the panel's entrance (six parts, 60 ms apart, 600 ms each) settled

type Step = 'disc' | 'load' | 'connect' | 'lobby' | 'hide';
/** One step of the staged sequence, run in the page against its own cover; the cover's stage after it. */
const stageCover = (page: Page, step: Step): Promise<string | null> => page.evaluate(async ([s, m, cover]) => {
  const c = await import(/* @vite-ignore */ m.cover) as typeof import('../src/lobbyLinkCover');
  const li = await import(/* @vite-ignore */ m.loadIn) as typeof import('../src/loadIn');
  const w = window as unknown as { __loadInCover?: ReturnType<typeof c.showLobbyLinkCover> };
  if (s === 'disc') { w.__loadInCover = c.showLobbyLinkCover(document); w.__loadInCover.draw(li.LOAD_IN_DISC); }
  else if (s === 'load') { document.documentElement.removeAttribute('data-console'); w.__loadInCover!.stage(null, null); }
  else if (s === 'connect') w.__loadInCover!.stage('dlgNetConnect.rdr', null);
  else if (s === 'lobby') w.__loadInCover!.stage('dlgGameLobby.rdr', null);
  else w.__loadInCover!.hide();
  return document.querySelector<HTMLElement>(cover)?.dataset['stage'] ?? null;
}, [step, MODULES, COVER] as const);

const record = (out: string, line: Record<string, unknown>): void => { appendFileSync(join(out, 'captures.jsonl'), `${JSON.stringify(line)}\n`); };

for (const [size, viewport] of Object.entries(SIZES)) {
  test(`WM-37: the direct link's load-in, four stages and the hand-off, ${size}`, async ({ browser }, info) => {
    test.setTimeout(4 * 60_000);
    const out = process.env['S2U_LOAD_IN_OUT'] || info.outputPath();
    mkdirSync(out, { recursive: true });
    const sha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    const context = opened.add(await browser.newContext({ viewport, deviceScaleFactor: 1, storageState: { cookies: [], origins: [] } }));
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(page.locator('#stage .cx-cat.is-current')).toHaveCount(1, { timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    for (const [i, step] of (['disc', 'load', 'connect', 'lobby'] as const).entries()) {
      expect(await stageCover(page, step)).toBe(step);
      await expect(page.locator(COVER)).toBeVisible();
      await page.waitForTimeout(SETTLE_MS);
      const file = `load-in-${i + 1}-${step}-${size}.png`;
      await page.screenshot({ path: join(out, file) });
      record(out, { file, call: 'WM-37', form: size, viewport, sha, browser: `chromium ${browser.version()}`, at: new Date().toISOString() });
    }
    expect(await stageCover(page, 'hide')).toBe('lobby');
    await expect(page.locator(`${COVER}.is-leaving`)).toHaveCount(1);
    await expect(page.locator(COVER)).toHaveCount(0, { timeout: 5_000 });
    expect(errors).toEqual([]);
  });

  test(`WM-37: the launcher's DEPLOYING hand-over, the shared panel, ${size}`, async ({ browser }, info) => {
    test.setTimeout(4 * 60_000);
    const out = process.env['S2U_LOAD_IN_OUT'] || info.outputPath();
    mkdirSync(out, { recursive: true });
    const sha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    const context = opened.add(await browser.newContext({ viewport, deviceScaleFactor: 1, storageState: { cookies: [], origins: [] } }));
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/console?sample');
    await expect(page.locator('#stage .cx-cat.is-current')).toHaveCount(1, { timeout: 60_000 });
    await page.keyboard.press('o');                                      // the OPTIONS button: START
    const launch = page.locator('#overlay [data-key="launch"]');
    if (!(await launch.isVisible().catch(() => false))) {
      await page.waitForTimeout(1_000);
      if (!(await launch.isVisible().catch(() => false))) await page.keyboard.press('Enter');   // Play SOCOM II's Cross
    }
    await expect(launch).toBeVisible({ timeout: 30_000 });
    await expect(launch.locator('.dp')).toBeVisible();
    await expect(launch.locator('.cx-launch__back')).toBeVisible();
    await page.waitForTimeout(SETTLE_MS);
    const file = `load-in-handover-${size}.png`;
    await page.screenshot({ path: join(out, file) });
    record(out, { file, call: 'WM-37', form: size, viewport, sha, browser: `chromium ${browser.version()}`, at: new Date().toISOString() });
    expect(errors).toEqual([]);
  });
}
