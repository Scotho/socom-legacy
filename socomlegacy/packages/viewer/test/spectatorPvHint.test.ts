import { describe, expect, it } from 'vitest';
import { PERSONA_NAME_MAX } from '@s2u/card';
import { noInput, type Input } from '../src/gamepad';
import {
  AT_REST, DEFAULT_MODEL, helpAlpha, HUD_COLOURS, HUD_LAYOUT, hudLayout, POV_HELP_LINES_SHIFT_ADAPTATION, POV_HELP_OFFERED_ADAPTATION,
  POV_HELP_PLACE_ADAPTATION, POV_HELP_SHOWN_ADAPTATION, POV_HINT_DIM_S_ADAPTATION, POV_HINT_DIM_SHARE_ADAPTATION, POV_HINT_RING_ADAPTATION,
  POV_HINT_RING_TRACK_SHARE_ADAPTATION,
  SPECTATOR_HELP, SPECTATOR_INFO_LAYOUT, spectatorHudView, TEXT_LINE_LAYOUT,
  type HudModel, type HudQuad, type HudSpectatorView, type HudTiming, type SpectatorHudSource,
} from '../src/hud';
import { layoutText, textWidth } from '../src/hudFont';
import { POV_HOLD_S_ADAPTATION, SpectatorView, type SpectatorBody, type SpectatorHost } from '../src/spectatorView';

/**
 * WM-PV-HINT (the weekend mega sprint's UI lane; product track, a BROWSER ADAPTATION with no original). The owner's ruling
 * (it supersedes option 4D): "align it along the bottom and bump the you are a spectator text up which will go away on its
 * own. make it semi transparent for a second after swapping views. do a nice circular selection progress bar around the
 * duration of the animation." The controller's reading: the hint is the help block's bottom line (line 4's slot,
 * baseline 434) and stays -- "<Cross> HOLD: VIEW", in the view "<Cross> HOLD: EXIT" -- the help lines move up one pitch
 * above it and still fade on their clock; for one second after a swap the hint is drawn at half its alpha; while Cross is
 * held a ring of the hold bar's colours fills around the Cross glyph over the hold (POV_HOLD_S_ADAPTATION, 0.4 s).
 */

type Pov = NonNullable<HudSpectatorView['pov']>;
type Box = [number, number, number, number];   // x0, y0, x1, y1
const PS2 = { width: 640, height: 448 };
const SIZES: Record<string, { width: number; height: number }> = {
  'newweapnbkrnd.tif': { width: 128, height: 64 }, 'font_text_01.tif': { width: 512, height: 128 },
  'font_special_01.tif': { width: 256, height: 64 }, white: { width: 1, height: 1 },
};
const H = SPECTATOR_HELP;
const TOL = 0.5;        // px, on the line's extents as the font lays it out
const DRAWN_TOL = 0.6;  // px, on the drawn quads: each glyph's quad starts 0.6 px left of its pen (the font's bearing)
const BOTTOM = H.y0 + 3 * H.pitch;   // 434, the block's line 4
const at = (help: number): HudTiming => ({ ...AT_REST, stance: 1, help });
const view = (pov: Pov | null, extra: Partial<HudSpectatorView> = {}, name = 'Echo'): HudSpectatorView => ({
  followed: { name, health: 1 }, stats: { kills: 4, deaths: 4, headshots: null, score: 9 }, ...(pov ? { pov } : {}), ...extra,
});
const quadsOf = (v: HudSpectatorView, help = 1, over: Partial<HudModel> = {}): HudQuad[] =>
  hudLayout(PS2, { ...DEFAULT_MODEL, spectator: v, ...over } as HudModel, SIZES, at(help)).quads;
