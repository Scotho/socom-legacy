import { describe, expect, it } from 'vitest';
import {
  AT_REST, DEFAULT_MODEL, hudLayout, POV_HELP_LINES_SHIFT_ADAPTATION, SEAT_CLAIM_PLACE_ADAPTATION, SPECTATOR_HELP, spectatorHudView,
  type HudModel, type HudQuad, type HudSpectatorView, type HudTiming, type SpectatorHudSource,
} from '../src/hud';

/**
 * SEAT_CLAIM_ADAPTATION (a service adaptation with no original; the owner's word, 2026-11-24; `../src/seatClaim`): the
 * watcher's claim line on the spectator's path -- at the help block's bottom with the player's view's hint, the help
 * lines one pitch higher, in the block's font and colour, at its own alpha (a free seat's breath) whatever the help clock, its button ringed while held, hidden with the
 * block under the Chat menu.
 */

const PS2 = { width: 640, height: 448 };
const SIZES: Record<string, { width: number; height: number }> = {
  'newweapnbkrnd.tif': { width: 128, height: 64 }, 'font_text_01.tif': { width: 512, height: 128 },
  'font_special_01.tif': { width: 256, height: 64 }, white: { width: 1, height: 1 },
};
const H = SPECTATOR_HELP;
const FULL = H.alpha / 128;
const at = (help: number): HudTiming => ({ ...AT_REST, stance: 1, help });
const black = (q: HudQuad): boolean => q.rgba[0] === 0 && q.rgba[1] === 0 && q.rgba[2] === 0;
const quadsOf = (v: HudSpectatorView, help = 1, over: Partial<HudModel> = {}): HudQuad[] =>
  hudLayout(PS2, { ...DEFAULT_MODEL, spectator: v, ...over } as HudModel, SIZES, at(help)).quads;
const onLine = (qs: readonly HudQuad[], baseline: number): HudQuad[] =>
  qs.filter((q) => q.element === 'help' && q.texture !== 'white' && !black(q) && Math.abs(q.y - (baseline - 6)) < 2);
const ring = (qs: readonly HudQuad[]): HudQuad[] => qs.filter((q) => q.element === 'help' && q.texture === 'white');
const LINE = '1 SLOT OPEN   \ue0bd HOLD: JOIN';   // R1's pad glyph, trimmed (SEAT_CLAIM_R1_GLYPH_ADAPTATION)
const AT = 14;
const free = (extra: Partial<HudSpectatorView> = {}, claim: Partial<NonNullable<HudSpectatorView['claim']>> = {}): HudSpectatorView => ({
  path: 'spectator', followed: null, stats: null, povRaise: true, claim: { line: LINE, at: AT, share: 1, ...claim }, ...extra,
});
const BOTTOM = H.y0 + 3 * H.pitch;                               // 434, the player's view's hint's slot
const text = (qs: readonly HudQuad[], baseline: number): HudQuad[] => onLine(qs, baseline).filter((q) => q.texture === 'font_text_01.tif');

