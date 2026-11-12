import { UiTextureExperiment } from './experimentalUiTextures';
import { integerFit, type UiSamplingSettings } from './experimentalUiSampling';
import {
  BufferAttribute, BufferGeometry, DataTexture, DoubleSide, LinearFilter, Mesh, OrthographicCamera, RGBAFormat, Scene,
  UnsignedByteType, Vector2,
} from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { texture as textureNode, uv, vec4, vertexColor } from 'three/tsl';
import type { Rgba } from '@s2u/gs';
import { GAME_FRAME_DT, segmentHit, type Grid } from '@s2u/scene';
import { HUD_LIBRARIES, NOT_ICONS, type HudBitmaps } from './hudAssets';
import { FONT_TEXT_01, layoutText, textWidth } from './hudFont';
import { keepClearNeighbours, messageMeasureScale, messagePanelSpan, wrapMessageLine, type KeepClear } from './hudMessagePanel';
import type { HudRenderer, Rect } from './reticle';
import { DEFAULT_PLAYER, MODERN_SCOREBOARD_LIFT, SCORE_LAYOUT, SCORE_TOP, scoreboardLayout, type GameDetails, type ScoreRowInfo } from './scoreboard';
import type { Presentation } from './renderer';
import { ROUND_SCREEN_BITMAPS, roundScreenLayout, type RoundScreen } from './roundScreens';
import { roundBanner } from './net/rules';
import { BodyFlag } from './net/protocol';
import { tagTalkSprites, VOICE_ICON_RAMP, voiceIconStep, type TagSprite, type VoiceElementView } from './hudVoice';
import type { TeamTagsView } from './hudTags';
import { deadHelpLines, type InputDevice } from './weaponSelect';
import { respawnHelpLines } from './respawnPrompt';
import { botDisplayName, plainBotText, sliceBotText } from './botPresentation';
import {hdTextures} from './hdTexturePack';

/**
 * The in-game HUD (socomlegacy/docs/research/87-hud.md): SOCOM II's own multiplayer HUD drawn over the world in walk mode --
 * the ammo box (panel, "30/30", "2 MAGS", the weapon's icon, the fire-mode rounds), the compass ring turned by the
 * heading, the info box (the health bar, the round timer, the consoles' count), the stance word on a stance change, the
 * context-action icon (the climb icon among them) and the message banner -- out of the game's own bitmaps and font
 * (`./hudAssets`, `./hudFont`), at the places `CHUD`'s code puts them (research 87 §1: the constants read out of
 * the ELF) and the console frames show them (`scripts/parity/refs/console_spawn_slot8.png`; research 87 §2).
 *
 * **Frames and scale** are `./reticle`'s: the layout is in pixels of the PS2's 640x448 frame, y down, which is the
 * HUD's own space -- `CHUD` writes these numbers straight (the ammo box's `-10, 364, 170, 75`). The PS2 presentation
 * draws it one to one; the native one scales it by the canvas height / 448 and anchors each element to the side
 * the console keeps it on (the ammo box left, the compass and the info box right, the prompt and the banner on the
 * centre line), so a wide screen keeps the console's margins. The reticle is `./reticle`'s own pass, drawn before
 * this one; nothing here overlaps it.
 */

const PS2_W = 640, PS2_H = 448;

export type FireMode = 'single' | 'burst' | 'auto';
/**
 * The context prompts `CZActionBitmap` shows (research 87 §5), by the icon each flag selects in `FUN_0021f850`:
 * `climb` (flag `0x4`, `action_climb.tif`) is what the traversal's ledge prompt and a ladder's foot drive;
 * `ladder_slide` is flag `0x10000`'s `action_slide.tif`.
 */
export type ActionPrompt =
  | 'climb' | 'ladder_slide' | 'door' | 'pickup' | 'bomb' | 'bomb_drop' | 'c4' | 'button' | 'lever' | 'turret_mount'
  | 'turret_dismount' | 'knife' | 'restrain' | 'escortee' | 'victory' | 'action' | 'bomb_defuse' | 'pickup2';
/** The traversal workstream's getter (`climbPrompt()`): a ledge in reach, and how high. The icon is the same for all three. */
export interface ClimbPrompt { visible: boolean; kind: 'low' | 'med' | 'high' }
export type HudStance = 'stand' | 'crouch' | 'prone';

/**
 * VICTORY_CAPTION_READING (research 303): the VICTORY DANCE action's caption -- the record's text (`FUN_0021ded0`
 * D:L73781, the string at 0x3e4ef0) drawn by the selected action's label (`FUN_00220350` D:L74387-74490, the record's
 * `+0x90`), at y 435 (`DAT_003dc67c`, read off the executable) and, per Chris's reading of the label's set-up (research
 * 303 s4: `0x0021ee78` scale 0.9, `FUN_003fe5c8` x 306, colour 128 and alpha 80), centred. Reading, pending review: the
 * x, the scale and the colour are the author's alone; settles with a capture of the prompt.
 */
export const VICTORY_CAPTION_READING = { text: 'VICTORY DANCE', x: 306, y: 435, scale: 0.9, rgb: 128, alpha: 80 } as const;

/** Each prompt's bitmap in `HUD_TXR.ZED` (research 87 §5). `action_x.tif` is also the game's fallback icon. */
export const ACTION_ICONS: Record<ActionPrompt, string> = {
  climb: 'action_climb.tif', ladder_slide: 'action_slide.tif', door: 'action_door_open.tif',
  // LkPaioX5 part 2 (c): the two TAKE records' own icons (`FUN_0021ded0`: 0x3e4cd0, 0x3e4cf0; records 4 and 5, D:L73632-73651).
  // (Was: `action_pickup_item.tif`, which no record names.)
  pickup: 'action_pickup_item1.tif', pickup2: 'action_pickup_item2.tif',
  bomb: 'action_mp_bomb.tif', bomb_drop: 'action_drop_mp_bomb.tif', c4: 'action_place_c4.tif',
  button: 'action_button.tif', lever: 'action_pull_lever.tif', turret_mount: 'action_mount_turret.tif',
  turret_dismount: 'action_dismount_turret.tif', knife: 'action_knife.tif', restrain: 'action_restrain.tif',
  escortee: 'action_escortee.tif',                     // HX-4a: FOLLOW! / HOLD POSITION (FUN_0021ded0 D:L73564-73565)
  victory: 'action_victory_dance.tif',
  action: 'action_x.tif',
  // LkPaioX5 part 2 (b): the defuse is the bomb's record (type 7) beside a bomb node, which keeps its own icon
  // (`FUN_002209c0` D:L74585-74586; `action_MP_bomb.tif`, D:L73664). After `bomb`, so `promptOfBitmap` reads it as `bomb`.
  bomb_defuse: 'action_mp_bomb.tif',
};

/**
 * XR-04: the prompt an action record's `bitmap` names (`actions.rdr`, lower case) -- `ACTION_ICONS` read backwards:
 * Crossroads' switches' `action_pull_lever.tif` is `lever`. Null for a bitmap the HUD holds no prompt for.
 */
export function promptOfBitmap(bitmap: string): ActionPrompt | null {
  const b = bitmap.toLowerCase();
  for (const [prompt, icon] of Object.entries(ACTION_ICONS) as [ActionPrompt, string][]) if (icon === b) return prompt;
  return null;
}

/**
 * How many `firemode.tif` rounds each mode shows (`FUN_00237b40`): the weapon's fire-mode value 1 shows one, 2
 * three, 3 four. The console frame at spawn shows three: the M4A1 at its mode 2.
 */
export const FIRE_MODE_ROUNDS: Record<FireMode, number> = { single: 1, burst: 3, auto: 4 };

/** One HUD text line: its pen x (or the x it is right-aligned to / centred on), its baseline, its scale. */
interface TextSpot { x: number; y: number; scale: number; align?: 'left' | 'right' | 'centre' }

/**
 * The layout in the frame's pixels (research 87 §1; every number's source is its table): `CHUD`'s constants where the
 * ELF holds them, the console frames' measurements where it does not (marked "measured").
 */
export const HUD_LAYOUT = {
  ammo: {
    /** `newweapnbkrnd.tif` stretched over `DAT_003dcb90..a8`: x -10..160, y 364..439. */
    panel: { x: -10, y: 364, w: 170, h: 75 },
    /** The weapon's HUDW icon, top-left (20, 389), its own size (`FUN_00237fc0`). */
    icon: { x: 20, y: 389 },
    /** `"%d/%d"`: scale 0.9, pen x 15, baseline 382. */
    rounds: { x: 15, y: 382, scale: 0.9 } as TextSpot,
    /** `"%d MAG%c"`: scale 0.9, pen x 95, baseline 382. */
    mags: { x: 95, y: 382, scale: 0.9 } as TextSpot,
    /** `firemode.tif` at x = 15 + 36i, y 422, its own 32x16; the first moved to x 10 (`FUN_00237b40`). */
    rounds4: { xs: [10, 51, 87, 123], y: 422 },
  },
  /** `compass_lo.tif` at 0.75 (96x96) centred on `DAT_003dc508/50c` (565, 90); alpha 100 (`FUN_002126f0`). */
  compass: { cx: 565, cy: 90, size: 96, alpha: 100 / 128 },
  /** The MP info box (`FUN_002388a0`): the health bar at (488, 396) 134x18; the timer and range lines. */
  info: {
    bar: { x: 488, y: 396, w: 134, h: 18 },
    /**
     * NU-9 N2 (research 327 §1.2, §1.3): the name on the bar -- the text's scale `+0x40` = `DAT_003dcc58` 0.8, centred
     * (`+0x69` 1), its pen `DAT_003dcc48/50` = (555, 409) (`FUN_002388a0` D:L85646-85653; again at the round's
     * `FUN_00238710` D:L85612-85619); 555 = 488 + 134 / 2, centred on the bar. The frame `A_ready091` agrees (ink x
     * 535-575, 41 wide: 0.8's travel 43, not 0.9's 49). `infoBoxName`'s cut measures at it (D:L85570-85571). (Was:
     * "measured on the Vigilance frames", (555, 411) at 0.9.)
     */
    name: { x: 555, y: 409, scale: 0.8, align: 'centre' } as TextSpot,
    /** The box under the timer line: measured x 488-622, y 418-438, `newweapnbkrnd.tif` mirrored. */
    box: { x: 488, y: 418, w: 134, h: 20 },
    /** `"%02d:%02d"` at (500, 433), scale 0.9. */
    timer: { x: 500, y: 433, scale: 0.9 } as TextSpot,
    /**
     * HUD-ALIVE B (research 87 §1.12, corrected): the info box's number, `CHUD+0x19cc0`, at (587, 433) (`DAT_003dc3a8/b0`),
     * scale 0.9 (0x3f666666), set up online only (`FUN_001fa360` D:L57455-57471): the connected consoles' count,
     * `infoNumberText`. The element keeps its old name, 'range'. (Was: `"%dm"`, the port's range readout.)
     */
    range: { x: 587, y: 433, scale: 0.9 } as TextSpot,
  },
  /** `PoseBitmap`'s word, multiplayer place: right-aligned to x 480, baseline 431, scale 0.765 (`FUN_00222010`). */
  stance: { x: 480, y: 431, scale: 0.765, align: 'right' } as TextSpot,
  /** `"ZOOM: %2.1fx"` (0x3e3098) at (20, 420), scale 0.9, while the magnification is over 1.01 (`FUN_001f6ce0`). */
  zoom: { x: 20, y: 420, scale: 0.9 } as TextSpot,
  /**
   * The reticle's `"RANGE(m): %.0f"` (0x3e4850; `"RANGE(m): ----"` 0x3e4860 with nothing under it), the HUD's own string
   * (`CHUD_Init` L57319: scale 0.9), placed at (415, 215) in the scope (`DAT_003dc528/530`, `ChangeReticule` L69508).
   */
  scopeRange: { x: 415, y: 215, scale: 0.9 } as TextSpot,
  /** The same line in the binoculars (`ChangeReticule` type 7, L69571: `DAT_003dc538/540`, read off the ELF: 515, 40). */
  binocularsRange: { x: 515, y: 40, scale: 0.9 } as TextSpot,
  /**
   * `CZActionBitmap`: 50x50 centred on x 306, y 365..415 (`DAT_003dc628/630/640`). LkPaioX5 part 2 (a): list[1] and
   * list[2] beside it, each `size + gap` = 62 further out (`DAT_003dc638 + 12.0`, `FUN_0021f210` D:L73989, D:L73995).
   */
  action: { cx: 306, y: 365, size: 50, gap: 12 },
  /**
   * PB-8 (issue #120; research 87 s5, 214 s3): the bomb's hold bar, two untextured widgets of the prompt's
   * (`FUN_0021ded0` D:L73815-73829; `FUN_00364660` D:L261712-261718 takes x0, y0, x1, y1). The box 585-635 x 345-360:
   * `DAT_003dc648/650/658/660`, read off the ELF's data as floats 585, 345, 635, 360 (D:L73817). The fill inset by
   * `DAT_003dc668` (2.0): x from 587 = 585 + 2, y 347-358 = 345 + 2 .. 360 - 2, and 46 px at full = 635 - 587 - 2
   * (`FUN_003fe550` D:L327765-327769); its right edge is `(int)(587 + 46 x t x DAT_003dc670)` with `DAT_003dc670` 0.2
   * and t the hold's seconds (D:L74441-74442), so the drawn width is 46 x the share, truncated.
   */
  holdBar: { box: { x: 585, y: 345, w: 50, h: 15 }, fill: { x: 587, y: 347, w: 46, h: 11 } },
  /**
   * The event banner ("STARTING ROUND 1 OF 11"): measured on the Vigilance frames -- the panel x 147-492, y 0-99, the
   * line centred on x 320 with its ink at y 81-93.
   */
  message: { panel: { x: 147, y: 0, w: 345, h: 99 }, text: { x: 320, y: 93, scale: 0.9, align: 'centre' } as TextSpot },
  /**
   * The event banner's lines (measured on the Vigilance round start, `A_ready022..033`, one frame a second): centred on
   * x 320, the newest line at the bottom, its baseline at 83.4 + 10.6 x its scale (94 for "STARTING ROUND 1 OF 11" at
   * 1.0, 91.5 for "ELIMINATE THE TERRORISTS" at 0.765), each older line 15 above the one under it.
   */
  banner: { x: 320, base: 83.4, perScale: 10.6, pitch: 15 },
  /**
   * MATCH-05 (research 170 §5.2; note 227 §2): the voice element (`FUN_00238f50` D:L85768-85835, `FUN_00238d00`). The
   * channel icon 32x32 at (590, 361) (`DAT_003dcbe0/e8/f0/f8`, `FUN_002393f0` D:L85937); the talk / busy icon at (545,
   * 361) (`DAT_003dcc00/08`, `FUN_00239250` D:L85879); the number centred (HCENTERED, its `+0x69`) on x 589 = 590 - 1,
   * baseline 371 (`DAT_003dcc28`), scale 0.8, on a 16x16 box 582-598 x 359-375 (x 590 - 8, y `DAT_003dcc10`, the sizes
   * `DAT_003dcc18/20`); the speaker's line right-justified (`+0x6a`) to x 622 = 598 + 24 (`DAT_003dcc30/38`), baseline
   * 352 (`DAT_003dcc40`), scale 0.9. The x's that live in the BSS are the static initializer's at 0x3ff680
   * (disassembled: the decompilation has no function there); the box and the "1" are the archived frames' (A_hold01,
   * B_hold01: box 582-598 x 359-375, the digit's ink x 587-590, y 361-370).
   */
  voice: {
    icon: { x: 590, y: 361, w: 32, h: 32 },
    talk: { x: 545, y: 361, w: 32, h: 32 },
    count: { x: 589, y: 371, scale: 0.8, align: 'centre' } as TextSpot,
    countBox: { x: 582, y: 359, w: 16, h: 16 },
    name: { x: 622, y: 352, scale: 0.9, align: 'right' } as TextSpot,
  },
} as const;

/**
 * HUD-ALIVE (OT.R117; **a browser adaptation**, `./hudVoice` `HUD_ALIVE_COUNTS_ADAPTATION`, the owner's words there):
 * where the two alive numbers sit. The original draws no number in the voice element's right corner, so its place is
 * ours: the left number's box (582-598 x 359-375, `HUD_LAYOUT.voice`) mirrored about the channel icon's centre x 606
 * (590 + 32 / 2) -- the box 614-630 x 359-375 -- at scale 0.8 and the left number's text colour. It sits under the
 * speaker's line (baseline 352), clear of it.
 *
 * HUD-ALIVE-BOXES (the owner, 2026-11-11/12, seat 2f, verbatim in `./hudVoice`: "Ensure both are centered in their
 * square, the right one looks uncentered"): each number on its own box by one rule, x = the box's x + 7 and the
 * baseline 372 -- 589 left, 621 right. The rule is the ink's, measured off the disc's `font_text_01.tif` (MP2's
 * HUD2_TXR; `test/hudVoice.test.ts`): a string centred on x (`textWidth`, `layoutText`: the glyphs' `PEN_NUDGE` -0.6,
 * the GS's half-pixel corner sampling `GS_SAMPLE_OFFSET` +0.5) puts its ink 0.4 to 1.1 right of x and, on baseline 372,
 * rows 361.6-372.8 -- so on x = box + 7 the ink of "0".."16" sits -0.6 to +0.1 of the box's centre across and +0.2
 * down, the same in both boxes. Until 2026-11-12 the right number was the left one's x mirrored (2 x 606 - 589 = 623),
 * which mirrors the spot but not the glyphs: its ink sat 1.4 to 2.1 right of its box's centre, and both 0.8 high on
 * baseline 371. Without the alive counts the number is the original's, on `HUD_LAYOUT.voice.count` (589, 371).
 */
export const HUD_ALIVE_RIGHT_LAYOUT_ADAPTATION = {
  count: { x: 621, y: 372, scale: 0.8, align: 'centre' } as TextSpot,
  countBox: { x: 614, y: 359, w: 16, h: 16 },
} as const;
/** HUD-ALIVE-BOXES: the SEALs-alive number on the original's box (`HUD_LAYOUT.voice.countBox`), by the rule above. */
export const HUD_ALIVE_LEFT_LAYOUT_ADAPTATION = {
  count: { x: 589, y: 372, scale: 0.8, align: 'centre' } as TextSpot,
} as const;
/**
 * HUD-ALIVE-BOXES (OT.R117; **a browser adaptation**; the owner, 2026-11-11/12, seat 2f, verbatim in `./hudVoice`):
 * with the alive counts on, the left box in the in-game scoreboard's SEALs bar colour and the right box in its
 * TERRORISTS bar colour, each at the bar's alpha 80 -- `./scoreboard`'s `SCORE_LAYOUT.teams[i].header` (32, 32, 64) and
 * (64, 32, 32) and `SCORE_LAYOUT.header.alpha` (the original's `FUN_00229d00` colours, research 87 §12), reused here by
 * his choice. Converted as the board converts them (`c255`: each channel over 255) and as this HUD's other untextured
 * fills are (`HUD_COLOURS.health`): both reach the screen as the vertex colour over a white texel (`WHITE`, 255 = 1.0),
 * one blend, so the box and the bar are the same colour on screen. Without the alive counts the box is the original's
 * black at alpha 50 (`HUD_COLOURS.voiceBox`).
 */
export const HUD_ALIVE_BOX_COLOURS_ADAPTATION = {
  seal: [...SCORE_LAYOUT.teams[0].header.map((c) => c / 255), SCORE_LAYOUT.header.alpha] as Rgba4,
  terrorist: [...SCORE_LAYOUT.teams[1].header.map((c) => c / 255), SCORE_LAYOUT.header.alpha] as Rgba4,
} as const;

/**
 * KEYBOARD-WHISPER (OT.R48; web research 266 §3.9): the HUD's text line 0x437540, the online round's USB-keyboard line
 * (`./roundTextLine`), as `FUN_002ca100` (D:L169289-169322) sets it up from `CHUD`'s init (`FUN_001fa360` D:L57429-57431):
 * - `box`: the line's untextured backing, `FUN_003646d0(DAT_003de7a8, DAT_003de7b0, DAT_003de7b8, DAT_003de7c0)` -- x0,
 *   y0, x1, y1 (`FUN_003646d0` D:L261746-261766), read off the ELF's data as the floats 25, 338, 615, 360 -- coloured
 *   (0, 0, 0) by `FUN_00364930(0, 0, 0)`;
 * - `text`: the line's text object, made by its vtable's +0x7c (0x3631c0) with the scale 0x3f4ccccd (0.8, in `$f12`) and
 *   the pen `DAT_00441678`, `DAT_00441680` (`$f13`, `$f14`; 0x2ca128, 0x2ca144), in the BSS and written by the static
 *   initializer at 0x400830-0x400868 (disassembled: the decompilation has no function there): `DAT_003de7a8` +
 *   `DAT_003de7e0` = 25 + 3 = 28 and `DAT_003de7c0` - `DAT_003de7d8` = 360 - 6 = 354; the font the HUD's +0x498, the one
 *   the main window takes (`FUN_002b6fc0(0x4366a0, +0x498)`, D:L57423) -- the page's `FONT_TEXT_01`;
 * - `rgb`: the text's colour, written over the text object's default (255, 255, 255) at its +0x48..+0x50 (`FUN_00363e70`)
 *   as the line's +0xec, +0xf0, +0xf4 = 100, 100, 20 (0x42c80000, 0x42c80000, 0x41a00000), on the GS's 128-as-1 scale
 *   the message window's colours take (`./matchMessages` `MESSAGE_COLOURS`);
 * - the fade (`FUN_002c9e90` D:L169201-169254, the line's vtable +0x38): while the line holds text the box's alpha (+0xa0)
 *   rises to `DAT_003de798` 76.8 at `DAT_003de7a0` 200 a second and the text's (+0x13c) to `DAT_003de7c8` 100 at
 *   `DAT_003de7d0` 200; with none both fall at the same rates to 0;
 * - `widthLimit`: `FUN_002c9d90` (D:L169187) appends only while the text's width (+0xe0) is under `DAT_003de7b8` -
 *   `DAT_003de7a8` - `DAT_003de7e0` x 4 = 615 - 25 - 12 = 578.
 * `ROUND_TEXT_LINE_DRAW_READING` (`./roundTextLine`) names what the page chooses in drawing it.
 */
export const TEXT_LINE_LAYOUT = {
  box: { x: 25, y: 338, w: 590, h: 22 },
  text: { x: 28, y: 354, scale: 0.8 },
  rgb: [100, 100, 20] as readonly [number, number, number],
  boxAlpha: 76.8, boxRate: 200, inkAlpha: 100, inkRate: 200,
  widthLimit: 578,
} as const;

/**
 * One line of the event banner: its text, its scale, and its colour when not the window's colour 0 (0..1, the GS's 128 as
 * 1). `post` is the scale the original posts it with (`FUN_002b6530`'s first argument; absent, 0: the window's own), the
 * scale its wrap is measured by (`./hudMessagePanel` `messageMeasureScale`; TAUNT-WRAP, research 87 §14.1).
 */
export interface BannerLine { text: string; scale: number; rgb?: [number, number, number]; opacity?: number; post?: number }

/** A line's lines in the window (TAUNT-WRAP, research 87 §14.1): its pieces, measured at the original's scale. */
function windowLines(l: BannerLine): BannerLine[] {
  return wrapMessageLine(l.text, messageMeasureScale(l.post ?? 0)).map((text) => ({ ...l, text }));
}
/**
 * The window's scale for a posted line: `FUN_002b6530` takes the window's own 0.9 for a scale of 0, else the scale x
 * 1.1429 (the round start's 0.9 posts, measured 1.0 on the frames).
 */
export const MESSAGE_SCALE = 0.9;

/** Keeps the window's newest `MESSAGE_LINES` lines: the oldest messages go first, a message whole or not at all. */
export function capLines(messages: BannerMessage[]): BannerMessage[] {
  let lines = 0;
  const kept: BannerMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    lines += messages[i]!.lines.length;
    if (lines > MESSAGE_LINES) break;
    kept.unshift(messages[i]!);
  }
  return kept;
}

/** One banner message: its lines, and its alpha now (0..1: the fades are the `Hud`'s). */
export interface BannerMessage { lines: BannerLine[]; alpha: number }

/** RGBA 0..1. A textured draw is the GS's MODULATE, the vertex colour's 128 being 1; an untextured one is the colour as is. */
type Rgba4 = [number, number, number, number];
export const HUD_COLOURS = {
  /** `DAT_00408e40..4c`: 128, 128, 128 and alpha 80 -- every HUD string (and `min(80, 0.75 x 128)` for the shadow). */
  text: [1, 1, 1, 80 / 128] as Rgba4,
  shadow: [0, 0, 0, 80 / 128] as Rgba4,
  /** The panels' alpha 76.8 (0.6 of 128). */
  panel: [1, 1, 1, 0.6] as Rgba4,
  icon: [1, 1, 1, 1] as Rgba4,
  /** `CHealthBar`'s fill (0, 128, 64), untextured, at the HUD's alpha 80. */
  health: [0, 128 / 255, 64 / 255, 80 / 128] as Rgba4,
  /** The missing part of the bar (128, 64, 64). */
  healthLost: [128 / 255, 64 / 255, 64 / 255, 80 / 128] as Rgba4,
  /** MATCH-05: the voice number's box, untextured (0, 0, 0) at alpha 50 (`FUN_00238d00` D:L85750-85751). */
  voiceBox: [0, 0, 0, 50 / 128] as Rgba4,
  /** MATCH-05: the voice number, the HUD's string colour at alpha 128 (`+0x34` 128, D:L85759). */
  voiceCount: [1, 1, 1, 1] as Rgba4,
  /** PB-8: the hold bar's box, untextured black (`FUN_00364930` D:L73816) at alpha 38.4 (`0x4219999a`, D:L74438). */
  holdBox: [0, 0, 0, 38.4 / 128] as Rgba4,
  /**
   * PB-8: the hold bar's fill, untextured (100, 100, 100) (`DAT_003e4ba0..a8` = 100.0, `FUN_003fe550` D:L327785-327787,
   * set at D:L73823) at alpha 100 (`0x42c80000`, D:L74440).
   */
  holdFill: [100 / 255, 100 / 255, 100 / 255, 100 / 128] as Rgba4,
};

