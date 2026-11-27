import { afterEach, describe, expect, it } from 'vitest';
import { PAD_GLYPH } from '@s2u/scene';
import {
  DAMAGE_PANEL_CLOSED, DAMAGE_PANEL_COLOURS_ADAPTATION, DAMAGE_PANEL_COLUMNS_ADAPTATION, DAMAGE_PANEL_WORDS_ADAPTATION,
  damageHintText, damagePanelFrame, damagePanelGate, damagePanelKey, damagePanelRows, damagePanelView, stageDamagePost, stageDamageWindow,
  type DamagePanelState, type DamageWindowKind,
} from '../src/damagePanel';
import { DAMAGE_LIFE_POINTS_ADAPTATION } from '../src/net/damagePoints';
import { controllerConfigs } from '../src/controllerConfigs';
import { noInput, type PadButton } from '../src/gamepad';
import { HUD_COLOURS } from '../src/hud';
import { textWidth } from '../src/hudFont';
import { MESSAGE_COLOURS } from '../src/matchMessages';
import type { DamageReport } from '../src/netPage';
import { cutLine, SCORE_LAYOUT, scoreboardLayout } from '../src/scoreboard';

/**
 * WM-13, the DAMAGE REPORT PANEL (a BROWSER ADAPTATION, product track: the original has no damage report; look 2F, the
 * owner's rulings of 2026-11-15): the pure gate that gives the device's own inventory binding to the panel while SELECT
 * is held in the result window or a respawn room's respawn wait, the view and hint it yields, and the panel's rows laid
 * in the board's own panel.
 */

afterEach(() => { controllerConfigs.reset(); });

type Step = { window: DamageWindowKind | null; roundScreen?: boolean; select: boolean; binding: boolean };
/** Runs the gate over frames from `from`, returning each frame's result. */
function run(steps: Step[], from: DamagePanelState = DAMAGE_PANEL_CLOSED) {
  let state = from;
  return steps.map((s) => {
    const r = damagePanelGate(state, { window: s.window, roundScreen: s.roundScreen ?? false, select: s.select, binding: s.binding });
    state = r.state;
    return r;
  });
}

