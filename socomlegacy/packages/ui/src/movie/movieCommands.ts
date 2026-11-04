import { DIALOG_EVENTS, type DialogBinding } from '../dialog';
import type { ZAnimRuntime, ZAnimUiCommand } from '../zanimRuntime';

/**
 * The movie's command side (PLAT-21; web research 121 §§3-4): the interface the movie commands call, their entries in
 * the global command table at 0x3dd4d0, and the delivery of ONMPEGEND (event 3) to the current dialog.
 *
 * `@s2u/ui` does not import `@s2u/fmv` (W9.R6): this module declares the movie it calls (`MovieService`) and the viewer
 * passes `@s2u/fmv`'s players in (`packages/viewer/src/moviePlayerHost.ts`). The entries are typed against PLAT-07's
 * host (`ZAnimHost.uiCommand`'s `ZAnimUiCommand` and its done answer); the table's binding is PLAT-08's (W9.R4).
 *
 * `PlayMovie` is not a command: the table holds no such row. It is the name of an animation in `dlgArtGal2`,
 * `dlgMakeMusicMovie` and `dlgPlayTutMovies`, which calls `PlayMPEG` (research 121 §3, R121.12).
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

// ---------------------------------------------------------------------------------------------------------------------
// The movie the commands call.

/** The dialog's background movie (`@s2u/fmv`'s `BackgroundMoviePlayer` meets it): `FUN_00366a00` and `FUN_00366b10`. */
export interface MovieBackgroundControl {
  /** `ON` (no file: the stored name) or `<file>` (retarget): the movie from picture 0; false when it did not open or the dialog has no MPEG background. */
  on(file?: string): boolean;
  /** `OFF`: a playing movie closed (no event); false when none played. */
  off(): boolean;
}

/** What a movie command queues: the movie state's record (`FUN_001eda60` and the copies at D:L124628-124641). */
export interface MoviePlayRequest {
  /** The file (`names[+8]`), or with `subtitleIndex` the key into `mpeg_subtitles.rdr` that gives it. */
  file: string;
  /** `FADE` (+0x10): the skip fades out over 1.0 s. */
  fade: boolean;
  /** `INGAME` (+0x11): the display block of `FUN_001ed560`; no front-end movie sets it. */
  ingame: boolean;
  /** `INTERLACE` (+0x12). */
  interlace: boolean;
  /** `INDEX` (+0x40): `file` is a subtitle key (`FUN_001eda60`'s fourth argument). */
  subtitleIndex: boolean;
  /** The audio stream (`DAT_00408720`), resolved at the call. */
  audioStream: number;
  /** `DEST_RECT` given (+0x1c). */
  destRect: boolean;
  /** `BILINEAR` (+0x1d). */
  bilinear: boolean;
  /** `SOURCE_RECT` and `DEST_RECT`'s words (+0x20..+0x3c), as the record copies them; not interpreted (no front-end movie uses them). */
  rectWords: number[];
}

/** The movie side the commands call; the viewer fills it with `@s2u/fmv`'s players. */
export interface MovieService {
  readonly background: MovieBackgroundControl;
  /** Queue the movie state's push (`FUN_002cf380(0x4084c0, 0x4086f4, 0)`): the menu is suspended under it until it pops. */
  play(request: MoviePlayRequest): void;
}

// ---------------------------------------------------------------------------------------------------------------------
// The rows.

/** The movie rows of the table at 0x3dd4d0 (`readBindingTable`; research 121 §3): row, id, function, record parser (0 none). */
export const MOVIE_COMMAND_ROWS = [
  { row: 22, id: 23, name: 'PlayMPEG', fn: 0x27ab30, parse: 0x27ad60 },
  { row: 133, id: 134, name: 'PlayMPEGNoFade', fn: 0x27aa70, parse: 0 },
  { row: 135, id: 136, name: 'BackgroundMPEG', fn: 0x27a420, parse: 0 },
] as const;
export type MovieCommandName = (typeof MOVIE_COMMAND_ROWS)[number]['name'];

/**
 * PLAYMPEG_GATE_READING: when `PlayMPEG` / `PlayMPEGNoFade` do nothing. Both play when the object `DAT_00440c38`
 * (`FUN_002b3580`) is absent or its byte +0xe1 has bit 0x10 set; otherwise they answer done without playing
 * (D:L124617-124618, 0x27aa80-0x27aaa4). The object is not identified. Reading: the gate is open in the front end. [reading]
 */
