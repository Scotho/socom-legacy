import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { FRONT_END } from './urls';

/**
 * MOVIE-WIRE (2026-10-03): the page's front end plays the opener's movies from the disc, not the black stand-in. At
 * `/?devmode` (the front end's page, OT.R19) the opener (BOOT-02, BOOT-04; research 139) reaches `dlgIntroCinematic` (SONY448) and
 * `dlgSecondCinematic` (INTRO_2), and at `menuflow=dlgMenu.rdr` the menu stands over MENULOOP: each picture is PLAT-19c's
 * worker's, decoded from the served tree, drawn by PLAT-14's drawer onto the front end's 640 x 448 canvas, with PLAT-20's
 * sound read beside it (`../src/frontEndMovies.ts`). A rendered browser run: the canvas's pixels are sampled (mean luma
 * and the change between two samples a second apart), the movies' meters are read off the page's hook
 * (`window.__frontEnd.movies`) and printed as `MOVIEWIRE {...}` lines. Nothing of the original is measured here.
 *
 * Dev host only: skips without the served tree (`public/maps`, with its `RUN/MOVIES`) or the built decoder
 * (`packages/fmv/wasm/build.sh`). Heavy (a browser, about a minute): the host's lock rules apply.
 */
const MAPS = fileURLToPath(new URL('../../../public/maps/', import.meta.url));
const WASM = fileURLToPath(new URL('../../fmv/wasm/out/libmpeg2.wasm', import.meta.url));
const HAVE = existsSync(`${MAPS}index.json`) && existsSync(`${MAPS}RUN/MOVIES/INTRO_2.PSS`) && existsSync(WASM);
test.skip(!HAVE, 'the served tree with its movies, or the built wasm, absent');

interface Sample { t: number; luma: number; lit: number; changed: number | null }

/**
 * The front end's canvas sampled (every 4th pixel): its mean luma (Rec. 601, 0..255), the share of pixels with a luma
 * above 32 (`lit`, %), and the mean change per channel since the last sample.
 */
async function sample(page: Page): Promise<Sample> {
  return page.evaluate(() => {
    const c = document.getElementById('front-end') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const w = window as unknown as { __mwLast?: Uint8ClampedArray };
    const last = w.__mwLast;
    let y = 0, lit = 0, diff = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) {
      const l = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
      y += l;
      if (l > 32) lit++;
      if (last) diff += Math.abs(d[i]! - last[i]!) + Math.abs(d[i + 1]! - last[i + 1]!) + Math.abs(d[i + 2]! - last[i + 2]!);
      n++;
    }
    w.__mwLast = d;
    return { t: performance.now(), luma: y / n, lit: (100 * lit) / n, changed: last ? diff / (3 * n) : null };
  });
}

interface HookView {
  events: { kind: string; file?: string | null; name?: string; t: number }[];
  budgets: { movie: string; pictures: number; lateTicks: number; startupMs: number | null; dropped: number; repeated: number; presentedFps: number | null; end: unknown }[];
  sound: { movie: string; frames: number; startTime: number | null; joinedAt: number | null; mutedSeconds: number; underruns: number; voices: number } | null;
}

/** The hook's events and the movies' meters and sound. */
function hook(page: Page): Promise<HookView> {
  return page.evaluate(() => {
    const h = (window as unknown as { __frontEnd?: {
      events: HookView['events'];
      movies: { pictures: { budgets: { report(): HookView['budgets'][number] }[] }; sound: { stats(): HookView['sound'] } } | null;
    } }).__frontEnd;
    if (!h) return { events: [], budgets: [], sound: null };
    return {
      events: h.events.map((e) => ({ ...e })),
      budgets: h.movies ? h.movies.pictures.budgets.map((b) => b.report()) : [],
      sound: h.movies ? h.movies.sound.stats() : null,
    };
  });
}

/** Samples a second apart while `seconds` run. */
async function samples(page: Page, seconds: number): Promise<Sample[]> {
  const out: Sample[] = [];
  for (let i = 0; i <= seconds; i++) {
    out.push(await sample(page));
    if (i < seconds) await page.waitForTimeout(1000);
  }
  return out;
}
/** `luma/lit%/change` per sample. */
const round = (s: Sample[]): string => s.map((x) => `${x.luma.toFixed(1)}/${x.lit.toFixed(1)}%/${x.changed === null ? '-' : x.changed.toFixed(1)}`).join(' ');

