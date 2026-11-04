import {
  BackgroundMoviePlayer, MovieStatePlayer,
  type MovieFrameClock, type MoviePictureSink, type MoviePictureSource, type MovieStatePad,
} from '@s2u/fmv';
import type { MoviePlayRequest, MovieService } from '@s2u/ui';

/**
 * The page's movie host (PLAT-21; web research 121): `@s2u/fmv`'s two players -- the dialog background's and the movie
 * state's -- over one picture source (the original's one decoder), handed to `@s2u/ui`'s movie commands as their
 * `MovieService` (W9.R6: the ui package declares the interface, the viewer passes the player in).
 *
 * What the front end connects (PLAT-10's `frontEnd.ts`, W9.R4): the source (PLAT-19b's decoder; `@s2u/fmv`'s
 * `BlackPictureSource` until it merges), the layer (PLAT-14's movie layer: this host's players are its only writer),
 * `onMpegEnd` (the screen manager's `deliverMpegEnd` over the current dialog's bindings), `onStatePop` (the menu state's
 * `ON_STATE_POP` and its two unshown frames, `FUN_001f45e0`), the dialog build's `background.build(design.background,
 * onStart)` and unload, and one `frame` per menu frame (`frames` with the clock stand-in until PLAT-12).
 */

// ---------------------------------------------------------------------------------------------------------------------
// The host.

export interface MoviePlayerHostOptions<P> {
  source: MoviePictureSource<P>;
  layer: MoviePictureSink<P>;
  /** The output alpha over black (1.0 none faded; `FUN_003b1760`): the movie state's skip fade. */
  setAlpha?: (alpha: number) => void;
  /** Event 3 to the current dialog (`deliverMpegEnd(current.bindings, starter)`). */
  onMpegEnd: () => void;
  /** The menu state's return after the pushed movie (after the background's restart): `ON_STATE_POP`, two unshown frames. */
  onStatePop?: () => void;
  /**
   * The push's cover of the state under it, when the queued push applies: CG's push calls the top state's OnCover
   * before the pushed state's Init (`FUN_002ce9e0` D:L171928-171931, after its frame sync `FUN_003b05e0`); for the
   * menu state that is `FUN_00366b10`, the dialog's background movie stopped (0x1f4630). The front end passes the top
   * state's `onCover` (research 115 §16.4).
   */
  onCover?: () => void;
  /**
   * `PlayMPEG INDEX`: the `FILENAME` of a key's record in `mpeg_subtitles.rdr` (`FUN_001eda60`'s fourth argument,
   * D:L51394-51475; research 121 §13), null when the key is not there or its record has no `FILENAME`. Absent = the
   * rdr not loaded (`DAT_00437d08` 0; it is loaded at mission load, D:L152647): every `INDEX` key then opens
   * `MOVIE_INDEX_FALLBACK_NAME`. No front-end `PlayMPEG` says `INDEX`. The subtitles themselves are not drawn here.
   */
  resolveSubtitleKey?: (key: string) => string | null;
}

/**
 * The name `PlayMPEG INDEX` opens when the key gives no file: `FUN_001eda60` starts its result at 0 (`move $s4, $zero`
 * at 0x1edac4, before the rdr test), sets it only from the key's `FILENAME` (0x1edc34, the string 0x3e2110), and at
 * 0x1ede18-0x1ede24 replaces a 0 with the string at 0x3e2140, `INVALID` (read off the ELF) -- for an rdr not loaded, a
 * key not in it, or a record with no `FILENAME` alike (D:L51404-51473; Ghidra's `lVar4 = 0`). The movie state's init
 * opens it (`FUN_003098e0`, D:L51362); no disc file has that name, the open fails, and its first tick closes and pops
 * (0x1ed138, research 121 §1).
 */
export const MOVIE_INDEX_FALLBACK_NAME = 'INVALID';

