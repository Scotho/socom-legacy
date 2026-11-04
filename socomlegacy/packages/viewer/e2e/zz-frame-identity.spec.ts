import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test } from '@playwright/test';
// `src/hook.ts` is types only; its `declare global` is what makes `window.__viewer` exist inside `page.evaluate`.
import type {} from '../src/hook';
import type { FrameHash } from '../src/frameHash';
import type { FrameDiagVariant, FrameState } from '../src/frameDiag';   // types only: the module imports three's renderer side
import {
  diffFrames, FLICKER_TOLERANCE_KIT, flickerOf, fnv1a64, frameDiffPpm, framePpm, majorityFrame, tickAgainstBase, withinFlicker,
  describeFrameDiff, type DrawsRule,
} from '../src/frameDiff';   // pure, no imports: safe under Node
import { DEV_PANEL_KEY } from '../src/devTools';               // not ../src/devPanel: its stylesheet import is the page's
import { gunzipReplay, readReplayHeader } from '../../match/src/replay/format';
import { OpenedContexts } from './openedContexts';
import { TEST_ROOM } from './urls';

/**
 * **The frame identity gate** (CPS.R9 (e), plan `2026-11-02-client-performance-sprint.md`: "the frame byte-identical
 * where a test can hold it"; a test-only instrument, product track: it drives the page and changes nothing the game
 * does). A recording in the test room's replay mode (`/testroom?devmode&replay=<url>&tick=<t>&pause`, PT-18), held still at
 * each tick, and the world's frame hashed several times by the dev hook (`window.__viewer.frameHash`, `../src/frameHash.ts`):
 * since cps-frame-hash-5 their majority is the tick's frame and the reads must agree with it within the GPU's race
 * (below; beyond it a mismatch is located -- the differing bytes, their box, the first pixels, a grid,
 * the pose, the clocks -- in `test-results/frame-identity-diff.json` and the two frames and their mask as PPMs beside
 * it, `../src/frameDiff.ts`), and each tick's `{ tick, pageTick, hash, w, h, draws, samples, format }` is
 * written to `test-results/frame-identity.json` (the run's output directory, which Playwright empties at each run: copy
 * it out before the second). With `S2U_FRAME_EXPECT=<a previous run's json>` each tick's hash must
 * equal that file's: run on the base build to write the file, then on the head build with `S2U_FRAME_EXPECT` -- the
 * before/after gate for a same-picture performance change.
 *
 * What holds the frame still: `pause` (`../src/replay/mount.ts` `replayPauseAsked`) pauses the recording at its open,
 * before the `tick=` seek, so it stands at exactly that tick (it plays from its open otherwise, and a seek keeps it
 * playing), and the bodies animate on the replay's clock; the world's own clocks (the scrolling textures, the
 * map's ambient effects and particles, the autostart scene programs) run on the page's frame `dt`, which the dev
 * panel's Pause holds at 0 while the panel is open (`../src/devClock.ts`) -- pressed here as soon as the panel mounts,
 * before the map is built, so the scrolls stand at 0 and nothing ambient has stepped; and the page's frame clock itself
 * is held (`window.__viewer.holdFrame(true)`, `../src/frameTime.ts` `FrameTime.hold`; cps-frame-hash-2) as soon as the
 * hook has it and again before the hashes, so the clamped `dt` and the frame's real seconds every world clock reads
 * (the spectator's look, the throws' timed rules, the body's lowering included) are 0. The page's `Math.random` is
 * seeded (`addInitScript`) so the ambient particles' and autostart programs' draws repeat from one load to the next.
 * The size is fixed (`S2U_FRAME_SIZE`, default the viewport's 960 x 540 at device scale 1), never the drawing buffer's:
 * the adaptive ratio (`../src/matchViewport.ts` `AdaptiveRatio`) moves the drawing buffer with the frame time, which is
 * what a performance change changes.
 *
 * cps-frame-hash-3 (attempt 3 on the owner's PC, 2026-11-03T09:48Z: ticks 100, 500 and 1000 hashed to one value, 680
 * draws): the replay's watcher is a spectator that opens in the free camera (`../src/spectatorView.ts`
 * `SPECTATOR_START_READING`), stood where the page has it, and no body was in that view -- the gate held the static world
 * only. So before it hashes, the spec follows a seat (`window.__viewer.followSeat(n)`, `S2U_FRAME_FOLLOW`, default 0: the
 * first living body in seat order, by the spectator's own Right released), and the follow camera stands the page's camera
 * -- the one the frame and the hash draw with -- behind that body. Each tick must then have a body in view
 * (`window.__viewer.bodiesInView()`: visible, on the camera's layers, in its frustum), and the ticks' frames must differ
 * from one another (ticks the seek clamps to one page tick excepted). A file written before cps-frame-hash-3 was hashed
 * from the free camera: it is not an `S2U_FRAME_EXPECT` for a run of this spec -- write the base again.
 *
 * What it proves: the world scene drawn into the canvas pass's twin target is the same bytes at each tick on the two
 * builds, on this host, this browser and this backend. Not the canvas (the target's resolve and format may differ from
 * the canvas's), not the HUD, the PS2 frame, the glow or the Experimental post (none is in the world scene's render),
 * not frames in motion (each tick is a paused replay), and a development build's only. A tick outside the recording's
 * span is clamped by the seek: `pageTick` (the bar's) records where the page stood.
 *
 * cps-frame-hash-4 (attempt 4 on the owner's PC, 2026-11-03: with a body followed, the reads toggled between two pictures --
 * the third equal to the first, the second one channel step apart in 13 to 46 pixels on the body, every clock held, the
 * pose the same): each read now carries what it was drawn from (`window.__viewer.frameState()`, `../src/frameDiag.ts`:
 * the camera's world and projection matrices whole, each body's pose and bone-palette hashes), in the diff report. And
 * `S2U_FRAME_DIAG=1` diagnoses at one tick (`S2U_FRAME_DIAG_TICK`, default the first): six consecutive reads (the
 * period), then six under each variant in turn (`staticCamera` the follow stopped after its last placement, `noBodies`
 * the bodies off the camera's layers, `noShadow` the characters' shadow's strength 0, `noEffectLight` the effect lights'
 * overlays hidden; each put back), written to `test-results/frame-identity-diag.json` and logged: which variant makes the
 * six equal. The gate's own checks run after it as before.
 *
 * cps-frame-hash-5 (attempt 5 on the owner's PC, 2026-11-03, headless ANGLE D3D11): the diagnosis cleared the clocks, the
 * camera (its matrices equal in every read), the bodies' poses and palettes, the shadow and the effect lights -- and the
 * reads still differed by one channel step in a few dozen pixels, with no period: the GPU resolves near, coplanar or
 * edge-shared geometry (equal depths under LessEqual) in hardware order. Single reads cannot be held bit-equal there.
 * So a tick takes `S2U_FRAME_READS` reads (default 5) after the priming one, hashes their per-channel MAJORITY
 * (`../src/frameDiff.ts` `majorityFrame`: each byte the value most reads hold, a tie the lowest) as the tick's hash, and
 * holds the flicker left around it -- the pixels where any read differs from the majority -- to the race's tolerance
 * (`withinFlicker`: at most `S2U_FRAME_FLICKER_MAX` per cent of the pixels, default 0.05, by any step since
 * cps-frame-hash-6 -- CPS.R11: the bodies' edges move by up to 13 steps in the driver's race; the step is logged);
 * beyond it is a real difference and fails, located against the majority as before. The majority image is written
 * beside the json (`frame-identity-<tick>-majority.rgba`); with `S2U_FRAME_EXPECT`, a tick whose majority hash differs
 * from the file's has the two majority images diffed under the same tolerance (the base's image beside its json) before
 * it fails -- a cull that drops a draw moves hundreds of pixels, the race tens -- and the draws and the count of bodies
 * in view must equal the base's (`tickAgainstBase`).
 *
 * Kept out of the gate's `--e2e` by the `S2U_FRAME_IDENTITY` guard below: without it the file is one skipped test.
 * Run (from `socomlegacy/`, where `playwright.config.ts` is, in the runner's slot; the served maps extracted):
 * `S2U_FRAME_IDENTITY=1 S2U_REPLAY_URL=<path to a .s2r, or an http://127.0.0.1 address> S2U_FRAME_TICKS=100,500,1000
 * npx playwright test e2e/zz-frame-identity.spec.ts --workers=1` -- then, on the other build,
 * the same with `S2U_FRAME_EXPECT=<the first run's frame-identity.json, copied out of test-results with its
 * frame-identity-*-majority.rgba files beside it>`.
 */

