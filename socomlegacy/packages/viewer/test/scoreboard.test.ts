import { describe, expect, it } from 'vitest';
import {
  cutLine, DEAD_DIM, DEFAULT_PLAYER, MODERN_SCOREBOARD_LIFT, PING_NONE, pingCell, pingNameWidth, SCORE_LAYOUT, SCORE_TOP, scoreboardLayout,
  SCOREBOARD_SATCHEL_RECT, SCOREBOARD_SATCHEL_RGBA_READING,
} from '../src/scoreboard';
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
    ['P2', 'P5', 'P1', 'P3', 'P4'].forEach((n, i) => expect(drawn(quads, n, 223, base(0, i)).length).toBeGreaterThan(0));
    ['P7', 'P8', 'P6', 'P9'].forEach((n, i) => expect(drawn(quads, n, 223, base(1, i)).length).toBeGreaterThan(0));
    expect(drawn(quads, 'P9', 223, base(0, 3))).toHaveLength(0);
    // the row after the last SEAL is empty
    expect(quads.filter((q) => q.texture === 'font_text_01.tif' && q.rgba[0] !== 0 && Math.abs(q.y - base(0, 5)) < 6)).toHaveLength(0);
  });

  it('writes kills, deaths and score on the columns, the local player in yellow', () => {
    const { quads } = scoreboardLayout(PS2, { ...info, rows }, SIZES);
    expect(drawn(quads, 'P2', 223, base(0, 0)).every((q) => q.rgba[2] === 12 / 128 && q.rgba[3] === 110 / 128)).toBe(true);
    expect(drawn(quads, '9', 588, base(0, 0), 0.8, true).length).toBeGreaterThan(0);
    expect(drawn(quads, 'P5', 223, base(0, 1)).every((q) => q.rgba[2] === 115 / 128)).toBe(true);
  });

  it('scales the dead row\'s colours by 0.6', () => {
    const { quads } = scoreboardLayout(PS2, { ...info, rows }, SIZES);
    const dead = drawn(quads, 'P4', 223, base(0, 4));
    expect(dead.length).toBeGreaterThan(0);
    for (const q of dead) {
      expect(q.rgba[0]).toBeCloseTo((115 / 128) * 0.6, 6);
      expect(q.rgba[3]).toBeCloseTo((110 / 128) * 0.6, 6);
    }
  });

  it('cuts a team of 10 to its best 8', () => {
    const many = Array.from({ length: 10 }, (_, i) => row(i + 1, 'terrorist', i));
    const { quads } = scoreboardLayout(PS2, { ...info, rows: many }, SIZES);
    expect(drawn(quads, 'P10', 223, base(1, 0)).length).toBeGreaterThan(0);
    expect(drawn(quads, 'P3', 223, base(1, 7)).length).toBeGreaterThan(0);
    expect(drawn(quads, 'P2', 223, base(1, 8))).toHaveLength(0);
  });

  it('lists the spectators at (24, 270 + 16.8 i), at most 8, and the rounds won on the team lines', () => {
    const names = Array.from({ length: 10 }, (_, i) => `S${i}`);
    const { quads } = scoreboardLayout(PS2, { ...info, rows, spectators: names, wins: { seal: 2, terrorist: 1 } }, SIZES);
    for (let i = 0; i < 8; i++) expect(drawn(quads, names[i]!, 24, 270 + 16.8 * i).length).toBeGreaterThan(0);
    expect(drawn(quads, 'S8', 24, 270 + 16.8 * 8)).toHaveLength(0);
    expect(drawn(quads, 'SEALs :   2', 171, 124, 1).length).toBeGreaterThan(0);
    expect(drawn(quads, 'TERRORISTS :   1', 171, 287, 1).length).toBeGreaterThan(0);
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
 * NCW-7 (a browser adaptation, the owner's word 2026-11-05 "build the scoreboard ping yeah"; plan
 * `2026-11-05-netcode-wave.md`'s NCW-7 row): the original's board has no ping; the port adds a PING column one pitch
 * left of KILLS, the three where the game puts them.
 */
describe('the PING column (NCW-7, a browser adaptation)', () => {
  const row = (id: number, team: 'seal' | 'terrorist', score: number, over: Partial<ScoreRowInfo> = {}): ScoreRowInfo =>
    ({ id, name: `P${id}`, team, kills: id, deaths: 1, score, alive: true, self: false, ...over });
  const drawn = (quads: ReturnType<typeof scoreboardLayout>['quads'], line: string, x: number, y: number, scale = 0.8, centre = false) => {
    const g = layoutText(line, centre ? x - textWidth(line, scale) / 2 : x, y, scale).glyphs;
    const hit = g.map((h) => quads.find((q) => q.texture === 'font_text_01.tif' && q.rgba[0] !== 0
      && Math.abs(q.x - (h.x + h.w / 2)) < 1e-6 && Math.abs(q.y - (h.y + h.h / 2)) < 1e-6 && q.u0 === h.u0));
    return hit.every((q) => q) ? hit as typeof quads : [];
  };
  const base = (team: 0 | 1, i: number): number => SCORE_LAYOUT.teams[team]!.y + 38 + 16.8 * i;

  it('centres PING on 388.5, one pitch (66.5) left of KILLS; KILLS, DEATH and SCORE stay on 455, 522, 588', () => {
    expect(SCORE_LAYOUT.columns.map((c) => c.x)).toEqual([455, 522, 588]);
    expect(SCORE_LAYOUT.ping.x).toBe(388.5);
    expect(SCORE_LAYOUT.columns[0]!.x - SCORE_LAYOUT.ping.x).toBe((588 - 455) / 2);
    expect([SCORE_LAYOUT.ping.x, ...SCORE_LAYOUT.columns.map((c) => c.x)]).toEqual([388.5, 455, 522, 588]);
  });

  it("draws the header on both teams in the three headers' font, scale, colour and alpha", () => {
    const { quads } = scoreboardLayout(PS2, { ...info, rows: [row(1, 'seal', 0)] }, SIZES);
    for (const t of [0, 1] as const) {
      const y = SCORE_LAYOUT.teams[t]!.y + 20;
      const ping = drawn(quads, 'PING', 388.5, y, 1, true), kills = drawn(quads, 'KILLS', 455, y, 1, true);
      expect(ping.length).toBe(4);
      expect(kills.length).toBe(5);
      for (const q of ping) expect(q.rgba).toEqual(kills[0]!.rgba);
    }
  });

  it("draws a row's ping in whole ms on the column, in the row's colour; the local player's in yellow", () => {
    const rows = [row(1, 'seal', 5, { ping: 87.4 }), row(2, 'seal', 9, { self: true, ping: 120 }), row(3, 'terrorist', 1, { ping: 999 })];
    const { quads } = scoreboardLayout(PS2, { ...info, rows }, SIZES);
    const self = drawn(quads, '120', 388.5, base(0, 0), 0.8, true);
    expect(self.length).toBe(3);
    for (const q of self) expect(q.rgba).toEqual([115 / 128, 115 / 128, 12 / 128, 110 / 128]);
    const other = drawn(quads, '87', 388.5, base(0, 1), 0.8, true);
    expect(other.length).toBe(2);
    for (const q of other) expect(q.rgba).toEqual([115 / 128, 115 / 128, 115 / 128, 110 / 128]);
    expect(drawn(quads, '999', 388.5, base(1, 0), 0.8, true).length).toBe(3);
  });

  it('draws "--" for a bot, for a seat with no reading yet (0) and for a row with none (an older room)', () => {
    expect(PING_NONE).toBe('--');
    expect([pingCell({ ping: 0 }), pingCell({}), pingCell({ ping: 40, bot: true }), pingCell({ ping: 40 })]).toEqual(['--', '--', '--', '40']);
    const rows = [row(1, 'seal', 3, { ping: 0 }), row(2, 'seal', 2, { bot: true, ping: 0 }), row(3, 'seal', 1)];
    const { quads } = scoreboardLayout(PS2, { ...info, rows }, SIZES);
    for (let i = 0; i < 3; i++) expect(drawn(quads, '--', 388.5, base(0, i), 0.8, true).length).toBe(2);
    expect(drawn(quads, '0', 388.5, base(0, 0), 0.8, true)).toHaveLength(0);
  });

  it("dims a dead row's ping with its name (DEAD_DIM)", () => {
    const { quads } = scoreboardLayout(PS2, { ...info, rows: [row(4, 'seal', 1, { alive: false, ping: 64 })] }, SIZES);
    const dead = drawn(quads, '64', 388.5, base(0, 0), 0.8, true);
    expect(dead.length).toBe(2);
    for (const q of dead) {
      expect(q.rgba[0]).toBeCloseTo((115 / 128) * DEAD_DIM, 6);
      expect(q.rgba[3]).toBeCloseTo((110 / 128) * DEAD_DIM, 6);
    }
  });

  it("cuts a name to end before the column, with the board's cutLine; a short name is whole", () => {
    const half = Math.max(textWidth('PING', 1), textWidth('999', 0.8)) / 2;
    expect(pingNameWidth()).toBeCloseTo(388.5 - half - SCORE_LAYOUT.ping.gap - 223, 9);
    const wide = 'WWWWWWWWWWWWWWWW';
    const cut = cutLine(wide, 0.8, pingNameWidth());
    expect(cut.endsWith('-')).toBe(true);
    expect(cut.length).toBeLessThan(wide.length);
    const { quads } = scoreboardLayout(PS2, { ...info, rows: [row(1, 'seal', 2, { name: wide, ping: 50 }), row(2, 'seal', 1, { name: 'Kilo', ping: 50 })] }, SIZES);
    const name = drawn(quads, cut, 223, base(0, 0));
    expect(name.length).toBe(cut.length);
    expect(Math.max(...name.map((q) => q.x + q.w / 2))).toBeLessThan(388.5 - half);
    expect(drawn(quads, wide, 223, base(0, 0))).toHaveLength(0);
    expect(drawn(quads, 'Kilo', 223, base(0, 1)).length).toBe(4);
  });

  it("leaves the single-SEAL board with no room's rows the original's: no PING header", () => {
    const { quads } = scoreboardLayout(PS2, info, SIZES);
    expect(drawn(quads, 'PING', 388.5, SCORE_TOP + 20, 1, true)).toHaveLength(0);
  });

  it('the Modern presentation scales the column with the board (modernScoreboardFit), no new art', () => {
    const rows = [row(1, 'seal', 5, { ping: 87 }), row(2, 'terrorist', 1, { alive: false, ping: 0 })];
    for (const f of [{ width: 1920, height: 1080 }, { width: 1024, height: 768 }]) {
      const s = f.height / 448, k = modernScoreboardFit(f, SIZES).scale, cx = f.width / 2, ty = (SCORE_TOP - MODERN_SCOREBOARD_LIFT) * s;
      const p = scoreboardLayout(f, { ...info, rows }, SIZES), m = scoreboardLayout(f, { ...info, rows }, SIZES, MODERN_SCOREBOARD_LIFT, k);
      expect(m.quads).toHaveLength(p.quads.length);
      expect(new Set(m.quads.map((q) => q.texture))).toEqual(new Set(p.quads.map((q) => q.texture)));
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

  it('draws hud_satchel.tif on the carrier\'s row at x 200..216, baseline - 12 .. + 4, last, at its own colour, scaled with the board', () => {
    expect(SCOREBOARD_SATCHEL_RECT).toEqual({ x0: 200, x1: 216, up: 12, down: 4 });
    expect(SCOREBOARD_SATCHEL_RGBA_READING).toEqual([1, 1, 1, 1]);
    const { quads } = scoreboardLayout(PS2, { ...info, rows, spectators: ['S1'], bombCarrier: 4 }, SAT);
    const [s] = satchels(quads);
    expect(satchels(quads)).toHaveLength(1);
    expect(edges(s!)).toEqual([200, base(0, 1) - 12, 216, base(0, 1) + 4]);
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
