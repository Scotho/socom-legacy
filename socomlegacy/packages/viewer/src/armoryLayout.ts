import { glyphOf, type FontFace, type LocTable, type Quat4, type UiLayout, type UiModelEntry, type UiObject, type UiText } from '@s2u/scene';
import type { Rgba } from '@s2u/gs';
import {
  OPACITY_STACK_BASE_READING, POPUP_COMMAND_SIZE, POPUP_LINE_HEIGHT, POPUP_RECORD_AT, pushOpacity, readPopupRecord, SPRITE_ST, stToImage,
  type PopupRecord,
} from '@s2u/ui';
import { CURSOR_DROP, CURSOR_WIDTH, teletypeLines, teletypeSpec, wrappedLines, wrappedSpec, type Teletype } from './armoryText';
import { PEN_NUDGE, TEXT_V } from './hudFont';
import type { UiNode } from './uiScript';

/**
 * The ARMORY drawn (web sprint 5, S3; socomlegacy/docs/research/95 §2, §5.4): `dlg_equipment_mp.rdr`'s objects on the
 * game's 640x448 frame, each where the scripts (`./uiScript`) have put it, shown or hidden and as opaque as they left
 * it -- the chrome, the eight columns with their portraits, names, panes and padlocks, the weapon area's windows and
 * arrows -- turned into textured quads in frame pixels, as the HUD's own layers are (`./hud`), for `./armoryView` to
 * draw scaled like the HUD in the Modern and PS2 views. Pure: the layout, the nodes, the strings, the faces and the
 * bitmaps' sizes in; quads out.
 *
 * - **Where**: an object's `XPOS`/`YPOS` are its parent's (`CHILDOF`) plus its own, down the chain (research 95 §2.1),
 *   the scripts' motions moving the node's own; a hidden parent hides its children (the columns' `PrimDummy`s carry
 *   their whole column: `Ui_MP_SEAL_EquipStart` hides the Terrorists' four).
 * - **An image** stretches its bitmap over its `SIZE` at its `OPACITY` (the scripts' opacity), tinted as stored; an
 *   image with no `FILENAME` takes its texture from its `UIVAR` (the portraits, `Seal1`..`Terr4`: the map's
 *   `mission.rdr` `UiVars`, R95.13); one with neither is a placeholder (the `PaneDummy`s) and draws nothing.
 * - **A text** is its caption -- the one a script set (a `UIMnLOC` id or a literal), else the layout's (`_<n>_..._MSG`
 *   through the string table, or its literal), else its `UIVAR`'s value -- in its `FONT` (the screen's `font_text_01`
 *   by default), its `SCALE`, its `COLOR`, left-aligned at `XPOS` or centred on it (`HCENTERED`), `YPOS` the bottom of
 *   its face's cell (`UI_TEXT_ORIGIN`). Glyphs are placed by the engine's rules (`FUN_00361bd0`, `FUN_00363c20`; the
 *   HUD's `./hudFont`), a glyph with its own `color` (the pad's) in that colour with no drop shadow.
 * - **The order** is the node tree's (`UI_DRAW_ORDER_READING`): the background, then the dialog's nodes as the game
 *   makes them -- the `CONTROLS` first, then the `OBJECTS`, each added under its parent -- then the menu fader and the
 *   popup, which hang from the menu's own root.
 * - **An image's scale** (the matrix diagonal a script's scale motion writes, `FUN_00315710` L215015) sizes it from its
 *   left and top edges: the stat bars' `blue_fill` over 140 x the item's value (`BAR_SCALE_ORIGIN_READING`).
 * - **The running texts** (`./armoryText`): the `TELETYPE` (`WepDescription`) its typed lines and its cursor, the
 *   `WRAPPEDTEXT` (`WepInstText`) its caption wrapped in its box, a line every `SPACING` rows.
 * - **The models** are not quads: `armoryModels` names the `MODELS` entries shown, for `./armoryView`'s 3D pass.
 */

/**
 * UI_TEXT_ORIGIN (research 95 §2.7; was `UI_OBJECT_TEXT_ORIGIN_READING` 'baseline', retracted in the polish pass): a
 * TEXT's `XPOS`/`YPOS` is its pen, and the pen's y is the **bottom of the face's cell**. By source: the text draw
 * (`FUN_00362900` L260663-260706) takes the pen as `int(node x + offset)`, `int(node y + offset)`, and the glyph emitter
 * (`FUN_00361bd0` L260374-260460) puts a glyph's corners at the pen's y + (baseline - DispPos.y - h) x S and that + h x
 * VertScale x S: with the letters' baseline 0, DispPos.y 0 and h the cell's rows, the cell hangs from the pen's y up.
 * So `font_text_01`'s letters (foot row 20 of 25) stand 5 x S x 448/480 above `YPOS`, `font_titlebar_01`'s (ink rows
 * 9-38 of 51) 13 x that. Calibrated on the console's own lobby (`logs/parity/s4_pcsx2/A_54_gamelobby2.png`,
 * `dlgGameLobby.rdr` drawn through this module): BACK / SELECT / VOICE CHAT ALL (YPOS 432, 0.95), SEALS / TERRORISTS
 * (240, 0.9) and "Text chat." (120, 1.0) land within one grab row of the console's, GAME LOBBY (titlebar, 65, 0.95)
 * within two (`UI_TEXT_ORIGIN_RESIDUAL_READING`); read as a foot every one sat 5-6 grab rows (12 for the title) low.
 */
