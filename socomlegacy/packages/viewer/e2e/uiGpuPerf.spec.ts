import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { UI_PERF_COLD_SWITCH_ADAPTATION, UI_PERF_SLOW_FRAME_MS, coldSwitchVerdict } from '../src/uiGpuPerf';
import type { UiPerfSample, UiPerfSpread, UiPerfSummary, UiPerfSwitch } from '../src/uiGpuPerf';
import { at, focusOn, key, pressUntil, seen, until, type Hooked, type Seen } from './frontEndWalk';
import { UI_PERF_NATIVE_GL_ARGS, popupSlotFor, uiPerfGlRefusal } from './uiPerfLeg';
import { SETUP } from './urls';

/**
 * GM-02 (plan 2026-11-01-gpu-menus, "Performance"; research 380 §6): the browser **baseline** of today's SOFTWARE menu
 * path -- the software leg of the plan's `uiGpuPerf.spec.ts` (the GPU leg comes with the GPU path). An instrument run, a
 * browser adaptation: it measures and asserts nothing about the game; every number is a rendered browser run's on the
 * run's host and renderer -- perf, never a parity claim. SwiftShader and llvmpipe numbers are labelled not
 * representative of a player's GPU (the plan's protocol).
 *
 * Per scale (`S2U_UI_PERF_SCALES`, default 1,2,4), one page each:
 * - **scale 1** is today's path for every player: `/setup?devmode&uiPerf&hdMenuScale=1&menuflow=dlgMenu.rdr` -- the ring
 *   only (`../src/uiGpuPerf.ts`), the menus' HD path off as HD-HOLD keeps it.
 * - **scales 2 and 4** add `&uiPerfHd&hdMenuScale=<s>`: on a development build under `?devmode` only, the menus' HD path
 *   (`../src/hdMenuTextures.ts` `HdMenus`, today's 4x software path) is turned on for the measurement whatever the
 *   picture (`../src/frontEnd.ts` `menusHd`), at the served pack's scale capped by `hdMenuScale`. The picture stays
 *   MODERN, nothing is stored, the world is untouched, HD (GoE Soul) is still not offered. It needs the HD pack served
 *   at `public/experimental-packs/hd/` (git-ignored; the box job copies it in); without it those scales are skipped, said.
 *
 * The walk (the page's keys: the arrows, Enter = CROSS, Backspace = TRIANGLE; `./frontEndWalk`):
 * 1. **dlgMenu idle** -- the main menu over MENULOOP with the roller, `S2U_UI_PERF_DWELL_MS` (default 20 s);
 * 2. **dialogs** -- OPTIONS, VIDEO, back to OPTIONS (a warm switch), CONTROLLER OPTIONS, back, back to the main menu.
 *    Each way back is the dialog's own, waited on by state (the dialog, the focus, the popup), never a fixed delay:
 *    VIDEO and CONTROLLER OPTIONS leave by their RETURN (`SaveAndLeaveBtn`, CROSS), as `originalSettings.spec.ts`
 *    leaves them -- their TRIANGLE (`OnVideoBack`, `OnContSelectBack`) raises the discard prompt `AreYouSure`, and
 *    `OnVideoBack`'s `CompareValues` raises it always (research 302); OPTIONS leaves by TRIANGLE (`Triangle_Back`),
 *    its `AreYouSure` prompt answered YES (research 118 section 4), when it comes up;
 * 3. **CREATE GAME** -- a fresh page at `menuflow=dlgCreateGame.rdr` (no login or server here, so it is a deep link,
 *    not reached from the main menu: said in the record), idle, CHOOSE GAMES' PLAY LIST stepped through four maps
 *    (each a CG picture), the list closed by SQUARE (`accept_play_list` -> `close_missionsel_popup`, the focus back on
 *    CHOOSE GAMES; research 164 section 4 -- its TRIANGLE raises #811's clear-the-list prompt instead), then TRIANGLE
 *    (the dialog reached is recorded, not asserted);
 * 4. **the loading screen** -- on that page, the menus held as a match holds them (`frontEnd.ts` `leave`: the canvas
 *    hidden, `holdMenus(true)`) and a `LoadingPanel` made as `frontEnd.ts` makes it for a lobby match (with the same
 *    factory's `HdMenus` at the same scale), shown for MP72 -- not through a lobby match (that needs the match server
 *    and a login), as the HD-4 capture did. Its draw is timed by wrapping the panel's own draw (the spec's instrument).
 *    The panel and the held menus are recorded apart: the panel's draw and the interval between its draws, and the
 *    menus' own frames, raster and lost time over the same window with the dialog and popup they hold. At scale 1 the
 *    page draws the held menus every tick (`frontEnd.ts` `drawsMenuFrame`), so the panel's interval carries their raster.
 *
 * A walk error does not stop the run: it is recorded on its scale, every segment from it on (and the loading screen)
 * marked suspect, and the next scale is measured; the last test fails when any scale recorded an error. The native
 * GL leg (`S2U_UI_PERF_GL=native`) is refused up front when the browser still reports SwiftShader (`./uiPerfLeg.ts`).
 *
 * Per segment: `UiClock.lostSeconds` per wall minute, animation-frame ms (p50/p95/max) and frames over 33.4 ms,
 * `composeScreen` per tick and the rest of the ticks' work (the shells, widgets, lobby and clock) per tick apart, raster
 * and present (`putImageData`, today's upload) ms, movie pictures per second, long tasks, the JS heap. Per dialog
 * switch: cold (first visit) or warm, the HD answers and the time until the last, the frames and lost time until
 * settled, the first frame's raster and present (`../src/uiGpuPerf.ts` `dialogSwitches`). The record names the host
 * (CPU, memory, OS), the browser and its WebGL renderer string, the requested renderer, the build's sha and the
 * viewport, and is written as JSON and a short markdown table to `S2U_UI_PERF_OUT` (default `test-results/ui-gpu-perf`).
 *
 * On demand only (`S2U_UI_PERF=1`): heavy and serial; the main config's run of every spec skips it, said. Run it with
 * `playwright.perf.config.ts` against a dev server the job started (its README:
 * `C:/Projects/agent-mail/evidence/gpu-menus/gm02/`). The served tree with the movies (`extract-maps --with-streams`)
 * is required: without `MENULOOP.PSS` the main menu is black and the pictures-per-second figure is 0 (recorded).
 *
 * **GM-16: the GPU leg** (`S2U_UI_PERF_LEG=gpu`; default the software leg). The same walk with the front end's frames
 * drawn on the GPU (`&uiGpu=on&uiGpuSurface=front&uiGpuAllowSoftwareAdapter=1`: the gate's renderers are software
 * adapters, so the page lets them through -- nothing here is a claim about a player's GPU); the software leg names
 * `&uiGpu=off` so a development build's GM-16b shadow never reaches the baseline. The page is checked to draw on the
 * GPU (`window.__uiGpu.levels.L0` > 0, `#front-end-gpu` shown) before a scale is measured, and the records are written
 * as `gm16*` beside the software leg's `gm02*`. Its own test asserts **GM-02b's cold-switch target** (the plan,
 * "Performance", the targets; research 380 §6.2): on every cold dialog switch with HD answers at 2x and 4x, no animation
 * frame over 50.0 ms and 0.00 s lost (`UI_PERF_COLD_SWITCH_ADAPTATION`, `coldSwitchVerdict`); GM-13b's 33.4 ms aim is
 * reported (met or missed, per switch), never asserted. The guard's frames (GM.R11) are kept out of every lost-seconds
 * figure by the ring (`summarizeUiPerf`, `dialogSwitches`) and listed; the `on` leg runs no guard, so the list is empty
 * unless a shadow surface ran. Run it on the box, after the host lock's check, one browser: see the plan's Log for the
 * command and the env (SwiftShader by default, `S2U_UI_PERF_GL=native` for llvmpipe).
 */

