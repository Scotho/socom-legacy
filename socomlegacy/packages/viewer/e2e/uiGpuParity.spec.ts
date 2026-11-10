import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { UI_RASTER_CASES } from '../test/uiRasterCases';
import { uiGpuGlLeg, uiGpuGlRefusal, uiGpuLaunchOptions } from './uiGpuGl';
import type { UiGpuHarness, UiGpuHarnessL1Run, UiGpuHarnessParity } from './uiGpuHarness';
import {
  boundExcess, coldUploadBoundRun, coldUploadFailures, countDifferingBytes, diffImage, encodeFrameFile, encodePng, frameFileStem, loadingParityCases, loadingParityRuns,
  boundForRenderer, loadingRunBound, parityBound, parityCases, parityEnv, parityRunFailures, parityRuns, provisionalBound, requireParityBound, UI_GPU_LOADING_CASES, wholeFrameExact,
  type UiGpuBStats,
} from './uiGpuParityRecord';

/**
 * GM-11b (the GPU menus plan, row GM-11b: "the parity spec at scale 1"; the parity contract, research 380 §1): every
 * case of GM-03's table (`../test/uiRasterCases.ts`) drawn **in one page** by the f64 CPU executor
 * (`executeFramePlanOnCpu`, proven equal to the software by `test/uiFramePlan.test.ts`) and by the WebGL2 backend
 * through the presenter (`GpuUiPresenter`), and compared byte for byte -- our GPU drawer against our own software
 * drawer, never against the original (that is GM-11c's C rows, by the capture scorers). A rendered browser run:
 * written on the owner's host and **run on a box** (no browser runs on that host). Needs no game data.
 *
 * Per case, at each scale (the row's 1; `S2U_UI_GPU_PARITY_SCALES=1,2,4` for GM-14a's legs), opaque and transparent,
 * under both blend legs (`exact` and `ff`, GM.R6):
 * - **the path**: a plan the base draws (`UI_GPU_BASE_STEPS`) is drawn on the GPU (`path: 'gpu'`) -- red before the
 *   backend draws it (GM-15a: the model cases 2, 3, 16, 17, 18 too); a plan the base still leaves L1 is `path: 'software'`,
 *   its reason annotated;
 * - **E / E\***: the twin's exact class (`executeFramePlanOnTwin`'s mask) has 0 differing bytes, on the shown frame and,
 *   on a transparent frame, before its divide (P14/P22); and on an E or E* case under `exact` the whole frame has 0;
 * - **B**: max |Δ| per channel and the pixels at |Δ| >= 1, 2, 3, recorded beside the twin's, and held field by field
 *   within max(twin, the bound): by default the pinned `GPU_RASTER_TOLERANCE_ADAPTATION` (GM-27, GM.R5; the class by the
 *   renderer, SwiftShader/llvmpipe their own, every other renderer the GPUs'; refused at load past |Δ| 1, or nonzero on an
 *   E/E* run under exact; GM-30's loading leg's B held to the pin's loading lines since the GM-27 re-pin, unjudged only on a run the pin lacks), or an earlier run's `summary.jsonl` when
 *   `S2U_UI_GPU_PARITY_BOUND` names one. The bound must hold a line for every run this run walks (a file must read
 *   whole), or the spec stops before any page opens (GM-11b review F2).
 *
 * Written to the scratch directory `S2U_UI_GPU_PARITY_OUT` (default `<OS temp>/s2u-ui-gpu-parity`, outside the tree;
 * point it at a fresh directory per run; never inside `socomlegacy/test-results`, which Playwright empties at each run's
 * start -- refused, GM-11b review F1): per run `<run>.gpu.rgba` (the frame `readFrame()` gives) and `<run>.cpu.rgba`
 * (the executor's), each a JSON header line (dialog, scale, renderer, ...; `./uiGpuParityRecord.ts`) then RGBA, and
 * `<run>.diff.png`; one `summary.jsonl` line per run; `renderer.json`. Annotated: the renderer string, and each run's
 * differing-byte count.
 *
 * The renderer: SwiftShader by default (the main config's flags); `S2U_UI_GPU_GL=native` for ANGLE on the host's
 * own GL or GPU past the blocklist (Mesa llvmpipe under xvfb on a Linux box without a GPU; that GPU on a GPU host),
 * `S2U_UI_GPU_GL_ARGS` for the box's own flags (`./uiGpuGl.ts`). A native leg that still reports SwiftShader is refused
 * (the refusal catches SwiftShader only, LATER 721). Neither renderer's result is a claim about a player's GPU
 * (GM-27's). From `socomlegacy/`: `E2E_PORT=5310 npx playwright test uiGpuParity.spec.ts`. The page is `/?uiGpuHarness`
 * (`./uiGpuHarness.ts`, served by a routed document as `./uiGpuHarness.spec.ts` serves it); each test uses Playwright's
 * own `page` fixture (closed at the test's end, issue #91).
 *
 * **GM-14a (HD on the GPU at 2 and 4; GM.R9).** At `S2U_UI_GPU_PARITY_SCALES=1,2,4` every run above also runs at 2 and 4.
 * An L1 frame under HD (the cold upload's first frame; since GM-15a no GM-03 case's plan) is the software at **1x** (`UI_GPU_FRAME_FALLBACK_SCALE_ADAPTATION`)
 * shown each pixel s x s: it is held whole against that reference (`l1`, 0 bytes) and its scale (`drawnAt` 1), and the
 * executor's E, E* and B at the shown scale -- which describe a frame the GPU draws -- are recorded for it, not asserted. Two
 * legs of GM-14a's own, at each listed scale above 1: **dev sampling** (`UI_GPU_DEV_SAMPLING_FALLBACK_ADAPTATION`: every
 * case under `nearest` and `sharpen`, L1 at the shown scale, 0 bytes against the software's frame of the same options)
 * and **the cold upload** (every case on a backend whose per-frame upload budget is 1 byte: a frame naming two or more
 * textures is first L1 at 1x, 0 bytes against the 1x reference, then on the GPU once its textures are up).
 *
 * **GM-30 (GM-23's leg, owed before the loading screen's flip).** The loading panel's frame at every listed scale, opaque
 * (the panel's frame is), under both blends: synthetic panel quads -- the background, the picture, the title's glyphs at
 * fractional places, the disc -- through the panel's own `loadingDrawList` and `loadingBitmap` (`./uiGpuHarness.ts`
 * `loadingPanelInputs`; this page loads no map archive), MENUFADER at 0, 32, 77, 128 and 50, quads at alpha 192 and 255
 * (over 128, not clamped: P8). Held to the same contract (`./uiGpuParityRecord.ts` `parityRunFailures`), its runs in the
 * same `summary.jsonl` (so the SwiftShader run measures their bound) and `S2U_UI_GPU_PARITY_CASES` may name them
 * (`loading.<name>`, `UI_GPU_LOADING_CASES`). Written on the owner's host, not run there (the GPU boxes' run).
 *
 * Not here yet: GM-04's corpus (its draw lists are read from the dev disc in Node, `test/uiGpuCorpus.ts`).
 */

