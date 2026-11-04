import { describe, expect, it } from 'vitest';
import { Zar, parseRdr, rdrGet, type RdrNode } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { parseZdb } from '@s2u/archive';
import { DPAD_GLYPH, FONT_SPECIAL_01, FONT_TEXT_01, layoutText, PEN_NUDGE, textWidth, TEXT_V } from '../src/hudFont';
import { readHud } from '../src/hudAssets';
import { GS_SAMPLE_OFFSET } from '../src/hud';
import { PAD_GLYPH } from '@s2u/scene';

/**
 * The HUD's font (socomlegacy/docs/research/87-hud.md §3): `fonts.rdr`'s `font_text_01`, transcribed, and the text model
 * fitted on the console frame's "30/30" and "2 MAGS".
 */

const readerc = fixture('RUN/READERC.ZAR');

describe('layoutText', () => {
  it('moves the pen by int((width + DispPos - 1) x scale + 0.5), as FUN_00363c20 does', () => {
    // '3' 9 wide, '0' 10, '/' 12 with DispPos -1: at 0.9 the advances are 7, 8 and 9.
    const { glyphs, width } = layoutText('30/30', 15, 382, 0.9);
    glyphs.forEach((g, i) => expect(g.x - PEN_NUDGE).toBeCloseTo([15, 22, 30 - 0.9, 39, 46][i]!, 9));
    expect(width).toBe(7 + 8 + 9 + 7 + 8);
    expect(textWidth('30/30', 0.9)).toBe(width);
  });

  it('draws each glyph (width - 1) x scale + 0.5 wide over texels UL.x .. UL.x + width - 1', () => {
    const { glyphs } = layoutText('0', 0, 0, 0.9);
    expect(glyphs[0]).toMatchObject({ char: '0', u0: 389, u1: 398, v0: 0, v1: 25 });
    expect(glyphs[0]!.w).toBeCloseTo(9 * 0.9 + 0.5, 9);
  });

  it('stands the glyphs on the baseline: row 20 of the cell at the baseline + 0.3, 25 rows at scale x 448/480', () => {
    const { glyphs } = layoutText('A', 0, 382, 0.9);
    const k = 0.9 * TEXT_V;
    expect(glyphs[0]!.h).toBeCloseTo(25 * k, 9);
    expect(glyphs[0]!.y + 20 * k).toBeCloseTo(382.3, 9);
  });

  it('a space advances by int((10 - 3 - 1) x scale + 0.5) and draws nothing', () => {
    const { glyphs } = layoutText('2 MAGS', 0, 0, 0.9);
    expect(glyphs.map((g) => g.char).join('')).toBe('2MAGS');
    expect(glyphs[1]!.x - PEN_NUDGE).toBeCloseTo(7 + 5, 9);
  });

  it('at the ammo box scale 0.9 the glyphs land on the console frame glyph centroids (within half a pixel)', () => {
    // research 87 §3: the frame's glyph centroids (x) and the atlas's (texels from UL.x); the pens at 15 and 95.
    const atlas: Record<string, number> = { '3': 4.39, '0': 4.76, '/': 4.63, '2': 4.34, M: 5.9, A: 4.91, G: 5.17, S: 4.51 };
    const frame = [[19.34, 26.75, 33.75, 43.34, 50.75], [99.31, 112.96, 122.93, 132.19, 140.54]];
    [['30/30', 15], ['2 MAGS', 95]].forEach(([line, pen], i) => {
      const { glyphs } = layoutText(line as string, pen as number, 382, 0.9);
      glyphs.forEach((g, j) => {
        const texels = g.u1 - g.u0;                                 // the width - 1 texels the quad spans
        // The GS samples at the pixel's corner: the drawn texels sit GS_SAMPLE_OFFSET right of the quad's (./hud).
        const x = g.x + GS_SAMPLE_OFFSET + ((atlas[g.char]! + 0.5) / (texels + 1)) * g.w;
        expect(Math.abs(x - frame[i]![j]!), `${line} ${g.char}`).toBeLessThan(0.5);
      });
    });
  });
});

