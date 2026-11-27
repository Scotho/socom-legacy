import { describe, expect, it } from 'vitest';
import {
  ASSISTS_NONE, cutLine, DEAD_DIM, DEFAULT_PLAYER, MODERN_SCOREBOARD_LIFT, PING_BAR_THRESHOLDS_ADAPTATION, PING_BARS_ADAPTATION,
  CLAN_TAG_TYPEABLE_CHARS, CLAN_TAG_WIDEST, PING_HOVER_BACKING_ADAPTATION, PING_HOVER_GAP_ADAPTATION, PING_NAME_GAP_ADAPTATION, PING_TAG_GAP_ADAPTATION,
  PING_OWN_ROW_ALWAYS_ADAPTATION, pingBars, pingBarsPlace, rowNameWidth, SCORE_COLUMNS_ADAPTATION, SCORE_LAYOUT,
  SCORE_TOP, scoreboardLayout, scoreboardRowAt, scoreCell, SCOREBOARD_SATCHEL_RECT, SCOREBOARD_SATCHEL_RGBA_READING,
  SCOREBOARD_SATCHEL_SLOT_ADAPTATION,
} from '../src/scoreboard';
import { damagePanelRows, DAMAGE_PANEL_COLUMNS_ADAPTATION } from '../src/damagePanel';
import { layoutText, textWidth } from '../src/hudFont';
import type { ScoreRowInfo } from '../src/scoreboard';
import {
  AT_REST, DEFAULT_MODEL, Hud, hudLayout, hudPass, MODERN_SCOREBOARD_MARGIN, MODERN_SCOREBOARD_MIN_SCALE, modernScoreboardFit,
  SCOREBOARD_HIDES, SCOREBOARD_KEEPS_BOTTOM,
} from '../src/hud';

/** The multiplayer round's scoreboard (socomlegacy/docs/research/87-hud.md §12): SELECT held, `FUN_0022a8b0`'s layout. */

const PS2 = { width: 640, height: 448 };
const SIZES: Record<string, { width: number; height: number }> = {
  'newweapnbkrnd.tif': { width: 128, height: 64 }, 'font_text_01.tif': { width: 512, height: 128 }, white: { width: 1, height: 1 },
};
const info = { player: 'SEAL', game: 'FROSTFIRE', type: 'SUPPRESSION' };
/** WM-DATA (capture 1F's place): a row's name pen on a board with the room's rows (`pingBarsPlace`); the single-SEAL board keeps 223. */
const NAME_X = pingBarsPlace().nameX;
/** OPS-S1 (`SCOREBOARD_SATCHEL_SLOT_ADAPTATION`): a board with the room's rows is this much wider each side (9) -- its columns this far right, its left column and team titles this far left. */
const G = pingBarsPlace().grow;

describe('scoreboardLayout', () => {
  it('nine-slices the panel over x 153..630, y 104..430, 20-pixel corners, alpha 100', () => {
    const { quads } = scoreboardLayout(PS2, info, SIZES);
    const slice = quads.filter((q) => q.texture === 'newweapnbkrnd.tif').slice(0, 9);
    const x0 = Math.min(...slice.map((q) => q.x - q.w / 2)), x1 = Math.max(...slice.map((q) => q.x + q.w / 2));
    const y0 = Math.min(...slice.map((q) => q.y - q.h / 2)), y1 = Math.max(...slice.map((q) => q.y + q.h / 2));
    expect([x0, x1, y0, y1]).toEqual([153, 630, 104, 430]);
    expect(slice[0]).toMatchObject({ w: 20, h: 20, u0: 128, u1: 128 - (20 / 173) * 128 });    // the left corner mirrored
    for (const q of slice) expect(q.rgba).toEqual([1, 1, 1, 100 / 128]);
    expect(quads.every((q) => q.layer === 1)).toBe(true);
  });

  it('puts the team bars under it: SEALs (32, 32, 64) at 104, TERRORISTS (64, 32, 32) at 267, 25 high, alpha 80', () => {
    const { tris } = scoreboardLayout(PS2, info, SIZES);
    expect(tris).toHaveLength(4);
    expect(tris[0]!.p.slice(0, 2)).toEqual([153, 104]);
    expect(tris[2]!.p.slice(0, 2)).toEqual([153, 267]);
    expect(tris[0]!.rgba).toEqual([32 / 255, 32 / 255, 64 / 255, 80 / 128]);
    expect(tris[2]!.rgba).toEqual([64 / 255, 32 / 255, 32 / 255, 80 / 128]);
    expect(SCORE_LAYOUT.teams[1]!.y).toBe(267);
  });

  it('writes the one SEAL on the first row (y 142) in the local player\'s yellow, the columns 0, the rest empty', () => {
    const { quads } = scoreboardLayout(PS2, info, SIZES);
    const glyphs = quads.filter((q) => q.texture === 'font_text_01.tif' && q.rgba[0] !== 0);
    const yellow = glyphs.filter((q) => q.rgba[2] === 12 / 128);
    // "SEAL" and three zeros: 7 glyphs; their feet on the baseline 142.
    expect(yellow).toHaveLength(4 + 3);
    const name = yellow.filter((q) => q.x < 300);
    expect(Math.min(...name.map((q) => q.x - q.w / 2))).toBeCloseTo(223 - 0.6, 6);
  });

  it('cuts a detail line to 118 wide with a trailing dash', () => {
    const long = cutLine('A VERY LONG GAME NAME INDEED', 0.8, 118);
    expect(long.endsWith('-')).toBe(true);
    expect(textWidth(long, 0.8)).toBeLessThanOrEqual(118);
    expect(cutLine('LAN game', 0.8, 118)).toBe('LAN game');
    expect(DEFAULT_PLAYER).toBe('SEAL');
  });
});

describe('the HUD with the scoreboard up', () => {
  it('hides the ammo box, the compass, the prompts and the timer', () => {
    const hud = new Hud();
    hud.setScoreboard(true);
    expect(hud.state().model.scoreboard).toBe(true);
    // hudLayout itself still lays them out; the pass drops them (SCOREBOARD_HIDES) and adds the board.
    expect(hudLayout(PS2, { ...DEFAULT_MODEL, scoreboard: true }, { 'newweapnbkrnd.tif': { width: 128, height: 64 } }).rects.panel).toBeDefined();
  });

  it('hides the ammo box while scoped, where the zoom readout stands', () => {
    const sizes = { 'newweapnbkrnd.tif': { width: 128, height: 64 }, 'font_text_01.tif': { width: 512, height: 128 } };
    expect(hudLayout(PS2, { ...DEFAULT_MODEL, zoom: 1 }, sizes).rects.panel).toBeDefined();
    const scoped = hudLayout(PS2, { ...DEFAULT_MODEL, zoom: 3 }, sizes).rects;
    expect(scoped.panel).toBeUndefined();
    expect(scoped.rounds).toBeUndefined();
    expect(scoped.zoom).toBeDefined();
  });
});

