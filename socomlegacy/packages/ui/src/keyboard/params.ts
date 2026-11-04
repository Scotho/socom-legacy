import type { RdrNode } from '@s2u/archive';
import { uiCommandFold } from '../uiCommands';

/**
 * `UiParams.rdr`, the soft keyboard's file (PLAT-17; web research 119 §1-§2): `CommonSoftKeyboardProps` (the repeat,
 * the six sounds, the USB icon, the legend; `FUN_00397070` D:L289706-289839) and `SoftKeyboards`, the layouts in file
 * order (`FUN_0038d6a0` D:L283952-283985; one record `FUN_003963f0` D:L289242-289464, its grid `FUN_0038e160`
 * D:L284387-284502, its key props `FUN_0038dcb0` D:L284204-284278). On the US disc: 12 layouts in six English / accent
 * pairs, each grid 7 rows x 15 cells (research 119 R119.1). `D:L<line>` = a line of `socom2_game.elf.decomp.c`.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** Where the file is: `data/common/UiParams.rdr` (0x3fadd8), on the disc a member of `RUN/UI/READERC.ZAR` (research 96 R96.1). */
export const UI_PARAMS_RDR = { archive: 'RUN/UI/READERC.ZAR', member: 'UiParams.rdr' } as const;

/** The layout an empty `SkbName` opens (`FUN_0038d770` D:L284003-284005, the string at 0x3fae08). */
export const SKB_DEFAULT_LAYOUT = 'KEYBOARD';

/** A key's type byte (`FUN_0038da70`): 0 a character (value 0 the empty key), 1 a function, 2 a jamo, 3 `Switch<n>`. */
export const SKB_KEY_TYPE = { CHAR: 0, FN: 1, JAMO: 2, SWITCH: 3 } as const;

/** A key: `{type byte, u16 value}`, as `FUN_0038da70` writes one and `FUN_0038c130` compares two. */
export interface SkbKey { readonly type: number; readonly value: number }

export const SKB_EMPTY_KEY: SkbKey = Object.freeze({ type: SKB_KEY_TYPE.CHAR, value: 0 });

/** The 14 function names at 0x3fac60 (read from the ELF), keys 0..13 in this order. */
export const SKB_FN_NAMES = [
  'CapsLock', 'Recip', 'BackSpace', 'Clear', 'Enter', 'Exit', 'Apply', 'Shift', 'Legend', 'Dakuten', 'Handakuten',
  'WideNarrow', 'MsgPlayer', 'Action2',
] as const;
export const SKB_FN = Object.fromEntries(SKB_FN_NAMES.map((n, i) => [n, i])) as { readonly [K in (typeof SKB_FN_NAMES)[number]]: number };

/** The five named characters (the names at 0x3facc0, the characters at 0x3facd8, read from the ELF). */
export const SKB_NAMED_CHARS: Readonly<Record<string, number>> = { Quote1: 0x27, Quote2: 0x22, ParenL: 0x28, ParenR: 0x29, Space: 0x20 };

/** `Switch` (0x3fae28): a cell whose first six bytes spell it is a switch to `SwitchTargets[atoi(rest) - 1]`. */
const SWITCH = 'Switch';

/**
 * SKB_CELL_TOKEN_READING: `parseRdr` keeps no node types, so a grid cell's integer node (a code point, `FUN_0038e160`)
 * and a one-character string read alike when the integer has one digit. A token of one character is that character
 * (`FUN_00199288` = 1); a token of two or more digits is an integer cell, the character of that code point. On the US
 * disc the integer cells are 34, 161, 352, 376, 8222 and 8364 (a typed probe of the file, research 119 §2), none of one
 * digit, so the rule reads what the engine reads there. [reading]
 */
export const SKB_CELL_TOKEN_READING = 'one character: that character; two or more digits: a code point' as const;

/**
 * SKB_JAMO_READING: a word that is neither a named character nor a function is looked up as a Korean jamo name
 * (`FUN_00390bb0`); the jamo table was not read. No US grid holds one: every such word there is `null`, the empty key.
 * Here every such word is the empty key. [reading]
 */
