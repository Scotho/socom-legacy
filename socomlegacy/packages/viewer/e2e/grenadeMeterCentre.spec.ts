import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
// `src/hook.ts` is types only; its `declare global` is what makes `window.__viewer` exist inside `page.evaluate`.
import type {} from '../src/hook';
import { TEST_ROOM } from './urls';
import { holdReleased } from './loadHold';

/**
 * The rule `../src/reticle`'s `GRENADE_METER_CENTRE_OWNER` carries, read off its source: importing the module here would
 * load the page's modules (Vite's `import.meta.env` among them) into the runner.
 */
const GRENADE_METER_CENTRE_OWNER = ((): string => {
  const src = readFileSync(fileURLToPath(new URL('../src/reticle.ts', import.meta.url)), 'utf-8');
  const m = /export const GRENADE_METER_CENTRE_OWNER: GrenadeMeterCentreRule = '((?:[^'\\]|\\.)*)';/.exec(src);
  // A tree from before the ruling (the BEFORE run's base) has no such constant: its meter is the original's.
  if (!m) return 'the last firearm frame\'s';
  return m[1]!.replace(/\\'/g, '\'');
})();

/**
 * OT.R124 (the owner's ruling, 2026-11-13T05:59Z; V21.R16, H451): the grenade's throw meter no longer held at the
 * firearm's knock at the swap -- it inherits the knock live and runs to rest (`GRENADE_METER_CENTRE_OWNER`, the live
 * centre; the spec follows whichever rule the constant carries). The owner asked for the player's own sequence reproduced before and after as the
 * proof: an M82A1A fired unscoped in third person, the grenade taken 0.35 s after, held 2.6 s, the rifle back; then
 * again with the grenade taken 0.97 s after (his clip: the meter 34.8 and 11.2 of the 448-frame's pixels above its rest,
 * unmoving). The page's own reticle state is logged on every animation frame -- the drawn set (4: the meter), the
 * rect's centre row in the drawing buffer's pixels, the firearm's knock (`accuracy().offset`) -- and the run is
 * recorded at 1280 x 720 for the clip's own tracker. Written before any assertion, so a run of the base (the original's
 * centre) leaves its table too. The files go to `socomlegacy/test-fixtures/screens/grenade-meter/` (git-ignored); the
 * scored tables go to the plan's Log, never the recording's frames into the tree.
 */

const OUT = fileURLToPath(new URL('../../../test-fixtures/screens/grenade-meter', import.meta.url));
const SPAWN_A: [number, number, number] = [796, 100, 614];
/** The M82A1A (101), the Mark 23 (15), the M67 (121), the HE (126), none (255): the developer's `&kit=`. */
const KIT = '101,15,121,126,255';
/** The player's two gaps between the shot and the grenade, seconds (his clip, seat 8a's frame track). */
const GAPS = [0.35, 0.97] as const;

test.use({ viewport: { width: 1280, height: 720 }, video: { mode: 'on', size: { width: 1280, height: 720 } } });

interface Row {
  leg: number; ms: number; set: number; centreY: number | null; height: number; knockY: number; phase: string; took: string;
  /** The reticle's own aim point (buffer px, its row) and offset (PS2 px, y) this frame: what the rule lays the meter from. */
  aimY: number; offY: number;
  /** The rounds fired so far (`fire().shots`) and the magazine's rounds: each leg proves its shot left. */
  shots: number; rounds: number;
}

const settle = (page: Page, frames = 2): Promise<void> => page.evaluate((n) => new Promise<void>((done) => {
  let left = n;
  const step = (): void => { if (--left <= 0) done(); else requestAnimationFrame(step); };
  requestAnimationFrame(step);
}), frames);

/**
 * One leg in the page, timed there: the trigger held until a round leaves (the rifle may be raising first: from lowered,
 * `fire.ts` refuses a round until the raise is done, `RAISE_REFUSAL_FRAMES` -- the first runs' 50 ms tap let go before it
 * and leg 1 never fired), or 1.5 s at most; then the grenade taken `gap` seconds after THE SHOT, held `hold` seconds, the
 * rifle back, `tail` seconds more. Every animation frame's reticle logged once, `ms` from the shot (0 before it: the
 * `shots` column tells the rest and the raise's frames from the shot's).
 */