/**
 * `CZActionBitmap`'s colour table (`FUN_0021f120` D:L73837-73865): base + pulse x delta, the GS's 128 as 1, indexed
 * 0..3 by a record's `+0xd0` byte (`FUN_0021f210` D:L73956, D:L73961-73964). LkPaioX5 (research 87 §5; reading,
 * pending review): no record's byte names entry 2 (blue) at `FUN_0021ded0`'s init, the only writer
 * (`ACTION_PROMPT_COLOUR`); entry 3 (grey) is taken only by a map action the player may not use (D:L73957-73959).
 * (Was: "Entry 2 (blue) is the allowed action's", unsourced.)
 */
export const ACTION_COLOURS = {
  red: { base: [120, 0, 0], delta: [80, 24, 24] },
  green: { base: [24, 80, 24], delta: [24, 80, 24] },
  blue: { base: [20, 50, 60], delta: [35, 80, 80] },
  grey: { base: [42, 42, 42], delta: [8, 8, 8] },
} as const;
/** The pulse ramps 0 to 1 and back at 5 a second (`DAT_0040d750`). */
export const ACTION_PULSE_RATE = 5;
/**
 * LkPaioX5 (research 87 §5; reading, pending review): each prompt's colour entry, its record's `+0xd0` byte as
 * `FUN_0021ded0` sets it at init (written nowhere else) -- green (1) for every record but KNIFE ATTACK (type 10,
 * D:L73693), RESTRAIN (11, D:L73703), RIFLE BUTT (12, D:L73713), SATCHEL (0x11, D:L73743) and PLACE C4 CHARGE (0x12,
 * D:L73734), red (0). The green ones: ACTION (1, D:L73603), CLIMB (2, D:L73613), the pick-ups (4 and 5, D:L73633,
 * D:L73643), DROP BOMB (6, D:L73654), the bomb's PRESS AND HOLD (7, D:L73663), the map's action (13, D:L73723),
 * FOLLOW! / HOLD POSITION (0xe, 0xf, D:L73784, D:L73794), LADDER SLIDE (0x10, D:L73593), the turret's two (0x13, 0x14,
 * D:L73753, D:L73763), VICTORY DANCE (0x15, D:L73774). Two mappings are the port's own, not read from the original
 * (research 87 §5): `door`, `button` and `lever` taken as the type-13 record, a map's `actions.rdr` action (that record
 * takes the action's icon, `FUN_002209c0` D:L74562-74581); `action` taken as the ACTION record's.
 */
export const ACTION_PROMPT_COLOUR: Record<ActionPrompt, Exclude<keyof typeof ACTION_COLOURS, 'blue' | 'grey'>> = {
  climb: 'green', ladder_slide: 'green', door: 'green', pickup: 'green', bomb: 'green', bomb_drop: 'green', c4: 'red',
  button: 'green', lever: 'green', turret_mount: 'green', turret_dismount: 'green', knife: 'red', restrain: 'red',
  escortee: 'green', victory: 'green', action: 'green',
  bomb_defuse: 'green',                                // LkPaioX5 part 2 (b): the bomb's record, type 7 (D:L73663)
  pickup2: 'green',                                    // LkPaioX5 part 2 (c): record 5 (D:L73643)
};
/**
 * The prompts that are a map's action, the type-13 record: the only one `FUN_0021f210` greys, when the player's
 * `+200` word and the action's `+0x30` word share no bit (D:L73957-73959, the side icons' D:L74005-74007; its caption
 * then UNAVAILABLE, `FUN_00220350` D:L74402-74403). What the two words hold is not read; the port's
 * caller says it (`allowed`).
 */
export const MAP_ACTION_PROMPTS: ReadonlySet<ActionPrompt> = new Set<ActionPrompt>(['door', 'button', 'lever']);
/**
 * LkPaioX5 part 2 (a) (research 87 §5, "The action list"; reading, pending review -- source inspection, nothing run or
 * captured): each record's sprite alpha, GS units (128 = 1), as `FUN_0021f210` steps it once a frame. Before each draw it
 * writes the sprite's step and cap (`+0x1c`, `+0x20` of the sprite at the record's `+0x10`): the head 28 and 90
 * (D:L73952-73953), list[1] and list[2] 19 and 28 (D:L74001-74002), and `FUN_003642d0` (D:L261609-261634) takes the
 * alpha to alpha + step, held at the cap and at 128 -- so a record above its cap (the old head turned aside) drops to it
 * at once. A record put in the list starts at 0 (`FUN_002209c0` D:L74589, each list rebuild `FUN_0021f850` makes), and
 * the frame that rebuilds it draws it, so it is drawn a step in. (Was: the head drawn at alpha 1, "assumed like the
 * other strings'", §15.) What makes it proven: a capture of a prompt's first frames and of a two-entry list.
 */
export const ACTION_ICON_FADE = { primary: { step: 28, cap: 90 }, side: { step: 19, cap: 28 } } as const;
/**
 * LkPaioX5 part 2 (a): ACTION_ICON_FADE_OUT_READING -- a record that leaves the list keeps its last place and colour and
 * fades at 400 a second (`FUN_002200c0` D:L74312-74382, called each frame after the draw, D:L73399): its visible bit is
 * not cleared (only list[3] on are hidden, D:L74028). The port hides it at once. What makes it proven: a capture of a
 * prompt leaving (a door walked away from).
 */
export const ACTION_ICON_FADE_OUT_READING = 'hidden at once: the 400 a second fade-out of a record that left the list is not drawn';
/**
 * LkPaioX5 part 2: one entry of the action list the HUD is fed (`Hud.setNearbyAction`, `HudSources.nearby`), the picker's
 * order, its head first: its prompt and, for a map action's record, whether the player may use it (`allowed`, false
 * greys it: `MAP_ACTION_PROMPTS`).
 */
export interface ActionEntry {
  prompt: ActionPrompt;
  allowed?: boolean;
  /** LkPaioX5 part 2 (b): a TAKE's weapon name (the drop's record's `DisplayName`, `FUN_00220870` D:L74508-74536). */
  name?: string;
  /**
   * LkPaioX5 part 2 (b): a caption its page gives (a hostage's order: `./hostagePage` `ESCORTEE_PROMPTS`; G1, a door's or
   * a switch's record's text: `./matchActions`, `./mapActions` `mapActionCaption`).
   */
  caption?: string;
}
/**
 * LkPaioX5 part 2 (b) (research 87 §5, "The action list"; reading, pending review): each record's caption, its `+0x90`
 * as `FUN_0021ded0` sets it (the ELF's literal at `at`, checked on the disc by `hud.test.ts`), which `FUN_00220350`
 * draws under the head (D:L74479; a pick-up's through "%s %s", D:L74469-74476). The escortee's two (FOLLOW!, HOLD
 * POSITION) come from its page (`ActionEntry.caption`); the bomb's are HudCLOC's (`ACTION_BOMB_CAPTION_IDS`); a map
 * action's record's come with its entry (G1: `ActionEntry.caption`, `./mapActions` `mapActionCaption`).
 */
export const ACTION_RECORD_CAPTIONS: Partial<Record<ActionPrompt, { at: number; text: string }>> = {
  climb: { at: 0x3e4e00, text: 'CLIMB' }, ladder_slide: { at: 0x3e4de8, text: 'LADDER SLIDE' }, action: { at: 0x3e4df8, text: 'ACTION' },
  bomb_drop: { at: 0x3e4e18, text: 'DROP BOMB' }, c4: { at: 0x3e4eb0, text: 'PLACE C4 CHARGE' },
  turret_mount: { at: 0x3e4ec8, text: 'USE TURRET' }, turret_dismount: { at: 0x3e4ee0, text: 'DISMOUNT TURRET' },
  knife: { at: 0x3e4e68, text: 'KNIFE ATTACK' }, restrain: { at: 0x3e4e78, text: 'RESTRAIN' },
  victory: { at: 0x3e4ef0, text: 'VICTORY DANCE' }, pickup: { at: 0x3e4e10, text: 'TAKE' }, pickup2: { at: 0x3e4e10, text: 'TAKE' },
};
/**
 * LkPaioX5 part 2 (b): `FUN_00220350`'s other literals -- UNAVAILABLE for a map action the player may not use
 * (D:L74401-74403), the pick-up's format (D:L74471), and the name a weapon record without one takes (`FUN_00220870`
 * D:L74515-74516, D:L74528-74529).
 */
export const ACTION_CAPTION_TEXT = {
  unavailable: { at: 0x3e4f50, text: 'UNAVAILABLE' }, take: { at: 0x3e4f28, text: '%s %s' }, unknown: { at: 0x3e4b98, text: 'UNKNOWN' },
} as const;
/**
 * LkPaioX5 part 2 (b): the bomb's caption (type 7) is HudCLOC's, by id through `FUN_00361b40`: 0xec40 (60480, BOMB
 * DEFUSAL) while the world bomb's node is set (`DAT_0044d4a0`: on the ground or planted -- the defuse), else 0xec41 (60481,
 * DEMOLITION -- the plant) (D:L74458-74461); drawn with no table lookup (the label's flag 0, D:L74463). Shown outside the
 * hold; through the hold the label is not written again (D:L74427-74443).
 */
export const ACTION_BOMB_CAPTION_IDS = { bomb: 0xec41, bomb_defuse: 0xec40 } as const;
/*
 * LkPaioX5 part 2 (b), G1 of the action-labels review (reading, pending review; was the map-action caption reading, "not
 * drawn"): a map action's record (type 13) the player may use is captioned with the action's own text, which
 * `FUN_002209c0` sets in its `+0x90` (D:L74567-74582) and `FUN_00220350` draws (D:L74420) -- built for a DOOR and a
 * SWITCH (`./mapActions` `mapActionCaption`, carried on the entry by `./matchActions`). Still unported: the other types'
 * texts and UNKNOWN (`MAP_ACTION_CAPTION_OTHER_TYPES_READING`), and the `tcm` action's text at 0x436500 or PLEASE ADD TO
 * MISSION.RDR (D:L74405-74416; the key sets `+0x3f` bit 2, D:L157420-157423).
 */
/**
 * LkPaioX5 part 2 (b): ACTION_CAPTION_EMPTY_READING -- what the label shows once the list is empty: `FUN_0021f210` returns
 * before `FUN_00220350` with no entry (D:L73904-73905) and nothing found hides the label, nor clears it in the pick-ups'
 * branch without a weapon (D:L74469-74476). The port draws no caption with no prompt, or a pick-up with no weapon.
 */
export const ACTION_CAPTION_EMPTY_READING = 'none: no prompt, or a pick-up without a weapon' as const;

/**
 * LkPaioX5 part 2 (b): the caption `FUN_00220350` writes for the list's head (research 87 §5), or null for none. `loc` is
 * HudCLOC's strings by id and by message name (`./tauntData` `tauntCaptions`); a caption written with the label's flag 1
 * is looked up when it opens on '_' (`FUN_003631f0` D:L260990-260992 through `FUN_003a3100`, D:L296945-296949).
 */
export function actionCaptionOf(e: ActionEntry, loc: Readonly<Record<string, string>> | null): string | null {
  const msg = (t: string): string => (t.startsWith('_') ? loc?.[t] ?? t : t);
  const p = e.prompt;
  // A map action: UNAVAILABLE when not allowed (D:L74401-74403), else the caption its entry carries (G1), else none.
  if (MAP_ACTION_PROMPTS.has(p)) return e.allowed === false ? msg(ACTION_CAPTION_TEXT.unavailable.text) : e.caption !== undefined ? msg(e.caption) : null;
  if (p === 'bomb' || p === 'bomb_defuse') return loc?.[String(ACTION_BOMB_CAPTION_IDS[p])] ?? null;
  if (p === 'escortee') return e.caption !== undefined ? msg(e.caption) : null;
  const own = ACTION_RECORD_CAPTIONS[p];
  if (!own) return null;
  if (p === 'pickup' || p === 'pickup2') return e.name === undefined ? null : msg(`${own.text} ${e.name}`);
  return msg(own.text);
}
/** What the HUD is fed for the action slot: one prompt (the list's head alone), the picker's list, or none. */
export type ActionFeed = ActionPrompt | readonly ActionEntry[] | null;
/**
 * PB-8: the hold bar off the hold. When the kit's hold flags are not both set, `FUN_00220350` (D:L74444-74457) -- and
 * `FUN_002200c0` with no prompt (D:L74334-74345) -- takes the fill's alpha (`FUN_00364850`, +0x3c; 100 while held)
 * down by `DAT_004a449c` (the frame's dt, 1/60 at its init, D:L304924) x 400, gives the box the same alpha, and hides
 * both below 0 (vtable +0x18, `FUN_00364e50`); the fill keeps its last width. In GS alpha units.
 */
export const HOLD_BAR_FADE = { from: 100, perSecond: 400 } as const;
/**
 * The ammo box's fade (`DAT_003dc380`): hidden for 1 s, then up over 0.5 s. Its counter is zeroed at the HUD's init
 * (`FUN_001fa360` D:L57489; the port's `setBitmaps`) and the tactical map's close (D:L56164), not at a spawn (research
 * 322 R322.8, its F4 correction; was: "The HUD fades in on a spawn"), nor at a round's start (PAR-94d, D6 closed; was:
 * "the port's `startRound` zeroes it too") but a new match's started in place, standing in for the original's reload
 * (PAR-94d F1, `Hud.startRound`).
 */
export const SPAWN_FADE = { hold: 1, ramp: 0.5 } as const;
/** The stance word: alpha 127 on a change, down 64 a second (`FUN_00221d90`). */
export const STANCE_FADE = { start: 127 / 128, perSecond: 64 / 128 } as const;
/**
 * The round's start as the console plays it (research 87 §8): the picture fades up from black over `fader` seconds
 * [fitted on the Vigilance frames: `CFader_FadeIn(0.5)`'s argument unresolved]; the ammo box fades in (`SPAWN_FADE`);
 * the message window (`messages.rdr`, `FUN_002b77a0`) shows "STARTING ROUND 1 OF 11" and 5 s later "OBJECTIVE:" over
 * the side's objective, pushing the first line up; each line fades in at 280 alpha a second (100 / 280 = 0.357 s),
 * starts fading out 7 s (`fadetime`) after it was posted, at the same rate; the panel goes with the last line. The
 * posting times, 0.36 and 5.36 s after the round clock's 06:00, are the Vigilance frames' (A_ready021..034). The
 * objective's lines are the map's own (PF-12: `RoundInfo.objective`, `start`'s MESSAGEs by `player_team`), posted at the
 * script's waits plus `OBJECTIVE_POST_OFFSET_READING` -- Vigilance's WAIT 5 is the frames' 5.36.
 */
export const ROUND_START = {
  fader: 1.5,
  fadeIn: 100 / 280, fadetime: 7, fadeOut: 100 / 280,
  messages: [
    // `FUN_001fb420` L57633-57648: "STARTING ROUND %d OF %d", or "PLAYING TIEBREAKER ROUND" past the round count.
    { at: 0.36, lines: (r: RoundInfo): BannerLine[] => [{ text: roundBanner(r.round, r.rounds), scale: 1 }] },
  ],
} as const;

/**
 * The script's `MESSAGE` reaches the window 0.36 s after the script's wait: the Vigilance frames put the objective at
 * 5.36 s, `start`'s WAIT 5 (research 87 s8), as the round's first line is at 0.36 s; the same offset is taken on every
 * map, Crossroads' WAIT 3 at 3.36 s. [reading: measured on the one map; the controller's ruling PF.R17, 2026-10-04]
 */
export const OBJECTIVE_POST_OFFSET_READING = 0.36;

/**
 * The window's drawn scale of an objective line by its script scale, measured on the Vigilance frames (research 87 s8):
 * "OBJECTIVE:" (0.9) at 1.0, the objective (0.7) at 0.765. Every multiplayer MESSAGE is one of the two (research 192
 * s3.1); another scale is drawn as the script gives it.
 */
const OBJECTIVE_DRAWN_SCALE: ReadonlyMap<number, number> = new Map([[0.9, 1], [0.7, 0.765]]);

/** One line of the side's objective as the map's script posts it (`./roundCues` `ObjectiveLine`, its text read). */
export interface ObjectiveText { text: string; scale: number; waitBefore: number }
/** What the round-start banner says: the round of the game, and the side's objective lines (none: the banner alone). */
export interface RoundInfo { round: number; rounds: number; objective: readonly ObjectiveText[] }
/** The console capture's: round 1 of 11, the SEALs' suppression objective (Vigilance: WAIT 5, mp51LOC 5100/5101). */
export const DEFAULT_ROUND: RoundInfo = {
  round: 1, rounds: 11,
  objective: [{ text: 'OBJECTIVE:', scale: 0.9, waitBefore: 5 }, { text: 'ELIMINATE THE TERRORISTS', scale: 0.7, waitBefore: 0 }],
};

/** The objective's messages: the lines the script posts together (no wait between) one message, at its wait + the offset. */
export function objectivePosts(objective: readonly ObjectiveText[]): { at: number; lines: BannerLine[] }[] {
  const out: { at: number; lines: BannerLine[] }[] = [];
  let t = 0;
  for (const l of objective) {
    // TAUNT-WRAP: a post of `FUN_002b6530` at the script's scale (`FUN_00267760` D:L113376), wrapped as the window does;
    // drawn at the frames' scale (`OBJECTIVE_DRAWN_SCALE`), measured at the code's (`messageMeasureScale`).
    const scale = OBJECTIVE_DRAWN_SCALE.get(l.scale) ?? l.scale;
    const lines = wrapMessageLine(l.text, messageMeasureScale(l.scale)).map((text) => ({ text, scale }));
    if (out.length && l.waitBefore === 0) { out[out.length - 1]!.lines.push(...lines); continue; }
    t += l.waitBefore;
    out.push({ at: t + OBJECTIVE_POST_OFFSET_READING, lines });
  }
  return out;
}

/** The banner's messages and the fader `t` seconds into the round start. */
export function roundStartAt(t: number, round: RoundInfo = DEFAULT_ROUND): { banner: BannerMessage[]; fader: number } {
  const banner: BannerMessage[] = [];
  const posts = [...ROUND_START.messages.map((m) => ({ at: m.at, lines: m.lines(round) })), ...objectivePosts(round.objective)];
  for (const m of posts) {
    const alpha = messageAlpha(t - m.at);
    if (alpha !== null) banner.push({ lines: m.lines, alpha });
  }
  return { banner, fader: Math.max(0, 1 - t / ROUND_START.fader) };
}

/** A message window line's alpha `age` seconds after its posting (`FUN_002b77a0`), or null once it is gone. */
export function messageAlpha(age: number): number | null {
  const R = ROUND_START, life = R.fadetime + R.fadeOut;
  if (age < 0 || age >= life) return null;
  return Math.min(1, age / R.fadeIn, (life - age) / R.fadeOut);
}

/** The message window holds up to 8 lines (`messages.rdr`); a post past that pushes the oldest out. */
export const MESSAGE_LINES = 8;

/**
 * The nav marks' colours: the mark (32, 62, 32) of `FUN_002126f0`'s table (types 14-37), and the pinned mark's
 * arrow as the Vigilance frame shows it (85, 62, 27) [measured: its peak (170, 124, 53) over a white bitmap].
 */
export const NAV_MARK = { rgb: [32, 62, 32] as [number, number, number], arrow: [85, 62, 27] as [number, number, number] };

/**
 * XR-06 (research 214 s3; 87 s1.7, 192 G27): a mark of the round's objective on the compass at a world point (x, z) --
 * the bomb (`ret_bomb.tif`) and the base its carrier's side must reach (`ret_base.tif`), both HUD2 16x16 bitmaps
 * (`FUN_002126f0` D:L68576). `./bombPage` says where (`COMPASS_BASE_MARK_READING`). HX-5 (research 239 s5): a hostage
 * (`ret_hostage.tif`, type 4) and an extraction zone's centre (`ret_extraction.tif`, type 6), `./hostageMarks` -- with
 * `pulse`, drawn at the types 1-13 pulse's alpha (`OBJECTIVE_MARK_PULSE_READING`).
 */
export interface CompassMark {
  /** MATCH-05: `hud_talk.tif`, type 9, the `WhoIsTalking` mark (`./hudVoice` `talkMark`). */
  bitmap: 'ret_bomb.tif' | 'ret_base.tif' | 'ret_hostage.tif' | 'ret_extraction.tif' | 'hud_talk.tif';
  x: number; z: number;
  pulse?: true;
  /**
   * BOMB-MARKS (research 214 s3 "The base mark for both sides"): the base mark's type, which picks its colour
   * (`BASE_MARK_TYPE_RGB_READING`) -- 2 for a viewer on the carrier's side, 3 for any other (`FUN_005bbf10`
   * D:L473696-473699). Absent, the bitmap's own row (`OBJECTIVE_MARK_RGB_READING`).
   */
  type?: 2 | 3;
}

/**
 * BASE_MARK_TYPE_RGB_READING (BOMB-MARKS; research 214 s3, s6): the `ret_base` mark's two types' colours, GS 0-128, from
 * `FUN_002126f0`'s table (floats at `+0xa0` in threes, type 0 first): type 2 (40, 62, 36) green at `+0xb8..+0xc0`
 * (D:L68684-68687), type 3 (62, 37, 36) red at `+0xc4..+0xcc` (D:L68680-68683). `FUN_005bbf10` writes the type into the
 * mark's bits 4-19 (D:L473696-473700). [reading]
 */
export const BASE_MARK_TYPE_RGB_READING: Readonly<Record<2 | 3, readonly [number, number, number]>> = {
  2: [40, 62, 36], 3: [62, 37, 36],
};

/**
 * OBJECTIVE_MARK_RGB_READING: the objective marks' colours, by bitmap. `FUN_002126f0`'s table gives each mark type its own
 * RGB (research 87 s1.7). HX-5 (research 239 s5): the table read at D:L68680-68700 (floats at `+0xa0` in threes, type 0
 * first): type 4 `ret_hostage` (62, 49, 36), type 6 `ret_extraction` (36, 40, 62) -- 190 D's values, re-read 2026-10-06.
 * The bomb's row stays the nav marks' (32, 62, 32) (`NAV_MARK.rgb`) as XR-06 left it, its draw unchanged: settles it a
 * read of its type's row (type 1's (62, 62, 32) by the same table is not adopted without the bomb's type confirmed), or
 * capture B (a frame with the bomb on the compass). BOMB-MARKS: the base's row is type 2's (`BASE_MARK_TYPE_RGB_READING`),
 * a typed mark's `type` choosing between 2 and 3.
 */
export const OBJECTIVE_MARK_RGB_READING: Readonly<Record<CompassMark['bitmap'], readonly [number, number, number]>> = {
  'ret_bomb.tif': NAV_MARK.rgb, 'ret_base.tif': BASE_MARK_TYPE_RGB_READING[2], 'ret_hostage.tif': [62, 49, 36], 'ret_extraction.tif': [36, 40, 62],
  'hud_talk.tif': [32, 62, 62],   // MATCH-05: type 9's row, `+0x10c` (D:L68703-68705; `./hudVoice` VOICE_TALK_MARK_READING)
};

/**
 * OBJECTIVE_MARK_PULSE_READING (HX-5; research 190 D, 87 s1.7): the compass marks of types 1-13 draw at the alpha
 * `DAT_0040c070` (`FUN_00211510` D:L68126-68130; types 0 and 14+ at `DAT_003dc500`, 128), which the compass's update
 * moves by `rate` 250 a second between `min` 64 and `max` 128, turning at each end (D:L68043-68050) -- in GS units of
 * 128. The port pulses only the marks that say `pulse` (the hostage's and the zone's, and BOMB-MARKS' base, types 2-3);
 * the bomb's, drawn by XR-06 at 1, keeps it until its type is read. [reading]
 */
export const OBJECTIVE_MARK_PULSE_READING = { min: 64, max: 128, rate: 250 } as const;

/**
 * EXTRACT_CAPTION_READING (HX-5; research 190 A1, 87 s12): GAME DETAILS names the game type by `FUN_0022be20`'s switch on
 * game `+0x111` (D:L79744-79758): 1 BREACH (0x3e5828), 2 DEMOLITION (0x3e5830), 3 ESCORT (0x3e5840), 4 EXTRACT
 * (0x3e5848), 5 SUPPRESSION (0x3e5850), else "GAMETYPE ERROR02" -- so the four others are their mode's name upper-cased
 * and EXTRACTION's is EXTRACT (`gameCaption`). [reading]
 */
export const EXTRACT_CAPTION_READING = 'EXTRACT';

/** The scoreboard's caption for a mode name (`./mapOrder`'s `mode`): `EXTRACT_CAPTION_READING`, else the name upper-cased. */
export function gameCaption(mode: string): string {
  return mode.toLowerCase() === 'extraction' ? EXTRACT_CAPTION_READING : mode.toUpperCase();
}

/**
 * DEFUSE_TIMER_LAYOUT_READING: while the fuse runs the HUD's timer line shows the fuse's seconds (`"%02d:%02d"`) in the
 * round timer's own place (`HUD_LAYOUT.info.timer`), the round's clock not drawn. Research 192 G27 names a defuse timer
 * among the mode's HUD; where the game draws it is not read, and "MP DEFUSE BOMB" (S:0x3e5ff8) is the tactical command
 * row 0x2e's label (research 197 W2-R-05, D:L83771), not the timer's: no label is drawn. Settles: capture B item 8
 * (research 213 s3: the defuse timer's first frame).
 */
export const DEFUSE_TIMER_LAYOUT_READING = 'round-timer-slot' as const;

/**
 * The compass's marks now: each nav point's bitmap (the name's first letter: `ret_nav_01` is C), its bearing from the view
 * (sin, cos: clockwise from straight ahead) and its distance -- those within 200 units and the nearest -- then every
 * objective mark (`extraMarks`, XR-06), whatever its distance, by the same bearing and distance.
 */
