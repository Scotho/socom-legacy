import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type {} from '../src/hook';
import { TEST_ROOM } from './urls';

/**
 * The binoculars (view state 4; the owner's yes of 2026-10-01; research 84 §7, §9): the disc's READERC `M62_BINOC`
 * path on Frostfire -- the Mark 23 up, d-pad Up to first person, Up again to the binoculars at 9x -- drawn as the
 * original draws them (`ChangeReticule` type 7: `ret_binocs` and `ret_binocs2` over the whole frame, no reticle, the
 * black beside the 640-wide mask on the 16:9 frame), "ZOOM: 9.0x", the look 1 / 1.5 x 0.2, no round leaving
 * (`FUN_005be9a0`), a switch to the scoped primary refused while they are up (`FUN_005c4fd0`: view state 4 and up;
 * research 201 §1-§2 A31, 211 §2) and taken from first person, the next step in its scope. Screenshots go to
 * `socomlegacy/test-fixtures/screens/binoculars` (git-ignored), or to `BINOCULARS_SHOT` when the run names a file.
 */

const SCREENS = fileURLToPath(new URL('../../../test-fixtures/screens/binoculars', import.meta.url));
const SPAWN_A: [number, number, number] = [796, 100, 614];

const settle = (page: Page, frames = 2): Promise<void> => page.evaluate((n) => new Promise<void>((done) => {
  let left = n;
  const step = (): void => { if (--left <= 0) done(); else requestAnimationFrame(step); };
  requestAnimationFrame(step);
}), frames);

/** The canvas as composited: the mean colour of boxes given as fractions of the frame. */
async function probe(page: Page, boxes: Record<string, [number, number, number, number]>): Promise<Record<string, number>> {
  const png = (await page.locator('#view').screenshot()).toString('base64');
  return page.evaluate(async ({ data, boxes }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const out: Record<string, number> = {};
    for (const [name, [x0, y0, x1, y1]] of Object.entries(boxes)) {
      const w = img.width, h = img.height;
      const d = g.getImageData(Math.floor(x0 * w), Math.floor(y0 * h), Math.max(1, Math.floor((x1 - x0) * w)), Math.max(1, Math.floor((y1 - y0) * h))).data;
      let s = 0;
      for (let k = 0; k < d.length; k += 4) s += (d[k]! + d[k + 1]! + d[k + 2]!) / 3;
      out[name] = s / (d.length / 4);
    }
    return out;
  }, { data: png, boxes });
}

