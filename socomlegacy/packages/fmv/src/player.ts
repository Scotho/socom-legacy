/**
 * The movie player's semantics (PLAT-21; web research 121): the two players the original drives over its one MPEG
 * decoder, transcribed from the retail decompilation (`D:L<line>` = a line of `socom2_game.elf.decomp.c`; the movie
 * state's tick, which has no decompiled body, read off its disassembly by address).
 *
 * - **The background player** (`BackgroundMoviePlayer`): the UI shell's. A dialog whose `BACKGROUND TYPE` is `MPEG` (1)
 *   or `MPEG_LOOPING` (2) opens its movie when it is built; the menu state ticks it once a frame, first thing in
 *   `CMenuState_Tick` (`FUN_00366940`, D:L262866-262900): a picture, or at the stream's end event 3 (ONMPEGEND) to the
 *   current dialog and then a restart (loop) or a close. `BackgroundMPEG` starts, stops or retargets it
 *   (`FUN_00366a00` D:L262903-262943, `FUN_00366b10` D:L262945-262958). Research 121 §2's table, rows 1-16.
 * - **The movie state** (`MovieStatePlayer`): the game state `PlayMPEG` / `PlayMPEGNoFade` push over the menu (init
 *   `FUN_001ed560` D:L51220-51369, tick 0x1ed010-0x1ed558, exit `FUN_001eccf0` D:L51104-51176): full screen, one picture
 *   a tick, skipped by CROSS released (with a 1.0 s fade under `FADE`), closed and popped at its end; it fires no event.
 *
 * The decoder is a parameter (`MoviePictureSource`): "the next picture, or the end". Until PLAT-19b's worker is merged
 * the viewer passes a black source. The pictures go to a `MoviePictureSink` (PLAT-14's movie layer; this player is its
 * only writer). The clock is the caller's (W9.R10): one `tick` per menu frame; `MovieFrameClock` is the stand-in that
 * turns elapsed time into menu frames until PLAT-12's clock is merged.
 *
 * Pure: no DOM, no browser global, no import of `@s2u/ui` -- the command side (`packages/ui/src/movie/`) declares the
 * interface it calls and this player meets it structurally; the viewer joins them (W9.R6).
 */

// ---------------------------------------------------------------------------------------------------------------------
// The picture source and the sink.

/** `next()`'s answer when the stream has no more data: the NODATA callback's `longjmp` (`FUN_0030a940` D:L208398-208406). */
export const MOVIE_END: unique symbol = Symbol('MOVIE_END');
/** `next()`'s answer when the picture is not decoded yet (MOVIE_PICTURE_LATE_READING): the browser's decoder is asynchronous. */
export const MOVIE_PENDING: unique symbol = Symbol('MOVIE_PENDING');
export type MovieNext<P> = P | typeof MOVIE_END | typeof MOVIE_PENDING;

/** The open's fourth argument: the movie's audio stream (`FUN_003098e0(name, 1, blocking, audioStream)`, D:L207783-207818). */
export interface MovieOpenOptions { audioStream: number }

/**
 * The decoder as the players see it -- the global one of research 121 §1. PLAT-19b's worker provides it.
 *
 * - `open`: `FUN_003098e0` -- true when the file opened (a disc file that exists), false otherwise; synchronous, and it
 *   decodes no picture (§7). It (re)starts the stream at picture 0.
 * - `next`: `FUN_00309850` -> `FUN_0030b1d0` (D:L208678-208763) -- the stream's next picture, each exactly once and in
 *   order; `MOVIE_END` on the call after the last one (the NODATA path, D:L208752-208760); `MOVIE_PENDING` when the
 *   next picture is not decoded yet.
 * - `atEnd` (optional): `FUN_001bbab8`, the decoder reporting its end before the call (`FUN_0030b180` D:L208660-208676);
 *   consulted only when the player's end check is `'decoder'` (MOVIE_END_LATENCY_READING).
 * - `restart`: `FUN_00309560` (D:L207664-207698) -- the stream sought back to its start and the decoder made again (no
 *   reopen); the next `next` gives picture 0. Research 121 §5's believed defect (the frame buffers shifted by 5) is not
 *   carried: the restart is the clean seek.
 * - `close`: `FUN_003096f0` (D:L207712-207731).
 */
