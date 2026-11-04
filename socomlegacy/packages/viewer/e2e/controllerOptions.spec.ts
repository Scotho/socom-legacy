import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { stickTunersOfPreset } from '@s2u/ui';
import { at, focusOn, key, pressUntil, until, type Hooked } from './frontEndWalk';
import { OpenedContexts } from './openedContexts';
import { installStartupPads } from './startupDevices';
import { SETUP } from './urls';

/**
 * CTL-1, CTL.R5 (OT.R72; the owner's bug: "the PRESETS checkboxes cannot change the selection"): the main menu's
 * OPTIONS > CONTROLLER OPTIONS opens the disc's `dlgControllerSelection.rdr` through the front end's own runtime, rendered.
 * The pad (the page's keys: the arrows, Enter = CROSS) walks the PRESETS strip: each box's script runs `SetStickPreset`,
 * so the three sliders' vars are the preset's (`@s2u/ui` `stickTunersOfPreset`); under CUSTOM, LOOK SPEED moves. Then the
 * mouse (MENU_TOUCH_READING, a browser adaptation): a click on the PRESETS row steps the focus to it and presses CROSS
 * (one box on); a click on a box of the strip -- what the owner tried -- chooses that box (the strip rule, the merge
 * controller's ruling of 2026-10-23). The disc-backed unit test (`../test/originalOptions.test.ts` CTL.R5) holds the
 * same walk without a browser; this is the rendered run. The served tree comes from `npm run extract-maps`.
 */

const WEB = fileURLToPath(new URL('../../..', import.meta.url));
const MAPS_DIR = join(WEB, 'public', 'maps');
test.skip(!existsSync(join(MAPS_DIR, 'index.json')), 'maps absent: extract them with npm run extract-maps');

const opened = new OpenedContexts();
test.afterEach(() => opened.closeAll());

const CONTROLLER = 'dlgControllerSelection.rdr', OPTIONS = 'dlgOptions_Menu.rdr';
const TUNERS = ['STICK_SENSITIVITY', 'STICK_INERTIA', 'STICK_DEADZONE'] as const;

/** A valve of the session's registry. */
const valve = (p: Page, name: string) => p.evaluate((n) => (window as Hooked).__frontEnd?.session.opener.valves.find(n)?.value ?? null, name);
/** The three sliders' vars (a real's number, else null). */
const tuners = (p: Page) => p.evaluate((names) => names.map((n) => {
  const v = (window as Hooked).__frontEnd?.session.uiVars.find(n)?.value;
  return v?.type === 'real' ? v.value : null;
}), [...TUNERS]);
/** Where a node of the screen lies on the page: its frame place (the `controlAt` walk) through the canvas's contain fit. */
const pageAt = (p: Page, name: string, dx: number, dy: number) => p.evaluate(([want, ox, oy]) => {
  type N = { name: string; x: number; y: number; scale: number[]; visible: boolean; parent: N | null; children: N[] };
  const root = (window as Hooked).__frontEnd?.session.machine.shell()?.screen.root as unknown as N | undefined;
  const find = (n: N): N | null => { if (n.name === want) return n; for (const k of n.children) { const f = find(k); if (f) return f; } return null; };
  const node = root ? find(root) : null;
  const canvas = document.getElementById('front-end');
  if (!node || !canvas) return null;
  const chain: N[] = [];
  for (let n: N | null = node; n; n = n.parent) chain.unshift(n);
  let a = 1, d = 1, tx = 0, ty = 0, shown = true;
  for (const n of chain) { if (!n.visible) shown = false; tx += a * n.x; ty += d * n.y; a *= n.scale[0]!; d *= n.scale[1]!; }
  const r = canvas.getBoundingClientRect(), s = Math.min(r.width / 640, r.height / 448);
  const fx = tx + (ox as number), fy = ty + (oy as number);
  return { x: r.left + (r.width - 640 * s) / 2 + fx * s, y: r.top + (r.height - 448 * s) / 2 + fy * s, fx, fy, shown };
}, [name, dx, dy] as const);
const shots = process.env['CTL_SHOTS'];
const shot = async (p: Page, name: string) => { if (shots) await p.screenshot({ path: join(shots, `${name}.png`) }); };

