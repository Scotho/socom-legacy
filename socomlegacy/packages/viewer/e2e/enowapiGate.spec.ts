import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
// `src/hook.ts` is types only; its `declare global` is what makes `window.__viewer` exist inside `page.evaluate`.
import type {} from '../src/hook';
import { TEST_ROOM } from './urls';
import { holdReleased } from './loadHold';

/**
 * MAP-07's rendered run (PR #427): Enowapi's gate 2 rises when its lever is pulled. In the page's own match on MP62 (the
 * offline room, `../src/net/loopback`, which runs the lever's program -- so the address carries no `&fly`: `?fly` with
 * `?devmode` turns the match off, `soloMatchOn`), the walker is stood at `epanel_di2` by the dev-only
 * `__viewer.teleport`, the reticle on the panel (the HUD's prompt `lever`, `action_pull_lever.tif`), and the action
 * button is pressed through the page's own path (`__viewer.action()`: the walk's action filter, the switch's
 * `ActionPage.action`, the room's `useAction`).
 *
 * The rise: `gate_openclose2`'s `gateopen` moves `access2/gate_move2` by the relative target (0, +35, 0) over 3 s --
 * `OBJECT_MOTION_FROM_TO` flags 9, the position block the u16 at +0xc points at, as #427's decoder reads it
 * (`@s2u/scene` `decodeEffectOp`, `translation`; research 174 §5, line 250, and its "Decoder correction": the old read of
 * +0x38/+0x44 printed the target as (0, 0, 35)). The program opens on `woodgate == 0 OR woodgate2 == 0`, which the
 * effect runner folds since LATER 310 (research 174 §5.1); before it the leaf sank 35. The drawn leaf is read through
 * `__viewer.gates()` (`./gatePage` `stats`, a test instrument), and two screenshots are the evidence.
 */

const MAPS = resolve(fileURLToPath(new URL('../../../public/maps', import.meta.url)));
const HAVE = existsSync(join(MAPS, 'RUN', 'MP62.ZDB'));

/** `gate_openclose2`'s `gateopen` target, parent space (decoded above; research 174 §5). */
const RISE = 35;
/** The slide's seconds (`OBJECT_MOTION_FROM_TO` +0x34), after the program's 0.24 s wait. */
const SLIDE_S = 3;
const WAIT_S = 0.24;
/**
 * Where the walker stands, and the pitch it looks down at: found off the browser by `test/enowapiStandDisc.test.ts`
 * (the dev disc, the page's own map, world, walk and use ray). `epanel_di2`'s one polygon -- x 1490.2, y 184.3-189.9,
 * z 1907.3-1912.6, facing +x -- is met edge-on from the south, so the look must cross its plane. Fuse's stand
 * (1491.2, 172.2, 1892.25; the PR's r7, measured under his camera lead probe, LATER 308) settles 0.89 east on the hull,
 * and faced from the nominal stand the ray passed east of the panel to `worldmodel/g4440` at every pitch (the rendered
 * run at b7e29e69b: no prompt at -30..+30). Stood at the feet the walker reaches, facing the panel from them
 * (yaw 173.87), pitch -15..-30 names the lever; -21 is the middle. The ground-plane distance, about 17.7, is inside the
 * action's range of 20 (research 174 §5).
 */
const STAND: [number, number, number] = [1492.1, 172.4, 1892.25];
const PITCH = -21;
const PANEL: [number, number, number] = [1490.2, 187.1, 1909.95];
/** A test tolerance (headless frame scheduling against the wall clock), no game value. */
const E2E_SLACK_S = 1.5;

/** The facing toward the panel: the look (-sin f, 0, -cos f) (`turretMount.spec.ts`'s convention). */
const FACING = (Math.atan2(-(PANEL[0] - STAND[0]), -(PANEL[2] - STAND[2])) * 180) / Math.PI;

const frames = (page: Page, n: number): Promise<void> => page.evaluate((count) => new Promise<void>((done) => {
  let left = count;
  const step = (): void => { if (--left <= 0) done(); else requestAnimationFrame(step); };
  requestAnimationFrame(step);
}), n);

const gate2 = (page: Page): Promise<[number, number, number] | null> =>
  page.evaluate(() => window.__viewer.gates?.().find((g) => g.node === 'gate_move2')?.offset ?? null);