const WEB = fileURLToPath(new URL('../../..', import.meta.url));
const ENV = parityEnv(process.env, WEB);
const LEG = uiGpuGlLeg();
const CASES = parityCases(UI_RASTER_CASES, ENV.cases);
const LOADING = loadingParityCases(UI_GPU_LOADING_CASES, ENV.cases);   // GM-30: GM-23's leg
// GM-27 (GM.R5): B is held to the pinned GPU_RASTER_TOLERANCE_ADAPTATION by default -- its class by the run's renderer,
// the software rasterisers' or the GPUs' (`boundForRenderer`; checked at load: |Δ| <= 1 on every key, an E/E* run under
// exact all 0) -- or to the earlier run S2U_UI_GPU_PARITY_BOUND names when one is given.
const RUNS = parityRuns(CASES, ENV.scales);
const EXACT_RUNS = RUNS.filter((r) => wholeFrameExact(CASES.find((c) => c.key === r.key)!, r.blend)).map((r) => r.run);
const BOUNDS = parityBound(ENV.bound, (p) => readFileSync(p, 'utf8'), EXACT_RUNS);
const BOUND_FROM = BOUNDS.from;
// GM-11b review F2: a bound missing a run this run walks is refused before any page opens (GM-30: a file's loading runs
// too). The 4070 run's finding 1: under the pin the loading leg runs, its B held to the pin's line (the re-pin), a run the pin lacks with its B unjudged.
requireParityBound(BOUNDS, RUNS.map((r) => r.run), loadingParityRuns(LOADING, ENV.scales).map((r) => r.run));

