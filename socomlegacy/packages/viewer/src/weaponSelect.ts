import { EMPTY_ITEM, FULL_SLOT, menuValves, slotKind, slotLocked } from '@s2u/scene';
import type { HudElement, HudQuad, HudTri } from './hud';
import { FONT_TEXT_01, layoutText, textWidth } from './hudFont';
export { DPAD_GLYPH } from './hudFont';
import type { PadButton } from './gamepad';
import { cards, categoryName, pickerOn, type MenuContext, type MenuInput, type MenuState } from './weaponSelectState';

/**
 * WEAPON EXCHANGE drawn (web sprint 4, M8's drawing layer; research 94 §B5): the dead player's menu at `CHUD+0x38e0`,
 * which `./weaponSelectState` runs without a pixel, laid out on the game's 640x448 HUD frame. Two parts, as the
 * scoreboard (`./scoreboard`) is built: a **pure layout**, `weaponSelectLayout`, which turns a `MenuState` and the
 * clock into a list of sprites and strings in frame pixels -- every position, size, colour, rate and scale the
 * research reads out of the static initializer `FUN_003ff7f0` (the BSS table 0x4146c0-0x4147a8) and the `.rodata`
 * floats `DAT_003dcd80`-`DAT_003dcef0` -- and a **thin draw**, `drawWeaponSelect`, which turns that list into the HUD
 * pass's quads (layer 1, over the in-round HUD) with the HUD's own font, as `scoreboardLayout` does.
 *
 * - **S2, the slot list** (`FUN_0023e030` L88247): the title panel and "WEAPON EXCHANGE", the body panel, the five
 *   rows (the slot item's DisplayName upper-cased, a locked slot in (40, 40, 40)), the highlight bar on the current
 *   row pulsing at 4/s. The picker panel is drawn too, redrawn every frame by `FUN_0023e800` as a preview of the
 *   highlighted slot's category and items, its arrows grey (100, 100, 100) and no card highlight (§B4 S2).
 * - **S3, the picker** (`FUN_0023d860` L88080): the category header, three cards (previous, current, next: the
 *   record's `IconTextureName` icon at native size and its DisplayName), a side card blank when it equals the current
 *   one; the middle card's highlight pulsing at 4/s, the four arrows pulsing at 2/s, the slot bar held solid.
 * - **The fades** (L89439-89452, `FUN_0023d610` L88028-88040): the menu and the picker each fade 0 <-> 100 at 400/s;
 *   both start and stop on the same edge (the picker's `FUN_0023d610` is called with "closing" = state 0), so one
 *   value serves both.
 * - **The prompt** (S1 / S1g, `FUN_001f97b0` L56978): the dead player's help lines, or the late joiner's ghost lines,
 *   laid out here for the hook's read (`./matchExchange` `state().prompt`) -- drawn by the HUD since LATER 118 (its
 *   `'help'`, `deadHelpLines`; research 282 §8), not by this overlay,
 *   with the `%c` of the `Inventory` button per input device -- on the pad the face's R2 glyph, and the d-pad's right
 *   and left glyphs in place on every device, all from `font_special_01.tif` (web sprint 5 S4; `./hudFont`
 *   `FONT_SPECIAL_01`); they stay up while the menu is open (§B5 "The rest of the HUD meanwhile"). RSP-6's respawn
 *   S1r is built by `./respawnPrompt` and drawn through the same HUD help widgets (research 351); the release flag is unchanged.
 * - **The draw order** is the game's (`DRAW_ORDER`): the HUD's render phases 12, 13 and 14 in turn, each part in the
 *   order it was registered.
 *
 * The menu is silent (R94.3, `WEAPON_SELECT_SOUND_READING`): nothing here plays. The bitmaps are the disc's --
 * `newweapnbkrnd.tif` and `hud_arrow_off2.tif` in `COMMON/HUD2_TXR.ZED`, the icons in `COMMON/HUDW_TXR.ZED` -- loaded
 * at run time by name (`weaponSelectTextures`); only their sizes reach the draw.
 */

export type Rgb = readonly [number, number, number];

/** What a drawn thing is, for the tests and the draw: the §B5 table's rows. */
export type WeaponSelectPart =
  | 'chatPanel' | 'chatText' | 'chatArrow'
  | 'titlePanel' | 'title' | 'body' | 'bar' | 'row' | 'pickerPanel' | 'pickerHeader' | 'pickerBody' | 'categoryArrow'
  | 'itemArrow' | 'cardHighlight' | 'cardIcon' | 'cardName' | 'prompt'
  /** The alive R2 inventory's (`./inventoryMenu`, research 212), drawn by the same thin draw. */
  | 'inventoryPanel' | 'inventoryIcon' | 'inventoryArrow' | 'inventoryBind' | 'inventoryName' | 'inventoryRounds' | 'inventoryMags';

/**
 * A bitmap on the frame: its top-left `x`, `y` and its size `w` x `h`, or `null` for the bitmap's native size (an icon,
 * the category arrows: `FUN_00364770` / the arrow's `uVar3` width and height, L88147). `turn` (radians, clockwise),
 * `flipU` and `flipV` orient the arrows (`ARROW_ORIENT`: the bitmap mirrored left to right or top to bottom, then
 * turned). `rgb` is the tint on the PS2's 0-128 scale (`FUN_00364930`: 128 is the bitmap as stored, over 128 brightens
 * -- the GS's MODULATE); `alpha` is on the same scale (the fades' 100 is 100/128).
 */
export interface WsSprite {
  kind: 'sprite'; part: WeaponSelectPart; texture: string;
  x: number; y: number; w: number | null; h: number | null; turn: number; flipU: boolean; flipV: boolean;
  rgb: Rgb; alpha: number;
  /** Native TCM right-edge vertex alpha, on the same 0..128 scale. */
  alphaRight?: number;
  /** The row (0-4) or the card (0 previous, 1 current, 2 next) it belongs to. */
  index?: number;
  /**
   * The part of the bitmap drawn, as fractions of its width and height from its top-left (`FUN_00364830`'s S, T; T
   * from the image's top, research 112 R112.4): absent, the whole bitmap.
   */
  src?: readonly [number, number, number, number];
}

