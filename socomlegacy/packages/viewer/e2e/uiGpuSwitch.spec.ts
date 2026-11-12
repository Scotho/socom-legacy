import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { uiGpuGlLeg, uiGpuLaunchOptions } from './uiGpuGl';
import { FRONT_END } from './urls';
import type { Hooked } from './frontEndWalk';

/**
 * GM-12b (the GPU menus plan, row GM-12b: "taps land on the same frame points with either canvas shown; BRIGHTNESS
 * `filter` equal on both"; "Canvases and contexts"): the front end's two canvases on a real page -- `#front-end` (2D)
 * and `#front-end-gpu` (WebGL2, `../src/uiGpuFront.ts`), made behind `?uiGpu=on` and, since the flip (GM.R18), by every
 * page's table (on a software adapter it stays in standby: L4, the 1x software). A rendered browser run, written
 * on the owner's host and **run on the box** (no browser runs on that host; GM-11b's seat runs it beside the loss,
 * harness and parity specs): from `socomlegacy/`, `E2E_PORT=5310 npx playwright test uiGpuSwitch.spec.ts`. It needs the
 * served tree (`npm run extract-maps`), as `menuflow.spec.ts` does, and skips without it (a skip, never a pass).
 *
 * The box's renderers are software adapters, so the page lets them through (`uiGpuAllowSoftwareAdapter=1`); nothing
 * here is a claim about a player's GPU. The software canvas is shown by a forced loss (`WEBGL_lose_context`: L2, the
 * frame on `#front-end`), then the GPU's back by its restore.
 *
 * Each test uses Playwright's own `page` fixture (closed at the test's end; no context opened by hand, issue #91).
 * GM-11b: the renderer by env (`./uiGpuGl.ts`: SwiftShader by default, `S2U_UI_GPU_GL=native` for the host's GL).
 */
test.use({ launchOptions: uiGpuLaunchOptions() });
const HAVE = existsSync(fileURLToPath(new URL('../../../public/maps/index.json', import.meta.url)));
test.skip(!HAVE, 'maps absent: run npm run extract-maps');
test.setTimeout(180_000);

const ON = `${FRONT_END}?devmode&uiGpu=on&uiGpuSurface=front&uiGpuAllowSoftwareAdapter=1`;

interface Canvases {
  shown: 'gpu' | 'software' | 'none';
  boxes: { soft: DOMRect; gpu: DOMRect };
  filters: { soft: string; gpu: string };
  origin: { soft: [string, string]; gpu: [string, string] };
  levels: Record<string, number>;
}

const canvases = (page: Page): Promise<Canvases> => page.evaluate(() => {
  const soft = document.getElementById('front-end') as HTMLCanvasElement;
  const gpu = document.getElementById('front-end-gpu') as HTMLCanvasElement;
  const visible = (el: HTMLElement): boolean => !el.hidden && getComputedStyle(el).visibility !== 'hidden';
  const o = (el: HTMLElement): [string, string] => [el.style.getPropertyValue('--s2u-origin-x'), el.style.getPropertyValue('--s2u-origin-y')];
  const r = (window as unknown as { __uiGpu?: { levels: Record<string, number> } }).__uiGpu;
  return {
    shown: visible(gpu) ? 'gpu' : visible(soft) ? 'software' : 'none',
    boxes: { soft: soft.getBoundingClientRect().toJSON() as DOMRect, gpu: gpu.getBoundingClientRect().toJSON() as DOMRect },
    filters: { soft: getComputedStyle(soft).filter, gpu: getComputedStyle(gpu).filter },
    origin: { soft: o(soft), gpu: o(gpu) },
    levels: r?.levels ?? {},
  };
});

/** The page up on its menus, the GPU canvas shown (an L0 frame counted). */
async function openOn(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ON);
  await expect(page.locator('canvas#front-end-gpu')).toHaveCount(1, { timeout: 60_000 });
  await expect.poll(async () => (await canvases(page)).shown, { timeout: 60_000 }).toBe('gpu');
  expect((await canvases(page)).levels.L0 ?? 0).toBeGreaterThan(0);
  expect(errors).toEqual([]);
}

