import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { at, focusOn, key, pressUntil, until, type Hooked } from './frontEndWalk';
import { OpenedContexts } from './openedContexts';
import { installStartupPads } from './startupDevices';
import { SETUP } from './urls';

/**
 * **WM-6A's capture kit** (product track, a test instrument: it drives the page and checks nothing of the game). The main
 * menu's OPTIONS, VIDEO OPTIONS, AUDIO OPTIONS and CONTROLLER PRESETS with the ADVANCED entry (`../src/settingsAdvanced`),
 * opened as `zz-video-options-look.spec.ts` opens them (`./frontEndWalk`), in a 640 x 448 window at device scale 1 so the
 * front end's canvas (`#front-end`) is drawn at scale 1. For each screen: the canvas's picture with the entry
 * (`advanced-<screen>.png`), then its key -- Enter (CROSS) on the OPTIONS row, V (a development build's SQUARE,
 * `../src/menuInput` `MENU_KEYS_READING`) on the other three -- opens the launcher overlay (`iframe.mu-overlay-frame`); its
 * picture (`advanced-<screen>-launcher.png`); F9 (`OVERLAY_TOGGLE_ADAPTATION`, a development build's key) closes it and
 * the front end is on the same screen, as it stood.
 *
 * Kept out of the gate's `--e2e` by the `S2U_SETTINGS_ADVANCED` guard: without it the file is one skipped test. On request:
 * `S2U_SETTINGS_ADVANCED=1 npx playwright test e2e/zz-settings-advanced.spec.ts` from `socomlegacy/` (the served tree from
 * `npm run extract-maps`). Written for WM-6A, not run by its implementer (the brief's rule: the seat runs browsers).
 */

test.skip(!process.env['S2U_SETTINGS_ADVANCED'], 'the WM-6A capture kit runs on request: S2U_SETTINGS_ADVANCED=1');
const WEB = fileURLToPath(new URL('../../..', import.meta.url));
test.skip(!existsSync(join(WEB, 'public', 'maps', 'index.json')), 'maps absent: extract them with npm run extract-maps');

const opened = new OpenedContexts();
test.afterEach(() => opened.closeAll());

const MENU = 'dlgMenu.rdr', OPTIONS = 'dlgOptions_Menu.rdr';
/** The window: the front end's 640 x 448 frame at scale 1. */
const FRAME = { width: 640, height: 448 } as const;
/** The kit's wait before a picture (a test-only timing, no game value). */
const SHOT_SETTLE_KIT_MS = 1_000;
/** The entry's names (`../src/settingsAdvanced` `SETTINGS_ADVANCED_ROW`, `SETTINGS_ADVANCED_PROMPT.name`). */
const ROW = 'S2uAdvancedBtn', PROMPT = 'S2uAdvancedPrompt';
const SCREENS = [
  { screen: 'video', button: 'VideoOpBtn', dialog: 'dlgOptions_Video.rdr', leave: 'SaveAndLeaveBtn' },
  { screen: 'audio', button: 'AudioOpBtn', dialog: 'dlgOptions_Audio.rdr', leave: 'SaveAndLeaveBtn' },
  // CONTROLLER PRESETS has no RETURN row: the last screen, nothing leaves it.
  { screen: 'controller', button: 'ControlPresetBtn', dialog: 'dlgControllerPresets.rdr', leave: null },
] as const;

/** Whether the screen's built design carries the entry (the row or the prompt). */
const entry = (p: Page) => p.evaluate(({ row, prompt }) => {
  const d = (window as Hooked).__frontEnd?.session.machine.shell()?.design;
  return { row: !!d?.controls.some((c) => c.name === row), prompt: !!d?.objects.some((o) => o.name === prompt) };
}, { row: ROW, prompt: PROMPT });
/** The launcher overlay's frame: shown and its phase (`../src/modern/overlay` `mark`). */
const overlay = (p: Page) => p.evaluate(() => {
  const f = document.querySelector<HTMLIFrameElement>('iframe.mu-overlay-frame');
  return { shown: !!f && !f.hidden, phase: f?.dataset['phase'] ?? null };
});

async function shot(p: Page, file: string, full = false): Promise<void> {
  await p.waitForTimeout(SHOT_SETTLE_KIT_MS);
  const path = test.info().outputPath(file);
  if (full) await p.screenshot({ path }); else await p.locator('#front-end').screenshot({ path });
  await test.info().attach(file, { path, contentType: 'image/png' });
}

/** The key opens the launcher; its picture; F9 closes it; the front end is where it stood. */
async function openAndBack(p: Page, screen: string, dialog: string, keyName: string): Promise<void> {
  const before = await at(p, dialog);
  await key(p, keyName);
  await expect.poll(() => overlay(p).then((o) => o.phase), { timeout: 15_000 }).toBe('open');
  await shot(p, `advanced-${screen}-launcher.png`, true);
  await key(p, 'F9');
  await expect.poll(() => overlay(p).then((o) => o.phase), { timeout: 15_000 }).toBe('closed');
  const after = await at(p, dialog);
  expect(after.focused).toBe(before.focused);
}

test('WM-6A capture kit: the ADVANCED entry on OPTIONS, VIDEO, AUDIO, CONTROLLER PRESETS opens the launcher and returns', async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const context = opened.add(await browser.newContext({ viewport: FRAME, deviceScaleFactor: 1 }));
  const p = await context.newPage();
  await installStartupPads(p);
  const errors: string[] = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${SETUP}?devmode&menuflow=${MENU}`);
  await until(p, 'the main menu', (s) => s.dialog === MENU && s.ready);
  await focusOn(p, MENU, 'options_button');
  await pressUntil(p, 'Enter', 'OPTIONS', (s) => s.dialog === OPTIONS);
  await at(p, OPTIONS);
  expect(await entry(p)).toEqual({ row: true, prompt: false });
  await shot(p, 'advanced-options.png');
  await focusOn(p, OPTIONS, ROW);
  await openAndBack(p, 'options', OPTIONS, 'Enter');

  for (const s of SCREENS) {
    await focusOn(p, OPTIONS, s.button);
    await pressUntil(p, 'Enter', s.dialog, (x) => x.dialog === s.dialog);
    await at(p, s.dialog);
    expect(await entry(p)).toEqual({ row: false, prompt: true });
    await shot(p, `advanced-${s.screen}.png`);
    await openAndBack(p, s.screen, s.dialog, 'KeyV');
    if (s.leave) {
      await focusOn(p, s.dialog, s.leave);
      await pressUntil(p, 'Enter', 'OPTIONS', (x) => x.dialog === OPTIONS);
    }
  }
  expect(errors).toEqual([]);
});