test.use({ launchOptions: uiGpuLaunchOptions() });
test.setTimeout(600_000);

const HARNESS_PAGE = '<!doctype html><html><head><meta charset="utf-8"><title>uiGpuParity</title></head>'
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
const named = (r: Renderer): string | null => r.unmasked ?? r.renderer;

const parityRun = (page: Page, key: string, scale: number, mode: string, blend: string): Promise<UiGpuHarnessParity> =>
  page.evaluate(([k, s, m, b]) => {
    const h = (window as unknown as Record<string, UiGpuHarness>)['__uiGpuHarness']!;
    return h.parityRun(k, s as 1 | 2 | 4, m as 'opaque' | 'transparent', b as 'exact' | 'ff');
  }, [key, scale, mode, blend] as const);

const b = (s: { maxAbs: number[]; atLeast: number[] }): UiGpuBStats =>
  ({ maxAbs: [...s.maxAbs] as UiGpuBStats['maxAbs'], atLeast: [...s.atLeast] as UiGpuBStats['atLeast'] });
const bText = (s: UiGpuBStats): string => `max |Δ| ${s.maxAbs.join('/')}, >=1/2/3 ${s.atLeast.join('/')}`;

test.describe('GM-11b: the GPU drawer against the CPU executor, every GM-03 case, in one page', () => {
  test('the renderer (recorded; a native leg still on SwiftShader is refused)', async ({ page }, info) => {
    await openHarness(page);
    const r = await rendererOf(page);
    info.annotations.push({ type: 'renderer', description: JSON.stringify({ ...r, requested: LEG.requested }) });
    expect(r.version ?? '').toMatch(/WebGL 2/);
    expect(uiGpuGlRefusal(LEG, named(r)), 'the native GL leg runs on the host\'s GL').toBeNull();
    mkdirSync(ENV.out, { recursive: true });
    writeFileSync(join(ENV.out, 'renderer.json'), JSON.stringify({ when: new Date().toISOString(), requested: LEG.requested, args: LEG.args, ...r, scales: ENV.scales, bound: BOUND_FROM }, null, 2));
  });

  for (const c of CASES) {
    test(`case ${c.key} (${c.gpu}; ${c.rules.join(', ')}): ${c.name}`, async ({ page }, info) => {
      await openHarness(page);
      const r = await rendererOf(page);
      const renderer = named(r);
      expect(uiGpuGlRefusal(LEG, renderer), 'the native GL leg runs on the host\'s GL').toBeNull();
      mkdirSync(ENV.out, { recursive: true });
      for (const run of parityRuns([c], ENV.scales)) {
        const x = await parityRun(page, run.key, run.scale, run.mode, run.blend);
        const W = 640 * run.scale, H = 448 * run.scale;
        expect.soft([x.width, x.height], `${run.run}: the frame's size`).toEqual([W, H]);
        const gpu = new Uint8Array(Buffer.from(x.frames.gpu, 'base64'));
        const cpu = new Uint8Array(Buffer.from(x.frames.cpu, 'base64'));
        const diff = countDifferingBytes(gpu, cpu, x.width);

        // The files: the frame pair (RGBA + header) and the diff image; one summary line.
        const stem = join(ENV.out, frameFileStem(run.run));
        const header = { dialog: `case ${c.key}`, run: run.run, scale: run.scale, mode: run.mode, blend: run.blend, width: x.width, height: x.height, renderer, path: x.path, drawnAt: x.drawnAt };
        writeFileSync(`${stem}.gpu.rgba`, encodeFrameFile({ ...header, which: 'gpu' }, gpu));
        writeFileSync(`${stem}.cpu.rgba`, encodeFrameFile({ ...header, which: 'cpu' }, cpu));
        writeFileSync(`${stem}.diff.png`, encodePng(x.width, x.height, diffImage(gpu, cpu, x.width, x.height)));
        // GM-14a: an L1 frame drawn below the shown scale (1x under HD, GM.R9) is not the executor's frame at that scale.
        const l1Lower = x.path === 'software' && x.drawnAt !== null && x.drawnAt !== run.scale;
        const bound = provisionalBound(b(x.twin), boundForRenderer(BOUNDS, renderer).get(run.run) ?? null);   // every run has a line (requireParityBound)
        const excess = boundExcess(b(x.gpu), bound);
        appendFileSync(join(ENV.out, 'summary.jsonl'), `${JSON.stringify({
          when: new Date().toISOString(), run: run.run, key: c.key, class: c.gpu, scale: run.scale, mode: run.mode, blend: run.blend,
          renderer, requested: LEG.requested, path: x.path, why: x.why, expectGpu: x.expectGpu, refusal: x.refusal, presents: x.presents,
          drawnAt: x.drawnAt, l1: x.l1 ? { differ: x.l1.differ, first: x.l1.first } : null, l1AtLowerScale: l1Lower,
          bytes: diff.bytes, differ: diff.differ, differPixels: diff.pixels, first: diff.first,
          pre: x.pre ? { differ: x.pre.differ, exactDiffering: x.pre.exactDiffering, first: x.pre.first } : null,
          gpu: x.gpu, twin: x.twin, bound, boundFrom: BOUND_FROM, excess,
        })}\n`);
        info.annotations.push({
          type: 'differing-bytes',
          description: `${run.run} (${x.path}${x.path === 'software' ? ` at ${x.drawnAt}x: ${x.why.join('; ')}; L1 reference ${x.l1?.differ} bytes differ` : ''}): ${diff.differ} of ${diff.bytes} bytes differ`
            + `${x.pre ? `, pre-divide ${x.pre.differ}` : ''}; exact class ${x.gpu.exactDiffering} of ${x.gpu.exactPixels} pixels; GPU B ${bText(b(x.gpu))}; twin B ${bText(b(x.twin))}`,
        });

        // The row's acceptance.
        expect.soft(diff.differ, `${run.run}: the page's count and Node's agree`).toBe(x.shown.differ);
        if (x.expectGpu) expect.soft(x.path, `${run.run}: drawn on the GPU (${x.why.join('; ')})`).toBe('gpu');
        else expect.soft(x.path, `${run.run}: L1, a plan the base does not draw (${x.refusal})`).toBe('software');
        if (x.path === 'software') {
          // GM-14a (GM.R9): L1 is the software's own frame -- at 1x under HD, shown s x s -- byte for byte.
          expect.soft(x.drawnAt, `${run.run}: L1 drawn at UI_GPU_FRAME_FALLBACK_SCALE_ADAPTATION (1x)`).toBe(1);
          expect.soft(x.l1?.differ, `${run.run}: L1 against the software at ${x.drawnAt}x shown s x s (${JSON.stringify(x.l1?.first)})`).toBe(0);
          if (x.pre) expect.soft(x.pre.differ, `${run.run}: L1 before the divide (${JSON.stringify(x.pre.first)})`).toBe(0);
        }
        if (!l1Lower) {
          expect.soft(x.gpu.exactDiffering, `${run.run}: E/E* -- the exact class, 0 differing pixels (${JSON.stringify(diff.first)})`).toBe(0);
          if (x.pre) expect.soft(x.pre.exactDiffering, `${run.run}: E/E* before the divide (P14/P22; ${JSON.stringify(x.pre.first)})`).toBe(0);
          if (wholeFrameExact(c, run.blend)) {
            expect.soft(diff.differ, `${run.run}: a ${c.gpu} case under exact, the whole frame (${JSON.stringify(diff.first)})`).toBe(0);
            if (x.pre) expect.soft(x.pre.differ, `${run.run}: a ${c.gpu} case under exact, before the divide (${JSON.stringify(x.pre.first)})`).toBe(0);
          }
          expect.soft(excess, `${run.run}: B within the bound max(twin, ${BOUND_FROM}) ${bText(bound)}`).toEqual([]);
        }
      }
    });
  }
});

