import { fadd, fmul, fsub, toInt } from './f32';
import { glyphWidth, lookupGlyph, type TextFace, type TextGlyph } from './face';

/**
 * A line of UI text laid out as the engine draws it, as data a compositor draws (web research 111 §3; W7.R3). The
 * draw is `FUN_003635c0` (D:L261089-261169): `FUN_00362900` sets the pen (D:L260664-260709), `FUN_00362350` finds the
 * next drawable glyph (D:L260479-260564), `FUN_00361bd0` emits one element's quad (D:L260235-260474), `FUN_003625e0`
 * moves to the next element, shadow pass or character (D:L260569-260659). The width is `FUN_00362b70`'s
 * (D:L260728-260811), the pen's step `FUN_00363c20`'s (D:L261330-261373).
 *
 * Frame coordinates: the corners go to the GS as `2048 - 640/2 + (640/640) x` and `2048 - 448/2 + 1.0 x y`
 * (`FUN_00364f30` D:L262144-262154; the video mode `FUN_003b1200(0)` D:L249656 sets 640 x 448 and the y factor
 * `DAT_004a44ac` = 1.0, D:L305380-305388), so a text's quads are whole pixels of the 640 x 448 frame, x and y
 * unscaled. The corner terms `DAT_0049e9a0` (the foot) and `DAT_0049e9a8` (the head) are 5 and 6 while the in-game HUD
 * lives (`FUN_001fa360` D:L57280-57281) and 0 after it (`FUN_001fbae0` D:L57797-57798): `rows` carries them,
 * `FRONT_END_TEXT_ROWS_READING` the front end's.
 */

/** FRONT_END_TEXT_ROWS_READING: the corner terms are 0 in the front end (their BSS start, and the HUD's teardown writes 0). */
export const FRONT_END_TEXT_ROWS_READING: Readonly<{ foot: number; head: number }> = { foot: 0, head: 0 };
/** The HUD's corner terms (`FUN_001fa360` D:L57280-57281: `DAT_003dc388` 5.0, `DAT_003dc390` 6.0). */
export const HUD_TEXT_ROWS: Readonly<{ foot: number; head: number }> = { foot: 5, head: 6 };
/** `#B` multiplies the alpha by `DAT_003e0338` = 1.5 (D:L260655, D:L260705). */
export const BOLD_ALPHA = 1.5;
/**
 * A glyph's colour as the GS takes it (BOOT-06; web research 141 section 2): the words are `int(float)`
 * (D:L260695-260705) and `FUN_00361bd0` sends them in a PACKED packet whose registers are 0x531 -- RGBAQ, UV, XYZ2
 * (D:L260266-260269) -- and a PACKED RGBAQ keeps bits 7:0 of each word, so an alpha under 0 is 256 + int(alpha), as
 * a 2D quad's is (`packedAlphaByte`).
 */
const packedWords = (c: [number, number, number, number]): [number, number, number, number] =>
  [c[0] & 0xff, c[1] & 0xff, c[2] & 0xff, c[3] & 0xff];
/** `DAT_003e0340` = 15: the right edge's sub-texel (1/16) offset (D:L260407-260408). */
export const RIGHT_EDGE_SUBTEXEL = 15;

/** A text node's drawing state (the fields `FUN_00362900` and its helpers read). */
export interface TextStyle {
  /** +0x40, the object's `SCALE`. */
  scale: number;
  /** +0x78: set to 1 by every translated text (`FUN_003631f0` D:L261029); default 1. */
  locScale?: number;
  hcentered?: boolean;
  rightJustified?: boolean;
  /** +0x48..+0x50 on the GS scale (128 = 1.0; a TEXT's `COLOR`, else 128 thrice from the loader). */
  color: readonly [number, number, number];
  /** +0x54 on the GS scale. */
  alpha: number;
  /** +0x8c: the `#B` state the text starts in (a WRAPPEDTEXT line inherits it). */
  bold?: boolean;
  /** vtable+0x88, the line pitch: 0 for TEXT (`0x1fe1a0` returns 0), `SPACING` for TELETYPE and the wrapped lines. */
  linePitch?: number;
  rows?: { foot: number; head: number };
}

/** One element's quad: whole frame pixels, texels top row first, the GS colour (128 = 1.0). */
export interface GlyphQuad {
  code: number;
  /** The atlas: the face's texture the glyph names. */
  texture: string;
  /** The drop shadow's pass (drawn before the glyph's own). */
  shadow: boolean;
  left: number; top: number; right: number; bottom: number;
  /** Texel corners: `u0` .. `u1` across, `v0` (top) .. `v1` (bottom) down. */
  u0: number; u1: number; v0: number; v1: number;
  rgba: [number, number, number, number];
}

