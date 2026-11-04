import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FsAssetSource } from '@s2u/archive/node';
import { MovieDecoder } from '@s2u/fmv';
import { UI_TICK_SECONDS, type MoviePicture, type OpenerEvent } from '@s2u/ui';
import { FrontEndSession, readFrontEndDisc } from '../../packages/viewer/src/frontEnd';
import { withMenuArt } from '../../packages/viewer/src/menuArt';
import { decodePng, rgbaToRgb, type Rgb } from '../captureImage';
import { writePng } from '../captureRun';
import { judge, titleVerdict, TITLE_MENU_WINDOW, TITLE_MIN_SCORE } from '../captureScore';
import { parseSteps, runSteps, type FrameDriver, type ManifestEntry } from '../captureSteps';
import { engineFromFile } from '../fmv-spike';
import { menuloopMask } from '../menuloopMask';
import { NodeMovieSource, type NodeMovieFrame } from '../nodeMovieSource';

/**
 * BOOT-06's acceptance at the reading level (web research 141 §4): `scripts/parity/title_menu.txt` -- the gate's title
 * script: `untilref(ref_main_menu_ours.png)+1.0:CROSS`, then 22 captures 6 s apart -- run by PLAT-30's step runner
 * (`captureSteps.runSteps`, drive.py's vocabulary) on the page's path: `FrontEndSession` from `/` (the loader's
 * screens, the boot dialogs, SONY448, Intro_2 skipped by the script's CROSS, `dlgMenu` over MENULOOP), on a virtual
 * clock -- one PLAT-12 tick per 1001/30000 s of the driver's time, the press the page hook's (`__frontEnd.press`).
 * Each capture s00..s18 is scored by the gate's rule (`judge`, `titleVerdict`) against
 * `scripts/parity/ref_main_menu_ours.png` (the recompiled game's menu, the gate's `TITLE_REF`) with the MENULOOP region
 * masked (`menuloopMask`: the blocks where nothing of the dialog draws), and whole beside it; s19.. are printed, not
 * counted (gate.py's window).
 *
 * Two runs, kept apart: **the black movie** (the page's `MOVIE_SOURCE_PLACEHOLDER`, every host with the disc) and
 * **the movie drawn** (PLAT-19b's decoder core on `libmpeg2.wasm` in Node, as BOOT-04's disc test; skips VISIBLY without
 * the built wasm, `S2U_FMV_WASM`). The mask of the drawn run is the black run's rule applied to the same frame drawn
 * with the movie layer cleared, so both runs mask the same dialog. `S2U_TITLE_RUN_OUT=<dir>` writes the captures.
 *
 * Skips without the disc (`SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`) or the script and reference under
 * `SOCOM_PC_ROOT/scripts/parity/`.
 */
const ROOT = process.env.SOCOM_PC_ROOT ?? null;
const DISC = [process.env.SOCOM_DISC, ROOT ? resolve(ROOT, 'game/disc') : undefined]
  .find((d) => d !== undefined && existsSync(resolve(d, 'RUN/UI/READERC.ZAR')) && existsSync(resolve(d, 'RUN/UI/UI_GEO.ZED'))) ?? null;
const SCRIPT = ROOT ? resolve(ROOT, 'scripts/parity/title_menu.txt') : null;
const REF = ROOT ? resolve(ROOT, 'scripts/parity/ref_main_menu_ours.png') : null;
const HAVE = DISC !== null && SCRIPT !== null && existsSync(SCRIPT) && REF !== null && existsSync(REF);
const WASM = process.env.S2U_FMV_WASM ?? resolve(import.meta.dirname, '../../packages/fmv/wasm/out/libmpeg2.wasm');
const HAVE_WASM = existsSync(WASM);
const OUT = process.env.S2U_TITLE_RUN_OUT ?? null;