export const SKB_JAMO_READING = 'any other word: the empty key' as const;

/** `FUN_0038da70` (D:L284100-284165), with `FUN_0038e160`'s integer cells (`SKB_CELL_TOKEN_READING`). */
export function skbCell(token: string): SkbKey {
  if (token.length === 0) return SKB_EMPTY_KEY;
  if (token.length === 1) return { type: SKB_KEY_TYPE.CHAR, value: token.charCodeAt(0) & 0xff };
  if (/^\d+$/.test(token)) return { type: SKB_KEY_TYPE.CHAR, value: Number(token) & 0xffff };
  if (token.startsWith(SWITCH)) return { type: SKB_KEY_TYPE.SWITCH, value: Number.parseInt(token.slice(SWITCH.length), 10) & 0xffff || 0 };
  const fold = uiCommandFold(token);
  for (const [name, code] of Object.entries(SKB_NAMED_CHARS)) if (uiCommandFold(name) === fold) return { type: SKB_KEY_TYPE.CHAR, value: code };
  const fn = SKB_FN_NAMES.findIndex((n) => uiCommandFold(n) === fold);
  if (fn >= 0) return { type: SKB_KEY_TYPE.FN, value: fn };
  return SKB_EMPTY_KEY;                                                                  // SKB_JAMO_READING
}

export const sameSkbKey = (a: SkbKey, b: SkbKey): boolean => a.type === b.type && a.value === b.value;
export const isEmptySkbKey = (k: SkbKey): boolean => k.type === 0 && k.value === 0;

export interface SkbRect { x: number; y: number; w: number; h: number }
/** A background piece: a rectangle of a texture (`Source`) drawn at a rectangle of the keyboard (`Display`). */
export interface SkbPiece { texture: string; src: SkbRect; dst: SkbRect }
/** A text's props (`UserStringProps`, `PurposeStringProps`, `MsgPlayerStringProps`): place, scale, GS colour, face. */
export interface SkbTextProps { x: number; y: number; scale: number; color: [number, number, number]; font: string | null }
/** A key's props: the key, its place in the keyboard, an optional `Size`, its button's two textures and size. */
export interface SkbKeyProps {
  key: SkbKey; x: number; y: number; size: [number, number] | null;
  pressed: string | null; active: string | null; buttonSize: [number, number] | null;
}

export interface SkbLayout {
  name: string;
  background: string | null;
  shiftBackground: string | null;
  /** `BackgroundPieces`, `ShiftBgPieces`, `TwoEditsBgPieces`, `TwoEditsShiftBgPieces` (at most 10 each, D:L290031). */
  pieces: [SkbPiece[], SkbPiece[], SkbPiece[], SkbPiece[]];
  twoEditsGrowUp: number;
  /** 1-based (column, row); the activation subtracts one from each (`FUN_0038b440` D:L282668-282672). */
  startGridPos: [number, number];
  skbPos: [number, number];
  skbWidth: number;
  skbHeight: number;
  userStringWidth: number;
  /** Non-zero: the main text may take two lines (`FUN_0039a5b0` D:L291742-291749). */
  userStringLineHeight: number;
  cursorY: number;
  cursorY2nd: number;
  cursorSize: [number, number];
  userString: SkbTextProps | null;
  purposeString: SkbTextProps | null;
  msgPlayerString: SkbTextProps | null;
  indicators: { capsLock: SkbRect | null; shift: SkbRect | null; legend: SkbRect | null; usbKbdOn: SkbRect | null; usbKbdMode: SkbRect | null };
  /** Default 0.25 each (`FUN_003963f0`); every US layout says 0.2. */
  scaleUpSec: number;
  scaleDownSec: number;
  switchTargets: string[];
  /** The rows of keys, as the file lists them. */
  grid: SkbKey[][];
  keyProps: SkbKeyProps[];
  ignoreUnchangedString: boolean;
}

