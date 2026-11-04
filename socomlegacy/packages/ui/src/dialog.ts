import type { RdrNode } from '@s2u/archive';
import { RdrLookup, keysOf, type RdrKey } from './rdrLookup';
import { uiVarLongevityOf, type LiveLongevity } from './uiVars';

/**
 * The generic dialog (.rdr screen) loader (PLAT-05; web research 105). A dialog of `RUN/UI/READERC.ZAR` (or
 * `READERX.ZAR`), as `parseRdr` reads it, turned into the "design" the engine builds before it makes any node: the
 * screen's libraries, font, background, bindings, script sets and models, and every object and control with its
 * per-type fields (`D:L<line>` = a line of `socom2_game.elf.decomp.c`).
 *
 * How the engine loads a dialog (research 105 §2): `FUN_00367430` (D:L263181-263240) reads the file
 * (`FUN_0032f630`, "data/common/zrdr/dialog"), hands its root to the design reader `FUN_00381550`
 * (D:L277197-277422), frees the tree (`FUN_0032d6e0`) and builds the screen from the design (`CGameMenu_LoadFromDesign`
 * `FUN_00367950`, D:L263400). The design reader never looks up `SCREENS`: every screen key is a depth-first search of
 * the whole file (`RdrLookup`), so the loose `:end of file` tokens beside fourteen layouts' `SCREENS` record (research
 * 96 §2.3) change nothing. `CONTROLS` and `OBJECTS` go through `FUN_00383360` (D:L278260-278342) with the control
 * factory `FUN_00382890` (D:L277870-277985) and the object factory `FUN_00382070` (D:L277598-277788).
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

// ---------------------------------------------------------------------------------------------------------------------
// Tables.

/**
 * `ParseButtonAnim` `FUN_00365d50`'s `EVENT` names and their codes (D:L262483-262683, `strcmp` each in turn); an
 * unknown name is code 0, which is `ONSTART`'s (D:L262682). The order is the code's; the codes are not the table's
 * order (ON_STATE_POP is 0xd, after ON_SKB_CLOSE's 0x10 in the chain).
 */
export const DIALOG_EVENTS: Readonly<Record<string, number>> = {
  ONSTART: 0x00, ONEXIT: 0x01, ONACTIVATE: 0x02, ONMPEGEND: 0x03, MP_JOIN_ROOM: 0x04, MP_PLAYER_NOT_FOUND: 0x05,
  MP_SUCCESS: 0x06, MP_CREATE_CLAN_SUCCESS: 0x07, MP_CREATE_CLAN_FAILURE: 0x08, MP_DISBAND_CLAN_SUCCESS: 0x09,
  MP_DISBAND_CLAN_FAILURE: 0x0a, MP_MEDIUS_ERROR: 0x0b, MP_MEDIUS_HAS_INVITES: 0x0c, ON_STATE_POP: 0x0d,
  ON_SKB_APPLY: 0x0e, ON_SKB_APPLY2: 0x0f, ON_SKB_CLOSE: 0x10, ON_LOAD_COMPLETE: 0x11, ON_CLIENT_CONNECT: 0x12,
  ON_FORCE_NEW_DB: 0x13, ON_LADDER_REFRESH: 0x14, ON_TTY_DONE: 0x15, MP_MEDIUS_JOIN_GAME_FAILURE: 0x16,
  MP_MEDIUS_READY_TO_CONNECT: 0x17, MP_PLAYER_ALREADY_MEMBER: 0x18, MP_VERSION_NUMBER_ERROR: 0x19,
  MP_LEADERSHIP_TRANSFER_SUCCESS: 0x1a, MEMCARD_ERROR: 0x1b, MP_MEDIUS_BECAME_LEADER: 0x1c, ON_SKB_CANCEL: 0x1d,
  NETCNF_ERROR: 0x1e, MP_MEDIUS_JOIN_ROOM_FAILURE: 0x1f, MP_PLAYER_IS_LEADER: 0x20, MP_CLAN_DISBANDED: 0x21,
  MP_INVALID_PASSWORD: 0x22, MP_PLAYER_ALREADY_INVITED: 0x23, MP_PLAYER_LOGGED_IN: 0x24, MP_FILTER_FAILURE: 0x25,
  MP_GAME_NAME_EXISTS: 0x26, LOADED_FROM_MEMCARD: 0x27, SLIDER_MOVED: 0x28, ONSCROLL: 0x29, ONSCROLL_END: 0x2a,
  ONFOCUS: 0x2b, USBKBD_ENTER: 0x2c, MP_BANNED_FROM_GAME: 0x2d, ON_UPDATE_UIVAR: 0x2e, CLAN_MESSAGE_ID_ERR: 0x2f,
  CLAN_MESSAGE_EMPTY: 0x30, MP_PLAYER_IS_FRIEND: 0x31, MP_FRIEND_CONFIRMATION_REQUESTED: 0x32, MP_EJECT_SPECTATOR: 0x33,
  MP_EIGHTY_READY: 0x34, MP_DNAS_ERROR: 0x35, MP_DOWNLOAD_ERROR: 0x36, MP_MEDIUS_FILE_DOES_NOT_EXIST: 0x37,
  MP_CLAN_FULL: 0x38, MEMCARD_STATUS: 0x39, MP_SYSTEM_MESSAGE: 0x3a, PLAYER_IS_IGNORED: 0x3b,
  MP_RANDOM_GAME_FOUND: 0x3c, HDD_ERROR: 0x3d, MP_IGNORE_LIST_FULL: 0x3e,
};

/** `FUN_0036a5d0` (D:L264986-265078): a `BUTTON` name to its code (`strcmp`); none, or an unknown name, is 0 (START's). */
export const DIALOG_BUTTONS: Readonly<Record<string, number>> = {
  START: 0, SELECT: 1, RIGHT: 2, LEFT: 3, UP: 4, DOWN: 5, TRIANGLE: 6, CIRCLE: 7, SQUARE: 8, CROSS: 9,
  TRIGGER_R1: 10, TRIGGER_R2: 11, TRIGGER_L1: 12, TRIGGER_L2: 13,
};

