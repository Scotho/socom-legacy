/**
 * The soft keyboard's text rules (PLAT-17; web research 119 §6, §7.2): the UTF-8 it stores, the caps, the case rule and
 * the fit. A text is a list of code points (U+0000..U+FFFF: the encoder writes at most three bytes). `D:L<line>` = a
 * line of `socom2_game.elf.decomp.c`.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** `FUN_0039fd80` (D:L295105): 1 byte below 0x80, 2 below 0x800, else 3. */
export const skbUtf8Bytes = (cp: number): number => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : 3);

export const skbByteLength = (codes: readonly number[]): number => codes.reduce((n, c) => n + skbUtf8Bytes(c), 0);

/**
 * `FUN_00396d40` (D:L289553-289608): the byte length within `MaxBytes` when that is > 0, and the character count
 * (`FUN_0039f160`'s walk) within `MaxChars` when that is > 0.
 */
export function skbWithinCaps(codes: readonly number[], maxBytes: number, maxChars: number): boolean {
  if (maxBytes > 0 && skbByteLength(codes) > maxBytes) return false;
  return !(maxChars > 0 && codes.length > maxChars);
}

/** The grid's capitals lowered at the press (`FUN_0038d200` D:L283815-283831): A-Z and U+00C0-U+00DE but U+00D7 +0x20; U+0160, U+0178. */
export function skbGridCase(cp: number): number {
  if ((cp > 0x40 && cp < 0x5b) || (cp > 0xbf && cp < 0xdf && cp !== 0xd7)) return cp + 0x20;
  if (cp === 0x160) return 0x161;
  if (cp === 0x178) return 0xff;
  return cp;
}

/**
 * `FUN_0039a8d0(cp, raise, 0)` (D:L291840-291981) as the US grids reach it: with `raise`, a-z and U+00E0-U+00FE but
 * U+00F7 -0x20, U+0161 -> U+0160, U+00FF -> U+0178 (the kana branches find nothing outside U+3041-U+30F6); then the
 * narrow mode's full-width forms U+FF01-U+FF5E to ASCII.
 */
export function skbRaise(cp: number, raise: boolean): number {
  let c = cp;
  if (raise) {
    const d = c - 0x20;
    if ((d > 0x40 && d < 0x5b) || (d > 0xbf && d < 0xdf && d !== 0xd7)) c = d;
    else if (c === 0x161) c = 0x160;
    else if (c === 0xff) c = 0x178;
  }
  if (c > 0xff00 && c < 0xff5f) c -= 0xfee0;
  return c;
}

/**
 * SKB_BLANK_READING: `FUN_003996b0` (D:L291028-291074) calls a text blank when no character has bit 8 clear in the
 * ctype table at 0x1d08d1 -- C's white space, 0x09-0x0D and 0x20. The table has 256 entries and the test indexes it by
 * the whole code point: a character past U+00FF reads beyond it, unread; it is taken as not white space. [reading]
 */
export const SKB_BLANK_READING = 'white space 0x09-0x0D and 0x20; past U+00FF not white space' as const;

export function skbBlank(codes: readonly number[]): boolean {
  return codes.every((c) => c === 0x20 || (c >= 0x09 && c <= 0x0d));
}

/**
 * SKB_FIT_READING: `FUN_0039a5b0` (D:L291706-291785) wraps the text at `UserStringWidth` x the font's scale
 * (`FUN_0039ae50`, not transcribed) and refuses it when it takes more lines than the edit has (two on a layout with
 * `UserStringLineHeight`, else one). Read here as: a line takes characters while its measured width stays within the
 * width, breaks after a run of spaces (the spaces stay at the line's end, so the lines joined are the text), and a line
 * with no space to break at that is too wide does not fit. The widths are PLAT-13's face's (`measureText`); with no
 * face (`measure` null) nothing is refused by width and the text is one line. [reading]
 */
export const SKB_FIT_READING = 'greedy, broken after a run of spaces; no measure: one line' as const;

/** The text's lines under `SKB_FIT_READING`, or null when it does not fit in `maxLines`. */
export function skbWrap(codes: readonly number[], width: number, maxLines: number, measure: ((c: readonly number[]) => number) | null): number[][] | null {
  if (!measure) return [codes.slice()];
  const lines: number[][] = [];
  let rest = codes.slice();
  while (rest.length > 0) {
    if (measure(rest) <= width) { lines.push(rest); rest = []; break; }
    let fit = 0;
    while (fit < rest.length && measure(rest.slice(0, fit + 1)) <= width) fit++;
    // The break: after the last space within the fitting part (and the run of spaces that follows it).
    let cut = rest[fit] === 0x20 && fit > 0 ? fit : -1;
    for (let i = fit; cut < 0 && i > 0; i--) if (rest[i - 1] === 0x20) cut = i;
    if (cut < 0) return null;
    while (cut < rest.length && rest[cut] === 0x20) cut++;
    lines.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (lines.length === 0) lines.push([]);
  return lines.length <= maxLines ? lines : null;
}

/** A text's code points (a JS string's; U+FFFF at most, as the encoder writes). */
export const skbCodes = (s: string): number[] => [...s].map((c) => c.codePointAt(0)! & 0xffff);
export const skbString = (codes: readonly number[]): string => String.fromCharCode(...codes);