/** A string on the frame: the pen `x` (or the centre, `align` 'centre') and the baseline `y`, the HUD font's `scale`. */
export interface WsText {
  kind: 'text'; part: WeaponSelectPart; text: string;
  x: number; y: number; scale: number; align: 'left' | 'centre';
  rgb: Rgb; alpha: number;
  index?: number;
  /** The pad glyph codes the line carries, in order (`./hudFont` `FONT_SPECIAL_01`: drawn from `font_special_01.tif`). */
  glyphs?: number[];
}

export type WeaponSelectItem = WsSprite | WsText;
export interface WeaponSelectLayout { items: WeaponSelectItem[] }

// ---------------------------------------------------------------------------------------------------------------------
// The numbers (research 94 §B5; the BSS globals written by `FUN_003ff7f0`, the `.rodata` floats at 0x3dcd80-0x3dcef0).

/** The panels' bitmap: `newweapnbkrnd.tif` (`COMMON/HUD2_TXR.ZED`, 128x64), stretched whole (UVs 0,1,1,0: `FUN_00364830`). */
export const PANEL_TEXTURE = 'newweapnbkrnd.tif';
/** The arrows' bitmap: `hud_arrow_off2.tif` (HUD2, 32x32; `PTR_s_hud_arrow_off2_tif_003e3068`, L88147). */
export const ARROW_TEXTURE = 'hud_arrow_off2.tif';

/** The fades: `DAT_004147b0` / `DAT_004147b8` +/- dt x 400 (`DAT_003dce78` / `DAT_003dce98`), clamped to 100 (`DAT_003dce80` / `DAT_003dcea0`). */
export const FADE_RATE = 400;
export const FADE_MAX = 100;
/** The slot bar's pulse `DAT_003dce70` and the card highlight's `DAT_003dce90`: dt x 4, a 0..1..0 triangle (L89401, L89468). */
export const SLOT_PULSE_RATE = 4;
export const CARD_PULSE_RATE = 4;
/** The arrows' pulse `DAT_003dcea8`: dt x 2 (`FUN_0023d2b0` L87910-87918). */
export const ARROW_PULSE_RATE = 2;

/** The pulses' ends: low (80, 120, 120) at 0x414790, high (160, 250, 250) at 0x4147a0 (L89418-89429). */
export const PULSE_LOW: Rgb = [80, 120, 120];
export const PULSE_HIGH: Rgb = [160, 250, 250];
/** The header panels (0x4146c0), the body panels (0x4146d0), the title and the picker header (0x414780, 0x414710). */
export const HEADER_PANEL_RGB: Rgb = [80, 80, 80];
export const BODY_PANEL_RGB: Rgb = [128, 128, 128];
export const TITLE_RGB: Rgb = [128, 128, 64];
/** A row and a card name (`_DAT_00408e40` / `DAT_00408e48`, research 94 §B5), a locked row 40 (0x42200000, L88281). */
export const ROW_RGB: Rgb = [128, 128, 128];
export const LOCKED_RGB: Rgb = [40, 40, 40];
/** The arrows: S3 pulse (80, 80, 80) -> (255, 255, 128) (`DAT_004147e8`.. / `DAT_00414800`.., L87897-87907); S2 100 (`DAT_004147d0`, L87946-87951). */
export const ARROW_LOW: Rgb = [80, 80, 80];
export const ARROW_HIGH: Rgb = [255, 255, 128];
export const ARROW_IDLE: Rgb = [100, 100, 100];

/** The menu's strings: the title (0x3e6cb0, `FUN_0023e030` L88293). */
export const TITLE = 'WEAPON EXCHANGE';

/** The slot list (`FUN_0023e030` L88247-88300). */
export const LIST_LAYOUT = {
  /** The title panel: x -10 (0x414770) .. +170 (`DAT_003dcd88`), y 105 (`DAT_003dcdf0`) .. +35 (`DAT_003dce00`). */
  titlePanel: { x: -10, y: 105, w: 170, h: 35 },
  /** "WEAPON EXCHANGE" centred on -10 + 170 / 2 = 75, baseline 129 (`DAT_003dcdf8`), scale 1.0 (`DAT_003dce08`). */
  title: { x: 75, y: 129, scale: 1 },
  /** The body: x -10 (`DAT_003dcd90`) .. +170, y 140 (`DAT_003dcd98`) .. +110 (`DAT_003dcd80`). */
  body: { x: -10, y: 140, w: 170, h: 110 },
  /** The bar: x -10 (0x414768) .. +170 (0x414750), y 146 (`DAT_003dcde8`) + 20 i (`DAT_003dce10`), 18 high (`DAT_003dcde0`). */
  bar: { x: -10, y: 146, w: 170, h: 18, pitch: 20 },
  /**
   * The rows: pen (10, 159 + 20 i) (`DAT_003dce18`, `DAT_003dce20`, `DAT_003dce10`) plus the text offsets +2 / +2
   * (`DAT_003dcec8` / `DAT_003dced0`, `FUN_0023bf20` / `FUN_0023bf60`), left-aligned, scale 0.9 (§B5 "5 rows").
   */
  rows: { x: 12, y: 161, pitch: 20, scale: 0.9 },
} as const;

