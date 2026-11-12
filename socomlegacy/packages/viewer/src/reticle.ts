import {
  BufferGeometry, Color, DataTexture, DoubleSide, Float32BufferAttribute, LinearFilter, Mesh, MeshBasicMaterial, NearestFilter,
  OrthographicCamera, PlaneGeometry, RGBAFormat, Scene, UnsignedByteType, Vector2, type BufferAttribute, type Camera, type Texture,
} from 'three';
import type { Rgba } from '@s2u/gs';
import { HUD_COLOURS, taggedName } from './hud';
import { FONT_TEXT_01, layoutText } from './hudFont';
import { UiTextureExperiment } from './experimentalUiTextures';
import type { UiSamplingSettings } from './experimentalUiSampling';
import type { ReticleBitmaps } from './hudBitmaps';
import { plainBotText } from './botPresentation';
import {hdTextures} from './hdTexturePack';
import type { ThreatQuad, ThreatValues } from './threatMarks';

/**
 * The reticle (web sprint 2, W2.4; the spec's W2.R4 and §7): the game's own rifle reticle, `ret_rifle_01.tif` and
 * `ret_rifle_02.tif` off `RUN\COMMON\HUD2_TXR.ZED` (`./hudBitmaps`), drawn as a HUD over the world at the size and
 * place the console frame shows.
 *
 * **The authority is a measurement, not code.** reCOM's `BitmapReticule` (`research/recom/src/Apps/FTS/hud/
 * hud.h:465-520`) names the parts -- `m_reticuleTex[10]` (fixed), `m_floatingreticuleTex[10]` and four floating
 * polys, `m_minsize`/`m_maxsize`, `m_accuracyxtex` -- but `hud_bitmapreticule.cpp` is empty, so the placement was
 * measured on the console frame at spawn, `scripts/parity/refs/console_spawn_slot8.png` (640x448, PCSX2 at the
 * game's native frame), on 2026-09-28:
 *
 * - **The cross.** Yellow-green pixels (min(R, G) - B >= 30 and |R - G| < 30, in the frame's middle third; the
 *   plateau (151, 149, 28)), four connected parts: top x 318-320 y 192-208, bottom x 318-320 y 240-256, left
 *   x 288-303 y 224-226, right x 337-352 y 224-226. Bounding box **x 288-352, y 192-256 (65 x 65 pixels), centre
 *   (320.5, 224.5)** -- the frame's centre (320, 224) within a pixel. Each arm is bright at its outer end
 *   (half-maximum 31 pixels from the centre on all four) and fades out 9-12 pixels from it (fainter than the
 *   threshold): `ret_rifle_02`'s arm (core texel column 30, rows 8-30, white at row 30) at one
 *   PS2 pixel a texel, its outer end outwards, turned a quarter for each arm. `ret_rifle_02` is white; the
 *   yellow-green is the draw's colour, taken so that its core over the local background (34, 28, 22) at the
 *   texel's alpha 175/255 gives the plateau: **(204, 204, 31)** [measured, one pixel's colour].
 * - **The ring and the dot.** The frame darkens 21-26 pixels from the centre on every diagonal and shows one white
 *   pixel (211, 210, 208) at (320, 224) with a grey halo: `ret_rifle_01`'s ring (radius 21-27 texels, black at
 *   alpha <= 44) and its 2x2 dot at texels 31-32, at its own 64 pixels, centred on the same point, untinted.
 * - **Which is which:** `_01` is the fixed part, `_02` the floating one (four arms, the `m_floatingreticule`
 *   polys); `ret_accuracy.tif` (16x16, a yellow diamond) is not in the frame at rest and is not drawn.
 *
 * **Size on other frames.** The PS2 presentation draws 640x448, so a texel is a pixel. The Modern presentation
 * keeps the PS2 pixel's size relative to the frame's height -- a scale of height / 448 -- so the cross keeps the
 * console's proportion on any screen. Nearest-neighbour: the console's HUD is pixel art.
 *
 * **The size and the climb** (research 84 §3-§4, `./accuracy`): SOCOM II's HUD (`BitmapReticule_UpdateAccuracy`
 * 0x215250) pushes each arm's quad out from the centre by the kit's reticle size `kit+0x84c` (`hud+0x44b4`), halved in
 * the third-person view (view state 0), in PS2 pixels -- so the measured rest (outer ends 32 out) is size 0 and an arm's
 * outer end is `32 + size` out; `TargetMin` 1 halved is the console frame's half pixel. The whole reticle, ring and arms,
 * is drawn at the aim point plus the knock's offset (`FUN_00216770`: (320, 224) + `kit+0x18/+0x20`, `+0x1c/+0x24`).
 * There is no `m_minsize`/`m_maxsize` in SOCOM II's HUD: the range is the weapon's, per stance (`TargetMin`/`TargetMax`).
 * That is the cross, sets 0 and 1; the shotguns' set 2 pushes four corner quads out on the diagonals instead, and the
 * launchers' set 3 hides the ring for a sight fixed at the frame's centre with corners at 0.7 (`reticleLayout`,
 * `reticleShape`; research 321 section 2, NU-3a).
 * - **The colour** (`FUN_00215c10`, `FUN_003590e0` on the four arms): (200, 200, 24) at rest -- the measured (204, 204,
 *   31) -- (24, 200, 44) on a teammate, (200, 24, 44) on an identified enemy, (130, 130, 130) while the aimed point is
 *   inside a rocket launcher's selected record's arming distance (R94.16, research 94 §C1.5, as ARMING-GREY corrected it:
 *   class 0x91 or 0xb9 only, `./firearms` `armingGreyOf`; `armingColour`).
 * - **The scope** (view state 5+, `ChangeReticule` 0x213e20 type 5): no ring and no arms; `ret_scope_01` and
 *   `ret_scope_02` each drawn as four mirrored 320x320 quads over (0, -96)-(640, 544), centred on the frame (not the
 *   aim point), as decoded: `ret_scope_01` the black tube (radius 81 of its 128 texels, 202 pixels on the frame),
 *   clear inside, with a two-texel grey (decoded RGBA 79,78,77,187) cross along the mirrored edges (research 341), dashed for its inner 22
 *   texels; `ret_scope_02` the soft black ring inside the tube (alpha 255 at radius 95 fading to 0 at 44).
 * - **The binoculars** (view state 4, `ChangeReticule` type 7, decomp 69510-69572): no ring, no arms, no pip -- the
 *   weapon's reticle is hidden: the ring and dot `hud+0x70`, the four arms `+0x2930..`, and at the change the target's
 *   name `+0x4544` and its health bar `+0x45e0` (research 321 sections 4.2 and 8, NU-3a C6; was: "(`hud+0x4544`,
 *   `+0x45e0`, `+0x70` and the threat polys `+0x2930`)" -- the threat marks are `+0x19b0` x8); `ret_binocs` and over
 *   it `ret_binocs2` (`DAT_0040c080`, the same name loaded again at 70864) each drawn as two quads over the whole frame,
 *   (0, 0)-(320, 448) as stored and (319, 0)-(640, 448) mirrored, sampled at u 0.01-0.97 and v 0.01-0.99, both at PS2
 *   alpha 128 (`DAT_003dc610`) -- `binocularsLayout`. Decoded (128x128 each), `ret_binocs` is one lens's black surround,
 *   open towards the frame's centre; `ret_binocs2` a darker rim with a faint tint (alpha 40) over the open lens.
 */

/** The console frame's cross, measured (above): its pixel bounding box and centre, 640x448 pixels. */
export const CONSOLE_RETICLE = {
  rect: { x: 288, y: 192, width: 65, height: 65 },
  centre: [320.5, 224.5] as [number, number],
} as const;

/** The PS2 frame's height: the HUD's pixel is one 448th of the frame's height (`./renderer`'s `PS2_FRAME`). */
const PS2_HEIGHT = 448;

/**
 * WEAPON: the accuracy pip (`ret_accuracy.tif`, `hud+0x1f0`), the mark of a **blocked muzzle** (research 84 §9).
 * `FUN_005aa6e0` (decomp 464290-464350), while the rifle's raise envelope is not 0 and it is up or coming down
 * (`FUN_005e0010`, state `0x12`), casts from the fire point to the aim point (`FUN_005b6240`); where that ray meets
 * something (and, after a round, not within 0.008 of where the round went) it projects the hit to the screen
 * (`FUN_00290370`) and keeps the offset from the reticle's centre at body `+0xe44`/`+0xe48`, setting kit `+0x5e0` bit 3;
 * otherwise it clears the bit. `BitmapReticule_UpdateAccuracy` (`FUN_00215250`, 69706-69770) then, each frame:
 *
 * - **hides it** (fading its alpha 32 a frame to 0) when the bit is clear, or when both offsets are at most the drawn
 *   size (`hud+0x44b4`, halved in third person) -- a signed test, so a hit up or to the left of the centre inside the
 *   other axis's size does not show it [the game's own quirk, ported];
 * - **else shows it** at the centre plus the offsets less half its bitmap, raising its alpha 32 a frame while under 128,
 *   the offsets pulled in to 200.032 pixels only while scoped (`FUN_005b9990`: state > 4).
 */
export const PIP_FADE = 32;
/** The pip's full alpha, PS2's 128 (opaque). */
export const PIP_FULL = 128;
/** The scoped clamp on the pip's offset, PS2 pixels (`FUN_00215250`: 40012.8 = 200.032²). */
export const PIP_SCOPED_REACH = 200.032;

export interface PipState { alpha: number; offset: [number, number] | null }

/**
 * One frame of the pip (`FUN_00215250`): `offset` the blocked muzzle's hit from the reticle's centre (PS2 pixels, y
 * down) or null for none, `size` the drawn size (already halved in third person), `scoped` the view state over 4.
 * Returns the new alpha (0..128) and where it is drawn (null: not drawn).
 */
export function stepPip(prev: PipState, offset: [number, number] | null, size: number, scoped: boolean): PipState {
  if (!offset || (offset[0] <= size && offset[1] <= size)) {
    const alpha = Math.max(0, prev.alpha - PIP_FADE);
    return { alpha, offset: alpha > 0 ? prev.offset : null };
  }
  let [x, y] = offset;
  const r2 = x * x + y * y;
  if (scoped && r2 > PIP_SCOPED_REACH * PIP_SCOPED_REACH) { const k = PIP_SCOPED_REACH / Math.sqrt(r2); x *= k; y *= k; }
  return { alpha: prev.alpha < PIP_FULL ? Math.min(PIP_FULL, prev.alpha + PIP_FADE) : prev.alpha, offset: [x, y] };
}
/** `ret_rifle_01` and `ret_rifle_02`'s own sizes, drawn one texel to one PS2 pixel. */
const FIXED = 64, ARM = 32;
/** Where the arm's core lies across its bitmap: texel column 30, whose centre is 30.5 texels in. */
const ARM_CORE = 30.5;
/** The arms' outer ends at size 0, in PS2 pixels from the aim point (measured on the console frame). */
const REST_REACH = 32;
/** The scope's quads: 320 PS2 pixels a side, the four around the frame's centre (`ChangeReticule` type 5). */
const SCOPE_QUAD = 320;
/** The arms' colour (measured, above), as 0..1 in the working space: the frame goes out unconverted (`./renderer`). */
export const ARM_TINT: [number, number, number] = [204 / 255, 204 / 255, 31 / 255];

/**
 * EMPTY_RETICLE_COLOUR_READING (research 321 sections 4.1 and 7.5, NU-3b C5): the arms' colour with nothing left to fire
 * (`FUN_005bdb00` answering 0) is `DAT_0040c0b8/bc/c0` (D:L70064-70072) -- past the file's bytes of its load segment
 * (.bss, zero-filled at load) and written by no line of the decompilation: (0, 0, 0), the arms black. A capture of an
 * empty M4A1's reticle settles it.
 */
export const EMPTY_RETICLE_COLOUR_READING: readonly [number, number, number] = [0, 0, 0];

/**
 * The arms' colours (`FUN_00215c10`'s vertex colours, scaled so the rest one is the measured `ARM_TINT`); `range` is the
 * grey (130, 130, 130) of an aimed point inside the round's arming distance (`armingColour`; R94.16). NU-3b C5: the same
 * grey (`DAT_003dc588/90/98`) over a blocked muzzle (`blocked`, D:L69983-69992) and while a climb or a ladder's start is
 * on top (`climbing`, D:L70260-70266) -- named apart so the page can tell which test gave it -- and `empty`, the black
 * with nothing left to fire (`EMPTY_RETICLE_COLOUR_READING`). (Was, before NU-3b: rest, friendly, hostile and range.)
 */
export type ReticleColour = 'rest' | 'friendly' | 'hostile' | 'range' | 'blocked' | 'climbing' | 'empty';
const GAME_COLOUR: Record<ReticleColour, [number, number, number]> = {
  rest: [200, 200, 24], friendly: [24, 200, 44], hostile: [200, 24, 44], range: [130, 130, 130],
  blocked: [130, 130, 130], climbing: [130, 130, 130], empty: [...EMPTY_RETICLE_COLOUR_READING],
};
export function reticleTint(colour: ReticleColour): [number, number, number] {
  return gsTint(GAME_COLOUR[colour]);
}

/**
 * A GS vertex colour (0..255 a channel, 128 the texel unchanged) as the page's tint: the one scale `reticleTint` uses,
 * the rest's measured `ARM_TINT` over the rest's (200, 200, 24), channel by channel (research 321 section 4.1; a
 * conversion, not a measurement, for any colour but the rest's).
 */
function gsTint(rgb: readonly [number, number, number]): [number, number, number] {
  const r = GAME_COLOUR.rest;
  return [0, 1, 2].map((i) => Math.min(1, (rgb[i]! / r[i]!) * ARM_TINT[i]!)) as [number, number, number];
}

/**
 * NU-3b C5: the clips `FUN_005a78d0` greys the reticle under (D:L462449-462466; research 313's ids): the action types
 * `Climb crate` (0x2a), `Climb medium`, `Stand -> Hang` (0x21), `Climb over`, `Step up` and `Stand -> Ladder` (0x2c) --
 * as the page's moves play them (`./traversal` `TRAVERSAL_CLIP`; the crate's and the medium's blend plays the crate's
 * name, a ladder's foot backwards the same clip). Its other test, the top play's byte `+0x2b` = 5 (`FUN_00219390`,
 * D:L70260-70266), the page does not hold (research 321 section 7.2's candidate for the byte, note only).
 */
export const CLIMB_GREY_CLIPS: ReadonlySet<string> = new Set([
  'seal_climbcrate', 'seal_climb_medium', 'seal_stand2hang', 'seal_climb_over', 'seal_step_up', 'seal_stand2ladder',
]);

/** Whether the move's clip on top (`TraversalHooks.clip`, null for none) greys the reticle (`CLIMB_GREY_CLIPS`). */
export function reticleClimbing(clip: string | null | undefined): boolean {
  return !!clip && CLIMB_GREY_CLIPS.has(clip);
}

/** A colour as the game's vertex colour, 0..255 (`DAT_003dc5a0/a8/b0` the rest, `DAT_003dc588/90/98` the grey 130). */
export function reticleGameColour(colour: ReticleColour): [number, number, number] {
  return [...GAME_COLOUR[colour]];
}

/**
 * The arms' colour with the arming test (`FUN_00215c10` D:L70222-70258, research 94 §C1.5, R94.16): when the selected
 * record has an `ArmingDistance` (`FUN_003d2030`) the test counts -- a rocket launcher's or its rocket's only, class 0x91 or
 * 0xb9 (ARMING-GREY, issue #300: `./firearms` `armingGreyOf`; the LAW HEAT and RPG rounds' 10 m, 100 units) -- and the
 * aimed point lies inside it -- `arming^2 > d^2` -- the grey (130, 130, 130), over whatever colour the target gave;
 * else `base`. `aimDistance` and `armingDistance` in the same units (null: no aimed point / no record that greys).
 * *Was:* "the fired round has an `ArmingDistance` (10 m on the M203, GL, LAW and RPG rounds)".
 */
export function armingColour(base: ReticleColour, aimDistance: number | null, armingDistance: number | null): ReticleColour {
  if (aimDistance === null || armingDistance === null || armingDistance <= 0) return base;
  return armingDistance * armingDistance <= aimDistance * aimDistance ? base : 'range';
}

/**
 * NU-3b C4 (research 321 section 4.1): how far across the ground (x and z, `FUN_003091d0`) the actor under the reticle
 * may stand to be coloured and named -- 320 units (102400 = 320 squared), 500 under the scope's set 5 (250000; the HUD's
 * `+0x44b8` = 5), D:L70096-70102. The binoculars' set 7 takes the 320.
 */
export const TARGET_RANGE = { unscoped: 320, scoped: 500 } as const;

/** The target's name string's scale (`hud+0x4544`, 0x3f333333 = 0.7 at Init, D:L70816-70817). */
export const TARGET_NAME_SCALE = 0.7;

/**
 * The target's health bar (`hud+0x45e0`, a `CHealthBar`): 60 x 5 (`FUN_00241cb0`, D:L70822, D:L89926-89931), its corner
 * `above` 15 pixels over the name's pen (`FUN_00241ca0`, D:L70213-70218).
 */
export const TARGET_BAR = { width: 60, height: 5, above: 15 } as const;

/**
 * The clan tag's shortest length the target's name takes (`FUN_00199288`, a string length, `< 2` gives the bare name,
 * D:L70193-70198) -- one more than the info box's (`FUN_00238500` D:L85563, `./hud` `taggedName`, from one character).
 */
export const TARGET_TAG_MIN = 2;

/** The blank name (0x3e4840, `" "`): a teammate's offline or with the HUD's `+0x17b64` set (D:L70159-70170). */
export const TARGET_NAME_BLANK = ' ';