export interface TextRun {
  quads: GlyphQuad[];
  /** The pen where the draw left it (`FUN_003635c0` writes its x to +0x70, D:L261138). */
  pen: { x: number; y: number };
  /** `FUN_00362b70`. */
  measure: TextMeasure;
}

/** `FUN_00362b70`'s results: +0x3c the width, +0x44 the line breaks, +0x70 the last line's width. */
export interface TextMeasure { width: number; breaks: number; lastLine: number }

/** S = +0x40 x +0x78 x the face's `scale`, in the order each function multiplies. */
const S3 = (a: number, b: number, c: number): number => fmul(fmul(a, b), c);

/** The GS's frame origin for 640 x 448 (`FUN_00364f30`): 2048 - 640/2 and 2048 - 448/2. */
const GS_X0 = 2048 - 320, GS_Y0 = 2048 - 224;
/** A corner to a frame pixel: `(int)(origin + 1.0 x v)` on the GS, back to the frame (so a negative corner floors). */
const gsX = (v: number): number => toInt(fadd(GS_X0, v)) - GS_X0;
const gsY = (v: number): number => toInt(fadd(GS_Y0, v)) - GS_Y0;

/**
 * `FUN_00362b70`: the text's width. A line's width sums each glyph's `int(w + S x (W - 1) + 0.5) + xspacing`; a break
 * adds the line to the total, so a text of several lines measures as their SUM; a space opening a line after the first
 * is skipped; a code with no glyph adds nothing. `#B` is measured as two glyphs (the measure does not read it).
 */
export function measureText(face: TextFace, codes: readonly number[], scale: number, locScale = 1): TextMeasure {
  const s = S3(scale, locScale, face.scale);
  let line = 0, width = 0, breaks = 0;
  for (const c of codes) {
    if (c === 0x0a) { breaks++; width = fadd(width, line); line = 0; continue; }
    if (line === 0 && c === 0x20 && breaks !== 0) continue;
    const { glyph } = lookupGlyph(face, c);
    if (!glyph) continue;
    line = toInt(fadd(fadd(line, fmul(s, glyphWidth(glyph) - 1)), 0.5));
    line += face.xspacing;
  }
  return { width: fadd(width, line), breaks, lastLine: line };
}

/** `FUN_00363c20`: the pen's step over a code: `int((W - 1) x S + 0.5) + xspacing`; 0 for a code with no glyph. */
export function penAdvance(face: TextFace, code: number, scale: number, locScale = 1): number {
  const { glyph } = lookupGlyph(face, code);
  if (!glyph) return 0;
  return toInt(fadd(fmul(fmul(fmul(glyphWidth(glyph) - 1, scale), locScale), face.scale), 0.5)) + face.xspacing;
}

const isHashB = (codes: readonly number[], i: number): boolean => codes[i] === 0x23 && codes[i + 1] === 0x42;

/**
 * Lays a text out: the quads in the order the engine emits them (per glyph: per element, its shadow then itself).
 * `x`, `y` are the node's pen (+0x90/+0x94 plus the string's offsets +0x7c/+0x80): the y is the foot of the face's
 * cell -- a glyph's quad hangs `(baseline + DispPos.y - h) x S` above it (`UI_TEXT_ORIGIN`, research 95 §2.7).
 *
 * The rules, as read:
 * - HCENTERED takes half the measured width off the pen, RIGHT_JUSTIFIED all of it, each truncated (D:L260684-260692);
 *   the width is the SUM of the lines, and a break returns the pen to the node's x, not to a centred one.
 * - `\n` moves the pen down `int(pitch)` and skips one space after it (D:L260497-260505); a TEXT's pitch is 0.
 * - `#B` toggles the bright state (the alpha x 1.5): at a glyph's start it is skipped (D:L260507-260515); after a
 *   glyph it is skipped and the pen moves by the width of the `B`, not of the glyph before it (the advance decodes
 *   the character at the pointer the recursion left, D:L260624-260639).
 * - a glyph without `color` gets the face's drop shadow first (when the face has one): the shadow colour at
 *   `min(alpha, int(opacity x 128))`, displaced by the shadow's offset x S; a glyph with `color` is drawn in it at the
 *   text's alpha, with no shadow.
 * - a code with no glyph (0x0D) draws and advances nothing; any other unknown code draws `lookupGlyph`'s stand-in.
 */