/** `ParseButtonAnim`'s `STATE` words (D:L262762-262784): none, or another word, is 1 (FALLING). */
export const DIALOG_BUTTON_STATES: Readonly<Record<string, number>> = { UP: 0, FALLING: 1, DOWN: 2, RISING: 3 };

/** A new binding slot (`FUN_003838b0` D:L278439-278463, the values D:L278453-278457; the ONCHECK/ONUNCHECK slots D:L275617-275636): a button, code 0x10, state 1. */
export const BINDING_DEFAULT_CODE = 0x10;

/** The colour every colour field starts at: 128.0 thrice (0x43000000; e.g. D:L277640, D:L276779-276817). */
export const DEFAULT_COLOR: readonly [number, number, number] = [128, 128, 128];

/** `BACKGROUND`'s `TYPE` words (`FUN_00381550` D:L277325-277342, `strcasecmp`); another word leaves 0 (IMAGE). */
export const BACKGROUND_TYPES = { IMAGE: 0, MPEG: 1, MPEG_LOOPING: 2 } as const;

/**
 * A LISTBOX's `SPACING`, `SCALE`, `TOP_MARGIN` and `LEFT_MARGIN` (fields +0x24..+0x30) are not cleared by its
 * constructor (`FUN_0037eab0` zeroes +0x38 on, D:L275939-275970) before the reads at D:L275971-275974, so a listbox
 * without one holds whatever the allocation held. Reading: 0. [reading]
 */
export const LISTBOX_UNSET_READING = 0;

/**
 * A MAPCONTROL element's `XOFFSET`/`YOFFSET` (`FUN_0037d600`, locals D:L275114-275115 read at D:L275160-275161), a
 * RADIOSTRIP subordinate's `XPOS`/`YPOS` (`FUN_0037da50`, D:L275285-275286 read at D:L275316-275317) and a
 * HANDLERBUTTON's one subordinate's (`FUN_00380280`, D:L276603-276604 read at D:L276614-276615) go into stack locals
 * the engine never sets: a read that fails (`FUN_0032e970` writes nothing, D:L229877-229926) leaves the previous
 * element's value -- a dropped element's included, the reads come before its `SPEC` -- and the first element's is
 * whatever the stack held. Reading: 0 for that first one. [reading] The disc's 144 elements and 42 subordinates all
 * carry both keys (research 105 R105.4 and §3), so on the disc no value depends on it.
 */
export const POSITION_UNSET_READING = 0;

/** The name a record with no `NAME` (or an empty one) gets (0x3fa408, `FUN_00383360` D:L278322-278324). */
export const UNNAMED = 'unnamed';

/** The object factory's types (`FUN_00382070`), and the control factory's own before it falls back to them (`FUN_00382890`). */
export const OBJECT_TYPES = ['TEXT', 'IMAGE', 'TELETYPE', 'WRAPPEDTEXT', 'PROGRESSBAR', 'COUNTER', 'CLOCK', 'SECURETEXT'] as const;
export const CONTROL_TYPES = ['BUTTON', 'SCROLLINGTEXT', 'HANDLERBUTTON', 'LISTBOX', 'SLIDERBAR', 'CHECKBOX', 'RADIOSTRIP', 'MAPCONTROL'] as const;

// ---------------------------------------------------------------------------------------------------------------------
// The design's records.

/** A binding (`ParseButtonAnim` `FUN_00365d50`, D:L262463-262795): a button or an event, the animation and its argument. */
export interface DialogBinding {
  kind: 'button' | 'event';
  /** The name as written (`BUTTON`'s or `EVENT`'s), null for an untouched slot. */
  name: string | null;
  /** `DIALOG_BUTTONS` / `DIALOG_EVENTS` code. */
  code: number;
  /** `DIALOG_BUTTON_STATES` (a button's; an event leaves the slot's 1). */
  state: number;
  animation: string | null;
  argument: string | null;
}

/** A widget's `UIVAR` (`CUIVariableSpec` `FUN_00386ff0`, D:L280288-280349). */
export interface DialogUiVar {
  name: string | null;
  /** `VALUE`'s node: its one element when it holds exactly one (D:L280306-280313), else the list; null when absent. */
  value: RdrNode | null;
  /** `LONGEVITY` (`strcasecmp`): PERSISTENT 3, PERMANENT 2, else 1 (D:L280328-280346). */
  longevity: LiveLongevity;
}

/** The text fields (`FUN_00382070` TEXT D:L277613-277656; `FUN_00382670` D:L277793-277865). */
export interface TextSpec {
  caption: string | null;
  scale: number;
  font: string | null;
  /** HCENTERED sets it; RIGHT_JUSTIFIED, read after, clears it and sets `rightJustified` (D:L277630-277639). */
  hcentered: boolean;
  rightJustified: boolean;
  color: [number, number, number];
}

/** The image fields (`FUN_00383160`, D:L278187-278230). */
export interface ImageSpec {
  filename: string | null;
  /** `SIZE`, then `XSIZE` and `YSIZE` each over it (D:L278221-278223). */
  size: [number, number];
  /** `PULSE`, when present (D:L278224-278228). */
  pulse: number | null;
}

/** A scroll arrow (`DOWN_ARROW`/`UP_ARROW`: `TEXTURE`, `SIZE`, `OFFSET` in its own list). */
export interface ArrowSpec { texture: string | null; size: [number, number]; offset: [number, number] }

/** A button state (`NORMAL`, `ACTIVE`, `PRESSED`, `DISABLED`; `FUN_00380620` D:L276846-277055). */
export interface ButtonState {
  /** Whether the state was written as a block (`NORMAL ("IMAGE" (...) ...)`, `FUN_00334d20` true) or flat. */
  block: boolean;
  image: string | null;
  textColor: [number, number, number];
  pulse: number;
  scale: number;
  glow: { range: [number, number]; time: number } | null;
}

