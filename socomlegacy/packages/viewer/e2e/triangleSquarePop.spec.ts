import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { OpenedContexts } from './openedContexts';
import { TEST_ROOM } from './urls';

/**
 * OT.R76 (Benny's PR #461 ported into the live controls, the double tap retired) rendered: `/testroom` on Frostfire
 * (MP2) with a simulated standard Gamepad, the default stance mode (`'pop'`) -- no experiment flag, the live lanes. Benny's
 * rendered checks (`playtests/triangle-square/browser.mjs`), on what the page now ships: a Triangle tap crouches, still and
 * running; a Triangle hold drops (or dives, running) and a fresh Square inside it stands at once with no get-up clip;
 * Square alone is the native jump; Square held before Triangle does not pop; the second Triangle from prone is the
 * original's get-up, not a pop; the rise stays the 260 ms one. The served tree comes from `npm run extract-maps`.
 */

const WEB = fileURLToPath(new URL('../../..', import.meta.url));
test.skip(!existsSync(join(WEB, 'public', 'maps', 'index.json')), 'maps absent: extract them with npm run extract-maps');

const opened = new OpenedContexts();
test.afterEach(() => opened.closeAll());

type Viewer = {
  setMode(m: string): unknown; setCamera(p: object): unknown; setStance(s: string): unknown; stance(): string;
  stats(): { body?: unknown; anim?: { clip?: string } };
  loading(): { blocked: boolean };
};
type W = Window & { __viewer: Viewer };
const TRIANGLE = 3, SQUARE = 2;

const button = (p: Page, i: number, down: boolean) => p.evaluate(([i, down]) => {
  Object.assign((navigator.getGamepads()[0] as unknown as { buttons: object[] }).buttons[i as number]!, { pressed: down, touched: down, value: down ? 1 : 0 });
}, [i, down] as const);
const move = (p: Page, forward: number) => p.evaluate((f) => { (navigator.getGamepads()[0] as unknown as { axes: number[] }).axes[1] = -f; }, forward);
const stance = (p: Page) => p.evaluate(() => (window as unknown as W).__viewer.stance());

async function reset(p: Page): Promise<void> {
  await p.evaluate(() => {
    const pad = navigator.getGamepads()[0] as unknown as { axes: number[]; buttons: object[] };
    pad.axes.fill(0);
    for (const b of pad.buttons) Object.assign(b, { pressed: false, touched: false, value: 0 });
    const v = (window as unknown as W).__viewer;
    v.setMode('fly'); v.setCamera({ x: 796, y: 115.4, z: 614, yaw: 240, pitch: -9.167 }); v.setMode('walk'); v.setStance('stand');
    document.querySelector('canvas')?.focus();
  });
  await p.waitForTimeout(1200);
}