export interface SkbCommon {
  repeatDelay: number;
  repeatSpeedStart: number;
  repeatSpeedEnd: number;
  repeatAccelTime: number;
  /** By slot (`FUN_00397bc0` D:L290055-290094): 0 ScaleUp, 1 ScaleDown, 2 Navigation, 3 KeyPress, 4 KeyPressEnter, 5 Negative. */
  sounds: string[];
  usbKbdOnIcon: string | null;
  legend: { texture: string | null; size: [number, number]; slideInSec: number; slideOutSec: number };
  /** Absent on the US disc: 1.0 (x 128 on every background piece). */
  backgroundsOpacity: number;
}

export interface SoftKeyboardParams { common: SkbCommon; layouts: SkbLayout[] }

/** The sound keys by slot (`FUN_00397bc0`). */
export const SKB_SOUND_KEYS = ['ScaleUpSound', 'ScaleDownSound', 'NavigationSound', 'KeyPressSound', 'KeyPressEnterSound', 'NegativeSound'] as const;

/**
 * SKB_PIECE_ATLAS_READING: the piece textures' size, which `stToImage`-style coordinates need. The four piece textures
 * (`SKB_English_Set.tif` and its kin, in `RUN/UI/UISK_TXR.ZED`, not decoded here) are taken as 512 x 512: every piece's
 * `Source` lies in 0..512 on both axes and the widest and tallest reach 512 exactly (research 119 §2). [reading]
 */
export const SKB_PIECE_ATLAS_READING = 512;

// ---------------------------------------------------------------------------------------------------------------------

/** The value list after `key` in a record's alternating `key (values)` list; undefined when absent. */
function field(rec: RdrNode | undefined, key: string): RdrNode[] | undefined {
  if (!Array.isArray(rec)) return undefined;
  for (let i = 0; i + 1 < rec.length; i += 2) if (rec[i] === key) { const v = rec[i + 1]; return Array.isArray(v) ? v : [v!]; }
  return undefined;
}
const num = (n: RdrNode | undefined, d = 0): number => { const v = typeof n === 'string' ? Number(n) : NaN; return Number.isFinite(v) ? v : d; };
const str = (rec: RdrNode | undefined, key: string): string | null => { const v = field(rec, key)?.[0]; return typeof v === 'string' ? v : null; };
const one = (rec: RdrNode | undefined, key: string, d = 0): number => num(field(rec, key)?.[0], d);
const two = (rec: RdrNode | undefined, key: string): [number, number] => { const v = field(rec, key); return [num(v?.[0]), num(v?.[1])]; };
const twoOrNull = (rec: RdrNode | undefined, key: string): [number, number] | null => (field(rec, key) ? two(rec, key) : null);

function rect(rec: RdrNode | undefined): SkbRect | null {
  if (!rec) return null;
  const [x, y] = two(rec, 'Pos'), [w, h] = two(rec, 'Size');
  return { x, y, w, h };
}

function textProps(rec: RdrNode[] | undefined): SkbTextProps | null {
  if (!rec) return null;
  const [x, y] = two(rec, 'POSITION');
  const c = field(rec, 'COLOR');
  return { x, y, scale: one(rec, 'SCALE', 1), color: [num(c?.[0], 128), num(c?.[1], 128), num(c?.[2], 128)], font: str(rec, 'FONT') };
}

function pieces(list: RdrNode[] | undefined): SkbPiece[] {
  if (!list) return [];
  return list.slice(0, 10).map((p) => {
    const src = field(p, 'Source'), dst = field(p, 'Display');
    return { texture: str(src, 'Texture') ?? '', src: rect(src)!, dst: rect(dst)! };
  });
}

function keyProps(list: RdrNode[] | undefined): SkbKeyProps[] {
  return (list ?? []).filter(Array.isArray).map((k) => {
    const spec = field(k, 'ButtonSpec');
    const [x, y] = two(k, 'Pos');
    return {
      key: skbCell(String(field(k, 'Key')?.[0] ?? '')), x, y, size: twoOrNull(k, 'Size'),
      pressed: str(spec, 'PRESSED'), active: str(spec, 'ACTIVE'), buttonSize: twoOrNull(spec, 'SIZE'),
    };
  });
}

