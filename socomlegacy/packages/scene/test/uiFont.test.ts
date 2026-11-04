import { describe, expect, it } from 'vitest';
import { parseRdr, Zar, type RdrNode } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { FONTS_RDR, glyphOf, PAD_GLYPH, parseFontFaces, type FontFace } from '../src/index';

/**
 * The menus' two font faces (web sprint 5, S1; socomlegacy/docs/research/95 §5.4), read from `fonts.rdr` at run time:
 * a hand-built file first, then the disc's (fixture-backed), pinned to the note's metrics.
 */

const glyph = (code: number, ul: number[], lr: number[], disp = -3, extra: RdrNode[] = []): RdrNode =>
  ['Code', [String(code)], 'texture', ['1'], 'baseline', ['0'], ...extra, 'Elems', [['UL', ul.map(String), 'LR', lr.map(String), 'DispPos', [String(disp), '0'], 'HorScale', ['1'], 'VertScale', ['1']]]];

describe('parseFontFaces on a hand-built fonts.rdr', () => {
  const root: RdrNode = [[
    'faces', [
      'face_a', ['textures', ['a.tif'], 'xspacing', ['0'], 'opacity', ['0.7'], 'scale', ['1'], 'dropshadow', ['offset', ['3', '3'], 'color', ['0', '0', '0'], 'opacity', ['0.65'], 'baseline', ['0']],
        'charoffsets', [glyph(65, [2, 0], [23, 51]), glyph(96, [1, 1], [9, 9]), glyph(96, [1, 1], [8, 9])]],
      'face_b', ['textures', ['b.tif', 'special.tif'], 'topy', ['0'], 'boty', ['15'],
        'charoffsets', [glyph(172, [0, 6], [25, 31], 0, ['color', ['150', '150', '150']])]],
    ],
  ]];
  const [a, b] = parseFontFaces(root) as [FontFace, FontFace];

  it('reads each face\'s header and its glyphs in file order', () => {
    expect(a).toMatchObject({ name: 'face_a', textures: ['a.tif'], xspacing: 0, opacity: 0.7, scale: 1, topy: null, boty: null, dropShadow: { offset: [3, 3], color: [0, 0, 0], opacity: 0.65 } });
    expect(a.glyphs.map((g) => g.code)).toEqual([65, 96, 96]);
    expect(glyphOf(a, 65)).toEqual({ code: 65, texture: 1, baseline: 0, color: null, ul: [2, 0], lr: [23, 51], disp: [-3, 0], hscale: 1, vscale: 1 });
    expect(b).toMatchObject({ textures: ['b.tif', 'special.tif'], topy: 0, boty: 15, dropShadow: null, opacity: 1 });
    expect(b.glyphs[0]!.color).toEqual([150, 150, 150]);
  });

  it('takes the first of a repeated code (FONT_DUP_GLYPH_READING), and undefined for a code it lacks', () => {
    expect(glyphOf(a, 96)!.lr).toEqual([9, 9]);
    expect(glyphOf(a, 97)).toBeUndefined();
    expect(() => parseFontFaces([['nothing', []]])).toThrow(/faces/);
  });
});

const READERC = fixture(FONTS_RDR.archive);

describe.skipIf(READERC === null)(`RUN/READERC.ZAR/fonts.rdr${READERC === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  const faces = (): FontFace[] => {
    const zar = Zar.parse(READERC!);
    return parseFontFaces(parseRdr(zar.data(zar.find(FONTS_RDR.member)!)));
  };
  const histogram = (f: FontFace) => {
    const h = new Map<number, number>();
    for (const g of f.glyphs) h.set(g.disp[0], (h.get(g.disp[0]) ?? 0) + 1);
    return Object.fromEntries([...h].sort((x, y) => x[0] - y[0]));
  };

  it('has two faces: font_titlebar_01 and font_text_01, font_special_01 the second texture (R95.11)', () => {
    const [title, text] = faces() as [FontFace, FontFace];
    expect(faces().map((f) => f.name)).toEqual(['font_titlebar_01', 'font_text_01']);
    expect(text.textures).toEqual(['font_text_01.tif', 'font_special_01.tif']);
    expect(title.textures).toEqual(['font_titlebar_01.tif']);
  });

  it('font_titlebar_01: 166 glyphs, 51-row cells, opacity 0.7, dropshadow (3,3) at 0.65, DispPos -3x89 -2x1 -1x37 0x35 1x4', () => {
    const title = faces()[0]!;
    expect(title).toMatchObject({ xspacing: 0, opacity: 0.7, scale: 1, topy: null, boty: null, dropShadow: { offset: [3, 3], color: [0, 0, 0], opacity: 0.65 } });
    expect(title.glyphs).toHaveLength(166);
    expect(new Set(title.glyphs.map((g) => g.lr[1] - g.ul[1]))).toEqual(new Set([51]));
    expect(histogram(title)).toEqual({ '-3': 89, '-2': 1, '-1': 37, 0: 35, 1: 4 });
    expect(glyphOf(title, 65)).toMatchObject({ ul: [2, 0], lr: [23, 51], disp: [-3, 0] });
    expect(title.glyphs.filter((g) => g.baseline !== 0).map((g) => [g.code, g.baseline])).toEqual([[33, 1], [46, 1]]);
  });

  it('font_text_01: 185 glyphs, 18 on font_special_01 at the note\'s cells, scales and baselines; code 96 twice', () => {
    const text = faces()[1]!;
    expect(text.glyphs).toHaveLength(185);
    expect(text).toMatchObject({ topy: 0, boty: 15, dropShadow: { offset: [1.5, 1.5], opacity: 0.75 } });
    const specials = text.glyphs.filter((g) => g.texture === 2);
    expect(specials).toHaveLength(18);
    const at = (code: number) => { const g = glyphOf(text, code)!; return [g.ul, g.lr, g.hscale, g.baseline]; };
    expect(at(PAD_GLYPH.TRIANGLE)).toEqual([[0, 6], [25, 31], 0.9, 0]);
    expect(at(PAD_GLYPH.SQUARE)).toEqual([[25, 6], [50, 31], 0.9, 0]);
    expect(at(PAD_GLYPH.CROSS)).toEqual([[50, 6], [75, 31], 0.9, 0]);
    expect(at(PAD_GLYPH.CIRCLE)).toEqual([[75, 6], [100, 31], 0.9, 0]);
    expect(at(PAD_GLYPH.SELECT)).toEqual([[207, 1], [255, 30], 0.9, 4]);
    expect(at(PAD_GLYPH.R2)).toEqual([[148, 34], [183, 63], 0.75, 4]);
    // DPAD_GLYPH_DIRECTION_READING (S4): the cells at x 182/200/218/236 are right / left / down / up.
    expect([PAD_GLYPH.DPAD_RIGHT, PAD_GLYPH.DPAD_LEFT, PAD_GLYPH.DPAD_DOWN, PAD_GLYPH.DPAD_UP].map((c) => at(c)[0])).toEqual([[182, 34], [200, 34], [218, 34], [236, 34]]);
    expect(at(163)).toEqual([[182, 34], [202, 63], 1, 2]);
    expect(text.glyphs.filter((g) => g.code === 96).map((g) => g.lr[0])).toEqual([127, 126]);
    expect(glyphOf(text, 96)!.lr[0]).toBe(127);
  });
});