const black = (q: HudQuad): boolean => q.rgba[0] === 0 && q.rgba[1] === 0 && q.rgba[2] === 0;
const boxOf = (q: HudQuad): Box => [q.x - q.w / 2, q.y - q.h / 2, q.x + q.w / 2, q.y + q.h / 2];
const union = (bs: readonly Box[]): Box => [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))];
const meets = (a: Box, b: Box): boolean => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const rect = (r: { x: number; y: number; w: number; h: number }): Box => [r.x, r.y, r.x + r.w, r.y + r.h];
const near = (a: Box, b: Box, tol = TOL): void => a.forEach((v, i) => expect(Math.abs(v - b[i]!), `edge ${i}: ${v} vs ${b[i]}`).toBeLessThanOrEqual(tol + 1e-9));
/** A centred 0.9 help line's box with the special read: the glyph cell about its baseline. */
const lineBox = (text: string, baseline: number): Box => {
  const w = textWidth(text, H.scale, { special: true }), g = layoutText('H', 0, baseline, H.scale).glyphs[0]!;
  return [H.x - w / 2, g.y, H.x + w / 2, g.y + g.h];
};
/** The glyph quads (no shadow, no ring) whose centre lies on a 0.9 line at `baseline` (centre = baseline - 6). */
const onLine = (qs: readonly HudQuad[], baseline: number): HudQuad[] =>
  qs.filter((q) => q.element === 'help' && q.texture !== 'white' && !black(q) && Math.abs(q.y - (baseline - 6)) < 2);
const ring = (qs: readonly HudQuad[]): HudQuad[] => qs.filter((q) => q.element === 'help' && q.texture === 'white');
const WORDS: Record<Pov, string> = { offered: '¦ HOLD: VIEW', shown: '¦ HOLD: EXIT', waiting: '¦ HOLD: EXIT' };
const ACCEPT_X: Record<Pov, [number, number]> = { offered: [273, 375], shown: [276.5, 371.5], waiting: [276.5, 371.5] };
const STATES: readonly Pov[] = ['offered', 'shown', 'waiting'];
const FULL = H.alpha / 128;