export function compassMarks(model: Pick<HudModel, 'navPoints' | 'position' | 'yaw' | 'extraMarks' | 'hostageMarks' | 'talkMarks'>): { bitmap: string; sin: number; cos: number; distance: number; objective?: true; pulse?: true; type?: 2 | 3 }[] {
  if (!model.position) return [];
  const yaw = (model.yaw * Math.PI) / 180;
  const f = [-Math.sin(yaw), -Math.cos(yaw)], r = [Math.cos(yaw), -Math.sin(yaw)];
  const bearing = (x: number, z: number): { sin: number; cos: number; distance: number } => {
    const dx = x - model.position![0], dz = z - model.position![1];
    const distance = Math.hypot(dx, dz) || 1e-9;
    return { sin: (dx * r[0]! + dz * r[1]!) / distance, cos: (dx * f[0]! + dz * f[1]!) / distance, distance };
  };
  const all = model.navPoints.map((p) => {
    const c = p.name.toUpperCase().charCodeAt(0);
    const bitmap = c >= 67 && c <= 90 ? `ret_nav_${String(c - 66).padStart(2, '0')}.tif` : '';
    return { bitmap, ...bearing(p.x, p.z) };
  }).filter((m) => m.bitmap);
  let nearest = -1;
  all.forEach((m, i) => { if (nearest < 0 || m.distance < all[nearest]!.distance) nearest = i; });
  // HX-5: the hostages' and the zone's after the bomb's, shown whatever the distance online (`FUN_00211510` D:L68148's
  // jump table: types 1-8, 12, 13 always).
  // MATCH-05: the talk mark after them, already cut past 900 units (`./hudVoice` `talkMark`: types 9-11's test).
  const extra = [...model.extraMarks ?? [], ...model.hostageMarks ?? [], ...model.talkMarks ?? []]
    .map((m) => ({ bitmap: m.bitmap, ...bearing(m.x, m.z), objective: true as const, ...(m.pulse ? { pulse: true as const } : {}),
      ...(m.type ? { type: m.type } : {}) }));
  return [...all.filter((m, i) => m.distance < 200 || i === nearest), ...extra];
}

/** User-requested C4 countdown; appearance/priority are unverified against the original (research 209 §17). */
export const C4_FUSE_BAR_PRESENTATION_ADAPTATION = {
  layout: 'holdBar', colours: 'holdBar', priority: 'bomb-hold', removal: 'immediate', visibility: 'holdBar',
} as const;

/**
 * What the scoreboard hides while it is up (L56808-56828): the ammo box, the compass, the prompts, the timer. PAR-48
 * (research 282 §1): also the info box -- the bar, the name on it, its box (D:L56811) -- and the number at (587, 433),
 * the page's range (D:L56826), for every seat; and a spectator's panel (D:L56813) and help lines (D:L56817-56823). AD-7
 * (C87; note 227 §2.8): and the voice element -- D:L56811's call is the info box's `+0x18`, the table 0x405b40 + 0x18 =
 * `FUN_00238420` (read off the ELF), which hides its `+0x390`, the voice element (D:L85523; `FUN_00238f50` D:L85656).
 * (Was: the voice element kept under the board, its hide's reach not read -- note 227 §3's retired row.) SPECTATOR HUD
 * off takes the same set (D:L56808); the START menu's does not (`START_MENU_HIDES`, PAR-97).
 */
export const SCOREBOARD_HIDES: ReadonlySet<HudElement> = new Set<HudElement>(
  ['panel', 'rounds', 'mags', 'icon', 'firemode', 'compass', 'marks', 'action', 'actionSides', 'actionCaption', 'timer',
    // PB-8: the hold bar's two widgets are the prompt's children (`FUN_0021ded0` D:L73819-73829, `FUN_001feae0`),
    // hidden with it (the prompt's hide, D:L56814).
    'holdBar', 'c4FuseBar', // C4_FUSE_BAR_PRESENTATION_ADAPTATION: same visibility group.
    'bar', 'name', 'box', 'range', 'spectatorInfo', 'help',
    'voice']);
/**
 * What a round's end screen hides (research 91 §18 §2.4: it is its own screen, replacing the game): what the scoreboard
 * hides and the rest of the in-round HUD -- all but the fader. It replaces the scoreboard and the tactical map's layer.
 */
export const ROUND_SCREEN_HIDES: ReadonlySet<HudElement> = new Set<HudElement>([
  ...SCOREBOARD_HIDES, 'bar', 'name', 'box', 'range', 'stance', 'banner', 'message', 'marks', 'tacmap', 'zoom', 'scopeRange', 'scoreboard',
  'voice',   // MATCH-05: no voice widget on the round or final screens (research 170 §5.2)
  // NU-9 (c): the over-head tags and their sprites, the in-round HUD's (research 329 §1.1: the round's reset and start
  // clear them, `FUN_002271d0`, `FUN_00227240`; `Hud.startRound`).
  'teamTags', 'teamTalk',
]);

/**
 * MATCH-01 (research 266 §8.5): what the START menu's open hides -- the hide-all `FUN_001f77c0` (D:L56312-56361, called
 * at the open, `FUN_00204a40` D:L61964), online, after the control state is set to 3 (D:L61963), mapped onto the page's
 * elements as research 282 §1 maps it (`SPECTATOR_HIDES`): the weapon box (D:L56340), the compass and its marks
 * (`FUN_00212260`, D:L56359), the prompts and their children (D:L56325), the stance word (D:L56328), the ZOOM line and
 * the scope's range (D:L56338, D:L56326), the spectator's panel (D:L56348) and the main message window (D:L56354). Not
 * hidden online: the info box (its hide is outside state 3, D:L56344-56346) and its child the voice element (`+0x390`,
 * `FUN_00238f50` D:L85656; PAR-97, NU-9's review F3 -- was: `'voice'` in the set, on research 282 §1's old mapping of
 * D:L56341, which hides `+0x17580`, the name tags' part, below), the round timer and the number (offline only,
 * D:L56320-56324). The close's show is `FUN_001f7a90` (D:L56366-56447), at the first
 * closed tick (`FUN_002011f0` D:L60702-60704). START_MENU_HIDES_READING: the hide is held for the menu's whole open --
 * whether a widget's own frame shows it again under the menu is not traced; the hide-all's three unnamed children
 * (D:L56332-56334) and the reticle's root (D:L56327) have no element here.
 */
export const START_MENU_HIDES: ReadonlySet<HudElement> = new Set<HudElement>([
  'panel', 'rounds', 'mags', 'icon', 'firemode', 'compass', 'marks', 'action', 'actionSides', 'actionCaption', 'holdBar', 'c4FuseBar', 'stance', 'zoom', 'scopeRange',
  'spectatorInfo', 'banner', 'message',
  // NU-9 (c): the over-head name texts -- D:L56341 is the hide of `+0x17580`, `CMPTeammateNames` (its vtable at
  // `+0x1758c`; research 329 §1.7); the talk sprites are not the part's and stay (329 N1).
  'teamTags',
]);

/** The words `PoseBitmap` writes. */
export const STANCE_WORDS: Record<HudStance, string> = { stand: 'STAND', crouch: 'CROUCH', prone: 'PRONE' };
/** A plain white texel: the bitmap the untextured draws (the health bar) modulate. */
export const WHITE = 'white';

export type HudElement =
  | 'panel' | 'rounds' | 'mags' | 'icon' | 'firemode' | 'compass' | 'bar' | 'name' | 'box' | 'timer' | 'range'
  | 'stance' | 'action' | 'banner' | 'message' | 'fader' | 'marks' | 'tacmap' | 'zoom' | 'scopeRange' | 'scoreboard'
  | 'roundScreen'
  /** WEAPON EXCHANGE and the dead's prompt (`./weaponSelect`, `./weaponExchange`; research 94 part 2), the overlay's layer 1. */
  | 'weaponSelect' | 'chatMenu'
  /** MATCH-05: the round's voice element (`./hudVoice`). */
  | 'voice'
  /** PB-8: the bomb's hold bar (`HUD_LAYOUT.holdBar`), the prompt's own widgets. */
  | 'holdBar' | 'c4FuseBar'
  /** LkPaioX5 part 2 (a): list[1] and list[2] beside the prompt (`HudModel.actionSides`); (b) the caption under it. */
  | 'actionSides' | 'actionCaption'
  /** PAR-48 (research 282): a spectator's panel `CSpectatorInfo` and its help lines (`Hud.setSpectator`). */
  | 'spectatorInfo' | 'help'
  /** KEYBOARD-WHISPER: the online round's USB-keyboard text line (`TEXT_LINE_LAYOUT`, `Hud.setTextLine`). */
  | 'textLine'
  /** MATCH-01: the in-round START menu (`./startMenu`), the overlay's layer 1. */
  | 'startMenu'
  /**
   * NU-9 (c): the teammates' over-head name texts (`CMPTeammateNames`'s eight, research 329 §1.1), and the talk arrow
   * and icon over the holder's tag -- the HUD's own sprites, not the part's (D:L77550, D:L77557).
   */
  | 'teamTags' | 'teamTalk';

/** One textured quad in frame pixels (y down): its centre, size, turn (radians, clockwise), texels, colour. */
export interface HudQuad {
  element: HudElement;
  texture: string;
  x: number; y: number; w: number; h: number; turn: number;
  u0: number; v0: number; u1: number; v1: number;
  rgba: Rgba4;
  /** Optional right-side vertex opacity, used by the original TCM panel fade. */
  alphaRight?: number;
  /** The pass layer: 0 the in-round HUD, 1 the tactical map over it (its shapes first, then its bitmaps). */
  layer?: number;
}

/** The page's extra layer: asked each frame for its quads and shapes (the tactical map). */
export type HudOverlay = (
  frame: { width: number; height: number }, sizes: Record<string, { width: number; height: number }>,
) => { quads: HudQuad[]; tris: HudTri[] } | null;

/** One untextured triangle in frame pixels (y down), for the tactical map's polygons and lines. */
export interface HudTri { layer: number; p: [number, number, number, number, number, number]; rgba: Rgba4 }

/** Everything the HUD shows; the page writes it through `Hud`'s setters. */
export interface HudModel {
  rounds: number; capacity: number; spare: number; reloading: boolean;
  /**
   * NET-REFILL N4 (research 312 §4.2; `NET_REFILL_MAGS_HIDDEN_READING`, `./net/netRefill` `netMagsHidden`): online the
   * box's MAGS line is hidden for a pistol in the hand, and in a respawn game for any primary class (`FUN_00237760`
   * D:L85181-85192); `%d/%d` unchanged. Absent or false: shown by `spare` as offline.
   */
  magsHidden?: boolean;
  fireMode: FireMode;
  /**
   * A launcher's round mode (web sprint 4 M4, research 94 §C9): the round's own icon (`firemode_203_frag.tif` ...), drawn
   * in the first fire-mode cell with the four `firemode.tif` rounds hidden (`FUN_00237b40` L85254-85300: a mode > 3 hides
   * the four and shows the first with `FUN_005c6530`'s icon). Absent or null: the rounds of `fireMode`.
   */
  fireModeIcon?: string | null;
  /**
   * The fire-mode row at all: false while a throwable, a charge or the Detonator is up -- `FUN_005bc300` refuses the
   * item in the hand's class (grenade 121, explosive 151, gear 190, armour 201, turret 230) and the four cells are hidden
   * (L85207-85219; the capture of 2026-10-05, h00 / h01: a grenade in hand, no rounds). Absent: shown.
   */
  fireModeRow?: boolean;
  /** The weapon's HUDW icon, e.g. `m4carbine_icon.tif`. */
  weaponIcon: string;
  /** The camera's heading in degrees (`fly.pose().yaw`): the ring turns by it, clockwise (research 87 §1.2). */
  yaw: number;
  action: ActionPrompt | null;
  /** The action's colour: `blue` when it can be done, `grey` when not. */
  actionColour: keyof typeof ACTION_COLOURS;
  /**
   * LkPaioX5 part 2 (a): list[1] and list[2], drawn right and left of the head (`FUN_0021f210` D:L73987-74000), each in its
   * own record's colour; empty with no list or one entry.
   */
  actionSides?: readonly { prompt: ActionPrompt; colour: keyof typeof ACTION_COLOURS }[];
  /** LkPaioX5 part 2 (b): the caption under the head (`actionCaptionOf`), or none. */
  actionCaption?: string | null;
  stance: HudStance;
  /**
   * The walker's own name on the health bar (NU-9 N1, research 327 §1.1: `FUN_00238500` D:L85562 writes the viewed actor's
   * `+0x14`, his own while he walks), set once a frame from the page (`ownHudName`, `setPlayerName`); '' with no page.
   * Bare: the scoreboard's single-row fallback reads it as the name column (`boardLayout`; 327 F4). (Was: "the viewer's
   * SEAL has none" -- no page set it.)
   */
  name: string;
  /**
   * NU-9 N1: the walker's own clan tag, his score row's `clan` (research 275 §2.1), kept apart from `name` (327 F4): only
   * the info box formats "[tag] name" (`taggedName`, D:L85563-85567). Absent or '': the name alone.
   */
  tag?: string;
  /** Health, 0..1: the bar's green share. */
  health: number;
  /** The round timer, seconds; static in the viewer (a round's six minutes). */
  timer: number;
  /**
   * The range finder's metres, or null for none (nothing under the reticle within the weapon's range): the scope's and
   * binoculars' `RANGE(m)` line, and the info box's spot only while this browser's range readout is on (`rangeReadout`).
   */
  range: number | null;
  /**
   * HUD-ALIVE B: the info box's number (`infoNumberText`) -- the connected consoles' count (`validClientCount`,
   * `INFO_CLIENT_COUNT_READING`) and whether this page is the session master (`INFO_SESSION_MASTER_READING`); null with no
   * room, the original's offline (the number hidden, `FUN_001fa360` D:L57455-57456).
   */
  infoNumber: { count: number; master: boolean } | null;
  /**
   * HUD-ALIVE C (`./rangeReadout` `RANGE_READOUT_ADAPTATION`, a browser adaptation): this browser's range readout on --
   * the info box's spot shows the range finder's `"<n>m"` in the count's place. Absent or false: the count (the original).
   */
  rangeReadout?: boolean;
  message: string | null;
  /** The event banner's messages, oldest first. */
  banner: BannerMessage[];
  /** The map's nav points (AIMAPS named points of kind 1, world x, z) and the feet: the compass's marks. */
  navPoints: { name: string; x: number; z: number }[];
  position: [number, number] | null;
  /** SELECT (Tab) held in a multiplayer round: the scoreboard (research 87 §12). */
  scoreboard: boolean;
  /** The game the scoreboard's details name: the viewer's is the map, and the map's game type. */
  game: { name: string; type: string };
  /** Every player's row, the spectators and the rounds won (`setScoreRows`); null rows are the single-SEAL layout. */
  scoreRows: { rows: ScoreRowInfo[] | null; spectators: string[]; wins?: { seal: number; terrorist: number } };
  /** BOMB-MARKS (`setBombCarrier`): the bomb carrier's id, his scoreboard row's satchel (`./scoreboard`); absent or null, none. */
  bombCarrier?: number | null;
  /**
   * ONL-19 (research 269 §5.1): GAME DETAILS' source as taken when the board opened (`setScoreboard`), kept until it
   * closes -- `FUN_0022be20` builds the lines on the press only; absent or null, the LAN fill.
   */
  scoreboardDetails?: GameDetails | null;
  /** The spawn's fade from black, 0..1 (1 is black). */
  fader: number;
  /** `FUN_001f6ce0`'s value: 9.0 in the binoculars, the scope's `ZoomMode`; shown over 1.01. */
  zoom: number;
  /** The binoculars are up (view state 4): the RANGE line at their place (`HUD_LAYOUT.binocularsRange`). */
  binoculars?: boolean;
  /** A round's end screen (`setRoundScreen`, research 91 §18), drawn over everything while set; absent or null is none. */
  roundScreen?: RoundScreen | null;
  /** XR-06: the objective's compass marks (`setExtraMarks`: the bomb, the base), drawn by the nav marks' rule. */
  extraMarks?: CompassMark[];
  /** HX-5: the hostages' and the extraction zones' marks (`setHostageMarks`, `./hostageMarks`), after the bomb's. */
  hostageMarks?: CompassMark[];
  /** XR-06: the bomb's fuse, seconds left, in the round timer's place while set (`setDefuseTimer`); absent or null: none. */
  defuseTimer?: number | null;
  /** MATCH-05: the voice element (`setVoice`, `./hudVoice` `HudVoiceElement`); absent or null: not drawn. */
  voice?: VoiceElementView | null;
  /** MATCH-05: the `hud_talk.tif` compass mark (`setTalkMarks`, `./hudVoice` `talkMark`), after the hostages'. */
  talkMarks?: CompassMark[];
  /**
   * PB-8: the bomb's hold bar (`setHoldBar`): `fill`, the fill's share of its 46 px, 0..1; `fade`, absent while a hold
   * plays (the box at 38.4, the fill at 100), else the GS alpha both widgets share as they fade out (`HOLD_BAR_FADE`).
   * Absent or null: not drawn.
   */
  holdBar?: { fill: number; fade?: number } | null;
  /** C4 projectile fuse share; separate from the DEMOLITION hold (research 209 §17). */
  c4FuseBar?: { fill: number } | null;
  /** PAR-48: the seat's view when it is not a walker viewing himself (`Hud.setSpectator`); absent or null: the walker's HUD. */
  spectator?: HudSpectatorView | null;
  /**
   * KEYBOARD-WHISPER (`Hud.setTextLine`, `TEXT_LINE_LAYOUT`): the round's text line -- its text, the box's and the text's
   * alphas (GS units, 0..76.8 and 0..100) as its fade leaves them; absent or null once both have faded out.
   */
  textLine?: { text: string; box: number; ink: number } | null;
  /** OT.R82 (`Hud.setKeepClear`, `./hudMessagePanel`): the page's touch controls over the picture. Absent: none. */
  keepClear?: readonly KeepClear[];
  /** MATCH-01 (`Hud.setStartMenu`): the START menu is up -- `START_MENU_HIDES` not drawn. Absent: closed. */
  startMenu?: boolean;
  /**
   * MATCH-01 (`Hud.setSpectatorHud`): the START menu's SPECTATOR HUD (`DAT_003dc3e0`, 1 in the ELF's data). Off, the
   * frame hides what the scoreboard hides (D:L56808-56827, the same block). Absent: on.
   */
  spectatorHud?: boolean;
  /**
   * NU-9 (c) T3 (`Hud.setTeamTags`, research 329): the over-head tags' points this frame (`./hudTags` `teamTags`), laid
   * out on the frame by `teamTagLayout`; absent or null: none.
   */
  teamTags?: TeamTagsView | null;
  /**
   * NU-9 (c) T4 (`Hud.setTeammateNames`): the TEAMMATE NAMES option as the HUD's set-up read it (`DISPLAY_MP_TEAM_NAMES`
   * into the part's `+0x5e4`, D:L77558-77559, read nowhere else): off, no name texts -- the talk sprites drawn still
   * (the part's show `FUN_00226960` D:L77292-77301 sets or clears only the part's draw bit). Absent: on, the default 1.
   */
  teammateNames?: boolean;
  /**
   * LATER 671 (OT.R101; a browser adaptation): the "original" look of the tags -- SS-2 (H422 answered (a)): this
   * browser's Name tags (`./nameTags`), no longer a card value -- the page's `teamTags` then makes the original's tags
   * (`./hudTags` `TeamTagInput.original`). Absent: the adaptation.
   */
  teammateNamesOriginal?: boolean;
  /**
   * NU-9 (c) T3 (`Hud.setCommandMenu`): the Chat menu is open -- the original's command menu, control state 2
   * (`FUN_00235440`, research 276; *inference*: the port's Chat menu is it) -- which hides the part, the name texts
   * (D:L56617-56623), not the talk sprites (329 N1). Absent: closed.
   */
  commandMenu?: boolean;
}

export const DEFAULT_MODEL: HudModel = {
  rounds: 30, capacity: 30, spare: 2, reloading: false, fireMode: 'burst', weaponIcon: 'm4carbine_icon.tif',
  yaw: 0, action: null, actionColour: 'green', actionSides: [], stance: 'stand', name: '', health: 1, timer: 6 * 60, range: null, infoNumber: null,
  message: null, banner: [], fader: 0, navPoints: [], position: null, scoreboard: false, game: { name: '', type: '' },
  scoreRows: { rows: null, spectators: [] }, zoom: 1,
};

/**
 * The HUD's time-varying alphas, 0..1: the spawn fade, the stance word, the action pulse; HX-5 `marks`, the compass's
 * types 1-13 pulse (`OBJECTIVE_MARK_PULSE_READING`; absent: 1); PAR-48 `help`, a spectator's help lines' share of their
 * alpha 100 (`helpAlpha`; absent: 1); AD-7 `voice`, the voice element's two icon sprites' alphas over 128 -- the channel
 * icon and the talk / busy icon, each its own ramp (`./hudVoice` `VOICE_ICON_RAMP`, stepped by `Hud.step`; absent, a
 * pass outside the HUD's clock: the ramp's end, 64 / 128).
 */
export interface HudTiming {
  fade: number; stance: number; pulse: number; marks?: number; help?: number; voice?: { icon: number; talk: number };
  /**
   * LkPaioX5 part 2 (a): the action list's alphas, 0..1 -- the head, list[1], list[2] (`ACTION_ICON_FADE`, stepped by
   * `Hud.step`); absent, a pass outside the HUD's clock: each slot's cap (90 / 128, 28 / 128).
   */
  actionAlpha?: readonly number[];
}
export const AT_REST: HudTiming = { fade: 1, stance: 0, pulse: 0 };

/**
 * PAR-48 (research 282 §5; the playtest lane's research 276 §7): what `Hud.setSpectator` takes -- the HUD of a seat that
 * is not a walker viewing himself, by the original's dispatch (`FUN_001f7ff0` D:L56564-56600). This shape is the API the
 * pages and the replay's watcher wire; it is kept stable.
 */
export interface HudSpectatorView {
  /**
   * The original's path; absent is 'spectator'.
   * - 'spectator', `FUN_001f9160` (a lobby spectator, the `watch` page, a replay's watcher): the round timer, the viewed
   *   body's info box, the panel `CSpectatorInfo` and the four help lines; the weapon box, the compass and its marks, the
   *   prompts, the stance word and the ZOOM line hidden (the hide-all `FUN_001f77c0`, D:L56312-56361).
   * - 'teammate', `FUN_001f9f20` (a dead player viewing another): as a spectator less the panel, its help lines the
   *   view's `help`; LATER 117: the weapon box's panel and the teammate's held icon (`weaponIcon`), its rounds, MAGS and
   *   fire-mode row hidden (`TEAMMATE_HIDES`; `FUN_00237e50` D:L57180, D:L85367-85371).
   * - 'own', `FUN_001f97b0` (a dead player on his own body): the walker's HUD less the compass and its marks (D:L57115),
   *   with the view's `help`.
   */
  path?: 'spectator' | 'teammate' | 'own';
  /**
   * LATER 118 (research 282 §8): the six help lines a dead player's path writes (`./weaponSelect` `deadHelpLines`: on his
   * own body `FUN_001f97b0` D:L56996-57107, watching `FUN_001f9f20` D:L57149-57173), the `%c` rendered for the page's
   * device; drawn as the spectator's are, on the same clock. RSP-6 adds the respawn path's first line and eligible
   * second line, with four blanks (`./respawnPrompt`, research 351). Unused on 'spectator' (`SPECTATOR_HELP`).
   */
  help?: readonly string[];
  /** RSP-6: the eligible respawn Action line (index 1) reasserts alpha 100 each frame (research 351 §2). */
  respawnReady?: boolean;
  /**
   * LATER 118 (the review's F1): on 'teammate', the watched body is dead -- its room body's Alive flag clear, or gone
   * from the room's list (a leaver's actor killed, `FUN_005477a0(0, ...)` D:L455521, and retired, D:L455525, under
   * `FUN_005998b0`); absent: alive or unknown. The help clock's edge is
   * the camera's (`DAT_00408f08`, last frame's viewed actor alive, D:L56754): a dead watched teammate giving way to the
   * own dead body is no edge (`Hud.setSpectator`).
   */
  watchedDead?: true;
  /**
   * LATER 117 (research 282 §9): on 'teammate', the watched body's held item's weapon-box icon (`BodyState.weapon` through
   * the room's bodies, `./loadout` `itemIcon`): the box's icon `+0x1f0` is the viewed actor's current item's bitmap
   * (`FUN_00237760` D:L85148-85156, D:L85245-85249), redrawn at each cycle (D:L412619, D:L412676) and each change of the
   * viewed kit (`FUN_005c4b10` D:L478913) -- the page takes the snapshot's item each frame (DEAD_WATCH_HELD_ICON_READING).
   * Absent: the panel alone (no item, an unknown one, a body gone, or a page that passes no resolver). Unused elsewhere.
   */
  weaponIcon?: string;
  /**
   * The viewed body: its name on the info box's bar (`FUN_00238500` D:L85558-85576) and the panel's title; its health,
   * 0..1, on the bar (SPECTATOR_FOLLOWED_HEALTH_READING), null when the page does not know it (no bar). null: the free
   * camera or a scenic view, whose info box the page leaves empty (SPECTATOR_OWN_INFO_PLACEHOLDER). Unused on 'own'.
   * `tag` (SPECTATOR-VIEW W4): the body's clan tag, its score row's `clan` (research 275 §2.1), drawn "[tag] name"
   * (`taggedName`); absent or empty, the name alone.
   */
  followed: { name: string; health: number | null; tag?: string } | null;
  /** The panel's title with no body followed: a scenic view's `Desc` (D:L90239-90256); absent or empty: FREE CAMERA. */
  title?: string;
  /**
   * The panel's four values, a followed SEAL's or Terrorist's (match plus round, D:L90308-90325); null hides them (anyone
   * else, free, scenic: D:L90238, D:L90277-90294). `headshots` null: the label drawn, the value empty
   * (SPECTATOR_HEADSHOTS_PLACEHOLDER).
   */
  stats: { kills: number; deaths: number; headshots: number | null; score: number } | null;
  /** The round timer, seconds, for a caller with no `setTimer` feed; absent: the HUD's own timer. */
  roundTimer?: number;
}

/**
 * SPECTATOR_INFO_RGB_PLACEHOLDER (research 282 §2, §6): the panel's title bar and stats panel colours are `.bss`
 * (0x414900-0x414958, D:L90237-90304, D:L90399, D:L90413); the HUD's panel colour stands in. FREE CAMERA's (100, 100,
 * 100) is read (`SPECTATOR_INFO_LAYOUT.freeRgb`).
 */
