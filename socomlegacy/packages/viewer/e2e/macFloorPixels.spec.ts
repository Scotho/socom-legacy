import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { expect, test, type Page } from '@playwright/test';
// `src/hook.ts` is types only; its `declare global` is what makes `window.__viewer` exist inside `page.evaluate`.
import type {} from '../src/hook';
import { TEST_ROOM } from './urls';
import { holdReleased } from './loadHold';

/**
 * MAC-FLOOR (INTAKE I-3, tier 1 row 18; B-64): the picture before and after the fix, per map and backend, pixel for pixel.
 * An instrument, not a gate: a browser adaptation with no original, which changes nothing the game does; the canvas
 * alone is captured, to a folder off the repository. It runs on a REAL GPU (a Shadow PC; SwiftShader proves nothing here).
 *
 * What it can show: that the fix (every vertex program's clip-space position invariant, `../src/invariantPosition`)
 * changes nothing, or next to nothing, on a GPU that was already right, and that WebGPU and WebGL2 still compile and draw
 * with it (a shader the browser refused would leave a black canvas and a page error). What it cannot show: the cure on an
 * Apple GPU -- that is the tester's grid detector on his M1.
 *
 * Two modes, by environment:
 * - CAPTURE: `MACFLOOR_SHOTS=<folder>` (and `MACFLOOR_LABEL=before|after`) draws each map in the normal picture at 120
 *   poses -- the opening stand (spawn A, `stats().stand`), a full turn every 6 degrees at 30 degrees down and again at 5
 *   degrees down (the tester's two rings) -- and saves `<label>/<map>-<backend>-<nnn>.png` with `notes.json` (the
 *   backend drawn, the GPU, the page's errors, owed empty). `MACFLOOR_MAPS` (default MP71,MP2,MP72,MP6: Fish Hook,
 *   Frostfire, Crossroads, Desert Glory) and `MACFLOOR_BACKENDS` (default webgpu,webgl2) narrow it; `MACFLOOR_ANTIALIAS`
 *   (off|on) is handed to the room's `?antialias=` and `MACFLOOR_COPLANAR_OFFSET=on` to its `?coplanaroffset=on` (on the
 *   fix's build only: the base has neither switch).
 * - COMPARE: `MACFLOOR_BEFORE=<folder>` and `MACFLOOR_AFTER=<folder>` (two CAPTURE label folders) compares every pair of
 *   same-named frames: the largest channel difference (LSB), the pixels that differ at all and by more than 2 LSB, per
 *   map and backend, into `MACFLOOR_REPORT` (default `<after>/../compare.json`). No browser. `MACFLOOR_PRUNE=1` then
 *   deletes from BOTH folders every pair whose largest difference is 2 LSB or less, keeping only the frames that differ
 *   (PC 1's first run kept 120 full frames a cell: 3.3 GB, over the 300 MB record bar).
 * - A CONTROL is owed beside every compare (PC 1's, 2026-11-21): capture the BEFORE build twice (`before`, `before2`) and
 *   compare them the same way; a row whose control differs is not repeatable (something in the frame moves with time --
 *   Fish Hook's floor bands), and its before/after cannot be put on the change. No clock is frozen here (none is exposed
 *   to the address); a fixed clock would make those rows usable.
 */
const SHOTS = process.env.MACFLOOR_SHOTS ?? '';
const LABEL = process.env.MACFLOOR_LABEL ?? 'after';
const MAPS = (process.env.MACFLOOR_MAPS ?? 'MP71,MP2,MP72,MP6').split(',').filter(Boolean);
const BACKENDS = (process.env.MACFLOOR_BACKENDS ?? 'webgpu,webgl2').split(',').filter(Boolean) as ('webgpu' | 'webgl2')[];
const ANTIALIAS = process.env.MACFLOOR_ANTIALIAS ?? '';
const COPLANAR = process.env.MACFLOOR_COPLANAR_OFFSET === 'on';
const BEFORE = process.env.MACFLOOR_BEFORE ?? '';
const AFTER = process.env.MACFLOOR_AFTER ?? '';
const PRUNE = process.env.MACFLOOR_PRUNE === '1';

const settle = (page: Page): Promise<void> => page.evaluate(
  () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => done())))),
);

/** The 120 poses about the stand: 60 yaws at 30 degrees down, 60 at 5 degrees down. */
const ring = (at: [number, number, number]): { x: number; y: number; z: number; yaw: number; pitch: number }[] =>
  [-30, -5].flatMap((pitch) => Array.from({ length: 60 }, (_, i) => ({ x: at[0], y: at[1], z: at[2], yaw: i * 6, pitch })));

