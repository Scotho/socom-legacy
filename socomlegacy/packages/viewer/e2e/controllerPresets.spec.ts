import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { at, focusOn, key, pressUntil, until, type Hooked } from './frontEndWalk';
import { OpenedContexts } from './openedContexts';
import { installStartupPads } from './startupDevices';
import { SETUP } from './urls';

/**
 * OPT-14, CONTROLLER PRESETS (issue #87; web research 344): the main menu's OPTIONS > CONTROLLER PRESETS opens the
 * original's `dlgControllerPresets.rdr` through the front end's own runtime -- its layout, its `uiop` pictures, its
 * scripts. The walk: the page opens on the selected preset (page 1 on a fresh card); RIGHT walks the four pages in a ring
 * (each page's title and its picture `ContPic<n>` shown, the others hidden), LEFT back; CROSS on LEFTY chooses it
 * (`SetControllerConfig(Reverse)`, `SelectedControllerConfig` 2, `ChosePresetOnce` 1) and the page goes back to OPTIONS
 * (`check_then_save_and_leave`'s ELSE: research 344 R344.5); OPTIONS' RETURN stores it (`StoreOptions`) and the card's
 * `CValveSaveManager` module holds it. Then the page again: CONTROLLER PRESETS opens on LEFTY, and TRIANGLE leaves
 * choosing nothing.
 *
 * Menus walked by the page's keys (`./frontEndWalk`: the arrows, Enter = CROSS, Backspace = TRIANGLE), each step waiting
 * on the shell. No match server: the main menu's OPTIONS is offline. The served tree comes from `npm run extract-maps`.
 */

const WEB = fileURLToPath(new URL('../../..', import.meta.url));
const MAPS_DIR = join(WEB, 'public', 'maps');
test.skip(!existsSync(join(MAPS_DIR, 'index.json')), 'maps absent: extract them with npm run extract-maps');

const opened = new OpenedContexts();
test.afterEach(() => opened.closeAll());

const PRESETS = 'dlgControllerPresets.rdr', OPTIONS = 'dlgOptions_Menu.rdr';
const PICTURES = ['ContPic1', 'ContPic2', 'ContPic3', 'ContPic4'];

/** A valve of the session's registry. */
const valve = (p: Page, name: string) => p.evaluate((n) => (window as Hooked).__frontEnd?.session.opener.valves.find(n)?.value ?? null, name);
/** The option globals StoreOptions left. */
const globals = (p: Page) => p.evaluate(() => (window as Hooked).__frontEnd?.session.options.all() ?? null);
/** The dialog's nodes by name, as the shell's screen holds them: each one's visibility and its text as drawn. */
const nodes = (p: Page, names: string[]) => p.evaluate((want) => {
  type N = { name: string; visible: boolean; content: { kind: string; text?: { codes: number[] }; lines?: { bytes: number[] }[] } | null; children: N[] };
  const root = (window as Hooked).__frontEnd?.session.machine.shell()?.screen.root as unknown as N | undefined;
  const out: Record<string, { visible: boolean; text: string }> = {};
  const walk = (n: N): void => {
    if (want.includes(n.name) && !out[n.name]) {
      const c = n.content;
      const text = c?.kind === 'text' && c.text ? String.fromCharCode(...c.text.codes)
        : c?.kind === 'wrapped' && c.lines ? c.lines.map((l) => String.fromCharCode(...l.bytes)).join(' ') : '';
      out[n.name] = { visible: n.visible, text };
    }
    for (const k of n.children) walk(k);
  };
  if (root) walk(root);
  return out;
}, names);
/** Which of the four pictures are shown. */
const shown = async (p: Page): Promise<string[]> => {
  const n = await nodes(p, PICTURES);
  return PICTURES.filter((name) => n[name]?.visible);
};
const title = async (p: Page): Promise<string> => (await nodes(p, ['bar_title'])).bar_title?.text ?? '';

