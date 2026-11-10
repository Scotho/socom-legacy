import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { main as menuGpuCompare } from '../../../tools/menu-gpu-compare';
import { until } from './frontEndWalk';
import { uiGpuGlLeg, uiGpuGlRefusal, uiGpuLaunchOptions } from './uiGpuGl';
import type { UiGpuMenuFrameDrawn, UiGpuMenuFrames } from './uiGpuMenuFramesPage';
import {
  drawDialogMatchFailures, gpuFrameFailures, menuFrameEntries, menuFrameFileName, menuFrameHeader, menuFramePages, menuFramesDiscCandidates, menuFramesEnv, menuFramesUnjudged, menuFramesVerdict, menuFrameUrl, type MenuFrameEntry,
} from './uiGpuMenuFramesRecord';
import { countDifferingBytes, encodeFrameFile } from './uiGpuParityRecord';

/**
 * GM-31 leg 1 (the GPU menus plan, row GM-31; research 380 §1, the C class; GM-11c's tool): **the menus' C-row frames
 * from the GPU canvas.** The real front end over the served disc tree, its menus drawn by the front end's GPU surface
 * (`?uiGpu=on&uiGpuSurface=front`), writes GM-11c's three frames (`MENU_C_FRAMES`: `dlgMenu.rdr`,
 * `dlgMenu.rdr hide LoadGameBack`, `dlgCreateGame.rdr`) as frame files, and `tools/menu-gpu-compare.ts` scores them on
 * the nine capture rows (`MENU_C_ROWS`). Until now no browser run wrote those frames, so "C rows unchanged" on a GPU
 * frame was unmeasured (GM-11c's Log). Product track, a test instrument: our GPU drawer against our software drawer and
 * the rows' own pins; nothing of the game changes.
 *
 * **The frame** is the Node scorer's (`tools/test/menuCaptureFrames.ts` `drawDialog`): the dialog as built, MENUFADER at
 * 0, no script, no tick, no movie picture, no models, composed once, drawn through the page's presenter at scale 1
 * (`./uiGpuMenuFramesPage.ts`, which says what is the page's and what is the scorer's). It does not depend on the
 * page's tick, so no tick is matched: the page is only waited on until the deep-linked dialog is up and settled and
 * (the GPU leg) its own frames are on the GPU.
 *
 * Per dialog page (`dlgMenu.rdr`, `dlgCreateGame.rdr`; the deep link `menuflow=<dialog>`, scale 1, no HD pack):
 * 1. **the software leg** (`uiGpu=off`): each frame through the page's 2D canvas presenter (`CpuUiPresenter`), read back
 *    -- asserted equal, byte for byte and in its `undrawn` list, to **`drawDialog` itself, run in the spec's Node process
 *    on the disc** (`SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; review F1: the proof that the page drew the scorer's
 *    frame, before any GPU comparison or score; the hidden-node frame compares bytes only, `hideRgba` returns no list)
 *    -- and written as `<frame>.<blend>.cpu.rgba` for each blend leg;
 * 2. **the GPU leg**, per blend (`S2U_UI_GPU_MENU_FRAMES_BLENDS`, default `exact,ff`; `uiGpuBlend=<blend>`): each frame
 *    through the front end's GPU surface, read back by `readFrame()` (GM-09's seam) -- asserted **the GPU path's** (the
 *    surface's last present drew on the GPU, `window.__uiGpu.levels` counted one L0 frame across it and no L1-L4,
 *    640 x 448) -- and written as `<frame>.<blend>.gpu.rgba`. The same frame **on the software path**: the GPU page's
 *    in-page software frame of the list is asserted equal, byte for byte, to the software leg's frame (the same frame
 *    in two pages, whatever their ticks). The GPU frame's differing bytes against it are recorded (B), not asserted:
 *    the C rows judge it;
 * 3. **the score**: `tools/menu-gpu-compare.ts --frames <out> --out <out>/compare` (its exported `main`; the rows'
 *    references under `SOCOM_PC_ROOT`, read only). The test fails on any exit but 0 -- a C-row fail (1), a bad input
 *    (4), **nothing scored (3)** -- and on any row not passed on a GPU frame and on the software frame
 *    (`menuFramesVerdict`). A GPU frame passing them is GM-17's "C rows unchanged" on that renderer.
 *
 * Kinds of evidence, apart: the frames are a rendered browser run's; the score is a capture comparison (kept apart in the
 * record). The renderer is `./uiGpuGl.ts`'s (SwiftShader by default, the page told to allow it; `S2U_UI_GPU_GL=native`
 * for the host's GL or GPU, refused when it still reports SwiftShader); neither is a claim about a player's GPU.
 *
 * **On demand**: skipped unless `S2U_UI_GPU_MENU_FRAMES_OUT` names the frames' directory (outside `socomlegacy/test-results`;
 * a fresh one per run); skipped without the served tree (`public/maps/index.json`: `npm run extract-maps`). From
 * `socomlegacy/`, against the run's own dev server:
 * `E2E_PORT=5311 S2U_UI_GPU_MENU_FRAMES_OUT=<dir> SOCOM_PC_ROOT=<desktop tree> [SOCOM_DISC=<disc>] npx playwright test uiGpuMenuFrames.spec.ts`.
 * Written there besides the frames: `frames.jsonl` (one line per frame drawn), `renderer.json`, and the tool's
 * `compare/menu-gpu-compare.json` and `.md`.
 */