const WEB = fileURLToPath(new URL('../../..', import.meta.url));
const MAPS = join(WEB, 'public', 'maps');
const PACK = join(WEB, 'public', 'experimental-packs', 'hd', 'current.json');
const RUN = process.env['S2U_UI_PERF'] === '1';
const OUT = process.env['S2U_UI_PERF_OUT'] || join(WEB, 'test-results', 'ui-gpu-perf');
const SCALES = (process.env['S2U_UI_PERF_SCALES'] || '1,2,4').split(',').map((s) => Number(s.trim())).filter((s) => [1, 2, 3, 4].includes(s));
const DWELL_MS = Number(process.env['S2U_UI_PERF_DWELL_MS'] || 20_000);
const MAP = 'mp72';
/** GM-16: the leg -- `software` (GM-02's baseline, today's path named `uiGpu=off`) or `gpu` (the front end on the GPU). */
const LEG: 'software' | 'gpu' = process.env['S2U_UI_PERF_LEG'] === 'gpu' ? 'gpu' : 'software';
const LEG_KEYS = LEG === 'gpu' ? '&uiGpu=on&uiGpuSurface=front&uiGpuAllowSoftwareAdapter=1' : '&uiGpu=off';
/** The records' prefix: GM-02's for the software leg, GM-16's for the GPU leg. */
const TAG = LEG === 'gpu' ? 'gm16' : 'gm02';

test.skip(!RUN, 'S2U_UI_PERF=1 is not set: GM-02\'s baseline runs on demand only (heavy, serial; playwright.perf.config.ts)');
test.skip(!existsSync(join(MAPS, 'index.json')), 'the served tree is absent: npm run extract-maps -- --with-streams');
test.describe.configure({ mode: 'serial' });

interface LongTask { start: number; ms: number }
interface PerfHook {
  now(): number;
  samples(): UiPerfSample[];
  summary(from: number, to: number): UiPerfSummary;
  switches(): UiPerfSwitch[];
  hd(): HdState;
  hdSettled(): Promise<void>;
}
/** The menus' HD state on the page: scale, answers, forced by ?uiPerfHd; GM-13b: where its decode runs (null: HD off). */
interface HdState { scale: number; version: number; forced: boolean; decoder: { mode: 'idle' | 'worker' | 'main'; failure: string | null } | null }
type PerfWindow = Window & { __uiGpuPerf?: PerfHook; __gm02LongTasks?: LongTask[]; __gm02Loading?: { draws: number[]; at: number[] } };

interface Segment {
  name: string; from: number; to: number;
  summary: UiPerfSummary;
  longTasks: { n: number; sumMs: number; maxMs: number };
  heapMB: number | null;
  dialogs: string[];
  /** What the page shows at the window's end (the dialog, the focus, the popup). */
  end: { dialog: string; focused: string | null; popup: boolean } | null;
  /** Null, or why the numbers are suspect: a walk error on this scale in or before this window. */
  suspect: string | null;
}
interface LoadingRecord {
  wallSeconds: number; canvas: string | null; drawMs: UiPerfSpread; frameMs: UiPerfSpread; slowFrames: number;
  menusLostSecondsPerMinute: number; longTasks: { n: number; sumMs: number; maxMs: number }; stats: unknown;
  /** The held menus over the same window, apart from the panel: their own frames, raster and what they hold. */
  menus: { dialog: string; popup: boolean; frameMs: UiPerfSpread; slowFrames: number; rasterMs: UiPerfSpread; drawnPerSecond: number } | null;
  suspect: string | null;
}
interface ScaleRecord {
  scale: number; url: string; canvas: string | null; hd: HdState | null;
  /** GM-13b: the HD state at the walk's end (the decoder's mode once its first request ran). */
  hdAfter: HdState | null;
  segments: Segment[]; switches: { page: string; list: UiPerfSwitch[]; gpu: Awaited<ReturnType<typeof gpuState>> | null }[]; loading: LoadingRecord | null;
  createGameBack: string | null; notes: string[]; errors: string[];
  /** GM-16: the GPU leg's read-out at the walk's end (null on the software leg). */
  gpu?: Awaited<ReturnType<typeof gpuState>> | null;
}

const results: ScaleRecord[] = [];
let host: Record<string, unknown> | null = null;

