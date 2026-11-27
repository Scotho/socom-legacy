import { PAD_GLYPH } from '@s2u/scene';
import { codesText, engineCodes, RIGHT_EDGE_SUBTEXEL } from '@s2u/ui';
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
 * read flipped: `./hudAssets`). Every glyph of the face's first texture (LATER 1030 (c)): its 167 texture-1 records
 * hold 166 codes -- the 95 printable ASCII and 71 others (0xA1-0xFF's Latin-1 letters and signs, OE/oe 0x152/0x153,
 * S/s-caron 0x160/0x161, Y-diaeresis 0x178, the low double quote 0x201E, the euro sign 0x20AC), code 96 twice (the
 * first record kept, as `@s2u/scene`'s `FONT_DUP_GLYPH_READING`); its 18 texture-2 records are `FONT_SPECIAL_01`.
 * `DispPos.y` is 0, `HorScale` and `VertScale` 1 and `texture` 1 on every one; `baseline` is 1 on `!` and `.` alone
 * and not modelled. A code the face lacks draws a stand-in (`HUD_UNKNOWN_GLYPH_READING`).
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
  // LATER 1030 (c): the face's 71 other texture-1 glyphs, by code (Latin-1's, OE/oe, S/s-caron, Y-diaeresis, the low
  // double quote, the euro sign).
  [161, 31, 75, 40, 100, -1], [169, 1, 75, 20, 100, -1], [171, 39, 75, 49, 100, 0], [174, 18, 75, 33, 100, -1],
  [176, 497, 25, 505, 50, -1], [186, 261, 75, 269, 100, 0], [187, 50, 75, 60, 100, 0], [191, 486, 50, 498, 75, -1],
  [192, 13, 50, 27, 75, -1], [193, 25, 50, 39, 75, -1], [194, 37, 50, 51, 75, -1], [195, 60, 75, 72, 100, 0],
  [196, 1, 50, 15, 75, -1], [197, 73, 75, 85, 100, 0], [198, 87, 75, 100, 100, 0], [199, 227, 50, 240, 75, -1],
  [200, 59, 50, 70, 75, -1], [201, 68, 50, 80, 75, -1], [202, 78, 50, 89, 75, -1], [203, 49, 50, 61, 75, -1],
  [204, 96, 50, 106, 75, -1], [205, 104, 50, 115, 75, -1], [206, 113, 50, 123, 75, -1], [207, 87, 50, 98, 75, -1],
  [209, 238, 50, 251, 75, -1], [210, 133, 50, 147, 75, -1], [211, 145, 50, 159, 75, -1], [212, 157, 50, 171, 75, -1],
  [213, 102, 75, 113, 100, 0], [214, 121, 50, 135, 75, -1], [216, 127, 75, 139, 100, 0], [217, 180, 50, 193, 75, -1],
  [218, 191, 50, 205, 75, -1], [219, 203, 50, 216, 75, -1], [220, 169, 50, 182, 75, -1], [223, 215, 50, 229, 75, -1],
  [224, 274, 50, 286, 75, -1], [225, 284, 50, 297, 75, -1], [226, 295, 50, 307, 75, -1], [227, 179, 75, 190, 100, 0],
  [228, 263, 50, 276, 75, -1], [229, 141, 75, 151, 100, 0], [230, 153, 75, 167, 100, 0], [231, 465, 50, 477, 75, -1],
  [232, 316, 50, 328, 75, -1], [233, 326, 50, 339, 75, -1], [234, 337, 50, 350, 75, -1], [235, 306, 50, 316, 75, 0],
  [236, 357, 50, 368, 75, -1], [237, 366, 50, 375, 75, -1], [238, 373, 50, 383, 75, -1], [239, 348, 50, 359, 75, -1],
  [241, 475, 50, 488, 75, -1], [242, 392, 50, 405, 75, -1], [243, 403, 50, 416, 75, -1], [244, 414, 50, 427, 75, -1],
  [245, 191, 75, 202, 100, 0], [246, 381, 50, 394, 75, -1], [248, 204, 75, 214, 100, 0], [249, 435, 50, 447, 75, -1],
  [250, 445, 50, 457, 75, -1], [251, 455, 50, 467, 75, -1], [252, 425, 50, 437, 75, -1], [255, 250, 75, 260, 100, 0],
  [338, 249, 50, 265, 75, -1], [339, 482, 25, 498, 50, -1], [352, 216, 75, 226, 100, 0], [353, 228, 75, 237, 100, 0],
  [376, 238, 75, 249, 100, 0], [8222, 169, 75, 178, 100, 0], [8364, 270, 75, 281, 100, 0],
  ] as [number, number, number, number, number, number][],
  /** A told clan tag's bytes as this face reads them (`hudTagText`): a module that holds the face reads a tag with it. */
  tagText: hudTagText,
} as const;

type Glyph = readonly [number, number, number, number, number, number];
const BY_CODE = new Map<number, Glyph>(FONT_TEXT_01.glyphs.map((g) => [g[0], g]));

/**
 * `@s2u/ui`'s HASH_C_GLYPH_ALIAS_READING (R4P-324; research 111 §9, 263 §3a), on the HUD's face: r0004's face loader
 * 0x003796b0 parses a `Code` record of `C` (0x43) a second time into glyph 0xb2, its elements, texture and baseline;
 * `font_text_01`'s C is one such record, so the HUD draws 0xb2 -- the byte `Censor` writes over a typed `#C` -- with the
 * C cell. The alias is built here, not listed in `FONT_TEXT_01.glyphs`, which holds the archive's records as they are
 * (`test/hudFont.test.ts` checks both against `fonts.rdr`). Was: 0xb2 drew the stand-in `'A' + 178 % 26` = W, so a
 * `#C` whisper received in a round read `#W` (the review's finding 1). Reading, pending review.
 */