describe('WM-PV-HINT: the hint is the help block\'s bottom line, and stays', () => {
  it('its words: the Cross glyph (the block\'s own line 3\'s) then HOLD: VIEW; in the view HOLD: EXIT', () => {
    expect(H.lines[2]).toContain('¦');
    expect(POV_HELP_OFFERED_ADAPTATION).toBe('¦ HOLD: VIEW');
    expect(POV_HELP_SHOWN_ADAPTATION).toBe('¦ HOLD: EXIT');
  });

  it('its place: line 4\'s slot (baseline 380 + 3 x 18 = 434), centred on x 324; the help lines move up one pitch (18)', () => {
    expect(POV_HELP_PLACE_ADAPTATION).toEqual({ x: H.x, y: H.y0 + 3 * H.pitch });
    expect(POV_HELP_PLACE_ADAPTATION).toEqual({ x: 324, y: 434 });
    expect(POV_HELP_LINES_SHIFT_ADAPTATION).toBe(H.pitch);
  });

  for (const pov of STATES) {
    it(`${pov}: at the bottom slot with its extents (x as before, y 417.5-438.5), in the block's colour, at full alpha`, () => {
      const ink = onLine(quadsOf(view(pov)), BOTTOM);
      expect(ink.length).toBeGreaterThanOrEqual(WORDS[pov].replace(/ /g, '').length);
      const want: Box = [ACCEPT_X[pov][0], 417.5, ACCEPT_X[pov][1], 438.5];
      near(lineBox(WORDS[pov], BOTTOM), want);
      near(union(ink.filter((q) => q.texture === 'font_text_01.tif').concat(ink.filter((q) => q.texture !== 'font_text_01.tif')).map(boxOf)), want, DRAWN_TOL);
      for (const q of ink.filter((x) => x.texture === 'font_text_01.tif')) expect(q.rgba).toEqual([H.rgb[0] / 128, H.rgb[1] / 128, H.rgb[2] / 128, FULL]);
    });

    it(`${pov}: the help text sits one pitch higher above it (362, 380, 398, 416) and still fades on its clock`, () => {
      const without = quadsOf(view(null)), withPov = quadsOf(view(pov));
      H.lines.forEach((line, i) => {
        const before = onLine(without, H.y0 + i * H.pitch), after = onLine(withPov, H.y0 + i * H.pitch - H.pitch);
        expect(after.length, line).toBe(before.length);
        after.forEach((q, j) => { expect(q.x).toBeCloseTo(before[j]!.x, 9); expect(q.y).toBeCloseTo(before[j]!.y - H.pitch, 9); });
      });
      for (const help of [1, 0.5, 0.25]) {
        const qs = quadsOf(view(pov), help);
        const first = onLine(qs, H.y0 - H.pitch).filter((q) => q.texture === 'font_text_01.tif');
        expect(first[0]!.rgba[3], `line 1 at ${help}`).toBeCloseTo(help * FULL, 12);
      }
      expect(onLine(quadsOf(view(pov), 0), H.y0 - H.pitch)).toEqual([]);
    });

    it(`${pov}: when the help has faded the hint has not moved, nor changed (no jump, no hole); present at t = 0, 10 and 60 s`, () => {
      const hint = (help: number) => quadsOf(view(pov), help).filter((q) => q.element === 'help' && Math.abs(q.y - (BOTTOM - 6)) < 4);
      const lit = hint(1);
      expect(lit.length).toBeGreaterThan(0);
      expect(hint(0.5)).toEqual(lit);
      expect(hint(0)).toEqual(lit);
      for (const t of [0, 10, 60]) {
        const qs = quadsOf(view(pov), helpAlpha(t));
        expect(onLine(qs, BOTTOM).filter((q) => q.texture === 'font_text_01.tif').every((q) => q.rgba[3] === FULL), `t ${t}`).toBe(true);
        expect(onLine(qs, BOTTOM).length, `t ${t}`).toBeGreaterThan(0);
      }
      expect(helpAlpha(60)).toBe(0);
      expect(quadsOf(view(pov), helpAlpha(60)).filter((q) => q.element === 'help' && q.y < BOTTOM - 20)).toEqual([]);   // the help gone
    });
  }

  it("a dead watcher's block (three lines, line 4 blank) is not moved: the hint takes the blank slot", () => {
    const lines = ['You have died.  Use the £ and ¯', 'directional buttons to cycle through', 'living teammates.', ' ', ' ', ' '];
    const dead = (pov: Pov | null): HudSpectatorView => ({ path: 'teammate', followed: { name: 'BRAVO', health: null }, stats: null, help: lines, ...(pov ? { pov } : {}) });
    const without = quadsOf(dead(null)), withPov = quadsOf(dead('offered'));
    for (let i = 0; i < 3; i++) expect(onLine(withPov, H.y0 + i * H.pitch)).toEqual(onLine(without, H.y0 + i * H.pitch));
    expect(onLine(withPov, BOTTOM).length).toBeGreaterThan(0);
  });

  it('the help text, the hint and the ring meet none of the disc-drawn boxes; the numbers', () => {
    const S = SPECTATOR_INFO_LAYOUT, I = HUD_LAYOUT.info;
    const DISC: [string, Box][] = [['stats panel', rect(S.stats)], ['name bar', rect(S.title)], ['info bar', rect(I.bar)], ['info box', rect(I.box)]];
    expect(DISC.map((d) => d[1])).toEqual([[10, 326, 174, 410], [10, 410, 174, 438], [488, 396, 622, 414], [488, 418, 622, 438]]);
    for (const pov of STATES) {
      const qs = quadsOf(view(pov, { povHold: 0.5 }));
      const help = qs.filter((q) => q.element === 'help');
      for (const q of help) for (const [name, d] of DISC) expect(meets(boxOf(q), d), `${pov} ${q.texture} at ${q.x},${q.y} meets the ${name}`).toBe(false);
      // The bumped lines' boxes as the font lays them out: line 1 x 187.4-460.4 at y 345.5-366.5 ... line 4 at 399.5-420.5.
      H.lines.forEach((l, i) => { for (const [name, d] of DISC) expect(meets(lineBox(l, H.y0 + (i - 1) * H.pitch), d), `line ${i + 1} meets the ${name}`).toBe(false); });
      for (const q of help) { const b = boxOf(q); expect(b[3]).toBeLessThanOrEqual(PS2.height); expect(b[1]).toBeGreaterThanOrEqual(0); }
    }
    expect(lineBox(H.lines[0]!, H.y0 - H.pitch).map((v) => Math.round(v * 10) / 10)).toEqual([188, 345.5, 460, 366.5]);
    // The round's text line (y 338-360, up only while a line is typed) now crosses the bumped line 1's cell by 14.5 px.
    expect(TEXT_LINE_LAYOUT.box.y + TEXT_LINE_LAYOUT.box.h - lineBox(H.lines[0]!, H.y0 - H.pitch)[1]).toBeCloseTo(14.5, 9);
  });
});

