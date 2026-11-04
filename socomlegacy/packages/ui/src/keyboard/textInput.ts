/**
 * `GetTextInput`'s arguments (PLAT-17; web research 119 §4-§5): row 18 of PLAT-08's table (`0x2808d0`, a tail jump to
 * `FUN_0038d770`). Its twelve script keys are compiled once (`FUN_00395f40` D:L289094-289176) into the command's own
 * 0xAC bytes, which `RUN/UIZANIM.ZAR` stores (all 30 on the US disc are 172 bytes); `FUN_00397640`
 * (D:L289863-289923) reads them at the open. `D:L<line>` = a line of `socom2_game.elf.decomp.c`.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The command's size: the 0xAC block. */
export const TEXT_INPUT_BLOCK_SIZE = 0xac;

/** The name `UiVar` compares with, ignoring case, for the running script's argument (0x3fb788, D:L289874). */
export const SKB_ARGUMENT_VAR = '$1';

/** What `FUN_00397640` stores when a title name is longer than 127 bytes (0x3fb790, 0x3fb7c0; read from the ELF). */
export const SKB_TITLE_TOO_LONG = { msgPlayer: 'MsgPlayer title too long!', action2: 'Action2 title too long!' } as const;

export interface TextInputRequest {
  /** +0x08, a name index: the variable the text is written to (`$1`: the running script's argument). */
  uiVar: string;
  /** +0x10, 64 bytes: the title line (a `UIMnLOC` key such as `_455_EnterPlayerName_MSG`). */
  purpose: string;
  /** +0x50 / +0x54, name indexes (-1: none, the empty string): the titles in message mode and in Action2 mode. */
  msgPlayerTitle: string;
  action2Title: string;
  /** +0x58, 32 bytes: the layout's name (empty: `KEYBOARD`). */
  skbName: string;
  /** +0x78, 32 bytes: the variable the recipient edit writes. */
  uiVar2: string;
  /** +0x98 / +0x9c: the main text's caps in bytes and in characters (0: none); +0xa0 / +0xa4 the recipient's. */
  maxBytes: number;
  maxChars: number;
  maxBytes2: number;
  maxChars2: number;
  /** +0xa8: `"` types `'`. */
  noDQuote: boolean;
  /** +0xa9: ENTER on an empty or blank text applies. */
  allowEmpty: boolean;
}

function cstr(b: Uint8Array, at: number, max: number): string {
  let s = '';
  for (let i = at; i < at + max && i < b.length && b[i] !== 0; i++) s += String.fromCharCode(b[i]!);
  return s;
}

/**
 * The request from the command's bytes; `name(i)` is the running animation's name table (`FUN_0026ed60`), null past
 * its end. A block shorter than 0xAC reads zeros past its end.
 */
export function decodeTextInput(bytes: Uint8Array, name: (index: number) => string | null): TextInputRequest {
  const b = new Uint8Array(TEXT_INPUT_BLOCK_SIZE);
  b.set(bytes.subarray(0, TEXT_INPUT_BLOCK_SIZE));
  const dv = new DataView(b.buffer);
  const title = (at: number, long: string): string => {
    const i = dv.getInt32(at, true);
    const n = i < 0 ? null : name(i);
    if (n === null) return '';
    return n.length > 0x7f ? long : n;
  };
  return {
    uiVar: name(dv.getUint16(8, true)) ?? '',
    purpose: cstr(b, 0x10, 0x40),
    msgPlayerTitle: title(0x50, SKB_TITLE_TOO_LONG.msgPlayer),
    action2Title: title(0x54, SKB_TITLE_TOO_LONG.action2),
    skbName: cstr(b, 0x58, 0x20),
    uiVar2: cstr(b, 0x78, 0x20),
    maxBytes: dv.getInt32(0x98, true),
    maxChars: dv.getInt32(0x9c, true),
    maxBytes2: dv.getInt32(0xa0, true),
    maxChars2: dv.getInt32(0xa4, true),
    noDQuote: b[0xa8] !== 0,
    allowEmpty: b[0xa9] !== 0,
  };
}