const HD_SCALES = ENV.scales.filter((s) => s > 1);
const l1Text = (r: UiGpuHarnessL1Run): string => `${r.path} at ${r.drawnAt}x (${r.why.join('; ')}): ${r.compare.differ} of ${r.compare.bytes} bytes differ`;

test.describe('GM-14a: L1 under HD (GM.R9), at the listed scales above 1', () => {
  test.skip(HD_SCALES.length === 0, 'no scale above 1 listed (S2U_UI_GPU_PARITY_SCALES=1,2,4 for GM-14a)');

  test('dev sampling (UI_GPU_DEV_SAMPLING_FALLBACK_ADAPTATION): the software at the shown scale, byte for byte', async ({ page }, info) => {
    await openHarness(page);
    mkdirSync(ENV.out, { recursive: true });
    for (const c of CASES) for (const scale of HD_SCALES) for (const sampling of ['nearest', 'sharpen'] as const) {
      const r = await page.evaluate(([k, s, m]) => (window as unknown as Record<string, UiGpuHarness>)['__uiGpuHarness']!.devSamplingRun(k, s as 2 | 4, 'opaque', m as 'nearest' | 'sharpen'), [c.key, scale, sampling] as const);
      const name = `${c.key}@${scale}x dev ${sampling}`;
      info.annotations.push({ type: 'dev-sampling', description: `${name}: ${l1Text(r)}` });
      appendFileSync(join(ENV.out, 'gm14a.jsonl'), `${JSON.stringify({ when: new Date().toISOString(), leg: 'dev-sampling', run: name, path: r.path, drawnAt: r.drawnAt, differ: r.compare.differ, first: r.compare.first })}\n`);
      expect.soft(r.path, `${name}: L1`).toBe('software');
      expect.soft(r.drawnAt, `${name}: at the shown scale`).toBe(scale);
      expect.soft(r.compare.differ, `${name}: the software's frame (${JSON.stringify(r.compare.first)})`).toBe(0);
    }
  });

  test('the cold upload (UI_GPU_FRAME_FALLBACK_SCALE_ADAPTATION): first L1 at 1x shown s x s, then the GPU', async ({ page }, info) => {
    await openHarness(page);
    const BOUND = boundForRenderer(BOUNDS, named(await rendererOf(page)));   // GM-27 review F1: the renderer's class
    mkdirSync(ENV.out, { recursive: true });
    let waited = 0;
    for (const c of CASES) for (const scale of HD_SCALES) for (const mode of ['opaque', 'transparent'] as const) {
      const r = await page.evaluate(([k, s, m]) => (window as unknown as Record<string, UiGpuHarness>)['__uiGpuHarness']!.coldUploadRun(k, s as 2 | 4, m as 'opaque' | 'transparent'), [c.key, scale, mode] as const);
      const name = `${c.key}@${scale}x/${mode} cold`;
      info.annotations.push({ type: 'cold-upload', description: `${name}: ${r.textures} textures; first ${l1Text(r)}; ${r.presents} presents, then ${r.finalPath}` });
      // GM-14a review F2: a GPU-drawn first frame (0 or 1 texture) is held as the main leg holds one (exact class, bound);
      // only an L1 first frame is held to 0 bytes against the 1x software.
      const bound = r.twin ? provisionalBound(b(r.twin), BOUND.get(coldUploadBoundRun(c.key, scale, mode)) ?? null) : null;
      const failures = coldUploadFailures({ path: r.path, why: r.why, drawnAt: r.drawnAt, differ: r.compare.differ, gpu: r.gpu ? { ...b(r.gpu), exactDiffering: r.gpu.exactDiffering } : null, twin: r.twin ? b(r.twin) : null, finalPath: r.finalPath, preExactDiffering: r.preExactDiffering }, bound);
      appendFileSync(join(ENV.out, 'gm14a.jsonl'), `${JSON.stringify({ when: new Date().toISOString(), leg: 'cold-upload', run: name, textures: r.textures, path: r.path, drawnAt: r.drawnAt, differ: r.compare.differ, first: r.compare.first, presents: r.presents, finalPath: r.finalPath, gpu: r.gpu, twin: r.twin, preExactDiffering: r.preExactDiffering, bound, failures })}\n`);
      expect.soft(failures, `${name}: the first frame as its path owes (${JSON.stringify(r.compare.first)})`).toEqual([]);
      if (r.why.some((w) => w.startsWith('textures uploading'))) waited++;
    }
    expect(waited, 'at least one case waited for its textures (two or more of them)').toBeGreaterThan(0);
  });
});