/** The movie side of the front end: a `MovieService` for the commands, and the per-frame tick of whichever player runs. */
export class MoviePlayerHost<P> implements MovieService {
  readonly background: BackgroundMoviePlayer<P>;
  readonly movieState: MovieStatePlayer<P>;
  private queued: MoviePlayRequest | null = null;
  /** The movie state's pop, asked for by its tick (`FUN_002cf2f0(0x4084c0, 0)`, 0x1ed160) and applied the next frame. */
  private popQueued = false;
  private readonly onStatePop?: () => void;
  private readonly onCover?: () => void;
  private readonly resolveSubtitleKey?: (key: string) => string | null;

  constructor(opts: MoviePlayerHostOptions<P>) {
    this.onStatePop = opts.onStatePop;
    this.onCover = opts.onCover;
    this.resolveSubtitleKey = opts.resolveSubtitleKey;
    this.background = new BackgroundMoviePlayer<P>({ source: opts.source, sink: opts.layer, onEnd: opts.onMpegEnd });
    this.movieState = new MovieStatePlayer<P>({
      source: opts.source, sink: opts.layer, setAlpha: opts.setAlpha ?? (() => {}),
      onPop: () => { this.popQueued = true; },
    });
  }

  /**
   * `PlayMPEG` / `PlayMPEGNoFade`'s push, queued (`FUN_002cf380`): it takes effect on the next frame. With `INDEX` the
   * file is the key's (`resolveSubtitleKey`); with no lookup, or a key that gives no file, it is
   * `MOVIE_INDEX_FALLBACK_NAME`, whose open fails. `INGAME`'s display block, `INTERLACE`, `BILINEAR` and the two rects are
   * not modelled: no front-end movie sets them (research 121 §§3, 13); the movie plays full screen as without them.
   */
  play(request: MoviePlayRequest): void {
    if (request.subtitleIndex) {
      const file = this.resolveSubtitleKey?.(request.file) ?? null;
      request = { ...request, file: file ?? MOVIE_INDEX_FALLBACK_NAME };
    }
    this.queued = request;
  }

  /** Whether the pushed movie state is running (the menu state is suspended under it). */
  get moviePlaying(): boolean { return this.movieState.active || this.queued !== null || this.popQueued; }

  /**
   * One frame, as CG's frame (`FUN_002ce9e0`) runs it: a queued request is applied on a frame that ticks no state (R115.11,
   * D:L171884-171887: the top's tick only with the queue empty) -- the push (the state under it covered first,
   * `onCover`, then the movie state's init; D:L171927-171931) or the movie state's pop (its exit, then the menu state's
   * OnPop: the background's restart and `onStatePop`; D:L171918-171925), both `'movie'`: the menu does not run. Else,
   * with the movie state running, its tick (`'movie'`), whose end asks for the pop; else the background's tick, which
   * comes first in `CMenuState_Tick` (0x1f4660), before the menu's input, update and draw (`'menu'`).
   */
  frame(dt: number, pad: MovieStatePad | null): 'menu' | 'movie' {
    if (this.queued) {
      const q = this.queued;
      this.queued = null;
      this.onCover?.();                                                                  // D:L171928-171931: OnCover, then Init
      this.movieState.init({ file: q.file, fade: q.fade, audioStream: q.audioStream });
      return 'movie';                                                                    // no tick on the push's frame
    }
    if (this.popQueued) {
      this.popQueued = false;
      this.movieState.exit();                                                            // D:L171920: the movie state's exit
      this.background.statePop();                                                        // D:L171925: the menu state's OnPop
      this.onStatePop?.();
      return 'movie';                                                                    // no tick on the pop's frame
    }
    if (this.movieState.active) {
      this.movieState.tick(dt, pad);                                                     // its end asks for the pop (onPop)
      return 'movie';
    }
    this.background.tick();
    return 'menu';
  }

  /** The frames `clock` says fall due in `dt` seconds, each run by `frame` with the clock's period; answers how many ran. */
  frames(clock: MovieFrameClock, dt: number, pad: MovieStatePad | null): number {
    const n = clock.advance(dt);
    for (let i = 0; i < n; i++) this.frame(clock.period, pad);
    return n;
  }
}
