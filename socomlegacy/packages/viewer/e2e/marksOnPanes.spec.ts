import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
// `src/hook.ts` is types only; its `declare global` is what makes `window.__viewer` exist inside `page.evaluate`.
import type {} from '../src/hook';
import { TEST_ROOM } from './urls';

/**
 * LATER 277's paired check (the owner's playtest list of 2026-10-23: bullet marks hang on shattered windows, ghost doors,
 * the blown bridge and bomb site): the same pane shot in the test room's own world (`&nomatch`) and in the page's match
 * room (the offline match, the room's own code: `./net/loopback`, the pane's state reaching the page through the room's
 * env as a server's does). Frostfire's first breakable pane (`bdoor_4`'s `pane1`; research 210 s6, research 176 s4.1's
 * witness segment): one round breaks it (health 1), and its mark is placed on it. What it records, both ways: the marks
 * drawn before and after the break (`__viewer.fire().decals`, the visible marks) and the frame. The expectation is the
 * original's by inference (research 92 s6: a decal is drawn in its hit node's own packet, so it goes with the node):
 * the broken pane's mark is drawn no more. Not yet RED or GREEN on either source: the round stops on the frame's
 * camera-only face before the pane, which never breaks (LATER 413), so the spec is held fixme on it.
 */

const SCREENS = fileURLToPath(new URL('../../../test-fixtures/screens/later-277', import.meta.url));
const PANE = 'worldmodel/bdoor_4/door1=door1/door_slab/pane1';
/** Research 176 s4.1's witness segment through it (eye height, +z), and the pane's middle on it. */
const FROM: [number, number, number] = [582.257, 157.312, 1109.525];
const AT: [number, number, number] = [582.257, 157.312, 1117.525];
const EYE = 15.4;

const settle = (page: Page): Promise<void> => page.evaluate(
  () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
);

async function shootPane(page: Page, tag: string): Promise<{ before: number; after: number; active: (boolean | null)[]; hits: (string | null)[] }> {
  mkdirSync(SCREENS, { recursive: true });
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}${e.stack ? `\n${e.stack}` : ''}`));
  await expect(page.locator('#status')).toContainText('triangles', { timeout: 120_000 });
  await page.waitForTimeout(1500);                                   // the props stream in after the world (`main.ts`)
  expect(await page.evaluate(() => window.__viewer.setMode('walk'))).toBe(true);
  // Stand back from the pane on the witness line, facing it (+z: yaw 180), the eye on its height.
  const stood = await page.evaluate(([x, y, z]) => window.__viewer.teleport!(x, y, z, 180), [FROM[0], FROM[1] - EYE, FROM[2] - 20] as const);
  expect(stood, `${tag}: stood on the witness line`).toBe(true);
  await page.evaluate(() => window.__viewer.walkFor(0.3, { forward: 0 }));
  const eye = (await page.evaluate(() => window.__viewer.camera()))!.eye;
  const pitch = (Math.atan2(AT[1] - eye[1], Math.hypot(AT[0] - eye[0], AT[2] - eye[2])) * 180) / Math.PI;
  await page.evaluate((p) => window.__viewer.setCamera({ yaw: 180, pitch: p }), pitch);
  await page.evaluate(() => window.__viewer.walkFor(0.2, { forward: 0 }));
  await settle(page);
  const before = (await page.evaluate(() => window.__viewer.fire())).decals;
  const active: (boolean | null)[] = [await page.evaluate((p) => window.__viewer.worldActive(p), PANE)];
  const hits: (string | null)[] = [];
  for (let i = 0; i < 3 && active.at(-1) !== false; i++) {
    const shot = await page.evaluate(() => window.__viewer.shoot());
    hits.push(shot?.hit ? `${shot.hit.point.map((v) => v.toFixed(1)).join(',')}` : null);
    await page.evaluate(() => window.__viewer.walkFor(0.4, { forward: 0 }));
    active.push(await page.evaluate((p) => window.__viewer.worldActive(p), PANE));
  }
  await settle(page);
  const after = (await page.evaluate(() => window.__viewer.fire())).decals;
  await page.locator('#view').screenshot({ path: join(SCREENS, `${tag}-after-break.png`) });
  console.log(`L277 ${tag} ${JSON.stringify({ eye, pitch, before, after, active, hits, problems })}`);
  expect(problems).toEqual([]);
  return { before, after, active, hits };
}

test.describe('LATER 277: a broken pane takes its bullet marks with it', () => {
  test.setTimeout(240_000);
  // LATER 413 (issue #505): the round's trace takes the frames' camera-only faces (cameratype 1) in front of every Frostfire
  // pane, so a round stops there (z 1116.5 here, two rendered runs of 2026-10-24) and the pane never breaks by gunfire; its
  // marks land on that face, not under the pane. This check runs once 413 lets the round reach the pane.
  test.fixme(true, 'LATER 413: rounds stop on the pane frame camera face; the pane never breaks by gunfire');

  test("the test room's own world (&nomatch)", async ({ page }) => {
    await page.goto(`${TEST_ROOM}?map=MP2&mode=play&nomatch&devmode&noarmory`);
    const r = await shootPane(page, 'nomatch');
    expect(r.active.at(-1), 'the pane broke').toBe(false);
    expect(r.after, "the broken pane's marks are drawn no more").toBe(r.before);
  });

  test('the page\'s match room (the offline match: the room\'s own code)', async ({ page }) => {
    await page.goto(`${TEST_ROOM}?map=MP2&mode=play&devmode&noarmory`);
    const r = await shootPane(page, 'match');
    expect(r.active.at(-1), 'the pane broke').toBe(false);
    expect(r.after, "the broken pane's marks are drawn no more").toBe(r.before);
  });
});