export const UI_TEXT_ORIGIN = 'cell bottom' as const;
/**
 * UI_TEXT_ORIGIN_RESIDUAL_READING (research 95 §8): after the cell-bottom rule the lobby's `font_text_01` lines sit
 * within one row of the console capture (a 640x480 grab of the 448-row frame: 0.93 frame rows), its titlebar line 1-2
 * rows low; the runtime offsets
 * `DAT_0049e9a0/a8/ea04` the corners add are not in the decompilation and are taken as 0. A frame grab of the ARMORY
 * itself settles it.
 */
export const UI_TEXT_ORIGIN_RESIDUAL_READING = 0 as const;
/**
 * A text's alpha (the polish pass; research 95 §2.7): when its font is set, a text whose alpha is the full 128 takes its
 * face's `opacity` x 128 instead (`FUN_00362b20` L260712-260724, the face's +0x30) -- both faces of `fonts.rdr` say 0.7,
 * so every full-opacity line draws at 0.7. The owner's ARMORY captures show it: the letters' brightest texels at 0.67-0.73
 * of ours on both faces, the bitmaps around them equal. A line a script fades keeps the alpha the fade gives it
 * (`TEXT_FADE_ALPHA_READING`).
 */
export function textAlpha(face: Pick<FontFace, 'opacity'>, opacity: number): number {
  return opacity === 1 ? face.opacity : opacity;
}
/**
 * TEXT_FADE_ALPHA_READING (research 95 §8): `FUN_00362b20` replaces the alpha only while it is 128 when the font is set;
 * an opacity a script writes later (`OBJECT_OPACITY_FROM_TO`) is read as the alpha itself, except that a fade ending at
 * 1.0 is drawn at the face's opacity again (the node holds no record of the font's step). No ARMORY text fades.
 */
export const TEXT_FADE_ALPHA_READING = 'face opacity at 1.0' as const;
/** UI_TEXT_DEFAULT_COLOUR_READING: a TEXT with no `COLOR` in (128, 128, 128), the bitmap's own (the HUD's white). */
export const UI_TEXT_DEFAULT_COLOUR_READING: readonly [number, number, number] = [128, 128, 128];
/**
 * UI_DRAW_ORDER_READING (research 95 §8): the dialog's node tree, walked depth first. The screen's builder
 * (`FUN_00367950`) makes the background (L263560-263566, on the dialog's root +0xc4), the `MENUFADER` (L263613-263626,
 * on the menu's root +200), then every `CONTROLS` entry (L263627-263647) and only then every `OBJECTS` entry
 * (L263648-263653), and `POPUP` last (L263661-263669, on +200); each through `FUN_003696d0` (L264427-264480), which adds
 * the new node under its `CHILDOF` found among the nodes made so far, else under the dialog's root (L264444-264456,
 * vtable +0x28, +0x18). So the windows of `EquipWeapOpaque` (controls, `backsolid` at 0.35) lie beneath the bars,
 * labels, panes and texts (objects), and a node follows its parent's earlier children. The walk itself (a parent, then
 * its children in the order added) is read, not traced: a console frame settles it.
 */
export const UI_DRAW_ORDER_READING = 'tree' as const;
/**
 * LINE_LIFT (the polish pass; research 95 §2.7): a TELETYPE's and a WRAPPEDTEXT's lines stand `DAT_003e0390` (-5) rows
 * above their pens -- each line's cell bottom at `YPOS` - 5 + i x `SPACING`. The TELETYPE draw (`FUN_00378c00`
 * L272877-272887) puts its cursor, a block the face's cell high, from that row up (and one row under it); the owner's
 * Crossroads capture puts WEAPON TIPS' three lines (WRAPPEDTEXT `WepInstText`, YPOS 310, SPACING 19) 4-5 rows above the
 * single-line rule (`UI_TEXT_ORIGIN`), their feet on rows 300/319/338. The WRAPPEDTEXT's own draw was not read
 * (`MULTILINE_LIFT_READING`, §8): the lift is the TELETYPE's, measured on the WRAPPEDTEXT.
 */
export const LINE_LIFT = CURSOR_DROP;
/**
 * ARMORY_SPRITE_UV (research 182 §2.2 and ARMORY_BITMAP_UV; was ACT_FRAME_BORDER_READING, 'bitmap as decoded'): every
 * 2D quad samples S 0.01 .. 0.99 across and T -0.01 .. -0.99 down (`FUN_00364c50` D:L262025-262030, `FUN_00364830`
 * D:L261813-261816; `@s2u/ui` `SPRITE_ST`), a 1% inset on each side of the upright image (`stToImage`). So the gold
 * selection frame (`EquipXActFrame`, `eq_wep_bgHL.tif`, 128x256, its 3-texel border in alpha) over its 152 px is 2 px
 * across, the owner's capture's 2, where the whole bitmap gave 3.5. Texels on the bitmap's own size.
 */
