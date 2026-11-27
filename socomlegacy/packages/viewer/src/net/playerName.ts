/**
 * NAME_DRAWABLE_ADAPTATION (NAMES-MIDDLE; product track, the owner's "middle way" for player names, MISSION OT.R149 --
 * his choice over the original's printable-only login keyboard, an adaptation that changes nothing the game does): a
 * player's name may hold every character the game's faces can draw a name in, and no other. The faces counted are the
 * ones a name is drawn in -- the HUD's `font_text_01` (`../hudFont` `FONT_TEXT_01`, the names over heads, the kill feed,
 * the scoreboard) and the ui's two text faces of `READERC.ZAR/fonts.rdr` (`@s2u/ui` `readTextFaces`: `font_titlebar_01`
 * and `font_text_01`, the lobby lists and the dialogs; golden pin `ui/test/golden/fontsRdr.json`) -- and the set is their
 * INTERSECTION. On the disc the three are the same 166 codes: each face's first-texture glyphs, the 95 printable ASCII
 * (0x20-0x7e) and 71 others (Latin-1's letters and a few signs, OE/oe, S/s-caron, Y-diaeresis, the low double quote, the
 * euro sign). Left out: `font_text_01`'s 18 pad glyphs on its second texture (`FONT_SPECIAL_01`: 0xa2-0xbe codes that
 * draw buttons, not their Latin-1 characters), r0004's 0xb2 (the loader's alias of `C`, so a superscript two would draw
 * as C), 0x7f and every control, and everything past the faces (the no-break space, the soft hyphen, the zero-width
 * characters, other scripts, emoji). `test/playerName.test.ts` holds the set against the HUD transcription, the golden
 * pin and, with the fixture, the disc.
 */
export const NAME_DRAWABLE_ADAPTATION = 'a name holds the 166 codes every face a name is drawn in can draw, and no other' as const;

/** The drawable codes as inclusive ranges, ascending (`NAME_DRAWABLE_ADAPTATION`). */
export const NAME_DRAWABLE_RANGES: readonly (readonly [number, number])[] = [
  [0x20, 0x7e], [0xa1, 0xa1], [0xa9, 0xa9], [0xab, 0xab], [0xae, 0xae], [0xb0, 0xb0], [0xba, 0xbb], [0xbf, 0xcf],
  [0xd1, 0xd6], [0xd8, 0xdc], [0xdf, 0xef], [0xf1, 0xf6], [0xf8, 0xfc], [0xff, 0xff], [0x152, 0x153], [0x160, 0x161],
  [0x178, 0x178], [0x201e, 0x201e], [0x20ac, 0x20ac],
];

/** Every drawable code, ascending: 166 (`NAME_DRAWABLE_ADAPTATION`). */
export const NAME_DRAWABLE_CODES: readonly number[] = NAME_DRAWABLE_RANGES.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i));

const DRAWABLE = new Set(NAME_DRAWABLE_CODES);

/** True when `ch` -- one character, a whole code point -- is in the drawable set (`NAME_DRAWABLE_ADAPTATION`). */
export function isNameDrawable(ch: string): boolean {
  const code = ch.codePointAt(0);
  return code !== undefined && ch.length === String.fromCodePoint(code).length && DRAWABLE.has(code);
}
