import type { DialogBinding, DialogWidget, ListboxColumn } from '../dialog';
import { BINDING_DEFAULT_CODE, DIALOG_EVENTS } from '../dialog';
import type { UiClip, UiDrawItem } from '../compositor/drawList';
import { drawnAlpha, UI_FRAME } from '../compositor/frame';
import { newSprite, stepImagePulse, type UiSprite } from '../compositor/scene';
import { captionBytes, captionCodes } from '../text/captions';
import type { TextFace } from '../text/face';
import { f32, fadd, fmul, fsub, toInt } from '../text/f32';
import { measureText } from '../text/layout';
import { placeWrapped, wrapLines, type WrappedLine } from '../text/wrapped';
import { listboxRowLook, noGlow, PRESSED_HOLD, stepGlow, type TextGlow } from '../text/states';
import type { UiVariable, UiVarValue } from '../uiVars';
import { VALVE_TYPE } from '../valves';
import type { ZAnimUiCommand } from '../zanimRuntime';
import { glyphsAt, pushIf, spriteAt } from './draw';
import { nodeOp, printUiVar, uiVarValueOfSpec, type Widget, type WidgetCommandAnswer, type WidgetContext, type WidgetHost } from './host';
import { PAD, STICK, padByte, type WidgetPad } from './pad';

/**
 * LISTBOX -- `CUIListBox` (run-time vtable 0x407670; web research 117 §6): an image (its background, `FILENAME` over
 * `XSIZE` x `YSIZE`) with the focus highlight (+0x1a0), `ACTIVE_BACKGROUND` (+0x240), the up arrow (+0x2e0) and the down
 * arrow (+0x380); the items (+0xc0 count, +0xc8 the list); up to 30 bindings (+0x420, +0x600 the count); the focus
 * +0x194, the top row +0xb8, the focus's pixel offset in the window +0xb0, the drawn scroll +0xb4, `SPACING` +0xac,
 * `SPEED` +0x184, the item alpha +0xe0. Made by `FUN_0037e8b0` (D:L275799-275865), set up by `FUN_00375e20`
 * (D:L271051-271262), which ends in set normal (vtable +0x54, D:L271242).
 */

type ListSpec = Extract<DialogWidget, { type: 'LISTBOX' }>;

/** The binding list's cap (+0x420 .. +0x600, 16 bytes each): `FUN_00375e20` D:L271190-271197 copies them all. */
export const LISTBOX_BINDINGS_MAX = 30;
/** The hold clock's threshold (`+0x180 <= 0.4` refuses, D:L270417 and D:L270422). */
export const LISTBOX_HOLD_REPEAT = 0.4;
/** The item alpha off the focus row, and on it while normal (`FUN_00376420` D:L271290, `FUN_0037ab90` D:L273867). */
export const LISTBOX_ITEM_ALPHA = 80;
/** The item alpha while active or pressed (`FUN_00374cb0` D:L270546, `FUN_00374a50` D:L270468). */
export const LISTBOX_ITEM_ALPHA_ACTIVE = 100;
/** The scissor's top: `DAT_003e0378` (-3, an int, read in the ELF) + the first row's y less a row (D:L270012). */
export const LISTBOX_CLIP_DROP = -3;

/**
 * LISTBOX_ROW_ALPHA_START_READING: a row's text alpha before its first draw -- what the arrows read off the focus row
 * (its text's vtable +0x18, D:L270026) on the list's first draw, before the row's own draw sets it. The text's
 * constructor sets 128 (`FUN_00363e70` D:L261476); whether the item's builder (`FUN_0037b2f0`) changes it was not
 * read. [reading]
 */
export const LISTBOX_ROW_ALPHA_START_READING = 128;

/**
 * A `WRAPPED_TEXT` column's cell (NU-13; web research 274 §9): the original's CListItemWrappedTextTypeImpl (vtable
 * 0x407140), made by `FUN_0037ae10` through `FUN_0036b210` (D:L265449-265468) -- a CWrappedText (`FUN_0027f250`, vtable
 * 0x4079e0) at the content's +0xd0, its HEIGHT -1 (D:L126950: no scissor of its own, no scroll), not shown on one line
 * (+0x240 = 0) -- handed the list's font and SCALE, the list's SPACING (the item's +0x10 -> the content's +0x48, 0x37be50:
 * the text's +0xbc) and the column's MAXWIDTH (+0x14 -> +0x4c, 0x37be70: the text's +0xc0), then its text, which the
 * wrapping setter `FUN_00379f70` (D:L273409-273555; through the text's +0x78, `FUN_00363830` D:L261172-261246) splits
 * into lines (`wrapLines`) in the colour the text holds then (`LISTBOX_WRAPPED_TEXT_COLOR`). `rows` is the text's +0x44:
 * -1 after the set (D:L273549), then the lines its last draw counted (D:L273162).
 */
export interface ListboxWrappedCell { lines: WrappedLine[]; rows: number }

/**
 * The colour a wrapped cell's lines are made in: the CWrappedText's +0x48 / +0x4c / +0x50 at the set, 255 each from its
 * constructor (`FUN_0037a770` D:L273681-273683), which the setter copies into each line (D:L273459-273461,
 * D:L273496-273498). The row's colour, which the row's look writes into the text after (`FUN_0037ab90` D:L273836-273845;
 * the +0xc8 test, the write into the text's +0x48..+0x50 and its +0xa0 call, D:L273850-273857), never reaches the lines:
 * the class's +0xa0 that should carry it is 0x37a630, `jr ra` (read in the ELF).
 */
export const LISTBOX_WRAPPED_TEXT_COLOR: readonly [number, number, number] = [255, 255, 255];

/** A text node's alpha as made (`FUN_00363e70` D:L261476), which the font's set rewrites to the face's opacity x 128 (`FUN_00362b20` D:L260718-260721). */
const TEXT_ALPHA_MADE = 128;
/** The CWrappedText's HEIGHT in a cell (`FUN_0027f250` D:L126950): -1, so `FUN_003794b0` sets no scissor and does not scroll. */
const WRAPPED_CELL_HEIGHT = -1;
/** The scissor `FUN_003794b0` leaves after its lines (D:L273163): the whole frame. */
const FRAME_SCISSOR: UiClip = { x0: 0, y0: 0, x1: UI_FRAME.width, y1: UI_FRAME.height };

