import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { uiGpuGlLeg, uiGpuGlRefusal, uiGpuLaunchOptions } from './uiGpuGl';
import { UI_GPU_SEAM_LISTS, uiGpuSeamsScales, type UiGpuHarness, type UiGpuHarnessSeams } from './uiGpuHarness';
import { UI_GPU_PARITY_BLENDS, diffImage, encodePng } from './uiGpuParityRecord';

/**
 * GM-31 leg 2 (the GPU menus plan, row GM-31: GM-27's owed real-GPU seam count; GM-15d review F2, the FMA risk): GM-15b's
 * two seam lists (`../test/uiRasterCases.ts` `seamSquares`: 24 squares, each split along its anti-diagonal into two
 * triangles sharing that edge, an additive texel of `UI_SEAM_TEXEL` over a clear of `UI_SEAM_CLEAR`; the dyadic depths,
 * and invW 0.7 throughout) drawn **on the GPU the browser gives**, through the models pass (`GpuUiPresenter` on the
 * harness's opaque backend, `./uiGpuHarness.ts` `seamRun`), read back, and every seam pixel counted: drawn once, twice (a
 * double add) or not at all (a hole), against the software's frame of the same list (`rasterizeUiDrawList`). Until now
 * these lists were drawn only in Node and on the fake GL (`test/uiGpuSeamCount.test.ts`, `test/uiGpuWebgl2.test.ts`).
 * Product track, a test instrument: our GPU drawer against our own software drawer; nothing of the game changes. Needs no
 * game data.
 *
 * Why on a real GPU: the top-left rule gives each shared-edge pixel to one triangle (M2, `UI_MODEL_EDGE_RULE_READING`,
 * GM-15d), which holds in IEEE arithmetic; a driver that contracts the edge functions into FMAs can double-write or drop a
 * seam pixel, and GLSL ES 3.00 has no `precise` to forbid it. Only a real driver can show it.
 *
 * Per list, scale (`S2U_UI_GPU_SEAMS_SCALES`, default 1,2,4; an unknown value refused) and blend (`exact` and `ff`, GM.R6), one test asserts:
 * - **the path**: the plan is one the base draws (verdict `gpu`, every step in `UI_GPU_BASE_STEPS`) and the frame came
 *   from the GPU (`path: 'gpu'`), not L1;
 * - **every seam pixel drawn once** on the GPU (twice 0, hole 0, other 0), and on the software reference (the instrument's
 *   own check; `test/uiGpuSeamClassify.test.ts` holds it in Node);
 * and records the counts (once / twice / hole / other / equal to the software), the whole frame's differing bytes against
 * the software (B, recorded, not asserted), and the first non-once pixels. `UI_GPU_SEAM_CLASS_TOLERANCE` (2 per channel)
 * keeps a B rounding of a once pixel in its class; the classes are 60 apart.
 *
 * Written to `S2U_UI_GPU_SEAMS_OUT` (default `<OS temp>/s2u-ui-gpu-seams`; never inside `socomlegacy/test-results`, which
 * Playwright empties at each run's start): `renderer.json`, one `seams.jsonl` line per run, and for a run with a seam
 * pixel not once its `<run>.diff.png`. The renderer is `./uiGpuGl.ts`'s (SwiftShader by default; `S2U_UI_GPU_GL=native`
 * for the host's GL or GPU, refused when it still reports SwiftShader). From `socomlegacy/`:
 * `E2E_PORT=5310 npx playwright test uiGpuSeams.spec.ts`. The page is `/?uiGpuHarness`, served by a routed document as
 * `./uiGpuParity.spec.ts` serves it (that spec untouched).
 */

const WEB = fileURLToPath(new URL('../../..', import.meta.url));
const LEG = uiGpuGlLeg();
const OUT = process.env['S2U_UI_GPU_SEAMS_OUT'] || join(tmpdir(), 's2u-ui-gpu-seams');
{
  const fold = (p: string): string => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p));
  const rel = relative(fold(join(WEB, 'test-results')), fold(OUT));
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) throw Error(`S2U_UI_GPU_SEAMS_OUT: ${OUT} is inside ${join(WEB, 'test-results')}, which Playwright empties at each run's start`);
}
const SCALES = uiGpuSeamsScales(process.env['S2U_UI_GPU_SEAMS_SCALES']);   // an unknown value refused by name (review F3)

test.use({ launchOptions: uiGpuLaunchOptions() });
test.setTimeout(300_000);