/** One `SoftKeyboards` record (`FUN_003963f0`). */
export function readSoftKeyboard(rec: RdrNode): SkbLayout {
  const grid = (field(rec, 'Grid') ?? []).map((row) => (Array.isArray(row) ? row : [row]).map((c) => skbCell(typeof c === 'string' ? c : '')));
  return {
    name: str(rec, 'Name') ?? '',
    background: str(rec, 'Background'),
    shiftBackground: str(rec, 'ShiftBackground'),
    pieces: [pieces(field(rec, 'BackgroundPieces')), pieces(field(rec, 'ShiftBgPieces')), pieces(field(rec, 'TwoEditsBgPieces')), pieces(field(rec, 'TwoEditsShiftBgPieces'))],
    twoEditsGrowUp: one(rec, 'TwoEditsGrowUp'),
    startGridPos: two(rec, 'StartGridPos'),
    skbPos: two(rec, 'SkbPos'),
    skbWidth: one(rec, 'SkbWidth'),
    skbHeight: one(rec, 'SkbHeight'),
    userStringWidth: one(rec, 'UserStringWidth'),
    userStringLineHeight: one(rec, 'UserStringLineHeight'),
    cursorY: one(rec, 'CursorY'),
    cursorY2nd: one(rec, 'CursorY2nd'),
    cursorSize: two(rec, 'CursorSize'),
    userString: textProps(field(rec, 'UserStringProps')),
    purposeString: textProps(field(rec, 'PurposeStringProps')),
    msgPlayerString: textProps(field(rec, 'MsgPlayerStringProps')),
    indicators: {
      capsLock: rect(field(rec, 'CapsLockOn')), shift: rect(field(rec, 'ShiftOn')), legend: rect(field(rec, 'LegendOn')),
      usbKbdOn: rect(field(rec, 'UsbKbdOn')), usbKbdMode: rect(field(rec, 'UsbKbdMode')),
    },
    scaleUpSec: one(rec, 'ScaleUpSec', 0.25),
    scaleDownSec: one(rec, 'ScaleDownSec', 0.25),
    switchTargets: (field(rec, 'SwitchTargets') ?? []).filter((t): t is string => typeof t === 'string'),
    grid,
    keyProps: keyProps(field(rec, 'KeyProps')),
    ignoreUnchangedString: field(rec, 'IgnoreUnchangedString') !== undefined,
  };
}

/** The whole file: the root wraps one record (`parseRdr`'s list around it). */
export function readSoftKeyboards(root: RdrNode): SoftKeyboardParams {
  let rec: RdrNode | undefined = root;
  while (Array.isArray(rec) && rec.length === 1 && Array.isArray(rec[0])) rec = rec[0];
  const c = field(rec, 'CommonSoftKeyboardProps');
  const legend = field(c, 'Legend');
  const common: SkbCommon = {
    repeatDelay: one(c, 'RepeatDelay'), repeatSpeedStart: one(c, 'RepeatSpeedStart'), repeatSpeedEnd: one(c, 'RepeatSpeedEnd'),
    repeatAccelTime: one(c, 'RepeatAccelTime'),
    sounds: SKB_SOUND_KEYS.map((k) => str(c, k) ?? ''),
    usbKbdOnIcon: str(c, 'UsbKbdOnIcon'),
    legend: { texture: str(legend, 'Texture'), size: two(legend, 'Size'), slideInSec: one(legend, 'SlideInSec'), slideOutSec: one(legend, 'SlideOutSec') },
    backgroundsOpacity: one(c, 'BackgroundsOpacity', 1),
  };
  const layouts = (field(rec, 'SoftKeyboards') ?? []).filter(Array.isArray).map(readSoftKeyboard);
  return { common, layouts };
}

/** The layout of a name, ignoring case (`FUN_00198b80`), the first in load order; an empty name is `KEYBOARD`. */
export function findSoftKeyboard(layouts: readonly SkbLayout[], name: string): SkbLayout | null {
  const want = uiCommandFold(name === '' ? SKB_DEFAULT_LAYOUT : name);
  return layouts.find((l) => uiCommandFold(l.name) === want) ?? null;
}