/**
 * The rows an item takes: its record's +0x2c vtable +0xc (`FUN_0036ba30` D:L265771-265784: 1 with no content) -> its
 * content's +0x44. A column item the largest of its cells' and at least 1 (`FUN_0037cdc0` D:L274866-274885); a wrapped
 * cell max(1, its text's +0x44) (0x37be30), so the count of its last draw; a text or image cell 1 (0x36ba60) -- read in
 * the ELF (NU-13, web research 274 §9; research 185 had read it so). Was `LISTBOX_ITEM_ROWS_READING`, 1 for every item.
 */
export function listboxItemRows(it: ListboxItem): number {
  let rows = 1;
  for (const w of it.wrapped) if (w !== null && w.rows > rows) rows = w.rows;
  return rows;
}

/** Where one cell of a drawn row stood (the place `FUN_0037ab90` gives it, D:L273841), and a wrapped cell's lines' pens. */
export interface ListboxPlacedCell { item: number; column: number; kind: 'text' | 'image' | 'wrapped'; x: number; y: number; lines: { x: number; y: number }[] }
/** What the last draw placed: the highlight's rectangle (none with no items) and each drawn row's cells. Read by the tests; nothing reads it back. */
export interface ListboxPlaced { highlight: { x: number; y: number; w: number; h: number } | null; cells: ListboxPlacedCell[] }

/**
 * A cell's node scale at its draw (CLAN-DOT, web research 272 §12; `LISTBOX_CELL_SCALE_READING` retired, research 117):
 * the list's `SCALE` (+0xa0, handed to the item's builder, D:L271171-271172) -- unless its column's own `SCALE` (+0x18) is
 * not 0. The row's draw `FUN_0037ab90`, after placing the cell (D:L273841), casts the cell's content to the text content's
 * type (`FUN_001821d0(.., 0x3f8f40, ..)`, D:L273846), tests the column's +0x18 (D:L273892) and calls the content's vtable
 * +0x28 (D:L273893) with that value in `$f12` (`lwc1 $f12, 0x18` at ELF 0x37ad88). Every text column's content takes the
 * cast and holds 0x37adf0 there -- `lw v1, 4(a0); jr ra; swc1 $f12, 0x40(v1)`, its node's SCALE (+0x40), written at every
 * draw (research 185 had read it so): the TEXT content's vtable 0x407b40 (`FUN_0036b4b0`, +0x28 at ELF 0x407b68), the
 * TIMED_TEXT's 0x4070a0 (`FUN_0036b450`, ELF 0x4070c8; the same text node at +8) and the WRAPPED_TEXT's 0x407140
 * (`FUN_0036b210`, ELF 0x407168; the CWrappedText at +0xd0), both types listing 0x3f8f40 as a base (the type records at
 * 0x3f94d0 and 0x3f9530) and their destructors falling back to 0x407b40 (`FUN_0037bba0` D:L274406-274408, `FUN_0037bda0`
 * D:L274449 on) -- the review's read, 2026-10-16. A TEXT or TIMED_TEXT cell draws at that scale; a WRAPPED_TEXT cell's
 * lines do not (`LISTBOX_WRAPPED_LINE_SCALE_READING`). An IMAGE column carries no `SCALE` here (`loadDialog` reads it for a
 * text column only). On the disc every column with a `SCALE` is a TEXT column (the clan rosters, the friend and ignore
 * lists, SOCOM II ONLINE's three panels, the invited list's off-page key).
 */
export function listboxCellScale(listScale: number, col: ListboxColumn | undefined): number {
  return col !== undefined && col.kind !== 0 && col.scale !== 0 ? col.scale : listScale;
}

/**
 * LISTBOX_WRAPPED_LINE_SCALE_READING (CLAN-DOT, web research 272 §12): a WRAPPED_TEXT cell's lines keep the list's `SCALE`
 * though the column's `SCALE` is written into its CWrappedText's +0x40 at every draw (`listboxCellScale`). The lines take
 * their scale from that +0x40 only when the text is set and split (`FUN_00379f70`: each line's +0x40 made from the wrapper's,
 * D:L273490), which the item's build does before any draw (`FUN_0037ae10` D:L274041 / D:L274059), and the
 * draw `FUN_003794b0` (D:L273084-273195) reads no +0x40: so the column's `SCALE` would reach the lines only at a later set
 * of the same cell's text, which the page never makes (a var rebuild builds new items). Not followed into a set after a
 * draw; no WRAPPED_TEXT column on the disc carries a `SCALE`. [reading]
 */
export const LISTBOX_WRAPPED_LINE_SCALE_READING = 'the wrapped lines at the list\'s SCALE: the column\'s reaches them only at a later set (D:L273490)' as const;

/**
 * LISTBOX_ROW_FLAG_READING: `FUN_0037ab90` lets the focus row glow only when its item's vtable +0x3c answers true
 * (D:L273848); that entry was not read. Taken true, so the glow follows +0x17c alone -- the active glow's `TIME`, set
 * by set active and cleared by set normal -- as research 111's `listboxRowLook` reads it ("while the list holds the
 * focus"). [reading]
 */
export const LISTBOX_ROW_FLAG_READING = true;

/**
 * LISTBOX_ADDED_ITEM_READING: an item `AddItem` appends (op 8, D:L269545-269574) is built by `FUN_0036bbc0`
 * (D:L265829-265908), the var rebuild's own builder (`itemOf`): a string element a text item (then its text set again by
 * `FUN_0036b4b0`, D:L269563-269568), an array element a column item, an element past the end an item with no cell.
 * Research 185 (C6) read it so; re-read at the source by ONL-14, web research 164 §3 (it was "`FUN_0036bdd0`'s item, the
 * element's string its cell" until 2026-10-05). [reading]
 */
export const LISTBOX_ADDED_ITEM_READING = 'FUN_0036bbc0\'s item, as the var rebuild builds one' as const;

