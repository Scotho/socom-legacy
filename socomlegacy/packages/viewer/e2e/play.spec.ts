import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
// `src/hook.ts` is types only; its `declare global` is what makes `window.__viewer` exist inside `page.evaluate`.
import type {} from '../src/hook';
import { TEST_ROOM } from './urls';
import { holdReleased } from './loadHold';

/**
 * The play mode on Frostfire (web sprint 2, W2.2b and W2.6; ruling W2.R1): walk entered at A's spawn shows the SEAL at
 * the feet in the stand clip, seen over its shoulder; W held walks it in a locomotion clip; the jump puts it in the
 * air in a jump clip; aiming draws the frame from its eyes with the body hidden; fly mode hides it. Pictures from the
 * shoulder and from the eyes.
 *
 * Needs the owner's `RUN/MOTION_P.ZAR` and `RUN/READERC.ZAR` beside the maps: without the pack the body stands in its
 * bind pose and `stats().anim` stays null.
 */

/** Screenshots are evidence, not fixtures: `socomlegacy/test-fixtures/` is git-ignored. */
const SCREENS = fileURLToPath(new URL('../../../test-fixtures/screens/play', import.meta.url));

/** A's spawn on Frostfire (KNOWN section 1), the feet, and the eye 15.4 over them (W1.R2), as `walk.spec.ts` has them. */
const SPAWN_A: [number, number, number] = [796, 100, 614];
const EYE = 15.4;
/** Facing research 24 section 6.1's first waypoint, (806, 665), from A: the floor at 100 runs all the way. */
const YAW_TO_1 = Math.atan2(-(806 - 796), -(665 - 614)) * 180 / Math.PI;
/** The Seal anim set's forward set (research 80): the player walks `seal_walk_alert`, jogs `seal_jog_alert`, runs `seal_run`. */
const LOCOMOTION = ['seal_walk_alert', 'seal_jog_alert', 'seal_run'];

/** Two frames with the pose in them before the canvas is worth photographing. */
const settle = (page: Page): Promise<void> => page.evaluate(
  () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
);
const stats = (page: Page) => page.evaluate(() => window.__viewer.stats());