describe('SEAT_CLAIM: the claim line on the spectator view', () => {
  it('its place: at the bottom with the hint -- above its slot where the hint can show (416), else in it (434)', () => {
    expect(SEAT_CLAIM_PLACE_ADAPTATION).toEqual({ x: H.x, bottom: BOTTOM, up: H.pitch });
    expect(BOTTOM).toBe(434);
    expect(onLine(quadsOf(free()), 416).length).toBeGreaterThanOrEqual(LINE.replace(/ /g, '').length - 1);
    expect(onLine(quadsOf(free({ povRaise: undefined })), 434).length).toBeGreaterThan(0);
    // without it, 416 is the help's raised line 4 (its own Triangle glyph); with it, the claim's line in its place
    const at416 = (v: HudSpectatorView) => onLine(quadsOf(v), 416).map((q) => Math.round(q.x));
    expect(at416(free())).not.toEqual(at416(free({ claim: undefined })));
  });

  it('the help lines stand one pitch higher again while it is offered (344-398 with the hint, 362-416 without)', () => {
    // line 1's glyphs (its first word's x) move to the baseline above, the whole block with them
    const lineAt = (v: HudSpectatorView, baseline: number) => text(quadsOf(v), baseline).map((q) => q.x).sort((a, b) => a - b);
    const lineOne = lineAt(free({ claim: undefined }), H.y0 - POV_HELP_LINES_SHIFT_ADAPTATION);              // 362: the hint's raise
    expect(lineOne.length).toBeGreaterThan(20);
    expect(lineAt(free(), H.y0 - 2 * H.pitch)).toEqual(lineOne);                                             // 344 with a claim
    expect(lineAt(free({ claim: undefined }), H.y0 - 2 * H.pitch)).toEqual([]);
    expect(lineAt(free({ povRaise: undefined }), H.y0 - H.pitch)).toEqual(lineOne);                          // 362 without the hint
  });

  it('in the block\'s colour at its share of the help\'s alpha, whatever the help clock (still drawn once the help faded)', () => {
    for (const help of [1, 0]) {
      const ink = text(quadsOf(free({}, { share: 0.55 }), help), 416);
      expect(ink.length, `help ${help}`).toBeGreaterThan(0);
      for (const q of ink) expect(q.rgba).toEqual([H.rgb[0] / 128, H.rgb[1] / 128, H.rgb[2] / 128, 0.55 * FULL]);
    }
  });

  it('held: the ring (48 bars) around the R1 glyph, filled by the hold\'s share; none while not held', () => {
    expect(ring(quadsOf(free()))).toEqual([]);
    const segs = ring(quadsOf(free({}, { hold: 0.5 })));
    expect(segs).toHaveLength(48);
    const cx = segs.reduce((a, q) => a + q.x, 0) / segs.length;
    const glyph = onLine(quadsOf(free()), 416).find((q) => q.texture === 'font_special_01.tif');   // R1's, not the help's Cross
    expect(glyph).toBeDefined();
    expect(Math.abs(cx - glyph!.x)).toBeLessThan(2);
  });

  it('hidden with the block under the Chat menu; never on a dead player\'s path', () => {
    expect(onLine(quadsOf(free(), 1, { commandMenu: true }), 416)).toEqual([]);
    expect(onLine(quadsOf(free({ path: 'own', help: ['', '', '', '', '', ''] })), 416)).toEqual([]);
  });

  it('spectatorHudView carries the page\'s claim on the spectator\'s cameras, for its device; none from a player', () => {
    const asked: string[] = [];
    const page = (role: 'spectator' | 'player'): SpectatorHudSource => ({
      client: { role, healthOf: () => 1 } as unknown as SpectatorHudSource['client'],
      spectator: { mode: 'free', target: null, scenic: 0, watching: null, benched: false },
      rows: [], nameOf: (id) => `P${id}`,
      seatClaimView: (device) => { asked.push(device); return { line: LINE, at: AT, share: 1 }; },
    });
    const walk = { mode: () => 'fly', isDead: () => false };
    expect(spectatorHudView(page('spectator'), walk, undefined, 'keyboard')?.claim).toEqual({ line: LINE, at: AT, share: 1 });
    expect(spectatorHudView(page('spectator'), walk, undefined, 'touch')?.claim).toBeDefined();
    expect(asked).toEqual(['keyboard', 'pad']);
    expect(spectatorHudView(page('player'), walk)?.claim).toBeUndefined();
    // LATER 1604: the page's claim device (`seatClaimDeviceOf`) when it names one -- a page with no pad asks 'none'
    asked.length = 0;
    spectatorHudView(page('spectator'), walk, undefined, 'pad', undefined, 'none');
    spectatorHudView(page('spectator'), walk, undefined, 'pad', undefined, 'keyboard');
    spectatorHudView(page('spectator'), walk, undefined, 'touch', undefined, 'pad');
    expect(asked).toEqual(['none', 'keyboard', 'pad']);
  });

  it('LATER 1604: the no-pad line (no button) is drawn whole inside the frame, with no ring', () => {
    const NONE = 'GAME FULL   CONTROLLER NEEDED TO JOIN QUEUE';
    const qs = quadsOf(free({}, { line: NONE, at: -1 }));
    const ink = onLine(qs, 416);
    expect(ink.length).toBeGreaterThanOrEqual(NONE.replace(/ /g, '').length - 1);
    for (const q of ink) expect(q.x >= 0 && q.x + q.w <= PS2.width, `glyph at ${q.x}`).toBe(true);
    expect(ring(qs)).toEqual([]);
  });
});