test.skip(!process.env['S2U_FRAME_IDENTITY'], 'the frame identity gate runs on request: S2U_FRAME_IDENTITY=1');
const REPLAY = process.env['S2U_REPLAY_URL'] ?? '';
const REMOTE = /^https?:\/\//.test(REPLAY);
test.skip(REPLAY === '' || (!REMOTE && !existsSync(REPLAY)), 'S2U_REPLAY_URL unset or missing: a recording is not in git (RS.R8)');

/** The ticks (`tick=`, the replay's own), the size hashed, the port a file is served on (not 5303, the e2e Vite server's; not 5304, LATER 568's). */
const TICKS = (process.env['S2U_FRAME_TICKS'] ?? '100,500,1000').split(',').map((t) => Number(t.trim())).filter((t) => Number.isSafeInteger(t) && t >= 0);
const [WIDTH, HEIGHT] = (process.env['S2U_FRAME_SIZE'] ?? '960x540').split('x').map(Number) as [number, number];
const PORT = Number(process.env['S2U_FRAME_REPLAY_PORT'] ?? 5305);
const EXPECT = process.env['S2U_FRAME_EXPECT'] ?? '';
/** cps-frame-hash-3: the seat followed, the n-th living body in seat order (a test-only choice). */
const FOLLOW = Number(process.env['S2U_FRAME_FOLLOW'] ?? 0);
/** cps-frame-hash-4: the diagnosis on request, at one tick; its reads per variant (a test-only choice). */
const DIAG = !!process.env['S2U_FRAME_DIAG'];
const DIAG_TICK = Number(process.env['S2U_FRAME_DIAG_TICK'] ?? TICKS[0]);
const DIAG_READS_KIT = 6;
/** `../src/frameDiag.ts` `FRAME_DIAG_VARIANTS` (not imported: the spec takes the module's types only). */
const FRAME_DIAG_VARIANTS: readonly FrameDiagVariant[] = ['staticCamera', 'noBodies', 'noShadow', 'noEffectLight'];
/** The settle after the page is open and unblocked, and between the two hashes (test-only timings, no game value). */
const SETTLE_KIT_MS = 3_000, BETWEEN_KIT_MS = 500;
/** The seed of the page's `Math.random` (mulberry32; a test-only choice). */
const RANDOM_SEED_KIT = 0x5eed;
/** cps-frame-hash-5: the reads a tick's majority is built from, and the flicker's share allowed, in per cent (test-only choices). */
const READS = Math.max(1, Math.floor(Number(process.env['S2U_FRAME_READS'] ?? 5)));
/** cps-frame-hash-7: the head's draws against the base's -- `equal`, or `fewer` for a cull (`../src/frameDiff.ts` `DrawsRule`). */
const DRAWS: DrawsRule = (process.env['S2U_FRAME_DRAWS'] ?? 'equal') === 'fewer' ? 'fewer' : 'equal';
const TOLERANCE = {
  share: process.env['S2U_FRAME_FLICKER_MAX'] ? Number(process.env['S2U_FRAME_FLICKER_MAX']) / 100 : FLICKER_TOLERANCE_KIT.share,
};