test('the play mode: the SEAL at A in the game\'s clips, over its shoulder, jumping and aiming (W2.2b, W2.6)', async ({ page }) => {
  mkdirSync(SCREENS, { recursive: true });
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || (m.type() === 'warning' && /GL_INVALID|WebGPU.*(error|fail)/i.test(m.text()))) {
      problems.push(`console: ${m.text()}`);
    }
  });

  await page.goto(`${TEST_ROOM}?mode=play&fly&devmode`);
  const status = page.locator('#status');
  await expect(status).toContainText('triangles');
  await page.locator('#maps').selectOption('RUN/MP2.ZDB');
  await expect(status).toContainText('FROSTFIRE (MP2)');
  await expect(status).toContainText('triangles');
  await holdReleased(page);                                   // the loading screen's hold (`./loadHold`)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  // Fly mode: the body is not shown (the panel's switch is off), the fly camera draws.
  expect((await stats(page)).body?.visible).toBe(false);
  expect((await stats(page)).view.kind).toBe('fly');

  // Walk at A: the body at the feet, in the stand clip once the clips are in, the shoulder camera drawing.
  expect(await page.evaluate(() => window.__viewer.setMode('walk'))).toBe(true);
  await page.evaluate(([x, y, z, eye, yaw]) => window.__viewer.setCamera({ x, y: y + eye, z, yaw, pitch: 0 }), [...SPAWN_A, EYE, YAW_TO_1] as const);
  expect(await page.evaluate(() => window.__viewer.feet())).toEqual(SPAWN_A);
  await expect.poll(async () => (await stats(page)).anim?.clip ?? null).toBe('seal_stand');
  const standing = await stats(page);
  expect(standing.body?.visible).toBe(true);
  expect(standing.body?.at).toEqual(SPAWN_A);
  expect(standing.view.kind).toBe('third');
  // the game's camera (FUN_0029a950): behind the feet along the look and above them -- 28.75 back at pitch 0, less pitched
  const cam = standing.view.pose;
  const fx = -Math.sin(YAW_TO_1 * Math.PI / 180), fz = -Math.cos(YAW_TO_1 * Math.PI / 180);
  const back = -((cam.x - SPAWN_A[0]) * fx + (cam.z - SPAWN_A[2]) * fz);
  expect(back).toBeGreaterThan(0);
  expect(back).toBeLessThan(29);
  expect(cam.y - SPAWN_A[1]).toBeGreaterThan(5);
  expect(cam.y - SPAWN_A[1]).toBeLessThan(28);
  await settle(page);
  await page.screenshot({ path: join(SCREENS, 'frostfire-play-shoulder-a.png') });

  // W held for a second: a locomotion clip while held, and the feet moved along the floor at 100.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1000);
  const walking = await stats(page);
  await page.keyboard.up('KeyW');
  expect(LOCOMOTION).toContain(walking.anim?.clip);
  await page.waitForTimeout(600);                  // the glide runs out
  const moved = (await page.evaluate(() => window.__viewer.feet()))!;
  expect(Math.hypot(moved[0] - SPAWN_A[0], moved[2] - SPAWN_A[2])).toBeGreaterThan(2);
  expect(moved[1]).toBeCloseTo(100, 3);

  // The jump standing still (research 80): the Jump action -- seal_jump on the floor, the feet never leaving it -- and
  // the camera's target rising with the clip's root (FUN_0029a950 reads the posed root). The root dips under the standing
  // 11.48 until key 10 (10.51 .. 10.77, then 11.46, 13.09 .. 15.08 at key 12; the clip lasts 0.993 s, research 80 s3), so
  // the look samples by the clock, the clip's whole length plus a margin (1.2 s, and at least 40 frames) -- a count of
  // frames alone ended before the rise on a fast GPU (the root crosses the standing + 2 near key 10.3, about 0.54 s, so 40
  // frames fail above about 75 Hz; the real-GPU red, mega 7cd782a5f, read the first sample 11.484375). The crossing's own
  // time is bounded too (0.9 s, at 20 Hz or faster), so a camera that lags or eases the root still fails.
  await page.waitForTimeout(600);
  const rootBefore = (await page.evaluate(() => window.__viewer.camera()))!.rootY;
  const jumped = await page.evaluate((before) => {
    const v = window.__viewer;
    const ok = v.jump();
    const t0 = performance.now();
    return new Promise<{ ok: boolean; airborne: boolean | undefined; clip: string | undefined; top: number; ms: number; frames: number; crossMs: number | null }>((done) => {
      let top = 0, frames = 0, airborne: boolean | undefined, clip: string | undefined, crossMs: number | null = null;
      const look = (): void => {
        const r = v.camera()?.rootY ?? 0;
        top = Math.max(top, r);
        if (crossMs === null && r > before + 2) crossMs = performance.now() - t0;
        if (frames === 0) { airborne = v.mover()?.airborne; clip = v.stats().anim?.clip; }
        else if (v.mover()?.airborne) airborne = true;
        if (++frames < 40 || performance.now() - t0 < 1200) requestAnimationFrame(look);
        else done({ ok, airborne, clip, top, ms: performance.now() - t0, frames, crossMs });
      };
      requestAnimationFrame(look);
    });
  }, rootBefore);
  const hz = jumped.frames / (jumped.ms / 1000);
  test.info().annotations.push({ type: 'jump look', description: `top ${jumped.top.toFixed(3)} over ${jumped.ms.toFixed(0)} ms, ${hz.toFixed(0)} Hz, crossed at ${jumped.crossMs === null ? 'never' : jumped.crossMs.toFixed(0) + ' ms'}` });
  expect(jumped.ok).toBe(true);
  expect(jumped.airborne).toBe(false);
  expect(jumped.top).toBeGreaterThan(rootBefore + 2);              // seal_jump's root: 10.5 to 15.1
  if (hz >= 20) expect(jumped.crossMs!).toBeLessThan(900);         // key 10.3 at about 0.54 s, plus a frame and the blend
  await expect.poll(async () => (await stats(page)).anim?.clip ?? null).toBe('seal_stand');

  // The picture from the shoulder, standing again.
  await page.waitForTimeout(1500);
  await settle(page);
  await page.screenshot({ path: join(SCREENS, 'frostfire-play-shoulder.png') });

  // First person (the zoom's first step; owner 2026-10-01) and the scope: from the eyes, the body hidden; then over the
  // shoulder.
  expect(await page.evaluate(() => window.__viewer.zoomIn())).toBe(1);
  await settle(page);
  const firstPerson = await stats(page);
  expect(firstPerson.view.kind).toBe('scope');                      // the view from the head
  expect(firstPerson.body?.visible).toBe(false);
  await page.screenshot({ path: join(SCREENS, 'frostfire-play-first-person.png') });
  expect(await page.evaluate(() => window.__viewer.zoomIn())).toBe(5);
  await settle(page);
  const aiming = await stats(page);
  expect(aiming.view.kind).toBe('scope');
  expect(aiming.body?.visible).toBe(false);
  const feet = (await page.evaluate(() => window.__viewer.feet()))!;
  expect(aiming.view.pose.y - feet[1]).toBeGreaterThan(15);         // the head, 18.3 over the feet standing (./stature)
  expect(aiming.view.pose.y - feet[1]).toBeLessThan(20);
  await page.screenshot({ path: join(SCREENS, 'frostfire-play-scope.png') });
  expect(await page.evaluate(() => window.__viewer.zoomOut())).toBe(1);
  expect(await page.evaluate(() => window.__viewer.zoomOut())).toBe(0);
  await expect.poll(async () => (await stats(page)).view.kind).toBe('third');

  // Fly mode again: the body hidden, the fly camera drawing, left where the eye was.
  const eye = await page.evaluate(() => window.__viewer.pose());
  expect(await page.evaluate(() => window.__viewer.setMode('fly'))).toBe(true);
  await settle(page);
  const flying = await stats(page);
  expect(flying.view.kind).toBe('fly');
  expect(flying.body?.visible).toBe(false);
  expect(await page.evaluate(() => window.__viewer.pose())).toEqual(eye);

  expect(problems).toEqual([]);
});