/**
 * LISTBOX_REBUILD_CONTENT_PASS_READING: after an array var rebuilds the items, `FUN_003754d0` (D:L270794-270805) walks
 * them and calls each item's content (+0x28) through its vtable +0x30 with a running value that starts at the list's
 * +0x160 and the list's +0x164, and keeps the last answer nowhere. What the content does with it (a measure, a place)
 * was not followed; the page lays the rows out at the draw from `SPACING`, so nothing of it is carried. [reading]
 */
export const LISTBOX_REBUILD_CONTENT_PASS_READING = 'each content\'s +0x30 from +0x160 with +0x164, the answer dropped' as const;

/**
 * LISTBOX_GET_CONTENTS_READING: `GetContents` (op 10, D:L269629-269643) opens a list, has each item serialise itself
 * into it (the item's vtable 0x407240 +8, 0x36b1d0 in the ELF: a tail call to its content's +0x40), closes it and sets
 * it into the named var (`FUN_00386460`). A column item's content (vtable 0x407b90, +0x40 = 0x37cd30) opens a sub-list
 * and serialises each cell; a text content (vtable 0x407b40, +0x40 = 0x37bf40) appends its text as an int when
 * `strtol` takes it whole, else a real when `strtod` does, else the string. Research 185 (C6) read it so; re-read at the
 * source by ONL-14 (web research 164 §3). An IMAGE cell's content (vtable 0x407050) was not followed: it appends
 * nothing here, and an item with no text cell at all (an image alone, an `AddItem` past the var's end) appends no
 * element (the close review's pass 4: it had appended a `none`). It was `LISTBOX_GET_CONTENTS_PLACEHOLDER` ("the var left as it was") until 2026-10-05. [reading]
 */
export const LISTBOX_GET_CONTENTS_READING = 'each item serialised: a column item a sub-list, a text cell an int, a real or its string; an image cell nothing' as const;

const ON_ACTIVATE = DIALOG_EVENTS.ONACTIVATE!;
const ON_SCROLL = DIALOG_EVENTS.ONSCROLL!;
const ON_SCROLL_END = DIALOG_EVENTS.ONSCROLL_END!;
const ON_FOCUS = DIALOG_EVENTS.ONFOCUS!;
/** `'.'` (0x2e) at the binding's code byte +0x42d: ON_UPDATE_UIVAR, the list's event after its var rebuilt the items. */
const ON_UPDATE_UIVAR = DIALOG_EVENTS.ON_UPDATE_UIVAR!;

/**
 * LISTBOX_ARRAY_CELL_KEYS_READING: a cell whose element is itself an array is read by key in `FUN_0037ae10`
 * (D:L274032-274056): `VALUE` (0x3f9410) its text, `COLOR` (0x3f9188) its colour, `DISABLED` (0x3f9418) the item not
 * selectable. `COLOR`'s three numbers (`FUN_0032de80`, as ints) go to the text content's +0x2c -- 0x37bd60 in the ELF,
 * which the decompilation folds away: `sb 1, 0xc8(a0)` and r, g, b into the text's +0x48 / +0x4c / +0x50 -- and the
 * row's draw writes the row's colour only into a content whose +0xc8 is 0 (`FUN_0037ab90` D:L273836-273845), so the
 * cell keeps its own colour; `DISABLED`, whatever its value, clears the item's +0x24 (not selectable, D:L274051-274054).
 * Both applied since ONL-14 (web research 164 §3; research 185 had read them; until 2026-10-05 neither was applied).
 * The page looks for each key at the even indices; narrower than the lookup read later: the page
 * looks for the key at the even indices and takes a string value only, where `FUN_0032f0e0` (D:L230255 on) matches
 * the key string at any index, answers the element after it and recurses into nested arrays, and `FUN_0032ee10`
 * (D:L230100 on) takes an array-typed value's first string (the UNIVERSE-MERGE review, 2026-10-03). [reading]
 */
export const LISTBOX_ARRAY_CELL_KEYS_READING = 'VALUE as the text; COLOR the cell\'s own colour; DISABLED the item not selectable' as const;

/** A cell of an IMAGE column (`FUN_0037ae10` D:L273987-274022): the column's `TEXTURES[value % count]` at its `SIZE`, 128 grey. */
export interface ListboxImageCell { texture: string; sprite: UiSprite }

/** The cell buffer `FUN_0037ae10` prints a non-array element into (`auStack_330`, 800 bytes). */
const CELL_PRINT_BYTES = 800;

/** An item (the 0x30-byte record, `FUN_0036bdd0`): its binding (+0), focus animation (+0x10), `USERDATA` (+0x20), selectable (+0x24), cells (+0x28). */
export interface ListboxItem {
  captions: string[];
  codes: number[][];
  /** Per cell: an IMAGE column's cell, or null for a text cell (whose text is `captions` / `codes` at that index). */
  images: (ListboxImageCell | null)[];
  /** Per cell: a keyed cell's `COLOR` (LISTBOX_ARRAY_CELL_KEYS_READING), drawn over the row's colour; null for none. */
  colors: ([number, number, number] | null)[];
  /** Per cell: a `WRAPPED_TEXT` column's cell (`ListboxWrappedCell`), drawn from its lines; null for any other cell. */
  wrapped: (ListboxWrappedCell | null)[];
  binding: DialogBinding;
  focus: DialogBinding;
  userData: string | null;
  selectable: boolean;
  /** A column item (`FUN_0037ae10`'s, from an array element) -- serialised as a sub-list -- not a text item. */
  column: boolean;
  /** The row text's glow and alpha (one text per item, ticked through the item's content, D:L270732-270737). */
  glow: TextGlow;
  alpha: number;
}

export type ListboxState = 'normal' | 'active' | 'pressed';

/** A text content's +0x40 (0x37bf40): its text an int when `strtol` (base 10) takes it whole, else a real when `strtod` does, else the string. */
export function serialisedText(text: string): UiVarValue {
  if (/^\s*[+-]?\d+$/.test(text)) return { type: 'int', value: parseInt(text, 10) };
  if (/^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text)) return { type: 'real', value: parseFloat(text) };
  return { type: 'string', value: text };
}