// GM-19a (the plan's row GM-19a, the overlay's leg; GM-11a-1 review F3; `UI_GPU_PREMULTIPLIED_PRESENT_ADAPTATION`): the
// overlay's canvas is premultiplied, its frame target the software's pre-divide bytes (P14/P22, held above for every
// transparent run at each listed scale, the overlay's HD 2 included). Here: a frame with RGB over its alpha -- as an L1
// frame's pre-divide bytes can be -- reaches the canvas as min(RGB, A), never undefined, and the target keeps it. Written,
// not run on this host (the GPU boxes' run). Not here: the overlay's own draw lists (its dialogs are read from the disc,
// which this page does not load).
test.describe('GM-19a: the overlay\'s premultiplied present', () => {
  test('a pre-divide frame with RGB over A: the canvas min(RGB, A) at every listed scale, the target unchanged', async ({ page }, info) => {
    await openHarness(page);
    for (const scale of ENV.scales) {
      const r = await page.evaluate(([s]) => (window as unknown as Record<string, UiGpuHarness>)['__uiGpuHarness']!.premultipliedPresent(s as 1 | 2 | 4, 4000 + s), [scale] as const);
      info.annotations.push({ type: 'premultiplied-present', description: `@${scale}x: shown ${r.shown.differ} of ${r.shown.bytes} bytes differ, target ${r.target.differ}, RGB > A ${r.overAlpha}; ${r.shown.why.join('; ')}` });
      expect.soft(r.shown.why, `@${scale}x: no GL error`).toEqual([]);
      expect.soft(r.overAlpha, `@${scale}x: no pixel with RGB over A on the canvas`).toBe(0);
      expect.soft(r.shown.differ, `@${scale}x: min(RGB, A), flipped once (${JSON.stringify(r.shown.first)})`).toBe(0);
      expect.soft(r.target.differ, `@${scale}x: the target keeps the pre-divide bytes (${JSON.stringify(r.target.first)})`).toBe(0);
    }
  });
});