const hook = (p: Page) => p.evaluate(() => !!(window as PerfWindow).__uiGpuPerf);
const now = (p: Page) => p.evaluate(() => (window as PerfWindow).__uiGpuPerf!.now());
/** The size of the canvas the leg's frames go to: `#front-end` (software), `#front-end-gpu` (GM-16's GPU leg). */
const canvasSize = (p: Page) => p.evaluate((id) => { const c = document.getElementById(id) as HTMLCanvasElement | null; return c ? `${c.width}x${c.height}` : null; }, LEG === 'gpu' ? 'front-end-gpu' : 'front-end');
/** GM-16c: the read-out's `refusals` (`UiGpuSwitch.refused`): why frames were L1 -- the last refusal and each reason's frames. */
type GpuRefusals = { last: { surface: string; why: string[]; at: number } | null; counts: Record<string, number> };
/**
 * GM-16: the GPU leg's read-out (`window.__uiGpu`): the ladder's levels, the kills, whether `#front-end-gpu` shows, and
 * GM-16c's refusals (null on a page before GM-16c).
 */
const gpuState = (p: Page) => p.evaluate(() => {
  const r = (window as unknown as { __uiGpu?: { levels: Record<string, number>; kills: unknown[]; guard?: unknown; refusals?: GpuRefusals } }).__uiGpu;
  const c = document.getElementById('front-end-gpu') as HTMLCanvasElement | null;
  return {
    levels: r?.levels ?? {}, kills: r?.kills ?? [], guard: r?.guard ?? null, refusals: r?.refusals ?? null,
    shown: !!c && !c.hidden && getComputedStyle(c).visibility !== 'hidden',
  };
});

/**
 * GM-16c: a line saying why no L0 frame came -- the levels, the kills, whether the GPU canvas shows, the last refusal
 * (surface, the L1 frame it was, its reasons) and the five most counted reasons. A test instrument's message only.
 */
const gpuWhyLine = (g: Awaited<ReturnType<typeof gpuState>> | null): string => {
  if (!g) return 'the read-out (window.__uiGpu) could not be read';
  const top = Object.entries(g.refusals?.counts ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w, n]) => `${n} x "${w}"`);
  const last = g.refusals?.last;
  return `levels ${JSON.stringify(g.levels)}, kills ${JSON.stringify(g.kills)}, #front-end-gpu ${g.shown ? 'shown' : 'not shown'}; ` +
    (g.refusals === null ? 'no refusals on the read-out (a page before GM-16c)' :
      `last refusal: ${last ? `${last.surface} at L1 frame ${last.at}: ${last.why.length ? last.why.join('; ') : '(no reason given)'}` : 'none'}; ` +
      `top refusals: ${top.length ? top.join(', ') : 'none'}`);
};

/** Null, or why this scale's numbers from here on are suspect: its first walk error. */
const suspectOf = (r: ScaleRecord): string | null => (r.errors.length ? `after the walk error "${r.errors[0]!.slice(0, 160)}"` : null);
const endOf = async (p: Page): Promise<Segment['end']> => {
  const s = await seen(p).catch(() => null);
  return s ? { dialog: s.dialog, focused: s.focused, popup: s.popup } : null;
};

/** The window's numbers off the page: the ring's summary, the long tasks in it, the heap at its end, the dialogs seen. */
async function segment(p: Page, name: string, from: number, to: number): Promise<Omit<Segment, 'end' | 'suspect'>> {
  return p.evaluate(({ name, from, to }) => {
    const w = window as PerfWindow, h = w.__uiGpuPerf!;
    const lt = (w.__gm02LongTasks ?? []).filter((t) => t.start >= from && t.start <= to);
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const dialogs = [...new Set(h.samples().filter((s) => s.t >= from && s.t <= to).map((s) => s.dialog))];
    return {
      name, from, to, summary: h.summary(from, to), dialogs,
      longTasks: { n: lt.length, sumMs: lt.reduce((a, t) => a + t.ms, 0), maxMs: Math.max(0, ...lt.map((t) => t.ms)) },
      heapMB: mem ? mem.usedJSHeapSize / 1048576 : null,
    };
  }, { name, from, to });
}

/** Runs `step` and records its window as a segment (the step's error recorded, the window kept). */
async function measured(p: Page, r: ScaleRecord, name: string, step: () => Promise<void>): Promise<boolean> {
  const from = await now(p);
  let ok = true;
  try { await step(); } catch (e) { ok = false; r.errors.push(`${name}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`); }
  const to = await now(p);
  r.segments.push({ ...(await segment(p, name, from, to)), end: await endOf(p), suspect: suspectOf(r) });
  return ok;
}

/** The popup's state as the walk reads it: its buttons' captions as drawn and the focused slot (`Popup.answer`). */
const popupButtons = (p: Page) => p.evaluate(() => {
  const o = (window as Hooked).__frontEnd?.session.machine.queue.popupObject as unknown as {
    popup?: { answer: number; text: { lines: { bytes: number[] }[] }; buttons: { captionCodes: number[]; size: number[] }[] };
  } | null;
  const pp = o?.popup;
  return pp ? {
    answer: pp.answer,
    captions: pp.buttons.map((b) => (b.size[0] ?? 0) > 0 ? String.fromCharCode(...b.captionCodes) : ''),
    text: pp.text.lines.map((l) => String.fromCharCode(...l.bytes)).join(' ').replace(/\s+/g, ' ').trim(),
  } : null;
});

/**
 * One way back from `from` to `to` by TRIANGLE, waited on by state: the press, then either `to` settled or the
 * dialog's prompt up (`AreYouSure`); a prompt answered `answer` (LEFT/RIGHT moves the focused slot, read after each
 * press; CROSS answers), then `to` settled. TRIANGLE is pressed again only while `from` stays settled with no prompt
 * (an input hold that swallowed it) -- never while a prompt is up, where TRIANGLE would answer it.
 */
