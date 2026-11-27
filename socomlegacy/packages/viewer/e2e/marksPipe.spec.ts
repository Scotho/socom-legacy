import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
// The debug hook's shape, types only (see `viewer.spec.ts`).
import type {} from '../src/hook';
import { TEST_ROOM } from './urls';
import { holdReleased } from './loadHold';
import { OpenedContexts } from './openedContexts';

const opened = new OpenedContexts();
test.afterEach(() => opened.closeAll());

/**
 * WM-20 (research 431; reading, pending review), the rendered check at the owner's pipe (IMG_8928): on Frostfire the two
 * bent pipes' collision hull (`worldmodel/short_pip1/di_pipe1_5`, `short_pip2/di_pipe1`, x 733-759, y 101-148,
 * z 841-853 and 881-893) stands a median 15.4 units off the drawn pipe, past the clip's 4.8, so the original keeps no
 * triangle and draws no mark where a round stops on the hull. In the test room (the dev viewer, its world whole once the
 * props' reveal is done), the walker fires one round at each of six pinned points of each pipe's hull where the clip
 * keeps nothing (`AIMS`); a round that stops there (`fire().lastHit` within `ON_TARGET` of the point) with its clip
 * keeping no drawn triangle (`fire().lastKept` 0, the hook's test instrument) must add no visible mark
 * (`fire().decals`), and at least one such round must happen on each pipe. A refused shot is retried (`TRIES`) and
 * every refusal, miss and kept clip is reported; nothing is skipped silently. The picture is saved.
 *
 * History (G1, PC 3's GPU, 2026-11-15): 19:08Z read `lastShade` null as "nothing kept" (a clip kept off the centre is
 * null too) and counted one false mark; the 23:5xZ repeat counted right, but a fan about each pipe's centre found only
 * hull points that keep triangles, stood pip2's walker behind pip1 (pip2's hall point lay inside pip1's hull) and
 * skipped 19 of 25 refused shots silently. A rendered browser run: opt-in (`S2U_MARKS_PIPE=1`), on a GPU lock; the counts
 * and the screenshots are the evidence, kept apart from the unit tests.
 */
const RUN = process.env['S2U_MARKS_PIPE'] === '1';
const SCREENS = fileURLToPath(new URL('../../../test-fixtures/screens/marks-pipe', import.meta.url));
const EYE = 15.4;
/** A round counts on its point when it stops this close to it (units). */
const ON_TARGET = 1.5;
/** A refused shot (the rifle's wait, a reload) is asked again this many times, a tenth of a second of real time apart. */
const TRIES = 12;
/** The aim taken again from the camera's eye after each turn, at most this many times, until it turns less than AIM_SETTLED degrees. */
const AIM_PASSES = 6;
/** Each pass cuts the turn by about the camera's orbit over the range (~0.43): 0.5 degrees is a miss of ~0.2 units at 30. */
const AIM_SETTLED = 0.5;
/** The walker stands this far out along the face's normal. */
const STAND = 30;
/**
 * The aim points: empty samples of the census's own sampling (`tools/marks-pipe-aims.ts`: a mark centre every 4 units on
 * each hull face, the clip tried on either side at the row's least, middle and greatest size; run on the disc
 * 2026-11-16 on agent/wm-effects-g1 (main 0b5a034883): 226 empty sideways samples a pipe, none with a drawn surface
 * within 60 along the face's normal). pip1 is shot on its -z face from the hall, pip2 on its +z face from behind it, so
 * neither stands in the other's way.
 */
