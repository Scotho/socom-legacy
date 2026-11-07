import { mkdirSync, writeFileSync } from 'node:fs';
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
 */
const OUT = process.env.WATER_SHOTS ?? '';
const VIEWS = (process.env.WATER_VIEWS ?? 'ps2,modern').split(',') as ('ps2' | 'modern')[];
const ONLY = process.env.WATER_MAPS?.split(',') ?? null;
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
};
/** Where `06-splash` plays `seal_fall_in_water` (on the water, in view), frozen with the effects for the picture. */
const SPLASH: Record<string, [number, number, number]> = { MP12: [1200, 55, 1330], MP7: [1525, 47, 1705] };

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
        notes[name] = { pose: await page.evaluate(() => window.__viewer.pose()), ambient: (await page.evaluate(() => window.__viewer.effects())).ambient };
        await canvas.screenshot({ path: `${OUT}/${map}-${view}${TAG}-${name}.png` });
        if (name === '06-splash') await page.evaluate(() => window.__viewer.pauseEffects(false));   // the ambient effects (the rain, a waterfall's mist) run on
      };
      if (!process.env.WATER_SURVEY) for (const [name, pose] of Object.entries(POSES[map]!)) await shot(name, pose);
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