describe('WM-PV-HINT: half alpha for one second after a swap', () => {
  it('the constants: 1 s, half (the spectator stats panel\'s 64 of 128)', () => {
    expect(POV_HINT_DIM_S_ADAPTATION).toBe(1);
    expect(POV_HINT_DIM_SHARE_ADAPTATION).toBe(0.5);
    expect(POV_HINT_DIM_SHARE_ADAPTATION).toBe(SPECTATOR_INFO_LAYOUT.stats.alpha / 128);
  });

  for (const pov of STATES) {
    it(`${pov}: povSince 0, 0.5, 0.99 -- half; past 1 s or none -- full`, () => {
      const alphaAt = (extra: Partial<HudSpectatorView>) => onLine(quadsOf(view(pov, extra)), BOTTOM).filter((q) => q.texture === 'font_text_01.tif')[0]!.rgba[3];
      for (const since of [0, 0.5, 0.99]) expect(alphaAt({ povSince: since })).toBeCloseTo(FULL * 0.5, 12);
      for (const since of [1, 5]) expect(alphaAt({ povSince: since })).toBeCloseTo(FULL, 12);
      expect(alphaAt({})).toBeCloseTo(FULL, 12);
    });
  }

  it("spectatorHudView carries the swap's seconds only inside the second, on the follow and the watch", () => {
    const src = (s: Partial<SpectatorHudSource['spectator']>, role = 'spectator'): SpectatorHudSource => ({
      client: { role, bodies: () => [{ id: 2, flags: 64 }, { id: 3, flags: 64 }] },
      spectator: { mode: 'follow', target: 2, scenic: 0, watching: null, benched: false, ...s },
      rows: [{ id: 2, kills: 0, deaths: 0, score: 0 }], nameOf: () => 'BRAVO',
    });
    const fly = { mode: () => 'fly', isDead: () => false }, dead = { mode: () => 'walk', isDead: () => true };
    expect(spectatorHudView(src({ pov: true, povShown: true, povSince: 0.25 }), fly)!.povSince).toBe(0.25);
    expect('povSince' in spectatorHudView(src({ pov: true, povShown: true, povSince: 1 }), fly)!).toBe(false);
    expect('povSince' in spectatorHudView(src({ pov: false, povSince: Infinity }), fly)!).toBe(false);
    expect(spectatorHudView(src({ watching: 3, benched: true, pov: false, povSince: 0.5 }, 'player'), dead)!.povSince).toBe(0.5);
  });

  it("SpectatorView counts the seconds from the hold's swap, both ways (visual only: the next hold is not refused)", () => {
    const r = rig();
    expect(r.view.povSince).toBe(Infinity);
    r.hold(POV_HOLD_S_ADAPTATION + 0.1);
    expect(r.view.pov).toBe(true);
    expect(r.view.povSince).toBeLessThan(POV_HINT_DIM_S_ADAPTATION);
    r.step({}, 0.5);
    r.step({}, 0.6);
    expect(r.view.povSince).toBeGreaterThanOrEqual(POV_HINT_DIM_S_ADAPTATION);
    r.hold(POV_HOLD_S_ADAPTATION + 0.1);   // straight back out: the hold is not locked by the dim
    expect(r.view.pov).toBe(false);
    expect(r.view.povSince).toBeLessThan(POV_HINT_DIM_S_ADAPTATION);
    r.view.setPov(true);                    // the strip's swap counts too
    expect(r.view.povSince).toBe(0);
  });
});