const AIMS: { name: string; centre: [number, number, number]; normal: [number, number, number]; points: [number, number, number][] }[] = [
  {
    name: 'short_pip1', centre: [746, 125, 847], normal: [0, 0, -1],
    points: [[733.2, 109.1, 841.2], [733.2, 122.7, 841.2], [733.2, 136.4, 841.2], [744.2, 107.7, 841.2], [744.2, 120.8, 841.2], [743.9, 135.1, 841.2]],
  },
  {
    name: 'short_pip2', centre: [746, 125, 887], normal: [0, 0, 1],
    points: [[733.2, 108, 892.9], [733.2, 121.6, 892.9], [733.5, 136.4, 892.9], [744.2, 108.8, 892.9], [744.2, 121.9, 892.9], [744.2, 135.1, 892.9]],
  },
];
const settle = (page: Page): Promise<void> => page.evaluate(
  () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
);
/** The camera's yaw and pitch (degrees) looking from `from` to `to`: forward = (-sin yaw cos p, sin p, -cos yaw cos p). */
function aimAt(from: readonly number[], to: readonly number[]): { yaw: number; pitch: number } {
  const d = [to[0]! - from[0]!, to[1]! - from[1]!, to[2]! - from[2]!];
  const len = Math.hypot(d[0]!, d[1]!, d[2]!);
  return { yaw: (Math.atan2(-d[0]!, -d[2]!) * 180) / Math.PI, pitch: (Math.asin(d[1]! / len) * 180) / Math.PI };
}
const r1 = (v: readonly number[]): number[] => v.map((x) => Math.round(x * 10) / 10);

test.skip(!RUN, 'a rendered check on a GPU lock: S2U_MARKS_PIPE=1');
test.setTimeout(300_000);