export const ARMORY_SPRITE_UV: { u0: number; v0: number; u1: number; v1: number } = (() => {
  const [u0, v0] = stToImage(SPRITE_ST[0], SPRITE_ST[1]), [u1, v1] = stToImage(SPRITE_ST[2], SPRITE_ST[3]);
  return { u0, v0, u1, v1 };
})();
/** The object types that draw nothing: `BUTTON`s are input regions. */
export const UNDRAWN_TYPES: ReadonlySet<string> = new Set(['BUTTON']);
/**
 * BAR_SCALE_ORIGIN_READING (research 95 §8): an image's x/y scale anchors at its left/top edge (its `XPOS`/`YPOS`), so a
 * stat bar grows from the left of its `wep_range` frame; the setter writes the matrix diagonal (L215015), the 2D draw
 * was not traced.
 */
export const BAR_SCALE_ORIGIN_READING = 'left edge' as const;
/**
 * CHILD_OPACITY (research 182 §2.23, verified by V4 #4; was CHILD_OPACITY_INHERIT_READING, 'own'): opacity is inherited
 * and multiplied down the tree. The walk pushes a node's opacity times the stack's top when it is under 127/128
 * (`FUN_00336a10` D:L235048-235058, `FUN_00336980` D:L235028-235043; `@s2u/ui` `pushOpacity`), and the 2D adaptor sets
 * the drawn alpha to that top x 128 when it is under 1 (`FUN_0036d8b0` D:L266729-266747). So `PulseArrows` pulsing
 * `arrow_lft` / `arrow_top` pulses their children `arrow_rt` / `arrow_dwn` too.
 */
export const CHILD_OPACITY = 'multiplied' as const;
/** The page's own white texel (`./armoryView` makes it): the TELETYPE's cursor, drawn in a colour. */
export const ARMORY_WHITE = 'armory.white';
/** The full-screen fader the confirm fades in (`OnEquipWeaponBtnDefault`: MENUFADER 0 -> 0.7 in 0.05 s). */
export const MENUFADER = 'MENUFADER';
/** The solid the fader and the popup's panel draw with when nothing else serves (`backsolid.tif`, 16x16, UIMP). */
export const SOLID = 'backsolid.tif';

export type Rgb = readonly [number, number, number];

/** One textured quad on the 640x448 frame: its top-left and size, its texels, its tint and alpha on the GS's 0-128 scale. */
export interface ArmoryQuad {
  texture: string;
  x: number; y: number; w: number; h: number;
  u0: number; v0: number; u1: number; v1: number;
  rgb: Rgb; alpha: number;
  /** The object it draws (a glyph's string's), for the tests and the taps. */
  object: string;
}

/** The dialog's nodes as the script player starts them: every object and control at its file position, the models, the fader. */
export function armoryNodes(layout: UiLayout): { name: string; x: number; y: number; opacity: number; visible?: boolean }[] {
  return [
    ...[...layout.objects, ...layout.controls].map((o) => ({ name: o.name, x: o.x, y: o.y, opacity: o.opacity })),
    ...layout.models.map((m) => ({ name: m.name, x: 0, y: 0, opacity: 1, visible: false })),
    { name: MENUFADER, x: 0, y: 0, opacity: 0 },
  ];
}

/**
 * ABSENT_PARENT_READING (research 95 §8; answered by source): a node whose `CHILDOF` names no node made before it hangs
 * from the dialog's root (`FUN_003696d0` L264444-264456: the parent looked up by name, else the root +0xc4) and draws
 * at its own position -- the network lights `net_conn_ind_Yel`/`_blue` (CHILDOF `letterbar`, absent from this layout,
 * research 95 §2.2) at (577, 25) and (586, 34), which `net_monitor` (UIanim.rdr) drives.
 */
export const ABSENT_PARENT_READING = 'root' as const;

/** The dialog's node tree as the game builds it (`UI_DRAW_ORDER_READING`): each node's parent, and the walk's order. */
export interface UiTree {
  /** Every object and control by lower-case name (the first of a name). */
  byName: ReadonlyMap<string, UiObject>;
  /** Each node's parent (lower-case name), null for the dialog's root. */
  parent: ReadonlyMap<string, UiObject | null>;
  /** The depth-first walk: a parent, then its children in the order made. */
  order: readonly UiObject[];
}

const trees = new WeakMap<UiLayout, UiTree>();

/** The layout's node tree (`UI_DRAW_ORDER_READING`, `ABSENT_PARENT_READING`), built once a layout. */
export function armoryTree(layout: UiLayout): UiTree {
  const held = trees.get(layout);
  if (held) return held;
  const made = [...layout.controls, ...layout.objects];     // FUN_00367950: the CONTROLS, then the OBJECTS
  const byName = new Map<string, UiObject>(), parent = new Map<string, UiObject | null>();
  const children = new Map<UiObject | null, UiObject[]>([[null, []]]);
  for (const o of made) {
    const key = o.name.toLowerCase();
    const up = o.parent ? byName.get(o.parent.toLowerCase()) ?? null : null;   // among the nodes made so far
    if (!byName.has(key)) { byName.set(key, o); parent.set(key, up); }
    children.set(o, []);
    children.get(up)!.push(o);
  }
  const order: UiObject[] = [];
  const walk = (at: UiObject | null): void => { for (const c of children.get(at) ?? []) { order.push(c); walk(c); } };
  walk(null);
  const tree: UiTree = { byName, parent, order };
  trees.set(layout, tree);
  return tree;
}