interface Capture { name: string; t: number; dialog: string; picture: number | null; frame: Rgb; mask: Rgb }
interface TitleRun { manifest: ManifestEntry[]; captures: Capture[]; log: string[]; events: OpenerEvent[] }

const png = (p: string): Rgb => decodePng(new Uint8Array(readFileSync(p)));

/** The title script on the page's path at a virtual clock; `movie` decodes the movies, else the black stand-in. */
async function titleRun(movie: boolean, label: string): Promise<TitleRun> {
  const fs = new FsAssetSource(DISC!);
  const disc = await withMenuArt(fs, await readFrontEndDisc(fs));
  const events: OpenerEvent[] = [];
  let source: NodeMovieSource | null = null;
  let engine: { close(): void } | null = null;
  if (movie) {
    const e = await engineFromFile(WASM);
    engine = e;
    source = new NodeMovieSource(new MovieDecoder(e, { output: 'rgba' }), fs, (p) => existsSync(resolve(DISC!, p)));
  }
  const s = new FrontEndSession<NodeMovieFrame>({
    disc, onEvent: (e) => events.push(e),
    ...(source ? {
      source,
      moviePicture: (p: MoviePicture) => { const f = p.image as NodeMovieFrame; return { width: f.width, height: f.height, data: new Uint8ClampedArray(f.rgba.buffer, f.rgba.byteOffset, f.rgba.byteLength) }; },
    } : {}),
  });
  let ticks = 0;
  s.advance(0);
  const now = (): number => ticks * UI_TICK_SECONDS;
  const step = async (): Promise<void> => { if (source) await source.prime(); ticks++; s.advance(ticks * 1000 * UI_TICK_SECONDS); };
  const draw = (): Rgb => {
    let frame: Rgb | null = null;
    s.render({ createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData: (img) => { frame = rgbaToRgb(img.width, img.height, img.data); } });
    return frame!;
  };
  let cache: { tick: number; frame: Rgb } | null = null;
  const grab = (): Rgb => { if (cache?.tick !== ticks) cache = { tick: ticks, frame: draw() }; return cache.frame; };
  /** The same frame with the movie layer black: the dialog alone, for the mask. */
  const dialogOnly = (): Rgb => {
    const pic = s.layer.picture();
    if (!pic) return grab();
    s.layer.clear();
    const f = draw();
    s.layer.present(pic);
    return f;
  };
  const captures: Capture[] = [];
  const log: string[] = [];
  const dir = OUT ? resolve(OUT, label) : null;
  if (dir) mkdirSync(dir, { recursive: true });
  const driver: FrameDriver = {
    grab: async () => grab(),
    press: async (b) => { s.press(b as never); },
    now,
    sleep: async (sec) => { const end = now() + sec; while (now() + UI_TICK_SECONDS / 2 < end) await step(); },
    save: async (name, img) => {
      if (/^s\d\d_/.test(name)) captures.push({ name, t: now(), dialog: s.machine.shell()?.currentName ?? '', picture: (s.layer.picture()?.image as NodeMovieFrame | undefined)?.index ?? null, frame: img, mask: dialogOnly() });
      if (dir) writePng(resolve(dir, name), img);
    },
    loadRef: async (p) => png(resolve(ROOT!, p)),
    log: (line) => log.push(line),
  };
  const manifest = await runSteps(parseSteps(readFileSync(SCRIPT!, 'utf8')), driver, { settle: 1.5, tail: 8 });
  try { engine?.close(); } catch { /* the engine's close is the decoder's */ }
  return { manifest, captures, log, events };
}