export interface MoviePictureSource<P> {
  open(name: string, options: MovieOpenOptions): boolean;
  next(): MovieNext<P>;
  atEnd?(): boolean;
  restart(): void;
  close(): void;
}

/** Where a picture goes: the upload into the frame being drawn (`FUN_0030b740`, D:L208733-208746) -- PLAT-14's movie layer. */
export interface MoviePictureSink<P> { present(picture: P): void }

// ---------------------------------------------------------------------------------------------------------------------
// Readings (research 121 §14).

/**
 * MOVIE_PICTURE_PERIOD_READING: the time between two presented pictures. Each tick presents one picture and the PTS do
 * not pace it (the TIMESTAMP callback only sets `DAT_00451db0`, which nothing reads; D:L208419); the menu's frame is
 * capped at 30/s (`DAT_003e1400` = 0x1e, `FUN_003aff30` D:L304746-304749), two NTSC fields: 1001/30000 s when a frame
 * fits in two fields. Busy frames that overrun are not modelled. [reading]
 */
export const MOVIE_PICTURE_PERIOD_READING = 1001 / 30000;

/**
 * MOVIE_END_LATENCY_READING: which end check comes first after the last picture -- the NODATA path (one tick with no
 * picture, then the event's tick; research 121 rows 6, 8) or the decoder's own end (`FUN_001bbab8`, row 7, one tick
 * sooner). Not settled; the NODATA path is the reading. [reading]
 */
export const MOVIE_END_LATENCY_READING: MovieEndCheck = 'nodata';
export type MovieEndCheck = 'nodata' | 'decoder';

/**
 * MOVIE_HOLD_READING: what the movie layer shows on a frame with no new picture, and before the first. The player never
 * clears the frame buffer (§7) and the menu's own clear was not read. Reading: the layer keeps its last picture, black
 * before any -- so the player writes the sink only when it has a picture, and never clears it. [reading]
 */
export const MOVIE_HOLD_READING = 'keep-last' as const;

/**
 * MOVIE_SETTLE_READING: the pause before a pushed movie opens, while `FUN_001ed560` waits for the sound system to drain
 * (D:L51237-51255), not timed. Reading: none -- the movie opens at once (seconds). [reading]
 */
export const MOVIE_SETTLE_READING = 0;

/**
 * MOVIE_SKIP_CARRY_READING: whether the release of the CROSS that opened a `PlayMPEG` dialog skips its movie. The movie
 * state reads CROSS's release from its first tick with no guard (§6), and the menu binding's edge byte (+0x704) for the
 * extras' bindings was not read. Reading: that release does not skip -- a release counts only after a press seen by the
 * state itself (`PAD_STATE.PRESSED`). [reading]
 */
export const MOVIE_SKIP_CARRY_READING = 'pressed-in-state' as const;

/**
 * MOVIE_PICTURE_LATE_READING: what a tick does when the picture is not decoded yet. The original cannot meet it: it
 * retries `sceMpegGetPicture` until it has one, stalling the frame (D:L208692-208699). The browser decodes in a worker
 * and cannot stall the page, so the tick presents nothing and the player's state does not move: the picture comes on a
 * later tick, the stream slowed rather than skipped, as on the console. [reading]
 */
export const MOVIE_PICTURE_LATE_READING = 'hold-tick' as const;

// ---------------------------------------------------------------------------------------------------------------------
// The background player.

/** Research 121 §2's states: NONE (has-movie 0), STOPPED (has-movie 1, playing 0), PLAYING, ENDED (playing, the source ended). */
export type BackgroundMovieState = 'NONE' | 'STOPPED' | 'PLAYING' | 'ENDED';

/** A dialog's `BACKGROUND` (`DialogDesign.background` of `@s2u/ui`): `TYPE` 0 IMAGE, 1 MPEG, 2 MPEG_LOOPING (D:L277326-277343). */
export interface MovieBackgroundSpec { type: number; filename: string | null }