/**
 * TEAMMATE_NAMES_OPTION_READING (research 321 sections 4.2 and 7.5, NU-3b C4; research 329, reading, pending review):
 * online, a teammate under the reticle shows the blank instead of its name while the HUD's (`DAT_00408e58`) byte
 * `+0x17b64` is set (D:L70162-70170). That byte is the over-head tags' part's (`CMPTeammateNames`, HUD `+0x17580`, set up
 * by `FUN_00227340` D:L77524-77562): its `+0x5e4`, written once at the set-up from the TEAMMATE NAMES option, the valve
 * `DISPLAY_MP_TEAM_NAMES` (the string at 0x3e5540, as research 329 names it) not 0 (`FUN_00351ff0`, D:L77558-77559)
 * -- whose default is 1 (the golden `global-valves.json`, `valves[152]`). So by default the teammate's name is over his
 * head (research 329, NU-9 (c)) and the reticle shows the blank and his bar; with the option off, his "[tag] name". `on`
 * is the default the page takes: no page path hands the valve to the reticle yet (`ReticleTargetInputs.teammateNames`;
 * the wiring owed to NU-9 (c)'s T4). (Was, at C4's first build: a reading of `false` under another name, research 321
 * section 7.5 -- "the byte written by no line found by its offset; the page holds it clear, the teammate's name shown";
 * corrected by the controller from research 329, 2026-10-15.) A capture online aiming at a teammate with the option on
 * and off settles it.
 */
export const TEAMMATE_NAMES_OPTION_READING = { valve: 'DISPLAY_MP_TEAM_NAMES', on: true } as const;

/**
 * AD-3 (research 321 sections 4.1 and 7.5; the reconciliation's C88): an other under the reticle is red and named when the
 * HUD's body's record of it (`FUN_002a0190(body+0xd0, target)`, 48-byte records keyed by actor, D:L145605-145620) carries
 * `+0x2c` bit 0x200 (D:L70119-70130) -- the mark of the body's own **perception**, read here (was:
 * `ENEMY_IDENTIFIED_PLACEHOLDER = 'under the reticle'`, "the passes' callers unread": every other the page's pick reached
 * was red). The human's controller (`FUN_005442c0` D:L410581-410614: table 0x6694b0, or 0x6699f0 under `DAT_00440c30`;
 * both hold slot +0x3c `FUN_005970b0` and slot +0xac `FUN_005ca170`, read off the ELF) runs it each frame:
 *
 * - **The enqueue pass** (`FUN_00594cf0` D:L453085-453086 -> `FUN_005ca9f0` D:L482547-482571): the records in order of
 *   distance; at the first beyond the reach `+0xa8` it stops, leaving that one and the rest untouched (D:L482552-482553).
 *   `FUN_005cc120` (D:L483169-483305) takes the target -- `perceptionLook` -- or rejects it, and a rejected record loses
 *   its query, decays by `DAT_006509e0` (-0.15) of itself a second and is cleared at once (D:L482556-482566).
 * - **The dispatcher** (`FUN_005970b0` D:L454091-454095 -> `FUN_005c9b30`): a target no longer active (`+0xe1` bit 4,
 *   D:L482115-482129) is cleared (slot +0xac with false, D:L482176); a completed query adds the rate times the query's
 *   elapsed time (`query+0x24`, `FUN_0060bc40` D:L516713, D:L516738: the frames it waited) to `+0x18`, clamps it to
 *   [0, 2] (`FUN_00539b70`, D:L482208-482209) and marks the record while it is at 1 or more (D:L482210) unless the target
 *   carries the veto (D:L482214-482218); `FUN_005ca170` sets or clears bit 0x200 (D:L482279-482283).
 * - **The rate** (`FUN_0060aa20` D:L516124-516248): -1 when the query's visibility (`FUN_0060b120` D:L516326-516386)
 *   is 0 or less, else a product of the scene's lighting (the mission's `.bss` terms at `0x436640`..`0x43664c`), the
 *   target's motion and stance (`FUN_0058a720`: 1, 0.5 or 0), smoke (`FUN_00538e30`), an item 0xbe's 0.1 and the
 *   record's `+0x100` bit's 2 -- all times the controller's `+0xe8`, 1 for the human (D:L454716).
 */
export const PERCEPTION = {
  /** The clamp (`DAT_00650998` 0, `DAT_0065099c` 2, D:L482209) and the mark at or above `DAT_00650990` 1 (D:L482210). */
  min: 0, max: 2, threshold: 1,
  /** A rejected record's decay of itself a second (`DAT_006509e0` -0.15, D:L482557-482559). */
  rejectedDecay: -0.15,
  /** An unseen query's rate (D:L516159, D:L516162, D:L516248) and the human controller's scale `+0xe8` (D:L454716). */
  unseenRate: -1, rateScale: 1,
  /** The reach `+0xa8`: 1000 units, at most 0.95 of the camera's MID (`camera+0xec`) when one is up (D:L454794-454802). */
  range: 1000, rangeOfMid: 0.95,
  /**
   * The cone (`FUN_005c9520` D:L481800-481863, `FUN_005cc120` D:L483236-483254): the camera's eye and forward, its radius
   * `DAT_00650a80` 25 at the eye widening by `tan(fov / 2)` (`FUN_001b3808`) a unit out over the magnification, the field
   * of view 0x3fb2b8c2 = 1.3962634 rad, 80 degrees (D:L454793, clamped to [0.01, pi / 2] at D:L481877).
   */
  apex: 25, fov: 1.3962634,
  /** Outside the cone but in front: a target moving faster across the ground than 50 a second (`DAT_006509e8` 2500, D:L483256-483261). */
  fastSquared: 2500,
} as const;

/**
 * PERCEPTION_SEEN_RATE_PLACEHOLDER (research 321 sections 4.1 and 7.5, AD-3): a seen query's rate a second (`FUN_0060aa20`
 * D:L516162-516246) -- the scene's lighting, the target's motion and stance, smoke, the fog -- whose mission terms are
 * `.bss` the loader fills (`0x436624`, `0x436640`..`0x43664c`) and whose composite (`FUN_0053ae20`, `FUN_0053abe0`) is
 * unread. Infinity: a seen query fills the record at once, so a seen other is marked on his first query (the page's
 * acquisition before AD-3, kept); the unseen fall, the clamp, the threshold and the clears are read. A capture or a PINE
 * trace of the record's `+0x18` and `+0x1c` against the query's timestamps settles it.
 */
export const PERCEPTION_SEEN_RATE_PLACEHOLDER = Number.POSITIVE_INFINITY;

/**
 * PERCEPTION_SIGHT_READING (research 321 sections 4.1.1 and 7.5, AD-3; LATER 793, SIGHT-POINTS: was
 * `PERCEPTION_SIGHT_PLACEHOLDER`, its two points the aim's eye and the feet raised by `EYE_HEIGHT`). The query
 * (`FUN_0060bc40` D:L516713-516729 submits it, `FUN_0060b120` D:L516310-516386 reads its hits):
 * - **Its two points, read** (reading, pending review): from the observer's posed `head` node (`DAT_0066b7a8` by the
 *   body's slot +0x34 `FUN_005a31c0`, body+0x308) to the target's posed `neck` node (slot +0x38 `FUN_005a3160`,
 *   body+0x30c), D:L460155-460171, the nodes named at the body's set-up (`FUN_00553ea0` D:L419620-419623), each the
 *   node's origin up its parent chain (`FUN_002869d0` D:L130737-130766) put in the world by the body's matrix
 *   (`FUN_00308640(body+0x28, p, 1)`); no random point. The same neck point is the cone's (`FUN_005cc120`
 *   D:L483236-483237). The page: `Play.nodeWorld('head')` and `RemotePlayers.neckAt`, its own posed skeletons (that the
 *   original's nodes are posed each frame, and when against the sweep, is inferred, not read).
 * - **Its hits, read; the page's rule a stand-in** (`surfaces`): a null query 0; no hit 1; the hits nearest the start
 *   first; one on the target or its descendants ends the walk; a missing material 0, an index past the table material
 *   0; `FUN_0059acd0(hit node)` not 0 skips the hit; else material `+0x3c` bit 0 (VOLUMETRIC) clear takes `+0x20`
 *   (OPACITY, clamped to [0, 1]) off, set a random share by the squared start-to-hit distance (< 2500 0.5u + 0.5,
 *   < 90000 0.39999998u + 0.25, < 250000 0.3u); the result clamped to [0, 1]. The page takes 1 or 0: seen when no
 *   surface the eye's query keeps (`pickSurfaces`, `aimPickBlocks`: a VOLUMETRIC one passed whole, any other kept one
 *   blocking whole) lies between the two points -- the materials' OPACITY not yet read off `materials.rdr`, the random
 *   bands and `FUN_0059acd0` not built, the type-2 query's collision leaves not closed.
 * - **The record's distance `+0x10`, unread** (`record`): feet to feet.
 * A PINE trace of the record's `+0x10` and of a query's hits and visibility, and the materials' OPACITY read off the
 * disc, settle the last two.
 */
export const PERCEPTION_SIGHT_READING = {
  surfaces: 'the eye query\'s kept surfaces', from: 'the observer\'s posed head node', to: 'the target\'s posed neck node', record: 'feet to feet',
} as const;

/**
 * PERCEPTION_QUERY_PLACEHOLDER (research 321 sections 4.1 and 7.5, AD-3): the queries' schedule -- `FUN_0060bc40` launches
 * at most `DAT_0044d5e4` a frame from the queue `0x44d5f0`, each query's `+0x24` gaining the frame's time while it waits
 * (D:L516700-516742), and the dispatcher takes a completed one on the controller's next pass. The page runs one query a
 * body a frame, completed in that frame, its elapsed time the frame's. The acquisition's latency is not claimed: a trace of
 * the queries' timestamps and results (chunk 07: the record's `+0x18`, `+0x28`, `+0x2c`, the callback's third argument)
 * settles it.
 */
export const PERCEPTION_QUERY_PLACEHOLDER = 'one query a body a frame, its elapsed time the frame\'s' as const;

/**
 * PERCEPTION_VETO_PLACEHOLDER (research 321 sections 4.1 and 7.5, AD-3): the target body's `+0x105c` bit 4 that keeps
 * the mark clear whatever the record holds (D:L482214-482218) -- copied from the mission's flag word `CMission+0x140` bit
 * 0x2000 (`FUN_002b28d0` D:L155878-155879 for the player, `FUN_00573130` D:L434809-434810), whose writer was not found by
 * its offset and whose MP scripts were not read. False on every body: a reader run over the 22 MP missions for the flag,
 * or a PINE read of the word, settles it.
 */
export const PERCEPTION_VETO_PLACEHOLDER = false;

/**
 * What one frame of the passes does with a record (`Perception.step`): `inactive` the target not active (dead, gone);
 * `beyond` past the reach; `rejected` by `FUN_005cc120`; `seen` / `unseen` a completed query's visibility over 0 or not.
 */
export type PerceptionLook = 'inactive' | 'beyond' | 'rejected' | 'seen' | 'unseen';

/**
 * The view's magnification the cone takes (body `+0x204`, `FUN_005448a0` D:L410961-411008, by the view state `+0x200`):
 * 1 in state 0, 1.01 (0x3f8147ae) in 1-3, 9 in the binoculars' 4, the weapon's zoom mode's from 5 (`FUN_003c5980`).
 */
export function perceptionMagnification(viewState: number, magnification: number): number {
  return viewState <= 0 ? 1 : viewState <= 3 ? 1.01 : viewState === 4 ? 9 : magnification;
}

/** What `FUN_005ca9f0` / `FUN_005cc120` read of the observer and one target, as the page holds them. */
export interface PerceptionLookInputs {
  /** The target active (`+0xe1` bit 4): alive and in the world. */
  alive: boolean;
  /** The record's distance (`+0x10`; `PERCEPTION_SIGHT_READING`'s feet to feet), units. */
  distance: number;
  /**
   * The camera's eye and its unit forward (`FUN_005c9520` D:L481807-481863), and the target's point: its posed neck node
   * (slot +0x38, `FUN_005a3160`; `FUN_005cc120` D:L483236-483237), the sight's end (`PERCEPTION_SIGHT_READING`).
   */
  apex: readonly [number, number, number]; forward: readonly [number, number, number]; target: readonly [number, number, number];
  /** The view's magnification (`perceptionMagnification`). */
  magnification: number;
  /** The camera's MID (`camera+0xec`), units; null for none (the reach stays 1000). */
  mid: number | null;
  /** The target's speed across the ground, squared (`+0x38`, `+0x40`; units a second). */
  speedSquared: number;
  /** The query's visibility over 0 (`PERCEPTION_SIGHT_READING`). */
  seen: boolean;
}

/**
 * One target's look for the human's passes: `inactive`; `beyond` the reach (1000, at most 0.95 of the MID); else in the
 * cone -- in front, no farther along it than the reach times the magnification, and within `25 + p tan(fov / 2) / m`
 * of its axis at `p` along it (`/ m^2` above 1: D:L481801-481806 divide `+0x84` by `m` and `+0x8c` is `1 / (reach m)`)
 * -- or in front and moving faster than 50 a second, a query (`seen` / `unseen`); else `rejected`. The human's slot
 * +0x2c answers 1 (0x5431f0), so a teammate is taken too; its slot +0x38 answers none (0x5431e0), so the near test
 * behind (D:L483263-483268) never takes one (D:L483197, D:L483222-483225, read off the ELF).
 */
export function perceptionLook(o: PerceptionLookInputs): PerceptionLook {
  if (!o.alive) return 'inactive';
  const reach = o.mid === null ? PERCEPTION.range : Math.min(PERCEPTION.range, PERCEPTION.rangeOfMid * o.mid);
  if (reach * reach < o.distance * o.distance) return 'beyond';
  const v = [o.target[0] - o.apex[0], o.target[1] - o.apex[1], o.target[2] - o.apex[2]];
  const along = v[0]! * o.forward[0] + v[1]! * o.forward[1] + v[2]! * o.forward[2];
  const m = o.magnification, spread = (reach * Math.tan(PERCEPTION.fov / 2)) / (m > 1 ? m : 1);
  let take = false;
  if (along > 0 && along <= reach * m) {
    const radius = PERCEPTION.apex + along * (1 / (reach * m)) * spread;
    take = !(radius * radius < v[0]! * v[0]! + v[1]! * v[1]! + v[2]! * v[2]! - along * along);
  }
  if (!take && along > 0 && PERCEPTION.fastSquared < o.speedSquared) take = true;
  if (!take) return 'rejected';
  return o.seen ? 'seen' : 'unseen';
}

/**
 * The body's records (AD-3): per actor the accumulator `+0x18` and the mark, bit 0x200 of `+0x2c` (`PERCEPTION`'s header
 * for the passes). `step` runs one frame of them for one actor, in the original's order; `identified` is the mark the
 * reticle reads (D:L70122-70130).
 */
export class Perception {
  private readonly records = new Map<number, { acc: number; marked: boolean }>();

  step(id: number, look: PerceptionLook, dt: number, o: { seenRate?: number; veto?: boolean } = {}): void {
    let r = this.records.get(id);
    if (!r) { r = { acc: 0, marked: false }; this.records.set(id, r); }
    if (look === 'beyond') return;
    if (look === 'inactive') { r.marked = false; return; }
    if (look === 'rejected') { r.acc += PERCEPTION.rejectedDecay * r.acc * dt; r.marked = false; return; }
    const rate = look === 'seen' ? o.seenRate ?? PERCEPTION_SEEN_RATE_PLACEHOLDER : PERCEPTION.unseenRate * PERCEPTION.rateScale;
    const next = rate === Number.POSITIVE_INFINITY ? PERCEPTION.max : r.acc + rate * dt;
    r.acc = Math.min(PERCEPTION.max, Math.max(PERCEPTION.min, next));
    r.marked = PERCEPTION.threshold <= r.acc && !(o.veto ?? PERCEPTION_VETO_PLACEHOLDER);
  }

  /** The record's mark (bit 0x200): false for an actor no pass has seen. */
  identified(id: number): boolean {
    return this.records.get(id)?.marked ?? false;
  }

  /**
   * ENEMY-RAISE ER-1: the actors whose record carries the mark (bit 0x200), each once -- what `FUN_005c9b30` walks for
   * the controller's count (D:L482101-482132; `enemyCount`).
   */
  *marked(): Iterable<number> {
    for (const [id, r] of this.records) if (r.marked) yield id;
  }

  /** The record's accumulator (`+0x18`), 0 for an actor no pass has seen. */
  accumulator(id: number): number {
    return this.records.get(id)?.acc ?? 0;
  }

  /** Every record dropped: the observing body rebuilt (`PERCEPTION_RECORD_LIFE_READING`), its list made anew and zeroed. */
  clear(): void {
    this.records.clear();
  }

  /**
   * The page's own timing (not a reading): the records of the actors not in `ids` -- a seat no longer in the room --
   * dropped at once, so a later joiner the room seats on the same id starts with none, as a new actor gets a zeroed record
   * (`FUN_002a0200`). The original drops them later: its departure (`FUN_002bef60` D:L162520-162539) retires the body
   * (`FUN_005998b0`), writing its `+0x4` to `DAT_003effb0` (0xffffffff, no writer; D:L455524); the next online round start's
   * `FUN_0029fcb0` (D:L75924) deletes it (`FUN_0029fd80` D:L145398-145402) -> vtable +8 `FUN_005533e0` -> `FUN_0029ed30`
   * (D:L419349) -> `FUN_002a0f70(body, 0)` (D:L144943), and `FUN_002a0450` removes the watchers' records (`FUN_002a0310`).
   * (Was: "A browser bookkeeping (no original read for it) ... with no leave read, so whether it frees the watchers'
   * records of it is not read.")
   */
  keepOnly(ids: ReadonlySet<number>): void {
    for (const id of [...this.records.keys()]) if (!ids.has(id)) this.records.delete(id);
  }
}