test('MP62: at epanel_di2, one action press raises gate_move2 by 35 over about 3 s and it never sinks', async ({ page }, testInfo) => {
  test.skip(!HAVE, 'needs socomlegacy/public/maps/RUN/MP62.ZDB (tools/extract-maps.ts)');
  test.setTimeout(240_000);
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });

  await page.goto(`${TEST_ROOM}?map=MP62&mode=play&devmode&noarmory&kit=62,15,145,185,255`);
  await expect(page.locator('#status')).toContainText('(MP62)', { timeout: 120_000 });
  await expect.poll(() => page.evaluate(() => window.__viewer.net?.()?.state ?? null), { timeout: 60_000 }).toBe('open');
  await expect.poll(() => page.evaluate(() => window.__viewer.feet()), { timeout: 60_000 }).not.toBeNull();
  await holdReleased(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // After the round's start: the launch countdown ends in the round's spawn, which would stand the walker back.
  await expect.poll(() => page.evaluate(() => window.__viewer.net?.()?.waiting ?? null), { timeout: 60_000 }).toBe(false);

  // Both gates read, shut.
  const listed = await page.evaluate(() => window.__viewer.gates?.() ?? null);
  expect(listed?.map((g) => g.node)).toEqual(['gate_move1', 'gate_move2']);
  expect(await gate2(page)).toEqual([0, 0, 0]);

  // Stood at the panel, facing it; the reticle brought onto it (the prompt is the room's switch under the reticle).
  expect(await page.evaluate(([x, y, z, yaw]) => window.__viewer.teleport!(x, y, z, yaw), [...STAND, FACING] as const)).toBe(true);
  await frames(page, 10);
  const feet = (await page.evaluate(() => window.__viewer.feet()))!;
  expect(Math.hypot(feet[0] - STAND[0], feet[2] - STAND[2])).toBeLessThan(1);
  let onPanel = false;
  const seen: string[] = [];
  // The panel's middle sits about 15 above the feet and 17.7 ahead: the sweep reaches past the camera's lift both ways.
  for (const pitch of [PITCH, 0, -3, 3, -6, 6, -9, 9, -12, 12, -15, 15, -18, 18, -21, 21, -24, 24, -27, 27, -30, 30]) {
    await page.evaluate(([yaw, p]) => window.__viewer.setCamera({ yaw, pitch: p }), [FACING, pitch] as const);
    await frames(page, 6);
    const action = await page.evaluate(() => window.__viewer.hud().model.action);
    seen.push(`${pitch}:${String(action)}`);
    if (action === 'lever') { onPanel = true; break; }
  }
  expect(onPanel, `the lever prompt at epanel_di2 (pitch:prompt ${seen.join(' ')})`).toBe(true);
  await page.locator('#view').screenshot({ path: testInfo.outputPath('enowapi-gate2-shut.png') });

  // One press, the page's own path.
  expect(await page.evaluate(() => window.__viewer.action())).toBe(true);
  const t0 = Date.now();
  const samples: { t: number; y: number }[] = [];
  while ((Date.now() - t0) / 1000 < WAIT_S + SLIDE_S + E2E_SLACK_S + 1) {
    const at = await gate2(page);
    if (at) samples.push({ t: (Date.now() - t0) / 1000, y: at[1] });
    await page.waitForTimeout(100);
  }
  await testInfo.attach('gate2-rise', { body: JSON.stringify(samples), contentType: 'application/json' });
  // Never below shut (the pre-LATER 310 runner sank it 35), never past the open end.
  expect(Math.min(...samples.map((s) => s.y))).toBeGreaterThan(-0.5);
  expect(Math.max(...samples.map((s) => s.y))).toBeLessThan(RISE + 0.5);
  // Mid-way it is moving, not snapped: some sample strictly between the ends.
  expect(samples.some((s) => s.y > 2 && s.y < RISE - 2), 'a sample mid-slide').toBe(true);
  // At the end: open, +35 on the parent's y.
  const end = (await gate2(page))!;
  expect(end[1]).toBeCloseTo(RISE, 1);
  expect(Math.abs(end[0])).toBeLessThan(1e-3);
  expect(Math.abs(end[2])).toBeLessThan(1e-3);
  // It opened inside the slide's time and the slack: the first sample at the open end.
  const opened = samples.find((s) => s.y > RISE - 0.5);
  expect(opened, 'the gate reached its open end').toBeTruthy();
  expect(opened!.t).toBeLessThan(WAIT_S + SLIDE_S + E2E_SLACK_S);
  expect(opened!.t).toBeGreaterThan(SLIDE_S * 0.5);
  await page.locator('#view').screenshot({ path: testInfo.outputPath('enowapi-gate2-open.png') });

  expect(problems).toEqual([]);
});