test.describe('MAC-FLOOR capture', () => {
  test.skip(!SHOTS, 'MACFLOOR_SHOTS not set');
  test.use({ viewport: { width: 1600, height: 896 }, deviceScaleFactor: 1 });
  for (const map of MAPS) for (const backend of BACKENDS) {
    test(`${map} ${backend}: 120 poses, ${LABEL}`, async ({ page }) => {
      test.setTimeout(600_000);
      const out = join(SHOTS, LABEL);
      mkdirSync(out, { recursive: true });
      const problems: string[] = [];
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error' || /WGSL|GLSL|shader|invariant/i.test(m.text())) problems.push(`console.${m.type()}: ${m.text()}`); });
      const aa = (ANTIALIAS ? `&antialias=${ANTIALIAS}` : '') + (COPLANAR ? '&coplanaroffset=on' : '');
      await page.goto(`${TEST_ROOM}?map=${map}&mode=play&fly&devmode&nomatch&renderer=${backend}${aa}`);
      const status = page.locator('#status');
      await expect(status).toContainText(`(${map})`, { timeout: 180_000 });
      await expect(status).toContainText('triangles', { timeout: 180_000 });
      await holdReleased(page);
      expect(await page.evaluate(() => window.__viewer.setMode('fly'))).toBe(true);
      await page.addStyleTag({ content: '* { visibility: hidden !important; } canvas#view { visibility: visible !important; }' });
      const stats = await page.evaluate(() => { const s = window.__viewer.stats(); return { backend: s.backend, stand: s.stand, detailDraws: s.detailDraws, triangles: s.triangles }; });
      const video = await page.evaluate(() => window.__viewer.video()).catch(() => null);
      const at = stats.stand?.position ?? null;
      expect(at, 'the map has an opening stand').not.toBeNull();
      const canvas = page.locator('#view');
      const poses = ring(at!);
      for (let i = 0; i < poses.length; i++) {
        await page.evaluate((p) => window.__viewer.setCamera(p), poses[i]!);
        await settle(page);
        await canvas.screenshot({ path: join(out, `${map}-${backend}-${String(i).padStart(3, '0')}.png`) });
      }
      writeFileSync(join(out, `${map}-${backend}-notes.json`), JSON.stringify({ map, backend, label: LABEL, antialias: ANTIALIAS || 'default', coplanarOffset: COPLANAR, stats, video, poses, problems: problems.slice(0, 40) }, null, 1));
      expect(stats.backend, 'the backend asked for is the one drawn').toBe(backend);
      expect(problems).toEqual([]);
    });
  }
});

test.describe('MAC-FLOOR compare', () => {
  test.skip(!BEFORE || !AFTER, 'MACFLOOR_BEFORE / MACFLOOR_AFTER not set');
  test('every frame of the after folder against the same frame before', async () => {
    test.setTimeout(900_000);
    const names = readdirSync(AFTER).filter((n) => n.endsWith('.png') && existsSync(join(BEFORE, n))).sort();
    expect(names.length, 'frames in both folders').toBeGreaterThan(0);
    type Row = { frames: number; maxLsb: number; pixels: number; differ: number; over2: number; worst: string | null };
    const rows: Record<string, Row> = {};
    for (const n of names) {
      const key = n.replace(/-\d{3}\.png$/, '');
      const [a, b] = await Promise.all([BEFORE, AFTER].map((d) => sharp(join(d, n)).removeAlpha().raw().toBuffer({ resolveWithObject: true })));
      const row = (rows[key] ??= { frames: 0, maxLsb: 0, pixels: 0, differ: 0, over2: 0, worst: null });
      row.frames++;
      if (a!.info.width !== b!.info.width || a!.info.height !== b!.info.height) { row.worst = `${n}: size differs`; continue; }
      let frameMax = 0;
      for (let p = 0; p < a!.data.length; p += 3) {
        const d = Math.max(Math.abs(a!.data[p]! - b!.data[p]!), Math.abs(a!.data[p + 1]! - b!.data[p + 1]!), Math.abs(a!.data[p + 2]! - b!.data[p + 2]!));
        row.pixels++;
        if (d > 0) row.differ++;
        if (d > 2) row.over2++;
        if (d > frameMax) frameMax = d;
      }
      if (frameMax > row.maxLsb) { row.maxLsb = frameMax; row.worst = n; }
      if (PRUNE && frameMax <= 2) { rmSync(join(BEFORE, n)); rmSync(join(AFTER, n)); }
    }
    const report = process.env.MACFLOOR_REPORT ?? join(AFTER, '..', 'compare.json');
    writeFileSync(report, JSON.stringify({ before: BEFORE, after: AFTER, rows }, null, 1));
    for (const [key, r] of Object.entries(rows)) {
      console.log(`MACFLOOR COMPARE ${key}: ${r.frames} frames; max ${r.maxLsb} LSB; ${r.differ} of ${r.pixels} pixels differ (${(100 * r.differ / Math.max(1, r.pixels)).toFixed(4)} %), ${r.over2} by more than 2 LSB; worst ${r.worst ?? '-'}`);
    }
  });
});
