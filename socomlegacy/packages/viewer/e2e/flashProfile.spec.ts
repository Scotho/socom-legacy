import { writeFileSync } from 'node:fs';
import { chromium, expect, test, type BrowserContext, type CDPSession, type Page } from '@playwright/test';
// `src/hook.ts` is types only; its `declare global` is what makes `window.__viewer` exist inside `page.evaluate`.
import type {} from '../src/hook';
import { holdReleased } from './loadHold';
import { OpenedContexts } from './openedContexts';
import { TEST_ROOM } from './urls';

/**
 * L3lsGcIs, the flashbang freeze (seat 70's finding, 2026-11-02): a MEASUREMENT, not a check -- a browser-test
 * instrument with no original, changing nothing the page does. It passes when it ran and printed; nothing is asserted
 * on timing. Run on ask only (`S2U_FLASH_PROFILE=1`), on a host with a browser slot: it is minutes long and its WebGPU
 * half wants a GPU adapter.
 *
 * For each backend -- WebGPU (a chromium of its own with the WebGPU flags, as `presentation.spec.ts`; skipped, saying so,
 * where it lands on WebGL2) and the WebGL2 graphics setting (`&renderer=webgl2`, `../src/graphicsBackend`) -- and each
 * picture -- the native one (`view=modern`, the default) and one PS2-picture control (`view=ps2`) -- on Frostfire's test
 * room with no match (`&nomatch`), past the loading hold and the warm-up's links: a requestAnimationFrame delta logger, a
 * CDP trace, then a Mark141 at the feet while facing it, a second 15 s later, then an M67 as the control. Each
 * detonation prints one line:
 *
 *   FLASH_PROFILE <backend> <picture> <n> longestFrameMs=<..> newPipelines=<..> renderObjectsDelta=<..> ...
 *
 * - `longestFrameMs`: the longest rAF delta from the throw to 2 s past the detonation.
 * - `newPipelines`: the LinkLog's links over that window (`__viewer.links().total`; `syncLinks` the ones a frame waited for).
 * - `renderObjectsDelta`: three's `RenderObjects.createRenderObject` calls over that window, counted on the page's
 *   renderer (its module found by the URL the page loaded three's WebGPU build from); `n/a` where it could not be hooked.
 * - the rest: `renderer.info` deltas (`__viewer.renderStats()`, the dev hook under `?devmode`).
 * The trace (devtools.timeline, disabled-by-default-devtools.timeline.frame, v8.execute, gpu, and the V8 sampler's
 * disabled-by-default-v8.cpu_profiler so the self time under Renderer.render, RenderObjects.get, createRenderObject and
 * Bindings can be read by function) is saved to the test's results folder as `flash-trace-<backend>-<picture>.json`.
 */

const RUN = process.env.S2U_FLASH_PROFILE === '1';
const MAP = 'MP2';
/** Frostfire's spawn A stand and pose (`flashInvestigation.spec.ts`'s): the flash lands in view, in front of the feet. */
const POSE = { x: 796, y: 115.4, z: 614, yaw: 210, pitch: -9.167 };
/** The kit: M4A1, Mark 23, Mark141, claymore, M67 (`grenade.spec.ts`'s flashbang kit). */
const KIT = '54,15,123,153,121';
const CATEGORIES = [
  'devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'v8.execute', 'gpu', 'disabled-by-default-v8.cpu_profiler',
];
type Backend = 'webgpu' | 'webgl2';
type Picture = 'native' | 'ps2';

const opened = new OpenedContexts();
test.afterEach(() => opened.closeAll());

/** One frame's length a rAF, from the page's first script; read by time window. */
function installFrameLogger(): void {
  const w = window as unknown as { __flashFrames: { t: number; dt: number }[] };
  w.__flashFrames = [];
  let last = 0;
  const tick = (t: number): void => {
    if (last) w.__flashFrames.push({ t, dt: t - last });
    if (w.__flashFrames.length > 20000) w.__flashFrames.splice(0, 10000);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** three's `createRenderObject` counted on every renderer that draws from now on; false where three's module was not found. */
async function hookRenderObjects(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const w = window as unknown as { __flashRO?: { created: number; hooked: number } };
    if (w.__flashRO) return true;
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /three[._]webgpu(\.min)?\.js/.test(n));
    if (!url) return false;
    const mod = await import(/* @vite-ignore */ url) as { WebGPURenderer?: { prototype: object } };
    const proto = mod.WebGPURenderer ? Object.getPrototypeOf(mod.WebGPURenderer.prototype) as { render: (...a: unknown[]) => unknown } : null;
    if (!proto || typeof proto.render !== 'function') return false;
    const st = { created: 0, hooked: 0 };
    w.__flashRO = st;
    const seen = new WeakSet<object>();
    const render = proto.render;
    proto.render = function (this: { _objects?: { createRenderObject: (...b: unknown[]) => unknown } | null }, ...a: unknown[]) {
      const objects = this._objects;
      if (objects && !seen.has(objects)) {
        seen.add(objects);
        st.hooked++;
        const create = objects.createRenderObject;
        objects.createRenderObject = function (this: unknown, ...b: unknown[]) { st.created++; return create.apply(this, b); };
      }
      return render.apply(this, a);
    };
    return true;
  });
}

