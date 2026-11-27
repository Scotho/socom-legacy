// @vitest-environment jsdom
// test/scoreboardStreamer.test.ts -- STREAMER-P1 fold (the controller's ruling, 2026-11-24 20:13Z; product track, a browser
// adaptation): with Streamer mode's Room and account details Hidden, the scoreboard's own row draws YOU with no clan tag,
// as the front end's own-name vars do; every other row, and the board with the mode Off, as before.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pingBarsPlace, SCORE_LAYOUT, scoreboardLayout, type ScoreRowInfo } from '../src/scoreboard';
import { layoutText } from '../src/hudFont';
import { resetStreamerCache, saveStreamerRow, setStreamerMode } from '../src/streamerMode';

const PS2 = { width: 640, height: 448 };
const SIZES: Record<string, { width: number; height: number }> = {
  'newweapnbkrnd.tif': { width: 128, height: 64 }, 'font_text_01.tif': { width: 512, height: 128 }, white: { width: 1, height: 1 },
};
const info = { player: 'KiLL', game: 'CROSSROADS', type: 'DEMOLITION' };
type Quads = ReturnType<typeof scoreboardLayout>['quads'];
const drawn = (quads: Quads, line: string, x: number, y: number, scale = 0.8): number => {
  const g = layoutText(line, x, y, scale).glyphs;
  const hit = g.map((h) => quads.find((q) => q.texture === 'font_text_01.tif' && q.rgba[0] !== 0
    && Math.abs(q.x - (h.x + h.w / 2)) < 1e-6 && Math.abs(q.y - (h.y + h.h / 2)) < 1e-6 && q.u0 === h.u0));
  return hit.every((q) => q) ? hit.length : 0;
};
const TAG_X = pingBarsPlace().tagX, NAME_X = pingBarsPlace().nameX;
const row = (id: number, over: Partial<ScoreRowInfo> = {}): ScoreRowInfo =>
  ({ id, name: `P${id}`, team: 'seal', kills: 0, deaths: 0, score: 10 - id, alive: true, self: false, ...over });
const base = (i: number): number => SCORE_LAYOUT.teams[0]!.y + SCORE_LAYOUT.rows.dy + SCORE_LAYOUT.rows.pitch * i;
const rows = [row(1, { self: true, name: 'KiLL', clan: 'NSW' }), row(2, { name: 'Other', clan: 'ABC' })];

beforeEach(() => { localStorage.clear(); resetStreamerCache(); });
afterEach(() => { localStorage.clear(); resetStreamerCache(); });

describe('STREAMER-P1: the scoreboard\'s own row', () => {
  it('Off: the own row draws its name and "[tag]" as before', () => {
    const { quads } = scoreboardLayout(PS2, { ...info, rows }, SIZES);
    expect(drawn(quads, 'KiLL', NAME_X, base(0))).toBe(4);
    expect(drawn(quads, '[NSW]', TAG_X, base(0))).toBe(5);
  });
  it('Hidden: the own row draws YOU and no tag; another player\'s row as before', () => {
    setStreamerMode(true);
    const { quads } = scoreboardLayout(PS2, { ...info, rows }, SIZES);
    expect(drawn(quads, 'YOU', NAME_X, base(0))).toBe(3);
    expect(drawn(quads, 'KiLL', NAME_X, base(0))).toBe(0);
    expect(drawn(quads, '[NSW]', TAG_X, base(0))).toBe(0);
    expect(drawn(quads, 'Other', NAME_X, base(1))).toBe(5);
    expect(drawn(quads, '[ABC]', TAG_X, base(1))).toBe(5);
  });
  it('Hidden: the single-SEAL board (no room rows) draws YOU for the player', () => {
    const at = SCORE_LAYOUT.teams[0]!.y + SCORE_LAYOUT.rows.dy;
    expect(drawn(scoreboardLayout(PS2, info, SIZES).quads, 'KiLL', SCORE_LAYOUT.rows.nameX, at)).toBe(4);
    setStreamerMode(true);
    expect(drawn(scoreboardLayout(PS2, info, SIZES).quads, 'YOU', SCORE_LAYOUT.rows.nameX, at)).toBe(3);
    saveStreamerRow('details', 'shown');
    expect(drawn(scoreboardLayout(PS2, info, SIZES).quads, 'KiLL', SCORE_LAYOUT.rows.nameX, at)).toBe(4);
  });
});
