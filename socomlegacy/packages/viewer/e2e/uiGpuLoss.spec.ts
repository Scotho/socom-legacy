import { expect, test, type Page } from '@playwright/test';
import { uiGpuLaunchOptions } from './uiGpuGl';
import type { UiGpuLossFrame, UiGpuLossHarness, UiGpuLossReadout } from './uiGpuLossHarness';
import { uiGpuContextsWhileReleased, uiGpuLoseGate, type UiGpuLoseProbeKind } from './uiGpuLoseProbe';

/**
 * GM-12a (the GPU menus plan, row GM-12a: "forced loss -> software at 1x, never black -> GPU back; contexts <= 2 in a
 * match; restore time recorded"; the performance table's "Context restore after a loss at 4x", recorded, not a target):
 * the GPU surface's lifecycle on the context a real browser gives. A rendered browser run; written on the owner's host
 * and **run on the box** (no browser runs on that host; GM-11b's seat runs it beside the harness and parity specs).
 * Needs no game data for the harness legs: every frame is a made-up clear.
 *
 * The page is `/?uiGpuLoss` on the run's Vite server -- this lane's port is 5310: from `socomlegacy/`,
 * `E2E_PORT=5310 npx playwright test uiGpuLoss.spec.ts`. The spec serves that address itself (a routed document holding
 * only `./uiGpuLossHarness.ts`'s module), so none of the app boots; the hook is `window.__uiGpuLoss`. A loss is forced
 * with `WEBGL_lose_context` (the browser's simulated loss: the same events and the same restore path as a real one; a
 * GPU-process crash is not forced here). The box's renderers are software adapters, so the harness lets them through
 * (`allowSoftwareAdapter`); their restore times are not a claim about a player's GPU.
 *
 * Each test uses Playwright's own `page` fixture (closed at the test's end; no context opened by hand, issue #91).
 * GM-11b: the renderer by env (`./uiGpuGl.ts`: SwiftShader by default, `S2U_UI_GPU_GL=native` for the host's GL).
 */

test.use({ launchOptions: uiGpuLaunchOptions() });

const LOSS_PAGE = '<!doctype html><html><head><meta charset="utf-8"><title>uiGpuLoss</title></head>'
  + '<body style="margin:0;background:#000"><script type="module">'
  + 'import { installUiGpuLossHarness } from "/e2e/uiGpuLossHarness.ts";'
  + 'try { installUiGpuLossHarness(); } catch (e) { window.__uiGpuLossError = String(e && e.stack || e); }'
  + '</script></body></html>';

async function openLoss(page: Page): Promise<void> {
  await page.route((url) => url.pathname === '/' && url.searchParams.has('uiGpuLoss'), (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: LOSS_PAGE }));
  await page.goto('/?uiGpuLoss');
  await page.waitForFunction(() => {
    const w = window as unknown as Record<string, unknown>;
    return (w['__uiGpuLoss'] as UiGpuLossHarness | undefined)?.ready === true || typeof w['__uiGpuLossError'] === 'string';
  }, null, { timeout: 60_000 });
  const error = await page.evaluate(() => (window as unknown as Record<string, unknown>)['__uiGpuLossError'] as string | undefined);
  expect(error, 'the loss harness installed').toBeUndefined();
}

const h = <T>(page: Page, name: keyof UiGpuLossHarness, ...args: unknown[]): Promise<T> =>
  page.evaluate(([n, a]) => {
    const x = (window as unknown as Record<string, Record<string, (...y: unknown[]) => unknown>>)['__uiGpuLoss']!;
    return x[n as string]!(...(a as unknown[]));
  }, [name, args] as const) as Promise<T>;

/**
 * GM-11b box fold: the forced-loss legs need `WEBGL_lose_context` on the live context. Skipped by name only where a live
 * WebGL2 context offers none; no context, or one lost at the probe, fails (review F1; `./uiGpuLoseProbe.ts`). The box's
 * SwiftShader and llvmpipe both offer it (at 5650fe4fc each run's first `lose` used it).
 */
async function loseProbe(page: Page): Promise<UiGpuLoseProbeKind> {
  const kind = await h<UiGpuLoseProbeKind>(page, 'loseProbe');
  const gate = uiGpuLoseGate(kind);
  if (gate.act === 'fail') throw new Error(gate.message);
  return kind;
}
async function needLoseContext(page: Page): Promise<void> {
  const gate = uiGpuLoseGate(await loseProbe(page));
  test.skip(gate.act === 'skip', gate.act === 'skip' ? gate.reason : '');
}

/**
 * GM-12a fold (shadow's release-head tail at d628ce86e, 2 of 2 red at the first `path` check, the surface 'software'
 * before any loss): the surface links its programs asynchronously (`KHR_parallel_shader_compile`, `UiGpuSurfacePresenter`
 * `poll`) and draws the software until they settle. A real GPU's link (ANGLE D3D11 on shadow's A4500) can outlast the
 * three frames the case gave it, where the boxes' SwiftShader runs were green. Frames until the GPU path, at most `max`
 * (the restore's own bound); the case then checks that it came. Was: three frames, then the GPU path required.
 */
async function untilGpu(page: Page, scale: number, max = 600): Promise<UiGpuLossFrame[]> {
  const frames: UiGpuLossFrame[] = [];
  while (frames.length < max) {
    frames.push(...await h<UiGpuLossFrame[]>(page, 'run', 3, scale));
    const last = frames.at(-1)!;
    // Review F1: a surface that will never be ready (refused, dead, disposed) fails at once, its state named below.
    if (last.path === 'gpu' || last.state === 'unavailable' || last.state === 'dead' || last.state === 'disposed') break;
  }
  return frames;
}