interface Row {
  tick: number; pageTick: number | null; hash: string; w: number; h: number; draws: number; samples: number; format: string | null;
  /** cps-frame-hash-3: the body followed (its room id) and the drawn bodies in the hashed view. */
  followed?: number | null; inView?: number[]; bodies?: number;
  /** cps-frame-hash-5: `hash` is the reads' majority's; each read's own hash, the flicker around the majority, its image's file. */
  reads?: string[]; flicker?: { pixels: number; share: number; maxDelta: number }; majority?: string;
}

async function recordingBytes(): Promise<Uint8Array> {
  if (!REMOTE) return new Uint8Array(readFileSync(REPLAY));
  const res = await fetch(REPLAY);
  if (!res.ok) throw new Error(`${REPLAY}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

const opened = new OpenedContexts();
test.afterEach(() => opened.closeAll());

test('the frame identity gate: each paused tick read several times, their majority within the GPU race tolerance; written, and against S2U_FRAME_EXPECT when given', async ({ browser, baseURL }) => {
  test.setTimeout(300_000 * Math.max(1, TICKS.length));
  expect(TICKS.length, 'S2U_FRAME_TICKS names at least one tick').toBeGreaterThan(0);
  const raw = await recordingBytes();
  const header = readReplayHeader(raw[0] === 0x1f && raw[1] === 0x8b ? gunzipReplay(raw) : raw);
  if (!header) throw new Error(`${REPLAY}: no replay header`);
  const expected: Row[] | null = EXPECT ? JSON.parse(readFileSync(EXPECT, 'utf-8')) as Row[] : null;
  let server: Server | null = null;
  let replay = REPLAY;
  if (!REMOTE) {
    const origin = new URL(baseURL!).origin;
    server = createServer((req, res) => {
      const cors = { 'Access-Control-Allow-Origin': origin, 'Cache-Control': 'no-store' };
      if (req.url?.split('?')[0] === '/segments/0.s2r') { res.writeHead(200, { ...cors, 'Content-Type': 'application/octet-stream' }); res.end(Buffer.from(raw)); return; }
      res.writeHead(404, cors); res.end();
    });
    await new Promise<void>((ok) => server!.listen(PORT, '127.0.0.1', ok));
    replay = `http://127.0.0.1:${PORT}/segments/0.s2r`;
  }
  const rows: Row[] = [];
  try {
    for (const tick of TICKS) {
      const context = opened.add(await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 }));
      await context.addInitScript((seed: number) => {
        let s = seed >>> 0;
        Math.random = () => {                          // mulberry32: the page's draws repeat from load to load
          s = (s + 0x6d2b79f5) >>> 0;
          let t = s;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      }, RANDOM_SEED_KIT);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${TEST_ROOM}?devmode&replay=${encodeURIComponent(replay)}&tick=${tick}&pause&map=${header.map}`);
      // The page's clock held before the map is built: the panel open, Time, Pause (`devPanel.spec.ts`'s steps).
      await expect(page.locator('#dev-panel')).toBeAttached({ timeout: 120_000 });
      await page.keyboard.press(DEV_PANEL_KEY);
      await expect(page.locator('#dev-panel')).toBeVisible();
      await page.locator('#dev-panel-time > summary').click();
      await page.locator('#dev-panel-pause').click();
      await expect(page.locator('#dev-panel-clock')).toHaveText('paused');
      // cps-frame-hash-2: the page's frame clock held (dt and the real seconds 0) once the hook has it (after the renderer).
      await expect.poll(() => page.evaluate(() => typeof window.__viewer.holdFrame), { timeout: 120_000 }).toBe('function');
      await page.evaluate(() => window.__viewer.holdFrame!(true));
      await expect.poll(async () => page.evaluate(() => window.__viewer.net?.()?.state ?? null), { timeout: 180_000 }).toBe('open');
      await expect.poll(() => page.evaluate(() => window.__viewer.loading().blocked), { timeout: 180_000 }).toBe(false);
      await page.waitForTimeout(SETTLE_KIT_MS);         // the seek laid, the textures in, a few frames drawn
      expect(await page.evaluate(() => typeof window.__viewer.frameHash), 'frameHash on the hook (a development build, ?devmode)').toBe('function');
      const size = { width: WIDTH, height: HEIGHT };
      // cps-frame-hash-3: the follow camera on a seat, so the hashed view holds the bodies the replay moves; a frame or more
      // for the follow to stand the camera (it does at every frame, the clock held or not: `SpectatorView.frame`).
      expect(await page.evaluate(() => typeof window.__viewer.followSeat), 'followSeat on the hook').toBe('function');
      const followed = await page.evaluate((n) => window.__viewer.followSeat!(n), FOLLOW);
      expect(followed, `tick ${tick}: a living body to follow (seat ${FOLLOW})`).not.toBeNull();
      await page.waitForTimeout(BETWEEN_KIT_MS);
      await page.evaluate(() => window.__viewer.holdFrame!(true));
      // cps-frame-hash-2, the owner's PC 2026-11-03T09:46Z: the FIRST off-screen render after the hold differs from every
      // later one by one channel step in ~45 of 518,400 pixels (the same two hashes in two attempts; the second and an
      // immediate third equal, poses and clocks equal): a pass's state settles at its first render into the target's
      // size. The gate compares settled frames: one priming read is discarded before the three that count.
      await read(page, size);
      if (DIAG && tick === DIAG_TICK) await diagnose(page, size, tick);
      // cps-frame-hash-5: READS reads (the first after a pause, the rest at once), their per-channel majority the tick's
      // frame, the flicker around it held to the race's tolerance.
      const reads: Read[] = [];
      for (let i = 0; i < READS; i++) {
        reads.push(await read(page, size));
        if (i === 0 && READS > 1) await page.waitForTimeout(BETWEEN_KIT_MS);
      }
      const first = reads[0]!;
      const bytesOf = reads.map((r) => new Uint8Array(Buffer.from(r.b64, 'base64')));
      const majority = majorityFrame(bytesOf);
      const flicker = flickerOf(bytesOf, majority, first.w, first.h);
      const majorityName = `frame-identity-${tick}-majority.rgba`;
      const outDir = test.info().project.outputDir;
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, majorityName), majority);
      const bar = await page.evaluate(() => document.querySelector('[data-replay-bar]')?.textContent ?? '');
      const paused = /\bpaused\b/.test(bar);
      const pageTick = Number(/tick (\d+)/.exec(bar)?.[1] ?? NaN);
      const seen = await page.evaluate(() => window.__viewer.bodiesInView!());
      const row: Row = {
        tick, pageTick: Number.isFinite(pageTick) ? pageTick : null, ...pick(first), hash: fnv1a64(majority), followed, inView: seen.ids, bodies: seen.drawn,
        reads: reads.map((r) => r.hash), flicker: { pixels: flicker.pixels, share: flicker.share, maxDelta: flicker.maxDelta }, majority: majorityName,
      };
      rows.push(row);
      console.log(`FRAME IDENTITY tick ${tick} (page ${row.pageTick}): majority ${row.hash} of ${READS} [${row.reads!.join(' ')}] ${first.w}x${first.h}`
        + ` draws ${[...new Set(reads.map((r) => r.draws))].join('/')}; flicker ${flicker.pixels} px (${(flicker.share * 100).toFixed(4)} %), max step ${flicker.maxDelta}`
        + `; following ${followed}; bodies in view ${seen.count} of ${seen.drawn} [${seen.ids.join(',')}]; pose ${JSON.stringify(first.pose)}`);
      expect(errors, `tick ${tick}: page errors`).toEqual([]);
      expect(paused, `tick ${tick}: the replay bar says paused ("${bar}")`).toBe(true);
      if (!withinFlicker(flicker, first.w, first.h, TOLERANCE)) {
        // Beyond the race: located as before, the read furthest from the majority against the majority.
        const far = reads.map((r, i) => ({ r, d: diffFrames(majority, bytesOf[i]!, first.w, first.h).pixels })).sort((a, b) => b.d - a.d);
        const asMajority: Read = { ...first, hash: row.hash, b64: Buffer.from(majority).toString('base64') };
        throw new Error(`tick ${tick}: the flicker around the majority of ${READS} reads is beyond the race's tolerance (${flicker.pixels} px, `
          + `${(flicker.share * 100).toFixed(4)} % > ${(TOLERANCE.share * 100).toFixed(4)} %; max step ${flicker.maxDelta}). `
          + located(tick, asMajority, far[0]!.r, far[1]?.r ?? far[0]!.r));
      }
      expect(reads.every((r) => r.draws === first.draws && r.w === first.w && r.h === first.h && r.samples === first.samples),
        `tick ${tick}: every read the same target and draws (determinism)`).toBe(true);
      expect(seen.count, `tick ${tick}: a body in the hashed view (following ${followed}; ${seen.drawn} drawn)`).toBeGreaterThan(0);
      await context.close();
    }
    const path = test.info().outputPath('frame-identity.json');
    writeFileSync(path, JSON.stringify(rows, null, 1));
    writeFileSync(join(test.info().project.outputDir, 'frame-identity.json'), JSON.stringify(rows, null, 1));   // test-results/, the run's
    // cps-frame-hash-3: the replay moves the hashed frame -- two ticks the page stood at apart hash apart.
    const alike = rows.flatMap((a, i) => rows.slice(i + 1).flatMap((b) => {
      const apart = (a.pageTick ?? a.tick) !== (b.pageTick ?? b.tick);
      return apart && a.hash === b.hash ? [`ticks ${a.tick} and ${b.tick}: ${a.hash}`] : [];
    }));
    expect(alike, `the ticks' frames differ (the bodies the replay moves are in the hashed view)`).toEqual([]);
    if (expected) {
      const differs = rows.flatMap((r) => {
        const e = expected.find((x) => x.tick === r.tick);
        if (!e) return [`tick ${r.tick}: not in ${EXPECT}`];
        if (e.w !== r.w || e.h !== r.h || e.samples !== r.samples || e.format !== r.format) {
          return [`tick ${r.tick}: a different target (${e.w}x${e.h} s${e.samples} ${e.format} before, ${r.w}x${r.h} s${r.samples} ${r.format} now): not comparable`];
        }
        // cps-frame-hash-6: the draws and the bodies in view equal; a majority that differs diffed with the base's image.
        const basePath = e.majority ? join(dirname(EXPECT), e.majority) : '';
        const d = e.hash !== r.hash && basePath && existsSync(basePath)
          ? diffFrames(new Uint8Array(readFileSync(basePath)), new Uint8Array(readFileSync(join(test.info().project.outputDir, r.majority!))), r.w, r.h)
          : null;
        console.log(`FRAME IDENTITY tick ${r.tick} against the base: majority ${e.hash} / ${r.hash}; draws ${e.draws} / ${r.draws} (draw delta ${r.draws - e.draws}, ${DRAWS}); bodies in view `
          + `${e.inView?.length ?? '-'} / ${r.inView?.length ?? '-'}${d ? `; ${d.pixels} px differ, max step ${d.maxDelta}` : ''}`);
        return tickAgainstBase(e, r, d, r.w, r.h, TOLERANCE, DRAWS);
      });
      expect(differs, `the frames against ${EXPECT}`).toEqual([]);
    }
  } finally {
    if (server) await new Promise<void>((ok) => server!.close(() => ok()));
  }
});