/** The main menu to OPTIONS to CONTROLLER PRESETS. */
async function toPresets(p: Page): Promise<void> {
  await until(p, 'the main menu', (s) => s.dialog === 'dlgMenu.rdr' && s.ready);
  await focusOn(p, 'dlgMenu.rdr', 'options_button');
  await pressUntil(p, 'Enter', 'OPTIONS', (s) => s.dialog === OPTIONS);
  await focusOn(p, OPTIONS, 'ControlPresetBtn');
  await pressUntil(p, 'Enter', 'CONTROLLER PRESETS', (s) => s.dialog === PRESETS);
}

test('CONTROLLER PRESETS: the four pages in a ring, LEFTY chosen, back on OPTIONS, saved; the page again opens on it', async ({ browser }) => {
  test.setTimeout(240_000);
  const context = opened.add(await browser.newContext({ viewport: { width: 960, height: 640 } }));
  const p = await context.newPage();
  await installStartupPads(p);
  const errors: string[] = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${SETUP}?devmode&menuflow=dlgMenu.rdr`);

  await toPresets(p);
  await at(p, PRESETS, 'Preset1Btn');                                                 // CPstart: SelectedControllerConfig 1
  await expect.poll(() => shown(p)).toEqual(['ContPic1']);
  expect(await title(p)).toBe('PRECISION SHOOTER PRESET');
  const pages = [['Preset2Btn', '2 - LEFTY PRESET', 'ContPic2'], ['Preset3Btn', '3 - SCOUT PRESET', 'ContPic3'],
    ['Preset4Btn', '4 - SURE SHOT PRESET', 'ContPic4'], ['Preset1Btn', '1 - PRECISION SHOOTER PRESET', 'ContPic1']] as const;
  for (const [button, caption, picture] of pages) {                                   // RIGHT: 1 -> 2 -> 3 -> 4 -> 1
    await key(p, 'ArrowRight');
    await at(p, PRESETS, button);
    await expect.poll(() => shown(p)).toEqual([picture]);
    expect(await title(p)).toBe(caption);
  }
  await key(p, 'ArrowLeft');                                                          // LEFT: 1 -> 4 -> 3 -> 2
  await at(p, PRESETS, 'Preset4Btn');
  await key(p, 'ArrowLeft');
  await at(p, PRESETS, 'Preset3Btn');
  await key(p, 'ArrowLeft');
  await at(p, PRESETS, 'Preset2Btn');
  await expect.poll(() => shown(p)).toEqual(['ContPic2']);

  await key(p, 'Enter');                                                              // PressPreset2: SetControllerConfig(Reverse)
  await expect.poll(() => valve(p, 'SelectedControllerConfig')).toBe(2);
  expect(await valve(p, 'ChosePresetOnce')).toBe(1);
  await at(p, OPTIONS);                                                               // check_then_save_and_leave's ELSE
  expect((await globals(p))?.SelectedControllerConfig ?? 1).toBe(1);                  // a draft until StoreOptions

  await focusOn(p, OPTIONS, 'SaveAndLeaveBtn');                                       // RETURN: StoreOptions, then the save
  await key(p, 'Enter');
  const end = Date.now() + 60_000;
  for (;;) {                                                                          // #831 YES, slot 1, (#857 YES)
    const s = await until(p, 'the save or the main menu', (x) => x.ready && (x.popup || x.dialog === 'dlgMenu.rdr'));
    if (s.dialog === 'dlgMenu.rdr' && !s.popup) break;
    if (Date.now() > end) throw new Error('the save did not end');
    await key(p, 'Enter');
  }
  expect(await globals(p)).toMatchObject({ SelectedControllerConfig: 2, ChosePresetOnce: 1 });

  await p.reload();                                                                   // the card read back at the boot
  await toPresets(p);
  await at(p, PRESETS, 'Preset2Btn');                                                 // CPstart: 2 -> OnPreset1R
  await expect.poll(() => shown(p)).toEqual(['ContPic2']);
  expect((await nodes(p, ['DescriptionPulseText'])).DescriptionPulseText?.text).toBe('2 - Lefty Preset is currently selected');
  await key(p, 'Backspace');                                                          // TRIANGLE: back, nothing chosen
  await at(p, OPTIONS);
  expect(await valve(p, 'SelectedControllerConfig')).toBe(2);
  expect(errors).toEqual([]);
});