/** An item's serialised form (0x36b1d0, its content's +0x40): a column item a sub-list of its text cells (0x37cd30), a text item its text, an item with no cell nothing. */
function serialisedItem(it: ListboxItem): UiVarValue[] {
  const cells = it.captions.flatMap((c, i) => (it.images[i] ? [] : [serialisedText(c)]));
  return it.column ? [{ type: 'array', value: cells }] : cells.slice(0, 1);   // no cell: nothing appended (the close review's pass 4)
}

const idleBinding = (): DialogBinding => ({ kind: 'button', name: null, code: BINDING_DEFAULT_CODE, state: 1, animation: null, argument: null });

export class ListboxWidget implements Widget {
  readonly type = 'LISTBOX';
  items: ListboxItem[];
  focus = 0;
  top = 0;
  focusOffset = 0;
  scroll = 0;
  state: ListboxState = 'normal';
  /**
   * The element's enabled bit (+0x14 bit 7): the LISTBOX's vtable 0x407670 +0x48 / +0x4c are the base element's reader
   * 0x1fe270 and writer 0x1fde10 (read in the ELF), so `DisableButton(COMBOLIST)` takes it off the focus ring and
   * `EnableButton` puts it back (ONL-01, research 144 §3: LOGIN's walk never lands on its lists). Built set: the list's
   * create writes 1 after its plain-bitmap base cleared it (`FUN_0037e8b0` D:L275854; research 116 §17), so a list no
   * script disables takes the build's focus -- SELECT UNIVERSE's SERVERLIST.
   */
  enabled = true;
  currentColor: [number, number, number];
  itemAlpha = LISTBOX_ITEM_ALPHA;
  /** +0xf8: the highlight's texture now. */
  highlight: string | null = null;
  noSelect: boolean;
  hold = 0;
  pressClock = 0;
  /** +0x174 .. +0x17c: the focus row's glow while active (`RANGE` and `TIME` of `ACTIVE_COLOR`), zero while normal. */
  private glow: { range: [number, number]; time: number } | null = null;
  /** The list's own quad, the highlight, `ACTIVE_BACKGROUND` (+ shown), the arrows. */
  readonly image: UiSprite;
  readonly highlightQuad: UiSprite;
  readonly activeBackground: UiSprite;
  activeBackgroundShown = true;
  readonly upArrow: UiSprite | null;
  readonly downArrow: UiSprite | null;
  readonly bindings: readonly DialogBinding[];
  readonly face: TextFace | null;
  /** What the last draw placed (`ListboxPlaced`). */
  placed: ListboxPlaced = { highlight: null, cells: [] };
  private texVar: string | null = null;

  constructor(readonly name: string, readonly spec: ListSpec, private readonly ctx: WidgetContext) {
    const tex = (n: string | null): string | null => (n !== null && ctx.hasTexture(n) ? n : null);
    this.image = newSprite(tex(spec.image.filename), spec.image.size[0], spec.image.size[1]);
    if (spec.image.pulse !== null) this.image.pulse = { period: spec.image.pulse, phase: 0 };
    this.highlightQuad = newSprite(null, 10, 10);
    this.activeBackground = newSprite(tex(spec.activeBackground?.image ?? null), spec.activeBackground?.size[0] ?? 0, spec.activeBackground?.size[1] ?? 0);
    const arrow = (a: ListSpec['upArrow']): UiSprite | null => (a && a.texture !== null ? newSprite(tex(a.texture), a.size[0], a.size[1]) : null);
    this.upArrow = arrow(spec.upArrow);
    this.downArrow = arrow(spec.downArrow);
    this.noSelect = spec.noSelect;
    this.bindings = spec.bindings.slice(0, LISTBOX_BINDINGS_MAX);
    this.currentColor = [...spec.normalColor];
    const fontName = spec.font ?? ctx.font;
    this.face = fontName === null ? null : ctx.face(fontName);
    this.items = spec.options.map((o) => this.item(o.captions, o.binding, o.focus, o.userData));
    this.attachUiVar();
    this.setNormal();                                                // D:L271241
  }

  private item(captions: string[], binding: DialogBinding, focus: DialogBinding, userData: string | null, images: (ListboxImageCell | null)[] = []): ListboxItem {
    return {
      captions, codes: captions.map((c) => captionCodes(c, this.ctx.captions).codes), images: captions.map((_, i) => images[i] ?? null),
      colors: captions.map(() => null), wrapped: captions.map(() => null), binding, focus, userData, selectable: true, column: false, glow: noGlow(),
      alpha: LISTBOX_ROW_ALPHA_START_READING,
    };
  }

  /**
   * The list's `UIVAR` (`FUN_00375e20` D:L271177-271187): the var added (`FUN_003857c0`), attached to the list's second
   * base at +0x80 (`FUN_00385df0`; its vtable 0x4076e0, stored by the constructor `FUN_0037e8b0` D:L275813) and that
   * base's +0xc run at once -- the thunk 0x37d060 (`j 0x3754d0`, a0 -= 0x80; the words 0x080dd534, 0x2484ff80 in the
   * ELF) into `FUN_003754d0`: an array var is the items (`itemsFromUiVar`). A string var names the list's own image's
   * texture at the draw, as an IMAGE's does (+0x80 / +0x84; `FUN_00373850` D:L269994-270009). Read twice independently
   * (ONL-01, research 144 §3; ONL-04, research 147 §2) and merged 2026-10-03.
   */
  private attachUiVar(): void {
    const vars = this.ctx.uiVars, u = this.spec.uivar;
    if (!vars || !u || u.name === null) return;
    const v = vars.add(u.name, uiVarValueOfSpec(u.value), u.longevity);
    this.texVar = v.name;
    vars.attach(v, (x) => this.itemsFromUiVar(x.value));
    this.itemsFromUiVar(v.value);
  }

