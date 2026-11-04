import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type {} from '../src/hook';
import { TEST_ROOM } from './urls';
import { holdReleased } from './loadHold';

/**
 * The pre-round ARMORY (web sprint 5 S3; W5.R1-R4; research 95): offline, reCOM mode opens it before the page's own
 * room is made (W5.R1: before the first spawn), over the disc's `dlg_equipment_mp.rdr` and its scripts; the keys
 * navigate it (`ARMORY_MENU_KEYS_READING`), Square stores the loadout per map and side in this browser, Circle restores
 * the type's defaults; each choice goes through S2's seam as it is made (live, the S3 review) and DONE simply closes,
 * the room then joined. While it is open the game's keys do nothing: the walker stands. Written in S3 part 1, the
 * weapon view in part 2, the review's repairs after; run in a named window (the host's lock rules).
 */

const FIXTURES = join(fileURLToPath(new URL('../../..', import.meta.url)), 'test-fixtures');
const HAVE = ['MP2.ZDB', 'UIZANIM.ZAR', 'UI/READERC.ZAR', 'LOCALE/STATES/UIMNLOC.ZAR', 'ZWEAPON.ZAR'].every((p) => existsSync(join(FIXTURES, 'RUN', p)));

const armory = async (page: Page) => {
  await page.waitForFunction(() => '__viewer' in window);           // main.ts has run (a dynamic import since OT.R12: after `load`)
  return page.evaluate(() => window.__viewer.armory());
};
/** A key once the screen takes input again (the scripts' `SuspendMenuInput`). */
async function key(page: Page, code: string): Promise<void> {
  await expect.poll(async () => (await armory(page)).taking, { timeout: 10_000 }).toBe(true);
  await page.keyboard.press(code);
}
async function openOffline(page: Page): Promise<void> {
  await page.goto(`${TEST_ROOM}?map=MP2&mode=play&devmode`);
  await expect(page.locator('#status')).toContainText('FROSTFIRE (MP2)', { timeout: 60_000 });
  await expect.poll(async () => (await armory(page)).open, { timeout: 60_000 }).toBe(true);
  await holdReleased(page);                                           // the loading screen's hold takes no key (`./loadHold`)
}

test('offline: the ARMORY opens before the room; each choice applies as it is made, DONE closes, the first spawn takes them', async ({ page }) => {
  test.skip(!HAVE, 'needs the fixtures (npm run extract-maps)');
  test.setTimeout(180_000);
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await openOffline(page);
  let a = await armory(page);
  expect([a.screen, a.column, a.committed]).toEqual(['select', 0, null]);
  expect(await page.evaluate(() => window.__viewer.net?.() ?? null)).toBeNull();      // no room before the ARMORY is left

  await key(page, 'ArrowRight');                                      // SEAL 2
  expect((await armory(page)).column).toBe(1);
  await key(page, 'Enter');                                           // commit: the Primary row
  await expect.poll(async () => (await armory(page)).screen).toBe('row');
  // Live: the committed type is the page's at once, before the screen is left.
  await expect.poll(async () => (await page.evaluate(() => window.__viewer.loadout())).type, { timeout: 5_000 }).toBe(1);
  const before = (await armory(page)).kits[1]![0];
  await key(page, 'ArrowRight');                                      // the next primary the SEAL may carry
  a = await armory(page);
  expect(a.kits[1]![0]).not.toBe(before);
  const kit = a.kits[1]!;
  await expect.poll(async () => (await page.evaluate(() => window.__viewer.loadout())).pending?.[0] ?? null, { timeout: 5_000 }).toBe(kit[0]);
  await key(page, 'ArrowUp');                                         // DONE
  expect((await armory(page)).screen).toBe('done');
  await key(page, 'Enter');
  await expect.poll(async () => (await armory(page)).open).toBe(false);

  await expect.poll(async () => page.evaluate(() => window.__viewer.net?.()?.state ?? null), { timeout: 30_000 }).toBe('open');
  await expect.poll(async () => (await page.evaluate(() => window.__viewer.loadout())).type, { timeout: 30_000 }).toBe(1);
  await expect.poll(async () => (await page.evaluate(() => window.__viewer.loadout())).loadout[0], { timeout: 30_000 }).toBe(kit[0]);
  expect(problems).toEqual([]);
});

