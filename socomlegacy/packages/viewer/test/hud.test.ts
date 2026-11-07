import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Mesh, Vector2 } from 'three';
import { parseZdb } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import {
  ACTION_BOMB_CAPTION_IDS, ACTION_CAPTION_TEXT, ACTION_ICON_FADE, ACTION_ICONS, ACTION_PROMPT_COLOUR, ACTION_RECORD_CAPTIONS, AT_REST,
  actionCaptionOf, MAP_ACTION_CAPTION_READING, VICTORY_CAPTION_READING, DEFAULT_MODEL, DEFAULT_ROUND, FIRE_MODE_ROUNDS, HUD_LAYOUT, Hud, ammoLines, hudLayout, roundStartAt, timerText, capLines, messageAlpha,
  compassMarks, DEFUSE_TIMER_LAYOUT_READING, EXTRACT_CAPTION_READING, gameCaption, HOLD_BAR_FADE, HUD_COLOURS, hudPass,
  BASE_MARK_TYPE_RGB_READING, OBJECTIVE_MARK_RGB_READING, OBJECTIVE_POST_OFFSET_READING, SPAWN_FADE, STANCE_FADE, type HudModel, type RoundInfo,
} from '../src/hud';
import {
  helpAlpha, infoBoxName, SCOREBOARD_HIDES, SPECTATOR_HELP, SPECTATOR_HIDES, SPECTATOR_INFO_LAYOUT, spectatorHudView, spectatorInfoText, taggedName,
  TEAMMATE_HIDES,
  ownHudName, SPECTATOR_TITLE_TAG_MIN, spectatorTitleName, type HudSpectatorView, type OwnNameSource, type SpectatorHudSource,
} from '../src/hud';
import type { ScenicView } from '../src/mapMeta';
import { deadHelpLines } from '../src/weaponSelect';
import { buildGrid, DEFAULT_RIFLE, GAME_FRAME_DT, type WeaponRecord } from '@s2u/scene';
import { Fire } from '../src/fire';
import { netMagsHidden } from '../src/net/netRefill';
import { flipRows, HUD_LIBRARIES, readHud } from '../src/hudAssets';
import { FONT_TEXT_01, layoutText, PEN_NUDGE, textWidth } from '../src/hudFont';
import {
  GS_SAMPLE_OFFSET, MP_TEAM_TAG_COLOUR_READING, ROUND_SCREEN_HIDES, TEAM_TAG_LAYOUT, teamTagLayout, type HudQuad, type HudTri,
} from '../src/hud';
import { TEAMMATE_NAME_DISTANCE_ADAPTATION, TEAMMATE_NAMES_ORIGINAL_VALUE, type TeamTagsView } from '../src/hudTags';
import { CONTROLS, type ChoiceControl } from '../src/modern/settings/model';
import { MESSAGE_WRAP_WIDTH, messageMeasureScale, wrapMessageLine } from '../src/hudMessagePanel';
import { eliminationLines } from '../src/net/rules';
import { integerFit, UI_SAMPLING_DEFAULTS, type UiSamplingSettings } from '../src/experimentalUiSampling';

/**
 * The in-game HUD (socomlegacy/docs/research/87-hud.md): its layout against `CHUD`'s constants and the console frames, and its
 * bitmaps off Frostfire's four HUD libraries.
 */

const PS2 = { width: 640, height: 448 };
/** The bitmaps' sizes as Frostfire's archive decodes them (research 87 §2). */
const SIZES: Record<string, { width: number; height: number }> = {
  'newweapnbkrnd.tif': { width: 128, height: 64 }, 'm4carbine_icon.tif': { width: 128, height: 32 },
  'firemode.tif': { width: 32, height: 16 }, 'compass_lo.tif': { width: 128, height: 128 },
  'font_text_01.tif': { width: 512, height: 128 }, 'action_climb.tif': { width: 64, height: 64 },
  'action_x.tif': { width: 32, height: 32 }, white: { width: 1, height: 1 },
};
const model = (over: Partial<HudModel> = {}): HudModel => ({ ...DEFAULT_MODEL, ...over });

// The area (c) review's finding 3 (BOTS-LAND): a hit does not tint the filled bar. `FUN_00241cc0` (D:L89935-90039) draws
// on a decrease a third rect, the lost chunk, not a tint over what remains -- its own task, LATER 392. Until then every
// player's bar is the HUD's health colour, hit or not.
it('a hit leaves the health bar in the HUD\'s health colour (no tint over the remaining fill; LATER 392)', () => {
  const hud = new Hud();
  hud.setHealth(1);
  hud.setHealth(0.6);
  const timing = hud.timing() as unknown as Record<string, unknown>;
  expect(timing['healthFlash']).toBeUndefined();
  const hit = hudLayout(PS2, model({ health: 0.6 }), SIZES, hud.timing());
  const bars = hit.quads.filter((q) => q.element === 'bar');
  expect(bars.map((q) => q.rgba)).toEqual([HUD_COLOURS.health, HUD_COLOURS.healthLost]);   // the fill, then what is gone
});

it('renders original taunt color5 and opacity without changing ordinary HUD text', () => {
  const draw = hudLayout(PS2, model({ banner: [{ alpha: 1, lines: [{ text: 'TAUNT', scale: .9, rgb: [1, .5, .5], opacity: 100 / 128 }] }] }), SIZES);
  const glyphs = draw.quads.filter(q => q.element === 'message' && q.rgba[0] > 0);
  expect(glyphs.length).toBeGreaterThan(0);
  expect(glyphs[0]!.rgba).toEqual([1, .5, .5, 100 / 128]);
});

describe('the ammo box', () => {
  it('formats the console\'s lines: "30/30", "2 MAGS", "1 MAG", and no magazine line with none spare', () => {
    expect(ammoLines({ rounds: 30, capacity: 30, spare: 2 })).toEqual({ rounds: '30/30', mags: '2 MAGS' });
    expect(ammoLines({ rounds: 7, capacity: 30, spare: 1 }).mags).toBe('1 MAG');
    expect(ammoLines({ rounds: 0, capacity: 30, spare: 0 }).mags).toBeNull();
    expect(timerText(289)).toBe('04:49');
    expect(timerText(360)).toBe('06:00');
  });

  it('puts the panel, the icon and the rounds where CHUD does (the console frame\'s pixels, research 87 §1)', () => {
    const { rects, scale } = hudLayout(PS2, model(), SIZES);
    expect(scale).toBe(1);
    // DAT_003dcb90..a8: -10, 364, 170, 75 -- the frame's panel x 0-159 (its left edge off-screen), y 364-438.
    expect(rects.panel).toEqual({ x: -10, y: 364, width: 170, height: 75 });
    expect(rects.icon).toEqual({ x: 20, y: 389, width: 128, height: 32 });
    // Three rounds at x 10, 51, 87 (15 + 36i, the first moved to 10), y 422: the frame's burst.
    expect(rects.firemode).toEqual({ x: 10, y: 422, width: 87 + 32 - 10, height: 16 });
  });

  it('shows one, three or four rounds by fire mode (FUN_00237b40)', () => {
    for (const [mode, n] of Object.entries(FIRE_MODE_ROUNDS)) {
      const { quads } = hudLayout(PS2, model({ fireMode: mode as HudModel['fireMode'] }), SIZES);
      expect(quads.filter((q) => q.element === 'firemode')).toHaveLength(n);
    }
  });

  it('a launcher\'s round mode: the four rounds hidden, the round\'s icon in the first cell (FUN_00237b40; research 94 §C9)', () => {
    const sizes = { ...SIZES, 'firemode_203_frag.tif': { width: 32, height: 16 } };
    const { quads, rects } = hudLayout(PS2, model({ fireMode: 'auto', fireModeIcon: 'firemode_203_frag.tif' }), sizes);
    const cells = quads.filter((q) => q.element === 'firemode');
    expect(cells).toHaveLength(1);
    expect(cells[0]!.texture).toBe('firemode_203_frag.tif');
    expect(rects.firemode).toEqual({ x: 10, y: 422, width: 32, height: 16 });
  });

  it('no fire-mode row while a throwable, a charge or the Detonator is up (FUN_005bc300: classes 121, 151, 190 ... L85207-85232; the capture h00)', () => {
    const { quads, rects } = hudLayout(PS2, model({ fireMode: 'burst', fireModeRow: false }), SIZES);
    expect(quads.filter((q) => q.element === 'firemode')).toEqual([]);
    expect(rects.firemode).toBeUndefined();
    const launcher = hudLayout(PS2, model({ fireModeRow: false, fireModeIcon: 'firemode_203_frag.tif' }), { ...SIZES, 'firemode_203_frag.tif': { width: 32, height: 16 } });
    expect(launcher.quads.filter((q) => q.element === 'firemode')).toEqual([]);
    expect(hudLayout(PS2, model(), SIZES).quads.filter((q) => q.element === 'firemode')).toHaveLength(3);   // default: shown
  });

  it('draws the two lines at scale 0.9 from pens 15 and 95 on the baseline 382', () => {
    const { rects } = hudLayout(PS2, model(), SIZES);
    expect(rects.rounds!.x).toBeCloseTo(15 + PEN_NUDGE, 9);                // the first glyph's quad (the shadow falls right)
    expect(rects.rounds!.y + rects.rounds!.height).toBeGreaterThan(382);   // the cell's foot below the baseline
    expect(rects.rounds!.y).toBeLessThan(370);
    expect(rects.mags!.x).toBeGreaterThan(94);
    expect(rects.mags!.x).toBeLessThan(96);
  });

  it('fades in on a spawn: nothing at fade 0', () => {
    const { quads } = hudLayout(PS2, model(), SIZES, { ...AT_REST, fade: 0 });
    expect(quads.filter((q) => ['panel', 'icon', 'firemode', 'rounds', 'mags'].includes(q.element))).toEqual([]);
  });
});

describe('the compass', () => {
  it('is compass_lo at 0.75 (96x96) centred on (565, 90), turned clockwise by the heading', () => {
    const at = (yaw: number) => hudLayout(PS2, model({ yaw }), SIZES).quads.find((q) => q.element === 'compass')!;
    const q = at(0);
    expect([q.x, q.y, q.w, q.h, q.turn]).toEqual([565, 90, 96, 96, 0]);
    // The console frame at spawn looks down +z (research 17: the eye's z 832 behind the target's 858) and shows N at the
    // bottom: +z is the viewer's yaw 180, a half turn.
    expect(at(180).turn).toBeCloseTo(Math.PI, 12);
    expect(at(90).turn).toBeCloseTo(Math.PI / 2, 12);
    expect(q.rgba[3]).toBeCloseTo(100 / 128, 12);
  });

  it('keeps its margin to the right edge on a wide native frame', () => {
    const q = hudLayout({ width: 1600, height: 896 }, model(), SIZES).quads.find((x) => x.element === 'compass')!;
    expect(q.w).toBe(192);
    expect(1600 - q.x).toBeCloseTo((640 - 565) * 2, 9);
    expect(q.y).toBe(180);
  });
});

describe('the info box, the stance word, the prompt and the banner', () => {
  it('the health bar is (488, 396) 134x18, green (0, 128, 64) at alpha 80; the timer and range on 433', () => {
    const { rects, quads } = hudLayout(PS2, model({ range: 2 }), SIZES);
    expect(rects.bar).toEqual({ x: 488, y: 396, width: 134, height: 18 });
    expect(quads.find((q) => q.element === 'bar')!.rgba).toEqual([0, 128 / 255, 64 / 255, 80 / 128]);
    expect(rects.timer).toBeDefined();
    expect(rects.range).toBeDefined();
    expect(hudLayout(PS2, model({ range: null }), SIZES).rects.range).toBeUndefined();
  });

  it('the stance word is right-aligned to x 480 and only while its alpha lasts', () => {
    expect(hudLayout(PS2, model({ stance: 'crouch' }), SIZES).rects.stance).toBeUndefined();
    const { rects } = hudLayout(PS2, model({ stance: 'crouch' }), SIZES, { ...AT_REST, stance: 1 });
    // The shadow's glyphs run 0.765 px past the text's right end.
    expect(rects.stance!.x + rects.stance!.width).toBeGreaterThan(478);
    expect(rects.stance!.x + rects.stance!.width).toBeLessThan(482);
  });

  it('the climb prompt is action_climb, 50x50 centred on x 306, y 365..415, green pulsing', () => {
    // LkPaioX5: the CLIMB record's colour byte is entry 1, green (`FUN_0021ded0` D:L73613; research 87 §5).
    const rest = hudLayout(PS2, model({ action: 'climb' }), SIZES);
    expect(rest.rects.action).toEqual({ x: 281, y: 365, width: 50, height: 50 });
    const q = rest.quads.find((x) => x.element === 'action')!;
    expect(q.texture).toBe(ACTION_ICONS.climb);
    expect(q.rgba).toEqual([24 / 128, 80 / 128, 24 / 128, 90 / 128]);   // LkPaioX5 (a): the head at its cap, 90 (ACTION_ICON_FADE; was 1)
    const lit = hudLayout(PS2, model({ action: 'climb' }), SIZES, { ...AT_REST, pulse: 1 }).quads.find((x) => x.element === 'action')!;
    expect(lit.rgba).toEqual([48 / 128, 160 / 128, 48 / 128, 90 / 128]);
    // An icon the archive lacks falls back to action_x, as the game's does.
    expect(hudLayout(PS2, model({ action: 'knife' }), SIZES).quads.find((x) => x.element === 'action')!.texture).toBe('action_x.tif');
  });

  it('the message banner is centred under the top edge', () => {
    const { rects } = hudLayout(PS2, model({ message: 'STARTING ROUND 1 OF 11' }), SIZES);
    expect(rects.banner).toEqual({ x: 147, y: 0, width: 345, height: 99 });
    const m = rects.message!;
    expect(Math.abs(m.x + m.width / 2 - HUD_LAYOUT.message.text.x)).toBeLessThan(1.5);
  });
});

describe('the round start', () => {
  it('fades up from black; STARTING ROUND at 0.36 s, the objective at 5.36 s, each 0.357 s in, out from 7 s on', () => {
    const at = (t: number) => roundStartAt(t);
    const alphas = (t: number) => at(t).banner.map((m) => Math.round(m.alpha * 100) / 100);
    expect(at(0).fader).toBe(1);
    expect(at(0.75).fader).toBeCloseTo(0.5, 9);
    expect(at(1.5).fader).toBe(0);
    expect(at(0.3).banner).toEqual([]);
    expect(at(0.54).banner.map((m) => m.lines.map((l) => l.text))).toEqual([['STARTING ROUND 1 OF 11']]);
    expect(alphas(0.54)).toEqual([0.5]);
    expect(alphas(3)).toEqual([1]);
    // The console's frame 26 (t = 5.58): the first line full, the objective coming in (0.62).
    expect(alphas(5.58)).toEqual([1, 0.62]);
    expect(at(5.58).banner[1]!.lines).toEqual([{ text: 'OBJECTIVE:', scale: 1 }, { text: 'ELIMINATE THE TERRORISTS', scale: 0.765 }]);
    // Frame 28 (7.58): the first line fading (0.39 measured); frame 33 (12.58): the objective fading (0.39).
    expect(alphas(7.58)).toEqual([0.38, 1]);
    expect(alphas(12.58)).toEqual([0.38]);
    expect(at(12.8).banner).toEqual([]);
  });

  it("the OBJECTIVE lines post at the script's wait plus the window's 0.36 s: 5.36 on Vigilance, 3.36 on Crossroads", () => {
    expect(OBJECTIVE_POST_OFFSET_READING).toBe(0.36);
    const texts = (t: number, r?: RoundInfo): string[] => roundStartAt(t, r).banner.map((m) => m.lines.map((l) => l.text).join('/'));
    // Vigilance (the capture's round, research 87 s8): start's WAIT 5, then the two lines.
    expect(texts(5.35)).toEqual(['STARTING ROUND 1 OF 11']);
    expect(texts(5.37)).toEqual(['STARTING ROUND 1 OF 11', 'OBJECTIVE:/ELIMINATE THE TERRORISTS']);
    // Crossroads (MP72 start: WAIT 3, mp72LOC 7200/7201 for both sides).
    const crossroads: RoundInfo = { round: 1, rounds: 11, objective: [
      { text: 'OBJECTIVE:', scale: 0.9, waitBefore: 3 }, { text: 'FIND THE BOMB AND DESTROY THE ENEMY BASE WITH IT', scale: 0.7, waitBefore: 0 },
    ] };
    expect(texts(3.35, crossroads)).toEqual(['STARTING ROUND 1 OF 11']);
    // TAUNT-WRAP: the objective is a post of FUN_002b6530 (FUN_00267760 D:L113376) at the script's 0.7, measured at
    // 0.7 x 1.1429 (D:L157983-157987): wider than 297, so it wraps at a space into two lines of the window.
    const FIND = 'FIND THE BOMB AND DESTROY THE ENEMY BASE WITH IT';
    const pieces = wrapMessageLine(FIND, messageMeasureScale(0.7));
    expect(pieces).toHaveLength(2);
    expect(pieces.join(' ')).toBe(FIND);
    expect(texts(3.37, crossroads)).toEqual(['STARTING ROUND 1 OF 11', ['OBJECTIVE:', ...pieces].join('/')]);
    expect(roundStartAt(3.5, crossroads).banner[1]!.lines).toEqual([
      { text: 'OBJECTIVE:', scale: 1 }, ...pieces.map((text) => ({ text, scale: 0.765 })),
    ]);
    // The Mixer's SEALs: a third line after the script's WAIT 2, a message of its own at 7.36 s.
    const mixer: RoundInfo = { round: 1, rounds: 11, objective: [
      { text: 'OBJECTIVE:', scale: 0.9, waitBefore: 5 }, { text: 'PROTECT THE VIPS AND ESCORT THEM TO SAFETY.', scale: 0.7, waitBefore: 0 },
      { text: 'MOVE AT LEAST TWO VIPS TO THE EXTRACTION ZONE FOR IMMEDIATE EXTRACTION.', scale: 0.7, waitBefore: 2 },
    ] };
    expect(texts(7.35, mixer)).toHaveLength(2);
    const MOVE = 'MOVE AT LEAST TWO VIPS TO THE EXTRACTION ZONE FOR IMMEDIATE EXTRACTION.';
    expect(texts(7.37, mixer).at(-1)).toBe(wrapMessageLine(MOVE, messageMeasureScale(0.7)).join('/'));
    expect(texts(7.37, mixer).at(-1)!.split('/').map((l) => l.trimStart()).join(' ')).toBe(MOVE);
    // No script lines (a map without its objectives): the banner alone.
    expect(texts(6, { round: 2, rounds: 11, objective: [] })).toEqual(['STARTING ROUND 2 OF 11']);
  });

  it('stacks the lines up from the bottom: one line on 94; three on 61.5, 76.5 and 91.5 (the ink feet on the Vigilance frames)', () => {
    const baselines = (t: number): number[] => {
      const { banner } = roundStartAt(t);
      const q = hudLayout(PS2, model({ banner }), SIZES).quads.filter((x) => x.element === 'message' && x.rgba[0] === 1);
      // Each line's glyph quads share a top; the baseline is that top + 20 rows x scale x 448/480 - 0.3.
      const tops = [...new Set(q.map((x) => Math.round((x.y - x.h / 2) * 100) / 100))];
      return tops.map((top) => {
        const h = q.find((x) => Math.round((x.y - x.h / 2) * 100) / 100 === top)!.h;
        return Math.round((top + (h * 20) / 25 - 0.3) * 10) / 10;
      });
    };
    expect(baselines(3)).toEqual([94]);
    expect(baselines(6.5).sort((a, b) => a - b)).toEqual([61.5, 76.5, 91.5]);
  });
});

describe('the zoom readout and the scope range (research 87 §13)', () => {
  it('writes "ZOOM: %2.1fx" at (20, 420) and "RANGE(m): %.0f" at (415, 215), scale 0.9, only over 1.01', () => {
    expect(hudLayout(PS2, model({ zoom: 1 }), SIZES).rects.zoom).toBeUndefined();
    expect(hudLayout(PS2, model({ zoom: 1.01 }), SIZES).rects.zoom).toBeUndefined();
    const { quads, rects } = hudLayout(PS2, model({ zoom: 3, range: 37.4 }), SIZES);
    expect(rects.zoom!.x).toBeCloseTo(20 - 0.6, 6);                    // the pen at 20 (PEN_NUDGE)
    expect(rects.scopeRange!.x).toBeCloseTo(415 - 0.6, 6);
    // "ZOOM: 3.0x" is 10 glyphs less the space; "RANGE(m): 37" 12 less the space, each with its shadow.
    expect(quads.filter((q) => q.element === 'zoom')).toHaveLength(2 * 9);
    expect(quads.filter((q) => q.element === 'scopeRange')).toHaveLength(2 * 11);
    const dashes = hudLayout(PS2, model({ zoom: 9, range: null }), SIZES).quads.filter((q) => q.element === 'scopeRange');
    expect(dashes).toHaveLength(2 * 13);                                // "RANGE(m): ----"
  });

  it('in the binoculars: "ZOOM: 9.0x" (FUN_001f6ce0 case 4) and the RANGE line at (515, 40) (ChangeReticule type 7)', () => {
    const { quads, rects } = hudLayout(PS2, model({ zoom: 9, binoculars: true, range: 120 }), SIZES);
    expect(rects.zoom!.x).toBeCloseTo(20 - 0.6, 6);
    expect(quads.filter((q) => q.element === 'zoom')).toHaveLength(2 * 9);   // "ZOOM: 9.0x"
    expect(rects.scopeRange!.x).toBeCloseTo(515 - 0.6, 6);
    expect(rects.scopeRange!.y).toBeLessThan(40);                       // the baseline at 40, the ink above it
  });
});