/** An object's frame position (its parents' and its own, the scripts' motions applied) and whether it shows. */
export function placeOf(o: UiObject, tree: UiTree, node: (name: string) => UiNode | undefined): { x: number; y: number; visible: boolean } {
  let x = 0, y = 0, visible = true;
  let at: UiObject | null | undefined = o;
  for (let guard = 0; at && guard < 16; guard++) {
    const n = node(at.name);
    x += n?.x ?? at.x; y += n?.y ?? at.y;
    if (n && !n.visible) visible = false;
    at = tree.parent.get(at.name.toLowerCase());           // ABSENT_PARENT_READING: none, the root
  }
  return { x, y, visible };
}

/**
 * The stack's top at an object's draw (CHILD_OPACITY): from the dialog's root down to the object, each node's opacity
 * (the scripts', else the layout's) pushed over the top when under 127/128 (`pushOpacity`).
 */
export function opacityOf(o: UiObject, tree: UiTree, node: (name: string) => UiNode | undefined): number {
  const chain: number[] = [];
  let at: UiObject | null | undefined = o;
  for (let guard = 0; at && guard < 16; guard++) {
    chain.push(node(at.name)?.opacity ?? at.opacity);
    at = tree.parent.get(at.name.toLowerCase());
  }
  return chain.reduceRight((top, own) => pushOpacity(top, own), OPACITY_STACK_BASE_READING);
}

// ---------------------------------------------------------------------------------------------------------------------
// Text.

/** A face's cell height: the rows most of its glyphs span (25 for `font_text_01`, 51 for `font_titlebar_01`). */
export function cellOf(face: FontFace): number {
  const count = new Map<number, number>();
  for (const g of face.glyphs) if (g.texture === 1) count.set(g.lr[1] - g.ul[1], (count.get(g.lr[1] - g.ul[1]) ?? 0) + 1);
  let best = 25, n = -1;
  for (const [h, c] of count) if (c > n) { best = h; n = c; }
  return best;
}

/** A glyph placed on the frame: its source rectangle, its destination, its atlas, and its own colour if it has one. */
export interface FaceGlyph { code: number; texture: string; u0: number; v0: number; u1: number; v1: number; x: number; y: number; w: number; h: number; rgb: Rgb | null }

/** A glyph's pen advance (`FUN_0035a7b0` L255868, `FUN_00363c20`): `int((int(DispPos.x + width x HorScale) - 1) x S + 0.5) + xspacing`. */
function advanceOf(face: FontFace, code: number, scale: number): number {
  const g = glyphOf(face, code) ?? glyphOf(face, 32);
  if (!g) return 0;
  const w = Math.trunc(g.disp[0] + (g.lr[0] - g.ul[0]) * g.hscale);
  return Math.floor((w - 1) * scale + 0.5) + face.xspacing;
}

/** The pen's travel over `text` in `face` at `scale`. */
export function faceWidth(face: FontFace, text: string, scale: number): number {
  let w = 0;
  for (const ch of text) w += advanceOf(face, ch.codePointAt(0)!, scale);
  return w;
}

/**
 * A line in `face` with its pen at `x` and its cell's bottom at `y` (`UI_TEXT_ORIGIN`; the HUD's horizontal rules,
 * `./hudFont` `layoutText`, for any face of `fonts.rdr`): each glyph's quad at the pen + `DispPos.x` x S, `(width x HorScale - 1) x S + 0.5` wide, its top
 * (baseline - `DispPos.y` - h + cell) rows below the cell's top, `h x VertScale` rows tall (`FUN_00361bd0`
 * L260374-260442); an unknown code advances by the space and draws nothing.
 */
export function layoutFace(face: FontFace, text: string, x: number, y: number, scale: number): { glyphs: FaceGlyph[]; width: number } {
  const cell = cellOf(face), k = scale * TEXT_V;
  const top = y - cell * k;                                   // UI_TEXT_ORIGIN: the cell hangs from the pen's y
  const glyphs: FaceGlyph[] = [];
  let pen = x;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    const g = glyphOf(face, code);
    if (g && code !== 32) {
      const width = g.lr[0] - g.ul[0], h = g.lr[1] - g.ul[1];
      // GLYPH_ROW_SNAP: the emitter truncates each corner to a whole pixel before the GS's 4 fraction bits
      // (`FUN_00361bd0` L260417-260460, `(short)((int)(...) << 4)`), the lower corner after a + 0.5. The columns keep the
      // HUD's fitted `PEN_NUDGE`, whose fit already holds the truncation's mean (research 87 §6).
      const y0 = top + (g.baseline - g.disp[1] - h + cell) * k, y1 = y0 + h * g.vscale * k;
      const snapTop = Math.trunc(y0), snapFoot = Math.trunc(y1 + 0.5);
      glyphs.push({
        code, texture: face.textures[g.texture - 1] ?? face.textures[0]!,
        u0: g.ul[0], v0: g.ul[1], u1: g.lr[0] - 1, v1: g.lr[1],
        x: pen + g.disp[0] * scale + PEN_NUDGE, y: snapTop,
        w: (width * g.hscale - 1) * scale + 0.5, h: snapFoot - snapTop, rgb: g.color,
      });
    }
    pen += advanceOf(face, g ? code : 32, scale);
  }
  return { glyphs, width: pen - x };
}

/** Words wrapped to `width` pixels in `face` at `scale` (whole words, as the TELETYPE and the popup's text break). */
export function wrapFace(face: FontFace, text: string, width: number, scale: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && faceWidth(face, next, scale) > width) { lines.push(line); line = word; } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