async function backThrough(p: Page, from: string, to: string, answer = 'YES'): Promise<void> {
  const what = `${to} from ${from} by TRIANGLE`;
  let s: Seen | null = null;
  for (let i = 0; i < 4; i++) {
    await key(p, 'Backspace');
    try { s = await until(p, what, (x) => (x.dialog === to && x.ready) || (x.dialog === from && x.popup && x.ready), 6_000); break; } catch { /* swallowed by a hold: again */ }
  }
  if (!s) s = await until(p, what, (x) => (x.dialog === to && x.ready) || (x.dialog === from && x.popup && x.ready), 1_000);
  if (s.dialog === from && s.popup) {
    const b = await popupButtons(p);
    const pick = popupSlotFor(b?.captions ?? [], answer);
    for (let i = 0; i < 2 && (await popupButtons(p))?.answer !== pick.slot; i++) await key(p, 'ArrowRight');
    const got = await popupButtons(p);
    if (got?.answer !== pick.slot) throw new Error(`${what}: the prompt "${b?.text ?? '?'}" (${JSON.stringify(b?.captions)}) would not focus slot ${pick.slot} (${answer}, by ${pick.by}); focused ${got?.answer}`);
    await key(p, 'Enter');
    try { await until(p, `${what}: "${b?.text ?? '?'}" answered ${answer} (slot ${pick.slot}, by ${pick.by})`, (x) => x.dialog === to && x.ready, 15_000); }
    catch (e) { throw new Error(`${e instanceof Error ? e.message.split('\n')[0] : String(e)}; the prompt's buttons ${JSON.stringify(b?.captions)}`); }
  }
  await at(p, to);
}

async function openAt(p: Page, scale: number, dialog: string): Promise<string> {
  const url = `${SETUP}?devmode&uiPerf${scale > 1 ? '&uiPerfHd' : ''}&hdMenuScale=${scale}${LEG_KEYS}&menuflow=${dialog}`;
  await p.goto(url);
  await until(p, dialog, (s) => s.dialog === dialog && s.ready, 240_000);
  expect(await hook(p), 'the page\'s GM-02 ring (window.__uiGpuPerf): a development build under ?devmode&uiPerf').toBe(true);
  if (scale > 1) {
    // The HD route reached: the menus' canvas at the scale (the pack's manifest read, its scale capped by hdMenuScale).
    await expect.poll(() => canvasSize(p), { timeout: 120_000, message: `the menus' canvas at ${scale}x (uiPerfHd)` }).toBe(`${640 * scale}x${448 * scale}`);
  }
  if (LEG === 'gpu') {
    // GM-16: the leg measures the GPU path only once the page draws on it (an L0 frame counted, the GPU canvas shown).
    // GM-16c: a poll that times out says why no L0 frame came -- the read-out's refusals, read once after the failure.
    try {
      await expect.poll(async () => { const g = await gpuState(p); return g.shown && (g.levels['L0'] ?? 0) > 0; },
        { timeout: 120_000, message: 'the front end on the GPU (window.__uiGpu.levels.L0 > 0, #front-end-gpu shown)' }).toBe(true);
    } catch (e) {
      // The why goes on the FIRST line: the scale test's catch and the report keep only `message.split('\n')[0]`
      // (batch 1 review F1: on the second line it reached no output).
      const why = gpuWhyLine(await gpuState(p).catch(() => null));
      const [head, ...rest] = (e instanceof Error ? e.message : String(e)).split('\n');
      throw new Error([`${head} -- GM-16c, why no L0 frame: ${why}`, ...rest].join('\n'));
    }
  }
  await p.evaluate(() => (window as PerfWindow).__uiGpuPerf!.hdSettled());
  await p.waitForTimeout(2_000);
  return url;
}

const switchesOf = (p: Page) => p.evaluate(() => (window as PerfWindow).__uiGpuPerf!.switches());
/**
 * A measured page's switches with ITS GPU read-out, taken before the walk leaves the document: `openAt` loads a fresh
 * page, which resets `pageUiGpuSwitch()`'s levels and kills, so a read after the next page's load cannot vouch for
 * this one (#679 Codex P2: a software-fallback main-menu walk passed on CREATE GAME's read-out).
 */
const pageRecord = async (p: Page, page: string) => ({
  page, list: await switchesOf(p), gpu: LEG === 'gpu' ? await gpuState(p).catch(() => null) : null,
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as PerfWindow;
    w.__gm02LongTasks = [];
    try {
      new PerformanceObserver((list) => { for (const e of list.getEntries()) w.__gm02LongTasks!.push({ start: e.startTime, ms: e.duration }); })
        .observe({ type: 'longtask', buffered: true });
    } catch { /* no long-task timing in this browser: the record's long tasks read 0, said in its host block */ }
  });
});

test.beforeAll(async ({ browser }) => {
  // The native GL leg's precondition: refused loudly, before any scale, when the browser still reports SwiftShader.
  const p = await browser.newPage();
  try {
    const gl = await webglOf(p);
    const refusal = uiPerfGlRefusal(process.env['S2U_UI_PERF_GL'], gl.renderer);
    if (refusal) throw new Error(`GM-02 precondition: ${refusal}`);
  } finally { await p.close(); }
});

