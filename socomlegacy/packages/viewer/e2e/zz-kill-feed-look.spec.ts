import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { OpenedContexts } from './openedContexts';

/**
 * WM-DATA-FEED's capture for the owner (look 3B2, INTAKE 47: "3B - but make sure the text is visually centered in the
 * bar, and pick less washed out colors that more closely resemble what we use for seal/terrorsit elsewhere. less
 * pastelle."). A test instrument, no check of the game (a BROWSER ADAPTATION's picture, product track): on request only
 * (`S2U_KILL_FEED=1`, with game data). Kill lines built by the production builder (`../src/killFeed` `killFeedLine`) are
 * posted through the test room's own HUD message window (`window.__s2uKillFeedPreview`, a development build's `?devmode`
 * only, seated by `../src/hud` `Hud`'s constructor) over a bright map (MP6, Desert Glory) and a dark one (MP7, Night
 * Stalker), at Modern and at PS2. Each frame is saved whole and as a crop of the window, with `kill-feed.json`: the
 * window's background before the lines, and per marked line the orange bar's rows as found in the crop (its top, its
 * bottom) beside the white text's ink rows inside the bar's height, for the "visually centred" read.
 *   S2U_KILL_FEED=1 [S2U_KILL_FEED_OUT=<dir>] npx playwright test packages/viewer/e2e/zz-kill-feed-look.spec.ts
 */
test.skip(!process.env['S2U_KILL_FEED'], 'the kill feed capture runs on request: S2U_KILL_FEED=1');

const opened = new OpenedContexts();
test.afterEach(() => opened.closeAll());

type Side = 'seal' | 'terrorist' | null;
type Kill = { how: string; killer: { name: string; side: Side } | null; victim: { name: string; side: Side }; weapon: string | null; marked?: boolean };
const SEAL = (name: string) => ({ name, side: 'seal' as const });
const TERR = (name: string) => ({ name, side: 'terrorist' as const });

/** The staged feeds: a mixed feed with the local player's kill marked, and a long marked line that wraps. */
const FEEDS: Record<string, { title: string; kills: Kill[] }> = {
  mixed: {
    title: 'a mixed feed: others\' kills, the local player\'s kill and suicide marked, a fall, a seat that left (colour 0)',
    kills: [
      { how: 'weapon', killer: SEAL('Viper'), victim: TERR('Cobra'), weapon: 'M4A1 SD' },
      { how: 'weapon', killer: TERR('Raptor'), victim: SEAL('Echo'), weapon: 'AK-47' },
      { how: 'weapon', killer: SEAL('Tester'), victim: TERR('Mamba'), weapon: 'HK5SD', marked: true },
      { how: 'fall', killer: null, victim: TERR('Krait'), weapon: null },
      { how: 'suicide', killer: SEAL('Tester'), victim: SEAL('Tester'), weapon: 'M67', marked: true },
    ],
  },
  wrapped: {
    title: 'a long marked line that wraps (the mark on every part), a teamkill, a kept thrower (colour 0)',
    kills: [
      { how: 'weapon', killer: SEAL('AVeryLongCallsignIndeed'), victim: TERR('AnotherQuiteLongCallsign'), weapon: 'M4A1 SD WITH A SUPPRESSOR AND SCOPE', marked: true },
      { how: 'teamkill', killer: TERR('Raptor'), victim: TERR('Asp'), weapon: 'M60E3' },
      { how: 'orphan', killer: { name: 'Gone', side: null }, victim: SEAL('Echo'), weapon: 'M67' },
    ],
  },
};
const FRAMES = [
  { map: 'MP6', label: 'bright (Desert Glory)' },
  { map: 'MP7', label: 'dark (Night Stalker)' },
] as const;
const VIEWS = ['modern', 'ps2'] as const;
const BAND = { x: 192, y: 0, width: 896, height: 230 };   // the message window's region at this viewport, both views

type Measure = { background: number[]; bars: { x: number; top: number; bottom: number; inkTop: number | null; inkBottom: number | null }[] };

