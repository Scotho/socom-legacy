import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
// `src/hook.ts` is types only; its `declare global` is what makes `window.__viewer` exist inside `page.evaluate`.
import type {} from '../src/hook';
import { TEST_ROOM } from './urls';
import { holdReleased } from './loadHold';

/**
 * The water's look as the port draws it (an investigation's instrument, not a gate: the water-look report, seat b6,
 * 2026-11-07). The free camera at fixed poses over The Ruins' (MP12) and Night Stalker's (MP7) water -- open water,
 * a shoreline, close up, across at a distance, below the surface -- in the PS2 picture and the Modern one, and the
 * shoreline again with the engine order on. Opt-in: WATER_SHOTS names the folder the pictures go to; without it the
 * spec is skipped. No game behaviour is changed; the canvas alone is captured (no disc texture is written).
 *
 * DF-11 (the Desert Glory / Fish Hook release, 2026-11-08) adds Fish Hook (MP71): its water from spawn A and the boats,
 * research 330 §8's six poses, spawn A wading, and a pair of frames of the sky's `whispy_scroller` a measured interval
 * apart (`08-sky-a` / `08-sky-b`: the evidence `SKY_SCROLL_TICKS_READING` owes, research 82 §8). **The MP71 poses are
 * listed, not run where they were written** (2026-11-08, the owner's browser view held that host): they run on a box
 * with the disc (`RUN/MP71.ZDB`; no fixture until DF-2), `WATER_MAPS=MP71`, the pictures to
 * `agent-mail/evidence/dg-fishhook-readiness-2026-11-08/looks/`. The eight wading bodies of LATER 725 need a match's
 * bodies, which this free-camera spec has none of: DF-12's round harness owns that shot.
 */
const OUT = process.env.WATER_SHOTS ?? '';
const VIEWS = (process.env.WATER_VIEWS ?? 'ps2,modern').split(',') as ('ps2' | 'modern')[];
const ONLY = process.env.WATER_MAPS?.split(',') ?? null;
/**
 * DF-11 (the review's F4): a map is shot only where the served tree holds its archive (`public/maps/RUN/<map>.ZDB`, as
 * the other disc-gated specs ask) -- MP71 has no fixture until DF-2, so a fixtures-only box skips it, said, and is not red.
 */
const served = (map: string): boolean => existsSync(fileURLToPath(new URL(`../../../public/maps/RUN/${map}.ZDB`, import.meta.url)));
/** A suffix for the pictures' names (a local what-if build is told apart from the port as it is). */
const TAG = process.env.WATER_TAG ? `-${process.env.WATER_TAG}` : '';

/** A pose that looks from `eye` at `at` (yaw 0 faces -z, 90 faces -x; pitch up positive), in degrees. */
const aim = (eye: [number, number, number], at: [number, number, number]) => {
  const dx = at[0] - eye[0], dy = at[1] - eye[1], dz = at[2] - eye[2];
  const yaw = (Math.atan2(-dx, -dz) * 180) / Math.PI;
  const pitch = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
  return { x: eye[0], y: eye[1], z: eye[2], yaw, pitch };
};

type Pose = ReturnType<typeof aim>;
/** A pose at `eye` with a yaw and a pitch in degrees, as research 330 §8's table gives them. */
const at = (eye: [number, number, number], yaw: number, pitch: number): Pose => ({ x: eye[0], y: eye[1], z: eye[2], yaw, pitch });
/** Fish Hook's SEAL spawn A (research 75's table: x 1199, z 1450): the feet wade at 46.96 under the water at 50 (research 210, `placedChargesReal.test.ts`); the eye 15.4 over them (`mover.ts` `EYE_HEIGHT`). */
const MP71_WADE: [number, number, number] = [1199, 46.96 + 15.4, 1450];
/** MP71's sky pose: up at the cloud plane (`cloud_whispy.tif` at y 280, research 330 §8) and the scrolling `whispy_scroller` (`mp71_sky`). */
const MP71_SKY = at([1600, 120, 1400], 0, 45);
/**
 * The poses, from the disc's water draws (the scratch survey of 2026-11-07): MP12's `water.tif` sectors at y 55 over
 * (1170..1530, 1170..1530) and y 43 over (900..1800, 1800..2018), the scrolling channel between them at x 1315..1385;
 * MP7's `gen_waterdirty.tif` pool at y 47 over (1440..1610, 1632..1763) and the wet rocks (`mp7_rock.tif`, env entry 1)
 * at (2042..2279, 60..153, 1553..1781).
 */
