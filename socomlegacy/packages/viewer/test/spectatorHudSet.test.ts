import { describe, expect, it } from 'vitest';
import {
  AT_REST, DEFAULT_MODEL, hudPass, OWN_BODY_HIDES, SCOREBOARD_HIDES, SPECTATOR_FOLLOWED_HEALTH_READING,
  SPECTATOR_HIDES, SPECTATOR_OWN_INFO_PLACEHOLDER, spectatorHudView, TEAMMATE_HIDES, type HudModel, type HudSpectatorView,
  type HudTiming, type SpectatorHudSource,
} from '../src/hud';
import {
  COMPASS, PORT_GAPS, SCOREBOARD_HIDDEN, SPECTATOR_HIDDEN, TEAMMATE_BOX, readOf, spectatorHudFindings, type SpectatorHudRead, type SpectatorHudStep,
} from '../e2e/spectatorHudSet';

/**
 * PAR-48c (PARITY-2; issue #138's closing bar; research 282, research 276 §7): the rendered specs' check of a spectator's
 * and a dead player's HUD (`e2e/spectatorHudSet.ts`, read by `e2e/spectatorHud.spec.ts` and
 * `e2e/spectatorHudMenu.spec.ts`) cannot pass empty. Its lists are held against the HUD's own sets and placeholders
 * (`../src/hud`); a state the port's own draw (`hudPass`, the views from `spectatorHudView`) gives passes it at each step;
 * the same state with one element taken away, or one hidden element drawn, fails it, naming the element.
 */

const PS2 = { width: 640, height: 448 };
/** The bitmaps' sizes as Frostfire's archive decodes them (research 87 §2; `hud.test.ts`'s), the pad glyphs' and a nav mark's. */
const SIZES: Record<string, { width: number; height: number }> = {
  'newweapnbkrnd.tif': { width: 128, height: 64 }, 'm4carbine_icon.tif': { width: 128, height: 32 }, 'sigcommando_icon.tif': { width: 128, height: 32 },
  'firemode.tif': { width: 32, height: 16 }, 'compass_lo.tif': { width: 128, height: 128 },
  'font_text_01.tif': { width: 512, height: 128 }, 'action_climb.tif': { width: 64, height: 64 },
  'action_x.tif': { width: 32, height: 32 }, white: { width: 1, height: 1 },
  'font_special_01.tif': { width: 256, height: 64 }, 'ret_nav_01.tif': { width: 16, height: 16 },
};
/** A walker's busy model under the view: the prompt up, a range, a nav mark -- so every hide has something to hide. */
const busy = (spectator: HudSpectatorView | null, over: Partial<HudModel> = {}): HudModel => ({
  ...DEFAULT_MODEL, spectator, action: 'climb', range: 12, zoom: 1, position: [0, 0], navPoints: [{ name: 'Charlie', x: 0, z: -10 }], ...over,
});
const LIT: HudTiming = { ...AT_REST, stance: 1, help: 1 };
const FADED: HudTiming = { ...AT_REST, stance: 1, help: 0 };

/** The page's `NetPage` as `spectatorHudView` reads it: ALPHA (1, a Terrorist), BRAVO (2) and CHARLIE (3, SEALs). */
const NAMES = ['', 'ALPHA', 'BRAVO', 'CHARLIE'];
/**
 * LATER 117: the room's bodies -- CHARLIE holds the 552 (its icon `sigcommando_icon.tif`), the dead walker's own model
 * keeps the M4A1's (`DEFAULT_MODEL.weaponIcon`), so the watched icon is told apart from his own.
 */
