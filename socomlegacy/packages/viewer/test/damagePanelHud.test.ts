import { describe, expect, it } from 'vitest';
import { damageHintText, damagePanelRows } from '../src/damagePanel';
import { AT_REST, DEFAULT_MODEL, Hud, hudPass, modernScoreboardFit, SPECTATOR_HELP, type HudModel, type HudQuad } from '../src/hud';
import { textWidth } from '../src/hudFont';
import { DAMAGE_HINT_ADAPTATION, damageHintBox, SCORE_LAYOUT, SCORE_TOP } from '../src/scoreboard';

/**
 * WM-13 (the DAMAGE REPORT PANEL, a BROWSER ADAPTATION): nothing is drawn over a round screen -- `hudPass` returns the
 * round screen first, so the panel's state changes no quad and no shape there; without a round screen, the board's
 * place draws the panel.
 */
const SIZES: Record<string, { width: number; height: number }> = {
  'newweapnbkrnd.tif': { width: 128, height: 64 }, 'font_text_01.tif': { width: 512, height: 128 }, white: { width: 1, height: 1 },
  'font_special_01.tif': { width: 256, height: 64 },
};
const report = damagePanelRows({
  round: 1, life: false, dealt: [{ id: 3, name: 'Charlie', hits: 3, health: 100, kill: true }], taken: [{ id: 2, name: 'Bravo', hits: 2, health: 40 }],
});
const screen = { kind: 'roundComplete', secondsLeft: 5, elapsed: 0, winner: null, wins: { seal: 0, terrorist: 0 }, rows: [] };
const frames = [{ width: 640, height: 448 }, { width: 1920, height: 1080 }];

describe('the damage panel and the HUD pass', () => {
  it('a round screen up: the quads and the shapes are identical with the panel on or off, SELECT held or not', () => {
    for (const f of frames) {
      for (const presentation of ['ps2', 'native'] as const) {
        for (const scoreboard of [false, true]) {
          const base = { ...DEFAULT_MODEL, scoreboard, roundScreen: screen } as unknown as HudModel;
          const off = hudPass(f, base, SIZES, AT_REST, false, null, presentation);
          const on = hudPass(f, { ...base, damagePanel: { report, hint: 'x' } } as unknown as HudModel, SIZES, AT_REST, false, null, presentation);
          expect(on.quads).toEqual(off.quads);
          expect(on.tris).toEqual(off.tris);
        }
      }
    }
  });

  it('no round screen, SELECT held: the panel is drawn in the board\'s place', () => {
    const base = { ...DEFAULT_MODEL, scoreboard: true, name: 'Tester' } as HudModel;
    const off = hudPass(frames[0]!, base, SIZES, AT_REST, false, null, 'ps2');
    const on = hudPass(frames[0]!, { ...base, damagePanel: { report, hint: null } } as unknown as HudModel, SIZES, AT_REST, false, null, 'ps2');
    expect(on.quads).not.toEqual(off.quads);
    expect(on.tris).toEqual(off.tris);
  });

  it('Hud.setDamagePanel sets the model\'s field and null clears it', () => {
    const hud = new Hud();
    hud.setDamagePanel({ report, hint: null });
    expect(hud.state().model.damagePanel).toEqual({ report, hint: null });
    hud.setDamagePanel(null);
    expect(hud.state().model.damagePanel ?? null).toBeNull();
  });
});

