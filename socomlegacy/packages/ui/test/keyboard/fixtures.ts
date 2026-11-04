import type { RdrNode } from '@s2u/archive';

/**
 * A synthetic `UiParams.rdr` for the soft keyboard's tests (PLAT-17; web research 119 §1-§2): the shape the disc's file
 * has -- `CommonSoftKeyboardProps`, then `SoftKeyboards` -- with two name layouts in the English / accent pair the disc
 * holds (`CREATEPLAYERNAME`'s grid as research 119 §2's rows describe it, the start key (1,7) and the 310 px field) and
 * one chat layout with MsgPlayer and Action2 (`ChatSkb`'s row 7). Values are the US disc's where research 119 names
 * them; no disc bytes.
 */

const LETTER_ROWS: string[][] = [
  ['~', '!', '@', '#', '$', '%', '^', '&', '*', 'ParenL', 'ParenR', '_', '+', 'BackSpace', 'BackSpace'],
  ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', '[', ']'],
  ['CapsLock', 'CapsLock', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '\\', 'Enter', 'Enter'],
  ['CapsLock', 'CapsLock', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', 'Quote1', 'Enter', 'Enter'],
  ['Shift', 'Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', '/', 'Exit', 'Exit'],
];

export const NAME_GRID: string[][] = [
  ...LETTER_ROWS,
  ['Switch1', 'Switch1', 'null', 'null', '{', '}', ':', '34', '<', '>', '?', '|', '|', 'Exit', 'Exit'],
  ['Switch1', 'Switch1', ...Array<string>(11).fill('Space'), 'Legend', 'Legend'],
];

export const ACCENT_GRID: string[][] = [
  NAME_GRID[0]!,
  ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '8364', '161', '[', ']'],
  ['CapsLock', 'CapsLock', 'Ä', 'À', 'Á', 'Â', 'Ã', 'Å', 'Æ', 'Ë', 'È', 'É', 'Ê', 'Enter', 'Enter'],
  ['CapsLock', 'CapsLock', 'Ï', 'Ì', 'Í', 'Î', 'Ñ', 'Ö', 'Ò', 'Ó', 'Ô', 'Õ', 'Ø', 'Enter', 'Enter'],
  ['Shift', 'Shift', '352', 'Ü', 'Ù', 'Ú', 'Û', '376', 'Ç', 'ß', '¿', '«', 'null', 'Exit', 'Exit'],
  ['Switch1', 'Switch1', 'null', 'null', '»', '8222', 'º', ',', '.', ';', ':', 'Quote1', 'null', 'Exit', 'Exit'],
  NAME_GRID[6]!,
];

export const CHAT_GRID: string[][] = [
  ...LETTER_ROWS,
  ['Switch1', 'Switch1', 'Recip', 'Recip', '{', '}', ':', '34', '<', '>', '?', '|', '|', 'Exit', 'Exit'],
  ['Switch1', 'Switch1', ...Array<string>(9).fill('Space'), 'MsgPlayer', 'Action2', 'Legend', 'Legend'],
];

const button = (w: number, h: number): RdrNode[] => ['PRESSED', ['SkbDepress.tif'], 'ACTIVE', ['SkbHighlight.tif'], 'SIZE', [String(w), String(h)]];

/** One `KeyProps` record per distinct key of the grid but the empty one, at a made-up place (28 px a column). */
function keyProps(grid: string[][]): RdrNode[] {
  const out: RdrNode[] = [];
  const seen = new Set<string>();
  grid.forEach((row, r) => row.forEach((k, c) => {
    if (k === 'null' || seen.has(k)) return;
    seen.add(k);
    out.push(['Key', [k], 'Pos', [String(12 + 28 * c), String(61 + 23 * r)], 'ButtonSpec', button(26, 22)]);
  }));
  return out;
}

const textProps = (x: number, y: number): RdrNode[] => ['POSITION', [String(x), String(y)], 'SCALE', ['1'], 'COLOR', ['128', '128', '128'], 'FONT', ['font_text_01']];

const indicators: RdrNode[] = [
  'CapsLockOn', ['Pos', ['12', '108'], 'Size', ['54', '45']],
  'ShiftOn', ['Pos', ['12', '155'], 'Size', ['69', '33']],
  'LegendOn', ['Pos', ['381', '190'], 'Size', ['69', '33']],
];

export function nameLayout(name: string, grid: string[][], twin: string, width = '310', bg: [string, string] = ['Skbbg_LC.tif', 'Skbbg.tif']): RdrNode[] {
  return [
    'Name', [name], 'Background', [bg[0]], 'ShiftBackground', [bg[1]],
    'Grid', grid, 'KeyProps', keyProps(grid),
    'StartGridPos', ['1', '7'], 'SkbPos', ['15', '200'], 'SkbHeight', ['230'], 'SkbWidth', ['460'], 'UserStringWidth', [width],
    'UserStringProps', textProps(15, 55), 'CursorY', ['30'], 'CursorSize', ['5', '18'], 'PurposeStringProps', textProps(15, 24),
    'ScaleUpSec', ['0.2'], 'ScaleDownSec', ['0.2'], 'IgnoreUnchangedString', [],
    ...indicators, 'SwitchTargets', [twin],
  ];
}