const WEB = fileURLToPath(new URL('../../..', import.meta.url));
const MAPS = join(WEB, 'public', 'maps');
const ENV = menuFramesEnv(process.env, WEB);
const LEG = uiGpuGlLeg();
const PAGES = menuFramePages(menuFrameEntries());
const PAGE_MODULE = '/e2e/uiGpuMenuFramesPage.ts';

test.skip(ENV.out === null, 'S2U_UI_GPU_MENU_FRAMES_OUT is not set: GM-31\'s menu frames run on demand (the served tree, SOCOM_PC_ROOT)');
test.skip(!existsSync(join(MAPS, 'index.json')), 'the served tree is absent: npm run extract-maps');
test.describe.configure({ mode: 'serial' });
test.use({ launchOptions: uiGpuLaunchOptions() });
test.setTimeout(600_000);

const OUT = ENV.out ?? '';
/** The software leg's frames, by frame name: what the GPU page's in-page software frame is held to. */
const softwareFrames = new Map<string, Uint8Array>();
const bytes = (b64: string): Uint8Array => new Uint8Array(Buffer.from(b64, 'base64'));

/** The deep-linked dialog up and settled; on the GPU leg its own frames on the GPU (an L0 frame counted); the page module in. */
async function openPage(page: Page, dialog: string, leg: 'gpu' | 'software', blend: 'exact' | 'ff'): Promise<string> {
  const url = menuFrameUrl(dialog, leg, blend);
  await page.goto(url);
  await until(page, dialog, (s) => s.dialog === dialog && s.ready && !s.popup, 240_000);
  if (leg === 'gpu') {
    await expect.poll(() => page.evaluate(() => {
      const r = (window as unknown as { __uiGpu?: { levels: Record<string, number> } }).__uiGpu;
      const s = (window as unknown as { __frontEnd?: { session: { presenter: { kind?: string } | null } } }).__frontEnd?.session;
      return (r?.levels['L0'] ?? 0) > 0 && s?.presenter?.kind === 'gpu-surface';
    }), { timeout: 120_000, message: `${url}: the front end draws on its GPU surface (window.__uiGpu.levels.L0 > 0)` }).toBe(true);
  }
  // A settled dialog: two seconds more for its banks and fonts (the frame drawn below names only what the page holds).
  await page.waitForTimeout(2_000);
  // The page module from the run's Vite server, as the harness page imports `./uiGpuHarness.ts` (a module script).
  await page.addScriptTag({
    type: 'module',
    content: `import { installUiGpuMenuFrames } from "${PAGE_MODULE}";`
      + 'try { installUiGpuMenuFrames(); } catch (e) { window.__uiGpuMenuFramesError = String(e && e.stack || e); }',
  });
  await page.waitForFunction(() => {
    const w = window as unknown as Record<string, unknown>;
    return (w['__uiGpuMenuFrames'] as UiGpuMenuFrames | undefined)?.ready === true || typeof w['__uiGpuMenuFramesError'] === 'string';
  }, null, { timeout: 60_000 });
  const error = await page.evaluate(() => (window as unknown as Record<string, unknown>)['__uiGpuMenuFramesError'] as string | undefined);
  expect(error, `${PAGE_MODULE} installed on the front end's page`).toBeUndefined();
  return url;
}