test.afterAll(() => {
  if (!results.length) return;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${TAG}.json`), JSON.stringify({ host, results }, null, 2));
  writeFileSync(join(OUT, `${TAG}.md`), markdown(host, results));
});

for (const scale of SCALES) {
  test(`${LEG === 'gpu' ? 'GM-16 GPU leg' : 'GM-02 software baseline'} at scale ${scale}: the menu walk, CREATE GAME and the loading screen`, async ({ page, browser }) => {
    test.skip(scale > 1 && !existsSync(PACK), `scale ${scale} needs the HD pack served at public/experimental-packs/hd/ (git-ignored; the job copies it in)`);
    test.setTimeout(20 * 60_000);
    const r: ScaleRecord = { scale, url: '', canvas: null, hd: null, hdAfter: null, segments: [], switches: [], loading: null, createGameBack: null, notes: [], errors: [] };
    results.push(r);
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    if (!existsSync(join(MAPS, 'RUN', 'MOVIES', 'COMMON', 'MENULOOP.PSS'))) r.notes.push('MENULOOP.PSS absent (maps extracted without --with-streams): the menus are black, pictures per second is 0');
    r.notes.push('CREATE GAME is opened by a deep link (menuflow=dlgCreateGame.rdr) on a fresh page: no login or server on this run');
    r.notes.push('the loading screen is a LoadingPanel the page makes as frontEnd.ts does for a lobby match, not one a lobby match launched');
    if (scale <= 1) r.notes.push('at scale 1 the page draws the held menus every tick under the loading screen (frontEnd.ts drawsMenuFrame): the panel\'s draw interval carries their raster; the held menus\' own columns say what they cost');
    r.notes.push(LEG === 'gpu' ? 'GM-16 GPU leg: the front end on the GPU (uiGpu=on, uiGpuSurface=front, uiGpuAllowSoftwareAdapter=1)' : 'software leg: today\'s path (uiGpu=off)');

    // A walk error never stops this scale's record nor the next scale: it is recorded, the segments after it marked
    // suspect, and the last test fails on it once every scale is measured.
    try {
      // 1. The main menu, idle: MENULOOP and the roller.
      r.url = await openAt(page, scale, 'dlgMenu.rdr');
      r.canvas = await canvasSize(page);
      r.hd = await page.evaluate(() => (window as PerfWindow).__uiGpuPerf!.hd());
      host ??= await hostRecord(page, browser.version());
      await measured(page, r, 'dlgMenu idle (MENULOOP + roller)', () => page.waitForTimeout(DWELL_MS));

      // 2. The dialogs: OPTIONS, VIDEO, OPTIONS again (warm), CONTROLLER OPTIONS, back, back to the main menu.
      const OPTIONS = 'dlgOptions_Menu.rdr', VIDEO = 'dlgOptions_Video.rdr', CONTROLLER = 'dlgControllerSelection.rdr';
      const dwell = (ms: number) => page.waitForTimeout(ms);
      await measured(page, r, 'dialogs (OPTIONS, VIDEO, OPTIONS, CONTROLLER, OPTIONS, main menu)', async () => {
        await focusOn(page, 'dlgMenu.rdr', 'options_button');
        await pressUntil(page, 'Enter', 'OPTIONS', (s) => s.dialog === OPTIONS);
        await at(page, OPTIONS); await dwell(5_000);
        await focusOn(page, OPTIONS, 'VideoOpBtn');
        await pressUntil(page, 'Enter', 'VIDEO', (s) => s.dialog === VIDEO);
        await at(page, VIDEO); await dwell(5_000);
        // VIDEO's RETURN (its TRIANGLE, `OnVideoBack`, always raises the discard prompt: research 302).
        await focusOn(page, VIDEO, 'SaveAndLeaveBtn');
        await pressUntil(page, 'Enter', 'OPTIONS again (VIDEO\'s RETURN)', (s) => s.dialog === OPTIONS);
        await at(page, OPTIONS); await dwell(3_000);
        await focusOn(page, OPTIONS, 'ControlOpBtn');
        await pressUntil(page, 'Enter', 'CONTROLLER OPTIONS', (s) => s.dialog === CONTROLLER);
        await at(page, CONTROLLER); await dwell(5_000);
        await focusOn(page, CONTROLLER, 'SaveAndLeaveBtn');
        await pressUntil(page, 'Enter', 'OPTIONS from CONTROLLER', (s) => s.dialog === OPTIONS);
        await at(page, OPTIONS); await dwell(2_000);
        await backThrough(page, OPTIONS, 'dlgMenu.rdr');                 // `Triangle_Back`: its prompt answered YES
        await dwell(5_000);
      });
      r.switches.push(await pageRecord(page, 'dlgMenu.rdr'));

      // 3. CREATE GAME: a fresh page (a deep link), idle, the PLAY LIST through four maps, closed, then TRIANGLE.
      await openAt(page, scale, 'dlgCreateGame.rdr');
      await measured(page, r, 'dlgCreateGame idle', () => dwell(Math.min(DWELL_MS, 10_000)));
      await measured(page, r, 'CREATE GAME: PLAY LIST through four maps, closed, TRIANGLE', async () => {
        await focusOn(page, 'dlgCreateGame.rdr', 'SelectGames');
        await pressUntil(page, 'Enter', 'the PLAY LIST', (s) => s.focused === 'AVAILABLE_MISSIONS' && s.ready);
        for (let i = 0; i < 4; i++) { await key(page, 'ArrowDown'); await dwell(2_000); }
        // SQUARE (`accept_play_list`): the list closed, the focus back on CHOOSE GAMES. TRIANGLE here would raise #811.
        await pressUntil(page, 'KeyV', 'the PLAY LIST closed (SQUARE)', (s) => s.dialog === 'dlgCreateGame.rdr' && s.ready && !s.popup && s.focused !== 'AVAILABLE_MISSIONS');
        await at(page, 'dlgCreateGame.rdr', 'SelectGames');
        await dwell(2_000);
        await key(page, 'Backspace');
        // Where CREATE GAME's TRIANGLE leads with no server is recorded, not asserted: a switch away or a prompt.
        await until(page, 'CREATE GAME\'s TRIANGLE answered', (s) => s.dialog !== 'dlgCreateGame.rdr' || s.popup, 10_000).catch(() => null);
        await until(page, 'settled after CREATE GAME\'s TRIANGLE', (s) => s.ready, 10_000).catch(() => null);
        await dwell(3_000);
        const e = await endOf(page);
        r.createGameBack = e ? `${e.dialog}${e.popup ? ' (a popup up)' : ''}` : null;
      });
      r.switches.push(await pageRecord(page, 'dlgCreateGame.rdr'));

      // 4. The loading screen over the held menus.
      try { r.loading = await loadingScreen(page, scale, suspectOf(r)); } catch (e) { r.errors.push(`loading screen: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`); }
    } catch (e) {
      r.errors.push(`the scale's run stopped: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    }

    r.hdAfter = await page.evaluate(() => (window as PerfWindow).__uiGpuPerf?.hd() ?? null).catch(() => null);
    r.gpu = LEG === 'gpu' ? await gpuState(page).catch(() => null) : null;
    r.errors.push(...pageErrors.map((m) => `page error: ${m}`));
    if (r.segments.length < 4) r.errors.push(`segments measured: ${r.segments.length} of 4`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, `${TAG}-scale${scale}.json`), JSON.stringify({ host, result: r }, null, 2));
  });
}

test(`${LEG === 'gpu' ? 'GM-16' : 'GM-02'}: every scale measured without a walk or page error`, () => {
  const measuredScales = results.map((r) => r.scale);
  expect(measuredScales.length, `scales measured: ${JSON.stringify(measuredScales)}`).toBeGreaterThan(0);
  const errors = results.flatMap((r) => r.errors.map((e) => `scale ${r.scale}: ${e}`));
  expect(errors, 'the walk and the page ran without an error at every scale').toEqual([]);
});