test('Square stores the loadout for the map and side; the next visit opens on it; Circle restores the defaults', async ({ page }) => {
  test.skip(!HAVE, 'needs the fixtures (npm run extract-maps)');
  test.setTimeout(180_000);
  await openOffline(page);
  await key(page, 'ArrowRight');
  await key(page, 'ArrowRight');                                      // SEAL 3
  await key(page, 'Enter');
  await expect.poll(async () => (await armory(page)).screen).toBe('row');
  await key(page, 'ArrowRight');
  await key(page, 'KeyV');                                            // Square: store
  await expect.poll(async () => (await armory(page)).profile).toMatchObject({ charSet: 3, valid: true });
  const stored = (await armory(page)).kits[2];

  await page.reload();
  await expect.poll(async () => (await armory(page)).open, { timeout: 60_000 }).toBe(true);
  await holdReleased(page);                                           // the reload is a load: its hold again
  const again = await armory(page);
  expect([again.column, again.committed, again.kits[2]]).toEqual([2, 2, stored]);

  await key(page, 'Enter');                                           // the stored SEAL 3
  await expect.poll(async () => (await armory(page)).screen).toBe('row');
  await key(page, 'KeyR');                                            // Circle: the type's defaults, the record cleared
  await expect.poll(async () => (await armory(page)).profile?.valid).toBe(false);
  await expect.poll(async () => (await armory(page)).screen).toBe('row');
  expect((await armory(page)).kits[2]).not.toEqual(stored);
});

test('Triangle on a row asks first; YES returns to character select with the kit kept, Backspace there leaves', async ({ page }) => {
  test.skip(!HAVE, 'needs the fixtures (npm run extract-maps)');
  test.setTimeout(180_000);
  await openOffline(page);
  await key(page, 'Enter');
  await expect.poll(async () => (await armory(page)).screen).toBe('row');
  await key(page, 'ArrowRight');
  const kit = (await armory(page)).kits[0];
  await key(page, 'Backspace');                                       // Triangle: the confirm (popup 1245)
  expect((await armory(page)).screen).toBe('confirm');
  // The popup opens on NO (ARMORY_POPUP_FOCUS, research 182 s2.15: record 1245's first slot); Right steps to YES.
  await key(page, 'ArrowRight');
  await page.keyboard.press('Enter');                                 // YES
  await expect.poll(async () => (await armory(page)).screen).toBe('select');
  expect((await armory(page)).kits[0]).toEqual(kit);
  await key(page, 'Backspace');                                       // back to the lobby: the match starts
  await expect.poll(async () => (await armory(page)).open).toBe(false);
  await expect.poll(async () => page.evaluate(() => window.__viewer.net?.()?.state ?? null), { timeout: 30_000 }).toBe('open');
});

test('the weapon view: the spinning model, the four bars and the name on a gun row; the typed WEAPON DATA on an equipment row', async ({ page }) => {
  test.skip(!HAVE, 'needs the fixtures (npm run extract-maps)');
  test.setTimeout(180_000);
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await openOffline(page);
  await key(page, 'Enter');                                           // SEAL 1: the Primary row
  await expect.poll(async () => (await armory(page)).preview?.models.length ?? 0, { timeout: 10_000 }).toBe(1);
  let a = await armory(page);
  expect(a.modelsHeld).toBe(true);                                    // the 3D pass holds the entry's model
  expect(a.preview!.bars).toHaveLength(4);
  for (const b of a.preview!.bars!) { expect(b).toBeGreaterThan(0); expect(b).toBeLessThanOrEqual(1); }
  expect(a.preview!.name.length).toBeGreaterThan(0);
  expect(a.preview!.fireMode.length).toBeGreaterThan(0);
  expect(a.preview!.description).toBe('');                           // a gun types " "

  await key(page, 'ArrowDown');                                       // Secondary
  await key(page, 'ArrowDown');                                       // Equipment 1
  await expect.poll(async () => (await armory(page)).row).toBe(3);
  // `typed` is still the gun row's (" ", done) until a frame runs the equipment row's `ShowAndSpin`: wait for its text.
  await expect.poll(async () => { const p = (await armory(page)).preview; return !!p && p.typed && p.description.length > 10; }, { timeout: 10_000 }).toBe(true);
  a = await armory(page);
  expect(a.preview!.bars).toBeNull();
  expect(a.preview!.description.length).toBeGreaterThan(10);
  expect(a.preview!.models).toHaveLength(1);

  await key(page, 'ArrowUp');
  await key(page, 'ArrowUp');
  await key(page, 'ArrowUp');                                         // DONE: the models hidden
  await expect.poll(async () => (await armory(page)).screen).toBe('done');
  // The state steps on the key; the scripts hide the models on the frame after it.
  await expect.poll(async () => (await armory(page)).preview!.models, { timeout: 5_000 }).toEqual([]);
  expect(problems).toEqual([]);
});

test('while the ARMORY is open the game\'s keys do nothing: A and D step its columns, the walker stands', async ({ page }) => {
  test.skip(!HAVE, 'needs the fixtures (npm run extract-maps)');
  test.setTimeout(180_000);
  await openOffline(page);
  await expect.poll(async () => page.evaluate(() => window.__viewer.feet()), { timeout: 60_000 }).not.toBeNull();
  const feet = await page.evaluate(() => window.__viewer.feet());
  await expect.poll(async () => (await armory(page)).taking, { timeout: 10_000 }).toBe(true);
  // Held, as a walking player holds them: the screen's Left/Right, never the mover's strafe.
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyD');
  expect((await armory(page)).open).toBe(true);
  const after = await page.evaluate(() => window.__viewer.feet());
  expect(Math.hypot(after![0] - feet![0], after![2] - feet![2])).toBeLessThan(0.01);
  // The map (M) and the scoreboard (Tab) stay shut behind it.
  await page.keyboard.press('KeyM');
  expect((await page.evaluate(() => window.__viewer.tacMap())).open).toBe(false);
});