/**
 * Review F1: `drawDialog` (`tools/test/menuCaptureFrames.ts`, Node-only: it reads the disc through `FsAssetSource`) run
 * in the spec's process, imported here and not at the top so the spec loads where it is skipped. The disc is the first
 * of `menuFramesDiscCandidates` that holds the fonts archive; none is a failure by name (the leg needs the disc).
 */
async function drawDialogNode(dialog: string) {
  const [{ drawDialog }, { FONTS_RDR }] = await Promise.all([import('../../../tools/test/menuCaptureFrames'), import('@s2u/scene')]);
  const tried = menuFramesDiscCandidates(process.env);
  const disc = tried.find((d) => existsSync(join(d, FONTS_RDR.archive)));
  if (!disc) throw Error(`drawDialog needs the disc: none of ${JSON.stringify(tried)} (SOCOM_DISC, <SOCOM_PC_ROOT>/game/disc) holds ${FONTS_RDR.archive}`);
  return drawDialog(disc, dialog);
}

const draw = (page: Page, e: MenuFrameEntry): Promise<UiGpuMenuFrameDrawn> =>
  page.evaluate((o) => (window as unknown as Record<string, UiGpuMenuFrames>)['__uiGpuMenuFrames']!.draw(o), { frame: e.frame, dialog: e.dialog, hide: e.hide });

const record = (line: Record<string, unknown>): void => {
  mkdirSync(OUT, { recursive: true });
  appendFileSync(join(OUT, 'frames.jsonl'), `${JSON.stringify({ when: new Date().toISOString(), ...line })}\n`);
};
const summary = (d: UiGpuMenuFrameDrawn): Record<string, unknown> => {
  const { shown: _s, reference: _r, ...rest } = d;
  return rest;
};