/** Records every `MenuInput.tap` the page makes (the frame point the canvas's listener computed). */
const recordTaps = (page: Page): Promise<void> => page.evaluate(() => {
  const s = (window as Hooked).__frontEnd!.session;
  const w = window as unknown as { __taps: [number, number][] };
  w.__taps = [];
  const tap = s.input.tap.bind(s.input);
  s.input.tap = (x: number, y: number) => { w.__taps.push([x, y]); return tap(x, y); };
});
const taps = (page: Page): Promise<[number, number][]> => page.evaluate(() => (window as unknown as { __taps: [number, number][] }).__taps.splice(0));

// GM-11b box fold: the extension taken on the live context and kept on the page -- a lost context gives no extension,
// so asking again at `restoreContext` got null and the restore never happened (`uiGpuLoss.spec.ts:80` at 5650fe4fc).
const loseGpu = (page: Page, how: 'loseContext' | 'restoreContext'): Promise<void> => page.evaluate((h) => {
  const w = window as unknown as { __uiGpuLoseExt?: Record<string, () => void> | null };
  if (!w.__uiGpuLoseExt) {
    const gl = (document.getElementById('front-end-gpu') as HTMLCanvasElement).getContext('webgl2');
    w.__uiGpuLoseExt = gl && !gl.isContextLost() ? gl.getExtension('WEBGL_lose_context') as Record<string, () => void> | null : null;
  }
  const ext = w.__uiGpuLoseExt;
  if (!ext) throw new Error(`no WEBGL_lose_context kept for ${h}`);
  ext[h]!();
}, how);