const BODIES = [{ id: 1, flags: 64, weapon: 54 }, { id: 2, flags: 0, weapon: 54 }, { id: 3, flags: 64, weapon: 57 }];
const ICONS: Record<number, string> = { 54: 'm4carbine_icon.tif', 57: 'sigcommando_icon.tif' };
const CHARLIE_ICON = 'sigcommando_icon.tif';
const OWN_ICON = DEFAULT_MODEL.weaponIcon;
function source(role: 'spectator' | 'player', s: Partial<SpectatorHudSource['spectator']>): SpectatorHudSource {
  return {
    client: { role, bodies: () => BODIES, healthOf: () => 0.8 },   // LATER 119: the room's bytes give each seat's health
    spectator: { mode: 'free', target: null, scenic: 0, watching: null, benched: false, ...s },
    rows: [{ id: 1, kills: 1, deaths: 0, score: 2 }, { id: 2, kills: 0, deaths: 1, score: 0 }, { id: 3, kills: 0, deaths: 0, score: 0 }],
    nameOf: (id) => NAMES[id] ?? `Player${id}`,
    scenicViews: () => [{ name: 'SEAL Base' }],
  };
}
const flying = { mode: () => 'fly', isDead: () => false };
const deadWalker = { mode: () => 'walk', isDead: () => true };
const VIEWS: Record<Exclude<SpectatorHudStep, 'scoreboard'>, HudSpectatorView> = {
  free: spectatorHudView(source('spectator', {}), flying)!,
  scenic: spectatorHudView(source('spectator', { mode: 'scenic', scenic: 0 }), flying)!,
  follow: spectatorHudView(source('spectator', { mode: 'follow', target: 2 }), flying)!,
  teammate: spectatorHudView(source('player', { watching: 3, benched: true }), deadWalker, undefined, 'pad', (id) => ICONS[id] ?? null)!,
  own: spectatorHudView(source('player', { benched: true }), deadWalker)!,
};

/** What the page's `Hud.state()` would report of the port's own draw (`hudPass`): the elements its quads carry. */
function drawnBy(view: HudSpectatorView, over: Partial<HudModel> = {}, timing: HudTiming = LIT, reticle: boolean | null = false): SpectatorHudRead {
  const model = busy(view, over);
  const { quads } = hudPass(PS2, model, SIZES, timing, false, null);
  const rects = Object.fromEntries([...new Set(quads.map((q) => q.element))].map((e) => [e, { x: 0, y: 0, width: 1, height: 1 }]));
  // LATER 117: the icon's bitmap as `Hud.state().icon` reports it (the drawn 'icon' quad's texture).
  const icon = quads.find((q) => q.element === 'icon')?.texture ?? null;
  return readOf({ visible: true, rects, model, timing, icon }, reticle);
}
const READS: Record<SpectatorHudStep, SpectatorHudRead> = {
  free: drawnBy(VIEWS.free), scenic: drawnBy(VIEWS.scenic), follow: drawnBy(VIEWS.follow),
  scoreboard: drawnBy(VIEWS.follow, { scoreboard: true }), teammate: drawnBy(VIEWS.teammate), own: drawnBy(VIEWS.own),
};
const without = (r: SpectatorHudRead, e: string): SpectatorHudRead => ({ ...r, drawn: r.drawn.filter((x) => x !== e) });
const plus = (r: SpectatorHudRead, e: string): SpectatorHudRead => ({ ...r, drawn: [...r.drawn, e] });
const STEPS = Object.keys(READS) as SpectatorHudStep[];