// ---------------------------------------------------------------------------------------------------------------------
// The popup.

export type { PopupRecord } from '@s2u/ui';

/**
 * A POPUP node's record: the 220 bytes after a `ui::UI_COMMAND` on `POPUP` (`UiCommand.extra`), read whole by `@s2u/ui`'s
 * `readPopupRecord` (research 118 §2, `FUN_0036da20` D:L266787-267160): +24 the text's y offset, +28 its x offset and
 * side margin, +64 TRIANGLE armed, +66 the popup has buttons, the two 76-byte slots at the fixed +68 and +144. Null for
 * a record too short to hold its first slot.
 */
export function decodePopup(extra: readonly number[]): PopupRecord | null {
  if (extra.length < 68) return null;
  const bytes = new Uint8Array(POPUP_COMMAND_SIZE);
  bytes.set(extra.slice(0, POPUP_COMMAND_SIZE - POPUP_RECORD_AT), POPUP_RECORD_AT);
  return readPopupRecord(bytes);
}

/**
 * The popup's layout from its record (research 118 §3 and §9, research 182 §2.16; the draw `FUN_00370690`
 * D:L268388-268459; was ARMORY_POPUP_LAYOUT_READING): the panel, the record's bitmap, opaque at colour 128 (`FUN_0020cd50`
 * D:L65834-65852), at (x, y), w x h; the buttons only when the record has them, each at (x + bx, y + by) -- a centred
 * one less half its width (`FUN_0037c220` D:L274566-274572) -- w x h, a width of 0 not drawn, its focused bitmap when
 * focused, else its normal one, opaque, its label's pen at the button's (+tdx, +tdy) at the slot's scale in the slot's
 * focused colour (+32) or normal colour (+44); then the text from (x + [+28], y + [+24]), line i's pen 20 i - 3 below
 * (`FUN_003794b0` D:L273144, the line height `POPUP_LINE_HEIGHT` 20, `FUN_00370610` D:L268382), wrapped to w - 2 x [+28]
 * (D:L267148), in the dialog's face at its opacity (`FUN_00362b20`). The bitmaps are named by the record's name indices,
 * which on the disc are `popupOp.tif` on all 285 records and `active_back.tif` / `pop_butt.tif` on all 199 present
 * buttons (research 118 §12.4, `popupDisc.test.ts`): the names below.
 */
export const POPUP_PANEL = 'popupop.tif';
export const POPUP_BUTTON_FOCUSED = 'active_back.tif';
export const POPUP_BUTTON_NORMAL = 'pop_butt.tif';
/**
 * POPUP_MISSING_BITMAP_FALLBACK -- a browser adaptation with no original (the original always holds its bitmaps): when
 * the page's libraries lack `popupOp.tif`, `active_back.tif` or `pop_butt.tif`, the popup draws on the dialogs'
 * `backsolid.tif` -- the panel dark at 0.85, a button at 0.35, the focused one at 0.7 (sprint 5's values) -- so it is
 * still seen and its buttons are still tapped (`armoryTap`). Never drawn when the disc's bitmaps are read.
 */
export const POPUP_MISSING_BITMAP_FALLBACK = { panel: 0.85, normal: 0.35, focused: 0.7 } as const;

// ---------------------------------------------------------------------------------------------------------------------
// The frame.

export interface ArmoryFrameInput {
  layout: UiLayout;
  node(name: string): UiNode | undefined;
  /** The bitmaps' sizes by lower-case name (a bitmap map serves). */
  sizes: Readonly<Record<string, { width: number; height: number }>>;
  fonts: readonly FontFace[];
  loc: LocTable;
  /** A `UIVAR`'s value: a portrait's texture name, a weapon's or the game's name; null when the page has none. */
  uivar(name: string): string | null;
  /** The popup up, and its record; null for none. */
  popup?: { record: PopupRecord; buttons: { focused: boolean }[] } | null;
  /** A pad glyph's replacement on this device (a key's label), or null to draw the glyph. */
  glyphLabel?(code: number): string | null;
  /** A TELETYPE's run (`./armoryText`), by object name; none: nothing typed yet. */
  teletype?(name: string): Teletype | null;
}

/** A caption to its text. */
export function captionText(c: UiText | string | null, loc: LocTable): string {
  if (c === null) return '';
  if (typeof c === 'string') return loc.caption(c);
  return 'loc' in c ? loc.byId.get(c.loc) ?? '' : c.text;
}