interface Scored { name: string; dialog: string; masked: number; whole: number; blocks: number }
const scoreRun = (run: TitleRun): Scored[] => {
  const ref = png(REF!);
  return run.captures.map((c) => {
    const mask = menuloopMask(c.mask);
    // A frame where nothing of a dialog draws (the attract's black stand-in) leaves nothing to score masked: NaN.
    const masked = mask.length === 20 * 14 ? NaN : judge(ref, c.frame, { mask }).score;
    return { name: c.name, dialog: c.dialog, masked, whole: judge(ref, c.frame).score, blocks: mask.length };
  });
};
const inWindow = (x: Scored): boolean => Number(x.name.slice(1, 3)) < TITLE_MENU_WINDOW;
/**
 * The drawn run's scores (research 141 §4): s00..s18 masked, then whole. A change to the drawing, the decoder or the
 * script's timing that moves one moves the note. Re-measured 2026-10-03 by MENU-FADE: the menu is whole from its build
 * (the fader adds nothing after the roller's additive bind, research 141 §2), so the script's settle wait ends 91 ticks
 * sooner than when the page drew a lit ramp and a second of black first -- s00 at MENULOOP's picture 24 where it was
 * 115, every later capture 91 pictures earlier -- and each score is of another picture; the roller's quads are drawn
 * additive besides. Before: masked 97.2 97.3 96.7 97.4 94.3 94 95.2 94.7 90.4 95.7 96.2 95.6 94.1 94.6 94.2 96.7 91.7
 * 93.2 97.2, whole 97.2 97.4 96.9 97.3 94.3 94 95.2 94.7 90.4 95.7 96.2 95.6 94 94.6 94.3 96.4 91.5 93 97.1. The lowest
 * is now s17 (91.1 masked, 90.9 whole: MENULOOP's picture 3,084), where it was s08 (90.4).
 */
const MASKED_PINS = [97.1, 97.1, 96.8, 96.8, 96.8, 93.2, 93.6, 93.8, 94.1, 94.1, 96, 95.9, 95, 92.5, 94.1, 96.4, 92.9, 91.1, 95.2];
const WHOLE_PINS = [97.2, 97.1, 96.6, 96.9, 96.8, 93.2, 93.6, 93.8, 94.1, 94.1, 96, 95.9, 94.9, 92.6, 94.2, 96.2, 92.7, 90.9, 94.9];

const built = (run: TitleRun, name: string): number[] => run.events.filter((e) => e.kind === 'dialog' && e.name === name).map((e) => e.t);
const window = (run: TitleRun): Capture[] => run.captures.filter((c) => Number(c.name.slice(1, 3)) < TITLE_MENU_WINDOW);

describe.skipIf(!HAVE)(`title_menu.txt on the page's path, the movie black${HAVE ? '' : ' (no disc, or no scripts/parity under SOCOM_PC_ROOT)'}`, () => {
  /**
   * Recorded, not the acceptance: over the black stand-in the script's own `untilref` never recognises the menu.
   * drive.py's thumbnail crops the frame to its content first (`crop_to_content`), so a menu drawn over black is cropped
   * to the dialog's own box and stretched -- 47.3 from the reference's rows, the bar 14 -- and the twelve presses run
   * out before s00 (research 141 §4). The movie behind the menu is what makes the script's step pass.
   */
  let run: TitleRun;
  beforeAll(async () => { run = await titleRun(false, 'black'); }, 600_000);

  it('does not match the reference over the black movie: twelve presses, the crop to content (why the drawn run is the acceptance)', () => {
    expect(run.log.find((l) => l.startsWith('untilref('))).toBe('untilref(scripts/parity/ref_main_menu_ours.png): 12 presses, dist=47.3, matched=False');
    expect(built(run, 'dlgMenu.rdr')).toHaveLength(1);
  });
});

