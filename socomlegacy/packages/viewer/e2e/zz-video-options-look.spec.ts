import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { at, focusOn, key, pressUntil, until, type Hooked } from './frontEndWalk';
import { OpenedContexts } from './openedContexts';
import { e2eRenderer } from './renderer';
import { installStartupPads } from './startupDevices';
import { SETUP } from './urls';

/**
 * **The VIDEO OPTIONS look kit** (CPS-4b's owed rendered look, plan `2026-11-02-client-performance-sprint.md`; a test-only
 * kit, product track: it drives the page and changes nothing the game does). The main menu's OPTIONS > VIDEO OPTIONS
 * (`dlgOptions_Video.rdr`, with CPS-4b's rows: `@s2u/ui` `screens/videoSettingsRows.ts`), opened as
 * `originalSettings.spec.ts` and `controllerOptions.spec.ts` open it (`./frontEndWalk`), in a 640 x 448 window at device
 * scale 1, so the front end's canvas (`#front-end`, `../src/frontEnd.ts` `mountFrontEnd`: 640 x 448, contain-fit to the
 * window) is drawn at scale 1. Four PNGs of the canvas element, to the test's output directory:
 * `video-options-opened.png` (as opened), `video-options-render-scale.png` (RENDER SCALE focused),
 * `video-options-shadows.png` (SHADOWS focused), `video-options-return.png` (RETURN focused). And what a reviewer wants of
 * CPS-4b: HELP WINDOWS (`helpwindows`) is not drawn and off the focus ring -- Down from TEAMMATE NAMES goes VIDEO MODE,
 * RENDER SCALE, SHADOWS, SHOW FPS, HEAD BOB (the disc's `helpwindows` sits between SHOW FPS and HEAD BOB in the design);
 * and RENDER SCALE's Left / Right step the page's video keeper (`localStorage['s2u.viewer.video']`, its `renderScale`).
 *
 * Kept out of the gate's `--e2e` (which runs every `*.spec.ts`, `workflow/tools/gate.py` `browser_files`) by the
 * `S2U_LOOK_KIT` guard below: without it the file is one skipped test. The runner runs it on request:
 * `S2U_LOOK_KIT=1 npx playwright test e2e/zz-video-options-look.spec.ts` from `socomlegacy/` (the served tree from
 * `npm run extract-maps`).
 */

test.skip(!process.env['S2U_LOOK_KIT'], 'the look kit runs on request: S2U_LOOK_KIT=1');
const WEB = fileURLToPath(new URL('../../..', import.meta.url));
const MAPS_DIR = join(WEB, 'public', 'maps');
test.skip(!existsSync(join(MAPS_DIR, 'index.json')), 'maps absent: extract them with npm run extract-maps');

const opened = new OpenedContexts();
test.afterEach(() => opened.closeAll());

const MENU = 'dlgMenu.rdr', OPTIONS = 'dlgOptions_Menu.rdr', VIDEO = 'dlgOptions_Video.rdr';
/** The rows' controls (`@s2u/ui` `videoSettingsRows.ts`: the disc's `TeamMateNames`, `video_mode`, `headbobbing`, `SaveAndLeaveBtn`; `VIDEO_ROWS`' three). */
const ROW = {
  teammateNames: 'TeamMateNames', videoMode: 'video_mode', renderScale: 'RenderScaleRow', shadows: 'ShadowsRow',
  showFps: 'ShowFpsRow', headBob: 'headbobbing', helpWindows: 'helpwindows', ret: 'SaveAndLeaveBtn',
} as const;
/** The window: the front end's 640 x 448 frame at scale 1. */
const FRAME = { width: 640, height: 448 } as const;
/** The kit's wait before a picture, past the focus's highlight settling (a test-only timing, no game value). */
const SHOT_SETTLE_KIT_MS = 1_000;

/** The page's video keeper as stored. */
const stored = (p: Page) => p.evaluate(() => (JSON.parse(localStorage.getItem('s2u.viewer.video') ?? '{}') as { renderScale?: string }).renderScale ?? null);
/** The focus ring's controls, by name (hidden ones are not on it). */
const ringNames = (p: Page) => p.evaluate(() => (window as Hooked).__frontEnd?.session.input.ring()?.controls.map((c) => c.name) ?? null);
/** A node of the screen: found, and whether it (and every parent) is drawn. */
const drawn = (p: Page, name: string) => p.evaluate((want) => {
  type N = { name: string; visible: boolean; parent: N | null; children: N[] };
  const root = (window as Hooked).__frontEnd?.session.machine.shell()?.screen.root as unknown as N | undefined;
  const find = (n: N): N | null => { if (n.name === want) return n; for (const k of n.children) { const f = find(k); if (f) return f; } return null; };
  const node = root ? find(root) : null;
  if (!node) return { found: false, shown: false };
  let shown = true;
  for (let n: N | null = node; n; n = n.parent) if (!n.visible) shown = false;
  return { found: true, shown };
}, name);

