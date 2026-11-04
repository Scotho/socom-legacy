import { PAD_GLYPH } from '@s2u/scene';
import { RIGHT_EDGE_SUBTEXEL } from '@s2u/ui';
import { botTextCharacters, plainBotText } from './botPresentation';

/**
 * The HUD's font (socomlegacy/docs/research/87-hud.md §3): `READERC.ZAR/fonts.rdr`'s face `font_text_01` over
 * `FONT_TXR.ZED`'s `font_text_01.tif` (512x128, PSMT4, a white alpha ramp in its palette 139). The face's header:
 * `textures (font_text_01.tif font_special_01.tif)`, `xspacing 0`, `opacity 0.7`, `scale 1`, `topy 0`, `boty 15`,
 * `dropshadow { offset (1.5 1.5) color (0 0 0) opacity 0.75 }`. Transcribed here as `tuning.ts` transcribes
 * `dynamics.rdr` -- the viewer does not fetch `READERC.ZAR` at run time -- and checked against the archive by
 * `test/hudFont.test.ts` when the extracted tree is present.
 *
 * Each glyph is `[code, UL.x, UL.y, LR.x, LR.y, DispPos.x]` in texels of the atlas, top row first (the atlas is
 * read flipped: `./hudAssets`). The face's 95 printable ASCII glyphs; the 90 accented ones and the `font_special_01`
 * button faces are not transcribed. `DispPos.y` is 0, `HorScale` and `VertScale` 1 and `texture` 1 on every one;
 * `baseline` is 1 on `!` and `.` alone and not modelled.
 */
export const FONT_TEXT_01 = {
  texture: 'font_text_01.tif',
  opacity: 0.7,
  xspacing: 0,
  /** The glyph cell's height in texels: every glyph is 25 rows (0-25, 25-50, 50-75, 100-125). */
  cell: 25,
  /**
   * `dropshadow { offset (1.5 1.5) color (0 0 0) opacity 0.75 }`: the engine keeps the offset as integers (font
   * `+0x40/+0x44`), so the shadow is one glyph unit right and down, scaled with the string.
   */
  dropShadow: { offset: [1.5, 1.5] as [number, number], pixels: [1, 1] as [number, number], opacity: 0.75 },
  glyphs: [
  [32, 2, 100, 12, 125, -3], [33, 411, 0, 420, 25, -1], [34, 73, 25, 85, 50, -1], [35, 432, 0, 446, 25, -1],
  [36, 444, 0, 456, 25, -1], [37, 456, 0, 468, 25, -1], [38, 482, 0, 498, 25, -1], [39, 179, 25, 186, 50, -1],
  [40, 1, 25, 11, 50, -1], [41, 9, 25, 19, 50, -1], [42, 496, 0, 509, 25, -1], [43, 31, 25, 44, 50, 0],
  [44, 186, 25, 195, 50, -1], [45, 125, 25, 135, 50, -1], [46, 193, 25, 202, 50, -1], [47, 200, 25, 212, 50, -1],
  [48, 389, 0, 399, 25, 0], [49, 295, 0, 303, 25, 0], [50, 304, 0, 313, 25, 0], [51, 314, 0, 323, 25, 0],
  [52, 324, 0, 334, 25, 0], [53, 335, 0, 345, 25, 0], [54, 346, 0, 356, 25, 0], [55, 357, 0, 366, 25, 0],
  [56, 367, 0, 377, 25, 0], [57, 378, 0, 388, 25, 0], [58, 66, 25, 75, 50, -1], [59, 171, 25, 181, 50, -1],
  [60, 83, 25, 98, 50, -1], [61, 133, 25, 148, 50, -1], [62, 96, 25, 111, 50, -1], [63, 109, 25, 120, 50, -1],
  [64, 418, 0, 432, 25, -1], [65, 2, 0, 13, 25, 0], [66, 14, 0, 25, 25, 0], [67, 26, 0, 36, 25, 0],
  [68, 37, 0, 48, 25, 0], [69, 49, 0, 58, 25, 0], [70, 59, 0, 68, 25, 0], [71, 69, 0, 80, 25, 0],
  [72, 81, 0, 91, 25, 0], [73, 92, 0, 98, 25, 0], [74, 99, 0, 107, 25, 0], [75, 108, 0, 119, 25, 0],
  [76, 120, 0, 128, 25, 0], [77, 129, 0, 142, 25, 0], [78, 143, 0, 153, 25, 0], [79, 154, 0, 166, 25, 0],
  [80, 166, 0, 176, 25, 0], [81, 177, 0, 188, 25, 0], [82, 189, 0, 199, 25, 0], [83, 200, 0, 210, 25, 0],
  [84, 211, 0, 220, 25, 0], [85, 221, 0, 231, 25, 0], [86, 232, 0, 244, 25, 0], [87, 245, 0, 259, 25, 0],
  [88, 261, 0, 271, 25, 0], [89, 272, 0, 283, 25, 0], [90, 284, 0, 294, 25, 0], [91, 156, 25, 165, 50, -1],
  [92, 146, 25, 158, 50, -1], [93, 163, 25, 173, 50, -1], [94, 469, 0, 484, 25, -1], [95, 19, 25, 29, 50, 0],
  [96, 118, 25, 127, 50, -1], [97, 211, 25, 221, 50, 0], [98, 222, 25, 232, 50, 0], [99, 233, 25, 241, 50, 0],
  [100, 242, 25, 252, 50, 0], [101, 253, 25, 262, 50, 0], [102, 263, 25, 272, 50, 0], [103, 273, 25, 283, 50, 0],
  [104, 284, 25, 294, 50, 0], [105, 294, 25, 301, 50, 0], [106, 302, 25, 309, 50, 0], [107, 310, 25, 319, 50, 0],
  [108, 320, 25, 325, 50, 0], [109, 326, 25, 340, 50, 0], [110, 341, 25, 351, 50, 0], [111, 352, 25, 362, 50, 0],
  [112, 363, 25, 373, 50, 0], [113, 374, 25, 384, 50, 0], [114, 385, 25, 392, 50, 0], [115, 393, 25, 402, 50, 0],
  [116, 403, 25, 412, 50, 0], [117, 413, 25, 423, 50, 0], [118, 424, 25, 434, 50, 0], [119, 435, 25, 449, 50, 0],
  [120, 450, 25, 460, 50, 0], [121, 461, 25, 471, 50, 0], [122, 472, 25, 481, 50, 0], [123, 50, 25, 60, 50, -1],
  [124, 46, 25, 52, 50, -1], [125, 60, 25, 68, 50, -1], [126, 399, 0, 413, 25, -1],
  ] as [number, number, number, number, number, number][],
} as const;