describe('PAR-48c: the spectator HUD check the rendered specs share (e2e/spectatorHudSet.ts)', () => {
  it("its lists are the HUD's own: the hide-all's set (SPECTATOR_HIDES), the board's (SCOREBOARD_HIDES), a dead body's (OWN_BODY_HIDES), the placeholders still standing", () => {
    expect(new Set(SPECTATOR_HIDDEN)).toEqual(new Set(SPECTATOR_HIDES));   // the review's F3: the number drawn (research 282 §6)
    expect(new Set(SCOREBOARD_HIDDEN)).toEqual(new Set(SCOREBOARD_HIDES));
    expect(new Set(COMPASS)).toEqual(new Set(OWN_BODY_HIDES));
    // LATER 117: a dead player watching a teammate keeps the box's panel and icon (FUN_00237e50 D:L85358, D:L85367-85371).
    expect(new Set(SPECTATOR_HIDDEN.filter((e) => !TEAMMATE_BOX.includes(e)))).toEqual(new Set(TEAMMATE_HIDES));
    expect(PORT_GAPS).toEqual({
      followedBar: SPECTATOR_FOLLOWED_HEALTH_READING.length > 0, ownInfo:   // LATER 119: drawn, from the room's bytes
      SPECTATOR_OWN_INFO_PLACEHOLDER !== null,
    });
  });

  it.each(STEPS)("%s: the port's own draw passes it", (step) => {
    const followed = step === 'follow' || step === 'scoreboard' ? ['BRAVO'] : step === 'teammate' ? ['CHARLIE'] : undefined;
    expect(spectatorHudFindings(READS[step], step, {
      help: 'shown', ...(followed ? { followed } : {}), ...(step === 'teammate' ? { icon: CHARLIE_ICON } : {}),
    })).toEqual([]);
  });

  it("LATER 117 (the console seat's note): the teammate step's icon is the watched teammate's held item's, never the dead player's own", () => {
    expect(READS.teammate.icon).toBe(CHARLIE_ICON);
    expect(OWN_ICON).not.toBe(CHARLIE_ICON);                        // the case tells the two apart
    const ownDrawn = { ...READS.teammate, icon: OWN_ICON };         // a page drawing the dead's own icon there
    expect(spectatorHudFindings(ownDrawn, 'teammate', { icon: CHARLIE_ICON }).join('\n')).toContain(`'icon' is ${OWN_ICON}`);
    expect(spectatorHudFindings({ ...READS.teammate, icon: null }, 'teammate', { icon: CHARLIE_ICON }).join('\n')).toContain("'icon'");
    expect(spectatorHudFindings(READS.teammate, 'teammate', { icon: CHARLIE_ICON })).toEqual([]);
    // With no watched icon given (a page whose teammate's item is not read), presence alone is judged, as before.
    expect(spectatorHudFindings(ownDrawn, 'teammate')).toEqual([]);
  });

  const missing: [SpectatorHudStep, string][] = [
    ['free', 'timer'], ['free', 'box'], ['free', 'spectatorInfo'], ['free', 'help'], ['scenic', 'spectatorInfo'],
    ['follow', 'name'], ['follow', 'timer'], ['scoreboard', 'scoreboard'], ['teammate', 'name'], ['teammate', 'timer'],
    ['own', 'timer'], ['own', 'box'],
    // LATER 117: the watched teammate's box -- its panel and icon (FUN_00237e50 D:L57180, D:L85358).
    ['teammate', 'panel'], ['teammate', 'icon'],
    // LATER 119: the followed body's bar (SPECTATOR_FOLLOWED_HEALTH_READING) -- was in `shown` below (drawn: a failure).
    ['follow', 'bar'], ['teammate', 'bar'],
    // LATER 118: the help lines, one per step that asks them (the dead's two since the HUD draws them, research 282 §8).
    ['scenic', 'help'], ['follow', 'help'], ['teammate', 'help'], ['own', 'help'],
  ];
  it.each(missing)('%s: fails with %s taken away', (step, e) => {
    const found = spectatorHudFindings(without(READS[step], e), step, { help: 'shown' });
    expect(found.length, `${step} less ${e}`).toBeGreaterThan(0);
    expect(found.join('\n')).toContain(`'${e}'`);
  });

  const shown: [SpectatorHudStep, string][] = [
    ['free', 'compass'], ['free', 'marks'], ['free', 'panel'], ['free', 'rounds'], ['free', 'action'], ['free', 'holdBar'],
    ['free', 'name'], ['free', 'bar'], ['scoreboard', 'range'], ['free', 'scoreboard'], ['scenic', 'compass'], ['follow', 'icon'],   // F3: the number drawn, but hidden under the board
    ['scoreboard', 'spectatorInfo'], ['scoreboard', 'help'], ['scoreboard', 'timer'], ['scoreboard', 'box'],
    ['scoreboard', 'name'], ['scoreboard', 'compass'], ['teammate', 'compass'], ['teammate', 'spectatorInfo'],
    // LATER 117: the box's group `+0x270` hidden on a teammate (D:L85367-85371) -- was ['teammate', 'panel'].
    ['teammate', 'rounds'], ['teammate', 'mags'], ['teammate', 'firemode'], ['own', 'compass'], ['own', 'marks'], ['own', 'spectatorInfo'],
  ];
  it.each(shown)('%s: fails with %s drawn', (step, e) => {
    const found = spectatorHudFindings(plus(READS[step], e), step, { help: 'shown' });
    expect(found.length, `${step} with ${e}`).toBeGreaterThan(0);
    expect(found.join('\n')).toContain(`'${e}'`);
  });

  it('fails on the reticle drawn for a seat viewing another (the hide-all hides its root, D:L56327); not judged on a dead body of his own', () => {
    for (const step of ['free', 'follow', 'scoreboard', 'teammate'] as const) {
      expect(spectatorHudFindings({ ...READS[step], reticle: true }, step).join('\n'), step).toContain('reticle');
    }
    expect(spectatorHudFindings({ ...READS.own, reticle: true }, 'own')).toEqual([]);
    expect(spectatorHudFindings({ ...READS.free, reticle: null }, 'free')).toEqual([]);   // a page with no read: not judged
  });

  it('fails on the wrong path, a follow with no body or another body, a free camera following, a HUD not drawn', () => {
    expect(spectatorHudFindings(READS.teammate, 'follow').join('\n')).toContain('path');
    expect(spectatorHudFindings(READS.own, 'teammate').join('\n')).toContain('path');
    expect(spectatorHudFindings({ ...READS.follow, followed: null }, 'follow').join('\n')).toContain('followed');
    expect(spectatorHudFindings(READS.follow, 'follow', { followed: ['ALPHA'] }).join('\n')).toContain('BRAVO');
    expect(spectatorHudFindings({ ...READS.free, followed: 'BRAVO' }, 'free').join('\n')).toContain('followed');
    expect(spectatorHudFindings({ ...READS.free, visible: false }, 'free').join('\n')).toContain('not drawn');
  });

  it("the help lines on their clock (SPECTATOR_HELP's 10 s and 0.5 s fade): 'clock' asks them drawn while lit and gone once faded; 'shown' asks them lit", () => {
    const faded = drawnBy(VIEWS.free, {}, FADED);
    expect(faded.drawn).not.toContain('help');
    expect(spectatorHudFindings(faded, 'free', { help: 'clock' })).toEqual([]);
    expect(spectatorHudFindings(faded, 'free', { help: 'shown' }).join('\n')).toContain("'help'");
    expect(spectatorHudFindings(plus(faded, 'help'), 'free', { help: 'clock' }).join('\n')).toContain("'help'");
    expect(spectatorHudFindings(without(READS.free, 'help'), 'free', { help: 'clock' }).join('\n')).toContain("'help'");
  });
});

