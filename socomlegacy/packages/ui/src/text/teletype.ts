import { fadd, fmul, fsub, f32, toInt } from './f32';
import type { TextFace } from './face';
import { measureText, type TextMeasure } from './layout';
import { noGlow, stepGlow, type TextGlow } from './states';

/**
 * TELETYPE: a caption typed out (web research 111 §6; research 95 §3.8 read the same functions for the ARMORY's
 * `WepDescription`). The class 0x4078a0: set-up `FUN_00378b00` (D:L272764-272791), setter `FUN_00378a10`
 * (D:L272725-272759), tick `FUN_00377b80` (D:L272245-272532), draw `FUN_00378c00` (D:L272797-272889), ops `FUN_00378460`
 * / `FUN_00378600` (D:L272537-272656: `Continue`, `scroll_up`, `scroll_down`, `finish` -- the block's ops 4-7).
 *
 * The typed text is the node's own text (+0x1c): characters are appended to it one by one, and `\n` where a line
 * breaks; the source caption is held apart (+0xc0) with its length (+0xd0) and the next index (+0xd4). The cursor
 * distance (+0xe8) grows by dt x `INTERVAL` x `SCALE` x the face's scale; a character is appended while the typed
 * width is less than the distance plus the line's start (+0xf0). Time is a parameter: `dt` in seconds, from the
 * caller's clock (PLAT-12's), times `DAT_003e0388` = 1.0 (`TELETYPE_SPEED`; only the unused `SetTtySpeedFactor` writes
 * it, research 95 §3.8).
 */

/** `DAT_003e0388`: the typing speed factor, 1.0 on the retail ELF. */
export const TELETYPE_SPEED = 1;
/** +0xe8 after a line break: 0x3c23d70a. */
export const TELETYPE_BREAK_DISTANCE = f32(0.01);
/** `MAXLENGTH` 0 means 100000 (0x47c35000, D:L272778-272780); also `finish`'s dt (D:L272622). */
export const TELETYPE_NO_LIMIT = 100000;
/** The `ON_TTY_DONE` event the last character raises (`FUN_00367810(.., 0x15, 0)`). */
export const ON_TTY_DONE = 0x15;
/** The cursor: `DAT_003e0398` = 8 wide x S, from `DAT_003e0390` = -5 rows; the scissor's `DAT_003e03a0` = -11. */
export const TELETYPE_CURSOR = { width: 8, drop: -5, clipDrop: -11 } as const;

export interface TeletypeSpec {
  interval: number;
  /** As written; 0 is read as `TELETYPE_NO_LIMIT`. */
  maxLength: number;
  maxHeight: number;
  /** The line pitch (+0xbc). */
  spacing: number;
  /** As written; 0 is read as 1. */
  pulseRate: number;
  noCursor: boolean;
  fadeCursor: boolean;
  /** The object's `SCALE` (+0x40). */
  scale: number;
}

/** The node's running fields. */
export interface TeletypeState {
  /**
   * The caption held (+0xc0), its length (+0xd0) and how far it is typed (+0xd4). An empty caption zeroes the length
   * and the index and leaves the held caption in place (`FUN_00378a10`), so `source` can outrun `length`.
   */
  source: number[];
  length: number;
  index: number;
  /** The typed text, breaks included (+0x1c). */
  typed: number[];
  distance: number;
  lineStart: number;
  pause: number;
  /** The cursor's phase (+0xcc) and alpha (the cursor image's). */
  phase: number;
  cursorAlpha: number;
  /** The scripts' scroll (+0x1a8). */
  scroll: number;
  glow: TextGlow;
}

/** What a tick did: the characters appended, whether it played the type sound, and the events it raised. */
export interface TeletypeTick { appended: number; sound: boolean; events: number[] }