export interface ButtonSpec {
  /** `XSIZE`/`YSIZE`, then `SIZE` over both (D:L276832-276834). */
  size: [number, number];
  /** `XOFFSET`/`YOFFSET`, then `OFFSET` (D:L276835-276837). */
  offset: [number, number];
  scale: number;
  caption: string | null;
  normal: ButtonState; active: ButtonState; pressed: ButtonState; disabled: ButtonState;
  hcentered: boolean;
  font: string | null;
  bindings: DialogBinding[];
}

/** A subordinate widget: a `RADIOSTRIP`'s `SUBORDINATES`, a `HANDLERBUTTON`'s `SUBORDINATE`. */
export interface DialogSubordinate { name: string; type: string | null; x: number; y: number; opacity: number; childOf: string | null; widget: DialogWidget }

/** A `MAPCONTROL` element (`FUN_0037d600` D:L275138-275176): offsets, a type, an object built by the object factory. */
export interface DialogElement { type: string | null; x: number; y: number; widget: DialogWidget }

/** A `LISTBOX` column (`FUN_0037eab0` D:L276085-276214). */
export interface ListboxColumn {
  /** 0 image, 1 text, 2 `TIMED_TEXT`, 3 `WRAPPED_TEXT` (D:L276142, L276172, L276176, L276202). */
  kind: 0 | 1 | 2 | 3;
  position: number;
  topOffset: number;
  maxWidth: number;
  rightJustified: boolean;
  scale: number;
  /** A text column's height is the listbox's `SPACING` (D:L276199); an image column's is its `SIZE`'s second. */
  size: [number, number];
  textures: RdrNode | null;
}

/** A `LISTBOX` option (D:L276228-276540; the 0x30-byte record `FUN_0036bdd0` D:L265910-265950). */
export interface ListboxOption {
  /** The first of `captions`, or null when there is none. */
  caption: string | null;
  /**
   * The option's cells (`FUN_0037b2f0` D:L274070-274138, record +0x28): one per element of the `CAPTION` list up to the
   * listbox's column count (D:L274097-274100), a string element only (D:L274113); a `CAPTION` that is not a list, or an
   * empty one, makes none (D:L265937-265940). The cells are appended (`FUN_001fe340` D:L274132), so a non-string element
   * leaves no gap: later strings close up and cell i is not always column i. No disc option has more than one cell.
   */
  captions: string[];
  /** The option's own binding (`FUN_00365d50` into record +0x00, D:L276258). */
  binding: DialogBinding;
  /**
   * The focus binding (record +0x10): an event (+0x10 = 1, D:L276274) whose code is the one the event chain gives the
   * constant `"ONACTIVATE"` (0x3f9ef8, D:L276275-276538), `FOCUS_ANIM` its animation and `FOCUS_ARG` its argument
   * (+0x14, +0x18; D:L276259-276268), the state the constructor's 1 (+0x1c, D:L265930).
   */
  focus: DialogBinding;
  userData: string | null;
}

export type DialogWidget =
  | { type: 'TEXT' | 'SECURETEXT' | 'CLOCK'; uivar: DialogUiVar | null; text: TextSpec }
  | { type: 'IMAGE'; uivar: DialogUiVar | null; image: ImageSpec }
  | { type: 'TELETYPE'; uivar: DialogUiVar | null; text: TextSpec; maxHeight: number; pulseRate: number; spacing: number; interval: number; maxLength: number; noCursor: boolean; fadeCursor: boolean }
  | { type: 'WRAPPEDTEXT' | 'SCROLLINGTEXT'; uivar: DialogUiVar | null; text: TextSpec; width: number; spacing: number; height: number; downArrow: ArrowSpec | null; upArrow: ArrowSpec | null; autoScroll: boolean; displayOneLine: boolean; displayableLines: number | null }
  | { type: 'PROGRESSBAR'; uivar: DialogUiVar | null; image: ImageSpec; filenameIsUiVar: boolean; leadingEdgeNode: string | null }
  | { type: 'COUNTER'; uivar: DialogUiVar | null; text: TextSpec; startTime: number; valVar: string | null; endTime: number; isDuration: boolean }
  | { type: 'BUTTON'; uivar: DialogUiVar | null; button: ButtonSpec }
  | { type: 'HANDLERBUTTON'; uivar: DialogUiVar | null; button: ButtonSpec; subordinate: DialogSubordinate | null }
  | { type: 'SLIDERBAR'; uivar: DialogUiVar | null; button: ButtonSpec; numIntervals: number; knobTexture: string | null; knobSize: [number, number]; centerValue: number }
  | { type: 'CHECKBOX'; uivar: DialogUiVar | null; button: ButtonSpec; checkOffset: [number, number]; checkSize: [number, number]; checkTexture: string | null; onCheck: DialogBinding; onUncheck: DialogBinding }
  | { type: 'RADIOSTRIP'; uivar: DialogUiVar | null; button: ButtonSpec; subordinates: DialogSubordinate[]; page?: RadioStripPage }
  | { type: 'MAPCONTROL'; uivar: DialogUiVar | null; upperLeft: [number, number]; lowerRight: [number, number]; elements: DialogElement[]; bindings: DialogBinding[] }
  | {
      type: 'LISTBOX'; uivar: DialogUiVar | null; image: ImageSpec; spacing: number; scale: number; topMargin: number; leftMargin: number;
      noSelect: boolean; autoScroll: boolean; padHog: boolean; normalImage: string | null; pressedImage: string | null; activeImage: string | null;
      highlightOffset: number; downArrow: ArrowSpec | null; upArrow: ArrowSpec | null;
      activeBackground: { offset: [number, number]; size: [number, number]; image: string | null } | null;
      normalColor: [number, number, number]; activeColor: [number, number, number]; pressedColor: [number, number, number];
      activeGlow: { range: [number, number]; time: number } | null;
      columns: ListboxColumn[]; font: string | null; options: ListboxOption[]; bindings: DialogBinding[];
      speed: number; sequenceDelay: number; sequenceInterval: number;
    };