/** One read: the hash and its bytes (base64), with what could have moved -- the camera's pose, the clocks, the time. */
interface Read extends FrameHash { b64: string; pose: unknown; clock: string | null; bar: string; at: number; state: FrameState | null }

async function read(page: import('@playwright/test').Page, size: { width: number; height: number }): Promise<Read> {
  return page.evaluate(async (s) => {
    const state = window.__viewer.frameState?.() ?? null;   // cps-frame-hash-4: in this task, before the hash's render
    const f = await window.__viewer.frameHash!(s, { keep: true });
    const b = f.bytes!;
    let bin = '';
    for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
    const rest: Partial<FrameHash> = { ...f };
    delete rest.bytes;
    return {
      ...(rest as FrameHash), b64: btoa(bin), pose: window.__viewer.pose(), clock: document.querySelector('#dev-panel-clock')?.textContent ?? null,
      bar: document.querySelector('[data-replay-bar]')?.textContent ?? '', at: performance.now(), state,
    };
  }, size);
}

/** cps-frame-hash-4: one variant's reads -- the hashes, their pattern (A, B, ... by first appearance), the draws, the inputs. */
interface DiagRun {
  variant: FrameDiagVariant | 'none'; set: FrameDiagVariant | null; equal: boolean; pattern: string; hashes: string[];
  draws: number[]; poses: unknown[]; states: (FrameState | null)[];
}