export const SPECTATOR_INFO_RGB_PLACEHOLDER: readonly [number, number, number] = [HUD_COLOURS.panel[0], HUD_COLOURS.panel[1], HUD_COLOURS.panel[2]];
/** SPECTATOR_INFO_TEXT_RGB_PLACEHOLDER (research 282 §6): the panel's texts take no colour in `FUN_00242bb0`; the HUD's string colour. */
export const SPECTATOR_INFO_TEXT_RGB_PLACEHOLDER: Readonly<Rgba4> = HUD_COLOURS.text;
/** SPECTATOR_INFO_VALUE_Y_PLACEHOLDER (research 282 §2): the values' first baseline is `DAT_00414920` (`.bss`); the labels'. */
export const SPECTATOR_INFO_VALUE_Y_PLACEHOLDER = 346;
/** SPECTATOR_HEADSHOTS_PLACEHOLDER (research 282 §6): the room's score rows carry no headshots; the value is left empty. */
export const SPECTATOR_HEADSHOTS_PLACEHOLDER = null;
/**
 * SPECTATOR_FOLLOWED_HEALTH_READING (LATER 119; research 282 §4, 321 §4.2.1): the info box's bar over the viewed body is
 * its overall health (`FUN_00238500` -> `FUN_00241cc0(+0x20, viewed)` D:L85555-85556, the fill `+0x1044` D:L89957),
 * which a console that does not own the body makes from its six part bytes -- the bytes the room's `health` event
 * carries to the seat's side and the spectators (NU-3c, `TEAM_HEALTH_RECIPIENTS_ADAPTATION`): the page's
 * `NetClient.healthOf`, read each frame (`spectatorHudView`). A spectator's follow shows any seat's, a dead player's
 * watched teammate his own side's; a body the room never sent (an enemy's) and a replay (no `health` in a `.s2r`:
 * `ReplayClient.healthOf`) show no bar. The bar's loss flash and its reset on a change of viewed actor (`FUN_00241cc0`
 * D:L89961-90035) are not drawn, as on the walker's own bar. [reading, pending review -- H242 (1), a capture of a spectator following a
 * wounded player, settles it at proven] (Was a placeholder, null: no bar; research 282 §6.)
 */
export const SPECTATOR_FOLLOWED_HEALTH_READING = "the viewed body's overall health from the room's six part bytes (healthOf)";
/** SPECTATOR_OWN_INFO_PLACEHOLDER (research 282 §4): free and scenic, the spectator's own object's bar and name; none drawn. */
export const SPECTATOR_OWN_INFO_PLACEHOLDER = null;
/** SPECTATOR_HELP_TAIL_PLACEHOLDER (research 282 §3): help lines 5 and 6, shown but never written on this path; none drawn. */
export const SPECTATOR_HELP_TAIL_PLACEHOLDER: readonly string[] = [];
/**
 * DEAD_WATCH_HELD_ICON_READING (research 282 §9, §6): a dead player watching a teammate sees the teammate's held item's
 * icon, which the page takes from the room's snapshot each frame (`BodyState.weapon`). The original redraws it when the
 * viewed kit is marked changed (`FUN_005bc2c0`, D:L56732-56734): at each cycle (D:L412619, D:L412676) and at the kit's own
 * changes (the slot `FUN_005c4b10` D:L478913); whether the receipt of another console's item marks a remote copy's kit
 * is not traced. A dead watched teammate (LATER 69) keeps the room's last held item (`room.ts` `bodyOf`'s
 * `p.held ?? p.loadout[slot]`); whether the death's drop (`FUN_005a0040` D:L458646-458706) empties the slot the box shows
 * is not traced. Settles it: a capture of a dead player watching a living teammate who swaps, then a dead one.
 * (Was: the dead watcher's weapon-box placeholder, the box not drawn -- retired by LATER 117.)
 */
export const DEAD_WATCH_HELD_ICON_READING = "the snapshot's held item, each frame" as const;
/**
 * DEAD_HELP_GHOST_CLOCK_READING (research 282 §8, §6): where a ghost's help clock starts. The original zeroes `+0x1a0e8`
 * at the HUD's init (D:L57498), a round start (D:L57663) and the camera's edge onto the dead local body -- last frame's
 * viewed actor alive (`DAT_00408f08`, D:L56754), this frame's the local one, dead (D:L56631-56645); no write at a ghost's
 * seating was found. The page starts it at the ghost's first dead view (`Hud.setSpectator`: the walker's null or a
 * spectator's view giving way to 'own' or 'teammate'), its nearest moment to a late joiner's HUD init, as research 282 §3
 * does for the spectator's arrival -- a promoted spectator following a living player meets the original's own edge on
 * 'own'. A capture of a late joiner's first seconds settles it.
 */
export const DEAD_HELP_GHOST_CLOCK_READING = 'first dead view' as const;

/**
 * PAR-48: `CSpectatorInfo` (`FUN_00242bb0` D:L90372-90440; research 282 §2), the ELF's words in the 640x448 frame:
 * `newweapnbkrnd.tif` over the title bar (`DAT_003dcf18..38`) and the stats panel (`DAT_003dcf58..78`), each at its
 * alpha; the title at the pen (20, 430), scale 0.9 (`DAT_003dcf40..50`); the labels at (20, 346 + 18i) and the values
 * right-aligned (`+0x6a`, D:L90434) to x 160, scale 0.9 (`DAT_003dcf80..a0`). Left-anchored, as the ammo box is.
 */
export const SPECTATOR_INFO_LAYOUT = {
  title: { x: 10, y: 410, w: 164, h: 28, alpha: 72 },
  titleText: { x: 20, y: 430, scale: 0.9 } as TextSpot,
  stats: { x: 10, y: 326, w: 164, h: 84, alpha: 64 },
  labels: { x: 20, y0: 346, pitch: 18, scale: 0.9 },
  values: { x: 160, y0: SPECTATOR_INFO_VALUE_Y_PLACEHOLDER, pitch: 18, scale: 0.9, align: 'right' as const },
  /** 0x3e6e88, 0x3e6ea0, 0x3e6eb0, 0x3e6ec0. */
  words: ['Kill Count :', 'Deaths :', 'Headshots :', 'Score :'],
  /** 0x3e6ec8, over the bar's (100, 100, 100) (D:L90326-90328). */
  free: 'FREE CAMERA',
  freeRgb: [100, 100, 100],
} as const;

/**
 * PAR-48: a spectator's help lines (research 282 §3): 0x3e30f0..0x3e3180 (D:L56869-56872; 0xa6 the pad's Cross, 0xac its
 * Triangle), centred (`+0x69`, D:L56883) on x 324 at y 380 + 18i (`DAT_003dc3b8/c0/c8`), scale 0.9 and colour (100,
 * 100, 20) (the HUD's init, D:L57298-57303), alpha 100 held to 10 s and faded to 0 by 10.5 s (D:L56541-56562).
 */
export const SPECTATOR_HELP = {
  lines: ['You are a spectator.  Use the directional', 'buttons to cycle through active players',
    'and fixed views.  \u00a6 Use the Free-Motion', 'Camera.  \u00ac Jump to visible players.'],
  x: 324, y0: 380, pitch: 18, scale: 0.9, rgb: [100, 100, 20], alpha: 100, hold: 10, fade: 0.5,
} as const;

/** The help lines' share of their alpha `t` seconds after their clock started (D:L56541-56562): 1 to 10 s, 0 at 10.5 s. */
export function helpAlpha(t: number): number {
  const H = SPECTATOR_HELP;
  return t <= H.hold ? 1 : Math.max(0, 1 - (t - H.hold) / H.fade);
}

/**
 * The panel's words for a view (`FUN_002425e0` D:L90217-90330): the followed body's name (" " without one) over its four
 * rows -- `"%d"` (0x3e6e98) of each value, empty for an unknown one -- or, with none, a scenic view's title or FREE
 * CAMERA over its own colour (`titleRgb`, 0..1 of the GS's 128; null is the panel's colour). No stats: no rows.
 */
export function spectatorInfoText(view: HudSpectatorView): {
  title: string; titleRgb: [number, number, number] | null; rows: { label: string; value: string }[] | null;
} {
  const S = SPECTATOR_INFO_LAYOUT;
  if (!view.followed) {
    if (view.title) return { title: view.title, titleRgb: null, rows: null };
    return { title: S.free, titleRgb: [S.freeRgb[0] / 128, S.freeRgb[1] / 128, S.freeRgb[2] / 128], rows: null };
  }
  const s = view.stats, values = s ? [s.kills, s.deaths, s.headshots, s.score] : null;
  return {
    // NU-9 N3: "[tag] name" from a two-character tag (`spectatorTitleName`); was: the name alone, the tag dropped.
    title: spectatorTitleName(view.followed.tag, view.followed.name || ' '), titleRgb: null,
    rows: values ? S.words.map((label, i) => ({ label, value: values[i] === null || values[i] === undefined ? '' : String(values[i]) })) : null,
  };
}

/**
 * The info box's name cut (`FUN_00238500` D:L85571-85576): wider than the bar's `DAT_003dcc70` (134) less 4, its first
 * nine characters and a "-".
 */
export const INFO_NAME_CUT = { width: 134 - 4, keep: 9 } as const;
export function infoBoxName(name: string): string {
  return textWidth(name, HUD_LAYOUT.info.name.scale) > INFO_NAME_CUT.width ? `${sliceBotText(name, INFO_NAME_CUT.keep)}-` : name;
}

/**
 * SPECTATOR-VIEW W4 (research 314 §5.2, 275 §1.5): a name with its clan tag as `FUN_00238500` writes the info box's --
 * "[%s] %s" (S:0x3e6718) when the tag's length is one or more (`FUN_00199288`, strlen, D:L85563-85567), the name alone
 * with none (no record, D:L85559-85561) or an empty one (D:L85564); the cut (`infoBoxName`, D:L85571-85576) measures
 * the string this gives. The round's speaker line writes the same format off the same lookup (`FUN_00238ac0`
 * D:L85681-85691, `./hudVoice`); NU-3b's name beside the reticle imports this rule.
 */
export function taggedName(tag: string | null | undefined, name: string): string {
  return tag ? `[${plainBotText(tag)}] ${name}` : name;
}

/**
 * NU-9 N3 (research 327 §4.2, §5 N3): `CSpectatorInfo`'s title takes the followed actor's seat's tag only when it is two
 * characters or more (`FUN_002425e0` D:L90266-90270: `FUN_00199288` under 2 copies the name alone, else "[%s] %s"
 * 0x3e6e80) -- one more than the info box's (`taggedName`, D:L85563). The reticle's target name has the same length test
 * (D:L70193-70194; `./reticle` `TARGET_TAG_MIN`, NU-3b's own).
 */
export const SPECTATOR_TITLE_TAG_MIN = 2;
/** NU-9 N3: the spectator panel's title, "[tag] name" for a tag of `SPECTATOR_TITLE_TAG_MIN` characters or more, else the name. */
export function spectatorTitleName(tag: string | null | undefined, name: string): string {
  return taggedName(tag && tag.length >= SPECTATOR_TITLE_TAG_MIN ? tag : null, name);
}

/**
 * NU-9 (c) (research 329 §1.1, §1.3, §1.4): the over-head tags' constants -- the text's scale 0.9 (`+0x58` 0x3f666666,
 * D:L77539), at most eight drawn (D:L77357-77358), the overlap test's padding 10 and its push 5 (D:L77412-77426), the
 * anchor's 3.0 over the head (D:L77383-77384; `./hudTags`).
 */
export const TEAM_TAG_LAYOUT = { scale: 0.9, max: 8, pad: 10, push: 5, raise: 3 } as const;
/**
 * MP_TEAM_TAG_LINE_HEIGHT_READING (research 329 §1.3 step 6, §6): the overlap test's line height is the font's `+0x24`
 * less `+0x20` (D:L77417-77418, D:L77475-77476). The font load `FUN_00359c40` writes `+0x24` from `fonts.rdr`'s `boty`
 * and `+0x20` from its `topy` (D:L255453-255458; the keys' strings 0x3f88c0 "boty", 0x3f88c8 "topy" in the game's ELF):
 * `font_text_01`'s 15 less 0, unscaled (`./hudFont`). (Was 25, the glyph cell, an inference -- NU-9's review, F1.)
 */
export const MP_TEAM_TAG_LINE_HEIGHT_READING = 15;
/**
 * MP_TEAM_TAG_TOP_MARGIN_READING (research 329 §1.3, §6): the bounds' margin is the letterbox's bar height (`+0x1a224`
 * copied each frame, D:L56755), closed every frame in the living player's own view online (`FUN_001fec60` D:L56568);
 * when `FUN_00228ee0` (D:L78450) or `FUN_002ae970` (D:L153314) open the bars online is not read. 0: the port draws no
 * letterbox. Settles: a read of those two callers' online paths.
 */
export const MP_TEAM_TAG_TOP_MARGIN_READING = 0;
/**
 * MP_TEAM_TAG_WIDE_FRAME_ADAPTATION (research 329 §4.2, §6; **a browser adaptation**): the original's bounds (the left
 * edge inside 0..600) and its clamp at 600 are the 640 frame's, 40 short of its right edge; a frame wider than 640 (the
 * native presentation, in its 448-high units) has no original. The same inset from the frame's own right edge: the PS2
 * presentation (640 wide) gets the original's 600 exactly.
 */
export const MP_TEAM_TAG_WIDE_FRAME_ADAPTATION = { rightInset: 40 } as const;
/**
 * MP_TEAM_TAG_COLOUR_READING (research 329 §1.4, §6): the tag's text takes the text object's default colour (255, 255,
 * 255) -- no line of the part writes `+0x48..0x50` (`FUN_00363e70` D:L261473-261475) -- where the HUD's strings are (128,
 * 128, 128); how the font's draw maps 255 against 128 (a GS modulate doubling, clamped) is not read. The default: white at
 * full (the 128-as-1 scale, clamped at 1); the alpha the tag's own (100, or fading) over 128, the drop shadow at
 * min(alpha, 96) (`FUN_003625e0`). Settles: NU9C-1 (a tag's ink against the info box's name on one frame).
 */
export const MP_TEAM_TAG_COLOUR_READING: readonly [number, number, number] = [1, 1, 1];

/** One tag drawn: its text, its pen (left edge) and baseline on the frame (448-high units), its width at the view's scale, its alpha. */
export interface TeamTag { id: number; text: string; x: number; y: number; width: number; alpha: number }

/**
 * NU-9 (c) T1's layout (research 329 §1.3 steps 4-7, §1.6): the points of `./hudTags` `teamTags` on a frame `width`
 * wide (448-high units; 640 the PS2's), in order, until eight are drawn (D:L77357-77358). For each: its width at 0.9
 * (`FUN_00362b70`, D:L77399-77400) and h its half; x the centre (`u` x width), left = x - h; drawn only when 0 < left <
 * right and top < y < 448 - top (strict, D:L77404-77405; right 600 on the 640 frame, `MP_TEAM_TAG_WIDE_FRAME_ADAPTATION`);
 * the pen, as the decompiled text reads (D:L77406-77411): right - h when x is past right, else left when left - h >= 0,
 * else h; then against each tag already drawn this frame, `FUN_00227130` (D:L77463-77483) -- the (int) box (pen - 10,
 * y - 10)..(pen + width + 10, y + line + 10) against that tag's (x, y)..(x + width, y + line) -- on a hit y += 5 and the
 * test starts again (no bound re-tested after); placed at ((int)pen, (int)y) (`FUN_003631a0`, D:L77445). The holder's
 * drawn tag carries the arrow and the talk icon at its projected centre (`./hudVoice` `tagTalkSprites`, D:L77434-77443),
 * each corner (int) as `FUN_00364660` takes it. LATER 671 (`./hudTags` `TEAMMATE_NAME_DISTANCE_ADAPTATION`, a browser
 * adaptation, OT.R101): the width is taken at the view's `scale` (absent, 0.9) -- the one value the bounds, the overlap
 * push and the draw use.
 */
export function teamTagLayout(
  view: TeamTagsView, width = PS2_W, top = MP_TEAM_TAG_TOP_MARGIN_READING,
): { tags: TeamTag[]; sprites: TagSprite[] } {
  const T = TEAM_TAG_LAYOUT, line = MP_TEAM_TAG_LINE_HEIGHT_READING, right = width - MP_TEAM_TAG_WIDE_FRAME_ADAPTATION.rightInset;
  const scale = view.scale ?? T.scale;
  const tags: TeamTag[] = [];
  let sprites: TagSprite[] = [];
  const hit = (x0: number, y0: number, x1: number, y1: number, t: TeamTag): boolean =>
    x0 < Math.trunc(t.x + t.width) && t.x < x1 && y0 < t.y + line && t.y < y1;
  for (const p of view.points) {
    if (tags.length >= T.max) break;
    const w = textWidth(p.text, scale), h = w * 0.5;
    const x = p.u * width, left = x - h;
    let y = p.y;
    if (!(left < right && y < PS2_H - top && 0 < left && top < y)) continue;
    const pen = right < left + h ? right - h : left - h >= 0 ? left : h;
    for (let k = 0; k < tags.length; k++) {
      const box = [Math.trunc(pen - T.pad), Math.trunc(y - T.pad), Math.trunc(pen + w + T.pad), Math.trunc(y + line + T.pad)] as const;
      if (hit(box[0], box[1], box[2], box[3], tags[k]!)) { y += T.push; k = -1; }
    }
    if (view.holder !== null && p.id === view.holder) {
      sprites = tagTalkSprites({ id: p.id, x, y }, view.holder, view.self)
        .map((s) => ({ ...s, x0: Math.trunc(s.x0), y0: Math.trunc(s.y0), x1: Math.trunc(s.x1), y1: Math.trunc(s.y1) }));
    }
    tags.push({ id: p.id, text: p.text, x: Math.trunc(pen), y: Math.trunc(y), width: w, alpha: p.alpha });
  }
  return { tags, sprites };
}

/** What a seat viewing another does not draw (research 282 §1: the hide-all `FUN_001f77c0` D:L56312-56361). */
export const SPECTATOR_HIDES: ReadonlySet<HudElement> = new Set<HudElement>([
  'panel', 'rounds', 'mags', 'icon', 'firemode',   // the weapon box (D:L56340; its show refuses a spectator, D:L85354)
  'compass', 'marks',                               // `FUN_00212260` (D:L56359; D:L68360-68369)
  'action', 'actionSides', 'actionCaption', 'holdBar', 'c4FuseBar',   // the prompts and their children (D:L56325)
  'stance', 'zoom', 'scopeRange',                   // D:L56328, D:L56338; the reticle's root (D:L56327)
  // Not the number at (587, 433), 'range': written online each frame with no seat test (D:L56605-56613), hidden by the
  // hide-all offline only (D:L56320-56324), shown each frame with SPECTATOR HUD on (D:L56803-56806) -- the review's F3,
  // HUD-ALIVE; research 282 §6 (was `SPECTATOR_INFO_NUMBER_PLACEHOLDER`, false: not drawn).
]);
/**
 * LATER 117 (research 282 §9): what a dead player watching a teammate does not draw -- the hide-all's set less the weapon
 * box's panel and icon. The box's show `FUN_00237e50` (D:L57180) shows the panel and its child the icon `+0x1f0`
 * (D:L85358; the panel's draw `FUN_00359520` D:L255103-255109 draws its children), then hides the group `+0x270` when the viewed
 * actor is not the local one (D:L85367-85371): the group's draw `FUN_00364e70` walks its children only while shown (its
 * table at 0x406ef0: +0xc `FUN_00364e70`, +0x18 `FUN_00364e50`, +0x1c `FUN_00364e30`, read off the ELF), so "%d/%d"
 * `+0x288`, "%d MAG%c" `+0x320` and the four fire-mode cells `+0x3c0` are not drawn. A spectator gets no box (D:L85354).
 */
export const TEAMMATE_HIDES: ReadonlySet<HudElement> = new Set<HudElement>([...SPECTATOR_HIDES].filter((e) => e !== 'panel' && e !== 'icon'));
/** A dead player on his own body: the compass's show refuses a dead viewed actor (`FUN_002122a0` D:L68371-68392; D:L57115). */
export const OWN_BODY_HIDES: ReadonlySet<HudElement> = new Set<HudElement>(['compass', 'marks']);

/** What `spectatorHudView` reads of a page's `NetPage` (structural, so `./netPage` is not imported here). */
export interface SpectatorHudSource {
  /**
   * `bodies` (LATER 118 F1): the room's bodies now (`NetClient.bodies`), for the watched teammate's Alive flag; LATER 117:
   * and its held item (`BodyState.weapon`, 255 none) for the box's icon.
   */
  client: {
    role: string; bodies?(): readonly { id: number; flags: number; weapon?: number }[];
    /** LATER 119 (SPECTATOR_FOLLOWED_HEALTH_READING): a seat's health from the room's bytes (`NetClient.healthOf`), null unknown. */
    healthOf?(id: number): number | null;
  };
  /** `benched`: classic's dead and the ghosts until the next round (`SpectatorView.benched`; PAR-48b, research 282 §7). */
  spectator: { mode: string; target: number | null; scenic: number; watching: number | null; benched: boolean };
  /** `clan` (SPECTATOR-VIEW W4): the row's tag, as the room's score rows carry it (`ScoreRow.clan`, research 275 §2.1). */
  rows: readonly { id: number; kills: number; deaths: number; score: number; clan?: string; bot?: true }[];
  nameOf(id: number): string;
  isBot?(id: number): boolean;
  /** PF-31: the map's scenic views, read through the page (`NetPageDeps.scenicViews`, once, in `./matchNet`). */
  scenicViews?(): readonly { name: string }[];
  /** LATER 118: a late joiner's ghost (`NetPage.ghost`, NU-11b H2): the ghost's help lines; absent, the dead's. */
  ghost?(): boolean;
  /** RSP-6: the same current death/eligibility state read by WEAPON EXCHANGE; absent on non-playing stand-ins. */
  prompt?(): { ghost: boolean; sinceDeath: number; respawnReady?: boolean } | null;
}

/**
 * PAR-48: the page's `NetPage` state as `Hud.setSpectator`'s view, once a frame (`./main`, `./matchMount`), by the
 * dispatch (research 282 §1): a spectator (the client's role, once the welcome has flown the walk: `NetPage`'s
 * `spectatorWelcome`) -- the followed player's name (`nameOf`) and its score row's tally, or none in the free camera, a
 * scenic view's name when `views` gives one, else the page's own (`NetPage.scenicViews`, PF-31: once, in `./matchNet`); a benched player watching a teammate -- 'teammate'; a dead player on his own
 * body -- 'own', a ghost too (PAR-48b: benched, its walk dead from its seat, NU-11b F1; the dispatch's not-alive seat, research 282 §7); else
 * null, the walker's HUD. No page: null. LATER 118: a benched seat's 'own' and 'teammate' carry its six help lines
 * (`deadHelpLines`, the ghost's by `page.ghost()`), the `%c` for `device` (the page's prompt device; absent, the pad's).
 * LATER 117: 'teammate' carries the watched body's held item's icon (`weaponIcon`), its item off the room's bodies and
 * named by `icon` (the page's `./loadout` `itemIcon` over its tables); absent `icon`, none.
 */
export function spectatorHudView(
  page: SpectatorHudSource | null, walk: { mode(): string; isDead(): boolean }, views?: () => readonly { name: string }[],
  device: InputDevice = 'pad', icon?: (item: number) => string | null,
): HudSpectatorView | null {
  if (!page) return null;
  const s = page.spectator;
  // W4: the viewed body's tag off its row (the original's slot lookup `FUN_002c3ac0`, D:L85560; research 275 §1.5), none without.
  const tagOf = (id: number): { tag?: string } => { const clan = page.rows.find((r) => r.id === id)?.clan; return clan ? { tag: clan } : {}; };
  if (page.client.role !== 'player') {
    if (walk.mode() === 'walk') return null;
    if (s.mode === 'follow' && s.target !== null) {
      const row = page.rows.find((r) => r.id === s.target);
      return {
        path: 'spectator', followed: { name: botDisplayName(page.nameOf(s.target), page.isBot?.(s.target) ?? row?.bot === true), health: page.client.healthOf?.(s.target) ?? null, ...tagOf(s.target) },
        stats: row ? { kills: row.kills, deaths: row.deaths, headshots: SPECTATOR_HEADSHOTS_PLACEHOLDER, score: row.score } : null,
      };
    }
    const title = s.mode === 'scenic' ? (views ?? page.scenicViews?.bind(page))?.()[s.scenic]?.name : undefined;
    return { path: 'spectator', followed: null, stats: null, ...(title ? { title } : {}) };
  }
  // LATER 118: classic and ghosts keep their existing lines. RSP-6: a respawn dead seat is not benched; its two-line
  // state comes from the same page prompt the menu/touch layer reads. Bindings/device are resolved on every frame.
  const prompt = page.prompt?.();
  const help = (watching: boolean): { help?: readonly string[]; respawnReady?: boolean } =>
    s.benched ? { help: deadHelpLines({ ghost: page.ghost?.() ?? false, watching, device }) }
      : !watching && prompt?.respawnReady !== undefined
        ? { help: respawnHelpLines(device, prompt.respawnReady), respawnReady: prompt.respawnReady } : {};
  if (s.watching !== null) {
    // F1: the watched body dead or gone (LATER 69 keeps a dead teammate watched); a page with no body list says nothing.
    const list = page.client.bodies?.(), id = s.watching;
    const dead = list ? !list.some((b) => b.id === id && (b.flags & BodyFlag.Alive) !== 0) : false;
    // LATER 117: the watched body's held item's icon (`FUN_00237760` D:L85245-85249; DEAD_WATCH_HELD_ICON_READING).
    const held = list?.find((b) => b.id === id)?.weapon;
    const weaponIcon = held !== undefined && icon ? icon(held) : null;
    return {
      path: 'teammate', followed: { name: botDisplayName(page.nameOf(s.watching), page.isBot?.(s.watching) ?? page.rows.find((row) => row.id === s.watching)?.bot === true), health: page.client.healthOf?.(s.watching) ?? null, ...tagOf(s.watching) }, stats: null,
      ...help(true), ...(dead ? { watchedDead: true as const } : {}), ...(weaponIcon ? { weaponIcon } : {}),
    };
  }
  return walk.isDead() || s.benched ? { path: 'own', followed: null, stats: null, ...help(false) } : null;
}

/** What `ownHudName` reads of a page's `NetPage` (structural, as `SpectatorHudSource`). */
export interface OwnNameSource {
  client: { id: number };
  /** The room's score rows; the page's own row's `clan` is its tag (research 275 §2.1). */
  rows: readonly { id: number; clan?: string; bot?: true }[];
  isBot?(id: number): boolean;
  nameOf(id: number): string;
}

/**
 * NU-9 N1 (research 327 §5 N1, §1.1, §3.1): the walker's own name and clan tag for the info box, apart (327 F4) -- the
 * page's own id's name (`NetPage.nameOf`, the welcome's, a rename's on the next frame) and its own score row's `clan`
 * ('' with no row: a late joiner before his first `score`). The info box's draw `FUN_00238500` writes the viewed actor's
 * `+0x14` with its seat's tag (D:L85558-85569), and a walker views his own actor. No page (the free walk of `/testroom`):
 * none. The pages set it once a frame beside `Hud.setSpectator` (`Hud.setPlayerName`).
 */
