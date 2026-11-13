import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type {} from '../src/hook';
import { TEST_ROOM } from './urls';
import { holdReleased } from './loadHold';

/**
 * The traversal on Frostfire (web research 86): the sniper ladder at (547.5, 854.4) from the 100 floor to the 160
 * deck, the 11.9 crate at x 922.8-940.6, z 761-778.1 with the climb icon and the X key, and the peek on E, driven
 * through the debug hook with `walkFor` (frame-rate proof) and photographed mid-ladder, mid-climb and peeking. The crate
 * is its own case, an expected failure while LATER 680 stands (below).
 */

const SCREENS = fileURLToPath(new URL('../../../test-fixtures/screens/traversal', import.meta.url));

const settle = (page: Page, frames = 4): Promise<void> => page.evaluate((n) => new Promise<void>((done) => {
  let left = n;
  const next = (): void => { if (--left <= 0) done(); else requestAnimationFrame(next); };
  requestAnimationFrame(next);
}), frames);

/** Frostfire in the test room, on foot: the page's errors collected into `problems`. */
async function onFoot(page: Page, problems: string[]): Promise<void> {
  mkdirSync(SCREENS, { recursive: true });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  await page.goto(`${TEST_ROOM}?map=MP2&mode=play&fly&devmode`);
  const status = page.locator('#status');
  await expect(status).toContainText('FROSTFIRE (MP2)');
  await expect(status).toContainText('triangles');
  await holdReleased(page);                                   // the loading screen's hold (`./loadHold`)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  expect(await page.evaluate(() => window.__viewer.setMode('walk'))).toBe(true);
}