/**
 * GM-13b (plan row GM-13b; review F1): this spec drives the SOFTWARE menus, where a cold switch at 4x costs 109-189 ms
 * of raster alone (plan, "Performance"), so no whole-frame number is asserted here: the 33.4 ms aim and GM-02b's 50.0 ms
 * target are the GPU path's and are checked on its leg (GM-16). What GM-13b controls is asserted: where the menus'
 * HD answers arrived at a scale above 1, their decode ran in its worker (`__uiGpuPerf.hd().decoder`, `failure` named
 * when it did not). The cold HD switches' frames are recorded (`gm13b.json`), not asserted. A long task cannot be
 * attributed to the decode on the page (the long-task entry names no script), so none is asserted. Skipped, said,
 * when no scale above 1 had HD answers.
 */
test('GM-13b: the menus\' HD decode ran in its worker; the cold HD switches recorded, not asserted (GM-16 asserts the frames)', () => {
  const hd = results.filter((r) => r.scale > 1 && (r.hdAfter?.version ?? 0) > 0);
  test.skip(!hd.length, 'no scale above 1 had HD answers (the HD pack served, a scale above 1 in S2U_UI_PERF_SCALES)');
  const cold = hd.flatMap((r) => r.switches.flatMap((g) => g.list.filter((x) => x.cold && x.hdAnswers > 0)
    .map((x) => ({ scale: r.scale, page: g.page, from: x.from, to: x.to, maxFrameMs: x.maxFrameMs, slowFrames: x.slowFrames, lostSeconds: x.lostSeconds, settleMs: x.settleMs }))));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'gm13b.json'), JSON.stringify({ host, note: 'software path: frames recorded, not asserted; GM-16 asserts them on the GPU leg', decoders: hd.map((r) => ({ scale: r.scale, decoder: r.hdAfter?.decoder ?? null })), cold }, null, 2));
  for (const r of hd) {
    const d = r.hdAfter?.decoder ?? null;
    expect(d?.mode, `scale ${r.scale}: the menus' decode (${d?.failure ?? 'no failure named'})`).toBe('worker');
  }
});

/**
 * GM-16 (plan row GM-16, handed from GM-13b's review fold; GM-02b's target, the plan's "Performance", research 380
 * §6.2): **on the GPU leg**, every cold dialog switch that waits on HD answers at 2x and 4x has no animation frame over
 * 50.0 ms and 0.00 s lost (`UI_PERF_COLD_SWITCH_ADAPTATION`, judged by `coldSwitchVerdict`; a switch's lost seconds
 * leave the guard's frames out, GM.R11). GM-13b's own aim, no frame over 33.4 ms (`UI_PERF_SLOW_FRAME_MS`), is
 * **reported** per switch -- met or missed, in `gm16-cold.json` and the test's annotations -- never asserted: a result
 * between 33.4 and 50.0 ms meets the target and misses the aim, and the Log says which. Skipped, said, on the software
 * leg and when no scale of 2 or 4 had HD answers. The GPU path is checked to have drawn at each judged scale (L0 > 0,
 * no session kill), so a run that fell back to the software is never scored as the GPU's.
 */
test('GM-16: the GPU leg\'s cold HD switches -- no frame over 50.0 ms, 0.00 s lost at 2x and 4x; GM-13b\'s 33.4 ms aim reported', () => {
  test.skip(LEG !== 'gpu', 'the GPU leg only (S2U_UI_PERF_LEG=gpu): on the software leg these switches are recorded, never asserted (GM-13b review F1)');
  const judged = results.filter((r) => (UI_PERF_COLD_SWITCH_ADAPTATION.scales as readonly number[]).includes(r.scale) && (r.hdAfter?.version ?? 0) > 0);
  test.skip(!judged.length, 'no scale of 2 or 4 had HD answers (the HD pack served, 2 or 4 in S2U_UI_PERF_SCALES)');
  const cold = judged.flatMap((r) => r.switches.flatMap((g) => g.list.filter((x) => x.cold && x.hdAnswers > 0).map((x) => {
    const v = coldSwitchVerdict(x);
    return { scale: r.scale, page: g.page, from: x.from, to: x.to, hdAnswers: x.hdAnswers, maxFrameMs: x.maxFrameMs, lostSeconds: x.lostSeconds, guardFrames: x.guardFrames, settleMs: x.settleMs, failures: v.failures, aim: v.aim };
  })));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'gm16-cold.json'), JSON.stringify({
    host, target: { maxFrameMs: UI_PERF_COLD_SWITCH_ADAPTATION.maxFrameMs, lostSeconds: '0.00', scales: UI_PERF_COLD_SWITCH_ADAPTATION.scales }, aimMs: UI_PERF_SLOW_FRAME_MS,
    gpu: judged.flatMap((r) => r.switches.map((g) => ({ scale: r.scale, page: g.page, levels: g.gpu?.levels ?? null, kills: g.gpu?.kills ?? null, guard: g.gpu?.guard ?? null }))), cold,
  }, null, 2));
  const missed = cold.filter((x) => !x.aim).map((x) => `${x.scale}x ${x.from} -> ${x.to}: ${x.maxFrameMs.toFixed(1)} ms`);
  test.info().annotations.push({ type: `GM-13b aim (no frame over ${UI_PERF_SLOW_FRAME_MS} ms)`, description: missed.length ? `missed on ${missed.join('; ')}` : `met on all ${cold.length} cold switches` });
  for (const r of judged) {
    // Each measured page by its own read-out, taken before the walk left it (the next page's load resets it).
    for (const g of r.switches) {
      expect(g.gpu?.levels?.['L0'] ?? 0, `scale ${r.scale} ${g.page}: the GPU path drew (L0 frames)`).toBeGreaterThan(0);
      expect(g.gpu?.kills ?? [], `scale ${r.scale} ${g.page}: no session kill on the GPU path`).toEqual([]);
    }
    expect(cold.filter((x) => x.scale === r.scale).length, `scale ${r.scale}: cold switches with HD answers measured`).toBeGreaterThan(0);
  }
  for (const x of cold) expect.soft(x.failures, `${x.scale}x ${x.page}: ${x.from} -> ${x.to} (${x.hdAnswers} HD answers)`).toEqual([]);
});

