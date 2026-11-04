import type { RdrNode } from '@s2u/archive';
import { readTextFace, type TextFace } from '../../src/index';

// Hand-built fonts.rdr for the text tests (web research 111): shaped as parseRdr returns the disc's, no disc bytes.

/** A `charoffsets` record in the `Code` form. */
export const glyph = (code: number, ul: number[], lr: number[], disp: number[] = [0, 0], extra: RdrNode[] = [], scales: string[] = ['1', '1']): RdrNode =>
  ['Code', [String(code)], 'texture', ['1'], 'baseline', ['0'], 'Elems',
    [['UL', ul.map(String), 'LR', lr.map(String), 'DispPos', disp.map(String), 'HorScale', [scales[0]!], 'VertScale', [scales[1]!]]], ...extra];

/** A fonts.rdr with one text face (`font_t`, a drop shadow) and one bare face (`font_b`). */
export const FONTS: RdrNode = [[
  'faces', [
    'font_t', [
      'textures', ['t.tif', 'special.tif'], 'xspacing', ['0'], 'opacity', ['0.7'], 'scale', ['1'], 'topy', ['0'], 'boty', ['15'],
      'dropshadow', ['offset', ['1.5', '1.5'], 'color', ['0', '0', '0'], 'opacity', ['0.75'], 'baseline', ['0']],
      'charoffsets', [
        glyph(32, [2, 100], [12, 125], [-3, 0]),
        glyph(35, [40, 0], [48, 25]),
        glyph(65, [2, 0], [13, 25]),
        glyph(66, [14, 0], [25, 25], [-1, 0]),
        glyph(67, [26, 0], [32, 25]),
        glyph(96, [118, 25], [127, 50], [-1, 0]),
        ['Code', ['96'], 'texture', ['1'], 'baseline', ['2'], 'Elems', [['UL', ['118', '25'], 'LR', ['126', '50'], 'DispPos', ['-1', '0'], 'HorScale', ['1'], 'VertScale', ['1']]]],
        ['Code', ['166'], 'texture', ['2'], 'baseline', ['0'], 'Elems', [['UL', ['50', '6'], 'LR', ['75', '31'], 'DispPos', ['0', '0'], 'HorScale', ['0.9'], 'VertScale', ['0.9']]], 'color', ['150', '150', '150']],
      ],
    ],
    'font_b', ['texture', ['b.tif'], 'charoffsets', [glyph(66, [0, 0], [10, 20])]],
  ],
]];

/** The text face, read. */
export const textFace = (): TextFace => readTextFace(FONTS, 'font_t');