const piece = (sy: number, sh: number, dy: number, dh: number): RdrNode[] =>
  ['Source', ['Texture', ['SKB_English_Set.tif'], 'Pos', ['0', String(sy)], 'Size', ['512', String(sh)]], 'Display', ['Pos', ['0', String(dy)], 'Size', ['460', String(dh)]]];

export function chatLayout(name = 'ChatSkb', twin = 'ChatSkb2'): RdrNode[] {
  return [
    'Name', [name], 'SkbPos', ['15', '207'],
    'BackgroundPieces', [piece(255, 32, -32, 32), piece(0, 64, -6, 64), piece(320, 192, 58, 175)],
    'ShiftBgPieces', [piece(255, 32, -32, 32), piece(0, 64, -6, 64), piece(64, 192, 58, 175)],
    'TwoEditsBgPieces', [piece(255, 32, -64, 32), piece(288, 32, -32, 32), piece(0, 64, -6, 64), piece(320, 192, 58, 175)],
    'TwoEditsShiftBgPieces', [piece(255, 32, -64, 32), piece(288, 32, -32, 32), piece(0, 64, -6, 64), piece(64, 192, 58, 175)],
    'Grid', CHAT_GRID, 'KeyProps', keyProps(CHAT_GRID),
    'StartGridPos', ['1', '7'], 'SkbWidth', ['460'], 'UserStringWidth', ['400'], 'UserStringLineHeight', ['26'], 'TwoEditsGrowUp', ['32'],
    'CursorY', ['5'], 'CursorY2nd', ['-28'], 'CursorSize', ['5', '18'],
    'UserStringProps', textProps(15, 27), 'PurposeStringProps', textProps(15, -7), 'MsgPlayerStringProps', textProps(15, -5),
    'ScaleUpSec', ['0.2'], 'ScaleDownSec', ['0.2'], 'IgnoreUnchangedString', [],
    ...indicators, 'SwitchTargets', [twin],
  ];
}

export const COMMON: RdrNode[] = [
  'RepeatDelay', ['0.25'], 'RepeatSpeedStart', ['5'], 'RepeatAccelTime', ['0.5'], 'RepeatSpeedEnd', ['15'],
  'ScaleUpSound', ['.SLIDE'], 'ScaleDownSound', ['.SLIDE\t'], 'KeyPressSound', ['.SKB_TYPE'], 'KeyPressEnterSound', ['.THUNK'],
  'NavigationSound', ['.SKB_NAV'], 'NegativeSound', ['.NEG'], 'UsbKbdOnIcon', ['SKB_USB_Icon.tif'],
  'Legend', ['Texture', ['SkbLegend.tif'], 'Size', ['170', '230'], 'SlideInSec', ['0.2'], 'SlideOutSec', ['0.2']],
];

/** The synthetic file's root, as `parseRdr` returns one: a list wrapping the record. */
export function uiParams(layouts: RdrNode[][] = [
  nameLayout('CREATEPLAYERNAME', NAME_GRID, 'CREATEPLAYERNAME2'),
  nameLayout('CREATEPLAYERNAME2', ACCENT_GRID, 'CREATEPLAYERNAME', '310', ['SkbEuro_LC.tif', 'SkbEuro.tif']),
  chatLayout(),
]): RdrNode {
  return [['CommonSoftKeyboardProps', COMMON, 'SoftKeyboards', layouts]];
}

/** A `GetTextInput` command's 0xAC bytes (research 119 §4's block), as `RUN/UIZANIM.ZAR` stores one. */
export interface BlockFields {
  uiVarIndex: number; purpose: string; msgTitle?: number; action2Title?: number; skb: string; uiVar2?: string;
  maxBytes: number; maxChars: number; maxBytes2?: number; maxChars2?: number; noDQuote?: boolean; allowEmpty?: boolean;
}

export function textInputBlock(f: BlockFields): Uint8Array {
  const b = new Uint8Array(0xac);
  const dv = new DataView(b.buffer);
  b[0] = 1; b[1] = 1;
  dv.setUint16(8, f.uiVarIndex, true);
  const str = (at: number, s: string, max: number) => { for (let i = 0; i < s.length && i < max - 1; i++) b[at + i] = s.charCodeAt(i); };
  str(0x10, f.purpose, 64);
  dv.setInt32(0x50, f.msgTitle ?? -1, true);
  dv.setInt32(0x54, f.action2Title ?? -1, true);
  str(0x58, f.skb, 32);
  str(0x78, f.uiVar2 ?? '', 32);
  dv.setInt32(0x98, f.maxBytes, true);
  dv.setInt32(0x9c, f.maxChars, true);
  dv.setInt32(0xa0, f.maxBytes2 ?? 0, true);
  dv.setInt32(0xa4, f.maxChars2 ?? 0, true);
  b[0xa8] = f.noDQuote ? 1 : 0;
  b[0xa9] = f.allowEmpty ? 1 : 0;
  return b;
}