export function layoutText(face: TextFace, codes: readonly number[], x: number, y: number, style: TextStyle): TextRun {
  const loc = style.locScale ?? 1;
  /** A corner term x +0x40 x +0x78 x the face's scale, multiplied left to right as `FUN_00361bd0` writes it. */
  const mulS = (v: number): number => fmul(fmul(fmul(v, style.scale), loc), face.scale);
  const rows = style.rows ?? FRONT_END_TEXT_ROWS_READING;
  const pitch = style.linePitch ?? 0;
  const startX = toInt(x);
  const pen = { x: startX, y: toInt(y) };
  const measure = measureText(face, codes, style.scale, loc);
  if (style.hcentered || style.rightJustified) {
    if (style.hcentered) pen.x = toInt(fsub(pen.x, fmul(measure.width, 0.5)));
    if (style.rightJustified) pen.x = toInt(fsub(pen.x, measure.width));
  }
  let bold = style.bold ?? false;
  const textColour = (): [number, number, number, number] =>
    packedWords([toInt(style.color[0]), toInt(style.color[1]), toInt(style.color[2]), toInt(bold ? fmul(BOLD_ALPHA, style.alpha) : style.alpha)]);
  const shadowColour = (): [number, number, number, number] => {
    const sh = face.shadow!;
    const cap = toInt(fmul(sh.opacity, 128));
    return packedWords([toInt(sh.color[0]), toInt(sh.color[1]), toInt(sh.color[2]), toInt(style.alpha <= cap ? style.alpha : cap)]);
  };
  const quads: GlyphQuad[] = [];
  let i = 0, glyph: TextGlyph | null = null, elem = 0, shadowPending = false;
  let block = textColour();

  /** `FUN_00362350`: from the pointer to the next character that has a glyph to draw. */
  const start = (): void => {
    for (;;) {
      const c = codes[i];
      if (c === undefined) return;
      if (c === 0x0a) {
        pen.x = startX;
        pen.y = toInt(pen.y + toInt(pitch));
        i++;
        if (codes[i] === 0x20) i++;
        continue;
      }
      while (isHashB(codes, i)) { i += 2; bold = !bold; if (codes[i] === undefined) return; }
      const g = lookupGlyph(face, codes[i]!).glyph;
      if (g && g.elements.length > 0) {
        glyph = g; elem = 0;
        if (face.shadow === null || g.color !== null) return;
        shadowPending = true;
        block = shadowColour();
        return;
      }
      i++;
    }
  };

  /** `FUN_00361bd0`: the current element's quad. */
  const emit = (): void => {
    const g = glyph!, e = g.elements[elem]!;
    const off = shadowPending ? face.shadow!.offset : [0, 0];
    const rgba: [number, number, number, number] = g.color ? [g.color[0], g.color[1], g.color[2], block[3]] : [...block];
    // The element stores -DispPos.y (+10), so `baseline - (+10)` is baseline + DispPos.y.
    const dy = g.baseline + e.disp[1];
    const xTerm = fadd(e.disp[0], off[0]!);
    const rTerm = fadd(fadd(fadd(fmul(e.width, e.hscale), e.disp[0]), -1), off[0]!);
    const footTerm = fadd(fadd(fadd(dy, -e.height), fmul(e.height, e.vscale)), off[1]!);
    const headTerm = dy - e.height + off[1]!;
    const left = gsX(fadd(pen.x, mulS(xTerm)));
    const right = gsX(fadd(fadd(pen.x, mulS(rTerm)), 0.5));
    const bottom = gsY(fadd(fadd(fadd(pen.y, mulS(footTerm)), 0.5), rows.foot));
    const top = gsY(fadd(fadd(pen.y, mulS(headTerm)), rows.head));
    quads.push({
      code: g.code, texture: face.textures[g.texture] ?? '', shadow: shadowPending,
      left, top, right, bottom,
      u0: e.ul[0], u1: e.ul[0] + e.width - 1 + RIGHT_EDGE_SUBTEXEL / 16, v0: e.ul[1] + 1, v1: e.lr[1],
      rgba,
    });
  };

  /** `FUN_003625e0`: the shadow's own pass, the next element, or the next character. */
  const advance = (): void => {
    if (shadowPending) { shadowPending = false; block = textColour(); return; }
    const g = glyph!;
    if (elem + 1 < g.elements.length) {
      elem++;
      if (face.shadow !== null && g.color === null) { shadowPending = true; block = shadowColour(); }
      return;
    }
    let from = i;
    i++;
    while (isHashB(codes, i)) {
      i++;                 // to the 'B'; the recursion reads the character from there
      bold = !bold;
      from = i;
      i++;
    }
    pen.x = toInt(pen.x + penAdvance(face, codes[from]!, style.scale, loc));
    start();
  };

  start();
  if (codes[i] !== undefined && !shadowPending) block = textColour();
  while (codes[i] !== undefined) {
    emit();
    advance();
  }
  return { quads, pen, measure };
}
