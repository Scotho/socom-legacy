import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
// `src/hook.ts` is types only; its `declare global` is what makes `window.__viewer` exist inside `page.evaluate`.
import type {} from '../src/hook';
import { TEST_ROOM } from './urls';
import { holdReleased } from './loadHold';

/**
 * Desert Glory's (MP6) look as the port draws it -- DF-11 of the Desert Glory / Fish Hook release (plan
 * `2026-11-08-desert-glory-fish-hook.md`), on `waterLook.spec.ts`'s pattern. An instrument, not a gate: a browser
 * adaptation with no original, which changes nothing the game does; the canvas alone is captured (no disc texture is
 * written). **Listed, not run where it was written** (2026-11-08, the owner's browser view held that host): it runs on a
 * box with the disc or MP6's fixture, its pictures going to
 * `agent-mail/evidence/dg-fishhook-readiness-2026-11-08/looks/`.
 *
 * The free camera at fixed poses, in the PS2 picture on both backends (`&renderer=webgpu`, `&renderer=webgl2`), with
 * the page's frame rate and the effects' counts beside each shot and the page's errors (`problems`, owed empty):
 * - `01-sky-rim`: the sky dome's rim and its blended cap from spawn A (837, -5, 1901; research 75's table), looking
 *   toward spawn B -- research 82 line 279's hard-edged cap, before/after D8;
 * - `02-sky-cap`: the cap overhead from the same spot;
 * - `03-jail-inside`: inside the hostages' cell (the three starts at (1750..1770, 50.99, 1170..1240); research 175 §
 *   P/M), looking at the bars (`nohostagerescue` / `okhostagerescue` at x 1731-1734, research 239 §1.2) and `cdoor1`
 *   (1732.6, 50.5, 1218.4);
 * - `04-jail-outside`: the cell through the bars from the corridor;
 * - `05-deck`: the deck at (1660, 30, 1428), yaw 180 (research 281 §7's walk);
 * - `06-lightning`: a flash mid-blink -- the seven `flsh*` nodes under `mp6_skydome`, hidden at the load and blinked by
 *   the `mp6_battlesounds` loop about 0.2 s every 2-4 s (research 237 §6); the shot is taken on the first frame a
 *   `flsh*` node is active (`worldStates()`), the node named in the notes; within 30 s or "not seen" recorded.
 * Opt-in: DG_LOOK_SHOTS names the folder; without it the spec is skipped. DG_LOOK_BACKENDS narrows the backends.
 */
const OUT = process.env.DG_LOOK_SHOTS ?? '';
const BACKENDS = (process.env.DG_LOOK_BACKENDS ?? 'webgpu,webgl2').split(',') as ('webgpu' | 'webgl2')[];
const MAP = 'MP6';
/** The walker's eye over the feet (`mover.ts` `EYE_HEIGHT`). */
const EYE = 15.4;

/** A pose that looks from `eye` at `at` (yaw 0 faces -z, 90 faces -x; pitch up positive), in degrees. */
const aim = (eye: [number, number, number], at: [number, number, number]) => {
  const dx = at[0] - eye[0], dy = at[1] - eye[1], dz = at[2] - eye[2];
  const yaw = (Math.atan2(-dx, -dz) * 180) / Math.PI;
  const pitch = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
  return { x: eye[0], y: eye[1], z: eye[2], yaw, pitch };
};
type Pose = ReturnType<typeof aim>;

const SPAWN_A: [number, number, number] = [837, -5 + EYE, 1901];
const POSES: Record<string, Pose> = {
  '01-sky-rim': aim(SPAWN_A, [1865, 185, 1221]),
  '02-sky-cap': { x: SPAWN_A[0], y: SPAWN_A[1], z: SPAWN_A[2], yaw: -55, pitch: 70 },
  '03-jail-inside': aim([1762, 50.99 + EYE, 1205], [1732, 58, 1214]),
  '04-jail-outside': aim([1700, 50.99 + EYE, 1214], [1760, 56, 1205]),
  '05-deck': { x: 1660, y: 30 + EYE, z: 1428, yaw: 180, pitch: 0 },
};
/** Where `06-lightning` looks: up from the dome's centre (`mp6_skydome` at (1800, 0, 1800)), the most of the dome in view. */
const LIGHTNING: Pose = { x: 1800, y: 120, z: 1800, yaw: 0, pitch: 70 };

const settle = (page: Page): Promise<void> => page.evaluate(
  () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
);
/** Frames a second over `ms` of the page's own animation frames (the frame line). */
const fps = (page: Page, ms = 1500): Promise<number> => page.evaluate((ms) => new Promise<number>((done) => {
  let n = 0;
  const t0 = performance.now();
  const step = (): void => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(step); else done((n * 1000) / (performance.now() - t0)); };
  requestAnimationFrame(step);
}), ms);

test.skip(!OUT, 'DG_LOOK_SHOTS not set');
test.use({ viewport: { width: 1280, height: 900 } });

for (const backend of BACKENDS) {
  test(`${MAP} ps2 ${backend}: the sky rim, the jail, the deck and a lightning blink`, async ({ page }) => {
    test.setTimeout(300_000);
    mkdirSync(OUT, { recursive: true });
    const notes: Record<string, unknown> = { map: MAP, view: 'ps2', backend };
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    await page.goto(`${TEST_ROOM}?map=${MAP}&mode=play&fly&devmode&nomatch&view=ps2&renderer=${backend}`);
    const status = page.locator('#status');
    await expect(status).toContainText(`(${MAP})`, { timeout: 120_000 });
    await expect(status).toContainText('triangles', { timeout: 120_000 });
    await holdReleased(page);
    await expect.poll(() => page.evaluate(() => window.__viewer.effects().loaded), { timeout: 120_000 }).toBe(true);
    notes.status = await status.textContent();
    notes.toggles = await page.evaluate(() => window.__viewer.toggles());
    expect(await page.evaluate(() => window.__viewer.setMode('fly'))).toBe(true);
    await page.addStyleTag({ content: '* { visibility: hidden !important; } canvas#view { visibility: visible !important; }' });
    const canvas = page.locator('#view');
    const shot = async (name: string, pose: Pose, wait = 1200): Promise<void> => {
      await page.evaluate((p) => window.__viewer.setCamera(p), pose);
      if (wait) await page.waitForTimeout(wait);
      await settle(page);
      const effects = await page.evaluate(() => window.__viewer.effects());
      notes[name] = { pose: await page.evaluate(() => window.__viewer.pose()), fps: wait ? Math.round(await fps(page)) : null, effects };
      await canvas.screenshot({ path: `${OUT}/${MAP}-ps2-${backend}-${name}.png` });
    };
    for (const [name, pose] of Object.entries(POSES)) await shot(name, pose);
    // The lightning: the camera placed, then the first frame a flsh* node shows.
    await page.evaluate((p) => window.__viewer.setCamera(p), LIGHTNING);
    await page.waitForTimeout(1200);
    const blink = await page.waitForFunction(
      () => (window.__viewer.worldStates() ?? []).find((s) => /flsh/i.test(s.path) && s.active)?.path ?? false,
      null, { timeout: 30_000, polling: 'raf' },
    ).then((h) => h.jsonValue() as Promise<string>).catch(() => null);
    notes.lightning = blink ?? 'not seen in 30 s';
    if (blink) await shot('06-lightning', LIGHTNING, 0);
    notes.problems = problems.slice(0, 20);
    writeFileSync(`${OUT}/${MAP}-ps2-${backend}-notes.json`, JSON.stringify(notes, null, 1));
    expect(problems).toEqual([]);
  });
}