export const PLAYMPEG_GATE_READING = 'open' as const;

/**
 * PLAYMPEG_RECORD_INITIAL_PLACEHOLDER: the movie state's record fields `PlayMPEGNoFade` does not write (it writes the
 * name, fade and index only) before any `PlayMPEG` has written them -- the statics at 0x40871d-0x408750 and
 * `DAT_00408720`, whose initial values were not read off the ELF. Zero / false stands in. No script on the disc names
 * `PlayMPEGNoFade` (research 121 §3), so nothing on the disc reaches it. [placeholder]
 */
export const PLAYMPEG_RECORD_INITIAL_PLACEHOLDER = { ingame: false, interlace: false, audioStream: 0, destRect: false, bilinear: false } as const;

// ---------------------------------------------------------------------------------------------------------------------
// The record.

/** `AUDIOSTREAM` as `FUN_0027ad60` stores it (+0x14 kind, +0x18): 0 a number, 1 `VALVE <name>`, 2 `UIVAR <name>` (name indexes). */
export type MovieAudioStreamSpec = { kind: 'number'; value: number } | { kind: 'valve' | 'uivar'; nameIndex: number };

/** A `PlayMPEG` command's record as `FUN_0027ad60` (D:L124676-124759) writes it into the command's 0x44 bytes. */
export interface PlayMpegRecord extends Omit<MoviePlayRequest, 'audioStream'> { audioStream: MovieAudioStreamSpec }