/** The picker (`FUN_0023d860` L88080-88205). */
export const PICKER_LAYOUT = {
  /** The header panel: x 170 (0x414708) .. +170 (0x414700), y 105 (`DAT_003dcdc0`) .. +35 (`DAT_003dcdc8`). */
  panel: { x: 170, y: 105, w: 170, h: 35 },
  /** The header centred on 167 (`DAT_003dce88`) + 170 / 2 = 252, baseline 129 (`DAT_003dcdd8`), scale 1.0 (`DAT_003dcdd0`). */
  header: { x: 252, y: 129, scale: 1 },
  /** The body: x 170 (0x4146e0) .. +170, y 140 (0x4146e8) .. +225 (`DAT_003dcdb8`). */
  body: { x: 170, y: 140, w: 170, h: 225 },
  /** The category arrows at native size: (168, 105) (`DAT_003dce30/38`) and (305, 105) (`DAT_003dce40/48`). */
  categoryArrows: [{ x: 168, y: 105 }, { x: 305, y: 105 }],
  /** The item arrows stretched 100 x 20: (200, 140) (`DAT_003dce60/68`, +0x580) and (200, 344) (`DAT_003dce50/58`, +0x770). */
  itemArrows: [{ x: 200, y: 140, w: 100, h: 20 }, { x: 200, y: 344, w: 100, h: 20 }],
  /** Card i at x 170 (0x4146f0), y0 = 14 (`DAT_003dcda8`) + 168 (0x4146f8) + 64 i (`DAT_003dcdb0`). */
  cards: { x: 170, y: 182, pitch: 64 },
  /** The icon's top-left at the card + (4, 2) (`DAT_003dceb8` / `DAT_003dcec0`, `FUN_0023c2b0` L87345), native size. */
  icon: { dx: 4, dy: 2 },
  /** The name's pen at the icon's - 4 in y (`FUN_0023c2b0` L87349): (174, y0 - 2), scale 0.9 (`DAT_003dce28`, `FUN_0023c0d0` L87313). */
  name: { dx: 4, dy: -2, scale: 0.9 },
  /** The middle card's highlight: x 170 (0x414740) .. +170 (0x414728), y 226 (0x414748) .. +64 (0x414720). */
  highlight: { x: 170, y: 226, w: 170, h: 64 },
} as const;

/**
 * The card name's own offset (was `CARD_TEXT_OFFSET_READING`; web sprint 5 S4, from source): `FUN_0023c0d0` places the
 * name at its text object's position `+0x90/+0x94` (card `+0x130/+0x134`, set by `FUN_0023c2b0` L87347 through
 * `FUN_003631a0` L260960) plus the object's own `+0x7c/+0x80` (card `+0x11c/+0x120`, L87309-87318), as every
 * C2DString's draw adds them (`FUN_00362900` L260673-260674). The card's text is a C2DString (the card's ctor
 * `FUN_0023df80` L88226 -> `FUN_00363e70` L261444, which writes `+0x7c/+0x80` = 0), its string setters write 0 again
 * (`FUN_003631f0` L261034-261039, `FUN_00363460` L261074-261079), and nothing else writes them: no store to +0x7c or
 * +0x80 in the menu's recompiled functions (`FUN_0023b*`..`FUN_00241*`) nor in the class's own. So 0, and the pen is
 * (174, y0 - 2).
 */
export const CARD_TEXT_OFFSET = { dx: 0, dy: 0 } as const;

/**
 * How each `hud_arrow_off2.tif` quad is oriented (was `ARROW_ORIENT_READING`; web sprint 5 S4, from source). The quad is
 * two triangles (`FUN_00359590` L255116: A = (x,y) (x,y+h) (x+w,y+h), B = (x,y) (x+w,y+h) (x+w,y)) whose vertex slots
 * keep their texel corners (`FUN_00359640` L255143-255144 through `FUN_00361000` L259763: A (0,0) (0,1) (1,1), B
 * (0,0) (1,1) (1,0)); `FUN_00358cc0` (L254804) and `FUN_00358e20` (L254862) move the **positions** among the slots
 * (the calls at L88147-88162). Worked through, a screen point (sx, sy) in 0..1 samples the bitmap at:
 *
 * - no swap (the item arrow over the cards, `+0x580` at y 140): (sx, sy), as stored;
 * - `FUN_00358e20` (the item arrow under them, `+0x770` at y 344): (sx, 1 - sy), mirrored top to bottom;
 * - `FUN_00358cc0` then `FUN_00358e20` (the category arrow at x 168, `+0x1a0`): (1 - sy, sx), a quarter turn
 *   counter-clockwise;
 * - `FUN_00358cc0` (the category arrow at x 305, `+0x390`): (1 - sy, 1 - sx), mirrored left to right, then a quarter
 *   turn clockwise.
 *
 * The bitmap points **up** (the disc's `hud_arrow_off2.tif`, 32x32 top row first: its tip at row 9, its base at rows
 * 21-22; `test/weaponSelect.test.ts` measures it), so the four point left, right, up and down.
 */
export const ARROW_ORIENT = {
  left: { turn: -Math.PI / 2, flipU: false, flipV: false }, right: { turn: Math.PI / 2, flipU: true, flipV: false },
  up: { turn: 0, flipU: false, flipV: false }, down: { turn: 0, flipU: false, flipV: true },
} as const;

/**
 * ARROW_TINT_SCALE_READING: the arrows' colours go through `FUN_003590e0` -> `FUN_00361200` (a polygon's vertex
 * colour), not `FUN_00364930`'s sprite tint; taken on the same GS 0-128 MODULATE scale [inferred], so the pulse's
 * (255, 255, 128) brightens the arrow up to twice, saturating, as the GS does.
 */
export const ARROW_TINT_SCALE_READING = 128;

/**
 * PULSE_PHASE_READING: the game's three pulses are persistent accumulators, each 0 rising when the HUD is built -- the
 * block's ctor `FUN_00241a90` (D:L89868-89880: the card highlight's `+0x1154` 1.0 / `+0x1158` 0, the slot bar's
 * `+0x1538` 1.0 / `+0x153c` 0) and the picker's Init `FUN_0023cd20` (the arrows' `+0xf28` 0 / `+0xf2c` 1), run once from
 * the HUD's Init `FUN_00240e60` (D:L89595-89600, its one caller `FUN_001fa360` D:L57437-57440; research 202 §3.12) --
 * and each advances only while its part shows: the bar in state 2 (D:L89400-89432), the highlight while the slot list's
 * body shows (D:L89464-89488), the arrows in state 3 (`FUN_0023d2b0` D:L87909-87923). Opening the menu resets none:
 * each carries its phase from one opening to the next (`MenuPulses`, research 233 §4). Was 0 (each from the opening).
 * Whether the HUD is rebuilt between rounds of one match was not read (202 §3.12). [reading]
 */