describe('scoreboardLayout with every player (research 91 §11, §18)', () => {
  const row = (id: number, team: 'seal' | 'terrorist', score: number, over: Partial<ScoreRowInfo> = {}): ScoreRowInfo =>
    ({ id, name: `P${id}`, team, kills: id, deaths: 1, score, alive: true, self: false, ...over });
  /** The text quads (not shadows) of `line` laid at the pen and baseline, as the layout draws them. */
  const drawn = (quads: ReturnType<typeof scoreboardLayout>['quads'], line: string, x: number, y: number, scale = 0.8, centre = false) => {
    const g = layoutText(line, centre ? x - textWidth(line, scale) / 2 : x, y, scale).glyphs;
    const hit = g.map((h) => quads.find((q) => q.texture === 'font_text_01.tif' && q.rgba[0] !== 0
      && Math.abs(q.x - (h.x + h.w / 2)) < 1e-6 && Math.abs(q.y - (h.y + h.h / 2)) < 1e-6 && q.u0 === h.u0));
    return hit.every((q) => q) ? hit as typeof quads : [];   // the whole string, or none
  };
  const base = (team: 0 | 1, i: number): number => SCORE_LAYOUT.teams[team]!.y + 38 + 16.8 * i;
  const rows = [
    row(1, 'seal', 5), row(2, 'seal', 9, { self: true }), row(3, 'seal', 5), row(4, 'seal', 1, { alive: false }), row(5, 'seal', 7),
    row(6, 'terrorist', 2), row(7, 'terrorist', 3), row(8, 'terrorist', 3), row(9, 'terrorist', 0),
  ];

  it('sorts each team by score, ties in the given order, in its own panel', () => {
    const { quads } = scoreboardLayout(PS2, { ...info, rows, spectators: [] }, SIZES);
    ['P2', 'P5', 'P1', 'P3', 'P4'].forEach((n, i) => expect(drawn(quads, n, NAME_X, base(0, i)).length).toBeGreaterThan(0));
    ['P7', 'P8', 'P6', 'P9'].forEach((n, i) => expect(drawn(quads, n, NAME_X, base(1, i)).length).toBeGreaterThan(0));
    expect(drawn(quads, 'P9', NAME_X, base(0, 3))).toHaveLength(0);
    // the row after the last SEAL is empty
    expect(quads.filter((q) => q.texture === 'font_text_01.tif' && q.rgba[0] !== 0 && Math.abs(q.y - base(0, 5)) < 6)).toHaveLength(0);
  });

  it('writes kills, deaths and score on the columns, the local player in yellow', () => {
    const { quads } = scoreboardLayout(PS2, { ...info, rows }, SIZES);
    expect(drawn(quads, 'P2', NAME_X, base(0, 0)).every((q) => q.rgba[2] === 12 / 128 && q.rgba[3] === 110 / 128)).toBe(true);
    expect(drawn(quads, '9', 588 + G, base(0, 0), 0.8, true).length).toBeGreaterThan(0);
    expect(drawn(quads, 'P5', NAME_X, base(0, 1)).every((q) => q.rgba[2] === 115 / 128)).toBe(true);
  });

  it('scales the dead row\'s colours by 0.6', () => {
    const { quads } = scoreboardLayout(PS2, { ...info, rows }, SIZES);
    const dead = drawn(quads, 'P4', NAME_X, base(0, 4));
    expect(dead.length).toBeGreaterThan(0);
    for (const q of dead) {
      expect(q.rgba[0]).toBeCloseTo((115 / 128) * 0.6, 6);
      expect(q.rgba[3]).toBeCloseTo((110 / 128) * 0.6, 6);
    }
  });

  it('cuts a team of 10 to its best 8', () => {
    const many = Array.from({ length: 10 }, (_, i) => row(i + 1, 'terrorist', i));
    const { quads } = scoreboardLayout(PS2, { ...info, rows: many }, SIZES);
    expect(drawn(quads, 'P10', NAME_X, base(1, 0)).length).toBeGreaterThan(0);
    expect(drawn(quads, 'P3', NAME_X, base(1, 7)).length).toBeGreaterThan(0);
    expect(drawn(quads, 'P2', NAME_X, base(1, 8))).toHaveLength(0);
  });

  it('lists the spectators at (24, 270 + 16.8 i), at most 8, and the rounds won on the team lines (OPS-S1: 9 left on a board with rows)', () => {
    const names = Array.from({ length: 10 }, (_, i) => `S${i}`);
    const { quads } = scoreboardLayout(PS2, { ...info, rows, spectators: names, wins: { seal: 2, terrorist: 1 } }, SIZES);
    for (let i = 0; i < 8; i++) expect(drawn(quads, names[i]!, 24 - G, 270 + 16.8 * i).length).toBeGreaterThan(0);
    expect(drawn(quads, 'S8', 24 - G, 270 + 16.8 * 8)).toHaveLength(0);
    expect(drawn(quads, 'SEALs :   2', 171 - G, 124, 1).length).toBeGreaterThan(0);
    expect(drawn(quads, 'TERRORISTS :   1', 171 - G, 287, 1).length).toBeGreaterThan(0);
  });

  it('without rows is today\'s single SEAL row, whatever the spectators', () => {
    const a = scoreboardLayout(PS2, info, SIZES), b = scoreboardLayout(PS2, { ...info, rows: undefined }, SIZES);
    expect(b).toEqual(a);
    const { quads } = scoreboardLayout(PS2, { ...info, wins: { seal: 3, terrorist: 3 } }, SIZES);
    expect(drawn(quads, 'SEALs :   0', 171, 124, 1).length).toBeGreaterThan(0);
  });

  it('Hud.setScoreRows feeds the model; null returns to the single row', () => {
    const hud = new Hud();
    hud.setScoreRows(rows, ['S'], { seal: 1, terrorist: 0 });
    expect(hud.state().model.scoreRows).toEqual({ rows, spectators: ['S'], wins: { seal: 1, terrorist: 0 } });
    hud.setScoreRows(null, []);
    expect(hud.state().model.scoreRows.rows).toBeNull();
  });

  describe("the Modern presentation's lift (owner ruling 2026-09-29)", () => {
    const model = { ...DEFAULT_MODEL, scoreboard: true, name: 'SEAL', game: { name: 'FROSTFIRE', type: 'SUPPRESSION' }, message: 'SEAL falls to their death' };
    const board = (frame: { width: number; height: number }, presentation: 'native' | 'ps2') =>
      hudPass(frame, model, SIZES, AT_REST, false, null, presentation);
    const boardQuads = (frame: { width: number; height: number }, presentation: 'native' | 'ps2') =>
      board(frame, presentation).quads.filter((q) => q.element === 'scoreboard');
    const top = (qs: { y: number; h: number }[]): number => Math.min(...qs.map((q) => q.y - q.h / 2));
    // 16:9, 4:3, the narrowest (a phone held upright), and the PS2 frame itself.
    const frames = [{ width: 1920, height: 1080 }, { width: 1024, height: 768 }, { width: 390, height: 844 }, PS2];

    it('is a modest, positive lift', () => {
      expect(MODERN_SCOREBOARD_LIFT).toBeGreaterThan(0);
      expect(MODERN_SCOREBOARD_LIFT).toBeLessThanOrEqual(SCORE_TOP - 99);
    });

    it("raises the board's top by the lift in Modern and scales it about its top-centre, at every aspect", () => {
      for (const f of frames) {
        const s = f.height / 448, fit = modernScoreboardFit(f, SIZES);
        const modern = board(f, 'native'), ps2 = board(f, 'ps2');
        const m = modern.quads.filter((q) => q.element === 'scoreboard'), p = ps2.quads.filter((q) => q.element === 'scoreboard');
        expect(top(m)).toBeCloseTo((SCORE_TOP - MODERN_SCOREBOARD_LIFT) * s, 6);
        expect(top(p)).toBeCloseTo(SCORE_TOP * s, 6);
        expect(m).toHaveLength(p.length);
        const k = fit.scale, cx = f.width / 2, ty = (SCORE_TOP - MODERN_SCOREBOARD_LIFT) * s;
        m.forEach((q, i) => {
          expect(q.x).toBeCloseTo(cx + (p[i]!.x - cx) * k, 6);
          expect(q.y).toBeCloseTo(ty + (p[i]!.y - SCORE_TOP * s) * k, 6);
          expect(q.w).toBeCloseTo(p[i]!.w * k, 6); expect(q.h).toBeCloseTo(p[i]!.h * k, 6);
        });
        const mt = modern.tris.filter((t) => t.layer === 1), pt = ps2.tris.filter((t) => t.layer === 1);
        mt.forEach((t, i) => t.p.forEach((v, j) => expect(v).toBeCloseTo(j % 2 ? ty + (pt[i]!.p[j]! - SCORE_TOP * s) * k : cx + (pt[i]!.p[j]! - cx) * k, 6)));
      }
    });

    describe('shrinks just enough to clear the bottom HUD (owner ruling 2026-09-29: "a bit smaller")', () => {
      // 16:9, 21:9, 16:10, 4:3, a phone held sideways and upright.
      const aspects = [
        // PAR-48 (research 282 s1): the info box and the number go under the board (D:L56811, D:L56826), so the board clears
        // only the stance word and the ZOOM line (was 0.8957, 1, 0.8911, 0.8911, 0.9602, 0.8911 clearing the info box too).
        { name: '16:9', f: { width: 1920, height: 1080 }, scale: 0.9268 }, { name: '21:9', f: { width: 2560, height: 1080 }, scale: 1 },
        { name: '16:10', f: { width: 1920, height: 1200 }, scale: 0.9187 }, { name: '4:3', f: { width: 1024, height: 768 }, scale: 0.9187 },
        { name: 'phone landscape', f: { width: 812, height: 375 }, scale: 0.9602 }, { name: 'phone portrait', f: { width: 390, height: 844 }, scale: 0.9187 },
      ];
      // Every bottom element the board leaves up, at its widest: the stance word shown, zoomed (PAR-48: the info box hides).
      const busy = { ...model, range: 999, zoom: 10 };
      const rect = (qs: { x: number; y: number; w: number; h: number }[]) => ({
        x0: Math.min(...qs.map((q) => q.x - q.w / 2)), x1: Math.max(...qs.map((q) => q.x + q.w / 2)),
        y0: Math.min(...qs.map((q) => q.y - q.h / 2)), y1: Math.max(...qs.map((q) => q.y + q.h / 2)),
      });

      it('names the margin and the minimum', () => {
        expect(MODERN_SCOREBOARD_MARGIN).toBe(4);
        expect(MODERN_SCOREBOARD_MIN_SCALE).toBe(0.75);
        expect(SCOREBOARD_KEEPS_BOTTOM.every((e) => !SCOREBOARD_HIDES.has(e))).toBe(true);
      });

      for (const a of aspects) {
        it(`${a.name}: scale ${a.scale}, the board's bottom clear of every bottom element it stands over`, () => {
          const s = a.f.height / 448, fit = modernScoreboardFit(a.f, SIZES);
          expect(fit.fits).toBe(true);
          expect(fit.scale).toBeGreaterThanOrEqual(MODERN_SCOREBOARD_MIN_SCALE);
          expect(fit.scale).toBeLessThanOrEqual(1);
          expect(fit.scale).toBeCloseTo(a.scale, 4);
          for (const stance of ['stand', 'crouch', 'prone'] as const) {
            const pass = hudPass(a.f, { ...busy, stance }, SIZES, { fade: 1, stance: 1, pulse: 0 }, false, null, 'native');
            const b = rect(pass.quads.filter((q) => q.element === 'scoreboard'));
            const kept = SCOREBOARD_KEEPS_BOTTOM.filter((e) => pass.quads.some((q) => q.element === e));
            expect(kept.length).toBeGreaterThanOrEqual(2);
            for (const e of kept) {
              const r = rect(pass.quads.filter((q) => q.element === e)), m = MODERN_SCOREBOARD_MARGIN * s - 1e-6;
              const beside = r.x0 - b.x1 >= m || b.x0 - r.x1 >= m;
              if (!beside) expect(r.y0 - b.y1, `${a.name} ${e}`).toBeGreaterThanOrEqual(m);
            }
            // Nothing left up but the kept bottom HUD, the message window, the board, and the scope's mid-screen range line.
            expect([...new Set(pass.quads.map((q) => q.element))].filter((e) =>
              !['scoreboard', 'banner', 'message', 'scopeRange', ...SCOREBOARD_KEEPS_BOTTOM].includes(e))).toEqual([]);
          }
          // The top stays under the message window: the lift's place, whatever the scale.
          const qs = board(a.f, 'native').quads, above = qs.filter((q) => q.element === 'banner' || q.element === 'message');
          expect(top(boardQuads(a.f, 'native'))).toBeCloseTo((SCORE_TOP - MODERN_SCOREBOARD_LIFT) * s, 6);
          expect(top(boardQuads(a.f, 'native'))).toBeGreaterThanOrEqual(Math.max(...above.map((q) => q.y + q.h / 2)) - 1e-9);
          // The text scale: every glyph cell is the PS2 place's times the scale, never under the minimum.
          const glyph = (p: 'native' | 'ps2') => boardQuads(a.f, p).filter((q) => q.texture === 'font_text_01.tif');
          const gm = glyph('native'), gp = glyph('ps2');
          gm.forEach((q, i) => { expect(q.h / gp[i]!.h).toBeCloseTo(fit.scale, 6); expect(q.h / gp[i]!.h).toBeGreaterThanOrEqual(MODERN_SCOREBOARD_MIN_SCALE); });
        });
      }

      it('leaves the message window exactly where it was', () => {
        for (const a of aspects) {
          const pick = (p: 'native' | 'ps2') => board(a.f, p).quads.filter((q) => q.element === 'banner' || q.element === 'message');
          expect(pick('native')).toEqual(pick('ps2'));
          expect(pick('native')).toEqual(hudLayout(a.f, model, SIZES).quads.filter((q) => q.element === 'banner' || q.element === 'message'));
        }
      });

      it('scale 1 is the lift alone, bit for bit', () => {
        for (const a of aspects) expect(scoreboardLayout(a.f, info, SIZES, MODERN_SCOREBOARD_LIFT, 1)).toEqual(scoreboardLayout(a.f, info, SIZES, MODERN_SCOREBOARD_LIFT));
      });

      // OPS-S1 review S1: a board with the room's rows is 1..639 (the satchel's slot, 9 a side), so the fit measures that
      // board when the model has rows (`modernScoreboardFit(f, sizes, true)`). 2576x1120 is aspect 2.3, inside the band
      // (about 2.28..2.35) where the stance word binds the board sideways.
      const roomRows: ScoreRowInfo[] = [
        { id: 1, name: 'SEAL', team: 'seal', kills: 1, deaths: 1, score: 2, alive: true, self: true },
        { id: 2, name: 'Kilo', team: 'terrorist', kills: 1, deaths: 1, score: 1, alive: true, self: false },
      ];
      const withRows = [{ name: '16:9', f: { width: 1920, height: 1080 } }, { name: 'ultrawide 2.3', f: { width: 2576, height: 1120 } }];
      for (const a of withRows) {
        it(`${a.name}: the board WITH rows, at the fit with rows, clears every bottom element by the margin; the rowless fit is larger`, () => {
          const s = a.f.height / 448, fit = modernScoreboardFit(a.f, SIZES, true), old = modernScoreboardFit(a.f, SIZES);
          expect(fit.fits).toBe(true);
          expect(fit.scale).toBeLessThan(old.scale);
          expect(fit.board.x1 - fit.board.x0).toBeCloseTo(638 * s, 6);    // the widened board, 1..639
          for (const stance of ['stand', 'crouch', 'prone'] as const) {
            const pass = hudPass(a.f, { ...busy, stance, scoreRows: { rows: roomRows, spectators: [] } }, SIZES, { fade: 1, stance: 1, pulse: 0 }, false, null, 'native');
            const qs = pass.quads.filter((q) => q.element === 'scoreboard'), b = rect(qs);
            const ps2 = hudPass(a.f, { ...busy, stance, scoreRows: { rows: roomRows, spectators: [] } }, SIZES, { fade: 1, stance: 1, pulse: 0 }, false, null, 'ps2');
            const gm = qs.filter((q) => q.texture === 'font_text_01.tif');
            const gp = ps2.quads.filter((q) => q.element === 'scoreboard' && q.texture === 'font_text_01.tif');
            gm.forEach((q, i) => expect(q.h / gp[i]!.h).toBeCloseTo(fit.scale, 6));   // drawn at the fit with rows
            const kept = SCOREBOARD_KEEPS_BOTTOM.filter((e) => pass.quads.some((q) => q.element === e));
            expect(kept.length).toBeGreaterThanOrEqual(2);
            for (const e of kept) {
              const r = rect(pass.quads.filter((q) => q.element === e)), m = MODERN_SCOREBOARD_MARGIN * s - 1e-6;
              const beside = r.x0 - b.x1 >= m || b.x0 - r.x1 >= m;
              if (!beside) expect(r.y0 - b.y1, `${a.name} ${stance} ${e}`).toBeGreaterThanOrEqual(m);
            }
          }
        });
      }

      it("16:9: the fit with rows is the ZOOM line's height term, 0.9187 (16:10's and 4:3's pinned scale)", () => {
        expect(modernScoreboardFit({ width: 1920, height: 1080 }, SIZES, true).scale).toBeCloseTo(0.9187, 4);
      });

      it('the rowless fit (no flag, or false) is unchanged at every pinned frame: the single-SEAL board keeps its scales', () => {
        for (const a of aspects) {
          expect(modernScoreboardFit(a.f, SIZES).scale, a.name).toBeCloseTo(a.scale, 4);
          expect(modernScoreboardFit(a.f, SIZES, false), a.name).toEqual(modernScoreboardFit(a.f, SIZES));
        }
      });
    });

    it('stays clear of the message window above it at every aspect', () => {
      for (const f of frames) {
        const all = board(f, 'native').quads;
        const above = all.filter((q) => q.element === 'banner' || q.element === 'message');
        expect(above.length).toBeGreaterThan(0);
        const bottom = Math.max(...above.map((q) => q.y + q.h / 2));
        expect(top(boardQuads(f, 'native'))).toBeGreaterThanOrEqual(bottom - 1e-9);
      }
    });

    it("leaves the PS2 presentation pixel-identical to the game's place", () => {
      for (const f of frames) {
        const direct = scoreboardLayout(f, { player: 'SEAL', game: 'FROSTFIRE', type: 'SUPPRESSION' }, SIZES);
        const ps2 = board(f, 'ps2');
        expect(ps2.quads.filter((q) => q.element === 'scoreboard')).toEqual(direct.quads);
        expect(ps2.tris).toEqual(direct.tris);
      }
      // The default is the PS2 place: lift 0.
      expect(scoreboardLayout(PS2, info, SIZES, 0)).toEqual(scoreboardLayout(PS2, info, SIZES));
      // A digest of the PS2 board's quads and shapes, pinned (every place and size summed): any move shows here.
      const pinned = scoreboardLayout(PS2, info, SIZES), sum = (ns: number[]): number => Math.round(ns.reduce((t, n) => t + n, 0) * 1000) / 1000;
      expect({ quads: pinned.quads.length, x: sum(pinned.quads.map((q) => q.x)), y: sum(pinned.quads.map((q) => q.y)),
        w: sum(pinned.quads.map((q) => q.w)), h: sum(pinned.quads.map((q) => q.h)), tris: sum(pinned.tris.flatMap((t) => t.p)) }).toMatchInlineSnapshot(`
          {
            "h": 5968,
            "quads": 229,
            "tris": 7074,
            "w": 7494.2,
            "x": 57616.5,
            "y": 44094.4,
          }
        `);
    });
  });
});