test('the Mark 23 to first person, then the binoculars: the two-lens mask, 9x, no reticle, no round; the primary scopes on', async ({ page }) => {
  mkdirSync(SCREENS, { recursive: true });
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.setViewportSize({ width: 1280, height: 720 });            // 16:9: black beside the mask
  await page.goto(`${TEST_ROOM}?mode=play&fly&devmode`);
  const status = page.locator('#status');
  await expect(status).toContainText('triangles');
  await page.locator('#maps').selectOption('RUN/MP2.ZDB');
  await expect(status).toContainText('FROSTFIRE (MP2)');
  await expect(status).toContainText('triangles');
  expect(await page.evaluate(() => window.__viewer.setMode('walk'))).toBe(true);
  await page.evaluate(([x, y, z]) => window.__viewer.setCamera({ x, y: y + 15.4, z, yaw: 0, pitch: 0 }), SPAWN_A);
  await settle(page, 30);
  const third = await probe(page, { centre: [0.45, 0.4, 0.55, 0.6] });

  // M62_BINOC: "switch to your pistol and press up on the d-pad" -- first person, then the binoculars.
  expect(await page.evaluate(() => window.__viewer.selectWeapon('pistol'))).toBe(true);
  await expect.poll(async () => page.evaluate(() => { const k = window.__viewer.kit(); return k.swap === null ? k.item : 'swapping'; }), { timeout: 20_000 }).toBe('pistol');
  expect(await page.evaluate(() => window.__viewer.zoomIn())).toBe(1);
  await settle(page, 10);
  expect(await page.evaluate(() => window.__viewer.zoomIn())).toBe(4);
  await settle(page, 40);                                               // 1.01 -> 9 at 27 a second: 0.3 s
  const up = await page.evaluate(() => ({ z: window.__viewer.zoom(), r: window.__viewer.reticle(), hud: window.__viewer.hud(), shots: window.__viewer.fire().shots }));
  expect(up.z.view).toBe('binoculars');
  expect(up.z.magnification).toBe(9);
  expect(up.z.lookScale).toBeCloseTo((1 / 1.5) * 0.2, 9);              // FUN_005966a0: ZoomMode0 1.5, x DAT_00650638
  expect(up.r.mode).toBe('binoculars');                                 // ChangeReticule type 7: no ring, no arms
  expect(up.r.rect).toBeNull();
  expect(up.hud.model.zoom).toBe(9);                                    // "ZOOM: 9.0x" (FUN_001f6ce0 case 4)
  // The shot is the view as a player has it: the settings panel folded (the run's storage opens it), so the
  // "ZOOM: 9.0x" readout and the left bar are not under it.
  await page.locator('#panel-toggle').click();
  await expect(page.locator('#panel')).toBeHidden();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await settle(page, 5);
  const shot = process.env['BINOCULARS_SHOT'];
  if (shot) mkdirSync(dirname(shot), { recursive: true });
  await page.screenshot({ path: shot || join(SCREENS, 'binoculars.png') });
  const s = 720 / 448, left = (640 - 320 * s) / 1280;                   // the mask's left edge, a fraction of the width
  const look = await probe(page, {
    beside: [0.97, 0.3, 1, 0.7],                                        // past the mask on the right: the bars' black
    corner: [1 - left - 0.04, 0.02, 1 - left - 0.01, 0.08],             // the right lens's top outer corner: the rim
    centre: [0.45, 0.4, 0.55, 0.6],                                     // between the lenses: the world, 9x
  });
  expect(look.beside!).toBeLessThan(8);
  expect(look.corner!).toBeLessThan(30);                                // ret_binocs2's opaque rim, (20, 20, 22) decoded
  expect(look.centre!).toBeGreaterThan(Math.min(20, third.centre! / 4));

  // FUN_005be9a0 475305: the trigger held, no round leaves; the binoculars down, the held trigger fires on.
  await page.evaluate(() => window.__viewer.trigger(true));
  await settle(page, 30);
  expect(await page.evaluate(() => window.__viewer.fire().shots)).toBe(up.shots);
  expect(await page.evaluate(() => window.__viewer.shoot())).toBeNull();
  await page.evaluate(() => window.__viewer.trigger(false));
  expect(await page.evaluate(() => window.__viewer.zoomOut())).toBe(1); // FUN_00544400: 4 -> 1
  await settle(page, 20);
  expect(await page.evaluate(() => window.__viewer.shoot())).not.toBeNull();
  expect(await page.evaluate(() => window.__viewer.zoomIn())).toBe(4);
  await settle(page, 20);

  // The primary (a scoped M4A1) asked for with the binoculars on: refused whole (FUN_005c4fd0, view state 4 and up), the
  // binoculars and the Mark 23 as they were. From first person it is taken (FUN_005c4b10 drops only the night vision),
  // and Up goes to its scope.
  expect(await page.evaluate(() => window.__viewer.selectWeapon('rifle'))).toBe(false);
  await settle(page, 10);
  expect(await page.evaluate(() => ({ state: window.__viewer.zoom().state, item: window.__viewer.kit().item, swap: window.__viewer.kit().swap }))).toEqual({ state: 4, item: 'pistol', swap: null });
  expect(await page.evaluate(() => window.__viewer.zoomOut())).toBe(1);
  await settle(page, 10);                                               // a tick past: the swap weighs the view the last tick left
  expect(await page.evaluate(() => window.__viewer.selectWeapon('rifle'))).toBe(true);
  await expect.poll(async () => page.evaluate(() => { const k = window.__viewer.kit(); return k.swap === null ? k.item : 'swapping'; }), { timeout: 20_000 }).toBe('rifle');
  expect(await page.evaluate(() => window.__viewer.zoom().state)).toBe(1);
  expect(await page.evaluate(() => window.__viewer.zoomIn())).toBe(5);
  await settle(page, 30);
  const scope = await page.evaluate(() => ({ z: window.__viewer.zoom(), r: window.__viewer.reticle() }));
  expect([scope.z.view, scope.r.mode]).toEqual(['scope', 'scope']);
  // 9 -> ZoomMode1 is an in run at 3 x the new target (MATCH-04: 7.5 or 9 a second, 0.67-0.87 s), so wait for the
  // arrival: the magnification on screen equal to 1 / the look's scale (FUN_005966a0: 1 / ZoomMode[state - 4] in state
  // 5), and that the primary's ZoomMode1 (the M4A1's 2.5, the SD's 3). A run stuck at 9 or mid-way fails here.
  await expect.poll(async () => page.evaluate(() => { const z = window.__viewer.zoom(); return Math.abs(z.magnification * z.lookScale - 1) < 1e-9; }), { timeout: 5_000 }).toBe(true);
  expect([2.5, 3]).toContain(await page.evaluate(() => window.__viewer.zoom().magnification));
  expect(await page.evaluate(() => window.__viewer.zoomOut())).toBe(1);
  expect(await page.evaluate(() => window.__viewer.zoomOut())).toBe(0);
  expect(problems).toEqual([]);
});