// GM-30 (GM-23's parity leg; the plan's row GM-30): the loading panel's GPU frame against its software reference, on
// synthetic panel quads through `loadingDrawList` (the module's comment). The same files and summary line as the main leg,
// the same acceptance (`parityRunFailures`). Written, not run on this host (the GPU boxes' run).
test.describe('GM-30: the loading panel\'s frame (GM-23\'s leg), synthetic quads through loadingDrawList', () => {
  test.skip(LOADING.length === 0, 'S2U_UI_GPU_PARITY_CASES names no loading case');

  for (const c of LOADING) {
    test(`${c.key} (${c.gpu}; ${c.rules.join(', ')}): ${c.name}`, async ({ page }, info) => {
      await openHarness(page);
      const r = await rendererOf(page);
      const renderer = named(r);
      expect(uiGpuGlRefusal(LEG, renderer), 'the native GL leg runs on the host\'s GL').toBeNull();
      mkdirSync(ENV.out, { recursive: true });
      const params = { key: c.key, fader: c.fader, alpha: c.alpha, rgb: c.rgb };
      for (const run of loadingParityRuns([c], ENV.scales)) {
        const x = await page.evaluate(([p, s, bl]) => (window as unknown as Record<string, UiGpuHarness>)['__uiGpuHarness']!.loadingParityRun(p, s as 1 | 2 | 4, bl as 'exact' | 'ff'), [params, run.scale, run.blend] as const);
        const W = 640 * run.scale, H = 448 * run.scale;
        expect.soft([x.width, x.height], `${run.run}: the frame's size`).toEqual([W, H]);
        const gpu = new Uint8Array(Buffer.from(x.frames.gpu, 'base64'));
        const cpu = new Uint8Array(Buffer.from(x.frames.cpu, 'base64'));
        const diff = countDifferingBytes(gpu, cpu, x.width);
        const stem = join(ENV.out, frameFileStem(run.run));
        const header = { dialog: `loading ${c.key}`, run: run.run, scale: run.scale, mode: run.mode, blend: run.blend, width: x.width, height: x.height, renderer, path: x.path, drawnAt: x.drawnAt };
        writeFileSync(`${stem}.gpu.rgba`, encodeFrameFile({ ...header, which: 'gpu' }, gpu));
        writeFileSync(`${stem}.cpu.rgba`, encodeFrameFile({ ...header, which: 'cpu' }, cpu));
        writeFileSync(`${stem}.diff.png`, encodePng(x.width, x.height, diffImage(gpu, cpu, x.width, x.height)));
        const l1Lower = x.path === 'software' && x.drawnAt !== null && x.drawnAt !== run.scale;
        // The 4070 run's finding 1: a file's line or the pin's; a run the pin lacks, B recorded unjudged (`bNote`).
        const { bound, note: bNote } = loadingRunBound(BOUNDS, renderer, run.run, b(x.twin));
        const failures = parityRunFailures({
          scale: run.scale, path: x.path, why: x.why, expectGpu: x.expectGpu, refusal: x.refusal, drawnAt: x.drawnAt,
          l1Differ: x.l1 ? x.l1.differ : null, pageDiffer: x.shown.differ, nodeDiffer: diff.differ,
          gpu: { ...b(x.gpu), exactDiffering: x.gpu.exactDiffering }, pre: x.pre ? { differ: x.pre.differ, exactDiffering: x.pre.exactDiffering } : null,
        }, c, run.blend, bound);
        appendFileSync(join(ENV.out, 'summary.jsonl'), `${JSON.stringify({
          when: new Date().toISOString(), leg: 'loading', bNote, run: run.run, key: c.key, class: c.gpu, scale: run.scale, mode: run.mode, blend: run.blend,
          fader: c.fader, alpha: c.alpha, rgb: c.rgb,
          renderer, requested: LEG.requested, path: x.path, why: x.why, expectGpu: x.expectGpu, refusal: x.refusal, presents: x.presents,
          drawnAt: x.drawnAt, l1: x.l1 ? { differ: x.l1.differ, first: x.l1.first } : null, l1AtLowerScale: l1Lower,
          bytes: diff.bytes, differ: diff.differ, differPixels: diff.pixels, first: diff.first,
          gpu: x.gpu, twin: x.twin, bound, boundFrom: BOUND_FROM, failures,
        })}\n`);
        info.annotations.push({
          type: 'differing-bytes',
          description: `${run.run} (${x.path}${x.path === 'software' ? ` at ${x.drawnAt}x: ${x.why.join('; ')}; L1 reference ${x.l1?.differ} bytes differ` : ''}): ${diff.differ} of ${diff.bytes} bytes differ`
            + `; exact class ${x.gpu.exactDiffering} of ${x.gpu.exactPixels} pixels; GPU B ${bText(b(x.gpu))}; twin B ${bText(b(x.twin))}${bNote ? ` (${bNote})` : ''}`,
        });
        expect.soft(failures, `${run.run}: E/E*/B as the main leg${bNote ? ` -- ${bNote}` : ''} (${JSON.stringify(diff.first)})`).toEqual([]);
      }
    });
  }
});