/** The ARMORY's quads on the 640x448 frame, in draw order. */
export function armoryQuads(f: ArmoryFrameInput): ArmoryQuad[] {
  const out: ArmoryQuad[] = [];
  const size = (t: string): { width: number; height: number } | undefined => f.sizes[t.toLowerCase()];
  const sprite = (object: string, texture: string, x: number, y: number, w: number, h: number, alpha: number, rgb: Rgb = [128, 128, 128]): void => {
    const s = size(texture);
    if (!s || alpha <= 0 || w <= 0 || h <= 0) return;
    const uv = ARMORY_SPRITE_UV;                              // S/T 0.01 .. 0.99 (FUN_00364c50)
    out.push({ object, texture: texture.toLowerCase(), x, y, w, h, u0: uv.u0 * s.width, v0: uv.v0 * s.height, u1: uv.u1 * s.width, v1: uv.v1 * s.height, rgb, alpha: alpha * 128 });
  };
  const face = (name: string | null): FontFace | undefined =>
    f.fonts.find((x) => x.name.toLowerCase() === (name ?? f.layout.font ?? 'font_text_01').toLowerCase()) ?? f.fonts.find((x) => x.name === 'font_text_01');
  const relabel = (text: string): string => {
    if (!f.glyphLabel) return text;
    let s = '';
    for (const ch of text) s += f.glyphLabel(ch.codePointAt(0)!) ?? ch;
    return s;
  };
  const text = (object: string, fc: FontFace, line: string, x: number, y: number, scale: number, rgb: Rgb, opacity: number, centred: boolean): void => {
    const alpha = textAlpha(fc, opacity);
    if (!line.trim() || alpha <= 0) return;
    // The pen (`FUN_00362900` L260667-260691): `int(x)`, `int(y)`; HCENTERED takes half the measured width
    // (`FUN_00362b70`, the advances summed) off x, truncated -- the anchor is the line's centre, not a box's.
    const pen = Math.trunc(centred ? Math.trunc(x) - faceWidth(fc, line, scale) * 0.5 : x);
    const { glyphs } = layoutFace(fc, line, pen, Math.trunc(y), scale);
    const sh = fc.dropShadow;
    const shadowAlpha = sh ? Math.min(alpha * 128, Math.trunc(sh.opacity * 128)) : 0;
    for (const g of glyphs) {
      if (!size(g.texture)) continue;
      const q = { object, texture: g.texture.toLowerCase(), w: g.w, h: g.h, u0: g.u0, v0: g.v0, u1: g.u1, v1: g.v1 };
      if (g.rgb) { out.push({ ...q, x: g.x, y: g.y, rgb: g.rgb, alpha: alpha * 128 }); continue; }
      // The drop shadow just before its glyph (`FUN_003625e0` L260602-260620), its offset kept as integers.
      if (sh && shadowAlpha > 0) {
        out.push({ ...q, x: g.x + Math.trunc(sh.offset[0]) * scale, y: g.y + Math.trunc(sh.offset[1]) * scale, rgb: [sh.color[0], sh.color[1], sh.color[2]], alpha: shadowAlpha });
      }
      out.push({ ...q, x: g.x, y: g.y, rgb, alpha: alpha * 128 });
    }
  };

  // The background: `BACKGROUND IMAGE`, stretched over the frame.
  if (f.layout.background) sprite('BACKGROUND', f.layout.background, 0, 0, 640, 448, 1);

  const tree = armoryTree(f.layout);
  for (const o of tree.order) {
    if (UNDRAWN_TYPES.has(o.type)) continue;
    const p = placeOf(o, tree, f.node);
    if (!p.visible) continue;
    // The stack's top (CHILD_OPACITY): the node's opacity times its pushing parents'.
    const n = f.node(o.name), alpha = opacityOf(o, tree, f.node);
    if (o.type === 'IMAGE') {
      const texture = o.filename ?? (o.uivar ? f.uivar(o.uivar) : null);
      // The scale from the left and top edges (BAR_SCALE_ORIGIN_READING).
      const sx = n?.scale[0] ?? 1, sy = n?.scale[1] ?? 1;
      if (texture && o.size) sprite(o.name, texture, p.x, p.y, o.size[0] * sx, o.size[1] * sy, alpha);
      continue;
    }
    if (o.type === 'TELETYPE' || o.type === 'WRAPPEDTEXT') {
      const fc = face(o.font);
      if (!fc) continue;
      const scale = o.scale ?? 1, rgb = o.color ?? UI_TEXT_DEFAULT_COLOUR_READING;
      const advance = (ch: string): number => faceWidth(fc, ch, scale);
      if (o.type === 'WRAPPEDTEXT') {
        const spec = wrappedSpec(o);
        const caption = n?.caption ? captionText(n.caption, f.loc) : o.caption ? captionText(o.caption, f.loc) : '';
        wrappedLines(relabel(caption), spec, advance).forEach((line, i) => text(o.name, fc, line, p.x, p.y + LINE_LIFT + i * spec.spacing, scale, rgb, alpha, false));
        continue;
      }
      const run = f.teletype?.(o.name);
      if (!run) continue;
      const spec = teletypeSpec(o);
      const shown = teletypeLines(run, spec, advance);
      shown.lines.forEach((line, i) => text(o.name, fc, line, p.x, p.y + LINE_LIFT + i * spec.spacing, scale, rgb, alpha, false));
      const c = shown.cursor;
      if (c && c.alpha > 0) {
        // `FUN_00378c00`: 2 px right of the pen, 8 x scale wide, from the line's foot (-5 + 1) up the face's height.
        const base = p.y + c.line * spec.spacing, height = cellOf(fc) * scale * TEXT_V;
        const y1 = base + CURSOR_DROP + 1, y0 = base + CURSOR_DROP - height;
        sprite(`${o.name}.cursor`, ARMORY_WHITE, p.x + Math.trunc(c.pen) + 2, y0, CURSOR_WIDTH * scale, y1 - y0, (alpha * c.alpha) / 128, rgb);
      }
      continue;
    }
    if (o.type === 'TEXT') {
      const fc = face(o.font);
      if (!fc) continue;
      const line = n?.caption ? captionText(n.caption, f.loc) : o.caption !== null && o.caption.trim() !== '' ? captionText(o.caption, f.loc) : o.uivar ? f.uivar(o.uivar) ?? '' : '';
      text(o.name, fc, relabel(line), p.x, p.y, o.scale ?? 1, o.color ?? UI_TEXT_DEFAULT_COLOUR_READING, alpha, o.hcentered);
    }
  }

  // The fader (`MENUFADER`), then the popup.
  const fader = f.node(MENUFADER);
  if (fader && fader.visible && fader.opacity > 0) sprite(MENUFADER, SOLID, 0, 0, 640, 448, fader.opacity, [0, 0, 0]);
  const pop = f.popup;
  if (pop) {
    // The popup's draw (`FUN_00370690`; the layout's doc at POPUP_PANEL): the panel, the buttons, then the text.
    const r = pop.record, fc = face(null);                   // POPUP_FONT_READING: the dialog's FONT (`@s2u/ui`)
    // A library without the record's bitmaps (a page without the lobby's UIMP): the dialogs' `backsolid.tif` stands in
    // (POPUP_MISSING_BITMAP_FALLBACK), so the popup still shows and its buttons stay tap targets (`armoryTap`).
    const has = (t: string): boolean => size(t) !== undefined;
    if (has(POPUP_PANEL)) sprite('POPUP', POPUP_PANEL, r.x, r.y, r.w, r.h, 1);
    else sprite('POPUP', SOLID, r.x, r.y, r.w, r.h, POPUP_MISSING_BITMAP_FALLBACK.panel, [24, 24, 24]);
    if (r.hasButtons) {
      r.buttons.forEach((b, i) => {
        if (b.w <= 0) return;                                // a width of 0: unreachable and not drawn
        const focused = pop.buttons[i]?.focused ?? false;
        const bx = r.x + b.x - (b.centred ? b.w / 2 : 0), by = r.y + b.y;
        const bitmap = focused ? POPUP_BUTTON_FOCUSED : POPUP_BUTTON_NORMAL;
        if (has(bitmap)) sprite(`POPUP_BUTTON_${i}`, bitmap, bx, by, b.w, b.h, 1);
        else sprite(`POPUP_BUTTON_${i}`, SOLID, bx, by, b.w, b.h, focused ? POPUP_MISSING_BITMAP_FALLBACK.focused : POPUP_MISSING_BITMAP_FALLBACK.normal);
        const label = relabel(f.loc.byId.get(b.labelId) ?? '');
        if (!fc || !label) return;
        const lx = b.centred ? r.x + b.x : bx + b.labelOffset[0];   // a centred label on x (D:L267003-267005)
        text(`POPUP_LABEL_${i}`, fc, label, lx, by + b.labelOffset[1], b.scale, focused ? b.colors.focused : b.colors.normal, 1, b.centred);
      });
    }
    if (fc) {
      const lines = wrapFace(fc, relabel(f.loc.byId.get(r.textId) ?? ''), r.w - 2 * r.textX, r.textScale);
      lines.forEach((line, i) => text('POPUP', fc, line, r.x + r.textX, r.y + r.textY + i * POPUP_LINE_HEIGHT - 3, r.textScale, r.textColor, 1, false));
    }
  }
  return out;
}