const neverBlack = (frames: UiGpuLossFrame[]): void => {
  for (const f of frames) expect(f.litPixels, `a ${f.path} frame in state ${f.state} is not black`).toBeGreaterThan(0);
};

test.describe('GM-12a: the GPU surface\'s lifecycle and loss on a real context', () => {
  for (const scale of [1, 4] as const) {
    test(`a forced loss at ${scale}x: the software at 1x, never black; the GPU back in place; the restore time recorded`, async ({ page }, info) => {
      await openLoss(page);
      await needLoseContext(page);
      const before = await untilGpu(page, scale);
      expect(before.at(-1)!.path, `the GPU path within 600 frames (${before.length} drawn, last state ${before.at(-1)!.state})`).toBe('gpu');
      expect([before.at(-1)!.width, before.at(-1)!.height]).toEqual([640 * scale, 448 * scale]);
      neverBlack(before);
      await h(page, 'lose');
      const lost = await h<UiGpuLossFrame[]>(page, 'run', 5, scale);
      for (const f of lost) {
        expect(f.path, 'L2 draws on the 2D canvas').toBe('software');
        expect([f.width, f.height], 'L2 at 1x (UI_GPU_LOSS_FALLBACK_ADAPTATION)').toEqual([640, 448]);
      }
      neverBlack(lost);
      const back = await h<{ ms: number | null; frames: UiGpuLossFrame[] }>(page, 'restoreAndWait', scale, 600);
      neverBlack(back.frames);
      expect(back.ms, 'the GPU came back within 600 frames').not.toBeNull();
      const r = await h<UiGpuLossReadout>(page, 'readout');
      info.annotations.push({ type: `restore at ${scale}x`, description: JSON.stringify({ ms: back.ms, restores: r.stats.restores, frames: back.frames.length }) });
      expect(r.stats.losses).toBe(1);
      expect(r.stats.restores).toHaveLength(1);
      expect(r.contexts).toBe(1);
      expect(r.kills).toEqual([]);
    });
  }

  test('the loss limit: three losses inside the window end the GPU path for the session (L3), never black', async ({ page }) => {
    await openLoss(page);
    await needLoseContext(page);
    await h(page, 'run', 2, 2);
    for (let i = 0; i < 2; i++) {
      await h(page, 'lose');
      await h(page, 'run', 2, 2);
      const back = await h<{ ms: number | null }>(page, 'restoreAndWait', 2, 600);
      expect(back.ms).not.toBeNull();
    }
    await h(page, 'lose');
    const after = await h<UiGpuLossFrame[]>(page, 'run', 5, 2);
    neverBlack(after);
    const r = await h<UiGpuLossReadout>(page, 'readout');
    expect(r.kills).toEqual([{ reason: 'loss-limit', surface: 'front' }]);
    expect(after.every((f) => f.path === 'software' && f.state === 'dead')).toBe(true);
  });

  test('leave lets the context go (counted down), returned brings it back lazily behind software frames', async ({ page }, info) => {
    await openLoss(page);
    // Review F2: runs with or without WEBGL_lose_context -- without it the context is kept and stays counted.
    const kind = await loseProbe(page) as 'ok' | 'absent';
    info.annotations.push({ type: 'WEBGL_lose_context', description: kind });
    await h(page, 'run', 2, 2);
    expect((await h<UiGpuLossReadout>(page, 'readout')).contexts).toBe(1);
    await h(page, 'leave');
    const held = await h<UiGpuLossFrame[]>(page, 'run', 3, 2);
    expect(held.every((f) => f.path === 'software')).toBe(true);
    neverBlack(held);
    expect((await h<UiGpuLossReadout>(page, 'readout')).contexts).toBe(uiGpuContextsWhileReleased(kind));
    await h(page, 'returned');
    const t0 = Date.now();
    let frames: UiGpuLossFrame[] = [];
    for (let i = 0; i < 60 && frames.at(-1)?.path !== 'gpu'; i++) frames = frames.concat(await h<UiGpuLossFrame[]>(page, 'run', 10, 2));
    info.annotations.push({ type: 'return re-create', description: JSON.stringify({ ms: Date.now() - t0, frames: frames.length }) });
    neverBlack(frames);
    expect(frames.at(-1)!.path).toBe('gpu');
    const r = await h<UiGpuLossReadout>(page, 'readout');
    expect(r.contexts).toBe(1);
    expect(r.stats.losses, 'a release is not a loss').toBe(0);
  });

  // The row's lobby -> match -> back leg needs the front end's GPU surface on the page: GM-12b makes it beside
  // `#front-end-gpu` (behind `?uiGpu=on`). Until then the app makes no surface and there is nothing to count.
  test.fixme('lobby -> match -> back: live UI contexts <= 2 in the match (+ the overlay counted, + the Forge window where open), the GPU back after', async () => {
    // GM-12b: open the app at `?uiGpu=on&uiGpuAllowSoftwareAdapter=1`, walk to a lobby (`./menuMatch.ts`), start a solo
    // match, read `window.__uiGpu.contexts` inside it (<= 2: the match's device and, at most, the overlay's), return,
    // and read the front end's surface back on the GPU (`levels.L0` rising) with the restore time annotated.
  });
});