describe('damagePanelGate: the inventory binding goes to the panel only with SELECT held in the window', () => {
  it('(i) respawn wait: SELECT + binding opens the panel and consumes the press (WEAPON EXCHANGE not opened)', () => {
    const [a, b] = run([{ window: 'life', select: true, binding: false }, { window: 'life', select: true, binding: true }]);
    expect(a).toMatchObject({ consumed: false });
    expect(a!.state.panel).toBe(false);
    expect(b).toMatchObject({ consumed: true });
    expect(b!.state.panel).toBe(true);
  });

  it('(i) respawn wait: the binding alone is not consumed (WEAPON EXCHANGE as today)', () => {
    const [a] = run([{ window: 'life', select: false, binding: true }]);
    expect(a).toMatchObject({ consumed: false });
    expect(a!.state.panel).toBe(false);
  });

  it('(ii) alive inside the result window: with SELECT the panel; without, the inventory as today', () => {
    const [a] = run([{ window: 'round', select: true, binding: true }]);
    expect(a).toMatchObject({ consumed: true });
    expect(a!.state.panel).toBe(true);
    const [b] = run([{ window: 'round', select: false, binding: true }]);
    expect(b).toMatchObject({ consumed: false });
    expect(b!.state.panel).toBe(false);
  });

  it('(iii) a live round: never consumed, never the panel', () => {
    for (const select of [false, true]) {
      const out = run([{ window: null, select, binding: false }, { window: null, select, binding: true }, { window: null, select, binding: false }]);
      for (const r of out) { expect(r.consumed).toBe(false); expect(r.state.panel).toBe(false); }
    }
  });

  it('(iv) a round screen up: nothing, whatever the window says', () => {
    for (const window of ['round', 'life', null] as const) {
      const out = run([{ window, roundScreen: true, select: true, binding: true }]);
      expect(out[0]!.consumed).toBe(false);
      expect(out[0]!.state.panel).toBe(false);
      expect(damagePanelView(out[0]!.state, { window, roundScreen: true, select: true })).toEqual({ panel: false, hint: null });
    }
  });

  it('(v) SELECT released closes it; the next SELECT shows the board', () => {
    const out = run([
      { window: 'round', select: true, binding: true }, { window: 'round', select: true, binding: false },
      { window: 'round', select: false, binding: false }, { window: 'round', select: true, binding: false },
    ]);
    expect(out.map((r) => r.state.panel)).toEqual([true, true, false, false]);
  });

  it('a second press flips back to the board, a third to the panel again', () => {
    const out = run([
      { window: 'life', select: true, binding: true }, { window: 'life', select: true, binding: false },
      { window: 'life', select: true, binding: true }, { window: 'life', select: true, binding: false },
      { window: 'life', select: true, binding: true },
    ]);
    expect(out.map((r) => r.state.panel)).toEqual([true, true, false, false, true]);
    expect(out.map((r) => r.consumed)).toEqual([true, false, true, false, true]);
  });

  it('a held binding is a press once: held on, it neither flips again nor reaches the menu it was taken from', () => {
    const out = run([
      { window: 'round', select: true, binding: true }, { window: 'round', select: true, binding: true },
      { window: 'round', select: false, binding: true }, { window: 'round', select: false, binding: false },
      { window: 'round', select: false, binding: true },
    ]);
    expect(out.map((r) => r.state.panel)).toEqual([true, true, false, false, false]);
    // Owned till let go (SELECT released while it is still held too); a fresh press without SELECT is today's again.
    expect(out.map((r) => r.consumed)).toEqual([true, true, true, false, false]);
  });

  it('a binding held before SELECT is pressed is never taken (no press edge in the window)', () => {
    const out = run([
      { window: 'round', select: false, binding: true }, { window: 'round', select: true, binding: true },
      { window: 'round', select: true, binding: true },
    ]);
    expect(out.map((r) => r.consumed)).toEqual([false, false, false]);
    expect(out.map((r) => r.state.panel)).toEqual([false, false, false]);
  });

  it('the window closing closes the panel', () => {
    const out = run([{ window: 'round', select: true, binding: true }, { window: null, select: true, binding: false }]);
    expect(out.map((r) => r.state.panel)).toEqual([true, false]);
  });
});

describe('damagePanelView and the hint', () => {
  const open: DamagePanelState = { ...DAMAGE_PANEL_CLOSED, panel: true };

  it('the hint shows only while the window is open and the board or the panel is up', () => {
    expect(damagePanelView(DAMAGE_PANEL_CLOSED, { window: 'round', roundScreen: false, select: true })).toEqual({ panel: false, hint: 'toReport' });
    expect(damagePanelView(open, { window: 'life', roundScreen: false, select: true })).toEqual({ panel: true, hint: 'toBoard' });
    expect(damagePanelView(DAMAGE_PANEL_CLOSED, { window: 'round', roundScreen: false, select: false })).toEqual({ panel: false, hint: null });
    expect(damagePanelView(DAMAGE_PANEL_CLOSED, { window: null, roundScreen: false, select: true })).toEqual({ panel: false, hint: null });
    expect(damagePanelView(open, { window: null, roundScreen: false, select: true })).toEqual({ panel: false, hint: null });
  });

  it('the pad hint names SELECT and the device\'s own inventory button in the disc font\'s glyphs', () => {
    const SEL = String.fromCharCode(PAD_GLYPH.SELECT), R2 = String.fromCharCode(PAD_GLYPH.R2), R1 = String.fromCharCode(PAD_GLYPH.R1);
    expect(PAD_GLYPH.SELECT).toBe(0xa4);
    expect(PAD_GLYPH.R2).toBe(0xbe);
    expect(damageHintText('toReport', 'pad')).toBe(`${SEL} + ${R2}  DMG`);
    expect(damageHintText('toBoard', 'pad')).toBe(`${SEL}  SCOREBOARD`);
    expect(damageHintText('toReport', 'pad', 'R1')).toBe(`${SEL} + ${R1}  DMG`);
    expect(damageHintText('toReport', 'touch')).toBe(`${SEL} + ${R2}  DMG`);
  });

  it('the pad hint follows the preset that puts Inventory on R1 (respawnPrompt.ts\'s read)', () => {
    expect(controllerConfigs.select('Goldeneye')).toBe(true);
    expect(controllerConfigs.record().buttons.Inventory).toBe('R1');
    expect(damageHintText('toReport', 'pad')).toBe(`${String.fromCharCode(PAD_GLYPH.SELECT)} + ${String.fromCharCode(PAD_GLYPH.R1)}  DMG`);
  });

  it('the keyboard hint names Tab and I', () => {
    expect(damageHintText('toReport', 'keyboard')).toBe('[TAB] + [I]  DMG');
    expect(damageHintText('toBoard', 'keyboard')).toBe('[TAB]  SCOREBOARD');
  });
});