/** The frame rectangle of a drawn object (the union of its quads), for the taps; null when it drew nothing. */
export function boundsOf(quads: readonly ArmoryQuad[], object: string): { x: number; y: number; w: number; h: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of quads) {
    if (q.object !== object) continue;
    x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x + q.w); y1 = Math.max(y1, q.y + q.h);
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * MODEL_CAMERA_READING (research 95 §8, research 140 R140.4, research 182 §2.29; `scene/src/uiLayout.ts` reads the
 * file's numbers): a `MODELS` entry's model sits at (`AZIMUTH`, `ELEV`, -`DISTANCE`) before a camera at the origin
 * looking down -z, y up -- `FUN_00366730` (D:L262800-262856) makes it at (AZIMUTH + 320, ELEV, 320 - DISTANCE) and the
 * menu's camera node stands at (320, 0, 320) (D:L54812). The projection is square, `focal` px per unit on the 640x448
 * frame: the world loader `FUN_00318da0` overwrites the record's angle with 35 degrees (`FUN_00291490(0x3f1c61aa)`,
 * D:L217205), which sets +0x290 = 320 x cot 35 deg -- 457.0074 as the game's float, read back from every
 * `menu*.rdram` (camera 0xd6df20 +0x290; research 182 §6 #1). So fovY = 2 atan(224 / 457.0074) = 52.22 deg, not the
 * record's +32 0.7854 (pi/4, 540.8 px per unit) that web sprint 5 took by fit: the models are drawn 15% smaller than
 * before and the 67 entries' origins centre on `EquipWeapWin` (x 483-506, y 160-184) instead of 30 px right of it.
 * UI_CAMERA_READING (research 95 §8, research 182 §2.35): the record's +32 is not used (overwritten at load); its other
 * words (+40 4.0, +44/+48 100, +108 270, +124 20, +132 120, +136 100) are not used.
 */
export const MODEL_CAMERA_READING = {
  focal: 457.0074,
  fovY: 2 * Math.atan(224 / 457.0074),
  record: 'RUN/UI/UI.ZED cameras/camera, its angle overwritten with 35 deg (D:L217205)',
} as const;

/** The index of the first quad the models go under (the fader, the popup), or the count. */
export function modelSplit(quads: readonly ArmoryQuad[]): number {
  const i = quads.findIndex((q) => q.object === MENUFADER || q.object.startsWith('POPUP'));
  return i < 0 ? quads.length : i;
}

/** The white texel the pass keeps for solid quads (`ARMORY_WHITE`, the TELETYPE's cursor). */
export const WHITE_TEXEL: Rgba = { width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) };