describe('WM-PV-HINT: the ring fills around the Cross glyph while Cross is held', () => {
  /** The fill's colour (the hold bar's fill) and the track's (the hint's own colour at its share), at the hint's alpha `a`. */
  const FILL = (a = FULL): number[] => [HUD_COLOURS.holdFill[0], HUD_COLOURS.holdFill[1], HUD_COLOURS.holdFill[2], a];
  const TRACK = (a = FULL): number[] => [H.rgb[0] / 128, H.rgb[1] / 128, H.rgb[2] / 128, a * POV_HINT_RING_TRACK_SHARE_ADAPTATION];
  const isFill = (q: HudQuad, a = FULL): boolean => q.rgba.every((c, i) => Math.abs(c - FILL(a)[i]!) < 1e-12);
  const isTrack = (q: HudQuad, a = FULL): boolean => q.rgba.every((c, i) => Math.abs(c - TRACK(a)[i]!) < 1e-12);

  it('its geometry: radius 10 (the review\'s F2: 11 met line 4), weight 1.5, 48 tangent segments, each its whole arc (an arc, not dots)', () => {
    expect(POV_HINT_RING_ADAPTATION).toMatchObject({ radius: 10, thickness: 1.5, segments: 48, arc: 1 });
    const segs = ring(quadsOf(view('offered', { povHold: 0.5 })));
    expect(segs).toHaveLength(48);
    for (const q of segs) { expect(q.h).toBe(1.5); expect(q.w).toBeCloseTo(2 * Math.PI * 10 / 48, 12); }
  });

  it('the empty track in the hint\'s own colour at 0.35 of its alpha (between 0.3 and 0.4); the fill the hold bar\'s, at the hint\'s alpha', () => {
    expect(POV_HINT_RING_TRACK_SHARE_ADAPTATION).toBe(0.35);
    const segs = ring(quadsOf(view('offered', { povHold: 0.5 })));
    expect(segs.filter((q) => isFill(q))).toHaveLength(24);
    expect(segs.filter((q) => isTrack(q))).toHaveLength(24);
    expect(FILL()).toEqual([...HUD_COLOURS.holdFill]);   // at full the fill is the hold bar's own (alpha 100 of 128)
  });

  for (const pov of STATES) {
    it(`${pov}: the whole ring at the hint's alpha -- half during the 1 s dim, full after`, () => {
      const hintA = (extra: Partial<HudSpectatorView>) => onLine(quadsOf(view(pov, extra)), BOTTOM).filter((q) => q.texture === 'font_text_01.tif')[0]!.rgba[3];
      for (const [extra, a] of [[{ povSince: 0.2 }, FULL / 2], [{ povSince: 1 }, FULL], [{}, FULL]] as const) {
        expect(hintA(extra)).toBeCloseTo(a, 12);
        const segs = ring(quadsOf(view(pov, { povHold: 0.5, ...extra })));
        expect(segs.filter((q) => isFill(q, a)), JSON.stringify(extra)).toHaveLength(24);
        expect(segs.filter((q) => isTrack(q, a)), JSON.stringify(extra)).toHaveLength(24);
      }
    });

    it(`${pov}: absent -- no ring; 0, 0.5, 1 -- 48 segments around the glyph, 0, 24, 48 of them filled`, () => {
      expect(ring(quadsOf(view(pov)))).toEqual([]);
      const glyphQ = onLine(quadsOf(view(pov)), BOTTOM).find((q) => q.texture === 'font_special_01.tif')!;
      const g = layoutText(WORDS[pov], 324 - textWidth(WORDS[pov], H.scale, { special: true }) / 2, BOTTOM, H.scale, { special: true }).glyphs[0]!;
      const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
      expect(glyphQ.x).toBeCloseTo(cx, 9);
      for (const [f, filled] of [[0, 0], [0.5, 24], [1, 48]] as const) {
        const segs = ring(quadsOf(view(pov, { povHold: f })));
        expect(segs).toHaveLength(48);
        for (const q of segs) {
          expect(Math.hypot(q.x - cx, q.y - cy)).toBeCloseTo(10, 9);
          expect(q.h).toBe(1.5);
        }
        expect(segs.filter((q) => isFill(q))).toHaveLength(filled);
        expect(segs.filter((q) => isTrack(q))).toHaveLength(48 - filled);
      }
      // Clockwise from twelve o'clock: at a quarter the first twelve, the top right.
      const quarter = ring(quadsOf(view(pov, { povHold: 0.25 }))).filter((q) => isFill(q));
      expect(quarter).toHaveLength(12);
      for (const q of quarter) { expect(q.x).toBeGreaterThan(cx); expect(q.y).toBeLessThan(cy); }
      // Hidden with the block: the Chat menu.
      expect(ring(quadsOf(view(pov, { povHold: 0.5 }), 1, { commandMenu: true }))).toEqual([]);
    });
  }

  it("SpectatorView's hold: none idle; 0 at the press; its share as it runs; 1 at the swap until the release; gone on an early release", () => {
    const r = rig();
    expect(r.view.povHold).toBeNull();
    r.step({ action: true }, 0.1);           // the press's sample
    expect(r.view.povHold).toBe(0);
    r.step({ action: true }, 0.1);
    expect(r.view.povHold).toBeCloseTo(0.1 / POV_HOLD_S_ADAPTATION, 9);
    r.step({ action: true }, 0.1);
    expect(r.view.povHold).toBeCloseTo(0.2 / POV_HOLD_S_ADAPTATION, 9);
    r.step({}, 0.1);                          // released early: the ring vanishes, no swap -- the release is today's X
    expect(r.view.povHold).toBeNull();
    expect(r.view.mode).toBe('free');         // (follow -> free, FUN_00295260), as with no hold at all
    r.step({ action: true }, 0.1); r.step({}, 0.1);   // a short X back to the follow
    expect([r.view.mode, r.view.pov]).toEqual(['follow', false]);
    r.step({ action: true }, 0.1);
    for (let i = 0; i < 4; i++) r.step({ action: true }, 0.1);   // 0.4 s: the swap
    expect(r.view.pov).toBe(true);
    expect(r.view.povHold).toBe(1);
    r.step({ action: true }, 0.1);
    expect(r.view.povHold).toBe(1);
    r.step({}, 0.1);
    expect(r.view.povHold).toBeNull();
  });

  it('spectatorHudView carries the share on the follow and the watch; none idle', () => {
    const src = (s: Partial<SpectatorHudSource['spectator']>, role = 'spectator'): SpectatorHudSource => ({
      client: { role, bodies: () => [{ id: 2, flags: 64 }, { id: 3, flags: 64 }] },
      spectator: { mode: 'follow', target: 2, scenic: 0, watching: null, benched: false, ...s },
      rows: [{ id: 2, kills: 0, deaths: 0, score: 0 }], nameOf: () => 'BRAVO',
    });
    const fly = { mode: () => 'fly', isDead: () => false }, dead = { mode: () => 'walk', isDead: () => true };
    expect(spectatorHudView(src({ pov: false, povHold: 0.5 }), fly)!.povHold).toBe(0.5);
    expect('povHold' in spectatorHudView(src({ pov: false, povHold: null }), fly)!).toBe(false);
    expect(spectatorHudView(src({ watching: 3, benched: true, pov: true, povShown: true, povHold: 1 }, 'player'), dead)!.povHold).toBe(1);
  });
});