test.describe("GM-12b: #front-end-gpu beside #front-end (the switch's `?uiGpu=on`)", () => {
  test('one CSS box and one SCREEN POSITION origin for both canvases; the other canvas out of sight and out of the pointer\'s way', async ({ page }) => {
    await openOn(page);
    const c = await canvases(page);
    expect(c.boxes.gpu).toEqual(c.boxes.soft);
    expect(c.origin.gpu).toEqual(c.origin.soft);
    const at = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.id ?? null, [c.boxes.gpu.x + c.boxes.gpu.width / 2, c.boxes.gpu.y + c.boxes.gpu.height / 2]);
    expect(at).toBe('front-end-gpu');
  });

  test('taps land on the same frame points with either canvas shown', async ({ page }, info) => {
    await openOn(page);
    await recordTaps(page);
    const box = (await canvases(page)).boxes.gpu;
    // Points over the drawn frame (object-fit: contain): the centre and near each corner of the 640 x 448 frame.
    const k = Math.min(box.width / 640, box.height / 448);
    const ox = box.x + (box.width - 640 * k) / 2, oy = box.y + (box.height - 448 * k) / 2;
    const points = [[320, 224], [40, 40], [600, 40], [40, 408], [600, 408]].map(([fx, fy]) => [ox + fx! * k, oy + fy! * k] as const);
    const tapAll = async (): Promise<[number, number][]> => {
      for (const [x, y] of points) { await page.mouse.click(x, y); await page.waitForTimeout(50); }
      return taps(page);
    };
    const onGpu = await tapAll();
    await loseGpu(page, 'loseContext');
    await expect.poll(async () => (await canvases(page)).shown, { timeout: 10_000 }).toBe('software');
    const onSoft = await tapAll();
    info.annotations.push({ type: 'taps', description: JSON.stringify({ onGpu, onSoft }) });
    expect(onGpu).toHaveLength(points.length);
    expect(onSoft).toEqual(onGpu);
    for (const [i, [fx, fy]] of [[320, 224], [40, 40], [600, 40], [40, 408], [600, 408]].entries()) {
      expect(onGpu[i]![0]).toBeCloseTo(fx!, 0);
      expect(onGpu[i]![1]).toBeCloseTo(fy!, 0);
    }
    await loseGpu(page, 'restoreContext');
    await expect.poll(async () => (await canvases(page)).shown, { timeout: 30_000 }).toBe('gpu');
  });

  test('BRIGHTNESS: the same `filter` on both canvases at the default, at each end and between, whichever is shown', async ({ page }) => {
    await openOn(page);
    for (const b of [0.5, 0, 0.25, 0.8, 1]) {
      await page.evaluate((v) => {
        const vars = (window as Hooked).__frontEnd!.session.uiVars;
        const value = { type: 'real' as const, value: v };
        if (vars.find('BRIGHTNESS')) vars.set('BRIGHTNESS', value); else vars.add('BRIGHTNESS', value, 1);
      }, b);
      await page.waitForTimeout(100);                                      // the page reads it each tick
      const c = await canvases(page);
      expect(c.filters.gpu, `BRIGHTNESS ${b}`).toBe(c.filters.soft);
      expect(c.filters.gpu === 'none', `BRIGHTNESS ${b}: a filter only off the default`).toBe(b === 0.5);
    }
    await loseGpu(page, 'loseContext');
    await expect.poll(async () => (await canvases(page)).shown, { timeout: 10_000 }).toBe('software');
    const c = await canvases(page);
    expect(c.filters.soft).toBe(c.filters.gpu);
    await loseGpu(page, 'restoreContext');
  });

  // GM-16b review F2: the dev server's page reads the development table. Since the flip (GM.R18) both tables are every
  // cell `on`, so the all-off page -- every player's before the flip -- is the rollback, the URL's `uiGpu=off`.
  test('the switch off (the rollback, ?uiGpu=off): #front-end alone', async ({ page }) => {
    await page.goto(`${FRONT_END}?devmode&uiGpu=off`);
    await expect(page.locator('canvas#front-end')).toHaveCount(1);
    await page.waitForTimeout(3_000);
    await expect(page.locator('canvas#front-end-gpu')).toHaveCount(0);
  });

  // GM-16b (review F2), moved by the flip (GM.R18): the development table on the dev server is every cell `on`, so at 1x
  // the front end asks its one WebGL2 context; on this run's software adapter (no `uiGpuAllowSoftwareAdapter`) the
  // capability gate refuses it -- L4, the context let go, `#front-end-gpu` kept in standby, the 1x software shown.
  test('the development table, the flip: on a software adapter #front-end-gpu in standby, its one context let go (L4)', async ({ page }) => {
    test.skip(uiGpuGlLeg().requested !== 'swiftshader', 'the L4 leg needs the software adapter (SwiftShader); a hardware leg draws L0');
    await page.addInitScript(() => {
      const w = window as unknown as { __webglAsked: string[] };
      w.__webglAsked = [];
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id: string, ...rest: unknown[]) {
        if (/webgl/i.test(id)) w.__webglAsked.push(`${this.id || '(no id)'}:${id}`);
        return (get as (...a: unknown[]) => unknown).call(this, id, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await page.goto(`${FRONT_END}?devmode`);
    await expect(page.locator('canvas#front-end')).toHaveCount(1);
    await expect(page.locator('canvas#front-end-gpu')).toHaveCount(1, { timeout: 60_000 });
    await page.waitForTimeout(3_000);
    const c = await canvases(page);
    expect(c.shown).toBe('software');
    const state = await page.evaluate(() => ({
      standby: document.getElementById('front-end-gpu')!.classList.contains('s2u-ui-gpu-standby'),
      asked: (window as unknown as { __webglAsked: string[] }).__webglAsked.filter((a) => a.startsWith('front-end-gpu:')),
      contexts: (window as unknown as { __uiGpu?: { contexts: number } }).__uiGpu?.contexts ?? -1,
    }));
    expect(state.standby).toBe(true);
    expect(state.asked.length).toBeLessThanOrEqual(1);                   // the capability check's one context, at most
    expect(state.contexts).toBe(0);                                      // let go at L4
    const front = () => page.evaluate(() => (window as unknown as { __uiGpu?: { surfaces: { front: { levels: { L0: number; L4: number } } } } }).__uiGpu?.surfaces.front.levels);
    await expect.poll(async () => (await front())?.L4 ?? 0, { timeout: 60_000 }).toBeGreaterThan(0);   // counted per surface (hostFor)
    expect((await front())?.L0).toBe(0);
  });
});
