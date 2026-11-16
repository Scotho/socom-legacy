import { describe, expect, it } from 'vitest';
import {
  AT_REST, DEFAULT_MODEL, HUD_ALIVE_RIGHT_LAYOUT_ADAPTATION, HUD_LAYOUT, hudPass, OWN_BODY_HIDES, POV_HELP_OFFERED_ADAPTATION,
  POV_HELP_PLACE_ADAPTATION, POV_HELP_SHOWN_ADAPTATION, POV_HELP_WAITING_ADAPTATION, SCOREBOARD_HIDES, SPECTATOR_FOLLOWED_HEALTH_READING,
  SPECTATOR_HELP, SPECTATOR_HELP_TAIL_PLACEHOLDER, SPECTATOR_HIDES, SPECTATOR_INFO_LAYOUT, SPECTATOR_OWN_INFO_PLACEHOLDER, spectatorHudView,
  TEAMMATE_HIDES, TEXT_LINE_LAYOUT, type HudModel, type HudQuad, type HudSpectatorView,
  type HudTiming, type SpectatorHudSource,
} from '../src/hud';
import { deadHelpLines } from '../src/weaponSelect';
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

/**
 * PV-6h (POV_VIEW_ADAPTATION; the plan 2026-11-11-players-view, Log 16:30Z, call 2; research 402): the player's view's
 * mark is one line, a browser adaptation with no original, drawn on the help block's own grid three lines above its
 * first (`POV_HELP_PLACE_ADAPTATION`: baseline 380 - 3 x 18 = 326, centred on x 324) -- the same place on the spectator's,
 * the dead watcher's and the ghost watcher's path. It is none of the six help slots: the original's lines 5 and 6 sit
 * at baselines 452 and 470, below the 448-high frame (the review of 42bdc829f). Its alpha is its own: 'offered' on the
 * help clock, 'shown' at the lines' full alpha, 'waiting' at half of it. What this block holds above all: every quad
 * drawn without the line is drawn with it, in order; the line lies inside the frame and crosses nothing drawn there.
 */