describe('WM-PV-HINT F2: the ring at radius 10 -- its extents, and where it stands against the raised line 4', () => {
  /** A turned bar's box: its centre +- the half extents of a w x h rectangle turned by `turn`. */
  const turnedBox = (q: HudQuad): Box => {
    const ex = Math.abs(q.w / 2 * Math.cos(q.turn)) + Math.abs(q.h / 2 * Math.sin(q.turn));
    const ey = Math.abs(q.w / 2 * Math.sin(q.turn)) + Math.abs(q.h / 2 * Math.cos(q.turn));
    return [q.x - ex, q.y - ey, q.x + ex, q.y + ey];
  };
  const WANT: Record<'offered' | 'shown', Box> = { offered: [271.56, 416.64, 293.09, 438.18], shown: [275.06, 416.64, 296.59, 438.18] };
  for (const pov of ['offered', 'shown'] as const) {
    it(`${pov}: the ring's box (+-0.01 px), inside the frame, meeting no disc box; its top under line 4's baseline (416)`, () => {
      const qs = quadsOf(view(pov, { povHold: 0.5 }));
      const box = union(ring(qs).map(turnedBox));
      near(box, WANT[pov], 0.01);
      const S = SPECTATOR_INFO_LAYOUT, I = HUD_LAYOUT.info;
      for (const d of [rect(S.stats), rect(S.title), rect(I.bar), rect(I.box)]) for (const q of ring(qs)) expect(meets(turnedBox(q), d)).toBe(false);
      expect(box[3]).toBeLessThanOrEqual(PS2.height);
      // Line 4 raised to baseline 416: its letters stand on the baseline, so the ring's top (416.64) is under every letter's
      // body; it still reaches the glyph cells' band below the baseline (to 420.5, the shadow's to 421.4) -- no radius
      // around the Cross glyph (its centre at 427.41) clears that band, which the hint's own cell meets by the block's 3 px.
      expect(box[1]).toBeGreaterThan(BOTTOM - H.pitch);
      expect(box[1]).toBeLessThan(lineBox('H', BOTTOM - H.pitch)[3]);
    });
  }
});

