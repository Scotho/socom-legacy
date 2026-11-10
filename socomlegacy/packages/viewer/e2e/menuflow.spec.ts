import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type {} from '../src/hook';
import { localPort } from './ports';
import { frontGpuCanvasFailure, type FrontGpuCanvasState } from './uiGpuGl';
import { FRONT_END, TEST_ROOM } from './urls';

/**
 * The page's entry under OT.R19 (the owner, 2026-10-04: "remove the need now for &menuflow and make it the default.
 * make all the old params for matches only relevant to a new /testroom. the default load is the menu flow now"; OT.R12
 * before it; `../src/entry.ts`, `../src/pageEntry.ts`): at the base path the page is the front end alone with no
 * parameter asking for it -- `main.ts` never loads, so no `maps/index.json`, no `/rooms`, no `#view` canvas and no
 * debug hook, and a match parameter there is read by nothing -- and at `/testroom` the viewer boots exactly as before
 * and the front end is never mounted. A rendered browser run, nothing of the game measured.
 */
const HAVE = existsSync(fileURLToPath(new URL('../../../public/maps/index.json', import.meta.url)));
test.skip(!HAVE, 'maps absent: run npm run extract-maps');

/** Every request the page makes, by URL (the document's own aside). */
function requests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (r) => { if (r.resourceType() !== 'document') urls.push(r.url()); });
  return urls;
}
const ROOMS = `http://localhost:${localPort()}/rooms`;   // the run's own Local port (./ports), never 8787
/** The viewer's module, as the dev server serves it: requested only when `./main` is imported. */
const MAIN = /\/src\/main\.ts(\?|$)/;

/** Opens `address` and checks the page is the front end alone: no viewer module, no map list, no rooms, no #view. */
async function frontEndAlone(page: Page, address: string): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Online = Local remembered (as the owner's preview had it): the viewer would poll Local's /rooms at once.
  await page.addInitScript(() => { localStorage.setItem('s2u.viewer.panelOpen', '1'); localStorage.setItem('s2u.viewer.online', 'local'); });
  let rooms = 0;
  await page.route(ROOMS, (route) => { rooms++; return route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: '[]' }); });
  const urls = requests(page);
  await page.goto(address);
  const canvas = page.locator('canvas#front-end');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveAttribute('width', '640');
  await expect(canvas).toHaveAttribute('height', '448');
  // The front end has read its files from the served tree: the menu is up (the main.ts-free page still reads the disc).
  await expect.poll(() => urls.some((u) => /\/maps\/RUN\/UI\/READERC\.ZAR/.test(u)), { timeout: 30_000 }).toBe(true);
  await page.waitForTimeout(3_000);                                  // anything the viewer would have started lazily
  expect(urls.filter((u) => MAIN.test(u))).toEqual([]);
  expect(urls.filter((u) => /maps\/index\.json|\/rooms(\?|$)/.test(u))).toEqual([]);
  expect(rooms).toBe(0);
  // GM-16b, then the flip (GM.R18): every page mounts `#front-end-gpu` beside `#front-end` -- the front end's own sibling,
  // not the viewer, so listed apart. The 4070 run's finding 3: what it shows follows the page's renderer -- on a software
  // adapter (the gate's SwiftShader) L4, absent or in standby; on a hardware renderer present and visible
  // (`frontGpuCanvasFailure`).
  // RC-MENUFLOW-TOUCH (a spec correction): the modern overlay's touch "Menu" button (`../src/modern/overlay` `touchMenu`,
  // `button.mu-touch-menu`, no id) is the page's own on a device that reports touch -- a coarse pointer or any touch point
  // (a touch laptop, shadow's cloud VM) -- and absent elsewhere; it is expected by that reading, not filtered out.
  // Was: the list fixed at a host with no touch (shadow's A4500 run at d628ce86e: an extra "button#").
  const page_ = await page.evaluate(() => ({
    view: document.getElementById('view'),
    hook: typeof (window as unknown as { __viewer?: unknown }).__viewer,
    children: [...document.body.children].filter((e) => e.id !== 'front-end-gpu')
      .map((e) => (e.classList.contains('mu-touch-menu') ? 'button.mu-touch-menu' : `${e.tagName.toLowerCase()}#${e.id}`)),
    touch: matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0,
    black: document.body.classList.contains('ps2-look') && getComputedStyle(document.body).backgroundColor,
    size: (() => { const c = document.getElementById('front-end') as HTMLCanvasElement; return [c.width, c.height]; })(),
  }));
  const { touch, ...seen } = page_;
  expect(seen).toEqual({
    view: null, hook: 'undefined', black: 'rgb(0, 0, 0)', size: [640, 448],
    children: ['canvas#front-end', 'div#menu-touch', ...(touch ? ['button.mu-touch-menu'] : [])],
  });
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return r;
  });
  const gpuCanvas = (): Promise<FrontGpuCanvasState> => page.evaluate(() => { const g = document.getElementById('front-end-gpu'); return g ? { standby: g.classList.contains('s2u-ui-gpu-standby'), visibility: getComputedStyle(g).visibility } : 'absent' as const; });
  await expect.poll(async () => frontGpuCanvasFailure(renderer, await gpuCanvas()), { timeout: 30_000 }).toBeNull();
  await expect(page.locator('#menu-touch')).toBeHidden(); // a desktop without touch keeps its controller input
  expect(errors).toEqual([]);
}

test('the base path, no parameter but ?devmode: the front end alone -- main.ts never loads, no map list, no rooms, no #view', async ({ page }) => {
  await frontEndAlone(page, `${FRONT_END}?devmode`);
});

test('a match\'s parameters at the base path are read by nothing: still the front end alone, no map, no match', async ({ page }) => {
  await frontEndAlone(page, `${FRONT_END}?devmode&mode=play&map=MP2&fly&noarmory&kit=62,15,121,126,255`);
});

test('/testroom: the viewer boots as before -- main.ts, the map list, #view, the hook; the front end never mounted', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const urls = requests(page);
  await page.goto(`${TEST_ROOM}?devmode&fly`);
  await expect(page.locator('#status')).toContainText(/triangles|tris/);
  expect(urls.some((u) => MAIN.test(u))).toBe(true);
  expect(urls.some((u) => /\/maps\/index\.json/.test(u))).toBe(true);
  expect(await page.evaluate(() => ({
    path: location.pathname,
    view: document.getElementById('view')?.tagName,
    frontEnd: document.getElementById('front-end'),
    hook: typeof window.__viewer.stats,
    map: window.__viewer.stats().map,
  }))).toEqual({ path: '/testroom', view: 'CANVAS', frontEnd: null, hook: 'function', map: 'FROSTFIRE' });
  expect(errors).toEqual([]);
});