describe('the message window', () => {
  it('fades a posted line in over 0.357 s and out from 7 s, and keeps the newest 8 lines', () => {
    expect(messageAlpha(-0.1)).toBeNull();
    expect(messageAlpha(50 / 280)).toBeCloseTo(0.5, 9);
    expect(messageAlpha(3)).toBe(1);
    expect(messageAlpha(7 + 50 / 280)).toBeCloseTo(0.5, 9);
    expect(messageAlpha(7.4)).toBeNull();
    const m = (n: number) => ({ lines: Array.from({ length: n }, (_, i) => ({ text: String(i), scale: 1 })), alpha: 1 });
    expect(capLines([m(3), m(3), m(3)]).map((x) => x.lines.length)).toEqual([3, 3]);
    expect(capLines([m(1), m(7)]).map((x) => x.lines.length)).toEqual([1, 7]);
  });

  it('shows a posted message under those of the round start, and drops it 7.36 s later', () => {
    const hud = new Hud();
    hud.setVisible(true);
    hud.startRound(DEFAULT_ROUND);                     // PAR-94c: the round start is a round's (was: played by the show)
    hud.step(6);
    hud.postMessage('Satchel');
    hud.step(1);
    const texts = hud.state().model.banner.map((b) => b.lines.map((l) => l.text).join('/'));
    expect(texts).toEqual(['STARTING ROUND 1 OF 11', 'OBJECTIVE:/ELIMINATE THE TERRORISTS', 'Satchel']);
    expect(hud.state().model.banner[2]!.lines[0]!.scale).toBe(0.9);
    hud.step(6.5);
    expect(hud.state().model.banner.map((b) => b.lines[0]!.text)).toEqual([]);
  });

  // TAUNT-WRAP (task 8mqnCJBx; reading, pending review): `FUN_002b6530` wraps every post wider than 297 at a space,
  // each piece its own line of the window (D:L158010-158055) -- the kill feed's, the chat's and the taunts' alike.
  it('wraps a post wider than the window at a space, each piece a line of the window, its colour kept; a short one unchanged', () => {
    const hud = new Hud();
    hud.setVisible(true);
    const long = 'WWWWWWWWWWWWWWWW : CAN YOU FEEL THE LOVE? IT FEELS LIKE BULLETS!';
    hud.postMessage([{ text: long, scale: 0.9, rgb: [1, 0.5, 0.5], opacity: 100 / 128 }]);
    hud.postMessage('Satchel');
    hud.step(1);
    const [taunt, short] = hud.state().model.banner;
    expect(taunt!.lines.length).toBe(2);
    expect(taunt!.lines.map((l) => l.text).join(' ')).toBe(long);
    for (const l of taunt!.lines) {
      expect(textWidth(l.text, l.scale)).toBeLessThanOrEqual(MESSAGE_WRAP_WIDTH);
      expect(l).toMatchObject({ scale: 0.9, rgb: [1, 0.5, 0.5], opacity: 100 / 128 });
    }
    expect(short!.lines).toEqual([{ text: 'Satchel', scale: 0.9 }]);
    for (let i = 0; i < 3; i++) hud.postMessage(long);                 // 2 + 1 + 3 x 2 = 9 lines: the window keeps 8
    hud.step(0.1);
    expect(hud.state().model.banner.reduce((n, b) => n + b.lines.length, 0)).toBeLessThanOrEqual(8);
  });

  it("measures a script's post at its scale x 1.1429 and a post of the window's own at 0.9 (D:L157983-157987)", () => {
    // A text that fits at 0.9 and not at 0.9 x 1.1429: one line as the window's own post, two as a script's 0.9 post.
    let text = 'AB';
    while (textWidth(`${text} AB`, 0.9) <= MESSAGE_WRAP_WIDTH) text += ' AB';
    expect(textWidth(text, 0.9)).toBeLessThanOrEqual(MESSAGE_WRAP_WIDTH);
    expect(textWidth(text, messageMeasureScale(0.9))).toBeGreaterThan(MESSAGE_WRAP_WIDTH);
    const lines = (post: (h: Hud) => void): { text: string; scale: number }[] => {
      const hud = new Hud(); hud.setVisible(true); post(hud); hud.step(1);
      return hud.state().model.banner.flatMap((b) => b.lines);
    };
    expect(lines((h) => h.postMessage(text))).toEqual([{ text, scale: 0.9 }]);
    expect(lines((h) => h.postMessage([{ text, scale: 0.9 }]))).toEqual([{ text, scale: 0.9 }]);
    const script = lines((h) => h.postMessage(text, 0.9));          // `./roundAudio`'s and the bomb's posts: the script's scale
    expect(script.length).toBe(2);
    for (const l of script) expect(textWidth(l.text, messageMeasureScale(0.9))).toBeLessThanOrEqual(MESSAGE_WRAP_WIDTH);
    expect(script.every((l) => l.scale === 0.9)).toBe(true);          // drawn as before, at the scale the page gives
  });

  it("the elimination's script lines carry their script scale as `post`, and a long one is measured at it (re-review F1)", () => {
    // `eliminationLines` (MP51 `start`'s MESSAGEs, mp51LOC 5103-5106): 0.7 and 0.9, posted by `FUN_00267760` (D:L113376).
    for (const w of ['seal', 'terrorist'] as const) {
      for (const l of eliminationLines(w)) expect(l.post).toBe(l.scale);
    }
    // A text that fits at 0.7 x 1.1429 = 0.8 and not at the window's 0.9: one line as a script's 0.7 post.
    let text = 'AB';
    while (textWidth(`${text} AB`, messageMeasureScale(0.7)) <= MESSAGE_WRAP_WIDTH) text += ' AB';
    expect(textWidth(text, 0.9)).toBeGreaterThan(MESSAGE_WRAP_WIDTH);
    const posted = (line: { text: string; scale: number; post?: number }): number => {
      const hud = new Hud(); hud.setVisible(true); hud.postMessage([line]); hud.step(1);
      return hud.state().model.banner.flatMap((b) => b.lines).length;
    };
    expect(posted({ text, scale: 0.7, post: 0.7 })).toBe(1);
    expect(posted({ text, scale: 0.7 })).toBe(2);                    // without `post`: the window's 0.9
  });
});

/**
 * PAR-94c (issue #262; reading, pending review): what restarts the round start. The round's HUD reset `FUN_001fb420`
 * posts "STARTING ROUND %d OF %d" (D:L57632-57648) at a round's or a level's (re)start (`FUN_002a7d40` D:L149755-149758,
 * `FUN_001ecb10` D:L51046-51052), never at a show; the HUD's init for a level `FUN_001fa360` starts the fader (D:L57476)
 * and the ammo box's fade (D:L57489); the show of the HUD's parts `FUN_001f7a90` (D:L56366-56447) writes neither. So
 * `setVisible(true)` restarts nothing and a posted line keeps its age across it; `setBitmaps` (the map's init) restarts
 * the fader and the box's fade and empties the message window (the old level's teardown, D:L50610 -> D:L58245);
 * `startRound` the round's banner and objective and an empty message window -- not the fader nor the box's fade, which are
 * the level's (PAR-94d, R322.8; was: "`startRound` the whole round start"), but at a new match started in place (PAR-94d
 * F1, below).
 */
describe("PAR-94c: the round start restarts at a round's start, not at a show of the HUD", () => {
  const px = (): { width: number; height: number; data: Uint8ClampedArray } => ({ width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) });
  const texts = (hud: Hud): string[] => hud.state().model.banner.map((b) => b.lines.map((l) => l.text).join('/'));

  it('a show plays no round banner before a round starts, and keeps a line posted while hidden; startRound plays the banner', () => {
    const hud = new Hud();
    hud.setVisible(true); hud.step(30); hud.setVisible(false);
    hud.postMessage('GAME STARTS IN 10 SECONDS');
    hud.step(2);                                        // hidden: the HUD's clock holds, the line's age with it
    hud.setVisible(true); hud.step(1);
    expect(texts(hud)).toEqual(['GAME STARTS IN 10 SECONDS']);
    expect(hud.postsForDev()[0]!.age).toBeCloseTo(1, 9);
    expect(hud.timing().fade).toBe(1);                  // the box not faded again by the show
    expect(hud.state().model.fader).toBe(0);
    hud.startRound(DEFAULT_ROUND); hud.step(1);
    expect(texts(hud)).toEqual(['STARTING ROUND 1 OF 11']);
    // PAR-94d (R322.8, D6 closed): the round start fades the box no more. Was: 0, "the port's round start fades the box again".
    expect(hud.timing().fade).toBe(1);
    hud.step(15); hud.setVisible(false); hud.step(1); hud.setVisible(true); hud.step(1);   // past the objective's 12.7 s
    expect(texts(hud)).toEqual([]);                     // a later show: no second round start
  });

  it("a new HUD shown before any round: the fader and the box's fade of its init, no banner", () => {
    const hud = new Hud();
    hud.setVisible(true); hud.step(0.6);
    expect(texts(hud)).toEqual([]);
    expect(hud.state().model.fader).toBeCloseTo(1 - 0.6 / 1.5, 9);
    expect(hud.timing().fade).toBe(0);
  });

  it("a map's bitmaps (the HUD's init for its level) restart the fader and the box's fade, empty the message window, and start no round", () => {
    const hud = new Hud();
    hud.setVisible(true); hud.startRound(DEFAULT_ROUND); hud.step(20);
    hud.postMessage('Satchel'); hud.step(2);           // the old map's line, 2 s old
    hud.setVisible(false);                              // the walk off while the next map loads
    hud.setBitmaps({ 'newweapnbkrnd.tif': px() });      // the new map's HUD
    hud.setVisible(true); hud.step(0.6);
    expect(texts(hud)).toEqual([]);                     // the old map's line does not reach the new map's HUD
    expect(hud.postsForDev()).toEqual([]);
    expect(hud.state().model.fader).toBeCloseTo(1 - 0.6 / 1.5, 9);
    expect(hud.timing().fade).toBe(0);
  });
});

/**
 * PAR-94d (research 322 R322.8, D6; reading, pending review): one fade a level. The fader's start `FUN_00228b80` has one
 * caller, the HUD's init `FUN_001fa360` (D:L57476), itself called only from CoreState's Init `FUN_001ec480` (D:L50912;
 * vtable 0x404f60 +0x10); the ammo box's counter `DAT_003dc380` has two writers, that init (D:L57489) and the tactical
 * map's close `FUN_001f7030` (D:L56164). A round's start online -- `CMPExitState`'s `FUN_00223680` on game state 3 or 5
 * (D:L75935: `FUN_002a7d40`, D:L149675-149769, which calls none of them) then its pop (D:L75936), which resumes CoreState
 * through its OnPop `FUN_001ecb10` (vtable +0x24), not its Init -- re-runs neither. So `startRound` restarts the
 * banner's schedule, not the fader or the box's fade, which run from the map's init (`setBitmaps`).
 */
describe('PAR-94d: one fade a level -- a round start replays the banner, not the fader or the ammo box\'s fade (R322.8, D6)', () => {
  const px = (): { width: number; height: number; data: Uint8ClampedArray } => ({ width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) });
  const texts = (hud: Hud): string[] => hud.state().model.banner.map((b) => b.lines.map((l) => l.text).join('/'));

  it("a second startRound leaves the fader and the box's fade where they were; its banner plays from its own start", () => {
    const hud = new Hud();
    hud.setVisible(true); hud.startRound(DEFAULT_ROUND); hud.step(20);
    expect(hud.timing().fade).toBe(1);
    expect(hud.state().model.fader).toBe(0);
    hud.startRound({ round: 2, rounds: 11, objective: [] });
    hud.step(0.3);
    expect(texts(hud)).toEqual([]);                                      // 0.3 s: not yet posted (0.36 s)
    expect(hud.timing().fade).toBe(1);                                   // no second fade (was: 0)
    expect(hud.state().model.fader).toBe(0);                             // no second fader (was: 1 - 0.3 / 1.5)
    hud.step(0.06 + 50 / 280);
    expect(texts(hud)).toEqual(['STARTING ROUND 2 OF 11']);
    expect(hud.state().model.banner[0]!.alpha).toBeCloseTo(0.5, 6);     // half in, 0.36 + 0.179 s after the round's start
    hud.step(9);
    expect(texts(hud)).toEqual([]);                                      // gone with its 7 s and fade out
    expect(hud.timing().fade).toBe(1);
  });

  it("round 1's startRound after a map's init and a show: the fader and the box's fade run on from the init", () => {
    const hud = new Hud();
    hud.setBitmaps({ 'newweapnbkrnd.tif': px() });                      // the HUD's init for the level
    hud.setVisible(true); hud.step(0.6);                                 // the waiting room's spawn: the HUD on
    hud.startRound(DEFAULT_ROUND);                                       // the room's round 1
    hud.step(0.4);
    expect(hud.state().model.fader).toBeCloseTo(1 - 1.0 / 1.5, 9);      // 1.0 s from the init (was: 1 - 0.4 / 1.5)
    hud.step(0.25);
    expect(hud.timing().fade).toBeCloseTo(0.5, 9);                       // 1.25 s from the init (was: 0)
    expect(texts(hud)).toEqual(['STARTING ROUND 1 OF 11']);              // 0.65 s into the round: the banner in
    hud.step(1);
    expect(hud.timing().fade).toBe(1);
    expect(hud.state().model.fader).toBe(0);
  });

  it("the tactical map's close still restarts the box's fade (D:L56164), and a map's init the fader and the box's fade", () => {
    const hud = new Hud();
    hud.setVisible(true); hud.startRound(DEFAULT_ROUND); hud.step(20);
    hud.setTacMapOpen(true); hud.step(1); hud.setTacMapOpen(false); hud.step(1.25);
    expect(hud.timing().fade).toBeCloseTo(0.5, 9);
    hud.step(1);
    hud.setBitmaps({ 'newweapnbkrnd.tif': px() }); hud.step(0.3);
    expect(hud.state().model.fader).toBeCloseTo(1 - 0.3 / 1.5, 9);
    expect(hud.timing().fade).toBe(0);
  });

  /**
   * PAR-94d F1 (the fresh review): the port's room starts its next match in place, on the same map (room.ts
   * `startRound(st.matchOver)`; research 309 §7.1 item 1), where the original's next match goes back through the menu
   * and a new load -- `CMPExitState` on game state 1 pops and switches to the menu state 0x408538 (D:L75915-75917; the
   * host's `CloseAndSwitch`, `FUN_00281a70` D:L128127-128128), and CoreState 0x4085d0 is entered only from the load state
   * (D:L55753) -- so its HUD's init, and the fades, run again. A round no later than the last begun on the level is that
   * new match.
   */
  it('F1: a round 3 started, then a round 1 (a new match in place): the fader and the box\'s fade restart, the banner plays', () => {
    const hud = new Hud();
    hud.setBitmaps({ 'newweapnbkrnd.tif': px() });
    hud.setVisible(true); hud.startRound(DEFAULT_ROUND); hud.step(5);
    hud.startRound({ round: 2, rounds: 3, objective: [] }); hud.step(5);
    hud.startRound({ round: 3, rounds: 3, objective: [] }); hud.step(30);
    expect([hud.timing().fade, hud.state().model.fader]).toEqual([1, 0]);
    hud.startRound({ round: 1, rounds: 3, objective: [] });             // the next match's round 1
    hud.step(0.6);
    expect(hud.state().model.fader).toBeCloseTo(1 - 0.6 / 1.5, 9);      // was: 0
    expect(hud.timing().fade).toBe(0);                                   // was: 1
    expect(texts(hud)).toEqual(['STARTING ROUND 1 OF 3']);
    hud.step(0.65);
    expect(hud.timing().fade).toBeCloseTo(0.5, 9);
  });

  it('F1: after a map\'s init, round 1 then round 2: no re-fade (the first match\'s round 1 is the init\'s; PAR-94c/94d)', () => {
    const hud = new Hud();
    hud.setBitmaps({ 'newweapnbkrnd.tif': px() });
    hud.setVisible(true); hud.step(3);                                   // the waiting room: the init's fades played
    hud.startRound(DEFAULT_ROUND); hud.step(0.6);
    expect([hud.timing().fade, hud.state().model.fader]).toEqual([1, 0]);
    hud.step(20);
    hud.startRound({ round: 2, rounds: 11, objective: [] }); hud.step(0.6);
    expect([hud.timing().fade, hud.state().model.fader]).toEqual([1, 0]);
    expect(texts(hud)).toEqual(['STARTING ROUND 2 OF 11']);
  });
});

/**
 * PAR-94d row 2 (research 322 D7; reading, pending review): a spectator's banner is a round's. The round's HUD reset
 * `FUN_001fb420` posts "STARTING ROUND %d OF %d" under the network flag and the game object alone (D:L57632-57649), with
 * no test of the console's seat; its callers run on every console online -- `FUN_002a7d40` from CoreState's Init
 * (D:L50946, unconditional) and from `CMPExitState`'s round start (D:L75935), which a client pushes on the game state
 * alone (D:L151127-151134) -- so a spectator's console posts it at each round's start too, and at no other time. The
 * port's page starts the round on a spectator's HUD as on a player's (`NetPage.roundBanner`); the HUD draws the banner
 * only once a round has begun, a spectator's view included. Was (PAR-48): a spectator's view drew the round start's
 * banner off the HUD's own clock whether or not a round had begun, so after the test room's map switch (`setBitmaps`
 * zeroing the clock) a spectator saw the last round's banner again (D7).
 */
describe("PAR-94d: a spectator's banner is a round's (research 322 D7)", () => {
  const px = (): { width: number; height: number; data: Uint8ClampedArray } => ({ width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) });
  const texts = (hud: Hud): string[] => hud.state().model.banner.map((b) => b.lines.map((l) => l.text).join('/'));
  const WATCH: HudSpectatorView = { path: 'spectator', followed: null, stats: null };

  it('a spectator with no round started draws no banner; its round start draws it once', () => {
    const hud = new Hud();
    hud.setBitmaps({ 'newweapnbkrnd.tif': px() });
    hud.setSpectator(WATCH); hud.step(1);
    expect(texts(hud)).toEqual([]);                                      // was: 'STARTING ROUND 1 OF 11' off the HUD's clock
    hud.startRound({ round: 3, rounds: 11, objective: [] });
    const seen: string[][] = [];
    for (let i = 0; i < 100; i++) { hud.step(0.1); seen.push(texts(hud)); }
    expect(seen[5]).toEqual(['STARTING ROUND 3 OF 11']);
    expect(seen.at(-1)).toEqual([]);
    const shown = seen.map((l) => l.includes('STARTING ROUND 3 OF 11'));
    expect(shown.filter((on, i) => on && !shown[i - 1]).length).toBe(1);   // drawn once, one run of frames
  });

  it("after the test room's map switch a spectator draws no stale banner (D7)", () => {
    const hud = new Hud();
    hud.setBitmaps({ 'newweapnbkrnd.tif': px() });
    hud.setSpectator(WATCH); hud.startRound({ round: 4, rounds: 11, objective: [] }); hud.step(30);
    hud.setBitmaps({ 'newweapnbkrnd.tif': px() });                       // the next map's HUD, no round yet
    for (let i = 0; i < 80; i++) { hud.step(0.1); expect(texts(hud)).toEqual([]); }
  });
});

describe('Hud', () => {
  // LkPaioX5 (research 87 §5): each prompt's colour is its record's `+0xd0` byte, set once at `FUN_0021ded0`'s init
  // and read by `FUN_0021f210` (D:L73956, D:L74004); a map action's record (type 13) goes grey when the player may
  // not use it (D:L73957-73959). Reading, pending review.
  it('draws an ordinary prompt green, the knife, the restraint and the C4 red, and starts green', () => {
    const hud = new Hud();
    expect(hud.state().model.actionColour).toBe('green');
    for (const a of ['climb', 'ladder_slide', 'door', 'pickup', 'bomb', 'bomb_drop', 'button', 'lever', 'turret_mount',
      'turret_dismount', 'escortee', 'victory', 'action'] as const) {
      hud.setAction(a);
      expect([a, hud.state().model.actionColour]).toEqual([a, 'green']);
    }
    for (const a of ['c4', 'knife', 'restrain'] as const) {
      hud.setAction(a);
      expect([a, hud.state().model.actionColour]).toEqual([a, 'red']);
    }
    expect(Object.values(ACTION_PROMPT_COLOUR)).not.toContain('blue');
    const red = hudLayout(PS2, model({ action: 'c4', actionColour: 'red' }), SIZES).quads.find((x) => x.element === 'action')!;
    expect(red.rgba).toEqual([120 / 128, 0, 0, 90 / 128]);
  });

  it('greys a map action the player may not use, and only a map action', () => {
    const hud = new Hud();
    hud.setNearbyAction('door', false);
    expect(hud.state().model).toMatchObject({ action: 'door', actionColour: 'grey' });
    hud.setAction('c4');                                 // a caller's prompt over the door: its own colour
    expect(hud.state().model).toMatchObject({ action: 'c4', actionColour: 'red' });
    hud.setAction(null);                                 // the door's again, still unavailable
    expect(hud.state().model).toMatchObject({ action: 'door', actionColour: 'grey' });
    hud.setNearbyAction('door');
    expect(hud.state().model.actionColour).toBe('green');
    hud.setAction('lever', false);
    expect(hud.state().model.actionColour).toBe('grey');
    hud.setAction('knife', false);                       // no grey for a record that is not a map action's
    expect(hud.state().model.actionColour).toBe('red');
    const grey = hudLayout(PS2, model({ action: 'door', actionColour: 'grey' }), SIZES, { ...AT_REST, pulse: 1 }).quads.find((x) => x.element === 'action')!;
    expect(grey.rgba).toEqual([50 / 128, 50 / 128, 50 / 128, 90 / 128]);
  });

  it('shows the ledge prompt while the traversal says so, without taking another prompt\'s slot', () => {
    const hud = new Hud();
    hud.setClimbPrompt({ visible: true, kind: 'high' });
    expect(hud.state().model.action).toBe('climb');
    hud.setClimbPrompt({ visible: false, kind: 'high' });
    expect(hud.state().model.action).toBeNull();
    hud.setAction('pickup');
    hud.setClimbPrompt({ visible: true, kind: 'low' });
    expect(hud.state().model.action).toBe('pickup');
  });

  it('fades in over 1-1.5 s, flashes the stance word on a change and lets it go in 2 s', () => {
    const hud = new Hud();
    hud.setVisible(true);
    hud.step(0.5);
    expect(hud.timing().fade).toBe(0);
    hud.step(0.75);
    expect(hud.timing().fade).toBeCloseTo(0.5, 9);
    hud.step(1);
    expect(hud.timing().fade).toBe(1);
    hud.setStance('prone');
    expect(hud.timing().stance).toBeCloseTo(127 / 128, 9);
    hud.step(1);
    expect(hud.timing().stance).toBeCloseTo(63 / 128, 9);
    hud.step(1);
    expect(hud.timing().stance).toBe(0);
  });

  it('pulses the prompt 0 to 1 and back at 5 a second, and drops a message when its time is up', () => {
    const hud = new Hud();
    hud.setAction('climb');
    hud.step(0.1);
    expect(hud.timing().pulse).toBeCloseTo(0.5, 9);
    hud.step(0.1);
    expect(hud.timing().pulse).toBe(1);
    hud.step(0.1);
    expect(hud.timing().pulse).toBeCloseTo(0.5, 9);
    hud.flashMessage('area secured', 1);
    expect(hud.state().model.message).toBe('AREA SECURED');
    hud.step(1.01);
    expect(hud.state().model.message).toBeNull();
  });

  it('feeds from the live state and holds still when frozen', () => {
    const hud = new Hud();
    hud.feed({ magazine: { rounds: 12, capacity: 30, spare: 1, reloading: false }, yaw: 45, stance: 'crouch', range: 7 });
    expect(hud.state().model).toMatchObject({ rounds: 12, spare: 1, yaw: 45, stance: 'crouch', range: 7 });
    hud.patch({ frozen: true, rounds: 30 });
    hud.feed({ magazine: { rounds: 1, capacity: 30, spare: 0, reloading: false }, yaw: 0 });
    expect(hud.state().model.rounds).toBe(30);
  });
});