/**
 * PERCEPTION_RECORD_LIFE_READING (research 321 sections 4.1.1 and 7.5; AD-3's review F2 and its re-check): the records
 * are the observing body's own list (`+0xd0`: `+0xd4` the count, `+0xd8` the records; `FUN_002a0190` D:L145605-145620).
 * One is made, zeroed, for each actor that enters the world (`FUN_002a0450` D:L145796-145806 -> `FUN_002a0200`
 * D:L145639-145661). **The list is emptied when the observing body is rebuilt** (`FUN_00599b60`, the body's ReCreate,
 * research 179 and 212): its destructor run in place (D:L455659: vtable +8, `FUN_0029ed30` -- `FUN_002a0f70(body, 0)`
 * D:L144943, the list freed by `FUN_0029ff60(body+0xd0)` D:L144952), the constructor (D:L455663, `FUN_00553ea0` ->
 * `FUN_0029ee10` D:L144978-144980: `+0xd0/+0xd4/+0xd8` 0), the list refilled zeroed by `FUN_002a0a10`
 * (D:L145892-145926 through `FUN_002a1160` D:L146106-146116). That rebuild runs **at every online round start** --
 * `FUN_00223680` D:L75925-75931 calls `FUN_00598b90(body, 0)` for each body not a ghost, the page's own included, which
 * calls `FUN_00599b60(body, 0)` directly inside its network block (D:L455070-455339, at D:L455158) -- **and at a
 * respawn**: online `FUN_00547350` (D:L412721-412726) -> `FUN_00598b90(body, 1)` -> the same `FUN_00599b60` at D:L455158,
 * whatever its second argument; offline `FUN_005994a0` (D:L455369, D:L455385), run only with `DAT_0045a0c1` 0
 * (D:L412708-412713) (was: the respawn cited as `FUN_005994a0` alone). The page empties its records at its own spawn (`spawnKit`, the room's
 * spawn of the page: each round's and a respawn's). **The observed body's rebuild alone keeps the others' records of
 * it**: its destructor's leave (`FUN_002a0f70(body, 0)`, queued at 0x436370) is cancelled by `FUN_002a0f70(body, 1)` at
 * D:L455668 (D:L146058-146068: taken off the leave queue, not re-added while still a member of 0x436330), so
 * `FUN_002a0450` never removes it (D:L145818-145824); the page keeps the record of another seat across his death and
 * respawn. The second clear `FUN_002a10c0(actor, 0)` (D:L146079-146088) is not a human observer's: its callers are
 * `FUN_0056d0c0` on the AI object's `+0x265` (D:L431799-431822), `FUN_005714b0` (0x669408, in neither human table),
 * `FUN_0029f850` (D:L145229) and `FUN_0029f9f0` (D:L145272) on the fresh dummy `DAT_004362c4` whose list is empty, and
 * `FUN_005f1c70` (D:L503585) and `FUN_005f1e40` (D:L503637, its argument the `+0xa0` bit) -- these two with no direct
 * caller in the decompilation, unread (was: the first two named alone, "an AI's"). (Was, the
 * F2 fold 72c7bba73: "kept across a death, a respawn and a round", the page keeping its records for the mount -- the read
 * missed `FUN_00598b90`'s direct call of `FUN_00599b60` at D:L455158.) A capture or a PINE read of an observer's `+0xd8`
 * records across a round's start and across an enemy's respawn alone settles it.
 */
export const PERCEPTION_RECORD_LIFE_READING = {
  owner: 'the observing body (+0xd0)', created: 'zeroed at an actor\'s entry into the world and at the body\'s rebuild',
  emptied: 'at the observing body\'s rebuild: every online round start, its respawn',
  kept: 'across the observed body\'s rebuild alone (its leave cancelled)',
} as const;

/** ESCORT, the round's type byte `DAT_00437ce8 + 0x111` = 3 (research 155, 192: 1 BREACH, 2 DEMOLITION, 3 ESCORT, 4 EXTRACTION). */
export const ESCORT_GAME_TYPE = 3;

/**
 * ENEMY-RAISE ER-1 (research 321 s4.1.1 point 7): the seats' team words, `body+0xc8` -- SEAL 0x40000001 and Terrorist
 * 0x80000100 (`FUN_002c32c0` / `FUN_002c32e0` D:L164772-164793; the captured SealObjects, research 190, 193 s4.1), the two
 * exchanged under the clan swap `DAT_004412d8` (research 309).
 */
export const SEAT_WORD = { seal: 0x40000001, terrorist: 0x80000100 } as const;

/**
 * ENEMY-RAISE ER-1 (research 175 s2, research 321 s4.1.1 point 4): the escortees' team words from their map records
 * (`vehicles.rdr`'s team list through `FUN_00533370` D:L400379-400443): EXTRACTION's hostages bits 17, 30, 31
 * (0xc0020000), ESCORT's VIPs bits 17, 30 (0x40020000).
 */
export const ESCORTEE_WORD = { hostage: 0xc0020000, vip: 0x40020000 } as const;

/** ER-1: a seat's team word by its side; under the swap the two words are exchanged (`SEAT_WORD`). */
export function seatWord(team: 'seal' | 'terrorist', swapped = false): number {
  return SEAT_WORD[swapped ? (team === 'seal' ? 'terrorist' : 'seal') : team];
}

/**
 * ER-1: an escortee's team word on the round's type -- ESCORT's VIP, else the hostage -- with bits 30 and 31 exchanged at
 * the spawn under the swap (`FUN_002b28d0` D:L155859-155867): the VIP 0x80020000, the hostage unchanged.
 */
export function escorteeWord(gameType: number | null, swapped = false): number {
  const w = gameType === ESCORT_GAME_TYPE ? ESCORTEE_WORD.vip : ESCORTEE_WORD.hostage;
  if (!swapped) return w;
  const b30 = (w >>> 30) & 1, b31 = (w >>> 31) & 1;
  return ((w & 0x3fffffff) | (b30 << 31) | (b31 << 30)) >>> 0;
}

/**
 * ENEMY-RAISE ER-1 (research 321 s4.1.1 point 7, s7.7; SCOPE.md s1.3; reading, pending review): what the page takes for
 * `FUN_005c9b30`'s four tests beyond the team word (D:L482112) and the mark (D:L482131) -- `enemyCount`'s:
 * - `kind`: every body the page perceives (the room's seats, its escortees, the body under the reticle) is a SEAL body,
 *   kind 2 (`FUN_00553ea0` -> `FUN_0029ee10(body, 2, ...)` D:L419419, D:L144973); kinds 3 and 4 (D:L482116-482129) are not
 *   perceived (SCOPE.md U4);
 * - `active`: the room's alive flag stands for `target+0xe1` bit 4 (D:L482115; set D:L145030, cleared D:L144775 through
 *   `FUN_00547af0`, whose role at a death is unread: U15);
 * - `ledHostage`: a led (restrained) hostage is counted by its welcome-list word, without its leader's rewrite
 *   (`FUN_00607d70` D:L514835, `FUN_00601910` D:L511801; the kept mask untraced: U4);
 * - `swap`: the page sees no `DAT_004412d8`, so its seats and escortees take their unswapped words -- both exchanged
 *   together, the count by side is the same either way (`seatWord`, `escorteeWord`);
 * - `observer`: only a seated player counts (a spectator walks no body of its own).
 * Settles: a capture of `ctrl+0xc0` and the records (SCOPE.md s2.1 runs 5, 9; a led hostage on MP6, MP10, MP11 or MP71).
 */
export const ENEMY_COUNT_FILTER_READING = {
  kind: 'every perceived body kind 2', active: "the room's alive flag", ledHostage: "the welcome list's word, no leader rewrite",
  swap: "the page's seats and escortees unswapped", observer: 'a seated player only',
} as const;

/**
 * ENEMY-RAISE ER-1: the controller's `ctrl+0xc0` -- `FUN_005c9b30` zeroes it (D:L482090) and adds one for each marked
 * record (D:L482131-482132) whose target is active (D:L482115) and shares no bit of the observer's team word
 * (`(body+0xc8 & target+0xc8) == 0`, D:L482112): so teammates never count, a free hostage (0xc0020000) never, an ESCORT
 * VIP (0x40020000) for the side whose word it does not meet. An actor with no word known is not counted
 * (`ENEMY_COUNT_FILTER_READING`).
 */
export function enemyCount(perception: Pick<Perception, 'marked'>, observer: number, wordOf: (id: number) => number | null, alive: (id: number) => boolean): number {
  let n = 0;
  for (const id of perception.marked()) {
    if (!alive(id)) continue;
    const w = wordOf(id);
    if (w !== null && (observer & w) === 0) n++;
  }
  return n;
}

/*
 * The target's health (research 321 sections 4.2.1 and 7.5): the bar fills with the target's `+0x1044`
 * (`FUN_00241cc0(bar, target, 1)`, D:L70213-70219, D:L89957), which another console makes from the seat's six part bytes.
 * NU-3c (2026-10-15) retired NU-3b's placeholder for it (was: `null`, "the room sends no page another body's health"):
 * the room now sends a seat's bytes to its side (`./net/protocol` `health`), and the page reads the total through
 * `NetClient.healthOf` (`./matchFirearm` `aimTarget`); null still for a body whose bytes no page was sent.
 */

/**
 * TARGET_NAME_LOOK_READING (research 321 sections 4.2 and 7.5, NU-3b C4): how the target's name string is drawn. Made at
 * Init by the HUD's string class (vtable `+0x7c`, D:L70816-70817) and coloured nowhere in the reticle's code, so read as
 * the HUD's every string: the colour (128, 128, 128) at alpha 80 and the font's drop shadow (`./hud` `HUD_COLOURS`;
 * `FONT_TEXT_01`), the place `FUN_003631a0` gives (D:L70209-70211) as the pen and the baseline, left-aligned
 * (`./hudFont` `layoutText`). A capture of a teammate's name beside the reticle settles it.
 */
export const TARGET_NAME_LOOK_READING = { text: HUD_COLOURS.text, shadow: HUD_COLOURS.shadow, pen: 'baseline, left-aligned' } as const;

/**
 * The special actors (AD-3; `FUN_00215c10` D:L70107-70118): the authored bodies whose team mask (`FUN_00533370`
 * D:L400379-400443, applied by `FUN_002b28d0` D:L155843-155868) carries the escortee bit 17 -- across the 22 MP maps the
 * twelve hostages of MP6, MP10, MP11 and MP71 (0xc0020000) and the nine VIPs of MP52, MP53 and MP82 (0x40020000), each
 * record's `display` its `name` (`Hostage`..`Hostage3`, `VIP1`..`VIP3`; a disc check of `READERM.ZAR/vehicles.rdr`, AD-3).
 */
export type SpecialActor = 'hostage' | 'vip';

/** The actor under the reticle, as the page knows it (`FUN_005aa690`, alive). */
export interface ReticleTarget {
  /**
   * `teammate`: the room seats it on the HUD's body's side (`+0xc8` meets the body's, D:L70107-70108); `other`: on the
   * other side; `unseated`: on no seat's side (a hostage: its `kind`; was, before AD-3, `TARGET_KIND_PLACEHOLDER`'s rest).
   */
  side: 'teammate' | 'other' | 'unseated';
  /** AD-3: the body's perception record of it marked (bit 0x200, `Perception.identified`); absent, not marked. */
  identified?: boolean;
  /** AD-3: a special actor (`SpecialActor`), as the room names it to the page; absent, none. */
  kind?: SpecialActor;
  /** From the body to it across the ground (x and z), units (`FUN_003091d0`, D:L70096). */
  ground: number;
  /** Its name (`+0x14`) and its clan tag (`FUN_002c3ac0(target+0xfc8)`, the score row's `clan`), null or '' for none. */
  name: string; tag: string | null;
  /** 0..1 (NU-3c: `NetClient.healthOf`, the room's `health` bytes), or null when the room sent the page none for it. */
  health: number | null;
}

/** What `FUN_00215c10` reads each frame, as the page holds it. */
export interface ReticleTargetInputs {
  /** The blocked muzzle's hit from the reticle's centre (`+0xe44/+0xe48`, PS2 pixels, the pip's), null with kit bit 3 clear. */
  blocked: [number, number] | null;
  /** The HUD's size `hud+0x44b4`, unhalved (the kit's `+0x84c`). */
  size: number;
  /** Nothing left to fire in the hand's item's mode (`FUN_005bdb00` answering 0). */
  empty: boolean;
  /** The C4 in the hand (the item's `+0x7c` = 0x97): the meter's branch, no target (D:L70073-70091). */
  c4: boolean;
  /** The actor under the reticle, or null. */
  target: ReticleTarget | null;
  /** The scope's set 5 (the range 500, the name's offset halved). */
  scoped: boolean;
  /** A network game (`DAT_0045a0c1`): a teammate's name rather than the blank. */
  online: boolean;
  /**
   * The TEAMMATE NAMES option (`DISPLAY_MP_TEAM_NAMES`, the HUD's `+0x17b64`): on, a teammate's name is the blank under
   * the reticle. Absent: the option's default (`TEAMMATE_NAMES_OPTION_READING`).
   */
  teammateNames?: boolean;
  /** The aimed point's distance and the fired round's `ArmingDistance`, units (`armingColour`), null for none. */
  aimed: number | null; arming: number | null;
  /** A climb or a ladder's start on top (`FUN_005a78d0`). */
  climbing: boolean;
  /** AD-3: the round's type (`DAT_00437ce8 + 0x111`; `ESCORT_GAME_TYPE` 3), absent or null for none known. */
  gameType?: number | null;
  /** AD-3: the HUD's body on the Terrorist side (`FUN_002c30b0`: its team word the Terrorists' mask, D:L164672-164704). */
  observerTerrorist?: boolean;
}

/** The target pass's answer: the arms' colour, the name drawn (null: hidden) and the bar's health (null: no bar). */
export interface ReticleTargetDraw { colour: ReticleColour; name: string | null; bar: number | null }

/**
 * The target's name as the reticle prints it (D:L70189-70200): `"[%s] %s"` (0x3e4848) through `./hud`'s `taggedName` when
 * the tag is `TARGET_TAG_MIN` characters or more and the name is not the blank; else the name alone.
 */
export function targetName(tag: string | null | undefined, name: string): string {
  return taggedName(tag && tag.length >= TARGET_TAG_MIN && name !== TARGET_NAME_BLANK ? tag : null, name);
}

/**
 * NU-3b: one frame of `FUN_00215c10` (D:L69908-70292) -- the arms' colour, the target's name and its bar -- in its order:
 * a blocked muzzle past the unhalved size, signed on either axis, greys and skips the rest (D:L69983-69992, C5); nothing
 * left to fire blacks and skips the target (D:L70064-70072, C5); the C4 in the hand skips it (the meter's branch,
 * D:L70073-70091); else the target's colour (a special actor green, or red in ESCORT for a Terrorist-side observer; a
 * teammate green; an other the perception marked red; else the rest -- AD-3) and its name and bar (D:L70094-70219, C4);
 * then the arming grey over all (D:L70229-70259, `armingColour`), and last the climbing grey (D:L70260-70266, C5).
 */
export function reticleTargetState(o: ReticleTargetInputs): ReticleTargetDraw {
  let colour: ReticleColour = 'rest', name: string | null = null, bar: number | null = null;
  const t = o.target, blocked = o.blocked !== null && (o.size < o.blocked[0] || o.size < o.blocked[1]);
  const range = o.scoped ? TARGET_RANGE.scoped : TARGET_RANGE.unscoped;
  if (blocked) colour = 'blocked';
  else if (o.empty) colour = 'empty';
  else if (o.c4) colour = 'rest';
  else if (t && !(range * range < t.ground * t.ground)) {
    // AD-3 (D:L70107-70130): the special flag -- online bit 17, offline bit 31 without bits 1 and 18, so the hostages'
    // 0xc0020000 and not the VIPs' 0x40020000 -- counts as the side's too; else the record's mark.
    const special = t.kind !== undefined && (o.online || t.kind === 'hostage');
    if (special) {
      // D:L70137-70158: red only in ESCORT for a Terrorist-side observer, else green; its own name and its bar.
      colour = o.gameType === ESCORT_GAME_TYPE && o.observerTerrorist ? 'hostile' : 'friendly';
      name = targetName(t.tag, t.name);
      bar = t.health;
    } else if (t.side === 'teammate') {
      colour = 'friendly';
      const names = o.teammateNames ?? TEAMMATE_NAMES_OPTION_READING.on;
      name = targetName(t.tag, o.online && !names ? t.name : TARGET_NAME_BLANK);
      bar = t.health;
    } else if (t.identified) {
      colour = 'hostile';
      name = targetName(t.tag, t.name);
    }
  }
  colour = armingColour(colour, o.aimed, o.arming);
  return { colour: o.climbing ? 'climbing' : colour, name, bar };
}

/**
 * The target's name's pen and its bar on a frame (`FUN_00215c10` D:L70201-70218): the pen at `(cx + W/2, cy - H/2)` --
 * `W/4`, `H/4` under the scope's set 5 -- each truncated to the PS2 pixel (`(int)`, D:L70209-70211); the bar's corner
 * `TARGET_BAR.above` over it, `TARGET_BAR.width` x `.height`, its corners truncated as `FUN_00241cc0` lays them
 * (D:L90004-90008), and `fill` the width of its filled part at `health` (0..1): the split `(int)(x + 60 x health)` on the
 * bar's untruncated x (D:L90005), less the truncated left. `centre` in frame pixels (`hud+0x44ac/+0x44b0` at the
 * frame's scale); `box` the set's floating bitmap's `W` and `H` in texels (`hud+0x452c/+0x4530`; the fixed one's when
 * the set has none, D:L69298-69309). (The review's F2, 2026-10-15; was: the split taken on the truncated x, so x 352.6
 * at 0.99 split at 411 where the original's is 412.)
 */
export function targetLayout(
  frame: { width: number; height: number }, centre: [number, number], box: { width: number; height: number }, scoped: boolean,
  health = 1,
): { scale: number; pen: [number, number]; bar: Rect; fill: number } {
  const s = frame.height / PS2_HEIGHT, k = scoped ? 0.5 : 1;
  const px = centre[0] / s + (k * box.width) / 2, py = centre[1] / s - (k * box.height) / 2;
  const bx = Math.trunc(px), by = Math.trunc(py - TARGET_BAR.above);
  const h = Math.min(1, Math.max(0, health));
  return {
    scale: s, pen: [Math.trunc(px) * s, Math.trunc(py) * s],
    bar: { x: bx * s, y: by * s, width: (Math.trunc(px + TARGET_BAR.width) - bx) * s, height: (Math.trunc(py - TARGET_BAR.above + TARGET_BAR.height) - by) * s },
    fill: (Math.trunc(px + TARGET_BAR.width * h) - bx) * s,
  };
}

