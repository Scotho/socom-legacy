import { decodePng, type Rgb } from '../captureImage';
import { judge, letterboxBox, resample, type Judged, type Rect } from '../captureScore';

/**
 * GM-11c (the GPU menus plan, row GM-11c; research 380 §1, the C class): the menus' capture scorers in one module, read
 * by the vitest scorers (`uiCompositorScore.test.ts`) and by `tools/menu-gpu-compare.ts`, which scores a frame the
 * browser wrote out (GM-11b's frame files) by the same functions. Moved, not rewritten: `crop` and `inPcsx2Window` are
 * `uiCompositorScore.test.ts`'s own (PLAT-14, PLAT-30; W7.R7), the score is `captureScore.ts`'s `judge`.
 *
 * `MENU_C_ROWS` is the one shared score table: each pinned row of the moved scorer, the frame it scores (named as a
 * frame file's `dialog` names it), the reference under `SOCOM_PC_ROOT`, the view and the region, and the digits the
 * scorer pins. A row is unchanged on a frame when every pinned field is equal at the scorer's printed precision (`judge`
 * rounds score and control to one decimal, `captureScore.ts` `pyRound`); the pins are the software frame's, held by
 * `uiCompositorScore.test.ts`'s own literals and by `menuGpuCompare.test.ts` on a software frame file.
 */

/** A frame's region, top row first, 640 x 448 coordinates. */
export const crop = (img: Rgb, [x0, y0, x1, y1]: Rect): Rgb => {
  const w = x1 - x0, h = y1 - y0, data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) data.set(img.data.subarray(((y + y0) * img.width + x0) * 3, ((y + y0) * img.width + x1) * 3), y * w * 3);
  return { width: w, height: h, data };
};

/** Our pixel-exact frame as PCSX2's 640x448 window shows it: the picture squeezed into the 4:3 box, bars black (W7.R7). */
export const inPcsx2Window = (img: Rgb): Rgb => {
  const box = letterboxBox(640, 448);
  const pic = resample({ width: 640, height: 448, channels: 3, data: img.data }, Math.round(box[2] - box[0]), 448, 'bicubic');
  const out: Rgb = { width: 640, height: 448, data: new Uint8Array(640 * 448 * 3) };
  for (let y = 0; y < 448; y++) out.data.set(pic.data.subarray(y * pic.width * 3, (y + 1) * pic.width * 3), (y * 640 + Math.round(box[0])) * 3);
  return out;
};

/** What a row pins: the fields its scorer asserts, at the scorer's printed digits (some pin the score alone). */
export interface MenuCPin { score: number; control?: number; matched?: boolean }

export interface MenuCRow {
  /** The row's name in the table. */
  id: string;
  /** The frame it scores, as a frame file's header `dialog` names it: a dialog drawn as built (MENUFADER at 0), or
   * `<dialog> hide <node>` for the same with one node hidden. Scale 1, opaque. */
  frame: string;
  /** The reference, relative to `SOCOM_PC_ROOT`. */
  ref: string;
  /** The reference's size, as the scorer asserts it. */
  refSize: readonly [number, number];
  /** `frame`: our frame as drawn; `pcsx2Window`: squeezed into PCSX2's 4:3 box first (W7.R7). */
  view: 'frame' | 'pcsx2Window';
  /** Cropped to this band after the view (640 x 448 coordinates). */
  band?: Rect;
  /** Masked out of the score (`judge`'s `mask`). */
  mask?: readonly Rect[];
  pin: MenuCPin;
  /** The test that holds the pin. */
  heldBy: string;
}

/**
 * The frame names the rows score, exactly as a frame-file writer must put them in its header's `dialog` (GM-11c review
 * finding 5): a dialog drawn as built (MENUFADER at 0), and `<dialog> hide <node>` for the same frame with that node's
 * `visible` set false. Scale 1, opaque. A writer imports this list; `menuGpuCompare.test.ts` holds it equal to the rows'.
 */
export const MENU_C_FRAMES = Object.freeze(['dlgMenu.rdr', 'dlgMenu.rdr hide LoadGameBack', 'dlgCreateGame.rdr'] as const);

/** dlgMenu's SplashLogo (70, 45) 500 x 195, the rest masked (`uiCompositorScore.test.ts`). */
const LOGO: Rect[] = [[0, 0, 640, 45], [0, 240, 640, 448], [0, 45, 70, 240], [570, 45, 640, 240]];
/** dlgCreateGame's TITLE box: the PC project's (tools_py/tests/fixtures/lobby/make_screen_fixtures.py). */
const TITLE_BAND: Rect = [20, 18, 360, 58];
const HELD = 'tools/test/uiCompositorScore.test.ts';