  /**
   * `FUN_003754d0` (D:L270744-270828; ONL-01 research 144 §3, ONL-04 research 147 §2): for an **array** var, every item
   * removed (`FUN_00375c70`), then one item an element (`itemOf`), appended (`FUN_00373f20(.., -1)`); with `AUTOSCROLL`
   * (+0xe9) the focus to the last item, the top row 0 and the focus offset recomputed, with no test of the count
   * (D:L270789-270793: an empty array leaves the focus at -1 until the next rebuild or input, as the original does);
   * then the pass over the contents (`LISTBOX_REBUILD_CONTENT_PASS_READING`, D:L270794-270805, nothing carried) and the
   * list's `EVENT ON_UPDATE_UIVAR` bindings run (D:L270808-270822: kind 1 at +0x420, `'.'` at +0x42d, the name found in
   * the script library 0x414bb0 -- `FUN_0026a250(0x414bb0, name, 0)`, then `FUN_00272bb0(anim, 1, 8, argument, 0)` with
   * an `ARGUMENT`, `FUN_002734b0(anim, 0)` without: the binding's own argument, never the item's, so not `startByRule`)
   * through `WidgetContext.animation`, the one function that lookup-and-start is (a name not found starts nothing).
   * Any other type leaves the items (the string case is the draw's texture).
   */
  private itemsFromUiVar(value: UiVarValue): void {
    if (value.type !== 'array') return;
    this.items = value.value.map((el) => this.itemOf(el));
    if (this.spec.autoScroll) { this.focus = this.count - 1; this.top = 0; this.focusOffset = this.focus * this.spec.spacing; }
    for (const b of this.eventBindings(ON_UPDATE_UIVAR)) if (b.animation !== null) this.ctx.animation?.(b.animation, b.argument);
  }

  /**
   * One element's item (`FUN_0036bbc0` D:L265829-265908): the 0x30-byte record with no binding and no focus animation
   * (`LISTBOX_ADDED_ITEM_READING`'s shape), selectable. A string element (type 3, D:L265856) a text content, set to the
   * string by the caller (`FUN_0036b4b0`); an array element (type 4) with a count (D:L265888-265893) a column item
   * (`FUN_0037ae10` D:L273903-274064: one cell per column, up to the element's count), selectable as its +0x3c answers
   * (not followed, taken true); any other element -- an int, a real, an empty array -- leaves the content null
   * (+0x28, D:L265854): an item with no cell.
   */
  private itemOf(el: UiVarValue): ListboxItem {
    if (el.type === 'string') return this.item([el.value], idleBinding(), idleBinding(), null);
    if (el.type !== 'array' || el.value.length === 0) return this.item([], idleBinding(), idleBinding(), null);
    const n = Math.min(el.value.length, this.spec.columns.length);
    const captions: string[] = [], images: (ListboxImageCell | null)[] = [];
    const colors: ([number, number, number] | null)[] = [];
    const wrapped: (ListboxWrappedCell | null)[] = [];
    let selectable = true;
    for (let c = 0; c < n; c++) {
      const cell = el.value[c]!, col = this.spec.columns[c]!;
      if (col.kind === 0) {
        // An IMAGE column (D:L273987-274022): the element as an integer (a real truncated, else 0), `TEXTURES[i % count]`.
        const i = cell.type === 'int' ? cell.value : cell.type === 'real' ? Math.trunc(cell.value) : 0;
        const textures = Array.isArray(col.textures) ? col.textures.filter((t): t is string => typeof t === 'string') : [];
        const name = textures.length ? textures[((i % textures.length) + textures.length) % textures.length]! : null;
        const sprite = newSprite(name !== null && this.ctx.hasTexture(name) ? name : null, col.size[0], col.size[1]);
        captions.push('');
        images.push(name === null ? null : { texture: name, sprite });
        colors.push(null);
        wrapped.push(null);
      } else {
        // A text column: an array cell by its VALUE (LISTBOX_ARRAY_CELL_KEYS_READING), anything else printed (`FUN_003860f0`, 800 bytes).
        let text: string | null;
        let color: [number, number, number] | null = null;
        if (cell.type === 'array') {
          const key = (name: string): UiVarValue | undefined => {
            const at = cell.value.findIndex((x, k) => k % 2 === 0 && x.type === 'string' && x.value.toUpperCase() === name);
            return at >= 0 ? (cell.value[at + 1] ?? { type: 'none' }) : undefined;
          };
          const v = key('VALUE');
          text = v && v.type === 'string' ? v.value : null;
          const c = key('COLOR');                                    // FUN_0032de80: three numbers, as ints, to 0x37bd60
          if (c && c.type === 'array') {
            const n3 = c.value.slice(0, 3).map((x) => (x.type === 'int' ? x.value : x.type === 'real' ? Math.trunc(x.value) : 0));
            color = [n3[0] ?? 0, n3[1] ?? 0, n3[2] ?? 0];
          }
          if (key('DISABLED') !== undefined) selectable = false;     // the item's +0x24 cleared (D:L274051-274054)
        } else text = printUiVar(cell, CELL_PRINT_BYTES);
        captions.push(text ?? '');
        images.push(null);
        colors.push(color);
        wrapped.push(col.kind === 3 ? this.wrappedCell(text ?? '', col) : null);
      }
    }
    const it = this.item(captions, idleBinding(), idleBinding(), null, images);
    it.colors = colors;
    it.wrapped = wrapped;
    it.selectable = selectable;
    it.column = true;
    return it;
  }

  /**
   * A `WRAPPED_TEXT` column's cell (`FUN_0037ae10` D:L274029-274037 with `FUN_0036b210`, its text set at D:L274041 or
   * D:L274059): the text, through the captions as the setter's lookup takes it (`FUN_00379f70` D:L273440-273441),
   * wrapped at the column's MAXWIDTH with the list's SCALE (`wrapLines`), the lines white
   * (`LISTBOX_WRAPPED_TEXT_COLOR`); no draw yet (+0x44 = -1).
   */
  private wrappedCell(text: string, col: ListboxColumn): ListboxWrappedCell {
    const face = this.face;
    const lines = face === null ? [] : wrapLines(face, captionBytes(text, this.ctx.captions), { width: col.maxWidth, scale: this.spec.scale, color: LISTBOX_WRAPPED_TEXT_COLOR });
    return { lines, rows: -1 };
  }

  get count(): number { return this.items.length; }