/** Read `PlayMPEG`'s record out of the command's bytes (header included); a byte past the end reads 0. */
export function decodePlayMpeg(cmd: ZAnimUiCommand): PlayMpegRecord {
  const b = cmd.bytes, v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u8 = (o: number): number => (o < b.length ? b[o]! : 0);
  const u32 = (o: number): number => (o + 4 <= b.length ? v.getUint32(o, true) : 0);
  const kind = u32(0x14);
  const audioStream: MovieAudioStreamSpec = kind === 1 || kind === 2
    ? { kind: kind === 1 ? 'valve' : 'uivar', nameIndex: u32(0x18) }
    : { kind: 'number', value: u32(0x18) | 0 };
  const rectWords: number[] = [];
  for (let o = 0x20; o < 0x40; o += 4) rectWords.push(u32(o));
  return {
    file: cmd.arg, fade: u8(0x10) !== 0, ingame: u8(0x11) !== 0, interlace: u8(0x12) !== 0, subtitleIndex: u8(0x40) !== 0,
    audioStream, destRect: u8(0x1c) !== 0, bilinear: u8(0x1d) !== 0, rectWords,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The entries.

export interface MovieCommandsOptions {
  /** The context's input string (`FUN_00272480(ctx + 0x18, 0)`), which `BackgroundMPEG INPUT_STRING` takes. */
  inputString?: () => string | null;
  /** The play gate (PLAYMPEG_GATE_READING): true lets `PlayMPEG` / `PlayMPEGNoFade` play. */
  gate?: () => boolean;
  /** A valve's (`FUN_00351ef0`, its u16 at +4) or UI variable's (`FUN_00385900`, an int) value by the command's name index; undefined when not found. */
  resolveAudioStream?: (kind: 'valve' | 'uivar', nameIndex: number, cmd: ZAnimUiCommand) => number | undefined;
}

/** A command entry: PLAT-07's `ZAnimHost.uiCommand` answer -- done (true) or held for the next frame (false). */
export type MovieCommandEntry = (cmd: ZAnimUiCommand) => boolean;

/** The three movie entries over a `MovieService`. Each two-call flag is its own (`DAT_00414ea0`, `DAT_00414ea8`). */
export class MovieCommands {
  private playFlag = false;
  private noFadeFlag = false;
  /** The movie state's record as the commands last wrote it (it is one static record, 0x4086f4). */
  private record: Omit<MoviePlayRequest, 'file' | 'fade' | 'subtitleIndex'> = { ...PLAYMPEG_RECORD_INITIAL_PLACEHOLDER, rectWords: new Array<number>(8).fill(0) };

  constructor(private readonly movie: MovieService, private readonly opts: MovieCommandsOptions = {}) {}

  private gateOpen(): boolean { return this.opts.gate ? this.opts.gate() : PLAYMPEG_GATE_READING === 'open'; }

  /**
   * `BackgroundMPEG` (`FUN_0027a420`): `INPUT_STRING` replaced by the context's input string; then `ON` -> start the
   * stored name, `OFF` -> stop, anything else -> start that file (`strcmp`, so case-sensitive). Always done.
   */
  BackgroundMPEG = (cmd: ZAnimUiCommand): boolean => {
    let arg: string | null = cmd.arg;
    if (arg === 'INPUT_STRING') arg = this.opts.inputString?.() ?? null;
    if (arg === null || arg === 'ON') this.movie.background.on();
    else if (arg === 'OFF') this.movie.background.off();
    else this.movie.background.on(arg);
    return true;
  };

  /**
   * `PlayMPEG` (`FUN_0027ab30`): past the gate, a two-call command -- the first call writes the movie state's record
   * from the command's, queues the state's push and is not done; the next is done (D:L124619-124671).
   */
  PlayMPEG = (cmd: ZAnimUiCommand): boolean => {
    if (!this.gateOpen()) return true;
    const was = this.playFlag;
    this.playFlag = !was;
    if (was) return true;
    const r = decodePlayMpeg(cmd);
    let audioStream = this.record.audioStream;
    if (r.audioStream.kind === 'number') audioStream = r.audioStream.value;
    else audioStream = this.opts.resolveAudioStream?.(r.audioStream.kind, r.audioStream.nameIndex, cmd) ?? audioStream;
    this.record = { ingame: r.ingame, interlace: r.interlace, audioStream, destRect: r.destRect, bilinear: r.bilinear, rectWords: r.rectWords };
    this.movie.play({ file: r.file, fade: r.fade, subtitleIndex: r.subtitleIndex, ...this.record, rectWords: [...this.record.rectWords] });
    return false;
  };

  /** `PlayMPEGNoFade` (0x27aa70-0x27ab28): the same gate and shape on its own flag; `FUN_001eda60(record, file, 0, 0)`. */
  PlayMPEGNoFade = (cmd: ZAnimUiCommand): boolean => {
    if (!this.gateOpen()) return true;
    const was = this.noFadeFlag;
    this.noFadeFlag = !was;
    if (was) return true;
    this.movie.play({ file: cmd.arg, fade: false, subtitleIndex: false, ...this.record, rectWords: [...this.record.rectWords] });
    return false;
  };

  /** The entries by their table name, for PLAT-08's table (rows 22, 133, 135). */
  entries(): Record<MovieCommandName, MovieCommandEntry> {
    return { PlayMPEG: this.PlayMPEG, PlayMPEGNoFade: this.PlayMPEGNoFade, BackgroundMPEG: this.BackgroundMPEG };
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The end event.

/** Starts a bound animation with its `ARGUMENT` (null for none); true when the animation was found. */
export type DialogEventStarter = (animation: string, argument: string | null) => boolean;

/**
 * `FUN_00367810(shell, code, 0)` (D:L263357-263396): every EVENT binding of the shell's current dialog whose code is
 * `code`, in record order, is looked up by its animation's name and started -- with its own `ARGUMENT` when it has one.
 * None is consumed. True when any was found.
 */
export function deliverDialogEvent(bindings: readonly DialogBinding[], code: number, start: DialogEventStarter): boolean {
  let any = false;
  for (const b of bindings) {
    if (b.kind !== 'event' || b.code !== code || b.animation === null) continue;
    if (start(b.animation, b.argument)) any = true;
  }
  return any;
}

/** Event 3, ONMPEGEND (`FUN_001f3bf0`'s table, D:L54435-54444): what the background player's end fires to the current dialog. */
export const ONMPEGEND = DIALOG_EVENTS.ONMPEGEND!;
export function deliverMpegEnd(bindings: readonly DialogBinding[], start: DialogEventStarter): boolean {
  return deliverDialogEvent(bindings, ONMPEGEND, start);
}

/**
 * A starter over PLAT-07's runtime: the animation found by name (`FUN_0026a250`) and started (`FUN_002734b0`). The
 * runtime carries an instance's first input since research 363 (`ZAnimRuntime.start`'s input, CALL flag 1 copying the
 * caller's), but this starter still drops the binding's `ARGUMENT` (`FUN_00272bb0`'s, node index 0xFA) -- the gap: the
 * switch an ONMPEGEND binding names by its argument (`dlgIntroCinematic`'s `switch_menu dlgSecondCinematic.rdr`) would
 * read no input if it were wired (tests only today).
 */
export function runtimeEventStarter(rt: ZAnimRuntime): DialogEventStarter {
  return (animation) => {
    if (!rt.find(animation)) return false;
    rt.start(animation);
    return true;
  };
}