/**
 * The launcher carriers (`FUN_003c5d80` L317279-317300): the M16A2-M203 (52), the M4A1-M203 (61), the MGL (142), the
 * M79 (143), the F2000 (63), and the rocket launchers' class (145-150, `FUN_003d1e10`).
 */
function carrier(id: number): boolean {
  return id === 0x34 || id === 0x3d || id === 0x8e || id === 0x8f || id === 0x3f || (id >= 145 && id <= 150);
}

/**
 * The reticle set a weapon draws (`FUN_005be300` L474894-474950, the kit's `+0x54`): by the view first -- the 9x view
 * 7 (`ret_binocs`), a magnification over 1.01 5 (the scope) -- then a launcher carrier 3 (`ret_rocket`), but an M203
 * rifle (`FUN_003c5e40`: 52, 61) or the F2000 (63) whose slot's fire mode is under 5 -- a rifle mode, not a round's
 * item id (R94.8) -- 1; then by the weapon's `ID` (`EQUIP_ITEM`): 11 (the designator) 9; 4-30 0 (sidearm); 31-80 1
 * (rifle); 81-90 2 (shotgun); 91-120 1; 121-140 and 151-189 4 (grenade); 190-253 0; 151/152 none. -1 draws nothing.
 * `fireMode` is the slot's mode (`kit+0x6fc + 4 x slot`; the rifle modes 1-3, a round's id above).
 */
export function reticleType(weaponId: number, zoomState: number, magnification: number, fireMode = 1): number {
  if (zoomState === 4) return 7;
  if (magnification > 1.01) return 5;
  const id = weaponId & 0xff;
  if (carrier(id)) return (id === 0x34 || id === 0x3d || id === 0x3f) && fireMode < 5 ? 1 : 3;
  if (id === 0x98 || id === 0x97) return -1;
  if (id === 0x0b) return 9;
  if (id >= 4 && id <= 0x1e) return 0;
  if (id >= 0x1f && id <= 0x50) return 1;
  if (id >= 0x51 && id <= 0x5a) return 2;
  if (id >= 0x5b && id <= 0x78) return 1;
  if (id >= 0x79 && id <= 0x8c) return 4;
  if (id >= 0x97 && id <= 0xbd) return 4;
  if (id >= 0xbe && id <= 0xfd) return 0;
  return -1;
}

/**
 * NU-2 G1 (research 320 sections 1 and 8.1): the set of what is in the hand. `FUN_005be300` is asked with the hand's own
 * item -- the switch (`FUN_005c4b10`) asks it again as soon as it has written the new item (D:L478907-478912) -- so with a
 * throwable, a charge or the Detonator up (`item`, its `ID`; null for none) the set is that item's, never the kit's
 * firearm's: 4 for the hand grenades (121-140) and the claymore and PMN (151-189 but 151/152), none (-1) for the C4 and
 * the satchel, 0 for the Detonator (193). A throwable's record has `NumZoomModes 1`, so its magnification stays 1
 * (D:L474917-474921) and it never takes the scope's set; the 9x view's 7 still comes first (D:L474912-474915; the
 * review's finding 2, was: "D:L474896-474899", the function's header).
 */
export function handReticleType(item: number | null, firearmId: number, zoomState: number, magnification: number, fireMode = 1): number {
  return item === null ? reticleType(firearmId, zoomState, magnification, fireMode) : reticleType(item, zoomState, 1, fireMode);
}

/**
 * NU-2 G3: the power the meter is laid at (`FUN_001f7ff0` D:L56673-56688): the controller's `ctrl+0x11c` while the hand
 * holds a hand grenade or a placed charge (`FUN_005b8760` = 3), or 0 when the hand's current magazine -- here the
 * throwables left (`FUN_005c3890` D:L477910-477911) -- is under 1.
 */
export function meterPower(power: number, left: number): number {
  return left < 1 ? 0 : power;
}

/**
 * GRENADE_METER_COLOUR_READING (research 320 sections 2 and 8.2): the meter's GS vertex colours and alphas -- the fill
 * (128, 70, 32) at 64 of 128 (`DAT_0040c0f0..f8` written at the first set-4 change, D:L69390-69395, D:L69403-69404;
 * `DAT_003dc608`, D:L69407-69410), the frame (200, 200, 0) at 36 (D:L69405-69406; `DAT_003dc600`) -- turned into the page's
 * tint by `reticleTint`'s one scale (`meterTint`). The values are read; the conversion is the page's, unmeasured: the
 * capture's frame (h00) measures the drawn figure's colour, a capture of a wind-up the fill's.
 */
export const GRENADE_METER_COLOUR_READING = {
  frame: { rgb: [200, 200, 0] as const, alpha: 36 },
  fill: { rgb: [128, 70, 32] as const, alpha: 64 },
} as const;

/** A meter part's tint (`gsTint`) and its opacity, the GS alpha over 128 (research 320 section 2). */
export function meterTint(part: 'frame' | 'fill'): { rgb: [number, number, number]; opacity: number } {
  const c = GRENADE_METER_COLOUR_READING[part];
  return { rgb: gsTint(c.rgb), opacity: c.alpha / 128 };
}

/** Which of a meter bitmap's decoded rows lies on the meter's centre line (`GRENADE_METER_BITMAP_READING`). */
export type MeterRowOrder = 'first row on the centre line' | 'last row on the centre line';

/**
 * GRENADE_METER_BITMAP_READING (research 320 sections 2 and 8.2; NU-2): the meter's bitmaps as served -- `ret_grenade_02`
 * and `ret_grenade_01`, 64x64 on MP2, MP6 and MP72 (`hudBitmaps.test.ts`), so `W` and `H` are 64, read from the bitmap
 * at the draw -- and which way up they lie: **the decoded first row on the centre line**, read off the code. The GS's v
 * is not the decoded row index: the rifle's arms calibrate it. `FUN_00215250`'s set-1 branch lays the top arm `+0x2b20`
 * as `FUN_00359490` gives it (D:L69829-69831) and the bottom arm `+0x2f00` with `FUN_00358e20`'s swap of its positions
 * (D:L69838-69840, D:L254860-254891), both with v 0 at their outer end; the console frame shows each arm bright at its
 * outer end (this file's header), and the decoded arm is white at row 30 (`hudBitmaps.test.ts`) -- so v 0 holds the
 * decoded last rows (`FUN_00361000` stores v negated, D:L259761-259774). The meter's centre line is v 1 (`FUN_003591d0`
 * D:L254975-254983 over `FUN_00359590` D:L255114-255123), so the decoded first row lies on it. The recompilation's frame
 * h00 (research 320 section 2) agrees, rung by rung within two pixels: a third source, not the deciding one. The same
 * read mirrors u (u 0 at the right edge), real and invisible here: the bitmaps' alpha is mirror-symmetric and their grey
 * differs by 4 at most. (The review's finding 1; was: "`FUN_00213a60` gives each half ... with the texture's v 0 at the
 * outer edge and 1 on the centre line ...; the recompilation's frame h00 shows the decoded bitmap's first rows on the
 * centre line ...; the page lays the decoded rows as the frame shows them: which of the two reads is the GS's own row
 * order is unread" -- the code and the frame do not disagree.) Still a reading: no console capture of the meter.
 */
export const GRENADE_METER_BITMAP_READING: MeterRowOrder = 'first row on the centre line';

/** The rows a meter half shows out to `reach` (0..1 of the half), [on the centre line, at the outer edge], as fractions. */
function meterRows(reach: number, order: MeterRowOrder = GRENADE_METER_BITMAP_READING): [number, number] {
  return order === 'first row on the centre line' ? [0, reach] : [1, 1 - reach];
}

/**
 * GRENADE_METER_CENTRE_READING (research 320 sections 3 and 8.2): under set 4 the HUD lays no size and moves no centre
 * (`FUN_00216770` D:L70415-70434), so the meter stays where the last frame of another set left `hud+0x44ac/+0x44b0` -- the
 * aim point and the firearm's knock then (D:L70421-70424); Init's (320, 224) before any (D:L71139-71140). How much knock
 * is left at the switch's write is unread: a capture of a burst and an M67 taken at once settles it.
 */
export const GRENADE_METER_CENTRE_READING = 'the last firearm frame\'s' as const;

/**
 * C4_RETICLE_READING (research 320 sections 5 and 8.2): the C4 and the satchel have no set (D:L474926-474928), so nothing
 * is drawn, though `FUN_00215c10` keeps a C4 branch that colours the meter's quads (D:L70073-70091) -- quads set -1 never
 * shows. A capture with C4 in hand, at and off a plantable target, settles it.
 */
export const C4_RETICLE_READING = 'nothing' as const;

/** One quad of the throw meter, in frame pixels (y down): its centre and size, and the bitmap's rows it shows. */
export interface MeterQuad {
  bitmap: 'frame' | 'fill';
  /** Above the centre line or below it (the mirror). */
  half: 'top' | 'bottom';
  x: number; y: number; width: number; height: number;
  /** The decoded bitmap's rows, as fractions of its height: [on the centre line, at the outer edge]. */
  rows: [number, number];
}

/**
 * NU-2 G2: the throw meter (`FUN_00213a60` D:L69177-69255; research 320 section 2) on a frame of `frame` pixels about
 * `centre` (frame pixels: `hud+0x44ac/+0x44b0` at the frame's scale) at `power` (0..1), with `W` and `H` the frame
 * bitmap's (`ret_grenade_02`'s texture record, D:L69198-69201) -- a bar `H` wide and `W` tall:
 * - the fill, `ret_grenade_01`, from the centre line up (`+0x270`) and down (`+0x460`) to `power x W/2`, its rows out to
 *   the power: the fill's texture at the frame's density, uncovered from the centre line outward;
 * - the frame, `ret_grenade_02`, the whole bitmap from the centre line up to `W/2` (`+0x650`) and its mirror down
 *   (`+0x840`).
 * In that order (`ChangeReticule` D:L69399-69402). The PS2 pixel is height / 448 of the frame, as the cross's.
 */
export function meterLayout(
  frame: { width: number; height: number }, centre: [number, number], power: number, bitmap: { width: number; height: number },
): { scale: number; centre: [number, number]; quads: MeterQuad[]; rect: Rect } {
  const s = frame.height / PS2_HEIGHT;
  const [cx, cy] = centre;
  const width = bitmap.height * s, half = (bitmap.width / 2) * s, fill = power * half;
  const quads: MeterQuad[] = [
    { bitmap: 'fill', half: 'top', x: cx, y: cy - fill / 2, width, height: fill, rows: meterRows(power) },
    { bitmap: 'fill', half: 'bottom', x: cx, y: cy + fill / 2, width, height: fill, rows: meterRows(power) },
    { bitmap: 'frame', half: 'top', x: cx, y: cy - half / 2, width, height: half, rows: meterRows(1) },
    { bitmap: 'frame', half: 'bottom', x: cx, y: cy + half / 2, width, height: half, rows: meterRows(1) },
  ];
  return { scale: s, centre: [cx, cy], quads, rect: { x: cx - width / 2, y: cy - half, width, height: 2 * half } };
}

/**
 * The sets' bitmaps (`BitmapReticule_Init` 0x2178c0: `hud+0x44bc + 4 x type` the fixed part, `hud+0x44e8 + 4 x type`
 * the floating one). The ring-and-arms sets swap into the ring's and the arms' meshes; the scope (5) and the binoculars
 * (7) have their own draws, and so does the grenade's (4): the throw meter (`meterLayout`, NU-2), whose fill
 * `ret_grenade_01` is loaded apart (`hud+0x4514`, D:L70867-70868).
 */
export const RETICLE_SETS: Record<number, { fixed: string; floating: string | null }> = {
  0: { fixed: 'ret_sidearm_01.tif', floating: 'ret_sidearm_02.tif' },
  1: { fixed: 'ret_rifle_01.tif', floating: 'ret_rifle_02.tif' },
  2: { fixed: 'ret_shotgun_01.tif', floating: 'ret_shotgun_02.tif' },
  3: { fixed: 'ret_rocket_01.tif', floating: 'ret_rocket_02.tif' },
  4: { fixed: 'ret_grenade_02.tif', floating: null },
  5: { fixed: 'ret_scope_02.tif', floating: null },
  6: { fixed: 'ret_scope_01.tif', floating: null },
  7: { fixed: 'ret_binocs.tif', floating: 'ret_binocs2.tif' },
  8: { fixed: 'nvg_part.tif', floating: null },
  9: { fixed: 'ret_sidearm_01.tif', floating: 'ret_laser_designator.tif' },
};

export interface Rect { x: number; y: number; width: number; height: number }

/**
 * One HUD quad in frame pixels, y down: its centre, its size before the turn, and the quarter turns it is drawn
 * with (clockwise on the screen). `floating` turns 0 is the arm as stored, pointing down. `flipX` / `flipY` mirror the
 * decoded bitmap across / down before the turn (the corners' and the launcher's sight's mirrors, NU-3a); absent, none.
 * `sight` is set 3's big sight (`ChangeReticule` D:L69595-69652): the fixed bitmap as four quads at the frame's centre.
 */
export interface Quad {
  part: 'fixed' | 'floating' | 'sight'; x: number; y: number; width: number; height: number; turns: 0 | 1 | 2 | 3;
  flipX?: boolean; flipY?: boolean;
}

/** The served bitmaps' sizes a set is laid with (read at the draw): the fixed part's and the floating part's, in texels. */
export interface ReticleSizes { fixed: number; arm: number; fixedH?: number; armH?: number }

/** How a set lays its parts (research 321 section 2): the cross (sets 0, 1 and the rest), the corners (2), the launcher's (3). */
export type ReticleShape = 'cross' | 'corners' | 'launcher';

/** The shape of a set (`FUN_00215250` D:L69799-69841 by `hud+0x44b8`; `ChangeReticule` D:L69595-69652 for set 3). */
export function reticleShape(set: number): ReticleShape {
  return set === 2 ? 'corners' : set === 3 ? 'launcher' : 'cross';
}

/** Set 3's corners: the floating bitmap's `W` and `H` x 0.7 while they are laid (`FUN_00215250` D:L69800-69803, D:L69819-69822). */
export const LAUNCHER_CORNER_SCALE = 0.7;
/** Set 3's sight: each of its four quads the fixed bitmap's `W` and `H` x 0.7 (`ChangeReticule` D:L69597-69599). */
export const LAUNCHER_SIGHT_SCALE = 0.7;
/** The sight's sampled texture window (`FUN_00359140` on its four quads, D:L69645-69652: 0x3c23d70a, 0x3f7d70a4). */
export const LAUNCHER_SIGHT_UV = { u0: 0.01, u1: 0.99, v0: 0.01, v1: 0.99 } as const;

/**
 * LAUNCHER_SIGHT_READING (research 321 sections 2.3 and 7.2, NU-3a C2): how set 3's four sight quads show `ret_rocket_01`,
 * as `[flipX, flipY]` of the decoded bitmap before a quarter turn clockwise, in `ChangeReticule`'s order -- `+0xa30` the
 * upper left, `+0xc20` the upper right, `+0xe10` the lower left, `+0x1000` the lower right (D:L69595-69652). The vertices
 * are read: each quad from its outer corner to the frame's centre (320, 224), mirrored about the centre lines, with the
 * UVs (0.01, 0.01), (0.01, 0.99), (0.99, 0.99), (0.99, 0.01) in that order (`FUN_00359590`, `FUN_00359140`) -- u down the
 * upper left's left edge, v along its top, so the bitmap lies transposed. Not read: which decoded row v 0 is -- research
 * 320's `GRENADE_METER_BITMAP_READING`, the decoded last row; with it the decoded top-right corner meets the frame's centre,
 * where the served `ret_rocket_01` (64x64) has its dot, and the quarter disc about it closes into one ring of radius about
 * 41 pixels (59 texels x 0.7; `hudBitmaps.test.ts`). Settled by a capture of the M79 and the LAW raised.
 */
export const LAUNCHER_SIGHT_READING: readonly (readonly [boolean, boolean])[] = [[false, false], [false, true], [true, false], [true, true]];

/**
 * SHOTGUN_CORNER_READING (research 321 sections 2.2 and 7.2, NU-3a C1): how each corner quad shows the floating bitmap,
 * as `[flipX, flipY]` of the decoded bitmap, unturned, in `FUN_00215250`'s order -- `+0x2930` the upper right, `+0x2b20`
 * the upper left, `+0x2d10` the lower left, `+0x2f00` the lower right (D:L69799-69823): **the decoded top-right corner on
 * the square's corner, the four mirrored about the centre lines.** The rectangles are read; this is not: the three UV
 * permutations (`FUN_00358d50` the upper right, `FUN_00358e20` the lower left, `FUN_00358cc0` the lower right; the upper
 * left none, D:L254804-254890) map onto the quad's corners through the first triangle's vertex order, which the
 * decompiler loses (`FUN_00359490` D:L255082-255092). Read so: the upper left "as stored" holds the decoded last row at
 * its top (research 320's `GRENADE_METER_BITMAP_READING`, the rifle's arms against the console frame), the lower left
 * `FUN_00358e20`'s vertical mirror of it, the upper right `FUN_00358d50`'s mirror across, the lower right
 * `FUN_00358cc0`'s swap of the upper left's and the lower right's corners -- taken with the first triangle (A, B, C),
 * an assumption the rifle's left arm does not bear out, so not a reading of the code alone. The served bitmaps agree:
 * `ret_shotgun_02` (32x32) is one arc of radius 16 about its decoded top-right corner, `ret_rocket_02` (64x64, set 3's
 * corners, laid by the same branch at 0.7) one tangent stroke beside its own (`hudBitmaps.test.ts`), and the scope's
 * quads meet at the same corner (`scopeLayout`). Settled by a capture of the 870 at rest and walking.
 */
