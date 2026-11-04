import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FsAssetSource } from '@s2u/archive/node';
import { MovieDecoder } from '@s2u/fmv';
import { UI_TICK_SECONDS, type MoviePicture, type OpenerEvent } from '@s2u/ui';
import { FrontEndSession, readFrontEndDisc } from '../../packages/viewer/src/frontEnd';
import { decodePng, rgbaToRgb, type Rgb } from '../captureImage';
import { judge } from '../captureScore';
import { engineFromFile } from '../fmv-spike';
import { NodeMovieSource, type NodeMovieFrame } from '../nodeMovieSource';

/**
 * BOOT-04's dev-disc acceptance (web research 139 §5, §7): the opener run as the page runs it -- `FrontEndSession`
 * on the disc's dialogs, sets and loader pictures, PLAT-21's host over a picture source that decodes the movies with
 * the page's own core (PLAT-19b's `MovieDecoder` on `libmpeg2.wasm`, one picture primed before each tick as the
 * worker would have it ready) -- from the loader's screens to `dlgMenu`'s build, with START pressed early in Intro_2.
 * Two kinds of evidence, kept apart:
 *
 * - **the sequence** (a transcription run on the disc's own scripts): the dialogs, the movies and the stubs in the
 *   original's order, at the ticks the scripts and the manager give (the same numbers as the CI test's synthetic
 *   programs: 55 ticks of card checks, 18 to a build, 313 across SONY448);
 * - **capture**: the frames the page draws while SONY448 plays, at the pictures web research 98 §1 matched to the
 *   archived PCSX2 captures of the golden manifest's rows `boot.sony-card-typing` (`pcsx2_mission_a/s02`, pictures
 *   38-39), `boot.sony-card-fade` (`s03`, 137) and `boot.zipper-card` (`s04`, 229-265; the recompiled game's
 *   `w00_006`), scored by PLAT-30's scorer (`judge`, the gate's whole-frame rule) against the block's bar of 90.
 *
 * The opener runs once (`beforeAll`); each kind is its own test, so a host that lacks one kind's evidence skips that
 * test VISIBLY and cannot report it met: the whole file skips without the disc (`SOCOM_DISC`, else
 * `SOCOM_PC_ROOT/game/disc`) or the built wasm (`packages/fmv/wasm/build.sh`, or `S2U_FMV_WASM`); the capture test
 * skips, naming what is missing, unless all four archived captures are under `SOCOM_PC_ROOT/logs/parity/`, and when
 * it runs every one of the four is scored. One movie decoded whole (SONY448, 310 pictures) and the first pictures of
 * Intro_2: a named file, not the whole suite.
 */
const ROOT = process.env.SOCOM_PC_ROOT ?? null;
const DISC = [process.env.SOCOM_DISC, ROOT ? resolve(ROOT, 'game/disc') : undefined]
  .find((d) => d !== undefined && existsSync(resolve(d, 'RUN/UI/READERC.ZAR')) && existsSync(resolve(d, 'RUN/MOVIES/COMMON/SONY448.PSS'))) ?? null;
const WASM = process.env.S2U_FMV_WASM ?? resolve(import.meta.dirname, '../../packages/fmv/wasm/out/libmpeg2.wasm');
const HAVE = DISC !== null && existsSync(WASM);
/** The archived captures the manifest's boot rows name, with the SONY448 picture research 98 §1 matched to each. */
const CAPTURES: { name: string; path: string; index: number }[] = [
  { name: 'mission_a/s02 ~ picture 38', path: 'logs/parity/runs/pcsx2_mission_a/s02_CROSS.png', index: 38 },
  { name: 'mission_a/s03 ~ picture 137', path: 'logs/parity/runs/pcsx2_mission_a/s03_CROSS.png', index: 137 },
  { name: 'mission_a/s04 ~ picture 232', path: 'logs/parity/runs/pcsx2_mission_a/s04_CROSS.png', index: 232 },
  { name: 'x51 title w00_006 ~ picture 232', path: 'logs/parity/gate/x51_gate_iop/title/w00_006.png', index: 232 },
];
const MISSING_CAPTURES = ROOT ? CAPTURES.filter((c) => !existsSync(resolve(ROOT, c.path))).map((c) => c.path) : ['SOCOM_PC_ROOT unset'];
const HAVE_CAPTURES = MISSING_CAPTURES.length === 0;

type Frame = NodeMovieFrame;

const png = (p: string): Rgb => decodePng(new Uint8Array(readFileSync(p)));
const tick = (t: number): number => Math.round(t / UI_TICK_SECONDS);