/** The canvas element's picture (not the page's), to the test's output directory. */
async function shot(p: Page, file: string): Promise<void> {
  await p.waitForTimeout(SHOT_SETTLE_KIT_MS);
  const path = test.info().outputPath(file);
  await p.locator('#front-end').screenshot({ path });
  await test.info().attach(file, { path, contentType: 'image/png' });
}

test('VIDEO OPTIONS look kit: opened, RENDER SCALE, SHADOWS, RETURN at 640x448 scale 1; HELP WINDOWS hidden; RENDER SCALE steps the keeper', async ({ browser }) => {
  test.setTimeout(240_000);
  test.info().annotations.push({ type: 'renderer', description: e2eRenderer(process.env.S2U_E2E_RENDERER).request });
  const context = opened.add(await browser.newContext({ viewport: FRAME, deviceScaleFactor: 1 }));
  const p = await context.newPage();
  await installStartupPads(p);
  const errors: string[] = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${SETUP}?devmode&menuflow=${MENU}`);

  await until(p, 'the main menu', (s) => s.dialog === MENU && s.ready);
  await focusOn(p, MENU, 'options_button');
  await pressUntil(p, 'Enter', 'OPTIONS', (s) => s.dialog === OPTIONS);
  await focusOn(p, OPTIONS, 'VideoOpBtn');
  await pressUntil(p, 'Enter', 'VIDEO OPTIONS', (s) => s.dialog === VIDEO);
  const first = await at(p, VIDEO);
  test.info().annotations.push({ type: 'opened-focus', description: String(first.focused) });

  // Scale 1: the canvas's frame 640 x 448, its box on the page 640 x 448.
  const canvas = await p.evaluate(() => {
    const el = document.getElementById('front-end') as HTMLCanvasElement | null;
    const r = el?.getBoundingClientRect();
    return el && r ? { width: el.width, height: el.height, boxWidth: r.width, boxHeight: r.height } : null;
  });
  expect(canvas).toEqual({ width: FRAME.width, height: FRAME.height, boxWidth: FRAME.width, boxHeight: FRAME.height });
  await shot(p, 'video-options-opened.png');

  // HELP WINDOWS: built (the disc's scripts name it) but not drawn, and off the ring.
  expect(await drawn(p, ROW.helpWindows)).toEqual({ found: true, shown: false });
  const ring = await ringNames(p);
  expect(ring).not.toBeNull();
  expect(ring).not.toContain(ROW.helpWindows);
  expect(first.enabled).not.toContain(ROW.helpWindows);
  // The walk Down from TEAMMATE NAMES: SHOW FPS steps to HEAD BOB, past the hidden row.
  await focusOn(p, VIDEO, ROW.teammateNames);
  const walk: string[] = [];
  for (const want of [ROW.videoMode, ROW.renderScale, ROW.shadows, ROW.showFps, ROW.headBob]) {
    await key(p, 'ArrowDown');
    walk.push((await at(p, VIDEO)).focused ?? '');
    expect(walk.at(-1), `Down ${walk.length} from ${ROW.teammateNames}`).toBe(want);
  }

  // RENDER SCALE: its picture as the keeper stands, then Left / Right step the stored value, ending where it began.
  await focusOn(p, VIDEO, ROW.renderScale);
  await shot(p, 'video-options-render-scale.png');
  const before = await stored(p);
  test.info().annotations.push({ type: 'render-scale-stored-before', description: String(before) });
  await key(p, 'ArrowLeft');
  await expect.poll(() => stored(p)).toBe('performance');
  await key(p, 'ArrowRight');
  await expect.poll(() => stored(p)).toBe('balanced');
  await key(p, 'ArrowRight');
  await expect.poll(() => stored(p)).toBe('quality');
  await key(p, 'ArrowLeft');
  await expect.poll(() => stored(p)).toBe('balanced');
  if (before && before !== 'balanced') {
    await key(p, before === 'performance' ? 'ArrowLeft' : 'ArrowRight');
    await expect.poll(() => stored(p)).toBe(before);
  }
  await at(p, VIDEO, ROW.renderScale);

  await focusOn(p, VIDEO, ROW.shadows);
  await shot(p, 'video-options-shadows.png');
  await focusOn(p, VIDEO, ROW.ret);
  await shot(p, 'video-options-return.png');
  expect(errors).toEqual([]);
});
