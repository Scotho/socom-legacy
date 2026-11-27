import { describe, expect, it } from 'vitest';
import {
  AT_REST, DEFAULT_MODEL, hudLayout, POV_HELP_PLACE_ADAPTATION, povHelpAlpha, SPECTATOR_HELP, spectatorHudView,
  type HudModel, type HudSpectatorView, type HudTiming, type SpectatorHudSource,
} from '../src/hud';
import {
  HELP_LINES_SPLIT_Y, HUD_FRAME_HEIGHT, POV_LINE_SPLIT_Y, povLineLit, readOf, spectatorHudFindings, type SpectatorHudRead, type SpectatorHudStep,
} from '../e2e/spectatorHudSet';

/**
 * PV-9 item 4 (PV-6h's review, finding 2; the plan 2026-11-11-players-view, PV-9; product track, a browser test's check,
 * no game value): `e2e/spectatorHudSet.ts` judged the `'help'` element whole "drawn past its clock", so the player's view's
 * line -- drawn while the view is on whatever the help clock says (`POV_HELP_SHOWN_ADAPTATION` at the lines' alpha,
 * 'waiting' at half; `../src/hud` `povHelpAlpha`) -- would read as the original lines drawn late. The read now carries the
 * view's state (`pov`) and, where the page gives its frame, the help element's band in the HUD's own units, so the
 * original lines are judged on their clock and the view's line by itself. The existing specs (`spectatorHud.spec.ts`,
 * `spectatorHudMenu.spec.ts`) never turn the view on and give no frame: their judgement is shown unchanged below, on every
 * step and both clocks. WM-PV-HINT (the owner's ruling of 2026-11-15, a browser adaptation): the line is now the
 * block's bottom line (line 4's slot, baseline 434) and stays up in every state whatever the clock, the lines moved up
 * above it; so the band splits twice -- the lines drawn while it reaches above `HELP_LINES_SPLIT_Y` (408.5), the line
 * while it reaches below `POV_LINE_SPLIT_Y` (429.5).
 */

const PS2 = { width: 640, height: 448 };
const WIDE = { width: 960, height: 540 };
/** The bitmaps' sizes (`spectatorHudSet.test.ts`'s): enough for the help lines' glyphs and the panels around them. */
const SIZES: Record<string, { width: number; height: number }> = {
  'newweapnbkrnd.tif': { width: 128, height: 64 }, 'm4carbine_icon.tif': { width: 128, height: 32 }, 'sigcommando_icon.tif': { width: 128, height: 32 },
  'firemode.tif': { width: 32, height: 16 }, 'compass_lo.tif': { width: 128, height: 128 },
  'font_text_01.tif': { width: 512, height: 128 }, 'action_climb.tif': { width: 64, height: 64 },
  'action_x.tif': { width: 32, height: 32 }, white: { width: 1, height: 1 },
  'font_special_01.tif': { width: 256, height: 64 }, 'ret_nav_01.tif': { width: 16, height: 16 },
};
const LIT: HudTiming = { ...AT_REST, stance: 1, help: 1 };
const HALF: HudTiming = { ...AT_REST, stance: 1, help: 0.5 };
const FADED: HudTiming = { ...AT_REST, stance: 1, help: 0 };
type Pov = NonNullable<HudSpectatorView['pov']>;

const NAMES = ['', 'ALPHA', 'BRAVO', 'CHARLIE'];
const BODIES = [{ id: 1, flags: 64, weapon: 54 }, { id: 2, flags: 64, weapon: 54 }, { id: 3, flags: 64, weapon: 57 }];
function source(role: 'spectator' | 'player', s: Partial<SpectatorHudSource['spectator']>): SpectatorHudSource {
  return {
    client: { role, bodies: () => BODIES, healthOf: () => 0.8 },
    spectator: { mode: 'free', target: null, scenic: 0, watching: null, benched: false, ...s },
    rows: [{ id: 1, kills: 0, deaths: 0, score: 0 }, { id: 2, kills: 0, deaths: 0, score: 0 }, { id: 3, kills: 0, deaths: 0, score: 0 }],
    nameOf: (id) => NAMES[id] ?? `Player${id}`,
    scenicViews: () => [{ name: 'SEAL Base' }],
  };
}
const flying = { mode: () => 'fly', isDead: () => false };
const deadWalker = { mode: () => 'walk', isDead: () => true };
/** `SpectatorView`'s two getters for a state (as `spectatorHudSet.test.ts`'s), none for null. */
const getters = (pov: Pov | null): Partial<SpectatorHudSource['spectator']> => (pov === null ? {} : { pov: pov !== 'offered', povShown: pov === 'shown' });
const VIEWS = {
  follow: (pov: Pov | null): HudSpectatorView => spectatorHudView(source('spectator', { mode: 'follow', target: 2, ...getters(pov) }), flying)!,
  teammate: (pov: Pov | null): HudSpectatorView => spectatorHudView(source('player', { watching: 3, benched: true, ...getters(pov) }), deadWalker, undefined, 'pad', () => 'sigcommando_icon.tif')!,
} as const;
const STEP: Record<keyof typeof VIEWS, SpectatorHudStep> = { follow: 'follow', teammate: 'teammate' };
const followedOf = (path: keyof typeof VIEWS): readonly string[] => (path === 'follow' ? ['BRAVO'] : ['CHARLIE']);