/**
 * A browser adaptation, no original (CPS-4b, ruling CPS.R7 (c)): a strip whose selection is a page setting's -- read when
 * the strip is made (in place of the original's 0, `FUN_003874e0`), handed back when a step changes it (`../widgets/radioStrip`).
 * No disc strip carries one; the loader never makes one (`./screens/videoSettingsRows` adds them to VIDEO OPTIONS).
 */
export interface RadioStripPage {
  get(): number;
  set(selection: number): void;
}

/** An object or a control as `FUN_00383360` records it (D:L278301-278337), with the widget its factory built. */
export interface DialogRecord {
  name: string;
  /** `TYPE` as written. */
  type: string | null;
  x: number;
  y: number;
  opacity: number;
  /** `CHILDOF`: the first anywhere in the record (D:L278331) -- a `RADIOSTRIP` with none of its own finds its first subordinate's. */
  childOf: string | null;
  widget: DialogWidget;
  /**
   * A browser adaptation, no original (CPS-4b, CPS.R7 (c)): a control kept for the disc's scripts that name it -- its
   * widget built, its commands and bindings run -- but its node not shown (`../compositor/dialogScreen`; a hidden node's
   * box takes no tap) and off the focus ring (`../input/menuInput` `focusRingRecords`). The loader never sets it.
   */
  hidden?: boolean;
}

/** A `LIBRARIES` entry: a name, or `UIVAR <var>` resolved at load time through the UI variables (D:L277270-277293). */
export type DialogLibrary = { name: string } | { uivar: string };

/** A `MODELS` entry (`FUN_003812b0`, D:L277126-277190). */
export interface DialogModel {
  name: string | null; model: string | null; azimuth: number; elev: number; distance: number;
  /** ROT_FIELD_READING: `ROTX`, `ROTY` and `ROTZ` are all stored to the one field +0x24 (D:L277177-277184), so the last read wins. */
  rot: number;
  useModelUiVar: boolean;
}

/** The design (`FUN_00381550`'s record): what `CGameMenu_LoadFromDesign` builds the screen from. */
export interface DialogDesign {
  libraries: DialogLibrary[];
  usesMemcard: boolean;
  font: string | null;
  /** `NOFONTLIB` absent: the font library `common/assetlib/font` is loaded (D:L277316-277322, L263496-263503). */
  fontLib: boolean;
  background: { type: number; typeName: string | null; filename: string | null } | null;
  bindings: DialogBinding[];
  controls: DialogRecord[];
  objects: DialogRecord[];
  scripts: string[];
  models: DialogModel[];
  /** Records `FUN_00383360` passed over: no `SPEC`, or a `TYPE` neither factory knows (the factory returned none). */
  dropped: { list: 'CONTROLS' | 'OBJECTS' | 'SUBORDINATES' | 'SUBORDINATE' | 'ELEMENTS'; name: string | null; type: string | null; why: 'no SPEC' | 'unknown TYPE' }[];
}

// ---------------------------------------------------------------------------------------------------------------------
// The readers.

export class DialogLoader {
  readonly q = new RdrLookup();
  private readonly dropped: DialogDesign['dropped'] = [];

  /** `FUN_00365d50`, into a new slot (`FUN_003838b0`'s: a button, code 0x10, state 1, no animation). */
  binding(node: RdrNode | undefined): DialogBinding {
    const q = this.q;
    const out: DialogBinding = { kind: 'button', name: null, code: BINDING_DEFAULT_CODE, state: 1, animation: null, argument: null };
    const animation = q.str(node, 'ANIMATION'), argument = q.str(node, 'ARGUMENT'), state = q.str(node, 'STATE');
    if (q.has(node, 'BUTTON')) {
      const name = q.str(node, 'BUTTON');
      out.name = name;
      out.code = name === null ? 0 : DIALOG_BUTTONS[name] ?? 0;
      out.state = state === null ? 1 : DIALOG_BUTTON_STATES[state] ?? 1;
      out.animation = animation; out.argument = argument;
    } else if (q.has(node, 'EVENT')) {
      const name = q.str(node, 'EVENT');
      out.kind = 'event'; out.name = name;
      out.code = name === null ? 0 : DIALOG_EVENTS[name] ?? 0;
      out.animation = animation; out.argument = argument;
    }
    return out;
  }

  /** A binding list (`ANIMATIONS`): each element through `FUN_00365d50` into a new slot. */
  bindings(list: RdrNode[] | null): DialogBinding[] {
    return (list ?? []).map((b) => this.binding(b));
  }

  /** `FUN_00386ff0`, given the `UIVAR` node a widget base finds (`FUN_003832e0` D:L278246; `FUN_00383160` D:L278199). */
  uivar(spec: RdrNode): DialogUiVar | null {
    const q = this.q;
    const node = q.find(spec, 'UIVAR');
    if (node === undefined) return null;
    const v = q.find(node, 'VALUE');
    const value = v === undefined ? null : Array.isArray(v) && v.length === 1 ? v[0]! : v;
    return { name: q.str(node, 'NAME'), value, longevity: uiVarLongevityOf(q.str(node, 'LONGEVITY') ?? undefined) };
  }

  text(spec: RdrNode): TextSpec {
    const q = this.q;
    const out: TextSpec = { caption: q.str(spec, 'CAPTION'), scale: q.float(spec, 'SCALE') ?? 1, font: null, hcentered: false, rightJustified: false, color: [...DEFAULT_COLOR] };
    out.font = q.str(spec, 'FONT');
    if (q.has(spec, 'HCENTERED')) { out.hcentered = true; out.rightJustified = false; }
    if (q.has(spec, 'RIGHT_JUSTIFIED')) { out.hcentered = false; out.rightJustified = true; }
    if (q.has(spec, 'COLOR')) out.color = q.float3(spec, 'COLOR') ?? out.color;
    return out;
  }