export interface BackgroundMoviePlayerOptions<P> {
  source: MoviePictureSource<P>;
  sink: MoviePictureSink<P>;
  /**
   * Event 3 to the shell's **current** dialog: `FUN_00367810(shell, 3, 0)` (D:L263357-263396), which starts every
   * ONMPEGEND binding of the dialog in record order (`@s2u/ui`'s `deliverMpegEnd`).
   */
  onEnd: () => void;
  /** MOVIE_END_LATENCY_READING by default. */
  endCheck?: MovieEndCheck;
}

/** The shell's player: its fields at the shell's +0x278 playing, +0x279 has-movie, +0x27a loop, +0x27c the name. */
export class BackgroundMoviePlayer<P> {
  private hasMovie = false;
  private playing = false;
  private ended = false;
  /**
   * Counts the opens and unloads: the end tick compares it across its event so that a handler which built the next
   * dialog (a new movie opened, or none) is not followed by a close or restart of that dialog's movie. Not a field of
   * the shell's; the console never needs it (its switch is queued, `FUN_0027e720`).
   */
  private generation = 0;
  /** +0x27a. */
  loop = false;
  /** +0x27c: the file the next `on()` opens. */
  name: string | null = null;
  private readonly source: MoviePictureSource<P>;
  private readonly sink: MoviePictureSink<P>;
  private readonly onEnd: () => void;
  private readonly endCheck: MovieEndCheck;

  constructor(opts: BackgroundMoviePlayerOptions<P>) {
    this.source = opts.source;
    this.sink = opts.sink;
    this.onEnd = opts.onEnd;
    this.endCheck = opts.endCheck ?? MOVIE_END_LATENCY_READING;
  }

  get state(): BackgroundMovieState {
    if (!this.hasMovie) return 'NONE';
    if (!this.playing) return 'STOPPED';
    return this.ended ? 'ENDED' : 'PLAYING';
  }

  /** `FUN_003098e0(name, 1, 0, 0)`: the background opens with audio stream 0 and non-blocking (D:L263759, D:L262938). */
  private open(): boolean {
    this.generation++;
    this.ended = false;                                   // the create clears the ended mark (FUN_0030b4d0 D:L208776)
    this.playing = this.name !== null && this.source.open(this.name, { audioStream: 0 });
    return this.playing;
  }

  private close(): void {
    this.source.close();
    this.ended = false;
  }

  /** Row 2, the dialog left: `FUN_00369210`'s movie part (D:L264407-264422) -- a playing movie closed, has-movie cleared. */
  unload(): void {
    this.generation++;
    if (this.hasMovie && this.playing) this.close();
    this.playing = false;
    this.hasMovie = false;
  }

  /**
   * Rows 3-4's movie part, after the build's ONSTART (D:L263745-263764): with `MPEG` or `MPEG_LOOPING`, the name stored,
   * has-movie set, the loop flag from the type, the file opened; then -- whatever the type -- a dialog with a movie that
   * is not playing gets event 3 at once (D:L263762-263764). Call `unload` first (the build does, D:L263450).
   */
  load(background: MovieBackgroundSpec | null): void {
    const type = background?.type ?? 0;
    if (type === 1 || type === 2) {
      this.name = background!.filename;
      this.hasMovie = true;
      this.loop = type === 2;
      this.open();
    }
    if (this.hasMovie && !this.playing) this.onEnd();
  }

  /** The dialog build in its order (`FUN_00367950`): unload (D:L263450), ONSTART (D:L263733, the caller's), the movie (`load`). */
  build(background: MovieBackgroundSpec | null, onStart?: () => void): void {
    this.unload();
    onStart?.();
    this.load(background);
  }