/**
 * What the page's `Hud.state()` gives of the port's own draw (`hudLayout`'s real rects), with the frame when `framed`; the
 * reticle the port's too (PV-10b item 5): drawn while the view is 'shown' (PV-7b, the watched player's), hidden under the
 * scoreboard and in every other state (the hide-all).
 */
function drawn(view: HudSpectatorView, timing: HudTiming, frame = PS2, framed = true, over: Partial<HudModel> = {}): SpectatorHudRead {
  const model: HudModel = { ...DEFAULT_MODEL, spectator: view, ...over };
  const { rects } = hudLayout(frame, model, SIZES, timing);
  return readOf({ visible: true, rects, model, timing, ...(framed ? { frame } : {}) }, view.pov === 'shown' && !model.scoreboard);
}

describe("PV-9 item 4: the help clock's judgement reads the player's view's line by itself (e2e/spectatorHudSet.ts)", () => {
  it("restates the HUD's own: the line drawn whatever the clock (`povLineLit`), and the two splits between the line and the block", () => {
    for (const pov of ['offered', 'shown', 'waiting'] as const) {
      for (const clock of [0, 0.01, 0.5, 1]) expect(povLineLit(pov, clock), `${pov} at ${clock}`).toBe(povHelpAlpha() > 0 && povHelpAlpha(0) > 0);
    }
    expect(HUD_FRAME_HEIGHT).toBe(448);
    // The line is the block's line 4 (baseline 434); the slot above it is baseline 416. A 0.9 glyph cell spans baseline
    // - 16.5 to baseline + 4.5: the lines' split is between the two slots' tops, the line's between their bottoms.
    const P = POV_HELP_PLACE_ADAPTATION, above = P.y - SPECTATOR_HELP.pitch;
    expect(P.y).toBe(SPECTATOR_HELP.y0 + 3 * SPECTATOR_HELP.pitch);
    expect(HELP_LINES_SPLIT_Y).toBe((above - 16.5 + P.y - 16.5) / 2);
    expect(POV_LINE_SPLIT_Y).toBe((above + 4.5 + P.y + 4.5) / 2);
    expect([HELP_LINES_SPLIT_Y, POV_LINE_SPLIT_Y]).toEqual([408.5, 429.5]);
  });

  it('reads the view\'s state and, with a frame, the help band in HUD units (any frame size); without a frame, no band', () => {
    const r = drawn(VIEWS.follow('shown'), LIT);
    expect(r.pov).toBe('shown');
    expect(r.helpBand).not.toBeNull();
    expect(r.helpBand!.top).toBeLessThan(HELP_LINES_SPLIT_Y);             // the lines, moved up above it
    expect(r.helpBand!.bottom).toBeGreaterThan(POV_LINE_SPLIT_Y);         // the view's line at the bottom
    const wide = drawn(VIEWS.follow('shown'), LIT, WIDE);
    expect(wide.helpBand!.top).toBeCloseTo(r.helpBand!.top, 6);
    const alone = drawn(VIEWS.follow('shown'), FADED);                   // past the clock: the view's line alone
    expect(alone.helpBand!.top).toBeGreaterThan(HELP_LINES_SPLIT_Y);
    expect(alone.helpBand!.bottom).toBeGreaterThan(POV_LINE_SPLIT_Y);
    expect(drawn(VIEWS.follow('shown'), LIT, PS2, false).helpBand).toBeNull();
    expect(drawn(VIEWS.follow(null), LIT).pov).toBeNull();
  });

  it("a read with no view state (the existing specs': none turns the view on) is judged on the lines' clock alone, as before", () => {
    for (const path of ['follow', 'teammate'] as const) {
      for (const framed of [true, false]) {
        const opts = { help: 'clock' as const, followed: followedOf(path) };
        expect(spectatorHudFindings(drawn(VIEWS[path](null), LIT, PS2, framed), STEP[path], opts), `${path} lit`).toEqual([]);
        expect(spectatorHudFindings(drawn(VIEWS[path](null), FADED, PS2, framed), STEP[path], opts), `${path} faded`).toEqual([]);
        const late = drawn(VIEWS[path](null), FADED, PS2, framed), lit = drawn(VIEWS[path](null), LIT, PS2, framed);
        expect(spectatorHudFindings({ ...late, drawn: [...late.drawn, 'help'] }, STEP[path], opts).join('\n')).toContain("'help' drawn past its clock");
        expect(spectatorHudFindings({ ...lit, drawn: lit.drawn.filter((e) => e !== 'help') }, STEP[path], opts).join('\n')).toContain("'help' not drawn");
      }
    }
  });

  it("the port's own draw passes on the clock in every state, with and without a frame: the line stays past the clock", () => {
    for (const path of ['follow', 'teammate'] as const) {
      for (const pov of ['offered', 'shown', 'waiting'] as const) {
        for (const t of [LIT, HALF, FADED]) {
          for (const framed of [true, false]) {
            const read = drawn(VIEWS[path](pov), t, PS2, framed);
            expect(read.drawn, `${path} ${pov} ${t.help}`).toContain('help');
            expect(spectatorHudFindings(read, STEP[path], { help: 'clock', followed: followedOf(path) }), `${path} ${pov} ${t.help} framed ${framed}`).toEqual([]);
          }
        }
      }
    }
  });

  for (const pov of ['offered', 'shown', 'waiting'] as const) {
    it(`'${pov}': the lines drawn past the clock beside the line are a finding; the line missing, lit or faded, is one`, () => {
      const faded = drawn(VIEWS.teammate(pov), FADED), lit = drawn(VIEWS.teammate(pov), LIT);
      // The lines drawn past their clock beside the line: the band reaches above the lines' split.
      const late = { ...faded, helpBand: { top: 345.5, bottom: faded.helpBand!.bottom } };
      expect(spectatorHudFindings(late, 'teammate', { help: 'clock' }).join('\n')).toContain("'help' drawn past its clock");
      // The line missing beside the lines: the band ends above the line's split.
      const linesOnly = { ...lit, helpBand: { top: lit.helpBand!.top, bottom: 421.4 } };
      expect(spectatorHudFindings(linesOnly, 'teammate', { help: 'clock' }).join('\n')).toContain(`the player's view's line ('${pov}') not drawn`);
      // Nothing of 'help' at all (the Chat menu hides the whole block): with a frame or without, the line is missed.
      const gone = drawn(VIEWS.teammate(pov), FADED, PS2, true, { commandMenu: true });
      expect(gone.drawn).not.toContain('help');
      expect(spectatorHudFindings({ ...gone, pov }, 'teammate', { help: 'clock' }).join('\n')).toContain(`the player's view's line ('${pov}') not drawn`);
      // 'help' asked 'shown' still asks the lines lit.
      expect(spectatorHudFindings(faded, 'teammate', { help: 'shown' }).join('\n')).toContain("'help' faded");
    });
  }
});