  image(spec: RdrNode): ImageSpec {
    const q = this.q;
    const filename = q.str(spec, 'FILENAME');
    const size: [number, number] = q.int2(spec, 'SIZE') ?? [0, 0];
    const xs = q.int(spec, 'XSIZE'), ys = q.int(spec, 'YSIZE');
    if (xs !== null) size[0] = xs;
    if (ys !== null) size[1] = ys;
    return { filename, size, pulse: q.has(spec, 'PULSE') ? q.float(spec, 'PULSE') ?? 0 : null };
  }

  arrow(node: RdrNode | undefined): ArrowSpec | null {
    if (node === undefined) return null;
    const q = this.q;
    return { texture: q.str(node, 'TEXTURE'), size: q.int2(node, 'SIZE') ?? [0, 0], offset: q.int2(node, 'OFFSET') ?? [0, 0] };
  }

  /** `FUN_00382c70` (D:L278025-278126) and the WRAPPEDTEXT branch (D:L277701-277744): text plus the wrapping fields. */
  wrapped(spec: RdrNode, type: 'WRAPPEDTEXT' | 'SCROLLINGTEXT'): DialogWidget {
    const q = this.q;
    const uivar = this.uivar(spec), text = this.text(spec);
    const width = q.float(spec, 'WIDTH') ?? 0, spacing = q.int(spec, 'SPACING') ?? 10, height = q.float(spec, 'HEIGHT') ?? -1;
    const downArrow = this.arrow(q.find(spec, 'DOWN_ARROW')), upArrow = this.arrow(q.find(spec, 'UP_ARROW'));
    const autoScroll = q.has(spec, 'AUTOSCROLL'), displayOneLine = q.has(spec, 'DISPLAY_ONE_LINE');
    // SCROLLINGTEXT reads DISPLAYABLELINES after its base (D:L277898-277899), default 0.
    const displayableLines = type === 'SCROLLINGTEXT' ? q.int(spec, 'DISPLAYABLELINES') ?? 0 : null;
    return { type, uivar, text, width, spacing, height, downArrow, upArrow, autoScroll, displayOneLine, displayableLines };
  }

  /** One button state: block form reads its own list, flat form the `<STATE>`, `<STATE>GLOW`, `<STATE>_COLOR` keys. */
  private state(spec: RdrNode, word: 'NORMAL' | 'ACTIVE' | 'PRESSED' | 'DISABLED', base: number): ButtonState {
    const q = this.q;
    const out: ButtonState = { block: false, image: null, textColor: [...DEFAULT_COLOR], pulse: 0, scale: base, glow: null };
    const node = q.find(spec, word);
    if (Array.isArray(node) && node.some((c) => Array.isArray(c))) {
      out.block = true;
      out.image = q.str(node, 'IMAGE');
      out.textColor = q.float3(node, 'TEXT_COLOR') ?? out.textColor;
      out.pulse = q.float(node, 'PULSE') ?? 0;
      out.scale = q.float(node, 'SCALE') ?? base;
      const glow = q.find(node, 'TEXT_GLOW');
      if (glow !== undefined) out.glow = { range: q.float2(glow, 'RANGE') ?? [0, 0], time: q.float(glow, 'TIME') ?? 0 };
      return out;
    }
    // Flat: the DISABLED image is looked up and dropped (D:L277011: the result is not stored).
    const image = q.str(spec, word);
    if (word !== 'DISABLED') out.image = image;
    const glow = q.find(spec, `${word}GLOW`);
    if (glow !== undefined) {
      const r = q.ints(glow, 'RANGE', 2);   // ints, then floated (D:L276865-276867)
      out.glow = { range: r ? [r[0]!, r[1]!] : [0, 0], time: q.float(glow, 'TIME') ?? 0 };
    }
    if (q.has(spec, `${word}_COLOR`)) out.textColor = q.float3(spec, `${word}_COLOR`) ?? out.textColor;
    return out;
  }

  /** `FUN_00380620` (D:L276723-277103): the button every interactive control starts from. */
  button(spec: RdrNode): ButtonSpec {
    const q = this.q;
    const size: [number, number] = [q.int(spec, 'XSIZE') ?? 0, q.int(spec, 'YSIZE') ?? 0];
    const s2 = q.int2(spec, 'SIZE');
    const offset: [number, number] = [q.int(spec, 'XOFFSET') ?? 0, q.int(spec, 'YOFFSET') ?? 0];
    const o2 = q.int2(spec, 'OFFSET');
    const scale = q.float(spec, 'SCALE') ?? 1;
    const caption = q.str(spec, 'CAPTION');
    const normal = this.state(spec, 'NORMAL', scale), active = this.state(spec, 'ACTIVE', scale);
    const pressed = this.state(spec, 'PRESSED', scale), disabled = this.state(spec, 'DISABLED', scale);
    const hcentered = q.has(spec, 'HCENTERED'), font = q.str(spec, 'FONT');
    const bindings = this.bindings(q.list(spec, 'ANIMATIONS'));
    return { size: s2 ?? size, offset: o2 ?? offset, scale, caption, normal, active, pressed, disabled, hcentered, font, bindings };
  }

  /** A subordinate record: `NAME`, `TYPE`, `XPOS`, `YPOS` of the record, its `SPEC` through the control factory. */
  private subordinate(rec: RdrNode, list: 'SUBORDINATES' | 'SUBORDINATE', at: [number, number]): DialogSubordinate | null {
    const q = this.q;
    const name = q.str(rec, 'NAME'), type = q.str(rec, 'TYPE');
    // XPOS/YPOS into locals the engine never resets: an absent key keeps `at` (POSITION_UNSET_READING).
    at[0] = q.int(rec, 'XPOS') ?? at[0]; at[1] = q.int(rec, 'YPOS') ?? at[1];
    const [x, y] = at;
    const spec = q.find(rec, 'SPEC');
    if (spec === undefined) { this.dropped.push({ list, name, type, why: 'no SPEC' }); return null; }
    const widget = this.control(spec, type);
    if (!widget) { this.dropped.push({ list, name, type, why: 'unknown TYPE' }); return null; }
    // RADIOSTRIP reads the CHILDOF in the SPEC (D:L275354); HANDLERBUTTON reads none (D:L276610-276651).
    const childOf = list === 'SUBORDINATES' ? q.str(spec, 'CHILDOF') : null;
    return { name: name === null || name === '' ? UNNAMED : name, type, x, y, opacity: 1, childOf, widget };
  }

