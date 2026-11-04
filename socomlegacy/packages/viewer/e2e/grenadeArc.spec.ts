import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { maxThrowDistance, maxThrowSpeed, THROW_ARC, THROW_GRAVITY } from '@s2u/scene';
// `src/hook.ts` is types only; its `declare global` is what makes `window.__viewer` exist inside `page.evaluate`.
import type {} from '../src/hook';
import type { ArcStats } from '../src/grenade';
import type { Stance } from '../src/mover';
import { TEST_ROOM } from './urls';
import { holdReleased } from './loadHold';

/**
 * The yellow arc on Frostfire (socomlegacy/docs/research/85 §11, `FUN_005970b0`): with the M67 up and the trigger held the arc
 * shows -- the game's (0.78, 0.78, 0), its 100 steps and the closing one -- and grows as the power builds; let go, it is
 * gone, and the grenade that leaves follows it. The screenshot is the evidence.
 */

const SCREENS = fileURLToPath(new URL('../../../test-fixtures/screens/grenade', import.meta.url));
const SPAWN_A: [number, number, number] = [796, 100, 614];
const EYE = 15.4;

const settle = (page: Page): Promise<void> => page.evaluate(
  () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
);

/** What the first frame with the arc drawn showed, read in the page beside the press (a test instrument; no game value). */
interface FirstArc { arc: ArcStats; phase: string; power: number; stance: Stance; heldMs: number }

/**
 * The trigger pressed and, in the same `page.evaluate`, the arc read on the first animation frame it is drawn -- so the
 * page's latency to the spec cannot age the reading. `heldMs`: the press to that frame, wall time.
 */
const pressAndReadArc = (page: Page): Promise<FirstArc> => page.evaluate(() => new Promise<FirstArc>((done, fail) => {
  const t0 = performance.now();
  window.__viewer.trigger(true);
  const look = (): void => {
    const g = window.__viewer.grenade();
    if (g.arc?.visible) { done({ arc: g.arc, phase: g.phase, power: g.power, stance: window.__viewer.stance(), heldMs: performance.now() - t0 }); return; }
    if (performance.now() - t0 > 10_000) { fail(new Error('the arc was not drawn within 10 s of the press')); return; }
    requestAnimationFrame(look);
  };
  look();
}));

/**
 * The held throw's speed ceiling for the arc `a` drew, from the page's own functions (`@s2u/scene` `throwVelocity`'s
 * `Math.min(maxSpeed, ...)`, `maxSpeed` = `maxThrowSpeed(maxThrowDistance(stance), h)`): the hand's height `h` over the
 * feet is the one `throwArc` was given, recovered from the arc's own `t1` (`throwArcTime(vy, h) x THROW_ARC.endScale`,
 * the later root of `-49 t^2 + vy t + h = 0`, so `h = 49 t^2 - vy t`).
 */
const arcSpeedCap = (a: ArcStats, stance: Stance): number => {
  const t = a.t1 / THROW_ARC.endScale;
  const h = (THROW_GRAVITY / 2) * t * t - a.velocity[1]! * t;
  return maxThrowSpeed(maxThrowDistance(stance), h).speed;
};

test('walk mode on Frostfire: the yellow arc shows while the throw is held and is gone once it is thrown', async ({ page }) => {
  mkdirSync(SCREENS, { recursive: true });
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || (m.type() === 'warning' && /GL_INVALID|WebGPU.*(error|fail)/i.test(m.text()))) problems.push(`console: ${m.text()}`);
  });

  await page.goto(`${TEST_ROOM}?mode=play&fly&devmode`);
  const status = page.locator('#status');
  await expect(status).toContainText('triangles');
  await page.locator('#maps').selectOption('RUN/MP2.ZDB');
  await expect(status).toContainText('FROSTFIRE (MP2)');
  await expect(status).toContainText('triangles');
  await holdReleased(page);                                   // the loading screen's hold (`./loadHold`)

  // West-south-west of A the dock is open (grenade.spec.ts), aimed a little up.
  expect(await page.evaluate(() => window.__viewer.setMode('walk'))).toBe(true);
  await page.evaluate(([x, y, z, eye]) => window.__viewer.setCamera({ x, y: y + eye, z, yaw: 240, pitch: 12 }), [...SPAWN_A, EYE] as const);
  await page.evaluate(() => window.__viewer.walkFor(0.3, { forward: 0 }));
  await page.waitForTimeout(1000);
  await page.keyboard.press('Backquote');                    // the panel away: the picture is the evidence
  expect(await page.evaluate(() => window.__viewer.equipGrenade(true))).toBe(true);
  await settle(page);
  expect((await page.evaluate(() => window.__viewer.grenade())).arc).toBeNull();   // up, not held: no arc

  // The trigger held: the arc, yellow, and longer as the power builds -- until the speed reaches its ceiling
  // (`throwVelocity`'s `Math.min(maxSpeed, ...)`, from about 0.4 s held), past which it is no faster. The early reading is
  // the first frame the arc is drawn, read in the page beside the press (`pressAndReadArc`), its hold time recorded.
  const first = await pressAndReadArc(page);
  const early = first.arc;
  test.info().annotations.push({ type: 'early arc', description: `${first.heldMs.toFixed(0)} ms held, power ${first.power.toFixed(3)}` });
  expect(early.segments).toBe(101);
  expect(early.color[0]).toBeCloseTo(0.78, 5);
  expect(early.color[1]).toBeCloseTo(0.78, 5);
  expect(early.color[2]).toBe(0);
  expect(first.phase).toBe('holding');
  const earlySpeed = Math.hypot(...early.velocity), cap = arcSpeedCap(early, first.stance);
  expect(earlySpeed, 'the arc\'s speed is never over its ceiling').toBeLessThanOrEqual(cap + 1e-6);
  await page.waitForTimeout(700);
  await settle(page);
  const late = (await page.evaluate(() => window.__viewer.grenade())).arc!;
  expect(late.visible).toBe(true);
  const lateSpeed = Math.hypot(...late.velocity);
  if (earlySpeed < cap - 1e-6) expect(lateSpeed, `faster as the power builds (early ${first.heldMs.toFixed(0)} ms held, under the ceiling ${cap})`).toBeGreaterThan(earlySpeed);
  else expect(lateSpeed, `at the ceiling ${cap} already (early ${first.heldMs.toFixed(0)} ms held): no faster`).toBeCloseTo(earlySpeed, 6);
  await page.locator('#view').screenshot({ path: join(SCREENS, 'frostfire-grenade-arc.png') });

  // Let go: the arc is gone at once (the clip starts), and the grenade leaves.
  await page.evaluate(() => window.__viewer.trigger(false));
  await expect.poll(() => page.evaluate(() => window.__viewer.grenade().arc)).toBeNull();
  await expect.poll(() => page.evaluate(() => window.__viewer.grenade().lastThrow !== null), { timeout: 5_000 }).toBe(true);
  const after = await page.evaluate(() => window.__viewer.grenade());
  expect(after.arc).toBeNull();
  expect(after.live.length).toBe(1);
  // It flies the arc's way: the same heading over the ground (the release is the posed hand's, the arc the table's).
  const t = after.lastThrow!;
  const heading = (v: readonly number[]): number => Math.atan2(v[0]!, v[2]!);
  expect(Math.abs(heading(t.velocity) - heading(late.velocity))).toBeLessThan(0.1);
  expect(problems).toEqual([]);
});
