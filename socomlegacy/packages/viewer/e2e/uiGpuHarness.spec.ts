import { expect, test, type Page } from '@playwright/test';
import type { UiRasterMode, UiRasterScale } from '../test/uiRasterCases';
import { uiGpuGlLeg, uiGpuGlRefusal, uiGpuLaunchOptions } from './uiGpuGl';
import type { UiGpuHarness, UiGpuHarnessCompare } from './uiGpuHarness';

/**
 * GM-11a-1 (the GPU menus plan, the row's "harness smoke"; research 380 P15, "Frame conventions"): the WebGL2 base on
 * the GPU the browser gives, against the software in the same page, byte for byte. A rendered browser run; written on
 * the owner's host and **run on the box** (no browser runs there on that host; GM-11b's seat runs it beside the parity
 * spec). Needs no game data: every frame is GM-03's made-up cases or seeded bytes.
 *
 * The page is `/?uiGpuHarness` on the run's Vite server -- this lane's port is 5310 (the plan, "Host rules"): from
 * `socomlegacy/`, `E2E_PORT=5310 npx playwright test uiGpuHarness.spec.ts`. The spec serves that address itself (a routed
 * document holding only `./uiGpuHarness.ts`'s module), so none of the app boots; the hook is `window.__uiGpuHarness`.
 *
 * What it holds (the row's acceptance: "case 9 E; sw-frame upload round-trips bytes"):
 * - **the clear** (P15, class E): case 9's clear drawn on the GPU (`path: 'gpu'`) at 1/2/4, opaque and transparent,
 *   0 bytes differ; and a sweep of every byte value on every channel (`clearColor(k / 255)` back to `k`);
 * - **the software-frame upload**: seeded frames of every byte value, uploaded and read back, 0 bytes differ, at 1/2/4,
 *   both modes; case 9 whole through the presenter (L1 until GM-11a-2 draws quads: `path: 'software'`, named), E;
 * - **the present**: the canvas's top row is the frame's row 0 (RGB; the opaque canvas has no alpha).
 * - GM-11a-3: **case 8 on the GPU** (the movie picture, P17, E), a movie of eight pictures through the presenter (each
 *   frame E; one upload per picture, in its first render), and GPU time per frame recorded where the timer query
 *   exists (an annotation; "unmeasured" otherwise).
 *   GM-11a-3 also corrected the stale "case 9 L1 until GM-11a-2" expectation: case 9 is drawn on the GPU since GM-11a-2.
 * The renderer strings are recorded on the run (annotations); SwiftShader is the default config's renderer, and its
 * result is not a claim about a player's GPU (GM-27's). GM-11b: the renderer by env (`./uiGpuGl.ts`: `S2U_UI_GPU_GL=native`
 * for ANGLE on the host's own GL or GPU past the blocklist: Mesa llvmpipe under xvfb on a Linux box without a GPU, that
 * GPU on a GPU host), a native leg still on SwiftShader refused (the refusal catches SwiftShader only, LATER 721).
 */

test.use({ launchOptions: uiGpuLaunchOptions() });

const SCALES: readonly UiRasterScale[] = [1, 2, 4];
const MODES: readonly UiRasterMode[] = ['opaque', 'transparent'];
const HARNESS_PAGE = '<!doctype html><html><head><meta charset="utf-8"><title>uiGpuHarness</title></head>'
  + '<body style="margin:0;background:#000"><script type="module">'
  + 'import { installUiGpuHarness } from "/e2e/uiGpuHarness.ts";'
  + 'try { installUiGpuHarness(); } catch (e) { window.__uiGpuHarnessError = String(e && e.stack || e); }'
  + '</script></body></html>';

async function openHarness(page: Page): Promise<void> {
  await page.route((url) => url.pathname === '/' && url.searchParams.has('uiGpuHarness'), (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HARNESS_PAGE }));
  await page.goto('/?uiGpuHarness');
  await page.waitForFunction(() => {
    const w = window as unknown as Record<string, unknown>;
    return (w['__uiGpuHarness'] as UiGpuHarness | undefined)?.ready === true || typeof w['__uiGpuHarnessError'] === 'string';
  }, null, { timeout: 60_000 });
  const error = await page.evaluate(() => (window as unknown as Record<string, unknown>)['__uiGpuHarnessError'] as string | undefined);
  expect(error, 'the harness installed (a WebGL2 context)').toBeUndefined();
}