const report = (over: Partial<DamageReport> = {}): DamageReport => ({
  round: 1, life: false,
  dealt: [{ id: 3, name: 'Charlie', hits: 3, health: 100, kill: true }, { id: 2, name: 'Bravo', hits: 1, health: 25 }],
  taken: [{ id: 2, name: 'Bravo', hits: 2, health: 40 }, { id: -4, name: null, hits: 4, health: 100, kill: true }],
  ...over,
});

describe('damagePanelRows: the report in the board\'s own rows (look 2F)', () => {
  const C = DAMAGE_PANEL_COLUMNS_ADAPTATION;

  it('names the columns in the board\'s slots: name 223 cut at 145, HITS 388.5, DMG 455, bar 475..545, the mark at 622', () => {
    expect(C.name).toBe(SCORE_LAYOUT.rows.nameX);
    expect(C.name).toBe(223);
    expect(C.nameWidth).toBeCloseTo(145, 0);
    expect(C.hits).toBe(388.5);
    expect(C.dmg).toBe(455);
    expect(C.bar).toMatchObject({ x0: 475, x1: 545 });
    expect(C.mark).toBe(622);
  });

  it('YOU DEALT in the SEALs\' block, YOU TOOK in the TERRORISTS\', under HITS and DMG -- the one word "DMG", never health', () => {
    const r = damagePanelRows(report());
    expect(r.titles).toEqual(['YOU DEALT', 'YOU TOOK']);
    expect(r.headers).toEqual([{ text: 'HITS', x: 388.5 }, { text: 'DMG', x: 455 }]);
    const words = [...r.titles, ...r.headers.map((h) => h.text), ...r.rows.flat().flatMap((row) => row.cells.map((c) => c.text)),
      ...Object.values(DAMAGE_PANEL_WORDS_ADAPTATION),
      ...(['toReport', 'toBoard'] as const).flatMap((h) => (['pad', 'keyboard', 'touch'] as const).map((d) => damageHintText(h, d)))];
    expect(words).toContain('DMG');
    for (const w of words) expect(w).not.toMatch(/health/i);
    // The review's F3: the hint's word is "DMG" (approved 2026-11-15), never look 2F's "DAMAGE REPORT".
    for (const w of words) expect(w).not.toMatch(/DAMAGE/i);
  });

  it('a row: the name at 223, HITS and DMG centred, the bar\'s share of the most, KILL / KILLED YOU right-aligned at 622', () => {
    const r = damagePanelRows(report());
    const [charlie, bravo] = r.rows[0];
    expect(charlie!.cells).toEqual([
      { text: 'Charlie', x: 223, align: 'left', rgba: expect.any(Array) },
      { text: '3', x: 388.5, align: 'centre', rgba: expect.any(Array) },
      { text: '100', x: 455, align: 'centre', rgba: expect.any(Array) },
      { text: 'KILL', x: 622, align: 'right', rgba: DAMAGE_PANEL_COLOURS_ADAPTATION.good },
    ]);
    expect(charlie!.meters).toEqual([{ x0: 475, x1: 545, up: C.bar.up, h: C.bar.h, share: 1, rgba: DAMAGE_PANEL_COLOURS_ADAPTATION.good, track: DAMAGE_PANEL_COLOURS_ADAPTATION.track }]);
    expect(bravo!.cells.map((c) => c.text)).toEqual(['Bravo', '1', '25']);
    expect(bravo!.meters[0]!.share).toBeCloseTo(0.25, 9);
    const killer = r.rows[1][1]!;
    expect(killer.cells.at(-1)).toMatchObject({ text: 'KILLED YOU', x: 622, align: 'right', rgba: DAMAGE_PANEL_COLOURS_ADAPTATION.bad });
    expect(r.rows[1][0]!.meters[0]!.rgba).toEqual(DAMAGE_PANEL_COLOURS_ADAPTATION.bad);
  });

  it('DMG is the room\'s DMG points drawn as they come, in whole points (intake item 2 (C): a life is 100, never x 100)', () => {
    expect(DAMAGE_LIFE_POINTS_ADAPTATION).toBe(100);
    const r = damagePanelRows(report({ dealt: [{ id: 2, name: 'Bravo', hits: 2, health: 66.6 }], taken: [] }));
    expect(r.rows[0][0]!.cells[2]!.text).toBe('67');
  });

  it('a bar scales to the most taken or dealt, at least a life', () => {
    const r = damagePanelRows(report({ dealt: [{ id: 2, name: 'B', hits: 9, health: 150 }], taken: [{ id: 3, name: 'C', hits: 1, health: 75 }] }));
    expect(r.rows[0][0]!.meters[0]!.share).toBe(1);
    expect(r.rows[1][0]!.meters[0]!.share).toBeCloseTo(0.5, 9);
  });

  it('a departed player (a negative id, no name) draws no roster name; his figures as any row\'s', () => {
    const r = damagePanelRows(report());
    const gone = r.rows[1][1]!;
    expect(gone.cells.some((c) => c.x === C.name)).toBe(false);
    expect(gone.cells.map((c) => c.text)).toEqual(['4', '100', 'KILLED YOU']);
  });

  it('a long name is cut as the board cuts names; at most 8 rows a block', () => {
    const long = 'WWWWWWWWWWWWWWWWWWWW';
    const many = Array.from({ length: 11 }, (_, i) => ({ id: i + 2, name: i === 0 ? long : `P${i}`, hits: 1, health: 10 }));
    const r = damagePanelRows(report({ dealt: many, taken: [] }));
    expect(r.rows[0]).toHaveLength(SCORE_LAYOUT.rows.max);
    expect(r.rows[0][0]!.cells[0]!.text).toBe(cutLine(long, SCORE_LAYOUT.rows.scale, C.nameWidth));
    expect(textWidth(r.rows[0][0]!.cells[0]!.text, SCORE_LAYOUT.rows.scale)).toBeLessThanOrEqual(C.nameWidth);
  });

  it('no report yet: both blocks empty, the titles and headers still drawn', () => {
    const r = damagePanelRows(null);
    expect(r.rows).toEqual([[], []]);
    expect(r.titles).toEqual(['YOU DEALT', 'YOU TOOK']);
  });

  it('the colours are the message window\'s green and red at alpha 100 over the voice box\'s black (look 2F)', () => {
    const P = DAMAGE_PANEL_COLOURS_ADAPTATION, g = MESSAGE_COLOURS[3]!, b = MESSAGE_COLOURS[5]!;
    expect(P.good).toEqual([g[0] / 128, g[1] / 128, g[2] / 128, 100 / 128]);
    expect(P.bad).toEqual([b[0] / 128, b[1] / 128, b[2] / 128, 100 / 128]);
    expect(P.track).toEqual(HUD_COLOURS.voiceBox);
    expect(P.ink).toEqual([...SCORE_LAYOUT.rowRgb.map((c) => c / 128), SCORE_LAYOUT.rowAlpha]);
  });
});