  /** The argument rule (research 117 §6.1): `ARGUMENT`; else, a selectable item's `USERDATA`, else its caption (`""` with none); else nothing. */
  private startByRule(host: WidgetHost, b: DialogBinding, it: ListboxItem | undefined): void {
    if (b.argument !== null) { host.animation(b.animation, b.argument); return; }
    if (!it || !it.selectable) return;
    host.animation(b.animation, it.userData ?? it.captions[0] ?? '');
  }

  /** The list's `EVENT` bindings of `code` (kind byte +0x420 = 1, code +0x42d). */
  private eventBindings(code: number): DialogBinding[] {
    return this.bindings.filter((b) => b.kind === 'event' && b.code === code);
  }

  private resetHighlight(tex: string | null): void {
    this.highlight = tex !== null && this.ctx.hasTexture(tex) ? tex : null;
    Object.assign(this.highlightQuad, { x: 0, y: 0, w: 10, h: 10, texture: this.highlight, color: [255, 255, 255], alpha: 100 });
  }

  /** +0x4c: the enabled bit written (`DialogParts.setEnabled`, the queue's records 7 and 8). */
  setEnabled(on: boolean): void { this.enabled = on; }

  /** +0x54 `FUN_00376420` (D:L271267-271290). */
  setNormal(): void {
    this.state = 'normal';
    this.currentColor = [...this.spec.normalColor];
    this.activeBackgroundShown = false;
    this.resetHighlight(this.spec.normalImage);
    this.itemAlpha = LISTBOX_ITEM_ALPHA;
    this.glow = null;
  }

  /** +0x50 `FUN_00374cb0` (D:L270516-270606). */
  setActive(host: WidgetHost): void {
    this.state = 'active';
    this.currentColor = [...this.spec.activeColor];
    this.activeBackgroundShown = true;
    this.resetHighlight(this.spec.activeImage);
    this.itemAlpha = LISTBOX_ITEM_ALPHA_ACTIVE;
    this.glow = this.spec.activeGlow;
    if (this.count === 0) return;
    this.focus = Math.max(0, Math.min(this.focus, this.count - 1));
    if (this.focus < this.top) this.top = this.focus;
    this.focusOffset = (this.focus - this.top) * this.spec.spacing;
    this.scroll = -(this.top * this.spec.spacing);
    const it = this.items[this.focus]!;
    if (it.focus.animation !== null) host.animation(it.focus.animation, it.focus.argument);
    for (const b of this.eventBindings(ON_ACTIVATE)) this.startByRule(host, b, it);
  }

  /** +0x84 `FUN_00374a50` (D:L270448-270471): PRESSED_COLOR, the PRESSED highlight, 0.2 s. */
  press(): void {
    this.state = 'pressed';
    this.currentColor = [...this.spec.pressedColor];
    this.resetHighlight(this.spec.pressedImage);
    this.itemAlpha = LISTBOX_ITEM_ALPHA_ACTIVE;
    this.pressClock = PRESSED_HOLD;
  }

  /** `FUN_00374010` / `FUN_003742f0` (D:L270113-270306): one item up / down, or refused (the answer is `PADHOG`). */
  private move(dir: -1 | 1, host: WidgetHost): boolean {
    if (dir < 0 ? this.focus < 1 : this.focus >= this.count - 1) return this.spec.padHog;
    this.focus += dir;
    this.focusOffset += dir * this.spec.spacing;
    const it = this.items[this.focus]!;
    if (it.focus.animation !== null) host.animation(it.focus.animation, it.focus.argument);
    host.sound('SELECTION');
    for (const b of this.eventBindings(ON_FOCUS)) this.startByRule(host, b, it);
    return true;
  }

  /** +0x44 `FUN_003745e0` (D:L270311-270443). */
  input(pad: WidgetPad, host: WidgetHost): boolean {
    if (this.count === 0) return false;
    if (this.count <= this.focus) {
      this.focus = this.count - 1;
      if (this.focus < this.top) this.top = this.focus;
      this.focusOffset = (this.focus - this.top) * this.spec.spacing;
    }
    const it = this.items[this.focus]!;
    // 1. The focus item's own binding: its button's press edge, a selectable item (D:L270347-270369).
    if (it.binding.code < 0x10 && padByte(pad, it.binding.code) === PAD.FALLING && it.selectable) {
      this.hold = 0;
      if (!host.animation(it.binding.animation, it.binding.argument ?? it.userData)) return false;
      this.press();
      return true;
    }
    // 2. The list's bindings, by code and STATE whatever their kind (LISTBOX_EVENT_AS_BUTTON_READING; D:L270371-270412).
    for (const b of this.bindings) {
      if (b.code === 0 || b.state !== padByte(pad, b.code)) continue;
      this.hold = 0;
      if (!host.hasAnimation(b.animation)) return false;             // not found: the press passes (D:L270381-270383)
      this.startByRule(host, b, it);                                 // a non-selectable item, no ARGUMENT: nothing starts
      if (it.selectable) this.press();
      return true;
    }
    // 3-5. UP, DOWN (press edge, the stick's edge, or held past 0.4 s), then PADHOG's LEFT / RIGHT (D:L270413-270437).
    const up = padByte(pad, 4), down = padByte(pad, 5);
    if (up === PAD.FALLING || pad.stick === STICK.UP) { this.hold = 0; return this.move(-1, host); }
    if (up === PAD.DOWN && LISTBOX_HOLD_REPEAT < this.hold) return this.move(-1, host);
    if (down === PAD.FALLING || pad.stick === STICK.DOWN) { this.hold = 0; return this.move(1, host); }
    if (down === PAD.DOWN && LISTBOX_HOLD_REPEAT < this.hold) return this.move(1, host);
    return this.spec.padHog && (padByte(pad, 3) === PAD.FALLING || padByte(pad, 2) === PAD.FALLING);
  }