/**
 * A `MODELS` entry shown now (its node visible), the orientation the scripts' spin has given it, and its model's parts
 * the scripts have switched off (`ARMORY_MODEL_PART_REF`: the 552's `silencer`), which neither presenter draws.
 */
export interface ShownModel { entry: UiModelEntry; rotation: Quat4; hidden?: readonly string[] }

/**
 * ARMORY_MODEL_PART_REF (research 182 §2.3 and §7, re-traced 2026-10-07; reading, pending review): a node the
 * ARMORY's scripts switch that the dialog lacks -- on the disc `silencer`, which `ShowAndSpin`'s 552 branch turns off
 * (`ACTIVE silencer = 0`, never on) -- is the part of that exact name of the first `MODELS` entry, in the layout's
 * order, whose model holds one; that entry's model draws without it while the dialog lasts.
 *
 * - The build makes each `MODELS` instance (`FUN_00366730` D:L262842: `FUN_00317c20` clones the library's model --
 *   `FUN_00316e10` -> the node's clone `FUN_00316820` D:L215638-215790, which clones every child and copies its name,
 *   `FUN_00312aa0` D:L213384-213410), names it by the entry (D:L262845-262849) and **attaches it to the world**
 *   (D:L262850: the world's vtable +0x18, which the ELF's table at 0x406940 gives as `FUN_0031f240`, D:L220653-220672:
 *   appended to the world's children +0x68/+0x6c/+0x70). The dialog's clear destroys them (D:L264412-264418).
 * - A kind-0 reference with no parent (`FUN_0026f4e0` D:L118147-118230) that no node under the animation's own answers
 *   goes to `FUN_00269230` (D:L114368-114413), whose first step (D:L114379-114386) asks the world `DAT_0045c380` by name
 *   and then through its vtable +0x24 -- `FUN_00315d00` in all nine node tables (research 183 §18) -- which searches
 *   the world's children and then each child's subtree in order, comparing with `strcmp` (D:L215255-215290). So the
 *   reference finds the model instances' parts, in the `MODELS` order, case-sensitively. Research 182 §2.3 had only
 *   the later steps (`FUN_0031fd10`, `FUN_00311ef0`), which never reach a dialog's model: the registry they walk is
 *   closed once the menu's world has loaded (`FUN_001e91c0` D:L49095-49107, the node constructor's
 *   `FUN_00312360` refusing while +0xc is set).
 * - `OBJECT_ACTIVE_STATE` sets the node's +0x5c bit 0 (research 183 §19), the bit that shows and hides an entry's model.
 *
 * On the disc (`test/silencer.test.ts`): of the nine names the scripts switch that the MP dialog lacks, `silencer` alone
 * names a UI model's node, and only `sig_commandoUI` (entry 20, `Equipsig_commando`) holds one -- the 552SD's
 * `UIsig_commandoSD` names its own `SigSilencer`. The kind of the other eight refs (research 182 §2.3: six kind 4,
 * which never search the world) is not modelled: none of them names a part, so the rule finds nothing for them either.
 * `UI.ZED`'s own world holds no node of the name.
 */
export const ARMORY_MODEL_PART_REF = "the first MODELS entry (the layout's order) whose model has a node of exactly that name" as const;

/**
 * The parts the scripts have switched off, by entry name (`ARMORY_MODEL_PART_REF`): each script-made node -- one the
 * layout lacks (`armoryNodes`) -- that is hidden, resolved to the first entry whose model's parts (`partsOf`, null for
 * a model not held) name it exactly. A node no part names changes nothing.
 */
export function modelPartStates(layout: UiLayout, nodes: Iterable<UiNode>, partsOf: (model: string) => readonly string[] | null): Map<string, Set<string>> {
  const own = new Set(armoryNodes(layout).map((n) => n.name.toLowerCase()));
  const out = new Map<string, Set<string>>();
  for (const n of nodes) {
    if (n.visible || own.has(n.name.toLowerCase())) continue;
    const entry = layout.models.find((e) => partsOf(e.model)?.includes(n.name) ?? false);
    if (!entry) continue;
    let set = out.get(entry.name);
    if (!set) out.set(entry.name, set = new Set());
    set.add(n.name);
  }
  return out;
}

/**
 * The preview models the scripts show (`ACTIVE <entry> = 1`, `TurnOffWeaponModels` hiding them all; research 95 §3.7):
 * each visible entry, in the layout's order, with its node's rotation (the spin, §3.8) and the parts `hidden` names for
 * it (`modelPartStates`).
 */
export function armoryModels(layout: UiLayout, node: (name: string) => UiNode | undefined, hidden: ReadonlyMap<string, ReadonlySet<string>> = new Map()): ShownModel[] {
  const out: ShownModel[] = [];
  for (const entry of layout.models) {
    const n = node(entry.name);
    if (n && n.visible) out.push({ entry, rotation: [...n.rotation] as Quat4, hidden: [...(hidden.get(entry.name) ?? [])] });
  }
  return out;
}