test('OT.R76 rendered: Triangle taps crouch, a hold then Square pops (drop and dive), Square alone jumps, no double tap', async ({ browser }) => {
  test.setTimeout(240_000);
  const context = opened.add(await browser.newContext({ viewport: { width: 1280, height: 720 } }));
  const p = await context.newPage();
  const errors: string[] = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.addInitScript(() => {
    const pad = { id: 'OT.R76 test controller', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
  });
  await p.goto(`${TEST_ROOM}?mode=play&map=MP2&view=modern&online=off&devmode&noarmory&nomatch&kit=54,15,121,126,122`);
  await p.waitForFunction(() => { const v = (window as unknown as W).__viewer; return !!v?.stats().body && !v.loading().blocked; }, undefined, { timeout: 120_000 });
  await p.bringToFront();
  // The rise constant, from the dev server's own module (a variable specifier: the served path, not one tsc resolves).
  expect(await p.evaluate(async (m) => (await import(/* @vite-ignore */ m) as { PRONE_POP_RISE_S_ADAPTATION: number }).PRONE_POP_RISE_S_ADAPTATION, '/src/animator.ts')).toBe(0.26);

  // A Triangle tap crouches, still and running -- no dive, no pop.
  for (const moving of [false, true]) {
    await reset(p);
    if (moving) { await move(p, 1); await p.waitForTimeout(700); }
    await button(p, TRIANGLE, true); await p.waitForTimeout(80); await button(p, TRIANGLE, false);
    // B188's run (2026-10-30): no crouch in 5 s, the stance it stood in unrecorded. Named now: 'stand', the 80 ms tap
    // fell between two of the page's frames; 'prone', a frame's hitch summed it past `STANCE_HOLD_S_PLACEHOLDER` (a hold).
    await p.waitForFunction(() => (window as unknown as W).__viewer.stance() === 'crouch', undefined, { timeout: 5000 })
      .catch(async (e: unknown) => { throw new Error(`the Triangle tap (${moving ? 'running' : 'still'}) left the stance at '${await stance(p)}', not 'crouch'`, { cause: e }); });
    await move(p, 0);
  }

  // A Triangle hold drops (still) or dives (running); a fresh Square inside it stands at once, no get-up clip.
  for (const moving of [false, true]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await reset(p);
      if (moving) { await move(p, 1); await p.waitForTimeout(700); }
      await button(p, TRIANGLE, true);
      await p.waitForFunction(() => (window as unknown as W).__viewer.stance() === 'prone', undefined, { timeout: 5000, polling: 'raf' });
      await button(p, TRIANGLE, false);
      await button(p, SQUARE, true);
      // The pop: standing at once, and the body's rise done within its 260 ms (well under the get-up's ~0.9 s clip).
      const at = Date.now();
      await p.waitForFunction(() => (window as unknown as W).__viewer.stance() === 'stand', undefined, { timeout: 3000, polling: 'raf' });
      await p.waitForFunction(() => (window as unknown as W).__viewer.stats().anim?.clip !== 'seal_stand2prone', undefined, { timeout: 3000, polling: 'raf' });
      expect(Date.now() - at, `${moving ? 'dive' : 'drop'} ${attempt + 1}: risen in the pop's time, not the get-up's`).toBeLessThan(600);
      await p.waitForTimeout(350); await button(p, SQUARE, false); await move(p, 0);
    }
  }

  // Square alone: the native jump (its clip), not a pop.
  await reset(p);
  await p.evaluate(() => {
    const t: string[] = []; (window as unknown as { __clips: string[] }).__clips = t;
    const f = (): void => { t.push((window as unknown as W).__viewer.stats().anim?.clip ?? ''); requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  await button(p, SQUARE, true); await p.waitForTimeout(80); await button(p, SQUARE, false);
  await p.waitForFunction(() => (window as unknown as { __clips: string[] }).__clips.some((c) => /jump/i.test(c)), undefined, { timeout: 4000 });
  await p.waitForTimeout(1500);
  expect(await stance(p)).toBe('stand');

  // Square held before Triangle: the hold's drop is not popped by it.
  await reset(p);
  await button(p, SQUARE, true); await p.waitForTimeout(1500);
  await button(p, TRIANGLE, true);
  await p.waitForFunction(() => (window as unknown as W).__viewer.stance() === 'prone', undefined, { timeout: 5000, polling: 'raf' });
  await button(p, TRIANGLE, false); await p.waitForTimeout(400);
  expect(await stance(p)).toBe('prone');
  await button(p, SQUARE, false);

  // The double tap retired: settled prone, a second Triangle takes the original get-up (a clip), not the pop.
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const t: string[] = []; (window as unknown as { __seen: string[] }).__seen = t;
    const t0 = performance.now();
    const f = (): void => { const v = (window as unknown as W).__viewer; t.push(`${v.stance()}:-:${v.stats().anim?.clip ?? '?'}:${Math.round((performance.now() - t0) / 100)}`); if (t.length < 400) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  await button(p, TRIANGLE, true); await p.waitForTimeout(80); await button(p, TRIANGLE, false);
  await p.waitForTimeout(3000);
  // The get-up is the original's clip (`seal_stand2prone` played back, about 0.9 s), read on the body's animation (the
  // page hook's mover state carries no action) -- where a pop would rise in `PRONE_POP_RISE_S_ADAPTATION` (0.26 s).
  const trace = await p.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
  test.info().annotations.push({ type: 'second Triangle', description: JSON.stringify(trace.filter((s, i, a) => i === 0 || s.replace(/:\d+$/, '') !== a[i - 1]!.replace(/:\d+$/, ''))) });
  const getUp = trace.filter((s) => s.split(':')[2] === 'seal_stand2prone').map((s) => Number(s.split(':')[3]));
  expect(getUp.length, `the get-up clip played: ${JSON.stringify(trace.slice(0, 3))}`).toBeGreaterThan(0);
  expect(Math.max(...getUp) - Math.min(...getUp), 'the get-up runs its clip (tenths of a second), not the 260 ms rise').toBeGreaterThanOrEqual(5);

  expect(errors).toEqual([]);
});