  /** The object factory `FUN_00382070`; null for a type it does not make. */
  object(spec: RdrNode, type: string | null): DialogWidget | null {
    const q = this.q;
    switch (type) {
      case 'TEXT': return { type, uivar: this.uivar(spec), text: this.text(spec) };
      case 'IMAGE': return { type, uivar: this.uivar(spec), image: this.image(spec) };
      case 'TELETYPE': {
        const uivar = this.uivar(spec), text = this.text(spec);
        return {
          type, uivar, text, maxHeight: q.int(spec, 'MAXHEIGHT') ?? -1, pulseRate: q.float(spec, 'PULSERATE') ?? 0,
          spacing: q.float(spec, 'SPACING') ?? 0, interval: q.float(spec, 'INTERVAL') ?? 0, maxLength: q.float(spec, 'MAXLENGTH') ?? 0,
          noCursor: q.has(spec, 'NOCURSOR'), fadeCursor: q.has(spec, 'FADECURSOR'),
        };
      }
      case 'WRAPPEDTEXT': return this.wrapped(spec, type);
      case 'PROGRESSBAR': {
        const uivar = this.uivar(spec), image = this.image(spec);
        return { type, uivar, image, filenameIsUiVar: q.has(spec, 'FILENAME_IS_UIVAR'), leadingEdgeNode: q.str(spec, 'LEADING_EDGE_NODE') };
      }
      case 'COUNTER': {
        const uivar = this.uivar(spec), text = this.text(spec);
        const startTime = q.float(spec, 'StartTime') ?? 0, valVar = q.str(spec, 'ValVar');
        let endTime = q.float(spec, 'EndTime'), isDuration = false;
        if (endTime === null) { endTime = q.float(spec, 'Duration'); isDuration = endTime !== null; }
        return { type, uivar, text, startTime, valVar, endTime: endTime ?? 0, isDuration };
      }
      case 'CLOCK': case 'SECURETEXT': return { type, uivar: this.uivar(spec), text: this.text(spec) };
      default: return null;
    }
  }

  /** The control factory `FUN_00382890`: its own types, then the object factory's. */
  control(spec: RdrNode, type: string | null): DialogWidget | null {
    const q = this.q;
    switch (type) {
      case 'BUTTON': return { type, uivar: this.uivar(spec), button: this.button(spec) };
      case 'SCROLLINGTEXT': return this.wrapped(spec, type);
      case 'HANDLERBUTTON': {
        const uivar = this.uivar(spec), button = this.button(spec);
        const sub = q.find(spec, 'SUBORDINATE');
        return { type, uivar, button, subordinate: sub === undefined ? null : this.subordinate(sub, 'SUBORDINATE', [POSITION_UNSET_READING, POSITION_UNSET_READING]) };
      }
      case 'LISTBOX': return this.listbox(spec);
      case 'SLIDERBAR': {
        const uivar = this.uivar(spec), button = this.button(spec);
        return {
          type, uivar, button, numIntervals: q.int(spec, 'NUM_INTERVALS') ?? 10, knobTexture: q.str(spec, 'KNOB_TEXTURE'),
          knobSize: q.int2(spec, 'KNOB_SIZE') ?? [0, 0], centerValue: q.float(spec, 'CENTER_VALUE') ?? 0.5,
        };
      }
      case 'CHECKBOX': {
        const uivar = this.uivar(spec), button = this.button(spec);
        const checkOffset: [number, number] = [q.int(spec, 'CHECK_X') ?? 0, q.int(spec, 'CHECK_Y') ?? 0];
        const co = q.int2(spec, 'CHECK_OFFSET');
        const checkSize: [number, number] = [q.int(spec, 'CHECKSIZE_X') ?? 0, q.int(spec, 'CHECKSIZE_Y') ?? 0];
        const cs = q.int2(spec, 'CHECK_SIZE');
        const checkTexture = q.str(spec, 'CHECK_TEXTURE');
        const on = q.find(spec, 'ONCHECK'), off = q.find(spec, 'ONUNCHECK');
        const idle = (): DialogBinding => ({ kind: 'button', name: null, code: BINDING_DEFAULT_CODE, state: 1, animation: null, argument: null });
        return {
          type, uivar, button, checkOffset: co ?? checkOffset, checkSize: cs ?? checkSize, checkTexture,
          onCheck: on === undefined ? idle() : this.binding(on), onUncheck: off === undefined ? idle() : this.binding(off),
        };
      }
      case 'RADIOSTRIP': {
        const uivar = this.uivar(spec), button = this.button(spec);
        const at: [number, number] = [POSITION_UNSET_READING, POSITION_UNSET_READING];
        const subs = (q.list(spec, 'SUBORDINATES') ?? []).map((r) => this.subordinate(r, 'SUBORDINATES', at)).filter((s): s is DialogSubordinate => s !== null);
        return { type, uivar, button, subordinates: subs };
      }
      case 'MAPCONTROL': {
        const uivar = this.uivar(spec);
        const upperLeft = q.int2(spec, 'UPPERLEFT') ?? [0, 0], lowerRight = q.int2(spec, 'LOWERRIGHT') ?? [0, 0];
        const elements: DialogElement[] = [];
        // XOFFSET/YOFFSET into locals the engine never resets: an absent key keeps the last (POSITION_UNSET_READING).
        let x = POSITION_UNSET_READING, y = POSITION_UNSET_READING;
        for (const el of q.list(spec, 'ELEMENTS') ?? []) {
          x = q.int(el, 'XOFFSET') ?? x; y = q.int(el, 'YOFFSET') ?? y;
          const t = q.str(el, 'TYPE');
          const s = q.find(el, 'SPEC');
          if (s === undefined) { this.dropped.push({ list: 'ELEMENTS', name: null, type: t, why: 'no SPEC' }); continue; }
          const widget = this.object(s, t);
          if (!widget) { this.dropped.push({ list: 'ELEMENTS', name: null, type: t, why: 'unknown TYPE' }); continue; }
          elements.push({ type: t, x, y, widget });
        }
        return { type, uivar, upperLeft, lowerRight, elements, bindings: this.bindings(q.list(spec, 'ANIMATIONS')) };
      }
      default: return this.object(spec, type);
    }
  }