describe('scoreboardLayout draws the panel in the board\'s place', () => {
  const PS2 = { width: 640, height: 448 };
  const SIZES: Record<string, { width: number; height: number }> = {
    'newweapnbkrnd.tif': { width: 128, height: 64 }, 'font_text_01.tif': { width: 512, height: 128 }, white: { width: 1, height: 1 },
  };
  const rows = [
    { id: 1, name: 'Tester', team: 'seal' as const, kills: 1, deaths: 0, score: 10, alive: true, self: true },
    { id: 2, name: 'Bravo', team: 'terrorist' as const, kills: 0, deaths: 1, score: 0, alive: true, self: false },
  ];
  const info = { player: 'Tester', game: 'MP2', type: 'DEMOLITION', rows };
  const nine = (qs: { texture: string }[]) => qs.filter((q) => q.texture === 'newweapnbkrnd.tif').slice(0, 9);

  it('keeps the board\'s frame -- panel x 153..630, y 104..430, its bars and backing -- and replaces its rows', () => {
    const board = scoreboardLayout(PS2, info, SIZES);
    const panel = scoreboardLayout(PS2, { ...info, damage: damagePanelRows(report()) }, SIZES);
    expect(nine(panel.quads)).toEqual(nine(board.quads));
    expect(panel.tris).toEqual(board.tris);
    expect(panel.quads).not.toEqual(board.quads);
    expect(panel.quads.every((q) => q.layer === 1 && q.element === 'scoreboard')).toBe(true);
  });

  it('draws each cell where its row puts it: the name\'s first glyph at 223, the mark ending at 622, the bar 475..545', () => {
    const panel = scoreboardLayout(PS2, { ...info, damage: damagePanelRows(report()) }, SIZES);
    const base = SCORE_LAYOUT.teams[0].y + SCORE_LAYOUT.rows.dy;                         // the first dealt row's baseline
    const white = panel.quads.filter((q) => q.texture === 'white' && Math.abs(q.y + q.h / 2 - (base - C().bar.up + C().bar.h)) < 1e-6);
    expect(Math.min(...white.map((q) => q.x - q.w / 2))).toBeCloseTo(475, 6);
    expect(Math.max(...white.map((q) => q.x + q.w / 2))).toBeCloseTo(545, 6);
    const lit = panel.quads.filter((q) => q.texture === 'font_text_01.tif' && q.rgba[0] !== 0 && q.x > 160 && q.y < base + 6 && q.y > base - 16);
    const kill = lit.filter((q) => q.rgba[1] === DAMAGE_PANEL_COLOURS_ADAPTATION.good[1] && q.rgba[0] === DAMAGE_PANEL_COLOURS_ADAPTATION.good[0]);
    expect(kill.length).toBe(4);                                                          // K I L L
    expect(Math.max(...kill.map((q) => q.x + q.w / 2))).toBeLessThanOrEqual(622 + 1);
    expect(Math.max(...kill.map((q) => q.x + q.w / 2))).toBeGreaterThan(622 - 3);
    expect(Math.min(...lit.map((q) => q.x - q.w / 2))).toBeCloseTo(223 - 0.6, 1);
  });

  it('draws no board row under the panel: none of the room\'s names', () => {
    const panel = scoreboardLayout(PS2, { ...info, damage: damagePanelRows(report({ dealt: [], taken: [] })) }, SIZES);
    const base = SCORE_LAYOUT.teams[0].y + SCORE_LAYOUT.rows.dy;
    const rowGlyphs = panel.quads.filter((q) => q.texture === 'font_text_01.tif' && q.rgba[0] !== 0 && q.x > 160 && q.y < base + 6 && q.y > base - 16);
    expect(rowGlyphs).toEqual([]);
  });
});