test.describe('GM-31: the menus\' C-row frames from the GPU canvas, scored by GM-11c\'s tool', () => {
  for (const pg of PAGES) {
    test(`software leg: ${pg.frames.map((f) => f.frame).join(', ')} (uiGpu=off)`, async ({ page }, info) => {
      // Review F1: drawDialog itself, in this (Node) process, from the disc -- the frame the rows' pins were taken on.
      const node = await drawDialogNode(pg.dialog);
      const url = await openPage(page, pg.dialog, 'software', 'exact');
      for (const e of pg.frames) {
        const d = await draw(page, e);
        record({ leg: 'software', url, ...summary(d) });
        info.annotations.push({ type: 'software', description: `${e.frame}: ${d.presenter}, ${d.width} x ${d.height}, ${d.differ} bytes differ from the page's own rasterizeUiDrawList; undrawn ${d.undrawn.length}` });
        expect(d.current, `${e.frame}: the deep-linked dialog is the page's`).toBe(e.dialog);
        expect(d.presenter, `${e.frame}: the page's software presenter`).toBe('cpu');
        expect([d.width, d.height], `${e.frame}: scale 1`).toEqual([640, 448]);
        expect(d.differ, `${e.frame}: the page's software path draws its list as rasterizeUiDrawList does`).toBe(0);
        const rgba = bytes(d.shown);
        // Before any GPU comparison or score: the page's frame is drawDialog's, byte for byte, and undrawn alike.
        const theirs = e.hide === null ? { rgba: node.rgba, undrawn: node.undrawn } : { rgba: node.hideRgba(e.hide), undrawn: null };
        expect(drawDialogMatchFailures({ rgba, undrawn: d.undrawn }, theirs), `${e.frame}: the page drew the Node scorer's frame (tools/test/menuCaptureFrames.ts drawDialog)`).toEqual([]);
        softwareFrames.set(e.frame, rgba);
        mkdirSync(OUT, { recursive: true });
        for (const blend of ENV.blends) {
          writeFileSync(join(OUT, menuFrameFileName(e.stem, blend, 'cpu')), encodeFrameFile(menuFrameHeader(e, { blend, which: 'cpu', path: 'software', renderer: null }), rgba));
        }
      }
    });
  }

  for (const blend of ENV.blends) for (const pg of PAGES) {
    test(`GPU leg (${blend}): ${pg.frames.map((f) => f.frame).join(', ')}`, async ({ page }, info) => {
      const url = await openPage(page, pg.dialog, 'gpu', blend);
      for (const e of pg.frames) {
        const d = await draw(page, e);
        record({ leg: 'gpu', blend, url, ...summary(d) });
        expect(uiGpuGlRefusal(LEG, d.renderer), 'the native GL leg runs on the host\'s GL').toBeNull();
        if (!existsSync(join(OUT, 'renderer.json'))) writeFileSync(join(OUT, 'renderer.json'), JSON.stringify({ when: new Date().toISOString(), requested: LEG.requested, args: LEG.args, renderer: d.renderer }, null, 2));
        info.annotations.push({ type: 'gpu', description: `${e.frame} (${blend}): path ${d.path}, renderer ${d.renderer}, blend read ${d.blend}, ${d.differ} bytes differ from the in-page software frame, presents ${d.presents}` });
        expect(d.current, `${e.frame}: the deep-linked dialog is the page's`).toBe(e.dialog);
        expect(d.blend, `${e.frame}: the front surface's blend at scale 1 is the one asked`).toBe(blend);
        expect(gpuFrameFailures(d), `${e.frame} (${blend}): the frame is the GPU path's (L0)`).toEqual([]);
        // The same frame on the software path: this page's software frame of the list against the software leg's.
        const sw = softwareFrames.get(e.frame);
        expect(sw, `${e.frame}: the software leg drew it first`).toBeDefined();
        const same = countDifferingBytes(bytes(d.reference), sw!, 640);
        expect(same.differ, `${e.frame}: the GPU page's software frame is the software leg's (first ${JSON.stringify(same.first)})`).toBe(0);
        mkdirSync(OUT, { recursive: true });
        writeFileSync(join(OUT, menuFrameFileName(e.stem, blend, 'gpu')), encodeFrameFile(menuFrameHeader(e, { blend, which: 'gpu', path: d.path, renderer: d.renderer }), bytes(d.shown)));
      }
    });
  }

  test('the score: tools/menu-gpu-compare.ts on the frames, every C row passed on the GPU frames and the software frames', async ({}, info) => {
    const said: string[] = [];
    const compare = join(OUT, 'compare');
    const exit = await menuGpuCompare(['--frames', OUT, '--out', compare, ...(ENV.root ? ['--root', ENV.root] : [])], { log: (s) => said.push(s) });
    info.annotations.push({ type: 'menu-gpu-compare', description: `exit ${exit}\n${said.join('\n')}` });
    const json = join(compare, 'menu-gpu-compare.json');
    const lines = existsSync(json) ? (JSON.parse(readFileSync(json, 'utf8')) as { lines: Parameters<typeof menuFramesVerdict>[1] }).lines : [];
    // The 4070 run's finding 2: the rows judged on the blend the landed table draws at scale 1 (`exact`); the other
    // blend's GPU frames scored and recorded here, unjudged.
    const other = menuFramesUnjudged(lines);
    if (other.length) info.annotations.push({ type: 'menu-gpu-compare unjudged', description: other.join('\n') });
    expect(menuFramesVerdict(exit, lines), `the C rows on the frames (${said.at(-1) ?? ''})`).toEqual([]);
  });
});