const leg = (page: Page, n: number, gap: number, hold = 2.6, tail = 1.5): Promise<Row[]> => page.evaluate(
  ([n, gap, hold, tail]) => new Promise<Row[]>((done) => {
    const v = window.__viewer;
    const rows: Row[] = [];
    const pressed = performance.now();
    let t0: number | null = null;                              // the shot: the first frame its round is counted
    const before = v.fire().shots;
    const end = (gap + hold + tail) * 1000;
    let took = '';                                             // each take's answer, logged (a refused swap says so)
    const log = (): void => {
      const now = performance.now();
      const r = v.reticle();
      const centreY = r.rect ? r.rect.y + r.rect.height / 2 : null;
      const shots = v.fire().shots;
      if (t0 === null && shots > before) {
        t0 = now;
        v.trigger(false);
        setTimeout(() => { took = `M67:${v.selectItem('M67')}`; }, gap * 1000);
        setTimeout(() => { took = `rifle:${v.selectItem('rifle')}`; }, (gap + hold) * 1000);
      }
      rows.push({
        leg: n, ms: now - (t0 ?? now), set: r.type, centreY, height: r.frame.height, knockY: v.accuracy().offset[1], phase: v.grenade().phase, took,
        aimY: (r.aim?.[1] ?? Number.NaN) * r.frame.height, offY: r.offset[1], shots, rounds: v.fire().magazine.rounds,
      });
      if (t0 === null && now - pressed > 1500) { v.trigger(false); done(rows); return; }   // no round: the leg is VOID
      if (t0 !== null && now - t0 >= end) { done(rows); return; }
      requestAnimationFrame(log);
    };
    log();                                                     // the leg's rest: the reticle before the press (it starts the frame loop)
    v.trigger(true);
  }),
  [n, gap, hold, tail] as const,
);