describe("PV-6h: the player's view's help line (POV_HELP_*_ADAPTATION), on the help block's grid above its first line", () => {
  type Pov = NonNullable<HudSpectatorView['pov']>;
  type Rect = { x: number; y: number; w: number; h: number };
  const STATES: readonly Pov[] = ['offered', 'shown', 'waiting'];
  const HALF: HudTiming = { ...AT_REST, stance: 1, help: 0.5 };
  const TIMINGS: readonly [string, HudTiming][] = [['lit', LIT], ['half-faded', HALF], ['faded', FADED]];
  /** The help lines' alpha (`SPECTATOR_HELP.alpha`, 100 of the GS's 128) as the line takes it in each state. */
  const alphaOf = (pov: Pov, t: HudTiming): number => (pov === 'offered' ? (t.help ?? 1) * 100 : pov === 'shown' ? 100 : 50) / 128;
  /** The page's `SpectatorView` getters (`pov`, `povShown`) for a state; null: a source without them. */
  const getters = (pov: Pov | null): Partial<SpectatorHudSource['spectator']> => (pov === null ? {} : { pov: pov !== 'offered', povShown: pov === 'shown' });
  const ghostly = (src: SpectatorHudSource): SpectatorHudSource => ({ ...src, ghost: () => true });
  const PATHS = {
    follow: (pov: Pov | null) => spectatorHudView(source('spectator', { mode: 'follow', target: 2, ...getters(pov) }), flying)!,
    dead: (pov: Pov | null) => spectatorHudView(source('player', { watching: 3, benched: true, ...getters(pov) }), deadWalker, undefined, 'pad', (id) => ICONS[id] ?? null)!,
    ghost: (pov: Pov | null) => spectatorHudView(ghostly(source('player', { watching: 3, benched: true, ...getters(pov) })), deadWalker, undefined, 'pad', (id) => ICONS[id] ?? null)!,
  } as const;
  /**
   * Everything that can be up beside the line, so a crossing would show: the busy walker's model, plus the round's text
   * line at full (`TEXT_LINE_LAYOUT`), the bomb's hold bar at full, and the voice element with a long speaker's line.
   */
  const CROWDED: Partial<HudModel> = {
    textLine: { text: 'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW', box: 76.8, ink: 100 },
    holdBar: { fill: 1 },
    voice: { icon: 'white', count: '8', name: 'WWWWWWWWWWWWWWWWWWWW', talk: 'white', right: '8' },
  };
  const quadsOf = (view: HudSpectatorView, t: HudTiming, over: Partial<HudModel> = {}): HudQuad[] =>
    hudPass(PS2, busy(view, { ...CROWDED, ...over }), SIZES, t, false, null).quads;
  /** The quads `withPov` adds to `without`, and `without`'s own as `withPov` keeps them (in order): a multiset difference. */
  function split(withPov: readonly HudQuad[], without: readonly HudQuad[]): { added: HudQuad[]; kept: HudQuad[] } {
    const left = new Map<string, number>();
    for (const q of without) left.set(JSON.stringify(q), (left.get(JSON.stringify(q)) ?? 0) + 1);
    const added: HudQuad[] = [], kept: HudQuad[] = [];
    for (const q of withPov) {
      const k = JSON.stringify(q), n = left.get(k) ?? 0;
      if (n > 0) { left.set(k, n - 1); kept.push(q); } else added.push(q);
    }
    return { added, kept };
  }
  /** A quad's rect by its top-left corner: `HudQuad.x`, `.y` are its CENTRE (`hudLayout`'s `push`); the layout's rects are corners. */
  const boxOf = (q: HudQuad): Rect => ({ x: q.x - q.w / 2, y: q.y - q.h / 2, w: q.w, h: q.h });
  const crosses = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  /** What the HUD draws near the line, by its own layout (`TEXT_LINE_LAYOUT`, `SPECTATOR_INFO_LAYOUT`, `HUD_LAYOUT`). */
  const NAMED: readonly [string, Rect][] = [
    ['text line box', TEXT_LINE_LAYOUT.box], ['spectator title', SPECTATOR_INFO_LAYOUT.title], ['spectator stats', SPECTATOR_INFO_LAYOUT.stats],
    ['health bar', HUD_LAYOUT.info.bar], ['info box', HUD_LAYOUT.info.box], ['voice icon', HUD_LAYOUT.voice.icon],
    ['voice talk', HUD_LAYOUT.voice.talk], ['voice count box', HUD_LAYOUT.voice.countBox],
    ['alive count box', HUD_ALIVE_RIGHT_LAYOUT_ADAPTATION.countBox], ['hold bar', HUD_LAYOUT.holdBar.box],
  ];

  it('its words, alpha share and place are labelled constants (no original); the original lines and the tail placeholder are as they were', () => {
    expect(POV_HELP_OFFERED_ADAPTATION).toBe('Hold ¦ for the Player\'s View.');
    expect(POV_HELP_SHOWN_ADAPTATION).toBe('PLAYER\'S VIEW.  Hold ¦ to leave.');
    expect(POV_HELP_WAITING_ADAPTATION).toBe(0.5);
    expect(POV_HELP_PLACE_ADAPTATION).toEqual({ x: SPECTATOR_HELP.x, y: SPECTATOR_HELP.y0 - 3 * SPECTATOR_HELP.pitch });
    expect(POV_HELP_PLACE_ADAPTATION).toEqual({ x: 324, y: 326 });
    expect(SPECTATOR_HELP_TAIL_PLACEHOLDER).toEqual([]);
    expect(SPECTATOR_HELP.lines).toEqual(['You are a spectator.  Use the directional', 'buttons to cycle through active players',
      'and fixed views.  ¦ Use the Free-Motion', 'Camera.  ¬ Jump to visible players.']);
  });

  it("the view's state off the page's two getters: 'offered' (off), 'shown' (drawn this frame), 'waiting' (on, fallen back); a source without them, none", () => {
    for (const path of ['follow', 'dead', 'ghost'] as const) {
      for (const pov of STATES) expect(PATHS[path](pov).pov, `${path} ${pov}`).toBe(pov);
      expect('pov' in PATHS[path](null), path).toBe(false);
    }
    // The spectator's view carries no help of its own (its lines are the HUD's `SPECTATOR_HELP`), with or without the state.
    expect('help' in PATHS.follow('shown')).toBe(false);
    expect(PATHS.follow('offered')).toEqual({ ...PATHS.follow(null), pov: 'offered' });
  });

  it("the help lines are the same with the state as without it, on every path: the dead watcher's six are `deadHelpLines`' own", () => {
    for (const [path, ghost] of [['dead', false], ['ghost', true]] as const) {
      const before = deadHelpLines({ ghost, watching: true, device: 'pad' });
      expect(PATHS[path](null).help, path).toEqual(before);
      for (const pov of STATES) expect(PATHS[path](pov), `${path} ${pov}`).toEqual({ ...PATHS[path](null), pov });   // only the state is new
    }
  });

  for (const path of ['follow', 'dead', 'ghost'] as const) {
    for (const pov of STATES) {
      for (const [when, t] of TIMINGS) {
        it(`${path}, ${pov}, ${when}: every other quad unchanged; the line inside the frame, at its alpha, crossing nothing`, () => {
          const without = quadsOf(PATHS[path](null), t), withPov = quadsOf(PATHS[path](pov), t);
          const { added, kept } = split(withPov, without);
          // Every quad drawn without the line is drawn with it, in the same order -- each original help line's glyphs,
          // place, colour and alpha, and every other element -- and none is gone.
          expect(kept).toEqual(without);
          expect(added.every((q) => q.element === 'help')).toBe(true);
          const a = alphaOf(pov, t);
          if (a <= 0) { expect(added).toEqual([]); return; }
          expect(added.length).toBeGreaterThan(0);
          // Inside the HUD's 640 x 448 frame (`PS2`: the quads are in its own space, one unit a pixel): every quad whole.
          for (const q of added) {
            const b = boxOf(q);
            expect(b.x, `${q.texture} left`).toBeGreaterThanOrEqual(0);
            expect(b.y, `${q.texture} top`).toBeGreaterThanOrEqual(0);
            expect(b.x + b.w, `${q.texture} right`).toBeLessThanOrEqual(PS2.width);
            expect(b.y + b.h, `${q.texture} bottom`).toBeLessThanOrEqual(PS2.height);
          }
          // Crossing nothing the HUD draws there: its named rects, whether or not drawn on this path, and every quad drawn
          // without the line (the original help lines', the panel's, the text line's, the voice element's, the hold bar's).
          for (const q of added) {
            for (const [name, r] of NAMED) expect(crosses(boxOf(q), r), `${q.texture} crosses the ${name}`).toBe(false);
            for (const o of without) expect(crosses(boxOf(q), boxOf(o)), `${q.texture} crosses a ${o.element} quad (${o.texture})`).toBe(false);
          }
          // The text pass at the line's own alpha, the font's glyphs in the help lines' colour (100, 100, 20) (the pad's
          // Cross glyph in its own); the shadow, black, at min(alpha, 96).
          const black = (q: HudQuad): boolean => q.rgba[0] === 0 && q.rgba[1] === 0 && q.rgba[2] === 0;
          const ink = added.filter((q) => !black(q));
          expect(ink.length).toBeGreaterThan(0);
          for (const q of ink) expect(q.rgba[3]).toBe(a);
          for (const q of ink.filter((x) => x.texture === 'font_text_01.tif')) expect(q.rgba).toEqual([100 / 128, 100 / 128, 20 / 128, a]);
          for (const q of added.filter(black)) expect(q.rgba[3]).toBeCloseTo(Math.min(a * 128, 96) / 128, 10);
        });
      }
    }
  }

  it("its place is the help block's grid three lines above its first, the same on all three paths: the words as help line 0 would draw them, 54 higher", () => {
    // The words drawn as a help line 0 (the teammate path's draw of `help`), lit: the same quads but 3 x 18 = 54 higher.
    for (const pov of STATES) {
      const asLine0: HudSpectatorView = { path: 'teammate', followed: { name: 'BRAVO', health: null }, stats: null, help: [pov === 'offered' ? POV_HELP_OFFERED_ADAPTATION : POV_HELP_SHOWN_ADAPTATION] };
      const line0 = quadsOf(asLine0, LIT).filter((q) => q.element === 'help');
      const addedOn = (path: keyof typeof PATHS): HudQuad[] => split(quadsOf(PATHS[path](pov), LIT), quadsOf(PATHS[path](null), LIT)).added;
      const follow = addedOn('follow');
      expect(addedOn('dead'), pov).toEqual(follow);
      expect(addedOn('ghost'), pov).toEqual(follow);
      expect(follow.length).toBe(line0.length);
      follow.forEach((q, i) => {
        const o = line0[i]!;
        expect({ ...q, y: 0, rgba: [] }).toEqual({ ...o, y: 0, rgba: [] });
        expect(q.y).toBeCloseTo(o.y - 3 * SPECTATOR_HELP.pitch, 9);
        if (pov !== 'waiting') expect(q.rgba).toEqual(o.rgba);   // 'offered' lit and 'shown': the lines' own alpha
      });
    }
  });

  it("nothing drawn on 'own', in the free and scenic cameras, or for a respawn seat watching (not benched): no state, the same quads", () => {
    const own = spectatorHudView(source('player', { benched: true, ...getters('shown') }), deadWalker)!;
    expect('pov' in own).toBe(false);
    for (const t of [LIT, FADED]) expect(quadsOf({ ...VIEWS.own, pov: 'shown' }, t)).toEqual(quadsOf(VIEWS.own, t));   // a stray state on 'own' draws nothing
    // The choice outlives follow <-> free (`SpectatorView.pov`): in free or scenic it shows nothing.
    expect(spectatorHudView(source('spectator', getters('waiting')), flying)).toEqual(VIEWS.free);
    expect(spectatorHudView(source('spectator', { mode: 'scenic', scenic: 0, ...getters('shown') }), flying)).toEqual(VIEWS.scenic);
    expect('pov' in spectatorHudView(source('player', { watching: 3, benched: false, ...getters('offered') }), deadWalker)!).toBe(false);
  });

  it('hidden wherever the help lines are: under the scoreboard, with SPECTATOR HUD off, with the Chat menu open', () => {
    for (const path of ['follow', 'dead', 'ghost'] as const) {
      for (const pov of STATES) {
        for (const over of [{ scoreboard: true }, { spectatorHud: false }, { commandMenu: true }] as Partial<HudModel>[]) {
          const drawn = quadsOf(PATHS[path](pov), LIT, over);
          expect(drawn.filter((q) => q.element === 'help'), `${path} ${pov} ${JSON.stringify(over)}`).toEqual([]);
          expect(drawn).toEqual(quadsOf(PATHS[path](null), LIT, over));
        }
      }
    }
  });
});