describe.skipIf(!HAVE)(`the opener on the disc with the page's decoder${HAVE ? '' : ' (no disc or no libmpeg2.wasm)'}`, () => {
  const events: OpenerEvent[] = [];
  const drawn = new Map<number, Rgb>();
  const opened: string[] = [];

  // The one run: the opener as the page runs it, START pressed early in Intro_2, three SONY448 frames rendered.
  beforeAll(async () => {
    const fs = new FsAssetSource(DISC!);
    const disc = await readFrontEndDisc(fs);
    expect(disc.missing).toEqual([]);
    const engine = await engineFromFile(WASM);
    const source = new NodeMovieSource(new MovieDecoder(engine, { output: 'rgba' }), fs, (p) => existsSync(resolve(DISC!, p)));
    const s = new FrontEndSession<Frame>({
      disc, source, onEvent: (e) => events.push(e),
      moviePicture: (p: MoviePicture) => { const f = p.image as Frame; return { width: f.width, height: f.height, data: new Uint8ClampedArray(f.rgba.buffer, f.rgba.byteOffset, f.rgba.byteLength) }; },
    });
    const target = { frame: null as Rgb | null, createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData: (img: { width: number; height: number; data: Uint8ClampedArray }) => { target.frame = rgbaToRgb(img.width, img.height, img.data); } };
    const WANT = new Set(CAPTURES.map((c) => c.index));
    let now = 0;
    s.advance(now);
    let pressed = false;
    for (let i = 0; i < 1200; i++) {
      await source.prime();
      s.advance(now += 1000 * UI_TICK_SECONDS);
      const g = s.machine.shell();
      const pic = s.layer.picture()?.image as Frame | undefined;
      if (g?.currentName === 'dlgIntroCinematic.rdr' && pic && WANT.has(pic.index) && !drawn.has(pic.index)) {
        s.render(target as never);
        drawn.set(pic.index, target.frame!);
      }
      if (g?.currentName === 'dlgSecondCinematic.rdr' && pic && pic.index >= 2 && !pressed) { pressed = true; s.press('START'); }
      if (events.some((e) => e.kind === 'dialog' && e.name === 'dlgMenu.rdr')) break;
    }
    for (let i = 0; i < 5; i++) { await source.prime(); s.advance(now += 1000 * UI_TICK_SECONDS); }   // dlgMenu's ONSTART ticks (MENU-02a's from here)
    try { engine.close(); } catch { /* the engine's close is the decoder's */ }
    opened.push(...source.opened);
  }, 120_000);

  const named = (k: OpenerEvent['kind']) => events.filter((e) => e.kind === k);

  it('runs the original\'s order at the scripts\' ticks and presents SONY448\'s 310 pictures (the sequence)', () => {
    expect(named('dialog').map((e) => (e as { name: string }).name)).toEqual(['dlgIntroScreen.rdr', 'dlgIntroCinematic.rdr', 'dlgSecondCinematic.rdr', 'dlgMenu.rdr']);
    expect(opened).toEqual(['RUN/MOVIES/COMMON/SONY448.PSS', 'RUN/MOVIES/INTRO_2.PSS', 'RUN/MOVIES/COMMON/MENULOOP.PSS']);
    const built = named('dialog').map((e) => tick(e.t)), switches = named('switch').map((e) => tick(e.t));
    expect(built[0]).toBe(96);                                                   // the loader's 3.20 s (research 130's placeholders)
    expect(switches[0]! - built[0]!).toBe(55);                                   // dlgIntroScreen's ONSTART on the stubs
    expect(built[1]! - switches[0]!).toBe(18);                                   // the switch's fade and countdown
    expect(switches[1]! - built[1]!).toBe(310 + 3);                              // SONY448: 310 pictures, the empty tick, the event's, the switch's A5
    expect(built[2]! - switches[1]!).toBe(18);
    // The key came 3 pictures into Intro_2, with menu_fade_up still lowering MENUFADER (stopped by goto_menu at ~0.9):
    // the switch's fade to 0.99 is then 1-2 ticks, not 15, before the three-frame countdown (research 115 §4.1, n small).
    expect(built[3]! - switches[2]!).toBeGreaterThanOrEqual(4);
    expect(built[3]! - switches[2]!).toBeLessThanOrEqual(18);
    expect(named('button')).toHaveLength(1);                                     // START during Intro_2 -> goto_menu
    const stubs = named('stub').map((e) => (e as { name: string }).name);
    expect(stubs.slice(0, 3)).toEqual(['IsControllerConnected', 'MC_ChPort', 'IsMemCardInserted']);
    expect(stubs).toContain('LoadConfig');
    expect(stubs).not.toContain('StoreOptions');                                  // OPTIONS' own binding answers it now (ce275d8bd, Chris's settings), not a stub
    expect(stubs.filter((n) => n === 'MC_Changed').length).toBeGreaterThanOrEqual(1);   // dlgMenu's has_memcard_changed, on arrival
    expect(drawn.size).toBe(3);
    console.log('intro shell ticks', JSON.stringify({ built, switches }));
  });

  // The captures (the manifest's boot.sony-card-typing, boot.sony-card-fade, boot.zipper-card; research 98 §1's
  // picture matches). The bar is the block's 90; the numbers measured 2026-10-02 are pinned beside it (research 139 §7).
  // Skipped VISIBLY when one of the four is not on this host: a run that scores nothing is not the acceptance met.
  it.skipIf(!HAVE_CAPTURES)(`the frames it draws match the PCSX2 captures (>= 90, all four rows)${HAVE_CAPTURES ? '' : ` -- skipped, missing: ${MISSING_CAPTURES.join(', ')}`}`, () => {
    expect(drawn.size).toBe(3);
    const scored: Record<string, [number, number]> = {};
    for (const c of CAPTURES) {
      const j = judge(png(resolve(ROOT!, c.path)), drawn.get(c.index)!);
      scored[c.name] = [j.score, j.mad];
      expect(j.score, c.name).toBeGreaterThanOrEqual(90);
    }
    console.log('intro shell scores', JSON.stringify(scored));
    expect(Object.keys(scored)).toHaveLength(CAPTURES.length);
    // Measured 2026-10-02 (research 139 §7): 100.0 on all four, mad 0.0002 / 0.0001 / 0.0004 / 0.0001 -- research 98
    // §1's decoded-picture matches, now through the page's whole path. A drawing change that moves one moves the note.
    for (const [name, [score, mad]] of Object.entries(scored)) {
      expect(score, name).toBe(100);
      expect(mad, name).toBeLessThanOrEqual(0.001);
    }
  });
});