describe('WM-PV-HINT F1: the help block stays raised for the help\'s whole life where the view is offered', () => {
  /** The lit help lines' glyph rows (y of each line's first glyph quad), the hint's row and the ring left out. */
  const lineRows = (qs: readonly HudQuad[], below = BOTTOM - 12): number[] =>
    [...new Set(qs.filter((q) => q.element === 'help' && q.texture === 'font_text_01.tif' && !black(q) && q.y < below).map((q) => Math.round(q.y * 100) / 100))].sort((a, b) => a - b);
  const sourceOf = (v: SpectatorView): SpectatorHudSource => ({
    client: { role: 'spectator', bodies: () => [{ id: 3, flags: 64 }, { id: 5, flags: 64 }] },
    spectator: v, rows: [{ id: 3, kills: 0, deaths: 0, score: 0 }], nameOf: () => 'BRAVO',
  });
  const fly = { mode: () => 'fly', isDead: () => false };
  const drawnOf = (v: SpectatorView, help = 1): HudQuad[] => quadsOf(spectatorHudView(sourceOf(v), fly)!, help);
  const RAISED = [356, 374, 392, 410], TODAY = [374, 392, 410, 428];   // glyph centres: baselines 362-416, 380-434

  it('SpectatorView.povOffered: the page offers the view (`SpectatorHost.povCarried` not false)', () => {
    expect(rig().view.povOffered).toBe(true);
    expect(rig(false).view.povOffered).toBe(false);
  });

  it('an X tap in the first 10 s (follow -> free camera, the hint gone) leaves every lit help line at the same y; and back', () => {
    const r = rig();
    const follow = lineRows(drawnOf(r.view));
    expect(follow).toEqual(RAISED);
    r.step({ action: true }); r.step();           // a short X: free camera, no hint
    expect(r.view.mode).toBe('free');
    const free = drawnOf(r.view);
    expect(onLine(free, BOTTOM)).toEqual([]);      // the hint is not drawn in free
    expect(lineRows(free)).toEqual(follow);        // the lines did not move
    r.step({ action: true }); r.step();           // back to the follow
    expect(lineRows(drawnOf(r.view))).toEqual(follow);
    for (const help of [1, 0.5]) expect(lineRows(drawnOf(r.view, help))).toEqual(follow);
    expect(drawnOf(r.view, 0).filter((q) => q.element === 'help' && q.y < BOTTOM - 12)).toEqual([]);   // faded: nothing drawn
  });

  it('the scenic camera keeps the block raised too where the view is offered', () => {
    const v: HudSpectatorView = { path: 'spectator', followed: null, stats: null, title: 'SEAL Base', povRaise: true };
    expect(lineRows(quadsOf(v))).toEqual(RAISED);
  });

  it("a page that does not offer the view keeps today's layout in every camera (no hint can show)", () => {
    const r = rig(false);   // (no hint here: every row below 448 is a help line)
    expect(lineRows(drawnOf(r.view), PS2.height)).toEqual(TODAY);
    r.step({ action: true }); r.step();
    expect(lineRows(drawnOf(r.view), PS2.height)).toEqual(TODAY);
  });

  it("spectatorHudView: povRaise on the spectator's every camera and a benched watcher's watch where offered; not on 'own'", () => {
    const src = (s: Partial<SpectatorHudSource['spectator']>, role = 'spectator'): SpectatorHudSource => ({
      client: { role, bodies: () => [{ id: 2, flags: 64 }, { id: 3, flags: 64 }] },
      spectator: { mode: 'free', target: null, scenic: 0, watching: null, benched: false, ...s },
      rows: [{ id: 2, kills: 0, deaths: 0, score: 0 }], nameOf: () => 'BRAVO',
    });
    const dead = { mode: () => 'walk', isDead: () => true };
    expect(spectatorHudView(src({ povOffered: true, pov: false }), fly)!.povRaise).toBe(true);
    expect(spectatorHudView(src({ mode: 'follow', target: 2, povOffered: true, pov: false }), fly)!.povRaise).toBe(true);
    expect(spectatorHudView(src({ mode: 'scenic', povOffered: true }), fly)!.povRaise).toBe(true);
    expect('povRaise' in spectatorHudView(src({ mode: 'follow', target: 2, povOffered: false }), fly)!).toBe(false);
    expect('povRaise' in spectatorHudView(src({ mode: 'follow', target: 2 }), fly)!).toBe(false);   // a stand-in without it
    expect(spectatorHudView(src({ watching: 3, benched: true, povOffered: true, pov: false }, 'player'), dead)!.povRaise).toBe(true);
    expect('povRaise' in spectatorHudView(src({ benched: true, povOffered: true }, 'player'), dead)!).toBe(false);   // 'own'
  });

  it("'own' with a stray povRaise keeps today's lines (no hint on 'own')", () => {
    const lines = ['You are a ghost.  You will play the next', 'round as a real player.  Use the £ and', '¯ directional buttons to cycle through', 'living teammates.', ' ', ' '];
    const own = (raise: boolean): HudSpectatorView => ({ path: 'own', followed: null, stats: null, help: lines, ...(raise ? { povRaise: true as const } : {}) });
    expect(quadsOf(own(true))).toEqual(quadsOf(own(false)));
  });
});

