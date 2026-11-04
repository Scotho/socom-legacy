import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { TEST_ROOM_PAST_SHEET } from './urls';

/**
 * PLAT-19c in a real page (web research 120 §11): the opener's three movies -- SONY448, INTRO_2, MENULOOP (research 121
 * §10) -- decoded in the page's worker from the player's own disc image (`src/movieWorker.ts`, read by range from a
 * `File`), played by PLAT-21's background player one picture a tick of PLAT-12's 29.97 Hz clock on the display's
 * animation frames, each picture put on a 640x448 canvas (`src/movieRealtime.ts`), to the player's event 3. Per movie
 * the budget is printed as one JSON line (`PLAT19C {...}`): start-up, the decoder's cost per picture in the worker, the
 * queue, late ticks, dropped or repeated pictures, the presented rate; and once the decoder's size and its cold start.
 *
 * Held on every run: every picture of each movie presented once and in order (310, 3836, 3732; research 121 §11), none
 * dropped or repeated, the worker's own end. Late ticks (a tick of the 29.97 Hz clock with no picture: the movie slows
 * by one tick, nothing is lost -- the original's outcome for a slow decode, `MOVIE_PICTURE_LATE_READING`) are counted
 * and held to a stated tolerance, not to 0: one host stall of about 40 ms in the worker's decode or read misses a tick
 * (research 120 §11, the review's third run), so 0 is a property of the host's load, not of the code. The tolerance is
 * `LATE_TICKS_PER_1000` (rounded up per movie). The block's acceptance -- INTRO_2 sustained, 0 late ticks, on the
 * owner's machine -- is the run with `SUSTAINED=1`, which holds every movie to 0.
 *
 * Dev host only: skips without `SOCOM_ISO` and the built wasm (`packages/fmv/wasm/build.sh`). Heavy (a browser, about
 * four and a half minutes of movie): the host's lock rules apply. `MOVIES=INTRO_2` limits it.
 */
const ISO = process.env.SOCOM_ISO ?? '';
const WASM = fileURLToPath(new URL('../../fmv/wasm/out/libmpeg2.wasm', import.meta.url));
const ALL: [string, number][] = [
  ['RUN/MOVIES/COMMON/SONY448.PSS', 310], ['RUN/MOVIES/INTRO_2.PSS', 3836], ['RUN/MOVIES/COMMON/MENULOOP.PSS', 3732],
];
/**
 * The late ticks a dev-host run tolerates, per 1000 pictures presented (rounded up per movie: SONY448 1, INTRO_2 and
 * MENULOOP 4). A test tolerance, not a value of the game's: research 120 §11 gives the measured distribution. With
 * `SUSTAINED=1` (the block's acceptance, the owner's machine) it is 0.
 */
const LATE_TICKS_PER_1000 = process.env.SUSTAINED === '1' ? 0 : 1;
const MOVIES = process.env.MOVIES ? ALL.filter(([m]) => process.env.MOVIES!.split(',').some((k) => m.includes(k))) : ALL;

test.skip(!ISO || !existsSync(ISO) || !existsSync(WASM), 'SOCOM_ISO or the built wasm absent');

test('the opener\'s movies play in real time in the page: every picture once, in order, at the 29.97 Hz tick', async ({ page }) => {
  test.setTimeout(900_000);
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(TEST_ROOM_PAST_SHEET);                                // the disc page: no served tree, no map, no match
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'movie-iso';
    document.body.append(input);
    const canvas = document.createElement('canvas');
    canvas.id = 'movie-canvas';
    canvas.width = 640;
    canvas.height = 448;
    canvas.style.cssText = 'position:fixed;inset:0;z-index:2000';
    document.body.append(canvas);
  });
  await page.locator('#movie-iso').setInputFiles(ISO);

  // The decoder's size (the build's output, research 98 §7.10's way: raw and gzip -9) and, in the page, its fetch and compile.
  const bytes = readFileSync(WASM);
  const size = { raw: statSync(WASM).size, gzip9: gzipSync(bytes, { level: 9 }).length };
  const compile = await page.evaluate(async () => {
    const url = '/fmv/libmpeg2.wasm';                  // the dev server's base is '/'
    const t0 = performance.now();
    const b = await (await fetch(url, { cache: 'no-store' })).arrayBuffer();
    const t1 = performance.now();
    await WebAssembly.compile(b);
    return { fetchMs: t1 - t0, compileMs: performance.now() - t1, bytes: b.byteLength };
  });
  console.log(`PLAT19C ${JSON.stringify({ decoder: { ...size, ...compile } })}`);

  let first = true;
  for (const [path, count] of MOVIES) {
    const run = await page.evaluate(async ({ moviePath, cold }) => {
      const tex = await import(/* @vite-ignore */ '/src/movieTexture.ts' as string) as typeof import('../src/movieTexture');
      const rt = await import(/* @vite-ignore */ '/src/movieRealtime.ts' as string) as typeof import('../src/movieRealtime');
      const w = window as unknown as { __movies?: ReturnType<typeof tex.startMovieWorker> };
      if (cold || !w.__movies) w.__movies = tex.startMovieWorker();     // the first movie pays for the worker and the wasm
      const { client, wasm } = w.__movies;
      const file = (document.getElementById('movie-iso') as HTMLInputElement).files![0]!;
      const ctx = (document.getElementById('movie-canvas') as HTMLCanvasElement).getContext('2d')!;
      const r = await rt.playMovieInRealTime({
        path: moviePath,
        open: (p) => client.open(p, { kind: 'iso', file }, wasm),
        present: rt.canvasPresenter(ctx),
        now: () => performance.now(),
        requestFrame: (cb) => { requestAnimationFrame(cb); },
      });
      return r;
    }, { moviePath: path, cold: first });
    first = false;
    console.log(`PLAT19C ${JSON.stringify(run)}`);
    expect(run.budget.end?.error ?? null).toBeNull();
    expect(run.budget.pictures).toBe(count);
    expect(run.budget.dropped).toBe(0);
    expect(run.budget.repeated).toBe(0);
    expect(run.budget.lateTicks, `${path}: ticks of the 29.97 Hz clock with no picture`)
      .toBeLessThanOrEqual(Math.ceil((count * LATE_TICKS_PER_1000) / 1000));
  }
  expect(problems).toEqual([]);
});