const BY_CODE = new Map<number, readonly [number, number, number, number, number, number]>(
  FONT_TEXT_01.glyphs.map((g) => [g[0], g]));

/**
 * The face's pad glyphs (web sprint 5, S4; research 95 §5.4, R95.11): `font_text_01`'s 18 glyphs on its second texture,
 * `font_special_01.tif` (256x64, `FONT_TXR.ZED`), transcribed from `fonts.rdr` as the ASCII ones are and checked against
 * it by `test/hudFont.test.ts`. Each is `[code, UL.x, UL.y, LR.x, LR.y, DispPos.x, DispPos.y, baseline, HorScale,
 * VertScale]`; every one carries `color (150 150 150)`. The strings hold the codes as bytes (`FUN_001f97b0`'s `%c` is
 * 0xbe or 0xbd, L56997-57001; the prompt's d-pad pair 0xa3 / 0xaf sits in the ELF's lines).
 *
 * The d-pad's four (`DPAD_GLYPH_DIRECTION_READING`, settled): 163 (0xa3) points **right**, 175 (0xaf) **left**, 177
 * (0xb1) **down**, 181 (0xb5) **up** -- read off the atlas's pixels (each cell a pentagon, flat on one side and pointed
 * on the other; `test/hudFont.test.ts` measures it on the disc's atlas), and agreeing with the code: the dead player's
 * "Use the 0xa3 and 0xaf directional buttons to cycle through living teammates" is served by pad bytes +3 (Right,
 * next teammate `+0xfcd` -> `FUN_00547170`) and +4 (Left, previous `+0xfce` -> `FUN_00546fa0`) in `FUN_00592560`
 * L451683-451694 and its consumer L412734-412751 -- not Up/Down as research 94's `GLYPH_READING` inferred.
 */
export const FONT_SPECIAL_01 = {
  texture: 'font_special_01.tif',
  /** `color (150 150 150)` on every glyph: drawn in it, not the string's colour, at the string's alpha (`FUN_00361bd0` L260347-260362). */
  rgb: [150, 150, 150] as [number, number, number],
  glyphs: [
    [179, 75, 50, 100, 25, 0, 0, 0, 0.9, 0.9], [167, 150, 6, 175, 31, 0, 0, 2, 0.6, 0.6], [170, 125, 6, 150, 31, 0, 0, 2, 0.6, 0.6],
    [168, 100, 6, 125, 31, 0, 0, 2, 0.6, 0.6], [172, 0, 6, 25, 31, 0, 0, 0, 0.9, 0.9], [180, 25, 6, 50, 31, 0, 0, 0, 0.9, 0.9],
    [166, 50, 6, 75, 31, 0, 0, 0, 0.9, 0.9], [183, 75, 6, 100, 31, 0, 0, 0, 0.9, 0.9], [164, 207, 1, 255, 30, 0, 0, 4, 0.9, 0.9],
    [162, 0, 34, 47, 63, 0, 0, 4, 0.75, 0.75], [182, 46, 34, 81, 63, 0, 0, 4, 0.75, 0.75], [188, 80, 34, 116, 63, 0, 0, 4, 0.75, 0.75],
    [189, 114, 34, 150, 63, 0, 0, 4, 0.75, 0.75], [190, 148, 34, 183, 63, 0, 0, 4, 0.75, 0.75], [163, 182, 34, 202, 63, 0, 0, 2, 1, 1],
    [175, 200, 34, 219, 63, 0, 0, 2, 1, 1], [177, 218, 34, 237, 63, 0, 0, 2, 1, 1], [181, 236, 34, 255, 63, 0, 0, 2, 1, 1],
  ] as [number, number, number, number, number, number, number, number, number, number][],
} as const;

