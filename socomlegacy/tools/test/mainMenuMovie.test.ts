import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FsAssetSource } from '@s2u/archive/node';
import { MovieDecoder } from '@s2u/fmv';
import { UI_TICK_SECONDS, type MoviePicture } from '@s2u/ui';
import { FrontEndSession, readFrontEndDisc } from '../../packages/viewer/src/frontEnd';
import { withMenuArt } from '../../packages/viewer/src/menuArt';
import { decodePng, rgbaToRgb, type Rgb } from '../captureImage';
import { judge, letterboxBox, resample } from '../captureScore';
import { engineFromFile } from '../fmv-spike';
import { menuloopMask } from '../menuloopMask';
import { NodeMovieSource, type NodeMovieFrame } from '../nodeMovieSource';

/**
 * MENU-02a's capture acceptance taken again with the movie drawn (web research 140 §5; sprint 11's close review,
 * finding 3): `mainMenuDisc.test.ts` scores `dlgMenu` over a black MENULOOP (86.9 masked against
 * `ref_main_menu_ours.pcsx2.png`, under the bar, the cause the movie); here the same session -- `FrontEndSession` on the
 * disc through `withMenuArt`, `dlgMenu` as the start dialog -- is handed PLAT-19b's decoder core on `libmpeg2.wasm` in
 * Node (`NodeMovieSource`, as `titleMenuDisc.test.ts`), so MENULOOP plays behind the menu from picture 0 at the build.
 * Scored by PLAT-30's `judge` against the manifest's `menu.main` row: `logs/parity/s4_pcsx2/A_04.png` (640 x 480, the
 * picture whole) and `scripts/parity/ref_main_menu_ours.pcsx2.png` (640 x 448, the picture letterboxed: ours squeezed
 * into the 4:3 box), with the MENULOOP region masked (the black run's rule, `menuloopMask`, applied to the same draw
 * list drawn with its movie item black -- 149 blocks, as the black run's) and whole.
 *
 * Which MENULOOP picture either capture shows is not recorded (the PCSX2 runs kept no clock). Two frames are scored:
 * the one at 2.5 s (75 ticks, MENULOOP's picture 73), the moment `mainMenuDisc.test.ts` pins; and the picture nearest
 * `A_04` by the whole-frame score, found by a sweep of every third picture of the menu's stay (picture 202, tick 204;
 * research 140 §5 records the sweep and how weakly the score tells the movie's moments apart). The numbers are pinned
 * beside the bar, never rounded. Skips without the disc, the captures or the built wasm (`S2U_FMV_WASM`).
 */
const ROOT = process.env.SOCOM_PC_ROOT ?? null;
const DISC = [process.env.SOCOM_DISC, ROOT ? resolve(ROOT, 'game/disc') : undefined]
  .find((d) => d !== undefined && existsSync(resolve(d, 'RUN/UI/READERC.ZAR')) && existsSync(resolve(d, 'RUN/UI/UI_GEO.ZED'))) ?? null;
const A04 = ROOT ? resolve(ROOT, 'logs/parity/s4_pcsx2/A_04.png') : null;
const REF = ROOT ? resolve(ROOT, 'scripts/parity/ref_main_menu_ours.pcsx2.png') : null;
const WASM = process.env.S2U_FMV_WASM ?? resolve(import.meta.dirname, '../../packages/fmv/wasm/out/libmpeg2.wasm');
const HAVE = DISC !== null && A04 !== null && existsSync(A04) && REF !== null && existsSync(REF);
const HAVE_WASM = existsSync(WASM);

const png = (p: string): Rgb => decodePng(new Uint8Array(readFileSync(p)));
/** Our frame as PCSX2's 640 x 448 window shows it: squeezed into the 4:3 box, bars black (W7.R7; `mainMenuDisc.test.ts`). */
const inPcsx2Window = (img: Rgb): Rgb => {
  const box = letterboxBox(640, 448);
  const pic = resample({ width: 640, height: 448, channels: 3, data: img.data }, Math.round(box[2] - box[0]), 448, 'bicubic');
  const out: Rgb = { width: 640, height: 448, data: new Uint8Array(640 * 448 * 3) };
  for (let y = 0; y < 448; y++) out.data.set(pic.data.subarray(y * pic.width * 3, (y + 1) * pic.width * 3), (y * 640 + Math.round(box[0])) * 3);
  return out;
};

interface Grab { tick: number; picture: number | null; frame: Rgb; dialog: Rgb; undrawn: string[]; lit: string[] }