export const PULSE_PHASE_READING = 'persistent';

/**
 * EMPTY_SLOT_NAME_READING: an empty slot (0xff) and the second slot of a 2-slot item (0xfe) show the DisplayName of the
 * record of that id, as a weapon's row does (`FUN_003c4b40(0x4b5210, id)` D:L316433-316449 by `+0x7c`, the row setter
 * `+0x70` of `FUN_0023e370` D:L88329-88336; research 181 §3.1): `zweapon.rdr`'s `EQUIP_NONE` `<NONE>` and `FULL_SLOT`
 * `-------` (`weapon_list.py`: 86 records, 254 and 255 among them; the fixture's ZWEAPON.ZAR has both). The arsenal's
 * records are used; these, their DisplayNames, stand in for an arsenal without them. That the setter draws the
 * DisplayName is inferred from its use for real items. Was `''`. [reading]
 */
export const EMPTY_SLOT_NAME_READING: Readonly<Record<number, string>> = { [EMPTY_ITEM]: '<NONE>', [FULL_SLOT]: '-------' };

/**
 * The draw order (was `DRAW_ORDER_READING`; web sprint 5 S4, from source). `FUN_001f6e10` (L56074) appends a part (its
 * 4th argument 1: at the end) to one of the HUD's three lists: the list given, or for -1 the list of its texture
 * library's `renderphase` (`FUN_003197e0` L217372 keeps it at the texture's `+0x2f`) less 12, anything outside 12-14
 * going to list 2. The frame draws the lists of render phases 12, 13 and 14 in turn (`FUN_001fba70`, L50862-50869). The
 * disc's libraries: `HUD2_TXR` renderphase 13, `HUDW_TXR` 12, `HUD_TXR` 14, `FONT_TXR` 1. So:
 *
 * - list 1 (phase 13): the picker's parts first -- the block's Init `FUN_00240e60` (from `CHUD` Init, L57439) calls
 *   the picker's Init `FUN_0023cd20` (L89600) before its own registrations, and that registers on list 1 itself
 *   (L87768-87779): the header panel, the body panel, the header, the four arrows (x 168, x 305, y 140, y 344), the
 *   card highlight, the cards (each its icon then its name, `FUN_0023c220` L87328); then the slot list's own (-1 on
 *   `HUD2_TXR`, L89617-89619): the title panel, the body panel, the bar;
 * - list 2 (phase 14): the help lines (`CHUD` Init L57304, -1 on `FONT_TXR`, before the menu), then the title and the
 *   rows (-1 on `FONT_TXR`, L89620-89621).
 *
 * Each string draws its glyphs in turn, a glyph's drop shadow just before the glyph (`FUN_003625e0` L260602-260620).
 * A group of parts (the cards' icons and names) is drawn in the order the layout makes them: card by card.
 */
export const DRAW_ORDER: readonly (readonly WeaponSelectPart[])[] = [
  ['pickerPanel'], ['pickerBody'], ['pickerHeader'], ['categoryArrow'], ['itemArrow'], ['cardHighlight'], ['cardIcon', 'cardName'],
  ['titlePanel'], ['body'], ['bar'], ['prompt'], ['title'], ['row'],
];
const DRAW_RANK = new Map<WeaponSelectPart, number>(DRAW_ORDER.flatMap((group, i) => group.map((part) => [part, i] as const)));

// ---------------------------------------------------------------------------------------------------------------------
// The clock.

/** A 0..1..0 triangle at `rate` (dt x rate each frame, reversing at 0 and 1): 1 / rate up, 1 / rate down. */
export function pulse(t: number, rate: number): number {
  const x = (Math.max(0, t) * rate) % 2;
  return x <= 1 ? x : 2 - x;
}

/** The seconds each pulse has advanced since the HUD was built (`PULSE_PHASE_READING`). */
export interface PulseClocks { bar: number; highlight: number; arrows: number }

/**
 * The three pulses' accumulators for one match's HUD (`PULSE_PHASE_READING`): built at 0, never reset by an opening,
 * each advanced only while its part shows -- the slot bar in the list (state 2, D:L89400), the arrows in the picker
 * (state 3, `FUN_0023d2b0` from D:L89380-89382), the card highlight while the body shows (open, and fading out after a
 * close, D:L89464: the panel at +0x120 shown until the fade reaches 0, D:L89439-89452). `change` at each screen change.
 */
export class MenuPulses {
  private acc: PulseClocks = { bar: 0, highlight: 0, arrows: 0 };
  private screen: MenuState['screen'] = 'closed';
  private since = 0;
  private openedAt = 0;
  /** How long the body shows after the last close: the fade reached, down at 400/s (`menuFade`). */
  private fadeOut = 0;

  /** The menu went to `screen` at `now` (seconds, the menu's clock). */
  change(screen: MenuState['screen'], now: number): void {
    if (screen === this.screen) return;
    this.acc = this.clocks(now);
    if (this.screen === 'closed') this.openedAt = now;
    if (screen === 'closed') this.fadeOut = Math.min(FADE_MAX, FADE_RATE * Math.max(0, now - this.openedAt)) / FADE_RATE;
    this.screen = screen;
    this.since = now;
  }

  /** Each pulse's seconds at `now`. */
  clocks(now: number): PulseClocks {
    const d = Math.max(0, now - this.since), a = this.acc;
    if (this.screen === 'list') return { bar: a.bar + d, highlight: a.highlight + d, arrows: a.arrows };
    if (this.screen === 'picker') return { bar: a.bar, highlight: a.highlight + d, arrows: a.arrows + d };
    return { bar: a.bar, highlight: a.highlight + Math.min(d, this.fadeOut), arrows: a.arrows };
  }
}

const mix = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/**
 * The menu's fade, 0..100 (L89439-89452): up at 400/s from the opening while the menu is open; after it closes, down
 * at 400/s from what it had reached. `t` is the seconds since the menu opened; `closedFor` the seconds since it closed
 * (for `screen` 'closed'; absent: it never opened, or closed long ago -- 0).
 */