test('the ladder and the peek on Frostfire (web research 86)', async ({ page }) => {
  const problems: string[] = [];
  await onFoot(page, problems);

  // The ladder: five on the map; walked into from +z facing it -- not grabbed: CLIMB offered (LC-1, the owner's playtest on
  // the original, research 86 s2.6) -- X mounts it, climbed, off onto the deck.
  await page.evaluate(() => window.__viewer.setCamera({ x: 547.5, y: 115.4, z: 869, yaw: 0, pitch: -5 }));
  expect(await page.evaluate(() => window.__viewer.traversal()?.ladders)).toBe(5);
  const offered = await page.evaluate(() => {
    const v = window.__viewer;
    for (let i = 0; i < 90; i++) { v.walkFor(1 / 60, { forward: 1 }); if (v.traversal()?.prompt?.kind === 'ladder') return { prompt: v.traversal()?.prompt, kind: v.traversal()?.kind }; }
    return null;
  });
  expect(offered).toEqual({ prompt: { visible: true, kind: 'ladder', automatic: false }, kind: 'none' });   // RED before LC-1: grabbed
  await page.evaluate(() => window.__viewer.walkFor(1, { forward: 1 }));
  expect(await page.evaluate(() => window.__viewer.traversal()?.kind)).toBe('none');                    // pushed in, still not grabbed
  await settle(page);
  expect((await page.evaluate(() => window.__viewer.hud())).model.action).toBe('climb');               // the HUD's action_climb.tif
  await page.keyboard.press('KeyX');
  await settle(page, 2);
  const mounted = await page.evaluate(() => {
    const v = window.__viewer;
    for (let i = 0; i < 30; i++) { if (v.traversal()?.kind !== 'none') return v.traversal()?.kind; v.walkFor(1 / 60, { forward: 0 }); }
    return v.traversal()?.kind ?? null;
  });
  expect(['ladderMount', 'ladder']).toContain(mounted);
  await page.evaluate(() => window.__viewer.walkFor(3, { forward: 1 }));
  const onLadder = await page.evaluate(() => ({ t: window.__viewer.traversal(), feet: window.__viewer.feet(), anim: window.__viewer.stats().anim }));
  expect(onLadder.t?.kind).toBe('ladder');
  // The body's clip is the frame loop's (`play.frame`), a frame or more behind the synchronous walk: on a loaded host the
  // read above still saw the stand (the 2026-10-01 run). Held on the rungs, the clip follows.
  await expect.poll(() => page.evaluate(() => window.__viewer.stats().anim?.clip ?? null), { timeout: 15_000 }).toBe('seal_climbladder');
  expect(onLadder.feet![1]).toBeGreaterThan(110);
  expect(onLadder.t?.events.filter((e) => e.type === 'ladderRung').length).toBeGreaterThan(3);
  await settle(page);
  expect((await page.evaluate(() => window.__viewer.hud())).model.action).toBe('ladder_slide');
  await page.screenshot({ path: join(SCREENS, 'e2e-ladder-mid.png') });
  await page.evaluate(() => window.__viewer.walkFor(5, { forward: 1 }));
  await page.evaluate(() => window.__viewer.walkFor(1, { forward: 0 }));
  const top = await page.evaluate(() => ({ t: window.__viewer.traversal(), feet: window.__viewer.feet() }));
  expect(top.t?.kind).toBe('none');
  expect(top.feet![1]).toBeCloseTo(160, 3);

  // The crate is its own case below (LATER 680).

  // The peek: E held on the open floor at spawn A; the camera's target shifts 2.8 to the right.
  await page.evaluate(() => window.__viewer.setCamera({ x: 796, y: 115.4, z: 614, yaw: 180, pitch: -5 }));
  await page.keyboard.down('KeyE');
  await settle(page, 3);
  await page.evaluate(() => window.__viewer.walkFor(1, { forward: 0 }));
  const peek = await page.evaluate(() => ({ t: window.__viewer.traversal(), anim: window.__viewer.stats().anim }));
  expect(peek.t?.peek).toBeGreaterThan(0.99);
  // The clip is the frame loop's, behind the synchronous walk (as the ladder's above): E is still held, so it follows.
  await expect.poll(() => page.evaluate(() => window.__viewer.stats().anim?.clip ?? null), { timeout: 15_000 }).toBe('seal_stand2rlean');
  await settle(page);
  await page.screenshot({ path: join(SCREENS, 'e2e-peek-right.png') });
  await page.keyboard.up('KeyE');
  await settle(page, 3);
  await page.evaluate(() => window.__viewer.walkFor(1, { forward: 0 }));
  expect(await page.evaluate(() => window.__viewer.traversal()?.peek)).toBeLessThan(0.01);

  // The ladder from its head: walked into facing it from the 160 deck -- offered, not grabbed (LC-1: the head's mount is
  // the same press as the foot's, `mountOffered` -> `mountTop`) -- X, then the "180" turns the SEAL and the climb-off
  // backwards puts it on the rungs (web research 86 section 2.4). Until LC-1 the walk in alone mounted it.
  await page.evaluate(() => window.__viewer.setCamera({ x: 547.5, y: 175.4, z: 842, yaw: 180, pitch: -5 }));
  const headOffered = await page.evaluate(() => {
    const v = window.__viewer;
    for (let i = 0; i < 240; i++) { v.walkFor(1 / 60, { forward: 1 }); if (v.traversal()?.prompt?.kind === 'ladder') return { prompt: v.traversal()?.prompt, kind: v.traversal()?.kind }; }
    return null;
  });
  expect(headOffered).toEqual({ prompt: { visible: true, kind: 'ladder', automatic: false }, kind: 'none' });
  await page.keyboard.press('KeyX');
  await settle(page, 2);
  const head = await page.evaluate(() => {
    const v = window.__viewer, seen: string[] = [];
    for (let i = 0; i < 240; i++) {
      const k = v.traversal()?.kind ?? 'none';
      if (seen.at(-1) !== k && k !== 'none') seen.push(k);
      if (k === 'ladder') break;
      v.walkFor(1 / 60, { forward: 0 });
    }
    return seen;
  });
  expect(head).toEqual(['turn180', 'ladderMountTop', 'ladder']);
  await settle(page);
  await page.screenshot({ path: join(SCREENS, 'e2e-ladder-head.png') });

  // The dive: a run on the open floor at spawn A, then prone (the stance button's full press) -- the dive, prone after.
  await page.evaluate(() => window.__viewer.setCamera({ x: 796, y: 115.4, z: 614, yaw: 180, pitch: -5 }));
  // In one go: the page's own frames would stop the run between two calls (a stick at rest stops at once).
  const dived = await page.evaluate(() => {
    const v = window.__viewer;
    v.walkFor(0.6, { forward: 1 });
    const prone = v.setStance('prone');
    v.walkFor(0.25, { forward: 0 });
    return { prone, kind: v.traversal()?.kind };
  });
  expect(dived).toEqual({ prone: true, kind: 'dive' });
  await settle(page);
  await page.screenshot({ path: join(SCREENS, 'e2e-dive.png') });
  await page.evaluate(() => window.__viewer.walkFor(1.5, { forward: 0 }));
  expect(await page.evaluate(() => window.__viewer.traversal()?.kind)).toBe('none');
  expect(await page.evaluate(() => window.__viewer.stance())).toBe('prone');
  expect(problems).toEqual([]);
});