test('Frostfire\'s bent pipes: a round stopped on the hull with nothing drawn within reach leaves no mark', async ({ page }) => {
  mkdirSync(SCREENS, { recursive: true });
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(`${TEST_ROOM}?map=MP2&mode=play&fly&devmode&kit=62,15,121,126,255`);
  await expect(page.locator('#status')).toContainText('triangles');
  await holdReleased(page);
  await expect.poll(() => page.evaluate(() => window.__viewer.effects().loaded), { timeout: 60_000 }).toBe(true);
  // The props' reveal done: the marks' clipper is whole from here (`main.ts` `show`, MARK_LATE_REVEAL_ADAPTATION).
  await expect.poll(() => page.evaluate(() => window.__viewer.links().warmed['props'] ?? null), { timeout: 120_000 }).not.toBeNull();
  expect(await page.evaluate(() => window.__viewer.setMode('walk'))).toBe(true);
  const report: Record<string, unknown>[] = [];
  for (const pipe of AIMS) {
    let onHull = 0, onHullMarked = 0, keptOnHull = 0, missed = 0, refused = 0, notFired = 0, unstood = 0;
    const shots: Record<string, unknown>[] = [];
    for (const point of pipe.points) {
      // Stood STAND out along the face's normal; the floor's height found by the walk's own teleport.
      const sx = point[0] + pipe.normal[0] * STAND, sz = point[2] + pipe.normal[2] * STAND;
      let feet: number[] | null = null;
      for (const y of [101, 100, 102, 105, 110, 90]) {
        if (await page.evaluate(([x, yy, z]) => window.__viewer.teleport?.(x!, yy!, z!) ?? false, [sx, y, sz])) { feet = [sx, y, sz]; break; }
      }
      if (!feet) { unstood++; shots.push({ point, stood: null }); continue; }
      await page.evaluate(() => window.__viewer.walkFor(0.3, { forward: 0 }));
      // The shot's eye is the third-person camera's (`camera().eye`, walk.ts's game eye), which moves as the view
      // turns (`setCamera` in the walk is a turn the next tick takes): aimed again from the eye the turn left, until
      // the turn is under AIM_SETTLED degrees (the review's F1); the last pass's turn is reported (`lastTurn`).
      let eye: number[] = [];
      let settled = false, lastTurn = Infinity;
      for (let k = 0; k < AIM_PASSES && !settled; k++) {
        eye = (await page.evaluate(() => window.__viewer.camera()))!.eye;
        const a = aimAt(eye, point);
        const was = await page.evaluate(() => window.__viewer.pose());
        await page.evaluate((v) => window.__viewer.setCamera(v), a);
        await page.evaluate(() => window.__viewer.walkFor(0.1, { forward: 0 }));
        lastTurn = Math.max(Math.abs(((a.yaw - was.yaw + 540) % 360) - 180), Math.abs(a.pitch - was.pitch));
        settled = lastTurn < AIM_SETTLED;
      }
      eye = (await page.evaluate(() => window.__viewer.camera()))!.eye;
      const m = (await page.evaluate(() => window.__viewer.fire())).magazine;
      if (m.rounds === 0 && !m.reloading) { await page.keyboard.press('KeyR'); await page.waitForTimeout(3000); }
      // The review's F4: `decals` counts visible marks, and the pool's trim (150 triangles) hides the oldest as a new one
      // comes, so a new mark could hide behind an old one going. At most 12 rounds here, each a few clipped triangles,
      // stay far under it; the hook has no call that clears the bullet marks alone. A known, low risk, said here.
      const before = (await page.evaluate(() => window.__viewer.fire())).decals;
      let fired = false, tries = 0;
      while (!fired && tries < TRIES) {
        tries++;
        fired = await page.evaluate(() => window.__viewer.shoot() !== null);
        if (!fired) { refused++; await page.waitForTimeout(100); }   // real time: the fire's timers run on page frames (F2)
      }
      if (!fired) { notFired++; shots.push({ point, eye: r1(eye), aimSettled: settled, lastTurn: Math.round(lastTurn * 100) / 100, fired: false, tries }); continue; }
      await settle(page);
      const f = await page.evaluate(() => window.__viewer.fire());
      const hit = f.lastHit?.point ?? null;
      const off = hit ? Math.hypot(hit[0]! - point[0], hit[1]! - point[1], hit[2]! - point[2]) : null;
      const marked = f.decals > before;
      if (off !== null && off <= ON_TARGET && f.lastKept === 0) { onHull++; if (marked) onHullMarked++; }
      else if (off !== null && off <= ON_TARGET && f.lastKept !== null) keptOnHull++;
      else missed++;
      shots.push({ point, eye: r1(eye), aimSettled: settled, lastTurn: Math.round(lastTurn * 100) / 100, tries, hit: hit ? r1(hit) : null, off: off === null ? null : Math.round(off * 100) / 100, kept: f.lastKept, marked });
    }
    report.push({ pipe: pipe.name, onHull, onHullMarked, keptOnHull, missed, refused, notFired, unstood, shots });
    console.log(`MARKS_PIPE ${pipe.name} ${JSON.stringify(report.at(-1))}`);
    // The picture: the free camera out from the shot face, the pipe in view.
    expect(await page.evaluate(() => window.__viewer.setMode('fly'))).toBe(true);
    const cam = [pipe.centre[0] - 20, pipe.centre[1] + 5, pipe.centre[2] + pipe.normal[2] * 38];
    await page.evaluate(([x, y, z, a]) => window.__viewer.setCamera({ x: x!, y: y!, z: z!, ...(a as { yaw: number; pitch: number }) }),
      [cam[0], cam[1], cam[2], aimAt(cam, pipe.centre)] as const);
    await page.waitForTimeout(500);
    await settle(page);
    await page.locator('#view').screenshot({ path: join(SCREENS, `marks-pipe-${pipe.name}.png`) });
    expect(await page.evaluate(() => window.__viewer.setMode('walk'))).toBe(true);
  }
  console.log(`MARKS_PIPE ${JSON.stringify({ report, eyeHeight: EYE, problems })}`);
  for (const r of report) {
    expect(r['onHullMarked'], `${r['pipe']}: rounds on an empty hull point that left a mark`).toBe(0);
    expect(r['onHull'] as number, `${r['pipe']}: at least one round stopped on an empty hull point`).toBeGreaterThan(0);
  }
  expect(problems).toEqual([]);
});
