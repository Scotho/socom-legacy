import { fmul, toInt } from './f32';
import type { TextFace } from './face';
import { engineCodes } from './codes';
import { measureText } from './layout';

/**
 * WRAPPEDTEXT (and SCROLLINGTEXT, which shares its text setter): the caption split into lines, one text node each, and
 * the lines placed and clipped (web research 111 §5). The setter is `FUN_00379f70` (D:L273409-273555; vtable+0x70 of
 * the classes 0x4072f0 and 0x4079e0), the draw `FUN_003794b0` (D:L273084-273195), the set-up from the spec
 * `FUN_0037a430` (D:L273560-273597: +0xc0 `WIDTH`, +0xbc `SPACING`, +0xc4 `HEIGHT`, +0xd0 `AUTOSCROLL`, +0x240
 * `DISPLAY_ONE_LINE`), the scroll ops `FUN_00379b10` (D:L273272-273303).
 */

/**
 * One line node: its bytes (the node's text, +0x1c), the characters they read as (`engineCodes`, what the draw and the
 * measure take), the colour it was made with, and the `#B` state it starts in (+0x8c).
 */
export interface WrappedLine { bytes: number[]; codes: number[]; color: [number, number, number]; bold: boolean }

/** The wrapped text's spec fields and the text's own. */
export interface WrappedSpec {
  width: number;
  spacing: number;
  height: number;
  autoScroll: boolean;
  displayOneLine: boolean;
  /** The object's `SCALE` (+0x40) and `COLOR` (+0x48). */
  scale: number;
  color: readonly [number, number, number];
}

/**
 * `FUN_00379f70`: the caption into lines. For each line: spaces and breaks are skipped; bytes are appended while the
 * line's measured width is under `WIDTH` or no space has been seen in it; a `\n` ends it (and is not kept); a `#C`
 * with three bytes after it sets the colour of the NEXT line and ends this one (`#Crgb` consumed); `#B` toggles the
 * bright state and stays in the text. A line that reached `WIDTH` after a space is cut back to that space (the cut
 * re-toggles on each `#B` it sees, testing the byte one past each removed one, as the loop does), so a word longer
 * than `WIDTH` overflows rather than breaking. A line's node scales by the object's `SCALE` x the face's `scale`
 * (D:L273487-273492).
 *
 * The loop walks BYTES, not characters: `FUN_00362e00` appends one byte and `FUN_00362b70` re-measures the node after
 * each, reading its bytes through `FUN_0039f0c0` -- so a two-byte character's lead is measured alone first (with the
 * terminator as its next byte: a lead 0xC0-0xDF reads as `(lead - 0xC0) x 64 - 0x80`) and can end the line a
 * character early; the `#C` test `i + 4 < n` counts bytes, and its colour bytes are single signed bytes even at 0xC0
 * and above. `bytes` is the caption as a byte string (one character a byte, as `parseRdr` returns a dialog's literal;
 * a table string's bytes through `locTextBytes`).
 */
export function wrapLines(face: TextFace, bytes: string, spec: Pick<WrappedSpec, 'width' | 'scale' | 'color'>): WrappedLine[] {
  const b: number[] = [];
  for (let k = 0; k < bytes.length; k++) b.push(bytes.charCodeAt(k) & 0xff);
  const n = b.length;
  const scale = fmul(spec.scale, face.scale);
  const lines: WrappedLine[] = [];
  const s8 = (c: number | undefined): number => ((c ?? 0) << 24) >> 24;
  const measure = (line: readonly number[]): number => measureText(face, engineCodes(String.fromCharCode(...line)), scale).width;
  let color: [number, number, number] = [...spec.color];
  let bold = false;
  let i = 0;
  if (n === 0) return lines;
  do {
    const line: number[] = [];
    const lineColor: [number, number, number] = [...color], lineBold = bold;
    let lastSpace = 0, appended = false, width = 0;
    while (i < n && (b[i] === 0x20 || b[i] === 0x0a)) i++;
    let c = b[i];
    do {
      if (i >= n || (spec.width <= width && lastSpace !== 0)) break;
      if (c === 0x20) lastSpace = i;
      if (c === 0x23 && b[i + 1] === 0x43 && i + 4 < n) {
        i += 5;
        color = [s8(b[i - 3]), s8(b[i - 2]), s8(b[i - 1])];
        break;
      }
      if (c === 0x23 && b[i + 1] === 0x42) bold = !bold;
      line.push(c!);
      appended = true;
      width = measure(line);
      i++;
      c = b[i];
    } while (c !== 0x0a);
    if (spec.width <= width && lastSpace > 0) {
      for (; lastSpace < i; i--) {
        if (b[i] === 0x23 && b[i + 1] === 0x42) bold = !bold;
        if (line.length > 1) line.pop();   // `FUN_00362dc0` removes one byte and keeps the first
      }
    }
    if (appended) lines.push({ bytes: line, codes: engineCodes(String.fromCharCode(...line)), color: lineColor, bold: lineBold });
  } while (i < n);
  return lines;
}