/** The d-pad glyphs' codes by direction (`DPAD_GLYPH_DIRECTION_READING`, settled above). */
export const DPAD_GLYPH = {
  right: PAD_GLYPH.DPAD_RIGHT, left: PAD_GLYPH.DPAD_LEFT, down: PAD_GLYPH.DPAD_DOWN, up: PAD_GLYPH.DPAD_UP,
} as const;

const SPECIAL_BY_CODE = new Map(FONT_SPECIAL_01.glyphs.map((g) => [g[0], g]));

/** Whether `layoutText` / `textWidth` read the pad glyphs: only the lines that carry them (the others keep 0xa3.. unknown). */
export interface TextOptions { special?: boolean }

/**
 * A pad glyph's width for the pen (`FUN_0035a7b0` L255868: `int(DispPos.x + width x HorScale)` over the elements) and its
 * advance (`FUN_00363c20`: `int((W - 1) x scale + 0.5) + xspacing`).
 */
function specialAdvance(g: readonly number[], scale: number): number {
  const w = Math.trunc(g[5]! + (g[3]! - g[1]!) * g[8]!);
  return Math.floor((w - 1) * scale + 0.5) + FONT_TEXT_01.xspacing;
}

/**
 * The text's vertical: a glyph's 25 texel rows cover 25 x `scale` x 448/480 pixels, its row 20 (the letters' foot) on
 * the baseline + 0.3. Fitted on the console frame's "30/30" and "2 MAGS" (research 87 §3: the vertical factor 0.84 at
 * the ammo box's 0.9, the baseline `CHUD`'s 382); the engine's own offsets (`DAT_0049e9a0/a8`) are runtime values
 * the decompilation does not hold.
 */
export const TEXT_V = 448 / 480;
const FOOT_ROW = 20, FOOT_OFFSET = 0.3;
/**
 * The pen's residual offset, PS2 pixels: with the GS's corner sampling reproduced (`./hud`'s `GS_SAMPLE_OFFSET`) the
 * console's strings still sit 0.6 left of the decompiled formula on all four lines measured (research 87 §6) -- the
 * screen offsets `DAT_0049ea00/04` are runtime values, so this is fitted, not read.
 */
export const PEN_NUDGE = -0.6;

/**
 * One glyph placed on the frame: its source rectangle in the atlas and its destination, top-left, y down. A pad glyph
 * names its atlas (`texture`, `FONT_SPECIAL_01`'s) and carries its own colour (`rgb`, on the 0-128 scale): it is drawn
 * in that colour at the string's alpha, and with no drop shadow -- the shadow pass runs only for a glyph with no
 * `color` (`FUN_003625e0` L260602-260620).
 */
export interface PlacedGlyph {
  char: string; u0: number; v0: number; u1: number; v1: number; x: number; y: number; w: number; h: number;
  texture?: string; rgb?: [number, number, number];
}

/** A glyph's pen advance (`FUN_00363c20`): `int((width - 1) x scale + 0.5) + xspacing`, the width with its DispPos. */
function advance(g: readonly number[], scale: number): number {
  const w = g[3]! - g[1]! + g[5]!;
  return Math.floor((w - 1) * scale + 0.5) + FONT_TEXT_01.xspacing;
}

/** The pad glyph of a character, when the line reads them. */
const special = (char: string, opts: TextOptions): readonly number[] | null =>
  (opts.special ? SPECIAL_BY_CODE.get(char.codePointAt(0)!) : undefined) ?? null;

/** The pen's travel over `text` (`FUN_00362b70`'s measure, for right-aligned and centred lines). */
export function textWidth(text: string, scale: number, opts: TextOptions = {}): number {
  let width = 0;
  for (const char of plainBotText(text)) {
    const s = special(char, opts);
    width += s ? specialAdvance(s, scale) : advance(BY_CODE.get(char.codePointAt(0)!) ?? BY_CODE.get(32)!, scale);
  }
  return width;
}

