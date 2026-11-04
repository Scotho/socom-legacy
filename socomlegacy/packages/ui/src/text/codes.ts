/**
 * The text's characters as the engine reads them (web research 111 §2). A text node holds bytes; every reader of them
 * -- the draw (`FUN_00362350`, `FUN_003625e0`), the measure (`FUN_00362b70`), the TELETYPE's typing -- takes one
 * character at a time through `FUN_0039f0c0` (the code, D:L294576-294595) and `FUN_0039f160` (its length in bytes,
 * D:L294600-294620):
 *
 * - a byte below 0xC0 is one character, its own code (so the dialogs' single-byte pad glyphs, 0xA6 the cross, stand);
 * - a lead 0xC0-0xDF takes the next byte: `(lead - 0xC0) x 64 + next - 0x80`, two bytes (the next byte is not checked);
 * - a lead 0xE0 or above takes two more: `lead x 0x1000 + (b1 - 0x80) x 64 + (b2 - 0x80)` kept to 16 bits, three
 *   bytes -- unless the next byte is the terminator, when the lead stands alone.
 *
 * This is the code path research 103 §2 and `@s2u/scene`'s `UIMNLOC_UTF8_READING` did not find; it agrees with
 * `decodeLocText` on every two-byte sequence with a lead 0xC2-0xDF, and differs on a lead 0xC0/0xC1 or 0xE0 and above
 * (none in the disc's LOC tables: research 111 §2, pinned by the dev-disc test).
 *
 * The functions here take a string of byte-valued characters, as `parseRdr` returns a caption.
 */

/** `FUN_0039f0c0` + `FUN_0039f160` over a byte string: each character's code, in order. */
export function engineCodes(bytes: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < bytes.length;) {
    const b = bytes.charCodeAt(i) & 0xff;
    const b1 = i + 1 < bytes.length ? bytes.charCodeAt(i + 1) & 0xff : 0;
    const b2 = i + 2 < bytes.length ? bytes.charCodeAt(i + 2) & 0xff : 0;
    if (b < 0xc0) { out.push(b); i += 1; }
    else if (b < 0xe0) { out.push((b1 + (b - 0xc0) * 0x40 - 0x80) & 0xffff); i += 2; }
    else if (b1 !== 0) { out.push((b * 0x1000 + (b1 - 0x80) * 0x40 + (b2 - 0x80)) & 0xffff); i += 3; }
    else { out.push(b); i += 1; }
  }
  return out;
}

/** A string whose characters are already codes (a `LocService` text, decoded at load): its codes as they stand. */
export function decodedCodes(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) out.push(text.charCodeAt(i));
  return out;
}

/**
 * LOC_TEXT_BYTES_READING: a table string's bytes, from the decoded text `LocService` holds -- a character below 0x80 as
 * its byte, one from 0x80 to 0x7FF as the two-byte sequence `decodeLocText` read it from, any other as its low byte.
 * `decodeLocText` also leaves a lone byte 0x80-0xBF as it stands, which this would re-encode as two; the five front-end
 * tables hold none (the dev-disc test round-trips every table string), so on the disc the bytes are the table's own.
 * The engine's setters that walk bytes (WRAPPEDTEXT's `FUN_00379f70`) take these.
 */
export const LOC_TEXT_BYTES_READING = 'decoded table text back to bytes: below 0x80 as is, 0x80-0x7FF as two-byte UTF-8; exact on the disc';

/** A decoded table string back to its bytes, as a byte string (one character a byte): `LOC_TEXT_BYTES_READING`. */
export function locTextBytes(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) out += text[i];
    else if (c < 0x800) out += String.fromCharCode(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else out += String.fromCharCode(c & 0xff);
  }
  return out;
}

/** Codes back to a string (one character a code), for reading a line in a test or a log. */
export const codesText = (codes: readonly number[]): string => String.fromCharCode(...codes);