/**
 * cps-frame-hash-4: `S2U_FRAME_DIAG`'s diagnosis at `tick` -- six consecutive reads as the page stands (the period), then
 * six under each variant (switched on, a priming read, the six, put back), into `test-results/frame-identity-diag.json`.
 */
async function diagnose(page: import('@playwright/test').Page, size: { width: number; height: number }, tick: number): Promise<void> {
  const runs: DiagRun[] = [];
  for (const v of [null, ...FRAME_DIAG_VARIANTS]) {
    const set = v === null ? null : await page.evaluate((x) => window.__viewer.frameDiag!(x), v);
    if (v !== null) { await page.waitForTimeout(BETWEEN_KIT_MS); await read(page, size); }
    const reads: Read[] = [];
    for (let i = 0; i < DIAG_READS_KIT; i++) reads.push(await read(page, size));
    await page.evaluate(() => window.__viewer.frameDiag!(null));
    await page.waitForTimeout(BETWEEN_KIT_MS);
    const hashes = reads.map((r) => r.hash);
    const order = [...new Set(hashes)];
    const run: DiagRun = {
      variant: v ?? 'none', set, equal: order.length === 1, pattern: hashes.map((h) => String.fromCharCode(65 + order.indexOf(h))).join(''), hashes,
      draws: reads.map((r) => r.draws), poses: reads.map((r) => r.pose), states: reads.map((r) => r.state),
    };
    runs.push(run);
    const inputs = (k: 'pose' | 'palette'): string => [...new Set(run.states.map((s) => s?.bodies.map((b) => b[k]).join('/') ?? '-'))].join(' | ');
    const cameras = new Set(run.states.map((s) => JSON.stringify(s?.camera ?? null))).size;
    console.log(`FRAME DIAG tick ${tick} ${run.variant}${v !== null && set === null ? ' (not set)' : ''}: ${run.equal ? 'EQUAL' : 'differ'} ${run.pattern}`
      + ` draws ${[...new Set(run.draws)].join('/')}; cameras ${cameras}; poses ${inputs('pose')}; palettes ${inputs('palette')}`);
  }
  const dir = test.info().project.outputDir;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'frame-identity-diag.json'), JSON.stringify({ tick, reads: DIAG_READS_KIT, runs }, null, 1));
}

