import { describe, expect, it } from 'vitest';
import {
  AT_REST, DEFAULT_MODEL, hudLayout, POV_HELP_PLACE_ADAPTATION, povHelpAlpha, SPECTATOR_HELP, spectatorHudView,
  type HudModel, type HudSpectatorView, type HudTiming, type SpectatorHudSource,
} from '../src/hud';
import {
  HUD_FRAME_HEIGHT, POV_LINE_SPLIT_Y, povLineLit, readOf, spectatorHudFindings, type SpectatorHudRead, type SpectatorHudStep,
} from '../e2e/spectatorHudSet';

/**
 * PV-9 item 4 (PV-6h's review, finding 2; the plan 2026-11-11-players-view, PV-9; product track, a browser test's check,
 * no game value): `e2e/spectatorHudSet.ts` judged the `'help'` element whole "drawn past its clock", so the player's view's
 * line -- drawn while the view is on whatever the help clock says (`POV_HELP_SHOWN_ADAPTATION` at the lines' alpha,
 * 'waiting' at half; `../src/hud` `povHelpAlpha`) -- would read as the original lines drawn late. The read now carries the
 * view's state (`pov`) and, where the page gives its frame, the help element's band in the HUD's own units, so the
 * original lines are judged on their clock and the view's line by itself. The existing specs (`spectatorHud.spec.ts`,
 * `spectatorHudMenu.spec.ts`) never turn the view on and give no frame: their judgement is shown unchanged below, on every
 * step and both clocks. `test/spectatorHudSet.test.ts` is untouched.
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
  it("restates the HUD's own: the line's alpha above 0 exactly where `povLineLit` says, and the split between the line and the block", () => {
    for (const pov of ['offered', 'shown', 'waiting'] as const) {
      for (const clock of [0, 0.01, 0.5, 1]) expect(povLineLit(pov, clock), `${pov} at ${clock}`).toBe(povHelpAlpha(pov, clock) > 0);
    }
    expect(HUD_FRAME_HEIGHT).toBe(448);
    // The split lies between the view's line (baseline 326) and the help block's first line (baseline 380).
    expect(POV_LINE_SPLIT_Y).toBe((POV_HELP_PLACE_ADAPTATION.y + SPECTATOR_HELP.y0) / 2);
  });

  it('reads the view\'s state and, with a frame, the help band in HUD units (any frame size); without a frame, no band', () => {
    const r = drawn(VIEWS.follow('shown'), FADED);
    expect(r.pov).toBe('shown');
    expect(r.helpBand).not.toBeNull();
    expect(r.helpBand!.bottom).toBeLessThan(POV_LINE_SPLIT_Y);            // the view's line alone, past the clock
    const wide = drawn(VIEWS.follow('shown'), FADED, WIDE);
    expect(wide.helpBand!.top).toBeCloseTo(r.helpBand!.top, 6);
    const lit = drawn(VIEWS.follow('shown'), LIT);
    expect(lit.helpBand!.top).toBeLessThan(POV_LINE_SPLIT_Y);
    expect(lit.helpBand!.bottom).toBeGreaterThan(POV_LINE_SPLIT_Y);       // the lines below it too
    expect(drawn(VIEWS.follow('shown'), FADED, PS2, false).helpBand).toBeNull();
    expect(drawn(VIEWS.follow(null), LIT).pov).toBeNull();
  });

  it("the existing specs' judgement is unchanged: no view state, or 'offered', with no frame, on every step's clock", () => {
    for (const path of ['follow', 'teammate'] as const) {
      for (const t of [LIT, HALF, FADED]) {
        for (const pov of [null, 'offered'] as const) {
          const read = drawn(VIEWS[path](pov), t, PS2, false);
          const before = { ...read, pov: null, helpBand: null };   // the read as it was: no state, no band
          for (const help of ['clock', 'shown'] as const) {
            const opts = { help, followed: followedOf(path) };
            expect(spectatorHudFindings(read, STEP[path], opts), `${path} ${pov} ${t.help} ${help}`).toEqual(spectatorHudFindings(before, STEP[path], opts));
            // and a stray 'help' drawn past the clock, or one missing, is found the same way
            const extra = { ...read, drawn: [...read.drawn, 'help'] }, missing = { ...read, drawn: read.drawn.filter((e) => e !== 'help') };
            expect(spectatorHudFindings(extra, STEP[path], opts)).toEqual(spectatorHudFindings({ ...extra, pov: null, helpBand: null }, STEP[path], opts));
            expect(spectatorHudFindings(missing, STEP[path], opts)).toEqual(spectatorHudFindings({ ...missing, pov: null, helpBand: null }, STEP[path], opts));
          }
        }
      }
    }
  });

  it("the port's own draw passes on the clock in every state, with and without a frame: 'shown' and 'waiting' past the clock are the view's line, not a late line", () => {
    for (const path of ['follow', 'teammate'] as const) {
      for (const pov of ['offered', 'shown', 'waiting'] as const) {
        for (const t of [LIT, HALF, FADED]) {
          for (const framed of [true, false]) {
            const read = drawn(VIEWS[path](pov), t, PS2, framed);
            expect(spectatorHudFindings(read, STEP[path], { help: 'clock', followed: followedOf(path) }), `${path} ${pov} ${t.help} framed ${framed}`).toEqual([]);
          }
        }
      }
    }
  });

  it("'shown' past the clock: the original lines drawn too are a finding, and the view's line missing is one", () => {
    const read = drawn(VIEWS.follow('shown'), FADED);
    // The original lines drawn past their clock beside the view's line: the band reaches below the split.
    const late = { ...read, helpBand: { top: read.helpBand!.top, bottom: 400 } };
    expect(spectatorHudFindings(late, 'follow', { help: 'clock' }).join('\n')).toContain("'help' drawn past its clock");
    // The view's line missing while 'shown': nothing drawn of 'help' at all.
    const gone = drawn(VIEWS.follow('shown'), FADED, PS2, true, { commandMenu: true });   // the Chat menu hides the whole block
    expect(gone.drawn).not.toContain('help');
    expect(spectatorHudFindings({ ...gone, pov: 'shown' }, 'follow', { help: 'clock' }).join('\n')).toContain("the player's view's line");
    // Without a frame the element as a whole is judged: drawn is right, missing is a finding.
    expect(spectatorHudFindings({ ...read, helpBand: null }, 'follow', { help: 'clock' })).toEqual([]);
    expect(spectatorHudFindings({ ...gone, pov: 'shown', helpBand: null }, 'follow', { help: 'clock' }).join('\n')).toContain("'help' not drawn");
  });

  it("'offered' rides the clock: its line drawn past it is a finding; lit, the view's line missing beside the lines is one", () => {
    const faded = drawn(VIEWS.teammate('offered'), FADED);
    expect(faded.drawn).not.toContain('help');
    const stray = { ...faded, drawn: [...faded.drawn, 'help'], helpBand: { top: 300, bottom: 335 } };
    expect(spectatorHudFindings(stray, 'teammate', { help: 'clock' }).join('\n')).toContain("the player's view's line ('offered') drawn");
    const lit = drawn(VIEWS.teammate('offered'), LIT);
    const linesOnly = { ...lit, helpBand: { top: 360, bottom: lit.helpBand!.bottom } };
    expect(spectatorHudFindings(linesOnly, 'teammate', { help: 'clock' }).join('\n')).toContain("the player's view's line ('offered') not drawn");
  });

  it("'waiting' is drawn past the clock at its own alpha; 'help' asked 'shown' still asks the lines lit", () => {
    const read = drawn(VIEWS.teammate('waiting'), FADED);
    expect(read.drawn).toContain('help');
    expect(spectatorHudFindings(read, 'teammate', { help: 'clock' })).toEqual([]);
    expect(spectatorHudFindings(read, 'teammate', { help: 'shown' }).join('\n')).toContain("'help' faded");
  });
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