describe.skipIf(readerc === null)(`FONT_TEXT_01 against READERC.ZAR/fonts.rdr${readerc === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it('every transcribed glyph is the archive\'s, and the header too', () => {
    const zar = Zar.parse(readerc!);
    const key = zar.root.children.find((k) => k.name.toLowerCase() === 'fonts.rdr')!;
    const root = parseRdr(zar.data(key)) as RdrNode[];
    const face = rdrGet(rdrGet(root[0]!, 'faces')!, 'font_text_01')!;
    expect(rdrGet(face, 'opacity')).toBe('0.7');
    expect(rdrGet(face, 'xspacing')).toBe('0');
    const list = rdrGet(face, 'charoffsets') as RdrNode[];
    const firstOf = new Map<number, number[]>();
    for (const c of list) {
      const code = Number(rdrGet(c, 'Code'));
      if (firstOf.has(code)) continue;
      const e0 = rdrGet(c, 'Elems') as RdrNode[];
      const e = (typeof e0[0] === 'string' ? e0 : e0[0]) as RdrNode[];
      const [ux, uy] = (rdrGet(e, 'UL') as string[]).map(Number);
      const [lx, ly] = (rdrGet(e, 'LR') as string[]).map(Number);
      const [dx] = (rdrGet(e, 'DispPos') as string[]).map(Number);
      firstOf.set(code, [code, ux!, uy!, lx!, ly!, dx!]);
    }
    expect(FONT_TEXT_01.glyphs).toHaveLength(95);
    for (const g of FONT_TEXT_01.glyphs) expect(g).toEqual(firstOf.get(g[0]));
  });
});

describe('the pad glyphs (FONT_SPECIAL_01, web sprint 5 S4; research 95 §5.4)', () => {
  const R2 = String.fromCharCode(0xbe);
  it('reads them only on a line that asks: without, 0xbe is an unknown character (the advance of a space, nothing drawn)', () => {
    expect(layoutText(R2, 0, 0, 0.9).glyphs).toEqual([]);
    expect(textWidth(R2, 0.9)).toBe(textWidth(' ', 0.9));
  });

  it('places R2 (0xbe) from font_special_01.tif in its own colour, HorScale 0.75 wide, the pen by int((int(35 x 0.75) - 1) x S + 0.5)', () => {
    const { glyphs, width } = layoutText(R2, 10, 380, 0.9, { special: true });
    const g = glyphs[0]!;
    expect(g).toMatchObject({ texture: 'font_special_01.tif', rgb: [150, 150, 150], u0: 148, u1: 182 + 15 / 16, v0: 35, v1: 63 });
    expect(g.x - PEN_NUDGE).toBeCloseTo(10, 9);
    expect(g.w).toBeCloseTo((35 * 0.75 - 1) * 0.9 + 0.5, 9);
    expect(width).toBe(Math.floor((26 - 1) * 0.9 + 0.5));
    expect(textWidth(R2, 0.9, { special: true })).toBe(width);
    // Vertical (SPECIAL_GLYPH_PLACEMENT_READING): h = LR.y - UL.y - 1 = 28 rows (OBF-33's fold, D:L260388); the
    // letters' top + (baseline 4 - 28 + 25) rows, 28 x 0.75 rows tall.
    const k = 0.9 * TEXT_V;
    const letters = layoutText('A', 10, 380, 0.9).glyphs[0]!;
    expect(g.y).toBeCloseTo(letters.y + 1 * k, 9);
    expect(g.h).toBeCloseTo(28 * 0.75 * k, 9);
  });

  it('places the d-pad arrows at full size, 2 rows of baseline below the top of the letters less their 4 extra rows', () => {
    const k = 0.9 * TEXT_V;
    const letters = layoutText('A', 0, 380, 0.9).glyphs[0]!;
    const g = layoutText(String.fromCharCode(DPAD_GLYPH.right), 0, 380, 0.9, { special: true }).glyphs[0]!;
    expect(g).toMatchObject({ u0: 182, u1: 201 + 15 / 16, v0: 35, v1: 63 });
    // h = LR.y - UL.y - 1 = 28 rows (OBF-33's fold, D:L260388).
    expect(g.y).toBeCloseTo(letters.y + (2 - 28 + 25) * k, 9);
    expect(g.h).toBeCloseTo(28 * k, 9);
  });

  it('names the d-pad codes by direction: 0xa3 right, 0xaf left, 0xb1 down, 0xb5 up (DPAD_GLYPH_DIRECTION_READING)', () => {
    expect(DPAD_GLYPH).toEqual({ right: 163, left: 175, down: 177, up: 181 });
  });
});

describe('the pad glyphs\' texels as FUN_00361bd0 maps them (OBF-33; research 111 §3.2)', () => {
  // u from UL.x to UL.x + width - 1 + 15/16 (`DAT_003e0340` = 15 sixteenths, D:L260407-260408); v from UL.y + 1 to
  // LR.y (the element keeps texH - UL.y - 1 and texH - LR.y, `FUN_0035c2c0` D:L256907-256908, read at D:L260368 and
  // D:L260409).
  const pad = (code: number) => layoutText(String.fromCharCode(code), 0, 380, 0.9, { special: true }).glyphs[0]!;

  it('Cross (0xa6) at scale 0.9: u0 50, u1 50 + 25 - 1 + 15/16, v0 7, v1 31', () => {
    expect(pad(PAD_GLYPH.CROSS)).toMatchObject({ u0: 50, u1: 50 + 25 - 1 + 15 / 16, v0: 7, v1: 31 });
  });

  it("Cross's quad is LR.y - UL.y - 1 = 24 rows x VertScale 0.9, its top a row under the raw rect's (D:L260388, D:L260431-260432)", () => {
    const k = 0.9 * TEXT_V;
    const letters = layoutText('A', 0, 380, 0.9).glyphs[0]!;
    const g = pad(PAD_GLYPH.CROSS);
    expect(g.h).toBeCloseTo(24 * 0.9 * k, 9);
    expect(g.y).toBeCloseTo(letters.y + (0 - 0 - 24 + 25) * k, 9);   // baseline 0, DispPos.y 0
  });

  it("every pad glyph's quad: (LR.y - UL.y - 1) x VertScale rows, its top at (baseline - DispPos.y - (LR.y - UL.y - 1) + 25) rows", () => {
    const k = 0.9 * TEXT_V;
    const top = layoutText('A', 0, 380, 0.9).glyphs[0]!.y;
    for (const [code, , uly, , lry, , dy, baseline, , vs] of FONT_SPECIAL_01.glyphs) {
      const h = lry - uly - 1, g = pad(code);
      expect(g.h, String(code)).toBeCloseTo(h * vs * k, 9);
      expect(g.y, String(code)).toBeCloseTo(top + (baseline - dy - h + 25) * k, 9);
    }
  });

  it('Circle, Square and Triangle from their rects', () => {
    expect(pad(PAD_GLYPH.CIRCLE)).toMatchObject({ u0: 75, u1: 75 + 25 - 1 + 15 / 16, v0: 7, v1: 31 });
    expect(pad(PAD_GLYPH.SQUARE)).toMatchObject({ u0: 25, u1: 25 + 25 - 1 + 15 / 16, v0: 7, v1: 31 });
    expect(pad(PAD_GLYPH.TRIANGLE)).toMatchObject({ u0: 0, u1: 0 + 25 - 1 + 15 / 16, v0: 7, v1: 31 });
  });

  it('every pad glyph: UL.x .. UL.x + width - 1 + 15/16 and UL.y + 1 .. LR.y', () => {
    for (const [code, ulx, uly, lrx, lry] of FONT_SPECIAL_01.glyphs) {
      expect(pad(code), String(code)).toMatchObject({ u0: ulx, u1: lrx - 1 + 15 / 16, v0: uly + 1, v1: lry });
    }
  });

  it('leaves the letters on their fitted mapping (UL.x .. UL.x + width - 1, UL.y .. LR.y; LATER 594)', () => {
    expect(layoutText('0', 0, 0, 0.9).glyphs[0]).toMatchObject({ u0: 389, u1: 398, v0: 0, v1: 25 });
  });

  it('the left edge is the mapping\'s u0 alone: at the native frame the first column samples u = UL.x, half texel UL.x - 1 under the linear filter', () => {
    // Recorded arithmetic, not evidence about the renderer: this re-derives `Hud.fill`'s shift by hand and draws
    // nothing, so it shows what that formula gives, not what `fill` does.
    // The pass shifts the texels by -GS_SAMPLE_OFFSET px x (u1 - u0) / w (./hud `fill`), so the first column's centre
    // (0.5 px in) reads u0 + (0.5 - GS_SAMPLE_OFFSET) x (u1 - u0) / w: u0 whatever u1 is. The new right edge does not
    // move it, so the neighbour's texel 49 (Square's last column) still weighs 0.5 there -- as the GS's own first
    // column samples at u0 (its corner), a filter convention the decompilation does not hold (LATER 594).
    const g = pad(PAD_GLYPH.CROSS);
    const first = g.u0 + (0.5 - GS_SAMPLE_OFFSET) * (g.u1 - g.u0) / g.w;
    expect(first).toBe(50);
    // The linear filter weighs texel i by max(0, 1 - |u - (i + 0.5)|).
    const weight = (i: number, u: number): number => Math.max(0, 1 - Math.abs(u - (i + 0.5)));
    expect(weight(49, first)).toBeCloseTo(0.5, 9);
    expect(weight(50, first)).toBeCloseTo(0.5, 9);
    // Above the native frame (a display s x 448 rows tall) the pass shifts by GS_SAMPLE_OFFSET x s display pixels while
    // a display column is 1 / s of a PS2 pixel, so the first column reads left of u0: u0 + (0.5 - GS_SAMPLE_OFFSET x s)
    // x (u1 - u0) / (w x s). At s = 2: 50 - 0.25 x 24.9375 / 19.85 = 49.686, texel 49 weighing 0.814 (LATER 594).
    const s = 2;
    const firstAt2 = g.u0 + (0.5 - GS_SAMPLE_OFFSET * s) * (g.u1 - g.u0) / (g.w * s);
    expect(g.w).toBeCloseTo((25 * 0.9 - 1) * 0.9 + 0.5, 9);
    expect(firstAt2).toBeCloseTo(50 - 0.25 * 24.9375 / 19.85, 9);
    expect(weight(49, firstAt2)).toBeCloseTo(0.814, 3);
  });
});

describe.skipIf(readerc === null)(`FONT_SPECIAL_01 against READERC.ZAR/fonts.rdr${readerc === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it('is the 18 texture-2 glyphs, each with color (150 150 150)', () => {
    const zar = Zar.parse(readerc!);
    const key = zar.root.children.find((k) => k.name.toLowerCase() === 'fonts.rdr')!;
    const root = parseRdr(zar.data(key)) as RdrNode[];
    const face = rdrGet(rdrGet(root[0]!, 'faces')!, 'font_text_01')!;
    const list = rdrGet(face, 'charoffsets') as RdrNode[];
    const onTwo = list.filter((c) => rdrGet(c, 'texture') === '2').map((c) => {
      const e0 = rdrGet(c, 'Elems') as RdrNode[];
      const e = (typeof e0[0] === 'string' ? e0 : e0[0]) as RdrNode[];
      const n = (k: string): number[] => [rdrGet(e, k)].flat().map(Number);
      expect((rdrGet(c, 'color') as string[]).map(Number)).toEqual(FONT_SPECIAL_01.rgb);
      return [Number(rdrGet(c, 'Code')), ...n('UL'), ...n('LR'), ...n('DispPos'), Number(rdrGet(c, 'baseline')), ...n('HorScale'), ...n('VertScale')];
    });
    expect(FONT_SPECIAL_01.glyphs).toEqual(onTwo);
  });
});