test('the opener: SONY448 then INTRO_2 drawn from the disc on the front end\'s canvas (not black), with their sound read', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const t0 = Date.now();
  await page.goto(`${FRONT_END}?devmode`);
  await expect(page.locator('canvas#front-end')).toHaveCount(1);

  // dlgIntroCinematic: the movie event for SONY448 (research 139 §5: about 5 s in).
  await expect.poll(async () => (await hook(page)).events.some((e) => e.kind === 'movie' && /sony448\.pss$/i.test(e.file ?? '')), { timeout: 60_000 }).toBe(true);
  const sonyAt = (Date.now() - t0) / 1000;
  // From about 9 s the logo's pictures are up: the canvas is not black and changes from one second to the next. The
  // logo is a small bright mark on black (its mean luma stays low, a few units; the stand-in's was 0.0 throughout).
  await page.waitForTimeout(Math.max(0, 9_000 - (Date.now() - t0)));
  const sony = await samples(page, 5);
  const h1 = await hook(page);
  console.log(`MOVIEWIRE ${JSON.stringify({ movie: 'SONY448', eventAtS: sonyAt, sampledFromS: 9, samples: round(sony), budget: h1.budgets[0] ?? null, sound: h1.sound })}`);
  expect(Math.max(...sony.map((s) => s.luma)), 'SONY448: the canvas is black').toBeGreaterThan(1);
  expect(Math.max(...sony.map((s) => s.lit)), 'SONY448: no lit pixel').toBeGreaterThan(0.5);
  expect(Math.max(...sony.slice(1).map((s) => s.changed ?? 0)), 'SONY448: no picture changed in four seconds').toBeGreaterThan(0.5);
  expect(h1.sound?.movie ?? '', 'the sound read for the open movie').toMatch(/sony448\.pss$/i);

  // dlgSecondCinematic: the movie event for INTRO_2 (about 16 s in), then its pictures.
  await expect.poll(async () => (await hook(page)).events.some((e) => e.kind === 'movie' && /intro_2\.pss$/i.test(e.file ?? '')), { timeout: 60_000 }).toBe(true);
  const introAt = (Date.now() - t0) / 1000;
  await page.waitForTimeout(3_000);
  // A key no menu binding reads (Q): a gesture, which the front end's audio unlock counts; the sound joins in sync if it
  // has not run yet (headless Chromium's context may run without one: then the sound started with picture 0).
  await page.keyboard.press('KeyQ');
  const intro = await samples(page, 5);
  const h2 = await hook(page);
  const sonyBudget = h2.budgets.find((b) => /sony448/i.test(b.movie)) ?? null;
  const introBudget = h2.budgets.find((b) => /intro_2/i.test(b.movie)) ?? null;
  console.log(`MOVIEWIRE ${JSON.stringify({ movie: 'INTRO_2', eventAtS: introAt, samples: round(intro), sony: sonyBudget, intro: introBudget, sound: h2.sound })}`);
  expect(Math.max(...intro.map((s) => s.luma)), 'INTRO_2: the canvas is black').toBeGreaterThan(8);
  expect(Math.max(...intro.slice(1).map((s) => s.changed ?? 0)), 'INTRO_2: no picture changed').toBeGreaterThan(0.5);
  expect(sonyBudget?.pictures, 'SONY448: every picture presented').toBe(310);
  expect(sonyBudget?.dropped).toBe(0);
  expect(sonyBudget?.repeated).toBe(0);
  expect(introBudget?.pictures ?? 0).toBeGreaterThan(100);
  expect(h2.sound?.movie ?? '').toMatch(/intro_2\.pss$/i);
  expect(h2.sound?.frames ?? 0, 'INTRO_2\'s track read').toBeGreaterThan(0);
  expect(h2.sound?.startTime ?? null, 'INTRO_2: its sound placed on the output').not.toBeNull();
  expect(errors).toEqual([]);
});

test('menuflow=dlgMenu.rdr: MENULOOP drawn behind the menu (not black), its pictures changing for 20 s, none dropped', async ({ page }) => {
  // The loop's wrap (the last picture -> 0, PLAT-21) is not reached here: the menu's own attract wait (`UiStopAttract`,
  // 120 s, research 138 R138.2) switches to dlgAttractCinematic at about 121 s, 105 pictures before MENULOOP's 3732nd
  // (measured on this spec's first runs, 2026-10-03). The wrap is held by the player's tests and `frontEndMovies.test.ts`.
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${FRONT_END}?devmode&menuflow=dlgMenu.rdr`);
  await expect.poll(async () => (await hook(page)).events.some((e) => e.kind === 'movie' && /menuloop\.pss$/i.test(e.file ?? '')), { timeout: 60_000 }).toBe(true);
  await page.waitForTimeout(3_000);
  const first = await samples(page, 4);
  const h1 = await hook(page);
  await page.waitForTimeout(12_000);
  const later = await samples(page, 4);
  const h2 = await hook(page);
  const b1 = h1.budgets.find((b) => /menuloop/i.test(b.movie)) ?? null;
  const b2 = h2.budgets.find((b) => /menuloop/i.test(b.movie)) ?? null;
  console.log(`MOVIEWIRE ${JSON.stringify({ movie: 'MENULOOP', samples: round(first), later: round(later), budget: b2 })}`);
  for (const [what, s] of [['first', first], ['later', later]] as const) {
    expect(Math.max(...s.map((x) => x.luma)), `MENULOOP (${what}): the canvas is black`).toBeGreaterThan(8);
    expect(Math.min(...s.slice(1).map((x) => x.changed ?? 0)), `MENULOOP (${what}): a second with no picture changed`).toBeGreaterThan(0.2);
  }
  expect(b2!.pictures - b1!.pictures, 'about 16 s of pictures at 29.97 a second').toBeGreaterThan(400);
  expect(b2!.dropped).toBe(0);
  expect(b2!.repeated).toBe(0);
  expect(h2.events.filter((e) => e.kind === 'dialog').map((e) => e.name)).toEqual(['dlgMenu.rdr']);
  expect(errors).toEqual([]);
});