const HARNESS_PAGE = '<!doctype html><html><head><meta charset="utf-8"><title>uiGpuSeams</title></head>'
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

type Renderer = ReturnType<UiGpuHarness['renderer']>;
const rendererOf = (page: Page): Promise<Renderer> =>
  page.evaluate(() => (window as unknown as Record<string, UiGpuHarness>)['__uiGpuHarness']!.renderer());

const seamRun = (page: Page, list: string, scale: number, blend: string): Promise<UiGpuHarnessSeams> =>
  page.evaluate(([l, s, b]) => {
    const h = (window as unknown as Record<string, UiGpuHarness>)['__uiGpuHarness']!;
    return h.seamRun(l as 'dyadic' | '0.7', s as 1 | 2 | 4, b as 'exact' | 'ff');
  }, [list, scale, blend] as const);

const counts = (c: UiGpuHarnessSeams['gpu']): string => `${c.total} seam pixels: once ${c.once}, twice ${c.twice}, hole ${c.hole}, other ${c.other}${c.equalToReference === null ? '' : `, equal to the software ${c.equalToReference}`}`;

test.describe('GM-31: the model seams on the GPU, every seam pixel drawn once', () => {
  test('the renderer (recorded; a native leg still on SwiftShader is refused)', async ({ page }, info) => {
    await openHarness(page);
    const r = await rendererOf(page);
    info.annotations.push({ type: 'renderer', description: JSON.stringify({ ...r, requested: LEG.requested }) });
    expect(r.version ?? '').toMatch(/WebGL 2/);
    expect(uiGpuGlRefusal(LEG, r.unmasked ?? r.renderer), 'the native GL leg runs on the host\'s GL').toBeNull();
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, 'renderer.json'), JSON.stringify({ when: new Date().toISOString(), requested: LEG.requested, args: LEG.args, ...r, scales: SCALES }, null, 2));
  });

  for (const list of UI_GPU_SEAM_LISTS) for (const scale of SCALES) for (const blend of UI_GPU_PARITY_BLENDS) {
    test(`seams ${list} @${scale}x/${blend}`, async ({ page }, info) => {
      await openHarness(page);
      const r = await rendererOf(page);
      expect(uiGpuGlRefusal(LEG, r.unmasked ?? r.renderer), 'the native GL leg runs on the host\'s GL').toBeNull();
      const got = await seamRun(page, list, scale, blend);
      const run = `seams-${list}@${scale}x/${blend}`;
      info.annotations.push({ type: 'gpu', description: `${run}: ${counts(got.gpu)}; path ${got.path}${got.why.length ? ` (${got.why.join('; ')})` : ''}; frame ${got.frame.differ} bytes differ from the software` });
      mkdirSync(OUT, { recursive: true });
      appendFileSync(join(OUT, 'seams.jsonl'), `${JSON.stringify({ run, renderer: r.unmasked ?? r.renderer, list, scale, blend, path: got.path, why: got.why, expectGpu: got.expectGpu, refusal: got.refusal, presents: got.presents, squares: got.squares, gpu: got.gpu, software: got.software, frameDiffer: got.frame.differ, frameFirst: got.frame.first })}\n`);
      if (got.frames) {
        const bytes = (b64: string): Uint8Array => new Uint8Array(Buffer.from(b64, 'base64'));
        const w = got.frame.width, h = got.frame.height;
        writeFileSync(join(OUT, `${run.replace(/[\\/]/g, '_')}.diff.png`), encodePng(w, h, diffImage(bytes(got.frames.gpu), bytes(got.frames.cpu), w, h)));
      }
      expect(got.expectGpu, `${run}: the plan is one the base draws (verdict gpu, every step a base step)`).toBe(true);
      expect(got.refusal, `${run}: the backend refuses nothing in the plan`).toBeNull();
      expect(got.path, `${run}: the frame came from the GPU, not L1 (${got.why.join('; ')})`).toBe('gpu');
      expect(got.software, `${run}: the software reference draws every seam pixel once (${counts(got.software)})`).toMatchObject({ once: got.software.total, twice: 0, hole: 0, other: 0 });
      expect(got.gpu.total, `${run}: the seam pixels walked`).toBe(got.software.total);
      expect(got.gpu, `${run}: every seam pixel drawn once on the GPU (${counts(got.gpu)}; first not once: ${JSON.stringify(got.gpu.first)})`).toMatchObject({ once: got.gpu.total, twice: 0, hole: 0, other: 0 });
    });
  }
});