/**
 * WM-DATA, the scoreboard's look (product track, a browser adaptation; the owner's call 1, decided 2026-11-15 through the
 * main controller 8f: order A, ASSISTS its own column, the ping as three signal bars at the row's far left lined up
 * with the team heading's text, its number on hover). The original's board has neither (research 155 §3); NCW-7's PING
 * column (the owner's word 2026-11-05) gives its slot to KILLS. The single-SEAL board stays the original's.
 */
describe('WM-DATA: order A, the assists column, the ping bars (a browser adaptation)', () => {
  const row = (id: number, team: 'seal' | 'terrorist', score: number, over: Partial<ScoreRowInfo> = {}): ScoreRowInfo =>
    ({ id, name: `P${id}`, team, kills: id, deaths: 1, score, alive: true, self: false, ...over });
  type Quads = ReturnType<typeof scoreboardLayout>['quads'];
  const drawn = (quads: Quads, line: string, x: number, y: number, scale = 0.8, centre = false) => {
    const g = layoutText(line, centre ? x - textWidth(line, scale) / 2 : x, y, scale).glyphs;
    const hit = g.map((h) => quads.find((q) => q.texture === 'font_text_01.tif' && q.rgba[0] !== 0
      && Math.abs(q.x - (h.x + h.w / 2)) < 1e-6 && Math.abs(q.y - (h.y + h.h / 2)) < 1e-6 && q.u0 === h.u0));
    return hit.every((q) => q) ? hit as Quads : [];
  };
  const base = (team: 0 | 1, i: number): number => SCORE_LAYOUT.teams[team]!.y + 38 + 16.8 * i;
  const edges = (q: { x: number; y: number; w: number; h: number }) => [q.x - q.w / 2, q.y - q.h / 2, q.x + q.w / 2, q.y + q.h / 2];
  /** The bars of the row on `baseline`: the white quads standing on it, left to right. */
  const barsOn = (quads: Quads, baseline: number) => quads.filter((q) => q.texture === 'white' && Math.abs(q.y + q.h / 2 - baseline) < 1e-6)
    .sort((a, b) => a.x - b.x);

  it('order A: KILLS, DEATHS, ASSISTS, SCORE centred on 388.5 / 455 / 522 / 588 (drawn 9 right, OPS-S1) on both teams; no PING header', () => {
    expect(SCORE_COLUMNS_ADAPTATION.map((c) => [c.key, c.text, c.x])).toEqual([
      ['kills', 'KILLS', 388.5], ['deaths', 'DEATHS', 455], ['assists', 'ASSISTS', 522], ['score', 'SCORE', 588],
    ]);
    // The four slots one pitch (66.5) apart, the original's three where the game puts them.
    expect(SCORE_LAYOUT.columns.map((c) => c.x)).toEqual([455, 522, 588]);
    const { quads } = scoreboardLayout(PS2, { ...info, rows: [row(1, 'seal', 0)] }, SIZES);
    for (const t of [0, 1] as const) {
      const y = SCORE_LAYOUT.teams[t]!.y + 20;
      const kills = drawn(quads, 'KILLS', 388.5 + G, y, 1, true);
      expect(kills.length).toBe(5);
      for (const [text, x] of [['DEATHS', 455], ['ASSISTS', 522], ['SCORE', 588]] as const) {
        const h = drawn(quads, text, x + G, y, 1, true);
        expect(h.length, text).toBe(text.length);
        for (const q of h) expect(q.rgba).toEqual(kills[0]!.rgba);
      }
      expect(drawn(quads, 'PING', 388.5 + G, y, 1, true)).toHaveLength(0);
      expect(drawn(quads, 'KILLS', 455 + G, y, 1, true)).toHaveLength(0);
    }
  });

  it("a row's figures in order A, its assists from the room's `assists` (protocol 17); the local player's in yellow", () => {
    const rows = [row(2, 'seal', 30, { kills: 3, assists: 2, deaths: 1, self: true }), row(3, 'seal', 10, { kills: 7, assists: 0, deaths: 4 })];
    const { quads } = scoreboardLayout(PS2, { ...info, rows }, SIZES);
    for (const [text, x] of [['3', 388.5 + G], ['1', 455 + G], ['2', 522 + G], ['30', 588 + G]] as const) {
      const cell = drawn(quads, text, x, base(0, 0), 0.8, true);
      expect(cell.length, `${text} at ${x}`).toBe(text.length);
      for (const q of cell) expect(q.rgba).toEqual([115 / 128, 115 / 128, 12 / 128, 110 / 128]);
    }
    // A live record's zero is a zero.
    expect(drawn(quads, '0', 522 + G, base(0, 1), 0.8, true).length).toBe(1);
    expect(drawn(quads, '7', 388.5 + G, base(0, 1), 0.8, true).length).toBe(1);
  });

  it('a row with no `assists` (a room with no live match record: the Forge, the test room) draws a dash, never 0', () => {
    expect(ASSISTS_NONE).toBe('-');
    expect(scoreCell({ kills: 1, deaths: 2, score: 3 }, 'assists')).toBe('-');
    expect(scoreCell({ kills: 1, deaths: 2, score: 3, assists: 0 }, 'assists')).toBe('0');
    const { quads } = scoreboardLayout(PS2, { ...info, rows: [row(1, 'seal', 5), row(2, 'terrorist', 1, { alive: false })] }, SIZES);
    expect(drawn(quads, '-', 522 + G, base(0, 0), 0.8, true).length).toBe(1);
    expect(drawn(quads, '-', 522 + G, base(1, 0), 0.8, true).length).toBe(1);
    expect(drawn(quads, '0', 522 + G, base(0, 0), 0.8, true)).toHaveLength(0);
    expect(drawn(quads, '0', 522 + G, base(1, 0), 0.8, true)).toHaveLength(0);
  });

  it("the single-SEAL board with no room's rows stays the original's: KILLS, DEATH, SCORE on 455 / 522 / 588, no ASSISTS, no bars", () => {
    const { quads } = scoreboardLayout(PS2, info, SIZES);
    expect(drawn(quads, 'KILLS', 455, SCORE_TOP + 20, 1, true).length).toBe(5);
    expect(drawn(quads, 'ASSISTS', 455, SCORE_TOP + 20, 1, true)).toHaveLength(0);
    expect(drawn(quads, 'PING', 388.5, SCORE_TOP + 20, 1, true)).toHaveLength(0);
    expect(quads.some((q) => q.texture === 'white')).toBe(false);
  });

  it('three bars lit by the ping: at most 80 ms three green, at most 150 two yellow, above one red; a bot or no reading none', () => {
    expect(PING_BAR_THRESHOLDS_ADAPTATION).toEqual({ green: 80, yellow: 150 });
    const B = PING_BARS_ADAPTATION;
    expect([pingBars({ ping: 40 }), pingBars({ ping: 80 })]).toEqual([{ lit: 3, rgb: B.rgb.green }, { lit: 3, rgb: B.rgb.green }]);
    expect([pingBars({ ping: 81 }), pingBars({ ping: 150 })]).toEqual([{ lit: 2, rgb: B.rgb.yellow }, { lit: 2, rgb: B.rgb.yellow }]);
    expect(pingBars({ ping: 151 })).toEqual({ lit: 1, rgb: B.rgb.red });
    for (const r of [{}, { ping: 0 }, { ping: 40, bot: true as const }]) expect(pingBars(r).lit).toBe(0);
  });

  it("capture 1F's place, OPS-S1 widened: the bars on the team heading's first glyph (161.4..172.4), the tag 4 after (176.4), the name after the satchel's slot (241.4), the hover number ending 2 left of the bars (159.4)", () => {
    const L = SCORE_LAYOUT, first = (t: string) => layoutText(t, L.title.x - G, 0, L.title.scale).glyphs[0]!.x;
    expect(first('SEALs :   2')).toBeCloseTo(161.4, 6);
    expect(first('TERRORISTS :   1')).toBe(first('SEALs :   2'));
    expect([PING_TAG_GAP_ADAPTATION, PING_NAME_GAP_ADAPTATION, PING_HOVER_GAP_ADAPTATION]).toEqual([4, 2, 2]);
    const P = pingBarsPlace();
    expect(P.x0).toBe(first('SEALs :   2'));
    [[P.x1, 172.4], [P.tagX, 176.4], [P.nameX, 241.4], [P.hoverEnd, 159.4]].forEach(([v, want]) => expect(v).toBeCloseTo(want!, 6));
    expect(P.nameX).toBeCloseTo(P.tagX + textWidth(`[${CLAN_TAG_WIDEST}]`, 0.8) + 2 + 16 + 2, 9);
    const rows = [row(1, 'seal', 5, { ping: 40 }), row(2, 'seal', 3, { ping: 120 }), row(3, 'terrorist', 1, { ping: 400 }), row(4, 'terrorist', 0)];
    const { quads } = scoreboardLayout(PS2, { ...info, rows }, SIZES);
    const lit = (c: readonly number[]) => [c[0]! / 128, c[1]! / 128, c[2]! / 128, 110 / 128];
    const unlit = [115 / 128, 115 / 128, 115 / 128, (110 / 128) * PING_BARS_ADAPTATION.dim];
    const cases: [0 | 1, number, (number[])[]][] = [
      [0, 0, [lit([64, 128, 64]), lit([64, 128, 64]), lit([64, 128, 64])]],
      [0, 1, [lit([128, 128, 64]), lit([128, 128, 64]), unlit]],
      [1, 0, [lit([128, 64, 64]), unlit, unlit]],
      [1, 1, [unlit, unlit, unlit]],
    ];
    for (const [t, i, inks] of cases) {
      const bars = barsOn(quads, base(t, i));
      const want = [4, 7, 10].map((h, b) => [P.x0 + 4 * b, base(t, i) - h, P.x0 + 3 + 4 * b, base(t, i)]);
      bars.map(edges).forEach((e, b) => e.forEach((v, k) => expect(v).toBeCloseTo(want[b]![k]!, 6)));
      bars.forEach((q, b) => q.rgba.forEach((c, k) => expect(c).toBeCloseTo(inks[b]![k]!, 9)));
    }
    // The team heading's text starts where the bars do.
    const heading = drawn(quads, 'SEALs :   0', SCORE_LAYOUT.title.x - G, SCORE_TOP + 20, 1);
    expect(heading.length).toBeGreaterThan(0);
  });

  it("a dead row's bars dim with it (DEAD_DIM on colour and alpha)", () => {
    const { quads } = scoreboardLayout(PS2, { ...info, rows: [row(1, 'seal', 1, { alive: false, ping: 40 })] }, SIZES);
    for (const q of barsOn(quads, base(0, 0))) {
      expect(q.rgba[1]).toBeCloseTo(1 * DEAD_DIM, 9);
      expect(q.rgba[3]).toBeCloseTo((110 / 128) * DEAD_DIM, 9);
    }
  });

  it('the clan tag follows the bars (176.4), the name after the widest typeable tag and the satchel slot (241.4)', () => {
    const P = pingBarsPlace();
    const { quads } = scoreboardLayout(PS2, { ...info, rows: [row(1, 'seal', 1, { clan: 'NSW', ping: 40 })] }, SIZES);
    expect(drawn(quads, '[NSW]', P.tagX, base(0, 0)).length).toBe(5);
    expect(drawn(quads, '[NSW]', SCORE_LAYOUT.rows.clanX, base(0, 0))).toHaveLength(0);
    expect(drawn(quads, 'P1', P.nameX, base(0, 0)).length).toBe(2);
    expect(drawn(quads, 'P1', SCORE_LAYOUT.rows.nameX, base(0, 0))).toHaveLength(0);
  });

  it('a clan tag is at most 3 typeable characters (MaxChars 3, research 272 s6); the widest, "[&&&]", is 45 at 0.8 -- "&" the widest printable glyph', () => {
    expect(CLAN_TAG_TYPEABLE_CHARS).toBe(3);
    expect(CLAN_TAG_WIDEST).toBe('&&&');
    const widths = Array.from({ length: 95 }, (_, i) => textWidth(String.fromCharCode(32 + i), 1));
    expect(Math.max(...widths)).toBe(textWidth('&', 1));
    expect(textWidth('[&&&]', 0.8)).toBe(45);
  });

  it('the stress case: "[&&&]" with a 14-letter W name -- the tag ends 2 before the satchel slot, the name whole and clear of the first figure column', () => {
    const P = pingBarsPlace(), name = 'W'.repeat(14);
    expect(P.tagX + textWidth('[&&&]', 0.8)).toBeCloseTo(P.satchelX0 - 2, 9);
    expect(rowNameWidth()).toBeGreaterThanOrEqual(textWidth(name, 0.8));
    const firstFigure = 388.5 + G - textWidth('-100', 0.8) / 2;          // KILLS' widest typical figure's left edge
    expect(P.nameX + textWidth(name, 0.8)).toBeLessThan(firstFigure);
    const { quads } = scoreboardLayout(PS2, { ...info, rows: [row(1, 'seal', 1, { name, clan: '&&&', kills: -100, ping: 40 })] }, SIZES);
    expect(drawn(quads, name, P.nameX, base(0, 0)).length).toBe(14);
    expect(drawn(quads, '[&&&]', P.tagX, base(0, 0)).length).toBe(5);
    expect(drawn(quads, '-100', 388.5 + G, base(0, 0), 0.8, true).length).toBe(4);
  });

  /** The pen of `n` right-aligned to end at the hover's end (2 left of the bars). */
  const tip = (n: string): number => pingBarsPlace().hoverEnd - textWidth(n, 0.8);

  it("no number without a hover -- the own row's too (PING_OWN_ROW_ALWAYS_ADAPTATION); the hovered row's ends 2 left of its bars, in its colour", () => {
    expect(PING_OWN_ROW_ALWAYS_ADAPTATION).toBe(false);
    const rows = [row(1, 'seal', 5, { ping: 87.4, self: true }), row(2, 'seal', 3, { ping: 120 }), row(3, 'seal', 1, { bot: true, ping: 0 })];
    const plain = scoreboardLayout(PS2, { ...info, rows }, SIZES).quads;
    for (const [n, i] of [['87', 0], ['120', 1], ['--', 2]] as const) expect(drawn(plain, n, tip(n), base(0, i))).toHaveLength(0);
    const own = drawn(scoreboardLayout(PS2, { ...info, rows, hoverRow: 1 }, SIZES).quads, '87', tip('87'), base(0, 0));
    expect(own.length).toBe(2);
    for (const q of own) expect(q.rgba).toEqual([115 / 128, 115 / 128, 12 / 128, 110 / 128]);
    const hovered = scoreboardLayout(PS2, { ...info, rows, hoverRow: 2 }, SIZES).quads;
    expect(drawn(hovered, '120', tip('120'), base(0, 1)).length).toBe(3);
    expect(drawn(hovered, '87', tip('87'), base(0, 0))).toHaveLength(0);
    // A bot (no reading) shows nothing on hover.
    const bot = scoreboardLayout(PS2, { ...info, rows, hoverRow: 3 }, SIZES).quads;
    expect(bot).toEqual(plain);
  });

  it('the hovered number is a small tag: on a dark backing in the panel\'s own style (its bitmap\'s centre texel at its alpha), within its own row\'s band, ending at the bars', () => {
    const H = PING_HOVER_BACKING_ADAPTATION, P = pingBarsPlace();
    expect(H).toEqual({ pad: 2, up: 12, down: 4, alpha: SCORE_LAYOUT.panel.alpha });
    const rows = [row(1, 'seal', 5, { ping: 87 }), row(2, 'seal', 3, { ping: 120 }), row(3, 'seal', 1, { ping: 40 })];
    const plain = scoreboardLayout(PS2, { ...info, rows }, SIZES).quads;
    const hovered = scoreboardLayout(PS2, { ...info, rows, hoverRow: 2 }, SIZES).quads;
    // One backing quad and the number's glyphs (shadow and text) more; nothing else moves.
    expect(hovered.length - plain.length).toBe(1 + 2 * 3);
    for (const q of plain) expect(hovered).toContainEqual(q);
    const extra = hovered.filter((q) => !plain.some((p) => JSON.stringify(p) === JSON.stringify(q)));
    const back = extra.filter((q) => q.texture === 'newweapnbkrnd.tif');
    expect(back).toHaveLength(1);
    const e = edges(back[0]!);
    [e[0], e[1], e[2], e[3]].forEach((v, k) => expect(v).toBeCloseTo([P.hoverEnd - textWidth('120', 0.8) - 2, base(0, 1) - 12, P.x0, base(0, 1) + 4][k]!, 6));
    expect(back[0]!.rgba).toEqual([1, 1, 1, 100 / 128]);
    expect(back[0]!.u1 - back[0]!.u0).toBeLessThan(0.1);                 // one texel: the panel's centre, as the stripes
    // Inside its own row's band: clear of the rows above and below and their bars (baseline - 10 .. baseline).
    expect(e[1]).toBeGreaterThan(base(0, 0) + 0);
    expect(e[3]).toBeLessThan(base(0, 2) - 10);
    // Drawn under its number: the backing first, then the glyphs.
    const at = (q: (typeof hovered)[number]) => hovered.indexOf(q);
    for (const g of extra.filter((q) => q.texture === 'font_text_01.tif')) expect(at(g)).toBeGreaterThan(at(back[0]!));
    // It may run past the row's left edge (152 on a board with rows, OPS-S1) over the border, for a wide number.
    const wide = scoreboardLayout(PS2, { ...info, rows: [row(1, 'seal', 1, { ping: 999 })], hoverRow: 1 }, SIZES).quads;
    expect(drawn(wide, '999', tip('999'), base(0, 0)).length).toBe(3);
  });

  it('scoreboardRowAt: the row under the mouse by its stripe band, at the PS2 place and the Modern lift and scale', () => {
    const rows = [row(1, 'seal', 5), row(2, 'seal', 3), row(3, 'terrorist', 1)];
    expect(scoreboardRowAt(PS2, { rows }, 300, base(0, 0) - 4)).toBe(1);
    expect(scoreboardRowAt(PS2, { rows }, 170, base(0, 1) + 3)).toBe(2);
    expect(scoreboardRowAt(PS2, { rows }, 600, base(1, 0) - 11)).toBe(3);
    expect(scoreboardRowAt(PS2, { rows }, 300, base(0, 2) - 4)).toBeNull();     // no third SEAL
    expect(scoreboardRowAt(PS2, { rows }, 100, base(0, 0) - 4)).toBeNull();     // the left column
    expect(scoreboardRowAt(PS2, { rows }, 300, SCORE_TOP + 10)).toBeNull();     // the header bar
    expect(scoreboardRowAt(PS2, {}, 300, base(0, 0) - 4)).toBeNull();
    const f = { width: 1920, height: 1080 }, s = f.height / 448, k = modernScoreboardFit(f, SIZES, true).scale;
    const at = (bx: number, by: number) => [f.width / 2 + (bx - 320) * k * s, ((SCORE_TOP - MODERN_SCOREBOARD_LIFT) + (by - SCORE_TOP) * k) * s] as const;
    expect(scoreboardRowAt(f, { rows }, ...at(300, base(0, 1) - 4), MODERN_SCOREBOARD_LIFT, k)).toBe(2);
    expect(scoreboardRowAt(f, { rows }, ...at(300, base(1, 0) - 4), MODERN_SCOREBOARD_LIFT, k)).toBe(3);
  });

  it("cuts a name to end 4 before the KILLS column's widest figure (\"999\"), with the board's cutLine; a short name is whole", () => {
    const half = textWidth('999', 0.8) / 2;
    expect(rowNameWidth()).toBeCloseTo(388.5 + G - half - 4 - NAME_X, 9);
    const wide = 'WWWWWWWWWWWWWWWW';
    const cut = cutLine(wide, 0.8, rowNameWidth());
    expect(cut.endsWith('-')).toBe(true);
    const { quads } = scoreboardLayout(PS2, { ...info, rows: [row(1, 'seal', 2, { name: wide }), row(2, 'seal', 1, { name: 'Kilo' })] }, SIZES);
    const name = drawn(quads, cut, NAME_X, base(0, 0));
    expect(name.length).toBe(cut.length);
    expect(Math.max(...name.map((q) => q.x + q.w / 2))).toBeLessThan(388.5 + G - half);
    expect(drawn(quads, 'Kilo', NAME_X, base(0, 1)).length).toBe(4);
  });

  it('the Modern presentation scales the bars with the board (modernScoreboardFit), no new art', () => {
    const rows = [row(1, 'seal', 5, { ping: 87 }), row(2, 'terrorist', 1, { alive: false, ping: 0 })];
    for (const f of [{ width: 1920, height: 1080 }, { width: 1024, height: 768 }]) {
      const s = f.height / 448, k = modernScoreboardFit(f, SIZES, true).scale, cx = f.width / 2, ty = (SCORE_TOP - MODERN_SCOREBOARD_LIFT) * s;
      const p = scoreboardLayout(f, { ...info, rows }, SIZES), m = scoreboardLayout(f, { ...info, rows }, SIZES, MODERN_SCOREBOARD_LIFT, k);
      expect(m.quads).toHaveLength(p.quads.length);
      expect(m.quads.filter((q) => q.texture === 'white')).toHaveLength(6);
      m.quads.forEach((q, i) => {
        expect(q.x).toBeCloseTo(cx + (p.quads[i]!.x - cx) * k, 6);
        expect(q.y).toBeCloseTo(ty + (p.quads[i]!.y - SCORE_TOP * s) * k, 6);
      });
    }
  });
});
/**
 * BOMB-MARKS (the owner, seat b6, 2026-11-06: "qol feature in the scoreboard add a bomb next to the player who has it";
 * research 87 s12's satchel row, research 214 s3 "The scoreboard's satchel"; reading, pending review): `FUN_0022a290`
 * (D:L78976) tests each row's player for item 0x9a (`FUN_005c8640`, D:L79026) and places `hud_satchel.tif` (sprite
 * 0x40dbf0, D:L80001-80003) at x 200..216, baseline - 12 .. + 4 (D:L79028-79029: `DAT_003dc960` 200, `DAT_003dc968` 16,
 * `DAT_003dc970` 12 off the ELF), drawn last (D:L79156), at the sprite's own colour (`FUN_00364c50` D:L262041-262047).
 * The original shows it to every viewer (`FUN_00229d00` draws both blocks, D:L80018-80019; `FUN_0022a290` tests nothing of
 * the viewer, D:L79026); OT.R109 as amended 2026-11-06 (the owner's players: "Both teams") keeps it so.
 */