const POSES: Record<string, Record<string, Pose>> = {
  MP12: {
    '01-open': aim([1200, 68, 1200], [1200, 55, 1480]),
    '02-shore': aim([920, 58, 1890], [1250, 43, 1900]),
    '03-close': aim([1200, 64, 1250], [1203, 55, 1272]),
    '04-far': aim([1100, 120, 2060], [1100, 43, 1800]),
    '05-channel': aim([1350, 70, 1860], [1350, 48, 1700]),
    '06-splash': aim([1200, 66, 1280], [1200, 55, 1340]),
    '07-under': aim([1200, 50, 1300], [1200, 50, 1480]),
  },
  MP7: {
    '01-open': aim([1525, 62, 1740], [1530, 47, 1700]),
    '02-shore': aim([1525, 80, 1900], [1525, 47, 1700]),
    '03-close': aim([1525, 58, 1700], [1527, 47, 1690]),
    '04-far': aim([1525, 140, 1950], [1525, 47, 1700]),
    '05-waterfall': aim([1700, 70, 1700], [1525, 47, 1700]),
    '06-splash': aim([1525, 60, 1760], [1525, 47, 1700]),
    '07-under': aim([1525, 44, 1700], [1600, 44, 1755]),
  },
  // DF-11: Fish Hook. The water is 15 `water.tif` sectors and 12 `water_washup.tif` at y 50-54 inside x 540..2700,
  // z 720..2340 (research 330 §7, `MP71_WATER_EXTENT_READING`); the boats off the disc's scene graph (`MP71_GEO.ZED`):
  // `boats_oyster_beach` (1245, 55, 1313) and (1269, 55, 1382), the rockers `boat_rocker1` (1209, 51, 1636) and
  // `boat_rocker2` (1092, 51, 1530), `boats1` (1840, 56, 1700) and (1903, 56, 1695).
  MP71: {
    '01-open': aim([1199, 70, 1450], [1257, 55, 1340]),                  // from spawn A over the water to the oyster-beach boats
    '02-shore': at([1725, 79.1, 1650], 150, -12),                        // research 330 §8: a shoreline
    '03-close': aim([1199, 58, 1470], [1201, 50, 1492]),
    '04-far': at([1975, 82, 1650], 180, -12),                            // research 330 §8: the wash-ups
    '05-boats': aim([1150, 70, 1420], [1150, 51, 1600]),                 // the two rocking boats
    '06-splash': aim([1199, 62, 1430], [1199, 50, 1470]),
    '07-under': aim([1199, 48, 1450], [1199, 48, 1600]),
    '08-sky-a': MP71_SKY,
    '08-sky-b': MP71_SKY,
    '09-wading': aim(MP71_WADE, [1199, 55, 1300]),                       // spawn A at the eye of a body wading 3.04 deep
    '10-ridge-passage': at([2020, 204.7, 580], 30, 0),                   // research 330 §8's six, with 02 and 04
    '11-spawn-b-rise': at([2010, 196, 730], 125, 0),
    '12-ridge-top': at([2140, 284, 300], 135, -10),
    '13-seal-beach': at([1880, 108.7, 1640], 6.7, 1.1),
  },
};
/** Where `06-splash` plays `seal_fall_in_water` (on the water, in view), frozen with the effects for the picture. */
const SPLASH: Record<string, [number, number, number]> = { MP12: [1200, 55, 1330], MP7: [1525, 47, 1705], MP71: [1199, 50, 1470] };

/** WATER_SURVEY: overviews from above, to place the poses. */
const SURVEY: Record<string, Record<string, Pose>> = {
  MP12: {
    'c1': aim([1500, 68, 1200], [1500, 55, 1480]),
    'c2': aim([1200, 68, 1200], [1200, 55, 1480]),
    'c3': aim([1500, 68, 1200], [1200, 55, 1200]),
    'c4': aim([920, 58, 1890], [1250, 43, 1900]),
    'c5': aim([1780, 58, 1890], [1480, 43, 1900]),
    'c6': aim([1100, 120, 2060], [1100, 43, 1800]),
  },
  MP7: {
    'c1': aim([1525, 80, 1900], [1525, 47, 1700]),
    'c2': aim([1700, 70, 1700], [1525, 47, 1700]),
    'c3': aim([1525, 62, 1740], [1530, 47, 1700]),
    'c4': aim([1525, 140, 1950], [1525, 47, 1700]),
  },
};