const mp2 = fixture('RUN/MP2.ZDB');
describe.skipIf(mp2 === null)(`the d-pad glyphs' directions on the disc's atlas${mp2 === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  /**
   * DPAD_GLYPH_DIRECTION_READING, measured: each cell is a pentagon, flat on one side, pointed on the other. The ink's
   * extent across the first and last inked column (and row) says which: the pointed side's is the shorter.
   */
  it('points 163 right, 175 left, 177 down and 181 up', () => {
    const { bitmaps } = readHud(mp2!, parseZdb(mp2!));
    const atlas = bitmaps[FONT_SPECIAL_01.texture]!;
    const ink = (x: number, y: number): boolean => {
      const i = (y * atlas.width + x) * 4, d = atlas.data;
      return (d[i + 3]! / 255) * ((d[i]! + d[i + 1]! + d[i + 2]!) / 765) >= 0.1;
    };
    const direction = (code: number): string => {
      const [, x0, y0, x1, y1] = FONT_SPECIAL_01.glyphs.find((g) => g[0] === code)!;
      const cols: number[] = [], rows: number[] = [];
      for (let x = x0; x < x1; x++) { let n = 0; for (let y = y0; y < y1; y++) if (ink(x, y)) n++; if (n) cols.push(n); }
      for (let y = y0; y < y1; y++) { let n = 0; for (let x = x0; x < x1; x++) if (ink(x, y)) n++; if (n) rows.push(n); }
      const h = cols[0]! - cols[cols.length - 1]!, v = rows[0]! - rows[rows.length - 1]!;
      return Math.abs(h) > Math.abs(v) ? (h > 0 ? 'right' : 'left') : (v > 0 ? 'down' : 'up');
    };
    expect([163, 175, 177, 181].map(direction)).toEqual(['right', 'left', 'down', 'up']);
    for (const [dir, code] of Object.entries(DPAD_GLYPH)) expect(direction(code), dir).toBe(dir);
  });
});