const maxLengthOf = (spec: TeletypeSpec): number => (spec.maxLength === 0 ? TELETYPE_NO_LIMIT : spec.maxLength);
const pulseOf = (spec: TeletypeSpec): number => (spec.pulseRate === 0 ? 1 : spec.pulseRate);

/** `FUN_00378b00`'s state, with no caption. */
export function newTeletype(): TeletypeState {
  return { source: [], length: 0, index: 0, typed: [], distance: 0, lineStart: 0, pause: 0, phase: 0, cursorAlpha: 128, scroll: 0, glow: noGlow() };
}

/**
 * `FUN_00378a10` (D:L272725-272759): the typed text emptied (`FUN_003631f0` with ""); an empty caption then only zeroes
 * the length and the index -- the held caption stays, and the next tick's all-typed branch appends what is left of it
 * past the index in one go (`FUN_00377b80` D:L272281-272309); a caption with text is held, its length taken, and it is
 * typed from its start (the distance, line start, phase and scroll reset).
 */
export function setTeletypeText(t: TeletypeState, codes: readonly number[]): void {
  t.typed = [];
  t.index = 0;
  if (codes.length === 0) { t.length = 0; return; }
  t.source = [...codes];
  t.length = codes.length;
  t.distance = 0; t.lineStart = 0; t.phase = 0; t.scroll = 0;
}

const TWO_PI = f32(6.2831855);

/** The measure the tick and the draw take of the typed text (`FUN_00362b70` with the node's S). */
const measureTyped = (face: TextFace, spec: TeletypeSpec, t: TeletypeState): TextMeasure => measureText(face, t.typed, spec.scale);

/**
 * `FUN_00377b80`: one tick of `dt` seconds. The order, as read:
 * 1. a pause (`#P<n>`) counts down while the cursor pulses (`sin(phase) x 32 + 96`, the phase at `PULSERATE` rad/s);
 * 2. with everything typed the cursor pulses, or with `FADECURSOR` fades as `(1 - phase) x 128` and holds at 0;
 * 3. otherwise the next word (from the index to a space or a break) is measured; if it would carry the current line past
 *    `MAXLENGTH` the index steps back onto the space before it; the cursor's alpha is 128; the distance grows;
 * 4. then either the line breaks (the word did not fit, or the distance passed `MAXLENGTH` on a space of a full line:
 *    a `\n` is appended, the line's width moves from the distance to the line's start, the space is skipped, and the
 *    tick runs again with dt 0 while the distance stays positive), or the source's next character is handled: `\n`
 *    and `#N` break the line (the distance restarts at 0.01), `#P<n>` pauses n seconds, another `#` is dropped, and a
 *    character is appended when the typed width is under the distance plus the line's start -- with the type sound
 *    when dt > 0 and it is not the first character, `ON_TTY_DONE` after the last, then the tick again with dt 0;
 * 5. last, the text's glow (`FUN_00363b30`).
 * `sound` is the caller's `DAT_003e03a8` (on, except during `finish`).
 */
export function tickTeletype(t: TeletypeState, face: TextFace, spec: TeletypeSpec, dt: number, sound = true): TeletypeTick {
  const out: TeletypeTick = { appended: 0, sound: false, events: [] };
  step(t, face, spec, fmul(dt, TELETYPE_SPEED), sound, out);
  return out;
}