export function ownHudName(page: OwnNameSource | null): { name: string; tag: string } {
  // Before the welcome the client's id is 0, which no seat has (the server numbers them from 1, `freeId`): none, not
  // `nameOf(0)`'s "Player0" (NU-9's review, F5).
  if (!page || page.client.id === 0) return { name: '', tag: '' };
  const id = page.client.id;
  return { name: botDisplayName(page.nameOf(id), page.isBot?.(id) ?? page.rows.find((row) => row.id === id)?.bot === true), tag: page.rows.find((r) => r.id === id)?.clan ?? '' };
}

/**
 * The ammo box's lines as `CHUD` formats them: `"%d/%d"` and `"%d MAG%c"` ('S' unless one), none with no spare -- nor,
 * NET-REFILL N4, when the network test hides it (`magsHidden`: `FUN_00237760` D:L85192's `cVar3`).
 */
export function ammoLines(m: Pick<HudModel, 'rounds' | 'capacity' | 'spare' | 'magsHidden'>): { rounds: string; mags: string | null } {
  return { rounds: `${m.rounds}/${m.capacity}`, mags: m.spare > 0 && !m.magsHidden ? `${m.spare} MAG${m.spare === 1 ? '' : 'S'}` : null };
}

/**
 * INFO_CLIENT_COUNT_READING (HUD-ALIVE B; research 87 §1.12, research 101): who the info box's number counts. The original
 * counts `FUN_0030d510(0x45a0c0)` = `zNetGetValidGameClientCount` (research 193 §M2): through `FUN_00623090`
 * (D:L532383-532408), the network table's entries whose status byte is 1 (`FUN_00615160` D:L523200-523233) -- the
 * consoles connected to the game, players and spectators alike. The port has no such table at the page; it counts the
 * room's human seats (the score rows less the bots, `ScoreRow.bot`, which are no consoles: the original has no online
 * bots) and the spectators the room names (`Hud.spectatorCount`). [reading, pending review: whether a parked or
 * reconnecting seat (OT.R59, NET-RES.R6) is still a valid client, and a console mid-join, are not traced; the archived
 * frames' 1v1 "2" agrees]
 */
export const INFO_CLIENT_COUNT_READING = 'the human seats among the score rows plus the spectators' as const;
/**
 * INFO_SESSION_MASTER_READING (HUD-ALIVE B; research 101): which page draws the "m" -- the original's session master
 * (`DAT_0045a0c0`, `IsSessionMaster`; `FUN_001f7ff0` D:L56607-56611), the console hosting the game. Here the match server
 * is that host for every game (`@s2u/match` `gameLobby.ts`'s header); its stand-in is the seat wearing the game lobby's
 * host star (`gameLobby` seats' `host`, `NetClient.sessionMaster`). A room with no game lobby (the test room's) names no
 * master, so its pages draw "%d". [reading, pending review: the archived frames show "2m" on the host and "2" on the client]
 */
export const INFO_SESSION_MASTER_READING = "the seat wearing the game lobby's host star; none in a room without a game lobby" as const;

/** HUD-ALIVE B (`INFO_CLIENT_COUNT_READING`): the connected consoles -- the room's human seats and its spectators. */
export function validClientCount(rows: readonly { bot?: true }[], spectators: number): number {
  return rows.filter((r) => r.bot !== true).length + spectators;
}

/**
 * The info box's number at (587, 433). HUD-ALIVE B: online, the connected consoles' count, `"%d"` (0x3e3080) or `"%dm"`
 * (0x3e3078) on the session master (`FUN_001f7ff0` D:L56605-56613; the "m" means "this console hosts", not metres); null
 * with no room (hidden offline, `FUN_001fa360` D:L57455-57456). HUD-ALIVE C (`./rangeReadout`, a browser adaptation,
 * off by default): with this browser's range readout on, a walker's range finder `"<n>m"` in its place, none with no
 * range; a seat viewing another keeps the count (the review's F3).
 */
export function infoNumberText(m: Pick<HudModel, 'infoNumber' | 'range' | 'rangeReadout' | 'spectator'>): string | null {
  // The readout is the walker's range finder; a seat viewing another (`spectator` set) keeps the count (the review's F3).
  if (m.rangeReadout === true && !m.spectator) return m.range === null ? null : `${Math.round(m.range)}m`;
  return m.infoNumber ? `${m.infoNumber.count}${m.infoNumber.master ? 'm' : ''}` : null;
}

/** `"%02d:%02d"`. */
export function timerText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * PAGE-ALLOC-A (LATER 867 (A); a CPU-side browser adaptation): `hudLayout`'s per-call constants -- the text's two passes,
 * its read options and the empty options -- made once, where each string and each glyph made them anew (13 MB of its own
 * in 10 s of shadow's X2c profile, with the glyphs' colour and texel temporaries below). Read only.
 */
const TEXT_PASSES = ['shadow', 'text'] as const;
const READ_PLAIN: { special: boolean } = { special: false }, READ_SPECIAL: { special: boolean } = { special: true };
const NO_TEXT_OPTS: { special?: boolean; shadow?: number } = {};

/**
 * The HUD's quads on a frame of `frame` pixels: pure, for the tests and the pass. `sizes` gives each bitmap's texel
 * size; a bitmap missing from it is not drawn. `rects` is each element's bounding box on the frame.
 */
export function hudLayout(
  frame: { width: number; height: number }, model: HudModel, sizes: Record<string, { width: number; height: number }>,
  timing: HudTiming = AT_REST,
): { scale: number; quads: HudQuad[]; rects: Partial<Record<HudElement, Rect>> } {
  const s = frame.height / PS2_H;
  const quads: HudQuad[] = [];
  // Anchors: the left edge, the right edge, the centre line.
  const L = (x: number): number => x * s;
  const R = (x: number): number => frame.width - (PS2_W - x) * s;
  const C = (x: number): number => frame.width / 2 + (x - PS2_W / 2) * s;
  const Y = (y: number): number => y * s;
  const alpha = (rgba: Rgba4, a: number): Rgba4 => [rgba[0], rgba[1], rgba[2], rgba[3] * a];
  // PAGE-ALLOC-A: the quad made with its texels as numbers and its layer set only when one (the keys in the same order).
  const push = (
    element: HudElement, texture: string, x: number, y: number, w: number, h: number, rgba: Rgba4, turn: number,
    u0: number, v0: number, u1: number, v1: number, layer: number,
  ): void => {
    const q: HudQuad = { element, texture, x: x + w / 2, y: y + h / 2, w, h, turn, u0, v0, u1, v1, rgba };
    if (layer) q.layer = layer;
    quads.push(q);
  };
  const bitmap = (
    element: HudElement, texture: string, x: number, y: number, w: number, h: number, rgba: Rgba4,
    turn = 0, src?: [number, number, number, number], layer = 0,
  ): void => {
    const size = sizes[texture];
    if (!size || rgba[3] <= 0) return;
    if (src) push(element, texture, x, y, w, h, rgba, turn, src[0], src[1], src[2], src[3], layer);
    else push(element, texture, x, y, w, h, rgba, turn, 0, 0, size.width, size.height, layer);
  };
  /** A glyph's quad: `bitmap` with its texels as numbers, no turn, no layer. */
  const glyph = (
    element: HudElement, texture: string, x: number, y: number, w: number, h: number, rgba: Rgba4,
    u0: number, v0: number, u1: number, v1: number,
  ): void => {
    if (!sizes[texture] || rgba[3] <= 0) return;
    push(element, texture, x, y, w, h, rgba, 0, u0, v0, u1, v1, 0);
  };
  // PAR-48: `opts.special` reads the pad glyphs (`./hudFont`), drawn from their atlas in their own colour with no shadow;
  // `opts.shadow` is the shadow's alpha when not the HUD's (`FUN_003625e0`: min(the string's, 96), as `./weaponSelect`).
  const text = (
    element: HudElement, line: string, spot: TextSpot, anchor: (x: number) => number, a = 1, rgb?: readonly number[], opacity = HUD_COLOURS.text[3],
    opts: { special?: boolean; shadow?: number } = NO_TEXT_OPTS,
  ): void => {
    const font = FONT_TEXT_01.texture;
    if (!sizes[font] || a <= 0) return;
    const read = opts.special === true ? READ_SPECIAL : READ_PLAIN;
    const width = textWidth(line, spot.scale, read);
    const pen = spot.align === 'right' ? spot.x - width : spot.align === 'centre' ? spot.x - width / 2 : spot.x;
    const { glyphs } = layoutText(line, pen, spot.y, spot.scale, read);
    const [dx, dy] = FONT_TEXT_01.dropShadow.pixels;
    for (const pass of TEXT_PASSES) {
      const ox = pass === 'shadow' ? dx * spot.scale : 0, oy = pass === 'shadow' ? dy * spot.scale : 0;
      for (const g of glyphs) {
        if (g.texture) {
          if (pass === 'text' && g.rgb) {
            glyph(element, g.texture, anchor(g.x), Y(g.y), g.w * s, g.h * s, [g.rgb[0] / 128, g.rgb[1] / 128, g.rgb[2] / 128, opacity * a], g.u0, g.v0, g.u1, g.v1);
          }
          continue;
        }
        // PAGE-ALLOC-A: the colour made once, as `alpha(base, a)` made it (base's alpha times `a`), not twice.
        let rgba: Rgba4;
        if (pass === 'text' && g.rgb) rgba = [g.rgb[0] / 128, g.rgb[1] / 128, g.rgb[2] / 128, opacity * a];
        else if (pass === 'text' && rgb) rgba = [rgb[0]!, rgb[1]!, rgb[2]!, opacity * a];
        else if (pass === 'shadow' && opts.shadow !== undefined) rgba = [0, 0, 0, opts.shadow * a];
        else { const c = HUD_COLOURS[pass]; rgba = [c[0], c[1], c[2], c[3] * a]; }
        glyph(element, font, anchor(g.x + ox), Y(g.y + oy), g.w * s, g.h * s, rgba, g.u0, g.v0, g.u1, g.v1);
      }
    }
  };

  // The ammo box, faded in on a spawn; hidden while scoped (`FUN_00237de0`, L56217-56225: the zoom readout stands
  // where it was).
  const A = HUD_LAYOUT.ammo, fade = model.zoom > 1.01 ? 0 : timing.fade;
  bitmap('panel', 'newweapnbkrnd.tif', L(A.panel.x), Y(A.panel.y), A.panel.w * s, A.panel.h * s, alpha(HUD_COLOURS.panel, fade));
  // LATER 117: watching a teammate, the icon is the viewed actor's held item's (`FUN_00237760` D:L85245-85249), not the
  // dead walker's own; none known, the panel alone.
  const watching = model.spectator?.path === 'teammate' ? model.spectator : null;
  const iconName = watching ? watching.weaponIcon ?? null : model.weaponIcon;
  const icon = iconName ? sizes[iconName] : undefined;
  if (iconName && icon) bitmap('icon', iconName, L(A.icon.x), Y(A.icon.y), icon.width * s, icon.height * s, alpha(HUD_COLOURS.icon, fade));
  const fm = sizes['firemode.tif'];
  const roundIcon = model.fireModeIcon ? sizes[model.fireModeIcon] : undefined;
  if (model.fireModeRow === false) {
    // Nothing up that has fire modes: no row (`FUN_005bc300`).
  } else if (model.fireModeIcon) {
    // A round mode (`FUN_00237b40`): the four cells hidden, the first shows the round's icon at its own size.
    if (roundIcon) bitmap('firemode', model.fireModeIcon, L(A.rounds4.xs[0]!), Y(A.rounds4.y), roundIcon.width * s, roundIcon.height * s, alpha(HUD_COLOURS.icon, fade));
  } else if (fm) {
    for (const x of A.rounds4.xs.slice(0, FIRE_MODE_ROUNDS[model.fireMode])) {
      bitmap('firemode', 'firemode.tif', L(x), Y(A.rounds4.y), fm.width * s, fm.height * s, alpha(HUD_COLOURS.icon, fade));
    }
  }
  const lines = ammoLines(model);
  text('rounds', lines.rounds, A.rounds, L, fade);
  if (lines.mags) text('mags', lines.mags, A.mags, L, fade);

  // The compass: the ring turned by the heading (`FUN_00211510` -> `FUN_00358730`).
  const K = HUD_LAYOUT.compass;
  bitmap('compass', 'compass_lo.tif', R(K.cx - K.size / 2), Y(K.cy - K.size / 2), K.size * s, K.size * s,
    [1, 1, 1, K.alpha], (model.yaw * Math.PI) / 180);

  // The compass's nav marks (`FUN_00211510`, research 87 §10): each nav point by its bearing from the view, within
  // 200 units at 0.005 x 65 pixels a unit and its own size; farther, pinned at radius 64 at 1.2x with `ret_triangle`
  // at radius 50 at 0.6x pointing to it. Shown: those within 200, and the nearest.
  // XR-06: the objective marks (`extraMarks`) by the same rule, in their colour (OBJECTIVE_MARK_RGB_READING).
  // HX-5: each objective mark in its type's colour (OBJECTIVE_MARK_RGB_READING), a pulsing one at the marks' pulse.
  // BOMB-MARKS: a typed base mark in its type's colour (BASE_MARK_TYPE_RGB_READING).
  for (const m of compassMarks(model)) {
    const c = m.type ? BASE_MARK_TYPE_RGB_READING[m.type]
      : m.objective ? OBJECTIVE_MARK_RGB_READING[m.bitmap as CompassMark['bitmap']] ?? NAV_MARK.rgb : NAV_MARK.rgb;
    const rgbNav: Rgba4 = [c[0] / 128, c[1] / 128, c[2] / 128, m.pulse ? timing.marks ?? 1 : 1];
    const size = sizes[m.bitmap];
    if (!size) continue;
    const at = (radius: number): [number, number] => [K.cx + radius * m.sin, K.cy - radius * m.cos];
    if (m.distance < 200) {
      const [x, y] = at(m.distance * 0.005 * 65);
      bitmap('marks', m.bitmap, R(x - size.width / 2), Y(y - size.height / 2), size.width * s, size.height * s, rgbNav);
    } else {
      const tri = sizes['ret_triangle.tif'];
      if (tri) {
        const [x, y] = at(50), w = tri.width * 0.6, h = tri.height * 0.6;
        bitmap('marks', 'ret_triangle.tif', R(x - w / 2), Y(y - h / 2), w * s, h * s,
          [NAV_MARK.arrow[0] / 128, NAV_MARK.arrow[1] / 128, NAV_MARK.arrow[2] / 128, 1], Math.atan2(m.sin, m.cos));
      }
      const [x, y] = at(64), w = size.width * 1.2, h = size.height * 1.2;
      bitmap('marks', m.bitmap, R(x - w / 2), Y(y - h / 2), w * s, h * s, rgbNav);
    }
  }

  // The info box: the health bar and the name on it, the timer line's box, the timer, the number (HUD-ALIVE B).
  // PAR-48: a seat viewing another shows the viewed body's (`FUN_00238500` D:L85555-85569), the walker's model untouched.
  const view = model.spectator ?? null, away = view !== null && view.path !== 'own';
  const body = away && view ? view.followed ?? SPECTATOR_OWN_INFO_PLACEHOLDER : null;
  const I = HUD_LAYOUT.info;
  const shownHealth = away ? body?.health ?? null : model.health;
  if (shownHealth !== null) {
    const health = Math.min(1, Math.max(0, shownHealth));
    if (health > 0) bitmap('bar', WHITE, R(I.bar.x), Y(I.bar.y), I.bar.w * health * s, I.bar.h * s, HUD_COLOURS.health);
    if (health < 1) {
      bitmap('bar', WHITE, R(I.bar.x + I.bar.w * health), Y(I.bar.y), I.bar.w * (1 - health) * s, I.bar.h * s, HUD_COLOURS.healthLost);
    }
  }
  // W4: "[tag] name", D:L85563-85567; NU-9 N1: the walker's own the same, his name and tag kept apart until here.
  const infoName = away ? (body ? taggedName(body.tag, body.name) : '') : model.name ? taggedName(model.tag, model.name) : '';
  if (infoName) text('name', infoBoxName(infoName), I.name, R);
  const panel = sizes['newweapnbkrnd.tif'];
  if (panel) {
    bitmap('box', 'newweapnbkrnd.tif', R(I.box.x), Y(I.box.y), I.box.w * s, I.box.h * s, HUD_COLOURS.panel, 0,
      [panel.width, 0, 0, panel.height]);
  }
  // XR-06: the fuse in the round timer's place while it runs (DEFUSE_TIMER_LAYOUT_READING).
  text('timer', timerText(model.defuseTimer ?? view?.roundTimer ?? model.timer), I.timer, R);
  const infoNumber = infoNumberText(model);   // HUD-ALIVE B: the consoles' count ("%d" / "%dm"); C: the range readout, when on
  if (infoNumber !== null) text('range', infoNumber, I.range, R);

  // MATCH-05 (research 170 §5.2): the voice element -- the number's box and the number, always (`FUN_00238ac0`
  // D:L85716-85717), the speaker's line, the channel icon and the talk / busy icon when they have a texture.
  // AD-7 (C93): each icon at its own ramped alpha (`timing.voice`; was the fixed 64 / 128 of
  // `VOICE_INDICATOR_LOOK_PLACEHOLDER.iconAlpha`), no positional motion (none read).
  if (model.voice) {
    const V = HUD_LAYOUT.voice, v = model.voice, rest = VOICE_ICON_RAMP.target / 128;
    const iconA = timing.voice?.icon ?? rest, talkA = timing.voice?.talk ?? rest;
    // HUD-ALIVE (OT.R117, a browser adaptation): with the alive counts on (`right` set) the SEALs alive on the left box in
    // the scoreboard's SEAL bar colour, the Terrorists alive on the left box mirrored in its TERRORIST bar colour, each
    // number centred on its own box (HUD-ALIVE-BOXES); without them the original's element, box and spot.
    const alive = v.right != null;
    bitmap('voice', WHITE, R(V.countBox.x), Y(V.countBox.y), V.countBox.w * s, V.countBox.h * s,
      alive ? HUD_ALIVE_BOX_COLOURS_ADAPTATION.seal : HUD_COLOURS.voiceBox);
    text('voice', v.count, alive ? HUD_ALIVE_LEFT_LAYOUT_ADAPTATION.count : V.count, R, 1, [1, 1, 1], HUD_COLOURS.voiceCount[3]);
    if (v.right != null) {
      const A = HUD_ALIVE_RIGHT_LAYOUT_ADAPTATION;
      bitmap('voice', WHITE, R(A.countBox.x), Y(A.countBox.y), A.countBox.w * s, A.countBox.h * s, HUD_ALIVE_BOX_COLOURS_ADAPTATION.terrorist);
      text('voice', v.right, A.count, R, 1, [1, 1, 1], HUD_COLOURS.voiceCount[3]);
    }
    if (v.name) text('voice', v.name, V.name, R);
    if (v.icon) bitmap('voice', v.icon, R(V.icon.x), Y(V.icon.y), V.icon.w * s, V.icon.h * s, [1, 1, 1, iconA]);
    if (v.talk) bitmap('voice', v.talk, R(V.talk.x), Y(V.talk.y), V.talk.w * s, V.talk.h * s, [1, 1, 1, talkA]);
  }

  // NU-9 (c) T3 (research 329 §1.3-§1.7): the teammates' over-head tags, laid on the frame's own width in its 448-high
  // units (`teamTagLayout`; MP_TEAM_TAG_WIDE_FRAME_ADAPTATION) and placed from its left edge. The name texts in
  // `font_text_01` at 0.9 (LATER 671: the view's scale, the adaptation's by default), left at the pen, white (MP_TEAM_TAG_COLOUR_READING) at the tag's alpha over 128 with the drop
  // shadow at min(alpha, 96) (`FUN_003625e0`) -- none with TEAMMATE NAMES off (D:L77292-77301) or the Chat menu open
  // (D:L56617-56623). The talk arrow and icon over the holder's tag always (the HUD's own sprites, D:L77550, D:L77557),
  // each over its rectangle as `FUN_00364660` takes it -- the arrow's y0 under its y1, so drawn flipped.
  if (model.teamTags) {
    const laid = teamTagLayout(model.teamTags, s > 0 ? frame.width / s : PS2_W);
    if (model.teammateNames !== false && !model.commandMenu) {
      for (const t of laid.tags) {
        text('teamTags', t.text, { x: t.x, y: t.y, scale: model.teamTags.scale ?? TEAM_TAG_LAYOUT.scale }, L, 1, MP_TEAM_TAG_COLOUR_READING, t.alpha / 128,
          { shadow: Math.min(t.alpha, 96) / 128 });
      }
    }
    for (const sp of laid.sprites) {
      const size = sizes[sp.texture];
      if (!size) continue;
      const flipped = sp.y0 > sp.y1;
      bitmap('teamTalk', sp.texture, L(Math.min(sp.x0, sp.x1)), Y(Math.min(sp.y0, sp.y1)), Math.abs(sp.x1 - sp.x0) * s,
        Math.abs(sp.y1 - sp.y0) * s, [sp.rgb[0] / 128, sp.rgb[1] / 128, sp.rgb[2] / 128, sp.alpha / 128], 0,
        flipped ? [0, size.height, size.width, 0] : undefined);
    }
  }

  // The zoom readout and the scope's range (research 87 §13): while magnified.
  if (model.zoom > 1.01) {
    text('zoom', `ZOOM: ${model.zoom.toFixed(1)}x`, HUD_LAYOUT.zoom, L);
    text('scopeRange', `RANGE(m): ${model.range === null ? '----' : model.range.toFixed(0)}`, model.binoculars ? HUD_LAYOUT.binocularsRange : HUD_LAYOUT.scopeRange, C);
  }

  // The stance word, fading after a change.
  if (timing.stance > 0) text('stance', STANCE_WORDS[model.stance], HUD_LAYOUT.stance, R, timing.stance / HUD_COLOURS.text[3]);

  // The context prompt, pulsing.
  if (model.action) {
    const P = HUD_LAYOUT.action, c = ACTION_COLOURS[model.actionColour];
    const rgb = c.base.map((b, i) => (b + timing.pulse * c.delta[i]!) / 128) as [number, number, number];
    // LkPaioX5 part 2 (b): the head's caption (`actionCaptionOf`), every record's on the one label `FUN_00220350` writes
    // (D:L74385-74496), placed at (306, 435) as research 303 read it for VICTORY DANCE (VICTORY_CAPTION_READING's spot).
    if (model.actionCaption) {
      const V = VICTORY_CAPTION_READING;
      text('actionCaption', model.actionCaption, { x: V.x, y: V.y, scale: V.scale, align: 'centre' }, C, 1, [V.rgb / 128, V.rgb / 128, V.rgb / 128], V.alpha / 128);
    }
    // A bitmap the map lacks is `action_x.tif`, as `FUN_0021ded0` falls back for each (D:L73569-73570 the emblem's).
    const icon = (p: ActionPrompt): string => (sizes[ACTION_ICONS[p]] ? ACTION_ICONS[p] : ACTION_ICONS.action);
    // LkPaioX5 part 2 (a): each slot at its alpha (`ACTION_ICON_FADE`), the head's cap at rest.
    const F = ACTION_ICON_FADE, A = timing.actionAlpha;
    bitmap('action', icon(model.action), C(P.cx - P.size / 2), Y(P.y), P.size * s, P.size * s, [...rgb, A?.[0] ?? F.primary.cap / 128]);
    // list[1] right, list[2] left (`FUN_0021f210` D:L73987-74000: odd right, even left, 62 out), each its record's colour
    // on the one pulse (D:L74004-74012).
    (model.actionSides ?? []).slice(0, 2).forEach((side, i) => {
      const k = ACTION_COLOURS[side.colour], cx = P.cx + (i === 0 ? 1 : -1) * (P.size + P.gap);
      const sideRgb = k.base.map((b, j) => (b + timing.pulse * k.delta[j]!) / 128) as [number, number, number];
      bitmap('actionSides', icon(side.prompt), C(cx - P.size / 2), Y(P.y), P.size * s, P.size * s, [...sideRgb, A ? (A[i + 1] ?? 0) : F.side.cap / 128]);
    });
  }

  // PB-8: the bomb's hold bar, the box then the fill (`FUN_00220350` D:L74437-74442), right-anchored as the info box
  // is; its alphas its own, not the prompt's pulse.
  if (model.holdBar) {
    const H = HUD_LAYOUT.holdBar, f = Math.min(1, Math.max(0, model.holdBar.fill)), fade = model.holdBar.fade;
    const box: Rgba4 = fade === undefined ? HUD_COLOURS.holdBox : [0, 0, 0, fade / 128];
    const [r, g, b] = HUD_COLOURS.holdFill;
    const fill: Rgba4 = fade === undefined ? HUD_COLOURS.holdFill : [r, g, b, fade / 128];
    bitmap('holdBar', WHITE, R(H.box.x), Y(H.box.y), H.box.w * s, H.box.h * s, box);
    const width = Math.trunc(H.fill.x + H.fill.w * f) - H.fill.x;     // the (int) of D:L74442
    if (width > 0) bitmap('holdBar', WHITE, R(H.fill.x), Y(H.fill.y), width * s, H.fill.h * s, fill);
  }

  // The bomb hold (including its fade) has priority; the C4 clock itself continues in the projectile.
  if (model.c4FuseBar && !model.holdBar) {
    const H = HUD_LAYOUT[C4_FUSE_BAR_PRESENTATION_ADAPTATION.layout];
    const f = Math.min(1, Math.max(0, model.c4FuseBar.fill));
    bitmap('c4FuseBar', WHITE, R(H.box.x), Y(H.box.y), H.box.w * s, H.box.h * s, HUD_COLOURS.holdBox);
    const width = Math.trunc(H.fill.w * f);
    if (width > 0) bitmap('c4FuseBar', WHITE, R(H.fill.x), Y(H.fill.y), width * s, H.fill.h * s, HUD_COLOURS.holdFill);
  }

  // PAR-48: a spectator's own (`FUN_001f9160` D:L56875-56895): the panel `CSpectatorInfo` -- the stats panel, then the
  // title bar, then their words (`SPECTATOR_INFO_LAYOUT`, `spectatorInfoText`). The help lines follow, every seat's.
  if (view && (view.path ?? 'spectator') === 'spectator') {
    const S = SPECTATOR_INFO_LAYOUT, words = spectatorInfoText(view), ink = SPECTATOR_INFO_TEXT_RGB_PLACEHOLDER;
    const panelRgb = SPECTATOR_INFO_RGB_PLACEHOLDER;
    if (words.rows) {
      bitmap('spectatorInfo', 'newweapnbkrnd.tif', L(S.stats.x), Y(S.stats.y), S.stats.w * s, S.stats.h * s, [panelRgb[0], panelRgb[1], panelRgb[2], S.stats.alpha / 128]);
    }
    const titleRgb = words.titleRgb ?? panelRgb;
    bitmap('spectatorInfo', 'newweapnbkrnd.tif', L(S.title.x), Y(S.title.y), S.title.w * s, S.title.h * s, [titleRgb[0], titleRgb[1], titleRgb[2], S.title.alpha / 128]);
    text('spectatorInfo', words.title, S.titleText, L, 1, ink, ink[3]);
    words.rows?.forEach((row, i) => {
      text('spectatorInfo', row.label, { x: S.labels.x, y: S.labels.y0 + i * S.labels.pitch, scale: S.labels.scale }, L, 1, ink, ink[3]);
      if (row.value) {
        text('spectatorInfo', row.value, { x: S.values.x, y: S.values.y0 + i * S.values.pitch, scale: S.values.scale, align: S.values.align }, L, 1, ink, ink[3]);
      }
    });
  }
  // LATER 118 (research 282 §8): the six help lines `CHUD+0x19d58` on every seat's path -- the spectator's four
  // (`FUN_001f9160` D:L56869-56872) or a dead player's six (`view.help`: `FUN_001f97b0` D:L56996-57107, `FUN_001f9f20`
  // D:L57149-57173) -- placed and shown alike (`SPECTATOR_HELP`: D:L56881-56895, D:L57120-57135, D:L57191-57205), on the
  // one clock (`timing.help`, D:L56541-56562); RSP-6's ready Action line reasserts 100 every eligible frame
  // (research 351 §2, loaded r0004 0x1f9c50-0x1f9c68). Hidden while the Chat menu is open, for every seat (control state 2,
  // D:L56617-56622), and under the scoreboard (`SCOREBOARD_HIDES`, D:L56817-56823).
  const helpLines = !view ? null
    : (view.path ?? 'spectator') === 'spectator' ? [...SPECTATOR_HELP.lines, ...SPECTATOR_HELP_TAIL_PLACEHOLDER] : view.help ?? null;
  const H = SPECTATOR_HELP;
  if (helpLines && !model.commandMenu) {
    helpLines.forEach((line, i) => {
      const helpA = i === 1 && view?.respawnReady ? H.alpha : (timing.help ?? 1) * H.alpha;
      if (helpA <= 0) return;
      text('help', line, { x: H.x, y: H.y0 + i * H.pitch, scale: H.scale, align: 'centre' }, C, 1,
        [H.rgb[0] / 128, H.rgb[1] / 128, H.rgb[2] / 128], helpA / 128, { special: true, shadow: Math.min(helpA, 96) / 128 });
    });
  }

  // The event banner: the panel while any message shows, the lines newest at the bottom (`HUD_LAYOUT.banner`).
  const messages = model.message ? [...model.banner, { lines: [{ text: model.message, scale: 1 }], alpha: 1 }] : model.banner;
  const shown = messages.filter((m) => m.alpha > 0);
  if (shown.length > 0) {
    const M = HUD_LAYOUT.message, B = HUD_LAYOUT.banner;
    const panelAlpha = Math.max(...shown.map((m) => m.alpha));
    const lines = shown.flatMap((m) => m.lines.map((l) => ({ ...l, alpha: m.alpha })));
    // OT.R82 (`./hudMessagePanel`): wider, to its cap, for a line the default does not hold, clear of what stands beside it.
    const P = messagePanelSpan({ x: C(M.panel.x), w: M.panel.w * s, y0: Y(M.panel.y), y1: Y(M.panel.y + M.panel.h) }, s,
      Math.max(0, ...lines.map((l) => textWidth(l.text, l.scale))), [...quads, ...keepClearNeighbours(frame, model.keepClear ?? [])]);
    bitmap('banner', 'newweapnbkrnd.tif', P.x, Y(M.panel.y), P.w, M.panel.h * s, alpha(HUD_COLOURS.panel, panelAlpha));
    let y = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i]!;
      y = i === lines.length - 1 ? B.base + B.perScale * l.scale : y - B.pitch;
      text('message', l.text, { x: B.x, y, scale: l.scale, align: 'centre' }, C, l.alpha, l.rgb, l.opacity);
    }
  }

  // KEYBOARD-WHISPER (`TEXT_LINE_LAYOUT`; `ROUND_TEXT_LINE_DRAW_READING`): the round's text line, the box then the text,
  // anchored on the centre line as the message window is (25..615 is symmetric about x 320).
  const T = model.textLine;
  if (T) {
    const TL = TEXT_LINE_LAYOUT, [r, g, b] = TL.rgb;
    if (T.box > 0) bitmap('textLine', WHITE, C(TL.box.x), Y(TL.box.y), TL.box.w * s, TL.box.h * s, [0, 0, 0, T.box / 128]);
    if (T.text && T.ink > 0) {
      text('textLine', T.text, { x: TL.text.x, y: TL.text.y, scale: TL.text.scale }, C, 1, [r / 128, g / 128, b / 128], T.ink / 128,
        { shadow: Math.min(T.ink, 96) / 128 });
    }
  }

  // The spawn's fade from black, over everything the pass draws.
  if (model.fader > 0) bitmap('fader', WHITE, 0, 0, frame.width, frame.height, [0, 0, 0, model.fader], 0, undefined, 1);

  // PAR-48: what the view's path does not draw (`SPECTATOR_HIDES`, `OWN_BODY_HIDES`); LATER 117: `TEAMMATE_HIDES`.
  const hides = !view ? null : view.path === 'teammate' ? TEAMMATE_HIDES : away ? SPECTATOR_HIDES : OWN_BODY_HIDES;
  const kept = hides ? quads.filter((q) => !hides.has(q.element)) : quads;
  const rects: Partial<Record<HudElement, Rect>> = {};
  for (const q of kept) {
    const c = Math.abs(Math.cos(q.turn)), n = Math.abs(Math.sin(q.turn));
    const hw = (q.w * c + q.h * n) / 2, hh = (q.w * n + q.h * c) / 2;
    const r = rects[q.element];
    const x0 = q.x - hw, y0 = q.y - hh, x1 = q.x + hw, y1 = q.y + hh;
    if (!r) rects[q.element] = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    else {
      // PAGE-ALLOC-A: the element's rect grown in place (each number from the rect as it stood), not made again.
      const nx0 = Math.min(r.x, x0), ny0 = Math.min(r.y, y0);
      const width = Math.max(r.x + r.width, x1) - nx0, height = Math.max(r.y + r.height, y1) - ny0;
      r.x = nx0; r.y = ny0; r.width = width; r.height = height;
    }
  }
  return { scale: s, quads: kept, rects };
}