function C() { return DAMAGE_PANEL_COLUMNS_ADAPTATION; }

describe("damagePanelFrame and damagePanelKey: a page's one call", () => {
  const page = (kind: DamageWindowKind | null, screen = false) => ({
    damageWindow: () => (kind ? { kind, report: report() } : null), screenUp: () => screen,
  });
  const hudSpy = () => { const set: unknown[] = []; return { set, setDamagePanel: (p: unknown) => { set.push(p); } }; };

  it("in the window with SELECT held, the binding's press is the panel's: the input and the buttons lose it, the HUD draws it", () => {
    const hud = hudSpy(), down = new Set<PadButton>(['Select', 'R2']);
    const input = { ...noInput(), scoreboard: true, inventory: true };
    const out = damagePanelFrame(hud, page('life'), down, input, false, 'pad');
    expect(out.inventory).toBe(false);
    expect(input.inventory, "the caller's input left whole").toBe(true);
    expect([...down]).toEqual(['Select']);
    expect(hud.set.at(-1)).toEqual({ report: damagePanelRows(report()), hint: damageHintText('toBoard', 'pad') });
  });

  it("without SELECT, or in a live round, the input and the buttons are today's and the HUD has no panel", () => {
    for (const [kind, scoreboard] of [['life', false], [null, true]] as const) {
      const hud = hudSpy(), down = new Set<PadButton>(['R2']);
      const input = { ...noInput(), scoreboard, inventory: true };
      expect(damagePanelFrame(hud, page(kind), down, input, false, 'pad')).toBe(input);
      expect([...down]).toEqual(['R2']);
      expect(hud.set.at(-1)).toBeNull();
    }
  });

  it('SELECT alone in the window: the board, with the hint to the panel', () => {
    const hud = hudSpy();
    damagePanelFrame(hud, page('round'), new Set(), { ...noInput(), scoreboard: true }, false, 'keyboard');
    expect(hud.set.at(-1)).toEqual({ report: null, hint: '[TAB] + [I]  DMG' });
  });

  it('a round screen up: nothing', () => {
    const hud = hudSpy(), input = { ...noInput(), scoreboard: true, inventory: true };
    expect(damagePanelFrame(hud, page('round', true), new Set(), input, false, 'pad')).toBe(input);
    expect(hud.set.at(-1)).toBeNull();
  });

  it('the keyboard: I with Tab held in the window is taken (its repeats too) till let go; I alone is not', () => {
    const hud = hudSpy();
    expect(damagePanelKey(hud, page('round'), 'KeyI', true, false)).toBe(false);
    expect(damagePanelKey(hud, page('round'), 'KeyI', false, false)).toBe(false);
    expect(damagePanelKey(hud, page('round'), 'KeyI', true, true)).toBe(true);
    expect(damagePanelKey(hud, page('round'), 'KeyI', true, true)).toBe(true);           // a repeat
    damagePanelFrame(hud, page('round'), new Set(), { ...noInput(), scoreboard: false }, true, 'keyboard');
    expect(hud.set.at(-1)).toMatchObject({ hint: '[TAB]  SCOREBOARD' });
    expect(damagePanelKey(hud, page('round'), 'KeyI', false, true)).toBe(false);
    expect(damagePanelKey(hud, page('round'), 'KeyX', true, true)).toBe(false);
  });
});

