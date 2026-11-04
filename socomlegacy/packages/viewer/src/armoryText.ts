import { findKey, type UiObject } from '@s2u/scene';

/**
 * The ARMORY's two running texts (web sprint 5, S3 part 2; socomlegacy/docs/research/95 §2.4, §2.5, §3.8): the
 * `TELETYPE` that types an item's WEAPON DATA out (`WepDescription`) and the `WRAPPEDTEXT` box of WEAPON TIPS
 * (`WepInstText`). Pure: a caption and the face's pen advance in; the characters shown, the lines, the cursor out.
 * `./armory` steps the typing each frame (and plays its tick), `./armoryLayout` draws the lines.
 *
 * **The TELETYPE** (parsed by `FUN_00382070` L277596, keys L277677-277697; set up by `FUN_00378b00` L272762; ticked by
 * `FUN_00377b80` L272243-272535; drawn by `FUN_00378c00` L272795-272891):
 * - its numbers from the layout: `INTERVAL` (+0xdc, 1330), `MAXLENGTH` (+0xe0, 230 px; 0 means 100000), `MAXHEIGHT`
 *   (+0xe4, 100; default -1, none), `SPACING` (+0xbc, 19), `PULSERATE` (+0xec, 10; 0 means 1), `NOCURSOR` (+0x1a4
 *   cleared), `FADECURSOR` (+0x1a5);
 * - a new caption types from its first character; the cursor's distance (+0xe8) grows by dt x `INTERVAL` x the text's
 *   scale x its parent's (`DAT_003e0388` = 1.0, the only other writer `SetTtySpeedFactor` never called), and a glyph is
 *   appended each time the distance passes the glyph's pen advance -- 1197 px/s at the dialog's scale 0.9;
 * - whole words wrap at `MAXLENGTH` (the word measured before it is typed, L272352-272384: a word that would pass it
 *   starts a line); `\n` and `#N` break a line and `#P<n>` pauses n seconds (L272409-272470; `FUN_00191478`,
 *   `FUN_001a12d8`);
 * - `MAXHEIGHT` scrolls: while the lines' height passes it the first line is skipped (`FUN_00378c00` L272844-272862,
 *   +0x6c; +0x1a8 is the scripts' own scroll_up/scroll_down count, L272634-272646), so the newest lines show. The
 *   dialog's `AUTOSCROLL` is no key of the TELETYPE: its parser (`FUN_00382070` L277677-277697) reads `MAXHEIGHT`,
 *   `PULSERATE`, `SPACING`, `INTERVAL`, `MAXLENGTH`, `NOCURSOR` and `FADECURSOR` alone, so the scroll is `MAXHEIGHT`'s;
 * - each tick that appends a glyph past the first plays menu cue 1 (`FUN_0036a300`, gated by `DAT_003e03a8` = 1 on the
 *   retail ELF): `TELETYPE_TICK_SOUND_READING`;
 * - **the cursor** (`FUN_00378c00`): drawn unless `NOCURSOR`, and only when the caption does not begin with a space (the
 *   guns' " " types nothing and shows none): a quad `DAT_003e0398` = 8 px x the text's scale wide, 2 px right of the
 *   pen, from `DAT_003e0390` = -5 + 1 px under the line to the face's height x the scale above it (the three `DAT_`s
 *   read off the retail ELF on the disc); its alpha 128 while typing, then `sin(phase) x 32 + 96` with the phase at
 *   `PULSERATE` rad/s (`(1 - t) x 128` with `FADECURSOR`).
 *
 * **The WRAPPEDTEXT** (`WepInstText`: `WIDTH` 175, `HEIGHT` 95, `SPACING` 19): the caption's words wrapped to `WIDTH`,
 * a line every `SPACING` rows, the lines that start inside `HEIGHT` drawn (`WRAPPEDTEXT_CLIP_READING`).
 */

/**
 * TELETYPE_DT_UNIT_READING (research 95 §8): the tick's dt in seconds (the zAnim player's) and +0x3c the typed width,
 * so the distance runs at `INTERVAL` x scale px a second; `#P<n>`'s n in seconds. The caller of vtable+0x38 not traced.
 */
export const TELETYPE_DT_UNIT_READING = 'seconds' as const;
/**
 * TELETYPE_TICK_SOUND_READING (research 95 §8): menu cue 1 is `uisounds.rdr`'s TELETYPE sample, `.TYPE` (`HUDUI.bnk` 7;
 * `DAT_0049ea88`'s bank not resolved), one play a frame that appends (the game restarts its cue per tick).
 */
export const TELETYPE_TICK_SOUND_READING = '.TYPE' as const;
/**
 * TELETYPE_CURSOR_READING: the cursor's colour -- the text's own (the object's `COLOR`, else the default), drawn solid;
 * the cursor object (+0x100, set up through vtable+0x20 with 0) was not traced past its alpha and rectangle.
 */