describe("WM-PV-HINT: the watched player's name is never cut, in both states", () => {
  const titleGlyphs = (qs: readonly HudQuad[]): HudQuad[] =>
    qs.filter((q) => q.element === 'spectatorInfo' && q.texture === 'font_text_01.tif' && !black(q) && q.y > 410);
  for (const n of [PERSONA_NAME_MAX, 31, 32]) {
    it(`a ${n}-character name (${n === PERSONA_NAME_MAX ? "the lobby's longest, packages/card/src/persona.ts:35" : "the server's"}) is drawn whole at 640 wide, the hint beside it`, () => {
      const name = 'W'.repeat(n), plain = titleGlyphs(quadsOf(view(null, {}, name)));
      expect(plain).toHaveLength(n);
      for (const pov of ['offered', 'shown'] as const) {
        const qs = quadsOf(view(pov, {}, name));
        expect(titleGlyphs(qs)).toEqual(plain);   // every letter, today's draw, no cut, no ellipsis
        expect(onLine(qs, BOTTOM).length).toBeGreaterThan(0);
      }
    });
  }

  it("today's overrun is kept: a 14 x W name ends at x 188, past the name bar's right edge 174", () => {
    expect(SPECTATOR_INFO_LAYOUT.titleText.x + textWidth('W'.repeat(PERSONA_NAME_MAX), 0.9)).toBe(188);
    expect(SPECTATOR_INFO_LAYOUT.title.x + SPECTATOR_INFO_LAYOUT.title.w).toBe(174);
  });
});

/** A spectator following body 3, the page's order (`frame` then `pad`, as `spectatorPov.test.ts`'s rig). */
function rig(offered = true) {
  const bodies: SpectatorBody[] = [{ id: 3, feet: [0, 0, 0], yaw: 0, flags: 64 }, { id: 5, feet: [10, 0, 0], yaw: 0, flags: 64 }];
  const host: SpectatorHost & { pov: () => boolean } = {
    bodies: () => bodies,
    seat: () => ({ role: 'spectator', self: null, team: null, teams: new Map(), rules: 'classic', ghost: false }),
    spectate: () => {}, follow: () => {}, resetFollow: () => {}, leaveSelf: () => {}, returnSelf: () => {}, views: () => [], magnify: () => {},
    pov: () => true,
    ...(offered ? {} : { povCarried: () => false }),
  };
  const view = new SpectatorView(host);
  const EYE = { position: [0, 0, 0], forward: [0, 0, -1], far: 1000 } as const;
  const step = (held: Partial<Input> = {}, dt = 0.1): void => { view.frame(EYE, dt); view.pad({ ...noInput(), ...held }); };
  const hold = (seconds: number): void => { step({ action: true }); for (let t = 0; t + 1e-9 < seconds; t += 0.1) step({ action: true }); step(); };
  step({ leanRight: true }); step();
  expect([view.mode, view.target]).toEqual(['follow', 3]);
  return { view, step, hold };
}
