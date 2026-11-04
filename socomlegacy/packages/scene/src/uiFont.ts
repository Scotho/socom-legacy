import { rdrGet, type RdrNode } from '@s2u/archive';

/**
 * The menus' fonts (web sprint 5, S1; socomlegacy/docs/research/95 §5.4): `RUN/READERC.ZAR/fonts.rdr` (read by the
 * code at L152637, the string at 0x3f1ac8; only in `RUN/READERC.ZAR`), read at run time -- where the HUD's
 * `font_text_01` ASCII was transcribed (`viewer/src/hudFont.ts`). The file has **two faces**:
 *
 * - `font_titlebar_01`: texture `font_titlebar_01.tif` (512x512 PSMT4, in `UIMP_TXR` among others), xspacing 0,
 *   opacity 0.7, scale 1, no topy/boty, dropshadow offset (3,3) colour (0,0,0) opacity 0.65; 166 glyphs, every cell
 *   51 rows tall. The ARMORY's titles (`bar_title` "ARMORY", the game and room names).
 * - `font_text_01`: textures `font_text_01.tif` and **`font_special_01.tif`** -- `font_special_01` is not a face but the
 *   face's second texture (R95.11): 18 glyphs on it, the pad's buttons (0xAC triangle, 0xB4 square, 0xA6 cross, 0xB7
 *   circle, 0xB6/0xBC/0xBD/0xBE L1/L2/R1/R2, the d-pad, SELECT, the dots). Both live in each map's `FONT_TXR`.
 *
 * A glyph is `Code`, `texture` (1-based into the face's `textures`), `baseline`, an optional `color`, and `Elems`: one
 * element on every glyph of both faces, `UL`/`LR` its texel rectangle (top row first, the atlas read flipped),
 * `DispPos` its offset, `HorScale`/`VertScale`. Code 96 is listed twice in `font_text_01` (LR.x 127 then 126):
 * `FONT_DUP_GLYPH_READING`, the first wins, as `hudFont.ts` keeps it -- the engine's lookup is not traced.
 */
export const FONT_DUP_GLYPH_READING = 'first';

/** Where the faces are (research 95 §5.1). */
export const FONTS_RDR = { archive: 'RUN/READERC.ZAR', member: 'fonts.rdr' } as const;

export interface FontGlyph {
  code: number;
  /** 1-based into the face's `textures`. */
  texture: number;
  baseline: number;
  color: [number, number, number] | null;
  ul: [number, number];
  lr: [number, number];
  disp: [number, number];
  hscale: number;
  vscale: number;
}

export interface FontFace {
  name: string;
  textures: string[];
  xspacing: number;
  opacity: number;
  scale: number;
  topy: number | null;
  boty: number | null;
  dropShadow: { offset: [number, number]; color: [number, number, number]; opacity: number } | null;
  /** Every glyph in file order (a repeated code included: `glyphOf` takes the first). */
  glyphs: FontGlyph[];
}

const nums = (n: RdrNode | undefined): number[] =>
  (Array.isArray(n) ? n : n === undefined ? [] : [n]).map((x) => (typeof x === 'string' ? Number(x) : NaN));
const num = (n: RdrNode | undefined, fallback: number): number => {
  const v = nums(n)[0];
  return v === undefined || !Number.isFinite(v) ? fallback : v;
};
const pair = (n: RdrNode | undefined): [number, number] => {
  const v = nums(n);
  return [v[0] ?? 0, v[1] ?? 0];
};
const triple = (n: RdrNode | undefined): [number, number, number] => {
  const v = nums(n);
  return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0];
};
/** `rdrGet` hands a single-record list back as that record: a list that opens on a key is one record. */
const records = (n: RdrNode | undefined): RdrNode[] => (Array.isArray(n) && typeof n[0] === 'string' ? [n] : Array.isArray(n) ? n : []);

function glyph(record: RdrNode): FontGlyph | null {
  const code = num(rdrGet([record], 'Code'), NaN);
  if (!Number.isInteger(code)) return null;
  const el = records(rdrGet([record], 'Elems'))[0];
  if (el === undefined) return null;
  const color = rdrGet([record], 'color');
  return {
    code, texture: num(rdrGet([record], 'texture'), 1), baseline: num(rdrGet([record], 'baseline'), 0),
    color: color === undefined ? null : triple(color),
    ul: pair(rdrGet([el], 'UL')), lr: pair(rdrGet([el], 'LR')), disp: pair(rdrGet([el], 'DispPos')),
    hscale: num(rdrGet([el], 'HorScale'), 1), vscale: num(rdrGet([el], 'VertScale'), 1),
  };
}

/** `fonts.rdr` parsed -> its faces, in file order. */
export function parseFontFaces(root: RdrNode): FontFace[] {
  const faces = rdrGet(root, 'faces');
  if (!Array.isArray(faces)) throw new Error('fonts.rdr has no faces');
  const out: FontFace[] = [];
  for (let i = 0; i + 1 < faces.length; i += 2) {
    const name = faces[i], rec = faces[i + 1]!;
    if (typeof name !== 'string' || !Array.isArray(rec)) continue;
    const textures = rdrGet([rec], 'textures');
    const shadow = rdrGet([rec], 'dropshadow');
    const topy = rdrGet([rec], 'topy'), boty = rdrGet([rec], 'boty');
    out.push({
      name,
      textures: (Array.isArray(textures) ? textures : textures === undefined ? [] : [textures]).filter((t): t is string => typeof t === 'string'),
      xspacing: num(rdrGet([rec], 'xspacing'), 0), opacity: num(rdrGet([rec], 'opacity'), 1), scale: num(rdrGet([rec], 'scale'), 1),
      topy: topy === undefined ? null : num(topy, 0), boty: boty === undefined ? null : num(boty, 0),
      dropShadow: Array.isArray(shadow)
        ? { offset: pair(rdrGet([shadow], 'offset')), color: triple(rdrGet([shadow], 'color')), opacity: num(rdrGet([shadow], 'opacity'), 1) }
        : null,
      glyphs: records(rdrGet([rec], 'charoffsets')).map(glyph).filter((g): g is FontGlyph => g !== null),
    });
  }
  return out;
}

/** A face's glyph for a code: the first the file lists (`FONT_DUP_GLYPH_READING`), or undefined. */
export function glyphOf(face: FontFace, code: number): FontGlyph | undefined {
  return face.glyphs.find((g) => g.code === code);
}

/**
 * The pad glyphs' codes (research 95 §5.4, the `font_special_01` table): the bytes the strings and captions carry. The
 * d-pad's four point right (0xa3), left (0xaf), down (0xb1) and up (0xb5): `DPAD_GLYPH_DIRECTION_READING`, settled in
 * web sprint 5 S4 from the atlas's pixels and the dead player's Right/Left teammate cycle (research 95 §5.4, §8).
 */
export const PAD_GLYPH = {
  TRIANGLE: 0xac, SQUARE: 0xb4, CROSS: 0xa6, CIRCLE: 0xb7, L1: 0xb6, L2: 0xbc, R1: 0xbd, R2: 0xbe, SELECT: 0xa4,
  DPAD_RIGHT: 0xa3, DPAD_LEFT: 0xaf, DPAD_DOWN: 0xb1, DPAD_UP: 0xb5,
} as const;