describe('the bomb on the HUD (XR-06; research 214 s3, 87 s1.7, 192 G27)', () => {
  const MARKS: Record<string, { width: number; height: number }> = {
    ...SIZES, 'ret_bomb.tif': { width: 16, height: 16 }, 'ret_base.tif': { width: 16, height: 16 }, 'ret_triangle.tif': { width: 16, height: 16 },
    'ret_nav_01.tif': { width: 16, height: 16 },
  };
  const textOf = (quads: { element: string; x: number; y: number; u0: number; v0: number }[], element: string): string =>
    JSON.stringify(quads.filter((q) => q.element === element).map((q) => [q.x, q.y, q.u0, q.v0]));

  it("ret_bomb marks the bomb's place and ret_base the target tent on the compass by the nav marks' rule; the fuse replaces the round timer in its slot while it runs", () => {
    // "MP DEFUSE BOMB" (S:0x3e5ff8) is the tactical command row 0x2e's label (research 197 W2-R-05, D:L83771; 203), not
    // the timer's: no label is drawn; the fuse takes the round timer's slot (DEFUSE_TIMER_LAYOUT_READING).
    // Yaw 90 looks down -x; north (-z) is then to the right. The bomb 100 u north: 32.5 px right of the centre, its own
    // size; the tent 400 u west, beyond 200: pinned ahead at radius 64 at 1.2x, with ret_triangle at radius 50 at 0.6x.
    const at = model({
      yaw: 90, position: [0, 0], navPoints: [{ name: 'Charlie', x: 0, z: 30 }],
      extraMarks: [{ bitmap: 'ret_bomb.tif', x: 0, z: -100 }, { bitmap: 'ret_base.tif', x: -400, z: 0 }],
    });
    const { quads } = hudLayout(PS2, at, MARKS);
    const bomb = quads.find((q) => q.texture === 'ret_bomb.tif')!;
    expect(bomb.element).toBe('marks');
    expect(bomb.x).toBeCloseTo(565 + 32.5, 6);
    expect(bomb.y).toBeCloseTo(90, 6);
    expect(bomb.w).toBe(16);
    const base = quads.find((q) => q.texture === 'ret_base.tif')!;
    expect(base.x).toBeCloseTo(565, 6);
    expect(base.y).toBeCloseTo(90 - 64, 6);
    expect(base.w).toBeCloseTo(16 * 1.2, 9);
    const arrow = quads.find((q) => q.texture === 'ret_triangle.tif')!;
    expect(arrow.y).toBeCloseTo(90 - 50, 6);
    expect(arrow.w).toBeCloseTo(16 * 0.6, 9);
    // The extra marks are not the nav points' "within 200 and the nearest": both shown beside the nearer nav point.
    expect(quads.filter((q) => q.texture === 'ret_nav_01.tif')).toHaveLength(1);
    expect(compassMarks(at).map((m) => m.bitmap)).toEqual(['ret_nav_01.tif', 'ret_bomb.tif', 'ret_base.tif']);
    // With the compass hidden (the scoreboard), the marks go with it.
    expect(hudPass(PS2, { ...at, scoreboard: true }, MARKS, AT_REST, false, null).quads.some((q) => q.texture === 'ret_bomb.tif')).toBe(false);
    // The fuse in the round timer's slot (DEFUSE_TIMER_LAYOUT_READING): 18 s left draws as the round's 00:18 would, in its place.
    const fuse = hudLayout(PS2, model({ timer: 200, defuseTimer: 18.4 }), MARKS).quads;
    expect(textOf(fuse, 'timer')).toBe(textOf(hudLayout(PS2, model({ timer: 18 }), MARKS).quads, 'timer'));
    expect(textOf(fuse, 'timer')).not.toBe(textOf(hudLayout(PS2, model({ timer: 200 }), MARKS).quads, 'timer'));
    expect(textOf(hudLayout(PS2, model({ timer: 200, defuseTimer: null }), MARKS).quads, 'timer'))
      .toBe(textOf(hudLayout(PS2, model({ timer: 200 }), MARKS).quads, 'timer'));
    expect(DEFUSE_TIMER_LAYOUT_READING).toBe('round-timer-slot');
    // The page's setters.
    const hud = new Hud();
    hud.setExtraMarks([{ bitmap: 'ret_bomb.tif', x: 1, z: 2 }]);
    hud.setDefuseTimer(12);
    expect(hud.state().model).toMatchObject({ extraMarks: [{ bitmap: 'ret_bomb.tif', x: 1, z: 2 }], defuseTimer: 12 });
    hud.setExtraMarks([]);
    hud.setDefuseTimer(null);
    expect(hud.state().model).toMatchObject({ extraMarks: [], defuseTimer: null });
  });

  // BOMB-MARKS (research 214 s3 "The base mark for both sides"; reading, pending review): the base mark's two types from
  // FUN_002126f0's table (floats at +0xa0 in threes, type 0 first): type 2 (40, 62, 36) at +0xb8..+0xc0
  // (D:L68684-68687), type 3 (62, 37, 36) at +0xc4..+0xcc (D:L68680-68683); a pulsing mark at the marks' pulse.
  it("a typed ret_base is drawn in its type's colour: type 2 (40, 62, 36) green, type 3 (62, 37, 36) red, at the pulse's alpha", () => {
    expect(BASE_MARK_TYPE_RGB_READING).toEqual({ 2: [40, 62, 36], 3: [62, 37, 36] });
    expect(OBJECTIVE_MARK_RGB_READING['ret_base.tif']).toEqual([40, 62, 36]);
    const MARKS = { ...SIZES, 'ret_base.tif': { width: 16, height: 16 }, 'ret_triangle.tif': { width: 16, height: 16 } };
    const at = model({
      yaw: 0, position: [0, 0],
      extraMarks: [{ bitmap: 'ret_base.tif', x: 0, z: -100, type: 2, pulse: true }, { bitmap: 'ret_base.tif', x: 0, z: 100, type: 3, pulse: true }],
    });
    expect(compassMarks(at).map((m) => [m.bitmap, m.type])).toEqual([['ret_base.tif', 2], ['ret_base.tif', 3]]);
    const quads = hudLayout(PS2, at, MARKS, { ...AT_REST, marks: 0.5 }).quads.filter((q) => q.texture === 'ret_base.tif');
    expect(quads.map((q) => q.rgba)).toEqual([[40 / 128, 62 / 128, 36 / 128, 0.5], [62 / 128, 37 / 128, 36 / 128, 0.5]]);
  });

  it("every compass mark's bitmap is read out of HUD2 (research 87 s1.7: the marks are HUD2 16x16; 239 s5.1, s9) -- an unread one has no size and the draw skips it", () => {
    // OBJECTIVE_MARK_RGB_READING is keyed by the whole `CompassMark['bitmap']` union (its type is a Record over it).
    for (const bitmap of Object.keys(OBJECTIVE_MARK_RGB_READING)) expect(HUD_LIBRARIES.HUD2, bitmap).toContain(bitmap);
  });
});

/**
 * PB-8 (issue #120; research 214 s3, 87 s5): the bomb's hold bar. `FUN_00220350` (D:L74426-74443), for the bomb's action
 * (type 7) with the kit's hold flags set (+0x171 bits 4 and 5), shows the background box at alpha 38.4 and the fill at
 * 100 and sets the fill's right edge to (int)(587 + 46 x the timer's share); `FUN_0021ded0` (D:L73815-73826) made both
 * untextured, the box black at 585-635 x 345-360 (`DAT_003dc648..660` off the ELF), the fill (100, 100, 100)
 * (`DAT_003e4ba0..a8`, `FUN_003fe550` D:L327785-327787) over 587.. x 347-358 (`FUN_003fe550` D:L327765-327769: the box
 * inset by `DAT_003dc668` 2.0). Off the hold both fade at 400 a second from the fill's alpha (D:L74445-74456).
 */
describe('the hold bar (PB-8; issue #120)', () => {
  const bar = (m: HudModel, frame = PS2, timing = AT_REST) => hudLayout(frame, m, SIZES, timing).quads.filter((q) => q.element === 'holdBar');
  const edges = (q: { x: number; y: number; w: number; h: number }) => [q.x - q.w / 2, q.y - q.h / 2, q.x + q.w / 2, q.y + q.h / 2];

  it("draws the box 585-635 x 345-360 black at 38.4/128 and the fill from x 587 (46 px at full, its right edge truncated) over y 347-358, grey (100, 100, 100) at 100/128, untextured; nothing without a hold", () => {
    expect(HUD_LAYOUT.holdBar).toEqual({ box: { x: 585, y: 345, w: 50, h: 15 }, fill: { x: 587, y: 347, w: 46, h: 11 } });
    expect(HUD_COLOURS.holdBox).toEqual([0, 0, 0, 38.4 / 128]);
    expect(HUD_COLOURS.holdFill).toEqual([100 / 255, 100 / 255, 100 / 255, 100 / 128]);
    const [box, fill] = bar(model({ holdBar: { fill: 0.5 } }));
    expect(box!.texture).toBe('white');
    expect(edges(box!)).toEqual([585, 345, 635, 360]);
    expect(box!.rgba).toEqual([0, 0, 0, 38.4 / 128]);
    expect(edges(fill!)).toEqual([587, 347, 610, 358]);                         // 587 + 46 x 0.5 = 610
    expect(fill!.rgba).toEqual([100 / 255, 100 / 255, 100 / 255, 100 / 128]);
    expect(edges(bar(model({ holdBar: { fill: 1 } }))[1]!)).toEqual([587, 347, 633, 358]);
    expect(edges(bar(model({ holdBar: { fill: 0.3 } }))[1]!)).toEqual([587, 347, 600, 358]);   // (int)(587 + 13.8)
    expect(bar(model({ holdBar: { fill: 0 } })).map(edges)).toEqual([[585, 345, 635, 360]]);    // the box alone
    // Nothing without a hold, whatever the prompt does.
    expect(bar(model())).toEqual([]);
    expect(bar(model({ holdBar: null, action: 'bomb' }))).toEqual([]);
    // The prompt's pulse does not touch it, nor does the prompt's absence.
    expect(bar(model({ holdBar: { fill: 0.5 }, action: 'bomb' }), PS2, { ...AT_REST, pulse: 1 })).toEqual(bar(model({ holdBar: { fill: 0.5 } })));
    // A wide native frame keeps the console's right margin (the info box's anchor), scaled by the height.
    const wide = bar(model({ holdBar: { fill: 0.5 } }), { width: 1792, height: 896 });
    expect(edges(wide[0]!)).toEqual([1792 - 55 * 2, 690, 1792 - 5 * 2, 720]);
    // The scoreboard hides it with the prompt; the round screen too.
    expect(hudPass(PS2, model({ holdBar: { fill: 0.5 }, scoreboard: true }), SIZES, AT_REST, false, null).quads.some((q) => q.element === 'holdBar')).toBe(false);
  });

  it('Hud.setHoldBar: drawn while fed; fed null, both widgets fade from the fill\'s 100 at 400 a second and the box takes the fill\'s alpha, the fill keeping its width (D:L74445-74456)', () => {
    expect(HOLD_BAR_FADE).toEqual({ from: 100, perSecond: 400 });
    const hud = new Hud();
    expect(hud.state().model.holdBar ?? null).toBeNull();
    hud.setHoldBar(0.25);
    expect(hud.state().model.holdBar).toEqual({ fill: 0.25 });
    hud.step(1 / 60);
    expect(hud.state().model.holdBar).toEqual({ fill: 0.25 });
    hud.setHoldBar(0.5);
    hud.setHoldBar(null);                                                       // the hold ends
    hud.step(1 / 60);
    expect(hud.state().model.holdBar!.fill).toBe(0.5);
    expect(hud.state().model.holdBar!.fade).toBeCloseTo(100 - 400 / 60, 9);
    const [box, fill] = bar(hud.state().model);
    expect(box!.rgba[3]).toBeCloseTo((100 - 400 / 60) / 128, 9);
    expect(fill!.rgba[3]).toBeCloseTo((100 - 400 / 60) / 128, 9);
    hud.setHoldBar(null);                                                       // fed null each frame: the fade runs on
    hud.step(0.2);
    expect(hud.state().model.holdBar!.fade).toBeCloseTo(100 - 400 / 60 - 80, 9);
    hud.step(0.05);
    expect(hud.state().model.holdBar ?? null).toBeNull();                       // under 0: hidden
    // A hold again while it fades: drawn live at once.
    hud.setHoldBar(0.1);
    hud.setHoldBar(null);
    hud.step(0.1);
    hud.setHoldBar(0.2);
    expect(hud.state().model.holdBar).toEqual({ fill: 0.2 });
  });
});