describe("the satchel on the bomb carrier's row (BOMB-MARKS; OT.R109 as amended)", () => {
  const SAT = { ...SIZES, 'hud_satchel.tif': { width: 32, height: 32 } };
  const row = (id: number, team: 'seal' | 'terrorist', score: number, over: Partial<ScoreRowInfo> = {}): ScoreRowInfo =>
    ({ id, name: `P${id}`, team, kills: id, deaths: 1, score, alive: true, self: false, ...over });
  const base = (team: 0 | 1, i: number): number => SCORE_LAYOUT.teams[team]!.y + 38 + 16.8 * i;
  const edges = (q: { x: number; y: number; w: number; h: number }) => [q.x - q.w / 2, q.y - q.h / 2, q.x + q.w / 2, q.y + q.h / 2];
  const satchels = (quads: ReturnType<typeof scoreboardLayout>['quads']) => quads.filter((q) => q.texture === 'hud_satchel.tif');
  // The viewer (2) a SEAL; SEAL 4 second by score; Terrorist 3.
  const rows = [row(2, 'seal', 9, { self: true }), row(4, 'seal', 5), row(3, 'terrorist', 1)];

  it('draws hud_satchel.tif on the carrier\'s row in its slot (OPS-S1: the original\'s x 200..216 moved past the tag), baseline - 12 .. + 4, last, at its own colour, scaled with the board', () => {
    expect(SCOREBOARD_SATCHEL_RECT).toEqual({ x0: 200, x1: 216, up: 12, down: 4 });
    const P = pingBarsPlace();
    expect(SCOREBOARD_SATCHEL_RGBA_READING).toEqual([1, 1, 1, 1]);
    const { quads } = scoreboardLayout(PS2, { ...info, rows, spectators: ['S1'], bombCarrier: 4 }, SAT);
    const [s] = satchels(quads);
    expect(satchels(quads)).toHaveLength(1);
    edges(s!).forEach((v, k) => expect(v).toBeCloseTo([P.satchelX0, base(0, 1) - 12, P.satchelX1, base(0, 1) + 4][k]!, 9));
    expect(s).toMatchObject({ u0: 0, v0: 0, u1: 32, v1: 32, rgba: [1, 1, 1, 1], layer: 1, element: 'scoreboard' });
    expect(quads.at(-1)).toBe(s);                                             // the satchel last (D:L79156)
    // The frame's scale: 1920x1080 draws it at 1080 / 448 the size, about the frame's centre.
    const big = satchels(scoreboardLayout({ width: 1920, height: 1080 }, { ...info, rows, bombCarrier: 4 }, SAT).quads)[0]!;
    expect(big.w).toBeCloseTo(16 * 1080 / 448, 6);
  });

  it("OT.R109 as amended: drawn for both teams' viewers and a spectator alike, always on the carrier's row only", () => {
    const at = (rs: ScoreRowInfo[], carrier: number) => satchels(scoreboardLayout(PS2, { ...info, rows: rs, bombCarrier: carrier }, SAT).quads).map((q) => q.y);
    const asViewer = (id: number | null) => rows.map((r) => ({ ...r, self: r.id === id }));
    // A SEAL (4) carries: his row, second of the SEALs, for a SEAL viewer (2), a Terrorist viewer (3) and a spectator.
    for (const v of [2, 3, null]) expect(at(asViewer(v), 4), `viewer ${v}`).toEqual([base(0, 1) - 4]);
    // A Terrorist (3) carries: his row, first of the Terrorists, for the same three.
    for (const v of [2, 3, null]) expect(at(asViewer(v), 3), `viewer ${v}`).toEqual([base(1, 0) - 4]);
    // The viewer himself carries: on his own row, the one satchel.
    expect(at(asViewer(2), 2)).toEqual([base(0, 0) - 4]);
  });

  it('none with no carrier, a carrier off the board (past the 8 a team shows) or the single-SEAL board; none without the bitmap', () => {
    expect(satchels(scoreboardLayout(PS2, { ...info, rows }, SAT).quads)).toHaveLength(0);
    expect(satchels(scoreboardLayout(PS2, { ...info, rows, bombCarrier: null }, SAT).quads)).toHaveLength(0);
    const ten = [row(1, 'seal', 100, { self: true }), ...Array.from({ length: 9 }, (_, i) => row(10 + i, 'seal', 50 - i))];
    expect(satchels(scoreboardLayout(PS2, { ...info, rows: ten, bombCarrier: 18 }, SAT).quads)).toHaveLength(0);
    expect(satchels(scoreboardLayout(PS2, { ...info, bombCarrier: 4 }, SAT).quads)).toHaveLength(0);
    expect(satchels(scoreboardLayout(PS2, { ...info, rows, bombCarrier: 4 }, SIZES).quads)).toHaveLength(0);
  });

  it('Hud.setBombCarrier feeds the board drawn under SELECT', () => {
    const hud = new Hud();
    hud.setBombCarrier(4);
    expect(hud.state().model.bombCarrier).toBe(4);
    const model = { ...DEFAULT_MODEL, scoreboard: true, scoreRows: { rows, spectators: [] }, bombCarrier: 4 };
    expect(hudPass(PS2, model, SAT, AT_REST, false, null, 'ps2').quads.filter((q) => q.texture === 'hud_satchel.tif')).toHaveLength(1);
    hud.setBombCarrier(null);
    expect(hud.state().model.bombCarrier).toBeNull();
  });
});