BY_CODE.set(0xb2, [0xb2, ...BY_CODE.get(0x43)!.slice(1)] as unknown as Glyph);

/**
 * LATER 1030 (c), Option A (the main controller, 2026-11-15): a seat's clan tag reaches the page as the room tells it,
 * a BYTE string -- one character a byte of the stored UTF-8 ("«G»" as C2 AB 47 C2 BB) -- and the HUD reads it through
 * the engine's own decoder, `@s2u/ui`'s `engineCodes` (`FUN_0039f0c0` / `FUN_0039f160`), as the original's HUD text
 * does: its draw `FUN_00362350` decodes each character with `FUN_0039f0c0` and looks the code up with `FUN_0035a3a0`
 * (D:L260517-260518), reached from `FUN_003639c0` (D:L261251) through `FUN_003635c0` and `FUN_00362900`; its pen
 * move `FUN_003625e0` decodes the same way (D:L260625-260637). The codes come back as a string the HUD font draws, one
 * character a code. Only the tag is bytes: a player's name is code-point text and is not decoded. Reading, pending
 * review (research 87 §3.1).
 */
export function hudTagText(tagBytes: string): string {
  return codesText(engineCodes(tagBytes));
}

/**
 * HUD_UNKNOWN_GLYPH_READING (LATER 1030 (c); research 111 R111.6, research 87 §3.1): a code the face lacks draws a
 * letter, as `FUN_0035a3a0` (D:L255682) chooses one -- the map's own glyph; none for 0x0D (D:L255701), which
 * `FUN_00363c20` then advances by 0 (D:L261347-261355); past the Hangul table (D:L255714; the disc's faces have none)
 * the glyph of `'A' + code % 26` (D:L255755). The code is the 16-bit one the lookup takes (`ushort`), as `@s2u/ui`'s
 * `lookupGlyph` keeps it. Its last resort, the map's first glyph (D:L255757-255770; `lookupGlyph`'s third branch), is
 * unreachable here: the face holds A-Z. A line break (0x0A) is the draw's, not the lookup's (`FUN_00362350`
 * D:L260497-260505); the HUD's lines are one line each and keep the advance of a space for it, the break not modelled.
 * Read, not measured on a frame: reading, pending review.
 */
export const HUD_UNKNOWN_GLYPH_READING = "'A' + code % 26; nothing for 0x0D" as const;

/** The glyph a code draws with (`HUD_UNKNOWN_GLYPH_READING`): null for 0x0D, which draws and advances nothing. */
function glyphOf(char: string): Glyph | null {
  const code = char.codePointAt(0)! & 0xffff;
  const own = BY_CODE.get(code);
  if (own) return own;
  if (code === 0x0d) return null;
  if (code === 0x0a) return BY_CODE.get(32)!;
  return BY_CODE.get(0x41 + (code % 26))!;
}

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

/**
 * SEAT_CLAIM_R1_GLYPH_ADAPTATION (a service adaptation's, `./seatClaim`; no original): R1's pad glyph with its cell begun
 * 2 texels later (UL.x 116, where L2's cell ends). fonts.rdr's R1 (0xbd) starts at 114, inside L2's (80-116), so its
 * left edge carries L2's outline -- a thin dark line beside the badge (the owner's catch, 2026-11-24). Under a
 * private-use code, so the game's own 0xbd (the dead player's help, `FUN_001f97b0`'s `%c`) keeps its transcription.
 */
export const SEAT_CLAIM_R1_GLYPH_ADAPTATION = { code: 0xe0bd, glyph: [0xe0bd, 116, 34, 150, 63, 0, 0, 4, 0.75, 0.75] } as const;
const SPECIAL_BY_CODE = new Map<number, readonly number[]>([...FONT_SPECIAL_01.glyphs, SEAT_CLAIM_R1_GLYPH_ADAPTATION.glyph].map((g) => [g[0], g]));

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
 * The letters' rise over their baseline at `scale`, frame pixels: the 20 rows from the cell's top to the letters' foot
 * (`FOOT_ROW`), the cell's top where `layoutText` puts it less the fitted 0.3. What a line of text covers above its y.
 */
export function textRise(scale: number): number {
  return FOOT_ROW * scale * TEXT_V;
}
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
    if (s) { width += specialAdvance(s, scale); continue; }
    const g = glyphOf(char);
    if (g) width += advance(g, scale);
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
 * `(width - 1) x scale + 0.5` wide over the texels `UL.x .. UL.x + width - 1`; the pen then moves by `advance`. A
 * code the face lacks draws its stand-in (`HUD_UNKNOWN_GLYPH_READING`; was: the advance of a space, nothing drawn);
 * 0x0D draws and advances nothing. With `opts.special` the pad glyphs'
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
    const glyph = glyphOf(char);
    if (!glyph) continue;
    const [code, u0, v0, u1, v1, disp] = glyph;
    if (code !== 32) {
      glyphs.push({
        char, u0, v0, u1: u1 - 1, v1, x: pen + disp * scale + PEN_NUDGE, y: top,
        w: (u1 - u0 - 1) * scale + 0.5, h: (v1 - v0) * k, ...(rgb ? { rgb: [...rgb] as [number, number, number] } : {}),
      });
    }
    pen += advance(glyph, scale);
  }
  return { glyphs, width: pen - x };
}