function step(t: TeletypeState, face: TextFace, spec: TeletypeSpec, dt: number, sound: boolean, out: TeletypeTick): void {
  const pulse = pulseOf(spec), maxLength = maxLengthOf(spec);
  // The text's glow: no reader raises a TELETYPE's (research 111 §4), so it runs with its flag down.
  const glowTick = (): void => { stepGlow(t.glow, dt); };
  if (t.pause > 0) {
    t.pause = fsub(t.pause, dt);
    t.phase = fadd(t.phase, fmul(dt, pulse));
    if (TWO_PI < t.phase) t.phase = fsub(t.phase, TWO_PI);
    t.cursorAlpha = fadd(fmul(f32(Math.sin(t.phase)), 32), 96);
    glowTick();
    return;
  }
  const m = measureTyped(face, spec, t);
  const len = t.length;
  if (len <= t.index) {
    // What the held caption has past the index (only after an empty caption: else the index stands on its end) is
    // appended at once, then the type sound when the index is past 0 and the sound is on (no dt test here).
    if (t.index < t.source.length) {
      while (t.index < t.source.length) { t.typed.push(t.source[t.index++]!); out.appended += 1; }
      if (t.index > 0 && sound) out.sound = true;
    }
    t.phase = fadd(t.phase, fmul(dt, pulse));
    if (!spec.fadeCursor) {
      if (TWO_PI < t.phase) t.phase = fsub(t.phase, TWO_PI);
      t.cursorAlpha = fadd(fmul(f32(Math.sin(t.phase)), 32), 96);
    } else {
      if (1 < t.phase) t.phase = 1;
      t.cursorAlpha = fmul(fsub(1, t.phase), 128);
    }
    glowTick();
    return;
  }
  const before = t.distance;
  let wordTooLong = false;
  if (dt > 0 || (t.index > 0 && t.source[t.index - 1] === 0x20)) {
    const word: number[] = [];
    for (let j = t.index; j < len && t.source[j] !== 0x20 && t.source[j] !== 0x0a; j++) word.push(t.source[j]!);
    // A scratch text node: its scale the object's x the face's, its own face scale applied again by the measure.
    const w = measureText(face, word, fmul(spec.scale, face.scale)).width;
    wordTooLong = maxLength < fadd(w, m.lastLine);
    if (wordTooLong) t.index -= 1;
  }
  t.cursorAlpha = 128;
  t.distance = fadd(t.distance, fmul(fmul(fmul(dt, spec.interval), spec.scale), face.scale));
  const breakLine = (): void => {
    t.typed.push(0x0a);
    t.lineStart = fadd(t.lineStart, m.lastLine);
    t.distance = fsub(t.distance, m.lastLine);
    t.index += 1;
    if (t.distance < 0) t.distance = 0;
    else step(t, face, spec, 0, sound, out);
  };
  const normal = !(maxLength < t.distance) || t.source[t.index] !== 0x20 || m.lastLine <= maxLength;
  if (!normal || wordTooLong) {
    breakLine();
    glowTick();
    return;
  }
  const c = t.source[t.index];
  const lineBreak = (): void => { t.typed.push(0x0a); t.lineStart = m.width; t.distance = TELETYPE_BREAK_DISTANCE; t.index += 1; };
  if (c === 0x0a) lineBreak();
  else if (c === 0x23) {
    t.index += 1;
    const d = t.source[t.index];
    if (d === 0x4e) lineBreak();
    else if (d === 0x50) {
      t.index += 1;
      let digits = '';
      while (t.index < len && t.source[t.index] !== 0x20) digits += String.fromCharCode(t.source[t.index++]!);
      t.index += 1;
      t.pause = f32(Number.parseFloat(digits) || 0);   // atof (`FUN_00191478`), to float (`FUN_001a12d8`)
    }
  } else if (m.width < fadd(t.distance, t.lineStart)) {
    if (t.index < len) {
      if (dt > 0 && t.index > 0 && sound) out.sound = true;
      t.typed.push(c!);
      t.index += 1;
      out.appended += 1;
      if (t.index === len) out.events.push(ON_TTY_DONE);
      step(t, face, spec, 0, sound, out);
    } else if (fadd(before, t.lineStart) <= m.width) out.events.push(ON_TTY_DONE);
  }
  glowTick();
}

/**
 * The ops (`FUN_00378600`): `Continue` ends a pause; `scroll_up` / `scroll_down` move the scripts' scroll once all is
 * typed (`scroll_up` adds one while the lines past it overflow `MAXHEIGHT`, `scroll_down` takes one off while it is
 * above 0); `finish` ticks with dt 100000 and the sound off until everything is typed. Returns the op's truth value.
 */