/** Where a wrapped text's lines stand: each line's pen, the scissor box, and the arrows. */
export interface WrappedPlacement {
  lines: { index: number; x: number; y: number; drawn: boolean }[];
  /** The scissor while the lines draw, when `HEIGHT` > 0 (`FUN_003b0fa0`; reset to 640 x 448 after). */
  clip: { x0: number; y0: number; x1: number; y1: number } | null;
  /** The rows the lines took (+0x44, which the next draw's scroll reads). */
  rows: number;
  upArrow: boolean;
  downArrow: boolean;
}

/** `DAT_003e0370` = -4: the scissor's rows (D:L273124-273127). */
export const WRAPPED_CLIP_DROP = -4;
/** A line's pen sits 3 rows above its row (`- 3.0`, D:L273138). */
export const WRAPPED_LINE_LIFT = 3;
/** `DAT_004a44c8`: the frame's height, 448 in the front end (`FUN_003b1200` D:L305277). */
export const FRAME_HEIGHT = 448;

/**
 * `FUN_003794b0`: the lines placed from the node's pen (`x`, `y`) with the scroll `scroll` (+0xcc) and the rows the
 * previous draw counted (`prevRows`, +0x44; 0 on the first). Line k's pen is (x, int(y' + row x SPACING - 3)), y' the
 * pen moved by the scroll; with `DISPLAY_ONE_LINE` every line stays on row 0 and the x moves by each line's width. A
 * line draws only when its pen's y is in (0, 448). `widths` are the lines' measured widths (for `DISPLAY_ONE_LINE`).
 *
 * ARROW_VISIBILITY_READING: the up arrow (+0xd8) shows while the scroll is above 0 and there are rows, the down arrow
 * (+0xd4) while the scroll is short of `rows x SPACING - HEIGHT` -- reading the arrow image's vtable+0x18 as hide and
 * +0x1c as show (D:L273169-273190); the image class's two entries were not read.
 */
export function placeWrapped(
  spec: Pick<WrappedSpec, 'width' | 'spacing' | 'height' | 'autoScroll' | 'displayOneLine'>,
  x: number, y: number, widths: readonly number[], scroll = 0, prevRows = 0,
): WrappedPlacement {
  const pitch = spec.spacing;
  let clip: WrappedPlacement['clip'] = null;
  let py = y, px = x;
  if (spec.height > 0) {
    clip = {
      x0: toInt(x), y0: toInt(WRAPPED_CLIP_DROP + (y - pitch)),
      x1: toInt(x + spec.width), y1: toInt(WRAPPED_CLIP_DROP + (y + spec.height - pitch)),
    };
    if (!spec.autoScroll || prevRows * pitch <= spec.height) py = y - scroll;
    else py = y + scroll - (prevRows * pitch - spec.height);
  }
  const lines: WrappedPlacement['lines'] = [];
  let row = 0;
  widths.forEach((w, index) => {
    const ly = toInt(py + row * pitch - WRAPPED_LINE_LIFT);
    lines.push({ index, x: toInt(px), y: ly, drawn: ly > 0 && ly < FRAME_HEIGHT });
    if (spec.displayOneLine) px = px + w;
    else row += 1;   // a line node holds no break, so it takes one row (D:L273143-273151)
  });
  const rows = row;
  const upArrow = !((scroll <= 0 && rows !== 0) || rows === 0);
  const downArrow = scroll < rows * pitch - spec.height;
  return { lines, clip, rows, upArrow, downArrow };
}

/** `FUN_00379b10`: `Scroll_Down` adds a pitch while the scroll is short of `rows x SPACING - HEIGHT`; `Scroll_Up` takes one off while it is above 0. */
export function scrollWrapped(spec: Pick<WrappedSpec, 'spacing' | 'height'>, scroll: number, rows: number, op: 'Scroll_Up' | 'Scroll_Down'): number {
  if (op === 'Scroll_Down') return scroll < rows * spec.spacing - spec.height ? scroll + spec.spacing : scroll;
  return scroll > 0 ? scroll - spec.spacing : scroll;
}