  /** +0x38 `FUN_00375040` (D:L270611-270739). */
  tick(dt: number, host: WidgetHost): void {
    if (this.image.pulse) stepImagePulse(this.image, dt);
    const sp = this.spec.spacing, ysize = this.image.h;
    const top0 = this.top;
    while (ysize - 2 * sp < this.focusOffset) { this.focusOffset -= sp; this.top += 1; }
    while (this.focusOffset < 0) { this.focusOffset += sp; this.top -= 1; }
    if (top0 !== this.top) for (const b of this.eventBindings(ON_SCROLL)) host.animation(b.animation, b.argument);
    const target = f32(-this.top * sp);
    const dist = fsub(target, this.scroll);
    let speed = this.spec.speed;
    if (speed <= fmul(Math.abs(dist), 2)) speed = fmul(Math.abs(dist), 2);
    speed = fmul(speed, dt);
    if (this.pressClock > 0) {
      if (dt < this.pressClock) this.pressClock = fsub(this.pressClock, dt);
      else {
        this.pressClock = 0;
        const p = this.spec.pressedColor, c = this.currentColor;
        if (c[0] === p[0] && c[1] === p[1] && c[2] === p[2]) this.setActive(host);
      }
    }
    if (speed <= Math.abs(dist)) this.scroll = fadd(this.scroll, dist < 0 ? -speed : speed);
    else this.scroll = target;
    if (dist !== 0 && this.scroll === target) for (const b of this.eventBindings(ON_SCROLL_END)) host.animation(b.animation, b.argument);
    this.hold = fadd(this.hold, dt);
    for (const it of this.items) { const a = stepGlow(it.glow, dt); if (a !== null) it.alpha = a; }
  }

  /** +0x64 `FUN_00372980` (D:L269435-269649), the ops of `FUN_00373640` (D:L269831-269925). */
  command(cmd: ZAnimUiCommand, _host: WidgetHost): WidgetCommandAnswer {
    const valves = this.ctx.valves;
    const setValve = (name: string, value: number): void => {
      if (!valves) return;
      valves.set(name, 0, VALVE_TYPE.TEMP);                          // FUN_003520d0(name, 0, 2)
      valves.set(name, value, VALVE_TYPE.TEMP);                      // the u16 written, the watchers told on a change
    };
    switch (nodeOp(cmd)) {
      case 1: return { answer: true };                               // Finish: each item's content finished (TIMED_TEXT)
      case 2: this.noSelect = false; return { answer: true };        // Highlight_on
      case 3: this.noSelect = true; return { answer: true };         // Highlight_off
      case 4: return { answer: this.count !== 0 };                   // Has_Items
      case 5: setValve(cmd.arg, this.count); return { answer: true };          // GetItemCount
      case 6: setValve(cmd.arg, this.focus); return { answer: true };          // GetFocusIndex
      case 7: {                                                      // SetFocusIndex: unclamped; the tick scrolls to it
        const v = valves?.find(cmd.arg);
        if (v) { this.focus = v.value; this.top = 0; this.focusOffset = this.focus * this.spec.spacing; }
        return { answer: true };
      }
      case 8: {                                                      // AddItem VALVE v UIVAR a (LISTBOX_ADDED_ITEM_READING)
        const v = valves?.find(cmd.arg);
        const varName = this.ctx.name(cmd, cmd.bytes[0x10] ?? 0);
        const arr = varName === null ? undefined : this.ctx.uiVars?.find(varName);
        if (v && arr) {
          const el = arr.value.type === 'array' ? arr.value.value[v.value] : undefined;
          this.items.push(el === undefined ? this.item([], idleBinding(), idleBinding(), null) : this.itemOf(el));
          if (this.spec.autoScroll) { this.focus = this.count - 1; this.top = 0; this.focusOffset = this.focus * this.spec.spacing; }
        }
        return { answer: true };
      }
      case 9: {                                                      // RemoveItem VALVE v
        const v = valves?.find(cmd.arg);
        if (v && v.value < this.count) this.items.splice(v.value, 1);
        return { answer: true };
      }
      case 10: {                                                     // GetContents: LISTBOX_GET_CONTENTS_READING
        const varName = this.ctx.name(cmd, cmd.bytes[0x10] ?? 0);
        const vars = this.ctx.uiVars;
        const v = varName === null ? undefined : vars?.find(varName);     // FUN_00385900: an existing var only
        if (vars && v) vars.set(v, { type: 'array', value: this.items.flatMap(serialisedItem) });
        return { answer: true };
      }
      case 11: this.items = []; return { answer: true };             // RemoveAllItems (FUN_00375c70)
      default: return null;
    }
  }

  /** A row's look this draw (`FUN_0037ab90` D:L273817-273900): its colour, its alpha unless the glow runs. */
  private rowLook(it: ListboxItem, i: number): [number, number, number] {
    const selected = i === this.focus;
    const look = listboxRowLook(
      { selected, focused: LISTBOX_ROW_FLAG_READING },
      { normalColor: this.spec.normalColor, currentColor: this.currentColor, activeGlow: this.glow },
      it.glow,
    );
    // The selected row's alpha is +0xe0: 100 while active or pressed, 80 while normal (research 111's
    // LISTBOX_SELECTED_ALPHA_READING, here traced: FUN_00374cb0 D:L270541, FUN_00374a50 D:L270469, FUN_00376420 D:L271288).
    if (look.alpha !== null) it.alpha = selected ? this.itemAlpha : LISTBOX_ITEM_ALPHA;
    return look.color;
  }