test('CONTROLLER OPTIONS: the PRESETS strip takes the pad, each box writes the three sliders, CUSTOM\'s LOOK SPEED moves; the mouse', async ({ browser }) => {
  test.setTimeout(240_000);
  const context = opened.add(await browser.newContext({ viewport: { width: 960, height: 640 } }));
  const p = await context.newPage();
  await installStartupPads(p);
  const errors: string[] = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${SETUP}?devmode&menuflow=dlgMenu.rdr`);

  await until(p, 'the main menu', (s) => s.dialog === 'dlgMenu.rdr' && s.ready);
  await focusOn(p, 'dlgMenu.rdr', 'options_button');
  await pressUntil(p, 'Enter', 'OPTIONS', (s) => s.dialog === OPTIONS);
  await focusOn(p, OPTIONS, 'ControlOpBtn');
  await pressUntil(p, 'Enter', 'CONTROLLER OPTIONS', (s) => s.dialog === CONTROLLER);
  await shot(p, '1-opened');

  // The pad: the strip, RIGHT through its boxes; each preset box's three sliders are the preset's.
  await focusOn(p, CONTROLLER, 'stick_presets');
  const seen = new Set<number>([(await valve(p, 'stick_preset')) ?? 0]);
  for (let k = 0; k < 4; k++) {
    await key(p, 'ArrowRight');
    const n = (await valve(p, 'stick_preset')) ?? -1;
    seen.add(n);
    if (n >= 0 && n < 3) {
      const t = stickTunersOfPreset(n);
      await expect.poll(() => tuners(p), { message: `preset ${n}` }).toEqual([t.sensitivity, t.inertia, t.deadZone]);
      await shot(p, `2-preset-${n}`);
    }
  }
  expect(seen.size, 'the strip moved through its boxes').toBeGreaterThan(1);
  for (let k = 0; k < 4 && (await valve(p, 'stick_preset')) !== 3; k++) await key(p, 'ArrowRight');
  expect(await valve(p, 'stick_preset')).toBe(3);
  const look = (await tuners(p))[0]!;
  await focusOn(p, CONTROLLER, 'StickSensitivity');
  await key(p, 'ArrowLeft');
  await expect.poll(async () => (await tuners(p))[0]!).toBeLessThan(look);
  await shot(p, '3-custom-look-down');

  // The mouse (MENU_TOUCH_READING): a click on the PRESETS row (its 160 x 30 body) steps the focus to it and presses
  // CROSS, which steps the strip forward one box, wrapping (`radioStrip.ts`, FUN_00370f60): CUSTOM to RECRUIT.
  const row = await pageAt(p, 'stick_presets', 80, 15);
  expect(row, 'the PRESETS row on the page').not.toBeNull();
  await p.mouse.click(row!.x, row!.y);
  await at(p, CONTROLLER, 'stick_presets');
  await expect.poll(() => valve(p, 'stick_preset')).toBe(0);
  await expect.poll(() => tuners(p)).toEqual((({ sensitivity, inertia, deadZone }) => [sensitivity, inertia, deadZone])(stickTunersOfPreset(0)));
  // A click on a box of the strip chooses that box (MENU_TOUCH_READING's strip rule, the merge controller's ruling of
  // 2026-10-23): SEAL clicked is SEAL, its three sliders SEAL's -- no CROSS after it.
  const seal = await pageAt(p, 'Seal', 8, 8);
  expect(seal?.shown, 'SEAL\'s box drawn').toBe(true);
  await p.mouse.click(seal!.x, seal!.y);
  await expect.poll(() => valve(p, 'stick_preset')).toBe(2);
  await expect.poll(() => tuners(p)).toEqual((({ sensitivity, inertia, deadZone }) => [sensitivity, inertia, deadZone])(stickTunersOfPreset(2)));
  await shot(p, '4-mouse-seal');
  // And CUSTOM's box: the sliders enabled, LOOK SPEED by the mouse's row then the pad.
  const custom = await pageAt(p, 'Custom', 8, 8);
  await p.mouse.click(custom!.x, custom!.y);
  await expect.poll(() => valve(p, 'stick_preset')).toBe(3);
  await shot(p, '5-mouse-custom');

  await focusOn(p, CONTROLLER, 'SaveAndLeaveBtn');
  await pressUntil(p, 'Enter', 'OPTIONS', (s) => s.dialog === OPTIONS);
  expect(errors).toEqual([]);
});
