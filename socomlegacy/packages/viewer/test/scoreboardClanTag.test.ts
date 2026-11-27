// test/scoreboardClanTag.test.ts -- LATER 1030 (c) on the SCOREBOARD: the room tells a seat's clan tag as a BYTE
// string (one character a byte of the stored UTF-8), and the board's row decodes it with the engine's own decoder
// (`FONT_TEXT_01.tagText`, `@s2u/ui` `engineCodes`, FUN_0039f0c0 / FUN_0039f160) before it draws "[tag]" -- as every
// other HUD site does (hudClanTagBytes.test.ts). The name is code-point text and is not decoded.
import { describe, expect, it } from 'vitest';
import { NO_CLAN, pingBarsPlace, SCORE_LAYOUT, scoreboardLayout, type ScoreRowInfo } from '../src/scoreboard';
import { layoutText } from '../src/hudFont';

const PS2 = { width: 640, height: 448 };
const SIZES: Record<string, { width: number; height: number }> = {
  'newweapnbkrnd.tif': { width: 128, height: 64 }, 'font_text_01.tif': { width: 512, height: 128 }, white: { width: 1, height: 1 },
};
const info = { player: 'SEAL', game: 'CROSSROADS', type: 'DEMOLITION' };
type Quads = ReturnType<typeof scoreboardLayout>['quads'];
/** The text quads (not shadows) of `line` laid at the pen and baseline, as the layout draws them: the whole string, or none. */
const drawn = (quads: Quads, line: string, x: number, y: number, scale = 0.8): Quads => {
  const g = layoutText(line, x, y, scale).glyphs;
  const hit = g.map((h) => quads.find((q) => q.texture === 'font_text_01.tif' && q.rgba[0] !== 0
    && Math.abs(q.x - (h.x + h.w / 2)) < 1e-6 && Math.abs(q.y - (h.y + h.h / 2)) < 1e-6 && q.u0 === h.u0));
  return hit.every((q) => q) ? hit as Quads : [];
};
/** The text glyphs (not shadows) in the clan's colour on a row's band (baseline - 14 .. + 4). */
const tagGlyphs = (quads: Quads, base: number): Quads =>
  quads.filter((q) => q.texture === 'font_text_01.tif' && q.rgba[0] === 1 && q.rgba[1] === 0.5
    && q.y > base - 14 && q.y < base + 4);
const codes = (s: string): number[] => [...s].map((c) => c.codePointAt(0)!);

/** "«G»" as the room tells it: the bytes C2 AB 47 C2 BB, one character each. */
const GUILLEMET_G = 'Â«GÂ»';
const TAG_X = pingBarsPlace().tagX, NAME_X = pingBarsPlace().nameX;
const row = (id: number, over: Partial<ScoreRowInfo> = {}): ScoreRowInfo =>
  ({ id, name: `P${id}`, team: 'seal', kills: 0, deaths: 0, score: 10 - id, alive: true, self: false, ...over });
const base = (i: number): number => SCORE_LAYOUT.teams[0]!.y + SCORE_LAYOUT.rows.dy + SCORE_LAYOUT.rows.pitch * i;

describe('the scoreboard row\'s "[tag]" is decoded (LATER 1030 (c), FONT_TEXT_01.tagText)', () => {
  it('a told «G» (C2 AB 47 C2 BB) draws "[«G»]" -- the codes 5B AB 47 BB 5D -- at the tag\'s pen, not its five bytes', () => {
    const { quads } = scoreboardLayout(PS2, { ...info, rows: [row(1, { clan: GUILLEMET_G })] }, SIZES);
    expect(codes('[«G»]')).toEqual([0x5b, 0xab, 0x47, 0xbb, 0x5d]);
    expect(drawn(quads, '[«G»]', TAG_X, base(0))).toHaveLength(5);
    expect(drawn(quads, `[${GUILLEMET_G}]`, TAG_X, base(0))).toHaveLength(0);
    expect(tagGlyphs(quads, base(0))).toHaveLength(5);
  });

  it('an ASCII tag is drawn as before; the name is not decoded', () => {
    const { quads } = scoreboardLayout(PS2, { ...info, rows: [row(1, { clan: 'NSW', name: 'Âme' })] }, SIZES);
    expect(drawn(quads, '[NSW]', TAG_X, base(0))).toHaveLength(5);
    expect(tagGlyphs(quads, base(0))).toHaveLength(5);
    expect(drawn(quads, 'Âme', NAME_X, base(0))).toHaveLength(3);
  });

  it('no tag, or an empty one: NO_CLAN, nothing drawn in the clan\'s colour', () => {
    expect(NO_CLAN).toBe(' ');
    for (const r of [row(1), row(1, { clan: '' })]) {
      expect(tagGlyphs(scoreboardLayout(PS2, { ...info, rows: [r] }, SIZES).quads, base(0))).toHaveLength(0);
    }
  });

  it('the single-SEAL board (no room rows) draws no tag at all -- the row\'s tag exists only on a board with rows', () => {
    const { quads } = scoreboardLayout(PS2, info, SIZES);
    expect(quads.filter((q) => q.texture === 'font_text_01.tif' && q.rgba[0] === 1 && q.rgba[1] === 0.5)).toHaveLength(0);
  });
});