export function teletypeOp(t: TeletypeState, face: TextFace, spec: TeletypeSpec, op: 'Continue' | 'scroll_up' | 'scroll_down' | 'finish'): { result: boolean; events: number[] } {
  const events: number[] = [];
  if (op === 'finish') {
    while (t.index < t.length) events.push(...tickTeletype(t, face, spec, TELETYPE_NO_LIMIT, false).events);
    // Then the base handler `FUN_0036fcc0`, which knows no `finish`: its answer is the op's (not modelled: false).
    return { result: false, events };
  }
  if (op === 'Continue') { t.pause = 0; return { result: true, events }; }
  if (t.index < t.length) return { result: false, events };
  if (op === 'scroll_down') { if (t.scroll >= 1) t.scroll -= 1; return { result: false, events }; }
  const m = measureTyped(face, spec, t);
  if ((m.breaks - t.scroll) * spec.spacing > spec.maxHeight) t.scroll += 1;
  return { result: false, events };
}

/** What a TELETYPE draws: the typed text from `skip` on, laid out with the pitch `SPACING`, and the cursor. */
export interface TeletypeDraw {
  /** The typed codes from the first shown line (+0x6c). */
  codes: number[];
  /** The scissor while `scroll` is not 0: (0, 0) to (pen.x + MAXLENGTH, -11 + pen.y + MAXHEIGHT). */
  clip: { x1: number; y1: number } | null;
  /**
   * The cursor's box (`FUN_003646d0`): from 2 px right of where the text's pen ended (`endX`, the caller's layout's
   * `pen.x`) for 8 x S, from `-5 + pen.y + row x SPACING + 1` up to `-5 + pen.y + row x SPACING - (boty - topy) x S`;
   * null with `NOCURSOR` or when the typed text opens on a space (the guns' " ").
   */
  cursor: { x0: number; x1: number; y0: number; y1: number; alpha: number } | null;
}

/**
 * `FUN_00378c00`: when the breaks x `SPACING` pass `MAXHEIGHT` (> 0), whole lines are skipped from the top until the
 * remaining breaks less the scroll fit; the cursor stands on the last shown line. `pen` is the node's pen, `endX` the
 * x where the caller's layout of `codes` left its pen.
 */
export function teletypeDraw(t: TeletypeState, face: TextFace, spec: TeletypeSpec, pen: { x: number; y: number }, endX?: number): TeletypeDraw {
  const m = measureTyped(face, spec, t);
  const pitch = spec.spacing;
  let rows = m.breaks - t.scroll;
  let skip = 0;
  if (!(spec.maxHeight < 1 || toInt(m.breaks * pitch) <= spec.maxHeight)) {
    while (spec.maxHeight < rows * pitch) {
      while (t.typed[skip++] !== 0x0a && skip < t.typed.length);
      rows -= 1;
    }
  }
  const codes = t.typed.slice(skip);
  const clip = t.scroll !== 0 ? { x1: toInt(pen.x + maxLengthOf(spec)), y1: toInt(TELETYPE_CURSOR.clipDrop + pen.y + spec.maxHeight) } : null;
  let cursor: TeletypeDraw['cursor'] = null;
  if (!spec.noCursor && t.typed.length > 0 && t.typed[0] !== 0x20) {
    const s = fmul(spec.scale, face.scale);
    const x0 = (endX ?? pen.x) + 2;
    const baseRow = TELETYPE_CURSOR.drop + pen.y + (rows + t.scroll) * pitch;
    cursor = { x0, x1: fadd(fmul(TELETYPE_CURSOR.width, s), x0), y0: baseRow + 1, y1: baseRow - (face.boty - face.topy) * spec.scale * face.scale, alpha: t.cursorAlpha };
  }
  return { codes, clip, cursor };
}