const settle = (page: Page): Promise<void> => page.evaluate(
  () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
);

test.skip(!OUT, 'WATER_SHOTS not set');
test.use({ viewport: { width: 1280, height: 900 } });

for (const map of Object.keys(POSES).filter((m) => ONLY === null || ONLY.includes(m))) {
  for (const view of VIEWS) {
    test(`${map} ${view}: the water at its poses`, async ({ page }) => {
      test.skip(!served(map), `needs public/maps/RUN/${map}.ZDB (extracted from SOCOM_DISC)`);
      test.setTimeout(300_000);
      mkdirSync(OUT, { recursive: true });
      const notes: Record<string, unknown> = { map, view };
      const problems: string[] = [];
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
      await page.goto(`${TEST_ROOM}?map=${map}&mode=play&fly&devmode&nomatch&view=${view}`);
      const status = page.locator('#status');
      await expect(status).toContainText(`(${map})`, { timeout: 120_000 });
      await expect(status).toContainText('triangles', { timeout: 120_000 });
      await holdReleased(page);
      await expect.poll(() => page.evaluate(() => window.__viewer.effects().loaded), { timeout: 120_000 }).toBe(true);
      notes.renderer = await page.evaluate(() => {
        const c = document.createElement('canvas').getContext('webgl2');
        const d = c?.getExtension('WEBGL_debug_renderer_info');
        return d && c ? String(c.getParameter(d.UNMASKED_RENDERER_WEBGL)) : 'unknown';
      });
      notes.status = await status.textContent();
      notes.toggles = await page.evaluate(() => window.__viewer.toggles());
      expect(await page.evaluate(() => window.__viewer.setMode('fly'))).toBe(true);
      // The canvas alone: every page element but the canvas hidden (the panel, the bar, the playtest figures).
      await page.addStyleTag({ content: '* { visibility: hidden !important; } canvas#view { visibility: visible !important; }' });
      const canvas = page.locator('#view');
      const shot = async (name: string, pose: Pose): Promise<void> => {
        await page.evaluate((p) => window.__viewer.setCamera(p), pose);
        await page.waitForTimeout(1200);
        if (name === '06-splash') {
          notes.splash = await page.evaluate((at) => window.__viewer.playEffect('seal_fall_in_water', at), SPLASH[map]!);
          await page.waitForTimeout(350);
          await page.evaluate(() => window.__viewer.pauseEffects(true));
          await page.waitForTimeout(200);
        }
        await settle(page);
        const effects = await page.evaluate(() => window.__viewer.effects());
        notes[name] = { pose: await page.evaluate(() => window.__viewer.pose()), ambient: effects.ambient, ...(map === 'MP71' ? { effects, at: await page.evaluate(() => performance.now()) } : {}) };
        await canvas.screenshot({ path: `${OUT}/${map}-${view}${TAG}-${name}.png` });
        if (name === '06-splash') await page.evaluate(() => window.__viewer.pauseEffects(false));   // the ambient effects (the rain, a waterfall's mist) run on
      };
      if (!process.env.WATER_SURVEY) for (const [name, pose] of Object.entries(POSES[map]!)) await shot(name, pose);
      // DF-11: the sky pair's interval on the page's clock, the wisp's offset to be measured against 0.08 widths a second.
      if (map === 'MP71' && !process.env.WATER_SURVEY) {
        const t = (n: string): number => (notes[n] as { at: number }).at;
        notes.skyIntervalMs = t('08-sky-b') - t('08-sky-a');
      }
      if (process.env.WATER_SURVEY) {
        for (const [name, pose] of Object.entries(SURVEY[map] ?? {})) await shot(name, pose);
        writeFileSync(`${OUT}/${map}-${view}-notes.json`, JSON.stringify(notes, null, 1));
        return;
      }
      // The shoreline and the open water again with the engine order on: the reflection's place against the alpha pass.
      await page.evaluate(() => {
        const box = document.getElementById('engineorder') as HTMLInputElement;
        box.checked = true;
        box.dispatchEvent(new Event('change', { bubbles: true }));
      });
      notes.engineOrder = await page.evaluate(() => window.__viewer.toggles().engineorder);
      await shot('02-shore-engineorder', POSES[map]!['02-shore']!);
      await shot('01-open-engineorder', POSES[map]!['01-open']!);
      notes.problems = problems.slice(0, 20);
      writeFileSync(`${OUT}/${map}-${view}${TAG}-notes.json`, JSON.stringify(notes, null, 1));
    });
  }
}