/**
 * The pass's quads and shapes on a frame, pure: the in-round HUD less what the tactical map, the scoreboard or a round
 * screen hides, then the extra layer -- a round screen (over everything, replacing the scoreboard and the tactical
 * map), else the tactical map's overlay and the scoreboard. `presentation` places the scoreboard: the Modern one
 * (`'native'`) raises it by `MODERN_SCOREBOARD_LIFT` and shrinks it clear of the bottom HUD (`modernScoreboardFit`);
 * the PS2 one keeps the game's place.
 */
export function hudPass(
  frame: { width: number; height: number }, model: HudModel, sizes: Record<string, { width: number; height: number }>,
  timing: HudTiming, tacOpen: boolean, overlay: HudOverlay | null, presentation: Presentation = 'ps2',
): { quads: HudQuad[]; tris: HudTri[] } {
  const { quads } = hudLayout(frame, model, sizes, timing);
  if (model.roundScreen) {
    const screen = roundScreenLayout(model.roundScreen, frame, sizes);
    return { quads: [...quads.filter((q) => !ROUND_SCREEN_HIDES.has(q.element)), ...screen.quads], tris: screen.tris };
  }
  // The tactical map hides the in-round HUD and the compass (`FUN_001f71c0`); its own layer draws instead. The
  // scoreboard hides the ammo box, the compass, the prompts and the timer (L56808-56828) and draws on layer 1.
  // MATCH-01: SPECTATOR HUD off hides the scoreboard's set (D:L56808: `DAT_003dc3e0 == 0` or the board up); the START
  // menu's open hides `START_MENU_HIDES` (the hide-all, D:L61964).
  const hiding = model.scoreboard || model.spectatorHud === false;
  const shown = (q: HudQuad): boolean => !(hiding && SCOREBOARD_HIDES.has(q.element)) && !(model.startMenu && START_MENU_HIDES.has(q.element));
  // NU-9 (c): the talk sprites over a teammate's tag are the HUD's own and no hide takes them (research 329 §1.7: the
  // tactical map's hide-all hides the tags' part, the texts).
  const base = tacOpen ? quads.filter((q) => q.element === 'fader' || q.element === 'teamTalk') : hiding || model.startMenu ? quads.filter(shown) : quads;
  const board = model.scoreboard && !tacOpen ? boardLayout(frame, model, sizes, presentation) : null;
  const tac = overlay?.(frame, sizes) ?? null;
  return { quads: [...base, ...(tac?.quads ?? []), ...(board?.quads ?? [])], tris: [...(tac?.tris ?? []), ...(board?.tris ?? [])] };
}

/**
 * The Modern board's clearance over the bottom HUD, in the 640x448 frame's pixels (owner ruling 2026-09-29: "you can
 * just make it a bit smaller instead of moving the top chat"): its bottom, and its sides where it stands beside an
 * element rather than over it, keep this far from every bottom-HUD element still up while it shows.
 */
export const MODERN_SCOREBOARD_MARGIN = 4;
/**
 * The smallest the Modern board is drawn (legibility): its rows' 0.8 text is then 0.6 of the font, the smallest the HUD
 * writes anywhere is the stance word's 0.765. An aspect needing less is drawn at this and reported (`fits` false).
 */
export const MODERN_SCOREBOARD_MIN_SCALE = 0.75;
/**
 * The bottom HUD still drawn while the board is up (all but `SCOREBOARD_HIDES`): what the Modern board must clear. PAR-48:
 * the info box and the number are hidden under the board (D:L56811, D:L56826), so the stance word and the ZOOM line.
 */
export const SCOREBOARD_KEEPS_BOTTOM: readonly HudElement[] = ['stance', 'zoom'];

/** One bottom-HUD element's footprint on a frame (frame pixels): its sides and its top edge. */
export interface BottomEdge { element: HudElement; x0: number; x1: number; top: number }

/**
 * The bottom HUD's footprint on a frame while the board is up: each of `SCOREBOARD_KEEPS_BOTTOM` at its widest -- the
 * health bar, the name on it, the timer line's box, the range ("999m"), the stance word (the widest of the three), the
 * zoom readout ("ZOOM: 10.0x") -- from `hudLayout`'s own anchors (all of them the right edge but the zoom's left edge).
 */
export function bottomHudEdges(frame: { width: number; height: number }, sizes: Record<string, { width: number; height: number }>): BottomEdge[] {
  const edges = new Map<HudElement, BottomEdge>();
  for (const stance of ['stand', 'crouch', 'prone'] as const) {
    const probe: HudModel = { ...DEFAULT_MODEL, name: DEFAULT_PLAYER, range: 999, rangeReadout: true, zoom: 10, stance };   // HUD-ALIVE C: "999m" outspans the count
    const { rects } = hudLayout(frame, probe, sizes, { fade: 1, stance: 1, pulse: 0 });
    for (const element of SCOREBOARD_KEEPS_BOTTOM) {
      const r = rects[element];
      if (!r) continue;
      const e = edges.get(element), x0 = r.x, x1 = r.x + r.width, top = r.y;
      edges.set(element, e ? { element, x0: Math.min(e.x0, x0), x1: Math.max(e.x1, x1), top: Math.min(e.top, top) } : { element, x0, x1, top });
    }
  }
  return [...edges.values()];
}

/**
 * The Modern board's place on a frame: the lift, and the uniform scale about its top-centre that brings its bottom
 * `MODERN_SCOREBOARD_MARGIN` clear of every bottom-HUD element it would stand over (an element it clears sideways by
 * that margin does not bind it), at most 1, at least `MODERN_SCOREBOARD_MIN_SCALE`; `fits` false when even the minimum
 * does not clear. The board's top stays at the lift's place (100), under the message window, whatever the scale.
 */
export function modernScoreboardFit(
  frame: { width: number; height: number }, sizes: Record<string, { width: number; height: number }>,
): { lift: number; scale: number; fits: boolean; need: number; edges: BottomEdge[]; board: { x0: number; x1: number; top: number; bottom: number } } {
  const s = frame.height / PS2_H, m = MODERN_SCOREBOARD_MARGIN * s, cx = frame.width / 2;
  const lift = MODERN_SCOREBOARD_LIFT;
  const full = scoreboardLayout(frame, { player: DEFAULT_PLAYER, game: 'GAME', type: 'TYPE' }, sizes, lift);
  const xs = [...full.quads.flatMap((q) => [q.x - q.w / 2, q.x + q.w / 2]), ...full.tris.flatMap((t) => [t.p[0], t.p[2], t.p[4]])];
  const ys = [...full.quads.flatMap((q) => [q.y - q.h / 2, q.y + q.h / 2]), ...full.tris.flatMap((t) => [t.p[1], t.p[3], t.p[5]])];
  const x0 = Math.min(...xs), x1 = Math.max(...xs), bottom = Math.max(...ys), top = (SCORE_TOP - lift) * s;
  const edges = bottomHudEdges(frame, sizes);
  let need = 1;
  for (const e of edges) {
    const kv = (e.top - m - top) / (bottom - top);
    const right = e.x0 - m - cx, left = cx - e.x1 - m;
    const kh = Math.max(right > 0 ? right / (x1 - cx) : 0, left > 0 ? left / (cx - x0) : 0);
    need = Math.min(need, Math.max(kv, kh));
  }
  const scale = Math.max(MODERN_SCOREBOARD_MIN_SCALE, need);
  return { lift, scale, fits: need >= MODERN_SCOREBOARD_MIN_SCALE, need, edges, board: { x0, x1, top, bottom } };
}

/**
 * The scoreboard's quads and shapes for the model, in the presentation's place: the Modern one lifted
 * (`MODERN_SCOREBOARD_LIFT`) and scaled to clear the bottom HUD (`modernScoreboardFit`); the PS2 one the game's.
 */
function boardLayout(
  frame: { width: number; height: number }, model: HudModel, sizes: Record<string, { width: number; height: number }>,
  presentation: Presentation,
): ReturnType<typeof scoreboardLayout> {
  const fit = presentation === 'native' ? modernScoreboardFit(frame, sizes) : { lift: 0, scale: 1 };
  return scoreboardLayout(frame, { player: model.name || DEFAULT_PLAYER, game: model.game.name, type: model.game.type,
    ...(model.scoreboardDetails ? { details: model.scoreboardDetails } : {}),
    ...(model.scoreRows.rows ? { rows: model.scoreRows.rows, spectators: model.scoreRows.spectators, wins: model.scoreRows.wins } : {}),
    ...(model.bombCarrier != null ? { bombCarrier: model.bombCarrier } : {}) }, sizes,
    fit.lift, fit.scale);
}

/** What `Hud.feed` reads each frame. */
export interface HudSources {
  /** `magsHidden`: NET-REFILL N4, the network test's hidden MAGS line (`./fire` `MagazineState`). */
  magazine: { rounds: number; capacity: number; spare: number; reloading: boolean; magsHidden?: boolean };
  yaw: number;
  stance?: HudStance;
  /** LATER 414: a stance taken this frame (the walker's one-time bit): the word shown again, whatever it was. */
  stanceTaken?: HudStance;
  climb?: ClimbPrompt | null;
  /** The feet (x, z), for the compass's nav marks. */
  position?: [number, number] | null;
  /** The map's action in reach (`./mapActions`'s `actionInReach`), as a prompt kind; LkPaioX5 (a): or the picker's list. */
  nearby?: ActionFeed;
  range?: number | null;
  /** The weapon's fire mode, once the weapon has a switch (the ACCURACY workstream's); absent leaves `setFireMode`'s. */
  fireMode?: FireMode;
}

/** The test hook's patch: any of the inputs the walk does not drive yet. */
export interface HudPatch {
  fireMode?: FireMode; weaponIcon?: string; action?: ActionPrompt | null; climb?: ClimbPrompt | null;
  message?: string | null; zoom?: number; name?: string; health?: number; timer?: number; range?: number | null;
  stance?: HudStance; yaw?: number; rounds?: number; capacity?: number; spare?: number; scoreboard?: boolean;
  /** Skip the spawn fade and the round start (the tests' still frames). */
  settled?: boolean;
  /** Put the round start at this many seconds (the tests' frames of the sequence). */
  roundTime?: number;
  /** Hold the model as patched: `feed` is ignored until a patch with `frozen: false` (the tests' still frames). */
  frozen?: boolean;
}

/** `Hud.state()`: drawn or not, the frame, what it shows, the fades, and each element's rectangle (y down). */
export interface HudView {
  visible: boolean;
  frame: { width: number; height: number };
  model: HudModel;
  timing: HudTiming;
  rects: Partial<Record<HudElement, Rect>>;
  /**
   * LATER 117: the bitmap the weapon box's icon draws on the last frame (the 'icon' quad's texture, e.g.
   * `sigcommando_icon.tif`), null when no icon is drawn -- so a check can tell the watched teammate's from the walker's own.
   */
  icon?: string | null;
}

/**
 * The range finder -- the scope's and binoculars' `RANGE(m)` line (research 87 §13), and the info box's spot only while
 * this browser's range readout is on (HUD-ALIVE C, `./rangeReadout`; the original's number there is the consoles' count,
 * `infoNumberText`): how far the surface under the reticle is, in metres (`MetersPerUnit` 0.1), along
 * a segment from the eye through the aim point, `reach` long (1000 units by default) -- the viewer's reading of the
 * readout [estimate: the game's own source for the number was not traced]. Not the shot's eye ray: that one is
 * `min(max(range, 600), the camera's MID + the view's extension)` long since AD-1 (`./fire` `aimReach`, research 232
 * section 8). Measured at most five times a second: the segment walks the hull's grid. Was: "along the shot's own
 * segment (`./fire`: the eye through the aim point, the rifle's 1000 units)".
 */
export class RangeFinder {
  private at = -Infinity;
  private value: number | null = null;
  constructor(private readonly metersPerUnit = 0.1, private readonly every = 0.2, private readonly reach = 1000) {}
  measure(grid: Grid | null, aim: { eye: readonly number[]; far: readonly number[] } | null, now: number): number | null {
    if (now - this.at < this.every) return this.value;
    this.at = now;
    if (!grid || !aim) return (this.value = null);
    const d = [aim.far[0]! - aim.eye[0]!, aim.far[1]! - aim.eye[1]!, aim.far[2]! - aim.eye[2]!];
    const n = Math.hypot(d[0]!, d[1]!, d[2]!) || 1;
    const from: [number, number, number] = [aim.eye[0]!, aim.eye[1]!, aim.eye[2]!];
    const end: [number, number, number] = [from[0] + (d[0]! / n) * this.reach, from[1] + (d[1]! / n) * this.reach, from[2] + (d[2]! / n) * this.reach];
    const hit = segmentHit(grid, from, end);
    return (this.value = hit ? hit.t * this.reach * this.metersPerUnit : null);
  }
}

/**
 * The GS samples a sprite's texture at each pixel's integer corner where GL samples at its centre (research 87 §2):
 * with the HUD's bilinear filter (every HUD bitmap's TEX1 asks for it) the console's content sits half a PS2 pixel
 * right of and below GL's for the same quad -- the +0.2..+0.8 pixel offsets the console frames show on every bitmap
 * before this correction. The pass moves each quad's texels by this much, in PS2 pixels, and leaves its edges.
 */
export const GS_SAMPLE_OFFSET = 0.5;