describe("DAMAGE_WINDOW_STAGE_ADAPTATION: the capture spec's stand-in window (a development build only)", () => {
  afterEach(() => { stageDamageWindow(undefined); });

  it("a staged window stands in for the page's; undefined lets go back to the page", () => {
    const set: unknown[] = [], hud = { setDamagePanel: (p: unknown) => { set.push(p); } };
    expect(stageDamageWindow({ kind: 'round', report: report() })).toBe(true);
    damagePanelFrame(hud, null, new Set(), { ...noInput(), scoreboard: true }, false, 'pad');
    expect(set.at(-1)).toEqual({ report: null, hint: damageHintText('toReport', 'pad') });
    expect(damagePanelKey(hud, null, 'KeyI', true, true)).toBe(true);
    damagePanelFrame(hud, null, new Set(), { ...noInput(), scoreboard: true }, false, 'pad');
    expect(set.at(-1)).toEqual({ report: damagePanelRows(report()), hint: damageHintText('toBoard', 'pad') });
    stageDamageWindow(undefined);
    damagePanelKey(hud, null, 'KeyI', false, true);
    damagePanelFrame(hud, null, new Set(), { ...noInput(), scoreboard: true }, false, 'pad');
    expect(set.at(-1)).toBeNull();
  });

  it("a staged post goes to the HUD's own postMessage at the seat's next frame, once", () => {
    const posts: string[] = [];
    const hud = { setDamagePanel: () => undefined, postMessage: (t: string) => { posts.push(t); } };
    expect(stageDamagePost(['FIRST LINE', 'SECOND LINE'])).toBe(true);
    expect(posts).toEqual([]);
    damagePanelFrame(hud, null, new Set(), noInput(), false, 'pad');
    expect(posts).toEqual(['FIRST LINE', 'SECOND LINE']);
    damagePanelFrame(hud, null, new Set(), noInput(), false, 'pad');
    expect(posts).toHaveLength(2);
  });

  it("the stage may name the hint's device (a capture shows the pad's glyphs on a development page)", () => {
    const set: unknown[] = [], hud = { setDamagePanel: (p: unknown) => { set.push(p); } };
    stageDamageWindow({ kind: 'life', report: null }, 'pad');
    damagePanelFrame(hud, null, new Set(), { ...noInput(), scoreboard: true }, false, 'keyboard');
    expect(set.at(-1)).toEqual({ report: null, hint: damageHintText('toReport', 'pad') });
  });
});