/**
 * PAR-94 B3 (research 322 §4.1 B3, D5; the sprint 40 ledger's C84): no HUD and no reticle under the offline ARMORY. The
 * original has no HUD while an equipment screen is up (R322.7), and its HUD update runs only under the camera's actor
 * (`FUN_001f7ff0` D:L56631): `/testroom`'s frame draws the walker's kit only with the ARMORY shut and the single-player
 * room's spawn of the page heard (`../src/reticle` `pageSpawned`). Before B3 the HUD -- the kit `show` hung -- was drawn
 * edge-anchored under the ARMORY's 640x448 letterbox, so on a canvas wider than 640:448 its edges could show beside it:
 * a 16:9 viewport, the case C84 names. Written with B3 and not run by its author (the merge controller's browser slot);
 * the margins' look before and after is that slot's to see, not asserted here.
 */
test('PAR-94 B3: neither the HUD nor the reticle under the ARMORY on a 16:9 canvas; both once it is left and the room has spawned the page', async ({ page }) => {
  test.skip(!HAVE, 'needs the fixtures (npm run extract-maps)');
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 720 });          // 16:9: wider than the ARMORY's 640:448 frame
  const drawn = (): Promise<{ hud: boolean; reticle: boolean }> =>
    page.evaluate(() => ({ hud: window.__viewer.hud().visible, reticle: window.__viewer.reticle().visible }));
  await openOffline(page);
  expect(await page.evaluate(() => window.__viewer.net?.() ?? null)).toBeNull();      // no room before the ARMORY is left
  // The ARMORY open, the walk on under it: for a second of frames, no HUD and no reticle (before B3: the HUD drawn).
  for (const until = Date.now() + 1000; Date.now() < until;) {
    expect(await drawn()).toEqual({ hud: false, reticle: false });
    await page.waitForTimeout(100);
  }
  await key(page, 'Enter');                                           // the type committed: the Primary row
  await expect.poll(async () => (await armory(page)).screen).toBe('row');
  await key(page, 'ArrowUp');                                         // DONE
  await key(page, 'Enter');
  await expect.poll(async () => (await armory(page)).open).toBe(false);
  // The room made and the page spawned in it (`soloAfterArmory`): the kit drawn.
  await expect.poll(async () => page.evaluate(() => window.__viewer.net?.()?.state ?? null), { timeout: 30_000 }).toBe('open');
  await expect.poll(drawn, { timeout: 30_000 }).toEqual({ hud: true, reticle: true });
});

test.describe('the panel folded', () => {
  // The run's storageState opens the settings panel (playwright.config.ts), which lies over the frame's left side where
  // the panes are: a click there is the panel's. A visitor taps the screen with it folded (a first visit's default).
  test.use({ storageState: { cookies: [], origins: [] } });
  test('a pane tapped where the scripts put it steps to its row (ARMORY_TOUCH_READING)', async ({ page }) => {
    test.skip(!HAVE, 'needs the fixtures (npm run extract-maps)');
    test.setTimeout(180_000);
    await openOffline(page);
    await key(page, 'Enter');                                           // SEAL 1's rows, the panes risen into the window
    await expect.poll(async () => (await armory(page)).screen).toBe('row');
    await expect.poll(async () => (await armory(page)).taking, { timeout: 10_000 }).toBe(true);
    await page.waitForTimeout(500);                                     // the commit's slide (0.1-0.2 s) run out
    // The Secondary pane: (-5, 20) under the PaneDummy the slide left at (-200, -40) under the column at (220, 150).
    const canvas = page.locator('canvas').first();
    const box = (await canvas.boundingBox())!;
    // The frame fitted whole into the drawing buffer and centred (ARMORY_FRAME_FIT), the buffer then stretched onto the
    // CSS box (the PS2 look's 4:3): the height rule this replaced missed on a narrow window.
    const buf = await canvas.evaluate((c) => ({ w: (c as HTMLCanvasElement).width, h: (c as HTMLCanvasElement).height }));
    const s = Math.min(buf.w / 640, buf.h / 448), fx0 = (buf.w - 640 * s) / 2, fy0 = (buf.h - 448 * s) / 2;
    const at = (fx: number, fy: number): [number, number] =>
      [box.x + ((fx0 + fx * s) * box.width) / buf.w, box.y + ((fy0 + fy * s) * box.height) / buf.h];
    const [px, py] = at(220 - 200 - 5 + 80, 150 - 40 + 20 + 10);
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.tagName ?? null, [px, py])).toBe('CANVAS');
    await page.mouse.click(px, py);
    await expect.poll(async () => (await armory(page)).row, { timeout: 5_000 }).toBe(2);
  });
});