test('V21.R16: the player\'s sequence -- the meter by the owner\'s rule after a no-scope and a grenade at 0.35 s and 0.97 s', async ({ page }) => {
  test.setTimeout(240_000);
  mkdirSync(OUT, { recursive: true });
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(`${TEST_ROOM}?mode=play&fly&devmode&kit=${KIT}`);
  const status = page.locator('#status');
  await expect(status).toContainText('triangles');
  await page.locator('#maps').selectOption('RUN/MP2.ZDB');
  await expect(status).toContainText('FROSTFIRE (MP2)');
  await expect(status).toContainText('triangles');
  await holdReleased(page);
  // The resolution pinned for the whole recording (a test-only choice of an existing setting): the PS2 presentation, under
  // which the page's adaptive ratio never steps (`src/main.ts`, `adaptiveRatio.frame(..., presentation === 'ps2' ...)`).
  // Without it the box's software renderer steps the drawing buffer down mid-run (405, 377, 350, 323, 297: seat 8a's read
  // of the base run), which the first runs of this spec mistook for the aim point climbing. Each row still carries its own
  // buffer height and is normalised by it.
  await page.locator('#ps2look').evaluate((el) => {
    const box = el as HTMLInputElement;
    if (!box.checked) { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  expect(await page.evaluate(() => window.__viewer.setMode('walk'))).toBe(true);
  await page.evaluate(([x, y, z]) => window.__viewer.setCamera({ x, y: y + 15.4, z, yaw: 240, pitch: 0 }), SPAWN_A);
  await page.keyboard.press('Backquote');                    // the panel away: the picture is the evidence
  await settle(page, 60);
  expect((await page.evaluate(() => window.__viewer.loadout())).records[0]).toBe('M82A1A');
  expect(await page.evaluate(() => window.__viewer.zoom().state)).toBe(0);   // third person, unscoped
  const warm = await page.evaluate(() => window.__viewer.fire().shots);   // rounds before the legs
  const rows: Row[] = [];
  for (const [i, gap] of GAPS.entries()) {
    rows.push(...await leg(page, i + 1, gap));
    await page.waitForTimeout(3500);                         // the knock home and the bolt worked before the next shot
  }
  /** A row's 448-frame pixels per buffer pixel: its own height, the buffer's size that frame. */
  const px = (r: Row): number => 448 / r.height;
  const csv = ['leg,ms,set,height,centre_y_px,centre_off_mid_448,aim_off_mid_448,above_aim_448,offset_y_448,knock_y_448,shots,rounds,phase,took',
    ...rows.map((r) => [
      r.leg, r.ms.toFixed(1), r.set, r.height, r.centreY?.toFixed(2) ?? '',
      r.centreY === null ? '' : ((r.height / 2 - r.centreY) * px(r)).toFixed(2),
      ((r.height / 2 - r.aimY) * px(r)).toFixed(2),
      r.centreY === null ? '' : ((r.aimY - r.centreY) * px(r)).toFixed(2),
      (-r.offY).toFixed(2), (-r.knockY).toFixed(2), r.shots, r.rounds, r.phase, r.took,
    ].join(','))].join('\n');
  writeFileSync(join(OUT, 'frames.csv'), csv + '\n');
  writeFileSync(join(OUT, 'rest.json'), JSON.stringify({ warmShots: warm, kit: KIT, gaps: GAPS, rule: GRENADE_METER_CENTRE_OWNER, presentation: 'ps2' }) + '\n');
  // The recording, kept whatever the assertions say (a run of the base fails them by design).
  const video = page.video();
  await page.close();
  if (video) await video.saveAs(join(OUT, 'run.webm'));

  // Each row in 448-frame pixels by its own buffer height. The aim point stays at the frame's middle (pitch 0, no look
  // input: seat 8a's read). The live centre (OT.R124, "inherit"): on every set-4 frame the meter is this frame's aim point
  // plus this frame's knock -- the rifle's own formula -- so it starts where the rifle's reticle stood, runs down with
  // the knock, and the rifle takes over where it stood. The screen's centre: the last firearm frame's aim point, no knock.
  // The original: the last firearm frame's centre, held.
  for (const r of rows) expect(Math.abs(r.aimY / r.height - 0.5), `leg ${r.leg} at ${r.ms.toFixed(0)} ms: the aim point at the middle`).toBeLessThan(0.002);
  for (const n of [1, 2]) {
    const legRows = rows.filter((r) => r.leg === n && r.centreY !== null);
    // The leg proves its shot: a round left between the row before the trigger and the swap, with its knock -- or VOID.
    const swapAt = GAPS[n - 1]! * 1000;
    const fired = legRows.some((r) => r.shots > legRows[0]!.shots);
    expect(fired, `leg ${n} VOID: its shot did not register (shots ${legRows[0]!.shots} before the trigger)`).toBe(true);
    const meter = legRows.filter((r) => r.set === 4);
    expect(meter.length, `leg ${n}: the meter was drawn`).toBeGreaterThan(30);
    const first = meter[0]!, last = meter[meter.length - 1]!;
    const before = legRows[legRows.indexOf(first) - 1]!, after = legRows[legRows.indexOf(last) + 1];
    // the player's sequence reproduced: the knock still up when the grenade is taken (his clip: 35.8 and 12.1)
    expect(-first.offY, `leg ${n}: the knock up at the swap`).toBeGreaterThan(2);
    const climbed = legRows.filter((r) => r.set !== 4 && r.ms >= 0 && r.ms < swapAt && (r.aimY - r.centreY!) * px(r) > 5);
    expect(climbed.length, `leg ${n}: the rifle's reticle climbed above its aim point after the shot`).toBeGreaterThan(0);
    for (const r of meter) {
      const want = GRENADE_METER_CENTRE_OWNER === 'the live centre' ? r.aimY + r.offY * r.height / 448
        : GRENADE_METER_CENTRE_OWNER === 'the screen\'s centre' ? before.aimY : before.centreY!;
      // the original's held centre is the render's `laid`, which the frame log can trail by one tick of the return
      const tolerance = GRENADE_METER_CENTRE_OWNER === 'the last firearm frame\'s' ? 2 : 0.5;
      expect(Math.abs(want - r.centreY!) * px(r), `leg ${n} at ${r.ms.toFixed(0)} ms: the meter where the rule lays it`).toBeLessThan(tolerance);
    }
    if (GRENADE_METER_CENTRE_OWNER === 'the live centre') {
      // The knock's part of the centre (centre - aim point) carries across the swap and back; at most one frame of the
      // return (about 61 a second, the runs' own, over the frame's length) apart.
      const knockPart = (r: Row): number => (r.centreY! - r.aimY) * px(r);
      // the bound: the M67's return (about 61 a second, the runs' own) over that frame's length, plus a pixel
      const step = (x: Row, y: Row): number => 61 * Math.abs(y.ms - x.ms) / 1000 + 1;
      expect(Math.abs(knockPart(first) - knockPart(before)), `leg ${n}: the meter inherits the reticle's knock at the swap`).toBeLessThan(step(before, first));
      if (after && after.set !== 4 && after.centreY !== null) {
        expect(Math.abs(knockPart(after) - knockPart(last)), `leg ${n}: the rifle's reticle takes over where the meter stood`).toBeLessThan(step(last, after));
      }
      // the knock up at the swap: the meter is not held there, it comes down with the knock
      expect(Math.abs(last.offY), `leg ${n}: the knock run out under the grenade`).toBeLessThan(0.5);
    }
    const took = new Set(rows.filter((r) => r.leg === n).map((r) => r.took));
    expect([...took].filter((t) => t !== ''), `leg ${n}: the M67 taken, then the rifle`).toEqual(['M67:true', 'rifle:true']);
  }
  expect(problems).toEqual([]);
});