/**
 * OPS-S1 (a BROWSER ADAPTATION, `SCOREBOARD_SATCHEL_SLOT_ADAPTATION`; the owner, 2026-11-15: "lets just go back to the
 * same design and increase the width of the scoreboard a bit i think giving the space to the area that needs it and
 * keeping the rest of the design"): on a board with the room's rows the ping bars moved the tag's pen over the original's
 * satchel place (x 200..216), so the satchel takes its own 16-wide slot between the widest typeable tag and the name, 2
 * clear each side, and the board grows by the slot -- half to each side. The single-SEAL board stays the original's.
 */
describe('OPS-S1: the satchel in its own slot on a wider board with rows (a browser adaptation)', () => {
  const SAT = { ...SIZES, 'hud_satchel.tif': { width: 32, height: 32 } };
  type Quads = ReturnType<typeof scoreboardLayout>['quads'];
  const row = (id: number, team: 'seal' | 'terrorist', score: number, over: Partial<ScoreRowInfo> = {}): ScoreRowInfo =>
    ({ id, name: `P${id}`, team, kills: id, deaths: 1, score, alive: true, self: false, ...over });
  const base = (team: 0 | 1, i: number): number => SCORE_LAYOUT.teams[team]!.y + 38 + 16.8 * i;
  const edges = (q: { x: number; y: number; w: number; h: number }) => [q.x - q.w / 2, q.y - q.h / 2, q.x + q.w / 2, q.y + q.h / 2];
  const drawn = (quads: Quads, line: string, x: number, y: number, scale = 0.8, centre = false) => {
    const g = layoutText(line, centre ? x - textWidth(line, scale) / 2 : x, y, scale).glyphs;
    const hit = g.map((h) => quads.find((q) => q.texture === 'font_text_01.tif' && q.rgba[0] !== 0
      && Math.abs(q.x - (h.x + h.w / 2)) < 1e-6 && Math.abs(q.y - (h.y + h.h / 2)) < 1e-6 && q.u0 === h.u0));
    return hit.every((q) => q) ? hit as Quads : [];
  };
  const span = (qs: Quads) => [Math.min(...qs.map((q) => q.x - q.w / 2)), Math.max(...qs.map((q) => q.x + q.w / 2))] as const;
  const W14 = 'W'.repeat(14);
  // The carrier (2) with the widest typeable tag, a 14-letter W name and a ping; a second SEAL; a Terrorist.
  const rows = [row(2, 'seal', 9, { clan: CLAN_TAG_WIDEST, name: W14, ping: 40 }), row(4, 'seal', 5, { ping: 120 }), row(3, 'terrorist', 1)];

  it("the satchel overlaps neither the widest tag's glyphs, nor the name's, nor the bars (the defect: it lay inside the tag)", () => {
    const P = pingBarsPlace();
    const { quads } = scoreboardLayout(PS2, { ...info, rows, bombCarrier: 2 }, SAT);
    const sat = quads.filter((q) => q.texture === 'hud_satchel.tif');
    expect(sat).toHaveLength(1);
    const [sx0, , sx1] = edges(sat[0]!);
    const tag = drawn(quads, `[${CLAN_TAG_WIDEST}]`, P.tagX, base(0, 0)), name = drawn(quads, W14, P.nameX, base(0, 0));
    expect(tag).toHaveLength(5);
    expect(name).toHaveLength(14);
    const bars = quads.filter((q) => q.texture === 'white' && Math.abs(q.y + q.h / 2 - base(0, 0)) < 1e-6);
    expect(bars).toHaveLength(3);
    expect(sx0!).toBeGreaterThan(span(tag)[1]);
    expect(sx1!).toBeLessThan(span(name)[0]);
    expect(sx0!).toBeGreaterThan(span(bars)[1]);
  });

  it("the satchel is 16 wide, baseline - 12 .. + 4, 2 after the widest tag's end and 2 before the name's pen (223.4..239.4 at 640x448)", () => {
    const P = pingBarsPlace(), S = SCOREBOARD_SATCHEL_SLOT_ADAPTATION;
    expect(S).toEqual({ w: 16, gap: 2 });
    expect(P.satchelX0).toBeCloseTo(P.tagX + textWidth(`[${CLAN_TAG_WIDEST}]`, 0.8) + S.gap, 9);
    expect(P.satchelX1 - P.satchelX0).toBeCloseTo(S.w, 9);
    expect(P.nameX).toBeCloseTo(P.satchelX1 + S.gap, 9);
    const { quads } = scoreboardLayout(PS2, { ...info, rows, bombCarrier: 4 }, SAT);
    const [s] = quads.filter((q) => q.texture === 'hud_satchel.tif');
    edges(s!).forEach((v, k) => expect(v).toBeCloseTo([P.satchelX0, base(0, 1) - 12, P.satchelX1, base(0, 1) + 4][k]!, 6));
    edges(s!).forEach((v, k) => expect(v).toBeCloseTo([223.4, base(0, 1) - 12, 239.4, base(0, 1) + 4][k]!, 6));
    expect(s).toMatchObject({ u0: 0, v0: 0, u1: 32, v1: 32, rgba: [...SCOREBOARD_SATCHEL_RGBA_READING] });
    expect(quads.at(-1)).toBe(s);                                             // still last
    expect(SCOREBOARD_SATCHEL_RECT).toEqual({ x0: 200, x1: 216, up: 12, down: 4 });   // the original's record, kept
  });

  it("the name's lane is unchanged (141.6) and a 14-letter W name is whole", () => {
    expect(rowNameWidth()).toBeCloseTo(141.6, 6);
    expect(rowNameWidth()).toBeGreaterThanOrEqual(textWidth(W14, 0.8));
    const { quads } = scoreboardLayout(PS2, { ...info, rows }, SAT);
    expect(drawn(quads, W14, pingBarsPlace().nameX, base(0, 0))).toHaveLength(14);
  });

  it('the four columns keep their pitch, each 9 right of its old x; the panel 144..639, the left column 1..143; nothing outside 0..640', () => {
    const P = pingBarsPlace(), S = SCOREBOARD_SATCHEL_SLOT_ADAPTATION;
    expect(P.grow).toBe(9);
    expect(P.grow).toBeCloseTo((S.w + 2 * S.gap - PING_NAME_GAP_ADAPTATION) / 2, 9);
    const { quads, tris } = scoreboardLayout(PS2, { ...info, rows, bombCarrier: 2, spectators: ['Zed'] }, SAT);
    for (const t of [0, 1] as const) {
      for (const c of SCORE_COLUMNS_ADAPTATION) {
        expect(drawn(quads, c.text, c.x + 9, SCORE_LAYOUT.teams[t]!.y + 20, 1, true), c.text).toHaveLength(c.text.length);
        expect(drawn(quads, c.text, c.x, SCORE_LAYOUT.teams[t]!.y + 20, 1, true), c.text).toHaveLength(0);
      }
    }
    expect(drawn(quads, '2', 397.5, base(0, 0), 0.8, true)).toHaveLength(1);   // the carrier's kills
    const panel = quads.filter((q) => q.texture === 'newweapnbkrnd.tif').slice(0, 9);
    expect(span(panel)).toEqual([144, 639]);
    const left = quads.filter((q) => q.texture === 'newweapnbkrnd.tif').slice(9, 13);
    expect(span(left)).toEqual([1, 143]);
    expect([Math.min(...tris.flatMap((t) => [t.p[0], t.p[2], t.p[4]])), Math.max(...tris.flatMap((t) => [t.p[0], t.p[2], t.p[4]]))]).toEqual([144, 639]);
    expect(span(quads)[0]).toBeGreaterThanOrEqual(0);
    expect(span(quads)[1]).toBeLessThanOrEqual(640);
  });

  it("a board WITHOUT rows is the original's: the panel 153..630, the columns 455 / 522 / 588, the left column 10..152", () => {
    const { quads, tris } = scoreboardLayout(PS2, { ...info, bombCarrier: 2 }, SAT);
    expect(span(quads.filter((q) => q.texture === 'newweapnbkrnd.tif').slice(0, 9))).toEqual([153, 630]);
    expect(span(quads.filter((q) => q.texture === 'newweapnbkrnd.tif').slice(9, 13))).toEqual([10, 152]);
    expect(tris[0]!.p.slice(0, 2)).toEqual([153, 104]);
    for (const c of SCORE_LAYOUT.columns) expect(drawn(quads, c.text, c.x, SCORE_TOP + 20, 1, true), c.text).toHaveLength(c.text.length);
    expect(drawn(quads, 'SEAL', SCORE_LAYOUT.rows.nameX, base(0, 0))).toHaveLength(4);
  });

  it("the pointer's row test finds a row at the bars' new x and at the far right of the widened stripe", () => {
    const P = pingBarsPlace();
    expect(scoreboardRowAt(PS2, { rows }, (P.x0 + P.x1) / 2, base(0, 0) - 4)).toBe(2);
    expect(scoreboardRowAt(PS2, { rows }, 632, base(0, 1) - 4)).toBe(4);
    expect(scoreboardRowAt(PS2, { rows }, 634, base(0, 1) - 4)).toBeNull();
    expect(scoreboardRowAt(PS2, { rows }, 151, base(0, 1) - 4)).toBeNull();
  });

  it("the damage panel's board keeps its cells where they were: HITS 388.5, DMG 455, the name at 223, the bar 475..545, the mark at 622", () => {
    const C = DAMAGE_PANEL_COLUMNS_ADAPTATION;
    const damage = damagePanelRows({ round: 1, life: false, dealt: [{ id: 3, name: 'Charlie', hits: 3, health: 100, kill: true }], taken: [] });
    const { quads } = scoreboardLayout(PS2, { ...info, rows, damage }, SAT);
    const y = SCORE_LAYOUT.teams[0].y + 20;
    expect(drawn(quads, 'HITS', C.hits, y, 1, true)).toHaveLength(4);
    expect(drawn(quads, 'DMG', C.dmg, y, 1, true)).toHaveLength(3);
    expect(drawn(quads, 'Charlie', C.name, base(0, 0))).toHaveLength(7);
    const bar = quads.filter((q) => q.texture === 'white' && Math.abs(q.y + q.h / 2 - (base(0, 0) - C.bar.up + C.bar.h)) < 1e-6);
    expect(span(bar)[0]).toBeCloseTo(475, 6);
    expect(span(bar)[1]).toBeCloseTo(545, 6);
    const kill = quads.filter((q) => q.texture === 'font_text_01.tif' && q.rgba[0] !== 0 && q.x > 560 && Math.abs(q.y - base(0, 0) + 5) < 8);
    expect(span(kill)[1]).toBeLessThanOrEqual(C.mark + 1);
    expect(span(kill)[1]).toBeGreaterThan(C.mark - 3);
  });
});

