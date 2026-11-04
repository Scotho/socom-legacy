import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
// `src/hook.ts` is types only; its `declare global` is what makes `window.__viewer` exist inside `page.evaluate`.
import type {} from '../src/hook';
import { TEST_ROOM } from './urls';
import { holdReleased } from './loadHold';

/**
 * The doors (socomlegacy/docs/research/92-doors.md; the owner's play test of 2026-09-29: "I can see the action but they do not
 * open or close"): on Frostfire, before `bdoor_4` from B's side looking at it, the door prompt shows; X swings it open
 * -- heard, the leaf drawn turned -- and the SEAL walks through where the shut leaf stopped it; X again shuts it.
 */

const SCREENS = fileURLToPath(new URL('../../../test-fixtures/screens/doors', import.meta.url));
const EYE = 15.4;

const settle = (page: Page): Promise<void> => page.evaluate(
  () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
);
/** Real frames for `seconds`: the swing runs on the page's frame clock. */
const frames = (page: Page, seconds: number): Promise<void> => page.evaluate((s) => new Promise<void>((done) => {
  const until = performance.now() + s * 1000;
  const tick = (): void => { if (performance.now() >= until) done(); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}), seconds);

/**
 * After a use: real frames for the door's own run (`DoorPage.stats`' `seconds`, `useSeconds`: its program's ANIMATE head
 * and swing, research 92 section 2) and `USE_MARGIN_S` (the close's sound a step after its swing, a frame's slack), then
 * until it reads at rest, for at most one more run's worth of real time: the page's frame clock counts at most 0.1 s a
 * frame (PAR-24), so on a loaded host a real second holds less of the swing (a first use's stall: e0's probes, the open
 * about 0.25 s over) -- but a door that needs twice its program's run fails here (the review of B139's fix: a fixed 5 s
 * would let it pass).
 */
const USE_MARGIN_S = 0.25;
async function used(page: Page, i: number): Promise<void> {
  const seconds = (await page.evaluate(() => window.__viewer.doors())).doors[i]!.seconds;
  expect(seconds, 'the door has a swing').not.toBeNull();
  await frames(page, seconds! + USE_MARGIN_S);
  await expect.poll(async () => (await page.evaluate(() => window.__viewer.doors())).doors[i]!.busy, { timeout: seconds! * 1000 }).toBe(false);
}

test('X on bdoor_4 opens it, the SEAL walks through, X again shuts it (Frostfire)', async ({ page }) => {
  mkdirSync(SCREENS, { recursive: true });
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(`${TEST_ROOM}?mode=play&fly&devmode`);
  const status = page.locator('#status');
  await expect(status).toContainText('triangles');
  await page.locator('#maps').selectOption('RUN/MP2.ZDB');
  await expect(status).toContainText('FROSTFIRE (MP2)');
  await expect(status).toContainText('triangles');
  await holdReleased(page);                                   // the loading screen's hold (`./loadHold`)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  expect(await page.evaluate(() => window.__viewer.setMode('walk'))).toBe(true);

  // Before the leaf on B's side, facing it (north, yaw 0), level.
  await page.evaluate(([eye]) => window.__viewer.setCamera({ x: 582.5, y: 142 + eye, z: 1135, yaw: 0, pitch: 0 }), [EYE] as const);
  await page.evaluate(() => window.__viewer.walkFor(0.2, { forward: 0 }));
  await settle(page);
  expect((await page.evaluate(() => window.__viewer.doors())).doors.map((d) => d.node)).toEqual(['bdoor_4', 'wdoor_1', 'wdoor_2']);
  expect((await page.evaluate(() => window.__viewer.doors())).target).toBe(0);
  expect((await page.evaluate(() => window.__viewer.hud())).model.action).toBe('door');

  await page.keyboard.press('KeyX');
  await used(page, 0);
  expect((await page.evaluate(() => window.__viewer.doors())).doors[0]).toMatchObject({ open: true, busy: false });
  expect((await page.evaluate(() => window.__viewer.audio())).recent.some((p: { name: string }) => p.name === '.DOOR_WOOD_OPEN')).toBe(true);
  await page.screenshot({ path: join(SCREENS, 'frostfire-bdoor4-open.png') });

  const through = await page.evaluate(() => { window.__viewer.walkFor(3, { forward: 1 }); return window.__viewer.feet(); });
  expect(through![2]).toBeLessThan(1110);                            // past the leaf's line at z 1117

  // Back on B's side, the reticle on the OPEN leaf (FUN_005aa240 picks the node under the reticle, not the doorway: the
  // leaf has swung 100 degrees north about its hinge at (588.8, 1117), its middle near (589.9, 1110.6)). X shuts it.
  const [sx, sz, lx, lz] = [584, 1125, 589.9, 1110.6];
  const yawAtLeaf = Math.atan2(-(lx - sx), -(lz - sz)) * 180 / Math.PI;
  await page.evaluate(([eye, x, z, yaw]) => window.__viewer.setCamera({ x, y: 142 + eye, z, yaw, pitch: 0 }), [EYE, sx, sz, yawAtLeaf] as const);
  await page.evaluate(() => window.__viewer.walkFor(0.2, { forward: 0 }));
  await settle(page);
  expect((await page.evaluate(() => window.__viewer.doors())).target).toBe(0);
  await page.keyboard.press('KeyX');
  await used(page, 0);
  expect((await page.evaluate(() => window.__viewer.doors())).doors[0]).toMatchObject({ open: false, busy: false });
  // Facing the doorway again, the shut leaf stops the SEAL once more.
  await page.evaluate(([eye]) => window.__viewer.setCamera({ x: 582.5, y: 142 + eye, z: 1135, yaw: 0, pitch: 0 }), [EYE] as const);
  const stopped = await page.evaluate(() => { window.__viewer.walkFor(3, { forward: 1 }); return window.__viewer.feet(); });
  expect(stopped![2]).toBeGreaterThan(1118);
  await page.screenshot({ path: join(SCREENS, 'frostfire-bdoor4-shut.png') });
  expect(problems).toEqual([]);
});