export const SHOTGUN_CORNER_READING: readonly (readonly [boolean, boolean])[] = [[true, true], [false, true], [false, false], [true, false]];

/**
 * The reticle's quads on a frame of `frame` pixels, centred on the aim point `aim` (0..1 across and down) moved by
 * `offset` (PS2 pixels, y down: the knock), the arms pushed out by `size` (PS2 pixels, the HUD's drawn size, >= 0),
 * laid by `set`'s shape (`reticleShape`; NU-3a: the corners and the launcher's; was, before NU-3a: every set the cross)
 * with the served bitmaps' sizes. `rect` is the quads' bounding box.
 */
export function reticleLayout(
  frame: { width: number; height: number }, aim: [number, number], size: number, offset: [number, number] = [0, 0],
  bitmaps: ReticleSizes = { fixed: FIXED, arm: ARM }, set = 1,
): { scale: number; centre: [number, number]; quads: Quad[]; rect: Rect } {
  const s = frame.height / PS2_HEIGHT;
  const cx = aim[0] * frame.width + offset[0] * s, cy = aim[1] * frame.height + offset[1] * s;
  const arm = bitmaps.arm, fixed = bitmaps.fixed, fixedH = bitmaps.fixedH ?? fixed;
  const shape = reticleShape(set);
  // The ring (`hud+0x70`) at its own size on the centre (D:L69654-69662, D:L70425-70431); set 3 hides it (D:L69604)
  // and shows its sight instead, at the frame's centre (`sightQuads`).
  const quads: Quad[] = shape === 'launcher'
    ? sightQuads(s, frame.width / 2, frame.height / 2, fixed, fixedH)
    : [{ part: 'fixed', x: cx, y: cy, width: fixed * s, height: fixedH * s, turns: 0 }];
  if (shape === 'cross') quads.push(...crossArms(s, cx, cy, size, arm));
  else quads.push(...cornerQuads(s, cx, cy, size, arm, bitmaps.armH ?? arm, shape === 'launcher' ? LAUNCHER_CORNER_SCALE : 1));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of quads) {
    const [hw, hh] = q.turns % 2 === 0 ? [q.width / 2, q.height / 2] : [q.height / 2, q.width / 2];
    x0 = Math.min(x0, q.x - hw); x1 = Math.max(x1, q.x + hw);
    y0 = Math.min(y0, q.y - hh); y1 = Math.max(y1, q.y + hh);
  }
  return { scale: s, centre: [cx, cy], quads, rect: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } };
}

/**
 * Sets 0 and 1 (and every set but 2): the cross. `FUN_00215250`: an arm's quad is its bitmap's own size, `size` pixels
 * out from the centre and its long side against the centre line shifted 1 over (the rifle's measured core, texel column
 * 30.5 of 32: 1.5 - arm / 2 across). In the page's order: down (the arm as stored), left, up, right.
 */
function crossArms(s: number, cx: number, cy: number, size: number, arm: number): Quad[] {
  const reach = arm + Math.max(0, size);
  const out: Quad[] = [];
  // The arm as stored, pointing down: its core on the vertical through the aim point, its outer end `reach` out.
  let dx = (arm === ARM ? ARM / 2 - ARM_CORE : 1.5 - arm / 2) * s, dy = (reach - arm / 2) * s;
  for (const turns of [0, 1, 2, 3] as const) {
    out.push({ part: 'floating', x: cx + dx, y: cy + dy, width: arm * s, height: arm * s, turns });
    [dx, dy] = [-dy, dx];                          // a quarter turn clockwise on a y-down screen
  }
  return out;
}

/**
 * Set 2: the corners (`FUN_00215250` D:L69799-69823; research 321 section 2.2). Each a quad of the floating bitmap's
 * `W` x `H` with one corner on a corner of the square of half side `size` about the centre -- the upper right x
 * `cx + size` .. `+ W`, y `cy - size - H` .. `cy - size`, the upper left, the lower left, the lower right likewise -- so
 * they go out on the diagonals as the size grows; no 1-pixel shift (the cross's `+ 1` is its branch's alone). Their
 * mirrors are `SHOTGUN_CORNER_READING`'s. In the code's order: `+0x2930`, `+0x2b20`, `+0x2d10`, `+0x2f00`. Set 3 lays
 * the same branch at `k` = `LAUNCHER_CORNER_SCALE` of the bitmap (D:L69800-69803).
 */
function cornerQuads(s: number, cx: number, cy: number, size: number, W: number, H: number, k = 1): Quad[] {
  const d = Math.max(0, size) * s, w = W * k * s, h = H * k * s;
  const at: [number, number][] = [[cx + d + w / 2, cy - d - h / 2], [cx - d - w / 2, cy - d - h / 2], [cx - d - w / 2, cy + d + h / 2], [cx + d + w / 2, cy + d + h / 2]];
  return at.map(([x, y], i): Quad => {
    const [flipX, flipY] = SHOTGUN_CORNER_READING[i]!;
    return { part: 'floating', x, y, width: w, height: h, turns: 0, flipX, flipY };
  });
}

/**
 * Set 3's sight (`ChangeReticule` D:L69595-69652; research 321 section 2.3): the fixed bitmap (`ret_rocket_01`) as four
 * quads of `LAUNCHER_SIGHT_SCALE` its `W` x `H`, each with one corner on the frame's centre (`fx`, `fy`: (320, 224) on the
 * PS2's frame) -- laid once at the change and never moved by the frame (D:L70425-70431 moves the ring only), so the knock
 * climbs the corners and not the sight. Each turned a quarter (the UVs run transposed) and mirrored by
 * `LAUNCHER_SIGHT_READING`, so the screen rectangle is `0.7 W` across and `0.7 H` down.
 */
function sightQuads(s: number, fx: number, fy: number, W: number, H: number): Quad[] {
  const w = W * LAUNCHER_SIGHT_SCALE * s, h = H * LAUNCHER_SIGHT_SCALE * s;
  const at: [number, number][] = [[fx - w / 2, fy - h / 2], [fx + w / 2, fy - h / 2], [fx - w / 2, fy + h / 2], [fx + w / 2, fy + h / 2]];
  return at.map(([x, y], i): Quad => {
    const [flipX, flipY] = LAUNCHER_SIGHT_READING[i]!;
    return { part: 'sight', x, y, width: h, height: w, turns: 1, flipX, flipY };   // before the turn: H across, W down
  });
}

/**
 * The scope's four quads on a frame (`ChangeReticule` type 5): 320 PS2 pixels a side around the frame's centre, each
 * the bitmap mirrored so the tube's centre -- the decoded bitmap's top-right corner -- meets the frame's centre.
 * `flipX`/`flipY` mirror the stored bitmap. The black bars beyond the 640-wide square fill a wider frame.
 */
export function scopeLayout(frame: { width: number; height: number }): {
  quads: { x: number; y: number; size: number; flipX: boolean; flipY: boolean }[]; bars: Rect[];
} {
  const s = frame.height / PS2_HEIGHT, q = SCOPE_QUAD * s;
  const cx = frame.width / 2, cy = frame.height / 2;
  const quads = [
    { x: cx - q / 2, y: cy - q / 2, size: q, flipX: false, flipY: true },      // top-left: centre at its bottom-right
    { x: cx + q / 2, y: cy - q / 2, size: q, flipX: true, flipY: true },       // top-right
    { x: cx - q / 2, y: cy + q / 2, size: q, flipX: false, flipY: false },     // bottom-left: as stored
    { x: cx + q / 2, y: cy + q / 2, size: q, flipX: true, flipY: false },      // bottom-right
  ];
  const side = Math.max(0, cx - q);
  const bars = side > 0 ? [{ x: 0, y: 0, width: side, height: frame.height }, { x: frame.width - side, y: 0, width: side, height: frame.height }] : [];
  return { quads, bars };
}

// ---- THREAT-MARKS: the eight `ret_threat` quads (`FUN_00215250` D:L69842-69899; research 321 section 2.6) ----------------

/** The gap past the arm's outer end, PS2 pixels: 15.0 (0x41700000; `FUN_00215250` D:L69842, D:L69847, D:L69851, D:L69857). */
export const THREAT_GAP = 15;

/**
 * The diagonals' position factors `DAT_003dc5b8..f0` (the r0001 ELF's words, read 2026-11-09: 0.9, 0.6, 0.65, 0.5, 0.9,
 * 0.6, 0.65, 0.52; the same bits at r0004 0x407738..0x407770): each diagonal's laid centre is the reticle's corner
 * `cx +- r, cy +- r` plus `[x, y]` times `(Aw + 15, Ah + 15)` outward (D:L69863-69898). Position multipliers, not tints.
 */
export const THREAT_DIAGONAL_FACTORS = {
  frontRight: [0.9, 0.6], backRight: [0.65, 0.5], frontLeft: [0.9, 0.6], backLeft: [0.65, 0.52],
} as const;

/** The diagonals' turns, degrees, positive clockwise on the y-down screen (0xc2340000 -45, 0x42340000 +45; D:L69869, D:L69878, D:L69888, D:L69898). */
export const THREAT_DIAGONAL_TURNS = { frontRight: -45, backRight: 45, frontLeft: 45, backLeft: -45 } as const;

/** The quads' texture window (`FUN_003591d0` at HUD init, D:L71010: 0x3cf5c28f = 0.03 to 1.0 on both axes). */
export const THREAT_UV = { u0: 0.03, v0: 0.03, u1: 1, v1: 1 } as const;

/** Set 5's forced arm size (`DAT_003dc5f8` = 32.0, `ChangeReticule` D:L69309-69315; the r0001 ELF word read 2026-11-09). */
export const THREAT_SET5_ARM = 32;

/**
 * THREAT_QUAD_ORIENTATION_READING (SCOPE 1.4; research 320's `GRENADE_METER_BITMAP_READING`): which way the wedges point.
 * The corner algebra is read -- the permutations move the position slots against fixed UVs (`FUN_00358cc0` /
 * `FUN_00358e20` D:L254802-254891 over `FUN_00359260` D:L254987-255003, `FUN_003591d0` D:L254975-254983), so relative to
 * the top quad (screen (x, y) = (u, v)) `cc0` gives (1 - v, 1 - u), `e20` (u, 1 - v) and both (v, 1 - u), and the
 * diagonals turn their cardinal's image: all eight point one way. Which way is the one bit of
 * `GRENADE_METER_BITMAP_READING` (v 0 shows the decoded last rows): under it, **outward**, toward the threat. Not a second
 * free constant: `threatLayout` takes the row order and the wedges flip together with that reading. A capture that
 * settles it (the grenade meter, any HUD sprite's row order, or one lit mark) settles this.
 */
export const THREAT_QUAD_ORIENTATION_READING = 'outward, from GRENADE_METER_BITMAP_READING' as const;

/**
 * THREAT_ALPHA_SCALE_READING (SCOPE section 2): the port's opacity of a mark is its PS2 alpha over 128 (the GS's vertex
 * alpha on the bitmap's own alpha, 128 opaque: the sprite constructor `FUN_00359640` D:L255128), as the pip's
 * (`PIP_FULL`): the peak 50 shows at 50/128 = 0.39.
 */
export const THREAT_ALPHA_SCALE_READING = 128;

/**
 * THREAT_SCOPED_SETS_READING (SCOPE 1.4): the draw's guard `*(hud + set x 0x1f0 + 0x2b10)` for sets 4-10 reads `+0x150`
 * of the HUD constructor's overlay sprites (`hud+0x3180`, `hud+0x3940`, D:L71221-71222) -- triangle 2's vertex-1 red,
 * 128.0 from the constructor and written by no HUD code -- so the block runs under sets 5-10 with each set's `Aw`/`Ah`
 * (set 4 is skipped by the HUD frame and laid once by ChangeReticule). Read by offset arithmetic and a grep, pending
 * review; a write through a pointer is not excluded.
 */
export const THREAT_SCOPED_SETS_READING = 'laid under sets 5-10' as const;

/**
 * THREAT_DEAD_FADE_READING (SCOPE 1.4, section 2; dot's scope review F3): at a death ChangeReticule(-1) hides only the
 * first four sprites (right, front-right, top, front-left: D:L69339-69347 and the other set branches), the HUD frame
 * relays all eight under set -1 with the previous set's `Aw`/`Ah` (D:L70415-70434, D:L69298-69316), and the last four
 * (left, back-left, bottom, back-right) are never hidden: they keep fading. The page draws the eight outside the
 * reticle's dead gate (`reticleShown`) with that per-quad rule.
 */
export const THREAT_DEAD_FADE_READING = 'quads 0-3 hide, 4-7 keep fading' as const;

/** The sets under which ChangeReticule leaves the first four threat sprites as they were (6, 8, 10: D:L69339-69591). */
export const THREAT_LEAVE_SETS: ReadonlySet<number> = new Set([6, 8, 10]);

/** A threat quad's vertex in frame pixels (y down) and the decoded bitmap's texture coordinate there (s across, t down the rows). */
export interface ThreatVertex { x: number; y: number; s: number; t: number }

/**
 * One laid threat quad: its two triangles' six vertices in the sprite's slot order -- triangle 1 `+0xd0`, `+0xe0`,
 * `+0xf0`, triangle 2 `+0x1a0`, `+0x1b0`, `+0x1c0`, each slot with its fixed UV ((u0, v0), (u0, v1), (u1, v1) and
 * (u0, v0), (u1, v1), (u1, v0)) -- and its alpha (PS2 scale).
 */
export interface ThreatQuadLayout { quad: ThreatQuad; vertices: ThreatVertex[]; alpha: number }

type Slot = [number, number];
interface Slots { d0: Slot; e0: Slot; f0: Slot; a0: Slot; b0: Slot; c0: Slot }

/** `FUN_00359260` (D:L254987-255003): a `w` x `h` box about `p`, the slots top-left, bottom-left, bottom-right; top-left, bottom-right, top-right. */
function threatBox(w: number, h: number, p: Slot): Slots {
  const x0 = p[0] - w / 2, x1 = p[0] + w / 2, y0 = p[1] - h / 2, y1 = p[1] + h / 2;
  return { d0: [x0, y0], e0: [x0, y1], f0: [x1, y1], a0: [x0, y0], b0: [x1, y1], c0: [x1, y0] };
}

/** `FUN_00358cc0` (D:L254802-254825): the position slots moved, in the code's order. */
function cc0(s: Slots): Slots {
  const d0 = s.f0, f0 = s.a0, b0 = s.a0, a0 = d0;
  return { d0, e0: s.e0, f0, a0, b0, c0: s.c0 };
}

/** `FUN_00358e20` (D:L254860-254891): the position slots moved, in the code's order. */
function e20(s: Slots): Slots {
  const d0 = s.e0, e0 = s.a0, a0 = d0, b0 = s.c0, c0 = s.f0, f0 = b0;
  return { d0, e0, f0, a0, b0, c0 };
}

/**
 * `FUN_003589d0` (D:L254725-254800): a turn of `deg` degrees about the pivot the slots give -- x from `+0xe0` and `+0xf0`,
 * y from `+0xd0` and `+0xe0`, each `max(a, b) + (a - b) / 2` as the code has it -- of `+0xd0`, `+0xe0`, `+0xf0` and
 * `+0x1c0`, new x = x cos - y sin, new y = x sin + y cos (`FUN_001b3720` sinf, `FUN_001b3548` cosf); then `+0x1a0` =
 * `+0xd0` and `+0x1b0` = `+0xf0`. With y down a positive turn is clockwise on the screen.
 */
function turn(deg: number, s: Slots): Slots {
  const px = (s.e0[0] - s.f0[0]) * 0.5 + Math.max(s.e0[0], s.f0[0]);
  const py = (s.d0[1] - s.e0[1]) * 0.5 + Math.max(s.d0[1], s.e0[1]);
  const r = deg * 0.017453292, sin = Math.sin(r), cos = Math.cos(r);
  const at = ([x, y]: Slot): Slot => { const dx = x - px, dy = y - py; return [dx * cos - dy * sin + px, dy * cos + dx * sin + py]; };
  const d0 = at(s.d0), e0 = at(s.e0), f0 = at(s.f0), c0 = at(s.c0);
  return { d0, e0, f0, a0: d0, b0: f0, c0 };
}

/**
 * `ChangeReticule`'s `Aw`/`Ah` for a set (D:L69298-69316): the set's floating bitmap's size, else its fixed one's
 * (`hud+0x44e8 + 4 set`, `hud+0x44bc + 4 set`) -- `Aw` halved under set 4, both `THREAT_SET5_ARM` under set 5 -- or null
 * where the set has no bitmap (the last kept) and under set -1 (ChangeReticule writes none).
 */
export function threatArm(set: number, bitmap: { width: number; height: number } | null): { w: number; h: number } | null {
  if (set === -1 || !bitmap) return null;
  if (set === 4) return { w: bitmap.width * 0.5, h: bitmap.height };
  if (set === 5) return { w: THREAT_SET5_ARM, h: THREAT_SET5_ARM };
  return { w: bitmap.width, h: bitmap.height };
}

/**
 * THREAT-MARKS (research 321 section 2.6; `FUN_00215250` D:L69842-69899): the eight `ret_threat` quads on a frame of
 * `frame` pixels about the reticle's centre `centre` (frame pixels: `hud+0x44ac/+0x44b0`), `size` the reticle's drawn
 * size (`r`, PS2 pixels), `arm` ChangeReticule's `Aw`/`Ah` (`threatArm`), `bitmap` ret_threat's `Tw`/`Th`, and the
 * actor's breadths and alphas (`./threatMarks`). In PS2 pixels scaled by `frame.height / 448`, so one layout serves the
 * PS2 and the Modern pictures. Per quad, in the HUD's order (`THREAT_QUADS`):
 * - the box about its laid centre P (`FUN_00359260`): the side and diagonal quads `Tw` x `Th x f`, the top and bottom
 *   `Tw x f` x `Th` (the breadth float scales the mark's breadth, not its length) -- right P = (cx + r + Aw + 15, cy - 1),
 *   top (cx + 1, cy - r - Ah - 15), left (cx - r - Aw - 15, cy - 1), bottom (cx + 1, cy + r + Ah + 15), and the
 *   diagonals from the reticle's corners by `THREAT_DIAGONAL_FACTORS`;
 * - the permutation of its slots (right, front-right, back-right `cc0`; top none; front-left, left, back-left `cc0` then
 *   `e20`; bottom `e20`);
 * - for a diagonal, the turn about its pivot corner (`turn`: bottom-left after `cc0`, bottom-right after `cc0` + `e20`)
 *   by `THREAT_DIAGONAL_TURNS`, so its drawn centre moves with its breadth.
 * A diagonal whose alpha is not above 0 is not laid (`0.0 < alpha`, D:L69863, D:L69872, D:L69881, D:L69891): null. Each vertex carries the decoded bitmap's
 * coordinate under `order` (`GRENADE_METER_BITMAP_READING`: v 0 the decoded last rows, and by the same read u 0 the decoded
 * last columns -- "the same read mirrors u (u 0 at the right edge)", its doc above; invisible on the meter's symmetric
 * bitmaps, visible on ret_threat's row 5, the review's F3; `THREAT_QUAD_ORIENTATION_READING`). Flipped, both go together.
 */
