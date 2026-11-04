/**
 * The USB keyboard while a soft keyboard is up (PLAT-17; web research 119 §10): `FUN_0038c990` pops every pending key
 * (`FUN_002dbd90` D:L180053) and `FUN_0038c630` (D:L283325-283434) acts on each by its HID usage. The keys come from the
 * caller (`packages/viewer/src/softKeyboardKeys.ts` maps the page's `KeyboardEvent.code` to the same usages:
 * `PHYSICAL_TYPING_READING`). `D:L<line>` = a line of `socom2_game.elf.decomp.c`.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** One key of the USB queue: its HID usage, the shift modifier (+4 of the record) and the caps-lock lamp (+0x14). */
export interface UsbKey { readonly hid: number; readonly shift: boolean; readonly capsLamp: boolean }

/** What a key does (`FUN_0038c630`'s branches). */
export type UsbKeyAction =
  /** A character through the insert (`FUN_00399040` -> `FUN_00399ec0`), the letters' case already applied. */
  | { kind: 'char'; code: number }
  | { kind: 'enter' } | { kind: 'escape' } | { kind: 'backspace' } | { kind: 'recip' } | { kind: 'left' } | { kind: 'right' }
  | { kind: 'none' };

/** The digit row, plain and shifted: the u16 tables at 0x3fba50 / 0x3fba80 (read from the ELF), HID 0x1E-0x27. */
const DIGITS = '1234567890', DIGITS_SHIFT = '!@#$%^&*()';
/** HID 0x31-0x38 (0x35 apart), plain and shifted: the tables at 0x3fba20 / 0x3fb9f0 (read from the ELF). 0x32 (non-US #) types `]` / `}`. */
const PUNCT: Readonly<Record<number, [string, string]>> = {
  0x31: ['\\', '|'], 0x32: [']', '}'], 0x33: [';', ':'], 0x34: ['\'', '"'], 0x36: [',', '<'], 0x37: ['.', '>'], 0x38: ['/', '?'],
};
/** The inline pairs (D:L283344-283371, `FUN_0039ad80` D:L292041-292052): grave, `]`, `[`, `=`, `-`. */
const INLINE: Readonly<Record<number, [string, string]>> = { 0x35: ['`', '~'], 0x30: [']', '}'], 0x2f: ['[', '{'], 0x2e: ['=', '+'], 0x2d: ['-', '_'] };
/** The keypad's operators (D:L283376-283387). */
const KEYPAD: Readonly<Record<number, string>> = { 0x54: '/', 0x55: '*', 0x56: '-', 0x57: '+' };

/**
 * SKB_KEYPAD_READING: the keypad's digits and point (HID 0x59-0x63) type only when +0x18 of the USB record is set
 * (D:L283414-283415); `FUN_002dbd90` never writes it, so they type nothing. [reading]
 */
export const SKB_KEYPAD_READING = 'keypad digits type nothing' as const;

const ch = (s: string): UsbKeyAction => ({ kind: 'char', code: s.charCodeAt(0) });

/** `FUN_0038c630`'s answer for one key. */
export function usbKeyAction(k: UsbKey): UsbKeyAction {
  const h = k.hid, sh = k.shift;
  if (h >= 0x04 && h <= 0x1d) {                                                          // FUN_0039ada0 D:L292057-292076
    const lower = h + 0x5d;
    return { kind: 'char', code: sh !== k.capsLamp ? lower - 0x20 : lower };
  }
  if (h >= 0x1e && h <= 0x27) return ch((sh ? DIGITS_SHIFT : DIGITS)[h - 0x1e]!);          // FUN_0039ad20
  if (PUNCT[h]) return ch(PUNCT[h]![sh ? 1 : 0]);                                       // FUN_0039ad50
  if (h >= 0x59 && h <= 0x63) return { kind: 'none' };                                  // SKB_KEYPAD_READING
  if (INLINE[h]) return ch(INLINE[h]![sh ? 1 : 0]);
  if (KEYPAD[h]) return ch(KEYPAD[h]!);
  switch (h) {
    case 0x28: case 0x58: return { kind: 'enter' };
    case 0x29: return { kind: 'escape' };
    case 0x2a: return { kind: 'backspace' };
    case 0x2b: return { kind: 'recip' };
    case 0x2c: return { kind: 'char', code: 0x20 };                                     // FUN_0039ad00
    case 0x4f: return { kind: 'right' };
    case 0x50: return { kind: 'left' };
    default: return { kind: 'none' };
  }
}

/** The HID usages `FUN_0038c630` acts on (the keypad's digits among them, which do nothing): the keys a page routes here. */
export function usbKeyHandled(hid: number): boolean {
  return (hid >= 0x04 && hid <= 0x38) || (hid >= 0x4f && hid <= 0x50) || (hid >= 0x54 && hid <= 0x63);
}