type Call = { [K in keyof UiGpuHarness]: UiGpuHarness[K] extends (...a: infer A) => unknown ? [K, A] : never }[keyof UiGpuHarness];
const call = <T>(page: Page, [name, args]: Call): Promise<T> =>
  page.evaluate(([n, a]) => {
    const h = (window as unknown as Record<string, Record<string, (...x: unknown[]) => unknown>>)['__uiGpuHarness']!;
    return h[n as string]!(...(a as unknown[]));
  }, [name, args] as const) as Promise<T>;

const exact = (r: UiGpuHarnessCompare): void => {
  expect(r.bytes, `${r.name}: bytes compared`).toBeGreaterThan(0);
  expect(r.differ, `${r.name}: ${JSON.stringify(r.first)}${r.why.length ? ` (${r.why.join('; ')})` : ''}`).toBe(0);
};

test.describe('GM-11a-1: the WebGL2 base on a real GPU (harness smoke)', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;
  test.beforeAll(async ({ browser }, info) => {
    page = await browser.newPage({ baseURL: info.project.use.baseURL });
    await openHarness(page);
  });
  test.afterAll(async () => { await page?.close(); });

  test('records the renderer', async ({}, info) => {
    const r = await call<ReturnType<UiGpuHarness['renderer']>>(page, ['renderer', []]);
    const leg = uiGpuGlLeg();
    info.annotations.push({ type: 'renderer', description: JSON.stringify({ ...r, requested: leg.requested }) });
    expect(r.version ?? '').toMatch(/WebGL 2/);
    expect(uiGpuGlRefusal(leg, r.unmasked ?? r.renderer), 'the native GL leg runs on the host\'s GL').toBeNull();
  });

  test('the clear: every byte value on every channel comes back (clearColor(k / 255))', async () => {
    for (const mode of MODES) exact(await call<UiGpuHarnessCompare>(page, ['clearSweep', [mode]]));
  });

  test('case 9\'s clear on the GPU equals the software at 1/2/4, opaque and transparent (P15, E)', async () => {
    for (const scale of SCALES) for (const mode of MODES) {
      const r = await call<UiGpuHarnessCompare>(page, ['case9Clear', [scale, mode]]);
      expect(r.path, r.name).toBe('gpu');
      exact(r);
    }
  });

  test('the software-frame upload round-trips every byte at 1/2/4, both modes', async () => {
    for (const scale of SCALES) for (const mode of MODES) exact(await call<UiGpuHarnessCompare>(page, ['roundTrip', [scale, mode, 1000 + scale]]));
  });

  test('case 9 whole through the presenter equals the software (on the GPU since GM-11a-2 draws quads; P15, E)', async () => {
    for (const scale of SCALES) for (const mode of MODES) {
      const r = await call<UiGpuHarnessCompare>(page, ['presentCase', [9, scale, mode]]);
      expect(r.path, r.name).toBe('gpu');
      exact(r);
    }
  });

  // GM-11a-3 (the row's acceptance: "case 8 on the GPU"; research 380 P17, class E).
  test('case 8, the movie picture, on the GPU equals the software at 1/2/4, opaque and transparent (P17, E)', async () => {
    for (const scale of SCALES) for (const mode of MODES) {
      const r = await call<UiGpuHarnessCompare>(page, ['presentCase', [8, scale, mode]]);
      expect(r.path, r.name).toBe('gpu');
      exact(r);
    }
  });

  test('a movie on the GPU: every frame the software\'s, each picture uploaded once, in its first render (at most one a render)', async () => {
    for (const scale of SCALES) {
      const r = await call<UiGpuHarnessCompare & { uploadsPerRender: number[] }>(page, ['movieRun', [scale, 8]]);
      expect(r.path, r.name).toBe('gpu');
      exact(r);
      expect(r.uploadsPerRender, r.name).toEqual(Array.from({ length: 16 }, (_, i) => (i % 2 === 0 ? 1 : 0)));
    }
  });

  test('GPU time per frame where the browser has EXT_disjoint_timer_query_webgl2 (recorded, not a target; else "unmeasured")', async ({}, info) => {
    const r = await call<Awaited<ReturnType<UiGpuHarness['gpuTime']>>>(page, ['gpuTime', [6, 2, 30]]);
    info.annotations.push({ type: 'gpu-time', description: JSON.stringify(r) });
    if (!r.available) { expect(r.ms).toEqual([]); return; }
    expect(r.ms.length + (r.stats?.disjoint ?? 0) + (r.stats?.skipped ?? 0)).toBeGreaterThan(0);
    for (const ms of r.ms) expect(ms).toBeGreaterThanOrEqual(0);
  });

  test('the present blit puts the frame\'s row 0 at the canvas\'s top, 1:1', async () => {
    for (const scale of SCALES) exact(await call<UiGpuHarnessCompare>(page, ['presentOrientation', [scale, 2000 + scale]]));
  });
});
