import { describe, expect, it } from 'vitest';
import { engineCodes, faceNames, glyphWidth, lookupGlyph, readTextFace, readTextFaces } from '../../src/index';
import { FONTS } from './fixtures';

// Web research 111 §1-§2. Every expectation is transcribed from the retail decompilation (D:L<line> = a line of
// game/analysis/socom2_game.elf.decomp.c) on a hand-built fonts.rdr shaped as parseRdr returns it; none was produced by
// running the reader.

describe('a face as FUN_00359c40 loads it (D:L255324-255480)', () => {
  const f = readTextFace(FONTS, 'font_t');

  it('reads the header: textures from the face\'s own list, opacity, scale, xspacing, topy, boty', () => {
    expect(faceNames(FONTS)).toEqual(['font_t', 'font_b']);
    expect(f.textures).toEqual(['t.tif', 'special.tif']);
    expect(f.opacity).toBe(Math.fround(0.7));
    expect(f).toMatchObject({ scale: 1, xspacing: 0, topy: 0, boty: 15, glowTexture: null, korean: false });
    // `texture` is looked up before `textures` (FUN_0032f200 0x3f8870 then 0x3f8878).
    expect(readTextFace(FONTS, 'font_b').textures).toEqual(['b.tif']);
  });

  it('keeps the drop shadow\'s offset as ints (FUN_0035a180 truncates 1.5 to 1), its colour and opacity', () => {
    expect(f.shadow).toEqual({ offset: [1, 1], color: [0, 0, 0], opacity: 0.75 });
    expect(readTextFace(FONTS, 'font_b').shadow).toBeNull();
    expect(readTextFace(FONTS, 'font_b').opacity).toBe(1);   // default (FUN_0035a650 D:L255850)
  });

  it('a name the file lacks is an empty face', () => {
    const none = readTextFace(FONTS, 'arialblack');
    expect(none.glyphs.size).toBe(0);
    expect(none.textures).toEqual([]);
  });

  it('a glyph: texture 1-based to 0-based, the element\'s height LR.y - UL.y - 1, DispPos, default scales', () => {
    const a = f.glyphs.get(65)!;
    expect(a).toMatchObject({ code: 65, texture: 0, baseline: 0, lKerning: 0, rKerning: 0, advance: -1, color: null });
    expect(a.elements).toEqual([{ ul: [2, 0], lr: [13, 25], width: 11, height: 24, disp: [0, 0], hscale: 1, vscale: 1 }]);
    expect(f.glyphs.get(32)!.advance).toBe(8);   // code 0x20's +0x10 (D:L256869-256871)
  });

  it('a glyph\'s `color` is kept as ints, and its texture is the second', () => {
    const cross = f.glyphs.get(166)!;
    expect(cross.color).toEqual([150, 150, 150]);
    expect(cross.texture).toBe(1);
    expect(cross.elements[0]!.hscale).toBe(Math.fround(0.9));
  });

  it('a code listed twice is one glyph: the second record\'s element appended, its scalars written over (FUN_0035c3a0)', () => {
    const g = f.glyphs.get(96)!;
    expect(g.elements.map((e) => e.lr)).toEqual([[127, 50], [126, 50]]);
    expect(g.baseline).toBe(2);
    expect(readTextFaces(FONTS).map((x) => x.glyphs.size)).toEqual([7, 1]);
  });

  it('the short form (no Code, D:L256806-256820): an int node its value, a string its first byte, any other node 0 (SHORT_GLYPH_CODE_READING)', () => {
    const short = (tok: string): number[] =>
      [...readTextFace([['faces', ['s', ['texture', ['s.tif'], 'charoffsets', [[tok, ['0', '0'], ['10', '20']]]]]]], 's').glyphs.keys()];
    expect(short('5')).toEqual([5]);       // an int-spelled token: an int node (type 1)
    expect(short('x')).toEqual([0x78]);    // a string (type 3): its first byte
    expect(short('5.5')).toEqual([0]);     // a float node: neither, so 0
  });

  it('FUN_0035a7b0: a glyph\'s width is its widest element\'s int(DispPos.x + width x HorScale)', () => {
    expect(glyphWidth(f.glyphs.get(65)!)).toBe(11);
    expect(glyphWidth(f.glyphs.get(66)!)).toBe(10);
    expect(glyphWidth(f.glyphs.get(96)!)).toBe(8);    // max(-1 + 9, -1 + 8)
    expect(glyphWidth(f.glyphs.get(166)!)).toBe(22);  // int(0 + 25 x 0.9)
  });
});

describe('FUN_0035a3a0: the glyph a code draws with (D:L255682-255798)', () => {
  const f = readTextFace(FONTS, 'font_t');
  it('its own; none for 0x0D; else the letter A + code % 26; else the map\'s lowest code', () => {
    expect(lookupGlyph(f, 65)).toEqual({ glyph: f.glyphs.get(65), fallback: 'none' });
    expect(lookupGlyph(f, 0x0d)).toEqual({ glyph: null, fallback: 'none' });
    expect(lookupGlyph(f, 26 * 3 + 1)).toEqual({ glyph: f.glyphs.get(66), fallback: 'letter' });   // 79 % 26 = 1: 'B'
    expect(lookupGlyph(f, 200)).toEqual({ glyph: f.glyphs.get(32), fallback: 'first' });           // 'S' absent
    expect(lookupGlyph(readTextFace(FONTS, 'none'), 65).glyph).toBeNull();
  });
});

describe('FUN_0039f0c0 / FUN_0039f160: a text\'s characters (D:L294576-294620)', () => {
  it('a byte below 0xC0 is its own code, a C0-DF lead takes one more byte, an E0+ lead two (16 bits)', () => {
    expect(engineCodes('A\xa6')).toEqual([0x41, 0xa6]);
    expect(engineCodes('\xc2\xa6\xc3\xab')).toEqual([0xa6, 0xeb]);
    expect(engineCodes('\xe2\x80\x94')).toEqual([0x2014]);
    expect(engineCodes('\xc0\x41')).toEqual([0xffc1]);   // the continuation is not checked
    expect(engineCodes('\xe2')).toEqual([0xe2]);          // a lead before the terminator stands alone
  });
});