function makeTexture(rgba: Rgba): DataTexture {
  // `./hudAssets` hands the bitmaps over top row first; the HUD camera looks with y down, so they go up unflipped.
  const t = new DataTexture(rgba.data, rgba.width, rgba.height, RGBAFormat, UnsignedByteType);
  hdTextures.register(t, rgba, true);   // OT.R92 (HD-3): inert until the test room's HD pack is set; `flipRows`'d, keyed turned back
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

/** One batch per layer and bitmap: a dynamic quad list drawn in one call. */
/**
 * `sent`: the geometry's attributes have been flagged for upload once; `count`: the quads (triangles) last written. CPS
 * (plan 2026-11-02; product track, the same picture): a frame flags its attributes only when what it wrote changed them.
 */
interface Batch { mesh: Mesh; geometry: BufferGeometry; capacity: number; size: { width: number; height: number }; sent: boolean; count: number }
/** One layer's untextured triangles (`sent`, `count` as `Batch`'s). */
interface Shapes { mesh: Mesh; geometry: BufferGeometry; capacity: number; sent: boolean; count: number }
/** The layers the pass draws, in order: the in-round HUD, the tactical map. */
export const HUD_LAYERS = 2;

/**
 * The HUD pass: an orthographic scene in frame pixels (y down) drawn after the world and the reticle with
 * `autoClear` off and no depth test. The page feeds it (`feed`, once a frame) and calls `render` after the reticle's.
 */
export class Hud {
  private readonly sampling = new UiTextureExperiment();
  /** Test-room-only browser experiment (research 260); state and layout boxes remain the original's. */
  setExperimentalSampling(settings: UiSamplingSettings): void { this.sampling.set(settings); }
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(0, 1, 0, 1, -1, 1);
  private batches = new Map<string, Batch>();
  private shapes: Shapes[] = [];
  private maps = new Map<string, { texture: DataTexture; size: { width: number; height: number } }>();
  private textures: DataTexture[] = [];
  private materials: MeshBasicNodeMaterial[] = [];
  private model: HudModel = { ...DEFAULT_MODEL };
  private on = false;
  private frame = { width: 0, height: 0 };
  private readonly size = new Vector2();
  /** The arsenal's icons' batches not made yet, by `layer:name`, each with its place in the draw order. */
  private readonly later = new Map<string, { layer: number; name: string; order: number }>();
  /**
   * The HUD's clock (`sinceOn`): seconds drawn since its map's init (`setBitmaps`), run while on or a spectator's
   * (PAR-94c; was: since the HUD came on); the fader runs on it. PAR-94d (R322.8, D6): a round's start no longer zeroes
   * it (was: "or the round's start (`startRound`)"); the round's banner runs from `roundFrom`. The stance word's alpha;
   * the prompt's pulse.
   */
  private sinceOn = 0;
  /**
   * PAR-94d: the HUD's clock (`sinceOn`) at the round's start (`startRound`): the round start's banner and objective are
   * scheduled from it (`FUN_001fb420` posts the banner at the round's start, D:L57632-57649), the fader and the box's fade
   * not (their one start is the HUD's init, D:L57476, D:L57489).
   */
  private roundFrom = 0;
  /** PAR-94d F1: the last round begun on this level (`startRound`), 0 at a map's init (`setBitmaps`). */
  private lastRound = 0;
  private stanceAlpha = 0;
  private pulse = 0;
  private pulseUp = true;
  /** HX-5: the compass marks' pulse (`DAT_0040c070`), in GS units 64..128, and its direction (`DAT_0040c078`). */
  private markPulse: number = OBJECTIVE_MARK_PULSE_READING.min;
  private markPulseDown = false;
  /** AD-7 (C93): the voice element's two icon sprites' alphas, GS units (`./hudVoice` `VOICE_ICON_RAMP`): made at 0. */
  private voiceIconAlpha: number = VOICE_ICON_RAMP.from;
  private voiceTalkAlpha: number = VOICE_ICON_RAMP.from;
  private messageLeft = 0;
  private posts: { at: number; lines: BannerLine[] }[] = [];
  private frozen = false;
  private last = -1;
  private manual: ActionPrompt | null = null;
  private round: RoundInfo = DEFAULT_ROUND;
  private tacOpen = false;
  /** When the ammo box's fade last began: the map's init, or the tactical map's close (PAR-94d; was: "the round start"). */
  private fadeFrom = 0;
  private climbing = false;
  private nearby: ActionPrompt | null = null;
  /** LkPaioX5 part 2 (a): the picker's list as last fed (`setNearbyAction`), its head first; [] with one prompt or none. */
  private nearbyList: readonly ActionEntry[] = [];
  /**
   * LkPaioX5 part 2 (a): each record's sprite alpha, GS units (`ACTION_ICON_FADE`), by its prompt -- the original's alpha
   * is the record's own sprite's (`FUN_003642d0` on the record's `+0x10`), so a turn keeps it; review fold F2: no prompt
   * is drawn in two slots (`showPrompt`), so a side's cap never reaches the head's record.
   */
  private actionAlpha = new Map<ActionPrompt, number>();
  /** The records the list last held, sorted (a change is `FUN_0021f850`'s rebuild, which starts each at 0). */
  private actionSet = '';
  /** LkPaioX5 part 2 (b): HudCLOC's strings (`setLocCaptions`), for the bomb's caption and the message names; none, null. */
  private locCaptions: Readonly<Record<string, string>> | null = null;
  private overlay: HudOverlay | null = null;
  private presentation: Presentation = 'native';
  /** ONL-19 (research 269 §5): GAME DETAILS' source, read when the board opens (`FUN_0022be20` builds the lines on the press only; the 1.0 s rebuild never touches them); null, the LAN fill. */
  private detailsOf: (() => GameDetails | null) | null = null;
  /** PAR-48: the help lines' clock (`CHUD +0x1a0e8`), seconds: zeroed as the HUD becomes a spectator's and at a round start. */
  private helpAt = 0;
  /** KEYBOARD-WHISPER: the text line's text and its two alphas (`FUN_002c9e90`'s +0xa0 and +0x13c). */
  private lineText = '';
  private lineBox = 0;
  private lineInk = 0;
  private starts = 0;
  /**
   * PAR-94c (issue #262): a round has started on this HUD since its map's init (`startRound`, or the test hook's
   * `roundTime`). The round start's banner is the round's -- "STARTING ROUND %d OF %d" is posted by the round's HUD reset
   * `FUN_001fb420` (D:L57632-57648), called by `FUN_002a7d40` (D:L149755-149758; itself called from the level's init
   * `FUN_001ec480` D:L50946 and an MP state D:L75935) and directly by `FUN_001ecb10` (D:L51046-51052): posted at a
   * round's or a level's (re)start, never at a show -- the HUD's show (`FUN_001f7a90`, D:L56366-56447) posts none. So
   * it is drawn only once a round has started.
   */
  private roundBegun = false;

  /**
   * KEYBOARD-WHISPER (`./roundTextLine`): the round's text line now (the line's set text, its vtable +0x70); `step` fades
   * it in while it holds text and out once it is empty (`TEXT_LINE_LAYOUT`).
   */
  setTextLine(text: string): void { this.lineText = text; }
  /** OT.R82: the page's touch controls over the picture (`./hudMessagePanel` `touchKeepClear`), the message panel kept off them. */
  setKeepClear(clear: readonly KeepClear[]): void { this.model.keepClear = clear; }
  /** KEYBOARD-WHISPER: the text line's text now (the line's own, `./roundTextLine`, reads it here). */
  textLineText(): string { return this.lineText; }
  /** KEYBOARD-WHISPER: the round starts the HUD has had (`startRound`): a development build's open line closes at the next. */
  roundStarts(): number { return this.starts; }

  /**
   * The bitmaps of the map just loaded (`./hudAssets`), or none: the HUD then draws nothing. PAR-94c: a map's bitmaps
   * are the HUD's init for its level (`FUN_001fa360`), which starts the fader (`FUN_00228b80(0.5)`, D:L57476; research
   * 87 §8) and the ammo box's fade (`DAT_003dc380` = 0, D:L57489; research 322 R322.4): the HUD's clock from 0 at the
   * level's first drawn frame, and no round started yet (`roundBegun`). The message window starts empty (the review's
   * F4): the level's init allocates a new HUD (D:L50903-50908, its init at D:L50912) and re-inits the window
   * (`FUN_002b6fc0(0x4366a0, ...)` D:L57423, which zeroes the window's counters +0x454, +0x458, +0x45c, D:L158296-158298,
   * but frees no line); the lines themselves go at the old level's teardown -- `FUN_001eb8c0` D:L50610 ->
   * `FUN_001fcb70` D:L58245, `FUN_002b6de0(0x4366a0)`, which walks the window's list releasing each line (its vtable
   * +8 with 1, read as the deleting destructor) and zeroes the same counters (D:L158146-158162). The port has no
   * teardown call, so the new map's init clears them.
   */
  setBitmaps(bitmaps: HudBitmaps | null | undefined): void {
    this.base = bitmaps ?? null;
    this.build();
    if (!bitmaps) return;
    this.posts = [];
    this.sinceOn = 0; this.fadeFrom = 0; this.roundFrom = 0; this.roundBegun = false; this.lastRound = 0;
  }

  /**
   * PF-26 (PF.R22): bitmaps from beyond the map's HUD libraries -- the round screens' `multplay_back.tif` and
   * `backsolid.tif` (`./roundScreens` `ROUND_SCREEN_BITMAPS`, UIMP's copies) -- kept across maps and drawn with the HUD's
   * own (which win a name both hold) once a map's are set. Without them the screens draw their colour-exact shapes.
   */
  addBitmaps(extra: HudBitmaps): void {
    this.extra = { ...this.extra, ...extra };
    if (this.base) this.build();
  }

  private base: HudBitmaps | null = null;
  private extra: HudBitmaps = {};

  private build(): void {
    this.clear();
    if (!this.base) return;
    const bitmaps: HudBitmaps = { ...this.extra, ...this.base };
    // The draw order: the round screens' background and panels, the panels, what sits on them, the compass, the
    // prompt, the text last.
    const names = Object.keys(bitmaps);
    const order = [
      ROUND_SCREEN_BITMAPS.background, ROUND_SCREEN_BITMAPS.panel, 'newweapnbkrnd.tif', WHITE, ...names.filter((n) => !NOT_ICONS.has(n)), 'firemode.tif', 'compass_lo.tif',
      ...names.filter((n) => n.startsWith('action_')), FONT_TEXT_01.texture,
    ];
    const all: Record<string, Rgba> = { ...bitmaps, [WHITE]: { width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) } };
    const drawn = [...new Set([...order, ...names])].filter((n) => all[n]);
    for (const name of drawn) {
      const texture = makeTexture(all[name]!);
      this.textures.push(texture);
      this.maps.set(name, { texture, size: { width: all[name]!.width, height: all[name]!.height } });
    }
    // Each layer: its shapes, then one batch per bitmap in the draw order above. The arsenal's weapon icons beyond the
    // HUD's own (`readHud`'s `weaponIcons`, some forty a map, web sprint 4) get theirs when first drawn (`render`), in
    // their place of the order: a material each is a batch to fill every frame and a program for the walk's warm-up.
    const own = new Set<string>([...HUD_LIBRARIES.HUDW]);
    const stride = drawn.length + 1;
    for (let layer = 0; layer < HUD_LAYERS; layer++) {
      this.addShapes(layer * stride);
      drawn.forEach((name, i) => {
        const order = layer * stride + 1 + i;
        if (NOT_ICONS.has(name) || own.has(name) || !name.endsWith('.tif')) this.addBatch(layer, name, order);
        else this.later.set(`${layer}:${name}`, { layer, name, order });
      });
    }
  }

  /**
   * Extra quads and shapes drawn with the HUD (the tactical map's layer), asked for each frame with the frame's size
   * and the bitmaps' sizes; null or a null answer draws none.
   */
  setOverlay(overlay: HudOverlay | null): void { this.overlay = overlay; }

  /**
   * PAR-48 (research 282 §5; the playtest lane's research 276 §7) -- the spectator switch, the API the pages and the
   * replay's watcher wire. `view` is what a seat that is not a walker viewing himself sees (`HudSpectatorView`: the
   * original's path, the viewed body, the panel's words); null gives the walker's HUD back exactly as it was -- a view
   * never writes the walker's model.
   * - A set-state, not an event: call it as often as wanted (each frame, at any seek); the same view twice changes
   *   nothing. The view is copied, not held.
   * - Drawn whether or not `setVisible` is on: a page with no walker draws a view alone.
   * - The round timer is the HUD's own (`setTimer`) unless the view gives `roundTimer`; the message window, the round
   *   start, the voice element and the scoreboard (`setScoreboard`: SELECT, `FUN_0022be20` tests no seat) are drawn as
   *   for a walker. The help lines' clock starts as a 'spectator' view first arrives, as the view moves from a living
   *   body onto the dead own one (LATER 118 F1: the camera's edge, D:L56631-56645, D:L56754), at a ghost's or a promoted
   *   spectator's first dead view (DEAD_HELP_GHOST_CLOCK_READING) and at `startRound`.
   */
  setSpectator(view: HudSpectatorView | null): void {
    const was = this.model.spectator ?? null, path = view ? view.path ?? 'spectator' : null;
    const wasPath = was ? was.path ?? 'spectator' : null;
    if (path === 'spectator' && wasPath !== 'spectator') this.helpAt = 0;
    // LATER 118 (the review's F1): the edge is the camera's -- last frame's viewed actor alive (`DAT_00408f08`, D:L56754),
    // this frame's the local body, dead (D:L56631-56645, D:L56642 the local test). Onto 'own' from a living body: the
    // walker's own (null), a living watched teammate, a spectator's view; not from a dead watched one (`watchedDead`),
    // and never onto a teammate (alive, not local). A ghost's or a promoted spectator's first dead view, own or
    // teammate, starts it too (DEAD_HELP_GHOST_CLOCK_READING).
    else if (path === 'own' && (wasPath === null || wasPath === 'spectator' || (wasPath === 'teammate' && !was?.watchedDead))) this.helpAt = 0;
    else if (path === 'teammate' && (wasPath === null || wasPath === 'spectator') && DEAD_HELP_GHOST_CLOCK_READING === 'first dead view') this.helpAt = 0;
    this.model.spectator = view
      ? {
        ...view, followed: view.followed ? { ...view.followed } : null, stats: view.stats ? { ...view.stats } : null,
        ...(view.help ? { help: [...view.help] } : {}),
      } : null;
  }

  /**
   * Walking or not. PAR-94c (issue #262): a show restarts nothing -- the original's show of the HUD's parts
   * (`FUN_001f7a90`, D:L56366-56398) posts no line and writes no clock. The fader and the ammo box's fade play from the
   * HUD's clock, which a map's init (`setBitmaps`) zeroes and which runs while the HUD is on; the banner from a round's
   * start (`startRound`, PAR-94d); the message window's lines keep their ages across a show. Was: coming on zeroed
   * the clock, so the waiting room's spawn (PAR-94 B2/B3) played the round start in the launch countdown and a line
   * posted before it (the countdown's) was dropped, its age negative.
   */
  setVisible(on: boolean): void {
    this.on = on;
  }
  /** The map's nav points (`./tacMap`'s `TacData.points` of kind 1): the compass marks them. */
  setNavPoints(points: { name: string; x: number; z: number }[]): void { this.model.navPoints = points; }
  /** The tactical map is open: the HUD and the compass hide (`FUN_001f71c0`); a close brings them back through the fade. */
  setTacMapOpen(open: boolean): void {
    if (!open && this.tacOpen) this.fadeFrom = this.sinceOn;
    this.tacOpen = open;
  }
  /** What the round-start banner says (`DEFAULT_ROUND` until set). */
  setRound(round: RoundInfo): void { this.round = { ...round, objective: round.objective.map((l) => ({ ...l, text: l.text.toUpperCase() })) }; }
  /**
   * A round begins online (the server's `roundStart`, or a join): "STARTING ROUND r OF n" and the objective play from
   * the round's start (`FUN_001fb420` D:L57632-57649), and the message window's earlier lines go, as the MP exit state
   * clears the three windows between rounds (`FUN_00223970` L76084-76086). PAR-94d (research 322 R322.8, D6; reading,
   * pending review): not the fader nor the ammo box's fade -- their one start is the HUD's init for the level
   * (`FUN_001fa360` D:L57476, D:L57489; `setBitmaps`), which a round's start does not re-run: `CMPExitState`'s
   * `FUN_00223680` calls `FUN_002a7d40` (D:L75935; it writes neither) and pops itself (D:L75936), resuming CoreState
   * through its OnPop `FUN_001ecb10`, not its Init `FUN_001ec480` (CoreState's vtable 0x404f60, +0x24 and +0x10). Was:
   * the HUD's clock and the box's fade zeroed here, so both replayed at every round (`ROUND_TWO_FADE_READING`: its
   * capture still owed).
   *
   * PAR-94d F1 (the fresh review): but a new match started in place -- a round no later than the last begun on this
   * level -- restarts the level's fades, as `setBitmaps` does (no bitmaps; the message window empties below, as at every
   * round). The port's room starts its next match on the same map (`room.ts` `startRound(st.matchOver)`; research 309
   * §7.1 item 1); the original's goes back through the menu and a new load: `CMPExitState` on game state 1 pops and
   * switches to the menu state 0x408538 (D:L75915-75917; the host's `CloseAndSwitch`, `FUN_00281a70` D:L128127-128128),
   * and CoreState 0x4085d0 is entered only from the load state (D:L55753), whose Init runs the HUD's init again. The first
   * match's round 1 after a map's init is not one (`roundBegun` false: the init's fades already run).
   */
  startRound(round: RoundInfo): void {
    this.model.c4FuseBar = null;
    if (this.roundBegun && round.round <= this.lastRound) { this.sinceOn = 0; this.fadeFrom = 0; }
    this.lastRound = round.round;
    this.setRound(round);
    this.roundFrom = this.sinceOn;
    this.posts = [];
    this.helpAt = 0;                                     // PAR-48: the help lines' clock (`FUN_001fb420` D:L57663)
    // KEYBOARD-WHISPER: `FUN_001fb420` clears the text line (`FUN_002ca0b0(0x437540)` D:L57631: the text set to none,
    // +0xa0 and +0x13c zeroed and the box's alpha set, D:L169276-169286) -- gone at once, no fade out.
    this.lineText = ''; this.lineBox = 0; this.lineInk = 0; this.model.textLine = null;
    // NU-9 (c): the round's reset clears the eight tags' texts (`FUN_002271d0` D:L77486-77501) and its start hides the two
    // sprites (`FUN_00227240` D:L77506-77519), back to back online (D:L149757-149758); the next frame's tags come anew.
    this.model.teamTags = null;
    // AD-7 (C93): the round's reset puts the voice icons' alphas back to 0 (`FUN_001fb420` D:L57618 -> `FUN_00238710`
    // D:L85621 -> `FUN_00238d00` D:L85737-85748).
    this.voiceIconAlpha = VOICE_ICON_RAMP.from; this.voiceTalkAlpha = VOICE_ICON_RAMP.from;
    this.roundBegun = true;                              // PAR-94c: the banner is this round's (`FUN_001fb420` D:L57632-57648)
    this.starts++;
  }
  setAmmo(rounds: number, capacity: number, spare: number, reloading = false, magsHidden = false): void {
    Object.assign(this.model, { rounds, capacity, spare, reloading, magsHidden });   // NET-REFILL N4: `magsHidden`
  }
  setFireMode(mode: FireMode): void { this.model.fireMode = mode; this.model.fireModeIcon = null; }
  /** M4: a launcher's round mode -- the round's icon in the first fire-mode cell (`HudModel.fireModeIcon`); null clears it. */
  setFireModeIcon(icon: string | null): void { this.model.fireModeIcon = icon ? icon.toLowerCase() : null; }
  /** The fire-mode row shown or not (`HudModel.fireModeRow`): off while a throwable, a charge or the Detonator is up. */
  setFireModeRow(on: boolean): void { this.model.fireModeRow = on; }
  /** The weapon's HUDW icon by file name (`m4carbine_icon.tif` for the M4A1). */
  setWeaponIcon(icon: string): void { this.model.weaponIcon = icon.toLowerCase(); }
  /** The camera's heading, degrees (`fly.pose().yaw`). */
  setHeading(yaw: number): void { this.model.yaw = yaw; }
  /**
   * A context prompt by kind, or none; `allowed` false greys a map action's (`MAP_ACTION_PROMPTS`, `ACTION_COLOURS.grey`)
   * and no other (LkPaioX5: `FUN_0021f210` D:L73957-73959).
   */
  setAction(action: ActionPrompt | null, allowed = true): void {
    this.manual = action;
    this.manualAllowed = allowed;
    this.showPrompt();
  }
  /**
   * The traversal's ledge prompt: the game's climb icon while visible, unless a caller's prompt or the picker's list
   * holds the slot (LATER 636: the list's own climb entry is then the climb drawn).
   */
  setClimbPrompt(state: ClimbPrompt | null): void {
    this.climbing = state?.visible === true;
    this.showPrompt();
  }
  /**
   * The map's own action in reach (`./mapActions`: a door's node within its `range`), or none; `allowed` as `setAction`'s.
   * LkPaioX5 part 2 (a): or the picker's whole list (`./matchActions` `prompt`), its head the prompt, list[1] and list[2]
   * drawn beside it (`HudModel.actionSides`), each entry's own `allowed`.
   */
  setNearbyAction(action: ActionFeed, allowed = true): void {
    if (Array.isArray(action)) {
      const list = action as readonly ActionEntry[];
      this.nearbyList = list;
      this.nearby = list[0]?.prompt ?? null;
      this.nearbyAllowed = list[0]?.allowed ?? true;
    } else {
      this.nearbyList = [];
      this.nearby = action as ActionPrompt | null;
      this.nearbyAllowed = allowed;
    }
    this.showPrompt();
  }
  private manualAllowed = true;
  private nearbyAllowed = true;
  /**
   * The prompt shown -- a caller's `setAction` over the picker's list's head (`setNearbyAction`'s list) over the
   * traversal's ledge over the map's own single action -- and its colour: its record's (`ACTION_PROMPT_COLOUR`), grey for
   * a map action the player may not use.
   *
   * LATER 636 (reading, pending review): with the picker's list fed, its head is the head -- the original keeps one list
   * (`DAT_0040d558`), whose head `FUN_0021f210` draws (D:L73945-73950) and `FUN_0021d9d0` fires (D:L73398-73401); the
   * climb is one of its entries (bit 0x4), so the climb feed draws only for a page that feeds no list. Was: the climb
   * feed over the list's head, so a bomb carrier at a site with a ledge in reach saw CLIMB while the press planted.
   */
  private showPrompt(): void {
    const listed = this.nearbyList.length > 0;
    const climb = this.climbing && !listed;
    const action = this.manual ?? (climb ? 'climb' : this.nearby);
    const allowed = this.manual ? this.manualAllowed : climb ? true : this.nearbyAllowed;
    const colour = (p: ActionPrompt, ok: boolean): keyof typeof ACTION_COLOURS => (!ok && MAP_ACTION_PROMPTS.has(p) ? 'grey' : ACTION_PROMPT_COLOUR[p]);
    this.model.action = action;
    if (action) this.model.actionColour = colour(action, allowed);
    // LkPaioX5 part 2 (a): list[1] and list[2] beside the head (`FUN_0021f210` D:L73987-74000); list[3] on hidden (D:L74028).
    // Review fold F2: relative to the head shown -- the list turned to it (as the d-pad's turn would, `FUN_00595320`), the
    // next two, no prompt twice; a head the list does not hold (a caller's or the climb feed's alone) has none.
    const at = action ? this.nearbyList.findIndex((e) => e.prompt === action) : -1;
    const turned = at < 0 ? [] : [...this.nearbyList.slice(at), ...this.nearbyList.slice(0, at)];
    const sides: ActionEntry[] = [];
    for (const e of turned.slice(1)) if (sides.length < 2 && e.prompt !== action && !sides.some((x) => x.prompt === e.prompt)) sides.push(e);
    this.model.actionSides = sides.map((e) => ({ prompt: e.prompt, colour: colour(e.prompt, e.allowed ?? true) }));
    // LkPaioX5 part 2 (b): the head's caption -- the list's own entry when the head is the list's, else the record's.
    const head: ActionEntry | null = !action ? null : !this.manual && at >= 0 ? this.nearbyList[at]! : { prompt: action, allowed };
    this.model.actionCaption = head ? actionCaptionOf(head, this.locCaptions) : null;
    // A record new to the list, or one gone, is `FUN_0021f850`'s rebuild: every listed record starts at 0
    // (`FUN_002209c0` D:L74589) and the rebuild's frame steps it once (`FUN_0021f210`, `ACTION_ICON_FADE`); a turn of the
    // same records (`FUN_00595320`) keeps their alphas.
    const shown = action ? [action, ...sides.map((e) => e.prompt)] : [];
    const set = [...new Set([...(action ? [action] : []), ...this.nearbyList.map((e) => e.prompt)])].sort().join(',');
    if (set !== this.actionSet) {
      this.actionSet = set;
      this.actionAlpha.clear();
      shown.forEach((p, i) => this.actionAlpha.set(p, i === 0 ? ACTION_ICON_FADE.primary.step : ACTION_ICON_FADE.side.step));
    }
  }
  /**
   * LkPaioX5 part 2 (b): HudCLOC's strings by id and by message name (`./tauntData` `tauntCaptions`, the page's sound data's
   * `taunts.captions`), for the bomb's caption (`ACTION_BOMB_CAPTION_IDS`); null, none.
   */
  setLocCaptions(captions: Readonly<Record<string, string>> | null): void {
    this.locCaptions = captions;
    this.showPrompt();
  }
  /** LkPaioX5 part 2 (a): the alphas `frames` game frames on, each slot's step held at its cap (`FUN_003642d0`). */
  private stepActionAlpha(frames: number): void {
    const shown = this.model.action ? [this.model.action, ...(this.model.actionSides ?? []).map((e) => e.prompt)] : [];
    shown.forEach((p, i) => {
      const f = i === 0 ? ACTION_ICON_FADE.primary : ACTION_ICON_FADE.side;
      this.actionAlpha.set(p, Math.min((this.actionAlpha.get(p) ?? 0) + f.step * frames, f.cap, 128));
    });
  }
  /** The slots' alphas now, 0..1: the head, list[1], list[2] (`HudTiming.actionAlpha`). */
  private actionAlphas(): number[] {
    const shown = this.model.action ? [this.model.action, ...(this.model.actionSides ?? []).map((e) => e.prompt)] : [];
    return shown.map((p, i) => {
      const f = i === 0 ? ACTION_ICON_FADE.primary : ACTION_ICON_FADE.side;
      return Math.min(this.actionAlpha.get(p) ?? 0, f.cap) / 128;
    });
  }
  /** The stance: a change shows its word (`STANCE_FADE`). */
  setStance(stance: HudStance): void {
    if (stance !== this.model.stance) this.stanceAlpha = STANCE_FADE.start;
    this.model.stance = stance;
  }
  /** The view's magnification (the zoom's `magnification()`): the readout and the scope's range over 1.01. */
  /** The zoom readout's value (`./zoom` `hudZoom`) and whether it is the binoculars' (the RANGE line's place). */
  setZoom(zoom: number, binoculars = false): void { if (!this.frozen) { this.model.zoom = zoom; this.model.binoculars = binoculars; } }
  /** SELECT (Tab) held or let go: the scoreboard shows while it is held (research 87 §12). */
  setScoreboard(held: boolean): void {
    // ONL-19 (research 269 §5.1): the details are built at the open only (D:L79676-79866) and kept until the close (D:L79529)
    if (held && !this.model.scoreboard) this.model.scoreboardDetails = this.detailsOf?.() ?? null;
    else if (!held) this.model.scoreboardDetails = null;
    this.model.scoreboard = held;
  }
  /** MATCH-01: the START menu opened or closed (`./startMenu`; the hide-all `FUN_001f77c0`, the show `FUN_001f7a90`). */
  setStartMenu(open: boolean): void { this.model.startMenu = open; }
  /** MATCH-01: the START menu's SPECTATOR HUD on or off (`DAT_003dc3e0`; D:L56803-56827). */
  setSpectatorHud(on: boolean): void { this.model.spectatorHud = on; }
  /** The page's presentation (`main`'s `fit`): the Modern one raises the scoreboard by `MODERN_SCOREBOARD_LIFT`. */
  setPresentation(presentation: Presentation): void { this.presentation = presentation; }
  /** The game the scoreboard names: the viewer's map, and its game type (`./mapOrder`'s `mode`). */
  setGame(name: string, type: string): void { this.model.game = { name, type: gameCaption(type) }; }   // HX-5: EXTRACT_CAPTION_READING
  /** ONL-19: the online GAME DETAILS' source (`./scoreboard` `sessionGameDetails` / `servedRoomDetails`); null, the LAN fill. */
  setGameDetails(of: (() => GameDetails | null) | null): void { this.detailsOf = of; }
  /** The round's players for the scoreboard (`net`'s rows with `self`), the spectators' names and the rounds won; null rows: the single SEAL. */
  setScoreRows(rows: ScoreRowInfo[] | null, spectators: string[], wins?: { seal: number; terrorist: number }): void {
    this.model.scoreRows = { rows, spectators, wins };
  }
  /**
   * BOMB-MARKS (`./bombPage` `hudFrame`, once a frame): the bomb carrier's id, or null -- his scoreboard row takes the
   * satchel (`./scoreboard` `SCOREBOARD_SATCHEL_RECT`), for every viewer as the original (OT.R109 as amended).
   */
  setBombCarrier(id: number | null): void { this.model.bombCarrier = id; }
  /**
   * A round's end screen (research 91 §18: ROUND COMPLETE, FINAL ROUND, GAME COMPLETE), or null to take it down. While
   * set it is drawn over everything in this pass and the in-round HUD, the scoreboard and the tactical map give way
   * (`ROUND_SCREEN_HIDES`); the reticle is the page's to hide.
   */
  setRoundScreen(screen: RoundScreen | null): void { this.model.roundScreen = screen; }
  /**
   * NU-9 N1 (research 327 §5): the walker's own name and clan tag (`ownHudName`), apart -- the info box draws
   * "[tag] name", the scoreboard's fallback row the name alone (327 F4). Set once a frame by the pages; '' for none.
   */
  setPlayerName(name: string, tag = ''): void { this.model.name = name; this.model.tag = tag; }
  setHealth(health: number): void { this.model.health = health; }
  setTimer(seconds: number): void { this.model.timer = seconds; }
  /** XR-06: the objective's compass marks (`./bombPage` `hudFrame`), replacing the last; an empty list clears them. */
  setExtraMarks(marks: readonly CompassMark[]): void { this.model.extraMarks = marks.map((m) => ({ ...m })); }
  /** HX-5: the hostages' and the zones' compass marks (`NetPage.hostageMarks`), replacing the last; the bomb's untouched. */
  setHostageMarks(marks: readonly CompassMark[]): void { this.model.hostageMarks = marks.map((m) => ({ ...m })); }
  /** MATCH-05: the voice element's view (`./hudVoice` `voiceHudFrame`), or null: not drawn. */
  setVoice(view: VoiceElementView | null): void { this.model.voice = view ? { ...view } : null; }
  /**
   * NU-9 (c) T3 (research 329 §5 T3): the over-head tags this frame (`./hudTags` `teamTags`), replacing the last, copied;
   * null: none. Laid out and drawn by `hudLayout` (`teamTagLayout`).
   */
  setTeamTags(view: TeamTagsView | null): void {
    this.model.teamTags = view ? {
      points: view.points.map((p) => ({ ...p })), holder: view.holder, self: view.self, ...(view.scale === undefined ? {} : { scale: view.scale }),
    } : null;
  }
  /**
   * NU-9 (c) T4: the TEAMMATE NAMES option (`DISPLAY_MP_TEAM_NAMES`), read once at the match's mount as the HUD's set-up
   * reads it (D:L77558-77559; research 329 §1.8): off hides the name texts only, the talk sprites drawn still.
   * LATER 671 (OT.R101; a browser adaptation): `original`, the "original" look -- SS-2: this browser's Name tags
   * (`./nameTags` `readNameTags`), the card holding only on / off -- the original's tags, `teammateNamesOriginal()`;
   * else the adaptation's.
   */
  setTeammateNames(on: boolean, original = false): void { this.model.teammateNames = on; this.model.teammateNamesOriginal = on && original; }
  /** LATER 671, SS-2: the "original" look as set (`setTeammateNames`); false by default (the adaptation, OT.R101). */
  teammateNamesOriginal(): boolean { return this.model.teammateNamesOriginal === true; }
  /**
   * NU-9 (c) T4: the TEAMMATE NAMES option as set (`setTeammateNames`), on unless set off -- one value for the tags and the
   * reticle's teammate name (`./reticle` `ReticleTargetInputs.teammateNames`): the reticle's flag `+0x17b64` is the tags'
   * part's `+0x5e4` (`+0x17580 + 0x5e4`, research 329 §4.3).
   */
  teammateNamesOn(): boolean { return this.model.teammateNames !== false; }
  /** NU-9 (c) T3: the Chat menu open or closed (the command menu, control state 2): open hides the tags' texts (D:L56617-56623). */
  setCommandMenu(open: boolean): void { this.model.commandMenu = open; }
  /** MATCH-05: the talk mark (`./hudVoice` `voiceHudFrame`), replacing the last; an empty list clears it. */
  setTalkMarks(marks: readonly CompassMark[]): void { this.model.talkMarks = marks.map((m) => ({ ...m })); }
  /** MATCH-05: how many spectators the scoreboard's rows name (the room's `scores`): the voice count on 10, without a layout. */
  spectatorCount(): number { return this.model.scoreRows.spectators.length; }
  /** XR-06: the bomb's fuse in the round timer's place (DEFUSE_TIMER_LAYOUT_READING); null gives the slot back. */
  setDefuseTimer(seconds: number | null): void { this.model.defuseTimer = seconds; }
  /** Presentation only: replace the view each frame; null removes it without a fade or independent clock. */
  setC4FuseBar(view: { fill: number } | null): void { this.model.c4FuseBar = view ? { ...view } : null; }

  /**
   * PB-8: the bomb's hold bar (`./bombPage` `hudFrame`, once a frame): the fill's share while a hold plays, drawn live;
   * null when none, and a bar drawn live starts its fade from the fill's alpha (`HOLD_BAR_FADE`, run by `step`).
   */
  setHoldBar(fill: number | null): void {
    if (fill !== null) this.model.holdBar = { fill };
    else if (this.model.holdBar && this.model.holdBar.fade === undefined) {
      this.model.holdBar = { fill: this.model.holdBar.fill, fade: HOLD_BAR_FADE.from };
    }
  }
  setRange(metres: number | null): void { this.model.range = metres; }
  /** HUD-ALIVE B: the info box's number (`infoNumberText`): the consoles' count and the session master; null, none (no room). */
  setInfoNumber(count: number | null, master: boolean): void { this.model.infoNumber = count === null ? null : { count, master }; }
  /** HUD-ALIVE C (`./rangeReadout`, a browser adaptation): this browser's range readout on -- the range in the count's spot. */
  setRangeReadout(on: boolean): void { this.model.rangeReadout = on; }
  /**
   * A message on the message window (the round start's), as the game posts one: in over 0.36 s, out 7 s later, the
   * newest at the bottom (research 87 §14 lists what the game posts). TAUNT-WRAP (research 87 §14.1; reading, pending
   * review): a line wider than the window's 297 is broken at a space into lines of the window, as `FUN_002b6530` posts
   * it (`./hudMessagePanel` `wrapMessageLine`) -- every post, the kill feed's, the chat's and the taunts' alike; each piece
   * keeps its line's scale and colour and counts as a line of the window (`capLines`). The wrap is measured at the
   * original's scale (`messageMeasureScale`): a line's `post`, absent the window's own; a text given with a `scale` is a
   * script's post (`./roundAudio`'s and the bomb's lines) at that scale, drawn at it and measured at it x 1.1429.
   */
  postMessage(lines: string | BannerLine[], scale?: number): void {
    const list = (typeof lines === 'string' ? [{ text: lines, scale: scale ?? MESSAGE_SCALE }] : lines).flatMap((l) =>
      typeof lines === 'string' && scale !== undefined
        ? wrapMessageLine(l.text, messageMeasureScale(scale)).map((text) => ({ ...l, text }))
        : windowLines(l));
    if (list.length > 0) this.posts.push({ at: this.sinceOn, lines: list });   // a break at 0 posts nothing (D:L158034)
  }
  /**
   * RV-1 (the playtest lane's dev read, `./devSeen`, as PAR-41's accessors): the message window's posts held now, oldest
   * first -- each one's lines' text (newline-joined) and its age on the HUD's own clock (`sinceOn` less its `at`, s),
   * copied at the call. Read only; a browser adaptation, changing nothing drawn.
   */
  postsForDev(): { text: string; age: number }[] {
    return this.posts.map((p) => ({ text: p.lines.map((l) => plainBotText(l.text)).join('\n'), age: this.sinceOn - p.at }));
  }
  /**
   * OT.R59 (RECONNECT-GHOST (B), a labelled adaptation): a line the page holds on the message window -- drawn after the
   * posts at full alpha, for as long as it is set (`RECONNECT_GHOST_LINE_ADAPTATION`); null lets it go.
   */
  setNotice(text: string | null): void { this.notice = text; }
  private notice: string | null = null;
  /** A line on the event banner for `seconds`. */
  flashMessage(text: string, seconds = 3): void {
    this.model.message = text.toUpperCase();
    this.messageLeft = seconds;
  }

  /**
   * The page's once-a-frame feed from the live state: the magazine (`fire.state().magazine`), the heading
   * (`fly.pose().yaw`), the stance (`walk.stance()`, the stance taken: LATER 403), the range, and the traversal's ledge
   * prompt when it has one.
   */
  feed(src: HudSources): void {
    if (this.frozen) return;
    const m = src.magazine;
    this.setAmmo(m.rounds, m.capacity, m.spare, m.reloading, m.magsHidden === true);
    this.setHeading(src.yaw);
    if (src.stance !== undefined) this.setStance(src.stance);
    if (src.stanceTaken !== undefined) { this.stanceAlpha = STANCE_FADE.start; this.model.stance = src.stanceTaken; }   // LATER 414
    if (src.climb !== undefined) this.setClimbPrompt(src.climb);
    if (src.nearby !== undefined) this.setNearbyAction(src.nearby);
    if (src.position !== undefined) this.model.position = src.position;
    if (src.range !== undefined) this.setRange(src.range);
    if (src.fireMode !== undefined) this.setFireMode(src.fireMode);
  }

  /** Several inputs at once (the test hook's `setHud`). */
  patch(p: HudPatch): void {
    if (p.fireMode) this.setFireMode(p.fireMode);
    if (p.weaponIcon) this.setWeaponIcon(p.weaponIcon);
    if (p.action !== undefined) this.setAction(p.action);
    if (p.climb !== undefined) this.setClimbPrompt(p.climb);
    if (p.message !== undefined) { if (p.message === null) this.model.message = null; else this.flashMessage(p.message, 3600); }
    if (p.zoom !== undefined) this.model.zoom = p.zoom;
    if (p.name !== undefined) this.setPlayerName(p.name);
    if (p.health !== undefined) this.setHealth(p.health);
    if (p.timer !== undefined) this.setTimer(p.timer);
    if (p.range !== undefined) this.setRange(p.range);
    if (p.stance !== undefined) this.setStance(p.stance);
    if (p.yaw !== undefined) this.setHeading(p.yaw);
    if (p.scoreboard !== undefined) this.setScoreboard(p.scoreboard);
    if (p.rounds !== undefined) this.model.rounds = p.rounds;
    if (p.capacity !== undefined) this.model.capacity = p.capacity;
    if (p.spare !== undefined) this.model.spare = p.spare;
    if (p.frozen !== undefined) this.frozen = p.frozen;
    if (p.settled) {
      // Past the round start: no fader, no banner, the ammo box in.
      this.sinceOn = 60;
      this.fadeFrom = 0; this.roundFrom = 0;
      this.pulse = 0;
      this.model.banner = []; this.model.fader = 0;
      this.posts = [];
    }
    if (p.roundTime !== undefined) {
      this.sinceOn = p.roundTime; this.roundFrom = 0;    // PAR-94d: the level's and the round's clocks together
      this.roundBegun = true;                            // PAR-94c: the hook's round start `roundTime` s in
      const start = roundStartAt(this.sinceOn, this.round);
      this.model.banner = start.banner; this.model.fader = start.fader;
    }
  }

  /** The fades now. */
  timing(): HudTiming {
    const t = this.sinceOn - this.fadeFrom - SPAWN_FADE.hold;
    return {
      fade: Math.min(1, Math.max(0, t / SPAWN_FADE.ramp)), stance: this.stanceAlpha, pulse: this.pulse, marks: this.markPulse / 128,
      help: helpAlpha(this.helpAt), voice: { icon: this.voiceIconAlpha / 128, talk: this.voiceTalkAlpha / 128 },   // AD-7
      actionAlpha: this.actionAlphas(),                                                                             // LkPaioX5 (a)
    };
  }

  /** What is drawn and where, in the drawing buffer's pixels (y down) of the last frame. */
  state(): HudView {
    const visible = (this.on || !!this.model.spectator) && this.batches.size > 0 && this.frame.height > 0;   // PAR-48: a view draws alone
    const timing = this.timing();
    const laid = visible ? hudLayout(this.frame, this.model, this.sizes(), timing) : null;
    const rects = laid ? laid.rects : {};
    if (visible && this.model.roundScreen) {
      const q = roundScreenLayout(this.model.roundScreen, this.frame, this.sizes()).quads;
      for (const e of ROUND_SCREEN_HIDES) delete rects[e];
      // The screen covers the frame (its backdrop).
      if (q.length) rects.roundScreen = { x: 0, y: 0, width: this.frame.width, height: this.frame.height };
    } else if (visible && this.model.scoreboard && !this.tacOpen) {
      const q = this.board().quads;
      const x0 = Math.min(...q.map((b) => b.x - b.w / 2)), y0 = Math.min(...q.map((b) => b.y - b.h / 2));
      const x1 = Math.max(...q.map((b) => b.x + b.w / 2)), y1 = Math.max(...q.map((b) => b.y + b.h / 2));
      if (q.length) rects.scoreboard = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
      for (const e of SCOREBOARD_HIDES) delete rects[e];
    }
    // LATER 117: the icon's bitmap while it is drawn (after the round screen's and the board's hides).
    const icon = rects.icon && laid ? laid.quads.find((q) => q.element === 'icon')?.texture ?? null : null;
    return { visible, frame: { ...this.frame }, model: { ...this.model }, timing, rects, icon };
  }

  /**
   * Steps the fades by `dt` seconds (called by `render` from the frame clock). PAR-34 (research 252 s3; ACT.R8): `real`,
   * the frame's real seconds (default `dt`), is what the round's clock counts -- `sinceOn`, zeroed at the map's init
   * (`setBitmaps`), on which the fader, the ammo box's fade, the message window's lines and (from `roundFrom`, the
   * round's start: PAR-94d; was: `sinceOn` zeroed there) the round start's banner are scheduled -- so below 10 fps it
   * keeps the room's round time. The animations (the stance fade, the pulses, the
   * help lines, the event banner's seconds, the hold bar's fade) are presentation and keep the clamped `dt`.
   */
  step(dt: number, real = dt): void {
    if (this.on || this.model.spectator) this.sinceOn += real;   // PAR-48: a spectator's round start and messages run too
    this.helpAt += dt;
    // PAR-94d: the banner on the round's clock, the fader on the level's (one fade a level, R322.8).
    const start = roundStartAt(this.sinceOn - this.roundFrom, this.round), fader = Math.max(0, 1 - this.sinceOn / ROUND_START.fader);
    this.posts = this.posts.filter((m) => messageAlpha(this.sinceOn - m.at) !== null);
    const posted = this.posts.map((m) => ({ lines: m.lines, alpha: messageAlpha(this.sinceOn - m.at)! }));
    // OT.R59: held; wrapped as a post is (TAUNT-WRAP), so it stays in the window too.
    if (this.notice) posted.push({ lines: windowLines({ text: this.notice, scale: MESSAGE_SCALE }), alpha: 1 });
    // PAR-94c: the round start's banner once a round has started (`roundBegun`). PAR-94d (research 322 D7): a spectator's
    // view too -- `FUN_001fb420` posts it on every console at a round's start (D:L57632-57649; no seat tested), and the
    // page starts a spectator's round as a player's (`NetPage.roundBanner`). Was (PAR-48): a spectator's view drew the
    // banner off the HUD's own clock with no round begun, so a map's init (`setBitmaps`) replayed the last round's.
    const banner = this.roundBegun ? start.banner : [];
    this.model.banner = capLines([...banner, ...posted]);
    this.model.fader = fader;
    this.stanceAlpha = Math.max(0, this.stanceAlpha - STANCE_FADE.perSecond * dt);
    // HX-5: the marks' pulse, as the compass's update moves it (D:L68043-68050): up, then down, clamped at each end.
    const M = OBJECTIVE_MARK_PULSE_READING;
    this.markPulse += M.rate * dt * (this.markPulseDown ? -1 : 1);
    if (this.markPulse < M.min) { this.markPulse = M.min; this.markPulseDown = false; } else if (this.markPulse > M.max) { this.markPulse = M.max; this.markPulseDown = true; }
    // AD-7 (C93): the voice element's update steps each icon on a frame it has a texture (`FUN_002393f0` D:L85925-85939,
    // `FUN_00239250` D:L85867-85881); a frame without one hides it and holds its alpha. The update runs before the
    // scoreboard's hide (D:L56758, D:L56811), so the board up does not stop it. The clamped `dt`, as the other animations.
    // VOICE_UNNAMED_HOLDER_READING (research 227 §2.8): while another holds the floor and no slot names him, the original
    // returns before the icons' updates (`FUN_00238ac0` D:L85679-85684) and holds them; the port still steps the busy icon.
    const voice = this.model.voice;
    if (voice && dt > 0) {
      const frames = dt / GAME_FRAME_DT;
      if (voice.icon) this.voiceIconAlpha = voiceIconStep(this.voiceIconAlpha, frames);
      if (voice.talk) this.voiceTalkAlpha = voiceIconStep(this.voiceTalkAlpha, frames);
    }
    if (this.model.action && dt > 0) this.stepActionAlpha(dt / GAME_FRAME_DT);   // LkPaioX5 (a): ACTION_ICON_FADE, a frame's step
    if (this.model.action) {
      this.pulse += (this.pulseUp ? 1 : -1) * ACTION_PULSE_RATE * dt;
      if (this.pulse >= 1) { this.pulse = 1; this.pulseUp = false; }
      if (this.pulse <= 0) { this.pulse = 0; this.pulseUp = true; }
    } else { this.pulse = 0; this.pulseUp = true; }
    if (this.model.message) {
      this.messageLeft -= dt;
      if (this.messageLeft <= 0) this.model.message = null;
    }
    // KEYBOARD-WHISPER: the text line's fade (`FUN_002c9e90` D:L169201-169254), on the clamped `dt` as the other animations.
    const TL = TEXT_LINE_LAYOUT, has = this.lineText.length > 0;
    this.lineBox = has ? Math.min(TL.boxAlpha, this.lineBox + dt * TL.boxRate) : Math.max(0, this.lineBox - dt * TL.boxRate);
    this.lineInk = has ? Math.min(TL.inkAlpha, this.lineInk + dt * TL.inkRate) : Math.max(0, this.lineInk - dt * TL.inkRate);
    this.model.textLine = has || this.lineBox > 0 || this.lineInk > 0 ? { text: this.lineText, box: this.lineBox, ink: this.lineInk } : null;
    // PB-8: the hold bar's fade (`HOLD_BAR_FADE`): hidden once its alpha goes under 0 (D:L74450-74454).
    const bar = this.model.holdBar;
    if (bar && bar.fade !== undefined) {
      const fade = bar.fade - HOLD_BAR_FADE.perSecond * dt;
      this.model.holdBar = fade < 0 ? null : { fill: bar.fill, fade };
    }
  }

  /** The pass's scene and camera, for the page's warm-up (`ViewerRenderer.prepare`): its programs linked before the walk. */
  warmTarget(): { scene: Scene; camera: OrthographicCamera } { return { scene: this.scene, camera: this.camera }; }

  /** Draws the HUD over whatever the renderer last drew: nothing is cleared. */
  render(renderer: HudRenderer): void {
    const now = performance.now() / 1000;
    const real = this.last < 0 ? 0 : Math.max(0, now - this.last);   // PAR-34: the round's clock counts it; the animations the 0.1 s clamp
    this.step(Math.min(0.1, real), real);
    this.last = now;
    renderer.getDrawingBufferSize(this.size);
    this.frame = { width: this.size.x, height: this.size.y };
    if ((!this.on && !this.model.spectator) || this.batches.size === 0) return;   // PAR-48: a view draws alone
    this.sampling.apply(this.textures);
    const { width, height } = this.frame;
    this.camera.left = 0; this.camera.right = width; this.camera.top = 0; this.camera.bottom = height;
    this.camera.updateProjectionMatrix();
    const { quads: all, tris } = hudPass(this.frame, this.model, this.sizes(), this.timing(), this.tacOpen, this.overlay, this.presentation);
    const byKey = new Map<string, HudQuad[]>();
    for (const q of all) {
      const key = `${q.layer ?? 0}:${q.texture}`;
      const list = byKey.get(key);
      if (list) list.push(q); else byKey.set(key, [q]);
    }
    const half = GS_SAMPLE_OFFSET * (height / PS2_H);
    for (const key of byKey.keys()) {
      const later = this.later.get(key);
      if (later) { this.later.delete(key); this.addBatch(later.layer, later.name, later.order); }
    }
    for (const [key, batch] of this.batches) this.fill(batch, byKey.get(key) ?? [], half);
    this.shapes.forEach((shapes, layer) => this.fillShapes(shapes, tris.filter((t) => t.layer === layer)));
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    try { renderer.render(this.scene, this.camera); } finally { renderer.autoClear = autoClear; }
  }

  /** The scoreboard's quads and shapes on the last frame's size. */
  private board(): ReturnType<typeof scoreboardLayout> { return boardLayout(this.frame, this.model, this.sizes(), this.presentation); }

  /** Each bitmap's texel size, for the layouts. */
  sizes(): Record<string, { width: number; height: number }> {
    const out: Record<string, { width: number; height: number }> = {};
    for (const [name, m] of this.maps) out[name] = m.size;
    return out;
  }

  private fillShapes(shapes: Shapes, tris: HudTri[]): void {
    if (tris.length > shapes.capacity) {
      const capacity = Math.max(tris.length, shapes.capacity * 2);
      const geometry = triGeometry(capacity);
      shapes.mesh.geometry = geometry;
      shapes.geometry.dispose();
      shapes.geometry = geometry;
      shapes.capacity = capacity;
      shapes.sent = false;
    }
    const pos = shapes.geometry.getAttribute('position') as BufferAttribute;
    const col = shapes.geometry.getAttribute('color') as BufferAttribute;
    const P = pos.array as Float32Array, C = col.array as Float32Array;
    // CPS: written as before, each slot through `put`; flagged only on a change, a new count or a fresh geometry.
    let changed = !shapes.sent || shapes.count !== tris.length;
    tris.forEach((t, i) => {
      for (let k = 0; k < 3; k++) {
        const n = i * 3 + k;
        if (put(P, n * 3, t.p[k * 2]!)) changed = true;
        if (put(P, n * 3 + 1, t.p[k * 2 + 1]!)) changed = true;
        if (put(P, n * 3 + 2, 0)) changed = true;
        for (let j = 0; j < 4; j++) if (put(C, n * 4 + j, t.rgba[j]!)) changed = true;
      }
    });
    if (changed) { pos.needsUpdate = true; col.needsUpdate = true; shapes.sent = true; }
    shapes.count = tris.length;
    shapes.geometry.setDrawRange(0, tris.length * 3);
    shapes.mesh.visible = tris.length > 0;
  }

  private addShapes(order: number): void {
    const material = new MeshBasicNodeMaterial();
    material.name = 'hud shapes';
    material.vertexColors = false;
    material.colorNode = vec4(vertexColor()).clamp(0, 1);
    material.transparent = true;
    material.depthTest = false;
    material.depthWrite = false;
    material.side = DoubleSide;
    material.fog = false;
    material.toneMapped = false;
    this.materials.push(material);
    const capacity = 64;
    const geometry = triGeometry(capacity);
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    mesh.visible = false;
    this.scene.add(mesh);
    this.shapes.push({ mesh, geometry, capacity, sent: false, count: 0 });
  }

  private fill(batch: Batch, quads: HudQuad[], half: number): void {
    if (quads.length > batch.capacity) this.grow(batch, quads.length);
    const pos = batch.geometry.getAttribute('position') as BufferAttribute;
    const tex = batch.geometry.getAttribute('uv') as BufferAttribute;
    const col = batch.geometry.getAttribute('color') as BufferAttribute;
    const P = pos.array as Float32Array, T = tex.array as Float32Array, C = col.array as Float32Array;
    const { width, height } = batch.size;
    // CPS: written as before, each slot through `put`; flagged only on a change, a new count or a fresh geometry.
    let changed = !batch.sent || batch.count !== quads.length;
    quads.forEach((q, i) => {
      if (this.sampling.settings.enabled && this.sampling.settings.mode === 'integer' && q.texture !== WHITE) {
        const sourceW = Math.abs(q.u1-q.u0), sourceH = Math.abs(q.v1-q.v0);
        const scaleX = Math.abs(q.w)/sourceW, scaleY = Math.abs(q.h)/sourceH;
        // Letterbox uniformly scaled bitmap content only. Layout fills (including the health bar,
        // fader and stretched panels) must retain their full coverage, independent of sampling.
        if (sourceW > 0 && sourceH > 0 && Math.abs(scaleX-scaleY) <= 1e-6*Math.max(scaleX, scaleY)) {
          const fit = integerFit(sourceW, sourceH, Math.abs(q.w), Math.abs(q.h), this.sampling.settings.snap);
          q = {...q, w: Math.sign(q.w)*fit.width, h: Math.sign(q.h)*fit.height};
        }
      }
      const c = Math.cos(q.turn), sn = Math.sin(q.turn);
      // The GS's corner sampling (`GS_SAMPLE_OFFSET`): the screen's (-half, -half) in the quad's own axes, in texels.
      const lx0 = -half * c - half * sn, ly0 = half * sn - half * c;
      const du = (lx0 / q.w) * (q.u1 - q.u0), dv = (ly0 / q.h) * (q.v1 - q.v0);
      const corners: [number, number, number, number][] = [
        [-0.5, -0.5, q.u0, q.v0], [0.5, -0.5, q.u1, q.v0], [0.5, 0.5, q.u1, q.v1], [-0.5, 0.5, q.u0, q.v1],
      ];
      corners.forEach(([cx, cy, u, v], k) => {
        const lx = cx * q.w, ly = cy * q.h, n = i * 4 + k;
        // A clockwise turn on a y-down screen: the game's own (x cos - y sin, x sin + y cos), `FUN_00358730`.
        if (put(P, n * 3, q.x + lx * c - ly * sn)) changed = true;
        if (put(P, n * 3 + 1, q.y + lx * sn + ly * c)) changed = true;
        if (put(P, n * 3 + 2, 0)) changed = true;
        if (put(T, n * 2, (u + du) / width)) changed = true;
        if (put(T, n * 2 + 1, (v + dv) / height)) changed = true;
        if (put(C, n * 4, q.rgba[0])) changed = true;
        if (put(C, n * 4 + 1, q.rgba[1])) changed = true;
        if (put(C, n * 4 + 2, q.rgba[2])) changed = true;
        if (put(C, n * 4 + 3, cx > 0 ? q.alphaRight ?? q.rgba[3] : q.rgba[3])) changed = true;
      });
    });
    if (changed) { pos.needsUpdate = true; tex.needsUpdate = true; col.needsUpdate = true; batch.sent = true; }
    batch.count = quads.length;
    batch.geometry.setDrawRange(0, quads.length * 6);
    batch.mesh.visible = quads.length > 0;
  }

  private grow(batch: Batch, need: number): void {
    const capacity = Math.max(need, batch.capacity * 2);
    const geometry = quadGeometry(capacity);
    batch.mesh.geometry = geometry;
    batch.geometry.dispose();
    batch.geometry = geometry;
    batch.capacity = capacity;
    batch.sent = false;
  }

  private addBatch(layer: number, name: string, order: number): void {
    const { texture: map, size } = this.maps.get(name)!;
    const material = new MeshBasicNodeMaterial();
    material.name = `hud ${layer} ${name}`;
    material.vertexColors = false;
    // The GS's MODULATE: the texel times the vertex colour, alpha included, blended over the frame. The colour may go
    // over 1 (the action pulse's green peak, 160/128: 24 + 80), and the GS clamps.
    material.colorNode = vec4(textureNode(map, uv()).mul(vertexColor())).clamp(0, 1);
    material.transparent = true;
    material.depthTest = false;
    material.depthWrite = false;
    material.side = DoubleSide;
    material.fog = false;
    material.toneMapped = false;
    this.materials.push(material);
    const capacity = name === FONT_TEXT_01.texture ? 96 : 4;
    const geometry = quadGeometry(capacity);
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    mesh.visible = false;
    this.scene.add(mesh);
    this.batches.set(`${layer}:${name}`, { mesh, geometry, capacity, size, sent: false, count: 0 });
  }

  /** ONL-18c: the HUD's textures, materials and buffers freed (the front end's match lets its HUD go at the match's end). */
  dispose(): void { this.clear(); }

  private clear(): void {
    this.sampling.clear();
    for (const b of [...this.batches.values(), ...this.shapes]) { this.scene.remove(b.mesh); b.geometry.dispose(); }
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.batches.clear(); this.later.clear(); this.shapes = []; this.maps.clear();
    this.materials = []; this.textures = [];
  }
}

/**
 * CPS (plan 2026-11-02; product track, the same picture): stores `v` at `a[j]` and says whether the slot's bytes changed
 * -- the float32 the store rounds `v` to (`Math.fround`, the typed array's own conversion) against the slot's, a zero's
 * sign told apart; a NaN always counts as a change.
 */
function put(a: Float32Array, j: number, v: number): boolean {
  const f = Math.fround(v), old = a[j]!;
  if (old === f && (f !== 0 || 1 / old === 1 / f)) return false;
  a[j] = f;
  return true;
}

/** `capacity` triangles' worth of vertices, unindexed. */
function triGeometry(capacity: number): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(capacity * 9), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(capacity * 12), 4));
  geometry.setDrawRange(0, 0);
  return geometry;
}

/** `capacity` quads' worth of vertices (four each) and indices (two triangles each). */
function quadGeometry(capacity: number): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(capacity * 12), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(capacity * 8), 2));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(capacity * 16), 4));
  const index = new Uint16Array(capacity * 6);
  for (let i = 0; i < capacity; i++) index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.setDrawRange(0, 0);
  return geometry;
}