describe("PV-10b item 5: while the view is 'shown' the reticle drawn is the watched player's (PV-7b), judged by the view's state", () => {
  const HIDE_ALL = 'the hide-all hides its root';
  const WATCHED = "the watched player's reticle";
  it("'shown': the reticle drawn is expected; one not drawn is a finding", () => {
    for (const path of ['follow', 'teammate'] as const) {
      const read = drawn(VIEWS[path]('shown'), FADED);
      const opts = { help: 'clock' as const, followed: followedOf(path) };
      expect(spectatorHudFindings({ ...read, reticle: true }, STEP[path], opts), path).toEqual([]);
      expect(spectatorHudFindings({ ...read, reticle: false }, STEP[path], opts).join('\n'), path).toContain(WATCHED);
      // A page with no reticle read (the front end's match hook) is not judged on it, as before.
      expect(spectatorHudFindings({ ...read, reticle: null }, STEP[path], opts), path).toEqual([]);
    }
  });

  it("absent, 'offered' or 'waiting': hidden as before -- a reticle drawn is the hide-all's finding, the same as with no state", () => {
    for (const path of ['follow', 'teammate'] as const) {
      for (const pov of [null, 'offered', 'waiting'] as const) {
        for (const t of [LIT, FADED]) {
          const read = { ...drawn(VIEWS[path](pov), t), reticle: true };
          const opts = { help: 'clock' as const, followed: followedOf(path) };
          const found = spectatorHudFindings(read, STEP[path], opts);
          expect(found.join('\n'), `${path} ${pov}`).toContain(HIDE_ALL);
          expect(found.join('\n'), `${path} ${pov}`).not.toContain(WATCHED);
          expect(spectatorHudFindings({ ...read, reticle: false }, STEP[path], opts), `${path} ${pov} ${t.help}`).toEqual([]);
        }
      }
    }
  });

  it("'shown' under the scoreboard (SELECT held: a screen that hides every reticle) still asks it hidden", () => {
    const read = drawn(VIEWS.follow('shown'), FADED, PS2, true, { scoreboard: true });
    expect(spectatorHudFindings({ ...read, reticle: true }, 'scoreboard').join('\n')).toContain(HIDE_ALL);
    expect(spectatorHudFindings({ ...read, reticle: false }, 'scoreboard').join('\n')).not.toContain('reticle');
  });
});