  /**
   * One tick (`FUN_00366940`): nothing unless it has a movie and plays (rows 1, 10); when not ended, one picture
   * presented -- or, on the call after the last, the end marked (rows 5-6); when ended, event 3, then the restart (loop)
   * or the close (rows 8-9). Answers whether it still plays (the function's return, unused by its caller).
   */
  tick(): boolean {
    if (!this.hasMovie || !this.playing) return this.playing;
    const ended = this.ended || (this.endCheck === 'decoder' && (this.source.atEnd?.() ?? false));
    if (!ended) {
      const next = this.source.next();
      if (next === MOVIE_END) this.ended = true;          // D:L208752-208760: no picture this tick
      else if (next !== MOVIE_PENDING) this.sink.present(next);
      return this.playing;
    }
    const generation = this.generation;
    this.onEnd();                                         // D:L262888
    // The event's handler built another dialog, opened another movie or stopped this one: the tick's close or restart
    // belongs to the movie that ended, not to what replaced it (unreachable on the console: SWITCHMENU is queued).
    if (generation !== this.generation || !this.hasMovie || !this.playing) return this.playing;
    if (!this.loop) {                                     // D:L262889-262892
      this.playing = false;
      this.close();
    } else {                                              // D:L262894-262895: FUN_00309560 answers 1
      this.source.restart();
      this.ended = false;
      this.playing = true;
    }
    return this.playing;
  }

  /**
   * `BackgroundMPEG ON` / `<file>` (`FUN_00366a00`, rows 13-15): with no movie, false; else a playing movie closed, the
   * name replaced when one is given, and the stored name opened from its start. A failed open fires no event.
   */
  on(file?: string): boolean {
    if (!this.hasMovie) return false;                     // D:L262914
    if (this.playing) { this.close(); this.playing = false; }
    if (file !== undefined) this.name = file;             // D:L262924-262935
    return this.open();
  }

  /** `BackgroundMPEG OFF` (`FUN_00366b10`, rows 11-12): a playing movie closed, true; otherwise nothing, false. No event. */
  off(): boolean {
    if (!this.hasMovie || !this.playing) return false;
    this.close();
    this.playing = false;
    return true;
  }

  /** Row 16: the menu state's return from a pushed state (`FUN_001f45e0` D:L54766-54776) restarts it from picture 0. */
  statePop(): boolean { return this.on(); }
}

// ---------------------------------------------------------------------------------------------------------------------
// The movie state.

/** `FUN_002d9ff0`'s button states (D:L179128-179186): 0 up, 1 pressed this frame, 2 held, 3 released this frame. */
export const PAD_STATE = { UP: 0, PRESSED: 1, HELD: 2, RELEASED: 3 } as const;
export type PadState = (typeof PAD_STATE)[keyof typeof PAD_STATE];
/** The pad as the movie state reads it: CROSS's slot (slot 9, `FUN_002da930` D:L179844-179845). Null: no pad object (`DAT_0044f108`). */
export interface MovieStatePad { cross: PadState }

/** The skip timer's start, 1.1 s (the f32 0x3F8CCCCD stored at 0x1ed080-0x1ed088). */
export const MOVIE_SKIP_TIMER = Math.fround(1.1);
/** The fade's hold at black, 0.1 s (the f32 0x3DCCCCCD compared at 0x1ed0ac-0x1ed0bc). */
export const MOVIE_STATE_FADE_HOLD = Math.fround(0.1);

/** What `PlayMPEG` / `PlayMPEGNoFade` put in the state's record that the player uses (`FUN_001eda60`; research 121 §3). */
export interface MovieStateRequest { file: string; fade: boolean; audioStream: number }

export interface MovieStatePlayerOptions<P> {
  source: MoviePictureSource<P>;
  sink: MoviePictureSink<P>;
  /** `FUN_003b1760(alpha, 0, 0, 0)` (D:L305410-305426): the output's alpha over black, 1.0 = 255 (none faded). */
  setAlpha: (alpha: number) => void;
  /** The state's pop (`FUN_002cf2f0(0x4084c0, 0)`, 0x1ed160-0x1ed16c): the menu state resumes (`FUN_001f45e0`). */
  onPop: () => void;
  /** MOVIE_END_LATENCY_READING by default: the tick's end check is `FUN_003096c0` (0x1ed144), as the background's is. */
  endCheck?: MovieEndCheck;
}

export interface MovieStateTick {
  /** The state closed its movie and popped this tick. */
  popped: boolean;
  /** False on the state's first flip, which is not presented (`DAT_00408c00`, 0x1ed4d4-0x1ed4e8; research 121 §7). */
  flipShown: boolean;
}