export function threatLayout(
  frame: { width: number; height: number }, centre: [number, number], size: number, arm: { w: number; h: number },
  bitmap: { width: number; height: number }, values: ThreatValues, order: MeterRowOrder = GRENADE_METER_BITMAP_READING,
): (ThreatQuadLayout | null)[] {
  const s = frame.height / PS2_HEIGHT;
  const r = size, Tw = bitmap.width, Th = bitmap.height, ox = arm.w + THREAT_GAP, oy = arm.h + THREAT_GAP;
  const b = values.breadth, alpha = values.alpha;
  const F = THREAT_DIAGONAL_FACTORS, T = THREAT_DIAGONAL_TURNS;
  // In PS2 pixels about the centre (cx, cy) = (0, 0): the code's fVar12 = cx + r, fVar6 = cx - r, fVar10 = cy - r,
  // fVar13 = cy + r, fVar11 = cx + 1, fVar9 = cy - 1 (D:L69769-69778).
  const plan: { quad: ThreatQuad; w: number; h: number; p: Slot; perm: 'none' | 'cc0' | 'e20' | 'both'; deg: number }[] = [
    { quad: 'right', w: Tw, h: Th * b[0]!, p: [r + ox, -1], perm: 'cc0', deg: 0 },
    { quad: 'frontRight', w: Tw, h: Th * b[1]!, p: [r + F.frontRight[0] * ox, -r - F.frontRight[1] * oy], perm: 'cc0', deg: T.frontRight },
    { quad: 'front', w: Tw * b[2]!, h: Th, p: [1, -r - oy], perm: 'none', deg: 0 },
    { quad: 'frontLeft', w: Tw, h: Th * b[3]!, p: [-r - F.frontLeft[0] * ox, -r - F.frontLeft[1] * oy], perm: 'both', deg: T.frontLeft },
    { quad: 'left', w: Tw, h: Th * b[4]!, p: [-r - ox, -1], perm: 'both', deg: 0 },
    { quad: 'backLeft', w: Tw, h: Th * b[5]!, p: [-r - F.backLeft[0] * ox, r + F.backLeft[1] * oy], perm: 'both', deg: T.backLeft },
    { quad: 'back', w: Tw * b[6]!, h: Th, p: [1, r + oy], perm: 'e20', deg: 0 },
    { quad: 'backRight', w: Tw, h: Th * b[7]!, p: [r + F.backRight[0] * ox, r + F.backRight[1] * oy], perm: 'cc0', deg: T.backRight },
  ];
  const mirrored = order === 'first row on the centre line';
  const rowOf = (v: number): number => (mirrored ? 1 - v : v);
  const columnOf = (u: number): number => (mirrored ? 1 - u : u);   // review F3: the reading's u mirror
  const { u0, v0, u1, v1 } = THREAT_UV;
  const uv: [number, number][] = [[u0, v0], [u0, v1], [u1, v1], [u0, v0], [u1, v1], [u1, v0]];
  return plan.map(({ quad, w, h, p, perm, deg }, i) => {
    if (deg !== 0 && !(alpha[i]! > 0)) return null;
    let sl = threatBox(w, h, p);
    if (perm === 'cc0' || perm === 'both') sl = cc0(sl);
    if (perm === 'e20' || perm === 'both') sl = e20(sl);
    if (deg !== 0) sl = turn(deg, sl);
    const slots = [sl.d0, sl.e0, sl.f0, sl.a0, sl.b0, sl.c0];
    const vertices = slots.map(([x, y], k): ThreatVertex => ({
      x: centre[0] + x * s, y: centre[1] + y * s, s: columnOf(uv[k]![0]), t: rowOf(uv[k]![1]),
    }));
    return { quad, vertices, alpha: alpha[i]! };
  });
}


/** What the HUD pass needs of three's renderer (a `WebGPURenderer` in the page). */
export interface HudRenderer {
  autoClear: boolean;
  render(scene: Scene, camera: Camera): unknown;
  getDrawingBufferSize(target: Vector2): Vector2;
}