interface Reading { at: number; links: number; sync: number; ro: number | null; info: Record<string, number> }
/** The counters now: the page's clock, the LinkLog's links, the render objects made, `renderer.info`'s totals. */
async function read(page: Page): Promise<Reading> {
  return page.evaluate(() => {
    const v = window.__viewer;
    const l = v.links();
    const ro = (window as unknown as { __flashRO?: { created: number; hooked: number } }).__flashRO;
    const sum = v.renderStats?.().sum;
    const info: Record<string, number> = sum
      ? { drawCalls: sum.render.drawCalls, geometries: sum.memory.geometries, textures: sum.memory.textures, programs: sum.programs, bytes: sum.bytes?.total ?? 0 }
      : {};
    return { at: performance.now(), links: l.total, sync: l.sync, ro: ro && ro.hooked > 0 ? ro.created : null, info };
  });
}

/** The longest rAF delta whose frame ended in [from, to]. */
async function longestFrame(page: Page, from: number, to: number): Promise<number> {
  return page.evaluate(([a, b]) => {
    const frames = (window as unknown as { __flashFrames: { t: number; dt: number }[] }).__flashFrames;
    return frames.filter((f) => f.t >= a! && f.t <= b!).reduce((m, f) => Math.max(m, f.dt), 0);
  }, [from, to]);
}

/** Starts a trace; the returned stop writes it to `path`. */
async function startTrace(cdp: CDPSession): Promise<(path: string) => Promise<void>> {
  await cdp.send('Tracing.start', { transferMode: 'ReturnAsStream', traceConfig: { includedCategories: CATEGORIES } });
  return async (path) => {
    const complete = new Promise<string>((res) => { cdp.once('Tracing.tracingComplete', (e) => res(e.stream!)); });
    await cdp.send('Tracing.end');
    const handle = await complete;
    const chunks: Buffer[] = [];
    for (;;) {
      const r = await cdp.send('IO.read', { handle });
      chunks.push(Buffer.from(r.data, r.base64Encoded ? 'base64' : 'utf8'));
      if (r.eof) break;
    }
    await cdp.send('IO.close', { handle });
    writeFileSync(path, Buffer.concat(chunks));
  };
}

/** One throw of `item` at the feet, measured from the throw to 2 s past its detonation; one FLASH_PROFILE line. */
async function throwAndMeasure(page: Page, backend: Backend, picture: Picture, n: number, item: 'Mark141' | 'M67'): Promise<void> {
  const before = await read(page);
  const blasts = await page.evaluate(() => window.__viewer.grenade().explosions.length);
  let refilled = 0;
  if ((await page.evaluate((it) => window.__viewer.grenade().leftByItem[it] ?? 0, item)) < 1) {
    await page.evaluate(() => window.__viewer.resetGrenades());   // the pouch refilled: said in the line
    refilled = 1;
  }
  expect(await page.evaluate((it) => window.__viewer.selectItem(it), item)).toBe(true);
  const thrown = await page.evaluate(() => window.__viewer.throwGrenade(0.1));
  expect(thrown, `${item}: thrown`).not.toBeNull();
  // The detonation: an explosion recorded, or (the Mark141) the white-out on.
  await expect.poll(() => page.evaluate(([b, flash]) => window.__viewer.grenade().explosions.length > (b as number)
    || (flash === true && window.__viewer.whiteOut().level !== null), [blasts, item === 'Mark141'] as const), { timeout: 15_000, intervals: [50] }).toBe(true);
  const detonated = await page.evaluate(() => performance.now());
  await page.waitForTimeout(2000);
  const after = await read(page);
  const longest = await longestFrame(page, before.at, after.at);
  // renderer.info: the live counts' deltas (programs, geometries, textures, bytes), the last frame's draw calls as read.
  const extra = Object.keys(after.info).map((k) => (k === 'drawCalls' ? `drawCalls=${after.info[k]}` : `${k}Delta=${(after.info[k] ?? 0) - (before.info[k] ?? 0)}`)).join(' ');
  const ro = after.ro === null || before.ro === null ? 'n/a' : String(after.ro - before.ro);
  console.log(`FLASH_PROFILE ${backend} ${picture} ${n} longestFrameMs=${longest.toFixed(1)} newPipelines=${after.links - before.links} `
    + `renderObjectsDelta=${ro} item=${item} syncLinks=${after.sync - before.sync} detonatedAtMs=${(detonated - before.at).toFixed(0)} `
    + `refilled=${refilled}${extra ? ` ${extra}` : ''}`);
}