export function menuFade(screen: MenuState['screen'], t: number, closedFor?: number): number {
  if (screen !== 'closed') return Math.min(FADE_MAX, FADE_RATE * Math.max(0, t));
  if (closedFor === undefined) return 0;
  const reached = Math.min(FADE_MAX, FADE_RATE * Math.max(0, t - closedFor));
  return Math.max(0, reached - FADE_RATE * closedFor);
}

// ---------------------------------------------------------------------------------------------------------------------
// The prompt (S1 / S1g).

/** Where the prompt comes from: a pad (the game's glyph), the PC keyboard, or the touch screen. */
export type InputDevice = 'pad' | 'keyboard' | 'touch';

/**
 * WEAPON_SELECT_KEY_READING: the PC key that opens the menu -- `I`, after the game's own name for the button,
 * `Inventory` (`controller.rdr` result 4); free in `controlsList.ts` and every `e.code` binding of the page (§B3).
 * Drawn in the prompt as a key cap, `[I]`. For the owner (O-S4-3).
 */
export const WEAPON_SELECT_KEY_READING = { code: 'KeyI', label: '[I]' } as const;
/**
 * WEAPON_SELECT_TOUCH_READING: the touch control that opens it -- an on-screen button shown only while the prompt is,
 * labelled `INV` after `Inventory`; the prompt names it as `[INV]`. For the owner (O-S4-3).
 */
export const WEAPON_SELECT_TOUCH_READING = { label: '[INV]' } as const;

/**
 * The pad's `Inventory` glyph (was `PAD_GLYPH_PLACEHOLDER`, drawn as the words "R2"/"R1"; web sprint 5 S4):
 * `FUN_002c6430(4)` gives 0xbe for slot 11 (R2) and 0xbd otherwise (L56997-57001), the face's R2 and R1 glyphs on
 * `font_special_01.tif` (research 95 §5.4 and §7; `./hudFont` `FONT_SPECIAL_01`), drawn in place.
 */
export const INVENTORY_GLYPH = { R2: 0xbe, R1: 0xbd } as const;

/**
 * The lines as the ELF holds them (0x3e32e0, 0x3e3350, 0x3e3380; the ghost's 0x3e31c0, 0x3e31f0, 0x3e3280, 0x3e32b0),
 * `%c` the `Inventory` glyph (`FUN_001988d0`, L56997 / L57050), `£` / `¯` the bytes 0xa3 / 0xaf in place: the d-pad's
 * **right** and **left** glyphs (`DPAD_GLYPH`), the buttons of the dead player's teammate cycle (`FUN_00592560`
 * L451683-451694 reads pad bytes +3 Right and +4 Left) -- research 94's `GLYPH_READING` had them Up / Down.
 */
export const DEAD_PROMPT = [
  'You have died.  %c Select new weapons.', 'Use the £ and ¯ directional buttons', 'to cycle through living teammates',
] as const;
export const GHOST_PROMPT = [
  'You are a ghost.  You will play the next', 'round as a real player.  %c Select new',
  'weapons. Use the £ and ¯ directional', 'buttons to cycle through living teammates.',
] as const;
/**
 * LATER 118 (research 282 §8; research 91 §12): the lines a dead player watching a teammate is written (`FUN_001f9f20`
 * D:L57150-57152: 0x3e3430, 0x3e3450, 0x3e3410) and a ghost's there (D:L57162-57165: 0x3e31c0, 0x3e33b0, 0x3e33e0,
 * 0x3e3410), as the ELF holds them (read through `tools/elfImage.ts`); `£` / `¯` the d-pad's right and left glyphs.
 */
export const DEAD_WATCH_PROMPT = ['You have died.  Use the £ and ¯', 'directional buttons to cycle through', 'living teammates.'] as const;
export const GHOST_WATCH_PROMPT = [
  'You are a ghost.  You will play the next', 'round as a real player.  Use the £ and', '¯ directional buttons to cycle through',
  'living teammates.',
] as const;
/** What each path writes to the lines it leaves (0x3e31b0, a space: D:L57043, D:L57103, D:L57156, D:L57169). */
export const HELP_BLANK = ' ';

/**
 * PROMPT_COLOUR_READING: the help lines' colour and alpha. `CHUD`'s Init writes (100, 100, 20) into each line's colour
 * words (`+0x48..+0x50` of the text at `+0x19d58 + 0x98 i`, L57301-57303 -- the same words the title's
 * (128, 128, 64) is written to, L88296) and the hold sets the alpha 100 (0x42c80000, L56546); research 94 §B4's S1 row
 * gives (128, 128, 128) alpha 80. The code's values are taken. The lines are centred (`+0x69` of the text, `+0x19dc1`,
 * set at L57122 before `FUN_00362b70`) on x 324 (`DAT_003dc3b8`), baseline 380 + 18 i (`DAT_003dc3c0`, `DAT_003dc3c8`).
 */
export const PROMPT_COLOUR_READING = { rgb: [100, 100, 20] as Rgb, alpha: 100 } as const;
/** The lines: centred on x 324, baselines 380 + 18 i, scale 0.9 (0x3f666666, L57299); hold 10 s, fade 0.5 s (L56544-56561). */
export const PROMPT_LAYOUT = { x: 324, y: 380, pitch: 18, scale: 0.9, hold: 10, fade: 0.5 } as const;

/** What the prompt needs: the lines (dead, or a ghost), the device, the seconds since the death edge. */
export interface PromptInfo {
  ghost: boolean;
  device: InputDevice;
  /** Seconds since the death edge (the help-line timer `CHUD+0x1a0e8`, zeroed at the death, L56630-56645). */
  sinceDeath: number;
  /** RSP-6 (research 351): present only on the respawn dead path; its independent Action line is eligible now. */
  respawnReady?: boolean;
  /** The pad's `Inventory` button: R2 in every config but Goldeneye's R1 (0xbe / 0xbd). The viewer keeps R2. */
  inventoryButton?: 'R2' | 'R1';
}