/**
 * A determinism mismatch located (cps-frame-hash-2): the differing bytes, their box, the first 8 pixels with both colours,
 * an 8 x 8 grid of where they fall, the second read against an immediate third, and the reads' poses and clocks -- into
 * `test-results/frame-identity-diff.json`, the two frames and their mask as PPMs beside it; the message for the error.
 */
function located(tick: number, a: Read, b: Read, c: Read): string {
  const bytes = (r: Read): Uint8Array => new Uint8Array(Buffer.from(r.b64, 'base64'));
  const A = bytes(a), B = bytes(b), C = bytes(c);
  const rows = a.format === null ? 'rows bottom-up: WebGL2 readPixels, y 0 the bottom' : 'rows top-down: WebGPU copy, y 0 the top';
  const d = diffFrames(A, B, a.w, a.h);
  const d23 = diffFrames(B, C, b.w, b.h);
  const meta = (r: Read): Partial<Read> => { const m: Partial<Read> = { ...r }; delete m.b64; return m; };
  const dir = test.info().project.outputDir;
  mkdirSync(dir, { recursive: true });
  const name = (part: string): string => join(dir, `frame-identity-${tick}-${part}.ppm`);
  const o = { bgra: a.format === 'bgra8unorm', bottomUp: a.format === null };
  writeFileSync(name('first'), framePpm(A, a.w, a.h, o));
  writeFileSync(name('second'), framePpm(B, b.w, b.h, o));
  writeFileSync(name('mask'), frameDiffPpm(A, B, a.w, a.h, { bottomUp: o.bottomUp }));
  const report = {
    tick, rows, channels: a.format === 'bgra8unorm' ? 'BGRA' : 'RGBA',
    reads: { first: meta(a), second: meta(b), third: meta(c) },
    firstVsSecond: d,
    secondVsThird: { bytes: d23.bytes, pixels: d23.pixels, bbox: d23.bbox, first: d23.first },
    ppm: ['first', 'second', 'mask'].map(name),
  };
  writeFileSync(join(dir, 'frame-identity-diff.json'), JSON.stringify(report, null, 1));
  return `tick ${tick}: the same paused frame hashed twice differs (${a.hash} then ${b.hash}, draws ${a.draws}/${b.draws}): `
    + `${describeFrameDiff(d, rows)}. Second against an immediate third: ${describeFrameDiff(d23, rows)}. `
    + `Poses ${JSON.stringify(a.pose)} / ${JSON.stringify(b.pose)}; clocks "${a.clock}" / "${b.clock}"; `
    + `${Math.round(b.at - a.at)} ms apart. Written: ${join(dir, 'frame-identity-diff.json')} and the PPMs.`;
}

function pick(f: FrameHash): Omit<Row, 'tick' | 'pageTick'> {
  return { hash: f.hash, w: f.w, h: f.h, draws: f.draws, samples: f.samples, format: f.format };
}