/** The movie state's player (the object at 0x4086f4: +8 playing, +0x24 the skip timer, +0x28 FADE, +0x60 the movie clock). */
export class MovieStatePlayer<P> {
  private playing = false;
  private ended = false;
  private fade = true;
  private timer = -1;
  private frames = 0;
  private crossPressed = false;
  /** +0x60: the time the movie has run (0x1ed180-0x1ed18c). */
  clock = 0;
  /** Whether a movie state is running (between `init` and its pop). */
  active = false;
  private readonly source: MoviePictureSource<P>;
  private readonly sink: MoviePictureSink<P>;
  private readonly setAlpha: (alpha: number) => void;
  private readonly onPop: () => void;
  private readonly endCheck: MovieEndCheck;

  constructor(opts: MovieStatePlayerOptions<P>) {
    this.source = opts.source;
    this.sink = opts.sink;
    this.setAlpha = opts.setAlpha;
    this.onPop = opts.onPop;
    this.endCheck = opts.endCheck ?? MOVIE_END_LATENCY_READING;
  }

  /**
   * `FUN_001ed560`: the sounds stopped and settled (MOVIE_SETTLE_READING: no wait), the display left alone (no front-end
   * `PlayMPEG` says `INGAME`, research 121 §3), the movie opened non-blocking with the command's audio stream
   * (D:L51362); +8 is "playing"; the skip timer -1.
   */
  init(req: MovieStateRequest): void {
    this.fade = req.fade;
    this.timer = -1;
    this.frames = 0;
    this.clock = 0;
    this.crossPressed = false;
    this.ended = false;
    this.active = true;
    this.playing = this.source.open(req.file, { audioStream: req.audioStream });
  }

  /**
   * One tick (0x1ed010): the skip (CROSS released, no fade running: the timer to 1.1 s), the fade (the timer less the
   * frame time; at or above 0.1 alpha t - 0.1 with `FADE`, else alpha 0 and -- below 0, or without `FADE` -- the state
   * stops), then: not playing or ended -> close and pop; else the movie clock advanced and one picture presented.
   */
  tick(dt: number, pad: MovieStatePad | null): MovieStateTick {
    if (!this.active) return { popped: false, flipShown: true };
    const flipShown = this.frames > 0;
    this.frames++;
    if (pad?.cross === PAD_STATE.PRESSED) this.crossPressed = true;
    if (pad && pad.cross === PAD_STATE.RELEASED && this.crossPressed && this.timer < 0) this.timer = MOVIE_SKIP_TIMER;   // 0x1ed04c-0x1ed088
    if (this.timer > 0) {                                                  // 0x1ed090-0x1ed0a0
      const t = Math.fround(this.timer - dt);                              // 0x1ed0a8
      this.timer = t;
      let stop = false;
      if (t < MOVIE_STATE_FADE_HOLD || !this.fade) {                       // 0x1ed0bc-0x1ed0e4: alpha 0
        this.setAlpha(0);
        stop = t < 0 || !this.fade;                                        // 0x1ed0ec-0x1ed108
      } else {
        this.setAlpha(Math.fround(t - MOVIE_STATE_FADE_HOLD));             // 0x1ed120-0x1ed12c
      }
      if (stop) { this.timer = -1; this.playing = false; }                 // 0x1ed110-0x1ed11c
    }
    const ended = this.ended || (this.endCheck === 'decoder' && (this.source.atEnd?.() ?? false));
    if (!this.playing || ended) {                                          // 0x1ed138-0x1ed174: +8, then FUN_003096c0 at 0x1ed144
      this.source.close();
      this.playing = false;
      this.active = false;
      this.onPop();
      return { popped: true, flipShown };
    }
    this.clock += dt;
    const next = this.source.next();                                       // 0x1ed190
    if (next === MOVIE_END) this.ended = true;
    else if (next !== MOVIE_PENDING) this.sink.present(next);
    return { popped: false, flipShown };
  }

  /** `FUN_001eccf0`'s output part: the alpha back to 1.0 (`FUN_003b1760(1.0, 0, 0, 0)`). */
  exit(): void { this.setAlpha(1); }
}

// ---------------------------------------------------------------------------------------------------------------------
// The black source (the picture source until PLAT-19b).

