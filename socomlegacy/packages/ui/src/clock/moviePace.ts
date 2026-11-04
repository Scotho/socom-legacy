import type { Rate } from './uiClock';

/**
 * The movie pacing hand-off (PLAT-12; web research 110 §5): which picture of a movie a UI tick presents. PLAT-19b's
 * player and PLAT-21's "present at the stream rate" ask this on each tick of the `UiClock`.
 *
 * What the original does (research 121 §9, R121.9): each tick of the background player (`FUN_00366940`) or the movie
 * state presents exactly one picture, and the PTS pace nothing -- the TIMESTAMP callback only sets a flag no code
 * reads (D:L208419). At the 29.97 Hz tick a 30 fps stream (PTS step 3000) plays 0.1 % slow, a 29.97 fps one (step 3003)
 * at its own rate. `pts` pacing, which the original does not use, is kept for comparison and for a tick at another rate.
 */

/** The MPEG system clock the PTS count in (ISO/IEC 13818-1): 90 kHz. */
export const PTS_CLOCK_HZ = 90000;
/**
 * One picture a tick, the PTS unread (R121.9; research 121's `MOVIE_PICTURE_PERIOD_READING` is the tick's period).
 * [reading] Read from the decoder's per-tick call and the flag nothing reads; not measured against a console capture
 * beyond SONY448's 10.34 s for 310 pictures (research 121 §9).
 */
export const MOVIE_PACE_READING = 'one-per-tick' as const;

export type MoviePace = 'one-per-tick' | 'pts';

export interface MoviePaceOptions {
  pace: MoviePace;
  /** The UI tick's rate (`UI_TICK_RATE`). */
  tickRate: Rate;
  /** The stream's PTS step in 90 kHz units: 3000 for 30 fps, 3003 for 29.97 (research 98 §7.3, 121 §9). */
  ptsStep: number;
}

/** A picture's PTS in seconds from the first picture's. */
export function ptsSeconds(picture: number, ptsStep: number): number { return picture * ptsStep / PTS_CLOCK_HZ; }

/**
 * The picture due on tick `tick` of a movie (0 = its first presenting tick). `one-per-tick`: the tick's index. `pts`:
 * the last picture whose PTS is at or before the tick's time, in integers: floor(tick x den x 90000 / (num x step)).
 */
export function pictureForTick(tick: number, o: MoviePaceOptions): number {
  if (o.pace === 'one-per-tick') return tick;
  return Math.floor((tick * o.tickRate.den * PTS_CLOCK_HZ) / (o.tickRate.num * o.ptsStep));
}

/**
 * A movie's pacing, one call a UI tick: the picture to present this tick, or null to present none (the last stays; what
 * the frame shows then is research 121's `MOVIE_HOLD_READING`). With `pictures` given, past the last picture every tick
 * is null and `ended` is set (the player's end handling -- the event, the loop -- is PLAT-21's, research 121 §2).
 */
export class MoviePacer {
  private n = 0;
  private shown = -1;
  ended = false;

  constructor(private readonly o: MoviePaceOptions & { pictures?: number }) {}

  tick(): number | null {
    const p = pictureForTick(this.n++, this.o);
    if (this.o.pictures !== undefined && p >= this.o.pictures) { this.ended = true; return null; }
    if (p === this.shown) return null;
    this.shown = p;
    return p;
  }

  /** From picture 0 again on the next tick (the loop's restart, `FUN_00309560`, research 121 §5). */
  restart(): void { this.n = 0; this.shown = -1; this.ended = false; }
}