/** The whole sequence on one page: load, warm, trace, two flashes 15 s apart, a frag. */
async function profile(context: BrowserContext, backend: Backend, picture: Picture): Promise<void> {
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await page.addInitScript(installFrameLogger);
  const renderer = backend === 'webgl2' ? '&renderer=webgl2' : '&renderer=webgpu';   // WEBGL2-DEFAULT (LATER 708): auto is WebGL2 now
  const view = picture === 'ps2' ? 'ps2' : 'modern';
  await page.goto(`${TEST_ROOM}?mode=play&map=${MAP}&view=${view}&online=off&devmode&noarmory&nomatch&kit=${KIT}${renderer}`);
  await expect(page.locator('#status')).toContainText('triangles');
  await holdReleased(page);
  const drawn = (await page.evaluate(() => window.__viewer.stats())).backend;
  if (drawn !== backend) {
    console.log(`FLASH_PROFILE ${backend} ${picture} skipped drewWith=${drawn}`);
    test.skip(true, `this browser drew with ${drawn}, not ${backend}`);
  }
  // The warm-up done: no link in flight.
  await expect.poll(() => page.evaluate(() => window.__viewer.links().pending), { timeout: 60_000 }).toBe(0);
  await page.keyboard.press('Backquote');   // a gesture: the audio unlocked, so the flash's sound is part of what is timed
  await page.evaluate((pose) => {
    window.__viewer.setMode('walk');
    window.__viewer.setCamera(pose);
    window.__viewer.walkFor(0.3, { forward: 0 });
  }, POSE);
  await page.waitForTimeout(1500);
  const hooked = await hookRenderObjects(page);
  await page.waitForTimeout(500);                                    // a frame or two: the page's renderer hooked
  console.log(`FLASH_PROFILE ${backend} ${picture} start renderObjectsHooked=${hooked}`);
  const cdp = await context.newCDPSession(page);
  const stop = await startTrace(cdp);
  try {
    const t0 = Date.now();
    await throwAndMeasure(page, backend, picture, 1, 'Mark141');
    await page.waitForTimeout(Math.max(0, 15_000 - (Date.now() - t0)));
    await throwAndMeasure(page, backend, picture, 2, 'Mark141');
    await expect.poll(() => page.evaluate(() => window.__viewer.whiteOut().level), { timeout: 20_000 }).toBeNull();
    await page.waitForTimeout(2000);
    await throwAndMeasure(page, backend, picture, 3, 'M67');
  } finally {
    await stop(test.info().outputPath(`flash-trace-${backend}-${picture}.json`));
    await cdp.detach();
  }
  console.log(`FLASH_PROFILE ${backend} ${picture} pageErrors=${problems.length}${problems.length ? ` first=${JSON.stringify(problems[0])}` : ''}`);
}

test.describe('L3lsGcIs flash profile (a measurement, on ask: S2U_FLASH_PROFILE=1)', () => {
  test.skip(!RUN, 'a measurement for the profiling box: set S2U_FLASH_PROFILE=1');
  test.describe.configure({ timeout: 300_000 });

  for (const picture of ['native', 'ps2'] as const) {
    test(`WebGL2 (the graphics setting), ${picture} picture`, async ({ browser, baseURL, storageState }) => {
      const context = opened.add(await browser.newContext({ baseURL, storageState, viewport: { width: 1280, height: 720 } }));
      await profile(context, 'webgl2', picture);
    });

    test(`WebGPU (a chromium with an adapter), ${picture} picture`, async ({ baseURL, storageState }) => {
      // A browser of its own, as `presentation.spec.ts`'s: the config's is the headless shell without the WebGPU flags.
      const gpu = await chromium.launch({
        channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'], executablePath: process.env.PW_CHROMIUM || undefined,
      });
      try {
        const context = opened.add(await gpu.newContext({ baseURL, storageState, viewport: { width: 1280, height: 720 } }));
        await profile(context, 'webgpu', picture);
      } finally {
        await opened.closeAll();
        await gpu.close();
      }
    });
  }
});