/** The one shared score table (GM-11c): every pinned row of PLAT-14's scored items (W7.R6; research 112 §7). */
export const MENU_C_ROWS: readonly MenuCRow[] = Object.freeze([
  { id: 'dlgMenu.main_menu.whole', frame: 'dlgMenu.rdr', ref: 'scripts/parity/refs/main_menu.png', refSize: [320, 224], view: 'frame', pin: { score: 95.8, control: 60.2, matched: true }, heldBy: HELD },
  { id: 'dlgMenu.main_menu.logo', frame: 'dlgMenu.rdr', ref: 'scripts/parity/refs/main_menu.png', refSize: [320, 224], view: 'frame', mask: LOGO, pin: { score: 98.1, control: 38.2, matched: true }, heldBy: HELD },
  { id: 'dlgMenu.main_menu.no_LoadGameBack', frame: 'dlgMenu.rdr hide LoadGameBack', ref: 'scripts/parity/refs/main_menu.png', refSize: [320, 224], view: 'frame', pin: { score: 79.4 }, heldBy: HELD },
  { id: 'dlgMenu.pcsx2.corrected', frame: 'dlgMenu.rdr', ref: 'scripts/parity/ref_main_menu_ours.pcsx2.png', refSize: [640, 448], view: 'pcsx2Window', pin: { score: 97.1, control: 63.8, matched: true }, heldBy: HELD },
  { id: 'dlgMenu.pcsx2.uncorrected', frame: 'dlgMenu.rdr', ref: 'scripts/parity/ref_main_menu_ours.pcsx2.png', refSize: [640, 448], view: 'frame', pin: { score: 94.9 }, heldBy: HELD },
  { id: 'dlgMenu.pcsx2.no_LoadGameBack', frame: 'dlgMenu.rdr hide LoadGameBack', ref: 'scripts/parity/ref_main_menu_ours.pcsx2.png', refSize: [640, 448], view: 'pcsx2Window', pin: { score: 80.7, matched: false }, heldBy: HELD },
  { id: 'dlgCreateGame.title.pcsx2.corrected', frame: 'dlgCreateGame.rdr', ref: 'scripts/parity/refs/lobby/title_create_game.pcsx2.png', refSize: [340, 40], view: 'pcsx2Window', band: TITLE_BAND, pin: { score: 98.1, control: 75.2, matched: true }, heldBy: HELD },
  { id: 'dlgCreateGame.title.pcsx2.uncorrected', frame: 'dlgCreateGame.rdr', ref: 'scripts/parity/refs/lobby/title_create_game.pcsx2.png', refSize: [340, 40], view: 'frame', band: TITLE_BAND, pin: { score: 88.2 }, heldBy: HELD },
  { id: 'dlgCreateGame.title.recomp', frame: 'dlgCreateGame.rdr', ref: 'scripts/parity/refs/lobby/title_create_game.png', refSize: [340, 40], view: 'frame', band: TITLE_BAND, pin: { score: 97.9, control: 73.9, matched: true }, heldBy: HELD },
] satisfies MenuCRow[]);

export const menuCRow = (id: string): MenuCRow => {
  const r = MENU_C_ROWS.find((x) => x.id === id);
  if (!r) throw Error(`menuCRow: no row ${id}`);
  return r;
};

/** The frame as the row's scorer sees it: the view, then the band. */
export function viewFor(row: MenuCRow, frame: Rgb): Rgb {
  const seen = row.view === 'pcsx2Window' ? inPcsx2Window(frame) : frame;
  return row.band ? crop(seen, row.band) : seen;
}

/** A row's score on a frame (RGB, 640 x 448, top row first) against its reference: `judge`, as the scorer calls it. */
export function scoreCRow(row: MenuCRow, frame: Rgb, golden: Rgb): Judged {
  return judge(golden, viewFor(row, frame), row.mask ? { mask: row.mask } : {});
}

/** The pinned fields of a score, in the pin's order. */
export function pinnedOf(row: MenuCRow, j: Judged): MenuCPin {
  const out: MenuCPin = { score: j.score };
  if (row.pin.control !== undefined) out.control = j.control;
  if (row.pin.matched !== undefined) out.matched = j.matched;
  return out;
}

/** Unchanged at the scorer's printed precision: every pinned field equal (`judge` has already rounded to its digit). */
export function pinHolds(row: MenuCRow, j: Judged): boolean {
  const got = pinnedOf(row, j);
  return got.score === row.pin.score && got.control === row.pin.control && got.matched === row.pin.matched;
}

/** A reference PNG, read and its size checked against the row's. */
export function readReference(row: MenuCRow, bytes: Uint8Array): Rgb {
  const g = decodePng(bytes);
  if (g.width !== row.refSize[0] || g.height !== row.refSize[1]) {
    throw Error(`${row.ref}: ${g.width} x ${g.height}, the row pins ${row.refSize[0]} x ${row.refSize[1]}`);
  }
  return g;
}