/**
 * The crate straight up the x 938 lane: the icon once its side is touched, X climbs it. **An expected failure** --
 * LATER 680 (simulation track, open): walked -z up this lane the -x side line meets prop01's side face and stores no
 * contact, so the page offers no climb where the original does (an r0004 capture); vitest holds the same gap as
 * `it.fails` (`test/parity/climbInterrupt.parity.test.ts`). The assertions are the original's, unweakened: `test.fail()`
 * reports the case as expected while it fails, and fails loudly the day the mover offers the climb here -- then this
 * line goes, and LATER 680 closes. Split from the ladder-and-peek case (the v0.4.19 browser view) so the ladder, the
 * peek, the ladder from its head and the dive run while the gap stands. `test.fail()` is declared only after the setup
 * (the room loaded, the hold released, the stand, the walk in, no page error so far), directly before the CLIMB
 * prompt's assertion: a setup that fails is a real red, never the expected failure.
 */
test('the crate climbed from x 938 on Frostfire (web research 86) -- expected to fail until LATER 680', async ({ page }) => {
  const problems: string[] = [];
  await onFoot(page, problems);
  // The crate: the icon once its side is touched, X climbs it.
  await page.evaluate(() => window.__viewer.setCamera({ x: 938, y: 115.4, z: 795, yaw: 0, pitch: -5 }));
  await page.evaluate(() => window.__viewer.walkFor(0.6, { forward: 1 }));
  expect(problems, 'the setup ran clean (a red here is not LATER 680)').toEqual([]);
  test.fail(true, 'LATER 680: walked straight up Frostfire\'s x 938 lane the crate offers no climb (the -x side line stores no contact); the original offers it');
  expect(await page.evaluate(() => window.__viewer.traversal()?.prompt), 'LATER 680: the crate\'s CLIMB prompt from the x 938 lane').toEqual({ visible: true, kind: 'low', automatic: false });
  await settle(page);
  expect((await page.evaluate(() => window.__viewer.hud())).model.action).toBe('climb');   // the HUD's action_climb.tif
  await page.keyboard.press('KeyX');
  await settle(page, 2);
  await page.evaluate(() => window.__viewer.walkFor(0.45, { forward: 0 }));
  expect(await page.evaluate(() => window.__viewer.traversal()?.clip)).toBe('seal_climbcrate');
  await page.evaluate(() => window.__viewer.setCamera({ pitch: -45 }));
  await settle(page);
  await page.screenshot({ path: join(SCREENS, 'e2e-climb-mid.png') });
  await page.evaluate(() => window.__viewer.walkFor(2, { forward: 0 }));
  expect((await page.evaluate(() => window.__viewer.feet()))![1]).toBeCloseTo(111.85, 2);
  // The walk's own jump still works after a climb: the standing jump (research 80) on the crate's top.
  expect(await page.evaluate(() => window.__viewer.jump())).toBe(true);
  expect(await page.evaluate(() => window.__viewer.traversal()?.kind)).toBe('none');
  expect(problems).toEqual([]);
});