function texture(rgba: Rgba, rowsReversed = false): DataTexture {
  // Row 0 of the decode is the bitmap's top row; the HUD camera looks with y down, so it is uploaded unflipped.
  const t = new DataTexture(rgba.data, rgba.width, rgba.height, RGBAFormat, UnsignedByteType);
  hdTextures.register(t, rgba, rowsReversed);   // OT.R92 (HD-3): inert until the test room's HD pack is set
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  t.generateMipmaps = false;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

/**
 * The HUD layer: an orthographic scene in frame pixels (y down), drawn after the world with `autoClear` off and
 * no depth test. `setAimPoint` and `setVisible` are the page's; `render` is called once a frame after the world.
 */
/** The binoculars' two bitmaps (`BitmapReticule_Init` 0x2178c0: set 7's fixed and floating parts), drawn in this order. */
export const BINOCULAR_BITMAPS: readonly string[] = ['ret_binocs.tif', 'ret_binocs2.tif'];

/** The binoculars' sampled texture window (`ChangeReticule` type 7's `FUN_00359140` UVs: 0x3c23d70a, 0x3f7851ec, 0x3f7d70a4). */
export const BINOCULAR_UV = { u0: 0.01, u1: 0.97, v0: 0.01, v1: 0.99 } as const;

/**
 * The binoculars' quads on a frame (`ChangeReticule` type 7, 69548-69566): for each of `ret_binocs` and `ret_binocs2`,
 * the left lens (0, 0)-(320, 448) as stored and the right (319, 0)-(640, 448) mirrored, in PS2 pixels on the 640x448
 * frame, scaled by the frame's height and centred across it; on a wider frame (Modern 16:9) black bars fill the sides
 * beyond the 640-wide mask, as the scope's do. Each quad: its centre, size, whether mirrored, and its bitmap.
 */
export function binocularsLayout(frame: { width: number; height: number }): {
  quads: { x: number; y: number; width: number; height: number; flipX: boolean; bitmap: string }[]; bars: Rect[];
} {
  const s = frame.height / PS2_HEIGHT;
  const left = frame.width / 2 - 320 * s, cy = frame.height / 2, h = PS2_HEIGHT * s;
  const quads: { x: number; y: number; width: number; height: number; flipX: boolean; bitmap: string }[] = [];
  for (const bitmap of BINOCULAR_BITMAPS) {
    quads.push({ x: left + 160 * s, y: cy, width: 320 * s, height: h, flipX: false, bitmap });       // (0, 0)-(320, 448)
    quads.push({ x: left + 479.5 * s, y: cy, width: 321 * s, height: h, flipX: true, bitmap });      // (319, 0)-(640, 448)
  }
  const side = Math.max(0, left);
  const bars = side > 0 ? [{ x: 0, y: 0, width: side, height: frame.height }, { x: frame.width - side, y: 0, width: side, height: frame.height }] : [];
  return { quads, bars };
}

/**
 * The night vision's goggles (`BitmapReticule_Init` 70940-70975, shown by `ChangeReticule` while the view is 3):
 * `nvg_part.tif` (256x256: a green inside at PS2 alpha 22, a dark opaque rim) as four mirrored quads of 320x224 over
 * the whole 640x448 frame, meeting at its centre -- the decoded bitmap's top-right corner, as the scope's.
 */
export function nightLayout(frame: { width: number; height: number }): {
  quads: { x: number; y: number; width: number; height: number; flipX: boolean; flipY: boolean }[]; bars: Rect[];
} {
  const s = frame.height / PS2_HEIGHT, w = 320 * s, h = 224 * s;
  const cx = frame.width / 2, cy = frame.height / 2;
  const quads = [
    { x: cx - w / 2, y: cy - h / 2, width: w, height: h, flipX: false, flipY: true },
    { x: cx + w / 2, y: cy - h / 2, width: w, height: h, flipX: true, flipY: true },
    { x: cx - w / 2, y: cy + h / 2, width: w, height: h, flipX: false, flipY: false },
    { x: cx + w / 2, y: cy + h / 2, width: w, height: h, flipX: true, flipY: false },
  ];
  const side = Math.max(0, cx - w);
  const bars = side > 0 ? [{ x: 0, y: 0, width: side, height: frame.height }, { x: frame.width - side, y: 0, width: side, height: frame.height }] : [];
  return { quads, bars };
}

/** What the HUD pass draws over the world: the weapon's reticle, the scope (states 5-12), the binoculars (state 4). */
export type ReticleMode = 'reticle' | 'scope' | 'binoculars';

/**
 * Whether the page draws the reticle this frame. The game's HUD frame sets the weapon's reticle (`FUN_00213e20`,
 * ChangeReticule) only while the player is alive (`FUN_00216770` L70391-70412, the `+0xe1` alive bit); dead it sets
 * -1 (L70413), which draws nothing (L70427) -- from the death through the death camera to the spawn that makes the
 * player alive again (the owner, 2026-10-02: "on the death cam, the crosshair should be hidden"). `dead` is the walk's
 * flag (`WalkMode.isDead`: the net client's `kill` to its `spawn`). The rest are the page's other gates: walking, the
 * tactical map, the scoreboard (research 87 §12, L56808-56828) and a round screen. The reticle's own state -- its set,
 * the scope's and the binoculars' overlays -- is set every frame as before and untouched here.
 *
 * PAR-94 B2 (research 322 §4.1 B2, D2): `spawned` beside `walking`. The original's HUD update, the reticle's set and its
 * own update included, runs only under the camera's actor (`FUN_001f7ff0`: the actor read D:L56540, the gate D:L56631),
 * which the load has made before the core state's first frame (R322.3). The port's page has no actor of the room's until
 * the room's `spawn` for it -- the default kit the mount hangs is no kit the room gave -- so `spawned` is the page's own
 * `spawn` heard this match (the deps' `respawned`, from `NetPage`'s `case 'spawn'`), and `/testroom`'s through
 * `pageSpawned` (B3). Was: `{ walking, dead, tacMap, scoreboard, screenUp }`, the reticle drawn from the first frame.
 */
export function reticleShown(o: { walking: boolean; spawned: boolean; dead: boolean; tacMap: boolean; scoreboard: boolean; screenUp: boolean }): boolean {
  return o.walking && o.spawned && !o.dead && !o.tacMap && !o.scoreboard && !o.screenUp;
}

/**
 * PAR-94 B3 (research 322 §4.1 B3, D5; the sprint 40 ledger's C84): `/testroom`'s `spawned` -- whether its frame draws the
 * walker's kit, the HUD and the reticle, at all. Not while its ARMORY is open: the original has no HUD while an
 * equipment screen is up (the lobby's ARMORY is a menu state's; offline the mission's selection comes before the load,
 * R322.7), where the page drew it under the ARMORY's letterbox. And, where the page has a room (the offline single-player
 * room, or a server's), only once that room has spawned the page (B2's gate, the actor: `FUN_001f7ff0` D:L56631). A page
 * with no room -- the test room's free walk, which no room ever spawns -- draws it as before.
 */
export function pageSpawned(o: { room: boolean; spawned: boolean; armoryOpen: boolean }): boolean {
  return !o.armoryOpen && (!o.room || o.spawned);
}

export class Reticle {
  private readonly sampling = new UiTextureExperiment();
  /** Test-room-only browser experiment (research 260); aim, spread and timing stay in the original path. */
  setExperimentalSampling(settings: UiSamplingSettings): void { this.sampling.set(settings); }
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(0, 1, 0, 1, -1, 1);
  private readonly geometry = new PlaneGeometry(1, 1);
  private meshes: { part: Quad['part']; mesh: Mesh }[] = [];
  private scopeMeshes: Mesh[] = [];
  private bars: Mesh[] = [];
  private textures: DataTexture[] = [];
  private materials: MeshBasicMaterial[] = [];
  private armMaterial: MeshBasicMaterial | null = null;
  private fixedMaterial: MeshBasicMaterial | null = null;
  /** NU-3a: set 3's sight -- `ret_rocket_01` in the arms' tint, sampled at `LAUNCHER_SIGHT_UV` -- or null when not served. */
  private sightMaterial: MeshBasicMaterial | null = null;
  /** The reticle set drawn (`RETICLE_SETS`), its bitmaps' sizes, and the set bitmaps the map brought. */
  private set = 1;
  /** The ring-and-arms set whose bitmaps the ring's and the arms' materials hold (the drawn set's, but under 4 and -1). */
  private armsSet = 1;
  /** NU-2: the throw meter's four meshes (`meterLayout`'s order), the frame bitmap's size, the fill's texture, the power. */
  private meterMeshes: { part: MeterQuad['bitmap']; half: MeterQuad['half']; mesh: Mesh }[] = [];
  private meterBitmap: { width: number; height: number } | null = null;
  private meterMaps: Partial<Record<MeterQuad['bitmap'], Texture>> = {};
  private power = 0;
  /** Where the last frame of a set other than 4 laid the reticle (`GRENADE_METER_CENTRE_READING`): Init's centre first. */
  private laid: { aim: [number, number]; offset: [number, number] } = { aim: [0.5, 0.5], offset: [0, 0] };
  private sizes: ReticleSizes = { fixed: FIXED, arm: ARM };
  private setTextures = new Map<string, DataTexture>();
  private sets: Record<string, Rgba> = {};
  private aim: [number, number] = [0.5, 0.5];
  private drawSize = 0;
  private offset: [number, number] = [0, 0];
  private mode: ReticleMode = 'reticle';
  private scopeNames: string[] = ['ret_scope_01.tif', 'ret_scope_02.tif'];
  /** LATER 164: the scope's tube over set 0's cross (view state 2, `setTube`). */
  private tube = false;
  private night = false;
  private nightMeshes: Mesh[] = [];
  private binocMeshes: Mesh[] = [];
  private colour: ReticleColour = 'rest';
  private on = false;
  private frame = { width: 0, height: 0 };
  private readonly size = new Vector2();
  /** WEAPON: the accuracy pip (`stepPip`), its mesh and material, and the frames it has faded over. */
  private pip: PipState = { alpha: 0, offset: null };
  private pipMesh: Mesh | null = null;
  private pipMaterial: MeshBasicMaterial | null = null;
  private pipSize: [number, number] = [16, 16];
  private pipClock = 0;
  /**
   * NU-3b C4: the target's name (`hud+0x4544`) and its health bar (`hud+0x45e0`) -- the name drawn and the bar's health
   * (`setTarget`), the font's atlas (`FONT_TEXT_01`, handed with the bitmaps), its glyph meshes (the shadow's, then the
   * text's, each with its own quad's UVs), the bar's fill and loss.
   */
  private targetName: string | null = null;
  private targetBar: number | null = null;
  private font: { width: number; height: number } | null = null;
  private glyphMaterials: Record<'text' | 'shadow', MeshBasicMaterial> | null = null;
  /** Authored CPU name accents: shared per ink, disposed with the font; ordinary text still uses its native material. */
  private glyphInks = new Map<string, MeshBasicMaterial>();
  private glyphMeshes: Record<'text' | 'shadow', Mesh[]> = { text: [], shadow: [] };
  private barMeshes: Record<'fill' | 'lost', Mesh> | null = null;
  /**
   * THREAT-MARKS (`threatLayout`): the eight `ret_threat` quads, each its own six-vertex geometry and material (its own
   * alpha); the breadths and alphas this frame (`setThreat`); the page's gate apart from the reticle's dead gate
   * (`setThreatGate`, THREAT_DEAD_FADE_READING); the original's set as asked this frame (`setSet`'s `type`, before the
   * page's own refusals), ChangeReticule's `Aw`/`Ah` kept from the last set that had them, the first four sprites' shown
   * state, and each quad's last laid vertices (kept under set 4, which the HUD frame does not relay).
   */
  private threatMeshes: Mesh[] = [];
  private threatBitmap: { width: number; height: number } | null = null;
  private threatValues: ThreatValues = { breadth: new Array<number>(8).fill(0), alpha: new Array<number>(8).fill(0) };
  private threatGate = { shown: false, dead: false };
  private hudSet = 1;
  private threatPrevSet: number | null = null;
  private threatArmSize: { w: number; h: number } | null = null;
  private threatFirstFour = true;
  private threatSize = 0;
  private threatLaid: (ThreatVertex[] | null)[] = new Array<ThreatVertex[] | null>(8).fill(null);

  /**
   * The bitmaps of the map just loaded, or none (the reticle then draws nothing); NU-3b: `font` the HUD's font atlas
   * (`FONT_TEXT_01`, off the map's `hud`) the target's name is written in, or none (no name drawn).
   */
  setBitmaps(bitmaps: ReticleBitmaps | null | undefined, font: Rgba | null = null): void {
    this.clear();
    if (!bitmaps) return;
    const make = (rgba: Rgba, tint: [number, number, number] | null): MeshBasicMaterial => {
      const map = texture(rgba);
      this.textures.push(map);
      const material = new MeshBasicMaterial({
        map, transparent: true, depthTest: false, depthWrite: false, side: DoubleSide, fog: false, toneMapped: false,
        color: tint ? new Color().setRGB(...tint) : new Color(1, 1, 1),
      });
      this.materials.push(material);
      return material;
    };
    const fixed = make(bitmaps.fixed, null);
    const floating = make(bitmaps.floating, reticleTint(this.colour));
    this.armMaterial = floating;
    this.fixedMaterial = fixed;
    this.sets = bitmaps.sets ?? {};
    if (bitmaps.accuracy) {
      const pip = make(bitmaps.accuracy, null);
      pip.opacity = 0;
      this.pipMaterial = pip;
      this.pipSize = [bitmaps.accuracy.width, bitmaps.accuracy.height];
      this.pipMesh = this.addMesh(pip, 3);
    }
    this.set = 1;
    this.armsSet = 1;
    this.sizes = { fixed: bitmaps.fixed.width, arm: bitmaps.floating.width, fixedH: bitmaps.fixed.height, armH: bitmaps.floating.height };
    this.add('fixed', fixed);
    for (let i = 0; i < 4; i++) this.add('floating', floating);
    // NU-3a C2: set 3's sight, `ret_rocket_01` four times, coloured with the arms (D:L70278-70283), at PS2 alpha 128.
    const rocket = bitmaps.sets?.[RETICLE_SETS[3]!.fixed];
    if (rocket) {
      const sight = make(rocket, reticleTint(this.colour));
      sight.map!.offset.set(LAUNCHER_SIGHT_UV.u0, LAUNCHER_SIGHT_UV.v0);
      sight.map!.repeat.set(LAUNCHER_SIGHT_UV.u1 - LAUNCHER_SIGHT_UV.u0, LAUNCHER_SIGHT_UV.v1 - LAUNCHER_SIGHT_UV.v0);
      this.sightMaterial = sight;
      for (let i = 0; i < 4; i++) this.add('sight', sight);
    }
    // NU-2: the throw meter (set 4), `ret_grenade_01` the fill and `ret_grenade_02` the frame, each twice -- the half above
    // the centre line and its mirror below -- in its own colour and alpha (`meterTint`); none when the map lacks either.
    const meterFrame = bitmaps.sets?.['ret_grenade_02.tif'], meterFill = bitmaps.sets?.['ret_grenade_01.tif'];
    if (meterFrame && meterFill) {
      for (const [part, rgba] of [['fill', meterFill], ['frame', meterFrame]] as const) {
        const tint = meterTint(part);
        const material = make(rgba, tint.rgb);
        material.opacity = tint.opacity;
        this.meterMaps[part] = material.map!;
        for (const half of ['top', 'bottom'] as const) {
          const mesh = this.addMesh(material, part === 'fill' ? 0 : 1);
          mesh.userData.meter = part;
          mesh.userData.half = half;
          this.meterMeshes.push({ part, half, mesh });
        }
      }
      this.meterBitmap = { width: meterFrame.width, height: meterFrame.height };
    }
    // The scope (type 5): the tube's mask, then its soft inner ring, four mirrored quads each; black bars beside.
    for (const name of ['ret_scope_01.tif', 'ret_scope_02.tif']) {
      const rgba = bitmaps.sets?.[name];
      if (!rgba) continue;
      const material = make(rgba, null);
      // Research 341: ChangeReticule FUN_00213e20 D:L69434-69510 samples 0.01-0.99 on both axes
      // (reading, pending original-source review). Both scope bind packets request bilinear, no mipmaps on all 22 maps.
      material.map!.offset.set(0.01, 0.01);
      material.map!.repeat.set(0.98, 0.98);
      material.map!.minFilter = material.map!.magFilter = LinearFilter;
      for (let i = 0; i < 4; i++) {
        // LATER 164: the tube's quads (`hud+0x11f0..`) are in the HUD's second list, drawn after the first's ring
        // (`hud+0x70`) and before the third's arms (`hud+0x2930..`): `FUN_002151f0` D:L69697-69702 over the lists
        // `+0x1c`, `+0x34`, `+0x4c` (filled at `FUN_002178c0` D:L70965-71005) -- so 0.5, between the ring's 0 and the arms'
        // 1; `ret_scope_02` stays at 2 [reading: it is in the same list, filled per quadrant `hud+0xa30[i]` then
        // `hud+0x11f0[i]` (D:L70992-70998), but `FUN_001feae0`'s insert direction is unread, so the original's order of the
        // two under the scope is not known; the port draws the tube first, as it did before at one order, by insertion].
        // Under set 5 neither ring nor arms is drawn, and in view 2 `ret_scope_02` is hidden: nothing else changes.
        const mesh = this.addMesh(material, name === 'ret_scope_01.tif' ? 0.5 : 2);
        mesh.userData.bitmap = name;                 // the weapon's scope takes it or not (`setScopeBitmaps`)
        this.scopeMeshes.push(mesh);
      }
    }
    // The binoculars (type 7): `ret_binocs`, then `ret_binocs2` over it, two quads each, sampled at BINOCULAR_UV.
    for (const name of BINOCULAR_BITMAPS) {
      const rgba = bitmaps.sets?.[name];
      if (!rgba) continue;
      const material = make(rgba, null);
      material.map!.offset.set(BINOCULAR_UV.u0, BINOCULAR_UV.v0);
      material.map!.repeat.set(BINOCULAR_UV.u1 - BINOCULAR_UV.u0, BINOCULAR_UV.v1 - BINOCULAR_UV.v0);
      for (let i = 0; i < 2; i++) {
        const mesh = this.addMesh(material, name === BINOCULAR_BITMAPS[0] ? 2 : 3);
        mesh.userData.bitmap = name;
        this.binocMeshes.push(mesh);
      }
    }
    // The night vision's goggles (`nvg_part.tif`), under the reticle.
    const nvg = bitmaps.sets?.['nvg_part.tif'];
    if (nvg) {
      const material = make(nvg, null);
      for (let i = 0; i < 4; i++) this.nightMeshes.push(this.addMesh(material, -1));
    }
    // THREAT-MARKS: the eight `ret_threat` quads (HUD init `FUN_002178c0` D:L71008-71025: alpha 0, shown, the constructor's
    // RGB 128 -- no colour call: the red is the bitmap's), in the arms' list (`hud+0x4c`), each its own geometry and alpha.
    const threat = bitmaps.sets?.['ret_threat.tif'];
    if (threat) {
      const map = texture(threat);
      this.textures.push(map);
      for (let i = 0; i < 8; i++) {
        const material = new MeshBasicMaterial({
          map, transparent: true, depthTest: false, depthWrite: false, side: DoubleSide, fog: false, toneMapped: false, opacity: 0,
        });
        this.materials.push(material);
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(18), 3));
        geometry.setAttribute('uv', new Float32BufferAttribute(new Float32Array(12), 2));
        const mesh = new Mesh(geometry, material);
        mesh.frustumCulled = false;
        mesh.renderOrder = 1;
        mesh.visible = false;
        mesh.userData.threat = i;
        this.scene.add(mesh);
        this.threatMeshes.push(mesh);
      }
      this.threatBitmap = { width: threat.width, height: threat.height };
    }
    // NU-3b C4: the target's name in the font (`TARGET_NAME_LOOK_READING`: the HUD's string colour and its drop shadow)
    // and its bar, untextured, in `CHealthBar`'s colours (research 87 row 1.8), over the reticle.
    if (font) {
      const map = texture(font, true);   // the HUD's `flipRows`'d font atlas (`./matchFirearm`): keyed turned back (HD.R8)
      this.textures.push(map);
      const glyph = (rgba: readonly number[]): MeshBasicMaterial => {
        const m = new MeshBasicMaterial({ map, transparent: true, depthTest: false, depthWrite: false, side: DoubleSide, fog: false, toneMapped: false, color: new Color().setRGB(rgba[0]!, rgba[1]!, rgba[2]!), opacity: rgba[3]! });
        this.materials.push(m);
        return m;
      };
      this.glyphMaterials = { shadow: glyph(TARGET_NAME_LOOK_READING.shadow), text: glyph(TARGET_NAME_LOOK_READING.text) };
      this.font = { width: font.width, height: font.height };
    }
    const flat = (rgba: readonly number[], part: 'fill' | 'lost'): Mesh => {
      const m = new MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, side: DoubleSide, fog: false, toneMapped: false, color: new Color().setRGB(rgba[0]!, rgba[1]!, rgba[2]!), opacity: rgba[3]! });
      this.materials.push(m);
      const mesh = this.addMesh(m, 4);
      mesh.userData.bar = part;
      return mesh;
    };
    this.barMeshes = { fill: flat(HUD_COLOURS.health, 'fill'), lost: flat(HUD_COLOURS.healthLost, 'lost') };
    if (this.scopeMeshes.length > 0 || this.nightMeshes.length > 0 || this.binocMeshes.length > 0) {
      // Two-sided as every HUD quad is: the camera looks with y down, which turns a quad's winding, and a one-sided bar
      // was culled -- the world showed beside the scope on a wide frame (the owner, 2026-09-29).
      const black = new MeshBasicMaterial({ color: 0x000000, side: DoubleSide, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
      this.materials.push(black);
      for (let i = 0; i < 2; i++) this.bars.push(this.addMesh(black, 2));
    }
  }

  /** The aim point in normalised screen coordinates, 0..1 across and down; the frame's centre by default. */
  setAimPoint(nx: number, ny: number): void { this.aim = [nx, ny]; }

  setVisible(on: boolean): void { this.on = on; }

  /**
   * The HUD's drawn size and the knock's offset, PS2 pixels (`./accuracy`'s `reticle()`): the arms pushed out by
   * `size`, the whole reticle moved by `offset` (y down).
   */
  setSize(size: number, offset: [number, number] = [0, 0]): void {
    this.drawSize = size;
    this.offset = [offset[0], offset[1]];
  }

  /**
   * The reticle set (`handReticleType`, `RETICLE_SETS`): the ring and the arms swapped for the set's bitmaps when
   * the map brought them (the sidearm's `ret_sidearm_01` 32x32 and `ret_sidearm_02` 16x16 ...); the grenade's (4) is
   * the throw meter in their place, when the map brought its two bitmaps (NU-2; `ChangeReticule` D:L69389-69431 hides
   * the ring and the arms); none (-1, the C4's) draws nothing (`C4_RETICLE_READING`); the scope's and the binoculars'
   * keep the drawn set -- those have their own draws. False when the set is not in hand. (Was, before NU-2: "a set with
   * no arms (the grenade's, the scope's) keeps the drawn ones".)
   */
  setSet(type: number): boolean {
    this.hudSet = type;                            // THREAT-MARKS: the original's set this frame, before the page's refusals
    if (type === this.set) return true;
    if (type === -1) { this.set = -1; return true; }
    if (type === 4) {
      if (this.meterMeshes.length === 0) return false;
      this.set = 4;
      return true;
    }
    const names = RETICLE_SETS[type];
    // The scope (5, 6) and the binoculars (7) have their own draws, never the ring's and the arms' meshes.
    if (!names || !names.floating || type === 7) return false;
    if (type === this.armsSet) { this.set = type; return true; }   // back from the meter: the materials still hold it
    const fixed = this.sets[names.fixed], arm = this.sets[names.floating];
    if (!fixed || !arm || !this.fixedMaterial || !this.armMaterial) return false;
    const tex = (name: string, rgba: Rgba): DataTexture => {
      let t = this.setTextures.get(name);
      if (!t) { t = texture(rgba); this.setTextures.set(name, t); this.textures.push(t); }
      return t;
    };
    this.fixedMaterial.map = tex(names.fixed, fixed);
    this.armMaterial.map = tex(names.floating, arm);
    this.fixedMaterial.needsUpdate = true;
    this.armMaterial.needsUpdate = true;
    this.sizes = { fixed: fixed.width, arm: arm.width, fixedH: fixed.height, armH: arm.height };   // as served (NU-3a)
    this.set = type;
    this.armsSet = type;
    return true;
  }

  /**
   * NU-2 G3: the throw's power the meter is laid at this frame (`meterPower`: the controller's `ctrl+0x11c`, 0 with none
   * left; `FUN_001f7ff0` D:L56673-56688). Read only under set 4 (`FUN_00213a60` acts only there, D:L69189).
   */
  setMeter(power: number): void { this.power = power; }

  /** THREAT-MARKS: the actor's eight breadths and the HUD's eight alphas this frame (`./threatMarks` `ThreatMarks.values`). */
  setThreat(values: ThreatValues): void { this.threatValues = { breadth: [...values.breadth], alpha: [...values.alpha] }; }

  /**
   * THREAT-MARKS (THREAT_DEAD_FADE_READING): the marks' own gate, apart from the reticle's -- `shown` the page's gates but
   * the death (walking, spawned, no tactical map, scoreboard or round screen: `reticleShown` without `dead`), `dead` the
   * page's death (ChangeReticule(-1): the first four sprites hidden, the last four fading on).
   */
  setThreatGate(shown: boolean, dead: boolean): void { this.threatGate = { shown, dead }; }

  /** THREAT-MARKS: the eight quads as drawn last frame -- shown or not, their opacity and their vertices (for the tests). */
  threatState(): { visible: boolean; opacity: number; vertices: ThreatVertex[] | null }[] {
    return this.threatMeshes.map((mesh, i) => {
      const laid = this.threatLaid[i];
      return { visible: mesh.visible, opacity: (mesh.material as MeshBasicMaterial).opacity, vertices: laid ? laid.map((v) => ({ ...v })) : null };
    });
  }

  /**
   * THREAT-MARKS: one HUD frame of the eight quads -- ChangeReticule's show state of the first four (hidden under set -1 or
   * a death, left as they were under 6, 8 and 10, shown under the rest: D:L69339-69591), its `Aw`/`Ah` for the set
   * (`threatArm`; under a death, set -1, the last kept), the relayout (`threatLayout`; every frame but under set 4, laid
   * there once at the change, `FUN_00213e20` D:L69317 then `FUN_00216770` D:L70415-70434; THREAT_SCOPED_SETS_READING),
   * each quad's vertices and opacity (THREAT_ALPHA_SCALE_READING). Whether any quad shows.
   */
  private layThreat(): boolean {
    if (this.threatMeshes.length === 0 || !this.threatBitmap || this.frame.height <= 0) return false;
    const set = this.threatGate.dead ? -1 : this.hudSet;
    const prev = this.threatPrevSet;
    this.threatPrevSet = set;
    if (set === -1) this.threatFirstFour = false;
    else if (!THREAT_LEAVE_SETS.has(set)) this.threatFirstFour = true;
    if (set !== -1) {
      const names = RETICLE_SETS[set];
      const name = names ? names.floating ?? names.fixed : null;
      const arm = threatArm(set, name ? this.sets[name] ?? null : null);
      if (arm) this.threatArmSize = arm;
    }
    if (set !== 4) this.threatSize = this.drawSize;   // `hud+0x44b4`, written by the HUD frame but under set 4 (D:L70419)
    if ((set !== 4 || prev !== 4) && this.threatArmSize) {
      const laid = threatLayout(this.frame, this.meterCentre(), this.threatSize, this.threatArmSize, this.threatBitmap, this.threatValues);
      laid.forEach((q, i) => { if (q) this.threatLaid[i] = q.vertices; });
    }
    let any = false;
    this.threatMeshes.forEach((mesh, i) => {
      const alpha = this.threatValues.alpha[i] ?? 0, vertices = this.threatLaid[i];
      const on = this.threatGate.shown && alpha > 0 && !!vertices && (i >= 4 || this.threatFirstFour);
      mesh.visible = on;
      if (!on || !vertices) return;
      any = true;
      (mesh.material as MeshBasicMaterial).opacity = Math.min(1, alpha / THREAT_ALPHA_SCALE_READING);
      const pos = mesh.geometry.getAttribute('position') as BufferAttribute, uv = mesh.geometry.getAttribute('uv') as BufferAttribute;
      vertices.forEach((v, k) => { pos.setXYZ(k, v.x, v.y, 0); uv.setXY(k, v.s, v.t); });
      pos.needsUpdate = true;
      uv.needsUpdate = true;
    });
    return any;
  }

  /** The reticle set drawn now. */
  currentSet(): number { return this.set; }

  /** The night vision's goggles on or off (view state 3; `ChangeReticule`'s `+0x4100`). */
  setNight(on: boolean): void { this.night = on; }

  /**
   * WEAPON: one frame of the accuracy pip (`stepPip`): the blocked muzzle's hit as an offset from the reticle's centre
   * (PS2 pixels, y down) or null, and whether the view is scoped. The fade runs at the game's 60 frames a second.
   */
  setPip(offset: [number, number] | null, scoped: boolean, dt = 1 / 60): void {
    this.pipClock += dt;
    while (this.pipClock >= 1 / 60 - 1e-9) {
      this.pipClock -= 1 / 60;
      // Under set 4 the pip fades whatever the aim ray found (D:L70435-70445: the bit cleared at D:L70415-70417).
      this.pip = stepPip(this.pip, this.set === 4 ? null : offset, this.drawSize, scoped);
      // NU-3a C2 (research 321 D7): under set 3 `FUN_00215250` steps it (D:L70433) and the frame fades it 32 after
      // (D:L70435-70445): from rest it never shows; a shown one holds while blocked (at most 96) and drops 64 a frame clear.
      if (this.set === 3) {
        const alpha = Math.max(0, this.pip.alpha - PIP_FADE);
        this.pip = { alpha, offset: alpha > 0 ? this.pip.offset : null };
      }
    }
    // Between two of the game's frames a shown pip rides the latest offset.
    if (this.pip.offset && offset && this.set !== 4) {
      const now = stepPip({ alpha: PIP_FULL, offset: null }, offset, this.drawSize, scoped).offset;
      if (now) this.pip = { alpha: this.pip.alpha, offset: now };
    }
  }

  /** The weapon's reticle, the scope's overlay (view state 5 and up) or the binoculars' mask (state 4). */
  setMode(mode: ReticleMode): void { this.mode = mode; }

  /** The weapon's scope bitmaps (`./sights` `scopeBitmaps`: both, the F2000's tube alone). */
  setScopeBitmaps(names: readonly string[]): void { this.scopeNames = [...names]; }

  /**
   * LATER 164 (research 321 s2.5): set 0 laid in view state 2 -- a THERMAL turret's -- shows the scope's tube
   * `ret_scope_01` (`hud+0x11f0..`, its four quads laid once at the HUD's making over (0, -96)-(640, 544) at alpha 128,
   * `FUN_002178c0` D:L70918-70963) beside the ring and the arms (`ChangeReticule` D:L69663-69670, after the generic
   * branch hid the tube and `ret_scope_02`, D:L69576-69594); the soft ring `ret_scope_02` stays hidden. The cross keeps
   * its own set and place; the tube sits at the frame's centre, with the scope's black beside it on a wide frame (the
   * same adaptation as the scope's, `scopeLayout`'s bars).
   */
  setTube(on: boolean): void { this.tube = on; }

  /**
   * NU-3b C4 (`reticleTargetState`): the target's name drawn beside the reticle (null: hidden) and the health its bar
   * shows (0..1; null: no bar), this frame.
   */
  setTarget(name: string | null, bar: number | null): void {
    this.targetName = name;
    this.targetBar = bar;
  }

  /** The arms' colour: at rest, on a teammate, on an enemy, out of range (`FUN_00215c10`). */
  setColour(colour: ReticleColour): void {
    if (colour === this.colour) return;            // called every frame: the tint only on a change
    this.colour = colour;
    this.armMaterial?.color.setRGB(...reticleTint(colour));
    this.sightMaterial?.color.setRGB(...reticleTint(colour));    // NU-3a: set 3's sight greys with the arms
  }

  /** Whether it is being drawn, and where, in the drawing buffer's pixels (y down) of the last frame drawn. */
  state(): {
    visible: boolean; rect: Rect | null; frame: { width: number; height: number };
    mode: ReticleMode; size: number; offset: [number, number]; colour: ReticleColour;
    type: number; pip: { alpha: number; offset: [number, number] | null };
    /** LATER 164: the scope's tube drawn over the cross (`setTube`, view state 2 under set 0). */
    tube: boolean;
    /** NU-2: the throw meter under set 4 -- the power, the fill's height each way and the meter's box (frame pixels). */
    meter: { power: number; fill: number; rect: Rect } | null;
    /** NU-3b C4: the target's name, its pen (frame pixels) and its bar (the rectangle and the health), or null. */
    target: { name: string; pen: [number, number]; bar: { rect: Rect; health: number; fill: number } | null } | null;
  } {
    const visible = this.on && this.meshes.length > 0 && this.frame.height > 0;
    const shown = visible && this.mode === 'reticle';
    const meter = shown ? this.meterLayout() : null;
    const rect = !shown || this.set === -1 ? null : meter ? meter.rect : reticleLayout(this.frame, this.aim, this.drawSize, this.offset, this.sizes, this.set).rect;
    const target = visible ? this.targetDrawn() : null;
    return {
      visible, rect, frame: { ...this.frame }, mode: this.mode, size: this.drawSize, offset: [...this.offset], colour: this.colour,
      type: this.set, pip: { alpha: this.pip.alpha, offset: this.pip.offset ? [...this.pip.offset] : null },
      tube: shown && this.tube && this.scopeMeshes.some((m) => m.userData.bitmap === 'ret_scope_01.tif'),
      meter: meter ? { power: this.power, fill: meter.quads[0]!.height, rect: meter.rect } : null,
      target: target ? { ...target, name: plainBotText(target.name) } : null,
    };
  }

  /**
   * NU-3b C4: the target's name and bar this frame (`targetLayout`), or null with no name: about the reticle's centre --
   * the meter's under set 4 -- with the drawn view's `W` and `H` (`hud+0x452c/+0x4530`, as `ChangeReticule` keeps them):
   * the binoculars' `ret_binocs2`, the scope's `ret_scope_02` (and its halving), the meter's `ret_grenade_02`, else the
   * set's floating bitmap (research 321 section 4.2).
   */
  private targetDrawn(): { name: string; pen: [number, number]; bar: { rect: Rect; health: number; fill: number } | null } | null {
    if (this.targetName === null) return null;
    const scoped = this.mode === 'scope';
    const named = (n: string): { width: number; height: number } | null => { const b = this.sets[n]; return b ? { width: b.width, height: b.height } : null; };
    const box = this.mode === 'binoculars' ? named(BINOCULAR_BITMAPS[1]!)
      : scoped ? named(RETICLE_SETS[5]!.fixed)
        : this.set === 4 ? this.meterBitmap
          : { width: this.sizes.arm, height: this.sizes.armH ?? this.sizes.arm };
    if (!box) return null;
    const centre = this.set === 4 && this.mode === 'reticle' ? this.meterCentre() : reticleLayout(this.frame, this.aim, this.drawSize, this.offset, this.sizes, this.set).centre;
    const health = this.targetBar === null ? null : Math.min(1, Math.max(0, this.targetBar));
    const l = targetLayout(this.frame, centre, box, scoped, health ?? 1);
    return { name: this.targetName, pen: l.pen, bar: health === null ? null : { rect: l.bar, health, fill: l.fill } };
  }

  /** NU-3b C4: the name's glyphs (`layoutText` at `TARGET_NAME_SCALE`, the shadow one unit off) and the bar's two quads. */
  private renderTarget(): void {
    const t = this.targetDrawn();
    const s = this.frame.height / PS2_HEIGHT;
    const used = { text: 0, shadow: 0 };
    if (t && this.glyphMaterials && this.font) {
      const { glyphs } = layoutText(t.name, t.pen[0] / s, t.pen[1] / s, TARGET_NAME_SCALE);
      const [dx, dy] = FONT_TEXT_01.dropShadow.pixels;
      for (const pass of ['shadow', 'text'] as const) {
        const [ox, oy] = pass === 'shadow' ? [dx * TARGET_NAME_SCALE, dy * TARGET_NAME_SCALE] : [0, 0];
        for (const g of glyphs) {
          if (g.texture) continue;                                        // no pad glyph in a name
          const mesh = this.glyphMesh(pass, used[pass]++);
          mesh.material = pass === 'text' && g.rgb ? this.glyphInk(g.rgb) : this.glyphMaterials[pass];
          mesh.position.set((g.x + ox + g.w / 2) * s, (g.y + oy + g.h / 2) * s, 0);
          mesh.scale.set(g.w * s, g.h * s, 1);
          const uv = mesh.geometry.getAttribute('uv') as BufferAttribute;
          const u0 = g.u0 / this.font.width, u1 = g.u1 / this.font.width, v0 = g.v0 / this.font.height, v1 = g.v1 / this.font.height;
          // PlaneGeometry's corners: (-, +) (+, +) (-, -) (+, -); +y is down the screen here, so v1 there.
          uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
          uv.needsUpdate = true;
          mesh.visible = true;
        }
      }
    }
    for (const pass of ['shadow', 'text'] as const) this.glyphMeshes[pass].forEach((m, i) => { if (i >= used[pass]) m.visible = false; });
    if (this.barMeshes) {
      const bar = t?.bar ?? null;
      const { fill, lost } = this.barMeshes;
      fill.visible = false; lost.visible = false;
      if (bar) {
        const r = bar.rect, w = bar.fill;                                // `targetLayout`'s split (D:L90005)
        if (w > 0) { fill.visible = true; fill.position.set(r.x + w / 2, r.y + r.height / 2, 0); fill.scale.set(w, r.height, 1); }
        if (r.width - w > 0) { lost.visible = true; lost.position.set(r.x + (w + r.width) / 2, r.y + r.height / 2, 0); lost.scale.set(r.width - w, r.height, 1); }
      }
    }
  }

  private glyphInk(rgb: readonly number[]): MeshBasicMaterial {
    const key = rgb.join(',');
    let ink = this.glyphInks.get(key);
    if (!ink) {
      ink = this.glyphMaterials!.text.clone();
      ink.color.setRGB(rgb[0]! / 128, rgb[1]! / 128, rgb[2]! / 128);
      this.glyphInks.set(key, ink);
      this.materials.push(ink);
    }
    return ink;
  }

  /** The `i`th glyph mesh of a pass, made on demand (its own quad, so its own UVs). */
  private glyphMesh(pass: 'text' | 'shadow', i: number): Mesh {
    const list = this.glyphMeshes[pass];
    let mesh = list[i];
    if (!mesh) {
      mesh = new Mesh(new PlaneGeometry(1, 1), this.glyphMaterials![pass]);
      mesh.frustumCulled = false;
      mesh.renderOrder = pass === 'shadow' ? 5 : 6;
      mesh.visible = false;
      mesh.userData.glyph = pass;
      this.scene.add(mesh);
      list.push(mesh);
    }
    return mesh;
  }

  /** The meter's centre: where the last frame of another set laid the reticle (`GRENADE_METER_CENTRE_READING`). */
  private meterCentre(): [number, number] {
    return reticleLayout(this.frame, this.laid.aim, 0, this.laid.offset).centre;
  }

  /** The throw meter's layout this frame under set 4 (`meterLayout`), or null under another set or with no bitmaps. */
  private meterLayout(): ReturnType<typeof meterLayout> | null {
    if (this.set !== 4 || !this.meterBitmap) return null;
    return meterLayout(this.frame, this.meterCentre(), this.power, this.meterBitmap);
  }

  /** The pass's scene and camera, for the page's warm-up (`ViewerRenderer.prepare`): its programs linked before the walk. */
  warmTarget(): { scene: Scene; camera: OrthographicCamera } { return { scene: this.scene, camera: this.camera }; }

  /** Draws the HUD over whatever the renderer last drew: nothing is cleared. */
  render(renderer: HudRenderer): void {
    renderer.getDrawingBufferSize(this.size);
    this.frame = { width: this.size.x, height: this.size.y };
    // FUN_00216770 (D:L70415-70434): a frame of any set but 4 lays the centre; under 4 it stays (GRENADE_METER_CENTRE_READING).
    if (this.set !== 4 || GRENADE_METER_CENTRE_READING !== 'the last firearm frame\'s') {
      this.laid = { aim: [this.aim[0], this.aim[1]], offset: [this.offset[0], this.offset[1]] };
    }
    // THREAT-MARKS: the eight quads outside the reticle's gate (THREAT_DEAD_FADE_READING): with the reticle off (a death),
    // the scene draws them alone.
    const threat = this.layThreat();
    const reticleOn = this.on && this.meshes.length > 0;
    if (!reticleOn) {
      if (!threat) return;
      for (const child of this.scene.children) if (!this.threatMeshes.includes(child as Mesh)) child.visible = false;
    }
    this.sampling.apply(this.textures);
    const { width, height } = this.frame;
    this.camera.left = 0; this.camera.right = width; this.camera.top = 0; this.camera.bottom = height;
    this.camera.updateProjectionMatrix();
    if (!reticleOn) {
      this.sampling.fit(this.threatMeshes);
      const autoClearOff = renderer.autoClear;
      renderer.autoClear = false;
      try { renderer.render(this.scene, this.camera); } finally { renderer.autoClear = autoClearOff; }
      return;
    }
    const scoped = this.mode === 'scope' && this.scopeMeshes.length > 0;
    const binocs = this.mode === 'binoculars' && this.binocMeshes.length > 0;
    const tube = this.tube && this.mode === 'reticle';                 // LATER 164: the cross and the tube together
    const quads = reticleLayout(this.frame, this.aim, this.drawSize, this.offset, this.sizes, this.set).quads;
    const fixed = quads.filter((q) => q.part === 'fixed'), floating = quads.filter((q) => q.part === 'floating');
    const sight = quads.filter((q) => q.part === 'sight');
    // NU-2: the grenade's set draws the meter in the ring's and the arms' place; none (the C4's) draws nothing.
    const none = this.set === -1 && C4_RETICLE_READING === 'nothing';
    const meter = scoped || binocs ? null : this.meterLayout();
    let f = 0, a = 0, g = 0;
    for (const { part, mesh } of this.meshes) {
      const q = part === 'fixed' ? fixed[f++] : part === 'sight' ? sight[g++] : floating[a++];
      if (!q || scoped || binocs || this.set === 4 || none) { mesh.visible = false; continue; }
      mesh.visible = true;
      mesh.position.set(q.x, q.y, 0);
      mesh.scale.set(q.flipX ? -q.width : q.width, q.flipY ? -q.height : q.height, 1);   // NU-3a: a mirrored corner
      mesh.rotation.z = (q.turns * Math.PI) / 2;   // +z turns clockwise on a y-down screen
    }
    // The pip: at the reticle's centre plus its offset, its alpha the PS2's over 128 (`stepPip`).
    if (this.pipMesh && this.pipMaterial) {
      const p = this.pip.offset;
      const layout = reticleLayout(this.frame, this.aim, this.drawSize, this.offset, this.sizes, this.set);
      this.pipMesh.visible = !!p && this.pip.alpha > 0 && !binocs && !none;
      if (p) {
        const s = layout.scale, centre = this.set === 4 ? this.meterCentre() : layout.centre;
        this.pipMesh.position.set(centre[0] + p[0] * s, centre[1] + p[1] * s, 0);
        this.pipMesh.scale.set(this.pipSize[0] * s, this.pipSize[1] * s, 1);
        this.pipMaterial.opacity = Math.min(1, this.pip.alpha / PIP_FULL);
      }
    }
    // The meter's quads: each half its bitmap's rows from the centre line out (`MeterQuad.rows`); the upper half mirrored,
    // so that its rows run up from the line as the lower half's run down. A half of no height is not drawn.
    this.meterMeshes.forEach(({ part, half, mesh }) => {
      const q = meter?.quads.find((m) => m.bitmap === part && m.half === half);
      mesh.visible = !!q && q.height > 0;
      if (!q || q.height <= 0) return;
      mesh.position.set(q.x, q.y, 0);
      mesh.scale.set(q.width, half === 'top' ? -q.height : q.height, 1);
      const map = this.meterMaps[part];
      if (map) { map.offset.y = q.rows[0]; map.repeat.y = q.rows[1] - q.rows[0]; }
    });
    const scope = scopeLayout(this.frame);
    this.scopeMeshes.forEach((mesh, i) => {
      const q = scope.quads[i % 4]!;
      const bitmap = mesh.userData.bitmap as string;
      mesh.visible = (scoped && this.scopeNames.includes(bitmap)) || (tube && bitmap === 'ret_scope_01.tif');
      mesh.position.set(q.x, q.y, 0);
      mesh.scale.set(q.flipX ? -q.size : q.size, q.flipY ? -q.size : q.size, 1);
    });
    const bl = binocularsLayout(this.frame);
    this.binocMeshes.forEach((mesh, i) => {
      const q = bl.quads[i]!;
      mesh.visible = binocs;
      mesh.position.set(q.x, q.y, 0);
      mesh.scale.set(q.flipX ? -q.width : q.width, q.height, 1);
    });
    const night = this.night && !scoped && !binocs && this.nightMeshes.length > 0;
    const nv = nightLayout(this.frame);
    this.nightMeshes.forEach((mesh, i) => {
      const q = nv.quads[i]!;
      mesh.visible = night;
      mesh.position.set(q.x, q.y, 0);
      mesh.scale.set(q.flipX ? -q.width : q.width, q.flipY ? -q.height : q.height, 1);
    });
    const bars = night ? nv.bars : binocs ? bl.bars : scope.bars;
    this.bars.forEach((mesh, i) => {
      const r = bars[i];
      mesh.visible = (scoped || night || binocs || tube) && !!r;
      if (r) { mesh.position.set(r.x + r.width / 2, r.y + r.height / 2, 0); mesh.scale.set(r.width, r.height, 1); }
    });
    this.renderTarget();
    this.sampling.fit([...this.meshes.map(({mesh}) => mesh), ...(this.pipMesh ? [this.pipMesh] : []), ...this.meterMeshes.map(({ mesh }) => mesh), ...this.threatMeshes]);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    try { renderer.render(this.scene, this.camera); } finally { renderer.autoClear = autoClear; }
  }

  private add(part: Quad['part'], material: MeshBasicMaterial): void {
    const mesh = this.addMesh(material, part === 'floating' ? 1 : 0);
    if (part === 'sight') mesh.userData.sight = true;
    this.meshes.push({ part, mesh });
  }

  private addMesh(material: MeshBasicMaterial, order: number): Mesh {
    const mesh = new Mesh(this.geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    mesh.visible = false;
    this.scene.add(mesh);
    return mesh;
  }

  private clear(): void {
    this.sampling.clear();
    for (const { mesh } of this.meshes) this.scene.remove(mesh);
    for (const mesh of [...this.scopeMeshes, ...this.bars, ...this.nightMeshes, ...this.binocMeshes, ...this.meterMeshes.map((m) => m.mesh)]) this.scene.remove(mesh);
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    if (this.pipMesh) this.scene.remove(this.pipMesh);
    this.meshes = []; this.scopeMeshes = []; this.bars = []; this.nightMeshes = []; this.binocMeshes = []; this.materials = []; this.textures = [];
    this.armMaterial = null;
    this.fixedMaterial = null;
    this.sightMaterial = null;
    this.setTextures.clear();
    this.pipMesh = null; this.pipMaterial = null;
    this.pip = { alpha: 0, offset: null };
    this.meterMeshes = []; this.meterBitmap = null; this.meterMaps = {}; this.power = 0;
    this.laid = { aim: [0.5, 0.5], offset: [0, 0] };
    for (const pass of ['text', 'shadow'] as const) for (const m of this.glyphMeshes[pass]) { this.scene.remove(m); m.geometry.dispose(); }
    this.glyphMeshes = { text: [], shadow: [] }; this.glyphMaterials = null; this.glyphInks.clear(); this.font = null;
    if (this.barMeshes) { this.scene.remove(this.barMeshes.fill); this.scene.remove(this.barMeshes.lost); }
    this.barMeshes = null;
    for (const m of this.threatMeshes) { this.scene.remove(m); m.geometry.dispose(); }
    this.threatMeshes = []; this.threatBitmap = null; this.threatPrevSet = null; this.threatArmSize = null; this.threatFirstFour = true;
    this.threatLaid = new Array<ThreatVertex[] | null>(8).fill(null);
  }
}