describe("the review's F4: the binding is taken only while the board or the panel is drawn", () => {
  afterEach(() => { stageDamageWindow(undefined); });
  /** A HUD whose drawn state says whether the board is up (`Hud.state()`: its `scoreboard` rect) and the START menu. */
  const hudWith = (board: boolean, startMenu = false) => {
    const set: unknown[] = [];
    return {
      set, setDamagePanel: (p: unknown) => { set.push(p); },
      state: () => ({ rects: board ? { scoreboard: { x: 0, y: 0, width: 1, height: 1 } } : {}, model: { startMenu } }),
    };
  };
  const press = (hud: ReturnType<typeof hudWith>) => {
    stageDamageWindow({ kind: 'round', report: report() });
    damagePanelFrame(hud, null, new Set(), { ...noInput(), scoreboard: true }, false, 'pad');
    const down = new Set<PadButton>(['R2']);
    const out = damagePanelFrame(hud, null, down, { ...noInput(), scoreboard: true, inventory: true }, false, 'pad');
    return { out, down };
  };

  it('the board drawn: taken', () => {
    const { out, down } = press(hudWith(true));
    expect(out.inventory).toBe(false);
    expect(down.has('R2')).toBe(false);
  });

  it('the tactical map open (SELECT held, no board drawn): not taken, nothing on the HUD', () => {
    const hud = hudWith(false), { out, down } = press(hud);
    expect(out.inventory).toBe(true);
    expect(down.has('R2')).toBe(true);
    expect(hud.set.at(-1)).toBeNull();
  });

  it('the START menu up: not taken', () => {
    const { out, down } = press(hudWith(true, true));
    expect(out.inventory).toBe(true);
    expect(down.has('R2')).toBe(true);
  });

  it("the keyboard's I likewise: not taken with no board drawn, nor under the START menu", () => {
    stageDamageWindow({ kind: 'round', report: report() });
    expect(damagePanelKey(hudWith(false), null, 'KeyI', true, true)).toBe(false);
    expect(damagePanelKey(hudWith(true, true), null, 'KeyI', true, true)).toBe(false);
  });
});