export const TELETYPE_CURSOR_READING = 'text colour' as const;
/**
 * LINE_PITCH_READING: a running text's line pitch is its `SPACING` in frame rows, unscaled (19: five lines in the
 * TELETYPE's `MAXHEIGHT` 100 and in the tips' `HEIGHT` 95); the pitch function (vtable+0x88) not traced.
 */
export const LINE_PITCH_READING = 'SPACING' as const;
/**
 * WRAPPEDTEXT_CLIP_READING: the tips' lines that start inside `HEIGHT` are drawn, the rest dropped (no scroll); the
 * WRAPPEDTEXT class was not read. Every shipped tip fits five lines at 175 px but 1207 (the F2000's, seven).
 */
export const WRAPPEDTEXT_CLIP_READING = 'lines inside HEIGHT' as const;

/** The TELETYPE cursor's constants off the retail ELF (`DAT_003e0398`, `DAT_003e0390`). */
export const CURSOR_WIDTH = 8;
export const CURSOR_DROP = -5;

export interface TeletypeSpec {
  interval: number; maxLength: number; maxHeight: number; spacing: number; pulseRate: number;
  scale: number; cursor: boolean; fadeCursor: boolean;
}

export interface WrappedSpec { width: number; height: number; spacing: number; scale: number }

const numberOf = (o: UiObject, key: string, fallback: number): number => {
  const v = findKey(o.record, key);
  const n = typeof v === 'string' ? Number(v) : Array.isArray(v) && typeof v[0] === 'string' ? Number(v[0]) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const flag = (o: UiObject, key: string): boolean => findKey(o.record, key) !== undefined;

/** A `TELETYPE` object's numbers, with the engine's defaults (`FUN_00378b00`). */
export function teletypeSpec(o: UiObject): TeletypeSpec {
  const maxLength = numberOf(o, 'MAXLENGTH', 0), pulse = numberOf(o, 'PULSERATE', 0);
  return {
    interval: numberOf(o, 'INTERVAL', 0), maxLength: maxLength === 0 ? 100000 : maxLength, maxHeight: numberOf(o, 'MAXHEIGHT', -1),
    spacing: numberOf(o, 'SPACING', 19), pulseRate: pulse === 0 ? 1 : pulse, scale: o.scale ?? 1,
    cursor: !flag(o, 'NOCURSOR'), fadeCursor: flag(o, 'FADECURSOR'),
  };
}

/** A `WRAPPEDTEXT` object's numbers. */
export function wrappedSpec(o: UiObject): WrappedSpec {
  return { width: numberOf(o, 'WIDTH', 640), height: numberOf(o, 'HEIGHT', 448), spacing: numberOf(o, 'SPACING', 19), scale: o.scale ?? 1 };
}

/** One unit of a running text: a character, a line break (`\n`, `#N`), or a pause (`#P<n>`, seconds). */
export type TextUnit = { ch: string } | { br: true } | { pause: number };

/** A caption read as the TELETYPE reads it (`FUN_00377b80` L272409-272470): `\n` and `#N` break, `#P<n>` pauses. */
export function textUnits(text: string): TextUnit[] {
  const out: TextUnit[] = [];
  const chars = [...text.replace(/\r\n?/g, '\n')];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    if (c === '\n') { out.push({ br: true }); continue; }
    if (c === '#' && chars[i + 1] === 'N') { out.push({ br: true }); i++; continue; }
    if (c === '#' && chars[i + 1] === 'P') {
      let j = i + 2, n = '';
      while (j < chars.length && chars[j] !== ' ') n += chars[j++];
      out.push({ pause: Number.parseFloat(n) || 0 });
      i = j;                                                   // the space that ends the number is consumed too
      continue;
    }
    out.push({ ch: c });
  }
  return out;
}

/** A line of a running text: its characters, and the units it spans (a wrap's space belongs to the line it ends). */
export interface TextLine { text: string; from: number; to: number }

/**
 * The units broken into lines as the TELETYPE types them: a word that would carry the pen past `width` starts a new
 * line (the space before it dropped), a break ends one; `advance` is a character's pen advance at the text's scale.
 */
export function breakLines(units: readonly TextUnit[], width: number, advance: (ch: string) => number): TextLine[] {
  const lines: TextLine[] = [];
  let text = '', pen = 0, from = 0;
  const end = (to: number): void => { lines.push({ text, from, to }); text = ''; pen = 0; from = to; };
  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    if ('br' in u) { end(i + 1); continue; }
    if ('pause' in u) continue;
    if (u.ch === ' ' && text !== '') {
      // The next word, measured before it is typed.
      let w = advance(' '), j = i + 1;
      for (; j < units.length; j++) { const n = units[j]!; if (!('ch' in n) || n.ch === ' ') break; w += advance(n.ch); }
      if (pen + w > width && j > i + 1) { end(i + 1); continue; }
    }
    text += u.ch; pen += advance(u.ch);
  }
  if (text !== '' || from < units.length || lines.length === 0) lines.push({ text, from, to: units.length });
  return lines;
}