/** `dlgMenu` with MENULOOP decoded, grabbed at each tick of `at` (ascending): the frame, and the dialog alone for the mask. */
async function menuWithMovie(at: readonly number[]): Promise<Grab[]> {
  const fs = new FsAssetSource(DISC!);
  const disc = await withMenuArt(fs, await readFrontEndDisc(fs));
  const engine = await engineFromFile(WASM);
  const source = new NodeMovieSource(new MovieDecoder(engine, { output: 'rgba' }), fs, (p) => existsSync(resolve(DISC!, p)));
  let hide = false;
  const s = new FrontEndSession<NodeMovieFrame>({
    disc, startDialog: 'dlgMenu.rdr', loader: false, source,
    moviePicture: (p: MoviePicture) => { if (hide) return null; const f = p.image as NodeMovieFrame; return { width: f.width, height: f.height, data: new Uint8ClampedArray(f.rgba.buffer, f.rgba.byteOffset, f.rgba.byteLength) }; },
  });
  const draw = (): { frame: Rgb; undrawn: string[] } => {
    let frame: Rgb | null = null;
    const r = s.render({ createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData: (img) => { frame = rgbaToRgb(img.width, img.height, img.data); } });
    return { frame: frame!, undrawn: r.undrawn };
  };
  let ticks = 0;
  s.advance(0);
  const out: Grab[] = [];
  for (const t of at) {
    while (ticks < t) { await source.prime(); ticks++; s.advance(ticks * 1000 * UI_TICK_SECONDS); }
    expect(s.machine.shell()?.currentName).toBe('dlgMenu.rdr');
    const { frame, undrawn } = draw();
    // The dialog alone: the same draw list with the movie item drawn black. (Clearing `s.layer` would not do it: the
    // frame's draw list already holds the picture.)
    hide = true;
    const dialog = draw().frame;
    hide = false;
    const pic = s.layer.picture();
    const lit = s.machine.shell()!.screen.models[0]!.parts.filter((p) => p.active && p.name.endsWith('_on')).map((p) => p.name);
    out.push({ tick: ticks, picture: (pic?.image as NodeMovieFrame | undefined)?.index ?? null, frame, dialog, undrawn, lit });
  }
  try { engine.close(); } catch { /* the engine's close is the decoder's */ }
  return out;
}

const scoreA04 = (g: Grab) => {
  const golden = png(A04!);
  expect([golden.width, golden.height]).toEqual([640, 480]);
  return { masked: judge(golden, g.frame, { mask: menuloopMask(g.dialog) }), whole: judge(golden, g.frame) };
};
const scoreRef = (g: Grab) => {
  const golden = png(REF!);
  expect([golden.width, golden.height]).toEqual([640, 448]);
  const ours = inPcsx2Window(g.frame);
  return { masked: judge(golden, ours, { mask: menuloopMask(g.dialog) }), whole: judge(golden, ours) };
};
const pin = (j: { score: number; control: number; matched: boolean }): [number, number, boolean] => [j.score, j.control, j.matched];

/** The 2.5-s moment (`mainMenuDisc.test.ts`'s), and the picture nearest `A_04` found by the sweep (research 140 §5). */
const AT_2_5_S = 75;
const NEAREST_A04 = 204;

describe.skipIf(!HAVE || !HAVE_WASM)(`the main menu's frame with MENULOOP drawn${!HAVE ? ' (no disc or captures)' : !HAVE_WASM ? ' -- skipped: no libmpeg2.wasm (S2U_FMV_WASM)' : ''}`, () => {
  let grabs: Grab[];
  beforeAll(async () => { grabs = await menuWithMovie([AT_2_5_S, NEAREST_A04]); }, 600_000);
  const at = (t: number): Grab => grabs.find((g) => g.tick === t)!;

  it('at 2.5 s: MENULOOP\'s picture 73 behind the menu, NEW GAME lit, nothing undrawn, the black run\'s 149 masked blocks', () => {
    const g = at(AT_2_5_S);
    expect([g.picture, g.undrawn, g.lit, menuloopMask(g.dialog).length]).toEqual([AT_2_5_S - 2, [], ['new_on'], 149]);
  });

  it('at 2.5 s against A_04 and ref_main_menu_ours.pcsx2.png, masked and whole (the pins)', () => {
    const g = at(AT_2_5_S);
    const a = scoreA04(g), r = scoreRef(g);
    console.info(`2.5 s: A_04 masked ${JSON.stringify(a.masked)} whole ${JSON.stringify(a.whole)}; ref masked ${JSON.stringify(r.masked)} whole ${JSON.stringify(r.whole)}`);
    expect(pin(a.masked)).toEqual([96, 41.6, true]);                // was 91.1 over the black movie (mainMenuDisc.test.ts)
    expect(pin(a.whole)).toEqual([97.9, 58.7, true]);                // was 81.9
    expect(pin(r.masked)).toEqual([95.6, 44, true]);                 // was 86.9, under the bar; 95.7 until the roller drew additive (MENU-FADE, research 141 §2)
    expect(pin(r.whole)).toEqual([97.8, 63.8, true]);                // was 83.9
  });

  it('the picture nearest A_04 (202), masked and whole against both references (the pins)', () => {
    const g = at(NEAREST_A04);
    expect([g.picture, g.lit]).toEqual([NEAREST_A04 - 2, ['new_on']]);
    const a = scoreA04(g), r = scoreRef(g);
    console.info(`picture ${g.picture}: A_04 masked ${JSON.stringify(a.masked)} whole ${JSON.stringify(a.whole)}; ref masked ${JSON.stringify(r.masked)} whole ${JSON.stringify(r.whole)}`);
    // Three of these four fell 0.1 when the roller's quads took their textures' additive blend (MENU-FADE, research 141
    // §2): 96.1, 98.1 and 97.8 before. The roller is brighter on the page than on the console under either blend (§7).
    expect(pin(a.masked)).toEqual([96, 41.6, true]);
    expect(pin(a.whole)).toEqual([98, 58.7, true]);                  // the sweep's best against A_04
    expect(pin(r.masked)).toEqual([95.6, 44, true]);
    expect(pin(r.whole)).toEqual([97.7, 63.8, true]);
  });
});