const bytes = fixture('RUN/MP2.ZDB');
describe.skipIf(bytes === null)(`the HUD's bitmaps off Frostfire${bytes === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it('reads every bitmap the HUD names, at its size, with no diagnostic', () => {
    const { bitmaps, diagnostics } = readHud(bytes!, parseZdb(bytes!));
    expect(diagnostics).toEqual([]);
    for (const names of Object.values(HUD_LIBRARIES)) for (const n of names) expect(bitmaps[n], n).toBeDefined();
    for (const [name, size] of Object.entries(SIZES)) {
      if (name === 'white') continue;
      expect({ width: bitmaps[name]!.width, height: bitmaps[name]!.height }, name).toEqual(size);
    }
  });

  it('turns them top row first: the font\'s "A" (fonts.rdr UL 2,0 - LR 13,25) is inked in rows 0-25', () => {
    const font = readHud(bytes!, parseZdb(bytes!)).bitmaps['font_text_01.tif']!;
    const inked = (y0: number, y1: number, x0: number, x1: number): number => {
      let n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (font.data[(y * font.width + x) * 4 + 3]! > 60) n++;
      return n;
    };
    expect(inked(0, 25, 2, 13)).toBeGreaterThan(40);
    // The glyph's ink: rows 5-19 of its cell, nothing in its top five rows.
    expect(inked(0, 5, 2, 13)).toBe(0);
    // The white ramp of palette 139: the brightest texel is opaque white.
    let max = 0;
    for (let i = 3; i < font.data.length; i += 4) max = Math.max(max, font.data[i]!);
    expect(max).toBe(255);
  });

  it('flipRows reverses the rows and nothing else', () => {
    const rgba = { width: 1, height: 3, data: new Uint8ClampedArray([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]) };
    expect(Array.from(flipRows(rgba).data)).toEqual([3, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1]);
  });
});

describe('Hud: the arsenal\'s weapon icons (web sprint 4)', () => {
  const px = (): { width: number; height: number; data: Uint8ClampedArray } => ({ width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) });
  const bitmaps = {
    'newweapnbkrnd.tif': px(), 'm4carbine_icon.tif': px(), 'mark23_icon.tif': px(), 'firemode.tif': px(),
    // Two of the arsenal's other icons (`readHud`'s `weaponIcons`): some forty on a map.
    'sigcommando_icon.tif': px(), 'm60e.tif': px(),
  };
  const names = (hud: Hud): string[] => hud.warmTarget().scene.children
    .filter((c): c is Mesh => c instanceof Mesh).map((m) => (m.material as { name: string }).name);
  const orderOf = (hud: Hud, name: string): number => hud.warmTarget().scene.children
    .find((c) => c instanceof Mesh && (c.material as { name: string }).name === name)!.renderOrder;
  const frame = { autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: () => {} };

  it('builds an arsenal icon\'s batch only when it is first drawn, in the icons\' place of the draw order', () => {
    const hud = new Hud();
    hud.setBitmaps(bitmaps);
    // The HUD's own bitmaps as before; none of the arsenal's extra icons yet (each a material more to warm and fill).
    expect(names(hud).filter((n) => /sigcommando|m60e/.test(n))).toEqual([]);
    hud.setVisible(true);
    hud.setWeaponIcon('sigcommando_icon.tif');
    hud.step(2);                                         // faded in
    hud.render(frame);
    expect(orderOf(hud, 'hud 0 sigcommando_icon.tif')).toBeGreaterThan(orderOf(hud, 'hud 0 mark23_icon.tif'));
    expect(orderOf(hud, 'hud 0 sigcommando_icon.tif')).toBeLessThan(orderOf(hud, 'hud 0 firemode.tif'));
    expect(names(hud).filter((n) => /m60e/.test(n))).toEqual([]);
  });
});

describe('the hostages on the HUD (HX-5; research 239 s5, 190 A1 and D)', () => {
  it("the GAME DETAILS caption for Extraction is EXTRACT (0x3e5848, FUN_0022be20 D:L79749; EXTRACT_CAPTION_READING); the other modes keep their upper-cased name (MODE_CAPTION_READING); the compass draws ret_hostage and ret_extraction marks in their own colours", () => {
    expect(EXTRACT_CAPTION_READING).toBe('EXTRACT');
    // FUN_0022be20's switch on the game type (D:L79744-79758): 0x3e5828 BREACH, 0x3e5830 DEMOLITION, 0x3e5840 ESCORT,
    // 0x3e5848 EXTRACT, 0x3e5850 SUPPRESSION -- the four others are the mode's name upper-cased.
    expect(['Breach', 'Demolition', 'Escort', 'Extraction', 'Suppression', ''].map(gameCaption))
      .toEqual(['BREACH', 'DEMOLITION', 'ESCORT', 'EXTRACT', 'SUPPRESSION', '']);
    const hud = new Hud();
    hud.setGame('Desert Glory', 'Extraction');
    expect(hud.state().model.game).toEqual({ name: 'Desert Glory', type: 'EXTRACT' });
    hud.setGame('Frostfire', 'Suppression');
    expect(hud.state().model.game.type).toBe('SUPPRESSION');
    // The marks: within 200 u by their bearing at their own size, in the per-type colours; the bomb's colour unchanged.
    const sizes = { ...SIZES, 'ret_hostage.tif': { width: 16, height: 16 }, 'ret_extraction.tif': { width: 16, height: 16 }, 'ret_bomb.tif': { width: 16, height: 16 } };
    const at = model({
      yaw: 0, position: [0, 0], extraMarks: [{ bitmap: 'ret_bomb.tif', x: 0, z: -50 }],
      hostageMarks: [{ bitmap: 'ret_hostage.tif', x: 0, z: -100, pulse: true }, { bitmap: 'ret_extraction.tif', x: 100, z: 0, pulse: true }],
    });
    const quads = hudLayout(PS2, at, sizes, { ...AT_REST, marks: 1 }).quads;
    const of = (t: string) => quads.find((q) => q.texture === t)!;
    expect(of('ret_hostage.tif').rgba).toEqual([62 / 128, 49 / 128, 36 / 128, 1]);
    expect(of('ret_extraction.tif').rgba).toEqual([36 / 128, 40 / 128, 62 / 128, 1]);
    expect(of('ret_bomb.tif').rgba).toEqual([32 / 128, 62 / 128, 32 / 128, 1]);
    expect(of('ret_hostage.tif').y).toBeCloseTo(90 - 100 * 0.005 * 65, 6);   // straight ahead, 100 u
    expect(of('ret_extraction.tif').x).toBeCloseTo(565 + 100 * 0.005 * 65, 6);
    expect(compassMarks(at).map((m) => m.bitmap)).toEqual(['ret_bomb.tif', 'ret_hostage.tif', 'ret_extraction.tif']);
    // The page's setter; an empty list clears them, the bomb's untouched.
    hud.setExtraMarks([{ bitmap: 'ret_bomb.tif', x: 1, z: 2 }]);
    hud.setHostageMarks([{ bitmap: 'ret_hostage.tif', x: 3, z: 4, pulse: true }]);
    expect(hud.state().model).toMatchObject({ extraMarks: [{ bitmap: 'ret_bomb.tif' }], hostageMarks: [{ bitmap: 'ret_hostage.tif', x: 3, z: 4 }] });
    hud.setHostageMarks([]);
    expect(hud.state().model).toMatchObject({ extraMarks: [{ bitmap: 'ret_bomb.tif' }], hostageMarks: [] });
  });
});

describe("the spectator's HUD (PAR-48, issue #138; research 282, 276 s7)", () => {
  const SPEC_SIZES = { ...SIZES, 'font_special_01.tif': { width: 256, height: 64 }, 'ret_nav_01.tif': { width: 16, height: 16 } };
  const FOLLOW: HudSpectatorView = { followed: { name: 'BRAVO', health: 0.5 }, stats: { kills: 3, deaths: 1, headshots: null, score: 7 } };
  const FREE: HudSpectatorView = { followed: null, stats: null };
  const busy = (spectator: HudSpectatorView | null, over: Partial<HudModel> = {}): HudModel =>
    model({ spectator, action: 'climb', range: 12, zoom: 1, position: [0, 0], navPoints: [{ name: 'Charlie', x: 0, z: -10 }], ...over });
  const elements = (quads: { element: string }[]): Set<string> => new Set(quads.map((q) => q.element));
  const settled = { ...AT_REST, stance: 1, help: 1 };

  it("FUN_001f9160: draws the timer, the followed body's bar and name, the panel and the help lines; hides the weapon box, the compass and its marks, the prompt, the stance word and the number (the hide-all FUN_001f77c0 D:L56312-56361; D:L56875-56879)", () => {
    const drawn = elements(hudLayout(PS2, busy(FOLLOW), SPEC_SIZES, settled).quads);
    for (const e of ['timer', 'box', 'bar', 'name', 'spectatorInfo', 'help']) expect(drawn.has(e), e).toBe(true);
    for (const e of ['panel', 'rounds', 'mags', 'icon', 'firemode', 'compass', 'marks', 'action', 'stance', 'range', 'zoom', 'scopeRange']) {
      expect(drawn.has(e), e).toBe(false);
      expect(SPECTATOR_HIDES.has(e as never), e).toBe(true);
    }
    // The walker's own HUD of the same model is untouched by the field's absence.
    const walker = elements(hudLayout(PS2, busy(null), SPEC_SIZES, settled).quads);
    for (const e of ['panel', 'compass', 'marks', 'action', 'range']) expect(walker.has(e), e).toBe(true);
    for (const e of ['spectatorInfo', 'help']) expect(walker.has(e), e).toBe(false);
  });

  it("the info box shows the viewed body's: its health on the bar, its name centred on it; no health given, no bar (a body the room never sent, a replay: SPECTATOR_FOLLOWED_HEALTH_READING); no body, neither (SPECTATOR_OWN_INFO_PLACEHOLDER)", () => {
    const { quads, rects } = hudLayout(PS2, busy(FOLLOW, { health: 1 }), SPEC_SIZES, settled);
    const bar = quads.filter((q) => q.element === 'bar');
    expect(bar).toHaveLength(2);
    expect(bar[0]!.w).toBeCloseTo(134 * 0.5, 9);                          // the followed body's half, not the walker's 1
    expect(rects.name).toBeDefined();
    const unknown = elements(hudLayout(PS2, busy({ ...FOLLOW, followed: { name: 'BRAVO', health: null } }), SPEC_SIZES, settled).quads);
    expect(unknown.has('bar')).toBe(false);
    expect(unknown.has('name')).toBe(true);
    const free = elements(hudLayout(PS2, busy(FREE, { name: 'WALKER' }), SPEC_SIZES, settled).quads);
    expect(free.has('bar')).toBe(false);
    expect(free.has('name')).toBe(false);
    expect(free.has('timer')).toBe(true);
  });

  it('the panel: the title bar (10, 410) 164x28 at alpha 72 over the stats (10, 326) 164x84 at alpha 64 (DAT_003dcf18..78, FUN_00242bb0 D:L90396-90414)', () => {
    const L = SPECTATOR_INFO_LAYOUT;
    expect(L.title).toEqual({ x: 10, y: 410, w: 164, h: 28, alpha: 72 });
    expect(L.stats).toEqual({ x: 10, y: 326, w: 164, h: 84, alpha: 64 });
    expect(L.titleText).toEqual({ x: 20, y: 430, scale: 0.9 });
    expect(L.labels).toEqual({ x: 20, y0: 346, pitch: 18, scale: 0.9 });
    expect(L.values).toMatchObject({ x: 160, scale: 0.9, align: 'right' });
    const panels = hudLayout(PS2, busy(FOLLOW), SPEC_SIZES, settled).quads
      .filter((q) => q.element === 'spectatorInfo' && q.texture === 'newweapnbkrnd.tif');
    expect(panels.map((q) => [q.x - q.w / 2, q.y - q.h / 2, q.w, q.h, q.rgba[3]])).toEqual([[10, 326, 164, 84, 64 / 128], [10, 410, 164, 28, 72 / 128]]);
    // Free: the stats panel hidden (D:L90238), the title bar alone.
    const free = hudLayout(PS2, busy(FREE), SPEC_SIZES, settled).quads.filter((q) => q.element === 'spectatorInfo' && q.texture === 'newweapnbkrnd.tif');
    expect(free.map((q) => q.y - q.h / 2)).toEqual([410]);
    // Left-anchored on a wide native frame, as the ammo box is.
    const wide = hudLayout({ width: 1920, height: 1080 }, busy(FREE), SPEC_SIZES, settled).quads.find((q) => q.element === 'spectatorInfo')!;
    expect(wide.x - wide.w / 2).toBeCloseTo(10 * 1080 / 448, 6);
  });

  it("the panel's words: the followed name over Kill Count, Deaths, Headshots and Score as %d (0x3e6e88..0x3e6ec0, 0x3e6e98; D:L90308-90325); FREE CAMERA over (100, 100, 100) (0x3e6ec8, D:L90326-90328); a scenic view's title; no row, no stats", () => {
    expect(spectatorInfoText(FOLLOW)).toEqual({
      title: 'BRAVO', titleRgb: null,
      rows: [{ label: 'Kill Count :', value: '3' }, { label: 'Deaths :', value: '1' }, { label: 'Headshots :', value: '' }, { label: 'Score :', value: '7' }],
    });
    expect(spectatorInfoText({ ...FOLLOW, stats: { kills: 0, deaths: 0, headshots: 2, score: -1 } }).rows![2]).toEqual({ label: 'Headshots :', value: '2' });
    expect(spectatorInfoText(FREE)).toEqual({ title: 'FREE CAMERA', titleRgb: [100 / 128, 100 / 128, 100 / 128], rows: null });
    expect(spectatorInfoText({ ...FREE, title: 'Hostage Room' })).toEqual({ title: 'Hostage Room', titleRgb: null, rows: null });
    expect(spectatorInfoText({ ...FOLLOW, stats: null }).rows).toBeNull();
    // The FREE CAMERA bar's colour on the quad.
    const bar = hudLayout(PS2, busy(FREE), SPEC_SIZES, settled).quads.find((q) => q.element === 'spectatorInfo' && q.texture === 'newweapnbkrnd.tif')!;
    expect(bar.rgba).toEqual([100 / 128, 100 / 128, 100 / 128, 72 / 128]);
    // The values right-aligned to x 160 (+0x6a, D:L90434): the rightmost value glyph ends at 160 or just short of it.
    const glyphs = hudLayout(PS2, busy(FOLLOW), SPEC_SIZES, settled).quads
      .filter((q) => q.element === 'spectatorInfo' && q.texture === 'font_text_01.tif' && q.rgba[0] > 0 && q.y > 326 && q.y < 410);
    const right = Math.max(...glyphs.map((q) => q.x + q.w / 2));
    expect(right).toBeLessThanOrEqual(160.5);
    expect(right).toBeGreaterThan(150);
  });

  it("the help lines: the spectator's four (0x3e30f0..0x3e3180, the pad's Cross 0xa6 and Triangle 0xac) centred on x 324 at y 380 + 18i, scale 0.9, (100, 100, 20) at 100 (D:L56869-56886, D:L57298-57303)", () => {
    expect(SPECTATOR_HELP.lines).toEqual([
      'You are a spectator.  Use the directional', 'buttons to cycle through active players',
      'and fixed views.  \u00a6 Use the Free-Motion', 'Camera.  \u00ac Jump to visible players.',
    ]);
    expect(SPECTATOR_HELP).toMatchObject({ x: 324, y0: 380, pitch: 18, scale: 0.9, rgb: [100, 100, 20], alpha: 100, hold: 10, fade: 0.5 });
    const { quads, rects } = hudLayout(PS2, busy(FREE), SPEC_SIZES, settled);
    const help = rects.help!;
    expect(Math.abs(help.x + help.width / 2 - 324)).toBeLessThan(2);
    expect(help.y).toBeGreaterThan(360);
    expect(help.y + help.height).toBeLessThan(448);
    const ink = quads.filter((q) => q.element === 'help' && q.texture === 'font_text_01.tif' && q.rgba[0] > 0);
    expect(ink[0]!.rgba).toEqual([100 / 128, 100 / 128, 20 / 128, 100 / 128]);
    // The two pad glyphs from font_special_01, in their own colour, no shadow.
    expect(quads.filter((q) => q.element === 'help' && q.texture === 'font_special_01.tif')).toHaveLength(2);
    // Faded out: nothing.
    expect(elements(hudLayout(PS2, busy(FREE), SPEC_SIZES, { ...settled, help: 0 }).quads).has('help')).toBe(false);
  });

  it('the help lines hold 10 s and fade to 0 by 10.5 s (D:L56541-56562); the clock restarts at a round start (D:L57663)', () => {
    expect(helpAlpha(0)).toBe(1);
    expect(helpAlpha(9.9)).toBe(1);
    expect(helpAlpha(10.25)).toBeCloseTo(0.5, 9);
    expect(helpAlpha(10.5)).toBe(0);
    expect(helpAlpha(60)).toBe(0);
    const hud = new Hud();
    hud.setSpectator(FREE);
    hud.step(9.9);
    expect(hud.timing().help).toBe(1);
    hud.step(0.6);
    expect(hud.timing().help).toBe(0);
    hud.startRound({ round: 2, rounds: 11, objective: [] });
    expect(hud.timing().help).toBe(1);
  });

  it('SELECT: the scoreboard over a spectator, the info box, the panel, the help lines, the timer and the number hidden (FUN_0022be20 tests no seat; D:L56808-56827)', () => {
    const pass = hudPass(PS2, busy(FOLLOW, { scoreboard: true }), SPEC_SIZES, settled, false, null, 'ps2');
    const drawn = elements(pass.quads);
    expect(drawn.has('scoreboard')).toBe(true);
    for (const e of ['bar', 'name', 'box', 'timer', 'range', 'spectatorInfo', 'help', 'compass', 'panel']) expect(drawn.has(e), e).toBe(false);
  });

  it("the walker's scoreboard hides the info box and the number too (D:L56811, D:L56826)", () => {
    for (const e of ['bar', 'name', 'box', 'range', 'timer', 'spectatorInfo', 'help']) expect(SCOREBOARD_HIDES.has(e as never), e).toBe(true);
    const drawn = elements(hudPass(PS2, model({ scoreboard: true, name: 'SEAL', range: 40, health: 0.5 }), SPEC_SIZES, AT_REST, false, null, 'ps2').quads);
    expect(drawn.has('scoreboard')).toBe(true);
    for (const e of ['bar', 'name', 'box', 'range']) expect(drawn.has(e), e).toBe(false);
  });

  it("a dead player: on his own body the walker's HUD less the compass (FUN_001f97b0 D:L57112-57115) and with his help lines; watching a teammate, the teammate's bar and name and the watching lines, no panel, the weapon box's panel but no rounds or fire mode (FUN_001f9f20 D:L57174-57183; LATER 118, LATER 117)", () => {
    const ownHelp = deadHelpLines({ ghost: false, watching: false, device: 'pad' });
    const own = elements(hudLayout(PS2, busy({ path: 'own', followed: null, stats: null, help: ownHelp }), SPEC_SIZES, settled).quads);
    for (const e of ['panel', 'rounds', 'timer', 'bar', 'box', 'action', 'help']) expect(own.has(e), e).toBe(true);
    for (const e of ['compass', 'marks', 'spectatorInfo']) expect(own.has(e), e).toBe(false);
    const mateHelp = deadHelpLines({ ghost: false, watching: true, device: 'pad' });
    const mate = hudLayout(PS2, busy({ path: 'teammate', followed: { name: 'ALPHA', health: 1 }, stats: null, help: mateHelp }), SPEC_SIZES, settled);
    const drawn = elements(mate.quads);
    // LATER 117 (research 282 §9): the box's panel shown (FUN_00237e50 D:L57180), its group `+0x270` hidden on a
    // teammate (D:L85367-85371). Was: 'panel' among the hidden (DEAD_WATCH_WEAPON_BOX_PLACEHOLDER, retired).
    for (const e of ['timer', 'bar', 'name', 'box', 'help', 'panel']) expect(drawn.has(e), e).toBe(true);
    for (const e of ['spectatorInfo', 'compass', 'action', 'rounds', 'mags', 'firemode']) expect(drawn.has(e), e).toBe(false);
  });

  it("a name wider than the bar's 134 - 4 is cut to nine characters and a dash (DAT_003dcc70; FUN_00238500 D:L85571-85576)", () => {
    expect(infoBoxName('BRAVO')).toBe('BRAVO');
    expect(infoBoxName('WWWWWWWWWWWWWWWWWWWW')).toBe('WWWWWWWWW-');
  });

  it('SPECTATOR-VIEW W4: taggedName is "[%s] %s" (S:0x3e6718) with a tag of one character or more, the name alone with none or an empty one (FUN_00238500 D:L85563-85567)', () => {
    expect(taggedName('NSW', 'BRAVO')).toBe('[NSW] BRAVO');
    expect(taggedName(undefined, 'BRAVO')).toBe('BRAVO');
    expect(taggedName(null, 'BRAVO')).toBe('BRAVO');
    expect(taggedName('', 'BRAVO')).toBe('BRAVO');
    // The length test is strlen's (FUN_00199288, D:L85563): a one-space tag is a tag (research 275 §1.4's disbanded leader).
    expect(taggedName(' ', 'BRAVO')).toBe('[ ] BRAVO');
  });

  it('SPECTATOR-VIEW W4: the info box draws the followed body\'s "[tag] name", the name alone untagged or with an empty tag, and the cut is the tagged string\'s (D:L85563-85576)', () => {
    const nameQuads = (followed: HudSpectatorView['followed']) =>
      hudLayout(PS2, busy({ ...FOLLOW, followed }), SPEC_SIZES, settled).quads.filter((q) => q.element === 'name');
    const tagged = nameQuads({ name: 'BRAVO', health: 0.5, tag: 'NSW' });
    expect(tagged.length).toBeGreaterThan(0);
    expect(tagged).toEqual(nameQuads({ name: '[NSW] BRAVO', health: 0.5 }));
    expect(tagged).not.toEqual(nameQuads({ name: 'BRAVO', health: 0.5 }));
    expect(nameQuads({ name: 'BRAVO', health: 0.5, tag: '' })).toEqual(nameQuads({ name: 'BRAVO', health: 0.5 }));
    // The cut measures the formatted string (D:L85571 reads the text the format wrote): "[NSW] WWWWWWWWW" travels 131 at
    // the info box's 0.8 (over 130: cut), "WWWWWWWWW" 90 (whole). NU-9 N2 re-pinned these with nine W's (327 F3); was:
    // "[NSW] WWWWWWWW", over 130 only at the old 0.9 (121 at 0.8).
    expect(infoBoxName(taggedName('NSW', 'WWWWWWWWW'))).toBe('[NSW] WWW-');
    expect(infoBoxName('WWWWWWWWW')).toBe('WWWWWWWWW');
    expect(nameQuads({ name: 'WWWWWWWWW', health: 0.5, tag: 'NSW' })).toEqual(nameQuads({ name: '[NSW] WWW-', health: 0.5 }));
    // A teammate's info box is the same function's (the viewed actor, D:L85558-85560).
    const mate = (followed: HudSpectatorView['followed']) =>
      hudLayout(PS2, busy({ path: 'teammate', followed, stats: null }), SPEC_SIZES, settled).quads.filter((q) => q.element === 'name');
    expect(mate({ name: 'ALPHA', health: 1, tag: 'NSW' })).toEqual(mate({ name: '[NSW] ALPHA', health: 1 }));
  });

  describe('Hud.setSpectator: one idempotent set-state', () => {
    const px = (): { width: number; height: number; data: Uint8ClampedArray } => ({ width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) });
    const bitmaps = { 'newweapnbkrnd.tif': px(), 'm4carbine_icon.tif': px(), 'firemode.tif': px(), 'compass_lo.tif': px(), 'font_text_01.tif': px() };
    const frame = { autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: () => {} };
    const made = (): Hud => { const hud = new Hud(); hud.setBitmaps(bitmaps); return hud; };

    it('draws a spectator with no walker (a page with none: the replay watcher), and null draws nothing again', () => {
      const hud = made();
      hud.render(frame);
      expect(hud.state().visible).toBe(false);
      hud.setSpectator(FOLLOW);
      hud.render(frame);
      const seen = hud.state();
      expect(seen.visible).toBe(true);
      expect(seen.rects.timer).toBeDefined();
      expect(seen.rects.spectatorInfo).toBeDefined();
      expect(seen.rects.compass).toBeUndefined();
      expect(seen.rects.panel).toBeUndefined();
      hud.setSpectator(null);
      hud.render(frame);
      expect(hud.state().visible).toBe(false);
    });

    it('setting the same view twice changes nothing; the view is copied, not held', () => {
      const hud = made();
      const view: HudSpectatorView = { followed: { name: 'BRAVO', health: null }, stats: { kills: 1, deaths: 2, headshots: null, score: 3 } };
      hud.setSpectator(view);
      hud.step(3);
      const once = hud.state(), t1 = hud.timing();
      hud.setSpectator({ ...view, followed: { ...view.followed! }, stats: { ...view.stats! } });
      expect(hud.state()).toEqual(once);
      expect(hud.timing()).toEqual(t1);
      view.followed!.name = 'CHANGED';
      expect(hud.state().model.spectator!.followed!.name).toBe('BRAVO');
    });

    it("null gives the walker's HUD back exactly; the walker's model is never written by a view", () => {
      const walker = made(), other = made();
      for (const h of [walker, other]) { h.setVisible(true); h.setHealth(0.75); h.step(2); }
      other.setSpectator(FOLLOW);
      other.setSpectator(null);
      walker.render(frame); other.render(frame);
      expect(other.state().rects).toEqual(walker.state().rects);
      expect(other.state().model).toEqual({ ...walker.state().model, spectator: null });
      expect(other.state().model.health).toBe(0.75);
    });
  });

  describe("spectatorHudView: the page's state as a view (both pages' frames)", () => {
    const page = (over: Partial<Omit<SpectatorHudSource, 'spectator'>> & { spectator?: Partial<SpectatorHudSource['spectator']> } = {}): SpectatorHudSource => ({
      client: { role: 'spectator' },
      rows: [{ id: 4, kills: 2, deaths: 1, score: 5 }],
      nameOf: (id) => `P${id}`,
      ...over,
      spectator: { mode: 'free', target: null, scenic: -1, watching: null, benched: false, ...over.spectator },
    });
    const walking = { mode: () => 'walk', isDead: () => false }, flying = { mode: () => 'fly', isDead: () => false };
    const deadOwn = { mode: () => 'walk', isDead: () => true }, deadAway = { mode: () => 'fly', isDead: () => true };

    it("a spectator: the followed player's name and its row's tally; free: FREE CAMERA; a body with no row (a hostage): no stats", () => {
      expect(spectatorHudView(page({ spectator: { mode: 'follow', target: 4 } }), flying)).toEqual({
        path: 'spectator', followed: { name: 'P4', health: null }, stats: { kills: 2, deaths: 1, headshots: null, score: 5 },
      });
      expect(spectatorHudView(page(), flying)).toEqual({ path: 'spectator', followed: null, stats: null });
      expect(spectatorHudView(page({ spectator: { mode: 'follow', target: 9 } }), flying)!.stats).toBeNull();
      expect(spectatorHudView(page({ spectator: { mode: 'scenic', scenic: 1 } }), flying, () => [{ name: 'Gate' }, { name: 'Tower' }]))
        .toEqual({ path: 'spectator', followed: null, stats: null, title: 'Tower' });
      // The client's role is 'spectator' until the welcome: a page still walking is not a spectator's (netPage's welcome flies it).
      expect(spectatorHudView(page(), walking)).toBeNull();
    });

    it("a scenic view titles the panel with its Desc through the page's views (`NetPage.scenicViews`, NetPageDeps.scenicViews once in matchNet, PF-31; D:L90239-90256); no map yet, FREE CAMERA", () => {
      const views: readonly ScenicView[] = [{ name: 'Gate', at: [0, 0, 0], pitch: 0, yaw: 0, roll: 0 }, { name: 'Hostage Room', at: [1, 2, 3], pitch: -10, yaw: 243, roll: 0 }];
      const scenic = { ...page({ spectator: { mode: 'scenic', scenic: 1 } }), scenicViews: () => views };
      const view = spectatorHudView(scenic, flying)!;
      expect(view).toEqual({ path: 'spectator', followed: null, stats: null, title: 'Hostage Room' });
      expect(spectatorInfoText(view).title).toBe('Hostage Room');
      const noMap = { ...page({ spectator: { mode: 'scenic', scenic: 1 } }), scenicViews: (): readonly ScenicView[] => [] };
      expect(spectatorInfoText(spectatorHudView(noMap, flying)!).title).toBe('FREE CAMERA');
    });

    it("a player: alive, none; dead on his own body, 'own'; watching a teammate, 'teammate' with its name; no page, none", () => {
      const player = { client: { role: 'player' } };
      expect(spectatorHudView(page(player), walking)).toBeNull();
      expect(spectatorHudView(page(player), deadOwn)).toEqual({ path: 'own', followed: null, stats: null });
      expect(spectatorHudView(page({ ...player, spectator: { watching: 4 } }), deadAway))
        .toEqual({ path: 'teammate', followed: { name: 'P4', health: null }, stats: null });
      expect(spectatorHudView(null, deadOwn)).toBeNull();
    });

    it("SPECTATOR-VIEW W4: the followed body's tag is its score row's `clan` (CLAN-TAG-ROUND, research 275 §2.1; FUN_002c3ac0 D:L85560), none without one", () => {
      const rows = [{ id: 4, kills: 2, deaths: 1, score: 5, clan: 'NSW' }, { id: 6, kills: 0, deaths: 0, score: 0 }];
      expect(spectatorHudView(page({ rows, spectator: { mode: 'follow', target: 4 } }), flying)!.followed).toEqual({ name: 'P4', health: null, tag: 'NSW' });
      expect(spectatorHudView(page({ rows, spectator: { mode: 'follow', target: 6 } }), flying)!.followed).toStrictEqual({ name: 'P6', health: null });
      expect(spectatorHudView(page({ rows, spectator: { mode: 'follow', target: 9 } }), flying)!.followed).toStrictEqual({ name: 'P9', health: null });
      const player = { client: { role: 'player' } };
      expect(spectatorHudView(page({ ...player, rows, spectator: { watching: 4 } }), deadAway)!.followed).toEqual({ name: 'P4', health: null, tag: 'NSW' });
    });

    it("LATER 119 (SPECTATOR_FOLLOWED_HEALTH_READING): the followed body's bar is the client's `healthOf` -- a spectator's follow and a dead player's teammate; a dead body 0; none known (a replay, an enemy), no bar", () => {
      const health = new Map<number, number>([[4, 0.5], [6, 0]]);
      const client = (role: string) => ({ role, healthOf: (id: number): number | null => health.get(id) ?? null });
      expect(spectatorHudView(page({ client: client('spectator'), spectator: { mode: 'follow', target: 4 } }), flying)!.followed!.health).toBe(0.5);
      expect(spectatorHudView(page({ client: client('spectator'), spectator: { mode: 'follow', target: 6 } }), flying)!.followed!.health).toBe(0);
      expect(spectatorHudView(page({ client: client('spectator'), spectator: { mode: 'follow', target: 9 } }), flying)!.followed!.health).toBeNull();
      expect(spectatorHudView(page({ client: client('player'), spectator: { watching: 4 } }), deadAway)!.followed!.health).toBe(0.5);
      // A client with no `healthOf` (an older shape): no bar, as before.
      expect(spectatorHudView(page({ spectator: { mode: 'follow', target: 4 } }), flying)!.followed!.health).toBeNull();
    });

    it("PAR-48b: a ghost (benched, never spawned; the bench alone, whatever the walk) -- 'own' on its own object, 'teammate' once it watches one (research 282 §7)", () => {
      // The dispatch's not-alive branch holds the ghost's lines on both paths (FUN_001f97b0 D:L56996/D:L57048-57060,
      // FUN_001f9f20 D:L57149/D:L57162-57165), so a ghost is drawn as the dead are. The bench decides it here: since
      // NU-11b F1 the ghost's walk is dead from its seat too (`NetPage.seatGhost`), but the view does not lean on it.
      // LATER 118: a benched seat's view carries its six help lines (`help`); `page()` has no `ghost()`, so the dead's.
      const ghost = { client: { role: 'player' } };
      expect(spectatorHudView(page({ ...ghost, spectator: { benched: true } }), walking))
        .toEqual({ path: 'own', followed: null, stats: null, help: deadHelpLines({ ghost: false, watching: false, device: 'pad' }) });
      expect(spectatorHudView(page({ ...ghost, spectator: { benched: true, watching: 4 } }), flying))
        .toEqual({ path: 'teammate', followed: { name: 'P4', health: null }, stats: null, help: deadHelpLines({ ghost: false, watching: true, device: 'pad' }) });
      // Back in play (a spawn, the next round: `SpectatorView.reset`), the walker's HUD.
      expect(spectatorHudView(page({ ...ghost, spectator: { benched: false } }), walking)).toBeNull();
    });
  });
});

/**
 * LATER 118 (issue #138; research 282 §8, research 91 §12): a dead player's six help lines are the HUD's `'help'` on both
 * of his paths -- `FUN_001f97b0` on his own body (D:L56996-57107, placed and shown D:L57120-57135) and `FUN_001f9f20`
 * watching a teammate (D:L57149-57173, D:L57191-57205) -- on the one clock `+0x1a0e8` (D:L56541-56562), zeroed at the
 * viewed local body's death edge (D:L56631-56645) and not when the camera moves on to a teammate; hidden by the
 * scoreboard (D:L56817-56823) and by the Chat menu, for every seat (control state 2, D:L56617-56622).
 */
describe("LATER 118: a dead player's help lines (FUN_001f97b0, FUN_001f9f20)", () => {
  const SIZES_118 = { ...SIZES, 'font_special_01.tif': { width: 256, height: 64 }, 'ret_nav_01.tif': { width: 16, height: 16 } };
  const busy = (spectator: HudSpectatorView | null, over: Partial<HudModel> = {}): HudModel =>
    model({ spectator, action: 'climb', range: 12, zoom: 1, position: [0, 0], navPoints: [{ name: 'Charlie', x: 0, z: -10 }], ...over });
  const elements = (quads: { element: string }[]): Set<string> => new Set(quads.map((q) => q.element));
  const settled = { ...AT_REST, stance: 1, help: 1 };
  const source = (s: Partial<SpectatorHudSource['spectator']>, ghost = false): SpectatorHudSource => ({
    client: { role: 'player' }, rows: [{ id: 4, kills: 0, deaths: 0, score: 0 }], nameOf: (id) => `P${id}`, ghost: () => ghost,
    spectator: { mode: 'free', target: null, scenic: -1, watching: null, benched: true, ...s },
  });
  const deadOwn = { mode: () => 'walk', isDead: () => true }, deadAway = { mode: () => 'fly', isDead: () => true };
  const R2 = String.fromCharCode(0xbe), RIGHT = String.fromCharCode(0xa3), LEFT = String.fromCharCode(0xaf);
  const OWN = spectatorHudView(source({}), deadOwn)!;
  const MATE = spectatorHudView(source({ watching: 4 }), deadAway)!;

  it("the view carries the six lines its path writes: classic's dead and a ghost, on his own body and watching (benched seats only)", () => {
    expect(OWN.help).toEqual([
      `You have died.  ${R2} Select new weapons.`, `Use the ${RIGHT} and ${LEFT} directional buttons`, 'to cycle through living teammates', ' ', ' ', ' ',
    ]);
    expect(MATE.help).toEqual([`You have died.  Use the ${RIGHT} and ${LEFT}`, 'directional buttons to cycle through', 'living teammates.', ' ', ' ', ' ']);
    expect(spectatorHudView(source({}, true), deadOwn)!.help).toEqual(deadHelpLines({ ghost: true, watching: false, device: 'pad' }));
    expect(spectatorHudView(source({ watching: 4 }, true), deadAway)!.help).toEqual(deadHelpLines({ ghost: true, watching: true, device: 'pad' }));
    for (const v of [OWN, MATE]) expect(v.help).toHaveLength(6);
    // The page's device renders the %c (`promptDevice`): the key on /testroom's keyboard.
    expect(spectatorHudView(source({}), deadOwn, undefined, 'keyboard')!.help![0]).toBe('You have died.  [I] Select new weapons.');
    // A respawn room's dead (not benched): no lines from this view (the respawn help is the help pipeline's, research 351).
    expect(spectatorHudView(source({ benched: false }), deadOwn)).toEqual({ path: 'own', followed: null, stats: null });
  });

  it("hudLayout draws them centred on x 324 from y 380, ink (100, 100, 20) at 100, the pad's glyphs from font_special_01 (own: R2 and the d-pad pair; teammate: the pair)", () => {
    for (const [view, glyphs] of [[OWN, 3], [MATE, 2]] as const) {
      const { quads, rects } = hudLayout(PS2, busy(view), SIZES_118, settled);
      const help = rects.help!;
      expect(help, view.path).toBeDefined();
      expect(Math.abs(help.x + help.width / 2 - 324), view.path).toBeLessThan(2);
      expect(help.y).toBeGreaterThan(360);
      expect(help.y + help.height).toBeLessThan(448);
      const ink = quads.filter((q) => q.element === 'help' && q.texture === 'font_text_01.tif' && q.rgba[0] > 0);
      expect(ink[0]!.rgba, view.path).toEqual([100 / 128, 100 / 128, 20 / 128, 100 / 128]);
      expect(quads.filter((q) => q.element === 'help' && q.texture === 'font_special_01.tif'), view.path).toHaveLength(glyphs);
      expect(elements(hudLayout(PS2, busy(view), SIZES_118, { ...settled, help: 0 }).quads).has('help'), view.path).toBe(false);
    }
  });

  // The edge is the camera's (the review's F1): `DAT_00408f08` is last frame's VIEWED actor's alive bit (D:L56754); the
  // clock is zeroed when it was alive and this frame's viewed actor is the local body, dead (D:L56631-56645, D:L56642).
  it('one clock: zeroed at the death edge (the walker giving way to a dead path, D:L56631-56645), not restarted on own -> teammate (D:L56642); restarted from a living teammate back to his own body', () => {
    const hud = new Hud();
    hud.setSpectator(null);
    hud.step(30);                                  // the walker's clock long past its fade
    expect(hud.timing().help).toBe(0);
    hud.setSpectator(OWN);                         // the death edge viewing himself
    expect(hud.timing().help).toBe(1);
    hud.step(5);
    hud.setSpectator(MATE);                        // the first cycle to a teammate (alive -> no edge): the same clock
    expect(hud.timing().help).toBe(1);
    hud.step(5.25);
    expect(hud.timing().help).toBeCloseTo(0.5, 9);
    hud.setSpectator(OWN);                         // back on his own body from a living teammate: alive -> local dead, an edge
    expect(hud.timing().help).toBe(1);
    hud.step(10.25);
    expect(hud.timing().help).toBeCloseTo(0.5, 9);
  });

  it('not restarted from a dead watched teammate back to his own body (dead -> dead: no edge; LATER 69 keeps a dead teammate watched)', () => {
    const deadMate = (bodies: readonly { id: number; flags: number }[]): HudSpectatorView =>
      spectatorHudView({ ...source({ watching: 4 }), client: { role: 'player', bodies: () => bodies } }, deadAway)!;
    const dead = deadMate([{ id: 4, flags: 0 }]), gone = deadMate([]), living = deadMate([{ id: 4, flags: 64 }]);
    expect(dead.watchedDead).toBe(true);           // the room's body, its Alive flag (BodyFlag.Alive, 64) clear
    expect(gone.watchedDead).toBe(true);           // a body gone from the room's list: retired (FUN_005998b0 D:L455516-455525)
    expect(living.watchedDead).toBeUndefined();
    const hud = new Hud();
    hud.setSpectator(OWN);
    hud.step(5);
    hud.setSpectator(dead);
    hud.step(5.25);
    expect(hud.timing().help).toBeCloseTo(0.5, 9);
    hud.setSpectator(OWN);                         // dead -> local dead: no edge
    expect(hud.timing().help).toBeCloseTo(0.5, 9);
  });

  it('a spectator promoted to a ghost (the netRules `promoted` case): the spectator\'s view giving way to a dead path restarts the clock (D:L56631-56645; DEAD_HELP_GHOST_CLOCK_READING)', () => {
    const SPECTATING: HudSpectatorView = { followed: { name: 'P4', health: null }, stats: null };
    const GHOST_OWN = spectatorHudView(source({}, true), deadOwn)!, GHOST_MATE = spectatorHudView(source({ watching: 4 }, true), deadAway)!;
    for (const ghost of [GHOST_OWN, GHOST_MATE]) {
      const hud = new Hud();
      hud.setSpectator(SPECTATING);
      hud.step(30);                                // watched past the spectator's own lines' fade
      expect(hud.timing().help, ghost.path).toBe(0);
      hud.setSpectator(ghost);
      expect(hud.timing().help, ghost.path).toBe(1);
    }
  });

  it('SELECT hides them on his own body and watching (D:L56817-56823)', () => {
    for (const view of [OWN, MATE]) {
      const drawn = elements(hudPass(PS2, busy(view, { scoreboard: true }), SIZES_118, settled, false, null, 'ps2').quads);
      expect(drawn.has('scoreboard'), view.path).toBe(true);
      expect(drawn.has('help'), view.path).toBe(false);
    }
  });

  // The Chat menu hides them for every seat (control state 2, D:L56617-56622): own, teammate, and the live spectator's.
  const SEATS: [string, () => HudSpectatorView][] = [['own', () => OWN], ['teammate', () => MATE], ['the live spectator', () => ({ followed: null, stats: null })]];
  it.each(SEATS)('the Chat menu hides them: %s (control state 2, D:L56617-56622)', (_seat, view) => {
    expect(elements(hudLayout(PS2, busy(view()), SIZES_118, settled).quads).has('help'), 'without the Chat menu').toBe(true);
    expect(elements(hudLayout(PS2, busy(view(), { commandMenu: true }), SIZES_118, settled).quads).has('help'), 'with the Chat menu open').toBe(false);
  });
});

/**
 * LATER 117 (research 282 §9): a dead player watching a teammate. The box's show `FUN_00237e50` (D:L57180) shows the panel
 * and its child the icon `+0x1f0`, then hides the group `+0x270` -- the "%d/%d" and "%d MAG%c" texts and the four
 * fire-mode cells -- when the viewed actor is not the local one (D:L85367-85371; the group's draw `FUN_00364e70` walks its
 * children only while shown). The icon is the viewed actor's current item's (`FUN_00237760` D:L85148-85156,
 * D:L85245-85249): the watched body's held item, `BodyState.weapon`, through the room's bodies. A spectator still gets
 * no box (D:L85354).
 */
describe('RSP-6: respawn help uses the original lower-centre widgets (research 351)', () => {
  const sizes = { ...SIZES, 'font_special_01.tif': { width: 256, height: 64 } };
  const ready: HudSpectatorView = {
    path: 'own', followed: null, stats: null, respawnReady: true,
    help: ['You have died.  \u00be Select new weapons.', 'Press the \u00a6 button to respawn.', ' ', ' ', ' ', ' '],
  };
  const draw = (help: number, over: Partial<HudModel> = {}) =>
    hudLayout(PS2, model({ spectator: ready, ...over }), sizes, { ...AT_REST, help });

  it('draws native Inventory/Action glyphs at the shared help layout with the usual yellow ink and shadow', () => {
    const { quads, rects } = draw(1);
    const ink = quads.filter((q) => q.element === 'help' && q.texture === 'font_text_01.tif' && q.rgba[0] > 0);
    expect(ink.length).toBeGreaterThan(0);
    expect(ink.every((q) => q.rgba.every((v, i) => v === [100 / 128, 100 / 128, 20 / 128, 100 / 128][i]))).toBe(true);
    expect(quads.filter((q) => q.element === 'help' && q.texture === 'font_special_01.tif')).toHaveLength(2);
    expect(quads.some((q) => q.element === 'help' && q.rgba[0] === 0 && q.rgba[3] === 96 / 128)).toBe(true);
    expect(Math.abs(rects.help!.x + rects.help!.width / 2 - SPECTATOR_HELP.x)).toBeLessThan(2);
    expect(rects.help!.y).toBeGreaterThan(360);
    expect(rects.help!.y + rects.help!.height).toBeLessThan(416);
  });

  it('fades the first line normally while the eligible second line reasserts alpha100 past10.5 seconds', () => {
    const midway = draw(0.5).quads.filter((q) => q.element === 'help' && q.texture === 'font_text_01.tif' && q.rgba[0] > 0);
    expect(new Set(midway.map((q) => q.rgba[3]))).toEqual(new Set([50 / 128, 100 / 128]));
    const past = draw(0).quads.filter((q) => q.element === 'help');
    expect(past.length).toBeGreaterThan(0);
    expect(past.filter((q) => q.texture === 'font_special_01.tif')).toHaveLength(1); // Cross remains; Inventory faded away
    expect(past.filter((q) => q.texture === 'font_text_01.tif' && q.rgba[0] > 0).every((q) => q.rgba[3] === 100 / 128)).toBe(true);
    expect(draw(0).rects.help!.y).toBeGreaterThan(380);                           // the second baseline398, no first-line residue
  });

  it('Chat and the scoreboard hide the persistent line just as they hide the other help widgets', () => {
    expect(draw(0, { commandMenu: true }).quads.some((q) => q.element === 'help')).toBe(false);
    const pass = hudPass(PS2, model({ spectator: ready, scoreboard: true }), sizes, { ...AT_REST, help: 0 }, false, null, 'ps2');
    expect(pass.quads.some((q) => q.element === 'help')).toBe(false);
  });

  it('leaving a ready view and then dying again resets the ordinary help clock without retaining its second line', () => {
    const hud = new Hud(); hud.setSpectator(ready); hud.step(11);
    expect(hud.timing().help).toBe(0);
    hud.setSpectator(null);
    hud.setSpectator({ ...ready, respawnReady: false, help: [ready.help![0]!, ' ', ' ', ' ', ' ', ' '] });
    expect(hud.timing().help).toBe(1);
    expect(hud.state().model.spectator?.respawnReady).toBe(false);
    expect(hud.state().model.spectator?.help?.[1]).toBe(' ');
  });
});

describe("LATER 117: a dead player watching a teammate draws the box's panel and the teammate's held icon (FUN_00237e50)", () => {
  const M4 = 54, SIG = 57, ALIVE = 64;
  const ICONS: Record<number, string> = { [M4]: 'm4carbine_icon.tif', [SIG]: 'sigcommando_icon.tif' };
  const icon = (id: number): string | null => ICONS[id] ?? null;
  const SIZES_117 = { ...SIZES, 'sigcommando_icon.tif': { width: 128, height: 32 } };
  const deadAway = { mode: () => 'fly', isDead: () => true }, deadOwn = { mode: () => 'walk', isDead: () => true };
  type Body = { id: number; flags: number; weapon?: number };
  const source = (bodies?: readonly Body[], s: Partial<SpectatorHudSource['spectator']> = {}): SpectatorHudSource => ({
    client: { role: 'player', ...(bodies ? { bodies: () => bodies } : {}) }, rows: [{ id: 4, kills: 0, deaths: 0, score: 0 }],
    nameOf: (id) => `P${id}`, spectator: { mode: 'free', target: null, scenic: -1, watching: 4, benched: true, ...s },
  });
  /** `resolver` null: a page that passes none (the fifth argument absent). */
  const watched = (bodies?: readonly Body[], resolver: ((id: number) => string | null) | null = icon): HudSpectatorView =>
    spectatorHudView(source(bodies), deadAway, undefined, 'pad', resolver ?? undefined)!;
  const MATE: HudSpectatorView = { path: 'teammate', followed: { name: 'P4', health: null }, stats: null, weaponIcon: 'sigcommando_icon.tif' };
  const { weaponIcon: _none, ...BARE } = MATE;
  const elements = (quads: { element: string }[]): Set<string> => new Set(quads.map((q) => q.element));

  it("spectatorHudView: the watched body's held item (`BodyState.weapon`) as the view's icon, the watched one's and no other's", () => {
    expect(watched([{ id: 4, flags: ALIVE, weapon: SIG }]).weaponIcon).toBe('sigcommando_icon.tif');
    expect(watched([{ id: 3, flags: ALIVE, weapon: M4 }, { id: 4, flags: ALIVE, weapon: SIG }]).weaponIcon).toBe('sigcommando_icon.tif');
    // A dead watched teammate (LATER 69 keeps him watched): the snapshot's item (DEAD_WATCH_HELD_ICON_READING).
    expect(watched([{ id: 4, flags: 0, weapon: M4 }]).weaponIcon).toBe('m4carbine_icon.tif');
  });

  it.each([
    ['no item in the hand (255)', [{ id: 4, flags: ALIVE, weapon: 255 }], icon],
    ['an item the table does not hold', [{ id: 4, flags: ALIVE, weapon: 200 }], icon],
    ['the body gone from the room', [{ id: 3, flags: ALIVE, weapon: M4 }], icon],
    ['a body with no item field', [{ id: 4, flags: ALIVE }], icon],
    ['no body list', undefined, icon],
    ['no resolver (a page that passes none)', [{ id: 4, flags: ALIVE, weapon: SIG }], null],
  ] as const)('spectatorHudView: no icon with %s -- the panel alone', (_what, bodies, resolver) => {
    expect('weaponIcon' in watched(bodies, resolver)).toBe(false);
  });

  it("spectatorHudView: only the watching path carries one -- his own body and the live spectator do not", () => {
    const bodies = [{ id: 4, flags: ALIVE, weapon: SIG }];
    expect('weaponIcon' in spectatorHudView(source(bodies, { watching: null }), deadOwn, undefined, 'pad', icon)!).toBe(false);
    const live = spectatorHudView({ ...source(bodies, { mode: 'follow', target: 4, watching: null, benched: false }), client: { role: 'spectator', bodies: () => bodies } },
      { mode: () => 'fly', isDead: () => false }, undefined, 'pad', icon)!;
    expect(live.path).toBe('spectator');
    expect('weaponIcon' in live).toBe(false);
  });

  it('TEAMMATE_HIDES: the hide-all\'s set less the panel and the icon -- the group `+0x270` (rounds, MAGS, fire-mode cells) stays hidden', () => {
    expect(new Set(TEAMMATE_HIDES)).toEqual(new Set([...SPECTATOR_HIDES].filter((e) => e !== 'panel' && e !== 'icon')));
    for (const e of ['rounds', 'mags', 'firemode'] as const) expect(TEAMMATE_HIDES.has(e), e).toBe(true);
  });

  it("hudLayout on 'teammate': the panel and the teammate's icon at the box's place, not the dead walker's own; no rounds, MAGS or fire-mode row", () => {
    const { quads } = hudLayout(PS2, model({ spectator: MATE, weaponIcon: 'm4carbine_icon.tif', spare: 2 }), SIZES_117);
    const drawn = elements(quads);
    expect(drawn.has('panel')).toBe(true);
    const icons = quads.filter((q) => q.element === 'icon');
    expect(icons.map((q) => q.texture)).toEqual(['sigcommando_icon.tif']);
    // The walker's box's place (`FUN_00237fc0`: the icon top-left at (20, 389), its own size).
    expect(icons[0]).toMatchObject({ x: HUD_LAYOUT.ammo.icon.x + 64, y: HUD_LAYOUT.ammo.icon.y + 16, w: 128, h: 32 });
    for (const e of ['rounds', 'mags', 'firemode']) expect(drawn.has(e), e).toBe(false);
    // The same view with no icon: the panel alone (`FUN_005be050` answers no bitmap with no current item, D:L85245-85249).
    const bare = elements(hudLayout(PS2, model({ spectator: BARE, weaponIcon: 'm4carbine_icon.tif' }), SIZES_117).quads);
    expect(bare.has('panel')).toBe(true);
    expect(bare.has('icon')).toBe(false);
  });

  it('hudLayout: the live spectator still has no box (D:L85354), and his own body keeps the walker\'s own', () => {
    const live = elements(hudLayout(PS2, model({ spectator: { followed: { name: 'P4', health: null }, stats: null, weaponIcon: 'sigcommando_icon.tif' } }), SIZES_117).quads);
    for (const e of ['panel', 'icon', 'rounds', 'mags', 'firemode']) expect(live.has(e), e).toBe(false);
    const own = hudLayout(PS2, model({ spectator: { path: 'own', followed: null, stats: null }, weaponIcon: 'm4carbine_icon.tif' }), SIZES_117).quads;
    expect(own.filter((q) => q.element === 'icon').map((q) => q.texture)).toEqual(['m4carbine_icon.tif']);
  });

  it("Hud.state().icon: the bitmap the box's icon draws -- the teammate's on 'teammate', the walker's own otherwise, null with none drawn", () => {
    const px = (): { width: number; height: number; data: Uint8ClampedArray } => ({ width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) });
    const frame = { autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: () => {} };
    const hud = new Hud();
    hud.setBitmaps({ 'newweapnbkrnd.tif': px(), 'm4carbine_icon.tif': px(), 'sigcommando_icon.tif': px(), 'firemode.tif': px() });
    hud.setVisible(true);
    hud.setWeaponIcon('m4carbine_icon.tif');
    hud.step(2);
    hud.render(frame);
    expect(hud.state().icon).toBe('m4carbine_icon.tif');
    hud.setSpectator(MATE);
    expect(hud.state().icon).toBe('sigcommando_icon.tif');
    hud.setSpectator(BARE);
    expect(hud.state().icon).toBeNull();
    hud.setSpectator(MATE);
    hud.setScoreboard(true);                         // SELECT held: the box hidden (D:L56810), so no icon
    expect(hud.state().icon).toBeNull();
  });
});

/**
 * PAR-34 group 4 (research 252 s3; ACT.R8): the HUD's own clock (`Hud.render`'s `performance.now()`). The round's clock
 * (`sinceOn`: zeroed at the room's round start, `startRound`) counts the frame's real seconds, so below 10 fps it keeps
 * the room's round time -- the round start's fader and banner (`roundStartAt`), the ammo box's spawn fade (`SPAWN_FADE`)
 * and the message window's lines (`messageAlpha`), which are stamped on it. The HUD's animations -- the stance fade
 * (`STANCE_FADE`), the marks' and the prompt's pulses, the hold bar's fade, the help lines, the event banner's seconds --
 * are presentation and keep the clamped step (0.1 s).
 */
describe("PAR-34 group 4: the HUD's round clock in real time at 5 fps (research 252 s3; ACT.R8)", () => {
  const frame = { autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: () => {} };
  /** A HUD on, rendered every `ms` from t = 0 for `n` frames; `each` after every frame with the real seconds since the first. */
  function run(ms: number, n: number, each: (hud: Hud, real: number) => void, before: (hud: Hud) => void = () => {}): Hud {
    let now = 1000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const hud = new Hud();
    hud.setVisible(true);
    before(hud);
    hud.render(frame);                                                                   // the first frame: no step
    for (let i = 1; i <= n; i++) { now += ms; hud.render(frame); each(hud, (i * ms) / 1000); }
    clock.mockRestore();
    return hud;
  }

  it('the spawn fade ends SPAWN_FADE.hold + ramp (1.5 s) of real time after the HUD comes on at 5 fps, as at 60', () => {
    for (const ms of [1000 / 60, 200]) {
      let at: number | null = null;
      run(ms, 200, (hud, real) => { if (at === null && hud.timing().fade >= 1) at = real; });
      expect(at, `${ms} ms`).toBeGreaterThanOrEqual(SPAWN_FADE.hold + SPAWN_FADE.ramp - 1e-9);
      expect(at, `${ms} ms`).toBeLessThanOrEqual(SPAWN_FADE.hold + SPAWN_FADE.ramp + ms / 1000 + 1e-9);   // the lane: 3 s
    }
  });

  it("a posted message leaves the window when messageAlpha's life of real time has passed at 5 fps, not twice that", () => {
    let life = 0;
    while (messageAlpha(life) !== null) life += 0.01;                                    // ~7.36 s
    let gone: number | null = null;
    run(200, 200, (hud, real) => {
      if (gone === null && !hud.state().model.banner.some((m) => m.lines.some((l) => l.text === 'PAR34'))) gone = real;
    }, (hud) => { hud.postMessage('PAR34'); });
    expect(gone).toBeGreaterThanOrEqual(life - 0.01 - 1e-9);
    expect(gone).toBeLessThanOrEqual(life + 0.2 + 1e-9);                                 // the lane: ~14.8 s
  });

  it('the stance fade is presentation: at 5 fps it runs on the clamped 0.1 s a frame', () => {
    const hud = run(200, 1, () => {}, (h) => { h.setStance('crouch'); });
    expect(hud.timing().stance).toBeCloseTo(STANCE_FADE.start - STANCE_FADE.perSecond * 0.1, 9);
  });
});

/**
 * NET-REFILL N4 (research 312 §4.2, §6 item 4; NET_REFILL_MAGS_HIDDEN_READING): online the ammo box hides MAGS for a
 * pistol in the hand, and in a respawn game for any primary class -- the MGL and the M79 included (`FUN_00237760`
 * D:L85181-85192; `../src/net/netRefill` `netMagsHidden`). `%d/%d` is unchanged (D:L85189-85190). The page's `Fire`
 * carries the test in its magazine state (`magsHidden`, only when it holds); the HUD draws no MAGS line then.
 */
describe('NET-REFILL N4: the ammo box\'s MAGS hidden online (FUN_00237760 D:L85181-85192)', () => {
  const CLASSIC = { respawn: false }, RESPAWN = { respawn: true };
  it('ammoLines: the Mark 23 online 12/12 and no MAGS; the M4A1 classic 30/30 2 MAGS, respawn no MAGS; the MGL in respawn no MAGS', () => {
    expect(ammoLines({ rounds: 12, capacity: 12, spare: 2, magsHidden: netMagsHidden(15, CLASSIC) })).toEqual({ rounds: '12/12', mags: null });
    expect(ammoLines({ rounds: 30, capacity: 30, spare: 2, magsHidden: netMagsHidden(54, CLASSIC) })).toEqual({ rounds: '30/30', mags: '2 MAGS' });
    expect(ammoLines({ rounds: 30, capacity: 30, spare: 2, magsHidden: netMagsHidden(54, RESPAWN) })).toEqual({ rounds: '30/30', mags: null });
    expect(ammoLines({ rounds: 6, capacity: 6, spare: 1, magsHidden: netMagsHidden(142, RESPAWN) })).toEqual({ rounds: '6/6', mags: null });
  });

  it('the page\'s feed: Fire\'s magazine state with the rule on hides the line; offline it shows as before', () => {
    const grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [], [], [], []);
    const mark23: WeaponRecord = { ...DEFAULT_RIFLE, name: 'Mark 23', id: 15, fireWait: 0.2, magazine: 12, mags: 3 };
    const fire = new Fire({ grid: () => grid, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }) }, mark23, undefined, () => 0.5);
    expect(fire.state().magazine).toEqual({ rounds: 12, capacity: 12, spare: 2, reloading: false });   // offline: no flag
    fire.setNetRefill(CLASSIC);
    expect(fire.state().magazine).toEqual({ rounds: 12, capacity: 12, spare: 2, reloading: false, magsHidden: true });
    const hud = new Hud();
    hud.feed({ magazine: fire.state().magazine, yaw: 0 });
    expect(ammoLines(hud.state().model)).toEqual({ rounds: '12/12', mags: null });
    expect(hud.state().model.spare).toBe(2);                                        // the count kept; the line hidden
    fire.setNetRefill(null);
    hud.feed({ magazine: fire.state().magazine, yaw: 0 });
    expect(ammoLines(hud.state().model)).toEqual({ rounds: '12/12', mags: '2 MAGS' });
  });

  it('the hand\'s class, not a round mode\'s: the M4A1 in a respawn game hides it; DEFAULT_RIFLE classic shows it', () => {
    const grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [], [], [], []);
    const fire = new Fire({ grid: () => grid, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }) }, DEFAULT_RIFLE, undefined, () => 0.5);
    fire.setNetRefill(RESPAWN);
    expect(fire.state().magazine.magsHidden).toBe(true);
    fire.setNetRefill(CLASSIC);
    expect(fire.state().magazine.magsHidden).toBeUndefined();
  });
});

/**
 * NU-9 (a), research 327 §5: the names on the info box's bar online. N1, the walker's own name on his own bar -- the info
 * box's per-frame draw `FUN_00238500` writes the viewed actor's name (`+0x14`, D:L85562) with its seat's tag when one
 * character or more (D:L85558-85569), and for a living player that actor is his own (327 §1.1); N2, the name's text at
 * scale 0.8 on the pen (555, 409), centred (`FUN_002388a0` D:L85646-85653, `DAT_003dcc48/50/58`); N3, the spectator
 * panel's title tag from two characters (`FUN_002425e0` D:L90266-90270).
 */
describe('NU-9 (a): the names on the info box (research 327 §5 N1-N3)', () => {
  const N_SIZES = { ...SIZES, 'font_special_01.tif': { width: 256, height: 64 } };
  const settled = { ...AT_REST, stance: 1, help: 1 };
  const nameQuads = (over: Partial<HudModel>) => hudLayout(PS2, model(over), N_SIZES, settled).quads.filter((q) => q.element === 'name');
  const page = (over: Partial<OwnNameSource> = {}): OwnNameSource => ({
    client: { id: 4 }, rows: [{ id: 4 }], nameOf: (id) => (id === 4 ? 'BRAVO' : `P${id}`), ...over,
  });

  describe('N1: the walker\'s own name on his bar, the name and the tag kept apart (327 F4)', () => {
    it('ownHudName: the page\'s own id\'s name (`nameOf(client.id)`) and its row\'s clan, apart; no page, none', () => {
      expect(ownHudName(page())).toEqual({ name: 'BRAVO', tag: '' });
      expect(ownHudName(page({ rows: [{ id: 4, clan: 'NSW' }, { id: 5, clan: 'XX' }] }))).toEqual({ name: 'BRAVO', tag: 'NSW' });
      expect(ownHudName(null)).toEqual({ name: '', tag: '' });
      expect(ownHudName(page({ client: { id: 0 } }))).toEqual({ name: '', tag: '' });   // before the welcome (F5)
      // A rename (`renamed`, NetPage.nameOf) is read on the next frame: the function reads the page each call.
      let name = 'BRAVO';
      const live = page({ nameOf: () => name });
      expect(ownHudName(live).name).toBe('BRAVO');
      name = 'CHARLIE';
      expect(ownHudName(live).name).toBe('CHARLIE');
      // A late joiner, welcomed and not spawned (no row yet; research 322 R322.5): his name, no tag.
      expect(ownHudName(page({ rows: [] }))).toEqual({ name: 'BRAVO', tag: '' });
    });

    it('the walker\'s info box draws "BRAVO"; with his tag "[NSW] BRAVO" (D:L85563-85567); a long one cut as the tagged string (D:L85571-85576)', () => {
      const bare = nameQuads({ name: 'BRAVO' });
      expect(bare.length).toBeGreaterThan(0);
      expect(nameQuads({ name: 'BRAVO', tag: 'NSW' })).toEqual(nameQuads({ name: '[NSW] BRAVO' }));
      expect(nameQuads({ name: 'BRAVO', tag: 'NSW' })).not.toEqual(bare);
      expect(nameQuads({ name: 'BRAVO', tag: '' })).toEqual(bare);
      expect(nameQuads({ name: 'W'.repeat(20), tag: 'NSW' })).toEqual(nameQuads({ name: '[NSW] WWW-' }));
      // No name (no page: the free walk of /testroom): nothing drawn, a tag alone included.
      expect(nameQuads({ name: '' })).toEqual([]);
      expect(nameQuads({ name: '', tag: 'NSW' })).toEqual([]);
    });

    it('the \'own\' path (dead on his own body, a ghost) draws the same name; a spectator\'s free camera none (SPECTATOR_OWN_INFO_PLACEHOLDER)', () => {
      const own: HudSpectatorView = { path: 'own', followed: null, stats: null };
      expect(nameQuads({ name: 'BRAVO', tag: 'NSW', spectator: own })).toEqual(nameQuads({ name: 'BRAVO', tag: 'NSW' }));
      expect(nameQuads({ name: 'BRAVO', tag: 'NSW', spectator: { followed: null, stats: null } })).toEqual([]);
    });

    it('Hud.setPlayerName(name, tag) keeps the two apart; a late joiner\'s ghost on its own object draws it', () => {
      const px = (): { width: number; height: number; data: Uint8ClampedArray } => ({ width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) });
      const hud = new Hud();
      hud.setBitmaps({ 'newweapnbkrnd.tif': px(), 'font_text_01.tif': px() });
      hud.setPlayerName('BRAVO', 'NSW');
      expect(hud.state().model).toMatchObject({ name: 'BRAVO', tag: 'NSW' });
      hud.setSpectator({ path: 'own', followed: null, stats: null });
      hud.render({ autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: () => {} });
      expect(hud.state().rects.name).toBeDefined();
      hud.setPlayerName('BRAVO');
      expect(hud.state().model).toMatchObject({ name: 'BRAVO', tag: '' });
    });

    it('the scoreboard\'s single-row fallback (no rows) shows the bare name, never "[NSW] BRAVO" (hud.ts boardLayout; 327 F4)', () => {
      const board = (over: Partial<HudModel>) => hudPass(PS2, model({ scoreboard: true, ...over }), N_SIZES, AT_REST, false, null, 'ps2').quads
        .filter((q) => q.element === 'scoreboard');
      const tagged = board({ name: 'BRAVO', tag: 'NSW' });
      expect(tagged.length).toBeGreaterThan(0);
      expect(tagged).toEqual(board({ name: 'BRAVO' }));
      expect(tagged).not.toEqual(board({ name: '[NSW] BRAVO' }));
    });

    it('the name is the HUD\'s string colour on every path (D:L85648-85651): no colour by side or state', () => {
      const ink = (q: { rgba: readonly number[] }) => q.rgba[0]! > 0;
      for (const q of nameQuads({ name: 'BRAVO', tag: 'NSW' }).filter(ink)) expect(q.rgba).toEqual(HUD_COLOURS.text);
      for (const q of nameQuads({ name: 'BRAVO', spectator: { path: 'own', followed: null, stats: null } }).filter(ink)) expect(q.rgba).toEqual(HUD_COLOURS.text);
    });
  });

  describe('N2: the name\'s text at scale 0.8 on the pen (555, 409), centred (FUN_002388a0 D:L85646-85653)', () => {
    it('the spot: DAT_003dcc48/50 = (555, 409), DAT_003dcc58 = 0.8, +0x69 = 1 (centred)', () => {
      expect(HUD_LAYOUT.info.name).toEqual({ x: 555, y: 409, scale: 0.8, align: 'centre' });
    });

    it('the travels at 0.8 by FUN_00363c20\'s rule: "[NSW] WWWWWWWWW" 131, "WWWWWWWWW" 90, thirteen W 130 (the edge, D:L85571 "over")', () => {
      expect(textWidth('[NSW] WWWWWWWWW', 0.8)).toBe(131);
      expect(textWidth('WWWWWWWWW', 0.8)).toBe(90);
      expect(textWidth('W'.repeat(13), 0.8)).toBe(130);
    });

    it('the cut measured at 0.8 (D:L85570-85571): eleven W (132 at 0.9, 110 at 0.8) whole; twenty cut', () => {
      expect(infoBoxName('W'.repeat(11))).toBe('W'.repeat(11));
      expect(infoBoxName('W'.repeat(20))).toBe(`${'W'.repeat(9)}-`);
    });

    it('drawn centred on x 555 at 0.8: the ink\'s width is the 0.8 travel\'s, its centre on 555 (the frame A_ready091: ink x 535-575)', () => {
      const { rects } = hudLayout(PS2, model({ name: 'WWWWWWWWW' }), N_SIZES, settled);
      const r = rects.name!;
      expect(Math.abs(r.x + r.width / 2 - 555)).toBeLessThan(1.5);
      expect(r.width).toBeLessThan(textWidth('WWWWWWWWW', 0.9));
      // The foot of the cell under the baseline 409, the glyph cell (25 rows at 0.8 x 448/480) above it.
      expect(r.y + r.height).toBeGreaterThan(409);
      expect(r.y + r.height).toBeLessThan(415);
    });
  });

  describe('N3: the spectator panel\'s title "[tag] name" from two characters (FUN_002425e0 D:L90266-90270, 0x3e6e80)', () => {
    const follow = (tag?: string): HudSpectatorView => ({ followed: { name: 'BRAVO', health: null, ...(tag === undefined ? {} : { tag }) }, stats: null });
    it('tag "NSW": "[NSW] BRAVO"; tag "X": "BRAVO"; none or empty: "BRAVO"', () => {
      expect(spectatorInfoText(follow('NSW')).title).toBe('[NSW] BRAVO');
      expect(spectatorInfoText(follow('XY')).title).toBe('[XY] BRAVO');
      expect(spectatorInfoText(follow('X')).title).toBe('BRAVO');
      expect(spectatorInfoText(follow()).title).toBe('BRAVO');
      expect(spectatorInfoText(follow('')).title).toBe('BRAVO');
      expect(spectatorTitleName('NSW', 'BRAVO')).toBe('[NSW] BRAVO');
      expect(spectatorTitleName('X', 'BRAVO')).toBe('BRAVO');
      expect(SPECTATOR_TITLE_TAG_MIN).toBe(2);
    });

    it('the empty name\'s " " stays (D:L90263-90265); the info box keeps "[X] BRAVO", its rule one character (D:L85563)', () => {
      expect(spectatorInfoText({ followed: { name: '', health: null }, stats: null }).title).toBe(' ');
      const infoQuads = (view: HudSpectatorView) => hudLayout(PS2, model({ spectator: view }), N_SIZES, settled).quads.filter((q) => q.element === 'name');
      expect(infoQuads(follow('X'))).toEqual(infoQuads({ followed: { name: '[X] BRAVO', health: null }, stats: null }));
      // The panel's title drawn: the tagged title's glyphs, not the bare name's.
      const title = (view: HudSpectatorView) => hudLayout(PS2, model({ spectator: view }), N_SIZES, settled).quads
        .filter((q) => q.element === 'spectatorInfo' && q.texture === 'font_text_01.tif' && q.y > 410);
      expect(title(follow('NSW'))).toEqual(title({ followed: { name: '[NSW] BRAVO', health: null }, stats: null }));
    });
  });
});

/**
 * NU-9 (c) T3 (research 329 §5 T3, §1.4, §1.6, §1.7): the HUD draws the over-head tags (`Hud.setTeamTags`, laid out by
 * `teamTagLayout`) -- each text in `font_text_01` at 0.9, left at its pen, its baseline at y, white (MP_TEAM_TAG_COLOUR_READING)
 * at its alpha over 128; the holder's arrow and talk icon on the HUD's own list. TEAMMATE NAMES (`setTeammateNames`, read
 * once at the mount), the Chat menu (the command menu, control state 2, D:L56617-56623) and the START menu's hide-all
 * (D:L56341) hide the **texts only**: the sprites are not the part's (D:L77550, D:L77557) and stay over the holder on
 * every path (329 F1, N1). The scoreboard keeps both (D:L56808-56827 does not name the part).
 */
describe('NU-9 (c) T3: the HUD draws the over-head tags (research 329 §5 T3)', () => {
  const T_SIZES = { ...SIZES, 'hud_arrow_off2.tif': { width: 32, height: 32 }, 'action_ok_talk2.tif': { width: 32, height: 32 } };
  const mates: TeamTagsView = { points: [{ id: 2, text: 'BRAVO', alpha: 100, u: 0.5, y: 200 }, { id: 3, text: 'ALPHA', alpha: 50, u: 0.25, y: 300 }], holder: 3, self: 1 };
  const quiet: TeamTagsView = { ...mates, holder: null };
  const drawn = (over: Partial<HudModel>, frame = PS2) => hudLayout(frame, model(over), T_SIZES, AT_REST).quads;
  const of = (quads: HudQuad[], element: string) => quads.filter((q) => q.element === element);
  const glyphs = (quads: HudQuad[]) => quads.filter((q) => q.element === 'teamTags' && q.texture === FONT_TEXT_01.texture);

  it('a tag drawn at its quads: left at its pen, 0.9, white at its alpha over 128, the shadow at min(alpha, 96)', () => {
    const quads = drawn({ teamTags: quiet });
    const ink = glyphs(quads).filter((q) => q.rgba[0] > 0);
    const shadow = glyphs(quads).filter((q) => q.rgba[0] === 0);
    expect(ink.length).toBe('BRAVO'.length + 'ALPHA'.length);
    const laid = teamTagLayout(quiet).tags;
    const first = layoutText('BRAVO', laid[0]!.x, laid[0]!.y, TEAM_TAG_LAYOUT.scale).glyphs[0]!;
    expect(ink[0]!.x - ink[0]!.w / 2).toBeCloseTo(first.x, 9);
    expect(ink[0]!.y - ink[0]!.h / 2).toBeCloseTo(first.y, 9);
    expect(ink[0]!.rgba).toEqual([1, 1, 1, 100 / 128]);
    expect(ink.at(-1)!.rgba).toEqual([1, 1, 1, 50 / 128]);
    expect(shadow[0]!.rgba).toEqual([0, 0, 0, 96 / 128]);
    expect(MP_TEAM_TAG_COLOUR_READING).toEqual([1, 1, 1]);
    expect(of(quads, 'teamTalk')).toEqual([]);                   // no talker, no sprites
  });

  it('the sprites over the holder\'s tag: the arrow flipped (its y0 below its y1), the icon over it, their colours at 64 over 128', () => {
    const talk = of(drawn({ teamTags: mates }), 'teamTalk');
    const [arrow, icon] = teamTagLayout(mates).sprites;
    expect(talk.map((q) => q.texture)).toEqual(['hud_arrow_off2.tif', 'action_ok_talk2.tif']);
    expect([talk[0]!.x - talk[0]!.w / 2, talk[0]!.y - talk[0]!.h / 2, talk[0]!.w, talk[0]!.h]).toEqual([arrow!.x0, arrow!.y1, 32, 32]);
    expect([talk[0]!.v0, talk[0]!.v1]).toEqual([32, 0]);           // flipped: the top row drawn at the bottom
    expect(talk[0]!.rgba).toEqual([40 / 128, 96 / 128, 110 / 128, 64 / 128]);
    expect([talk[1]!.x - talk[1]!.w / 2, talk[1]!.y - talk[1]!.h / 2, talk[1]!.w, talk[1]!.h]).toEqual([icon!.x0, icon!.y0, 32, 32]);
    expect([talk[1]!.v0, talk[1]!.v1]).toEqual([0, 32]);
    expect(talk[1]!.rgba).toEqual([1, 1, 1, 64 / 128]);
  });

  it('TEAMMATE NAMES off (setTeammateNames(false)): no name texts -- a teammate talking in view keeps the two sprites (329 F1)', () => {
    const quads = drawn({ teamTags: mates, teammateNames: false });
    expect(glyphs(quads)).toEqual([]);
    expect(of(quads, 'teamTalk')).toHaveLength(2);
    expect(glyphs(drawn({ teamTags: mates, teammateNames: true })).length).toBeGreaterThan(0);
  });

  it('the Chat menu open (the command menu, D:L56617-56623): the text hidden; a teammate talking in view: the two sprites, no text (329 N1)', () => {
    const quads = drawn({ teamTags: mates, commandMenu: true });
    expect(glyphs(quads)).toEqual([]);
    expect(of(quads, 'teamTalk')).toHaveLength(2);
  });

  it('dead and watching a teammate, another teammate talking in view: the two sprites, the name text as the option says (FUN_001f9f20 D:L57174-57176)', () => {
    const watching: HudSpectatorView = { path: 'teammate', followed: { name: 'ALPHA', health: 1 }, stats: null };
    const on = drawn({ teamTags: mates, spectator: watching });
    expect(of(on, 'teamTalk')).toHaveLength(2);
    expect(glyphs(on).length).toBeGreaterThan(0);
    const off = drawn({ teamTags: mates, spectator: watching, teammateNames: false });
    expect(of(off, 'teamTalk')).toHaveLength(2);
    expect(glyphs(off)).toEqual([]);
    // Dead on his own body: the same.
    expect(of(drawn({ teamTags: mates, spectator: { path: 'own', followed: null, stats: null } }), 'teamTalk')).toHaveLength(2);
  });

  it('the scoreboard up keeps both (D:L56808-56827); the START menu\'s hide-all hides the texts (D:L56341), the sprites kept', () => {
    expect(SCOREBOARD_HIDES.has('teamTags')).toBe(false);
    expect(SCOREBOARD_HIDES.has('teamTalk')).toBe(false);
    const board = hudPass(PS2, model({ teamTags: mates, scoreboard: true }), T_SIZES, AT_REST, false, null, 'ps2').quads;
    expect(glyphs(board).length).toBeGreaterThan(0);
    expect(of(board, 'teamTalk')).toHaveLength(2);
    const menu = hudPass(PS2, model({ teamTags: mates, startMenu: true }), T_SIZES, AT_REST, false, null, 'ps2').quads;
    expect(glyphs(menu)).toEqual([]);
    expect(of(menu, 'teamTalk')).toHaveLength(2);
  });

  it('a round screen replaces them both (ROUND_SCREEN_HIDES); the tactical map hides the texts, the sprites kept (329 §1.7)', () => {
    expect(ROUND_SCREEN_HIDES.has('teamTags')).toBe(true);
    expect(ROUND_SCREEN_HIDES.has('teamTalk')).toBe(true);
    const tac = hudPass(PS2, model({ teamTags: mates }), T_SIZES, AT_REST, true, null, 'ps2').quads;
    expect(glyphs(tac)).toEqual([]);
    expect(of(tac, 'teamTalk')).toHaveLength(2);
  });

  it('a wide native frame: the tags laid on its own width in 448-high units (MP_TEAM_TAG_WIDE_FRAME_ADAPTATION), drawn left-anchored', () => {
    const wide = { width: 1792, height: 896 };                  // 896 units wide at scale 2
    const ink = glyphs(drawn({ teamTags: quiet }, wide)).filter((q) => q.rgba[0] > 0);
    const laid = teamTagLayout(quiet, 896).tags;
    const first = layoutText('BRAVO', laid[0]!.x, laid[0]!.y, TEAM_TAG_LAYOUT.scale).glyphs[0]!;
    expect(ink[0]!.x - ink[0]!.w / 2).toBeCloseTo(first.x * 2, 9);
  });

  it('Hud: setTeamTags copies the view; setTeammateNames and setCommandMenu set the model; a round start clears the tags (FUN_002271d0, FUN_00227240; D:L149757-149758)', () => {
    const hud = new Hud();
    const view: TeamTagsView = { points: [{ id: 2, text: 'BRAVO', alpha: 100, u: 0.5, y: 200 }], holder: 2, self: 1 };
    hud.setTeamTags(view);
    view.points[0]!.text = 'CHANGED';
    expect(hud.state().model.teamTags!.points[0]!.text).toBe('BRAVO');
    hud.setTeammateNames(false);
    hud.setCommandMenu(true);
    expect(hud.state().model).toMatchObject({ teammateNames: false, commandMenu: true });
    hud.startRound({ round: 2, rounds: 11, objective: [] });
    expect(hud.state().model.teamTags).toBeNull();
    expect(hud.state().model.teammateNames).toBe(false);          // read once at the mount: a round start keeps it
    hud.setTeamTags(null);
    expect(hud.state().model.teamTags).toBeNull();
  });

  it('T4: teammateNamesOn() is the one valve the reticle reads too (the part\'s +0x5e4 is the reticle\'s +0x17b64, research 329 §4.3): on by default', () => {
    const hud = new Hud();
    expect(hud.teammateNamesOn()).toBe(true);                     // the golden's DISPLAY_MP_TEAM_NAMES 1
    hud.setTeammateNames(false);
    expect(hud.teammateNamesOn()).toBe(false);
    hud.setTeammateNames(true);
    expect(hud.teammateNamesOn()).toBe(true);
  });

  // LATER 671 (OT.R101; a browser adaptation, `TEAMMATE_NAME_DISTANCE_ADAPTATION`): the view's scale is the draw's.
  it('LATER 671 (a): a view at the original\'s 0.9 (TEAMMATE NAMES "original", or no scale) is drawn at 0.9, as today', () => {
    for (const v of [quiet, { ...quiet, scale: 0.9 }]) {
      const ink = glyphs(drawn({ teamTags: v })).filter((q) => q.rgba[0] > 0);
      const laid = teamTagLayout(v).tags;
      const first = layoutText('BRAVO', laid[0]!.x, laid[0]!.y, 0.9).glyphs[0]!;
      expect([ink[0]!.x - ink[0]!.w / 2, ink[0]!.y - ink[0]!.h / 2, ink[0]!.w]).toEqual([first.x, first.y, first.w]);
    }
  });

  it('LATER 671 (b): the adaptation\'s view is drawn at its scale, below 0.9 -- the glyphs smaller, laid at the same scale\'s width', () => {
    const v: TeamTagsView = { ...quiet, scale: TEAMMATE_NAME_DISTANCE_ADAPTATION.scale };
    const ink = glyphs(drawn({ teamTags: v })).filter((q) => q.rgba[0] > 0);
    const laid = teamTagLayout(v).tags;
    const first = layoutText('BRAVO', laid[0]!.x, laid[0]!.y, TEAMMATE_NAME_DISTANCE_ADAPTATION.scale).glyphs[0]!;
    expect([ink[0]!.x - ink[0]!.w / 2, ink[0]!.y - ink[0]!.h / 2, ink[0]!.w]).toEqual([first.x, first.y, first.w]);
    expect(ink[0]!.w).toBeLessThan(layoutText('BRAVO', 0, 0, 0.9).glyphs[0]!.w);
    expect(laid[0]!.width).toBe(textWidth('BRAVO', TEAMMATE_NAME_DISTANCE_ADAPTATION.scale));
  });

  it('LATER 671: setTeammateNames(on, original) -- the "original" setting is on (the reticle\'s valve) and read back by teammateNamesOriginal()', () => {
    const hud = new Hud();
    expect(hud.teammateNamesOriginal()).toBe(false);               // the adaptation, the default (OT.R101)
    hud.setTeammateNames(true, true);
    expect([hud.teammateNamesOn(), hud.teammateNamesOriginal()]).toEqual([true, true]);
    hud.setTeammateNames(true);
    expect([hud.teammateNamesOn(), hud.teammateNamesOriginal()]).toEqual([true, false]);
    hud.setTeammateNames(false);
    expect([hud.teammateNamesOn(), hud.teammateNamesOriginal()]).toEqual([false, false]);
  });

  it('LATER 671: OPTIONS > TEAMMATE NAMES offers Off, On (the adaptation) and Original over DISPLAY_MP_TEAM_NAMES 0, 1, 2', () => {
    const row = CONTROLS.find((c) => c.id === 'DISPLAY_MP_TEAM_NAMES');
    expect(row).toMatchObject({ kind: 'choice', valve: 'DISPLAY_MP_TEAM_NAMES', group: 'display', label: 'Teammate names' });
    expect((row as ChoiceControl).options).toEqual([
      { value: 0, label: 'Off' }, { value: 1, label: 'On' }, { value: TEAMMATE_NAMES_ORIGINAL_VALUE, label: 'Original' },
    ]);
  });
});


describe('C4 fuse bar placeholder presentation (209 §17)', () => {
  const quads = (m: Partial<HudModel>) => hudPass(PS2, model(m), SIZES, AT_REST, false, null).quads.filter(q => q.element === 'c4FuseBar');
  it('draws the shared box/full and half-width fill, separately from the bomb hold; suppression preserves its model', () => {
    const full = quads({ c4FuseBar: { fill: 1 } });
    expect(full.map(q => q.w)).toEqual([50, 46]);
    expect(full[0]!.rgba).toEqual(HUD_COLOURS.holdBox);
    expect(full[1]!.rgba).toEqual(HUD_COLOURS.holdFill);
    expect(quads({ c4FuseBar: { fill: 0.5 } }).map(q => q.w)).toEqual([50, 23]);
    expect(quads({ c4FuseBar: { fill: 0.5 }, scoreboard: true })).toEqual([]);
    expect(quads({ c4FuseBar: { fill: 0.5 }, spectator: { path: 'spectator', followed: null, stats: null } })).toEqual([]);
    expect(quads({ c4FuseBar: { fill: 0.5 }, holdBar: { fill: 0.25 } })).toEqual([]);
    expect(quads({ c4FuseBar: null })).toEqual([]);
  });
  it('null removes immediately without changing the bomb hold bar or running a second timer', () => {
    const hud = new Hud();
    hud.setHoldBar(0.25);
    hud.setC4FuseBar({ fill: 0.5 });
    hud.step(1);
    expect(hud.state().model.c4FuseBar).toEqual({ fill: 0.5 });
    hud.setC4FuseBar(null);
    expect(hud.state().model.c4FuseBar).toBeNull();
    expect(hud.state().model.holdBar).toEqual({ fill: 0.25 });
    hud.setC4FuseBar({ fill: 1 });
    hud.startRound(DEFAULT_ROUND);
    expect(hud.state().model.c4FuseBar).toBeNull();
  });
});

/**
 * LkPaioX5 part 2 (a) (research 87 §5, "The action list"; reading, pending review -- source inspection, nothing run or
 * captured): `FUN_0021f210` draws the list's head in the middle and list[1] and list[2] beside it -- odd indices right,
 * even left, each 50 + 12 = 62 further out (D:L73987-74000) -- the rest hidden (D:L74028), every one in its own record's
 * colour and the one pulse (D:L74004-74012). The two pairs of words written before each draw are the sprite's alpha step
 * and cap (`FUN_003642d0` D:L261609-261634: alpha + step, held at the cap and at 128): the head 28 a frame to 90
 * (D:L73952-73953), the sides 19 to 28 (D:L74001-74002). A rebuilt list starts each record at 0 (`FUN_002209c0`
 * D:L74589), stepped once the same frame.
 */
describe('LkPaioX5 (a): the action list beside the prompt', () => {
  const SIDE_SIZES = { ...SIZES, 'action_door_open.tif': { width: 64, height: 64 }, 'action_place_c4.tif': { width: 64, height: 64 } };
  it('the fade constants: the head 28 a frame to 90, the sides 19 to 28; the sides 62 out', () => {
    expect(ACTION_ICON_FADE).toEqual({ primary: { step: 28, cap: 90 }, side: { step: 19, cap: 28 } });
    expect(HUD_LAYOUT.action).toEqual({ cx: 306, y: 365, size: 50, gap: 12 });
  });
  it('draws list[1] right and list[2] left of the head, 62 out, in their own colours and the one pulse, at their alphas', () => {
    const m = model({ action: 'climb', actionSides: [{ prompt: 'door', colour: 'green' }, { prompt: 'c4', colour: 'red' }] });
    const at = hudLayout(PS2, m, SIDE_SIZES, { ...AT_REST, pulse: 1 });
    expect(at.rects.action).toEqual({ x: 281, y: 365, width: 50, height: 50 });
    const head = at.quads.find((q) => q.element === 'action')!;
    expect(head.rgba).toEqual([48 / 128, 160 / 128, 48 / 128, 90 / 128]);
    const sides = at.quads.filter((q) => q.element === 'actionSides');
    expect(sides.map((q) => [q.texture, q.x, q.y, q.w, q.h])).toEqual([
      ['action_door_open.tif', 368, 390, 50, 50], ['action_place_c4.tif', 244, 390, 50, 50],
    ]);
    expect(sides[0]!.rgba).toEqual([48 / 128, 160 / 128, 48 / 128, 28 / 128]);
    expect(sides[1]!.rgba).toEqual([200 / 128, 24 / 128, 24 / 128, 28 / 128]);
    const ramp = hudLayout(PS2, m, SIDE_SIZES, { ...AT_REST, actionAlpha: [56 / 128, 19 / 128, 0] });
    expect(ramp.quads.find((q) => q.element === 'action')!.rgba[3]).toBe(56 / 128);
    expect(ramp.quads.filter((q) => q.element === 'actionSides').map((q) => q.rgba[3])).toEqual([19 / 128]);
  });
  it('the sides go where the prompt goes: under the scoreboard, the START menu and a spectator', () => {
    for (const set of [SCOREBOARD_HIDES, SPECTATOR_HIDES, TEAMMATE_HIDES]) expect(set.has('actionSides')).toBe(true);
  });
  it('Hud: a list fed shows its head, list[1] and list[2] beside it, each greyed or not, the rest hidden', () => {
    const hud = new Hud();
    hud.setNearbyAction([{ prompt: 'door', allowed: false }, { prompt: 'c4' }, { prompt: 'lever', allowed: false }, { prompt: 'pickup' }]);
    expect(hud.state().model).toMatchObject({
      action: 'door', actionColour: 'grey', actionSides: [{ prompt: 'c4', colour: 'red' }, { prompt: 'lever', colour: 'grey' }],
    });
    hud.setNearbyAction(null);
    expect(hud.state().model).toMatchObject({ action: null, actionSides: [] });
    hud.setNearbyAction('door');
    expect(hud.state().model).toMatchObject({ action: 'door', actionSides: [] });
  });
  it('Hud: each record ramps from its rebuild -- one step at once, then a step a frame to its cap; a turn keeps them', () => {
    const hud = new Hud();
    hud.setNearbyAction([{ prompt: 'door' }, { prompt: 'c4' }]);
    expect(hud.timing().actionAlpha).toEqual([28 / 128, 19 / 128]);
    hud.step(GAME_FRAME_DT);
    expect(hud.timing().actionAlpha).toEqual([56 / 128, 28 / 128]);
    hud.step(3 * GAME_FRAME_DT);
    expect(hud.timing().actionAlpha).toEqual([90 / 128, 28 / 128]);
    hud.setNearbyAction([{ prompt: 'c4' }, { prompt: 'door' }]);      // the d-pad's turn: the same records, no rebuild
    expect(hud.timing().actionAlpha).toEqual([28 / 128, 28 / 128]);
    hud.step(GAME_FRAME_DT);
    expect(hud.timing().actionAlpha).toEqual([56 / 128, 28 / 128]);   // the head from where it was; the old head held to 28
    hud.setNearbyAction([{ prompt: 'c4' }, { prompt: 'door' }, { prompt: 'lever' }]);   // a record more: rebuilt
    expect(hud.timing().actionAlpha).toEqual([28 / 128, 19 / 128, 19 / 128]);
  });
  // Review fold F2: the sides are the list turned to the head the HUD shows. A bomb carrier at a site with a ledge in
  // reach: the list [bomb, climb], the climb feed's head `climb` -- the bomb beside it, the climb never twice, and the
  // head ramping to its own cap (90), not a side's (28).
  it('Hud: the sides follow the head shown -- the list turned to it, none twice; a head not in the list has none', () => {
    const hud = new Hud();
    hud.setNearbyAction([{ prompt: 'bomb' }, { prompt: 'climb' }]);
    hud.setClimbPrompt({ visible: true, kind: 'low' });
    expect(hud.state().model).toMatchObject({ action: 'climb', actionSides: [{ prompt: 'bomb', colour: 'green' }] });
    hud.step(4 * GAME_FRAME_DT);
    expect(hud.timing().actionAlpha).toEqual([90 / 128, 28 / 128]);
    hud.setNearbyAction([{ prompt: 'door' }, { prompt: 'c4' }, { prompt: 'bomb_drop' }]);   // the climb not in the list
    expect(hud.state().model).toMatchObject({ action: 'climb', actionSides: [] });
    hud.setClimbPrompt(null);
    hud.setAction('c4');                                                                   // a caller's head in the list
    expect(hud.state().model.actionSides).toEqual([{ prompt: 'bomb_drop', colour: 'green' }, { prompt: 'door', colour: 'green' }]);
  });
});

/**
 * LkPaioX5 part 2 (b) (research 87 §5, "The action list"; reading, pending review): the caption under the head,
 * `FUN_00220350` (D:L74385-74496) -- one label for every record, at (306, 435) (`FUN_003631a0` with `DAT_003dc678`,
 * `DAT_003dc67c`). A map action's record (type 13): UNAVAILABLE when the player may not use it (D:L74401-74403), else its
 * own text, not drawn yet (`MAP_ACTION_CAPTION_READING`). The bomb's (type 7): HudCLOC 0xec41 with no bomb node, 0xec40
 * with one (D:L74458-74461), passed with no table lookup. The pick-ups (4, 5): "%s %s" of TAKE and the weapon's name
 * (D:L74471), only while a weapon is the candidate (D:L74470). Every other: the record's own (D:L74479).
 */
describe('LkPaioX5 (b): the caption under the prompt', () => {
  const loc = { '60480': 'BOMB DEFUSAL', '60481': 'DEMOLITION' };
  it('the records\' captions, each the ELF\'s literal at its address (checked on the disc below)', () => {
    expect(ACTION_RECORD_CAPTIONS).toEqual({
      climb: { at: 0x3e4e00, text: 'CLIMB' }, ladder_slide: { at: 0x3e4de8, text: 'LADDER SLIDE' }, action: { at: 0x3e4df8, text: 'ACTION' },
      bomb_drop: { at: 0x3e4e18, text: 'DROP BOMB' }, c4: { at: 0x3e4eb0, text: 'PLACE C4 CHARGE' },
      turret_mount: { at: 0x3e4ec8, text: 'USE TURRET' }, turret_dismount: { at: 0x3e4ee0, text: 'DISMOUNT TURRET' },
      knife: { at: 0x3e4e68, text: 'KNIFE ATTACK' }, restrain: { at: 0x3e4e78, text: 'RESTRAIN' },
      victory: { at: 0x3e4ef0, text: 'VICTORY DANCE' }, pickup: { at: 0x3e4e10, text: 'TAKE' },
      pickup2: { at: 0x3e4e10, text: 'TAKE' },   // LkPaioX5 (c): record 5's +0x90 is the same literal (D:L73651)
    });
    expect(ACTION_CAPTION_TEXT).toEqual({ unavailable: { at: 0x3e4f50, text: 'UNAVAILABLE' }, take: { at: 0x3e4f28, text: '%s %s' }, unknown: { at: 0x3e4b98, text: 'UNKNOWN' } });
    expect(ACTION_BOMB_CAPTION_IDS).toEqual({ bomb: 0xec41, bomb_defuse: 0xec40 });
    expect(VICTORY_CAPTION_READING.text).toBe(ACTION_RECORD_CAPTIONS.victory!.text);
  });
  it('each prompt\'s caption: its record\'s, UNAVAILABLE for a map action not allowed, the bomb\'s from HudCLOC, TAKE and the name', () => {
    expect(actionCaptionOf({ prompt: 'bomb_drop' }, loc)).toBe('DROP BOMB');
    expect(actionCaptionOf({ prompt: 'c4' }, loc)).toBe('PLACE C4 CHARGE');
    expect(actionCaptionOf({ prompt: 'turret_mount' }, loc)).toBe('USE TURRET');
    expect(actionCaptionOf({ prompt: 'victory' }, loc)).toBe('VICTORY DANCE');
    expect(actionCaptionOf({ prompt: 'bomb' }, loc)).toBe('DEMOLITION');
    expect(actionCaptionOf({ prompt: 'bomb_defuse' }, loc)).toBe('BOMB DEFUSAL');
    expect(actionCaptionOf({ prompt: 'bomb' }, null)).toBeNull();                       // no table loaded: none
    expect(actionCaptionOf({ prompt: 'door', allowed: false }, loc)).toBe('UNAVAILABLE');
    expect(actionCaptionOf({ prompt: 'lever', allowed: false }, loc)).toBe('UNAVAILABLE');
    expect(actionCaptionOf({ prompt: 'door' }, loc)).toBeNull();                         // MAP_ACTION_CAPTION_READING
    expect(MAP_ACTION_CAPTION_READING).toMatch(/^not drawn/);
    expect(actionCaptionOf({ prompt: 'pickup', name: 'M4A1' }, loc)).toBe('TAKE M4A1');
    expect(actionCaptionOf({ prompt: 'pickup' }, loc)).toBeNull();                      // no weapon candidate: none
    expect(actionCaptionOf({ prompt: 'escortee', caption: 'FOLLOW!' }, loc)).toBe('FOLLOW!');
    expect(actionCaptionOf({ prompt: 'escortee' }, loc)).toBeNull();
    // A flag-1 caption goes through the tables' message names (`FUN_003631f0` D:L260990-260992 -> `FUN_003a3700` ->
    // `FUN_003a3100`, which asks only a string opening on '_', D:L296945-296949): a hit is replaced, the rest stand.
    expect(actionCaptionOf({ prompt: 'escortee', caption: '_60001_X_MSG' }, { _60001_X_MSG: 'X' })).toBe('X');
    expect(actionCaptionOf({ prompt: 'pickup', name: '_60001_X_MSG' }, { _60001_X_MSG: 'X' })).toBe('TAKE _60001_X_MSG');
    expect(actionCaptionOf({ prompt: 'c4' }, { 'PLACE C4 CHARGE': 'P' })).toBe('PLACE C4 CHARGE');
  });
  it('drawn centred at (306, 435), scale 0.9, grey 128 at alpha 80, on its own element beside the icon', () => {
    const at = hudLayout(PS2, model({ action: 'climb', actionCaption: 'CLIMB' }), SIZES);
    expect(at.rects.action).toEqual({ x: 281, y: 365, width: 50, height: 50 });
    const glyphs = at.quads.filter((q) => q.element === 'actionCaption');
    expect(glyphs.length).toBeGreaterThan(0);
    const ink = glyphs.filter((q) => q.rgba[0] > 0);
    expect(ink[0]!.rgba).toEqual([1, 1, 1, 80 / 128]);
    const r = at.rects.actionCaption!;
    expect(r.x + r.width / 2).toBeCloseTo(306, 0);
    for (const set of [SCOREBOARD_HIDES, SPECTATOR_HIDES, TEAMMATE_HIDES]) expect(set.has('actionCaption')).toBe(true);
    expect(hudLayout(PS2, model({ action: null, actionCaption: 'CLIMB' }), SIZES).quads.filter((q) => q.element === 'actionCaption')).toEqual([]);
  });
  it('Hud: the head\'s caption from the list fed, the climb\'s from its feed, the bomb\'s once the tables are lent', () => {
    const hud = new Hud();
    hud.setNearbyAction([{ prompt: 'pickup', name: 'M4A1' }, { prompt: 'door' }]);
    expect(hud.state().model.actionCaption).toBe('TAKE M4A1');
    hud.setNearbyAction([{ prompt: 'bomb' }]);
    expect(hud.state().model.actionCaption).toBeNull();
    hud.setLocCaptions(loc);
    expect(hud.state().model.actionCaption).toBe('DEMOLITION');
    hud.setNearbyAction(null);
    hud.setClimbPrompt({ visible: true, kind: 'low' });
    expect(hud.state().model.actionCaption).toBe('CLIMB');
    hud.setClimbPrompt(null);
    expect(hud.state().model.actionCaption).toBeNull();
  });
  it('the defuse\'s prompt is the bomb record\'s own icon, green (FUN_002209c0 D:L74585-74586)', () => {
    expect(ACTION_ICONS.bomb_defuse).toBe('action_mp_bomb.tif');
    expect(ACTION_PROMPT_COLOUR.bomb_defuse).toBe('green');
  });
});

const B_DISC = process.env.SOCOM_DISC ?? (process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT, 'game', 'disc') : undefined);
const B_ELF = B_DISC ? resolve(B_DISC, 'socom2_game.elf') : null;
describe.skipIf(!B_ELF || !existsSync(B_ELF))('LkPaioX5 (b) on the disc (SOCOM_DISC): the captions\' literals and HudCLOC\'s bomb texts', () => {
  it('each record\'s caption at its address in the ELF, and each record\'s +0x90 set from it by FUN_0021ded0', async () => {
    const { ElfImage } = await import('../../../tools/elfImage');
    const elf = new ElfImage(new Uint8Array(readFileSync(B_ELF!)));
    for (const c of [...Object.values(ACTION_RECORD_CAPTIONS), ...Object.values(ACTION_CAPTION_TEXT)]) expect(elf.cstr(c!.at), c!.text).toBe(c!.text);
    expect(elf.cstr(0x3e4c70)).toBe('action_MP_bomb.tif');                // record 7's icon (D:L73664's uVar4)
    expect([elf.cstr(0x3e4cd0), elf.cstr(0x3e4cf0)]).toEqual(['action_pickup_item1.tif', 'action_pickup_item2.tif']);
  });
  it('HudCLOC 60480 and 60481', async () => {
    const { FsAssetSource } = await import('@s2u/archive/node');
    const { parseRdr, readZarMembers } = await import('@s2u/archive');
    const { tauntCaptions } = await import('../src/tauntData');
    const b = (await readZarMembers(new FsAssetSource(B_DISC!), 'RUN/READERC.ZAR', ['HudCLOC.rdr'])).get('HudCLOC.rdr')!;
    const c = tauntCaptions(parseRdr(b));
    expect([c[String(ACTION_BOMB_CAPTION_IDS.bomb)], c[String(ACTION_BOMB_CAPTION_IDS.bomb_defuse)]]).toEqual(['DEMOLITION', 'BOMB DEFUSAL']);
  });
});

describe('LkPaioX5 (c): the two TAKE records', () => {
  it('each its own icon (FUN_0021ded0: action_pickup_item1.tif, _item2), green, captioned TAKE and its weapon', () => {
    expect([ACTION_ICONS.pickup, ACTION_ICONS.pickup2]).toEqual(['action_pickup_item1.tif', 'action_pickup_item2.tif']);
    expect([ACTION_PROMPT_COLOUR.pickup, ACTION_PROMPT_COLOUR.pickup2]).toEqual(['green', 'green']);
    expect(actionCaptionOf({ prompt: 'pickup2', name: 'MK23' }, null)).toBe('TAKE MK23');
    const hud = new Hud();
    hud.setNearbyAction([{ prompt: 'pickup', name: 'M4A1' }, { prompt: 'pickup2', name: 'MK23' }]);
    expect(hud.state().model).toMatchObject({ action: 'pickup', actionCaption: 'TAKE M4A1', actionSides: [{ prompt: 'pickup2', colour: 'green' }] });
  });
});

/**
 * CPS (plan 2026-11-02, "the HUD's upload skipped when unchanged"; product track, a same-picture change): a batch's and a
 * shapes layer's attributes are flagged for upload (`needsUpdate`, three's `version`) only when the frame's written
 * vertices differ from what the attribute held; the arrays, the draw range and `visible` stay what the former fill wrote
 * at every frame. The reference below is the former `fill`/`fillShapes` (sampling off), run over the same frames on its
 * own arrays and compared byte for byte.
 */
describe('CPS: the HUD uploads a batch only when its vertices changed', () => {
  type Attr = { array: Float32Array; version: number };
  type Geo = { getAttribute(n: string): Attr; drawRange: { start: number; count: number } };
  type BatchView = { mesh: Mesh; geometry: Geo; capacity: number; size: { width: number; height: number } };
  type ShapesView = { mesh: Mesh; geometry: Geo; capacity: number };
  type Inner = {
    batches: Map<string, BatchView>; shapes: ShapesView[];
    fill(b: BatchView, q: HudQuad[], half: number): void; fillShapes(s: ShapesView, t: HudTri[]): void;
  };
  const px = (): { width: number; height: number; data: Uint8ClampedArray } => ({ width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) });
  const made = (): { hud: Hud; inner: Inner } => {
    const hud = new Hud();
    hud.setBitmaps({ 'newweapnbkrnd.tif': px(), 'm4carbine_icon.tif': px(), 'firemode.tif': px(), 'compass_lo.tif': px(), 'font_text_01.tif': px() });
    return { hud, inner: hud as unknown as Inner };
  };

  /**
   * The former fill's arithmetic on its own arrays (grown as the former `grow`: fresh zeroed arrays), its integer-sampling
   * branch included (`sampling`: the settings the HUD was given, `setExperimentalSampling`).
   */
  class RefBatch {
    capacity: number; pos: Float32Array; tex: Float32Array; col: Float32Array; count = 0; visible = false;
    sampling: UiSamplingSettings = { ...UI_SAMPLING_DEFAULTS };
    constructor(capacity: number, readonly size: { width: number; height: number }) {
      this.capacity = capacity; this.pos = new Float32Array(capacity * 12); this.tex = new Float32Array(capacity * 8); this.col = new Float32Array(capacity * 16);
    }
    fill(quads: HudQuad[], half: number): void {
      if (quads.length > this.capacity) {
        this.capacity = Math.max(quads.length, this.capacity * 2);
        this.pos = new Float32Array(this.capacity * 12); this.tex = new Float32Array(this.capacity * 8); this.col = new Float32Array(this.capacity * 16);
      }
      const { width, height } = this.size;
      quads.forEach((q, i) => {
        if (this.sampling.enabled && this.sampling.mode === 'integer' && q.texture !== 'white') {
          const sourceW = Math.abs(q.u1-q.u0), sourceH = Math.abs(q.v1-q.v0);
          const scaleX = Math.abs(q.w)/sourceW, scaleY = Math.abs(q.h)/sourceH;
          if (sourceW > 0 && sourceH > 0 && Math.abs(scaleX-scaleY) <= 1e-6*Math.max(scaleX, scaleY)) {
            const fit = integerFit(sourceW, sourceH, Math.abs(q.w), Math.abs(q.h), this.sampling.snap);
            q = {...q, w: Math.sign(q.w)*fit.width, h: Math.sign(q.h)*fit.height};
          }
        }
        const c = Math.cos(q.turn), sn = Math.sin(q.turn);
        const lx0 = -half * c - half * sn, ly0 = half * sn - half * c;
        const du = (lx0 / q.w) * (q.u1 - q.u0), dv = (ly0 / q.h) * (q.v1 - q.v0);
        const corners: [number, number, number, number][] = [[-0.5, -0.5, q.u0, q.v0], [0.5, -0.5, q.u1, q.v0], [0.5, 0.5, q.u1, q.v1], [-0.5, 0.5, q.u0, q.v1]];
        corners.forEach(([cx, cy, u, v], k) => {
          const n = i * 4 + k, lx = cx * q.w, ly = cy * q.h;
          this.pos.set([q.x + lx * c - ly * sn, q.y + lx * sn + ly * c, 0], n * 3);
          this.tex.set([(u + du) / width, (v + dv) / height], n * 2);
          this.col.set([q.rgba[0], q.rgba[1], q.rgba[2], cx > 0 ? q.alphaRight ?? q.rgba[3] : q.rgba[3]], n * 4);
        });
      });
      this.count = quads.length * 6; this.visible = quads.length > 0;
    }
  }
  class RefShapes {
    capacity: number; pos: Float32Array; col: Float32Array; count = 0; visible = false;
    constructor(capacity: number) { this.capacity = capacity; this.pos = new Float32Array(capacity * 9); this.col = new Float32Array(capacity * 12); }
    fill(tris: HudTri[]): void {
      if (tris.length > this.capacity) {
        this.capacity = Math.max(tris.length, this.capacity * 2);
        this.pos = new Float32Array(this.capacity * 9); this.col = new Float32Array(this.capacity * 12);
      }
      tris.forEach((t, i) => {
        for (let k = 0; k < 3; k++) {
          this.pos.set([t.p[k * 2]!, t.p[k * 2 + 1]!, 0], (i * 3 + k) * 3);
          this.col.set([t.rgba[0], t.rgba[1], t.rgba[2], t.rgba[3]], (i * 3 + k) * 4);
        }
      });
      this.count = tris.length * 3; this.visible = tris.length > 0;
    }
  }
  const versions = (g: Geo, names: string[]): number[] => names.map((n) => g.getAttribute(n).version);
  const bytes = (a: Float32Array): number[] => [...new Uint8Array(a.buffer, a.byteOffset, a.byteLength)];
  const sameBatch = (b: BatchView, r: RefBatch): void => {
    expect(b.capacity).toBe(r.capacity);
    expect(bytes(b.geometry.getAttribute('position').array)).toEqual(bytes(r.pos));
    expect(bytes(b.geometry.getAttribute('uv').array)).toEqual(bytes(r.tex));
    expect(bytes(b.geometry.getAttribute('color').array)).toEqual(bytes(r.col));
    expect(b.geometry.drawRange.count).toBe(r.count);
    expect(b.mesh.visible).toBe(r.visible);
  };
  const sameShapes = (s: ShapesView, r: RefShapes): void => {
    expect(s.capacity).toBe(r.capacity);
    expect(bytes(s.geometry.getAttribute('position').array)).toEqual(bytes(r.pos));
    expect(bytes(s.geometry.getAttribute('color').array)).toEqual(bytes(r.col));
    expect(s.geometry.drawRange.count).toBe(r.count);
    expect(s.mesh.visible).toBe(r.visible);
  };
  const quad = (over: Partial<HudQuad> = {}): HudQuad => ({
    element: 'panel', texture: 'white', x: 100.3, y: 50.7, w: 30, h: -12, turn: 0.4, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [0.5, 0.25, 1, 0.75], ...over,
  });
  const QUAD_ATTRS = ['position', 'uv', 'color'];

  it("a batch: flagged on the first frame and a changed one, not on an identical one; contents always the former fill's", () => {
    const { inner } = made();
    const b = inner.batches.get('0:white')!;
    const ref = new RefBatch(b.capacity, b.size);
    const half = GS_SAMPLE_OFFSET;
    const step = (qs: HudQuad[], flagged: boolean): void => {
      const g0 = b.geometry, v0 = versions(g0, QUAD_ATTRS);
      inner.fill(b, qs, half); ref.fill(qs, half);
      sameBatch(b, ref);
      const before = b.geometry === g0 ? v0 : [0, 0, 0];                            // grown: a fresh geometry, versions from 0
      const after = versions(b.geometry, QUAD_ATTRS);
      if (flagged) for (let i = 0; i < 3; i++) expect(after[i]).toBeGreaterThan(before[i]!);
      else expect(after).toEqual(before);
    };
    const a = [quad(), quad({ x: 200, alphaRight: 0.1 }), quad({ x: 300, y: 10, turn: 0 })];
    step(a, true);                                                                  // the first frame
    step(a.map((q) => ({ ...q, rgba: [...q.rgba] as HudQuad['rgba'] })), false);    // identical content, new objects
    step(a, false);
    step([a[0]!, { ...a[1]!, x: 201 }, a[2]!], true);                               // a moved quad
    step([a[0]!, { ...a[1]!, x: 201 }, a[2]!], false);
    step([a[0]!, { ...a[1]!, x: 201, rgba: [0.5, 0.25, 1, 0.5] }, a[2]!], true);    // a recoloured quad
    step([a[0]!, { ...a[1]!, x: 201, rgba: [0.5, 0.25, 1, 0.5], alphaRight: 0.2 }, a[2]!], true);   // its right alpha
    step([a[0]!], true);                                                            // fewer quads: the range shrinks
    step([a[0]!], false);
    step([], true);                                                                 // none: hidden
    step([], false);
    step([a[0]!], true);                                                            // back: shown, the range grows
    const many = Array.from({ length: 9 }, (_, i) => quad({ x: i * 10, v1: 0.5 }));  // beyond the capacity (4): grown
    step(many, true);
    expect(b.capacity).toBe(9);
    step(many, false);
    step(many.slice(0, 5), true);
  });

  it('a batch under integer sampling (the test room\'s experiment): letterboxed as the former fill, flagged only on a change', () => {
    const { hud, inner } = made();
    const b = inner.batches.get('0:compass_lo.tif')!;                                // a bitmap's batch: the branch skips white
    const ref = new RefBatch(b.capacity, b.size);
    const half = GS_SAMPLE_OFFSET;
    const set = (over: Partial<UiSamplingSettings>): void => {
      const settings = { ...UI_SAMPLING_DEFAULTS, enabled: true, mode: 'integer' as const, ...over };
      hud.setExperimentalSampling(settings); ref.sampling = settings;
    };
    const step = (qs: HudQuad[], flagged: boolean): void => {
      const g0 = b.geometry, v0 = versions(g0, QUAD_ATTRS);
      inner.fill(b, qs, half); ref.fill(qs, half);
      sameBatch(b, ref);
      const before = b.geometry === g0 ? v0 : [0, 0, 0];
      const after = versions(b.geometry, QUAD_ATTRS);
      if (flagged) for (let i = 0; i < 3; i++) expect(after[i]).toBeGreaterThan(before[i]!);
      else expect(after).toEqual(before);
    };
    const bitmap = (over: Partial<HudQuad> = {}): HudQuad => quad({ texture: 'compass_lo.tif', w: 31, h: -31, u0: 0, v0: 0, u1: 2, v1: 2, ...over });
    // Uniform scales (fitted: 15.5 -> 15, and -> 12 at snap 4) and a stretched one (left as laid out).
    const qs = [bitmap(), bitmap({ x: 10, w: 9, h: 9, turn: 0 }), bitmap({ x: 50, w: 31, h: 20 })];
    set({ snap: 1 });
    step(qs, true);
    step(qs.map((q) => ({ ...q })), false);
    set({ snap: 4 });
    step(qs, true);                                                                  // the fit changed: the bytes changed
    step(qs, false);
    set({ enabled: false });
    step(qs, true);                                                                  // sampling off: the layout's sizes
  });

  it('a shapes layer: the same', () => {
    const { inner } = made();
    const s = inner.shapes[0]!;
    const ref = new RefShapes(s.capacity);
    const step = (ts: HudTri[], flagged: boolean): void => {
      const g0 = s.geometry, v0 = versions(g0, ['position', 'color']);
      inner.fillShapes(s, ts); ref.fill(ts);
      sameShapes(s, ref);
      const before = s.geometry === g0 ? v0 : [0, 0];                              // grown: a fresh geometry, versions from 0
      const after = versions(s.geometry, ['position', 'color']);
      if (flagged) for (let i = 0; i < 2; i++) expect(after[i]).toBeGreaterThan(before[i]!);
      else expect(after).toEqual(before);
    };
    const tri = (x: number, rgba: HudTri['rgba'] = [0, 1, 0, 0.5]): HudTri => ({ layer: 0, p: [x, 1.1, x + 5, 2.2, x, 9.3], rgba });
    const t = [tri(1), tri(20), tri(40)];
    step(t, true);
    step(t.map((x) => ({ ...x, p: [...x.p] as HudTri['p'], rgba: [...x.rgba] as HudTri['rgba'] })), false);
    step([t[0]!, tri(21), t[2]!], true);
    step([t[0]!, tri(21, [1, 0, 0, 0.5]), t[2]!], true);
    step([t[0]!, tri(21, [1, 0, 0, 0.5]), t[2]!], false);
    step([t[0]!], true);
    step([], true);
    step([], false);
    const many = Array.from({ length: 70 }, (_, i) => tri(i));                       // beyond the capacity (64): grown
    step(many, true);
    expect(s.capacity).toBe(128);
    step(many, false);
  });

  it('a zero written over a negative zero (and back) is a change: the bytes, not the numbers, are compared', () => {
    const { inner } = made();
    const s = inner.shapes[0]!;
    const ref = new RefShapes(s.capacity);
    const z = (x: number): HudTri => ({ layer: 0, p: [x, 1, 2, 3, 4, 5], rgba: [1, 1, 1, 1] });
    for (const [ts, flagged] of [[[z(-0)], true], [[z(0)], true], [[z(0)], false], [[z(-0)], true]] as [HudTri[], boolean][]) {
      const before = s.geometry.getAttribute('position').version;
      inner.fillShapes(s, ts); ref.fill(ts);
      sameShapes(s, ref);
      expect(s.geometry.getAttribute('position').version > before).toBe(flagged);
    }
  });

  it('a still clock: after two rendered frames, a third identical frame flags no attribute of any batch or shapes layer', () => {
    const now = 5000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const frame = { autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: () => {} };
    const { hud, inner } = made();
    hud.setVisible(true);
    hud.setOverlay(() => ({ quads: [], tris: [{ layer: 1, p: [1, 2, 30, 4, 5, 60], rgba: [1, 1, 1, 1] }] }));
    const all = (): number[] => [
      ...[...inner.batches.values()].flatMap((b) => versions(b.geometry, QUAD_ATTRS)),
      ...inner.shapes.flatMap((s) => versions(s.geometry, ['position', 'color'])),
    ];
    hud.render(frame);
    hud.render(frame);                                    // the clock still: the frame's quads equal the last's
    const once = all();
    expect(once.some((v) => v > 0)).toBe(true);            // the first frames flagged what they drew
    hud.render(frame);
    expect(all()).toEqual(once);
    clock.mockRestore();
  });
});