/**
 * A game line rendered for the device: the `%c` as the pad's glyph (its code, drawn from `font_special_01.tif`), the
 * PC key or the touch label; the d-pad glyphs stay the line's own bytes on every device. `glyphs` lists the pad glyph
 * codes the text carries, in order.
 */
export function renderLine(raw: string, device: InputDevice, inventoryButton: 'R2' | 'R1' = 'R2'): { text: string; glyphs: number[] } {
  const glyphs: number[] = [];
  const text = raw.replace(/%c|[£¯]/g, (m) => {
    if (m !== '%c') { glyphs.push(m.charCodeAt(0)); return m; }
    if (device !== 'pad') return device === 'keyboard' ? WEAPON_SELECT_KEY_READING.label : WEAPON_SELECT_TOUCH_READING.label;
    glyphs.push(INVENTORY_GLYPH[inventoryButton]);
    return String.fromCharCode(INVENTORY_GLYPH[inventoryButton]);
  });
  return { text, glyphs };
}

/**
 * LATER 118 (research 282 §8): the six help lines `CHUD+0x19d58` (the HUD's `'help'`, `./hud` `spectatorHudView`) as a
 * dead player's path writes them, respawn off: on his own body `FUN_001f97b0` (D:L56996-57107) the dead's three or the
 * ghost's four (`DEAD_PROMPT`, `GHOST_PROMPT`), watching a teammate `FUN_001f9f20` (D:L57149-57173) the watching three
 * or four (`DEAD_WATCH_PROMPT`, `GHOST_WATCH_PROMPT`); the rest `HELP_BLANK`. The `%c` rendered for the device as the
 * prompt's (`renderLine`). No clock here: the lines' alpha is the HUD's (`helpAlpha`).
 */
export function deadHelpLines(p: { ghost: boolean; watching: boolean; device: InputDevice; inventoryButton?: 'R2' | 'R1' }): string[] {
  const raw: readonly string[] = p.watching ? (p.ghost ? GHOST_WATCH_PROMPT : DEAD_WATCH_PROMPT) : (p.ghost ? GHOST_PROMPT : DEAD_PROMPT);
  return Array.from({ length: 6 }, (_, i) => (i < raw.length ? renderLine(raw[i]!, p.device, p.inventoryButton).text : HELP_BLANK));
}

/**
 * The dead player's prompt (`FUN_001f97b0` L56978-57062, classic): three lines, or the ghost's four; held 10 s, then
 * faded (1 - (t - 10) / 0.5) x 100 to nothing (L56552-56561). The respawn-specific state is rendered by the shared
 * HUD help path (`./respawnPrompt`, research 351), not this classic/ghost transcription.
 */