describe("LATER 118: the dead's help lines judged on their two steps (FUN_001f9f20 D:L57149-57173, D:L57191-57205; FUN_001f97b0 D:L56996-57107, D:L57120-57135)", () => {
  const followedOf = (step: 'teammate' | 'own'): { followed?: readonly string[] } => (step === 'teammate' ? { followed: ['CHARLIE'] } : {});
  for (const step of ['teammate', 'own'] as const) {
    it(`${step}: 'shown' asks them lit and drawn; taken away, a finding`, () => {
      expect(spectatorHudFindings(READS[step], step, { help: 'shown', ...followedOf(step) })).toEqual([]);
      expect(spectatorHudFindings(without(READS[step], 'help'), step, { help: 'shown', ...followedOf(step) }).join('\n')).toContain("'help' not drawn");
    });
    it(`${step}: on a faded clock (past 10.5 s) 'clock' asks them gone -- a line drawn past its clock is a finding; 'shown' finds them faded`, () => {
      const faded = drawnBy(VIEWS[step], {}, FADED);
      expect(faded.drawn).not.toContain('help');
      expect(spectatorHudFindings(faded, step, { help: 'clock', ...followedOf(step) })).toEqual([]);
      expect(spectatorHudFindings(plus(faded, 'help'), step, { help: 'clock', ...followedOf(step) }).join('\n')).toContain("'help' drawn past its clock");
      expect(spectatorHudFindings(faded, step, { help: 'shown', ...followedOf(step) }).join('\n')).toContain("'help' faded");
      expect(spectatorHudFindings(without(READS[step], 'help'), step, { help: 'clock', ...followedOf(step) }).join('\n')).toContain("'help' not drawn");
    });
  }
});