  /** `FUN_0037eab0` (D:L275893-276585): an image (`FUN_00383160`) with the list's fields. */
  listbox(spec: RdrNode): DialogWidget {
    const q = this.q;
    const uivar = this.uivar(spec), image = this.image(spec);
    const spacing = q.int(spec, 'SPACING') ?? LISTBOX_UNSET_READING, scale = q.float(spec, 'SCALE') ?? LISTBOX_UNSET_READING;
    const topMargin = q.int(spec, 'TOP_MARGIN') ?? LISTBOX_UNSET_READING, leftMargin = q.int(spec, 'LEFT_MARGIN') ?? LISTBOX_UNSET_READING;
    const noSelect = q.has(spec, 'NOSELECT'), autoScroll = q.has(spec, 'AUTOSCROLL'), padHog = q.has(spec, 'PADHOG');
    const normalImage = q.str(spec, 'NORMAL'), pressedImage = q.str(spec, 'PRESSED'), activeImage = q.str(spec, 'ACTIVE');
    const highlightOffset = q.int(spec, 'HIGHLIGHT_OFFSET') ?? 0;
    const downArrow = this.arrow(q.find(spec, 'DOWN_ARROW')), upArrow = this.arrow(q.find(spec, 'UP_ARROW'));
    const bg = q.find(spec, 'ACTIVE_BACKGROUND');
    const activeBackground = bg === undefined ? null : { offset: q.int2(bg, 'OFFSET') ?? [0, 0] as [number, number], size: q.int2(bg, 'SIZE') ?? [0, 0] as [number, number], image: q.str(bg, 'IMAGE') };
    const color = (k: string): [number, number, number] => (q.has(spec, k) ? q.float3(spec, k) ?? [...DEFAULT_COLOR] : [...DEFAULT_COLOR]);
    const normalColor = color('NORMAL_COLOR');
    const activeNode = q.find(spec, 'ACTIVE_COLOR');
    const activeColor = color('ACTIVE_COLOR');
    // RANGE and TIME are looked up inside ACTIVE_COLOR's own value (D:L276070-276074).
    const activeGlow = activeNode === undefined ? null : { range: q.float2(activeNode, 'RANGE') ?? [0, 0] as [number, number], time: q.float(activeNode, 'TIME') ?? 0 };
    const pressedColor = color('PRESSED_COLOR');
    const columns: ListboxColumn[] = [];
    const cols = q.list(spec, 'COLUMNS');
    const blank = (): ListboxColumn => ({ kind: 1, position: 0, topOffset: 0, maxWidth: 0, rightJustified: false, scale: 0, size: [0, 0], textures: null });
    if (cols === null) columns.push(blank());   // one default column (D:L276086-276109)
    else {
      for (const col of cols) {
        const c = blank();
        c.position = q.int(col, 'POSITION') ?? 0;
        c.topOffset = q.int(col, 'TOP_OFFSET') ?? 0;
        const img = q.find(col, 'IMAGE');
        if (img === undefined) {
          if (q.has(col, 'TIMED_TEXT')) c.kind = 2;
          if (q.has(col, 'WRAPPED_TEXT')) c.kind = 3;
          c.maxWidth = q.has(col, 'MAXWIDTH') ? q.int(col, 'MAXWIDTH') ?? 0 : 1000;
          c.rightJustified = q.has(col, 'RIGHT_JUSTIFIED');
          c.scale = q.has(col, 'SCALE') ? q.float(col, 'SCALE') ?? 0 : 0;
          c.size = [c.size[0], spacing];
        } else {
          c.kind = 0;
          c.size = q.int2(img, 'SIZE') ?? [0, 0];
          const tex = q.find(img, 'TEXTURES');
          c.textures = tex === undefined ? null : tex;
        }
        columns.push(c);
      }
    }
    const font = q.str(spec, 'FONT');
    const options: ListboxOption[] = (q.list(spec, 'OPTIONS') ?? []).map((o) => {
      const node = q.find(o, 'CAPTION');
      const captions: string[] = [];
      if (Array.isArray(node)) {
        for (let i = 0; i < Math.min(node.length, columns.length); i++) if (typeof node[i] === 'string') captions.push(node[i] as string);
      }
      const binding = this.binding(o);
      const focus: DialogBinding = {
        kind: 'event', name: 'ONACTIVATE', code: DIALOG_EVENTS.ONACTIVATE!, state: 1, animation: q.str(o, 'FOCUS_ANIM'), argument: q.str(o, 'FOCUS_ARG'),
      };
      return { caption: captions[0] ?? null, captions, binding, focus, userData: q.str(o, 'USERDATA') };
    });
    const bindings = this.bindings(q.list(spec, 'ANIMATIONS'));
    const speed = q.has(spec, 'SPEED') ? q.float(spec, 'SPEED') ?? 0 : 60;
    return {
      type: 'LISTBOX', uivar, image, spacing, scale, topMargin, leftMargin, noSelect, autoScroll, padHog, normalImage, pressedImage, activeImage,
      highlightOffset, downArrow, upArrow, activeBackground, normalColor, activeColor, pressedColor, activeGlow, columns, font, options, bindings,
      speed, sequenceDelay: q.float(spec, 'SEQUENCE_DELAY') ?? 0, sequenceInterval: q.float(spec, 'SEQUENCE_INTERVAL') ?? 0,
    };
  }