describe("the damage panel's hint (DAMAGE_HINT_ADAPTATION, placement B above the panel)", () => {
  const LONG = damageHintText('toReport', 'pad'), SHORT = damageHintText('toBoard', 'pad');
  /** The hint's quads -- the board's element above the board's top -- in the 640-wide frame's x (the board's place). */
  const hintOf = (f: { width: number; height: number }, quads: HudQuad[], top: number) => {
    const s = f.height / 448, bx = (x: number): number => 320 + (x - f.width / 2) / s;
    const q = quads.filter((u) => u.element === 'scoreboard' && u.y + u.h / 2 <= top * s + 1e-6);
    return q.length ? { x0: Math.min(...q.map((u) => bx(u.x - u.w / 2))), x1: Math.max(...q.map((u) => bx(u.x + u.w / 2))), n: q.length } : null;
  };
  const model = (hint: string | null, extra: Partial<HudModel> = {}) => ({
    ...DEFAULT_MODEL, scoreboard: true, name: 'Tester', message: 'ALL TERRORISTS ELIMINATED', damagePanel: { report: null, hint }, ...extra,
  }) as unknown as HudModel;

  it("baseline 98, right-aligned to the panel's edge 630, at 0.8 in the help lines' yellow at alpha 100", () => {
    expect(DAMAGE_HINT_ADAPTATION).toMatchObject({ baseline: SCORE_TOP - 6, right: SCORE_LAYOUT.panel.x1, scale: 0.8, alpha: SPECTATOR_HELP.alpha });
    expect(DAMAGE_HINT_ADAPTATION.baseline).toBe(98);
    expect([...DAMAGE_HINT_ADAPTATION.rgb]).toEqual([...SPECTATOR_HELP.rgb]);
    for (const t of [LONG, SHORT]) {
      const b = damageHintBox(t);
      expect(b.x1).toBeCloseTo(630, 9);
      expect(b.x1 - b.x0).toBeCloseTo(textWidth(t, 0.8, { special: true }), 9);
      expect(b.y1).toBeLessThan(SCORE_TOP);                                    // above the panel's top
    }
    expect(damageHintBox(LONG).x0).toBeCloseTo(520, 6);                         // 110 wide ("DAMAGE REPORT" made it 179)
    expect(damageHintBox(SHORT).x0).toBeCloseTo(510, 6);
  });

  it("drawn with the board (PS2): its quads end at 630 and start at the box's pen", () => {
    const f = frames[0]!, pass = hudPass(f, model(LONG), SIZES, AT_REST, false, null, 'ps2');
    const h = hintOf(f, pass.quads, SCORE_TOP);
    expect(h).not.toBeNull();
    expect(h!.x0).toBeGreaterThanOrEqual(damageHintBox(LONG).x0 - 1);
    expect(h!.x1).toBeLessThanOrEqual(630 + 1.5);                              // the last letter's drop shadow
  });

  it('none without the board, none with no hint, none with a round screen up', () => {
    const f = frames[0]!;
    expect(hintOf(f, hudPass(f, model(LONG, { scoreboard: false }), SIZES, AT_REST, false, null, 'ps2').quads, SCORE_TOP)).toBeNull();
    expect(hintOf(f, hudPass(f, model(null), SIZES, AT_REST, false, null, 'ps2').quads, SCORE_TOP)).toBeNull();
    const up = hudPass(f, model(LONG, { roundScreen: screen } as unknown as Partial<HudModel>), SIZES, AT_REST, false, null, 'ps2');
    expect(up.quads.some((q) => q.element === 'scoreboard')).toBe(false);
  });

  it('clear of the message window (PS2 and MODERN, 4:3 and 16:9): the long hint as the short one, or more', () => {
    for (const f of [{ width: 1024, height: 768 }, { width: 1920, height: 1080 }]) {
      for (const presentation of ['ps2', 'native'] as const) {
        const s = f.height / 448, bx = (x: number): number => 320 + (x - f.width / 2) / s;
        const top = presentation === 'native' ? SCORE_TOP - 4 : SCORE_TOP;
        const gap = (t: string): number => {
          const pass = hudPass(f, model(t), SIZES, AT_REST, false, null, presentation);
          const win = pass.quads.filter((q) => q.element === 'banner');
          expect(win.length, `${presentation} ${f.width}`).toBeGreaterThan(0);
          const right = Math.max(...win.map((q) => bx(q.x + q.w / 2)));
          return hintOf(f, pass.quads, top)!.x0 - right;
        };
        const long = gap(LONG), short = gap(SHORT);
        expect(long, `${presentation} ${f.width}`).toBeGreaterThan(short);
        expect(short, `${presentation} ${f.width}`).toBeGreaterThan(0);
        // The pen boxes' gaps (the window's right edge 492): PS2 18 short, 28 long; Modern scaled about x 320 with the board.
        // The drawn glyphs sit up to the pen nudge and the GS sample offset left of the pen: within 1.5.
        const k = presentation === 'ps2' ? 1 : modernScoreboardFit(f, SIZES).scale;
        expect(Math.abs(short - (320 + (510 - 320) * k - 492)), `${presentation} ${f.width} short`).toBeLessThan(1.5);
        expect(Math.abs(long - (320 + (520 - 320) * k - 492)), `${presentation} ${f.width} long`).toBeLessThan(1.5);
      }
    }
  });
});
