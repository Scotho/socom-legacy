import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
// `src/hook.ts` is types only; its `declare global` is what makes `window.__viewer` exist inside `page.evaluate`.
import type {} from '../src/hook';
import { TEST_ROOM } from './urls';
import { holdReleased } from './loadHold';

/**
 * The Ruins' (MP12) rain as the port draws it (an investigation's instrument, not a gate: the rain-mp12 report). Four
 * pictures in walk mode -- standing in the open at spawn A, looking up, under a roof (an `m_inside` floor), and wading
 * -- with the page's frame rate and the effects' counts beside each. Opt-in: RAIN_SHOTS names the folder the pictures
 * go to; without it the spec is skipped.
 */
const OUT = process.env.RAIN_SHOTS ?? '';

const settle = (page: Page): Promise<void> => page.evaluate(
  () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
);

/** Frames a second over `ms` of the page's own animation frames. */
const fps = (page: Page, ms = 1500): Promise<number> => page.evaluate((ms) => new Promise<number>((done) => {
  let n = 0;
  const t0 = performance.now();
  const step = (): void => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(step); else done((n * 1000) / (performance.now() - t0)); };
  requestAnimationFrame(step);
}), ms);

test.skip(!OUT, 'RAIN_SHOTS not set');
test.use({ viewport: { width: 1600, height: 900 } });

test('MP12: the rain in the open, looking up, under cover and wading', async ({ page }) => {
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const notes: Record<string, unknown> = {};
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  await page.goto(`${TEST_ROOM}?map=MP12&mode=play&devmode&nomatch`);
  const status = page.locator('#status');
  await expect(status).toContainText('(MP12)', { timeout: 120_000 });
  await expect(status).toContainText('triangles', { timeout: 120_000 });
  await expect.poll(() => page.evaluate(() => window.__viewer.effects().loaded), { timeout: 120_000 }).toBe(true);
  await holdReleased(page);
  notes.renderer = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('webgl2');
    const d = c?.getExtension('WEBGL_debug_renderer_info');
    return d && c ? String(c.getParameter(d.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });
  expect(await page.evaluate(() => window.__viewer.setMode('walk'))).toBe(true);
  await page.waitForTimeout(3000);                                    // the rain's sources fill their volume

  const shot = async (name: string): Promise<void> => {
    await settle(page);
    const e = await page.evaluate(() => window.__viewer.effects());
    notes[name] = {
      fps: await fps(page), particles: e.particles, ambient: e.ambient, feet: await page.evaluate(() => window.__viewer.feet()),
      pose: await page.evaluate(() => window.__viewer.pose()), camera: await page.evaluate(() => window.__viewer.camera()),
    };
    await page.screenshot({ path: `${OUT}/${name}.png` });
  };

  // 1. Standing still in the open: spawn A, the walk's own view.
  await shot('01-open-spawn-a');
  // 2. Looking up.
  await page.evaluate(() => { const p = window.__viewer.pose(); window.__viewer.setCamera({ yaw: p.yaw, pitch: 45 }); });
  await page.waitForTimeout(1500);
  await shot('02-looking-up');
  // 3. Under cover: an `m_inside` floor (MP12's `worldmodel/g372_1`, the probe's list), looking out.
  const covered = await page.evaluate(() => window.__viewer.teleport?.(719, 106, 1930, 0) ?? false);
  notes.coveredTeleport = covered;
  await page.evaluate(() => window.__viewer.setCamera({ pitch: 0 }));
  await page.waitForTimeout(2500);
  await shot('03-under-cover');
  // 4. Wading: a material-11 (WATER) polygon at (2007, 60, 1325), the W key held. 2026-11-07's run: the feet stood at
  // y 52.8 under it and the held key did not move the SEAL (no wake), so 04/05 show standing there, not wading.
  const wet = await page.evaluate(() => window.__viewer.teleport?.(2007, 60, 1325, 90) ?? false);
  notes.waterTeleport = wet;
  await page.waitForTimeout(1500);
  await page.keyboard.down('w');
  await page.waitForTimeout(1200);
  await shot('04-wading');
  await page.keyboard.up('w');
  await page.waitForTimeout(800);
  await shot('05-wading-still');
  notes.problems = problems.slice(0, 20);
  writeFileSync(`${OUT}/run-notes.json`, JSON.stringify(notes, null, 1));
});

/**
 * INV-RAIN's after pictures beside The Ruins': the other maps F1 moved -- Blizzard's (MP1) snow (`snow_falling`, its
 * velocity kept across its loop and switched off under a roof by `CAMERA_INDOORS`) and Frostfire's (MP2) vent flames
 * (`firey_flames`, their throw kept across their switching) -- one picture each at the walk's own spawn view.
 */
for (const [map, name] of [['MP1', '06-mp1-snow'], ['MP2', '07-mp2-flames']] as const) {
  test(`${map}: the weather and flames F1 moved, at the spawn`, async ({ page }) => {
    test.setTimeout(300_000);
    mkdirSync(OUT, { recursive: true });
    await page.goto(`${TEST_ROOM}?map=${map}&mode=play&devmode&nomatch`);
    const status = page.locator('#status');
    await expect(status).toContainText(`(${map})`, { timeout: 120_000 });
    await expect(status).toContainText('triangles', { timeout: 120_000 });
    await expect.poll(() => page.evaluate(() => window.__viewer.effects().loaded), { timeout: 120_000 }).toBe(true);
    await holdReleased(page);
    expect(await page.evaluate(() => window.__viewer.setMode('walk'))).toBe(true);
    await page.waitForTimeout(4000);
    await settle(page);
    const e = await page.evaluate(() => window.__viewer.effects());
    writeFileSync(`${OUT}/${name}.json`, JSON.stringify({ fps: await fps(page), particles: e.particles, ambient: e.ambient, feet: await page.evaluate(() => window.__viewer.feet()) }, null, 1));
    await page.screenshot({ path: `${OUT}/${name}.png` });
  });
}