describe.skipIf(!HAVE || !HAVE_WASM)(`title_menu.txt on the page's path, the movie drawn${!HAVE ? ' (no disc or captures)' : !HAVE_WASM ? ' -- skipped: no libmpeg2.wasm (S2U_FMV_WASM)' : ''}`, () => {
  let run: TitleRun;
  let scored: Scored[];
  beforeAll(async () => { run = await titleRun(true, 'movie'); scored = scoreRun(run); }, 900_000);

  it('reaches dlgMenu by the script\'s own untilref (CROSS skips Intro_2) and holds it, MENULOOP playing, through s18', () => {
    expect(run.log.find((l) => l.startsWith('untilref('))).toBe('untilref(scripts/parity/ref_main_menu_ours.png): 2 presses, dist=3.7, matched=True');   // 3.6 until MENU-FADE: the match comes 91 pictures sooner
    expect(run.captures.map((c) => c.name)).toEqual(Array.from({ length: 23 }, (_, k) => `s${String(k).padStart(2, '0')}_none.png`));
    const names = run.events.filter((e) => e.kind === 'dialog').map((e) => (e as { name: string }).name);
    expect(names).toEqual(['dlgIntroScreen.rdr', 'dlgIntroCinematic.rdr', 'dlgSecondCinematic.rdr', 'dlgMenu.rdr', 'dlgAttractCinematic.rdr']);
    const menu = built(run, 'dlgMenu.rdr')[0]!;
    for (const c of window(run)) {
      expect(c.dialog, c.name).toBe('dlgMenu.rdr');
      expect(c.picture, c.name).toBe(Math.round((c.t - menu) / UI_TICK_SECONDS) - 2);   // MENULOOP from 0 at the build, a picture a tick
    }
    console.log('title run (movie):', JSON.stringify({ menu, attract: built(run, 'dlgAttractCinematic.rdr'), steps: run.manifest.map((m) => [m.label, m.t]), pictures: run.captures.map((c) => c.picture) }));
  });

  it('scores every menu capture s00..s18 >= 90 against ref_main_menu_ours.png with the MENULOOP masked -- and whole, the gate\'s own rule (the pins)', () => {
    console.log('title run (movie) masked/whole/blocks:', scored.map((x) => `${x.name.slice(0, 3)}=${x.masked}/${x.whole}/${x.blocks}`).join(' '));
    const inside = scored.filter(inWindow);
    for (const x of inside) expect(x.masked, `${x.name} masked`).toBeGreaterThanOrEqual(TITLE_MIN_SCORE);
    expect(titleVerdict(inside.map((x) => [x.name, x.masked] as const)).ok).toBe(true);
    expect(titleVerdict(inside.map((x) => [x.name, x.whole] as const)).ok).toBe(true);
    expect(inside.map((x) => x.masked)).toEqual(MASKED_PINS);
    expect(inside.map((x) => x.whole)).toEqual(WHOLE_PINS);
  });

  it('s19 is the menu over MENULOOP\'s own fade to black (its pictures from ~3,400 on), as the gate\'s s19; s20 the menu black under UiAttractMode\'s fade, as the gate\'s s20; s21.. the attract (printed, not counted)', () => {
    const s19 = run.captures[19]!;
    expect(s19.dialog).toBe('dlgMenu.rdr');
    expect(s19.picture!).toBe(3444);                                              // 3,535 until MENU-FADE moved every capture 91 pictures sooner
    expect(scored[19]!.whole).toBe(86.8);                                         // the gate's s19 band is 83-90 (B18); 82.9 at picture 3,535
    // s20 comes 120.1 s after s00, 0.2 s before the attract's build (121.2 s after the menu's): the menu still, black
    // -- UiAttractMode hides the roller first, so its MENUFADER fade covers (research 141 §2) -- where the capture 3.0 s
    // later used to be the attract's Intro_2. The gate's own s20 is black.
    const s20 = run.captures[20]!;
    expect([s20.dialog, s20.picture, scored[20]!.blocks, scored[20]!.whole]).toEqual(['dlgMenu.rdr', 3624, 280, 60.3]);
    expect(s20.frame.data.every((v) => v <= 4)).toBe(true);                       // the fade's last ticks: nothing over 4 of 255
    for (const c of run.captures.slice(21)) expect(c.dialog, c.name).toBe('dlgAttractCinematic.rdr');
  });
});