/**
 * WM-DATA, the hover's source (a browser adaptation; hud.ts's part entered for the lane): the page hands the HUD the
 * pointer in frame pixels (`Hud.setPointer`), and `boardLayout` hands the board the row under it (`scoreboardRowAt`) as
 * `hoverRow`, in the presentation's own place. No pointer (a pad-only player) draws the board exactly as before.
 */
describe('WM-DATA: the pointer over the drawn board picks the hovered row (a browser adaptation)', () => {
  const row = (id: number, team: 'seal' | 'terrorist', score: number, over: Partial<ScoreRowInfo> = {}): ScoreRowInfo =>
    ({ id, name: `P${id}`, team, kills: id, deaths: 1, score, alive: true, self: false, ...over });
  const base = (team: 0 | 1, i: number): number => SCORE_LAYOUT.teams[team]!.y + 38 + 16.8 * i;
  const rows = [row(1, 'seal', 5, { ping: 87, self: true }), row(2, 'seal', 3, { ping: 120 }), row(3, 'terrorist', 1, { ping: 40 })];
  const model = (pointer?: { x: number; y: number } | null) => ({
    ...DEFAULT_MODEL, scoreboard: true, scoreRows: { rows, spectators: [] }, ...(pointer !== undefined ? { pointer } : {}),
  });
  type Quads = ReturnType<typeof hudPass>['quads'];
  const board = (f: { width: number; height: number }, p: { x: number; y: number } | null | undefined, presentation: 'ps2' | 'native' = 'ps2'): Quads =>
    hudPass(f, model(p), SIZES, AT_REST, false, null, presentation).quads.filter((q) => q.element === 'scoreboard');
  const drawnAt = (quads: Quads, line: string, x: number, y: number) => {
    const g = layoutText(line, x, y, 0.8).glyphs;
    const hit = g.map((h) => quads.find((q) => q.texture === 'font_text_01.tif' && q.rgba[0] !== 0
      && Math.abs(q.x - (h.x + h.w / 2)) < 1e-6 && Math.abs(q.y - (h.y + h.h / 2)) < 1e-6 && q.u0 === h.u0));
    return hit.every((q) => q) ? hit : [];
  };
  const font = (quads: Quads) => quads.filter((q) => q.texture === 'font_text_01.tif').length;

  it('Hud.setPointer sets the model\'s pointer in frame pixels; null clears it', () => {
    const hud = new Hud();
    expect(hud.state().model.pointer ?? null).toBeNull();
    hud.setPointer({ x: 300, y: 140 });
    expect(hud.state().model.pointer).toEqual({ x: 300, y: 140 });
    hud.setPointer(null);
    expect(hud.state().model.pointer ?? null).toBeNull();
  });

  it('the PS2 board: the pointer on a row draws that row\'s number ending 2 left of its bars, and only that row\'s', () => {
    const x = (n: string) => pingBarsPlace().hoverEnd - textWidth(n, 0.8);
    const on2 = board(PS2, { x: 400, y: base(0, 1) - 4 });
    expect(drawnAt(on2, '120', x('120'), base(0, 1)).length).toBe(3);
    expect(drawnAt(on2, '87', x('87'), base(0, 0))).toHaveLength(0);
    const on3 = board(PS2, { x: 200, y: base(1, 0) });
    expect(drawnAt(on3, '40', x('40'), base(1, 0)).length).toBe(2);
  });

  it('no pointer, a cleared pointer, or a pointer off the rows: the board exactly as without the hover', () => {
    const plain = board(PS2, undefined);
    expect(board(PS2, null)).toEqual(plain);
    expect(board(PS2, { x: 50, y: 300 })).toEqual(plain);           // the left column
    expect(board(PS2, { x: 400, y: SCORE_TOP + 10 })).toEqual(plain); // the team bar
    // Nor without the board up: the pointer adds nothing to the in-round HUD.
    const closed = (p?: { x: number; y: number }) => hudPass(PS2, { ...model(p), scoreboard: false }, SIZES, AT_REST, false, null, 'ps2');
    expect(closed({ x: 400, y: base(0, 1) - 4 })).toEqual(closed());
  });

  it('the Modern board: the pointer is read in its lifted, scaled place', () => {
    const f = { width: 1920, height: 1080 }, s = f.height / 448, k = modernScoreboardFit(f, SIZES, true).scale;
    const px = f.width / 2 + (400 - 320) * k * s, py = ((SCORE_TOP - MODERN_SCOREBOARD_LIFT) + (base(0, 1) - 4 - SCORE_TOP) * k) * s;
    expect(scoreboardRowAt(f, { rows }, px, py, MODERN_SCOREBOARD_LIFT, k)).toBe(2);
    const plain = board(f, undefined, 'native');
    expect(font(board(f, { x: px, y: py }, 'native')) - font(plain)).toBe(2 * 3);   // "120", shadow and text
  });
});