export function promptLines(p: PromptInfo): WsText[] {
  const L = PROMPT_LAYOUT, over = p.sinceDeath - L.hold;
  const alpha = over <= 0 ? PROMPT_COLOUR_READING.alpha : (1 - over / L.fade) * 100;
  if (alpha <= 0) return [];
  return (p.ghost ? GHOST_PROMPT : DEAD_PROMPT).map((raw, i) => {
    const { text, glyphs } = renderLine(raw, p.device, p.inventoryButton);
    return {
      kind: 'text', part: 'prompt', text, x: L.x, y: L.y + L.pitch * i, scale: L.scale, align: 'centre',
      rgb: PROMPT_COLOUR_READING.rgb, alpha, index: i, ...(glyphs.length ? { glyphs } : {}),
    } satisfies WsText;
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// The keys and the pad inside the menu (§B3).

/**
 * WEAPON_SELECT_MENU_KEYS_READING: the keys inside the menu -- W / S or the Up / Down arrows for Up / Down, A / D or
 * the Left / Right arrows for Left / Right, X (the page's action) or Enter for Action, Backspace for Triangle, and `I`
 * as `Inventory` (it opens the menu and closes the list). Esc is left alone: it releases the mouse. For the owner.
 */
export const WEAPON_SELECT_MENU_KEYS_READING: Readonly<Record<string, MenuInput>> = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyX: 'action', Enter: 'action', Backspace: 'back', [WEAPON_SELECT_KEY_READING.code]: 'inventory',
};

/** A `KeyboardEvent.code` -> the menu's input, or null for a key the menu does not read. */
export function menuInputOfKey(code: string): MenuInput | null {
  return Object.hasOwn(WEAPON_SELECT_MENU_KEYS_READING, code) ? WEAPON_SELECT_MENU_KEYS_READING[code]! : null;
}

/**
 * The pad keeps the game's buttons (§B3, the Default config): the d-pad (slots 2-5), `Action` X (Cross), Triangle or
 * Start back (+7 / +1, L88603, L87874), `Inventory` R2 (L89371); one step per press. Circle is the owner's adaptation
 * (OT.R106, 2026-11-06): in the original Circle is not cancel (`FUN_0023e5e0`, D:L88379); on the owner's word it is
 * `close`, the menu shut from the list or the picker. Open, the menu takes the press, so it never reaches the game's
 * TeamCommand; closed, Circle stays the game's.
 */
export const WEAPON_SELECT_PAD: Readonly<Partial<Record<PadButton, MenuInput>>> = {
  Up: 'up', Down: 'down', Left: 'left', Right: 'right', Cross: 'action', Triangle: 'back', Start: 'back', R2: 'inventory',
  Circle: 'close',
};

/** A pad button (`./gamepad`'s standard names) -> the menu's input, or null. */
export function menuInputOfPad(button: PadButton): MenuInput | null {
  return WEAPON_SELECT_PAD[button] ?? null;
}

// ---------------------------------------------------------------------------------------------------------------------
// The layout.

/** A record's DisplayName upper-cased per character (`FUN_001fcd00` -> `FUN_0019afd0`, toupper [inferred]). */
function upper(s: string): string {
  return s.replace(/[a-z]/g, (c) => c.toUpperCase());
}

/**
 * An item's name as the menu draws it: its record's DisplayName (0xff and 0xfe included, `EMPTY_SLOT_NAME_READING`
 * standing in for an arsenal without them); none (a row past the kit's count, D:L88328) blank.
 */
function nameOf(ctx: MenuContext, id: number | null | undefined): string {
  if (id === null || id === undefined) return '';
  const item = ctx.arsenal.items.get(id);
  return item ? upper(item.displayName) : EMPTY_SLOT_NAME_READING[id] ?? '';
}

/** An item's icon bitmap name (`IconTextureName`, keyed lower-case as `./hudAssets` keys the HUD's bitmaps), or null. */
export function iconOf(ctx: MenuContext, id: number | null): string | null {
  if (id === null) return null;
  return ctx.arsenal.items.get(id)?.icon?.toLowerCase() ?? null;
}

/** Every bitmap the menu draws for a kit's picker and rows: the panels, the arrows, the arsenal's icons. */
export function weaponSelectTextures(ctx: MenuContext): string[] {
  const icons = [...ctx.arsenal.items.values()].map((i) => i.icon?.toLowerCase()).filter((i): i is string => !!i);
  return [PANEL_TEXTURE, ARROW_TEXTURE, ...new Set(icons)];
}

/**
 * Options: the seconds since the menu closed (its fade-out), the prompt when the player is dead, and the pulses'
 * clocks (`MenuPulses`, `PULSE_PHASE_READING`) -- absent, each pulse runs on `t`, the seconds since the opening.
 */
export interface LayoutOptions { closedFor?: number; prompt?: PromptInfo; pulses?: PulseClocks }

/**
 * The menu on the 640x448 frame for `state` at `t`, the seconds since it opened (the fades and the pulses), pure.
 * Closed, it is drawn fading out as the slot list for `closedFor` seconds after the close, then not at all; the prompt
 * (`opts.prompt`) is drawn whatever the menu's state.
 */
export function weaponSelectLayout(state: MenuState, ctx: MenuContext, t: number, opts: LayoutOptions = {}): WeaponSelectLayout {
  const items: WeaponSelectItem[] = [];
  const fade = menuFade(state.screen, t, opts.closedFor);
  const clocks = opts.pulses ?? { bar: t, highlight: t, arrows: t };
  if (fade > 0) {
    const L = LIST_LAYOUT, P = PICKER_LAYOUT;
    const sprite = (part: WeaponSelectPart, texture: string, r: { x: number; y: number; w: number | null; h: number | null },
      rgb: Rgb, extra: Partial<WsSprite> = {}): void => {
      items.push({ kind: 'sprite', part, texture, x: r.x, y: r.y, w: r.w, h: r.h, turn: 0, flipU: false, flipV: false, rgb, alpha: fade, ...extra });
    };
    const text = (part: WeaponSelectPart, line: string, x: number, y: number, scale: number, rgb: Rgb,
      align: WsText['align'] = 'left', index?: number): void => {
      items.push({ kind: 'text', part, text: line, x, y, scale, align, rgb, alpha: fade, ...(index === undefined ? {} : { index }) });
    };

    // The slot list (`FUN_0023e030`): panels, the bar -- pulsing in state 2, solid otherwise (L89400-89432) -- the rows.
    sprite('titlePanel', PANEL_TEXTURE, L.titlePanel, HEADER_PANEL_RGB);
    sprite('body', PANEL_TEXTURE, L.body, BODY_PANEL_RGB);
    const barRgb = state.screen === 'list' ? mix(PULSE_LOW, PULSE_HIGH, pulse(clocks.bar, SLOT_PULSE_RATE)) : PULSE_HIGH;
    sprite('bar', PANEL_TEXTURE, { ...L.bar, y: L.bar.y + L.bar.pitch * state.slot }, barRgb);
    text('title', TITLE, L.title.x, L.title.y, L.title.scale, TITLE_RGB, 'centre');
    const valves = menuValves(ctx.valves, state.loadout[0]);
    for (let i = 0; i < 5; i++) {
      const locked = slotLocked(valves, ctx.side, state.loadout, i);
      text('row', nameOf(ctx, state.loadout[i]!), L.rows.x, L.rows.y + L.rows.pitch * i, L.rows.scale, locked ? LOCKED_RGB : ROW_RGB, 'left', i);
    }

    // The picker: in S3 its own category and item; in S2 (and fading out) a preview of the highlighted slot's
    // (`FUN_0023d540` re-seeds it on each slot step, L87972).
    const picking = state.screen === 'picker';
    const seed = picking ? { category: state.category, item: state.item } : (({ category, id }) => ({ category, item: id }))(pickerOn(state));
    const view: MenuState = { ...state, ...seed };
    sprite('pickerPanel', PANEL_TEXTURE, P.panel, HEADER_PANEL_RGB);
    sprite('pickerBody', PANEL_TEXTURE, P.body, BODY_PANEL_RGB);
    // The middle card's highlight: shown in S3 only (`FUN_00240b90(,3)` L89532; hidden at 0 and 2, L89514 and L89545), pulsing (L89468-89495).
    if (picking) sprite('cardHighlight', PANEL_TEXTURE, P.highlight, mix(PULSE_LOW, PULSE_HIGH, pulse(clocks.highlight, CARD_PULSE_RATE)));
    text('pickerHeader', categoryName(view.category, slotKind(view.slot)), P.header.x, P.header.y, P.header.scale, TITLE_RGB, 'centre');

    // The arrows: S3 pulsing (`FUN_0023d2b0`), else grey (`FUN_0023d460`).
    const arrowRgb = picking ? mix(ARROW_LOW, ARROW_HIGH, pulse(clocks.arrows, ARROW_PULSE_RATE)) : ARROW_IDLE;
    const O = ARROW_ORIENT;
    P.categoryArrows.forEach((a, i) => sprite('categoryArrow', ARROW_TEXTURE, { ...a, w: null, h: null }, arrowRgb, { ...(i ? O.right : O.left), index: i }));
    P.itemArrows.forEach((a, i) => sprite('itemArrow', ARROW_TEXTURE, a, arrowRgb, { ...(i ? O.down : O.up), index: i }));

    // The three cards; a blank side card draws nothing (L88180-88184, `FUN_0023c0d0` with 0 hides both parts).
    cards(ctx, view).forEach((id, i) => {
      if (id === null) return;
      const y0 = P.cards.y + P.cards.pitch * i;
      const icon = iconOf(ctx, id);
      if (icon) sprite('cardIcon', icon, { x: P.cards.x + P.icon.dx, y: y0 + P.icon.dy, w: null, h: null }, BODY_PANEL_RGB, { index: i });
      text('cardName', nameOf(ctx, id), P.cards.x + P.name.dx + CARD_TEXT_OFFSET.dx, y0 + P.name.dy + CARD_TEXT_OFFSET.dy,
        P.name.scale, ROW_RGB, 'left', i);
    });
  }
  if (opts.prompt) items.push(...promptLines(opts.prompt));
  // The game's order (`DRAW_ORDER`), each group's parts as made here (a stable sort).
  return { items: items.map((item, n) => ({ item, n, rank: DRAW_RANK.get(item.part)! })).sort((a, b) => a.rank - b.rank || a.n - b.n).map((r) => r.item) };
}

// ---------------------------------------------------------------------------------------------------------------------
// The draw.

/** The quads' element: the HUD's own name for the menu and the prompt (`./hud` `HudElement`), drawn on the overlay's layer 1. */
export const WEAPON_SELECT_ELEMENT: HudElement = 'weaponSelect';

type Rgba4 = [number, number, number, number];

/**
 * The layout as the HUD pass's quads on a frame (layer 1, over the in-round HUD), in the layout's order (`DRAW_ORDER`),
 * as `scoreboardLayout` draws: centred on the frame and scaled by height / 448; the strings in `font_text_01` with its
 * drop shadow, glyph by glyph (a glyph's shadow just before it, `FUN_003625e0` L260602-260620), and the pad glyphs from
 * `font_special_01.tif` in their own colour with no shadow (`./hudFont` `FONT_SPECIAL_01`); each tint and alpha on the
 * 0-128 scale (`ARROW_TINT_SCALE_READING` for the arrows). `sizes` are the loaded bitmaps by name (a bitmap map serves:
 * only `width` and `height` are read); what has no bitmap, or is faded out, draws nothing. Its result is what a
 * `HudOverlay` (`hud.setOverlay`) returns.
 */
export function drawWeaponSelect(
  frame: { width: number; height: number }, layout: WeaponSelectLayout, sizes: Record<string, { width: number; height: number }>,
  opts: { anchor?: 'centre' | 'left' } = {},
): { quads: HudQuad[]; tris: HudTri[] } {
  const s = frame.height / 448;
  // `left`: the frame's left edge, as `./hud` anchors the weapon box (`L`); the R2 inventory stands in that column.
  const X = opts.anchor === 'left' ? (x: number): number => x * s : (x: number): number => frame.width / 2 + (x - 320) * s;
  const Y = (y: number): number => y * s;
  const quads: HudQuad[] = [];
  const rect = (texture: string, x0: number, y0: number, x1: number, y1: number, rgba: Rgba4, uv: [number, number, number, number], turn = 0): void => {
    if (rgba[3] <= 0 || x1 <= x0 || y1 <= y0) return;
    const [u0, v0, u1, v1] = uv;
    quads.push({ element: WEAPON_SELECT_ELEMENT, texture, x: (X(x0) + X(x1)) / 2, y: (Y(y0) + Y(y1)) / 2, w: X(x1) - X(x0), h: Y(y1) - Y(y0),
      turn, u0, v0, u1, v1, rgba, layer: 1 });
  };
  const c128 = (rgb: Rgb, alpha: number, scale = 128): Rgba4 => [rgb[0] / scale, rgb[1] / scale, rgb[2] / scale, alpha / 128];
  for (const item of layout.items) {
    if (item.kind === 'sprite') {
      const size = sizes[item.texture];
      if (!size) continue;
      const w = item.w ?? size.width, h = item.h ?? size.height;
      const [s0, t0, s1, t1] = item.src ?? [0, 0, 1, 1];
      const [u0, u1] = item.flipU ? [s1 * size.width, s0 * size.width] : [s0 * size.width, s1 * size.width];
      const [v0, v1] = item.flipV ? [t1 * size.height, t0 * size.height] : [t0 * size.height, t1 * size.height];
      const scale = item.texture === ARROW_TEXTURE ? ARROW_TINT_SCALE_READING : 128;
      rect(item.texture, item.x, item.y, item.x + w, item.y + h, c128(item.rgb, item.alpha, scale), [u0, v0, u1, v1], item.turn);
      if (item.alphaRight !== undefined && quads.length) quads[quads.length - 1]!.alphaRight = item.alphaRight / 128;
      continue;
    }
    if (!sizes[FONT_TEXT_01.texture] || !item.text.trim()) continue;
    const opts = { special: !!item.glyphs?.length };
    const pen = item.align === 'centre' ? item.x - textWidth(item.text, item.scale, opts) / 2 : item.x;
    const { glyphs } = layoutText(item.text, pen, item.y, item.scale, opts);
    const [dx, dy] = FONT_TEXT_01.dropShadow.pixels;
    const rgba = c128(item.rgb, item.alpha);
    // The shadow's alpha: min(the string's, int(opacity 0.75 x 128) = 96) (`FUN_003625e0` L260614-260619).
    const shadowAlpha = Math.min(item.alpha, Math.trunc(FONT_TEXT_01.dropShadow.opacity * 128)) / 128;
    for (const g of glyphs) {
      const texture = g.texture ?? FONT_TEXT_01.texture;
      if (!sizes[texture]) continue;
      const uv: [number, number, number, number] = [g.u0, g.v0, g.u1, g.v1];
      if (g.rgb) { rect(texture, g.x, g.y, g.x + g.w, g.y + g.h, c128(g.rgb, item.alpha), uv); continue; }
      const sx = g.x + dx * item.scale, sy = g.y + dy * item.scale;
      rect(texture, sx, sy, sx + g.w, sy + g.h, [0, 0, 0, shadowAlpha], uv);
      rect(texture, g.x, g.y, g.x + g.w, g.y + g.h, rgba, uv);
    }
  }
  return { quads, tris: [] };
}