  /** +0x10 `FUN_00373850` (D:L269930-270073). */
  draw(x: number, y: number, opacity: number): UiDrawItem[] {
    const out: UiDrawItem[] = [];
    const sp = this.spec.spacing, s = this.spec;
    drawnAlpha(opacity, this.image);                                  // the walk's fade: an image's +0x34 (0x364860)
    const left = fadd(x, s.leftMargin);
    const firstY = fadd(y, s.topMargin);
    const rowTop = toInt(firstY);
    const placed: ListboxPlaced = { highlight: null, cells: [] };
    if (this.count !== 0) {
      // The highlight (D:L269968-269991): (int)(offset + HIGHLIGHT_OFFSET + y + TOP_MARGIN - 0.75 SPACING), each item
      // before the focus adding its rows past the first, as tall as the focus item's rows (`listboxItemRows`); across the
      // list's width.
      let hy = toInt(fsub(fadd(fadd(this.focusOffset, s.highlightOffset), firstY), fmul(sp, 0.75)));
      let hh = 0;
      for (let i = 0; i < this.count; i++) {
        const n = listboxItemRows(this.items[i]!);
        if (i === this.focus) { hh = sp * n; break; }
        hy += sp * (n - 1);
      }
      Object.assign(this.highlightQuad, { x: toInt(x), y: hy, w: this.image.w, h: hh });
      placed.highlight = { x: toInt(x), y: hy, w: this.image.w, h: hh };
      const bg = s.activeBackground;
      if (bg) {
        this.activeBackground.x = 0; this.activeBackground.y = 0;
        if (this.activeBackgroundShown) pushIf(out, spriteAt(this.name, this.activeBackground, toInt(x + bg.offset[0]), toInt(y + bg.offset[1])));
      }
    }
    // The list's own image; a string UIVAR names its texture when that bitmap is found (D:L269994-270009).
    const v = this.texVar !== null ? this.ctx.uiVars?.find(this.texVar) : undefined;
    if (v && v.value.type === 'string' && v.value.value !== this.image.texture && this.ctx.hasTexture(v.value.value)) this.image.texture = v.value.value;
    pushIf(out, spriteAt(this.name, this.image, x, y));
    const clip: UiClip = { x0: 0, y0: LISTBOX_CLIP_DROP + (rowTop - sp), x1: UI_FRAME.width, y1: toInt(y + this.image.h) };
    if (!this.noSelect) pushIf(out, spriteAt(this.name, this.highlightQuad, 0, 0, clip));
    // The scissor the cells draw under: the list's (D:L270012), until a wrapped cell's draw leaves the whole frame (D:L273163).
    let scissor = clip;
    let rows = 0;
    let focusAlpha = 128;
    this.items.forEach((it, i) => {
      const ry = toInt(fadd(fadd(rows, rowTop), this.scroll));
      if (i === this.focus) focusAlpha = it.codes.length === 0 ? 128 : it.alpha;
      rows += sp * listboxItemRows(it);                                  // read before the item's draw (D:L270031-270032)
      if (rowTop - sp + 1 <= ry && ry <= toInt(sp + fadd(y, this.image.h) + 10)) {
        const color = this.rowLook(it, i);
        it.codes.forEach((codes, c) => {
          const col: ListboxColumn | undefined = s.columns[c];
          // The cell's place (`FUN_0037ab90` D:L273841: the column's +4 / +0x10 from the row's pen).
          const cx = toInt(left) + (col?.position ?? 0), cy = ry + (col?.topOffset ?? 0);
          const img = it.images[c];
          if (img) {
            // An IMAGE cell at the cell's place, not recoloured.
            placed.cells.push({ item: i, column: c, kind: 'image', x: cx, y: cy, lines: [] });
            pushIf(out, spriteAt(this.name, img.sprite, cx, cy, scissor));
            return;
          }
          const wrapped = it.wrapped[c];
          if (wrapped && col) {
            placed.cells.push({ item: i, column: c, kind: 'wrapped', x: cx, y: cy, lines: this.drawWrapped(out, wrapped, col, cx, cy, scissor) });
            scissor = FRAME_SCISSOR;
            return;
          }
          placed.cells.push({ item: i, column: c, kind: 'text', x: cx, y: cy, lines: [] });
          pushIf(out, glyphsAt(this.name, this.face, codes, cx, cy, {
            scale: listboxCellScale(s.scale, col), rightJustified: col?.rightJustified ?? false, color: it.colors[c] ?? color, alpha: it.alpha,
          }, scissor));
        });
      }
    });
    this.placed = placed;
    const arrowAt = (q: UiSprite | null, a: ListSpec['upArrow'], visible: boolean): void => {
      if (!q || !a) return;
      q.x = 0; q.y = 0;
      q.alpha = visible ? focusAlpha : 0;
      pushIf(out, spriteAt(this.name, q, toInt(fadd(x, a.offset[0])), toInt(fadd(y, a.offset[1]))));
    };
    arrowAt(this.upArrow, s.upArrow, !(0 <= this.scroll || this.count === 0));
    arrowAt(this.downArrow, s.downArrow, this.image.h - sp < toInt(fadd(this.scroll, sp * (this.count - 1))) && this.count !== 0);
    return out;
  }

  /**
   * A wrapped cell's draw (+0x38, `FUN_0037be90` D:L274473-274489): the CWrappedText's draw `FUN_003794b0`
   * (D:L273084-273195) at the cell's place (the text's pen, +0x24 -> `FUN_003631a0`, with its +0x7c / +0x80 offsets 0 from
   * the text's constructor, D:L261471-261472) -- with HEIGHT -1 no scissor and no scroll, line k's pen
   * (x, int(y + k x SPACING - 3)) (D:L273144, `placeWrapped`), a line drawn while its y is inside the frame (D:L273147),
   * the rows counted into +0x44 (D:L273162). Each line in the colour it was made in, at the face's scale times the list's
   * SCALE (D:L273487-273492; the column's own never reaches a line, `LISTBOX_WRAPPED_LINE_SCALE_READING`) and the face's opacity x 128 (`FUN_00362b20` D:L260718-260721, the line's font set at
   * D:L273492); under the scissor the list's draw holds. Answers the lines' pens.
   */
  private drawWrapped(out: UiDrawItem[], cell: ListboxWrappedCell, col: ListboxColumn, x: number, y: number, scissor: UiClip): { x: number; y: number }[] {
    const face = this.face;
    if (face === null) { cell.rows = 0; return []; }
    const scale = fmul(this.spec.scale, face.scale);
    const widths = cell.lines.map((l) => measureText(face, l.codes, scale).width);
    const place = placeWrapped({ width: col.maxWidth, spacing: this.spec.spacing, height: WRAPPED_CELL_HEIGHT, autoScroll: false, displayOneLine: false }, x, y, widths);
    cell.rows = place.rows;
    const alpha = fmul(face.opacity, TEXT_ALPHA_MADE);
    for (const l of place.lines) {
      if (!l.drawn) continue;
      const line = cell.lines[l.index]!;
      pushIf(out, glyphsAt(this.name, face, line.codes, l.x, l.y, { scale, color: line.color, alpha, bold: line.bold }, scissor));
    }
    return place.lines.map((l) => ({ x: l.x, y: l.y }));
  }
}