  /** `FUN_00383360`: a `CONTROLS` or `OBJECTS` list, each record through `factory`. */
  records(root: RdrNode, key: 'CONTROLS' | 'OBJECTS'): DialogRecord[] {
    const q = this.q;
    const out: DialogRecord[] = [];
    for (const rec of q.list(root, key) ?? []) {
      const name = q.str(rec, 'NAME'), type = q.str(rec, 'TYPE');
      const x = q.int(rec, 'XPOS') ?? 0, y = q.int(rec, 'YPOS') ?? 0, opacity = q.float(rec, 'OPACITY') ?? 1;
      const spec = q.find(rec, 'SPEC');
      if (spec === undefined) { this.dropped.push({ list: key, name, type, why: 'no SPEC' }); continue; }
      const widget = key === 'CONTROLS' ? this.control(spec, type) : this.object(spec, type);
      if (!widget) { this.dropped.push({ list: key, name, type, why: 'unknown TYPE' }); continue; }
      out.push({ name: name === null || name === '' ? UNNAMED : name, type, x, y, opacity, childOf: q.str(rec, 'CHILDOF'), widget });
    }
    return out;
  }

  /** `FUN_00381550`, in its order: the design of a dialog's parsed root. */
  load(root: RdrNode): DialogDesign {
    const q = this.q;
    const libraries: DialogLibrary[] = [];
    const library = q.str(root, 'LIBRARY');
    if (library !== null) libraries.push({ name: library });
    const libs = q.list(root, 'LIBRARIES') ?? [];
    for (let i = 0; i < libs.length; i++) {
      const item = libs[i];
      if (typeof item !== 'string') continue;
      if (item.toUpperCase() === 'UIVAR' && i < libs.length - 1) {
        const next = libs[++i];
        // Resolved through the UI variables when the dialog loads (FUN_003857c0); kept by name here.
        libraries.push(typeof next === 'string' ? { uivar: next } : { name: item });
      } else libraries.push({ name: item });
    }
    const usesMemcard = q.has(root, 'USES_MEMCARD');
    const font = q.str(root, 'FONT');
    const fontLib = !q.has(root, 'NOFONTLIB');
    let background: DialogDesign['background'] = null;
    const bg = q.find(root, 'BACKGROUND');
    if (bg !== undefined) {
      const typeName = q.str(bg, 'TYPE');
      const w = typeName?.toUpperCase();
      const type = w === 'IMAGE' ? 0 : w === 'MPEG' ? 1 : w === 'MPEG_LOOPING' ? 2 : 0;
      background = { type, typeName, filename: q.str(bg, 'FILENAME') };
    }
    const bindings = this.bindings(q.list(root, 'ANIMATIONS'));
    const controls = this.records(root, 'CONTROLS');
    const objects = this.records(root, 'OBJECTS');
    const scripts = (q.list(root, 'SCRIPT_LIBRARY') ?? []).filter((s): s is string => typeof s === 'string');
    const models: DialogModel[] = (q.list(root, 'MODELS') ?? []).map((m) => {
      const name = q.str(m, 'NAME'), model = q.str(m, 'MODEL');
      const azimuth = q.float(m, 'AZIMUTH') ?? 0, elev = q.float(m, 'ELEV') ?? 0, distance = q.float(m, 'DISTANCE') ?? 20;
      let rot = q.float(m, 'ROTX') ?? 0;
      rot = q.float(m, 'ROTY') ?? 0;
      rot = q.float(m, 'ROTZ') ?? 0;
      return { name, model, azimuth, elev, distance, rot, useModelUiVar: q.has(m, 'USEMODELUIVAR') };
    });
    return { libraries, usesMemcard, font, fontLib, background, bindings, controls, objects, scripts, models, dropped: [...this.dropped] };
  }
}

/** A dialog's parsed root to its design (`FUN_00381550`). */
export function loadDialog(root: RdrNode): DialogDesign {
  return new DialogLoader().load(root);
}

/**
 * The names of the nodes `CGameMenu_LoadFromDesign` makes, in the order it makes them (D:L263627-263658): each
 * control, then that control's subordinates (vtable +0x1c/+0x20/+0x18 -- a RADIOSTRIP's checkboxes, a
 * HANDLERBUTTON's one), then every object. A MAPCONTROL's elements are its own and are not nodes of the menu.
 */
export function dialogNodeNames(design: DialogDesign): string[] {
  const out: string[] = [];
  for (const c of design.controls) {
    out.push(c.name);
    const w = c.widget;
    if (w.type === 'RADIOSTRIP') for (const s of w.subordinates) out.push(s.name);
    if (w.type === 'HANDLERBUTTON' && w.subordinate) out.push(w.subordinate.name);
  }
  for (const o of design.objects) out.push(o.name);
  return out;
}

/**
 * The keys of a dialog no reader looked up (research 105 §4), sorted three ways:
 * - `containers`: a key no lookup matched whose value holds keys that were read -- `SCREENS`, which the depth-first
 *   lookups search through without ever naming it;
 * - `shadowed`: a doubled key whose first copy in the same list was read (the first match never reaches the second);
 * - `unread`: any other key no lookup matched, reported once at the top of a subtree no reader entered.
 */
export interface UnreadKeys { unread: RdrKey[]; shadowed: RdrKey[]; containers: RdrKey[] }

export function unreadKeys(root: RdrNode, loader: DialogLoader): UnreadKeys {
  const all = keysOf(root);
  const read = (k: RdrKey): boolean => loader.q.wasRead(k.list, k.index);
  // The value lists under which some key was read.
  const live = new Set<readonly RdrNode[]>();
  for (const k of all) if (read(k)) for (const w of k.within) live.add(w);
  const out: UnreadKeys = { unread: [], shadowed: [], containers: [] };
  const skipped = new Set<readonly RdrNode[]>();
  for (const k of all) {
    if (read(k) || k.within.some((w) => skipped.has(w))) continue;
    let twin = false;
    for (let i = 0; i < k.index; i++) if (k.list[i] === k.key && loader.q.wasRead(k.list, i)) twin = true;
    if (twin) { out.shadowed.push(k); skipped.add(k.value); }
    else if (live.has(k.value)) out.containers.push(k);
    else { out.unread.push(k); skipped.add(k.value); }
  }
  return out;
}