/**
 * SPECIAL_GLYPH_PLACEMENT_READING: a pad glyph's vertical, from `FUN_00361bd0`'s corners (L260389-260400,
 * L260431-260442) read on the frame's y-down (`DAT_0049e9f4` the 448/480 of `TEXT_V`): the quad's top at the pen's y +
 * (baseline - DispPos.y - h) x S and its height h x VertScale x S, `h` the element's rows +4 - +6 = LR.y - UL.y - 1
 * (D:L260388, D:L260431-260432; OBF-33's fold, matching the texels UL.y + 1 .. LR.y) -- so relative to the letters'
 * 25-row cell (whose top the fit puts at row 20 above the baseline) a pad glyph's top moves by
 * (baseline - DispPos.y - h + 25) rows and it shrinks toward its top. The 25 is the original's 24 (a letter's
 * LR.y - UL.y - 1, its head at -24) plus the row by which the letters' fitted top, drawn from UL.y, sits above the
 * original's, drawn from UL.y + 1 (LATER 594). The runtime offsets `DAT_0049e9a0/a8` are the
 * letters' fit's; the placement is the code's relative to it, not measured on a frame. Horizontally it is the letters'
 * rule with `HorScale`: `(width x HorScale - 1) x S + 0.5` wide from the pen + DispPos.x x S.
 */
export const SPECIAL_GLYPH_PLACEMENT_READING = 'code-relative-to-letters-fit' as const;

/**
 * A line of text at `scale` with its pen starting at `x` and its baseline at `y` (research 87 §3; `FUN_00361bd0` emits
 * each glyph, `FUN_003625e0` moves the pen). Each glyph's quad starts at the pen + `DispPos.x` x scale and is
 * `(width - 1) x scale + 0.5` wide over the texels `UL.x .. UL.x + width - 1`; the pen then moves by `advance`. An
 * unknown character advances by the space's width and draws nothing. With `opts.special` the pad glyphs'
 * codes (`FONT_SPECIAL_01`) are placed from `font_special_01.tif` (`SPECIAL_GLYPH_PLACEMENT_READING`).
 *
 * A pad glyph's texels are the original's (OBF-33; research 111 §3.2): u from UL.x to UL.x + width - 1 + 15/16
 * (`FUN_00361bd0` D:L260407-260408, `DAT_003e0340` = `@s2u/ui`'s `RIGHT_EDGE_SUBTEXEL`) and v from UL.y + 1 to LR.y
 * (the element keeps texH - UL.y - 1 and texH - LR.y, `FUN_0035c2c0` D:L256907-256908, read at D:L260368 and
 * D:L260409). The letters keep `UL.x + width - 1` and `UL.y`, which their scale and `PEN_NUDGE` were fitted to; their
 * move to the original's mapping, with a re-fit, is LATER 594.
 */
export function layoutText(text: string, x: number, y: number, scale: number, opts: TextOptions = {}): { glyphs: PlacedGlyph[]; width: number } {
  const glyphs: PlacedGlyph[] = [];
  const k = scale * TEXT_V;
  const top = y - FOOT_ROW * k + FOOT_OFFSET;
  let pen = x;
  for (const { char, rgb } of botTextCharacters(text)) {
    const s = special(char, opts);
    if (s) {
      const [, u0, v0, u1, v1, dx, dy, baseline, hs, vs] = s as [number, number, number, number, number, number, number, number, number, number];
      const h = v1 - v0 - 1;   // the element's +4 - +6: LR.y - UL.y - 1 rows (D:L260388; `@s2u/ui` face.ts's `height`)
      glyphs.push({
        char, u0, v0: v0 + 1, u1: u1 - 1 + RIGHT_EDGE_SUBTEXEL / 16, v1, x: pen + dx * scale + PEN_NUDGE, y: top + (baseline - dy - h + 25) * k,
        w: ((u1 - u0) * hs - 1) * scale + 0.5, h: h * vs * k, texture: FONT_SPECIAL_01.texture, rgb: [...FONT_SPECIAL_01.rgb],
      });
      pen += specialAdvance(s, scale);
      continue;
    }
    const g = BY_CODE.get(char.codePointAt(0)!) ?? null;
    const glyph = g ?? BY_CODE.get(32)!;
    const [, u0, v0, u1, v1, disp] = glyph;
    if (g && char !== ' ') {
      glyphs.push({
        char, u0, v0, u1: u1 - 1, v1, x: pen + disp * scale + PEN_NUDGE, y: top,
        w: (u1 - u0 - 1) * scale + 0.5, h: (v1 - v0) * k, ...(rgb ? { rgb: [...rgb] as [number, number, number] } : {}),
      });
    }
    pen += advance(glyph, scale);
  }
  return { glyphs, width: pen - x };
}