/** A black picture: its index in the stream. PLAT-19b's decoded picture replaces it. */
export interface BlackPicture { index: number; black: true }

/**
 * The disc movies' picture counts (research 121 §11: the picture start codes of the video stream), by the lower-case
 * path the dialogs name them with.
 */
export const MOVIE_PICTURE_COUNTS: Readonly<Record<string, number>> = {
  'run/movies/common/sony448.pss': 310,
  'run/movies/common/menuloop.pss': 3732,
  'run/movies/intro_2.pss': 3836,
};

/**
 * BLACK_SOURCE_UNKNOWN_COUNT_PLACEHOLDER: the picture count the black source gives a movie research 121 §11 did not
 * count (the extras' `PlayMPEG` files, the AOP cinematics, the credits): it ends at once. PLAT-19b's decoder gives the
 * real stream. [placeholder]
 */
export const BLACK_SOURCE_UNKNOWN_COUNT_PLACEHOLDER = 0;

/** A disc path as the counts key it: lower case, forward slashes, no leading slash. */
const movieKey = (name: string): string => name.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();

/**
 * The stand-in for PLAT-19b's decoder: `count` black pictures, then the end. `exists` says whether a file is on the disc
 * (the open fails otherwise, as `FUN_003098e0`'s does: `Tut_11` and `Tut_12`, research 96 §3.5); absent, every name opens.
 */
export class BlackPictureSource implements MoviePictureSource<BlackPicture> {
  private count = 0;
  private at = 0;
  constructor(
    private readonly counts: Readonly<Record<string, number>> = MOVIE_PICTURE_COUNTS,
    private readonly exists?: (name: string) => boolean,
  ) {}
  open(name: string, _options: MovieOpenOptions): boolean {
    if (this.exists && !this.exists(name)) return false;
    this.count = this.counts[movieKey(name)] ?? BLACK_SOURCE_UNKNOWN_COUNT_PLACEHOLDER;
    this.at = 0;
    return true;
  }
  next(): MovieNext<BlackPicture> { return this.at < this.count ? { index: this.at++, black: true } : MOVIE_END; }
  restart(): void { this.at = 0; }
  close(): void { this.count = 0; this.at = 0; }
}

// ---------------------------------------------------------------------------------------------------------------------
// The clock stand-in.

/**
 * MOVIE_CLOCK_CATCHUP_READING: the most menu frames one `advance` runs. The console runs one movie tick a frame
 * (`CMenuState_Tick` calls it once, 0x1f4660, and ends in the flip, 0x1f4820); the flip's cap (`FUN_003aff30`,
 * D:L304746-304749) only waits more fields while a frame is short of 1/30 s and never runs a second tick, so an overrun
 * frame is late and its time is not caught up -- structural, no line states a late-frame rule. A page's gap (a hidden
 * tab, a slow frame) must not run a minute of movie and its end event inside one animation frame. Reading: two -- one
 * late display frame caught up, the rest of a longer gap (anything over about 100 ms, a GC pause included) dropped for
 * good. With PLAT-20's sound the pictures would then fall behind the audio after each stall: PLAT-12 / PLAT-20 must
 * pace the movie by the audio clock, not by this stand-in. PLAT-12's clock replaces it. [reading]
 */
export const MOVIE_CLOCK_CATCHUP_READING = 2;

/**
 * Elapsed time to menu frames, one frame per `period` (MOVIE_PICTURE_PERIOD_READING): the stand-in for PLAT-12's
 * front-end clock (W9.R10), replaced when that is merged. `advance(dt)` answers how many frames fall due, at most
 * `maxFrames` (MOVIE_CLOCK_CATCHUP_READING): past it the time is dropped and the clock starts again from that call.
 */
export class MovieFrameClock {
  private time = 0;
  private done = 0;
  constructor(readonly period: number = MOVIE_PICTURE_PERIOD_READING, readonly maxFrames: number = MOVIE_CLOCK_CATCHUP_READING) {}
  advance(dt: number): number {
    this.time += dt;
    const due = Math.floor(this.time / this.period) - this.done;
    if (due > this.maxFrames) {
      this.time = 0;
      this.done = 0;
      return this.maxFrames;
    }
    this.done += due;
    return due;
  }
}