/** The loading screen (`LoadingPanel`) over the menus held as a match holds them; its draws timed, the menus' clock read. */
async function loadingScreen(p: Page, scale: number, suspect: string | null): Promise<LoadingRecord> {
  const held = await endOf(p);                                        // what the held menus hold under the panel
  const from = await p.evaluate(async ({ scale, map }) => {
    const w = window as PerfWindow & { __frontEnd?: { session: { holdMenus(h: boolean): void } } };
    const canvas = document.getElementById('front-end') as HTMLCanvasElement | null;
    if (canvas) canvas.hidden = true;                                   // frontEnd.ts `leave`: the menus' canvas hidden ...
    w.__frontEnd?.session.holdMenus(true);                             // ... and the menus held
    const imp = (path: string): Promise<any> => import(/* @vite-ignore */ path);   // eslint-disable-line @typescript-eslint/no-explicit-any
    const [lp, lm, ds, hm] = await Promise.all([imp('/src/loadingPanel.ts'), imp('/src/lobbyMatch.ts'), imp('/src/discSource.ts'), imp('/src/hdMenuTextures.ts')]);
    // frontEnd.ts: `new LoadingPanel(doc, () => hdMenus?.options() ?? { scale: 1 })` -- here the same factory's own HdMenus.
    const hdm = scale > 1 ? hm.pageHdMenus(hm.parseHdMenuScale(location.search)) : null;
    if (hdm) await hdm.set(true);
    const opts = () => (hdm ? hdm.options() : { scale: 1 });
    const panel = new lp.LoadingPanel(document, opts);
    const draws: number[] = [], at: number[] = [];
    const draw = panel.draw.bind(panel);
    panel.draw = (t: number) => { const t0 = performance.now(); draw(t); draws.push(performance.now() - t0); at.push(t0); };
    w.__gm02Loading = { draws, at };
    const screen = lm.pageLobbyMatchScreen({ cover: () => panel.cover(), show: (s: unknown) => panel.show(s), hide: () => panel.hide() }, ds.assetSourceFor({ kind: 'http', baseUrl: '/maps' }));
    (w as unknown as Record<string, unknown>)['__gm02Panel'] = { panel, screen, hdm };
    screen.screen.show(map);
    return performance.now();
  }, { scale, map: MAP });
  await p.waitForFunction(() => !!((window as unknown as Record<string, { panel: { stats(): { map: string | null } } }>)['__gm02Panel']?.panel.stats().map), undefined, { timeout: 120_000 });
  await p.evaluate(() => (window as unknown as Record<string, { hdm: { settled(): Promise<void> } | null }>)['__gm02Panel']?.hdm?.settled());
  await p.waitForTimeout(Math.min(DWELL_MS, 15_000));
  const rec = await p.evaluate(({ from }) => {
    const w = window as PerfWindow;
    const to = performance.now();
    const g = w.__gm02Loading!;
    const spreadOf = (xs: number[]) => {
      const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
      const q = (f: number) => (v.length ? v[Math.min(v.length, Math.max(1, Math.ceil(f * v.length))) - 1]! : 0);
      return { n: v.length, p50: q(0.5), p95: q(0.95), max: v.length ? v[v.length - 1]! : 0 };
    };
    const frames = g.at.slice(1).map((t, i) => t - g.at[i]!);
    const lt = (w.__gm02LongTasks ?? []).filter((t) => t.start >= from && t.start <= to);
    const c = document.querySelector('#original-loading canvas') as HTMLCanvasElement | null;
    const s = w.__uiGpuPerf!.summary(from, to);
    const panel = (window as unknown as Record<string, { panel: { stats(): unknown } }>)['__gm02Panel']!.panel;
    return {
      wallSeconds: (to - from) / 1000, canvas: c ? `${c.width}x${c.height}` : null,
      drawMs: spreadOf(g.draws), frameMs: spreadOf(frames), slowFrames: frames.filter((f) => f > 33.4).length,
      menusLostSecondsPerMinute: s.lostSecondsPerMinute,
      longTasks: { n: lt.length, sumMs: lt.reduce((a, t) => a + t.ms, 0), maxMs: Math.max(0, ...lt.map((t) => t.ms)) },
      stats: panel.stats(),
      // The held menus apart from the panel: their own frames and raster over the same window (the ring's).
      menusRing: { frameMs: s.frameMs, slowFrames: s.slowFrames, rasterMs: s.rasterMs, drawnPerSecond: s.drawnPerSecond },
    };
  }, { from });
  const { menusRing, ...panelRec } = rec;
  return { ...panelRec, menus: { dialog: held?.dialog ?? '?', popup: held?.popup ?? false, ...menusRing }, suspect };
}

/** The page's WebGL renderer and vendor, unmasked where the browser allows it. */
function webglOf(p: Page): Promise<{ renderer: string | null; vendor: string | null; unmasked: boolean }> {
  return p.evaluate(() => {
    const c = document.createElement('canvas');
    const g = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!g) return { renderer: null, vendor: null, unmasked: false };
    const ext = g.getExtension('WEBGL_debug_renderer_info');
    const out = ext
      ? { renderer: String(g.getParameter(ext.UNMASKED_RENDERER_WEBGL)), vendor: String(g.getParameter(ext.UNMASKED_VENDOR_WEBGL)), unmasked: true }
      : { renderer: String(g.getParameter(g.RENDERER)), vendor: String(g.getParameter(g.VENDOR)), unmasked: false };
    g.getExtension('WEBGL_lose_context')?.loseContext();
    return out;
  });
}

/** The host: CPU, memory, OS; the browser and its WebGL renderer; the requested renderer; the build's sha; the viewport. */
async function hostRecord(p: Page, browserVersion: string): Promise<Record<string, unknown>> {
  const gl = await webglOf(p);
  const longTasks = await p.evaluate(() => PerformanceObserver.supportedEntryTypes.includes('longtask'));
  let sha = process.env['S2U_BUILD_SHA'] || '';
  let dirty: boolean | null = null;
  try {
    sha ||= execSync('git rev-parse HEAD', { cwd: WEB, encoding: 'utf8' }).trim();
    dirty = execSync('git status --porcelain --untracked-files=no', { cwd: WEB, encoding: 'utf8' }).trim().length > 0;
  } catch { /* no git here: the sha is the job's S2U_BUILD_SHA or empty, said */ }
  const cpu = cpus();
  return {
    when: new Date().toISOString(), sha, dirty,
    cpu: cpu[0]?.model ?? null, cpus: cpu.length, memGB: Math.round(totalmem() / 1073741824 * 10) / 10, os: `${platform()} ${release()}`,
    leg: LEG, browser: browserVersion, webgl: gl, requestedRenderer: process.env['S2U_UI_PERF_GL'] === 'native'
      ? `native GL (${(process.env['S2U_UI_PERF_GL_ARGS'] || '').trim() || UI_PERF_NATIVE_GL_ARGS.join(' ')}; llvmpipe under xvfb)`
      : process.env['S2U_E2E_RENDERER'] || 'swiftshader',
    headed: process.env['S2U_UI_PERF_HEADED'] === '1',
    viewport: p.viewportSize(), longTaskTiming: longTasks, dwellMs: DWELL_MS,
    label: 'rendered browser run; a software renderer\'s numbers (SwiftShader / llvmpipe) are not representative of a player\'s GPU',
  };
}