/** A TELETYPE's run: the caption it types and how far it has got. */
export interface Teletype {
  units: TextUnit[];
  /** The first character is a space: nothing shows and no cursor (the guns' " "). */
  blank: boolean;
  shown: number;
  distance: number;
  pause: number;
  phase: number;
}

/** A new caption (a script's op 1 on the TELETYPE), typed from its first character. */
export function startTeletype(text: string): Teletype {
  const units = textUnits(text);
  return { units, blank: text.length === 0 || text[0] === ' ', shown: 0, distance: 0, pause: 0, phase: 0 };
}

/** Whether every unit is typed. */
export const teletypeDone = (t: Teletype): boolean => t.shown >= t.units.length;

/**
 * One tick of `dt` seconds (`FUN_00377b80`): the distance grows by dt x `INTERVAL` x scale and each glyph whose advance
 * it passes is appended (a break or a pause at once); a pause holds the typing while the cursor pulses. Returns the
 * units appended, and whether this tick's append plays the tick (one past the first character).
 */
export function stepTeletype(t: Teletype, spec: TeletypeSpec, dt: number, advance: (ch: string) => number): { typed: number; tick: boolean } {
  const before = t.shown;
  if (t.pause > 0) {
    t.pause -= dt;
    t.phase = (t.phase + dt * spec.pulseRate) % (2 * Math.PI);
    return { typed: 0, tick: false };
  }
  if (teletypeDone(t)) {
    t.phase = spec.fadeCursor ? Math.min(1, t.phase + dt * spec.pulseRate) : (t.phase + dt * spec.pulseRate) % (2 * Math.PI);
    return { typed: 0, tick: false };
  }
  t.distance += dt * spec.interval * spec.scale;
  while (t.shown < t.units.length) {
    const u = t.units[t.shown]!;
    // A break restarts the distance (+0xe8 = 0.01, L272414-272437) and ends the tick's typing.
    if ('br' in u) { t.shown++; t.distance = 0; continue; }
    if ('pause' in u) { t.shown++; t.pause = u.pause; break; }
    const w = advance(u.ch);
    if (t.distance < w) break;
    t.distance -= w;
    t.shown++;
  }
  if (teletypeDone(t)) t.phase = 0;
  const typed = t.shown - before;
  return { typed, tick: typed > 0 && t.shown > 1 && !t.blank };
}

/** The cursor's alpha on the GS's 0-128 scale: 128 while typing, then the pulse (or the fade). */
export function cursorAlpha(t: Teletype, spec: TeletypeSpec): number {
  if (!teletypeDone(t) && t.pause <= 0) return 128;
  return spec.fadeCursor ? (1 - Math.min(1, t.phase)) * 128 : Math.sin(t.phase) * 32 + 96;
}

/**
 * What a TELETYPE shows: its lines up to the typed unit, the newest kept under `MAXHEIGHT` (the TELETYPE reads no
 * `AUTOSCROLL`: `FUN_00382070` L277677-277697), and the cursor at the end of the last (null when `NOCURSOR` or blank).
 */
export function teletypeLines(t: Teletype, spec: TeletypeSpec, advance: (ch: string) => number): { lines: string[]; cursor: { line: number; pen: number; alpha: number } | null } {
  if (t.blank) return { lines: [], cursor: null };
  const all = breakLines(t.units, spec.maxLength, advance);
  const lines: string[] = [];
  for (const l of all) {
    if (l.from >= t.shown && lines.length > 0) break;
    const upTo = Math.max(0, Math.min(l.to, t.shown) - l.from);
    let s = '', seen = 0;
    for (let i = l.from; i < l.to && seen < upTo; i++, seen++) { const u = t.units[i]!; if ('ch' in u) s += u.ch; }
    lines.push(l.text.startsWith(s) ? s : l.text.slice(0, s.length));
  }
  let first = 0;
  if (spec.maxHeight > 0) while (lines.length - first > 1 && (lines.length - first) * spec.spacing > spec.maxHeight) first++;
  const kept = lines.slice(first);
  const last = kept[kept.length - 1] ?? '';
  let pen = 0;
  for (const ch of last) pen += advance(ch);
  const cursor = spec.cursor ? { line: Math.max(0, kept.length - 1), pen, alpha: cursorAlpha(t, spec) } : null;
  return { lines: kept, cursor };
}

/** A WRAPPEDTEXT's lines: its words wrapped to `WIDTH`, those that start inside `HEIGHT` (`WRAPPEDTEXT_CLIP_READING`). */
export function wrappedLines(text: string, spec: WrappedSpec, advance: (ch: string) => number): string[] {
  if (text.trim() === '') return [];
  const lines = breakLines(textUnits(text), spec.width, advance).map((l) => l.text);
  const fit = Math.max(1, Math.floor(spec.height / spec.spacing));
  return lines.slice(0, fit);
}
