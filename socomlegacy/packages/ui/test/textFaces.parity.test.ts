// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, Zar, type RdrNode } from '@s2u/archive';
import { faceNames, glyphWidth, layoutText, lookupGlyph, measureText, readTextFaces, type TextFace } from '../src/text/index';

/**
 * TA-FRONTEND's golden pin of the UI's fonts (web research 111 §1-§3; TA.R3). `golden/fontsRdr.json` holds the parsed
 * tree of `RUN/READERC.ZAR`'s `fonts.rdr` (the two faces' glyph tables: codes, atlas rectangles, displacements, the
 * shadows). The unit half reads the faces from it with the face reader and lays text out in them with no game data
 * (CI); the disc half re-reads the member and compares the tree whole (it skips without `SOCOM_DISC` /
 * `SOCOM_PC_ROOT`). `text/textDisc.test.ts` holds the faces' claims on the disc only.
 */
interface Pin { _source: string; archive: string; member: string; tree: RdrNode }
const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, 'golden/fontsRdr.json'), 'utf8')) as Pin;
const faces = (): [TextFace, TextFace] => readTextFaces(PIN.tree) as [TextFace, TextFace];
const codes = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));

describe('fonts.rdr\'s faces from their golden pin (no game data)', () => {
  it('two faces, font_titlebar_01 and font_text_01: 166 and 184 glyphs (185 records: code 96 twice is one glyph)', () => {
    expect([PIN.archive, PIN.member]).toEqual(['RUN/READERC.ZAR', 'fonts.rdr']);
    expect(faceNames(PIN.tree)).toEqual(['font_titlebar_01', 'font_text_01']);
    const [title, text] = faces();
    expect([title.name, text.name]).toEqual(['font_titlebar_01', 'font_text_01']);
    expect([title.glyphs.size, text.glyphs.size]).toEqual([166, 184]);
    expect(title.textures).toEqual(['font_titlebar_01.tif']);
    expect(text.textures).toEqual(['font_text_01.tif', 'font_special_01.tif']);
  });

  it('the face fields: shadows (3,3) 0.65 and (1,1) 0.75; opacity 0.7, scale 1, xspacing 0, no glow texture, no Korean table', () => {
    const [title, text] = faces();
    expect([title.shadow, text.shadow]).toEqual([
      { offset: [3, 3], color: [0, 0, 0], opacity: Math.fround(0.65) }, { offset: [1, 1], color: [0, 0, 0], opacity: 0.75 },
    ]);
    expect([text.topy, text.boty, title.boty]).toEqual([0, 15, 0]);
    for (const f of [title, text]) expect([f.opacity, f.scale, f.xspacing, f.glowTexture, f.korean]).toEqual([Math.fround(0.7), 1, 0, null, false]);
  });

  it('a code listed twice is one glyph with both elements (R111.3): font_text_01\'s 96, drawn twice; its width the larger element\'s', () => {
    const [title, text] = faces();
    const multi = (f: TextFace): number[] => [...f.glyphs.values()].filter((g) => g.elements.length > 1).map((g) => g.code);
    expect([multi(title), multi(text)]).toEqual([[], [96]]);
    const g96 = text.glyphs.get(96)!;
    expect(glyphWidth(g96)).toBe(Math.max(...g96.elements.map((e) => Math.trunc(e.disp[0] + e.width * e.hscale))));
    const run = layoutText(text, [96], 100, 100, { scale: 1, color: [128, 128, 128], alpha: 128 });
    // Per element, its shadow then itself (the face has a shadow): four quads.
    expect(run.quads.map((q) => q.shadow)).toEqual([true, false, true, false]);
  });

  it('18 glyphs of font_text_01 carry a colour (150,150,150) on its second atlas, and draw with no shadow', () => {
    const [, text] = faces();
    const coloured = [...text.glyphs.values()].filter((g) => g.color !== null);
    expect(coloured).toHaveLength(18);
    expect(coloured.every((g) => g.texture === 1 && g.color!.join() === '150,150,150')).toBe(true);
    const run = layoutText(text, [coloured[0]!.code], 0, 0, { scale: 1, color: [128, 128, 128], alpha: 100 });
    expect(run.quads.every((q) => !q.shadow && q.texture === 'font_special_01.tif' && q.rgba.join() === '150,150,150,100')).toBe(true);
  });

  it('every letter A-Z is in both faces, so an unknown code draws the letter \'A\' + code % 26 and never the last resort (R111.6)', () => {
    for (const f of faces()) {
      for (let c = 0x41; c <= 0x5a; c++) expect(f.glyphs.has(c), `${f.name} ${c}`).toBe(true);
      const unknown = [...Array(0x400).keys()].find((c) => c > 0x20 && !f.glyphs.has(c) && c !== 0x0d)!;
      expect(lookupGlyph(f, unknown), f.name).toEqual({ glyph: f.glyphs.get(0x41 + (unknown % 26)), fallback: 'letter' });
      expect(lookupGlyph(f, 0x0d)).toEqual({ glyph: null, fallback: 'none' });
    }
  });

  it('the measure (FUN_00362b70) on the real metrics: each glyph int(S x (W - 1) + 0.5); two lines measure as their SUM (R111.9)', () => {
    const [title, text] = faces();
    for (const [f, s, scale] of [[text, 'DEVELOPED', 0.8], [title, 'OPTIONS', Math.fround(0.95)]] as const) {
      let want = 0;
      for (const c of codes(s)) want = Math.trunc(Math.fround(Math.fround(want + Math.fround(scale * (glyphWidth(f.glyphs.get(c)!) - 1))) + 0.5));
      expect(measureText(f, codes(s), scale).width, `${f.name} ${s}`).toBe(want);
      const two = measureText(f, codes(`${s}\n${s}`), scale);
      expect([two.width, two.breaks, two.lastLine]).toEqual([2 * want, 1, want]);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The disc half: the pin re-derived.

const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => d !== undefined && existsSync(resolve(d, PIN.archive))) ?? null;

describe.skipIf(DISC === null)('fonts.rdr\'s pin re-derived from the disc (SOCOM_DISC / SOCOM_PC_ROOT)', () => {
  it('the pinned tree is parseRdr of RUN/READERC.ZAR\'s fonts.rdr, whole', () => {
    const z = Zar.parse(new Uint8Array(readFileSync(resolve(DISC!, PIN.archive))));
    expect(parseRdr(z.data(z.find(PIN.member)!))).toEqual(PIN.tree);
  });
});