const f1 = (n: number): string => (Number.isFinite(n) ? n.toFixed(1) : '-');
const f2 = (n: number): string => (Number.isFinite(n) ? n.toFixed(2) : '-');
const sp = (s: UiPerfSpread): string => `${f1(s.p50)} / ${f1(s.p95)} / ${f1(s.max)}`;

function markdown(h: Record<string, unknown> | null, rs: ScaleRecord[]): string {
  const gl = (h?.['webgl'] ?? {}) as { renderer?: string | null };
  const lines = [
    LEG === 'gpu' ? '# GM-16 -- the menus on the GPU (the front end), the GPU leg' : '# GM-02 -- software menu path, browser baseline',
    '',
    `Host: ${h?.['cpu'] ?? '?'} x${h?.['cpus'] ?? '?'}, ${h?.['memGB'] ?? '?'} GB, ${h?.['os'] ?? '?'}; ${h?.['browser'] ?? '?'}; renderer \`${gl.renderer ?? '?'}\` (requested ${h?.['requestedRenderer'] ?? '?'}); build \`${h?.['sha'] ?? '?'}\`${h?.['dirty'] ? ' (dirty)' : ''}; ${h?.['when'] ?? ''}.`,
    'Evidence kind: rendered browser run (perf); a software renderer is not a player\'s GPU. Never a parity claim.',
    '',
    'A segment marked **SUSPECT** ran in or after a walk error on its scale (the page may have been stuck): its numbers are not the walk as written.',
    '',
    '| scale | segment | ends on | wall s | lost s/min | frame ms p50/p95/max | >33.4 ms | compose ms/tick | shells ms/tick | raster ms p50/p95/max | present ms p50 | pictures/s | long tasks n / sum ms / max ms | heap MB |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  const ends = (e: Segment['end']): string => (e ? `${e.dialog}${e.focused ? ` @${e.focused}` : ''}${e.popup ? ' +popup' : ''}` : '-');
  for (const r of rs) for (const s of r.segments) {
    const m = s.summary;
    lines.push(`| ${r.scale} | ${s.name}${s.suspect ? ' **SUSPECT**' : ''} | ${ends(s.end)} | ${f1(m.wallSeconds)} | ${f2(m.lostSecondsPerMinute)} | ${sp(m.frameMs)} | ${m.slowFrames} | ${f2(m.composeMsPerTick)} | ${f2(m.shellsMsPerTick)} | ${sp(m.rasterMs)} | ${f1(m.presentMs.p50)} | ${f1(m.picturesPerSecond)} | ${s.longTasks.n} / ${f1(s.longTasks.sumMs)} / ${f1(s.longTasks.maxMs)} | ${s.heapMB === null ? '-' : f1(s.heapMB)} |`);
  }
  lines.push('', '**Dialog switches** (cold = the dialog\'s first visit on that page; settle = to the last HD answer)', '',
    '| scale | page | from -> to | cold | settle ms | HD answers | frames | max frame ms | >33.4 ms | lost s | first raster ms | first present ms | max raster ms |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rs) for (const g of r.switches) for (const x of g.list) {
    lines.push(`| ${r.scale} | ${g.page} | ${x.from} -> ${x.to} | ${x.cold ? 'cold' : 'warm'} | ${f1(x.settleMs)} | ${x.hdAnswers} | ${x.frames} | ${f1(x.maxFrameMs)} | ${x.slowFrames} | ${f2(x.lostSeconds)} | ${f1(x.firstRasterMs)} | ${f1(x.firstPresentMs)} | ${f1(x.maxRasterMs)} |`);
  }
  lines.push('', '**Loading screen** (LoadingPanel over the held menus, MP72): the panel (its own draw; the interval between its draws) and the held menus under it (the ring over the same window) apart', '',
    '| scale | canvas | wall s | panel draw ms p50/p95/max | panel interval ms p50/p95/max | >33.4 ms | menus hold | menus frame ms p50/p95/max | menus raster ms p50/p95/max | menus drawn/s | menus lost s/min | long tasks n / sum ms / max ms |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rs) {
    const l = r.loading, mm = l?.menus;
    lines.push(l
      ? `| ${r.scale}${l.suspect ? ' **SUSPECT**' : ''} | ${l.canvas ?? '-'} | ${f1(l.wallSeconds)} | ${sp(l.drawMs)} | ${sp(l.frameMs)} | ${l.slowFrames} | ${mm ? `${mm.dialog}${mm.popup ? ' +popup' : ''}` : '-'} | ${mm ? sp(mm.frameMs) : '-'} | ${mm ? sp(mm.rasterMs) : '-'} | ${mm ? f1(mm.drawnPerSecond) : '-'} | ${f2(l.menusLostSecondsPerMinute)} | ${l.longTasks.n} / ${f1(l.longTasks.sumMs)} / ${f1(l.longTasks.maxMs)} |`
      : `| ${r.scale} | not measured | | | | | | | | | | |`);
  }
  lines.push('', '**Per scale**', '');
  for (const r of rs) {
    lines.push(`- scale ${r.scale}: canvas ${r.canvas ?? '-'}, HD ${JSON.stringify(r.hd)}, CREATE GAME's TRIANGLE reached ${r.createGameBack ?? '-'}; \`${r.url}\``);
    for (const n of r.notes) lines.push(`  - note: ${n}`);
    for (const e of r.errors) lines.push(`  - ERROR: ${e}`);
  }
  return `${lines.join('\n')}\n`;
}