/** Reads a PNG in the page (which can decode it): the band's mean colour, and each orange bar with the ink beside it. */
async function measure(page: Page, png: Buffer, bg: number[] | null): Promise<Measure> {
  return page.evaluate(async ({ b64, bg }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const at = (x: number, y: number): number[] => { const i = (y * c.width + x) * 4; return [d[i]!, d[i + 1]!, d[i + 2]!]; };
    let R = 0, G = 0, B = 0;
    for (let i = 0; i < d.length; i += 4) { R += d[i]!; G += d[i + 1]!; B += d[i + 2]!; }
    const n = d.length / 4, background = [R / n, G / n, B / n];
    if (!bg) return { background, bars: [] };
    // The bar: the window's orange (128, 64, 32 GS: about 255, 128, 64 on screen) at full alpha -- red high, green about
    // half, blue low. A column's runs of such pixels at least 6 rows long are bars.
    const orange = (p: number[]): boolean => p[0]! > 200 && p[1]! > 90 && p[1]! < 170 && p[2]! < 110;
    const bars: Measure['bars'] = [];
    const seen = new Set<string>();
    for (let x = 0; x < c.width; x++) {
      let run = -1;
      for (let y = 0; y <= c.height; y++) {
        const on = y < c.height && orange(at(x, y));
        if (on && run < 0) run = y;
        if (!on && run >= 0) {
          const key = `${run}-${y - 1}`;
          if (y - run >= 6 && !seen.has(key) && orange(at(x + 1, run))) {
            seen.add(key);
            // The text's ink in the rows of the bar, right of it: near-white pixels (the colour 0 words).
            let inkTop: number | null = null, inkBottom: number | null = null;
            for (let yy = Math.max(0, run - 4); yy < Math.min(c.height, y + 4); yy++) {
              for (let xx = x + 4; xx < Math.min(c.width, x + 400); xx++) {
                const p = at(xx, yy);
                if (p[0]! > 200 && p[1]! > 200 && p[2]! > 200) { inkTop ??= yy; inkBottom = yy; break; }
              }
            }
            bars.push({ x, top: run, bottom: y - 1, inkTop, inkBottom });
          }
          run = -1;
        }
      }
    }
    return { background, bars };
  }, { b64: png.toString('base64'), bg });
}

test('kill feed look 3B2: the side colours and the orange mark over a bright and a dark frame, Modern and PS2', async ({ browser }, info) => {
  test.setTimeout(30 * 60_000);
  const out = process.env['S2U_KILL_FEED_OUT'] ?? info.outputPath('kill-feed');
  mkdirSync(out, { recursive: true });
  const context = opened.add(await browser.newContext({ viewport: { width: 1280, height: 896 } }));
  const page = await context.newPage();
  const record: Record<string, unknown>[] = [];
  for (const f of FRAMES) for (const view of VIEWS) {
    await page.goto(`/testroom?map=${f.map}&mode=play&devmode&noarmory&view=${view}`);
    await page.waitForFunction(() => !!(window as any).__viewer?.feet(), undefined, { timeout: 240_000 });
    await expect(page.locator('#original-loading')).toBeHidden({ timeout: 120_000 });
    // Only the game's canvas: the test room's own panels hidden (the HUD is drawn on the canvas).
    await page.addStyleTag({ content: 'body > *:not(#view) { visibility: hidden !important; }' });
    await page.waitForTimeout(1500);
    const before = await measure(page, await page.screenshot({ clip: BAND }), null);
    for (const [key, feed] of Object.entries(FEEDS)) {
      expect(await page.evaluate((kills) => (window as any).__s2uKillFeedPreview?.(kills, true) ?? false, feed.kills)).toBe(true);
      await page.waitForTimeout(600);
      const name = `${key}-${f.map}-${view}`;
      await page.screenshot({ path: join(out, `${name}.png`) });
      const crop = await page.screenshot({ path: join(out, `${name}-crop.png`), clip: BAND });
      const m = await measure(page, crop, before.background);
      record.push({
        feed: key, title: feed.title, map: f.map, frame: f.label, view, file: `${name}.png`, crop: `${name}-crop.png`,
        background: before.background.map((v) => Math.round(v)), kills: feed.kills,
        bars: m.bars.map((b) => ({ ...b, marginAbove: b.inkTop === null ? null : b.inkTop - b.top, marginBelow: b.inkBottom === null ? null : b.bottom - b.inkBottom })),
      });
    }
  }
  writeFileSync(join(out, 'kill-feed.json'), JSON.stringify(record, null, 2));
});
